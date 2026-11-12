import { describe, expect, it } from 'vitest';
import { planRoute, routeLength } from '../src/app/routing';

describe('routing (1.2.21)', () => {
  it('visits nearest first and removes crossings', () => {
    const start = { x: 0, y: 0 };
    const pts = [{ x: 10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 5, y: 0 }, { x: 0, y: 5 }].map((p, i) => ({ item: i, ...p }));
    const r = planRoute(start, pts);
    expect(r).toHaveLength(5);
    expect(r[0].item).toBe(3);
    expect(routeLength(start, r)).toBeLessThanOrEqual(routeLength(start, pts));
    expect(routeLength(start, r)).toBeCloseTo(35, 0);
  });
});
