import { useState } from 'react';
import { useGame } from '../app/store';
import { DialogFrame } from './DialogFrame';
import { Rivets } from './common';

/** The backdrop is decoded while the player plans, not while the city is being
 * built (which holds the main thread and would leave the screen black). */
export const LOADING_ART = `${import.meta.env.BASE_URL}art/brand/key-art-city.jpg`;
export function preloadLoadingArt(): void {
  if (typeof Image === 'undefined') return;
  const img = new Image(); img.src = LOADING_ART; void img.decode?.().catch(() => {});
}

/** Advice from the manual, shown while the streets open. */
export const LOADING_TIPS = [
  'Illegal businesses earn far more than legal ones, but they must sit behind a legal front on the same block.',
  'Extorting blocks near your territory is easier: the further away, the harder the sell.',
  'A lieutenant with little to do still costs his wages. Give every crew a full week.',
  'Without an accountant, almost nothing you earn illegally can be explained away to the tax man.',
  'A hood who is wanted should stay off the streets for a week or two while the heat dies down.',
  'Bribed police look the other way, but a bribe is only as good as the officer who took it.',
  'Guarding a front also protects the illegal business behind it.',
  'Your boss is the gang. If he dies or goes to prison, the game is over.',
  'Win the mayoralty and the city is yours: you need territory, a lawyer and the cash for the campaign.',
  'Rival hoods you have not identified dress like ordinary citizens. Explore to learn who they are.',
];

export function StreetLoading({ message, failed, onRetry, onExit, demo = false }: {
  message: string; failed: boolean; onRetry: () => void; onExit: () => void; demo?: boolean;
}) {
  const [tip] = useState(() => LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);
  const endAttract = useGame((s) => s.endAttract);
  const title = failed ? 'City unavailable' : demo ? 'Demo: city preview' : 'Opening the streets';
  return <DialogFrame title={title} onClose={demo ? endAttract : () => {}} width={460} className="street-loading">
    <div className="paper street-loading-card" onClick={demo ? () => endAttract() : undefined}>
      <Rivets />
      <div className="kicker">{demo ? 'Demonstration' : 'New Temperance · Working week'}</div>
      <h2>{title}</h2>
      {!failed && <div className="street-loading-spinner" aria-hidden="true" />}
      <p role={failed ? 'alert' : 'status'} aria-live="polite">{failed ? 'Please try loading the street view again.' : demo ? 'Demo: city preview, click to return' : message}</p>
      <p className="street-loading-note">{failed ? 'Your city is still open.' : demo ? 'This is a preview. Any click or key returns to the menu. The clock is not your week.' : 'The game clock is paused while the city loads.'}</p>
      {!failed && <p className="street-loading-tip"><b>Consigliere's advice.</b> {tip}</p>}
      {failed && <div className="row"><button className="btn brass" onClick={onRetry}>Try again</button><button className="btn" onClick={onExit}>Back to menu</button></div>}
    </div>
  </DialogFrame>;
}
