/**
 * 1.2.21 routing, kept brief: a crew's stops in nearest-next order from where
 * it starts, then crossings removed (2-opt) so the route never doubles back
 * over itself. The decision-making redesign is for 1.2.22.
 */
export interface Stop<T> { item: T; x: number; y: number }

const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function routeLength<T>(start: { x: number; y: number }, stops: Stop<T>[]): number {
  let total = 0, at = start;
  for (const s of stops) { total += d(at, s); at = s; }
  return total;
}

export function planRoute<T>(start: { x: number; y: number }, stops: Stop<T>[]): Stop<T>[] {
  // Nearest stop next.
  const left = [...stops], route: Stop<T>[] = [];
  let at = start;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (d(at, left[i]) < d(at, left[best])) best = i;
    at = left[best];
    route.push(left.splice(best, 1)[0]);
  }
  // Simple crossing removal: reverse any stretch whose ends cross (open path from start).
  for (let pass = 0, improved = true; improved && pass < 8; pass++) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      const a = i === 0 ? start : route[i - 1];
      for (let j = i + 1; j < route.length; j++) {
        const b = route[i], c = route[j], e = route[j + 1];
        const before = d(a, b) + (e ? d(c, e) : 0);
        const after = d(a, c) + (e ? d(b, e) : 0);
        if (after < before - 1e-6) {
          route.splice(i, j - i + 1, ...route.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return route;
}
