import type { Person } from '../sim/types';
import { assetUrl, enqueueAssetLoad } from '../app/assetCache';
import { resolvedGraphics } from '../app/device';
import { noteAssetLoad } from '../app/assetTiming';
import thickenedIcons from '../../public/art/icons-small/index.json';

/**
 * Where the delivered artwork lives and how the interface names it. Every
 * image the game loads goes through here, so a missing file has one place to
 * fall back from and the manifest in public/art stays the single inventory.
 */

export const ART_ROOT = `${import.meta.env.BASE_URL}art`;

export function art(path: string): string {
  return assetUrl(`art/${path}`);
}

const THICKENED = new Set<string>(thickenedIcons);
/** At or below this size a thin glyph uses its thickened small variant. */
export const SMALL_ICON_PX = 20;

/** One of the engraved glyphs in public/art/icons, by "group/name". Thin glyphs
 * have a thickened variant for small sizes. */
export function iconUrl(name: string, size = Infinity): string {
  return size <= SMALL_ICON_PX && THICKENED.has(name) ? art(`icons-small/${name}.png`) : art(`icons/${name}.png`);
}

const MALE_PORTRAITS = 64;
const FEMALE_PORTRAITS = 32;

/** The painted sitter for a person: the portrait number picks from the fixed pool. */
export function portraitUrl(person: Pick<Person, 'portrait' | 'female'>): string {
  const n = Math.abs(person.portrait | 0);
  if (person.female) return art(`portraits/f/f-${String(1 + (n % FEMALE_PORTRAITS)).padStart(2, '0')}.png`);
  return art(`portraits/m/m-${String(1 + (n % MALE_PORTRAITS)).padStart(2, '0')}.png`);
}

/** A gang boss's painted heritage portrait (P3b), when the person has one. */
export function bossPortraitUrl(face: string | undefined): string | undefined {
  return face ? art(`portraits/nationality/${face}.png`) : undefined;
}

/** Mastheads in the same order as NEWSPAPER_NAMES. */
export const MASTHEADS = ['press/masthead-herald.png', 'press/masthead-post.png', 'press/masthead-tribune.png', 'press/masthead-times.png'].map(art);

/** One photograph per kind of event. A story with no kind gets no picture. */
export const PRESS_PHOTOS = {
  fire: 'press/photo-fire.jpg',
  wreck: 'press/photo-shopfront-wrecked.jpg',
  raid: 'press/photo-raid.jpg',
  funeral: 'press/photo-funeral.jpg',
  courthouse: 'press/photo-courthouse-steps.jpg',
  rally: 'press/photo-rally.jpg',
  charity: 'press/photo-soup-kitchen.jpg',
  bank: 'press/photo-bank.jpg',
  docks: 'press/photo-docks.jpg',
  calm: 'press/photo-docks.jpg',
} as const;

export type PressPhoto = keyof typeof PRESS_PHOTOS;

export function pressPhoto(photo: string | undefined): string | null {
  if (!photo || !(photo in PRESS_PHOTOS)) return null;
  return art(PRESS_PHOTOS[photo as PressPhoto]);
}

export function crestUrl(color: string): string {
  return art(`crests/${color}.png`);
}

/** The painted elevation on a site's papers. */
export function thumbUrl(cls: string, state: string): string {
  const key = state === 'destroyed' ? 'destroyed' : cls;
  return art(`city/thumbs/${key}.png`);
}

const cache = new Map<string, Promise<HTMLImageElement>>();
const imageBytes = new Map<string, number>();
const imageOrder: string[] = [];
let imageUsed = 0;
/** Decoded pictures kept on a phone. Oldest are dropped first. */
const PHONE_IMAGE_CAP = 24 * 1024 * 1024;

function keepImage(src: string, img: HTMLImageElement): void {
  if (resolvedGraphics() !== 'phone' || imageBytes.has(src)) return;
  const bytes = Math.max(48_000, Math.max(1, img.naturalWidth) * Math.max(1, img.naturalHeight) * 4);
  imageBytes.set(src, bytes);
  imageOrder.push(src);
  imageUsed += bytes;
  while (imageUsed > PHONE_IMAGE_CAP && imageOrder.length > 1) {
    const oldest = imageOrder.shift();
    if (!oldest) break;
    imageUsed -= imageBytes.get(oldest) ?? 0;
    imageBytes.delete(oldest);
    cache.delete(oldest);
  }
}

/** Load an image once and share it; rejects if the file is not there. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = cache.get(src);
  if (!p) {
    p = enqueueAssetLoad(() => new Promise((resolve, reject) => {
      const img = new Image();
      const started = performance.now();
      img.onload = () => {
        noteAssetLoad(src, performance.now() - started, true);
        keepImage(src, img);
        resolve(img);
      };
      img.onerror = () => { noteAssetLoad(src, performance.now() - started, false); cache.delete(src); reject(new Error(`missing ${src}`)); };
      img.src = src;
    }));
    cache.set(src, p);
  }
  return p;
}
