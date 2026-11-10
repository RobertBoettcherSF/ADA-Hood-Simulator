import { MINUTES_PER_DAY } from './constants';
import { payCash, receiveCash } from './finances';
import type { Building, WorldState } from './types';
import { buildingList } from './entityLists';

/** One apartment per floor, and the usual staff on that floor. */
export const RENTED_ROOMS_MAX_FLOORS = 4;
export const RENTED_ROOMS_STAFF_PER_FLOOR = 2;
/** Collected each working day for an apartment that has its staff. */
export const RENTED_ROOMS_DAILY_RENT = 120;
/** Paid each working day to each member of staff. */
export const RENTED_ROOMS_DAILY_WAGE = 10;

export function clampFloors(floors: number | undefined): number {
  const n = Math.round(floors ?? 2);
  return Math.max(1, Math.min(RENTED_ROOMS_MAX_FLOORS, Number.isFinite(n) ? n : 2));
}

/** True on the first minute of each working day (minute 1, 481, 961, 1441, 1921). */
export function isRentMinute(minute: number): boolean {
  return minute > 0 && minute % MINUTES_PER_DAY === 1;
}

/**
 * Bill rented rooms for the day the clock just entered.
 * Occupied apartments are the floors that have two staff. Extra staff are still paid.
 * A day already billed on this save is skipped.
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
    const staff = Math.max(0, Math.round(building.roomsStaff ?? floors * RENTED_ROOMS_STAFF_PER_FLOOR));
    const open = Math.min(floors, Math.floor(staff / RENTED_ROOMS_STAFF_PER_FLOOR));
    const block = w.blocks[building.blockId];
    const location = 0.8 + (block?.landValue ?? 40) / 250;
    const rent = Math.round(open * RENTED_ROOMS_DAILY_RENT * location);
    const wages = staff * RENTED_ROOMS_DAILY_WAGE;
    building.roomsFloors = floors;
    building.roomsStaff = staff;
    building.roomsChargedDay = key;
    building.roomsWeekNet = (building.roomsWeekNet ?? 0) + rent - wages;
    if (rent > 0) receiveCash(w, gang, 'illegal', rent);
    if (wages > 0) payCash(w, gang, 'wages', wages);
  }
}

function isOpenRooms(building: Building): boolean {
  return building.typeId === 'rentedRooms' && building.state === 'trading';
}
