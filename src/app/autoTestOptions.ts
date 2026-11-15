/**
 * 1.2.57 (Robert): the Auto Test choices — the whole start, the seed, and the
 * saved-seed list — remembered across runs in the world folder
 * (auto-test-options.json, proposed name).
 */
import { DEFAULT_AUTO_TEST_START, SAVED_AUTO_TEST_SEEDS, type AutoTestStart } from './autoTest';
import { activeWorldStore } from './worldFolder';

const FILE = 'auto-test-options.json';

export interface AutoTestChoice {
  /** True: test the open city as it is; false: a new city from the start below. */
  thisCity: boolean;
  seed: number;
  savedSeeds: number[];
  start: AutoTestStart;
  untilEnd: boolean;
  weeks: number;
  speed: number;
}

export function defaultAutoTestChoice(): AutoTestChoice {
  return { thisCity: false, seed: SAVED_AUTO_TEST_SEEDS[0], savedSeeds: [...SAVED_AUTO_TEST_SEEDS], start: { ...DEFAULT_AUTO_TEST_START }, untilEnd: false, weeks: 4, speed: 4 };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** The remembered choice, merged over the defaults (a missing or unreadable file gives the defaults). */
export async function loadAutoTestChoice(): Promise<AutoTestChoice> {
  const d = defaultAutoTestChoice();
  try {
    const bytes = await activeWorldStore()?.readBytes(FILE);
    if (!bytes) return d;
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as Partial<AutoTestChoice>;
    const start = { ...d.start, ...(raw.start ?? {}) } as AutoTestStart;
    const saved = Array.isArray(raw.savedSeeds) ? raw.savedSeeds.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).map((x) => x >>> 0) : d.savedSeeds;
    return {
      thisCity: raw.thisCity === true,
      seed: num(raw.seed, d.seed) >>> 0,
      savedSeeds: saved.length ? [...new Set(saved)] : d.savedSeeds,
      start,
      untilEnd: raw.untilEnd === true,
      weeks: Math.max(1, Math.min(52, Math.round(num(raw.weeks, d.weeks)))),
      speed: Math.max(1, Math.min(10, Math.round(num(raw.speed, d.speed)))),
    };
  } catch {
    return d;
  }
}

export async function saveAutoTestChoice(choice: AutoTestChoice): Promise<void> {
  const store = activeWorldStore();
  if (!store) return;
  await store.writeBytes(FILE, new TextEncoder().encode(JSON.stringify(choice, null, 1)));
}
