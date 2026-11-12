import { setAttitude } from '../src/sim/attitudes';
import { MINUTES_PER_WEEK } from '../src/sim/constants';
import { describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import {
  bribeOfficial,
  bribePrice,
  demote,
  hireRecruit,
  issueOrder,
  nearTerritory,
  setRunForOffice,
} from '../src/sim/api';
import { killPerson } from '../src/sim/execution';
import { Sim, MINUTES_PER_SECOND } from '../src/sim/sim';
import { raidSite } from '../src/sim/systems/fbi';
import { campaignWeeklyCost } from '../src/sim/systems/politics';
import type { Building } from '../src/sim/types';
import { allBuildings, gangManpower, protectedBuildings } from '../src/sim/world';

function newSim(seed = 4711) {
  return new Sim({ ...defaultGameOptions(), seed, citySize: 10, startMoney: 60_000, startHoods: 4 });
}

function playWeek(sim: Sim) {
  sim.launchWeek();
  sim.finishWeek();
}

function freeSiteNear(sim: Sim): Building {
  const w = sim.world;
  const gang = sim.playerGang;
  const site = allBuildings(w).find(b => nearTerritory(w, gang.id, b.blockId, 2) &&
    ['commercial', 'industrial', 'tenement'].includes(b.cls) &&
    b.ownerGangId == null && !b.protection && b.state === 'trading');
  expect(site, 'a legal, unclaimed property within purchase reach').toBeDefined();
  return site!;
}

describe('regressions', () => {
  it('never puts a lieutenant behind a shop counter', () => {
    const sim = newSim();
    const w = sim.world;
    const gang = sim.playerGang;
    const team = w.teams[gang.teamIds[0]];

    // Strip the crew down to the lieutenant alone, so he is the only body left.
    for (const id of [...team.memberIds]) {
      const p = w.people[id];
      team.memberIds = team.memberIds.filter((x) => x !== id);
      p.teamId = null;
      gang.poolIds = gang.poolIds.filter((x) => x !== id);
      p.gangId = null;
    }
    const target = freeSiteNear(sim);
    issueOrder(w, gang.id, {
      teamId: team.id,
      type: 'buyPremises',
      buildingIds: [target.id],
      opts: { manpower: 1 },
    });
    playWeek(sim);

    const lt = w.people[team.lieutenantId];
    expect(lt.buildingId).toBeNull();
    expect(target.managerId).not.toBe(lt.id);
    // He is still leading his crew, and counted exactly once.
    expect(w.teams[team.id]?.lieutenantId).toBe(lt.id);
    const counted = gangManpower(w, gang);
    const distinct = new Set<number>();
    for (const t of gang.teamIds.map((id) => w.teams[id])) {
      if (!t) continue;
      distinct.add(t.lieutenantId);
      for (const m of t.memberIds) distinct.add(m);
    }
    for (const id of gang.poolIds) distinct.add(id);
    for (const b of allBuildings(w)) {
      if (b.ownerGangId === gang.id && b.managerId != null) distinct.add(b.managerId);
    }
    expect(counted).toBe(distinct.size);
  });

  it('deletes a disbanded crew\'s orders instead of leaking them', () => {
    const sim = newSim(99);
    const w = sim.world;
    const gang = sim.playerGang;
    const teamId = gang.teamIds[0];
    const target = freeSiteNear(sim);
    issueOrder(w, gang.id, {
      teamId,
      type: 'extort',
      buildingIds: [target.id],
      opts: { manpower: 1 },
    });
    expect(Object.keys(w.orders).length).toBeGreaterThan(0);
    const before = Object.keys(w.orders).length;

    demote(w, gang.id, teamId);
    expect(Object.keys(w.orders).length).toBeLessThan(before);
    // Nothing left pointing at a crew that no longer exists.
    for (const o of Object.values(w.orders)) expect(w.teams[o.teamId]).toBeDefined();
  });

  it('charges a campaign only once a week', () => {
    const sim = newSim(1212);
    const w = sim.world;
    const gang = sim.playerGang;
    // Put the gang in a position to stand.
    const lawyer = Object.values(w.people).find((p) => p.role === 'lawyer' && p.gangId == null)!;
    hireRecruit(w, gang.id, lawyer.id, 'pool');
    w.election.active = true;
    w.election.weeksLeft = 4;
    for (const blk of w.blocks.slice(0, 60)) {
      for (const lotId of blk.lotIds) {
        const b = w.buildings[w.lots[lotId].buildingId];
        if (b && b.cls !== 'empty' && b.cls !== 'illegal') b.ownerGangId = gang.id;
      }
    }
    gang.cash = 200_000;
    const started = setRunForOffice(w, gang.id, true);
    expect(started.ok).toBe(true);

    playWeek(sim);
    // Report the actual campaign debit independently of income and wages.
    expect(gang.lastFinanceReport!.campaignCost).toBe(campaignWeeklyCost(w, gang.id));
  });

  it('keeps court case ids apart when a save is loaded', () => {
    const first = newSim(31);
    const w = first.world;
    const gang = first.playerGang;
    const hood = w.people[w.teams[gang.teamIds[0]].memberIds[0]];
    hood.status = 'arrested';
    playWeek(first);
    const caseIds = Object.values(first.world.cases).map((c) => c.id);
    expect(caseIds.length).toBeGreaterThan(0);

    // A fresh Sim resets the module counter; loading must move it past the save.
    newSim(77);
    const restored = Sim.fromSave(JSON.parse(JSON.stringify(first.world)));
    const g2 = restored.playerGang;
    const another = restored.world.people[restored.world.teams[g2.teamIds[0]].memberIds[0]];
    if (another) another.status = 'arrested';
    playWeek(restored);

    const ids = Object.values(restored.world.cases).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns a raided manager to the pool rather than losing him', () => {
    const sim = newSim(64);
    const w = sim.world;
    const gang = sim.playerGang;
    const site = freeSiteNear(sim);
    site.ownerGangId = gang.id;
    site.cls = 'illegal';
    site.typeId = 'casino';
    site.state = 'trading';
    const hood = w.people[w.teams[gang.teamIds[0]].memberIds[0]];
    site.managerId = hood.id;
    hood.buildingId = site.id;
    hood.teamId = null;
    w.teams[gang.teamIds[0]].memberIds = w.teams[gang.teamIds[0]].memberIds.filter((id) => id !== hood.id);

    raidSite(w, sim.rng, site);

    expect(hood.status).toBe('arrested');
    expect(gang.poolIds).toContain(hood.id);
  });

  it('cleans up every reference when somebody is killed', () => {
    const sim = newSim(808);
    const w = sim.world;
    const gang = sim.playerGang;
    const rival = Object.values(w.gangs).find((g) => !g.isPlayer)!;
    const victim = Object.values(w.people).find((p) => p.gangId === rival.id && p.role === 'hood')!;

    // Hold him prisoner and post him as a guard, then kill him.
    victim.status = 'kidnapped';
    victim.capturedBy = gang.id;
    gang.prisonerIds.push(victim.id);
    gang.knownPeople.push(victim.id);
    const site = freeSiteNear(sim);
    site.guardIds.push(victim.id);

    killPerson(w, victim, 'killed for the test');

    expect(gang.prisonerIds).not.toContain(victim.id);
    expect(gang.knownPeople).not.toContain(victim.id);
    expect(site.guardIds).not.toContain(victim.id);
    expect(victim.capturedBy).toBeNull();
    expect(victim.teamId).toBeNull();
    for (const t of Object.values(w.teams)) expect(t.memberIds).not.toContain(victim.id);
  });

  it('gives a defendant at least one planning phase before the verdict', () => {
    const sim = newSim(2468);
    const w = sim.world;
    const gang = sim.playerGang;
    const hood = w.people[w.teams[gang.teamIds[0]].memberIds[0]];
    hood.status = 'arrested';
    playWeek(sim);

    const c = Object.values(w.cases).find((x) => x.defendantId === hood.id);
    expect(c).toBeTruthy();
    // Still to be heard, so there is time to bribe a judge or find a lawyer.
    expect(['awaiting', 'onTrial']).toContain(c!.status);
    expect(c!.weeksToTrial).toBeGreaterThan(0);
  });

  it('reports money earned during the week, not just at the settlement', () => {
    const sim = newSim(1357);
    const w = sim.world;
    const gang = sim.playerGang;
    const target = freeSiteNear(sim);
    issueOrder(w, gang.id, {
      teamId: gang.teamIds[0],
      type: 'raid',
      buildingIds: [target.id],
      opts: { manpower: 2 },
    });
    playWeek(sim);

    const archived = w.lastWeekOrders.find((o) => o.gangId === gang.id && o.type === 'raid');
    expect(archived).toBeTruthy();
    if (archived?.results.some((r) => r.startsWith('Raided'))) {
      // A successful raid must show up in the week's income, not vanish.
      expect(gang.lastWeekIncome.other).toBeGreaterThan(0);
    }
  });

  it('prices a bribe by how the official feels about the gang paying', () => {
    const sim = newSim(555);
    const w = sim.world;
    const player = sim.playerGang;
    const rival = Object.values(w.gangs).find((g) => !g.isPlayer)!;
    const chief = w.people[w.policeChiefId];

    // Hostile but not past the manual's refusal line.
    setAttitude(chief, player.id, { hostility: 180, fear: 0 });
    setAttitude(chief, rival.id, { hostility: 40, fear: 40 });
    const playerPrice = bribePrice(w, chief, player.id);
    const rivalPrice = bribePrice(w, chief, rival.id);
    expect(playerPrice).toBeGreaterThan(rivalPrice);

    // And paying works off that same figure.
    player.cash = playerPrice * 3;
    const lawyer = Object.values(w.people).find((p) => p.role === 'lawyer' && p.gangId == null)!;
    hireRecruit(w, player.id, lawyer.id, 'pool');
    const before = player.cash;
    const res = bribeOfficial(w, player.id, chief.id);
    expect(res.ok).toBe(true);
    expect(player.cash).toBe(before);
    const job = Object.values(w.specialistJobs!).find(j => j.actorId === lawyer.id)!;
    expect(job.quotedPrice).toBe(playerPrice);
    sim.launchWeek();
    for (let i = 0; i < MINUTES_PER_WEEK && job.state !== 'done'; i++) sim.advance(1 / MINUTES_PER_SECOND, 1);
    expect(job.state).toBe('done');
    expect(before - player.cash).toBe(playerPrice);
  });

  it('only prints this week\'s deaths in the obituaries', () => {
    const sim = newSim(31337);
    const w = sim.world;
    const someone = Object.values(w.people).find((p) => p.role === 'citizen')!;
    killPerson(w, someone, 'died in week one');
    playWeek(sim);
    const firstNotice = w.news.filter((n) => n.section === 'deaths').length;

    // A quiet week should not reprint the same name.
    playWeek(sim);
    const notices = w.news.filter((n) => n.section === 'deaths');
    for (const n of notices.slice(firstNotice)) {
      expect(n.body).not.toContain(someone.name);
    }
  });

  it('does not half-hire a lieutenant when every slot is taken', () => {
    const sim = newSim(4242);
    const w = sim.world;
    const gang = sim.playerGang;
    // Fill all eight lieutenant slots.
    while (gang.teamIds.length < 8) {
      const free = Object.values(w.people).find(
        (p) => p.gangId == null && p.status === 'active' && p.role === 'hood',
      )!;
      hireRecruit(w, gang.id, free.id, 'lieutenant');
    }
    expect(gang.teamIds.length).toBe(8);

    const another = Object.values(w.people).find(
      (p) => p.gangId == null && p.status === 'active' && p.role === 'hood',
    )!;
    const res = hireRecruit(w, gang.id, another.id, 'lieutenant');
    // He joins, but as a hood in the pool — never half-hired.
    expect(res.ok).toBe(true);
    expect(another.gangId).toBe(gang.id);
    expect(gang.poolIds).toContain(another.id);
    expect(another.role).toBe('hood');
  });

  it('does not leave a crew leaderless forever', () => {
    const sim = newSim(9090);
    const w = sim.world;
    const gang = sim.playerGang;
    const team = w.teams[gang.teamIds[0]];
    const ltId = team.lieutenantId;
    killPerson(w, w.people[ltId], 'shot');
    playWeek(sim);

    // Either somebody took over, or the crew was disbanded — never a dead
    // lieutenant still holding a slot.
    for (const t of Object.values(w.teams)) {
      const lt = w.people[t.lieutenantId];
      expect(lt).toBeDefined();
      expect(lt.status).not.toBe('dead');
    }
  });

  it('keeps the racket intact across a save and reload', () => {
    const sim = newSim(24680);
    playWeek(sim);
    const before = protectedBuildings(sim.world, sim.playerGang.id).length;
    const restored = Sim.fromSave(JSON.parse(JSON.stringify(sim.world)));
    expect(protectedBuildings(restored.world, restored.playerGang.id).length).toBe(before);
    playWeek(restored);
    expect(restored.world.phase).not.toBe('week');
  });
});
