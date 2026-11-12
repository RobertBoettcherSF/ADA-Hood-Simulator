/**
 * Free hoods and specialists in the original city, after the weekly visitor
 * spawner (0x661160): every week each recruitment site is topped up to a fixed
 * number of unaffiliated people of its kind. The quotas are immediates in the
 * function (the 10-entry visitor list before them is separate):
 *
 *   kind 0 Accountants      1 accountant (person type 26)
 *   kind 67 Bank (Large)    5 accountants
 *   kind 70 Lawyers         1 lawyer (type 27)
 *   civic sub-code 1        5 lawyers — the Courthouse
 *   kind 57 Gym, 91 Pool hall   2 hoods (type 29)
 *   kind 124 Docks              5 hoods
 *   civic sub-code 2        5 hoods — the Employment Exchange (our labour exchange)
 *
 * The civic sub-code is byte +0x44 of a class-8 cell (0x40475F → 0x6FD860).
 * It indexes the municipal rows of Economics.xtx from their first row,
 * city+0x9D4 (0x526A40 names a class-8 cell by row sub + [city+0x9D4]; 0x669390
 * counts it the same way). In file order those rows are City Hall 0, Courthouse
 * 1, Employment Exchange 2, F.B.I. Headquarters 3, … (originalEconomics.ts).
 *
 * Only sites whose cell passes 0x609CF0 are served; we read that as a standing,
 * trading building. The original first moves an idle person of the right type
 * from elsewhere before creating one; our free people always stand at a site,
 * so the top-up only creates. Compact cities keep their per-block pool.
 */
import { createPerson, hoodPayDemand } from './citygen';
import { BUILDING_BY_ID } from './data/buildings';
import { heritageOfSurname, type Heritage } from './heritage';
import type { Rng } from './rng';
import type { Building, PersonRole, WorldState } from './types';
import { peopleList, buildingList } from './entityLists';
import { isBusinessHood } from './hoodGeneration';

/** Each top-up round brings at least one business hood unless one is already free. */
function needsBusinessHood(w: WorldState): boolean {
  for (const p of peopleList(w)) if (p.role === 'hood' && p.gangId == null && p.status === 'active' && p.buildingId != null && isBusinessHood(p.skills)) return false;
  return true;
}

type Quota = { role: Extract<PersonRole, 'hood' | 'accountant' | 'lawyer'>; count: number };

const BY_KIND: Record<number, Quota> = {
  0: { role: 'accountant', count: 1 }, 67: { role: 'accountant', count: 5 },
  70: { role: 'lawyer', count: 1 },
  57: { role: 'hood', count: 2 }, 91: { role: 'hood', count: 2 }, 124: { role: 'hood', count: 5 },
};
const BY_CIVIC: Record<string, Quota> = { courthouse: { role: 'lawyer', count: 5 }, labourExchange: { role: 'hood', count: 5 } };

export function recruitQuota(b: Building): Quota | undefined {
  if (b.cls === 'municipal') return BY_CIVIC[b.typeId];
  return b.originalKind != null ? BY_KIND[b.originalKind] : undefined;
}

const serving = (b: Building) => b.state === 'trading' || b.cls === 'municipal' && b.state !== 'destroyed';

function preferHeritage(w: WorldState): Heritage {
  const surname = w.options.playerName.trim().split(/\s+/).pop() ?? '';
  return w.options.playerHeritage ?? heritageOfSurname(surname) ?? 'italian';
}

/**
 * Top every recruitment site up to its quota. The original city uses the
 * visitor quotas; every other city keeps two hoods (one specialist) standing
 * at each place that hires them, so the street supply comes back after a crew
 * takes people on. Returns people added.
 */
export function replenishOriginalRecruits(w: WorldState, rng: Rng): number {
  if (!w.cityLayout?.original) return replenishStreetRecruits(w, rng);
  const present = new Map<string, number>();
  for (const p of peopleList(w)) {
    if (p.gangId != null || p.status !== 'active' || p.employedBy != null || p.buildingId == null) continue;
    const key = `${p.buildingId}:${p.role}`;
    present.set(key, (present.get(key) ?? 0) + 1);
  }
  let added = 0;
  let wantBusiness = needsBusinessHood(w);
  for (const b of buildingList(w)) {
    const quota = recruitQuota(b);
    if (!quota || !serving(b)) continue;
    for (let n = present.get(`${b.id}:${quota.role}`) ?? 0; n < quota.count; n++, added++) {
      const p = createPerson(w, rng, quota.role, w.lots[b.lotId].center, {
        quality: 1.1, businessType: quota.role === 'hood' && wantBusiness, buildingId: b.id, prefer: preferHeritage(w) });
      if (quota.role === 'hood') wantBusiness = false;
      p.payDemand = hoodPayDemand(p, quota.role);
    }
  }
  return added;
}

/** Compact and varied cities: the same idea, from the building's recruit kind. */
function replenishStreetRecruits(w: WorldState, rng: Rng): number {
  const present = new Map<string, number>();
  for (const p of peopleList(w)) {
    if (p.gangId != null || p.status !== 'active' || p.buildingId == null) continue;
    const key = `${p.buildingId}:${p.role}`;
    present.set(key, (present.get(key) ?? 0) + 1);
  }
  const prefer = preferHeritage(w);
  let added = 0;
  let wantBusiness = needsBusinessHood(w);
  for (const b of buildingList(w)) {
    if (b.state === 'destroyed') continue;
    const role = BUILDING_BY_ID[b.typeId]?.recruit;
    if (!role) continue;
    const want = role === 'hood' ? 2 : 1;
    for (let n = present.get(`${b.id}:${role}`) ?? 0; n < want; n++, added++) {
      const p = createPerson(w, rng, role, w.lots[b.lotId].center, {
        quality: 1.1, businessType: role === 'hood' && wantBusiness, buildingId: b.id, prefer });
      if (role === 'hood') wantBusiness = false;
      p.payDemand = hoodPayDemand(p, role);
    }
  }
  return added;
}
