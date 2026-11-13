import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {Sim} from '../src/sim/sim';
import {defaultGameOptions} from '../src/app/newGame';
import {issueOrder} from '../src/sim/api';
import {tickOrders} from '../src/sim/execution';
import {Rng} from '../src/sim/rng';
import {presentationEvents,THROW_TIMING} from '../src/sim/presentationEvents';
import {CharacterEquipment} from '../src/render/characterEquipment';
import {EquipmentModels} from '../src/render/equipmentModels';
import data from '../src/data/sculpt-throw.json';

describe('user throw animation',()=>{
 it('retains the source timing, finite unit rotations and in-place horizontal roots',()=>{
  expect(data.sha256).toBe('e1325f80fa25701e6a62adb027929508b8b831da5e6663dfb2cc31f46c6ce874');
  expect(data.duration).toBe(THROW_TIMING.duration);expect(data.release).toBe(THROW_TIMING.release);
  for(const style of Object.values(data.styles))for(const track of style.tracks){
   expect(track.times).toHaveLength(116);expect(track.values.every(Number.isFinite)).toBe(true);
   if(track.name.endsWith('.quaternion'))for(let i=0;i<track.values.length;i+=4)
    expect(new THREE.Quaternion().fromArray(track.values,i).length()).toBeCloseTo(1,5);
   else for(let i=0;i<track.values.length;i+=3){expect(track.values[i]).toBe(track.values[0]);expect(track.values[i+2]).toBe(track.values[2]);}
  }
 });
 it.each(['torch','bomb'] as const)('emits a throw from a real %s order and preserves stock consumption',type=>{
  const sim=new Sim({...defaultGameOptions(),seed:404,citySize:10}),w=sim.world,g=sim.playerGang,t=w.teams[g.teamIds[0]];
  const building=Object.values(w.buildings).find(b=>b.cls==='commercial'&&!b.isHQ&&b.ownerGangId!==g.id)!;
  t.weapons.explosives=2;
  const result=issueOrder(w,g.id,{teamId:t.id,type,buildingIds:[building.id],opts:{manpower:1}});
  expect(result.ok).toBe(true);sim.launchWeek();
  const order=w.orders[t.orderIds.find(id=>w.orders[id].type===type)!];
  expect(order.assignedIds.length).toBeGreaterThan(0);const actor=w.people[order.assignedIds[0]];
  actor.inVehicle=false;actor.dest=null;actor.path=[];order.state='executing';order.workLeft=0;
  const rng=new Rng(44);vi.spyOn(rng,'chance').mockReturnValue(true);
  tickOrders(w,rng,1);
  const event=presentationEvents(w).events.find(e=>e.kind==='throw');
  expect(event).toMatchObject({actorId:actor.id,throwable:type==='torch'?'molotov':'bomb',targetPos:w.lots[building.lotId].center});
  expect(t.weapons.explosives).toBe(type==='bomb'?1:2);
  const effect=presentationEvents(w).events.find(e=>e.kind===(type==='torch'?'fire':'explosion'));
  expect(effect?.delay).toBe(THROW_TIMING.release+THROW_TIMING.flight);
  expect(effect?.buildingBefore?.state).toBe('trading');
 });
 it.each(['molotov','bomb'] as const)('releases one %s from the palm continuously, with no muzzle flash and no stale prop',throwable=>{
  const group=new THREE.Group(),body=new THREE.Group(),hand=new THREE.Bone();group.add(body);body.add(hand);
  hand.name='RightHand';hand.position.set(-.2,1.5,.4);group.updateMatrixWorld(true);
  const library=new EquipmentModels(),outfit=new CharacterEquipment(group,body,library,false,true);
  outfit.set({role:'hood',coat:0x555555,throwable});group.position.set(15,.2,30);group.rotation.y=1.1;group.updateMatrixWorld(true);
  outfit.captureThrowRelease();const action={kind:'throw' as const,throwable,time:THROW_TIMING.release-.000001,target:{x:19,y:35}};
  outfit.pose(action);const prop=group.getObjectByName('equipment-'+(throwable==='bomb'?'explosives':'molotov'))!;
  const before=prop.getWorldPosition(new THREE.Vector3()),q=prop.getWorldQuaternion(new THREE.Quaternion());
  outfit.pose({...action,time:THROW_TIMING.release});
  expect(prop.getWorldPosition(new THREE.Vector3()).distanceTo(before)).toBeLessThan(.00001);
  expect(prop.getWorldQuaternion(new THREE.Quaternion()).angleTo(q)).toBeLessThan(.00001);
  outfit.pose({...action,time:THROW_TIMING.release+.3});expect(prop.getWorldPosition(new THREE.Vector3()).distanceTo(before)).toBeGreaterThan(.3);
  expect(group.getObjectByName('action-flash')).toBeUndefined();
  outfit.pose({...action,time:THROW_TIMING.release+THROW_TIMING.flight});expect(prop.visible).toBe(false);
  outfit.set({role:'hood',coat:0x555555});expect(prop.parent).toBeNull();outfit.dispose();library.dispose();
 });
});
