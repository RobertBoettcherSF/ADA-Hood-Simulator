import { MINUTES_PER_DAY } from './constants';
import { receiveCash } from './finances';
import { r01 } from './hash';
import type { Building, WorldState } from './types';
import { buildingList } from './entityLists';

/** One apartment per floor, at most two tenants in it. */
export const RENTED_ROOMS_MAX_FLOORS = 4;
export const RENTED_ROOMS_MAX_TENANTS = 2;
/** Collected each working day from the apartment, once, whoever is living there. */
export const RENTED_ROOMS_DAILY_RENT = 120;
/** Days an apartment stays empty after the tenants leave, before someone new takes it. */
export const RENTED_ROOMS_VACANT_DAYS = 1;
/** A working day is eight hours. One tenant earns 75 an hour; two sharing earn 150. */
export const TENANT_HOURLY = 75;
export const TENANT_SHARED_HOURLY = 150;
export const TENANT_HOURS = 8;

export interface RoomTenant {
  /** null: nobody lives here. */
  budget: number | null;
  vacantDays: number;
  /** People sharing the apartment. One of them can pay the whole rent. */
  occupants?: 1 | 2;
}

export function clampFloors(floors: number | undefined): number {
  const n = Math.round(floors ?? 2);
  return Math.max(1, Math.min(RENTED_ROOMS_MAX_FLOORS, Number.isFinite(n) ? n : 2));
}

/** True on the first minute of each working day. */
export function isRentMinute(minute: number): boolean {
  return minute > 0 && minute % MINUTES_PER_DAY === 1;
}

/** What the apartment earned today. It does not touch the sim's random stream. */
export function apartmentEarnings(occupants: number): number {
  return (occupants >= 2 ? TENANT_SHARED_HOURLY : TENANT_HOURLY) * TENANT_HOURS;
}

export function freshTenants(floors: number): RoomTenant[] {
  return Array.from({ length: clampFloors(floors) }, () => ({ budget: 0, vacantDays: 0, occupants: 1 as const }));
}

/**
 * Each open apartment is billed once a day. The tenants add the day's wages
 * to their own purse and pay the whole rent if they can. If the purse will
 * not cover it, they move out before the rent is due and the landlord is not
 * paid. A single tenant can pay the apartment's rent.
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
    if (tenant.vacantDays >= RENTED_ROOMS_VACANT_DAYS) {
      const occupants = r01(buildingId * 17 + floor * 13, week * 10 + day) < 0.5 ? 1 : 2;
      return payOrLeave({ budget: 0, vacantDays: 0, occupants }, rent, take);
    }
    return { budget: null, vacantDays: tenant.vacantDays + 1 };
  }
  return payOrLeave(tenant, rent, take);
}

function payOrLeave(tenant: RoomTenant, rent: number, take: (paid: number) => void): RoomTenant {
  const occupants = tenant.occupants === 2 ? 2 : 1;
  const budget = (tenant.budget ?? 0) + apartmentEarnings(occupants);
  if (budget < rent) return { budget: null, vacantDays: 0, occupants: 1 };
  take(rent);
  return { budget: budget - rent, vacantDays: 0, occupants };
}

function normalizeTenants(building: Building, floors: number): RoomTenant[] {
  const current = building.roomsTenants ?? [];
  return Array.from({ length: floors }, (_, i) => current[i] ?? { budget: 0, vacantDays: 0, occupants: 1 });
}

function isOpenRooms(building: Building): boolean {
  return building.typeId === 'rentedRooms' && building.state === 'trading';
}
