import { useEffect } from 'react';
import { useGame } from '../app/store';
import { addAnyInputListener, swallow } from './input';

const SHOT_MS = 9000;

/**
 * The attract mode's overlay (the original's demo on an idle menu): the
 * wordmark and a "Demonstration" plate over the autopilot city, a camera that
 * cuts between hoods at work, and any key or click back to the menu.
 */
export function AttractMode() {
  const endAttract = useGame((s) => s.endAttract);
  useEffect(() => {
    // Captured first, so nothing in the city or its keyboard handlers acts on it.
    const stop = addAnyInputListener((e) => { swallow(e); endAttract(); }, true);
    const cut = () => {
      const { sim, requestCamera } = useGame.getState();
      if (!sim || sim.world.phase !== 'week') return;
      const busy = Object.values(sim.world.people).filter(p => p.gangId != null && p.status === 'active' && !p.inVehicle && p.dest);
      const pick = busy[Math.floor(Math.random() * busy.length)];
      if (pick) requestCamera({ x: pick.pos.x, y: pick.pos.y });
    };
    const first = window.setTimeout(cut, 1500);
    const timer = window.setInterval(cut, SHOT_MS);
    return () => {
      stop();
      window.clearTimeout(first); window.clearInterval(timer);
    };
  }, [endAttract]);

  return (
    <div className="attract" role="presentation">
      <h1 className="scene-wordmark">Hood Simulator</h1>
      <div className="attract-banner">Demo: city preview, click to return</div>
      <div className="title-skip attract-skip">Click or press any key</div>
    </div>
  );
}
