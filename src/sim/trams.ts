/**
 * Street trams.
 *
 * The original (the original executable, traced 29 October 2026; see
 * docs/audit/2026-10-29/trams/review.md):
 *
 * - Its avenue blocks are tramways. The block-name panel 0x4EC3D0 calls
 *   contents 34..37 (east-west, north-south, crossing, bridge) "Tramway" and
 *   41, where the elevated railway crosses an avenue, "Tram crossing".
 * - CityGen 0x53A520 puts trams (class 0x620D80: object type 8, "A tram" in
 *   the debug panel 0x719F90) on every avenue: four each way, on the avenue
 *   block's middle cell, eastbound / southbound on the right-hand track
 *   (sub-cell 0x48 / 0x18 of 0x60), starting at cells W/2 + k·W along a
 *   5W-cell avenue (H/2 + k·H down a 5H-cell one): 64 trams on the stock map.
 * - Each runs to one cell past the map edge (x = 5W or -1), crosses to the
 *   other track and comes back (update 0x621020), so an avenue's eight trams
 *   go round one loop. Re-entering, a tram waits off the map until the one
 *   ahead is W (H) cells away, the spacing they start with.
 * - Top speed 3 (vehicle record +0x2512, set at 0x652785), the same as the
 *   commonest car's.
 * - There are no fixed stops: a tram halts where a walker boards it
 *   (0x5DCDF0 / 0x6220E0) and drops him where he asked (0x622410), without
 *   stopping (tramRiding.ts).
 *
 * The remake keeps the loop and the spacing. A tram's place is its timetable,
 * a pure function of the clock as the traffic's is, less the minutes it has
 * stood (`TramState`, as `TrafficState` keeps the cars'): for a boarder, for
 * a tram standing ahead of it, or off the map until the one ahead is far
 * enough on. Nothing stands until someone rides, so a city without riders
 * keeps the bare timetable and saves nothing. Compact cities' two saved
 * routes get the same service; their stop signs (a remake addition) get a
 * short dwell.
 */

import { CELL, MINUTES_PER_SECOND, MINUTES_PER_WEEK } from './constants';
import { streetEdgeOpen, streetName } from './cityLayout';
import type { Vec2, WorldState } from './types';

export type TramLine = NonNullable<WorldState['cityLayout']>['tramLines'][number];

/** One of the original's map cells: five to a block. */
const FINE = CELL / 5;
/** Metres per minute: the cars' pace (traffic.ts), as the original gives trams and its commonest car top speed 3. */
export const TRAM_SPEED = 23 * 0.15 / MINUTES_PER_SECOND;
/** A track's centre, right of the line's centre in the direction of travel (the drawn rails' gauge centres). */
export const TRAM_TRACK = 1.55;
/** Length of a tram body, in metres. */
export const TRAM_LENGTH = 11;
/** Trams per direction on each line (0x53A520: four each way). */
export const TRAMS_PER_DIRECTION = 4;
/** Where they start, as fractions of the line: cells W/2 + k·W of a 5W-cell avenue. */
const STARTS = [0.1, 0.3, 0.5, 0.7];
/** Remake: minutes a tram stands at a compact city's stop. The original has no fixed stops. */
export const TRAM_STOP_DWELL = 12;
/** The original's tram colour on the plans (the legend's tram red). */
const ORIGINAL_TRAM_COLOR = '#9b5143';

/**
 * The original city's tram lines: one straight line down the middle of each
 * avenue, from map edge to map edge (0x53A520: x from -1 to 5W along row
 * 5·row + 2, y likewise down column 5·col + 2). The avenues run unbroken
 * across the stock map (rivers are crossed by bridges, content 37).
 */
export function originalTramLines(w: WorldState): TramLine[] {
  const avenues = w.cityLayout?.original?.avenues;
  if (!avenues) return [];
  const lines: TramLine[] = [];
  for (const row of avenues.rows) {
    const y = (row + .5) * CELL;
    lines.push({ name: `${streetName(w, 'ew', row)} tramway`, color: ORIGINAL_TRAM_COLOR,
      points: [{ x: 0, y }, { x: w.gridW * CELL, y }], stops: [] });
  }
  for (const col of avenues.cols) {
    const x = (col + .5) * CELL;
    lines.push({ name: `${streetName(w, 'ns', col)} tramway`, color: ORIGINAL_TRAM_COLOR,
      points: [{ x, y: 0 }, { x, y: w.gridH * CELL }], stops: [] });
  }
  return lines;
}

const derived = new WeakMap<WorldState, TramLine[]>();
/**
 * The city's tram lines. An original city saved before trams were added has
 * none saved; it gets its avenues' lines, as a new one does.
 */
export function cityTramLines(w: WorldState): TramLine[] {
  const saved = w.cityLayout?.tramLines ?? [];
  if (saved.length || !w.cityLayout?.original) return saved;
  let lines = derived.get(w);
  if (!lines) derived.set(w, lines = originalTramLines(w));
  return lines;
}

/** A line the city can carry: on its streets, or (original city) down the middle of an avenue. */
export function tramLineValid(w: WorldState, line: TramLine): boolean {
  const pts = line.points;
  if (!Array.isArray(pts) || pts.length < 2 || pts.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
    p.x < 0 || p.y < 0 || p.x > w.gridW * CELL || p.y > w.gridH * CELL)) return false;
  if (!Array.isArray(line.stops) || line.stops.some(stop => !pts.some(p => p.x === stop.pos.x && p.y === stop.pos.y))) return false;
  const avenues = w.cityLayout?.original?.avenues;
  const onAvenue = (a: Vec2, b: Vec2) => !!avenues && (
    (a.y === b.y && avenues.rows.some(r => (r + .5) * CELL === a.y) && a.x !== b.x) ||
    (a.x === b.x && avenues.cols.some(c => (c + .5) * CELL === a.x) && a.y !== b.y));
  return pts.slice(1).every((p, i) => onAvenue(pts[i], p) ||
    streetEdgeOpen(w, pts[i].x / CELL, pts[i].y / CELL, p.x / CELL, p.y / CELL));
}

export interface Tram {
  /** Index of its line in `cityTramLines`. */
  line: number;
  /** Which of the line's trams (0..7: the first four start outbound). */
  index: number;
  x: number;
  y: number;
  /** Unit direction of travel. */
  dx: number;
  dy: number;
  /** Distance from the line's first point (negative or past its end while turning off the map). */
  along: number;
  /** Outbound (first point to last) or coming back. */
  outbound: boolean;
  /** Standing at a stop. */
  dwelling: boolean;
  /** Standing this minute (`TramState.halted`): for a boarder, behind a standing tram, or to re-enter. */
  halted: boolean;
  /** Its place round the line's loop, in metres (out along the line, the turn, back and the turn). */
  loop: number;
  /** The whole body is on the map. */
  visible: boolean;
}

/**
 * What the trams carry between minutes, as `TrafficState` does for the cars:
 * the minutes each has stood behind its timetable, and whether it stands this
 * minute. Indexed as `tramsAt` lists them. Absent until a tram first stands.
 */
export interface TramState {
  delay: number[];
  halted: boolean[];
}

interface Route {
  pts: Vec2[];
  cum: number[];
  length: number;
  /** How far past each end a tram runs before it turns: to the middle of the cell off the map. */
  overrun: number;
  /** Loop positions of the stops, ascending. */
  stops: number[];
  loop: number;
  period: number;
  /** Each tram's place in the period at time zero. */
  phase: number[];
}

const routeCache = new WeakMap<TramLine, Route>();
function route(line: TramLine): Route {
  const cached = routeCache.get(line);
  if (cached) return cached;
  const pts = line.points, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const length = cum[cum.length - 1], overrun = FINE / 2, leg = length + 2 * overrun, loop = 2 * leg;
  const stopAlong = line.stops.map(s => cum[pts.findIndex(p => p.x === s.pos.x && p.y === s.pos.y)]);
  const stops = [...stopAlong.map(s => overrun + s), ...stopAlong.map(s => leg + overrun + length - s)].sort((a, b) => a - b);
  const period = loop / TRAM_SPEED + stops.length * TRAM_STOP_DWELL;
  // Loop position to time since the loop's start, counting the dwells passed.
  const timeOf = (u: number) => u / TRAM_SPEED + stops.filter(s => s < u).length * TRAM_STOP_DWELL;
  // The original starts each at the middle of cell W/2 + k·W, on both tracks.
  const starts = STARTS.map(f => f * length + FINE / 2);
  const phase = [...starts.map(p => timeOf(overrun + p)), ...starts.map(p => timeOf(leg + overrun + length - p))];
  const r = { pts, cum, length, overrun, stops, loop, period, phase };
  routeCache.set(line, r);
  return r;
}

/** Loop position after `tau` minutes of the period, and whether the tram is standing at a stop. */
function loopAt(r: Route, tau: number): { u: number; dwelling: boolean } {
  let u = 0;
  for (const stop of r.stops) {
    const run = (stop - u) / TRAM_SPEED;
    if (tau < run) return { u: u + tau * TRAM_SPEED, dwelling: false };
    tau -= run;
    if (tau < TRAM_STOP_DWELL) return { u: stop, dwelling: true };
    tau -= TRAM_STOP_DWELL;
    u = stop;
  }
  return { u: Math.min(r.loop, u + tau * TRAM_SPEED), dwelling: false };
}

/** The point `s` metres along the line, carried straight on past either end. */
function pointAt(r: Route, s: number): Vec2 {
  const { pts, cum } = r, n = pts.length;
  let i = 1;
  while (i < n - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], span = cum[i] - cum[i - 1] || 1, f = (s - cum[i - 1]) / span;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Minutes since the campaign began: the trams run on from week to week. */
export function campaignMinutes(w: WorldState, time: number): number {
  return Math.max(0, (w.week ?? 1) - 1) * MINUTES_PER_WEEK + time;
}

/** How many trams the city runs: eight a line. */
export function tramCount(w: WorldState): number {
  return cityTramLines(w).reduce((n, line) => n + (route(line).length > 0 ? route(line).phase.length : 0), 0);
}

/** A line's length and the length of its loop round both turns, in metres. */
export function tramRoute(line: TramLine): { length: number; loop: number } {
  const r = route(line);
  return { length: r.length, loop: r.loop };
}

/** The saved state, when it fits the city's trams (a stale one is ignored, as the traffic's is replaced). */
export function savedTramState(w: WorldState): TramState | undefined {
  const st = w.trams, n = tramCount(w);
  return st && st.delay.length === n && st.halted.length === n ? st : undefined;
}

/**
 * Every tram at a moment of the working week (minutes, fractional allowed),
 * as `carsAt` takes it: its timetable less the minutes it has stood. One
 * standing this minute stays where the minute found it.
 */
export function tramsAt(w: WorldState, time: number): Tram[] {
  const st = savedTramState(w), out: Tram[] = [];
  cityTramLines(w).forEach((line, li) => {
    const r = route(line);
    if (r.length <= 0) return;
    const leg = r.length + 2 * r.overrun;
    r.phase.forEach((phase, index) => {
      const k = out.length, halted = st?.halted[k] ?? false;
      const t = campaignMinutes(w, halted ? Math.floor(time) : time) - (st?.delay[k] ?? 0);
      const tau = ((phase + t) % r.period + r.period) % r.period;
      const { u, dwelling } = loopAt(r, tau);
      const outbound = u < leg;
      const along = outbound ? u - r.overrun : r.length + r.overrun - (u - leg);
      // Heading from a few metres either side, so corners turn smoothly.
      const sign = outbound ? 1 : -1, a = pointAt(r, along - 3 * sign), b = pointAt(r, along + 3 * sign);
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1, dx = (b.x - a.x) / d, dy = (b.y - a.y) / d;
      const c = pointAt(r, along);
      out.push({ line: li, index, x: c.x - dy * TRAM_TRACK, y: c.y + dx * TRAM_TRACK, dx, dy, along, outbound, dwelling,
        halted, loop: u, visible: along >= TRAM_LENGTH / 2 && along <= r.length - TRAM_LENGTH / 2 });
    });
  });
  return out;
}
