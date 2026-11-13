import { CELL } from '../sim/constants';
import type { WorldState } from '../sim/types';

/** 1.2.23: parkland around the city, this many metres wide (scenery only: no blocks, no gameplay). */
export const EDGE_PARK_WIDTH = 1.5 * CELL;

/** Deterministic tree spots along the edge band, shared by the plan and the 3D view. */
export function edgeParkTrees(w: WorldState, spacing = 22): { x: number; y: number }[] {
  const cityW = w.gridW * CELL, cityH = w.gridH * CELL, band = EDGE_PARK_WIDTH;
  const out: { x: number; y: number }[] = [];
  const jitter = (i: number, salt: number) => ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
  let i = 0;
  // Two loose rows inside the band, clear of the city's own kerb.
  for (const depth of [band * .32, band * .72]) {
    for (let x = -band + spacing / 2; x < cityW + band; x += spacing, i++) {
      out.push({ x: x + (jitter(i, 1) - .5) * spacing * .5, y: -depth + (jitter(i, 2) - .5) * 6 });
      out.push({ x: x + (jitter(i, 3) - .5) * spacing * .5, y: cityH + depth + (jitter(i, 4) - .5) * 6 });
    }
    for (let y = spacing / 2; y < cityH; y += spacing, i++) {
      out.push({ x: -depth + (jitter(i, 5) - .5) * 6, y: y + (jitter(i, 6) - .5) * spacing * .5 });
      out.push({ x: cityW + depth + (jitter(i, 7) - .5) * 6, y: y + (jitter(i, 8) - .5) * spacing * .5 });
    }
  }
  return out;
}
