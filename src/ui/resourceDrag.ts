import { useState, type DragEvent } from 'react';
import { act, useGame } from '../app/store';
import { moveToPool, moveToTeam, promote, transferVehicle, transferWeapon, type ApiResult } from '../sim/api';
import type { ID, VehicleId, WeaponId, WorldState } from '../sim/types';

/**
 * Resources drag and drop (original §4.10): hoods, weapons and vehicles can be
 * dragged onto a lieutenant's crew, and hoods back onto the pool. The buttons
 * stay as the keyboard route; a drop does exactly what the button does.
 */
export type ResourceDrag =
  | { kind: 'hood'; id: ID }
  | { kind: 'weapon'; id: WeaponId }
  | { kind: 'vehicle'; id: VehicleId };

export type ResourceTarget = { kind: 'team'; teamId: ID } | { kind: 'pool' } | { kind: 'new-crew' };

const MIME = 'application/x-og-resource';
let droppedAt = 0;

/** A click that follows a drop should not also toggle the panel. */
export function resourceJustDropped(): boolean {
  return performance.now() - droppedAt < 400;
}

export function applyResourceDrop(w: WorldState, gangId: ID, item: ResourceDrag, target: ResourceTarget): ApiResult {
  if (target.kind === 'pool') {
    if (item.kind !== 'hood') return { ok: false, error: 'Only hoods go back to the pool.' };
    return moveToPool(w, gangId, item.id);
  }
  if (target.kind === 'new-crew') {
    if (item.kind !== 'hood') return { ok: false, error: 'Only a hood can be promoted to a new crew.' };
    return promote(w, gangId, item.id);
  }
  if (item.kind === 'hood') return moveToTeam(w, gangId, item.id, target.teamId);
  if (item.kind === 'weapon') return transferWeapon(w, gangId, item.id, target.teamId, true);
  return transferVehicle(w, gangId, item.id, target.teamId, true);
}

/** Props that make an element a drag source for one resource. */
export function resourceDragProps(item: ResourceDrag) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(MIME, JSON.stringify(item));
      e.dataTransfer.effectAllowed = 'move';
    },
  };
}

function readDrag(e: DragEvent): ResourceDrag | null {
  try { return JSON.parse(e.dataTransfer.getData(MIME)) as ResourceDrag; } catch { return null; }
}

/** Drop-target props plus whether a resource is hovering over it. */
export function useResourceDrop(target: ResourceTarget | null): [Record<string, unknown>, boolean] {
  const [over, setOver] = useState(false);
  const notify = useGame((s) => s.notify);
  if (!target) return [{}, false];
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(MIME);
  return [{
    onDragOver: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!over) setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      setOver(false);
      const item = readDrag(e);
      if (!item) return;
      e.preventDefault();
      droppedAt = performance.now();
      const result = act((s) => applyResourceDrop(s.world, s.playerGang.id, item, target));
      if (result) notify(result);
    },
  }, over];
}
