import * as THREE from 'three';
import {FireVolume} from './fireVolume';
import {BodySmoke} from './bodySmoke';
import { artUrl } from '../app/artBase';

export const MAX_BURNING_ACTORS=8,FLAMES_PER_ACTOR=3;
const UP=new THREE.Vector3(0,1,0);

/** Overlapping body volumes share the building fire shader and texture. No joint billboards. */
export class BurningPeople {
  readonly volumes:FireVolume[]=[];
  readonly smoke:BodySmoke;
  private texture:THREE.Texture;
  private actors=0;
  private disposed=false;
  private axis=new THREE.Vector3();
  private center=new THREE.Vector3();
  private fallback=Array.from({length:7},()=>new THREE.Vector3());
  constructor(private scene:THREE.Scene){
    this.smoke=new BodySmoke(scene,MAX_BURNING_ACTORS);
    this.texture=typeof document==='undefined'?new THREE.Texture():new THREE.TextureLoader().load(
      artUrl('art/effects/three-fire.png'),texture=>{if(this.disposed)texture.dispose();});
    this.texture.generateMipmaps=false;
    this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;
  }
  reset():void{this.actors=0;this.smoke.reset();}
  private volume(index:number):FireVolume{
    if(!this.volumes[index]){
      const fire=new FireVolume(this.texture,index*.71+3.17);
      fire.mesh.name='volumetric-body-fire';
      // Fine turbulent tongues overlap across the coat and limbs.
      fire.mesh.material.uniforms.magnitude.value=.95;
      fire.mesh.material.uniforms.noiseScale.value.set(2.1,3.2,2.1,.45);
      // The building shader has a solid ignition base. Clothing needs a feathered,
      // irregular boundary so overlapping volumes do not reveal three round bases.
      fire.mesh.material.fragmentShader=fire.mesh.material.fragmentShader
        .replace('vec2 st = vec2(sqrt(dot(p.xz, p.xz)), p.y);',
          `vec2 st = vec2(length(p.xz), p.y);
           float edge = smoothstep(0.0,.16,p.y) * (1.0-smoothstep(.85,1.0,st.x));
           st.x += .1*snoise(p*3.0-vec3(0.0,time*2.0,0.0));`)
        .replace('return texture2D(fireTex, st);','return texture2D(fireTex, st) * edge * .85;');
      this.scene.add(fire.mesh);this.volumes[index]=fire;
    }
    return this.volumes[index];
  }
  push(x:number,y:number,z:number,time:number,deathTime:number,anchors?:readonly THREE.Vector3[],id=0,direction?:{x:number;z:number}):void{
    const fade=1-THREE.MathUtils.smoothstep(deathTime,2.0,3.8);
    if(time<0)return;
    const offsets=[[0,1.15,0],[0,1.4,0],[0,.9,0],[-.4,1.4,0],[.4,1.4,0],[-.15,.5,0],[.15,.5,0]];
    const p=anchors?.length===7?anchors:this.fallback.map((v,i)=>v.set(x+offsets[i][0],y+offsets[i][1],z+offsets[i][2]));
    this.center.copy(p[1]).lerp(p[2],.35);
    this.smoke.push(id,this.center,time,deathTime);
    if(fade<=0||this.actors>=MAX_BURNING_ACTORS)return;
    // One broad envelope around hips, chest and sleeves. Its lower half overlaps the two
    // leg volumes, so the result reads as continuous fire even as the limbs separate.
    const first=this.actors++*FLAMES_PER_ACTOR;
    this.axis.subVectors(p[1],p[2]).normalize();
    if(this.axis.lengthSq()<.5)this.axis.copy(UP);
    if(direction&&deathTime===0)this.axis.add(new THREE.Vector3(-direction.x*.32,0,-direction.z*.32)).normalize();
    const body=this.volume(first);
    this.center.copy(p[2]).lerp(p[1],.55).addScaledVector(this.axis,.30);
    body.mesh.position.copy(this.center);
    body.mesh.quaternion.setFromUnitVectors(UP,this.axis);
    const armSpan=THREE.MathUtils.clamp(p[3].distanceTo(p[4])+.35,1.05,1.5);
    body.mesh.scale.set(armSpan,2.20,1.05);
    body.update(time*.85,fade*.85,true);
    for(let n=0;n<2;n++){
      const leg=this.volume(first+1+n),knee=p[5+n];
      this.axis.subVectors(p[2],knee).normalize();
      if(this.axis.lengthSq()<.5)this.axis.copy(UP);
      leg.mesh.position.copy(knee).lerp(p[2],.35).addScaledVector(this.axis,.08);
      leg.mesh.quaternion.setFromUnitVectors(UP,this.axis);
      leg.mesh.scale.set(.54,1.35,.58);
      leg.update(time*.85,fade*.8,true);
    }
  }
  commit():void{
    this.smoke.commit();
    for(let i=this.actors*FLAMES_PER_ACTOR;i<this.volumes.length;i++)this.volumes[i].update(0,0,false);
  }
  dispose():void{
    this.disposed=true;for(const fire of this.volumes)fire.dispose();this.volumes.length=0;this.texture.dispose();this.smoke.dispose();
  }
}
