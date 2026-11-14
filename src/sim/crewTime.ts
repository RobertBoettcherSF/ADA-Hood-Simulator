import { MINUTES_PER_WEEK, ORDERS } from './constants';
import { crewPeople, readyForPlanning } from './orderStaffing';
import type { ID, Order, Person, Team, WorldState } from './types';

/**
 * 1.2.27: crew time is counted in man-hours. A crew's week is
 * MINUTES_PER_WEEK for each man in it (the lieutenant and his hoods; managers
 * running a business are outside the crew). An order uses its duration for
 * each man it takes, and no man works more than MINUTES_PER_WEEK.
 */
type Planned = Pick<Order, 'type' | 'opts' | 'estimatedMinutes'>;

/** The men who share the crew's week. */
export function crewMen(w: WorldState, team: Team): Person[] {
  return crewPeople(w, team).filter(p => readyForPlanning(w, p));
}

/** The crew's week in man-minutes. */
export function crewCapacity(w: WorldState, team: Team): number {
  return MINUTES_PER_WEEK * crewMen(w, team).length;
}

/** The men an order takes: what it asks for, no more than the crew has. */
export function orderMen(w: WorldState, team: Team, order: Pick<Order, 'opts'>): number {
  return Math.max(1, Math.min(Math.max(1, order.opts.manpower), crewMen(w, team).length));
}

/** How long each man on the order is busy. A standing order holds its men all week. */
export function orderDuration(order: Planned): number {
  return ORDERS[order.type]?.wholeWeek ? MINUTES_PER_WEEK : Math.max(0, order.estimatedMinutes);
}

/** The order's man-minutes: its duration for each man it takes. */
export function orderManMinutes(w: WorldState, team: Team, order: Planned): number {
  return Math.round(orderDuration(order) * orderMen(w, team, order));
}

/** The crew's queued orders this week, in the order they were given. */
function crewOrders(w: WorldState, team: Team, skipOrderId?: ID): Order[] {
  return team.orderIds.filter(id => id !== skipOrderId).map(id => w.orders[id]).filter((o): o is Order => !!o);
}

/** Each man's booked minutes: every order goes to the men with the most time left. */
export function crewLoads(w: WorldState, team: Team, skipOrderId?: ID): number[] {
  const loads = crewMen(w, team).map(() => 0);
  for (const order of crewOrders(w, team, skipOrderId)) book(loads, orderMen(w, team, order), orderDuration(order));
  return loads;
}

function book(loads: number[], men: number, minutes: number): number[] {
  const picked = loads.map((load, i) => ({ load, i })).sort((a, b) => a.load - b.load || a.i - b.i).slice(0, men);
  for (const { i } of picked) loads[i] += minutes;
  return picked.map(({ i }) => loads[i]);
}

/** Recount the crew's booked man-minutes from its orders. */
export function syncCrewTime(w: WorldState, team: Team): void {
  team.timeUsed = crewOrders(w, team).reduce((sum, o) => sum + orderManMinutes(w, team, o), 0);
}

/** Free man-minutes left in the crew's week. */
export function crewFreeMinutes(w: WorldState, team: Team, skipOrderId?: ID): number {
  const skipped = skipOrderId != null && w.orders[skipOrderId] && team.orderIds.includes(skipOrderId) ? orderManMinutes(w, team, w.orders[skipOrderId]) : 0;
  return crewCapacity(w, team) - Math.max(0, team.timeUsed - skipped);
}

/** The most minutes any one man of the crew still has free. */
export function crewFreestManMinutes(w: WorldState, team: Team, skipOrderId?: ID): number {
  const loads = crewLoads(w, team, skipOrderId);
  return loads.length ? MINUTES_PER_WEEK - Math.min(...loads) : 0;
}

/** The share of the crew's man-hours already given out, 0..1. */
export function crewUsedShare(w: WorldState, team: Team): number {
  // 1.2.44 (Robert): a crew with no orders has used none of its week.
  if (!team.orderIds.some((id) => w.orders[id])) return 0;
  const capacity = crewCapacity(w, team);
  return capacity > 0 ? Math.min(1, team.timeUsed / capacity) : 1;
}

/**
 * Whether the crew has the man-hours for this order: the crew's free
 * man-minutes cover it, and the men it takes each have its duration free.
 * `slack` is the game's existing 2% leeway on a week.
 */
export function crewHasTime(w: WorldState, team: Team, order: Planned, skipOrderId?: ID, slack = 1.02): boolean {
  if (orderManMinutes(w, team, order) > crewFreeMinutes(w, team, skipOrderId) + MINUTES_PER_WEEK * crewMen(w, team).length * (slack - 1)) return false;
  const loads = crewLoads(w, team, skipOrderId);
  if (!loads.length) return false;
  return book(loads, orderMen(w, team, order), orderDuration(order)).every(load => load <= MINUTES_PER_WEEK * slack);
}
