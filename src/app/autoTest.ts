/**
 * A player made of the same actions the desk uses. The seed picks his choices
 * and, when learning is on, which weights to nudge. It does not touch the
 * city's random stream until the week itself runs.
 */
import { noteAutoTestRunning, noteAutoTestStopped, noteLastAutoTest, writeReportFile } from './debugReport';
import { folderDiary, loadDiary, serializeDiary, type DiarySink } from './diary';
import { Rng } from '../sim/rng';
import { BUY_REACH_BLOCKS, hireRecruit, issueOrder, moveToTeam, nearTerritory, promote, type ApiResult, type IssueOrderInput } from '../sim/api';
import { BUILDING_BY_ID, ILLEGAL_TYPES } from '../sim/data/buildings';
import { isValidAreaTarget } from '../sim/execution';
import type { Sim } from '../sim/sim';
import { dist, gangManpower, protectedBuildings, territoryCount } from '../sim/world';
import { buildingList } from '../sim/entityLists';
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
    saveBytes: new TextEncoder().encode(JSON.stringify(sim.world)).length,
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

/** One Monday at the desk, using hire, promote, and issueOrder. */
export function playAutoWeek(sim: Sim, seed: number, strategy: PlayStrategy): string[] {
  const actions: string[] = [];
  const rng = new Rng(seed + sim.world.week * 997);
  const w = sim.world;
  const gang = sim.playerGang;
  const beforeMen = gangManpower(w, gang);
  const weight = strategy.weights;

  for (const id of [...gang.recruitIds]) {
    const person = w.people[id];
    const room = gang.teamIds.map((teamId) => w.teams[teamId]).find((team) => team && team.memberIds.length < 8);
    const result = hireRecruit(w, gang.id, id, room ? 'team' : 'pool', room?.id);
    logResult(actions, `hire ${person?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
  }

  if (weight.hiring >= 0.2 && gang.poolIds.length && gang.teamIds.length < Math.max(2, Math.round(weight.hiring * 5)) && gang.teamIds.length < 8) {
    const id = rng.pick(gang.poolIds);
    const result = promote(w, gang.id, id);
    logResult(actions, `promote ${w.people[id]?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
  }
  if (weight.hiring >= 0.2) {
    for (const id of [...gang.poolIds]) {
      const crew = gang.teamIds.map((teamId) => w.teams[teamId]).find((team) => team && team.memberIds.length < 8);
      if (!crew) break;
      const result = moveToTeam(w, gang.id, id, crew.id);
      logResult(actions, `to crew ${w.people[id]?.name ?? id}`, result.ok, result.ok ? result.message ?? '' : result.error);
    }
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

  const origin = hqCenter(w, gang.id);
  const nearer = (a: { lotId: number }, b: { lotId: number }) => dist(w.lots[a.lotId].center, origin) - dist(w.lots[b.lotId].center, origin);
  const hoodSites = buildingList(w).filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === 'hood' && b.state !== 'destroyed').sort(nearer);
  const spend = (key: PlayStrategy['priority'][number]) => {
    if (key === 'hiring') {
      const target = Math.max(18, Math.round(10 + weight.hiring * 12));
      if (gangManpower(w, gang) < target && hoodSites.length) {
        const count = Math.max(1, Math.round(1 + weight.hiring * 2));
        give('recruit', { teamId: team.id, type: 'recruit', buildingIds: hoodSites.slice(0, count).map((b) => b.id), opts: { manpower: 1 } });
      } else if (hoodSites.length === 0) {
        actions.push('NOTE no hoods standing at a hiring place');
      } else {
        actions.push(`NOTE recruit held — ${gangManpower(w, gang)} men already meets the hiring target ${target}`);
      }
    }
    if (key === 'rackets') {
      const owed = protectedBuildings(w, gang.id).filter((b) => b.state === 'trading').slice(0, Math.max(1, Math.round(weight.rackets * 10)));
      if (w.week >= 2 && weight.rackets >= 0.2 && owed.length) give('collect', { teamId: team.id, type: 'collectProtection', buildingIds: owed.map((b) => b.id), opts: { manpower: 1 } });
      const nearby = buildingList(w).filter((b) => isValidAreaTarget(w, gang.id, 'extort', b) && nearTerritory(w, gang.id, b.blockId, 2)).sort(nearer);
      const extort = nearby.length ? nearby : buildingList(w).filter((b) => isValidAreaTarget(w, gang.id, 'extort', b)).sort(nearer);
      if (weight.rackets >= 0.25 && extort.length) {
        const cap = Math.max(1, Math.round(weight.rackets * 4));
        const take = extort.slice(0, rng.int(1, Math.min(cap, extort.length)));
        give('extort', { teamId: team.id, type: 'extort', buildingIds: take.map((b) => b.id), opts: { manpower: 1 } });
      }
      if (weight.rackets >= 0.45) {
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
      }
    }
    if (key === 'bribes' && w.week >= 4 && weight.bribes >= 0.25) {
      const chief = w.people[w.policeChiefId];
      const gate = 1500 + (1 - weight.bribes) * 2500;
      if (chief && chief.status === 'active' && chief.bribedBy !== gang.id && gang.cash > gate) {
        give('bribe', { teamId: team.id, type: 'bribe', personId: chief.id, opts: { manpower: 1, amount: Math.round(200 + weight.bribes * 800) } });
      }
    }
    if (key === 'buying' && w.week >= 4 && weight.buying >= 0.3) {
      const gate = 8000 + (1 - weight.buying) * 8000;
      const fraction = 0.15 + weight.buying * 0.5;
      if (gang.cash > gate) {
        const site = buildingList(w).find((b) => {
          const cost = BUILDING_BY_ID[b.typeId]?.cost ?? 0;
          return b.ownerGangId == null && b.state === 'trading' && cost > 0 && cost < gang.cash * fraction && nearTerritory(w, gang.id, b.blockId, BUY_REACH_BLOCKS);
        });
        if (site) give(`buy ${site.typeId}`, { teamId: team.id, type: 'buyPremises', buildingIds: [site.id] });
      }
    }
    if (key === 'violence' && w.week >= 8 && weight.violence >= 0.45) {
      const rival = buildingList(w).find((b) => b.ownerGangId != null && b.ownerGangId !== gang.id && !b.isHQ && b.state === 'trading');
      if (rival) give('smash', { teamId: team.id, type: 'smashUp', buildingIds: [rival.id], opts: { manpower: 2 } });
    }
  };

  for (const key of strategy.priority) spend(key);

  const hq = buildingList(w).find((b) => b.isHQ && b.ownerGangId === gang.id);
  if (w.week >= 2 && gangManpower(w, gang) >= 8 && hq) {
    give('guard office', { teamId: team.id, type: 'guardBusiness', buildingIds: [hq.id], opts: { manpower: 1 } });
  }
  if (w.week >= 4 && gang.accountantId == null) {
    const desk = buildingList(w).find((b) => BUILDING_BY_ID[b.typeId]?.recruit === 'accountant' && b.state !== 'destroyed');
    if (desk) give('recruit accountant', { teamId: team.id, type: 'recruit', buildingIds: [desk.id], opts: { manpower: 1 } });
  }
  if (w.week >= 6 && gang.lawyerId == null) {
    const desk = buildingList(w).find((b) => BUILDING_BY_ID[b.typeId]?.recruit === 'lawyer' && b.state !== 'destroyed');
    if (desk) give('recruit lawyer', { teamId: team.id, type: 'recruit', buildingIds: [desk.id], opts: { manpower: 1 } });
  }

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
  for (let i = 0; i < cap; i++) {
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
