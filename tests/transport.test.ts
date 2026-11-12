import {describe,it,expect} from 'vitest';
import {defaultGameOptions} from '../src/app/newGame';
import {Sim,MINUTES_PER_SECOND} from '../src/sim/sim';
import {issueOrder, cancelOrder, sellVehicle, transferVehicle, assignStaffVehicle, hireRecruit, shutdownBuilding, sellBuilding} from '../src/sim/api';
import {estimateMinutes, tickOrders, killPerson} from '../src/sim/execution';
import {clearDestination, driveFrom, personSpeed, previewPosition, stepPerson} from '../src/sim/movement';
import {buildingDoor, dist} from '../src/sim/world';
import {vehicleOf, cargoCapacity, dismount, reconcileTransport, resetWeekTransport, sendHome, startStaffJourney} from '../src/sim/transport';
import {DRIVE_MIN_DISTANCE,VEHICLES,WALK_SPEED} from '../src/sim/constants';
import type {VehicleId} from '../src/sim/types';
import {staffFirstCrew} from './helpers/crew';

function fixture(){
 const sim=new Sim({...defaultGameOptions(),seed:404,citySize:10,startHoods:10,startMoney:200000});
 staffFirstCrew(sim);
 const w=sim.world,g=sim.playerGang,t=w.teams[g.teamIds[0]];
 w.orders={};for(const team of Object.values(w.teams)){team.orderIds=[];team.timeUsed=0;}
 t.vehicles={coupe:0,truck:0,speedster:0};
 const people=t.memberIds.map(id=>w.people[id]);for(const p of people)p.skills.driving=3;
 const hq=Object.values(w.buildings).find(b=>b.isHQ&&b.ownerGangId===g.id)!;
 const target=Object.values(w.buildings).find(b=>b.ownerGangId==null&&b.cls==='commercial'&&dist(buildingDoor(w,b),buildingDoor(w,hq))>220)!;
 return {sim,w,g,t,people,hq,target};
}
function queue(s:ReturnType<typeof fixture>,n:number,person?:number){
 const result=issueOrder(s.w,s.g.id,{teamId:s.t.id,type:'extort',buildingIds:[s.target.id],opts:{manpower:n,priority:true,preferredHoodId:person??null}});
 expect(result.ok,JSON.stringify(result)).toBe(true);return s.w.orders[s.t.orderIds.at(-1)!];
}
function steps(s:ReturnType<typeof fixture>,n:number){for(let i=0;i<n;i++){s.w.minute++;tickOrders(s.w,s.sim.rng,1);}}

describe('real crew transport',()=>{
 it('rejects Export without an allocated truck before changing the order list or stock',()=>{
  const s=fixture(),b=Object.values(s.w.buildings).find(b=>b.typeId==='warehouse')!;b.ownerGangId=s.g.id;b.stock={liquor:40,stolen:0,counterfeit:0};
  const before=JSON.stringify(s.w);const r=issueOrder(s.w,s.g.id,{teamId:s.t.id,type:'export',buildingIds:[b.id]});
  expect(r.ok).toBe(false);if(!r.ok)expect(r.error).toMatch(/truck/i);expect(JSON.stringify(s.w)).toBe(before);
 });
 it('walks to a job nearer than the original driving distance, and drives to one further',()=>{
  const s=fixture();s.t.vehicles.coupe=1;
  const near=Object.values(s.w.buildings).find(b=>b.ownerGangId==null&&b.cls==='commercial'&&dist(buildingDoor(s.w,b),buildingDoor(s.w,s.hq))<DRIVE_MIN_DISTANCE-40)!;
  expect(issueOrder(s.w,s.g.id,{teamId:s.t.id,type:'extort',buildingIds:[near.id],opts:{manpower:2,priority:true}}).ok).toBe(true);
  const o=s.w.orders[s.t.orderIds.at(-1)!];s.sim.launchWeek();
  expect(o.assignedIds.map(id=>s.w.people[id]).some(p=>p.inVehicle||p.vehicleKey)).toBe(false);
  const far=fixture();far.t.vehicles.coupe=1;const f=queue(far,2);far.sim.launchWeek();
  expect(f.assignedIds.map(id=>far.w.people[id]).every(p=>p.inVehicle)).toBe(true);
 });
 it('a car left out on the streets keeps its place over the weekend, and a free man drives it home',()=>{
  const s=fixture();s.t.vehicles.coupe=1;const o=queue(s,1);s.sim.launchWeek();
  const driver=s.w.people[o.assignedIds[0]],key=driver.vehicleKey!;
  for(let i=0;i<200&&dist(driver.pos,buildingDoor(s.w,s.hq))<60;i++)steps(s,1);
  // The crew walk off and the job is called off: the car stands where it was left.
  for(const id of [...s.w.vehicleFleet![key].occupantIds])dismount(s.w,s.w.people[id]);cancelOrder(s.w,o.id);
  const left={...s.w.vehicleFleet![key].pos};expect(dist(left,buildingDoor(s.w,s.hq))).toBeGreaterThan(40);
  resetWeekTransport(s.w);
  expect(s.w.vehicleFleet?.[key]?.pos).toEqual(left);
  // Saved and loaded between weeks, it is exactly as it was (how long it has stood included).
  s.w.vehicleFleet![key].idleSince=123;s.w.phase='planning';
  expect(Sim.fromSave(structuredClone(s.w)).world.vehicleFleet).toEqual(s.w.vehicleFleet);
  // Next week a free man goes for it and drives it home.
  for(const p of s.people){p.orderId=null;p.streetOrder=null;clearDestination(p);delete p.vehicleKey;p.inVehicle=false;}
  s.w.phase='week';
  for(let i=0;i<3000&&dist(s.w.vehicleFleet![key].pos,buildingDoor(s.w,s.hq))>25;i++){steps(s,1);for(const p of s.people)stepPerson(p,1,undefined,s.w);reconcileTransport(s.w);}
  expect(dist(s.w.vehicleFleet![key].pos,buildingDoor(s.w,s.hq))).toBeLessThanOrEqual(25);
 });
 it('one coupe carries four people together and excess people walk',()=>{
  const s=fixture();s.t.vehicles.coupe=1;const o=queue(s,5);s.sim.launchWeek();
  const a=o.assignedIds.map(id=>s.w.people[id]);
  expect(a.filter(p=>p.inVehicle)).toHaveLength(4);
  expect(new Set(a.filter(p=>p.inVehicle).map(p=>p.vehicleKey)).size).toBe(1);
  const v=vehicleOf(s.w,a.find(p=>p.inVehicle)!)!;expect(v.occupantIds).toHaveLength(4);
  steps(s,2);const d=s.w.people[v.driverId!];
  for(const id of v.occupantIds){expect(s.w.people[id].pos).toEqual(d.pos);expect(previewPosition(s.w.people[id],.5,{x:0,y:0},s.w)).toEqual(previewPosition(d,.5,{x:0,y:0},s.w));}
  expect(o.state).toBe('travelling'); // a fast driver cannot perform work for walkers still elsewhere
 });
 it('does not lend the same coupe to a second simultaneous job',()=>{
  const s=fixture();s.t.vehicles.coupe=1;const a=queue(s,1,s.people[0].id),b=queue(s,1,s.people[1].id);s.sim.launchWeek();
  expect(s.w.people[a.assignedIds[0]].inVehicle).toBe(true);
  expect(s.w.people[b.assignedIds[0]].inVehicle).toBe(false);
 });
 it('uses actual truck/coupe/speedster speeds in movement and planning',()=>{
  const speeds:number[]=[],estimates:number[]=[];
  for(const kind of ['truck','coupe','speedster'] as VehicleId[]){const s=fixture();s.t.vehicles[kind]=1;const o=queue(s,1);estimates.push(estimateMinutes(s.w,s.t,o));s.sim.launchWeek();const p=s.w.people[o.assignedIds[0]];speeds.push(personSpeed(p,s.w));const start={...p.pos};driveFrom.clear();stepPerson(p,1,undefined,s.w);const a=previewPosition(p,.001,{x:0,y:0},s.w);expect(dist(a,start)).toBeCloseTo(speeds.at(-1)!*.001,3);}
  expect(speeds[0]).toBeGreaterThan(WALK_SPEED);expect(speeds[0]).toBeLessThan(speeds[1]);expect(speeds[1]).toBeLessThan(speeds[2]);
  expect(estimates[0]).toBeGreaterThan(estimates[1]);expect(estimates[1]).toBeGreaterThan(estimates[2]);
 });
 it('preserves one vehicle and its passengers through save/restore',()=>{
  const s=fixture();s.t.vehicles.coupe=1;const o=queue(s,3);s.sim.launchWeek();steps(s,2);
  const restored=Sim.fromSave(JSON.parse(JSON.stringify(s.w)));expect(restored.world.vehicleFleet).toEqual(s.w.vehicleFleet);
  for(let i=0;i<8;i++){steps(s,1);restored.world.minute++;tickOrders(restored.world,restored.rng,1);}
  for(const id of o.assignedIds)expect(restored.world.people[id]).toEqual(s.w.people[id]);
 });
 it('refuses sale or removal of a reserved vehicle without changing cash or counts',()=>{
  const s=fixture();s.t.vehicles.coupe=1;queue(s,2);s.sim.launchWeek();const cash=s.g.cash;
  expect(sellVehicle(s.w,s.g.id,'coupe',s.t.id).ok).toBe(false);
  expect(transferVehicle(s.w,s.g.id,'coupe',s.t.id,false).ok).toBe(false);
  expect(s.g.cash).toBe(cash);expect(s.t.vehicles.coupe).toBe(1);
 });
 it('only counts cargo space actually accompanying the actors',()=>{
  const s=fixture();s.t.vehicles={coupe:1,truck:1,speedster:0};const o=queue(s,2);s.sim.launchWeek();
  expect(cargoCapacity(s.w,o.assignedIds.map(id=>s.w.people[id]))).toBe(VEHICLES.coupe.cargo);
 });
 it('cancellation returns the actual car before it can be sold',()=>{
  const s=fixture();s.t.vehicles.coupe=1;const o=queue(s,3);s.sim.launchWeek();steps(s,2);
  const ids=[...o.assignedIds];expect(cancelOrder(s.w,o.id).ok).toBe(true);
  const v=vehicleOf(s.w,s.w.people[ids[0]])!,d=s.w.people[v.driverId!];expect(v.returning).toBe(true);
  expect(sellVehicle(s.w,s.g.id,'coupe',s.t.id).ok).toBe(false);
  stepPerson(d,10000,undefined,s.w);expect(v.occupantIds).toHaveLength(0);
  expect(ids.every(id=>!s.w.people[id].inVehicle&&!s.w.people[id].dest)).toBe(true);
  expect(sellVehicle(s.w,s.g.id,'coupe',s.t.id).ok).toBe(true);
 });
 it('a survivor takes over without duplicating a killed driver\'s car',()=>{
  const s=fixture();s.t.vehicles.coupe=1;const o=queue(s,3);s.sim.launchWeek();steps(s,2);
  const v=vehicleOf(s.w,s.w.people[o.assignedIds[0]])!,old=v.driverId!;
  killPerson(s.w,s.w.people[old],'test incident');expect(v.driverId).not.toBe(old);expect(v.occupantIds).toHaveLength(2);
  expect(s.w.people[old].inVehicle).toBe(false);const pos={...v.pos};steps(s,1);expect(dist(pos,v.pos)).toBeGreaterThan(0);
  expect(()=>Sim.fromSave(structuredClone(s.w))).not.toThrow();
 });
 it('leaving a vehicle preserves its parked position',()=>{
  const s=fixture();s.t.vehicles.coupe=1;const o=queue(s,1);s.sim.launchWeek();steps(s,2);
  const p=s.w.people[o.assignedIds[0]],v=vehicleOf(s.w,p)!,pos={...p.pos};
  dismount(s.w,p);sendHome(s.w,p);expect(v.pos).toEqual(pos);expect(p.inVehicle).toBe(false);expect(p.dest).not.toBeNull();
 });
 it.each(['accountant','lawyer'] as const)('uses the allocated %s car and walks back to it before departing',role=>{
  const s=fixture(),p=Object.values(s.w.people).find(p=>p.role===role&&p.gangId==null)!;
  expect(hireRecruit(s.w,s.g.id,p.id,'pool').ok).toBe(true);s.g.vehicles.speedster=1;
  expect(assignStaffVehicle(s.w,s.g.id,role,'speedster').ok).toBe(true);expect(p.inVehicle).toBe(false);
  // Far enough that the way home from beside it is still a drive.
  const far=Object.values(s.w.buildings).find(b=>b.ownerGangId==null&&b.cls==='commercial'&&dist(buildingDoor(s.w,b),buildingDoor(s.w,s.hq))>DRIVE_MIN_DISTANCE+80)!;
  p.buildingId=null;p.pos=buildingDoor(s.w,s.hq);startStaffJourney(s.w,p,buildingDoor(s.w,far));
  expect(vehicleOf(s.w,p)?.kind).toBe('speedster');expect(p.inVehicle).toBe(true);
  stepPerson(p,10000,undefined,s.w);const parked={...p.pos};dismount(s.w,p);
  p.pos=buildingDoor(s.w,far);p.pos.x+=30;sendHome(s.w,p);
  expect(p.inVehicle).toBe(false);expect(vehicleOf(s.w,p)?.boarding).toBe(true);expect(vehicleOf(s.w,p)?.pos).toEqual(parked);
  stepPerson(p,10000,undefined,s.w);expect(p.inVehicle).toBe(true);
  stepPerson(p,10000,undefined,s.w);expect(p.inVehicle).toBe(false);expect(vehicleOf(s.w,p)).toBeUndefined();
 });
 it.each(['shutdown','sell'] as const)('sends a manager physically home after %s',action=>{
  const s=fixture(),b=s.target,p=s.people[0];b.ownerGangId=s.g.id;b.managerId=p.id;p.buildingId=b.id;p.teamId=null;s.t.memberIds=s.t.memberIds.filter(id=>id!==p.id);p.pos={...s.w.lots[b.lotId].center};
  expect((action==='shutdown'?shutdownBuilding(s.w,s.g.id,b.id):sellBuilding(s.w,s.g.id,b.id)).ok).toBe(true);
  expect(p.pos).toEqual(buildingDoor(s.w,b));expect(p.dest).not.toBeNull();expect(p.buildingId).toBeNull();
  expect(s.g.poolIds).toContain(p.id);stepPerson(p,10000,undefined,s.w);expect(dist(p.pos,buildingDoor(s.w,s.hq))).toBeLessThan(1);
 });
 it('rejects corrupt duplicate seats and missing vehicle references',()=>{
  const s=fixture();s.t.vehicles.coupe=1;const o=queue(s,3);s.sim.launchWeek();const p=s.w.people[o.assignedIds[0]];
  const bad=structuredClone(s.w);bad.vehicleFleet![p.vehicleKey!].occupantIds.push(p.id);expect(()=>Sim.fromSave(bad)).toThrow(/passenger/);
  const missing=structuredClone(s.w);delete missing.vehicleFleet;expect(()=>Sim.fromSave(missing)).toThrow(/reservation/);
 });
 it('loads a second truck trip only after the first consignment is delivered',()=>{
  const s=fixture();s.t.vehicles.truck=1;const warehouse=Object.values(s.w.buildings).find(b=>b.typeId==='warehouse')!;
  warehouse.ownerGangId=s.g.id;warehouse.stock={liquor:300,stolen:300,counterfeit:15};
  expect(issueOrder(s.w,s.g.id,{teamId:s.t.id,type:'export',buildingIds:[warehouse.id],opts:{manpower:1,priority:true}}).ok).toBe(true);
  const o=s.w.orders[s.t.orderIds[0]];s.sim.launchWeek();
  for(let i=0;i<1500&&!o.exportDelivery;i++)steps(s,1);
  expect(Object.values(o.exportDelivery!.goods).reduce((a,b)=>a+b,0)).toBe(400);expect(Object.values(warehouse.stock).reduce((a,b)=>a+b,0)).toBe(215);
  const restored=Sim.fromSave(structuredClone(s.w));const order=restored.world.orders[o.id];
  for(let i=0;i<1800&&order.state!=='done';i++){restored.world.minute++;tickOrders(restored.world,restored.rng,1);}
  expect(order.state).toBe('done');expect(order.results.filter(x=>x.startsWith('Exported goods'))).toHaveLength(2);
  expect(restored.world.buildings[warehouse.id].stock).toEqual({liquor:0,stolen:0,counterfeit:0});
  expect(restored.playerGang.finances!.income.illegal).toBe(300*26+300*34+15*900);
 });
 it('queues Export behind a busy truck and dispatches only after its return',()=>{
  const s=fixture();s.t.vehicles.truck=1;const first=queue(s,1,s.people[0].id),b=Object.values(s.w.buildings).find(b=>b.typeId==='warehouse')!;
  b.ownerGangId=s.g.id;b.stock={liquor:25,stolen:0,counterfeit:0};
  expect(issueOrder(s.w,s.g.id,{teamId:s.t.id,type:'export',buildingIds:[b.id],opts:{manpower:1,preferredHoodId:s.people[1].id,priority:true}}).ok).toBe(true);
  const order=s.w.orders[s.t.orderIds.at(-1)!];s.sim.launchWeek();expect(order.state).toBe('queued');
  const driver=s.w.people[first.assignedIds[0]];steps(s,2);cancelOrder(s.w,first.id);steps(s,1);expect(order.state).toBe('queued');
  stepPerson(driver,10000,undefined,s.w);steps(s,1);expect(order.state).toBe('travelling');expect(order.assignedIds).toHaveLength(1);
  expect(vehicleOf(s.w,s.w.people[order.assignedIds[0]])?.kind).toBe('truck');
 });
 it('uses both available export trucks when there are drivers for both',()=>{
  const s=fixture();s.t.vehicles.truck=2;const b=Object.values(s.w.buildings).find(b=>b.typeId==='warehouse')!;b.ownerGangId=s.g.id;b.stock={liquor:300,stolen:300,counterfeit:15};
  expect(issueOrder(s.w,s.g.id,{teamId:s.t.id,type:'export',buildingIds:[b.id],opts:{manpower:2,priority:true}}).ok).toBe(true);
  const o=s.w.orders[s.t.orderIds[0]];s.sim.launchWeek();expect(Object.keys(s.w.vehicleFleet!)).toHaveLength(2);
  for(let i=0;i<1200&&!o.exportDelivery;i++)steps(s,1);
  expect(Object.values(o.exportDelivery!.goods).reduce((a,b)=>a+b,0)).toBe(615);
 });
 it('loses a shipment, unpaid, when the couriers abandon their truck',()=>{
  const s=fixture();s.t.vehicles.truck=1;const b=Object.values(s.w.buildings).find(b=>b.typeId==='warehouse')!;b.ownerGangId=s.g.id;b.stock={liquor:25,stolen:0,counterfeit:0};
  expect(issueOrder(s.w,s.g.id,{teamId:s.t.id,type:'export',buildingIds:[b.id],opts:{priority:true}}).ok).toBe(true);const o=s.w.orders[s.t.orderIds[0]];s.sim.launchWeek();
  for(let i=0;i<1200&&!o.exportDelivery;i++)steps(s,1);
  for(const id of o.assignedIds)dismount(s.w,s.w.people[id]);steps(s,1);
  expect(o.state).toBe('failed');expect(b.stock.liquor).toBe(0);expect(s.g.finances!.income.illegal).toBe(0);expect(o.exportPending).toBeUndefined();
  // Lost with the truck they walked away from, as when a crew is killed (playtest, 14 October).
  for(let i=0;i<300;i++)s.sim.advance(1/MINUTES_PER_SECOND,1);
  expect(b.stock.liquor).toBe(0);expect(o.results.join(' ')).toMatch(/left the truck; its load was lost/);
 });
});
