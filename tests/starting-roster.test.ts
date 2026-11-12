import { describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { createWorld } from '../src/sim/citygen';
import { hireRecruit, issueOrder, moveToPool, moveToTeam, promote } from '../src/sim/api';
import { Sim } from '../src/sim/sim';
import { gangManpower, gangMembers } from '../src/sim/world';
import { validateSaveWorld } from '../src/sim/saveSchema';
import { MAX_TEAM_SIZE } from '../src/sim/constants';

function fixture(startHoods = 5) {
  const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10, startHoods });
  const w = sim.world, g = sim.playerGang, team = w.teams[g.teamIds[0]];
  return { sim, w, g, team };
}
const payroll = (s: ReturnType<typeof fixture>) => gangMembers(s.w, s.g).reduce((sum, p) => sum + p.pay, 0);

// 1.2.21: the lieutenant comes on top of the chosen hoods — N hoods are one
// crew hood, one front manager and N − 2 in the pool, plus the lieutenant.
describe('manual p.31 starting hoods', () => {
  it.each(['varied', 'classic'] as const)('allocates every 3–10 hood setting before planning (%s)', cityLayout => {
    for (let startHoods = 3; startHoods <= 10; startHoods++) {
      const w = createWorld({ ...defaultGameOptions(), seed: 404, citySize: 10, startHoods, cityLayout }).world;
      for (const g of Object.values(w.gangs)) {
        const team = w.teams[g.teamIds[0]], people = gangMembers(w, g);
        expect(g.teamIds).toHaveLength(1);
        expect(team.memberIds).toHaveLength(1);
        expect(g.poolIds).toHaveLength(startHoods - 2);
        const managers = Object.values(w.buildings).filter(b => b.ownerGangId === g.id && b.managerId != null);
        expect(managers).toHaveLength(1);
        expect(w.people[managers[0].managerId!].teamId).toBeNull();
        expect(new Set(people.map(p => p.id)).size).toBe(startHoods + 2); // boss and lieutenant on top
        expect(people).toHaveLength(startHoods + 2);
        expect(gangManpower(w, g)).toBe(startHoods + 1);
        for (const id of g.poolIds) expect(w.people[id]).toMatchObject({ role: 'hood', teamId: null, buildingId: null, gangId: g.id });
        for (const p of people.filter(p => p.role !== 'boss')) expect(p.pay).toBe(p.payDemand);
      }
      expect(() => validateSaveWorld(w)).not.toThrow();
    }
  });

  it.each([3, 5, 6, 10])('keeps player reserves and lets rival planning staff usable crews (%i hoods)', count => {
    const s = fixture(count);
    expect(s.g.poolIds).toHaveLength(count - 2);
    expect(s.team.memberIds).toHaveLength(1);
    for (const rival of Object.values(s.w.gangs).filter(g => !g.isPlayer)) {
      expect(rival.poolIds).toHaveLength(0);
      const crews = rival.teamIds.map(id => s.w.teams[id]);
      expect(crews.every(t => t.memberIds.length > 0 && t.memberIds.length < MAX_TEAM_SIZE)).toBe(true);
      expect(gangManpower(s.w, rival)).toBe(count + 1);
      expect(new Set(gangMembers(s.w, rival).map(p => p.id)).size).toBe(gangMembers(s.w, rival).length);
    }
    expect(() => validateSaveWorld(s.w)).not.toThrow();
  });

  it('assigns a reserve, saves it, then dispatches that person on the accepted job', () => {
    const s = fixture(), reserve = s.g.poolIds[0], wages = payroll(s), cash = s.g.cash;
    expect(issueOrder(s.w, s.g.id, { teamId: s.team.id, type: 'explore', blockIds: [0], opts: { manpower: 3 } }).ok).toBe(false);
    expect(moveToTeam(s.w, s.g.id, reserve, s.team.id).ok).toBe(true);
    expect(payroll(s)).toBe(wages); expect(s.g.cash).toBe(cash);
    expect(issueOrder(s.w, s.g.id, { teamId: s.team.id, type: 'explore', blockIds: [0], opts: { manpower: 3, preferredHoodId: reserve } }).ok).toBe(true);
    const restored = Sim.fromSave(structuredClone(s.w));
    expect(restored.playerGang.poolIds).toEqual(s.g.poolIds);
    expect(restored.world.teams[s.team.id].memberIds).toEqual(s.team.memberIds);
    restored.launchWeek();
    const order = restored.world.orders[s.team.orderIds[0]];
    expect(order.assignedIds).toHaveLength(3);
    expect(order.assignedIds).toContain(reserve);
    expect(restored.world.people[reserve].orderId).toBe(order.id);
  });

  it('moves hoods between crews and the pool without changing wages or duplicating people', () => {
    const s = fixture(), id = s.g.poolIds[0];
    expect(promote(s.w, s.g.id, s.g.poolIds[1]).ok).toBe(true);
    const wages = payroll(s), second = s.w.teams[s.g.teamIds[1]];
    for (const team of [s.team, second, s.team]) {
      expect(moveToTeam(s.w, s.g.id, id, team.id).ok).toBe(true);
      expect(moveToTeam(s.w, s.g.id, id, team.id).ok).toBe(true);
      expect(team.memberIds.filter(p => p === id)).toHaveLength(1);
      expect(s.g.poolIds).not.toContain(id);
    }
    expect(moveToPool(s.w, s.g.id, id).ok).toBe(true);
    expect(moveToPool(s.w, s.g.id, id).ok).toBe(true);
    expect(s.g.poolIds.filter(p => p === id)).toHaveLength(1);
    expect(s.w.people[id].teamId).toBeNull();
    expect(payroll(s)).toBe(wages); expect(gangManpower(s.w, s.g)).toBe(6);
    expect(() => validateSaveWorld(s.w)).not.toThrow();
  });

  it.each(['explore', 'kill'] as const)('sends both people when the initial crew receives a two-person %s order', type => {
    const s = fixture(), lt = s.w.people[s.team.lieutenantId];
    lt.skills.organization = 1; lt.skills.intelligence = 1;
    const target = Object.values(s.w.people).find(p => p.gangId != null && p.gangId !== s.g.id && p.status === 'active')!;
    expect(issueOrder(s.w, s.g.id, { teamId: s.team.id, type, blockIds: [0], personId: target.id, opts: { manpower: 2 } }).ok).toBe(true);
    s.sim.launchWeek();
    expect(s.w.orders[s.team.orderIds[0]].assignedIds.slice().sort((a, b) => a - b))
      .toEqual([lt.id, ...s.team.memberIds].sort((a, b) => a - b));
  });

  it('rejects rival transfers and moving or promoting a boss, lieutenant or front manager atomically', () => {
    const s = fixture(), rival = Object.values(s.w.gangs).find(g => !g.isPlayer)!;
    const manager = Object.values(s.w.buildings).find(b => b.ownerGangId === s.g.id && b.managerId != null)!.managerId!;
    for (const id of [s.g.bossId, s.team.lieutenantId, manager, s.w.teams[rival.teamIds[0]].memberIds[0]]) {
      for (const action of [() => moveToTeam(s.w, s.g.id, id, s.team.id), () => moveToPool(s.w, s.g.id, id), () => promote(s.w, s.g.id, id)]) {
        const before = JSON.stringify(s.w);
        expect(action().ok).toBe(false); expect(JSON.stringify(s.w)).toBe(before);
      }
    }
    const before = JSON.stringify(s.w);
    expect(moveToTeam(s.w, s.g.id, s.g.poolIds[0], rival.teamIds[0]).ok).toBe(false);
    expect(JSON.stringify(s.w)).toBe(before);
  });

  it('refuses a full crew without losing its reserve and accepts same-crew clicks at capacity', () => {
    const s = fixture(10);
    for (const id of [...s.g.poolIds]) expect(moveToTeam(s.w, s.g.id, id, s.team.id).ok).toBe(true);
    const available = Object.values(s.w.people).filter(p => p.role === 'hood' && p.gangId == null && p.status === 'active');
    expect(hireRecruit(s.w, s.g.id, available[0].id, 'team', s.team.id).ok).toBe(true);
    expect(hireRecruit(s.w, s.g.id, available[1].id, 'pool').ok).toBe(true);
    expect(s.team.memberIds).toHaveLength(MAX_TEAM_SIZE - 1);
    const before = JSON.stringify(s.w);
    expect(moveToTeam(s.w, s.g.id, available[1].id, s.team.id).ok).toBe(false);
    expect(moveToTeam(s.w, s.g.id, s.team.memberIds[0], s.team.id).ok).toBe(true);
    expect(JSON.stringify(s.w)).toBe(before);
  });

  it('preserves an existing saved larger crew without reallocating it on load', () => {
    const s = fixture();
    for (const id of [...s.g.poolIds]) moveToTeam(s.w, s.g.id, id, s.team.id);
    const restored = Sim.fromSave(structuredClone(s.w));
    expect(restored.playerGang.poolIds).toHaveLength(0);
    expect(restored.world.teams[s.team.id].memberIds).toHaveLength(4);
    expect(restored.world.teams[s.team.id]).toEqual(s.team);
  });
});
