/**
 * 1.2.21 developer trace for the debug report: every stop an order makes
 * (arrival, done, missed) with the minute, kept in memory for the current
 * week only. It is never saved and never read by the simulation.
 */
import type { ID, WorldState } from './types';
import { registerProbe } from './memProbe';

export interface StopTrace {
  week: number;
  minute: number;
  gangId: ID;
  teamId: ID;
  orderId: ID;
  type: string;
  buildingId: ID | null;
  event: 'arrive' | 'done' | 'miss' | 'finish';
  note?: string;
}

let traces: StopTrace[] = [];
registerProbe('stopTraces', () => traces.length); // 1.2.28

export function traceStop(w: WorldState, order: { id: ID; gangId: ID; teamId: ID; type: string; targetBuildingIds: ID[]; cursor: number },
  event: StopTrace['event'], note?: string): void {
  traces.push({ week: w.week, minute: w.minute, gangId: order.gangId, teamId: order.teamId, orderId: order.id, type: order.type,
    buildingId: order.targetBuildingIds[order.cursor] ?? null, event, note });
  if (traces.length > 200_000) traces.splice(0, traces.length - 200_000);
}

/** This week's traces (then cleared). */
export function takeStopTraces(): StopTrace[] {
  const out = traces;
  traces = [];
  return out;
}

export function peekStopTraces(): StopTrace[] {
  return traces;
}
