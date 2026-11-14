/**
 * 1.2.50 (Robert): the fitness terms of a gang, read from the world as it
 * stands (so player Auto and, later, the rivals can share them). Stage 1
 * reports them; the protection scores below are logged beside the old
 * order values without deciding anything yet.
 */
import { FEAR_LOST_UNCOLLECTED, FITNESS_WEIGHTS } from './fitnessWeights';
import type { Building, ID, WorldState } from './types';
import { protectedBuildings } from './world';

/** Protection over one week: what our shops owe, what was collected, and why the rest was not. */
export interface ProtectionWeek {
  shops: number;
  /** Weekly protection owed to us by every shop we protect (rates as they stand now). */
  claimed: number;
  /** Owed by the shops that paid in the week (the full amount, before any skim). */
  collected: number;
  /** Owed by shops whose owner refused in the week. */
  refused: number;
  /** Owed by shops not trading (nothing to collect). */
  closed: number;
  /** Owed by trading shops nobody called on. */
  notVisited: number;
}

/** The week's protection for a gang (week = the week just played). */
export function protectionWeek(w: WorldState, gangId: ID, week: number): ProtectionWeek {
  const out: ProtectionWeek = { shops: 0, claimed: 0, collected: 0, refused: 0, closed: 0, notVisited: 0 };
  for (const b of protectedBuildings(w, gangId)) {
    const owed = b.protection!.weekly;
    out.shops++; out.claimed += owed;
    if (b.protection!.collectedWeek === week) out.collected += owed;
    else if (b.protection!.refusedWeek === week) out.refused += owed;
    else if (b.state !== 'trading') out.closed += owed;
    else out.notVisited += owed;
  }
  return out;
}

/** The protection metric: claimed and collected up, uncollected down. */
export function protectionScore(p: Pick<ProtectionWeek, 'claimed' | 'collected' | 'refused' | 'closed' | 'notVisited'>): number {
  const uncollected = p.refused + p.closed + p.notVisited;
  return FITNESS_WEIGHTS.claimed * p.claimed + FITNESS_WEIGHTS.collected * p.collected + FITNESS_WEIGHTS.uncollected * uncollected;
}

/**
 * Stage 2 (shadow): what collecting these shops is worth by the metric — each
 * dollar moves from uncollected to collected, and a shop not collected last
 * week keeps the fear it would lose again this week.
 */
export function collectFitness(w: WorldState, shops: Building[]): number {
  let score = 0;
  for (const b of shops) {
    const owed = b.protection?.weekly ?? 0;
    score += (FITNESS_WEIGHTS.collected - FITNESS_WEIGHTS.uncollected) * owed;
    if (b.protection && b.protection.collectedWeek !== w.week - 1 && b.protection.refusedWeek !== w.week - 1) score += FITNESS_WEIGHTS.fearPoint * FEAR_LOST_UNCOLLECTED;
  }
  return Math.round(score);
}

/** Stage 2 (shadow): what extorting a shop is worth — chance × weekly protection × the weeks it is expected to pay, claimed and then collected. */
export function extortFitness(chance: number, weekly: number): number {
  return Math.round(chance * weekly * FITNESS_WEIGHTS.extortWeeks * (FITNESS_WEIGHTS.claimed + FITNESS_WEIGHTS.collected));
}
