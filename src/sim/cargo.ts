import { VEHICLES } from './constants';
import { goodsRetailer, goodsRoom } from './goodsStorage';
import { addMessage } from './events';
import { clearDestination, setDestination } from './movement';
import { roadPosition } from './vehicleNavigation';
import { allBuildings, buildingDoor, dist, placeName } from './world';
import type { Building, FleetVehicle, GoodsKind, ID, Order, Person, Vec2, WorldState } from './types';

export const GOODS: readonly GoodsKind[] = ['counterfeit', 'stolen', 'liquor'];
export const emptyGoods = (): Record<GoodsKind, number> => ({ liquor: 0, stolen: 0, counterfeit: 0 });
export const goodsTotal = (goods: Record<GoodsKind, number>): number => GOODS.reduce((n,k)=>n+goods[k],0);
export function cargoActivity(w:WorldState,p:Person):string|null {
  const c=p.vehicleKey?w.vehicleFleet?.[p.vehicleKey]?.cargo:undefined;
  if(!c)return null;
  if(c.purpose==='return')return !p.inVehicle?'Retrieving loaded truck':c.destinationId==null?'Waiting for storage':'Returning goods';
  return c.purpose==='raid'?'Delivering raid goods':'Export delivery';
}
export function cargoRoom(b: Building, kind: GoodsKind): number {
  return goodsRoom(b, kind);
}
/** A store a truck may unload at: a warehouse, or one of our shops that sells that kind. */
function cargoStoreKind(b: Building): boolean {
  return b.typeId === 'warehouse' || GOODS.some(k => goodsRetailer(b, k));
}
/** 1.2.67: carried goods go to our nearest shop that can sell them (a fence,
 * a speakeasy, a shop passing counterfeit); only what none has room for goes
 * to the nearest warehouse. */
export function cargoWarehouse(w: WorldState, gangId: ID, from: Vec2, goods: Record<GoodsKind,number>): Building | undefined {
  const sites = allBuildings(w).filter(b => b.ownerGangId === gangId && b.state === 'trading' && cargoStoreKind(b) &&
    GOODS.some(k => goods[k] > 0 && cargoRoom(b,k) > 0));
  const near = (a: Building, b: Building) => dist(from,buildingDoor(w,a))-dist(from,buildingDoor(w,b)) || a.id-b.id;
  return sites.filter(b => b.typeId !== 'warehouse').sort(near)[0] ?? sites.filter(b => b.typeId === 'warehouse').sort(near)[0];
}
function report(w:WorldState,v:FleetVehicle,message:string):void {
  if(w.gangs[v.gangId]?.isPlayer)addMessage(w,'waiting',message,v.pos,v.driverId);
}
export function cargoVehicles(w:WorldState,orderId:ID):FleetVehicle[] {
  return Object.values(w.vehicleFleet??{}).filter(v=>v.cargo?.orderId===orderId);
}
/** Split a load among the trucks which physically accompanied these hoods. */
export function loadCargo(w:WorldState,order:Order,actors:Person[],source:Building,goods:Record<GoodsKind,number>,purpose:'export'|'raid'):string[] {
  const keys=[...new Set(actors.filter(p=>p.inVehicle).map(p=>p.vehicleKey).filter((k):k is string=>!!k))];
  const left={...goods},loaded:string[]=[];
  for(const key of keys){
    const v=w.vehicleFleet?.[key];if(!v||v.kind!=='truck'||v.cargo)continue;
    const part=emptyGoods();let room=VEHICLES.truck.cargo;
    for(const kind of GOODS){part[kind]=Math.min(left[kind],room);left[kind]-=part[kind];room-=part[kind];}
    if(!goodsTotal(part))continue;
    v.cargo={goods:part,sourceId:source.id,orderId:order.id,purpose,destinationId:null};loaded.push(key);
  }
  return loaded;
}
/** Legacy aggregate shipments keep their goods. Oversized old loads are not
 * discarded by migration; only newly loaded cargo uses today's capacity. */
export function ensureExportCargo(w:WorldState,order:Order):void {
  const c=order.exportDelivery;if(!c||c.vehicleKeys)return;
  const actors=order.assignedIds.map(id=>w.people[id]).filter((p):p is Person=>!!p);
  c.vehicleKeys=loadCargo(w,order,actors,w.buildings[c.warehouseId],c.goods,'export');
  const assigned=emptyGoods();for(const key of c.vehicleKeys)for(const kind of GOODS)assigned[kind]+=w.vehicleFleet![key].cargo!.goods[kind];
  const last=c.vehicleKeys.at(-1);if(last)for(const kind of GOODS)w.vehicleFleet![last].cargo!.goods[kind]+=c.goods[kind]-assigned[kind];
}
/** Route a free returning load, preserving any explicit street command. */
export function routeCargoReturn(w:WorldState,v:FleetVehicle):boolean {
  const c=v.cargo;if(!c||c.purpose!=='return')return false;
  const driver=v.driverId==null?undefined:w.people[v.driverId];
  if(!driver?.inVehicle||driver.streetOrder||driver.orderId!=null||v.boarding)return true;
  const warehouse=cargoWarehouse(w,v.gangId,v.pos,c.goods);
  v.returning=false;
  if(!warehouse){c.destinationId=null;v.destination=null;for(const id of v.occupantIds)clearDestination(w.people[id]);return true;}
  const target=buildingDoor(w,warehouse),road=roadPosition(w,target);
  c.destinationId=warehouse.id;v.destination=target;
  if(!driver.dest||dist(driver.dest,road)>1)setDestination(w,driver,target);
  return true;
}
/** Deposit only beside the warehouse, with the remaining load still on the car. */
export function unloadCargo(w:WorldState,v:FleetVehicle,warehouse:Building):number {
  const c=v.cargo;
  if(!c||warehouse.ownerGangId!==v.gangId||!cargoStoreKind(warehouse)||warehouse.state!=='trading'||
    dist(v.pos,roadPosition(w,buildingDoor(w,warehouse)))>3)return 0;
  let amount=0;
  for(const kind of GOODS){const n=Math.min(c.goods[kind],cargoRoom(warehouse,kind));warehouse.stock[kind]+=n;c.goods[kind]-=n;amount+=n;}
  if(amount)report(w,v,`Delivered ${amount} cases to ${placeName(w,warehouse)}.`);
  if(!goodsTotal(c.goods))delete v.cargo;
  return amount;
}
/** Convert loaded trucks to independent returns before deleting their order. */
export function recoverOrderCargo(w:WorldState,order:Order,lost:boolean):void {
  ensureExportCargo(w,order);
  const vehicles=cargoVehicles(w,order.id),had=!!order.exportDelivery||vehicles.length>0;
  delete order.exportPending;delete order.exportDelivery;delete order.raidDelivery;
  // A load is lost with its crew: killed, taken, or walked off and left it
  // (playtest, 14 October: lost in both); a crewed truck brings it back.
  let left=false;
  for(const v of vehicles){
    const crewed=v.occupantIds.some(id=>w.people[id]?.status==='active'&&w.people[id].inVehicle);
    if(lost||!crewed){delete v.cargo;v.orderId=null;left||=!lost;continue;}
    v.cargo!.purpose='return';v.cargo!.orderId=null;v.orderId=null;v.returning=false;
    routeCargoReturn(w,v);
  }
  if(left)order.cargoLeft=true;
  if(!had)return;
  const raid=order.type==='raid';
  const returning=vehicles.some(v=>v.cargo);
  const message=!lost&&order.cargoLeft?(raid?'The crew left the truck; the raided goods were lost.':'The crew left the truck; its load was lost.')
    :lost||!returning?(raid?'The raided goods were lost.':'Cargo was lost; no goods were sold.')
    :raid?'The raided goods are on their way to the warehouse by truck.':'Unsold goods are returning by truck; stock will be credited on delivery.';
  order.results.push(message);
  if(w.gangs[order.gangId]?.isPlayer)addMessage(w,'failed',message,vehicles[0]?.pos??null);
}
/** Lost/redirected trucks cannot be paid remotely through another courier. */
export function refreshExportCargo(w:WorldState,order:Order):void {
  ensureExportCargo(w,order);const c=order.exportDelivery;if(!c)return;
  const goods=emptyGoods(),keys:string[]=[];
  for(const key of c.vehicleKeys??[]){
    const v=w.vehicleFleet?.[key];if(!v?.cargo||v.cargo.orderId!==order.id)continue;
    if(!v.occupantIds.some(id=>order.assignedIds.includes(id)&&w.people[id]?.status==='active'&&w.people[id].inVehicle)){
      // Left by its crew: the load is lost with the truck they walked away
      // from. Still driven (the man was sent elsewhere), it goes back instead.
      if(v.occupantIds.some(id=>w.people[id]?.status==='active'&&w.people[id].inVehicle)){v.cargo.purpose='return';v.cargo.orderId=null;v.orderId=null;}
      else{delete v.cargo;v.orderId=null;order.cargoLeft=true;}
      continue;
    }
    keys.push(key);for(const kind of GOODS)goods[kind]+=v.cargo.goods[kind];
  }
  c.vehicleKeys=keys;c.goods=goods;
}
