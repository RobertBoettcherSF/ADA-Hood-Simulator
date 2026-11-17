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

/** Called when a gang hires a man: logs FREE HIRE if he came from the offer. */
export function noteFreeHire(w: WorldState, gang: Gang, p: Person): void {
  const m = OFFERS.get(w);
  if (!m || !m.has(p.id)) return;
  const offeredTo = m.get(p.id);
  m.delete(p.id);
  if (offeredTo !== gang.id) return;
  noteHireLine(w, `FREE HIRE: ${gang.name} took on ${p.name} (#${p.id}) from the under-2-men offer`);
}
