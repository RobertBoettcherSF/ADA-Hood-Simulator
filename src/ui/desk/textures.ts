import { art, loadImage } from '../art';
/**
 * The desk's materials, painted at start-up rather than shipped as files: a
 * dark walnut for the desktop and a laid cream paper for everything written
 * on it. Each is drawn once to a small canvas and handed to the stylesheet as
 * a CSS variable, so every paper card and brass plate shares one texture.
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

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

/** Walnut: long vertical grain with the occasional darker figure. */
export function paintWood(size = 512): string {
  const [c, ctx] = canvas(size);
  const r = rng(1928);
  ctx.fillStyle = '#2a1a0e';
  ctx.fillRect(0, 0, size, size);

  // Grain: each column a slightly different shade, drifting slowly.
  for (let x = 0; x < size; x++) {
    const t = x / size;
    const wave = Math.sin(t * 38 + Math.sin(t * 7) * 3) * 0.5 + Math.sin(t * 131) * 0.25;
    const l = 0.78 + wave * 0.16 + (r() - 0.5) * 0.08;
    ctx.fillStyle = `rgba(${Math.round(70 * l)},${Math.round(42 * l)},${Math.round(22 * l)},0.55)`;
    ctx.fillRect(x, 0, 1, size);
  }
  // Fine long streaks.
  for (let i = 0; i < 260; i++) {
    const x = r() * size;
    const y0 = r() * size;
    const len = 60 + r() * 300;
    ctx.strokeStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,220,170,0.06)';
    ctx.lineWidth = 0.6 + r() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.bezierCurveTo(x + (r() - 0.5) * 6, y0 + len * 0.3, x + (r() - 0.5) * 6, y0 + len * 0.7, x + (r() - 0.5) * 4, y0 + len);
    ctx.stroke();
  }
  // Two soft knots.
  for (let k = 0; k < 2; k++) {
    const kx = r() * size;
    const ky = r() * size;
    const g = ctx.createRadialGradient(kx, ky, 2, kx, ky, 40 + r() * 30);
    g.addColorStop(0, 'rgba(20,10,4,0.5)');
    g.addColorStop(0.5, 'rgba(60,36,18,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return c.toDataURL('image/jpeg', 0.86);
}

/** Laid paper: fine tooth with a few fibres and a faint chain-line pattern. */
export function paintPaper(size = 256): string {
  const [c, ctx] = canvas(size);
  const r = rng(1922);
  ctx.fillStyle = '#e9dcbb';
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 14;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 0.8;
  }
  ctx.putImageData(img, 0, 0);
  // Chain lines, very faint.
  ctx.strokeStyle = 'rgba(120,85,40,0.07)';
  ctx.lineWidth = 1;
  for (let y = 0; y < size; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(size, y + 0.5);
    ctx.stroke();
  }
  // Fibres.
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(110,91,63,${0.08 + r() * 0.12})`;
    ctx.lineWidth = 0.7;
    const x = r() * size;
    const y = r() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 18);
    ctx.stroke();
  }
  return c.toDataURL('image/jpeg', 0.9);
}

/** Green baize / leather grain for the journal cover. */
export function paintLeather(size = 128): string {
  const [c, ctx] = canvas(size);
  const r = rng(1931);
  ctx.fillStyle = '#2c1a12';
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 22;
    d[i] += n;
    d[i + 1] += n * 0.8;
    d[i + 2] += n * 0.7;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.85);
}

let installed = false;

/** Once a delivered tile has loaded, it takes over from the painted one. */
function swapIn(root: CSSStyleDeclaration, variable: string, file: string): void {
  const src = art(file);
  // A relative URL in a custom property resolves against the stylesheet that
  // uses it (assets/), not the page, so the play/ build asked for
  // assets/art/desk/… and got 404s. Hand the stylesheet an absolute URL.
  const absolute = typeof document !== 'undefined' ? new URL(src, document.baseURI).href : src;
  loadImage(src)
    .then(() => root.setProperty(variable, `url("${absolute}")`))
    .catch(() => {
      /* the painted material stays */
    });
}

/**
 * Paint the materials once and expose them to the stylesheet, then replace
 * each with the delivered tile from public/art/desk as it arrives. The paint
 * is instant and never fails; the tiles are the real thing.
 */
export function installDeskTextures(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const root = document.documentElement.style;
  try {
    root.setProperty('--tex-wood', `url(${paintWood()})`);
    root.setProperty('--tex-paper', `url(${paintPaper()})`);
    root.setProperty('--tex-leather', `url(${paintLeather()})`);
  } catch {
    /* no canvas — the flat colours in the stylesheet stand in */
  }
  swapIn(root, '--tex-wood', 'desk/walnut.jpg');
  swapIn(root, '--tex-paper', 'desk/paper-laid.jpg');
  swapIn(root, '--tex-leather', 'desk/leather.jpg');
  swapIn(root, '--tex-brass', 'desk/brass-brushed.jpg');
  installCursors(root);
}

/** The delivered cursors are 64 px; the desk uses them at half that. */
const CURSORS: { variable: string; file: string; x: number; y: number; fallback: string }[] = [
  { variable: '--cur-arrow', file: 'cursors/arrow.png', x: 1, y: 1, fallback: 'auto' },
  { variable: '--cur-point', file: 'cursors/arrow.png', x: 1, y: 1, fallback: 'pointer' },
  { variable: '--cur-pick', file: 'cursors/pick.png', x: 16, y: 16, fallback: 'crosshair' },
  { variable: '--cur-grab', file: 'cursors/grab.png', x: 16, y: 16, fallback: 'grab' },
  { variable: '--cur-forbidden', file: 'cursors/forbidden.png', x: 1, y: 1, fallback: 'not-allowed' },
];

function installCursors(root: CSSStyleDeclaration): void {
  const size = 32;
  for (const c of CURSORS) {
    loadImage(art(c.file))
      .then((img) => {
        const cv = document.createElement('canvas');
        cv.width = size;
        cv.height = size;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, size, size);
        root.setProperty(c.variable, `url(${cv.toDataURL('image/png')}) ${c.x} ${c.y}, ${c.fallback}`);
      })
      .catch(() => {
        /* the browser's own cursor stays */
      });
  }
}
