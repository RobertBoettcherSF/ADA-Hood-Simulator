/**
 * 1.2.73 (Robert, point 5): the debug report's record of where free men go —
 * a TOP-UP line for each idle gangless person moved to a hiring place, a FREE
 * HIRE line for each man a gang takes on from the under-2-men offer. Kept for
 * the session only (not in the save) and never read by Auto: a player cannot
 * see either.
 */
import type { Gang, ID, Person, WorldState } from './types';

export interface HireLine { week: number; text: string }

const KEEP = 400;
const LINES = new WeakMap<WorldState, HireLine[]>();
/** Men listed by the under-2-men offer: person → gang. */
const OFFERS = new WeakMap<WorldState, Map<ID, ID>>();

export function noteHireLine(w: WorldState, text: string): void {
  const list = LINES.get(w) ?? [];
  list.push({ week: w.week, text });
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
  LINES.set(w, list);
}

export function hireLines(w: WorldState, sinceWeek = -Infinity): HireLine[] {
  return (LINES.get(w) ?? []).filter((l) => l.week >= sinceWeek);
}

export function noteFreeOffer(w: WorldState, gangId: ID, personId: ID): void {
  const m = OFFERS.get(w) ?? new Map<ID, ID>();
  m.set(personId, gangId);
  OFFERS.set(w, m);
}

/** Called when a gang hires a man: logs FREE HIRE if he came from the offer.
 *  1.2.91 (report): returns whether he did, for RIVAL INFLOW. */
export function noteFreeHire(w: WorldState, gang: Gang, p: Person): boolean {
  const m = OFFERS.get(w);
  if (!m || !m.has(p.id)) return false;
  const offeredTo = m.get(p.id);
  m.delete(p.id);
  if (offeredTo !== gang.id) return false;
  noteHireLine(w, `FREE HIRE: ${gang.name} took on ${p.name} (#${p.id}) from the under-2-men offer`);
  return true;
}

/** 1.2.91 (Robert, point 1, report only — never read by Auto or the gangs): RIVAL INFLOW — each gang's men
 *  gained by source (a recruit order, the under-2-men free hire, a promotion to a new crew, an heir taking over
 *  as boss) and its recruit orders issued / done / ran out / other, by car or on foot. Counted from one week's
 *  hand-out (beginWeekOrders) to the next, so a week's run and the settlement after it (rival planning, heirs)
 *  fall together. Kept for the session only, not in the save. */
export interface Inflow { recruit: number; free: number; promotion: number; heir: number; issued: number; done: number; ranOut: number; other: number; car: number; foot: number }
const emptyInflow = (): Inflow => ({ recruit: 0, free: 0, promotion: 0, heir: 0, issued: 0, done: 0, ranOut: 0, other: 0, car: 0, foot: 0 });
const INFLOW = new WeakMap<WorldState, { now: Map<ID, Inflow>; car: Set<ID> }>();
function inflowOf(w: WorldState) {
  let s = INFLOW.get(w);
  if (!s) { s = { now: new Map(), car: new Set() }; INFLOW.set(w, s); }
  return s;
}
export function noteInflow(w: WorldState, gangId: ID, key: keyof Inflow, n = 1): void {
  if (!n) return;
  const s = inflowOf(w), g = s.now.get(gangId) ?? emptyInflow();
  g[key] += n;
  s.now.set(gangId, g);
}
/** A recruit order handed out with a car (report). */
export function noteRecruitCar(w: WorldState, orderId: ID): void { inflowOf(w).car.add(orderId); }
/** At the week's end, once the unfinished orders are closed: each recruit order's outcome. */
export function noteRecruitOutcomes(w: WorldState, orders: { id: ID; gangId: ID; type: string; state: string; failReason?: string | null; startedMinute?: number }[]): void {
  const s = inflowOf(w);
  for (const o of orders) {
    if (o.type !== 'recruit') continue;
    noteInflow(w, o.gangId, 'issued');
    const ranOut = /not enough time in the week|Ran out of week/i.test(o.failReason ?? '');
    noteInflow(w, o.gangId, ranOut ? 'ranOut' : o.state === 'done' ? 'done' : 'other');
    if (o.startedMinute != null) noteInflow(w, o.gangId, s.car.has(o.id) ? 'car' : 'foot');
  }
  s.car = new Set();
}
/** What has been counted since the last hand-out (the report reads it in the planning phase). */
export function inflowSoFar(w: WorldState): Map<ID, Inflow> { return inflowOf(w).now; }
/** The new week's hand-out starts a fresh count. */
export function rollInflow(w: WorldState): void { inflowOf(w).now = new Map(); }
