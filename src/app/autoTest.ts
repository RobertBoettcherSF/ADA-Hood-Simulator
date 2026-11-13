import { learnedBlock } from './diary';
import { devJournalWeeks, splitReport } from './devJournal';
import { peekStopTraces } from '../sim/devTrace';
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
import { buySnitchInfo, canGoStraight, repairBuilding, setPay, shutdownBuilding, setGoStraight, setRunForOffice, buyVehicle, buyWeapon, hireRecruit, issueOrder, issueStreetOrder, demote, moveToPool, moveToTeam, nearTerritory, promote, sackPerson, transferVehicle, transferWeapon, type ApiResult, type IssueOrderInput } from '../sim/api';
import { ACTION_KEYS, ACTION_LABELS, assignCrewRoles, BASIC_CREWS, CREW_OPENING_ORDER, ROLE_SKILLS, carMinutesSaved, crewNames, roleStars, defaultActionRanks, judgeAction, loadActionRanks, raidValue, rankDown, rankUp, rollAction, talentSwaps, type ActionKey, type ActionRanks, type CrewRole, type PendingAction } from './autoActions';
import { DRIVE_SPEED, GO_STRAIGHT_ASSETS, VEHICLES, WALK_SPEED, WEAPONS } from '../sim/constants';
import type { Building, Gang, ID, Person, Team, WeaponId } from '../sim/types';
import { buildingMapIntel, knownBlockOwners, personMapPosition } from '../sim/mapIntel';
import { claimedTerritoryBlocks } from '../sim/territory';
import { BUILDING_BY_ID, ESTABLISHABLE_TYPES, ILLEGAL_TYPES } from '../sim/data/buildings';
import { ORIGINAL_ECONOMICS } from '../sim/data/originalEconomics';
import { purchasablePremisesType } from '../sim/premises';
import { buildingValue, isValidAreaTarget } from '../sim/execution';
import type { Sim } from '../sim/sim';
import { buildingDoor, dist, gangAssets, gangManpower, gangMembers, powerRating, protectedBuildings, territoryBlocks, territoryCount } from '../sim/world';
import { effectiveHostility } from '../sim/attitudes';
import { buildingList, peopleList } from '../sim/entityLists';
import { MAX_TEAM_SIZE, MAX_TEAMS, MINUTES_PER_WEEK } from '../sim/constants';
import { crewFreeMinutes, crewLoads, crewUsedShare } from '../sim/crewTime';
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
import { memProbeLine, registerProbe } from '../sim/memProbe';
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
/** 1.2.28 (Robert's rule): past this much used heap Auto Test saves its evidence and pauses. */
export const HEAP_EVIDENCE_BYTES = 2 * 1024 * 1024 * 1024;
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

/** 1.2.24 (Robert's rule): a venue with no recruits three weeks running is not tried again until a rumour points at it. */
export const EMPTY_VENUE_STREAK = 3;

export interface RecruitMemory {
  /** Venues last week's rumours pointed at. */
  hintIds: number[];
  /** 1.2.24: building id → weeks running it came up empty. */
  emptyStreak: Map<number, number>;
  /** 1.2.24: venues that gave us recruits last week, tried first. */
  yieldedIds: number[];
}

export function newRecruitMemory(): RecruitMemory {
  return { hintIds: [], emptyStreak: new Map(), yieldedIds: [] };
}

let recruitMemory = newRecruitMemory();
// 1.2.28: memory probe — Auto Test's own module state.
registerProbe('autoTest', () => ({ pendingActions: pendingActions.length, talentPlaced: talentPlaced.size, runListeners: runListeners.size,
  venueStreaks: recruitMemory.emptyStreak.size, hints: recruitMemory.hintIds.length, ledgerKeys: Object.keys(timeLedger).length }));
const coolingOff = new WeakMap<object, boolean>();
/** 1.2.24: our businesses (id → manager) last Monday, to log managers killed and businesses lost. */
const ownedLastWeek = new WeakMap<object, Map<number, number | null>>();
/** 1.2.25: each crew's job, kept while the crew exists. */
const crewRoleMemory = new WeakMap<object, Map<number, CrewRole>>();

/**
 * 1.2.25 (Robert's rule): last week's productive venues first, then the
 * venues a rumour points at, then the rest. A venue empty three weeks running
 * is not tried again until a rumour mentions it (no comeback after some weeks,
 * and no trying them all when every venue is skipped).
 */
export function chooseHoodRecruitSites<T extends { id: number }>(
  sites: T[],
  memory: RecruitMemory = recruitMemory,
): T[] {
  const hinted = new Set(memory.hintIds);
  const open = (site: T) => hinted.has(site.id) || (memory.emptyStreak.get(site.id) ?? 0) < EMPTY_VENUE_STREAK;
  const picked: T[] = [];
  const seen = new Set<number>();
  for (const id of [...memory.yieldedIds, ...memory.hintIds]) {
    const site = sites.find((entry) => entry.id === id);
    if (!site || seen.has(id) || !open(site)) continue;
    picked.push(site); seen.add(id);
  }
  for (const site of sites) if (!seen.has(site.id) && open(site)) { picked.push(site); seen.add(site.id); }
  return picked;
}

export function rememberRecruitResults(
  orders: { type: string; recruitHintId?: number | null; emptyRecruitIds?: number[]; targetBuildingIds?: number[]; opts?: { recruitAs?: string } }[],
  memory: RecruitMemory = recruitMemory,
): void {
  const yielded: number[] = [];
  const hints: number[] = [];
  for (const order of orders) {
    // 1.2.21: only hood recruiting feeds the hood venues' memory; an accountant's
    // or lawyer's tip points at their own offices, never the gyms and pool halls.
    if (order.type !== 'recruit' || (order.opts?.recruitAs != null && order.opts.recruitAs !== 'hood')) continue;
    const empty = new Set(order.emptyRecruitIds ?? []);
    for (const id of empty) memory.emptyStreak.set(id, (memory.emptyStreak.get(id) ?? 0) + 1);
    for (const id of order.targetBuildingIds ?? []) {
      if (empty.has(id)) continue;
      memory.emptyStreak.delete(id);
      yielded.push(id);
    }
    // A rumour gives a skipped venue its chance again.
    if (order.recruitHintId != null) { hints.push(order.recruitHintId); memory.emptyStreak.delete(order.recruitHintId); }
  }
  memory.yieldedIds = [...new Set(yielded)];
  memory.hintIds = [...new Set(hints)];
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
/** 1.2.21: the police chief's opinion of us last Monday (the chief is paid only when it falls). */
const chiefOpinionLastWeek = new WeakMap<Sim['world'], number>();
/** A crew is worth starting only when every existing one has this many hoods. */
const USEFUL_CREW = 4;
/** 1.2.24: crews opened at a useful size, one per kind of work (1.2.30: recruiting, business, intimidation, collecting). */
const KIND_CREWS = 4;
/** 1.2.21: eight lieutenants with nine hoods each — the most men the crews can use. */
const CREW_CAPACITY = MAX_TEAMS * MAX_TEAM_SIZE;
/** 1.2.25: weeks of losses looked back over to size the spare hoods kept in the pool. */
const SPARE_LOSS_WEEKS = 4;
/** A racket the gang is saving for: other premises wait until its cost is in hand. */
const savingFor = new WeakMap<Sim['world'], { name: string; cost: number }>();

/** Suspicion at which the desk starts paying the police chief and easing the extortion (1.2.19: 30, was 40). */
const SUSPICION_BRIBE = 30;
/** 1.2.23: past this suspicion extortion eases and money goes to lowering it. */
const SUSPICION_EASE = 60;
/** 1.2.25 (Robert): the cash reserve is three weeks of wages, at most this much. */
const RESERVE_CAP = 50_000;
/** 1.2.25 (Robert): surplus spending starts once the surplus is above this. */
const SURPLUS_START = 50_000;
/** 1.2.23: a strike goes only to a crew with this much of its week left. */
const STRIKE_MIN_FREE = 240;
/** 1.2.24: an HQ strike needs a crew of at least this many men (lieutenant included), explosives and its whole week free. */
const STRIKE_MIN_MEN = 5;
/**
 * 1.2.26: a business's size in squares of its block, from the game's
 * economics record (`size`: 1, 3 = one block side, 8 = the ring, 9 = the
 * whole block). A building without that record has no size.
 */
const squaresOf = (b: Building): number | undefined => b.originalKind != null ? ORIGINAL_ECONOMICS[b.originalKind]?.size : undefined;
/** Suspicion at which the gang lies low: collecting and legal buying only. */
export const SUSPICION_LIE_LOW = 50;
/** A rise this big in one week counts as one level hotter than the figure says. */
export const SUSPICION_JUMP = 15;
/** Most of the gang's men on risky street orders (extortion and rough work) at once; less while easing. */
export const RISKY_SHARE = 0.5;
export const RISKY_SHARE_EASING = 0.35;
/** 1.2.24: a man this wanted gets no risky work (extortion, violence); his crew's risky order goes to a cleaner crew. */
export const WANTED_RISKY_HOLD = 8;
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
export const STREET_HEAT_REST = 28; // 1.2.24: was 30
/** A resting man goes back to work once his street heat is below this. */
export const STREET_HEAT_BACK = 15;
/** Resting only helps a man with his own wanted level: below this, his heat is
 * the police's opinion of the gang, which no rest can cool. */
export const REST_WANTED = 4; // 1.2.24: was 10 — with hostile police a man wanted 6 was already past the arrest line
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
  /** 1.2.24: hoods held back from street work this week for their wanted level. */
  const heldForWanted = new Map<number, string>();
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

  // 1.2.25: each crew keeps its job while it exists (recruiting, extortion,
  // collecting, then business, in the order the crews open).
  const keptRoles = crewRoleMemory.get(w) ?? new Map<number, CrewRole>();
  crewRoleMemory.set(w, keptRoles);
  const rolesNow = () => assignCrewRoles(crewsOf(), keptRoles);
  // 1.2.25 (Robert's rule): a new hood waits in the pool until a crew that
  // needs him takes him (3★ or more in that crew's skills); the pool pass
  // below places him or, beyond the spares, lets him go. A lawyer or an
  // accountant is hired only when he is better than the one we have.
  for (const id of [...gang.recruitIds]) {
    const person = w.people[id];
    if (person && (person.role === 'lawyer' || person.role === 'accountant')) {
      const currentId = person.role === 'lawyer' ? gang.lawyerId : gang.accountantId;
      const current = currentId == null ? undefined : w.people[currentId];
      const usable = current && current.gangId === gang.id && current.status === 'active';
      if (usable && current.skills.intelligence >= person.skills.intelligence) {
        actions.push(`NOTE ${person.role} ${person.name} (${person.skills.intelligence.toFixed(1)}★) not hired — ours is as good (${current.skills.intelligence.toFixed(1)}★)`);
        continue;
      }
    }
    const result = hireRecruit(w, gang.id, id, 'pool');
    logResult(actions, `hire ${person?.name ?? id} to the pool`, result.ok, result.ok ? result.message ?? '' : result.error);
  }

  // Wages: everyone gets what he asks while the takings (or a year's cash) can
  // carry it — underpaid men lose loyalty and walk out, lieutenants with their crews.
  const payroll = gangMembers(w, gang).filter((p) => p.role !== 'boss');
  const wageBill = payroll.reduce((sum, p) => sum + p.pay, 0);
  const income = gang.lastWeekIncome;
  const weeklyNet = income.legal + income.illegal + income.protection + income.other - gang.lastWeekCosts.wages - gang.lastWeekCosts.upkeep;
  const short = payroll.filter((p) => p.pay < p.payDemand);
  const raise = short.reduce((sum, p) => sum + p.payDemand - p.pay, 0);
  if (short.length && (weeklyNet >= raise || gang.cash >= (wageBill + raise) * 26)) {
    for (const p of short) setPay(w, p.id, p.payDemand);
    actions.push(`NOTE pay raised to what they ask for ${short.length} m${short.length === 1 ? 'an' : 'en'} (+$${raise} a week)`);
  } else if (short.length) {
    // 1.2.25 (B1, loyalty and pay demand): what last week netted pays the
    // least loyal men's raises first, so the likeliest to walk are kept.
    let room = Math.max(0, weeklyNet);
    const raised: string[] = [];
    for (const p of [...short].sort((a, b) => a.loyalty - b.loyalty || a.id - b.id)) {
      const step = p.payDemand - p.pay;
      if (step > room) continue;
      setPay(w, p.id, p.payDemand); room -= step;
      raised.push(`${p.name} (loyalty ${Math.round(p.loyalty)}, +$${step})`);
    }
    if (raised.length) actions.push(`B1 pay: the least loyal raised first — ${raised.join(', ')}`);
    actions.push(`NOTE ${short.length - raised.length} underpaid m${short.length - raised.length === 1 ? 'an' : 'en'} left short — the books cannot carry every raise`);
  }
  const lastMen = menLastWeek.get(w);
  const menNow = crewMen();
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

  // 1.2.30 (Robert's rules): the basic crews — Recruit first, then Business,
  // then Intimidation and protection collecting — are formed as soon as a lead
  // qualifies and rebuilt straight away when lost, every week. A lead comes
  // from the pool first, then from a crew (never the business crew).
  {
    type Basic = 'recruit' | 'business' | 'intimidation' | 'collect';
    const s3 = (p: Person) => [p.skills.intelligence, p.skills.organization, p.skills.intimidation];
    /** The full lead qualifications for each basic crew. */
    const qualified = (role: Basic, p: Person) => role === 'intimidation'
      ? s3(p).every((v) => v >= 4)
      : p.skills.intelligence >= 4 || p.skills.organization >= 4 || roleStars(p, role) >= 4;
    /** Until a qualified hood is there: a 3★ business lead, or the closest fit with 3★ in intelligence, organization and intimidation. */
    const interim = (role: Basic, p: Person) => role === 'business' ? p.skills.business >= 3
      : role === 'intimidation' ? s3(p).every((v) => v >= 3) : false;
    const fit = (role: Basic, p: Person) => role === 'intimidation' ? s3(p).reduce((a, v) => a + Math.min(4, v), 0) * 10 + s3(p).reduce((a, v) => a + v, 0)
      : role === 'business' ? roleStars(p, 'business') * 10 + p.skills.business : roleStars(p, role);
    const describe = (role: Basic, p: Person) => role === 'intimidation'
      ? `int ${p.skills.intelligence.toFixed(1)}★, org ${p.skills.organization.toFixed(1)}★, intimidation ${p.skills.intimidation.toFixed(1)}★`
      : `int ${p.skills.intelligence.toFixed(1)}★, org ${p.skills.organization.toFixed(1)}★, ${roleStars(p, role).toFixed(1)}★ ${role}${role === 'business' ? ` (business ${p.skills.business.toFixed(1)}★)` : ''}`;
    const free = (p: Person | undefined): p is Person => !!p && p.role === 'hood' && p.status === 'active' && !restingMen.has(p.id);
    const poolHoods = () => gang.poolIds.map((id) => w.people[id]).filter(free);
    const crewHoods = () => crewsOf().filter((t) => keptRoles.get(t.id) !== 'business')
      .flatMap((t) => t.memberIds.map((id) => w.people[id])).filter((p): p is Person => free(p) && p.orderId == null);
    const pick = (role: Basic, ok: (p: Person) => boolean) => {
      const byFit = (a: Person, b: Person) => fit(role, b) - fit(role, a) || a.id - b.id;
      return poolHoods().filter(ok).sort(byFit)[0] ?? crewHoods().filter(ok).sort(byFit)[0];
    };
    const roleHolder = (role: CrewRole) => crewsOf().find((t) => rolesNow().get(t.id) === role);
    for (const role of BASIC_CREWS as readonly Basic[]) {
      const team = roleHolder(role);
      if (team) {
        // An interim lead gives way as soon as a qualified hood is recruited (he waits in the pool).
        const lt = w.people[team.lieutenantId];
        if (!lt || (role !== 'business' && role !== 'intimidation') || qualified(role, lt)) continue;
        const better = poolHoods().filter((p) => qualified(role, p)).sort((a, b) => fit(role, b) - fit(role, a) || a.id - b.id)[0];
        if (!better) continue;
        if (team.orderIds.length) { actions.push(`NOTE ${role} crew: ${better.name} (${describe(role, better)}) qualifies to lead it — the swap for ${lt.name} waits until the crew's orders are done`); continue; }
        const members = [...team.memberIds];
        const cars = { ...team.vehicles };
        const down = demote(w, gang.id, team.id);
        keptRoles.delete(team.id);
        const up = down.ok ? promote(w, gang.id, better.id) : down;
        const newTeam = up.ok && better.teamId != null ? w.teams[better.teamId] : undefined;
        logResult(actions, `${role} crew: ${better.name} (${describe(role, better)}) takes over from ${lt.name} (${describe(role, lt)})`, !!newTeam, up.ok ? '' : up.error);
        if (!newTeam) continue;
        keptRoles.set(newTeam.id, role);
        for (const id of [lt.id, ...members]) if (gang.poolIds.includes(id) && newTeam.memberIds.length < MAX_TEAM_SIZE - 1) moveToTeam(w, gang.id, id, newTeam.id);
        for (const [kind, n] of Object.entries(cars) as [keyof typeof VEHICLES, number][]) for (let i = 0; i < (n ?? 0); i++) transferVehicle(w, gang.id, kind, newTeam.id, true);
        continue;
      }
      // Missing: form it now.
      const lead = pick(role, (p) => qualified(role, p)) ?? pick(role, (p) => interim(role, p));
      if (!lead) {
        const need = role === 'intimidation' ? '3★ or more in intelligence, organization and intimidation (4★ in each to lead it for good)'
          : role === 'business' ? `4★ in intelligence, organization or ${ROLE_SKILLS.business.join('/')}, or 3★ business`
          : `4★ in intelligence, organization or ${ROLE_SKILLS[role].join('/')}`;
        actions.push(`BASIC CREW ${role} not ${w.week > 1 ? 'formed or rebuilt' : 'formed'}: no free hood in the pool or a crew with ${need}`);
        continue;
      }
      if (gang.teamIds.length >= MAX_TEAMS) { actions.push(`BASIC CREW ${role} not formed: already ${MAX_TEAMS} lieutenants (${lead.name} would lead it)`); continue; }
      const result = promote(w, gang.id, lead.id);
      const newTeam = result.ok && lead.teamId != null ? w.teams[lead.teamId] : undefined;
      logResult(actions, `promote ${lead.name} to lead the ${role} crew (${describe(role, lead)}${qualified(role, lead) ? '' : ' — until a qualified hood is recruited'})`, !!newTeam, result.ok ? result.message ?? '' : result.error);
      if (newTeam) keptRoles.set(newTeam.id, role);
      else actions.push(`BASIC CREW ${role} not formed: ${result.ok ? 'the promotion made no crew' : result.error}`);
    }
  }

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
    // 1.2.25 (Robert's rule): a new crew opens only under a hood with 4★ or
    // more in intelligence, organization or the new crew's own skills — and a
    // pool hood joins a crew of his kind that has room before he leads one.
    const roleOfNow = () => rolesNow();
    const ALL_ROLES = Object.keys(ROLE_SKILLS) as CrewRole[];
    const bestRole = (p: Person) => [...ALL_ROLES].sort((x, y) => roleStars(p, y) - roleStars(p, x))[0];
    // 1.2.30: further crews only once every basic crew is formed.
    const basicHeld = () => BASIC_CREWS.every((r) => [...roleOfNow().values()].includes(r));
    for (let tries = 0; tries < 3 && basicHeld() && mayOpen(); tries++) {
      const held = roleOfNow();
      const nextRole = CREW_OPENING_ORDER.find((r) => ![...held.values()].includes(r)) ?? 'collect';
      const fits = (p: Person) => p.skills.intelligence >= 4 || p.skills.organization >= 4 || roleStars(p, nextRole) >= 4;
      const roomInKind = (p: Person) => crewsOf().some((t) => held.get(t.id) === bestRole(p) && t.memberIds.length < MAX_TEAM_SIZE - 1);
      const byStars = (x: Person, y: Person) => roleStars(y, nextRole) - roleStars(x, nextRole) || x.id - y.id;
      const fromPool = gang.poolIds.filter((id) => !restingMen.has(id)).map((id) => w.people[id])
        .filter((p): p is Person => !!p && p.role === 'hood' && p.status === 'active' && fits(p) && !roomInKind(p)).sort(byStars)[0];
      // Before the four kinds of crew are open, a qualified man may also come from a big crew (never the business crew).
      const fromCrew = gang.teamIds.length < KIND_CREWS ? crewsOf().filter((t) => held.get(t.id) !== 'business' && t.memberIds.length >= 4)
        .flatMap((t) => t.memberIds).map((id) => w.people[id]).filter((p): p is Person => !!p && p.status === 'active' && p.orderId == null && fits(p)).sort(byStars)[0] : undefined;
      const lead = fromPool ?? fromCrew;
      if (!lead) {
        actions.push(`NOTE no new ${nextRole} crew: no free hood with 4★ in intelligence, organization or ${ROLE_SKILLS[nextRole].join('/')} (or each has room in a crew of his kind)`);
        break;
      }
      const result = promote(w, gang.id, lead.id);
      if (result.ok && lead.teamId != null) keptRoles.set(lead.teamId, nextRole);
      logResult(actions, `promote ${lead.name} to lead the ${nextRole} crew (int ${lead.skills.intelligence.toFixed(1)}★, org ${lead.skills.organization.toFixed(1)}★, ${roleStars(lead, nextRole).toFixed(1)}★ ${nextRole})`, result.ok, result.ok ? result.message ?? '' : result.error);
      if (!result.ok) break;
    }
    // 1.2.25 (Robert's rule): a pool hood joins only a crew whose job he has
    // 3★ or more for — the crew he is best for, the fullest among equals, so
    // one crew fills before the next. Nobody goes to a crew just because it is empty.
    const roles0 = roleOfNow();
    const roleOf = (team: Team) => roles0.get(team.id) ?? 'collect';
    const bestStars = (p: Person) => Math.max(...crewsOf().map((team) => roleStars(p, roleOf(team))), 0);
    const placeable = gang.poolIds.filter((id) => !restingMen.has(id)).map((id) => w.people[id]).filter((p): p is Person => !!p && p.role === 'hood' && p.status === 'active')
      .sort((a, b) => bestStars(b) - bestStars(a) || a.id - b.id);
    for (const p of placeable) {
      const crew = crewsOf().filter((team) => team.memberIds.length < MAX_TEAM_SIZE - 1 && roleStars(p, roleOf(team)) >= 3)
        .sort((a, b) => roleStars(p, roleOf(b)) - roleStars(p, roleOf(a)) || b.memberIds.length - a.memberIds.length || a.id - b.id)[0];
      if (!crew) {
        // 1.2.30 (Robert): a hood who fits no crew's job goes to protection collecting.
        const collect = crewsOf().filter((team) => roleOf(team) === 'collect' && team.memberIds.length < MAX_TEAM_SIZE - 1)
          .sort((a, b) => b.memberIds.length - a.memberIds.length || a.id - b.id)[0];
        if (!collect) continue;
        const result = moveToTeam(w, gang.id, p.id, collect.id);
        logResult(actions, `to crew ${p.name} (fits no crew's job, ${bestStars(p).toFixed(1)}★ best) — collects protection`, result.ok, result.ok ? result.message ?? '' : result.error);
        continue;
      }
      const result = moveToTeam(w, gang.id, p.id, crew.id);
      logResult(actions, `to crew ${p.name} (${roleStars(p, roleOf(crew)).toFixed(1)}★ for ${roleOf(crew)})`, result.ok, result.ok ? result.message ?? '' : result.error);
    }
    // A full crew swaps its weakest free hand for a better man in the pool
    // (3★ or more for that crew's job), every such swap.
    for (const p of [...placeable].filter((x) => gang.poolIds.includes(x.id))) {
      let best: { team: Team; weak: Person; gain: number } | undefined;
      for (const team of crewsOf()) {
        if (team.memberIds.length < MAX_TEAM_SIZE - 1 || roleStars(p, roleOf(team)) < 3) continue;
        const weak = team.memberIds.map((m) => w.people[m]).filter((x): x is Person => !!x && x.status === 'active' && x.orderId == null && !talentPlaced.has(x.id))
          .sort((a, b) => roleStars(a, roleOf(team)) - roleStars(b, roleOf(team)))[0];
        const gain = weak ? roleStars(p, roleOf(team)) - roleStars(weak, roleOf(team)) : 0;
        if (weak && gain > 0 && (!best || gain > best.gain)) best = { team, weak, gain };
      }
      if (!best) continue;
      const out = moveToPool(w, gang.id, best.weak.id);
      const result = out.ok ? moveToTeam(w, gang.id, p.id, best.team.id) : out;
      logResult(actions, `swap ${p.name} into ${best.team.name} for ${best.weak.name} (+${best.gain.toFixed(1)}★ ${roleOf(best.team)})`, result.ok, result.ok ? '' : result.error);
    }
    // 1.2.25 (Robert): spares by ability and losses. Idle pool hoods with 3★
    // for some crew's job or firearms above 3★ are kept — the gunmen first —
    // as many as the men lost in the last SPARE_LOSS_WEEKS weeks; the rest leave.
    {
      const lost = memberLosses(w, gang.id, w.week - SPARE_LOSS_WEEKS).filter((l) => l.role === 'hood' || l.role === 'lieutenant').length;
      const idle = idlePool().map((id) => w.people[id]).filter((p): p is Person => !!p);
      const useful = (p: Person) => bestStars(p) >= 3 || p.skills.firearms > 3;
      const ranked = idle.sort((a, b) => Number(b.skills.firearms > 3) - Number(a.skills.firearms > 3) || bestStars(b) - bestStars(a) || a.id - b.id);
      const keep = new Set(ranked.filter(useful).slice(0, lost).map((p) => p.id));
      if (idle.length) actions.push(`NOTE spares: ${keep.size} kept in the pool against ${lost} men lost in the last ${SPARE_LOSS_WEEKS} weeks`);
      for (const p of ranked) {
        if (keep.has(p.id)) continue;
        const result = sackPerson(w, gang.id, p.id);
        logResult(actions, `let ${p.name} go — no crew needs him (${bestStars(p).toFixed(1)}★ best, firearms ${p.skills.firearms.toFixed(1)}★)${useful(p) ? ', spares already enough' : ''}`, result.ok, result.ok ? result.message ?? '' : result.error);
      }
    }
    // A new crew gets two men from the biggest one, so no lieutenant walks alone
    // (1.2.25: never from the business crew, which lends nobody).
    for (let moves = 0; moves < 4; moves++) {
      const sorted = crewsOf().sort((a, b) => a.memberIds.length - b.memberIds.length);
      const small = sorted[0];
      const big = sorted.filter((t) => roleOf(t) !== 'business').pop();
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
  // 1.2.25: every crew keeps its job, a crew whose lieutenant is in custody too
  // (it simply gets no orders) — its job never passes to another crew.
  const roles = rolesNow();
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
    // 1.2.25: 3★ or more for the business crew's job (business and organization), as for every crew.
    const bizStars = (p: Person) => roleStars(p, 'business');
    const fromPool = idlePool().map((id) => w.people[id]).filter((p): p is Person => !!p && p.orderId == null && bizStars(p) >= 3);
    const talents = [...fromPool.sort((a, b) => bizStars(b) - bizStars(a)), ...crewsOf().filter((t) => t.id !== bizCrew.id && t.memberIds.length > 2)
      .flatMap((t) => t.memberIds.map((id) => w.people[id])).filter((p): p is Person => !!p && p.status === 'active' && p.orderId == null && bizStars(p) >= 3)
      .sort((a, b) => bizStars(b) - bizStars(a))];
    const want = MAX_TEAM_SIZE - 1 - bizCrew.memberIds.length;
    for (const p of talents) {
      if (moved >= 4 || bizCrew.memberIds.length >= MAX_TEAM_SIZE - 1) break;
      const result = tryMove(p.id, bizCrew.id, `business crew: ${p.name} (${bizStars(p).toFixed(1)}★ business) joins`);
      if (result.ok) { moved++; talentPlaced.add(p.id); }
    }
    if (!Object.values(bizCrew.vehicles).some((n) => n > 0) && gang.cash > VEHICLES.coupe.cost * 3) {
      const result = buyVehicle(w, gang.id, 'coupe', bizCrew.id);
      logResult(actions, `business crew: a car for ${w.people[bizCrew.lieutenantId]?.name ?? 'the crew'}`, result.ok, result.ok ? '' : result.error);
    }
    if (want > moved && bizCrew.memberIds.length < 3) actions.push(`NOTE business crew short: ${bizCrew.memberIds.length + 1} men and no free hood with 3★ business to join — it works with who is left`);
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
  // 1.2.30 (Robert's rules): a crew holds at most one gun per man, the best
  // ones; the rest go to the gang store, which has no limit. The collecting,
  // business and intimidation crews carry no guns. Armed crews take store guns
  // (the strike crew first) before anything is bought.
  const gunRank = (g: WeaponId) => WEAPONS[g].damage * WEAPONS[g].accuracy;
  const BEST_FIRST = [...GUNS].sort((x, y) => gunRank(y) - gunRank(x));
  const UNARMED: readonly CrewRole[] = ['collect', 'business', 'intimidation'];
  const gunsOf = (t: Team) => GUNS.reduce((sum, g) => sum + (t.weapons[g] ?? 0), 0);
  const gunLimit = (t: Team) => UNARMED.includes(roles.get(t.id) ?? 'collect') ? 0 : t.memberIds.length + 1;
  for (const team of crewsOf()) {
    const handed: string[] = [];
    while (gunsOf(team) > gunLimit(team)) {
      const worst = [...BEST_FIRST].reverse().find((g) => (team.weapons[g] ?? 0) > 0);
      if (!worst || !transferWeapon(w, gang.id, worst, team.id, false).ok) break;
      handed.push(worst);
    }
    if (handed.length) actions.push(`NOTE ${team.name} hands ${handed.join(', ')} to the store — ${gunLimit(team) ? `one gun per man (${gunLimit(team)})` : `the ${roles.get(team.id)} crew carries no guns`}`);
  }
  const armOrder: CrewRole[] = ['muscle', 'scout', 'recruit'];
  for (const team of crewsOf().filter((t) => gunLimit(t) > 0).sort((a, b) => armOrder.indexOf(roles.get(a.id) ?? 'collect') - armOrder.indexOf(roles.get(b.id) ?? 'collect') || a.id - b.id)) {
    const taken: string[] = [];
    while (gunsOf(team) < gunLimit(team)) {
      const best = BEST_FIRST.find((g) => (gang.weapons[g] ?? 0) > 0);
      if (!best || !transferWeapon(w, gang.id, best, team.id, true).ok) break;
      taken.push(best);
    }
    // A better gun in the store replaces the crew's worst one.
    for (;;) {
      const best = BEST_FIRST.find((g) => (gang.weapons[g] ?? 0) > 0);
      const worst = [...BEST_FIRST].reverse().find((g) => (team.weapons[g] ?? 0) > 0);
      if (!best || !worst || gunRank(best) <= gunRank(worst)) break;
      if (!transferWeapon(w, gang.id, worst, team.id, false).ok || !transferWeapon(w, gang.id, best, team.id, true).ok) break;
      taken.push(`${best} for a ${worst}`);
    }
    if (taken.length) actions.push(`NOTE ${team.name} takes ${taken.join(', ')} from the store`);
  }
  /** 1.2.30: a weapon for a crew — from the store first, bought only when the store has none (and `buy` allows it). One gun per man: a full crew trades its worst gun in. */
  const supply = (team: Team, item: WeaponId, canBuy: boolean): ApiResult => {
    if (GUNS.includes(item)) {
      if (gunLimit(team) === 0) return { ok: false, error: `the ${roles.get(team.id)} crew carries no guns` };
      if (gunsOf(team) >= gunLimit(team)) {
        const worst = [...BEST_FIRST].reverse().find((g) => (team.weapons[g] ?? 0) > 0);
        if (!worst || gunRank(worst) >= gunRank(item)) return { ok: false, error: 'every man already has a gun as good' };
        if (!transferWeapon(w, gang.id, worst, team.id, false).ok) return { ok: false, error: 'could not hand a gun in' };
      }
    }
    if ((gang.weapons[item] ?? 0) > 0) return transferWeapon(w, gang.id, item, team.id, true);
    if (!canBuy) return { ok: false, error: 'none in the store' };
    return buyWeapon(w, gang.id, item, team.id);
  };
  const muscleCrew = roleCrew('muscle');

  // 1.2.25 (Robert's rule): a lieutenant's own wanted level alone decides
  // whether his crew lies low — no cap on how many crews rest at once.
  const hotCrews = crewsOf().filter((team) => crewReady(w, team.id) && heatOfMan(team.lieutenantId) >= STREET_HEAT_REST && (w.people[team.lieutenantId]?.wanted ?? 0) >= REST_WANTED);
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
  const legalPush = officeRatio >= ratioLimit * 0.8;
  // 1.2.25 (B6): the forecast from our own books drives the legal push;
  // 1.2.26: on every city size.
  if (legalPush) actions.push(`B6 suspicion forecast: office/premises ${officeRatio.toFixed(1)} against a limit of ${ratioLimit.toFixed(1)} — legal premises and the accountant come first this week`);
  if (originalCity) actions.push(`SUSPICION ${Math.round(gang.suspicion)}${suspicionBefore != null ? ` (was ${Math.round(suspicionBefore)})` : ''} ratio: office takings $${Math.round(office)} / premises base $${premisesBase} = ${officeRatio.toFixed(1)} vs limit ${ratioLimit.toFixed(1)} (${accountantInt != null ? `accountant ${accountantInt.toFixed(1)}★` : 'no accountant'}) — rise about ${Math.max(0, Math.trunc((Math.trunc(officeRatio) - ratioLimit) * 2))} a week${legalPush ? '; legal premises and the accountant first' : ''}`);
  // Elsewhere, while suspicion is 50 or more, protection is collected only up to the cover left after the rackets.
  const collectBudget = !originalCity && gang.suspicion >= SUSPICION_LIE_LOW ? Math.max(0, coverEstimate - Math.max(0, gang.lastWeekIncome.illegal)) : Infinity;
  // Risky street work is capped so one raid cannot take the whole gang.
  const riskyCap = Math.max(2, Math.floor(Math.max(1, gangManpower(w, gang)) * (heat >= 1 ? RISKY_SHARE_EASING : RISKY_SHARE)));
  let riskyMen = 0;
  const outOfTime = new Set<number>();
  let timeShort = false;
  /** The crew with the most time left this week, skipping those already given this kind of job. */
  /**
   * 1.2.27 (man-hours): the minutes an order taking `men` men can still have —
   * the men-th freest man's free minutes, within the crew's free man-minutes
   * shared between them.
   */
  const freeFor = (team: Team, men = 1) => {
    const loads = crewLoads(w, team).sort((a, b) => a - b);
    if (!loads.length) return 0;
    const nth = MINUTES_PER_WEEK - loads[Math.min(Math.max(1, men), loads.length) - 1];
    return Math.max(0, Math.min(nth, crewFreeMinutes(w, team) / Math.max(1, Math.min(men, loads.length))));
  };
  const freest = (skip: Set<number> = new Set(), role?: CrewRole) => {
    const open = ready.filter((team) => !outOfTime.has(team.id) && !skip.has(team.id));
    const preferred = role ? open.find((team) => roles.get(team.id) === role && crewUsedShare(w, team) < 0.85) : undefined;
    return preferred ?? open.sort((a, b) => crewFreeMinutes(w, b) - crewFreeMinutes(w, a) || a.id - b.id)[0];
  };
  const give = (label: string, team: (typeof ready)[number] | undefined, input: Omit<IssueOrderInput, 'teamId'>, kind?: OrderKind): ApiResult => {
    if (!team) {
      actions.push(`NOTE ${label} skipped — every crew's week is full`);
      timeShort = true;
      return { ok: false, error: 'Every crew is busy this week.' };
    }
    const name = w.people[team.lieutenantId]?.name ?? 'crew';
    const risky = RISKY_ORDERS.has(input.type);
    // 1.2.25 (Robert's rule): every hood's own wanted level is checked before
    // any order — a man at the street-heat rest line takes no order at all.
    {
      const crewIds = [team.lieutenantId, ...team.memberIds];
      const atRest = crewIds.filter((id) => heatOfMan(id) >= STREET_HEAT_REST && (w.people[id]?.wanted ?? 0) >= REST_WANTED);
      if (atRest.length) {
        for (const id of atRest) heldForWanted.set(id, `${w.people[id]?.name ?? id} (wanted ${Math.round(w.people[id]?.wanted ?? 0)}, street heat ${Math.round(heatOfMan(id))}) — no orders`);
        actions.push(`NOTE ${label} not given to ${name}'s crew — ${atRest.map((id) => `${w.people[id]?.name ?? id} wanted ${Math.round(w.people[id]?.wanted ?? 0)}`).join(', ')} at the rest line`);
        return { ok: false, error: 'Too wanted — try elsewhere.' };
      }
    }
    // 1.2.25 (B10, hit points): a crew with a hurt man (hit points below full) takes no risky work this week.
    if (risky) {
      const hurt = [team.lieutenantId, ...team.memberIds].map((id) => w.people[id]).filter((p): p is Person => !!p && p.status === 'active' && p.hp < 100);
      if (hurt.length) {
        actions.push(`B10 ${label} not given to ${name}'s crew — hurt: ${hurt.map((p) => `${p.name} ${Math.round(p.hp)} hp`).join(', ')}`);
        return { ok: false, error: 'A man is hurt — try elsewhere.' };
      }
    }
    // 1.2.24 (Robert): each hood's own wanted level decides, to keep arrests down.
    // Risky work goes only to a crew with no wanted man in it (a crew whose
    // lieutenant is hot already lies low, and hot men rest in the pool); the
    // order is offered to another crew instead, or not given.
    if (risky) {
      const crewIds = [team.lieutenantId, ...team.memberIds];
      const hot = crewIds.filter((id) => (w.people[id]?.wanted ?? 0) >= WANTED_RISKY_HOLD);
      if (hot.length) {
        for (const id of hot) heldForWanted.set(id, `${w.people[id]?.name ?? id} (wanted ${Math.round(w.people[id]?.wanted ?? 0)}, street heat ${Math.round(heatOfMan(id))}) — no risky work`);
        actions.push(`NOTE ${label} not given to ${name}'s crew — ${hot.length} wanted m${hot.length === 1 ? 'an' : 'en'} (${hot.map((id) => `${w.people[id]?.name ?? id} wanted ${Math.round(w.people[id]?.wanted ?? 0)}`).join(', ')}); another crew or none`);
        return { ok: false, error: 'Too wanted — try elsewhere.' };
      }
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
    const men = Math.max(1, input.opts?.manpower ?? 1);
    const fits = kind === 'business' ? targets : targetsThatFit(timeLedger, key, targets, freeFor(team, men));
    if (fits === 0) {
      actions.push(`NOTE ${label} not given to ${name} — about ${timeLedger[key]} min a target, ${Math.round(freeFor(team, men))} min left for ${men} man/men`);
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
      const minutes = order?.estimatedMinutes || (team.timeUsed - usedBefore) / Math.max(1, order?.opts.manpower ?? 1);
      noteLedger(timeLedger, key, minutes / Math.max(1, order?.targetBuildingIds.length || 1));
    }
    return result;
  };
  /** Share of this crew's week still free. */
  const freeShare = (team: (typeof ready)[number]) => 1 - crewUsedShare(w, team);
  const manpowerFor = (team: (typeof ready)[number], most: number) => Math.max(1, Math.min(most, team.memberIds.length + 1));
  // Blocks we claim now (one standing business owned or protected, as the game counts them).
  const territoryBlocksNow = claimedTerritoryBlocks(w, gang.id);
  const claimOf = (blockId: number) => w.blocks[blockId]?.layout?.mergedInto ?? blockId;
  const blockIsOurs = (blockId: number) => territoryBlocksNow.has(claimOf(blockId));
  // 1.2.25 (no peeking): what our map shows — a site's owner only once our
  // scouts, a snitch or the papers have named him; a rival man only where the
  // map can place him (inside premises we know are his gang's).
  const seenRival = (b: Building) => { const o = buildingMapIntel(b, gang.id).ownerGangId; return o != null && o !== gang.id && !w.gangs[o]?.eliminated; };
  const visibleInside = (b: Building) => peopleList(w).find((p) => p.status === 'active' && p.gangId != null && p.gangId !== gang.id && p.role !== 'boss'
    && p.buildingId === b.id && personMapPosition(w, gang.id, p) != null);
  /** Blocks a rival visibly claims (one of his businesses there on our map). */
  const rivalClaimSeen = (blockId: number) => { const block = w.blocks[claimOf(blockId)]; return !!block && knownBlockOwners(w, block, gang.id).some((id) => id !== gang.id); };
  /** 1.2.25: where rival men were last reported seen (our own men's or our shops' sightings), newest first, as blocks. */
  const sightedBlocks = (gangId?: number) => {
    const out: number[] = [];
    for (let i = w.messages.length - 1; i >= 0; i--) {
      const m = w.messages[i];
      const p = m.personId != null ? w.people[m.personId] : undefined;
      if (!m.pos || !p || p.gangId == null || p.gangId === gang.id || (gangId != null && p.gangId !== gangId) || !gang.knownPeople.includes(p.id)) continue;
      const block = w.blocks.reduce((best, b) => (dist(b.center, m.pos!) < dist(best.center, m.pos!) ? b : best), w.blocks[0]);
      const id = claimOf(block.id);
      if (!out.includes(id)) out.push(id);
    }
    return out;
  };
  // ---- 1.2.23: the weekly decision loop. Every order below is put forward as
  // a candidate (what it is worth, of what kind, for which crew job); at the
  // end decideWeek scores them by the goal and gives each crew the best that fit.
  const proposals: Proposal<Team>[] = [];
  const propose = (p: Proposal<Team>) => { proposals.push(p); };
  /** Buildings put forward for a buy or a set-up this week (one order each). */
  const offered = new Set<number>();
  /** 1.2.25 (Robert): the reserve — three weeks of wages, at most RESERVE_CAP — used everywhere cash is kept back. */
  const cashReserve = Math.min(RESERVE_CAP, Math.round(wageBill * 3));
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
        label: `${label} ${site.typeId} (building ${site.id}, $${cost(site).toLocaleString('en-US')})`, kind: 'business', role: 'business', input,
        value: Math.max(50, worth(site)), why: blockIsOurs(site.blockId) ? 'block already ours' : 'a new block',
        onGiven: (team) => {
          const orderId = team.orderIds[team.orderIds.length - 1];
          const order = w.orders[orderId];
          desk.pending.push({ orderId, buildingId: site.id, teamId: team.id, type: input.type, estimate: order?.estimatedMinutes ?? 0, free: Math.round(freeFor(team)), week: w.week });
          const line = `NOTE business: ${label} ${site.typeId} (building ${site.id}) to ${team.name} — about ${order?.estimatedMinutes ?? '?'} min by the game's estimate, ${Math.round(freeFor(team))} min left for the freest man, ${Math.round(crewFreeMinutes(w, team))} man-min for the crew after it`;
          actions.push(line); noteDevDesk(line);
        },
      });
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
    // 1.2.25: the business crew lends nobody to another crew.
    const donor = ready.filter((t) => t.id !== team.id && roles.get(t.id) !== 'business' && t.memberIds.length >= 3 && !(shortCrews.get(w)?.has(t.id))).sort((a, b) => b.memberIds.length - a.memberIds.length)[0];
    const hood = donor?.memberIds.map((m) => w.people[m]).filter((p) => p && p.status === 'active' && p.orderId == null && !moveRefused(desk, p.id, team.id))[0];
    if (donor && hood) tryMove(hood.id, team.id, `move ${hood.name} to ${w.people[team.lieutenantId]?.name ?? 'crew'} (out of time last week)`);
  }

  const origin = hqCenter(w, gang.id);
  const nearer = (a: { lotId: number }, b: { lotId: number }) => dist(w.lots[a.lotId].center, origin) - dist(w.lots[b.lotId].center, origin);
  const hoodSites = chooseHoodRecruitSites(
    buildingList(w).filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === 'hood' && b.state !== 'destroyed').sort(nearer),
    recruitMemory,
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
    // 1.2.25 (no peeking): an agent we can see at the door of one of our rackets or its front — not the Bureau's own assignment list.
    const watchedSites = ours.concat(ours.map((b) => (b.frontId != null ? w.buildings[b.frontId] : undefined)).filter((b): b is Building => !!b && watched.has(b.id)));
    const agents = w.fbiIds.map((id) => w.people[id]).filter((a): a is NonNullable<typeof a> => !!a && a.status === 'active' &&
      watchedSites.some((b) => dist(a.pos, buildingDoor(w, b)) <= 30));
    if (agents.length && !lieLow) {
      const agent = agents[0];
      const total = (p: NonNullable<(typeof w.people)[number]>) => Object.values(p.skills).reduce((a, b) => a + b, 0);
      // 1.2.25: never a business crew hood, and each man's own wanted level is
      // checked (a killing is risky work: below WANTED_RISKY_HOLD, under the rest line).
      const hood = crewsOf().filter((team) => roles.get(team.id) !== 'business').flatMap((team) => team.memberIds).map((id) => w.people[id])
        .filter((p): p is NonNullable<typeof p> => !!p && p.status === 'active' && p.role === 'hood' && !restingMen.has(p.id)
          && p.wanted < WANTED_RISKY_HOLD && !(heatOfMan(p.id) >= STREET_HEAT_REST && p.wanted >= REST_WANTED))
        .sort((a, b) => total(a) - total(b) || a.id - b.id)[0];
      if (hood) {
        moveToPool(w, gang.id, hood.id);
        if ((gang.weapons.pistol ?? 0) < 1 && gang.cash > WEAPONS.pistol.cost) buyWeapon(w, gang.id, 'pistol');
        const result = issueStreetOrder(w, gang.id, [hood.id], 'kill', agent.id, null);
        logResult(actions, `FBI agent ${agent.name} at our ${agent.fbiAssignment ? `${agent.fbiAssignment.kind} site` : 'racket'} — ${hood.name} (expendable) sent to kill him; the FBI cannot be bought`, result.ok, result.ok ? '' : result.error);
        if (result.ok) { hitmen.add(hood.id); restingMen.add(hood.id); }
      } else actions.push(`NOTE FBI agent ${agent.name} at one of our rackets — no street hood clean enough to send`);
    } else if (agents.length) actions.push(`NOTE FBI agent ${agents[0].name} at one of our rackets — lying low, nobody sent`);
  }

  // The lawyer only does a lawyer's work (courts and officials, from the office) and
  // never goes on the street. A lost lawyer (arrested, jailed, dead or gone) is
  // replaced before anything else; with heat rising, he is hired early.
  const lawyerNow = gang.lawyerId == null ? undefined : w.people[gang.lawyerId];
  const lawyerLost = !lawyerNow || lawyerNow.gangId !== gang.id || ['arrested', 'onTrial', 'jailed', 'dead'].includes(lawyerNow.status);
  // 1.2.25 (Robert's rule): the lawyer and the accountant come only by
  // recruiting, as a player gets them. Below 3★ the crews keep recruiting to
  // swap him for a better one; from 3★ recruiting goes on; at 5★ it stops.
  // (No more hiring the cleverest free lawyer in the city straight off.)
  const specialistStars = (p: Person | undefined) => (p ? p.skills.intelligence : 0);
  const trialNow = Object.values(w.cases ?? {}).some((c) => c.gangId === gang.id && ['awaiting', 'onTrial'].includes(c.status));
  if (lawyerLost ? (w.week >= 4 || gang.suspicion >= 20 || gang.lawyerId != null) : specialistStars(lawyerNow) < 5) {
    const desks = buildingList(w).filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === 'lawyer' && b.state !== 'destroyed').sort(nearer);
    const desk = desks.length ? desks[w.week % desks.length] : undefined;
    if (lawyerLost && gang.lawyerId != null) actions.push(`NOTE lawyer ${lawyerNow?.name ?? ''} lost (${lawyerNow?.status ?? 'gone'}) — recruiting a new one first`);
    // 1.2.23: hoods come before the lawyer unless the law is already close.
    const urgent = trialNow || gang.suspicion >= 40 || (lawyerLost && gang.lawyerId != null);
    const why = !lawyerLost ? `ours is ${specialistStars(lawyerNow).toFixed(1)}★ — a better one swaps him` : urgent ? 'the law is close' : 'hoods first while the heat is low';
    const value = lawyerLost ? (urgent ? 2500 : 250) : specialistStars(lawyerNow) < 3 ? 400 : 150;
    if (desk) propose({ label: 'recruit lawyer', kind: 'safety', value, why,
      input: { type: 'recruit', buildingIds: [desk.id], opts: { manpower: 1, recruitAs: 'lawyer' } } });
    else actions.push('NOTE no lawyer\'s office to recruit at');
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
  // 1.2.25 (Robert's rule): the accountant as the lawyer — recruited, swapped below 3★, recruiting stops at 5★.
  const accountantNow = gang.accountantId == null ? undefined : w.people[gang.accountantId];
  const accountantLost = !accountantNow || accountantNow.gangId !== gang.id || accountantNow.status !== 'active';
  if (w.week >= 3 && (accountantLost || specialistStars(accountantNow) < 5)) {
    const desk = deskFor('accountant');
    // 1.2.23: after the hoods, unless suspicion is high (his books lower it).
    const value = !accountantLost ? (specialistStars(accountantNow) < 3 ? 400 : 150) : gang.suspicion >= SUSPICION_LIE_LOW || legalPush ? 6000 : gang.suspicion >= SUSPICION_BRIBE ? 1500 : 200;
    if (desk) propose({ label: 'recruit accountant', kind: 'safety', value, why: !accountantLost ? `ours is ${specialistStars(accountantNow).toFixed(1)}★ — a better one swaps him` : gang.suspicion >= SUSPICION_BRIBE ? `suspicion ${Math.round(gang.suspicion)}` : 'hoods first',
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
  // 1.2.25 (B7, court cases): the nearest trial first, the strongest case among equals.
  const urgentCases = [...openCases].sort((a, b) => a.weeksToTrial - b.weeksToTrial || b.strength - a.strength || a.id - b.id);
  if (urgentCases.length) actions.push(`B7 cases: ${urgentCases.map((c) => `${w.people[c.defendantId]?.name ?? c.defendantId} ${c.weeksToTrial} wk to trial, strength ${Math.round(c.strength)}${c.knowsWitnesses ? `, ${c.witnessIds.length} witnesses` : ''}${c.knowsJurors ? `, ${c.jurorIds.length} jurors` : ''}`).join('; ')}`);
  for (const c of urgentCases.slice(0, 2)) {
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
      // 1.2.25 (Robert's rule): recruiting runs every week — to fill any crew
      // below the most it can hold, and with every crew full to find better
      // men to swap in. Nothing holds it back: not wages or profit, not men
      // waiting in the pool, not lying low, not blocks gained. Managers never count.
      const men = crewMen();
      const crewRoom = gang.teamIds.length === 0 || crewsOf().some((team) => team.memberIds.length < MAX_TEAM_SIZE - 1);
      const floor = goal === 'territory' ? CREW_CAPACITY : Math.max(18, Math.round(10 + weight.hiring * 12), Math.min(60, Math.round(territoryCount(w, gang.id) * 2)));
      if (hoodSites.length) {
        // Several venues, one man each; with fewer crews than venues one crew walks several.
        // With every crew full only a replacement or two is sought, for the swaps.
        const venues = Math.min(hoodSites.length, !crewRoom ? 1 : shrinking || men < floor ? 4 : 2);
        if (recruitMemory.yieldedIds.includes(hoodSites[0].id)) actions.push('NOTE recruit: last week\'s productive venues first');
        else if (recruitMemory.hintIds.includes(hoodSites[0].id)) actions.push('NOTE recruit following last week\'s tip');
        // One proposal per crew's share of the venues; the loop spreads them.
        const parts = Math.max(1, Math.min(venues, ready.length));
        for (let k = 0; k < parts; k++) {
          const stops = hoodSites.slice(0, venues).filter((_, i) => i % parts === k).map((b) => b.id);
          if (!stops.length) continue;
          propose({ label: `recruit (${stops.length} stop${stops.length > 1 ? 's' : ''})`, kind: 'men', role: 'recruit', input: { type: 'recruit', buildingIds: stops, opts: { manpower: 1 } },
            value: (men < floor || shrinking || crewRoom ? 4000 : 1000) * stops.length, why: `${men} men${men < floor ? ` (below ${floor})` : ''}${crewRoom ? ', a crew has room' : ', crews full — better men to swap in'}` });
        }
      } else {
        actions.push(`NOTE no hiring place to try: every known venue came up empty ${EMPTY_VENUE_STREAK} weeks running and no rumour points at one`);
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
      // 1.2.25 (B4, B9): grievances and refusals read every week; a sore
      // shopkeeper is eased while campaigning or while our popularity is below zero.
      {
        const refusedLast = w.lastWeekOrders.filter((o) => o.gangId === gang.id && o.type === 'extort').reduce((n, o) => n + (o.refusals?.length ?? 0), 0);
        const sorest = owedAll.filter((b) => (b.protection?.grievance ?? 0) >= 1).length;
        if (refusedLast || sorest) actions.push(`B4 protection: ${refusedLast} refusal(s) last week, ${sorest} paying shop(s) with a grievance; popularity ${Math.round(gang.popularity)}${w.election.active ? ', election under way' : ''}`);
      }
      if ((campaign || gang.popularity < 0) && w.week >= 4) {
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
          const fit = Math.max(1, Math.min(share * 2, targetsThatFit(timeLedger, ledgerKey('collectProtection', hasCar), left.length, freeFor(team, 1)) || 1));
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
          // 1.2.25 (B3, police presence): the blocks with fewest police first, the nearest among equals.
          const policeIn = (b: Building) => w.blocks[b.blockId]?.policePresence ?? 0;
          for (const b of [...valid].sort((x, y) => policeIn(x) - policeIn(y) || nearer(x, y))) {
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
              propose({ label: `extort ${group.length} site(s), ${mark}`, kind: mark === 'new block' ? 'territory' : 'money', role: 'intimidation',
                // The first site carries the order; more sites add less (a crew's week is finite).
                value: (mark === 'new block' ? 900 + 250 * (group.length - 1) : 200 + 60 * (group.length - 1)) * (easing ? 0.5 : 1), why: marked,
                input: (team) => ({ type: 'extort', buildingIds: group.map((g) => g.id), opts: { manpower: manpowerFor(team, 2) } }) });
            }
          };
          take(newBlock, 'new block');
          take(deepen, 'already ours');
          if (!groups) actions.push('NOTE extortion: no valid target in a block we do not claim');
          else if (newBlock.length) actions.push(`B3 extortion: new blocks by police presence — ${newBlock.slice(0, 4).map((b) => `block ${b.blockId} ${w.blocks[b.blockId]?.policePresence ?? 0} police`).join(', ')}`);
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
          // 1.2.25 (B3): the blocks with fewest police first (the nearest among equals, as listed).
          const blockOrder = [...byBlock.keys()].sort((x, y) => (w.blocks[x]?.policePresence ?? 0) - (w.blocks[y]?.policePresence ?? 0));
          for (const blockId of blockOrder) {
            const sites = byBlock.get(blockId)!;
            if (groups >= crewsToSend) break;
            if ((easing || lieLow) && (w.blocks[blockId]?.crimeHeat ?? 0) >= hotLine && hotLine > 0) continue;
            groups++;
            const group = sites.slice(0, cap);
            const mark = blockIsOurs(blockId) ? 'already ours' : 'new block';
            propose({ label: `extort ${group.length} site(s), ${mark}`, kind: mark === 'new block' ? 'territory' : 'money', role: 'intimidation',
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
      // 1.2.25 (no peeking): the nearest business our map shows as a rival's.
      const rival = buildingList(w).filter((b) => seenRival(b) && !b.isHQ && b.state === 'trading').sort(nearer)[0];
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
    // 1.2.25 (Robert): one reserve everywhere — three weeks of wages, at most
    // RESERVE_CAP (plus any campaign fund).
    const keep = cashReserve + campaignReserve;
    actions.push(`NOTE reserve $${keep.toLocaleString('en-US')} (3 weeks' payroll, at most $${RESERVE_CAP.toLocaleString('en-US')}${campaignReserve ? ' + campaign' : ''}); $${Math.max(0, Math.round(gang.cash - keep)).toLocaleString('en-US')} to reinvest`);
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
      // 1.2.25: never the business crew (it only buys and sets up, and gets no truck).
      const street = ready.filter((t) => roles.get(t.id) !== 'business');
      const team = street.find((t) => (t.vehicles.truck ?? 0) > 0 && freeShare(t) > 0.15) ?? street.filter((t) => !outOfTime.has(t.id)).sort((a, b) => crewFreeMinutes(w, b) - crewFreeMinutes(w, a) || a.id - b.id)[0];
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
    // 1.2.25 (B2, last profit and stock): a kind of business ours lost money on last week is not set up again.
    const losing = new Set(owned().filter((b) => !b.isHQ && b.lastProfit < 0).map((b) => b.typeId));
    if (losing.size) actions.push(`B2 business: lost money last week — ${[...losing].join(', ')}; not set up again this week`);
    const bestType = (cash: number) => ESTABLISHABLE_TYPES.filter((t) => t.cost > 0 && t.cost <= cash && t.profit > 0 && !losing.has(t.id)).sort((a, b) => b.profit / b.cost - a.profit / a.cost)[0];
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
        // 1.2.25 (B3, squalor): among equal value the cleaner block first.
        .sort((a, b) => value(b) - value(a) || (w.blocks[a.blockId]?.squalor ?? 0) - (w.blocks[b.blockId]?.squalor ?? 0) || nearer(a, b));
      const got = planBuy(`reinvest: buy ${territoryGame ? 'toward new blocks' : 'legal'}`, candidates, undefined,
        (b) => profitOf(b) * 4 * (territoryGame && !blockIsOurs(b.blockId) ? 2 : 1) + 100, price, spareCash);
      spareCash -= got.reduce((sum, b) => sum + price(b), 0);
    }
    // 1.2.25 (B5, repair cost and fires): a damaged business of ours is
    // repaired when its repair cost fits the cash above the reserve.
    for (const b of owned().concat(buildingList(w).filter((x) => x.ownerGangId === gang.id && x.state === 'damaged')).filter((x, i, all) => all.indexOf(x) === i && x.state === 'damaged' && x.repairCompleteWeek == null)) {
      const fire = b.fireWeek != null ? `fire in week ${b.fireWeek}, ` : '';
      if (b.repairCost > gang.cash - keep) { actions.push(`B5 repair: ${b.typeId} #${b.id} damaged (${fire}repairs $${Math.round(b.repairCost)}) — waits for cash above the reserve`); continue; }
      const cost = Math.round(b.repairCost);
      const r = repairBuilding(w, gang.id, b.id);
      logResult(actions, `B5 repair ${b.typeId} #${b.id} (${fire}$${cost})`, r.ok, r.ok ? r.message ?? '' : r.error);
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
      const team = carless.sort((a, b) => crewFreeMinutes(w, a) - crewFreeMinutes(w, b))[0];
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
    // 1.2.25 (no peeking): premises our map shows as a rival's, the killer's first, a known HQ before others.
    const intel = (b: Building) => buildingMapIntel(b, gang.id);
    const suspect = buildingList(w).filter((b) => b.blockId === spot.blockId && b.cls !== 'empty' && seenRival(b) && b.state !== 'destroyed')
      .sort((a, b) => Number(intel(b).ownerGangId === killer?.id) - Number(intel(a).ownerGangId === killer?.id) || Number(intel(b).isHQ) - Number(intel(a).isHQ)
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
  const strikeCrews = (first: Team | undefined) => [...new Set([first, ...[...ready].filter((t) => t !== bizCrew && roles.get(t.id) !== 'business').sort((a, b) => crewFreeMinutes(w, b) - crewFreeMinutes(w, a))])]
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
        const inside = visibleInside(target);
        targetPersonId = undefined;
        if ((team.weapons.explosives ?? 0) > 0) return { type: 'bomb', buildingIds: [target.id], opts: { manpower: strikeMen } };
        if (inside) { targetPersonId = inside.id; return { type: 'kill', personId: inside.id, opts: { manpower: strikeMen } }; }
        return { type: 'smashUp', buildingIds: [target.id], opts: { manpower: strikeMen } };
      },
      onGiven: (team) => {
        const order = w.orders[team.orderIds[team.orderIds.length - 1]];
        noteDevDesk(`NOTE HQ strike on ${owner?.name}'s HQ (building ${target.id}): ${order?.type ?? '?'} by ${w.people[team.lieutenantId]?.name ?? 'crew'} with ${Math.round(crewFreeMinutes(w, team))} man-min of the week left after it, tommy ${team.weapons.tommy ?? 0}, explosives ${team.weapons.explosives ?? 0} — given`);
        desk.lastHqStrike = w.week;
        pendingActions.push({ key, orderId: team.orderIds[team.orderIds.length - 1], targetBuildingId: target.id, targetPersonId, cashBefore });
      },
      onSkipped: () => { const line = `HQ STRIKE not made on ${owner?.name}'s HQ: the fit crews' week was taken by better-scored orders`; actions.push(line); noteDevDesk(line); } });
  };
  const armFrom = (from: Team | undefined, to: Team) => {
    if (!from || from === to) return;
    for (const item of ['tommy', 'explosives'] as WeaponId[]) {
      while ((from.weapons[item] ?? 0) > 0 && (to.weapons[item] ?? 0) < (item === 'tommy' ? 2 : 1)) {
        if (!transferWeapon(w, gang.id, item, from.id, false).ok || !supply(to, item, false).ok) break;
        actions.push(`NOTE ${item} moved from ${w.people[from.lieutenantId]?.name ?? 'the strike crew'} to ${w.people[to.lieutenantId]?.name ?? 'crew'} (it has the time)`);
      }
    }
  };
  if (armed && suspects.size && policy.violence !== 'low') {
    // A heavily armed strike crew: tommy guns and explosives, bought first.
    for (const item of ['tommy', 'explosives'] as WeaponId[]) {
      if ((armed.weapons[item] ?? 0) >= 1 || gang.cash < reserve * 0.5 + WEAPONS[item].cost) continue;
      const result = supply(armed, item, true);
      logResult(actions, `arm the strike crew with ${item} (store first)`, result.ok, result.ok ? '' : result.error);
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
        const inside = target ? visibleInside(target) : undefined;
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
      const result = supply(armed, item, true);
      logResult(actions, `${item} for ${w.people[armed.lieutenantId]?.name ?? 'crew'} (store first)`, result.ok, result.ok ? '' : result.error);
    }
  }

  // ---- 1.2.22: rival headquarters, from what our own scouts have found.
  // The rival worth striking: in a territory game the weakest (by the power
  // graph), otherwise the strongest per man we know of (rich, thinly manned).
  const liveRivals = Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated);
  const knownMen = (g: Gang) => gang.knownPeople.filter((id) => w.people[id]?.gangId === g.id && w.people[id]?.status === 'active').length;
  // 1.2.25 (Robert): surplus = cash − the reserve (three weeks of wages) − $20,000.
  const surplusCash = Math.round(gang.cash - cashReserve - 20000);
  // Surplus spending (bribes, buys, the strongest rival's HQ) starts above SURPLUS_START.
  const surplus = surplusCash > SURPLUS_START;
  // Equipping keeps its own threshold (Robert: leave it for now): near-full crews and $30k, or $100k.
  const equipSurplus = (crewMen() >= CREW_CAPACITY * 0.85 && surplusCash > 30000) || surplusCash > 100000;
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
    // 1.2.25: nothing identified to look at — where their men (else any rival's) were last reported seen.
    if (!look.length) {
      const seen = sightedBlocks(priorityRival.id).concat(sightedBlocks());
      const block = seen.find((id) => buildingList(w).some((b) => claimOf(b.blockId) === id && unexplored(b)));
      if (block != null) { look = buildingList(w).filter((b) => claimOf(b.blockId) === block && unexplored(b)).sort(officeFirst); lookWhy = 'rival men seen in block'; }
    }
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
      // A pistol for every armed crew (1.2.30: collecting, business and
      // intimidation carry none; the recruiting crew only from the store).
      for (const team of ready) {
        const role = roles.get(team.id);
        if (gunLimit(team) === 0 || gunsOf(team) > 0) continue;
        if (role !== 'recruit' && (gang.weapons.pistol ?? 0) < 1 && gang.cash < reserve + WEAPONS.pistol.cost) break;
        if (role === 'recruit' && (gang.weapons.pistol ?? 0) < 1) continue;
        const result = supply(team, 'pistol', role !== 'recruit');
        logResult(actions, `arm ${w.people[team.lieutenantId]?.name ?? 'crew'}'s crew against ${enemy.name}`, result.ok, result.ok ? '' : result.error);
      }
      const striker = armed ?? freest(undefined, 'muscle');
      const theirMen = gang.knownPeople.map((id) => w.people[id]).filter((p): p is NonNullable<typeof p> => !!p && p.status === 'active' && p.gangId === enemy.id && p.role !== 'boss');
      const theirSites = buildingList(w).filter((b) => buildingMapIntel(b, gang.id).ownerGangId === enemy.id && !b.isHQ && b.state === 'trading').sort(nearer);
      if (striker && theirMen.length) {
        const victim = theirMen.sort((a, b) => (b.role === 'lieutenant' ? 1 : 0) - (a.role === 'lieutenant' ? 1 : 0) || a.id - b.id)[0];
        propose({ label: `retaliate: kill ${victim.name} of ${enemy.name}`, kind: 'violence', value: 1500, why: `${enemy.name} killed our men`, teams: strikeCrews(striker),
          input: (team) => ({ type: 'kill', personId: victim.id, opts: { manpower: manpowerFor(team, 3) } }) });
      } else if (striker && theirSites.length) {
        const site = theirSites[0];
        const dynamite = (striker.weapons.explosives ?? 0) > 0;
        propose({ label: `retaliate: ${dynamite ? 'bomb' : 'smash up'} ${enemy.name}'s ${site.typeId}`, kind: 'violence', value: 1500, why: `${enemy.name} killed our men`, teams: [striker],
          input: (team) => ({ type: dynamite ? 'bomb' : 'smashUp', buildingIds: [site.id], opts: { manpower: manpowerFor(team, 3) } }) });
      } else if (striker) {
        // 1.2.25: nothing of theirs on our map — scout where their men were last seen.
        const block = sightedBlocks(enemy.id)[0];
        const ids = block == null ? [] : buildingList(w).filter((b) => claimOf(b.blockId) === block && b.ownerGangId !== gang.id && b.state !== 'destroyed' && isValidAreaTarget(w, gang.id, 'explore', b))
          .sort((a, b) => (a.knowledge?.[gang.id] ?? 0) - (b.knowledge?.[gang.id] ?? 0) || nearer(a, b)).slice(0, 4).map((b) => b.id);
        if (ids.length) propose({ label: `scout block ${block} where ${enemy.name}'s men were seen`, kind: 'intel', value: 600, why: `${enemy.name} killed our men; nothing of theirs on our map`, role: 'scout',
          input: { type: 'explore', buildingIds: ids, opts: { manpower: 1 } } });
        else actions.push(`NOTE nothing of ${enemy.name}'s known to strike at and none of their men reported seen`);
      }
    }
  }

  // ---- the ranked action table: dice weighted by rank when men and cash are spare
  const spare = ready.filter((team) => freeShare(team) >= 0.35);
  if (w.week >= 3 && gangManpower(w, gang) >= 8 && spare.length && gang.cash > reserve) {
    const near = (b: Building) => nearTerritory(w, gang.id, b.blockId, 3);
    const rivalSites = buildingList(w).filter((b) => seenRival(b) && !b.isHQ && b.state === 'trading' && near(b)).sort(nearer);
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
      const crewRole: CrewRole = key === 'pressRefuser' ? 'intimidation' : 'muscle';
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
          const bought = supply(armed, item, true);
          logResult(actions, `HQ strike: ${item} (store first) for ${w.people[armed.lieutenantId]?.name ?? 'the strike crew'}`, bought.ok, bought.ok ? '' : bought.error);
        }
        proposeHqStrike(hqTarget, 2500, `rolled at rank ${actionRanks[key]}`, key);
        continue;
      } else if (key === 'strikeFbi') {
        targetPersonId = w.fbiHeadId; value = 200;
        input = (team) => ({ type: 'kill', personId: w.fbiHeadId, opts: { manpower: manpowerFor(team, 4) } });
      } else {
        // 1.2.25 (B8, rival men we have seen): the least dangerous of them — fewest firearms and fists.
        const danger = (p: Person) => p.skills.firearms * 2 + p.skills.fists;
        const victim = [...rivals].sort((a, b) => danger(a) - danger(b) || a.id - b.id)[0]; targetPersonId = victim.id;
        why = `${why}; B8 ${victim.name} firearms ${victim.skills.firearms.toFixed(1)}★, fists ${victim.skills.fists.toFixed(1)}★ — the least dangerous known`;
        input = (team) => ({ type: key === 'kidnapRival' ? 'kidnap' : 'kill', personId: victim.id, opts: { manpower: manpowerFor(team, 3) } });
      }
      const tb = targetBuildingId, tp = targetPersonId;
      propose({ label: ACTION_LABELS[key], kind, value, why, role: crewRole, teams, prepare, minFree, input,
        onGiven: (team) => { pendingActions.push({ key, orderId: team.orderIds[team.orderIds.length - 1], targetBuildingId: tb, targetPersonId: tp, cashBefore }); } });
    }
  }

  // ---- 1.2.23 surplus spending
  if (surplus) {
    actions.push(`NOTE surplus: $${surplusCash.toLocaleString('en-US')} (cash − reserve $${cashReserve.toLocaleString('en-US')} − $20,000) above $${SURPLUS_START.toLocaleString('en-US')} — bribes, buys by the business crew, the strongest rival's HQ`);
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
    // 1.2.25 (Robert's order), all by the business crew, no shares and no
    // site limit — what the surplus can pay for:
    //  (a) big buildings in blocks nobody claims; (b) 1–3 square businesses in
    //  blocks nobody claims that make good fronts; (c) 1–3 square businesses in
    //  blocks a rival claims. "Claims" is what our map shows. 1.2.26: size is
    //  the building's squares — a big building takes up the whole block (8 or
    //  9 squares: radio station, newspaper, big bank, department store); the
    //  others are 1 or 3 squares.
    // (1.2.24's bomb-then-buy is off: the game sells no bombed site.)
    const unclaimed = (b: Building) => !blockIsOurs(b.blockId) && !rivalClaimSeen(b.blockId);
    const forSale = (b: Building) => b.ownerGangId == null && b.state === 'trading' && (BUILDING_BY_ID[b.typeId]?.cost ?? 0) > 0 && buildingValue(w, b) > 0;
    const small = (b: Building) => ['commercial', 'industrial', 'tenement'].includes(b.cls) && (squaresOf(b) === 1 || squaresOf(b) === 3);
    // 1.2.30: only a business (commercial or industrial) can be a big building; a
    // tenement's economics record is the 8-square ring of a tenement block.
    const wholeBlock = (b: Building) => (b.cls === 'commercial' || b.cls === 'industrial') && (squaresOf(b) ?? 0) >= 8;
    const goodFront = (b: Building) => ILLEGAL_TYPES.some((t) => t.fronts?.includes(b.typeId));
    let left = surplusCash;
    const surplusBuy = (label: string, sites: Building[], worth: (b: Building) => number) => {
      const got = planBuy(label, sites, undefined, worth, (b) => buildingValue(w, b), left);
      left -= got.reduce((sum, b) => sum + buildingValue(w, b), 0);
      return got.length;
    };
    const big = buildingList(w).filter((b) => forSale(b) && unclaimed(b) && wholeBlock(b) &&
      (BUILDING_BY_ID[b.typeId]?.profit ?? 0) > 0 && purchasablePremisesType(b))
      .sort((a, b) => (BUILDING_BY_ID[b.typeId]?.profit ?? 0) - (BUILDING_BY_ID[a.typeId]?.profit ?? 0) || nearer(a, b));
    const nBig = surplusBuy('surplus (a): big building in an unclaimed block', big, (b) => (BUILDING_BY_ID[b.typeId]?.profit ?? 0) * 6 + 3000);
    const fronts = buildingList(w).filter((b) => forSale(b) && unclaimed(b) && small(b) && goodFront(b)).sort(nearer);
    const nFront = surplusBuy('surplus (b): front in an unclaimed block', fronts, (b) => (BUILDING_BY_ID[b.typeId]?.profit ?? 0) * 4 + 2000);
    const shared = buildingList(w).filter((b) => forSale(b) && !blockIsOurs(b.blockId) && rivalClaimSeen(b.blockId) && small(b)).sort(nearer);
    const nShared = surplusBuy('surplus (c): business in a rival\'s block', shared, (b) => (BUILDING_BY_ID[b.typeId]?.profit ?? 0) * 4 + 1000);
    actions.push(`NOTE surplus buys put forward: ${nBig} big building(s), ${nFront} front(s), ${nShared} in rival blocks (of ${big.length}/${fronts.length}/${shared.length} for sale) — $${Math.max(0, Math.round(left)).toLocaleString('en-US')} of the surplus left`);
    if (hqTarget && armed && policy.violence !== 'low' && !lieLow && w.week - desk.lastHqStrike >= HQ_STRIKE_GAP && !proposals.some((p) => p.label.startsWith('HQ strike'))) {
      for (const item of ['tommy', 'tommy', 'explosives'] as WeaponId[]) {
        if ((armed.weapons[item] ?? 0) >= (item === 'tommy' ? 2 : 1) || gang.cash < reserve + WEAPONS[item].cost) continue;
        const bought = supply(armed, item, true);
        logResult(actions, `surplus: ${item} for the HQ strike (store first)`, bought.ok, bought.ok ? '' : bought.error);
      }
      proposeHqStrike(hqTarget, 3000, `surplus cash; ${w.gangs[hqTarget.ownerGangId!].name} is the strongest rival we know of (power ${powerRating(w, w.gangs[hqTarget.ownerGangId!])})`, 'strikeHQ');
    } else if (!hqTarget) actions.push(`NOTE surplus: no rival HQ known yet — scouting for ${priorityRival?.name ?? 'one'}`);
    else if (!proposals.some((p) => p.label.startsWith('HQ strike'))) {
      actions.push(`HQ STRIKE not made on ${w.gangs[hqTarget.ownerGangId!].name}'s HQ: ${!armed ? 'no armed strike crew ready' : policy.violence === 'low' ? 'violence is off for this goal' : lieLow ? `lying low (suspicion ${Math.round(gang.suspicion)})` : `last strike in week ${desk.lastHqStrike}, the next after ${HQ_STRIKE_GAP} weeks`}`);
    }
  }

  // ---- 1.2.23: the decision. Every candidate is scored by the goal and the
  // best that fit go to the crews; the log says why each won or was not given.
  const crewName = (team: Team) => `${w.people[team.lieutenantId]?.name ?? 'crew'} (${named.get(team.id) ?? team.name})`;
  const slots = ready.map((team) => ({ team, name: crewName(team), role: roles.get(team.id), businessOnly: team === bizCrew,
    free: () => outOfTime.has(team.id) ? 0 : freeFor(team) }));
  const decision = decideWeek(goal, proposals, slots, (label, team, p) => {
    const input = inputFor(p, team);
    const site = input.buildingIds?.[0];
    if (p.kind === 'business' && site != null && !buyAllowed(desk, team.id, site)) return { ok: false, error: 'this crew failed there before — retry elsewhere' };
    return give(label, team, input, p.kind);
  });
  actions.push(`DECIDE ${proposals.length} candidate orders for ${slots.length} crews (goal ${goal}): ${decision.given.length} given, ${decision.skipped.length} not`);
  for (const d of decision.given) actions.push(d.line);
  for (const d of decision.skipped) actions.push(d.line);
  {
    const restingNow = [...(resting.get(w) ?? [])].map((id) => w.people[id]).filter((p): p is Person => !!p);
    for (const p of restingNow) if (!heldForWanted.has(p.id)) heldForWanted.set(p.id, `${p.name} (wanted ${Math.round(p.wanted)}, resting in the pool)`);
    for (const team of hotCrews) for (const id of [team.lieutenantId, ...team.memberIds]) {
      const p = w.people[id];
      if (p && !heldForWanted.has(id)) heldForWanted.set(id, `${p.name} (crew lying low, lieutenant's street heat ${Math.round(heatOfMan(team.lieutenantId))})`);
    }
    actions.push(`WANTED held back ${heldForWanted.size} hood${heldForWanted.size === 1 ? '' : 's'}${heldForWanted.size ? `: ${[...heldForWanted.values()].join('; ')}` : ''}`);
  }
  noteDevDesk(`DECIDE ${decision.given.length} of ${proposals.length} given`);
  // 1.2.23: no crew sits at 0 orders without a reason in the log.
  for (const slot of slots) {
    const team = slot.team;
    if (team.orderIds.some((id) => w.orders[id]?.gangId === gang.id)) continue;
    const mine = proposals.filter((p) => slot.businessOnly ? p.kind === 'business' : p.kind !== 'business');
    const reason = slot.free() < MIN_FREE_MINUTES ? `its week is full (${Math.round(freeFor(team))} min left for the freest man${outOfTime.has(team.id) ? ', refused for time' : ''})`
      : slot.businessOnly && !mine.length ? `business crew: nothing to buy or set up within $${Math.round(Math.max(0, gang.cash)).toLocaleString('en-US')} cash this week`
      : !mine.length ? 'no candidate order this week'
      : lieLow ? `lying low (suspicion ${Math.round(gang.suspicion)}) — the ${mine.length} candidate(s) went to other crews or were refused`
      : `the ${mine.length} candidate(s) went to better-placed crews or were refused`;
    actions.push(`NOTE ${slot.name} has no order: ${reason}`);
  }

  // ---- 1.2.24: surplus cash equips the crews (Robert). After the reserve and
  // this week's buys, everything left goes on cars and guns, strongest crews
  // first: a seat for every man, then the best gun for every man. Collectors
  // (1.2.30) the business and intimidation crews carry no guns but get cars,
  // as many as each crew wants.
  if (equipSurplus) {
    const committed = desk.pending.filter((p) => p.week === w.week).reduce((sum, p) => {
      const order = w.orders[p.orderId];
      const b = w.buildings[p.buildingId];
      const type = order?.opts.businessTypeId ? BUILDING_BY_ID[order.opts.businessTypeId] : undefined;
      return sum + (type ? type.cost : b && p.type === 'buyPremises' ? buildingValue(w, b) : 0);
    }, 0);
    const keep = cashReserve + campaignReserve + committed;
    const before = gang.cash;
    const strength = (t: Team) => [t.lieutenantId, ...t.memberIds].reduce((sum, id) => { const p = w.people[id]; return sum + (p ? Object.values(p.skills).reduce((a, b) => a + b, 0) : 0); }, 0);
    const crews = crewsOf().sort((a, b) => strength(b) - strength(a) || a.id - b.id);
    const bought: string[] = [];
    const afford = (cost: number) => gang.cash - cost >= keep;
    for (const t of crews) {
      const men = t.memberIds.length + 1;
      let seats = (Object.entries(t.vehicles) as [keyof typeof VEHICLES, number][]).reduce((sum, [id, n]) => sum + (VEHICLES[id]?.capacity ?? 0) * (n ?? 0), 0);
      // 1.2.30 (Robert): every crew may have as many cars as it wants.
      while (seats < men && afford(VEHICLES.coupe.cost)) {
        if (!buyVehicle(w, gang.id, 'coupe', t.id).ok) break;
        seats += VEHICLES.coupe.capacity; bought.push(`coupe for ${w.people[t.lieutenantId]?.name ?? 'crew'}`);
      }
    }
    // 1.2.30: one gun per man, store guns first (taken above); only the rough
    // and scouting crews get guns bought — collecting, business and
    // intimidation carry none and the recruiting crew only takes store guns.
    const BEST_GUN = BEST_FIRST[0];
    for (const t of crews) {
      const role = roles.get(t.id);
      if (gunLimit(t) === 0 || role === 'recruit') continue;
      while (gunsOf(t) < gunLimit(t) && ((gang.weapons[BEST_GUN] ?? 0) > 0 || afford(WEAPONS[BEST_GUN].cost))) {
        const fromStore = (gang.weapons[BEST_GUN] ?? 0) > 0;
        if (!supply(t, BEST_GUN, true).ok) break;
        bought.push(`${BEST_GUN} for ${w.people[t.lieutenantId]?.name ?? 'crew'}${fromStore ? ' (from the store)' : ''}`);
      }
      if (role === 'muscle' && (t.weapons.explosives ?? 0) < 2 && ((gang.weapons.explosives ?? 0) > 0 || afford(WEAPONS.explosives.cost)) && supply(t, 'explosives', true).ok) bought.push(`explosives for ${w.people[t.lieutenantId]?.name ?? 'crew'}`);
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

/**
 * 1.2.25: the sizes of everything that lives from week to week outside the
 * save (the save itself stays ~13 MB while the heap grew 60 MB a week on
 * 40 × 32), so the next long report shows which one grows.
 */
function memorySizesLine(sim: Sim, actions: readonly string[]): string {
  const w = sim.world;
  const count = (o: object | undefined) => (o ? Object.keys(o).length : 0);
  const journal = devJournalWeeks();
  const desk = deskMemory(w);
  const actionChars = actions.reduce((n, line) => n + line.length, 0);
  return `SIZES people ${count(w.people)} (next id ${w.nextId}), buildings ${count(w.buildings)}, orders ${count(w.orders)}, last week's orders ${w.lastWeekOrders.length}, `
    + `cases ${count(w.cases)}, specialist jobs ${count(w.specialistJobs)}, messages ${w.messages.length}, news ${w.news.length}, losses ${memberLosses(w).length}, `
    + `journal ${journal.length} weeks / ${Math.round(journal.reduce((n, s) => n + s.length, 0) / 1024)} KB, stop traces ${peekStopTraces().length}, `
    + `report ${actions.length} lines / ${Math.round(actionChars / 1024)} KB, desk ${desk.fails.size}/${desk.dropped.size}/${desk.failedPairs.size}/${desk.refusedMoves.size}, venues ${recruitMemory.emptyStreak.size}`;
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
    actions.push(memorySizesLine(sim, actions));
    // 1.2.28: what lives outside the world state, every week.
    actions.push(memProbeLine({ reportLines: actions.length, weeks: weeks.length, notes: notes.length, resultsSaid: resultsSaid.size, lostTally: lostTally.size }));
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
    rememberRecruitResults(sim.world.lastWeekOrders.filter((order) => order.gangId === sim.playerGang.id));
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
    // 1.2.28: past 2 GB of used heap, save the report so far and the probe
    // lines at once (so they survive a crash), then pause the run.
    if (memory.heap && memory.heap.used > HEAP_EVIDENCE_BYTES) {
      const file = instanceFile(`memory-evidence-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
      const evidence = [
        `Memory evidence: used heap ${formatHeapMb(memory.heap)} of ${Math.round(memory.heap.limit / 1048576)} MB after week ${sim.world.week - 1}.`,
        `City ${sim.world.gridW}×${sim.world.gridH}, city seed ${sim.world.options.seed}, Auto Test seed ${settings.seed}.`,
        '', 'Timeline',
        ...weeks.map((week) => `Week ${week.week}: cash ${week.cash} men ${week.men} end-week ${week.ms} ms save ${week.saveBytes} bytes${week.heapUsed != null && week.heapTotal != null ? ` heap ${formatHeapMb({ used: week.heapUsed, total: week.heapTotal })}` : ''}`),
        '', 'Memory lines',
        ...actions.filter((line) => line.startsWith('MEMPROBE') || line.startsWith('SIZES') || line.startsWith('-- week')),
        '', 'Actions so far',
        ...actions,
      ].join('\n');
      try {
        const parts = splitReport(evidence);
        for (let k = 0; k < parts.length; k++) await writeReportFile(parts.length === 1 ? file : file.replace(/\.txt$/, `-part${k + 1}of${parts.length}.txt`), parts[k]);
        notes.push(`Paused: used heap passed 2 GB after week ${sim.world.week - 1} (${formatHeapMb(memory.heap)}). The report so far and the memory probe were saved to ${file}.`);
      } catch (error) {
        notes.push(`Paused: used heap passed 2 GB after week ${sim.world.week - 1}; the evidence file could not be written (${error instanceof Error ? error.message : String(error)}).`);
      }
      stoppedThisRun = true;
      break;
    }
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
