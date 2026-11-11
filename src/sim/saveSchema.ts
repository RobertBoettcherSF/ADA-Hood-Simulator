import schema from './world-schema.json';
import type { WorldState } from './types';
import { yieldForInput } from '../yieldForInput';
import { blockRect } from './cityLayout';
import { tramCount, tramLineValid } from './trams';
import { BLOCK_MODULE_BY_ID, moduleFacing, moduleRect, moduleSetback } from './blockModules';
import { MAX_TEAM_SIZE, MINUTES_PER_WEEK, VEHICLES } from './constants';
import { onRoad, vehiclePathOnRoad } from './vehicleNavigation';
import { peopleList, buildingList } from './entityLists';

type Shape = { ref?: string; type?: string; literal?: unknown; union?: Shape[];
  array?: Shape; object?: [string, { optional: boolean; shape: Shape }][]; values?: Shape };
const defs = schema.defs as unknown as Record<string, Shape>;
export const SAVE_SCHEMA_VERSION = 2;

type Failure = { path: string; message: string };
type Property = NonNullable<Shape['object']>[number][1];
const propertyEntries = new WeakMap<Shape, [string, Property][]>();
// Union branches only need success/failure: their detailed errors are discarded.
const invalidBranch: Failure = { path: '', message: '' };
const failure = (message: string): Failure => ({ path: '', message });

function properties(shape: Shape): [string, Property][] {
  let entries = propertyEntries.get(shape);
  if (!entries) {
    // The generated schema is immutable during a page's lifetime.
    entries = shape.object ?? [];
    propertyEntries.set(shape, entries);
  }
  return entries;
}

function check(value: unknown, shape: Shape, depth = 0, details = true): Failure | null {
  if (depth > 80) return details ? failure('is too deeply nested') : invalidBranch;
  if (shape.ref) return check(value, defs[shape.ref], depth + 1, details);
  if ('literal' in shape) return value === shape.literal ? null : details ? failure('has an unsupported value') : invalidBranch;
  if (shape.type) {
    if (typeof value === shape.type && (shape.type !== 'number' || Number.isFinite(value))) return null;
    return details ? failure(`must be ${shape.type}`) : invalidBranch;
  }
  if (shape.union) {
    return shape.union.some(s => check(value, s, depth + 1, false) === null)
      ? null : details ? failure('has an invalid value') : invalidBranch;
  }
  if (shape.array) {
    if (!Array.isArray(value)) return details ? failure('must be a list') : invalidBranch;
    for (let i = 0; i < value.length; i++) {
      const error = check(value[i], shape.array, depth + 1, details);
      if (error) { if (details) error.path = `[${i}]${error.path}`; return error; }
    }
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return details ? failure('must be an object') : invalidBranch;
  const record = value as Record<string, unknown>;
  for (const [key, prop] of properties(shape)) {
    if (record[key] === undefined && prop.optional) continue;
    const error = check(record[key], prop.shape, depth + 1, details);
    if (error) { if (details) error.path = `.${key}${error.path}`; return error; }
  }
  if (shape.values) for (const [key, item] of Object.entries(record)) {
    const error = check(item, shape.values, depth + 1, details);
    if (error) { if (details) error.path = `.${key}${error.path}`; return error; }
  }
  return null;
}
// Split the root's collections into entities. Each entity still uses the exact
// synchronous checker, including union errors, property order and depth limits.
function* checkBatches(value: unknown, shape: Shape, depth = 0, levels = 0): Generator<void, Failure | null> {
  if (depth > 80 || levels >= 2 || shape.type || 'literal' in shape || shape.union) {
    const error = check(value, shape, depth);
    yield;
    return error;
  }
  if (shape.ref) return yield* checkBatches(value, defs[shape.ref], depth + 1, levels);
  if (shape.array) {
    if (!Array.isArray(value)) return failure('must be a list');
    for (let i = 0; i < value.length; i++) {
      const error = yield* checkBatches(value[i], shape.array, depth + 1, levels + 1);
      if (error) { error.path = `[${i}]${error.path}`; return error; }
    }
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return failure('must be an object');
  const record = value as Record<string, unknown>;
  for (const [key, prop] of properties(shape)) {
    if (record[key] === undefined && prop.optional) continue;
    const error = yield* checkBatches(record[key], prop.shape, depth + 1, levels + 1);
    if (error) { error.path = `.${key}${error.path}`; return error; }
  }
  if (shape.values) for (const [key, item] of Object.entries(record)) {
    const error = yield* checkBatches(item, shape.values, depth + 1, levels + 1);
    if (error) { error.path = `.${key}${error.path}`; return error; }
  }
  return null;
}

function validationInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Save does not contain a world.');
  const w = value as WorldState;
  if (w.schemaVersion != null && w.schemaVersion !== 1 && w.schemaVersion !== SAVE_SCHEMA_VERSION) throw Error('This save needs a different version of the game.');
  const legacy = w.schemaVersion == null || w.schemaVersion === 1;
  const candidate = { ...w, sequences: legacy ? w.sequences ?? { message: 1, crime: 1, court: 1 } : w.sequences };
  return { w, candidate };
}

function assertStructure(error: Failure | null): void {
  if (error) throw Error(`Cannot load save: world${error.path} ${error.message}.`);
}

function validateReferences(w: WorldState, candidate: WorldState): void {
  if (!Number.isInteger(w.week) || w.week < 1 || !Number.isInteger(w.minute) || w.minute < 0 || w.minute > 2400 ||
    !Number.isInteger(w.gridW) || !Number.isInteger(w.gridH) || w.gridW < 1 || w.gridH < 1 || w.blocks.length !== w.gridW * w.gridH) throw Error('Save has invalid world dimensions or clock.');
  const ids = (xs: number[]) => xs.every(id => Number.isSafeInteger(id) && id >= 0);
  const mayorTerm = w.election.mayorTerm;
  if (mayorTerm && (!ids([mayorTerm.personId]) || !w.people[mayorTerm.personId] ||
      !Number.isInteger(mayorTerm.weeks) || mayorTerm.weeks < 0 || mayorTerm.weeks >= 22))
    throw Error('Save has an invalid mayor election counter.');
  const race = w.targetRace;
  if (race && (race.mode !== w.options.mode || !w.gangs[race.gangId] ||
      race.target !== (race.mode === 'wealth' ? w.options.wealthTarget : w.options.territoryTarget) ||
      race.target < 1 || race.value < race.target ||
      race.mode === 'territory' && (!Number.isSafeInteger(race.target) || !Number.isSafeInteger(race.value)) ||
      !Number.isInteger(race.week) || race.week < 1 || race.week > w.week ||
      !Number.isInteger(race.minute) || race.minute < 0 || race.minute > MINUTES_PER_WEEK ||
      race.week === w.week && race.minute > w.minute || !ids(race.tiedGangIds) ||
      !race.tiedGangIds.includes(race.gangId) || new Set(race.tiedGangIds).size !== race.tiedGangIds.length ||
      race.tiedGangIds.some(id => !w.gangs[id]) ||
      w.phase === 'gameOver' && w.outcome?.won !== w.gangs[race.gangId].isPlayer))
    throw Error('Save has an invalid target-race result.');
  for (const map of [w.people, w.gangs, w.teams, w.buildings, w.lots, w.orders, w.cases, w.specialistJobs ?? {}]) {
    for (const [key, item] of Object.entries(map)) if (String(item.id) !== key || !ids([item.id])) throw Error('Save has invalid or mismatched entity IDs.');
  }
  if (Object.values(w.gangs).filter(g => g.isPlayer).length !== 1) throw Error('Save must contain exactly one player gang.');
  for (const g of Object.values(w.gangs)) if (!w.people[g.bossId] || g.teamIds.some(id => !w.teams[id])) throw Error('Save has a missing boss or crew.');
  for (const t of Object.values(w.teams)) if (!w.gangs[t.gangId] || !w.people[t.lieutenantId] || t.memberIds.some(id => !w.people[id])) throw Error('Save has a damaged crew roster.');
  const seats=new Set<number>();
  for(const [key,d] of Object.entries(w.goodsDeliveries??{})){
    if(key!==String(d.sourceId)||!w.buildings[d.sourceId]||!w.gangs[d.gangId]||
      d.targetId!=null&&!w.buildings[d.targetId]||!Number.isSafeInteger(d.amount)||d.amount<0||d.amount>VEHICLES.truck.cargo||
      (d.returning?d.amount!==0:d.amount===0)||d.targetId==null&&d.path.length>0||
      !onRoad(w,d.pos)||!vehiclePathOnRoad(w,d.pos,d.path))throw Error('Save has invalid business delivery cargo or route.');
  }
  for(const [key,v] of Object.entries(w.vehicleFleet??{})){
    const team=v.teamId==null?null:w.teams[v.teamId],staff=v.staffId==null?null:w.people[v.staffId];
    const validOwner=team?team.gangId===v.gangId&&key===`team:${team.id}:${v.kind}:${v.slot}`&&v.slot<(team.vehicles[v.kind]??0):
      staff?staff.gangId===v.gangId&&['accountant','lawyer'].includes(staff.role)&&key===`staff:${staff.id}`:
      !!w.gangs[v.gangId]&&key===`cache:${v.gangId}:${v.kind}:${v.slot}`&&v.slot<(w.gangs[v.gangId].vehicles[v.kind]??0);
    if(!validOwner||!Number.isInteger(v.slot)||v.slot<0||v.occupantIds.length>VEHICLES[v.kind].capacity||
      v.driverId!=null&&!v.occupantIds.includes(v.driverId)||v.occupantIds.length>0&&v.driverId==null||
      v.orderId!=null&&!w.orders[v.orderId])throw Error('Save has invalid vehicle ownership or seats.');
    for(const id of v.occupantIds){
      if(seats.has(id)||!w.people[id]||w.people[id].vehicleKey!==key)throw Error('Save has duplicate or missing vehicle passengers.');
      seats.add(id);
    }
    if(v.cargo&&(v.kind!=='truck'||!w.buildings[v.cargo.sourceId]||
      v.cargo.destinationId!=null&&!w.buildings[v.cargo.destinationId]||
      v.cargo.orderId!=null&&!w.orders[v.cargo.orderId]||Object.values(v.cargo.goods).some(n=>n<0)||
      v.cargo.purpose==='return'&&v.cargo.orderId!=null||
      v.cargo.purpose!=='return'&&(v.cargo.orderId==null||w.orders[v.cargo.orderId]?.type!==v.cargo.purpose||w.orders[v.cargo.orderId]?.gangId!==v.gangId)))throw Error('Save has invalid vehicle cargo.');
  }
  for(const p of Object.values(w.people))if(p.vehicleKey&&!w.vehicleFleet?.[p.vehicleKey]?.occupantIds.includes(p.id))throw Error('Save has a missing vehicle reservation.');
  for (const [i, b] of w.blocks.entries()) if (b.id !== i || b.lotIds.some(id => !w.lots[id])) throw Error('Save has damaged city blocks.');
  if (!w.cityLayout && w.blocks.some(b => b.layout)) throw Error('Save is missing its city layout.');
  if (w.cityLayout) {
    const streetInset = w.blocks[0]?.layout?.streetInset ?? 0;
    if (streetInset !== 0 && streetInset !== 3) throw Error('Save has invalid street clearance.');
    for (const b of w.blocks) {
      const l = b.layout;
      if ((l?.streetInset ?? 0) !== streetInset) throw Error('Save has inconsistent street clearance.');
      if (l?.module) {
        const m = BLOCK_MODULE_BY_ID[l.module.id], turn = l.module.turn;
        if (!m || !Number.isInteger(turn) || turn < 0 || turn > 3 || l.use !== 'urban' || l.mergedInto != null)
          throw Error('Save has an invalid block module.');
        const r = blockRect(b), size = moduleRect(m, turn, { x: 0, y: 0, w: m.width, h: m.depth });
        if (r.w !== size.w || r.h !== size.h || b.lotIds.length !== m.plots.length)
          throw Error('Save has an invalid block module footprint.');
        const used = new Set<number>();
        for (const id of b.lotIds) {
          const lot = w.lots[id], slot = m.plots.find(p => p.index === lot.index);
          if (!slot || used.has(slot.index)) throw Error('Save has damaged block module parcels.');
          used.add(slot.index);
          const p = moduleRect(m, turn, slot), bounds = lot.bounds;
          if (!bounds || Math.abs(bounds.x - r.x - p.x) > .001 || Math.abs(bounds.y - r.y - p.y) > .001 ||
            bounds.w !== p.w || bounds.h !== p.h || lot.facing !== moduleFacing(slot.facing, turn) ||
            Math.abs(lot.center.x - r.x - p.x - p.w / 2) > .001 || Math.abs(lot.center.y - r.y - p.y - p.h / 2) > .001)
            throw Error('Save has displaced block module parcels.');
          const margin = moduleSetback(slot);
          if (!lot.footprint || Math.abs(lot.footprint.w - (p.w - margin * 2)) > .001 ||
            Math.abs(lot.footprint.h - (p.h - margin * 2)) > .001) throw Error('Save has a damaged block module envelope.');
        }
      }
      if (!l) continue;
      if (![l.spanX, l.spanY].every(n => Number.isSafeInteger(n) && n >= 1 && n <= 4) ||
        b.gx + l.spanX > w.gridW || b.gy + l.spanY > w.gridH) throw Error('Save has invalid city sites.');
      if (l.mergedInto != null) {
        const root = w.blocks[l.mergedInto];
        if (!root?.layout || root.layout.mergedInto != null || b.lotIds.length || b.gx < root.gx || b.gy < root.gy ||
          b.gx >= root.gx + root.layout.spanX || b.gy >= root.gy + root.layout.spanY) throw Error('Save has damaged joined blocks.');
      } else {
        for (let y = b.gy; y < b.gy + l.spanY; y++) for (let x = b.gx; x < b.gx + l.spanX; x++) {
          const cell = w.blocks[y * w.gridW + x];
          if (cell !== b && cell.layout?.mergedInto !== b.id) throw Error('Save has overlapping city sites.');
        }
      }
    }
    for (const lot of Object.values(w.lots)) {
      if (!w.blocks[lot.blockId]?.lotIds.includes(lot.id)) throw Error('Save has an orphan parcel.');
      const r = lot.bounds;
      if (r && (r.w <= 0 || r.h <= 0 || r.x < 0 || r.y < 0 || r.x + r.w > w.gridW * 54 || r.y + r.h > w.gridH * 54))
        throw Error('Save has invalid parcel bounds.');
      if (lot.footprint && (!r || lot.footprint.w <= 0 || lot.footprint.h <= 0 ||
        lot.footprint.w > r.w || lot.footprint.h > r.h)) throw Error('Save has invalid building envelope.');
    }
    // The original 40 x 32 city: its generator data must stay consistent.
    const original = w.cityLayout.original;
    if (original) {
      if (w.gridW !== 40 || w.gridH !== 32) throw Error('Save has an original city of the wrong size.');
      const inRange = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
      if (w.blocks.some(b => !b.original || !inRange(b.original.content, 0, 80) || !inRange(b.original.landValue, 0, 255)))
        throw Error('Save has damaged original block data.');
      if (original.avenues.cols.length !== 4 || original.avenues.rows.length !== 4 ||
        original.avenues.cols.some(x => !inRange(x, 0, w.gridW - 1)) || original.avenues.rows.some(y => !inRange(y, 0, w.gridH - 1)))
        throw Error('Save has invalid original avenues.');
      if (w.blocks.some(b => (b.layout?.use === 'avenue' || b.layout?.use === 'water') && b.lotIds.length))
        throw Error('Save has parcels on avenues or water.');
    } else if (w.blocks.some(b => b.original)) throw Error('Save has original block data without an original city.');
    for (const line of w.cityLayout.tramLines) {
      if (line.points.length < 2 || line.points.some(p => p.x < 0 || p.y < 0 || p.x > w.gridW * 54 || p.y > w.gridH * 54))
        throw Error('Save has invalid tram routes.');
      // Original city: down the middle of an avenue; elsewhere along open streets.
      if (!tramLineValid(w, line)) throw Error('Save has a tram route outside its streets.');
    }
  }
  // Tram riding is the original city's (tramRiding.ts): each tram's minutes
  // stood, and every ride on a tram the city runs.
  const trams = w.cityLayout?.original ? tramCount(w) : 0;
  if (w.trams && (!trams || w.trams.delay.length !== trams || w.trams.halted.length !== trams ||
      w.trams.delay.some(d => !Number.isInteger(d) || d < 0))) throw Error('Save has an invalid tram timetable.');
  for (const p of peopleList(w)) if (p.tram && (!Number.isInteger(p.tram.tram) || p.tram.tram < 0 || p.tram.tram >= trams ||
      !Number.isInteger(p.tram.since) || p.tram.since < 0 || p.inVehicle)) throw Error('Save has an invalid tram ride.');
  for (const p of peopleList(w)) for (const channel of [p.hostility, p.fear]) {
    if (channel && Object.entries(channel).some(([id, v]) => !w.gangs[Number(id)] || !Number.isInteger(v) || v < 0 || v > 255))
      throw Error('Save has invalid hostility or fear.');
  }
  if (w.election.beganInWeek && !w.election.active) throw Error('Save has an election guard without an election.');
  if (w.fbiZeal != null && (!Number.isInteger(w.fbiZeal) || w.fbiZeal < 128 || w.fbiZeal > 207))
    throw Error('Save has an invalid FBI zeal.');
  if (w.fbiCrackdownDue != null && typeof w.fbiCrackdownDue !== 'boolean') throw Error('Save has an invalid FBI crackdown flag.');
  for (const g of Object.values(w.gangs)) {
    const byte = (v: number) => Number.isInteger(v) && v >= 0 && v <= 255;
    if (g.aiProfile && (g.aiProfile.length !== 7 || !g.aiProfile.every(byte) || g.aiProfile[6] > 2))
      throw Error('Save has an invalid AI profile.');
    for (const table of [g.aiHostility, g.aiHostilitySnapshot]) if (table && Object.entries(table)
      .some(([id, v]) => !w.gangs[Number(id)] || !byte(v))) throw Error('Save has invalid AI hostility.');
    if (g.fbiTotal != null && !byte(g.fbiTotal)) throw Error('Save has an invalid FBI suspicion total.');
    if (g.fbiWeekRise != null && !byte(g.fbiWeekRise)) throw Error('Save has an invalid FBI weekly rise.');
    if (g.fbiRaidWeek != null && (!Number.isInteger(g.fbiRaidWeek) || g.fbiRaidWeek < 1 || g.fbiRaidWeek > w.week + 1))
      throw Error('Save has an invalid FBI raid week.');
  }
  for (const b of buildingList(w)) {
    const production=b.goodsProduction;
    if(Object.values(b.stock).some(n=>n<0)||production&&(!Number.isInteger(production.week)||production.week<1||production.week>w.week||
      !Number.isInteger(production.day)||production.day<0||production.day>4||production.remainder<0||production.remainder>=1))throw Error('Save has invalid goods stock or production.');
    if (!w.lots[b.lotId] || !w.blocks[b.blockId]) throw Error('Save has a building outside the city.');
    if (b.acquisitionCost != null && b.acquisitionCost < 0) throw Error('Save has an invalid property cost basis.');
    for (const week of [b.ceasedWeek,b.fbiDiscoveredWeek,b.fbiClosedWeek,b.fbiSearchedWeek,b.launderingWeek]) {
      if (week != null && (!Number.isInteger(week) || week < 1 || week > w.week)) throw Error('Save has an invalid business history week.');
    }
    if (b.resumeTradingWeek != null && (!Number.isInteger(b.resumeTradingWeek) || b.resumeTradingWeek <= w.week ||
        b.state !== 'ceased' || b.ceasedWeek == null || b.resumeTradingWeek !== b.ceasedWeek+1 || b.fbiClosedWeek != null))
      throw Error('Save has an invalid trading restart.');
    if (b.fbiRaidWeek != null && (!Number.isInteger(b.fbiRaidWeek) || b.fbiDiscoveredWeek == null ||
        b.fbiRaidWeek !== b.fbiDiscoveredWeek+1 || !b.discovered || b.fbiClosedWeek != null))
      throw Error('Save has an invalid FBI raid schedule.');
    if (b.fbiClosedWeek != null && (!b.discovered || b.state === 'trading')) throw Error('Save has an invalid FBI closure.');
    if (b.fireWeek!=null&&(!Number.isInteger(b.fireWeek)||b.fireWeek<1||b.fireWeek>w.week)) throw Error('Save has an invalid fire-damage week.');
    if (b.repairCompleteWeek!=null&&(!Number.isInteger(b.repairCompleteWeek)||b.repairCompleteWeek<=w.week||b.state!=='damaged'||b.fireWeek==null)) throw Error('Save has an invalid fire-repair schedule.');
  }
  for (const p of peopleList(w)) {
    if (p.gangId != null && !w.gangs[p.gangId]) throw Error('Save has a person in a missing gang.');
    if (p.taxRecords && (p.role !== 'accountant' || Object.entries(p.taxRecords).some(([id, n]) => !w.gangs[Number(id)] || n < 0)))
      throw Error('Save has invalid accountant tax records.');
    if (p.taxEvasionWeeks && (p.role !== 'accountant' || !Array.isArray(p.taxEvasionWeeks) || p.taxEvasionWeeks.length > 16 ||
        p.taxEvasionWeeks.some(n => !Number.isInteger(n) || n < 0))) throw Error('Save has an invalid accountant evasion history.');
    // An accountant's warrant (his check) or any member's (the member pass);
    // it stays with a man who is promoted or leaves.
    if (p.fbiWarrant != null && typeof p.fbiWarrant !== 'boolean') throw Error('Save has an invalid FBI warrant.');
    if (p.crimeSuspicion != null && (!Number.isInteger(p.crimeSuspicion) || p.crimeSuspicion < 1 || p.crimeSuspicion > 0x7FFF))
      throw Error('Save has an invalid personal FBI suspicion.');
    if (p.fbiAgentZeal != null && (!Number.isInteger(p.fbiAgentZeal) || p.fbiAgentZeal < 128 || p.fbiAgentZeal > 255 || p.role !== 'fbi'))
      throw Error('Save has an invalid FBI agent zeal.');
    const f = p.fbiAssignment;
    if (f && (p.role !== 'fbi' || !w.fbiIds.includes(p.id) || !w.buildings[f.buildingId] ||
        !Number.isInteger(f.assignedWeek) || f.assignedWeek < 1 || f.assignedWeek > w.week ||
        !Number.isInteger(f.searchPoint) || f.searchPoint < 0 || f.searchPoint > (f.kind === 'search' ? 2 : 0) ||
        f.workLeft < 0 || f.workLeft > (f.kind === 'search' ? 20 : 10))) throw Error('Save has an invalid FBI assignment.');
    if (p.retainerShort != null && (typeof p.retainerShort !== 'boolean' || p.role !== 'police' || p.employedBy == null))
      throw Error('Save has an invalid retainer flag.');
    const e=p.burningEscape,r=p.emergencyResponse,s=p.shockReaction;
    if(e&&(!Number.isInteger(e.week)||e.week<1||e.week>w.week||!w.buildings[e.buildingId]||e.startMinute<0))throw Error('Save has an invalid burning escape.');
    if(r&&(!Number.isInteger(r.week)||r.week<1||r.week>w.week||!w.buildings[r.buildingId]||r.startMinute<0||r.untilMinute<=r.startMinute))throw Error('Save has an invalid emergency response.');
    if(s&&(!Number.isInteger(s.week)||s.week<1||s.week>w.week||!w.people[s.victimId]||s.startMinute<0||s.untilMinute<=s.startMinute))throw Error('Save has an invalid shock reaction.');
  }
  for (const o of [...Object.values(w.orders), ...w.lastWeekOrders]) {
    if (o.workedMinutes != null && (o.workedMinutes < 0 || o.workedMinutes > MINUTES_PER_WEEK))
      throw Error('Save has an invalid order duty duration.');
    if (o.reportedCrewSize != null && (!Number.isSafeInteger(o.reportedCrewSize) || o.reportedCrewSize < 1 || o.reportedCrewSize > MAX_TEAM_SIZE))
      throw Error('Save has an invalid order crew count.');
    if (o.refusals?.some(r => !Number.isSafeInteger(r.line) || r.line < 0 || r.line >= o.results.length || !w.buildings[r.buildingId]))
      throw Error('Save has an invalid order refusal.');
  }
  for (const o of Object.values(w.orders)) {
    if (!w.teams[o.teamId] || !w.gangs[o.gangId]) throw Error('Save has an order for a missing crew.');
    if (o.ambushTargetId != null && (o.type !== 'ambush' || !w.people[o.ambushTargetId]))
      throw Error('Save has an invalid ambush target.');
    if ((o.huntHallId != null && !w.buildings[o.huntHallId]) || o.huntVisitedIds?.some(id => !w.buildings[id]) ||
      (o.huntLeg != null && !o.huntTip))
      throw Error('Save has an invalid hunt.');
    const cargo = o.exportDelivery;
    if(o.raidDelivery&&(o.type!=='raid'||!w.buildings[o.raidDelivery.warehouseId]))throw Error('Save has an invalid raid delivery.');
    if(o.exportPending&&(o.type!=='export'||!w.buildings[o.exportPending.warehouseId]||Object.values(o.exportPending.goods).some(n=>n<0)))throw Error('Save has invalid pending export goods.');
    if (cargo && (o.type !== 'export' || !['travelling', 'executing', 'waiting'].includes(o.state) ||
      !w.buildings[cargo.warehouseId] || !w.buildings[cargo.terminalId] ||
      ![0.55, 1].includes(cargo.rate) || Object.values(cargo.goods).some(n => !Number.isFinite(n) || n < 0)))
      throw Error('Save has an invalid export shipment.');
    if(cargo?.vehicleKeys){
      const sums={liquor:0,stolen:0,counterfeit:0};
      if(new Set(cargo.vehicleKeys).size!==cargo.vehicleKeys.length)throw Error('Save has duplicate export trucks.');
      for(const key of cargo.vehicleKeys){const v=w.vehicleFleet?.[key];
        if(!v?.cargo||v.cargo.orderId!==o.id||v.cargo.purpose!=='export')throw Error('Save has a missing export truck load.');
        for(const k of Object.keys(sums) as (keyof typeof sums)[])sums[k]+=v.cargo.goods[k];
      }
      if(Object.keys(sums).some(k=>sums[k as keyof typeof sums]!==cargo.goods[k as keyof typeof sums]))throw Error('Save has inconsistent export cargo.');
    }
  }
  if (!Number.isSafeInteger(w.nextId) || w.nextId < 1 || Object.values(candidate.sequences).some(n => !Number.isSafeInteger(n) || n < 1)) throw Error('Save has invalid sequence counters.');
  for (const j of Object.values(w.specialistJobs ?? {})) {
    if (!w.gangs[j.gangId] || !w.people[j.actorId] || (j.targetPersonId != null && !w.people[j.targetPersonId]) ||
      j.blockIds.some(id => !w.blocks[id]) || !ids(j.visitedPersonIds) || j.visitedPersonIds.some(id => !w.people[id]) ||
      !Number.isInteger(j.week) || j.week < 1 || j.week > w.week || j.quotedPrice < 0 || j.workLeft < 0 ||
      !Number.isInteger(j.completed) || j.completed < 0 || !Number.isInteger(j.patrolIndex) || j.patrolIndex < 0 ||
      (j.targetPersonId == null && (j.type !== 'employPolice' || !j.blockIds.length))) throw Error('Save has an invalid specialist job.');
  }
  for (const [id, t] of Object.entries(w.personTakings ?? {})) {
    // Businesses can run at a loss; skimming still cannot increase what is handed over.
    if (!w.people[Number(id)] || !Number.isInteger(t.week) || t.week < 1 || t.week > w.week || t.declared > t.gross)
      throw Error('Save has invalid audit takings.');
  }
  for (const g of Object.values(w.gangs)) {
    if(g.history.some(p=>p.cash!=null&&p.assets<0))throw Error('Save has invalid asset history.');
    if (g.scorePeaks && (g.scorePeaks.cash < 0 || !Number.isSafeInteger(g.scorePeaks.territory) ||
      g.scorePeaks.territory < 0 || !Number.isSafeInteger(g.scorePeaks.manpower) || g.scorePeaks.manpower < 0))
      throw Error('Save has invalid score peaks.');
    if (g.exposedTax != null && (g.exposedTax < 0 || g.exposedTax > g.uncoveredTax)) throw Error('Save has invalid disclosed tax.');
    for (const report of [g.finances, g.lastFinanceReport]) {
      if (report?.riskyIncome != null && report.riskyIncome < 0) throw Error('Save has invalid risky income.');
      if (report?.closedSiteUpkeep != null && (report.closedSiteUpkeep < 0 || report.closedSiteUpkeep > report.costs.upkeep))
        throw Error('Save has invalid closed-site upkeep.');
      if (report?.campaignCost != null && (!Number.isSafeInteger(report.campaignCost) || report.campaignCost < 0 ||
          report.campaignCost + (report.closedSiteUpkeep ?? 0) > report.costs.upkeep))
        throw Error('Save has invalid campaign costs.');
    }
  }
  const largestEntityId = [w.people, w.gangs, w.teams, w.buildings, w.lots, w.orders, w.specialistJobs ?? {}]
    .reduce((max, map) => Object.values(map).reduce((n, item) => Math.max(n, item.id), max), 0);
  if (w.nextId <= largestEntityId) throw Error('Save would reuse an existing entity ID.');
  for (const records of [w.messages, w.crimes]) {
    if (records.some(r => !Number.isSafeInteger(r.id) || r.id < 1) || new Set(records.map(r => r.id)).size !== records.length)
      throw Error('Save has invalid or repeated event IDs.');
  }
  if (w.phase === 'gameOver' && !w.outcome) throw Error('Finished save is missing its outcome.');
}

/** Validate before installing a world; migration only adds known legacy fields. */
export function validateSaveWorld(value: unknown): asserts value is WorldState {
  const { w, candidate } = validationInput(value);
  assertStructure(check(candidate, schema.root));
  validateReferences(w, candidate);
}

/** The caller owns this snapshot and must not mutate it during validation. */
export async function validateSaveWorldResponsive(value: unknown, signal?: AbortSignal): Promise<WorldState> {
  signal?.throwIfAborted();
  const { w, candidate } = validationInput(value);
  const checks = checkBatches(candidate, schema.root);
  let deadline = performance.now() + 6;
  let step = checks.next();
  while (!step.done) {
    if (performance.now() >= deadline) {
      await yieldForInput();
      signal?.throwIfAborted();
      deadline = performance.now() + 6;
    }
    step = checks.next();
  }
  assertStructure(step.value);
  // Keep the final cross-entity pass out of the last structural batch.
  await yieldForInput();
  signal?.throwIfAborted();
  validateReferences(w, candidate);
  return w;
}
