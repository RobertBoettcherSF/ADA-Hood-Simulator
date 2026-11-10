import * as THREE from 'three';
import { sculptLoader, sculptModelUrl } from './sculptLoader';
import { limitTextureSize, textureLimit } from './textureQuality';

export const TREE_KINDS = ['elm', 'oak', 'linden'] as const;
export type TreeKind = typeof TREE_KINDS[number];
export interface TreePlacement { kind: TreeKind; x: number; y: number; z: number; height: number; angle: number }
type TreePart = { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] };

/** Bake source transforms and normalize the entire tree together, preserving
 * its proportions. The lowest trunk vertices define the planting point. */
export function prepareTreeGeometry(root: THREE.Object3D): TreePart[] {
  root.updateMatrixWorld(true);
  const parts: TreePart[] = [];
  root.traverse(child => {
    if (child instanceof THREE.Mesh) parts.push({
      geometry: child.geometry.clone().applyMatrix4(child.matrixWorld), material: child.material,
    });
  });
  const bounds = new THREE.Box3();
  for (const part of parts) { part.geometry.computeBoundingBox(); bounds.union(part.geometry.boundingBox!); }
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height <= 0) {
    parts.forEach(part => part.geometry.dispose());
    throw Error('Invalid tree bounds');
  }
  const base = new THREE.Box3(), point = new THREE.Vector3();
  for (const { geometry } of parts) {
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i);
      if (point.y <= bounds.min.y + height * .025) base.expandByPoint(point);
    }
  }
  const pivot = base.getCenter(new THREE.Vector3());
  for (const { geometry } of parts) {
    geometry.translate(-pivot.x, -bounds.min.y, -pivot.z).scale(1 / height, 1 / height, 1 / height);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  }
  return parts;
}

/** Static trees share geometry/textures and are instanced in spatial batches,
 * allowing the camera and shadow camera to skip distant parts of the city. */
export class SculptTrees {
  readonly group = new THREE.Group();
  ready = false;
  error: string | null = null;
  private disposed = false;
  private templates = new Map<TreeKind, TreePart[]>();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();

  constructor() { this.group.name = 'sculpt-trees'; }

  async load(): Promise<void> {
    const loader = await sculptLoader();
    const results = await Promise.allSettled(TREE_KINDS.map(kind => loader.loadAsync(sculptModelUrl(`trees/${kind}.glb`))));
    // Own fulfilled siblings even after cancellation or a partial load failure.
    for (const result of results) if (result.status === 'fulfilled') result.value.scene.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      this.geometries.add(child.geometry);
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        this.materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) this.textures.add(value);
      }
    });
    if (this.disposed || results.some(r => r.status === 'rejected')) {
      if (!this.disposed) this.error = 'Tree models unavailable; using fallback trees.';
      this.releaseResources(); return;
    }
    try {
      results.forEach((result, i) => {
        if (result.status !== 'fulfilled') return;
        const parts = prepareTreeGeometry(result.value.scene);
        for (const part of parts) this.geometries.add(part.geometry);
        this.templates.set(TREE_KINDS[i], parts);
      });
      const maxTexture = textureLimit();
      for (const texture of this.textures) {
        limitTextureSize(texture, maxTexture);
        texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
      }
      for (const material of this.materials) if (material instanceof THREE.MeshStandardMaterial) {
        material.normalMap = material.bumpMap = material.displacementMap = material.aoMap = null;
        material.roughnessMap = material.metalnessMap = material.emissiveMap = null;
        material.emissive.set(0); material.metalness = 0; material.roughness = 1;
        if (material instanceof THREE.MeshPhysicalMaterial) material.specularIntensity = 0;
        material.needsUpdate = true;
      }
      this.ready = true;
    } catch {
      this.error = 'Invalid tree models; using fallback trees.'; this.releaseResources();
    }
  }

  setPlacements(placements: TreePlacement[]): void {
    this.clearInstances();
    if (!this.ready || this.disposed) return;
    const batches = new Map<string, TreePlacement[]>();
    for (const tree of placements) {
      const key = `${tree.kind}:${Math.floor(tree.x / 108)}:${Math.floor(tree.z / 108)}`;
      const batch = batches.get(key) ?? []; batch.push(tree); batches.set(key, batch);
    }
    const dummy = new THREE.Object3D();
    for (const [key, trees] of batches) for (const part of this.templates.get(trees[0].kind)!) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, trees.length);
      mesh.name = `tree-${key}`; mesh.castShadow = mesh.receiveShadow = true; mesh.raycast = () => {};
      trees.forEach((tree, i) => {
        dummy.position.set(tree.x, tree.y, tree.z); dummy.rotation.set(0, tree.angle, 0);
        dummy.scale.setScalar(tree.height); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  private clearInstances(): void {
    for (const child of this.group.children) (child as THREE.InstancedMesh).dispose();
    this.group.clear();
  }
  private releaseResources(): void {
    this.ready = false; this.templates.clear();
    this.geometries.forEach(g => g.dispose()); this.geometries.clear();
    this.materials.forEach(m => m.dispose()); this.materials.clear();
    this.textures.forEach(t => t.dispose()); this.textures.clear();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.group.removeFromParent(); this.clearInstances(); this.releaseResources();
  }
}
