import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { persistentBytes, persistentFiles } from '../src/app/assetSync';
import { runAutoTest } from '../src/app/autoTest';
import { defaultGameOptions } from '../src/app/newGame';
import type { AssetFile } from '../src/app/assetCache';
import { Sim } from '../src/sim/sim';

describe('phone artwork copy', () => {
  it('keeps the phone copy to the phone-tier models only', () => {
    const files = JSON.parse(readFileSync('public/asset-manifest.json', 'utf8')).files as AssetFile[];
    const phone = persistentFiles(files, 'phone');
    expect(phone.every((file) => file.tier === 'phone')).toBe(true);
    expect(phone.some((file) => file.path.includes('/sculpt/'))).toBe(false);
    expect(phone.some((file) => file.path.startsWith('art/portraits/'))).toBe(false);
    expect(persistentBytes(files, 'phone')).toBeLessThan(8_000_000);
    expect(persistentBytes(files, 'phone')).toBeGreaterThan(1_000_000);
  });
});

describe('auto test', () => {
  it('finishes two weeks on the small map and writes a report', async () => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 1932, citySize: 8, cityLayout: 'classic', era: '1932' });
    const report = await runAutoTest(sim, { weeks: 2, seed: 1932, speed: 4 }, (current) => {
      current.launchWeek();
      current.finishWeek();
    });
    expect(sim.world.week).toBe(3);
    expect(sim.world.phase === 'planning' || sim.world.phase === 'gameOver').toBe(true);
    expect(report).toContain('Strategy seed: 1932');
    expect(report).toContain('Timeline');
    expect(report).toContain('Week 2:');
    expect(report).toContain('Actions');
    expect(report).toContain('end-week');
    expect(report).toContain('Outcome');
  }, 120000);
});
