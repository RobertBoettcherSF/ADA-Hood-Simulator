import { buildingDoor } from '../src/sim/world';
import { MINUTES_PER_WEEK } from '../src/sim/constants';
import { describe, expect, it } from 'vitest';
import { defaultGameOptions, describeMode } from '../src/app/newGame';
import { SCENARIOS, applyScenario } from '../src/app/scenarios';
import { TUTORIALS, applyTutorial } from '../src/app/tutorials';
import {
  BUY_REACH_BLOCKS,
  assignStaffVehicle,
  employPoliceInArea,
  issueOrder,
  nearTerritory,
  policeTourCapacity,
  recallManager,
  whereaboutsUnknown,
} from '../src/sim/api';
import { isValidAreaTarget } from '../src/sim/execution';
import { Sim, MINUTES_PER_SECOND } from '../src/sim/sim';
import type { Building } from '../src/sim/types';
import { allBuildings, territoryBlocks } from '../src/sim/world';

function newSim(seed: number): Sim {
  return new Sim({ ...defaultGameOptions(), seed, citySize: 12 });
}

describe('rules from the manual', () => {
  it('only lets you buy premises within two blocks of your territory', () => {
    const sim = newSim(21);
    const w = sim.world;
    const gang = sim.playerGang;
    const held = territoryBlocks(w, gang.id);
    const anchor = held[0] ?? w.blocks[allBuildings(w).find((b) => b.ownerGangId === gang.id)!.blockId];
    const far = allBuildings(w).find((b) => {
      const blk = w.blocks[b.blockId];
      return b.ownerGangId == null && b.cls === 'commercial' && Math.abs(blk.gx - anchor.gx) + Math.abs(blk.gy - anchor.gy) > BUY_REACH_BLOCKS + 2;
    })!;
    expect(nearTerritory(w, gang.id, far.blockId, BUY_REACH_BLOCKS)).toBe(false);
    const res = issueOrder(w, gang.id, { teamId: gang.teamIds[0], type: 'buyPremises', buildingIds: [far.id], opts: { manpower: 1 } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/territory/i);
  });

  it('offers the part of an area order the lieutenant can manage', () => {
    const sim = newSim(22);
    const w = sim.world;
    const gang = sim.playerGang;
    // Every extortable site in the city is far more than a week's work.
    const all = allBuildings(w)
      .filter((b) => b.state === 'trading' && isValidAreaTarget(w, gang.id, 'extort', b))
      .map((b: Building) => b.id);
    const res = issueOrder(w, gang.id, { teamId: gang.teamIds[0], type: 'extort', buildingIds: all, opts: { manpower: 1 } });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.suggestion).toBeTruthy();
      expect(res.suggestion!.count).toBeGreaterThan(0);
      expect(res.suggestion!.count).toBeLessThan(all.length);
      // And the offer itself is accepted.
      const again = issueOrder(w, gang.id, {
        teamId: gang.teamIds[0],
        type: 'extort',
        buildingIds: res.suggestion!.buildingIds,
        opts: { manpower: 1 },
      });
      expect(again.ok).toBe(true);
    }
  });

  it('sends a crew to ask around for a rival nobody has placed', () => {
    const sim = newSim(23);
    const w = sim.world;
    const gang = sim.playerGang;
    const rival = Object.values(w.people).find((p) => p.gangId != null && p.gangId !== gang.id && p.role === 'hood')!;
    expect(whereaboutsUnknown(gang, rival)).toBe(true);
    const res = issueOrder(w, gang.id, { teamId: gang.teamIds[0], type: 'assault', personId: rival.id, opts: { manpower: 2 } });
    expect(res.ok).toBe(true);
    const order = Object.values(w.orders).find((o) => o.gangId === gang.id && o.type === 'assault')!;
    expect(order.hunting).toBe(true);
    expect(order.huntStopIds!.length).toBeGreaterThan(0);
    sim.launchWeek();
    sim.finishWeek();
    // (Its crew may have been broken up in the week, its orders with it: the order's own state still tells.)
    const archived = w.lastWeekOrders.find((o) => o.id === order.id) ?? order;
    // Either they found him and had a go, nobody would talk, or the week ran out
    // on the search (1.2.21: the starting gang's extra hood shifts seed 23's city) — never left travelling.
    expect(['done', 'failed']).toContain(archived.state);
    if (archived.state === 'failed') expect(archived.failReason).toMatch(/where|found|time in the week/i);
  });

  it('loses the week when a manager is recalled to base', () => {
    const sim = newSim(24);
    const w = sim.world;
    const gang = sim.playerGang;
    const site = allBuildings(w).find((b) => b.ownerGangId === gang.id && b.managerId != null)!;
    const mgr = w.people[site.managerId!];
    const res = recallManager(w, gang.id, site.id);
    expect(res.ok).toBe(true);
    expect(site.managerId).toBeNull();
    expect(site.managerRecalledWeek).toBe(w.week);
    expect(gang.poolIds).toContain(mgr.id);
    expect(mgr.buildingId).toBeNull();
  });

  it('lets the lawyer tour an area and put its officers on the payroll, more with a car', () => {
    const sim = newSim(25);
    const w = sim.world;
    const gang = sim.playerGang;
    const lawyer = Object.values(w.people).find((p) => p.role === 'lawyer' && p.gangId == null)!;
    lawyer.gangId = gang.id;
    gang.lawyerId = lawyer.id;
    // A hired lawyer works from HQ, where the staff car is kept.
    const hq = Object.values(w.buildings).find(b => b.isHQ && b.ownerGangId === gang.id)!;
    lawyer.pos = { ...buildingDoor(w, hq) }; lawyer.buildingId = null;
    gang.cash = 100_000;
    expect(policeTourCapacity(gang)).toBe(4);
    gang.vehicles.coupe = (gang.vehicles.coupe ?? 0) + 1;
    const inCache = gang.vehicles.coupe;
    expect(assignStaffVehicle(w, gang.id, 'lawyer', 'coupe').ok).toBe(true);
    expect(gang.vehicles.coupe).toBe(inCache - 1);
    expect(gang.staffVehicles?.lawyer).toBe('coupe');
    expect(policeTourCapacity(gang)).toBe(8);
    // The whole city as the area: every officer is on somebody's beat.
    const res = employPoliceInArea(w, gang.id, w.blocks.map((b) => b.id));
    expect(res.ok).toBe(true);
    expect(gang.employedPoliceIds).toHaveLength(0);
    sim.launchWeek();
    for (let i = 0; i < MINUTES_PER_WEEK && gang.employedPoliceIds.length < 8; i++) sim.advance(1 / MINUTES_PER_SECOND, 1);
    expect(gang.employedPoliceIds.length).toBeGreaterThan(0);
    expect(gang.employedPoliceIds.length).toBe(8);
    expect(assignStaffVehicle(w, gang.id, 'lawyer', null).ok).toBe(true);
    expect(gang.vehicles.coupe).toBe(inCache);
  });

  it('starts every scenario with its objective named, on the chosen city size (1.2.21)', () => {
    for (const sc of SCENARIOS) {
      const o = applyScenario(defaultGameOptions(), sc);
      expect(o.scenarioId).toBe(sc.id);
      expect(o.seed).toBe(sc.options.seed);
      expect(describeMode(o)).toContain(sc.name);
      const sim = new Sim(o);
      // The City Size buttons rule every game: a compact base falls back to Standard 40 × 32.
      expect([sim.world.gridW, sim.world.gridH]).toEqual([40, 32]);
      expect(sim.world.options.mode).toBe(sc.options.mode);
    }
  });

  it('starts each lesson with its first step still to do and none of them impossible', () => {
    for (const lesson of TUTORIALS) {
      const o = applyTutorial(defaultGameOptions(), lesson);
      expect(o.tutorialId).toBe(lesson.id);
      const sim = new Sim(o);
      const w = sim.world;
      const g = sim.playerGang.id;
      const done = lesson.steps.map((s) => s.done(w, g));
      // A fresh city has the first thing still to do.
      expect(done[0]).toBe(false);
      // And a week of doing nothing does not tick the lot off by itself.
      sim.launchWeek();
      sim.finishWeek();
      const after = lesson.steps.map((s) => s.done(w, g));
      expect(after.every(Boolean)).toBe(false);
    }
  });
});
