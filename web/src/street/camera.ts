// The street camera: an orthographic view from a fixed height angle,
// looking across a block diagonal. Pure numbers, so it can be tested
// without a browser.
//
// Viewing direction (s, sqrt 2 * tan 30 deg, s), normalised (s = -1 when
// turned); 900 m from the target. The visible height is 240 / zoom metres,
// zoom 0.55 .. 11, 1.5 at the start. Dragging moves the ground with the
// pointer: across the screen one pixel is viewHeight / pixelHeight metres,
// up the screen that divided by the sine of the elevation (the ground is
// seen foreshortened). The target stays far enough inside the city that
// the view's half-diagonal reach does not run past its edge.

export const ZOOM_MIN = 0.55;
export const ZOOM_MAX = 11;
export const ZOOM_START = 1.5;
export const DISTANCE = 900;
export const VIEW_AT_ZOOM_1 = 240;

const RISE = Math.SQRT2 * Math.tan(Math.PI / 6);
const LENGTH = Math.hypot(1, RISE, 1);
export const SIN_ELEVATION = RISE / LENGTH;

export interface CameraState { x: number; z: number; zoom: number; turned: boolean }

export function viewHeight(zoom: number) { return VIEW_AT_ZOOM_1 / zoom; }

/** Unit vector from the target towards the camera, as [x, y, z]. */
export function towardsCamera(turned: boolean): [number, number, number] {
  const s = turned ? -1 : 1;
  return [s / LENGTH, RISE / LENGTH, s / LENGTH];
}

export function clampZoom(zoom: number) { return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)); }

/** Keeps the target inside the city (width and depth in metres). */
export function clampTarget(c: CameraState, aspect: number, width: number, depth: number): CameraState {
  const h = viewHeight(c.zoom), w = h * aspect;
  const reach = (h * Math.SQRT1_2) / (2 * SIN_ELEVATION) + (w * Math.SQRT1_2) / 2;
  const fit = (v: number, size: number) => (size - reach < reach ? size / 2 : Math.min(size - reach, Math.max(reach, v)));
  return { ...c, x: fit(c.x, width), z: fit(c.z, depth) };
}

/** The target after dragging the ground by (dx, dy) pixels on a canvas pixelHeight tall. */
export function dragged(c: CameraState, dx: number, dy: number, pixelHeight: number): CameraState {
  const k = viewHeight(c.zoom) / pixelHeight;
  const s = c.turned ? -1 : 1;
  // Screen right on the ground is (s, 0, -s) / sqrt 2; screen up is
  // (-s, 0, -s) / sqrt 2 (away from the camera).
  const across = -dx * k, up = (dy * k) / SIN_ELEVATION;
  return {
    ...c,
    x: c.x + (across * s - up * s) * Math.SQRT1_2,
    z: c.z + (-across * s - up * s) * Math.SQRT1_2,
  };
}
