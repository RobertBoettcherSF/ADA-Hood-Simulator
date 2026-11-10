import { useEffect, useState } from 'react';
import { art } from './art';
import { audio } from '../audio/audio';

const LENGTH_MS = 6200;

/**
 * A short title before the menu, as the original opened on its introduction:
 * the city at dusk slowly drifting, the brass title, a line of period
 * scene-setting, then the casino table. Any key or click skips it; it plays
 * once a session, and is a simple fade where motion is reduced.
 */
export function TitleSequence({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setLeaving(true);
      window.setTimeout(onDone, 600);
    };
    const timer = window.setTimeout(finish, LENGTH_MS);
    // Captured first, so the menu waiting beneath never acts on the key.
    const skip = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); audio.ensure(); finish(); };
    window.addEventListener('keydown', skip, true);
    window.addEventListener('pointerdown', skip, true);
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', skip, true); window.removeEventListener('pointerdown', skip, true); };
  }, [onDone]);

  return (
    <div className={`title-sequence${leaving ? ' leaving' : ''}`} role="presentation">
      <div className="title-city" style={{ backgroundImage: `url(${art('brand/key-art-city.jpg')})` }} aria-hidden="true" />
      <div className="title-veil" aria-hidden="true" />
      <div className="title-stack">
        <div className="title-year">New Temperance · 1928</div>
        <h1 className="scene-wordmark title-plate">Hood Simulator</h1>
        <p className="title-line">Prohibition is the law. The city is anybody's.</p>
      </div>
      <div className="title-skip">Press any key</div>
    </div>
  );
}
