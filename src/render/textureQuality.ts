import * as THREE from 'three';
import { patchLocalData, readLocalData } from '../app/localData';
import { resolvedGraphics } from '../app/device';

/**
 * Model texture quality (A20, minimum-spec GPUs). "High" keeps the approved
 * 2048² Sculpt textures; "Standard" draws each one at 1024² when it loads, a
 * quarter of the GPU memory for slower graphics cards. Read when a city loads.
 */
export type TextureQuality = 'high' | 'standard';

export const STANDARD_TEXTURE_SIZE = 1024;

export function readTextureQuality(): TextureQuality {
  return readLocalData().textureQuality;
}

export function writeTextureQuality(quality: TextureQuality): void {
  patchLocalData({ textureQuality: quality === 'standard' ? 'standard' : 'high' });
}

/** The largest side a model texture keeps at this quality, or null for no limit. */
export function textureLimit(quality: TextureQuality = readTextureQuality()): number | null {
  if (resolvedGraphics() === 'phone') return STANDARD_TEXTURE_SIZE;
  return quality === 'standard' ? STANDARD_TEXTURE_SIZE : null;
}

/** Redraw a texture's image no larger than `max` on its longer side. */
export function limitTextureSize(texture: THREE.Texture, max: number | null): boolean {
  const image = texture.image as { width?: number; height?: number } | null;
  if (max == null || !image?.width || !image.height || typeof document === 'undefined') return false;
  const scale = max / Math.max(image.width, image.height);
  if (scale >= 1) return false;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  (image as { close?: () => void }).close?.();
  texture.image = canvas;
  texture.needsUpdate = true;
  return true;
}

