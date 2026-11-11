/**
 * 1930–32 black police coachwork, drawn with the other period cars.
 * A phone uses fewer wheel segments. No texture file, so nothing is copied
 * into the city folder.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const BLACK = 0x141416;
const GLASS = 0x3e515a;
const CHROME = 0xb7b4aa;
const WHITE = 0xf4f1e6;
const RED = 0x9c1c16;
const SPOKE = 0x8e2a22;

interface Part { geometry: THREE.BufferGeometry; color: number }

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, radius = 0.02): Part {
  const geometry = new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 3, h / 3, d / 3));
  geometry.translate(x, y, z);
  return { geometry, color };
}

function cylinder(radius: number, height: number, x: number, y: number, z: number, color: number, segments: number): Part {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, segments);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(x, y, z);
  return { geometry, color };
}

function wheels(axles: [number, number], halfWidth: number, radius: number, fine: boolean, redSpokes: boolean): Part[] {
  const parts: Part[] = [];
  const segments = fine ? 16 : 8;
  const hub = redSpokes ? SPOKE : 0x2a2c2e;
  for (const x of axles) for (const side of [-1, 1]) {
    const z = side * halfWidth;
    parts.push(cylinder(radius, 0.16, x, radius, z, BLACK, segments));
    parts.push(cylinder(radius * 0.55, 0.18, x, radius, z, hub, fine ? 12 : 6));
    parts.push(cylinder(radius * 0.18, 0.2, x, radius, z, CHROME, fine ? 10 : 6));
  }
  return parts;
}

/** Five-by-seven bits, only the letters these two vehicles wear. */
const GLYPHS: Record<string, string[]> = {
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function letters(text: string, x: number, y: number, z: number, size: number, axis: 'hood' | 'side'): Part[] {
  const parts: Part[] = [];
  const cols = 5;
  const gap = size * 0.35;
  const width = text.length * (cols * size + gap);
  text.split('').forEach((ch, index) => {
    const rows = GLYPHS[ch] ?? GLYPHS[' '];
    rows.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit !== '1') return;
        const along = -width / 2 + index * (cols * size + gap) + rx * size;
        const up = (3 - ry) * size;
        if (axis === 'hood') parts.push(box(size * 0.82, size * 0.7, size * 0.82, x + along, y, z + up, WHITE, 0.004));
        else parts.push(box(size * 0.82, size * 0.7, size * 0.55, x + up, y + along, z, WHITE, 0.004));
      });
    });
  });
  return parts;
}

function star(x: number, y: number, z: number, scale: number): Part[] {
  const parts = [box(scale, scale * 0.22, scale * 0.12, x, y, z, WHITE, 0.004)];
  parts.push(box(scale * 0.22, scale, scale * 0.12, x, y, z, WHITE, 0.004));
  const slash = new THREE.BoxGeometry(scale * 0.18, scale, scale * 0.1);
  slash.rotateZ(Math.PI / 4);
  slash.translate(x, y, z);
  parts.push({ geometry: slash, color: WHITE });
  const back = slash.clone();
  back.rotateZ(-Math.PI / 2);
  parts.push({ geometry: back, color: WHITE });
  return parts;
}

function merge(parts: Part[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const tint: number[] = [];
  for (const part of parts) {
    const geo = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    const pos = geo.getAttribute('position');
    const normal = geo.getAttribute('normal');
    const color = new THREE.Color(part.color);
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      colors.push(color.r, color.g, color.b);
      tint.push(0);
    }
    if (geo !== part.geometry) geo.dispose();
    part.geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** All-black Model A style sedan. POLICE on the hood, a star and POLICE DEPT on the door, a red roof lamp. */
export function policeSedanGeometry(fine: boolean, redSpokes = false): THREE.BufferGeometry {
  const parts: Part[] = [];
  parts.push(...wheels([-1.42, 1.47], 0.84, 0.35, fine, redSpokes));
  parts.push(box(4.15, 0.16, 1.5, 0, 0.42, 0, BLACK, 0.04));
  parts.push(box(1.7, 0.42, 1.28, 1.15, 0.78, 0, BLACK, 0.05));
  parts.push(box(1.9, 0.62, 1.36, -0.55, 1.22, 0, BLACK, 0.04));
  parts.push(box(2.05, 0.1, 1.46, -0.55, 1.56, 0, BLACK, 0.03));
  parts.push(box(0.04, 0.4, 1.15, 0.38, 1.25, 0, GLASS, 0.008));
  parts.push(box(0.04, 0.36, 1.05, -1.5, 1.22, 0, GLASS, 0.008));
  for (const side of [-1, 1]) {
    parts.push(box(0.7, 0.38, 0.03, -0.55, 1.22, side * 0.69, GLASS, 0.006));
    parts.push(...letters('POLICE DEPT', -0.15, 0.95, side * 0.78, 0.012, 'side'));
    parts.push(...star(-1.15, 0.95, side * 0.78, 0.16));
  }
  parts.push(...letters('POLICE', 1.15, 0.86, 0, 0.02, 'hood'));
  parts.push(cylinder(0.07, 0.16, -0.55, 1.72, 0, RED, fine ? 10 : 6));
  parts.push(box(0.12, 0.06, 0.22, -0.55, 1.66, 0, BLACK, 0.01));
  return merge(parts);
}

/** Box-bodied patrol wagon. POLICE PATROL on the side, bars on the rear glass. */
export function paddyWagonGeometry(fine: boolean): THREE.BufferGeometry {
  const parts: Part[] = [];
  parts.push(...wheels([-1.7, 1.55], 0.9, 0.38, fine, false));
  parts.push(box(4.6, 0.18, 1.7, -0.1, 0.46, 0, BLACK, 0.04));
  parts.push(box(1.35, 0.7, 1.45, 1.35, 1.05, 0, BLACK, 0.04));
  parts.push(box(2.9, 1.35, 1.7, -0.85, 1.35, 0, BLACK, 0.05));
  parts.push(box(0.04, 0.42, 1.1, 0.72, 1.35, 0, GLASS, 0.008));
  for (const side of [-1, 1]) {
    parts.push(...letters('POLICE PATROL', -0.7, 1.15, side * 0.9, 0.014, 'side'));
    for (let i = 0; i < 4; i++) parts.push(box(0.03, 0.55, 0.02, -1.7, 1.2, side * (0.72 - i * 0.08), BLACK, 0.004));
  }
  parts.push(box(0.04, 0.7, 1.15, -2.28, 1.25, 0, GLASS, 0.008));
  for (let i = 0; i < 5; i++) parts.push(box(0.03, 0.7, 0.03, -2.32, 1.25, -0.4 + i * 0.2, BLACK, 0.004));
  parts.push(cylinder(0.06, 0.14, 0.4, 1.55, 0, RED, fine ? 8 : 6));
  return merge(parts);
}

export type TrafficLivery = 'civilian' | 'police' | 'police-hero' | 'paddy' | 'truck';

/** Which body a traffic car wears. Derived from where it is, not from the saved city. */
export function trafficLivery(x: number, y: number, truck: boolean): TrafficLivery {
  if (truck) return 'truck';
  const n = Math.abs(Math.round(x * 3 + y * 7));
  if (n % 9 !== 0) return 'civilian';
  if (n % 45 === 0) return 'paddy';
  if (n % 23 === 0) return 'police-hero';
  return 'police';
}
