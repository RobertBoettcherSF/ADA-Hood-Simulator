import { BLOCK_SIZE, CELL, STREET_WIDTH } from './constants';
import type { Block, Lot, Vec2, WorldState } from './types';
import type { Rng } from './rng';
import { STREET_NAMES_EW, STREET_NAMES_NS } from './data/names';
import { BLOCK_MODULE_BY_ID, chooseBlockModule, moduleFacing, moduleRect, moduleSetback } from './blockModules';

/** Churches are scarce landmarks: one in small cities, two from 14 × 14. */
export function churchCountForSize(size: number): number { return size >= 14 ? 2 : 1; }

export function activeBlocks(w: WorldState): Block[] {
  return w.blocks.filter(b => b.layout?.mergedInto == null);
}

export function cityBlockAt(w: WorldState, gx: number, gy: number): Block | undefined {
  if (gx < 0 || gy < 0 || gx >= w.gridW || gy >= w.gridH) return undefined;
  const b = w.blocks[gy * w.gridW + gx];
  return b?.layout?.mergedInto != null ? w.blocks[b.layout.mergedInto] : b;
}

export function blockRect(b: Block) {
  const inset = b.layout?.streetInset ?? 0;
  return { x: b.gx * CELL + STREET_WIDTH / 2 + inset, y: b.gy * CELL + STREET_WIDTH / 2 + inset,
    w: (b.layout?.spanX ?? 1) * CELL - STREET_WIDTH - inset * 2,
    h: (b.layout?.spanY ?? 1) * CELL - STREET_WIDTH - inset * 2 };
}

/** Every cell in a city uses the same saved road clearance. Centre lines stay
 * at 54 m, preserving the routing lattice and old saves' exact geometry. */
export function cityStreetInset(w?: WorldState): number { return w?.blocks[0]?.layout?.streetInset ?? 0; }

export function lotRect(lot: Lot) {
  const s = BLOCK_SIZE / 3;
  return lot.bounds ?? { x: lot.center.x - s / 2, y: lot.center.y - s / 2, w: s, h: s };
}

export function blockPavement(b: Block, id: number): Vec2 {
  const r = blockRect(b), side = id % 4;
  const along = ((id * 13) % 41) / 40;
  if (side === 0 || side === 2) return { x: r.x + along * r.w, y: r.y + (side === 0 ? -1.6 : r.h + 1.6) };
  return { x: r.x + (side === 1 ? r.w + 1.6 : -1.6), y: r.y + along * r.h };
}

const isWater = (b: Block | undefined) => b?.layout?.use === 'water';

/**
 * Which name a street line carries: north-south lines ('ns', x = 0..gridW) and
 * east-west lines ('ew', y = 0..gridH). In the original city an avenue's two
 * flanking streets share one name (0x654AD0: the right or lower flank copies
 * the left or upper one), since the avenue between them is one double-width road.
 */
export function streetNameIndex(w: WorldState, axis: 'ns' | 'ew', line: number): number {
  const avenues = w.cityLayout?.original?.avenues;
  const lines = axis === 'ns' ? avenues?.cols : avenues?.rows;
  return lines?.includes(line - 1) ? line - 1 : line;
}

/** The name painted on a street line: 'Clark Ave' (north-south) or 'Ethel St' (east-west). */
export function streetName(w: WorldState, axis: 'ns' | 'ew', line: number): string {
  const i = streetNameIndex(w, axis, line);
  return axis === 'ns' ? `${STREET_NAMES_NS[i % STREET_NAMES_NS.length]} Ave` : `${STREET_NAMES_EW[i % STREET_NAMES_EW.length]} St`;
}

/**
 * Where a point is, in the original's street grammar (0x60C590): "On the
 * corner of Clark Ave & Ethel St" near a crossing, otherwise "On Clark Ave
 * between Ethel St & Polk St"; the river, bridges and parks have their own
 * forms. An avenue block reads as its avenue (content 34 east-west, 35
 * north-south, 36 a crossing of both).
 */
export function streetLocation(w: WorldState, pos: Vec2): string {
  const fx = pos.x / CELL, fy = pos.y / CELL;
  const clampX = (l: number) => Math.max(0, Math.min(w.gridW, l)), clampY = (l: number) => Math.max(0, Math.min(w.gridH, l));
  const ns = (l: number) => streetName(w, 'ns', clampX(l)), ew = (l: number) => streetName(w, 'ew', clampY(l));
  const lx = Math.round(fx), ly = Math.round(fy);
  const dx = Math.abs(fx - lx) * CELL, dy = Math.abs(fy - ly) * CELL;
  const block = cityBlockAt(w, Math.floor(fx), Math.floor(fy));
  const use = block?.layout?.use, content = block?.original?.content;
  if (block && use === 'avenue') {
    if (content === 37) return 'On the bridge';
    if (content === 35) return `On ${ns(block.gx)} between ${ew(block.gy)} & ${ew(block.gy + 1)}`;
    if (content === 34) return `On ${ew(block.gy)} between ${ns(block.gx)} & ${ns(block.gx + 1)}`;
    return `On the corner of ${ns(block.gx)} & ${ew(block.gy)}`;
  }
  // Inside a block rather than on the street round it.
  if (Math.min(dx, dy) > STREET_WIDTH / 2) {
    if (use === 'water') return 'On the river';
    if (use === 'park') return `In ${block!.layout!.name ?? 'the park'}`;
  }
  if (dx < STREET_WIDTH && dy < STREET_WIDTH) return `On the corner of ${ns(lx)} & ${ew(ly)}`;
  if (dx <= dy) return `On ${ns(lx)} between ${ew(Math.floor(fy))} & ${ew(Math.floor(fy) + 1)}`;
  return `On ${ew(ly)} between ${ns(Math.floor(fx))} & ${ns(Math.floor(fx) + 1)}`;
}

/** Blocks with a footway round them: not the river, and not an avenue (which is
 * roadway from kerb to kerb). Only these take walkers and street spawns. */
export function hasFootway(b: Block): boolean {
  return b.layout?.use !== 'water' && b.layout?.use !== 'avenue';
}

/** A street disappears where the two adjoining cells belong to the same site.
 * In the original city no street runs through the river: between two river
 * blocks, or along the map edge beside one, the way is water. Bridges are
 * avenue blocks, so the streets either side of a bridge stay open. */
export function streetEdgeOpen(w: WorldState, ax: number, ay: number, bx: number, by: number): boolean {
  if (![ax, ay, bx, by].every(Number.isInteger) || Math.abs(ax - bx) + Math.abs(ay - by) !== 1 || Math.min(ax, bx, ay, by) < 0 ||
    Math.max(ax, bx) > w.gridW || Math.max(ay, by) > w.gridH) return false;
  const x = Math.min(ax, bx), y = Math.min(ay, by);
  const a = cityBlockAt(w, ax === bx ? x - 1 : x, ay === by ? y - 1 : y);
  const b = cityBlockAt(w, x, y);
  const wa = isWater(a), wb = isWater(b);
  if ((wa || wb) && (wa || !a) && (wb || !b)) return false;
  return !a || !b || a.id !== b.id;
}

type StreetGraph = {
  points: Vec2[]; neighbours: number[][]; throughX: number[]; throughY: number[]; paths: Map<string, Vec2[]>;
  /** Reused by the route search so a fast clock does not wipe a full-size array on every errand. */
  seen: Int32Array; parent: Int32Array; seenGen: number;
};
const graphs = new WeakMap<WorldState, StreetGraph>();
export function streetGraph(w: WorldState): StreetGraph {
  const old = graphs.get(w);
  if (old) return old;
  const width = w.gridW + 1, points: Vec2[] = [], neighbours: number[][] = [];
  for (let y = 0; y <= w.gridH; y++) for (let x = 0; x <= w.gridW; x++) {
    points.push({ x: x * CELL, y: y * CELL });
    neighbours.push([[x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]]
      .filter(([bx, by]) => streetEdgeOpen(w, x, y, bx, by)).map(([bx, by]) => by * width + bx));
  }
  const throughX = Array.from({ length: w.gridH + 1 }, (_, y) => y)
    .filter(y => Array.from({ length: w.gridW }, (_, x) => streetEdgeOpen(w, x, y, x + 1, y)).every(Boolean));
  const throughY = Array.from({ length: w.gridW + 1 }, (_, x) => x)
    .filter(x => Array.from({ length: w.gridH }, (_, y) => streetEdgeOpen(w, x, y, x, y + 1)).every(Boolean));
  const graph = {
    points, neighbours, throughX, throughY, paths: new Map<string, Vec2[]>(),
    seen: new Int32Array(points.length), parent: new Int32Array(points.length), seenGen: 1,
  };
  graphs.set(w, graph); return graph;
}

/** Shortest route through the remaining streets, including T-junctions. */
export function streetRouteNodes(w: WorldState, from: Vec2, to: Vec2, zig = false): Vec2[] {
  const g = streetGraph(w);
  const nearest = (p: Vec2) => {
    const x = Math.max(0, Math.min(w.gridW, Math.round(p.x / CELL)));
    const y = Math.max(0, Math.min(w.gridH, Math.round(p.y / CELL)));
    const rounded = y * (w.gridW + 1) + x;
    if (g.neighbours[rounded].length) return rounded;
    let best = 0, distance = Infinity;
    g.points.forEach((n, i) => {
      if (!g.neighbours[i].length) return;
      const d = (p.x - n.x) ** 2 + (p.y - n.y) ** 2;
      if (d < distance) { best = i; distance = d; }
    });
    return best;
  };
  const start = nearest(from), end = nearest(to), key = `${start}:${end}:${zig}`;
  const cached = g.paths.get(key); if (cached) return cached;
  // A generation stamp marks the nodes of this search. Filling the parent
  // array on every errand walked the whole lattice, and a fast clock asks
  // for a new errand every minute.
  let gen = ++g.seenGen;
  if (gen >= 0x7fffffff) { g.seen.fill(0); gen = g.seenGen = 1; }
  const seen = g.seen, previous = g.parent;
  const queue = [start];
  seen[start] = gen;
  previous[start] = start;
  for (let cursor = 0; cursor < queue.length && seen[end] !== gen; cursor++) {
    const at = queue[cursor], ns = g.neighbours[at];
    for (let i = 0; i < ns.length; i++) {
      const next = ns[zig ? ns.length - 1 - i : i];
      if (seen[next] === gen) continue;
      seen[next] = gen;
      previous[next] = at;
      queue.push(next);
    }
  }
  if (seen[end] !== gen) throw new Error('Disconnected city streets');
  const route = [g.points[end]];
  for (let at = end; at !== start;) { at = previous[at]; route.push(g.points[at]); }
  route.reverse();
  if (g.paths.size >= 4096) g.paths.delete(g.paths.keys().next().value!);
  g.paths.set(key, route); return route;
}

/** Called before buildings or people exist. Existing saved cities are never repartitioned. */
export function layOutCity(w: WorldState, rng: Rng): void {
  const reserve = (gx: number, gy: number, sx: number, sy: number, use: 'urban' | 'park' | 'civic', name?: string, landmark?: string) => {
    if (gx < 0 || gy < 0 || gx + sx > w.gridW || gy + sy > w.gridH) return false;
    const cells: Block[] = [];
    for (let y = gy; y < gy + sy; y++) for (let x = gx; x < gx + sx; x++) {
      const b = w.blocks[y * w.gridW + x]; if (b.layout) return false; cells.push(b);
    }
    const root = cells[0];
    for (const b of cells) {
      for (const id of b.lotIds) delete w.lots[id];
      b.lotIds = [];
      b.layout = { spanX: b === root ? sx : 1, spanY: b === root ? sy : 1, use,
        ...(b === root ? { name, landmark } : { mergedInto: root.id }) };
    }
    const r = blockRect(root); root.center = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    if (use === 'park') { root.district = 'residential'; return true; }
    const lot = (x: number, y: number, width: number, height: number, index: number, facing: Lot['facing']) => {
      const id = w.nextId++;
      w.lots[id] = { id, blockId: root.id, index, buildingId: -1, center: { x: x + width / 2, y: y + height / 2 },
        bounds: { x, y, w: width, h: height }, facing };
      root.lotIds.push(id);
    };
    if (use === 'civic') {
      if (!['docks', 'railroad'].includes(landmark ?? '')) root.district = 'civic';
      const width = Math.min(r.w * .7, landmark === 'church' ? 21 : 36);
      const height = Math.min(r.h * .65, landmark === 'church' ? 38 : 30);
      lot(root.center.x - width / 2, root.center.y - height / 2, width, height, 1, 'south');
      return true;
    }
    // Urban reservations get their complete kit after street clearance is set.
    return true;
  };
  const find = (sx: number, sy: number, use: 'urban' | 'park' | 'civic', name?: string, landmark?: string,
    pred: (b: Block) => boolean = () => true) => {
    const candidates = rng.shuffle(w.blocks.filter(b => !b.layout && b.gx > 0 && b.gy > 0 &&
      b.gx + sx < w.gridW && b.gy + sy < w.gridH && pred(b)));
    return candidates.some(b => reserve(b.gx, b.gy, sx, sy, use, name, landmark));
  };
  find(2, 2, 'park', 'Volstead Green', undefined, b => b.district !== 'industrial');
  find(1, 2, 'park', 'Cinder Gardens');
  if (w.gridW >= 12) find(2, 1, 'park', 'Hinge Oak');
  find(1, 2, 'civic', 'St. Michael’s', 'church');
  find(1, 1, 'civic', 'City Hall', 'cityHall', b => b.district === 'civic' || b.district === 'downtown');
  find(1, 1, 'civic', 'Courthouse Square', 'courthouse');
  find(2, 1, 'civic', 'General Hospital', 'hospital');
  find(1, 1, 'civic', 'Police Headquarters', 'policeHQ');
  if (churchCountForSize(Math.min(w.gridW, w.gridH)) === 2) find(1, 1, 'civic', 'St. Mary’s', 'church');
  if (!find(2, 1, 'civic', 'Rail Depot', 'railroad', b => b.district === 'industrial'))
    find(1, 2, 'civic', 'Rail Depot', 'railroad', b => b.district === 'industrial');
  if (!find(1, 2, 'civic', 'Freight Yard', 'docks', b => b.district === 'industrial'))
    find(2, 1, 'civic', 'Freight Yard', 'docks', b => b.district === 'industrial');
  for (let i = 0; i < Math.floor(w.blocks.length * .13); i++) {
    const horizontal = rng.chance(.6);
    find(horizontal ? 2 : 1, horizontal ? 1 : 2, 'urban');
  }
  // Give roads six more metres between blocks, without lengthening journeys
  // or moving intersections. Refit only new parcels, before anyone owns them.
  for (const block of w.blocks) {
    const before = blockRect(block);
    const parcels = block.lotIds.map(id => ({ lot: w.lots[id], bounds: lotRect(w.lots[id]) }));
    block.layout = { spanX: 1, spanY: 1, use: 'urban', ...block.layout, streetInset: 3 };
    if (block.layout.mergedInto != null || block.layout.use === 'civic') continue;
    const after = blockRect(block), sx = after.w / before.w, sy = after.h / before.h;
    for (const { lot, bounds } of parcels) {
      lot.bounds = { x: after.x + (bounds.x - before.x) * sx, y: after.y + (bounds.y - before.y) * sy,
        w: bounds.w * sx, h: bounds.h * sy };
      lot.center = { x: lot.bounds.x + lot.bounds.w / 2, y: lot.bounds.y + lot.bounds.h / 2 };
    }
  }
  // Assemble the urban blocks from reviewed kits. Parcels are saved explicitly;
  // this is only new-city construction, never a per-frame layout or save migration.
  for (const block of activeBlocks(w)) {
    if (block.layout?.use !== 'urban') continue;
    const placement = chooseBlockModule(block, w.options.seed), module = BLOCK_MODULE_BY_ID[placement.id];
    block.layout.module = placement;
    const origin = blockRect(block);
    for (const id of block.lotIds) delete w.lots[id];
    block.lotIds = [];
    for (const slot of module.plots) {
      const r = moduleRect(module, placement.turn, slot), id = w.nextId++;
      const bounds = { ...r, x: origin.x + r.x, y: origin.y + r.y };
      const margin = moduleSetback(slot);
      w.lots[id] = { id, blockId: block.id, index: slot.index, buildingId: -1, bounds,
        footprint: { w: r.w - margin * 2, h: r.h - margin * 2 },
        center: { x: bounds.x + r.w / 2, y: bounds.y + r.h / 2 }, facing: moduleFacing(slot.facing, placement.turn) };
      block.lotIds.push(id);
    }
  }
  w.cityLayout = { version: 1, tramLines: [] };
  // Two connected routes through the street graph. Rails never cross a closed site.
  // Square cities keep their saved routes: both midpoints equal gridW / 2 there.
  const midX = Math.floor(w.gridW / 2), midY = Math.floor(w.gridH / 2);
  const routes = [
    { name: 'Crosstown', color: '#9b5143', from: { x: 0, y: midY * CELL }, to: { x: w.gridW * CELL, y: (midY + 2) * CELL } },
    { name: 'Civic Line', color: '#397c79', from: { x: (midX - 2) * CELL, y: 0 }, to: { x: (midX + 1) * CELL, y: w.gridH * CELL } },
  ];
  for (const route of routes) {
    const points = streetRouteNodes(w, route.from, route.to, route.name === 'Civic Line');
    w.cityLayout.tramLines.push({ name: route.name, color: route.color, points,
      stops: points.filter((_, i) => i > 0 && i < points.length - 1 && i % 3 === 1)
        .map((pos, i) => ({ name: `${route.name} stop ${i + 1}`, pos: { ...pos } })) });
  }
}
