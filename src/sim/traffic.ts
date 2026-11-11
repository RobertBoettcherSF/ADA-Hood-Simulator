import { MINUTES_PER_SECOND } from './constants';
/**
 * The city's traffic. The cars are scenery — nothing in the world depends on
 * them — but they are scenery the pedestrians can see, and that can see the
 * pedestrians: each car's street, lane, kind and speed come from its index,
 * and it follows a timetable that is a pure function of the clock, except
 * that a car stops for anyone on a crossing in front of it and falls that
 * far behind its timetable for good. The simulation and the renderer share
 * the timetable and the delays, so they agree on where every car is.
 */

import { CELL, LANE_OFFSET, MINUTES_PER_WEEK, STREET_WIDTH } from './constants';
import { h2, r01, rint } from './hash';
import { C as OC } from './originalCityGen';
import type { Person, Vec2, WorldState } from './types';
import { peopleSlice } from './peopleSlices';
import { peopleList } from './entityLists';

export const MAX_CARS = 320;

/** A walker waits for a car that would reach the crossing within this many
 *  minutes (about the time it takes him to reach its lane), plus a margin in
 *  metres. A fixed 38 m held walkers at the kerb 30 to 90 minutes once the
 *  cars were slowed to their on-screen pace. */
const WALKER_LEAD_MINUTES = 14;
const CAR_MARGIN = 4;
/** A car already this far past the crossing line is gone. */
const CAR_CLEARANCE = -5;
/** A driven car within this distance of a crossing stops the walkers. */
const DRIVER_RADIUS = 20;
/** A car brakes for a crossing in use this close in front of it, in metres. */
const BRAKING_DISTANCE = 12;
/** Centre to centre, the closest one car follows another (a car is about 4.5 m long). */
export const FOLLOW_GAP = 7;
/** Two cars whose centres are this close side to side share a lane. */
const SAME_LANE = 1.8;
/** A walker this close to a driver's line is in the car's way. */
const IN_THE_WAY = 2;
/** A sim vehicle this close to an ambient car's lane line is in its way: a
 *  car across the junction reaches about half its length into the lane. */
const BODY_IN_LANE = 3.1;
/** A cross-street car is clear of the junction once this far past the middle,
 *  driving away (6.5 held turning cars for cars already leaving). */
const CLEAR_PAST = 4.5;
/** A waypoint this close to a crossroads (each way) is the turn or the way through it. */
const JUNCTION = 4;
/** A driver giving way waits this far short of the middle of the junction, clear of its lanes. */
const GIVE_WAY_LINE = 5.5;
/** Nearer the middle than this, a driver is at or over the line and carries on
 *  (4.5 left a metre in which a car told to wait at the line could not get
 *  back to it, and stood frozen at the junction's edge). */
const GIVE_WAY_INSIDE = 5.4;
/** How far ahead a driver looks for a junction to give way at. */
const GIVE_WAY_LOOK = 16;
/** Within this of a junction's middle (each way), a car is in it. */
const JUNCTION_BOX = 5;

export interface Car {
  /** True when the street runs along the x axis. */
  axisX: boolean;
  /** Which street: the index of its centre line on the lattice. */
  line: number;
  /** +1 along the axis, -1 against it. */
  dir: 1 | -1;
  truck: boolean;
  /** Metres per minute. */
  speed: number;
  /** Position along the street, in metres from the city edge. */
  s: number;
  x: number;
  y: number;
  /** Index into the renderer's paint chart. */
  color: number;
  /** Stopped for a crossing this minute. */
  halted: boolean;
  /** How many minutes it has been stopped. */
  waited: number;
  /** Stable timetable index. The paint job stays with the car, not the kerb it is passing. */
  id: number;
  /** Nose direction for this leg, in the renderer's yaw. Visual only. */
  heading: number;
  /** The junction it drives to next: its middle, how far off its corner is, and the heading out of it. */
  junction?: { x: number; y: number; ahead: number; exit: number };
}

/** What the cars carry between minutes: how far behind the timetable each one is. */
export interface TrafficState {
  delay: number[];
  halted: boolean[];
  waited: number[];
}

/** A sim vehicle in the road: a person at the wheel or a delivery lorry. */
export type Driver = { pos: Vec2; halted?: boolean; path: Vec2[]; id?: number; sourceId?: number };

/** A crossing with somebody on it. */
export interface OccupiedCrossing {
  /** The street it spans. */
  axisX: boolean;
  line: number;
  /** Where along that street the crossing lies. */
  s: number;
  /** The middle of the walk across, where a driver must not be. */
  mx: number;
  my: number;
  /** Where the walker is on it. */
  wx: number;
  wy: number;
}

/** One key per street, so cars and crossings can be looked up by the street they are on. */
export function streetKey(axisX: boolean, line: number): number {
  // A number, not a string: it is looked up for every walker at a kerb.
  return line * 2 + (axisX ? 1 : 0);
}

/** One key per lane: a street and a direction along it. */
function laneKey(axisX: boolean, line: number, dir: 1 | -1): number {
  return streetKey(axisX, line) * 2 + (dir > 0 ? 1 : 0);
}

function byStreet<T extends { axisX: boolean; line: number }>(items: T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const it of items) {
    const key = streetKey(it.axisX, it.line);
    const list = out.get(key);
    if (list) list.push(it);
    else out.set(key, [it]);
  }
  return out;
}

/**
 * Background cars per block-length of street. The original ran about 0.03
 * (some 75 cars on its 40 × 32-block city); twice that keeps a compact city
 * from looking deserted. It was ten times that, the streets jammed.
 */
const CARS_PER_STREET = 0.06;

const carCounts = new WeakMap<object, number>();
export function carCount(w: WorldState): number {
  const graph = streetGraph(w);
  const known = carCounts.get(graph);
  if (known !== undefined) return known;
  const n = countCars(graph);
  carCounts.set(graph, n);
  return n;
}
function countCars(graph: ReturnType<typeof streetGraph>): number {
  let ends = 0;
  for (const n of graph.neighbours) ends += n.length;
  if (!ends) return 0;
  return Math.min(MAX_CARS, Math.max(12, Math.round(ends / 2 * CARS_PER_STREET)));
}

function trafficState(w: WorldState): TrafficState {
  const n = carCount(w);
  let st = w.traffic;
  if (!st || st.delay.length !== n) {
    st = { delay: new Array<number>(n).fill(0), halted: new Array<boolean>(n).fill(false), waited: new Array<number>(n).fill(0) };
    w.traffic = st;
  }
  return st;
}

/** East, south, west, north: clockwise, so a right turn is the next one round. */
const HX = [1, 0, -1, 0], HY = [0, 1, 0, -1];
/** The lane of a car heading `d`: on the right of the centre line. */
const laneX = (d: number) => -HY[d] * LANE_OFFSET, laneY = (d: number) => HX[d] * LANE_OFFSET;

/** What never changes about a car: the lane it starts in, how far along, its kind and paint. */
interface CarSpec { node: number; dir: number; phase: number; truck: boolean; color: number }

/**
 * A car's drive so far: the corners it has passed and the way it went at
 * each junction, worked out as far as it has got. It never goes back the way
 * it came unless the road ends there. In the original city it drives trips,
 * as the original's background cars do (0x6121F0): to a destination drawn by
 * land value (0x606AF0) along a planned route, then on to the next one
 * (`originalTrip`). Elsewhere it picks a way at every junction by lot among
 * the streets open to it. Both are pure functions of the car and its place
 * in its drive, so the timetable stays a pure function of the clock.
 */
interface Drive {
  x: number[]; y: number[];
  /** Distance driven at each point. */
  at: number[];
  /** The heading of the leg ending at each point. */
  head: number[];
  /** The junction each point belongs to (-1 for none). */
  junction: number[];
  /** The junction it is driving to, how it is heading, and how many junctions it has passed. */
  next: number; dir: number; turns: number;
  /** Original city: the ways still to take on this trip, one per junction, and the trips drawn so far. */
  plan?: number[]; trips?: number;
}

/** One pace for every car (at their own paces they caught each other up in
 *  the lanes), tuned on screen at 0.15 minutes a second. */
const AMBIENT_SPEED = 23 * 0.15 / MINUTES_PER_SECOND;

const specCache = new WeakMap<WorldState, { graph: unknown; specs: CarSpec[]; drives: (Drive | null)[] }>();
function carSpecs(w: WorldState): { specs: CarSpec[]; drives: (Drive | null)[] } {
  const n = carCount(w);
  const graph = streetGraph(w);
  const cached = specCache.get(w);
  if (cached && cached.graph === graph && cached.specs.length === n) return cached;
  // Every lane of every street, in an order shuffled by the lane: each car
  // starts in a different one while there are enough to go round.
  const lanes: number[] = [];
  const width = w.gridW + 1;
  graph.neighbours.forEach((ns, i) => {
    for (let d = 0; d < 4; d++) if (ns.includes(i + HY[d] * width + HX[d])) lanes.push(i * 4 + d);
  });
  lanes.sort((p, q) => h2(p, 91) - h2(q, 91) || p - q);
  const specs: CarSpec[] = [];
  for (let k = 0; k < n && lanes.length; k++) {
    const lane = lanes[k % lanes.length];
    const round = Math.floor(k / lanes.length);
    specs.push({ node: lane >> 2, dir: lane & 3, phase: (0.15 + 0.7 * r01(k, 98) + round * 0.37) % 1,
      truck: r01(k, 94) < 0.3, color: rint(k, 97, 8) });
  }
  const out = { graph, specs, drives: new Array<Drive | null>(specs.length).fill(null) };
  specCache.set(w, out);
  return out;
}

function startDrive(w: WorldState, spec: CarSpec): Drive {
  const g = streetGraph(w), p = g.points[spec.node], d = spec.dir;
  const along = spec.phase * CELL;
  return { x: [p.x + laneX(d) + HX[d] * along], y: [p.y + laneY(d) + HY[d] * along], at: [0], head: [d], junction: [-1],
    next: spec.node + HY[d] * (w.gridW + 1) + HX[d], dir: d, turns: 0 };
}

/** Drive on through one more junction. */
function extendDrive(w: WorldState, k: number, drive: Drive): void {
  const g = streetGraph(w), width = w.gridW + 1, node = drive.next, d = drive.dir, p = g.points[node];
  const open = (t: number) => g.neighbours[node].includes(node + HY[t] * width + HX[t]);
  let ways = [d, (d + 1) & 3, (d + 3) & 3].filter(open);
  if (!ways.length) ways = [(d + 2) & 3];
  let t = ways[h2(k * 131 + drive.turns, 103) % ways.length];
  if (w.cityLayout?.original) {
    if (!drive.plan?.length) drive.plan = originalTrip(w, k, drive.trips = (drive.trips ?? 0) + 1, node, d) ?? [];
    const planned = drive.plan.shift();
    // A trip that cannot be routed (none found in eight draws) falls back on the lot for a junction.
    if (planned !== undefined && open(planned)) t = planned;
    else drive.plan = [];
  }
  const push = (x: number, y: number, head: number) => {
    const n = drive.x.length - 1;
    drive.at.push(drive.at[n] + Math.hypot(x - drive.x[n], y - drive.y[n]));
    drive.x.push(x); drive.y.push(y); drive.head.push(head); drive.junction.push(node);
  };
  // Straight over, or round the corner where the two lanes cross, or (where
  // the road ends) across to the other lane.
  if (t === d) push(p.x + laneX(d), p.y + laneY(d), d);
  else if (t === ((d + 2) & 3)) { push(p.x + laneX(d), p.y + laneY(d), d); push(p.x + laneX(t), p.y + laneY(t), t); }
  else push(p.x + laneX(d) + laneX(t), p.y + laneY(d) + laneY(t), d);
  drive.next = node + HY[t] * width + HX[t];
  drive.dir = t;
  drive.turns++;
}

/**
 * 0x606AF0's acceptance ladder, by `rand % 10`: a drawn block whose land value
 * (block +0x68, set by CityGen_GrowDistricts 0x537D70) is over the threshold
 * is taken at once with odds of land value in 256. Draw 1 also ignores the river.
 */
export const TRIP_THRESHOLDS: readonly number[] = [10, 30, 140, 140, 110, 90, 70, 50, 30, 20];

/** A background car's destination: a block, and the street beside it (its two junctions) it drives to. */
export interface TripGoal { gx: number; gy: number; a: number; b: number }

/** Per world, fixed: each block's land value where a car may be sent (-1 where not), and the river's rows by column. */
const tripTables = new WeakMap<WorldState, { value: Int16Array; riverLo: Int16Array; riverHi: Int16Array }>();
function tripTable(w: WorldState) {
  let t = tripTables.get(w);
  if (t) return t;
  const W = w.gridW, H = w.gridH;
  t = { value: new Int16Array(W * H).fill(-1), riverLo: new Int16Array(W).fill(-1), riverHi: new Int16Array(W).fill(-1) };
  for (const b of w.blocks) {
    if (b.gx < 0 || b.gy < 0 || b.gx >= W || b.gy >= H) continue;
    const use = b.layout?.use;
    // A destination is a building (0x606AF0: cell class 1..11); parks, plazas, avenues and water are not.
    if ((use === 'urban' || use === 'civic') && b.layout?.mergedInto == null) t.value[b.gy * W + b.gx] = b.original?.landValue ?? 0;
    // The river's rows in each column (0x606540 reads them from city +0x1398): water and the road bridges.
    if (use === 'water' || b.original?.content === OC.BRIDGE) {
      if (t.riverLo[b.gx] < 0 || b.gy < t.riverLo[b.gx]) t.riverLo[b.gx] = b.gy;
      if (b.gy > t.riverHi[b.gx]) t.riverHi[b.gx] = b.gy;
    }
  }
  tripTables.set(w, t);
  return t;
}

/** 0x606540: north of the river (-1), south (1), or on it or with none in the column (0). */
function riverSide(t: { riverLo: Int16Array; riverHi: Int16Array }, col: number, row: number, junction: boolean): number {
  const lo = t.riverLo[Math.min(col, t.riverLo.length - 1)], hi = t.riverHi[Math.min(col, t.riverHi.length - 1)];
  if (lo < 0) return 0;
  // A junction row y is the street between block rows y - 1 and y.
  return junction ? (row <= lo ? -1 : row > hi ? 1 : 0) : (row < lo ? -1 : row > hi ? 1 : 0);
}

/** The street on each side of block (gx, gy), in 0x60C0D0's order: west, south, north, east. */
function blockSide(w: WorldState, gx: number, gy: number, side: number): [number, number] {
  const width = w.gridW + 1, n = (x: number, y: number) => y * width + x;
  return side === 0 ? [n(gx, gy), n(gx, gy + 1)] : side === 1 ? [n(gx, gy + 1), n(gx + 1, gy + 1)]
    : side === 2 ? [n(gx, gy), n(gx + 1, gy)] : [n(gx + 1, gy), n(gx + 1, gy + 1)];
}

/**
 * 0x606AF0 for car `k` at junction `node`, draw `seed`: a cell anywhere but
 * the outer block, redrawn until at least 10 cells (two blocks) from the car
 * along x or y; it must be a building with a street beside it (0x60C0D0: the
 * side from `rand & 3`, turning on to the next while that has none), on the
 * car's side of the river unless the ladder drew 1. A block whose land value
 * passes the ladder's threshold wins on a `rand & 255` below its land value;
 * otherwise the last fit one drawn in 100 tries. The original loops until it
 * finds one; this stops after 400.
 */
export function drawTripGoal(w: WorldState, k: number, seed: number, node: number): TripGoal | null {
  const W = w.gridW, H = w.gridH, width = W + 1, nx = node % width, ny = Math.floor(node / width);
  const g = streetGraph(w), t = tripTable(w);
  let i = 0;
  const rand = () => h2(k * 7919 + seed * 104729 + i++, 107) & 0x7fffffff;
  const spanX = 5 * W - 10, spanY = 5 * H - 10;
  if (spanX <= 0 || spanY <= 0) return null;
  const r = rand() % 10, threshold = TRIP_THRESHOLDS[r], anySide = r === 1, own = riverSide(t, nx, ny, true);
  let found: TripGoal | null = null;
  for (let tries = 0; tries < 400 && !(tries > 99 && found); tries++) {
    let cx = 0, cy = 0;
    for (let n = 0; n < 64; n++) {
      cx = 5 + rand() % spanX; cy = 5 + rand() % spanY;
      if (Math.abs(cx - nx * 5) > 9 || Math.abs(cy - ny * 5) >= 10) break;
    }
    const gx = Math.floor(cx / 5), gy = Math.floor(cy / 5), value = t.value[gy * W + gx];
    if (value < 0) continue;
    const start = rand() & 3;
    let ends: [number, number] | null = null;
    for (let s = 0; s < 4 && !ends; s++) {
      const e = blockSide(w, gx, gy, (start + s) & 3);
      if (g.neighbours[e[0]].includes(e[1])) ends = e;
    }
    if (!ends) continue;
    if (!anySide) { const there = riverSide(t, gx, gy, false); if (own && there && own !== there) continue; }
    found = { gx, gy, a: ends[0], b: ends[1] };
    if (value > threshold && (rand() & 255) < value) break;
  }
  return found;
}

/** Ways tried from a junction, as turns from the heading (straight, right, left, back), and what each costs beside the block. */
const ROUTE_ORDER = [0, 1, 3, 2], ROUTE_TURN = [0, 100, 200, 101];
const routeScratch = new WeakMap<object, { mask: Uint8Array; seen: Int32Array; hops: Int32Array; cost: Int32Array; pred: Int32Array; queue: Int32Array; stamp: number }>();

/**
 * The ways to take, junction by junction, from junction `node` (arriving
 * heading `d`) until the car has driven along the street from `a` to `b`
 * (either way): the fewest blocks, then the fewest turns, right before left,
 * never straight back unless the road ends (the remake's planner rules, as in
 * `turnRoute`; the original plans with 0x618360). Null if it cannot get there.
 */
export function tripRoute(w: WorldState, node: number, d: number, a: number, b: number): number[] | null {
  const g = streetGraph(w), width = w.gridW + 1, states = g.points.length * 4;
  let r = routeScratch.get(g);
  if (!r) {
    // Which ways out of each junction are open, as four bits; and the search's
    // arrays, reused (a stamp marks the states this search has reached).
    const mask = new Uint8Array(g.points.length);
    for (let n = 0; n < mask.length; n++) for (let h = 0; h < 4; h++) if (g.neighbours[n].includes(n + HY[h] * width + HX[h])) mask[n] |= 1 << h;
    r = { mask, seen: new Int32Array(states), hops: new Int32Array(states), cost: new Int32Array(states), pred: new Int32Array(states), queue: new Int32Array(states), stamp: 0 };
    routeScratch.set(g, r);
  }
  const { mask, seen, hops, cost, pred, queue } = r, stamp = ++r.stamp;
  const first = node * 4 + d;
  seen[first] = stamp; hops[first] = 0; cost[first] = 0; pred[first] = first;
  let head = 0, tail = 0, bestHops = Infinity, bestCost = Infinity, bestState = -1, bestWay = -1;
  queue[tail++] = first;
  while (head < tail) {
    const s = queue[head++], n = s >> 2, h = s & 3, m = mask[n];
    if (hops[s] + 1 > bestHops) break;
    // Straight on, right, left; straight back only where the road ends.
    const onward = m & ((1 << h) | (1 << ((h + 1) & 3)) | (1 << ((h + 3) & 3)));
    const allowed = onward || (m & (1 << ((h + 2) & 3)));
    for (let i = 0; i < 4; i++) {
      const t = (h + ROUTE_ORDER[i]) & 3;
      if (!(allowed & (1 << t))) continue;
      const next = n + HY[t] * width + HX[t], c = cost[s] + ROUTE_TURN[ROUTE_ORDER[i]];
      if ((n === a && next === b) || (n === b && next === a)) {
        if (hops[s] + 1 < bestHops || c < bestCost) { bestHops = hops[s] + 1; bestCost = c; bestState = s; bestWay = t; }
        continue;
      }
      const ns = next * 4 + t;
      if (seen[ns] !== stamp) { seen[ns] = stamp; hops[ns] = hops[s] + 1; cost[ns] = c; pred[ns] = s; queue[tail++] = ns; }
      else if (hops[ns] === hops[s] + 1 && c < cost[ns]) { cost[ns] = c; pred[ns] = s; }
    }
  }
  if (bestState < 0) return null;
  const ways = [bestWay];
  for (let s = bestState; pred[s] !== s; s = pred[s]) ways.push(s & 3);
  return ways.reverse();
}

/**
 * The original city's trip for car `k` (its `trip`th) from junction `node`,
 * heading `d`: the ways to take, one per junction. As 0x6121F0 redraws a
 * destination whose lane cell shares the car's row or column (0x6161E0's
 * loop), a street in line with the car is drawn again; so is one it cannot
 * reach. Null after eight draws.
 */
export function originalTrip(w: WorldState, k: number, trip: number, node: number, d: number): number[] | null {
  const width = w.gridW + 1, nx = node % width, ny = Math.floor(node / width);
  for (let attempt = 0; attempt < 8; attempt++) {
    const goal = drawTripGoal(w, k, trip * 8 + attempt, node);
    if (!goal) return null;
    const ax = goal.a % width, ay = Math.floor(goal.a / width), bx = goal.b % width;
    if (ax === bx ? ax === nx : ay === ny) continue;
    const route = tripRoute(w, node, d, goal.a, goal.b);
    if (route) return route;
  }
  return null;
}

/** The drive of car `k`, worked out past `distance` and one junction beyond. */
function driveTo(w: WorldState, k: number, distance: number): Drive {
  const { specs, drives } = carSpecs(w);
  let drive = drives[k];
  if (!drive || distance < drive.at[0]) drive = drives[k] = startDrive(w, specs[k]);
  while (drive.at.length < 3 || drive.at[drive.at.length - 2] <= distance) extendDrive(w, k, drive);
  // Forget the corners well behind (a car drives on for weeks).
  if (drive.at.length > 400 && drive.at[200] < distance - 200) {
    for (const key of ['x', 'y', 'at', 'head', 'junction'] as const) drive[key].splice(0, 200);
  }
  return drive;
}

let cacheWorld: WorldState | null = null;
let cacheTime = NaN;
let cacheCars: Car[] = [];

/**
 * Every car in the city at a moment of the working week (in minutes,
 * fractional allowed). A car stopped this minute sits where the minute
 * found it.
 */
export function carsAt(w: WorldState, time: number): Car[] {
  if (w === cacheWorld && time === cacheTime) return cacheCars;
  const st = trafficState(w);
  const { specs } = carSpecs(w);
  const g = streetGraph(w);
  // The clock runs on from week to week: a car's drive does not restart.
  const weekStart = Math.max(0, (w.week ?? 1) - 1) * MINUTES_PER_WEEK;
  const minute = Math.floor(time);
  const cars: Car[] = [];
  for (let k = 0; k < specs.length; k++) {
    const { truck, color } = specs[k];
    const halted = st.halted[k];
    const distance = Math.max(0, weekStart + (halted ? minute : time) - st.delay[k]) * AMBIENT_SPEED;
    const drive = driveTo(w, k, distance);
    let lo = 0, hi = drive.at.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (drive.at[mid] <= distance) lo = mid; else hi = mid; }
    const span = drive.at[hi] - drive.at[lo], f = span > 0 ? Math.min(1, (distance - drive.at[lo]) / span) : 0;
    const x = drive.x[lo] + (drive.x[hi] - drive.x[lo]) * f, y = drive.y[lo] + (drive.y[hi] - drive.y[lo]) * f;
    const head = drive.head[hi], axisX = (head & 1) === 0, dir: 1 | -1 = head < 2 ? 1 : -1;
    const j = drive.junction[hi], jp = j >= 0 ? g.points[j] : null;
    const exit = drive.head[hi + 1] ?? head;
    const dx = drive.x[hi] - drive.x[lo], dy = drive.y[hi] - drive.y[lo];
    const heading = dx * dx + dy * dy > 1e-8
      ? -Math.atan2(dy, dx)
      : (axisX ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    cars.push({
      axisX, line: Math.round((axisX ? y : x) / CELL), dir, truck, speed: AMBIENT_SPEED, s: axisX ? x : y, x, y, color, halted,
      waited: st.waited[k], id: k, heading,
      junction: jp ? { x: jp.x, y: jp.y, ahead: drive.at[hi] - distance, exit } : undefined,
    });
  }
  cacheWorld = w;
  cacheTime = time;
  cacheCars = cars;
  return cars;
}

/** Which street a crossing spans, and where, from the two ends of the walk across it. */
export function crossingOf(at: Vec2, next: Vec2): OccupiedCrossing {
  const mx = (at.x + next.x) / 2;
  const my = (at.y + next.y) / 2;
  const alongX = Math.abs(next.x - at.x) >= Math.abs(next.y - at.y);
  // Walking along x means crossing a column street, which runs along y.
  return alongX
    ? { axisX: false, line: Math.round(mx / CELL), s: my, mx, my, wx: at.x, wy: at.y }
    : { axisX: true, line: Math.round(my / CELL), s: mx, mx, my, wx: at.x, wy: at.y };
}

let usedWorld: WorldState | null = null;
let usedMinute = -1;
let usedCache: OccupiedCrossing[] = [];

/** Every crossing with a walker actually on it, off the kerb. */
export function crossingsInUse(w: WorldState): OccupiedCrossing[] {
  if (w === usedWorld && w.minute === usedMinute) return usedCache;
  return scanStreets(w).crossings;
}

/**
 * One pass over the city's people for the minute's traffic: the crossings
 * with a walker on them, and the people at the wheel. (Two passes over
 * 8,000 people a minute were a visible share of the tick.)
 */
function scanStreets(w: WorldState, index = 0, count = 1): { crossings: OccupiedCrossing[]; drivers: Driver[] } {
  const crossings: OccupiedCrossing[] = [], drivers: Driver[] = [];
  for (const p of count > 1 ? peopleSlice(w, index, count) : peopleList(w)) {
    if (!p.dest || p.status !== 'active') continue;
    if (p.inVehicle) {
      if (!p.vehicleKey || w.vehicleFleet?.[p.vehicleKey]?.driverId === p.id) drivers.push(p);
      continue;
    }
    const next = p.path[0];
    if (!next?.cross) continue;
    const d = Math.hypot(next.x - p.pos.x, next.y - p.pos.y);
    if (d < next.cross - 0.75) crossings.push(crossingOf(p.pos, next));
  }
  return { crossings, drivers };
}

/**
 * The street scan for the coming minute, a slice of the people at a time
 * (sim.ts runs the walking in slices; each slice is scanned as soon as it has
 * stepped, since nothing else moves those people before the tick reads it).
 * tickTraffic uses the slices when all of them are there for its minute,
 * and scans everyone itself otherwise.
 */
let slices: { world: WorldState; minute: number; count: number; parts: (ReturnType<typeof scanStreets> | undefined)[] } | null = null;

/**
 * The same scan, one person at a time, while the ambient walk has him in
 * hand: a second pass over 8,000 people a minute cost more than the checks.
 */
export function streetScanCollector(w: WorldState): { part: ReturnType<typeof scanStreets>; add: (p: Person) => void } {
  const part: ReturnType<typeof scanStreets> = { crossings: [], drivers: [] };
  const add = (p: Person) => {
    if (!p.dest || p.status !== 'active') return;
    if (p.inVehicle) {
      if (!p.vehicleKey || w.vehicleFleet?.[p.vehicleKey]?.driverId === p.id) part.drivers.push(p);
      return;
    }
    const next = p.path[0];
    if (!next?.cross) return;
    const d = Math.hypot(next.x - p.pos.x, next.y - p.pos.y);
    if (d < next.cross - 0.75) part.crossings.push(crossingOf(p.pos, next));
  };
  return { part, add };
}

export function storeStreetSlice(w: WorldState, index: number, count: number, part: ReturnType<typeof scanStreets>): void {
  if (!slices || slices.world !== w || slices.minute !== w.minute || slices.count !== count)
    slices = { world: w, minute: w.minute, count, parts: new Array(count) };
  slices.parts[index] = part;
}

export function scanStreetSlice(w: WorldState, index: number, count: number): void {
  if (!slices || slices.world !== w || slices.minute !== w.minute || slices.count !== count)
    slices = { world: w, minute: w.minute, count, parts: new Array(count) };
  slices.parts[index] = scanStreets(w, index, count);
}

function scannedSlices(w: WorldState): ReturnType<typeof scanStreets> | null {
  if (!slices || slices.world !== w || slices.minute !== w.minute) return null;
  const crossings: OccupiedCrossing[] = [], drivers: Driver[] = [];
  for (let i = 0; i < slices.count; i++) {
    const part = slices.parts[i];
    if (!part) return null;
    for (const c of part.crossings) crossings.push(c);
    for (const d of part.drivers) drivers.push(d);
  }
  return { crossings, drivers };
}

let scanWorld: WorldState | null = null;
let scanMinute = -1;
let scanDrivers: Driver[] = [];

/**
 * The cars' minute: a car that was stopped falls a minute further behind,
 * then every car looks for a crossing in use just in front of it and stops
 * short of it. A car further off drives on; the walker will be across before
 * it arrives, or it stops when it gets there.
 */
export function tickTraffic(w: WorldState): void {
  const st = trafficState(w);
  for (let k = 0; k < st.delay.length; k++) {
    if (st.halted[k]) {
      st.delay[k] += 1;
      st.waited[k] += 1;
    } else {
      st.waited[k] = 0;
    }
    st.halted[k] = false;
  }
  cacheTime = NaN;
  const cars = carsAt(w, w.minute);
  const scan = scannedSlices(w) ?? scanStreets(w);
  slices = null;
  const used = scan.crossings;
  // The drivers are read from this same pass when the minute's context is built.
  scanWorld = w; scanMinute = w.minute; scanDrivers = scan.drivers;
  usedWorld = w;
  usedMinute = w.minute;
  usedCache = used;
  if (used.length) {
    const usedBy = byStreet(used);
    for (let k = 0; k < cars.length; k++) {
      const c = cars[k];
      const list = usedBy.get(streetKey(c.axisX, c.line));
      if (!list) continue;
      // A car already in a junction clears it, stopping only for somebody
      // right in front: one stopped in the middle for a walker beyond held the
      // cross traffic for the best part of two hours.
      const inJunction = Math.abs(c.s - Math.round(c.s / CELL) * CELL) < GIVE_WAY_INSIDE;
      for (const x of list) {
        const gap = (x.s - c.s) * c.dir;
        if (gap > -2 && gap < (inJunction ? 3 : BRAKING_DISTANCE)) {
          st.halted[k] = true;
          break;
        }
      }
    }
  }
  // The sim's own cars and the delivery trucks are in the road too: a car
  // closing on one in its lane waits behind it rather than driving through it.
  const ahead: Vec2[] = [];
  for (const d of scan.drivers) ahead.push(d.pos);
  for (const d of Object.values(w.goodsDeliveries ?? {})) if (d.path.length) ahead.push(d.pos);
  if (ahead.length) {
    const inRoad = byStreet(ahead.flatMap(onStreets));
    for (let k = 0; k < cars.length; k++) {
      if (st.halted[k]) continue;
      const c = cars[k];
      for (const o of inRoad.get(streetKey(c.axisX, c.line)) ?? []) {
        if (Math.abs(o.across - (c.axisX ? c.y : c.x)) >= BODY_IN_LANE) continue;
        const gap = (o.s - c.s) * c.dir;
        if (gap > 0 && gap < c.speed + FOLLOW_GAP) { st.halted[k] = true; break; }
      }
    }
  }
  // Into a junction one at a time, as the original's cars claim its cells:
  // a car waits short of one with a car in it, or a car just out of it in
  // the lane it would turn into, or a car nearer it about to go in. One held
  // half an hour carries on regardless, so no ring of them waits for ever.
  const entering = new Map<string, number>();
  const nearing = (k: number) => {
    const c = cars[k], j = c.junction;
    return !st.halted[k] && !!j && j.ahead <= c.speed + 2 && Math.hypot(c.x - j.x, c.y - j.y) >= JUNCTION_BOX;
  };
  for (let k = 0; k < cars.length; k++) {
    if (!nearing(k)) continue;
    const j = cars[k].junction!, key = `${j.x},${j.y}`, first = entering.get(key);
    if (first === undefined || cars[first].junction!.ahead > j.ahead) entering.set(key, k);
  }
  for (let k = 0; k < cars.length; k++) {
    if (!nearing(k) || st.waited[k] > 30) continue;
    const c = cars[k], j = c.junction!;
    if (entering.get(`${j.x},${j.y}`) !== k) { st.halted[k] = true; continue; }
    const exitAxisX = (j.exit & 1) === 0, exitDir = j.exit < 2 ? 1 : -1, exitLine = Math.round((exitAxisX ? j.y : j.x) / CELL);
    const busy = (x: number, y: number) => Math.abs(x - j.x) < JUNCTION_BOX && Math.abs(y - j.y) < JUNCTION_BOX;
    let held = ahead.some(p => busy(p.x, p.y));
    for (let m = 0; m < cars.length && !held; m++) {
      if (m === k) continue;
      const o = cars[m];
      if (busy(o.x, o.y)) held = true;
      else if (o.axisX === exitAxisX && o.line === exitLine && o.dir === exitDir) {
        const along = (o.s - (exitAxisX ? j.x : j.y)) * exitDir;
        if (along > 0 && along < FOLLOW_GAP + c.speed) held = true;
      }
    }
    if (held) st.halted[k] = true;
  }
  // A queue: a car closing on a stopped car in front stops behind it. (The
  // cars share a pace, so moving cars keep their distance.)
  const lanes = new Map<number, number[]>();
  cars.forEach((c, k) => {
    const key = laneKey(c.axisX, c.line, c.dir), list = lanes.get(key);
    if (list) list.push(k); else lanes.set(key, [k]);
  });
  for (const lane of lanes.values()) {
    if (lane.length < 2) continue;
    for (let changed = true, guard = 0; changed && guard < lane.length; guard++) {
      changed = false;
      for (const f of lane) {
        if (st.halted[f]) continue;
        const c = cars[f];
        for (const l of lane) {
          if (l === f || !st.halted[l]) continue;
          const gap = (cars[l].s - c.s) * c.dir;
          if (gap > 0 && gap < c.speed + FOLLOW_GAP) { st.halted[f] = true; changed = true; break; }
        }
      }
    }
  }
  // Positions for the rest of the minute now know who is stopped, and the
  // minute's context is rebuilt from them (an ambient slice run ahead of the
  // tick may already have built one for this minute).
  cacheTime = NaN;
  ctxWorld = null;
}

/** Where a point in the road lies on each street it is on: along it, and its line across it. */
function onStreets(p: Vec2): { axisX: boolean; line: number; s: number; across: number }[] {
  const out: { axisX: boolean; line: number; s: number; across: number }[] = [];
  const row = Math.round(p.y / CELL), col = Math.round(p.x / CELL);
  if (Math.abs(p.y - row * CELL) < STREET_WIDTH / 2) out.push({ axisX: true, line: row, s: p.x, across: p.y });
  if (Math.abs(p.x - col * CELL) < STREET_WIDTH / 2) out.push({ axisX: false, line: col, s: p.y, across: p.x });
  return out;
}

/** What a walker at a kerb, or a driver at the wheel, looks at before moving. */
export interface TrafficContext {
  world?: WorldState;
  cars: Car[];
  /** The same cars, by the street they are on. */
  carsByStreet: Map<number, Car[]>;
  /** The sim's own people at the wheel, who are not on the timetable. */
  drivers: Driver[];
  /** Crossings with somebody on them when the minute began. */
  crossings: OccupiedCrossing[];
}

let ctxWorld: WorldState | null = null;
let ctxMinute = -1;
let ctx: TrafficContext = { cars: [], carsByStreet: new Map(), drivers: [], crossings: [] };

/** The traffic for the current minute, built once a tick however many ask. */
export function trafficContext(w: WorldState): TrafficContext {
  if (w === ctxWorld && w.minute === ctxMinute) return ctx;
  // tickTraffic has usually just scanned the streets this minute.
  const drivers = w === scanWorld && w.minute === scanMinute ? [...scanDrivers] : scanStreets(w).drivers;
  for (const delivery of Object.values(w.goodsDeliveries ?? {})) if (delivery.path.length) drivers.push(delivery);
  const cars = carsAt(w, w.minute);
  ctx = { world:w, cars, carsByStreet: byStreet(cars), drivers, crossings: crossingsInUse(w) };
  ctxWorld = w;
  ctxMinute = w.minute;
  return ctx;
}

/**
 * Whether anything is bearing down on a crossing. A car that has just
 * stopped for the crossing does not count; from the next minute the walkers
 * hold back and let it through, so no car waits for a whole stream.
 */
export function crossingBlocked(t: TrafficContext, streetAxisX: boolean, line: number, s0: number, mx: number, my: number): boolean {
  for (const c of t.carsByStreet.get(streetKey(streetAxisX, line)) ?? []) {
    if (c.halted && c.waited === 0) continue;
    const gap = (s0 - c.s) * c.dir;
    if (gap > CAR_CLEARANCE && gap < c.speed * WALKER_LEAD_MINUTES + CAR_MARGIN) return true;
  }
  // A sim car coming along the street to this crossing, or standing at it,
  // holds the walkers (one waiting for them must get its turn). A car on
  // another street, or driving away, held crossings for nothing — and a
  // crawling lorry kept a corner shut for an hour.
  for (const d of t.drivers) {
    if (Math.abs((streetAxisX ? d.pos.y : d.pos.x) - line * CELL) >= STREET_WIDTH / 2 + 3) continue;
    const off = s0 - (streetAxisX ? d.pos.x : d.pos.y);
    if (Math.abs(off) >= DRIVER_RADIUS) continue;
    const n = d.path[0];
    const head = n ? (streetAxisX ? n.x - d.pos.x : n.y - d.pos.y) : 0;
    if (Math.abs(off) < 3 || (head !== 0 && Math.sign(head) === Math.sign(off))) return true;
  }
  void mx; void my;
  return false;
}

/**
 * Whether a driver heading for `next` has a walker in the road just ahead,
 * in the car's own path. A walker still on the far half of the street is no
 * reason to stop: the car is by long before they reach its lane, and a car
 * standing for somebody across the road looked stalled for nothing.
 */
export function roadAheadBlocked(t: TrafficContext, at: Vec2, next: Vec2): boolean {
  if (!t.crossings.length) return false;
  const hx = next.x - at.x;
  const hy = next.y - at.y;
  const len = Math.hypot(hx, hy);
  if (len < 0.5) return false;
  const ux = hx / len;
  const uy = hy / len;
  // Only a crossing over the street being driven along is in the car's way.
  // At a junction the walkers crossing the side street pass beside the car:
  // stopping for them left cars standing in an empty road.
  const drivingAlongX = Math.abs(ux) >= Math.abs(uy);
  for (const x of t.crossings) {
    if (x.axisX !== drivingAlongX) continue;
    const dx = x.wx - at.x;
    const dy = x.wy - at.y;
    const along = dx * ux + dy * uy;
    const across = Math.abs(dx * uy - dy * ux);
    if (along > -2 && along < BRAKING_DISTANCE && across < IN_THE_WAY) return true;
  }
  return false;
}

/**
 * How far a driver heading for `next` may go this minute without running
 * into the back of a car in its lane: that car's place at the end of the
 * minute, less the following distance. Infinity on an open road.
 */
export function roadAheadRoom(t: TrafficContext, at: Vec2, next: Vec2, self?: object, after?: Vec2): number {
  // The cars keep their timetable only in the working week; outside it they
  // stand still and are nobody's obstacle.
  if (t.world && t.world.phase !== 'week') return Infinity;
  const hx = next.x - at.x, hy = next.y - at.y;
  if (Math.abs(hx) < 0.5 && Math.abs(hy) < 0.5) return Infinity;
  const alongX = Math.abs(hx) >= Math.abs(hy);
  const dir = Math.sign(alongX ? hx : hy);
  const line = Math.round((alongX ? at.y : at.x) / CELL);
  // Turning off this street at `next`: only what is between here and the
  // corner is in the way. (A car further on, on the street being left, held
  // turning cars at the junction for nothing — for an hour if it was itself held.)
  const turnsThere = !!after && (alongX ? Math.abs(after.y - next.y) > 0.5 : Math.abs(after.x - next.x) > 0.5);
  const reach = turnsThere ? Math.hypot(hx, hy) + 1 : Infinity;
  let room = Infinity;
  for (const c of t.carsByStreet.get(streetKey(alongX, line)) ?? []) {
    if (c.dir !== dir) continue;
    if (Math.abs(alongX ? c.y - at.y : c.x - at.x) >= SAME_LANE) continue;
    const along = (alongX ? c.x - at.x : c.y - at.y) * dir;
    if (along <= 0 || along > reach) continue;
    room = Math.min(room, along + (c.halted ? 0 : c.speed) - FOLLOW_GAP);
  }
  // The sim's own cars and lorries in this lane, going this way: follow them
  // too (they drove through one another — a crew's two cars as one).
  const idOf = (x: object | undefined) => (x as Driver | undefined)?.id ?? (x as Driver | undefined)?.sourceId ?? -1;
  for (const d of t.drivers) {
    if (d === self) continue;
    // One that has arrived stands at the kerb: pass it, as the original's
    // cars sidestep a standing one in their lane (a truck stopping just
    // beyond another waited behind it for the rest of the week).
    if (!d.path.length) continue;
    if (Math.abs(alongX ? d.pos.y - at.y : d.pos.x - at.x) >= SAME_LANE) continue;
    const along = (alongX ? d.pos.x - at.x : d.pos.y - at.y) * dir;
    if (along <= -0.5 || along > Math.min(reach, GIVE_WAY_LOOK + FOLLOW_GAP)) continue;
    const n = d.path[0];
    if (n && (alongX ? n.x - d.pos.x : n.y - d.pos.y) * dir < -0.5) continue; // coming the other way
    // Side by side (two cars from one spot): the lower id goes first.
    if (along < 0.5) { if (idOf(d) < idOf(self)) room = 0; continue; }
    room = Math.min(room, along - FOLLOW_GAP);
  }
  // Give way at a junction: with a car coming along the cross street, wait
  // at the line short of it rather than cross its path or turn in under its
  // nose. A driver already over the line carries on through.
  // The next crossroads on the way to `next`, turning there or going straight over.
  const a = alongX ? at.x : at.y, b = alongX ? next.x : next.y;
  const node = (dir > 0 ? Math.ceil((a + GIVE_WAY_INSIDE) / CELL) : Math.floor((a - GIVE_WAY_INSIDE) / CELL)) * CELL;
  const toJunction = (node - a) * dir;
  const junctionAhead = toJunction <= (b - a) * dir + JUNCTION && toJunction < GIVE_WAY_LOOK;
  // Don't block the box: a car that would have to stop inside the junction
  // (queued behind one just beyond it) waits at the line before it instead.
  if (junctionAhead && room < Infinity && room > toJunction - GIVE_WAY_LINE && room < toJunction + CLEAR_PAST)
    room = toJunction - GIVE_WAY_LINE;
  // The same for a walker on the crossing just beyond the corner, in the
  // street it turns into: wait at the line, not stopped in the junction.
  if (junctionAhead && after && toJunction > GIVE_WAY_INSIDE && roadAheadBlocked(t, next, after))
    room = Math.min(room, toJunction - GIVE_WAY_LINE);
  if (junctionAhead) {
    {
      const cross = streetKey(!alongX, Math.round(node / CELL));
      const s0 = line * CELL;
      const side = Math.sign((alongX ? at.y : at.x) - line * CELL);
      const swing = after ? Math.sign(alongX ? after.y - next.y : after.x - next.x) : 0;
      // Turning in to the kerb, the car keeps to the near half of the junction
      // and joins the near lane: only that lane's traffic is in its way. (The
      // original's cars claim only the cells they cross; one turning right
      // waited 48 minutes on a car held in the far lane.)
      const kerbTurn = Math.abs(b - node) < JUNCTION && swing !== 0 && swing === side;
      for (const c of t.carsByStreet.get(cross) ?? []) {
        if (kerbTurn && c.dir !== swing) continue;
        const gap = (s0 - c.s) * c.dir;
        if (c.halted ? gap > -CLEAR_PAST && gap < JUNCTION : gap > -CLEAR_PAST && gap < c.speed + GIVE_WAY_LINE) {
          room = Math.min(room, toJunction - GIVE_WAY_LINE);
          break;
        }
      }
      // Turning there across the oncoming lane, an oncoming car in the junction
      // is in the way. Going straight on, or turning to the kerb side, it is
      // not (cars waited for it at every junction).
      const turning = Math.abs(b - node) < JUNCTION && swing !== 0 && swing === -side;
      if (turning) for (const c of t.carsByStreet.get(streetKey(alongX, line)) ?? []) {
        if (c.dir !== dir && Math.abs(node - c.s) < JUNCTION) { room = Math.min(room, toJunction - GIVE_WAY_LINE); break; }
      }
    }
  }
  return Math.max(0, room);
}
import { streetGraph } from './cityLayout';
