import { ORDERS } from './constants';
import type { Order, Person, Team, WorldState } from './types';
import { skillAvg } from './world';
import { isGangOffice } from './officeDefence';

export function crewPeople(w: WorldState, team: Team): Person[] {
  return [...new Set([team.lieutenantId, ...team.memberIds])].map(id => w.people[id])
    .filter((p): p is Person => !!p && p.gangId === team.gangId && p.teamId === team.id &&
      (p.id === team.lieutenantId ? p.role === 'lieutenant' : p.role === 'hood'));
}

/** Current jobs and return journeys can finish before a queued job begins. */
export function readyForPlanning(w: WorldState, p: Person): boolean {
  return p.status === 'active' && p.buildingId == null && p.burningEscape?.week !== w.week;
}

/**
 * 1.2.50 (Robert): a crew man or lieutenant waiting inside his own office
 * counts as free for orders; he walks out when an order takes him.
 * 1.2.84 (Robert): for every gang (idle men wait inside for all gangs).
 */
export function waitingInside(w: WorldState, p: Person): boolean {
  return p.status === 'active' && p.buildingId != null && p.burningEscape?.week !== w.week &&
    (p.role === 'hood' || p.role === 'lieutenant') && isGangOffice(w.buildings[p.buildingId], p.gangId);
}

/** Free for orders: ready for planning, or waiting inside his own office (1.2.50). */
export function freeForOrders(w: WorldState, p: Person): boolean {
  return readyForPlanning(w, p) || waitingInside(w, p);
}

export function orderStaffing(w: WorldState, team: Team, order: Pick<Order, 'type' | 'opts'>, planning = false) {
  const members = crewPeople(w, team).filter(p => p.status !== 'dead');
  // 1.2.61 (Robert): a man on no job who is only on his way home — on foot, or in a
  // crew car that is only driving home (no job, no goods) — is free for queued orders.
  const homeward = (p: Person) => { const v = p.vehicleKey ? w.vehicleFleet?.[p.vehicleKey] : undefined; return !p.vehicleKey || (!!v && v.orderId == null && !!v.returning && !v.cargo); };
  const available = members.filter(p => freeForOrders(w, p) &&
    (planning || homeward(p) && p.orderId == null && !p.streetOrder));
  const want = Math.max(1, order.opts.manpower);
  const preferred = order.opts.preferredHoodId == null ? null : members.find(p => p.id === order.opts.preferredHoodId);
  // 1.2.60 (Robert): a man named on another of the crew's queued orders is held
  // for it — the crew's other orders are staffed without him.
  const held = new Set<number>();
  for (const oid of team.orderIds) {
    const other = w.orders[oid];
    if (!other || other === order || other.state !== 'queued' || other.opts.preferredHoodId == null) continue;
    if (other.opts.preferredHoodId !== order.opts.preferredHoodId) held.add(other.opts.preferredHoodId);
  }
  const open = available.filter(p => p === preferred || !held.has(p.id));
  let reason: string | null = null, impossible = false;
  if (order.opts.preferredHoodId != null && !preferred) {
    reason = 'The preferred person is no longer available in this crew.'; impossible = true;
  } else if (members.length < want) {
    reason = `This order needs ${want} people, but only ${members.length} remain in the crew.`; impossible = true;
  } else if (preferred && !available.includes(preferred)) {
    reason = `${preferred.name} is ${planning ? 'unavailable' : 'not free yet'}; this order needs that person.`;
  } else if (open.length < want) {
    reason = `This order needs ${want} people; ${open.length} ${open.length === 1 ? 'is' : 'are'} ${planning ? 'available' : 'free'}.`;
  }
  const chosen = preferred && available.includes(preferred) ? [preferred] : [];
  const lt = open.find(p => p.id === team.lieutenantId);
  const def = ORDERS[order.type];
  const dangerous = def.group === 'minor' || def.group === 'violent' || order.type === 'guardBusiness' || order.type === 'patrol';
  // Manual p.88: poor leaders avoid danger even when best suited to the job.
  // Three stars is remake tuning. A capable leader competes on task skill;
  // otherwise they remain the fallback, so accepted manpower is still filled.
  const willing = dangerous && lt && skillAvg(lt, ['organization', 'intelligence']) >= 3;
  const candidates = open.filter(p => p !== preferred && (p.id !== team.lieutenantId || willing))
    .sort((a, b) => skillAvg(b, def.skills) - skillAvg(a, def.skills) ||
      Number(a.id === team.lieutenantId) - Number(b.id ===team.lieutenantId));
  while (chosen.length < want && candidates.length) chosen.push(candidates.shift()!);
  if (chosen.length < want && lt && !chosen.includes(lt)) chosen.push(lt);
  return { chosen, available: available.length, reason, impossible };
}
