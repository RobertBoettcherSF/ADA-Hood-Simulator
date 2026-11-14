import { learnedBlock } from './diary';
import { moveSlot, slotLayout } from '../ui/lieutenantSlots';
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
import { setDiplomacy, buySnitchInfo, canGoStraight, repairBuilding, setPay, shutdownBuilding, setGoStraight, setRunForOffice, buyVehicle, buyWeapon, hireRecruit, issueOrder, issueStreetOrder, previewOrder, demote, moveToPool, moveToTeam, nearTerritory, promote, sackPerson, transferVehicle, transferWeapon, sellWeapon, stationPoolHood, stockOfficeStash, recallManager, retimeCrew, toggleEvadeTax, assignStaffVehicle, interrogatePrisoner, killPrisoner, releasePrisoner, type ApiResult, type IssueOrderInput } from '../sim/api';
import { ACTION_KEYS, ACTION_LABELS, assignCrewRoles, BASIC_CREWS, CREW_OPENING_ORDER, carMinutesSaved, crewNames, roleStars, roleCompare, UNUSED_SKILLS, defaultActionRanks, judgeAction, loadActionRanks, raidValue, rankDown, rankUp, rollAction, type ActionKey, type ActionRanks, type CrewRole, type PendingAction } from './autoActions';
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
import { buildingList, peopleList } from '../sim/entityLists';
import { MAX_TEAM_SIZE, MAX_TEAMS, MINUTES_PER_WEEK } from '../sim/constants';
import { crewFreeMinutes, crewHasTime, crewLoads, crewMen as crewMenReady, crewUsedShare } from '../sim/crewTime';
import { readyForPlanning } from '../sim/orderStaffing';
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
import { armedPoolDefenders, isGangOffice } from '../sim/officeDefence';
import { hireQuote } from '../sim/originalWages';
import { newspaperEdition } from '../sim/newspaper';
import { accountantSkillByte, taxNotCoveredUp } from '../sim/systems/taxes';
import { CRIME_ROW_SUSPICION, EVADE_TAX_SUSPICION, FBI_CASE_THRESHOLD, HEAVY_CRIME_SUSPICION, MEMBER_WARRANT_BAR } from '../sim/systems/fbi';
import { donationTarget } from '../sim/charity';
import { fireRate, originalFireOdds } from '../sim/fireRoll';
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
/** 1.2.21: eight lieutenants with nine hoods each — the most men the crews can use. */
const CREW_CAPACITY = MAX_TEAMS * MAX_TEAM_SIZE;
/** 1.2.25: weeks of losses looked back over to size the spare hoods kept in the pool. */
const SPARE_LOSS_WEEKS = 4;
/** 1.2.36 (Robert): a lead or a manager is swapped only for 0.5★ or more in the skill that counts. */
const LEAD_SWAP_GAIN = 0.5;
/** 1.2.37 (Robert): hoods under this intelligence are armed last (never in Collect or Business) and go to the Expendables. */
const LOW_INT = 2.5;
/** 1.2.38 (Robert): what a man's skills no crew uses count against him (wage cost): WAGE_DRAG × their average. */
const wageDrag = (p: Person) => UNUSED_SKILLS.length ? WAGE_DRAG * UNUSED_SKILLS.reduce((sum, k) => sum + (p.skills[k] ?? 0), 0) / UNUSED_SKILLS.length : 0;
/** 1.2.37 (Robert): a manager is swapped only when the estimated takings rise by this share or more. */
const MANAGER_SWAP_GAIN = 0.1;
/** 1.2.43 (Robert): strong only at this many times the combined men of the gangs at war or aggressive with us. */
const STRONG_MEN_FACTOR = 1.2;
/** 1.2.43 (Robert): this many of our men killed by rivals… */
const LOSS_DEFENCE_KILLS = 5;
/** …within this many weeks… */
const LOSS_WINDOW_WEEKS = 4;
/** …puts us on defence for this many weeks. */
const LOSS_DEFENCE_WEEKS = 4;
/** 1.2.43 (Robert): after this many empty recruit weeks the runs move to new blocks… */
const RECRUIT_MOVE_WEEKS = 4;
/** …and to venues not tried in this many weeks. */
const RECRUIT_FRESH_WEEKS = 8;
/** 1.2.37: the HQ strike's value when the gang is strong enough — above every other order. */
const HQ_FIRST_VALUE = 6000;
/** A racket the gang is saving for: other premises wait until its cost is in hand. */
const savingFor = new WeakMap<Sim['world'], { name: string; cost: number }>();

/** Suspicion at which the desk starts paying the police chief and easing the extortion (1.2.19: 30, was 40). */
const SUSPICION_BRIBE = 30;
/** 1.2.25 (Robert): the cash reserve is three weeks of wages, at most this much. */
const RESERVE_CAP = 50_000;
/** 1.2.25 (Robert): surplus spending starts once the surplus is above this. */
const SURPLUS_START = 50_000;
/** 1.2.23: a strike goes only to a crew with this much of its week left. */
const STRIKE_MIN_FREE = 240;
/** 1.2.24: an HQ attack needs a crew of at least this many men (lieutenant included), explosives and its whole week free. */
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
/** 1.2.36: the attack crew's reserved store stock (bought for it, or handed in by it); no other crew takes it. */
const attackReserve = new WeakMap<Sim['world'], Partial<Record<WeaponId, number>>>();
/** 1.2.36: manager swaps under way, by site — the Run Business order, the hood named and the manager he replaces. */
/** 1.2.37: the attack crew and its weapons when Auto last looked, so a crew broken up (lead swap, demote, a dead lieutenant) keeps its guns reserved. */
const attackHeld = new WeakMap<Sim['world'], { teamId: number; weapons: Partial<Record<WeaponId, number>> }>();
/** 1.2.38 (Robert): the last week each rival was answered (at most one retaliation per rival per RETALIATE_GAP weeks). */
const retaliatedAt = new WeakMap<Sim['world'], Map<number, number>>();
const RETALIATE_GAP = 3;
/** 1.2.38 (Robert): no retaliation after a week with this many of our men killed. */
const RETALIATE_LOSS_STOP = 3;
/** 1.2.38 (Robert): retaliation needs the striking crew at this many attack stars. */
const RETALIATE_STARS = 3;
/** 1.2.38 (Robert): a crew with a car keeps a man with this much driving. */
const DRIVER_STARS = 3;
/** 1.2.38: how much skills no crew uses count against a man when firing or picking from the pool (open question). */
const WAGE_DRAG = 0.1;
/** 1.2.39 (Robert): pool hoods kept on top of the spares to defend the office (they wait inside it). */
const POOL_DEFENDERS = 10;
/** 1.2.39 (Robert): Attack and Expendables each aim for this many men with FIREARMS_QUOTA_STARS★ firearms. */
const FIREARMS_QUOTA = 2;
const FIREARMS_QUOTA_STARS = 3.5;
/** 1.2.40 (Robert): week-to-week memories for the 1.2.40 rules. */
const v140 = new WeakMap<Sim['world'], {
  /** Rival men we identified: last sighting (message minute, place, block) and whether he left our list. */
  seen: Map<number, { name: string; gangId: number; minute: number; pos: { x: number; y: number } | null; block: number | null; missing: boolean; dead: boolean }>;
  lastMsgId: number;
  chiefBand?: string; mayorBand?: string;
  /** Heavy-crime points per man of ours, as the FBI files them (fading a tenth a week). */
  heat: Map<number, number>;
  /** Weeks the accountant held tax back (week numbers). */
  evadedWeeks: number[];
  audited: Set<number>;
  skimmers: Set<number>;
  /** Weeks running each site of ours traded with no profit. */
  noProfit: Map<number, number>;
  /** Refusers: the step taken last (1 intimidate, 2 smash up). */
  refuser: Map<number, number>;
  lastOfficeTrouble: number;
  /** Prisoners who have nothing left to tell. */
  drained: Set<number>;
  /** The accountant the FBI said it wants for tax evasion. */
  warrantAcct?: number;
  /** 1.2.41: empty lawyer/accountant search weeks in a row. */
  specEmpty: Map<string, number>;
  /** 1.2.41: refusers kept until they pay or we buy the shop (building id → first refusal week). */
  refusers: Map<number, number>;
  /** 1.2.42: the week each lawyer/accountant search paused. */
  specPausedAt?: Map<string, number>;
  /** 1.2.42: weeks running each crew has had only its lieutenant. */
  loneWeeks?: Map<number, number>;
  /** 1.2.42: weeks running our hood recruit runs came back empty. */
  dryRecruitWeeks?: number;
  /** 1.2.42: rival men dropped from the sightings once off our list for good (still counted as gone). */
  seenGone?: number;
  /** 1.2.42: our last lawyer and accountant (role → person id), to say how one was lost. */
  staffSeen?: Map<string, number>;
  /** 1.2.43: on defence through this week (heavy losses). */
  defenceUntil?: number;
  /** 1.2.43: hood venue → the last week our recruiters tried it. */
  venueTried?: Map<number, number>;
}>();
/** 1.2.42 (Robert): weeks running a crew may have only its lieutenant before it is broken up. */
const LONE_LIEUTENANT_WEEKS = 2;
/** 1.2.42 (Robert): weeks of empty recruit runs before a manager is pulled back into a crew. */
const RECRUIT_DRY_WEEKS = 4;
/** 1.2.42 (Robert): a buy or set-up never leaves the crew below this many men. */
const MIN_CREW_AFTER_MANAGER = 3;
/** 1.2.42 (Robert): the in-memory Auto Test report keeps this many weeks. */
const REPORT_WEEKS_KEPT = 60;
/** 1.2.42 (Robert): a heap check is logged every this many weeks. */
const HEAP_CHECK_WEEKS = 100;
/** 1.2.41 (Robert): a lawyer or accountant search pauses after this many empty weeks. */
const SPECIALIST_EMPTY_WEEKS = 3;
/** 1.2.42 (Robert): a paused search restarts after this many weeks when ours is 3★… */
const SPEC_RESTART_3 = 4;
/** …and after this many at 4★. */
const SPEC_RESTART_4 = 5;
/** 1.2.42 (Robert): at this many stars or more the search stops for good. */
const SPEC_STOP_STARS = 4.5;
/** 1.2.41 (Robert): pool hoods kept armed inside each office of ours besides the HQ. */
const EXTRA_OFFICE_DEFENDERS = 5;
/** 1.2.41 (Robert): a new office goes this many map blocks (grid distance) from an office of ours. */
const OFFICE_SPACING_BLOCKS = 15;
/** 1.2.41 (Robert): the chief bought by a rival — we offer this share of the sum. */
const CHIEF_OUTBID = 1.2;
/** 1.2.40/41 (Robert): pool hoods kept as office defenders — the HQ's 10 plus 10 per war, 5 more at each other office. */
function officeDefendersWanted(w: Sim['world'], gang: Sim['world']['gangs'][number], wars: number): number {
  const extra = Object.values(w.buildings).filter((b) => isGangOffice(b, gang.id) && !b.isHQ).length;
  return POOL_DEFENDERS + DEFENDERS_PER_WAR * wars + EXTRA_OFFICE_DEFENDERS * extra;
}
/** 1.2.40 (Robert): office defenders kept per rival at war with us, on top of POOL_DEFENDERS. */
const DEFENDERS_PER_WAR = 10;
/** 1.2.40 (Robert): Guard Office ends after this many weeks with no attack on the office. */
const OFFICE_QUIET_WEEKS = 3;
/** 1.2.40 (Robert): a weapon kind is sold down to this many in the cache. */
const CACHE_SELL_ABOVE = 50;
/** 1.2.40 (Robert): premises with no profit this many weeks running are shut down. */
const NO_PROFIT_WEEKS = 3;
/** 1.2.40 (Robert): a rival whose assets top ours this many weeks running is pulled down. */
const ASSET_LEAD_WEEKS = 2;
/** 1.2.40: the game's own bands (the Lawyer tab): friendly above +20, hostile below −20. */
const opinionBand = (v: number) => v > 20 ? 'friendly' : v < -20 ? 'hostile' : 'neutral';
const BAND_RANK: Record<string, number> = { hostile: 0, neutral: 1, friendly: 2 };
/** 1.2.40: the squealer line the Lawyer tab uses (opinion below −40). */
const SQUEALER_OPINION = -40;
/** 1.2.40: the FBI's zeal is 128 plus up to 79 (fbi.ts fbiZeal); the worst case. */
const ZEAL_WORST = 128 + 79;
/** 1.2.40: held-back tax above this draws the FBI to our premises (the Accountant tab says so). */
const TAX_POOL_LINE = 2000;
/**
 * 1.2.38 (Robert): guns ranked by the game's real hit and kill tables
 * (fireRoll.ts), not damage × accuracy. A reference shooter (3★ firearms)
 * against a reference hood (2.5★ stealth): the chance one attempt kills,
 * averaged over the range bands of the job (one band = a fifth of a block).
 * Inside (kills, raids, bombs inside premises): bands 0–1; on the street and
 * in ambushes: bands 2–6.
 */
const GUN_IDS: WeaponId[] = ['pistol', 'shotgun', 'rifle', 'tommy', 'twinPistols'];
const REF_SHOOTER = { role: 'hood', skills: { firearms: 3, stealth: 3 } } as unknown as Person;
const REF_TARGET = { role: 'hood', skills: { firearms: 2.5, stealth: 2.5 } } as unknown as Person;
const killPerAttempt = (g: WeaponId, bands: number[]) => bands.reduce((sum, band) => {
  const o = originalFireOdds(REF_SHOOTER, REF_TARGET, g as Exclude<WeaponId, 'explosives'>, (band + 0.5) * 10.8, fireRate(g as Exclude<WeaponId, 'explosives'>));
  return sum + o.hit * o.killGivenHit;
}, 0) / bands.length;
type GunJob = 'inside' | 'street';
const GUN_SCORE: Record<GunJob, Record<string, number>> = {
  inside: Object.fromEntries(GUN_IDS.map((g) => [g, killPerAttempt(g, [0, 1])])),
  street: Object.fromEntries(GUN_IDS.map((g) => [g, killPerAttempt(g, [2, 3, 4, 5, 6])])),
};
const GUN_ORDER: Record<GunJob, WeaponId[]> = {
  inside: [...GUN_IDS].sort((a, b) => GUN_SCORE.inside[b] - GUN_SCORE.inside[a]),
  street: [...GUN_IDS].sort((a, b) => GUN_SCORE.street[b] - GUN_SCORE.street[a]),
};
const swapsPending = new WeakMap<Sim['world'], Map<number, { orderId: number; candId: number; oldId: number; week: number }>>();
/** 1.2.36: a snitch who had nothing new, and what we knew then; he is not asked again until that changes. */
const snitchDry = new WeakMap<Sim['world'], { key: string; week: number; dead: number }>();
/** 1.2.37 (Robert, open): weeks after which a dry snitch is asked again (rivals have likely hired); half that after rival men we know of died. */
const SNITCH_RETRY_WEEKS = 4;
/** 1.2.36: the job's name in the log (the 'muscle' crew is the attack crew). */
const jobName = (role: CrewRole | undefined) => role === 'muscle' ? 'attack' : role ?? 'collect';

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
  // 1.2.40 (Robert): what we have seen of rival men, from our own messages,
  // news and reports only — never their true state. A man who leaves our
  // identified list is "missing" (his last sighting kept); he is dead only
  // once a message, a news item or one of our reports says so.
  const mem: NonNullable<ReturnType<typeof v140.get>> = v140.get(w) ?? { seen: new Map(), lastMsgId: -1, heat: new Map(), evadedWeeks: [], audited: new Set<number>(), skimmers: new Set<number>(), noProfit: new Map(), refuser: new Map(), lastOfficeTrouble: -Infinity, drained: new Set<number>(), specEmpty: new Map(), refusers: new Map(), specPausedAt: new Map(), loneWeeks: new Map(), dryRecruitWeeks: 0 };
  v140.set(w, mem);
  const freshMsgs = w.messages.filter((m) => m.id > mem.lastMsgId);
  {
    const blockAt = (pos: { x: number; y: number }) => { const b = w.blocks.reduce((best, k) => (dist(k.center, pos) < dist(best.center, pos) ? k : best), w.blocks[0]); return b.layout?.mergedInto ?? b.id; };
    const fresh = freshMsgs;
    for (const m of fresh) {
      const p = m.personId != null ? w.people[m.personId] : undefined;
      if (!p || p.gangId == null || p.gangId === gang.id || !gang.knownPeople.includes(p.id)) continue;
      mem.seen.set(p.id, { name: p.name, gangId: p.gangId, minute: m.minute, pos: m.pos ? { x: m.pos.x, y: m.pos.y } : null, block: m.pos ? blockAt(m.pos) : null, missing: false, dead: false });
    }
    for (const m of w.messages) if (m.id > mem.lastMsgId) mem.lastMsgId = m.id;
    for (const id of gang.knownPeople) {
      const p = w.people[id];
      if (!p || p.gangId == null || p.gangId === gang.id) continue;
      const had = mem.seen.get(id);
      if (!had) mem.seen.set(id, { name: p.name, gangId: p.gangId, minute: -1, pos: null, block: null, missing: false, dead: false });
      else { had.missing = false; had.gangId = p.gangId; }
    }
    const said = [
      ...fresh.map((m) => m.text),
      ...newspaperEdition(w, gang.id).items.map((n) => `${n.headline} ${n.body}`),
      ...w.lastWeekOrders.filter((o) => o.gangId === gang.id).flatMap((o) => o.results ?? []),
    ];
    const gone: string[] = [], dead: string[] = [];
    for (const [id, s] of mem.seen) {
      if (gang.knownPeople.includes(id) || s.dead) continue;
      if (!s.missing) { s.missing = true; gone.push(s.name); }
      if (said.some((t) => t.includes(s.name) && /kill|dead|died|shot|murder|executed/i.test(t))) { s.dead = true; dead.push(s.name); }
    }
    if (gone.length) actions.push(`MISSING ${gone.join(', ')} — off our identified list; last sighting kept`);
    if (dead.length) actions.push(`DEAD (reported) ${dead.join(', ')}`);
    // 1.2.42 (Robert, memory): Auto's week-to-week memories stay bounded.
    // A rival man off our list (missing or reported dead) who can never come
    // back is dropped from the sightings and only counted; our own dead men
    // and dead prisoners leave the audit, skimmer, prisoner and heat lists.
    let trimmed = 0;
    const goneForGood = (id: number) => !w.people[id] || w.people[id].status === 'dead';
    for (const [id, x] of [...mem.seen]) if ((x.missing || x.dead) && goneForGood(id)) { mem.seen.delete(id); mem.seenGone = (mem.seenGone ?? 0) + 1; trimmed += 1; }
    for (const set of [mem.skimmers, mem.drained, mem.audited]) for (const id of [...set]) if (goneForGood(id)) { set.delete(id); trimmed += 1; }
    for (const id of [...mem.heat.keys()]) if (goneForGood(id)) { mem.heat.delete(id); trimmed += 1; }
    for (const id of [...mem.noProfit.keys()]) if (!w.buildings[id] || w.buildings[id].ownerGangId !== gang.id) { mem.noProfit.delete(id); trimmed += 1; }
    if (trimmed) actions.push(`MEMORY trimmed ${trimmed} entr${trimmed === 1 ? 'y' : 'ies'} for people or buildings no longer in the city (sightings ${mem.seen.size}, refusers ${mem.refusers.size}, audited ${mem.audited.size})`);
  }
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
  // 1.2.41 (Robert): a lawyer or accountant search counts a week empty when
  // last week's search brought nobody better than ours; after
  // SPECIALIST_EMPTY_WEEKS empty weeks the search pauses. The not-hired
  // candidates are taken off our list (it no longer grows week by week).
  const searchedLast = new Set(w.lastWeekOrders.filter((o) => o.gangId === gang.id && o.type === 'recruit' && (o.opts.recruitAs === 'lawyer' || o.opts.recruitAs === 'accountant')).map((o) => o.opts.recruitAs as 'lawyer' | 'accountant'));
  const betterFound = new Set<'lawyer' | 'accountant'>();
  // 1.2.42 (Robert): a hood recruit run counts empty when last week's hood
  // recruiting brought nobody onto our list.
  const hoodRunsLast = w.lastWeekOrders.filter((o) => o.gangId === gang.id && o.type === 'recruit' && (o.opts.recruitAs ?? 'hood') === 'hood');
  const hoodsOffered = gang.recruitIds.filter((id) => w.people[id]?.role === 'hood').length;
  if (hoodRunsLast.length) mem.dryRecruitWeeks = hoodsOffered === 0 ? (mem.dryRecruitWeeks ?? 0) + 1 : 0;
  for (const id of [...gang.recruitIds]) {
    const person = w.people[id];
    if (person && (person.role === 'lawyer' || person.role === 'accountant')) {
      const currentId = person.role === 'lawyer' ? gang.lawyerId : gang.accountantId;
      const current = currentId == null ? undefined : w.people[currentId];
      const usable = current && current.gangId === gang.id && current.status === 'active';
      if (usable && current.skills.intelligence >= person.skills.intelligence) {
        actions.push(`NOTE ${person.role} ${person.name} (${person.skills.intelligence.toFixed(1)}★) not hired — ours is as good (${current.skills.intelligence.toFixed(1)}★); off our list`);
        gang.recruitIds = gang.recruitIds.filter((x) => x !== id);
        continue;
      }
      betterFound.add(person.role);
    }
    const result = hireRecruit(w, gang.id, id, 'pool');
    logResult(actions, `hire ${person?.name ?? id} to the pool`, result.ok, result.ok ? result.message ?? '' : result.error);
  }
  for (const role of ['lawyer', 'accountant'] as const) {
    if (betterFound.has(role)) mem.specEmpty.set(role, 0);
    else if (searchedLast.has(role)) mem.specEmpty.set(role, (mem.specEmpty.get(role) ?? 0) + 1);
  }

  // 1.2.42 (Robert): a crew that has had only its lieutenant for
  // LONE_LIEUTENANT_WEEKS weeks running is broken up; the lieutenant joins
  // the pool and can be sent out again.
  for (const team of crewsOf()) {
    const n = team.memberIds.length === 0 ? (mem.loneWeeks!.get(team.id) ?? 0) + 1 : 0;
    mem.loneWeeks!.set(team.id, n);
    if (n < LONE_LIEUTENANT_WEEKS) continue;
    // 1.2.43: the recruit crew, or our only crew besides the business crew, is
    // kept — its lieutenant recruits himself; breaking it up would leave nobody to recruit.
    const others = crewsOf().filter((t) => t !== team && rolesNow().get(t.id) !== 'business');
    if (rolesNow().get(team.id) === 'recruit' || (rolesNow().get(team.id) !== 'business' && others.length === 0)) {
      actions.push(`NOTE LONE LIEUTENANT ${w.people[team.lieutenantId]?.name ?? team.id}'s crew (${team.name}) kept — only its lieutenant for ${n} weeks, but it is ${rolesNow().get(team.id) === 'recruit' ? 'the recruit crew' : 'our only working crew'}: he recruits himself`);
      continue;
    }
    const lt = w.people[team.lieutenantId];
    const result = demote(w, gang.id, team.id);
    logResult(actions, `LONE LIEUTENANT ${lt?.name ?? team.id}'s crew (${team.name}) broken up — only its lieutenant for ${n} weeks running; he joins the pool`, result.ok, result.ok ? '' : result.error);
    if (result.ok) { keptRoles.delete(team.id); mem.loneWeeks!.delete(team.id); }
  }
  for (const id of [...mem.loneWeeks!.keys()]) if (!w.teams[id]) mem.loneWeeks!.delete(id);
  // 1.2.42 (Robert): after RECRUIT_DRY_WEEKS weeks of empty recruit runs while
  // crews are short-handed, the manager of our lowest-earning business comes
  // back into a crew, one a week.
  {
    const rolesHere = rolesNow();
    const short = crewsOf().filter((t) => rolesHere.get(t.id) !== 'expendables' && t.memberIds.length < MAX_TEAM_SIZE - 1);
    const dry = mem.dryRecruitWeeks ?? 0;
    if (dry >= RECRUIT_DRY_WEEKS && short.length) {
      const site = buildingList(w).filter((b) => b.ownerGangId === gang.id && b.managerId != null && !b.isHQ && w.people[b.managerId]?.role === 'hood' && !(isGangOffice as (x: Building, g: number) => boolean)(b, gang.id))
        .sort((a, b) => (a.lastProfit ?? 0) - (b.lastProfit ?? 0) || a.id - b.id)[0];
      if (!site) actions.push(`RECALL none: recruit runs empty ${dry} weeks, ${short.length} crew(s) short — no business of ours has a hood manager to pull back`);
      else {
        const mgr = w.people[site.managerId!];
        const result = recallManager(w, gang.id, site.id);
        const to = short.filter((t) => rolesHere.get(t.id) !== 'business' || mgr.skills.business >= 3).sort((a, b) => a.memberIds.length - b.memberIds.length || a.id - b.id)[0];
        const moved = result.ok && to ? moveToTeam(w, gang.id, mgr.id, to.id) : undefined;
        logResult(actions, `RECALL ${mgr.name}, manager of ${site.typeId} (building ${site.id}, our lowest earner at $${Math.round(site.lastProfit ?? 0)} last week) — recruit runs empty ${dry} weeks, ${short.length} crew(s) short; ${moved?.ok ? `joins ${to!.name} (${to!.memberIds.length} men)` : 'to the pool'}`, result.ok, result.ok ? '' : result.error);
      }
    }
  }

  // Wages: everyone gets what he asks while the takings (or a year's cash) can
  // carry it — underpaid men lose loyalty and walk out, lieutenants with their crews.
  const payroll = gangMembers(w, gang).filter((p) => p.role !== 'boss');
  const wageBill = payroll.reduce((sum, p) => sum + p.pay, 0);
  const income = gang.lastWeekIncome;
  const weeklyNet = income.legal + income.illegal + income.protection + income.other - gang.lastWeekCosts.wages - gang.lastWeekCosts.upkeep;
  const short = payroll.filter((p) => p.pay < p.payDemand);
  const raise = short.reduce((sum, p) => sum + p.payDemand - p.pay, 0);
  // 1.2.40 (Robert): short of cash (below the reserve: three weeks of wages),
  // pay is cut only to $20 under a man's ask — the game takes no loyalty for
  // that (the cut itself costs 6 once) — and only for men above the game's
  // "wavering" line of 30; managers are never cut (an underpaid manager can skim).
  const shortOfCash = gang.cash < Math.min(RESERVE_CAP, Math.round(wageBill * 3));
  const managerIds = new Set(buildingList(w).filter((b) => b.ownerGangId === gang.id && b.managerId != null).map((b) => b.managerId!));
  // 1.2.41 (Robert): unpaid wages — when the cash cannot cover this week's
  // wages, pool hoods are sacked, the newest first, never the office defenders.
  if (gang.cash < wageBill) {
    const warsNow = Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated && gang.known[g.id] === 'war').length;
    // The HQ's defenders are the oldest pool hoods; hoods stationed at our other offices are never sacked.
    const keep = POOL_DEFENDERS + DEFENDERS_PER_WAR * warsNow;
    const stationedAway = (p: Person) => { const st = p.homeOfficeId != null ? w.buildings[p.homeOfficeId] : undefined; return !!st && isGangOffice(st, gang.id) && !st.isHQ; };
    const pool = gang.poolIds.map((id) => w.people[id]).filter((p): p is Person => !!p && p.role === 'hood' && p.status === 'active' && !stationedAway(p)).sort((a, b) => b.id - a.id);
    let bill = wageBill;
    const sacked: string[] = [];
    for (const p of pool.slice(0, Math.max(0, pool.length - keep))) {
      if (gang.cash >= bill) break;
      const r = sackPerson(w, gang.id, p.id);
      if (r.ok) { bill -= p.pay; sacked.push(`${p.name} ($${p.pay})`); }
    }
    actions.push(`PAY cash $${Math.round(gang.cash)} cannot cover the wages ($${wageBill}): ${sacked.length ? `sacked ${sacked.length} pool hood(s), newest first — ${sacked.join(', ')}` : 'no pool hood to sack'}; ${keep} office defender(s) kept`);
  }
  if (shortOfCash) {
    // 1.2.41 (Robert): never the lawyer, the accountant or a manager.
    const cut = payroll.filter((p) => !managerIds.has(p.id) && p.role !== 'lawyer' && p.role !== 'accountant' && p.loyalty > 30 && p.payDemand - 20 > 0 && p.pay > p.payDemand - 20);
    for (const p of cut) setPay(w, p.id, p.payDemand - 20);
    actions.push(`PAY short of cash ($${Math.round(gang.cash)} under the reserve): ${cut.length ? `${cut.length} m${cut.length === 1 ? 'an' : 'en'} cut to $20 under their ask (no weekly loyalty cost)` : 'nobody to cut'}; the lawyer, the accountant, managers and men at loyalty 30 or less untouched`);
  } else if (short.length && (weeklyNet >= raise || gang.cash >= (wageBill + raise) * 26)) {
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
  // 1.2.41 (Robert): street heat uses the officers' real opinion; the bands
  // the Lawyer tab shows (friendly, neutral, hostile) are for decisions only.
  const policeOpinion = police.length ? police.reduce((sum, p) => sum + (p.opinion[gang.id] ?? 0), 0) / police.length : 0;
  const policeHostileCount = police.filter((p) => opinionBand(p.opinion[gang.id] ?? 0) === 'hostile').length;
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
  // 1.2.40: hostile when most officers show the hostile band.
  const policeHostile = police.length > 0 && policeHostileCount * 2 > police.length;
  if (policeHostile) actions.push(`NOTE the police are hostile (${policeHostileCount} of ${police.length} officers show hostile): every man starts ${Math.round(-policeOpinion * 0.5)} nearer arrest (real opinion ${Math.round(policeOpinion)}) — chief bribe and police payroll put forward`);

  // 1.2.30 (Robert's rules): the basic crews — Recruit first, then Business,
  // then Intimidation and protection collecting — are formed as soon as a lead
  // qualifies and rebuilt straight away when lost, every week. A lead comes
  // from the pool first, then from a crew (never the business crew).
  // 1.2.31 (Robert): every crew's lead aims for 4★ or more in the crew's lead
  // skills, else at least 3★, and gives way when a better lead is recruited.
  // 1.2.37 (Robert): every lead is judged on the average of organization and
  // intelligence. The business lead needs business too (the lower of the
  // two counts); the attack lead firearms and stealth too (the lower of that
  // average and the organization/intelligence average); intimidation breaks
  // ties on intimidation.
  const brains = (p: Person) => (p.skills.organization + p.skills.intelligence) / 2;
  const gunsStealth = (p: Person) => (p.skills.firearms + p.skills.stealth) / 2;
  /** 1.2.37: the lead-fit skill in stars, the one the 4★ / 3★ goals and the 0.5★ swap gain are read on. */
  const leadStars = (role: CrewRole, p: Person) => role === 'business' ? Math.min(brains(p), p.skills.business)
    : role === 'muscle' ? Math.min(brains(p), gunsStealth(p))
    : brains(p);
  /** 4★ lead: 4★ or more in the lead-fit skill. */
  const leadQualified = (role: CrewRole, p: Person) => leadStars(role, p) >= 4;
  /** 3★ lead: the same at 3★. */
  const leadInterim = (role: CrewRole, p: Person) => leadStars(role, p) >= 3;
  const leadTier = (role: CrewRole, p: Person) => leadQualified(role, p) ? 2 : leadInterim(role, p) ? 1 : 0;
  /** How close a hood comes to the lead goal: the lead-fit skill, intimidation as the tiebreak for the intimidation crew. */
  const leadFit = (role: CrewRole, p: Person) => leadStars(role, p) * 10 + (role === 'intimidation' ? p.skills.intimidation / 10 : 0);
  /** 1.2.35: a lead is better when he reaches a higher goal (4★, 3★, below), or the same goal short of 4★ more closely; 1.2.36: and only by 0.5★ or more in the lead-fit skill. */
  const betterLead = (role: CrewRole, p: Person, than: Person) => (leadTier(role, p) > leadTier(role, than)
    || (leadTier(role, p) === leadTier(role, than) && leadTier(role, p) < 2 && leadFit(role, p) > leadFit(role, than)))
    && leadStars(role, p) - leadStars(role, than) >= LEAD_SWAP_GAIN;
  const describeLead = (role: CrewRole, p: Person) => `org ${p.skills.organization.toFixed(1)}★, int ${p.skills.intelligence.toFixed(1)}★`
    + (role === 'business' ? `, business ${p.skills.business.toFixed(1)}★` : role === 'muscle' ? `, firearms ${p.skills.firearms.toFixed(1)}★, stealth ${p.skills.stealth.toFixed(1)}★`
      : role === 'intimidation' ? `, intimidation ${p.skills.intimidation.toFixed(1)}★` : '') + ` — ${leadStars(role, p).toFixed(1)}★ lead fit`;
  const leadNeed = (role: CrewRole) => role === 'business' ? 'organization/intelligence average and business'
    : role === 'muscle' ? 'organization/intelligence average and firearms/stealth average'
    : 'organization/intelligence average';
  const leadGoalNote = (role: CrewRole, p: Person) => leadQualified(role, p) ? '' : leadInterim(role, p) ? ' — 3★, until a 4★ hood is recruited' : ' — below 3★, the closest there is, until a better hood is recruited';
  const freeHood = (p: Person | undefined): p is Person => !!p && p.role === 'hood' && p.status === 'active' && !restingMen.has(p.id);
  const poolHoods = () => gang.poolIds.map((id) => w.people[id]).filter(freeHood);
  const crewHoods = () => crewsOf().filter((t) => keptRoles.get(t.id) !== 'business')
    .flatMap((t) => t.memberIds.map((id) => w.people[id])).filter((p): p is Person => freeHood(p) && p.orderId == null);
  /**
   * The best lead for a crew (1.2.35, Robert): goal 1 a 4★ lead, goal 2 a 3★
   * lead, goal 3 the hood closest to 3★ — so a crew never fails to form for
   * want of a 3★ hood. Each goal from the pool first, then from a crew
   * (never the business crew's men).
   */
  const pickLead = (role: CrewRole, from: () => Person[] = () => [...poolHoods(), ...crewHoods()]) => {
    const byFit = (a: Person, b: Person) => fit2(b) - fit2(a) || a.id - b.id;
    const fit2 = (p: Person) => leadFit(role, p);
    for (const ok of [(p: Person) => leadQualified(role, p), (p: Person) => leadInterim(role, p), () => true]) {
      const pool = poolHoods().filter((p) => from().includes(p)).filter(ok).sort(byFit)[0];
      if (pool) return pool;
      const crew = from().filter((p) => !gang.poolIds.includes(p.id)).filter(ok).sort(byFit)[0];
      if (crew) return crew;
    }
    return undefined;
  };
  /** 1.2.36: hoods promoted this week (never named for a manager swap). */
  const promotedNow = new Set<number>();
  // A better lead recruited (he waits in the pool) takes over any crew — the
  // 1.2.30 swap: break the crew up, promote him, move the men and cars back.
  for (const team of [...crewsOf()]) {
    const role = rolesNow().get(team.id);
    const lt = w.people[team.lieutenantId];
    if (!role || !lt || leadQualified(role, lt)) continue;
    const better = poolHoods().filter((p) => betterLead(role, p, lt)).sort((a, b) => leadTier(role, b) - leadTier(role, a) || leadFit(role, b) - leadFit(role, a) || a.id - b.id)[0];
    if (!better) continue;
    if (team.orderIds.length) { actions.push(`NOTE ${team.name}: ${better.name} (${describeLead(role, better)}) would lead it better — the swap for ${lt.name} waits until the crew's orders are done`); continue; }
    const members = [...team.memberIds];
    const cars = { ...team.vehicles };
    // 1.2.37 (Robert): the attack crew's guns and explosives go to the store
    // on the demote and stay reserved for it; the new crew takes them back.
    const held = role === 'muscle' ? { ...team.weapons } as Partial<Record<WeaponId, number>> : undefined;
    const down = demote(w, gang.id, team.id);
    if (held && down.ok) {
      const res = attackReserve.get(w) ?? {};
      attackReserve.set(w, res);
      for (const [g, n] of Object.entries(held) as [WeaponId, number][]) if (n > 0) res[g] = (res[g] ?? 0) + n;
      attackHeld.delete(w);
    }
    keptRoles.delete(team.id);
    const up = down.ok ? promote(w, gang.id, better.id) : down;
    const newTeam = up.ok && better.teamId != null ? w.teams[better.teamId] : undefined;
    logResult(actions, `${jobName(role)} crew: ${better.name} (${describeLead(role, better)}) takes over from ${lt.name} (${describeLead(role, lt)}; +${(leadStars(role, better) - leadStars(role, lt)).toFixed(1)}★)`, !!newTeam, up.ok ? '' : up.error);
    if (!newTeam) continue;
    promotedNow.add(better.id);
    keptRoles.set(newTeam.id, role);
    // 1.2.35: every man moves back — a member leaves only when a better hood replaces him.
    // 1.2.36: the business crew takes back only men with 3★ business.
    for (const id of [lt.id, ...members]) if (gang.poolIds.includes(id) && newTeam.memberIds.length < MAX_TEAM_SIZE - 1 && w.people[id] && (role !== 'business' || w.people[id].skills.business >= 3)) moveToTeam(w, gang.id, id, newTeam.id);
    for (const [kind, n] of Object.entries(cars) as [keyof typeof VEHICLES, number][]) for (let i = 0; i < (n ?? 0); i++) transferVehicle(w, gang.id, kind, newTeam.id, true);
  }
  // 1.2.32 (Robert): existing crews are filled before any new crew is formed,
  // basic or not. Once every crew is full the next crew opens: the missing
  // basic crews first (Recruit, Business, Intimidation, Collect; their lead
  // from the pool first, then from a crew), then the rest of the opening
  // order (their lead from the pool, with men waiting there) — as many as
  // qualify. The attack crew is the exception Robert asked for: it forms as
  // soon as a rival HQ is found or suspected.
  // 1.2.36 (Robert): a crew counts as full when no free hood qualifies for
  // it — the business crew a hood with 3★ business in the pool or another
  // crew (never a lieutenant); any other crew any free pool hood (3★ for its
  // job, or the closest fit). So a crew short only because a man left to
  // manage a site blocks no new crew when nobody can take his place.
  // 1.2.37: the Expendables crew is filled only from hoods about to be let go — it never counts here.
  const canFill = (team: Team) => team.memberIds.length < MAX_TEAM_SIZE - 1 && rolesNow().get(team.id) !== 'expendables'
    && (rolesNow().get(team.id) === 'business' ? [...poolHoods(), ...crewHoods()].some((p) => p.skills.business >= 3) : poolHoods().length > 0);
  {
    // 1.2.41 (fix, seen with 29 hoods in the pool): this check runs before the
    // pool is placed, so crews that the pool fills this same week (and a
    // business crew whose 3★ hands are moved this week) no longer block the
    // missing basic crews — they count as full when the pool holds more free
    // hoods than the other crews' open places (one left over to lead).
    const allFull = () => {
      const open = crewsOf().filter(canFill);
      if (!open.length) return true;
      const places = open.filter((t) => rolesNow().get(t.id) !== 'business').reduce((n, t) => n + (MAX_TEAM_SIZE - 1 - t.memberIds.length), 0);
      return poolHoods().length > places;
    };
    const poolWaiting = () => gang.poolIds.filter((id) => !restingMen.has(id)).length;
    const heldRoles = () => [...rolesNow().values()];
    const open = (role: CrewRole, lead: Person, why: string) => {
      const result = promote(w, gang.id, lead.id);
      const newTeam = result.ok && lead.teamId != null ? w.teams[lead.teamId] : undefined;
      if (newTeam) keptRoles.set(newTeam.id, role);
      if (newTeam) promotedNow.add(lead.id);
      logResult(actions, `promote ${lead.name} to lead the ${jobName(role)} crew (${describeLead(role, lead)}${leadGoalNote(role, lead)})${why}`, !!newTeam, result.ok ? result.message ?? '' : result.error);
      return !!newTeam;
    };
    // 1.2.32 (Robert): an attack crew as soon as our map shows a rival HQ or one is suspected.
    const hqSeen = knownRivalHQs(w, gang).length > 0 || (suspectedHQ.get(w)?.size ?? 0) > 0;
    // 1.2.36 (Robert): an armed crew too once rivals have killed one of our
    // men, with no rival HQ known; it is the attack crew when an HQ is found.
    const rivalKill = memberLosses(w, gang.id).some((l) => !!l.by && /gunned|killed|shot|stab|beat|bomb|burn/i.test(l.cause) && Object.values(w.gangs).some((g) => g.id !== gang.id && g.name === l.by));
    if ((hqSeen || rivalKill) && !heldRoles().includes('muscle')) {
      const because = hqSeen ? `a rival HQ is ${knownRivalHQs(w, gang).length ? 'known' : 'suspected'}` : 'rivals have killed one of our men';
      const lead = pickLead('muscle');
      if (!lead) actions.push(`NOTE no attack crew although ${because}: no free hood at all to lead it (${leadNeed('muscle')})`);
      else if (gang.teamIds.length >= MAX_TEAMS) actions.push(`NOTE no attack crew although ${because}: already ${MAX_TEAMS} lieutenants (${lead.name} would lead it)`);
      else open('muscle', lead, ` — ${because}`);
    }
    for (;;) {
      const missing = BASIC_CREWS.filter((r) => !heldRoles().includes(r));
      if (gang.teamIds.length > 0 && !allFull()) {
        for (const role of missing) actions.push(`BASIC CREW ${role} not ${w.week > 1 ? 'formed or rebuilt' : 'formed'}: the existing crews are filled first (${crewsOf().filter(canFill).map((t) => `${t.name} ${t.memberIds.length}/${MAX_TEAM_SIZE - 1}`).join(', ')})`);
        break;
      }
      if (gang.teamIds.length >= MAX_TEAMS) {
        for (const role of missing) actions.push(`BASIC CREW ${role} not formed: already ${MAX_TEAMS} lieutenants`);
        break;
      }
      if (missing.length) {
        const role = missing[0];
        const lead = pickLead(role);
        if (!lead) {
          for (const r of missing) actions.push(`BASIC CREW ${r} not ${w.week > 1 ? 'formed or rebuilt' : 'formed'}: ${r === role ? `no free hood at all in the pool or a crew to lead it (${leadNeed(r)})` : `waits for the ${role} crew`}`);
          break;
        }
        if (!open(role, lead, '')) break;
        continue;
      }
      if (poolWaiting() < 1) break;
      const nextRole = CREW_OPENING_ORDER.find((r) => !heldRoles().includes(r)) ?? 'collect';
      const lead = pickLead(nextRole, poolHoods);
      if (!lead) { actions.push(`NOTE no new ${jobName(nextRole)} crew: no free pool hood to lead it`); break; }
      if (!open(nextRole, lead, '')) break;
    }
  }

  if (weight.hiring >= 0.2) {
    const roleOfNow = () => rolesNow();
    // 1.2.25 (Robert's rule): a pool hood joins only a crew whose job he has
    // 3★ or more for — the crew he is best for, the fullest among equals, so
    // one crew fills before the next. Nobody goes to a crew just because it is empty.
    const roles0 = roleOfNow();
    const roleOf = (team: Team) => roles0.get(team.id) ?? 'collect';
    const bestStars = (p: Person) => Math.max(...crewsOf().map((team) => roleStars(p, roleOf(team))), 0);
    // 1.2.38 (Robert): skills no crew uses count less (they raise the wage): the pool is taken best-value first.
    const placeable = gang.poolIds.filter((id) => !restingMen.has(id)).map((id) => w.people[id]).filter((p): p is Person => !!p && p.role === 'hood' && p.status === 'active')
      .sort((a, b) => (bestStars(b) - wageDrag(b)) - (bestStars(a) - wageDrag(a)) || a.id - b.id);
    for (const p of placeable) {
      const crew = crewsOf().filter((team) => roleOf(team) !== 'expendables' && team.memberIds.length < MAX_TEAM_SIZE - 1 && roleStars(p, roleOf(team)) >= 3)
        .sort((a, b) => roleStars(p, roleOf(b)) - roleStars(p, roleOf(a)) || b.memberIds.length - a.memberIds.length || a.id - b.id)[0];
      if (!crew) continue;
      const result = moveToTeam(w, gang.id, p.id, crew.id);
      logResult(actions, `to crew ${p.name} (${roleStars(p, roleOf(crew)).toFixed(1)}★ for ${jobName(roleOf(crew))})`, result.ok, result.ok ? result.message ?? '' : result.error);
    }
    // 1.2.35 (Robert): a crew no 3★ hood can join this week fills with the
    // pool hoods closest to 3★ for its job (the collecting crews come last);
    // the hoods left, who fit no crew, go to protection collecting.
    // 1.2.36 (Robert): never the business crew — it takes only 3★ business
    // hands, and with room it waits for one.
    for (const p of [...placeable].filter((x) => gang.poolIds.includes(x.id))) {
      const crew = crewsOf().filter((team) => roleOf(team) !== 'collect' && roleOf(team) !== 'business' && roleOf(team) !== 'expendables' && team.memberIds.length < MAX_TEAM_SIZE - 1)
        .sort((a, b) => roleStars(p, roleOf(b)) - roleStars(p, roleOf(a)) || b.memberIds.length - a.memberIds.length || a.id - b.id)[0];
      if (crew) {
        const result = moveToTeam(w, gang.id, p.id, crew.id);
        logResult(actions, `to crew ${p.name} (${roleStars(p, roleOf(crew)).toFixed(1)}★ for ${jobName(roleOf(crew))}, the closest to 3★ there is)`, result.ok, result.ok ? result.message ?? '' : result.error);
        continue;
      }
      // 1.2.30 (Robert): a hood who fits no crew's job goes to protection collecting.
      const collect = crewsOf().filter((team) => roleOf(team) === 'collect' && team.memberIds.length < MAX_TEAM_SIZE - 1)
        .sort((a, b) => b.memberIds.length - a.memberIds.length || a.id - b.id)[0];
      if (!collect) continue;
      const result = moveToTeam(w, gang.id, p.id, collect.id);
      logResult(actions, `to crew ${p.name} (fits no crew's job, ${bestStars(p).toFixed(1)}★ best) — collects protection`, result.ok, result.ok ? result.message ?? '' : result.error);
    }
    // A full crew swaps its weakest free hand for a better man in the pool,
    // every such swap (1.2.35: a weaker member leaves only for a better one).
    for (const p of [...placeable].filter((x) => gang.poolIds.includes(x.id))) {
      let best: { team: Team; weak: Person; gain: number } | undefined;
      for (const team of crewsOf()) {
        if (team.memberIds.length < MAX_TEAM_SIZE - 1 || roleOf(team) === 'expendables') continue;
        if (roleOf(team) === 'business' && p.skills.business < 3) continue; // 1.2.36: business hands only with 3★ business
        const weak = team.memberIds.map((m) => w.people[m]).filter((x): x is Person => !!x && x.status === 'active' && x.orderId == null && !talentPlaced.has(x.id))
          .sort((a, b) => roleCompare(b, a, roleOf(team)))[0];
        // 1.2.38: skills no crew uses count against a pool hood (wage cost).
        const gain = weak ? roleStars(p, roleOf(team)) - wageDrag(p) - roleStars(weak, roleOf(team)) : 0;
        if (weak && gain > 0 && (!best || gain > best.gain)) best = { team, weak, gain };
      }
      if (!best) continue;
      const out = moveToPool(w, gang.id, best.weak.id);
      const result = out.ok ? moveToTeam(w, gang.id, p.id, best.team.id) : out;
      logResult(actions, `swap ${p.name} into ${best.team.name} for ${best.weak.name} (+${best.gain.toFixed(1)}★ ${jobName(roleOf(best.team))})`, result.ok, result.ok ? '' : result.error);
    }
    // 1.2.36 (Robert): firing. Auto lets a pool hood go only when every crew
    // is full (as the fill-first rule counts it), every basic crew exists and
    // the pool holds more hoods than the spares kept — as many as the men lost
    // in the last SPARE_LOSS_WEEKS weeks, not counting the men Auto fired.
    // The weakest go first; a hood with 3★ for any crew's job is never fired.
    {
      const lost = memberLosses(w, gang.id, w.week - SPARE_LOSS_WEEKS).filter((l) => (l.role === 'hood' || l.role === 'lieutenant') && l.cause !== 'sacked').length;
      const idle = idlePool().map((id) => w.people[id]).filter((p): p is Person => !!p && p.role === 'hood');
      const anyJob3 = (p: Person) => CREW_OPENING_ORDER.some((r) => roleStars(p, r) >= 3);
      const basicsHeld = BASIC_CREWS.every((r) => [...roleOfNow().values()].includes(r));
      const full = !crewsOf().some(canFill);
      const best = (p: Person) => Math.max(...CREW_OPENING_ORDER.map((r) => roleStars(p, r)));
      // 1.2.38 (Robert): skills no crew uses count against a man when firing (wage cost).
      const weakestFirst = [...idle].sort((a, b) => (best(a) - wageDrag(a)) - (best(b) - wageDrag(b)) || b.id - a.id);
      // 1.2.39 (Robert): the pool also keeps POOL_DEFENDERS hoods to defend the office.
      // 1.2.40 (Robert): plus DEFENDERS_PER_WAR more for every rival at war with us.
      const wars = Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated && gang.known[g.id] === 'war').length;
      const defenders = officeDefendersWanted(w, gang, wars);
      const over = Math.max(0, idle.length - lost - defenders);
      if (idle.length) actions.push(`NOTE spares: ${idle.length} in the pool, ${lost} kept against men lost in the last ${SPARE_LOSS_WEEKS} weeks (men we let go not counted) + ${defenders} office defenders (${wars} rival(s) at war)${!full ? ' — a crew can still take a pool hood, nobody is let go' : !basicsHeld ? ' — a basic crew is missing, nobody is let go' : ''}`);
      // 1.2.37 (Robert): before anyone is let go, the hoods who fit no crew
      // (no 3★ job) and those under 2.5★ intelligence join the armed
      // Expendables crew for the risky violent work (hits, FBI agents, rival
      // attacks). It forms once three such hoods are spare (a lead and two
      // men; lead by the organization/intelligence average); firing only once
      // it is full too.
      if (full && basicsHeld && over > 0) {
        const expendable = (p: Person) => !anyJob3(p) || p.skills.intelligence < LOW_INT;
        const spare = weakestFirst.slice(0, over).filter(expendable);
        let expCrew = crewsOf().find((t) => roleOfNow().get(t.id) === 'expendables');
        if (!expCrew && spare.length >= 3 && gang.teamIds.length < MAX_TEAMS) {
          const lead = pickLead('expendables', () => spare);
          const up = lead ? promote(w, gang.id, lead.id) : undefined;
          const team = up?.ok && lead!.teamId != null ? w.teams[lead!.teamId] : undefined;
          if (team) { keptRoles.set(team.id, 'expendables'); promotedNow.add(lead!.id); expCrew = team; }
          if (lead) logResult(actions, `promote ${lead.name} to lead the Expendables crew (${describeLead('expendables', lead)}) — ${spare.length} hoods fit no crew or are under ${LOW_INT}★ intelligence; they join it instead of being let go`, !!team, up?.ok ? up.message ?? '' : up?.error ?? '');
        } else if (!expCrew && spare.length) actions.push(`NOTE no Expendables crew: ${spare.length < 3 ? `only ${spare.length} spare hood${spare.length === 1 ? '' : 's'} who fit no crew or are under ${LOW_INT}★ intelligence (it forms at 3)` : `already ${MAX_TEAMS} lieutenants`}`);
        const placed = new Set<number>();
        if (expCrew) {
          for (const p of spare) {
            if (expCrew.memberIds.length >= MAX_TEAM_SIZE - 1) break;
            if (!gang.poolIds.includes(p.id)) continue;
            const result = moveToTeam(w, gang.id, p.id, expCrew.id);
            logResult(actions, `to Expendables ${p.name} (int ${p.skills.intelligence.toFixed(1)}★, ${best(p).toFixed(1)}★ best for any job) — instead of being let go`, result.ok, result.ok ? '' : result.error);
            if (result.ok) placed.add(p.id);
          }
        }
        const expFull = !!expCrew && expCrew.memberIds.length >= MAX_TEAM_SIZE - 1;
        if (!expFull) { if (spare.length > placed.size) actions.push(`NOTE nobody is let go: the Expendables crew ${expCrew ? `has room (${expCrew.memberIds.length}/${MAX_TEAM_SIZE - 1})` : 'is not formed'}`); }
        else for (const p of weakestFirst.filter((x) => !anyJob3(x) && !placed.has(x.id) && gang.poolIds.includes(x.id)).slice(0, over - placed.size)) {
          const result = sackPerson(w, gang.id, p.id);
          logResult(actions, `let ${p.name} go — every crew and the Expendables are full and no crew needs him (${best(p).toFixed(1)}★ best for any job)`, result.ok, result.ok ? result.message ?? '' : result.error);
        }
      }
    }
    // A new crew gets two men from the biggest crews, so no lieutenant walks
    // alone (never from the business crew, which lends nobody). 1.2.33: no
    // weekly limit, and only hoods with 3★ or more for the new crew's job.
    for (const small of crewsOf().filter((t) => t.memberIds.length < 2 && roleOf(t) !== 'expendables')) {
      while (small.memberIds.length < 2) {
        const donors = crewsOf().filter((t) => t !== small && roleOf(t) !== 'business' && roleOf(t) !== 'expendables' && t.memberIds.length >= 4).sort((a, b) => b.memberIds.length - a.memberIds.length || a.id - b.id);
        const pick = donors.flatMap((t) => t.memberIds.map((id) => w.people[id])).filter((p): p is Person => !!p && p.status === 'active' && p.orderId == null && roleStars(p, roleOf(small)) >= 3)
          .sort((a, b) => roleCompare(a, b, roleOf(small)) || a.id - b.id)[0];
        if (!pick) break;
        const result = moveToTeam(w, gang.id, pick.id, small.id);
        logResult(actions, `to crew ${pick.name} (${roleStars(pick, roleOf(small)).toFixed(1)}★ for ${jobName(roleOf(small))}) — a new crew gets men`, result.ok, result.ok ? result.message ?? '' : result.error);
        if (!result.ok) break;
      }
    }
  }

  // Crews by talent: business men run the shops, the most intimidating crew
  // extorts without guns, a crew with guns and stealth does the rough work,
  // and the rest collect.
  // 1.2.25: every crew keeps its job, a crew whose lieutenant is in custody too
  // (it simply gets no orders) — its job never passes to another crew.
  const roles = rolesNow();
  // 1.2.32 (Robert): every crew is rebuilt every week whenever a more able
  // hood is free — in the pool or in another crew (the business crew gives
  // nobody away), 3★ or more for the crew's job. A crew with room takes him
  // if he is better for its job than for his own crew's; a full crew trades
  // its weakest man, only when the two crews are better off together. Each
  // move raises the gang's total stars for the jobs, so the pass ends.
  {
    const job = (t: Team) => roles.get(t.id) ?? 'collect';
    const crewOfMan = (id: number) => crewsOf().find((t) => t.memberIds.includes(id));
    const movable = (p: Person | undefined): p is Person => !!p && p.status === 'active' && p.role === 'hood' && p.orderId == null && !restingMen.has(p.id);
    const pass = () => {
      for (const team of crewsOf().filter((t) => job(t) !== 'expendables')) {
        const role = job(team);
        const fromPool = idlePool().map((id) => w.people[id]).filter(movable);
        const fromCrews = crewsOf().filter((t) => t !== team && job(t) !== 'business').flatMap((t) => t.memberIds.map((id) => w.people[id])).filter(movable);
        const room = team.memberIds.length < MAX_TEAM_SIZE - 1;
        // 1.2.39: the firearms quota men of the attack crew are not swapped out.
        const quotaMen = team.memberIds.filter((id) => (w.people[id]?.skills.firearms ?? 0) >= FIREARMS_QUOTA_STARS);
        const keepForQuota = (p: Person) => role === 'muscle' && quotaMen.length <= FIREARMS_QUOTA && quotaMen.includes(p.id);
        const weak = team.memberIds.map((id) => w.people[id]).filter(movable).filter((p) => !keepForQuota(p)).sort((x, y) => roleCompare(y, x, role) || y.id - x.id)[0];
        let best: { p: Person; gain: number } | undefined;
        for (const p of [...fromPool, ...fromCrews]) {
          if (roleStars(p, role) < 3) continue;
          const home = crewOfMan(p.id);
          const ownNow = home ? roleStars(p, job(home)) : 0;
          let gain: number;
          if (room) gain = home ? roleStars(p, role) - ownNow : roleStars(p, role);
          else if (!weak) continue;
          else gain = roleStars(p, role) - roleStars(weak, role) + (home ? (roleStars(weak, job(home)) >= 3 ? roleStars(weak, job(home)) : 0) - ownNow : 0);
          if (!home) gain -= wageDrag(p); // 1.2.38: a pool hood's unused skills count against him (wage cost)
          // 1.2.38 (Robert): equal gains go to the better man by the job's tiebreaks (attack: firearms, explosives, fists).
          if (gain > 0 && (!best || gain > best.gain || (gain === best.gain && roleCompare(p, best.p, role) < 0))) best = { p, gain };
        }
        if (!best) continue;
        const home = crewOfMan(best.p.id);
        if (!room && weak) {
          const out = moveToPool(w, gang.id, weak.id);
          if (!out.ok) continue;
          const result = moveToTeam(w, gang.id, best.p.id, team.id);
          logResult(actions, `rebuild ${team.name}: ${best.p.name} (${roleStars(best.p, role).toFixed(1)}★ ${jobName(role)}) in for ${weak.name} (${roleStars(weak, role).toFixed(1)}★)${home && roleStars(weak, job(home)) >= 3 ? `, who goes to ${home.name}` : ', who goes to the pool'}`, result.ok, result.ok ? '' : result.error);
          if (!result.ok) { moveToTeam(w, gang.id, weak.id, team.id); continue; }
          if (home && roleStars(weak, job(home)) >= 3) moveToTeam(w, gang.id, weak.id, home.id);
          talentPlaced.add(best.p.id);
          return true;
        }
        const result = moveToTeam(w, gang.id, best.p.id, team.id);
        logResult(actions, `rebuild ${team.name}: ${best.p.name} joins (${roleStars(best.p, role).toFixed(1)}★ ${jobName(role)}${home ? `, from ${home.name}` : ', from the pool'})`, result.ok, result.ok ? '' : result.error);
        if (result.ok) { talentPlaced.add(best.p.id); return true; }
      }
      return false;
    };
    while (pass()) { /* until no crew can be made more able */ }
  }
  // 1.2.22, the business crew (Robert's method): hoods with more than three
  // business stars join it (1.2.31: no weekly limit), it gets a car, and it does the buying.
  const bizCrew = crewsOf().find((team) => roles.get(team.id) === 'business');
  if (bizCrew) {
    // 1.2.35 (Robert): the business crew takes the best business hands from
    // the pool and from every crew (never a lieutenant; this overrides the
    // crews keeping to their jobs and the donor sizes). With room it takes
    // the best there is with 3★ business or more (1.2.36: never less — with
    // room and nobody qualified it waits); full, it trades its weakest man (to
    // the pool) for a better one. A weaker man leaves only when a better one
    // replaces him. Each move raises the crew's business stars, so the pass ends.
    const lt = w.people[bizCrew.lieutenantId];
    if (lt && lt.skills.business < 3) actions.push(`NOTE business crew: lead ${lt.name} has business ${lt.skills.business.toFixed(1)}★ — the closest there is; a better hood takes over when one is recruited`);
    const want = MAX_TEAM_SIZE - 1 - bizCrew.memberIds.length;
    let moved = 0;
    const free = (p: Person | undefined): p is Person => !!p && p.status === 'active' && p.role === 'hood' && p.orderId == null && !restingMen.has(p.id);
    const others = () => [...idlePool().map((id) => w.people[id]), ...crewsOf().filter((t) => t.id !== bizCrew.id).flatMap((t) => t.memberIds.map((id) => w.people[id]))]
      .filter(free).filter((p) => p.skills.business >= 3).sort((x, y) => y.skills.business - x.skills.business || Number(gang.poolIds.includes(y.id)) - Number(gang.poolIds.includes(x.id)) || x.id - y.id);
    // 1.2.37 (Robert): business hands ignore intelligence; with room the crew
    // takes the lowest-intelligence 3★ business hand first (the sharp ones
    // stay for recruiting, bribes and leading); full, it trades for more business.
    const lowIntFirst = () => others().sort((x, y) => x.skills.intelligence - y.skills.intelligence || y.skills.business - x.skills.business || x.id - y.id);
    for (;;) {
      const best = bizCrew.memberIds.length < MAX_TEAM_SIZE - 1 ? lowIntFirst()[0] : others()[0];
      if (!best) break;
      const from = crewsOf().find((t) => t.memberIds.includes(best.id));
      if (bizCrew.memberIds.length < MAX_TEAM_SIZE - 1) {
        const result = tryMove(best.id, bizCrew.id, `business crew: ${best.name} (business ${best.skills.business.toFixed(1)}★, int ${best.skills.intelligence.toFixed(1)}★) joins${from ? ` from ${from.name}` : ' from the pool'}`);
        if (!result.ok) break;
        moved++; talentPlaced.add(best.id);
        continue;
      }
      const weak = bizCrew.memberIds.map((id) => w.people[id]).filter(free).sort((x, y) => x.skills.business - y.skills.business || y.id - x.id)[0];
      if (!weak || best.skills.business <= weak.skills.business) break;
      const out = moveToPool(w, gang.id, weak.id);
      if (!out.ok) break;
      const result = tryMove(best.id, bizCrew.id, `business crew: ${best.name} (business ${best.skills.business.toFixed(1)}★${from ? `, from ${from.name}` : ', from the pool'}) in for ${weak.name} (${weak.skills.business.toFixed(1)}★, to the pool)`);
      if (!result.ok) { moveToTeam(w, gang.id, weak.id, bizCrew.id); break; }
      talentPlaced.add(best.id);
    }
    if (!Object.values(bizCrew.vehicles).some((n) => n > 0) && gang.cash > VEHICLES.coupe.cost * 3) {
      const result = buyVehicle(w, gang.id, 'coupe', bizCrew.id);
      logResult(actions, `business crew: a car for ${w.people[bizCrew.lieutenantId]?.name ?? 'the crew'}`, result.ok, result.ok ? '' : result.error);
    }
    if (want > moved) actions.push(`NOTE business crew short: ${bizCrew.memberIds.length + 1} men and no free hood with 3★ business to join — it waits for one`);
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
  // 1.2.32 (Robert): crews with the same job sit next to each other in the
  // lieutenant list, by the player's own slot move (drag a lieutenant onto
  // another slot; an occupied slot swaps), jobs in the opening order.
  {
    const rank = (id: number) => { const r = roles.get(id); return r && CREW_OPENING_ORDER.includes(r) ? CREW_OPENING_ORDER.indexOf(r) : CREW_OPENING_ORDER.length; };
    const before = slotLayout(w, gang);
    const want = before.filter((id): id is number => id != null).sort((x, y) => rank(x) - rank(y) || before.indexOf(x) - before.indexOf(y));
    want.forEach((id, i) => { const from = slotLayout(w, gang).indexOf(id); if (from !== i) moveSlot(w, gang, from, i); });
    const after = slotLayout(w, gang);
    if (after.some((id, i) => id !== before[i])) actions.push(`NOTE lieutenant slots sorted by job: ${after.filter((id): id is number => id != null).map((id, i) => `${i + 1} ${w.teams[id]?.name ?? id}`).join(', ')}`);
  }
  if (roles.size) actions.push(`NOTE crews: ${[...roles].map(([id, role]) => `${w.people[w.teams[id]?.lieutenantId]?.name ?? id} ${jobName(role)}`).join(', ')}`);
  // 1.2.24: crew sizes every week (hoods of the most a crew can hold, lieutenant apart).
  actions.push(`CREWS ${crewsOf().map((t) => `${t.name} ${t.memberIds.length}/${MAX_TEAM_SIZE - 1}`).join(', ') || 'none'}; pool ${gang.poolIds.length}`);
  // 1.2.38 (Robert): every crew with a car keeps at least one man with
  // DRIVER_STARS★ driving where it can (Collect and Scouts first): a free
  // driver from the pool, or else from another crew that keeps a driver of its
  // own, who has 3★ for this crew's job; he takes a free place, or the
  // weakest non-driver goes to the pool. No driver to be had: no change.
  // Driving counts nowhere else (no crew score).
  {
    const hasCar = (t: Team) => Object.values(t.vehicles).some((n) => (n ?? 0) > 0);
    const drives = (p: Person | undefined) => !!p && p.status === 'active' && p.skills.driving >= DRIVER_STARS;
    const drivers = (t: Team) => [t.lieutenantId, ...t.memberIds].filter((id) => drives(w.people[id])).length;
    const first: CrewRole[] = ['collect', 'scout'];
    const carCrews = crewsOf().filter((t) => hasCar(t) && roles.get(t.id) !== 'expendables')
      .sort((a, b) => Number(first.includes(roles.get(b.id) ?? 'collect')) - Number(first.includes(roles.get(a.id) ?? 'collect')) || a.id - b.id);
    for (const team of carCrews) {
      if (drivers(team)) continue;
      const role = roles.get(team.id) ?? 'collect';
      const free = (p: Person | undefined): p is Person => !!p && p.role === 'hood' && p.status === 'active' && p.orderId == null && !restingMen.has(p.id) && drives(p) && roleStars(p, role) >= 3;
      const fromPool = gang.poolIds.map((id) => w.people[id]).filter(free);
      const fromCrews = crewsOf().filter((t) => t !== team && roles.get(t.id) !== 'business' && (!hasCar(t) || drivers(t) > 1))
        .flatMap((t) => t.memberIds.map((id) => w.people[id])).filter(free);
      const pick = [...fromPool.sort((a, b) => roleCompare(a, b, role) || a.id - b.id), ...fromCrews.sort((a, b) => roleCompare(a, b, role) || a.id - b.id)][0];
      if (!pick) { actions.push(`NOTE ${team.name} has a car but no man with ${DRIVER_STARS}★ driving — none to be had`); continue; }
      if (team.memberIds.length >= MAX_TEAM_SIZE - 1) {
        const out = team.memberIds.map((id) => w.people[id]).filter((p): p is Person => !!p && p.status === 'active' && p.orderId == null && !drives(p))
          .sort((x, y) => roleCompare(y, x, role) || y.id - x.id)[0];
        if (!out || !moveToPool(w, gang.id, out.id).ok) { actions.push(`NOTE ${team.name} has a car but no man with ${DRIVER_STARS}★ driving — no place free for ${pick.name}`); continue; }
        actions.push(`NOTE ${out.name} to the pool to make room for a driver in ${team.name}`);
      }
      const result = moveToTeam(w, gang.id, pick.id, team.id);
      logResult(actions, `driver for ${team.name}: ${pick.name} (driving ${pick.skills.driving.toFixed(1)}★, ${roleStars(pick, role).toFixed(1)}★ for ${jobName(role)})`, result.ok, result.ok ? '' : result.error);
    }
  }
  // 1.2.39 (Robert): the attack and Expendables crews each aim for
  // FIREARMS_QUOTA hoods with FIREARMS_QUOTA_STARS★ firearms — from the pool
  // first, then other crews (never the business crew, never a lieutenant, never
  // a car crew's only driver); a full crew sends its weakest other man to the pool.
  {
    const shooter = (p: Person | undefined): p is Person => !!p && p.status === 'active' && p.role === 'hood' && p.skills.firearms >= FIREARMS_QUOTA_STARS;
    const hasCar = (t: Team) => Object.values(t.vehicles).some((n) => (n ?? 0) > 0);
    const drivers = (t: Team) => [t.lieutenantId, ...t.memberIds].filter((id) => (w.people[id]?.skills.driving ?? 0) >= DRIVER_STARS && w.people[id]?.status === 'active').length;
    for (const role of ['muscle', 'expendables'] as CrewRole[]) {
      const team = crewsOf().find((t) => roles.get(t.id) === role);
      if (!team) continue;
      const quota = () => team.memberIds.filter((id) => shooter(w.people[id])).length;
      const added: string[] = [];
      while (quota() < FIREARMS_QUOTA) {
        const free = (p: Person | undefined): p is Person => shooter(p) && p.orderId == null && !restingMen.has(p.id) && p.teamId !== team.id;
        const fromPool = gang.poolIds.map((id) => w.people[id]).filter(free);
        const fromCrews = crewsOf().filter((t) => t !== team && !['business', 'muscle', 'expendables'].includes(roles.get(t.id) ?? 'collect'))
          .flatMap((t) => t.memberIds.map((id) => w.people[id]).filter(free).filter((p) => !(hasCar(t) && drivers(t) <= 1 && p.skills.driving >= DRIVER_STARS)));
        const pick = [...fromPool.sort((a, b) => b.skills.firearms - a.skills.firearms || a.id - b.id), ...fromCrews.sort((a, b) => b.skills.firearms - a.skills.firearms || a.id - b.id)][0];
        if (!pick) break;
        if (team.memberIds.length >= MAX_TEAM_SIZE - 1) {
          const out = team.memberIds.map((id) => w.people[id]).filter((p): p is Person => !!p && p.status === 'active' && p.orderId == null && !shooter(p))
            .sort((x, y) => roleCompare(y, x, role) || y.id - x.id)[0];
          if (!out || !moveToPool(w, gang.id, out.id).ok) break;
          actions.push(`NOTE ${out.name} to the pool to make room for a ${FIREARMS_QUOTA_STARS}★ shooter in ${team.name}`);
        }
        const result = moveToTeam(w, gang.id, pick.id, team.id);
        logResult(actions, `firearms quota for ${team.name}: ${pick.name} (firearms ${pick.skills.firearms.toFixed(1)}★)`, result.ok, result.ok ? '' : result.error);
        if (!result.ok) break;
        added.push(pick.name);
      }
      if (quota() < FIREARMS_QUOTA) actions.push(`NOTE ${team.name}: ${quota()} of ${FIREARMS_QUOTA} men with ${FIREARMS_QUOTA_STARS}★ firearms — no more to be had`);
    }
  }
  const GUNS: WeaponId[] = ['pistol', 'shotgun', 'rifle', 'tommy', 'twinPistols'];
  const roleCrew = (role: CrewRole) => crewsOf().find((team) => roles.get(team.id) === role);
  // 1.2.30 (Robert's rules): a crew holds at most one gun per man, the best
  // ones; the rest go to the gang store, which has no limit.
  // 1.2.36 (Robert): every crew carries guns — one per man, Collect and
  // Business too. The attack crew's own stock (bought for it, or handed in by
  // it) is kept in the store for it alone; the other crews take only the rest.
  // 1.2.38 (Robert): guns ranked by the game's real hit/kill tables per job
  // (GUN_ORDER: inside — shotgun, twin pistols, rifle, tommy, revolver; street
  // and ambush — rifle first). Plain ranking (store hand-ins, supply) uses the street order.
  const gunRank = (g: WeaponId) => GUN_SCORE.street[g] ?? 0;
  const BEST_FIRST = GUN_ORDER.street;
  const gunsOf = (t: Team) => GUNS.reduce((sum, g) => sum + (t.weapons[g] ?? 0), 0);
  const menOfCrew = (t: Team) => [t.lieutenantId, ...t.memberIds].map((id) => w.people[id]).filter((p): p is Person => !!p);
  // 1.2.38 (Robert): guns only for men on violent jobs — the attack crew
  // always, the Expendables only while on a job, any other crew only for a
  // kill or an ambush order (armed when the order is given, below). Everyone
  // else is unarmed, which ends the random shots. This replaces the gun for every man.
  // 1.2.39 (Robert): the attack crew's shotguns and rifles sit in the cache,
  // reserved for it; before each mission the job's guns go to the crew and
  // back to the cache at the next week's start — no crew holds guns between jobs.
  const gunLimit = (_t: Team) => 0;
  const attackCrew = roleCrew('muscle');
  const kept = attackReserve.get(w) ?? {};
  attackReserve.set(w, kept);
  // 1.2.37 (Robert): an attack crew broken up since last week (its
  // lieutenant dead, or demoted) leaves its guns and explosives reserved in
  // the store; the reserve stays while no attack crew exists, and the next
  // one takes it first (it arms first, below).
  {
    const snap = attackHeld.get(w);
    if (snap && snap.teamId !== attackCrew?.id && !crewsOf().some((t) => t.id === snap.teamId)) {
      const back = (Object.entries(snap.weapons) as [WeaponId, number][]).filter(([, n]) => n > 0);
      for (const [g, n] of back) kept[g] = (kept[g] ?? 0) + n;
      if (back.length) actions.push(`NOTE the attack crew was broken up — its ${back.map(([g, n]) => `${n}× ${g}`).join(', ')} stay reserved for it in the store`);
      attackHeld.delete(w);
    }
  }
  for (const g of Object.keys(kept) as WeaponId[]) kept[g] = Math.min(kept[g] ?? 0, gang.weapons[g] ?? 0);
  /** What a crew may take from the store: the attack crew all of it, any other crew what is not kept for the attack crew. */
  const inStore = (team: Team | undefined, g: WeaponId) => team && team === attackCrew ? (gang.weapons[g] ?? 0) : Math.max(0, (gang.weapons[g] ?? 0) - (kept[g] ?? 0));
  const fromStore = (team: Team, g: WeaponId): ApiResult => {
    if (inStore(team, g) <= 0) return { ok: false, error: 'none in the store' };
    const result = transferWeapon(w, gang.id, g, team.id, true);
    if (result.ok && team === attackCrew && (kept[g] ?? 0) > 0) kept[g] = (kept[g] ?? 0) - 1;
    return result;
  };
  const toStore = (team: Team, g: WeaponId): ApiResult => {
    const result = transferWeapon(w, gang.id, g, team.id, false);
    if (result.ok && team === attackCrew) kept[g] = (kept[g] ?? 0) + 1;
    return result;
  };
  /** A weapon bought into the store for the attack crew. */
  const buyForAttack = (g: WeaponId): ApiResult => {
    const result = buyWeapon(w, gang.id, g);
    if (result.ok) kept[g] = (kept[g] ?? 0) + 1;
    return result;
  };
  for (const team of crewsOf()) {
    const handed: string[] = [];
    while (gunsOf(team) > gunLimit(team)) {
      const worst = [...BEST_FIRST].reverse().find((g) => (team.weapons[g] ?? 0) > 0);
      if (!worst || !toStore(team, worst).ok) break;
      handed.push(worst);
    }
    if (handed.length) actions.push(`NOTE ${team.name} hands ${handed.join(', ')} to the store — ${gunLimit(team) ? `one gun per man (${gunLimit(team)})` : 'guns only for violent jobs'}`);
  }
  /** 1.2.38 (Robert): a crew carries the fitting gun for its job — one per man, best by the job's table first, from the store (the attack crew's own stock included). */
  const kitted = new Set<number>();
  const kitFor = (team: Team, job: GunJob, men: number): string[] => {
    const took: string[] = [];
    for (const g of GUN_ORDER[job]) {
      while (gunsOf(team) < men && inStore(team, g) > 0 && fromStore(team, g).ok) took.push(g);
    }
    return took;
  };
  /** Swap a crew's guns for the job's: everything back to the store, then the job's best. */
  const rekit = (team: Team, job: GunJob, men: number): string[] => {
    for (const g of GUNS) { const n = team.weapons[g] ?? 0; for (let i = 0; i < n; i++) if (!toStore(team, g).ok) break; }
    return kitFor(team, job, men);
  };
  /** 1.2.30: a weapon for a crew — from the store first, bought only when the store has none (and `buy` allows it). One gun per man: a full crew trades its worst gun in. */
  const supply = (team: Team, item: WeaponId, canBuy: boolean): ApiResult => {
    if (GUNS.includes(item) && gunsOf(team) >= gunLimit(team)) {
      const worst = [...BEST_FIRST].reverse().find((g) => (team.weapons[g] ?? 0) > 0);
      if (!worst || gunRank(worst) >= gunRank(item)) return { ok: false, error: 'every man already has a gun as good' };
      if (!toStore(team, worst).ok) return { ok: false, error: 'could not hand a gun in' };
    }
    // 1.2.31: explosives stay in the store until a crew is given a bomb order.
    if (item === 'explosives') return inStore(team, 'explosives') > 0 ? { ok: true, message: 'in the store' } : !canBuy ? { ok: false, error: 'none in the store' } : team === attackCrew ? buyForAttack('explosives') : buyWeapon(w, gang.id, 'explosives');
    if (inStore(team, item) > 0) return fromStore(team, item);
    if (!canBuy) return { ok: false, error: 'none in the store' };
    return buyWeapon(w, gang.id, item, team.id);
  };
  /** What a crew can use: its own guns; explosives from the store (1.2.31; 1.2.36: not the attack crew's, for another crew). */
  const carried = (team: Team, item: WeaponId) => item === 'explosives' ? (team.weapons.explosives ?? 0) + inStore(team, 'explosives') : (team.weapons[item] ?? 0);
  const bang = (team: Team) => carried(team, 'explosives') > 0;
  // 1.2.31 (Robert): only a crew holding a bombing order carries explosives;
  // every other crew hands them to the store.
  for (const team of crewsOf()) {
    const bombing = team.orderIds.some((id) => w.orders[id]?.type === 'bomb');
    const n = team.weapons.explosives ?? 0;
    if (bombing || n <= 0) continue;
    for (let i = 0; i < n; i++) toStore(team, 'explosives');
    actions.push(`NOTE ${team.name} hands ${n} explosive${n === 1 ? '' : 's'} to the store — no bombing order`);
  }
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
  // 1.2.40 (Robert): named by the Mayor in our paper's crackdown story last
  // week — lie low this week (the chief has turned on us too; see below).
  const crackdownNamed = newspaperEdition(w, gang.id).items.some((n) => n.gangId === gang.id && /CRACKDOWN/.test(n.headline));
  if (crackdownNamed) actions.push('CRACKDOWN our paper says the Mayor named us last week — the chief gets paid');
  // 1.2.41 (Robert): no fixed crime budget. All in while the police and the
  // FBI are below their action levels; lie low at them: the FBI suspicion
  // graph at its case line (78, raw 200) or the chief hostile (opinion -20 or
  // below, the Lawyer tab's hostile band). Each man's heavy-crime points stay
  // below the warrant line (200) in give(). Collecting never stops.
  const fbiAtLine = gang.suspicion * 255 / 100 > FBI_CASE_THRESHOLD;
  const chiefBandNow = w.people[w.policeChiefId] ? opinionBand(w.people[w.policeChiefId].opinion[gang.id] ?? 0) : 'neutral';
  const lieLow = fbiAtLine || chiefBandNow === 'hostile';
  actions.push(`CRIMES ours last week ${gang.history[gang.history.length - 1]?.crimes ?? 0} — ${lieLow ? `lying low (${fbiAtLine ? `FBI suspicion ${Math.round(gang.suspicion)} at the case line 78` : 'the chief is hostile'}): collecting goes on` : `all in: FBI suspicion ${Math.round(gang.suspicion)} below 78, the chief ${chiefBandNow}`}`);
  // 1.2.40 (Robert): each man's heavy-crime points as the FBI files them
  // (kidnap, smash-up 60, bomb, torch 80, kill, ambush 100; a tenth for a
  // gangster victim, half for police), fading a tenth a week; no heavy job
  // pushes any man of the crew past the FBI's warrant line (200).
  for (const [id, v] of [...mem.heat]) { const left = v - Math.trunc(v / 10); if (left > 0 && w.people[id]?.gangId === gang.id) mem.heat.set(id, left); else mem.heat.delete(id); }
  if (gang.suspicion * 255 / 100 > 200) actions.push(`NOTE suspicion ${Math.round(gang.suspicion)} is past the FBI's case line (78 on the graph)`);
  // 1.2.24: extortion stops at SUSPICION_EASE and resumes only below SUSPICION_LIE_LOW.
  const wasCooling = coolingOff.get(w) ?? false;
  // 1.2.41 (Robert): extortion runs until the FBI's case line (78 on the graph).
  const cooling = fbiAtLine;
  coolingOff.set(w, cooling);
  if (wasCooling && !cooling) actions.push(`NOTE suspicion ${Math.round(gang.suspicion)} below the FBI's case line — extortion resumes`);
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
  // 1.2.41 (Robert): collecting protection never stops — no cap by the legal books.
  const collectBudget: number = Infinity;
  // Risky street work is capped so one raid cannot take the whole gang.
  const riskyCap = Math.max(2, Math.floor(Math.max(1, gangManpower(w, gang)) * (heat >= 1 ? RISKY_SHARE_EASING : RISKY_SHARE)));
  let riskyMen = 0;
  const outOfTime = new Set<number>();
  /** 1.2.41 (Robert): the crew picked to patrol — patrol is its only order this week. */
  let patrolTeamId: number | undefined;
  // 1.2.41 (Robert): route fit. Each crew's week is planned as all its orders
  // one after another (the game's estimates summed), and a crew that ran out
  // of week last week takes no more stops than it finished then.
  const ROUTE_TYPES = new Set(['collectProtection', 'extort', 'recruit', 'intimidate', 'smashUp']);
  const seqUsed = (team: Team) => team.orderIds.reduce((n, id) => n + (w.orders[id]?.estimatedMinutes ?? 0), 0);
  const routeCap = new Map<number, number>();
  for (const t of crewsOf()) {
    const last = w.lastWeekOrders.filter((o) => o.gangId === gang.id && o.teamId === t.id && ROUTE_TYPES.has(o.type));
    if (last.some((o) => /Ran out of week/.test(o.failReason ?? ''))) routeCap.set(t.id, last.reduce((n, o) => n + (o.completedTargets ?? 0), 0));
  }
  if (routeCap.size) actions.push(`ROUTES ran out of week last week — stops capped at what each crew finished: ${[...routeCap].map(([id, n]) => `${w.teams[id]?.name ?? id} ${n}`).join(', ')}`);
  const routePlanned = new Map<number, number>();
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
  let ourBlocksCache: Set<number> | undefined;
  const territoryBlocksNowSafe = () => (ourBlocksCache ??= claimedTerritoryBlocks(w, gang.id));
  /** 1.2.43: on defence this week (set once the strength test has run). */
  let defenceNow = false;
  /** 1.2.43: blocks a rival visibly claims on our map, and the blocks beside them (claim ids). */
  let nearRivalCache: Set<number> | undefined;
  const nearRival = (blockId: number) => {
    if (!nearRivalCache) {
      const claim = (id: number) => w.blocks[id]?.layout?.mergedInto ?? id;
      const rivalCells = new Set<string>();
      for (const blk of w.blocks) { const c = w.blocks[claim(blk.id)]; if (c && knownBlockOwners(w, c, gang.id).some((id) => id !== gang.id)) rivalCells.add(`${blk.gx},${blk.gy}`); }
      nearRivalCache = new Set<number>();
      for (const blk of w.blocks) {
        let near = false;
        for (let dx = -1; dx <= 1 && !near; dx++) for (let dy = -1; dy <= 1 && !near; dy++) if (rivalCells.has(`${blk.gx + dx},${blk.gy + dy}`)) near = true;
        if (near) nearRivalCache.add(claim(blk.id));
      }
    }
    return nearRivalCache.has(w.blocks[blockId]?.layout?.mergedInto ?? blockId);
  };
  /** 1.2.42 (Robert): lawyer/accountant searches with top priority — the game alone decides whether they fit the week. */
  const staffUrgent = new Set<string>();
  /** 1.2.42: the orders that put a hood behind a counter as manager (the game's own cases). */
  const takesManager = (type: string, siteId: number) => {
    const b = w.buildings[siteId];
    if (type === 'setUpBusiness') return true;
    if (type === 'buyPremises') return !!b && b.cls !== 'empty';
    if (type === 'runBusiness') return !!b && b.managerId == null;
    return false;
  };
  const give = (label: string, team: (typeof ready)[number] | undefined, input: Omit<IssueOrderInput, 'teamId'>, kind?: OrderKind): ApiResult => {
    if (!team) {
      actions.push(`NOTE ${label} skipped — every crew's week is full`);
      timeShort = true;
      return { ok: false, error: 'Every crew is busy this week.' };
    }
    const name = w.people[team.lieutenantId]?.name ?? 'crew';
    if (team.id === patrolTeamId && input.type !== 'patrol') {
      actions.push(`NOTE ${label} not given to ${name}'s crew — it patrols this week (its only order)`);
      return { ok: false, error: 'This crew patrols this week — try elsewhere.' };
    }
    // 1.2.43 (Robert): on defence, crews keep out of rival blocks and the
    // blocks beside them (our own premises excepted), and the armed crews
    // work only at our office, our businesses and in our own blocks.
    if (defenceNow) {
      const role = roles.get(team.id);
      const armedCrew = role === 'muscle' || role === 'expendables';
      const ownSite = (id: number) => w.buildings[id]?.ownerGangId === gang.id;
      if (armedCrew && input.personId != null) {
        actions.push(`NOTE ${label} not given to ${name}'s crew — on defence: the armed men stay near our office and businesses`);
        return { ok: false, error: 'On defence — armed men stay home.' };
      }
      if (input.buildingIds?.length) {
        const keep = input.buildingIds.filter((id) => { const b = w.buildings[id]; if (!b || ownSite(id)) return true; if (armedCrew && !territoryBlocksNowSafe().has(w.blocks[b.blockId]?.layout?.mergedInto ?? b.blockId)) return false; return !nearRival(b.blockId); });
        if (!keep.length) {
          actions.push(`NOTE ${label} not given to ${name}'s crew — on defence: ${armedCrew ? 'the armed men stay near our office and businesses' : 'the target is in or beside a rival block'}`);
          return { ok: false, error: 'On defence — the target is in or beside a rival block.' };
        }
        if (keep.length < input.buildingIds.length) {
          actions.push(`NOTE ${label}: ${input.buildingIds.length - keep.length} stop(s) dropped — on defence, in or beside a rival block`);
          input = { ...input, buildingIds: keep };
        }
      }
      if (input.blockIds?.length && input.type !== 'patrol') {
        const keep = input.blockIds.filter((id) => !nearRival(id) && (!armedCrew || territoryBlocksNowSafe().has(w.blocks[id]?.layout?.mergedInto ?? id)));
        if (!keep.length) { actions.push(`NOTE ${label} not given — on defence: rival blocks and the blocks beside them are off limits`); return { ok: false, error: 'On defence — rival blocks are off limits.' }; }
        input = { ...input, blockIds: keep };
      }
    }
    // 1.2.42 (Robert): a buy or set-up that puts a manager in never leaves
    // the crew below MIN_CREW_AFTER_MANAGER men — a pool hood joins the crew
    // first if one is free; otherwise the buy waits.
    if (input.buildingIds?.length && takesManager(input.type, input.buildingIds[0])) {
      // Managers already owed by this crew's orders this week count as gone.
      const owed = () => team.orderIds.map((id) => w.orders[id]).filter((o) => o && o.targetBuildingIds.length && takesManager(o.type, o.targetBuildingIds[0])).length;
      const after = () => team.memberIds.length - owed() - 1;
      if (after() < MIN_CREW_AFTER_MANAGER && team.memberIds.length < MAX_TEAM_SIZE - 1 && team.memberIds.length < MAX_TEAM_SIZE - 1) {
        const spare = gang.poolIds.map((id) => w.people[id]).filter((x): x is Person => !!x && x.status === 'active' && x.role === 'hood' && !restingMen.has(x.id) && (roles.get(team.id) !== 'business' || x.skills.business >= 3))
          .sort((a, b) => b.skills.business - a.skills.business || a.id - b.id)[0];
        if (spare && moveToTeam(w, gang.id, spare.id, team.id).ok) actions.push(`MANAGER pool hood ${spare.name} joins ${name}'s crew before ${label} — the crew stays at ${MIN_CREW_AFTER_MANAGER}+ men after the manager goes in`);
      }
      if (after() < MIN_CREW_AFTER_MANAGER) {
        actions.push(`MANAGER buy waits: ${label} — ${name}'s crew has ${team.memberIds.length} men besides the lieutenant${owed() ? ` (${owed()} already owed to this week's buys)` : ''}; a manager would leave it below ${MIN_CREW_AFTER_MANAGER}, and no pool hood could join`);
        return { ok: false, error: `buy waits — the crew would drop below ${MIN_CREW_AFTER_MANAGER} men` };
      }
    }
    // 1.2.36 (Robert): guard office only for a crew with the time left, by the game's own check.
    if (input.type === 'guardBusiness') {
      const preview = previewOrder(w, gang.id, { ...input, teamId: team.id });
      if (preview && !crewHasTime(w, team, preview)) {
        actions.push(`NOTE ${label} not offered to ${name}'s crew — no time left this week`);
        return { ok: false, error: 'no time left this week — try elsewhere' };
      }
    }
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
    const fits = kind === 'business' || staffUrgent.has(label) ? targets : targetsThatFit(timeLedger, key, targets, freeFor(team, men));
    if (fits === 0) {
      actions.push(`NOTE ${label} not given to ${name} — about ${timeLedger[key]} min a target, ${Math.round(freeFor(team, men))} min left for ${men} man/men`);
      outOfTime.add(team.id); timeShort = true;
      return { ok: false, error: 'Not enough time left this week (time ledger).' };
    }
    if (fits < targets && input.buildingIds) input = { ...input, buildingIds: input.buildingIds.slice(0, fits) };
    let kitJob: GunJob | undefined;
    // 1.2.38 (Robert): each violent job takes the fitting gun by the real
    // tables — inside premises (or a man inside) the inside order (shotgun
    // first), on the street and in ambushes the street order (rifle first).
    // The attack crew and the Expendables arm for any violent job; another
    // crew only for a kill or an ambush. One kit a week per crew: the first
    // violent job's (the game hands guns to the men at work, not per order).
    {
      const role = roles.get(team.id);
      const target = input.buildingIds?.length ? w.buildings[input.buildingIds[0]] : input.personId != null ? (() => { const v = w.people[input.personId!]; return v?.buildingId != null ? w.buildings[v.buildingId] : undefined; })() : undefined;
      const violent = ['kill', 'smashUp', 'bomb', 'raid', 'assault', 'ambush', 'kidnap', 'torch'].includes(input.type);
      const arms = violent && (role === 'muscle' || role === 'expendables' || input.type === 'kill' || input.type === 'ambush') && input.type !== 'assault';
      const job: GunJob = input.type === 'ambush' || !target ? 'street' : 'inside';
      if (arms && !kitted.has(team.id)) kitJob = job;
    }
    // 1.2.38 (Robert): the man named for the work — Bomb the best explosives
    // man, Torch the best arson man, Kidnap and Smash Up the best fists man.
    {
      const skill = ({ bomb: 'explosives', torch: 'arson', kidnap: 'fists', smashUp: 'fists' } as Partial<Record<string, keyof Person['skills']>>)[input.type];
      if (skill && input.opts?.preferredHoodId == null) {
        const best = [team.lieutenantId, ...team.memberIds].map((id) => w.people[id])
          .filter((p): p is Person => !!p && p.status === 'active' && p.orderId == null && !restingMen.has(p.id))
          .sort((x, y) => y.skills[skill] - x.skills[skill] || x.id - y.id)[0];
        if (best) {
          input = { ...input, opts: { ...(input.opts ?? {}), preferredHoodId: best.id } as IssueOrderInput['opts'] };
          actions.push(`NOTE ${label}: ${best.name} named (${skill} ${best.skills[skill].toFixed(1)}★, the best in ${name}'s crew)`);
        }
      }
    }
    // 1.2.38 (Robert): routes avoid danger and fit the week — collect,
    // extortion and recruit stops in or beside rival-held blocks are dropped,
    // then the farthest stops from the office until the game's own estimate fits.
    if (input.type === 'bribe' && input.personId != null) {
      const target = w.people[input.personId];
      if (target && dangerBlocks.has(blockOfPerson(target))) { actions.push(`NOTE ${label} not given — ${target.name} is in a rival-held or rival-sighted block`); return { ok: false, error: 'target in a rival-held block' }; }
    }
    if (['collectProtection', 'extort', 'recruit'].includes(input.type) && input.buildingIds?.length) {
      const all = input.buildingIds;
      const safe = all.filter((id) => { const b = w.buildings[id]; return !b || !dangerBlocks.has(claimOf(b.blockId)); });
      if (safe.length < all.length) actions.push(`NOTE ${label}: ${all.length - safe.length} stop(s) dropped — in blocks rival men hold or were seen in`);
      if (!safe.length) return { ok: false, error: 'every stop is in a rival-held or rival-sighted block' };
      let ids = safe;
      const far = (id: number) => { const b = w.buildings[id]; return b ? dist(w.lots[b.lotId].center, origin) : 0; };
      const cap = routeCap.get(team.id);
      if (cap != null) {
        const room = cap - (routePlanned.get(team.id) ?? 0);
        if (room <= 0) { actions.push(`NOTE ${label} not given to ${name}'s crew — it finished ${cap} stop(s) last week and has them planned already`); return { ok: false, error: 'Route cap reached: no time left this week — try elsewhere' }; }
        if (ids.length > room) { actions.push(`NOTE ${label}: ${ids.length - room} stop(s) dropped — ${name}'s crew finished ${cap} last week`); ids = [...ids].sort((a, b) => far(a) - far(b)).slice(0, room); }
      }
      const dropped: number[] = [];
      for (;;) {
        const preview = previewOrder(w, gang.id, { ...input, buildingIds: ids, teamId: team.id });
        if (!preview || ids.length <= 1 || (crewHasTime(w, team, preview) && seqUsed(team) + preview.estimatedMinutes <= MINUTES_PER_WEEK)) break;
        const risky = (id: number) => { const b = w.buildings[id]; return b && riskyBlocks.has(claimOf(b.blockId)) ? 1 : 0; };
        const worst = [...ids].sort((x, y) => risky(y) - risky(x) || far(y) - far(x))[0];
        ids = ids.filter((id) => id !== worst); dropped.push(worst);
      }
      if (dropped.length) actions.push(`NOTE ${label}: ${dropped.length} stop(s) dropped so the crew's whole week fits (its orders one after another; beside rival blocks first, then the farthest)`);
      input = { ...input, buildingIds: ids };
    }
    // 1.2.40 (Robert): heavy-crime points — no man of the crew past the warrant line.
    const heavyRow = CRIME_ROW_SUSPICION[input.type] ?? 0;
    let heavyPoints = 0;
    if (heavyRow > HEAVY_CRIME_SUSPICION) {
      const victim = input.personId != null ? w.people[input.personId] : undefined;
      const shop = input.type === 'smashUp' && input.buildingIds?.length && w.buildings[input.buildingIds[0]]?.ownerPersonId != null;
      const each = shop ? 0 : victim && (victim.role === 'police' || victim.role === 'policeChief') ? heavyRow >> 1
        : victim && (victim.role === 'hood' || victim.role === 'lieutenant') || input.type === 'ambush' ? Math.trunc(heavyRow / 10) : heavyRow;
      const crewIds = [team.lieutenantId, ...team.memberIds];
      const top = Math.max(0, ...crewIds.map((id) => mem.heat.get(id) ?? 0));
      // 1.2.41 (Robert): a multi-stop order is trimmed to the allowance left, not refused whole.
      const stops = input.buildingIds?.length ?? 0;
      if (each > 0 && stops > 1 && top + each * stops > MEMBER_WARRANT_BAR) {
        const room = Math.max(0, Math.floor((MEMBER_WARRANT_BAR - top) / each));
        if (room >= 1) { actions.push(`NOTE ${label}: trimmed to ${room} of ${stops} stop(s) — heavy-crime allowance left before the warrant line (${MEMBER_WARRANT_BAR})`); input = { ...input, buildingIds: input.buildingIds!.slice(0, room) }; }
      }
      heavyPoints = each * Math.max(1, input.buildingIds?.length ?? 1);
      if (heavyPoints > 0 && top + heavyPoints > MEMBER_WARRANT_BAR) {
        actions.push(`NOTE ${label} not given to ${name}'s crew — a man there has ${Math.round(top)} heavy-crime points; +${heavyPoints} would pass the FBI's warrant line (${MEMBER_WARRANT_BAR})`);
        return { ok: false, error: 'A man would pass the warrant line — try elsewhere.' };
      }
    }
    if (kind !== 'business' && input.type !== 'patrol') {
      const preview = previewOrder(w, gang.id, { ...input, teamId: team.id });
      if (preview && team.orderIds.length && seqUsed(team) + preview.estimatedMinutes > MINUTES_PER_WEEK) {
        actions.push(`NOTE ${label} not given to ${name}'s crew — its orders one after another already take ${Math.round(seqUsed(team))} of ${MINUTES_PER_WEEK} min (+${Math.round(preview.estimatedMinutes)})`);
        return { ok: false, error: 'Not enough time left this week (orders one after another) — try elsewhere' };
      }
    }
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
    if (result.ok && ROUTE_TYPES.has(input.type)) { const o = team.orderIds.length ? w.orders[team.orderIds[team.orderIds.length - 1]] : undefined; routePlanned.set(team.id, (routePlanned.get(team.id) ?? 0) + Math.max(1, o?.targetBuildingIds.length ?? input.buildingIds?.length ?? 1)); }
    if (result.ok && heavyPoints > 0) for (const id of [team.lieutenantId, ...team.memberIds]) mem.heat.set(id, (mem.heat.get(id) ?? 0) + heavyPoints);
    if (result.ok && kitJob && !kitted.has(team.id)) {
      kitted.add(team.id);
      const took = rekit(team, kitJob, team.memberIds.length + 1);
      // A crew other than the attack crew short of guns for the job buys the
      // cheapest gun (the revolver) for the store, while the cash is above the reserve.
      const cheapest = [...GUNS].sort((a, b) => WEAPONS[a].cost - WEAPONS[b].cost)[0];
      while (team !== attackCrew && gunsOf(team) < team.memberIds.length + 1 && gang.cash >= reserve + WEAPONS[cheapest].cost && buyWeapon(w, gang.id, cheapest).ok && fromStore(team, cheapest).ok) took.push(`${cheapest} (bought)`);
      actions.push(`NOTE ${name} carries ${took.length ? took.join(', ') : 'no gun (none in the store)'} for ${label} (${kitJob} order: ${GUN_ORDER[kitJob].join(' > ')})`);
    }
    if (result.ok && input.type === 'bomb' && (team.weapons.explosives ?? 0) <= 0 && fromStore(team, 'explosives').ok) actions.push(`NOTE explosives from the store to ${name} for the bombing`);
    if (result.ok) {
      const order = team.orderIds.length ? w.orders[team.orderIds[team.orderIds.length - 1]] : undefined;
      const minutes = order?.estimatedMinutes || (team.timeUsed - usedBefore) / Math.max(1, order?.opts.manpower ?? 1);
      noteLedger(timeLedger, key, minutes / Math.max(1, order?.targetBuildingIds.length || 1));
    }
    return result;
  };
  /** Share of this crew's week still free. */
  const freeShare = (team: (typeof ready)[number]) => 1 - crewUsedShare(w, team);
  /** 1.2.37 (Robert): bribes send the sharpest man — the free man with the most intelligence, named on the order. */
  // 1.2.41 (fix, seen: the chief's bribe "unavailable" every week): only a man
  // the game would staff now (its readyForPlanning: not inside a building) and
  // not already named on one of the crew's orders this week.
  const sharpestOf = (team: Team) => [team.lieutenantId, ...team.memberIds].map((id) => w.people[id])
    .filter((p): p is Person => !!p && readyForPlanning(w, p) && p.orderId == null && !restingMen.has(p.id)
      && !team.orderIds.some((oid) => w.orders[oid]?.assignedIds.includes(p.id) || w.orders[oid]?.opts.preferredHoodId === p.id))
    .sort((a, b) => b.skills.intelligence - a.skills.intelligence || a.id - b.id)[0];
  const sharpCrews = () => ready.filter((t) => t !== bizCrew && !outOfTime.has(t.id) && freeShare(t) >= 0.2 && sharpestOf(t))
    .sort((a, b) => sharpestOf(b)!.skills.intelligence - sharpestOf(a)!.skills.intelligence || Number(Object.values(b.vehicles).some((n) => n > 0)) - Number(Object.values(a.vehicles).some((n) => n > 0)) || a.id - b.id);
  const sharp = (team: Team) => { const p = sharpestOf(team); return p ? { preferredHoodId: p.id } : {}; };
  const knivesOf = (team: Team) => { const men = [team.lieutenantId, ...team.memberIds].map((id) => w.people[id]).filter((p): p is Person => !!p && p.status === 'active'); return men.length ? men.reduce((a, p) => a + p.skills.knives, 0) / men.length : 5; };
  const lowKnifeCrews = () => ready.filter((t) => t !== bizCrew && !outOfTime.has(t.id)).sort((a, b) => knivesOf(a) - knivesOf(b) || a.id - b.id);
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
  // 1.2.38 (Robert): the blocks rival patrols cover, by what our map shows —
  // blocks a rival visibly holds (patrols walk their own territory) and not
  // us, and blocks where rival men were reported seen — plus the blocks
  // beside them. Collect, extortion, recruit and specialist visits keep out.
  // 1.2.39 (Robert): the blocks beside them are risky, not barred: kept on
  // routes, and dropped first when a route runs short of time.
  const { core: dangerBlocks, near: riskyBlocks } = (() => {
    const core = new Set<number>();
    for (const b of w.blocks) if (rivalClaimSeen(b.id) && !blockIsOurs(b.id)) core.add(claimOf(b.id));
    for (const id of sightedBlocks()) core.add(id);
    const at = new Map<string, number>();
    for (const b of w.blocks) at.set(`${b.gx},${b.gy}`, claimOf(b.id));
    const near = new Set<number>();
    for (const b of w.blocks) {
      if (!core.has(claimOf(b.id))) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const n = at.get(`${b.gx + dx},${b.gy + dy}`); if (n != null && !core.has(n)) near.add(n); }
    }
    return { core, near };
  })();
  actions.push(`DANGER ${dangerBlocks.size} block(s) rival-held or rival-sighted — collect, extortion, recruit and specialist visits keep out; ${riskyBlocks.size} block(s) beside them risky (dropped first when time runs short)`);
  const blockOfPerson = (p: Person) => {
    const b = p.buildingId != null ? w.buildings[p.buildingId] : undefined;
    if (b) return claimOf(b.blockId);
    return claimOf(w.blocks.reduce((best, k) => (dist(k.center, p.pos) < dist(best.center, p.pos) ? k : best), w.blocks[0]).id);
  };
  /** 1.2.38: a specialist visit (lawyer bribes) only to a man outside the danger blocks. */
  const specialistVisit = (type: Parameters<typeof queueSpecialistJob>[2], targetId: number | null, beats?: number[]): ApiResult => {
    const target = targetId != null ? w.people[targetId] : undefined;
    if (target && dangerBlocks.has(blockOfPerson(target))) return { ok: false, error: `${target.name} is in a rival-held or rival-sighted block — the visit waits` };
    return queueSpecialistJob(w, gang.id, type, targetId, beats);
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
  // 1.2.37 (Robert): losses. The gang is weak when its men fall below
  // a share of the biggest rival as far as we know it (1.2.43: see below; the rival men
  // our men have seen and who are still alive), or its cash falls below the
  // reserve (three weeks of wages). Weak, the armed crews keep out of rival
  // blocks (no hits, strikes, smash-ups or bombs on rivals); otherwise they
  // ambush rival men with rifles and the rival HQ strike comes first.
  // 1.2.40 (Robert): the larger of the men we have identified (our list, never
  // their true state) and the gang's manpower on the graph (last week).
  const identified = (g: Gang) => gang.knownPeople.filter((id) => w.people[id]?.gangId === g.id && !gang.prisonerIds.includes(id)).length;
  /** 1.2.40: he and the known men of his gang last reported in the same block at the same minute. */
  const seenWith = (p: Person) => {
    const me = mem.seen.get(p.id);
    if (!me || me.minute < 0 || me.block == null) return 1;
    return 1 + [...mem.seen].filter(([id, x]) => id !== p.id && !x.missing && !x.dead && x.gangId === me.gangId && x.minute === me.minute && x.block === me.block).length;
  };
  /** 1.2.40 (Robert): lieutenants first, then the last-seen place nearest our office (never seen: last). */
  const byRoleAndPlace = (a: Person, b: Person) => {
    const far = (p: Person) => { const x = mem.seen.get(p.id); return x?.pos ? dist(x.pos, hqCenter(w, gang.id)) : Infinity; };
    return (b.role === 'lieutenant' ? 1 : 0) - (a.role === 'lieutenant' ? 1 : 0) || far(a) - far(b) || a.id - b.id;
  };
  const menOf = (g: Gang) => Math.max(identified(g), g.history[g.history.length - 1]?.manpower ?? 0);
  // 1.2.43 (Robert): strong only when our men are at least STRONG_MEN_FACTOR×
  // the combined men of every gang at war or aggressive with us (their stance
  // or ours). (1.2.37–1.2.42 compared with the biggest rival alone, and called
  // us weak only below 0.75× of it — so 17 against 21 counted as strong.)
  const hostileToUs = Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated
    && (['war', 'aggression'].includes(gang.known[g.id] ?? 'peace') || ['war', 'aggression'].includes(gang.offered[g.id] ?? 'peace')));
  const hostileMen = hostileToUs.reduce((n, g) => n + menOf(g), 0);
  const ourMen = crewMen();
  const strong = ourMen >= hostileMen * STRONG_MEN_FACTOR;
  // 1.2.43 (Robert): LOSS_DEFENCE_KILLS or more of our men killed by rivals in
  // the last LOSS_WINDOW_WEEKS weeks puts us on defence for LOSS_DEFENCE_WEEKS weeks.
  const rivalNames = new Set(Object.values(w.gangs).filter((g) => g.id !== gang.id).map((g) => g.name));
  const killedRecently = memberLosses(w, gang.id, w.week - LOSS_WINDOW_WEEKS).filter((l) => l.by != null && rivalNames.has(l.by)).length;
  if (killedRecently >= LOSS_DEFENCE_KILLS && (mem.defenceUntil ?? -Infinity) < w.week) {
    mem.defenceUntil = w.week + LOSS_DEFENCE_WEEKS - 1;
    actions.push(`DEFENCE ${killedRecently} of our men killed by rivals in the last ${LOSS_WINDOW_WEEKS} weeks — on defence through week ${mem.defenceUntil}`);
  }
  const lossDefence = (mem.defenceUntil ?? -Infinity) >= w.week;
  /** 1.2.43: on defence (weak, or after heavy losses) — the old `weak` flag everywhere. */
  const weak = !strong || lossDefence;
  defenceNow = weak;
  // 1.2.38 (Robert): going straight (the goal, or already under way) — no
  // retaliation, and no hits on rivals at war with us (what their stance shows us).
  const straightNow = goal === 'straight' || gang.goingStraight;
  const atWarWithUs = (gangId: number | null | undefined) => gangId != null && gang.known[gangId] === 'war';
  /** 1.2.38 (Robert): weak or going straight, no kill, kidnap, raid, torch, bomb or smash-up on a rival at war with us. */
  const noHitOn = (gangId: number | null | undefined) => (weak || straightNow) && atWarWithUs(gangId);
  // 1.2.40 (Robert): we mirror each rival — the stance it last offered us is
  // the stance we offer it (replaces 1.2.38's ceasefire toward all).
  // 1.2.43 (Robert): while weak no war stance is mirrored, and we offer peace
  // to the weakest gang at war with us.
  {
    const set: string[] = [];
    const atWar = Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated && gang.known[g.id] === 'war');
    const peaceTo = !strong && atWar.length ? [...atWar].sort((x, y) => menOf(x) - menOf(y) || x.id - y.id)[0] : undefined;
    for (const g of Object.values(w.gangs)) {
      if (g.id === gang.id || g.eliminated) continue;
      const theirs = gang.known[g.id] ?? 'peace';
      const want = g === peaceTo ? 'peace' : theirs;
      if (!strong && want === 'war' && g !== peaceTo) { if ((gang.offered[g.id] ?? 'peace') !== 'war') actions.push(`NOTE stance: ${g.name} is at war with us — not mirrored while we are weak`); continue; }
      if ((gang.offered[g.id] ?? 'peace') === want) continue;
      if (setDiplomacy(w, gang.id, g.id, want).ok) set.push(`${g.name} ${want}${g === peaceTo ? ` (peace offered: the weakest at war with us, ${menOf(g)} men)` : ''}`);
    }
    if (set.length) actions.push(`OK stance ${strong ? 'mirrored' : 'set while weak'}: ${set.join(', ')}`);
    actions.push(`STANCE ours/theirs: ${Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated).map((g) => `${g.name} ${gang.offered[g.id] ?? 'peace'}/${gang.known[g.id] ?? 'peace'}`).join(', ')}`);
  }
  actions.push(`STRENGTH ${ourMen} men against ${hostileMen} combined men of the gangs at war or aggressive with us (${hostileToUs.map((g) => `${g.name} ${menOf(g)}`).join(', ') || 'none'}; strong at ${STRONG_MEN_FACTOR}× = ${Math.ceil(hostileMen * STRONG_MEN_FACTOR)}) — ${!weak ? 'ATTACK: strong enough — ambush rival men with rifles, rival HQ first' : `DEFENCE: ${!strong ? `${ourMen} is below ${STRONG_MEN_FACTOR}× ${hostileMen}` : ''}${!strong && lossDefence ? '; ' : ''}${lossDefence ? `heavy losses (${killedRecently} killed by rivals in ${LOSS_WINDOW_WEEKS} weeks; defence through week ${mem.defenceUntil})` : ''} — no ambushes or HQ strikes, crews keep out of rival blocks and the blocks beside them, armed men stay near our office and businesses`}`);
  // 1.2.35 (Robert): managers by what they earn — the game's profit rule
  // (0.45 + business × 0.16 + organization × 0.05) less what he skims. Every
  // week each manager is compared with the best free hood (pool or any crew).
  // 1.2.36 (Robert): a swap needs 0.5★ more business; the hood named is never
  // a lieutenant or a hood promoted this week, and joins the business crew
  // only with 3★ business; he is kept off this week's buys (they name another
  // hand); Run Business goes out after the buys, and only when the business
  // crew still has the time; a site with a swap under way is not offered
  // again; each swap's outcome is logged the week after.
  const swapPlans: { site: Building; label: string; cand: Person; old: Person; gain: number }[] = [];
  const swapCands = new Set<number>();
  const pendingSwaps = swapsPending.get(w) ?? new Map<number, { orderId: number; candId: number; oldId: number; week: number }>();
  swapsPending.set(w, pendingSwaps);
  for (const [siteId, sw] of [...pendingSwaps]) {
    const live = w.orders[sw.orderId];
    if (live && live.state !== 'done' && live.state !== 'failed') continue;
    const site = w.buildings[siteId];
    const label = `${BUILDING_BY_ID[site?.typeId ?? '']?.name ?? site?.typeId ?? 'site'} #${siteId}`;
    const ran = live ?? w.lastWeekOrders.find((o) => o.id === sw.orderId);
    const cand = w.people[sw.candId], old = w.people[sw.oldId];
    const now = site?.managerId != null ? w.people[site.managerId] : undefined;
    actions.push(site?.managerId === sw.candId
      ? `MANAGER SWAP at ${label} worked: ${cand?.name ?? sw.candId} runs it now in place of ${old?.name ?? sw.oldId} (Run Business given week ${sw.week})`
      : `MANAGER SWAP at ${label} did not take: ${ran ? (ran.failReason || ran.results.join(' ') || `order ${ran.state}`) : 'the order was cancelled'} — manager now ${now?.name ?? 'nobody'} (Run Business given week ${sw.week})`);
    pendingSwaps.delete(siteId);
  }
  if (bizCrew && ready.includes(bizCrew)) {
    // 1.2.37 (Robert): the estimated takings use only business and
    // organization — the game's manager factor — and a swap needs them 10% or
    // more higher (this replaces the 0.5★ rule). An illegal site prefers the
    // hood with the most business + stealth + organization among those, for
    // safety from FBI raids; a legal site the one with the highest takings.
    const earns = (m: Person) => 0.45 + m.skills.business * 0.16 + m.skills.organization * 0.05;
    const fbiSafe = (m: Person) => m.skills.business + m.skills.stealth + m.skills.organization;
    const lines: string[] = [];
    const sites = buildingList(w).filter((b) => b.ownerGangId === gang.id && !b.isHQ && b.managerId != null && b.state === 'trading' && w.people[b.managerId])
      .sort((a, b) => b.lastProfit - a.lastProfit || a.id - b.id);
    for (const site of sites) {
      const old = w.people[site.managerId!]!;
      const label = `${BUILDING_BY_ID[site.typeId]?.name ?? site.typeId} #${site.id}`;
      if (pendingSwaps.has(site.id)) { lines.push(`${label}: a swap is under way`); continue; }
      const pool = [...idlePool().map((id) => w.people[id]), ...crewsOf().flatMap((t) => t.memberIds.map((id) => w.people[id]))]
        .filter((p): p is Person => !!p && p.status === 'active' && p.role === 'hood' && p.orderId == null && !restingMen.has(p.id) && !swapCands.has(p.id) && !promotedNow.has(p.id)
          && (bizCrew.memberIds.includes(p.id) || p.skills.business >= 3) && (mem.skimmers.has(old.id) ? fbiSafe(p) > 0 : earns(p) >= earns(old) * (1 + MANAGER_SWAP_GAIN)))
        .sort((x, y) => (site.cls === 'illegal' ? fbiSafe(y) - fbiSafe(x) : 0) || earns(y) - earns(x) || x.id - y.id);
      const cand = pool[0];
      if (!cand) continue;
      const gain = site.lastProfit > 0 ? Math.round(site.lastProfit * (earns(cand) / earns(old) - 1)) : 0;
      const pct = Math.round((earns(cand) / earns(old) - 1) * 100);
      if (!bizCrew.memberIds.includes(cand.id)) {
        if (bizCrew.memberIds.length >= MAX_TEAM_SIZE - 1) { lines.push(`${label}: ${cand.name} (business ${cand.skills.business.toFixed(1)}★) would replace ${old.name} (${old.skills.business.toFixed(1)}★), but the business crew is full`); continue; }
        if (!tryMove(cand.id, bizCrew.id, `manager swap: ${cand.name} joins the business crew to take over ${label}`).ok) continue;
      }
      swapCands.add(cand.id);
      swapPlans.push({ site, label, cand, old, gain });
      lines.push(`${label}: ${cand.name} (business ${cand.skills.business.toFixed(1)}★, org ${cand.skills.organization.toFixed(1)}★${site.cls === 'illegal' ? `, stealth ${cand.skills.stealth.toFixed(1)}★` : ''}) for ${old.name} (business ${old.skills.business.toFixed(1)}★, org ${old.skills.organization.toFixed(1)}★${site.cls === 'illegal' ? `, stealth ${old.skills.stealth.toFixed(1)}★` : ''}) — takings +${pct}%${gain > 0 ? `, about $${gain} a week more` : ''}${site.cls === 'illegal' ? ' (illegal: most business + stealth + organization)' : ''}; Run Business after the buys`);
    }
    actions.push(`MANAGERS ${sites.length} run by our men; ${lines.length ? lines.join('; ') : 'no free hood would raise any site\'s takings by 10% or more'}`);
  }
  /** 1.2.36: the business hand a buy names while a swap hood is kept off buys — the one with the fewest buys this week, then the best manager by the game's pick. */
  const buysNamed = new Map<number, number>();
  // 1.2.37: the lieutenant counts as a business hand too (the game sends him on a buy as well).
  const buyerFor = (team: Team) => [team.lieutenantId, ...team.memberIds].map((id) => w.people[id])
    .filter((p): p is Person => !!p && p.status === 'active' && (p.role === 'hood' || p.id === team.lieutenantId) && !restingMen.has(p.id) && !swapCands.has(p.id))
    .sort((a, b) => (buysNamed.get(a.id) ?? 0) - (buysNamed.get(b.id) ?? 0) || (b.skills.business + b.skills.organization) - (a.skills.business + a.skills.organization) || a.id - b.id)[0];
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
    const hood = donor?.memberIds.map((m) => w.people[m]).filter((p) => p && p.status === 'active' && p.orderId == null && roleStars(p, roles.get(team.id) ?? 'collect') >= 3 && !moveRefused(desk, p.id, team.id))[0];
    if (donor && hood) tryMove(hood.id, team.id, `move ${hood.name} to ${w.people[team.lieutenantId]?.name ?? 'crew'} (out of time last week)`);
  }

  const origin = hqCenter(w, gang.id);
  const nearer = (a: { lotId: number }, b: { lotId: number }) => dist(w.lots[a.lotId].center, origin) - dist(w.lots[b.lotId].center, origin);
  const allHoodVenues = buildingList(w).filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === 'hood' && b.state !== 'destroyed').sort(nearer);
  // 1.2.43 (Robert): remember where our recruiters went; after
  // RECRUIT_MOVE_WEEKS empty weeks the runs move to venues not tried in the
  // last RECRUIT_FRESH_WEEKS weeks, in blocks not tried then either, further
  // from our office than the venues tried (the nearest of those first).
  const tried = mem.venueTried ??= new Map<number, number>();
  for (const o of w.lastWeekOrders) if (o.gangId === gang.id && o.type === 'recruit' && (o.opts.recruitAs ?? 'hood') === 'hood') for (const id of o.targetBuildingIds) tried.set(id, w.week - 1);
  for (const [id, wk] of [...tried]) if (w.week - wk > RECRUIT_FRESH_WEEKS) tried.delete(id);
  let hoodSites = chooseHoodRecruitSites(allHoodVenues, recruitMemory);
  if ((mem.dryRecruitWeeks ?? 0) >= RECRUIT_MOVE_WEEKS) {
    const triedBlocks = new Set([...tried.keys()].map((id) => w.buildings[id]?.blockId).filter((x): x is number => x != null));
    const far = Math.max(0, ...[...tried.keys()].map((id) => w.buildings[id]).filter((b): b is Building => !!b).map((b) => dist(w.lots[b.lotId].center, origin)));
    const fresh = allHoodVenues.filter((b) => !tried.has(b.id) && !triedBlocks.has(b.blockId));
    const beyond = fresh.filter((b) => dist(w.lots[b.lotId].center, origin) > far);
    const moved = [...beyond, ...fresh.filter((b) => !beyond.includes(b)).reverse()];
    if (moved.length) {
      hoodSites = moved;
      actions.push(`RECRUIT MOVE recruit runs empty ${mem.dryRecruitWeeks} weeks — new blocks: ${moved.length} venue(s) not tried in ${RECRUIT_FRESH_WEEKS} weeks (${beyond.length} further out than the ${Math.round(far)} m reached so far)`);
    } else actions.push(`RECRUIT MOVE recruit runs empty ${mem.dryRecruitWeeks} weeks — every venue's block was tried in the last ${RECRUIT_FRESH_WEEKS} weeks; the usual venues`);
  }

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
    // 1.2.40 (Robert): our HQ and offices too, and the hit goes out while lying low as well.
    const officesOurs = buildingList(w).filter((b) => isGangOffice(b, gang.id));
    const watchedSites = ours.concat(ours.map((b) => (b.frontId != null ? w.buildings[b.frontId] : undefined)).filter((b): b is Building => !!b && watched.has(b.id)), officesOurs);
    const agents = w.fbiIds.map((id) => w.people[id]).filter((a): a is NonNullable<typeof a> => !!a && a.status === 'active' &&
      watchedSites.some((b) => dist(a.pos, buildingDoor(w, b)) <= 30));
    if (agents.length) {
      const agent = agents[0];
      const total = (p: NonNullable<(typeof w.people)[number]>) => Object.values(p.skills).reduce((a, b) => a + b, 0);
      // 1.2.25: never a business crew hood, and each man's own wanted level is
      // checked (a killing is risky work: below WANTED_RISKY_HOLD, under the rest line).
      // 1.2.37 (Robert): an Expendables man first, when one is clean enough.
      const isExp = (id: number) => crewsOf().some((team) => roles.get(team.id) === 'expendables' && team.memberIds.includes(id));
      // 1.2.40 (Robert): an Expendable only.
      const hood = crewsOf().filter((team) => roles.get(team.id) === 'expendables').flatMap((team) => team.memberIds).map((id) => w.people[id])
        .filter((p): p is NonNullable<typeof p> => !!p && p.status === 'active' && p.role === 'hood' && !restingMen.has(p.id)
          && p.wanted < WANTED_RISKY_HOLD && !(heatOfMan(p.id) >= STREET_HEAT_REST && p.wanted >= REST_WANTED))
        .sort((a, b) => Number(isExp(b.id)) - Number(isExp(a.id)) || total(a) - total(b) || a.id - b.id)[0];
      if (hood) {
        moveToPool(w, gang.id, hood.id);
        if ((gang.weapons.pistol ?? 0) < 1 && gang.cash > WEAPONS.pistol.cost) buyWeapon(w, gang.id, 'pistol');
        const result = issueStreetOrder(w, gang.id, [hood.id], 'kill', agent.id, null);
        const at = watchedSites.filter((b) => dist(agent.pos, buildingDoor(w, b)) <= 30).sort((a, b) => dist(agent.pos, buildingDoor(w, a)) - dist(agent.pos, buildingDoor(w, b)))[0];
        logResult(actions, `FBI agent ${agent.name} seen at our ${at ? (BUILDING_BY_ID[at.typeId]?.name ?? at.typeId) : 'site'}${lieLow ? ' (lying low, sent all the same)' : ''} — ${hood.name} (expendable) sent to kill him; the FBI cannot be bought`, result.ok, result.ok ? '' : result.error);
        if (result.ok) { hitmen.add(hood.id); restingMen.add(hood.id); }
      } else actions.push(`NOTE FBI agent ${agent.name} at one of our sites — no Expendable clean enough to send`);
    }
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
  // 1.2.41 (Robert): a better-one search pauses after SPECIALIST_EMPTY_WEEKS empty weeks (until ours is lost).
  // 1.2.42 (Robert): a paused search restarts after SPEC_RESTART_3 weeks when
  // ours is 3★, after SPEC_RESTART_4 weeks at 4★; at SPEC_STOP_STARS★ or more
  // it stops for good. Below 3★ a d4 is rolled every week: 1–3 search, 4 pause.
  // With none hired the search goes on as before.
  const searchPaused = (role: 'lawyer' | 'accountant', lost: boolean) => {
    const paused = mem.specPausedAt!;
    if (lost) { mem.specEmpty.set(role, 0); paused.delete(role); return false; }
    const ours = role === 'lawyer' ? lawyerNow : (gang.accountantId == null ? undefined : w.people[gang.accountantId]);
    const stars = specialistStars(ours);
    if (stars >= SPEC_STOP_STARS) { actions.push(`NOTE ${role} search stopped for good — ours is ${stars.toFixed(1)}★`); return true; }
    if (stars < 3) {
      const roll = rng.int(1, 4);
      if (roll === 4) actions.push(`NOTE ${role} search paused this week — ours is ${stars.toFixed(1)}★, d4 rolled 4`);
      else actions.push(`NOTE ${role} search this week — ours is ${stars.toFixed(1)}★, d4 rolled ${roll}`);
      return roll === 4;
    }
    const n = mem.specEmpty.get(role) ?? 0;
    if (n < SPECIALIST_EMPTY_WEEKS) return false;
    if (!paused.has(role)) paused.set(role, w.week);
    const wait = stars >= 4 ? SPEC_RESTART_4 : SPEC_RESTART_3;
    const since = w.week - paused.get(role)!;
    if (since >= wait) {
      mem.specEmpty.set(role, 0); paused.delete(role);
      actions.push(`NOTE ${role} search restarts — paused ${since} weeks, ours is ${stars.toFixed(1)}★ (restart after ${wait})`);
      return false;
    }
    actions.push(`NOTE ${role} search paused — ${n} empty weeks in a row (nobody better than ours, ${stars.toFixed(1)}★); restarts after ${wait} weeks paused (${since} so far)`);
    return true;
  };
  // 1.2.42 (Robert): the recruit crew does the lawyer and accountant
  // searches, spread over several places — one desk per block, a different
  // starting desk each week; the crew's time decides how many it walks.
  // 1.2.42 (Robert, point 9): with no lawyer (or accountant) and a free one
  // in the city we can afford, his search goes before every other order, to
  // any crew (the game sends the lieutenant when no hood is free). How the
  // last one was lost is logged.
  const STAFF_TOP_VALUE = 1e12;
  const staffMissing = (role: 'lawyer' | 'accountant') => {
    const id = role === 'lawyer' ? gang.lawyerId : gang.accountantId;
    const now = id == null ? undefined : w.people[id];
    const seen = mem.staffSeen ??= new Map();
    if (now && now.gangId === gang.id && now.status === 'active') { seen.set(role, now.id); return false; }
    const last = now ?? (seen.has(role) ? w.people[seen.get(role)!] : undefined);
    const how = !last ? 'none hired yet this session'
      : last.status === 'dead' ? `${last.name} was killed${last.diedWeek != null ? ` (week ${last.diedWeek})` : ''}`
      : ['arrested', 'onTrial', 'jailed'].includes(last.status) ? `${last.name} was taken by the law (${last.status})`
      : last.gangId !== gang.id ? `${last.name} left us${last.pay < last.payDemand ? ` — paid $${last.pay}, wanted $${last.payDemand}` : ` (paid $${last.pay}, wanted $${last.payDemand}, loyalty ${Math.round(last.loyalty)})`}`
      : `${last.name} is ${last.status}`;
    const free = peopleList(w).filter((p) => p.role === role && p.gangId == null && p.status === 'active');
    const affordable = free.filter((p) => hireQuote(w, p, gang.id) <= gang.cash);
    actions.push(`STAFF no ${role}: ${how}; ${free.length} free in the city, ${affordable.length} affordable, ${gang.recruitIds.filter((x) => w.people[x]?.role === role).length} on our list${affordable.length ? ' — his search goes first this week' : ''}`);
    return affordable.length > 0;
  };
  const specSearch = (role: 'lawyer' | 'accountant', urgent = false) => {
    const all = buildingList(w).filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === role && b.state !== 'destroyed').sort(nearer);
    const blocks = new Set<number>();
    const one = all.filter((b) => (blocks.has(b.blockId) ? false : (blocks.add(b.blockId), true)));
    const start = one.length ? w.week % one.length : 0;
    const stops = [...one.slice(start), ...one.slice(0, start)].map((b) => b.id);
    const crew = urgent ? undefined : ready.find((t) => roles.get(t.id) === 'recruit');
    if (!crew && !urgent) actions.push(`NOTE ${role} search: no recruit crew this week — any crew with time takes it`);
    return { stops, teams: crew ? [crew] : undefined, urgent };
  };
  if (lawyerLost ? (w.week >= 4 || gang.suspicion >= 20 || gang.lawyerId != null) : !searchPaused('lawyer', false)) {
    const desks = buildingList(w).filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === 'lawyer' && b.state !== 'destroyed').sort(nearer);
    const desk = desks.length ? desks[w.week % desks.length] : undefined;
    if (lawyerLost && gang.lawyerId != null) actions.push(`NOTE lawyer ${lawyerNow?.name ?? ''} lost (${lawyerNow?.status ?? 'gone'}) — recruiting a new one first`);
    // 1.2.23: hoods come before the lawyer unless the law is already close.
    const urgent = trialNow || gang.suspicion >= 40 || (lawyerLost && gang.lawyerId != null);
    const why = !lawyerLost ? `ours is ${specialistStars(lawyerNow).toFixed(1)}★ — a better one swaps him` : urgent ? 'the law is close' : 'hoods first while the heat is low';
    const value = lawyerLost ? (urgent ? 2500 : 250) : specialistStars(lawyerNow) < 3 ? 400 : 150;
    const search = specSearch('lawyer', lawyerLost && staffMissing('lawyer'));
    const lLabel = `recruit lawyer (${search.stops.length} place${search.stops.length === 1 ? '' : 's'})`;
    if (search.urgent) staffUrgent.add(lLabel);
    if (desk && search.stops.length) propose({ label: lLabel, kind: 'safety', value: search.urgent ? STAFF_TOP_VALUE : value, why: search.urgent ? 'no lawyer — top priority (point 9)' : why, role: 'recruit', teams: search.teams, minFree: search.urgent ? 0 : undefined,
      input: { type: 'recruit', buildingIds: search.stops, opts: { manpower: 1, recruitAs: 'lawyer' } } });
    else actions.push('NOTE no lawyer\'s office to recruit at');
  }

  const hq = buildingList(w).find((b) => b.isHQ && b.ownerGangId === gang.id);
  // 1.2.39 (Robert): armed pool hoods inside the office count as guards — no
  // Guard Office order while they are at least as many as it would post (one man).
  const poolGuards = hq ? armedPoolDefenders(w, hq) : 0;
  // 1.2.40 (Robert): Guard Office stays while the office was attacked in the
  // last OFFICE_QUIET_WEEKS weeks (our men lost at an office of ours, or the
  // office damaged); after that the armed pool hoods inside defend it alone.
  {
    const offices = buildingList(w).filter((b) => isGangOffice(b, gang.id));
    const hit = memberLosses(w, gang.id, w.week - 1).some((l) => l.week === w.week - 1 && l.buildingId != null && offices.some((b) => b.id === l.buildingId))
      || offices.some((b) => b.state === 'damaged' || b.fireWeek === w.week - 1);
    if (hit) mem.lastOfficeTrouble = w.week - 1;
  }
  const officeQuiet = w.week - 1 - mem.lastOfficeTrouble >= OFFICE_QUIET_WEEKS;
  if (w.week >= 2 && hq) actions.push(`NOTE office: ${officeQuiet ? `quiet ${OFFICE_QUIET_WEEKS}+ weeks` : `attacked in week ${mem.lastOfficeTrouble}`}; ${poolGuards} armed pool hood(s) inside${officeQuiet && poolGuards >= 1 ? ' — no Guard Office, the pool defends it' : ''}`);
  if (w.week >= 2 && gangManpower(w, gang) >= 8 && hq && (!officeQuiet || poolGuards < 1)) {
    // 1.2.41 (Robert): Guard Office only by the Expendables — never a working
    // crew; without them the pool hoods inside defend the office.
    const guards = ready.find((t) => roles.get(t.id) === 'expendables');
    if (guards) propose({ label: 'guard office', kind: 'safety', value: 150, why: 'a man at the office door (Expendables)', teams: [guards], input: { type: 'guardBusiness', buildingIds: [hq.id], opts: { manpower: 1 } } });
    else actions.push('NOTE guard office: no Expendables crew — the pool hoods inside defend it; no working crew is taken off its work');
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
  if (lawyerLost) searchPaused('lawyer', true);
  if (accountantLost) searchPaused('accountant', true);
  if (w.week >= 3 && (accountantLost || !searchPaused('accountant', false))) {
    const desk = deskFor('accountant');
    // 1.2.23: after the hoods, unless suspicion is high (his books lower it).
    const value = !accountantLost ? (specialistStars(accountantNow) < 3 ? 400 : 150) : gang.suspicion >= SUSPICION_LIE_LOW || legalPush ? 6000 : gang.suspicion >= SUSPICION_BRIBE ? 1500 : 200;
    const search = specSearch('accountant', accountantLost && staffMissing('accountant'));
    const aLabel = `recruit accountant (${search.stops.length} place${search.stops.length === 1 ? '' : 's'})`;
    if (search.urgent) staffUrgent.add(aLabel);
    if (desk && search.stops.length) propose({ label: aLabel, kind: 'safety', value: search.urgent ? STAFF_TOP_VALUE : value, role: 'recruit', teams: search.teams, minFree: search.urgent ? 0 : undefined, why: search.urgent ? 'no accountant — top priority (point 9)' : !accountantLost ? `ours is ${specialistStars(accountantNow).toFixed(1)}★ — a better one swaps him` : gang.suspicion >= SUSPICION_BRIBE ? `suspicion ${Math.round(gang.suspicion)}` : 'hoods first',
      input: { type: 'recruit', buildingIds: search.stops, opts: { manpower: 1, recruitAs: 'accountant' } } });
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
      const result = specialistVisit('bribeOfficials', official.id);
      logResult(actions, `lawyer bribes ${official.name} (${official.role})`, result.ok, result.ok ? result.message ?? '' : result.error);
      if (result.ok) pendingActions.push({ ...pendingBase, targetPersonId: official.id });
      continue;
    }
    const target = key === 'bribeJuror' ? jurors[0] : witnesses[0];
    propose({
      label: `${ACTION_LABELS[key]} ${target.name}`, kind: 'safety', value: 3000, why: `${defendant?.name ?? 'a man'} on trial`, role: key === 'scareWitness' ? 'muscle' : 'recruit',
      // 1.2.38 (Robert): roughing up a witness goes to the crew with the lowest
      // knives (a beating turns fatal with knives above 2.5★) — the crew average.
      teams: key === 'scareWitness' ? lowKnifeCrews() : sharpCrews(),
      input: (team) => key === 'scareWitness'
        ? { type: 'assault', personId: target.id, opts: { manpower: manpowerFor(team, 2) } }
        : { type: 'bribe', personId: target.id, opts: { manpower: manpowerFor(team, 2), amount: Math.round(400 + target.skills.intelligence * 300), ...sharp(team) } as IssueOrderInput['opts'] },
      onGiven: (team) => { pendingActions.push({ ...pendingBase, orderId: team.orderIds[team.orderIds.length - 1], targetPersonId: target.id }); },
    });
  }
  // 1.2.21: the police chief is paid only when his hostility rises (or the
  // police are already hostile), and bribes are sized to the illegal takings.
  // 1.2.40 (Robert): by the band the Lawyer tab shows — the chief is paid when
  // his band drops (friendly → neutral or hostile, neutral → hostile), after
  // the Mayor names us in a crackdown, or while the police are hostile.
  const chiefNow = w.people[w.policeChiefId];
  const chiefOpinion = chiefNow ? opinionBand(chiefNow.opinion[gang.id] ?? 0) : 'neutral';
  const chiefBefore = mem.chiefBand;
  mem.chiefBand = chiefOpinion;
  const chiefCooling = policeHostile || crackdownNamed || (chiefBefore != null && BAND_RANK[chiefOpinion] < BAND_RANK[chiefBefore]);
  const mayorNow = w.people[w.mayorId];
  const mayorBand = mayorNow ? opinionBand(mayorNow.opinion[gang.id] ?? 0) : 'neutral';
  const mayorDropped = mem.mayorBand != null && BAND_RANK[mayorBand] < BAND_RANK[mem.mayorBand];
  mem.mayorBand = mayorBand;
  actions.push(`OFFICIALS chief ${chiefOpinion}${chiefBefore && chiefBefore !== chiefOpinion ? ` (was ${chiefBefore})` : ''}, mayor ${mayorBand}${mayorDropped ? ' (dropped)' : ''}`);
  const dirtyTakings = income.illegal + income.protection;
  const bribeSum = (base: number) => Math.round(Math.max(base, Math.min(5000, dirtyTakings * 0.15)));
  /** A bribe run: a crew with a car if one has time, and a second man as escort. */
  // 1.2.37 (Robert): the crew whose sharpest free man is sharpest (a car among equals).
  const bribeCrew = () => sharpCrews()[0] ?? freest();
  let chiefPaid = false;
  // 1.2.23: hostile police are paid off whatever the suspicion (seen: 22 arrests in a week at low suspicion).
  if ((hot || policeHostile || crackdownNamed) && lawyer && chiefCooling) {
    // 1.2.23: hostile police arrest our men on sight — worth more of the cash.
    const chief = buyable(w.policeChiefId, policeHostile ? 0.6 : 0.3);
    if (chief) {
      const result = specialistVisit('bribeOfficials', chief.id);
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
    // 1.2.41 (Robert): the officers in the blocks with our illegal businesses first
    // (a retainer keeps an officer sweet whatever the chief thinks), then the nearest.
    const illegalBlocks = new Set(buildingList(w).filter((b) => b.ownerGangId === gang.id && b.cls === 'illegal' && b.state !== 'destroyed').map((b) => claimOf(b.blockId)));
    const beats = territoryBlocks(w, gang.id).sort((a, b) => Number(illegalBlocks.has(b.id)) - Number(illegalBlocks.has(a.id)) || dist(a.center, origin) - dist(b.center, origin)).slice(0, 6).map((block) => block.id);
    const onPayroll = police.filter((p) => p.employedBy === gang.id).length;
    if (beats.length && onPayroll < 12) {
      const result = specialistVisit('employPolice', null, beats);
      logResult(actions, `lawyer puts the police on our ${beats.length} blocks on the payroll, illegal-business blocks first (${onPayroll} already paid)`, result.ok, result.ok ? result.message ?? '' : result.error);
    }
  }
  // 1.2.41 (Robert): the mayor is bought whenever he is hostile and we can afford him.
  if (lawyer && (gang.cash > 40000 || mayorDropped || mayorBand === 'hostile')) {
    const mayor = mayorBand === 'hostile' ? buyable(w.mayorId, 1) : buyable(w.mayorId, 0.3);
    if (mayor) {
      const result = specialistVisit('bribeOfficials', mayor.id);
      logResult(actions, `lawyer bribes ${mayor.name} (mayor: fewer police on the patch)`, result.ok, result.ok ? result.message ?? '' : result.error);
    }
  }
  // 1.2.41 (Robert): the chief bought by a rival — we offer 120% of the sum
  // (the price the game quotes us stands in for theirs, which we cannot see)
  // when we can afford it; otherwise an Expendable kill of the chief is
  // considered (the kill order's existing value).
  {
    const chief = w.people[w.policeChiefId];
    const rivalId = chief?.bribedBy;
    if (chief && chief.status === 'active' && rivalId != null && rivalId !== gang.id && w.gangs[rivalId]) {
      const offer = Math.round(bribePrice(w, chief, gang.id) * CHIEF_OUTBID);
      const crew = bribeCrew();
      if (gang.cash >= offer && !refusesBribe(chief, gang.id)) {
        chiefPaid = true;
        propose({ label: 'outbid for the chief', kind: 'safety', value: 5000 + gang.suspicion * 10, why: `${w.gangs[rivalId].name} bought him — we offer $${offer} (120%)`, teams: crew ? [crew, ...ready.filter((t) => t !== crew)] : undefined,
          input: (team) => ({ type: 'bribe', personId: chief.id, opts: { manpower: manpowerFor(team, 2), amount: offer, ...sharp(team) } as IssueOrderInput['opts'] }) });
      } else {
        const exp = ready.find((t) => roles.get(t.id) === 'expendables');
        actions.push(`NOTE the chief is bought by ${w.gangs[rivalId].name}; 120% ($${offer}) is ${refusesBribe(chief, gang.id) ? 'refused — he is too hostile' : `beyond our $${Math.round(gang.cash)}`} — ${exp ? 'an Expendable kill of the chief is considered' : 'no Expendables crew for a kill'}`);
        if (exp) propose({ label: `kill the police chief ${chief.name}`, kind: 'violence', value: 1500, why: `bought by ${w.gangs[rivalId].name} and we cannot outbid`, teams: [exp],
          input: (team) => ({ type: 'kill', personId: chief.id, opts: { manpower: manpowerFor(team, 2) } }) });
      }
    }
  }
  if ((hot || policeHostile || crackdownNamed) && !chiefPaid && chiefCooling) {
    const chief = w.people[w.policeChiefId];
    if (chief && chief.status === 'active' && chief.bribedBy !== gang.id && gang.cash > 1500) {
      const crew = bribeCrew();
      propose({ label: 'bribe chief', kind: 'safety', value: (policeHostile ? 5000 : 1200) + gang.suspicion * 10, why: `the chief is cooling (${chiefOpinion}${crackdownNamed ? ', crackdown' : ''})${policeHostile ? ', the police are hostile' : ''}`, teams: crew ? [crew, ...ready.filter((t) => t !== crew)] : undefined,
        input: (team) => ({ type: 'bribe', personId: chief.id, opts: { manpower: manpowerFor(team, 2), amount: bribeSum(400), ...sharp(team) } as IssueOrderInput['opts'] }) });
    }
  } else if (hot && !chiefPaid) actions.push(`NOTE police chief not paid — his band is steady (${chiefOpinion})`);
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
  // 1.2.41 (Robert): all in below the action levels — easing only while lying low.
  const easing = lieLow;
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
      // 1.2.37 (Robert): recruiting always keeps looking for 3★ business hands
      // while the Business crew has room (it takes no one else). The
      // Expendables crew is never recruited for.
      const bizRoom = !!bizCrew && bizCrew.memberIds.length < MAX_TEAM_SIZE - 1;
      const crewRoom = gang.teamIds.length === 0 || bizRoom || crewsOf().some((team) => roles.get(team.id) !== 'expendables' && team.memberIds.length < MAX_TEAM_SIZE - 1);
      if (bizRoom) actions.push(`NOTE recruit: the Business crew has room (${bizCrew!.memberIds.length}/${MAX_TEAM_SIZE - 1}) — recruiting keeps looking for 3★ business hands`);
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
      // 1.2.40 (Robert): the Lawyer tab's squealer list (opinion below −40), not a hidden figure.
      const tooHostile = (b: Building) => { const p = payer(b); return !!p && p.role === 'owner' && p.status === 'active' && (p.opinion[gang.id] ?? 0) < SQUEALER_OPINION; };
      const owedAll = protectedBuildings(w, gang.id).filter((b) => b.state === 'trading').sort(nearer);
      const owedReach = owedAll.filter((b) => !dangerBlocks.has(claimOf(b.blockId)));
      if (owedReach.length < owedAll.length) actions.push(`NOTE collect: ${owedAll.length - owedReach.length} shop(s) in rival-held or rival-sighted blocks not collected this week`);
      const owed = campaign ? owedReach.filter((b) => !tooHostile(b)) : owedReach;
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
        // 1.2.44 (Robert): one 1-man collect route per free man of each crew,
        // in different areas (each route starts from the best-paying shop
        // left and takes the nearest that fit that man's week), until every
        // owed shop is covered. The old cap of twice the even share is gone.
        const crewsForCollect = ready.filter((t) => (t !== bizCrew || bizCollects) && !outOfTime.has(t.id))
          .sort((a, b) => Number(roles.get(b.id) === 'collect') - Number(roles.get(a.id) === 'collect') || crewFreeMinutes(w, b) - crewFreeMinutes(w, a) || a.id - b.id);
        let routes = 0;
        for (const team of crewsForCollect) {
          if (!left.length) break;
          const hasCar = Object.values(team.vehicles).some((n) => n > 0);
          const manFree = crewLoads(w, team).map((load) => MINUTES_PER_WEEK - load).filter((m) => m >= MIN_FREE_MINUTES).sort((a, b) => b - a);
          for (const free of manFree) {
            if (!left.length) break;
            const fit = Math.max(1, targetsThatFit(timeLedger, ledgerKey('collectProtection', hasCar), left.length, free) || 1);
            const seed = left.shift()!;
            left.sort((a, b) => dist(centre(a), centre(seed)) - dist(centre(b), centre(seed)));
            const group = [seed, ...left.splice(0, fit - 1)];
            left.sort((a, b) => perMinute(b) - perMinute(a));
            const route = planRoute(origin, group.map((b) => ({ item: b, ...centre(b) }))).map((s) => s.item);
            const takings = route.reduce((sum, b) => sum + (b.protection?.weekly ?? 0), 0);
            routes += 1;
            propose({ label: `collect (${route.length} stops, $${Math.round(takings)})`, kind: 'money', value: Math.max(100, takings), role: 'collect', why: `protection owed — route ${routes}, ${team.name}'s man with ${Math.round(free)} min free`,
              teams: [team, ...crewsForCollect.filter((t) => t !== team)], input: { type: 'collectProtection', buildingIds: route.map((b) => b.id), opts: { manpower: 1 } } });
          }
        }
        if (left.length) actions.push(`NOTE collect: ${routes} route(s) put forward; ${left.length} owed shop(s) left over — no free man left in any crew`);
      }
      // Expand. 1.2.23: past SUSPICION_EASE no new rackets at all (protection
      // money is what the Bureau cannot explain); lying low below it, one crew
      // half the crews take new blocks only.
      const suspicionHigh = cooling;
      if (suspicionHigh && weight.rackets >= 0.25) actions.push(`NOTE suspicion ${Math.round(gang.suspicion)} — no extortion until it is below ${SUSPICION_LIE_LOW}; legal buys and the accountant instead`);
      // 1.2.37 (Robert): the strongest Intimidation crew takes the far and
      // hostile shops. Each extortion group is ranked by how hard it is (sites
      // whose owner refused us first, then the farthest from the office); the
      // hardest group asks first for the strongest Intimidation crew (most
      // intimidation stars), the next for the next strongest, and so on.
      const extortGroups: { p: Proposal<Team>; group: Building[] }[] = [];
      const proposeExtort = (group: Building[], p: Proposal<Team>) => { extortGroups.push({ p, group }); propose(p); };
      if (weight.rackets >= 0.25 && !suspicionHigh) {
        const crewsToSend = easing ? Math.max(1, Math.floor(ready.length / 2)) : Math.max(1, Math.round(ready.length * Math.min(1, expansion)));
        const cap = Math.max(2, Math.round(weight.rackets * 5 * expansion));
        const valid = buildingList(w).filter((b) => isValidAreaTarget(w, gang.id, 'extort', b) && !dangerBlocks.has(claimOf(b.blockId))); // 1.2.38/1.2.39: not in rival-held or rival-sighted blocks
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
              proposeExtort(group, { label: `extort ${group.length} site(s), ${mark}`, kind: mark === 'new block' ? 'territory' : 'money', role: 'intimidation',
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
            proposeExtort(group, { label: `extort ${group.length} site(s), ${mark}`, kind: mark === 'new block' ? 'territory' : 'money', role: 'intimidation',
              value: (mark === 'new block' ? 700 + 200 * (group.length - 1) : 300 + 80 * (group.length - 1)) * (easing ? 0.5 : 1), why: group.map((g) => `${g.typeId} ${g.id}`).join(', '),
              input: (team) => ({ type: 'extort', buildingIds: group.map((g) => g.id), opts: { manpower: manpowerFor(team, 2) } }) });
          }
        }
      }
      {
        const muscleOf = (t: Team) => [t.lieutenantId, ...t.memberIds].reduce((sum, id) => sum + (w.people[id]?.skills.intimidation ?? 0), 0);
        const intimidators = ready.filter((t) => roles.get(t.id) === 'intimidation').sort((a, b) => muscleOf(b) - muscleOf(a) || a.id - b.id);
        if (intimidators.length > 1 && extortGroups.length) {
          const hostile = (g: Building[]) => g.filter((b) => b.extortRefusedBy?.includes(gang.id)).length;
          const far = (g: Building[]) => Math.max(...g.map((b) => dist(w.lots[b.lotId].center, origin)));
          const ranked = [...extortGroups].sort((a, b) => hostile(b.group) - hostile(a.group) || far(b.group) - far(a.group));
          const others = () => ready.filter((t) => t !== bizCrew && roles.get(t.id) !== 'intimidation').sort((a, b) => freeFor(b) - freeFor(a));
          ranked.forEach((x, i) => {
            const k = i % intimidators.length;
            x.p.teams = [...intimidators.slice(k), ...intimidators.slice(0, k), ...others()];
          });
          actions.push(`NOTE extortion: hardest groups first to the strongest Intimidation crew — ${ranked.slice(0, intimidators.length).map((x, i) => `${x.p.label} (${hostile(x.group)} refused, ${Math.round(far(x.group))} m) → ${intimidators[i].name}`).join('; ')}`);
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
          input: (team) => ({ type: 'bribe', personId: chief.id, opts: { manpower: manpowerFor(team, 2), amount: bribeSum(Math.round(200 + weight.bribes * 800)), ...sharp(team) } as IssueOrderInput['opts'] }) });
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
    if (key === 'violence' && !weak && w.week >= 8 && policy.violence !== 'low' && (weight.violence >= 0.45 || policy.violence === 'high')) {
      // 1.2.25 (no peeking): the nearest business our map shows as a rival's.
      const rival = buildingList(w).filter((b) => seenRival(b) && !b.isHQ && b.state === 'trading' && !noHitOn(buildingMapIntel(b, gang.id).ownerGangId)).sort(nearer)[0];
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
  /** 1.2.37 (Robert): the Expendables crew, ready — first for hits, the FBI and attacks on rival premises. */
  const expCrew = ready.find((t) => roles.get(t.id) === 'expendables');
  /** Street crews fit for a strike: the armed crew first, then the freest others (never the business crew). */
  const strikeCrews = (first: Team | undefined) => [...new Set([first, ...[...ready].filter((t) => t !== bizCrew && roles.get(t.id) !== 'business').sort((a, b) => crewFreeMinutes(w, b) - crewFreeMinutes(w, a))])]
    .filter((t): t is Team => !!t && ready.includes(t));
  /** Hand the attack crew's heavy weapons to the crew that has the time. */
  /** 1.2.23: the HQ attack — to a crew with the time for it, armed from the attack crew (a bomb set off by a crew out of time was seen in 1.2.22). */
  const proposeHqStrike = (target: Building, value: number, why: string, key: ActionKey) => {
    const owner = w.gangs[target.ownerGangId!];
    if (noHitOn(target.ownerGangId)) { const line = `HQ ATTACK not made on ${owner?.name ?? 'a rival'}'s HQ: ${weak ? 'we are weak' : 'going straight'} and they are at war with us`; actions.push(line); noteDevDesk(line); return; }
    const cashBefore = gang.cash;
    let targetPersonId: number | undefined;
    // 1.2.24 (Robert): a strike only with explosives, enough men and a whole free week.
    const spareExplosives = (gang.weapons.explosives ?? 0) > 0;
    const crewMenOf = (t: Team) => t.memberIds.length + 1;
    const candidates = strikeCrews(armed);
    const fit = candidates.filter((t) => !outOfTime.has(t.id) && t.timeUsed <= 0 && crewMenOf(t) >= STRIKE_MIN_MEN && bang(t));
    if (!fit.length) {
      const why2 = !candidates.length ? 'no street crew ready'
        : !candidates.some(bang) ? 'no explosives in the store'
        : !candidates.some((t) => crewMenOf(t) >= STRIKE_MIN_MEN) ? `no crew with ${STRIKE_MIN_MEN} men (biggest ${Math.max(...candidates.map(crewMenOf))})`
        : `no crew with ${STRIKE_MIN_MEN} men, explosives and its whole week free`;
      const line = `HQ ATTACK not made on ${owner?.name ?? 'a rival'}'s HQ: ${why2}`;
      actions.push(line); noteDevDesk(line);
      return;
    }
    actions.push(`HQ ATTACK proposed on ${owner?.name ?? 'a rival'}'s HQ (${why}): ${fit.map((t) => `${w.people[t.lieutenantId]?.name ?? 'crew'} ${crewMenOf(t)} men, explosives ${(t.weapons.explosives ?? 0) || (spareExplosives ? 'from the store' : 0)}`).join('; ')}`);
    propose({ label: `HQ attack on ${owner?.name ?? 'a rival'}'s HQ`, kind: 'violence', value, why, minFree: MINUTES_PER_WEEK, teams: fit, prepare: (team) => armFrom(armed, team),
      input: (team) => {
        const strikeMen = manpowerFor(team, 4);
        const inside = visibleInside(target);
        targetPersonId = undefined;
        if (bang(team)) return { type: 'bomb', buildingIds: [target.id], opts: { manpower: strikeMen } };
        if (inside) { targetPersonId = inside.id; return { type: 'kill', personId: inside.id, opts: { manpower: strikeMen } }; }
        return { type: 'smashUp', buildingIds: [target.id], opts: { manpower: strikeMen } };
      },
      onGiven: (team) => {
        const order = w.orders[team.orderIds[team.orderIds.length - 1]];
        noteDevDesk(`NOTE HQ attack on ${owner?.name}'s HQ (building ${target.id}): ${order?.type ?? '?'} by ${w.people[team.lieutenantId]?.name ?? 'crew'} with ${Math.round(crewFreeMinutes(w, team))} man-min of the week left after it, tommy ${team.weapons.tommy ?? 0}, explosives ${team.weapons.explosives ?? 0} — given`);
        desk.lastHqStrike = w.week;
        pendingActions.push({ key, orderId: team.orderIds[team.orderIds.length - 1], targetBuildingId: target.id, targetPersonId, cashBefore });
      },
      onSkipped: () => { const line = `HQ ATTACK not made on ${owner?.name}'s HQ: the fit crews' week was taken by better-scored orders`; actions.push(line); noteDevDesk(line); } });
  };
  const armFrom = (from: Team | undefined, to: Team) => {
    if (!from || from === to) return;
    for (const item of ['tommy'] as WeaponId[]) {
      while ((from.weapons[item] ?? 0) > 0 && (to.weapons[item] ?? 0) < (item === 'tommy' ? 2 : 1)) {
        // The attack crew hands it over itself: it goes through the store unkept.
        if (!transferWeapon(w, gang.id, item, from.id, false).ok || !supply(to, item, false).ok) break;
        actions.push(`NOTE ${item} moved from ${w.people[from.lieutenantId]?.name ?? 'the attack crew'} to ${w.people[to.lieutenantId]?.name ?? 'crew'} (it has the time)`);
      }
    }
  };
  if (armed && !weak && suspects.size && policy.violence !== 'low' && !(() => { const b = w.buildings[[...suspects.keys()][0]]; return !!b && noHitOn(buildingMapIntel(b, gang.id).ownerGangId); })()) {
    // 1.2.33 (Robert): no separate buy before an attack — it uses what the crew and the store hold.
    const [targetId] = [...suspects.keys()];
    const target = w.buildings[targetId];
    // 1.2.23: the strike goes to a crew with the time for it — the strike
    // crew, or another street crew handed its tommy guns and dynamite.
    propose({ label: `attack suspected HQ (building ${targetId})`, kind: 'violence', value: 1500, why: 'our men were killed beside it', minFree: STRIKE_MIN_FREE,
      teams: strikeCrews(armed), prepare: (team) => armFrom(armed, team),
      input: (team) => {
        const men = manpowerFor(team, 4);
        if (bang(team)) return { type: 'bomb', buildingIds: [targetId], opts: { manpower: men } };
        const inside = target ? visibleInside(target) : undefined;
        return inside ? { type: 'kill', personId: inside.id, opts: { manpower: men } } : { type: 'smashUp', buildingIds: [targetId], opts: { manpower: men } };
      } });
    if (target) suspects.delete(targetId);
  }
  // 1.2.38 (Robert): no gun for every man any more — only the violent jobs are armed.
  // 1.2.39 (Robert): enough revolvers in the cache to arm every pool hood
  // when the office is attacked (not counting the attack crew's reserve).
  {
    // 1.2.40 (Robert): a shotgun stashed for every pool hood (inside fighting), not revolvers.
    // 1.2.41: hoods stationed at our other offices are armed from those offices' stashes.
    const poolHoods = gang.poolIds.filter((id) => { const p = w.people[id]; const st = p?.homeOfficeId != null ? w.buildings[p.homeOfficeId] : undefined; return p?.role === 'hood' && p.status === 'active' && !(st && isGangOffice(st, gang.id) && !st.isHQ); }).length;
    const cacheGuns = () => inStore(undefined, 'shotgun');
    let n = 0;
    while (cacheGuns() < poolHoods && gang.cash >= reserve + WEAPONS.shotgun.cost && buyWeapon(w, gang.id, 'shotgun').ok) n++;
    if (n) actions.push(`OK buy ${n}× shotgun for the cache — ${poolHoods} pool hood(s) to arm if the office is attacked (${cacheGuns()} shotguns there besides the attack crew's)`);
    else if (cacheGuns() < poolHoods) actions.push(`NOTE cache: ${cacheGuns()} shotguns for ${poolHoods} pool hood(s) — the cash is down to the reserve`);
  }
  // 1.2.41 (Robert): every office of ours besides the HQ keeps
  // EXTRA_OFFICE_DEFENDERS pool hoods stationed inside with a shotgun stash of
  // its own; the rest of the pool waits at the HQ (10 + 10 per rival at war).
  {
    const extras = buildingList(w).filter((b) => isGangOffice(b, gang.id) && !b.isHQ && b.typeId === 'office').sort((a, b) => a.id - b.id);
    const hqOffice = buildingList(w).find((b) => b.isHQ && b.ownerGangId === gang.id && b.state !== 'destroyed');
    if (extras.length) {
      const pool = gang.poolIds.map((id) => w.people[id]).filter((p): p is Person => !!p && p.role === 'hood' && p.status === 'active' && !restingMen.has(p.id));
      const taken = new Set<number>();
      // The HQ's cache keeps a shotgun for every pool hood not stationed elsewhere.
      const hqNeed = pool.filter((p) => !extras.some((o) => o.id === p.homeOfficeId)).length - EXTRA_OFFICE_DEFENDERS * extras.length;
      for (const office of extras) {
        const door = w.lots[office.lotId].center;
        const mine = pool.filter((p) => p.homeOfficeId === office.id && !taken.has(p.id)).slice(0, EXTRA_OFFICE_DEFENDERS);
        for (const p of mine) taken.add(p.id);
        const more = pool.filter((p) => !taken.has(p.id) && p.homeOfficeId !== office.id && !extras.some((o) => o.id === p.homeOfficeId))
          .sort((a, b) => dist(a.pos, door) - dist(b.pos, door) || a.id - b.id).slice(0, EXTRA_OFFICE_DEFENDERS - mine.length);
        for (const p of more) { taken.add(p.id); stationPoolHood(w, gang.id, p.id, office.id); }
        let bought = 0, moved = 0;
        const stashGuns = () => Math.floor(office.stash?.shotgun ?? 0);
        while (stashGuns() < EXTRA_OFFICE_DEFENDERS) {
          if (inStore(undefined, 'shotgun') <= hqNeed) {
            if (!(gang.cash >= reserve + WEAPONS.shotgun.cost && buyWeapon(w, gang.id, 'shotgun').ok)) break;
            bought++;
          }
          if (!stockOfficeStash(w, gang.id, office.id, 'shotgun', true).ok) break;
          moved++;
        }
        actions.push(`OFFICE #${office.id} (block ${office.blockId}): ${mine.length + more.length} of ${EXTRA_OFFICE_DEFENDERS} pool hood(s) stationed${more.length ? ` (${more.map((p) => p.name).join(', ')} sent)` : ''}; stash ${stashGuns()} shotgun(s)${moved ? ` (+${moved}${bought ? `, ${bought} bought` : ''})` : stashGuns() < EXTRA_OFFICE_DEFENDERS ? ' — the cash is down to the reserve' : ''}`);
      }
      // The rest of the pool waits at the HQ.
      if (hqOffice) for (const p of pool) if (!taken.has(p.id) && p.homeOfficeId != null && p.homeOfficeId !== hqOffice.id) stationPoolHood(w, gang.id, p.id, hqOffice.id);
    }
  }
  // 1.2.41 (Robert): a new office OFFICE_SPACING_BLOCKS map blocks (grid
  // distance, every block counted: roads between, rivers, parks) from an
  // office of ours in a cardinal direction, where our territory or a front of
  // ours reaches, unless an office of ours is already nearer than that; on the
  // block's centre lot behind our legal front (bought first when needed).
  {
    const offices = buildingList(w).filter((b) => isGangOffice(b, gang.id));
    const cell = new Map(w.blocks.map((b) => [`${b.gx},${b.gy}`, b] as const));
    const grid = (a: number, b: number) => { const x = w.blocks[a], y = w.blocks[b]; return x && y ? Math.abs(x.gx - y.gx) + Math.abs(x.gy - y.gy) : Infinity; };
    const legalFront = (b: Building) => b.ownerGangId === gang.id && b.state === 'trading' && b.hidesId == null && ['commercial', 'industrial', 'tenement'].includes(b.cls);
    const centreIn = (blockId: number) => buildingList(w).find((b) => claimOf(b.blockId) === blockId && w.lots[b.lotId]?.index === 4);
    const room = gang.cash - cashReserve;
    let done = false;
    for (const office of offices) {
      if (done) break;
      const at = w.blocks[office.blockId];
      if (!at) continue;
      for (const [dx, dy, dir] of [[0, -1, 'north'], [1, 0, 'east'], [0, 1, 'south'], [-1, 0, 'west']] as const) {
        const target = cell.get(`${at.gx + dx * OFFICE_SPACING_BLOCKS},${at.gy + dy * OFFICE_SPACING_BLOCKS}`);
        if (!target) continue;
        const blockId = claimOf(target.id);
        if (offices.some((o) => grid(o.blockId, target.id) < OFFICE_SPACING_BLOCKS)) continue;
        const inBlock = buildingList(w).filter((b) => claimOf(b.blockId) === blockId && b.state !== 'destroyed');
        if (!territoryBlocksNow.has(blockId) && !inBlock.some(legalFront)) continue;
        const centre = centreIn(blockId);
        // The game asks for the front on the centre lot's own block.
        const front = centre ? inBlock.find((b) => legalFront(b) && b.blockId === centre.blockId) : undefined;
        if (!centre || (centre.cls !== 'empty' && centre.typeId !== 'office')) { actions.push(`NOTE new office ${dir} of #${office.id} (block ${blockId}): the centre lot is taken`); continue; }
        done = true;
        const officeCost = BUILDING_BY_ID.office?.cost ?? 0;
        if (centre.ownerGangId === gang.id && front) {
          if (room >= officeCost) planBuy(`new office ${dir} of #${office.id}: office behind ${front.typeId} on`, [centre], () => ({ type: 'setUpBusiness', buildingIds: [centre.id], opts: { manpower: 1, businessTypeId: 'office', frontBuildingId: front.id } }), () => 3000, () => officeCost);
          else actions.push(`NOTE new office ${dir} of #${office.id} (block ${blockId}): $${officeCost} for the office is beyond the cash above the reserve ($${Math.max(0, Math.round(room))})`);
        } else if (centre.ownerGangId == null && front) {
          const price = buildingValue(w, centre);
          if (room >= price) planBuy(`new office ${dir} of #${office.id}: the centre lot`, [centre], undefined, () => 3000, () => price);
          else actions.push(`NOTE new office ${dir} of #${office.id} (block ${blockId}): the centre lot ($${price}) is beyond the cash above the reserve`);
        } else if (!front) {
          const sale = inBlock.filter((b) => b.ownerGangId == null && b.state === 'trading' && ['commercial', 'industrial', 'tenement'].includes(b.cls) && purchasablePremisesType(b) && w.lots[b.lotId]?.index !== 4)
            .sort((a, b) => buildingValue(w, a) - buildingValue(w, b) || a.id - b.id)[0];
          if (sale && room >= buildingValue(w, sale)) planBuy(`new office ${dir} of #${office.id}: a front`, [sale], undefined, () => 3000, () => buildingValue(w, sale));
          else actions.push(`NOTE new office ${dir} of #${office.id} (block ${blockId}): ${sale ? 'a front is beyond the cash above the reserve' : 'no front for sale in the block'}`);
        } else actions.push(`NOTE new office ${dir} of #${office.id} (block ${blockId}): the centre lot belongs to someone else`);
        break;
      }
    }
  }
  if (armed && w.week >= 3) {
    // 1.2.34 (Robert): the attack crew may buy any weapon — twin pistols by
    // default, shotguns for attacks inside an office, rifles for road attacks,
    // tommy guns too. No buy limit of 10 any more: enough of each for every
    // man of the crew to carry it (one gun per man), bought into the store.
    // 1.2.36 (Robert): it counts only its own guns and the stock kept for it
    // in the store (no other crew takes that), and it stocks one explosive
    // per man — first — whenever a rival HQ is known or suspected (no longer
    // tied to the bombing rank; still within the cash).
    const owned = (item: WeaponId) => (armed.weapons[item] ?? 0) + (kept[item] ?? 0);
    const need = armed.memberIds.length + 1;
    const hqKnown = knownRivalHQs(w, gang).length > 0 || suspects.size > 0;
    // 1.2.38 (Robert): a shotgun and a rifle per man (inside and street
    // jobs); no more twin pistols or tommy guns bought for it.
    const wants: [WeaponId, () => boolean][] = [
      ['explosives', () => hqKnown && policy.violence !== 'low' && gang.cash > reserve + 3000],
      ['shotgun', () => true],
      ['rifle', () => true],
    ];
    for (const [item, ok] of wants) {
      let n = 0;
      while (owned(item) < need && ok() && gang.cash >= reserve + WEAPONS[item].cost && buyForAttack(item).ok) n++;
      if (n) actions.push(`OK buy ${n}× ${item} for the attack crew's store (${owned(item)} for ${need} men)`);
    }
  }
  // 1.2.37: what the attack crew holds now, kept for next week (a crew broken up keeps its guns reserved).
  if (attackCrew && crewsOf().includes(attackCrew)) attackHeld.set(w, { teamId: attackCrew.id, weapons: { ...attackCrew.weapons } as Partial<Record<WeaponId, number>> });

  // ---- 1.2.22: rival headquarters, from what our own scouts have found.
  // The rival worth striking: in a territory game the weakest (by the power
  // graph), otherwise the strongest per man we know of (rich, thinly manned).
  const liveRivals = Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated);
  const knownMen = (g: Gang) => identified(g);
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
    if (byWeakness.length && striker && !weak && w.week >= 6 && !lieLow && freeShare(striker) > 0.25) {
      // The weakest rival with an identified site beside our blocks.
      const beside = (g: Gang) => buildingList(w).filter((b) => buildingMapIntel(b, gang.id).ownerGangId === g.id && !b.isHQ && b.state === 'trading' && nearTerritory(w, gang.id, b.blockId, 1)).sort(nearer);
      const weakest = byWeakness.find((g) => beside(g).length);
      const theirs = weakest ? beside(weakest) : [];
      if (weakest && theirs.length) {
        const site = theirs[0];
        const dynamite = bang(striker);
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
      actions.push(`NOTE ${worst[1]} of our men killed by ${w.gangs[worst[0]].name} — an answer is weighed (1.2.38 rules)`);
    }
    const grudge = retaliation.get(w);
    const enemy = grudge && grudge.until > w.week ? w.gangs[grudge.gangId] : undefined;
    if (grudge && (!enemy || enemy.eliminated)) retaliation.delete(w);
    if (enemy && !enemy.eliminated && !lieLow) {
      // 1.2.38 (Robert): only the attack or the Expendables crew answers, and
      // only full (every hood place taken) with 3★ or more attack (crew stars
      // on firearms and stealth: the best man × 0.7 + the average × 0.3), against
      // a target crew no bigger than ours (its men we know of); never while going
      // straight; at most once per rival every RETALIATE_GAP weeks; not after a
      // week with RETALIATE_LOSS_STOP or more of our men killed.
      const answered = retaliatedAt.get(w) ?? new Map<number, number>();
      retaliatedAt.set(w, answered);
      const killedLastWeek = [...killedBy.values()].reduce((a, b) => a + b, 0);
      const attackStars = (t: Team) => { const men = menOfCrew(t).filter((p) => p.status === 'active'); if (!men.length) return 0; const st = men.map((p) => roleStars(p, 'muscle')); return Math.max(...st) * 0.7 + (st.reduce((a, b) => a + b, 0) / st.length) * 0.3; };
      const fullCrew = (t: Team) => t.memberIds.length >= MAX_TEAM_SIZE - 1;
      const fitStrikers = [armed, expCrew].filter((t): t is Team => !!t && fullCrew(t) && attackStars(t) >= RETALIATE_STARS);
      const lastAnswer = answered.get(enemy.id);
      const why = weak ? 'we are weak — the armed crews keep out of rival blocks'
        : straightNow ? 'we are going straight'
        : lastAnswer != null && w.week - lastAnswer < RETALIATE_GAP ? `answered in week ${lastAnswer}; once per ${RETALIATE_GAP} weeks`
        : killedLastWeek >= RETALIATE_LOSS_STOP ? `${killedLastWeek} of our men killed last week (${RETALIATE_LOSS_STOP} or more: no answer)`
        : !fitStrikers.length ? `no full attack or Expendables crew with ${RETALIATE_STARS}★ attack (${[armed, expCrew].filter((t): t is Team => !!t).map((t) => `${t.name} ${t.memberIds.length}/${MAX_TEAM_SIZE - 1}, ${attackStars(t).toFixed(1)}★`).join('; ') || 'none ready'})`
        : '';
      const striker = why ? undefined : fitStrikers[0];
      if (why) actions.push(`NOTE no answer to ${enemy.name}: ${why}`);
      const theirMen = gang.knownPeople.filter((id) => !gang.prisonerIds.includes(id)).map((id) => w.people[id]).filter((p): p is NonNullable<typeof p> => !!p && p.gangId === enemy.id && p.role !== 'boss');
      const theirSites = buildingList(w).filter((b) => buildingMapIntel(b, gang.id).ownerGangId === enemy.id && !b.isHQ && b.state === 'trading').sort(nearer);
      // 1.2.40 (Robert): the target crew is the men seen with him — our known
      // men of his gang reported in the same block at the same minute as his
      // last sighting (he counts as one; never his true crew).
      const knownCrew = (p: Person) => seenWith(p);
      const ourMen = striker ? striker.memberIds.length + 1 : 0;
      const victims = theirMen.filter((p) => knownCrew(p) <= ourMen);
      if (striker && theirMen.length && !victims.length) actions.push(`NOTE no answer to ${enemy.name}: every known man of theirs is in a crew bigger than ours (${ourMen})`);
      const onGiven = () => { answered.set(enemy.id, w.week); };
      if (striker && victims.length) {
        const victim = victims.sort(byRoleAndPlace)[0];
        propose({ label: `retaliate: kill ${victim.name} of ${enemy.name} (crew of ${knownCrew(victim)} known)`, kind: 'violence', value: 1500, why: `${enemy.name} killed our men`, teams: fitStrikers,
          input: (team) => ({ type: 'kill', personId: victim.id, opts: { manpower: manpowerFor(team, 3) } }), onGiven });
      } else if (striker && !theirMen.length && theirSites.length) {
        const site = theirSites[0];
        const dynamite = bang(striker);
        propose({ label: `retaliate: ${dynamite ? 'bomb' : 'smash up'} ${enemy.name}'s ${site.typeId}`, kind: 'violence', value: 1500, why: `${enemy.name} killed our men`, teams: fitStrikers,
          input: (team) => ({ type: dynamite ? 'bomb' : 'smashUp', buildingIds: [site.id], opts: { manpower: manpowerFor(team, 3) } }), onGiven });
      } else if (striker && !theirMen.length) {
        // 1.2.25: nothing of theirs on our map — scout where their men were last seen.
        const block = sightedBlocks(enemy.id)[0];
        const ids = block == null ? [] : buildingList(w).filter((b) => claimOf(b.blockId) === block && b.ownerGangId !== gang.id && b.state !== 'destroyed' && isValidAreaTarget(w, gang.id, 'explore', b))
          .sort((a, b) => (a.knowledge?.[gang.id] ?? 0) - (b.knowledge?.[gang.id] ?? 0) || nearer(a, b)).slice(0, 4).map((b) => b.id);
        if (ids.length) propose({ label: `scout block ${block} where ${enemy.name}'s men were seen`, kind: 'intel', value: 600, why: `${enemy.name} killed our men; nothing of theirs on our map`, role: 'scout',
          input: { type: 'explore', buildingIds: ids, opts: { manpower: 1 } } });
        else actions.push(`NOTE nothing of ${enemy.name}'s known to attack and none of their men reported seen`);
      }
    }
  }

  // ---- 1.2.40 (Robert): the office screens' remaining actions.
  {
    // (4, 25) A rival whose assets top ours on the graph ASSET_LEAD_WEEKS weeks
    // running is pulled down: its big businesses we know of (bank, hotel,
    // department store) — a bank robbed, the others bombed (dynamite) or torched.
    const lastAssets = (g: Gang, back: number) => g.history[g.history.length - back]?.assets;
    const leaders = Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated && Array.from({ length: ASSET_LEAD_WEEKS }, (_, i) => i + 1)
      .every((back) => { const theirs = lastAssets(g, back), ours = lastAssets(gang, back); return theirs != null && ours != null && theirs > ours; }));
    const bigKind = (b: Building) => /^(bank|hotel|departmentStore)/.test(b.typeId);
    for (const g of leaders) {
      const strikers = [armed, expCrew].filter((t): t is Team => !!t);
      const sites = buildingList(w).filter((b) => buildingMapIntel(b, gang.id).ownerGangId === g.id && bigKind(b) && b.state !== 'destroyed' && !b.isHQ).sort(nearer);
      if (weak || noHitOn(g.id) || !strikers.length || !sites.length) {
        actions.push(`NOTE ${g.name}'s assets top ours ${ASSET_LEAD_WEEKS} weeks running — no strike: ${weak ? 'we are weak' : noHitOn(g.id) ? 'at war with us while we are weak or straight' : !strikers.length ? 'no attack or Expendables crew ready' : 'none of its banks, hotels or department stores on our map'}`);
        continue;
      }
      const site = sites[0];
      const robbery = /^bank/.test(site.typeId) && site.state === 'trading';
      propose({ label: `pull down ${g.name}: ${robbery ? 'raid' : 'bomb or torch'} its ${BUILDING_BY_ID[site.typeId]?.name ?? site.typeId} (building ${site.id})`, kind: 'violence', value: 700,
        why: `${g.name}'s assets top ours ${ASSET_LEAD_WEEKS} weeks running`, teams: strikers,
        input: (team) => ({ type: robbery ? 'raid' : bang(team) ? 'bomb' : 'torch', buildingIds: [site.id], opts: { manpower: manpowerFor(team, 3) } }) });
    }

    // (8) Tax: held back while the held-back sum stays under TAX_POOL_LINE and the
    // accountant's evasion weeks (last 16) stay within his safe count at the
    // FBI's worst-case zeal: (intelligence byte ÷ 2) + 150 ≥ zeal + 10 × weeks.
    // Stopped for good once the FBI says it wants him.
    const acct = availableSpecialist(w, gang, 'accountant');
    if ((gang.taxEvaded[gang.taxEvaded.length - 1] ?? 0) > 0 && !mem.evadedWeeks.includes(w.week - 1)) mem.evadedWeeks.push(w.week - 1);
    mem.evadedWeeks = mem.evadedWeeks.filter((wk) => wk > w.week - 16);
    if (acct && freshMsgs.some((m) => m.personId === acct.id && /warrant/i.test(m.text))) mem.warrantAcct = acct.id;
    if (acct) {
      const safe = Math.floor(((accountantSkillByte(acct.skills.intelligence) >> 1) + 150 - ZEAL_WORST) / EVADE_TAX_SUSPICION);
      const pool = taxNotCoveredUp(w, gang);
      const want = mem.warrantAcct !== acct.id && pool < TAX_POOL_LINE && mem.evadedWeeks.length + 1 <= safe;
      if (want !== gang.evadingTax) { const r = toggleEvadeTax(w, gang.id); logResult(actions, `tax: ${want ? 'evade' : 'pay in full'}`, r.ok, r.ok ? r.message ?? '' : r.error); }
      actions.push(`TAX ${gang.evadingTax ? 'evading' : 'paid in full'} — held back $${Math.round(pool)} (line $${TAX_POOL_LINE}), ${mem.evadedWeeks.length} evasion week(s) of the last 16, ${Math.max(0, safe)} safe for a ${acct.skills.intelligence.toFixed(1)}★ accountant${mem.warrantAcct === acct.id ? '; the FBI wants him — stopped' : ''}`);
    } else if (gang.evadingTax) toggleEvadeTax(w, gang.id);

    // (9) Audit: last week's result first — a manager who took in more than he
    // declared is raised to his ask if underpaid, else replaced (the manager
    // swap takes him first, without the 10% rule). Then one audit a week: the
    // manager of our illegal business with the highest profit, in turn.
    const res = w.auditResults[gang.id];
    if (res) {
      const m = w.people[res.personId];
      if (m && res.brought > res.declared) {
        if (m.pay < m.payDemand) { setPay(w, m.id, m.payDemand); actions.push(`AUDIT ${m.name} took in $${res.brought}, declared $${res.declared} — underpaid, raised to his ask ($${m.payDemand})`); }
        else if (m.role === 'lieutenant') actions.push(`AUDIT ${m.name} (lieutenant) took in $${res.brought}, declared $${res.declared} — paid his ask; noted (the swap rule covers managers only)`);
        else { mem.skimmers.add(m.id); actions.push(`AUDIT ${m.name} took in $${res.brought}, declared $${res.declared} — paid his ask, to be replaced`); }
      } else if (m) actions.push(`AUDIT ${m.name}: took in $${res.brought}, declared $${res.declared} — clean`);
    }
    // 1.2.41 (Robert): lieutenants and managers — every manager of a business
    // of ours (highest profit first), then the lieutenants, in turn.
    if (acct) {
      const sites = buildingList(w).filter((b) => b.ownerGangId === gang.id && !b.isHQ && b.state === 'trading' && b.managerId != null && w.people[b.managerId]?.gangId === gang.id)
        .sort((a, b) => b.lastProfit - a.lastProfit || a.id - b.id);
      const subjects: { id: number; what: string }[] = [
        ...sites.map((b) => ({ id: b.managerId!, what: `the manager of ${BUILDING_BY_ID[b.typeId]?.name ?? b.typeId} #${b.id} (profit $${Math.round(b.lastProfit)})` })),
        ...crewsOf().map((t) => ({ id: t.lieutenantId, what: `the lieutenant of ${t.name}` })),
      ].filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i && w.people[x.id]?.status === 'active');
      let next = subjects.find((x) => !mem.audited.has(x.id));
      if (!next && subjects.length) { mem.audited.clear(); next = subjects[0]; }
      if (next) {
        const r = specialistVisit('audit', next.id);
        logResult(actions, `accountant audits ${w.people[next.id]?.name ?? 'him'}, ${next.what}`, r.ok, r.ok ? r.message ?? '' : r.error);
        if (r.ok) mem.audited.add(next.id);
      }
    }

    // (10, 26) Prisoners: a d4 each week per prisoner — 1–2 interrogate (while
    // he has something left), 3 kill if his gang is at war with us, else
    // interrogate, 4 release.
    for (const id of [...gang.prisonerIds]) {
      const p = w.people[id];
      if (!p) continue;
      const roll = rng.int(1, 4);
      const war = p.gangId != null && gang.known[p.gangId] === 'war';
      if (roll === 4) { const r = releasePrisoner(w, gang.id, id); logResult(actions, `prisoner ${p.name}: d4 ${roll} — release`, r.ok, r.ok ? r.message ?? '' : r.error); mem.drained.delete(id); continue; }
      if (roll === 3 && war) { const r = killPrisoner(w, gang.id, id); logResult(actions, `prisoner ${p.name}: d4 ${roll}, his gang at war with us — kill`, r.ok, r.ok ? r.message ?? '' : r.error); mem.drained.delete(id); continue; }
      if (mem.drained.has(id)) { actions.push(`NOTE prisoner ${p.name}: d4 ${roll} — interrogate, but he has nothing left to tell; held`); continue; }
      const r = interrogatePrisoner(w, rng, gang.id, id);
      if (!r.ok && /nothing left/i.test(r.error)) mem.drained.add(id);
      logResult(actions, `prisoner ${p.name}: d4 ${roll} — interrogate`, r.ok, r.ok ? r.message ?? '' : r.error);
    }

    // (11) Patrol: an armed crew walks our blocks where rival men were reported last week.
    {
      const blocks = new Set<number>();
      for (const m of freshMsgs) {
        const p = m.personId != null ? w.people[m.personId] : undefined;
        if (!m.pos || !p || p.gangId == null || p.gangId === gang.id || !gang.knownPeople.includes(p.id)) continue;
        const b = w.blocks.reduce((best, k) => (dist(k.center, m.pos!) < dist(best.center, m.pos!) ? k : best), w.blocks[0]);
        if (blockIsOurs(b.id)) blocks.add(claimOf(b.id));
      }
      // 1.2.41 (Robert): patrol is the crew's only order that week — an armed
      // crew with no order yet is kept for it (nothing else goes to it).
      const patrollerAny = [armed, expCrew].filter((t): t is Team => !!t).find((t) => t.orderIds.length === 0);
      // 1.2.43: recruiting must stay possible — with no other crew (beside the
      // business crew) to recruit, the armed crew is not kept back for patrol.
      const othersToRecruit = ready.filter((t) => t !== bizCrew && t !== patrollerAny).length;
      const patroller = othersToRecruit > 0 ? patrollerAny : undefined;
      if (blocks.size && patrollerAny && !patroller) actions.push(`NOTE rival men seen in ${blocks.size} of our blocks last week — no patrol: ${patrollerAny.name} is the only crew left to recruit`);
      if (blocks.size && patroller) {
        patrolTeamId = patroller.id;
        propose({ label: `patrol our block(s) ${[...blocks].join(', ')} — rival men seen there last week`, kind: 'safety', value: 1200, why: 'intruders on our streets; the crew\'s only order this week', teams: [patroller], minFree: MINUTES_PER_WEEK,
          input: (team) => ({ type: 'patrol', blockIds: [...blocks], opts: { manpower: manpowerFor(team, 4) } }), onGiven: (team) => { outOfTime.add(team.id); } });
      } else if (blocks.size && (armed || expCrew)) actions.push(`NOTE rival men seen in ${blocks.size} of our blocks last week — every armed crew already has orders; no patrol`);
      else if (blocks.size) actions.push(`NOTE rival men seen in ${blocks.size} of our blocks last week — no armed crew ready to patrol`);
    }

    // (12) Refusers: each shop that refused us last week — intimidate; refused
    // again, smash it up; refused once more, buy it when the cash is above the reserve.
    {
      // 1.2.41 (Robert): a refuser stays on the list until he pays or we buy
      // the shop; lying low only pauses the steps (the step advances when given).
      for (const id of new Set(w.lastWeekOrders.filter((o) => o.gangId === gang.id && o.type === 'extort').flatMap((o) => (o.refusals ?? []).map((r) => r.buildingId)))) if (!mem.refusers.has(id)) mem.refusers.set(id, w.week - 1);
      for (const id of [...mem.refusers.keys()]) { const b = w.buildings[id]; if (!b || b.state === 'destroyed' || b.protection?.gangId === gang.id || b.ownerGangId === gang.id) { mem.refusers.delete(id); mem.refuser.delete(id); } }
      if (mem.refusers.size) actions.push(`REFUSERS ${mem.refusers.size} on the list (kept until they pay or we buy)`);
      const refusedNow = [...mem.refusers.keys()]
        .map((id) => w.buildings[id]).filter((b): b is Building => !!b && b.state === 'trading' && b.protection?.gangId !== gang.id && b.ownerGangId !== gang.id);
      for (const site of refusedNow) {
        const step = mem.refuser.get(site.id) ?? 0;
        const label = `${BUILDING_BY_ID[site.typeId]?.name ?? site.typeId} #${site.id}`;
        if (step >= 2) {
          const price = buildingValue(w, site);
          if (site.ownerGangId == null && purchasablePremisesType(site) && gang.cash - price >= cashReserve) planBuy(`refuser: buy ${label} —`, [site], undefined, () => 900, () => price);
          else actions.push(`NOTE refuser ${label} refused again after a smash-up — ${site.ownerGangId != null ? 'owned by a gang, cannot be bought' : !purchasablePremisesType(site) ? 'not for sale' : `$${price} would take the cash below the reserve`}`);
          continue;
        }
        const type = step === 0 ? 'intimidate' : 'smashUp';
        propose({ label: `refuser ${label}: ${type === 'intimidate' ? 'intimidate' : 'smash up'}`, kind: 'territory', value: blockIsOurs(site.blockId) ? 300 : 900, why: step === 0 ? `refused to pay (week ${mem.refusers.get(site.id)})` : 'still refusing after intimidation', role: type === 'intimidate' ? 'intimidation' : 'muscle',
          input: (team) => ({ type, buildingIds: [site.id], opts: { manpower: manpowerFor(team, 3) } }), onGiven: () => { mem.refuser.set(site.id, step + 1); } });
      }
      for (const id of [...mem.refuser.keys()]) if (w.buildings[id]?.protection?.gangId === gang.id || w.buildings[id]?.ownerGangId === gang.id) mem.refuser.delete(id);
    }

    // (21) Squealers (the Lawyer tab's list): bribed by a crew while the cash
    // above the reserve covers it, the rest intimidated at their shops.
    {
      const squealers = peopleList(w).filter((p) => p.role === 'owner' && p.status === 'active' && (p.opinion[gang.id] ?? 0) < SQUEALER_OPINION && p.gangId !== gang.id);
      let room = gang.cash - cashReserve;
      for (const p of squealers) {
        // The game's own bribe sum, at its top (a 5★ man), so no hidden skill is read.
        const cost = 300 + 5 * 260;
        // The game lets a squealer be intimidated only at his business that refused us (as the Lawyer tab does).
        const shop = buildingList(w).find((b) => (b.ownerPersonId === p.id || b.managerId === p.id) && isValidAreaTarget(w, gang.id, 'intimidate', b));
        if (cost <= room) {
          room -= cost;
          propose({ label: `bribe squealer ${p.name}`, kind: 'safety', value: 300, why: 'on the squealer list', teams: sharpCrews(),
            input: (team) => ({ type: 'bribe', personId: p.id, opts: { manpower: manpowerFor(team, 2), ...sharp(team) } as IssueOrderInput['opts'] }) });
        } else if (shop) {
          propose({ label: `intimidate squealer ${p.name}`, kind: 'safety', value: 300, why: 'on the squealer list; no cash to bribe', role: 'intimidation',
            input: (team) => ({ type: 'intimidate', buildingIds: [shop.id], opts: { manpower: manpowerFor(team, 3) } }) });
        }
      }
      if (squealers.length) actions.push(`SQUEALERS ${squealers.length} on the list — bribes and intimidation put forward`);
    }

    // (13, 27) Charity: cash above the reserve — a random 33–66% of the excess
    // to the church or orphanage in the poorest block (ours first).
    {
      const excess = gang.cash - cashReserve;
      const charities = buildingList(w).filter((b) => donationTarget(b));
      const squalor = (b: Building) => w.blocks[b.blockId]?.squalor ?? 0;
      const pick = [...charities].sort((a, b) => Number(blockIsOurs(b.blockId)) - Number(blockIsOurs(a.blockId)) || squalor(b) - squalor(a) || a.id - b.id)[0];
      if (excess > 0 && pick) {
        const amount = Math.round(excess * rng.int(33, 66) / 100);
        if (amount > 0) propose({ label: `donate $${amount.toLocaleString('en-US')} to ${BUILDING_BY_ID[pick.typeId]?.name ?? pick.typeId} #${pick.id} (squalor ${Math.round(squalor(pick))})`, kind: 'safety', value: 300, why: 'cash above the reserve',
          input: () => ({ type: 'donate', buildingIds: [pick.id], opts: { manpower: 1, amount } as IssueOrderInput['opts'] }) });
      }
    }

    // (14) Selling: any weapon kind above CACHE_SELL_ABOVE in the cache (not
    // counting guns with crews or kept for the attack crew's missions).
    {
      const sold: string[] = [];
      for (const g of Object.keys(WEAPONS) as WeaponId[]) {
        let n = 0;
        while (inStore(undefined, g) > CACHE_SELL_ABOVE && sellWeapon(w, gang.id, g).ok) n++;
        if (n) sold.push(`${n}× ${g}`);
      }
      if (sold.length) actions.push(`OK sold from the cache (above ${CACHE_SELL_ABOVE} of a kind): ${sold.join(', ')}`);
    }

    // (15) Losing premises: shut down after NO_PROFIT_WEEKS weeks running of trading with no profit.
    for (const b of buildingList(w).filter((x) => x.ownerGangId === gang.id && !x.isHQ && x.typeId !== 'office' && x.cls !== 'empty')) {
      if (b.state !== 'trading') continue;
      const n = b.lastProfit > 0 ? 0 : (mem.noProfit.get(b.id) ?? 0) + 1;
      mem.noProfit.set(b.id, n);
      if (n >= NO_PROFIT_WEEKS) {
        const typeId = b.typeId;
        const r = shutdownBuilding(w, gang.id, b.id);
        logResult(actions, `shut down ${BUILDING_BY_ID[typeId]?.name ?? typeId} #${b.id} — no profit ${n} weeks running`, r.ok, r.ok ? r.message ?? '' : r.error);
        if (r.ok) mem.noProfit.delete(b.id);
      }
    }

    // (17) Staff cars: the lawyer, then the accountant, gets the cheapest car
    // when the cash stays above the reserve after buying it.
    {
      const cheapest = (Object.keys(VEHICLES) as (keyof typeof VEHICLES)[]).sort((a, b) => VEHICLES[a].cost - VEHICLES[b].cost)[0];
      for (const who of ['lawyer', 'accountant'] as const) {
        if (!availableSpecialist(w, gang, who) || gang.staffVehicles?.[who]) continue;
        if (gang.cash - VEHICLES[cheapest].cost < cashReserve) { actions.push(`NOTE no car for the ${who} — the cash would fall below the reserve`); break; }
        if (!buyVehicle(w, gang.id, cheapest).ok) break;
        const r = assignStaffVehicle(w, gang.id, who, cheapest);
        logResult(actions, `a ${VEHICLES[cheapest].name.toLowerCase()} for the ${who}`, r.ok, r.ok ? r.message ?? '' : r.error);
      }
    }
  }

  // ---- the ranked action table: dice weighted by rank when men and cash are spare
  const spare = ready.filter((team) => freeShare(team) >= 0.35);
  if (w.week >= 3 && gangManpower(w, gang) >= 8 && spare.length && gang.cash > reserve) {
    const near = (b: Building) => nearTerritory(w, gang.id, b.blockId, 3);
    // 1.2.38 (Robert): weak or going straight, nothing violent against a rival at war with us.
    const hitOk = (b: Building) => !noHitOn(buildingMapIntel(b, gang.id).ownerGangId) && !noHitOn(b.protection?.gangId);
    const rivalSites = buildingList(w).filter((b) => seenRival(b) && !b.isHQ && b.state === 'trading' && near(b) && hitOk(b)).sort(nearer);
    const raidSites = buildingList(w).filter((b) => raidValue(b, gang.id) > 0 && near(b) && b.protection?.gangId !== gang.id && hitOk(b)).sort((a, b) => raidValue(b, gang.id) - raidValue(a, gang.id));
    const refused = w.lastWeekOrders.filter((o) => o.gangId === gang.id && o.type === 'extort').flatMap((o) => (o.refusals ?? []).map((r) => r.buildingId))
      .map((id) => w.buildings[id]).filter((b): b is Building => !!b && b.state === 'trading' && b.protection?.gangId !== gang.id);
    const rivals = gang.knownPeople.filter((id) => !gang.prisonerIds.includes(id)).map((id) => w.people[id]).filter((p): p is NonNullable<typeof p> => !!p && p.gangId != null && p.gangId !== gang.id && (p.role === 'hood' || p.role === 'lieutenant') && !noHitOn(p.gangId));
    const snitch = Object.values(w.people).find((p) => p.role === 'snitch' && p.status === 'active');
    const rivalGangs = Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated).map((g) => g.id);
    const explosives = (armed ? carried(armed, 'explosives') : inStore(undefined, 'explosives')) > 0;
    // 1.2.36 (Robert): a snitch who had nothing we did not already know is not
    // asked again until something changes. 1.2.37 (Robert): once the rivals
    // are likely to have hired new men — another snitch or set of rival
    // gangs, SNITCH_RETRY_WEEKS weeks gone, or half that once rival men we
    // know of have died since (they replace them). Not on every death or sighting.
    const snitchKey = snitch ? `${snitch.id}|${rivalGangs.join(',')}` : '';
    // 1.2.40: rival men gone from our list (missing or reported dead), never their true state.
    const knownDead = () => (mem.seenGone ?? 0) + [...mem.seen.values()].filter((x) => x.missing || x.dead).length;
    const dry = snitchDry.get(w);
    const snitchNothingNew = !!snitch && !!dry && dry.key === snitchKey && w.week - dry.week < SNITCH_RETRY_WEEKS
      && !(knownDead() > dry.dead && w.week - dry.week >= SNITCH_RETRY_WEEKS / 2);
    const peaceful = policy.violence === 'low';
    // 1.2.37 (Robert): the Expendables crew takes the risky violent work — hits, the FBI, torching rival premises.
    const hitCrew = armed ?? expCrew;
    const available = ACTION_KEYS.filter((key) => !((peaceful || weak) && ['torchRival', 'bombRival', 'kidnapRival', 'killRival', 'raid', 'strikeFbi', 'strikeHQ'].includes(key))).filter((key) => ({
      // 1.2.40: refusers have their own steps (above). 1.2.41: torchRival restored (a comment had swallowed it).
      raid: raidSites.length > 0, pressRefuser: false && refused.length > 0, torchRival: rivalSites.length > 0,
      bombRival: rivalSites.length > 0 && explosives, kidnapRival: rivals.length > 0, killRival: rivals.length > 0 && !!hitCrew,
      snitch: !!snitch && !snitchNothingNew && gang.snitchUsedWeek !== w.week && rivalGangs.length > 0 && gang.cash > reserve + 1500,
      // Rare and low-ranked: the FBI director, struck at his headquarters.
      strikeFbi: !!hitCrew && !lieLow && w.week >= 8 && w.people[w.fbiHeadId]?.status === 'active',
      // 1.2.22: a rival HQ our scouts found, struck at most every few weeks.
      strikeHQ: !!armed && !!hqTarget && !noHitOn(hqTarget.ownerGangId) && !lieLow && w.week >= 8 && w.week - desk.lastHqStrike >= HQ_STRIKE_GAP,
    } as Record<ActionKey, boolean>)[key]);
    const rolls = (gang.cash > reserve + 15000 ? 2 : 1) + (policy.violence === 'high' ? 1 : 0);
    const tried = new Set<ActionKey>();
    for (let n = 0; n < rolls; n++) {
      const key = rollAction(actionRanks, available.filter((k) => !tried.has(k)), rng);
      if (!key) break;
      tried.add(key);
      actions.push(`ROLL ${key} (${ACTION_LABELS[key]}, rank ${actionRanks[key]})`);
      // 1.2.38 (Robert): Torch goes to the attack crew first, the Expendables only if it is busy.
      const crewRole: CrewRole = key === 'pressRefuser' ? 'intimidation' : expCrew && (key === 'killRival' || key === 'strikeFbi') ? 'expendables' : 'muscle';
      const cashBefore = gang.cash;
      if (key === 'snitch') {
        const knownBefore = gang.knownPeople.length;
        const result = buySnitchInfo(w, rng, gang.id, snitch!.id, rivalGangs);
        logResult(actions, `snitch ${snitch!.name}`, result.ok, result.ok ? result.message ?? '' : result.error);
        if (!result.ok && /nothing you do not already know/i.test(result.error)) { snitchDry.set(w, { key: snitchKey, week: w.week, dead: knownDead() }); actions.push(`NOTE snitch ${snitch!.name} not asked again for ${SNITCH_RETRY_WEEKS} weeks (${SNITCH_RETRY_WEEKS / 2} if rival men we know of die meanwhile), or until another snitch or set of rivals`); }
        else snitchDry.delete(w);
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
        if (key === 'torchRival') { const t = [armed, expCrew].filter((x): x is Team => !!x); if (t.length) teams = t; }
      } else if (key === 'strikeHQ' && armed && hqTarget) {
        // 1.2.33: no separate buy — the attack uses what the crew and the store hold.
        proposeHqStrike(hqTarget, 2500, `rolled at rank ${actionRanks[key]}`, key);
        continue;
      } else if (key === 'strikeFbi') {
        targetPersonId = w.fbiHeadId; value = 200;
        input = (team) => ({ type: 'kill', personId: w.fbiHeadId, opts: { manpower: manpowerFor(team, 4) } });
      } else {
        // 1.2.40 (Robert): B8 by what we can see — role (lieutenant first), then
        // the last-seen place nearest our office (where the crews set out from).
        const victim = [...rivals].sort(byRoleAndPlace)[0]; targetPersonId = victim.id;
        const last = mem.seen.get(victim.id);
        why = `${why}; B8 ${victim.name} (${victim.role}), last seen ${last?.block != null ? `in block ${last.block}` : 'nowhere reported'}`;
        input = (team) => ({ type: key === 'kidnapRival' ? 'kidnap' : 'kill', personId: victim.id, opts: { manpower: manpowerFor(team, 3) } });
      }
      const tb = targetBuildingId, tp = targetPersonId;
      propose({ label: ACTION_LABELS[key], kind, value, why, role: crewRole, teams, prepare, minFree, input,
        onGiven: (team) => { pendingActions.push({ key, orderId: team.orderIds[team.orderIds.length - 1], targetBuildingId: tb, targetPersonId: tp, cashBefore }); } });
    }
  }

  // 1.2.37 (Robert): strong enough, the rival HQ strike comes first and the
  // armed crews ambush rival men with rifles (existing orders only).
  if (!weak && policy.violence !== 'low' && !lieLow) {
    const hqProp = proposals.find((p) => p.label.startsWith('HQ attack'));
    if (hqProp) hqProp.value = Math.max(hqProp.value, HQ_FIRST_VALUE);
    else if (hqTarget && armed && w.week - desk.lastHqStrike >= HQ_STRIKE_GAP) proposeHqStrike(hqTarget, HQ_FIRST_VALUE, `strong enough — the rival HQ first (${w.gangs[hqTarget.ownerGangId!].name})`, 'strikeHQ');
    // 1.2.39 (Robert): no ambush while weak or going straight against a rival
    // at war with us — only a block where a rival we may hit was seen.
    const hittable = new Set(Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated && !noHitOn(g.id)).flatMap((g) => sightedBlocks(g.id)));
    const block = sightedBlocks().find((b) => hittable.has(b));
    if (block == null && sightedBlocks().length) actions.push('NOTE no ambush: the rival men last seen belong to gangs at war with us while we go straight');
    const ambushers = [armed, expCrew].filter((t): t is Team => !!t);
    if (block != null && ambushers.length) {
      propose({ label: `ambush rival men in block ${block} with rifles`, kind: 'violence', value: 1200, why: 'rival men seen there last; long range from cover', teams: ambushers, minFree: MINUTES_PER_WEEK,
        prepare: (team) => {
          const men = Math.min(4, team.memberIds.length + 1);
          while ((team.weapons.rifle ?? 0) < men && (inStore(team, 'rifle') > 0 || gang.cash >= reserve + WEAPONS.rifle.cost)) {
            const got = team === attackCrew && inStore(team, 'rifle') <= 0 ? buyForAttack('rifle') : { ok: true };
            if (!got.ok || !supply(team, 'rifle', true).ok) break;
          }
        },
        input: (team) => ({ type: 'ambush', blockIds: [block], opts: { manpower: manpowerFor(team, 4) } }) });
    }
  }

  // ---- 1.2.23 surplus spending
  if (surplus) {
    actions.push(`NOTE surplus: $${surplusCash.toLocaleString('en-US')} (cash − reserve $${cashReserve.toLocaleString('en-US')} − $20,000) above $${SURPLUS_START.toLocaleString('en-US')} — bribes, buys by the business crew, the strongest rival's HQ`);
    if (lawyer) {
      for (const [id, what] of [[w.mayorId, 'mayor'], [w.policeChiefId, 'police chief']] as const) {
        const o = buyable(id, 0.3);
        if (!o) continue;
        const r = specialistVisit('bribeOfficials', o.id);
        logResult(actions, `surplus: lawyer bribes ${o.name} (${what})`, r.ok, r.ok ? r.message ?? '' : r.error);
        if (r.ok) break; // one errand at a time for the lawyer
      }
      const onPayroll = police.filter((p) => p.employedBy === gang.id).length;
      if (onPayroll < 12) {
        const beats = territoryBlocks(w, gang.id).sort((a, b) => dist(a.center, origin) - dist(b.center, origin)).slice(0, 6).map((block) => block.id);
        if (beats.length) {
          const r = specialistVisit('employPolice', null, beats);
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
    if (hqTarget && armed && !weak && policy.violence !== 'low' && !lieLow && w.week - desk.lastHqStrike >= HQ_STRIKE_GAP && !proposals.some((p) => p.label.startsWith('HQ attack'))) {
      proposeHqStrike(hqTarget, 3000, `surplus cash; ${w.gangs[hqTarget.ownerGangId!].name} is the strongest rival we know of (power ${powerRating(w, w.gangs[hqTarget.ownerGangId!])})`, 'strikeHQ');
    } else if (!hqTarget) actions.push(`NOTE surplus: no rival HQ known yet — scouting for ${priorityRival?.name ?? 'one'}`);
    else if (!proposals.some((p) => p.label.startsWith('HQ attack'))) {
      actions.push(`HQ ATTACK not made on ${w.gangs[hqTarget.ownerGangId!].name}'s HQ: ${!armed ? 'no armed attack crew ready' : policy.violence === 'low' ? 'violence is off for this goal' : lieLow ? `lying low (suspicion ${Math.round(gang.suspicion)})` : `last attack in week ${desk.lastHqStrike}, the next after ${HQ_STRIKE_GAP} weeks`}`);
    }
  }

  // ---- 1.2.23: the decision. Every candidate is scored by the goal and the
  // best that fit go to the crews; the log says why each won or was not given.
  const crewName = (team: Team) => `${w.people[team.lieutenantId]?.name ?? 'crew'} (${named.get(team.id) ?? team.name})`;
  // 1.2.41 (Robert): with no cash to buy businesses (cash at or below the
  // reserve, which gates purchases) the idle business crew collects protection.
  const bizCollects = !!bizCrew && gang.cash <= cashReserve;
  if (bizCollects) actions.push(`NOTE business crew: no cash to buy ($${Math.round(gang.cash)} against a $${cashReserve} reserve) — it collects protection this week`);
  const slots = ready.map((team) => ({ team, name: crewName(team), role: roles.get(team.id), businessOnly: team === bizCrew,
    // 1.2.43: with no other crew ready, the business crew recruits too (the lieutenant goes himself if he must).
    alsoTakes: team === bizCrew && (bizCollects || !ready.some((t) => t !== bizCrew)) ? (p: Proposal<Team>) => (bizCollects && p.label.startsWith('collect')) || (!ready.some((t) => t !== bizCrew) && p.label.startsWith('recruit')) : undefined,
    free: () => outOfTime.has(team.id) ? 0 : freeFor(team) }));
  const decision = decideWeek(goal, proposals, slots, (label, team, p) => {
    let input = inputFor(p, team);
    const site = input.buildingIds?.[0];
    if (p.kind === 'business' && site != null && !buyAllowed(desk, team.id, site)) return { ok: false, error: 'this crew failed there before — retry elsewhere' };
    // 1.2.36: a hood named for a manager swap is kept off the buys — they name another hand.
    if (p.kind === 'business' && swapCands.size && input.opts?.preferredHoodId == null) {
      const buyer = buyerFor(team);
      // 1.2.37 (Robert): when the swap hood is the only business hand, the buy
      // goes first and the swap waits until next week.
      if (!buyer) {
        for (const plan of swapPlans.filter((x) => [team.lieutenantId, ...team.memberIds].includes(x.cand.id))) {
          swapCands.delete(plan.cand.id);
          swapPlans.splice(swapPlans.indexOf(plan), 1);
          actions.push(`MANAGER SWAP waits until next week: ${plan.cand.name} for ${plan.old.name} at ${plan.label} — he is the only business hand for the buy (${label}), which goes first`);
        }
        return give(label, team, input, p.kind);
      }
      input = { ...input, opts: { ...(input.opts ?? {}), preferredHoodId: buyer.id } as IssueOrderInput['opts'] };
      const result = give(label, team, input, p.kind);
      if (result.ok) buysNamed.set(buyer.id, (buysNamed.get(buyer.id) ?? 0) + 1);
      return result;
    }
    return give(label, team, input, p.kind);
  });
  // 1.2.36 (Robert): the manager swaps go out after the buys, each only when
  // the business crew still has the time for it by the game's own check.
  for (const plan of swapPlans) {
    const input: Omit<IssueOrderInput, 'teamId'> = { type: 'runBusiness', buildingIds: [plan.site.id], opts: { manpower: 1, preferredHoodId: plan.cand.id } as IssueOrderInput['opts'] };
    const label = `manager swap at ${plan.label}: ${plan.cand.name} for ${plan.old.name}`;
    const preview = bizCrew ? previewOrder(w, gang.id, { ...input, teamId: bizCrew.id }) : null;
    if (!bizCrew || !preview || !crewHasTime(w, bizCrew, preview)) { actions.push(`MANAGER SWAP waits: ${label} — the business crew has no time left after the buys`); continue; }
    const result = give(label, bizCrew, input, 'business');
    if (result.ok) {
      const orderId = bizCrew.orderIds[bizCrew.orderIds.length - 1];
      pendingSwaps.set(plan.site.id, { orderId, candId: plan.cand.id, oldId: plan.old.id, week: w.week });
      actions.push(`MANAGER SWAP given: ${label} (Run Business, ${plan.cand.name} named)`);
    } else actions.push(`MANAGER SWAP not given: ${label} — ${result.error}`);
  }
  // 1.2.44 (Robert): a crew whose week is full while orders were left over
  // gets a spare car from the cache, or a bought one, when that frees the time
  // for at least one more order and the cash stays above the reserve.
  {
    const leftover = proposals.filter((p) => decision.skipped.some((d) => d.label === p.label && /time|busy|full/i.test(d.line)));
    const carKinds = (['coupe', 'speedster', 'truck'] as const);
    for (const team of leftover.length ? ready : []) {
      if (freeFor(team) >= MIN_FREE_MINUTES && !outOfTime.has(team.id)) continue;
      const fitsOne = () => leftover.find((p) => (p.kind === 'business') === (team === bizCrew) && (!p.teams || p.teams.includes(team)) && (() => {
        const preview = previewOrder(w, gang.id, { ...inputFor(p, team), teamId: team.id });
        return !!preview && crewHasTime(w, team, preview);
      })());
      const spare = carKinds.find((k) => (gang.vehicles[k] ?? 0) > 0);
      const kind = spare ?? 'coupe';
      if (!spare && gang.cash - VEHICLES.coupe.cost <= cashReserve) continue;
      team.vehicles[kind] = (team.vehicles[kind] ?? 0) + 1;
      retimeCrew(w, team);
      const would = fitsOne();
      team.vehicles[kind] = (team.vehicles[kind] ?? 0) - 1;
      retimeCrew(w, team);
      if (!would) continue;
      const got = spare ? transferVehicle(w, gang.id, kind, team.id, true) : buyVehicle(w, gang.id, 'coupe', team.id);
      logResult(actions, `CAR ${spare ? `spare ${kind} moved` : 'coupe bought'} for ${crewName(team)} — its week was full with orders left over; it frees the time for ${would.label}`, got.ok, got.ok ? '' : got.error);
      if (!got.ok) continue;
      const p = fitsOne();
      if (p) {
        const r = give(p.label, team, inputFor(p, team), p.kind);
        if (r.ok) { p.onGiven?.(team, r); decision.given.push({ label: p.label, crew: crewName(team), score: 0, line: `WON ${p.label} → ${crewName(team)} after the car (1.2.44)` }); decision.skipped = decision.skipped.filter((d) => d.label !== p.label); }
      }
    }
  }
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
  // 1.2.42 (Robert): a week with 0 orders given says why, crew by crew.
  if (!decision.given.length) {
    const why = crewsOf().map((team) => {
      const slot = slots.find((x) => x.team === team);
      const hoods = team.memberIds.length;
      const free = crewMenReady(w, team).length;
      const reason = !slot ? (hotCrews.includes(team) ? 'lying low (the lieutenant is hot)' : 'not ready to plan')
        : hoods === 0 ? `only its lieutenant${free ? '' : ', and he is not free to plan (inside a building or busy)'}`
        : !free ? 'no man free to plan (all inside buildings or busy)'
        : outOfTime.has(team.id) || slot.free() < MIN_FREE_MINUTES ? `no time (${Math.round(freeFor(team))} min left for the freest man)`
        : team.id === patrolTeamId ? 'patrols this week'
        : 'every order offered to it was refused (see NOT GIVEN)';
      return `${crewName(team)}: ${hoods} men + lieutenant, ${free} free to plan — ${reason}`;
    });
    actions.push(`NOTE 0 orders given this week (${proposals.length} candidates, pool ${gang.poolIds.length}) — ${why.length ? why.join('; ') : 'no crews at all'}`);
  }
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
  // first: a seat for every man, then the best gun for every man (1.2.36:
  // every crew carries guns, the business and collecting crews too) and cars,
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
    // 1.2.38 (Robert): no guns from the surplus — only the violent jobs are
    // armed, and the attack crew buys its own shotgun and rifle per man.
    for (const t of crews) {
      const role = roles.get(t.id);
      if (role === 'muscle' && carried(t, 'explosives') < t.memberIds.length + 1 && afford(WEAPONS.explosives.cost) && buyForAttack('explosives').ok) bought.push('explosives for the store');
    }
    const counts = new Map<string, number>();
    for (const item of bought) counts.set(item, (counts.get(item) ?? 0) + 1);
    actions.push(`EQUIP surplus: $${Math.round(before - gang.cash).toLocaleString('en-US')} spent, $${Math.round(gang.cash).toLocaleString('en-US')} left (keep $${keep.toLocaleString('en-US')}: reserve${campaignReserve ? ' + campaign' : ''} + $${Math.round(committed).toLocaleString('en-US')} for this week's buys)${counts.size ? ` — ${[...counts].map(([k, n]) => `${n}× ${k}`).join(', ')}` : ' — every crew already has seats and guns'}`);
  }

  // 1.2.38: what the attack crew holds after this week's kit, kept for next week.
  if (attackCrew && crewsOf().includes(attackCrew)) attackHeld.set(w, { teamId: attackCrew.id, weapons: { ...attackCrew.weapons } as Partial<Record<WeaponId, number>> });

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
    `Hood Simulator — auto test (version ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown'})`,
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
  // 1.2.42 (Robert, memory): the report in memory keeps the last
  // REPORT_WEEKS_KEPT weeks; each older block of REPORT_WEEKS_KEPT weeks is
  // written to its own file during the run and dropped from memory.
  const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const weekStarts: { at: number; week: number }[] = [];
  const writtenFiles: string[] = [];
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
      weekStarts.push({ at: actions.length, week: sim.world.week });
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
      if (order.gangId !== sim.playerGang.id || !['recruit', 'buyPremises', 'setUpBusiness', 'export', 'runBusiness'].includes(order.type)) continue;
      const reason = order.failReason || order.results.join(' ');
      // An order still running carries last week's report; say it once.
      const line = `RESULT ${order.type} — ${reason}`;
      if (reason && resultsSaid.get(order.id) !== reason && !resultsSaid.has(line)) actions.push(line);
      if (reason) { resultsNow.set(order.id, reason); resultsNow.set(line, reason); }
    }
    resultsSaid = resultsNow;
    resultsNow = new Map();
    // 1.2.42 (Robert): a heap check in the log every HEAP_CHECK_WEEKS weeks.
    {
      if (weeks.length % HEAP_CHECK_WEEKS === 0) {
        const line = `HEAP CHECK after ${weeks.length} weeks (week ${weekSnap.week}): ${memory.heap ? `used ${formatHeapMb(memory.heap)} of ${Math.round(memory.heap.limit / 1048576)} MB` : 'the browser does not report the heap'}; report lines in memory ${actions.length}`;
        actions.push(line); notes.push(line);
      }
    }
    if (weekStarts.length >= REPORT_WEEKS_KEPT * 2) {
      const cut = weekStarts[REPORT_WEEKS_KEPT].at;
      const from = weekStarts[0].week, to = weekStarts[REPORT_WEEKS_KEPT - 1].week;
      const block = actions.splice(0, cut);
      weekStarts.splice(0, REPORT_WEEKS_KEPT);
      for (const x of weekStarts) x.at -= cut;
      const file = instanceFile(`auto-test-${runStamp}-weeks-${from}-${to}.txt`);
      try {
        const text = [`Auto Test actions, weeks ${from}–${to} (seed ${settings.seed}); the final report holds the later weeks.`, '', ...block].join('\n');
        const parts = splitReport(text);
        for (let k = 0; k < parts.length; k++) await writeReportFile(parts.length === 1 ? file : file.replace(/\.txt$/, `-part${k + 1}of${parts.length}.txt`), parts[k]);
        writtenFiles.push(`weeks ${from}–${to}: ${file}`);
      } catch (error) {
        notes.push(`Weeks ${from}–${to} of the report could not be written (${error instanceof Error ? error.message : String(error)}); they are not kept in memory.`);
      }
    }
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

  if (writtenFiles.length) actions.unshift(`(Earlier weeks were written during the run, ${REPORT_WEEKS_KEPT} weeks a file: ${writtenFiles.join('; ')})`);
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
