// Item 5: crews, orders, last week's orders and messages, read through
// hs_get; orders staged with hs_order_begin / hs_order_add and previewed or
// given with hs_order_preview / hs_order_issue; crew commands through
// hs_command. Numbers shared with src/hood-host_abi.ads (proposed there).
import { BUILDING_FIELD, COUNT, Exports, TABLE } from './core';
import { City } from './city';
import { personName } from './people';
import { NAMES, STREETS_EW, STREETS_NS, TYPE_NAMES } from './tables';

export const ORDER_COUNT = { orders: 63, last: 64, messages: 65, cityVersion: 66, crews: 67, playerGang: 68, avenueCol: 100, avenueRow: 104 } as const;
export const ORDER_TABLE = { crews: 10, gangCrews: 11, order: 12, last: 13, message: 14, preview: 15 } as const;
export const CREW_FIELD = { id: 0, gang: 1, lieutenant: 2, count: 3, pistols: 4, coupes: 5, orderCount: 6, timeUsed: 7,
  nameFirst: 8, men: 9, members: 10, speedsters: 11, trucks: 12, member: 20, order: 40 } as const;
export const ORDER_FIELD = { id: 0, gang: 1, crew: 2, kind: 3, state: 4, manpower: 5, repeat: 6, amount: 7, level: 8,
  business: 9, front: 10, px: 11, py: 12, hasPoint: 13, targets: 14, blocks: 15, assigned: 16, cursor: 17, completed: 18,
  estimate: 19, worked: 20, started: 21, finished: 22, crewSize: 23, results: 24, cost: 25, fail: 30, waiting: 35,
  miss: 40, hasTime: 45, staffing: 46, target: 100, block: 200, person: 220, result: 300 } as const;
export const ADD = { building: 1, block: 2, point: 3, amount: 4, level: 5, business: 6, front: 7, repeat: 8 } as const;
export const CMD = { cancel: 1, setPay: 2, sack: 3, promote: 4, demote: 5, moveToCrew: 6, moveToPool: 7, repeat: 8, buyVehicle: 9 } as const;
/** Item 6: the cars a crew can be given (cost in dollars, seats); kinds 0 speedster, 1 coupe, 2 truck. */
export const VEHICLES = [{ kind: 0, cost: 5000, seats: 2 }, { kind: 1, cost: 3000, seats: 4 }, { kind: 2, cost: 3000, seats: 10 }] as const;
export const PERSON_ORDER_FIELD = 17;
export const B_CLASS = 3, B_REMOVED = 6;
export const BLOCK_MODULE = 13;

/** Order kinds in Hood.Population.Order_Kind order (the peaceful ones, item 5). */
export const ORDER_KINDS = ['buy', 'setUp', 'run', 'collect', 'adjust', 'donate', 'cleanUp', 'clearStreets',
  'guard', 'patrol', 'explore', 'recruit', 'goTo'] as const;
export type OrderKind = typeof ORDER_KINDS[number];
export type TargetKind = 'building' | 'area' | 'point';
/** Target and most men per order (DESIGN 6.4). */
export const ORDER_DEFS: Record<OrderKind, { target: TargetKind; max: number; group: 'business' | 'personnel' }> = {
  buy: { target: 'building', max: 2, group: 'business' }, setUp: { target: 'building', max: 2, group: 'business' },
  run: { target: 'building', max: 2, group: 'business' }, collect: { target: 'area', max: 10, group: 'business' },
  adjust: { target: 'area', max: 1, group: 'business' }, donate: { target: 'building', max: 4, group: 'business' },
  cleanUp: { target: 'area', max: 4, group: 'business' }, clearStreets: { target: 'area', max: 4, group: 'business' },
  guard: { target: 'building', max: 4, group: 'personnel' }, patrol: { target: 'area', max: 4, group: 'personnel' },
  explore: { target: 'area', max: 10, group: 'personnel' }, recruit: { target: 'area', max: 10, group: 'personnel' },
  goTo: { target: 'point', max: 4, group: 'personnel' },
};
export const ORDER_STATES = ['queued', 'travelling', 'waiting', 'executing', 'done', 'failed', 'cancelled'] as const;

/** Hood.Population.Line_Kind, in order. */
export const LINE_KINDS = ['L_None',
  'L_Bought', 'L_Opened', 'L_New_Management', 'L_Collected', 'L_Refused_Pay', 'L_Already_Paid', 'L_Protection_Set',
  'L_Donated', 'L_Cleaned_Up', 'L_Cleared', 'L_Looked_Over', 'L_Found_Hidden', 'L_Nobody_Hiring', 'L_Signed_On',
  'L_Nobody_Willing', 'L_Stood_Guard', 'L_Patrolled', 'L_Held', 'L_Ran_Out', 'L_Continuing',
  'F_No_Site', 'F_Owned_Already', 'F_Not_For_Sale', 'F_Price', 'F_Not_Yours', 'F_No_Type', 'F_Illegal_Centre',
  'F_Legal_Centre', 'F_City_Only', 'F_No_Front', 'F_Front_Taken', 'F_Fit_Out', 'F_Not_Your_Site', 'F_No_Hood_Free',
  'F_No_Charity', 'F_No_Donation', 'F_Spare_Money', 'F_Clean_Up_Money', 'F_Streets_Not_Bribed', 'F_Site_Gone',
  'F_Nobody_Left', 'F_Never_Started', 'F_Not_Enough_Time', 'F_Nothing_Came', 'F_Needs_People', 'F_Needs_Free',
  'F_Target_Lost', 'F_Never_Started_Default',
  'M_Acquired', 'M_Opened', 'M_Refused_Protection', 'M_Uncovered', 'M_Order_Failed', 'M_Order_Cut_Short',
  'M_Queued_Waiting'] as const;
export type LineKind = typeof LINE_KINDS[number];

/** Hood.Population.Commands.Reply_Kind, in order. */
export const REPLY_KINDS = ['Y_None',
  'Y_Accepted', 'Y_Cancelled', 'Y_Back_On_Street', 'Y_Promoted', 'Y_Broken_Up', 'Y_Joined', 'Y_Already_In', 'Y_Bought', 'Y_Done',
  'Y_No_Crew', 'Y_Lt_Unavailable', 'Y_Positive_Whole', 'Y_Only_People', 'Y_At_Most', 'Y_Staffing', 'Y_Valid_Amount',
  'Y_Donation_Zero', 'Y_Streets', 'Y_Rate', 'Y_No_Block', 'Y_No_Site', 'Y_Valid_Site', 'Y_Site_Not_Valid',
  'Y_Inside_City', 'Y_Nothing_There', 'Y_Cannot_Afford', 'Y_No_Time_Trim', 'Y_No_Time', 'Y_Too_Many_Orders',
  'Y_No_Order', 'Y_No_Person', 'Y_Choose_Hood', 'Y_Not_In_Pool', 'Y_Max_Lieutenants', 'Y_Could_Not_Promote',
  'Y_Choose_Hood_Crew', 'Y_Crew_Full', 'Y_Choose_Crew_Hood', 'Y_Cannot_Afford_It'] as const;
export type ReplyKind = typeof REPLY_KINDS[number];
export const ACCEPTED_LAST = REPLY_KINDS.indexOf('Y_Done');

export interface Line { kind: LineKind; a: number; b: number; c: number; d: number }
export interface Reply { kind: ReplyKind; ok: boolean; a: number; b: number; c: number; d: number; kept: number[]; slot: number }

export interface Crew {
  slot: number; id: number; lieutenant: number; nameFirst: number; members: number[]; orders: number[];
  timeUsed: number; men: number; pistols: number; coupes: number; speedsters: number; trucks: number;
}
export interface Order {
  slot: number; id: number; crew: number; kind: OrderKind; state: typeof ORDER_STATES[number]; manpower: number;
  repeat: boolean; amount: number; level: number; business: number; front: number; point: { x: number; y: number } | null;
  targets: number[]; blocks: number[]; assigned: number[]; completed: number; estimate: number; worked: number;
  started: number; finished: number; cost: number; fail: Line; waiting: Line; results: Line[];
}

const line = (f: (k: number) => number, base: number): Line => ({
  kind: LINE_KINDS[f(base)] ?? 'L_None', a: f(base + 1), b: f(base + 2), c: f(base + 3), d: f(base + 4) });

export const playerGang = (core: Exports) => core.hs_count(ORDER_COUNT.playerGang);

export function readCrews(core: Exports, gang: number): Crew[] {
  const out: Crew[] = [];
  const n = core.hs_get(ORDER_TABLE.gangCrews, gang, 0);
  for (let k = 1; k <= n; k++) {
    const slot = core.hs_get(ORDER_TABLE.gangCrews, gang, k);
    if (slot < 0) continue;
    const f = (x: number) => core.hs_get(ORDER_TABLE.crews, slot, x);
    const count = f(CREW_FIELD.count), orders = f(CREW_FIELD.orderCount);
    out.push({
      slot, id: f(CREW_FIELD.id), lieutenant: f(CREW_FIELD.lieutenant), nameFirst: f(CREW_FIELD.nameFirst),
      members: Array.from({ length: count }, (_, i) => f(CREW_FIELD.member + i + 1)),
      orders: Array.from({ length: orders }, (_, i) => f(CREW_FIELD.order + i + 1)),
      timeUsed: f(CREW_FIELD.timeUsed), men: f(CREW_FIELD.men), pistols: f(CREW_FIELD.pistols), coupes: f(CREW_FIELD.coupes), speedsters: f(CREW_FIELD.speedsters), trucks: f(CREW_FIELD.trucks),
    });
  }
  return out;
}

export function crewName(crew: Pick<Crew, 'nameFirst'>): string { return `${NAMES[crew.nameFirst] ?? '?'}'s Crew`; }

function readOrderFrom(core: Exports, table: number, index: number): Order {
  const f = (k: number) => core.hs_get(table, index, k);
  const list = (base: number, n: number) => Array.from({ length: n }, (_, i) => f(base + i));
  return {
    slot: index, id: f(ORDER_FIELD.id), crew: f(ORDER_FIELD.crew), kind: ORDER_KINDS[f(ORDER_FIELD.kind)],
    state: ORDER_STATES[f(ORDER_FIELD.state)], manpower: f(ORDER_FIELD.manpower), repeat: f(ORDER_FIELD.repeat) === 1,
    amount: f(ORDER_FIELD.amount), level: f(ORDER_FIELD.level), business: f(ORDER_FIELD.business), front: f(ORDER_FIELD.front),
    point: f(ORDER_FIELD.hasPoint) === 1 ? { x: f(ORDER_FIELD.px), y: f(ORDER_FIELD.py) } : null,
    targets: list(ORDER_FIELD.target, f(ORDER_FIELD.targets)), blocks: list(ORDER_FIELD.block, f(ORDER_FIELD.blocks)),
    assigned: list(ORDER_FIELD.person, f(ORDER_FIELD.assigned)), completed: f(ORDER_FIELD.completed),
    estimate: f(ORDER_FIELD.estimate), worked: f(ORDER_FIELD.worked), started: f(ORDER_FIELD.started),
    finished: f(ORDER_FIELD.finished), cost: f(ORDER_FIELD.cost),
    fail: line(f, ORDER_FIELD.fail), waiting: line(f, ORDER_FIELD.waiting),
    results: Array.from({ length: f(ORDER_FIELD.results) }, (_, k) => line(f, ORDER_FIELD.result + 5 * k)),
  };
}
export const readOrder = (core: Exports, slot: number) => readOrderFrom(core, ORDER_TABLE.order, slot);
export function readLastWeek(core: Exports, gang: number): Order[] {
  const out: Order[] = [];
  for (let i = 0; i < core.hs_count(ORDER_COUNT.last); i++) {
    if (core.hs_get(ORDER_TABLE.last, i, ORDER_FIELD.gang) === gang) out.push(readOrderFrom(core, ORDER_TABLE.last, i));
  }
  return out;
}
export function readMessages(core: Exports): Line[] {
  return Array.from({ length: core.hs_count(ORDER_COUNT.messages) }, (_, i) => line(k => core.hs_get(ORDER_TABLE.message, i + 1, k), 0));
}

/** What the job card stages: the crew slot, the kind and the men, then the sites and options. */
export interface Draft {
  crew: number; kind: OrderKind; manpower: number; buildings: number[]; blocks: number[];
  point: { x: number; y: number } | null; amount: number; level: number; business: number; front: number; repeat: boolean;
}
export const newDraft = (crew: number, kind: OrderKind): Draft => ({ crew, kind, manpower: 1, buildings: [], blocks: [],
  point: null, amount: -1, level: -1, business: -1, front: -1, repeat: false });

function stage(core: Exports, d: Draft) {
  core.hs_order_begin(d.crew, ORDER_KINDS.indexOf(d.kind), d.manpower);
  for (const b of d.buildings) core.hs_order_add(ADD.building, b, 0);
  for (const b of d.blocks) core.hs_order_add(ADD.block, b, 0);
  if (d.point) core.hs_order_add(ADD.point, d.point.x, d.point.y);
  if (d.amount !== -1) core.hs_order_add(ADD.amount, d.amount, 0);
  if (d.level !== -1) core.hs_order_add(ADD.level, d.level, 0);
  if (d.business !== -1) core.hs_order_add(ADD.business, d.business, 0);
  if (d.front !== -1) core.hs_order_add(ADD.front, d.front, 0);
  if (d.repeat) core.hs_order_add(ADD.repeat, 1, 0);
}

export interface Preview { order: Order; hasTime: boolean; staffing: Line }
export function previewDraft(core: Exports, d: Draft): Preview | null {
  stage(core, d);
  if (core.hs_order_preview() !== 1) return null;
  const f = (k: number) => core.hs_get(ORDER_TABLE.preview, 0, k);
  return { order: readOrderFrom(core, ORDER_TABLE.preview, 0), hasTime: f(ORDER_FIELD.hasTime) === 1, staffing: line(f, ORDER_FIELD.staffing) };
}

export function readReply(core: Exports, kind: number): Reply {
  const n = core.hs_reply(5);
  return { kind: REPLY_KINDS[kind] ?? 'Y_None', ok: kind >= 1 && kind <= ACCEPTED_LAST,
    a: core.hs_reply(1), b: core.hs_reply(2), c: core.hs_reply(3), d: core.hs_reply(4),
    kept: Array.from({ length: n }, (_, i) => core.hs_reply(10 + i)), slot: core.hs_reply(6) };
}
export function issueDraft(core: Exports, d: Draft): Reply { stage(core, d); return readReply(core, core.hs_order_issue()); }
export function command(core: Exports, cmd: number, a: number, b = 0): Reply { return readReply(core, core.hs_command(cmd, a, b)); }

// ------------------------------------------------------------ places

/** The street names: an avenue's two flanking lines share one name. */
export interface Streets { cols: number[]; rows: number[] }
export function readStreets(core: Exports): Streets {
  const four = (base: number) => [0, 1, 2, 3].map(k => core.hs_count(base + k)).filter(v => v >= 0);
  return { cols: four(ORDER_COUNT.avenueCol), rows: four(ORDER_COUNT.avenueRow) };
}
export function avenueName(s: Streets, line: number) {
  const i = s.cols.includes(line - 1) ? line - 1 : line;
  return `${STREETS_NS[((i % STREETS_NS.length) + STREETS_NS.length) % STREETS_NS.length]} Ave`;
}
export function streetName(s: Streets, line: number) {
  const i = s.rows.includes(line - 1) ? line - 1 : line;
  return `${STREETS_EW[((i % STREETS_EW.length) + STREETS_EW.length) % STREETS_EW.length]} St`;
}

/** A building's name as the order lines give it: "Empty land" for empty lots. */
export function buildingName(core: Exports, b: number): string {
  if (b < 0) return 'nowhere';
  if (core.hs_get(TABLE.building, b, B_CLASS) === 0) return 'Empty land';
  return TYPE_NAMES[core.hs_get(TABLE.building, b, BUILDING_FIELD.type)] ?? 'unknown';
}

/** "Perfume Store on Archer St at Paulina Ave": the street the door is on and
 *  the nearest cross street; a lot with its own facing names only its street. */
export function placeName(core: Exports, city: City, streets: Streets, b: number): string {
  const name = buildingName(core, b);
  const lot = city.lots[core.hs_get(TABLE.building, b, BUILDING_FIELD.lot)];
  const blk = lot ? city.blocks[lot.block] : undefined;
  if (!lot || !blk) return name;
  // The Standard city (1.2.91's original plan) gives no lot a facing; the
  // other sizes face their module plots and civic sites.
  const faced = !city.standard && (blk.use === 2 || core.hs_get(TABLE.block, blk.id, BLOCK_MODULE) >= 0);
  if (faced) {
    const face = ['north', 'east', 'south', 'west'][lot.face];
    const x = blk.gx + (face === 'east' ? blk.spanX : 0), y = blk.gy + (face === 'south' ? blk.spanY : 0);
    return `${name} on ${face === 'east' || face === 'west' ? avenueName(streets, x) : streetName(streets, y)}`;
  }
  const col = lot.index % 3, row = Math.floor(lot.index / 3);
  const nearAve = col === 2 ? blk.gx + 1 : blk.gx, nearSt = row === 2 ? blk.gy + 1 : blk.gy;
  if (row === 1 && col !== 1) return `${name} on ${avenueName(streets, nearAve)} at ${streetName(streets, nearSt)}`;
  return `${name} on ${streetName(streets, nearSt)} at ${avenueName(streets, nearAve)}`;
}

/** The building on a lot, or -1. */
export function buildingOfLot(core: Exports, city: City, lot: number): number {
  // Lot field 7 is the building (Hood.Host_ABI F_Lot_Building).
  return lot >= 0 && lot < city.lots.length ? core.hs_get(TABLE.lot, lot, 7) : -1;
}

export const cityVersion = (core: Exports) => core.hs_count(ORDER_COUNT.cityVersion);
export const COUNT_WEEK = COUNT.week;

export { personName };
