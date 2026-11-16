import { WAREHOUSE_CASH_CAP, WAREHOUSE_GOODS_CAP } from './constants';
import { BUILDING_BY_ID } from './data/buildings';
import type { Building, GoodsKind } from './types';

/** The manual gives warehouses one 300-case liquor/stolen store, plus 15
 * counterfeit cases. Older overfull stores retain their goods but cannot add. */
export function warehouseRoom(b: Building, kind: GoodsKind): number {
  return Math.max(0, kind === 'counterfeit' ? WAREHOUSE_CASH_CAP - b.stock.counterfeit
    : WAREHOUSE_GOODS_CAP - b.stock.liquor - b.stock.stolen);
}
export function goodsRetailer(b: Building, kind: GoodsKind): boolean {
  if (b.typeId === 'warehouse' || b.state !== 'trading') return false;
  if (kind === 'liquor') return b.typeId === 'speakeasy';
  // 1.2.67: a public building (the museum) can be robbed but sells nothing.
  return b.cls !== 'illegal' && b.cls !== 'municipal' && !!BUILDING_BY_ID[b.typeId]?.stores?.includes(kind);
}
/** Retail buffers and factory storage are remake tuning, separate from the
 * manual's warehouse capacity. A warehouse is never a retail destination. */
export function goodsRoom(b: Building, kind: GoodsKind): number {
  if (b.typeId === 'warehouse') return warehouseRoom(b, kind);
  if (!goodsRetailer(b, kind)) return 0;
  return Math.max(0, (kind === 'liquor' ? 120 : kind === 'stolen' ? 60 : 6) - b.stock[kind]);
}

/** 1.2.67: the trades whose own wares are stolen goods (the luxury shops, the museum). */
export const STOLEN_GOODS_SOURCES: ReadonlySet<string> = new Set(['pawnbroker', 'jewellers', 'furrier', 'museum']);
/** 1.2.67: what a raid can carry off — goods the site holds, or the wares of a
 * luxury shop. Nothing else is invented from a shop's catalogue. */
export function raidableGoods(b: Building): GoodsKind[] {
  const kinds = (['counterfeit', 'stolen', 'liquor'] as const).filter(k => b.stock[k] > 0);
  if (STOLEN_GOODS_SOURCES.has(b.typeId) && !kinds.includes('stolen')) kinds.push('stolen');
  return kinds;
}
