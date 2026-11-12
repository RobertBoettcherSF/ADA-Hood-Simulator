/**
 * One diary for the folder, `09 Reports/autotest-diary.json`.
 * Runs are appended. A new city reads it once and copies a playbook only from
 * the default campaign, and only after that campaign has three runs.
 */
import type { WorldState } from '../sim/types';
import { activeWorldStore, REPORTS_DIR } from './worldFolder';
import { playbookForNewCity, type Diary, type DiaryEntry } from './strategy';

const FILE = `${REPORTS_DIR}/autotest-diary.json`;

export interface DiarySink {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  remove(): Promise<void>;
}

export function emptyDiary(): Diary {
  return { version: 1, entries: [] };
}

export function folderDiary(): DiarySink {
  return {
    async read() {
      const store = activeWorldStore();
      if (!store) return null;
      const bytes = await store.readBytes(FILE);
      return bytes ? new TextDecoder().decode(bytes) : null;
    },
    async write(text) {
      const store = activeWorldStore();
      if (!store) throw new Error('No world folder, so the diary was not saved.');
      await store.writeBytes(FILE, new TextEncoder().encode(text));
    },
    async remove() {
      const store = activeWorldStore();
      if (!store) return;
      await store.remove(FILE);
    },
  };
}

export function memoryDiary(): { sink: DiarySink; text(): string | null } {
  let body: string | null = null;
  return {
    sink: {
      read: async () => body,
      write: async (text) => { body = text; },
      remove: async () => { body = null; },
    },
    text: () => body,
  };
}

function isEntry(value: unknown): value is DiaryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as DiaryEntry;
  return !!entry.settings && !!entry.strategy && typeof entry.score === 'number' && Array.isArray(entry.strategy.priority);
}

/** Drop a damaged file's bad rows. A file that is not JSON at all is unreadable. */
export function parseDiary(text: string): Diary {
  const raw = JSON.parse(text) as { entries?: unknown };
  const entries = Array.isArray(raw.entries) ? raw.entries.filter(isEntry) : [];
  return { version: 1, entries };
}

export async function loadDiary(sink: DiarySink): Promise<{ diary: Diary; unreadable: boolean }> {
  const text = await sink.read();
  if (!text) return { diary: emptyDiary(), unreadable: false };
  try {
    return { diary: parseDiary(text), unreadable: false };
  } catch {
    return { diary: emptyDiary(), unreadable: true };
  }
}

export function serializeDiary(diary: Diary): string {
  return JSON.stringify(diary, null, 2);
}

/** Copy the default campaign's best strategy onto a new city. Other diaries do not teach rivals. */
export async function stampRivalPlaybook(world: WorldState, sink: DiarySink = folderDiary()): Promise<void> {
  if (world.options.tutorialId != null || world.options.scenarioId != null) return;
  let diary: Diary | null = null;
  try {
    const loaded = await loadDiary(sink);
    if (loaded.unreadable) return;
    diary = loaded.diary;
  } catch {
    return;
  }
  const book = playbookForNewCity(diary);
  if (book) world.rivalPlaybook = book;
}

/** 1.2.21: the learned state written at the end of every Auto Test report. */
export const LEARNED_BEGIN = '----- BEGIN AUTO TEST LEARNED STATE -----';
export const LEARNED_END = '----- END AUTO TEST LEARNED STATE -----';

export function learnedBlock(entry: DiaryEntry): string {
  return `\n${LEARNED_BEGIN}\n${JSON.stringify(entry)}\n${LEARNED_END}\n`;
}

/**
 * Diary entries found in an Auto Test file (its learned-state block) or a
 * diary file. The parts of a split file are read in name order and joined.
 */
export function learnedEntries(text: string): DiaryEntry[] {
  const out: DiaryEntry[] = [];
  let at = 0;
  for (;;) {
    const begin = text.indexOf(LEARNED_BEGIN, at);
    if (begin < 0) break;
    const end = text.indexOf(LEARNED_END, begin);
    if (end < 0) break;
    try {
      const entry = JSON.parse(text.slice(begin + LEARNED_BEGIN.length, end).trim()) as unknown;
      if (isEntry(entry)) out.push(entry);
    } catch { /* a damaged block is skipped */ }
    at = end + LEARNED_END.length;
  }
  if (!out.length) {
    try { out.push(...parseDiary(text).entries); } catch { /* not a diary either */ }
  }
  return out;
}

/** Load Auto Test files (any size, any number of parts) into the diary as learned state. */
export async function importLearnedState(files: { name: string; text(): Promise<string> }[], sink: DiarySink = folderDiary()): Promise<number> {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const texts = await Promise.all(sorted.map((f) => f.text()));
  const entries = learnedEntries(texts.join(''));
  if (!entries.length) return 0;
  const loaded = await loadDiary(sink);
  const seen = new Set(loaded.diary.entries.map((e) => `${e.at}|${e.seed}`));
  const fresh = entries.filter((e) => !seen.has(`${e.at}|${e.seed}`));
  await sink.write(serializeDiary({ version: 1, entries: [...loaded.diary.entries, ...fresh] }));
  return fresh.length;
}
