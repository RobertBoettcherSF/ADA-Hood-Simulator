import { presentationEvents } from '../sim/presentationEvents';
import type { OrderType, WorldState } from '../sim/types';

/** Orders that are a chase or a raid while men are out. */
const HOT: readonly OrderType[] = ['raid', 'kill', 'assault', 'kidnap', 'ambush'];

/**
 * True while a shootout, raid, or chase is underway on the street.
 * Reads orders and the presentation stream only. Does not roll the city RNG.
 */
export function streetActionHot(world: WorldState): boolean {
  if (world.phase !== 'week') return false;
  for (const event of presentationEvents(world).events) {
    if (event.kind !== 'attack' || event.week !== world.week) continue;
    if (world.minute - event.minute <= 1) return true;
  }
  for (const order of Object.values(world.orders)) {
    if (!HOT.includes(order.type)) continue;
    if (order.state === 'travelling' || order.state === 'executing') return true;
  }
  return false;
}
