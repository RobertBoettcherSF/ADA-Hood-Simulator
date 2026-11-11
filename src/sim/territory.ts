import type { Block, Building, ID, Vec2, WorldState } from './types';
import { blockRect } from './cityLayout';
import { buildingList } from './entityLists';

export function canonicalAreaBlocks(w: WorldState, ids: ID[]): ID[] {
  return [...new Set(ids.filter(id => w.blocks[id]).map(id => w.blocks[id].layout?.mergedInto ?? id))];
}

export function standingTerritorySite(b: Building): boolean {
  return b.cls !== 'empty' && b.state !== 'destroyed';
}

/** Manual p.12: any owned or protected business establishes a claim. Multiple
 * gangs can have claims on the same block; neither one erases the other. */
export function buildingClaimants(w: WorldState, b: Building): ID[] {
  if (!standingTerritorySite(b)) return [];
  return [...new Set([b.ownerGangId, b.protection?.gangId])]
    .filter((id): id is ID => id != null && !!w.gangs[id] && !w.gangs[id].eliminated);
}

export function claimedTerritoryBlocks(w: WorldState, gangId: ID): Set<ID> {
  const claims = new Set<ID>();
  if (!w.gangs[gangId] || w.gangs[gangId].eliminated) return claims;
  // One pass, no lists in between: asked every minute for the score peaks.
  // Same blocks in the same order as filtering the buildings and then the blocks.
  const blocks = w.blocks;
  for (const b of buildingList(w)) {
    if (b.ownerGangId !== gangId && b.protection?.gangId !== gangId) continue;
    if (!standingTerritorySite(b)) continue;
    const block = blocks[b.blockId];
    if (!block) continue;
    claims.add(block.layout?.mergedInto ?? b.blockId);
  }
  return claims;
}

/** Distance from the edge of the current territory, including merged blocks.
 * An office is not required: protection and other owned businesses also count. */
export function distanceToTerritory(w: WorldState, gangId: ID, point: Vec2): number {
  let nearest = Infinity;
  for (const id of claimedTerritoryBlocks(w, gangId)) {
    const block = w.blocks[id];
    if (!block) continue;
    const r = blockRect(block);
    const dx = Math.max(r.x - point.x, 0, point.x - r.x - r.w);
    const dy = Math.max(r.y - point.y, 0, point.y - r.y - r.h);
    nearest = Math.min(nearest, Math.hypot(dx, dy));
    if (nearest === 0) break;
  }
  return nearest;
}

/** Include businesses behind public fronts, without scanning the whole city
 * for each map block or each ceasefire encounter. */
export function territorySites(w: WorldState, block: Block): Building[] {
  const root = w.blocks[block.layout?.mergedInto ?? block.id];
  const sites = new Map<ID, Building>();
  for (const lotId of root?.lotIds ?? []) {
    const b = w.buildings[w.lots[lotId]?.buildingId];
    if (!b) continue;
    sites.set(b.id, b);
    const hidden = b.hidesId == null ? undefined : w.buildings[b.hidesId];
    if (hidden) sites.set(hidden.id, hidden);
  }
  return [...sites.values()];
}

export function blockClaimants(w: WorldState, block: Block): ID[] {
  return [...new Set(territorySites(w, block).flatMap(b => buildingClaimants(w, b)))].sort((a, b) => a - b);
}
