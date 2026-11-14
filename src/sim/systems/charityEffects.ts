/**
 * 1.2.50 (Robert): what charity premises and squalor do each week. All the
 * numbers are proposed. A charity building works only while a gang owns it
 * and it trades (its running cost is booked with the gang's businesses).
 *
 *  - Soup kitchen: the voters (shopkeepers and occupiers) of its block and
 *    the blocks around it grow SOUP_HOSTILITY less hostile toward the owner;
 *    SOUP_SQUALOR off the squalor of those blocks.
 *  - Clothing bank: the owner's men standing in its block and the blocks
 *    around it gain CLOTHING_LOYALTY loyalty; hood venues within
 *    CLOTHING_RECRUIT_REACH blocks stand CLOTHING_RECRUITS more hoods
 *    (recruitPool.ts).
 *  - Squalor runs both ways: crime in a block (robberies most), closed or
 *    destroyed premises raise it; charity buildings and trading businesses
 *    lower it; it drifts SQUALOR_DRIFT of the way back to the block's start;
 *    squalor gained above the start lowers the land value, and shedding it
 *    gives the value back.
 */
import { shiftAttitude } from '../attitudes';
import { blockAtPos } from '../events';
import { cityBlockAt } from '../cityLayout';
import { buildingList, peopleList } from '../entityLists';
import type { Block, Building, ID, WorldState } from '../types';

export const SOUP_HOSTILITY = 4;
export const SOUP_SQUALOR = 2;
export const CLOTHING_LOYALTY = 1;
export const CLOTHING_RECRUITS = 1;
export const CLOTHING_RECRUIT_REACH = 2;
/** Squalor each week: per robbery, per other crime, per closed or destroyed site in the block. */
export const SQUALOR_PER_ROBBERY = 1;
export const SQUALOR_PER_CRIME = 0.5;
export const SQUALOR_PER_CLOSED = 0.3;
/** Squalor off each week: per church or orphanage, per clothing bank, per trading business in the block. */
export const SQUALOR_OFF_CHURCH = 0.5;
export const SQUALOR_OFF_CLOTHING = 1;
export const SQUALOR_OFF_TRADING = 0.1;
/** Share of the gap to the block's starting squalor closed each week. */
export const SQUALOR_DRIFT = 0.05;
/** Land value lost per point of squalor above the block's start, as a share of the starting land value. */
export const LAND_PER_SQUALOR = 1 / 200;
/** Squalor is a 0..100 scale (Block.squalor). */
const SQUALOR_MAX = 100;
/** The lowest land value a block falls to, as crime leaves it (events.ts recordCrime). */
const LAND_FLOOR = 5;

/** A charity building that works: owned by a gang and trading. */
export function runningCharity(b: Building, typeId: string): boolean {
  return b.typeId === typeId && b.ownerGangId != null && b.state === 'trading';
}

/** The block a building stands in and the blocks around it (each once). */
export function blocksAround(w: WorldState, block: Block, reach: number): Set<ID> {
  const out = new Set<ID>();
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const b = cityBlockAt(w, block.gx + dx, block.gy + dy);
    if (b) out.add(b.id);
  }
  return out;
}

/** The block's starting squalor (set at creation and for older saves on load). */
function startOf(b: Block): { squalor: number; land: number } {
  if (b.squalorStart == null || b.landValueStart == null) throw Error(`Block ${b.id} has no starting squalor or land value.`);
  return { squalor: b.squalorStart, land: b.landValueStart };
}

/** Record every block's starting squalor and land value (new games and older saves). */
export function recordBlockStarts(w: WorldState): void {
  for (const b of w.blocks) { b.squalorStart ??= b.squalor; b.landValueStart ??= b.landValue; }
}

export function weeklyCharity(w: WorldState): void {
  const buildings = buildingList(w);
  const blockOf = (b: Building) => cityBlockAt(w, w.blocks[b.blockId].gx, w.blocks[b.blockId].gy) ?? w.blocks[b.blockId];
  const squalorDelta = new Map<ID, number>();
  const add = (id: ID, d: number) => squalorDelta.set(id, (squalorDelta.get(id) ?? 0) + d);
  for (const k of buildings) {
    if (runningCharity(k, 'soupKitchen')) {
      const area = blocksAround(w, blockOf(k), 1);
      const gangId = k.ownerGangId!;
      for (const b of buildings) {
        if (!area.has(blockOf(b).id)) continue;
        for (const id of [b.ownerPersonId, b.managerId]) {
          const p = id != null ? w.people[id] : undefined;
          if (p && p.status !== 'dead' && p.gangId == null) shiftAttitude(p, gangId, -SOUP_HOSTILITY, 0);
        }
      }
      for (const id of area) add(id, -SOUP_SQUALOR);
    } else if (runningCharity(k, 'clothingBank')) {
      const area = blocksAround(w, blockOf(k), 1);
      add(blockOf(k).id, -SQUALOR_OFF_CLOTHING);
      for (const p of peopleList(w)) {
        if (p.gangId !== k.ownerGangId || p.role === 'boss' || p.status !== 'active') continue;
        const at = blockAtPos(w, p.pos);
        if (at != null && area.has(at)) p.loyalty = Math.min(100, p.loyalty + CLOTHING_LOYALTY);
      }
    }
  }
  // ---- squalor both ways
  for (const b of buildings) {
    const id = blockOf(b).id;
    if (b.state === 'ceased' || b.state === 'destroyed') add(id, SQUALOR_PER_CLOSED);
    else if (b.state === 'trading' && (b.cls === 'commercial' || b.cls === 'industrial')) add(id, -SQUALOR_OFF_TRADING);
    if (b.cls === 'charity' && b.state !== 'destroyed' && (b.typeId === 'church' || b.typeId === 'orphanage')) add(id, -SQUALOR_OFF_CHURCH);
  }
  for (const c of w.crimes) {
    // Bombings and arson already raise squalor when the site falls (execution.ts).
    if (c.week !== w.week || c.charge || c.kind === 'bomb' || c.kind === 'torch') continue;
    const site = c.buildingId != null ? w.buildings[c.buildingId] : undefined;
    const victim = c.victimId != null ? w.people[c.victimId] : undefined;
    const at = site ? blockOf(site).id : victim ? blockAtPos(w, victim.pos) : null;
    if (at != null) add(cityBlockAt(w, w.blocks[at].gx, w.blocks[at].gy)?.id ?? at, c.kind === 'raid' ? SQUALOR_PER_ROBBERY : SQUALOR_PER_CRIME);
  }
  for (const block of w.blocks) {
    if (block.layout?.mergedInto != null) continue;
    const start = startOf(block);
    const before = Math.max(0, block.squalor - start.squalor);
    const next = block.squalor + (squalorDelta.get(block.id) ?? 0) + (start.squalor - block.squalor) * SQUALOR_DRIFT;
    // Squalor lives on its 0..100 scale.
    block.squalor = Math.max(0, Math.min(SQUALOR_MAX, next));
    // Squalor gained above the start takes land value off; squalor shed gives it back.
    const after = Math.max(0, block.squalor - start.squalor);
    block.landValue = Math.max(LAND_FLOOR, block.landValue - (after - before) * start.land * LAND_PER_SQUALOR);
  }
}

/** Hood venues near a running clothing bank stand this many more hoods (recruitPool.ts). */
export function clothingBankRecruits(w: WorldState, venue: Building): number {
  const vb = w.blocks[venue.blockId];
  for (const k of buildingList(w)) {
    if (!runningCharity(k, 'clothingBank')) continue;
    const kb = w.blocks[k.blockId];
    if (Math.abs(kb.gx - vb.gx) <= CLOTHING_RECRUIT_REACH && Math.abs(kb.gy - vb.gy) <= CLOTHING_RECRUIT_REACH) return CLOTHING_RECRUITS;
  }
  return 0;
}
