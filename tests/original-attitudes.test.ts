import { describe, expect, it } from 'vitest';
import { newCampaignOptions } from '../src/app/newGame';
import { attitudeScore, blastFear, effectiveHostility, ownerSquealLevel, fearOf, hostilityOf, initialAttitude, ORIGINAL_ATTITUDE_CONSTANTS, setAttitude, shiftAttitude, weeklyProtectionFear } from '../src/sim/attitudes';
import { hireRecruit, issueOrder, sackPerson } from '../src/sim/api';
import { completeOfficialBribe } from '../src/sim/officials';
import { planGang } from '../src/sim/ai';
import { MINUTES_PER_WEEK } from '../src/sim/constants';
import { MINUTES_PER_SECOND, Sim } from '../src/sim/sim';
import { createWorld } from '../src/sim/citygen';
import { originalElectionCity, originalElectionPoll } from '../src/sim/originalElection';
import { originalElectionVotes } from '../src/sim/originalElectionVotes';
import type { Person } from '../src/sim/types';
import { isValidAreaTarget, killPerson } from '../src/sim/execution';
import { campaignWeeklyCost, enterElection, weeklyPolitics } from '../src/sim/systems/politics';
import { Rng } from '../src/sim/rng';
import { territoryBlocks } from '../src/sim/world';

const person = (id: number, role: Person['role']) => ({ id, role }) as Person;

describe('original hostility and fear channels', () => {
  it('rolls each class within its Constants.xtx range, stably', () => {
    for (let id = 1; id < 400; id++) {
      const owner = initialAttitude(person(id, 'owner'), 2, 'hostility');
      expect(owner).toBeGreaterThanOrEqual(20);
      expect(owner).toBeLessThan(150);
      // 0x5D1FB0: a civilian's fear is its fear roll (−20 + %100) plus its hostility.
      const citizen = person(id, 'citizen');
      const margin = initialAttitude(citizen, 2, 'fear') - initialAttitude(citizen, 2, 'hostility');
      expect(margin).toBeGreaterThanOrEqual(-20);
      expect(margin).toBeLessThan(80);
      const hood = initialAttitude(person(id, 'hood'), 2, 'fear');
      expect(hood).toBeLessThan(128);
      const judge = initialAttitude(person(id, 'judge'), 3, 'hostility');
      expect(judge).toBeGreaterThanOrEqual(128);
      expect(judge).toBeLessThanOrEqual(255);
      expect(initialAttitude(person(id, 'owner'), 2, 'hostility')).toBe(owner);
    }
    expect(ORIGINAL_ATTITUDE_CONSTANTS.hood.hostility.range).toBe(256);
  });

  it('keeps the two channels apart: equal effective values need not be equal inputs', () => {
    const a = { id: 1, role: 'owner', hostility: { 1: 0 }, fear: { 1: 0 } } as unknown as Person;
    const b = { id: 2, role: 'owner', hostility: { 1: 128 }, fear: { 1: 128 } } as unknown as Person;
    expect(effectiveHostility(a, 1)).toBe(effectiveHostility(b, 1));
    // Suppressing self-hostility separates them (review: 64 versus 128).
    expect(effectiveHostility(a, 1, true)).toBe(128);
    expect(effectiveHostility(b, 1, true)).toBe(64);
    shiftAttitude(b, 1, 200, -200);
    expect(hostilityOf(b, 1)).toBe(255);
    expect(fearOf(b, 1)).toBe(0);
  });

  it('seeds shopkeepers near each HQ with the original distance bands', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 1928 }).world;
    const hq = Object.values(w.buildings).find(b => b.isHQ && w.gangs[b.ownerGangId!].isPlayer)!;
    const gangId = hq.ownerGangId!, block = w.blocks[hq.blockId];
    const near = Object.values(w.buildings).filter(b => {
      const nb = w.blocks[b.blockId];
      return b.ownerPersonId != null && b.ownerGangId == null && nb.id !== block.id &&
        Math.abs(nb.gx - block.gx) + Math.abs(nb.gy - block.gy) === 1;
    });
    expect(near.length).toBeGreaterThan(0);
    for (const b of near) {
      const owner = w.people[b.ownerPersonId!];
      expect(owner.hostility?.[gangId]).toBeLessThan(70);   // bands 0..2: rand % 50..70
      // Fear = band + hostility, so the effective value is fixed by the band.
      expect(owner.fear![gangId] - owner.hostility![gangId]).toBeGreaterThanOrEqual(90);
      expect(effectiveHostility(owner, gangId)).toBeLessThanOrEqual(83);
    }
  });
});

describe('original election tally in the live world', () => {
  it('builds the original inputs and gives a two-way result that sums to 100', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 404 }).world;
    const judge = w.judgeIds[0];
    w.election.active = true;
    w.election.candidates = [{ id: w.mayorId, kind: 'mayor', gangId: null, votes: 0 }, { id: judge, kind: 'judge', gangId: null, votes: 0 }];
    const city = originalElectionCity(w)!;
    expect(city.blocks).toHaveLength(1280);
    expect(city.avenueColumns).toHaveLength(4);
    expect(city.riverBlocks.length).toBeGreaterThan(0);
    const poll = originalElectionPoll(w)!;
    expect(poll.votes.get(w.mayorId)! + poll.votes.get(judge)!).toBe(100);
  });

  it('scores a standing gang from its territory with the literal 500-block civic floor', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 404 }).world;
    const gang = Object.values(w.gangs).find(g => g.isPlayer)!;
    w.election.active = true;
    w.election.candidates = [
      { id: w.mayorId, kind: 'mayor', gangId: null, votes: 0 }, { id: w.judgeIds[0], kind: 'judge', gangId: null, votes: 0 },
      { id: gang.bossId, kind: 'gang', gangId: gang.id, votes: 0 }];
    const city = originalElectionCity(w)!;
    const result = originalElectionVotes(city);
    expect(result.civicPool).toBeGreaterThanOrEqual(500);
    expect(result.percentages.slice(0, 3).reduce((a, b) => a + b, 0)).toBe(100);
    expect(originalElectionPoll(w)!.votes.get(gang.bossId)).toBe(result.percentages[2]);
  });
});

describe('original election lifecycle', () => {
  it('calls an election the moment the mayor dies, with two judges as principals', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 77 }).world;
    expect(w.election.active).toBe(false);
    killPerson(w, w.people[w.mayorId], 'test');
    expect(w.election.active).toBe(true);
    const civic = w.election.candidates.filter(c => c.kind !== 'gang');
    expect(civic.map(c => c.kind)).toEqual(['judge', 'judge']);
    expect(civic.reduce((sum, c) => sum + c.votes, 0)).toBe(100);
  });

  it('replaces a principal who dies during the race', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 77 }).world;
    killPerson(w, w.people[w.mayorId], 'test');
    const [first] = w.election.candidates;
    killPerson(w, w.people[first.id], 'test');
    const civic = w.election.candidates.filter(c => c.kind !== 'gang');
    expect(civic).toHaveLength(2);
    expect(civic.some(c => c.id === first.id)).toBe(false);
  });

  it('refills a principal lost to jail at the next weekly pass (0x4BD310 → 0x4BD090)', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 77 }).world;
    killPerson(w, w.people[w.mayorId], 'test');
    const jailed = w.election.candidates[0];
    w.people[jailed.id].status = 'jailed';
    weeklyPolitics(w, new Rng(3));
    const civic = w.election.candidates.filter(c => c.kind !== 'gang');
    expect(civic).toHaveLength(2);
    expect(civic.some(c => c.id === jailed.id)).toBe(false);
  });

  it('bills the campaign in original 0..255 land values', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 77 }).world;
    const gang = Object.values(w.gangs)[0];
    const blocks = territoryBlocks(w, gang.id);
    expect(blocks.length).toBeGreaterThan(0);
    expect(campaignWeeklyCost(w, gang.id)).toBe(Math.trunc(blocks.reduce((s, b) => s + b.original!.landValue, 0) / 4));
  });
});

describe('weekly premises attitudes (0x527640)', () => {
  it('lowers a paying shopkeeper’s fear of the protecting gang by 5', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 404 }).world;
    const b = Object.values(w.buildings).find(x => x.protection && x.ownerPersonId != null && x.state === 'trading')!;
    const owner = w.people[b.ownerPersonId!], g = b.protection!.gangId, before = fearOf(owner, g);
    weeklyProtectionFear(w);
    expect(fearOf(owner, g)).toBe(Math.max(0, before - 5));
    // Flags 1 and 8 (0x4CD730): a week with a collection call, paid or
    // refused, keeps his fear; refusing in itself does not.
    b.protection!.refusing = true;
    weeklyProtectionFear(w);
    expect(fearOf(owner, g)).toBe(Math.max(0, before - 10));
    b.protection!.refusedWeek = w.week - 1;
    weeklyProtectionFear(w);
    expect(fearOf(owner, g)).toBe(Math.max(0, before - 10));
  });
});

describe('gang membership writers (0x6D87A0, 0x48D0B0)', () => {
  it('leaving a gang adds the original 64 hostility and leaves fear alone', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 404 }).world;
    const gang = Object.values(w.gangs).find(g => g.isPlayer)!;
    const hood = Object.values(w.people).find(p => p.gangId === gang.id && p.role === 'hood' && p.status === 'active')!;
    const h = hostilityOf(hood, gang.id), f = fearOf(hood, gang.id);
    expect(sackPerson(w, gang.id, hood.id).ok).toBe(true);
    expect(hostilityOf(hood, gang.id)).toBe(Math.min(255, h + 64));
    expect(fearOf(hood, gang.id)).toBe(f);
  });

  it('a member’s death makes every remaining member 16 more afraid of the gang', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 404 }).world;
    const gang = Object.values(w.gangs).find(g => g.isPlayer)!;
    const members = Object.values(w.people).filter(p => p.gangId === gang.id && p.status !== 'dead');
    const victim = members.find(p => p.role === 'hood')!, others = members.filter(p => p !== victim);
    const before = others.map(p => fearOf(p, gang.id));
    killPerson(w, victim, 'test');
    others.forEach((p, i) => expect(fearOf(p, gang.id)).toBe(Math.min(255, before[i] + 16)));
  });

  it('an official taking a bribe changes the remake opinion only', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 404 }).world;
    const gang = Object.values(w.gangs).find(g => g.isPlayer)!;
    const judge = w.people[w.judgeIds[0]];
    gang.cash = 100_000;
    setAttitude(judge, gang.id, { hostility: 128, fear: 0 });   // not so hostile he refuses
    const h = hostilityOf(judge, gang.id), f = fearOf(judge, gang.id), opinion = judge.opinion[gang.id] ?? 0;
    expect(completeOfficialBribe(w, gang.id, judge, 500).ok).toBe(true);
    expect(judge.opinion[gang.id]).toBeGreaterThan(opinion);
    expect([hostilityOf(judge, gang.id), fearOf(judge, gang.id)]).toEqual([h, f]);
  });
});

describe('protection collection in the original city (0x4CD730)', () => {
  it('a shopkeeper at or above 180 effective hostility refuses and grows 16 more hostile', () => {
    const sim = new Sim({ ...newCampaignOptions(), seed: 404 });
    const w = sim.world, gang = sim.playerGang, team = w.teams[gang.teamIds[0]];
    const site = Object.values(w.buildings).find(b => b.protection?.gangId === gang.id && b.ownerPersonId != null && b.state === 'trading')!;
    const owner = w.people[site.ownerPersonId!];
    setAttitude(owner, gang.id, { hostility: 200, fear: 0 });   // effective (200 + 256) >> 1 = 228
    site.protection!.refusing = false;
    const income = gang.finances!.income.protection;
    const result = issueOrder(w, gang.id, { teamId: team.id, type: 'collectProtection', buildingIds: [site.id], opts: { priority: true, manpower: 1 } });
    expect(result.ok).toBe(true);
    const order = w.orders[team.orderIds.at(-1)!];
    sim.launchWeek();
    for (let i = 0; i < MINUTES_PER_WEEK - 1 && !['done', 'failed'].includes(order.state); i++) sim.advance(1 / MINUTES_PER_SECOND, 1);
    expect(gang.finances!.income.protection).toBe(income);
    expect(hostilityOf(owner, gang.id)).toBe(216);
  }, 120000);
});

describe('extortion in the original city (0x4DD9C0)', () => {
  it('a refusal leaves the owner as he was, so the next attempt is no harder', () => {
    const sim = new Sim({ ...newCampaignOptions(), seed: 404 });
    const w = sim.world, gang = sim.playerGang, team = w.teams[gang.teamIds[0]];
    const site = Object.values(w.buildings)
      .find(b => !b.protection && b.ownerPersonId != null && b.state === 'trading' && isValidAreaTarget(w, gang.id, 'extort', b))!;
    const owner = w.people[site.ownerPersonId!];
    // A sour owner is hard to move, so the first visit is all but sure to be refused.
    owner.opinion[gang.id] = -60;
    const before = { opinion: -60, hostility: hostilityOf(owner, gang.id), fear: fearOf(owner, gang.id) };
    expect(issueOrder(w, gang.id, { teamId: team.id, type: 'extort', buildingIds: [site.id], opts: { priority: true, manpower: 2 } }).ok).toBe(true);
    const order = w.orders[team.orderIds.at(-1)!];
    sim.launchWeek();
    for (let i = 0; i < MINUTES_PER_WEEK - 1 && !['done', 'failed'].includes(order.state); i++) sim.advance(1 / MINUTES_PER_SECOND, 1);
    expect(order.results.join(' ')).toContain('refused your protection');
    expect({ opinion: owner.opinion[gang.id], hostility: hostilityOf(owner, gang.id), fear: fearOf(owner, gang.id) }).toEqual(before);
  }, 120000);
});

describe('owner squeal level (0x5A4520)', () => {
  it('is hostility + 125 − fear, +20 where the gang has no influence, clamped to a byte', () => {
    const owner = { id: 9, role: 'owner', hostility: {}, fear: {} } as unknown as Person;
    setAttitude(owner, 2, { hostility: 90, fear: 20 });
    expect(ownerSquealLevel(owner, 2, true)).toBe(195);
    expect(ownerSquealLevel(owner, 2, false)).toBe(215);
    setAttitude(owner, 2, { hostility: 250, fear: 0 });
    expect(ownerSquealLevel(owner, 2, false)).toBe(255);
  });

  it('a short-paying owner above 200 squeals (+5 evidence); one at or below does not', () => {
    for (const [hostility, fear, squeals] of [[100, 20, true], [40, 0, false]] as const) {
      const sim = new Sim({ ...newCampaignOptions(), seed: 404 });
      const w = sim.world, gang = sim.playerGang, team = w.teams[gang.teamIds[0]];
      const site = Object.values(w.buildings).find(b => b.protection?.gangId === gang.id && b.ownerPersonId != null && b.state === 'trading')!;
      const owner = w.people[site.ownerPersonId!];
      // Effective hostility (168 / 148) stays under 180, so this is the till-short
      // branch; squeal level 205+ against 165+ (20 more without influence).
      setAttitude(owner, gang.id, { hostility, fear });
      site.protection!.refusing = true;
      gang.evidence = 0;
      issueOrder(w, gang.id, { teamId: team.id, type: 'collectProtection', buildingIds: [site.id], opts: { priority: true, manpower: 1 } });
      const order = w.orders[team.orderIds.at(-1)!];
      sim.launchWeek();
      for (let i = 0; i < MINUTES_PER_WEEK - 1 && !['done', 'failed'].includes(order.state); i++) sim.advance(1 / MINUTES_PER_SECOND, 1);
      expect(w.messages.some(m => m.text.includes('squealed to the police about your hoods'))).toBe(squeals);
    }
  }, 240000);
});

describe('AI in a race led by a civic candidate (0x6AFA90 child 36)', () => {
  it('bribes the leading principal when it has a lawyer and the money', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 77 }).world;
    const gang = Object.values(w.gangs).find(g => !g.isPlayer)!;
    const lawyer = Object.values(w.people).find(p => p.role === 'lawyer' && p.gangId == null && p.status === 'active')!;
    lawyer.gangId = gang.id; gang.lawyerId = lawyer.id; gang.cash = 500_000; gang.runningForOffice = true;
    const [a, b] = w.judgeIds;
    w.election = { ...w.election, active: true, weeksLeft: 4, candidates: [
      { id: a, kind: 'judge', gangId: null, votes: 60 }, { id: b, kind: 'judge', gangId: null, votes: 30 },
      { id: gang.bossId, kind: 'gang', gangId: gang.id, votes: 10 }] };
    planGang(w, new Rng(5), gang);
    expect(Object.values(w.specialistJobs ?? {}).some(j => j.gangId === gang.id && j.type === 'bribeOfficials' && j.targetPersonId === a)).toBe(true);
  });
});

describe('the election result stays on record for the week after the poll', () => {
  it('records the final tally and winner when the race concludes', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 77 }).world;
    killPerson(w, w.people[w.mayorId], 'test');
    w.election.beganInWeek = false; w.election.weeksLeft = 1;
    weeklyPolitics(w, new Rng(9));
    expect(w.election.active).toBe(false);
    const result = w.election.lastResult!;
    expect(result.week).toBe(w.week);
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.winnerId).toBe(w.mayorId);
    expect(Math.max(...result.candidates.map(c => c.votes))).toBe(result.candidates.find(c => c.id === result.winnerId)!.votes);
  });
});

describe('map overlays read the original channels in the original city', () => {
  it('scores friendliness from effective hostility (128 neutral), opinion in compact cities', () => {
    const w = createWorld({ ...newCampaignOptions(), seed: 404 }).world;
    const p = Object.values(w.people).find(q => q.role === 'owner')!, g = Object.values(w.gangs)[0].id;
    setAttitude(p, g, { hostility: 0, fear: 128 });      // effective 64: supports
    expect(attitudeScore(w, p, g)).toBe(50);
    setAttitude(p, g, { hostility: 255, fear: 0 });      // effective 255: rejects
    expect(attitudeScore(w, p, g)).toBeLessThan(-99);
    p.opinion[g] = 42; delete w.cityLayout!.original;
    expect(attitudeScore(w, p, g)).toBe(42);
  });
});

describe('bomb and smash-up fear (0x4DE430)', () => {
  it('frightens the victim and every occupied premises within five blocks, most of all the racket', () => {
    const sim = new Sim({ ...newCampaignOptions(), seed: 404 });
    const w = sim.world, gang = sim.playerGang;
    const occupied = Object.values(w.buildings).filter(b => b.ownerPersonId != null && b.cls !== 'empty' && w.people[b.ownerPersonId]?.status !== 'dead');
    const target = occupied.find(b => b.ownerGangId !== gang.id && b.protection?.gangId !== gang.id)!;
    const centre = w.blocks[target.blockId];
    const near = occupied.find(b => b !== target && b.protection == null && b.ownerGangId == null &&
      Math.max(Math.abs(w.blocks[b.blockId].gx - centre.gx), Math.abs(w.blocks[b.blockId].gy - centre.gy)) <= 5)!;
    const far = occupied.find(b => Math.max(Math.abs(w.blocks[b.blockId].gx - centre.gx), Math.abs(w.blocks[b.blockId].gy - centre.gy)) > 5)!;
    const racket = occupied.find(b => b !== target && b.protection?.gangId === gang.id &&
      Math.max(Math.abs(w.blocks[b.blockId].gx - centre.gx), Math.abs(w.blocks[b.blockId].gy - centre.gy)) <= 5);
    const fear = (b: typeof target) => fearOf(w.people[b.ownerPersonId!], gang.id);
    const before = { target: fear(target), near: fear(near), far: fear(far), racket: racket && fear(racket) };
    blastFear(w, gang.id, target, 100);
    expect(fear(target)).toBe(Math.min(255, before.target + 48 + 8));   // direct, then its own premises in the area
    expect(fear(near)).toBe(Math.min(255, before.near + 8));
    expect(fear(far)).toBe(before.far);
    if (racket) expect(fear(racket)).toBe(Math.min(255, before.racket! + 48));
  });
});

describe('a candidate who loses his lawyer (original city)', () => {
  it('stays in the race: the lawyer is needed only to enter (0x4BD310 never reads him)', () => {
    const sim = new Sim({ ...newCampaignOptions(), seed: 404 });
    const w = sim.world, gang = sim.playerGang;
    const lawyer = Object.values(w.people).find(p => p.role === 'lawyer' && p.gangId == null && p.status === 'active')!;
    expect(hireRecruit(w, gang.id, lawyer.id, 'pool').ok).toBe(true);
    gang.cash = 10_000_000;
    // Enough territory to enter: one protected premises in each of 120 blocks.
    const byBlock = new Map<number, (typeof w.buildings)[number]>();
    for (const b of Object.values(w.buildings)) if (b.state === 'trading' && b.ownerGangId == null && b.protection == null && !byBlock.has(b.blockId)) byBlock.set(b.blockId, b);
    [...byBlock.values()].slice(0, 120).forEach(b => { b.protection = { gangId: gang.id, weekly: 100, base: 100, refusing: false, grievance: 0 }; });
    killPerson(w, w.people[w.mayorId], 'campaign fixture');
    expect(enterElection(w, gang.id)).toBe(true);
    killPerson(w, lawyer, 'lawyer lost mid-campaign');
    w.week++;
    weeklyPolitics(w, sim.rng);
    expect(w.election.candidates.some(c => c.gangId === gang.id)).toBe(true);
    expect(gang.runningForOffice).toBe(true);
  });
});

describe('a real campaign in the original city', () => {
  function campaign(blocks: number) {
    const sim = new Sim({ ...newCampaignOptions(), seed: 404 });
    const w = sim.world, gang = sim.playerGang;
    const lawyer = Object.values(w.people).find(p => p.role === 'lawyer' && p.gangId == null && p.status === 'active')!;
    expect(hireRecruit(w, gang.id, lawyer.id, 'pool').ok).toBe(true);
    gang.cash = 10_000_000;
    // Territory fixture: one protected premises per block, nearest the HQ first.
    const hq = Object.values(w.buildings).find(b => b.isHQ && b.ownerGangId === gang.id)!, home = w.blocks[hq.blockId];
    const byBlock = new Map<number, typeof hq>();
    for (const b of Object.values(w.buildings)) if (b.state === 'trading' && b.ownerGangId == null && b.protection == null && !byBlock.has(b.blockId)) byBlock.set(b.blockId, b);
    [...byBlock.values()].sort((a, c) => Math.hypot(w.blocks[a.blockId].gx - home.gx, w.blocks[a.blockId].gy - home.gy) - Math.hypot(w.blocks[c.blockId].gx - home.gx, w.blocks[c.blockId].gy - home.gy))
      .slice(0, blocks).forEach(b => { b.protection = { gangId: gang.id, weekly: 100, base: 100, refusing: false, grievance: 0 }; });
    killPerson(w, w.people[w.mayorId], 'campaign fixture');
    expect(w.election.active).toBe(true);
    expect(enterElection(w, gang.id)).toBe(true);
    const polls: number[] = [];
    for (let i = 0; i < 12 && w.election.active; i++) {
      w.week++;
      const expected = originalElectionPoll(w)!.votes.get(gang.bossId);
      weeklyPolitics(w, sim.rng);
      if (w.election.active) { expect(w.election.candidates.find(c => c.gangId === gang.id)!.votes).toBe(expected); polls.push(expected!); }
    }
    expect(w.election.active).toBe(false);
    const result = w.election.lastResult!, top = [...result.candidates].sort((a, b) => b.votes - a.votes)[0];
    expect(result.winnerId).toBe(top.id);
    return { w, gang, result, top, polls };
  }

  it('the original tally decides each week and the winner takes office', () => {
    const outcomes = new Set<string>();
    for (const blocks of [700, 120]) {
      const { w, gang, top, polls } = campaign(blocks);
      expect(polls.length).toBeGreaterThan(0);
      if (top.kind === 'gang') { expect(w.electionWinnerGangId).toBe(gang.id); outcomes.add('gang'); }
      else { expect(w.mayorId).toBe(top.id); expect(w.people[top.id].role).toBe('mayor'); outcomes.add('civic'); }
    }
    expect(outcomes).toEqual(new Set(['gang', 'civic']));
  }, 240000);
});
