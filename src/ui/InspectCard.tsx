import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame } from '../app/store';
import { closeInspect, inspectFacts, inspectPlacement, onInspect } from './inspectCard';

/** A wooden plaque at the cursor. Escape or the next click puts it away. */
export function InspectCard() {
  const sim = useGame((s) => s.sim);
  const version = useGame((s) => s.version);
  const [, bump] = useState(0);
  const card = useRef<HTMLElement>(null);
  useEffect(() => onInspect(() => bump((n) => n + 1)), []);
  const place = inspectPlacement();
  const facts = sim && place ? inspectFacts(sim.world, sim.playerGang.id, place.hit, place.view) : null;

  const openKey = place ? `${place.view ?? ''},${place.x},${place.y},${place.hit.personId ?? ''},${place.hit.buildingId ?? ''},${place.hit.point.x},${place.hit.point.y}` : '';
  useEffect(() => {
    if (!openKey) return;
    const close = () => closeInspect();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    const timer = window.setTimeout(() => window.addEventListener('pointerdown', close), 0);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [openKey]);

  useLayoutEffect(() => {
    const el = card.current;
    if (!el || !place) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(place.x + 12, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(place.y + 12, window.innerHeight - rect.height - 8));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [facts, place, version]);

  if (!facts || !place) return null;
  return (
    <aside ref={card} className="inspect-card" role="dialog" aria-label={facts.title} style={{ left: place.x + 12, top: place.y + 12 }}>
      <h4>{facts.title}</h4>
      <dl>
        {facts.rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
