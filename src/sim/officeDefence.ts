import type { Building, ID, Person, Vec2, WorldState } from './types';
import { buildingDoor, dist } from './world';

/**
 * 1.2.39 (Robert): the pool waits inside the office. A hood of a gang who is
 * in no crew and has nothing to do (no order, street order or walk) is inside
 * its headquarters: off the street, out of street combat. When rival men
 * break in (a raid, smash-up, torching, bombing, a kidnapping, an assault or
 * a killing at the office), those pool hoods take the gang's cache guns and
 * fight them at the door. Game rule for every gang, the player's included.
 */
export const OFFICE_ATTACK_ORDERS: ReadonlySet<string> = new Set(['raid', 'smashUp', 'torch', 'bomb', 'kill', 'kidnap', 'assault']);
/** Within this of the office door a rival on such a job is breaking in (the order system's arrival distance, plus slack). */
export const OFFICE_BREAK_IN_METRES = 8;

/** A gang's office: its headquarters or any office building it owns (where its men are sent home). */
export function isGangOffice(b: Building | undefined, gangId: ID | null | undefined): b is Building {
  return !!b && gangId != null && b.ownerGangId === gangId && (b.isHQ || b.typeId === 'office') && b.state !== 'destroyed';
}

/** A pool hood (no crew) idle inside the office. */
export function poolHoodInside(w: WorldState, p: Person, office?: Building): boolean {
  if (p.status !== 'active' || p.role !== 'hood' || p.gangId == null || p.teamId != null) return false;
  if (p.buildingId == null || p.dest || p.streetOrder || p.orderId != null) return false;
  const b = w.buildings[p.buildingId];
  return isGangOffice(b, p.gangId) && (!office || office.id === b.id);
}

/** 1.2.46: an FBI raid on an office takes everyone inside it or within this many metres of its door. */
export const RAID_REACH = 12;

/**
 * 1.2.46 (Robert): gangs whose men keep away from their HQ this week (an FBI
 * case is open — Auto sets this at planning; not saved). Gang id → the HQ and
 * where the men go instead (another office, else one of the gang's premises).
 */
export const hqAvoidance = new WeakMap<WorldState, Map<ID, { hqId: ID; refugeId: ID | null }>>();

/**
 * 1.2.49 (Robert): gangs whose idle crew men and lieutenants wait inside an
 * office (like the pool) instead of at the door — Auto sets this; not saved.
 */
export const idleInside = new WeakMap<WorldState, Set<ID>>();

/** 1.2.50 (Robert, proposed): how far past the raid's reach a man with nowhere else to go waits. */
export const RAID_WAIT_MARGIN = 4;

/**
 * 1.2.50 (Robert): where a man waits while a raid is due on the HQ and the
 * gang has no other premises: on the pavement along the HQ's street front,
 * just past the raid's reach (RAID_REACH + RAID_WAIT_MARGIN from the door),
 * on the side of the door he stands on.
 */
export function raidWaitSpot(w: WorldState, hq: Building, p: Person): Vec2 {
  const door = buildingDoor(w, hq), lot = w.lots[hq.lotId].center, out = RAID_REACH + RAID_WAIT_MARGIN;
  // The door's street front runs across the line from the lot's centre to the door.
  const alongX = Math.abs(door.y - lot.y) >= Math.abs(door.x - lot.x);
  const side = alongX ? Math.sign(p.pos.x - door.x) || 1 : Math.sign(p.pos.y - door.y) || 1;
  return alongX ? { x: door.x + side * out, y: door.y } : { x: door.x, y: door.y + side * out };
}

/** The gang's headquarters, if it has one standing. */
export function gangOffice(w: WorldState, gangId: ID): Building | undefined {
  for (const id of Object.keys(w.buildings)) {
    const b = w.buildings[Number(id)];
    if (b && b.isHQ && b.ownerGangId === gangId && b.state !== 'destroyed') return b;
  }
  return undefined;
}

/** Offices under attack this minute: office id → the rival men breaking in. */
export function officesUnderAttack(w: WorldState): Map<ID, Person[]> {
  const out = new Map<ID, Person[]>();
  for (const order of Object.values(w.orders)) {
    if (order.state !== 'executing' || !OFFICE_ATTACK_ORDERS.has(order.type)) continue;
    let office: Building | undefined = w.buildings[order.targetBuildingIds[order.cursor] ?? order.targetBuildingIds[0]];
    if (!office && order.targetPersonId != null) {
      const victim = w.people[order.targetPersonId];
      office = victim?.buildingId != null ? w.buildings[victim.buildingId] : undefined;
    }
    if (!office || !isGangOffice(office, office.ownerGangId) || office.ownerGangId === order.gangId) continue;
    const door = buildingDoor(w, office);
    for (const id of order.assignedIds) {
      const p = w.people[id];
      if (!p || p.status !== 'active' || p.inVehicle || p.gangId === office.ownerGangId) continue;
      if (dist(p.pos, door) > OFFICE_BREAK_IN_METRES) continue;
      const list = out.get(office.id);
      if (list) { if (!list.includes(p)) list.push(p); } else out.set(office.id, [p]);
    }
  }
  return out;
}

/** Pool hoods inside the office who would be armed from the cache: as many as it holds guns. */
export function armedPoolDefenders(w: WorldState, office: Building): number {
  const gang = office.ownerGangId != null ? w.gangs[office.ownerGangId] : undefined;
  if (!gang) return 0;
  let men = 0;
  for (const id of [...gang.poolIds]) { const p = w.people[id]; if (p && poolHoodInside(w, p, office)) men++; }
  // 1.2.41: an office with its own stash arms its defenders from it.
  const store: Partial<Record<string, number>> = office.stash && Object.values(office.stash).some((n) => (n ?? 0) >= 1) ? office.stash : gang.weapons;
  const guns = (['pistol', 'shotgun', 'rifle', 'tommy', 'twinPistols'] as const).reduce((sum, g) => sum + Math.max(0, Math.floor(store[g] ?? 0)), 0);
  return Math.min(men, guns);
}
