// The city plan: the whole city drawn flat, fitted to the screen. Blocks
// take their district's colour, lots their class colour; a flag marks each
// headquarters site. Clicking a lot selects it.
import React, { useEffect, useRef } from 'react';
import { CELL, City, blockRect, lotAt } from '../city';
import { CLASS_COLOURS, GANG_COLOURS } from '../street/scene';

const DISTRICT_TINTS = ['#d8c59a', '#cdbf9f', '#a9a49a', '#c8b9a0', '#bfc3c7'];
const PARK = '#7d9a5d', WATER = '#5f86a3', AVENUE = '#8f8a80', PLAZA = '#d6ccb4', PAPER = '#e9dfc6', STREET = '#b9ad93';

interface Props { city: City; selected: number; onSelect: (lot: number) => void; label: string; markers: { x: number; y: number; colour: string }[] }

export function CityPlan({ city, selected, onSelect, label, markers }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fit = useRef({ scale: 1, ox: 0, oy: 0 });

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const draw = () => {
      const dpr = Math.min(2, devicePixelRatio);
      const cw = c.clientWidth, ch = c.clientHeight;
      c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
      const g = c.getContext('2d');
      if (!g) return;
      const width = city.w * CELL, depth = city.h * CELL, pad = 24;
      const scale = Math.min((cw - 2 * pad) / width, (ch - 2 * pad) / depth);
      const ox = (cw - width * scale) / 2, oy = (ch - depth * scale) / 2;
      fit.current = { scale, ox, oy };
      g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      g.fillStyle = PAPER; g.fillRect(-pad / scale, -pad / scale, width + 2 * pad / scale, depth + 2 * pad / scale);
      g.fillStyle = STREET; g.fillRect(0, 0, width, depth);
      for (const b of city.blocks) {
        if (b.merged >= 0) continue;
        const r = blockRect(b);
        g.fillStyle = b.use === 1 ? PARK : b.use === 5 ? WATER : b.use === 4 ? AVENUE : b.use === 3 ? PLAZA : DISTRICT_TINTS[b.district];
        g.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
      }
      for (const l of city.lots) {
        g.fillStyle = CLASS_COLOURS[l.cls] ?? CLASS_COLOURS[0];
        g.globalAlpha = l.cls === 0 ? 0.35 : 0.9;
        g.fillRect(l.x + 0.6, l.y + 0.6, Math.max(0.5, l.w - 1.2), Math.max(0.5, l.h - 1.2));
      }
      g.globalAlpha = 1;
      const sel = city.lots[selected];
      if (sel) {
        g.strokeStyle = '#1b1208'; g.lineWidth = 2.5 / scale;
        g.strokeRect(sel.x - 1, sel.y - 1, sel.w + 2, sel.h + 2);
      }
      for (const k of markers) {
        g.fillStyle = k.colour; g.strokeStyle = '#1b1208'; g.lineWidth = 1 / scale;
        g.beginPath(); g.arc(k.x, k.y, 6 / scale, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      for (const hq of city.hq) {
        const x = (hq.fx + 0.5) * (CELL / 5), y = (hq.fy + 0.5) * (CELL / 5), s = 9 / scale;
        g.fillStyle = '#1b1208'; g.fillRect(x - 0.6 / scale, y - 2.2 * s, 1.2 / scale, 2.2 * s);
        g.fillStyle = GANG_COLOURS[hq.colour % 4];
        g.beginPath(); g.moveTo(x, y - 2.2 * s); g.lineTo(x + 1.6 * s, y - 1.7 * s); g.lineTo(x, y - 1.2 * s); g.fill();
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(c);
    return () => observer.disconnect();
  }, [city, selected, markers]);

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect(), f = fit.current;
    onSelect(lotAt(city, (e.clientX - rect.left - f.ox) / f.scale, (e.clientY - rect.top - f.oy) / f.scale));
  };
  return <canvas className="city-plan" ref={canvas} onClick={click} aria-label={label} />;
}
