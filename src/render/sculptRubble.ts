import * as THREE from 'three';
import {sculptLoader,sculptModelUrl} from './sculptLoader';
import {limitTextureSize,textureLimit} from './textureQuality';
import {r01,KERB_H} from './util';

export type RubbleKind='brick'|'stone';
export interface RubblePlacement {kind:RubbleKind;x:number;z:number;size:number;yaw:number}
type Part={geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[]};

export function prepareRubbleGeometry(root:THREE.Object3D):Part[]{
  root.updateMatrixWorld(true);const parts:Part[]=[],bounds=new THREE.Box3();
  root.traverse(o=>{if(o instanceof THREE.Mesh){const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);
    geometry.computeBoundingBox();bounds.union(geometry.boundingBox!);parts.push({geometry,material:o.material});}});
  const size=bounds.getSize(new THREE.Vector3()),span=Math.max(size.x,size.z),center=bounds.getCenter(new THREE.Vector3());
  if(!Number.isFinite(span)||span<=0){parts.forEach(p=>p.geometry.dispose());throw Error('Invalid rubble bounds');}
  for(const {geometry} of parts){geometry.translate(-center.x,-bounds.min.y,-center.z).scale(1/span,1/span,1/span);geometry.computeBoundingBox();geometry.computeBoundingSphere();}
  return parts;
}

/** A few overlapping heaps cover the former footprint, never the pavement. */
export function rubblePiles(id:number,width:number,depth:number){
  const nx=Math.min(3,Math.max(1,Math.round(width/6))),nz=Math.min(3,Math.max(1,Math.round(depth/6)));
  const cellX=Math.max(1,width-1)/nx,cellZ=Math.max(1,depth-1)/nz;
  const maxSize=Math.min(Math.max(1,width-1),Math.max(1,depth-1),Math.min(cellX,cellZ)*1.5);
  const piles=[];
  for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
    const seed=id*17+iz*nx+ix;
    const size=maxSize*(.9+r01(seed,708)*.1);
    // Overlap the irregular skirts into one rubble field. A regular grid of
    // separated round heaps reads as landscaping rather than a ruined shop.
    piles.push({x:nx===1?0:(ix/(nx-1)-.5)*Math.max(0,width-1-maxSize),
      z:nz===1?0:(iz/(nz-1)-.5)*Math.max(0,depth-1-maxSize),size,yaw:Math.floor(r01(seed,709)*4)*Math.PI/2});
  }
  return piles;
}

/** Shared assets, with spatial batches so off-screen ruins do not draw. */
export class SculptRubble {
  readonly group=new THREE.Group();ready=false;error:string|null=null;
  private disposed=false;private signature='';private templates=new Map<RubbleKind,Part[]>();
  private geometries=new Set<THREE.BufferGeometry>();private materials=new Set<THREE.Material>();private textures=new Set<THREE.Texture>();
  constructor(){this.group.name='sculpt-building-rubble';}
  async load():Promise<void>{
    const kinds:RubbleKind[]=['brick','stone'],loader=await sculptLoader();
    const results=await Promise.allSettled(kinds.map(kind=>loader.loadAsync(sculptModelUrl(`rubble/${kind}.glb`))));
    for(const result of results)if(result.status==='fulfilled')result.value.scene.traverse(o=>{if(o instanceof THREE.Mesh){
      this.geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){this.materials.add(m);
        for(const v of Object.values(m))if(v instanceof THREE.Texture)this.textures.add(v);}}});
    if(this.disposed||results.some(r=>r.status==='rejected')){if(!this.disposed)this.error='Rubble models unavailable; using simple debris.';this.release();return;}
    try{
      results.forEach((result,i)=>{if(result.status==='fulfilled'){const parts=prepareRubbleGeometry(result.value.scene);
        parts.forEach(p=>{this.geometries.add(p.geometry);
          for(const material of Array.isArray(p.material)?p.material:[p.material])if(material instanceof THREE.MeshStandardMaterial)
            material.color.setHex(kinds[i]==='brick'?0xb98673:0xb5aba2);});this.templates.set(kinds[i],parts);}});
      const maxTexture=textureLimit();
      for(const t of this.textures){limitTextureSize(t,maxTexture);t.generateMipmaps=false;t.minFilter=t.magFilter=THREE.LinearFilter;t.needsUpdate=true;}
      for(const m of this.materials)if(m instanceof THREE.MeshStandardMaterial){
        m.normalMap=m.bumpMap=m.displacementMap=m.aoMap=m.roughnessMap=m.metalnessMap=m.emissiveMap=null;
        m.emissive.set(0);m.roughness=1;m.metalness=0;if(m instanceof THREE.MeshPhysicalMaterial)m.specularIntensity=0;m.needsUpdate=true;}
      this.ready=true;
    }catch{this.error='Invalid rubble model; using simple debris.';this.release();}
  }
  setPlacements(placements:RubblePlacement[]):void{
    if(!this.ready||this.disposed)return;const signature=JSON.stringify(placements);if(signature===this.signature)return;
    this.signature=signature;this.clearInstances();const batches=new Map<string,RubblePlacement[]>();
    for(const p of placements){const key=`${p.kind}:${Math.floor(p.x/108)}:${Math.floor(p.z/108)}`;
      const batch=batches.get(key)??[];batch.push(p);batches.set(key,batch);}
    const dummy=new THREE.Object3D();
    for(const [key,ps] of batches)for(const part of this.templates.get(ps[0].kind)!){
      const mesh=new THREE.InstancedMesh(part.geometry,part.material,ps.length);mesh.name=`rubble-${key}`;
      mesh.castShadow=mesh.receiveShadow=true;mesh.raycast=()=>{};
      ps.forEach((p,i)=>{dummy.position.set(p.x,KERB_H+.01,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.setScalar(p.size);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();this.group.add(mesh);
    }
  }
  private clearInstances(){this.group.children.forEach(o=>(o as THREE.InstancedMesh).dispose());this.group.clear();}
  private release(){this.ready=false;this.templates.clear();this.geometries.forEach(g=>g.dispose());this.geometries.clear();
    this.materials.forEach(m=>m.dispose());this.materials.clear();this.textures.forEach(t=>t.dispose());this.textures.clear();}
  dispose(){if(this.disposed)return;this.disposed=true;this.clearInstances();this.release();this.group.removeFromParent();}
}
