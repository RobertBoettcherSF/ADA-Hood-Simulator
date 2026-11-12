import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';
import { ACTION_KEYS, carMinutesSaved, defaultActionRanks, loadActionRanks, rankDown, rankUp, RANK_MAX, RANK_MIN, rollAction } from '../src/app/autoActions';

describe('Auto Test ranked action table', () => {
  it('rolls by rank and only from what is available', () => {
    const ranks = defaultActionRanks();
    ranks.raid = 4; ranks.snitch = 0.2;
    const rng = new Rng(3);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) { const k = rollAction(ranks, ['raid', 'snitch'], rng)!; counts[k] = (counts[k] ?? 0) + 1; }
    expect(counts.raid).toBeGreaterThan(counts.snitch * 8);
    expect(rollAction(ranks, [], rng)).toBeNull();
  });
  it('moves ranks up on success and down on failure within bounds', () => {
    const ranks = defaultActionRanks();
    for (let i = 0; i < 30; i++) rankUp(ranks, 'raid');
    for (let i = 0; i < 30; i++) rankDown(ranks, 'killRival');
    expect(ranks.raid).toBe(RANK_MAX);
    expect(ranks.killRival).toBe(RANK_MIN);
  });
  it('loads saved ranks, filling gaps and clamping', () => {
    const ranks = loadActionRanks({ raid: 99, bogus: 3, snitch: Number.NaN });
    expect(ranks.raid).toBe(RANK_MAX);
    expect(ranks.snitch).toBe(defaultActionRanks().snitch);
    expect(Object.keys(ranks).sort()).toEqual([...ACTION_KEYS].sort());
  });
  it('estimates the minutes a car saves', () => {
    expect(carMinutesSaved(0, 1, 3)).toBe(0);
    expect(carMinutesSaved(300, 1, 3, 2)).toBeCloseTo(400);
  });
});

describe('judging an action', () => {
  it('is neutral when the crew only ran out of week', async () => {
    const { judgeAction } = await import('../src/app/autoActions');
    const w = { people: {}, buildings: {} } as never;
    const order = { id: 5, assignedIds: [], failReason: 'There was not enough time in the week to perform the order.', completedTargets: 0 } as never;
    expect(judgeAction(w, { knownPeople: [] } as never, { key: 'kidnapRival', orderId: 5, cashBefore: 0 }, [order]).ok).toBeNull();
  });
});
