import { describe, expect, it, vi } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { nearTerritory } from '../src/sim/api';
import { activeBlocks, cityBlockAt } from '../src/sim/cityLayout';
import { CELL } from '../src/sim/constants';
import { knownBlockOwners } from '../src/sim/mapIntel';
import { Sim } from '../src/sim/sim';
import { tickCombat } from '../src/sim/systems/combat';
import { canRunForOffice, electionBlocksRequired } from '../src/sim/systems/politics';
import { territoryGoodwill } from '../src/sim/systems/opinion';
import { blockClaimants, territorySites } from '../src/sim/territory';
import { territoryBlocks, territoryCount } from '../src/sim/world';

function fixture() {
  const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10 });
  const w = sim.world, gang = sim.playerGang, rival = Object.values(w.gangs).find(g => !g.isPlayer)!;
  for (const b of Object.values(w.buildings)) { b.ownerGangId = null; b.protection = null; }
  const block = activeBlocks(w).find(b => b.layout?.use === 'urban' && !b.layout.mergedInto &&
    territorySites(w, b).filter(s => s.cls === 'commercial').length >= 2)!;
  const sites = territorySites(w, block).filter(b => b.cls === 'commercial');
  return { sim, w, gang, rival, block, sites };
}
const protection = (gangId: number) => ({ gangId, weekly: 100, base: 100, grievance: 0, refusing: false });

describe('ordinary territory follows owned/protected businesses, manual p.12', () => {
  it('counts one claim, never double-counts several holdings, and retains a rival claim', () => {
    const { sim, w, gang, rival, block, sites } = fixture();
    sites[0].ownerGangId = gang.id;
    expect(territoryCount(w, gang.id)).toBe(1);
    sites[1].protection = protection(gang.id);
    sites[0].protection = protection(rival.id);
    expect(territoryCount(w, gang.id)).toBe(1);
    expect(territoryCount(w, rival.id)).toBe(1);
    expect(sim.territoryOwners(block.id)).toEqual([gang.id, rival.id].sort((a,b)=>a-b));
    sites[0].state = 'destroyed';
    expect(territoryCount(w, gang.id)).toBe(1);
    expect(territoryCount(w, rival.id)).toBe(0);
    sites[1].protection = null;
    expect(sim.territoryOwners(block.id)).toEqual([]);
    expect(territoryCount(w, gang.id)).toBe(0);
  });

  it('does not treat an empty plot or an eliminated gang as territory', () => {
    const { w, gang, sites } = fixture();
    sites[0].ownerGangId = gang.id; sites[0].cls = 'empty';
    expect(territoryCount(w, gang.id)).toBe(0);
    sites[0].cls = 'commercial'; sites[0].state = 'damaged';
    expect(territoryCount(w, gang.id)).toBe(1);
    gang.eliminated = true;
    expect(territoryCount(w, gang.id)).toBe(0);
  });

  it('starts with its HQ territory and preserves visible/actual claims through both save loaders', async () => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10 }), w = sim.world;
    const hq = Object.values(w.buildings).find(b => b.isHQ && b.ownerGangId === sim.playerGang.id)!;
    const root = w.blocks[hq.blockId].layout?.mergedInto ?? hq.blockId;
    expect(territoryBlocks(w, sim.playerGang.id).map(b=>b.id)).toContain(root);
    for (const restore of [Sim.fromSave, Sim.fromSaveResponsive]) {
      const saved = await restore(JSON.parse(JSON.stringify(w)));
      expect(territoryCount(saved.world, saved.playerGang.id)).toBe(territoryCount(w, sim.playerGang.id));
      expect(knownBlockOwners(saved.world, saved.world.blocks[root], saved.playerGang.id)).toContain(saved.playerGang.id);
    }
  });

  it('deduplicates a merged block and measures purchase reach from its far edge', () => {
    const { w, gang } = fixture();
    const alias = w.blocks.find(b => b.layout?.mergedInto != null &&
      territorySites(w, b).some(site => site.cls === 'commercial'))!;
    const root = w.blocks[alias.layout!.mergedInto!];
    const site = territorySites(w, root).find(b => b.cls === 'commercial')!;
    site.ownerGangId = gang.id;
    expect(territoryBlocks(w, gang.id).map(b=>b.id)).toEqual([root.id]);
    expect(blockClaimants(w, alias)).toEqual([gang.id]);
    expect(nearTerritory(w, gang.id, alias.id, 0)).toBe(true);
    const axis = (root.layout?.spanX ?? 1) > 1 ? 'x' : 'y';
    const gx = root.gx + (axis === 'x' ? (root.layout?.spanX ?? 1) + 1 : 0);
    const gy = root.gy + (axis === 'y' ? (root.layout?.spanY ?? 1) + 1 : 0);
    const target = cityBlockAt(w, gx, gy)!;
    expect(target).toBeDefined();
    expect(nearTerritory(w, gang.id, target.id, 2)).toBe(true);
    expect(nearTerritory(w, gang.id, target.id, 1)).toBe(false);
    site.ownerGangId = null;
    expect(nearTerritory(w, gang.id, target.id, 2)).toBe(false);
  });

  it('ceasefire encounters see a new protection claim immediately and lose it when released', () => {
    const { sim, w, gang, rival, block, sites } = fixture();
    const team = w.teams[gang.teamIds[0]], other = w.teams[rival.teamIds[0]];
    const actor = w.people[team.memberIds[0]], target = w.people[other.memberIds[0]];
    for (const p of Object.values(w.people)) p.status = 'jailed';
    for (const p of [actor, target]) {
      p.status = 'active'; p.buildingId = null; p.inVehicle = false; p.orderId = null; p.streetOrder = null;
      p.pos = { x: block.gx * CELL + 2, y: block.gy * CELL + 20 }; p.dest = null; p.path = [];
      p.skills.intelligence = 5; p.skills.firearms = 5;
    }
    target.pos.y += 2; target.hp = 1000;
    team.weapons = { pistol: 1, shotgun: 0, rifle: 0, tommy: 0, twinPistols: 0, explosives: 0 };
    gang.offered[rival.id] = 'ceasefire'; rival.offered[gang.id] = 'alliance';
    const chance = vi.spyOn(sim.rng, 'chance').mockReturnValue(true);
    const range = vi.spyOn(sim.rng, 'range').mockReturnValue(1);
    tickCombat(w, sim.rng, 1, undefined);
    expect(target.hp).toBe(1000);
    sites[0].ownerGangId = rival.id; sites[0].protection = protection(gang.id);
    tickCombat(w, sim.rng, 1, undefined);
    expect(target.hp).toBeLessThan(1000);
    sites[0].protection = null; actor.hp = 100; target.hp = 1000;
    gang.offered[rival.id] = 'ceasefire';
    tickCombat(w, sim.rng, 1, undefined);
    expect(target.hp).toBe(1000);
    chance.mockRestore(); range.mockRestore();
  });

  it('election eligibility counts a single business per block and responds to losing one', () => {
    const { w, gang } = fixture();
    const lawyer = Object.values(w.people).find(p => p.role === 'lawyer' && p.gangId == null)!;
    lawyer.gangId = gang.id; gang.lawyerId = lawyer.id; gang.cash = 100_000; w.election.active = true; w.election.weeksLeft = 6;
    const required = electionBlocksRequired(w);
    const sites = activeBlocks(w).map(b => territorySites(w, b).find(site => site.cls === 'commercial')).filter(b => !!b).slice(0, required);
    expect(sites).toHaveLength(required);
    for (const b of sites) b!.protection = protection(gang.id);
    expect(territoryCount(w, gang.id)).toBe(required);
    expect(canRunForOffice(w, gang.id)).toBe(true);
    gang.goodwill = 0; territoryGoodwill(w);
    expect(gang.goodwill).toBeCloseTo(required / 60);
    sites[0]!.protection = null;
    expect(canRunForOffice(w, gang.id)).toBe(false);
  });

  it.each([true, false])('restores a settlement and credits a one-business territory win to player=%s', playerWins => {
    const { sim, w, gang, rival, sites } = fixture();
    w.options.mode = 'territory'; w.options.territoryTarget = 1;
    sites[0].protection = protection(playerWins ? gang.id : rival.id);
    w.phase = 'week'; w.settlementStage = 14;
    const restored = Sim.fromSave(JSON.parse(JSON.stringify(w)));
    restored.finishWeek();
    expect(restored.world.phase).toBe('gameOver');
    expect(restored.world.outcome?.won).toBe(playerWins);
    expect(restored.world.outcome?.reason).toContain('1 block of Saint Volstead');
    expect(restored.world.targetRace?.gangId).toBe(playerWins ? gang.id : rival.id);
    expect(sim.world.settlementStage).toBe(14);
  });
});
