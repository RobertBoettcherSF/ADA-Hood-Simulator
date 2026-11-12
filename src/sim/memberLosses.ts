/**
 * Who a gang lost, why, and to whom: killed (and by which gang or the police),
 * arrested, convicted, kidnapped, walked out over loyalty or pay, sacked.
 * Kept for the session only (not in the save): Auto Test's timeline and the
 * debug report read it.
 */
import type { ID, OrderType, Person, Vec2, WorldState } from './types';

export interface MemberLoss {
  week: number;
  personId: ID;
  name: string;
  role: string;
  gangId: ID;
  /** What happened, in plain words: "shot down in the street", "deserted (loyalty 12; paid $300, wanted $450)". */
  cause: string;
  /** Who did it, when known: a gang's name, "the police", "the FBI", "the courts", "his own gang". */
  by?: string;
  /** Where he fell, and the premises his order was working at the time, when known. */
  pos?: Vec2;
  buildingId?: ID;
  orderType?: OrderType;
}

const LOSSES = new WeakMap<WorldState, MemberLoss[]>();
const KEEP = 400;

export function noteMemberLoss(w: WorldState, p: Person, cause: string, by?: string): void {
  if (p.gangId == null) return;
  const list = LOSSES.get(w) ?? [];
  const order = p.orderId != null ? w.orders[p.orderId] : undefined;
  const buildingId = order?.targetBuildingIds[order.cursor] ?? p.buildingId ?? undefined;
  list.push({ week: w.week, personId: p.id, name: p.name, role: p.role, gangId: p.gangId, cause, by,
    pos: p.pos ? { x: p.pos.x, y: p.pos.y } : undefined, buildingId: buildingId ?? undefined, orderType: order?.type });
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
  LOSSES.set(w, list);
}

export function memberLosses(w: WorldState, gangId?: ID, sinceWeek = -Infinity): MemberLoss[] {
  return (LOSSES.get(w) ?? []).filter((l) => (gangId == null || l.gangId === gangId) && l.week >= sinceWeek);
}

export function formatMemberLoss(l: MemberLoss): string {
  return `${l.name} (${l.role}) — ${l.cause}${l.by ? ` [${l.by}]` : ''}`;
}
