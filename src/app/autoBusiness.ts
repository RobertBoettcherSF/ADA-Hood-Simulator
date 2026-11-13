/**
 * 1.2.22: Auto Test's memory for buying and moving men, and its in-game view
 * of rival headquarters. Nothing here changes a game rule: it only decides
 * which orders the desk gives, the way a careful player would.
 *
 * - Buys and set-ups are given with a minutes estimate that has learned how
 *   far the game's own estimate falls short (an order that never completes
 *   raises it, a completed one lowers it). A target that fits the crew's
 *   free week is chosen; one that failed twice is dropped for some weeks,
 *   and a crew is never sent again to a buy it failed.
 * - A crew move refused once (crew full or out of time) is not repeated for
 *   a few weeks.
 * - Rival HQs are only those the gang's own scouting has identified.
 */
import { buildingMapIntel } from '../sim/mapIntel';
import { buildingList } from '../sim/entityLists';
import type { Building, Gang, WorldState } from '../sim/types';

/** Failures before a target is dropped, and for how many weeks. */
export const FAILS_TO_DROP = 2;
export const DROP_WEEKS = 6;
/** Weeks a refused crew move is not tried again. */
export const MOVE_REFUSED_WEEKS = 4;
/** Weeks between rival-HQ strikes. */
export const HQ_STRIKE_GAP = 4;

export interface PendingBuy { orderId: number; buildingId: number; teamId: number; type: string; estimate: number; free: number; week: number }

export interface DeskMemory {
  /** Failures per target building. */
  fails: Map<number, number>;
  /** Target building → week it may be tried again. */
  dropped: Map<number, number>;
  /** "teamId:buildingId" pairs that failed: never given to that crew again. */
  failedPairs: Set<string>;
  /** How many times the game's own minutes estimate a buy really takes. */
  ratio: number;
  pending: PendingBuy[];
  /** "personId>teamId" or ">teamId" → week refused. */
  refusedMoves: Map<string, number>;
  lastHqStrike: number;
}

const memories = new WeakMap<WorldState, DeskMemory>();

export function deskMemory(w: WorldState): DeskMemory {
  let m = memories.get(w);
  if (!m) {
    m = { fails: new Map(), dropped: new Map(), failedPairs: new Set(), ratio: 2.5, pending: [], refusedMoves: new Map(), lastHqStrike: -Infinity };
    memories.set(w, m);
  }
  return m;
}

/** Monday: judge last week's buys and set-ups. Returns log lines. */
export function reviewBuys(w: WorldState, gang: Gang, m: DeskMemory): string[] {
  const out: string[] = [];
  for (const p of m.pending) {
    const done = w.lastWeekOrders.find((o) => o.id === p.orderId);
    const b = w.buildings[p.buildingId];
    const ok = (done && done.completedTargets > 0 && !done.failReason) ||
      (p.type === 'buyPremises' && b?.ownerGangId === gang.id) ||
      (p.type === 'setUpBusiness' && b?.ownerGangId === gang.id && b.cls !== 'empty');
    const label = `${p.type === 'buyPremises' ? 'buy' : 'set up'} ${b?.typeId ?? p.buildingId} (building ${p.buildingId})`;
    if (ok) {
      m.fails.delete(p.buildingId);
      m.ratio = Math.max(1.2, Math.round(m.ratio * 0.95 * 100) / 100);
      out.push(`NOTE business: ${label} done (estimate ${p.estimate} min of ${p.free} free; minutes factor now ×${m.ratio})`);
      continue;
    }
    const n = (m.fails.get(p.buildingId) ?? 0) + 1;
    m.fails.set(p.buildingId, n);
    m.failedPairs.add(`${p.teamId}:${p.buildingId}`);
    m.ratio = Math.min(5, Math.round(m.ratio * 1.15 * 100) / 100);
    const why = done?.failReason ?? (done ? 'nothing done' : 'never finished in the week');
    out.push(`NOTE business: ${label} failed (${why}); failure ${n}, minutes factor now ×${m.ratio}`);
    if (n >= FAILS_TO_DROP) {
      m.dropped.set(p.buildingId, w.week + DROP_WEEKS);
      m.fails.delete(p.buildingId);
      out.push(`NOTE business: dropped building ${p.buildingId} (${b?.typeId ?? '?'}) after ${n} failures — not tried again until week ${w.week + DROP_WEEKS}`);
    }
  }
  m.pending = [];
  for (const [id, until] of m.dropped) if (until <= w.week) m.dropped.delete(id);
  for (const [key, week] of m.refusedMoves) if (w.week - week >= MOVE_REFUSED_WEEKS) m.refusedMoves.delete(key);
  return out;
}

/** May this building be tried by this crew? */
export function buyAllowed(m: DeskMemory, teamId: number, buildingId: number): boolean {
  return !m.dropped.has(buildingId) && !m.failedPairs.has(`${teamId}:${buildingId}`);
}

export function moveRefused(m: DeskMemory, personId: number, teamId: number): boolean {
  return m.refusedMoves.has(`${personId}>${teamId}`) || m.refusedMoves.has(`>${teamId}`);
}

export function noteRefusedMove(m: DeskMemory, w: WorldState, personId: number, teamId: number, error: string): void {
  m.refusedMoves.set(`${personId}>${teamId}`, w.week);
  // A full crew or one out of time refuses anybody.
  if (/full|time/i.test(error)) m.refusedMoves.set(`>${teamId}`, w.week);
}

/** Rival headquarters this gang's own scouting has identified. */
export function knownRivalHQs(w: WorldState, gang: Gang): Building[] {
  return buildingList(w).filter((b) => b.ownerGangId != null && b.ownerGangId !== gang.id && !w.gangs[b.ownerGangId]?.eliminated && buildingMapIntel(b, gang.id).isHQ);
}
