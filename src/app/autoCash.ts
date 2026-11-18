/**
 * 1.2.52 (Robert): cash as a fitness function, on the 1.2.51 dollar scale.
 *
 * - R, the cash the gang needs: the shortfall of the lowest recent takings
 *   under the bill, one week's bill, and money already committed.
 * - λ, the value of holding a dollar: below R a dollar short is priced as
 *   unpaid men × P(desert) × L plus the risk to sacked men's crew jobs (A);
 *   above R holding loses IDLE_PENALTY a week.
 * - Every discretionary spend states its return per dollar (dollars back over
 *   LASTING_WEEKS for each dollar spent); one pass, best return first, takes
 *   each while its return is at least λ at the cash left after it.
 */
import { LASTING_WEEKS, type DollarScale } from './autoFitness';

/** Weekly loss of holding a dollar above the need (Robert, proposed). */
export const IDLE_PENALTY = 0.005;
/** Weeks of the lowest takings looked back over (Robert: 4). */
export const CASH_LOOKBACK_WEEKS = 4;
/** Chance an unpaid man deserts (proposed). */
export const P_DESERT_UNPAID = 0.25;
/** Share of men sacked for wages who held a crew job (proposed). */
export const SACKED_CREW_SHARE = 0.5;

export interface CashNeed { R: number; bill: number; lowest: number; shortfall: number; committed: number }

/** R = max(0, bill − lowest takings of the last weeks) + one week's bill + committed. */
export function cashNeed(bill: number, takings: readonly number[], committed: number): CashNeed {
  const recent = takings.slice(-CASH_LOOKBACK_WEEKS);
  const lowest = recent.length ? Math.min(...recent) : 0;
  const shortfall = Math.max(0, bill - lowest);
  return { R: Math.round(shortfall + bill + committed), bill: Math.round(bill), lowest: Math.round(lowest), shortfall: Math.round(shortfall), committed: Math.round(committed) };
}

/**
 * λ at a cash level: what a dollar held there is worth, in dollars. Above R
 * a dollar held for LASTING_WEEKS loses IDLE_PENALTY a week, scaled by R ÷ the
 * cash (1.2.55, floor IDLE_LAMBDA_FLOOR); below R each
 * dollar short leaves 1/avgPay of a man unpaid.
 */
/** 1.2.55 (proposed): the least λ falls to with idle cash far above the reserve. */
export const IDLE_LAMBDA_FLOOR = 0.3;

export function holdValue(cashAfter: number, R: number, avgPay: number, scale: DollarScale): number {
  // 1.2.55 (Robert): idle cash lowers λ above the reserve — × R ÷ the cash, floor IDLE_LAMBDA_FLOOR.
  if (cashAfter >= R) return Math.max(IDLE_LAMBDA_FLOOR, (1 - IDLE_PENALTY * LASTING_WEEKS) * (cashAfter > 0 ? Math.min(1, R / cashAfter) : 1));
  const perMan = P_DESERT_UNPAID * scale.L + SACKED_CREW_SHARE * scale.A;
  return 1 + (avgPay > 0 ? perMan / avgPay : 0);
}

/** One discretionary spend put to the pass. */
export interface CashSpend {
  label: string;
  kind: 'buy' | 'set-up' | 'bribe' | 'police' | 'car' | 'charity' | 'raise' | 'recruit' | 'asset';
  cost: number;
  /** Dollars back for each dollar spent. */
  ret: number;
  why: string;
  /** Carries the spend out (an API call or a proposed order); false when the game refused it. */
  run: () => boolean;
  /** 1.2.53: paid at once (an API call), so it can still be taken after the decision with cash a refused order released. */
  immediate?: boolean;
  /** 1.2.54 (Robert): the chance it is carried out (order completion); an API spend is 1. */
  chance?: number;
  /** 1.2.59 (Robert): no fixed wage-bill veto — the cash fitness (λ at the cash left) alone decides (the mayor's bribe). */
  noFloor?: boolean;
  /** 1.2.77 (Robert, point 1): a job for the lawyer — he does one a week, the best return taken first. */
  lawyer?: boolean;
}

export interface CashPassResult { lines: string[]; spent: number; taken: number; takenSet: Set<CashSpend>; /** 1.2.77: the lawyer's one job this week, once booked. */ lawyerBooked: string | null }

/**
 * The one spending pass: best return per dollar first; a spend is taken while
 * its return is at least λ at the cash left after it and the week-end
 * forecast still covers the bill (the hard rule).
 *
 * 1.2.54 (Robert): a spend counts at its chance of being carried out — its
 * return is weighed by it (ret × chance against λ), and only the expected
 * cost (cost × chance) is held from the cash the next spends see. The wage
 * floor is kept on the full cost of everything taken, in case all of it runs.
 */
export function runCashPass(spends: CashSpend[], cash: number, R: number, floor: number, avgPay: number, scale: DollarScale, lawyerBooked: string | null = null): CashPassResult {
  const lines: string[] = [];
  let booked = lawyerBooked;
  let left = cash, worst = cash, spent = 0, taken = 0;
  const takenSet = new Set<CashSpend>();
  const eff = (s: CashSpend) => s.ret * (s.chance ?? 1);
  const order = [...spends].sort((a, b) => eff(b) - eff(a) || a.cost - b.cost);
  // 1.2.78 (Robert, point 5): the lawyer's one job goes to the lawyer spend with the highest net value —
  // (return × chance − λ) × the expected outlay, λ at the cash left after it alone — among those the pass would approve.
  let lawyerPick: CashSpend | null = null;
  if (!booked) {
    let best = 0;
    for (const s of spends) {
      if (!s.lawyer) continue;
      const out = s.cost * (s.chance ?? 1);
      if (!s.noFloor && cash - s.cost < floor) continue;
      const net = (eff(s) - holdValue(cash - out, R, avgPay, scale)) * out;
      if (net > best) { best = net; lawyerPick = s; }
    }
  }
  for (const s of order) {
    const p = s.chance ?? 1;
    const after = left - s.cost * p;
    // 1.2.60 (Robert): only the dollars that fall below R carry the below-R
    // price; the rest of the spend is weighed at λ above R.
    const outlay = s.cost * p;
    const below = Math.max(0, Math.min(outlay, R - after));
    const lambda = outlay > 0 && below > 0
      ? ((outlay - below) * holdValue(Math.max(after, R), R, avgPay, scale) + below * holdValue(Math.min(after, R - 1), R, avgPay, scale)) / outlay
      : holdValue(after, R, avgPay, scale);
    const line = `${s.label} [${s.kind}] $${Math.round(s.cost)} at ${s.ret.toFixed(2)}/$${p < 1 ? ` × chance ${p.toFixed(2)} = ${eff(s).toFixed(2)}` : ''} vs λ ${lambda.toFixed(2)}${below > 0 && below < outlay ? ` ($${Math.round(below)} of it below R)` : ''}`;
    if (!s.noFloor && worst - s.cost < floor) { if (s === lawyerPick) lawyerPick = null; lines.push(`${line} — not taken: it would put the wage bill at risk`); continue; }
    if (eff(s) < lambda) { if (s === lawyerPick) lawyerPick = null; lines.push(`${line} — not taken (${s.why})`); continue; }
    // 1.2.77 (Robert, point 1): one lawyer job a week — the best return (this pass runs best first) or an earlier booking.
    if (s.lawyer && booked) { lines.push(`${line} — not taken: the lawyer's one job this week is ${booked} (1.2.77)`); continue; }
    if (s.lawyer && lawyerPick && s !== lawyerPick) { lines.push(`${line} — not taken: the lawyer's one job goes to ${lawyerPick.label}, the highest net value (1.2.78)`); continue; }
    if (!s.run()) { if (s === lawyerPick) lawyerPick = null; lines.push(`${line} — taken but refused by the game (${s.why})`); continue; }
    if (s.lawyer) booked = s.label;
    left = after; worst -= s.cost; spent += s.cost * p; taken++; takenSet.add(s);
    lines.push(`${line} — taken (${s.why})`);
  }
  return { lines, spent, taken, takenSet, lawyerBooked: booked };
}
