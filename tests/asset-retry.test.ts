import { describe, expect, it } from 'vitest';
import { ASSET_TRIES, ASSET_TRY_MS, withRetry } from '../src/render/textures';

const now = () => Promise.resolve();

describe('picture loader retry', () => {
  it('tries again after a failure and returns the later success', async () => {
    let calls = 0;
    const got = await withRetry(async () => (++calls < 3 ? null : 'ok'), [50], 3, now);
    expect(got).toBe('ok');
    expect(calls).toBe(3);
  });
  it('gives up on a hung try after its time limit', async () => {
    let calls = 0;
    const got = await withRetry((i) => { calls++; return i === 0 ? new Promise<string | null>(() => {}) : Promise.resolve('second'); }, [20], 3, now);
    expect(got).toBe('second');
    expect(calls).toBe(2);
  });
  it('returns null when every try fails or throws', async () => {
    const got = await withRetry(async () => { throw new Error('404'); }, [20], 2, now);
    expect(got).toBeNull();
  });
  it('gives a picture 10 s and one retry before the painted colour stays (1.2.24)', () => {
    expect(ASSET_TRIES).toBe(2);
    expect(ASSET_TRY_MS.slice(0, ASSET_TRIES)).toEqual([10_000, 10_000]);
  });
});
