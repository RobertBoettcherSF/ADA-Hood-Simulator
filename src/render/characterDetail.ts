import type { OrthographicCamera } from 'three';

/** Default capacity for small model galleries; the city supplies its actor limit. */
export const MAX_DETAILED_CHARACTERS = 96;
export const MAX_SPARE_CHARACTERS = 96;
const MIN_CHARACTER_PIXELS = 8;
/**
 * Fully animated (skinned) figures in the city at once. Each costs its own
 * animation mixer and skeleton every frame: a busy afternoon street put 40+
 * of them in view and held the game near 40 fps where simple figures alone
 * held 60. The most important (burning, watched, fighting, the player's own
 * men, officials) and then the nearest get them; the rest are simple figures.
 */
/** A frame this slow, this many times in a row, puts every walker on the simple
 * figure together. A run of quick frames brings the detailed models back. */
const SLOW_FRAME_MS = 48;
const FAST_FRAME_MS = 28;
const SLOW_FRAMES = 15;
const FAST_FRAMES = 120;

let simple = false;
let slowRun = 0;
let fastRun = 0;
const figureWatchers = new Set<() => void>();

/** True while the whole street is on the simple figures. */
export function simpleFigures(): boolean {
  return simple;
}

export function watchSimpleFigures(listener: () => void): () => void {
  figureWatchers.add(listener);
  return () => { figureWatchers.delete(listener); };
}

function setSimpleFigures(next: boolean): void {
  if (next === simple) return;
  simple = next;
  slowRun = 0;
  fastRun = 0;
  for (const listener of figureWatchers) listener();
}

/** One drawn street frame. The choice is global: nobody is detailed while
 * anyone else on the same street is a simple figure. */
export function noteStreetFrame(ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  if (!simple) {
    slowRun = ms > SLOW_FRAME_MS ? slowRun + 1 : 0;
    if (slowRun >= SLOW_FRAMES) setSimpleFigures(true);
  } else {
    fastRun = ms < FAST_FRAME_MS ? fastRun + 1 : 0;
    if (fastRun >= FAST_FRAMES) setSimpleFigures(false);
  }
}

/** Test hook. */
export function resetSimpleFigures(): void {
  simple = false;
  slowRun = 0;
  fastRun = 0;
}

/** Screen size, not a fixed zoom: the same zoom covers different pixel heights
 * in the main city and the independent tagged viewport. */
export function characterPixelHeight(camera: OrthographicCamera, viewportHeight: number): number {
  return Math.abs(camera.projectionMatrix.elements[5] * camera.matrixWorldInverse.elements[5]) * 1.8 * viewportHeight / 2;
}

export function characterInView(projected: { x: number; y: number; z: number }): boolean {
  return Math.abs(projected.x) <= 1.08 && Math.abs(projected.y) <= 1.12 && Math.abs(projected.z) <= 1;
}

export function characterNeedsDetail(pixels: number, focused = false): boolean {
  // Keep selected people recognizable even in a distant overview. Ordinary
  // people only switch to simplified figures when their bodies are tiny.
  return focused || pixels >= MIN_CHARACTER_PIXELS;
}
