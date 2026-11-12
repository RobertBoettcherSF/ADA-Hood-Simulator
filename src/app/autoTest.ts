/**
 * A player made of the same actions the desk uses. The seed picks his choices
 * and, when learning is on, which weights to nudge. It does not touch the
 * city's random stream until the week itself runs.
 */
import { lastSavedBytes, recordPastGame, utf8Length } from './save';
import { gameScoreNow } from '../sim/scoring';
import { clearWeekHeaps, noteAutoTestRunning, noteAutoTestStopped, noteLastAutoTest, noteWeekHeap, writeReportFile } from './debugReport';

let autoTestRunning = false;
let stopAfterThisWeek = false;
let stoppedThisRun = false;
const runListeners = new Set<() => void>();

function emitAutoTestRun(): void {
  for (const listener of runListeners) listener();
}

/** Whether a test is in progress, and whether the player asked it to stop. */
export function autoTestRunState(): { running: boolean; stopping: boolean } {
  return { running: autoTestRunning, stopping: stopAfterThisWeek };
}

export function onAutoTestRun(listener: () => void): () => void {
  runListeners.add(listener);
  return () => { runListeners.delete(listener); };
}

/** Lit while a test runs. Click once to stop after the week now settling; click again to keep going. */
export function toggleAutoTestStop(): boolean {
  if (!autoTestRunning) return false;
  stopAfterThisWeek = !stopAfterThisWeek;
  emitAutoTestRun();
  return stopAfterThisWeek;
}

export function takeAutoTestStopped(): boolean {
  const stopped = stoppedThisRun;
  stoppedThisRun = false;
  return stopped;
}
import { folderDiary, loadDiary, serializeDiary, type DiarySink } from './diary';
import { Rng } from '../sim/rng';
import { buySnitchInfo, canGoStraight, setPay, shutdownBuilding, setGoStraight, setRunForOffice, buyVehicle, buyWeapon, hireRecruit, issueOrder, issueStreetOrder, moveToPool, moveToTeam, nearTerritory, promote, sackPerson, transferWeapon, type ApiResult, type IssueOrderInput } from '../sim/api';
import { ACTION_KEYS, ACTION_LABELS, assignCrewRoles, carMinutesSaved, crewNames, defaultActionRanks, judgeAction, loadActionRanks, raidValue, rankDown, rankUp, rollAction, talentSwaps, type ActionKey, type ActionRanks, type CrewRole, type PendingAction } from './autoActions';
import { DRIVE_SPEED, GO_STRAIGHT_ASSETS, VEHICLES, WALK_SPEED, WEAPONS } from '../sim/constants';
import type { Building, WeaponId } from '../sim/types';
import { BUILDING_BY_ID, ILLEGAL_TYPES } from '../sim/data/buildings';
import { isValidAreaTarget } from '../sim/execution';
import type { Sim } from '../sim/sim';
import { buildingDoor, dist, gangAssets, gangManpower, gangMembers, protectedBuildings, territoryBlocks, territoryCount } from '../sim/world';
import { effectiveHostility } from '../sim/attitudes';
import { buildingList, peopleList } from '../sim/entityLists';
import { MINUTES_PER_WEEK } from '../sim/constants';
import { chooseGoal, formatGoalScores, goalsFor, GOAL_LABELS, GOAL_POLICY, GOAL_DROP_WEEKS, GOAL_REVIEW_WEEKS, GOAL_STALL_DROP, GOAL_STALL_PENALTY, goalScores, type VictoryGoal } from './autoGoals';
import { campaignWeeklyCost, canRunForOffice, electionBlocksRequired } from '../sim/systems/politics';

const UNAVAILABLE = new Set(['dead', 'arrested', 'onTrial', 'jailed', 'kidnapped']);

/**
 * LOST lines for everyone who was in the gang and at liberty before the week
 * and is now gone or out of action, with the cause and culprit when the sim
 * recorded them. key groups them for the report's summary.
 */
export function lostLines(w: Sim['world'], gangId: number, before: Map<number, string>, sinceWeek: number): { text: string; key: string }[] {
  const recorded = memberLosses(w, gangId, sinceWeek);
  const out: { text: string; key: string }[] = [];
  for (const [id, was] of before) {
    const p = w.people[id];
    if (!p || UNAVAILABLE.has(was)) continue;
    const gone = p.gangId !== gangId;
    if (!gone && !UNAVAILABLE.has(p.status)) continue;
    const loss = [...recorded].reverse().find((l) => l.personId === id);
    let cause = loss?.cause, by = loss?.by;
    if (!cause) {
      if (p.status === 'dead') cause = 'died';
      else if (p.status === 'kidnapped') { cause = 'kidnapped'; by = p.capturedBy != null ? w.gangs[p.capturedBy]?.name : undefined; }
      else if (p.status === 'arrested' || p.status === 'onTrial') { cause = 'arrested'; by = 'the police'; }
      else if (p.status === 'jailed') { cause = 'jailed'; by = 'the courts'; }
      else if (gone && p.gangId != null) { cause = 'joined another gang'; by = w.gangs[p.gangId]?.name; }
      else cause = `left the gang (loyalty ${Math.round(p.loyalty)}, paid $${p.pay}, wanted $${p.payDemand})`;
    }
    const kind = /deserted|left the gang/.test(cause) ? 'deserted' : /arrest/.test(cause) ? 'arrested' : /convicted|jailed/.test(cause) ? 'jailed'
      : /kidnap/.test(cause) ? 'kidnapped' : /sacked/.test(cause) ? 'sacked' : p.status === 'dead' ? 'killed' : 'lost';
    out.push({ text: `LOST ${p.name} (${p.role}) — ${cause}${by ? ` [${by}]` : ''}`, key: `${kind}${by ? ` by ${by}` : ''}` });
  }
  return out;
}

/** The win Auto Test is playing for in each city, when it last looked, and every change of mind. */
const goalOf = new WeakMap<Sim['world'], { goal: VictoryGoal; reviewedWeek: number; history: string[]; progress: number[]; stalls: number; dropped: { goal: VictoryGoal; until: number }[] }>();
/** The goal and its switches so far, for the report and the diary. */
export function autoTestGoal(w: Sim['world']): { goal: VictoryGoal; history: string[] } | undefined {
  const state = goalOf.get(w);
  return state ? { goal: state.goal, history: [...state.history] } : undefined;
}

/** The ranked action table for this run, and what was tried last Monday. */
let actionRanks: ActionRanks = defaultActionRanks();
/**
 * The time ledger: how many minutes one target of each order type has taken,
 * keyed "type|car" or "type|foot" (a running average, kept in the diary).
 */
let timeLedger: Record<string, number> = {};
export const ledgerKey = (type: string, car: boolean) => `${type}|${car ? 'car' : 'foot'}`;
/** Fold one order's minutes per target into the ledger. */
export function noteLedger(ledger: Record<string, number>, key: string, minutesPerTarget: number): void {
  if (!(minutesPerTarget > 0) || !Number.isFinite(minutesPerTarget)) return;
  const before = ledger[key];
  ledger[key] = Math.round(before == null ? minutesPerTarget : before * 0.7 + minutesPerTarget * 0.3);
}
/** How many of the targets fit in the time a crew has left, by the ledger (all of them when the ledger has no figure yet). */
export function targetsThatFit(ledger: Record<string, number>, key: string, targets: number, freeMinutes: number): number {
  const each = ledger[key];
  if (each == null) return targets;
  return Math.max(0, Math.min(targets, Math.floor(freeMinutes / each)));
}
export function currentTimeLedger(): Record<string, number> { return { ...timeLedger }; }
/** Crews whose orders were refused for lack of time last week. */
const shortCrews = new WeakMap<Sim['world'], Set<number>>();
let pendingActions: PendingAction[] = [];
/** Men the talent pass moved this run; the crew balancer leaves them where they are. */
const talentPlaced = new Set<number>();
export function currentActionRanks(): ActionRanks { return { ...actionRanks }; }
import { memberLosses } from '../sim/memberLosses';
import { availableSpecialist } from '../sim/specialists';
import { queueSpecialistJob } from '../sim/specialistJobs';
import { bribePrice, isBribableOfficial, refusesBribe } from '../sim/officials';
import {
  balanceAnomalies,
  campaignLabel,
  formatStrategy,
  isDefaultCampaign,
  matchingEntries,
  planRun,
  plateauNote,
  scoreRun,
  type CampaignSettings,
  type DiaryEntry,
  type PlayStrategy,
} from './strategy';

export interface AutoTestSettings {
  /** Null runs until the city is won or lost, with no week cap. A number runs that many weeks, at most 52 (one year). */
  weeks: number | null;
  /** Chooses the bot's actions and, when learning, which weights move. It does not rebuild the city. */
  seed: number;
  /** Written on the report. The test itself runs flat out. */
  speed: number;
  /** Default on. Off uses the built-in strategy and still records the run. */
  learn?: boolean;
}

export interface AutoTestWeek {
  week: number;
  cash: number;
  men: number;
  territory: number;
  heat: number;
  buildings: number;
  suspicion: number;
  standings: string;
  ms: number;
  saveBytes: number;
  /** Used and reserved heap in bytes, when Chrome reports them. */
  heapUsed?: number;
  heapTotal?: number;
}

/** The longest fixed-length run: one year. "Until victory or loss" has no cap. */
export const AUTO_TEST_MAX_WEEKS = 52;

/**
 * Used-heap share that first triggers a pause so the browser can collect
 * garbage. Auto Test only stops if the used share is still at least
 * MEMORY_STOP_SHARE after that pause.
 */
export const MEMORY_CHECK_SHARE = 0.6;
/** Used-heap share of the tab's limit at which Auto Test stops after a pause. */
export const MEMORY_STOP_SHARE = 0.8;
/** Idle time given to the browser's garbage collector before the second check. */
export const MEMORY_YIELD_MS = 3000;

export interface HeapFigures {
  used: number;
  total: number;
  limit: number;
}

let memoryStopped = false;

type ChromeMemory = { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };

function chromeMemory(): ChromeMemory | undefined {
  return (globalThis.performance as Performance & { memory?: ChromeMemory } | undefined)?.memory;
}

/** Chrome's heap figures, where it reports them. */
export function readHeap(): HeapFigures | null {
  const memory = chromeMemory();
  if (!memory || !memory.jsHeapSizeLimit) return null;
  return { used: memory.usedJSHeapSize, total: memory.totalJSHeapSize || 0, limit: memory.jsHeapSizeLimit };
}

/** Used heap as a share of the tab's limit. Reserved heap is ignored. */
export function heapShare(): number | null {
  const heap = readHeap();
  return heap ? heap.used / heap.limit : null;
}

export function formatHeapMb(heap: Pick<HeapFigures, 'used' | 'total'>): string {
  return `${Math.round(heap.used / 1048576)}/${Math.round(heap.total / 1048576)} MB`;
}

function yieldIdle(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const until = Date.now() + ms;
    const tick = () => { if (Date.now() >= until) resolve(); else setTimeout(tick, 250); };
    setTimeout(tick, Math.min(250, ms));
  });
}

/**
 * If used heap is at least MEMORY_CHECK_SHARE of the limit, yield so garbage
 * can be collected, then stop only if used heap is still at least
 * MEMORY_STOP_SHARE of the limit.
 */
export async function checkMemoryStop(yieldMs = MEMORY_YIELD_MS): Promise<{ stop: boolean; heap: HeapFigures | null }> {
  const first = readHeap();
  if (!first) return { stop: false, heap: null };
  if (first.used / first.limit < MEMORY_CHECK_SHARE) return { stop: false, heap: first };
  await yieldIdle(yieldMs);
  const after = readHeap() ?? first;
  return { stop: after.used / after.limit >= MEMORY_STOP_SHARE, heap: after };
}

/** True once, after a run that stopped because memory was nearly full. */
export function takeAutoTestMemoryStop(): boolean {
  const was = memoryStopped;
  memoryStopped = false;
  return was;
}

/** Weeks a recruiting venue is skipped after a crew found nobody there. */
export const EMPTY_VENUE_SKIP_WEEKS = 4;

export interface RecruitMemory {
  hintIds: number[];
  /** Building id → first week the venue may be tried again. */
  emptyUntil: Map<number, number>;
}

export function newRecruitMemory(): RecruitMemory {
  return { hintIds: [], emptyUntil: new Map() };
}

let recruitMemory = newRecruitMemory();

/** Prefer last week's "looking for work" tip; skip venues that just came up empty. */
export function chooseHoodRecruitSites<T extends { id: number }>(
  sites: T[],
  memory: RecruitMemory = recruitMemory,
  week = 0,
): T[] {
  const open = (site: T) => (memory.emptyUntil.get(site.id) ?? 0) <= week;
  const hinted: T[] = [];
  const seen = new Set<number>();
  for (const id of memory.hintIds) {
    const site = sites.find((entry) => entry.id === id);
    if (!site || seen.has(id) || !open(site)) continue;
    hinted.push(site);
    seen.add(id);
  }
  const rest = sites.filter((site) => !seen.has(site.id) && open(site));
  const picked = [...hinted, ...rest];
  // If every known venue is still cooling down, try them anyway rather than hiring nowhere.
  return picked.length ? picked : sites;
}

export function rememberRecruitResults(
  orders: { type: string; recruitHintId?: number | null; emptyRecruitIds?: number[] }[],
  week: number,
  memory: RecruitMemory = recruitMemory,
): void {
  for (const order of orders) {
    if (order.type !== 'recruit') continue;
    if (order.recruitHintId != null) {
      memory.hintIds = [order.recruitHintId, ...memory.hintIds.filter((id) => id !== order.recruitHintId)];
    }
    for (const id of order.emptyRecruitIds ?? []) {
      memory.emptyUntil.set(id, week + EMPTY_VENUE_SKIP_WEEKS);
      memory.hintIds = memory.hintIds.filter((hint) => hint !== id);
    }
  }
}

function hqCenter(w: Sim['world'], gangId: number): { x: number; y: number } {
  const office = buildingList(w).find((b) => b.isHQ && b.ownerGangId === gangId);
  const lot = office ? w.lots[office.lotId] : undefined;
  return lot?.center ?? w.blocks[0].center;
}

function heatOf(sim: Sim): number {
  const blocks = sim.world.blocks;
  if (!blocks.length) return 0;
  return Math.round(blocks.reduce((sum, block) => sum + block.crimeHeat, 0) / blocks.length);
}

function snapshot(sim: Sim, ms: number): AutoTestWeek {
  const gang = sim.playerGang;
  const owned = buildingList(sim.world).filter((b) => b.ownerGangId === gang.id && b.state !== 'destroyed').length;
  const standings = Object.values(sim.world.gangs)
    .map((other) => `${other.name} $${Math.round(other.cash)} men ${gangManpower(sim.world, other)}${other.eliminated ? ' out' : ''}`)
    .join('; ');
  return {
    week: sim.world.week,
    cash: Math.round(gang.cash),
    men: gangManpower(sim.world, gang),
    territory: territoryCount(sim.world, gang.id),
    heat: heatOf(sim),
    buildings: owned,
    suspicion: Math.round(gang.suspicion),
    standings,
    ms,
    saveBytes: lastSavedBytes(sim.world) ?? utf8Length(JSON.stringify(sim.world)),
  };
}

export function campaignOf(sim: Sim): CampaignSettings {
  return {
    opponents: sim.world.options.opponents,
    economy: sim.world.options.economy,
    mapW: sim.world.gridW,
    mapH: sim.world.gridH,
  };
}

function logResult(actions: string[], label: string, ok: boolean, detail: string): void {
  actions.push(`${ok ? 'OK' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Crews one lieutenant can run well. Used to decide when to promote another. */

/** What last Monday learned, per city: whether the crews ran out of week. */
/** Premises suspected of hiding a rival HQ (men were killed on empty land beside them), with the week first suspected. */
const suspectedHQ = new WeakMap<Sim['world'], Map<number, number>>();
const lastMonday = new WeakMap<Sim['world'], { timeShort: boolean }>();
/** Men at the start of last Monday, per city. */
const menLastWeek = new WeakMap<Sim['world'], number>();
/** A racket the gang is saving for: other premises wait until its cost is in hand. */
const savingFor = new WeakMap<Sim['world'], { name: string; cost: number }>();

/** Suspicion at which the desk starts paying the police chief and easing the extortion (1.2.19: 30, was 40). */
const SUSPICION_BRIBE = 30;
/** Suspicion at which the gang lies low: collecting and legal buying only. */
export const SUSPICION_LIE_LOW = 50;
/** A rise this big in one week counts as one level hotter than the figure says. */
export const SUSPICION_JUMP = 15;
/** Most of the gang's men on risky street orders (extortion and rough work) at once; less while easing. */
export const RISKY_SHARE = 0.5;
export const RISKY_SHARE_EASING = 0.35;
const RISKY_ORDERS = new Set(['extort', 'raid', 'kidnap', 'kill', 'smashUp', 'torch', 'bomb', 'assault', 'intimidate', 'ambush']);
/** How hot the gang is: 0 normal, 1 ease off (bribe the chief, half the extortion), 2 lie low. */
export function heatLevel(suspicion: number, lastWeek: number | undefined): 0 | 1 | 2 {
  const jump = lastWeek != null && suspicion - lastWeek >= SUSPICION_JUMP;
  if (suspicion >= SUSPICION_LIE_LOW || (jump && suspicion >= SUSPICION_BRIBE)) return 2;
  if (suspicion >= SUSPICION_BRIBE || jump) return 1;
  return 0;
}
const suspicionLastWeek = new WeakMap<Sim['world'], number>();

function crewReady(w: Sim['world'], teamId: number): boolean {
  const team = w.teams[teamId];
  const lt = team ? w.people[team.lieutenantId] : undefined;
  // A lieutenant in custody or before a court cannot lead (1.2.20: arrested and onTrial too).
  return !!lt && lt.status === 'active';
}

/**
 * Street heat (1.2.20). A policeman takes a man in when his wanted level, less
 * half the officer's opinion of the gang, passes 45; in the original city the
 * arrest takes the man's whole crew with him, wherever they are. Auto Test
 * reads the same sum (with the police's average opinion) and rests a man well
 * before that line.
 */
export const STREET_HEAT_REST = 30;
/** A resting man goes back to work once his street heat is below this. */
export const STREET_HEAT_BACK = 15;
/** Resting only helps a man with his own wanted level: below this, his heat is
 * the police's opinion of the gang, which no rest can cool. */
export const REST_WANTED = 10;
/** A man who killed an FBI agent and is this wanted is sacked rather than hidden. */
export const SACK_WANTED = 80;
export function streetHeat(wanted: number, policeOpinion: number): number {
  return wanted - policeOpinion * 0.5;
}
/** Men resting in the pool until their street heat falls, and FBI hitmen. */
const resting = new WeakMap<Sim['world'], Set<number>>();
const fbiHitmen = new WeakMap<Sim['world'], Set<number>>();
/** The rival gang that last killed our men, and until which week Auto strikes back. */
const retaliation = new WeakMap<Sim['world'], { gangId: number; until: number }>();

/**
 * One Monday at the desk, using hire, promote, and issueOrder.
 *
 * 1.2.13 plays every lieutenant, not just the first. The expansion playbook,
 * in order: guard the office; collect from every protected shop, split across
 * crews; hire until the target; push the frontier outward from the office one
 * block per crew, nearest blocks first, so the territory grows as a ring; set
 * up rackets behind owned fronts; bribe the chief; buy premises at the edge;
 * hit rivals only when the strategy wants it.
 */
export function playAutoWeek(sim: Sim, seed: number, strategy: PlayStrategy): string[] {
  const actions: string[] = [];
  const rng = new Rng(seed + sim.world.week * 997);
  const w = sim.world;
  const gang = sim.playerGang;
  const beforeMen = gangManpower(w, gang);
  const weight = strategy.weights;
  const crewsOf = () => gang.teamIds.map((teamId) => w.teams[teamId]).filter((team) => !!team);

  // The win to play for, looked at again every few weeks.
  let goalState = goalOf.get(w);
  if (!goalState || w.week - goalState.reviewedWeek >= GOAL_REVIEW_WEEKS) {
    const before = goalState?.goal;
    // Stalled: the goal's own score has not risen over the last two reviews.
    const progress = goalState?.progress ?? [];
    const stalled = progress.length >= 2 && before != null && goalScores(w, gang)[before] <= progress[progress.length - 2];
    const stalls = stalled ? (goalState?.stalls ?? 0) + 1 : 0;
    // Stalled two reviews running: drop it for a while and play for the next best.
    if (goalState && before && stalls >= GOAL_STALL_DROP) {
      goalState.dropped.push({ goal: before, until: w.week + GOAL_DROP_WEEKS });
      actions.push(`GOAL dropped ${before} — stalled ${stalls} reviews running; off the list until week ${w.week + GOAL_DROP_WEEKS}`);
    }
    const excluded = (goalState?.dropped ?? []).filter((d) => d.until > w.week).map((d) => d.goal);
    const { goal, scores } = chooseGoal(w, gang, before, stalled, excluded);
    if (stalled && stalls < GOAL_STALL_DROP) actions.push(`NOTE goal ${before} has stalled — it counts ${GOAL_STALL_PENALTY} less this review`);
    if (!goalState) {
      goalState = { goal, reviewedWeek: w.week, history: [`week ${w.week}: ${goal} (${formatGoalScores(scores, goalsFor(w))})`], progress: [], stalls: 0, dropped: [] };
      goalOf.set(w, goalState);
      actions.push(`GOAL ${goal} — ${GOAL_LABELS[goal]} (${formatGoalScores(scores, goalsFor(w))})`);
    } else {
      goalState.reviewedWeek = w.week;
      if (goal !== before) {
        goalState.history.push(`week ${w.week}: ${before} → ${goal} (${formatGoalScores(scores, goalsFor(w))})`);
        actions.push(`GOAL switch ${before} → ${goal} — ${GOAL_LABELS[goal]} now fits better (${formatGoalScores(scores, goalsFor(w))})`);
      } else {
        actions.push(`GOAL kept ${goal} (${formatGoalScores(scores, goalsFor(w))})`);
      }
      if (goal !== goalState.goal) { goalState.progress = []; goalState.stalls = 0; }
      else goalState.stalls = stalls;
      goalState.goal = goal;
    }
    goalState.progress.push(goalScores(w, gang)[goal]);
  }
  const goal = goalState.goal;
  // Few men and plenty of cash: rebuild the gang first, whatever the goal.
  const rebuild = gangManpower(w, gang) < 10 && gang.cash > 50000;
  const policy = rebuild ? { ...GOAL_POLICY[goal], violence: 'low' as const, expansion: Math.min(0.6, GOAL_POLICY[goal].expansion) } : GOAL_POLICY[goal];
  if (rebuild) actions.push(`NOTE rebuilding the gang first: ${gangManpower(w, gang)} men and $${Math.round(gang.cash)} — recruiting comes before everything, no rough work`);

  for (const id of [...gang.recruitIds]) {
    const person = w.people[id];
    const room = crewsOf().filter((team) => team.memberIds.length < 8).sort((a, b) => a.memberIds.length - b.memberIds.length)[0];
    const result = hireRecruit(w, gang.id, id, room ? 'team' : 'pool', room?.id);
    logResult(actions, `hire ${person?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
  }

  // Wages: everyone gets what he asks while the takings (or a year's cash) can
  // carry it — underpaid men lose loyalty and walk out, lieutenants with their crews.
  const payroll = gangMembers(w, gang).filter((p) => p.role !== 'boss');
  const wageBill = payroll.reduce((sum, p) => sum + p.pay, 0);
  const averageWage = payroll.length ? wageBill / payroll.length : 100;
  const income = gang.lastWeekIncome;
  const weeklyNet = income.legal + income.illegal + income.protection + income.other - gang.lastWeekCosts.wages - gang.lastWeekCosts.upkeep;
  const short = payroll.filter((p) => p.pay < p.payDemand);
  const raise = short.reduce((sum, p) => sum + p.payDemand - p.pay, 0);
  if (short.length && (weeklyNet >= raise || gang.cash >= (wageBill + raise) * 26)) {
    for (const p of short) setPay(w, p.id, p.payDemand);
    actions.push(`NOTE pay raised to what they ask for ${short.length} m${short.length === 1 ? 'an' : 'en'} (+$${raise} a week)`);
  } else if (short.length) {
    actions.push(`NOTE ${short.length} underpaid m${short.length === 1 ? 'an' : 'en'} ($${raise} a week short) — the books cannot carry the raise`);
  }
  const lastMen = menLastWeek.get(w);
  const menNow = gangManpower(w, gang);
  const shrinking = rebuild || menNow < 12 || (lastMen != null && menNow < lastMen);
  menLastWeek.set(w, menNow);

  // The lawyer and the accountant stay at the office: never in the pool or a
  // crew, never on a street or crew order (1.2.20). They leave only for the
  // lawyer's bribes and the accountant's audits (specialist jobs).
  for (const id of [gang.lawyerId, gang.accountantId]) {
    const p = id == null ? undefined : w.people[id];
    if (!p) continue;
    const inPool = gang.poolIds.includes(p.id);
    const crew = crewsOf().find((team) => team.memberIds.includes(p.id));
    if (inPool || crew || p.teamId != null) {
      gang.poolIds = gang.poolIds.filter((x) => x !== p.id);
      if (crew) crew.memberIds = crew.memberIds.filter((x) => x !== p.id);
      p.teamId = null;
      actions.push(`NOTE ${p.role} ${p.name} taken off ${crew ? 'a crew' : 'the pool'} — he stays at the office`);
    }
    if (p.streetOrder) { p.streetOrder = null; actions.push(`NOTE ${p.role} ${p.name} called back from the street`); }
  }

  // Street heat (1.2.20): a man near the police's arrest line rests in the pool,
  // off every order, so his wanted level cools 6 a week instead of 2 and an
  // arrest cannot take a whole crew with him. A lieutenant that hot rests with
  // his crew (below). A man who killed an FBI agent rests the same way, or is
  // sacked if he is too wanted to cool.
  const police = w.policeIds.map((id) => w.people[id]).filter((p) => p && p.status === 'active');
  const policeOpinion = police.length ? police.reduce((sum, p) => sum + (p.opinion[gang.id] ?? 0), 0) / police.length : 0;
  const heatOfMan = (id: number) => { const p = w.people[id]; return p ? streetHeat(p.wanted, policeOpinion) : 0; };
  const restingMen = resting.get(w) ?? new Set<number>();
  resting.set(w, restingMen);
  const hitmen = fbiHitmen.get(w) ?? new Set<number>();
  fbiHitmen.set(w, hitmen);
  for (const id of [...hitmen]) {
    const p = w.people[id];
    if (!p || p.gangId !== gang.id || p.status !== 'active') { hitmen.delete(id); continue; }
    if (p.wanted >= SACK_WANTED) {
      const result = sackPerson(w, gang.id, id);
      logResult(actions, `sack ${p.name} — killed an FBI agent and is too wanted to hide (wanted ${Math.round(p.wanted)})`, result.ok, result.ok ? result.message ?? '' : result.error);
      if (result.ok) { hitmen.delete(id); restingMen.delete(id); }
    }
  }
  for (const team of crewsOf()) {
    for (const id of [...team.memberIds]) {
      const p = w.people[id];
      if (!p || p.status !== 'active' || heatOfMan(id) < STREET_HEAT_REST || p.wanted < REST_WANTED) continue;
      const result = moveToPool(w, gang.id, id);
      if (result.ok) restingMen.add(id);
      logResult(actions, `rest ${p.name} (street heat ${Math.round(heatOfMan(id))}) — off the street so an arrest cannot take his crew`, result.ok, result.ok ? '' : result.error);
    }
  }
  for (const id of [...restingMen]) {
    const p = w.people[id];
    if (!p || p.gangId !== gang.id || p.status !== 'active' || !gang.poolIds.includes(id)) { restingMen.delete(id); continue; }
    if ((heatOfMan(id) < STREET_HEAT_BACK || p.wanted < REST_WANTED / 2) && !(hitmen.has(id) && p.wanted > 5)) { restingMen.delete(id); hitmen.delete(id); }
  }
  if (restingMen.size) actions.push(`NOTE ${restingMen.size} m${restingMen.size === 1 ? 'an' : 'en'} resting in the pool until the street heat dies down`);
  // The police's opinion of the gang raises every man's heat alike: resting
  // cannot cool it, buying the chief and quieter work can.
  const policeHostile = -policeOpinion * 0.5 >= 20;
  if (policeHostile) actions.push(`NOTE the police are hostile (opinion ${Math.round(policeOpinion)}): every man starts ${Math.round(-policeOpinion * 0.5)} nearer arrest — the chief gets paid`);

  const shortLastWeekCrews = lastMonday.get(w)?.timeShort ?? false;
  // Enough lieutenants for the men: one crew per five hoods, at least two, at most eight.
  if (weight.hiring >= 0.2) {
    const hoods = () => gang.poolIds.length + crewsOf().reduce((sum, team) => sum + team.memberIds.length + 1, 0);
    // Three crews at least (collect, recruit, extort), six when the men allow, up to all eight
    // when last week's collecting ran out of time — never more crews than pairs of men.
    const wanted = () => Math.min(8, Math.max(2, Math.floor(hoods() / 2)), Math.max(3, Math.ceil(hoods() / 4), hoods() >= 18 ? 6 : 0) + (shortLastWeekCrews ? 1 : 0));
    for (let tries = 0; tries < 3 && gang.teamIds.length < wanted(); tries++) {
      const poolFree = gang.poolIds.filter((id) => !restingMen.has(id));
      const fromPool = poolFree.length ? rng.pick(poolFree) : undefined;
      const biggest = crewsOf().filter((team) => team.memberIds.length >= 4).sort((a, b) => b.memberIds.length - a.memberIds.length)[0];
      const id = fromPool ?? biggest?.memberIds[biggest.memberIds.length - 1];
      if (id == null) break;
      const result = promote(w, gang.id, id);
      logResult(actions, `promote ${w.people[id]?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
      if (!result.ok) break;
    }
    for (const id of [...gang.poolIds]) {
      if (restingMen.has(id)) continue;
      const crew = crewsOf().filter((team) => team.memberIds.length < 8).sort((a, b) => a.memberIds.length - b.memberIds.length)[0];
      if (!crew) break;
      const result = moveToTeam(w, gang.id, id, crew.id);
      logResult(actions, `to crew ${w.people[id]?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
    }
    // A new crew gets men from the biggest one, so no lieutenant walks alone.
    for (let moves = 0; moves < 8; moves++) {
      const sorted = crewsOf().sort((a, b) => a.memberIds.length - b.memberIds.length);
      const small = sorted[0];
      const big = sorted[sorted.length - 1];
      if (!small || !big || big === small || big.memberIds.length - small.memberIds.length < 3) break;
      // Keep the men the talent pass placed; move a newer hand instead.
      const id = [...big.memberIds].reverse().find((member) => !talentPlaced.has(member)) ?? big.memberIds[big.memberIds.length - 1];
      const result = moveToTeam(w, gang.id, id, small.id);
      logResult(actions, `to crew ${w.people[id]?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
      if (!result.ok) break;
    }
  }

  // Crews by talent: business men run the shops, the most intimidating crew
  // extorts without guns, a crew with guns and stealth does the rough work,
  // and the rest collect.
  const roles = assignCrewRoles(w, crewsOf().filter((team) => crewReady(w, team.id)));
  for (const move of talentSwaps(w, crewsOf(), roles)) {
    const result = moveToTeam(w, gang.id, move.personId, move.toTeamId);
    if (result.ok) talentPlaced.add(move.personId);
    logResult(actions, `talent: ${w.people[move.personId]?.name ?? move.personId} to the ${roles.get(move.toTeamId)} crew`, result.ok, result.ok ? '' : result.error);
  }
  // Each crew carries the name of its job, unless the player has named it.
  const named = crewNames(crewsOf().filter((team) => roles.has(team.id)).map((team) => ({
    id: team.id, name: team.name, role: roles.get(team.id)!, lieutenantName: w.people[team.lieutenantId]?.name ?? '',
  })));
  for (const team of crewsOf()) {
    const name = named.get(team.id);
    if (name && name !== team.name) team.name = name;
  }
  if (roles.size) actions.push(`NOTE crews: ${[...roles].map(([id, role]) => `${w.people[w.teams[id]?.lieutenantId]?.name ?? id} ${role}`).join(', ')}`);
  const GUNS: WeaponId[] = ['pistol', 'shotgun', 'rifle', 'tommy', 'twinPistols'];
  const roleCrew = (role: CrewRole) => crewsOf().find((team) => roles.get(team.id) === role);
  const extortionCrew = roleCrew('extortion');
  if (extortionCrew && roles.size > 1) {
    const handed: string[] = [];
    for (const gun of GUNS) while ((extortionCrew.weapons[gun] ?? 0) > 0 && transferWeapon(w, gang.id, gun, extortionCrew.id, false).ok) handed.push(gun);
    if (handed.length) actions.push(`NOTE extortion crew hands in ${handed.join(', ')} so nobody is shot by accident`);
  }
  const muscleCrew = roleCrew('muscle') ?? crewsOf().find((team) => roles.get(team.id) === 'collect');
  if (muscleCrew) {
    for (const gun of GUNS) while ((gang.weapons[gun] ?? 0) > 0 && transferWeapon(w, gang.id, gun, muscleCrew.id, true).ok) { /* arm the muscle */ }
    if ((gang.weapons.explosives ?? 0) > 0) while ((gang.weapons.explosives ?? 0) > 0 && transferWeapon(w, gang.id, 'explosives', muscleCrew.id, true).ok) { /* and the dynamite */ }
  }

  // At most half the crews rest at once (the most wanted first), so the takings keep coming in.
  const hotCrews = crewsOf().filter((team) => crewReady(w, team.id) && heatOfMan(team.lieutenantId) >= STREET_HEAT_REST && (w.people[team.lieutenantId]?.wanted ?? 0) >= REST_WANTED)
    .sort((a, b) => (w.people[b.lieutenantId]?.wanted ?? 0) - (w.people[a.lieutenantId]?.wanted ?? 0))
    .slice(0, Math.floor(crewsOf().filter((team) => crewReady(w, team.id)).length / 2));
  if (hotCrews.length) actions.push(`NOTE crew${hotCrews.length === 1 ? '' : 's'} lying low (lieutenant's street heat ${STREET_HEAT_REST}+): ${hotCrews.map((team) => `${w.people[team.lieutenantId]?.name ?? team.id} ${Math.round(heatOfMan(team.lieutenantId))}`).join(', ')}`);
  const ready = crewsOf().filter((team) => crewReady(w, team.id) && !hotCrews.includes(team));
  if (!ready.length) {
    actions.push('FAIL orders — no crew');
    return actions;
  }

  // Heat, watched from the first weeks: ease off past 30, lie low past 50, one level
  // hotter when suspicion jumped 15 or more since last week.
  const suspicionBefore = suspicionLastWeek.get(w);
  suspicionLastWeek.set(w, gang.suspicion);
  const heat = heatLevel(gang.suspicion, suspicionBefore);
  const lieLow = heat >= 2;
  // Risky street work is capped so one raid cannot take the whole gang.
  const riskyCap = Math.max(2, Math.floor(Math.max(1, gangManpower(w, gang)) * (heat >= 1 ? RISKY_SHARE_EASING : RISKY_SHARE)));
  let riskyMen = 0;
  const outOfTime = new Set<number>();
  const shortLastWeek = lastMonday.get(w)?.timeShort ?? false;
  let timeShort = false;
  /** The crew with the most time left this week, skipping those already given this kind of job. */
  const freest = (skip: Set<number> = new Set(), role?: CrewRole) => {
    const open = ready.filter((team) => !outOfTime.has(team.id) && !skip.has(team.id));
    const preferred = role ? open.find((team) => roles.get(team.id) === role && team.timeUsed < MINUTES_PER_WEEK * 0.85) : undefined;
    return preferred ?? open.sort((a, b) => a.timeUsed - b.timeUsed || a.id - b.id)[0];
  };
  const give = (label: string, team: (typeof ready)[number] | undefined, input: Omit<IssueOrderInput, 'teamId'>): ApiResult => {
    if (!team) {
      actions.push(`NOTE ${label} skipped — every crew's week is full`);
      timeShort = true;
      return { ok: false, error: 'Every crew is busy this week.' };
    }
    const name = w.people[team.lieutenantId]?.name ?? 'crew';
    const risky = RISKY_ORDERS.has(input.type);
    if (risky && lieLow) {
      actions.push(`NOTE ${label} not given — lying low`);
      return { ok: false, error: 'Lying low this week.' };
    }
    const hands = Math.min(input.opts?.manpower ?? 1, team.memberIds.length + 1);
    if (risky && riskyMen + hands > riskyCap) {
      actions.push(`NOTE ${label} not given — ${riskyMen} of ${riskyCap} men allowed on risky work already out`);
      return { ok: false, error: 'Too many men on risky work.' };
    }
    // Fit the order to the crew's free time by the ledger; hand out nothing that cannot fit.
    const hasCar = Object.values(team.vehicles).some((n) => n > 0);
    const key = ledgerKey(input.type, hasCar);
    const targets = input.buildingIds?.length ?? 1;
    const fits = targetsThatFit(timeLedger, key, targets, MINUTES_PER_WEEK - team.timeUsed);
    if (fits === 0) {
      actions.push(`NOTE ${label} not given to ${name} — about ${timeLedger[key]} min a target, ${Math.max(0, MINUTES_PER_WEEK - team.timeUsed)} min left`);
      outOfTime.add(team.id); timeShort = true;
      return { ok: false, error: 'Not enough time left this week (time ledger).' };
    }
    if (fits < targets && input.buildingIds) input = { ...input, buildingIds: input.buildingIds.slice(0, fits) };
    const usedBefore = team.timeUsed;
    let result = issueOrder(w, gang.id, { ...input, teamId: team.id });
    // Undermanned for the whole area, take the part the lieutenant offers.
    if (!result.ok && result.suggestion?.buildingIds?.length) {
      result = issueOrder(w, gang.id, { ...input, teamId: team.id, buildingIds: result.suggestion.buildingIds });
    }
    // Still no time: one site may fit where several did not.
    if (!result.ok && /time/i.test(result.error) && (input.buildingIds?.length ?? 0) > 1) {
      result = issueOrder(w, gang.id, { ...input, teamId: team.id, buildingIds: input.buildingIds!.slice(0, 1) });
    }
    logResult(actions, `${label} (${name})`, result.ok, result.ok ? result.message ?? '' : result.error);
    if (!result.ok && /time/i.test(result.error)) { outOfTime.add(team.id); timeShort = true; }
    if (result.ok && risky) riskyMen += hands;
    if (result.ok) {
      const order = team.orderIds.length ? w.orders[team.orderIds[team.orderIds.length - 1]] : undefined;
      const minutes = order?.estimatedMinutes || team.timeUsed - usedBefore;
      noteLedger(timeLedger, key, minutes / Math.max(1, order?.targetBuildingIds.length || 1));
    }
    return result;
  };
  /** Share of this crew's week still free. */
  const freeShare = (team: (typeof ready)[number]) => 1 - team.timeUsed / MINUTES_PER_WEEK;
  const manpowerFor = (team: (typeof ready)[number], most: number) => Math.max(1, Math.min(most, team.memberIds.length + 1));

  // A crew refused for lack of time last week gets a car, or a hood moved across, before it is asked again.
  for (const id of shortCrews.get(w) ?? []) {
    const team = ready.find((t) => t.id === id);
    if (!team) continue;
    const carless = !Object.values(team.vehicles).some((n) => n > 0);
    if (carless && gang.cash > VEHICLES.coupe.cost * 3) {
      const result = buyVehicle(w, gang.id, 'coupe', team.id);
      logResult(actions, `buy car for ${w.people[team.lieutenantId]?.name ?? 'crew'} (out of time last week)`, result.ok, result.ok ? '' : result.error);
      if (result.ok) continue;
    }
    const donor = ready.filter((t) => t.id !== team.id && t.memberIds.length >= 3 && !(shortCrews.get(w)?.has(t.id))).sort((a, b) => b.memberIds.length - a.memberIds.length)[0];
    const hood = donor?.memberIds.map((m) => w.people[m]).filter((p) => p && p.status === 'active' && p.orderId == null)[0];
    if (donor && hood) {
      const result = moveToTeam(w, gang.id, hood.id, team.id);
      logResult(actions, `move ${hood.name} to ${w.people[team.lieutenantId]?.name ?? 'crew'} (out of time last week)`, result.ok, result.ok ? '' : result.error);
    }
  }

  const origin = hqCenter(w, gang.id);
  const nearer = (a: { lotId: number }, b: { lotId: number }) => dist(w.lots[a.lotId].center, origin) - dist(w.lots[b.lotId].center, origin);
  const hoodSites = chooseHoodRecruitSites(
    buildingList(w).filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === 'hood' && b.state !== 'destroyed').sort(nearer),
    recruitMemory,
    w.week,
  );

  // FBI agents at our rackets (1.2.20). The FBI cannot be bought, so an agent
  // searching or watching one of our illegal businesses (or standing at its
  // door) is shot by one expendable hood: the least skilled man at liberty,
  // taken off his crew first so an arrest takes nobody else, given a pistol
  // from the gang's stock. Afterwards he rests until the heat dies down, or is
  // sacked if he is too wanted (above). One a week.
  {
    const ours = buildingList(w).filter((b) => b.ownerGangId === gang.id && b.cls === 'illegal' && b.state !== 'destroyed' && !b.isHQ);
    const watched = new Set(ours.flatMap((b) => (b.frontId != null ? [b.id, b.frontId] : [b.id])));
    const agents = w.fbiIds.map((id) => w.people[id]).filter((a): a is NonNullable<typeof a> => !!a && a.status === 'active' &&
      ((a.fbiAssignment != null && watched.has(a.fbiAssignment.buildingId)) || ours.some((b) => dist(a.pos, buildingDoor(w, b)) <= 30)));
    if (agents.length && !lieLow) {
      const agent = agents[0];
      const total = (p: NonNullable<(typeof w.people)[number]>) => Object.values(p.skills).reduce((a, b) => a + b, 0);
      const hood = crewsOf().flatMap((team) => team.memberIds).map((id) => w.people[id])
        .filter((p): p is NonNullable<typeof p> => !!p && p.status === 'active' && p.role === 'hood' && !restingMen.has(p.id))
        .sort((a, b) => total(a) - total(b) || a.id - b.id)[0];
      if (hood) {
        moveToPool(w, gang.id, hood.id);
        if ((gang.weapons.pistol ?? 0) < 1 && gang.cash > WEAPONS.pistol.cost) buyWeapon(w, gang.id, 'pistol');
        const result = issueStreetOrder(w, gang.id, [hood.id], 'kill', agent.id, null);
        logResult(actions, `FBI agent ${agent.name} at our ${agent.fbiAssignment ? `${agent.fbiAssignment.kind} site` : 'racket'} — ${hood.name} (expendable) sent to kill him; the FBI cannot be bought`, result.ok, result.ok ? '' : result.error);
        if (result.ok) { hitmen.add(hood.id); restingMen.add(hood.id); }
      }
    } else if (agents.length) actions.push(`NOTE FBI agent ${agents[0].name} at one of our rackets — lying low, nobody sent`);
  }

  // The lawyer only does a lawyer's work (courts and officials, from the office) and
  // never goes on the street. A lost lawyer (arrested, jailed, dead or gone) is
  // replaced before anything else; with heat rising, he is hired early.
  const lawyerNow = gang.lawyerId == null ? undefined : w.people[gang.lawyerId];
  const lawyerLost = !lawyerNow || lawyerNow.gangId !== gang.id || ['arrested', 'onTrial', 'jailed', 'dead'].includes(lawyerNow.status);
  if (lawyerLost && (w.week >= 4 || gang.suspicion >= 20 || gang.lawyerId != null)) {
    const desks = buildingList(w).filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === 'lawyer' && b.state !== 'destroyed').sort(nearer);
    const desk = desks.length ? desks[w.week % desks.length] : undefined;
    if (gang.lawyerId != null) actions.push(`NOTE lawyer ${lawyerNow?.name ?? ''} lost (${lawyerNow?.status ?? 'gone'}) — hiring a new one first`);
    const sent = desk ? give('recruit lawyer', freest(), { type: 'recruit', buildingIds: [desk.id], opts: { manpower: 1, recruitAs: 'lawyer' } }) : undefined;
    // Nobody free to fetch one, or a trial already running: the boss hires a
    // lawyer himself at once (as the computer bosses do), so the court can still
    // be bought. A lawyer the crews already found comes first.
    const trialNow = Object.values(w.cases ?? {}).some((c) => c.gangId === gang.id && ['awaiting', 'onTrial'].includes(c.status));
    if (!sent?.ok || (trialNow && gang.lawyerId != null)) {
      const free = (p: (typeof w.people)[number] | undefined) => !!p && p.role === 'lawyer' && p.gangId == null && p.status === 'active';
      const found = gang.recruitIds.map((id) => w.people[id]).find(free)
        ?? peopleList(w).filter((p) => free(p)).sort((a, b) => b.skills.intelligence - a.skills.intelligence || a.id - b.id)[0];
      if (found) {
        const result = hireRecruit(w, gang.id, found.id, 'pool');
        logResult(actions, `the boss hires lawyer ${found.name} himself (${sent?.ok ? 'a trial is running' : 'no crew free to fetch one'})`, result.ok, result.ok ? result.message ?? '' : result.error);
      } else actions.push('NOTE no lawyer for hire anywhere in the city this week');
    }
  }

  const hq = buildingList(w).find((b) => b.isHQ && b.ownerGangId === gang.id);
  if (w.week >= 2 && gangManpower(w, gang) >= 8 && hq) {
    give('guard office', freest(), { type: 'guardBusiness', buildingIds: [hq.id], opts: { manpower: 1 } });
  }

  // One-off hires come before the expansion fills the crews' week.
  // Each week tries the next office, so one empty desk does not hold up the hire.
  const deskFor = (role: 'accountant' | 'lawyer') => {
    const desks = buildingList(w).filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === role && b.state !== 'destroyed').sort(nearer);
    return desks.length ? desks[w.week % desks.length] : undefined;
  };
  if (w.week >= 3 && gang.accountantId == null) {
    const desk = deskFor('accountant');
    if (desk) give('recruit accountant', freest(), { type: 'recruit', buildingIds: [desk.id], opts: { manpower: 1, recruitAs: 'accountant' } });
  }

  // Police and courts, as the manual has it. A man on trial: the judge throws
  // the case out, the DA hands over the witness and juror lists, and those
  // people can then be paid or leaned on; dice weighted by the ranked table
  // choose which. Past SUSPICION_BRIBE the lawyer pays the police chief, and a
  // rich gang buys the mayor so fewer police walk its patch.
  const openCases = Object.values(w.cases ?? {}).filter((c) => c.gangId === gang.id && ['awaiting', 'onTrial'].includes(c.status));
  // Hot men on the street count too: the chief is paid before the police start taking crews.
  const streetHot = hotCrews.length > 0 || policeHostile || [...restingMen].some((id) => heatOfMan(id) >= STREET_HEAT_REST);
  const hot = heat >= 1 || openCases.length > 0 || streetHot;
  const lawyer = availableSpecialist(w, gang, 'lawyer');
  const buyable = (id: number | undefined, share: number) => {
    const o = id == null ? undefined : w.people[id];
    return !!o && o.bribedBy !== gang.id && isBribableOfficial(o) && !refusesBribe(o, gang.id) && bribePrice(w, o, gang.id) <= gang.cash * share ? o : undefined;
  };
  for (const c of openCases.slice(0, 2)) {
    const defendant = w.people[c.defendantId];
    const judge = lawyer && !c.judgeBribed ? buyable(c.judgeId, 0.9) : undefined;
    const da = lawyer && !(c.knowsWitnesses && c.knowsJurors) ? buyable(c.daId, 0.7) : undefined;
    const witnesses = c.knowsWitnesses ? c.witnessIds.map((id) => w.people[id]).filter((p): p is NonNullable<typeof p> => !!p && p.status === 'active' && p.bribedBy !== gang.id && (p.opinion[gang.id] ?? 0) < 40) : [];
    const jurors = c.knowsJurors ? c.jurorIds.map((id) => w.people[id]).filter((p): p is NonNullable<typeof p> => !!p && p.status === 'active' && p.bribedBy !== gang.id && (p.opinion[gang.id] ?? 0) <= 25) : [];
    const options: ActionKey[] = [];
    if (judge) options.push('bribeJudge');
    if (da) options.push('bribeDA');
    if (witnesses.length) options.push('bribeWitness', 'scareWitness');
    if (jurors.length) options.push('bribeJuror');
    const key = rollAction(actionRanks, options, rng);
    if (!key) {
      const why = (id: number) => {
        const o = w.people[id];
        if (!o || !isBribableOfficial(o)) return 'not available';
        if (o.bribedBy === gang.id) return 'already ours';
        return refusesBribe(o, gang.id) ? 'too hostile to take money' : `$${bribePrice(w, o, gang.id)} against $${Math.round(gang.cash)} cash`;
      };
      actions.push(`NOTE ${defendant?.name ?? 'a man'} on trial — ${lawyer ? `nobody on the case can be bought this week (judge ${why(c.judgeId)}, DA ${why(c.daId)})` : 'no lawyer to buy the court'}`);
      continue;
    }
    actions.push(`ROLL ${key} (${ACTION_LABELS[key]} for ${defendant?.name ?? 'a man'}, rank ${actionRanks[key]})`);
    const pendingBase = { key, caseId: c.id, defendantId: c.defendantId, cashBefore: gang.cash };
    if (key === 'bribeJudge' || key === 'bribeDA') {
      const official = key === 'bribeJudge' ? judge! : da!;
      const result = queueSpecialistJob(w, gang.id, 'bribeOfficials', official.id);
      logResult(actions, `lawyer bribes ${official.name} (${official.role})`, result.ok, result.ok ? result.message ?? '' : result.error);
      if (result.ok) pendingActions.push({ ...pendingBase, targetPersonId: official.id });
      continue;
    }
    const target = key === 'bribeJuror' ? jurors[0] : witnesses[0];
    const team = freest(undefined, key === 'scareWitness' ? 'muscle' : 'business');
    const input: Omit<IssueOrderInput, 'teamId'> = key === 'scareWitness'
      ? { type: 'assault', personId: target.id, opts: { manpower: team ? manpowerFor(team, 2) : 1 } }
      : { type: 'bribe', personId: target.id, opts: { manpower: 1, amount: Math.round(400 + target.skills.intelligence * 300) } };
    const result = give(`${ACTION_LABELS[key]} ${target.name}`, team, input);
    if (result.ok && team) pendingActions.push({ ...pendingBase, orderId: team.orderIds[team.orderIds.length - 1], targetPersonId: target.id });
  }
  let chiefPaid = false;
  if (hot && lawyer) {
    const chief = buyable(w.policeChiefId, 0.3);
    if (chief) {
      const result = queueSpecialistJob(w, gang.id, 'bribeOfficials', chief.id);
      logResult(actions, `lawyer bribes ${chief.name} (police chief)`, result.ok, result.ok ? result.message ?? '' : result.error);
      chiefPaid = result.ok;
    } else {
      const o = w.people[w.policeChiefId];
      if (o && o.bribedBy !== gang.id) actions.push(`NOTE the lawyer cannot buy the police chief this week (${!isBribableOfficial(o) ? 'not available' : refusesBribe(o, gang.id) ? 'too hostile' : `$${bribePrice(w, o, gang.id)} against $${Math.round(gang.cash)} cash`}) — a crew offers a smaller sum`);
    }
  } else if (hot && gang.lawyerId == null) {
    actions.push(`NOTE suspicion ${Math.round(gang.suspicion)} and no lawyer yet`);
  }
  // Hostile police take any of our men on sight: the lawyer puts the officers
  // on our own beats on the payroll (a paid officer makes no arrests), the
  // blocks nearest the office first. A bribe, so a lawyer's errand.
  if (policeHostile && lawyer && gang.cash > 8000) {
    const beats = territoryBlocks(w, gang.id).sort((a, b) => dist(a.center, origin) - dist(b.center, origin)).slice(0, 6).map((block) => block.id);
    const onPayroll = police.filter((p) => p.employedBy === gang.id).length;
    if (beats.length && onPayroll < 12) {
      const result = queueSpecialistJob(w, gang.id, 'employPolice', null, beats);
      logResult(actions, `lawyer puts the police on our ${beats.length} nearest blocks on the payroll (${onPayroll} already paid)`, result.ok, result.ok ? result.message ?? '' : result.error);
    }
  }
  if (lawyer && gang.cash > 40000) {
    const mayor = buyable(w.mayorId, 0.3);
    if (mayor) {
      const result = queueSpecialistJob(w, gang.id, 'bribeOfficials', mayor.id);
      logResult(actions, `lawyer bribes ${mayor.name} (mayor: fewer police on the patch)`, result.ok, result.ok ? result.message ?? '' : result.error);
    }
  }
  if (hot && !chiefPaid) {
    const chief = w.people[w.policeChiefId];
    if (chief && chief.status === 'active' && chief.bribedBy !== gang.id && gang.cash > 1500) {
      give('bribe chief', freest(), { type: 'bribe', personId: chief.id, opts: { manpower: 1, amount: Math.round(400 + gang.suspicion * 10) } });
    }
  }
  // Going straight: say every week what still stands in the way, and turn
  // cash into legal premises first thing, before the crews' week fills up.
  if (goal === 'straight' && !gang.goingStraight && w.options.mode === 'normal') {
    const check = canGoStraight(w, gang.id);
    const assetsNow = gangAssets(w, gang);
    const illegalNow = buildingList(w).filter((b) => b.ownerGangId === gang.id && b.cls === 'illegal' && b.typeId !== 'office');
    if (!check.can) {
      actions.push(`NOTE going straight blocked: ${check.reason} [assets $${assetsNow.toLocaleString('en-US')} of $${GO_STRAIGHT_ASSETS.toLocaleString('en-US')} (cash does not count); ${illegalNow.length} illegal business(es); ${openCases.length} on trial; lawyer ${lawyer ? 'ready' : gang.lawyerId == null ? 'none hired' : 'not available'}]`);
    }
    if (assetsNow < GO_STRAIGHT_ASSETS * 1.2 && gang.cash > 20000) {
      let budget = gang.cash - 20000;
      let projected = assetsNow;
      const value = (b: Building) => (BUILDING_BY_ID[b.typeId]?.cost ?? 0) * (0.6 + (w.blocks[b.blockId]?.landValue ?? 0) / 100);
      const picks = buildingList(w).filter((b) => b.ownerGangId == null && b.state === 'trading' && ['commercial', 'industrial', 'tenement'].includes(b.cls) &&
        (BUILDING_BY_ID[b.typeId]?.cost ?? 0) > 0)
        .sort((a, b) => value(b) / (BUILDING_BY_ID[b.typeId]!.cost) - value(a) / (BUILDING_BY_ID[a.typeId]!.cost) || value(b) - value(a));
      const chosen: Building[] = [];
      for (const b of picks) {
        if (projected >= GO_STRAIGHT_ASSETS * 1.2 || chosen.length >= 8) break;
        const cost = BUILDING_BY_ID[b.typeId]!.cost;
        if (cost > budget) continue;
        chosen.push(b); budget -= cost; projected += value(b);
      }
      // One site to an order (a purchase takes a single site), spread over the crews.
      const used = new Set<number>();
      for (const b of chosen) {
        const team = freest(used, 'business') ?? freest();
        if (!team) break;
        if (ready.length > used.size + 1) used.add(team.id);
        give(`go straight: buy ${b.typeId}`, team, { type: 'buyPremises', buildingIds: [b.id] });
      }
      if (!chosen.length) actions.push('NOTE going straight: no legal premises for sale');
    }
  }

  // Close to standing for mayor: push for the last blocks, whatever the heat.
  const blocksNeeded = electionBlocksRequired(w);
  const officeClose = goal === 'office' && territoryCount(w, gang.id) >= blocksNeeded * 0.8 && territoryCount(w, gang.id) < blocksNeeded;
  const expansion = officeClose ? Math.max(2, policy.expansion) : policy.expansion;
  if (officeClose) actions.push(`NOTE ${territoryCount(w, gang.id)} of ${blocksNeeded} blocks for the mayoralty — every crew pushes for the last ones`);
  const easing = (heat >= 1 && !officeClose) || lieLow;
  // The mayoral campaign (1.2.20): the blocks the election asks for, a business
  // of our own across them (our own manager is never hostile at the poll),
  // gentle collecting so the shopkeepers stay friendly, a Teamsters business
  // (behind a trade union for full weight), and the cash to fund the race.
  const campaign = goal === 'office' && w.options.mode === 'normal';
  const campaignReserve = campaign && (w.election.active || territoryCount(w, gang.id) >= blocksNeeded * 0.7)
    ? campaignWeeklyCost(w, gang.id) * Math.max(4, (w.election.active ? w.election.weeksLeft : 0) + 1) : 0;
  if (campaign) actions.push(`NOTE campaign: ${territoryCount(w, gang.id)} of ${blocksNeeded} blocks${w.election.active ? `, election under way (${w.election.weeksLeft} weeks left)` : ''}${campaignReserve ? `; $${campaignReserve} kept for the campaign` : ''}`);
  if (lieLow) actions.push(`NOTE suspicion ${Math.round(gang.suspicion)}${suspicionBefore != null ? ` (was ${Math.round(suspicionBefore)})` : ''} — lying low: collecting and legal buying only`);
  else if (easing) actions.push(`NOTE suspicion ${Math.round(gang.suspicion)}${suspicionBefore != null ? ` (was ${Math.round(suspicionBefore)})` : ''} — extortion eased, the police chief paid, legal premises before rackets`);

  const spend = (key: PlayStrategy['priority'][number]) => {
    if (key === 'hiring') {
      // The rule of thumb: keep hiring while the week's takings cover the
      // extra wages (or the cash would carry them for a year); below the
      // floor, hire whatever the books say. No fixed cap on men.
      const men = gangManpower(w, gang);
      const floor = Math.max(18, Math.round(10 + weight.hiring * 12), Math.min(60, Math.round(territoryCount(w, gang.id) * 2)));
      const newMen = shrinking ? 4 : 2;
      const pays = men < floor || (shortLastWeek && weeklyNet >= averageWage) || weeklyNet >= averageWage * newMen || gang.cash >= (wageBill + averageWage * newMen) * 52;
      if (lieLow && !shrinking && men >= 10) {
        actions.push('NOTE recruit held — lying low');
      } else if (pays && hoodSites.length) {
        // Several venues, one man each: a two-man order waits for a second free hand.
        const venues = Math.min(hoodSites.length, shrinking || men < floor ? 4 : 2, ready.length);
        if (recruitMemory.hintIds.includes(hoodSites[0].id)) actions.push('NOTE recruit following last week\'s tip');
        const sentTo = new Set<number>();
        for (let i = 0; i < venues; i++) {
          const team = freest(sentTo, 'recruit');
          if (!team) { actions.push('NOTE recruit skipped — every crew\'s week is full'); timeShort = true; break; }
          sentTo.add(team.id);
          give('recruit', team, { type: 'recruit', buildingIds: [hoodSites[i].id], opts: { manpower: 1 } });
        }
      } else if (hoodSites.length === 0) {
        actions.push('NOTE no hoods standing at a hiring place');
      } else {
        actions.push(`NOTE recruit held — ${men} men; last week netted $${Math.round(weeklyNet)}, not enough for ${newMen} more at about $${Math.round(averageWage)} each`);
      }
    }
    if (key === 'rackets') {
      // Collect: the owed shops, split evenly over the crews, nearest first.
      // Campaigning, a shopkeeper close to refusing is left alone this week:
      // a refusal makes him hostile, and hostility costs votes.
      const payer = (b: Building) => { const id = b.ownerPersonId ?? b.managerId; return id == null ? undefined : w.people[id]; };
      const tooHostile = (b: Building) => { const p = payer(b); return !!p && p.status !== 'dead' && effectiveHostility(p, gang.id) >= 170; };
      const owedAll = protectedBuildings(w, gang.id).filter((b) => b.state === 'trading').sort(nearer);
      const owed = campaign ? owedAll.filter((b) => !tooHostile(b)) : owedAll;
      if (campaign && owed.length < owedAll.length) actions.push(`NOTE campaign: ${owedAll.length - owed.length} hostile shopkeeper(s) not collected from this week`);
      if (campaign && w.week >= 4) {
        const sore = owedAll.filter((b) => b.protection && b.protection.gangId === gang.id && b.protection.grievance >= 1 && b.protection.weekly > b.protection.base * 0.75)
          .sort((a, b) => (b.protection?.grievance ?? 0) - (a.protection?.grievance ?? 0))[0];
        const team = sore ? freest(undefined, 'collect') : undefined;
        if (sore && team) give(`campaign: ease protection at ${sore.typeId}`, team, { type: 'adjustProtection', buildingIds: [sore.id], opts: { manpower: 1, protectionLevel: 0.75 } });
      }
      if (w.week >= 2 && weight.rackets >= 0.2 && owed.length) {
        const share = Math.max(3, Math.ceil(owed.length / ready.length));
        const collected = new Set<number>();
        for (let i = 0; i < owed.length; i += share) {
          const team = freest(collected, 'collect');
          if (!team) break;
          collected.add(team.id);
          give('collect', team, { type: 'collectProtection', buildingIds: owed.slice(i, i + share).map((b) => b.id), opts: { manpower: 1 } });
        }
      }
      // Expand: every crew takes the nearest unclaimed block at the edge of the territory.
      if (weight.rackets >= 0.25 && !lieLow) {
        const nearby = buildingList(w).filter((b) => isValidAreaTarget(w, gang.id, 'extort', b) && nearTerritory(w, gang.id, b.blockId, 2)).sort(nearer);
        const targets = nearby.length ? nearby : buildingList(w).filter((b) => isValidAreaTarget(w, gang.id, 'extort', b)).sort(nearer);
        const byBlock = new Map<number, typeof targets>();
        for (const b of targets) {
          const list = byBlock.get(b.blockId) ?? [];
          list.push(b);
          byBlock.set(b.blockId, list);
        }
        // The hottest quarter of the blocks is left alone while suspicion is high.
        const heats = [...byBlock.keys()].map((id) => w.blocks[id]?.crimeHeat ?? 0).sort((a, b) => a - b);
        const hotLine = heats.length ? heats[Math.floor(heats.length * 0.75)] : Infinity;
        const cap = Math.max(2, Math.round(weight.rackets * 5 * expansion));
        const crewsToSend = easing ? Math.max(1, Math.floor(ready.length / 2)) : Math.max(1, Math.round(ready.length * Math.min(1, expansion)));
        const sent = new Set<number>();
        for (const [blockId, sites] of byBlock) {
          if (sent.size >= crewsToSend) break;
          if (easing && (w.blocks[blockId]?.crimeHeat ?? 0) >= hotLine && hotLine > 0) continue;
          const team = freest(sent, 'extortion');
          if (!team) { timeShort = true; break; }
          // Size the area to the crew's free week: about one site per sixth of a week.
          const fit = Math.max(1, Math.min(cap, Math.floor(freeShare(team) * 6 * Math.max(1, expansion))));
          if (freeShare(team) < 0.15) { sent.add(team.id); timeShort = true; continue; }
          sent.add(team.id);
          give('extort', team, { type: 'extort', buildingIds: sites.slice(0, fit).map((b) => b.id), opts: { manpower: manpowerFor(team, 2) } });
        }
      }
      if (weight.rackets >= 0.45 && policy.illegal && !lieLow) {
        const owned = buildingList(w).filter((b) => b.ownerGangId === gang.id && b.state === 'trading');
        const lands = owned.filter((b) => b.cls === 'empty' && w.lots[b.lotId]?.index === 4);
        let budget = gang.cash * 0.5;
        for (const land of lands.slice(0, 2)) {
          const front = owned.find((b) => b.blockId === land.blockId && b.id !== land.id && b.hidesId == null && ['commercial', 'industrial', 'tenement'].includes(b.cls));
          if (!front) continue;
          const fit = ILLEGAL_TYPES.find((type) => type.id !== 'office' && type.cost < budget && (type.fronts?.includes(front.typeId) || type.fronts?.includes('*')));
          const rooms = BUILDING_BY_ID.rentedRooms;
          const racket = rooms && rooms.cost < budget && rooms.fronts?.includes(front.typeId) ? rooms : fit;
          if (!racket) continue;
          const result = give(`racket ${racket.id}`, freest(undefined, 'business'), {
            type: 'setUpBusiness',
            buildingIds: [land.id],
            opts: { manpower: 1, businessTypeId: racket.id, frontBuildingId: front.id, roomsFloors: racket.id === 'rentedRooms' ? 2 : undefined },
          });
          if (result.ok) budget -= racket.cost;
        }
      }
    }
    if (key === 'bribes' && !hot && w.week >= 4 && weight.bribes >= 0.25) {
      const chief = w.people[w.policeChiefId];
      const gate = 1500 + (1 - weight.bribes) * 2500;
      if (chief && chief.status === 'active' && chief.bribedBy !== gang.id && gang.cash > gate) {
        give('bribe', freest(), { type: 'bribe', personId: chief.id, opts: { manpower: 1, amount: Math.round(200 + weight.bribes * 800) } });
      }
    }
    // Legal takings weigh against protection money in the Bureau's sums, so
    // a suspicious gang buys shops whatever the strategy's buying weight.
    // While suspicion is up, legal cover comes before saving for a racket.
    if (easing) savingFor.delete(w);
    const saving = savingFor.get(w);
    if (key === 'buying' && saving && gang.cash < saving.cost * 1.5) {
      actions.push(`NOTE saving toward a ${saving.name} ($${saving.cost}) — no other premises this week`);
    } else if (key === 'buying' && w.week >= 4 && (weight.buying >= 0.3 || easing)) {
      const gate = easing ? 3000 : 8000 + (1 - weight.buying) * 8000;
      const fraction = easing ? 0.75 : 0.15 + weight.buying * 0.5;
      if (gang.cash > gate) {
        const site = buildingList(w).filter((b) => {
          const cost = BUILDING_BY_ID[b.typeId]?.cost ?? 0;
          return b.ownerGangId == null && b.state === 'trading' && cost > 0 && cost < gang.cash * fraction;
        }).sort(nearer)[0];
        if (site) give(`buy ${site.typeId}`, freest(undefined, 'business'), { type: 'buyPremises', buildingIds: [site.id] });
        else if (easing) actions.push(`NOTE no legal premises for sale under $${Math.round(gang.cash * fraction)}`);
      }
    }
    if (key === 'violence' && w.week >= 8 && policy.violence !== 'low' && (weight.violence >= 0.45 || policy.violence === 'high')) {
      const rival = buildingList(w).filter((b) => b.ownerGangId != null && b.ownerGangId !== gang.id && !b.isHQ && b.state === 'trading').sort(nearer)[0];
      if (rival) {
        const team = freest();
        if (team) give('smash', team, { type: 'smashUp', buildingIds: [rival.id], opts: { manpower: manpowerFor(team, 2) } });
      }
    }
  };

  // A shrinking gang hires before it collects; the collecting areas then fit what time is left.
  const order = shrinking ? ['hiring' as const, ...strategy.priority.filter((key) => key !== 'hiring')] : strategy.priority;
  if (shrinking) actions.push(`NOTE ${rebuild ? 'rebuilding' : lastMen != null && menNow < lastMen ? `gang shrinking (${menNow} men, ${lastMen} last week)` : `only ${menNow} men`} — recruiting first`);
  for (const key of order) spend(key);

  // ---- reinvest spare cash: legal premises first, then a still or a press
  // behind one of them, a speakeasy to pour the liquor, and a warehouse with
  // a truck to export what the outlets cannot take. The trucks between the
  // gang's own sites run by themselves; only the export needs a crew.
  if (w.week >= 4) {
    const keep = 4000 + gangManpower(w, gang) * 80 + campaignReserve;
    let spareCash = gang.cash - keep;
    const owned = () => buildingList(w).filter((b) => b.ownerGangId === gang.id && b.state === 'trading');
    // Counted from the day it is bought or set up, not only once it trades.
    const ownsType = (typeId: string) => buildingList(w).some((b) => b.ownerGangId === gang.id && b.state !== 'destroyed' && b.typeId === typeId);
    // 1.2.20: premises can be bought anywhere; the nearest still come first.
    const near = (b: Building) => b.state !== 'destroyed';
    const price = (b: Building) => BUILDING_BY_ID[b.typeId]?.cost ?? 0;
    const forSale = (pick: (b: Building) => boolean) => buildingList(w)
      .filter((b) => b.ownerGangId == null && b.state === 'trading' && pick(b) && price(b) > 0 && price(b) <= spareCash && near(b)).sort(nearer)[0];
    const centreOf = (blockId: number) => buildingList(w).find((b) => b.blockId === blockId && w.lots[b.lotId]?.index === 4);
    /** The business crew, with a man pulled across from the biggest crew when all of its own are already spoken for. */
    let pulled = false;
    const businessCrew = () => {
      const team = freest(undefined, 'business');
      const busy = (t: (typeof ready)[number]) => t.orderIds.filter((id) => w.orders[id]?.gangId === gang.id).reduce((n, id) => n + (w.orders[id]?.opts.manpower ?? 1), 0);
      if (team && !pulled && busy(team) >= team.memberIds.length + 1) {
        const donor = crewsOf().filter((t) => t.id !== team.id && t.memberIds.length >= 3).sort((a, b) => (b.memberIds.length - busy(b)) - (a.memberIds.length - busy(a)))[0];
        const man = donor ? [...donor.memberIds].reverse().find((id) => !talentPlaced.has(id) && w.people[id]?.status === 'active') : undefined;
        if (donor && man != null && donor.memberIds.length - busy(donor) > 0) {
          const result = moveToTeam(w, gang.id, man, team.id);
          logResult(actions, `reinvest: ${w.people[man]?.name ?? man} joins the business crew for the buying`, result.ok, result.ok ? '' : result.error);
          pulled = true;
        }
      }
      return team;
    };
    const buy = (label: string, site: Building | undefined) => {
      if (!site) return false;
      const result = give(`reinvest: buy ${label} ${site.typeId}`, businessCrew(), { type: 'buyPremises', buildingIds: [site.id] });
      if (result.ok) spareCash -= price(site);
      return result.ok;
    };
    /** Put a racket behind an owned front: on its block's centre lot, buying the lot first if needed. */
    const behind = (racketId: string) => {
      const racket = BUILDING_BY_ID[racketId];
      if (!racket) return 'poor' as const;
      // Close enough: dip into the reserve rather than wait another month.
      if (racket.cost > spareCash + keep * 0.5) {
        savingFor.set(w, { name: racket.name.toLowerCase(), cost: racket.cost + keep });
        return 'poor' as const;
      }
      if (racket.cost > spareCash) spareCash = racket.cost;
      savingFor.delete(w);
      const union = (b: Building) => (racketId === 'teamsters' && b.typeId === 'tradeUnion' ? 0 : 1);
      const fronts = buildingList(w).filter((b) => b.ownerGangId === gang.id && b.state !== 'destroyed' && b.hidesId == null && racket.fronts?.includes(b.typeId)).sort((a, b) => union(a) - union(b) || nearer(a, b));
      for (const front of fronts) {
        const centre = centreOf(front.blockId);
        if (!centre || centre.id === front.id) continue;
        if (centre.ownerGangId === gang.id && centre.cls === 'empty') {
          const result = give(`reinvest: ${racket.name} behind ${front.typeId}`, businessCrew(), {
            type: 'setUpBusiness', buildingIds: [centre.id], opts: { manpower: 1, businessTypeId: racket.id, frontBuildingId: front.id },
          });
          if (result.ok) spareCash -= racket.cost;
          return result.ok ? 'set' as const : 'failed' as const;
        }
        if (centre.ownerGangId == null && centre.cls === 'empty' && price(centre) <= spareCash - racket.cost + keep * 0.5) {
          return buy('the lot behind', centre) ? 'lot' as const : 'failed' as const;
        }
      }
      // A front already waits for its lot or its money: no second one.
      if (fronts.some((f) => { const c = centreOf(f.blockId); return !!c && c.id !== f.id && c.cls === 'empty' && (c.ownerGangId == null || c.ownerGangId === gang.id); })) return 'poor' as const;
      // No usable front yet: buy one where the block's centre lot is still free.
      const freeCentre = (b: Building) => { const c = centreOf(b.blockId); return !!c && c.cls === 'empty' && c.ownerGangId == null; };
      // The Teamsters count three times behind a trade union at the poll.
      const front = (racketId === 'teamsters' ? forSale((b) => b.typeId === 'tradeUnion' && freeCentre(b)) : undefined)
        ?? forSale((b) => !!racket.fronts?.includes(b.typeId) && freeCentre(b));
      return buy(`a front for a ${racket.name.toLowerCase()}:`, front) ? 'front' as const : 'none' as const;
    };
    // Campaign: one business of our own in each block we hold, cheapest first, a
    // block at a time; then the Teamsters, behind a trade union if one is ours or for sale.
    if (campaign && spareCash > 0) {
      const ownBlocks = new Set(buildingList(w).filter((b) => b.ownerGangId === gang.id && b.state !== 'destroyed').map((b) => b.blockId));
      const bare = territoryBlocks(w, gang.id).filter((block) => !ownBlocks.has(block.id)).map((block) => block.id);
      const site = buildingList(w).filter((b) => bare.includes(b.blockId) && b.ownerGangId == null && b.state === 'trading' &&
        ['commercial', 'industrial', 'tenement'].includes(b.cls) && price(b) > 0 && price(b) <= Math.min(spareCash, gang.cash * 0.3))
        .sort((a, b) => price(a) - price(b) || nearer(a, b))[0];
      if (bare.length) actions.push(`NOTE campaign: ${bare.length} of our blocks without a business of our own`);
      if (site) buy('campaign: a business of our own in block', site);
      if (!ownsType('teamsters') && !lieLow && territoryCount(w, gang.id) >= blocksNeeded * 0.5) behind('teamsters');
    }
    if (!policy.illegal || easing) savingFor.delete(w);
    if (spareCash > 0 && policy.illegal && !easing) {
      const producing = ownsType('moonshineStill') || ownsType('counterfeitPress');
      if (!producing) {
        const step = behind('moonshineStill');
        if (step === 'none' || step === 'poor') behind('counterfeitPress');
      } else if (ownsType('moonshineStill') && !ownsType('speakeasy')) {
        behind('speakeasy');
      } else if (!ownsType('warehouse')) {
        buy('a warehouse for the surplus:', forSale((b) => b.typeId === 'warehouse'));
      }
    }
    // Export what has piled up in the warehouses, with a truck if the crew has none.
    const stocked = owned().filter((b) => b.typeId === 'warehouse' && b.stock.liquor + b.stock.stolen + b.stock.counterfeit * 20 >= 60);
    if (stocked.length && policy.illegal) {
      const team = ready.find((t) => (t.vehicles.truck ?? 0) > 0 && freeShare(t) > 0.15) ?? freest(undefined, 'business');
      if (team && (team.vehicles.truck ?? 0) === 0 && gang.cash > VEHICLES.truck.cost + 1000) {
        const result = buyVehicle(w, gang.id, 'truck', team.id);
        logResult(actions, `reinvest: buy truck for ${w.people[team.lieutenantId]?.name ?? 'crew'} to export`, result.ok, result.ok ? '' : result.error);
      }
      if (team && (team.vehicles.truck ?? 0) > 0) give('export the surplus', team, { type: 'export', buildingIds: [stocked[0].id], opts: { manpower: 1 } });
    }
    // Anything still spare buys the best-paying legal premises within reach.
    if (spareCash > 15000 && !savingFor.has(w)) {
      const legal = buildingList(w).filter((b) => b.ownerGangId == null && b.state === 'trading' && ['commercial', 'industrial', 'tenement'].includes(b.cls) &&
        price(b) > 0 && price(b) <= spareCash * 0.5 && near(b)).sort((a, b) => (BUILDING_BY_ID[b.typeId]?.profit ?? 0) / price(b) - (BUILDING_BY_ID[a.typeId]?.profit ?? 0) / price(a))[0];
      buy('legal', legal);
    }
  }

  // ---- equipment: cars where they save time, guns and explosives for the rough work
  const reserve = 2500 + gangManpower(w, gang) * 60;
  if (w.week >= 2) {
    const owed = protectedBuildings(w, gang.id);
    const reach = owed.length ? owed.reduce((sum, b) => sum + dist(w.lots[b.lotId].center, origin), 0) / owed.length : 0;
    // About six trips out and back a week per crew.
    const saved = Math.round(carMinutesSaved(reach, WALK_SPEED, DRIVE_SPEED, 12));
    const carless = ready.filter((team) => !Object.values(team.vehicles).some((n) => n > 0));
    if (carless.length && saved >= 120 && gang.cash > reserve + VEHICLES.coupe.cost) {
      const team = carless.sort((a, b) => b.timeUsed - a.timeUsed)[0];
      const result = buyVehicle(w, gang.id, 'coupe', team.id);
      logResult(actions, `buy car for ${w.people[team.lieutenantId]?.name ?? 'crew'} (saves about ${saved} min a week, average run ${(reach / 54).toFixed(1)} blocks)`, result.ok, result.ok ? '' : result.error);
    } else if (carless.length) {
      actions.push(`NOTE no car bought: a car would save about ${saved} min a week`);
    }
  }
  // ---- men killed on empty land behind buildings: a rival HQ is probably next door.
  // (Losses on the open street keep the usual pull-back and guard response.)
  const scoutFirst = new Set<number>();
  const suspects = suspectedHQ.get(w) ?? new Map<number, number>();
  suspectedHQ.set(w, suspects);
  for (const loss of memberLosses(w, gang.id, w.week - 1)) {
    if (loss.by && /police|FBI|courts|own gang/i.test(loss.by)) continue;
    if (!/shot|kill|stab|beat|bomb|burn|died/i.test(loss.cause) && w.people[loss.personId]?.status !== 'dead') continue;
    const at = loss.buildingId != null ? w.buildings[loss.buildingId] : undefined;
    // Only a man lost while working (investigating) an empty lot: one shot on the street is not a hint.
    const spot = at?.cls === 'empty' ? at : loss.orderType === 'explore' && loss.pos
      ? buildingList(w).find((b) => b.cls === 'empty' && dist(w.lots[b.lotId].center, loss.pos!) < 20) : undefined;
    if (!spot) continue;
    const killer = loss.by ? Object.values(w.gangs).find((g) => g.name === loss.by) : undefined;
    // The suspect is a rival's premises beside the lot (the killer's first), never a shop nobody holds.
    const suspect = buildingList(w).filter((b) => b.blockId === spot.blockId && b.cls !== 'empty' && b.ownerGangId != null && b.ownerGangId !== gang.id && b.state !== 'destroyed')
      .sort((a, b) => Number(b.ownerGangId === killer?.id) - Number(a.ownerGangId === killer?.id) || Number(b.isHQ) - Number(a.isHQ)
        || dist(w.lots[a.lotId].center, w.lots[spot.lotId].center) - dist(w.lots[b.lotId].center, w.lots[spot.lotId].center))[0];
    if (!suspect) { actions.push(`NOTE ${loss.name} killed on empty land in block ${spot.blockId} — no rival premises known there yet; scouting it`); scoutFirst.add(spot.blockId); continue; }
    if (suspect && !suspects.has(suspect.id)) {
      suspects.set(suspect.id, w.week);
      actions.push(`NOTE ${loss.name} killed on empty land in block ${spot.blockId} — suspect a rival HQ at the ${suspect.typeId} (building ${suspect.id})`);
    }
  }
  for (const [id, since] of suspects) {
    const b = w.buildings[id];
    if (!b || b.state === 'destroyed' || b.ownerGangId === gang.id || w.week - since > 8) suspects.delete(id);
  }
  const armed = muscleCrew && ready.includes(muscleCrew) ? muscleCrew : undefined;
  if (armed && suspects.size && policy.violence !== 'low') {
    // A heavily armed strike crew: tommy guns and explosives, bought first.
    for (const item of ['tommy', 'explosives'] as WeaponId[]) {
      if ((armed.weapons[item] ?? 0) >= 1 || gang.cash < reserve * 0.5 + WEAPONS[item].cost) continue;
      const result = buyWeapon(w, gang.id, item, armed.id);
      logResult(actions, `buy ${item} for the strike crew`, result.ok, result.ok ? '' : result.error);
    }
    const [targetId] = [...suspects.keys()];
    const target = w.buildings[targetId];
    const men = manpowerFor(armed, 4);
    const bombed = (armed.weapons.explosives ?? 0) > 0 || (gang.weapons.explosives ?? 0) > 0
      ? give('strike: bomb suspected HQ', armed, { type: 'bomb', buildingIds: [targetId], opts: { manpower: Math.min(4, men) } }) : undefined;
    if (!bombed?.ok) {
      const inside = peopleList(w).find((p) => p.status !== 'dead' && p.gangId != null && p.gangId !== gang.id && p.buildingId === targetId);
      if (inside) give('strike: kill at suspected HQ', armed, { type: 'kill', personId: inside.id, opts: { manpower: Math.min(4, men) } });
      else give('strike: smash suspected HQ', armed, { type: 'smashUp', buildingIds: [targetId], opts: { manpower: men } });
    }
    if (target) suspects.delete(targetId);
  }
  if (armed && w.week >= 3) {
    const shop: WeaponId[] = [];
    if ((armed.weapons.pistol ?? 0) < Math.min(3, armed.memberIds.length + 1)) shop.push('pistol');
    if (policy.violence !== 'low' && gang.cash > reserve + 6000 && (armed.weapons.tommy ?? 0) < 1) shop.push('tommy');
    if (policy.violence !== 'low' && gang.cash > reserve + 3000 && (armed.weapons.explosives ?? 0) < 2 && actionRanks.bombRival >= 0.4) shop.push('explosives');
    for (const item of shop) {
      if (gang.cash < reserve + WEAPONS[item].cost) continue;
      const result = buyWeapon(w, gang.id, item, armed.id);
      logResult(actions, `buy ${item} for ${w.people[armed.lieutenantId]?.name ?? 'crew'}`, result.ok, result.ok ? '' : result.error);
    }
  }

  // ---- scouting: the scout crew explores the nearest blocks it does not hold yet
  const scoutCrew = roleCrew('scout');
  if (scoutCrew && ready.includes(scoutCrew) && freeShare(scoutCrew) > 0.3) {
    const unseen = buildingList(w).filter((b) => b.ownerGangId !== gang.id && b.protection?.gangId !== gang.id && b.state !== 'destroyed' && (b.knowledge?.[gang.id] ?? 0) < 3 &&
      nearTerritory(w, gang.id, b.blockId, 2) && isValidAreaTarget(w, gang.id, 'explore', b)).sort(nearer);
    const block = [...scoutFirst][0] ?? unseen[0]?.blockId;
    const ids = [...new Set(buildingList(w).filter((b) => b.blockId === block && b.ownerGangId !== gang.id && b.state !== 'destroyed' && isValidAreaTarget(w, gang.id, 'explore', b)).sort((a, b) => (a.knowledge?.[gang.id] ?? 0) - (b.knowledge?.[gang.id] ?? 0) || nearer(a, b)).map((b) => b.id))].slice(0, 4);
    if (block != null && ids.length) give('scout', scoutCrew, { type: 'explore', buildingIds: ids, opts: { manpower: 1 } });
  }

  // ---- retaliation (1.2.20): a rival that killed our men last week is answered.
  // The street crews are armed and the muscle strikes back at that gang: one of
  // its known men, or else its nearest premises (bombed if there is dynamite,
  // smashed up otherwise). The grudge lasts three weeks.
  {
    const killedBy = new Map<number, number>();
    for (const loss of memberLosses(w, gang.id, w.week - 1)) {
      if (!loss.by || !/gunned|killed|shot|stab|beat|bomb|burn/i.test(loss.cause)) continue;
      const culprit = Object.values(w.gangs).find((g) => g.id !== gang.id && !g.eliminated && g.name === loss.by);
      if (culprit) killedBy.set(culprit.id, (killedBy.get(culprit.id) ?? 0) + 1);
    }
    const worst = [...killedBy].sort((a, b) => b[1] - a[1])[0];
    if (worst) {
      retaliation.set(w, { gangId: worst[0], until: w.week + 3 });
      actions.push(`NOTE ${worst[1]} of our men killed by ${w.gangs[worst[0]].name} — arming the street crews and striking back`);
    }
    const grudge = retaliation.get(w);
    const enemy = grudge && grudge.until > w.week ? w.gangs[grudge.gangId] : undefined;
    if (grudge && (!enemy || enemy.eliminated)) retaliation.delete(w);
    if (enemy && !enemy.eliminated && !lieLow) {
      // A pistol for every street crew but the extortion crew (which works unarmed).
      for (const team of ready) {
        const role = roles.get(team.id);
        if (role === 'extortion' || role === 'business' || (team.weapons.pistol ?? 0) > 0) continue;
        if (gang.cash < reserve + WEAPONS.pistol.cost) break;
        const result = buyWeapon(w, gang.id, 'pistol', team.id);
        logResult(actions, `arm ${w.people[team.lieutenantId]?.name ?? 'crew'}'s crew against ${enemy.name}`, result.ok, result.ok ? '' : result.error);
      }
      const striker = armed ?? freest(undefined, 'muscle');
      const theirMen = gang.knownPeople.map((id) => w.people[id]).filter((p): p is NonNullable<typeof p> => !!p && p.status === 'active' && p.gangId === enemy.id && p.role !== 'boss');
      const theirSites = buildingList(w).filter((b) => b.ownerGangId === enemy.id && !b.isHQ && b.state === 'trading').sort(nearer);
      if (striker && theirMen.length) {
        const victim = theirMen.sort((a, b) => (b.role === 'lieutenant' ? 1 : 0) - (a.role === 'lieutenant' ? 1 : 0) || a.id - b.id)[0];
        give(`retaliate: kill ${victim.name} of ${enemy.name}`, striker, { type: 'kill', personId: victim.id, opts: { manpower: manpowerFor(striker, 3) } });
      } else if (striker && theirSites.length) {
        const site = theirSites[0];
        const dynamite = (striker.weapons.explosives ?? 0) > 0;
        give(`retaliate: ${dynamite ? 'bomb' : 'smash up'} ${enemy.name}'s ${site.typeId}`, striker, { type: dynamite ? 'bomb' : 'smashUp', buildingIds: [site.id], opts: { manpower: manpowerFor(striker, 3) } });
      } else if (striker) actions.push(`NOTE nothing of ${enemy.name}'s known to strike at — scouting for them`);
    }
  }

  // ---- the ranked action table: dice weighted by rank when men and cash are spare
  const spare = ready.filter((team) => freeShare(team) >= 0.35);
  if (w.week >= 3 && gangManpower(w, gang) >= 8 && spare.length && gang.cash > reserve) {
    const near = (b: Building) => nearTerritory(w, gang.id, b.blockId, 3);
    const rivalSites = buildingList(w).filter((b) => b.ownerGangId != null && b.ownerGangId !== gang.id && !b.isHQ && b.state === 'trading' && near(b)).sort(nearer);
    const raidSites = buildingList(w).filter((b) => raidValue(b, gang.id) > 0 && near(b) && b.protection?.gangId !== gang.id).sort((a, b) => raidValue(b, gang.id) - raidValue(a, gang.id));
    const refused = w.lastWeekOrders.filter((o) => o.gangId === gang.id && o.type === 'extort').flatMap((o) => (o.refusals ?? []).map((r) => r.buildingId))
      .map((id) => w.buildings[id]).filter((b): b is Building => !!b && b.state === 'trading' && b.protection?.gangId !== gang.id);
    const rivals = gang.knownPeople.map((id) => w.people[id]).filter((p): p is NonNullable<typeof p> => !!p && p.status === 'active' && p.gangId != null && p.gangId !== gang.id && (p.role === 'hood' || p.role === 'lieutenant'));
    const snitch = Object.values(w.people).find((p) => p.role === 'snitch' && p.status === 'active');
    const rivalGangs = Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated).map((g) => g.id);
    const explosives = (armed?.weapons.explosives ?? 0) + (gang.weapons.explosives ?? 0) > 0;
    const peaceful = policy.violence === 'low';
    const available = ACTION_KEYS.filter((key) => !(peaceful && ['torchRival', 'bombRival', 'kidnapRival', 'killRival', 'raid', 'strikeFbi'].includes(key))).filter((key) => ({
      raid: raidSites.length > 0, pressRefuser: refused.length > 0, torchRival: rivalSites.length > 0,
      bombRival: rivalSites.length > 0 && explosives, kidnapRival: rivals.length > 0, killRival: rivals.length > 0 && !!armed,
      snitch: !!snitch && gang.snitchUsedWeek !== w.week && rivalGangs.length > 0 && gang.cash > reserve + 1500,
      // Rare and low-ranked: the FBI director, struck at his headquarters.
      strikeFbi: !!armed && !lieLow && w.week >= 8 && w.people[w.fbiHeadId]?.status === 'active',
    } as Record<ActionKey, boolean>)[key]);
    const rolls = (gang.cash > reserve + 15000 ? 2 : 1) + (policy.violence === 'high' ? 1 : 0);
    const tried = new Set<ActionKey>();
    for (let n = 0; n < rolls; n++) {
      const key = rollAction(actionRanks, available.filter((k) => !tried.has(k)), rng);
      if (!key) break;
      tried.add(key);
      actions.push(`ROLL ${key} (${ACTION_LABELS[key]}, rank ${actionRanks[key]})`);
      const crewRole: CrewRole = key === 'pressRefuser' ? 'extortion' : 'muscle';
      const team = freest(undefined, crewRole);
      const cashBefore = gang.cash;
      if (key === 'snitch') {
        const knownBefore = gang.knownPeople.length;
        const result = buySnitchInfo(w, rng, gang.id, snitch!.id, rivalGangs);
        logResult(actions, `snitch ${snitch!.name}`, result.ok, result.ok ? result.message ?? '' : result.error);
        if (result.ok) pendingActions.push({ key, knownBefore, cashBefore });
        continue;
      }
      let input: Omit<IssueOrderInput, 'teamId'>;
      let targetBuildingId: number | undefined, targetPersonId: number | undefined;
      const men = team ? manpowerFor(team, 3) : 1;
      if (key === 'raid') { targetBuildingId = raidSites[0].id; input = { type: 'raid', buildingIds: [targetBuildingId], opts: { manpower: men } }; }
      else if (key === 'pressRefuser') { targetBuildingId = refused[0].id; input = { type: 'extort', buildingIds: [targetBuildingId], opts: { manpower: team ? manpowerFor(team, 3) : 1 } }; }
      else if (key === 'torchRival' || key === 'bombRival') { targetBuildingId = rivalSites[rng.int(0, Math.min(2, rivalSites.length - 1))].id; input = { type: key === 'torchRival' ? 'torch' : 'bomb', buildingIds: [targetBuildingId], opts: { manpower: men } }; }
      else if (key === 'strikeFbi') { targetPersonId = w.fbiHeadId; input = { type: 'kill', personId: w.fbiHeadId, opts: { manpower: team ? manpowerFor(team, 4) : 1 } }; }
      else { const victim = rivals[rng.int(0, rivals.length - 1)]; targetPersonId = victim.id; input = { type: key === 'kidnapRival' ? 'kidnap' : 'kill', personId: victim.id, opts: { manpower: men } }; }
      const result = give(`${ACTION_LABELS[key]}`, team, input);
      const orderId = team?.orderIds[team.orderIds.length - 1];
      if (result.ok && orderId != null) pendingActions.push({ key, orderId, targetBuildingId, targetPersonId, cashBefore });
    }
  }

  // ---- the win itself
  if (goal === 'office' && w.election.active && !gang.runningForOffice) {
    if (canRunForOffice(w, gang.id)) {
      const result = setRunForOffice(w, gang.id, true);
      logResult(actions, 'the lawyer stands the boss for mayor', result.ok, result.ok ? result.message ?? '' : result.error);
    } else {
      actions.push(`NOTE election under way, ${territoryCount(w, gang.id)} blocks — not yet able to stand`);
    }
  }
  if (goal === 'straight' && !gang.goingStraight) {
    const check = canGoStraight(w, gang.id);
    const illegal = buildingList(w).filter((b) => b.ownerGangId === gang.id && b.cls === 'illegal' && b.typeId !== 'office');
    const openCaseCount = openCases.length;
    // Close the rackets only once the legal holdings carry the threshold with room to spare.
    if (!check.can && illegal.length && !openCaseCount && gangAssets(w, gang) >= GO_STRAIGHT_ASSETS * 1.15) {
      for (const b of illegal) {
        // An illegal business cannot be sold, only shut down (1.2.16 tried to sell and was refused every week).
        const typeId = b.typeId;
        const result = shutdownBuilding(w, gang.id, b.id);
        logResult(actions, `shut down ${typeId} to go straight`, result.ok, result.ok ? result.message ?? '' : result.error);
      }
    }
    if (canGoStraight(w, gang.id).can) {
      const result = setGoStraight(w, gang.id, true);
      logResult(actions, 'go straight', result.ok, result.ok ? result.message ?? '' : result.error);
    }
  }

  lastMonday.set(w, { timeShort });
  shortCrews.set(w, new Set(outOfTime));
  const idle = ready.filter((team) => team.orderIds.every((id) => !w.orders[id] || w.orders[id].gangId !== gang.id) && team.timeUsed === 0);
  if (idle.length) actions.push(`NOTE ${idle.length} crew${idle.length === 1 ? '' : 's'} without an order: ${idle.map((team) => w.people[team.lieutenantId]?.name ?? team.id).join(', ')}`);
  if (gangManpower(w, gang) === beforeMen && gang.poolIds.length === 0 && gang.recruitIds.length === 0 && hoodSites.length === 0) {
    actions.push('NOTE nobody hired and no hiring place');
  }
  return actions;
}

function reportText(parts: {
  settings: AutoTestSettings;
  citySeed: number;
  campaign: CampaignSettings;
  strategy: PlayStrategy;
  versusLast: string[];
  planNote: string;
  weeks: AutoTestWeek[];
  actions: string[];
  notes: string[];
  anomalies: string[];
  outcome: string;
  score: number;
  /** The diary's finer learning measure, which can pass 100. */
  learningScore?: number;
  scoreNote?: string;
  beat: string;
  plateau: string;
  diaryNote: string;
}): string {
  const learn = parts.settings.learn !== false;
  const lines = [
    'Hood Simulator — auto test',
    `Strategy seed: ${parts.settings.seed}`,
    `City seed: ${parts.citySeed}`,
    `Settings: ${campaignLabel(parts.campaign)}`,
    isDefaultCampaign(parts.campaign)
      ? 'This is the default campaign. The diary is learning this combination.'
      : 'This is not the default campaign. It is learned on its own and does not teach rivals.',
    `Weeks asked: ${parts.settings.weeks ?? 'until victory or loss'}`,
    `Speed: ${parts.settings.speed}. Written on the report. The test runs flat out.`,
    `Learning: ${learn ? 'on' : 'off'}`,
    '',
    'Strategy tried',
    ...formatStrategy(parts.strategy),
    parts.planNote,
    'Changed vs last matching run',
    ...(parts.versusLast.length ? parts.versusLast : ['(no change)']),
    parts.beat,
    parts.plateau,
    parts.diaryNote,
    '',
    'Timeline',
  ];
  if (!parts.weeks.length) lines.push('(no week finished)');
  for (const week of parts.weeks) {
    const heap = week.heapUsed != null && week.heapTotal != null ? ` heap ${formatHeapMb({ used: week.heapUsed, total: week.heapTotal })}` : '';
    lines.push(`Week ${week.week}: cash ${week.cash} men ${week.men} territory ${week.territory} heat ${week.heat} buildings ${week.buildings} suspicion ${week.suspicion} end-week ${week.ms} ms save ${week.saveBytes} bytes${heap}`);
    lines.push(`  ${week.standings}`);
  }
  lines.push('', 'Actions');
  if (!parts.actions.length) lines.push('(none)');
  for (const action of parts.actions) lines.push(action);
  lines.push('', 'Anomalies');
  if (!parts.anomalies.length) lines.push('(none)');
  for (const anomaly of parts.anomalies) lines.push(anomaly);
  lines.push('', 'Notes');
  if (!parts.notes.length) lines.push('(none)');
  for (const note of parts.notes) lines.push(note);
  lines.push('', 'Outcome', parts.outcome, `Score: ${parts.score}${parts.scoreNote ? ` ${parts.scoreNote}` : ''}`);
  if (parts.learningScore != null) lines.push(`Learning score (diary only, compares Auto Test runs): ${parts.learningScore}`);
  return lines.join('\n');
}

/** Run the bot, append the diary, then write 09 Reports. Returns the report text either way. */
export async function runAutoTest(sim: Sim, settings: AutoTestSettings, finish: (sim: Sim) => Promise<void> | void, sink: DiarySink = folderDiary()): Promise<string> {
  recruitMemory = newRecruitMemory();
  pendingActions = [];
  talentPlaced.clear();
  clearWeekHeaps();
  noteAutoTestRunning(
    `seed ${settings.seed} learn ${settings.learn === false ? 'off' : 'on'}`,
    settings.weeks == null ? 'until victory or loss' : `${settings.weeks} weeks`,
  );
  const learn = settings.learn !== false;
  const campaign = campaignOf(sim);
  const loaded = await loadDiary(sink).catch(() => ({ diary: { version: 1 as const, entries: [] }, unreadable: true }));
  const planned = loaded.unreadable
    ? planRun({ version: 1, entries: [] }, campaign, settings.seed, false)
    : planRun(loaded.diary, campaign, settings.seed, learn);
  if (loaded.unreadable) {
    planned.note = 'The diary file could not be read and was left in place. This run used the built-in strategy.';
    planned.versusLast = ['The diary could not be read. Built-in strategy.'];
  }
  // The ranked action table carries on from the last matching run that kept one.
  const rankedBefore = learn && !loaded.unreadable ? [...matchingEntries(loaded.diary, campaign)].reverse().find((entry) => entry.actionRanks) : undefined;
  actionRanks = loadActionRanks(rankedBefore?.actionRanks);
  const ledgerBefore = learn && !loaded.unreadable ? [...matchingEntries(loaded.diary, campaign)].reverse().find((entry) => entry.timeLedger) : undefined;
  timeLedger = { ...(ledgerBefore?.timeLedger ?? {}) };
  const ranksAtStart = { ...actionRanks };

  const actions: string[] = [];
  const notes: string[] = [];
  const weeks: AutoTestWeek[] = [];
  /** Men lost this run, by cause and culprit. */
  const lostTally = new Map<string, number>();
  let flatRecruit = 0;
  let dryRecruit = 0;
  const cap = settings.weeks == null ? Infinity : Math.min(settings.weeks, AUTO_TEST_MAX_WEEKS);
  autoTestRunning = true;
  stopAfterThisWeek = false;
  stoppedThisRun = false;
  emitAutoTestRun();
  try {
  let resultsSaid = new Map<number | string, string>();
  let resultsNow = new Map<number | string, string>();
  for (let i = 0; i < cap; i++) {
    if (stopAfterThisWeek) { stoppedThisRun = true; notes.push('Stopped before another week. The desk is yours.'); break; }
    if (sim.world.phase !== 'planning') break;
    const menBefore = gangManpower(sim.world, sim.playerGang);
    const rosterBefore = new Map(gangMembers(sim.world, sim.playerGang).map((p) => [p.id, p.status] as const));
    const weekBefore = sim.world.week;
    const poolBefore = sim.playerGang.poolIds.length;
    try {
      actions.push(`-- week ${sim.world.week}`);
      const taken = playAutoWeek(sim, settings.seed, planned.strategy);
      actions.push(...taken);
      if (taken.some((line) => line.startsWith('NOTE no hoods'))) dryRecruit += 1;
      else dryRecruit = 0;
      if (dryRecruit >= 2) notes.push(`Stuck: 0 available recruits for ${dryRecruit} weeks.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      actions.push(`ERROR planning: ${message}`);
      notes.push(`Planning threw: ${message}`);
    }
    const started = performance.now();
    try {
      await finish(sim);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notes.push(`End Week threw: ${message}`);
      break;
    }
    const ms = Math.round(performance.now() - started);
    const phase: string = sim.world.phase;
    if (phase === 'week') {
      notes.push('End Week returned while the week was still running.');
      break;
    }
    const weekSnap = snapshot(sim, ms);
    // A week that ends the game does not advance the calendar; label it as the week after the one played, like every other.
    weekSnap.week = Math.max(weekSnap.week, weekBefore + 1);
    if (weeks.length && weeks[weeks.length - 1].week >= weekSnap.week) weekSnap.week = weeks[weeks.length - 1].week + 1;
    // The week is saved by now. Pause if used heap looks high, then stop
    // only if it is still above 80% of the limit after garbage collection.
    const memory = await checkMemoryStop();
    if (memory.heap) {
      weekSnap.heapUsed = memory.heap.used;
      weekSnap.heapTotal = memory.heap.total;
      noteWeekHeap(weekSnap.week, memory.heap.used, memory.heap.total);
    }
    weeks.push(weekSnap);
    for (const line of lostLines(sim.world, sim.playerGang.id, rosterBefore, weekBefore)) {
      actions.push(line.text);
      lostTally.set(line.key, (lostTally.get(line.key) ?? 0) + 1);
    }
    rememberRecruitResults(
      sim.world.lastWeekOrders.filter((order) => order.gangId === sim.playerGang.id),
      sim.world.week,
    );
    for (const pending of pendingActions) {
      const verdict = judgeAction(sim.world, sim.playerGang, pending, sim.world.lastWeekOrders);
      const rank = verdict.ok == null ? actionRanks[pending.key] : verdict.ok ? rankUp(actionRanks, pending.key) : rankDown(actionRanks, pending.key);
      actions.push(`OUTCOME ${pending.key} ${verdict.ok == null ? 'neutral' : verdict.ok ? 'success' : 'failure'} — ${verdict.why}; rank ${verdict.ok == null ? 'unchanged at' : 'now'} ${rank}`);
    }
    pendingActions = [];
    for (const order of sim.world.lastWeekOrders) {
      if (order.gangId !== sim.playerGang.id || !['recruit', 'buyPremises', 'setUpBusiness', 'export'].includes(order.type)) continue;
      const reason = order.failReason || order.results.join(' ');
      // An order still running carries last week's report; say it once.
      const line = `RESULT ${order.type} — ${reason}`;
      if (reason && resultsSaid.get(order.id) !== reason && !resultsSaid.has(line)) actions.push(line);
      if (reason) { resultsNow.set(order.id, reason); resultsNow.set(line, reason); }
    }
    resultsSaid = resultsNow;
    resultsNow = new Map();
    const men = gangManpower(sim.world, sim.playerGang);
    if (men === menBefore && sim.playerGang.poolIds.length === poolBefore && sim.playerGang.recruitIds.length === 0) flatRecruit += 1;
    else flatRecruit = 0;
    if (flatRecruit >= 2) notes.push(`Stuck: men stayed ${men} and the pool stayed empty for ${flatRecruit} weeks.`);
    if (phase === 'gameOver') break;
    if (settings.weeks == null && sim.world.outcome) break;
    if (memory.stop && memory.heap) {
      memoryStopped = true;
      stoppedThisRun = true;
      const share = memory.heap.used / memory.heap.limit;
      notes.push(`Stopped: the browser's memory was ${Math.round(share * 100)}% full after week ${sim.world.week - 1} (used ${formatHeapMb(memory.heap)}). The city is saved; reload the page before running more weeks.`);
      break;
    }
    if (stopAfterThisWeek) { stoppedThisRun = true; notes.push('Stopped after this week. The desk is yours.'); break; }
  }
  } finally {
    autoTestRunning = false;
    stopAfterThisWeek = false;
    emitAutoTestRun();
  }
  if (settings.weeks != null && settings.weeks > AUTO_TEST_MAX_WEEKS && weeks.length >= AUTO_TEST_MAX_WEEKS) {
    notes.push(`Stopped after ${AUTO_TEST_MAX_WEEKS} weeks, the one-year limit.`);
  }
  const goalNow = autoTestGoal(sim.world);
  if (goalNow) notes.push(`Goal: ${goalNow.goal} (${GOAL_LABELS[goalNow.goal]}). History: ${goalNow.history.join('; ')}.`);
  if (lostTally.size) notes.push(`Men lost: ${[...lostTally].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ')}.`);
  else notes.push('Men lost: none.');
  notes.push(`Action ranks: ${ACTION_KEYS.map((key) => `${key} ${ranksAtStart[key]}→${actionRanks[key]}`).join(', ')}.`);
  const odd = weeks.filter((week) => !Number.isFinite(week.cash) || !Number.isFinite(week.men) || week.cash < 0 || week.men < 0);
  for (const week of odd) notes.push(`Suspicious: week ${week.week} cash ${week.cash} men ${week.men}.`);

  const won = sim.world.outcome ? sim.world.outcome.won : null;
  const outcome = sim.world.outcome ? `${sim.world.outcome.won ? 'won' : 'lost'}: ${sim.world.outcome.reason}` : 'still playing';
  const score = scoreRun(weeks[weeks.length - 1], won);
  // The score the player sees on the win or loss screen; while the game runs, the same sum without a win bonus or loss penalty.
  const gameScore = gameScoreNow(sim.world);
  const scoreNote = sim.world.outcome ? '' : '(game still running: no win bonus or loss penalty yet)';
  if (sim.world.outcome) recordPastGame(sim.world, true);
  const previousBest = planned.previousBest;
  const beatBest = previousBest == null || score > previousBest;
  const beat = previousBest == null
    ? `Beat the previous best: yes (learning score ${score}, no earlier matching run).`
    : beatBest
      ? `Beat the previous best: yes (learning score ${score}, previous ${previousBest}).`
      : `Beat the previous best: no (learning score ${score}, previous ${previousBest}). The next learning run returns to the best.`;
  const anomalies = [
    ...balanceAnomalies(weeks, actions, won, sim.world.gridW * sim.world.gridH),
    ...notes.filter((note) => note.startsWith('Stuck:') || note.startsWith('Suspicious:')),
  ];

  let diaryNote = 'Diary: appended.';
  let recorded = loaded.diary.entries;
  if (loaded.unreadable) {
    diaryNote = 'Diary: the file could not be read, so this run was not appended.';
  } else {
    const entry: DiaryEntry = {
      at: new Date().toISOString(),
      settings: campaign,
      seed: settings.seed,
      weeks: settings.weeks,
      speed: settings.speed,
      learn,
      strategy: planned.strategy,
      changes: planned.versusLast,
      summary: weeks.map((week) => ({ week: week.week, cash: week.cash, men: week.men, territory: week.territory, heat: week.heat, buildings: week.buildings })),
      score,
      outcome,
      beatBest,
      previousBest,
      anomalies,
      actionRanks: { ...actionRanks },
      timeLedger: { ...timeLedger },
      goal: goalNow?.goal,
      goalHistory: goalNow?.history,
    };
    recorded = [...loaded.diary.entries, entry];
    try {
      await sink.write(serializeDiary({ version: 1, entries: recorded }));
      const same = matchingEntries({ version: 1, entries: recorded }, campaign).length;
      const other = recorded.length - same;
      diaryNote = `Diary: ${same} matching run${same === 1 ? '' : 's'}, ${other} other setting${other === 1 ? '' : 's'} left out of the comparison.`;
    } catch (error) {
      diaryNote = `Diary: not saved (${error instanceof Error ? error.message : 'the folder refused the file'}).`;
    }
  }

  const plateau = plateauNote(recorded, campaign);
  const text = reportText({
    settings, citySeed: sim.world.options.seed, campaign, strategy: planned.strategy,
    versusLast: planned.versusLast, planNote: planned.note, weeks, actions, notes, anomalies,
    outcome, score: gameScore, learningScore: score, scoreNote, beat, plateau, diaryNote,
  });
  const filename = `auto-test-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  const last = weeks[weeks.length - 1];
  let noted = false;
  try {
    noteLastAutoTest({
      settings: `${campaignLabel(campaign)} seed ${settings.seed} learn ${learn ? 'on' : 'off'}`,
      weeks: settings.weeks == null ? 'until victory or loss' : `${settings.weeks} weeks`,
      cash: last?.cash ?? 0,
      men: last?.men ?? 0,
      territory: last?.territory ?? 0,
      score: gameScore,
      diary: diaryNote,
      file: filename,
    });
    noted = true;
    await writeReportFile(filename, text);
    return text;
  } catch (error) {
    if (!noted) noteAutoTestStopped(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
