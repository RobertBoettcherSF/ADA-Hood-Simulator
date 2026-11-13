import { BLOCK_SIZE, CELL } from '../constants';
import { presentPhoto } from '../presentationEvents';
import { specialistParticipants, specialistVisitTargets } from '../specialistJobs';
import { clearDestination, noteEarlyStep, setDestination, stepPerson } from '../movement';
import { trafficContext } from '../traffic';
import { boardingCount, sendHome } from '../transport';
import { isGangOffice } from '../officeDefence';
import { peopleSlice } from '../peopleSlices';
import type { Rng } from '../rng';
import type { Block, Building, Person, WorldState } from '../types';
import { allBuildings, buildingDoor, dist } from '../world';

/**
 * Everyone who is not carrying out an order still has to be somewhere: citizens
 * wander, officers walk their beat, snitches drift between gang turf, and FBI
 * agents make their way toward whatever they are investigating.
 */
export function tickAmbient(w: WorldState, rng: Rng, minutes: number,
  slice?: { index: number; count: number; early: boolean; traffic?: ReturnType<typeof trafficContext>; vehicles?: 'skip' | 'only' },
  scan?: (p: Person) => void): void {
  // Slices take the closing minute's traffic, already built: the coming
  // minute's is not settled until its tick runs tickTraffic.
  const traffic = slice?.traffic ?? trafficContext(w);
  const meeting = specialistParticipants(w), awaited = specialistVisitTargets(w);
  // One slice of the city at a time (sim.ts), or everyone; both in id order.
  // The tick's drivers-only pass over a slice that ran ahead walks the riders
  // that slice left behind (same people, same id order) while nobody has
  // boarded and nobody been born since: touching all its people again just to
  // find the few in cars cost a tenth of the minute.
  const kept = slice?.vehicles === 'only' ? keptRiders(w, slice.index, slice.count) : undefined;
  const people = kept ?? (slice ? peopleSlice(w, slice.index, slice.count) : Object.values(w.people));
  const riders: Person[] | undefined = slice?.vehicles === 'skip' ? [] : undefined;
  const boardedBefore = riders ? boardingCount() : 0, bornBefore = w.nextId;
  const one = (p: Person): void => {
    if (p.status !== 'active' || p.burningEscape?.week===w.week || p.emergencyResponse || p.shockReaction) return;
    // Cars are drawn along the minute they drove since the tick, so they drive
    // in the tick: an early slice leaves them for it (sim.ts) — stepping them
    // part way through the minute made them stand, then jump, every minute.
    if (slice?.vehicles === 'skip' && p.inVehicle) return;
    if (slice?.vehicles === 'only' && !p.inVehicle) return;
    if (slice?.early) {
      // Pinned if he moved or only chose where to go next: one given a new
      // route was otherwise drawn heading off along it, then put back at the
      // tick (his slice had run) — a hop back on every new errand. People the
      // slice leaves alone (crews on orders) are drawn as before.
      const x = p.pos.x, y = p.pos.y, path = p.path;
      ambientPerson(w, rng, p, minutes, traffic, meeting, awaited);
      if (p.pos.x !== x || p.pos.y !== y || p.path !== path) noteEarlyStep(p, x, y);
      return;
    }
    ambientPerson(w, rng, p, minutes, traffic, meeting, awaited);
  };
  if (riders) {
    if (scan) for (const p of people) { one(p); scan(p); if (p.inVehicle) riders.push(p); }
    else for (const p of people) { one(p); if (p.inVehicle) riders.push(p); }
    if (boardingCount() === boardedBefore && w.nextId === bornBefore) keepRiders(w, slice!.index, slice!.count, riders);
    else keepRiders(w, slice!.index, slice!.count, undefined);
    return;
  }
  if (scan) for (const p of people) { one(p); scan(p); }
  else for (const p of people) one(p);
}

/** Riders per early slice, for the coming minute; dropped when anyone boards or is born before the tick. */
let ridersKept: { world: WorldState; minute: number; count: number; boarded: number; born: number; lists: (Person[] | undefined)[] } | null = null;
function keepRiders(w: WorldState, index: number, count: number, list: Person[] | undefined): void {
  if (!ridersKept || ridersKept.world !== w || ridersKept.minute !== w.minute || ridersKept.count !== count)
    ridersKept = { world: w, minute: w.minute, count, boarded: boardingCount(), born: w.nextId, lists: new Array(count) };
  // Every slice's list must hold at the tick: a boarding or a birth since any of them voids all.
  if (ridersKept.boarded !== boardingCount() || ridersKept.born !== w.nextId) ridersKept.lists = new Array(count);
  ridersKept.boarded = boardingCount(); ridersKept.born = w.nextId;
  ridersKept.lists[index] = list;
}
function keptRiders(w: WorldState, index: number, count: number): Person[] | undefined {
  const k = ridersKept;
  if (!k || k.world !== w || k.minute !== w.minute || k.count !== count || k.boarded !== boardingCount() || k.born !== w.nextId) return undefined;
  return k.lists[index];
}

/** One person's ambient minute (everyone not on an order). */
function ambientPerson(w: WorldState, rng: Rng, p: Person, minutes: number, traffic: ReturnType<typeof trafficContext>,
  meeting: ReturnType<typeof specialistParticipants>, awaited: ReturnType<typeof specialistVisitTargets>): void {
  {
    if (p.orderId != null || p.streetOrder != null) return; // already handled by an order system
    if (p.fbiAssignment) return;
    // Walking to a street tram that stands for him, or aboard (tramRiding.ts).
    if (p.tram) { if (p.tram.phase === 'boarding' && p.dest) stepPerson(p, minutes, traffic); return; }
    if (meeting.has(p.id)) return;
    if (awaited.has(p.id)) {
      // Someone is coming to see them (the original's meeting orders bring both
      // together): finish crossing any road, then wait on the pavement. A
      // moving beat officer could not be caught, and a walker stopped on a
      // crossing would hold up the visitor's car for good.
      const next = p.path[0];
      const midCrossing = !!p.dest && !!next?.cross && Math.hypot(next.x - p.pos.x, next.y - p.pos.y) < next.cross - 0.75;
      if (midCrossing) stepPerson(p, minutes, traffic);
      else if (p.dest) clearDestination(p);
      return;
    }
    // 1.2.39 (Robert): the pool waits inside the office (off the street, out
    // of street combat); a crew man idle at the office stands at the door as
    // before. A pool hood idle away from any office walks home first.
    if (p.role === 'hood' && p.gangId != null && !p.dest) {
      const inOffice = isGangOffice(p.buildingId != null ? w.buildings[p.buildingId] : undefined, p.gangId);
      if (p.teamId != null && inOffice) p.buildingId = null;
      else if (p.teamId == null && p.buildingId == null) {
        let home: Building | undefined, far = false;
        for (const b of allBuildings(w)) {
          if (!isGangOffice(b, p.gangId)) continue;
          if (dist(buildingDoor(w, b), p.pos) < 24) { home = b; break; }
          far = true;
        }
        if (home) { p.inVehicle = false; p.buildingId = home.id; p.pos = { ...w.lots[home.lotId].center }; return; }
        if (far && !p.inVehicle) { sendHome(w, p); return; }
      }
    }
    if (p.buildingId != null && p.role !== 'police' && p.role !== 'fbi' && p.role !== 'snitch' && p.role !== 'reporter') {
      // Owners and managers stay at their premises.
      return;
    }

    switch (p.role) {
      case 'citizen':
      case 'snitch': {
        if (p.dest == null) {
          // The original's civilians are nearly always walking: on arrival a
          // wait of rand & 7 ticks, then the next errand (0x5D2740 idle branch,
          // 0x5D25A0). A brief pause here — about two real seconds.
          if (rng.chance(Math.min(1, CIVILIAN_RESTART * minutes))) wanderTo(w, rng, p, 5);
        } else {
          stepPerson(p, minutes, traffic);
        }
        break;
      }
      case 'reporter': {
        // Editors remain at the newspaper; its other reporters work on the street.
        const premises = p.buildingId != null ? w.buildings[p.buildingId] : null;
        if (premises?.ownerPersonId === p.id) break;
        // A field reporter works the street; he is not inside the newspaper.
        if (premises) p.buildingId = null;
        if (p.dest) stepPerson(p, minutes, traffic);
        else if (rng.chance(.08 * minutes)) wanderTo(w, rng, p, 2);
        // A stationary field reporter occasionally takes a photograph. This
        // visual cue uses no random draw and does not alter travel or reporting.
        if(!p.dest && (w.minute+p.id)%17===0)presentPhoto(w,p);
        break;
      }
      case 'judge':
      case 'da':
      case 'mayor':
      case 'policeChief':
      case 'fbiHead': {
        // Visible civic visitors can leave their initial block-centre spawn.
        // Their legal/political work still uses the existing simulation systems.
        if (p.dest) stepPerson(p, minutes, traffic);
        else if (rng.chance(.03 * minutes)) wanderTo(w, rng, p, 1);
        break;
      }
      case 'police': {
        if (p.dest == null) {
          // Officers off duty walk their beat rather than stand on the kerb.
          if (rng.chance(Math.min(1, BEAT_RESTART * minutes))) wanderTo(w, rng, p, 2);
        } else {
          stepPerson(p, minutes, traffic);
        }
        break;
      }
      case 'fbi': {
        if (p.dest) {
          stepPerson(p, minutes, traffic);
        } else if (rng.chance(0.04 * minutes)) {
          wanderTo(w, rng, p, 4);
        }
        break;
      }
      case 'hood':
      case 'lieutenant':
      case 'boss':
      case 'accountant':
      case 'lawyer': {
        // Gang members between jobs simply walk home.
        const arrived = !!p.dest && stepPerson(p, minutes, traffic);
        if (arrived && p.role === 'hood' && p.teamId == null) {
          // 1.2.39: a pool hood home from a walk goes inside the office.
          const home = officeNear(w, p);
          if (home) { p.inVehicle = false; p.buildingId = home.id; p.pos = { ...w.lots[home.lotId].center }; }
        } else if (arrived && (p.role === 'lawyer' || p.role === 'accountant')) {
          const home = officeAtHand(w, p);
          if (home) { p.inVehicle = false; p.buildingId = home.id; p.pos = { ...w.lots[home.lotId].center }; }
        }
        break;
      }
      default:
        if (p.dest) stepPerson(p, minutes, traffic);
        break;
    }
  }
}

/** 1.2.39: any office of his gang within reach (where sendHome walks him). */
function officeNear(w: WorldState, p: Person): Building | undefined {
  for (const b of allBuildings(w)) if (isGangOffice(b, p.gangId) && dist(buildingDoor(w, b), p.pos) < 24) return b;
  return undefined;
}

/** The gang's office within reach of a specialist who has walked home. (1.2.24: kept
 * out of ambientPerson — a closure there made V8 allocate a context on every call,
 * about 1.3 GB a week of garbage on a 36 × 28 city.) */
function officeAtHand(w: WorldState, p: Person): Building | undefined {
  for (const b of allBuildings(w)) if (b.ownerGangId === p.gangId && b.isHQ && dist(buildingDoor(w, b), p.pos) < 24) return b;
  return undefined;
}

/** Restart chances per simulated minute: civilians ~0.33 min (≈2 s real),
 * officers ~1 min. */
const CIVILIAN_RESTART = 3, BEAT_RESTART = 1;

/** How strongly a block draws errands (0x606840 reads block+104). That byte is
 * the land value (0x537D70 copies it from the generator grid), so the original
 * city uses its own; elsewhere trading businesses stand in for it. */
function tradingOn(w: WorldState, blk: Block): number {
  if (blk.original) return blk.original.landValue;
  let n = 0;
  for (const id of blk.lotIds) if (w.buildings[w.lots[id].buildingId]?.state === 'trading') n++;
  return n;
}

function wanderTo(w: WorldState, rng: Rng, p: Person, radiusBlocks: number): void {
  const gx = Math.floor(p.pos.x / CELL);
  const gy = Math.floor(p.pos.y / CELL);
  // Up to four tries for a block with a pavement (a failed pick used to cost a
  // whole extra wait); of the first two found, the busier one wins.
  let blk: Block | undefined, found = 0;
  for (let attempt = 0; attempt < 4 && found < 2; attempt++) {
    const nx = Math.max(0, Math.min(w.gridW - 1, gx + rng.int(-radiusBlocks, radiusBlocks)));
    const ny = Math.max(0, Math.min(w.gridH - 1, gy + rng.int(-radiusBlocks, radiusBlocks)));
    const candidate = cityBlockAt(w, nx, ny);
    if (!candidate || !hasFootway(candidate)) continue;
    found++;
    if (!blk || tradingOn(w, candidate) > tradingOn(w, blk)) blk = candidate;
  }
  if (!blk) return;
  if (w.cityLayout) { setDestination(w, p, blockPavement(blk, rng.int(0, 100000))); return; }
  // Aim for the pavement around the block rather than the middle of it: the
  // middle is where the buildings are, and a figure standing in one is a
  // figure nobody can see or click on.
  const along = rng.range(-BLOCK_SIZE / 2, BLOCK_SIZE / 2);
  const side = rng.range(-1, 1) < 0 ? -1 : 1;
  const out = (BLOCK_SIZE / 2 + 1.6) * side;
  const lengthways = (p.id & 2) === 0;
  setDestination(
    w,
    p,
    lengthways
      ? { x: blk.center.x + along, y: blk.center.y + out }
      : { x: blk.center.x + out, y: blk.center.y + along },
  );
}

import { blockPavement, cityBlockAt, hasFootway } from '../cityLayout';
