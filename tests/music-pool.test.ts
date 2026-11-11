import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dealTrack, type PoolTrack } from '../src/audio/musicPool';
import { policeSedanGeometry, paddyWagonGeometry, trafficLivery } from '../src/render/policeVehicles';

describe('music pool', () => {
  it('lists each track on its own line and does not copy them into the artwork manifest', () => {
    const pool = JSON.parse(readFileSync('public/audio/music-pool.json', 'utf8')) as { tracks: PoolTrack[] };
    expect(pool.tracks.map((track) => track.title)).toEqual([
      'Smoky Night Order',
      'Smoky Bar Stabs',
      'Smoky Saloon Swing',
      'Dance Bar',
      'The Final Brass Hit',
      'The Last Order',
    ]);
    expect(pool.tracks.filter((track) => track.reel)).toHaveLength(1);
    const manifest = readFileSync('public/asset-manifest.json', 'utf8');
    for (const track of pool.tracks) expect(manifest.includes(track.src)).toBe(false);
  });

  it('does not play the same track twice in a row when others are waiting', () => {
    const tracks = [
      { id: 'a', title: 'A', src: 'a.mp3' },
      { id: 'b', title: 'B', src: 'b.mp3' },
      { id: 'c', title: 'C', src: 'c.mp3' },
    ];
    let previous = 'a';
    let bag: PoolTrack[] = [];
    for (let i = 0; i < 12; i++) {
      const dealt = dealTrack(tracks, previous, bag);
      expect(dealt.track.id).not.toBe(previous);
      previous = dealt.previousId;
      bag = dealt.remaining;
    }
  });
});

describe('police coachwork', () => {
  it('builds a sedan and a wagon, and marks some traffic cars as police', () => {
    expect(policeSedanGeometry(true, false).getAttribute('position').count).toBeGreaterThan(100);
    expect(paddyWagonGeometry(false).getAttribute('position').count).toBeGreaterThan(80);
    expect(policeSedanGeometry(true, true).getAttribute('position').count).toBeGreaterThan(100);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(trafficLivery(i * 3.5, i * 1.25, false));
    expect(seen.has('police') || seen.has('police-hero') || seen.has('paddy')).toBe(true);
    expect(trafficLivery(1, 2, true)).toBe('truck');
  });
});