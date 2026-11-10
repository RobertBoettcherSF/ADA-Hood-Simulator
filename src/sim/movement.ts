import { BLOCK_SIZE, CELL, PAVEMENT_OFFSET, STREET_WIDTH } from './constants';
import { afterTransportStep, parkedSpots, syncVehicle, transportSpeed, vehicleDriver, vehicleOf } from './transport';
import { r01 } from './hash';
import { crossingBlocked, roadAheadBlocked, roadAheadRoom, type TrafficContext } from './traffic';
import type { PathPoint, Person, Vec2, WorldState } from './types';
import { dist } from './world';
import { blockRect, cityBlockAt, cityStreetInset, streetRouteNodes } from './cityLayout';
import { onRoad, vehiclePathOnRoad, vehicleRoute } from './vehicleNavigation';
import { peopleList } from './entityLists';

/** The middle of the footway, from the street's centre line. */
const K = PAVEMENT_OFFSET;
/** How far to either side of that middle a walker keeps their own line. */
const FOOTWAY_SPREAD = 1.2;
/** How far short of a corner a walker stops, so a crowd at a kerb spreads back along it. */
const CORNER_STAGGER = 3.5;

// A live command can begin between minute ticks. Keep that actor at the
// position already shown, and charge only the remaining fraction on the next
// tick. It is kept on the person (and who has one, on the world), so a game
// saved before that tick charges the same after loading.

export function applyLiveMovement<T>(w: WorldState, fraction: number, command: () => T): T {
  if (w.phase !== 'week' || fraction <= 0) return command();
  const before = peopleList(w).map(person => ({
    person, x: person.pos.x, y: person.pos.y, path: person.path, dest: person.dest,
    inVehicle: person.inVehicle, halted: person.halted,
    visible: previewPosition(person, fraction, { x: 0, y: 0 }, w),
  }));
  const result = command();
  for (const old of before) {
    const p = old.person;
    if (w.people[p.id] !== p || (p.status !== 'active' && p.status !== 'beaten')) continue;
    if (p.pos.x !== old.x || p.pos.y !== old.y) { delete p.commandFraction; earlySteps.delete(p); continue; }
    if (p.path === old.path && p.dest === old.dest && p.inVehicle === old.inVehicle && p.halted === old.halted) continue;
    // A car is drawn along the minute it has already driven, behind where it
    // is: it takes the new route from where it really is, at once, with no
    // part-minute owing (taking it back to the drawn place cost it a minute).
    if (p.inVehicle && old.inVehicle) continue;
    p.pos = old.visible;
    // Drawn from where he stands now, not along the step he had taken early.
    earlySteps.delete(p);
    driveFrom.delete(p);
    // Regenerate a new route from the position on screen, not the earlier tick.
    if (p.dest) setDestination(w, p, p.dest);
    p.commandFraction = fraction;
    if (!(w.commandFractionIds ??= []).includes(p.id)) w.commandFractionIds.push(p.id);
  }
  return result;
}

/** Also clear offsets for cancelled/waiting actors that did not take a step. */
export function finishMovementTick(w: WorldState): void {
  if (!w.commandFractionIds) return;
  for (const id of w.commandFractionIds) if (w.people[id]) delete w.people[id].commandFraction;
  delete w.commandFractionIds;
}

/** Give a person a destination and a route to reach it. */
export function setDestination(w: WorldState, p: Person, to: Vec2): void {
  const car = vehicleOf(w,p);
  if(p.inVehicle && car && car.driverId !== p.id){syncVehicle(w,car);return;}
  p.dest = { x: to.x, y: to.y };
  p.halted = false;
  if (p.inVehicle) {
    const route = vehicleRoute(w, p.pos, to, (p.id & 1) === 0, p.vehicleKey ? parkedSpots(w, p.vehicleKey) : []);
    p.pos = route.start;
    p.dest = route.dest;
    p.path = route.path;
    if(car){car.destination={...to};syncVehicle(w,car);}
  } else {
    p.path = walkRoute(p.pos, to, p.id, w);
  }
}

/** Repair old saves' indoor cars and routes, without restarting their jobs or
 * changing valid in-flight routes, inventory, time or RNG. */
export function repairVehicleRoutes(w: WorldState): void {
  for (const p of peopleList(w)) {
    if (!p.inVehicle || !['active', 'beaten'].includes(p.status)) continue;
    const premises = p.buildingId == null ? null : w.buildings[p.buildingId];
    if (premises?.managerId === p.id && !p.dest && p.orderId == null && !p.streetOrder) {
      // Older business assignments moved the manager indoors while keeping
      // their car flag. Keep the resident inside, rather than moving the shop's
      // manager out onto the street with the stranded drivers.
      p.inVehicle = false;
      continue;
    }
    if (onRoad(w, p.pos) && (!p.dest || onRoad(w, p.dest)) && vehiclePathOnRoad(w, p.pos, p.path)) continue;
    const travelling = p.dest != null, halted = p.halted;
    setDestination(w, p, p.dest ?? p.pos);
    if (!travelling) clearDestination(p);
    p.halted = halted;
  }
}

export function clearDestination(p: Person): void {
  p.dest = null;
  p.path = [];
  p.halted = false;
}

export function personSpeed(p: Person, w?: WorldState): number { return transportSpeed(p,w); }

/**
 * Which block a point belongs to, counting the footway round it as part of the
 * block's precinct, and whether the point is inside the block itself (in a
 * building) rather than on the footway. Points in the road belong to none.
 */
function precinct(p: Vec2, w?: WorldState): { bx: number; by: number; inside: boolean } | null {
  if (w?.cityLayout) {
    const block = cityBlockAt(w, Math.floor(p.x / CELL), Math.floor(p.y / CELL));
    if (!block) return null;
    const r = blockRect(block);
    if (p.x < r.x - 3 || p.y < r.y - 3 || p.x > r.x + r.w + 3 || p.y > r.y + r.h + 3) return null;
    return { bx: block.gx, by: block.gy, inside: p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h };
  }
  const cx = p.x - STREET_WIDTH / 2;
  const cy = p.y - STREET_WIDTH / 2;
  const ix = Math.floor(cx / CELL);
  const iy = Math.floor(cy / CELL);
  const u = cx - ix * CELL;
  const v = cy - iy * CELL;
  const bx = u < BLOCK_SIZE + 3 ? ix : u >= CELL - 3 ? ix + 1 : NaN;
  const by = v < BLOCK_SIZE + 3 ? iy : v >= CELL - 3 ? iy + 1 : NaN;
  if (Number.isNaN(bx) || Number.isNaN(by)) return null;
  const inside = bx === ix && by === iy && u <= BLOCK_SIZE && v <= BLOCK_SIZE;
  return { bx, by, inside };
}

/** Two points on one pavement with no street between them. */
function sameFootway(a: Vec2, b: Vec2): boolean {
  if (Math.abs(a.y - b.y) < 1.5) return Math.floor(a.x / CELL) === Math.floor(b.x / CELL);
  if (Math.abs(a.x - b.x) < 1.5) return Math.floor(a.y / CELL) === Math.floor(b.y / CELL);
  return false;
}

/**
 * A walker's route. Pedestrians keep to the pavements: the footway runs round
 * every block a kerb's width out from it, and the only way from one footway to
 * another is a crossing — the short straight walk from one kerb line to the
 * other at a corner, marked on the path so the walker can look for traffic
 * before stepping off. Each leg of the journey may need one crossing at its
 * start, to get onto the right side of the street it is about to walk along,
 * and the last few metres may need one or two to reach the destination's side.
 * Each walker keeps their own line along the footway, so a crowd at a kerb is
 * a crowd and not one figure drawn many times.
 */
export function walkRoute(from: Vec2, to: Vec2, id: number, w?: WorldState): PathPoint[] {
  // Straight along one footway; not across a block from one side to the other
  // (two footways of a block can share a line and a cell).
  if (sameFootway(from, to) && !precinct({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, w)?.inside) return [{ x: to.x, y: to.y }];
  return trimDoubling(from, footwayRoute(from, to, id, w));
}

/** Whether `p` lies on the stretch from `a` to `b` (within a walker's line of it). */
function onStretch(p: Vec2, a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return false;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (t <= 0 || t >= 1) return false;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.sqrt(len2) < FOOTWAY_SPREAD + .4;
}

/**
 * The route runs corner to corner. A walker who starts part way along the
 * first stretch, or whose door is part way along the last, does not go on
 * to the corner and come back: the corner behind them (or past the door) is
 * dropped. Never a crossing, whose start the kerb check needs.
 */
function trimDoubling(from: Vec2, path: PathPoint[]): PathPoint[] {
  while (path.length >= 2 && !path[0].cross && !path[1].cross && onStretch(from, path[0], path[1])) path.shift();
  const n = path.length;
  if (n >= 3 && !path[n - 2].cross && onStretch(path[n - 1], path[n - 3], path[n - 2])) path.splice(n - 2, 1);
  return path;
}

function footwayRoute(from: Vec2, to: Vec2, id: number, w?: WorldState): PathPoint[] {
  // Going into or out of a building on this block: straight across the lots,
  // as a hood on business would, rather than round by the corners.
  const a = precinct(from, w);
  const b = precinct(to, w);
  if (a && b && a.bx === b.bx && a.by === b.by && (a.inside || b.inside)) return [{ x: to.x, y: to.y }];
  const zig = (id & 1) === 0;
  const pavement = K + cityStreetInset(w);
  const kx = pavement + (r01(id, 5) - 0.5) * 2 * FOOTWAY_SPREAD;
  const ky = pavement + (r01(id, 6) - 0.5) * 2 * FOOTWAY_SPREAD;
  const stagger = r01(id, 7) * CORNER_STAGGER;

  const i0 = Math.round(from.x / CELL);
  const j0 = Math.round(from.y / CELL);
  const i1 = Math.round(to.x / CELL);
  const j1 = Math.round(to.y / CELL);

  const nodes: Vec2[] = w?.cityLayout ? streetRouteNodes(w, from, to, zig) : [{ x: i0 * CELL, y: j0 * CELL }];
  if (!w?.cityLayout && zig) {
    const stepI = Math.sign(i1 - i0);
    for (let i = i0; i !== i1; i += stepI) nodes.push({ x: (i + stepI) * CELL, y: j0 * CELL });
    const stepJ = Math.sign(j1 - j0);
    for (let j = j0; j !== j1; j += stepJ) nodes.push({ x: i1 * CELL, y: (j + stepJ) * CELL });
  } else if (!w?.cityLayout) {
    const stepJ = Math.sign(j1 - j0);
    for (let j = j0; j !== j1; j += stepJ) nodes.push({ x: i0 * CELL, y: (j + stepJ) * CELL });
    const stepI = Math.sign(i1 - i0);
    for (let i = i0; i !== i1; i += stepI) nodes.push({ x: (i + stepI) * CELL, y: j1 * CELL });
  }

  const path: PathPoint[] = [];
  // Which of the four corners of the current intersection the walker stands on.
  let sx = Math.sign(from.x - nodes[0].x) || 1;
  let sy = Math.sign(from.y - nodes[0].y) || 1;
  // Arriving at a corner, a walker stops a little short of it along the way
  // they came; a crossing then runs from wherever they stood to the far kerb,
  // and carries its own length so the kerb check knows when they have left it.
  const corner = (n: Vec2, cx: number, cy: number, crossing: boolean): void => {
    const prev: Vec2 = path.length ? path[path.length - 1] : from;
    const pt: PathPoint = { x: n.x + cx * kx, y: n.y + cy * ky };
    if (crossing) {
      pt.cross = Math.hypot(prev.x - pt.x, prev.y - pt.y);
    } else {
      const ax = pt.x - prev.x;
      const ay = pt.y - prev.y;
      if (Math.abs(ax) > Math.abs(ay) && Math.abs(ax) > stagger) pt.x -= Math.sign(ax) * stagger;
      else if (Math.abs(ay) > stagger) pt.y -= Math.sign(ay) * stagger;
    }
    path.push(pt);
  };
  corner(nodes[0], sx, sy, false);

  for (let n = 0; n + 1 < nodes.length; n++) {
    const a = nodes[n];
    const b = nodes[n + 1];
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    // Finish even the initial approach before turning. A staggered arrival
    // followed by the next leg would shave through the corner building.
    if (w?.cityLayout) path.push({ x: a.x + sx * kx, y: a.y + sy * ky });
    if (dx !== 0) {
      // Walking along a row street: leave from the corner on the far side of
      // the column street, crossing it first if need be.
      if (sx !== dx) {
        sx = dx;
        corner(a, sx, sy, true);
      }
      sx = -dx;
      corner(b, sx, sy, false);
    } else if (dy !== 0) {
      if (sy !== dy) {
        sy = dy;
        corner(a, sx, sy, true);
      }
      sy = -dy;
      corner(b, sx, sy, false);
    }
  }

  // The last few metres: get onto the destination's side of its street.
  const end = nodes[nodes.length - 1];
  if (w?.cityLayout) path.push({ x: end.x + sx * kx, y: end.y + sy * ky });
  const tx = Math.sign(to.x - end.x) || sx;
  const ty = Math.sign(to.y - end.y) || sy;
  const besideRow = Math.abs(to.y - end.y) <= pavement + 1.5;
  const besideCol = Math.abs(to.x - end.x) <= pavement + 1.5;
  if (besideRow && !besideCol) {
    if (sy !== ty) {
      sy = ty;
      corner(end, sx, sy, true);
    }
    if (sx !== tx) {
      sx = tx;
      corner(end, sx, sy, true);
    }
  } else {
    if (sx !== tx) {
      sx = tx;
      corner(end, sx, sy, true);
    }
    if (sy !== ty) {
      sy = ty;
      corner(end, sx, sy, true);
    }
  }
  path.push({ x: to.x, y: to.y });
  return path;
}

/** Whether the crossing that ends at `next`, starting from `at`, has traffic on it. */
function crossingHasTraffic(t: TrafficContext, at: Vec2, next: Vec2): boolean {
  // crossingOf, without making an object for every walker at every kerb.
  const mx = (at.x + next.x) / 2, my = (at.y + next.y) / 2;
  return Math.abs(next.x - at.x) >= Math.abs(next.y - at.y)
    ? crossingBlocked(t, false, Math.round(mx / CELL), my, mx, my)
    : crossingBlocked(t, true, Math.round(my / CELL), mx, mx, my);
}

/**
 * Advance a person along their path. Returns true once they reach the
 * destination (and the path is cleared). With the traffic to hand, a walker
 * at a kerb waits for a gap before stepping into the road, and a driver stops
 * for anyone on a crossing in the road ahead.
 */
export function stepPerson(p: Person, minutes: number, traffic?: TrafficContext, world = traffic?.world): boolean {
  if(world && p.inVehicle && vehicleDriver(world,p)!==p){
    const car=vehicleOf(world,p)!;syncVehicle(world,car);return !p.dest;
  }
  const arrived=stepRoute(p,minutes,traffic,world);
  return world ? afterTransportStep(world,p,arrived) : arrived;
}
function stepRoute(p: Person, minutes: number, traffic?: TrafficContext, world?: WorldState): boolean {
  if (!p.dest) { delete p.commandFraction; return true; }
  // Most walkers carry no command fraction; skip the map write for them.
  const fraction = p.commandFraction;
  if (fraction !== undefined) { minutes = Math.max(0, minutes - fraction); delete p.commandFraction; }
  p.halted = false;
  let budget = personSpeed(p,world) * minutes;
  const car = p.inVehicle ? vehicleOf(world, p) : undefined;
  if (p.inVehicle) { noteDrive(p, p.pos); if (car) noteDrive(car, p.pos); }

  // Drop every waypoint this minute in one splice. Shifting one point at a
  // time copied the rest of the route on every corner; the route left behind
  // is the same list.
  const path = p.path;
  let index = 0;
  const drop = () => { if (index) { path.splice(0, index); index = 0; } };
  while (budget > 0) {
    if (index >= path.length) {
      p.pos.x = p.dest.x;
      p.pos.y = p.dest.y;
      drop();
      clearDestination(p);
      return true;
    }
    const next = path[index];
    const dx = next.x - p.pos.x;
    const dy = next.y - p.pos.y;
    const d = Math.hypot(dx, dy);
    // Still on the kerb at the start of a crossing: look before stepping off.
    if (traffic && next.cross && !p.inVehicle && d >= next.cross - 0.75 && crossingHasTraffic(traffic, p.pos, next)) {
      p.halted = true;
      drop();
      return false;
    }
    // At the wheel: somebody on a crossing ahead means a stop. Standing on
    // the waypoint itself there is no heading yet; take it first.
    if (traffic && p.inVehicle && d > 0.5 && roadAheadBlocked(traffic, p.pos, next)) {
      p.halted = true;
      drop();
      return false;
    }
    // A slower car in front: close up behind it and keep its pace.
    if (traffic && p.inVehicle && d > 0.5) {
      budget = Math.min(budget, roadAheadRoom(traffic, p.pos, next, vehicleDriver(world ?? traffic.world!, p), path[index + 1]));
      if (budget <= 0) { drop(); return false; }
    }
    if (d <= budget) {
      p.pos.x = next.x;
      p.pos.y = next.y;
      index++;
      budget -= d;
      if (p.inVehicle) { noteDrive(p, p.pos, true); if (car) noteDrive(car, p.pos, true); }
      if (index >= path.length) {
        drop();
        clearDestination(p);
        return true;
      }
    } else {
      p.pos.x += (dx / d) * budget;
      p.pos.y += (dy / d) * budget;
      budget = 0;
    }
  }
  drop();
  return false;
}

/**
 * People the ambient system has already stepped for the coming minute (sim.ts
 * runs its walking in slices through the minute, as the original spread its
 * people updates over many small ticks): where they stood when the minute
 * began. Until the minute's tick they are drawn between that and where the
 * step put them; a minute's walk is about half a metre, so a straight line is exact.
 */
export const earlySteps = new Map<Person, Vec2>();

/**
 * Cars and lorries, where the minute's tick found them (keyed by the driver,
 * the fleet car or the delivery). Between ticks a vehicle is drawn from there
 * to where the tick left it, a minute behind the simulation, instead of being
 * guessed ahead along its route: a guess the tick then stopped short of (a
 * walker in the road, a car in front) pulled the car back two metres. Cleared
 * at every tick; a vehicle the tick did not move is drawn where it stands.
 */
export const driveFrom = new Map<object, Vec2[]>();

/** Note the start of a vehicle's minute (once a tick), or a corner it took. */
export function noteDrive(key: object, at: Vec2, corner = false): void {
  const trail = driveFrom.get(key);
  if (!trail) driveFrom.set(key, [{ x: at.x, y: at.y }]);
  else if (corner) trail.push({ x: at.x, y: at.y });
}

/** A vehicle's place `fraction` of the way through the minute since the
 *  tick, along the road it took (round its corners, not across them). */
export function previewVehicle(key: object, pos: Vec2, fraction: number, out: Vec2): Vec2 {
  out.x = pos.x; out.y = pos.y;
  const trail = driveFrom.get(key);
  if (!trail) return out;
  let total = 0;
  for (let i = 0; i < trail.length; i++) {
    const b = i + 1 < trail.length ? trail[i + 1] : pos;
    total += Math.hypot(b.x - trail[i].x, b.y - trail[i].y);
  }
  let left = total * Math.min(1, Math.max(0, fraction));
  for (let i = 0; i < trail.length; i++) {
    const a = trail[i], b = i + 1 < trail.length ? trail[i + 1] : pos;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= d) {
      const k = d > 0 ? left / d : 0;
      out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k;
      return out;
    }
    left -= d;
  }
  return out;
}

/**
 * Where a person will be `minutes` further along their path, without moving
 * them. The renderer calls this with the fraction of the current minute that
 * has elapsed, so a figure glides between ticks instead of jumping once a tick.
 * A walker waiting at a kerb stays put.
 */
export function previewPosition(p: Person, minutes: number, out: Vec2, world?: WorldState): Vec2 {
  if(world)p=vehicleDriver(world,p);
  const from = earlySteps.get(p);
  if (from) {
    const t = Math.min(1, Math.max(0, minutes));
    out.x = from.x + (p.pos.x - from.x) * t;
    out.y = from.y + (p.pos.y - from.y) * t;
    return out;
  }
  if (p.inVehicle) return previewVehicle(p, p.pos, minutes - (p.commandFraction ?? 0), out);
  out.x = p.pos.x;
  out.y = p.pos.y;
  minutes = Math.max(0, minutes - (p.commandFraction ?? 0));
  if (!p.dest || minutes <= 0 || p.halted) return out;
  let budget = personSpeed(p,world) * minutes;
  for (let i = 0; i < p.path.length && budget > 0; i++) {
    const next = p.path[i];
    const dx = next.x - out.x;
    const dy = next.y - out.y;
    const d = Math.hypot(dx, dy);
    if (d <= budget) {
      out.x = next.x;
      out.y = next.y;
      budget -= d;
    } else {
      out.x += (dx / d) * budget;
      out.y += (dy / d) * budget;
      budget = 0;
    }
  }
  return out;
}

export function hasArrived(p: Person, target: Vec2, tolerance = 4): boolean {
  return dist(p.pos, target) <= tolerance;
}
