import { clearDestination } from './movement';
import { BUILDING_BY_ID } from './data/buildings';
import type { Building, WorldState } from './types';
import { buildingList } from './entityLists';

/** The manual retains site costs while ceased, but supplies no numeric rate.
 * Remake tuning: 0.5% of fit-out cost/week, $10 minimum. Trading catalogue
 * profit is already net of site costs, so this is charged only while ceased. */
export function businessCarryingCost(b: Building): number {
  const type = BUILDING_BY_ID[b.typeId];
  if (!type || b.isHQ || type.id === 'office' || b.cls === 'empty' || b.cls === 'municipal') return 0;
  return Math.max(10,Math.round(type.cost*.005));
}

export function businessFrontReady(w: WorldState, b: Building): boolean {
  if (b.cls !== 'illegal') return true;
  const front = b.frontId == null ? undefined : w.buildings[b.frontId];
  return !!front && front.state === 'trading' && front.fbiClosedWeek == null;
}

/** A new operation cannot inherit the previous business's investigation. */
export function resetBusinessInvestigation(w: WorldState, b: Building): void {
  b.discovered = false; b.fbiSuspicion = 0;
  delete b.fbiDiscoveredWeek; delete b.fbiRaidWeek; delete b.fbiClosedWeek;
  delete b.fbiSearchedWeek; delete b.launderingWeek;
  for (const id of w.fbiIds) {
    const p = w.people[id];
    if (p?.fbiAssignment?.buildingId !== b.id) continue;
    p.fbiAssignment = undefined;
    if (!p.streetOrder && p.orderId == null && !p.emergencyResponse) clearDestination(p);
  }
}

/** Cease trading takes effect for the whole week, even if a restart is requested. */
export function finishTradingRestarts(w: WorldState): void {
  for (const b of buildingList(w)) {
    if (b.resumeTradingWeek == null || b.resumeTradingWeek > w.week) continue;
    if (b.state === 'damaged') continue;
    delete b.resumeTradingWeek;
    if (b.state === 'ceased' && b.fbiClosedWeek == null && businessFrontReady(w,b)) {
      b.state = 'trading'; delete b.ceasedWeek;
    }
  }
}
