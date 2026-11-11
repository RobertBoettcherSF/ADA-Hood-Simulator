/**
 * Settings and records that belong to the city folder: audio, interface scale,
 * display options, and the hall of fame. The browser does not keep these.
 * Until a folder is attached they live in memory for this page only.
 */
import { activeWorldStore } from './worldFolder';
import type { HallEntry } from './save';

export interface AudioPrefs {
  music: number;
  sfx: number;
  menuMusic: boolean;
  gameMusic: boolean;
  /** The loading reel's theme. Absent in older settings, which means play it. */
  reelMuted?: boolean;
  /** Speaker button and the M key. Silences the reel and the desk score together. */
  musicMuted?: boolean;
}

export type GraphicsChoice = 'auto' | 'phone' | 'desktop';

export interface LocalData {
  audio: AudioPrefs;
  uiScale: number;
  textureQuality: 'high' | 'standard';
  graphics: GraphicsChoice;
  /** Idle street demonstration on the main menu. */
  cityDemo: boolean;
  mouseReversal: boolean;
  roadNames: boolean;
  autoLowerRoofs: boolean;
  hall: HallEntry[];
}

const FILE = 'prefs.json';
const SCALES = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

function defaults(): LocalData {
  return {
    audio: { music: 0.35, sfx: 0.5, menuMusic: true, gameMusic: true },
    uiScale: 1,
    textureQuality: 'high',
    graphics: 'auto',
    cityDemo: true,
    mouseReversal: false,
    roadNames: false,
    autoLowerRoofs: true,
    hall: [],
  };
}

let data = defaults();
let hallWriteError: Error | null = null;

export function readLocalData(): LocalData {
  return data;
}

export function failNextHallWrite(): void {
  hallWriteError = new Error('Quota');
}

function audioPrefs(value: unknown, fallback: AudioPrefs): AudioPrefs {
  const saved = value && typeof value === 'object' ? value as Partial<AudioPrefs> : {};
  return {
    music: typeof saved.music === 'number' && saved.music >= 0 && saved.music <= 1 ? saved.music : fallback.music,
    sfx: typeof saved.sfx === 'number' && saved.sfx >= 0 && saved.sfx <= 1 ? saved.sfx : fallback.sfx,
    menuMusic: typeof saved.menuMusic === 'boolean' ? saved.menuMusic : fallback.menuMusic,
    gameMusic: typeof saved.gameMusic === 'boolean' ? saved.gameMusic : fallback.gameMusic,
    reelMuted: typeof saved.reelMuted === 'boolean' ? saved.reelMuted : false,
    musicMuted: typeof saved.musicMuted === 'boolean' ? saved.musicMuted : (typeof saved.reelMuted === 'boolean' ? saved.reelMuted : false),
  };
}

function sanitize(value: unknown): LocalData {
  const base = defaults();
  if (!value || typeof value !== 'object') return base;
  const raw = value as Partial<LocalData>;
  const scale = typeof raw.uiScale === 'number' && SCALES.includes(raw.uiScale) ? raw.uiScale : base.uiScale;
  return {
    audio: audioPrefs(raw.audio, base.audio),
    uiScale: scale,
    textureQuality: raw.textureQuality === 'standard' ? 'standard' : 'high',
    graphics: raw.graphics === 'phone' || raw.graphics === 'desktop' ? raw.graphics : 'auto',
    cityDemo: raw.cityDemo !== false,
    mouseReversal: raw.mouseReversal === true,
    roadNames: raw.roadNames === true,
    autoLowerRoofs: raw.autoLowerRoofs !== false,
    hall: Array.isArray(raw.hall) ? raw.hall as HallEntry[] : [],
  };
}

export async function loadLocalData(): Promise<LocalData> {
  const store = activeWorldStore();
  if (!store) return data;
  try {
    const text = await store.read(FILE);
    if (text) data = sanitize(JSON.parse(text));
  } catch { /* keep what this page already has */ }
  return data;
}

export async function flushLocalData(): Promise<void> {
  const store = activeWorldStore();
  if (!store) return;
  if (hallWriteError) {
    const error = hallWriteError;
    hallWriteError = null;
    throw error;
  }
  await store.write(FILE, JSON.stringify(data));
}

export function patchLocalData(patch: Partial<Omit<LocalData, 'audio' | 'hall'>> & { audio?: Partial<AudioPrefs> }): LocalData {
  data = sanitize({
    ...data,
    ...patch,
    audio: { ...data.audio, ...patch.audio },
    hall: data.hall,
  });
  void flushLocalData().catch(() => {});
  return data;
}

export function loadHallEntries(): HallEntry[] {
  return [...data.hall].sort((a, b) => b.score - a.score);
}

export function saveHallEntries(entries: HallEntry[]): void {
  if (hallWriteError) {
    const error = hallWriteError;
    hallWriteError = null;
    throw error;
  }
  data = { ...data, hall: entries };
  void flushLocalData().catch(() => {});
}

export function clearHallEntries(): void {
  data = { ...data, hall: [] };
  void flushLocalData().catch(() => {});
}
