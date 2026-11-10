import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { planGang } from '../src/sim/ai';
import { defaultGameOptions } from '../src/app/newGame';
import { BUILDING_BY_ID } from '../src/sim/data/buildings';
import { chargeRentedRooms } from '../src/sim/rentedRooms';
import { buildDebugReport } from '../src/app/debugReport';
import { ERA_2032_ENABLED } from '../src/app/era';
import type { GameOptions, WorldState } from '../src/sim/types';
import { gangManpower } from '../src/sim/world';

const small = (): GameOptions => ({
  ...defaultGameOptions(),
  seed: 1932,
  citySize: 8,
  cityHeight: undefined,
  cityLayout: 'classic',
  era: '1932',
});

function fresh(): Sim {
  return new Sim(small());
}

function friday(sim: Sim): WorldState['outcome'] {
  return (sim as unknown as { checkEndConditions(includeInsolvency?: boolean): WorldState['outcome'] }).checkEndConditions(true);
}

describe('1932 playable week', () => {
  it('resolves one week without graphics and matches a second run of the same orders', () => {
    const first = fresh();
    const second = fresh();
    first.launchWeek();
    first.finishWeek();
    second.launchWeek();
    second.finishWeek();
    expect(first.world.phase).toBe('planning');
    expect(first.world.week).toBe(2);
    expect(first.playerGang.cash).toBe(second.playerGang.cash);
    expect(first.world.rngState).toBe(second.world.rngState);
    expect(Object.keys(first.world.gangs)).toHaveLength(4);
    expect(first.world.options.era).toBe('1932');
    expect(ERA_2032_ENABLED).toBe(false);
  });

  it('autoplay issues orders through the same planner and finishes the week', () => {
    const sim = fresh();
    planGang(sim.world, sim.rng, sim.playerGang, true);
    expect(Object.values(sim.world.orders).some((order) => order.gangId === sim.playerGang.id)).toBe(true);
    sim.launchWeek();
    sim.finishWeek();
    expect(sim.world.week).toBe(2);
    expect(sim.world.phase === 'planning' || sim.world.phase === 'gameOver').toBe(true);
  });

  it('collects rented-room rent once per working day', () => {
    const sim = fresh();
    const player = sim.playerGang;
    const building = Object.values(sim.world.buildings).find((site) => site.ownerGangId === player.id && site.state === 'trading');
    expect(building).toBeTruthy();
    building!.typeId = 'rentedRooms';
    building!.cls = 'illegal';
    building!.roomsFloors = 4;
    building!.roomsStaff = 8;
    building!.roomsChargedDay = 0;
    building!.roomsWeekNet = 0;
    const before = player.cash;
    sim.world.minute = 1;
    chargeRentedRooms(sim.world);
    expect(player.cash).toBeGreaterThan(before);
    const once = player.cash;
    chargeRentedRooms(sim.world);
    expect(player.cash).toBe(once);
    sim.world.minute = 481;
    chargeRentedRooms(sim.world);
    expect(player.cash).toBeGreaterThan(once);
    expect(building!.roomsFloors).toBe(4);
    expect(building!.roomsStaff).toBe(8);
    expect(BUILDING_BY_ID.rentedRooms.name).toBe('Rented Rooms');
    expect(BUILDING_BY_ID.whorehouse).toBeUndefined();
  });

  it('mentions the seed and any generator fallback in the debug report', () => {
    const sim = fresh();
    const report = buildDebugReport(sim.world, '1.1.0', null);
    expect(report).toContain('Version: 1.1.0');
    expect(report).toContain(`Seed: ${sim.world.options.seed}`);
    expect(report).toContain('Seed fallback');
    expect(report).toContain('2032 content off');
  });
});

describe('win and loss conditions', () => {
  it('ends the game when the boss is killed', () => {
    const sim = fresh();
    sim.world.people[sim.playerGang.bossId].status = 'dead';
    expect(sim.resolveImmediateOutcome()).toBe(true);
    expect(sim.world.outcome?.won).toBe(false);
    expect(sim.world.outcome?.reason).toMatch(/killed/i);
  });

  it('ends the game on a life sentence', () => {
    const sim = fresh();
    const boss = sim.world.people[sim.playerGang.bossId];
    boss.status = 'jailed';
    boss.jailWeeks = 999;
    expect(sim.resolveImmediateOutcome()).toBe(true);
    expect(sim.world.outcome?.reason).toMatch(/convicted/i);
  });

  it('ends the game when a rival is elected mayor', () => {
    const sim = fresh();
    const rival = Object.values(sim.world.gangs).find((gang) => !gang.isPlayer)!;
    sim.world.electionWinnerGangId = rival.id;
    expect(sim.resolveImmediateOutcome()).toBe(true);
    expect(sim.world.outcome?.won).toBe(false);
    expect(sim.world.outcome?.reason).toMatch(/elected Mayor/i);
  });

  it('ends the game bankrupt when the Friday check runs', () => {
    const sim = fresh();
    const player = sim.playerGang;
    player.cash = -1;
    player.weapons = { pistol: 0, shotgun: 0, rifle: 0, tommy: 0, twinPistols: 0, explosives: 0 };
    player.vehicles = { coupe: 0, truck: 0, speedster: 0 };
    player.staffVehicles = { accountant: null, lawyer: null };
    for (const team of Object.values(sim.world.teams)) {
      if (team.gangId !== player.id) continue;
      team.weapons = { pistol: 0, shotgun: 0, rifle: 0, tommy: 0, twinPistols: 0, explosives: 0 };
      team.vehicles = { coupe: 0, truck: 0, speedster: 0 };
    }
    for (const person of Object.values(sim.world.people)) {
      if (person.gangId === player.id && person.id !== player.bossId) person.status = 'dead';
    }
    for (const building of Object.values(sim.world.buildings)) {
      if (building.ownerGangId === player.id) building.ownerGangId = null;
    }
    expect(gangManpower(sim.world, player)).toBe(0);
    const outcome = friday(sim);
    expect(outcome?.won).toBe(false);
    expect(outcome?.reason).toMatch(/bankrupt/i);
  });

  it('wins the full game by election, by wiping out rivals, by alliance, and by going straight', () => {
    const elected = fresh();
    elected.world.electionWinnerGangId = elected.playerGang.id;
    expect(friday(elected)?.reason).toMatch(/elected Mayor/i);
    expect(friday(elected)?.won).toBe(true);

    const wiped = fresh();
    for (const gang of Object.values(wiped.world.gangs)) if (!gang.isPlayer) gang.eliminated = true;
    expect(friday(wiped)?.reason).toMatch(/wiped out/i);

    const carved = fresh();
    const rivals = Object.values(carved.world.gangs).filter((gang) => !gang.isPlayer);
    rivals.slice(1).forEach((gang) => { gang.eliminated = true; });
    carved.playerGang.offered[rivals[0].id] = 'alliance';
    carved.playerGang.known[rivals[0].id] = 'alliance';
    expect(friday(carved)?.reason).toMatch(/carved the city/i);

    const straight = fresh();
    const player = straight.playerGang;
    player.goingStraight = true;
    player.weapons.tommy = 400;
    const lawyer = Object.values(straight.world.people).find((person) => person.role === 'lawyer' && person.status === 'active')
      ?? Object.values(straight.world.people).find((person) => person.role === 'hood')!;
    lawyer.role = 'lawyer';
    lawyer.gangId = player.id;
    lawyer.status = 'active';
    player.lawyerId = lawyer.id;
    for (const building of Object.values(straight.world.buildings)) {
      if (building.ownerGangId === player.id && building.cls === 'illegal' && building.typeId !== 'office') building.cls = 'commercial';
    }
    const outcome = friday(straight);
    expect(outcome?.won).toBe(true);
    expect(outcome?.reason).toMatch(/straight/i);
  });

  it('settles a timed power game and a wealth or territory race', () => {
    const power = fresh();
    power.world.options.mode = 'power';
    power.world.options.powerWeeks = 1;
    power.world.week = 1;
    expect(friday(power)?.reason).toMatch(/powerful|stronger/i);

    const wealth = fresh();
    const player = wealth.playerGang;
    wealth.world.targetRace = {
      mode: 'wealth', gangId: player.id, value: 1, target: 1, week: 1, minute: 0, basis: 'event', tiedGangIds: [player.id],
    };
    expect(wealth.resolveTargetRace()).toBe(true);
    expect(wealth.world.outcome?.won).toBe(true);
    expect(wealth.world.outcome?.reason).toMatch(/wealth/i);

    const territory = fresh();
    const boss = territory.playerGang;
    territory.world.targetRace = {
      mode: 'territory', gangId: boss.id, value: 1, target: 1, week: 1, minute: 0, basis: 'event', tiedGangIds: [boss.id],
    };
    expect(territory.resolveTargetRace()).toBe(true);
    expect(territory.world.outcome?.reason).toMatch(/block/i);
  });
});
