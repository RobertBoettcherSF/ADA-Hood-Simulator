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
/** 1.2.67 (proposed): weeks of win-margin history the kind scales are learned over. */
export const KIND_LEARN_WEEKS = 8;
/** 1.2.67 (proposed): the most a kind scale moves in a week. */
export const KIND_LEARN_STEP = 0.05;
/** 1.2.67 (proposed): the share of crew slots kept filled before a low-worth site takes a manager. */
export const CREW_FILL_MIN = 0.6;
/** 1.2.67 (proposed): empty recruit weeks before the recruiting radius widens. */
export const RECRUIT_WIDEN_WEEKS = 4;
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
/** 1.2.67 (proposed): HOLD needs votes in hand this many over the real win line (votesToWin). */
export const HOLD_VOTE_MARGIN = 10;
/** 1.2.67 (proposed): businesses in blocks not ours put to the cash pass for votes each week. */
export const VOTE_BUYS_PER_WEEK = 6;
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
/** 1.2.66 (proposed): a still's or press's output rate with an average manager (the game: 0.5 + business × 0.14). */
export const STOCK_RATE = 0.85;
/** 1.2.67 (proposed): weeks of our sites' takings a racket type's worth is learned from… */
export const RACKET_LEARN_WEEKS = 4;
/** 1.2.67 (proposed): …once at least this many site-weeks are known. */
export const RACKET_LEARN_MIN = 3;
/** 1.2.67 (proposed): before any history, a racket takes its catalogue profit × this (an average manager and block). */
export const RACKET_MANAGED_RATE = 1;
/** 1.2.67 (proposed): learned speakeasy takings are read back to full supply over at least this share. */
export const RACKET_SUPPLY_FLOOR = 0.25;
/** 1.2.67 (proposed): weeks a lot whose racket the FBI closed waits before a racket is set up on it again. */
export const RAID_REBUILD_WEEKS = 8;
/** 1.2.67 (proposed): weeks a warehouse's export takings must cover its price. */
export const WAREHOUSE_PAYBACK_WEEKS = 12;
/** 1.2.67 (proposed): cases a raid with a truck is expected to carry off (the game: 10–40). */
export const RAID_GOODS_CASES = 25;
/** 1.2.67 (proposed): a warehouse is exported from once it holds this many cases (weekly small loads fetch the best brackets). */
export const EXPORT_MIN_CASES = 8;

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

/** The game closes nominations when fewer than this many election weeks are left (politics.ts officeEntryCheck). */
export const ENTRY_CLOSE_WEEKS = 2;
/** 1.2.67 (proposed): the last blocks to stand are pushed for this many weeks before nominations close. */
export const STAND_LEAD_WEEKS = 4;
/** 1.2.67 (proposed): the least chance a missing block's stand value counts at. */
export const STAND_MIN_P = 0.05;
/** Weeks until nominations close for the next (or present) election. */
export function weeksToEntryClose(w: WorldState): number {
  return Math.max(0, weeksToElection(w) - ENTRY_CLOSE_WEEKS);
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
  /** 1.2.67: the fewest votes that win under the game's count (shares rounded down, the
   * remainder to the sitting mayor's column, ties lost) — votesToWin. */
  need: number;
  civic: [number, number];
  /** The blocks that vote for this gang. */
  kept: Set<number>;
}

/** The game's shares from vote scores: each rounded down, the remainder to the first column. */
export function voteShares(scores: readonly number[]): number[] {
  const total = scores.reduce((a, b) => a + b, 0);
  if (total <= 0) return scores.map(() => 0);
  const p = scores.map((s) => Math.trunc(100 * s / total));
  p[0] += 100 - p.reduce((a, b) => a + b, 0);
  return p;
}

/**
 * 1.2.67 (Robert, point 1): the fewest votes column `at` needs to win — its
 * rounded-down share above every other share, the remainder counted to the
 * first (the sitting mayor's) column and a tie lost (the first listed wins).
 * With 250/250 civic votes this is about 270, not 251.
 */
export function votesToWin(scores: readonly number[], at: number): number {
  const others = scores.map((s, i) => (i === at ? 0 : s));
  const top = Math.max(0, ...others);
  const total = others.reduce((a, b) => a + b, 0);
  for (let x = top + 1; x <= top + total + 1; x++) {
    const p = voteShares(others.map((s, i) => (i === at ? x : s)));
    if (p.every((v, i) => i === at || v < p[at])) return x;
  }
  return top + total + 1;
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
    need: votesToWin(scores, at),
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
