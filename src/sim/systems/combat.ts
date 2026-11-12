import { INCIDENT_HOSTILITY, provoke } from '../aiStance';
import { noteMemberLoss } from '../memberLosses';
import { cityBlockAt } from '../cityLayout';
import { inAmbushArea, isOnStreet, validAmbushTarget } from '../ambush';
import { clearDestination } from '../movement';
import { allocateWeapons, attackProfile, type Loadout } from '../weapons';
import { addMessage, recordCrime } from '../events';
import { completeAmbush, killPerson } from '../execution';
import { dismount, stepOut } from '../transport';
import { onRoad, pavementBeside } from '../vehicleNavigation';
import { MINUTES_PER_WEEK } from '../constants';
import { fireRate, originalFireRoll } from '../fireRoll';
import { presentAttack } from '../presentationEvents';
import type { Rng } from '../rng';
import type { ID, Person, WorldState } from '../types';
import { dist2 } from '../world';
import { blockClaimants } from '../territory';
import { peopleList } from '../entityLists';
import { streetArrest, teamMates } from './fbi';
import { onGangPayroll } from '../payrollMark';

/** Optional snapshot for isolated combat fixtures. The game reads live claims
 * on demand so extortion, sales and destruction take effect during the week. */
export type TerritoryIndex = readonly (readonly ID[])[];

const CELLSIZE = 54;

interface Bucket {
  [key: number]: Person[];
}

function buildGrid(people: Person[], w: WorldState): Bucket {
  const grid: Bucket = {};
  for (const p of people) {
    const gx = Math.floor(p.pos.x / CELLSIZE);
    const gy = Math.floor(p.pos.y / CELLSIZE);
    const key = gy * (w.gridW + 4) + gx;
    (grid[key] ??= []).push(p);
  }
  return grid;
}

function neighbours(grid: Bucket, w: WorldState, p: Person): Person[] {
  const gx = Math.floor(p.pos.x / CELLSIZE);
  const gy = Math.floor(p.pos.y / CELLSIZE);
  const out: Person[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const key = (gy + dy) * (w.gridW + 4) + (gx + dx);
      const cell = grid[key];
      if (cell) for (const q of cell) if (q !== p) out.push(q);
    }
  }
  return out;
}

/** Everyone who can shoot or be shot at right now. */
export function combatants(w: WorldState): Person[] {
  const out: Person[] = [];
  for (const p of peopleList(w)) {
    if (p.status !== 'active' || p.burningEscape?.week===w.week || !isOnStreet(p)) continue;
    if (p.gangId != null || p.role === 'police' || p.role === 'fbi') out.push(p);
  }
  return out;
}

/** How long a man shot at counts as under fire, in minutes. */
export const UNDER_FIRE_MINUTES = 30;
export const absoluteMinute = (w: WorldState) => w.week * MINUTES_PER_WEEK + w.minute;

function gangHostile(w: WorldState, a: Person, b: Person, territory: TerritoryIndex | undefined): boolean {
  if (a.gangId == null || b.gangId == null || a.gangId === b.gangId) return false;
  const ga = w.gangs[a.gangId];
  if (!ga) return false;
  if (a.orderId != null && w.orders[a.orderId]?.type === 'ambush' && w.orders[a.orderId].state === 'waiting') return false;
  // A hood on a priority job has somewhere to be. He will not start a fight,
  // though he will finish one if somebody shoots at him first (hit or not:
  // a miss leaves him unhurt, which is how he never answered).
  if (a.orderId != null && w.orders[a.orderId]?.opts.priority && a.hp >= 100 && !((a.underFireUntil ?? 0) > absoluteMinute(w))) return false;
  const level = ga.offered[b.gangId] ?? 'peace';
  if (level === 'war' || level === 'aggression') return true;
  if (level === 'ceasefire') {
    // Only intruders on our own streets are fair game.
    const blk = blockIndex(w, b.pos.x, b.pos.y);
    return blk != null && (territory ? territory[blk] ?? [] : blockClaimants(w, w.blocks[blk])).includes(a.gangId);
  }
  return false;
}

function blockIndex(w: WorldState, x: number, y: number): number | null {
  const gx = Math.floor(x / CELLSIZE);
  const gy = Math.floor(y / CELLSIZE);
  if (gx < 0 || gy < 0 || gx >= w.gridW || gy >= w.gridH) return null;
  return cityBlockAt(w, gx, gy)!.id;
}

function hasExplicitTask(w: WorldState, p: Person): boolean {
  if (p.streetOrder) return true;
  const order = p.orderId != null ? w.orders[p.orderId] : undefined;
  return !!order && (order.opts.priority || order.type === 'kill' || order.type === 'assault' || order.type === 'ambush');
}

/** Preserve an explicit job even if it completes before combat in this minute. */
export function capturePeaceFireExclusions(w: WorldState, loadout: Loadout): ReadonlySet<ID> {
  const excluded = new Set<ID>();
  for (const id of loadout.keys()) {
    const p = w.people[id];
    if (p?.role === 'hood' && p.skills.intelligence < 2.5 && hasExplicitTask(w, p)) excluded.add(id);
  }
  return excluded;
}

function peacefulTarget(w: WorldState, a: Person, nearby: Person[], range: number): Person | null {
  const gang = a.gangId != null ? w.gangs[a.gangId] : undefined;
  if (!gang) return null;
  let nearest: Person | null = null;
  let bestDistance = range * range;
  for (const b of nearby) {
    if (b.status !== 'active' || b.gangId == null || b.gangId === a.gangId) continue;
    if ((gang.offered[b.gangId] ?? 'peace') !== 'peace') continue;
    const d = dist2(a.pos, b.pos);
    if (d < bestDistance || (d === bestDistance && (!nearest || b.id < nearest.id))) {
      nearest = b;
      bestDistance = d;
    }
  }
  return nearest;
}

/** A stable optional-event draw derived from the saved random state. A failed
 * opportunity must not advance the main stream and change unrelated campaign
 * outcomes when no accidental shot actually happened. */
export function peaceFireOpportunity(
  rngState: number, week: number, minute: number, actorId: ID, probability: number,
): boolean {
  if (probability <= 0) return false;
  let key = rngState ^ Math.imul(week, 0x9e3779b1) ^ Math.imul(minute, 0x85ebca6b) ^ Math.imul(actorId, 0xc2b2ae35);
  key = Math.imul(key ^ (key >>> 16), 0x7feb352d);
  key = Math.imul(key ^ (key >>> 15), 0x846ca68b);
  return ((key ^ (key >>> 16)) >>> 0) / 0x100000000 < probability;
}

/** Both deliberate combat and accidental fire use the same allocated weapon. */
function exchange(w: WorldState, rng: Rng, a: Person, b: Person, loadout: Loadout, shots = 1): void {
  const { weapon, spec, skill } = attackProfile(loadout, a);
  // Gunfire follows the original roll (fireRoll.ts): no hit points, a wound
  // class of 3 or 4 kills and anything less only staggers. Close combat keeps
  // the remake model until the original's move tables (0x465330) are traced.
  const shot = weapon ? originalFireRoll(rng, a, b, weapon, Math.sqrt(dist2(a.pos, b.pos)), shots) : null;
  const hit = shot ? shot.hit : rng.chance(Math.min(
    0.9,
    spec.accuracy * (0.45 + skill * 0.14) * (1 - (b.skills.stealth - 0.5) * 0.07),
  ));
  presentAttack(w, a, b, weapon, hit);
  b.underFireUntil = absoluteMinute(w) + UNDER_FIRE_MINUTES;
  if (hit) {
    if (shot) { if (shot.kills) b.hp = 0; }
    else b.hp -= spec.damage * rng.range(0.7, 1.25);
    if (b.hp <= 0) {
      killPerson(w, b, `${weapon ? 'gunned down' : 'killed in close combat'} by ${w.gangs[a.gangId!]?.name ?? 'a rival'}`);
      completeAmbush(w, a, b);
      recordCrime(w, rng, {
        gangId: a.gangId!, perpetratorId: a.id, type: weapon ? 'shootout' : 'kill',
        pos: b.pos, victimId: b.id, severity: 9,
      });
      if (w.gangs[a.gangId!]?.isPlayer || w.gangs[b.gangId!]?.isPlayer) {
        addMessage(w, 'combat', `${b.name} was ${weapon ? 'shot dead' : 'killed in close combat'} in the street.`, b.pos, b.id, weapon ? 'gunshot' : undefined);
      }
    } else if (w.gangs[a.gangId!]?.isPlayer || w.gangs[b.gangId!]?.isPlayer) {
      addMessage(w, 'combat', weapon ? `Shots exchanged — ${b.name} is hit.` : `${b.name} was struck in close combat.`, b.pos, b.id, weapon ? 'gunshot' : undefined);
    }
  } else {
    recordCrime(w, rng, {
      gangId: a.gangId!, perpetratorId: a.id, type: weapon ? 'shootout' : 'assault',
      pos: a.pos, severity: 4,
    });
  }
}

/**
 * Gunfights and arrests. Runs every tick over a spatial grid so the cost stays
 * proportional to the number of people actually on the street.
 */
export function tickCombat(
  w: WorldState,
  rng: Rng,
  minutes: number,
  territory: TerritoryIndex | undefined,
  loadout: Loadout = allocateWeapons(w),
  peaceFireExclusions?: ReadonlySet<ID>,
): void {
  const actors = combatants(w);
  if (actors.length < 2) return;
  const grid = buildGrid(actors, w);

  for (const a of actors) {
    if (a.status !== 'active') continue;
    const nearby = neighbours(grid, w, a);
    const order = a.orderId == null ? null : w.orders[a.orderId];
    if (order?.type === 'ambush' && order.state === 'executing' && order.assignedIds.includes(a.id)) {
      // An explicit violent order is distinct from incidental diplomacy fire.
      // Priority avoids distractions on the way; it must not suppress the job.
      if (!inAmbushArea(w, order, a.pos)) continue;
      // Fists cannot reach the pavement from a car: an unarmed ambusher holds
      // the area on foot (the original's ambush), the car waiting for him.
      if (a.inVehicle && !attackProfile(loadout, a).weapon) { stepOut(w, a, pavementBeside(w, a.pos)); continue; }
      const range2 = attackProfile(loadout, a).spec.range ** 2;
      let target = order.ambushTargetId == null ? undefined : w.people[order.ambushTargetId];
      if (!validAmbushTarget(w, order, target)) {
        delete order.ambushTargetId;
        target = nearby.filter(p => validAmbushTarget(w, order, p) && dist2(a.pos, p.pos) <= range2)
          .sort((p, q) => dist2(a.pos, p.pos) - dist2(a.pos, q.pos) || p.id - q.id)[0];
      }
      if (target && dist2(a.pos, target.pos) <= range2) {
        order.ambushTargetId = target.id;
        clearDestination(a);
        // Deliberately firing on a treaty partner breaks that treaty. Known
        // arrows retain their existing weekly update rather than leaking intel.
        w.gangs[order.gangId].offered[target.gangId!] = 'war';
        // The victim's gang answers in kind, unless it is the player's: his
        // stance is his to set.
        // (An ambush is an attempt on their lives: it counts as a killing.)
        provoke(w, target.gangId, order.gangId, INCIDENT_HOSTILITY.kill);
        // An ambusher fires every tick, so the rate of fire scales each attempt.
        exchange(w, rng, a, target, loadout, fireRate(attackProfile(loadout, a).weapon));
      }
      continue;
    }
    let inBattle = false;
    for (const b of nearby) {
      if (b.status !== 'active') continue;

      // ---- police & FBI: arrest rather than shoot, when they can.
      if ((a.role === 'police' || a.role === 'fbi') && b.gangId != null) {
        const gang = w.gangs[b.gangId];
        if (!gang) continue;
        if (onGangPayroll(a, gang.id) || a.bribedBy === gang.id) continue;
        const opinion = a.opinion[gang.id] ?? 0;
        const d2 = dist2(a.pos, b.pos);
        if (d2 > 26 * 26) continue;
        const heat = b.wanted + (a.role === 'fbi' ? 25 : 0) - opinion * 0.5;
        if (heat > 45 && rng.chance(0.004 * minutes * (heat / 100))) {
          // Original city: the officer takes him through the arrest contest (0x49A530).
          if (w.cityLayout?.original) { streetArrest(w, rng, a, b); continue; }
          if (b.vehicleKey) { dismount(w, b); if (onRoad(w, b.pos)) b.pos = pavementBeside(w, b.pos); }
          // A lieutenant takes the men of his crew standing with him (1.2.21, all map sizes).
          const mates = teamMates(w, b);
          noteMemberLoss(w, b, 'arrested in the street', a.role === 'fbi' ? 'the FBI' : 'the police');
          b.status = 'arrested';
          b.dest = null;
          b.path = [];
          b.orderId = null;
          for (const q of mates) {
            noteMemberLoss(w, q, `arrested in the street with ${b.name}`, a.role === 'fbi' ? 'the FBI' : 'the police');
            q.status = 'arrested'; q.dest = null; q.path = []; q.orderId = null; q.buildingId = null; q.inVehicle = false;
            if (gang.isPlayer) addMessage(w, 'police', `${q.name} has been arrested with ${b.name}.`, q.pos, q.id);
          }
          if (gang.isPlayer) {
            addMessage(
              w,
              'police',
              `${b.name} has been arrested by ${a.role === 'fbi' ? 'the FBI' : 'the police'}.`,
              b.pos,
              b.id,
            );
          }
        }
        continue;
      }

      // ---- gang on gang
      if (!gangHostile(w, a, b, territory)) continue;
      const { spec, weapon } = attackProfile(loadout, a);
      const range = spec.range;
      if (dist2(a.pos, b.pos) > range * range) continue;
      inBattle = true;

      // Rate of fire: a chance per minute so short passes rarely end in death.
      if (!rng.chance(0.09 * fireRate(weapon) * minutes)) continue;

      exchange(w, rng, a, b, loadout);
      break; // one exchange per actor per tick
    }

    // Remake tuning: one rare opportunity per armed, low-Intelligence hood,
    // independent of crowd size. No second ordinary rate-of-fire roll.
    if (inBattle || a.role !== 'hood' || a.gangId == null || a.skills.intelligence >= 2.5 ||
        hasExplicitTask(w, a) || peaceFireExclusions?.has(a.id)) continue;
    const profile = attackProfile(loadout, a);
    if (!profile.weapon) continue;
    const target = peacefulTarget(w, a, nearby, profile.spec.range);
    if (!target) continue;
    const probability = Math.min(1, 0.0001 * Math.max(0, 2.5 - a.skills.intelligence) * Math.max(0, minutes));
    if (peaceFireOpportunity(rng.state, w.week, w.minute, a.id, probability)) exchange(w, rng, a, target, loadout);
  }
}
