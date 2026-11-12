import { devJournalWeeks, splitReport } from './devJournal';
import { instanceFile } from './instance';
import { ERA_2032_ENABLED, ACTIVE_ERA } from './era';
import { formatMemberLoss, memberLosses } from '../sim/memberLosses';
import { activeWorldStore, downloadText } from './worldFolder';
import { recentActions } from './actionLog';
import { slowestAssets } from './assetTiming';
import { resolvedGraphics } from './device';
import { readLocalData } from './localData';
import { systemTimings } from '../sim/simTimings';
import type { WorldState } from '../sim/types';
import { gangManpower, money, territoryCount } from '../sim/world';
import { musicStatusLines } from '../audio/musicPool';

let wish = '';

/** Optional note typed before a debug report is saved. */
export function setReportWish(text: string): void {
  wish = text.trim().slice(0, 500);
}

const errors: string[] = [];
const timings: { label: string; ms: number }[] = [];
const autoplay: string[] = [];
let installed = false;
let worldSource: () => WorldState | null = () => null;

export function setReportWorld(source: () => WorldState | null): void {
  worldSource = source;
}

export function noteError(message: string, stack?: string): void {
  errors.push(`${new Date().toISOString()} ${message}${stack ? `\n${stack}` : ''}`);
  if (errors.length > 40) errors.shift();
}

export function markTiming(label: string, ms: number): void {
  timings.push({ label, ms: Math.round(ms) });
  if (timings.length > 30) timings.shift();
}

export function noteAutoplay(lines: string[]): void {
  autoplay.splice(0, autoplay.length, ...lines);
}

export interface LastAutoTest {
  settings: string;
  weeks: string;
  cash: number;
  men: number;
  territory: number;
  score: number;
  diary: string;
  file: string;
}

let lastAutoTest: LastAutoTest | null = null;

const weekHeaps: { week: number; used: number; total: number }[] = [];

/** Start of an Auto Test run: drop the previous run's weekly heap lines. */
export function clearWeekHeaps(): void {
  weekHeaps.length = 0;
}

/** Used and reserved heap after a finished Auto Test week, in bytes. */
export function noteWeekHeap(week: number, used: number, total: number): void {
  weekHeaps.push({ week, used, total });
  if (weekHeaps.length > 80) weekHeaps.shift();
}

type AutoTestSession =
  | { kind: 'none' }
  | { kind: 'running'; settings: string; weeks: string }
  | { kind: 'done'; note: LastAutoTest };

const AUTO_TEST_KEY = 'hood.autoTestSession';
let autoTestSession: AutoTestSession = { kind: 'none' };

function persistAutoTest(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (autoTestSession.kind === 'none') sessionStorage.removeItem(AUTO_TEST_KEY);
    else sessionStorage.setItem(AUTO_TEST_KEY, JSON.stringify(autoTestSession));
  } catch { /* the report still has the in-memory copy */ }
}

function restoreAutoTest(): void {
  try {
    if (typeof sessionStorage === 'undefined' || autoTestSession.kind !== 'none') return;
    const raw = sessionStorage.getItem(AUTO_TEST_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as AutoTestSession;
    if (parsed?.kind === 'running' || parsed?.kind === 'done') {
      autoTestSession = parsed;
      if (parsed.kind === 'done') lastAutoTest = parsed.note;
    }
  } catch { /* a bad copy is ignored */ }
}

restoreAutoTest();

/** Clear the session note. Tests use this so one file does not leak into the next. */
export function clearAutoTestSession(): void {
  autoTestSession = { kind: 'none' };
  lastAutoTest = null;
  autoplay.splice(0, autoplay.length);
  weekHeaps.length = 0;
  persistAutoTest();
}

/** Called as soon as Auto Test starts, so a report during the run is not "none". */
export function noteAutoTestRunning(settings: string, weeks: string): void {
  autoTestSession = { kind: 'running', settings, weeks };
  lastAutoTest = null;
  persistAutoTest();
}

/** A run that threw before it could write its result. */
export function noteAutoTestStopped(message: string): void {
  if (autoTestSession.kind !== 'running') return;
  noteLastAutoTest({
    settings: autoTestSession.settings,
    weeks: autoTestSession.weeks,
    cash: 0,
    men: 0,
    territory: 0,
    score: 0,
    diary: `Stopped: ${message}`,
    file: '(not written)',
  });
}

/** The debug report's Auto Test section. "(none this session)" only when none has started. */
export function noteLastAutoTest(note: LastAutoTest): void {
  lastAutoTest = note;
  autoTestSession = { kind: 'done', note };
  autoplay.splice(0, autoplay.length, ...[
    note.settings,
    note.weeks,
    `Final: cash ${note.cash} men ${note.men} blocks ${note.territory} score ${note.score}`,
    note.diary,
    `Report file: ${note.file}`,
  ]);
  persistAutoTest();
}

export function installCrashReports(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    const error = event.error instanceof Error ? event.error : null;
    noteError(event.message || 'window.onerror', error?.stack);
    void writeCrashReport();
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    noteError(reason.message, reason.stack);
    void writeCrashReport();
  });
}

export function buildDebugReport(world: WorldState | null, version: string, commit: string | null): string {
  const store = activeWorldStore();
  const lines: string[] = [];
  lines.push('ADA Hood Simulator — debug report');
  lines.push(`Version: ${version}`);
  lines.push(`Era: ${world?.options.era ?? ACTIVE_ERA} (2032 content ${ERA_2032_ENABLED ? 'on' : 'off'})`);
  lines.push(`Built: ${new Date().toISOString()}`);
  lines.push(`Latest commit on main: ${commit ?? 'unavailable'}`);
  lines.push(`Storage: ${store ? `${store.kind} — ${store.label}` : 'not chosen'}`);
  lines.push('');
  lines.push('Device');
  if (typeof navigator !== 'undefined') {
    lines.push(`User agent: ${navigator.userAgent}`);
    lines.push(`Language: ${navigator.language}`);
    lines.push(`Touch points: ${navigator.maxTouchPoints}`);
    lines.push(`Hardware concurrency: ${navigator.hardwareConcurrency ?? 'unknown'}`);
  }
  if (typeof screen !== 'undefined') {
    lines.push(`Screen: ${screen.width}×${screen.height} @${window.devicePixelRatio}`);
    lines.push(`Viewport: ${window.innerWidth}×${window.innerHeight}`);
  }
  lines.push('');
  lines.push(`Graphics: ${resolvedGraphics(readLocalData().graphics)} (choice ${readLocalData().graphics})`);
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
  if (heap) lines.push(`JS heap: ${Math.round(heap.usedJSHeapSize / 1048576)} / ${Math.round(heap.totalJSHeapSize / 1048576)} MB (counts garbage the browser has not collected yet)`);
  if (weekHeaps.length) {
    lines.push('Heap after each week (used / reserved)');
    for (const entry of weekHeaps) {
      lines.push(`Week ${entry.week}: ${Math.round(entry.used / 1048576)}/${Math.round(entry.total / 1048576)} MB`);
    }
  }
  if (typeof navigator !== 'undefined') {
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (deviceMemory) lines.push(`Device memory: ${deviceMemory} GB`);
  }
  lines.push('');
  lines.push('Music');
  for (const line of musicStatusLines()) lines.push(line);
  lines.push('');
  lines.push('Timings (ms)');
  if (!timings.length) lines.push('(none)');
  for (const timing of timings) lines.push(`${timing.label}: ${timing.ms}`);
  lines.push('');
  lines.push('Sim systems (ms, last week)');
  const systems = systemTimings();
  if (!systems.length) lines.push('(none)');
  for (const system of systems) lines.push(`${system.name}: ${system.ms} (${system.calls} calls)`);
  lines.push('');
  lines.push('Slowest assets (ms)');
  const assets = slowestAssets();
  if (!assets.length) lines.push('(none)');
  for (const asset of assets) lines.push(`${asset.ms} ${asset.ok ? 'ok' : 'failed'} ${asset.file}`);
  lines.push('');
  lines.push('What you wished would happen');
  lines.push(wish || '(not answered)');
  lines.push('');
  lines.push('Last 20 actions');
  const actions = recentActions();
  if (!actions.length) lines.push('(none)');
  for (const action of actions) lines.push(`${action.at} ${action.kind}: ${action.detail}`);
  lines.push('');
  if (!world) {
    lines.push('No city is open.');
  } else {
    const player = Object.values(world.gangs).find((gang) => gang.isPlayer);
    lines.push('World');
    lines.push(`Seed: ${world.options.seed}`);
    lines.push(`Map: ${world.gridW}×${world.gridH}`);
    lines.push(`Week: ${world.week}  minute: ${world.minute}  phase: ${world.phase}`);
    lines.push(`Schema: ${world.schemaVersion ?? 'missing'}`);
    lines.push(`RNG state: ${world.rngState}`);
    if (player) {
      const boss = world.people[player.bossId];
      lines.push(`Boss: ${boss?.name ?? 'unknown'}  status: ${boss?.status ?? 'missing'}`);
      lines.push(`Cash: ${money(player.cash)}  men: ${gangManpower(world, player)}  blocks: ${territoryCount(world, player.id)}  loyalty: ${Math.round(player.history.at(-1)?.loyalty ?? 0)}`);
    }
    lines.push('Gangs:');
    for (const gang of Object.values(world.gangs)) {
      lines.push(`- ${gang.name}${gang.isPlayer ? ' (player)' : ''} ${gang.eliminated ? 'eliminated' : gang.personality} cash ${Math.round(gang.cash)}`);
    }
    lines.push('');
    lines.push('Seed fallback');
    const notes = world.cityLayout?.original?.notes ?? [];
    if (!notes.length) lines.push('none recorded');
    for (const note of notes) lines.push(note);
    lines.push('');
    lines.push('Outcome');
    lines.push(world.outcome ? `${world.outcome.won ? 'won' : 'lost'}: ${world.outcome.reason} (score ${world.outcome.score})` : 'still playing');
    lines.push('');
    lines.push('Men lost (this session, player gang)');
    const lossGang = Object.values(world.gangs).find((g) => g.isPlayer);
    const lost = lossGang ? memberLosses(world, lossGang.id) : [];
    if (!lost.length) lines.push('(none recorded)');
    for (const l of lost) lines.push(`Week ${l.week}: ${formatMemberLoss(l)}`);
    lines.push('');
    lines.push('Recent week log');
    const log = world.weekLog;
    if (!log.length) lines.push('(empty)');
    for (const line of log) lines.push(line);
    lines.push('');
    lines.push('Recent messages');
    const messages = world.messages;
    if (!messages.length) lines.push('(none)');
    for (const message of messages) lines.push(`${message.minute} ${message.category}: ${message.text}`);
  }
  lines.push('');
  lines.push('Auto test');
  if (autoTestSession.kind === 'running') {
    lines.push(autoTestSession.settings);
    lines.push(autoTestSession.weeks);
    lines.push('This session: running. The result is recorded when it finishes.');
  } else if (autoTestSession.kind === 'done' || lastAutoTest) {
    const note = autoTestSession.kind === 'done' ? autoTestSession.note : lastAutoTest!;
    lines.push(note.settings);
    lines.push(note.weeks);
    lines.push(`Final: cash ${note.cash} men ${note.men} blocks ${note.territory} score ${note.score}`);
    lines.push(note.diary);
    lines.push(`Report file: 09 Reports/${note.file}`);
  } else if (autoplay.length) {
    for (const line of autoplay) lines.push(line);
  } else lines.push('(none this session)');
  lines.push('');
  lines.push('Errors');
  if (!errors.length) lines.push('(none)');
  for (const error of errors) lines.push(error);
  lines.push('');
  // 1.2.21: the developer's full view, week by week (no size cap).
  const journal = devJournalWeeks();
  lines.push(`Developer journal (${journal.length} week${journal.length === 1 ? '' : 's'} this session)`);
  if (!journal.length) lines.push('(no week played this session)');
  for (const week of journal) lines.push(week);
  return lines.join('\n');
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function writeDebugReport(world: WorldState | null, version: string): Promise<string> {
  const { latestCommit } = await import('./versionCheck');
  const commit = await latestCommit();
  const text = buildDebugReport(world, version, commit);
  const base = `report-${stamp()}`;
  // Large reports are split into part files; nothing is cut.
  const parts = splitReport(text);
  for (let i = 0; i < parts.length; i++) {
    const name = parts.length === 1 ? `${base}.txt` : `${base}-part${i + 1}of${parts.length}.txt`;
    await saveReport(instanceFile(name), parts[i], true);
  }
  return text;
}

async function writeCrashReport(): Promise<void> {
  const text = buildDebugReport(worldSource(), typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown', null);
  await saveReport(instanceFile(`crash-${stamp()}.txt`), text, false);
}

export async function writeReportFile(filename: string, text: string): Promise<void> {
  await saveReport(filename, text, true);
}

async function saveReport(filename: string, text: string, alwaysDownload: boolean): Promise<void> {
  const store = activeWorldStore();
  let wrote = false;
  if (store) {
    try {
      await store.writeReport(filename, text);
      wrote = true;
    } catch (error) {
      noteError(error instanceof Error ? error.message : 'The report could not be written.');
    }
  }
  if (alwaysDownload || !wrote) downloadText(filename, text);
}
