/**
 * 1.2.66 (Robert): one win model for every ending. Each ending gets an
 * estimate of the weeks to reach it (Any picks the cheapest), a chance of
 * winning from its margin to target (logistic, a band of its own units) and
 * so a dollar value of one more unit toward it (a vote, a $ of assets, a
 * rival man, a block, a power point). Orders are priced by the units they add.
 * All numbers here are proposed.
 */
import { originalElectionCity, originalElectionSlot } from '../sim/originalElection';
import { originalElectionVotes } from '../sim/originalElectionVotes';
import { ELECTION_WEEKS, MAYOR_ELECTION_CYCLE } from '../sim/constants';
import type { WorldState } from '../sim/types';

/** 1.2.66 (proposed): winning is worth this many weeks of the gang's takings… */
export const WIN_WEEKS = 52;
/** 1.2.66 (proposed): …and at least this much. */
export const WIN_MIN = 100_000;
/** 1.2.66 (proposed): Any switches ending only when another is at least this many weeks closer. */
export const GOAL_SWITCH_WEEKS = 4;
/** 1.2.66 (proposed): how far the learned share of the win-chance gain moves a kind weight (±25%). */
export const KIND_LEARN_RATE = 0.25;
/** 1.2.66 (proposed): weeks of history a growth rate is read over. */
export const WIN_GROWTH_WEEKS = 4;
/** 1.2.66 (proposed): an ending that cannot be reached at the present pace counts this many weeks away. */
export const NEVER_WEEKS = 999;
/** 1.2.66 (proposed): the horizon an ending without a date (straight, eliminate) is judged over. */
export const WIN_HORIZON_WEEKS = 26;

// Going straight
/** 1.2.66 (proposed): margin band in $ of assets. */
export const ASSET_BAND = 25_000;
/** 1.2.66 (proposed): the most assets the gang can buy in a week from cash. */
export const ASSET_BUY_PER_WEEK = 20_000;
/** 1.2.66 (proposed): the share of cash that turns into assets when spent on premises. */
export const CASH_TO_ASSETS = 0.8;
/** 1.2.66 (proposed): weeks to find and hire a lawyer. */
export const LAWYER_HIRE_WEEKS = 2;
/** 1.2.66 (proposed): weeks an open case holds the ending back. */
export const CASE_WEEKS = 3;
/** 1.2.66 (proposed): weeks each illegal business holds the ending back (shut-down and its land). */
export const ILLEGAL_CLOSE_WEEKS = 0.5;

// Last gang standing
/** 1.2.66 (proposed): margin band in rival men. */
export const ELIMINATE_BAND_MEN = 10;
/** 1.2.66 (proposed): weeks a stance level takes to cool toward an alliance with the last rival. */
export const ALLY_WEEKS_PER_LEVEL = 4;

// Races
/** 1.2.66 (proposed): margin band for the territory and wealth races, in weeks ahead of the best rival. */
export const RACE_WEEKS_BAND = 4;
/** 1.2.66 (proposed): margin band for the power clock, in power points. */
export const POWER_BAND = 20;

// Mayor
/** 1.2.65 (proposed): votes over which the chance of winning goes from 27% to 73%. */
export const OFFICE_VOTE_BAND = 20;
/** 1.2.66 (proposed): a block whose voter average is within this of the kept line (64) counts as at risk. */
export const KEPT_RISK_MARGIN = 10;
/** 1.2.66 (proposed): an expansion share once the vote projection already reaches the target. */
export const OFFICE_HOLD_EXPANSION = 0.6;
/** The game's kept line and lost line for a block's voters. */
export const KEPT_LINE = 64;
export const LOST_LINE = 164;

// Rival mayor guard
/** 1.2.66 (proposed): the share of a rival's vote a claim on one of its kept blocks takes (claims overlap). */
export const RIVAL_BLOCK_VOTE_SHARE = 0.5;
/** 1.2.66 (proposed): a rival is watched at the poll once its chance of the mayoralty passes this. */
export const RIVAL_POLL_WATCH = 0.05;

// Stock rackets
/** The game's export prices a unit (execution.ts export). */
export const GOODS_PRICE = { liquor: 26, stolen: 34, counterfeit: 900 } as const;
/** 1.2.66 (proposed): a still's or press's output rate with an average manager (the game: 0.5 + business × 0.14). */
export const STOCK_RATE = 0.85;
/** 1.2.66 (proposed): the share of the output sold with no outlet of ours yet (no warehouse, no speakeasy for liquor). */
export const STOCK_NO_OUTLET = 0.25;

export const winValue = (takingsWeek: number) => Math.max(WIN_MIN, Math.round(Math.max(0, takingsWeek) * WIN_WEEKS));
export const logistic = (margin: number, band: number) => 1 / (1 + Math.exp(-margin / Math.max(1e-9, band)));
/**
 * The dollar value of one more unit toward the ending: the win value × the
 * chance it adds, with a floor while short (win ÷ 2 × (short + band)) so a far
 * race still values progress. No floor once the target is met.
 */
export const perUnit = (win: number, P: number, short: number, band: number) =>
  win * Math.max(P * (1 - P) / band, short > 0 ? 1 / (2 * (short + band)) : 0);
/** Growth a week over the last WIN_GROWTH_WEEKS entries (newest last). */
export const growthOf = (hist: readonly number[]) => {
  const h = hist.slice(-(WIN_GROWTH_WEEKS + 1));
  return h.length > 1 ? (h[h.length - 1] - h[0]) / (h.length - 1) : 0;
};

/** Weeks until the next election closes (the present one when under way). */
export function weeksToElection(w: WorldState): number {
  const term = w.election.mayorTerm;
  return w.election.active ? w.election.weeksLeft : Math.max(1, MAYOR_ELECTION_CYCLE - (term?.weeks ?? 0)) + ELECTION_WEEKS;
}

/** Weeks to the first election at which `short` votes are made up at `growth` a week. */
export function weeksToOffice(w: WorldState, short: number, growth: number): number {
  const E = weeksToElection(w);
  if (short <= 0) return E;
  if (growth <= 0) return NEVER_WEEKS;
  const n = short / growth;
  if (n <= E) return E;
  return Math.min(NEVER_WEEKS, E + Math.ceil((n - E) / MAYOR_ELECTION_CYCLE) * MAYOR_ELECTION_CYCLE);
}

export interface TrialPoll {
  /** This gang's votes with it standing. */
  ours: number;
  /** The votes to beat: the bigger civic share or any other standing gang. */
  beat: number;
  civic: [number, number];
  /** The blocks that vote for this gang. */
  kept: Set<number>;
}

/** The game's vote count as it would stand now with this gang standing (and the Teamsters its own when asked). */
export function trialPoll(w: WorldState, gangId: number, teamsters = false, alsoStanding: readonly number[] = []): TrialPoll | null {
  const city = originalElectionCity(w), slot = originalElectionSlot(w, gangId);
  if (!city || slot == null) return null;
  const extra = alsoStanding.map((id) => originalElectionSlot(w, id)).filter((s): s is NonNullable<typeof s> => s != null);
  const standing = [...new Set([...city.standingGangSlots, ...extra, slot])];
  const weights = city.teamstersWeights.map((x, i) => (teamsters && i === slot ? Math.max(1, x) : x)) as unknown as typeof city.teamstersWeights;
  const r = originalElectionVotes({ ...city, standingGangSlots: standing, teamstersWeights: weights });
  const scores = r.scores ?? [0, 0];
  const at = 2 + standing.indexOf(slot);
  return {
    ours: scores[at] ?? 0,
    beat: Math.max(0, ...scores.filter((_, i) => i !== at)),
    civic: [scores[0] ?? 0, scores[1] ?? 0],
    kept: new Set(r.support[slot] ?? []),
  };
}

/** The chance a block votes for us from its voter average (the game: kept under 64, a quota of the reluctant up to 164). */
export function keepChance(avg: number | null): number {
  if (avg == null) return 1;
  if (avg < KEPT_LINE) return 1;
  if (avg >= LOST_LINE) return 0;
  return (LOST_LINE - avg) / 100;
}

/** 1.2.66: the learned scale on each kind weight from its share of the win-margin gain (KIND_LEARN_RATE). */
export function kindScales(hist: readonly { logit: number; kinds: Record<string, number> }[]): Record<string, number> {
  const credit: Record<string, number> = {};
  for (let i = 0; i + 1 < hist.length; i++) {
    const gain = hist[i + 1].logit - hist[i].logit;
    const total = Object.values(hist[i].kinds).reduce((a, b) => a + Math.max(0, b), 0);
    if (!total || !Number.isFinite(gain)) continue;
    for (const [k, v] of Object.entries(hist[i].kinds)) credit[k] = (credit[k] ?? 0) + gain * Math.max(0, v) / total;
  }
  const top = Math.max(0, ...Object.values(credit).map(Math.abs));
  const out: Record<string, number> = {};
  if (top < 1e-6) return out;
  for (const [k, c] of Object.entries(credit)) out[k] = 1 + KIND_LEARN_RATE * c / top;
  return out;
}
