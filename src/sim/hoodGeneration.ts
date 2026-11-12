/**
 * Recruit skills from the original hood-generation table, with every row read
 * as the skill it really sets (the shipped table's row labels were shifted by
 * one place, which made arsonists common and business hoods rare).
 *
 * Each of the 18 types has a weighting and, per skill, a base and a range:
 * the byte is base + rand(0..range-1), intelligence on 0..255 and the other
 * ten skills on 0..63. Bytes become our half-star ratings through the same
 * star bands the wage code uses (originalWages.ts skillByte).
 */
import type { Rng } from './rng';
import { SKILLS, type Skill, type Skills } from './types';

type Row = [base: number, range: number];
export interface HoodType {
  name: string;
  weight: number;
  /** Rows that differ from the type's default skill row. */
  rows: Partial<Record<Skill, Row>>;
  /** Row for every skill not listed (intelligence must be listed). */
  rest: Row;
  /** Business, intelligence and organisation hood (runs fronts and books). */
  business?: boolean;
}

const LT: Partial<Record<Skill, Row>> = { organization: [32, 32] };
const hoodAndLt = (name: string, rows: Partial<Record<Skill, Row>>, business = false): HoodType[] => [
  { name: `${name} Hood`, weight: 5, rows: { intelligence: [96, 64], ...rows }, rest: [0, 40], business },
  { name: `${name} Lt`, weight: 5, rows: { intelligence: [128, 128], ...rows, ...LT }, rest: [0, 40], business },
];

export const HOOD_TYPES: HoodType[] = [
  { name: 'Poor Hood', weight: 25, rows: { intelligence: [64, 64] }, rest: [0, 40] },
  { name: 'Poor Lt', weight: 25, rows: { intelligence: [64, 192], ...LT }, rest: [0, 40] },
  { name: 'Average Hood', weight: 12, rows: { intelligence: [64, 64] }, rest: [16, 32] },
  { name: 'Average Lt', weight: 12, rows: { intelligence: [128, 128], ...LT }, rest: [16, 32] },
  { name: 'Superhood', weight: 1, rows: { intelligence: [160, 96] }, rest: [40, 24] },
  { name: 'Recruiter', weight: 5, rows: { intelligence: [160, 96], stealth: [32, 32] }, rest: [0, 40] },
  ...hoodAndLt('Business', { business: [32, 32], stealth: [32, 16], firearms: [32, 16], organization: [32, 32] }, true),
  ...hoodAndLt('Extortion', { stealth: [32, 16], intimidation: [32, 32] }),
  ...hoodAndLt('Arson', { arson: [32, 32], stealth: [32, 32], explosives: [32, 16] }),
  ...hoodAndLt('Explosives', { arson: [32, 16], stealth: [32, 32], explosives: [32, 32] }),
  ...hoodAndLt('Firearms', { stealth: [32, 32], firearms: [32, 32] }),
  ...hoodAndLt('Fighting', { fists: [32, 32], stealth: [32, 32], knives: [32, 32] }),
];

const TOTAL_WEIGHT = HOOD_TYPES.reduce((a, t) => a + t.weight, 0);

/** Star band midpoints (half-star 0.5 .. 5), shared with the wage code. */
const INT_BANDS = [12, 38, 63, 88, 113, 138, 163, 188, 213, 241];
const SKILL_BANDS = [2, 8, 16, 24, 30, 34, 38, 46, 54, 60];

/** An original skill byte to our half-star rating (nearest band). */
export function starsFromByte(skill: Skill, byte: number): number {
  const bands = skill === 'intelligence' ? INT_BANDS : SKILL_BANDS;
  let best = 0;
  for (let i = 1; i < bands.length; i++) if (Math.abs(bands[i] - byte) < Math.abs(bands[best] - byte)) best = i;
  return (best + 1) / 2;
}

export function pickHoodType(rng: Rng, filter?: (t: HoodType) => boolean): HoodType {
  const pool = filter ? HOOD_TYPES.filter(filter) : HOOD_TYPES;
  const total = filter ? pool.reduce((a, t) => a + t.weight, 0) : TOTAL_WEIGHT;
  let roll = rng.next() * total;
  for (const t of pool) { roll -= t.weight; if (roll < 0) return t; }
  return pool[pool.length - 1];
}

export function rollHoodSkills(rng: Rng, type: HoodType): Skills {
  const s = {} as Skills;
  for (const k of SKILLS) {
    const [base, range] = type.rows[k] ?? type.rest;
    const max = k === 'intelligence' ? 255 : 63;
    const byte = Math.min(max, base + (range > 0 ? rng.int(0, range - 1) : 0));
    s[k] = starsFromByte(k, byte);
  }
  return s;
}

/** Skills for a new hood; `business` forces a business type. */
export function generateHoodSkills(rng: Rng, opts: { business?: boolean } = {}): Skills {
  return rollHoodSkills(rng, pickHoodType(rng, opts.business ? t => !!t.business : undefined));
}

/** A hood good enough to run a business: two and a half stars or more in business. */
export const isBusinessHood = (s: Skills) => s.business >= 2.5;
