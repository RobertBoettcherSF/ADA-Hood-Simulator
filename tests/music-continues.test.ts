import { afterEach, describe, expect, it, vi } from 'vitest';
import { playScene } from '../src/audio/musicPool';

interface FakeAudio {
  src: string;
  loop: boolean;
  paused: boolean;
  volume: number;
  muted: boolean;
  preload: string;
  currentTime: number;
  error: null;
  dataset: Record<string, string>;
  onended: (() => void) | null;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: () => void;
}

const tracks = [
  ['menu', 'm1', 'm2'],
  ['planner', 'p1', 'p2', 'p3'],
  ['street', 's1', 's2'],
  ['action', 'a1', 'a2'],
  ['win', 'w1', 'w2'],
  ['loss', 'l1', 'l2'],
  ['credits', 'c1', 'c2'],
  ['tutorial', 't1', 't2'],
].flatMap(([category, ...ids]) => ids.map((id) => ({ id, title: id, src: `audio/${id}.mp3`, category })));

const created: FakeAudio[] = [];
let failPlays = 0;
let now = 0;

function live(): FakeAudio {
  const node = created.filter((item) => !item.paused && item.src).at(-1);
  if (!node) throw new Error('the score went silent');
  return node;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

async function endTrack(): Promise<string> {
  const node = live();
  const id = node.dataset.trackId;
  node.onended?.();
  await settle();
  return id;
}

describe('continuous score', () => {
  const originalAudio = globalThis.Audio;
  const originalFetch = globalThis.fetch;
  const originalRaf = globalThis.requestAnimationFrame;
  const createObjectUrl = globalThis.URL.createObjectURL;

  afterEach(() => {
    globalThis.Audio = originalAudio;
    globalThis.fetch = originalFetch;
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.URL.createObjectURL = createObjectUrl;
    vi.restoreAllMocks();
  });

  it('plays another track when a song ends, including after the street returns to planning, and skips a blocked start', async () => {
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    globalThis.requestAnimationFrame = (callback) => {
      now += 2000;
      callback(now);
      return 1;
    };
    globalThis.URL.createObjectURL = () => `blob:${Math.random()}`;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('music-pool.json')) return { ok: true, json: async () => ({ tracks }) };
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    }) as unknown as typeof fetch;
    globalThis.Audio = class {
      src = '';
      loop = false;
      paused = true;
      volume = 1;
      muted = false;
      preload = 'auto';
      currentTime = 0;
      error = null;
      dataset: Record<string, string> = {};
      onended: (() => void) | null = null;
      constructor() { created.push(this as unknown as FakeAudio); }
      play() {
        if (failPlays > 0) {
          failPlays -= 1;
          return Promise.reject(new Error('play was blocked'));
        }
        this.paused = false;
        this.currentTime = 1;
        return Promise.resolve();
      }
      pause() { this.paused = true; }
      addEventListener() {}
    } as unknown as typeof Audio;

    const cues = ['menu', 'week', 'planning', 'action', 'win', 'loss', 'credits', 'tutorial'] as const;
    for (const cue of cues) {
      await playScene(cue);
      const previous = await endTrack();
      const next = live();
      expect(next.paused, cue).toBe(false);
      expect(next.dataset.trackId, cue).not.toBe(previous);
      expect(next.loop, cue).toBe(false);
    }

    await playScene('week');
    await playScene('planning');
    const planner = live().dataset.trackId;
    failPlays = 1;
    const ended = await endTrack();
    const carried = live();
    expect(ended).toBe(planner);
    expect(carried.paused).toBe(false);
    expect(carried.dataset.trackId).not.toBe(planner);
  });
});
