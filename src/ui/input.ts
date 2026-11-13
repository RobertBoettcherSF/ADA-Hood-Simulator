import { useEffect, useRef } from 'react';

/**
 * 1.2.23: the one shared input layer for the screens and overlays. Every
 * window key listener goes through useWindowKey (the latest handler, one
 * listener, removed on unmount), every "is the player typing?" check through
 * isTyping, and every "take this event, nobody else" through swallow.
 */

/** Fields where a key belongs to the field, not to the game. */
export const TYPING_FIELDS = 'input, textarea, select, [contenteditable="true"]';

/** True when the event's target is a field the player types into (or matches `fields`). */
export function isTyping(target: EventTarget | null, fields: string = TYPING_FIELDS): boolean {
  return target instanceof Element && !!target.closest(fields);
}

/** Take the event: no default, and no other listener hears it. */
export function swallow(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

/** A window keydown listener that always calls the latest handler. */
export function useWindowKey(handler: (event: KeyboardEvent) => void, options: { capture?: boolean; enabled?: boolean } = {}): void {
  const latest = useRef(handler);
  latest.current = handler;
  const { capture = false, enabled = true } = options;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => latest.current(event);
    window.addEventListener('keydown', onKey, capture);
    return () => window.removeEventListener('keydown', onKey, capture);
  }, [capture, enabled]);
}

/** Any key or click (and, if asked, the wheel), captured first: for skippable sequences. */
export function addAnyInputListener(handler: (event: Event) => void, wheel = false): () => void {
  window.addEventListener('keydown', handler, true);
  window.addEventListener('pointerdown', handler, true);
  if (wheel) window.addEventListener('wheel', handler, { capture: true, passive: false });
  return () => {
    window.removeEventListener('keydown', handler, true);
    window.removeEventListener('pointerdown', handler, true);
    if (wheel) window.removeEventListener('wheel', handler, true);
  };
}
