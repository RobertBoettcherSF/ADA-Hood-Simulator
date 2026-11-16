import { goodsTotal, recoverOrderCargo } from './cargo';
import type { Building, GoodsKind, Order, Vec2, WorldState } from './types';
import { allBuildings, buildingDoor, dist } from './world';

export function isExportTerminal(b: Building | undefined): b is Building {
  return !!b && b.state === 'trading' && (b.typeId === 'docks' || b.typeId === 'railroad');
}

export function nearestExportTerminal(w: WorldState, from: Vec2): Building | null {
  let closest: Building | null = null, distance = Infinity;
  for (const b of allBuildings(w)) {
    if (!isExportTerminal(b)) continue;
    const d = dist(from, buildingDoor(w, b));
    if (d < distance) { closest = b; distance = d; }
  }
  return closest;
}

/** Cancellation starts a physical return; only arrival credits warehouse stock. */
export function recoverExportGoods(w: WorldState, order: Order, lost = !order.assignedIds.some(id =>
  w.people[id]?.status === 'active' && w.people[id].burningEscape?.week !== w.week)): void {
  recoverOrderCargo(w,order,lost);
}

/** 1.2.67: what one export case fetches, by kind, before the weekly ratio. */
export const EXPORT_CASE_BASE = { liquor: 100, stolen: 200, counterfeit: 1000 } as const;
/** 1.2.67: percent of the base per bracket of eight cases already exported by
 * every gang this week; beyond the last bracket a case fetches EXPORT_TAIL_RATE. */
export const EXPORT_BRACKET_RATES = [90, 85, 80, 75, 70, 65, 60, 50] as const;
export const EXPORT_BRACKET_CASES = 8;
export const EXPORT_TAIL_RATE = 5;

/** Percent of the base the next case fetches when `sold` cases went abroad this week. */
export function exportCaseRate(sold: number): number {
  const bracket = Math.floor(Math.max(0, sold) / EXPORT_BRACKET_CASES);
  return bracket < EXPORT_BRACKET_RATES.length ? EXPORT_BRACKET_RATES[bracket] : EXPORT_TAIL_RATE;
}

/** Cases every gang has exported this week. */
export function exportedThisWeek(w: WorldState): number {
  return w.exportWeek?.week === w.week ? w.exportWeek.cases : 0;
}

/** The price of a load if `sold` cases already went this week: counterfeit
 * first, then stolen goods, then liquor (the order the trucks are loaded). */
export function exportLoadValue(goods: Record<GoodsKind, number>, sold: number): number {
  let total = 0, n = Math.max(0, sold);
  for (const kind of ['counterfeit', 'stolen', 'liquor'] as const) {
    for (let i = 0; i < Math.max(0, goods[kind]); i++) total += EXPORT_CASE_BASE[kind] * exportCaseRate(n++) / 100;
  }
  return Math.round(total);
}

/** Sell a load abroad: the price falls with what every gang sold this week. */
export function sellExport(w: WorldState, goods: Record<GoodsKind, number>): number {
  const sold = exportedThisWeek(w);
  const gross = exportLoadValue(goods, sold);
  w.exportWeek = { week: w.week, cases: sold + goodsTotal(goods) };
  return gross;
}
