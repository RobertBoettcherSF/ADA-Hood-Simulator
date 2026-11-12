import { MINUTES_PER_WEEK } from '../src/sim/constants';
import { describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { issueOrder, cancelOrder, issueStreetOrder, returnToBase } from '../src/sim/api';
import { Sim, MINUTES_PER_SECOND } from '../src/sim/sim';
import { allBuildings, buildingDoor, dist } from '../src/sim/world';

describe('standing orders selected by individual properties', () => {
  it.each(['cancel', 'street', 'return'] as const)('protects the front and hidden operation, then removes both posts on %s', command => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10 });
    const w = sim.world, g = sim.playerGang, t = w.teams[g.teamIds[0]];
    const site = allBuildings(w).find(b => b.ownerGangId === g.id && b.hidesId != null)!;
    expect(site).toBeDefined(); const hidden = w.buildings[site.hidesId!];
    expect(issueOrder(w, g.id, { teamId: t.id, type: 'guardBusiness', buildingIds: [site.id] }).ok).toBe(true);
    sim.launchWeek(); const order = w.orders[t.orderIds[0]], actor = w.people[order.assignedIds[0]];
    for (let minute = 0; minute < 200 && !site.guardIds.includes(actor.id); minute++) sim.advance(1 / MINUTES_PER_SECOND, 1);
    expect(site.guardIds).toContain(actor.id); expect(hidden.guardIds).toContain(actor.id);
    const result = command === 'cancel' ? cancelOrder(w, order.id) : command === 'return'
      ? returnToBase(w, g.id, actor.id) : issueStreetOrder(w, g.id, [actor.id], 'goTo', null, { x: 20, y: 20 });
    expect(result.ok).toBe(true);
    expect(site.guardIds).not.toContain(actor.id); expect(hidden.guardIds).not.toContain(actor.id);
  });

  it.each([false, true])('guards an owned shop after travelling by car=%s and stops guarding when cancelled', car => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10 });
    const w = sim.world, g = sim.playerGang, t = w.teams[g.teamIds[0]];
    const site = allBuildings(w).find(b => b.ownerGangId === g.id && !b.isHQ && b.cls !== 'empty')!;
    t.vehicles = { coupe: car ? 1 : 0, truck: 0, speedster: 0 };
    expect(issueOrder(w, g.id, { teamId: t.id, type: 'guardBusiness', buildingIds: [site.id] }).ok).toBe(true);
    sim.launchWeek();
    const order = w.orders[t.orderIds[0]], actor = w.people[order.assignedIds[0]];
    for (let minute = 0; minute < 200 && !site.guardIds.includes(actor.id); minute++) sim.advance(1 / MINUTES_PER_SECOND, 1);
    expect(order.state).toBe('executing');
    expect(site.guardIds).toContain(actor.id);
    expect(dist(actor.pos, buildingDoor(w, site))).toBeLessThanOrEqual(5);
    expect(cancelOrder(w, order.id).ok).toBe(true);
    expect(site.guardIds).not.toContain(actor.id);
    expect(actor.orderId).toBeNull();
  });

  it('holds the selected go-to point until cancellation', () => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10 });
    const w = sim.world, g = sim.playerGang, t = w.teams[g.teamIds[0]];
    t.vehicles = { coupe: 0, truck: 0, speedster: 0 };
    const site = allBuildings(w).find(b => b.protection?.gangId === g.id)!;
    const pos = buildingDoor(w, site);
    expect(issueOrder(w, g.id, { teamId: t.id, type: 'goTo', pos }).ok).toBe(true);
    sim.launchWeek(); const order = w.orders[t.orderIds[0]], actor = w.people[order.assignedIds[0]];
    for (let minute = 0; minute < MINUTES_PER_WEEK && (order.state !== 'executing' || actor.dest); minute++) sim.advance(1 / MINUTES_PER_SECOND, 1);
    expect(order.state).toBe('executing'); expect(dist(actor.pos, pos)).toBeLessThan(1);
    expect(actor.dest).toBeNull(); expect(actor.orderId).toBe(order.id);
    expect(cancelOrder(w, order.id).ok).toBe(true); expect(actor.orderId).toBeNull();
  });

  it.each(['patrol', 'ambush'] as const)('%s reaches a site selected without a whole block, including after restore', type => {
    let sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10 });
    const w = sim.world, g = sim.playerGang, t = w.teams[g.teamIds[0]];
    const site = allBuildings(w).find(b => b.protection?.gangId === g.id)!;
    const result = issueOrder(w, g.id, { teamId: t.id, type, buildingIds: [site.id], opts: { manpower: 1 } });
    expect(result.ok).toBe(true);
    const id = t.orderIds[0];
    sim.launchWeek();
    const order = w.orders[id], actorId = order.assignedIds[0];
    expect(actorId).toBeDefined();
    const start = { ...w.people[actorId].pos };
    // Exercise persisted explicit-site orders, including older accepted saves.
    sim = Sim.fromSave(structuredClone(w));
    for (let minute = 0; minute < 1500 && sim.world.orders[id].state !== 'executing'; minute++) sim.advance(1 / MINUTES_PER_SECOND, 1);
    expect(sim.world.orders[id].failReason).toBeNull();
    expect(sim.world.orders[id].state).toBe('executing');
    expect(dist(sim.world.people[actorId].pos, start)).toBeGreaterThan(5);
    expect(sim.world.orders[id].targetBlockIds).toEqual([]);
    expect(sim.world.orders[id].targetBuildingIds).toEqual([site.id]);
    expect(sim.world.people[actorId].orderId).toBe(id);
  });
});
