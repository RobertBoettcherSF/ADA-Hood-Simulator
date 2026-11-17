/**
 * 1.2.44 (Robert): protection collecting. Every collect order walks its stops
 * in the shortest order (nearest-next, crossings removed) from where the trip
 * really starts (1.2.75: office nearest the first stop, or the previous order's end); a shop already paid this week or in another crew's queued
 * collect order cannot be picked; an over-long route drops the stops that save
 * the most walking; "collect all owed" fills a crew with one route per free man.
 */
import { MINUTES_PER_WEEK } from './constants';
import { crewHasTime, crewLoads } from './crewTime';
import { crewStartFor, nearestOffice } from './execution';
import { planRoute } from './routing';
import type { Building, ID, Order, Team, Vec2, WorldState } from './types';
import { dist, protectedBuildings } from './world';

/**
 * Where a crew's route starts. 1.2.75 (Robert, point 13): as the real trip does — after an earlier
 * queued order, from that order's last stop; for the week's first order, from the gang's office
 * nearest the route's nearest stop (the stop it will walk to first). Without stops, the office
 * nearest the lieutenant, as before.
 */
export function crewStart(w: WorldState, team: Team, ids: ID[] = [], skipOrderId?: ID): Vec2 | null {
  let first: Vec2 | null = null, best = Infinity;
  for (const id of ids) {
    if (!w.buildings[id]) continue;
    const c = centre(w, id);
    const office = nearestOffice(w, team.gangId, c);
    const d = office ? dist(w.lots[office.lotId].center, c) : 0;
    if (d < best) { best = d; first = c; }
  }
  const start = crewStartFor(w, team, first, skipOrderId);
  return start ?? w.people[team.lieutenantId]?.pos ?? null;
}

/** Shops in a queued collect order of this gang (crew orders this week), optionally skipping one order. */
export function collectQueued(w: WorldState, gangId: ID, skipOrderId?: ID): Map<ID, ID> {
  const out = new Map<ID, ID>();
  for (const team of Object.values(w.teams)) {
    if (team.gangId !== gangId) continue;
    for (const oid of team.orderIds) {
      if (oid === skipOrderId) continue;
      const o = w.orders[oid];
      if (!o || o.type !== 'collectProtection' || o.state === 'done') continue;
      for (const id of o.targetBuildingIds) if (!out.has(id)) out.set(id, team.id);
    }
  }
  return out;
}

/** Paid this week already. */
export function paidThisWeek(w: WorldState, b: Building): boolean {
  return b.protection?.collectedWeek === w.week;
}

/** Owed shops nobody has this week: protected by us, not paid, in no queued collect order. */
export function unassignedOwed(w: WorldState, gangId: ID, skipOrderId?: ID): Building[] {
  const queued = collectQueued(w, gangId, skipOrderId);
  return protectedBuildings(w, gangId).filter((b) => b.state !== 'destroyed' && !paidThisWeek(w, b) && !queued.has(b.id));
}

const centre = (w: WorldState, id: ID) => w.lots[w.buildings[id].lotId].center;

/** The stops in the shortest order from the crew's office. */
export function routeOrder(w: WorldState, team: Team, ids: ID[], skipOrderId?: ID): ID[] {
  const start = crewStart(w, team, ids, skipOrderId);
  const known = ids.filter((id) => w.buildings[id]);
  if (!start || known.length < 2) return known;
  return planRoute(start, known.map((id) => ({ item: id, ...centre(w, id) }))).map((s) => s.item);
}

/**
 * Trim an area order until it fits the crew's week: each time, the stop whose
 * removal saves the most walking goes (the farthest off the route). The
 * estimate is recomputed by `estimate` for each try. Empty when not one fits.
 */
export function trimToWeek(w: WorldState, team: Team, order: Order, estimate: (o: Order) => number, skipOrderId?: ID): ID[] {
  const start = crewStart(w, team, order.targetBuildingIds, skipOrderId ?? order.id);
  let ids = [...order.targetBuildingIds];
  const fits = (list: ID[]) => { const part = { ...order, targetBuildingIds: list, targetBlockIds: [] }; return crewHasTime(w, team, { ...part, estimatedMinutes: estimate(part) }, skipOrderId); };
  while (ids.length > 1) {
    let worst = ids.length - 1, saving = -Infinity;
    for (let i = 0; i < ids.length; i++) {
      const prev = i === 0 ? start : centre(w, ids[i - 1]);
      const here = centre(w, ids[i]);
      const next = i + 1 < ids.length ? centre(w, ids[i + 1]) : null;
      const s = (prev ? dist(prev, here) : 0) + (next ? dist(here, next) - (prev ? dist(prev, next) : 0) : 0);
      if (s > saving) { saving = s; worst = i; }
    }
    ids = ids.filter((_, i) => i !== worst);
    if (order.type === 'collectProtection') ids = routeOrder(w, team, ids, skipOrderId ?? order.id);
    if (fits(ids)) return ids;
  }
  return ids.length === 1 && fits(ids) ? ids : [];
}

/**
 * "Collect all owed": routes of the nearest owed, unpaid, unqueued shops, one
 * per free man of the crew, each as long as that man's week allows. `tryRoute`
 * checks one route (the caller's order preview and time check).
 */
export function planCollectAll(w: WorldState, team: Team, fitsRoute: (ids: ID[]) => boolean, issue: (ids: ID[]) => boolean): ID[][] {
  const owed = unassignedOwed(w, team.gangId).map((b) => b.id);
  if (!crewStart(w, team, owed)) return [];
  let left = owed;
  const freeMen = crewLoads(w, team).filter((load) => load < MINUTES_PER_WEEK).length;
  const routes: ID[][] = [];
  for (let man = 0; man < freeMen && left.length; man++) {
    const route: ID[] = [];
    // 1.2.75 (point 13): each route starts where its real trip would.
    let at = crewStart(w, team, left)!;
    const pool = [...left];
    while (pool.length) {
      pool.sort((a, b) => dist(centre(w, a), at) - dist(centre(w, b), at));
      const next = pool[0];
      const trial = routeOrder(w, team, [...route, next]);
      if (!fitsRoute(trial)) break;
      route.splice(0, route.length, ...trial);
      pool.shift();
      at = centre(w, next);
    }
    if (!route.length || !issue(route)) break;
    routes.push(route);
    const taken = new Set(route);
    left = left.filter((id) => !taken.has(id));
  }
  return routes;
}

