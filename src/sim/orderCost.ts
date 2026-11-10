import { BUILDING_BY_ID } from './data/buildings';
import { buildingValue } from './execution';
import type { ID, OrderOptions, OrderType, WorldState } from './types';

const CLOSED = new Set(['done', 'failed', 'cancelled']);

/** What this order will take from the safe, or null until a target or amount is chosen. */
export function orderCashCost(
  w: WorldState,
  type: OrderType,
  opts: OrderOptions,
  buildingIds: readonly ID[],
): number | null {
  if (type === 'buyPremises') {
    const site = w.buildings[buildingIds[0]];
    return site ? buildingValue(w, site) : null;
  }
  if (type === 'setUpBusiness') {
    const kind = opts.businessTypeId ? BUILDING_BY_ID[opts.businessTypeId] : undefined;
    return kind ? kind.cost : null;
  }
  if (type === 'donate' || type === 'bribe') return opts.amount != null ? Math.max(0, opts.amount) : null;
  return 0;
}

/** Cash already promised by this week's open orders. The safe is not charged until the order is carried out. */
export function committedCash(w: WorldState, gangId: ID, exceptOrderId?: ID): number {
  let sum = 0;
  for (const order of Object.values(w.orders)) {
    if (order.gangId !== gangId || order.id === exceptOrderId || CLOSED.has(order.state)) continue;
    const cost = orderCashCost(w, order.type, order.opts, order.targetBuildingIds);
    if (cost != null && cost > 0) sum += cost;
  }
  return sum;
}

/** Cash the header and a new order can still use. */
export function spendableCash(w: WorldState, gangId: ID, exceptOrderId?: ID): number {
  const gang = w.gangs[gangId];
  if (!gang) return 0;
  return gang.cash - committedCash(w, gangId, exceptOrderId);
}
