import type { ApiResult, IssueOrderInput } from '../sim/api';
import type { CrewRole } from './autoActions';
import type { VictoryGoal } from './autoGoals';

/**
 * 1.2.23: Auto Test's one weekly decision loop. Every part of the planning desk
 * puts its crew orders forward as candidates (what, what for, how much it is
 * worth); the loop scores them by the game's goal and hands each to the crew
 * that suits it and still has the time, best first. The log says why each won.
 */
export type OrderKind = 'men' | 'money' | 'territory' | 'business' | 'safety' | 'violence' | 'intel';

/** How much each kind of work counts toward each win. */
export const KIND_WEIGHTS: Record<VictoryGoal, Record<OrderKind, number>> = {
  territory: { men: 1.5, money: 1, territory: 2, business: 1, safety: 1.2, violence: 1, intel: 0.8 },
  wealth: { men: 1, money: 1.4, territory: 0.8, business: 1.6, safety: 1.2, violence: 0.5, intel: 0.5 },
  power: { men: 1.6, money: 1.1, territory: 1.4, business: 1, safety: 1.2, violence: 1.1, intel: 0.8 },
  office: { men: 1.2, money: 1, territory: 1.6, business: 1.1, safety: 1.4, violence: 0.7, intel: 0.6 },
  straight: { men: 0.8, money: 1, territory: 0.6, business: 2, safety: 1.5, violence: 0.2, intel: 0.4 },
  eliminate: { men: 1.4, money: 1, territory: 1, business: 0.8, safety: 1.1, violence: 1.6, intel: 1.2 },
};

export interface Proposal<T> {
  label: string;
  kind: OrderKind;
  /** Worth to the gang, in dollars a week or their equivalent. */
  value: number;
  /** Why it is on the list, for the log. */
  why?: string;
  /** The order, or how to size it for the crew that takes it. */
  input: Omit<IssueOrderInput, 'teamId'> | ((team: T) => Omit<IssueOrderInput, 'teamId'>);
  /** The crew job it suits best. */
  role?: CrewRole;
  /** Only these crews, best first (an armed crew for a strike). */
  teams?: T[];
  /** Called once the order is accepted. */
  onGiven?: (team: T, result: ApiResult) => void;
  /** Called when no crew could take it (for the log). */
  onSkipped?: () => void;
  /** Least free minutes a crew needs for this one (a strike needs most of a day). */
  minFree?: number;
  /** Called on the chosen crew just before the order is issued (arm it for a strike). */
  prepare?: (team: T) => void;
}

export interface CrewSlot<T> {
  team: T;
  name: string;
  role?: CrewRole;
  /** Minutes left in the crew's week. */
  free: () => number;
  /** The business crew: buys and set-ups only. */
  businessOnly?: boolean;
}

export interface Decision { label: string; crew?: string; score: number; line: string }

export function inputFor<T>(p: Proposal<T>, team: T): Omit<IssueOrderInput, 'teamId'> {
  return typeof p.input === 'function' ? p.input(team) : p.input;
}

export function scoreOf<T>(goal: VictoryGoal, p: Proposal<T>): number {
  return Math.round(p.value * KIND_WEIGHTS[goal][p.kind]);
}

/** Least free minutes a crew needs before it is offered anything. */
export const MIN_FREE_MINUTES = 30;

export function decideWeek<T>(
  goal: VictoryGoal,
  proposals: Proposal<T>[],
  crews: CrewSlot<T>[],
  issue: (label: string, team: T, p: Proposal<T>) => ApiResult,
): { given: Decision[]; skipped: Decision[] } {
  const given: Decision[] = [], skipped: Decision[] = [];
  const ranked = proposals.map((p, i) => ({ p, i, score: scoreOf(goal, p) })).sort((a, b) => b.score - a.score || a.i - b.i);
  for (const { p, score } of ranked) {
    // 1.2.25 (Robert's rule): business work — buying a business, buying land,
    // setting up on our land — goes to the business crew and nobody else; the
    // business crew takes nothing else. No business crew: nobody buys.
    const allowed = (c: CrewSlot<T>) => (p.kind === 'business') === !!c.businessOnly;
    const slots = p.teams
      ? p.teams.map((t) => crews.find((c) => c.team === t)).filter((c): c is CrewSlot<T> => !!c && allowed(c))
      : crews.filter(allowed).sort((a, b) => Number(b.role === p.role && p.role != null) - Number(a.role === p.role && p.role != null) || b.free() - a.free());
    const open = slots.filter((c) => c.free() >= (p.minFree ?? MIN_FREE_MINUTES));
    const weight = KIND_WEIGHTS[goal][p.kind];
    const why = `score ${score} = value ${Math.round(p.value)} × ${goal} weight ${weight} for ${p.kind}${p.why ? ` — ${p.why}` : ''}`;
    if (!open.length) {
      const none = !slots.length && p.kind === 'business' ? 'no business crew yet — nobody else buys' : `no crew with time${p.teams ? ' among those fit for it' : ''}`;
      skipped.push({ label: p.label, score, line: `NOT GIVEN ${p.label}: ${why}; ${none}` });
      p.onSkipped?.();
      continue;
    }
    let done = false, lastError = '';
    for (const slot of open.slice(0, 3)) {
      const free = Math.round(slot.free());
      p.prepare?.(slot.team);
      const result = issue(p.label, slot.team, p);
      if (result.ok) {
        given.push({ label: p.label, crew: slot.name, score, line: `WON ${p.label} → ${slot.name}: ${why}; ${free} min free before it` });
        p.onGiven?.(slot.team, result);
        done = true;
        break;
      }
      lastError = result.error;
      // Only a lack of time is worth trying on another crew.
      if (!/time|busy|Every crew|elsewhere/i.test(result.error)) break;
    }
    if (!done) { skipped.push({ label: p.label, score, line: `NOT GIVEN ${p.label}: ${why}; ${lastError}` }); p.onSkipped?.(); }
  }
  return { given, skipped };
}
