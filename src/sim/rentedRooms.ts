import { MINUTES_PER_DAY } from './constants';
import { receiveCash } from './finances';
import { r01 } from './hash';
import type { Building, WorldState } from './types';
import { buildingList } from './entityLists';

/** One apartment per floor. */
export const RENTED_ROOMS_MAX_FLOORS = 4;
/** Collected each working day from a tenant who can pay. */
export const RENTED_ROOMS_DAILY_RENT = 120;
/** Days an apartment stays empty after a tenant leaves, before someone new takes it. */
export const RENTED_ROOMS_VACANT_DAYS = 1;

export interface RoomTenant {
  /** null: nobody lives here. */
  budget: number | null;
  vacantDays: number;
}

export function clampFloors(floors: number | undefined): number {
  const n = Math.round(floors ?? 2);
  return Math.max(1, Math.min(RENTED_ROOMS_MAX_FLOORS, Number.isFinite(n) ? n : 2));
}

/** True on the first minute of each working day. */
export function isRentMinute(minute: number): boolean {
  return minute > 0 && minute % MINUTES_PER_DAY === 1;
}

/** What a tenant earned today. Most days it covers the rent. It does not touch the sim's random stream. */
export function tenantEarnings(buildingId: number, floor: number, week: number, day: number, rent: number): number {
  const roll = r01(buildingId * 17 + floor * 13, week * 10 + day);
  if (roll < 0.18) return Math.round(rent * 0.35);
  return Math.round(rent * (1.05 + roll * 0.45));
}

export function freshTenants(floors: number): RoomTenant[] {
  return Array.from({ length: clampFloors(floors) }, () => ({ budget: 0, vacantDays: 0 }));
}

/**
 * Each open apartment: the tenant adds the day's earnings to their own purse,
 * then pays the landlord if they can. If they cannot, they leave and the
 * apartment stays empty until a new tenant moves in.
 */
export function chargeRentedRooms(w: WorldState): void {
  if (!isRentMinute(w.minute)) return;
  const day = Math.floor((w.minute - 1) / MINUTES_PER_DAY) + 1;
  const key = w.week * 10 + day;
  for (const building of buildingList(w)) {
    if (!isOpenRooms(building) || building.ownerGangId == null) continue;
    if ((building.roomsChargedDay ?? 0) >= key) continue;
    const gang = w.gangs[building.ownerGangId];
    if (!gang || gang.eliminated) continue;
    const floors = clampFloors(building.roomsFloors);
    const tenants = normalizeTenants(building, floors);
    const block = w.blocks[building.blockId];
    const location = 0.8 + (block?.landValue ?? 40) / 250;
    const rent = Math.max(1, Math.round(RENTED_ROOMS_DAILY_RENT * location));
    let collected = 0;
    building.roomsFloors = floors;
    building.roomsTenants = tenants.map((tenant, floor) => settleTenant(tenant, building.id, floor, w.week, day, rent, (paid) => { collected += paid; }));
    building.roomsChargedDay = key;
    building.roomsWeekNet = (building.roomsWeekNet ?? 0) + collected;
    if (collected > 0) receiveCash(w, gang, 'illegal', collected);
  }
}

function settleTenant(
  tenant: RoomTenant, buildingId: number, floor: number, week: number, day: number, rent: number, take: (paid: number) => void,
): RoomTenant {
  if (tenant.budget == null) {
    if (tenant.vacantDays >= RENTED_ROOMS_VACANT_DAYS) return payOrLeave({ budget: 0, vacantDays: 0 }, buildingId, floor, week, day, rent, take);
    return { budget: null, vacantDays: tenant.vacantDays + 1 };
  }
  return payOrLeave(tenant, buildingId, floor, week, day, rent, take);
}

function payOrLeave(
  tenant: RoomTenant, buildingId: number, floor: number, week: number, day: number, rent: number, take: (paid: number) => void,
): RoomTenant {
  const budget = (tenant.budget ?? 0) + tenantEarnings(buildingId, floor, week, day, rent);
  if (budget < rent) return { budget: null, vacantDays: 0 };
  take(rent);
  return { budget: budget - rent, vacantDays: 0 };
}

function normalizeTenants(building: Building, floors: number): RoomTenant[] {
  const current = building.roomsTenants ?? [];
  return Array.from({ length: floors }, (_, i) => current[i] ?? { budget: 0, vacantDays: 0 });
}

function isOpenRooms(building: Building): boolean {
  return building.typeId === 'rentedRooms' && building.state === 'trading';
}
