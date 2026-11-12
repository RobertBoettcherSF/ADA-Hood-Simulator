import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { issueOrder, repairBuilding, sellBuilding, setTrading, shutdownBuilding } from '../src/sim/api';
import { finishBuildingRepairs } from '../src/sim/buildingDamage';
import { finishTradingRestarts } from '../src/sim/businessState';
import { damageBuilding, destroyBuilding } from '../src/sim/execution';
import { MINUTES_PER_WEEK } from '../src/sim/constants';
import { blockRect } from '../src/sim/cityLayout';
import { Sim, MINUTES_PER_SECOND } from '../src/sim/sim';
import { dispatchFbi, fbiWorkPosition, raidSite, tickFbi, weeklyFbi } from '../src/sim/systems/fbi';
import { businessProfit, weeklyEconomy } from '../src/sim/systems/economy';
import { tickAmbient } from '../src/sim/systems/ambient';
import { weeklyLaw } from '../src/sim/systems/law';
import { buildingDoor } from '../src/sim/world';
import { staffFirstCrew } from './helpers/crew';

afterEach(() => vi.restoreAllMocks());
function fixture() {
  const sim = new Sim({...defaultGameOptions(), seed:8642, citySize:10, startMoney:500_000});
  staffFirstCrew(sim);
  const w = sim.world, gang = sim.playerGang;
  w.orders = {};
  for (const t of Object.values(w.teams)) { t.orderIds = []; t.timeUsed = 0; }
  for (const b of Object.values(w.buildings)) if (b.cls === 'illegal') b.state = 'ceased';
  const site = Object.values(w.buildings).find(b => b.cls === 'empty' && w.lots[b.lotId].index === 4)!;
  const front = Object.values(w.buildings).find(b => b.blockId === site.blockId && b.cls !== 'illegal' && b.cls !== 'empty' && b.cls !== 'municipal')!;
  site.ownerGangId = gang.id; site.typeId = 'casino'; site.cls = 'illegal'; site.state = 'trading'; site.cover = .05;
  site.frontId = front.id; front.hidesId = site.id; front.ownerGangId = gang.id; front.state = 'trading';
  site.stock = {liquor:70,stolen:20,counterfeit:3}; gang.suspicion = 90;
  const agent = w.people[w.fbiIds[0]]; w.fbiIds = [agent.id]; agent.pos = {x:9,y:9}; agent.dest = null; agent.path = [];
  return {sim,w,gang,site,front,agent};
}
function step(sim: Sim, minutes = 1) {
  for (let n=0;n<minutes;n++) { sim.world.minute++; tickFbi(sim.world,sim.rng,1); sim.world.rngState=sim.rng.state; }
}
function stageRaid(s: ReturnType<typeof fixture>) {
  s.site.discovered=true; s.site.fbiDiscoveredWeek=1; s.site.fbiRaidWeek=2; s.w.week=2;
  s.sim.launchWeek();
}

describe('FBI investigation and business closure', () => {
  it('does not raid a freshly discovered operation during Friday settlement', () => {
    const s = fixture(); s.site.discovered = true;
    weeklyFbi(s.w,s.sim.rng);
    expect(s.site.state).toBe('trading'); expect(s.site.stock.liquor).toBe(70);
  });

  it('routes the search to the legal front on the pavement, not the block centre', () => {
    const s = fixture(); weeklyFbi(s.w,s.sim.rng); s.sim.launchWeek();
    expect(s.agent.dest).toEqual(buildingDoor(s.w,s.front));
    const r = blockRect(s.w.blocks[s.site.blockId]), d = s.agent.dest!;
    expect(d.x < r.x || d.y < r.y || d.x > r.x+r.w || d.y > r.y+r.h).toBe(true);
  });

  it('cannot execute a raid with every agent unavailable', () => {
    const s = fixture(); s.site.discovered = true; s.agent.status = 'dead';
    weeklyFbi(s.w,s.sim.rng); s.w.week++; weeklyFbi(s.w,s.sim.rng);
    expect(s.site.state).toBe('trading'); expect(s.gang.evidence).toBe(0);
  });

  it('does not let a ceased business start earning again in the same week', () => {
    const s = fixture();
    expect(setTrading(s.w,s.gang.id,s.site.id,false).ok).toBe(true);
    expect(setTrading(s.w,s.gang.id,s.site.id,true).ok).toBe(true);
    expect(s.site.state).toBe('ceased');
  });

  it('requires shutdown before selling an illegal operation', () => {
    const s = fixture(), before = structuredClone(s.w);
    expect(sellBuilding(s.w,s.gang.id,s.site.id).ok).toBe(false); expect(s.w).toEqual(before);
  });

  it('closes a raided operation without imposing bombing damage on the neighbourhood', () => {
    const s = fixture(), block = s.w.blocks[s.site.blockId], value = block.landValue, squalor = block.squalor;
    raidSite(s.w,s.sim.rng,s.site);
    expect(s.site.state).toBe('ceased'); expect(s.site.stock).toEqual({liquor:0,stolen:0,counterfeit:0});
    expect(block.landValue).toBe(value); expect(block.squalor).toBe(squalor);
    expect(setTrading(s.w,s.gang.id,s.site.id,true).ok).toBe(false);
  });

  it('searches on arrival, retains progress through save/load, and schedules next week', () => {
    const s=fixture(); s.agent.pos={x:480,y:480}; s.sim.launchWeek();
    const chance=vi.spyOn(s.sim.rng,'chance').mockReturnValue(true);
    step(s.sim); expect(chance).not.toHaveBeenCalled(); expect(s.site.discovered).toBe(false);
    for(let n=0;n<MINUTES_PER_WEEK&&s.agent.fbiAssignment?.phase!=='working';n++) step(s.sim);
    expect(s.agent.fbiAssignment?.phase).toBe('working');
    // A slow final step can start work on the arrival tick; count from there.
    const atArrival = s.agent.fbiAssignment!.workLeft;
    step(s.sim,7); expect(s.agent.fbiAssignment?.workLeft).toBe(atArrival - 7);
    const remaining = s.agent.fbiAssignment!.workLeft;
    const resumed=Sim.fromSave(structuredClone(s.w));
    vi.spyOn(resumed.rng,'chance').mockReturnValue(true);
    step(s.sim,remaining); step(resumed,remaining);
    expect(resumed.world.buildings[s.site.id]).toEqual(s.site);
    expect(resumed.world.people[s.agent.id]).toEqual(s.agent);
    expect(s.site.fbiDiscoveredWeek).toBe(1); expect(s.site.fbiRaidWeek).toBe(2);
    expect(s.agent.fbiAssignment).toBeUndefined(); expect(s.site.state).toBe('trading');
    s.w.minute=MINUTES_PER_WEEK-1; s.sim.advance(1/MINUTES_PER_SECOND,1);
    expect(s.w.week).toBe(2); expect(s.w.phase).toBe('planning'); expect(s.site.state).toBe('trading');
    s.sim.launchWeek(); expect(s.agent.fbiAssignment?.kind).toBe('raid');
    expect(s.site.state).toBe('trading');
    for(let n=0;n<MINUTES_PER_WEEK&&s.site.fbiClosedWeek==null;n++) step(s.sim);
    expect(s.site.fbiClosedWeek).toBe(2); expect(s.site.state).toBe('ceased');
  });

  it('cannot raid from a distance and resumes the on-site raid after saving', () => {
    const s=fixture(); s.agent.pos={x:480,y:480}; stageRaid(s);
    step(s.sim,5); expect(s.site.fbiClosedWeek).toBeUndefined();
    expect(s.agent.fbiAssignment?.workLeft).toBe(10);
    for(let n=0;n<MINUTES_PER_WEEK&&s.agent.fbiAssignment?.phase!=='working';n++) step(s.sim);
    const atArrival = s.agent.fbiAssignment!.workLeft;
    step(s.sim,4); expect(s.agent.fbiAssignment?.workLeft).toBe(atArrival - 4);
    const resumed=Sim.fromSave(structuredClone(s.w)); step(resumed,atArrival - 4);
    expect(resumed.world.buildings[s.site.id].fbiClosedWeek).toBe(2);
    expect(s.site.fbiClosedWeek).toBeUndefined();
    const g=resumed.playerGang, evidence=g.evidence, news=resumed.world.news.length;
    raidSite(resumed.world,resumed.rng,resumed.world.buildings[s.site.id]);
    expect(g.evidence).toBe(evidence); expect(resumed.world.news).toHaveLength(news);
  });

  it('limits unsuccessful searches to three physical checks per site per week', () => {
    const s=fixture(); s.sim.launchWeek(); const chance=vi.spyOn(s.sim.rng,'chance').mockReturnValue(false);
    step(s.sim,600);
    expect(chance).toHaveBeenCalledTimes(3); expect(s.site.discovered).toBe(false);
    expect(s.site.fbiSearchedWeek).toBe(1); expect(s.agent.fbiAssignment).toBeUndefined();
    s.w.week=2; dispatchFbi(s.w,s.sim.rng); expect(s.agent.fbiAssignment?.kind).toBe('search');
  });

  it('does not move assigned agents twice through the ambient system', () => {
    const s=fixture(); s.agent.pos={x:480,y:480}; s.sim.launchWeek(); step(s.sim);
    const pos={...s.agent.pos}; tickAmbient(s.w,s.sim.rng,1); expect(s.agent.pos).toEqual(pos);
  });

  it('reassigns a due raid after the first agent becomes unavailable', () => {
    const s=fixture(); stageRaid(s); const first=s.agent;
    first.status='dead'; step(s.sim); expect(first.fbiAssignment).toBeUndefined(); expect(s.site.state).toBe('trading');
    const replacement=Object.values(s.w.people).find(p=>p.role==='fbi'&&p.id!==first.id)!;
    s.w.fbiIds.push(replacement.id); dispatchFbi(s.w,s.sim.rng);
    expect(replacement.fbiAssignment?.buildingId).toBe(s.site.id);
    expect(replacement.fbiAssignment?.kind).toBe('raid');
    dispatchFbi(s.w,s.sim.rng);
    expect(s.w.fbiIds.filter(id=>s.w.people[id].fbiAssignment?.buildingId===s.site.id)).toHaveLength(1);
  });

  it('suspends an agent on another live task and resumes its saved work afterward', () => {
    const s=fixture(); stageRaid(s); s.agent.pos=fbiWorkPosition(s.w,s.site); s.agent.dest=null; s.agent.path=[];
    s.agent.streetOrder={type:'goTo',targetPersonId:null,pos:{x:9,y:9}}; step(s.sim,12);
    expect(s.agent.fbiAssignment?.workLeft).toBe(10); expect(s.site.state).toBe('trading');
    s.agent.streetOrder=null; step(s.sim,10); expect(s.site.fbiClosedWeek).toBe(2);
  });

  it('stops searching a ceased site but does not erase a discovery by ceasing later', () => {
    const s=fixture(); s.sim.launchWeek(); setTrading(s.w,s.gang.id,s.site.id,false); step(s.sim);
    expect(s.agent.fbiAssignment).toBeUndefined(); expect(s.site.discovered).toBe(false);
    s.site.discovered=true; s.site.fbiDiscoveredWeek=1; s.site.fbiRaidWeek=2; s.w.week=2;
    dispatchFbi(s.w,s.sim.rng); expect(s.agent.fbiAssignment?.kind).toBe('raid');
  });

  it('closes only the operation, retains its manager on the roster, and records real arrests', () => {
    const s=fixture(), team=s.w.teams[s.gang.teamIds[0]], manager=s.w.people[team.memberIds[0]];
    team.memberIds=team.memberIds.filter(id=>id!==manager.id); manager.teamId=null; manager.buildingId=s.site.id; s.site.managerId=manager.id;
    manager.inVehicle=true; manager.streetOrder={type:'goTo',targetPersonId:null,pos:{x:10,y:10}};
    raidSite(s.w,s.sim.rng,s.site,s.agent);
    expect(manager.status).toBe('arrested'); expect(manager.buildingId).toBeNull(); expect(manager.inVehicle).toBe(false);
    expect(manager.streetOrder).toBeNull(); expect(manager.path).toEqual([]);
    expect(s.gang.poolIds.filter(id=>id===manager.id)).toHaveLength(1);
    expect(s.front.state).toBe('trading'); expect(s.site.frontId).toBe(s.front.id);
    expect(s.w.news.at(-1)!.body).toContain('1 arrest was');
    weeklyLaw(s.w,s.sim.rng);
    expect(Object.values(s.w.cases).some(c=>c.defendantId===manager.id&&c.crime==='operating an illegal business')).toBe(true);
  });

  it('ends guard orders on closure without arresting guards who are not there', () => {
    const s=fixture(), team=s.w.teams[s.gang.teamIds[0]], guard=s.w.people[team.memberIds[0]];
    expect(issueOrder(s.w,s.gang.id,{teamId:team.id,type:'guardBusiness',buildingIds:[s.site.id],opts:{manpower:1,preferredHoodId:guard.id}}).ok).toBe(true);
    s.sim.launchWeek(); const order=s.w.orders[team.orderIds[0]];
    guard.pos={x:480,y:480}; s.site.guardIds=[guard.id];
    vi.spyOn(s.sim.rng,'chance').mockReturnValue(true); raidSite(s.w,s.sim.rng,s.site,s.agent);
    expect(guard.status).toBe('active'); expect(order.state).toBe('failed'); expect(guard.orderId).toBeNull(); expect(s.site.guardIds).toEqual([]);
    expect(s.w.news.at(-1)!.body).toContain('0 arrests');
  });

  it('preserves the cease/restart schedule across a save and retains wages while closed', () => {
    const s=fixture(); setTrading(s.w,s.gang.id,s.site.id,false); setTrading(s.w,s.gang.id,s.site.id,true);
    expect(businessProfit(s.w,s.site,s.sim.rng)).toBe(0);
    const resumed=Sim.fromSave(structuredClone(s.w)), b=resumed.world.buildings[s.site.id];
    expect(b.resumeTradingWeek).toBe(2); weeklyEconomy(resumed.world,resumed.rng);
    expect(b.lastProfit).toBe(0); expect(resumed.playerGang.finances!.costs.wages).toBeGreaterThan(0);
    resumed.world.week=2; finishTradingRestarts(resumed.world); expect(b.state).toBe('trading'); expect(b.resumeTradingWeek).toBeUndefined();
    const cancelled=fixture(); setTrading(cancelled.w,cancelled.gang.id,cancelled.site.id,false);
    setTrading(cancelled.w,cancelled.gang.id,cancelled.site.id,true); setTrading(cancelled.w,cancelled.gang.id,cancelled.site.id,false);
    cancelled.w.week=2; finishTradingRestarts(cancelled.w); expect(cancelled.site.state).toBe('ceased');
  });

  it('clears a shutdown investigation and lets the empty land be sold', () => {
    const s=fixture(); stageRaid(s); const cash=s.gang.cash;
    expect(shutdownBuilding(s.w,s.gang.id,s.site.id).ok).toBe(true);
    expect(s.agent.fbiAssignment).toBeUndefined(); expect(s.site.discovered).toBe(false); expect(s.site.fbiRaidWeek).toBeUndefined();
    expect(s.front.hidesId).toBeNull(); expect(s.site.cls).toBe('empty');
    step(s.sim,60); expect(s.gang.evidence).toBe(0);
    expect(sellBuilding(s.w,s.gang.id,s.site.id).ok).toBe(true); expect(s.gang.cash).toBeGreaterThan(cash);
  });

  it('cannot reopen a federally closed operation by repairing its facade or installing a manager', () => {
    const s=fixture(); raidSite(s.w,s.sim.rng,s.site); s.site.state='damaged'; s.site.repairCost=100;
    expect(repairBuilding(s.w,s.gang.id,s.site.id).ok).toBe(true); expect(s.site.state).toBe('ceased');
    const team=s.w.teams[s.gang.teamIds[0]];
    expect(issueOrder(s.w,s.gang.id,{teamId:team.id,type:'runBusiness',buildingIds:[s.site.id]}).ok).toBe(false);
    expect(issueOrder(s.w,s.gang.id,{teamId:team.id,type:'setUpBusiness',buildingIds:[s.site.id],opts:{businessTypeId:'casino',frontBuildingId:s.front.id}}).ok).toBe(false);
    s.site.state='damaged'; s.site.fireWeek=1; s.site.repairCompleteWeek=2; s.w.week=2;
    finishBuildingRepairs(s.w); expect(s.site.state).toBe('ceased'); expect(s.site.fbiClosedWeek).toBe(1);
  });

  it.each(['warehouse','laundering'] as const)('investigates %s as well as hidden illegal businesses', kind => {
    const s=fixture(); s.site.state='ceased'; const b=s.front;
    if(kind==='warehouse') {b.typeId='warehouse';b.cls='industrial';b.stock.stolen=20;}
    else {b.typeId='jewellers';b.cls='commercial';b.stock.counterfeit=2;weeklyEconomy(s.w,s.sim.rng);expect(b.stock.counterfeit).toBe(0);expect(b.launderingWeek).toBe(1);}
    s.sim.launchWeek(); expect(s.agent.fbiAssignment?.buildingId).toBe(b.id);
    vi.spyOn(s.sim.rng,'chance').mockReturnValue(true);
    for(let n=0;n<300&&!b.discovered;n++) step(s.sim);
    expect(b.discovered).toBe(true); expect(b.fbiRaidWeek).toBe(2);
  });

  it('uses living head competence and physically present front guards in search chances', () => {
    function firstChance(skill:number, dead=false, remoteGuard=false, liveGuard=false) {
      const s=fixture(); s.w.people[s.w.fbiHeadId].skills.intelligence=skill;
      if(dead)s.w.people[s.w.fbiHeadId].status='dead';
      const guard=s.w.people[s.w.teams[s.gang.teamIds[0]].memberIds[0]];
      if(remoteGuard||liveGuard) {s.front.guardIds=[guard.id];guard.pos=liveGuard?buildingDoor(s.w,s.front):{x:480,y:480};}
      s.sim.launchWeek(); if(remoteGuard||liveGuard)s.front.guardIds=[guard.id];
      s.agent.pos=fbiWorkPosition(s.w,s.site);s.agent.dest=null;s.agent.path=[];
      const chance=vi.spyOn(s.sim.rng,'chance').mockReturnValue(false);step(s.sim,20);return chance.mock.calls[0][0];
    }
    expect(firstChance(5)).toBeGreaterThan(firstChance(.5));
    expect(firstChance(5,true)).toBe(firstChance(.5));
    expect(firstChance(3,false,true)).toBe(firstChance(3));
    expect(firstChance(3,false,false,true)).toBeLessThan(firstChance(3));
  });

  it('gives legacy discoveries a fixed grace period and rejects corrupt new schedules', () => {
    const s=fixture(); s.w.week=4; s.site.discovered=true;
    const restored=Sim.fromSave(structuredClone(s.w)), b=restored.world.buildings[s.site.id];
    expect(b.fbiDiscoveredWeek).toBe(4); expect(b.fbiRaidWeek).toBe(5);
    expect(Sim.fromSave(structuredClone(restored.world)).world.buildings[b.id].fbiRaidWeek).toBe(5);
    b.fbiRaidWeek=4; expect(()=>Sim.fromSave(structuredClone(restored.world))).toThrow(/raid schedule/);
    b.fbiRaidWeek=5; b.fbiClosedWeek=4; expect(()=>Sim.fromSave(structuredClone(restored.world))).toThrow(/raid schedule|closure/);
    delete b.fbiClosedWeek; restored.launchWeek();
    const agent=restored.world.people[s.agent.id];
    agent.fbiAssignment={buildingId:999999,kind:'raid',assignedWeek:4,phase:'working',searchPoint:0,workLeft:1};
    expect(()=>Sim.fromSave(structuredClone(restored.world))).toThrow(/FBI assignment/);
  });

  it.each(['damage','destroy'] as const)('cancels a pending restart on %s and keeps the save valid', kind => {
    const s=fixture(); setTrading(s.w,s.gang.id,s.site.id,false); setTrading(s.w,s.gang.id,s.site.id,true);
    if(kind==='damage') damageBuilding(s.w,s.site,.4); else destroyBuilding(s.w,s.site);
    expect(s.site.resumeTradingWeek).toBeUndefined();
    expect(()=>Sim.fromSave(structuredClone(s.w))).not.toThrow();
    s.w.week=2; finishTradingRestarts(s.w);
    expect(s.site.state).toBe(kind==='damage'?'damaged':'destroyed');
  });

  it('cannot restart a hidden business behind a damaged front, including through a save', () => {
    const s=fixture(); setTrading(s.w,s.gang.id,s.site.id,false); setTrading(s.w,s.gang.id,s.site.id,true);
    damageBuilding(s.w,s.front,.4);
    const restored=Sim.fromSave(structuredClone(s.w)), b=restored.world.buildings[s.site.id];
    restored.world.week=2; finishTradingRestarts(restored.world); expect(b.state).toBe('ceased');
    expect(setTrading(restored.world,s.gang.id,b.id,true).ok).toBe(false);
    expect(repairBuilding(restored.world,s.gang.id,s.front.id).ok).toBe(true);
    expect(b.state).toBe('ceased');
    expect(setTrading(restored.world,s.gang.id,b.id,true).ok).toBe(true); expect(b.state).toBe('trading');
  });

  it('does not erase a pending investigation by refitting the operating business', () => {
    const s=fixture(); s.site.discovered=true; s.site.fbiDiscoveredWeek=1; s.site.fbiRaidWeek=2;
    const before=structuredClone(s.w);
    expect(issueOrder(s.w,s.gang.id,{teamId:s.gang.teamIds[0],type:'setUpBusiness',buildingIds:[s.site.id],opts:{businessTypeId:'casino',frontBuildingId:s.front.id}}).ok).toBe(false);
    expect(s.w).toEqual(before);
  });

  it('rechecks a refit accepted before discovery when the crew arrives', () => {
    const s=fixture(), team=s.w.teams[s.gang.teamIds[0]], cash=s.gang.cash;
    expect(issueOrder(s.w,s.gang.id,{teamId:team.id,type:'setUpBusiness',buildingIds:[s.site.id],opts:{businessTypeId:'casino',frontBuildingId:s.front.id}}).ok).toBe(true);
    const order=s.w.orders[team.orderIds[0]];
    s.site.discovered=true; s.site.fbiDiscoveredWeek=1; s.site.fbiRaidWeek=2; s.sim.launchWeek();
    for(let n=0;n<3000&&!['done','failed'].includes(order.state);n++) s.sim.advance(1/MINUTES_PER_SECOND,1);
    expect(order.state).toBe('failed'); expect(order.failReason).toContain('FBI');
    expect(s.site.fbiRaidWeek).toBe(2); expect(s.site.discovered).toBe(true); expect(s.gang.cash).toBe(cash);
  });

  it('can arrest a present guard but cannot arrest a manager who has already left', () => {
    const s=fixture(), team=s.w.teams[s.gang.teamIds[0]], guard=s.w.people[team.memberIds[0]], absent=s.w.people[team.memberIds[1]];
    guard.pos=buildingDoor(s.w,s.site); s.site.guardIds=[guard.id]; s.site.managerId=absent.id;
    absent.buildingId=null; absent.pos={x:480,y:480};
    vi.spyOn(s.sim.rng,'chance').mockReturnValue(true); raidSite(s.w,s.sim.rng,s.site,s.agent);
    expect(guard.status).toBe('arrested'); expect(absent.status).toBe('active');
    expect(s.w.crimes.filter(c=>c.kind==='illegalBusiness').map(c=>c.perpetratorId)).toEqual([guard.id]);
  });

  it('stops the hidden business when agents close its legal front', () => {
    const s=fixture(); s.front.stock.stolen=20; raidSite(s.w,s.sim.rng,s.front,s.agent);
    expect(s.site.state).toBe('ceased');
    expect(setTrading(s.w,s.gang.id,s.site.id,true).ok).toBe(false);
    expect(s.site.fbiClosedWeek).toBeUndefined();
  });

  it('does not automatically restart a sold legal business for its next owner', () => {
    const s=fixture(); shutdownBuilding(s.w,s.gang.id,s.site.id);
    setTrading(s.w,s.gang.id,s.front.id,false); setTrading(s.w,s.gang.id,s.front.id,true);
    expect(sellBuilding(s.w,s.gang.id,s.front.id).ok).toBe(true);
    expect(s.front.resumeTradingWeek).toBeUndefined();
    s.w.week=2; finishTradingRestarts(s.w); expect(s.front.state).toBe('ceased');
  });
});
