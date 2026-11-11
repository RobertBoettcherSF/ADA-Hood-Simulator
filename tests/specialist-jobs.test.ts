import { describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { assignStaffVehicle, bribeOfficial, bribePrice, cancelSpecialistJob, employPoliceInArea, employPoliceOfficer, hireRecruit, issueOrder, orderAudit, returnToBase } from '../src/sim/api';
import { blockPavement, cityBlockAt } from '../src/sim/cityLayout';
import { CELL, MINUTES_PER_WEEK } from '../src/sim/constants';
import { killPerson } from '../src/sim/execution';
import { skimRate } from '../src/sim/finances';
import { Sim, MINUTES_PER_SECOND } from '../src/sim/sim';
import { setSpecialistWaiting, specialistJobActive, specialistTargetEligible } from '../src/sim/specialistJobs';
import { weeklyEconomy } from '../src/sim/systems/economy';
import { onRoad } from '../src/sim/vehicleNavigation';
import { buildingDoor, dist } from '../src/sim/world';

function fixture() {
  const sim = new Sim({ ...defaultGameOptions(), seed: 405, citySize: 10, startMoney: 500_000 });
  const w = sim.world, gang = sim.playerGang;
  // Separate unrelated AI orders from the action under test, without modifying movement/rolls.
  w.orders = {}; w.specialistJobs = {};
  for (const t of Object.values(w.teams)) { t.orderIds = []; t.timeUsed = 0; }
  const lawyer = Object.values(w.people).find(p => p.role === 'lawyer' && p.gangId == null)!;
  const accountant = Object.values(w.people).find(p => p.role === 'accountant' && p.gangId == null)!;
  expect(hireRecruit(w, gang.id, lawyer.id, 'pool').ok).toBe(true);
  expect(hireRecruit(w, gang.id, accountant.id, 'pool').ok).toBe(true);
  const chief = w.people[w.policeChiefId];
  return { sim, w, gang, lawyer, accountant, chief };
}
function tick(sim: Sim) { sim.advance(1 / MINUTES_PER_SECOND, 1); }
function until(sim: Sim, done: () => boolean, limit = 1800) {
  for (let i = 0; i < limit && !done() && sim.world.phase === 'week'; i++) tick(sim);
  expect(done(), JSON.stringify(sim.world.specialistJobs)).toBe(true);
}
function jobFor(sim: Sim, actor: number) { return Object.values(sim.world.specialistJobs!).find(j => j.actorId === actor)!; }

describe('scheduled specialist visits through the real simulation', () => {
  it('offers Audit only for current lieutenants and managers of owned businesses', () => {
    const s = fixture(), team = s.w.teams[s.gang.teamIds[0]];
    const lt = s.w.people[team.lieutenantId], hood = s.w.people[team.memberIds[0]];
    const site = Object.values(s.w.buildings).find(b => b.ownerGangId === s.gang.id && b.managerId != null)!;
    const manager = s.w.people[site.managerId!];
    expect(specialistTargetEligible(s.w, s.gang.id, 'audit', lt)).toBe(true);
    expect(specialistTargetEligible(s.w, s.gang.id, 'audit', manager)).toBe(true);
    expect(specialistTargetEligible(s.w, s.gang.id, 'audit', hood)).toBe(false);
    expect(orderAudit(s.w, s.gang.id, hood.id).ok).toBe(false);
    site.ownerGangId = null;
    expect(specialistTargetEligible(s.w, s.gang.id, 'audit', manager)).toBe(false);
    expect(Object.values(s.w.specialistJobs!)).toHaveLength(0);
  });

  it('reserves the whole week after the inspection, including after save/restore', () => {
    const s = fixture(), team = s.w.teams[s.gang.teamIds[0]];
    const manager = Object.values(s.w.buildings).find(b => b.ownerGangId === s.gang.id && b.managerId != null)!.managerId!;
    expect(orderAudit(s.w, s.gang.id, team.lieutenantId).ok).toBe(true);
    // A planning edit replaces the queued audit, without a second reservation.
    expect(orderAudit(s.w, s.gang.id, manager).ok).toBe(true);
    expect(Object.values(s.w.specialistJobs!)).toHaveLength(1);
    s.sim.launchWeek(); until(s.sim, () => jobFor(s.sim, s.accountant.id).state === 'done');
    const sim = Sim.fromSave(structuredClone(s.w)), before = structuredClone(sim.world.specialistJobs);
    expect(orderAudit(sim.world, s.gang.id, team.lieutenantId).ok).toBe(false);
    expect(sim.world.specialistJobs).toEqual(before);
    expect(sim.world.auditTargets[s.gang.id]).toBe(manager);
    sim.world.minute = MINUTES_PER_WEEK - 1; tick(sim);
    expect(sim.world.auditResults[s.gang.id]?.personId).toBe(manager);
    expect(orderAudit(sim.world, s.gang.id, team.lieutenantId).ok).toBe(true);
  });

  it('a cancelled planning audit releases the accountant before the week starts', () => {
    const s = fixture(), lt = s.w.teams[s.gang.teamIds[0]].lieutenantId;
    expect(orderAudit(s.w, s.gang.id, lt).ok).toBe(true);
    expect(cancelSpecialistJob(s.w, s.gang.id, jobFor(s.sim, s.accountant.id).id).ok).toBe(true);
    expect(s.w.auditTargets[s.gang.id]).toBeUndefined();
    expect(orderAudit(s.w, s.gang.id, lt).ok).toBe(true);
  });

  it('restores a real loss-making manager ledger without turning a loss into skimming', () => {
    const s = fixture(), site = Object.values(s.w.buildings).find(b => b.ownerGangId === s.gang.id && b.managerId != null)!;
    site.typeId = 'soupKitchen'; site.cls = 'charity'; site.state = 'trading';
    weeklyEconomy(s.w, s.sim.rng);
    const ledger = s.w.personTakings![site.managerId!];
    expect(ledger.gross).toBeLessThan(0); expect(ledger.declared).toBe(ledger.gross);
    const sim = Sim.fromSave(structuredClone(s.w));
    expect(sim.world.personTakings![site.managerId!]).toEqual(ledger);
  });

  it.each([false, true])('pays only at the official after real travel, save/restore and return (car=%s)', car => {
    const s = fixture();
    if (car) { s.gang.vehicles.coupe++; expect(assignStaffVehicle(s.w, s.gang.id, 'lawyer', 'coupe').ok).toBe(true); }
    const opening = s.gang.cash, quoted = bribePrice(s.w, s.chief, s.gang.id);
    expect(bribeOfficial(s.w, s.gang.id, s.chief.id).ok).toBe(true);
    expect(s.gang.cash).toBe(opening); expect(s.chief.bribedBy).not.toBe(s.gang.id);
    const id = jobFor(s.sim, s.lawyer.id).id;
    s.sim.launchWeek(); tick(s.sim);
    expect(s.w.specialistJobs![id].state).toBe('travelling');
    expect(s.gang.cash).toBe(opening);
    if (car) expect(onRoad(s.w, s.lawyer.pos)).toBe(true);
    const sim = Sim.fromSave(structuredClone(s.w)), actor = sim.world.people[s.lawyer.id];
    until(sim, () => !specialistJobActive(sim.world.specialistJobs![id]));
    expect(sim.world.specialistJobs![id].state).toBe('done');
    expect(sim.playerGang.cash).toBe(opening - quoted);
    expect(sim.world.people[s.chief.id].bribedBy).toBe(s.gang.id);
    for (let i = 0; i < 15; i++) tick(sim);
    expect(sim.playerGang.cash).toBe(opening - quoted);
    until(sim, () => actor.dest == null);
    expect(actor.inVehicle).toBe(false); expect(actor.buildingId).not.toBeNull();
  });

  it.each(['cancel', 'target dies', 'lawyer replaced', 'cash spent', 'return to base'] as const)('an interrupted visit (%s) never buys a bribe', reason => {
    const s = fixture(), opening = s.gang.cash;
    expect(bribeOfficial(s.w, s.gang.id, s.chief.id).ok).toBe(true);
    const j = jobFor(s.sim, s.lawyer.id);
    s.sim.launchWeek(); tick(s.sim);
    if (reason === 'cancel') expect(cancelSpecialistJob(s.w, s.gang.id, j.id).ok).toBe(true);
    if (reason === 'target dies') killPerson(s.w, s.chief, 'interrupted visit test');
    if (reason === 'lawyer replaced') {
      const next = Object.values(s.w.people).find(p => p.role === 'lawyer' && p.gangId == null && p.status === 'active')!;
      expect(hireRecruit(s.w, s.gang.id, next.id, 'pool').ok).toBe(true);
    }
    if (reason === 'cash spent') s.gang.cash = 0;
    if (reason === 'return to base') expect(returnToBase(s.w, s.gang.id, s.lawyer.id).ok).toBe(true);
    until(s.sim, () => !specialistJobActive(j));
    expect(['cancelled', 'failed']).toContain(j.state);
    expect(s.chief.bribedBy).not.toBe(s.gang.id);
    expect(s.gang.cash).toBe(reason === 'cash spent' ? 0 : opening);
  });

  it('police are hired only after meeting in the selected blocks, with a weekly capacity across tours', () => {
    const s = fixture();
    const block = s.w.blocks.find(b => !b.layout?.mergedInto && b.lotIds.length > 0)!;
    const point = blockPavement(block, 1);
    // Start the officers on this beat; their ordinary ambient movement remains enabled.
    for (const id of s.w.policeIds) {
      const p = s.w.people[id]; p.pos = { ...point }; p.dest = null; p.path = [];
      p.buildingId = null;
    }
    const picked = cityBlockAt(s.w, Math.floor(point.x / CELL), Math.floor(point.y / CELL))!;
    expect(employPoliceInArea(s.w, s.gang.id, [picked.id]).ok).toBe(true);
    expect(s.gang.employedPoliceIds).toHaveLength(0);
    s.sim.launchWeek();
    until(s.sim, () => s.gang.employedPoliceIds.length === 4);
    const firstCount = s.gang.employedPoliceIds.length;
    expect(employPoliceInArea(s.w, s.gang.id, [picked.id]).ok).toBe(true);
    for (let i = 0; i < 50; i++) tick(s.sim);
    expect(s.gang.employedPoliceIds.length).toBe(firstCount);
    expect(s.w.specialistJobs && Object.values(s.w.specialistJobs).every(j => !specialistJobActive(j))).toBe(true);
  });

  it('empty tour areas are accepted for patrol, then report failure if nobody is met by Friday', () => {
    const s = fixture(), block = s.w.blocks.find(b => !b.layout?.mergedInto)!;
    expect(employPoliceInArea(s.w, s.gang.id, [block.id]).ok).toBe(true);
    s.sim.launchWeek(); s.w.minute = MINUTES_PER_WEEK - 1; tick(s.sim);
    expect(jobFor(s.sim, s.lawyer.id).state).toBe('failed');
    expect(s.gang.employedPoliceIds).toHaveLength(0);
  });

  it('preserves a paused meeting through a save and resumes without charging at a distance', () => {
    const s = fixture(), opening = s.gang.cash;
    expect(bribeOfficial(s.w, s.gang.id, s.chief.id).ok).toBe(true);
    s.sim.launchWeek();
    until(s.sim, () => jobFor(s.sim, s.lawyer.id).state === 'working');
    tick(s.sim);
    const job = jobFor(s.sim, s.lawyer.id), remaining = job.workLeft;
    expect(setSpecialistWaiting(s.w, s.gang.id, job.id, true).ok).toBe(true);
    const sim = Sim.fromSave(structuredClone(s.w)), restored = sim.world.specialistJobs![job.id];
    const actor = sim.world.people[s.lawyer.id], before = { ...actor.pos };
    for (let i = 0; i < 12; i++) tick(sim);
    expect(actor.pos).toEqual(before); expect(restored.workLeft).toBe(remaining);
    expect(sim.playerGang.cash).toBe(opening);
    expect(setSpecialistWaiting(sim.world, s.gang.id, job.id, false).ok).toBe(true);
    until(sim, () => restored.state === 'working');
    // Model an emergency moving the official away during the meeting.
    const chief = sim.world.people[s.chief.id];
    chief.buildingId = null; chief.pos = blockPavement(sim.world.blocks.find(b => !b.layout?.mergedInto && dist(blockPavement(b, 1), actor.pos) > 80)!, 1);
    tick(sim);
    expect(restored.state).toBe('travelling'); expect(restored.workLeft).toBe(remaining);
    expect(sim.playerGang.cash).toBe(opening);
    until(sim, () => restored.state === 'done');
    expect(sim.playerGang.cash).toBe(opening - restored.quotedPrice);
  });

  it('rejects corrupt specialist references and impossible recorded takings when restoring', () => {
    const s = fixture(); bribeOfficial(s.w, s.gang.id, s.chief.id);
    const badActor = structuredClone(s.w);
    Object.values(badActor.specialistJobs!)[0].actorId = -1;
    expect(() => Sim.fromSave(badActor)).toThrow();
    const badIncome = structuredClone(s.w);
    badIncome.personTakings = { [s.lawyer.id]: { week: s.w.week, gross: 100, declared: 101 } };
    expect(() => Sim.fromSave(badIncome)).toThrow();
  });

  it('a personal police visit is queued once and cannot pay before arrival', () => {
    const s = fixture(), p = s.w.people[s.w.policeIds[0]];
    expect(employPoliceOfficer(s.w, s.gang.id, p.id).ok).toBe(true);
    expect(employPoliceOfficer(s.w, s.gang.id, p.id).ok).toBe(true);
    expect(Object.values(s.w.specialistJobs!)).toHaveLength(1); expect(p.employedBy).toBeNull();
    s.sim.launchWeek(); until(s.sim, () => jobFor(s.sim, s.lawyer.id).state === 'done');
    expect(p.employedBy).toBe(s.gang.id);
  });

  it('visits a lieutenant and reports actual crew takings and skimming after save/restore', () => {
    const s = fixture(), team = s.w.teams[s.gang.teamIds[0]], lt = s.w.people[team.lieutenantId];
    lt.loyalty = 35; lt.skills.organization = 2;
    const site = Object.values(s.w.buildings).find(b => b.protection?.gangId === s.gang.id)!;
    site.protection!.weekly = 1000; site.protection!.refusing = false;
    const rate = skimRate(lt.loyalty, lt.skills.organization), expected = Math.round(1000 * (1 - rate));
    expect(issueOrder(s.w, s.gang.id, { teamId: team.id, type: 'collectProtection', buildingIds: [site.id], opts: { manpower: 1, preferredHoodId: team.memberIds[0] } }).ok).toBe(true);
    expect(orderAudit(s.w, s.gang.id, lt.id).ok).toBe(true);
    s.sim.launchWeek();
    until(s.sim, () => jobFor(s.sim, s.accountant.id).state === 'working');
    const hq = Object.values(s.w.buildings).find(b => b.isHQ && b.ownerGangId === s.gang.id)!;
    expect(dist(s.accountant.pos, buildingDoor(s.w, hq))).toBeLessThanOrEqual(3);
    expect(dist(s.accountant.pos, s.w.lots[hq.lotId].center)).toBeGreaterThan(10);
    until(s.sim, () => s.w.personTakings?.[lt.id]?.gross === 1000 && jobFor(s.sim, s.accountant.id).state === 'done');
    expect(s.w.personTakings![lt.id].declared).toBe(expected);
    const sim = Sim.fromSave(structuredClone(s.w));
    sim.world.minute = MINUTES_PER_WEEK - 1; tick(sim);
    expect(sim.world.auditResults[s.gang.id]).toEqual({ personId: lt.id, brought: 1000, declared: expected });
    expect(sim.playerGang.lastWeekIncome.protection).toBe(expected);
  });

  it('audits real business gross and net rather than reconstructing them after loyalty changes', () => {
    const s = fixture(), site = Object.values(s.w.buildings).find(b => b.ownerGangId === s.gang.id && b.managerId != null)!;
    const mgr = s.w.people[site.managerId!]; mgr.loyalty = 45; mgr.skills.organization = 2;
    s.accountant.pos = buildingDoor(s.w, site);
    expect(orderAudit(s.w, s.gang.id, mgr.id).ok).toBe(true);
    s.sim.launchWeek(); until(s.sim, () => jobFor(s.sim, s.accountant.id).state === 'done');
    expect(dist(s.accountant.pos, s.w.lots[site.lotId].center)).toBeGreaterThan(0);
    const withoutAudit = Sim.fromSave(structuredClone(s.w));
    delete withoutAudit.world.auditTargets[s.gang.id];
    withoutAudit.world.minute = MINUTES_PER_WEEK - 1; tick(withoutAudit);
    s.w.minute = MINUTES_PER_WEEK - 1; tick(s.sim);
    const report = s.w.auditResults[s.gang.id]!, takings = s.w.personTakings![mgr.id];
    expect(report.brought).toBe(takings.gross); expect(report.declared).toBe(takings.declared);
    expect(report.brought).toBeGreaterThan(report.declared);
    // Reading the report does not discipline a skimmer on the player's behalf.
    expect(mgr.loyalty).toBe(withoutAudit.world.people[mgr.id].loyalty);
  });
});
