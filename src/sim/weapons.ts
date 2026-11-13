import { WEAPONS } from './constants';
import type { ID, Person, WeaponId, WorldState } from './types';
import { peopleList } from './entityLists';
import { officesUnderAttack } from './officeDefence';

export type Firearm = Exclude<WeaponId, 'explosives'>;
export type Loadout = ReadonlyMap<ID, Firearm>;
const BEST_FIRST: Firearm[] = ['twinPistols', 'tommy', 'rifle', 'shotgun', 'pistol'];
export const UNARMED = { name: 'Close combat', range: 2, damage: 10, accuracy: 0.65 };

/** Issued equipment is separate from whether it is currently drawn. */
export function serviceWeapon(p: Pick<Person, 'role' | 'skills'>): Firearm | undefined {
  if (p.role === 'fbi') return 'tommy';
  if (p.role === 'police') return p.skills.firearms > 3.5 ? 'tommy' : 'pistol';
  return undefined;
}

/** One reservation per person per tick; stock stays in its existing crew/cache.
 * Rebuilt from saved state, without RNG or a new save-format requirement. */
export function allocateWeapons(w: WorldState): Loadout {
  const result = new Map<ID, Firearm>();
  const groups = new Map<Record<WeaponId, number>, Person[]>();
  let defended: Set<ID> | undefined;
  for (const p of peopleList(w)) {
    if (p.status !== 'active') continue;
    if (p.role === 'police' || p.role === 'fbi') {
      result.set(p.id, serviceWeapon(p)!);
      continue;
    }
    const gang = p.gangId != null ? w.gangs[p.gangId] : null;
    if (!gang) continue;
    // "Not fighting men" (api.ts): the accountant and lawyer draw no gun.
    if (p.role === 'accountant' || p.role === 'lawyer') continue;
    const team = p.teamId != null ? w.teams[p.teamId] : null;
    // A stale or foreign crew reference never grants access to its equipment.
    if (p.teamId != null && (!team || team.gangId !== gang.id ||
      (team.lieutenantId !== p.id && !team.memberIds.includes(p.id)))) continue;
    // 1.2.39 (Robert): a pool hood (no crew) draws from the gang's cache only
    // for a job of his own (an order or a street order), or inside the office
    // while rival men break in (office defence). Otherwise he is unarmed.
    if (!team && p.role === 'hood' && p.orderId == null && p.streetOrder == null) {
      defended ??= new Set([...officesUnderAttack(w).keys()]);
      if (p.buildingId == null || !defended.has(p.buildingId)) continue;
    }
    const stock = team ? team.weapons : gang.weapons;
    const group = groups.get(stock);
    if (group) group.push(p); else groups.set(stock, [p]);
  }
  const priority = (p: Person) => p.orderId != null && w.orders[p.orderId]?.opts.priority ? 1 : 0;
  const working = (p: Person) => p.orderId != null || p.streetOrder != null ? 1 : 0;
  for (const [inventory, people] of groups) {
    people.sort((a, b) => priority(b) - priority(a) || working(b) - working(a) ||
      b.skills.firearms - a.skills.firearms || a.id - b.id);
    let next = 0;
    for (const weapon of BEST_FIRST) {
      const count = inventory[weapon] ?? 0;
      const available = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
      for (let i = 0; i < available && next < people.length; i++) result.set(people[next++].id, weapon);
    }
  }
  return result;
}

export function attackProfile(loadout: Loadout, person: Person) {
  const weapon = loadout.get(person.id);
  return { weapon, spec: weapon ? WEAPONS[weapon] : UNARMED,
    skill: weapon ? person.skills.firearms : person.skills.fists };
}
