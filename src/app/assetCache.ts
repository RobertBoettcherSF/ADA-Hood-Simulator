/**
 * Files copied into the world folder, then shown from memory.
 * Desktop holds the whole tier before the menu. A phone holds only the
 * screens it is about to show, and stops at the cap.
 */
import { activeWorldStore } from './worldFolder';
import { resolvedGraphics } from './device';
import { registerProbe } from '../sim/memProbe';

export interface AssetFile {
  path: string;
  sha256: string;
  bytes: number;
  tier: 'shared' | 'phone' | 'desktop';
}

interface Manifest {
  version: number;
  files: AssetFile[];
}

/** In-flight network picture loads. Githack drops a page that asks for dozens at once. */
export const ASSET_LOAD_CONCURRENCY = 6;
/** Prefer a cached copy when the URL is unchanged. */
export const ASSET_FETCH_CACHE: RequestCache = 'force-cache';

let assetLoadsActive = 0;
const assetLoadWait: Array<() => void> = [];

/** Run a fetch or image load when a slot is free, in the order they were queued. */
export function enqueueAssetLoad<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      assetLoadsActive += 1;
      work().then(resolve, reject).finally(() => {
        assetLoadsActive -= 1;
        const next = assetLoadWait.shift();
        if (next) next();
      });
    };
    if (assetLoadsActive < ASSET_LOAD_CONCURRENCY) start();
    else assetLoadWait.push(start);
  });
}

/** How many loads are running or waiting. Tests use this. */
export function assetLoadBacklog(): { active: number; waiting: number } {
  return { active: assetLoadsActive, waiting: assetLoadWait.length };
}

export function fetchAsset(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { cache: ASSET_FETCH_CACHE, ...init });
}

const cache = new Map<string, string>();
const lru: { path: string; bytes: number }[] = [];
let remembered = 0;
registerProbe('assetCache', () => ({ urls: cache.size, lru: lru.length, rememberedMB: Math.round(remembered / 1048576) })); // 1.2.28
/** In-memory pictures on a phone. Oldest leave first. Nothing here is written to storage. */
const PHONE_LAZY_CAP = 24 * 1024 * 1024;

const MENU_PREFIXES = ['art/brand/', 'art/portraits/', 'art/press/', 'art/icons/', 'art/icons-small/', 'art/endings/'];
const STREET_PREFIXES = ['art/city/'];

let manifestPromise: Promise<Manifest | null> | null = null;

export function loadAssetManifest(): Promise<Manifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetchAsset(`${import.meta.env.BASE_URL}asset-manifest.json`)
      .then((response) => response.ok ? response.json() as Promise<Manifest> : null)
      .catch(() => null);
  }
  return manifestPromise;
}

/** A stable URL: no cache-busting query string, so the browser can reuse the file. */
export function assetUrl(path: string): string {
  return cache.get(path) ?? `${import.meta.env.BASE_URL}${path}`;
}

export function assetMemoryBytes(): number {
  return remembered;
}

function fits(bytes: number): boolean {
  return resolvedGraphics() !== 'phone' || remembered + bytes <= PHONE_LAZY_CAP;
}

/** A picture that was just decoded. On a phone, drop the oldest until the cap fits. */
export function noteLazyImage(src: string, width: number, height: number): void {
  if (resolvedGraphics() !== 'phone') return;
  const bytes = Math.max(48_000, Math.max(1, width) * Math.max(1, height) * 4);
  const path = src;
  if (lru.some((entry) => entry.path === path)) return;
  lru.push({ path, bytes });
  remembered += bytes;
  while (remembered > PHONE_LAZY_CAP && lru.length > 1) {
    const oldest = lru.shift();
    if (!oldest) break;
    remembered -= oldest.bytes;
    const url = cache.get(oldest.path);
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    cache.delete(oldest.path);
  }
}

/** Turn stored bytes into blob URLs. Missing files stay on the network. Phones only warm the phone-tier models. */
export async function preloadAssets(which: 'all' | 'menu' | 'street'): Promise<void> {
  const manifest = await loadAssetManifest();
  const store = activeWorldStore();
  if (!manifest || !store?.readBytes) return;
  const tier = resolvedGraphics();
  const prefixes = which === 'menu' ? MENU_PREFIXES : which === 'street' ? STREET_PREFIXES : null;
  for (const file of manifest.files) {
    if (tier === 'phone' ? file.tier !== 'phone' : file.tier !== 'desktop' && file.tier !== 'shared') continue;
    if (prefixes && !prefixes.some((prefix) => file.path.startsWith(prefix))) continue;
    if (cache.has(file.path) || !fits(file.bytes)) continue;
    const bytes = await store.readBytes(`assets/${file.path}`);
    if (!bytes) continue;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    cache.set(file.path, URL.createObjectURL(new Blob([copy])));
    remembered += file.bytes;
    lru.push({ path: file.path, bytes: file.bytes });
  }
}
