import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { defaultGameOptions } from '../src/app/newGame';
import { selectableOrderSite } from '../src/app/orderSelection';
import { cancelOrder, defaultOptions, issueOrder, nearTerritory, quoteBuildingSale, sellBuilding, validBuildingTarget } from '../src/sim/api';
import { addNews, reportBusinessMove } from '../src/sim/events';
import { beginWeekOrders, tickOrders } from '../src/sim/execution';
import { deliveredNewspaper, newspaperEdition, newspaperNameIndex, publishingNewspapers } from '../src/sim/newspaper';
import { Sim } from '../src/sim/sim';
import { weeklyNews } from '../src/sim/systems/news';
import { weeklyOpinion } from '../src/sim/systems/opinion';
import type { CrimeRecord, OrderType, OrderOptions } from '../src/sim/types';
import { NewspaperContent } from '../src/ui/organizer/NewspaperTab';

function fixture() {
  const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10, startHoods: 8 });
  const w = sim.world, g = sim.playerGang;
  w.orders = {}; w.news = []; g.cash = 500000;
  for (const team of Object.values(w.teams)) { team.orderIds = []; team.timeUsed = 0; }
  const papers = publishingNewspapers(w);
  const hq = Object.values(w.buildings).find(b => b.ownerGangId === g.id && b.isHQ)!;
  const site = Object.values(w.buildings).find(b => nearTerritory(w, g.id, b.blockId, 2) && b.cls === 'commercial' && b.typeId !== 'newspaper' && !b.isHQ && b.hidesId == null)!;
  site.ownerGangId = null; site.protection = null; site.typeId = 'departmentStore'; site.state = 'trading';
  const team = w.teams[g.teamIds[0]];
  return { sim, w, g, papers, hq, site, team };
}

function execute(s: ReturnType<typeof fixture>, type: OrderType, buildingId: number, opts: Partial<OrderOptions> = {}) {
  const result = issueOrder(s.w, s.g.id, { teamId: s.team.id, type, buildingIds: [buildingId], opts });
  expect(result).toMatchObject({ ok: true });
  const order = s.w.orders[s.team.orderIds.at(-1)!];
  beginWeekOrders(s.w);
  for (let i = 0; i < 2400 && !['done', 'failed'].includes(order.state); i++) tickOrders(s.w, s.sim.rng, 1);
  expect(order.state, order.failReason ?? order.results.join('; ')).toBe('done');
  return order;
}

describe('newspaper delivery and editions', () => {
  it('delivers the nearest main-office paper, then prefers the nearest owned paper', () => {
    const s = fixture(), home = s.w.lots[s.hq.lotId].center;
    s.papers.forEach((paper, index) => { s.w.lots[paper.lotId].center = { x: home.x + 20 + index * 20, y: home.y }; });
    expect(deliveredNewspaper(s.w, s.g.id)?.id).toBe(s.papers[0].id);
    s.papers[2].ownerGangId = s.g.id; s.papers[3].ownerGangId = s.g.id;
    expect(deliveredNewspaper(s.w, s.g.id)?.id).toBe(s.papers[2].id);
    s.w.week++;
    expect(deliveredNewspaper(s.w, s.g.id)?.id).toBe(s.papers[2].id);
    s.papers[2].state = 'ceased';
    expect(deliveredNewspaper(s.w, s.g.id)?.id).toBe(s.papers[3].id);
    s.papers[3].state = 'destroyed';
    expect(deliveredNewspaper(s.w, s.g.id)?.id).toBe(s.papers[0].id);
    s.papers.forEach(p => p.state = 'ceased');
    expect(deliveredNewspaper(s.w, s.g.id)).toBeNull();
  });

  it('retains masthead names and falls back to the same corner in old saves', () => {
    const s = fixture();
    for (const [index, paper] of s.papers.entries()) {
      expect(newspaperNameIndex(s.w, paper)).toBe(index);
      delete paper.paperName;
      expect(newspaperNameIndex(s.w, paper)).toBe(index);
    }
    expect(() => Sim.fromSave(structuredClone(s.w))).not.toThrow();
  });

  it('opens with a headline, without borrowing news from the unplayed week', () => {
    const s = fixture();
    addNews(s.w, { section: 'business', headline: 'Unfinished week', body: 'Not published yet', gangId: null });
    const before = structuredClone(s.w);
    expect(newspaperEdition(s.w, s.g.id).items.map(n => n.headline)).toEqual(['WELCOME TO NEW TEMPERANCE']);
    expect(s.w).toEqual(before);
    s.w.week = 2;
    expect(newspaperEdition(s.w, s.g.id).items.map(n => n.headline)).toEqual(['Unfinished week']);
    addNews(s.w, { section: 'law', headline: 'Next edition', body: '', gangId: null });
    expect(newspaperEdition(s.w, s.g.id).items).toHaveLength(1);
    s.w.week = 3;
    expect(newspaperEdition(s.w, s.g.id).items.map(n => n.headline)).toEqual(['Next edition']);
  });

  it('shows the latest front headline and never prints private week logs', () => {
    const s = fixture();
    addNews(s.w, { section: 'front', headline: 'Earlier headline', body: 'Earlier story', gangId: null });
    addNews(s.w, { section: 'front', headline: 'Latest headline', body: 'Latest story', gangId: null });
    s.w.week = 2; s.w.weekLog.push('Secret rival orders');
    const markup = renderToStaticMarkup(createElement(NewspaperContent, { sim: s.sim }));
    expect(markup).toContain('<h2>Latest headline</h2>');
    expect(markup).not.toContain('Secret rival orders');
    expect(markup).not.toContain('Law Enforcement');
    expect(markup).toContain('aria-pressed="true"');
  });
});

describe('business reporting from real transactions', () => {
  it('allows a newspaper in the map picker and buys it through the order system', () => {
    const s = fixture(), paper = s.papers[0];
    // Extend legitimate purchase reach to the newspaper's block.
    const block = s.w.blocks[paper.blockId];
    const anchor = Object.values(s.w.buildings).find(b => b.id !== paper.id && b.cls === 'commercial' &&
      Math.abs(s.w.blocks[b.blockId].gx - block.gx) <= 1 && Math.abs(s.w.blocks[b.blockId].gy - block.gy) <= 1)!;
    anchor.protection = { gangId: s.g.id, weekly: 100, base: 100, grievance: 0, refusing: false };
    expect(selectableOrderSite(s.w, s.g.id, { type: 'buyPremises', opts: defaultOptions() }, paper)).toBe(true);
    const cash = s.g.cash;
    execute(s, 'buyPremises', paper.id);
    expect(paper.ownerGangId).toBe(s.g.id); expect(paper.managerId).not.toBeNull(); expect(s.g.cash).toBeLessThan(cash);
    expect(deliveredNewspaper(s.w, s.g.id)?.id).toBe(paper.id);
    expect(s.w.news).toHaveLength(1); expect(s.w.news[0].paperOwnerId).toBe(s.g.id);
    const municipal = { ...s.site, typeId: 'cityHall', cls: 'municipal' as const };
    expect(validBuildingTarget(s.w, s.g.id, 'buyPremises', municipal, defaultOptions())).toBe(false);
  });

  it.each(['bankSmall', 'bankLarge'])('permits buying %s as specified by the building appendix', typeId => {
    const s = fixture(); s.site.typeId = typeId;
    expect(selectableOrderSite(s.w, s.g.id, { type: 'buyPremises', opts: defaultOptions() }, s.site)).toBe(true);
    execute(s, 'buyPremises', s.site.id);
    expect(s.site.ownerGangId).toBe(s.g.id); expect(s.site.managerId).not.toBeNull();
    expect(s.w.news.filter(n => n.section === 'business')).toHaveLength(1);
  });

  it('reports a completed purchase once and does not invent new purchases in later weeks', () => {
    const s = fixture(); execute(s, 'buyPremises', s.site.id);
    expect(s.w.news.filter(n => n.section === 'business')).toHaveLength(1);
    expect(s.w.news[0].body).toContain('was bought');
    weeklyNews(s.w, s.sim.rng); s.w.week++; weeklyNews(s.w, s.sim.rng);
    expect(s.w.news.filter(n => n.section === 'business')).toHaveLength(1);
  });

  it('records a successful legal fit-out, but no secret illegal operation', () => {
    const s = fixture(); s.site.ownerGangId = s.g.id; s.site.typeId = 'emptyLand'; s.site.cls = 'empty';
    execute(s, 'setUpBusiness', s.site.id, { businessTypeId: 'departmentStore' });
    expect(s.w.news).toHaveLength(1); expect(s.w.news[0].body).toContain('was established');
    s.site.cls = 'illegal';
    reportBusinessMove(s.w, s.g.id, s.site, 'established');
    expect(s.w.news).toHaveLength(1);
  });

  it('reports only the accepted sale, preserving the preceding edition during planning', () => {
    const s = fixture(); s.site.ownerGangId = s.g.id;
    const offer = quoteBuildingSale(s.w, s.g.id, s.site.id); expect(offer.ok).toBe(true);
    if (!offer.ok) throw Error(offer.error);
    expect(s.w.news).toHaveLength(0);
    expect(sellBuilding(s.w, s.g.id, s.site.id, offer.value + 1).ok).toBe(false); expect(s.w.news).toHaveLength(0);
    expect(sellBuilding(s.w, s.g.id, s.site.id, offer.value).ok).toBe(true);
    expect(s.w.news).toHaveLength(1); expect(s.w.news[0].body).toContain('was sold');
    expect(newspaperEdition(s.w, s.g.id).items.some(n => n.section === 'business')).toBe(false);
    expect(sellBuilding(s.w, s.g.id, s.site.id, offer.value).ok).toBe(false); expect(s.w.news).toHaveLength(1);
  });

  it.each(['cancel', 'unaffordable'] as const)('prints nothing for a %s purchase', reason => {
    const s = fixture();
    expect(issueOrder(s.w, s.g.id, { teamId: s.team.id, type: 'buyPremises', buildingIds: [s.site.id] }).ok).toBe(true);
    const order = s.w.orders[s.team.orderIds[0]];
    if (reason === 'cancel') expect(cancelOrder(s.w, order.id).ok).toBe(true);
    else s.g.cash = 0;
    beginWeekOrders(s.w);
    for (let i = 0; i < 2400 && !['cancelled', 'failed', 'done'].includes(order.state); i++) tickOrders(s.w, s.sim.rng, 1);
    expect(order.state).toBe(reason === 'cancel' ? 'cancelled' : 'failed');
    expect(s.w.news).toHaveLength(0); expect(s.site.ownerGangId).toBeNull();
  });

  it('keeps protected purchases in the owner’s edition across save/restore', () => {
    const s = fixture(), rival = Object.values(s.w.gangs).find(g => !g.isPlayer)!;
    s.papers[0].ownerGangId = s.g.id; s.papers[1].ownerGangId = rival.id;
    execute(s, 'buyPremises', s.site.id); s.w.week = 2;
    const restored = Sim.fromSave(structuredClone(s.w));
    expect(newspaperEdition(restored.world, s.g.id).items.filter(n => n.section === 'business')).toHaveLength(1);
    expect(newspaperEdition(restored.world, rival.id).items.filter(n => n.section === 'business')).toHaveLength(0);
    expect(restored.world.buildings[s.papers[0].id].paperName).toBe(s.papers[0].paperName);
  });

  it.each(['ceased', 'destroyed'] as const)('does not give a %s newspaper purchase secrecy', state => {
    const s = fixture(); s.papers[0].ownerGangId = s.g.id; s.papers[0].state = state;
    execute(s, 'buyPremises', s.site.id);
    expect(s.w.news[0].paperOwnerId).toBeUndefined();
  });
});

describe('accurate weekly summaries', () => {
  it('lists every death and counts actual reported victims once, including street orders', () => {
    const s = fixture(), dead = Object.values(s.w.people).filter(p => p.role === 'citizen').slice(0, 8);
    dead.forEach(p => { p.status = 'dead'; p.diedWeek = s.w.week; });
    const crime = (kind: string, victimId: number | null): CrimeRecord => ({ id: s.w.crimes.length + 1, week: s.w.week,
      gangId: s.g.id, perpetratorId: s.g.bossId, kind, victimId, buildingId: s.site.id, witnesses: [], arrestRisk: .5, reported: true });
    s.w.crimes = [crime('shootout', null), crime('streetKill', dead[0].id), crime('kill', dead[0].id),
      crime('streetAssault', dead[1].id), crime('assault', s.g.bossId), crime('torch', null), crime('bomb', null)];
    s.site.fireWeek = s.w.week;
    s.site.fireInjured = 2;
    s.site.fireDead = 1;
    s.site.state = 'damaged';
    weeklyNews(s.w, s.sim.rng);
    const obituary = s.w.news.find(n => n.section === 'deaths')!.body;
    for (const p of dead) expect(obituary).toContain(p.name);
    expect(s.w.news.filter(n => n.headline === 'SHOOTING IN THE CITY')).toHaveLength(2);
    const fire = s.w.news.find(n => n.photo === 'fire')!;
    expect(fire.body).toContain('2 injured, 1 dead');
    expect(fire.body).toContain('closed pending repairs');
    expect(s.w.news.filter(n => n.photo === 'fire')).toHaveLength(1);
    expect(s.w.news.find(n => n.headline === 'A QUIET WEEK IN NEW TEMPERANCE')).toBeUndefined();
    expect(s.w.news.some(n => n.body.includes('premises were destroyed'))).toBe(false);
  });

  it('stops a closed newspaper from influencing nearby opinion', () => {
    const s = fixture(), paper = s.papers[0]; paper.state = 'ceased';
    const clone = Sim.fromSave(structuredClone(s.w)); clone.world.buildings[paper.id].typeId = 'cafe';
    weeklyOpinion(s.w, s.sim.rng); weeklyOpinion(clone.world, clone.rng);
    expect(Object.values(s.w.people).map(p => p.opinion)).toEqual(Object.values(clone.world.people).map(p => p.opinion));
  });
});
