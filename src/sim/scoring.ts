import type { Gang, ScoreMeasures, WorldState } from './types';
import { gangManpower, territoryCount } from './world';

export function scoreMeasures(w: WorldState, gang: Gang): ScoreMeasures {
  return { cash: Math.max(0, gang.cash), territory: territoryCount(w, gang.id), manpower: gangManpower(w, gang) };
}

/** Preserve highs independently of the rolling 40-week graph. Legacy saves can
 * recover only retained history; their old combined assets are not cash. */
export function recordScorePeaks(w: WorldState): void {
  const gang = Object.values(w.gangs).find(g => g.isPlayer);
  if (!gang || w.phase === 'gameOver') return;
  const current = scoreMeasures(w, gang);
  const best = gang.scorePeaks ?? { ...current };
  if (!gang.scorePeaks) for (const entry of gang.history) {
    best.cash = Math.max(best.cash, entry.cash ?? 0);
    best.territory = Math.max(best.territory, entry.territory);
    best.manpower = Math.max(best.manpower, entry.manpower);
  }
  best.cash = Math.max(best.cash, current.cash);
  best.territory = Math.max(best.territory, current.territory);
  best.manpower = Math.max(best.manpower, current.manpower);
  gang.scorePeaks = best;
}

/** Receipts can be spent again in the same minute or settlement stage. */
export function recordCashPeak(w: WorldState, gang: Gang): void {
  if (!gang.isPlayer || w.phase === 'gameOver') return;
  if (!gang.scorePeaks) recordScorePeaks(w);
  if (gang.scorePeaks) gang.scorePeaks.cash = Math.max(gang.scorePeaks.cash, gang.cash);
}

/** Manual p.83 specifies the factors, not their weights. This remake gives
 * equal weight to each factor's final and best capped contribution. */
export function finalScore(current: ScoreMeasures, best: ScoreMeasures, won: boolean, winBonus: number): number {
  const contribution = (now: number, peak: number, scale: number, cap: number) =>
    (Math.min(cap, Math.max(0, now) * scale) + Math.min(cap, Math.max(0, peak, now) * scale)) / 2;
  const score = (won ? winBonus : -10) + contribution(current.territory, best.territory, 1 / 8, 20) +
    contribution(current.manpower, best.manpower, .7, 15) + contribution(current.cash, best.cash, 1 / 30_000, 20);
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** The game's score as the ending screen shows it: the outcome's when the game is over, otherwise the same sum without a win bonus or loss penalty. */
export function gameScoreNow(w: WorldState): number {
  if (w.outcome) return w.outcome.score;
  const gang = Object.values(w.gangs).find(g => g.isPlayer);
  if (!gang) return 0;
  const current = scoreMeasures(w, gang);
  const best = { ...(gang.scorePeaks ?? current) };
  best.cash = Math.max(best.cash, current.cash);
  best.territory = Math.max(best.territory, current.territory);
  best.manpower = Math.max(best.manpower, current.manpower);
  return finalScore(current, best, true, 0);
}
