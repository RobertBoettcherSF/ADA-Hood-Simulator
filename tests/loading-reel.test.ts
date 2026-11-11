import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { defaultGameOptions } from '../src/app/newGame';
import {
  REEL_BAR,
  REEL_FINAL_HIT,
  REEL_PHASE,
  REEL_SHOT_BARS,
  REEL_TRACK_SECONDS,
  buildReel,
  createReelSim,
  frameAt,
  reelCutTimes,
} from '../src/ui/reel/reelShow';

describe('loading reel', () => {
  it('cuts on four-bar phrases and holds the logo through the final hit', () => {
    const cuts = reelCutTimes();
    expect(cuts).toHaveLength(REEL_SHOT_BARS.length + 1);
    for (let i = 1; i < cuts.length; i++) {
      const bars = Math.round((cuts[i] - REEL_PHASE) / REEL_BAR);
      expect(bars % 4).toBe(0);
      const length = cuts[i] - (i === 1 ? 0 : cuts[i - 1]);
      expect(length).toBeGreaterThanOrEqual(5);
      expect(length).toBeLessThanOrEqual(15);
    }
    const logo = cuts[cuts.length - 1];
    expect(logo).toBeLessThan(REEL_FINAL_HIT);
    expect(REEL_TRACK_SECONDS - logo).toBeGreaterThan(4);
    expect(frameAt(0, cuts.length)).toBe(0);
    expect(frameAt(REEL_FINAL_HIT, cuts.length)).toBe(cuts.length - 1);
    expect(frameAt(logo + 0.05, cuts.length)).toBe(cuts.length - 1);
  });

  it('builds its own city and leaves another world untouched', () => {
    const player = new Sim({ ...defaultGameOptions(), seed: 1934, citySize: 8, cityLayout: 'classic', era: '1932' });
    const rng = player.world.rngState;
    const week = player.world.week;
    const reel = createReelSim();
    const frames = buildReel(reel);
    expect(reel.world.options.seed).toBe(1908);
    expect(reel.world.phase).toBe('week');
    expect(frames.map((frame) => frame.id)).toEqual(['crowds', 'crew', 'shakedown', 'police', 'crossing', 'racket', 'dusk', 'fire', 'street', 'logo']);
    expect(frames.filter((frame) => frame.kind === 'street').every((frame) => Number.isFinite(frame.x) && Number.isFinite(frame.y))).toBe(true);
    expect(player.world.rngState).toBe(rng);
    expect(player.world.week).toBe(week);
    expect(player.world.phase).toBe('planning');
  }, 60000);

  it('keeps the theme out of the copied artwork list and the sample loader', () => {
    const manifest = readFileSync('public/asset-manifest.json', 'utf8');
    const samples = readFileSync('src/audio/samples.ts', 'utf8');
    expect(manifest.includes('reel-theme')).toBe(false);
    expect(samples.includes('reel-theme')).toBe(false);
  });
});