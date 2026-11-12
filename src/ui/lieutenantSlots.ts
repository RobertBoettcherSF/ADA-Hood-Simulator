import type { Gang, ID, WorldState } from '../sim/types';

/**
 * 1.2.21: the left panel's eight lieutenant slots. The player may drag a
 * lieutenant onto another (they swap) or onto any slot, empty ones included
 * (he moves there and stays). Crews not yet placed fill the first free slots.
 */
export const SLOT_COUNT = 8;

export function slotLayout(w: WorldState, gang: Gang): (ID | null)[] {
  const live = gang.teamIds.filter((id) => w.teams[id]);
  const out: (ID | null)[] = Array.from({ length: SLOT_COUNT }, () => null);
  const placed = new Set<ID>();
  (gang.teamSlots ?? []).slice(0, SLOT_COUNT).forEach((id, i) => {
    if (id != null && live.includes(id) && !placed.has(id)) { out[i] = id; placed.add(id); }
  });
  for (const id of live) {
    if (placed.has(id)) continue;
    const free = out.indexOf(null);
    if (free < 0) break;
    out[free] = id; placed.add(id);
  }
  return out;
}

/** Move the crew in slot `from` to slot `to`; an occupied target swaps. */
export function moveSlot(w: WorldState, gang: Gang, from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= SLOT_COUNT || to >= SLOT_COUNT) return;
  const slots = slotLayout(w, gang);
  [slots[from], slots[to]] = [slots[to], slots[from]];
  gang.teamSlots = slots;
}
