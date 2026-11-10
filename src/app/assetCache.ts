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
let remembered = 0;
const PHONE_CAP = 48 * 1024 * 1024;

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
  return resolvedGraphics() !== 'phone' || remembered + bytes <= PHONE_CAP;
}

/** Turn stored bytes into blob URLs. Missing files stay on the network. */
export async function preloadAssets(which: 'all' | 'menu' | 'street'): Promise<void> {
  const manifest = await loadAssetManifest();
  const store = activeWorldStore();
  if (!manifest || !store?.readBytes) return;
  const tier = resolvedGraphics();
  const prefixes = which === 'menu' ? MENU_PREFIXES : which === 'street' ? STREET_PREFIXES : null;
  for (const file of manifest.files) {
    if (file.tier !== 'shared' && file.tier !== tier) continue;
    if (prefixes && !prefixes.some((prefix) => file.path.startsWith(prefix))) continue;
    if (cache.has(file.path) || !fits(file.bytes)) continue;
    const bytes = await store.readBytes(`assets/${file.path}`);
    if (!bytes) continue;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    cache.set(file.path, URL.createObjectURL(new Blob([copy])));
    remembered += file.bytes;
  }
}
