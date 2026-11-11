/**
 * The loading reel's private city and its cut list.
 * Nothing here reads or writes the player's world. The clock is the music:
 * 136 beats a minute, cuts on a four-bar line, the logo up before the last hit.
 */
import { issueOrder } from '../../sim/api';
import { isValidAreaTarget } from '../../sim/execution';
import { Sim } from '../../sim/sim';
import { carsAt } from '../../sim/traffic';
import { trafficLivery } from '../../render/policeVehicles';
import type { Building, WorldState } from '../../sim/types';
import { presentBuildingEffect } from '../../sim/presentationEvents';
import { startBuildingEmergency } from '../../sim/systems/buildingEmergency';
import { buildingList, forgetEntityLists, peopleList } from '../../sim/entityLists';
import { CELL } from '../../sim/constants';

export const REEL_SEED = 1908;
/** Measured off the supplied theme. A bar is four of these beats. */
export const REEL_BPM = 136;
export const REEL_BEAT = 60 / REEL_BPM;
export const REEL_BAR = REEL_BEAT * 4;
/** First downbeat, in seconds. */
export const REEL_PHASE = 0.11;
/** The file runs just under two minutes. The picture loops with it. */
export const REEL_TRACK_SECONDS = 119.71;
/** The last accent, while the logo card is already up. */
export const REEL_FINAL_HIT = 117.81;

/** Street shots, in bars. Each length is a whole number of 4-bar phrases. */
export const REEL_SHOT_BARS = [8, 8, 4, 8, 4, 8, 8, 8, 8] as const;

export interface ReelFrame {
  id: string;
  kind: 'street' | 'logo';
  /** Ground point the camera holds for the whole shot. */
  x: number;
  y: number;
  pace: 'fast' | 'dusk' | 'still';
  /** Set when this shot should light a building. */
  fireId?: number;
}

export function reelCutTimes(): number[] {
  const cuts = [REEL_PHASE];
  let bars = 0;
  for (const count of REEL_SHOT_BARS) {
    bars += count;
    cuts.push(REEL_PHASE + bars * REEL_BAR);
  }
  return cuts;
}

/** Which shot is on screen at `seconds` into the track. The last one is the logo. */
export function frameAt(seconds: number, count: number): number {
  const cuts = reelCutTimes();
  const t = ((seconds % REEL_TRACK_SECONDS) + REEL_TRACK_SECONDS) % REEL_TRACK_SECONDS;
  let index = 0;
  const last = Math.min(count, cuts.length) - 1;
  for (let i = 0; i <= last; i++) if (t >= cuts[i]) index = i;
  return index;
}

/**
 * Walkers the reel keeps, of the city's free citizens. Fewer people on the
 * street lets every one of them stay a detailed figure for the whole reel.
 */
export const REEL_CROWD_SHARE = 0.4;
/** Clock speed of the reel's street shots (the street's normal speed is 1). */
export const REEL_SPEED = 3;
export const REEL_SPEED_PHONE = 2;
export const REEL_DUSK_SPEED = 1;
/** The dusk shot opens late in the day and runs on into the night (480 minutes a day). */
export const REEL_DUSK_MINUTE = 425;
/**
 * How far a camera point keeps from the edge of the reel city, in blocks.
 * The street camera looks across about two blocks, so a point nearer the
 * edge than this showed the empty ground past the last row of houses.
 */
export const REEL_EDGE_BLOCKS = 2.6;

export function createReelSim(): Sim {
  const sim = new Sim({
    seed: REEL_SEED,
    playerName: 'Vince Reel',
    playerFemale: false,
    playerPortrait: 1,
    playerColor: 'red',
    mode: 'normal',
    economy: 'normal',
    opponents: 'normal',
    startMoney: 6000,
    startHoods: 5,
    startBusinesses: 3,
    powerWeeks: 40,
    wealthTarget: 250_000,
    territoryTarget: 125,
    citySize: 8,
    cityLayout: 'varied',
    era: '1932',
  });
  thinCrowd(sim.world, REEL_CROWD_SHARE);
  return sim;
}

/**
 * Take most of the free walkers off the reel's street. Only citizens that no
 * building, order, or record names are taken, a fixed share by id, so the
 * reel is the same city every time.
 */
export function thinCrowd(w: WorldState, keep: number): void {
  const { people, ...rest } = w;
  const named = new Set<number>();
  JSON.stringify(rest, (key, value) => {
    if (/Ids?$/.test(key)) for (const id of Array.isArray(value) ? value : [value]) if (typeof id === 'number') named.add(id);
    return value;
  });
  for (const p of Object.values(people)) {
    for (const id of p.snitchKnows ?? []) named.add(id);
    if (p.employedBy != null) named.add(p.id);
  }
  const free = Object.values(people).filter((p) => p.role === 'citizen' && p.buildingId == null && p.gangId == null && !named.has(p.id));
  const take = free.length - Math.round(free.length * keep);
  // Every k-th walker by id: spread across the whole city, not one district emptied.
  const step = free.length / Math.max(1, take);
  for (let i = 0; i < take; i++) delete people[free[Math.floor(i * step)].id];
  forgetEntityLists(w);
}

/** The city's extent, for keeping the camera off its edge. */
function cityBounds(w: WorldState): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: 0, y0: 0, x1: w.gridW * CELL, y1: w.gridH * CELL };
}

/** A camera point moved in from the edge until there is city all round it. */
export function inland(w: WorldState, at: { x: number; y: number }): { x: number; y: number } {
  const b = cityBounds(w);
  const margin = REEL_EDGE_BLOCKS * CELL;
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
  return { x: clamp(at.x, b.x0 + margin, b.x1 - margin), y: clamp(at.y, b.y0 + margin, b.y1 - margin) };
}

/** Whether a point already has city all round it. */
export function isInland(w: WorldState, at: { x: number; y: number }): boolean {
  const moved = inland(w, at);
  return Math.abs(moved.x - at.x) < 1e-6 && Math.abs(moved.y - at.y) < 1e-6;
}

function lotCentre(w: WorldState, b: Building): { x: number; y: number } {
  return w.lots[b.lotId]?.center ?? { x: 0, y: 0 };
}

function nearestCentre(w: WorldState, list: Building[]): Building[] {
  const mid = { x: w.gridW * CELL / 2, y: w.gridH * CELL / 2 };
  const d = (b: Building) => { const c = lotCentre(w, b); return (c.x - mid.x) ** 2 + (c.y - mid.y) ** 2; };
  return [...list].sort((a, b) => d(a) - d(b));
}

function spot(w: WorldState, building: Building | undefined, fallback: { x: number; y: number }): { x: number; y: number } {
  const lot = building ? w.lots[building.lotId] : undefined;
  return lot ? { x: lot.center.x, y: lot.center.y } : fallback;
}

function busiest(w: WorldState): { x: number; y: number } {
  const tally = new Map<number, number>();
  for (const person of peopleList(w)) {
    if (person.status !== 'active') continue;
    let best = w.blocks[0];
    let bestD = Infinity;
    for (const block of w.blocks) {
      const d = (block.center.x - person.pos.x) ** 2 + (block.center.y - person.pos.y) ** 2;
      if (d < bestD) { best = block; bestD = d; }
    }
    tally.set(best.id, (tally.get(best.id) ?? 0) + 1);
  }
  let id = w.blocks[0]?.id ?? 0;
  let n = -1;
  for (const [blockId, count] of tally) if (count > n) { id = blockId; n = count; }
  const block = w.blocks[id] ?? w.blocks[0];
  return { x: block.center.x, y: block.center.y };
}

/** Stage one extortion and open the week, then name a camera for each shot. */
export function buildReel(sim: Sim): ReelFrame[] {
  const w = sim.world;
  // The middle of the city: the old corner block showed the empty map edge.
  const home = inland(w, { x: w.gridW * CELL / 2, y: w.gridH * CELL / 2 });
  const gang = sim.playerGang;
  const teamId = gang.teamIds[0];
  // Shops and fires are chosen inland first, so the action is in the middle of the picture.
  const inlandFirst = (list: Building[]) => [...list.filter((b) => isInland(w, lotCentre(w, b))), ...nearestCentre(w, list.filter((b) => !isInland(w, lotCentre(w, b))))];
  const shop = inlandFirst(buildingList(w).filter((b) => b.state === 'trading' && isValidAreaTarget(w, gang.id, 'extort', b)))[0];
  if (teamId != null && shop) {
    issueOrder(w, gang.id, { teamId, type: 'extort', buildingIds: [shop.id], opts: { manpower: 1 } });
  }
  const fire = inlandFirst(buildingList(w).filter((b) => b.state === 'trading' && !b.isHQ && b.id !== shop?.id && b.cls !== 'municipal'))[0];
  sim.launchWeek();

  const crew = peopleList(w).find((p) => p.gangId === gang.id && p.status === 'active' && p.dest);
  const allCars = carsAt(w, w.minute + 0.25);
  const cars = [...allCars.filter((car) => isInland(w, car)), ...allCars.filter((car) => !isInland(w, car))];
  const dark = cars.find((car) => trafficLivery(car.x, car.y, car.truck, car.id) === 'police')
    ?? cars.find((car) => car.color === 0 || car.color === 7)
    ?? cars[0];
  const other = cars.find((car) => car !== dark && car.junction) ?? cars[1] ?? cars[0];
  const racket = buildingList(w).find((b) => b.cls === 'illegal' || b.protection) ?? shop;
  const hq = buildingList(w).find((b) => b.isHQ && b.ownerGangId === gang.id);

  const police = dark
    ? { x: dark.x + (dark.axisX ? dark.dir * 14 : 0), y: dark.y + (dark.axisX ? 0 : dark.dir * 14) }
    : home;
  const crossing = other ? { x: other.x, y: other.y } : home;

  // Every camera point has city all round it.
  const at = (p: { x: number; y: number }) => inland(w, p);
  return [
    { id: 'crowds', kind: 'street', ...at(busiest(w)), pace: 'fast' },
    { id: 'crew', kind: 'street', ...at({ x: crew?.pos.x ?? home.x, y: crew?.pos.y ?? home.y }), pace: 'fast' },
    { id: 'shakedown', kind: 'street', ...at(spot(w, shop, home)), pace: 'fast' },
    { id: 'police', kind: 'street', ...at(police), pace: 'fast' },
    { id: 'crossing', kind: 'street', ...at(crossing), pace: 'fast' },
    { id: 'racket', kind: 'street', ...at(spot(w, racket, home)), pace: 'fast' },
    { id: 'dusk', kind: 'street', ...home, pace: 'dusk' },
    { id: 'fire', kind: 'street', ...at(spot(w, fire, home)), pace: 'fast', fireId: fire?.id },
    { id: 'street', kind: 'street', ...at(spot(w, hq, home)), pace: 'fast' },
    { id: 'logo', kind: 'logo', x: 0, y: 0, pace: 'still' },
  ];
}

/** Flames and the brigade, on the reel's own city. A second call only restokes the picture. */
export function cueReelFire(sim: Sim, buildingId: number, brigadeSent: { current: boolean }): void {
  const building = sim.world.buildings[buildingId];
  const lot = building ? sim.world.lots[building.lotId] : undefined;
  if (!building || !lot) return;
  const before = { ...building, state: 'trading' as const };
  if (!brigadeSent.current) {
    brigadeSent.current = true;
    startBuildingEmergency(sim.world, sim.rng, building, 'fire');
  }
  building.state = 'damaged';
  building.fireWeek = sim.world.week;
  presentBuildingEffect(sim.world, 'fire', { ...lot.center }, building.id, 0, before);
}
