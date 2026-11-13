import { useEffect, useState } from 'react';
import { useGame } from '../app/store';
import { DialogFrame } from './DialogFrame';
import { Rivets } from './common';
import { artUrl } from '../app/artBase';

/** The backdrop is decoded while the player plans, not while the city is being
 * built (which holds the main thread and would leave the screen black). */
export const LOADING_ART = artUrl('art/brand/key-art-city.jpg');
export function preloadLoadingArt(): void {
  if (typeof Image === 'undefined') return;
  const img = new Image(); img.src = LOADING_ART; void img.decode?.().catch(() => {});
}

/** Advice from the manual, shown while the streets open. */
export const LOADING_TIPS = [
  'A crew without a lieutenant cannot take a single order.',
  'Drop a pool hood on an empty lieutenant slot to give him a crew.',
  'Recruit at a gym, a pool hall, the docks, or the labour exchange.',
  'Hired hoods join the crew or the pool. The pool is your reserve.',
  'Collect protection before you spend the week expanding.',
  'Extortion sticks more easily on blocks next to territory you already hold.',
  'A racket too far from home is a long walk and an easy loss.',
  'Illegal businesses pay more, and they need a legal front on the same block.',
  'Rented rooms take at most two tenants. One of them can pay the whole rent.',
  'Tenants leave before the rent is due if their purse will not cover it.',
  'Heat on a block makes buying cheaper and the neighbours angrier.',
  'A wanted hood should stay off the street until the heat dies down.',
  'Bribed police look away. A bribe is only as good as the officer who took it.',
  'Without an accountant, illegal cash is hard to explain.',
  'A lawyer keeps the courtroom from becoming the end of the gang.',
  'Guarding a front also guards the business hidden behind it.',
  'End Week, beside Pause, finishes the week without the street animation. Escape returns to normal speed.',
  'The safe is charged when an order is carried out, not when you queue it.',
  'Your boss is the gang. If he dies or goes to prison, the game is over.',
  'The mayoralty needs territory, a lawyer, and the cash for the campaign.',
  'Rival hoods you have not identified look like ordinary citizens.',
  'Explore a block before you trust what the map claims is there.',
  'Eight lieutenants is the limit. Demote one before you promote another.',
  'A whole-week lookout ties up the only free hood. Leave someone for recruit.',
  'The same seed and the same orders produce the same Friday.',
];

export function StreetLoading({ message, failed, onRetry, onExit, demo = false, percent = 0 }: {
  message: string; failed: boolean; onRetry: () => void; onExit: () => void; demo?: boolean; percent?: number;
}) {
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * LOADING_TIPS.length));
  useEffect(() => {
    const timer = window.setInterval(() => setTipIndex((index) => (index + 1) % LOADING_TIPS.length), 3000);
    return () => window.clearInterval(timer);
  }, []);
  const endAttract = useGame((s) => s.endAttract);
  const shown = Math.max(0, Math.min(100, Math.round(percent)));
  const title = failed ? 'City unavailable' : demo ? 'Demo: city preview' : `Loading ${shown}%`;
  return <DialogFrame title={title} onClose={demo ? endAttract : () => {}} width={460} className="street-loading">
    <div className="paper street-loading-card" onClick={demo ? () => endAttract() : undefined}>
      <Rivets />
      <div className="kicker">{demo ? 'Demonstration' : 'Saint Volstead · Working week'}</div>
      <h2>{title}</h2>
      {!failed && (
        <div className="loading-anim" data-anim-slot="street-loading" aria-hidden="true">
          <span className="loading-walker" />
        </div>
      )}
      {!failed && <div className="week-bar" role="progressbar" aria-valuenow={shown} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${shown}%` }} /></div>}
      <p role={failed ? 'alert' : 'status'} aria-live="polite">{failed ? 'Please try loading the street view again.' : demo ? 'Demo: city preview, click to return' : message}</p>
      <p className="street-loading-note">{failed ? 'Your city is still open.' : demo ? 'This is a preview. Any click or key returns to the menu. The clock is not your week.' : 'The game clock is paused while the city loads.'}</p>
      {!failed && <p className="street-loading-tip"><b>Consigliere's advice.</b> {LOADING_TIPS[tipIndex]}</p>}
      {failed && <div className="row"><button className="btn brass" onClick={onRetry}>Try again</button><button className="btn" onClick={onExit}>Back to menu</button></div>}
    </div>
  </DialogFrame>;
}
