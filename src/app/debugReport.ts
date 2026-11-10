import { ERA_2032_ENABLED, ACTIVE_ERA } from './era';
import { activeWorldStore, downloadText } from './worldFolder';
import { recentActions } from './actionLog';
import { slowestAssets } from './assetTiming';
import { resolvedGraphics } from './device';
import { readLocalData } from './localData';
import { systemTimings } from '../sim/simTimings';
import type { WorldState } from '../sim/types';
import { gangManpower, money, territoryCount } from '../sim/world';

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
  if (heap) lines.push(`JS heap: ${Math.round(heap.usedJSHeapSize / 1048576)} / ${Math.round(heap.totalJSHeapSize / 1048576)} MB`);
  if (typeof navigator !== 'undefined') {
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (deviceMemory) lines.push(`Device memory: ${deviceMemory} GB`);
  }
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
    lines.push('Recent week log');
    const log = world.weekLog.slice(-40);
    if (!log.length) lines.push('(empty)');
    for (const line of log) lines.push(line);
    lines.push('');
    lines.push('Recent messages');
    const messages = world.messages.slice(-20);
    if (!messages.length) lines.push('(none)');
    for (const message of messages) lines.push(`${message.minute} ${message.category}: ${message.text}`);
  }
  lines.push('');
  lines.push('Autoplay');
  if (!autoplay.length) lines.push('(none this session)');
  for (const line of autoplay) lines.push(line);
  lines.push('');
  lines.push('Errors');
  if (!errors.length) lines.push('(none)');
  for (const error of errors) lines.push(error);
  lines.push('');
  return lines.join('\n');
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function writeDebugReport(world: WorldState | null, version: string): Promise<string> {
  const { latestCommit } = await import('./versionCheck');
  const commit = await latestCommit();
  const text = buildDebugReport(world, version, commit);
  const filename = `report-${stamp()}.txt`;
  await saveReport(filename, text, true);
  return text;
}

async function writeCrashReport(): Promise<void> {
  const text = buildDebugReport(worldSource(), typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown', null);
  await saveReport(`crash-${stamp()}.txt`, text, false);
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
