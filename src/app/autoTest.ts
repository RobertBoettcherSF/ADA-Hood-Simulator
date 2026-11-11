/**
 * A player made of the same actions the desk uses. The seed picks his choices.
 * It does not touch the city's random stream until the week itself runs.
 */
import { writeReportFile } from './debugReport';
import { Rng } from '../sim/rng';
import { BUY_REACH_BLOCKS, hireRecruit, issueOrder, moveToTeam, nearTerritory, promote, type ApiResult, type IssueOrderInput } from '../sim/api';
import { BUILDING_BY_ID, ILLEGAL_TYPES } from '../sim/data/buildings';
import { isValidAreaTarget } from '../sim/execution';
import type { Sim } from '../sim/sim';
import { gangManpower, protectedBuildings, territoryCount } from '../sim/world';
import { buildingList } from '../sim/entityLists';

export interface AutoTestSettings {
  /** Null runs until the city is won or lost, and stops after 40 weeks. */
  weeks: number | null;
  /** Chooses the bot's actions. It does not rebuild the city. */
  seed: number;
  /** Recorded on the report. Headless weeks still run as fast as the machine allows. */
  speed: number;
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
    saveBytes: new TextEncoder().encode(JSON.stringify(sim.world)).length,
  };
}

function logResult(actions: string[], label: string, ok: boolean, detail: string): void {
  actions.push(`${ok ? 'OK' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/** One Monday at the desk, using hire, promote, and issueOrder. */
export function playAutoWeek(sim: Sim, seed: number): string[] {
  const actions: string[] = [];
  const rng = new Rng(seed + sim.world.week * 997);
  const w = sim.world;
  const gang = sim.playerGang;
  const beforeMen = gangManpower(w, gang);

  for (const id of [...gang.recruitIds]) {
    const person = w.people[id];
    const room = gang.teamIds.map((teamId) => w.teams[teamId]).find((team) => team && team.memberIds.length < 8);
    const result = hireRecruit(w, gang.id, id, room ? 'team' : 'pool', room?.id);
    logResult(actions, `hire ${person?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
  }

  if (gang.poolIds.length && gang.teamIds.length < 4 && gang.teamIds.length < 8) {
    const id = rng.pick(gang.poolIds);
    const result = promote(w, gang.id, id);
    logResult(actions, `promote ${w.people[id]?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
  }
  for (const id of [...gang.poolIds]) {
    const crew = gang.teamIds.map((teamId) => w.teams[teamId]).find((team) => team && team.memberIds.length < 8);
    if (!crew) break;
    const result = moveToTeam(w, gang.id, id, crew.id);
    logResult(actions, `to crew ${w.people[id]?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
  }

  const teamId = gang.teamIds[0];
  const team = teamId == null ? undefined : w.teams[teamId];
  if (!team) {
    actions.push('FAIL orders — no crew');
    return actions;
  }

  let timeLeft = true;
  const give = (label: string, input: IssueOrderInput): ApiResult => {
    if (!timeLeft) return { ok: false, error: 'The crew has no time left this week.' };
    const result = issueOrder(w, gang.id, input);
    logResult(actions, label, result.ok, result.ok ? result.message ?? '' : result.error);
    if (!result.ok && /time/i.test(result.error)) timeLeft = false;
    return result;
  };

  const hoodSites = buildingList(w).filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === 'hood' && b.state !== 'destroyed');
  if (gangManpower(w, gang) < 8 && hoodSites.length) {
    give('recruit', { teamId: team.id, type: 'recruit', buildingIds: hoodSites.slice(0, 2).map((b) => b.id), opts: { manpower: 1 } });
  } else if (hoodSites.length === 0) {
    actions.push('NOTE no hoods standing at a hiring place');
  }

  const owed = protectedBuildings(w, gang.id).filter((b) => b.state === 'trading').slice(0, 6);
  if (owed.length) give('collect', { teamId: team.id, type: 'collectProtection', buildingIds: owed.map((b) => b.id), opts: { manpower: 1 } });

  const extort = buildingList(w).filter((b) => isValidAreaTarget(w, gang.id, 'extort', b));
  if (extort.length) {
    const take = extort.slice(0, rng.int(1, Math.min(3, extort.length)));
    give('extort', { teamId: team.id, type: 'extort', buildingIds: take.map((b) => b.id), opts: { manpower: 1 } });
  }

  const chief = w.people[w.policeChiefId];
  if (chief && chief.status === 'active' && chief.bribedBy !== gang.id && gang.cash > 3_000) {
    give('bribe', { teamId: team.id, type: 'bribe', personId: chief.id, opts: { manpower: 1, amount: 500 } });
  }

  if (gang.cash > 12_000) {
    const site = buildingList(w).find((b) => {
      const cost = BUILDING_BY_ID[b.typeId]?.cost ?? 0;
      return b.ownerGangId == null && b.state === 'trading' && cost > 0 && cost < gang.cash * 0.4 && nearTerritory(w, gang.id, b.blockId, BUY_REACH_BLOCKS);
    });
    if (site) give(`buy ${site.typeId}`, { teamId: team.id, type: 'buyPremises', buildingIds: [site.id] });
  }

  const owned = buildingList(w).filter((b) => b.ownerGangId === gang.id && b.state === 'trading');
  const land = owned.find((b) => b.cls === 'empty' && w.lots[b.lotId]?.index === 4);
  const front = land ? owned.find((b) => b.blockId === land.blockId && b.id !== land.id && b.hidesId == null && ['commercial', 'industrial', 'tenement'].includes(b.cls)) : undefined;
  if (land && front) {
    const fit = ILLEGAL_TYPES.find((type) => type.id !== 'office' && type.cost < gang.cash * 0.5 && (type.fronts?.includes(front.typeId) || type.fronts?.includes('*')));
    const rooms = BUILDING_BY_ID.rentedRooms;
    const racket = rooms && rooms.cost < gang.cash * 0.5 && rooms.fronts?.includes(front.typeId) ? rooms : fit;
    if (racket) {
      give(`racket ${racket.id}`, {
        teamId: team.id,
        type: 'setUpBusiness',
        buildingIds: [land.id],
        opts: { manpower: 1, businessTypeId: racket.id, frontBuildingId: front.id, roomsFloors: racket.id === 'rentedRooms' ? 2 : undefined },
      });
    }
  }

  if (gangManpower(w, gang) === beforeMen && gang.poolIds.length === 0 && gang.recruitIds.length === 0 && hoodSites.length === 0) {
    actions.push('NOTE nobody hired and no hiring place');
  }
  return actions;
}

export function buildAutoTestReport(settings: AutoTestSettings, citySeed: number, weeks: AutoTestWeek[], actions: string[], notes: string[], outcome: string): string {
  const lines = [
    'Hood Simulator — auto test',
    `Strategy seed: ${settings.seed}`,
    `City seed: ${citySeed}`,
    `Weeks asked: ${settings.weeks ?? 'until victory or loss'}`,
    `Speed noted: ${settings.speed} (headless weeks still run flat out)`,
    '',
    'Timeline',
  ];
  if (!weeks.length) lines.push('(no week finished)');
  for (const week of weeks) {
    lines.push(`Week ${week.week}: cash ${week.cash} men ${week.men} territory ${week.territory} heat ${week.heat} buildings ${week.buildings} suspicion ${week.suspicion} end-week ${week.ms} ms save ${week.saveBytes} bytes`);
    lines.push(`  ${week.standings}`);
  }
  lines.push('', 'Actions');
  if (!actions.length) lines.push('(none)');
  for (const action of actions) lines.push(action);
  lines.push('', 'Notes');
  if (!notes.length) lines.push('(none)');
  for (const note of notes) lines.push(note);
  lines.push('', 'Outcome', outcome);
  return lines.join('\n');
}

/** Run the bot, then write 09 Reports. Returns the report text either way. */
export async function runAutoTest(sim: Sim, settings: AutoTestSettings, finish: (sim: Sim) => Promise<void> | void): Promise<string> {
  const actions: string[] = [];
  const notes: string[] = [];
  const weeks: AutoTestWeek[] = [];
  let flatRecruit = 0;
  let dryRecruit = 0;
  const cap = settings.weeks ?? UNTIL_END_CAP;
  for (let i = 0; i < cap; i++) {
    if (sim.world.phase !== 'planning') break;
    const menBefore = gangManpower(sim.world, sim.playerGang);
    const poolBefore = sim.playerGang.poolIds.length;
    try {
      actions.push(`-- week ${sim.world.week}`);
      const taken = playAutoWeek(sim, settings.seed);
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
    const men = gangManpower(sim.world, sim.playerGang);
    if (men === menBefore && sim.playerGang.poolIds.length === poolBefore && sim.playerGang.recruitIds.length === 0) flatRecruit += 1;
    else flatRecruit = 0;
    if (flatRecruit >= 2) notes.push(`Stuck: men stayed ${men} and the pool stayed empty for ${flatRecruit} weeks.`);
    if (phase === 'gameOver') break;
    if (settings.weeks == null && sim.world.outcome) break;
  }
  if (settings.weeks == null && !sim.world.outcome && weeks.length >= UNTIL_END_CAP) {
    notes.push(`Stopped after ${UNTIL_END_CAP} weeks with no victory or loss.`);
  }
  const odd = weeks.filter((week) => !Number.isFinite(week.cash) || !Number.isFinite(week.men) || week.cash < 0 || week.men < 0);
  for (const week of odd) notes.push(`Suspicious: week ${week.week} cash ${week.cash} men ${week.men}.`);
  const outcome = sim.world.outcome ? `${sim.world.outcome.won ? 'won' : 'lost'}: ${sim.world.outcome.reason}` : 'still playing';
  const text = buildAutoTestReport(settings, sim.world.options.seed, weeks, actions, notes, outcome);
  const filename = `auto-test-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  await writeReportFile(filename, text);
  return text;
}
