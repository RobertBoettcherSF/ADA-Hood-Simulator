/**
 * The spending mix Auto Test tries, and the diary rules around it.
 * Learning compares runs that share opponent level, economy, and map size.
 * Other difficulties stay in the file and are not mixed in.
 */
import { Rng } from '../sim/rng';
import type { RivalPlaybook } from '../sim/types';

export const SPEND_KEYS = ['hiring', 'rackets', 'bribes', 'buying', 'violence'] as const;
export type SpendKey = (typeof SPEND_KEYS)[number];

export interface PlayStrategy {
  weights: Record<SpendKey, number>;
  priority: SpendKey[];
}

/** The campaign the diary is trying to get good at. Other combinations are stored apart. */
export const DEFAULT_CAMPAIGN = { opponents: 'normal', economy: 'normal', mapW: 40, mapH: 32 } as const;

export interface CampaignSettings {
  opponents: 'passive' | 'normal' | 'aggressive' | 'random';
  economy: 'weak' | 'normal' | 'strong';
  mapW: number;
  mapH: number;
}

export interface DiaryEntry {
  at: string;
  settings: CampaignSettings;
  seed: number;
  weeks: number | null;
  speed: number;
  learn: boolean;
  strategy: PlayStrategy;
  changes: string[];
  summary: { week: number; cash: number; men: number; territory: number; heat: number; buildings: number }[];
  score: number;
  outcome: string;
  beatBest: boolean;
  previousBest: number | null;
  anomalies: string[];
}

export interface Diary {
  version: 1;
  entries: DiaryEntry[];
}

/** How many matching runs must share one best score before the report calls it a plateau. */
export const PLATEAU_RUNS = 4;
/** Rivals ignore the diary until the default campaign has this many runs. */
export const RIVAL_RUNS = 3;

export function defaultStrategy(): PlayStrategy {
  return {
    weights: { hiring: 0.85, rackets: 0.72, bribes: 0.22, buying: 0.28, violence: 0.08 },
    priority: ['hiring', 'rackets', 'bribes', 'buying', 'violence'],
  };
}

export function sameCampaign(a: CampaignSettings, b: CampaignSettings): boolean {
  return a.opponents === b.opponents && a.economy === b.economy && a.mapW === b.mapW && a.mapH === b.mapH;
}

export function isDefaultCampaign(settings: CampaignSettings): boolean {
  return sameCampaign(settings, DEFAULT_CAMPAIGN);
}

export function campaignLabel(settings: CampaignSettings): string {
  return `${settings.opponents} opponents, ${settings.economy} economy, ${settings.mapW}×${settings.mapH}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampWeight(n: number): number {
  return round2(Math.min(0.95, Math.max(0.05, n)));
}

export function cloneStrategy(strategy: PlayStrategy): PlayStrategy {
  return { weights: { ...strategy.weights }, priority: [...strategy.priority] };
}

/** Nudge two weights, and sometimes swap two neighbours in the priority list. */
export function mutateStrategy(base: PlayStrategy, rng: Rng): { strategy: PlayStrategy; changes: string[] } {
  const strategy = cloneStrategy(base);
  const changes: string[] = [];
  const first = SPEND_KEYS[rng.int(0, SPEND_KEYS.length - 1)];
  const rest = SPEND_KEYS.filter((key) => key !== first);
  const second = rest[rng.int(0, rest.length - 1)];
  for (const key of [first, second]) {
    const before = strategy.weights[key];
    const after = clampWeight(before + (rng.chance(0.5) ? 0.08 : -0.08));
    strategy.weights[key] = after;
    if (after !== before) changes.push(`${key} ${before.toFixed(2)} → ${after.toFixed(2)}`);
  }
  if (rng.chance(0.35)) {
    const i = rng.int(0, strategy.priority.length - 2);
    const a = strategy.priority[i];
    const b = strategy.priority[i + 1];
    strategy.priority[i] = b;
    strategy.priority[i + 1] = a;
    changes.push(`priority ${a} swapped with ${b}`);
  }
  if (!changes.length) {
    const before = strategy.weights[first];
    const after = clampWeight(before + 0.08);
    strategy.weights[first] = after;
    changes.push(`${first} ${before.toFixed(2)} → ${after.toFixed(2)}`);
  }
  return { strategy, changes };
}

export function diffStrategy(before: PlayStrategy, after: PlayStrategy): string[] {
  const lines: string[] = [];
  for (const key of SPEND_KEYS) {
    if (before.weights[key] !== after.weights[key]) lines.push(`${key} ${before.weights[key].toFixed(2)} → ${after.weights[key].toFixed(2)}`);
  }
  if (before.priority.join(',') !== after.priority.join(',')) {
    lines.push(`priority ${before.priority.join(', ')} → ${after.priority.join(', ')}`);
  }
  return lines;
}

export function formatStrategy(strategy: PlayStrategy): string[] {
  const weights = SPEND_KEYS.map((key) => `${key} ${strategy.weights[key].toFixed(2)}`).join(', ');
  return [weights, `priority: ${strategy.priority.join(', ')}`];
}

/** Cash, territory, and men raise it. Heat lowers it. A win or a loss moves it a long way. */
export function scoreRun(last: { cash: number; territory: number; men: number; heat: number } | undefined, won: boolean | null): number {
  const verdict = won === true ? 500 : won === false ? -500 : 0;
  if (!last) return verdict;
  return Math.round(last.cash / 1000 + last.territory * 25 + last.men * 8 - last.heat * 4 + verdict);
}

export function matchingEntries(diary: Diary, settings: CampaignSettings): DiaryEntry[] {
  return diary.entries.filter((entry) => sameCampaign(entry.settings, settings));
}

export function bestEntry(entries: DiaryEntry[]): DiaryEntry | null {
  return entries.reduce<DiaryEntry | null>((best, entry) => (best == null || entry.score > best.score ? entry : best), null);
}

export interface PlannedRun {
  strategy: PlayStrategy;
  /** Mutations away from the parent this run started from. */
  changes: string[];
  /** Difference from the previous matching run, which is what the report prints. */
  versusLast: string[];
  note: string;
  previousBest: number | null;
}

/** (1+1): mutate the best matching run. A worse child is not the parent next time. */
export function planRun(diary: Diary, settings: CampaignSettings, seed: number, learn: boolean): PlannedRun {
  const matching = matchingEntries(diary, settings);
  const last = matching[matching.length - 1] ?? null;
  const best = bestEntry(matching);
  if (!learn) {
    const strategy = defaultStrategy();
    return {
      strategy,
      changes: ['Learning is off. Built-in strategy.'],
      versusLast: last ? diffStrategy(last.strategy, strategy) : ['Learning is off. Built-in strategy.'],
      note: 'Learning is off. This run uses the built-in strategy and is still written in the diary.',
      previousBest: best?.score ?? null,
    };
  }
  if (!best || !last) {
    const strategy = defaultStrategy();
    return {
      strategy,
      changes: ['First run for these settings. Built-in strategy.'],
      versusLast: ['First run for these settings. Built-in strategy.'],
      note: 'No earlier run has these settings.',
      previousBest: null,
    };
  }
  const rng = new Rng(seed + matching.length * 9973);
  const mutated = mutateStrategy(best.strategy, rng);
  const returned = last.score < best.score;
  const note = returned
    ? `The last matching run scored ${last.score}, below the best ${best.score}, so this run started from the best again.`
    : `Started from the best matching run, score ${best.score}.`;
  return {
    strategy: mutated.strategy,
    changes: mutated.changes,
    versusLast: diffStrategy(last.strategy, mutated.strategy),
    note,
    previousBest: best.score,
  };
}

export function plateauNote(entries: DiaryEntry[], settings: CampaignSettings): string {
  const matching = entries.filter((entry) => sameCampaign(entry.settings, settings));
  if (matching.length < PLATEAU_RUNS) {
    const noun = matching.length === 1 ? 'run' : 'runs';
    return `Plateau: not yet (${matching.length} matching ${noun}; the best score has to sit still for ${PLATEAU_RUNS}).`;
  }
  const tail = matching.slice(-PLATEAU_RUNS);
  const tailIds = new Set(tail);
  let best = -Infinity;
  const bests: number[] = [];
  for (const entry of matching) {
    best = Math.max(best, entry.score);
    if (tailIds.has(entry)) bests.push(best);
  }
  if (bests.every((score) => score === bests[0])) {
    return `Plateau: the best score has stayed ${bests[0]} for the last ${PLATEAU_RUNS} matching runs.`;
  }
  return `Plateau: still moving. Best over the last ${PLATEAU_RUNS} matching runs went ${bests.join(', ')}.`;
}

/** The playbook a new default-campaign city should copy, or null when rivals should stay as they are. */
export function playbookForNewCity(diary: Diary | null): RivalPlaybook | null {
  const matching = (diary?.entries ?? []).filter((entry) => isDefaultCampaign(entry.settings));
  if (matching.length < RIVAL_RUNS) return null;
  const best = bestEntry(matching);
  if (!best) return null;
  return { weights: { ...best.strategy.weights }, priority: [...best.strategy.priority] };
}

export function strategyLines(strategy: PlayStrategy): string {
  return formatStrategy(strategy).join('\n');
}

export interface BalanceWeek {
  week: number;
  cash: number;
  men: number;
  territory: number;
  heat: number;
  suspicion: number;
  standings: string;
}

/** Numbers and repeated refusals that look like a balance problem rather than bad luck. */
export function balanceAnomalies(weeks: BalanceWeek[], actions: string[], won: boolean | null, blocks: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i];
    if (!Number.isFinite(week.cash) || !Number.isFinite(week.men) || !Number.isFinite(week.territory) || !Number.isFinite(week.heat)) {
      lines.push(`Week ${week.week}: a score is not a finite number (cash ${week.cash}, men ${week.men}, territory ${week.territory}, heat ${week.heat}).`);
    }
    if (week.cash < 0) lines.push(`Week ${week.week}: cash is ${week.cash}.`);
    if (week.men < 0) lines.push(`Week ${week.week}: manpower is ${week.men}.`);
    if (week.territory < 0 || week.territory > blocks) lines.push(`Week ${week.week}: territory ${week.territory} is outside 0..${blocks}.`);
    if (week.heat < 0 || week.heat > 100) lines.push(`Week ${week.week}: average heat is ${week.heat}.`);
    if (week.suspicion < 0 || week.suspicion > 100) lines.push(`Week ${week.week}: suspicion is ${week.suspicion}.`);
    const prev = weeks[i - 1];
    if (prev && prev.cash >= 5000 && week.cash >= prev.cash * 8 && week.cash - prev.cash >= 25000) {
      lines.push(`Week ${week.week}: cash jumped from ${prev.cash} to ${week.cash}.`);
    }
    for (const part of week.standings.split(';')) {
      const cash = part.match(/\$(-?\d+)/);
      const men = part.match(/men (-?\d+)/);
      if (cash && Number(cash[1]) < 0) lines.push(`Week ${week.week}: negative cash in the standings (${part.trim()}).`);
      if (men && Number(men[1]) < 0) lines.push(`Week ${week.week}: negative manpower in the standings (${part.trim()}).`);
    }
  }
  const refused = new Map<string, number>();
  for (const action of actions) {
    if (!action.startsWith('FAIL ')) continue;
    const label = action.slice(5).split(' — ')[0];
    refused.set(label, (refused.get(label) ?? 0) + 1);
  }
  for (const [label, count] of refused) {
    if (count >= 2) lines.push(`Action refused ${count} times: ${label}.`);
  }
  if (won === true && weeks.length <= 1) lines.push('Victory on the first finished week.');
  const last = weeks[weeks.length - 1];
  if (won === false && last && last.cash > 50000 && last.men > 8) {
    lines.push(`Lost while the books still showed $${last.cash} and ${last.men} men.`);
  }
  if (last && last.men === 0 && won !== false) lines.push(`Week ${last.week}: the gang has no men and the city has not recorded a loss.`);
  return lines;
}
