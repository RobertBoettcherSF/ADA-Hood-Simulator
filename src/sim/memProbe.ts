/**
 * 1.2.28: memory probe. Counts what lives outside the world state, so a
 * long Auto Test can show which of it grows. No imports, so the sim, the
 * app, the UI and the renderer can all register here, in the browser or
 * in Node. Probes only count; they keep no strong reference to what they
 * count beyond what the module already keeps.
 */

type ProbeValue = number | string | Record<string, number | string>;
const probes = new Map<string, () => ProbeValue>();

/** Register a named probe. A later registration under the same name replaces it. */
export function registerProbe(name: string, read: () => ProbeValue): void {
  probes.set(name, read);
}

// ---- object lifetimes: created, disposed (if the owner says so), collected.
interface Lifetime { created: number; disposed: number; collected: number }
const lifetimes = new Map<string, Lifetime>();
const collected = typeof FinalizationRegistry === 'function'
  ? new FinalizationRegistry<string>((kind) => { const l = lifetimes.get(kind); if (l) l.collected++; })
  : null;

/** Count an object of this kind; it is counted again when the garbage collector frees it. */
export function trackLifetime(kind: string, object: object): void {
  const l = lifetimes.get(kind) ?? { created: 0, disposed: 0, collected: 0 };
  lifetimes.set(kind, l);
  l.created++;
  collected?.register(object, kind);
}

/** The owner says an object of this kind was disposed. */
export function noteDisposed(kind: string): void {
  const l = lifetimes.get(kind);
  if (l) l.disposed++;
}

// ---- timers, animation frames, event listeners, object URLs.
const counts = { timeoutsPending: 0, timeoutsMade: 0, intervalsActive: 0, intervalsMade: 0, framesPending: 0, objectUrls: 0, objectUrlsMade: 0 };
const listenerTypes = new Map<string, number>();
let installed = false;

/** Wrap the global timer, frame, listener and object-URL functions so they can be counted. Once only. */
export function installMemoryProbe(): void {
  if (installed) return;
  installed = true;
  const g = globalThis as typeof globalThis & Record<string, unknown>;
  try {
    const setT = g.setTimeout.bind(g), clearT = g.clearTimeout.bind(g);
    const live = new Set<unknown>();
    g.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
      counts.timeoutsMade++;
      const id: unknown = setT((...a: unknown[]) => { if (live.delete(id)) counts.timeoutsPending = live.size; if (typeof fn === 'function') fn(...a); }, ms, ...args);
      live.add(id); counts.timeoutsPending = live.size;
      return id;
    }) as typeof setTimeout;
    g.clearTimeout = ((id: unknown) => { if (live.delete(id)) counts.timeoutsPending = live.size; clearT(id as Parameters<typeof clearTimeout>[0]); }) as typeof clearTimeout;
    const setI = g.setInterval.bind(g), clearI = g.clearInterval.bind(g);
    const intervals = new Set<unknown>();
    g.setInterval = ((fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
      counts.intervalsMade++;
      const id: unknown = setI(fn, ms, ...args);
      intervals.add(id); counts.intervalsActive = intervals.size;
      return id;
    }) as typeof setInterval;
    g.clearInterval = ((id: unknown) => { if (intervals.delete(id)) counts.intervalsActive = intervals.size; clearI(id as Parameters<typeof clearInterval>[0]); }) as typeof clearInterval;
  } catch { /* timers stay uncounted */ }
  try {
    if (typeof g.requestAnimationFrame === 'function') {
      const raf = (g.requestAnimationFrame as typeof requestAnimationFrame).bind(g);
      const caf = (g.cancelAnimationFrame as typeof cancelAnimationFrame).bind(g);
      const frames = new Set<number>();
      g.requestAnimationFrame = ((fn: FrameRequestCallback) => {
        const id = raf((t) => { frames.delete(id); counts.framesPending = frames.size; fn(t); });
        frames.add(id); counts.framesPending = frames.size;
        return id;
      }) as typeof requestAnimationFrame;
      g.cancelAnimationFrame = ((id: number) => { frames.delete(id); counts.framesPending = frames.size; caf(id); }) as typeof cancelAnimationFrame;
    }
  } catch { /* frames stay uncounted */ }
  try {
    if (typeof EventTarget === 'function') {
      const proto = EventTarget.prototype;
      const add = proto.addEventListener, remove = proto.removeEventListener;
      proto.addEventListener = function (this: EventTarget, type: string, ...rest: unknown[]) {
        listenerTypes.set(type, (listenerTypes.get(type) ?? 0) + 1);
        return (add as (...a: unknown[]) => void).call(this, type, ...rest);
      } as typeof add;
      proto.removeEventListener = function (this: EventTarget, type: string, ...rest: unknown[]) {
        listenerTypes.set(type, (listenerTypes.get(type) ?? 0) - 1);
        return (remove as (...a: unknown[]) => void).call(this, type, ...rest);
      } as typeof remove;
    }
  } catch { /* listeners stay uncounted */ }
  try {
    if (typeof URL === 'function' && typeof URL.createObjectURL === 'function') {
      const make = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = ((o: Blob | MediaSource) => { counts.objectUrls++; counts.objectUrlsMade++; return make(o); }) as typeof URL.createObjectURL;
      URL.revokeObjectURL = ((u: string) => { counts.objectUrls--; revoke(u); }) as typeof URL.revokeObjectURL;
    }
  } catch { /* object URLs stay uncounted */ }
}

const mb = (n: number) => `${Math.round(n / 1048576)}MB`;
function format(v: ProbeValue): string {
  if (typeof v !== 'object') return String(v);
  return Object.entries(v).map(([k, x]) => `${k} ${x}`).join(', ');
}

/** One line with every count, for the Auto Test report and the Node memory run. */
export function memProbeLine(extra: Record<string, number | string> = {}): string {
  const parts: string[] = [];
  const perf = (globalThis.performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } } | undefined)?.memory;
  if (perf) parts.push(`heap ${mb(perf.usedJSHeapSize)}/${mb(perf.totalJSHeapSize)} of ${mb(perf.jsHeapSizeLimit)}`);
  const proc = (globalThis as { process?: { memoryUsage?: () => { rss: number; heapUsed: number; heapTotal: number; external: number; arrayBuffers: number } } }).process;
  if (proc?.memoryUsage) { const m = proc.memoryUsage(); parts.push(`node rss ${mb(m.rss)} heap ${mb(m.heapUsed)}/${mb(m.heapTotal)} external ${mb(m.external)} arrayBuffers ${mb(m.arrayBuffers)}`); }
  if (Object.keys(extra).length) parts.push(`run: ${format(extra)}`);
  if (lifetimes.size) parts.push(`objects: ${[...lifetimes].map(([k, l]) => `${k} made ${l.created} disposed ${l.disposed} collected ${l.collected} (alive ≤ ${l.created - l.collected})`).join('; ')}`);
  if (installed) {
    const listeners = [...listenerTypes].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    parts.push(`timers: timeouts pending ${counts.timeoutsPending} (made ${counts.timeoutsMade}), intervals ${counts.intervalsActive} (made ${counts.intervalsMade}), frames pending ${counts.framesPending}, object URLs ${counts.objectUrls} (made ${counts.objectUrlsMade})`);
    parts.push(`listeners: ${listeners.reduce((s, [, n]) => s + n, 0)} net${listeners.length ? ` (${listeners.slice(0, 8).map(([t, n]) => `${t} ${n}`).join(', ')})` : ''}`);
  }
  if (typeof document !== 'undefined') {
    parts.push(`dom: nodes ${document.getElementsByTagName('*').length}, canvases ${document.getElementsByTagName('canvas').length}, images ${document.images.length}`);
  }
  for (const [name, read] of probes) {
    let value: string;
    try { value = format(read()); } catch (error) { value = `error ${error instanceof Error ? error.message : String(error)}`; }
    parts.push(`${name}: ${value}`);
  }
  return `MEMPROBE ${parts.join(' | ')}`;
}
