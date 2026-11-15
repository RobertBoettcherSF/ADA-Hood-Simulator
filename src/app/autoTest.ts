import { learnedBlock } from './diary';
import { moveSlot, slotLayout } from '../ui/lieutenantSlots';
import { devJournalWeeks, splitReport } from './devJournal';
import { peekStopTraces } from '../sim/devTrace';
import { planRoute } from './routing';
import { weeklyHoodSupply } from '../sim/recruitPool';
import { desertionLoyalty, halfPayLoyalty, weeklyWageLoyalty } from '../sim/systems/economy';
import { resetSystemTimings, systemTimings } from '../sim/simTimings';
import { deskMemory, HQ_STRIKE_GAP, knownRivalHQs, moveRefused, noteRefusedMove, reviewBuys } from './autoBusiness';
import { execChance, execMemory, noteGivenTry, noteNotGiven, settleExec } from './autoExec';
import { crimeRisk, fbiGuard, fbiProject, FBI_BAND, HEAT_WEEKS, heatCost, heatLine, legalCredit, opinionRelief, REST_RISK, streetRisk, warrantRisk, type HeatCost, type HeatMan, type HeatMeasure, type HeatState } from './autoHeat';
import { decideWeek, inputFor, MIN_FREE_MINUTES, scoreOf, type Decision, type OrderKind, type Proposal } from './autoDecide';
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
import { PAY_CUT_LOYALTY, PAY_RAISE_LOYALTY, setDiplomacy, buySnitchInfo, canGoStraight, repairBuilding, setPay, shutdownBuilding, setGoStraight, setRunForOffice, buyVehicle, buyWeapon, hireRecruit, issueOrder, issueStreetOrder, previewOrder, demote, moveToPool, moveToTeam, nearTerritory, promote, sackPerson, dismissPoliceOfficer, transferVehicle, transferWeapon, sellWeapon, stationPoolHood, stockOfficeStash, recallManager, retimeCrew, toggleEvadeTax, assignStaffVehicle, interrogatePrisoner, killPrisoner, releasePrisoner, type ApiResult, type IssueOrderInput } from '../sim/api';
import { ACTION_KEYS, ACTION_LABELS, ACTION_ORDER_TYPE, rollByFitness, assignCrewRoles, BASIC_CREWS, CREW_OPENING_ORDER, carMinutesSaved, crewNames, roleStars, roleCompare, UNUSED_SKILLS, defaultActionRanks, judgeAction, loadActionRanks, raidValue, rankDown, rankUp, type ActionKey, type ActionRanks, type CrewRole, type PendingAction } from './autoActions';
import { DRIVE_SPEED, GO_STRAIGHT_ASSETS, VEHICLES, WALK_SPEED, WEAPONS } from '../sim/constants';
import type { Block, Building, Gang, GameOptions, ID, Person, Team, WeaponId } from '../sim/types';
import { buildingMapIntel, knownBlockOwners, personMapPosition } from '../sim/mapIntel';
import { claimedTerritoryBlocks } from '../sim/territory';
import { BUILDING_BY_ID, coverQuality, ESTABLISHABLE_TYPES, ILLEGAL_TYPES } from '../sim/data/buildings';
import { ORIGINAL_ECONOMICS } from '../sim/data/originalEconomics';
import { purchasablePremisesType } from '../sim/premises';
import { buildingValue, CLEANUP_COST_PER_SITE, COLLECT_REFUSAL_HOSTILITY, extortDifficulty, isValidAreaTarget, protectionBase, RESENTFUL_HOSTILITY, resentsGang, rollChance } from '../sim/execution';
import { originalElectionCity, originalElectionPoll, originalElectionSlot } from '../sim/originalElection';
import { originalBlockVoterAverage, originalBlockVoterCount } from '../sim/originalElectionVotes';
import type { Sim } from '../sim/sim';
import { buildingDoor, CENTRE_LOT, dist, gangAssets, gangManpower, gangMembers, powerRating, protectedBuildings, territoryBlocks, territoryCount } from '../sim/world';
import { buildingList, peopleList } from '../sim/entityLists';
import { MAX_TEAM_SIZE, MAX_TEAMS, MINUTES_PER_WEEK } from '../sim/constants';
import { crewFreeMinutes, crewHasTime, crewLoads, crewMen as crewMenReady, crewUsedShare } from '../sim/crewTime';
import { crewPeople, freeForOrders } from '../sim/orderStaffing';
import { collectFitness, extortFitness, protectionScore, protectionWeek } from '../sim/fitness';
import { bribeLine, convictionStake, dollarScale, efficiency, expectedNet, LASTING_WEEKS, newOrderBook, noteGiven, scoreBribe, settleOrders, trialP, trialSides, SCARE_ARREST_SHARE, WARRANT_SUSPICION, type BribeScore, type OrderBook, type OrderFitness } from './autoFitness';
import { hm } from '../sim/timeFormat';
import { cashNeed, holdValue, runCashPass, CASH_LOOKBACK_WEEKS, IDLE_PENALTY, type CashPassResult, type CashSpend } from './autoCash';
import { jobEarnings, manLine, manValue, ROLE_ORDER_TYPE, type ManContext, type ManValue } from './autoMen';
import { chooseGoal, formatGoalScores, goalsFor, GOAL_LABELS, GOAL_POLICY, GOAL_DROP_WEEKS, GOAL_REVIEW_WEEKS, GOAL_STALL_DROP, GOAL_STALL_PENALTY, goalScores, type VictoryGoal } from './autoGoals';
import { campaignWeeklyCost, canRunForOffice, electionBlocksRequired } from '../sim/systems/politics';

const UNAVAILABLE = new Set(['dead', 'arrested', 'onTrial', 'jailed', 'kidnapped']);

/**
 * LOST lines for everyone who was in the gang and at liberty before the week
 * and is now gone or out of action, with the cause and culprit when the sim
 * recorded them. key groups them for the report's summary.
 */
export function lostLines(w: Sim['world'], gangId: number, before: Map<number, string>, sinceWeek: number): { text: string; key: string; personId: number }[] {
  const recorded = memberLosses(w, gangId, sinceWeek);
  const out: { text: string; key: string; personId: number }[] = [];
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
      // 1.2.54: hiring a better lawyer or accountant lets the old one go (the game's rule) — our own upgrade, not a loss.
      else if (gone && (p.role === 'lawyer' || p.role === 'accountant') && (() => { const now = w.gangs[gangId]?.[p.role === 'lawyer' ? 'lawyerId' : 'accountantId']; return now != null && now !== p.id; })()) {
        const now = w.people[w.gangs[gangId]![p.role === 'lawyer' ? 'lawyerId' : 'accountantId']!];
        cause = `replaced by a better ${p.role}${now ? ` (${now.name}, ${now.skills.intelligence.toFixed(1)}★)` : ''}`;
      }
      else cause = `left the gang (loyalty ${Math.round(p.loyalty)}, paid $${p.pay}, wanted $${p.payDemand})`;
    }
    const kind = /^replaced by a better/.test(cause) ? 'replaced' : /deserted|left the gang/.test(cause) ? 'deserted' : /arrest/.test(cause) ? 'arrested' : /convicted|jailed/.test(cause) ? 'jailed'
      : /kidnap/.test(cause) ? 'kidnapped' : /sacked/.test(cause) ? 'sacked' : p.status === 'dead' ? 'killed' : 'lost';
    // 1.2.48 (Robert): where he fell — block, the premises his order was working, and the order.
    // 1.2.49 (Robert): the block is the street block where he stood, not the premises' own block.
    const block = loss?.pos ? blockAtPos(w, loss.pos) : null;
    const site = loss?.buildingId != null ? w.buildings[loss.buildingId] : undefined;
    const place = [block != null ? `street block ${block}` : '', site ? `${site.typeId} #${site.id}${site.ownerGangId === gangId ? ' (ours)' : site.ownerGangId != null ? ` (${w.gangs[site.ownerGangId]?.name ?? 'a rival'}'s)` : ''}` : '', loss?.orderType ? `on ${loss.orderType}` : loss ? 'no order' : ''].filter(Boolean).join(', ');
    out.push({ text: `LOST ${p.name} (${p.role}) — ${cause}${by ? ` [${by}]` : ''}${place ? ` — ${place}` : ''}`, key: `${kind}${by ? ` by ${by}` : ''}`, personId: id });
  }
  return out;
}

/** 1.2.48 (Robert): rival men our gang killed since `sinceWeek`, by their gang. */
export function rivalKillsLine(w: Sim['world'], gangId: number, sinceWeek: number): string {
  const ours = w.gangs[gangId]?.name;
  const byGang = new Map<string, string[]>();
  for (const l of memberLosses(w, undefined, sinceWeek)) {
    if (l.gangId === gangId || l.by !== ours) continue;
    const name = w.gangs[l.gangId]?.name ?? `gang ${l.gangId}`;
    const block = l.pos ? blockAtPos(w, l.pos) : null;
    byGang.set(name, [...(byGang.get(name) ?? []), `${l.name} (${l.role}${block != null ? `, block ${block}` : ''})`]);
  }
  const total = [...byGang.values()].reduce((n, list) => n + list.length, 0);
  return `RIVALS KILLED BY US ${total}${total ? `: ${[...byGang].map(([name, list]) => `${name} ${list.length} — ${list.slice(0, 5).join(', ')}${list.length > 5 ? `; and ${list.length - 5} more` : ''}`).join('; ')}` : ''}`;
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
/** 1.2.51 (Robert): order fitness — the orders given and each type's running efficiency. */
let orderBook: OrderBook = newOrderBook();
/** 1.2.51: the court actions, chosen by bribe fitness. */
const COURT_KEYS = new Set<ActionKey>(['bribeJudge', 'bribeDA', 'bribeWitness', 'scareWitness', 'bribeJuror']);
/** 1.2.51 (proposed): squalor counted as high in the report's summary line. */
const SQUALOR_HIGH = 50;
/** 1.2.51: shops at 180+ hostility skipped by the campaign's collect routes this run. */
let skippedAt180 = 0;
/** 1.2.51: last week's protection collection rate (collected ÷ claimed), set at planning. */
let collectionRate = 0;
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
import { bribesPaid } from '../sim/finances';
import { blockAtPos } from '../sim/events';
import { leadingRival } from '../sim/aiStance';
import { armedPoolDefenders, gangOffice, hqAvoidance, idleInside, isGangOffice, RAID_REACH, RAID_WAIT_MARGIN } from '../sim/officeDefence';
import { hireQuote, ORIGINAL_DESERTION_LOYALTY, originalRetainerQuote } from '../sim/originalWages';
import { newspaperEdition } from '../sim/newspaper';
import { accountantSkillByte, taxNotCoveredUp } from '../sim/systems/taxes';
import { contrabandDraw, CRIME_ROW_SUSPICION, EVADE_TAX_SUSPICION, FBI_CASE_THRESHOLD, HEAVY_CRIME_SUSPICION, MEMBER_WARRANT_BAR, RACKET_INVESTIGATION_BAR, RAID_MANAGER_BAR, racketEventSuspicion } from '../sim/systems/fbi';
import { donationTarget } from '../sim/charity';
import { fireRate, originalFireOdds, skillByte } from '../sim/fireRoll';
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
import { standardRules } from '../sim/rules';
import { effectiveHostility } from '../sim/attitudes';

/** 1.2.53 (Robert): the BUILD line at the top of every Auto Test file — version and commit. */
export function buildLine(): string {
  return `BUILD ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown'} ${typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'unknown'}`;
}

/**
 * 1.2.53 (Robert): the default Auto Test start — a new city on seed
 * 2158733425, Full game, normal opponents, normal economy, 40×32, with the
 * start of that report ($6,000, 5 hoods, 3 businesses). The player's own name
 * and portrait are kept. A random seed can be chosen instead.
 */
export const DEFAULT_AUTO_TEST_SEED = 2158733425;
export function defaultAutoTestOptions(base: GameOptions, seed: number): GameOptions {
  return { ...base, seed, mode: 'normal', economy: 'normal', opponents: 'normal', startMoney: 6000, startHoods: 5, startBusinesses: 3,
    citySize: 40, cityHeight: 32, cityLayout: 'varied', standardRules: true, scenarioId: undefined, tutorialId: undefined };
}

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
/** 1.2.54 (Robert): weeks of losses the spare's worth reads its loss rate from. */
const SPARE_RATE_WEEKS = 8;
/** 1.2.36 (Robert): a lead is swapped only for 0.5★ or more in the skill that counts (1.2.54: managers go by manager value). */
const LEAD_SWAP_GAIN = 0.5;
/** 1.2.37 (Robert): hoods under this intelligence are armed last (never in Collect or Business) and go to the Expendables. */
const LOW_INT = 2.5;
/** 1.2.38 (Robert): what a man's skills no crew uses count against him (wage cost): WAGE_DRAG × their average. */
const wageDrag = (p: Person) => UNUSED_SKILLS.length ? WAGE_DRAG * UNUSED_SKILLS.reduce((sum, k) => sum + (p.skills[k] ?? 0), 0) / UNUSED_SKILLS.length : 0;
/** 1.2.45 (Robert): a business with no manager trades at the game's full rate (no manager factor). */
const UNMANNED_FACTOR = 1;
/** 1.2.54: the game's manager factor on a business's takings (sim/systems/economy.ts businessProfit). */
const managerFactor = (m: Person) => 0.45 + m.skills.business * 0.16 + m.skills.organization * 0.05;
/** 1.2.45 (Robert): how many names a merged NOT GIVEN line lists. */
const NOT_GIVEN_NAMES = 3;
/** 1.2.46: how many systems the week-end timing line names. */
const TIMING_LINES = 8;
/** 1.2.48 (Robert): the threat score looks back this many weeks. */
const THREAT_WEEKS = 4;
/** 1.2.48 (Robert): threat points per our man a rival killed, per our site it attacked, per its man seen near our sites. */
const THREAT_PER_KILL = 3, THREAT_PER_SITE_ATTACK = 2, THREAT_PER_SIGHTING = 1;
/** 1.2.49 (Robert): high threat from this score up. */
const HIGH_THREAT = 6;
/** 1.2.49 (proposed): land is frozen after this many of our men killed by one gang… */
const LAND_FREEZE_KILLS = 3;
/** 1.2.49 (proposed): …within this many weeks. */
const LAND_FREEZE_WEEKS = 2;
/** 1.2.49 (proposed): the HQ guard's least size while a high-threat gang killed our men in the last THREAT_WEEKS weeks. */
const HQ_GUARD_MIN_UNDER_FIRE = 3;
/** 1.2.49 (Robert): the guard counts our men killed near an office in this many weeks. */
const HQ_GUARD_KILL_WEEKS = 2;
/** 1.2.48 (Robert): the defence zone covers high-threat events of this many weeks. */
const DEFENCE_ZONE_WEEKS = 2;
/** 1.2.48 (Robert): the HQ guard crew posts at most this many men. */
const HQ_GUARD_MAX = 9;
/** 1.2.48: crimes that count as an attack on one of our sites (the rivals' site attacks). */
const SITE_ATTACK_KINDS = new Set(['smashUp', 'raid', 'torch', 'bomb']);
/** 1.2.43 (Robert): this many of our men killed by rivals… */
const LOSS_DEFENCE_KILLS = 5;
/** 1.2.46 (Robert): …and at least this share of our men. */
const LOSS_DEFENCE_SHARE = 0.1;
/** 1.2.46: the game's donation effect, amount ÷ 1000 × (1 + squalor ÷ 60), shifts local opinion by at most 18 (= effect 4.5)… */
const DONATION_FULL_EFFECT = 4500;
/** …and goodwill tops out at 40. */
const GOODWILL_TOP = 40;
/** 1.2.52 (Robert: charity priced with V; proposed): a full-effect donation is worth this many weeks of one man's takings. */
const CHARITY_V_WEEKS = 8;
/** 1.2.52 (proposed): return per $ of the site a buy or set-up leaves us owning (added to its profit return). */
const ASSET_RETURN = 1;
/** 1.2.52 (proposed): with no timing by car yet, a car is taken to speed up this share of a target's time (the travel). */
const CAR_TRAVEL_SHARE = 0.5;
/** …within this many weeks… */
const LOSS_WINDOW_WEEKS = 4;
/** …puts us on defence for this many weeks. */
const LOSS_DEFENCE_WEEKS = 4;
/** 1.2.43 (Robert): after this many empty recruit weeks the runs move to new blocks… */
const RECRUIT_MOVE_WEEKS = 2;
/** …and to venues not tried in this many weeks. */
const RECRUIT_FRESH_WEEKS = 8;
/** 1.2.45 (Robert): below this many men every free man gets a recruit order each week. */
const RECRUIT_EVERY_MAN = 6;
/** 1.2.45 (Robert): the cover (coverQuality) our first illegal business needs… */
const COVER_FIRST = 0.95;
/** …and our second; the rest go behind the best front there is. */
const COVER_SECOND = 0.7;
/** 1.2.46: rackets Auto never picks for a block on its own (the office, rented rooms, the Teamsters for the campaign; the still and the press come by the line). */
const NOT_AUTO_RACKETS = new Set(['office', 'rentedRooms', 'teamsters', 'moonshineStill', 'counterfeitPress']);
/** 1.2.37: the HQ strike's value when the gang is strong enough — above every other order. */
const HQ_FIRST_VALUE = 6000;
/** A racket the gang is saving for: other premises wait until its cost is in hand. */
const savingFor = new WeakMap<Sim['world'], { name: string; cost: number }>();

/** 1.2.47 (Robert): pay floor — no cut below the lesser of ask − this (no loyalty loss) … */
const PAY_FLOOR_UNDER_ASK = 20;
/** … and the least pay above this share of the ask (the smallest weekly loss band, 4 loyalty bytes). */
const PAY_FLOOR_SHARE = 0.76;
/** 1.2.47 (Robert): a cut must keep a man above the desertion line for this many weeks, plus one half-pay week. */
const CUT_WEEKS = 4;
/** 1.2.47 (Robert): weeks without recruiting after a week that sacked for wages. */
const HIRE_COOLDOWN_WEEKS = 3;
/** 1.2.47 (Robert): weeks of takings averaged for the week-end forecast (the lower of this and last week counts). */
const TAKINGS_WEEKS = 4;
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
// 1.2.55 (Robert): the suspicion levels (ease off, lie low), the risky-work
// share and the wanted hold are gone — every order pays its heat (autoHeat.ts).
const RISKY_ORDERS = new Set(['extort', 'raid', 'kidnap', 'kill', 'smashUp', 'torch', 'bomb', 'assault', 'intimidate', 'ambush']);
const suspicionLastWeek = new WeakMap<Sim['world'], number>();

function crewReady(w: Sim['world'], teamId: number): boolean {
  const team = w.teams[teamId];
  const lt = team ? w.people[team.lieutenantId] : undefined;
  // A lieutenant in custody or before a court cannot lead (1.2.20: arrested and onTrial too).
  return !!lt && lt.status === 'active';
}

/**
 * Street heat (1.2.20). A policeman takes a man in when his wanted level, less
 * half the officer's opinion of the gang, passes 45.
 * 1.2.55 (Robert): the fixed rest lines are gone — a man rests in the pool when
 * his street-arrest risk (autoHeat streetRisk, over WANTED_BAND below the
 * game's line) reaches REST_RISK, and comes back once it is 0.
 */
/** A man who killed an FBI agent and is this wanted is sacked rather than hidden. */
export const SACK_WANTED = 80;
export function streetHeat(wanted: number, policeOpinion: number): number {
  return wanted - policeOpinion * 0.5;
}
/** Men resting in the pool until their street heat falls, and FBI hitmen. */
const resting = new WeakMap<Sim['world'], Set<number>>();
/** 1.2.51 (Robert): wanted men — arrests seen per man, the week each man lies low until, and the last week scanned. */
const wantedMen = new WeakMap<Sim['world'], { arrests: Map<number, number>; handled: Map<number, number>; lowUntil: Map<number, number>; scanned: number }>();
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
  /** 1.2.46: our members (not the boss) at last week's planning — who joined since is counted from it. */
  memberIds?: Set<number>;
  /** 1.2.42: rival men dropped from the sightings once off our list for good (still counted as gone). */
  seenGone?: number;
  /** 1.2.42: our last lawyer and accountant (role → person id), to say how one was lost. */
  staffSeen?: Map<string, number>;
  /** 1.2.43: on defence through this week (heavy losses). */
  defenceUntil?: number;
  /** 1.2.48: our blocks last week (stop-the-leader margin). */
  lastBlocks?: number;
  /** 1.2.48: rival men seen, per planning week (gang, man, block). */
  threatSeen?: { week: number; gangId: number; personId: number; block: number }[];
  /** 1.2.47: takings of the last TAKINGS_WEEKS weeks, oldest first. */
  takingsSeen?: number[];
  /** 1.2.47: the last week we sacked for wages. */
  wageSackWeek?: number;
  /** 1.2.55: last week's value of one hire a week (the best open seat's man value, or V for a spare) — settles recruit orders. */
  hireValue?: number;
  /** 1.2.52: the last week a crew was switched to Protection for unvisited shops. */
  protectionSwitchWeek?: number;
  /** 1.2.50: the last week a police officer was dismissed. */
  policeDismissWeek?: number;
  /** 1.2.50: FITNESS running totals since Auto started, and the week last added. */
  fitnessTotals?: { weeks: number; claimed: number; collected: number; declared: number; uncollected: number };
  fitnessWeek?: number;
  /** 1.2.46: the week the heavy-losses defence started, and the kills that started it. */
  defenceFrom?: number;
  defenceKills?: number;
  /** 1.2.43: hood venue → the last week our recruiters tried it. */
  venueTried?: Map<number, number>;
}>();
/** 1.2.50 (Robert): a block whose average voter value reaches this is lost to us in the Standard election. */
const VOTE_LOST_AVERAGE = 164;
/** 1.2.50 (Robert, proposed): a man this close above the desertion line counts as shaky (clothing bank). */
const LOYALTY_TIGHT_MARGIN = 10;
/** 1.2.50 (Robert, proposed): a block of ours this much dirtier than it began gets a clean-up drive. */
const CLEANUP_ABOVE_START = 5;
/** 1.2.50 (Robert, proposed): reluctant blocks put forward for campaign intimidation each week. */
const CAMPAIGN_INTIMIDATE_BLOCKS = 3;
/** 1.2.50 (Robert, proposed): the safe protection raise — level, and the shop's limits. */
const RAISE_LEVEL = 1.5;
const RAISE_GRIEVANCE_BELOW = 0.4;
const RAISE_OPINION_FROM = -20;
/** 1.2.50 (proposed): shops raised in one order a week. */
const RAISE_SHOPS_PER_WEEK = 8;
/** 1.2.51 (Robert): the game's limit on officers on one gang's payroll. */
const POLICE_LIMIT = 10;
/** 1.2.51 (proposed): weeks of scene arrests an officer's value is measured over. */
const POLICE_VALUE_WEEKS = 8;
/** 1.2.51: the chief's opinion gained by one bribe. */
const CHIEF_BRIBE_STEP = 34;
/** 1.2.53 (proposed): the share of the police arrests away from a crime scene each paid officer prevents. */
const PATROL_ARREST_CUT = 0.04;
/** 1.2.54 (Robert): weeks an officer must be worth less than his retainer before he is dismissed. */
const POLICE_LOW_WEEKS = 4;
/** 1.2.54 (proposed): street arrests a week per unit of street heat above the arrest line, before our own record. */
const STREET_ARREST_RATE = 0.2;
/** 1.2.54 (proposed): heat units the prior rate counts as (our record outweighs it soon). */
const STREET_ARREST_PRIOR_UNITS = 20;
/** 1.2.54: the game's street-arrest line — heat (wanted − officer opinion × 0.5) above which an officer may arrest (sim/systems/combat.ts). */
const STREET_ARREST_HEAT = 45;
/** 1.2.54: street heat units and street arrests per week (the forward police value), and each officer's weeks below his retainer. */
const policeLog = new WeakMap<Sim['world'], { weeks: { week: number; units: number; arrests: number }[]; pending: { week: number; units: number } | null; low: Map<number, number> }>();
/** 1.2.53 (proposed): police opinion under which a share of the collecting (our main crime) is dropped. */
const POLICE_CRIME_OPINION = -40;
/** 1.2.53 (proposed): the share of collect routes dropped then, the lowest protection fitness first. */
const POLICE_CRIME_CUT = 0.25;
/** 1.2.51 (Robert, proposed): weeks a released or wanted man lies low in the pool, off heavy crimes. */
const LIE_LOW_WEEKS = 6;
/** 1.2.53 (Robert, as 1.2.51): arrests after which an ordinary hood may be swapped out even with no risk left. */
const SACK_AFTER_ARRESTS = 2;
/** 1.2.53 (proposed): crew men from which office defenders count towards the spares recruiting fills. */
const DEFENDER_SPARES_MIN_MEN = 10;
/** 1.2.52 (proposed): weeks between two crew switches to Protection. */
const PROTECTION_SWITCH_WEEKS = 4;
/** 1.2.55 (proposed): a Business crew that used less than this share of its man-minutes last week is underused. */
const BIZ_UNDERUSED_SHARE = 0.5;
/** 1.2.52 (proposed): the share of the week a crew man works, for man fitness. */
const MAN_WORK_SHARE = 0.5;
/** 1.2.51 (proposed): minutes an intimidation stop takes before the time ledger has one. */
const CAMPAIGN_STOP_MINUTES = 30;
/** 1.2.51 (proposed): most cars a Protection crew is bought for its collect routes. */
const COLLECT_CARS = 2;
/** 1.2.51 (proposed): a bribe is taken when its benefit is at least this many times its cost. */
const BRIBE_MIN_RATIO = 1;
/** 1.2.51 (proposed): what buying the witness or juror the DA's list opens costs, on top of the DA. */
const DA_FOLLOW_UP_COST = 1300;
/** 1.2.50 (Robert, proposed): weeks after a dismissal before another officer is hired. */
const POLICE_REHIRE_WEEKS = 4;
/** 1.2.42 (Robert): weeks running a crew may have only its lieutenant before it is broken up. */
const LONE_LIEUTENANT_WEEKS = 2;
/** 1.2.42 (Robert): weeks of empty recruit runs before a manager is pulled back into a crew. */
const RECRUIT_DRY_WEEKS = 4;
/** 1.2.42 (Robert): a buy or set-up never leaves the crew below this many men. */
const MIN_CREW_AFTER_MANAGER = 3;
/** 1.2.54 (Robert): weeks of the expected profit increase a manager swap is counted for. */
const SWAP_WEEKS = 8;
/** 1.2.54 (Robert): a manager swap goes ahead when its gain beats its cost by this factor. */
const SWAP_MARGIN = 1.5;
/** 1.2.54 (Robert): crew man-minutes a Run Business order takes (the game's 150 a site). */
const SWAP_MAN_MINUTES = 150;
/** 1.2.55 (proposed): the least a crew man-minute is priced at in a swap's cost ($), when the crew's own rate is unknown or nil. */
const SWAP_RATE_FLOOR = 1;
/** 1.2.54 (Robert): weeks a manager's history is shown for, per site. */
const SITE_HISTORY_WEEKS = 6;
/** 1.2.54 (Robert): per-site weekly profit and manager, for the reports. */
const siteHistory = new WeakMap<Sim['world'], Map<number, { week: number; profit: number; managerId: number | null }[]>>();
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
const swapsPending = new WeakMap<Sim['world'], Map<number, { orderId: number; candId: number; oldId: number | null; week: number }>>();
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
  // 1.2.54 (Robert): order completion — last week's orders followed to their end.
  const exec = execMemory(w);
  { const line = settleExec(exec, w, new Set()); if (line) actions.push(line); }
  /** 1.2.54: dollars the cash pass approved, by proposal label (for ORDER EXEC). */
  const approvedBy = new Map<string, number>();
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
      // 1.2.48: kept for the threat score (sightings near our sites) and the defence zone.
      const seenBlock = m.pos ? blockAtPos(w, m.pos) : null;
      if (seenBlock != null) (mem.threatSeen ??= []).push({ week: w.week, gangId: p.gangId, personId: p.id, block: seenBlock });
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
  // 1.2.46 (Robert, fix): recruited hoods go straight to the pool or the crew,
  // never onto the recruit list, so the count is taken from the hoods who
  // joined since last week (members we did not have then). It never reset before.
  const memberIdsNow = new Set(gangMembers(w, gang).filter((p) => p.role !== 'boss').map((p) => p.id));
  const hoodsJoined = mem.memberIds ? [...memberIdsNow].filter((id) => !mem.memberIds!.has(id) && w.people[id]?.role === 'hood').length : 0;
  mem.memberIds = memberIdsNow;
  // 1.2.45 (Robert): a week with no hood recruit order given counts as empty too.
  mem.dryRecruitWeeks = hoodRunsLast.length && hoodsJoined > 0 ? 0 : (mem.dryRecruitWeeks ?? 0) + 1;
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
    // 1.2.54: a lawyer or accountant is hired to his post, not to the pool.
    const staff = person && (person.role === 'lawyer' || person.role === 'accountant') ? person.role : null;
    logResult(actions, staff ? `hire ${person!.name} as ${staff} (${person!.skills.intelligence.toFixed(1)}★)` : `hire ${person?.name ?? id} to the pool`, result.ok, result.ok ? result.message ?? '' : result.error);
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
    // 1.2.45 (Robert): the Business crew, the recruit crew and either of our
    // last two crews are never broken up (1.2.43 kept only the recruit crew
    // and our only working crew).
    const roleHere = rolesNow().get(team.id);
    const keptAs = roleHere === 'business' ? 'the Business crew' : roleHere === 'recruit' ? 'the recruit crew' : crewsOf().length <= 2 ? `one of our last ${crewsOf().length} crews` : null;
    if (keptAs) {
      actions.push(`NOTE LONE LIEUTENANT ${w.people[team.lieutenantId]?.name ?? team.id}'s crew (${team.name}) kept — only its lieutenant for ${n} weeks, but it is ${keptAs}`);
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

  // Wages. 1.2.47 (Robert): one reserve and the recruiting count by what our
  // men ask (not by cut pay); sacking from a week-end forecast; cuts with a
  // floor, planned over several weeks.
  const payroll = gangMembers(w, gang).filter((p) => p.role !== 'boss');
  // 1.2.49 (Robert): last week's cash, line by line — takings, wages, upkeep,
  // buys, bribes, tax and the rest (other = the unexplained remainder up to the cash now).
  {
    const r = gang.lastFinanceReport;
    if (r) {
      const takings = r.income.legal + r.income.illegal + r.income.protection + r.income.other;
      const bribes = bribesPaid(w, gang.id, r.week);
      const buys = r.costs.purchases - bribes;
      const change = gang.cash - r.openingCash;
      const other = change - (takings - r.costs.wages - r.costs.upkeep - r.costs.tax - r.costs.purchases);
      const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
      actions.push(`CASH week ${r.week}: ${usd(r.openingCash)} → ${usd(gang.cash)} (${change >= 0 ? '+' : '−'}${usd(Math.abs(change))}) = takings ${usd(takings)} − wages ${usd(r.costs.wages)} − upkeep ${usd(r.costs.upkeep)} − buys ${usd(buys)} − bribes ${usd(bribes)} − tax ${usd(r.costs.tax)} ${other >= 0 ? '+' : '−'} other ${usd(Math.abs(other))}${Math.round(other) !== 0 ? ' (unexplained remainder)' : ''}`);
    }
  }
  const wageBill = payroll.reduce((sum, p) => sum + p.pay, 0);
  const asksBill = payroll.reduce((sum, p) => sum + p.payDemand, 0);
  const upkeepLast = gang.lastWeekCosts.upkeep;
  const income = gang.lastWeekIncome;
  const takingsLast = income.legal + income.illegal + income.protection + income.other;
  // 1.2.51 (Robert): the shared dollar scale — V (a man's week of takings),
  // the hire cost, A (an arrest) and L (a man lost) — and last week's orders
  // settled by it.
  const scale = dollarScale(takingsLast, crewMen(), payroll.length ? wageBill / payroll.length : 0, WEAPONS.pistol.cost);
  {
    const lastProt = protectionWeek(w, gang.id, w.week - 1);
    const take = gang.protectionTake?.week === w.week - 1 ? gang.protectionTake.full : 0;
    collectionRate = lastProt.claimed > 0 ? Math.min(1, take / lastProt.claimed) : 0;
    actions.push(`SCALE V $${scale.V} (takings $${Math.round(takingsLast)} ÷ ${crewMen()} men), hire $${scale.hire}, arrest A $${scale.A}, lost L $${scale.L}; protection collected ${Math.round(collectionRate * 100)}% of claimed`);
    for (const line of settleOrders(orderBook, w, gang, { gangId: gang.id, scale, collectionRate, hireValue: mem.hireValue })) actions.push(line);
  }
  // 1.2.55 (Robert): no extort brake — the collection rate and the Protection
  // crews' spare time are in each extortion's value (proposeExtort).
  /** 1.2.47 (Robert): last week's net at full asks — takings − asks − upkeep. */
  const weeklyNet = takingsLast - asksBill - upkeepLast;
  const takingsSeen = mem.takingsSeen ?? (mem.takingsSeen = []);
  takingsSeen.push(takingsLast);
  if (takingsSeen.length > TAKINGS_WEEKS) takingsSeen.shift();
  const expectedTakings = Math.min(takingsLast, takingsSeen.reduce((sum, t) => sum + t, 0) / takingsSeen.length);
  // Buys and set-ups already given and not yet paid for.
  const plannedSpend = desk.pending.reduce((sum, p) => {
    const order = w.orders[p.orderId];
    if (!order || order.state === 'done' || order.state === 'failed' || order.state === 'cancelled') return sum;
    const b = w.buildings[p.buildingId];
    const type = order.opts.businessTypeId ? BUILDING_BY_ID[order.opts.businessTypeId] : undefined;
    return sum + (type ? type.cost : b && p.type === 'buyPremises' ? buildingValue(w, b) : 0);
  }, 0);
  const forecastCash = gang.cash + expectedTakings - plannedSpend;
  // 1.2.52 (Robert): the cash need R replaces the 3-week reserve and the extra
  // week's bill: max(0, bill − the lowest takings of the last 4 weeks) + one
  // week's bill + money committed (spending given, campaign upkeep until the
  // vote; bribes booked this week are counted where they are booked).
  const campaignUpkeep = w.election.active && w.election.candidates.some((c) => c.kind === 'gang' && c.gangId === gang.id) ? campaignWeeklyCost(w, gang.id) * w.election.weeksLeft : 0;
  const need = cashNeed(wageBill + upkeepLast, takingsSeen, plannedSpend + campaignUpkeep);
  const reserveNeed = need.R;
  const avgPay = payroll.length ? wageBill / payroll.length : 0;
  const managerIds = new Set(buildingList(w).filter((b) => b.ownerGangId === gang.id && b.managerId != null).map((b) => b.managerId!));
  // 1.2.47 (Robert): when the forecast week-end cash (cash + the lower of last
  // week's and the 4-week average takings − spending already given) is under
  // the wages and upkeep, spending and hiring stop this week and pool hoods are
  // sacked until it covers them: lowest value per wage (best crew-job stars ÷
  // pay) first, the office defenders last.
  let bill = wageBill + upkeepLast;
  const spendStop = forecastCash < bill;
  let sackedForWages = 0;
  if (spendStop) {
    const warsNow = Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated && gang.known[g.id] === 'war').length;
    // The HQ's defenders are the oldest pool hoods, plus hoods stationed at our other offices.
    const keep = POOL_DEFENDERS + DEFENDERS_PER_WAR * warsNow;
    const stationedAway = (p: Person) => { const st = p.homeOfficeId != null ? w.buildings[p.homeOfficeId] : undefined; return !!st && isGangOffice(st, gang.id) && !st.isHQ; };
    const pool = gang.poolIds.map((id) => w.people[id]).filter((p): p is Person => !!p && p.role === 'hood' && p.status === 'active').sort((a, b) => a.id - b.id);
    const atHq = pool.filter((p) => !stationedAway(p));
    const defenders = new Set([...atHq.slice(0, keep), ...pool.filter(stationedAway)].map((p) => p.id));
    const valuePerWage = (p: Person) => Math.max(...CREW_OPENING_ORDER.map((r) => roleStars(p, r))) / p.pay;
    const byValue = (a: Person, b: Person) => valuePerWage(a) - valuePerWage(b) || b.id - a.id;
    const order = [...pool.filter((p) => !defenders.has(p.id)).sort(byValue), ...pool.filter((p) => defenders.has(p.id)).sort(byValue)];
    const sacked: string[] = [];
    for (const p of order) {
      if (forecastCash >= bill) break;
      const pay = p.pay, value = valuePerWage(p), defender = defenders.has(p.id);
      const r = sackPerson(w, gang.id, p.id);
      if (r.ok) { bill -= pay; sacked.push(`${p.name} ($${pay}, ${value.toFixed(3)}★ per $${defender ? ', a defender' : ''})`); }
    }
    sackedForWages = sacked.length;
    if (sacked.length) mem.wageSackWeek = w.week;
    actions.push(`PAY forecast week-end cash $${Math.round(forecastCash)} (cash $${Math.round(gang.cash)} + expected takings $${Math.round(expectedTakings)} − spending given $${Math.round(plannedSpend)}) under wages + upkeep $${wageBill + upkeepLast}: spending and hiring stopped this week; ${sacked.length ? `sacked ${sacked.length} pool hood(s), lowest value per wage first, defenders last — ${sacked.join(', ')}` : 'no pool hood to sack'}${forecastCash < bill ? ` — still $${Math.round(bill - forecastCash)} short` : ''}`);
  }
  /** 1.2.47 (Robert): the one reserve for every spend; in a week spending stopped, all the cash is held back. */
  const cashReserve = spendStop ? Math.max(reserveNeed, Math.round(gang.cash)) : reserveNeed;
  /** 1.2.49 (Robert): bribes the lawyer is booked to pay at his visits this week, counted against the cash before any other spending. */
  let bribesDue = 0;
  const spendOk = (cost: number) => gang.cash - bribesDue - cost >= cashReserve;
  const aboveReserve = () => gang.cash - bribesDue - cashReserve;
  /** 1.2.52 (Robert): discretionary spends wait for the one cash pass (before the decision), best return per $ first. */
  const cashSpends: CashSpend[] = [];
  const want = (spend: CashSpend) => { cashSpends.push(spend); };
  /** 1.2.53: set while the cash pass runs a spend — whether it proposed an order and whether a crew was given it. */
  let spendTrack: { proposed: boolean; given: boolean } | null = null;
  const spendTracks = new Map<CashSpend, { proposed: boolean; given: boolean }>();
  let firstPass: CashPassResult | null = null;
  /**
   * 1.2.52 (Robert): a car's return per $ — the man-minutes it saves a week
   * (per-target minutes on foot − by car, from the time log, × the targets one
   * man covers a week, at most `targets`) × the order type's efficiency over
   * LASTING_WEEKS ÷ its price. With no car figure yet, the car is taken to
   * save CAR_TRAVEL_SHARE of the foot time at the drive/walk speed ratio.
   */
  const carReturn = (type: string, price: number, targets: number): { ret: number; why: string } => {
    const foot = timeLedger[ledgerKey(type, false)], eff = efficiency(orderBook, type);
    if (foot == null || eff == null) return { ret: 0, why: `no ${type} ${foot == null ? 'timing on foot' : 'efficiency'} yet` };
    const byCar = timeLedger[ledgerKey(type, true)] ?? foot * (1 - CAR_TRAVEL_SHARE * (1 - WALK_SPEED / DRIVE_SPEED));
    const covered = Math.min(targets, MINUTES_PER_WEEK / Math.max(1, byCar));
    const saved = Math.max(0, foot - byCar) * covered;
    return { ret: saved * eff * LASTING_WEEKS / price, why: `${hm(saved)} saved a week (${hm(foot)} → ${hm(byCar)} a target × ${Math.round(covered)}) × $${eff.toFixed(2)}/man-min × ${LASTING_WEEKS} wk` };
  };
  /** 1.2.52 (Robert, proposed): man fitness — each man's weekly worth on the dollar scale (autoMen.ts). */
  const manCtx: ManContext = { scale, eff: (role) => { const t = ROLE_ORDER_TYPE[role]; return t ? efficiency(orderBook, t) : null; },
    workMinutes: MINUTES_PER_WEEK * MAN_WORK_SHARE, stars: (p, role) => roleStars(p, role), warrantBar: MEMBER_WARRANT_BAR };
  /** A pool man's worth in his best job (a crew job open to him or not). */
  const bestJobNet = (p: Person) => Math.max(...CREW_OPENING_ORDER.map((r) => manValue(p, r, manCtx, MINUTES_PER_WEEK).net));
  /** MEN FIT moves this week, with their reasons. */
  const menMoves: string[] = [];
  /** Spares and office defenders the pool keeps (set by the firing step). */
  let sparesWanted = 0;
  /** … of which office defenders. */
  let defendersWanted = 0;
  const members = payroll.filter((p) => p.gangId === gang.id && p.status === 'active');
  const short = members.filter((p) => p.pay < p.payDemand);
  // 1.2.50 (Robert): pay is cut only when the week-end forecast (the same as
  // for sacking) is under one week's asks + upkeep — no longer whenever the
  // cash is under the reserve.
  const cutLine = asksBill + upkeepLast;
  if (forecastCash < cutLine) {
    // 1.2.47 (Robert): crew hoods only (never lieutenants,
    // managers, the lawyer or the accountant) are cut, re-planned each week:
    // no lower than the lesser of ask − $20 and the least pay above 76% of the
    // ask, and only as low as keeps him above the desertion line for
    // CUT_WEEKS weeks at that pay with the cut's own cost and one half-pay
    // week. No pay from the floor up does: his full ask.
    const line = desertionLoyalty(w), hit = halfPayLoyalty(w);
    const floorPay = (p: Person) => Math.min(p.payDemand - PAY_FLOOR_UNDER_ASK, Math.floor(p.payDemand * PAY_FLOOR_SHARE) + 1);
    const after = (p: Person, pay: number) => p.loyalty - (pay < p.pay ? PAY_CUT_LOYALTY : 0) + (pay > p.pay && pay >= p.payDemand ? PAY_RAISE_LOYALTY : 0) + CUT_WEEKS * weeklyWageLoyalty(w, p, gang.id, pay) - hit;
    const changed: string[] = [];
    let saved = 0;
    for (const p of members.filter((x) => x.role === 'hood' && !managerIds.has(x.id))) {
      let pay = Math.max(p.pay, p.payDemand);
      for (let v = floorPay(p); v < p.payDemand; v++) if (after(p, v) > line) { pay = v; break; }
      if (pay === p.pay) continue;
      saved += p.pay - pay;
      changed.push(`${p.name} $${p.pay}→$${pay} (ask $${p.payDemand}, loyalty ${Math.round(p.loyalty)}, ${Math.round(after(p, pay) + hit)} after ${CUT_WEEKS} weeks)`);
      setPay(w, p.id, pay);
    }
    actions.push(`PAY short of cash (week-end forecast $${Math.round(forecastCash)} under a week's asks + upkeep $${cutLine}): ${changed.length ? `${changed.length} pay change(s), $${saved} a week less — floor min(ask − $${PAY_FLOOR_UNDER_ASK}, above ${Math.round(PAY_FLOOR_SHARE * 100)}% of ask), above the desertion line ${line.toFixed(1)} for ${CUT_WEEKS} weeks with one half-pay week: ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? `; and ${changed.length - 3} more` : ''}` : 'no pay change'}; lieutenants, managers, the lawyer and the accountant untouched`);
  } else if (short.length) {
    // 1.2.52 (Robert, replaces the 1.2.47 least-loyal-first raises): a raise
    // is a spend — desertions avoided × L ÷ the raise over LASTING_WEEKS. A man
    // who would cross the desertion line within that time at his pay, and not
    // at his ask, is a desertion avoided; the others are not worth raising.
    const line = desertionLoyalty(w);
    const ahead = (p: Person, pay: number) => p.loyalty + (pay > p.pay && pay >= p.payDemand ? PAY_RAISE_LOYALTY : 0) + LASTING_WEEKS * weeklyWageLoyalty(w, p, gang.id, pay);
    let loyal = 0;
    for (const p of short) {
      const step = p.payDemand - p.pay;
      if (!(ahead(p, p.pay) <= line && ahead(p, p.payDemand) > line)) { loyal++; continue; }
      want({ immediate: true, label: `raise ${p.name} +$${step}`, kind: 'raise', cost: step, ret: scale.L / (step * LASTING_WEEKS),
        why: `loyalty ${Math.round(p.loyalty)} crosses the desertion line within ${LASTING_WEEKS} weeks at $${p.pay}, not at his ask; L $${scale.L}`,
        run: () => { setPay(w, p.id, p.payDemand); return true; } });
    }
    actions.push(`PAY ${short.length} under their ask: ${short.length - loyal} raise(s) put to the cash pass (a desertion avoided each)${loyal ? `; ${loyal} stay loyal at their pay or would leave anyway — no raise` : ''}`);
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
  // 1.2.55 (Robert): a man's street-arrest risk by the heat model, at the opinion of the officers we do not pay (paid ones never arrest).
  const unpaidPolice = police.filter((p) => p.employedBy !== gang.id && p.bribedBy !== gang.id);
  const officerOpinion = unpaidPolice.length ? unpaidPolice.reduce((n, p) => n + (p.opinion[gang.id] ?? 0), 0) / unpaidPolice.length : 0;
  const riskOfMan = (id: number) => { const p = w.people[id]; return p ? streetRisk(p.wanted, officerOpinion) : 0; };
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
  // 1.2.54 (Robert): a crew hood at the rest line goes through the wanted swap below.
  // 1.2.51 (Robert): wanted men. Each arrest is counted once per man. A man
  // released, or with an FBI warrant out, goes to the pool and lies low there
  // (off every order, so off heavy crimes) for LIE_LOW_WEEKS (1.2.52: an
  // ordinary hood with a comparable replacement is sacked instead).
  const wanted = wantedMen.get(w) ?? { arrests: new Map<number, number>(), handled: new Map<number, number>(), lowUntil: new Map<number, number>(), scanned: -1 };
  wantedMen.set(w, wanted);
  if (wanted.scanned !== w.week - 1) {
    wanted.scanned = w.week - 1;
    for (const l of memberLosses(w, gang.id, w.week - 1)) if (l.week === w.week - 1 && /arrest/.test(l.cause)) wanted.arrests.set(l.personId, (wanted.arrests.get(l.personId) ?? 0) + 1);
  }
  for (const p of gangMembers(w, gang)) {
    if (p.status !== 'active' || p.role === 'boss') continue;
    const arrests = wanted.arrests.get(p.id) ?? 0;
    const released = arrests > (wanted.handled.get(p.id) ?? 0);
    wanted.handled.set(p.id, arrests);
    // 1.2.54 (Robert): a crew hood at the street-heat rest line (1.2.20) takes the same path.
    const restLine = p.role === 'hood' && crewsOf().some((t) => t.memberIds.includes(p.id)) && riskOfMan(p.id) >= REST_RISK;
    if (!released && !restLine && !(p.fbiWarrant && !((wanted.lowUntil.get(p.id) ?? 0) > w.week))) continue;
    const cause = released ? `released after arrest ${arrests}` : p.fbiWarrant ? 'FBI warrant' : `at the rest line (street heat ${Math.round(heatOfMan(p.id))}, arrest risk ${riskOfMan(p.id).toFixed(2)})`;
    // 1.2.52 (Robert, replaces the second-arrest sacking): a wanted ordinary
    // hood is sacked when a comparable man can be swapped in from the pool
    // (1.2.53: at least his stars and net value, not wanted himself); a
    // wanted lieutenant stays, lies low in the pool and gets court bribes.
    // 1.2.53 (Robert, through man value): only a hood who still carries a
    // risk — an FBI warrant, or (1.2.55) any chance of a warrant within the heat
    // horizon (autoHeat warrantRisk) — or who has been arrested twice, as in 1.2.51;
    // and only for a replacement with at least his stars and his net value.
    const risky = !!p.fbiWarrant || restLine || warrantRisk(p.crimeSuspicion ?? 0) > 0 || arrests >= SACK_AFTER_ARRESTS;
    if (p.role === 'hood' && !managerIds.has(p.id) && risky) {
      const crew = crewsOf().find((t) => t.memberIds.includes(p.id));
      const job = crew ? rolesNow().get(crew.id) : undefined;
      const stars = (x: Person) => job ? roleStars(x, job) : Math.max(...CREW_OPENING_ORDER.map((r) => roleStars(x, r)));
      const mine = manValue(p, job ?? null, manCtx, MINUTES_PER_WEEK);
      const swap = idlePool().map((id) => w.people[id]).filter((x): x is Person => !!x && x.id !== p.id && !x.fbiWarrant && !((wanted.lowUntil.get(x.id) ?? 0) > w.week) && stars(x) >= stars(p) && manValue(x, job ?? null, manCtx, MINUTES_PER_WEEK).net >= mine.net)
        .sort((a, b) => stars(b) - stars(a) || a.id - b.id)[0];
      if (swap) {
        const result = sackPerson(w, gang.id, p.id);
        const moved = result.ok && crew ? moveToTeam(w, gang.id, swap.id, crew.id) : undefined;
        logResult(actions, `WANTED sack ${p.name} (${cause}; ${stars(p).toFixed(1)}★, risk $${mine.risk}/wk) — ${swap.name} (${stars(swap).toFixed(1)}★) ${crew ? `takes his place in ${crew.name}` : 'is a comparable spare'}`, result.ok, result.ok ? (moved && !moved.ok ? `swap refused: ${moved.error}` : result.message ?? '') : result.error);
        if (result.ok) { menMoves.push(`sacked wanted ${p.name} → ${swap.name}`); wanted.lowUntil.delete(p.id); continue; }
      }
    }
    // A man at the rest line only rests (back once his heat falls); a released or wanted man lies low LIE_LOW_WEEKS.
    if (released || p.fbiWarrant) wanted.lowUntil.set(p.id, w.week + LIE_LOW_WEEKS);
    const crew = crewsOf().find((t) => t.memberIds.includes(p.id));
    if (crew) { const r = moveToPool(w, gang.id, p.id); if (!r.ok) actions.push(`NOTE ${p.name} could not be moved to the pool: ${r.error}`); }
    if (gang.poolIds.includes(p.id)) restingMen.add(p.id);
    actions.push(`WANTED ${p.name} (${p.role}) ${cause} — ${released || p.fbiWarrant ? `lies low in the pool, off heavy crimes, until week ${w.week + LIE_LOW_WEEKS}` : 'rests in the pool until his street heat falls, so an arrest cannot take his crew'}`);
  }
  for (const id of [...restingMen]) {
    const p = w.people[id];
    if (!p || p.gangId !== gang.id || p.status !== 'active' || !gang.poolIds.includes(id)) { restingMen.delete(id); continue; }
    if (riskOfMan(id) <= 0 && !(hitmen.has(id) && p.wanted > 5) && !((wanted.lowUntil.get(id) ?? 0) > w.week)) { restingMen.delete(id); hitmen.delete(id); }
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
    // 1.2.45 (Robert): no Business crew — the best pool hood with 3★+ business
    // founds it before the existing crews are filled (recruiting looks for one otherwise).
    if (!heldRoles().includes('business')) {
      const lead = pickLead('business', () => poolHoods().filter((p) => p.skills.business >= 3));
      if (!lead) actions.push('NOTE no Business crew: no pool hood with 3★ business to found it — recruiting looks for one');
      else if (gang.teamIds.length >= MAX_TEAMS) actions.push(`NOTE no Business crew: already ${MAX_TEAMS} lieutenants (${lead.name} would found it)`);
      else open('business', lead, ' — no Business crew: founded before the existing crews are filled');
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
    // 1.2.51 (Robert): pool men fill the Protection (collect) crews first.
    for (const p of [...placeable].filter((x) => gang.poolIds.includes(x.id))) {
      const collectFirst = crewsOf().filter((team) => roleOf(team) === 'collect' && team.memberIds.length < MAX_TEAM_SIZE - 1)
        .sort((a, b) => b.memberIds.length - a.memberIds.length || a.id - b.id)[0];
      if (collectFirst) {
        const result = moveToTeam(w, gang.id, p.id, collectFirst.id);
        logResult(actions, `to crew ${p.name} (${roleStars(p, 'collect').toFixed(1)}★ for ${jobName('collect')}) — the Protection crews fill first`, result.ok, result.ok ? result.message ?? '' : result.error);
        continue;
      }
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
    // 1.2.52 (Robert, replaces the 3★ rule and the full-Expendables wait):
    // wages are a spend. The pool keeps its spares and defenders (the best by
    // man value); any other pool hood whose value in his best open job (none
    // with every crew full) is below his pay is let go, weakest first.
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
      if (idle.length) actions.push(`NOTE spares: ${idle.length} in the pool, ${lost} kept against men lost in the last ${SPARE_LOSS_WEEKS} weeks (men we let go not counted) + ${defenders} office defenders (${wars} rival(s) at war)${!full ? ' — a crew can still take a pool hood (others are valued in their best open job)' : ''}; the rest are let go when worth less than their pay`);
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
      }
      const still = idle.filter((p) => gang.poolIds.includes(p.id) && p.status === 'active');
      const ranked = [...still].sort((a, b) => bestJobNet(b) - bestJobNet(a) || a.id - b.id);
      sparesWanted = lost + defenders; defendersWanted = defenders;
      const keptSpares = new Set(ranked.slice(0, sparesWanted).map((p) => p.id));
      // 1.2.54 (Robert, through man value): a pool spare beyond those kept is
      // worth his hire cost ÷ the weeks until he is expected to be needed (the
      // k-th extra spare after (spares kept + k) ÷ the 8-week loss rate), so a
      // wave of losses is not met by sacking now and rehiring later.
      const lossRate = memberLosses(w, gang.id, w.week - SPARE_RATE_WEEKS).filter((l) => l.week < w.week && (l.role === 'hood' || l.role === 'lieutenant') && l.cause !== 'sacked').length / SPARE_RATE_WEEKS;
      const extras = ranked.filter((p) => !keptSpares.has(p.id));
      const spareWorth = (p: Person) => { const k = extras.indexOf(p) + 1; return lossRate > 0 && k > 0 ? Math.round(scale.hire * lossRate / (keptSpares.size + k)) : 0; };
      const valued = ranked.filter((p) => !keptSpares.has(p.id)).map((p) => ({ p, v: manValue(p, full ? null : CREW_OPENING_ORDER.filter((r) => crewsOf().some((t) => canFill(t) && rolesNow().get(t.id) === r)).sort((a, b) => manValue(p, b, manCtx, MINUTES_PER_WEEK).net - manValue(p, a, manCtx, MINUTES_PER_WEEK).net)[0] ?? null, manCtx, MINUTES_PER_WEEK) }))
        .sort((a, b) => a.v.net - b.v.net || b.p.id - a.p.id);
      let sacked = 0;
      // 1.2.54: "every crew is full" only when no crew has a place; otherwise the crews with room want a skill he lacks.
      const roomLeft = crewsOf().some((t) => t.memberIds.length < MAX_TEAM_SIZE - 1 && rolesNow().get(t.id) !== 'expendables');
      const fullNote = full ? (roomLeft ? '; no crew with room takes him (the Business crew wants 3★ business)' : '; every crew is full') : '';
      for (const { p, v } of valued) {
        if (v.net >= 0) break;
        const spare = spareWorth(p);
        if (v.net + spare >= 0) { actions.push(`NOTE kept ${p.name} as a spare — net $${v.net} + spare worth $${spare}/wk (hire $${scale.hire} × ${lossRate.toFixed(2)} men lost a week ÷ ${keptSpares.size + extras.indexOf(p) + 1})`); continue; }
        const result = sackPerson(w, gang.id, p.id);
        logResult(actions, `let ${p.name} go — worth less than his pay (${manLine(p, v)}${spare ? ` + spare worth $${spare}/wk` : ''}${fullNote})`, result.ok, result.ok ? result.message ?? '' : result.error);
        if (result.ok) { sacked++; menMoves.push(`sacked ${p.name} (net $${v.net})`); }
      }
      if (still.length) menMoves.push(`pool: ${keptSpares.size} kept as spares/defenders, ${sacked} let go, ${still.length - keptSpares.size - sacked} kept (worth their pay)`);
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
  // 1.2.52 (Robert): shops went unvisited last week and every crew is full —
  // the weakest-earning crew (by man fitness; never Business, Recruit, a
  // Protection crew or the last Intimidation crew; 1.2.53: nor the attack crew
  // at war or the last one) switches to Protection,
  // at most once every PROTECTION_SWITCH_WEEKS (proposed).
  {
    const pw = w.week >= 2 ? protectionWeek(w, gang.id, w.week - 1) : undefined;
    const now = rolesNow();
    const sinceSwitch = mem.protectionSwitchWeek != null ? w.week - mem.protectionSwitchWeek : Infinity;
    // 1.2.55 (Robert): crew roles by value — shops went unvisited and the
    // Business crew used under BIZ_UNDERUSED_SHARE of its man-minutes last week:
    // it switches to Protection (any crew may buy now), whether or not every crew is full.
    const biz = crewsOf().find((t) => now.get(t.id) === 'business');
    let bizSwitched = false;
    if (pw && pw.notVisited > 0 && biz && sinceSwitch >= PROTECTION_SWITCH_WEEKS) {
      const used = w.lastWeekOrders.filter((o) => o.teamId === biz.id).reduce((n, o) => n + o.estimatedMinutes * Math.max(1, o.opts.manpower ?? 1), 0);
      const capacity = (biz.memberIds.length + 1) * MINUTES_PER_WEEK;
      if (used < BIZ_UNDERUSED_SHARE * capacity) {
        keptRoles.set(biz.id, 'collect'); mem.protectionSwitchWeek = w.week; bizSwitched = true;
        actions.push(`CREW SWITCH ${w.people[biz.lieutenantId]?.name ?? biz.name}'s crew from Business to Protection — $${Math.round(pw.notVisited)} of protection went unvisited last week and it used ${Math.round(used / Math.max(1, capacity) * 100)}% of its man-minutes (under ${Math.round(BIZ_UNDERUSED_SHARE * 100)}%, proposed); any crew buys now`);
        menMoves.push(`crew ${biz.name} Business → Protection`);
      }
    }
    if (!bizSwitched && pw && pw.notVisited > 0 && gang.teamIds.length >= MAX_TEAMS && !crewsOf().some((t) => canFill(t)) && sinceSwitch >= PROTECTION_SWITCH_WEEKS) {
      const intimidation = crewsOf().filter((t) => now.get(t.id) === 'intimidation').length;
      // 1.2.53 (Robert): the attack crew never switches while we are at war,
      // nor the last attack crew (man fitness prices it at its raids only, so
      // it read $0 and the HQ strike was left with no crew).
      const muscle = crewsOf().filter((t) => now.get(t.id) === 'muscle').length;
      const atWar = Object.values(w.gangs).some((g) => g.id !== gang.id && !g.eliminated && gang.known[g.id] === 'war');
      const earns = (t: Team) => { const job = now.get(t.id)!; return t.memberIds.reduce((sum, id) => { const p = w.people[id]; return sum + (p ? jobEarnings(p, job, manCtx, MINUTES_PER_WEEK) : 0); }, 0); };
      const weakest = crewsOf().filter((t) => { const r = now.get(t.id); return r && r !== 'business' && r !== 'recruit' && r !== 'collect' && !(r === 'intimidation' && intimidation <= 1) && !(r === 'muscle' && (atWar || muscle <= 1)); })
        .sort((a, b) => earns(a) - earns(b) || a.id - b.id)[0];
      if (weakest) {
        const was = now.get(weakest.id)!;
        keptRoles.set(weakest.id, 'collect'); mem.protectionSwitchWeek = w.week;
        actions.push(`CREW SWITCH ${w.people[weakest.lieutenantId]?.name ?? weakest.name}'s crew from ${jobName(was)} to Protection — $${Math.round(pw.notVisited)} of protection went unvisited last week, every crew is full, and it earns least ($${Math.round(earns(weakest))} a week by man fitness)`);
        menMoves.push(`crew ${weakest.name} ${jobName(was)} → Protection`);
      }
    }
  }
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
    if (!Object.values(bizCrew.vehicles).some((n) => n > 0) && spendOk(VEHICLES.coupe.cost)) {
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
  // 1.2.55 (Robert): at the heat model's street-arrest risk REST_RISK (proposed), not a fixed street-heat line.
  const hotCrews = crewsOf().filter((team) => crewReady(w, team.id) && riskOfMan(team.lieutenantId) >= REST_RISK);
  if (hotCrews.length) actions.push(`NOTE crew${hotCrews.length === 1 ? '' : 's'} resting (lieutenant's street-arrest risk ${REST_RISK}+): ${hotCrews.map((team) => `${w.people[team.lieutenantId]?.name ?? team.id} ${riskOfMan(team.lieutenantId).toFixed(2)}`).join(', ')}`);
  const ready = crewsOf().filter((team) => crewReady(w, team.id) && !hotCrews.includes(team));
  if (!ready.length) {
    actions.push('FAIL orders — no crew');
    return actions;
  }

  // 1.2.55 (Robert): no lie-low rule. The FBI total, the chief and each man's
  // heat are priced into every order (autoHeat.ts, the HEAT line); one hard
  // guard stays: no order may take the projected FBI total past 200.
  const suspicionBefore = suspicionLastWeek.get(w);
  suspicionLastWeek.set(w, gang.suspicion);
  const crackdownNamed = newspaperEdition(w, gang.id).items.some((n) => n.gangId === gang.id && /CRACKDOWN/.test(n.headline));
  if (crackdownNamed) actions.push('CRACKDOWN our paper says the Mayor named us last week — priced in the chief\'s heat');
  const chiefBandNow = w.people[w.policeChiefId] ? opinionBand(w.people[w.policeChiefId].opinion[gang.id] ?? 0) : 'neutral';
  actions.push(`CRIMES ours last week ${gang.history[gang.history.length - 1]?.crimes ?? 0} — priced by heat (no lie-low rule): FBI suspicion ${Math.round(gang.suspicion)}, the chief ${chiefBandNow}`);
  // 1.2.40 (Robert): each man's heavy-crime points as the FBI files them
  // (kidnap, smash-up 60, bomb, torch 80, kill, ambush 100; a tenth for a
  // gangster victim, half for police), fading a tenth a week; 1.2.55: priced
  // by the warrant risk (autoHeat), no fixed allowance.
  for (const [id, v] of [...mem.heat]) { const left = v - Math.trunc(v / 10); if (left > 0 && w.people[id]?.gangId === gang.id) mem.heat.set(id, left); else mem.heat.delete(id); }
  if (gang.suspicion * 255 / 100 > 200) actions.push(`NOTE suspicion ${Math.round(gang.suspicion)} is past the FBI's case line (78 on the graph)`);
  // 1.2.24: why suspicion moved. Risky money (rackets and protection) beyond the
  // cover the legal books give raises it; it cools 1.6 a week only in a week
  // with nothing uncovered (the FBI cannot be bribed).
  const lastLegal = Math.max(0, gang.lastWeekIncome.legal);
  const accountantMan = gang.accountantId == null ? undefined : w.people[gang.accountantId];
  const accountantInt = accountantMan && accountantMan.status === 'active' ? accountantMan.skills.intelligence : null;
  const coverEstimate = accountantInt != null ? lastLegal * (0.5 + accountantInt * 0.22) + accountantInt * 400 : lastLegal * 0.2;
  const riskyLast = Math.max(0, gang.lastWeekIncome.illegal) + Math.max(0, gang.lastWeekIncome.protection);
  if (!standardRules(w)) actions.push(`SUSPICION ${Math.round(gang.suspicion)}${suspicionBefore != null ? ` (was ${Math.round(suspicionBefore)})` : ''}: risky $${Math.round(riskyLast)} (rackets $${Math.round(Math.max(0, gang.lastWeekIncome.illegal))}, protection $${Math.round(Math.max(0, gang.lastWeekIncome.protection))}), cover $${Math.round(coverEstimate)} (legal $${Math.round(lastLegal)}, ${accountantInt != null ? 'accountant' : 'no accountant'}), uncovered $${Math.round(gang.riskyMoney ?? 0)}, untaxed $${Math.round(gang.uncoveredTax ?? 0)}`);
  // The 40 × 32 city weighs suspicion differently: the FBI's total loses a tenth
  // a week and rises by 2 × (office takings / premises takings − the accountant's
  // limit). Collecting is not cut there — more legal premises and a clever
  // accountant bring the ratio down.
  const originalCity = standardRules(w);
  const office = Math.max(0, gang.lastWeekIncome.protection + gang.lastWeekIncome.other);
  const premisesTakings = Math.max(0, gang.lastWeekIncome.legal + gang.lastWeekIncome.illegal);
  const opponentsWeight = w.options.opponents === 'passive' ? 16 : w.options.opponents === 'aggressive' ? 8 : 10;
  const premisesBase = Math.max(100, Math.trunc(premisesTakings * opponentsWeight / 10));
  const accountantByte = accountantInt != null ? Math.trunc(Math.round(Math.max(0, Math.min(5, accountantInt)) / 5 * 255) * 2 / 3) : 0;
  const ratioLimit = 0.12 * (accountantByte || 1) + 9.88;
  const officeRatio = office / premisesBase;
  // 1.2.46 (Robert): the FBI's total next week as the game counts it (a
  // tenth off, then 2 × (office ÷ base − limit)), from last week's books.
  const fbiNow = gang.fbiTotal ?? 0;
  const fbiForecast = fbiNow - Math.trunc(fbiNow / 10) + Math.max(0, Math.trunc((Math.trunc(officeRatio) - ratioLimit) * 2));
  const fbiCap = originalCity && fbiForecast > FBI_CASE_THRESHOLD;
  // 1.2.46 (Robert): while a case is open (raid due), nobody waits in or at
  // the HQ: home is another office of ours, else our premises nearest the HQ
  // outside the raid's reach.
  {
    const hq = gangOffice(w, gang.id);
    let avoidance = hqAvoidance.get(w);
    if (gang.fbiRaidWeek != null && hq) {
      const hqDoor = buildingDoor(w, hq);
      const ours = Object.values(w.buildings).filter((b) => b.ownerGangId === gang.id && b.id !== hq.id && b.state !== 'destroyed' && b.cls !== 'empty' && dist(buildingDoor(w, b), hqDoor) > RAID_REACH)
        .sort((a, b) => Number(isGangOffice(b, gang.id)) - Number(isGangOffice(a, gang.id)) || dist(buildingDoor(w, a), hqDoor) - dist(buildingDoor(w, b), hqDoor));
      const refuge = ours.length ? ours[0] : undefined;
      if (!avoidance) { avoidance = new Map(); hqAvoidance.set(w, avoidance); }
      avoidance.set(gang.id, { hqId: hq.id, refugeId: refuge ? refuge.id : null });
      actions.push(`FBI CASE raid due week ${gang.fbiRaidWeek}: nobody waits in or at the HQ — ${refuge ? `home is ${refuge.typeId} #${refuge.id}${isGangOffice(refuge, gang.id) ? ' (office)' : ''}` : `no other premises of ours — the men wait in the street ${RAID_REACH + RAID_WAIT_MARGIN} m from the HQ door`}`);
    } else avoidance?.delete(gang.id);
    // 1.2.49 (Robert): our idle men (crews and lieutenants too) wait inside an office, not in the street.
    let inside = idleInside.get(w);
    if (!inside) { inside = new Set(); idleInside.set(w, inside); }
    inside.add(gang.id);
  }
  // 1.2.55 (Robert): the heat model's inputs from this week's figures (autoHeat.ts).
  const heatInputs = (arrestsPW = 0): HeatState => {
    const chiefP = w.people[w.policeChiefId], mayorP = w.people[w.mayorId];
    const lawyerP = gang.lawyerId == null ? undefined : w.people[gang.lawyerId];
    const prot = protectionWeek(w, gang.id, w.week - 1);
    const rate = prot.claimed > 0 ? collectionRate : 1;
    const perShop = prot.shops > 0 ? prot.claimed / prot.shops : 0;
    const rivalScores = new Map<number, number>();
    for (const c of w.crimes) if (c.week === w.week - 1 && !c.charge && c.gangId !== gang.id) rivalScores.set(c.gangId, (rivalScores.get(c.gangId) ?? 0) + c.arrestRisk * 10);
    return {
      A: scale.A, standard: originalCity, fbiTotal: gang.fbiTotal ?? 0, office, premisesTakings, opponentsWeight, ratioLimit,
      mayor: mayorP?.opinion[gang.id] ?? 0, chief: chiefP?.opinion[gang.id] ?? 0, officer: officerOpinion,
      crimeScore: 0, rivalScore: Math.max(0, ...rivalScores.values()), evidence: gang.evidence ?? 0, arrestsPW,
      defence: 16 * (lawyerP && lawyerP.status === 'active' ? lawyerP.skills.intelligence : 0.5) + 15,
      protectionPerSite: perShop * rate,
    };
  };
  /** True when the office/premises ratio nears the limit, or the FBI cap is on: legal premises and the accountant come first. */
  const legalPush = officeRatio >= ratioLimit * 0.8 || fbiCap;
  // 1.2.25 (B6): the forecast from our own books drives the legal push;
  // 1.2.26: on every city size.
  if (legalPush) actions.push(`B6 suspicion forecast: office/premises ${officeRatio.toFixed(1)} against a limit of ${ratioLimit.toFixed(1)} — legal premises and the accountant come first this week`);
  if (originalCity) actions.push(`SUSPICION ${Math.round(gang.suspicion)}${suspicionBefore != null ? ` (was ${Math.round(suspicionBefore)})` : ''} ratio: office takings $${Math.round(office)} / premises base $${premisesBase} = ${officeRatio.toFixed(1)} vs limit ${ratioLimit.toFixed(1)} (${accountantInt != null ? `accountant ${accountantInt.toFixed(1)}★` : 'no accountant'}) — rise about ${Math.max(0, Math.trunc((Math.trunc(officeRatio) - ratioLimit) * 2))} a week${legalPush ? '; legal premises and the accountant first' : ''}`);
  // Elsewhere, while suspicion is 50 or more, protection is collected only up to the cover left after the rackets.
  // 1.2.41 (Robert): collecting protection never stops — no cap by the legal books.
  // 1.2.46 (Robert), the exception: while the forecast FBI total would pass
  // 200, collect only up to premises base × (limit + 10).
  const collectBudget: number = fbiCap ? premisesBase * (ratioLimit + 10) : Infinity;
  if (fbiCap) actions.push(`FBI CAP forecast total ${fbiForecast} (now ${fbiNow}) would pass ${FBI_CASE_THRESHOLD}: collecting up to $${Math.round(collectBudget)} (premises base $${Math.round(premisesBase)} × (limit ${ratioLimit.toFixed(1)} + 10)); legal premises first`);
  /** 1.2.55 (Robert): the heat model's state (built once the police figures are known), this week's heat spend, and the worth of the order being given. */
  let heatState: HeatState | undefined;
  const heatSpend: Record<HeatMeasure, number> = { fbi: 0, warrant: 0, wanted: 0, opinion: 0, crackdown: 0, evidence: 0 };
  let heatGiven = 0;
  let giveWorth: number | undefined;
  const outOfTime = new Set<number>();
  /** 1.2.41 (Robert): the crew picked to patrol — patrol is its only order this week. */
  let patrolTeamId: number | undefined;
  // 1.2.41 (Robert): route fit. Each crew's week is planned as all its orders
  // one after another (the game's estimates summed), and a crew that ran out
  // of week last week takes no more stops than it finished then.
  const ROUTE_TYPES = new Set(['collectProtection', 'extort', 'recruit', 'intimidate', 'smashUp']);
  // 1.2.51 (Robert): a crew's week is its men's minutes (man-minutes), not its
  // orders one after another — several routes run side by side, one man each.
  // A route that ran out of week caps each route of that crew at the most
  // stops one route finished.
  const routeCap = new Map<number, number>();
  for (const t of crewsOf()) {
    const ranOut = w.lastWeekOrders.filter((o) => o.gangId === gang.id && o.teamId === t.id && ROUTE_TYPES.has(o.type) && /Ran out of week/.test(o.failReason ?? ''));
    if (ranOut.length) routeCap.set(t.id, Math.max(1, ...ranOut.map((o) => o.completedTargets ?? 0)));
  }
  // 1.2.52 (Robert): routes are sized from the minutes a stop actually took
  // last week (start to finish ÷ stops done), not the game's estimate.
  {
    const seen: string[] = [];
    for (const o of w.lastWeekOrders) {
      if (o.gangId !== gang.id || !ROUTE_TYPES.has(o.type) || !o.completedTargets || o.startedMinute == null || o.finishedMinute == null) continue;
      const team = w.teams[o.teamId];
      const perStop = (o.finishedMinute - o.startedMinute) / o.completedTargets;
      const key = ledgerKey(o.type, !!team && Object.values(team.vehicles).some((n) => n > 0));
      noteLedger(timeLedger, key, perStop);
      seen.push(`${o.type} #${o.id} ${hm(perStop)} a stop`);
    }
    if (seen.length) actions.push(`ROUTE TIMES actual last week: ${seen.slice(0, 8).join(', ')}${seen.length > 8 ? ` (+${seen.length - 8})` : ''}`);
  }
  if (routeCap.size) actions.push(`ROUTES ran out of week last week — each route capped at the most stops one route finished: ${[...routeCap].map(([id, n]) => `${w.teams[id]?.name ?? id} ${n}`).join(', ')}`);
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
  /** 1.2.48: a gang at war or aggression with us (known, or predicted by stop-the-leader) — every crew armed. */
  let hostileNow = false;
  /**
   * 1.2.46 (Robert): the defence zone is the DANGER set — blocks rival-held or
   * rival-sighted and the blocks beside them (claim ids), filled once DANGER is
   * worked out below. (1.2.43 used every block any rival claims, shared ones too.)
   */
  const defenceZone = new Set<number>();
  const nearRival = (blockId: number) => defenceZone.has(w.blocks[blockId]?.layout?.mergedInto ?? blockId);
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
  /** 1.2.46 (Robert): MANAGER buy waits and defence notes, one line per reason with a count (written after the decision). */
  const waitNotes = new Map<string, string[]>();
  const noteWait = (reason: string, label: string, detail = '') => {
    const list = waitNotes.get(reason) ?? [];
    list.push(detail ? `${label} (${detail})` : label);
    waitNotes.set(reason, list);
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
        noteWait(`NOTE not given to ${name}'s crew — on defence: the armed men stay near our office and businesses`, label);
        return { ok: false, error: 'On defence — armed men stay home.' };
      }
      if (input.buildingIds?.length) {
        // 1.2.46 (Robert): Business-crew buys and set-ups in blocks we hold go ahead (one unarmed man, no fighting).
        const bizWork = team === bizCrew && kind === 'business';
        const keep = input.buildingIds.filter((id) => { const b = w.buildings[id]; if (!b || ownSite(id)) return true; if (bizWork && territoryBlocksNowSafe().has(w.blocks[b.blockId]?.layout?.mergedInto ?? b.blockId)) return true; if (armedCrew && !territoryBlocksNowSafe().has(w.blocks[b.blockId]?.layout?.mergedInto ?? b.blockId)) return false; return !nearRival(b.blockId); });
        if (!keep.length) {
          noteWait(`NOTE not given to ${name}'s crew — on defence: ${armedCrew ? 'the armed men stay near our office and businesses' : 'the target is in or beside a rival block'}`, label);
          return { ok: false, error: 'On defence — the target is in or beside a rival block.' };
        }
        if (keep.length < input.buildingIds.length) {
          noteWait('NOTE stops dropped — on defence, in or beside a rival block', label, `${input.buildingIds.length - keep.length} stop(s)`);
          input = { ...input, buildingIds: keep };
        }
      }
      if (input.blockIds?.length && input.type !== 'patrol') {
        const keep = input.blockIds.filter((id) => !nearRival(id) && (!armedCrew || territoryBlocksNowSafe().has(w.blocks[id]?.layout?.mergedInto ?? id)));
        if (!keep.length) { noteWait('NOTE not given — on defence: rival blocks and the blocks beside them are off limits', label); return { ok: false, error: 'On defence — rival blocks are off limits.' }; }
        input = { ...input, blockIds: keep };
      }
    }
    // 1.2.42 (Robert): a buy or set-up that puts a manager in never leaves
    // the crew below MIN_CREW_AFTER_MANAGER men — a pool hood joins the crew
    // first if one is free; otherwise it is not given this week.
    // 1.2.54 (Robert): no lending below the line and no fixed wait — the
    // order-completion chance remembers it; the pool hood who joins is the one
    // the game would make manager (business + organization), and for the
    // Business crew only one whose manager factor beats an unmanned site.
    if (input.buildingIds?.length && takesManager(input.type, input.buildingIds[0])) {
      // Managers already owed by this crew's orders this week count as gone.
      const owed = () => team.orderIds.map((id) => w.orders[id]).filter((o) => o && o.targetBuildingIds.length && takesManager(o.type, o.targetBuildingIds[0])).length;
      const after = () => team.memberIds.length - owed() - 1;
      if (after() < MIN_CREW_AFTER_MANAGER && team.memberIds.length < MAX_TEAM_SIZE - 1) {
        const spare = gang.poolIds.map((id) => w.people[id]).filter((x): x is Person => !!x && x.status === 'active' && x.role === 'hood' && !restingMen.has(x.id) && (roles.get(team.id) !== 'business' || managerFactor(x) >= UNMANNED_FACTOR))
          .sort((a, b) => managerFactor(b) - managerFactor(a) || a.id - b.id)[0];
        if (spare && moveToTeam(w, gang.id, spare.id, team.id).ok) actions.push(`MANAGER pool hood ${spare.name} joins ${name}'s crew before ${label} — the crew stays at ${MIN_CREW_AFTER_MANAGER}+ men after the manager goes in`);
      }
      if (after() < MIN_CREW_AFTER_MANAGER) {
        noteWait(`MANAGER not given — ${name}'s crew would drop below ${MIN_CREW_AFTER_MANAGER} men and no pool hood could join`, label, owed() ? `${owed()} already owed to this week's buys` : '');
        return { ok: false, error: `nobody free — the crew would drop below ${MIN_CREW_AFTER_MANAGER} men; try elsewhere` };
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
    // 1.2.25 (B10, hit points): a crew with a hurt man (hit points below full) takes no risky work this week.
    if (risky) {
      const hurt = [team.lieutenantId, ...team.memberIds].map((id) => w.people[id]).filter((p): p is Person => !!p && p.status === 'active' && p.hp < 100);
      if (hurt.length) {
        actions.push(`B10 ${label} not given to ${name}'s crew — hurt: ${hurt.map((p) => `${p.name} ${Math.round(p.hp)} hp`).join(', ')}`);
        return { ok: false, error: 'A man is hurt — try elsewhere.' };
      }
    }
    // 1.2.55 (Robert): no wanted hold, no lie-low rule and no risky-work share —
    // the crew's heat is priced below, once the order is sized.
    // Fit the order to the crew's free time by the ledger; hand out nothing that cannot fit.
    const hasCar = Object.values(team.vehicles).some((n) => n > 0);
    const key = ledgerKey(input.type, hasCar);
    const targets = input.buildingIds?.length ?? 1;
    // Business work is sized by the game alone (1.2.23): no ledger gate of ours.
    const men = Math.max(1, input.opts?.manpower ?? 1);
    const fits = kind === 'business' || staffUrgent.has(label) ? targets : targetsThatFit(timeLedger, key, targets, freeFor(team, men));
    if (fits === 0) {
      actions.push(`NOTE ${label} not given to ${name} — about ${hm(timeLedger[key])} a target, ${hm(freeFor(team, men))} left for ${men} man/men`);
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
      // 1.2.48 (Robert): patrol and guard are armed jobs; while any gang is at
      // war or aggression with us (known, or predicted by stop-the-leader) every
      // crew carries the fitting gun (the 1.2.38 unarmed rule holds only in peace).
      const armedJob = input.type === 'patrol' || input.type === 'guardBusiness';
      const arms = input.type !== 'assault' && ((violent && (role === 'muscle' || role === 'expendables' || input.type === 'kill' || input.type === 'ambush')) || armedJob || hostileNow);
      const job: GunJob = input.type === 'ambush' || input.type === 'patrol' || !target ? 'street' : 'inside';
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
        if (ids.length > cap) { actions.push(`NOTE ${label}: ${ids.length - cap} stop(s) dropped — a route of ${name}'s crew finished at most ${cap} last week`); ids = [...ids].sort((a, b) => far(a) - far(b)).slice(0, cap); }
      }
      const dropped: number[] = [];
      for (;;) {
        const preview = previewOrder(w, gang.id, { ...input, buildingIds: ids, teamId: team.id });
        if (!preview || ids.length <= 1 || crewHasTime(w, team, preview)) break;
        const risky = (id: number) => { const b = w.buildings[id]; return b && riskyBlocks.has(claimOf(b.blockId)) ? 1 : 0; };
        const worst = [...ids].sort((x, y) => risky(y) - risky(x) || far(y) - far(x))[0];
        ids = ids.filter((id) => id !== worst); dropped.push(worst);
      }
      if (dropped.length) actions.push(`NOTE ${label}: ${dropped.length} stop(s) dropped so it fits its men's free minutes (beside rival blocks first, then the farthest)`);
      input = { ...input, buildingIds: ids };
    }
    // 1.2.40 (Robert): heavy-crime points, as the FBI files them on every man of the crew.
    // 1.2.55 (Robert): priced by the warrant risk below — no allowance, no trimming.
    const heavyRow = CRIME_ROW_SUSPICION[input.type] ?? 0;
    let heavyPoints = 0, heavyEach = 0;
    if (heavyRow > HEAVY_CRIME_SUSPICION) {
      const victim = input.personId != null ? w.people[input.personId] : undefined;
      const shop = input.type === 'smashUp' && input.buildingIds?.length && w.buildings[input.buildingIds[0]]?.ownerPersonId != null;
      const each = shop ? 0 : victim && (victim.role === 'police' || victim.role === 'policeChief') ? heavyRow >> 1
        : victim && (victim.role === 'hood' || victim.role === 'lieutenant') || input.type === 'ambush' ? Math.trunc(heavyRow / 10) : heavyRow;
      const crewIds = [team.lieutenantId, ...team.memberIds];
      heavyEach = each;
      heavyPoints = each * Math.max(1, input.buildingIds?.length ?? 1);
      // 1.2.51 (Robert): a man lying low after an arrest or a warrant takes no heavy crime.
      const low = crewIds.filter((id) => (wanted.lowUntil.get(id) ?? 0) > w.week);
      if (heavyPoints > 0 && low.length) {
        actions.push(`NOTE ${label} not given to ${name}'s crew — ${low.map((id) => w.people[id]?.name ?? id).join(', ')} lying low (off heavy crimes until week ${Math.max(...low.map((id) => wanted.lowUntil.get(id) ?? 0))})`);
        return { ok: false, error: 'A man of the crew is lying low — try elsewhere.' };
      }
    }
    // 1.2.55 (Robert): heat fitness — the order's heat on this crew (wanted,
    // FBI score) and on the gang (FBI total, mayor and chief, crackdown,
    // evidence). Given only while its worth (score × chance) is above its heat;
    // otherwise another crew may take it. The one hard guard: no order takes
    // the projected FBI total past 200.
    let heatNow: HeatCost | undefined;
    if (heatState) {
      const job = roles.get(team.id) ?? null;
      const crewHeat: HeatMan[] = [team.lieutenantId, ...team.memberIds].map((id) => w.people[id]).filter((x): x is Person => !!x && x.status === 'active')
        .map((x) => ({ id: x.id, name: x.name, wanted: x.wanted, fbiScore: Math.max(x.crimeSuspicion ?? 0, mem.heat.get(x.id) ?? 0), cost: scale.A + Math.max(0, manValue(x, job, manCtx, MINUTES_PER_WEEK).net) }));
      heatNow = heatCost({ type: input.type, sites: input.buildingIds?.length ?? 1, heavyEach: heavyEach || undefined }, heatState, crewHeat);
      if (heatNow.guard) {
        actions.push(`NOTE ${label} not given — FBI guard: the projected FBI total would pass ${FBI_CASE_THRESHOLD}`);
        return { ok: false, error: 'FBI guard — the projected FBI total would pass 200.' };
      }
      if (giveWorth != null && heatNow.total > 0 && giveWorth - heatNow.total <= 0) {
        actions.push(`NOTE ${label} not given to ${name}'s crew — heat $${heatNow.total} (${Object.entries(heatNow.perMeasure).filter(([, v]) => v >= 0.5).map(([k, v]) => `${k} $${Math.round(v)}`).join(', ')}) above its worth $${Math.round(giveWorth)}`);
        return { ok: false, error: `held back — heat $${heatNow.total} on this crew is above its worth $${Math.round(giveWorth)}; try elsewhere` };
      }
    }
    if (kind !== 'business' && input.type !== 'patrol') {
      const preview = previewOrder(w, gang.id, { ...input, teamId: team.id });
      if (preview && !crewHasTime(w, team, preview)) {
        actions.push(`NOTE ${label} not given to ${name}'s crew — ${hm(preview.estimatedMinutes)} × ${preview.opts.manpower ?? 1} men does not fit its men's free minutes (${hm(crewFreeMinutes(w, team))} man-time free)`);
        return { ok: false, error: 'Not enough man-minutes left this week — try elsewhere' };
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
    if (result.ok && heatNow && heatState) {
      for (const [k, v] of Object.entries(heatNow.perMeasure) as [HeatMeasure, number][]) heatSpend[k] += v;
      heatGiven += 1;
      heatState.crimeScore += crimeRisk(input.type) * 10 * Math.max(1, input.buildingIds?.length ?? 1);
    }
    if (result.ok && heavyPoints > 0) for (const id of [team.lieutenantId, ...team.memberIds]) mem.heat.set(id, (mem.heat.get(id) ?? 0) + heavyPoints);
    if (result.ok && kitJob && !kitted.has(team.id)) {
      kitted.add(team.id);
      // 1.2.49 (Robert): a guard is kitted for the men posted, not the whole crew.
      const kitMen = input.type === 'guardBusiness' && input.opts?.manpower != null ? input.opts.manpower : team.memberIds.length + 1;
      const took = rekit(team, kitJob, kitMen);
      // A crew other than the attack crew short of guns for the job buys the
      // cheapest gun (the revolver) for the store, while the cash is above the reserve.
      const cheapest = [...GUNS].sort((a, b) => WEAPONS[a].cost - WEAPONS[b].cost)[0];
      while (team !== attackCrew && gunsOf(team) < kitMen && spendOk(WEAPONS[cheapest].cost) && buyWeapon(w, gang.id, cheapest).ok && fromStore(team, cheapest).ok) took.push(`${cheapest} (bought)`);
      actions.push(`NOTE ${name} carries ${took.length ? took.join(', ') : 'no gun (none in the store)'} for ${label} (${kitJob} order: ${GUN_ORDER[kitJob].join(' > ')})`);
    }
    if (result.ok && input.type === 'bomb' && (team.weapons.explosives ?? 0) <= 0 && fromStore(team, 'explosives').ok) actions.push(`NOTE explosives from the store to ${name} for the bombing`);
    if (result.ok) {
      const order = team.orderIds.length ? w.orders[team.orderIds[team.orderIds.length - 1]] : undefined;
      const minutes = order?.estimatedMinutes || (team.timeUsed - usedBefore) / Math.max(1, order?.opts.manpower ?? 1);
      // 1.2.52: route types learn from the actual minutes a stop took (above), not from this estimate.
      if (!ROUTE_TYPES.has(input.type)) noteLedger(timeLedger, key, minutes / Math.max(1, order?.targetBuildingIds.length || 1));
      // 1.2.51 (Robert): order fitness — the order as given.
      if (order) noteGiven(orderBook, w, order, label);
      // 1.2.54 (Robert): order completion — followed to its end next week.
      if (order) noteGivenTry(exec, w, { type: input.type, teamId: team.id, siteId: input.buildingIds?.[0] ?? null, label, approved: approvedBy.get(label) ?? 0 }, order.id);
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
    .filter((p): p is Person => !!p && freeForOrders(w, p) && p.orderId == null && !restingMen.has(p.id)
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
  const specialistVisit = (type: Parameters<typeof queueSpecialistJob>[2], targetId: number | null, beats?: number[], maxHires?: number): ApiResult => {
    const target = targetId != null ? w.people[targetId] : undefined;
    if (target && dangerBlocks.has(blockOfPerson(target))) return { ok: false, error: `${target.name} is in a rival-held or rival-sighted block — the visit waits` };
    const result = queueSpecialistJob(w, gang.id, type, targetId, beats, maxHires);
    if (result.ok && type === 'bribeOfficials' && target) bribesDue += bribePrice(w, target, gang.id);
    return result;
  };
  // ---- 1.2.23: the weekly decision loop. Every order below is put forward as
  // a candidate (what it is worth, of what kind, for which crew job); at the
  // end decideWeek scores them by the goal and gives each crew the best that fit.
  const proposals: Proposal<Team>[] = [];
  /** 1.2.50 (Robert): collect/extort candidates with their old value and protection fitness (shadow mode). */
  const shadow: { label: string; old: number; fit: number }[] = [];
  const propose = (p: Proposal<Team>) => {
    // 1.2.53: an order the cash pass put forward reports back when a crew is given it.
    const track = spendTrack;
    if (track) { track.proposed = true; const before = p.onGiven; p = { ...p, onGiven: (team, result) => { track.given = true; before?.(team, result); } }; }
    proposals.push(p);
  };
  /** Buildings put forward for a buy or a set-up this week (one order each). */
  const offered = new Set<number>();
  // 1.2.47: cashReserve (the one reserve) is set with the wages above.
  /** 1.2.45 (Robert): declared before the collect routes read it (it crashed when used before this line). */
  const bizCollects = !!bizCrew && gang.cash <= cashReserve;
  // 1.2.37 (Robert): losses. The gang is weak when its men fall below
  // a share of the biggest rival as far as we know it (1.2.43: see below; the rival men
  // our men have seen and who are still alive), or its cash falls below the
  // reserve (three weeks of asks and upkeep). Weak, the armed crews keep out of rival
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
  // 1.2.48 (Robert): the 1.2× strength rule is dropped — each rival's threat
  // score decides (THREAT line per rival, every week).
  const ourMen = crewMen();
  const liveOthers = Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated);
  // Point 1: stop the leader. The original city's computer gangs add war
  // hostility toward the leader every week (aiStance leadingRival), and their
  // new stance reaches us a week late — so we read the rule ourselves: a gang
  // that would call us the leader now, or (Territory) once our blocks pass
  // trunc(target × 60%) while we hold the most, given one more week of the
  // last week's growth (the proposed margin), is treated as at war with us.
  const ourBlocks = territoryCount(w, gang.id);
  const growth = mem.lastBlocks != null && ourBlocks > mem.lastBlocks ? ourBlocks - mem.lastBlocks : 0;
  mem.lastBlocks = ourBlocks;
  const leaderLine = w.options.mode === 'territory' ? Math.trunc(w.options.territoryTarget * 60 / 100) : undefined;
  const predictedLeader = standardRules(w) && leaderLine != null && ourBlocks + growth > leaderLine
    && liveOthers.every((g) => territoryCount(w, g.id) < ourBlocks + growth);
  const leaderTo = new Set(liveOthers.filter((g) => standardRules(w) && (predictedLeader || leadingRival(w, g) === gang.id)).map((g) => g.id));
  if (leaderTo.size) actions.push(`LEADER ${liveOthers.filter((g) => leaderTo.has(g.id)).map((g) => `${g.name} ${leadingRival(w, g) === gang.id ? 'treats us as the leader' : 'will treat us as the leader'}`).join(', ')} (our blocks ${ourBlocks}, +${growth} last week; the line ${leaderLine ?? 'none'} blocks; worth line $${(200000).toLocaleString()}) — treated as at war: crews armed, the office guarded`);
  const hostileGangs = new Set(liveOthers.filter((g) => ['war', 'aggression'].includes(gang.known[g.id] ?? 'peace') || leaderTo.has(g.id)).map((g) => g.id));
  hostileNow = hostileGangs.size > 0;
  // Point 4: threat per rival over THREAT_WEEKS weeks.
  const threatSince = w.week - THREAT_WEEKS;
  mem.threatSeen = (mem.threatSeen ?? []).filter((x) => x.week > threatSince);
  const lossesSince = memberLosses(w, undefined, threatSince);
  const killsOfUs = (g: Gang, since = threatSince) => lossesSince.filter((l) => l.week >= since && l.gangId === gang.id && l.by === g.name);
  const killsByUs = (g: Gang) => lossesSince.filter((l) => l.gangId === g.id && l.by === gang.name).length;
  const siteAttacks = (g: Gang, since = threatSince) => w.crimes.filter((c) => c.week >= since && c.gangId === g.id && SITE_ATTACK_KINDS.has(c.kind) && c.buildingId != null && w.buildings[c.buildingId]?.ownerGangId === gang.id);
  const cellAt = new Map<string, number>();
  for (const b of w.blocks) cellAt.set(`${b.gx},${b.gy}`, b.id);
  /** A block and the blocks beside it (one block in every direction), as claimed blocks. */
  const withNeighbours = (blockId: number) => {
    const b = w.blocks[blockId];
    const out: number[] = [];
    if (!b) return out;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const n = cellAt.get(`${b.gx + dx},${b.gy + dy}`); if (n != null) out.push(claimOf(n)); }
    return out;
  };
  const nearOurSites = new Set<number>();
  for (const b of buildingList(w)) if (b.ownerGangId === gang.id && b.cls !== 'empty' && b.state !== 'destroyed') for (const id of withNeighbours(b.blockId)) nearOurSites.add(id);
  const nearOffices = new Set<number>();
  for (const b of buildingList(w)) if (isGangOffice(b, gang.id)) for (const id of withNeighbours(b.blockId)) nearOffices.add(id);
  /** 1.2.49 (Robert): first spots of a gang's men (the tip line reports each man once) and, as sightings too, each of our men it killed at the street block where he fell (planning week). */
  const killBlock = (l: { pos?: { x: number; y: number } | null; buildingId?: number | null }) => l.pos ? blockAtPos(w, l.pos) : l.buildingId != null ? w.buildings[l.buildingId]?.blockId ?? null : null;
  const spotsOf = (g: Gang, fromWeek: number) => (mem.threatSeen ?? []).filter((x) => x.gangId === g.id && x.week >= fromWeek).map((x) => ({ key: `p${x.personId}`, block: x.block }));
  const killSightings = (g: Gang, fromWeek: number) => killsOfUs(g, fromWeek - 1).flatMap((l) => { const block = killBlock(l); return block == null ? [] : [{ key: `k${l.personId}`, block }]; });
  const seenNear = (g: Gang, near: Set<number>, fromWeek: number, spotsOnly = false) =>
    new Set([...spotsOf(g, fromWeek), ...(spotsOnly ? [] : killSightings(g, fromWeek))].filter((x) => near.has(claimOf(x.block))).map((x) => x.key)).size;
  const threatOf = new Map<number, number>();
  const threatWhy = new Map<number, string>();
  for (const g of liveOthers) {
    const k = killsOfUs(g).length, a = siteAttacks(g).length, sn = seenNear(g, nearOurSites, threatSince + 1);
    threatOf.set(g.id, THREAT_PER_KILL * k + THREAT_PER_SITE_ATTACK * a + THREAT_PER_SIGHTING * sn);
    const spotBlocks = [...new Set(spotsOf(g, threatSince + 1).map((x) => x.block))];
    const killBlocks = [...new Set(killsOfUs(g).map(killBlock).filter((b): b is number => b != null))];
    threatWhy.set(g.id, `${THREAT_PER_KILL}×${k} of our men killed + ${THREAT_PER_SITE_ATTACK}×${a} of our sites attacked + ${THREAT_PER_SIGHTING}×${sn} sightings within 1 block of our sites (first spots and our men killed); first spots in ${spotBlocks.length ? `block(s) ${spotBlocks.join(', ')}` : 'no block'}; our men killed in ${killBlocks.length ? `street block(s) ${killBlocks.join(', ')}` : 'no block'}`);
  }
  const highThreat = (g: Gang) => leaderTo.has(g.id) || (threatOf.get(g.id) ?? 0) >= HIGH_THREAT;
  const highGangs = liveOthers.filter(highThreat);
  // Point 5: the highest-threat gang is the attack and Expendables target (the leader rule first on a tie).
  const topThreat = [...liveOthers].filter((g) => highThreat(g) || (threatOf.get(g.id) ?? 0) > 0)
    .sort((x, y) => (threatOf.get(y.id) ?? 0) - (threatOf.get(x.id) ?? 0) || Number(leaderTo.has(y.id)) - Number(leaderTo.has(x.id)) || x.id - y.id)[0];
  // 1.2.43 (Robert): LOSS_DEFENCE_KILLS or more of our men killed by rivals in
  // the last LOSS_WINDOW_WEEKS weeks puts us on defence for LOSS_DEFENCE_WEEKS weeks.
  const rivalNames = new Set(Object.values(w.gangs).filter((g) => g.id !== gang.id).map((g) => g.name));
  const killedRecently = memberLosses(w, gang.id, w.week - LOSS_WINDOW_WEEKS).filter((l) => l.by != null && rivalNames.has(l.by)).length;
  // 1.2.46 (Robert): heavy losses need LOSS_DEFENCE_KILLS kills and at least LOSS_DEFENCE_SHARE of our men in the window.
  if (killedRecently >= LOSS_DEFENCE_KILLS && killedRecently >= ourMen * LOSS_DEFENCE_SHARE && (mem.defenceUntil ?? -Infinity) < w.week) {
    mem.defenceFrom = w.week; mem.defenceKills = killedRecently;
    mem.defenceUntil = w.week + LOSS_DEFENCE_WEEKS - 1;
    actions.push(`DEFENCE ${killedRecently} of our men killed by rivals in the last ${LOSS_WINDOW_WEEKS} weeks (we have ${ourMen} men; the line is ${LOSS_DEFENCE_KILLS} and ${Math.round(LOSS_DEFENCE_SHARE * 100)}% of them) — on defence through week ${mem.defenceUntil}`);
  }
  const lossDefence = (mem.defenceUntil ?? -Infinity) >= w.week;
  // 1.2.49 (Robert): land is frozen only after one gang killed LAND_FREEZE_KILLS or more
  // of ours in LAND_FREEZE_WEEKS weeks, or on heavy-loss defence (the leader rule alone does not freeze it).
  const freezer = liveOthers.find((g) => killsOfUs(g, w.week - LAND_FREEZE_WEEKS).length >= LAND_FREEZE_KILLS);
  const landFreeze = !!freezer || lossDefence;
  // Point 7: the defence zone is only the blocks within 1 of a kill of ours,
  // an attack on our site, or a sighting, by a high-threat gang in the last
  // DEFENCE_ZONE_WEEKS weeks (no gang-wide freeze).
  {
    const zoneSince = w.week - DEFENCE_ZONE_WEEKS;
    for (const g of highGangs) {
      for (const l of killsOfUs(g, zoneSince)) { const bl = l.pos ? blockAtPos(w, l.pos) : l.buildingId != null ? w.buildings[l.buildingId]?.blockId ?? null : null; if (bl != null) for (const id of withNeighbours(bl)) defenceZone.add(id); }
      for (const c of siteAttacks(g, zoneSince)) { const b = c.buildingId != null ? w.buildings[c.buildingId] : undefined; if (b) for (const id of withNeighbours(b.blockId)) defenceZone.add(id); }
      for (const x of mem.threatSeen ?? []) if (x.gangId === g.id && x.week > zoneSince) for (const id of withNeighbours(x.block)) defenceZone.add(id);
    }
  }
  defenceNow = defenceZone.size > 0;
  actions.push(`DEFENCE ZONE ${defenceZone.size} block(s) within 1 of a kill, site attack or sighting by a high-threat gang in the last ${DEFENCE_ZONE_WEEKS} weeks — ${defenceNow ? 'in force this week' : 'not in force'}`);
  // 1.2.38 (Robert): going straight (the goal, or already under way) — no
  // retaliation, and no hits on rivals at war with us (what their stance shows us).
  const straightNow = goal === 'straight' || gang.goingStraight;
  const atWarWithUs = (gangId: number | null | undefined) => gangId != null && gang.known[gangId] === 'war';
  /** 1.2.38 (Robert): going straight, no kill, kidnap, raid, torch, bomb or smash-up on a rival at war with us (1.2.48: the weak half is dropped). */
  const noHitOn = (gangId: number | null | undefined) => straightNow && atWarWithUs(gangId);
  /** 1.2.48 (Robert): while any gang has threat, the attack and Expendables crews strike only the highest-threat gang, whatever its stance. */
  const notTarget = (gangId: number | null | undefined) => !!topThreat && gangId !== topThreat.id;
  // Points 3 and 8: our stance.
  {
    const set: string[] = [];
    for (const g of liveOthers) {
      const theirs = gang.known[g.id] ?? 'peace';
      const lost = killsOfUs(g).length, took = killsByUs(g);
      // Point 8: peace to a high-threat gang that kills more of ours than we of
      // its (THREAT_WEEKS weeks), only while it does not treat us as the leader.
      // 1.2.49 (Robert): and only when it offers ceasefire or better; else aggression stays.
      const sue = highThreat(g) && lost > took && !leaderTo.has(g.id) && ['ceasefire', 'peace', 'alliance'].includes(theirs);
      // Point 3: aggression toward a gang at war/aggression with us or predicted
      // by the leader rule (replaces 1.2.38's ceasefire); otherwise the 1.2.40 mirror.
      const want = sue ? 'peace' : hostileGangs.has(g.id) ? 'aggression' : theirs;
      if ((gang.offered[g.id] ?? 'peace') === want) continue;
      if (setDiplomacy(w, gang.id, g.id, want).ok) set.push(`${g.name} ${want}${sue ? ` (peace offered: it killed ${lost} of ours, we ${took} of its in ${THREAT_WEEKS} weeks)` : hostileGangs.has(g.id) ? ` (${leaderTo.has(g.id) ? 'stop-the-leader' : `it offers ${theirs}`})` : ' (mirrored)'}`);
    }
    if (set.length) actions.push(`OK stance set: ${set.join(', ')}`);
    actions.push(`STANCE ours/theirs: ${liveOthers.map((g) => `${g.name} ${gang.offered[g.id] ?? 'peace'}/${gang.known[g.id] ?? 'peace'}`).join(', ')}`);
  }
  // 1.2.45 (Robert): what we hold, every week.
  {
    const held = territoryBlocks(w, gang.id).map((block) => block.id);
    // 1.2.46 (Robert): lots are counted only in blocks where we own a business (the land rule's blocks).
    const bizBlocks = new Set(buildingList(w).filter((b) => b.ownerGangId === gang.id && b.cls !== 'empty' && b.state !== 'destroyed').map((b) => b.blockId));
    const emptyIn = buildingList(w).filter((b) => b.cls === 'empty' && b.state !== 'destroyed' && bizBlocks.has(b.blockId));
    const centre = (b: Building) => w.lots[b.lotId]?.index === CENTRE_LOT;
    const oursEmpty = emptyIn.filter((b) => b.ownerGangId === gang.id), saleEmpty = emptyIn.filter((b) => b.ownerGangId == null);
    const mine = buildingList(w).filter((b) => b.ownerGangId === gang.id && b.state !== 'destroyed');
    const unmanned = mine.filter((b) => !b.isHQ && b.typeId !== 'office' && b.cls !== 'empty' && b.cls !== 'municipal' && b.managerId == null);
    const rackets = mine.filter((b) => b.cls === 'illegal' && b.typeId !== 'office');
    actions.push(`HOLDINGS ${held.length} blocks held; empty lots in blocks with our business: ${oursEmpty.length} ours (${oursEmpty.filter(centre).length} centre), ${saleEmpty.length} for sale (${saleEmpty.filter(centre).length} centre); ${unmanned.length} business(es) without a manager${unmanned.length ? ` (${unmanned.map((b) => `${b.typeId} #${b.id}`).join(', ')})` : ''}; ${rackets.length} illegal business(es)${rackets.length ? `: ${rackets.map((b) => `${b.typeId} #${b.id} cover ${b.cover}`).join(', ')}` : ''}`);
  }
  // 1.2.48 (Robert): THREAT per rival replaces the STRENGTH line.
  for (const g of liveOthers) actions.push(`THREAT ${g.name} ${threatOf.get(g.id) ?? 0} = ${threatWhy.get(g.id)} (${THREAT_WEEKS} weeks); we killed ${killsByUs(g)} of its men${leaderTo.has(g.id) ? '; treats us as the leader' : ''}${highThreat(g) ? ' — HIGH' : ''}${g === topThreat ? ' — the target' : ''}`);
  // 1.2.50 (Robert): the weekly FITNESS line — reporting only. Protection over
  // the week just played (rates as they stand now), running totals since
  // Auto started, and the other terms of the gang's state.
  {
    const last = w.week - 1;
    const p = protectionWeek(w, gang.id, last);
    const uncollected = p.refused + p.closed + p.notVisited;
    // 1.2.51: full and after-skim are both as taken at each stop (the game
    // records them at collection), so after skim never tops full.
    const take = gang.protectionTake?.week === last ? gang.protectionTake : { week: last, full: 0, declared: 0 };
    const declared = take.declared;
    const full = take.full;
    const tot = mem.fitnessTotals ?? (mem.fitnessTotals = { weeks: 0, claimed: 0, collected: 0, declared: 0, uncollected: 0 });
    if (mem.fitnessWeek !== last) {
      mem.fitnessWeek = last;
      tot.weeks++; tot.claimed += p.claimed; tot.collected += full; tot.declared += declared; tot.uncollected += uncollected;
    }
    const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
    const threatTotal = liveOthers.reduce((sum, g) => sum + (threatOf.get(g.id) ?? 0), 0);
    const lostLast = memberLosses(w, gang.id, last).filter((l) => l.week === last && l.cause !== 'sacked').length;
    actions.push(`FITNESS week ${last}: protection claimed ${usd(p.claimed)} (${p.shops} shops), collected ${usd(full)} full / ${usd(declared)} after skim, uncollected ${usd(uncollected)} (refused ${usd(p.refused)}, closed ${usd(p.closed)}, not visited ${usd(p.notVisited)}); score ${usd(protectionScore({ ...p, collected: full }))}`
      + ` | totals ${tot.weeks} weeks: claimed ${usd(tot.claimed)}, collected ${usd(tot.collected)} / ${usd(tot.declared)} after skim, uncollected ${usd(tot.uncollected)}`
      + ` | blocks ${territoryCount(w, gang.id)}, men ${crewMen()}, cash ${usd(gang.cash)} vs reserve ${usd(cashReserve)} (${gang.cash >= cashReserve ? '+' : '−'}${usd(Math.abs(gang.cash - cashReserve))}), threat ${threatTotal}, suspicion ${Math.round(gang.suspicion)}, men lost ${lostLast}`);
  }
  // 1.2.51 (Robert): the election POLL each week it runs and its RESULT, and
  // a squalor summary of our blocks against the city.
  {
    const nameOf = (c: { id: number; kind: string; gangId: number | null }) => c.kind === 'gang' && c.gangId != null ? `${w.gangs[c.gangId]?.name ?? `gang ${c.gangId}`}${c.gangId === gang.id ? ' (us)' : ''}` : `${w.people[c.id]?.name ?? c.id} (${c.kind})`;
    if (w.election.active) {
      const poll = originalElectionPoll(w);
      actions.push(poll ? `POLL week ${w.week} (${w.election.weeksLeft} wk left): ${w.election.candidates.map((c) => `${nameOf(c)} ${poll.votes.get(c.id) ?? 0}%`).join(', ')}; civic pool ${poll.result.civicPool}`
        : `POLL week ${w.week}: no Standard count for this game (not on the Standard rules)`);
    }
    const res = w.election.lastResult;
    if (res && res.week >= w.week - 1) actions.push(`RESULT election of week ${res.week}: won by ${(() => { const c = res.candidates.find((k) => k.id === res.winnerId); return c ? nameOf(c) : w.people[res.winnerId]?.name ?? res.winnerId; })()} — ${res.candidates.map((c) => `${nameOf(c)} ${c.votes}`).join(', ')}`);
    const ours = territoryBlocks(w, gang.id);
    const sq = (ids: { squalor: number; id: number }[]) => ids.length ? ids.reduce((n, b) => n + b.squalor, 0) / ids.length : 0;
    const worst = [...ours].sort((a, b) => b.squalor - a.squalor)[0];
    actions.push(`SQUALOR our ${ours.length} block(s) average ${sq(ours).toFixed(1)}${worst ? ` (worst block ${worst.id} at ${Math.round(worst.squalor)})` : ''}; city average ${sq(w.blocks).toFixed(1)}; ${ours.filter((b) => b.squalor >= SQUALOR_HIGH).length} of ours at ${SQUALOR_HIGH}+`);
  }
  // 1.2.35 (Robert): managers by what they earn — the game's profit rule
  // (0.45 + business × 0.16 + organization × 0.05) less what he skims. Every
  // week each manager is compared with the best free hood (pool or any crew).
  // 1.2.36 (Robert): a swap needs 0.5★ more business; the hood named is never
  // a lieutenant or a hood promoted this week, and joins the business crew
  // only with 3★ business; he is kept off this week's buys (they name another
  // hand); Run Business goes out after the buys, and only when the business
  // crew still has the time; a site with a swap under way is not offered
  // again; each swap's outcome is logged the week after.
  const swapPlans: { site: Building; label: string; cand: Person; old: Person | undefined; gain: number; team: Team }[] = [];
  const swapCands = new Set<number>();
  const pendingSwaps = swapsPending.get(w) ?? new Map<number, { orderId: number; candId: number; oldId: number | null; week: number }>();
  swapsPending.set(w, pendingSwaps);
  for (const [siteId, sw] of [...pendingSwaps]) {
    const live = w.orders[sw.orderId];
    if (live && live.state !== 'done' && live.state !== 'failed') continue;
    const site = w.buildings[siteId];
    const label = `${BUILDING_BY_ID[site?.typeId ?? '']?.name ?? site?.typeId ?? 'site'} #${siteId}`;
    const ran = live ?? w.lastWeekOrders.find((o) => o.id === sw.orderId);
    const cand = w.people[sw.candId], old = sw.oldId != null ? w.people[sw.oldId] : undefined;
    const now = site?.managerId != null ? w.people[site.managerId] : undefined;
    actions.push(site?.managerId === sw.candId
      ? `MANAGER SWAP at ${label} worked: ${cand?.name ?? sw.candId} runs it now${sw.oldId != null ? ` in place of ${old?.name ?? sw.oldId}` : ' (it had no manager)'} (Run Business given week ${sw.week})`
      : `MANAGER SWAP at ${label} did not take: ${ran ? (ran.failReason || ran.results.join(' ') || `order ${ran.state}`) : 'the order was cancelled'} — manager now ${now?.name ?? 'nobody'} (Run Business given week ${sw.week})`);
    pendingSwaps.delete(siteId);
  }
  // 1.2.54 (Robert): who runs each business is a policy, reviewed every week
  // by manager value. A site's weekly value under a man m is
  //   takings at his factor (0.45 + 0.16 business + 0.05 org; unmanned 1)
  //   − the expected raid cost his skills let in (standard rules only):
  //     illegal sites — business + org against the FBI's zeal (racket rule);
  //     counterfeit or stolen stock — business + stealth + org up to the safe
  //     bar (worst-case zeal 207), worth $0 above it.
  // An unmanned site has no raid risk from either rule. A candidate (pool or
  // any crew that keeps MIN_CREW_AFTER_MANAGER men) goes in by Run Business
  // only — never Return to base — when SWAP_WEEKS × the gain beats SWAP_MARGIN
  // × the cost: SWAP_MAN_MINUTES × the crew's rate + SWAP_WEEKS × (what the
  // candidate earns in his job now − what the old man earns in his next one).
  // A skimming manager (audit-confirmed) is swapped at once, without the margin.
  // This replaces the 3★ gate, the lending rule and LEAD_SWAP_GAIN for managers.
  if (ready.length) {
    const lines: string[] = [];
    const notes: string[] = [];
    const sites = buildingList(w).filter((b) => b.ownerGangId === gang.id && !b.isHQ && b.typeId !== 'office' && b.cls !== 'empty' && b.cls !== 'municipal' && b.state === 'trading' && b.fbiClosedWeek == null
      && (b.managerId == null || !!w.people[b.managerId]))
      .sort((a, b) => b.lastProfit - a.lastProfit || a.id - b.id);
    // Per-site profit history (last week's takings and who ran the site).
    const hist = siteHistory.get(w) ?? new Map<ID, { week: number; profit: number; managerId: ID | null }[]>();
    siteHistory.set(w, hist);
    for (const b of sites) {
      const h = hist.get(b.id) ?? [];
      if (!h.length || h[h.length - 1].week !== w.week - 1) h.push({ week: w.week - 1, profit: b.lastProfit, managerId: b.managerId ?? null });
      hist.set(b.id, h.slice(-SITE_HISTORY_WEEKS));
    }
    const fbiRules = standardRules(w);
    const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
    const raidCost = (b: Building) => Math.max(0, b.lastProfit) * LASTING_WEEKS + scale.A;
    const hazard = (b: Building, m: Person | undefined) => {
      if (!fbiRules || !m || b.discovered) return 0;
      let p = 0;
      if (b.cls === 'illegal') {
        const bar = RACKET_INVESTIGATION_BAR + skillByte(m.skills.business) + skillByte(m.skills.organization) - racketEventSuspicion(w, b) - (gang.fbiWeekRise ?? 0);
        p += clamp01((ZEAL_WORST - bar) / 80) * clamp01((255 - bar) / 128);
      }
      if (b.stock.counterfeit > 0 || b.stock.stolen > 0) {
        const sum = skillByte(m.skills.business) + skillByte(m.skills.stealth) + skillByte(m.skills.organization);
        if (sum + RAID_MANAGER_BAR < ZEAL_WORST) {
          let draws = 0;
          for (let r = 0; r <= 9; r++) if (contrabandDraw(b, r)) draws++;
          p += draws / 10;
        }
      }
      return clamp01(p);
    };
    const inPool = (p: Person) => gang.poolIds.includes(p.id);
    const crewKeeps = (p: Person) => { const t = p.teamId != null ? w.teams[p.teamId] : undefined; return !t || t.memberIds.length - 1 >= MIN_CREW_AFTER_MANAGER; };
    const roleOf = (t: Team | undefined) => (t ? roles.get(t.id) : undefined);
    const earnIn = (m: Person, t: Team | undefined) => { const r = roleOf(t); return r ? Math.max(0, jobEarnings(m, r, manCtx, MINUTES_PER_WEEK)) : 0; };
    const crewRate = (t: Team) => { const ty = ROLE_ORDER_TYPE[roleOf(t) ?? 'collect']; return ty ? Math.max(0, efficiency(orderBook, ty) ?? 0) : 0; };
    for (const site of sites) {
      const old = site.managerId != null ? w.people[site.managerId]! : undefined;
      const label = `${BUILDING_BY_ID[site.typeId]?.name ?? site.typeId} #${site.id}`;
      if (pendingSwaps.has(site.id)) { lines.push(`${label}: a swap is under way`); continue; }
      const base = site.lastProfit > 0 ? site.lastProfit / (old ? managerFactor(old) : UNMANNED_FACTOR) : 0;
      const value = (m: Person | undefined) => base * (m ? managerFactor(m) : UNMANNED_FACTOR) - hazard(site, m) * raidCost(site);
      const now = value(old);
      const skimmer = !!old && mem.skimmers.has(old.id);
      type Option = { cand: Person; runBy: Team; gain: number; cost: number; net: number };
      const options: Option[] = [];
      for (const cand of [...idlePool().map((id) => w.people[id]), ...crewsOf().flatMap((t) => t.memberIds.map((id) => w.people[id]))]) {
        if (!cand || cand.status !== 'active' || cand.role !== 'hood' || cand.orderId != null || restingMen.has(cand.id) || swapCands.has(cand.id) || promotedNow.has(cand.id) || !crewKeeps(cand)) continue;
        const gain = value(cand) - now;
        if (gain <= 0) continue;
        const candTeam = cand.teamId != null ? w.teams[cand.teamId] : undefined;
        // A crew man is put in by his own crew; a pool man joins a ready crew with room (the Business crew first).
        const runBy = candTeam ?? [bizCrew, ...ready].find((t): t is Team => !!t && ready.includes(t) && t.memberIds.length < MAX_TEAM_SIZE - 1);
        if (!runBy || !ready.includes(runBy)) continue;
        // The old man goes back to the crew that runs the swap, or the pool if it is full.
        const oldNext = old && runBy.memberIds.length - (candTeam === runBy ? 1 : 0) < MAX_TEAM_SIZE ? earnIn(old, runBy) : 0;
        // 1.2.55 (Robert): never $0 or less — the 150 man-minutes are always
        // priced (at the crew's rate, at least V per man-minute or SWAP_RATE_FLOOR),
        // and what the man earns where he is now counts only when it is a loss.
        const cost = SWAP_MAN_MINUTES * Math.max(crewRate(runBy), scale.V / MINUTES_PER_WEEK, SWAP_RATE_FLOOR) + SWAP_WEEKS * Math.max(0, earnIn(cand, candTeam) - oldNext);
        const net = SWAP_WEEKS * gain - (skimmer ? 1 : SWAP_MARGIN) * Math.max(0, cost);
        if (net > 0) options.push({ cand, runBy, gain, cost, net });
      }
      options.sort((a, b) => b.net - a.net || Number(inPool(b.cand)) - Number(inPool(a.cand)) || a.cand.id - b.cand.id);
      const best = options[0];
      if (!best) {
        if (old && (skimmer || managerFactor(old) < UNMANNED_FACTOR)) notes.push(`${label}: ${old.name} stays (${skimmer ? 'skims' : `factor ${managerFactor(old).toFixed(2)} below the unmanned 1.00`}) — no better man is free and the site is never emptied by Return to base`);
        continue;
      }
      const { cand, runBy } = best;
      if (!runBy.memberIds.includes(cand.id) && !tryMove(cand.id, runBy.id, `manager: ${cand.name} joins ${runBy.name} to take over ${label}`).ok) continue;
      swapCands.add(cand.id);
      swapPlans.push({ site, label, cand, old, gain: Math.round(best.gain), team: runBy });
      lines.push(`${label}: ${cand.name} (factor ${managerFactor(cand).toFixed(2)}${hazard(site, cand) || hazard(site, old) ? `, raid risk ${Math.round(hazard(site, cand) * 100)}%` : ''}${inPool(cand) ? ', from the pool' : ''}) for ${old ? `${old.name} (factor ${managerFactor(old).toFixed(2)}${skimmer ? ', skims' : ''}${hazard(site, old) ? `, raid risk ${Math.round(hazard(site, old) * 100)}%` : ''})` : 'nobody (unmanned)'} — gain $${Math.round(best.gain)}/wk × ${SWAP_WEEKS} vs cost $${Math.round(best.cost)}${skimmer ? '' : ` × ${SWAP_MARGIN}`}`);
    }
    actions.push(`MANAGERS ${sites.filter((b) => b.managerId != null).length} run by our men, ${sites.filter((b) => b.managerId == null).length} unmanned; ${lines.length ? lines.join('; ') : 'no swap beats its cost'}`);
    if (notes.length) actions.push(`NOTE managers: ${notes.join('; ')}`);
    // 1.2.54 (Robert): a short per-site profit history — changed hands first, then top profit.
    const histLine = sites.map((b) => ({ b, h: hist.get(b.id) ?? [] }))
      .map((x) => ({ ...x, changed: new Set(x.h.map((e) => e.managerId)).size > 1 }))
      .sort((a, b) => Number(b.changed) - Number(a.changed) || b.b.lastProfit - a.b.lastProfit || a.b.id - b.b.id)
      .slice(0, 12)
      .map(({ b, h }) => `${BUILDING_BY_ID[b.typeId]?.name ?? b.typeId} #${b.id} ${h.map((e) => `${e.profit}${e.managerId != null ? `(${(w.people[e.managerId]?.name ?? '?').split(' ').map((s) => s[0]).join('')})` : '(-)'}`).join('/')}`);
    if (histLine.length) actions.push(`SITE HISTORY (last ${SITE_HISTORY_WEEKS} wk, $ takings (manager initials, - unmanned)): ${histLine.join('; ')}`);
  }
  /** 1.2.36: the business hand a buy names while a swap hood is kept off buys — the one with the fewest buys this week, then the best manager by the game's pick. */
  const buysNamed = new Map<number, number>();
  // 1.2.46 (Robert): never the lieutenant — the game never makes him a manager, so a buy he made stayed unmanned.
  const buyerFor = (team: Team) => team.memberIds.map((id) => w.people[id])
    .filter((p): p is Person => !!p && p.status === 'active' && p.role === 'hood' && !restingMen.has(p.id) && !swapCands.has(p.id))
    .sort((a, b) => (buysNamed.get(a.id) ?? 0) - (buysNamed.get(b.id) ?? 0) || (b.skills.business + b.skills.organization) - (a.skills.business + a.skills.organization) || a.id - b.id)[0];
  /**
   * 1.2.23 (Robert's method): the business crew's three jobs — buy a business,
   * buy empty land, set up a business on our land. No minutes gate of our own
   * (1.2.22's learned slowness factor turned away ~70 buys a run): the game
   * accepts what fits the crew's week, and the loop gives as many as fit.
   * A target that failed twice stays dropped; a crew never retries its own failure.
   */
  let noBuyNoted = false;
  const planBuy = (label: string, candidates: Building[], make: (site: Building) => Omit<IssueOrderInput, 'teamId'> = (site) => ({ type: 'buyPremises', buildingIds: [site.id] }),
    worth: (site: Building) => number = (site) => (BUILDING_BY_ID[site.typeId]?.profit ?? 0) * 4, cost: (site: Building) => number = (site) => BUILDING_BY_ID[site.typeId]?.cost ?? 0, budget = Infinity, first = false): Building[] => {
    // 1.2.45 (Robert): no crew ready to plan — no buys are put forward, one NOTE says so.
    // 1.2.54 (Robert): any crew may buy, so only no crew at all stops them.
    if (!ready.length) {
      if (!noBuyNoted) actions.push('NOTE business: no crew is free to plan — no buys or set-ups put forward this week');
      noBuyNoted = true;
      return [];
    }
    const ordered = new Set(desk.pending.filter((p) => p.week === w.week).map((p) => p.buildingId));
    const chosen: Building[] = [];
    let spent = 0;
    for (const site of candidates) {
      // 1.2.54 (Robert): no ban or fixed wait — a site that failed is weighed by its chance of being carried out.
      if (ordered.has(site.id) || offered.has(site.id)) continue;
      if (spent + cost(site) > budget) continue;
      const base = make(site);
      const input = { ...base, opts: { manpower: 1, priority: true, ...base.opts } };
      offered.add(site.id); chosen.push(site); spent += cost(site);
      // 1.2.52 (Robert): a spend for the cash pass — profit × LASTING_WEEKS ÷ cost,
      // plus ASSET_RETURN for the site itself, which stays ours (proposed: unlike a
      // bribe or a wage the dollar is not used up; without it no shop at ~0.6 would
      // ever beat λ 0.94); a site with no profit of its own is the asset alone.
      const profit = BUILDING_BY_ID[input.opts.businessTypeId ?? site.typeId]?.profit ?? 0;
      const price = cost(site);
      const orderLabel = `${label} ${site.typeId} (building ${site.id}, $${cost(site).toLocaleString('en-US')})`;
      // 1.2.55 (Robert): a legal buy raises the premises base the FBI total is
      // measured against — it is credited with the FBI heat it takes off.
      const fbiCredit = input.type === 'buyPremises' && site.cls !== 'illegal' && profit > 0 ? legalCredit(heatState ?? heatInputs(), profit) : 0;
      // 1.2.54 (Robert): the cash pass weighs the buy by its chance of being carried out (order completion).
      want({ label: `${label} ${site.typeId} (building ${site.id})`, kind: input.type === 'setUpBusiness' ? 'set-up' : profit > 0 ? 'buy' : 'asset', cost: price, chance: execChance(exec, input.type, null, site.id),
        ret: (profit * LASTING_WEEKS + fbiCredit) / Math.max(1, price) + ASSET_RETURN, why: profit > 0 ? `$${profit}/wk × ${LASTING_WEEKS} wk${fbiCredit > 0 ? ` + FBI heat credit $${Math.round(fbiCredit)}` : ''} ÷ $${price} + ${ASSET_RETURN} (the site stays ours)` : 'no profit of its own: the site as an asset', run: () => { approvedBy.set(orderLabel, price); propose({
        label: orderLabel, kind: 'business', role: 'business', input, first,
        value: Math.max(50, worth(site)), why: blockIsOurs(site.blockId) ? 'block already ours' : 'a new block',
        onGiven: (team) => {
          const orderId = team.orderIds[team.orderIds.length - 1];
          const order = w.orders[orderId];
          desk.pending.push({ orderId, buildingId: site.id, teamId: team.id, type: input.type, estimate: order?.estimatedMinutes ?? 0, free: Math.round(freeFor(team)), week: w.week });
          const line = `NOTE business: ${label} ${site.typeId} (building ${site.id}) to ${team.name} — about ${order ? hm(order.estimatedMinutes) : '?'} by the game's estimate, ${hm(freeFor(team))} left for the freest man, ${hm(crewFreeMinutes(w, team))} man-time for the crew after it`;
          actions.push(line); noteDevDesk(line);
        },
      }); return true; } });
    }
    return chosen;
  };

  // A crew refused for lack of time last week gets a car, or a hood moved across, before it is asked again.
  for (const id of shortCrews.get(w) ?? []) {
    const team = ready.find((t) => t.id === id);
    if (!team) continue;
    const full = team.memberIds.length >= MAX_TEAM_SIZE - 1;
    const carless = !Object.values(team.vehicles).some((n) => n > 0);
    if (carless) {
      // 1.2.52 (Robert): a spend for the cash pass, priced by the minutes it saves the crew's job.
      const type = ROLE_ORDER_TYPE[roles.get(team.id) ?? 'collect'];
      const car = type ? carReturn(type, VEHICLES.coupe.cost, Infinity) : { ret: 0, why: 'no order type for this job' };
      want({ immediate: true, label: `car for ${w.people[team.lieutenantId]?.name ?? 'crew'} (out of time last week)`, kind: 'car', cost: VEHICLES.coupe.cost, ret: car.ret, why: car.why, run: () => {
        const result = buyVehicle(w, gang.id, 'coupe', team.id);
        logResult(actions, `buy car for ${w.people[team.lieutenantId]?.name ?? 'crew'} (out of time last week)`, result.ok, result.ok ? '' : result.error);
        return result.ok;
      } });
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
      // checked (1.2.55: a man with no street-arrest risk by the heat model).
      // 1.2.37 (Robert): an Expendables man first, when one is clean enough.
      const isExp = (id: number) => crewsOf().some((team) => roles.get(team.id) === 'expendables' && team.memberIds.includes(id));
      // 1.2.40 (Robert): an Expendable only.
      const hood = crewsOf().filter((team) => roles.get(team.id) === 'expendables').flatMap((team) => team.memberIds).map((id) => w.people[id])
        .filter((p): p is NonNullable<typeof p> => !!p && p.status === 'active' && p.role === 'hood' && !restingMen.has(p.id)
          && riskOfMan(p.id) <= 0)
        .sort((a, b) => Number(isExp(b.id)) - Number(isExp(a.id)) || total(a) - total(b) || a.id - b.id)[0];
      if (hood) {
        moveToPool(w, gang.id, hood.id);
        if ((gang.weapons.pistol ?? 0) < 1 && spendOk(WEAPONS.pistol.cost)) buyWeapon(w, gang.id, 'pistol');
        const result = issueStreetOrder(w, gang.id, [hood.id], 'kill', agent.id, null);
        const at = watchedSites.filter((b) => dist(agent.pos, buildingDoor(w, b)) <= 30).sort((a, b) => dist(agent.pos, buildingDoor(w, a)) - dist(agent.pos, buildingDoor(w, b)))[0];
        logResult(actions, `FBI agent ${agent.name} seen at our ${at ? (BUILDING_BY_ID[at.typeId]?.name ?? at.typeId) : 'site'} — ${hood.name} (expendable) sent to kill him; the FBI cannot be bought`, result.ok, result.ok ? '' : result.error);
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
  // 1.2.48 (Robert): while any rival has threat, an armed guard crew (the
  // Expendables, else the attack crew) stands at the HQ door, as many men as
  // the threat gangs' men seen within 1 block of our offices last week (1.2.49:
  // see below for the size); the armed pool hoods
  // inside stay as the second line. Replaces 1.2.40's pool-inside-after-quiet-weeks.
  const poolGuards = hq ? armedPoolDefenders(w, hq) : 0;
  // Office trouble is still logged. 1.2.49 (Robert): a man of ours killed anywhere in the HQ block counts too.
  const hqBlock = hq ? claimOf(hq.blockId) : undefined;
  {
    const offices = buildingList(w).filter((b) => isGangOffice(b, gang.id));
    const hit = memberLosses(w, gang.id, w.week - 1).some((l) => l.week === w.week - 1 && ((l.buildingId != null && offices.some((b) => b.id === l.buildingId))
        || (l.by != null && rivalNames.has(l.by) && hqBlock != null && (() => { const bl = killBlock(l); return bl != null && claimOf(bl) === hqBlock; })())))
      || offices.some((b) => b.state === 'damaged' || b.fireWeek === w.week - 1);
    if (hit) mem.lastOfficeTrouble = w.week - 1;
  }
  const threatGangs = liveOthers.filter((g) => (threatOf.get(g.id) ?? 0) > 0);
  // 1.2.49 (Robert): the guard is our men killed by rivals within 1 block of an
  // office in the last HQ_GUARD_KILL_WEEKS weeks plus the threat gangs' men first
  // spotted near our offices last week; at least HQ_GUARD_MIN_UNDER_FIRE while a
  // high-threat gang killed our men in the last THREAT_WEEKS weeks (one man
  // otherwise when the count is none), at most HQ_GUARD_MAX, and never more than the crew.
  const killedNearOffices = memberLosses(w, gang.id, w.week - HQ_GUARD_KILL_WEEKS).filter((l) => l.by != null && rivalNames.has(l.by) && (() => { const bl = killBlock(l); return bl != null && nearOffices.has(claimOf(bl)); })()).length;
  const seenAtOffices = threatGangs.reduce((n, g) => n + seenNear(g, nearOffices, w.week, true), 0);
  const underFire = highGangs.some((g) => killsOfUs(g).length > 0);
  const guardCount = killedNearOffices + seenAtOffices;
  const guardFloor = underFire ? HQ_GUARD_MIN_UNDER_FIRE : 1;
  const posted = Math.min(HQ_GUARD_MAX, guardCount > guardFloor ? guardCount : guardFloor);
  // 1.2.49 (Robert): the guard crew is the Expendables, else the attack crew; the patrol never takes it.
  const guardCrew = w.week >= 2 && hq && threatGangs.length ? ready.find((t) => roles.get(t.id) === 'expendables') ?? (muscleCrew && ready.includes(muscleCrew) ? muscleCrew : undefined) : undefined;
  if (w.week >= 2 && hq) actions.push(`NOTE office: ${mem.lastOfficeTrouble >= 0 ? `last attacked in week ${mem.lastOfficeTrouble}` : 'never attacked'}; ${threatGangs.length ? `threat from ${threatGangs.map((g) => g.name).join(', ')}; ${killedNearOffices} of our men killed within 1 block of our offices in ${HQ_GUARD_KILL_WEEKS} weeks, ${seenAtOffices} threat men first spotted there last week` : 'no rival has threat — no guard'}; ${poolGuards} armed pool hood(s) inside (second line)`);
  if (w.week >= 2 && hq && threatGangs.length) {
    if (guardCrew) propose({ label: `guard office (${posted} armed)`, kind: 'safety', value: 150, first: true, why: `${killedNearOffices} killed + ${seenAtOffices} spotted near our offices; least ${guardFloor}${underFire ? ' (a high-threat gang killed our men)' : ''}, most ${HQ_GUARD_MAX}, never more than the crew`, teams: [guardCrew],
      input: (team) => ({ type: 'guardBusiness', buildingIds: [hq.id], opts: { manpower: manpowerFor(team, posted) } }) });
    else actions.push('NOTE guard office: no Expendables or attack crew free — the armed pool hoods inside defend it');
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
    const value = !accountantLost ? (specialistStars(accountantNow) < 3 ? 400 : 150) : legalPush || fbiProject(heatInputs()) >= FBI_CASE_THRESHOLD - FBI_BAND ? 6000 : 200; // 1.2.55: by the projected FBI total, not suspicion levels
    const search = specSearch('accountant', accountantLost && staffMissing('accountant'));
    const aLabel = `recruit accountant (${search.stops.length} place${search.stops.length === 1 ? '' : 's'})`;
    if (search.urgent) staffUrgent.add(aLabel);
    if (desk && search.stops.length) propose({ label: aLabel, kind: 'safety', value: search.urgent ? STAFF_TOP_VALUE : value, role: 'recruit', teams: search.teams, minFree: search.urgent ? 0 : undefined, why: search.urgent ? 'no accountant — top priority (point 9)' : !accountantLost ? `ours is ${specialistStars(accountantNow).toFixed(1)}★ — a better one swaps him` : legalPush ? `office/premises ratio ${officeRatio.toFixed(1)} near its limit` : 'hoods first',
      input: { type: 'recruit', buildingIds: search.stops, opts: { manpower: 1, recruitAs: 'accountant' } } });
  }

  // Police and courts, as the manual has it. A man on trial: the judge throws
  // the case out, the DA hands over the witness and juror lists, and those
  // people can then be paid or leaned on; dice weighted by the ranked table
  // choose which. The lawyer pays the police chief or the mayor by heat value (1.2.55), and a
  // rich gang buys the mayor so fewer police walk its patch.
  const openCases = Object.values(w.cases ?? {}).filter((c) => c.gangId === gang.id && ['awaiting', 'onTrial'].includes(c.status));
  // Hot men on the street count too: the chief is paid before the police start taking crews.
  const streetHot = hotCrews.length > 0 || policeHostile || [...restingMen].some((id) => riskOfMan(id) >= REST_RISK);
  const hot = openCases.length > 0 || streetHot;
  const lawyer = availableSpecialist(w, gang, 'lawyer');
  /** 1.2.49 (Robert): the boss's own case may spend all the cash not already booked for bribes — below the reserve and past the share. */
  const buyable = (id: number | undefined, share: number, bossCase = false) => {
    const o = id == null ? undefined : w.people[id];
    const room = bossCase ? gang.cash - bribesDue : Math.min(gang.cash * share, aboveReserve());
    return !!o && o.bribedBy !== gang.id && isBribableOfficial(o) && !refusesBribe(o, gang.id) && bribePrice(w, o, gang.id) <= room ? o : undefined;
  };
  // 1.2.25 (B7, court cases): the nearest trial first, the strongest case among equals.
  // 1.2.49 (Robert): the boss's case first, whatever its week.
  const isBossCase = (c: (typeof openCases)[number]) => w.people[c.defendantId]?.role === 'boss';
  const urgentCases = [...openCases].sort((a, b) => Number(isBossCase(b)) - Number(isBossCase(a)) || a.weeksToTrial - b.weeksToTrial || b.strength - a.strength || a.id - b.id);
  if (urgentCases.length) actions.push(`B7 cases: ${urgentCases.map((c) => `${w.people[c.defendantId]?.name ?? c.defendantId} ${c.weeksToTrial} wk to trial, strength ${Math.round(c.strength)}${c.knowsWitnesses ? `, ${c.witnessIds.length} witnesses` : ''}${c.knowsJurors ? `, ${c.jurorIds.length} jurors` : ''}`).join('; ')}`);
  for (const c of urgentCases.slice(0, 2)) {
    const defendant = w.people[c.defendantId];
    const bossCase = isBossCase(c);
    const judge = lawyer && !c.judgeBribed ? buyable(c.judgeId, 0.9, bossCase) : undefined;
    const da = lawyer && !(c.knowsWitnesses && c.knowsJurors) ? buyable(c.daId, 0.7, bossCase) : undefined;
    const witnesses = c.knowsWitnesses ? c.witnessIds.map((id) => w.people[id]).filter((p): p is NonNullable<typeof p> => !!p && p.status === 'active' && p.bribedBy !== gang.id && (p.opinion[gang.id] ?? 0) < 40) : [];
    const jurors = c.knowsJurors ? c.jurorIds.map((id) => w.people[id]).filter((p): p is NonNullable<typeof p> => !!p && p.status === 'active' && p.bribedBy !== gang.id && (p.opinion[gang.id] ?? 0) <= 25) : [];
    const options: ActionKey[] = [];
    if (judge) options.push('bribeJudge');
    if (da) options.push('bribeDA');
    if (witnesses.length) options.push('bribeWitness', 'scareWitness');
    const jurorSum = jurors.length ? Math.round(400 + jurors[0].skills.intelligence * 300) : 0;
    if (jurors.length && (bossCase ? gang.cash - bribesDue >= jurorSum : spendOk(jurorSum))) options.push('bribeJuror');
    // 1.2.51 (Robert): bribe fitness — each option is its expected benefit
    // (the drop in the trial's conviction chance × what a conviction costs)
    // over its cost, in dollars. The best at 1 or more is taken; the boss's
    // own case takes the best whatever its ratio (all the cash if needed).
    const sides = trialSides(w, gang, c, lawyer ?? undefined);
    const p0 = trialP(sides);
    const stake = convictionStake(defendant, gang, scale, takingsLast);
    const drop = (changed: Partial<typeof sides>) => Math.max(0, p0 - trialP({ ...sides, ...changed }));
    const evidenceDollar = Math.max(0, trialP({ ...sides, evidence: sides.evidence + 1 }) - p0) * stake;
    const scareSuspicion = (CRIME_ROW_SUSPICION.assault ?? 0) * 2;
    const scored: [ActionKey, BribeScore][] = options.map((k) => [k,
      k === 'bribeJudge' ? scoreBribe(k, p0 * stake, bribePrice(w, judge!, gang.id), `P(convict) ${p0.toFixed(2)} → 0 (dismissed) × stake $${Math.round(stake)}`)
        : k === 'bribeDA' ? scoreBribe(k, (c.knowsWitnesses ? drop({ friendlyJurors: sides.friendlyJurors + 1 }) : drop({ witnesses: Math.max(0, sides.witnesses - 1) })) * stake, bribePrice(w, da!, gang.id) + DA_FOLLOW_UP_COST,
          `the ${c.knowsWitnesses ? 'juror' : 'witness'} list opens one ${c.knowsWitnesses ? 'friendly juror' : 'witness less'}; + $${DA_FOLLOW_UP_COST} to buy him (proposed)`)
        : k === 'bribeWitness' ? scoreBribe(k, drop({ witnesses: Math.max(0, sides.witnesses - 1) }) * stake, Math.round(400 + witnesses[0].skills.intelligence * 300), `one witness less: P ${p0.toFixed(2)} → ${(p0 - drop({ witnesses: Math.max(0, sides.witnesses - 1) })).toFixed(2)}`)
        : k === 'scareWitness' ? scoreBribe(k, drop({ witnesses: Math.max(0, sides.witnesses - 1) }) * stake, scale.A * SCARE_ARREST_SHARE + scareSuspicion * 2 * scale.A / WARRANT_SUSPICION,
          `one witness less; cost ${SCARE_ARREST_SHARE} arrest + ${scareSuspicion} suspicion on 2 men at A/${WARRANT_SUSPICION} a point`)
        : scoreBribe(k, drop({ friendlyJurors: sides.friendlyJurors + 1 }) * stake, jurorSum, `one friendly juror more: P ${p0.toFixed(2)} → ${(p0 - drop({ friendlyJurors: sides.friendlyJurors + 1 })).toFixed(2)}`)]);
    if (scored.length) actions.push(`BRIBES case ${c.id} (${defendant?.name ?? 'a man'}${bossCase ? ', the boss' : ''}): P(convict) ${p0.toFixed(2)}, stake $${Math.round(stake)}, evidence $${Math.round(evidenceDollar)} a point — ${scored.map(([, s]) => bribeLine(s)).join('; ')}`);
    const best = [...scored].sort((a, b) => b[1].ratio - a[1].ratio)[0];
    const key = best && (best[1].ratio >= BRIBE_MIN_RATIO || (bossCase && best[1].benefit > 0)) ? best[0] : null;
    if (best && !key) { actions.push(`NOTE ${defendant?.name ?? 'a man'} on trial — no court bribe pays: the best is ${bribeLine(best[1])}`); continue; }
    if (!key) {
      const why = (id: number, share: number) => {
        const o = w.people[id];
        if (!o || !isBribableOfficial(o)) return 'not available';
        if (o.bribedBy === gang.id) return 'already ours';
        if (refusesBribe(o, gang.id)) return 'too hostile to take money';
        // 1.2.49 (Robert): say when the reserve or the share blocks it, not only the cash.
        const price = bribePrice(w, o, gang.id), free = gang.cash - bribesDue;
        if (price > free) return `$${price} against $${Math.round(free)} cash${bribesDue ? ` ($${Math.round(bribesDue)} already booked for bribes)` : ''}`;
        if (bossCase) return `$${price} — affordable`;
        if (price > aboveReserve()) return `$${price} — blocked by the reserve ($${Math.round(free)} cash against the $${Math.round(cashReserve)} reserve)`;
        return `$${price} — blocked by the ${Math.round(share * 100)}% share of cash ($${Math.round(gang.cash * share)})`;
      };
      actions.push(`NOTE ${defendant?.name ?? 'a man'} on trial — ${lawyer ? `nobody on the case can be bought this week (judge ${why(c.judgeId, 0.9)}, DA ${why(c.daId, 0.7)})` : 'no lawyer to buy the court'}`);
      continue;
    }
    actions.push(`BRIBE ${key} (${ACTION_LABELS[key]} for ${defendant?.name ?? 'a man'}) — ${bribeLine(best![1])}`);
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
  // 1.2.51 (Robert): bribe fitness for the chief and the mayor — expected
  // arrests saved over BRIBE_HORIZON_WEEKS (A each) against the price. A bribe
  // lifts the chief's opinion 34: the scene arrest risk falls with
  // (1 − opinion/260), and above +20 police presence drops to 0.6 (the mayor
  // bought does the same; they do not stack — the mayor is worth nothing
  // while the chief is above +20). Below −20 presence is 1.4.
  const officialWeeks = Math.max(1, Math.min(POLICE_VALUE_WEEKS, w.week - 1));
  const recentPolice = memberLosses(w, gang.id, w.week - POLICE_VALUE_WEEKS).filter((l) => l.week < w.week && l.by === 'the police' && /arrest/.test(l.cause));
  // 1.2.54 (Robert): forward-looking police value. The game's street arrest
  // (sim/systems/combat.ts) needs heat = wanted − officer opinion × 0.5 above
  // 45 and grows with heat ÷ 100; today's heat units (each free man's heat ÷
  // 100 above the line) × the street arrests a heat unit brought over the last
  // POLICE_VALUE_WEEKS weeks (STREET_ARREST_RATE before we have a record) are
  // the arrests expected at today's opinion — before they happen.
  const plog = policeLog.get(w) ?? { weeks: [], pending: null, low: new Map<number, number>() };
  policeLog.set(w, plog);
  const unpaidOpinion = (() => { const free = police.filter((p) => p.employedBy !== gang.id && p.bribedBy !== gang.id); return free.length ? free.reduce((n, p) => n + (p.opinion[gang.id] ?? 0), 0) / free.length : 0; })();
  const heatUnits = gangMembers(w, gang).filter((p) => p.status === 'active' && p.role !== 'boss' && p.buildingId == null)
    .reduce((n, p) => { const heat = p.wanted - unpaidOpinion * 0.5; return n + (heat > STREET_ARREST_HEAT ? heat / 100 : 0); }, 0);
  if (plog.pending && plog.pending.week === w.week - 1) {
    const arrests = recentPolice.filter((l) => l.week === w.week - 1 && !/at the scene/.test(l.cause)).length;
    plog.weeks.push({ week: w.week - 1, units: plog.pending.units, arrests });
  }
  plog.weeks = plog.weeks.filter((x) => x.week >= w.week - POLICE_VALUE_WEEKS);
  plog.pending = { week: w.week, units: heatUnits };
  const unitsSeen = plog.weeks.reduce((n, x) => n + x.units, 0), arrestsSeen = plog.weeks.reduce((n, x) => n + x.arrests, 0);
  const streetRate = (arrestsSeen + STREET_ARREST_RATE * STREET_ARREST_PRIOR_UNITS) / (unitsSeen + STREET_ARREST_PRIOR_UNITS);
  const forwardStreet = streetRate * heatUnits;
  actions.push(`POLICE forward: ${heatUnits.toFixed(1)} heat unit(s) above the arrest line at officer opinion ${Math.round(unpaidOpinion)} × ${streetRate.toFixed(3)} street arrests a unit (${arrestsSeen} in ${plog.weeks.length} wk over ${unitsSeen.toFixed(1)} units, prior ${STREET_ARREST_RATE} for ${STREET_ARREST_PRIOR_UNITS}, proposed) = ${forwardStreet.toFixed(2)} expected a week`);
  const policeArrestsPW = Math.max(recentPolice.length / officialWeeks, forwardStreet + recentPolice.filter((l) => /at the scene/.test(l.cause)).length / officialWeeks);
  const sceneArrestsPW = recentPolice.filter((l) => /at the scene/.test(l.cause)).length / officialWeeks;
  const chiefOp = chiefNow ? chiefNow.opinion[gang.id] ?? 0 : 0;
  const mayorOurs = mayorNow?.bribedBy === gang.id;
  // 1.2.53 (Robert): below −20 one bribe (+CHIEF_BRIBE_STEP) changes nothing
  // the police do; the chief is priced at the bribes it takes to reach −20
  // (their benefit against all their cost; one is paid at a time).
  const chiefBribes = chiefOp < -20 ? Math.ceil((-20 - chiefOp) / CHIEF_BRIBE_STEP) : 1;
  const chiefAfter = Math.min(100, chiefOp + CHIEF_BRIBE_STEP * chiefBribes);
  const chiefPresence = (op: number) => (op > 20 || mayorOurs ? 0.6 : 1) + (op < -20 ? 0.4 : 0);
  // 1.2.55 (Robert): a bribe is worth the heat price it takes off the coming
  // weeks' orders (autoHeat opinionRelief, at last week's crime load). The
  // chief's +34 fades by itself — he moves 35% a week toward the mayor; the
  // mayor's +34 stays, and a bought mayor also cuts police presence to 0.6.
  heatState = heatInputs(policeArrestsPW);
  const ourRiskLast = w.crimes.filter((c) => c.week === w.week - 1 && !c.charge && c.gangId === gang.id).reduce((n, c) => n + c.arrestRisk, 0);
  const presenceGain = chiefPresence(chiefOp) > 0.6 && !mayorOurs ? policeArrestsPW * (1 - 0.6 / chiefPresence(chiefOp)) * HEAT_WEEKS * scale.A : 0;
  const chiefBenefit = opinionRelief(heatState, 0, chiefAfter - chiefOp, ourRiskLast);
  const chiefWhy = `opinion ${Math.round(chiefOp)} → ${Math.round(chiefAfter)}${chiefBribes > 1 ? ` in ${chiefBribes} bribes` : ''}, fading 35%/wk toward the mayor (${Math.round(heatState.mayor)}); heat relief over ${HEAT_WEEKS} wk at last week's crime load Σ risk ${ourRiskLast.toFixed(1)}, ${policeArrestsPW.toFixed(2)} police arrests a week (${sceneArrestsPW.toFixed(2)} at the scene), A $${scale.A}`;
  const mayorBenefit = opinionRelief(heatState, CHIEF_BRIBE_STEP, 0, ourRiskLast) + presenceGain;
  const mayorWhy = `+${CHIEF_BRIBE_STEP} that stays (the chief follows 35%/wk): heat relief over ${HEAT_WEEKS} wk at Σ risk ${ourRiskLast.toFixed(1)}${presenceGain > 0 ? ` + presence × 0.6 $${Math.round(presenceGain)}` : mayorOurs ? ' (already ours: no presence gain)' : ' (presence already 0.6)'}`;
  const priceOf = (o: Person | undefined) => (o && isBribableOfficial(o) ? bribePrice(w, o, gang.id) : 0);
  const chiefFit = scoreBribe('chief', chiefBenefit, priceOf(chiefNow) * chiefBribes, chiefWhy);
  const mayorFit = scoreBribe('mayor', mayorBenefit, priceOf(mayorNow), mayorWhy);
  actions.push(`BRIBES fitness (1.2.52: put to the cash pass, taken at λ or better; never an official above hostility 224): ${bribeLine(chiefFit)}; ${bribeLine(mayorFit)}`);
  /** A bribe run: a crew with a car if one has time, and a second man as escort. */
  // 1.2.37 (Robert): the crew whose sharpest free man is sharpest (a car among equals).
  const bribeCrew = () => sharpCrews()[0] ?? freest();
  let chiefPaid = false;
  // 1.2.23: hostile police are paid off whatever the suspicion (seen: 22 arrests in a week at low suspicion).
  if (lawyer && chiefNow?.bribedBy !== gang.id && chiefFit.ratio > 0) {
    // 1.2.23: hostile police arrest our men on sight — worth more of the cash.
    const chief = buyable(w.policeChiefId, policeHostile ? 0.6 : 0.3);
    if (chief) {
      // 1.2.52 (Robert): a spend for the cash pass at its 1.2.51 return.
      chiefPaid = true;
      want({ immediate: true, label: `lawyer bribes ${chief.name} (police chief${chiefBribes > 1 ? `, 1 of ${chiefBribes}` : ''})`, kind: 'bribe', cost: Math.round(chiefFit.cost / chiefBribes), ret: chiefFit.ratio, why: chiefFit.why, run: () => {
        const result = specialistVisit('bribeOfficials', chief.id);
        logResult(actions, `lawyer bribes ${chief.name} (police chief)`, result.ok, result.ok ? result.message ?? '' : result.error);
        return result.ok;
      } });
    } else {
      const o = w.people[w.policeChiefId];
      if (o && o.bribedBy !== gang.id) actions.push(`NOTE the lawyer cannot buy the police chief this week (${!isBribableOfficial(o) ? 'not available' : refusesBribe(o, gang.id) ? 'too hostile' : `$${bribePrice(w, o, gang.id)} against $${Math.round(gang.cash)} cash`}) — a crew offers a smaller sum`);
    }
  } else if (chiefFit.ratio >= BRIBE_MIN_RATIO && gang.lawyerId == null) {
    actions.push(`NOTE the chief's bribe would pay (${chiefFit.ratio.toFixed(2)}) but there is no lawyer yet`);
  }
  // 1.2.51 (Robert): the police payroll by value. An officer is worth what he
  // saves us in arrests (A each): every paid officer cuts the arrest risk at a
  // crime scene by 0.04 (up to 0.4), and one standing on an illegal-business
  // block cuts it there to a quarter. New officers are hired while one more is
  // worth at least a retainer, up to the game's limit of 10; the lowest-value
  // officer is dismissed (one a week, cleanly) when he is worth less than his
  // retainer or the week-end forecast cannot meet the bill; no hire within
  // POLICE_REHIRE_WEEKS of a dismissal; officers are paid already (fixed cost).
  const illegalBlocks = new Set(buildingList(w).filter((b) => b.ownerGangId === gang.id && b.cls === 'illegal' && b.state !== 'destroyed').map((b) => claimOf(b.blockId)));
  const ourOfficers = police.filter((p) => p.employedBy === gang.id);
  const retainers = ourOfficers.reduce((sum, p) => sum + p.weeklyRetainer, 0);
  const beatOf = (p: Person) => { const at = blockAtPos(w, p.pos); return at == null ? null : claimOf(at); };
  const coveredBeats = new Set(ourOfficers.map(beatOf).filter((b): b is number => b != null && illegalBlocks.has(b)));
  const policeWeeks = Math.max(1, Math.min(POLICE_VALUE_WEEKS, w.week - 1));
  const sceneArrests = memberLosses(w, gang.id, w.week - POLICE_VALUE_WEEKS).filter((l) => l.week < w.week && /arrested at the scene/.test(l.cause));
  const scenePerWeek = sceneArrests.length / policeWeeks;
  // 1.2.53 (Robert): every police arrest counts, not only those at the scene —
  // each paid officer is taken to cut the other police arrests by
  // PATROL_ARREST_CUT (proposed), like the 0.04 at a crime scene.
  // 1.2.54 (Robert): the street arrests expected at today's opinion (above), or the record if higher.
  const patrolPerWeek = Math.max(forwardStreet, recentPolice.filter((l) => !/arrested at the scene/.test(l.cause)).length / policeWeeks);
  /** Scene arrests a week on each illegal block; on a covered beat, what it would be without its officer (×4). */
  const beatArrests = (block: number) => sceneArrests.filter((l) => l.pos && blockAtPos(w, l.pos) != null && claimOf(blockAtPos(w, l.pos)!) === block).length / policeWeeks * (coveredBeats.has(block) ? 4 : 1);
  const sharedShare = ourOfficers.length < POLICE_LIMIT ? 0.04 : 0;
  /** What one officer saves a week: his 0.04 share of scene arrests, and three quarters of his beat's if it is an illegal block. */
  const officerValue = (beat: number | null) => Math.round((0.04 * scenePerWeek + PATROL_ARREST_CUT * patrolPerWeek + (beat != null && illegalBlocks.has(beat) ? 0.75 * beatArrests(beat) : 0)) * scale.A);
  const uncoveredBeats = [...illegalBlocks].filter((b) => !coveredBeats.has(b)).sort((a, b) => beatArrests(b) - beatArrests(a));
  const nextValue = Math.round((sharedShare * scenePerWeek + (sharedShare > 0 ? PATROL_ARREST_CUT * patrolPerWeek : 0) + (uncoveredBeats.length ? 0.75 * beatArrests(uncoveredBeats[0]) : 0)) * scale.A);
  const freeOfficers = police.filter((p) => p.employedBy == null);
  const quotes = freeOfficers.map((p) => (standardRules(w) ? originalRetainerQuote(p, gang.id) : Math.round(120 + p.skills.intelligence * 40))).sort((a, b) => a - b);
  const nextRetainer = quotes.length ? quotes[Math.floor(quotes.length / 2)] : 0;
  actions.push(`POLICE value: ${scenePerWeek.toFixed(2)} scene + ${patrolPerWeek.toFixed(2)} other police arrests a week (last ${policeWeeks} wk) × A $${scale.A}; ${ourOfficers.length} paid (${ourOfficers.map((p) => `${p.name} $${officerValue(beatOf(p))} vs $${p.weeklyRetainer}`).join(', ') || 'none'}); one more worth $${nextValue} vs a retainer of about $${nextRetainer}`);
  // 1.2.54 (Robert): an officer is dismissed only after POLICE_LOW_WEEKS weeks below his retainer.
  for (const id of [...plog.low.keys()]) if (!ourOfficers.some((p) => p.id === id)) plog.low.delete(id);
  for (const p of ourOfficers) { if (officerValue(beatOf(p)) < p.weeklyRetainer) plog.low.set(p.id, (plog.low.get(p.id) ?? 0) + 1); else plog.low.delete(p.id); }
  if (ourOfficers.length && mem.policeDismissWeek !== w.week) {
    const least = [...ourOfficers].sort((a, b) => (officerValue(beatOf(a)) - a.weeklyRetainer) - (officerValue(beatOf(b)) - b.weeklyRetainer) || a.id - b.id)[0];
    const leastValue = officerValue(beatOf(least));
    if (!spendStop && leastValue < least.weeklyRetainer && (plog.low.get(least.id) ?? 0) < POLICE_LOW_WEEKS) actions.push(`NOTE police: ${least.name} worth $${leastValue} against his $${least.weeklyRetainer} retainer for ${plog.low.get(least.id) ?? 0} week(s) — kept until ${POLICE_LOW_WEEKS}`);
    else if (spendStop || leastValue < least.weeklyRetainer) {
      // 1.2.53: read before the dismissal, which clears the retainer (the line printed $0).
      const retainer = least.weeklyRetainer, beat = beatOf(least);
      const result = dismissPoliceOfficer(w, gang.id, least.id);
      if (result.ok) mem.policeDismissWeek = w.week;
      logResult(actions, `POLICE dismissed ${least.name} (worth $${leastValue} a week against his $${retainer} retainer; beat block ${beat ?? 'none'}) — ${spendStop ? "the week-end forecast cannot meet the week's bill" : `the lowest-value officer, worth less than his retainer for ${plog.low.get(least.id) ?? 0} weeks`}; one officer a week`, result.ok, result.ok ? result.message ?? '' : result.error);
    }
  }
  const onPayroll = police.filter((p) => p.employedBy === gang.id).length;
  const sinceDismissal = mem.policeDismissWeek != null ? w.week - mem.policeDismissWeek : Infinity;
  const beats = uncoveredBeats.slice(0, 6);
  /** Why no officer may be hired this week, or null when one may. */
  const policeHireBlock = !lawyer ? 'no lawyer'
    : spendStop ? 'the week-end forecast is under the week\'s bill'
    : sinceDismissal < POLICE_REHIRE_WEEKS ? `an officer was dismissed ${sinceDismissal} week(s) ago (no rehire for ${POLICE_REHIRE_WEEKS})`
    : onPayroll >= POLICE_LIMIT ? `${onPayroll} officers already (the game's limit is ${POLICE_LIMIT})`
    : !beats.length ? 'every illegal-business block of ours has its officer'
    : null;
  /** Put the officers on the illegal-business blocks on the payroll, when the rules allow. */
  const hirePolice = (why: string) => {
    if (policeHireBlock) { actions.push(`NOTE police payroll (${onPayroll} officers, retainers $${retainers}/week): no new officer — ${policeHireBlock}`); return; }
    // 1.2.52 (Robert): a spend for the cash pass — one more officer's weekly value ÷ his retainer.
    want({ immediate: true, label: `police payroll: ${beats.length} beat(s)`, kind: 'police', cost: nextRetainer, ret: nextRetainer > 0 ? nextValue / nextRetainer : 0, why: `one more officer worth $${nextValue} a week against a retainer of about $${nextRetainer}`, run: () => {
      const result = specialistVisit('employPolice', null, beats, POLICE_LIMIT - onPayroll);
      logResult(actions, `lawyer puts the police on our ${beats.length} illegal-business block(s) on the payroll — ${why} (${onPayroll} already paid, retainers $${retainers}/week)`, result.ok, result.ok ? result.message ?? '' : result.error);
      return result.ok;
    } });
  };
  // Hostile police take any of our men on sight: a paid officer makes no arrests.
  hirePolice(policeHostile ? 'the police are hostile' : 'officers on our illegal-business blocks');
  // 1.2.41 (Robert): the mayor is bought whenever he is hostile and we can afford him.
  // 1.2.52 (Robert): a spend for the cash pass at its 1.2.51 return.
  if (lawyer && mayorFit.ratio > 0) {
    const mayor = mayorBand === 'hostile' ? buyable(w.mayorId, 1) : buyable(w.mayorId, 0.3);
    if (mayor) want({ immediate: true, label: `lawyer bribes ${mayor.name} (mayor)`, kind: 'bribe', cost: mayorFit.cost, ret: mayorFit.ratio, why: mayorFit.why, run: () => {
      const result = specialistVisit('bribeOfficials', mayor.id);
      logResult(actions, `lawyer bribes ${mayor.name} (mayor: fewer police on the patch)`, result.ok, result.ok ? result.message ?? '' : result.error);
      return result.ok;
    } });
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
      const outbidFit = scoreBribe('outbid for the chief', chiefBenefit, offer, chiefWhy);
      actions.push(`BRIBES ${bribeLine(outbidFit)}`);
      if (outbidFit.ratio > 0 && !refusesBribe(chief, gang.id)) {
        chiefPaid = true;
        want({ label: 'outbid for the chief', kind: 'bribe', cost: offer, ret: outbidFit.ratio, why: outbidFit.why, run: () => { propose({ label: 'outbid for the chief', kind: 'safety', value: 5000 + gang.suspicion * 10, why: `${w.gangs[rivalId].name} bought him — we offer $${offer} (120%)`, teams: crew ? [crew, ...ready.filter((t) => t !== crew)] : undefined,
          input: (team) => ({ type: 'bribe', personId: chief.id, opts: { manpower: manpowerFor(team, 2), amount: offer, ...sharp(team) } as IssueOrderInput['opts'] }) }); return true; } });
      } else {
        const exp = ready.find((t) => roles.get(t.id) === 'expendables');
        actions.push(`NOTE the chief is bought by ${w.gangs[rivalId].name}; 120% ($${offer}) is ${refusesBribe(chief, gang.id) ? 'refused — he is too hostile' : `beyond our $${Math.round(gang.cash)}`} — ${exp ? 'an Expendable kill of the chief is considered' : 'no Expendables crew for a kill'}`);
        if (exp) propose({ label: `kill the police chief ${chief.name}`, kind: 'violence', value: 1500, why: `bought by ${w.gangs[rivalId].name} and we cannot outbid`, teams: [exp],
          input: (team) => ({ type: 'kill', personId: chief.id, opts: { manpower: manpowerFor(team, 2) } }) });
      }
    }
  }
  const crewChiefFit = scoreBribe('chief by a crew', chiefBenefit, bribeSum(400) * chiefBribes, chiefWhy);
  if (!chiefPaid && crewChiefFit.ratio > 0) {
    const chief = w.people[w.policeChiefId];
    if (chief && chief.status === 'active' && chief.bribedBy !== gang.id && !refusesBribe(chief, gang.id)) {
      const crew = bribeCrew();
      want({ label: 'bribe chief (crew)', kind: 'bribe', cost: bribeSum(400), ret: crewChiefFit.ratio, why: crewChiefFit.why, run: () => { propose({ label: 'bribe chief', kind: 'safety', value: (policeHostile ? 5000 : 1200) + gang.suspicion * 10, why: `the chief is cooling (${chiefOpinion}${crackdownNamed ? ', crackdown' : ''})${policeHostile ? ', the police are hostile' : ''}`, teams: crew ? [crew, ...ready.filter((t) => t !== crew)] : undefined,
        input: (team) => ({ type: 'bribe', personId: chief.id, opts: { manpower: manpowerFor(team, 2), amount: bribeSum(400), ...sharp(team) } as IssueOrderInput['opts'] }) }); return true; } });
    }
  } else if (!chiefPaid && chiefNow?.bribedBy !== gang.id) actions.push(`NOTE police chief not paid — ${bribeLine(crewChiefFit)}`);
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
      let budget = Math.min(gang.cash - 20000, aboveReserve());
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
  // The mayoral campaign (1.2.20): the blocks the election asks for, a business
  // of our own across them (our own manager is never hostile at the poll),
  // gentle collecting so the shopkeepers stay friendly, a Teamsters business
  // (behind a trade union for full weight), and the cash to fund the race.
  const campaign = goal === 'office' && w.options.mode === 'normal';
  /** 1.2.51: new blocks the campaign may push for this week (the intimidation room; unlimited until counted). */
  let campaignBlockRoom = Infinity;
  if (campaign) actions.push(`NOTE campaign: ${territoryCount(w, gang.id)} of ${blocksNeeded} blocks${w.election.active ? `, election under way (${w.election.weeksLeft} weeks left)` : ''}${campaignUpkeep ? `; $${campaignUpkeep} of campaign upkeep in the cash need` : ''}`);

  const spend = (key: PlayStrategy['priority'][number]) => {
    if (key === 'hiring') {
      // 1.2.25 (Robert's rule): recruiting runs every week — to fill any crew
      // below the most it can hold, and with every crew full to find better
      // men to swap in. Nothing holds it back: not wages or profit, not men
      // waiting in the pool, not lying low, not blocks gained. Managers never count.
      const men = crewMen();
      // 1.2.55 (Robert): no 'the Business crew has room' trigger — a hire is
      // worth the man value of the best open seat (below). The Expendables crew
      // is never recruited for.
      const crewRoom = gang.teamIds.length === 0 || crewsOf().some((team) => roles.get(team.id) !== 'expendables' && team.memberIds.length < MAX_TEAM_SIZE - 1);
      const floor = goal === 'territory' ? CREW_CAPACITY : Math.max(18, Math.round(10 + weight.hiring * 12), Math.min(60, Math.round(territoryCount(w, gang.id) * 2)));
      if (hoodSites.length) {
        // 1.2.45 (Robert): the venues with the biggest weekly top-up first
        // (docks and the labour exchange before gyms and pool halls); no cap on
        // venues — each recruit order takes as many as fit its man's week. One
        // man per crew (one in all with every crew full); below
        // RECRUIT_EVERY_MAN men, every free man gets a recruit order.
        const sites = [...hoodSites].sort((a, b) => weeklyHoodSupply(w, b) - weeklyHoodSupply(w, a));
        if (recruitMemory.yieldedIds.includes(sites[0].id)) actions.push('NOTE recruit: last week\'s productive venues first');
        else if (recruitMemory.hintIds.includes(sites[0].id)) actions.push('NOTE recruit following last week\'s tip');
        const everyMan = men < RECRUIT_EVERY_MAN;
        if (everyMan) actions.push(`NOTE recruit: ${men} men, below ${RECRUIT_EVERY_MAN} — a recruit order for every free man`);
        const recruiters = ready.filter((t) => (t !== bizCrew || !ready.some((o) => o !== bizCrew)) && !outOfTime.has(t.id) && roles.get(t.id) !== 'expendables')
          .sort((a, b) => Number(roles.get(b.id) === 'recruit') - Number(roles.get(a.id) === 'recruit') || crewFreeMinutes(w, b) - crewFreeMinutes(w, a) || a.id - b.id);
        // 1.2.45 (Robert): the recruit crew gets a car so more stops fit its week.
        const recruitCrew = recruiters.find((t) => roles.get(t.id) === 'recruit');
        if (recruitCrew && !Object.values(recruitCrew.vehicles).some((n) => n > 0)) {
          // 1.2.52 (Robert): a spend for the cash pass, priced by the recruiting minutes it saves.
          const car = carReturn('recruit', VEHICLES.coupe.cost, sites.length);
          want({ immediate: true, label: `car for the recruit crew (${w.people[recruitCrew.lieutenantId]?.name ?? recruitCrew.name})`, kind: 'car', cost: VEHICLES.coupe.cost, ret: car.ret, why: car.why, run: () => {
            const result = buyVehicle(w, gang.id, 'coupe', recruitCrew.id);
            logResult(actions, `recruit crew: a car for ${w.people[recruitCrew.lieutenantId]?.name ?? recruitCrew.name} (more venues fit its week)`, result.ok, result.ok ? '' : result.error);
            return result.ok;
          } });
        }
        const hands = recruiters.flatMap((team) => {
          const frees = crewLoads(w, team).map((load) => MINUTES_PER_WEEK - load).filter((m) => m >= MIN_FREE_MINUTES).sort((a, b) => b - a);
          return (everyMan ? frees : frees.slice(0, 1)).map((free) => ({ team, free }));
        });
        const takers = everyMan || crewRoom ? hands : hands.slice(0, 1);
        // 1.2.47 (Robert, replaces 1.2.46's net cap): hood hires only while
        // the cash covers three weeks of our men's asks and upkeep plus three
        // weeks of each new man's ask (our hoods' and lieutenants' average ask):
        // hires ≤ (cash − 3 × (asks + upkeep)) ÷ (3 × a new man's ask). None in a
        // week spending stopped, for 3 weeks after a week that sacked for wages,
        // nor after that until the cash is back above the reserve. Below
        // RECRUIT_EVERY_MAN men the 1.2.45 rule stands. A stop that finds people
        // signs at least one, so the stops are capped at the hires.
        const asks = members.filter((p) => p.role === 'hood' || p.role === 'lieutenant').map((p) => p.payDemand);
        const newWage = asks.reduce((sum, a) => sum + a, 0) / asks.length;
        // 1.2.52 (Robert, replaces 1.2.47's three-weeks-of-asks count): a hire
        // is a spend — (marginal V − wage) × LASTING_WEEKS ÷ the hiring cost,
        // where marginal V is V while a crew has a seat or the spares are short
        // and 0 otherwise. Recruiting runs only then, while that return is at
        // least λ, for at most the hires wanted (seats + spares short).
        const seats = crewsOf().filter((t) => rolesNow().get(t.id) !== 'expendables').reduce((sum, t) => sum + Math.max(0, MAX_TEAM_SIZE - 1 - t.memberIds.length), 0) + (gang.teamIds.length === 0 ? 1 : 0);
        // 1.2.53 (Robert): office defenders count as spares short only once the
        // crews hold DEFENDER_SPARES_MIN_MEN men (proposed); before that they
        // inflated the hires wanted to 35–80 with 5 men in the gang.
        const sparesShort = Math.max(0, sparesWanted - (men >= DEFENDER_SPARES_MIN_MEN ? 0 : defendersWanted) - idlePool().length);
        const hiresWanted = seats + sparesShort;
        // 1.2.55 (Robert): a hire is worth the man value of the best open seat —
        // what the men of a crew with a seat earn on average in its job — or,
        // with every crew full, the 1.2.54 spare value (V while spares are short).
        const seatEarn = crewsOf().filter((t) => rolesNow().get(t.id) !== 'expendables' && t.memberIds.length < MAX_TEAM_SIZE - 1).map((t) => {
          const job = rolesNow().get(t.id) ?? null;
          const ms = t.memberIds.map((id) => w.people[id]).filter((m): m is Person => !!m);
          return ms.length && job ? ms.reduce((n, m) => n + manValue(m, job, manCtx, MINUTES_PER_WEEK).earn, 0) / ms.length : scale.V;
        });
        const hireValue = seats > 0 ? Math.max(seatEarn.length ? Math.max(...seatEarn) : scale.V, 0) : sparesShort > 0 ? scale.V : 0;
        mem.hireValue = hireValue > 0 ? hireValue : scale.V;
        const recruitRet = scale.hire > 0 ? (hireValue - newWage) * LASTING_WEEKS / scale.hire : 0;
        // 1.2.53 (Robert, fixes 1.2.52's λ at the cost of every hire at once):
        // each hire is weighed on its own — λ at the cash left after it — and
        // hires go on while the return still beats λ.
        let byCash = 0;
        while (byCash < hiresWanted && recruitRet >= holdValue(gang.cash - bribesDue - scale.hire * (byCash + 1), cashReserve, avgPay, scale)) byCash++;
        const recruitLambda = holdValue(gang.cash - bribesDue - scale.hire * Math.max(1, byCash), cashReserve, avgPay, scale);
        actions.push(`NOTE recruit fitness: ${seats} crew seat(s) + ${sparesShort} spare(s) short; return ${recruitRet.toFixed(2)}/$ ((${hiresWanted > 0 ? `${seats > 0 ? 'best open seat' : 'spare V'} $${Math.round(hireValue)}` : 'no seat or spare short: $0'} − wage $${Math.round(newWage)}) × ${LASTING_WEEKS} wk ÷ hire $${scale.hire}) vs λ ${recruitLambda.toFixed(2)} — ${byCash} stop(s)`);
        const sackWeek = mem.wageSackWeek;
        const cooling = sackWeek != null && w.week - sackWeek <= HIRE_COOLDOWN_WEEKS;
        const awaitingReserve = sackWeek != null && !cooling && gang.cash < reserveNeed;
        if (sackWeek != null && !cooling && !awaitingReserve) mem.wageSackWeek = undefined;
        let stopsLeft = spendStop || cooling || awaitingReserve ? 0 : everyMan ? Infinity : byCash;
        actions.push(`NOTE recruit: ${spendStop ? `none — spending and hiring stopped (week-end forecast under the wages)${sackedForWages ? `, ${sackedForWages} sacked` : ''}` : cooling ? `none — sacked for wages in week ${sackWeek}, no hiring for ${HIRE_COOLDOWN_WEEKS} weeks after` : awaitingReserve ? `none — since the sacking in week ${sackWeek}, not until the cash ($${Math.round(gang.cash)}) is back above the $${reserveNeed} reserve` : everyMan ? `below ${RECRUIT_EVERY_MAN} men, no cap` : `${byCash > 0 ? `up to ${byCash} hire(s)` : 'none'} by the recruit fitness; last week's net at full asks $${Math.round(weeklyNet)}`}`);
        const left = [...sites];
        for (let k = 0; k < takers.length && left.length && stopsLeft > 0; k++) {
          const { team, free } = takers[k];
          const key = ledgerKey('recruit', Object.values(team.vehicles).some((n) => n > 0));
          // No figure in the ledger yet: the venues are shared evenly (the game trims an order to what fits).
          const n = Math.min(stopsLeft, timeLedger[key] == null ? Math.ceil(left.length / (takers.length - k)) : targetsThatFit(timeLedger, key, left.length, free));
          if (n < 1) continue;
          stopsLeft -= n;
          const stops = planRoute(origin, left.splice(0, n).map((b) => ({ item: b, ...w.lots[b.lotId].center }))).map((s) => s.item.id);
          propose({ label: `recruit (${stops.length} stop${stops.length > 1 ? 's' : ''})`, kind: 'men', role: 'recruit', teams: [team, ...recruiters.filter((t) => t !== team)],
            input: { type: 'recruit', buildingIds: stops, opts: { manpower: 1 } },
            value: Math.max(men < floor || shrinking ? 4000 : 200, Math.round(Math.max(0, hireValue - newWage) * LASTING_WEEKS)) * stops.length, why: `hire worth ($${Math.round(hireValue)} − wage $${Math.round(newWage)}) × ${LASTING_WEEKS} wk; ${men} men${men < floor ? ` (below ${floor})` : ''}${crewRoom ? ', a crew has room' : ', crews full — better men to swap in'}; ${team.name}'s man with ${Math.round(free)} min free` });
        }
        if (!takers.length) actions.push('NOTE recruit: no free man in a crew that can recruit this week');
      } else {
        actions.push(`NOTE no hiring place to try: every known venue came up empty ${EMPTY_VENUE_STREAK} weeks running and no rumour points at one`);
      }
    }
    if (key === 'rackets') {
      // Collect: the owed shops, split evenly over the crews, nearest first.
      // Campaigning, a shopkeeper close to refusing is left alone this week:
      // a refusal makes him hostile, and hostility costs votes.
      const payer = (b: Building) => { const id = b.ownerPersonId ?? b.managerId; return id == null ? undefined : w.people[id]; };
      const owedAll = protectedBuildings(w, gang.id).filter((b) => b.state === 'trading').sort(nearer);
      const owedReach = owedAll.filter((b) => !dangerBlocks.has(claimOf(b.blockId)));
      if (owedReach.length < owedAll.length) actions.push(`NOTE collect: ${owedAll.length - owedReach.length} shop(s) in rival-held or rival-sighted blocks not collected this week`);
      // 1.2.50 (Robert): while campaigning, collecting goes on (a shop left
      // uncollected loses fear, which turns its vote); only a shopkeeper who
      // would refuse outright and grow more hostile is skipped.
      const refusesOutright = (b: Building) => { const p = payer(b); return !!p && p.status === 'active' && effectiveHostility(p, gang.id) >= COLLECT_REFUSAL_HOSTILITY; };
      const owed = campaign ? owedReach.filter((b) => !refusesOutright(b)) : owedReach;
      // 1.2.51 (Robert): the count of shops skipped at 180+ hostility, every week.
      const hot180 = owedReach.filter(refusesOutright);
      if (campaign && hot180.length) skippedAt180 += hot180.length;
      actions.push(`SKIPPED ${campaign ? hot180.length : 0} shop(s) at ${COLLECT_REFUSAL_HOSTILITY}+ hostility ($${Math.round(hot180.reduce((n, b) => n + (b.protection?.weekly ?? 0), 0))} owed)${campaign ? ' — not collected from this week (they would refuse and grow more hostile)' : hot180.length ? ` — ${hot180.length} at that hostility still called on (no campaign)` : ''}; ${skippedAt180} skipped this run`);
      // 1.2.25 (B4, B9): grievances and refusals read every week; a sore
      // shopkeeper is eased while campaigning or while our popularity is below zero.
      {
        const refusedLast = w.lastWeekOrders.filter((o) => o.gangId === gang.id && o.type === 'extort').reduce((n, o) => n + (o.refusals?.length ?? 0), 0);
        const sorest = owedAll.filter((b) => (b.protection?.grievance ?? 0) >= 1).length;
        if (refusedLast || sorest) actions.push(`B4 protection: ${refusedLast} refusal(s) last week, ${sorest} paying shop(s) with a grievance; popularity ${Math.round(gang.popularity)}${w.election.active ? ', election under way' : ''}`);
      }
      // 1.2.50 (Robert): the 75% rate cut is gone (a rate change moves no vote
      // under the Standard election). While campaigning, the shopkeepers we
      // protect who resent us are leaned on in our reluctant blocks (average
      // voter value 64–163) to bring those blocks under 64.
      if (campaign && w.week >= 4) {
        const city = originalElectionCity(w), slot = originalElectionSlot(w, gang.id);
        if (city && slot != null) {
          const reluctant = territoryBlocks(w, gang.id).map((block) => ({ block, avg: originalBlockVoterAverage(city.blocks[block.id], slot) }))
            .filter((x): x is { block: Block; avg: number } => x.avg != null && x.avg >= RESENTFUL_HOSTILITY && x.avg < VOTE_LOST_AVERAGE)
            .sort((a, b) => a.avg - b.avg || a.block.id - b.block.id);
          // 1.2.51 (Robert): ranked by voters gained per crew minute. A block's
          // support moves by its average drop ÷ 100 while reluctant, and to a
          // whole vote once its average falls under the kept line; each cowed
          // shopkeeper takes 32 off his own value (÷ the block's voters).
          const stopMinutes = Math.max(10, timeLedger[ledgerKey('intimidate', false)] ?? CAMPAIGN_STOP_MINUTES);
          const leans = reluctant.map(({ block, avg }) => {
            const shops = owedAll.filter((b) => claimOf(b.blockId) === claimOf(block.id) && isValidAreaTarget(w, gang.id, 'intimidate', b) && resentsGang(w, gang.id, b));
            const voters = Math.max(1, originalBlockVoterCount(city.blocks[block.id], slot));
            const after = avg - 32 * shops.length / voters;
            const gain = after < RESENTFUL_HOSTILITY ? 1 - (VOTE_LOST_AVERAGE - avg) / 100 : (avg - after) / 100;
            const crewMinutes = shops.length * stopMinutes * 2;
            return { block, avg, shops, voters, gain, crewMinutes, perMinute: crewMinutes > 0 ? gain / crewMinutes : 0 };
          }).filter((x) => x.shops.length).sort((a, b) => b.perMinute - a.perMinute || a.block.id - b.block.id);
          // No new-block push without the intimidation to keep up: room for
          // new blocks is the Intimidation crews' free man-time in block leans,
          // less the reluctant blocks already waiting.
          const intimidationMinutes = ready.filter((t) => roles.get(t.id) === 'intimidation').reduce((n, t) => n + crewFreeMinutes(w, t), 0);
          const leanMinutes = leans.length ? leans.reduce((n, x) => n + x.crewMinutes, 0) / leans.length : stopMinutes * 2 * 2;
          campaignBlockRoom = Math.max(0, Math.floor(intimidationMinutes / leanMinutes) - reluctant.length);
          actions.push(`CAMPAIGN intimidation: ${hm(intimidationMinutes)} Intimidation man-time free ÷ ${hm(leanMinutes)} a block = ${Math.floor(intimidationMinutes / leanMinutes)} block(s); ${reluctant.length} reluctant waiting → room for ${campaignBlockRoom} new block(s)`);
          let put = 0;
          for (const { block, avg, shops, voters, gain, crewMinutes } of leans) {
            if (put >= CAMPAIGN_INTIMIDATE_BLOCKS) break;
            put++;
            propose({ label: `campaign: lean on ${shops.length} resentful shopkeeper(s) in block ${block.id}`, kind: 'territory', value: 600, role: 'intimidation',
              why: `reluctant block (average voter value ${avg} of ${voters} voters, kept under ${RESENTFUL_HOSTILITY}) — +${gain.toFixed(2)} vote for ${hm(crewMinutes)} crew time (${(gain / crewMinutes * 600).toFixed(3)} votes per 10 crew hours)`,
              input: (team) => ({ type: 'intimidate', buildingIds: shops.map((b) => b.id), opts: { manpower: manpowerFor(team, 2) } }) });
          }
          actions.push(`NOTE campaign: ${reluctant.length} reluctant block(s) of ours (voter value ${RESENTFUL_HOSTILITY}–${VOTE_LOST_AVERAGE - 1}); ${put} put forward for intimidation`);
        }
      }
      // 1.2.50 (Robert, proposed): rates raised where it is safe — one step to
      // 150% on shops still at 100%, grievance under 0.4 and the owner's opinion
      // at −20 or better; never while campaigning or under the FBI cap. No rule
      // of Auto's lowers a rate any more, so nothing undoes it.
      if (!campaign && !fbiCap && w.week >= 4) {
        const safe = owedAll.filter((b) => {
          const pr = b.protection!, owner = b.ownerPersonId != null ? w.people[b.ownerPersonId] : undefined;
          return pr.weekly === pr.base && pr.grievance < RAISE_GRIEVANCE_BELOW && !!owner && (owner.opinion[gang.id] ?? 0) >= RAISE_OPINION_FROM && owedReach.includes(b) && !pr.refusing;
        }).slice(0, RAISE_SHOPS_PER_WEEK);
        if (safe.length) {
          const gain = safe.reduce((sum, b) => sum + Math.round(b.protection!.base * (RAISE_LEVEL - 1)), 0);
          propose({ label: `raise protection to ${Math.round(RAISE_LEVEL * 100)}% at ${safe.length} shop(s), +$${gain}/week`, kind: 'money', value: gain, role: 'collect',
            why: `grievance under ${RAISE_GRIEVANCE_BELOW}, opinion ${RAISE_OPINION_FROM} or better, no campaign, no FBI cap`,
            input: { type: 'adjustProtection', buildingIds: safe.map((b) => b.id), opts: { manpower: 1, protectionLevel: RAISE_LEVEL } } });
        }
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
          actions.push(`NOTE suspicion ${Math.round(gang.suspicion)}: collecting ${kept.length} of ${owed.length} shops ($${Math.round(collectBudget - room)} of $${Math.round(owed.reduce((sum, b) => sum + (b.protection?.weekly ?? 0), 0))}) — FBI cap $${Math.round(collectBudget)}`);
        }
        // 1.2.44 (Robert): one 1-man collect route per free man of each crew,
        // in different areas (each route starts from the best-paying shop
        // left and takes the nearest that fit that man's week), until every
        // owed shop is covered. The old cap of twice the even share is gone.
        const crewsForCollect = ready.filter((t) => (t !== bizCrew || bizCollects) && !outOfTime.has(t.id))
          .sort((a, b) => Number(roles.get(b.id) === 'collect') - Number(roles.get(a.id) === 'collect') || crewFreeMinutes(w, b) - crewFreeMinutes(w, a) || a.id - b.id);
        let routes = 0, routedStops = 0;
        /** 1.2.53: the routes put forward, ranked by protection fitness before any police cut. */
        const routeProps: { p: Proposal<Team>; fit: number }[] = [];
        for (const team of crewsForCollect) {
          if (!left.length) break;
          const hasCar = Object.values(team.vehicles).some((n) => n > 0);
          const manFree = crewLoads(w, team).map((load) => MINUTES_PER_WEEK - load).filter((m) => m >= MIN_FREE_MINUTES).sort((a, b) => b - a);
          for (const free of manFree) {
            if (!left.length) break;
            // 1.2.52 (Robert): no route longer than the crew's cap; the stops left go to the next free man or crew.
            const fit = Math.min(routeCap.get(team.id) ?? Infinity, Math.max(1, targetsThatFit(timeLedger, ledgerKey('collectProtection', hasCar), left.length, free) || 1));
            const seed = left.shift()!;
            left.sort((a, b) => dist(centre(a), centre(seed)) - dist(centre(b), centre(seed)));
            const group = [seed, ...left.splice(0, fit - 1)];
            left.sort((a, b) => perMinute(b) - perMinute(a));
            const route = planRoute(origin, group.map((b) => ({ item: b, ...centre(b) }))).map((s) => s.item);
            const takings = route.reduce((sum, b) => sum + (b.protection?.weekly ?? 0), 0);
            routes += 1; routedStops += route.length;
            const routeFit = collectFitness(w, route); shadow.push({ label: `collect (${route.length} stops)`, old: Math.max(100, takings), fit: routeFit });
            routeProps.push({ fit: routeFit, p: { label: `collect (${route.length} stops, $${Math.round(takings)})`, kind: 'money', value: Math.max(100, takings), role: 'collect', why: `protection owed — route ${routes}, ${team.name}'s man with ${hm(free)} free; fitness Δ${routeFit} (shadow)`,
              teams: [team, ...crewsForCollect.filter((t) => t !== team)], input: { type: 'collectProtection', buildingIds: route.map((b) => b.id), opts: { manpower: 1 } } } });
          }
        }
        // 1.2.53 (Robert): with the police opinion under POLICE_CRIME_OPINION
        // (proposed) every collection is a crime they answer with arrests; the
        // POLICE_CRIME_CUT share (proposed) of routes with the lowest protection
        // fitness is dropped so the opinion stops falling.
        const policeCut = policeOpinion < POLICE_CRIME_OPINION ? Math.floor(routeProps.length * POLICE_CRIME_CUT) : 0;
        const byFit = [...routeProps].sort((a, b) => a.fit - b.fit);
        for (const r of byFit.slice(policeCut)) propose(r.p);
        if (policeCut) actions.push(`NOTE collect: police opinion ${Math.round(policeOpinion)} under ${POLICE_CRIME_OPINION} — ${policeCut} of ${routeProps.length} route(s) with the lowest protection fitness dropped (${Math.round(POLICE_CRIME_CUT * 100)}%): ${byFit.slice(0, policeCut).map((r) => r.p.label).join('; ')}`);
        if (left.length) actions.push(`NOTE collect: ${routes} route(s) put forward; ${left.length} owed shop(s) left over — no free man left in any crew`);
        // 1.2.51 (Robert): cars for the collectors — with shops left over, a
        // Protection crew with fewer than COLLECT_CARS cars gets a coupe (one a
        // week) while the cash stays above the reserve.
        const carCrew = left.length ? crewsForCollect.find((t) => roles.get(t.id) === 'collect' && Object.values(t.vehicles).reduce((n, v) => n + v, 0) < COLLECT_CARS) : undefined;
        if (carCrew) {
          // 1.2.52 (Robert): a spend for the cash pass, priced by the collecting minutes it saves.
          const car = carReturn('collectProtection', VEHICLES.coupe.cost, left.length + routedStops);
          want({ immediate: true, label: `coupe for ${w.people[carCrew.lieutenantId]?.name ?? 'crew'}'s Protection crew`, kind: 'car', cost: VEHICLES.coupe.cost, ret: car.ret, why: car.why, run: () => {
            const got = buyVehicle(w, gang.id, 'coupe', carCrew.id);
            logResult(actions, `CAR coupe bought for ${w.people[carCrew.lieutenantId]?.name ?? 'crew'}'s crew — ${left.length} owed shop(s) left over (up to ${COLLECT_CARS} cars a Protection crew)`, got.ok, got.ok ? '' : got.error);
            return got.ok;
          } });
        }
      }
      // Expand. 1.2.23: past SUSPICION_EASE no new rackets at all (protection
      // money is what the Bureau cannot explain); lying low below it, one crew
      // half the crews take new blocks only.
      // 1.2.55 (Robert): the one hard guard — no new extortion while even one more site would take the projected FBI total past 200.
      const suspicionHigh = !!heatState && fbiGuard(heatState, heatState.protectionPerSite);
      if (suspicionHigh && weight.rackets >= 0.25) actions.push(`NOTE FBI guard: one more extorted site would take the projected FBI total past ${FBI_CASE_THRESHOLD} — no extortion; legal buys and the accountant instead`);
      // 1.2.37 (Robert): the strongest Intimidation crew takes the far and
      // hostile shops. Each extortion group is ranked by how hard it is (sites
      // whose owner refused us first, then the farthest from the office); the
      // hardest group asks first for the strongest Intimidation crew (most
      // intimidation stars), the next for the next strongest, and so on.
      const extortGroups: { p: Proposal<Team>; group: Building[] }[] = [];
      // 1.2.50 (Robert): stage 2, shadow mode — each extortion's fitness (chance
      // × weekly protection × weeks expected) is logged beside its old value.
      const extortCrew = ready.filter((t) => t !== bizCrew).sort((a, b) => Number(roles.get(b.id) === 'intimidation') - Number(roles.get(a.id) === 'intimidation') || crewFreeMinutes(w, b) - crewFreeMinutes(w, a) || a.id - b.id)[0];
      const extortMen = extortCrew ? crewPeople(w, extortCrew).sort((a, b) => b.skills.intimidation - a.skills.intimidation || a.id - b.id).slice(0, 2) : [];
      // 1.2.55 (Robert): replaces the extort brake. A new site is worth its value
      // × the collection rate × the share of its collect stops the Protection
      // crews have spare time for (their free man-minutes less what the shops we
      // already protect take, at the minutes a collect stop takes).
      const protNow = protectionWeek(w, gang.id, w.week - 1);
      const extortRate = protNow.claimed > 0 ? collectionRate : 1;
      const perCollectStop = timeLedger[ledgerKey('collectProtection', false)] ?? timeLedger[ledgerKey('collectProtection', true)];
      const protSpare = Math.max(0, ready.filter((t) => roles.get(t.id) === 'collect').reduce((n, t) => n + crewFreeMinutes(w, t), 0) - protNow.shops * (perCollectStop ?? 0));
      let protSpareLeft = protSpare;
      const proposeExtort = (group: Building[], p: Proposal<Team>) => {
        const need = perCollectStop != null ? group.length * perCollectStop : 0;
        const timeShare = need > 0 ? Math.max(0, Math.min(1, protSpareLeft / need)) : 1;
        protSpareLeft = Math.max(0, protSpareLeft - need);
        p = { ...p, value: Math.round(p.value * extortRate * timeShare), why: `${p.why ?? ''}; × ${Math.round(extortRate * 100)}% collected × ${Math.round(timeShare * 100)}% of its collect stops in the Protection crews' spare time` };
        if (extortMen.length) {
          // 1.2.51 (Robert): scaled by our collection rate — a shop we do not collect from is worth nothing.
          const fit = Math.round(collectionRate * group.reduce((sum, b) => sum + extortFitness(rollChance(extortMen, ['intimidation'], extortDifficulty(w, gang.id, b, buildingDoor(w, b))), protectionBase(w, b)), 0));
          shadow.push({ label: `extort ${group.length} site(s)`, old: p.value, fit });
          p = { ...p, why: `${p.why ?? ''}; fitness Δ${fit} (shadow, ${extortCrew!.name}'s odds × ${Math.round(collectionRate * 100)}% collected)` };
        }
        extortGroups.push({ p, group }); propose(p);
      };
      if (weight.rackets >= 0.25 && !suspicionHigh) {
        const crewsToSend = Math.max(1, Math.round(ready.length * Math.min(1, expansion)));
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
          const deepen = valid.filter((b) => blockIsOurs(b.blockId)).sort(nearer);
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
                value: (mark === 'new block' ? 900 + 250 * (group.length - 1) : 200 + 60 * (group.length - 1)), why: marked,
                input: (team) => ({ type: 'extort', buildingIds: group.map((g) => g.id), opts: { manpower: manpowerFor(team, 2) } }) });
            }
          };
          // 1.2.51 (Robert): no new-block push past the intimidation room.
          if (campaign && newBlock.length > campaignBlockRoom) {
            actions.push(`NOTE campaign: new-block extortion held to ${campaignBlockRoom} of ${newBlock.length} — no new block without the intimidation to keep it`);
            newBlock.splice(campaignBlockRoom);
          }
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
          let groups = 0;
          // 1.2.25 (B3): the blocks with fewest police first (the nearest among equals, as listed).
          const blockOrder = [...byBlock.keys()].sort((x, y) => (w.blocks[x]?.policePresence ?? 0) - (w.blocks[y]?.policePresence ?? 0));
          for (const blockId of blockOrder) {
            const sites = byBlock.get(blockId)!;
            if (groups >= crewsToSend) break;
            groups++;
            const group = sites.slice(0, cap);
            const mark = blockIsOurs(blockId) ? 'already ours' : 'new block';
            proposeExtort(group, { label: `extort ${group.length} site(s), ${mark}`, kind: mark === 'new block' ? 'territory' : 'money', role: 'intimidation',
              value: (mark === 'new block' ? 700 + 200 * (group.length - 1) : 300 + 80 * (group.length - 1)), why: group.map((g) => `${g.typeId} ${g.id}`).join(', '),
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
      if (weight.rackets >= 0.45 && policy.illegal) {
        const owned = buildingList(w).filter((b) => b.ownerGangId === gang.id && b.state === 'trading');
        const lands = owned.filter((b) => b.cls === 'empty' && w.lots[b.lotId]?.index === 4);
        let budget = Math.min(gang.cash * 0.5, aboveReserve());
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
      // 1.2.52 (Robert): a spend for the cash pass, priced like the chief's other bribes.
      const amount = bribeSum(Math.round(200 + weight.bribes * 800));
      const fit = scoreBribe('chief (strategy)', chiefBenefit, amount * chiefBribes, chiefWhy);
      if (chief && chief.status === 'active' && chief.bribedBy !== gang.id && !chiefPaid && gang.cash > gate && fit.ratio > 0 && !refusesBribe(chief, gang.id)) {
        const crew = bribeCrew();
        chiefPaid = true;
        want({ label: 'bribe chief (strategy)', kind: 'bribe', cost: amount, ret: fit.ratio, why: fit.why, run: () => { propose({ label: 'bribe', kind: 'safety', value: 500, why: 'the police chief is cooling', teams: crew ? [crew, ...ready.filter((t) => t !== crew)] : undefined,
          input: (team) => ({ type: 'bribe', personId: chief.id, opts: { manpower: manpowerFor(team, 2), amount, ...sharp(team) } as IssueOrderInput['opts'] }) }); return true; } });
      }
    }
    // Legal takings weigh against protection money in the Bureau's sums, so
    // a suspicious gang buys shops whatever the strategy's buying weight.
    // While suspicion is up, legal cover comes before saving for a racket.
    if (legalPush) savingFor.delete(w);
    const saving = savingFor.get(w);
    if (key === 'buying' && saving && gang.cash < saving.cost * 1.5) {
      actions.push(`NOTE saving toward a ${saving.name} ($${saving.cost}) — no other premises this week`);
    } else if (key === 'buying' && w.week >= 4 && (weight.buying >= 0.3 || legalPush)) {
      const coverFirst = legalPush;
      const gate = coverFirst ? 3000 : 8000 + (1 - weight.buying) * 8000;
      const fraction = coverFirst ? 0.75 : 0.15 + weight.buying * 0.5;
      if (gang.cash > gate) {
        const sites = buildingList(w).filter((b) => {
          const cost = BUILDING_BY_ID[b.typeId]?.cost ?? 0;
          return b.ownerGangId == null && b.state === 'trading' && cost > 0 && cost < gang.cash * fraction;
        }).sort(nearer);
        // Legal takings cover the money the Bureau cannot explain: worth more while suspicion is up.
        if (sites.length) planBuy(legalPush ? 'buy (premises takings vs office takings)' : 'buy', sites, undefined, (b) => (BUILDING_BY_ID[b.typeId]?.profit ?? 0) * (coverFirst ? 12 : 4), undefined, Math.min(gang.cash * fraction, aboveReserve()));
        else if (coverFirst) actions.push(`NOTE no legal premises for sale under $${Math.round(gang.cash * fraction)}`);
      }
    }
    if (key === 'violence' && w.week >= 8 && policy.violence !== 'low' && (weight.violence >= 0.45 || policy.violence === 'high')) {
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
    // 1.2.52 (Robert): the cash need R (its week's bill and campaign upkeep
    // included) and the bribes booked are kept; what is above is spare, and
    // every spend of it goes through the cash pass.
    const keep = cashReserve + bribesDue;
    actions.push(`NOTE reserve $${keep.toLocaleString('en-US')} (${spendStop ? 'all the cash — spending stopped this week' : `the cash need $${reserveNeed.toLocaleString('en-US')} + bribes booked $${Math.round(bribesDue).toLocaleString('en-US')}`}); $${Math.max(0, Math.round(gang.cash - keep)).toLocaleString('en-US')} to reinvest`);
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
      // 1.2.45 (Robert): the cover a front gives is the game's coverQuality for
      // this racket. Our first illegal business goes behind a 0.95 front, the
      // second behind 0.7 or better, the rest behind the best front there is.
      const racketsNow = buildingList(w).filter((b) => b.ownerGangId === gang.id && b.cls === 'illegal' && b.typeId !== 'office' && b.state !== 'destroyed').length;
      const minCover = racketsNow === 0 ? COVER_FIRST : racketsNow === 1 ? COVER_SECOND : 0;
      const cover = (b: Building) => coverQuality(racket.id, b.typeId);
      const canFront = (b: Building) => b.cls !== 'empty' && b.cls !== 'illegal' && b.cls !== 'municipal' && !b.isHQ && cover(b) >= minCover;
      const fronts = buildingList(w).filter((b) => b.ownerGangId === gang.id && b.state !== 'destroyed' && b.hidesId == null && canFront(b)).sort((a, b) => cover(b) - cover(a) || union(a) - union(b) || nearer(a, b));
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
      const front = (racketId === 'teamsters' ? forSale((b) => b.typeId === 'tradeUnion' && canFront(b) && freeCentre(b)) : undefined)
        ?? buildingList(w).filter((b) => b.ownerGangId == null && b.state === 'trading' && canFront(b) && freeCentre(b) && price(b) > 0 && price(b) <= spareCash)
          .sort((a, b) => cover(b) - cover(a) || nearer(a, b))[0];
      if (!front) actions.push(`NOTE ${racket.name}: no front for sale with cover ${minCover ? `${minCover} or better` : 'of any grade'} (our illegal businesses: ${racketsNow})`);
      return buy(`a front for a ${racket.name.toLowerCase()} (cover ${front ? cover(front) : '-'}):`, front) ? 'front' as const : 'none' as const;
    };
    // 1.2.46 (Robert): the racket a block can take — the next racket in line
    // (a still or a press first, then a speakeasy to pour the liquor), else the
    // best-paying racket per dollar — behind our best front in that block whose
    // cover meets the 1.2.45 grade for our next illegal business.
    const racketCount = () => buildingList(w).filter((b) => b.ownerGangId === gang.id && b.cls === 'illegal' && b.typeId !== 'office' && b.state !== 'destroyed').length;
    const coverNeeded = (n: number) => n === 0 ? COVER_FIRST : n === 1 ? COVER_SECOND : 0;
    const racketChoices = () => {
      const producing = ownsType('moonshineStill') || ownsType('counterfeitPress');
      const next = !producing ? ['moonshineStill', 'counterfeitPress'] : ownsType('moonshineStill') && !ownsType('speakeasy') ? ['speakeasy'] : [];
      const paying = ILLEGAL_TYPES.filter((t) => t.profit > 0 && t.cost > 0 && !NOT_AUTO_RACKETS.has(t.id)).sort((a, b) => b.profit / b.cost - a.profit / a.cost).map((t) => t.id);
      return [...next, ...paying.filter((id) => !next.includes(id))].map((id) => BUILDING_BY_ID[id]).filter((t): t is NonNullable<typeof t> => !!t);
    };
    const canFrontAny = (b: Building) => b.ownerGangId === gang.id && b.cls !== 'empty' && b.cls !== 'illegal' && b.cls !== 'municipal' && !b.isHQ && b.state !== 'destroyed' && b.hidesId == null;
    /** The racket and front for a block at the cover our nth illegal business needs (cost ignored when budget is Infinity). */
    const racketFor = (blockId: number, n: number, budget: number) => {
      const centre = centreOf(blockId);
      const fronts = buildingList(w).filter((b) => b.blockId === blockId && canFrontAny(b) && (!centre || b.id !== centre.id));
      for (const t of racketChoices()) {
        if (t.cost > budget) continue;
        const front = fronts.filter((f) => coverQuality(t.id, f.typeId) >= coverNeeded(n)).sort((a, b) => coverQuality(t.id, b.typeId) - coverQuality(t.id, a.typeId) || a.id - b.id)[0];
        if (front) return { type: t, front };
      }
      return undefined;
    };
    // 1.2.46 (Robert): a racket set-up goes ahead of the surplus buys in the
    // Business crew's queue — one per ready block (our empty centre lot and a
    // good enough front of ours there) each week.
    if (spareCash > 0 && policy.illegal) {
      const centres = buildingList(w).filter((b) => b.ownerGangId === gang.id && b.cls === 'empty' && b.state !== 'destroyed' && w.lots[b.lotId]?.index === CENTRE_LOT && !b.discovered && b.fbiClosedWeek == null);
      let n = racketCount();
      const set: string[] = [];
      for (const centre of centres) {
        const pick = racketFor(centre.blockId, n, spareCash);
        if (!pick) continue;
        const got = planBuy(`racket first: ${pick.type.name} behind ${pick.front.typeId} (cover ${coverQuality(pick.type.id, pick.front.typeId)}) on`, [centre],
          () => ({ type: 'setUpBusiness', buildingIds: [centre.id], opts: { manpower: 1, businessTypeId: pick.type.id, frontBuildingId: pick.front.id } }),
          () => pick.type.profit * 4, () => pick.type.cost, Infinity, true);
        if (!got.length) continue;
        spareCash -= pick.type.cost; n++;
        set.push(`${pick.type.name} in block ${centre.blockId}`);
      }
      if (centres.length) actions.push(`NOTE rackets: ${centres.length} empty centre lot(s) of ours; ${set.length ? `put forward first — ${set.join(', ')}` : 'none with a good enough front and the cash'}`);
    }
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
      if (!ownsType('teamsters') && territoryCount(w, gang.id) >= blocksNeeded * 0.5) behind('teamsters');
    }
    if (!policy.illegal) savingFor.delete(w);
    if (spareCash > 0 && policy.illegal) {
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
      if (team && (team.vehicles.truck ?? 0) === 0 && spendOk(VEHICLES.truck.cost)) {
        const result = buyVehicle(w, gang.id, 'truck', team.id);
        logResult(actions, `reinvest: buy truck for ${w.people[team.lieutenantId]?.name ?? 'crew'} to export`, result.ok, result.ok ? '' : result.error);
      }
      if (team && (team.vehicles.truck ?? 0) > 0) propose({ label: 'export the surplus', kind: 'money', value: 800, why: `${stocked.length} warehouse(s) full`, teams: [team], input: { type: 'export', buildingIds: [stocked[0].id], opts: { manpower: 1 } } });
    }
    // 1.2.45 (Robert): weak, the cash goes to men first — the
    // attack crew's missing shotguns and rifles (bought for its store below) are
    // kept back from the reinvesting; no land and no new blocks are bought.
    // 1.2.49 (Robert): only while land is frozen (LAND_FREEZE_KILLS by one gang in LAND_FREEZE_WEEKS weeks, or heavy-loss defence).
    /** 1.2.45: land put forward this week — no new blocks bought until it is ours. */
    let landFirst = false;
    if (landFreeze) {
      const gunsWanted = attackCrew ? (['shotgun', 'rifle'] as const).reduce((sum, g) => sum + Math.max(0, attackCrew.memberIds.length + 1 - (attackCrew.weapons[g] ?? 0) - (kept[g] ?? 0)) * WEAPONS[g].cost, 0) : 0;
      spareCash -= gunsWanted;
      actions.push(`NOTE land frozen (${freezer ? `${freezer.name} killed ${killsOfUs(freezer, w.week - LAND_FREEZE_WEEKS).length} of ours in ${LAND_FREEZE_WEEKS} weeks` : 'heavy-loss defence'}): no land or new blocks bought this week${gunsWanted ? `; $${gunsWanted.toLocaleString('en-US')} kept back for the attack crew's guns` : ''}`);
    } else {
      // 1.2.45 (Robert): strong, land before new blocks — the empty lots in
      // blocks where we own a business, centre lots first (the only place for
      // an illegal business), then the others for legal businesses; cheapest
      // first, while the cash above the reserve covers them. Lots add no territory.
      const ourBizBlocks = new Set(buildingList(w).filter((b) => b.ownerGangId === gang.id && b.cls !== 'empty' && b.state !== 'destroyed').map((b) => b.blockId));
      // 1.2.46 (Robert): a centre lot only where we own a front good enough for our next illegal business.
      const nextN = racketCount();
      const lotUseful = (b: Building) => w.lots[b.lotId]?.index !== CENTRE_LOT || (policy.illegal && !!racketFor(b.blockId, nextN, Infinity));
      const lots = buildingList(w).filter((b) => b.cls === 'empty' && b.ownerGangId == null && b.state !== 'destroyed' && ourBizBlocks.has(b.blockId) && lotUseful(b))
        .sort((a, b) => Number(w.lots[b.lotId]?.index === CENTRE_LOT) - Number(w.lots[a.lotId]?.index === CENTRE_LOT) || buildingValue(w, a) - buildingValue(w, b) || a.id - b.id);
      const affordable: Building[] = [];
      let room = spareCash;
      for (const lot of lots) {
        const cost = buildingValue(w, lot);
        if (cost > room) break;
        affordable.push(lot); room -= cost;
      }
      if (lots.length) {
        const got = planBuy('land in our block:', affordable, undefined, undefined, (b) => buildingValue(w, b), spareCash);
        landFirst = got.length > 0;
        spareCash -= got.reduce((sum, b) => sum + buildingValue(w, b), 0);
        actions.push(`NOTE land: ${lots.length} empty lot(s) for sale in blocks where we own a business (${lots.filter((b) => w.lots[b.lotId]?.index === CENTRE_LOT).length} centre); ${got.length} put forward this week`);
      }
    }
    // Anything still spare buys the best-paying legal premises within reach.
    // 1.2.22: first the business crew sets up a business on land we own, then
    // it buys — premises and empty lots, best value per dollar, sized to its week.
    const setUpOn = owned().concat(buildingList(w).filter((b) => b.ownerGangId === gang.id && b.state !== 'destroyed' && b.cls === 'empty'))
      .filter((b, i, all) => all.indexOf(b) === i && b.cls === 'empty' && w.lots[b.lotId]?.index !== 4 && !b.discovered && b.fbiClosedWeek == null);
    // 1.2.25 (B2, last profit and stock): a kind of business ours lost money on last week is not set up again.
    // 1.2.50: charity premises always cost money and are not counted as losing.
    const losing = new Set(owned().filter((b) => !b.isHQ && b.lastProfit < 0 && b.cls !== 'charity').map((b) => b.typeId));
    if (losing.size) actions.push(`B2 business: lost money last week — ${[...losing].join(', ')}; not set up again this week`);
    const bestType = (cash: number) => ESTABLISHABLE_TYPES.filter((t) => t.cost > 0 && t.cost <= cash && t.profit > 0 && !losing.has(t.id)).sort((a, b) => b.profit / b.cost - a.profit / a.cost)[0];
    // 1.2.50 (Robert): charity premises on our own land — a soup kitchen
    // before a campaign beside our blocks that lean against us, a clothing
    // bank when loyalty or recruiting is tight. One of each at a time.
    {
      const ownsCharity = (typeId: string) => buildingList(w).some((b) => b.ownerGangId === gang.id && b.typeId === typeId && b.state !== 'destroyed');
      const near = (site: Building, blockId: number) => {
        const a = w.blocks[site.blockId], b = w.blocks[blockId];
        return Math.abs(a.gx - b.gx) <= 1 && Math.abs(a.gy - b.gy) <= 1;
      };
      // 1.2.51 (Robert, low priority): with no empty non-centre lot of ours
      // where it is wanted, our weakest legal business there (not the HQ, not
      // a front, not on a centre lot) is shut down and the charity set up on it.
      const charitySetUp = (typeId: 'soupKitchen' | 'clothingBank', sites: Building[], why: string, fits: (b: Building) => boolean = () => true) => {
        const type = BUILDING_BY_ID[typeId];
        if (type.cost > spareCash) { actions.push(`NOTE charity: ${type.name.toLowerCase()} wanted (${why}) — $${type.cost.toLocaleString('en-US')} not spare`); return; }
        let site = sites.find((b) => setUpOn.includes(b));
        if (!site) {
          const weakest = owned().filter((b) => !b.isHQ && b.hidesId == null && b.frontId == null && b.typeId !== 'office' && ['commercial', 'industrial', 'tenement'].includes(b.cls)
            && w.lots[b.lotId]?.index !== 4 && fits(b)).sort((a, b) => a.lastProfit - b.lastProfit || a.id - b.id)[0];
          if (!weakest) { actions.push(`NOTE charity: ${type.name.toLowerCase()} wanted (${why}) — no land of ours and no legal business of ours to convert`); return; }
          const was = weakest.typeId, profit = weakest.lastProfit;
          const shut = shutdownBuilding(w, gang.id, weakest.id);
          logResult(actions, `charity: shut down our weakest legal business ${was} #${weakest.id} ($${Math.round(profit)} last week) to set up a ${type.name.toLowerCase()} on it`, shut.ok, shut.ok ? '' : shut.error);
          if (!shut.ok) return;
          setUpOn.push(weakest);
          site = weakest;
        }
        const land = site;
        if (planBuy(`set up ${type.name.toLowerCase()} (${why}) on our land:`, [land], () => ({ type: 'setUpBusiness', buildingIds: [land.id], opts: { businessTypeId: typeId } }),
          () => 1000, () => type.cost).length) {
          spareCash -= type.cost;
          setUpOn.splice(setUpOn.indexOf(land), 1);
        }
      };
      const city = campaign ? originalElectionCity(w) : null, slot = campaign ? originalElectionSlot(w, gang.id) : null;
      if (city && slot != null && !ownsCharity('soupKitchen')) {
        const leaning = territoryBlocks(w, gang.id).filter((block) => {
          const avg = originalBlockVoterAverage(city.blocks[block.id], slot);
          return avg != null && avg >= RESENTFUL_HOSTILITY && avg < VOTE_LOST_AVERAGE;
        });
        if (leaning.length) charitySetUp('soupKitchen', setUpOn.filter((b) => leaning.some((block) => near(b, block.id))).sort(nearer), `campaign: ${leaning.length} block(s) lean against us`, (b) => leaning.some((block) => near(b, block.id)));
      }
      const men = gangMembers(w, gang).filter((p) => p.role !== 'boss');
      const shaky = men.filter((p) => p.loyalty < ORIGINAL_DESERTION_LOYALTY + LOYALTY_TIGHT_MARGIN).length;
      const dry = mem.dryRecruitWeeks ?? 0;
      if ((shaky > 0 || dry >= 1) && !ownsCharity('clothingBank')) {
        charitySetUp('clothingBank', [...setUpOn].sort(nearer), shaky ? `${shaky} man/men within ${LOYALTY_TIGHT_MARGIN} loyalty of deserting` : `recruit runs empty ${dry} week(s)`);
      }
    }
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
      const candidates = buildingList(w).filter((b) => b.ownerGangId == null && b.state !== 'destroyed' && price(b) > 0 && price(b) <= spareCash && near(b) && ((!landFreeze && !landFirst) || blockIsOurs(b.blockId)) &&
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
  // 1.2.47 (Robert): cars and guns keep the one reserve too (was $2,500 + $60 a man).
  const reserve = cashReserve;
  if (w.week >= 2) {
    const owed = protectedBuildings(w, gang.id);
    const reach = owed.length ? owed.reduce((sum, b) => sum + dist(w.lots[b.lotId].center, origin), 0) / owed.length : 0;
    // About six trips out and back a week per crew.
    const saved = Math.round(carMinutesSaved(reach, WALK_SPEED, DRIVE_SPEED, 12));
    const carless = ready.filter((team) => !Object.values(team.vehicles).some((n) => n > 0));
    if (carless.length && saved >= 120 && gang.cash > reserve + VEHICLES.coupe.cost) {
      const team = carless.sort((a, b) => crewFreeMinutes(w, a) - crewFreeMinutes(w, b))[0];
      const result = buyVehicle(w, gang.id, 'coupe', team.id);
      logResult(actions, `buy car for ${w.people[team.lieutenantId]?.name ?? 'crew'} (saves about ${hm(saved)} a week, average run ${(reach / 54).toFixed(1)} blocks)`, result.ok, result.ok ? '' : result.error);
    } else if (carless.length) {
      actions.push(`NOTE no car bought: a car would save about ${hm(saved)} a week`);
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
    if (noHitOn(target.ownerGangId)) { const line = `HQ ATTACK not made on ${owner?.name ?? 'a rival'}'s HQ: going straight and they are at war with us`; actions.push(line); noteDevDesk(line); return; }
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
        noteDevDesk(`NOTE HQ attack on ${owner?.name}'s HQ (building ${target.id}): ${order?.type ?? '?'} by ${w.people[team.lieutenantId]?.name ?? 'crew'} with ${hm(crewFreeMinutes(w, team))} man-time of the week left after it, tommy ${team.weapons.tommy ?? 0}, explosives ${team.weapons.explosives ?? 0} — given`);
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
  if (armed && suspects.size && policy.violence !== 'low' && !(() => { const b = w.buildings[[...suspects.keys()][0]]; const owner = b ? buildingMapIntel(b, gang.id).ownerGangId : null; return !!b && (noHitOn(owner) || notTarget(owner)); })()) {
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
  // 1.2.52 (Robert, replaces 1.2.25's cash − reserve − $20,000 above $50,000):
  // the free cash is the cash above the need R and the bribes booked; any of it
  // opens the surplus spends, each of which still has to pass the cash pass.
  const surplusCash = Math.round(gang.cash - cashReserve - bribesDue);
  const surplus = surplusCash > 0;
  // Equipping keeps its own threshold (Robert: leave it for now): near-full crews and $30k, or $100k.
  const equipSurplus = (crewMen() >= CREW_CAPACITY * 0.85 && surplusCash > 30000) || surplusCash > 100000;
  const hqPriority = (g: Gang) => surplus ? powerRating(w, g) : goal === 'territory' ? -powerRating(w, g) : powerRating(w, g) / Math.max(1, knownMen(g));
  // 1.2.48 (Robert): under threat, the highest-threat gang is the priority rival and its HQ the only one struck.
  const priorityRival = topThreat ?? [...liveRivals].sort((a, b) => hqPriority(b) - hqPriority(a))[0];
  const rivalHQs = knownRivalHQs(w, gang).sort((a, b) => hqPriority(w.gangs[b.ownerGangId!]) - hqPriority(w.gangs[a.ownerGangId!]));
  // 1.2.49 (Robert): an HQ is struck only when its gang is the highest threat or at war/aggression with us (every HQ strike path).
  const hqStrikeOk = (gangId: number | null | undefined) => gangId != null && (gangId === topThreat?.id || ['war', 'aggression'].includes(gang.known[gangId] ?? 'peace'));
  const hqTarget = rivalHQs.find((b) => hqStrikeOk(b.ownerGangId));
  if (hqTarget) { const line = `NOTE HQ: ${w.gangs[hqTarget.ownerGangId!].name}'s HQ known (building ${hqTarget.id}, block ${hqTarget.blockId})${rivalHQs.length > 1 ? `; ${rivalHQs.length} rival HQs known` : ''}`; actions.push(line); noteDevDesk(line); }
  else if (rivalHQs.length) actions.push(`NOTE HQ: ${rivalHQs.length} rival HQ(s) known (${rivalHQs.map((b) => w.gangs[b.ownerGangId!]?.name).join(', ')}) — none struck: not the highest threat and not at war or aggression with us`);
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
      if (!spendOk(VEHICLES.coupe.cost * 2)) break;
      const result = buyVehicle(w, gang.id, 'coupe', team.id);
      logResult(actions, `territory: a car for ${w.people[team.lieutenantId]?.name ?? 'crew'}`, result.ok, result.ok ? '' : result.error);
      if (result.ok) cars++;
    }
    // 1.2.48 (Robert): under threat, only the highest-threat gang.
    const byWeakness = (topThreat ? [topThreat] : [...liveRivals]).sort((a, b) => powerRating(w, a) - powerRating(w, b));
    const striker = muscleCrew && ready.includes(muscleCrew) ? muscleCrew : undefined;
    if (byWeakness.length && striker && w.week >= 6 && freeShare(striker) > 0.25) {
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
    const grudgeGang = grudge && grudge.until > w.week ? w.gangs[grudge.gangId] : undefined;
    if (grudge && (!grudgeGang || grudgeGang.eliminated)) retaliation.delete(w);
    // 1.2.48 (Robert): the attack and Expendables crews answer the highest-threat gang (high threat), whatever its stance.
    const enemy = topThreat && highThreat(topThreat) ? topThreat : grudgeGang;
    const enemyWhy = enemy && enemy !== grudgeGang ? `${enemy.name} is the highest threat (${threatOf.get(enemy.id) ?? 0})` : `${enemy?.name} killed our men`;
    if (enemy && !enemy.eliminated) {
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
      const why = straightNow ? 'we are going straight'
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
        propose({ label: `retaliate: kill ${victim.name} of ${enemy.name} (crew of ${knownCrew(victim)} known)`, kind: 'violence', value: 1500, why: enemyWhy, teams: fitStrikers,
          input: (team) => ({ type: 'kill', personId: victim.id, opts: { manpower: manpowerFor(team, 3) } }), onGiven });
      } else if (striker && !theirMen.length && theirSites.length) {
        const site = theirSites[0];
        const dynamite = bang(striker);
        propose({ label: `retaliate: ${dynamite ? 'bomb' : 'smash up'} ${enemy.name}'s ${site.typeId}`, kind: 'violence', value: 1500, why: enemyWhy, teams: fitStrikers,
          input: (team) => ({ type: dynamite ? 'bomb' : 'smashUp', buildingIds: [site.id], opts: { manpower: manpowerFor(team, 3) } }), onGiven });
      } else if (striker && !theirMen.length) {
        // 1.2.25: nothing of theirs on our map — scout where their men were last seen.
        const block = sightedBlocks(enemy.id)[0];
        const ids = block == null ? [] : buildingList(w).filter((b) => claimOf(b.blockId) === block && b.ownerGangId !== gang.id && b.state !== 'destroyed' && isValidAreaTarget(w, gang.id, 'explore', b))
          .sort((a, b) => (a.knowledge?.[gang.id] ?? 0) - (b.knowledge?.[gang.id] ?? 0) || nearer(a, b)).slice(0, 4).map((b) => b.id);
        if (ids.length) propose({ label: `scout block ${block} where ${enemy.name}'s men were seen`, kind: 'intel', value: 600, why: `${enemyWhy}; nothing of theirs on our map`, role: 'scout',
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
      // 1.2.49 (Robert): never while lying low, nor on a gang with no threat that offers ceasefire or better.
      const calm = (threatOf.get(g.id) ?? 0) === 0 && ['ceasefire', 'peace', 'alliance'].includes(gang.known[g.id] ?? 'peace');
      if (calm || notTarget(g.id) || noHitOn(g.id) || !strikers.length || !sites.length) {
        actions.push(`NOTE ${g.name}'s assets top ours ${ASSET_LEAD_WEEKS} weeks running — no strike: ${calm ? `no threat and it offers ${gang.known[g.id] ?? 'peace'}` : notTarget(g.id) ? `${topThreat?.name} is the highest threat` : noHitOn(g.id) ? 'at war with us while we go straight' : !strikers.length ? 'no attack or Expendables crew ready' : 'none of its banks, hotels or department stores on our map'}`);
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
      // 1.2.49 (Robert): never the guard crew.
      const patrollerAny = [armed, expCrew].filter((t): t is Team => !!t && t !== guardCrew).find((t) => t.orderIds.length === 0);
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
      // 1.2.46 (Robert): the game's donation effect stops growing at DONATION_FULL_EFFECT ÷ (1 + squalor ÷ 60)
      // dollars (the local opinion shift tops out), and goodwill stops at GOODWILL_TOP — no more than that, and only below it.
      // 1.2.50 (Robert): none while campaigning — under the Standard election a donation buys no votes.
      if (campaign && excess > 0 && pick) actions.push('NOTE campaign: no donation — it buys no votes');
      if (!campaign && excess > 0 && pick && gang.goodwill < GOODWILL_TOP) {
        const full = Math.floor(DONATION_FULL_EFFECT / (1 + squalor(pick) / 60));
        const amount = Math.min(Math.round(excess * rng.int(33, 66) / 100), full);
        // 1.2.52 (Robert): a spend for the cash pass, priced with V — a donation at
        // the full effect is worth CHARITY_V_WEEKS weeks of one man's takings (proposed).
        const label = `donate $${amount.toLocaleString('en-US')} to ${BUILDING_BY_ID[pick.typeId]?.name ?? pick.typeId} #${pick.id} (squalor ${Math.round(squalor(pick))})`;
        if (amount > 0) want({ label, kind: 'charity', cost: amount, ret: CHARITY_V_WEEKS * scale.V / Math.max(1, full), why: `V $${scale.V} × ${CHARITY_V_WEEKS} wk at the full effect $${full}`, run: () => { propose({ label, kind: 'safety', value: 300, why: 'cash above the reserve',
          input: () => ({ type: 'donate', buildingIds: [pick.id], opts: { manpower: 1, amount } as IssueOrderInput['opts'] }) }); return true; } });
      }
    }

    // 1.2.50 (Robert): a clean-up drive in our dirtiest block, when the
    // cash above the reserve pays for it and its squalor stands
    // CLEANUP_ABOVE_START above where it began. One block a week.
    {
      const excess = gang.cash - cashReserve;
      const dirty = territoryBlocks(w, gang.id)
        .filter((block) => block.squalorStart != null && block.squalor - block.squalorStart >= CLEANUP_ABOVE_START)
        .sort((a, b) => (b.squalor - b.squalorStart!) - (a.squalor - a.squalorStart!) || a.id - b.id)[0];
      if (dirty) {
        const sites = buildingList(w).filter((b) => (w.blocks[b.blockId].layout?.mergedInto ?? b.blockId) === dirty.id && b.state !== 'destroyed');
        const cost = sites.length * CLEANUP_COST_PER_SITE;
        if (cost > 0 && cost <= excess) {
          propose({ label: `clean-up drive in block ${dirty.id} (squalor ${Math.round(dirty.squalor)}, began at ${Math.round(dirty.squalorStart!)}; $${cost})`, kind: 'safety', value: 200, why: 'cash above the reserve; squalor up in our block',
            input: (team) => ({ type: 'cleanUp', buildingIds: sites.map((b) => b.id), opts: { manpower: manpowerFor(team, 2) } }) });
        } else actions.push(`NOTE clean-up: block ${dirty.id} squalor ${Math.round(dirty.squalor)} (began at ${Math.round(dirty.squalorStart!)}) — $${cost} drive, $${Math.max(0, Math.round(excess))} above the reserve`);
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
    // 1.2.53: a front hiding an illegal business is never shut down for its
    // own profit — its worth is the cover, and the game refuses to shut it
    // while the business behind it runs ("Shut the illegal business down first").
    for (const b of buildingList(w).filter((x) => x.ownerGangId === gang.id && !x.isHQ && x.typeId !== 'office' && x.cls !== 'empty' && x.hidesId == null)) {
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
    // 1.2.38 (Robert): going straight, nothing violent against a rival at war with us.
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
    const available = ACTION_KEYS.filter((key) => !(peaceful && ['torchRival', 'bombRival', 'kidnapRival', 'killRival', 'raid', 'strikeFbi', 'strikeHQ'].includes(key))).filter((key) => ({
      // 1.2.40: refusers have their own steps (above). 1.2.41: torchRival restored (a comment had swallowed it).
      raid: raidSites.length > 0, pressRefuser: false && refused.length > 0, torchRival: rivalSites.length > 0,
      bombRival: rivalSites.length > 0 && explosives, kidnapRival: rivals.length > 0, killRival: rivals.length > 0 && !!hitCrew,
      snitch: !!snitch && !snitchNothingNew && gang.snitchUsedWeek !== w.week && rivalGangs.length > 0 && gang.cash > reserve + 1500,
      // Rare and low-ranked: the FBI director, struck at his headquarters.
      strikeFbi: !!hitCrew && w.week >= 8 && w.people[w.fbiHeadId]?.status === 'active',
      // 1.2.22: a rival HQ our scouts found, struck at most every few weeks.
      strikeHQ: !!armed && !!hqTarget && !noHitOn(hqTarget.ownerGangId) && w.week >= 8 && w.week - desk.lastHqStrike >= HQ_STRIKE_GAP,
    } as Record<ActionKey, boolean>)[key]);
    const rolls = (gang.cash > reserve + 15000 ? 2 : 1) + (policy.violence === 'high' ? 1 : 0);
    const tried = new Set<ActionKey>();
    for (let n = 0; n < rolls; n++) {
      // 1.2.51 (Robert): weighted by each type's expected net (efficiency × man-minutes), not rank bumps.
      const rolled = rollByFitness(actionRanks, available.filter((k) => !tried.has(k)), (k) => { const t = ACTION_ORDER_TYPE[k]; const e = t ? expectedNet(orderBook, t) : null; return e ? e.net : null; }, rng);
      const key = rolled.key;
      if (!key) { actions.push(`ROLL none — ${rolled.why || 'nothing available'}`); break; }
      tried.add(key);
      actions.push(`ROLL ${key} (${ACTION_LABELS[key]}) — weights: ${rolled.why}`);
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
  if (policy.violence !== 'low') {
    const hqProp = proposals.find((p) => p.label.startsWith('HQ attack'));
    if (hqProp) hqProp.value = Math.max(hqProp.value, HQ_FIRST_VALUE);
    else if (hqTarget && armed && w.week - desk.lastHqStrike >= HQ_STRIKE_GAP) proposeHqStrike(hqTarget, HQ_FIRST_VALUE, `${topThreat ? 'the highest threat' : 'no threat'} — the rival HQ first (${w.gangs[hqTarget.ownerGangId!].name})`, 'strikeHQ');
    // 1.2.39 (Robert): no ambush while weak or going straight against a rival
    // at war with us — only a block where a rival we may hit was seen.
    const hittable = new Set(Object.values(w.gangs).filter((g) => g.id !== gang.id && !g.eliminated && !noHitOn(g.id) && !notTarget(g.id)).flatMap((g) => sightedBlocks(g.id)));
    const block = sightedBlocks().find((b) => hittable.has(b));
    if (block == null && sightedBlocks().length) actions.push(`NOTE no ambush: the rival men last seen belong to ${topThreat ? `gangs other than ${topThreat.name} (the highest threat)` : 'gangs at war with us while we go straight'}`);
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
    actions.push(`NOTE surplus: $${surplusCash.toLocaleString('en-US')} (cash − the need $${cashReserve.toLocaleString('en-US')} − bribes booked) — bribes, buys by the business crew, the strongest rival's HQ`);
    if (lawyer) {
      for (const [id, what, fit] of [[w.mayorId, 'mayor', mayorFit], [w.policeChiefId, 'police chief', chiefFit]] as const) {
        const o = buyable(id, 0.3);
        if (!o || fit.ratio <= 0 || cashSpends.some((c) => c.label.includes(o.name))) continue;
        // 1.2.52 (Robert): a spend for the cash pass at its 1.2.51 return.
        want({ immediate: true, label: `surplus: lawyer bribes ${o.name} (${what})`, kind: 'bribe', cost: fit.cost, ret: fit.ratio, why: fit.why, run: () => {
          const r = specialistVisit('bribeOfficials', o.id);
          logResult(actions, `surplus: lawyer bribes ${o.name} (${what})`, r.ok, r.ok ? r.message ?? '' : r.error);
          return r.ok;
        } });
        break; // one errand at a time for the lawyer
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
    if (hqTarget && armed && policy.violence !== 'low' && w.week - desk.lastHqStrike >= HQ_STRIKE_GAP && !proposals.some((p) => p.label.startsWith('HQ attack'))) {
      proposeHqStrike(hqTarget, 3000, `surplus cash; ${w.gangs[hqTarget.ownerGangId!].name} is the strongest rival we know of (power ${powerRating(w, w.gangs[hqTarget.ownerGangId!])})`, 'strikeHQ');
    } else if (!hqTarget) actions.push(`NOTE surplus: no rival HQ known yet — scouting for ${priorityRival?.name ?? 'one'}`);
    else if (!proposals.some((p) => p.label.startsWith('HQ attack'))) {
      actions.push(`HQ ATTACK not made on ${w.gangs[hqTarget.ownerGangId!].name}'s HQ: ${!armed ? 'no armed attack crew ready' : policy.violence === 'low' ? 'violence is off for this goal' : `last attack in week ${desk.lastHqStrike}, the next after ${HQ_STRIKE_GAP} weeks`}`);
    }
  }

  // ---- 1.2.52 (Robert): the one cash pass — every discretionary spend put
  // forward this week, best return per $ first, taken while its return is at
  // least λ at the cash left after it. The wage bill stays a hard floor (the
  // week-end forecast after the spends covers wages and upkeep); in a week
  // spending stopped nothing is taken.
  {
    const free = gang.cash - bribesDue;
    const bill = wageBill + upkeepLast;
    const floor = bill + plannedSpend - expectedTakings;
    const below = holdValue(-1, Infinity, avgPay, scale), above = holdValue(Infinity, 0, avgPay, scale);
    const tracked = cashSpends.map((c) => ({ ...c, run: () => { const t = { proposed: false, given: false }; spendTrack = t; try { return c.run(); } finally { spendTrack = null; spendTracks.set(c, t); } } }));
    const pass = spendStop ? { lines: cashSpends.map((c) => `${c.label} [${c.kind}] $${Math.round(c.cost)} at ${c.ret.toFixed(2)}/$ — not taken: spending stopped`), spent: 0, taken: 0, takenSet: new Set<CashSpend>() }
      : runCashPass(tracked, free, reserveNeed, floor, avgPay, scale);
    // Map the wrapped spends back to the originals for the second pass.
    firstPass = { ...pass, takenSet: new Set(tracked.flatMap((c, i) => pass.takenSet.has(c) ? [cashSpends[i]] : [])) };
    const idle = Math.max(0, free - pass.spent - reserveNeed);
    actions.push(`CASH FIT R $${need.R} (bill $${need.bill} − lowest takings of ${CASH_LOOKBACK_WEEKS} wk $${need.lowest} → shortfall $${need.shortfall}; + a week's bill $${need.bill}; + committed $${need.committed}); free cash $${Math.round(free - reserveNeed)}; λ ${below.toFixed(2)} below R, ${above.toFixed(2)} above; ${cashSpends.length} spend(s), ${pass.taken} taken for $${Math.round(pass.spent)}; idle penalty $${Math.round(idle * IDLE_PENALTY)}/wk on $${Math.round(idle)} idle (${IDLE_PENALTY * 100}% a week, proposed)${pass.lines.length ? ` — ${pass.lines.join('; ')}` : ''}`);
  }
  // 1.2.52 (Robert, proposed): MEN FIT — every man's weekly worth (autoMen.ts), the top and bottom, and the moves made.
  {
    const roleMap = rolesNow();
    const rows: { p: Person; v: ManValue }[] = [];
    for (const t of crewsOf()) {
      const job = roleMap.get(t.id) ?? null;
      const men = t.memberIds.map((id) => w.people[id]).filter((p): p is Person => !!p && p.status === 'active');
      const vals = men.map((p) => ({ p, v: manValue(p, job, manCtx, MINUTES_PER_WEEK) }));
      rows.push(...vals);
      const lt = w.people[t.lieutenantId];
      if (lt && lt.status === 'active' && lt.role !== 'boss') rows.push({ p: lt, v: manValue(lt, job, manCtx, MINUTES_PER_WEEK, { crewEarnings: vals.reduce((sum, x) => sum + x.v.earn, 0), crewSize: men.length }) });
    }
    for (const id of gang.poolIds) { const p = w.people[id]; if (p && p.status === 'active' && p.role === 'hood') rows.push({ p, v: manValue(p, null, manCtx, MINUTES_PER_WEEK, { spare: true }) }); }
    rows.sort((a, b) => b.v.net - a.v.net);
    if (rows.length) actions.push(`MEN FIT ${rows.length} men (work ${Math.round(MAN_WORK_SHARE * 100)}% of the week, proposed): top ${rows.slice(0, 3).map((r) => manLine(r.p, r.v)).join('; ')} | bottom ${rows.slice(-3).reverse().map((r) => manLine(r.p, r.v)).join('; ')}${menMoves.length ? ` | moves: ${menMoves.join('; ')}` : ' | no moves'}`);
  }

  // ---- 1.2.23: the decision. Every candidate is scored by the goal and the
  // best that fit go to the crews; the log says why each won or was not given.
  const crewName = (team: Team) => `${w.people[team.lieutenantId]?.name ?? 'crew'} (${named.get(team.id) ?? team.name})`;
  // 1.2.41 (Robert): with no cash to buy businesses (cash at or below the
  // reserve, which gates purchases) the idle business crew collects protection.
  if (bizCollects) actions.push(`NOTE business crew: no cash to buy ($${Math.round(gang.cash)} against a $${cashReserve} reserve) — it collects protection this week`);
  const slots = ready.map((team) => ({ team, name: crewName(team), role: roles.get(team.id), businessOnly: team === bizCrew,
    // 1.2.43: with no other crew ready, the business crew recruits too (the lieutenant goes himself if he must).
    alsoTakes: team === bizCrew && (bizCollects || !ready.some((t) => t !== bizCrew)) ? (p: Proposal<Team>) => (bizCollects && p.label.startsWith('collect')) || (!ready.some((t) => t !== bizCrew) && p.label.startsWith('recruit')) : undefined,
    free: () => outOfTime.has(team.id) ? 0 : freeFor(team) }));
  // 1.2.50 (Robert): stage 2 shadow — collect and extort ranked by the old
  // values and by the protection fitness, side by side (no decision changes).
  if (shadow.length) {
    const byOld = [...shadow].sort((a, b) => b.old - a.old), byFit = [...shadow].sort((a, b) => b.fit - a.fit);
    const moved = shadow.filter((x) => byOld.indexOf(x) !== byFit.indexOf(x)).length;
    actions.push(`SHADOW protection fitness: ${shadow.length} collect/extort candidates, ${moved} ranked differently — old: ${byOld.slice(0, 5).map((x) => `${x.label} ${Math.round(x.old)}`).join(', ')} | fitness: ${byFit.slice(0, 5).map((x) => `${x.label} ${x.fit}`).join(', ')}`);
  }
  /** 1.2.54: the order type and site a proposal is learned under (order completion). */
  const execKey = (p: Proposal<Team>) => {
    const fixed = typeof p.input === 'function' ? undefined : p.input;
    return { type: fixed?.type ?? (p.role ? ROLE_ORDER_TYPE[p.role] : null) ?? p.label.split(' ')[0], siteId: fixed?.buildingIds?.[0] ?? null };
  };
  const decision = decideWeek(goal, proposals, slots, (label, team, p) => {
    // 1.2.55: the order's worth (value × chance) for the crew-level heat check in give().
    { const k = execKey(p); giveWorth = scoreOf(goal, p) * execChance(exec, k.type, null, k.siteId); }
    let input = inputFor(p, team);
    const site = input.buildingIds?.[0];
    // 1.2.54 (Robert): a crew other than the Business crew takes a buy only when
    // it pays at least the crew's own work per man-minute (order fitness):
    // the site's profit × LASTING_WEEKS over the game's estimate for one man.
    if (p.kind === 'business' && team !== bizCrew && site != null) {
      const preview = previewOrder(w, gang.id, { ...input, teamId: team.id });
      const profit = BUILDING_BY_ID[input.opts?.businessTypeId ?? w.buildings[site]?.typeId ?? '']?.profit ?? 0;
      const buyRate = preview && preview.estimatedMinutes > 0 ? profit * LASTING_WEEKS / (preview.estimatedMinutes * Math.max(1, preview.opts.manpower ?? 1)) : 0;
      const ownType = ROLE_ORDER_TYPE[roles.get(team.id) ?? 'collect'];
      const ownRate = ownType ? Math.max(0, efficiency(orderBook, ownType) ?? 0) : 0;
      if (buyRate < ownRate) return { ok: false, error: `held back — ${crewName(team)}'s own work pays $${ownRate.toFixed(2)}/man-min, the buy $${buyRate.toFixed(2)}; try elsewhere` };
    }
    // 1.2.36: a hood named for a manager swap is kept off the buys — they name another hand.
    // 1.2.46 (Robert): a buyer is named only for a buy that puts a manager in (never land).
    if (p.kind === 'business' && swapCands.size && input.opts?.preferredHoodId == null && site != null && takesManager(input.type, site)) {
      const buyer = buyerFor(team);
      // 1.2.37 (Robert): when the swap hood is the only business hand, the buy
      // goes first and the swap waits until next week.
      if (!buyer) {
        for (const plan of swapPlans.filter((x) => [team.lieutenantId, ...team.memberIds].includes(x.cand.id))) {
          swapCands.delete(plan.cand.id);
          swapPlans.splice(swapPlans.indexOf(plan), 1);
          actions.push(`MANAGER SWAP waits until next week: ${plan.cand.name} for ${plan.old ? plan.old.name : 'nobody (unmanned)'} at ${plan.label} — he is the only business hand for the buy (${label}), which goes first`);
        }
        return give(label, team, input, p.kind);
      }
      input = { ...input, opts: { ...(input.opts ?? {}), preferredHoodId: buyer.id } as IssueOrderInput['opts'] };
      const result = give(label, team, input, p.kind);
      if (result.ok) buysNamed.set(buyer.id, (buysNamed.get(buyer.id) ?? 0) + 1);
      return result;
    }
    return give(label, team, input, p.kind);
  }, (p) => { const k = execKey(p); return execChance(exec, k.type, null, k.siteId); },
  // 1.2.55 (Robert): order score = value × chance − heat (gang-level measures; the crew's own in give()).
  (p) => {
    if (!heatState) return 0;
    const fixed = typeof p.input === 'function' ? undefined : p.input;
    // A built-later input (a function of the crew) gives its site count in the label ("extort 3 site(s)").
    const sites = fixed?.buildingIds?.length ?? Number(/(\d+) site/.exec(p.label)?.[1] ?? 1);
    return heatCost({ type: execKey(p).type, sites }, heatState).total;
  });
  giveWorth = undefined;
  if (heatState) {
    const men = crewsOf().flatMap((t) => [t.lieutenantId, ...t.memberIds]).map((id) => w.people[id]).filter((m): m is NonNullable<typeof m> => !!m);
    const crewTop = { wanted: men.reduce((n, m) => Math.max(n, m.wanted ?? 0), 0), fbiScore: men.reduce((n, m) => Math.max(n, m.crimeSuspicion ?? 0), 0) };
    actions.push(heatLine(heatState, crewTop, heatSpend, heatGiven));
  }
  // 1.2.53 (Robert): an order the cash pass took but no crew was given (or the
  // game refused) costs nothing this week: its cost is released, and the
  // spends paid at once that the pass turned down are weighed again with it.
  if (firstPass && !spendStop) {
    const released = cashSpends.filter((c) => firstPass!.takenSet.has(c) && spendTracks.get(c)?.proposed && !spendTracks.get(c)?.given);
    const again = cashSpends.filter((c) => c.immediate && !firstPass!.takenSet.has(c));
    if (released.length) {
      const committedNow = desk.pending.filter((p) => p.week === w.week).reduce((sum, p) => {
        const order = w.orders[p.orderId]; const b = w.buildings[p.buildingId];
        const type = order?.opts.businessTypeId ? BUILDING_BY_ID[order.opts.businessTypeId] : undefined;
        return sum + (type ? type.cost : b && p.type === 'buyPremises' ? buildingValue(w, b) : 0);
      }, 0);
      const second = again.length ? runCashPass(again, gang.cash - bribesDue - committedNow, reserveNeed, wageBill + upkeepLast + plannedSpend + committedNow - expectedTakings, avgPay, scale) : undefined;
      actions.push(`CASH FIT released $${Math.round(released.reduce((sum, c) => sum + c.cost, 0))} of ${released.length} order(s) no crew was given (${released.map((c) => c.label).join('; ')})${second ? ` — second pass: ${second.taken} taken for $${Math.round(second.spent)}${second.lines.length ? `: ${second.lines.join('; ')}` : ''}` : ''}`);
    }
  }
  // 1.2.36 (Robert): the manager swaps go out after the buys, each only when
  // the business crew still has the time for it by the game's own check.
  for (const plan of swapPlans) {
    const input: Omit<IssueOrderInput, 'teamId'> = { type: 'runBusiness', buildingIds: [plan.site.id], opts: { manpower: 1, preferredHoodId: plan.cand.id } as IssueOrderInput['opts'] };
    const label = `manager ${plan.old ? 'swap ' : ''}at ${plan.label}: ${plan.cand.name}${plan.old ? ` for ${plan.old.name}` : ' (no manager)'}`;
    const team = plan.team;
    const preview = previewOrder(w, gang.id, { ...input, teamId: team.id });
    if (!preview || !crewHasTime(w, team, preview)) { actions.push(`MANAGER SWAP waits: ${label} — ${team.name} has no time left after the buys`); continue; }
    const result = give(label, team, input, 'business');
    if (result.ok) {
      const orderId = team.orderIds[team.orderIds.length - 1];
      pendingSwaps.set(plan.site.id, { orderId, candId: plan.cand.id, oldId: plan.old ? plan.old.id : null, week: w.week });
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
      const fitsOne = () => leftover.find((p) => (team !== bizCrew || p.kind === 'business') && (!p.teams || p.teams.includes(team)) && (() => {
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
  // 1.2.54 (Robert): order completion — every proposal no crew was given, with its reason.
  for (const d of decision.skipped) {
    const p = proposals.find((x) => x.label === d.label);
    const k = p ? execKey(p) : { type: d.label.split(' ')[0], siteId: null };
    noteNotGiven(exec, w, { type: k.type, teamId: null, siteId: k.siteId, label: d.label, approved: approvedBy.get(d.label) ?? 0 }, d.reason ?? d.line);
  }
  actions.push(`DECIDE ${proposals.length} candidate orders for ${slots.length} crews (goal ${goal}): ${decision.given.length} given, ${decision.skipped.length} not`);
  for (const d of decision.given) actions.push(d.line);
  // 1.2.45 (Robert): NOT GIVEN lines sharing a reason are merged into one line with a count and the first few names.
  {
    const byReason = new Map<string, Decision[]>();
    for (const d of decision.skipped) {
      if (d.reason == null) { actions.push(d.line); continue; }
      const list = byReason.get(d.reason) ?? [];
      list.push(d);
      byReason.set(d.reason, list);
    }
    for (const [reason, list] of waitNotes) actions.push(`${reason} ×${list.length}: ${list.slice(0, NOT_GIVEN_NAMES).join('; ')}${list.length > NOT_GIVEN_NAMES ? `; and ${list.length - NOT_GIVEN_NAMES} more` : ''}`);
    for (const [reason, list] of byReason) {
      if (list.length === 1) { actions.push(list[0].line); continue; }
      const names = list.slice(0, NOT_GIVEN_NAMES).map((d) => d.label).join('; ');
      actions.push(`NOT GIVEN ×${list.length} (${reason}): ${names}${list.length > NOT_GIVEN_NAMES ? `; and ${list.length - NOT_GIVEN_NAMES} more` : ''}`);
    }
  }
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
      const reason = !slot ? (hotCrews.includes(team) ? 'resting (the lieutenant\'s street-arrest risk is high)' : 'not ready to plan')
        : hoods === 0 ? `only its lieutenant${free ? '' : ', and he is not free to plan (inside a building or busy)'}`
        : !free ? 'no man free to plan (all inside buildings or busy)'
        : outOfTime.has(team.id) || slot.free() < MIN_FREE_MINUTES ? `no time (${hm(freeFor(team))} left for the freest man)`
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
    const reason = slot.free() < MIN_FREE_MINUTES ? `its week is full (${hm(freeFor(team))} left for the freest man${outOfTime.has(team.id) ? ', refused for time' : ''})`
      : slot.businessOnly && !mine.length ? `business crew: nothing to buy or set up within $${Math.round(Math.max(0, gang.cash)).toLocaleString('en-US')} cash this week`
      : !mine.length ? 'no candidate order this week'
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
    const keep = cashReserve + bribesDue + committed;
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
    actions.push(`EQUIP surplus: $${Math.round(before - gang.cash).toLocaleString('en-US')} spent, $${Math.round(gang.cash).toLocaleString('en-US')} left (keep $${keep.toLocaleString('en-US')}: the need + bribes booked + $${Math.round(committed).toLocaleString('en-US')} for this week's buys)${counts.size ? ` — ${[...counts].map(([k, n]) => `${n}× ${k}`).join(', ')}` : ' — every crew already has seats and guns'}`);
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
    + `report ${actions.length} lines / ${Math.round(actionChars / 1024)} KB, desk ${desk.fails.size}/${desk.refusedMoves.size}, exec ${execMemory(w).tries.length}, venues ${recruitMemory.emptyStreak.size}`;
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
    buildLine(),
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
  const fitBefore = learn && !loaded.unreadable ? [...matchingEntries(loaded.diary, campaign)].reverse().find((entry) => entry.orderFitness) : undefined;
  orderBook = newOrderBook(fitBefore?.orderFitness);
  const ledgerBefore = learn && !loaded.unreadable ? [...matchingEntries(loaded.diary, campaign)].reverse().find((entry) => entry.timeLedger) : undefined;
  timeLedger = { ...(ledgerBefore?.timeLedger ?? {}) };
  const ranksAtStart = { ...actionRanks };

  const actions: string[] = [];
  const notes: string[] = [];
  const weeks: AutoTestWeek[] = [];
  /** Men lost this run, by cause and culprit. */
  const lostTally = new Map<string, number>();
  const lostOnce = new Set<number>();
  skippedAt180 = 0;
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
    resetSystemTimings();
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
    // 1.2.53: End Week can return without playing the week (the desk was busy
    // saving or loading). Planning again would only replay the same week —
    // the start of a run once spun 120 passes of week 1 and wrote two files.
    if (phase === 'planning' && sim.world.week === weekBefore) {
      const line = `FAIL End Week did not play week ${weekBefore} — the week did not advance (the desk was busy, or the city on screen is not the one tested); the run stops here`;
      actions.push(line); notes.push(line);
      break;
    }
    const weekSnap = snapshot(sim, ms);
    // 1.2.46 (Robert): where the week-end time went — the slowest systems and settlement stages; the rest is outside the sim (yields, saves).
    {
      const timed = systemTimings();
      const inSim = timed.reduce((sum, t) => sum + t.ms, 0);
      actions.push(`WEEK-END TIMING ${ms} ms: ${timed.slice(0, TIMING_LINES).map((t) => `${t.name} ${Math.round(t.ms)} ms`).join(', ')}${timed.length > TIMING_LINES ? `; ${timed.length - TIMING_LINES} more ${Math.round(timed.slice(TIMING_LINES).reduce((sum, t) => sum + t.ms, 0))} ms` : ''}; outside the sim ${Math.round(ms - inSim)} ms`);
    }
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
      // 1.2.51 (Robert): each man counts once in the tally; a man lost again
      // (released, then re-arrested) is marked and not counted twice.
      if (lostOnce.has(line.personId)) { actions.push(`${line.text} (re-arrest — already counted)`); continue; }
      lostOnce.add(line.personId);
      actions.push(line.text);
      lostTally.set(line.key, (lostTally.get(line.key) ?? 0) + 1);
    }
    actions.push(rivalKillsLine(sim.world, sim.playerGang.id, weekBefore));
    rememberRecruitResults(sim.world.lastWeekOrders.filter((order) => order.gangId === sim.playerGang.id));
    for (const pending of pendingActions) {
      const verdict = judgeAction(sim.world, sim.playerGang, pending, sim.world.lastWeekOrders);
      // 1.2.51 (Robert): order actions are ranked by order fitness and court
      // actions by bribe fitness — no rank bumps for them; the rest (the snitch,
      // the HQ strike) keep their ranks.
      const byFitness = ACTION_ORDER_TYPE[pending.key] != null || COURT_KEYS.has(pending.key);
      const rank = verdict.ok == null || byFitness ? actionRanks[pending.key] : verdict.ok ? rankUp(actionRanks, pending.key) : rankDown(actionRanks, pending.key);
      actions.push(`OUTCOME ${pending.key} ${verdict.ok == null ? 'neutral' : verdict.ok ? 'success' : 'failure'} — ${verdict.why}; ${byFitness ? `ranked by ${COURT_KEYS.has(pending.key) ? 'bribe' : 'order'} fitness (no rank change)` : `rank ${verdict.ok == null ? 'unchanged at' : 'now'} ${rank}`}`);
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
        // 1.2.53 (Robert): every actions file opens with the build and the starting conditions.
        const text = [buildLine(), `Auto Test actions, weeks ${from}–${to} (seed ${settings.seed}); the final report holds the later weeks.`, ...startingConditions(sim.world, settings.seed), '', ...block].join('\n');
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
  notes.push(`Shops skipped at ${COLLECT_REFUSAL_HOSTILITY}+ hostility: ${skippedAt180} shop-weeks.`);
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
      orderFitness: JSON.parse(JSON.stringify(orderBook.fit)) as OrderFitness,
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
