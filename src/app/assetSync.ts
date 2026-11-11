/**
 * A background copy of the files this device actually keeps.
 * Phones keep only the phone-tier models. Portraits and the rest of the
 * pictures stay on the network and are fetched when first shown.
 * The game never waits for this copy.
 */
import { loadAssetManifest, type AssetFile } from './assetCache';
import { deviceIsPhone, resolvedGraphics } from './device';
import { activeWorldStore } from './worldFolder';

export interface AssetProgress {
  done: number;
  total: number;
  label: string;
}

const SAVED = 'assets/manifest.json';
/** Leave this much free after a copy, so the city save still fits. */
const RESERVE = 32 * 1024 * 1024;

export function persistentFiles(files: AssetFile[], tier: 'phone' | 'desktop'): AssetFile[] {
  if (tier === 'phone') return files.filter((file) => file.tier === 'phone');
  return files.filter((file) => file.tier === 'desktop' || file.tier === 'shared');
}

export function persistentBytes(files: AssetFile[], tier: 'phone' | 'desktop'): number {
  return persistentFiles(files, tier).reduce((sum, file) => sum + file.bytes, 0);
}

async function roomFor(bytes: number): Promise<boolean> {
  const estimate = navigator.storage?.estimate?.bind(navigator.storage);
  if (!estimate) return storageTier() !== 'phone';
  try {
    const { quota, usage } = await estimate();
    if (quota == null) return storageTier() !== 'phone';
    const used = usage ?? 0;
    return quota - used > bytes + RESERVE && used / quota < 0.85;
  } catch {
    return storageTier() !== 'phone';
  }
}

/** What this device is allowed to keep. A phone never stores desktop models, even if the graphics choice says desktop. */
export function storageTier(): 'phone' | 'desktop' {
  if (deviceIsPhone() || resolvedGraphics() === 'phone') return 'phone';
  return 'desktop';
}

function isQuotaError(error: unknown): boolean {
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) return true;
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name: unknown }).name) : '';
  return name === 'QuotaExceededError';
}

/** Copy what this device keeps. Resolves when the attempt finishes; callers must not await it before play. */
export async function syncWorldAssets(onProgress?: (progress: AssetProgress) => void, onNotice?: (text: string) => void): Promise<void> {
  const store = activeWorldStore();
  const manifest = await loadAssetManifest();
  if (!store?.writeBytes || !manifest) return;
  const tier = storageTier();
  const files = persistentFiles(manifest.files, tier);
  let saved: Record<string, string> = {};
  try {
    const text = await store.read(SAVED);
    if (text) saved = (JSON.parse(text) as { files?: Record<string, string> }).files ?? {};
  } catch { /* rewritten below */ }
  const pending = files.filter((file) => saved[file.path] !== file.sha256);
  const pendingBytes = pending.reduce((sum, file) => sum + file.bytes, 0);
  if (pending.length && !(await roomFor(pendingBytes))) {
    onNotice?.('Artwork stays on the network. This device does not have room for a local copy.');
    return;
  }
  const written: string[] = [];
  let done = 0;
  let current: string | null = null;
  try {
    for (const file of files) {
      done += 1;
      onProgress?.({ done, total: files.length, label: file.path });
      if (saved[file.path] === file.sha256) continue;
      if (!(await roomFor(file.bytes))) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      const response = await fetch(`${import.meta.env.BASE_URL}${file.path}`, { cache: 'no-store' });
      if (!response.ok) continue;
      const body = new Uint8Array(await response.arrayBuffer());
      current = `assets/${file.path}`;
      await store.writeBytes(current, body);
      written.push(current);
      current = null;
      saved[file.path] = file.sha256;
    }
    await store.write(SAVED, JSON.stringify({ tier, files: saved }));
  } catch (error) {
    if (current) await store.remove(current).catch(() => {});
    for (const name of written) await store.remove(name).catch(() => {});
    for (const name of written) delete saved[name.slice('assets/'.length)];
    if (current) delete saved[current.slice('assets/'.length)];
    await store.write(SAVED, JSON.stringify({ tier, files: saved })).catch(() => {});
    if (isQuotaError(error)) onNotice?.('Artwork stays on the network. Copying stopped because storage is full.');
    else onNotice?.('Artwork stays on the network. The local copy could not be finished.');
  }
}
