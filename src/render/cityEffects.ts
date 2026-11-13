import * as THREE from 'three';
import { presentationEvents, type PresentationEvent } from '../sim/presentationEvents';
import type { Building,WorldState } from '../sim/types';
import { BUILDING_BY_ID } from '../sim/data/buildings';
import { lotFacing, profileForLot } from './profile';
import { KERB_H, r01 } from './util';
import {ShopfrontFire,buildingFireBays,fireBayGrowth,fireBayLocal,type FireBay} from './shopfrontFire';
import {ExplosionDebris,type DebrisSource} from './explosionDebris';
import {FACADE_PALETTES} from './textures';
import {createSmokeTexture} from './smokeTexture';
import { artUrl } from '../app/artBase';

interface Emitter {event:PresentationEvent;time:number;x:number;z:number;height:number;radius:number;sideX:number;sideZ:number;bays:FireBay[];debris?:DebrisSource;debrisStarted?:boolean}
interface SmolderSite {id:number;x:number;z:number;height:number;width:number;depth:number}
export const MAX_SMOLDER_SITES=24,SMOLDER_PARTICLES=4;
const MAX_EMITTERS=12, PARTICLES=32, CAPACITY=MAX_EMITTERS*PARTICLES+MAX_SMOLDER_SITES*SMOLDER_PARTICLES;
export const EFFECT_DURATION={fire:18,explosion:5} as const;

/** Short-lived visual cues, not fire simulation. One bounded draw shared by both cameras. */
export class CityEffects {
  readonly geometry=new THREE.InstancedBufferGeometry();
  readonly material:THREE.ShaderMaterial;
  readonly mesh:THREE.Mesh;
  private centers=new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY*3),3);
  private data=new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY*4),4);
  private floors=new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY),1);
  private lowered=false;
  private smokeTime=0;
  private smolderCandidates:SmolderSite[]=[];
  private smolderSites:SmolderSite[]=[];
  private focusPoints:{x:number;z:number}[]=[{x:0,z:0}];
  private focusKey='';
  private emitters:Emitter[]=[];
  private sequence=0;
  private week:number;
  readonly debris:ExplosionDebris;
  revision=0;
  private fires=new Map<number,ShopfrontFire>();
  private fireTexture=new THREE.Texture();
  private smokeTexture=createSmokeTexture();
  private textureReady=false;
  private disposed=false;
  constructor(private world:WorldState,private scene:THREE.Scene){
    this.week=world.week;this.sequence=presentationEvents(world).sequence;
    this.debris=new ExplosionDebris(scene);
    if(typeof document!=='undefined'){
      this.fireTexture=new THREE.TextureLoader().load(artUrl('art/effects/three-fire.png'),texture=>{
        if(this.disposed){texture.dispose();return;}this.textureReady=true;
      });
      this.fireTexture.generateMipmaps=false;this.fireTexture.minFilter=this.fireTexture.magFilter=THREE.LinearFilter;
    }
    const plane=new THREE.PlaneGeometry(1,1);this.geometry.index=plane.index;
    this.geometry.setAttribute('position',plane.getAttribute('position'));
    this.geometry.setAttribute('uv',plane.getAttribute('uv'));
    this.centers.setUsage(THREE.DynamicDrawUsage);this.data.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('effectCenter',this.centers);this.geometry.setAttribute('effectData',this.data);
    this.floors.setUsage(THREE.DynamicDrawUsage);this.geometry.setAttribute('effectFloor',this.floors);
    this.geometry.instanceCount=0;
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
      uniforms:{lowered:{value:0},smokeMap:{value:this.smokeTexture}},
      vertexShader:`attribute vec3 effectCenter;attribute vec4 effectData;attribute float effectFloor;uniform float lowered;varying vec2 vUv;varying vec4 vData;
        void main(){vUv=uv;vData=effectData;if(effectData.z>2.5){float a=effectData.w*.07;vUv=mat2(cos(a),-sin(a),sin(a),cos(a))*(uv-.5)+.5;}
          vec3 center=effectCenter;if(lowered>.5&&effectFloor>0.0){if(effectData.z>3.5)center.y-=effectFloor;else vData.y=0.0;}
          vec4 p=modelViewMatrix*vec4(center,1.0);
          p.xy+=position.xy*vec2(effectData.z>.5&&effectData.z<1.5?.65:1.0,1.0)*effectData.x;gl_Position=projectionMatrix*p;}`,
      fragmentShader:`uniform sampler2D smokeMap;varying vec2 vUv;varying vec4 vData;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        float cloud(vec2 p){return .57*noise(p)+.29*noise(p*2.1+13.7)+.14*noise(p*4.2+31.3);}
        void main(){if(vData.y<.001)discard;
          if(vData.z>2.5){vec4 smoke=texture2D(smokeMap,vUv);float alpha=smoke.a*vData.y;
            if(alpha<.01)discard;vec3 color=vData.z>3.5?mix(smoke.rgb,vec3(.48,.47,.44),.65):smoke.rgb;
            gl_FragColor=vec4(color,alpha);return;}
          vec2 p=(vUv-.5)*2.0;float n=cloud(vUv*4.0+vec2(vData.w,-vData.w*.7));
          float edge=(1.0-smoothstep(.18,1.0,length(p)+.35*(n-.5)))*(.35+.65*n);
          vec3 color=mix(vec3(.055,.055,.05),vec3(.24,.23,.21),n);
          if(vData.z>.5&&vData.z<1.5){
            float bend=(cloud(vec2(vUv.y*3.0,vData.w*1.8))-.5)*.55*vUv.y;
            float width=mix(.78,.025,vUv.y)*(.65+.6*n);
            float body=1.0-smoothstep(width*.2,width,abs(p.x+bend));
            edge=body*smoothstep(0.0,.16,vUv.y)*(1.0-smoothstep(.7,1.0,vUv.y))*(.35+.65*n);
            float heat=clamp(body*(1.0-vUv.y)*1.4,0.0,1.0);
            color=mix(vec3(.73,.16,.035),vec3(1.0,.78,.30),heat);
          }else if(vData.z>1.5){
            edge=(1.0-smoothstep(.05,1.0,length(p)+.45*(n-.5)))*(.55+.45*n);
            color=mix(vec3(.78,.20,.04),vec3(1.0,.87,.53),clamp((1.0-length(p))*1.6,0.0,1.0));
          }
          float alpha=edge*vData.y;if(alpha<.01)discard;gl_FragColor=vec4(color,alpha);}`
    });
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.name='city-fire-and-smoke';
    this.mesh.frustumCulled=false;this.mesh.raycast=()=>{};scene.add(this.mesh);
  }
  get count():number{return this.emitters.length;}
  /** Where fire is burning now (for the street sound's crackle bed). */
  activeFires():{x:number;z:number}[]{return this.emitters.filter(e=>e.time>=0&&e.event.kind==='fire').map(e=>({x:e.x,z:e.z}));}
  get smolderCount():number{return this.smolderSites.length;}
  /** Called with the building redraw, never a full-world search each frame. */
  syncSmolderSites(world:WorldState):void {
    this.smolderCandidates=[];
    for(const b of Object.values(world.buildings)){
      if(b.fireWeek!==world.week||(b.state!=='damaged'&&b.state!=='destroyed')||this.buildingBeforeImpact(b.id))continue;
      const lot=world.lots[b.lotId];if(!lot)continue;
      const profile=profileForLot(b,BUILDING_BY_ID[b.typeId],lot,lotFacing(lot,world.blocks[b.blockId]?.center,b.id));
      this.smolderCandidates.push({id:b.id,x:lot.center.x,z:lot.center.y,height:profile.height,
        width:Math.min(profile.width,8),depth:Math.min(profile.depth,8)});
    }
    this.selectSmolderSites();
  }
  setFocusPoints(points:{x:number;z:number}[]):void {
    const key=points.map(p=>`${Math.floor(p.x/16)},${Math.floor(p.z/16)}`).join('|');
    if(key===this.focusKey)return;this.focusKey=key;this.focusPoints=points;this.selectSmolderSites();
  }
  private selectSmolderSites():void {
    const distance=(s:SmolderSite)=>Math.min(...this.focusPoints.map(p=>(s.x-p.x)**2+(s.z-p.z)**2));
    this.smolderSites=this.smolderCandidates.slice().sort((a,b)=>distance(a)-distance(b)).slice(0,MAX_SMOLDER_SITES);
  }
  /** Each camera can lower its buildings without advancing or restarting fire. */
  setLowered(lowered:boolean):void {
    this.lowered=lowered;this.material.uniforms.lowered.value=lowered?1:0;
    for(const fire of this.fires.values())fire.setLowered(lowered);
  }
  buildingBeforeImpact(id:number):Building|undefined {return this.emitters.find(e=>e.time<0&&e.event.buildingId===id)?.event.buildingBefore;}
  clear():void {this.emitters=[];this.smokeTime=0;this.sequence=presentationEvents(this.world).sequence;this.geometry.instanceCount=0;this.mesh.visible=false;
    for(const fire of this.fires.values())fire.dispose();this.fires.clear();this.debris.clear();this.syncSmolderSites(this.world);this.revision++;}
  update(world:WorldState,delta:number,visible=true):void {
    if(world!==this.world||world.week!==this.week){
      this.clear();this.world=world;this.week=world.week;this.sequence=presentationEvents(world).sequence;
      this.syncSmolderSites(world);
    }
    this.debris.update(Math.max(0,delta),visible);
    this.smokeTime+=Math.max(0,delta);
    for(const emitter of this.emitters){const before=emitter.time;emitter.time+=Math.max(0,delta);if(before<0&&emitter.time>=0)this.revision++;}
    this.emitters=this.emitters.filter(e=>e.time<EFFECT_DURATION[e.event.kind as 'fire'|'explosion']);
    const stream=presentationEvents(world);
    for(const event of stream.events){
      if(event.sequence<=this.sequence||event.week!==world.week||world.minute-event.minute>1||
        !['fire','explosion'].includes(event.kind))continue;
      const building=event.buildingId==null?undefined:world.buildings[event.buildingId];
      const lot=building&&world.lots[building.lotId];
      const intact=event.buildingBefore??(building&&{...building,state:'trading' as const});
      const block=building&&world.blocks[building.blockId];
      const facing=lot&&building?lotFacing(lot,block?.center,building.id):undefined;
      const profile=intact&&lot&&profileForLot(intact,BUILDING_BY_ID[intact.typeId],lot,facing);
      let faceX=0,faceZ=1;
      if(facing){faceX=facing==='east'?1:facing==='west'?-1:0;faceZ=facing==='south'?1:facing==='north'?-1:0;}
      const mass=profile?.masses[0];
      const front=event.kind==='fire'&&mass?mass.dz+mass.d*.5+.2:0;
      const along=event.kind==='fire'&&mass?mass.dx:0;
      this.emitters.push({event,time:-(event.delay??0),x:(lot?.center.x??event.pos.x)+faceX*front+faceZ*along,z:(lot?.center.y??event.pos.y)+faceZ*front-faceX*along,
        height:profile?.height??0,radius:profile?Math.min(profile.width,profile.depth)*.42:1.2,sideX:faceZ,sideZ:-faceX,
        bays:buildingFireBays(profile,event.sequence,building?r01(building.id,20):0),
        debris:event.kind==='explosion'&&profile&&lot?{seed:event.sequence,x:lot.center.x,z:lot.center.y,width:profile.width,depth:profile.depth,
          height:profile.height,faceX,faceZ,color:FACADE_PALETTES[profile.facade].wall}:undefined});
      if(event.buildingBefore&&event.delay)this.revision++;
    }
    this.sequence=stream.sequence;
    if(this.emitters.length>MAX_EMITTERS){this.emitters.splice(0,this.emitters.length-MAX_EMITTERS);this.revision++;}
    for(const [id,fire] of this.fires)if(!this.emitters.some(e=>e.event.sequence===id)){fire.dispose();this.fires.delete(id);}
    let count=0;
    for(const e of this.emitters){
      if(e.time<0)continue;
      const fire=e.event.kind==='fire',duration=fire?EFFECT_DURATION.fire:EFFECT_DURATION.explosion;
      const fade=THREE.MathUtils.smoothstep(e.time,0,fire?.18:.035)*(1-THREE.MathUtils.smoothstep(e.time,duration-3,duration));
      if(fire){
        let frontage=this.fires.get(e.event.sequence);
        if(!frontage){frontage=new ShopfrontFire(this.fireTexture,e.event.sequence,e.bays,this.scene,e.x,e.z,e.sideX,e.sideZ);this.fires.set(e.event.sequence,frontage);}
        frontage.setLowered(this.lowered);frontage.update(e.time,fade,visible&&this.textureReady);
      }else if(e.debris&&!e.debrisStarted){this.debris.add(e.debris);e.debrisStarted=true;}
      for(let i=0;i<PARTICLES;i++){
        const seed=e.event.sequence*43+i,offset=r01(seed,71),angle=r01(seed,72)*Math.PI*2;
        const flame=fire&&i<8,blast=!fire&&i<10;
        if(flame)continue; // Flames are the depth-tested THREE.Fire volume.
        // A burst fades in place; it must not turn into a smoke puff in one frame.
        const bay=e.bays[Math.floor(Math.max(0,i-8)*e.bays.length/(PARTICLES-8))%e.bays.length];
        const bayTime=Math.max(0,e.time-bay.ignition),growth=fireBayGrowth(e.time,bay);
        const cycle=fire?(bayTime/4.5+offset)%1:Math.min(1,e.time/5);
        // Start the blast at the impact, then billow outward. A full-footprint
        // scatter on frame one reads as unrelated sparks instead of one detonation.
        const burst=1-Math.exp(-e.time*4);
        const spread=Math.min(e.radius,4)*(blast?.7:1)*burst*Math.sqrt(offset);
        const size=blast?2.2+burst*3.8:fire?3.2+cycle*8:2+burst*3+cycle*3;
        const height=fire?2.8+cycle*Math.min(18,e.height+7):1.2+burst*(blast?1.4:2)+cycle*4;
        const local=fireBayLocal(bay),jitter=(offset-.5)*Math.min(bay.width,2),yaw=local.turn*Math.PI/2;
        const along=local.x+Math.cos(yaw)*jitter,front=local.z-Math.sin(yaw)*jitter,elevation=fire?(bay.elevation??0):0;
        this.centers.setXYZ(count,e.x+(fire?e.sideX*along-e.sideZ*front+cycle*cycle*3:Math.cos(angle)*spread),KERB_H+height+elevation,
          e.z+(fire?e.sideZ*along+e.sideX*front+cycle*cycle*.8:Math.sin(angle)*spread));
        this.floors.setX(count,fire&&bay.intactOnly?Math.max(1,elevation):elevation);
        const opacity=fire?Math.sin(cycle*Math.PI)*.72:blast?.95*(1-THREE.MathUtils.smoothstep(e.time,.12,.5)):
          .38*THREE.MathUtils.smoothstep(e.time,.12,.65)*(1-cycle*.8);
        this.data.setXYZW(count,size,fade*opacity*(fire?growth:1),fire?3:blast?2:0,offset*100+e.time*.3);
        count++;
      }
    }
    for(const site of this.smolderSites){
      if(world.buildings[site.id]?.fireWeek!==world.week)continue;
      if(this.emitters.some(e=>e.event.buildingId===site.id))continue;
      for(let i=0;i<SMOLDER_PARTICLES;i++){
        const phase=r01(site.id+i*31,92),cycle=(this.smokeTime/8+i/SMOLDER_PARTICLES+phase*.2)%1;
        this.centers.setXYZ(count,site.x+(phase-.5)*site.width*.65+cycle*2,KERB_H+site.height+1+cycle*6,
          site.z+(r01(site.id+i*31,93)-.5)*site.depth*.65+cycle*.6);
        this.floors.setX(count,site.height);
        this.data.setXYZW(count,2.5+cycle*5,Math.sin(cycle*Math.PI)*.42,4,phase*100+this.smokeTime*.1);count++;
      }
    }
    this.geometry.instanceCount=count;this.mesh.visible=visible&&count>0;
    if(count){this.centers.needsUpdate=true;this.data.needsUpdate=true;this.floors.needsUpdate=true;}
  }
  dispose():void {this.disposed=true;this.clear();this.debris.dispose();this.fireTexture.dispose();this.smokeTexture.dispose();this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
