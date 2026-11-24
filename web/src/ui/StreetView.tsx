// The street view canvas and its pointer, wheel and key controls.
import React, { useEffect, useRef } from 'react';
import { City } from '../city';
import { StreetScene } from '../street/scene';

interface Props {
  city: City; selected: number; onSelect: (lot: number) => void; turnSignal: number; visible: boolean; label: string;
  people: Int32Array | null; gangColours: number[]; person: number; onPerson: (person: number) => void;
  focus: { x: number; y: number; n: number } | null;
  markers: { x: number; y: number; colour: string }[];
}

export function StreetView({ city, selected, onSelect, turnSignal, visible, label, people, gangColours, person, onPerson, focus, markers }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<StreetScene | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const s = new StreetScene(canvas.current);
    scene.current = s;
    const resize = new ResizeObserver(() => s.update());
    resize.observe(canvas.current);
    return () => { resize.disconnect(); s.dispose(); scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.setCity(city); }, [city]);
  useEffect(() => { scene.current?.select(selected); }, [selected, city]);
  useEffect(() => { if (turnSignal) scene.current?.turn(); }, [turnSignal]);
  useEffect(() => { if (people) scene.current?.setPeople(people, gangColours, person); }, [people, gangColours, person, city]);
  useEffect(() => { if (focus) scene.current?.lookAt(focus.x, focus.y); }, [focus]);
  useEffect(() => { scene.current?.setMarkers(markers); }, [markers, city]);
  useEffect(() => { if (visible) scene.current?.update(); }, [visible]);

  // Dragging pans; a press that does not move selects. Two pointers pinch.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch = 0;
    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p || !scene.current) return;
      if (pointers.size === 1) {
        scene.current.drag(e.clientX - p.x, e.clientY - p.y);
        moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) scene.current.zoomBy(d / pinch);
        pinch = d; moved = 99;
      }
    };
    const up = (e: PointerEvent) => {
      if (pointers.size === 1 && moved < 4 && scene.current) {
        const hit = scene.current.pick(e.clientX, e.clientY);
        if (hit.person >= 0) onPerson(hit.person); else onSelect(hit.lot);
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); scene.current?.zoomBy(Math.exp(-e.deltaY * 0.0015)); };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', wheel, { passive: false });
    return () => {
      c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up);
      c.removeEventListener('wheel', wheel);
    };
  }, [onSelect, onPerson]);

  // Arrow keys pan, + and - zoom (not while typing in a field).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!visible || !scene.current || (e.target instanceof HTMLElement && e.target.closest('input, textarea'))) return;
      const step = 60;
      const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (moves[e.key]) { e.preventDefault(); scene.current.drag(...moves[e.key]); }
      else if (e.key === '+' || e.key === '=') scene.current.zoomBy(1.25);
      else if (e.key === '-') scene.current.zoomBy(0.8);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [visible]);

  return <canvas className="street-view" ref={canvas} aria-label={label} style={{ visibility: visible ? 'visible' : 'hidden' }} />;
}
