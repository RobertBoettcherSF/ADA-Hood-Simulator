/**
 * 1.2.51 (Robert): Auto Test's fitness on one dollar scale.
 *
 * - The scale: V (what one man brings in a week), the hire cost of a man, A
 *   (an arrest) and L (a man lost for good).
 * - Order fitness: every order Auto gives is recorded with its men, manpower,
 *   estimate and start minute; when it has run, its net (value − cash cost −
 *   men lost × L − arrests × A) over the man-minutes it took is its efficiency.
 *   Later FBI arrests charged to the order come off its type's net.
 * - Bribe fitness: every bribe is its expected benefit over its cost, both in
 *   dollars, with the conviction chance from the trial formula.
 */
import type { CourtCase, Gang, ID, Order, OrderType, Person, WorldState } from '../sim/types';
import { memberLosses } from '../sim/memberLosses';
import { hm } from '../sim/timeFormat';

/** Weeks of a man's takings an arrest costs (proposed). */
export const ARREST_WEEKS = 4;
/** Weeks of a man's takings a man lost for good costs (Robert: V × 26). */
export const LOST_WEEKS = 26;
/** Weeks of a new man's pay a hire costs, besides his gun (proposed). */
export const HIRE_PAY_WEEKS = 2;
/** Weeks an order's lasting gain (a shop protected, a business bought, a man hired) is counted for (proposed). */
export const LASTING_WEEKS = 12;
/** Weeks of a rival business's profit a successful attack on it is worth (proposed). */
export const ATTACK_PROFIT_WEEKS = 4;
/** Weekly decay of the order-fitness sums, so recent orders count most (proposed). */
export const ORDER_FIT_DECAY = 0.9;
/** Weeks a bribed chief or mayor is counted to help (proposed). */
export const BRIBE_HORIZON_WEEKS = 4;
/** Weeks of the gang's takings a convicted boss costs, on top of all its cash (proposed). */
export const BOSS_CONVICTION_WEEKS = 52;
/** A heavy-crime warrant fires near this much suspicion (the game's 200 floor): a point is 1/200 of an arrest. */
export const WARRANT_SUSPICION = 200;
/** The share of a roughed-up witness's assailants taken, as arrests (proposed). */
export const SCARE_ARREST_SHARE = 0.3;

/** The shared dollar scale. */
export interface DollarScale { V: number; hire: number; A: number; L: number }

export function dollarScale(takingsLast: number, men: number, avgPay: number, gunCost: number): DollarScale {
  const V = men > 0 ? Math.max(0, takingsLast) / men : 0;
  const hire = avgPay * HIRE_PAY_WEEKS + gunCost;
  return { V: Math.round(V), hire: Math.round(hire), A: Math.round(V * ARREST_WEEKS + hire), L: Math.round(V * LOST_WEEKS + hire) };
}

// ---------------------------------------------------------------- orders

/** An order as given (Robert: id, men, manpower, estimate and start minute). */
export interface OrderEntry {
  id: ID;
  type: OrderType;
  label: string;
  week: number;
  manpower: number;
  men: ID[];
  estimate: number;
  startMinute: number;
  /** Targets already protected by us when the order was given (extortion counts only new ones). */
  protectedBefore: ID[];
}

/** Decayed sums per order type: efficiency is net ÷ man-minutes (a ratio of sums). */
export type OrderFitness = Record<string, { net: number; manMinutes: number; orders: number }>;

export interface OrderBook {
  given: OrderEntry[];
  /** Order id → type, kept so a later arrest can be charged to its order's type. */
  typeOf: Map<ID, OrderType>;
  fit: OrderFitness;
  /** The week whose decay was applied last. */
  decayedWeek: number;
}

export function newOrderBook(saved?: OrderFitness): OrderBook {
  const fit: OrderFitness = {};
  for (const [k, v] of Object.entries(saved ?? {})) {
    if (v && Number.isFinite(v.net) && Number.isFinite(v.manMinutes) && v.manMinutes > 0) fit[k] = { net: v.net, manMinutes: v.manMinutes, orders: v.orders };
  }
  return { given: [], typeOf: new Map(), fit, decayedWeek: -1 };
}

/** Dollars per man-minute for a type, or null with no data yet. */
export function efficiency(book: OrderBook, type: string): number | null {
  const f = book.fit[type];
  return f && f.manMinutes > 0 ? f.net / f.manMinutes : null;
}

/**
 * 1.2.51 (Robert): what an order of this type is expected to net — its running
 * efficiency × the man-minutes such an order takes (the type's average). Null
 * with no data yet.
 */
export function expectedNet(book: OrderBook, type: string): { net: number; eff: number; manMinutes: number } | null {
  const f = book.fit[type];
  if (!f || f.manMinutes <= 0 || f.orders <= 0) return null;
  const eff = f.net / f.manMinutes, manMinutes = f.manMinutes / f.orders;
  return { net: eff * manMinutes, eff, manMinutes };
}

/** What the order is worth, with the rule used (null when the type has no value rule). */
export interface ValueContext {
  gangId: ID;
  scale: DollarScale;
  /** Our protection collection rate last week (collected ÷ claimed). */
  collectionRate: number;
  /** 1.2.55: what one hire is worth a week (the best open seat's man value; V when unknown). */
  hireValue?: number;
}

const ATTACKS = new Set<OrderType>(['smashUp', 'torch', 'bomb', 'assault']);
const HITS = new Set<OrderType>(['kill', 'kidnap', 'ambush']);

export function orderValue(w: WorldState, o: Order, ctx: ValueContext, protectedBefore: readonly ID[] = []): { value: number; rule: string } | null {
  const { V } = ctx.scale;
  switch (o.type) {
    case 'collectProtection': case 'raid': case 'export':
      return { value: o.earned ?? 0, rule: 'cash taken' };
    case 'extort': {
      const weekly = o.targetBuildingIds.reduce((n, id) => { const b = w.buildings[id]; return n + (b?.protection?.gangId === ctx.gangId && !protectedBefore.includes(id) ? b.protection.weekly : 0); }, 0);
      return { value: weekly * ctx.collectionRate * LASTING_WEEKS, rule: `new protection $${Math.round(weekly)}/wk × ${Math.round(ctx.collectionRate * 100)}% collected × ${LASTING_WEEKS}` };
    }
    case 'buyPremises': case 'setUpBusiness': {
      const profit = o.targetBuildingIds.reduce((n, id) => { const b = w.buildings[id]; return n + (b?.ownerGangId === ctx.gangId ? Math.max(0, b.lastProfit) : 0); }, 0);
      return { value: profit * LASTING_WEEKS, rule: `profit $${Math.round(profit)}/wk × ${LASTING_WEEKS}` };
    }
    case 'recruit':
      return { value: (o.hired ?? 0) * (ctx.hireValue ?? V) * LASTING_WEEKS, rule: `${o.hired ?? 0} hired × ${ctx.hireValue != null ? `seat value $${Math.round(ctx.hireValue)}` : `V $${V}`} × ${LASTING_WEEKS}` };
    default:
      if (ATTACKS.has(o.type) && o.targetPersonId == null) {
        const shut = o.targetBuildingIds.map((id) => w.buildings[id]).filter((b) => b && b.ownerGangId !== ctx.gangId && b.state !== 'trading');
        const profit = shut.reduce((n, b) => n + Math.max(0, b!.lastProfit), 0);
        return { value: profit * ATTACK_PROFIT_WEEKS, rule: `${shut.length} target(s) not trading × profit × ${ATTACK_PROFIT_WEEKS}` };
      }
      if (HITS.has(o.type) || (ATTACKS.has(o.type) && o.targetPersonId != null)) {
        const victim = o.targetPersonId != null ? w.people[o.targetPersonId] : undefined;
        const out = !!victim && victim.status !== 'active';
        return { value: out ? V * LASTING_WEEKS : 0, rule: out ? `target out (${victim!.status}) × V × ${LASTING_WEEKS}` : 'target still active' };
      }
      return null;
  }
}

/** Note an order Auto just gave. */
export function noteGiven(book: OrderBook, w: WorldState, o: Order, label: string): void {
  book.given.push({ id: o.id, type: o.type, label, week: w.week, manpower: o.opts.manpower ?? 1, men: [...o.assignedIds], estimate: Math.round(o.estimatedMinutes), startMinute: Math.round(w.minute),
    protectedBefore: o.targetBuildingIds.filter((id) => w.buildings[id]?.protection?.gangId === o.gangId) });
  book.typeOf.set(o.id, o.type);
}

const ARREST = /arrest/;
const GONE = /killed|shot|died|kidnap|deserted|left the gang|convicted|jailed/;

/**
 * Settle last week's orders (call once at planning). Returns report lines:
 * one ORDER FIT line per order and a summary of the running efficiencies.
 */
export function settleOrders(book: OrderBook, w: WorldState, gang: Gang, ctx: ValueContext, outcomes?: Map<ID, { value: number; lossCost: number }>): string[] {
  const last = w.week - 1;
  const lines: string[] = [];
  if (book.decayedWeek === w.week) return lines;
  book.decayedWeek = w.week;
  for (const f of Object.values(book.fit)) { f.net *= ORDER_FIT_DECAY; f.manMinutes *= ORDER_FIT_DECAY; f.orders *= ORDER_FIT_DECAY; }
  const { A, L } = ctx.scale;
  const losses = memberLosses(w, gang.id, last).filter((l) => l.week === last && l.cause !== 'sacked' && l.orderId != null);
  const settled = new Set<ID>();
  for (const e of book.given.filter((g) => g.week === last)) {
    const o = w.lastWeekOrders.find((x) => x.id === e.id);
    if (!o) { lines.push(`ORDER FIT #${e.id} ${e.type} (${e.label}): did not run to the end of the week — not scored`); continue; }
    settled.add(e.id);
    const sent = o.sentIds ?? [];
    const span = o.finishedMinute != null && o.startedMinute != null ? Math.max(0, o.finishedMinute - o.startedMinute) : 0;
    const manMinutes = sent.length * span;
    const mine = losses.filter((l) => l.orderId === e.id);
    const arrests = mine.filter((l) => ARREST.test(l.cause)).length;
    const lost = mine.filter((l) => !ARREST.test(l.cause) && GONE.test(l.cause)).length;
    const v = orderValue(w, o, ctx, e.protectedBefore);
    const cost = o.spent ?? 0;
    if (!v) { lines.push(`ORDER FIT #${e.id} ${e.type} (${e.label}): no value rule — ${sent.length} men × ${hm(span)}, cash out $${Math.round(cost)}, lost ${lost}, arrested ${arrests}`); continue; }
    const net = v.value - cost - lost * L - arrests * A;
    // 1.2.56: what the order brought, for Auto's own learning (autoLearn.ts).
    outcomes?.set(e.id, { value: v.value, lossCost: lost * L + arrests * A });
    if (manMinutes <= 0) { lines.push(`ORDER FIT #${e.id} ${e.type} (${e.label}): no man-minutes worked — net $${Math.round(net)} not averaged`); continue; }
    const f = book.fit[e.type] ?? (book.fit[e.type] = { net: 0, manMinutes: 0, orders: 0 });
    f.net += net; f.manMinutes += manMinutes; f.orders++;
    lines.push(`ORDER FIT #${e.id} ${e.type} (${e.label}): value $${Math.round(v.value)} (${v.rule}) − cash $${Math.round(cost)} − lost ${lost} × $${L} − arrests ${arrests} × $${A} = net $${Math.round(net)}`
      + ` over ${sent.length} men × ${hm(span)} = ${hm(manMinutes)} man-time (estimate ${hm(e.estimate)}, manpower ${e.manpower}) → $${(net / manMinutes).toFixed(2)}/man-min`);
  }
  // Later arrests (the FBI) charged to an order settled in an earlier week.
  for (const l of losses) {
    if (settled.has(l.orderId!) || !ARREST.test(l.cause)) continue;
    const type = book.typeOf.get(l.orderId!);
    if (!type || !book.fit[type]) continue;
    book.fit[type].net -= A;
    lines.push(`ORDER FIT later arrest: ${l.name} (${l.cause}) charged to order #${l.orderId} (${type}) — −$${A}`);
  }
  book.given = book.given.filter((g) => g.week >= w.week);
  const summary = Object.entries(book.fit).filter(([, f]) => f.manMinutes > 0 && f.orders > 0).sort((a, b) => b[1].net / b[1].manMinutes - a[1].net / a[1].manMinutes)
    .map(([k, f]) => `${k} $${(f.net / f.manMinutes).toFixed(2)}/man-min × ${hm(f.manMinutes / f.orders)} man-time an order (${f.orders.toFixed(1)} orders, decayed)`);
  if (summary.length) lines.push(`ORDER FIT averages (decay ×${ORDER_FIT_DECAY}/week): ${summary.join(', ')}`);
  return lines;
}

// ---------------------------------------------------------------- bribes

/** Probability the prosecution wins: each side × U(0.85, 1.15), integrated on a grid. */
export function convictionChance(prosecution: number, defence: number): number {
  const N = 40;
  let wins = 0;
  for (let i = 0; i <= N; i++) {
    const a = prosecution * (0.85 + 0.3 * i / N);
    for (let j = 0; j <= N; j++) if (a > defence * (0.85 + 0.3 * j / N)) wins++;
  }
  return wins / ((N + 1) * (N + 1));
}

/** The trial's two sides for a case as it stands, with changes to try. */
export interface TrialSides { strength: number; witnesses: number; daSkill: number; evidence: number; lawyerSkill: number; friendlyJurors: number }

export function trialP(s: TrialSides): number {
  const prosecution = s.strength * 0.6 + s.witnesses * 12 + s.daSkill * 6 + s.evidence * 0.25;
  const defence = s.lawyerSkill * 16 + s.friendlyJurors * 11 + 15;
  return convictionChance(prosecution, defence);
}

export function trialSides(w: WorldState, gang: Gang, c: CourtCase, lawyer: Person | undefined): TrialSides {
  const da = w.people[c.daId];
  return {
    strength: c.strength,
    witnesses: c.witnessIds.filter((id) => { const p = w.people[id]; return !!p && p.status === 'active' && (p.opinion[gang.id] ?? 0) < 40; }).length,
    daSkill: da ? da.skills.intelligence : 3,
    evidence: gang.evidence,
    lawyerSkill: lawyer?.status === 'active' ? lawyer.skills.intelligence : 0.5,
    friendlyJurors: c.jurorIds.filter((id) => { const p = w.people[id]; return !!p && p.status === 'active' && (p.opinion[gang.id] ?? 0) > 25; }).length,
  };
}

/** What a conviction costs in dollars: a hood's jail weeks (2–6, about 4) or, for the boss, the game. */
export function convictionStake(defendant: Person | undefined, gang: Gang, scale: DollarScale, takingsLast: number): number {
  if (defendant?.role === 'boss') return Math.max(0, gang.cash) + Math.max(0, takingsLast) * BOSS_CONVICTION_WEEKS;
  return scale.V * ARREST_WEEKS;
}

/** One bribe scored: benefit and cost in dollars. */
export interface BribeScore { label: string; benefit: number; cost: number; ratio: number; why: string }

export function scoreBribe(label: string, benefit: number, cost: number, why: string): BribeScore {
  return { label, benefit: Math.round(benefit), cost: Math.round(cost), ratio: cost > 0 ? benefit / cost : benefit > 0 ? Infinity : 0, why };
}

export function bribeLine(s: BribeScore): string {
  return `${s.label} benefit $${s.benefit} / cost $${s.cost} = ${Number.isFinite(s.ratio) ? s.ratio.toFixed(2) : '∞'} (${s.why})`;
}
