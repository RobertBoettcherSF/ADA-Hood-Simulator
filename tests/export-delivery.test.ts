import { describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { cancelOrder, issueOrder, issueStreetOrder, returnToBase, setWaiting } from '../src/sim/api';
import { disbandTeam } from '../src/sim/execution';
import { MINUTES_PER_WEEK } from '../src/sim/constants';
import { Sim, MINUTES_PER_SECOND } from '../src/sim/sim';
import { allBuildings, buildingDoor, dist } from '../src/sim/world';

const stock = { liquor: 30, stolen: 20, counterfeit: 3 };
const empty = { liquor: 0, stolen: 0, counterfeit: 0 };
function fixture() {
  const sim = new Sim({ ...defaultGameOptions(), seed: 405, citySize: 10, startMoney: 100_000 });
  const w = sim.world, gang = sim.playerGang, team = w.teams[gang.teamIds[0]];
  // These cases isolate cargo/payment conservation from the generated crew's
  // skimming. Dishonest collection has separate ledger/audit coverage.
  const lieutenant = w.people[team.lieutenantId];
  lieutenant.loyalty = 100; lieutenant.skills.organization = 5;
  const warehouse = allBuildings(w).find(b => b.typeId === 'warehouse')!;
  warehouse.ownerGangId = gang.id; warehouse.stock = { ...stock };
  team.vehicles.truck = 1;
  expect(issueOrder(w, gang.id, { teamId: team.id, type: 'export', buildingIds: [warehouse.id],
    opts: { manpower: 1 } }).ok).toBe(true);
  const order = w.orders[team.orderIds.at(-1)!];
  sim.launchWeek();
  return { sim, w, gang, team, warehouse, order };
}
type Fixture = ReturnType<typeof fixture>;
function advanceUntil(sim: Sim, predicate: () => boolean) {
  for (let i = 0; i < MINUTES_PER_WEEK && !predicate(); i++) sim.advance(1 / MINUTES_PER_SECOND, 1);
  expect(predicate()).toBe(true);
}
function load(s: Fixture) {
  advanceUntil(s.sim, () => !!s.order.exportDelivery);
  expect(s.order.state).toBe('travelling');
  expect(s.order.completedTargets).toBe(0);
  expect(s.gang.cash).toBe(100_000);
  expect(s.warehouse.stock).toEqual(empty);
}

describe('Export travels from the warehouse to a terminal before receiving money', () => {
  it('carries a saved consignment to the terminal and sells only its loaded goods once', () => {
    const s = fixture(); load(s);
    const delivery = s.order.exportDelivery!, terminal = s.w.buildings[delivery.terminalId];
    expect(['docks', 'railroad']).toContain(terminal.typeId);
    expect(delivery.goods).toEqual(stock);
    expect(dist(s.w.people[s.order.assignedIds[0]].pos, buildingDoor(s.w, terminal))).toBeGreaterThan(20);
    // New warehouse deliveries must not be scooped up remotely by this shipment.
    s.warehouse.stock.liquor = 7;
    const sim = Sim.fromSave(structuredClone(s.w)), order = sim.world.orders[s.order.id];
    const actor = sim.world.people[order.assignedIds[0]];
    expect(order.exportDelivery).toEqual(delivery);
    advanceUntil(sim, () => order.state === 'executing');
    expect(dist(actor.pos, buildingDoor(sim.world, terminal))).toBeLessThan(20);
    expect(sim.playerGang.cash).toBe(100_000);
    advanceUntil(sim, () => order.state === 'done');
    expect(sim.playerGang.cash).toBe(104_160);
    expect(sim.world.buildings[s.warehouse.id].stock).toEqual({ ...empty, liquor: 7 });
    expect(order.exportDelivery).toBeUndefined();
    expect(order.completedTargets).toBe(1);
    for (let i = 0; i < 30; i++) sim.advance(1 / MINUTES_PER_SECOND, 1);
    expect(sim.playerGang.cash).toBe(104_160);
  });

  it.each(['cancel', 'reassign', 'return'] as const)('accounts for unsold goods when the shipment is interrupted by %s', action => {
    const s = fixture(); load(s);
    const actor = s.w.people[s.order.assignedIds[0]];
    const result = action === 'cancel' ? cancelOrder(s.w, s.order.id) : action === 'return' ? returnToBase(s.w, s.gang.id, actor.id) :
      issueStreetOrder(s.w, s.gang.id, [actor.id], 'goTo', null, buildingDoor(s.w, s.warehouse));
    expect(result.ok).toBe(true);
    s.sim.advance(1 / MINUTES_PER_SECOND, 1);
    expect(s.gang.cash).toBe(100_000);
    advanceUntil(s.sim,()=>s.warehouse.stock.liquor===stock.liquor);
    expect(s.warehouse.stock).toEqual(stock);
    expect(s.order.exportDelivery).toBeUndefined();
    cancelOrder(s.w, s.order.id);
    expect(s.warehouse.stock).toEqual(stock);
  });

  it('cannot remove stock or pay when every export terminal is unavailable', () => {
    const s = fixture();
    for (const b of allBuildings(s.w)) if (['docks', 'railroad'].includes(b.typeId)) b.state = 'destroyed';
    advanceUntil(s.sim, () => ['failed', 'done'].includes(s.order.state));
    expect(s.order.state).toBe('failed');
    expect(s.order.completedTargets).toBe(0);
    expect(s.order.failReason).toMatch(/terminal|docks/i);
    expect(s.warehouse.stock).toEqual(stock);
    expect(s.gang.cash).toBe(100_000);
  });

  it('reroutes a loaded shipment when its terminal closes', () => {
    const s = fixture(); load(s);
    const original = s.order.exportDelivery!.terminalId;
    s.w.buildings[original].state = 'destroyed';
    s.sim.advance(1 / MINUTES_PER_SECOND, 1);
    expect(s.order.exportDelivery!.terminalId).not.toBe(original);
    advanceUntil(s.sim, () => s.order.state === 'done');
    expect(s.gang.cash).toBe(104_160);
  });

  it('returns unsold cargo without a sale if all terminals close after loading', () => {
    const s = fixture(); load(s);
    for (const b of allBuildings(s.w)) if (['docks', 'railroad'].includes(b.typeId)) b.state = 'destroyed';
    advanceUntil(s.sim, () => s.order.state === 'failed');
    expect(s.gang.cash).toBe(100_000);
    advanceUntil(s.sim, () => s.warehouse.stock.liquor === stock.liquor);
    expect(s.warehouse.stock).toEqual(stock);
    expect(s.order.exportDelivery).toBeUndefined();
    expect(s.order.completedTargets).toBe(0);
  });

  it('does not pay or regenerate cargo after the entire transporting crew is lost', () => {
    const s = fixture(); load(s);
    for (const id of s.order.assignedIds) s.w.people[id].status = 'dead';
    advanceUntil(s.sim, () => s.order.state === 'failed');
    expect(s.gang.cash).toBe(100_000);
    expect(s.warehouse.stock).toEqual(empty);
    expect(s.order.exportDelivery).toBeUndefined();
    expect(s.order.results.join(' ')).toMatch(/cargo.*lost/i);
  });

  it('can pause and restore the delivery journey without repeating loading or payment', () => {
    const s = fixture(); load(s);
    expect(setWaiting(s.w, s.order.id, true).ok).toBe(true);
    const sim = Sim.fromSave(structuredClone(s.w)), order = sim.world.orders[s.order.id];
    const before = structuredClone(order.exportDelivery);
    for (let i = 0; i < 5; i++) sim.advance(1 / MINUTES_PER_SECOND, 1);
    expect(order.exportDelivery).toEqual(before);
    expect(setWaiting(sim.world, order.id, false).ok).toBe(true);
    advanceUntil(sim, () => order.state === 'done');
    expect(sim.playerGang.cash).toBe(104_160);
  });

  it('preserves an unfinished shipment at the week boundary and delivers after a restored Monday', () => {
    const s = fixture(); load(s);
    setWaiting(s.w, s.order.id, true);
    s.w.minute = MINUTES_PER_WEEK - 1;
    s.sim.finishWeekSlice(0); // Enters settlement; does not execute its first stage yet.
    const sim = Sim.fromSave(structuredClone(s.w));
    sim.finishWeekSlice(0); // Fail unfinished orders, retaining their real truck loads.
    expect(sim.world.buildings[s.warehouse.id].stock).toEqual(empty);
    expect(sim.playerGang.cash).toBe(100_000);
    expect(sim.world.orders[s.order.id].exportDelivery).toBeUndefined();
    expect(sim.world.orders[s.order.id].completedTargets).toBe(0);
    const restored = Sim.fromSave(structuredClone(sim.world));
    restored.finishWeek();
    const archived = restored.world.lastWeekOrders!.find(o => o.id === s.order.id)!;
    expect(archived.state).toBe('failed');
    expect(archived.results.filter(line => line.startsWith('Unsold goods are returning'))).toHaveLength(1);
    expect(archived.results.some(line => line.startsWith('Exported goods'))).toBe(false);
    expect(archived.exportDelivery).toBeUndefined();
    restored.launchWeek();
    advanceUntil(restored,()=>restored.world.buildings[s.warehouse.id].stock.liquor===stock.liquor);
    expect(restored.world.buildings[s.warehouse.id].stock).toEqual(stock);
  });

  it('does not lose or duplicate unsold stock when its crew is disbanded', () => {
    const s = fixture(); load(s);
    disbandTeam(s.w, s.gang, s.team.id, true);
    expect(s.w.orders[s.order.id]).toBeUndefined();
    expect(s.warehouse.stock).toEqual(empty);
    advanceUntil(s.sim,()=>s.warehouse.stock.liquor===stock.liquor);
    expect(s.warehouse.stock).toEqual(stock);
    expect(s.gang.cash).toBe(100_000);
    expect(() => Sim.fromSave(structuredClone(s.w))).not.toThrow();
  });

  it('cannot recover dead couriers\' cargo by cancelling before the next tick', () => {
    const s = fixture(); load(s);
    for (const id of s.order.assignedIds) s.w.people[id].status = 'dead';
    cancelOrder(s.w, s.order.id);
    expect(s.warehouse.stock).toEqual(empty);
    expect(s.gang.cash).toBe(100_000);
  });

  it('rejects malformed shipment snapshots before installing them', () => {
    const s = fixture(); load(s);
    for (const corrupt of [
      (o: typeof s.order) => { o.exportDelivery!.goods.liquor = -1; },
      (o: typeof s.order) => { o.exportDelivery!.terminalId = -1; },
      (o: typeof s.order) => { o.exportDelivery!.rate = 20; },
      (o: typeof s.order) => { o.state = 'done'; },
    ]) {
      const copy = structuredClone(s.w);
      corrupt(copy.orders[s.order.id]);
      expect(() => Sim.fromSave(copy)).toThrow(/export shipment/);
    }
    expect(s.order.exportDelivery!.goods).toEqual(stock);
  });

  it('two dispatched orders cannot export the same warehouse stock twice', () => {
    const s = fixture();
    expect(issueOrder(s.w, s.gang.id, { teamId: s.team.id, type: 'export',
      buildingIds: [s.warehouse.id], opts: { manpower: 1 } }).ok).toBe(true);
    const second = s.w.orders[s.team.orderIds.at(-1)!];
    // Week-start dispatch is the public assignment path for both planned jobs.
    s.w.phase = 'planning'; s.sim.launchWeek();
    advanceUntil(s.sim, () => [s.order, second].every(o => ['done', 'failed'].includes(o.state)));
    expect([s.order, second].filter(o => o.state === 'done')).toHaveLength(1);
    expect([s.order, second].find(o => o.state === 'failed')!.completedTargets).toBe(0);
    // The trip can now run past Friday, when the week settles wages and upkeep;
    // the week's ledger shows the shipment was sold exactly once.
    const ledger = ((s.w.phase as string) === 'week' ? s.gang.finances : s.gang.lastFinanceReport)!;
    expect(ledger.income.illegal).toBe(4_160);
    expect(s.warehouse.stock).toEqual(empty);
  });

  it('recovers cargo to another owned warehouse if the source was destroyed', () => {
    const s = fixture(); load(s);
    const replacement = allBuildings(s.w).find(b => b.typeId === 'warehouse' && b.id !== s.warehouse.id)!;
    expect(replacement).toBeDefined();
    replacement.ownerGangId = s.gang.id; replacement.stock = { ...empty };
    s.warehouse.state = 'destroyed';
    cancelOrder(s.w, s.order.id);
    expect(replacement.stock).toEqual(empty);
    advanceUntil(s.sim,()=>replacement.stock.liquor===stock.liquor);
    expect(replacement.stock).toEqual(stock);
    expect(s.warehouse.stock).toEqual(empty);
    expect(s.gang.cash).toBe(100_000);
  });
});
