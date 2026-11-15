/**
 * 1.2.56 (Robert): Auto's own learning. Every order a crew is given records
 * what Auto expected of it — its value (value × chance) and its heat — and,
 * once it has run, what it actually brought: the value the game shows and the
 * men it cost (lost × L, arrested × A). The gap moves a ratio per order type,
 * decayed LEARN_DECAY a week and clamped to [LEARN_MIN, LEARN_MAX]; the next
 * week's values and heat are multiplied by it. Close calls are settled by a
 * weighted coin from Auto's own seeded stream, so the default seed replays
 * exactly and the game's own rolls do not shift.
 */
import { Rng } from '../sim/rng';
import type { WorldState } from '../sim/types';
import { EXEC_PRIOR } from './autoExec';

/** proposed: weekly decay of the expected and actual sums. */
export const LEARN_DECAY = 0.9;
/** proposed: the learned ratio is kept within these bounds. */
export const LEARN_MIN = 0.25;
export const LEARN_MAX = 4;
/** proposed: a hold-back within this share of the order's worth (or COIN_BAND_DOLLARS) is settled by a weighted coin. */
export const COIN_BAND_SHARE = 0.15;
export const COIN_BAND_DOLLARS = 100;
/** proposed: an order type not given for TRIAL_WEEKS weeks is tried anyway with this chance. */
export const TRIAL_CHANCE = 0.1;
export const TRIAL_WEEKS = 4;
/** proposed: the exploration stream's salt (kept apart from the week's own rolls). */
const EXPLORE_SALT = 0x5eed;

export interface LearnExpect { orderId: number; type: string; week: number; value: number; heat: number }
interface Sums { exp: number; act: number; n: number }
export interface LearnMemory { pending: LearnExpect[]; value: Record<string, Sums>; heat: Record<string, Sums>; settledWeek: number }

const memories = new WeakMap<WorldState, LearnMemory>();
export function learnMemory(w: WorldState): LearnMemory {
  let m = memories.get(w);
  if (!m) { m = { pending: [], value: {}, heat: {}, settledWeek: -1 }; memories.set(w, m); }
  return m;
}

/** The exploration stream for a week: its own seed, so no other roll moves. */
export function exploreRng(seed: number, week: number): Rng {
  return new Rng(((seed ^ EXPLORE_SALT) >>> 0) + week * 7919);
}

export function noteExpect(m: LearnMemory, e: LearnExpect): void { m.pending.push(e); }

const add = (book: Record<string, Sums>, type: string, exp: number, act: number) => {
  const s = book[type] ?? (book[type] = { exp: 0, act: 0, n: 0 });
  s.exp += exp; s.act += act; s.n += 1;
};

function ratioOf(s: Sums | undefined): number {
  if (!s || s.n <= 0) return 1;
  const mean = s.exp / s.n;
  if (mean <= 0) return 1;
  return Math.max(LEARN_MIN, Math.min(LEARN_MAX, (s.act + EXEC_PRIOR * mean) / (s.exp + EXEC_PRIOR * mean)));
}
export const valueRatio = (m: LearnMemory, type: string) => ratioOf(m.value[type]);
export const heatRatio = (m: LearnMemory, type: string) => ratioOf(m.heat[type]);

/**
 * Monday: last week's expectations against what the orders brought
 * (outcomes: order id → value and the men it cost, from order fitness).
 * Returns the LEARN line.
 */
export function settleLearn(m: LearnMemory, w: WorldState, outcomes: ReadonlyMap<number, { value: number; lossCost: number }>): string | null {
  if (m.settledWeek === w.week) return null;
  m.settledWeek = w.week;
  for (const book of [m.value, m.heat]) for (const s of Object.values(book)) { s.exp *= LEARN_DECAY; s.act *= LEARN_DECAY; s.n *= LEARN_DECAY; }
  let matched = 0;
  for (const e of m.pending.filter((x) => x.week < w.week)) {
    const o = outcomes.get(e.orderId);
    if (!o) continue;
    matched++;
    add(m.value, e.type, e.value, o.value);
    add(m.heat, e.type, e.heat, o.lossCost);
  }
  m.pending = m.pending.filter((x) => x.week >= w.week);
  const types = [...new Set([...Object.keys(m.value), ...Object.keys(m.heat)])].filter((t) => (m.value[t]?.n ?? 0) >= 0.05).sort();
  if (!types.length) return null;
  const part = (t: string) => {
    const v = m.value[t], h = m.heat[t];
    return `${t} value exp $${Math.round(v?.exp ?? 0)} act $${Math.round(v?.act ?? 0)} ×${valueRatio(m, t).toFixed(2)}; heat exp $${Math.round(h?.exp ?? 0)} act $${Math.round(h?.act ?? 0)} ×${heatRatio(m, t).toFixed(2)} (${(v?.n ?? 0).toFixed(1)} orders)`;
  };
  return `LEARN (1.2.56, decay ×${LEARN_DECAY}, clamp ${LEARN_MIN}–${LEARN_MAX}, prior ${EXEC_PRIOR}, proposed): ${matched} order(s) settled last week; ${types.map(part).join('; ')}`;
}

/** A Gamma(shape ≥ 1) draw (Marsaglia–Tsang) from the exploration stream. */
function gamma(rng: Rng, shape: number): number {
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      const u1 = Math.max(1e-12, rng.next()), u2 = rng.next();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.max(1e-12, rng.next());
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}
/** A draw from Beta(a, b), a and b ≥ 1. */
export function betaDraw(rng: Rng, a: number, b: number): number {
  const x = gamma(rng, a), y = gamma(rng, b);
  return x / (x + y);
}
