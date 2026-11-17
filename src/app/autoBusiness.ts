/**
 * 1.2.22: Auto Test's memory for buying and moving men, and its in-game view
 * of rival headquarters. Nothing here changes a game rule: it only decides
 * which orders the desk gives, the way a careful player would.
 *
 * - Buys and set-ups are given with a minutes estimate that has learned how
 *   far the game's own estimate falls short (1.2.75: from finished orders
 *   only; orders that run out feed a separate run-out chance). A target that fits the crew's
 *   free week is chosen. (1.2.54: no ban of a failed target or crew — the
 *   order-completion chance, autoExec.ts, weighs every try instead.)
 * - A crew move refused once (crew full or out of time) is not repeated for
 *   a few weeks.
 * - Rival HQs are only those the gang's own scouting has identified.
 */
import { buildingMapIntel } from '../sim/mapIntel';
import { buildingList } from '../sim/entityLists';
import type { Building, Gang, WorldState } from '../sim/types';
import { hm } from '../sim/timeFormat';

/** Weeks a refused crew move is not tried again. */
export const MOVE_REFUSED_WEEKS = 4;
/** Weeks between rival-HQ strikes. */
export const HQ_STRIKE_GAP = 4;

export interface PendingBuy { orderId: number; buildingId: number; teamId: number; type: string; estimate: number; free: number; week: number; /** 1.2.74: the crew's role, the key its minutes correction is learned under. */ crewKey?: string }

export interface DeskMemory {
  /** Failures per target building (for the log). */
  fails: Map<number, number>;
  /** How many times the game's own minutes estimate a buy really takes. */
  ratio: number;
  pending: PendingBuy[];
  /** "personId>teamId" or ">teamId" → week refused. */
  refusedMoves: Map<string, number>;
  lastHqStrike: number;
  /** 1.2.68: "teamId:buildingId" → the week a buy or set-up by that crew failed for want of time. */
  timeFails?: Map<string, number>;
  /** 1.2.69: buildingId → time failures (any crew) and the last week. */
  siteTimeFails?: Map<number, { n: number; last: number }>;
  /** 1.2.74 (Robert, points 12-13): running average of actual ÷ the game's estimate, by key ("buy:<crew role>", "hit:kill"). */
  timeRatios?: Map<string, { sum: number; n: number }>;
  /** 1.2.75 (Robert, point 3): per order type ("buyPremises", "setUpBusiness", "kill", "kidnap"), given orders that ran out (out of week, nobody left, never started) of all given. */
  runOuts?: Map<string, { out: number; n: number }>;
}

/** 1.2.74 (Robert, point 12), proposed: the correction a key starts from, and the weight (orders) of that prior.
 *  1.2.75 (Robert, point 3), proposed: prior 1.0 (the game's estimate), learned from finished orders only. */
export const TIME_RATIO_PRIOR = 1.0;
export const TIME_RATIO_PRIOR_N = 2;
/** 1.2.74, proposed: the running average keeps at most this many orders' worth of weight (older ones fade). */
export const TIME_RATIO_WINDOW = 12;

/** 1.2.74 (Robert, points 12-13): one finished order's actual ÷ estimate joins its key's running average. */
export function noteTimeRatio(m: DeskMemory, key: string, ratio: number): void {
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  const r = Math.min(10, ratio);
  const map = m.timeRatios ??= new Map();
  const cur = map.get(key) ?? { sum: 0, n: 0 };
  if (cur.n >= TIME_RATIO_WINDOW) { cur.sum *= (TIME_RATIO_WINDOW - 1) / cur.n; cur.n = TIME_RATIO_WINDOW - 1; }
  cur.sum += r; cur.n += 1;
  map.set(key, cur);
}

/** 1.2.74: the learned correction for a key (the prior until orders of that kind have finished). */
export function timeFactor(m: DeskMemory, key: string): number {
  const cur = m.timeRatios?.get(key);
  return Math.round(((cur?.sum ?? 0) + TIME_RATIO_PRIOR * TIME_RATIO_PRIOR_N) / ((cur?.n ?? 0) + TIME_RATIO_PRIOR_N) * 100) / 100;
}

/** 1.2.75 (Robert, point 3), proposed: the chance an order runs out starts at 20%, weighted as 10 orders. */
export const RUN_OUT_PRIOR = 0.2;
export const RUN_OUT_PRIOR_N = 10;
/** 1.2.75, proposed: the run-out record keeps at most this many orders' weight (older ones fade). */
export const RUN_OUT_WINDOW = 30;

/** 1.2.75 (Robert, point 3): an order that ran out (out of week, nobody left, never started) or not. */
export function noteRunOut(m: DeskMemory, type: string, ranOut: boolean): void {
  const map = m.runOuts ??= new Map();
  const cur = map.get(type) ?? { out: 0, n: 0 };
  if (cur.n >= RUN_OUT_WINDOW) { cur.out *= (RUN_OUT_WINDOW - 1) / cur.n; cur.n = RUN_OUT_WINDOW - 1; }
  cur.out += ranOut ? 1 : 0; cur.n += 1;
  map.set(type, cur);
}

/** 1.2.75 (Robert, point 3): the learned chance an order of this type runs out. */
export function runOutChance(m: DeskMemory, type: string): number {
  const cur = m.runOuts?.get(type);
  return ((cur?.out ?? 0) + RUN_OUT_PRIOR * RUN_OUT_PRIOR_N) / ((cur?.n ?? 0) + RUN_OUT_PRIOR_N);
}

/** 1.2.75 (Robert, point 3): a fail reason that means the order ran out (week or start), not that it was done slowly.
 * 1.2.76 (Robert, point 6): "Nobody was left" is a loss (men arrested or killed), not a run-out. */
export function isRunOut(why: string): boolean {
  if (/nobody was left/i.test(why)) return false;
  return /not enough time in the week|ran out of week|searched all week|never finished in the week|never started|no time/i.test(why);
}

const memories = new WeakMap<WorldState, DeskMemory>();

export function deskMemory(w: WorldState): DeskMemory {
  let m = memories.get(w);
  if (!m) {
    m = { fails: new Map(), ratio: 2.5, pending: [], refusedMoves: new Map(), lastHqStrike: -Infinity };
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
    const key = `buy:${p.crewKey ?? 'any'}`;
    // 1.2.74 (Robert, point 12): the minutes it really took ÷ the game's estimate join the crew
    // type's running average. 1.2.75 (Robert, point 3): finished orders only — one that ran out
    // (out of week, never started; 1.2.76: nobody left is a loss, not a run-out) does not move the correction; it feeds the type's
    // run-out chance instead, which the execution chance uses.
    const why = done?.failReason ?? (done ? 'nothing done' : 'never finished in the week');
    const used = done && done.startedMinute != null && done.finishedMinute != null ? done.finishedMinute - done.startedMinute : null;
    const ranOut = !ok && isRunOut(why);
    noteRunOut(m, p.type, ranOut);
    const learns = ok && used != null && used > 0 && p.estimate > 0;
    if (learns) noteTimeRatio(m, key, used! / p.estimate);
    m.ratio = timeFactor(m, key);
    if (ok) {
      m.fails.delete(p.buildingId);
      m.siteTimeFails?.delete(p.buildingId);
      out.push(`NOTE business: ${label} done (estimate ${hm(p.estimate)}${used != null ? `, took ${hm(used)}` : ''} of ${hm(p.free)} free; ${key} correction now ×${m.ratio}, 1.2.75)`);
      continue;
    }
    const n = (m.fails.get(p.buildingId) ?? 0) + 1;
    m.fails.set(p.buildingId, n);
    if (/time/i.test(why)) {
      (m.timeFails ??= new Map()).set(`${p.teamId}:${p.buildingId}`, w.week);
      const s = (m.siteTimeFails ??= new Map()).get(p.buildingId);
      m.siteTimeFails.set(p.buildingId, { n: (s?.n ?? 0) + 1, last: w.week });
    }
    out.push(`NOTE business: ${label} failed (${why}); failure ${n}, ${key} correction ${learns ? 'now' : 'unchanged'} ×${m.ratio}${ranOut ? `; ran out — ${p.type} run-out chance now ${Math.round(runOutChance(m, p.type) * 100)}%` : ''} (1.2.75)`);
  }
  m.pending = [];
  for (const [key, week] of m.refusedMoves) if (w.week - week >= MOVE_REFUSED_WEEKS) m.refusedMoves.delete(key);
  return out;
}

/** 1.2.68 (Robert, point 10): a buy that failed for want of time is not given to the same crew again for `weeks`. */
export function buyRetryBanned(m: DeskMemory, w: WorldState, teamId: number, buildingId: number, weeks: number): boolean {
  const at = m.timeFails?.get(`${teamId}:${buildingId}`);
  return at != null && w.week - at < weeks;
}

/** 1.2.69 (Robert, point 15): a site that failed twice for want of time (any crews) waits `weeks` for every crew; then it starts over. */
export function siteTimeBanned(m: DeskMemory, w: WorldState, buildingId: number, weeks: number): boolean {
  const s = m.siteTimeFails?.get(buildingId);
  if (!s || s.n < 2) return false;
  if (w.week - s.last < weeks) return true;
  m.siteTimeFails!.delete(buildingId);
  return false;
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
