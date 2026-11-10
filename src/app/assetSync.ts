/**
 * First start copies this device's artwork into the world folder. A later
 * start copies only files whose hash changed.
 */
import { assetMemoryBytes, loadAssetManifest, preloadAssets, type AssetFile } from './assetCache';
import { resolvedGraphics } from './device';
import { activeWorldStore } from './worldFolder';

export interface AssetProgress {
  done: number;
  total: number;
  label: string;
}

const SAVED = 'assets/manifest.json';

export async function syncWorldAssets(onProgress: (progress: AssetProgress) => void): Promise<void> {
  const store = activeWorldStore();
  const manifest = await loadAssetManifest();
  if (!store?.writeBytes || !manifest) return;
  const tier = resolvedGraphics();
  const files = manifest.files.filter((file) => file.tier === 'shared' || file.tier === tier);
  let saved: Record<string, string> = {};
  try {
    const text = await store.read(SAVED);
    if (text) saved = (JSON.parse(text) as { files?: Record<string, string> }).files ?? {};
  } catch { /* a bad manifest is rewritten below */ }
  let done = 0;
  for (const file of files) {
    done += 1;
    onProgress({ done, total: files.length, label: file.path });
    if (saved[file.path] === file.sha256) continue;
    const response = await fetch(`${import.meta.env.BASE_URL}${file.path}`);
    if (!response.ok) continue;
    await store.writeBytes(`assets/${file.path}`, new Uint8Array(await response.arrayBuffer()));
    saved[file.path] = file.sha256;
  }
  await store.write(SAVED, JSON.stringify({ tier, files: saved }));
  await preloadAssets(tier === 'phone' ? 'menu' : 'all');
}

export function filesForTier(files: AssetFile[], tier: 'phone' | 'desktop'): AssetFile[] {
  return files.filter((file) => file.tier === 'shared' || file.tier === tier);
}

export { assetMemoryBytes };
