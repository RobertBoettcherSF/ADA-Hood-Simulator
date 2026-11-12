import {describe,it,expect} from 'vitest';
import {defaultGameOptions} from '../src/app/newGame';
import {Sim,MINUTES_PER_SECOND} from '../src/sim/sim';
import {MINUTES_PER_WEEK} from '../src/sim/constants';
import {quoteBuildingSale,setTrading,shutdownBuilding,sellBuilding} from '../src/sim/api';
import {financeNet,openFinances,receiveCash} from '../src/sim/finances';
import {weeklyEconomy} from '../src/sim/systems/economy';
import {buildingValue} from '../src/sim/execution';
import {raidSite} from '../src/sim/systems/fbi';
import {businessCarryingCost} from '../src/sim/businessState';
/** The ceased cafe's weekly site cost at its block's land value. */
const siteCost=(s:{w:Sim['world'];b:Sim['world']['buildings'][number]})=>businessCarryingCost(s.b,s.w.blocks[s.b.blockId].landValue);

function fixture() {
  const sim=new Sim({...defaultGameOptions(),seed:404,citySize:10,startMoney:100_000});
  const w=sim.world,g=sim.playerGang;
  w.orders={};for(const t of Object.values(w.teams)){t.orderIds=[];t.timeUsed=0;}
  const b=Object.values(w.buildings).find(b=>b.ownerGangId===g.id&&b.managerId!=null)!;
  // An ordinary owned cafe with its existing manager, no hidden operation.
  if(b.hidesId!=null) w.buildings[b.hidesId].frontId=null;
  b.hidesId=null;b.typeId='cafe';b.cls='commercial';b.state='trading';
  b.stock={liquor:0,stolen:0,counterfeit:0};
  for(const p of Object.values(w.people))if(p.gangId===g.id){p.pay=0;p.payDemand=0;}
  const manager=w.people[b.managerId!];manager.pay=200;manager.payDemand=200;
  return {sim,w,g,b,manager};
}
function settle(sim:Sim) {sim.launchWeek();sim.world.minute=MINUTES_PER_WEEK-1;sim.advance(1/MINUTES_PER_SECOND,1);}

describe('business costs and confirmed offers',()=>{
  it('charges the ceased cafe its site cost and manager wage, with no income or goods sales',()=>{
    const s=fixture();s.b.stock.counterfeit=2;setTrading(s.w,s.g.id,s.b.id,false);const cash=s.g.cash;
    weeklyEconomy(s.w,s.sim.rng);
    expect(s.g.lastWeekIncome.legal).toBe(0);expect(s.b.lastProfit).toBe(0);expect(s.b.stock.counterfeit).toBe(2);
    const c=siteCost(s);
    expect(s.g.finances!.costs.wages).toBe(200);expect(s.g.finances!.costs.upkeep).toBe(c);
    expect(s.g.finances!.closedSiteUpkeep).toBe(c);
    expect(s.g.cash).toBe(cash-200-c);expect(s.g.finances!.taxableProfit).toBe(-200-c);
    expect(s.g.finances!.openingCash+financeNet(s.g.finances!)).toBe(s.g.cash);
  });
  it('retains site costs throughout a saved cease/restart week and deducts them before tax',()=>{
    const s=fixture();setTrading(s.w,s.g.id,s.b.id,false);setTrading(s.w,s.g.id,s.b.id,true);
    receiveCash(s.w,s.g,'legal',1000);const restored=Sim.fromSave(structuredClone(s.w));settle(restored);
    const g=restored.playerGang,report=g.lastFinanceReport!,c=siteCost(s);
    expect(report.income.legal).toBe(1000);expect(report.costs.upkeep).toBe(c);
    expect(report.taxableProfit).toBe(800-c);expect(report.costs.tax).toBe(Math.round((800-c)*0.24));
    expect(restored.world.buildings[s.b.id].state).toBe('trading');
    expect(report.openingCash+financeNet(report)).toBe(report.closingCash);
    const second=Sim.fromSave(structuredClone(restored.world));settle(second);
    expect(second.playerGang.lastFinanceReport!.closedSiteUpkeep).toBe(0);
    expect(second.playerGang.lastFinanceReport!.income.legal).toBeGreaterThan(0);
  });
  it('reports only the carrying costs actually paid when cash is short',()=>{
    const s=fixture(),c=siteCost(s),half=Math.round((200+c)/2);
    setTrading(s.w,s.g.id,s.b.id,false);s.g.cash=half+4;openFinances(s.w,s.g);weeklyEconomy(s.w,s.sim.rng);
    expect(s.g.finances!.costs.wages).toBe(100);expect(s.g.finances!.costs.upkeep).toBe(half-100);expect(s.g.cash).toBe(4);
    expect(s.g.finances!.closedSiteUpkeep).toBe(half-100);
  });
  it.each(['shutdown','sell'] as const)('stops site costs after %s while still paying the former manager',action=>{
    const s=fixture();setTrading(s.w,s.g.id,s.b.id,false);
    expect((action==='shutdown'?shutdownBuilding:sellBuilding)(s.w,s.g.id,s.b.id).ok).toBe(true);
    const cash=s.g.cash;weeklyEconomy(s.w,s.sim.rng);
    expect(s.g.finances!.costs.upkeep).toBe(0);expect(s.g.cash).toBe(cash-200);
  });
  it('does not accept an old price after the property value changes',()=>{
    const s=fixture(),offer=buildingValue(s.w,s.b);s.w.blocks[s.b.blockId].landValue+=10;
    const before=structuredClone(s.w);
    expect(sellBuilding(s.w,s.g.id,s.b.id,offer).ok).toBe(false);expect(s.w).toEqual(before);
  });
  it('quotes without changing the world and accepts that exact price only once',()=>{
    const s=fixture(),before=structuredClone(s.w),offer=quoteBuildingSale(s.w,s.g.id,s.b.id);
    expect(s.w).toEqual(before);expect(offer.ok).toBe(true);if(!offer.ok)throw Error(offer.error);
    const cash=s.g.cash;s.b.acquisitionCost=offer.value-100;
    expect(sellBuilding(s.w,s.g.id,s.b.id,offer.value).ok).toBe(true);
    expect(s.g.cash).toBe(cash+offer.value);expect(s.g.finances!.taxableProfit).toBe(100);
    expect(s.b.managerId).toBeNull();expect(s.manager.buildingId).toBeNull();
    expect(s.g.poolIds.filter(id=>id===s.manager.id)).toHaveLength(1);
    const after=structuredClone(s.w);expect(sellBuilding(s.w,s.g.id,s.b.id,offer.value).ok).toBe(false);expect(s.w).toEqual(after);
  });
  it.each(['ownership','hidden','illegal','hq','damage'] as const)('invalidates an offer after %s changes',change=>{
    const s=fixture(),offer=quoteBuildingSale(s.w,s.g.id,s.b.id);if(!offer.ok)throw Error(offer.error);
    if(change==='ownership')s.b.ownerGangId=null;
    if(change==='hidden')s.b.hidesId=Object.values(s.w.buildings).find(b=>b.ownerGangId===s.g.id&&b.isHQ)!.id;
    if(change==='illegal')s.b.cls='illegal';
    if(change==='hq')s.b.isHQ=true;
    if(change==='damage')s.b.state='damaged';
    const before=structuredClone(s.w);expect(sellBuilding(s.w,s.g.id,s.b.id,offer.value).ok).toBe(false);expect(s.w).toEqual(before);
  });
  it('uses the damage discount in the displayed offer and accepted sale',()=>{
    const s=fixture();s.b.state='damaged';const expected=Math.round(buildingValue(s.w,s.b)*.4),cash=s.g.cash;
    expect(quoteBuildingSale(s.w,s.g.id,s.b.id)).toEqual({ok:true,value:expected});
    expect(sellBuilding(s.w,s.g.id,s.b.id,expected).ok).toBe(true);expect(s.g.cash).toBe(cash+expected);
  });
  it('retains carrying costs after a federal closure until the operation is shut down',()=>{
    const s=fixture();raidSite(s.w,s.sim.rng,s.b);weeklyEconomy(s.w,s.sim.rng);
    expect(s.g.finances!.closedSiteUpkeep).toBe(siteCost(s));expect(s.g.lastWeekIncome.legal).toBe(0);
  });
  it('retains the cost breakdown in saves, accepts older reports, and rejects impossible breakdowns',()=>{
    const s=fixture();setTrading(s.w,s.g.id,s.b.id,false);settle(s.sim);
    const c=siteCost(s);
    const restored=Sim.fromSave(structuredClone(s.w));expect(restored.playerGang.lastFinanceReport!.closedSiteUpkeep).toBe(c);
    delete restored.playerGang.lastFinanceReport!.closedSiteUpkeep;expect(()=>Sim.fromSave(structuredClone(restored.world))).not.toThrow();
    for(const amount of [-1,c+1,Infinity]){
      const state=structuredClone(s.w);state.gangs[s.g.id].lastFinanceReport!.closedSiteUpkeep=amount;
      expect(()=>Sim.fromSave(state)).toThrow();
    }
  });
  it('does not invent paid site costs when the safe is empty',()=>{
    const s=fixture();setTrading(s.w,s.g.id,s.b.id,false);s.g.cash=0;openFinances(s.w,s.g);weeklyEconomy(s.w,s.sim.rng);
    expect(s.g.finances!.closedSiteUpkeep).toBe(0);expect(s.g.finances!.costs.upkeep).toBe(0);expect(s.g.cash).toBe(0);
  });
});
