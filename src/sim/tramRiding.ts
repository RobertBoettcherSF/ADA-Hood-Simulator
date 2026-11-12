/**
 * Riding the street trams (original city).
 *
 * The original (the original executable, traced 29 October 2026; see
 * docs/audit/2026-10-29/trams/review.md):
 *
 * - Catching (0x5DCDF0). A walker's walk goal checks every 64 of his updates,
 *   when the goal allows it, that he is on foot on a walkable cell, that his
 *   leg runs straight along x or y for at least 0x781 sub-units (96 to a map
 *   cell), that he is on an avenue's row (column) and that a tram heading his
 *   way is 0x78..300 sub-units behind him. He then walks across to the track
 *   beside him and back to the tram (goal 11, "Moving directly to target").
 * - Boarding (0x6220E0). The tram must be on the map with fewer than 40 aboard
 *   (vehicle record +0x2512). It stands (a halt step, type 4: speed eased to
 *   nothing) until he reaches it.
 * - Riding (goal 10, "Vehicle goal", in 0x5D2740). Getting in (0x622410)
 *   keeps the cell where his leg ends; if the tram has reached or passed it he
 *   is set down at once, and either way the halt ends. Travelling, he is taken
 *   off the map's cell lists (0x712810) and keeps the tram's position. When the
 *   tram reaches his cell, 0x621020 sends him message 6 (0x5D6B70: goal phase 3)
 *   and he is set down at the tram, which does not stop.
 *
 * Who may ride is a flag on the walk order (+0xC bit 3, read by 0x568870). No
 * code in the shipped game sets it (the order constructor 0x566900 clears it;
 * only the loaders and copies write it), so in the original nobody rides, and
 * the remake follows it (design decision, 29 October 2026): `TRAM_RIDING` is off and
 * the game never calls `tickTramRiding`. The port is kept whole behind it. Who
 * would ride: citizens on foot about their own business (`tramRideable`).
 *
 * Remake choices, should it be switched on: he is set down beside the tram and crosses to his footway,
 * then walks on to where he was going (the original re-routed him to his
 * leg's end); a boarder who has not reached his tram in three hours gives up
 * (the original has no limit); a tram closing on one that stands waits behind
 * it. Compact cities' trams carry no one: their routes are a remake addition
 * with stops the original has no rules for.
 */

import { CELL, PAVEMENT_OFFSET } from './constants';
import { cityStreetInset } from './cityLayout';
import { peopleList } from './entityLists';
import { clearDestination, setDestination, walkRoute } from './movement';
import {
  TRAM_LENGTH, TRAM_SPEED, campaignMinutes, cityTramLines, savedTramState, tramRoute, tramsAt,
  type Tram, type TramLine,
} from './trams';
import type { PathPoint, Person, TramRide, Vec2, WorldState } from './types';

/** The walk order's +0xC bit 3, which nothing in the shipped game sets: nobody rides. */
export const TRAM_RIDING = false;
/** One of the original's map cells, five to a block, and its 96 sub-units. */
const FINE = CELL / 5, SUB = FINE / 96;
/** 0x5DCDF0: his leg must run at least 0x781 sub-units (20 cells, four blocks). */
export const TRAM_CATCH_LEG = 0x781 * SUB;
/** 0x5DCDF0: the tram must be more than 0x78 and less than 300 sub-units behind him. */
export const TRAM_CATCH_NEAR = 0x78 * SUB, TRAM_CATCH_FAR = 300 * SUB;
/** Vehicle record +0x2512: 40 aboard, on both counts (0x6220E0). */
export const TRAM_CAPACITY = 40;
/** 0x5DCDF0 runs every 64 of his updates; the people pass runs every other
 * 30 ms tick, five a minute, so about every thirteen minutes. */
export const TRAM_CATCH_EVERY = 13;
/** Remake: minutes a boarder walks to his tram before he gives up. The walk
 * over the street and the median and back along the track is 60-70 m, about
 * two hours at walking pace; this only ends a walk held up for good. */
export const TRAM_BOARD_WAIT = 180;
/** Remake: metres a tram keeps behind one standing ahead of it. */
const TRAM_HEADWAY = 4;
/** From the track to where he stands beside the tram: half its 2.4 m body and a step. */
const DOOR = 1.6;
/** How far either side of a footway's middle a walker keeps (movement.ts), and a little over. */
const FOOTWAY_REACH = 1.7;

/** Who rides: a citizen on foot about his own business. */
export function tramRideable(w: WorldState, p: Person): boolean {
  return p.role === 'citizen' && p.status === 'active' && !p.inVehicle && p.orderId == null && p.streetOrder == null &&
    p.buildingId == null && !p.fbiAssignment && !p.emergencyResponse && !p.shockReaction && p.burningEscape?.week !== w.week;
}

/** A straight line of the original city: which way it runs, where across, and its length. */
interface Frame { alongX: boolean; centre: number; origin: number; sign: 1 | -1; length: number }
function frameOf(line: TramLine): Frame | null {
  if (line.points.length !== 2) return null;
  const [a, b] = line.points, alongX = a.y === b.y;
  if (alongX === (a.x === b.x)) return null;
  const span = alongX ? b.x - a.x : b.y - a.y;
  return { alongX, centre: alongX ? a.y : a.x, origin: alongX ? a.x : a.y, sign: span > 0 ? 1 : -1, length: Math.abs(span) };
}
const alongOf = (f: Frame, p: Vec2) => f.alongX ? p.x : p.y;
const acrossOf = (f: Frame, p: Vec2) => f.alongX ? p.y : p.x;
const point = (f: Frame, s: number, a: number): Vec2 => f.alongX ? { x: s, y: a } : { x: a, y: s };

/** The footway's middle on the avenue side of a flanking street, across the line. */
function medianFootway(w: WorldState, f: Frame, side: number): number {
  return f.centre + side * (CELL / 2 - PAVEMENT_OFFSET - cityStreetInset(w));
}
/** Where a walker from `kerb` stands beside the tram: on his side of it. */
function door(f: Frame, t: Tram, kerb: number): Vec2 {
  const side = Math.sign(kerb - f.centre) || 1;
  return point(f, alongOf(f, t), acrossOf(f, t) + side * DOOR);
}
/** The tram has reached his cell, or passed it (0x622410, 0x621020). */
function reached(t: Tram, drop: number): boolean {
  const cell = (s: number) => Math.floor(s / FINE);
  return (cell(drop) - cell(t.along)) * (t.outbound ? 1 : -1) <= 0;
}

/**
 * How far his walk runs straight on from where he stands along one axis: the
 * corners and crossings of one footway (0x5DCDF0 reads the walk goal, one
 * straight leg of the route). Where it ends, or NaN if he is not heading that way.
 */
function straightRun(p: Person, alongX: boolean, dir: 1 | -1): number {
  let end = NaN, prev: Vec2 = p.pos;
  for (const q of p.path) {
    if (Math.abs(alongX ? q.y - p.pos.y : q.x - p.pos.x) >= .5 || (alongX ? q.x - prev.x : q.y - prev.y) * dir < 0) break;
    end = alongX ? q.x : q.y;
    prev = q;
  }
  return end;
}

/** 0x5DCDF0 / 0x6220E0: catch a tram coming up behind him on his avenue, if one is there. */
function catchTram(w: WorldState, p: Person, trams: Tram[], frames: (Frame | null)[], aboard: number[], now: number, reach: number): boolean {
  const next = p.path[0];
  // On foot on a walkable cell (0x606450): not part way over a road.
  if (!next || next.cross && Math.hypot(next.x - p.pos.x, next.y - p.pos.y) < next.cross - .75) return false;
  // Heading straight along x or y, not on a slant.
  const dx = next.x - p.pos.x, dy = next.y - p.pos.y, alongX = Math.abs(dy) < .5;
  if (alongX ? Math.abs(dx) < .5 : Math.abs(dx) >= .5) return false;
  const dir: 1 | -1 = (alongX ? dx : dy) > 0 ? 1 : -1;
  // On the avenue: either footway of either flanking street (`reach`; the
  // original's avenue is one double-width road, the remake's has a median).
  let li = -1;
  for (let i = 0; i < frames.length && li < 0; i++) {
    const f = frames[i];
    if (f && f.alongX === alongX && Math.abs(acrossOf(f, p.pos) - f.centre) <= reach) li = i;
  }
  if (li < 0) return false;
  const f = frames[li]!, at = alongOf(f, p.pos), kerb = acrossOf(f, p.pos);
  // A leg of at least 0x781 sub-units.
  const end = straightRun(p, alongX, dir);
  if (!((end - at) * dir >= TRAM_CATCH_LEG)) return false;
  for (let k = 0; k < trams.length; k++) {
    const t = trams[k];
    if (t.line !== li || Math.sign(alongX ? t.dx : t.dy) !== dir) continue;
    // 0x6220E0: on the map, with room aboard.
    if (t.along < 0 || t.along > f.length || aboard[k] >= TRAM_CAPACITY) continue;
    const behind = (at - alongOf(f, t)) * dir;
    if (behind <= TRAM_CATCH_NEAR || behind >= TRAM_CATCH_FAR) continue;
    const side = Math.sign(kerb - f.centre) || 1, there = door(f, t, kerb);
    const path: PathPoint[] = [];
    // Over the flanking street first if he is on its far side.
    if (Math.abs(kerb - f.centre) > CELL / 2) {
      const foot = medianFootway(w, f, side);
      path.push({ ...point(f, at, foot), cross: Math.abs(foot - kerb) });
    }
    // Across to the track beside him, then back along it to the tram (goal 11).
    path.push(point(f, at, acrossOf(f, there)), there);
    p.tram = { tram: k, phase: 'boarding', drop: (end - f.origin) * f.sign, kerb, dest: { ...p.dest! }, since: now };
    p.dest = { ...there };
    p.path = path;
    p.halted = false;
    aboard[k]++;
    return true;
  }
  return false;
}

/** Set down beside the tram (0x5D2740 goal 10, phase 3): back over to his footway, then on to where he was going. */
function setDown(w: WorldState, p: Person, f: Frame, t: Tram, ride: TramRide): void {
  const s = alongOf(f, t), side = Math.sign(ride.kerb - f.centre) || 1, kerb = point(f, s, ride.kerb);
  p.pos = door(f, t, ride.kerb);
  p.tram = undefined;
  const path: PathPoint[] = [];
  if (Math.abs(ride.kerb - f.centre) > CELL / 2) {
    const foot = medianFootway(w, f, side);
    path.push(point(f, s, foot), { ...kerb, cross: Math.abs(ride.kerb - foot) });
  } else path.push(kerb);
  path.push(...walkRoute(kerb, ride.dest, p.id, w));
  p.dest = { ...ride.dest };
  p.path = path;
  p.halted = false;
}

/**
 * Which trams stand this minute: those waiting for a boarder; one closing on
 * a standing tram ahead (0x611300 brings a blocked tram to a stop); and one
 * coming back onto the map after its turn while the tram ahead is less than
 * a fifth of the line on (0x621020: W or H cells, its starting spacing).
 */
function holdTrams(lines: TramLine[], trams: Tram[], boarding: boolean[]): boolean[] {
  const halted = boarding.slice();
  const ahead = trams.map((t, k) => {
    const loop = tramRoute(lines[t.line]).loop;
    let j = -1, gap = Infinity;
    trams.forEach((o, i) => {
      if (i === k || o.line !== t.line) return;
      const g = ((o.loop - t.loop) % loop + loop) % loop;
      if (g > 0 && g < gap) { j = i; gap = g; }
    });
    return { j, gap };
  });
  for (let pass = 0, changed = true; changed && pass < trams.length; pass++) {
    changed = false;
    trams.forEach((t, k) => {
      const { j, gap } = ahead[k];
      if (halted[k] || j < 0) return;
      const length = tramRoute(lines[t.line]).length;
      const reentering = t.outbound ? t.along < 0 : t.along > length;
      if (reentering && gap < length / 5 - 1e-6 || halted[j] && gap < TRAM_LENGTH + TRAM_HEADWAY + TRAM_SPEED) {
        halted[k] = true;
        changed = true;
      }
    });
  }
  return halted;
}

/**
 * A boarder's or rider's minute: a boarder who has reached his tram gets on;
 * a rider keeps its place and gets off at his cell. Whether he is still on it.
 */
function rideOn(w: WorldState, p: Person, ride: TramRide, trams: Tram[], frames: (Frame | null)[], now: number): boolean {
  const t = trams[ride.tram], f = t && frames[t.line];
  if (!t || !f) { p.tram = undefined; return false; }
  if (!tramRideable(w, p)) {
    // Taken up by something else: a rider steps off where the tram is.
    if (ride.phase === 'riding') p.pos = door(f, t, ride.kerb);
    p.tram = undefined;
    return false;
  }
  if (ride.phase === 'boarding') {
    if (p.dest && now - ride.since < TRAM_BOARD_WAIT) return true;
    const there = door(f, t, ride.kerb);
    if (p.dest || Math.hypot(p.pos.x - there.x, p.pos.y - there.y) > 1) {
      // He never got there: he walks on to where he was going.
      p.tram = undefined;
      setDestination(w, p, ride.dest);
      return false;
    }
    // Aboard (0x622410); the halt ends. A tram already at his cell sets him down at once.
    ride.phase = 'riding';
    clearDestination(p);
  }
  if (reached(t, ride.drop) || t.along < 0 || t.along > f.length) {
    setDown(w, p, f, t, ride);
    return false;
  }
  p.pos = { x: t.x, y: t.y };
  return true;
}

/**
 * The minute's tram riding, after the walkers have stepped: trams that stood
 * fall a minute further behind; boarders who have reached theirs get on,
 * riders keep their tram's place and get off at their cell; walkers catch the
 * trams coming up behind them; and the trams that must stand this minute are
 * marked. Original city only; draws no random numbers.
 */
export function tickTramRiding(w: WorldState): void {
  if (!w.cityLayout?.original) return;
  const lines = cityTramLines(w), frames = lines.map(frameOf);
  let st = savedTramState(w);
  // A tram that stood through the closing minute is a minute further behind.
  if (st) st.halted.forEach((halted, k) => { if (halted) st!.delay[k] += 1; });
  const trams = tramsAt(w, w.minute), now = campaignMinutes(w, w.minute);
  const aboard = trams.map(() => 0), boarding = trams.map(() => false), due: Person[] = [];
  for (const p of peopleList(w)) {
    const ride = p.tram;
    if (!ride) {
      if (p.dest && (w.minute + p.id) % TRAM_CATCH_EVERY === 0) due.push(p);
    } else if (rideOn(w, p, ride, trams, frames, now)) {
      aboard[ride.tram]++;
      if (ride.phase === 'boarding') boarding[ride.tram] = true;
    }
  }
  const reach = CELL / 2 + PAVEMENT_OFFSET + cityStreetInset(w) + FOOTWAY_REACH;
  for (const p of due) if (tramRideable(w, p) && catchTram(w, p, trams, frames, aboard, now, reach)) boarding[p.tram!.tram] = true;
  // Nothing has ever stood: every tram keeps its bare timetable, and nothing is saved.
  if (!st && !boarding.some(Boolean)) return;
  st ??= w.trams = { delay: trams.map(() => 0), halted: [] };
  st.halted = holdTrams(lines, trams, boarding);
}
