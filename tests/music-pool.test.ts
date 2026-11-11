import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dealTrack, musicStatusLines, tracksFor, type PoolTrack } from '../src/audio/musicPool';
import { streetActionHot } from '../src/audio/streetAction';
import { presentAttack } from '../src/sim/presentationEvents';
import type { Person, WorldState } from '../src/sim/types';
import { policeSedanGeometry, paddyWagonGeometry, trafficLivery } from '../src/render/policeVehicles';

describe('music pool', () => {
  it('lists each track on its own line and does not copy them into the artwork manifest', () => {
    const pool = JSON.parse(readFileSync('public/audio/music-pool.json', 'utf8')) as { tracks: PoolTrack[] };
    const count = (category: string) => pool.tracks.filter((track) => track.category === category).length;
    expect(count('menu')).toBe(4);
    expect(count('planner')).toBe(6);
    expect(count('street')).toBe(6);
    expect(count('action')).toBe(6);
    expect(count('win')).toBe(2);
    expect(count('loss')).toBe(2);
    expect(count('credits')).toBe(2);
    expect(count('tutorial')).toBe(2);
    expect(count('general')).toBe(5);
    expect(count('reel')).toBe(1);
    expect(tracksFor('planner', pool.tracks)).toHaveLength(11);
    expect(tracksFor('street', pool.tracks)).toHaveLength(11);
    expect(tracksFor('menu', pool.tracks)).toHaveLength(4);
    expect(tracksFor('reel', pool.tracks).map((track) => track.title)).toEqual(['Smoky Night Order']);
    expect(pool.tracks.map((track) => track.title)).toEqual(expect.arrayContaining([
      'Back Door Knock', 'Swing for the Alderman', 'Gin Joint Jitterbug', 'Curtain for Capone', 'Last Round on the House',
      'Goodnight, Saint Volstead',
    ]));
    expect(pool.tracks.map((track) => track.title).join('\n')).not.toMatch(/Smoky Bar Stabs|Smoky Saloon Swing|Dance Bar|The Final Brass Hit|The Last Order|New Temperance/);
    const manifest = readFileSync('public/asset-manifest.json', 'utf8');
    for (const track of pool.tracks) expect(manifest.includes(track.src)).toBe(false);
    for (const track of pool.tracks) expect(existsSync('public/' + track.src)).toBe(true);
  });

  it('treats a raid or a recent shooting as action on the street', () => {
    const quiet = { phase: 'planning', week: 1, minute: 10, orders: {}, people: {} } as unknown as WorldState;
    expect(streetActionHot(quiet)).toBe(false);
    const raid = { phase: 'week', week: 1, minute: 10, orders: { 1: { type: 'raid', state: 'executing' } }, people: {} } as unknown as WorldState;
    expect(streetActionHot(raid)).toBe(true);
    const queued = { phase: 'week', week: 1, minute: 10, orders: { 1: { type: 'kill', state: 'queued' } }, people: {} } as unknown as WorldState;
    expect(streetActionHot(queued)).toBe(false);
    const shooting = { phase: 'week', week: 2, minute: 4, orders: {}, people: {} } as unknown as WorldState;
    presentAttack(shooting, { id: 1, pos: { x: 0, y: 0 } } as Person, { id: 2, pos: { x: 1, y: 1 } } as Person, 'pistol', true);
    expect(streetActionHot(shooting)).toBe(true);
    shooting.minute = 8;
    expect(streetActionHot(shooting)).toBe(false);
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

describe('music status', () => {
  it('names the category and says when nothing is playing', () => {
    const lines = musicStatusLines();
    expect(lines[0]).toBe('Category: (none)');
    expect(lines.join('\n')).toContain('Playing: no');
    expect(lines.join('\n')).toContain('Error: (none)');
    expect(lines.join('\n')).toContain('Reel: (none)');
    expect(lines.join('\n')).toContain('Reel playing: no');
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