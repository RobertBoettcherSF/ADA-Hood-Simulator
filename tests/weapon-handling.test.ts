import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {WeaponHandling,weaponVisible,drawDuration,holsterDuration} from '../src/render/weaponHandling';
import {CharacterActions,actionFlash} from '../src/render/characterActions';
import {CharacterMotion,characterClips} from '../src/render/characterMotion';
import type {Person,WorldState,WeaponId} from '../src/sim/types';
import {presentAttack,presentDeath,presentThrow} from '../src/sim/presentationEvents';
import {readFileSync} from 'node:fs';
import type {WeaponMotions} from '../src/render/weaponMotions';
// 1.2.29: the art lives in the asset repository (bash fetch-assets.sh puts it in public/).
const data:WeaponMotions=JSON.parse(readFileSync(new URL('../public/art/city/sculpt/weapon-handling.json',import.meta.url),'utf8'));

describe('authored weapon handling',()=>{
 it('bakes all three supplied clips onto ten rigs with finite unit rotations',()=>{
  expect(data.clips.pistolDraw.duration).toBe(2);expect(data.clips.rifleDraw.duration).toBe(61/30);
  expect(data.clips.rifleHolster.duration).toBe(2.3);
  for(const clip of Object.values(data.clips)){
   expect(Object.keys(clip.styles)).toHaveLength(10);
   for(const style of Object.values(clip.styles))for(const track of style.tracks){
    expect(track.times.at(-1)).toBeCloseTo(clip.duration,5);
    expect(track.values.every(Number.isFinite)).toBe(true);
    if(track.name.endsWith('.quaternion'))for(let i=0;i<track.values.length;i+=4)
     expect(new THREE.Quaternion().fromArray(track.values,i).length()).toBeCloseTo(1,5);
   }
  }
 });
 it.each(['pistol','twinPistols','rifle','shotgun','tommy'] as WeaponId[])('draws, holds, and puts away %s exactly once',weapon=>{
  const h=new WeaponHandling();h.update(1,weapon,0);
  expect(h.get(1)?.kind).toBe('draw');expect(weaponVisible(h.get(1))).toBe(false);
  h.update(1,weapon,1);expect(weaponVisible(h.get(1))).toBe(true);
  const paused={...h.get(1)};h.update(1,weapon,0);expect(h.get(1)).toEqual(paused);
  h.update(1,weapon,drawDuration(weapon)-1);expect(h.get(1)?.kind).toBe('ready');
  h.update(1,undefined,0);expect(h.get(1)?.kind).toBe('holster');expect(h.weapon(1)).toBe(weapon);
  h.update(1,undefined,holsterDuration(weapon)-.01);expect(weaponVisible(h.get(1))).toBe(false);
  h.update(1,undefined,.02);expect(h.get(1)).toBeUndefined();expect(h.weapon(1)).toBeUndefined();
 });
 it('reverses a cancelled partial draw, and reverses it back without a pose jump',()=>{
  const h=new WeaponHandling();h.update(1,'pistol',0);h.update(1,'pistol',.8);
  h.update(1,undefined,0);expect(h.get(1)).toMatchObject({kind:'holster',time:1.2,reverseDraw:true});
  h.update(1,'pistol',0);expect(h.get(1)?.kind).toBe('draw');expect(h.get(1)?.time).toBeCloseTo(.8);
  const early=new WeaponHandling();early.update(1,'rifle',0);early.update(1,'rifle',.1);early.update(1,undefined,0);
  expect(early.weapon(1)).toBeUndefined();
 });
 it('queues the first firing pose, keeps rapid fire moving, then holsters',()=>{
  const h=new WeaponHandling(),shot={kind:'shoot' as const,time:0,weapon:'tommy' as const};
  h.update(1,'tommy',0,shot);
  for(let n=0;n<60;n++)h.update(1,'tommy',1/60,shot);
  expect(h.get(1)?.kind).toBe('draw');expect(actionFlash(h.get(1))).toBe(0);
  h.update(1,'tommy',drawDuration('tommy')-1);expect(h.get(1)?.kind).toBe('shoot');
  h.update(1,'tommy',.24);expect(actionFlash(h.get(1))).toBeCloseTo(1);
  let flashes=0;for(let n=0;n<120;n++){h.update(1,'tommy',1/60,shot);if(actionFlash(h.get(1))>.5)flashes++;}
  expect(flashes).toBeGreaterThan(10);h.update(1,undefined,1.1);expect(h.get(1)?.kind).toBe('holster');
 });
 it('cancels a queued shot when the threat ends before the draw finishes',()=>{
  const h=new WeaponHandling();h.update(1,'pistol',0,{kind:'shoot',time:0,weapon:'pistol'});
  h.update(1,'pistol',1);h.update(1,undefined,1);
  expect(h.get(1)?.kind).toBe('holster');expect(actionFlash(h.get(1))).toBe(0);
 });
 it('plays pistol holstering as the same sampled poses in reverse and preserves walking legs',()=>{
  const root=new THREE.Group(),arm=new THREE.Bone(),leg=new THREE.Bone();arm.name='RightArm';leg.name='RightLeg';root.add(arm,leg);
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.4);
  const walk=new THREE.AnimationClip('walk',1,[new THREE.QuaternionKeyframeTrack('RightArm.quaternion',[0,1],[0,0,0,1,0,0,0,1]),
   new THREE.QuaternionKeyframeTrack('RightLeg.quaternion',[0,1],[...q.toArray(),...q.toArray()])]);
  const motion=new CharacterMotion(new THREE.AnimationMixer(root),walk,characterClips(root,walk,'fedora',data));
  for(const time of [.3,.6,1,1.5]){
   motion.sample(0,true,{clock:0,delta:1,action:{kind:'draw',time,weapon:'pistol'}});const pose=arm.quaternion.clone();
   expect(leg.quaternion.angleTo(q)).toBeLessThan(1e-6);
   motion.sample(0,true,{clock:0,delta:1,action:{kind:'holster',time:2-time,weapon:'pistol'}});
   expect(arm.quaternion.angleTo(pose)).toBeLessThan(1e-6);
  }
 });
 it('integrates live combat cues without touching saves, and cancels on throw, vehicle or death',()=>{
  const a={id:1,pos:{x:0,y:0},status:'active'} as Person,b={id:2,pos:{x:1,y:1},status:'active'} as Person;
  const world={week:1,minute:0,people:{1:a,2:b}} as unknown as WorldState,view=new CharacterActions(world),saved=JSON.stringify(world);
  presentAttack(world,a,b,'pistol',false);view.update(world,0);expect(view.presentation(1)?.kind).toBe('draw');
  view.update(world,2);expect(view.presentation(1)?.kind).toBe('shoot');view.update(world,.24);expect(actionFlash(view.presentation(1))).toBeCloseTo(1);
  expect(JSON.stringify(world)).toBe(saved);
  a.inVehicle=true;view.update(world,0);expect(view.heldWeapon(1)).toBeUndefined();
  a.inVehicle=false;presentAttack(world,a,b,'rifle',false);view.update(world,0);
  presentThrow(world,a,b.pos,'bomb');view.update(world,0);expect(view.presentation(1)?.kind).toBe('throw');expect(view.heldWeapon(1)).toBeUndefined();
  presentDeath(world,a);view.update(world,0);expect(view.presentation(1)?.kind).toBe('death');expect(view.heldWeapon(1)).toBeUndefined();
 });
});
