/**
 * Every texture in Saint Volstead is painted here, into 2D canvases, at start
 * up, so the city can draw before a single file has arrived. Textures are
 * shared: a small fixed set of facades, one roof, one storefront strip, one
 * sign atlas and a handful of ground surfaces serve the whole city, with
 * per-instance UV transforms giving each building its own patch of them.
 *
 * The delivered artwork in public/art/city then replaces the paintings as it
 * loads (see `loadCityArt`): the same tiles, the same 4-bay by 4-storey grid,
 * only photographed rather than drawn.
 */

import * as THREE from 'three';
import { noteAssetLoad } from '../app/assetTiming';
import { assetUrl, enqueueAssetLoad } from '../app/assetCache';
import { BUILDING_TYPES } from '../sim/data/buildings';
import { TILE_BAYS, TILE_STOREYS, mulberry32 } from './util';

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return { canvas, ctx };
}

function texture(canvas: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  } else {
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
  }
  return t;
}

// ------------------------------------------------------------------ facades

export interface FacadePalette {
  name: string;
  kind: 'brick' | 'stone' | 'stucco';
  wall: string;
  wallDark: string;
  joint: string;
  trim: string;
  sill: string;
  reveal: string;
}

/** Shared city walls plus a dedicated pointed-window church facade. */
export const FACADE_PALETTES: FacadePalette[] = [
  {
    name: 'redBrick',
    kind: 'brick',
    wall: '#8e4c39',
    wallDark: '#6b3527',
    joint: '#b9a68e',
    trim: '#d9ccb2',
    sill: '#cbbda0',
    reveal: '#3a2a24',
  },
  {
    name: 'brownBrick',
    kind: 'brick',
    wall: '#6f5240',
    wallDark: '#513a2c',
    joint: '#a2907a',
    trim: '#c4b79c',
    sill: '#b6a88c',
    reveal: '#31251f',
  },
  {
    name: 'buffBrick',
    kind: 'brick',
    wall: '#b2924f',
    wallDark: '#8e7139',
    joint: '#d6c8a4',
    trim: '#e5dabb',
    sill: '#d2c5a2',
    reveal: '#3c3223',
  },
  {
    name: 'limestone',
    kind: 'stone',
    wall: '#cdc4ab',
    wallDark: '#aca386',
    joint: '#9b917a',
    trim: '#e6dfc9',
    sill: '#dbd3ba',
    reveal: '#4a4536',
  },
  {
    name: 'stucco',
    kind: 'stucco',
    wall: '#a89a83',
    wallDark: '#8a7c66',
    joint: '#988a74',
    trim: '#cfc4ac',
    sill: '#c0b59c',
    reveal: '#3a332a',
  },
  {
    name: 'church',
    kind: 'stone',
    wall: '#b5a180',
    wallDark: '#89755c',
    joint: '#827057',
    trim: '#ccb999',
    sill: '#bba98a',
    reveal: '#3b3428',
  },
];

const FACADE_TILE = 512;

function paintBrick(ctx: CanvasRenderingContext2D, pal: FacadePalette, rng: () => number, w: number, h: number) {
  ctx.fillStyle = pal.joint;
  ctx.fillRect(0, 0, w, h);
  const course = 6.4; // ~0.21 m per course at this scale
  const brick = 22;
  for (let y = 0, row = 0; y < h; y += course, row++) {
    const off = (row % 2) * (brick / 2);
    for (let x = -brick; x < w + brick; x += brick) {
      const shade = 0.86 + rng() * 0.3;
      ctx.fillStyle = mixHex(pal.wallDark, pal.wall, Math.min(1, shade - 0.3));
      ctx.globalAlpha = 1;
      ctx.fillRect(x + off + 0.7, y + 0.7, brick - 1.4, course - 1.4);
    }
  }
  // Soot and weathering.
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 90; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 20 + rng() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, i % 3 === 0 ? '#000000' : '#ffffff');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

function paintStone(ctx: CanvasRenderingContext2D, pal: FacadePalette, rng: () => number, w: number, h: number) {
  ctx.fillStyle = pal.wall;
  ctx.fillRect(0, 0, w, h);
  const course = 26;
  const block = 74;
  for (let y = 0, row = 0; y < h; y += course, row++) {
    const off = (row % 2) * (block / 2);
    for (let x = -block; x < w + block; x += block) {
      ctx.fillStyle = mixHex(pal.wallDark, pal.wall, 0.35 + rng() * 0.65);
      ctx.fillRect(x + off + 1, y + 1, block - 2, course - 2);
    }
    ctx.strokeStyle = pal.joint;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 0.09;
  for (let i = 0; i < 60; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 30 + rng() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, i % 2 === 0 ? '#000000' : '#ffffff');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

function paintStucco(ctx: CanvasRenderingContext2D, pal: FacadePalette, rng: () => number, w: number, h: number) {
  ctx.fillStyle = pal.wall;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.055;
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rng() > 0.5 ? '#ffffff' : '#000000';
    const s = 1 + rng() * 3;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
  ctx.globalAlpha = 0.13;
  for (let i = 0; i < 26; i++) {
    const x = rng() * w;
    ctx.fillStyle = '#2b241c';
    ctx.fillRect(x, 0, 2 + rng() * 6, h);
  }
  ctx.globalAlpha = 1;
}

/** Mix two #rrggbb colours; t=0 gives a, t=1 gives b. */
function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

interface WindowCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Paints one facade tile plus the matching emissive tile (lit windows only),
 * so a building can glow from the inside as the working day runs out.
 */
function makeFacade(pal: FacadePalette, seed: number): { map: THREE.Texture; lights: THREE.Texture } {
  const S = FACADE_TILE;
  const { canvas, ctx } = makeCanvas(S, S);
  const lit = makeCanvas(S, S);
  const rng = mulberry32(seed);

  if (pal.kind === 'brick') paintBrick(ctx, pal, rng, S, S);
  else if (pal.kind === 'stone') paintStone(ctx, pal, rng, S, S);
  else paintStucco(ctx, pal, rng, S, S);

  lit.ctx.fillStyle = '#000000';
  lit.ctx.fillRect(0, 0, S, S);

  const cellW = S / TILE_BAYS;
  const cellH = S / TILE_STOREYS;
  const arched = pal.kind === 'stone' && rng() > 0.55;

  // Storey string courses give the wall some horizontal rhythm.
  for (let r = 1; r < TILE_STOREYS; r++) {
    ctx.fillStyle = pal.trim;
    ctx.globalAlpha = 0.28;
    ctx.fillRect(0, r * cellH - 3, S, 3);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, r * cellH, S, 2);
    ctx.globalAlpha = 1;
  }

  for (let r = 0; r < TILE_STOREYS; r++) {
    for (let c = 0; c < TILE_BAYS; c++) {
      const cx = c * cellW;
      const cy = r * cellH;
      const ww = cellW * 0.46;
      const wh = cellH * 0.5;
      const wx = cx + (cellW - ww) / 2;
      const wy = cy + cellH * 0.24;
      const cell: WindowCell = { x: wx, y: wy, w: ww, h: wh };
      drawWindow(ctx, cell, pal, arched, rng);
      if (rng() < 0.46) drawWindowLight(lit.ctx, cell, arched, rng);
    }
  }

  const map = texture(canvas);
  const lights = texture(lit.canvas);
  return { map, lights };
}

/** Taller lancet windows give the church a single nave rhythm, not office floors. */
function makeChurchFacade(pal: FacadePalette): { map: THREE.Texture; lights: THREE.Texture } {
  const S = FACADE_TILE;
  const { canvas, ctx } = makeCanvas(S, S);
  const lit = makeCanvas(S, S);
  paintStone(ctx, pal, mulberry32(5703), S, S);
  lit.ctx.fillStyle = '#000000';
  lit.ctx.fillRect(0, 0, S, S);

  const lancet = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x, y + w * .55);
    g.quadraticCurveTo(x + w * .04, y + w * .18, x + w / 2, y);
    g.quadraticCurveTo(x + w * .96, y + w * .18, x + w, y + w * .55);
    g.lineTo(x + w, y + h);
    g.closePath();
  };
  for (const row of [0, 1]) for (let bay = 0; bay < TILE_BAYS; bay += 2) {
    const x = bay * 128 + 37, y = row * 256 + 55, w = 54, h = 155;
    ctx.fillStyle = pal.trim;
    lancet(ctx, x - 8, y - 8, w + 16, h + 17);
    ctx.fill();
    ctx.fillStyle = pal.reveal;
    lancet(ctx, x - 3, y - 3, w + 6, h + 6);
    ctx.fill();
    const glass = ctx.createLinearGradient(x, y, x + w, y + h);
    glass.addColorStop(0, '#786545');
    glass.addColorStop(.42, '#342f28');
    glass.addColorStop(1, '#171d20');
    ctx.fillStyle = glass;
    lancet(ctx, x, y, w, h);
    ctx.fill();
    ctx.save();
    lancet(ctx, x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = '#a58c5f';
    ctx.lineWidth = 2.4;
    for (const fraction of [1 / 3, 2 / 3]) {
      ctx.beginPath(); ctx.moveTo(x + w * fraction, y); ctx.lineTo(x + w * fraction, y + h); ctx.stroke();
    }
    for (let yy = y + 58; yy < y + h; yy += 38) {
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = pal.sill;
    ctx.fillRect(x - 10, y + h + 2, w + 20, 6);
    lit.ctx.fillStyle = '#a47b4e';
    lancet(lit.ctx, x + 2, y + 2, w - 4, h - 4);
    lit.ctx.fill();
  }
  return { map: texture(canvas), lights: texture(lit.canvas) };
}

function windowPath(ctx: CanvasRenderingContext2D, c: WindowCell, arched: boolean) {
  ctx.beginPath();
  if (arched) {
    const r = c.w / 2;
    ctx.moveTo(c.x, c.y + c.h);
    ctx.lineTo(c.x, c.y + r);
    ctx.arc(c.x + r, c.y + r, r, Math.PI, 0);
    ctx.lineTo(c.x + c.w, c.y + c.h);
    ctx.closePath();
  } else {
    ctx.rect(c.x, c.y, c.w, c.h);
  }
}

function drawWindow(ctx: CanvasRenderingContext2D, c: WindowCell, pal: FacadePalette, arched: boolean, rng: () => number) {
  // Lintel / surround.
  ctx.fillStyle = pal.trim;
  ctx.globalAlpha = 0.75;
  ctx.fillRect(c.x - 5, c.y - 7, c.w + 10, 7);
  ctx.globalAlpha = 1;

  // Recess shadow.
  ctx.fillStyle = pal.reveal;
  ctx.globalAlpha = 0.85;
  windowPath(ctx, { x: c.x - 2, y: c.y - 2, w: c.w + 4, h: c.h + 3 }, arched);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Glass with a raking reflection.
  const g = ctx.createLinearGradient(c.x, c.y, c.x + c.w, c.y + c.h);
  g.addColorStop(0, '#2f3a46');
  g.addColorStop(0.45, '#1b2129');
  g.addColorStop(0.46, '#39434f');
  g.addColorStop(1, '#141a20');
  ctx.fillStyle = g;
  windowPath(ctx, c, arched);
  ctx.fill();

  // Sashes.
  ctx.strokeStyle = 'rgba(226,219,200,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c.x + c.w / 2, c.y + (arched ? c.w / 2 : 0));
  ctx.lineTo(c.x + c.w / 2, c.y + c.h);
  ctx.moveTo(c.x, c.y + c.h * 0.46);
  ctx.lineTo(c.x + c.w, c.y + c.h * 0.46);
  ctx.stroke();

  // Sill.
  ctx.fillStyle = pal.sill;
  ctx.fillRect(c.x - 6, c.y + c.h, c.w + 12, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(c.x - 6, c.y + c.h + 6, c.w + 12, 3);

  // A blind pulled part way down, now and then.
  if (rng() < 0.3) {
    ctx.fillStyle = 'rgba(214,199,168,0.72)';
    ctx.fillRect(c.x + 1, c.y + 1, c.w - 2, c.h * (0.2 + rng() * 0.35));
  }
}

function drawWindowLight(ctx: CanvasRenderingContext2D, c: WindowCell, arched: boolean, rng: () => number) {
  const warm = rng();
  const col = warm > 0.75 ? '#ffe6a8' : warm > 0.35 ? '#ffcf80' : '#f3b562';
  ctx.fillStyle = col;
  windowPath(ctx, c, arched);
  ctx.fill();
  // Sash bars stay dark so the pane still reads as a window.
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(c.x + c.w / 2, c.y);
  ctx.lineTo(c.x + c.w / 2, c.y + c.h);
  ctx.moveTo(c.x, c.y + c.h * 0.46);
  ctx.lineTo(c.x + c.w, c.y + c.h * 0.46);
  ctx.stroke();
  if (rng() < 0.35) {
    ctx.fillStyle = 'rgba(20,14,8,0.8)';
    ctx.fillRect(c.x + 1, c.y + 1, c.w - 2, c.h * (0.25 + rng() * 0.3));
  }
}

// ------------------------------------------------------------------ roofs

function makeRoof(): THREE.Texture {
  const S = 256;
  const { canvas, ctx } = makeCanvas(S, S);
  const rng = mulberry32(9001);
  ctx.fillStyle = '#4d4b46';
  ctx.fillRect(0, 0, S, S);
  // Rolled asphalt seams.
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  for (let y = 0; y < S; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(S, y + 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 4200; i++) {
    ctx.fillStyle = rng() > 0.5 ? '#5f5d56' : '#37352f';
    ctx.fillRect(rng() * S, rng() * S, 2, 2);
  }
  // Patched repairs, where the roofer has been.
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = rng() > 0.5 ? '#26251f' : '#6a675e';
    ctx.fillRect(rng() * S, rng() * S, 24 + rng() * 60, 18 + rng() * 44);
  }
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 18; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const r = 20 + rng() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rng() > 0.5 ? '#7d786e' : '#191817');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  return texture(canvas);
}

// ------------------------------------------------------------------ storefronts

/** The ground floor strip: pilasters, plate glass, a recessed door. */
function makeStorefront(): { map: THREE.Texture; lights: THREE.Texture } {
  const W = 512;
  const H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  const lit = makeCanvas(W, H);
  const rng = mulberry32(4242);

  ctx.fillStyle = '#8b7f6c';
  ctx.fillRect(0, 0, W, H);
  // Stone plinth.
  ctx.fillStyle = '#a09383';
  ctx.fillRect(0, H - 44, W, 44);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, H - 46, W, 3);

  lit.ctx.fillStyle = '#000000';
  lit.ctx.fillRect(0, 0, W, H);

  const bays = 2;
  const bw = W / bays;
  for (let i = 0; i < bays; i++) {
    const x = i * bw;
    // Pilasters framing the shopfront.
    ctx.fillStyle = '#9c8f7b';
    ctx.fillRect(x, 0, 22, H - 40);
    ctx.fillRect(x + bw - 22, 0, 22, H - 40);
    ctx.fillStyle = 'rgba(255,245,220,0.3)';
    ctx.fillRect(x + 4, 0, 4, H - 40);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x + 17, 0, 5, H - 40);

    const gx = x + 28;
    const gw = bw - 56;
    const gy = 26;
    const gh = H - 40 - gy - 8;

    // Plate glass, catching a slab of sky across the top.
    const g = ctx.createLinearGradient(gx, gy, gx + gw * 0.7, gy + gh);
    g.addColorStop(0, '#7d8a97');
    g.addColorStop(0.34, '#4a555f');
    g.addColorStop(0.36, '#8794a1');
    g.addColorStop(0.62, '#39424c');
    g.addColorStop(1, '#222a32');
    ctx.fillStyle = g;
    ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = '#584a39';
    ctx.lineWidth = 6;
    ctx.strokeRect(gx + 3, gy + 3, gw - 6, gh - 6);

    // A door in one bay.
    if (i % 2 === 1) {
      const dw = gw * 0.3;
      ctx.fillStyle = '#4a3c2f';
      ctx.fillRect(gx + gw - dw - 6, gy + 6, dw, gh - 6);
      ctx.fillStyle = '#8fa0ad';
      ctx.fillRect(gx + gw - dw + 2, gy + 14, dw - 16, gh * 0.42);
      ctx.fillStyle = '#c9b487';
      ctx.fillRect(gx + gw - dw - 2, gy + gh * 0.55, 5, 6);
    }

    // Goods in the window, as silhouettes.
    ctx.fillStyle = 'rgba(28,24,18,0.45)';
    for (let k = 0; k < 5; k++) {
      const sw = 12 + rng() * 26;
      const sh = 18 + rng() * 44;
      ctx.fillRect(gx + 12 + rng() * (gw - 40), gy + gh - sh - 8, sw, sh);
    }

    // The lit version: the shop interior glows.
    const lg = lit.ctx.createLinearGradient(gx, gy, gx, gy + gh);
    lg.addColorStop(0, '#ffd9a0');
    lg.addColorStop(1, '#c98c46');
    lit.ctx.fillStyle = lg;
    lit.ctx.fillRect(gx + 5, gy + 5, gw - 10, gh - 10);
    lit.ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let k = 0; k < 4; k++) {
      lit.ctx.fillRect(gx + 14 + k * (gw / 4.6), gy + gh * 0.42, 10, gh * 0.5);
    }
  }

  // Grime along the bottom.
  ctx.globalAlpha = 0.22;
  const grime = ctx.createLinearGradient(0, H - 90, 0, H);
  grime.addColorStop(0, 'rgba(0,0,0,0)');
  grime.addColorStop(1, '#0d0b09');
  ctx.fillStyle = grime;
  ctx.fillRect(0, H - 90, W, 90);
  ctx.globalAlpha = 1;

  return { map: texture(canvas), lights: texture(lit.canvas) };
}

/** Blank shutters/brick for the ground floor of buildings with no shop. */
function makePlinth(): THREE.Texture {
  const W = 256;
  const H = 128;
  const { canvas, ctx } = makeCanvas(W, H);
  const rng = mulberry32(777);
  ctx.fillStyle = '#5f584c';
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 16) {
    for (let x = -40; x < W + 40; x += 40) {
      const off = ((y / 16) % 2) * 20;
      ctx.fillStyle = mixHex('#4a463c', '#726957', rng());
      ctx.fillRect(x + off + 1, y + 1, 38, 14);
    }
  }
  ctx.globalAlpha = 0.28;
  const grime = ctx.createLinearGradient(0, H * 0.4, 0, H);
  grime.addColorStop(0, 'rgba(0,0,0,0)');
  grime.addColorStop(1, '#0c0a08');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  return texture(canvas);
}

// ------------------------------------------------------------------ signage

export const SIGN_COLS = 8;
export const SIGN_ROWS = 8;
const SIGN_TILE_W = 512;
const SIGN_TILE_H = 64;

export interface SignAtlas {
  map: THREE.Texture;
  /** typeId -> tile index, for every business that hangs a sign outside. */
  index: Record<string, number>;
  cols: number;
  rows: number;
}

const SIGN_STYLES: { bg: string; ink: string; rule: string }[] = [
  { bg: '#1f2f28', ink: '#e8d9ac', rule: '#b99a4e' },
  { bg: '#3a1c1c', ink: '#eddcb6', rule: '#c0a05a' },
  { bg: '#1b2436', ink: '#e6e0cd', rule: '#a9b4c8' },
  { bg: '#241f1a', ink: '#e9c987', rule: '#8c7440' },
  { bg: '#3d3016', ink: '#f2e6c4', rule: '#c8b06a' },
  { bg: '#2b1730', ink: '#e9d7c2', rule: '#a98bb0' },
];

/** Which classes actually put their name over the door. Never `illegal`. */
function signable(cls: string): boolean {
  return cls === 'commercial' || cls === 'industrial' || cls === 'municipal' || cls === 'charity';
}

/** The delivered sign boards, one per style, in the order of SIGN_STYLES then civic and industrial. */
export type SignBoards = { styles: HTMLImageElement[]; civic: HTMLImageElement; industrial: HTMLImageElement };

function makeSignAtlas(boards?: SignBoards): SignAtlas {
  const W = SIGN_COLS * SIGN_TILE_W;
  const H = SIGN_ROWS * SIGN_TILE_H;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);

  const index: Record<string, number> = {};
  const types = BUILDING_TYPES.filter((t) => signable(t.cls));
  let i = 0;
  for (const t of types) {
    if (i >= SIGN_COLS * SIGN_ROWS) break;
    index[t.id] = i;
    const col = i % SIGN_COLS;
    const row = Math.floor(i / SIGN_COLS);
    drawSignTile(ctx, col * SIGN_TILE_W, row * SIGN_TILE_H, t.name, t.cls, i, boards);
    i++;
  }

  const map = texture(canvas, false);
  return { map, index, cols: SIGN_COLS, rows: SIGN_ROWS };
}

function drawSignTile(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  name: string,
  cls: string,
  seed: number,
  boards?: SignBoards,
) {
  const W = SIGN_TILE_W;
  const H = SIGN_TILE_H;
  const civic = cls === 'municipal' || cls === 'charity';
  const industrial = cls === 'industrial';
  const style = SIGN_STYLES[seed % SIGN_STYLES.length];

  const bg = civic ? '#cfc7ae' : industrial ? '#37393a' : style.bg;
  const ink = civic ? '#3a3427' : industrial ? '#dcd8cd' : style.ink;
  const ruleCol = civic ? '#8d846a' : industrial ? '#7e8184' : style.rule;

  ctx.save();
  ctx.translate(ox, oy);

  const board = boards ? (civic ? boards.civic : industrial ? boards.industrial : boards.styles[seed % SIGN_STYLES.length]) : null;
  if (board) {
    // The painted board carries its own rules and finish; the name goes on top.
    ctx.drawImage(board, 0, 0, W, H);
  } else {
    // Bleed the ground colour into the whole tile so mip levels stay clean.
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Board shading.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.14)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Gold rules top and bottom.
    ctx.fillStyle = ruleCol;
    ctx.fillRect(10, 6, W - 20, 2);
    ctx.fillRect(10, H - 8, W - 20, 2);
  }

  const label = name.toUpperCase();
  const family = civic ? '"Times New Roman", Georgia, serif' : 'Georgia, "Times New Roman", serif';
  let size = 34;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (;;) {
    ctx.font = `bold ${size}px ${family}`;
    const spacing = size * 0.11;
    if (measureTracked(ctx, label, spacing) <= W - 44 || size <= 13) break;
    size -= 1;
  }
  const spacing = size * 0.11;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  fillTracked(ctx, label, W / 2, H / 2 + 2.5, spacing);
  ctx.fillStyle = ink;
  fillTracked(ctx, label, W / 2, H / 2, spacing);

  ctx.restore();
}

function measureTracked(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w - spacing;
}

function fillTracked(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, spacing: number) {
  const total = measureTracked(ctx, text, spacing);
  let x = cx - total / 2;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, x, cy);
    x += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = prev;
}

// ------------------------------------------------------------------ ground

/** Flagstone pavement, seen from above. */
function makePavement(): THREE.Texture {
  const S = 256;
  const { canvas, ctx } = makeCanvas(S, S);
  const rng = mulberry32(31337);
  ctx.fillStyle = '#6a675e';
  ctx.fillRect(0, 0, S, S);
  const slab = 64;
  for (let y = 0; y < S; y += slab) {
    for (let x = 0; x < S; x += slab) {
      // Kept low in contrast: strong slab-to-slab variation reads as a
      // chequerboard once the pavement is seen from the air.
      ctx.fillStyle = mixHex('#636057', '#726f66', rng());
      ctx.fillRect(x + 1.5, y + 1.5, slab - 3, slab - 3);
    }
  }
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = rng() > 0.5 ? '#8b877c' : '#3f3d38';
    ctx.fillRect(rng() * S, rng() * S, 2, 2);
  }
  ctx.globalAlpha = 0.14;
  for (let i = 0; i < 14; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const r = 18 + rng() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, '#191714');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  return texture(canvas);
}

/** Dressed kerb stone, used on the vertical faces of the pavement. */
function makeKerb(): THREE.Texture {
  const W = 128;
  const H = 32;
  const { canvas, ctx } = makeCanvas(W, H);
  const rng = mulberry32(5150);
  ctx.fillStyle = '#7b776c';
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 32) {
    ctx.fillStyle = mixHex('#615d55', '#8d897d', rng());
    ctx.fillRect(x + 1, 0, 30, H);
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return texture(canvas);
}

// ------------------------------------------------------------------ bundle

export interface CityTextures {
  facades: { map: THREE.Texture; lights: THREE.Texture; palette: FacadePalette }[];
  roof: THREE.Texture;
  storefront: { map: THREE.Texture; lights: THREE.Texture };
  plinth: THREE.Texture;
  signs: SignAtlas;
  pavement: THREE.Texture;
  kerb: THREE.Texture;
}

let cached: CityTextures | null = null;

// ------------------------------------------------------------------ delivered art

/** What public/art/city provides; every part optional, since each file may fail alone. */
export interface CityArt {
  facades: ({ map: THREE.Texture; lights: THREE.Texture } | null)[];
  roof: THREE.Texture | null;
  storefront: { map: THREE.Texture; lights: THREE.Texture } | null;
  plinth: THREE.Texture | null;
  pavement: THREE.Texture | null;
  kerb: THREE.Texture | null;
  awning: THREE.Texture | null;
  sawtooth: THREE.Texture | null;
  signs: SignAtlas | null;
  /** The road surface, as an image for the ground painter's pattern. */
  road: HTMLImageElement | null;
}

const cityFile = (file: string) => assetUrl(`art/city/${file}`);

/** Palette name → delivered facade file stem. */
const FACADE_FILES: Record<string, string> = {
  redBrick: 'facade-red-brick',
  brownBrick: 'facade-brown-brick',
  buffBrick: 'facade-buff-brick',
  limestone: 'facade-limestone',
  stucco: 'facade-stucco',
};

const SIGN_FILES = ['sign-green', 'sign-oxblood', 'sign-navy', 'sign-walnut', 'sign-olive', 'sign-plum'];

/** A picture that fails or hangs is tried again: up to three tries, each with a time limit (1.2.19). */
export const ASSET_TRIES = 3;
export const ASSET_TRY_MS = [20_000, 30_000, 45_000];

/** Run `attempt` up to `tries` times; each try gives up after its time limit. A late
 * answer from a timed-out try is ignored. Resolves null when every try failed. */
export async function withRetry<T>(attempt: (tryIndex: number) => Promise<T | null>, limits: readonly number[] = ASSET_TRY_MS,
  tries = ASSET_TRIES, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    const limit = limits[Math.min(i, limits.length - 1)];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), limit); });
    const result = await Promise.race([attempt(i).catch(() => null), timedOut]);
    if (timer) clearTimeout(timer);
    if (result != null) return result;
    if (i + 1 < tries) await wait(500 * (i + 1));
  }
  return null;
}

/** A retry asks past any broken cached copy. */
const tryUrl = (file: string, tryIndex: number) => tryIndex === 0 ? cityFile(file) : `${cityFile(file)}${cityFile(file).includes('?') ? '&' : '?'}retry=${tryIndex}`;

function loadTexture(file: string, repeat = true): Promise<THREE.Texture | null> {
  return enqueueAssetLoad(async () => {
    const started = performance.now();
    const t = await withRetry((i) => new THREE.TextureLoader().loadAsync(tryUrl(file, i)));
    noteAssetLoad(file, performance.now() - started, !!t);
    if (!t) return null;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    return t;
  });
}

function loadImageFile(file: string): Promise<HTMLImageElement | null> {
  return enqueueAssetLoad(async () => {
    const started = performance.now();
    const img = await withRetry((i) => new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = tryUrl(file, i);
    }));
    noteAssetLoad(file, performance.now() - started, !!img);
    return img;
  });
}

/** Street surfaces and facades the camera needs first, then signs and extras. */
export const CITY_ART_FIRST_FILES = [
  'pavement.jpg',
  'kerb.jpg',
  'plinth.jpg',
  'roof-asphalt.jpg',
  'storefront.jpg',
  'storefront-lit.png',
  ...Object.values(FACADE_FILES).flatMap((stem) => [`${stem}.jpg`, `${stem}-lit.png`]),
];

export const CITY_ART_LATER_FILES = [
  'awning.png',
  'sawtooth-glazing.jpg',
  'road-asphalt.jpg',
  ...SIGN_FILES.map((file) => `${file}.jpg`),
  'sign-civic.jpg',
  'sign-industrial.jpg',
];

async function loadPair(stem: string, ext: string): Promise<{ map: THREE.Texture; lights: THREE.Texture } | null> {
  const [map, lights] = await Promise.all([loadTexture(`${stem}.${ext}`), loadTexture(`${stem}-lit.png`)]);
  if (!map || !lights) return null;
  return { map, lights };
}

let artLoading: Promise<CityArt> | null = null;

/**
 * Fetch the delivered city textures. Loaded once per page; anything missing
 * comes back null and the painted texture for it stays in use.
 */
export function loadCityArt(): Promise<CityArt> {
  if (artLoading) return artLoading;
  artLoading = (async () => {
    // Queue the street and facade files first so they take the first slots.
    // The later files join the same queue and start as those slots free.
    const first = Promise.all([
      Promise.all(FACADE_PALETTES.map((p) => p.name === 'church' ? Promise.resolve(null)
        : loadPair(FACADE_FILES[p.name] ?? p.name, 'jpg'))),
      loadTexture('roof-asphalt.jpg'),
      loadPair('storefront', 'jpg'),
      loadTexture('plinth.jpg'),
      loadTexture('pavement.jpg'),
      loadTexture('kerb.jpg'),
    ]);
    const later = Promise.all([
      loadTexture('awning.png'),
      loadTexture('sawtooth-glazing.jpg'),
      loadImageFile('road-asphalt.jpg'),
      ...SIGN_FILES.map((f) => loadImageFile(`${f}.jpg`)),
      loadImageFile('sign-civic.jpg'),
      loadImageFile('sign-industrial.jpg'),
    ]);
    const [[facades, roof, storefront, plinth, pavement, kerb], [awning, sawtooth, road, ...boards]] = await Promise.all([first, later]);
    const styles = boards.slice(0, SIGN_FILES.length) as (HTMLImageElement | null)[];
    const civic = boards[SIGN_FILES.length] as HTMLImageElement | null;
    const industrial = boards[SIGN_FILES.length + 1] as HTMLImageElement | null;
    const signs =
      civic && industrial && styles.every(Boolean) ? makeSignAtlas({ styles: styles as HTMLImageElement[], civic, industrial }) : null;
    return { facades, roof, storefront, plinth, pavement, kerb, awning, sawtooth, signs, road };
  })();
  return artLoading;
}

/** Built once per page, shared by every renderer instance. */
export function cityTextures(): CityTextures {
  if (cached) return cached;
  cached = {
    facades: FACADE_PALETTES.map((p, i) => {
      const f = p.name === 'church' ? makeChurchFacade(p) : makeFacade(p, 1000 + i * 977);
      return { map: f.map, lights: f.lights, palette: p };
    }),
    roof: makeRoof(),
    storefront: makeStorefront(),
    plinth: makePlinth(),
    signs: makeSignAtlas(),
    pavement: makePavement(),
    kerb: makeKerb(),
  };
  return cached;
}
