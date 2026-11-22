// The feedback report (D-007): a bounded log of what the player did and
// what the page saw, downloaded as JSON from the Feedback box, the F9 key
// or the crash notice.

const START = performance.now();
const MAX_LOG = 500;
export const ms = () => Math.round(performance.now() - START);

interface Entry { t_ms: number; [k: string]: unknown }
const actions: Entry[] = [], events: Entry[] = [], errors: Entry[] = [];
let actionsDropped = 0, eventsDropped = 0;

export function logAction(action: string, detail?: unknown) {
  if (actions.length >= MAX_LOG) { actions.shift(); actionsDropped++; }
  actions.push({ t_ms: ms(), action, ...(detail === undefined ? {} : { detail }) });
}
export function logEvent(event: string, detail?: unknown) {
  if (events.length >= MAX_LOG) { events.shift(); eventsDropped++; }
  events.push({ t_ms: ms(), event, ...(detail === undefined ? {} : { detail }) });
}
export function logError(kind: string, message: string, extra: Record<string, unknown> = {}) {
  if (errors.length >= MAX_LOG) errors.shift();
  errors.push({ t_ms: ms(), kind, message, ...extra });
}

window.addEventListener('error', e => logError('javascript', String(e.message), { file: e.filename, line: e.lineno }));
window.addEventListener('unhandledrejection', e => logError('javascript', String(e.reason)));

export interface ReportContext {
  stamp: string; lang: string; sound: boolean; reducedMotion: boolean;
  seeds: { city: number; auto: number } | null; stateHash: string | null; custom: Record<string, unknown>;
}

export function downloadReport(kind: 'manual' | 'crash', expected: string | null, ctx: ReportContext) {
  const report = {
    schema: 'poncelet-report', schema_version: 1, kind, stamp: ctx.stamp, created: new Date().toISOString(),
    seeds: ctx.seeds, test_key: null, expected, state_hash: ctx.stateHash,
    action_log: actions, actions_dropped: actionsDropped, events, events_dropped: eventsDropped, errors,
    environment: {
      user_agent: navigator.userAgent, browser_language: navigator.language, page_language: ctx.lang,
      viewport: [innerWidth, innerHeight], device_pixel_ratio: devicePixelRatio,
      reduced_motion: ctx.reducedMotion, sound: ctx.sound ? 'on' : 'off', url: location.href,
    },
    custom: ctx.custom,
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  a.download = `hood-report-${ctx.stamp.split(' ')[1] ?? 'dev'}-${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  logAction('report_downloaded', kind);
}

// A soft confirmation tone; nothing plays while the sound switch is off.
let audio: AudioContext | null = null;
export function chime(on: boolean, pitch = 523.25) {
  if (!on) return;
  audio ??= new AudioContext();
  const osc = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
  osc.type = 'sine'; osc.frequency.value = pitch;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  osc.connect(gain).connect(audio.destination);
  osc.start(now); osc.stop(now + 0.35);
}

export function stored(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
export function store(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}
