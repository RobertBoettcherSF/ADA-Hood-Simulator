import type { ApiResult } from './api';
import { blockPavement, cityBlockAt } from './cityLayout';
import { newId } from './citygen';
import { CELL } from './constants';
import { addMessage } from './events';
import { clearDestination, setDestination, stepPerson } from './movement';
import { bribePrice, completeOfficialBribe, completePoliceEmployment, isBribableOfficial } from './officials';
import { availableSpecialist } from './specialists';
import { trafficContext } from './traffic';
import { dismount, sendHome, startStaffJourney, vehicleOf } from './transport';
import type { Gang, ID, Person, SpecialistJob, Vec2, WorldState } from './types';
import { allBuildings, buildingDoor, dist } from './world';
import { quitGangPayroll } from './payrollMark';

export const SPECIALIST_JOB_NAMES = { audit: 'Audit', bribeOfficials: 'Bribe Officials', employPolice: 'Employ Police' };
export const specialistJobActive = (j: SpecialistJob) => ['queued', 'travelling', 'working'].includes(j.state);
const roleFor = (j: Pick<SpecialistJob, 'type'>) => j.type === 'audit' ? 'accountant' : 'lawyer';
const workMinutes = (j: SpecialistJob) => j.type === 'audit' ? 30 : 5;

/** The inspection is followed by bookkeeping at HQ until Friday's report. */
export function reservedAudit(w: WorldState, gangId: ID): SpecialistJob | undefined {
  return Object.values(w.specialistJobs ?? {}).find(j => j.gangId === gangId && j.week === w.week &&
    j.type === 'audit' && (specialistJobActive(j) || j.state === 'done'));
}

export function specialistTargetEligible(w: WorldState, gangId: ID, type: SpecialistJob['type'], p: Person): boolean {
  if (p.status !== 'active' && !(type === 'audit' && p.status === 'onTrial')) return false;
  if (type === 'bribeOfficials') return isBribableOfficial(p);
  if (type === 'employPolice') return p.role === 'police' && p.employedBy == null && !quitGangPayroll(p, gangId);
  if (p.gangId !== gangId || !['hood', 'lieutenant'].includes(p.role)) return false;
  return (w.gangs[gangId]?.teamIds.some(id => w.teams[id]?.lieutenantId === p.id) ?? false) ||
    allBuildings(w).some(b => b.ownerGangId === gangId && b.managerId === p.id);
}

export function queueSpecialistJob(w: WorldState, gangId: ID, type: SpecialistJob['type'], targetPersonId: ID | null, blockIds: ID[] = [], maxHires?: number): ApiResult {
  const gang = w.gangs[gangId];
  if (!gang) return { ok: false, error: 'No such gang.' };
  const actor = availableSpecialist(w, gang, roleFor({ type }));
  if (!actor) return { ok: false, error: `You need an available ${roleFor({ type })}.` };
  const blocks = [...new Set(blockIds.map(id => w.blocks[id]?.layout?.mergedInto ?? id))];
  if (blocks.some(id => !w.blocks[id])) return { ok: false, error: 'Choose valid blocks for the tour.' };
  const target = targetPersonId == null ? null : w.people[targetPersonId];
  if (targetPersonId != null && (!target || !specialistTargetEligible(w, gangId, type, target)))
    return { ok: false, error: 'That person is not an available target for this order.' };
  if (!target && (type !== 'employPolice' || !blocks.length)) return { ok: false, error: 'Choose a target or tour area.' };
  if (maxHires != null && (!Number.isInteger(maxHires) || maxHires < 1)) return { ok: false, error: 'No officer may be hired.' };
  const price = type === 'bribeOfficials' ? bribePrice(w, target!, gangId) : 0;
  if (price > gang.cash) return { ok: false, error: `That will cost ${price.toLocaleString('en-US')}.` };
  const pending = Object.values(w.specialistJobs ?? {}).filter(j => j.gangId === gangId && j.week === w.week && specialistJobActive(j));
  const audit = type === 'audit' ? reservedAudit(w, gangId) : null;
  if (audit && audit.state !== 'queued') return { ok: false, error: 'Audit reserves the accountant for the whole week. The report is due at week\'s end.' };
  if (pending.filter(j => j.actorId === actor.id).length >= 16 && !audit) return { ok: false, error: 'That specialist already has a full job list.' };
  if (type === 'employPolice' && pending.some(j => j.type === type && j.targetPersonId === targetPersonId && j.blockIds.join() === blocks.join()))
    return { ok: true, message: 'That police visit is already scheduled.' };
  const job: SpecialistJob = { id: audit?.id ?? newId(w), gangId, actorId: actor.id, week: w.week, type,
    targetPersonId, blockIds: blocks, state: 'queued', quotedPrice: price, workLeft: 0, visitedPersonIds: [],
    completed: 0, patrolIndex: 0, targetPos: null, result: '', ...(maxHires != null ? { maxHires } : {}) };
  (w.specialistJobs ??= {})[job.id] = job;
  if (type === 'audit') w.auditTargets[gangId] = targetPersonId!;
  return { ok: true, message: `${SPECIALIST_JOB_NAMES[type]} scheduled for ${actor.name}${price ? '; payment is due at the visit' : ''}.` };
}

function home(w: WorldState, gang: Gang, actor: Person): void {
  const office = allBuildings(w).find(b => b.ownerGangId === gang.id && b.isHQ);
  if (office && actor.status === 'active') {
    sendHome(w,actor);
  } else clearDestination(actor);
}

function finish(w: WorldState, j: SpecialistJob, state: 'done' | 'failed' | 'cancelled', message: string): void {
  j.state = state; j.result = message;
  const gang = w.gangs[j.gangId], actor = w.people[j.actorId];
  if (actor && gang && actor.gangId === gang.id && !actor.streetOrder) home(w, gang, actor);
  if (j.type === 'audit' && state !== 'done') delete w.auditTargets[j.gangId];
  // The player's report: a rival's lawyer and accountant work in private.
  if (gang?.isPlayer) w.weekLog.push(`${SPECIALIST_JOB_NAMES[j.type]}: ${message}`);
  if (gang?.isPlayer) addMessage(w, state === 'failed' ? 'failed' : 'waiting', message, actor?.pos, actor?.id);
}

export function cancelSpecialistJob(w: WorldState, gangId: ID, jobId: ID): ApiResult {
  const j = w.specialistJobs?.[jobId];
  if (!j || j.gangId !== gangId || !specialistJobActive(j)) return { ok: false, error: 'That job is not pending.' };
  const wasQueued = j.state === 'queued';
  if (wasQueued) {
    j.state = 'cancelled'; j.result = 'Order cancelled.';
    if (j.type === 'audit') delete w.auditTargets[gangId];
  } else finish(w, j, 'cancelled', 'Order cancelled.');
  return { ok: true, message: 'Order cancelled.' };
}

export function cancelSpecialistVisits(w: WorldState, actorId: ID): void {
  for (const j of Object.values(w.specialistJobs ?? {})) if (j.actorId === actorId && specialistJobActive(j)) cancelSpecialistJob(w, j.gangId, j.id);
}

export function setSpecialistWaiting(w: WorldState, gangId: ID, jobId: ID, waiting: boolean): ApiResult {
  const j = w.specialistJobs?.[jobId], actor = j && w.people[j.actorId];
  if (!j || j.gangId !== gangId || !actor || !specialistJobActive(j) || j.state === 'queued') return { ok: false, error: 'That visit is not in progress.' };
  j.paused = waiting;
  clearDestination(actor);
  if (!waiting && j.state === 'working') j.state = 'travelling';
  return { ok: true, message: waiting ? 'Waiting for further instructions.' : 'The visit will continue.' };
}

/** People a specialist is on the way to see (or seeing): they wait for them. */
export function specialistVisitTargets(w: WorldState): Set<ID> {
  const people = new Set<ID>();
  for (const j of Object.values(w.specialistJobs ?? {})) if (j.week === w.week && specialistJobActive(j) &&
    !j.paused && (j.state === 'working' || j.state === 'travelling') && j.targetPersonId != null) people.add(j.targetPersonId);
  return people;
}

export function specialistParticipants(w: WorldState): Set<ID> {
  const people = new Set<ID>();
  for (const j of Object.values(w.specialistJobs ?? {})) if (j.week === w.week && specialistJobActive(j)) {
    people.add(j.actorId);
    if (!j.paused && j.state === 'working' && j.targetPersonId != null) people.add(j.targetPersonId);
  }
  return people;
}

/** Original saves can already contain an accountant's scheduled audit. */
export function beginSpecialistJobs(w: WorldState): void {
  for (const [id, j] of Object.entries(w.specialistJobs ?? {})) if (j.week < w.week - 1) delete w.specialistJobs![Number(id)];
  for (const [gangId, target] of Object.entries(w.auditTargets)) {
    if (!Object.values(w.specialistJobs ?? {}).some(j => j.week === w.week && j.gangId === Number(gangId) && j.type === 'audit'))
      queueSpecialistJob(w, Number(gangId), 'audit', target);
  }
}

function visitPosition(w: WorldState, p: Person): Vec2 {
  const b = p.buildingId == null ? null : w.buildings[p.buildingId];
  if (!p.dest && p.orderId == null && p.streetOrder == null) {
    if (b) return buildingDoor(w, b);
    // Undeployed crew can retain their HQ position without a buildingId.
    const office = p.gangId == null ? null : allBuildings(w).find(site => site.isHQ && site.ownerGangId === p.gangId && dist(w.lots[site.lotId].center, p.pos) < 2);
    if (office) return buildingDoor(w, office);
  }
  return p.pos;
}

/** Preserve the next crossing when the person we are visiting moves. */
function approach(w: WorldState, actor: Person, j: SpecialistJob, to: Vec2, minutes: number): boolean {
  if (dist(actor.pos, to) <= 3) { dismount(w,actor); clearDestination(actor); return true; }
  if(!j.targetPos){startStaffJourney(w,actor,to);j.targetPos={...to};}
  if (!actor.dest) { setDestination(w, actor, to); j.targetPos = { ...to }; }
  else if (j.targetPos && dist(j.targetPos, to) > 10) {
    // Still walking to the staff car: aim the car, not the walk, at the new
    // spot — re-routing the walker here left the car behind for the journey.
    const car = vehicleOf(w, actor);
    if (car?.boarding && !actor.inVehicle) { car.destination = { ...to }; j.targetPos = { ...to }; }
    else {
    const next = actor.path[0];
    if (next) {
      const route = { ...actor, pos: { x: next.x, y: next.y } };
      setDestination(w, route, to); actor.dest = route.dest; actor.path = [{ ...next }, ...route.path];
    } else setDestination(w, actor, to);
    j.targetPos = { ...to };
    }
  }
  if (stepPerson(actor, minutes, trafficContext(w))) {
    if (actor.inVehicle) { dismount(w,actor); clearDestination(actor); }
    if (dist(actor.pos, to) <= 3) return true;
  }
  return false;
}

export function tickSpecialistJobs(w: WorldState, minutes: number): void {
  const activeActors = new Set<ID>();
  for (const j of Object.values(w.specialistJobs ?? {})) {
    if (j.week !== w.week || !specialistJobActive(j) || activeActors.has(j.actorId)) continue;
    const gang = w.gangs[j.gangId], actor = gang && availableSpecialist(w, gang, roleFor(j));
    if (!actor || actor.id !== j.actorId || actor.streetOrder || actor.burningEscape?.week === w.week || actor.emergencyResponse) {
      finish(w, j, 'failed', 'The specialist is no longer available for this job.'); continue;
    }
    activeActors.add(actor.id);
    if (j.paused) continue;
    if (j.state === 'queued') {
      j.state = 'travelling'; actor.buildingId = null; clearDestination(actor);
      const office = allBuildings(w).find(b => b.ownerGangId === gang.id && b.isHQ && dist(w.lots[b.lotId].center, actor.pos) < 2);
      if (office) actor.pos = buildingDoor(w, office);
      actor.inVehicle=false;
    }
    const areaTour = j.type === 'employPolice' && j.blockIds.length > 0;
    if (j.type === 'employPolice') {
      const total = Object.values(w.specialistJobs ?? {}).filter(x => x.gangId === gang.id && x.week === w.week && x.type === 'employPolice').reduce((n, x) => n + x.completed, 0);
      if (total >= (gang.staffVehicles?.lawyer ? 8 : 4)) { finish(w, j, 'done', 'The lawyer has reached this week\'s police tour capacity.'); continue; }
      // 1.2.51: a tour sent with a hiring limit stops at it.
      if (j.maxHires != null && j.completed >= j.maxHires) { finish(w, j, 'done', `${j.completed} officer(s) hired — the payroll limit for this tour.`); continue; }
    }
    let target = j.targetPersonId == null ? undefined : w.people[j.targetPersonId];
    if (areaTour) {
      const inArea = (p: Person) => j.blockIds.includes(cityBlockAt(w, Math.floor(p.pos.x / CELL), Math.floor(p.pos.y / CELL))?.id ?? -1);
      if (!target || !specialistTargetEligible(w, gang.id, j.type, target) || !inArea(target)) {
        const previous = target;
        target = w.policeIds.map(id => w.people[id]).filter(p => p && specialistTargetEligible(w, gang.id, j.type, p) && inArea(p) && !j.visitedPersonIds.includes(p.id))
          .sort((a, b) => dist(actor.pos, a.pos) - dist(actor.pos, b.pos) || a.id - b.id)[0];
        j.targetPersonId = target?.id ?? null; j.state = 'travelling'; j.workLeft = 0;
        if (previous || target) { j.targetPos = null; clearDestination(actor); }
      }
      if (!target) {
        // No early success just because Monday's snapshot had no police here.
        // Walk the selected beats and continue looking throughout the week.
        if (!actor.dest) setDestination(w, actor, blockPavement(w.blocks[j.blockIds[j.patrolIndex % j.blockIds.length]], actor.id + j.patrolIndex));
        if (stepPerson(actor, minutes, trafficContext(w))) j.patrolIndex++;
        continue;
      }
    }
    if (!target || !specialistTargetEligible(w, gang.id, j.type, target)) { finish(w, j, 'failed', 'The person to visit is no longer available.'); continue; }
    // A live order or emergency can move the subject during a meeting.
    // Resume pursuit without discarding the inspection already performed.
    if (j.state === 'working' && dist(actor.pos, visitPosition(w, target)) > 3) j.state = 'travelling';
    if (j.state === 'travelling') {
      if (approach(w, actor, j, visitPosition(w, target), minutes)) { j.state = 'working'; if (j.workLeft <= 0) j.workLeft = workMinutes(j); }
      continue;
    }
    j.workLeft = Math.max(0, j.workLeft - minutes);
    if (j.workLeft > 0) continue;
    const result = j.type === 'bribeOfficials' ? completeOfficialBribe(w, gang.id, target, j.quotedPrice)
      : j.type === 'employPolice' ? completePoliceEmployment(w, gang.id, target)
      : { ok: true as const, message: `${target.name}'s books were inspected. The Audit report will be ready at week's end.` };
    if (!result.ok) { finish(w, j, 'failed', result.error); continue; }
    j.completed++; j.visitedPersonIds.push(target.id);
    if (areaTour) {
      j.result = `${j.completed} officer${j.completed === 1 ? '' : 's'} employed on the tour.`;
      if (gang.isPlayer) addMessage(w, 'waiting', result.message ?? j.result, actor.pos, actor.id);
      j.targetPersonId = null; j.targetPos = null; j.state = 'travelling'; clearDestination(actor);
    } else finish(w, j, 'done', result.message ?? 'Visit completed.');
  }
}

export function settleSpecialistJobs(w: WorldState): void {
  for (const j of Object.values(w.specialistJobs ?? {})) if (j.week === w.week && specialistJobActive(j)) {
    if (j.type === 'employPolice' && j.completed > 0) finish(w, j, 'done', `${j.completed} officers employed before the end of the week.`);
    else finish(w, j, 'failed', 'The visit was not completed before the end of the week.');
  }
}
