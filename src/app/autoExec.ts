/**
 * 1.2.54 (Robert): order completion — every order Auto puts forward is
 * followed to its end: given or not (and why), then carried out, cancelled or
 * not carried out (and why). The chance an order is carried out is learned
 * from the last EXEC_WEEKS weeks per order type, crew and site, and weighs
 * the order's value (order fitness) and its cash-pass return. It replaces the
 * permanent crew-and-site bans and the fixed buy waits.
 */
import type { Order, WorldState } from '../sim/types';

/** Weeks of tries the chance is learned from (Robert: 8). */
export const EXEC_WEEKS = 8;
/** Pseudo-tries that pull a thin record (one crew, one site) toward the wider one (proposed). */
export const EXEC_PRIOR = 2;

export type ExecReason = 'no time' | 'nobody free' | 'crew at rest' | 'lying low' | 'on defence' | 'refused by the game' | 'no crew took it' | 'held back' | 'guard' | 'shop refused';
export type ExecEnd = 'carried out' | 'cancelled' | 'not carried out';

export interface ExecTry {
  week: number;
  type: string;
  teamId: number | null;
  siteId: number | null;
  label: string;
  /** Dollars the cash pass approved for it (0 when it was not a cash spend). */
  approved: number;
  orderId?: number;
  /** Not given: why. Given and settled: why it was not carried out. */
  reason?: ExecReason;
  /** Unset while a given order is still running. */
  end?: ExecEnd | 'not given';
}

export interface ExecMemory { tries: ExecTry[]; settledWeek: number }

const memories = new WeakMap<WorldState, ExecMemory>();

export function execMemory(w: WorldState): ExecMemory {
  let m = memories.get(w);
  if (!m) { m = { tries: [], settledWeek: -1 }; memories.set(w, m); }
  return m;
}

/** The reason class of a refusal — ours (the desk) or the game's. */
export function execReason(error: string): ExecReason {
  // 1.2.56 (Robert): the FBI guard and a shop's own answer have their own reasons.
  if (/FBI guard/i.test(error)) return 'guard';
  if (/refused your protection|already pays somebody|no longer available to extort/i.test(error)) return 'shop refused';
  if (/lying low|lies low|off heavy/i.test(error)) return 'lying low';
  if (/defence|rival-held|rival block/i.test(error)) return 'on defence';
  if (/wanted|rest line|hurt|warrant/i.test(error)) return 'crew at rest';
  if (/no crew|nobody else buys|business crew|patrols/i.test(error)) return 'no crew took it';
  if (/time|busy|man-minutes/i.test(error)) return 'no time';
  if (/nobody|no hood|not free|people|preferred|drop below|no man/i.test(error)) return 'nobody free';
  if (/brake|risky work|held back|pays more/i.test(error)) return 'held back';
  return 'refused by the game';
}

/** A proposal no crew was given. */
export function noteNotGiven(m: ExecMemory, w: WorldState, t: { type: string; teamId: number | null; siteId: number | null; label: string; approved: number }, error: string): void {
  m.tries.push({ ...t, week: w.week, reason: execReason(error), end: 'not given' });
}

/** An order a crew was given. */
export function noteGivenTry(m: ExecMemory, w: WorldState, t: { type: string; teamId: number | null; siteId: number | null; label: string; approved: number }, orderId: number): void {
  m.tries.push({ ...t, week: w.week, orderId });
}

function endOf(w: WorldState, id: number): { end: ExecEnd; reason?: ExecReason } {
  const o: Order | undefined = w.lastWeekOrders.find((x) => x.id === id);
  if (o) {
    if (o.state === 'done' && o.completedTargets > 0 && !o.failReason) return { end: 'carried out' };
    return { end: 'not carried out', reason: execReason(o.failReason ?? o.results.join(' ') ?? '') };
  }
  // Still running (a repeat order) counts as not carried out this week; gone without a result was cancelled.
  if (w.orders[id]) return { end: 'not carried out', reason: 'no time' };
  return { end: 'cancelled', reason: 'refused by the game' };
}

/**
 * Monday: settle last week's given orders and drop tries older than
 * EXEC_WEEKS. Returns the ORDER EXEC line for last week.
 */
export function settleExec(m: ExecMemory, w: WorldState, cancelledIds: ReadonlySet<number>): string | null {
  if (m.settledWeek === w.week) return null;
  m.settledWeek = w.week;
  for (const t of m.tries) {
    if (t.end || t.orderId == null) continue;
    const r = cancelledIds.has(t.orderId) ? { end: 'cancelled' as const, reason: 'held back' as const } : endOf(w, t.orderId);
    t.end = r.end; t.reason = r.reason;
  }
  m.tries = m.tries.filter((t) => t.week > w.week - 1 - EXEC_WEEKS);
  const last = m.tries.filter((t) => t.week === w.week - 1);
  if (!last.length) return null;
  const count = (e: ExecTry['end']) => last.filter((t) => t.end === e).length;
  const given = last.filter((t) => t.end !== 'not given');
  const approved = last.reduce((n, t) => n + t.approved, 0);
  const done = last.filter((t) => t.end === 'carried out').reduce((n, t) => n + t.approved, 0);
  const reasons = new Map<string, number>();
  for (const t of last) if (t.end !== 'carried out' && t.reason) { const k = `${t.end === 'not given' ? 'not given' : t.end}: ${t.reason}`; reasons.set(k, (reasons.get(k) ?? 0) + 1); }
  const top = [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ×${n}`).join(', ');
  return `ORDER EXEC week ${w.week - 1}: ${last.length} put forward, ${given.length} given — ${count('carried out')} carried out, ${count('cancelled')} cancelled, ${count('not carried out')} not carried out; ${count('not given')} not given`
    + `; $${Math.round(done)} carried out of $${Math.round(approved)} approved${top ? `; top reasons: ${top}` : ''}`;
}

/**
 * The chance an order of this type (for this crew, at this site) is carried
 * out: the type's record (Laplace), then the crew's and the site's, each
 * pulled toward the wider one by EXEC_PRIOR pseudo-tries. Settled tries only.
 * 1.2.56 (Robert): only orders a crew was given count — an order held back,
 * out of time or on defence is not a failure of the order (it fed on itself).
 */
export function execChance(m: ExecMemory, type: string, teamId: number | null, siteId: number | null): number {
  const settled = m.tries.filter((t) => t.type === type && t.end && t.end !== 'not given');
  const rate = (list: ExecTry[], prior: number, n0: number) => (list.filter((t) => t.end === 'carried out').length + prior * n0) / (list.length + n0);
  let p = rate(settled, 0.5, 2);
  if (teamId != null) p = rate(settled.filter((t) => t.teamId === teamId), p, EXEC_PRIOR);
  if (siteId != null) p = rate(settled.filter((t) => t.siteId === siteId), p, EXEC_PRIOR);
  return p;
}

/** 1.2.56: carried out / failed counts of the given orders of a type (for the Beta draw). */
export function execCounts(m: ExecMemory, type: string): { done: number; failed: number } {
  const settled = m.tries.filter((t) => t.type === type && t.end && t.end !== 'not given');
  const done = settled.filter((t) => t.end === 'carried out').length;
  return { done, failed: settled.length - done };
}

/** 1.2.56: the last week an order of this type was given (null: not in the last EXEC_WEEKS weeks). */
export function lastGivenWeek(m: ExecMemory, type: string): number | null {
  let wk: number | null = null;
  for (const t of m.tries) if (t.type === type && t.end !== 'not given' && (wk == null || t.week > wk)) wk = t.week;
  return wk;
}
