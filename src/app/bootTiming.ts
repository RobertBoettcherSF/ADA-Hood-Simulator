/** Wall-clock from the first paint of the shell until the menu is allowed to open. */
export function markBootStart(): void {
  if (typeof performance === 'undefined') return;
  if (performance.getEntriesByName('hood-boot-start').length) return;
  performance.mark('hood-boot-start');
}

export function markBootReady(): void {
  if (typeof performance === 'undefined' || typeof document === 'undefined') return;
  if (!performance.getEntriesByName('hood-boot-start').length) markBootStart();
  if (performance.getEntriesByName('hood-boot').length) return;
  performance.mark('hood-boot-ready');
  performance.measure('hood-boot', 'hood-boot-start', 'hood-boot-ready');
  const ms = performance.getEntriesByName('hood-boot').at(-1)?.duration ?? 0;
  document.documentElement.dataset.bootMs = String(Math.round(ms));
  document.documentElement.dataset.bootReady = '1';
}

export function bootMs(): number | null {
  const raw = typeof document === 'undefined' ? '' : document.documentElement.dataset.bootMs;
  const ms = Number(raw);
  return Number.isFinite(ms) && raw ? ms : null;
}
