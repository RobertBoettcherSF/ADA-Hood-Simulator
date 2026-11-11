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
import { buildingList, peopleList } from '../../sim/entityLists';

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

export function createReelSim(): Sim {
  return new Sim({
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
  const home = w.blocks[0] ? { x: w.blocks[0].center.x, y: w.blocks[0].center.y } : { x: 0, y: 0 };
  const gang = sim.playerGang;
  const teamId = gang.teamIds[0];
  const shop = buildingList(w).find((b) => b.state === 'trading' && isValidAreaTarget(w, gang.id, 'extort', b));
  if (teamId != null && shop) {
    issueOrder(w, gang.id, { teamId, type: 'extort', buildingIds: [shop.id], opts: { manpower: 1 } });
  }
  const fire = buildingList(w).find((b) => b.state === 'trading' && !b.isHQ && b.id !== shop?.id && b.cls !== 'municipal');
  sim.launchWeek();

  const crew = peopleList(w).find((p) => p.gangId === gang.id && p.status === 'active' && p.dest);
  const cars = carsAt(w, w.minute + 0.25);
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

  return [
    { id: 'crowds', kind: 'street', ...busiest(w), pace: 'fast' },
    { id: 'crew', kind: 'street', x: crew?.pos.x ?? home.x, y: crew?.pos.y ?? home.y, pace: 'fast' },
    { id: 'shakedown', kind: 'street', ...spot(w, shop, home), pace: 'fast' },
    { id: 'police', kind: 'street', ...police, pace: 'fast' },
    { id: 'crossing', kind: 'street', ...crossing, pace: 'fast' },
    { id: 'racket', kind: 'street', ...spot(w, racket, home), pace: 'fast' },
    { id: 'dusk', kind: 'street', ...home, pace: 'dusk' },
    { id: 'fire', kind: 'street', ...spot(w, fire, home), pace: 'fast', fireId: fire?.id },
    { id: 'street', kind: 'street', ...spot(w, hq, home), pace: 'fast' },
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
