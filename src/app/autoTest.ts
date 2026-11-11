/**
 * A player made of the same actions the desk uses. The seed picks his choices
 * and, when learning is on, which weights to nudge. It does not touch the
 * city's random stream until the week itself runs.
 */
import { noteAutoTestRunning, noteAutoTestStopped, noteLastAutoTest, writeReportFile } from './debugReport';

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
import { BUY_REACH_BLOCKS, hireRecruit, issueOrder, moveToTeam, nearTerritory, promote, type ApiResult, type IssueOrderInput } from '../sim/api';
import { BUILDING_BY_ID, ILLEGAL_TYPES } from '../sim/data/buildings';
import { isValidAreaTarget } from '../sim/execution';
import type { Sim } from '../sim/sim';
import { dist, gangManpower, protectedBuildings, territoryCount } from '../sim/world';
import { buildingList } from '../sim/entityLists';
import { MINUTES_PER_WEEK } from '../sim/constants';
import { availableSpecialist } from '../sim/specialists';
import { queueSpecialistJob } from '../sim/specialistJobs';
import { bribePrice, isBribableOfficial } from '../sim/officials';
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
  /** Null runs until the city is won or lost, and stops after 40 weeks. */
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
}

const UNTIL_END_CAP = 40;

/** Share of the browser's JavaScript memory limit at which Auto Test stops between weeks. */
export const MEMORY_STOP_SHARE = 0.85;
let memoryStopped = false;

/** The browser's heap figures, where it reports them (Chrome). */
export function heapShare(): number | null {
  const memory = (globalThis.performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } } | undefined)?.memory;
  if (!memory || !memory.jsHeapSizeLimit) return null;
  return memory.usedJSHeapSize / memory.jsHeapSizeLimit;
}

/** True once, after a run that stopped because memory was nearly full. */
export function takeAutoTestMemoryStop(): boolean {
  const was = memoryStopped;
  memoryStopped = false;
  return was;
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

/** UTF-8 size without encoding a 14 MB copy of the save every week. */
function utf8Length(text: string): number {
  let bytes = text.length;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) continue;
    if (code < 0x800) bytes += 1;
    else if (code >= 0xd800 && code <= 0xdbff) { bytes += 2; i++; }
    else bytes += 2;
  }
  return bytes;
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
    saveBytes: utf8Length(JSON.stringify(sim.world)),
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
const MEN_PER_CREW = 5;

/** What last Monday learned, per city: whether the crews ran out of week. */
const lastMonday = new WeakMap<Sim['world'], { timeShort: boolean }>();

/** Suspicion at which the desk starts paying officials and easing the extortion. */
const SUSPICION_BRIBE = 40;
const SUSPICION_EASE = 50;

function crewReady(w: Sim['world'], teamId: number): boolean {
  const team = w.teams[teamId];
  const lt = team ? w.people[team.lieutenantId] : undefined;
  return !!lt && lt.status !== 'dead' && lt.status !== 'jailed' && lt.status !== 'kidnapped';
}

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

  for (const id of [...gang.recruitIds]) {
    const person = w.people[id];
    const room = crewsOf().filter((team) => team.memberIds.length < 8).sort((a, b) => a.memberIds.length - b.memberIds.length)[0];
    const result = hireRecruit(w, gang.id, id, room ? 'team' : 'pool', room?.id);
    logResult(actions, `hire ${person?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
  }

  // Enough lieutenants for the men: one crew per five hoods, at least two, at most eight.
  if (weight.hiring >= 0.2) {
    const hoods = () => gang.poolIds.length + crewsOf().reduce((sum, team) => sum + team.memberIds.length + 1, 0);
    const wanted = () => Math.min(8, Math.max(2, Math.ceil(hoods() / MEN_PER_CREW)));
    for (let tries = 0; tries < 3 && gang.teamIds.length < wanted(); tries++) {
      const fromPool = gang.poolIds.length ? rng.pick(gang.poolIds) : undefined;
      const biggest = crewsOf().filter((team) => team.memberIds.length >= 4).sort((a, b) => b.memberIds.length - a.memberIds.length)[0];
      const id = fromPool ?? biggest?.memberIds[biggest.memberIds.length - 1];
      if (id == null) break;
      const result = promote(w, gang.id, id);
      logResult(actions, `promote ${w.people[id]?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
      if (!result.ok) break;
    }
    for (const id of [...gang.poolIds]) {
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
      const id = big.memberIds[big.memberIds.length - 1];
      const result = moveToTeam(w, gang.id, id, small.id);
      logResult(actions, `to crew ${w.people[id]?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
      if (!result.ok) break;
    }
  }

  const ready = crewsOf().filter((team) => crewReady(w, team.id));
  if (!ready.length) {
    actions.push('FAIL orders — no crew');
    return actions;
  }

  const outOfTime = new Set<number>();
  const shortLastWeek = lastMonday.get(w)?.timeShort ?? false;
  let timeShort = false;
  /** The crew with the most time left this week, skipping those already given this kind of job. */
  const freest = (skip: Set<number> = new Set()) =>
    ready.filter((team) => !outOfTime.has(team.id) && !skip.has(team.id)).sort((a, b) => a.timeUsed - b.timeUsed || a.id - b.id)[0];
  const give = (label: string, team: (typeof ready)[number] | undefined, input: Omit<IssueOrderInput, 'teamId'>): ApiResult => {
    if (!team) {
      actions.push(`NOTE ${label} skipped — every crew's week is full`);
      timeShort = true;
      return { ok: false, error: 'Every crew is busy this week.' };
    }
    const name = w.people[team.lieutenantId]?.name ?? 'crew';
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
    return result;
  };
  /** Share of this crew's week still free. */
  const freeShare = (team: (typeof ready)[number]) => 1 - team.timeUsed / MINUTES_PER_WEEK;
  const manpowerFor = (team: (typeof ready)[number], most: number) => Math.max(1, Math.min(most, team.memberIds.length + 1));

  const origin = hqCenter(w, gang.id);
  const nearer = (a: { lotId: number }, b: { lotId: number }) => dist(w.lots[a.lotId].center, origin) - dist(w.lots[b.lotId].center, origin);
  const hoodSites = buildingList(w).filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === 'hood' && b.state !== 'destroyed').sort(nearer);

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
  if (w.week >= 4 && gang.lawyerId == null) {
    const desk = deskFor('lawyer');
    if (desk) give('recruit lawyer', freest(), { type: 'recruit', buildingIds: [desk.id], opts: { manpower: 1, recruitAs: 'lawyer' } });
  }

  // Police and courts. Past SUSPICION_BRIBE, or with a case open against the
  // gang, the lawyer pays the judges on those cases first, then the chief, the
  // other judges and the district attorneys; a crew pays the chief as well.
  const openCases = Object.values(w.cases ?? {}).filter((c) => c.gangId === gang.id && ['awaiting', 'onTrial'].includes(c.status));
  const hot = gang.suspicion >= SUSPICION_BRIBE || openCases.length > 0;
  if (hot) {
    const lawyer = availableSpecialist(w, gang, 'lawyer');
    if (lawyer) {
      const officials = [
        ...openCases.map((c) => c.judgeId),
        w.policeChiefId,
        ...(w.judgeIds ?? []),
        ...(w.daIds ?? []),
      ];
      const seen = new Set<number>();
      let paid = 0;
      for (const id of officials) {
        if (paid >= 4 || id == null || seen.has(id)) continue;
        seen.add(id);
        const official = w.people[id];
        if (!official || official.bribedBy === gang.id || !isBribableOfficial(official)) continue;
        if (bribePrice(w, official, gang.id) > gang.cash * 0.3) continue;
        const result = queueSpecialistJob(w, gang.id, 'bribeOfficials', id);
        logResult(actions, `lawyer bribes ${official.name}`, result.ok, result.ok ? result.message ?? '' : result.error);
        if (result.ok) paid++;
      }
    } else if (gang.lawyerId == null) {
      actions.push(`NOTE suspicion ${Math.round(gang.suspicion)} and no lawyer yet`);
    }
    const chief = w.people[w.policeChiefId];
    if (chief && chief.status === 'active' && chief.bribedBy !== gang.id && gang.cash > 1500) {
      give('bribe chief', freest(), { type: 'bribe', personId: chief.id, opts: { manpower: 1, amount: Math.round(400 + gang.suspicion * 10) } });
    }
  }
  const easing = gang.suspicion >= SUSPICION_EASE;
  if (easing) actions.push(`NOTE suspicion ${Math.round(gang.suspicion)} — extortion eased, buying legal premises`);

  const spend = (key: PlayStrategy['priority'][number]) => {
    if (key === 'hiring') {
      // More streets need more collectors: the target grows with the territory.
      // Crews that ran out of week last Monday need more men, whatever the target says.
      const base = Math.max(18, Math.round(10 + weight.hiring * 12), Math.min(60, Math.round(territoryCount(w, gang.id) * 2)));
      const target = Math.min(64, base + (shortLastWeek ? 6 : 0));
      if (gangManpower(w, gang) < target && hoodSites.length) {
        // Two sites at most, with two men: a longer list ran out of week before the last door.
        const count = Math.min(2, Math.max(1, Math.round(1 + weight.hiring)));
        const team = freest();
        give('recruit', team, { type: 'recruit', buildingIds: hoodSites.slice(0, count).map((b) => b.id), opts: { manpower: team ? manpowerFor(team, 2) : 1 } });
      } else if (hoodSites.length === 0) {
        actions.push('NOTE no hoods standing at a hiring place');
      } else {
        actions.push(`NOTE recruit held — ${gangManpower(w, gang)} men already meets the hiring target ${target}`);
      }
    }
    if (key === 'rackets') {
      // Collect: the owed shops, split evenly over the crews, nearest first.
      const owed = protectedBuildings(w, gang.id).filter((b) => b.state === 'trading').sort(nearer);
      if (w.week >= 2 && weight.rackets >= 0.2 && owed.length) {
        const share = Math.max(3, Math.ceil(owed.length / ready.length));
        const collected = new Set<number>();
        for (let i = 0; i < owed.length; i += share) {
          const team = freest(collected);
          if (!team) break;
          collected.add(team.id);
          give('collect', team, { type: 'collectProtection', buildingIds: owed.slice(i, i + share).map((b) => b.id), opts: { manpower: 1 } });
        }
      }
      // Expand: every crew takes the nearest unclaimed block at the edge of the territory.
      if (weight.rackets >= 0.25) {
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
        const cap = Math.max(2, Math.round(weight.rackets * 5));
        const crewsToSend = easing ? Math.max(1, Math.floor(ready.length / 2)) : ready.length;
        const sent = new Set<number>();
        for (const [blockId, sites] of byBlock) {
          if (sent.size >= crewsToSend) break;
          if (easing && (w.blocks[blockId]?.crimeHeat ?? 0) >= hotLine && hotLine > 0) continue;
          const team = freest(sent);
          if (!team) { timeShort = true; break; }
          // Size the area to the crew's free week: about one site per sixth of a week.
          const fit = Math.max(1, Math.min(cap, Math.floor(freeShare(team) * 6)));
          if (freeShare(team) < 0.15) { sent.add(team.id); timeShort = true; continue; }
          sent.add(team.id);
          give('extort', team, { type: 'extort', buildingIds: sites.slice(0, fit).map((b) => b.id), opts: { manpower: manpowerFor(team, 2) } });
        }
      }
      if (weight.rackets >= 0.45) {
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
          const result = give(`racket ${racket.id}`, freest(), {
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
    if (key === 'buying' && w.week >= 4 && (weight.buying >= 0.3 || easing)) {
      const gate = easing ? 3000 : 8000 + (1 - weight.buying) * 8000;
      const fraction = easing ? 0.4 : 0.15 + weight.buying * 0.5;
      if (gang.cash > gate) {
        const site = buildingList(w).filter((b) => {
          const cost = BUILDING_BY_ID[b.typeId]?.cost ?? 0;
          return b.ownerGangId == null && b.state === 'trading' && cost > 0 && cost < gang.cash * fraction && nearTerritory(w, gang.id, b.blockId, BUY_REACH_BLOCKS);
        }).sort(nearer)[0];
        if (site) give(`buy ${site.typeId}`, freest(), { type: 'buyPremises', buildingIds: [site.id] });
      }
    }
    if (key === 'violence' && w.week >= 8 && weight.violence >= 0.45) {
      const rival = buildingList(w).filter((b) => b.ownerGangId != null && b.ownerGangId !== gang.id && !b.isHQ && b.state === 'trading').sort(nearer)[0];
      if (rival) {
        const team = freest();
        if (team) give('smash', team, { type: 'smashUp', buildingIds: [rival.id], opts: { manpower: manpowerFor(team, 2) } });
      }
    }
  };

  for (const key of strategy.priority) spend(key);

  lastMonday.set(w, { timeShort });
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
    lines.push(`Week ${week.week}: cash ${week.cash} men ${week.men} territory ${week.territory} heat ${week.heat} buildings ${week.buildings} suspicion ${week.suspicion} end-week ${week.ms} ms save ${week.saveBytes} bytes`);
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
  lines.push('', 'Outcome', parts.outcome, `Score: ${parts.score}`);
  return lines.join('\n');
}

/** Run the bot, append the diary, then write 09 Reports. Returns the report text either way. */
export async function runAutoTest(sim: Sim, settings: AutoTestSettings, finish: (sim: Sim) => Promise<void> | void, sink: DiarySink = folderDiary()): Promise<string> {
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

  const actions: string[] = [];
  const notes: string[] = [];
  const weeks: AutoTestWeek[] = [];
  let flatRecruit = 0;
  let dryRecruit = 0;
  const cap = settings.weeks ?? UNTIL_END_CAP;
  autoTestRunning = true;
  stopAfterThisWeek = false;
  stoppedThisRun = false;
  emitAutoTestRun();
  try {
  for (let i = 0; i < cap; i++) {
    if (stopAfterThisWeek) { stoppedThisRun = true; notes.push('Stopped before another week. The desk is yours.'); break; }
    if (sim.world.phase !== 'planning') break;
    const menBefore = gangManpower(sim.world, sim.playerGang);
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
    weeks.push(snapshot(sim, ms));
    for (const order of sim.world.lastWeekOrders) {
      if (order.gangId !== sim.playerGang.id || order.type !== 'recruit') continue;
      const reason = order.failReason || order.results.join(' ');
      if (reason) actions.push(`RESULT ${order.type} — ${reason}`);
    }
    const men = gangManpower(sim.world, sim.playerGang);
    if (men === menBefore && sim.playerGang.poolIds.length === poolBefore && sim.playerGang.recruitIds.length === 0) flatRecruit += 1;
    else flatRecruit = 0;
    if (flatRecruit >= 2) notes.push(`Stuck: men stayed ${men} and the pool stayed empty for ${flatRecruit} weeks.`);
    if (phase === 'gameOver') break;
    if (settings.weeks == null && sim.world.outcome) break;
    // The week is saved by now. Stop before the tab runs out of memory.
    const share = heapShare();
    if (share != null && share >= MEMORY_STOP_SHARE) {
      memoryStopped = true;
      stoppedThisRun = true;
      notes.push(`Stopped: the browser's memory was ${Math.round(share * 100)}% full after week ${sim.world.week - 1}. The city is saved; reload the page before running more weeks.`);
      break;
    }
    if (stopAfterThisWeek) { stoppedThisRun = true; notes.push('Stopped after this week. The desk is yours.'); break; }
  }
  } finally {
    autoTestRunning = false;
    stopAfterThisWeek = false;
    emitAutoTestRun();
  }
  if (settings.weeks == null && !sim.world.outcome && weeks.length >= UNTIL_END_CAP) {
    notes.push(`Stopped after ${UNTIL_END_CAP} weeks with no victory or loss.`);
  }
  const odd = weeks.filter((week) => !Number.isFinite(week.cash) || !Number.isFinite(week.men) || week.cash < 0 || week.men < 0);
  for (const week of odd) notes.push(`Suspicious: week ${week.week} cash ${week.cash} men ${week.men}.`);

  const won = sim.world.outcome ? sim.world.outcome.won : null;
  const outcome = sim.world.outcome ? `${sim.world.outcome.won ? 'won' : 'lost'}: ${sim.world.outcome.reason}` : 'still playing';
  const score = scoreRun(weeks[weeks.length - 1], won);
  const previousBest = planned.previousBest;
  const beatBest = previousBest == null || score > previousBest;
  const beat = previousBest == null
    ? `Beat the previous best: yes (score ${score}, no earlier matching run).`
    : beatBest
      ? `Beat the previous best: yes (score ${score}, previous ${previousBest}).`
      : `Beat the previous best: no (score ${score}, previous ${previousBest}). The next learning run returns to the best.`;
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
    outcome, score, beat, plateau, diaryNote,
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
      score,
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
