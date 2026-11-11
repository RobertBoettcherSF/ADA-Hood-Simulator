/**
 * Streamed score. One new track is one line in public/audio/music-pool.json.
 * The files are played by an <audio> element, so a phone streams them and
 * they are never copied into the city folder.
 */
import { readLocalData } from '../app/localData';

export interface PoolTrack {
  id: string;
  title: string;
  src: string;
  /** The loading reel's beat grid is written for this track. */
  reel?: boolean;
}

let tracks: PoolTrack[] = [];
let bag: PoolTrack[] = [];
let lastId = '';
let element: HTMLAudioElement | null = null;
let started = false;

export function dealTrack(list: PoolTrack[], previousId: string, remaining: PoolTrack[]): { track: PoolTrack; remaining: PoolTrack[]; previousId: string } {
  let nextBag = remaining;
  if (!nextBag.length) {
    const rest = list.filter((track) => track.id !== previousId);
    nextBag = shuffle(rest.length ? rest : list);
  }
  const track = nextBag[nextBag.length - 1];
  return { track, remaining: nextBag.slice(0, -1), previousId: track.id };
}

function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

export async function loadMusicPool(): Promise<PoolTrack[]> {
  if (tracks.length || typeof fetch === 'undefined') return tracks;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}audio/music-pool.json`);
    if (!response.ok) return tracks;
    const body = await response.json() as { tracks?: PoolTrack[] };
    tracks = (body.tracks ?? []).filter((track) => track.id && track.src);
  } catch { /* the procedural band stands in */ }
  return tracks;
}

export function reelTheme(): PoolTrack | undefined {
  return tracks.find((track) => track.reel) ?? tracks[0];
}

function poolElement(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!element) {
    element = new Audio();
    element.preload = 'none';
    element.addEventListener('ended', () => { void playMusicPool(true); });
  }
  return element;
}

/** Volume and mute from the city settings, for the pool and the loading reel. */
export function applyMusicMix(node?: HTMLAudioElement | null): void {
  const target = node ?? element;
  if (!target) return;
  const prefs = readLocalData().audio;
  target.muted = prefs.musicMuted === true;
  target.volume = Math.max(0, Math.min(1, prefs.music));
}

export function musicPoolPlaying(): boolean {
  return !!element && !element.paused && element.currentTime > 0;
}

/** Start or advance the shared pool. A screen change does not cut off the song. */
export async function playMusicPool(forceNext = false): Promise<void> {
  await loadMusicPool();
  if (!tracks.length) return;
  const node = poolElement();
  if (!node) return;
  if (!forceNext && musicPoolPlaying()) {
    applyMusicMix(node);
    return;
  }
  const dealt = dealTrack(tracks, lastId, bag);
  bag = dealt.remaining;
  lastId = dealt.previousId;
  node.src = `${import.meta.env.BASE_URL}${dealt.track.src}`;
  applyMusicMix(node);
  started = true;
  try { await node.play(); } catch { /* a gesture or the speaker button retries */ }
}

export function stopMusicPool(): void {
  if (!element) return;
  element.pause();
  started = false;
}

export function poolHasStarted(): boolean {
  return started;
}
