import { describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { issueOrder } from '../src/sim/api';
import { BUILDING_BY_ID } from '../src/sim/data/buildings';
import { Sim } from '../src/sim/sim';
import { gangManpower } from '../src/sim/world';

/**
 * Robert's desktop game, seed 1934, 40×32, Otto "Kraut" Keller: two weeks of
 * recruit orders left the gang at 10 men and the pool empty. A recruit that
 * finds people has to put them on the crew or in the pool.
 */
describe('recruiting grows the gang', () => {
  it('a week-1 recruit on the 40×32 city adds men', () => {
    const sim = new Sim({
      ...defaultGameOptions(),
      seed: 1934,
      citySize: 40,
      cityHeight: 32,
      playerName: 'Otto Keller',
      playerNickname: 'Kraut',
      playerHeritage: 'german',
      era: '1932',
    });
    const player = sim.playerGang;
    expect(sim.world.people[player.bossId].name).toContain('Keller');
    const before = gangManpower(sim.world, player);
    const hq = Object.values(sim.world.buildings).find((b) => b.isHQ && b.ownerGangId === player.id)!;
    const home = sim.world.lots[hq.lotId].center;
    const sites = Object.values(sim.world.buildings)
      .filter((b) => BUILDING_BY_ID[b.typeId]?.recruit === 'hood' && b.state !== 'destroyed'
        && Object.values(sim.world.people).some((p) => p.buildingId === b.id && p.gangId == null && p.role === 'hood' && p.status === 'active'))
      .sort((a, b) => {
        const da = Math.hypot(sim.world.lots[a.lotId].center.x - home.x, sim.world.lots[a.lotId].center.y - home.y);
        const db = Math.hypot(sim.world.lots[b.lotId].center.x - home.x, sim.world.lots[b.lotId].center.y - home.y);
        return da - db;
      });
    expect(sites.length).toBeGreaterThan(0);
    const issued = issueOrder(sim.world, player.id, {
      teamId: player.teamIds[0],
      type: 'recruit',
      buildingIds: [sites[0].id],
      opts: { manpower: 1 },
    });
    expect(issued.ok).toBe(true);
    sim.launchWeek();
    sim.finishWeek();
    expect(sim.world.phase).toBe('planning');
    expect(gangManpower(sim.world, player)).toBeGreaterThan(before);
    const poolOrCrew = player.poolIds.length + sim.world.teams[player.teamIds[0]].memberIds.length;
    expect(poolOrCrew).toBeGreaterThan(0);
  }, 180000);
});
