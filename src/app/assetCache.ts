/**
 * Files copied into the world folder, then shown from memory.
 * Desktop holds the whole tier before the menu. A phone holds only the
 * screens it is about to show, and stops at the cap.
 */
import { activeWorldStore } from './worldFolder';
import { resolvedGraphics } from './device';

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

const cache = new Map<string, string>();
const lru: { path: string; bytes: number }[] = [];
let remembered = 0;
/** In-memory pictures on a phone. Oldest leave first. Nothing here is written to storage. */
const PHONE_LAZY_CAP = 24 * 1024 * 1024;

const MENU_PREFIXES = ['art/brand/', 'art/portraits/', 'art/press/', 'art/icons/', 'art/icons-small/', 'art/endings/'];
const STREET_PREFIXES = ['art/city/'];

let manifestPromise: Promise<Manifest | null> | null = null;

export function loadAssetManifest(): Promise<Manifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${import.meta.env.BASE_URL}asset-manifest.json`)
      .then((response) => response.ok ? response.json() as Promise<Manifest> : null)
      .catch(() => null);
  }
  return manifestPromise;
}

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
