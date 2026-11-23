// A read-only copy of the city the core generated: the two draw layers
// (blocks and lots) copied out of linear memory, plus the few fields the
// page needs beyond them, and the gangs' offices (item 4).
import { BLOCK_FIELD, BLOCK_STRIDE, BUILDING_FIELD, COUNT, Exports, GANG_FIELD, LOT_STRIDE, TABLE, u32 } from './core';

export const CELL = 54;         // metres between street centre lines
export const STREET = 14;       // street width
export const INSET = 3;         // extra clearance on every block side
export const UNITS = 256;       // positions cross as 1/256 m

export const DISTRICTS = ['downtown', 'commercial', 'industrial', 'residential', 'civic'] as const;
export const USES = ['urban', 'park', 'civic', 'plaza', 'avenue', 'water'] as const;
export const CLASSES = ['empty', 'residential', 'tenement', 'commercial', 'industrial', 'municipal', 'charity', 'illegal'] as const;
export const FACES = ['north', 'east', 'south', 'west'] as const;
export const EMPTY_LAND = 192;

export interface Block {
  id: number; gx: number; gy: number; district: number; use: number; spanX: number; spanY: number;
  merged: number; landValue: number; squalor: number; content: number; rail: boolean; landmark: number;
  name: number; plan: number;
}
export interface Lot {
  id: number; block: number; index: number; x: number; y: number; w: number; h: number;
  face: number; type: number; cls: number; storeys: number;
}
/** A gang's office (item 4): where its flag stands. */
export interface Headquarters { gang: number; colour: number; block: number; lot: number; fx: number; fy: number }

export interface City {
  seed: number; w: number; h: number; standard: boolean;
  blocks: Block[]; lots: Lot[]; hq: Headquarters[];
  cityHash: number; structureHash: number; rngAfter: number; retries: number; status: number;
  counts: { blocks: number; merged: number; lots: number; buildings: number; typesUsed: number;
    classes: number[]; districts: number[]; uses: number[] };
}

export function readCity(core: Exports, seed: number): City {
  const view = (layer: number) => new Int32Array(core.memory.buffer, core.hs_draw_ptr(layer), core.hs_draw_len(layer));
  const b = view(1), l = view(2);
  const blocks: Block[] = [];
  for (let i = 0; i * BLOCK_STRIDE < b.length; i++) {
    const o = i * BLOCK_STRIDE;
    blocks.push({
      id: i, gx: b[o], gy: b[o + 1], district: b[o + 2], use: b[o + 3], spanX: b[o + 4], spanY: b[o + 5],
      merged: b[o + 6], landValue: b[o + 7], squalor: b[o + 8], content: b[o + 9], rail: b[o + 10] === 1,
      landmark: b[o + 11], name: core.hs_get(TABLE.block, i, BLOCK_FIELD.name),
      plan: core.hs_get(TABLE.block, i, BLOCK_FIELD.plan),
    });
  }
  const lots: Lot[] = [];
  for (let i = 0; i * LOT_STRIDE < l.length; i++) {
    const o = i * LOT_STRIDE;
    lots.push({
      id: i, block: l[o], index: l[o + 1], x: l[o + 2] / UNITS, y: l[o + 3] / UNITS, w: l[o + 4] / UNITS,
      h: l[o + 5] / UNITS, face: l[o + 6], type: l[o + 7], cls: l[o + 8], storeys: l[o + 9],
    });
  }
  const hq: Headquarters[] = [];
  for (let g = 1; g <= 4; g++) {
    const office = core.hs_get(TABLE.gang, g, GANG_FIELD.office);
    const lot = office >= 0 ? lots[core.hs_get(TABLE.building, office, BUILDING_FIELD.lot)] : undefined;
    if (!lot) continue;
    const cx = lot.x + lot.w / 2, cy = lot.y + lot.h / 2;
    hq.push({ gang: g, colour: core.hs_get(TABLE.gang, g, GANG_FIELD.colour), block: lot.block, lot: lot.id,
      fx: Math.floor(cx / (CELL / 5)), fy: Math.floor(cy / (CELL / 5)) });
  }
  const w = core.hs_count(COUNT.blocksX), h = core.hs_count(COUNT.blocksY);
  return {
    seed, w, h, standard: w === 40 && h === 32, blocks, lots, hq,
    cityHash: u32(core.hs_city_hash()), structureHash: u32(core.hs_structure_hash()),
    rngAfter: u32(core.hs_count(COUNT.rngLow) | (core.hs_count(COUNT.rngHigh) << 16)),
    retries: core.hs_count(COUNT.retries), status: core.hs_count(COUNT.status),
    counts: {
      blocks: core.hs_count(COUNT.blocks), merged: core.hs_count(COUNT.merged), lots: core.hs_count(COUNT.lots),
      // As generated, before the gangs turned fronts and offices (item 4).
      buildings: core.hs_count(COUNT.buildings), typesUsed: core.hs_count(COUNT.builtTypes),
      classes: CLASSES.map((_, k) => core.hs_count(COUNT.builtClassBase + k)),
      districts: DISTRICTS.map((_, k) => core.hs_count(COUNT.districtBase + k)),
      uses: USES.map((_, k) => core.hs_count(COUNT.useBase + k)),
    },
  };
}

/** A block's ground rectangle in metres (street clearance included). */
export function blockRect(b: Block) {
  return { x: b.gx * CELL + STREET / 2 + INSET, y: b.gy * CELL + STREET / 2 + INSET,
    w: b.spanX * CELL - STREET - 2 * INSET, h: b.spanY * CELL - STREET - 2 * INSET };
}

/** The lot under a point (metres), or -1. */
export function lotAt(city: City, x: number, y: number): number {
  const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
  if (gx < 0 || gy < 0 || gx >= city.w || gy >= city.h) return -1;
  let block = city.blocks[gy * city.w + gx];
  if (block.merged >= 0) block = city.blocks[block.merged];
  for (const lot of city.lots) {
    if (lot.block === block.id && x >= lot.x && x <= lot.x + lot.w && y >= lot.y && y <= lot.y + lot.h) return lot.id;
  }
  return -1;
}
