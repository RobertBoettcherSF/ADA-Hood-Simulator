import * as THREE from 'three';
import { type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sculptLoader, sculptModelUrl } from './sculptLoader';
import { limitTextureSize, textureLimit } from './textureQuality';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ActorStyle } from './actors';
import { MAX_DETAILED_CHARACTERS, MAX_SPARE_CHARACTERS } from './characterDetail';
import { EquipmentModels } from './equipmentModels';
import { DETAILED_CHARACTER_STYLES, DETAILED_CHARACTER_HEIGHTS, detailedCharacterStyle, hasDedicatedBody, type DetailedCharacterStyle } from './detailedCharacters';
import { GENERATED_EQUIPMENT, GENERATED_EQUIPMENT_KINDS, prepareGeneratedEquipment } from './generatedEquipment';
import { CharacterEquipment, type CharacterAppearance } from './characterEquipment';
import { CharacterMotion, characterClips, type CharacterFrame } from './characterMotion';
import { THROW_RELEASE,liveCharacterAction } from './characterActions';
import {loadWeaponMotions} from './weaponMotions';
import {loadCombatMotions} from './combatMotions';
import { characterSupports, characterFloor, type GroundSupport } from './characterGrounding';
import type { VehicleId } from '../sim/types';
import { createSculptVehicle, SCULPT_VEHICLE_KINDS } from './sculptVehicles';

const STYLES = DETAILED_CHARACTER_STYLES;
const EQUIPMENT_KINDS = GENERATED_EQUIPMENT_KINDS;
const ACTOR_HEIGHT = DETAILED_CHARACTER_HEIGHTS;

interface CharacterTemplate {
  scene: THREE.Group;
  clip: THREE.AnimationClip;
  actions?: ReturnType<typeof characterClips>;
  normalization?: {
    scale: THREE.Vector3;
    position: THREE.Vector3;
    skinBounds: { box: THREE.Box3 | null; sphere: THREE.Sphere | null }[];
  };
}
interface CharacterEntry {
  style: DetailedCharacterStyle;
  group: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clip: THREE.AnimationClip;
  used: boolean;
  equipment?: CharacterEquipment;
  motion: CharacterMotion;
  ground?:GroundSupport[];
  baseY:number;
  idleLift?:number;
  burntFloorLift?:number;
  burnAnchors?:{bone:THREE.Object3D;point:THREE.Vector3}[];
}

/** Detailed city models, shared by normal play and the art review. Picking and game state remain owned by CityRenderer. */
export class SculptReviewLayer {
  ready = false;
  error: string | null = null;
  private vehicles = new Map<VehicleId, { parts: THREE.InstancedMesh[]; count: number }>();
  private vehicleMaterials: THREE.Material[] = [];
  private templates = new Map<DetailedCharacterStyle, CharacterTemplate>();
  private characters = new Map<number, CharacterEntry>();
  private idleCharacters: CharacterEntry[] = [];
  private sourceScenes: THREE.Object3D[] = [];
  private sourceTextures = new Set<THREE.Texture>();
  private equipmentLibrary = new EquipmentModels();
  private visible = true;
  private disposed = false;

  constructor(private scene: THREE.Scene, private carCapacity: number,
    private onReady: () => void, private characterCapacity = MAX_DETAILED_CHARACTERS) {}

  async load(): Promise<void> {
    try {
      const loader = await sculptLoader();
      const [results,[weaponResult,combatResult]] = await Promise.all([Promise.allSettled([
        ...SCULPT_VEHICLE_KINDS.map(kind => loader.loadAsync(sculptModelUrl(`${kind}.glb`))),
        ...STYLES.map(style => loader.loadAsync(sculptModelUrl(`${style}.glb`))),
        ...EQUIPMENT_KINDS.map(kind => loader.loadAsync(sculptModelUrl(`weapons/${GENERATED_EQUIPMENT[kind].file}.glb`))),
      ]),Promise.allSettled([loadWeaponMotions(),loadCombatMotions()] as const)]);
      const loaded = results.filter((result): result is PromiseFulfilledResult<GLTF> => result.status === 'fulfilled').map(result => result.value);
      // Navigation can finish while GLBs are still loading. Release every fulfilled
      // response, including siblings of a failed request, before leaving the layer.
      if (this.disposed || weaponResult.status==='rejected' || combatResult.status==='rejected' || results.some(result => result.status === 'rejected')) {
        releaseSourceModels(loaded.map(asset => asset.scene));
        if (this.disposed) return;
        if(weaponResult.status==='rejected')throw weaponResult.reason;
        if(combatResult.status==='rejected')throw combatResult.reason;
        const failed = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
        throw failed.reason;
      }
      const cars = loaded.slice(0, SCULPT_VEHICLE_KINDS.length);
      const people = loaded.slice(SCULPT_VEHICLE_KINDS.length, SCULPT_VEHICLE_KINDS.length+STYLES.length);
      const props = loaded.slice(SCULPT_VEHICLE_KINDS.length+STYLES.length);
      this.sourceScenes.push(...loaded.map(asset => asset.scene));
      const maxTexture = textureLimit();
      for (const asset of loaded) asset.scene.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(child.material) ? child.material : [child.material])
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) {
            // Sculpt UV islands have insufficient padding for mip filtering.
            value.minFilter = THREE.LinearFilter;
            value.generateMipmaps = false;
            if (!this.sourceTextures.has(value)) limitTextureSize(value, maxTexture);
            value.needsUpdate = true;
            this.sourceTextures.add(value);
          }
      });
      for (const [personIndex,person] of people.entries()) person.scene.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          // Sculpt's character GLBs reuse the albedo as an emission map and set
          // specular colour above 1. Both exaggerate pale texels in daylight.
          // Cloth and skin should be lit once, by the city lights.
          material.emissiveMap = null;
          material.emissive.setRGB(0, 0, 0);
          if(!hasDedicatedBody(STYLES[personIndex])) material.color.multiplyScalar(1.2);
          material.roughness = 1;
          material.metalness = 0;
          if (material instanceof THREE.MeshPhysicalMaterial) material.specularIntensity = 0;
          material.needsUpdate = true;
        }
      });
      SCULPT_VEHICLE_KINDS.forEach((kind, index) => {
        const vehicle = createSculptVehicle(cars[index].scene, kind, this.carCapacity);
        this.vehicles.set(kind, { parts: vehicle.parts, count: 0 });
        this.vehicleMaterials.push(...vehicle.ownedMaterials);
        for (const part of vehicle.parts) { part.visible = this.visible; this.scene.add(part); }
      });
      STYLES.forEach((style, index) => {
        const clip = people[index].animations[0];
        if (!clip) throw new Error(`Sculpt ${style} has no walking clip`);
        this.templates.set(style, { scene: people[index].scene, clip, actions: characterClips(people[index].scene,clip,style,weaponResult.value,combatResult.value) });
      });
      EQUIPMENT_KINDS.forEach((kind,index)=>this.equipmentLibrary.install(kind,prepareGeneratedEquipment(kind,props[index].scene)));
      this.ready = true;
      this.onReady();
    } catch (error) {
      if (this.disposed) return;
      this.dispose();
      this.error = error instanceof Error ? error.message : String(error);
      this.onReady();
    }
  }

  resetCharacters(): void { for (const entry of this.characters.values()) entry.used = false; }

  pushCharacter(id: number, baseStyle: ActorStyle, matrix: THREE.Matrix4,
    phase: number, walking: boolean, appearance?: CharacterAppearance, frame?: CharacterFrame): boolean {
    if (!this.ready || !this.visible) return false;
    const style=detailedCharacterStyle(baseStyle,appearance?.role);
    const template = this.templates.get(style);
    if (!template) return false;
    let entry = this.characters.get(id);
    if (entry && entry.style !== style) { this.removeCharacter(id, entry); entry = undefined; }
    if (!entry) {
      // An unvisited entry may still be needed later in this frame. Wait for
      // commitCharacters to release departures instead of evicting live rigs.
      if (this.characters.size >= this.characterCapacity) return false;
      const cached = this.idleCharacters.findIndex(candidate => candidate.style === style);
      if (cached >= 0) entry = this.idleCharacters.splice(cached, 1)[0];
      else {
        // Active and spare rigs share one bound. Replace an unused style only
        // when a matching spare is unavailable and the total pool is full.
        if (this.characters.size + this.idleCharacters.length >= this.characterCapacity)
          this.disposeCharacter(this.idleCharacters.pop()!);
        const model = cloneSkeleton(template.scene);
        const mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(template.clip).play();
        // Measure the same posed frame used by the original normalization.
        mixer.setTime(0);
        if (template.normalization) {
          model.scale.copy(template.normalization.scale);
          model.position.copy(template.normalization.position);
          let index = 0;
          model.traverse(child => {
            if (!(child instanceof THREE.SkinnedMesh)) return;
            const bounds = template.normalization!.skinBounds[index++];
            if (bounds.box) child.boundingBox = bounds.box.clone();
            if (bounds.sphere) child.boundingSphere = bounds.sphere.clone();
          });
        } else {
          model.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          if (size.y <= 0) {
            mixer.stopAllAction();
            model.traverse(child => { if (child instanceof THREE.SkinnedMesh) child.skeleton.dispose(); });
            return false;
          }
          const scale = ACTOR_HEIGHT[style] / size.y;
          model.scale.multiplyScalar(scale);
          model.updateMatrixWorld(true);
          const scaled = new THREE.Box3().setFromObject(model);
          const center = scaled.getCenter(new THREE.Vector3());
          model.position.sub(new THREE.Vector3(center.x, scaled.min.y, center.z));
          // Every clone uses this same posed reference for height and pivot.
          // Review meshes disable frustum culling and mesh picking. For opaque
          // materials their sphere only supplies a draw-sort reference, so it
          // can share the reference pose instead of scanning vertices per rig.
          // Transparent meshes keep their usual first-draw sphere calculation.
          model.updateMatrixWorld(true);
          const skinBounds: NonNullable<CharacterTemplate['normalization']>['skinBounds'] = [];
          model.traverse(child => {
            if (!(child instanceof THREE.SkinnedMesh)) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            if (materials.every(material => !material.transparent)) child.computeBoundingSphere();
            skinBounds.push({ box: child.boundingBox?.clone() ?? null, sphere: child.boundingSphere?.clone() ?? null });
          });
          template.normalization = { scale: model.scale.clone(), position: model.position.clone(), skinBounds };
        }
        model.traverse(child => {
          if (!(child instanceof THREE.Mesh)) return;
          child.castShadow = true;
          // Keep the character's ground shadow without blotchy self-shadowing.
          child.receiveShadow = false;
          child.frustumCulled = false;
          child.raycast = () => {};
        });
        const group = new THREE.Group();
        group.matrixAutoUpdate = false;
        group.add(model);
        entry = { style, group, model, mixer, clip: template.clip, used: true,
          motion:new CharacterMotion(mixer,template.clip,template.actions??new Map()),baseY:model.position.y };
        // Construct bindings in the neutral root, before assigning a city matrix.
        if (appearance) entry.equipment = new CharacterEquipment(group, model, this.equipmentLibrary, style === 'worker', hasDedicatedBody(style));
      }
      entry.group.name = `sculpt-review-actor-${id}`;
      entry.motion.reset();
      entry.group.userData.modelStyle=style;
      this.scene.add(entry.group);
      this.characters.set(id, entry);
    }
    if (appearance && !entry.equipment) {
      entry.group.matrix.identity(); entry.group.matrixWorldNeedsUpdate = true;
      entry.mixer.setTime(0);
      entry.equipment = new CharacterEquipment(entry.group, entry.model, this.equipmentLibrary, style === 'worker', hasDedicatedBody(style));
    }
    entry.equipment?.set(appearance);
    entry.used = true;
    entry.group.matrix.copy(matrix);
    entry.group.matrixWorldNeedsUpdate = true;
    entry.group.visible = this.visible;
    // ActorMotion is already distance-based; sample this in-place cycle at its phase.
    entry.model.position.y=entry.baseY;
    // Floor corrections are measured in world units; the group may be scaled
    // (CHARACTER_SCALE), so convert them into its local units.
    const groupScale=Math.hypot(matrix.elements[4],matrix.elements[5],matrix.elements[6])||1;
    if(appearance?.weapon&&entry.equipment&&!entry.equipment.hasWeaponGrip){
      entry.motion.sample(phase,false,{clock:0,delta:0,action:{kind:'ready',weapon:appearance.weapon,time:0}});
      entry.group.updateMatrixWorld(true);entry.equipment.captureWeaponGrip();entry.motion.forgetPose();
    }
    if(frame?.action?.kind==='throw'&&entry.equipment&&!entry.equipment.hasThrowRelease){
      entry.motion.sample(phase,false,{...frame,delta:0,action:{...frame.action,time:THROW_RELEASE}});
      entry.group.updateMatrixWorld(true);entry.ground??=characterSupports(entry.model);
      entry.model.position.y+=(matrix.elements[13]-characterFloor(entry.ground))/groupScale;entry.group.updateMatrixWorld(true);
      entry.equipment?.captureThrowRelease();entry.model.position.y=entry.baseY;entry.motion.forgetPose();
    }
    entry.motion.sample(phase,walking,frame);
    entry.group.updateMatrixWorld(true);
    if(frame){
      const action=liveCharacterAction(frame.action,frame.previewActions);
      // Kneeling or lying between close-combat blows is grounded like a fall.
      const active=(action&&['hit','death','burnDeath','fleeBurning','strike','throw'].includes(action.kind))||
        (frame.posture!=null&&frame.posture!=='standing');
      if(active||entry.motion.standingWeight>.999){
        entry.ground??=characterSupports(entry.model);
        const heldCorpse=action?.kind==='burnDeath'&&action.time>=4.5;
        const lift=heldCorpse?(entry.burntFloorLift??(entry.burntFloorLift=matrix.elements[13]-characterFloor(entry.ground))):active?matrix.elements[13]-characterFloor(entry.ground):
          entry.idleLift??(entry.idleLift=matrix.elements[13]-characterFloor(entry.ground));
        entry.model.position.y+=lift/groupScale;entry.group.updateMatrixWorld(true);
      }else if(entry.idleLift){
        entry.model.position.y+=entry.idleLift*entry.motion.standingWeight/groupScale;entry.group.updateMatrixWorld(true);
      }
    }
    entry.equipment?.pose(liveCharacterAction(frame?.action,frame?.previewActions),true);
    entry.group.userData.action=frame?.action?.kind??(walking?'walk':'idle');
    return true;
  }

  /** Release off-screen or low-priority rigs before filling the bounded visible set. */
  burningAnchors(id:number):THREE.Vector3[]|undefined{
    const entry=this.characters.get(id);if(!entry)return;
    entry.burnAnchors??=['Spine','Spine1','Hips','LeftForeArm','RightForeArm','LeftLeg','RightLeg'].map(name=>
      ({bone:entry.model.getObjectByName(name)??entry.model.getObjectByName('Spine')!,point:new THREE.Vector3()}));
    return entry.burnAnchors.map(({bone,point})=>bone.getWorldPosition(point));
  }
  fireNozzle(id:number):THREE.Vector3|undefined{
    const nozzle=this.characters.get(id)?.model.getObjectByName('equipment-fireHose');
    if(nozzle){nozzle.updateWorldMatrix(true,false);return nozzle.localToWorld(new THREE.Vector3(0,0,.31));}
  }

  /** Release off-screen or low-priority rigs before filling the bounded visible set. */
  retainCharacters(ids: ReadonlySet<number>): void {
    for (const [id, entry] of this.characters) if (!ids.has(id)) {
      entry.group.removeFromParent(); this.characters.delete(id); this.idleCharacters.push(entry);
    }
    this.trimSpareCharacters();
  }

  commitCharacters(): void {
    for (const [id, entry] of this.characters) if (!entry.used) {
      entry.group.removeFromParent();
      this.characters.delete(id);
      this.idleCharacters.push(entry);
    }
    this.trimSpareCharacters();
  }

  private trimSpareCharacters(): void {
    while (this.idleCharacters.length > MAX_SPARE_CHARACTERS)
      this.disposeCharacter(this.idleCharacters.pop()!);
  }

  private disposeCharacter(entry: CharacterEntry): void {
    entry.group.removeFromParent();
    entry.equipment?.dispose();
    entry.model.traverse(child => { if (child instanceof THREE.SkinnedMesh) child.skeleton.dispose(); });
    entry.mixer.stopAllAction();
  }

  private removeCharacter(id: number, entry: CharacterEntry): void {
    this.disposeCharacter(entry);
    this.characters.delete(id);
  }

  resetVehicles(): void { for (const vehicle of this.vehicles.values()) vehicle.count = 0; }
  pushVehicle(kind: VehicleId, matrix: THREE.Matrix4): boolean {
    const vehicle = this.vehicles.get(kind);
    if (!this.ready || !this.visible || !vehicle || vehicle.count >= this.carCapacity) return false;
    for (const part of vehicle.parts) part.setMatrixAt(vehicle.count, matrix);
    vehicle.count++;
    return true;
  }
  pushCoupe(matrix: THREE.Matrix4): boolean { return this.pushVehicle('coupe', matrix); }
  commitVehicles(): void {
    for (const vehicle of this.vehicles.values()) for (const part of vehicle.parts) {
      part.count = vehicle.count;
      if (vehicle.count) part.instanceMatrix.needsUpdate = true;
    }
  }
  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const vehicle of this.vehicles.values()) for (const part of vehicle.parts) part.visible = visible;
    for (const entry of this.characters.values()) entry.group.visible = visible;
  }
  createEquipment(kind: import('./equipmentModels').EquipmentModel):THREE.Object3D { return this.equipmentLibrary.create(kind); }
  get characterCount(): number { return this.characters.size; }
  get cachedCharacterCount(): number { return this.idleCharacters.length; }
  get vehicleCount(): number { return [...this.vehicles.values()].reduce((sum, vehicle) => sum + vehicle.count, 0); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const [id, entry] of this.characters) this.removeCharacter(id, entry);
    this.idleCharacters.forEach(entry => this.disposeCharacter(entry));
    this.idleCharacters.length = 0;
    for (const vehicle of this.vehicles.values()) for (const part of vehicle.parts) {
      part.removeFromParent(); part.geometry.dispose(); part.dispose();
    }
    this.vehicleMaterials.forEach(material => material.dispose());
    this.vehicleMaterials.length = 0;
    this.vehicles.clear();
    releaseSourceModels(this.sourceScenes, this.sourceTextures);
    this.sourceTextures.clear();
    this.equipmentLibrary.dispose();
    this.templates.clear();
    this.sourceScenes.length = 0;
    this.ready = false;
  }
}

function releaseSourceModels(roots:THREE.Object3D[], extraTextures:Iterable<THREE.Texture>=[]):void {
  const materials=new Set<THREE.Material>(),geometries=new Set<THREE.BufferGeometry>();
  const textures=new Set(extraTextures),skeletons=new Set<THREE.Skeleton>();
  for(const root of roots)root.traverse(child=> {
    if(!(child instanceof THREE.Mesh))return;
    geometries.add(child.geometry);
    if(child instanceof THREE.SkinnedMesh)skeletons.add(child.skeleton);
    for(const material of Array.isArray(child.material)?child.material:[child.material])materials.add(material);
  });
  for(const material of materials)for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
  skeletons.forEach(s=>s.dispose());geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
}
