import * as THREE from 'three';
import type { VehicleId } from '../sim/types';
import { InstancePool } from './pool';
import { patchInstancedUv } from './materialUv';
import { VEHICLE_PROFILE } from './vehicles';
import { artUrl } from '../app/artBase';

const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const;
const ROW: Record<VehicleId, number> = { coupe: 0, truck: 1, speedster: 2 };
const WORLD_CELL: Record<VehicleId, number> = { coupe: 5.1, truck: 5.55, speedster: 5.0 };
const ATLAS_IMAGE = artUrl('art/city/vehicle-fleet-eight-atlas.png');
const ATLAS_REPORT = artUrl('art/city/vehicle-fleet-eight-atlas.json');

interface FrameBounds { bbox: [number, number, number, number] }
interface AtlasReport {
  cell: number;
  directions: string[];
  vehicles: Record<VehicleId, Record<string, FrameBounds>>;
}

/** Quantize a car's world-space nose into the eight directions seen by the camera. */
export function vehicleScreenDirection(yaw: number, right: THREE.Vector3, up: THREE.Vector3): number {
  const frontX = Math.cos(yaw), frontZ = -Math.sin(yaw);
  const screenX = frontX * right.x + frontZ * right.z;
  const screenY = frontX * up.x + frontZ * up.z;
  return (Math.round(Math.atan2(screenX, screenY) / (Math.PI / 4)) + 8) % 8;
}

function validReport(value: unknown): value is AtlasReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<AtlasReport>;
  if (report.cell !== 224 || !Array.isArray(report.directions) ||
      report.directions.join('|') !== DIRECTIONS.join('|') || !report.vehicles) return false;
  for (const kind of ['coupe', 'truck', 'speedster'] as const) {
    for (const direction of DIRECTIONS) {
      const bbox = report.vehicles[kind]?.[direction]?.bbox;
      if (!Array.isArray(bbox) || bbox.length !== 4 ||
          bbox.some(n => !Number.isInteger(n) || n < 0 || n > 224) ||
          bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) return false;
    }
  }
  return true;
}

/** Billboard center needed to put its lowest painted pixel on the road. */
export function vehicleSpriteRoadPivot(bottomPixel: number, cell: number, size: number, cameraUpY: number): number {
  return .08 + (bottomPixel / cell - .5) * size * cameraUpY;
}

/** One atlas-backed draw batch for the three sprite-sheet vehicle families. */
export class VehicleSpriteLayer {
  readonly sprites: InstancePool;
  readonly shadows: InstancePool;
  ready = false;
  error: string | null = null;
  private report: AtlasReport | null = null;
  private texture: THREE.Texture | null = null;
  private disposed = false;
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private cameraRotation = new THREE.Quaternion();
  private spriteDummy = new THREE.Object3D();
  private shadowDummy = new THREE.Object3D();
  private uv = new THREE.Vector4();

  constructor(scene: THREE.Scene, capacity: number, private onReady: () => void) {
    const spriteMaterial = new THREE.MeshBasicMaterial({
      color: 0xd5d1c9, side: THREE.DoubleSide, alphaTest: .5, depthWrite: true,
    });
    patchInstancedUv(spriteMaterial);
    const plane = new THREE.PlaneGeometry(1, 1);
    this.sprites = new InstancePool(plane, spriteMaterial, capacity, { uv: true, dynamic: true });
    plane.dispose();
    this.sprites.mesh.name = 'vehicle-atlas-sprites';
    this.sprites.mesh.visible = false;
    scene.add(this.sprites.mesh);

    const shadowGeometry = new THREE.CircleGeometry(1, 20);
    shadowGeometry.rotateX(-Math.PI / 2);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x0b1012, transparent: true, opacity: .18,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    });
    this.shadows = new InstancePool(shadowGeometry, shadowMaterial, capacity, { dynamic: true });
    this.shadows.mesh.name = 'vehicle-atlas-shadows';
    this.shadows.mesh.visible = false;
    scene.add(this.shadows.mesh);
  }

  async load(): Promise<void> {
    let texture: THREE.Texture | null = null;
    try {
      const response = await fetch(ATLAS_REPORT);
      if (!response.ok) throw Error(`Vehicle atlas metadata: HTTP ${response.status}`);
      const report: unknown = await response.json();
      if (!validReport(report)) throw Error('Vehicle atlas metadata has an unexpected layout');
      texture = await new THREE.TextureLoader().loadAsync(ATLAS_IMAGE);
      if (this.disposed) { texture.dispose(); return; }
      if (texture.image.width !== report.cell * DIRECTIONS.length || texture.image.height !== report.cell * 3)
        throw Error('Vehicle atlas image and metadata dimensions differ');
      texture.colorSpace = THREE.SRGBColorSpace;
      // These 192–224px painted frames shrink at street zoom. Linear sampling
      // avoids the bright single-pixel chrome/outline aliasing seen with nearest.
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      (this.sprites.mesh.material as THREE.MeshBasicMaterial).map = texture;
      (this.sprites.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
      this.texture = texture;
      this.report = report;
      this.ready = true;
      this.onReady();
    } catch (error) {
      texture?.dispose();
      if (!this.disposed) this.error = String(error);
    }
  }

  setVisible(visible: boolean): void {
    this.sprites.mesh.visible = visible && this.ready;
    this.shadows.mesh.visible = visible && this.ready;
  }

  reset(camera: THREE.Camera): void {
    this.sprites.reset();
    this.shadows.reset();
    this.cameraRotation.copy(camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  }

  push(kind: VehicleId, x: number, z: number, yaw: number): void {
    if (!this.ready || !this.report) return;
    const direction = vehicleScreenDirection(yaw, this.right, this.up);
    const row = ROW[kind];
    const cell = this.report.cell;
    const bounds = this.report.vehicles[kind][DIRECTIONS[direction]].bbox;
    const size = WORLD_CELL[kind];
    // The lowest visible pixel of the camera-facing plane must sit at road
    // height in world space. Dividing by camera up.y only aligns its projection
    // and leaves the wheels physically above the shadow.
    const y = vehicleSpriteRoadPivot(bounds[3], cell, size, this.up.y);
    this.spriteDummy.position.set(x, y, z);
    this.spriteDummy.quaternion.copy(this.cameraRotation);
    this.spriteDummy.scale.set(size, size, 1);
    this.spriteDummy.updateMatrix();
    this.uv.set(1 / 8, 1 / 3, direction / 8, (2 - row) / 3);
    this.sprites.push(this.spriteDummy.matrix, undefined, this.uv);

    const profile = VEHICLE_PROFILE[kind];
    this.shadowDummy.position.set(x, .025, z);
    this.shadowDummy.rotation.set(0, yaw, 0);
    this.shadowDummy.scale.set(profile.length * .42, 1, profile.width * .38);
    this.shadowDummy.updateMatrix();
    this.shadows.push(this.shadowDummy.matrix);
  }

  commit(): void {
    this.sprites.commit();
    this.shadows.commit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sprites.mesh.removeFromParent();
    this.shadows.mesh.removeFromParent();
    this.sprites.dispose();
    this.shadows.dispose();
    this.texture?.dispose();
    this.texture = null;
    this.report = null;
  }
}
