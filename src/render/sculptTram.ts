import * as THREE from 'three';
import { sculptLoader, sculptModelUrl } from './sculptLoader';
import { limitTextureSize, textureLimit } from './textureQuality';

/** The Sculpt street tram (the original's vehicle model 7); see docs/audit/2026-10-29/trams/sculpt. */
export const TRAM_MODEL_URL = sculptModelUrl('tram.glb');
/** Overall size the model is drawn at: rails to roof, body width, coupler to coupler (metres). */
export const TRAM_MODEL_SIZE = { length: 11, width: 2.4, height: 3.2 };

export interface TramModel {
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** Everything the model owns, for disposal. */
  release(): void;
}

/** The livery's painted panels are the texture's strongly red texels; they take each line's colour. */
const LIVERY_MASK = 'smoothstep(.45, .65, (diffuseColor.r - max(diffuseColor.g, diffuseColor.b)) / max(diffuseColor.r, .002)) * step(.02, diffuseColor.r)';

/**
 * Bake the GLB's node transforms and normalise the whole car together: its long
 * horizontal axis along +Z (the tram's direction of travel in `StreetTrams`),
 * centred, wheels at y = 0, and scaled per axis to `TRAM_MODEL_SIZE`, as the
 * Sculpt cars are scaled to their profiles. The car is double-ended, so which
 * end leads does not matter.
 */
export function prepareTramModel(root: THREE.Object3D): TramModel {
  root.updateMatrixWorld(true);
  const sources: THREE.Mesh[] = [];
  root.traverse(child => { if (child instanceof THREE.Mesh) sources.push(child); });
  if (!sources.length) throw Error('Tram model has no mesh');
  const geometries = sources.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
  const bounds = new THREE.Box3();
  const measure = () => { bounds.makeEmpty(); for (const g of geometries) { g.computeBoundingBox(); bounds.union(g.boundingBox!); } };
  measure();
  if (bounds.max.x - bounds.min.x > bounds.max.z - bounds.min.z) geometries.forEach(g => g.rotateY(Math.PI / 2));
  measure();
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  if (![size.x, size.y, size.z].every(v => Number.isFinite(v) && v > 0)) {
    geometries.forEach(g => g.dispose());
    throw Error('Tram model has invalid bounds');
  }
  const { length, width, height } = TRAM_MODEL_SIZE;
  for (const g of geometries) {
    g.translate(-center.x, -bounds.min.y, -center.z).scale(width / size.x, height / size.y, length / size.z);
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  }
  const textures = new Set<THREE.Texture>(), materials: THREE.Material[] = [], maxTexture = textureLimit();
  const parts = sources.map((mesh, i) => {
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const material = liveryMaterial(source, textures, maxTexture);
    materials.push(material);
    return { geometry: geometries[i], material };
  });
  // The loader's own materials and geometry are not drawn; their textures are shared with the clones.
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    for (const m of Array.isArray(child.material) ? child.material : [child.material]) m.dispose();
  });
  return {
    parts,
    release() {
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    },
  };
}

/** A matte copy of the Sculpt material whose red livery panels are recoloured by the instance colour. */
function liveryMaterial(source: THREE.Material, textures: Set<THREE.Texture>, maxTexture: number | null): THREE.Material {
  const material = new THREE.MeshStandardMaterial({ roughness: .78, metalness: .05 });
  if (source instanceof THREE.MeshStandardMaterial) {
    material.color.copy(source.color);
    material.map = source.map;
    material.side = source.side; // the open platforms and windows show the inside
  }
  const map = material.map;
  if (map) {
    textures.add(map);
    limitTextureSize(map, maxTexture);
    map.generateMipmaps = false; map.minFilter = THREE.LinearFilter; map.magFilter = THREE.LinearFilter;
    map.needsUpdate = true;
  }
  const reference = liveryLuminance(map);
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
#if defined( USE_COLOR )
  {
    float livery = ${LIVERY_MASK};
    float shade = clamp(dot(diffuseColor.rgb, vec3(.2126, .7152, .0722)) / ${reference.toFixed(5)}, .35, 1.8);
    diffuseColor.rgb = mix(diffuseColor.rgb, vColor * shade, livery);
  }
#endif`);
  };
  material.customProgramCacheKey = () => `street-tram-livery-${reference.toFixed(5)}`;
  return material;
}

/** Mean linear luminance of the texture's livery texels: the recoloured panels keep the texture's
 * light and shade around the line's own colour, which is their average. */
function liveryLuminance(map: THREE.Texture | null): number {
  const fallback = new THREE.Color('#9b5143');
  const fallbackLum = .2126 * fallback.r + .7152 * fallback.g + .0722 * fallback.b;
  const image = map?.image as CanvasImageSource & { width?: number; height?: number } | undefined;
  if (!image?.width || !image.height || typeof document === 'undefined') return fallbackLum;
  try {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return fallbackLum;
    context.drawImage(image, 0, 0, 64, 64);
    const data = context.getImageData(0, 0, 64, 64).data, c = new THREE.Color();
    let sum = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      c.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, THREE.SRGBColorSpace);
      if (c.r < .02 || (c.r - Math.max(c.g, c.b)) / c.r < .6) continue;
      sum += .2126 * c.r + .7152 * c.g + .0722 * c.b; n++;
    }
    return n > 8 ? sum / n : fallbackLum;
  } catch { return fallbackLum; }
}

/** Load and normalise the tram, or null when it cannot be had (the procedural car stays). */
export async function loadTramModel(): Promise<TramModel | null> {
  try {
    const gltf = await (await sculptLoader()).loadAsync(sculptModelUrl('tram.glb'));
    return prepareTramModel(gltf.scene);
  } catch { return null; }
}
