/**
 * Economy tables tuned to original-game values (v1.2.16): market share of a
 * gang's own same-type businesses, saturation of illegal trades across the
 * city, running costs while a site is closed, empty-land prices and the land
 * value a block loses to violent crime.
 */
import type { Building, BuildingType } from './types';
import type { OrderType } from './types';

/** Profit factor (%) when a gang owns n businesses of one type (n = 1..40). */
const MARKET_SHARE = [100, 95, 90, 85, 80, 75, 71, 87, 83, 79, 76, 73, 70, 67, 65, 63, 61, 59, 58, 57, 56, 55, 54, 53,
  52, 51, 50, 49, 48, 47, 46, 45, 44, 43, 42, 41, 40, 39, 38, 37];

/** A gang's n-th same-type business earns this share of the full profit.
 * The original row for 8..12 rises again (87, 83, …); we keep it non-increasing. */
export function marketShareFactor(owned: number): number {
  if (owned <= 1) return 1;
  let f = 100;
  for (let i = 1; i < Math.min(owned, MARKET_SHARE.length); i++) f = Math.min(f, MARKET_SHARE[i]);
  return f / 100;
}

/** Illegal profit ratio (%) by number of that trade in the city (1..27), five curves. */
const ILLEGAL_RATIO: readonly (readonly number[])[] = [
  [100, 270, 300, 350, 150], [100, 260, 280, 300, 120], [100, 250, 260, 250, 100], [100, 240, 240, 200, 80],
  [100, 230, 220, 150, 60], [100, 220, 200, 100, 40], [100, 210, 180, 90, 20], [100, 200, 160, 80, 0],
  [100, 190, 140, 70, 0], [100, 180, 120, 60, 0], [100, 170, 110, 50, 0], [100, 160, 100, 45, 0],
  [100, 150, 90, 40, 0], [100, 140, 80, 35, 0], [100, 130, 70, 30, 0], [100, 120, 60, 27, 0],
  [100, 110, 55, 25, 0], [100, 100, 50, 23, 0], [100, 90, 45, 21, 0], [100, 80, 40, 19, 0],
  [100, 70, 35, 17, 0], [100, 60, 30, 15, 0], [100, 50, 25, 13, 0], [100, 40, 20, 11, 0],
  [100, 30, 15, 9, 0], [100, 20, 10, 7, 0], [100, 10, 5, 5, 0],
];
/** Which curve each illegal trade follows: 1 slow decline (drink, loans, girls,
 * fights), 2 fast (small games and rackets), 3 steep (casino). */
const ILLEGAL_CURVE: Record<string, number> = {
  speakeasy: 1, loanShark: 1, prizeFight: 1, whorehouse: 1,
  cardGames: 2, diceGame: 2, gamblingDen: 2, grifters: 2, insiderTrading: 2, numbersRacket: 2, teamsters: 2,
  casino: 3,
};
/** Our catalogue profits are set for a city with four of a trade; the original
 * curve is scaled to that point and capped at 1.5×. */
const ILLEGAL_REFERENCE_COUNT = 4;

/** Profit factor for an illegal trade when `count` of them trade in the city. */
export function illegalSaturationFactor(typeId: string, count: number): number {
  const curve = ILLEGAL_CURVE[typeId];
  if (curve == null) return 1;
  const row = (n: number) => ILLEGAL_RATIO[Math.max(0, Math.min(ILLEGAL_RATIO.length - 1, n - 1))][curve];
  return Math.min(1.5, row(Math.max(1, count)) / row(ILLEGAL_REFERENCE_COUNT));
}

/** Weekly running cost by land-value band (0..15): commercial size 1/3/8,
 * industrial, residential, warehouse, empty land. */
const RUNNING_STEP = { small: 20, medium: 50, large: 100, industrial: 80, residential: 70, warehouse: 60, land: 10 } as const;
const RUNNING_BASE = { small: 40, medium: 100, large: 200, industrial: 160, residential: 140, warehouse: 120, land: 20 } as const;
export type RunningClass = keyof typeof RUNNING_BASE;

/** Our 0..100 land value to the original's 16 bands (0..255 >> 4). */
export const landValueBand = (landValue: number) => Math.max(0, Math.min(15, Math.floor(landValue * 2.55) >> 4));

export function runningClass(b: Building, t: BuildingType): RunningClass {
  if (b.cls === 'empty') return 'land';
  if (t.id === 'warehouse') return 'warehouse';
  if (t.cls === 'industrial') return 'industrial';
  if (t.cls === 'tenement') return 'residential';
  if (t.storeys >= 6) return 'large';
  if (t.storeys >= 4) return 'medium';
  return 'small';
}

export function runningCost(cls: RunningClass, landValue: number): number {
  return RUNNING_BASE[cls] + RUNNING_STEP[cls] * landValueBand(landValue);
}

/** Price of a lot of empty land: $40 per land-value band, from $40 to $640. */
export const emptyLandPrice = (landValue: number) => 40 * (landValueBand(landValue) + 1);

/** Land value (0..100) a block loses to a crime committed on it. */
const LAND_LOSS_BYTES: Partial<Record<OrderType | 'streetKill', number>> = { torch: 16, bomb: 32, kill: 32, streetKill: 32, kidnap: 16, raid: 16 };
export function landValueLoss(type: string): number {
  const bytes = LAND_LOSS_BYTES[type as OrderType];
  return bytes ? bytes * 100 / 255 : 0;
}
