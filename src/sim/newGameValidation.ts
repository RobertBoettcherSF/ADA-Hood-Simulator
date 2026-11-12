import { purchasablePremisesType } from './premises';
import type { GameOptions, WorldState } from './types';
import { activeBlocks } from './cityLayout';
import { buildingClaimants, territorySites } from './territory';

/** The original game's block grid (deep16 §2: `city[178]/[179]` = 40 × 32). */
export const ORIGINAL_CITY = { w: 40, h: 32 } as const;

/** The player's city sizes on the New Game screen (1.2.20): blocks across and down. */
export const CITY_SIZE_PRESETS = {
  small: { w: 36, h: 28, label: 'Small' },
  standard: { w: 40, h: 32, label: 'Standard' },
  large: { w: 44, h: 35, label: 'Large' },
} as const;
export type CitySizePreset = keyof typeof CITY_SIZE_PRESETS;
/** The largest grid a city may have (the Large preset). */
export const MAX_CITY = { w: 44, h: 35 } as const;

/** The preset a city's dimensions match, if any. */
export function citySizePreset(options: Pick<GameOptions, 'citySize' | 'cityHeight'>): CitySizePreset | null {
  for (const [id, p] of Object.entries(CITY_SIZE_PRESETS)) if (options.citySize === p.w && options.cityHeight === p.h) return id as CitySizePreset;
  return null;
}

/** Compact square cities, kept for tests and quick checks (not on the player's menu since 1.2.20). */
export const COMPACT_CITY_SIZES = { min: 10, max: 18, default: 14 } as const;

/** The generator's actual dimensions, including its existing API clamp. */
export function generatedCitySize(requested: number): number {
  if (!Number.isSafeInteger(requested)) throw Error('City size must be a whole number.');
  return Math.max(8, Math.min(20, requested));
}

/** Blocks across and down. A city without `cityHeight` is a square compact city;
 * with it, the width may reach 44 and the height 35 (the Large city). */
export function generatedCityDimensions(options: Pick<GameOptions, 'citySize' | 'cityHeight'>): { w: number; h: number } {
  if (options.cityHeight == null) {
    const size = generatedCitySize(options.citySize);
    return { w: size, h: size };
  }
  for (const n of [options.citySize, options.cityHeight])
    if (!Number.isSafeInteger(n)) throw Error('City size must be a whole number.');
  return { w: Math.max(8, Math.min(MAX_CITY.w, options.citySize)),
    h: Math.max(8, Math.min(MAX_CITY.h, options.cityHeight)) };
}

export function isOriginalCity(options: Pick<GameOptions, 'citySize' | 'cityHeight'>): boolean {
  return options.citySize === ORIGINAL_CITY.w && options.cityHeight === ORIGINAL_CITY.h;
}

export function cityBlockCount(options: Pick<GameOptions, 'citySize' | 'cityHeight'>): number {
  const { w, h } = generatedCityDimensions(options);
  return w * h;
}

export class TerritoryTargetError extends Error {
  constructor(readonly maximum: number) {
    super(`This city can support at most ${maximum} territory blocks. Choose a whole-number target from 1 to ${maximum}.`);
    this.name = 'TerritoryTargetError';
  }
}

/** New campaigns only. Historical saves retain the objective they stored. */
export function validateTerritoryTarget(options: GameOptions, maximum: number): void {
  if (options.mode !== 'territory') return;
  if (!Number.isSafeInteger(options.territoryTarget) || options.territoryTarget < 1 || options.territoryTarget > maximum) {
    throw new TerritoryTargetError(maximum);
  }
}

/** An upper bound under the current acquisition rules. A block needs only one
 * business; municipal neighbours do not invalidate that business's claim.
 * Never promise that a player can win just because the target fits this bound. */
export function potentialTerritoryCapacity(w: WorldState): number {
  let blocks = 0;
  for (const block of activeBlocks(w)) {
    const claimable = territorySites(w, block).some(b => {
      if (b.state === 'destroyed') return false;
      const lot = w.lots[b.lotId];
      const claim = buildingClaimants(w, b).length > 0;
      const ordinary = b.cls !== 'empty' && purchasablePremisesType(b);
      // An empty edge lot may become a legal site; a centre lot may not.
      const legalPlot = b.cls === 'empty' && lot?.index !== 4;
      return claim || ordinary || legalPlot;
    });
    if (claimable) blocks++;
  }
  return blocks;
}

/** Manual p.32: the Territory Game slider runs from 100 to 500 blocks. A
 * smaller city lowers both ends to what it can hold; steps stay 25 blocks. */
export const TERRITORY_TARGET_RANGE = { min: 100, max: 500 } as const;

export function territorySetupMaximum(city: Pick<GameOptions, 'citySize' | 'cityHeight'>, capacity = cityBlockCount(city)): number {
  const maximum = Math.min(cityBlockCount(city), capacity, TERRITORY_TARGET_RANGE.max);
  return maximum >= 50 ? Math.floor(maximum / 25) * 25 : maximum;
}

export function territorySetupMinimum(maximum: number): number {
  return Math.min(TERRITORY_TARGET_RANGE.min, maximum);
}

export function reconcileTerritorySetup(options: GameOptions, capacity?: number): GameOptions {
  if (options.mode !== 'territory') return options;
  const maximum = territorySetupMaximum(options, capacity);
  const minimum = territorySetupMinimum(maximum);
  const step = maximum >= 50 ? 25 : 1;
  const requested = Number.isFinite(options.territoryTarget) ? options.territoryTarget : minimum;
  // Match native range-input step sanitization, including off-step setup copies.
  const target = minimum + Math.round((requested - minimum) / step) * step;
  const territoryTarget = Math.max(minimum, Math.min(maximum, target));
  return territoryTarget === options.territoryTarget ? options : { ...options, territoryTarget };
}

/** The boss's full name, as the original printed it: First "Nick" Last, or
 * the name alone when there is no nickname (or only one word to wrap it in). */
export function bossName(name: string, nickname?: string): string {
  const full = name.trim(), nick = nickname?.trim().replace(/"/g, '');
  if (!nick) return full;
  const space = full.indexOf(' ');
  return space < 0 ? `${full} "${nick}"` : `${full.slice(0, space)} "${nick}" ${full.slice(space + 1).trim()}`;
}
