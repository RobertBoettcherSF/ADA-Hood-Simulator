import * as THREE from 'three';
import motionData from '../data/sculpt-actions.json';
import nativeMotionData from '../data/sculpt-native-actions.json';
import throwData from '../data/sculpt-throw.json';
import {actionEnvelope,liveCharacterAction, type CharacterAction} from './characterActions';
import {handlingAction,longGun,handlingDuration} from './weaponHandling';
import type {WeaponMotions} from './weaponMotions';
import type {CombatMotions,CombatMotionName} from './combatMotions';
import type {DailyGait,DailyGesture,DailyMotionName} from './dailyMotion';
import {attackClip,CLOSE_DURATION,ENDS_IN_POSTURE,postureHold,reactionClip} from './closeMotion';
import type {CloseMotionName} from './combatMotions';
import type {CombatPosture} from '../sim/types';
import {hitDuration,shootingTime,SHOOT_DURATION,PUNCH_DURATION} from './combatMotionTiming';

export interface CharacterFrame {clock:number;delta:number;action?:CharacterAction;previewActions?:boolean;
  /** Replaces the walk cycle while moving (a pursuer runs). */gait?:DailyGait;
  /** Replaces the idle stance while standing (a meeting, a search). */gesture?:DailyGesture;
  /** Close combat: a kneeling or fallen fighter holds that pose between blows. */posture?:CombatPosture}
type MotionName=CombatMotionName|DailyMotionName|CloseMotionName|'fleeBurning'|'throw'|'pistolDraw'|'pistolDualDraw'|'rifleDraw'|'rifleHolster';
const upperBody=(track:THREE.KeyframeTrack)=>/^(Spine\d*|Neck|Head|(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand))\./.test(track.name);
/** Small reactions use the body's own neutral pose, avoiding donor T-pose flails. */
function restrainedReactions(clips:Map<MotionName,THREE.AnimationClip>):void {
  const idle=clips.get('idle');if(!idle)return;
  for(const kind of ['hit','death'] as const){
    const times=kind==='hit'?[0,.10,.23,.46,.70,.9]:[0,.16,.32,.55,.78,1.1,1.4];
    const tracks=idle.tracks.map(track=>{
      const size=track.getValueSize(),base=Array.from(track.values.slice(0,size)),values:number[]=[];
      for(const time of times){
        const reaction=kind==='hit'?Math.sin(Math.PI*Math.min(1,time/.7)):0;
        const fall=kind==='death'?THREE.MathUtils.smoothstep(time,.08,1.1):0;
        const bend=kind==='death'?Math.sin(Math.PI*THREE.MathUtils.clamp(time/1.1,0,1))*.3:reaction*.12;
        if(track.name.endsWith('.quaternion')){
          const q=new THREE.Quaternion().fromArray(base),e=new THREE.Euler();
          if(track.name==='Hips.quaternion')e.set(-fall*1.51,0,fall*.10);
          else if(track.name==='Spine.quaternion')e.set(-reaction*.16+bend*.25,reaction*.08,0);
          else if(track.name==='Head.quaternion')e.set(-reaction*.12,0,-reaction*.04);
          else if(/^(Left|Right)Leg\.quaternion$/.test(track.name))e.set(bend,0,0);
          else if(/^(Left|Right)UpLeg\.quaternion$/.test(track.name))e.set(-bend*.5,0,0);
          q.multiply(new THREE.Quaternion().setFromEuler(e)).toArray(values,values.length);
        }else values.push(...base);
      }
      return track.name.endsWith('.quaternion')?new THREE.QuaternionKeyframeTrack(track.name,times,values):
        new THREE.VectorKeyframeTrack(track.name,times,values);
    });
    clips.set(kind,new THREE.AnimationClip(kind,times.at(-1)!,tracks));
  }
}
/** Retarget rotation deltas onto each body's own bind axes and limb lengths. */
export function characterClips(model:THREE.Object3D,walk?:THREE.AnimationClip,style='',weapons?:WeaponMotions,combat?:CombatMotions):Map<MotionName,THREE.AnimationClip> {
  const bones=new Map<string,THREE.Bone>();model.traverse(o=>{if(o instanceof THREE.Bone)bones.set(o.name,o);});
  const rest=motionData.rest as Record<string,{position:number[];quaternion:number[]}>;
  const clips=new Map<MotionName,THREE.AnimationClip>();
  const imported=()=>{
    for(const [name,source] of Object.entries(combat?.clips??{})){
      const data=source.styles[style];if(!data)continue;
      let tracks:THREE.KeyframeTrack[]=data.tracks.filter(t=>bones.has(t.name.split('.')[0])).map(t=>t.name.endsWith('.quaternion')?
        new THREE.QuaternionKeyframeTrack(t.name,t.times,t.values):new THREE.VectorKeyframeTrack(t.name,t.times,t.values));
      if(name.endsWith('Shoot'))tracks=tracks.filter(upperBody);
      clips.set(name as MotionName,new THREE.AnimationClip(name,source.duration,tracks));
    }
    if(walk)clips.set('fleeBurning',burningRunClip(walk));
    return clips;
  };
  for(const [name,source] of Object.entries(weapons?.clips??{})){
    const data=source.styles[style];if(!data)continue;
    const tracks=data.tracks.filter(t=>bones.has(t.name.split('.')[0])).map(t=>t.name.endsWith('.quaternion')?
      new THREE.QuaternionKeyframeTrack(t.name,t.times,t.values):new THREE.VectorKeyframeTrack(t.name,t.times,t.values));
    // Keep the game's distance-based gait and planted feet while handling a gun.
    clips.set(name as MotionName,new THREE.AnimationClip(name,source.duration,tracks.filter(upperBody)));
  }
  const throwing=throwData.styles[style as keyof typeof throwData.styles];
  if(throwing)clips.set('throw',new THREE.AnimationClip('throw',throwData.duration,throwing.tracks.filter(t=>bones.has(t.name.split('.')[0])).map(t=>
    t.name.endsWith('.quaternion')?new THREE.QuaternionKeyframeTrack(t.name,t.times,t.values):new THREE.VectorKeyframeTrack(t.name,t.times,t.values))));
  if(walk){
    // A quiet, balanced stance from this body's approved gait. The generic
    // Sculpt "Idle" is an exaggerated gesture and is unsuitable for street NPCs.
    const tracks:THREE.KeyframeTrack[]=[];
    for(const track of walk.tracks){
      const sample=track.createInterpolant(),size=track.getValueSize();
      const values=new Array<number>(size).fill(0),q=new THREE.Quaternion();
      for(let n=0;n<8;n++){
        const pose=sample.evaluate(n/8*walk.duration);
        if(track.name.endsWith('.quaternion')){
          if(n===0)q.fromArray(pose);else q.slerp(new THREE.Quaternion().fromArray(pose),1/(n+1));
        }else for(let i=0;i<size;i++)values[i]+=pose[i]/8;
      }
      if(track.name.endsWith('.quaternion')){q.toArray(values);tracks.push(new THREE.QuaternionKeyframeTrack(track.name,[0,4],[...values,...values]));}
      else tracks.push(new THREE.VectorKeyframeTrack(track.name,[0,4],[...values,...values]));
    }
    clips.set('idle',new THREE.AnimationClip('idle',4,tracks));
  }
  const native=(nativeMotionData as Record<string,typeof nativeMotionData.policeChief>)[style.startsWith('judge')?'policeChief':style];
  if(native){
    for(const source of native){
      const tracks=source.tracks.filter(t=>bones.has(t.name.split('.')[0])).map(t=>t.name.endsWith('.quaternion')?
        new THREE.QuaternionKeyframeTrack(t.name,t.times,t.values):new THREE.VectorKeyframeTrack(t.name,t.times,t.values));
      clips.set(source.name as MotionName,new THREE.AnimationClip(source.name,source.duration,tracks));
    }
    restrainedReactions(clips);return imported();
  }
  for(const source of motionData.clips){
    const tracks:THREE.KeyframeTrack[]=[];
    for(const track of source.tracks){
      const name=track.name.split('.')[0],bone=bones.get(name),bind=rest[name];if(!bone||!bind)continue;
      const values=track.values.slice();
      if(track.name.endsWith('.quaternion')){
        // Earlier bodies were bound with lowered arms. Their local limb axes
        // still match Sculpt's canonical rig; applying that A-pose offset again
        // folds hands behind the back when the donor raises its arms.
        const correction=/^(Left|Right)(Arm|ForeArm|Hand)$/.test(name)?new THREE.Quaternion():
          bone.quaternion.clone().multiply(new THREE.Quaternion().fromArray(bind.quaternion).invert());
        const q=new THREE.Quaternion();
        for(let i=0;i<values.length;i+=4){q.fromArray(values,i).premultiply(correction).normalize().toArray(values,i);}
        tracks.push(new THREE.QuaternionKeyframeTrack(track.name,track.times,values));
      }else{
        // Sculpt bone channels use centimetres; inverse-bind root positions use metres.
        const scale=bone.position.y/(rest.Hips.position[1]*100);
        for(let i=0;i<values.length;i+=3)for(let c=0;c<3;c++)
          values[i+c]=bone.position.getComponent(c)+(values[i+c]-rest.Hips.position[c]*100)*scale;
        tracks.push(new THREE.VectorKeyframeTrack(track.name,track.times,values));
      }
    }
    clips.set(source.name as MotionName,new THREE.AnimationClip(source.name,source.duration,tracks));
  }
  restrainedReactions(clips);return imported();
}

/** Seconds over which an interrupted pose blends into its replacement. */
export const INTERRUPTION_FADE=.15;

/** Actions that replace the whole body's pose while they run. */
const WHOLE_BODY=new Set(['hit','death','burnDeath','fleeBurning','throw','strike']);
/** A death signature: deaths neither fade in nor out. */
const fatalSignature=(sig:string|null)=>!!sig&&(sig.startsWith('death|')||sig.startsWith('burnDeath|'));

export class CharacterMotion {
  private actions=new Map<string,THREE.AnimationAction>();
  private walkWeight=0;
  private initialized=false;
  private pose:{bone:THREE.Bone;position:THREE.Vector3;quaternion:THREE.Quaternion;scale:THREE.Vector3}[]=[];
  /** Interruptions (a gunman hit mid-aim, an action ending, a gesture
   * changing) fade from the last shown pose instead of jumping in one frame. */
  private signature:string|null=null;
  private fadeFrom:{position:THREE.Vector3;quaternion:THREE.Quaternion}[]=[];
  /** The pose last shown (after fades and IK). this.pose keeps the raw mixer
   * sample: the mixer skips re-writing unchanged values, so restoring a faded
   * pose there would freeze it. */
  private shown:{position:THREE.Vector3;quaternion:THREE.Quaternion}[]=[];
  private fadeTime=INTERRUPTION_FADE;
  constructor(private mixer:THREE.AnimationMixer,walk:THREE.AnimationClip,clips:Map<MotionName,THREE.AnimationClip>){
    (mixer.getRoot() as THREE.Object3D).traverse(o=>{if(o instanceof THREE.Bone)
      this.pose.push({bone:o,position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone()});});
    this.shown=this.pose.map(p=>({position:p.position.clone(),quaternion:p.quaternion.clone()}));
    this.fadeFrom=this.pose.map(p=>({position:p.position.clone(),quaternion:p.quaternion.clone()}));
    mixer.stopAllAction();
    for(const [name,clip] of [['walk',walk],...clips] as [string,THREE.AnimationClip][]){
      const variants=name==='walk'||name==='idle'?[
        new THREE.AnimationClip(name+'Upper',clip.duration,clip.tracks.filter(upperBody)),
        new THREE.AnimationClip(name+'Lower',clip.duration,clip.tracks.filter(t=>!upperBody(t)))]:[clip];
      for(const variant of variants){const action=mixer.clipAction(variant);action.play();action.paused=true;this.actions.set(variant.name,action);}
    }
    // stopAllAction restores the bind pose; equipment anchors must still be
    // measured in the same normalized reference pose as the accepted bodies.
    for(const p of this.pose){p.bone.position.copy(p.position);p.bone.quaternion.copy(p.quaternion);p.bone.scale.copy(p.scale);}
  }
  reset():void{this.initialized=false;this.forgetPose();}
  /** After a measurement-only sample (grip or release calibration), which must
   * not be faded from as if it had been shown. */
  forgetPose():void{this.signature=null;this.fadeTime=INTERRUPTION_FADE;}
  get standingWeight():number{return 1-this.walkWeight;}
  private rememberPose():void{for(const p of this.pose){p.position.copy(p.bone.position);p.quaternion.copy(p.bone.quaternion);p.scale.copy(p.bone.scale);}}
  sample(phase:number,walking:boolean,frame?:CharacterFrame):void {
    // What was on screen, including hand IK and procedural arms, is where an
    // interruption fades from.
    this.pose.forEach((p,i)=>{this.shown[i].position.copy(p.bone.position);this.shown[i].quaternion.copy(p.bone.quaternion);});
    // Three skips equal property values. Remove the previous frame's hand IK
    // before sampling, including paused frames and action interruptions.
    for(const p of this.pose){p.bone.position.copy(p.position);p.bone.quaternion.copy(p.quaternion);p.bone.scale.copy(p.scale);}
    // Legacy callers without a presentation frame retain the distance-based gait.
    if(!frame){
      for(const [name,action] of this.actions){
        action.enabled=true;action.weight=name.startsWith('walk')?1:0;
        action.time=name.startsWith('walk')&&walking?((phase/(Math.PI*2))%1+1)%1*action.getClip().duration:0;
      }
      this.mixer.update(0);this.rememberPose();return;
    }
    const delta=frame?.delta??1;
    const target=walking?1:0;
    if(!this.initialized||!frame){this.walkWeight=target;this.initialized=true;}
    else this.walkWeight=THREE.MathUtils.damp(this.walkWeight,target,16,delta);
    const event=liveCharacterAction(frame.action,frame.previewActions);
    const gun=!!event&&(handlingAction(event)||event.kind==='shoot');
    const readyName=longGun(event?.weapon)?'rifleDraw':event?.weapon==='twinPistols'?'pistolDualDraw':'pistolDraw';
    const shootingName=event?.weapon==='tommy'?'tommyShoot':longGun(event?.weapon)?'rifleShoot':event?.weapon==='twinPistols'?'pistolDualShoot':'pistolShoot';
    const hitName=longGun(event?.weapon)?'hitRifle':event?.weapon?'hitPistol':'hit';
    // Close combat (Cart.txt): the blow's own attack or reaction clip, and the
    // kneeling or lying hold between blows (src/render/closeMotion.ts).
    const blowClip=event?.blow&&(event.kind==='strike'||event.kind==='hit')?
      (event.kind==='strike'?attackClip(event.blow):reactionClip(event.blow)):null;
    const closeName=blowClip&&this.actions.has(blowClip)?blowClip:null;
    const hold=!closeName&&(!event||event.blow)?postureHold(frame.posture):null;
    const holdName=hold&&this.actions.has(hold)?hold:null;
    const standardClip=event?.kind==='shoot'&&this.actions.has(shootingName)?shootingName:
      gun?(event?.kind==='holster'&&longGun(event.weapon)&&!event.reverseDraw?'rifleHolster':readyName):
      event?.kind==='hit'&&this.actions.has(hitName)?hitName:
      event&&WHOLE_BODY.has(event.kind)?event.kind:null;
    // A blow whose reaction is "do nothing" shows no flinch.
    const clipName=closeName??holdName??(event?.blow&&event.kind==='hit'?null:standardClip);
    const eventWeight=holdName?1:
      closeName?(ENDS_IN_POSTURE.has(closeName)?THREE.MathUtils.smoothstep(event!.time,0,.12):actionEnvelope(event!.time,CLOSE_DURATION[closeName],.12,.22)):
      gun&&event?(event.kind==='draw'?THREE.MathUtils.smoothstep(event.time,0,.18):
      event.kind==='holster'?1-THREE.MathUtils.smoothstep(event.time,handlingDuration(event)-.2,handlingDuration(event)):
      event.kind==='shoot'?actionEnvelope(event.time,SHOOT_DURATION,.16,.18):1):
      event?.kind==='fleeBurning'?1:
      event?.kind==='burnDeath'?1:
      event?.kind==='death'?THREE.MathUtils.smoothstep(event.time,0,.15):
      event&&clipName?actionEnvelope(event.time,event.kind==='throw'?throwData.duration:event.kind==='hit'?hitDuration(event.weapon):PUNCH_DURATION,event.kind==='throw'?.2:.12,event.kind==='throw'?.35:.22):0;
    const rifleBlend=clipName==='rifleHolster'?THREE.MathUtils.smoothstep(event?.time??0,0,.18):1;
    const gaitName=frame.gait&&this.actions.has(frame.gait)?frame.gait:null;
    const gestureName=frame.gesture&&this.actions.has(frame.gesture)?frame.gesture:null;
    // (Built without an intermediate array: this runs for every body every frame.)
    const signature=`${clipName??''}|${gun?readyName:''}|${gaitName??''}|${gestureName??''}`;
    // Deaths ramp in on their own and a fallen body never rises, so they
    // neither fade in nor out (grounding follows the active pose).
    if(this.signature!==null&&signature!==this.signature&&!fatalSignature(signature)&&!fatalSignature(this.signature)){
      this.shown.forEach((p,i)=>{this.fadeFrom[i].position.copy(p.position);this.fadeFrom[i].quaternion.copy(p.quaternion);});this.fadeTime=0;
    }
    this.signature=signature;
    // forEach rather than for..of over entries: no [name, action] pair per
    // clip per body per frame (about 35 clips a body).
    this.actions.forEach((action,name)=>{
      const duration=action.getClip().duration;
      action.enabled=true;
      const baseWeight=gun&&name.endsWith('Lower')?1:event?.kind==='shoot'?0:1-eventWeight;
      if(name.startsWith('walk')||name===gaitName){action.time=((phase/(Math.PI*2))%1+1)%1*duration;
        action.weight=this.walkWeight*baseWeight*(name===gaitName||!gaitName?1:0);}
      else if(name.startsWith('idle')||name===gestureName){action.time=(frame?.clock??0)%duration;
        action.weight=(1-this.walkWeight)*baseWeight*(name===gestureName||!gestureName?1:0);}
      else{
        action.weight=name===clipName?eventWeight*rifleBlend:gun&&name===readyName?(event.kind==='shoot'?1-eventWeight:eventWeight*(1-rifleBlend)):0;
        const death=event?.kind==='death'||event?.kind==='burnDeath';
        // Reactions run once; the grounded final fall holds until the cue expires.
        const playback=death?duration:event?.kind==='throw'?throwData.duration:event?.kind==='hit'?hitDuration(event.weapon):PUNCH_DURATION;
        action.time=Math.min(duration-.0001,Math.max(0,event?.time??0)/playback*duration);
        if(event?.kind==='fleeBurning')action.time=(event.time%.6)/.6*duration;
        if(name===closeName)action.time=Math.min(duration-.0001,Math.max(0,event?.time??0));
        if(name===holdName)action.time=duration-.0001;
        if(gun&&event&&event.kind!=='shoot'){
          const time=event.kind==='draw'?event.time:event.kind==='holster'?
            (clipName==='rifleHolster'&&name==='rifleHolster'?event.time:duration-event.time):duration;
          action.time=THREE.MathUtils.clamp(name===readyName&&clipName==='rifleHolster'?duration:time,0,duration-.0001);
        }
        if(event?.kind==='shoot'&&this.actions.has(shootingName))action.time=name===readyName?duration-.0001:Math.min(duration-.0001,shootingTime(event.time,event.weapon));
      }
    });
    // Only clips that contribute this frame are evaluated: three.js skips a
    // disabled action, and every body carries ~35 clips (combat, daily, close).
    this.actions.forEach(action=>{action.enabled=action.weight>0;});
    this.mixer.update(0);
    // Cache the sampled base before procedural gestures. Restoring an already
    // raised arm can otherwise leak the last panic pose into an unchanged walk key.
    this.rememberPose();
    if(this.fadeTime<INTERRUPTION_FADE){
      this.fadeTime+=Math.max(0,delta);
      const t=THREE.MathUtils.smoothstep(this.fadeTime,0,INTERRUPTION_FADE);
      this.pose.forEach((p,i)=>{p.bone.quaternion.slerpQuaternions(this.fadeFrom[i].quaternion,p.quaternion,t);
        p.bone.position.lerpVectors(this.fadeFrom[i].position,p.position,t);});
    }
    if(event?.kind==='fleeBurning')this.panicArms(event.time,1);
    // Blend the final raised-arm run into the donor's first collapse frame.
    if(event?.kind==='burnDeath'&&event.time<.24)this.panicArms(event.time+4.2,1-THREE.MathUtils.smoothstep(event.time,0,.24));
    if(event?.kind==='shock')this.panicArms(event.time,actionEnvelope(event.time,14,.3,.8),true);
  }

  private panicArms(time:number,blend:number,shock=false):void{
    const root=this.mixer.getRoot() as THREE.Object3D;
    root.updateMatrixWorld(true);
    const inverse=root.matrixWorld.clone().invert();
    const point=(bone:THREE.Bone)=>bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
    const head=root.getObjectByName('Head') as THREE.Bone|undefined;
    if(!head)return;
    const top=point(head),hip=root.getObjectByName('Hips') as THREE.Bone;
    const height=Math.abs(top.y-point(hip).y)||.8;
    const aim=(bone:THREE.Bone,child:THREE.Bone,target:THREE.Vector3)=>{
      const origin=bone.getWorldPosition(new THREE.Vector3());
      const from=child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
      const to=target.applyMatrix4(root.matrixWorld).sub(origin).normalize();
      const q=new THREE.Quaternion().setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
      q.premultiply(bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert());bone.quaternion.slerp(q,blend);bone.updateWorldMatrix(false,true);
    };
    for(const [side,sign] of [['Left',1],['Right',-1]] as const){
      const upper=root.getObjectByName(side+'Arm') as THREE.Bone,lower=root.getObjectByName(side+'ForeArm') as THREE.Bone,hand=root.getObjectByName(side+'Hand') as THREE.Bone;
      if(!upper||!lower||!hand)continue;
      const wave=Math.sin(time*11+sign*.8);
      aim(upper,lower,new THREE.Vector3(top.x+sign*height*(shock?.38:.75),top.y-height*(shock?.68:.35+.08*wave),top.z+height*.13));
      aim(lower,hand,shock?new THREE.Vector3(top.x+sign*height*.1,top.y-height*(sign<0?.10:.38),top.z+height*.22):
        new THREE.Vector3(top.x+sign*height*(.30+.1*wave),top.y+height*.12,top.z+height*.38));
    }
  }
}

/** A faster, deeper stride with a forward lean. Upper limbs are aimed in rig
 * space afterwards so the same authored panic gesture fits every body. */
function burningRunClip(walk:THREE.AnimationClip):THREE.AnimationClip{
  const tracks=walk.tracks.map(track=>{
    const copy=track.clone();
    if(copy.name.endsWith('.quaternion')){
      const mean=new THREE.Quaternion(),q=new THREE.Quaternion();
      for(let i=0;i<copy.values.length;i+=4){q.fromArray(copy.values,i);if(!i)mean.copy(q);else mean.slerp(q,4/(i+4));}
      for(let i=0;i<copy.values.length;i+=4){
        q.fromArray(copy.values,i);
        if(/^(Left|Right)(UpLeg|Leg)\./.test(copy.name))q.copy(mean).slerp(new THREE.Quaternion().fromArray(copy.values,i),1.3);
        if(copy.name==='Spine.quaternion')q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.14,0,0)));
        q.toArray(copy.values,i);
      }
    }
    return copy;
  });
  return new THREE.AnimationClip('fleeBurning',walk.duration,tracks);
}
