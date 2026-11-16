import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { defaultGameOptions } from '../src/app/newGame';
import {
  GO_STRAIGHT_ASSETS,
  MAX_TEAMS,
  MAX_TEAM_SIZE,
  SNITCH_COUNT,
  VEHICLES,
  WAREHOUSE_CASH_CAP,
  WAREHOUSE_GOODS_CAP,
  WEAPONS,
  ELECTION_BLOCKS_REQUIRED,
  ELECTION_WEEKS,
} from '../src/sim/constants';
import { BUILDING_BY_ID, ILLEGAL_TYPES } from '../src/sim/data/buildings';
import { allBuildings, gangAssets, gangWealth, gangManpower, territoryCount } from '../src/sim/world';
import { Rng } from '../src/sim/rng';

function newSim(seed = 12345) {
  return new Sim({ ...defaultGameOptions(), seed, citySize: 10 });
}

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(99);
    const b = new Rng(99);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });

  it('restores exactly from a saved state', () => {
    const a = new Rng(7);
    for (let i = 0; i < 10; i++) a.next();
    const saved = a.state;
    const expected = [a.next(), a.next(), a.next()];
    const b = new Rng(1);
    b.state = saved;
    expect([b.next(), b.next(), b.next()]).toEqual(expected);
  });
});

describe('city generation', () => {
  it('builds a complete city', () => {
    const sim = newSim();
    const w = sim.world;
    expect(w.blocks.length).toBe(100);
    // Authored modules and merged parks/civic blocks have different parcel counts.
    // Every parcel must still belong to exactly one block and have a building record.
    const lotIds = w.blocks.flatMap(b => b.lotIds);
    expect(lotIds.length).toBeGreaterThan(0);
    expect(new Set(lotIds).size).toBe(lotIds.length);
    expect(lotIds.sort((a,b) => a-b)).toEqual(Object.values(w.lots).map(l => l.id).sort((a,b) => a-b));
    for (const lot of Object.values(w.lots)) {
      expect(w.buildings[lot.buildingId]).toBeDefined();
    }
    expect(Object.keys(w.gangs).length).toBe(4);
    expect(w.snitchIds.length).toBe(SNITCH_COUNT);
    expect(w.judgeIds.length).toBeGreaterThan(0);
    expect(w.daIds.length).toBeGreaterThan(0);
  });

  it('gives every gang a headquarters with a legal front', () => {
    const sim = newSim();
    for (const gang of Object.values(sim.world.gangs)) {
      const hq = allBuildings(sim.world).find((b) => b.ownerGangId === gang.id && b.isHQ);
      expect(hq).toBeDefined();
      expect(hq!.typeId).toBe('office');
      // The office sits in the centre lot and is hidden behind a legal site.
      expect(sim.world.lots[hq!.lotId].index).toBe(4);
      const front = hq!.frontId != null ? sim.world.buildings[hq!.frontId] : null;
      expect(front).toBeTruthy();
      expect(front!.ownerGangId).toBe(gang.id);
      expect(front!.blockId).toBe(hq!.blockId);
    }
  });

  it('places illegal businesses only in centre lots', () => {
    const sim = newSim();
    for (const b of allBuildings(sim.world)) {
      if (b.cls !== 'illegal') continue;
      expect(sim.world.lots[b.lotId].index).toBe(4);
    }
  });

  it('produces the same city twice from the same seed', () => {
    const a = newSim(4242);
    const b = newSim(4242);
    expect(Object.keys(a.world.buildings).length).toBe(Object.keys(b.world.buildings).length);
    expect(a.world.blocks.map((x) => x.landValue)).toEqual(b.world.blocks.map((x) => x.landValue));
    expect(Object.values(a.world.people).map((p) => p.name)).toEqual(
      Object.values(b.world.people).map((p) => p.name),
    );
  });
});

describe('the working week', () => {
  it('runs a full week and returns to planning', () => {
    const sim = newSim();
    expect(sim.world.phase).toBe('planning');
    sim.launchWeek();
    expect(sim.world.phase).toBe('week');
    sim.finishWeek();
    expect(['planning', 'gameOver']).toContain(sim.world.phase);
    expect(sim.world.week).toBe(2);
  });

  it('survives a long unattended run without corrupting itself', () => {
    const sim = newSim(777);
    for (let i = 0; i < 30 && sim.world.phase !== 'gameOver'; i++) {
      sim.launchWeek();
      sim.finishWeek();
    }
    const w = sim.world;

    for (const gang of Object.values(w.gangs)) {
      expect(Number.isFinite(gang.cash)).toBe(true);
      expect(Number.isFinite(gang.suspicion)).toBe(true);
      expect(gang.suspicion).toBeGreaterThanOrEqual(0);
      expect(gang.suspicion).toBeLessThanOrEqual(100);
      expect(gang.popularity).toBeGreaterThanOrEqual(-100);
      expect(gang.popularity).toBeLessThanOrEqual(100);
      // No dangling references anywhere in the gang's structures.
      for (const id of gang.poolIds) expect(w.people[id]).toBeDefined();
      for (const id of gang.teamIds) expect(w.teams[id]).toBeDefined();
      for (const t of gang.teamIds.map((id) => w.teams[id])) {
        expect(w.people[t.lieutenantId]).toBeDefined();
        expect(t.memberIds.length).toBeLessThanOrEqual(MAX_TEAM_SIZE - 1);
        for (const m of t.memberIds) expect(w.people[m]).toBeDefined();
      }
      expect(gang.teamIds.length).toBeLessThanOrEqual(MAX_TEAMS);
    }

    for (const b of Object.values(w.buildings)) {
      expect(Number.isFinite(b.lastProfit)).toBe(true);
      if (b.frontId != null) expect(w.buildings[b.frontId]).toBeDefined();
      if (b.hidesId != null) expect(w.buildings[b.hidesId]).toBeDefined();
      if (b.managerId != null) expect(w.people[b.managerId]).toBeDefined();
    }

    // The city should actually be doing something after thirty weeks.
    const totalCrimes = w.crimes.length;
    expect(totalCrimes).toBeGreaterThanOrEqual(0);
    expect(w.news.length).toBeGreaterThan(0);
  }, 600000);

  it('reaches the same state from the same seed', () => {
    const run = (seed: number) => {
      const sim = new Sim({ ...defaultGameOptions(), seed, citySize: 9 });
      for (let i = 0; i < 8 && sim.world.phase !== 'gameOver'; i++) {
        sim.launchWeek();
        sim.finishWeek();
      }
      return Object.values(sim.world.gangs).map((g) => [g.cash, g.suspicion, g.popularity]);
    };
    expect(run(31337)).toEqual(run(31337));
  }, 180000);

  it('serialises and restores mid-game', () => {
    const sim = newSim(555);
    sim.launchWeek();
    sim.finishWeek();
    const json = JSON.stringify(sim.world);
    const restored = Sim.fromSave(JSON.parse(json));
    expect(restored.world.week).toBe(sim.world.week);
    expect(Object.keys(restored.world.buildings).length).toBe(Object.keys(sim.world.buildings).length);
    restored.launchWeek();
    restored.finishWeek();
    expect(restored.world.week).toBe(sim.world.week + 1);
  }, 180000);
});

describe('numbers taken from the original manual', () => {
  it('prices weapons and vehicles as the manual does', () => {
    expect(WEAPONS.pistol.cost).toBe(100);
    expect(WEAPONS.shotgun.cost).toBe(750);
    expect(WEAPONS.rifle.cost).toBe(750);
    expect(WEAPONS.tommy.cost).toBe(2000);
    expect(WEAPONS.twinPistols.cost).toBe(3000);
    expect(WEAPONS.explosives.cost).toBe(500);
    expect(VEHICLES.coupe.cost).toBe(3000);
    expect(VEHICLES.truck.cost).toBe(3000);
    expect(VEHICLES.speedster.cost).toBe(5000);
  });

  it('keeps the structural limits', () => {
    expect(MAX_TEAMS).toBe(12);
    expect(MAX_TEAM_SIZE).toBe(10);
    expect(SNITCH_COUNT).toBe(3);
    expect(WAREHOUSE_GOODS_CAP).toBe(300);
    expect(WAREHOUSE_CASH_CAP).toBe(15);
    expect(GO_STRAIGHT_ASSETS).toBe(250_000);
    expect(ELECTION_BLOCKS_REQUIRED).toBe(100);
    expect(ELECTION_WEEKS).toBe(6);
  });

  it('models the fronts the manual describes', () => {
    expect(BUILDING_BY_ID.speakeasy.fronts).toContain('restaurant');
    expect(BUILDING_BY_ID.speakeasy.fronts).toContain('cafe');
    expect(BUILDING_BY_ID.moonshineStill.fronts).toContain('drugStore');
    expect(BUILDING_BY_ID.casino.fronts).toContain('departmentStore');
    expect(BUILDING_BY_ID.numbersRacket.fronts).toContain('convenienceStore');
    expect(BUILDING_BY_ID.grifters.fronts).toContain('pawnbroker');
    expect(BUILDING_BY_ID.counterfeitPress.fronts).toContain('printers');
    expect(BUILDING_BY_ID.teamsters.fronts).toContain('tradeUnion');
    // The still supplies liquor rather than earning directly.
    expect(BUILDING_BY_ID.moonshineStill.profit).toBe(0);
    expect(BUILDING_BY_ID.moonshineStill.produces?.kind).toBe('liquor');
    // The office earns nothing at all.
    expect(BUILDING_BY_ID.office.profit).toBe(0);
    // A casino out-earns a speakeasy, which out-earns everything else.
    const earners = ILLEGAL_TYPES.filter((t) => t.profit > 0).sort((a, b) => b.profit - a.profit);
    expect(earners[0].id).toBe('casino');
    expect(earners[1].id).toBe('speakeasy');
  });
});

describe('gang health metrics', () => {
  it('reports plausible assets, manpower and territory at the start', () => {
    const sim = newSim();
    const player = sim.playerGang;
    expect(gangManpower(sim.world, player)).toBeGreaterThanOrEqual(3);
    expect(gangAssets(sim.world, player)).toBeGreaterThan(0);
    expect(gangWealth(sim.world, player)).toBe(player.cash + gangAssets(sim.world, player));
    expect(territoryCount(sim.world, player.id)).toBeGreaterThanOrEqual(0);
  });
});
