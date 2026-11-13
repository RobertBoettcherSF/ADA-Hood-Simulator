import { learnedBlock } from './diary';
import { splitReport } from './devJournal';
import { planRoute } from './routing';
import { buyAllowed, deskMemory, HQ_STRIKE_GAP, knownRivalHQs, moveRefused, noteRefusedMove, reviewBuys } from './autoBusiness';
import { decideWeek, inputFor, MIN_FREE_MINUTES, type OrderKind, type Proposal } from './autoDecide';
import { noteDevDesk } from './devJournal';
import { startingConditions } from './startingConditions';
import { instanceFile } from './instance';
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
import { ACTION_KEYS, ACTION_LABELS, assignCrewRoles, carMinutesSaved, crewNames, roleStars, defaultActionRanks, judgeAction, loadActionRanks, raidValue, rankDown, rankUp, rollAction, talentSwaps, type ActionKey, type ActionRanks, type CrewRole, type PendingAction } from './autoActions';
import { DRIVE_SPEED, GO_STRAIGHT_ASSETS, VEHICLES, WALK_SPEED, WEAPONS } from '../sim/constants';
import type { Building, Gang, ID, Person, Team, WeaponId } from '../sim/types';
import { buildingMapIntel } from '../sim/mapIntel';
import { claimedTerritoryBlocks } from '../sim/territory';
import { BUILDING_BY_ID, ESTABLISHABLE_TYPES, ILLEGAL_TYPES } from '../sim/data/buildings';
import { purchasablePremisesType } from '../sim/premises';
import { buildingValue, isValidAreaTarget } from '../sim/execution';
import type { Sim } from '../sim/sim';
import { buildingDoor, dist, gangAssets, gangManpower, gangMembers, powerRating, protectedBuildings, territoryBlocks, territoryCount } from '../sim/world';
import { effectiveHostility } from '../sim/attitudes';
import { buildingList, peopleList } from '../sim/entityLists';
import { MAX_TEAM_SIZE, MAX_TEAMS, MINUTES_PER_WEEK } from '../sim/constants';
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
/** Crews whose orders were refused for lack of time last week. */
const shortCrews = new WeakMap<Sim['world'], Set<number>>();
let pendingActions: PendingAction[] = [];
/** Men the talent pass moved this run; the crew balancer leaves them where they are. */
const talentPlaced = new Set<number>();
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
/** 1.2.24: used heap above which Auto Test idles HEAP_IDLE_MS between weeks. */
export const HEAP_IDLE_MB = 1024;
export const HEAP_IDLE_MS = 1500;

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

/** Weeks a recruiting venue is skipped once it has come up empty EMPTY_VENUE_STREAK weeks running. */
export const EMPTY_VENUE_SKIP_WEEKS = 4;
/** 1.2.24 (Robert's rule): a venue with no recruits three weeks running is skipped, unless a rumour points at it. */
export const EMPTY_VENUE_STREAK = 3;

export interface RecruitMemory {
  hintIds: number[];
  /** Building id → first week the venue may be tried again. */
  emptyUntil: Map<number, number>;
  /** 1.2.24: building id → weeks running it came up empty. */
  emptyStreak: Map<number, number>;
  /** 1.2.24: venues that gave us recruits last week, tried first after a rumour. */
  yieldedIds: number[];
}

export function newRecruitMemory(): RecruitMemory {
  return { hintIds: [], emptyUntil: new Map(), emptyStreak: new Map(), yieldedIds: [] };
}

let recruitMemory = newRecruitMemory();
/** 1.2.24: our businesses (id → manager) last Monday, to log managers killed and businesses lost. */
const coolingOff = new WeakMap<object, boolean>();
/** 1.2.24: blocks where we bombed a rival store to buy in (block → week). */
const bombedBlocks = new WeakMap<object, Map<number, number>>();
const ownedLastWeek = new WeakMap<object, Map<number, number | null>>();

/** A rumour first, then last week's productive venues, then the rest; a venue empty three weeks running is skipped. */
export function chooseHoodRecruitSites<T extends { id: number }>(
  sites: T[],
  memory: RecruitMemory = recruitMemory,
  week = 0,
): T[] {
  const open = (site: T) => (memory.emptyUntil.get(site.id) ?? 0) <= week;
  const picked: T[] = [];
  const seen = new Set<number>();
  // A rumour points at a venue whatever its record.
  for (const id of memory.hintIds) {
    const site = sites.find((entry) => entry.id === id);
    if (!site || seen.has(id)) continue;
    picked.push(site); seen.add(id);
  }
  for (const id of memory.yieldedIds) {
    const site = sites.find((entry) => entry.id === id);
    if (!site || seen.has(id) || !open(site)) continue;
    picked.push(site); seen.add(id);
  }
  for (const site of sites) if (!seen.has(site.id) && open(site)) { picked.push(site); seen.add(site.id); }
  // If every known venue is still cooling down, try them anyway rather than hiring nowhere.
  return picked.length ? picked : sites;
}

export function rememberRecruitResults(
  orders: { type: string; recruitHintId?: number | null; emptyRecruitIds?: number[]; targetBuildingIds?: number[]; opts?: { recruitAs?: string } }[],
  week: number,
  memory: RecruitMemory = recruitMemory,
): void {
  const yielded: number[] = [];
  for (const order of orders) {
    // 1.2.21: only hood recruiting feeds the hood venues' memory; an accountant's
    // or lawyer's tip points at their own offices, never the gyms and pool halls.
    if (order.type !== 'recruit' || (order.opts?.recruitAs != null && order.opts.recruitAs !== 'hood')) continue;
    if (order.recruitHintId != null) {
      memory.hintIds = [order.recruitHintId, ...memory.hintIds.filter((id) => id !== order.recruitHintId)];
    }
    const empty = new Set(order.emptyRecruitIds ?? []);
    for (const id of empty) {
      const streak = (memory.emptyStreak.get(id) ?? 0) + 1;
      memory.emptyStreak.set(id, streak);
      if (streak >= EMPTY_VENUE_STREAK) memory.emptyUntil.set(id, week + EMPTY_VENUE_SKIP_WEEKS);
    }
    for (const id of order.targetBuildingIds ?? []) {
      if (empty.has(id)) continue;
      memory.emptyStreak.delete(id); memory.emptyUntil.delete(id);
      yielded.push(id);
    }
  }
  memory.yieldedIds = [...new Set(yielded)];
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
    // 1.2.21: in-game knowledge only — our own books; for rivals what the desk
    // shows (blocks on the map, the power graph). Their cash is in the debug report.
    .map((other) => other.id === gang.id
      ? `${other.name} $${Math.round(other.cash)} men ${gangManpower(sim.world, other)}`
      : `${other.name} blocks ${territoryCount(sim.world, other.id)} power ${powerRating(sim.world, other)}${other.eliminated ? ' out' : ''}`)
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
/** 1.2.21: men and blocks at each Monday, to stop hiring when new men add no blocks. */
const menBlocks = new WeakMap<Sim['world'], { men: number; blocks: number }[]>();
/** 1.2.21: the police chief's opinion of us last Monday (the chief is paid only when it falls). */
const chiefOpinionLastWeek = new WeakMap<Sim['world'], number>();
/** A crew is worth starting only when every existing one has this many hoods. */
const USEFUL_CREW = 4;
/** 1.2.24: crews opened at a useful size, one per kind of work (extortion, recruiting, collecting, business). */
const KIND_CREWS = 4;
/** 1.2.21: eight lieutenants with nine hoods each — the most men the crews can use. */
const CREW_CAPACITY = MAX_TEAMS * MAX_TEAM_SIZE;
/** Idle hoods kept in the pool as replacements; more are sacked, the weakest first. */
const POOL_RESERVE = 3;
/** A racket the gang is saving for: other premises wait until its cost is in hand. */
const savingFor = new WeakMap<Sim['world'], { name: string; cost: number }>();

/** Suspicion at which the desk starts paying the police chief and easing the extortion (1.2.19: 30, was 40). */
const SUSPICION_BRIBE = 30;
/** 1.2.23: past this suspicion extortion eases and money goes to lowering it. */
const SUSPICION_EASE = 60;
/** 1.2.23: the most cash kept back for wages before reinvesting. */
const RESERVE_CAP = 12_000;
/** 1.2.23: a strike goes only to a crew with this much of its week left. */
const STRIKE_MIN_FREE = 240;
/** 1.2.23: idle cash above which buys may go to other crews once the business crew's week is full. */
const SPILL_CASH = 40_000;
/** 1.2.24: an HQ strike needs a crew of at least this many men (lieutenant included), explosives and its whole week free. */
const STRIKE_MIN_MEN = 5;
/** 1.2.24: premises worth this much or more are the surplus's big buildings (banks, department stores, hotels…). */
const BIG_BUILDING_COST = 20_000;
/** Suspicion at which the gang lies low: collecting and legal buying only. */
export const SUSPICION_LIE_LOW = 50;
/** A rise this big in one week counts as one level hotter than the figure says. */
export const SUSPICION_JUMP = 15;
/** Most of the gang's men on risky street orders (extortion and rough work) at once; less while easing. */
export const RISKY_SHARE = 0.5;
export const RISKY_SHARE_EASING = 0.35;
/** 1.2.24: walks an unarmed crew skips while suspicion is high. */
const OFF_STREET_ORDERS = new Set(['explore', 'guardBusiness', 'patrol']);
const crewArmed = (team: Team) => Object.values(team.weapons).some((n) => (n ?? 0) > 0);
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
  /** Lieutenants, crew hoods and the pool — the men the crews can use (managers and specialists apart). */
  const crewMen = () => gang.poolIds.length + crewsOf().reduce((sum, team) => sum + team.memberIds.length + 1, 0);
  /** Pool hoods free to work: not resting off the heat, not the lawyer or accountant. */
  const idlePool = () => gang.poolIds.filter((id) => { const p = w.people[id]; return !!p && p.status === 'active' && p.role === 'hood' && !resting.get(w)?.has(id); });
  // 1.2.22: the desk's memory of buys and refused moves; last week's buys are judged first.
  const desk = deskMemory(w);
  for (const line of reviewBuys(w, gang, desk)) { actions.push(line); noteDevDesk(line); }
  /** A crew move, never repeated once refused (crew full or out of time) for a few weeks. */
  const tryMove = (personId: number, teamId: number, label: string): ApiResult => {
    if (moveRefused(desk, personId, teamId)) {
      actions.push(`NOTE ${label} skipped — refused recently, not asked again until it can work`);
      return { ok: false, error: 'Refused recently.' };
    }
    const result = moveToTeam(w, gang.id, personId, teamId);
    if (!result.ok) noteRefusedMove(desk, w, personId, teamId, result.error);
    logResult(actions, label, result.ok, result.ok ? result.message ?? '' : result.error);
    return result;
  };

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
  // 1.2.24: managers running our businesses never count against a headcount
  // (Robert: the long game's 92 men were 28 in crews and 64 managers, so hiring stalled).
  const rebuild = crewMen() < 10 && gang.cash > 50000;
  const policy = rebuild ? { ...GOAL_POLICY[goal], violence: 'low' as const, expansion: Math.min(0.6, GOAL_POLICY[goal].expansion) } : GOAL_POLICY[goal];
  if (rebuild) actions.push(`NOTE rebuilding the gang first: ${crewMen()} men and $${Math.round(gang.cash)} — recruiting comes before everything, no rough work`);
  const managerCount = buildingList(w).filter((b) => b.ownerGangId === gang.id && b.managerId != null && w.people[b.managerId]?.status !== 'dead').length;
  actions.push(`NOTE men: ${crewMen()} in crews and pool, ${managerCount} managers (not counted against any limit)`);
  // 1.2.24: last week's arrests, each with its cause.
  {
    const arrests = memberLosses(w, gang.id, w.week - 1).filter((l) => l.week === w.week - 1 && /arrest/i.test(l.cause));
    actions.push(`ARRESTS week ${w.week - 1}: ${arrests.length}${arrests.length ? ` — ${arrests.map((l) => `${l.name} (${l.role}) ${l.cause}${l.by ? ` by ${l.by}` : ''}${l.orderType ? ` on ${l.orderType}` : ' off duty'}`).join('; ')}` : ''}`);
  }
  // 1.2.24: a manager killed or an owned business lost since last Monday is logged.
  {
    const before = ownedLastWeek.get(w);
    const now = new Map<number, number | null>();
    for (const b of buildingList(w)) if (b.ownerGangId === gang.id && !b.isHQ) now.set(b.id, b.managerId ?? null);
    for (const [id, managerId] of before ?? []) {
      const b = w.buildings[id];
      const m = managerId == null ? undefined : w.people[managerId];
      const label = `${BUILDING_BY_ID[b?.typeId ?? '']?.name ?? b?.typeId ?? 'business'} #${id}`;
      if (!b || b.state === 'destroyed') actions.push(`LOSS ${label} destroyed${m ? ` (manager ${m.name} ${m.status === 'dead' ? 'killed' : m.status})` : ''}`);
      else if (b.ownerGangId !== gang.id) actions.push(`LOSS ${label} no longer ours`);
      else if (m && m.status === 'dead') actions.push(`LOSS manager ${m.name} of ${label} killed`);
    }
    ownedLastWeek.set(w, now);
  }

  for (const id of [...gang.recruitIds]) {
    const person = w.people[id];
    if (person?.role === 'hood' && crewMen() >= CREW_CAPACITY && idlePool().length >= POOL_RESERVE) {
      actions.push(`NOTE hire ${person.name} held — the crews are full (${crewMen()} of ${CREW_CAPACITY}) and ${idlePool().length} wait in the pool`);
      continue;
    }
    // 1.2.24: the business crew first, then the fullest crew with room — a crew is filled before the next.
    const hireRoles = assignCrewRoles(w, crewsOf());
    const room = crewsOf().filter((team) => team.memberIds.length < MAX_TEAM_SIZE - 1)
      .sort((a, b) => Number(hireRoles.get(b.id) === 'business') - Number(hireRoles.get(a.id) === 'business') || b.memberIds.length - a.memberIds.length || a.id - b.id)[0];
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
  const menNow = crewMen();
  const shrinking = rebuild || menNow < 12 || (lastMen != null && menNow < lastMen);
  menLastWeek.set(w, menNow);
  const menBlocksHistory = [...(menBlocks.get(w) ?? []), { men: menNow, blocks: territoryCount(w, gang.id) }].slice(-4);
  menBlocks.set(w, menBlocksHistory);
  // Over the last three Mondays the gang grew by two or more men and held no more blocks.
  const hiringStalled = menBlocksHistory.length >= 4 && menBlocksHistory[3].men - menBlocksHistory[0].men >= 2 && menBlocksHistory[3].blocks <= menBlocksHistory[0].blocks;

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
    // 1.2.21: fill a crew to a useful size before another lieutenant is made.
    // Room for one more crew only when every crew, the new one too, can have a lieutenant and USEFUL_CREW hoods.
    const allUseful = () => crewsOf().every((team) => team.memberIds.length >= USEFUL_CREW) && hoods() >= (gang.teamIds.length + 1) * (USEFUL_CREW + 1);
    // 1.2.24 (Robert's rules): one crew per kind of work — extortion, recruiting,
    // collecting and business open at a useful size; any further crew only once
    // every crew is full, with men waiting in the pool to fill it.
    const allFull = () => crewsOf().every((team) => team.memberIds.length >= MAX_TEAM_SIZE - 1);
    const poolWaiting = () => gang.poolIds.filter((id) => !restingMen.has(id)).length;
    const mayOpen = () => gang.teamIds.length === 0
      || (gang.teamIds.length < KIND_CREWS && gang.teamIds.length < wanted() && allUseful())
      || (gang.teamIds.length < MAX_TEAMS && allFull() && poolWaiting() >= 1);
    for (let tries = 0; tries < 3 && mayOpen(); tries++) {
      const poolFree = gang.poolIds.filter((id) => !restingMen.has(id));
      const fromPool = poolFree.length ? rng.pick(poolFree) : undefined;
      const biggest = gang.teamIds.length < KIND_CREWS ? crewsOf().filter((team) => team.memberIds.length >= 4).sort((a, b) => b.memberIds.length - a.memberIds.length)[0] : undefined;
      const id = fromPool ?? biggest?.memberIds[biggest.memberIds.length - 1];
      if (id == null) break;
      const result = promote(w, gang.id, id);
      logResult(actions, `promote ${w.people[id]?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
      if (!result.ok) break;
    }
    // 1.2.21: pool hoods go where their stars count. The crews short of a useful
    // size are filled first; among the open crews a man goes to the one whose
    // job he raises most (his stars for that job against the crew's average).
    const provisional = assignCrewRoles(w, crewsOf());
    const roleOf = (team: Team) => provisional.get(team.id) ?? 'collect';
    const bestStars = (p: Person) => Math.max(...crewsOf().map((team) => roleStars(p, roleOf(team))), 0);
    const placeable = gang.poolIds.filter((id) => !restingMen.has(id)).map((id) => w.people[id]).filter((p): p is Person => !!p && p.role === 'hood' && p.status === 'active')
      .sort((a, b) => bestStars(b) - bestStars(a) || a.id - b.id);
    for (const p of placeable) {
      const open = crewsOf().filter((team) => team.memberIds.length < MAX_TEAM_SIZE - 1);
      // 1.2.24: a crew without a man is helped first; then a hood with 3★ or more
      // for a job fills that crew (the business crew first), else the fullest open crew.
      const empty = open.filter((team) => team.memberIds.length === 0);
      const talented = open.filter((team) => roleStars(p, roleOf(team)) >= 3);
      const pick = empty.length ? empty : talented.length ? talented : open;
      const crew = pick.sort((a, b) => Number(roleOf(b) === 'business') - Number(roleOf(a) === 'business') || b.memberIds.length - a.memberIds.length || roleStars(p, roleOf(b)) - roleStars(p, roleOf(a)) || a.id - b.id)[0];
      if (!crew) break;
      const result = moveToTeam(w, gang.id, p.id, crew.id);
      logResult(actions, `to crew ${p.name} (${roleStars(p, roleOf(crew)).toFixed(1)}★ for ${roleOf(crew)})`, result.ok, result.ok ? result.message ?? '' : result.error);
    }
    // Every crew full: a better man in the pool takes the place of the weakest
    // free hand for that crew's job (up to three swaps a week).
    let swaps = 0;
    for (const p of [...placeable].filter((x) => gang.poolIds.includes(x.id))) {
      if (swaps >= 3 || crewsOf().some((team) => team.memberIds.length < MAX_TEAM_SIZE - 1)) break;
      let best: { team: Team; weak: Person; gain: number } | undefined;
      for (const team of crewsOf()) {
        const weak = team.memberIds.map((m) => w.people[m]).filter((x): x is Person => !!x && x.status === 'active' && x.orderId == null && !talentPlaced.has(x.id))
          .sort((a, b) => roleStars(a, roleOf(team)) - roleStars(b, roleOf(team)))[0];
        const gain = weak ? roleStars(p, roleOf(team)) - roleStars(weak, roleOf(team)) : 0;
        if (weak && gain >= 1 && (!best || gain > best.gain)) best = { team, weak, gain };
      }
      if (!best) continue;
      const out = moveToPool(w, gang.id, best.weak.id);
      const result = out.ok ? moveToTeam(w, gang.id, p.id, best.team.id) : out;
      logResult(actions, `swap ${p.name} into ${best.team.name} for ${best.weak.name} (+${best.gain.toFixed(1)}★ ${roleOf(best.team)})`, result.ok, result.ok ? '' : result.error);
      if (result.ok) swaps++;
    }
    // The pool keeps a few replacements; the weakest idle men beyond them are sacked.
    if (!crewsOf().some((team) => team.memberIds.length < MAX_TEAM_SIZE - 1)) {
      const spare = idlePool().map((id) => w.people[id]).sort((a, b) => bestStars(a) - bestStars(b) || a.id - b.id);
      for (const p of spare.slice(0, Math.max(0, spare.length - POOL_RESERVE))) {
        const result = sackPerson(w, gang.id, p.id);
        logResult(actions, `sack ${p.name} — idle in the pool, the crews are full (${bestStars(p).toFixed(1)}★ best)`, result.ok, result.ok ? result.message ?? '' : result.error);
      }
    }
    // A new crew gets two men from the biggest one, so no lieutenant walks alone
    // (1.2.24: no more evening out — crews are filled, not balanced).
    for (let moves = 0; moves < 4; moves++) {
      const sorted = crewsOf().sort((a, b) => a.memberIds.length - b.memberIds.length);
      const small = sorted[0];
      const big = sorted[sorted.length - 1];
      if (!small || !big || big === small || small.memberIds.length >= 2 || big.memberIds.length < 4) break;
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
    const result = tryMove(move.personId, move.toTeamId, `talent: ${w.people[move.personId]?.name ?? move.personId} to the ${roles.get(move.toTeamId)} crew`);
    if (result.ok) talentPlaced.add(move.personId);
  }
  // 1.2.22, the business crew (Robert's method): hoods with more than three
  // business stars join it (two a week), it gets a car, and it does the buying.
  const bizCrew = crewsOf().find((team) => roles.get(team.id) === 'business');
  if (bizCrew) {
    // 1.2.23: each buy or set-up leaves a hood behind as manager, so the crew
    // refills every week — from the pool first, then from the other crews,
    // hoods above three business stars only. With none, it works short-handed.
    let moved = 0;
    const fromPool = idlePool().map((id) => w.people[id]).filter((p): p is Person => !!p && p.orderId == null && p.skills.business > 3);
    const talents = [...fromPool.sort((a, b) => b.skills.business - a.skills.business), ...crewsOf().filter((t) => t.id !== bizCrew.id && t.memberIds.length > 2)
      .flatMap((t) => t.memberIds.map((id) => w.people[id])).filter((p): p is Person => !!p && p.status === 'active' && p.orderId == null && p.skills.business > 3)
      .sort((a, b) => b.skills.business - a.skills.business)];
    const want = MAX_TEAM_SIZE - 1 - bizCrew.memberIds.length;
    for (const p of talents) {
      if (moved >= 4 || bizCrew.memberIds.length >= MAX_TEAM_SIZE - 1) break;
      const result = tryMove(p.id, bizCrew.id, `business crew: ${p.name} (${p.skills.business.toFixed(1)}★ business) joins`);
      if (result.ok) { moved++; talentPlaced.add(p.id); }
    }
    if (!Object.values(bizCrew.vehicles).some((n) => n > 0) && gang.cash > VEHICLES.coupe.cost * 3) {
      const result = buyVehicle(w, gang.id, 'coupe', bizCrew.id);
      logResult(actions, `business crew: a car for ${w.people[bizCrew.lieutenantId]?.name ?? 'the crew'}`, result.ok, result.ok ? '' : result.error);
    }
    if (want > moved && bizCrew.memberIds.length < 3) actions.push(`NOTE business crew short: ${bizCrew.memberIds.length + 1} men and no free hood above 3★ business to join — it works with who is left`);
    const men = [bizCrew.lieutenantId, ...bizCrew.memberIds].map((id) => w.people[id]).filter((p): p is Person => !!p);
    const line = `NOTE business crew ${bizCrew.name}: ${men.length} men, business ${(men.reduce((s2, p) => s2 + p.skills.business, 0) / Math.max(1, men.length)).toFixed(1)}★ avg (${men.filter((p) => p.skills.business > 3).length} above 3★), ${Object.values(bizCrew.vehicles).some((n) => n > 0) ? 'with a car' : 'on foot'}`;
    actions.push(line); noteDevDesk(line);
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
  // 1.2.24: crew sizes every week (hoods of the most a crew can hold, lieutenant apart).
  actions.push(`CREWS ${crewsOf().map((t) => `${t.name} ${t.memberIds.length}/${MAX_TEAM_SIZE - 1}`).join(', ') || 'none'}; pool ${gang.poolIds.length}`);
  const GUNS: WeaponId[] = ['pistol', 'shotgun', 'rifle', 'tommy', 'twinPistols'];
  const roleCrew = (role: CrewRole) => crewsOf().find((team) => roles.get(team.id) === role);
  const extortionCrew = roleCrew('extortion');
  if (extortionCrew && roles.size > 1) {
    const handed: string[] = [];
    for (const gun of GUNS) while ((extortionCrew.weapons[gun] ?? 0) > 0 && transferWeapon(w, gang.id, gun, extortionCrew.id, false).ok) handed.push(gun);
    if (handed.length) actions.push(`NOTE extortion crew hands in ${handed.join(', ')} so nobody is shot by accident`);
  }
  // 1.2.21: protection collectors work unarmed by default; their guns go to the muscle.
  for (const team of crewsOf().filter((t) => roles.get(t.id) === 'collect' && roleCrew('muscle'))) {
    const handed: string[] = [];
    for (const gun of GUNS) while ((team.weapons[gun] ?? 0) > 0 && transferWeapon(w, gang.id, gun, team.id, false).ok) handed.push(gun);
    if (handed.length) actions.push(`NOTE collecting crew ${w.people[team.lieutenantId]?.name ?? team.id} hands in ${handed.join(', ')} — collectors go unarmed`);
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
  // 1.2.24: extortion stops at SUSPICION_EASE and resumes only below SUSPICION_LIE_LOW.
  const wasCooling = coolingOff.get(w) ?? false;
  const cooling = gang.suspicion >= SUSPICION_EASE || (wasCooling && gang.suspicion >= SUSPICION_LIE_LOW);
  coolingOff.set(w, cooling);
  if (wasCooling && !cooling) actions.push(`NOTE suspicion ${Math.round(gang.suspicion)} below ${SUSPICION_LIE_LOW} — extortion resumes`);
  // 1.2.24: why suspicion moved. Risky money (rackets and protection) beyond the
  // cover the legal books give raises it; it cools 1.6 a week only in a week
  // with nothing uncovered (the FBI cannot be bribed).
  const lastLegal = Math.max(0, gang.lastWeekIncome.legal);
  const accountantMan = gang.accountantId == null ? undefined : w.people[gang.accountantId];
  const accountantInt = accountantMan && accountantMan.status === 'active' ? accountantMan.skills.intelligence : null;
  const coverEstimate = accountantInt != null ? lastLegal * (0.5 + accountantInt * 0.22) + accountantInt * 400 : lastLegal * 0.2;
  const riskyLast = Math.max(0, gang.lastWeekIncome.illegal) + Math.max(0, gang.lastWeekIncome.protection);
  if (!w.cityLayout?.original) actions.push(`SUSPICION ${Math.round(gang.suspicion)}${suspicionBefore != null ? ` (was ${Math.round(suspicionBefore)})` : ''}: risky $${Math.round(riskyLast)} (rackets $${Math.round(Math.max(0, gang.lastWeekIncome.illegal))}, protection $${Math.round(Math.max(0, gang.lastWeekIncome.protection))}), cover $${Math.round(coverEstimate)} (legal $${Math.round(lastLegal)}, ${accountantInt != null ? 'accountant' : 'no accountant'}), uncovered $${Math.round(gang.riskyMoney ?? 0)}, untaxed $${Math.round(gang.uncoveredTax ?? 0)}${cooling ? ' — cooling off' : ''}`);
  // The 40 × 32 city weighs suspicion differently: the FBI's total loses a tenth
  // a week and rises by 2 × (office takings / premises takings − the accountant's
  // limit). Collecting is not cut there — more legal premises and a clever
  // accountant bring the ratio down.
  const originalCity = !!w.cityLayout?.original;
  const office = Math.max(0, gang.lastWeekIncome.protection + gang.lastWeekIncome.other);
  const premisesTakings = Math.max(0, gang.lastWeekIncome.legal + gang.lastWeekIncome.illegal);
  const opponentsWeight = w.options.opponents === 'passive' ? 16 : w.options.opponents === 'aggressive' ? 8 : 10;
  const premisesBase = Math.max(100, Math.trunc(premisesTakings * opponentsWeight / 10));
  const accountantByte = accountantInt != null ? Math.trunc(Math.round(Math.max(0, Math.min(5, accountantInt)) / 5 * 255) * 2 / 3) : 0;
  const ratioLimit = 0.12 * (accountantByte || 1) + 9.88;
  const officeRatio = office / premisesBase;
  /** True when the office/premises ratio nears the limit: legal premises and the accountant come first. */
  const legalPush = originalCity && officeRatio >= ratioLimit * 0.8;
  if (originalCity) actions.push(`SUSPICION ${Math.round(gang.suspicion)}${suspicionBefore != null ? ` (was ${Math.round(suspicionBefore)})` : ''} ratio: office takings $${Math.round(office)} / premises base $${premisesBase} = ${officeRatio.toFixed(1)} vs limit ${ratioLimit.toFixed(1)} (${accountantInt != null ? `accountant ${accountantInt.toFixed(1)}★` : 'no accountant'}) — rise about ${Math.max(0, Math.trunc((Math.trunc(officeRatio) - ratioLimit) * 2))} a week${legalPush ? '; legal premises and the accountant first' : ''}`);
  // Elsewhere, while suspicion is 50 or more, protection is collected only up to the cover left after the rackets.
  const collectBudget = !originalCity && gang.suspicion >= SUSPICION_LIE_LOW ? Math.max(0, coverEstimate - Math.max(0, gang.lastWeekIncome.illegal)) : Infinity;
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
  const give = (label: string, team: (typeof ready)[number] | undefined, input: Omit<IssueOrderInput, 'teamId'>, kind?: OrderKind): ApiResult => {
    if (!team) {
      actions.push(`NOTE ${label} skipped — every crew's week is full`);
      timeShort = true;
      return { ok: false, error: 'Every crew is busy this week.' };
    }
    const name = w.people[team.lieutenantId]?.name ?? 'crew';
    const risky = RISKY_ORDERS.has(input.type);
    // 1.2.24: while suspicion is high an unarmed crew with no criminal work
    // stays off the street: no scouting or guarding walks (hot men already rest).
    if (!risky && gang.suspicion >= SUSPICION_LIE_LOW && !crewArmed(team) && OFF_STREET_ORDERS.has(input.type)) {
      actions.push(`NOTE ${label} not given — ${name}'s crew is unarmed and stays off the street (suspicion ${Math.round(gang.suspicion)})`);
      return { ok: false, error: 'Off the street this week.' };
    }
    // 1.2.23: lying low stops the violence; extortion stops only past SUSPICION_EASE.
    if (risky && ((lieLow && input.type !== 'extort') || cooling)) {
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
    // Business work is sized by the game alone (1.2.23): no ledger gate of ours.
    const fits = kind === 'business' ? targets : targetsThatFit(timeLedger, key, targets, MINUTES_PER_WEEK - team.timeUsed);
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
    // A buy too long for the week leaves room for a shorter one: the business crew is not marked out of time.
    if (!result.ok && /time/i.test(result.error)) { if (kind !== 'business') outOfTime.add(team.id); timeShort = true; }
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
  // Blocks we claim now (one standing business owned or protected, as the game counts them).
  const territoryBlocksNow = claimedTerritoryBlocks(w, gang.id);
  const claimOf = (blockId: number) => w.blocks[blockId]?.layout?.mergedInto ?? blockId;
  const blockIsOurs = (blockId: number) => territoryBlocksNow.has(claimOf(blockId));
  // ---- 1.2.23: the weekly decision loop. Every order below is put forward as
  // a candidate (what it is worth, of what kind, for which crew job); at the
  // end decideWeek scores them by the goal and gives each crew the best that fit.
  const proposals: Proposal<Team>[] = [];
  const propose = (p: Proposal<Team>) => { proposals.push(p); };
  /** Buildings put forward for a buy or a set-up this week (one order each). */
  const offered = new Set<number>();
  /** 1.2.23: with this much cash idle, a street crew with nothing better may take a buy the business crew has no week left for. */
  const richEnough = gang.cash - Math.min(RESERVE_CAP, wageBill * 3) > SPILL_CASH;
  /**
   * 1.2.23 (Robert's method): the business crew's three jobs — buy a business,
   * buy empty land, set up a business on our land. No minutes gate of our own
   * (1.2.22's learned slowness factor turned away ~70 buys a run): the game
   * accepts what fits the crew's week, and the loop gives as many as fit.
   * A target that failed twice stays dropped; a crew never retries its own failure.
   */
  const planBuy = (label: string, candidates: Building[], make: (site: Building) => Omit<IssueOrderInput, 'teamId'> = (site) => ({ type: 'buyPremises', buildingIds: [site.id] }),
    worth: (site: Building) => number = (site) => (BUILDING_BY_ID[site.typeId]?.profit ?? 0) * 4, cost: (site: Building) => number = (site) => BUILDING_BY_ID[site.typeId]?.cost ?? 0, budget = Infinity): Building[] => {
    const ordered = new Set(desk.pending.filter((p) => p.week === w.week).map((p) => p.buildingId));
    const chosen: Building[] = [];
    let spent = 0;
    for (const site of candidates) {
      if (desk.dropped.has(site.id) || ordered.has(site.id) || offered.has(site.id)) continue;
      if (spent + cost(site) > budget) continue;
      const base = make(site);
      const input = { ...base, opts: { manpower: 1, priority: true, ...base.opts } };
      offered.add(site.id); chosen.push(site); spent += cost(site);
      propose({
        label: `${label} ${site.typeId} (building ${site.id}, $${cost(site).toLocaleString('en-US')})`, kind: 'business', role: 'business', input, anyCrew: richEnough,
        value: Math.max(50, worth(site)), why: blockIsOurs(site.blockId) ? 'block already ours' : 'a new block',
        onGiven: (team) => {
          const orderId = team.orderIds[team.orderIds.length - 1];
          const order = w.orders[orderId];
          desk.pending.push({ orderId, buildingId: site.id, teamId: team.id, type: input.type, estimate: order?.estimatedMinutes ?? 0, free: Math.round(MINUTES_PER_WEEK - team.timeUsed), week: w.week });
          const line = `NOTE business: ${label} ${site.typeId} (building ${site.id}) to ${team.name} — about ${order?.estimatedMinutes ?? '?'} min by the game's estimate, ${Math.round(MINUTES_PER_WEEK - team.timeUsed)} min left after it`;
          actions.push(line); noteDevDesk(line);
        },
      });
      if (chosen.length >= 12) break;
    }
    return chosen;
  };

  // A crew refused for lack of time last week gets a car, or a hood moved across, before it is asked again.
  for (const id of shortCrews.get(w) ?? []) {
    const team = ready.find((t) => t.id === id);
    if (!team) continue;
    const full = team.memberIds.length >= MAX_TEAM_SIZE - 1;
    const carless = !Object.values(team.vehicles).some((n) => n > 0);
    if (carless && gang.cash > VEHICLES.coupe.cost * 3) {
      const result = buyVehicle(w, gang.id, 'coupe', team.id);
      logResult(actions, `buy car for ${w.people[team.lieutenantId]?.name ?? 'crew'} (out of time last week)`, result.ok, result.ok ? '' : result.error);
      if (result.ok) continue;
    }
    // 1.2.22: a full crew takes nobody, and a move refused once is not asked again.
    if (full) { actions.push(`NOTE ${w.people[team.lieutenantId]?.name ?? 'crew'} out of time last week but the crew is full — no man moved`); continue; }
    if (moveRefused(desk, -1, team.id)) { actions.push(`NOTE ${w.people[team.lieutenantId]?.name ?? 'crew'} refused a man recently — not asked again this week`); continue; }
    const donor = ready.filter((t) => t.id !== team.id && t.memberIds.length >= 3 && !(shortCrews.get(w)?.has(t.id))).sort((a, b) => b.memberIds.length - a.memberIds.length)[0];
    const hood = donor?.memberIds.map((m) => w.people[m]).filter((p) => p && p.status === 'active' && p.orderId == null && !moveRefused(desk, p.id, team.id))[0];
    if (donor && hood) tryMove(hood.id, team.id, `move ${hood.name} to ${w.people[team.lieutenantId]?.name ?? 'crew'} (out of time last week)`);
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
    // Nobody free to fetch one, or a trial already running: the boss hires a
    // lawyer himself at once (as the computer bosses do), so the court can still
    // be bought. A lawyer the crews already found comes first.
    const trialNow = Object.values(w.cases ?? {}).some((c) => c.gangId === gang.id && ['awaiting', 'onTrial'].includes(c.status));
    const bossHires = (why: string) => {
      const free = (p: (typeof w.people)[number] | undefined) => !!p && p.role === 'lawyer' && p.gangId == null && p.status === 'active';
      const found = gang.recruitIds.map((id) => w.people[id]).find(free)
        ?? peopleList(w).filter((p) => free(p)).sort((a, b) => b.skills.intelligence - a.skills.intelligence || a.id - b.id)[0];
      if (found) {
        const result = hireRecruit(w, gang.id, found.id, 'pool');
        logResult(actions, `the boss hires lawyer ${found.name} himself (${why})`, result.ok, result.ok ? result.message ?? '' : result.error);
      } else actions.push('NOTE no lawyer for hire anywhere in the city this week');
    };
    // 1.2.23: hoods come before the lawyer unless the law is already close.
    const urgent = trialNow || gang.suspicion >= 40 || gang.lawyerId != null;
    if (trialNow && gang.lawyerId != null) bossHires('a trial is running');
    else if (desk) propose({ label: 'recruit lawyer', kind: 'safety', value: urgent ? 2500 : 250, why: urgent ? 'the law is close' : 'hoods first while the heat is low',
      input: { type: 'recruit', buildingIds: [desk.id], opts: { manpower: 1, recruitAs: 'lawyer' } }, onSkipped: () => bossHires('no crew free to fetch one') });
    else bossHires('no lawyer\'s office to visit');
  }

  const hq = buildingList(w).find((b) => b.isHQ && b.ownerGangId === gang.id);
  if (w.week >= 2 && gangManpower(w, gang) >= 8 && hq) {
    propose({ label: 'guard office', kind: 'safety', value: 150, why: 'a man at the office door', input: { type: 'guardBusiness', buildingIds: [hq.id], opts: { manpower: 1 } } });
  }

  // One-off hires come before the expansion fills the crews' week.
  // Each week tries the next office, so one empty desk does not hold up the hire.
  const deskFor = (role: 'accountant' | 'lawyer') => {
    const desks = buildingList(w).filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === role && b.state !== 'destroyed').sort(nearer);
    return desks.length ? desks[w.week % desks.length] : undefined;
  };
  if (w.week >= 3 && gang.accountantId == null) {
    const desk = deskFor('accountant');
    // 1.2.23: after the hoods, unless suspicion is high (his books lower it).
    if (desk) propose({ label: 'recruit accountant', kind: 'safety', value: gang.suspicion >= SUSPICION_LIE_LOW || legalPush ? 6000 : gang.suspicion >= SUSPICION_BRIBE ? 1500 : 200, why: gang.suspicion >= SUSPICION_BRIBE ? `suspicion ${Math.round(gang.suspicion)}` : 'hoods first',
      input: { type: 'recruit', buildingIds: [desk.id], opts: { manpower: 1, recruitAs: 'accountant' } } });
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
    propose({
      label: `${ACTION_LABELS[key]} ${target.name}`, kind: 'safety', value: 3000, why: `${defendant?.name ?? 'a man'} on trial`, role: key === 'scareWitness' ? 'muscle' : 'business',
      input: (team) => key === 'scareWitness'
        ? { type: 'assault', personId: target.id, opts: { manpower: manpowerFor(team, 2) } }
        : { type: 'bribe', personId: target.id, opts: { manpower: manpowerFor(team, 2), amount: Math.round(400 + target.skills.intelligence * 300) } },
      onGiven: (team) => { pendingActions.push({ ...pendingBase, orderId: team.orderIds[team.orderIds.length - 1], targetPersonId: target.id }); },
    });
  }
  // 1.2.21: the police chief is paid only when his hostility rises (or the
  // police are already hostile), and bribes are sized to the illegal takings.
  const chiefNow = w.people[w.policeChiefId];
  const chiefOpinion = chiefNow ? (chiefNow.opinion[gang.id] ?? 0) : 0;
  const chiefBefore = chiefOpinionLastWeek.get(w);
  chiefOpinionLastWeek.set(w, chiefOpinion);
  const chiefCooling = policeHostile || (chiefBefore != null && chiefOpinion < chiefBefore - 2);
  const dirtyTakings = income.illegal + income.protection;
  const bribeSum = (base: number) => Math.round(Math.max(base, Math.min(5000, dirtyTakings * 0.15)));
  /** A bribe run: a crew with a car if one has time, and a second man as escort. */
  const bribeCrew = () => ready.find((t) => !outOfTime.has(t.id) && Object.values(t.vehicles).some((n) => n > 0) && freeShare(t) >= 0.2) ?? freest();
  let chiefPaid = false;
  // 1.2.23: hostile police are paid off whatever the suspicion (seen: 22 arrests in a week at low suspicion).
  if ((hot || policeHostile) && lawyer && chiefCooling) {
    // 1.2.23: hostile police arrest our men on sight — worth more of the cash.
    const chief = buyable(w.policeChiefId, policeHostile ? 0.6 : 0.3);
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
  if ((hot || policeHostile) && !chiefPaid && chiefCooling) {
    const chief = w.people[w.policeChiefId];
    if (chief && chief.status === 'active' && chief.bribedBy !== gang.id && gang.cash > 1500) {
      const crew = bribeCrew();
      propose({ label: 'bribe chief', kind: 'safety', value: (policeHostile ? 5000 : 1200) + gang.suspicion * 10, why: `the chief is cooling (opinion ${Math.round(chiefOpinion)})${policeHostile ? ', the police are hostile' : ''}`, teams: crew ? [crew, ...ready.filter((t) => t !== crew)] : undefined,
        input: (team) => ({ type: 'bribe', personId: chief.id, opts: { manpower: manpowerFor(team, 2), amount: bribeSum(400) } }) });
    }
  } else if (hot && !chiefPaid) actions.push(`NOTE police chief not paid — his opinion of us is steady (${Math.round(chiefOpinion)})`);
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
      // One site to an order (a purchase takes a single site), through the business desk.
      planBuy('go straight: buy', chosen, undefined, (b) => 3000 + value(b) / 10);
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
      // 1.2.24: crews and pool only — managers never hold hiring back.
      const men = crewMen();
      const crewRoom = crewsOf().some((team) => team.memberIds.length < MAX_TEAM_SIZE - 1);
      const floor = goal === 'territory' ? CREW_CAPACITY : Math.max(18, Math.round(10 + weight.hiring * 12), Math.min(60, Math.round(territoryCount(w, gang.id) * 2)));
      const newMen = shrinking ? 4 : 2;
      // 1.2.21: wages never exceed income. New men are hired only when last
      // week's takings carry the wage bill with them, and not while the last
      // men hired brought in no new blocks.
      // Last week's takings, or (in the first weeks) what the rackets on the books pay.
      const booked = protectedBuildings(w, gang.id).reduce((sum, b) => sum + (b.protection?.weekly ?? 0), 0);
      const takings = Math.max(income.legal + income.illegal + income.protection + income.other, w.week <= 2 ? booked : 0);
      // 1.2.22, territory game: blocks are the win, so beyond the three weeks'
      // payroll the cash is there to hire with — new men are taken on while
      // the money above the reserve carries their wages for ten weeks.
      const territoryHire = goal === 'territory' && gang.cash - wageBill * 3 >= averageWage * newMen * 10;
      // 1.2.23: cash in hand counts too — a young gang with money in the safe
      // hires while two weeks' wages stay covered and the rest carries the new
      // men for eight weeks (seen: 6 men for weeks 2-7 with ~$5.5k cash).
      const cashCarries = gang.cash - wageBill * 2 >= averageWage * newMen * 8;
      const affordable = takings >= wageBill + averageWage * newMen || territoryHire || cashCarries;
      const pays = affordable && (men < floor || crewRoom || shortLastWeek || weeklyNet >= averageWage * newMen || gang.cash >= (wageBill + averageWage * newMen) * 52);
      const idle = idlePool().length;
      const full = crewMen() >= CREW_CAPACITY;
      if (full && idle >= POOL_RESERVE) {
        actions.push(`NOTE recruit held — the crews are full (${crewMen()} of ${CREW_CAPACITY} men) and ${idle} wait in the pool`);
      } else if (!full && idle > 0 && crewRoom) {
        actions.push(`NOTE recruit held — ${idle} idle in the pool to place first`);
      } else if (pays && hiringStalled) {
        actions.push(`NOTE recruit held — the last men hired added no blocks (${menBlocksHistory.map((h) => `${h.men} men/${h.blocks} blocks`).join(' → ')})`);
      } else if (!affordable && hoodSites.length) {
        actions.push(`NOTE recruit held — wages $${Math.round(wageBill)} + about $${Math.round(averageWage * newMen)} for ${newMen} more would exceed last week's takings $${Math.round(takings)} and cash $${Math.round(gang.cash)} does not carry them`);
      } else if (lieLow && !shrinking && men >= floor && !crewRoom) {
        actions.push('NOTE recruit held — lying low');
      } else if (pays && hoodSites.length) {
        // Several venues, one man each: a two-man order waits for a second free hand.
        // 1.2.21: the venues no longer wait for a crew each — with fewer crews
        // than venues one crew walks several (a hiring place is often empty by
        // the time a man gets there, so one stop a week starved a small gang).
        // At capacity only a replacement or two is sought, for the swaps.
        const venues = Math.min(hoodSites.length, full ? 1 : shrinking || men < floor ? 4 : 2);
        if (recruitMemory.hintIds.includes(hoodSites[0].id)) actions.push('NOTE recruit following last week\'s tip');
        // One proposal per crew's share of the venues; the loop spreads them.
        const parts = Math.max(1, Math.min(venues, ready.length));
        for (let k = 0; k < parts; k++) {
          const stops = hoodSites.slice(0, venues).filter((_, i) => i % parts === k).map((b) => b.id);
          if (!stops.length) continue;
          propose({ label: `recruit (${stops.length} stop${stops.length > 1 ? 's' : ''})`, kind: 'men', role: 'recruit', input: { type: 'recruit', buildingIds: stops, opts: { manpower: 1 } },
            value: (men < floor || shrinking || crewRoom ? 4000 : 1000) * stops.length, why: `${men} men${men < floor ? ` (below ${floor})` : ''}${crewRoom ? ', a crew has room' : ''}${cashCarries && !(takings >= wageBill + averageWage * newMen) ? ', cash carries the wages' : ''}` });
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
        if (sore) propose({ label: `campaign: ease protection at ${sore.typeId}`, kind: 'safety', value: 600, role: 'collect', why: 'a sore shopkeeper votes against us',
          input: { type: 'adjustProtection', buildingIds: [sore.id], opts: { manpower: 1, protectionLevel: 0.75 } } });
      }
      if (w.week >= 2 && weight.rackets >= 0.2 && owed.length) {
        // 1.2.21 routing: each crew's week is filled by value per minute. A crew
        // starts from the best-paying stop left (takings over stop and travel
        // minutes), takes the stops nearest it that fit its free week, and walks
        // them nearest-next with crossings removed.
        const share = Math.max(3, Math.ceil(owed.length / ready.length));
        const stopMinutes = Math.max(10, timeLedger[ledgerKey('collectProtection', false)] ?? 30);
        const centre = (b: Building) => w.lots[b.lotId].center;
        const perMinute = (b: Building) => (b.protection?.weekly ?? 0) / (stopMinutes + dist(centre(b), origin) / WALK_SPEED);
        let left = [...owed].sort((a, b) => perMinute(b) - perMinute(a));
        if (Number.isFinite(collectBudget)) {
          // The best-paying shops first, up to what the books can explain.
          let room = collectBudget;
          const kept = [...owed].sort((a, b) => (b.protection?.weekly ?? 0) - (a.protection?.weekly ?? 0)).filter((b) => {
            const pay = b.protection?.weekly ?? 0;
            if (pay > room) return false;
            room -= pay; return true;
          });
          const keptIds = new Set(kept.map((b) => b.id));
          left = left.filter((b) => keptIds.has(b.id));
          actions.push(`NOTE suspicion ${Math.round(gang.suspicion)}: collecting ${kept.length} of ${owed.length} shops ($${Math.round(collectBudget - room)} of $${Math.round(owed.reduce((sum, b) => sum + (b.protection?.weekly ?? 0), 0))}) — no more than the legal books cover ($${Math.round(collectBudget)})`);
        }
        const collected = new Set<number>();
        while (left.length) {
          const team = freest(collected, 'collect');
          if (!team) break;
          collected.add(team.id);
          const hasCar = Object.values(team.vehicles).some((n) => n > 0);
          const fit = Math.max(1, Math.min(share * 2, targetsThatFit(timeLedger, ledgerKey('collectProtection', hasCar), left.length, MINUTES_PER_WEEK - team.timeUsed) || 1));
          const seed = left.shift()!;
          left.sort((a, b) => dist(centre(a), centre(seed)) - dist(centre(b), centre(seed)));
          const group = [seed, ...left.splice(0, fit - 1)];
          left.sort((a, b) => perMinute(b) - perMinute(a));
          const route = planRoute(origin, group.map((b) => ({ item: b, ...centre(b) }))).map((s) => s.item);
          const takings = route.reduce((sum, b) => sum + (b.protection?.weekly ?? 0), 0);
          propose({ label: `collect (${route.length} stops, $${Math.round(takings)})`, kind: 'money', value: Math.max(100, takings), role: 'collect', why: 'protection owed',
            teams: [team, ...ready.filter((t) => t !== team && !collected.has(t.id))], input: { type: 'collectProtection', buildingIds: route.map((b) => b.id), opts: { manpower: 1 } } });
        }
      }
      // Expand. 1.2.23: past SUSPICION_EASE no new rackets at all (protection
      // money is what the Bureau cannot explain); lying low below it, one crew
      // half the crews take new blocks only.
      const suspicionHigh = cooling;
      if (suspicionHigh && weight.rackets >= 0.25) actions.push(`NOTE suspicion ${Math.round(gang.suspicion)} — no extortion until it is below ${SUSPICION_LIE_LOW}; legal buys and the accountant instead`);
      if (weight.rackets >= 0.25 && !suspicionHigh) {
        const crewsToSend = easing ? Math.max(1, Math.floor(ready.length / 2)) : Math.max(1, Math.round(ready.length * Math.min(1, expansion)));
        const cap = Math.max(2, Math.round(weight.rackets * 5 * expansion));
        const valid = buildingList(w).filter((b) => isValidAreaTarget(w, gang.id, 'extort', b));
        if (goal === 'territory' || goal === 'office') {
          // 1.2.23 territory by extortion: a block counts once one standing
          // business in it is ours (owned or protected). One target in each
          // block we do not claim yet, nearest first, spread over the crews,
          // before any deepening of blocks already ours.
          const newBlock: Building[] = [];
          const seen = new Set<number>();
          for (const b of [...valid].sort(nearer)) {
            const claim = claimOf(b.blockId);
            if (blockIsOurs(b.blockId) || seen.has(claim)) continue;
            seen.add(claim); newBlock.push(b);
          }
          const deepen = lieLow ? [] : valid.filter((b) => blockIsOurs(b.blockId)).sort(nearer);
          const centre = (b: Building) => w.lots[b.lotId].center;
          let groups = 0;
          const take = (pool: Building[], mark: 'new block' | 'already ours') => {
            while (pool.length && groups < crewsToSend) {
              const seed = pool.shift()!;
              pool.sort((x, y) => dist(centre(x), centre(seed)) - dist(centre(y), centre(seed)));
              const group = [seed, ...pool.splice(0, cap - 1)];
              pool.sort(nearer);
              groups++;
              const marked = group.map((g) => `${g.typeId} ${g.id} (${mark})`).join(', ');
              propose({ label: `extort ${group.length} site(s), ${mark}`, kind: mark === 'new block' ? 'territory' : 'money', role: 'extortion',
                // The first site carries the order; more sites add less (a crew's week is finite).
                value: (mark === 'new block' ? 900 + 250 * (group.length - 1) : 200 + 60 * (group.length - 1)) * (easing ? 0.5 : 1), why: marked,
                input: (team) => ({ type: 'extort', buildingIds: group.map((g) => g.id), opts: { manpower: manpowerFor(team, 2) } }) });
            }
          };
          take(newBlock, 'new block');
          take(deepen, 'already ours');
          if (!groups) actions.push('NOTE extortion: no valid target in a block we do not claim');
        } else {
          const nearby = valid.filter((b) => nearTerritory(w, gang.id, b.blockId, 2)).sort(nearer);
          const targets = nearby.length ? nearby : [...valid].sort(nearer);
          const byBlock = new Map<number, typeof targets>();
          for (const b of targets) {
            const list = byBlock.get(b.blockId) ?? [];
            list.push(b);
            byBlock.set(b.blockId, list);
          }
          // The hottest quarter of the blocks is left alone while suspicion is high.
          const heats = [...byBlock.keys()].map((id) => w.blocks[id]?.crimeHeat ?? 0).sort((a, b) => a - b);
          const hotLine = heats.length ? heats[Math.floor(heats.length * 0.75)] : Infinity;
          let groups = 0;
          for (const [blockId, sites] of byBlock) {
            if (groups >= crewsToSend) break;
            if ((easing || lieLow) && (w.blocks[blockId]?.crimeHeat ?? 0) >= hotLine && hotLine > 0) continue;
            groups++;
            const group = sites.slice(0, cap);
            const mark = blockIsOurs(blockId) ? 'already ours' : 'new block';
            propose({ label: `extort ${group.length} site(s), ${mark}`, kind: mark === 'new block' ? 'territory' : 'money', role: 'extortion',
              value: (mark === 'new block' ? 700 + 200 * (group.length - 1) : 300 + 80 * (group.length - 1)) * (easing ? 0.5 : 1), why: group.map((g) => `${g.typeId} ${g.id}`).join(', '),
              input: (team) => ({ type: 'extort', buildingIds: group.map((g) => g.id), opts: { manpower: manpowerFor(team, 2) } }) });
          }
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
          if (planBuy(`racket ${racket.id} on`, [land], () => ({ type: 'setUpBusiness', buildingIds: [land.id], opts: { manpower: 1, businessTypeId: racket.id, frontBuildingId: front.id, roomsFloors: racket.id === 'rentedRooms' ? 2 : undefined } }),
            () => racket.profit * 4, () => racket.cost).length) budget -= racket.cost;
        }
      }
    }
    if (key === 'bribes' && !hot && chiefCooling && w.week >= 4 && weight.bribes >= 0.25) {
      const chief = w.people[w.policeChiefId];
      const gate = 1500 + (1 - weight.bribes) * 2500;
      if (chief && chief.status === 'active' && chief.bribedBy !== gang.id && gang.cash > gate) {
        const crew = bribeCrew();
        propose({ label: 'bribe', kind: 'safety', value: 500, why: 'the police chief is cooling', teams: crew ? [crew, ...ready.filter((t) => t !== crew)] : undefined,
          input: (team) => ({ type: 'bribe', personId: chief.id, opts: { manpower: manpowerFor(team, 2), amount: bribeSum(Math.round(200 + weight.bribes * 800)) } }) });
      }
    }
    // Legal takings weigh against protection money in the Bureau's sums, so
    // a suspicious gang buys shops whatever the strategy's buying weight.
    // While suspicion is up, legal cover comes before saving for a racket.
    if (easing || legalPush) savingFor.delete(w);
    const saving = savingFor.get(w);
    if (key === 'buying' && saving && gang.cash < saving.cost * 1.5) {
      actions.push(`NOTE saving toward a ${saving.name} ($${saving.cost}) — no other premises this week`);
    } else if (key === 'buying' && w.week >= 4 && (weight.buying >= 0.3 || easing || legalPush)) {
      const coverFirst = easing || legalPush;
      const gate = coverFirst ? 3000 : 8000 + (1 - weight.buying) * 8000;
      const fraction = coverFirst ? 0.75 : 0.15 + weight.buying * 0.5;
      if (gang.cash > gate) {
        const sites = buildingList(w).filter((b) => {
          const cost = BUILDING_BY_ID[b.typeId]?.cost ?? 0;
          return b.ownerGangId == null && b.state === 'trading' && cost > 0 && cost < gang.cash * fraction;
        }).sort(nearer);
        // Legal takings cover the money the Bureau cannot explain: worth more while suspicion is up.
        if (sites.length) planBuy(legalPush ? 'buy (premises takings vs office takings)' : 'buy', sites, undefined, (b) => (BUILDING_BY_ID[b.typeId]?.profit ?? 0) * (coverFirst ? 12 : 4), undefined, gang.cash * fraction);
        else if (coverFirst) actions.push(`NOTE no legal premises for sale under $${Math.round(gang.cash * fraction)}`);
      }
    }
    if (key === 'violence' && w.week >= 8 && policy.violence !== 'low' && (weight.violence >= 0.45 || policy.violence === 'high')) {
      const rival = buildingList(w).filter((b) => b.ownerGangId != null && b.ownerGangId !== gang.id && !b.isHQ && b.state === 'trading').sort(nearer)[0];
      if (rival) {
        propose({ label: `smash ${rival.typeId}`, kind: 'violence', value: 300, role: 'muscle', why: 'the nearest rival business',
          input: (team) => ({ type: 'smashUp', buildingIds: [rival.id], opts: { manpower: manpowerFor(team, 2) } }) });
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
    // 1.2.23: the payroll reserve is capped so money is not parked while men
    // idle — a week and a half's wages when the takings carry them, three when
    // they do not, never above $12,000 (plus any campaign fund).
    const takingsNow = income.legal + income.illegal + income.protection + income.other;
    const reserveWeeks = takingsNow >= wageBill ? 1.5 : 3;
    const keep = Math.min(RESERVE_CAP, Math.max(1500, Math.round(wageBill * reserveWeeks))) + campaignReserve;
    actions.push(`NOTE reserve $${keep.toLocaleString('en-US')} (${reserveWeeks} weeks' payroll, at most $${RESERVE_CAP.toLocaleString('en-US')}${campaignReserve ? ' + campaign' : ''}); $${Math.max(0, Math.round(gang.cash - keep)).toLocaleString('en-US')} to reinvest`);
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
    const buy = (label: string, site: Building | undefined) => {
      if (!site) return false;
      const got = planBuy(`reinvest: buy ${label}`, [site])[0];
      if (got) spareCash -= price(got);
      return !!got;
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
          const ok = planBuy(`reinvest: ${racket.name} behind ${front.typeId} on`, [centre], () => ({ type: 'setUpBusiness', buildingIds: [centre.id], opts: { manpower: 1, businessTypeId: racket.id, frontBuildingId: front.id } }),
            () => racket.profit * 4, () => racket.cost).length > 0;
          if (ok) spareCash -= racket.cost;
          return ok ? 'set' as const : 'failed' as const;
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
      if (team && (team.vehicles.truck ?? 0) > 0) propose({ label: 'export the surplus', kind: 'money', value: 800, why: `${stocked.length} warehouse(s) full`, teams: [team], input: { type: 'export', buildingIds: [stocked[0].id], opts: { manpower: 1 } } });
    }
    // Anything still spare buys the best-paying legal premises within reach.
    // 1.2.22: first the business crew sets up a business on land we own, then
    // it buys — premises and empty lots, best value per dollar, sized to its week.
    const setUpOn = owned().concat(buildingList(w).filter((b) => b.ownerGangId === gang.id && b.state !== 'destroyed' && b.cls === 'empty'))
      .filter((b, i, all) => all.indexOf(b) === i && b.cls === 'empty' && w.lots[b.lotId]?.index !== 4 && !b.discovered && b.fbiClosedWeek == null);
    const bestType = (cash: number) => ESTABLISHABLE_TYPES.filter((t) => t.cost > 0 && t.cost <= cash && t.profit > 0).sort((a, b) => b.profit / b.cost - a.profit / a.cost)[0];
    // 1.2.23: as many set-ups as the cash allows; the loop gives what fits the crew's week.
    for (const site of setUpOn.sort(nearer).slice(0, 8)) {
      const type = bestType(spareCash);
      if (!type || spareCash <= 1000) break;
      if (planBuy(`set up ${type.name.toLowerCase()} on our land:`, [site], () => ({ type: 'setUpBusiness', buildingIds: [site.id], opts: { businessTypeId: type.id } }),
        () => type.profit * 4 + 200, () => type.cost).length) spareCash -= type.cost;
    }
    const territoryGame = goal === 'territory';
    // Wealth: assets count toward the win, so more premises a week.
    if (spareCash > 1000 && !savingFor.has(w)) {
      const landProfit = (b: Building) => bestType(Math.max(0, spareCash - price(b)))?.profit ?? 0;
      const profitOf = (b: Building) => b.cls === 'empty' ? landProfit(b) : (BUILDING_BY_ID[b.typeId]?.profit ?? 0);
      const value = (b: Building) => {
        const cost = price(b) + (b.cls === 'empty' ? (bestType(Math.max(0, spareCash - price(b)))?.cost ?? 0) : 0);
        // Territory: a site in a block we do not hold counts double.
        return (profitOf(b) / Math.max(1, cost)) * (territoryGame && !blockIsOurs(b.blockId) ? 2 : 1);
      };
      const candidates = buildingList(w).filter((b) => b.ownerGangId == null && b.state !== 'destroyed' && price(b) > 0 && price(b) <= spareCash && near(b) &&
        ((['commercial', 'industrial', 'tenement'].includes(b.cls) && b.state === 'trading' && (BUILDING_BY_ID[b.typeId]?.profit ?? 0) > 0) ||
          (b.cls === 'empty' && w.lots[b.lotId]?.index !== 4 && purchasablePremisesType(b))))
        .sort((a, b) => value(b) - value(a) || nearer(a, b));
      const got = planBuy(`reinvest: buy ${territoryGame ? 'toward new blocks' : 'legal'}`, candidates, undefined,
        (b) => profitOf(b) * 4 * (territoryGame && !blockIsOurs(b.blockId) ? 2 : 1) + 100, price, spareCash);
      spareCash -= got.reduce((sum, b) => sum + price(b), 0);
    }
    // 1.2.21: a business the FBI closed still costs its upkeep every week: shut it down.
    for (const b of buildingList(w).filter((x) => x.ownerGangId === gang.id && x.fbiClosedWeek != null && x.state === 'ceased' && !x.isHQ)) {
      const hidden = b.hidesId != null ? w.buildings[b.hidesId] : undefined;
      if (hidden && hidden.ownerGangId === gang.id && hidden.state !== 'trading') {
        const hiddenType = hidden.typeId, r = shutdownBuilding(w, gang.id, hidden.id);
        logResult(actions, `shut down ${hiddenType} behind an FBI-closed front`, r.ok, r.ok ? r.message ?? '' : r.error);
      }
      const typeId = b.typeId;
      const result = shutdownBuilding(w, gang.id, b.id);
      logResult(actions, `shut down ${typeId} closed by the FBI (it still cost upkeep)`, result.ok, result.ok ? result.message ?? '' : result.error);
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
  /** Street crews fit for a strike: the armed crew first, then the freest others (never the business crew). */
  const strikeCrews = (first: Team | undefined) => [...new Set([first, ...[...ready].filter((t) => t !== bizCrew && roles.get(t.id) !== 'business').sort((a, b) => a.timeUsed - b.timeUsed)])]
    .filter((t): t is Team => !!t && ready.includes(t));
  /** Hand the strike crew's heavy weapons to the crew that has the time. */
  /** 1.2.23: the HQ strike — to a crew with the time for it, armed from the strike crew (a bomb set off by a crew out of time was seen in 1.2.22). */
  const proposeHqStrike = (target: Building, value: number, why: string, key: ActionKey) => {
    const owner = w.gangs[target.ownerGangId!];
    const cashBefore = gang.cash;
    let targetPersonId: number | undefined;
    // 1.2.24 (Robert): a strike only with explosives, enough men and a whole free week.
    const spareExplosives = (armed?.weapons.explosives ?? 0) > 0;
    const crewMenOf = (t: Team) => t.memberIds.length + 1;
    const candidates = strikeCrews(armed);
    const fit = candidates.filter((t) => !outOfTime.has(t.id) && t.timeUsed <= 0 && crewMenOf(t) >= STRIKE_MIN_MEN && ((t.weapons.explosives ?? 0) > 0 || spareExplosives));
    if (!fit.length) {
      const why2 = !candidates.length ? 'no street crew ready'
        : !candidates.some((t) => (t.weapons.explosives ?? 0) > 0) && !spareExplosives ? 'no explosives in any strike crew'
        : !candidates.some((t) => crewMenOf(t) >= STRIKE_MIN_MEN) ? `no crew with ${STRIKE_MIN_MEN} men (biggest ${Math.max(...candidates.map(crewMenOf))})`
        : `no crew with ${STRIKE_MIN_MEN} men, explosives and its whole week free`;
      const line = `HQ STRIKE not made on ${owner?.name ?? 'a rival'}'s HQ: ${why2}`;
      actions.push(line); noteDevDesk(line);
      return;
    }
    actions.push(`HQ STRIKE proposed on ${owner?.name ?? 'a rival'}'s HQ (${why}): ${fit.map((t) => `${w.people[t.lieutenantId]?.name ?? 'crew'} ${crewMenOf(t)} men, explosives ${(t.weapons.explosives ?? 0) || (spareExplosives ? 'from the strike crew' : 0)}`).join('; ')}`);
    propose({ label: `HQ strike on ${owner?.name ?? 'a rival'}'s HQ`, kind: 'violence', value, why, minFree: MINUTES_PER_WEEK, teams: fit, prepare: (team) => armFrom(armed, team),
      input: (team) => {
        const strikeMen = manpowerFor(team, 4);
        const inside = peopleList(w).find((p) => p.status === 'active' && p.gangId === target.ownerGangId && p.buildingId === target.id && p.role !== 'boss');
        targetPersonId = undefined;
        if ((team.weapons.explosives ?? 0) > 0) return { type: 'bomb', buildingIds: [target.id], opts: { manpower: strikeMen } };
        if (inside) { targetPersonId = inside.id; return { type: 'kill', personId: inside.id, opts: { manpower: strikeMen } }; }
        return { type: 'smashUp', buildingIds: [target.id], opts: { manpower: strikeMen } };
      },
      onGiven: (team) => {
        const order = w.orders[team.orderIds[team.orderIds.length - 1]];
        noteDevDesk(`NOTE HQ strike on ${owner?.name}'s HQ (building ${target.id}): ${order?.type ?? '?'} by ${w.people[team.lieutenantId]?.name ?? 'crew'} with ${Math.round(MINUTES_PER_WEEK - team.timeUsed)} min of the week left after it, tommy ${team.weapons.tommy ?? 0}, explosives ${team.weapons.explosives ?? 0} — given`);
        desk.lastHqStrike = w.week;
        pendingActions.push({ key, orderId: team.orderIds[team.orderIds.length - 1], targetBuildingId: target.id, targetPersonId, cashBefore });
      },
      onSkipped: () => { const line = `HQ STRIKE not made on ${owner?.name}'s HQ: the fit crews' week was taken by better-scored orders`; actions.push(line); noteDevDesk(line); } });
  };
  const armFrom = (from: Team | undefined, to: Team) => {
    if (!from || from === to) return;
    for (const item of ['tommy', 'explosives'] as WeaponId[]) {
      while ((from.weapons[item] ?? 0) > 0 && (to.weapons[item] ?? 0) < (item === 'tommy' ? 2 : 1)) {
        if (!transferWeapon(w, gang.id, item, from.id, false).ok || !transferWeapon(w, gang.id, item, to.id, true).ok) break;
        actions.push(`NOTE ${item} moved from ${w.people[from.lieutenantId]?.name ?? 'the strike crew'} to ${w.people[to.lieutenantId]?.name ?? 'crew'} (it has the time)`);
      }
    }
  };
  if (armed && suspects.size && policy.violence !== 'low') {
    // A heavily armed strike crew: tommy guns and explosives, bought first.
    for (const item of ['tommy', 'explosives'] as WeaponId[]) {
      if ((armed.weapons[item] ?? 0) >= 1 || gang.cash < reserve * 0.5 + WEAPONS[item].cost) continue;
      const result = buyWeapon(w, gang.id, item, armed.id);
      logResult(actions, `buy ${item} for the strike crew`, result.ok, result.ok ? '' : result.error);
    }
    const [targetId] = [...suspects.keys()];
    const target = w.buildings[targetId];
    // 1.2.23: the strike goes to a crew with the time for it — the strike
    // crew, or another street crew handed its tommy guns and dynamite.
    propose({ label: `strike suspected HQ (building ${targetId})`, kind: 'violence', value: 1500, why: 'our men were killed beside it', minFree: STRIKE_MIN_FREE,
      teams: strikeCrews(armed), prepare: (team) => armFrom(armed, team),
      input: (team) => {
        const men = manpowerFor(team, 4);
        if ((team.weapons.explosives ?? 0) > 0) return { type: 'bomb', buildingIds: [targetId], opts: { manpower: men } };
        const inside = peopleList(w).find((p) => p.status !== 'dead' && p.gangId != null && p.gangId !== gang.id && p.buildingId === targetId);
        return inside ? { type: 'kill', personId: inside.id, opts: { manpower: men } } : { type: 'smashUp', buildingIds: [targetId], opts: { manpower: men } };
      } });
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

  // ---- 1.2.22: rival headquarters, from what our own scouts have found.
  // The rival worth striking: in a territory game the weakest (by the power
  // graph), otherwise the strongest per man we know of (rich, thinly manned).
  const liveRivals = Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated);
  const knownMen = (g: Gang) => gang.knownPeople.filter((id) => w.people[id]?.gangId === g.id && w.people[id]?.status === 'active').length;
  // 1.2.23 surplus: cash far above need with the crews full — the money goes on
  // bribes, buying into the blocks we share with rivals, and the strongest rival's HQ.
  const surplusCash = Math.round(gang.cash - Math.min(RESERVE_CAP, wageBill * 3) - 20000);
  // (seen in 1.2.23 testing: $145k idle at 72 of 80 men, so near-full crews count too)
  const surplus = (crewMen() >= CREW_CAPACITY * 0.85 && surplusCash > 30000) || surplusCash > 100000;
  const hqPriority = (g: Gang) => surplus ? powerRating(w, g) : goal === 'territory' ? -powerRating(w, g) : powerRating(w, g) / Math.max(1, knownMen(g));
  const priorityRival = [...liveRivals].sort((a, b) => hqPriority(b) - hqPriority(a))[0];
  const rivalHQs = knownRivalHQs(w, gang).sort((a, b) => hqPriority(w.gangs[b.ownerGangId!]) - hqPriority(w.gangs[a.ownerGangId!]));
  const hqTarget = rivalHQs[0];
  if (hqTarget) { const line = `NOTE HQ: ${w.gangs[hqTarget.ownerGangId!].name}'s HQ known (building ${hqTarget.id}, block ${hqTarget.blockId})${rivalHQs.length > 1 ? `; ${rivalHQs.length} rival HQs known` : ''}`; actions.push(line); noteDevDesk(line); }
  // Scouting for the priority rival's HQ: its known premises' blocks first.
  if (!rivalHQs.some((b) => b.ownerGangId === priorityRival?.id) && priorityRival && policy.violence !== 'low' && w.week >= 6) {
    // Where to look, from what our map shows: the priority rival's identified
    // blocks; else any rival's; else unexplored offices (HQs are offices) outside our turf.
    const unexplored = (b: Building) => b.ownerGangId !== gang.id && b.state !== 'destroyed' && (b.knowledge?.[gang.id] ?? 0) < 3 && isValidAreaTarget(w, gang.id, 'explore', b);
    const blocksOf = (pick: (id: ID | null) => boolean) => new Set(buildingList(w).filter((b) => pick(buildingMapIntel(b, gang.id).ownerGangId)).map((b) => b.blockId));
    const officeFirst = (a: Building, b: Building) => Number(b.typeId === 'office') - Number(a.typeId === 'office') || nearer(a, b);
    const heldBlocks = new Set(territoryBlocks(w, gang.id).map((b) => b.id));
    let lookWhy = `${priorityRival.name}'s block`;
    let theirBlocks = blocksOf((id) => id === priorityRival.id);
    if (![...theirBlocks].length) { theirBlocks = blocksOf((id) => id != null && id !== gang.id); lookWhy = 'a rival block'; }
    let look = buildingList(w).filter((b) => theirBlocks.has(b.blockId) && unexplored(b)).sort(officeFirst);
    if (!look.length) { look = buildingList(w).filter((b) => b.typeId === 'office' && !heldBlocks.has(b.blockId) && unexplored(b)).sort(nearer); lookWhy = 'unexplored offices in block'; }
    const scout = roleCrew('scout') ?? (w.week % 2 === 0 ? freest() : undefined);
    if (look.length && scout && ready.includes(scout) && freeShare(scout) > 0.3) {
      const block = look[0].blockId;
      const ids = look.filter((b) => b.blockId === block).slice(0, 4).map((b) => b.id);
      propose({ label: `HQ scouting: ${lookWhy} ${block}`, kind: 'intel', value: 400, why: `looking for ${priorityRival.name}'s HQ`, teams: [scout, ...ready.filter((t) => t !== scout)], role: 'scout',
        input: { type: 'explore', buildingIds: ids, opts: { manpower: 1 } }, onGiven: (scout) => noteDevDesk(`NOTE HQ scouting: ${w.people[scout.lieutenantId]?.name ?? 'crew'} explores ${ids.length} sites (${lookWhy} ${block}) looking for ${priorityRival.name}'s HQ (power ${powerRating(w, priorityRival)}, ${knownMen(priorityRival)} men known)`) });
    } else if (!look.length) {
      const line = `NOTE HQ scouting: nothing left to explore for ${priorityRival.name}'s HQ`;
      actions.push(line); noteDevDesk(line);
    }
  }

  // ---- 1.2.22, territory game: cars for every crew, and blocks taken from the weakest rival.
  if (goal === 'territory') {
    let cars = 0;
    for (const team of ready) {
      if (cars >= 2 || Object.values(team.vehicles).some((n) => n > 0)) continue;
      if (gang.cash < wageBill * 3 + VEHICLES.coupe.cost * 2) break;
      const result = buyVehicle(w, gang.id, 'coupe', team.id);
      logResult(actions, `territory: a car for ${w.people[team.lieutenantId]?.name ?? 'crew'}`, result.ok, result.ok ? '' : result.error);
      if (result.ok) cars++;
    }
    const byWeakness = [...liveRivals].sort((a, b) => powerRating(w, a) - powerRating(w, b));
    const striker = muscleCrew && ready.includes(muscleCrew) ? muscleCrew : undefined;
    if (byWeakness.length && striker && w.week >= 6 && !lieLow && freeShare(striker) > 0.25) {
      // The weakest rival with an identified site beside our blocks.
      const beside = (g: Gang) => buildingList(w).filter((b) => buildingMapIntel(b, gang.id).ownerGangId === g.id && !b.isHQ && b.state === 'trading' && nearTerritory(w, gang.id, b.blockId, 1)).sort(nearer);
      const weakest = byWeakness.find((g) => beside(g).length);
      const theirs = weakest ? beside(weakest) : [];
      if (weakest && theirs.length) {
        const site = theirs[0];
        const dynamite = (striker.weapons.explosives ?? 0) > 0;
        propose({ label: `territory: ${dynamite ? 'bomb' : 'torch'} ${weakest.name}'s ${site.typeId} beside our blocks`, kind: 'territory', value: 700, why: `the weakest rival (power ${powerRating(w, weakest)})`, teams: [striker],
          input: (team) => ({ type: dynamite ? 'bomb' : 'torch', buildingIds: [site.id], opts: { manpower: manpowerFor(team, 3) } }),
          onGiven: () => noteDevDesk(`NOTE territory: taking block ${site.blockId} from ${weakest.name} (power ${powerRating(w, weakest)}) — ${dynamite ? 'bomb' : 'torch'} its ${site.typeId}`) });
      }
    }
  }

  // ---- scouting: the scout crew explores the nearest blocks it does not hold yet
  const scoutCrew = roleCrew('scout');
  if (scoutCrew && ready.includes(scoutCrew) && freeShare(scoutCrew) > 0.3) {
    const unseen = buildingList(w).filter((b) => b.ownerGangId !== gang.id && b.protection?.gangId !== gang.id && b.state !== 'destroyed' && (b.knowledge?.[gang.id] ?? 0) < 3 &&
      nearTerritory(w, gang.id, b.blockId, 2) && isValidAreaTarget(w, gang.id, 'explore', b)).sort(nearer);
    const block = [...scoutFirst][0] ?? unseen[0]?.blockId;
    const ids = [...new Set(buildingList(w).filter((b) => b.blockId === block && b.ownerGangId !== gang.id && b.state !== 'destroyed' && isValidAreaTarget(w, gang.id, 'explore', b)).sort((a, b) => (a.knowledge?.[gang.id] ?? 0) - (b.knowledge?.[gang.id] ?? 0) || nearer(a, b)).map((b) => b.id))].slice(0, 4);
    if (block != null && ids.length) propose({ label: `scout block ${block}`, kind: 'intel', value: 250, why: 'unknown sites beside our blocks', teams: [scoutCrew], input: { type: 'explore', buildingIds: ids, opts: { manpower: 1 } } });
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
        if (role === 'extortion' || role === 'business' || role === 'collect' || (team.weapons.pistol ?? 0) > 0) continue;
        if (gang.cash < reserve + WEAPONS.pistol.cost) break;
        const result = buyWeapon(w, gang.id, 'pistol', team.id);
        logResult(actions, `arm ${w.people[team.lieutenantId]?.name ?? 'crew'}'s crew against ${enemy.name}`, result.ok, result.ok ? '' : result.error);
      }
      const striker = armed ?? freest(undefined, 'muscle');
      const theirMen = gang.knownPeople.map((id) => w.people[id]).filter((p): p is NonNullable<typeof p> => !!p && p.status === 'active' && p.gangId === enemy.id && p.role !== 'boss');
      const theirSites = buildingList(w).filter((b) => b.ownerGangId === enemy.id && !b.isHQ && b.state === 'trading').sort(nearer);
      if (striker && theirMen.length) {
        const victim = theirMen.sort((a, b) => (b.role === 'lieutenant' ? 1 : 0) - (a.role === 'lieutenant' ? 1 : 0) || a.id - b.id)[0];
        propose({ label: `retaliate: kill ${victim.name} of ${enemy.name}`, kind: 'violence', value: 1500, why: `${enemy.name} killed our men`, teams: strikeCrews(striker),
          input: (team) => ({ type: 'kill', personId: victim.id, opts: { manpower: manpowerFor(team, 3) } }) });
      } else if (striker && theirSites.length) {
        const site = theirSites[0];
        const dynamite = (striker.weapons.explosives ?? 0) > 0;
        propose({ label: `retaliate: ${dynamite ? 'bomb' : 'smash up'} ${enemy.name}'s ${site.typeId}`, kind: 'violence', value: 1500, why: `${enemy.name} killed our men`, teams: [striker],
          input: (team) => ({ type: dynamite ? 'bomb' : 'smashUp', buildingIds: [site.id], opts: { manpower: manpowerFor(team, 3) } }) });
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
    const available = ACTION_KEYS.filter((key) => !(peaceful && ['torchRival', 'bombRival', 'kidnapRival', 'killRival', 'raid', 'strikeFbi', 'strikeHQ'].includes(key))).filter((key) => ({
      raid: raidSites.length > 0, pressRefuser: refused.length > 0, torchRival: rivalSites.length > 0,
      bombRival: rivalSites.length > 0 && explosives, kidnapRival: rivals.length > 0, killRival: rivals.length > 0 && !!armed,
      snitch: !!snitch && gang.snitchUsedWeek !== w.week && rivalGangs.length > 0 && gang.cash > reserve + 1500,
      // Rare and low-ranked: the FBI director, struck at his headquarters.
      strikeFbi: !!armed && !lieLow && w.week >= 8 && w.people[w.fbiHeadId]?.status === 'active',
      // 1.2.22: a rival HQ our scouts found, struck at most every few weeks.
      strikeHQ: !!armed && !!hqTarget && !lieLow && w.week >= 8 && w.week - desk.lastHqStrike >= HQ_STRIKE_GAP,
    } as Record<ActionKey, boolean>)[key]);
    const rolls = (gang.cash > reserve + 15000 ? 2 : 1) + (policy.violence === 'high' ? 1 : 0);
    const tried = new Set<ActionKey>();
    for (let n = 0; n < rolls; n++) {
      const key = rollAction(actionRanks, available.filter((k) => !tried.has(k)), rng);
      if (!key) break;
      tried.add(key);
      actions.push(`ROLL ${key} (${ACTION_LABELS[key]}, rank ${actionRanks[key]})`);
      const crewRole: CrewRole = key === 'pressRefuser' ? 'extortion' : 'muscle';
      const cashBefore = gang.cash;
      if (key === 'snitch') {
        const knownBefore = gang.knownPeople.length;
        const result = buySnitchInfo(w, rng, gang.id, snitch!.id, rivalGangs);
        logResult(actions, `snitch ${snitch!.name}`, result.ok, result.ok ? result.message ?? '' : result.error);
        if (result.ok) pendingActions.push({ key, knownBefore, cashBefore });
        continue;
      }
      let input: (team: Team) => Omit<IssueOrderInput, 'teamId'>;
      let targetBuildingId: number | undefined, targetPersonId: number | undefined;
      let kind: OrderKind = 'violence', value = 300, why = `rolled at rank ${actionRanks[key]}`;
      let teams: Team[] | undefined, prepare: ((team: Team) => void) | undefined, minFree: number | undefined;
      if (key === 'raid') {
        // Raids are robbery: cash, never territory.
        const site = raidSites[0]; targetBuildingId = site.id; kind = 'money'; value = Math.max(200, raidValue(site, gang.id)); why = 'robbery for cash';
        input = (team) => ({ type: 'raid', buildingIds: [site.id], opts: { manpower: manpowerFor(team, 3) } });
      } else if (key === 'pressRefuser') {
        const site = refused[0]; targetBuildingId = site.id; kind = 'territory'; value = blockIsOurs(site.blockId) ? 300 : 900; why = blockIsOurs(site.blockId) ? 'refused us; block already ours' : 'refused us; a new block';
        input = (team) => ({ type: 'extort', buildingIds: [site.id], opts: { manpower: manpowerFor(team, 3) } });
      } else if (key === 'torchRival' || key === 'bombRival') {
        const site = rivalSites[rng.int(0, Math.min(2, rivalSites.length - 1))]; targetBuildingId = site.id; value = 400;
        input = (team) => ({ type: key === 'torchRival' ? 'torch' : 'bomb', buildingIds: [site.id], opts: { manpower: manpowerFor(team, 3) } });
      } else if (key === 'strikeHQ' && armed && hqTarget) {
        // Heavily armed: tommy guns and dynamite first.
        for (const item of ['tommy', 'tommy', 'explosives'] as WeaponId[]) {
          const want = item === 'tommy' ? 2 : 1;
          if ((armed.weapons[item] ?? 0) >= want || gang.cash < reserve + WEAPONS[item].cost) continue;
          const bought = buyWeapon(w, gang.id, item, armed.id);
          logResult(actions, `HQ strike: buy ${item} for ${w.people[armed.lieutenantId]?.name ?? 'the strike crew'}`, bought.ok, bought.ok ? '' : bought.error);
        }
        proposeHqStrike(hqTarget, 2500, `rolled at rank ${actionRanks[key]}`, key);
        continue;
      } else if (key === 'strikeFbi') {
        targetPersonId = w.fbiHeadId; value = 200;
        input = (team) => ({ type: 'kill', personId: w.fbiHeadId, opts: { manpower: manpowerFor(team, 4) } });
      } else {
        const victim = rivals[rng.int(0, rivals.length - 1)]; targetPersonId = victim.id;
        input = (team) => ({ type: key === 'kidnapRival' ? 'kidnap' : 'kill', personId: victim.id, opts: { manpower: manpowerFor(team, 3) } });
      }
      const tb = targetBuildingId, tp = targetPersonId;
      propose({ label: ACTION_LABELS[key], kind, value, why, role: crewRole, teams, prepare, minFree, input,
        onGiven: (team) => { pendingActions.push({ key, orderId: team.orderIds[team.orderIds.length - 1], targetBuildingId: tb, targetPersonId: tp, cashBefore }); } });
    }
  }

  // ---- 1.2.23 surplus spending
  if (surplus) {
    actions.push(`NOTE surplus: $${surplusCash.toLocaleString('en-US')} above need with ${crewMen()} of ${CREW_CAPACITY} men — bribes, shared blocks, the strongest rival's HQ`);
    if (lawyer) {
      for (const [id, what] of [[w.mayorId, 'mayor'], [w.policeChiefId, 'police chief']] as const) {
        const o = buyable(id, 0.3);
        if (!o) continue;
        const r = queueSpecialistJob(w, gang.id, 'bribeOfficials', o.id);
        logResult(actions, `surplus: lawyer bribes ${o.name} (${what})`, r.ok, r.ok ? r.message ?? '' : r.error);
        if (r.ok) break; // one errand at a time for the lawyer
      }
      const onPayroll = police.filter((p) => p.employedBy === gang.id).length;
      if (onPayroll < 12) {
        const beats = territoryBlocks(w, gang.id).sort((a, b) => dist(a.center, origin) - dist(b.center, origin)).slice(0, 6).map((block) => block.id);
        if (beats.length) {
          const r = queueSpecialistJob(w, gang.id, 'employPolice', null, beats);
          logResult(actions, `surplus: lawyer puts the police on our ${beats.length} nearest blocks on the payroll`, r.ok, r.ok ? r.message ?? '' : r.error);
        }
      }
    }
    // Blocks a rival also claims: buy what is for sale there (a rival's own
    // premises cannot be bought — the game sells only unowned sites).
    const rivalClaims = new Set<number>();
    for (const g of liveRivals) for (const id of claimedTerritoryBlocks(w, g.id)) rivalClaims.add(id);
    const shared = buildingList(w).filter((b) => b.ownerGangId == null && b.state === 'trading' && rivalClaims.has(claimOf(b.blockId)) &&
      ['commercial', 'industrial', 'tenement'].includes(b.cls) && (BUILDING_BY_ID[b.typeId]?.cost ?? 0) > 0).sort(nearer);
    if (shared.length) planBuy('surplus: buy into a rival\'s block', shared, undefined, (b) => (BUILDING_BY_ID[b.typeId]?.profit ?? 0) * 4 + 1500, undefined, surplusCash * 0.5);
    else actions.push('NOTE surplus: nothing for sale in the blocks rivals claim');
    if (hqTarget && armed && policy.violence !== 'low' && !lieLow && w.week - desk.lastHqStrike >= HQ_STRIKE_GAP && !proposals.some((p) => p.label.startsWith('HQ strike'))) {
      for (const item of ['tommy', 'tommy', 'explosives'] as WeaponId[]) {
        if ((armed.weapons[item] ?? 0) >= (item === 'tommy' ? 2 : 1) || gang.cash < reserve + WEAPONS[item].cost) continue;
        const bought = buyWeapon(w, gang.id, item, armed.id);
        logResult(actions, `surplus: buy ${item} for the HQ strike`, bought.ok, bought.ok ? '' : bought.error);
      }
      proposeHqStrike(hqTarget, 3000, `surplus cash; ${w.gangs[hqTarget.ownerGangId!].name} is the strongest rival we know of (power ${powerRating(w, w.gangs[hqTarget.ownerGangId!])})`, 'strikeHQ');
    } else if (!hqTarget) actions.push(`NOTE surplus: no rival HQ known yet — scouting for ${priorityRival?.name ?? 'one'}`);
    else if (!proposals.some((p) => p.label.startsWith('HQ strike'))) {
      actions.push(`HQ STRIKE not made on ${w.gangs[hqTarget.ownerGangId!].name}'s HQ: ${!armed ? 'no armed strike crew ready' : policy.violence === 'low' ? 'violence is off for this goal' : lieLow ? `lying low (suspicion ${Math.round(gang.suspicion)})` : `last strike in week ${desk.lastHqStrike}, the next after ${HQ_STRIKE_GAP} weeks`}`);
    }
    // 1.2.24: the business crew also goes for the big buildings — banks,
    // department stores, large hotels and the like — best takings first.
    const big = buildingList(w).filter((b) => b.ownerGangId == null && b.state === 'trading' && (BUILDING_BY_ID[b.typeId]?.cost ?? 0) >= BIG_BUILDING_COST &&
      (BUILDING_BY_ID[b.typeId]?.profit ?? 0) > 0 && purchasablePremisesType(b) && buildingValue(w, b) <= surplusCash)
      .sort((a, b) => (BUILDING_BY_ID[b.typeId]?.profit ?? 0) - (BUILDING_BY_ID[a.typeId]?.profit ?? 0) || nearer(a, b));
    if (big.length) planBuy('surplus: big building', big, undefined, (b) => (BUILDING_BY_ID[b.typeId]?.profit ?? 0) * 6 + 2000, (b) => buildingValue(w, b), surplusCash * 0.6);
    else actions.push(`NOTE surplus: no big building (bank, department store…) for sale under $${surplusCash.toLocaleString('en-US')}`);
    // 1.2.24 bomb-then-buy: a rival's store in a block we want is bombed by a
    // crew with explosives and time; the next weeks the business crew buys what
    // is for sale in that block. (The bombed site itself stays rubble — the game
    // sells no destroyed premises — and a rival's standing premises cannot be bought.)
    const forSaleIn = (blockId: number) => buildingList(w).filter((b) => b.blockId === blockId && b.ownerGangId == null && b.state !== 'destroyed' &&
      buildingValue(w, b) > 0 && ((b.state === 'trading' && ['commercial', 'industrial', 'tenement'].includes(b.cls)) || (b.cls === 'empty' && w.lots[b.lotId]?.index !== 4 && purchasablePremisesType(b))));
    const bombed = bombedBlocks.get(w) ?? new Map<number, number>();
    bombedBlocks.set(w, bombed);
    for (const [blockId, week] of [...bombed]) {
      if (w.week - week > 4 || blockIsOurs(blockId)) { bombed.delete(blockId); continue; }
      const sites = forSaleIn(blockId);
      if (sites.length) planBuy(`bomb-then-buy: block ${blockId}`, sites, undefined, () => 2500, (b) => buildingValue(w, b), surplusCash * 0.5);
    }
    const bomber = (t: Team) => !outOfTime.has(t.id) && MINUTES_PER_WEEK - t.timeUsed >= STRIKE_MIN_FREE && ((t.weapons.explosives ?? 0) > 0 || (armed?.weapons.explosives ?? 0) > (proposals.some((p) => p.label.startsWith('HQ strike')) ? 1 : 0));
    const bombers = strikeCrews(armed).filter(bomber);
    const wanted = buildingList(w).filter((b) => b.ownerGangId != null && b.ownerGangId !== gang.id && !b.isHQ && b.state === 'trading' && b.cls !== 'illegal' &&
      !blockIsOurs(b.blockId) && !bombed.has(b.blockId) && nearTerritory(w, gang.id, b.blockId, 2) && forSaleIn(b.blockId).length > 0).sort(nearer);
    if (wanted.length && bombers.length && policy.violence !== 'low' && !lieLow) {
      const site = wanted[0];
      propose({ label: `bomb-then-buy: bomb ${w.gangs[site.ownerGangId!]?.name ?? 'a rival'}'s ${site.typeId} (building ${site.id}, block ${site.blockId})`, kind: 'violence', value: 1200,
        why: `${forSaleIn(site.blockId).length} site(s) for sale in a block we want`, minFree: STRIKE_MIN_FREE, teams: bombers, prepare: (team) => armFrom(armed, team),
        input: (team) => ({ type: 'bomb', buildingIds: [site.id], opts: { manpower: manpowerFor(team, 3) } }),
        onGiven: () => { bombed.set(site.blockId, w.week); } });
    } else if (wanted.length) actions.push(`NOTE bomb-then-buy not tried: ${!bombers.length ? 'no crew with explosives and the time' : policy.violence === 'low' ? 'violence is off for this goal' : 'lying low'}`);
  }

  // ---- 1.2.23: the decision. Every candidate is scored by the goal and the
  // best that fit go to the crews; the log says why each won or was not given.
  const crewName = (team: Team) => `${w.people[team.lieutenantId]?.name ?? 'crew'} (${named.get(team.id) ?? team.name})`;
  const slots = ready.map((team) => ({ team, name: crewName(team), role: roles.get(team.id), businessOnly: team === bizCrew,
    free: () => outOfTime.has(team.id) ? 0 : MINUTES_PER_WEEK - team.timeUsed }));
  const decision = decideWeek(goal, proposals, slots, (label, team, p) => {
    const input = inputFor(p, team);
    const site = input.buildingIds?.[0];
    if (p.kind === 'business' && site != null && !buyAllowed(desk, team.id, site)) return { ok: false, error: 'this crew failed there before — retry elsewhere' };
    return give(label, team, input, p.kind);
  });
  actions.push(`DECIDE ${proposals.length} candidate orders for ${slots.length} crews (goal ${goal}): ${decision.given.length} given, ${decision.skipped.length} not`);
  for (const d of decision.given) actions.push(d.line);
  for (const d of decision.skipped) actions.push(d.line);
  noteDevDesk(`DECIDE ${decision.given.length} of ${proposals.length} given`);
  // 1.2.23: no crew sits at 0 orders without a reason in the log.
  for (const slot of slots) {
    const team = slot.team;
    if (team.orderIds.some((id) => w.orders[id]?.gangId === gang.id)) continue;
    const mine = proposals.filter((p) => slot.businessOnly ? p.kind === 'business' : p.kind !== 'business');
    const reason = slot.free() < MIN_FREE_MINUTES ? `its week is full (${Math.round(Math.max(0, MINUTES_PER_WEEK - team.timeUsed))} min left${outOfTime.has(team.id) ? ', refused for time' : ''})`
      : slot.businessOnly && !mine.length ? `business crew: nothing to buy or set up within $${Math.round(Math.max(0, gang.cash)).toLocaleString('en-US')} cash this week`
      : !mine.length ? 'no candidate order this week'
      : lieLow ? `lying low (suspicion ${Math.round(gang.suspicion)}) — the ${mine.length} candidate(s) went to other crews or were refused`
      : `the ${mine.length} candidate(s) went to better-placed crews or were refused`;
    actions.push(`NOTE ${slot.name} has no order: ${reason}`);
  }

  // ---- 1.2.24: surplus cash equips the crews (Robert). After the reserve and
  // this week's buys, everything left goes on cars and guns, strongest crews
  // first: a seat for every man, then the best gun for every man. Collectors
  // and the extortion crew stay unarmed (they hand their guns in) but get cars.
  if (surplus) {
    const committed = desk.pending.filter((p) => p.week === w.week).reduce((sum, p) => {
      const order = w.orders[p.orderId];
      const b = w.buildings[p.buildingId];
      const type = order?.opts.businessTypeId ? BUILDING_BY_ID[order.opts.businessTypeId] : undefined;
      return sum + (type ? type.cost : b && p.type === 'buyPremises' ? buildingValue(w, b) : 0);
    }, 0);
    const keep = Math.max(RESERVE_CAP, Math.round(wageBill * 3)) + campaignReserve + committed;
    const before = gang.cash;
    const strength = (t: Team) => [t.lieutenantId, ...t.memberIds].reduce((sum, id) => { const p = w.people[id]; return sum + (p ? Object.values(p.skills).reduce((a, b) => a + b, 0) : 0); }, 0);
    const crews = crewsOf().sort((a, b) => strength(b) - strength(a) || a.id - b.id);
    const bought: string[] = [];
    const afford = (cost: number) => gang.cash - cost >= keep;
    for (const t of crews) {
      const men = t.memberIds.length + 1;
      let seats = (Object.entries(t.vehicles) as [keyof typeof VEHICLES, number][]).reduce((sum, [id, n]) => sum + (VEHICLES[id]?.capacity ?? 0) * (n ?? 0), 0);
      while (seats < men && afford(VEHICLES.coupe.cost)) {
        if (!buyVehicle(w, gang.id, 'coupe', t.id).ok) break;
        seats += VEHICLES.coupe.capacity; bought.push(`coupe for ${w.people[t.lieutenantId]?.name ?? 'crew'}`);
      }
    }
    const BEST_GUN: WeaponId = 'twinPistols';
    for (const t of crews) {
      const role = roles.get(t.id);
      if (role === 'collect' || role === 'extortion') continue;
      const men = t.memberIds.length + 1;
      let guns = GUNS.reduce((sum, g) => sum + (t.weapons[g] ?? 0), 0);
      while (guns < men && afford(WEAPONS[BEST_GUN].cost)) {
        if (!buyWeapon(w, gang.id, BEST_GUN, t.id).ok) break;
        guns++; bought.push(`${BEST_GUN} for ${w.people[t.lieutenantId]?.name ?? 'crew'}`);
      }
      // Pistols give way to the best gun once every man has one.
      while ((t.weapons.pistol ?? 0) > 0 && afford(WEAPONS[BEST_GUN].cost)) {
        if (!transferWeapon(w, gang.id, 'pistol', t.id, false).ok) break;
        if (!buyWeapon(w, gang.id, BEST_GUN, t.id).ok) break;
        bought.push(`${BEST_GUN} for ${w.people[t.lieutenantId]?.name ?? 'crew'} (pistol to the store)`);
      }
      if (role === 'muscle' && (t.weapons.explosives ?? 0) < 2 && afford(WEAPONS.explosives.cost) && buyWeapon(w, gang.id, 'explosives', t.id).ok) bought.push(`explosives for ${w.people[t.lieutenantId]?.name ?? 'crew'}`);
    }
    const counts = new Map<string, number>();
    for (const item of bought) counts.set(item, (counts.get(item) ?? 0) + 1);
    actions.push(`EQUIP surplus: $${Math.round(before - gang.cash).toLocaleString('en-US')} spent, $${Math.round(gang.cash).toLocaleString('en-US')} left (keep $${keep.toLocaleString('en-US')}: reserve${campaignReserve ? ' + campaign' : ''} + $${Math.round(committed).toLocaleString('en-US')} for this week's buys)${counts.size ? ` — ${[...counts].map(([k, n]) => `${n}× ${k}`).join(', ')}` : ' — every crew already has seats and guns'}`);
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
  if (gangManpower(w, gang) === beforeMen && gang.poolIds.length === 0 && gang.recruitIds.length === 0 && hoodSites.length === 0) {
    actions.push('NOTE nobody hired and no hiring place');
  }
  return actions;
}

function reportText(parts: {
  /** 1.2.23: the game's starting conditions, first in the report. */
  starting: string[];
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
    ...parts.starting,
    '',
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
    // 1.2.24: past HEAP_IDLE_MB of used heap the run pauses a moment between
    // weeks, so the browser can collect the week's garbage (each week's save
    // alone is a ~30 MB string plus its copy) before the next week allocates more.
    { const h = readHeap(); if (h && h.used > HEAP_IDLE_MB * 1048576) await yieldIdle(HEAP_IDLE_MS); }
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
  let learnedEntry: DiaryEntry | undefined;
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
    learnedEntry = entry;
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
    starting: startingConditions(sim.world, settings.seed),
    settings, citySeed: sim.world.options.seed, campaign, strategy: planned.strategy,
    versusLast: planned.versusLast, planNote: planned.note, weeks, actions, notes, anomalies,
    outcome, score: gameScore, learningScore: score, scoreNote, beat, plateau, diaryNote,
  }) + (learnedEntry ? learnedBlock(learnedEntry) : '');
  const filename = instanceFile(`auto-test-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
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
    // Large reports are split into parts; Import reads them back joined.
    const parts = splitReport(text);
    for (let i = 0; i < parts.length; i++) await writeReportFile(parts.length === 1 ? filename : filename.replace(/\.txt$/, `-part${i + 1}of${parts.length}.txt`), parts[i]);
    return text;
  } catch (error) {
    if (!noted) noteAutoTestStopped(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
