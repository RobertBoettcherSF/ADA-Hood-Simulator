/**
 * Interface scale, kept in the world folder. The page uses CSS zoom so menus
 * and text grow together. A window that is already small is not enlarged past
 * the room the layout was drawn for.
 */
import { patchLocalData, readLocalData } from './localData';

export const UI_SCALES = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

const MIN_WIDTH = 1024, MIN_HEIGHT = 640;

export const uiScaleAvailable = (): boolean => typeof document !== 'undefined';

export function readUiScale(): number {
  return readLocalData().uiScale;
}

export function writeUiScale(scale: number): void {
  if (!(UI_SCALES as readonly number[]).includes(scale)) return;
  patchLocalData({ uiScale: scale });
}

export function fittedUiScale(scale: number, width: number, height: number): number {
  if (scale <= 1) return scale;
  const room = Math.floor(Math.min(width / MIN_WIDTH, height / MIN_HEIGHT) * 20) / 20;
  return Math.max(1, Math.min(scale, room));
}

export const uiScaleInUse = (): number => {
  if (typeof document === 'undefined') return 1;
  const zoom = Number(document.documentElement.style.zoom);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
};

export function applyUiScale(scale: number): number {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 1;
  const used = fittedUiScale(scale, window.innerWidth || MIN_WIDTH, window.innerHeight || MIN_HEIGHT);
  document.documentElement.style.zoom = String(used);
  return used;
}

export function installUiScale(current: () => number = readUiScale): void {
  if (typeof window === 'undefined') return;
  applyUiScale(current());
  window.addEventListener('resize', () => applyUiScale(current()));
}
