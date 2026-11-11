import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ASSET_FETCH_CACHE,
  ASSET_LOAD_CONCURRENCY,
  assetUrl,
  enqueueAssetLoad,
  fetchAsset,
} from '../src/app/assetCache';
import { CITY_ART_FIRST_FILES, CITY_ART_LATER_FILES } from '../src/render/textures';

describe('asset loading', () => {
  it('keeps at most six network picture loads in flight', async () => {
    let active = 0;
    let maxActive = 0;
    const jobs = Array.from({ length: 20 }, (_, i) => enqueueAssetLoad(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return i;
    }));
    const results = await Promise.all(jobs);
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(maxActive).toBeLessThanOrEqual(ASSET_LOAD_CONCURRENCY);
    expect(maxActive).toBe(ASSET_LOAD_CONCURRENCY);
  });

  it('uses stable URLs with no cache-busting query string', () => {
    const url = assetUrl('art/city/pavement.jpg');
    expect(url).toContain('art/city/pavement.jpg');
    expect(url).not.toContain('?');
    expect(ASSET_FETCH_CACHE).toBe('force-cache');
  });

  it('queues street surfaces and facades before signs', () => {
    expect(CITY_ART_FIRST_FILES).toEqual(expect.arrayContaining([
      'pavement.jpg',
      'kerb.jpg',
      'storefront.jpg',
      'facade-buff-brick.jpg',
      'facade-red-brick-lit.png',
    ]));
    expect(CITY_ART_LATER_FILES).toEqual(expect.arrayContaining([
      'awning.png',
      'sign-civic.jpg',
      'sign-green.jpg',
    ]));
    const first = new Set(CITY_ART_FIRST_FILES);
    expect(CITY_ART_LATER_FILES.some((file) => first.has(file))).toBe(false);
  });

  it('copies artwork with force-cache and starts city textures at the menu', () => {
    const sync = readFileSync('src/app/assetSync.ts', 'utf8');
    expect(sync).toContain('fetchAsset(');
    const main = readFileSync('src/main.tsx', 'utf8');
    expect(main).toContain('void loadCityArt()');
    const textures = readFileSync('src/render/textures.ts', 'utf8');
    const firstAt = textures.indexOf("loadTexture('pavement.jpg')");
    const laterAt = textures.indexOf("loadTexture('awning.png')");
    expect(firstAt).toBeGreaterThan(0);
    expect(laterAt).toBeGreaterThan(firstAt);
  });

  it('fetchAsset asks the browser to reuse a cached file', () => {
    expect(fetchAsset).toBeTypeOf('function');
    expect(ASSET_FETCH_CACHE).toBe('force-cache');
  });
});
