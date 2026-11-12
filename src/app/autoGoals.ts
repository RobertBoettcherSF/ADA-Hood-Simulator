/**
 * Auto Test plays for one of the full game's three wins and sets its policy
 * to suit: run for office (a big enough patch and a lawyer to stand the boss),
 * go straight (enough legal assets, no illegal businesses, nobody on trial),
 * or wipe out the rival gangs. Every few weeks it looks again and switches
 * when another win has clearly come closer.
 */
import { GO_STRAIGHT_ASSETS } from '../sim/constants';
import { availableSpecialist } from '../sim/specialists';
import { electionBlocksRequired } from '../sim/systems/politics';
import type { Gang, WorldState } from '../sim/types';
import { gangAssets, gangManpower, gangWealth, powerRating, territoryCount } from '../sim/world';

export type VictoryGoal = 'office' | 'straight' | 'eliminate' | 'wealth' | 'territory' | 'power';
/** The full game's three wins. */
export const VICTORY_GOALS: readonly VictoryGoal[] = ['office', 'straight', 'eliminate'];
/** A short game has one win: its own race (1.2.20). */
export const MODE_GOAL: Partial<Record<string, VictoryGoal>> = { wealth: 'wealth', territory: 'territory', power: 'power' };
/** The goals open in this game's mode. */
export function goalsFor(w: WorldState): readonly VictoryGoal[] {
  const only = MODE_GOAL[w.options.mode];
  return only ? [only] : VICTORY_GOALS;
}

export interface GoalPolicy {
  /** Share of the crews sent to take new blocks, and the size of each area (1 = normal). */
  expansion: number;
  /** Low: no torching, bombing, kidnapping or killing. High: an extra roll and the smash-ups whatever the strategy. */
  violence: 'low' | 'normal' | 'high';
  /** Whether new rackets go up behind the fronts. */
  illegal: boolean;
}

export const GOAL_POLICY: Record<VictoryGoal, GoalPolicy> = {
  office: { expansion: 1.5, violence: 'normal', illegal: true },
  straight: { expansion: 0.6, violence: 'low', illegal: false },
  eliminate: { expansion: 1, violence: 'high', illegal: true },
  // Wealth race: cash plus assets. Rackets pay best, premises count as assets;
  // fighting only costs men and money.
  wealth: { expansion: 0.8, violence: 'low', illegal: true },
  // Territory race: blocks, as many and as fast as the crews can take them.
  territory: { expansion: 2, violence: 'normal', illegal: true },
  // Power: wealth/1000 + blocks × 3 + men × 4 — grow on every front.
  power: { expansion: 1.5, violence: 'normal', illegal: true },
};

export const GOAL_LABELS: Record<VictoryGoal, string> = {
  office: 'run for office', straight: 'go straight', eliminate: 'eliminate the rivals',
  wealth: 'win the wealth race (cash plus assets)', territory: 'win the territory race (blocks)', power: 'be the most powerful when the clock runs out',
};

/** Weeks between reviews of the goal. */
export const GOAL_REVIEW_WEEKS = 4;
/** How far ahead another goal must score before the desk switches to it. */
export const GOAL_SWITCH_MARGIN = 0.15;

/** How close each win is, roughly 0 (out of reach) to 1 (there). */
export function goalScores(w: WorldState, gang: Gang): Record<VictoryGoal, number> {
  const full = w.options.mode === 'normal';
  const lawyer = !!availableSpecialist(w, gang, 'lawyer');
  const blocks = territoryCount(w, gang.id) / Math.max(1, electionBlocksRequired(w));
  const office = full ? Math.min(1, blocks) * 0.85 + (lawyer ? 0.1 : 0) + (w.election.active && blocks >= 1 ? 0.3 : 0) : 0;
  const openCases = Object.values(w.cases ?? {}).filter((c) => c.gangId === gang.id && (c.status === 'awaiting' || c.status === 'onTrial')).length;
  // Assets are what count; cash only says premises could be bought, so it
  // adds a little and never on its own makes the goal look nearly done.
  const holdings = Math.min(1.1, gangAssets(w, gang) / GO_STRAIGHT_ASSETS) * 0.75 + Math.min(1, Math.max(0, gang.cash) / GO_STRAIGHT_ASSETS) * 0.3;
  const straight = full ? Math.max(0, Math.min(1.1, holdings) * 0.95 + (lawyer ? 0.05 : 0) - openCases * 0.1) : 0;
  const rivals = Object.values(w.gangs).filter((g) => g.id !== gang.id);
  const alive = rivals.filter((g) => !g.eliminated);
  const strongest = Math.max(1, ...alive.map((g) => gangManpower(w, g)));
  const eliminate = alive.length
    ? Math.min(1, gangManpower(w, gang) / strongest / 2) * 0.7 + (rivals.length ? (rivals.length - alive.length) / rivals.length : 0) * 0.5
    : 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  // Short games: only the mode's own race counts.
  const o = w.options;
  const wealth = o.mode === 'wealth' ? Math.min(1, gangWealth(w, gang) / Math.max(1, o.wealthTarget)) : 0;
  const territory = o.mode === 'territory' ? Math.min(1, territoryCount(w, gang.id) / Math.max(1, o.territoryTarget)) : 0;
  const best = Math.max(1, ...alive.map((g) => powerRating(w, g)));
  const power = o.mode === 'power' ? Math.min(1, powerRating(w, gang) / best / 1.2) : 0;
  return { office: round(office), straight: round(straight), eliminate: full ? round(eliminate) : 0,
    wealth: round(wealth), territory: round(territory), power: round(power) };
}

/** The goal to play for: the best scorer, unless the current one is within the margin. */
/** A goal that has not come any closer over the last two reviews scores this much less. */
export const GOAL_STALL_PENALTY = 0.25;

/** Reviews in a row a goal may stall before it is dropped for the next best. */
export const GOAL_STALL_DROP = 2;
/** Weeks a dropped goal stays off the list. */
export const GOAL_DROP_WEEKS = 12;

export function chooseGoal(w: WorldState, gang: Gang, current?: VictoryGoal, stalled = false, excluded: readonly VictoryGoal[] = []): { goal: VictoryGoal; scores: Record<VictoryGoal, number> } {
  const scores = goalScores(w, gang);
  if (current && stalled) scores[current] = Math.max(0, Math.round((scores[current] - GOAL_STALL_PENALTY) * 100) / 100);
  const goals = goalsFor(w);
  // A short game never drops its only goal.
  if (goals.length === 1) return { goal: goals[0], scores };
  const open = goals.filter((g) => !excluded.includes(g));
  if (current && (excluded.includes(current) || !goals.includes(current))) current = undefined;
  const best = [...(open.length ? open : goals)].sort((a, b) => scores[b] - scores[a] || goals.indexOf(a) - goals.indexOf(b))[0];
  if (current && scores[best] - scores[current] < GOAL_SWITCH_MARGIN) return { goal: current, scores };
  return { goal: best, scores };
}

export function formatGoalScores(scores: Record<VictoryGoal, number>, goals: readonly VictoryGoal[] = VICTORY_GOALS): string {
  return goals.map((g) => `${g} ${scores[g]}`).join(', ');
}
