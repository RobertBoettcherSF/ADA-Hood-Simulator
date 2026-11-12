/**
 * The small card a right-click (or a long press) opens on the street and the
 * city plan. It only reads the city. It does not give an order or spend time.
 */
import { deviceIsPhone } from '../app/device';
import { CELL, DAYS_PER_WEEK, ORDERS } from '../sim/constants';
import { cityBlockAt, lotRect } from '../sim/cityLayout';
import { BUILDING_BY_ID } from '../sim/data/buildings';
import { businessCarryingCost } from '../sim/businessState';
import { cargoActivity } from '../sim/cargo';
import { peopleList } from '../sim/entityLists';
import { buildingMapIntel, personMapPosition } from '../sim/mapIntel';
import { clampFloors, RENTED_ROOMS_DAILY_RENT } from '../sim/rentedRooms';
import type { Building, ID, Person, Vec2, WorldState } from '../sim/types';
import type { PickResult } from '../render/scene';
import { money } from '../sim/world';

export interface InspectRow {
  label: string;
  value: string;
}

export interface InspectFacts {
  title: string;
  rows: InspectRow[];
}

const LONG_PRESS_MS = 550;

/** A finger held still on a phone. A mouse click does not arm it. */
export class PressWatch {
  private timer: ReturnType<typeof setTimeout> | 0 = 0;
  private x = 0;
  private y = 0;
  opened = false;

  arm(e: { button: number; pointerType: string; clientX: number; clientY: number }, open: () => void): void {
    this.cancel();
    this.opened = false;
    if (e.button !== 0) return;
    if (!deviceIsPhone() && e.pointerType !== 'touch') return;
    this.x = e.clientX;
    this.y = e.clientY;
    this.timer = globalThis.setTimeout(() => {
      this.timer = 0;
      this.opened = true;
      open();
    }, LONG_PRESS_MS);
  }

  move(x: number, y: number): void {
    if (this.timer && Math.hypot(x - this.x, y - this.y) > 10) this.cancel();
  }

  cancel(): void {
    if (this.timer) globalThis.clearTimeout(this.timer);
    this.timer = 0;
  }

  /** The press is over. True when a long press already opened the card, so the click underneath is ignored. */
  finish(): boolean {
    this.cancel();
    const opened = this.opened;
    this.opened = false;
    return opened;
  }
}

export interface InspectPlacement {
  x: number;
  y: number;
  hit: PickResult;
  /** The owner's card for the premises under the click rather than the business card. */
  view?: 'owner';
}

let placement: InspectPlacement | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function inspectPlacement(): InspectPlacement | null {
  return placement;
}

export function onInspect(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function openInspect(x: number, y: number, hit: PickResult, view?: 'owner'): void {
  placement = { x, y, hit, view };
  emit();
}

export function closeInspect(): void {
  if (!placement) return;
  placement = null;
  emit();
}

/** Open the card when the click landed on a building, lot, or person. Otherwise put it away. */
export function showInspect(x: number, y: number, w: WorldState, viewer: ID, hit: PickResult): void {
  if (!inspectFacts(w, viewer, hit)) closeInspect();
  else openInspect(x, y, hit);
}

/** The premises last right-clicked on the office plan, and which card it showed. */
let cycle: { buildingId: ID; step: number } | null = null;

/**
 * The office plan's right-click: on premises the first click shows the business
 * card, a second on the same premises the owner's card, then back again. Off
 * premises it shows whoever is under the pointer, as before.
 */
export function cycleInspect(x: number, y: number, w: WorldState, viewer: ID, hit: PickResult): void {
  const building = hit.buildingId != null ? w.buildings[hit.buildingId] : buildingUnder(w, hit.point);
  if (!building) {
    cycle = null;
    showInspect(x, y, w, viewer, hit);
    return;
  }
  const step = cycle && cycle.buildingId === building.id ? (cycle.step + 1) % 2 : 0;
  cycle = { buildingId: building.id, step };
  openInspect(x, y, { ...hit, buildingId: building.id, personId: null }, step === 1 ? 'owner' : undefined);
}

/** Forget the cycle (tests, or a new city). */
export function resetInspectCycle(): void { cycle = null; }

export function inspectFacts(w: WorldState, viewer: ID, hit: PickResult, view?: 'owner'): InspectFacts | null {
  if (view === 'owner') {
    const building = hit.buildingId != null ? w.buildings[hit.buildingId] : buildingUnder(w, hit.point);
    if (building) return ownerFacts(w, viewer, building);
  }
  if (hit.personId != null) {
    const person = w.people[hit.personId];
    if (person && person.status !== 'dead') return personFacts(w, person);
  }
  const building = hit.buildingId != null ? w.buildings[hit.buildingId] : buildingUnder(w, hit.point);
  if (!building) return null;
  return placeFacts(w, viewer, building);
}

/** The person drawn nearest the plan pixel, using only the position that gang's map is allowed to show. */
export function personOnPlan(w: WorldState, viewer: ID, project: (pos: Vec2) => { x: number; y: number }, px: number, py: number): ID | null {
  let best: ID | null = null;
  let distance = 8;
  for (const person of peopleList(w)) {
    if (person.status === 'dead' || person.status === 'jailed') continue;
    const pos = personMapPosition(w, viewer, person);
    if (!pos) continue;
    const at = project(pos);
    const d = Math.hypot(at.x - px, at.y - py);
    if (d <= distance) { distance = d; best = person.id; }
  }
  return best;
}

function personFacts(w: WorldState, person: Person): InspectFacts {
  const gang = person.gangId != null ? w.gangs[person.gangId]?.name : null;
  return {
    title: person.name,
    rows: [
      { label: 'Gang', value: gang ?? 'None' },
      { label: 'Order', value: currentOrder(w, person) },
    ],
  };
}

/** Who owns the premises, as far as the viewer knows. */
export function ownerFacts(w: WorldState, viewer: ID, building: Building): InspectFacts {
  const intel = buildingMapIntel(building, viewer);
  const place = !intel.siteKnown ? 'Unknown premises' : BUILDING_BY_ID[building.typeId]?.name ?? (building.cls === 'empty' ? 'Empty lot' : 'Premises');
  const gangId = building.ownerGangId === viewer ? viewer : intel.ownerGangId;
  if (intel.siteKnown && gangId != null && w.gangs[gangId]) {
    const gang = w.gangs[gangId];
    return {
      title: gang.name,
      rows: [
        { label: 'Owner of', value: place },
        { label: 'Boss', value: w.people[gang.bossId]?.name ?? 'Unknown' },
        { label: 'Kind', value: gangId === viewer ? 'Your gang' : 'A gang' },
      ],
    };
  }
  const knowledge = building.knowledge[viewer] ?? 0;
  const person = building.ownerPersonId != null ? w.people[building.ownerPersonId] : undefined;
  if (intel.siteKnown && person && knowledge >= 2 && building.ownerGangId == null) {
    return { title: person.name, rows: [{ label: 'Owner of', value: place }, ...personFacts(w, person).rows] };
  }
  const nobody = intel.siteKnown && building.ownerGangId == null && building.ownerPersonId == null;
  return {
    title: nobody ? 'No owner' : 'Owner unknown',
    rows: [
      { label: 'Owner of', value: place },
      { label: 'Owner', value: nobody ? 'Nobody' : 'Unknown until the place is extorted or explored' },
    ],
  };
}

function placeFacts(w: WorldState, viewer: ID, building: Building): InspectFacts {
  const intel = buildingMapIntel(building, viewer);
  const type = BUILDING_BY_ID[building.typeId];
  const business = !intel.siteKnown ? 'Unknown' : type?.name ?? (building.cls === 'empty' ? 'Empty land' : 'Premises');
  const owned = building.ownerGangId === viewer;
  return {
    title: building.cls === 'empty' ? 'Empty lot' : business,
    rows: [
      { label: 'Business', value: business },
      { label: 'Owner', value: ownerOf(w, viewer, building) },
      ...(owned ? ownedWeek(w, building) : [moneyRow(w, viewer, building)]),
      { label: 'Inside', value: intel.siteKnown ? insideNames(w, building) : 'Unknown' },
    ],
  };
}

/** The player's own site: last week's books, not a protection note. */
function ownedWeek(w: WorldState, building: Building): InspectRow[] {
  // A trading week's stored result is already net of running the site. A gain is
  // income; a loss is the cost. A closed site still pays its carrying cost.
  const net = building.lastProfit;
  const carrying = building.state === 'ceased' ? businessCarryingCost(building, w.blocks[building.blockId]?.landValue) : 0;
  const income = Math.max(0, net);
  const costs = Math.max(0, -net) + carrying;
  const hidden = building.hidesId != null ? w.buildings[building.hidesId] : null;
  const rows: InspectRow[] = [
    { label: 'Income', value: money(income) },
    { label: 'Costs', value: money(costs) },
    { label: 'Profit/loss', value: money(income - costs) },
  ];
  if (hidden && hidden.cls === 'illegal') {
    const name = BUILDING_BY_ID[hidden.typeId]?.name ?? 'Illegal business';
    rows.push({ label: 'Hidden business', value: `${name}, last week ${money(hidden.lastProfit)}` });
  }
  return rows;
}

function ownerOf(w: WorldState, viewer: ID, building: Building): string {
  const intel = buildingMapIntel(building, viewer);
  if (!intel.siteKnown) return 'Unknown';
  if (intel.ownerGangId != null) return w.gangs[intel.ownerGangId]?.name ?? 'Unknown';
  const knowledge = building.ownerGangId === viewer ? 4 : (building.knowledge[viewer] ?? 0);
  if (building.ownerPersonId != null && knowledge >= 2 && building.ownerGangId == null) {
    return w.people[building.ownerPersonId]?.name ?? 'A private owner';
  }
  if (building.ownerGangId == null && building.ownerPersonId == null) return 'Nobody';
  return 'Unknown';
}

function moneyRow(w: WorldState, viewer: ID, building: Building): InspectRow {
  const intel = buildingMapIntel(building, viewer);
  if (intel.protectionGangId != null && building.protection) {
    const who = w.gangs[building.protection.gangId]?.name ?? 'a gang';
    return { label: 'Protection', value: `${money(building.protection.weekly)}/wk to ${who}` };
  }
  const rent = intel.siteKnown ? weeklyRent(w, building) : null;
  if (rent != null) return { label: 'Rent', value: `${money(rent)}/wk` };
  return { label: 'Protection', value: intel.siteKnown ? 'None' : 'Unknown' };
}

function weeklyRent(w: WorldState, building: Building): number | null {
  if (building.typeId === 'rentedRooms' && building.state === 'trading') {
    const floors = clampFloors(building.roomsFloors);
    const tenants = (building.roomsTenants ?? []).slice(0, floors);
    const occupied = (tenants.length ? tenants : Array.from({ length: floors }, () => ({ budget: 0 }))).filter((t) => t.budget != null).length;
    const block = w.blocks[building.blockId];
    const location = 0.8 + (block?.landValue ?? 40) / 250;
    const daily = Math.max(1, Math.round(RENTED_ROOMS_DAILY_RENT * location));
    return daily * occupied * DAYS_PER_WEEK;
  }
  if ((building.cls === 'tenement' || building.cls === 'residential') && building.state !== 'destroyed') {
    const profit = BUILDING_BY_ID[building.typeId]?.profit ?? 0;
    return profit > 0 ? profit : null;
  }
  return null;
}

function insideNames(w: WorldState, building: Building): string {
  const names = peopleList(w)
    .filter((p) => p.buildingId === building.id && p.status === 'active')
    .map((p) => p.name)
    .sort((a, b) => a.localeCompare(b));
  if (!names.length) return 'Nobody';
  if (names.length <= 4) return names.join(', ');
  return `${names.slice(0, 4).join(', ')}, and ${names.length - 4} more`;
}

function buildingUnder(w: WorldState, point: Vec2): Building | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const block = cityBlockAt(w, Math.floor(point.x / CELL), Math.floor(point.y / CELL));
  if (!block) return null;
  for (const id of block.lotIds) {
    const lot = w.lots[id];
    const r = lotRect(lot);
    if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) {
      return w.buildings[lot.buildingId] ?? null;
    }
  }
  return null;
}

function currentOrder(w: WorldState, person: Person): string {
  const staff = Object.values(w.specialistJobs ?? {}).find((job) => job.actorId === person.id && job.week === w.week && (job.state === 'travelling' || job.state === 'working'));
  if (staff) {
    if (staff.paused) return 'Waiting';
    if (staff.type === 'audit') return 'Audit';
    if (staff.type === 'bribeOfficials') return 'Bribe Officials';
    return 'Employ Police';
  }
  if (person.streetOrder) return { goTo: 'Go to', kill: 'Kill', assault: 'Assault', tail: 'Tail' }[person.streetOrder.type];
  const order = person.orderId == null ? null : w.orders[person.orderId];
  if (order?.state === 'waiting') return 'Waiting';
  return cargoActivity(w, person) ?? (order ? ORDERS[order.type].name : person.dest ? 'Travelling' : 'Idle');
}
