/**
 * Hunting a rival gang's man whose whereabouts the gang does not know, in the
 * original city, as the original does it (traced 28 October 2026 from the
 * shipped the original executable; docs/audit/2026-10-28/hunt/review.md).
 *
 * The original has no hunt order. A Kill, Assault, Kidnap, Tail or Recruit
 * aimed at a person pushes a chase step (0x565B00, step type 6), and the chase
 * (0x5DE990 / 0x5DF4C0) searches when the gang does not know the man (his byte
 * +0x5C + gang is 0). The search:
 *  - 0x4E2130 (vt+0xE0), where to head: within 15 cells of him, straight to
 *    where he is; further off, from the hunter a fraction Intelligence / 256 of
 *    the way towards him, then the nearest pool hall or gym not yet visited on
 *    this order (0x60B950, a spiral of cells; the visited set is cleared when
 *    every one has been visited).
 *  - 0x4E1F00 (vt+0xDC), asking at a pool hall (tile 91) or gym (tile 57):
 *    each unattached hood in it scores
 *      trunc((eff(his gang) − eff(our gang)) / 8) − (his Stealth >> 2) + I,
 *    eff the informant's effective hostility (0x5A4400) and I the best
 *    Intimidation (byte +0xB2) of the crew. Above 16 he talks: 48 or more and
 *    the hunted man is placed exactly (answer 2), otherwise the crew learns the
 *    direction (answer 1, a fresh 0x4E2130 from the hall). Nobody talks
 *    (answer 0): on to the nearest pool hall or gym not yet visited.
 *  - Sent to where he was (answer 2, or answer 1 within 15 cells) and not
 *    there: up to 20 cells further towards where he is now (0x60B2D0), then
 *    the search again.
 *  - He is found when the crew sees him, the sighting test of 0x6F6EB0 (the
 *    9-ring square, an open cell, in view, his Stealth below `rand % 63` plus
 *    the spotter's Intelligence), every 32 ticks; or when the gang learns of
 *    him; or when he is in the building the crew stands at.
 * There is no asking time and no blurred tip: every answer is his position at
 * that moment, or the direction to it.
 */
import { effectiveHostility } from '../attitudes';
import { peopleList } from '../entityLists';
import { ORIGINAL_CELL_METRES, skillByte } from '../fireRoll';
import { allBuildings, buildingDoor, dist } from '../world';
import { looksThisMinute, spotterSees } from './sightings';
import type { Rng } from '../rng';
import type { Building, ID, Order, Person, Vec2, WorldState } from '../types';

/** 0x4E2130: within this many cells the hunter heads straight for the man. */
export const HUNT_NEAR_CELLS = 15;
/** 0x5DE990 state 2 → 3: how far past a stale position the crew presses on (0x60B2D0(…, 0x14)). */
export const HUNT_PRESS_CELLS = 20;
/** 0x4E1F00: an informant talks above this score… */
export const HUNT_TALKS = 16;
/** …and places the man exactly at this score or more. */
export const HUNT_PLACES = 48;

/** Intelligence on the original's 0..255 byte (the sightings' scale). */
const intelligenceByte = (stars: number) => Math.round(Math.max(0, Math.min(5, stars)) / 5 * 255);
const cells = (metres: number) => Math.floor(metres / ORIGINAL_CELL_METRES);
const cellOf = (v: number) => Math.floor(v / ORIGINAL_CELL_METRES);

/** The pool halls and gyms (tiles 91 and 57) still trading. */
function halls(w: WorldState): Building[] {
  return allBuildings(w).filter(b => b.state === 'trading' && (b.typeId === 'poolHall' || b.typeId === 'gym'));
}

/** `from` moved towards `to` by `metres`, never past it (0x60B2D0). */
function towards(from: Vec2, to: Vec2, metres: number): Vec2 {
  const d = dist(from, to);
  if (d <= metres || d === 0) return { x: to.x, y: to.y };
  return { x: from.x + (to.x - from.x) * metres / d, y: from.y + (to.y - from.y) * metres / d };
}

/**
 * 0x60B950: the pool hall or gym nearest `at` that this order has not been to,
 * by rings of cells (Chebyshev, then the straight distance); it is marked
 * visited. When none is left the visited set is cleared and the search runs
 * again.
 */
export function nearestHall(w: WorldState, order: Order, at: Vec2): Building | null {
  const all = halls(w);
  for (let pass = 0; pass < 2; pass++) {
    const visited = new Set(order.huntVisitedIds ?? []);
    let best: Building | null = null, bestRing = Infinity, bestD = Infinity;
    for (const b of all) {
      if (visited.has(b.id)) continue;
      const c = w.lots[b.lotId].center;
      const ring = Math.max(Math.abs(cellOf(c.x) - cellOf(at.x)), Math.abs(cellOf(c.y) - cellOf(at.y)));
      const d = dist(c, at);
      if (ring < bestRing || (ring === bestRing && d < bestD)) { best = b; bestRing = ring; bestD = d; }
    }
    if (best) { order.huntVisitedIds = [...(order.huntVisitedIds ?? []), best.id]; return best; }
    if (!order.huntVisitedIds?.length) return null;
    order.huntVisitedIds = [];
  }
  return null;
}

/**
 * 0x4E2130: where the hunt heads next from `from`. With a target: within 15
 * cells, his position; further, the nearest unvisited pool hall or gym to the
 * point Intelligence / 256 of the way to him. Without (nobody talked): the
 * nearest unvisited one to `from`.
 */
export function huntGuide(w: WorldState, order: Order, from: Vec2, lead: Person, target: Person | null):
  { hallId: ID } | { pos: Vec2 } {
  let point = from;
  if (target) {
    const d = dist(from, target.pos), n = cells(d);
    if (n < HUNT_NEAR_CELLS) return { pos: { x: target.pos.x, y: target.pos.y } };
    const step = (intelligenceByte(lead.skills.intelligence) * n) >> 8;
    point = towards(from, target.pos, step * ORIGINAL_CELL_METRES);
  }
  const hall = nearestHall(w, order, point);
  return hall ? { hallId: hall.id } : { pos: { x: point.x, y: point.y } };
}

/** The unattached hoods about a pool hall or gym, who are the ones asked. */
export function informants(w: WorldState, hall: Building): Person[] {
  return peopleList(w).filter(p => p.status === 'active' && p.role === 'hood' && p.gangId == null && p.buildingId === hall.id);
}

/** 0x4E1F00: what the crew learns at a pool hall or gym, 0 (nothing), 1 (the direction) or 2 (where he is). */
export function askAtHall(w: WorldState, hall: Building, crew: Person[], target: Person, gangId: ID): 0 | 1 | 2 {
  if (target.gangId == null) return 0;
  const intimidation = Math.max(0, ...crew.map(p => skillByte(p.skills.intimidation)));
  const stealth = skillByte(target.skills.stealth) >> 2;
  let answer: 0 | 1 = 0;
  for (const inf of informants(w, hall)) {
    const score = Math.trunc((effectiveHostility(inf, target.gangId) - effectiveHostility(inf, gangId)) / 8) - stealth + intimidation;
    if (score > HUNT_TALKS) {
      if (score >= HUNT_PLACES) return 2;
      answer = 1;
    }
  }
  return answer;
}

function setLeg(order: Order, g: { hallId: ID } | { pos: Vec2 }, leg: 'near' | 'told'): void {
  if ('hallId' in g) { order.huntHallId = g.hallId; delete order.huntTip; delete order.huntLeg; }
  else { order.huntTip = g.pos; order.huntLeg = leg; delete order.huntHallId; }
}

/** The search step (0x5DE990 state 1, away from a hall): head where 0x4E2130 says. */
export function searchOn(w: WorldState, order: Order, lead: Person, target: Person): void {
  setLeg(order, huntGuide(w, order, lead.pos, lead, target), 'near');
}

/** A hunt sets out (state 0 → 1): a fresh visited set and the first leg. */
export function startOriginalHunt(w: WorldState, order: Order, lead: Person, target: Person): void {
  delete order.huntHallId; delete order.huntTip; delete order.huntLeg; delete order.huntAsking;
  order.huntVisitedIds = [];
  searchOn(w, order, lead, target);
}

/**
 * The crew has arrived where the hunt sent it and has not found him. Returns
 * a line for the boss when there is news.
 */
export function originalHuntArrived(w: WorldState, order: Order, crew: Person[], target: Person): string | null {
  const lead = crew[0];
  if (order.huntHallId != null) {
    const hall = w.buildings[order.huntHallId];
    delete order.huntHallId;
    const answer = hall ? askAtHall(w, hall, crew, target, order.gangId) : 0;
    if (answer === 2) {
      setLeg(order, { pos: { x: target.pos.x, y: target.pos.y } }, 'told');
      return `${lead.name} was told where ${target.name} is.`;
    }
    if (answer === 1) {
      const g = huntGuide(w, order, lead.pos, lead, target);
      // Placed within 15 cells, the crew is sent to where he is (state 2).
      setLeg(order, 'pos' in g ? { pos: { x: target.pos.x, y: target.pos.y } } : g, 'told');
      return `${lead.name} heard which way ${target.name} went.`;
    }
    const g = huntGuide(w, order, lead.pos, lead, null);
    if ('hallId' in g) setLeg(order, g, 'near'); else searchOn(w, order, lead, target);
    return null;
  }
  if (order.huntLeg === 'told') {
    // Not there any more: press on up to 20 cells towards where he is now (state 3).
    order.huntTip = towards(lead.pos, target.pos, HUNT_PRESS_CELLS * ORIGINAL_CELL_METRES);
    order.huntLeg = 'press';
    return null;
  }
  searchOn(w, order, lead, target);
  return null;
}

/**
 * Whether the crew has found him this minute: the gang knows him now, he is
 * in the building at whose door they stand, or one of them sees him on his
 * look beat (0x6F6EB0, the sighting roll).
 */
export function originalHuntFinds(w: WorldState, rng: Rng, order: Order, crew: Person[], target: Person): Person | null {
  if (w.gangs[order.gangId]?.knownPeople.includes(target.id)) return crew[0];
  if (target.status !== 'active' && target.status !== 'beaten') return null;
  if (target.buildingId != null) {
    const b = w.buildings[target.buildingId];
    const door = b ? buildingDoor(w, b) : null;
    return door ? crew.find(a => dist(a.pos, door) <= ORIGINAL_CELL_METRES) ?? null : null;
  }
  const stealth = skillByte(target.skills.stealth);
  for (const a of crew) {
    if (!looksThisMinute(w, a) || !spotterSees(w, a, target)) continue;
    if (stealth < rng.int(0, 62) + intelligenceByte(a.skills.intelligence)) return a;
  }
  return null;
}
