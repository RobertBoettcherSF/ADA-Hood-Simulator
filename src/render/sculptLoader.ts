import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { WebGLRenderer } from 'three';
import { assetUrl } from '../app/assetCache';
import { resolvedGraphics } from '../app/device';

let phone = false;
let ktx2: KTX2Loader | null = null;

/** Call once the city has a WebGL context. Desktop keeps the original GLBs. */
export function bindSculptRenderer(renderer: WebGLRenderer): void {
  phone = resolvedGraphics() === 'phone';
  if (!phone || ktx2) return;
  ktx2 = new KTX2Loader()
    .setTranscoderPath(`${import.meta.env.BASE_URL}basis/`)
    .detectSupport(renderer);
}

export function sculptModelUrl(relative: string): string {
  const folder = phone ? 'art/city/sculpt-phone' : 'art/city/sculpt';
  return assetUrl(`${folder}/${relative}`);
}

export async function sculptLoader(): Promise<GLTFLoader> {
  const loader = new GLTFLoader();
  if (phone && ktx2) {
    await MeshoptDecoder.ready;
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setKTX2Loader(ktx2);
  }
  return loader;
}
