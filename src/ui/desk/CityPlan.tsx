import { art, loadImage } from '../art';
import { useEffect, useRef, type CSSProperties } from 'react';
import { registerProbe } from '../../sim/memProbe';

/**
 * A surveyor's plan of a city, drawn in ink on the desk: blocks, lots, a
 * river, a park or two, street names and a compass. It is decoration for the
 * menus, so it is generated from a seed rather than from a live world, and it
 * draws itself once per size change.
 */

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STREETS = ['Fourth St', 'Canal St', 'Market St', 'Volstead Ave', 'Harbour Rd', 'Union St', 'Elm St', 'Mercer St'];

/** The foxed drafting paper the plan is drawn on, once it has loaded. */
let parchment: HTMLImageElement | null = null;
const redraws = new Set<() => void>();
registerProbe('cityPlanRedraws', () => redraws.size); // 1.2.28
if (typeof document !== 'undefined') {
  loadImage(art('desk/parchment-plan.jpg'))
    .then((img) => {
      parchment = img;
      for (const d of redraws) d();
    })
    .catch(() => {
      /* the painted paper stands in */
    });
}

export function drawCityPlan(cv: HTMLCanvasElement, seed: number, blocks = 14): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth || 600;
  const h = cv.clientHeight || 420;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = rng(seed);

  // Paper: the delivered parchment, or a painted stand-in. The noise takes its
  // own random stream so the plan itself comes out the same either way.
  if (parchment) {
    ctx.drawImage(parchment, 0, 0, w, h);
  } else {
    const nr = rng(seed ^ 0x9e3779b9);
    ctx.fillStyle = '#e4d6b3';
    ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (nr() - 0.5) * 10;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n * 0.8;
    }
    ctx.putImageData(img, 0, 0);
  }

  const margin = Math.min(w, h) * 0.07;
  const cell = Math.min((w - margin * 2) / blocks, (h - margin * 2) / blocks);
  const ox = (w - cell * blocks) / 2;
  const oy = (h - cell * blocks) / 2;
  const street = cell * 0.26;
  const blockW = cell - street;

  // A river along one edge.
  ctx.strokeStyle = 'rgba(70,90,110,0.55)';
  ctx.lineWidth = cell * 0.5;
  ctx.beginPath();
  ctx.moveTo(ox - margin, oy + cell * (blocks - 1.2));
  ctx.bezierCurveTo(ox + cell * 3, oy + cell * (blocks - 0.6), ox + cell * 9, oy + cell * (blocks + 0.4), ox + cell * blocks + margin, oy + cell * (blocks - 0.9));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(70,90,110,0.35)';
  ctx.lineWidth = 1;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(ox - margin, oy + cell * (blocks - 1.2) + k * 5);
    ctx.bezierCurveTo(ox + cell * 3, oy + cell * (blocks - 0.6) + k * 5, ox + cell * 9, oy + cell * (blocks + 0.4) + k * 5, ox + cell * blocks + margin, oy + cell * (blocks - 0.9) + k * 5);
    ctx.stroke();
  }

  // Blocks and lots.
  const ink = '#3a2a14';
  const parks = new Set<number>();
  for (let i = 0; i < 3; i++) parks.add(Math.floor(r() * blocks * (blocks - 2)));
  const office = { gx: Math.floor(blocks * 0.35 + r() * 3), gy: Math.floor(blocks * 0.35 + r() * 3) };

  for (let gy = 0; gy < blocks - 1; gy++) {
    for (let gx = 0; gx < blocks; gx++) {
      const x = ox + gx * cell + street / 2;
      const y = oy + gy * cell + street / 2;
      const id = gy * blocks + gx;
      if (parks.has(id)) {
        ctx.fillStyle = 'rgba(90,120,70,0.28)';
        ctx.fillRect(x, y, blockW, blockW);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x, y, blockW, blockW);
        // A few trees.
        for (let t = 0; t < 5; t++) {
          ctx.beginPath();
          ctx.arc(x + blockW * (0.2 + r() * 0.6), y + blockW * (0.2 + r() * 0.6), blockW * 0.06, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(58,42,20,0.7)';
          ctx.stroke();
        }
        continue;
      }
      const mine = Math.abs(gx - office.gx) + Math.abs(gy - office.gy) <= 1;
      ctx.fillStyle = mine ? 'rgba(184,134,42,0.22)' : 'rgba(58,42,20,0.06)';
      ctx.fillRect(x, y, blockW, blockW);
      ctx.strokeStyle = ink;
      ctx.lineWidth = mine ? 1.4 : 0.9;
      ctx.strokeRect(x, y, blockW, blockW);
      // Lots: a 3x3 subdivision, some hatched as built.
      const lot = blockW / 3;
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = 'rgba(58,42,20,0.55)';
      for (let k = 1; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(x + lot * k, y);
        ctx.lineTo(x + lot * k, y + blockW);
        ctx.moveTo(x, y + lot * k);
        ctx.lineTo(x + blockW, y + lot * k);
        ctx.stroke();
      }
      for (let li = 0; li < 9; li++) {
        if (r() < 0.35) continue;
        const lx = x + (li % 3) * lot;
        const ly = y + Math.floor(li / 3) * lot;
        ctx.save();
        ctx.beginPath();
        ctx.rect(lx + 1, ly + 1, lot - 2, lot - 2);
        ctx.clip();
        ctx.strokeStyle = 'rgba(58,42,20,0.45)';
        ctx.lineWidth = 0.5;
        for (let s = -lot; s < lot * 2; s += 3.2) {
          ctx.beginPath();
          ctx.moveTo(lx + s, ly);
          ctx.lineTo(lx + s + lot, ly + lot);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  // The office, marked in brass.
  {
    const x = ox + office.gx * cell + street / 2 + blockW / 3;
    const y = oy + office.gy * cell + street / 2 + blockW / 3;
    ctx.fillStyle = '#b8862a';
    ctx.fillRect(x + 1, y + 1, blockW / 3 - 2, blockW / 3 - 2);
    ctx.strokeStyle = '#6b4c10';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, y + 1, blockW / 3 - 2, blockW / 3 - 2);
  }

  // Street names along a few roads.
  ctx.fillStyle = 'rgba(58,42,20,0.85)';
  ctx.font = `${Math.max(7, cell * 0.16)}px "Barlow Condensed", sans-serif`;
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 5; i++) {
    const gy = 1 + Math.floor(r() * (blocks - 3));
    const y = oy + gy * cell;
    ctx.fillText(STREETS[i % STREETS.length].toUpperCase(), ox + cell * (0.5 + Math.floor(r() * 4)), y);
  }
  ctx.save();
  ctx.translate(ox + cell * (2 + Math.floor(r() * 8)), oy + cell * 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(STREETS[5].toUpperCase(), -cell * 3, 0);
  ctx.restore();

  // Compass rose.
  const cx = w - margin * 1.3;
  const cy = margin * 1.5;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, margin * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(cx, cy - margin * 0.75);
  ctx.lineTo(cx + margin * 0.12, cy);
  ctx.lineTo(cx, cy + margin * 0.35);
  ctx.lineTo(cx - margin * 0.12, cy);
  ctx.closePath();
  ctx.fill();
  ctx.font = `600 ${Math.max(8, margin * 0.34)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - margin * 0.95);

  // Plate border.
  ctx.strokeStyle = 'rgba(58,42,20,0.8)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(margin * 0.45, margin * 0.45, w - margin * 0.9, h - margin * 0.9);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(margin * 0.55, margin * 0.55, w - margin * 1.1, h - margin * 1.1);
}

export function CityPlan({ seed, className, style, blocks }: { seed: number; className?: string; style?: CSSProperties; blocks?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => drawCityPlan(cv, seed, blocks);
    draw();
    redraws.add(draw);
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => {
      redraws.delete(draw);
      ro.disconnect();
    };
  }, [seed, blocks]);
  return <canvas ref={ref} className={className} style={{ display: 'block', width: '100%', height: '100%', ...style }} />;
}
