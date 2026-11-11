/**
 * Streamed score. One new track is one object in public/audio/music-pool.json.
 * The files are played by <audio> elements, so a phone streams them and they
 * are never copied into the city folder.
 */
import { readLocalData } from '../app/localData';

export type MusicCategory =
  | 'menu' | 'planner' | 'street' | 'action' | 'win' | 'loss'
  | 'credits' | 'tutorial' | 'general' | 'reel';

export type MusicScene =
  | 'menu' | 'planner' | 'street' | 'action' | 'win' | 'loss'
  | 'credits' | 'tutorial' | 'reel';

/** What the screens ask for. Planning and the working week map onto planner and street. */
export type MusicCue = 'menu' | 'planning' | 'week' | 'action' | 'win' | 'loss' | 'credits' | 'tutorial';

export interface PoolTrack {
  id: string;
  title: string;
  src: string;
  category?: MusicCategory;
  /** The loading reel's beat grid is written for this track. */
  reel?: boolean;
}

const SCENE: Record<MusicCue, MusicScene> = {
  menu: 'menu',
  planning: 'planner',
  week: 'street',
  action: 'action',
  win: 'win',
  loss: 'loss',
  credits: 'credits',
  tutorial: 'tutorial',
};

const FADE_MS = 1200;

let tracks: PoolTrack[] = [];
let loading: Promise<PoolTrack[]> | null = null;
const bags = new Map<string, PoolTrack[]>();
const lastByScene = new Map<string, string>();
const sequenceAt = new Map<string, number>();
const held = new Map<string, PoolTrack>();
let nodes: HTMLAudioElement[] = [];
let active = 0;
let fadeToken = 0;
let currentScene: MusicScene | null = null;
let pending: MusicScene | null = null;
let starting: MusicScene | null = null;
let pausedScene: MusicScene | null = null;
let parked: { index: number; scene: MusicScene } | null = null;
const mixed = new Set<HTMLAudioElement>();
const fading = new Set<HTMLAudioElement>();
const listeners = new Set<(title: string) => void>();
let announced = '';
const objectUrls = new Map<string, string>();
let lastError = '';

const MEDIA_ERROR = ['', 'aborted', 'network', 'decode', 'source not supported'];

function noteMusicError(message: string): void {
  lastError = message;
}

function formatMediaError(node: HTMLAudioElement | undefined): string {
  const err = node?.error;
  if (!err) return '';
  return `code ${err.code} ${MEDIA_ERROR[err.code] ?? ''}`.trim();
}

/**
 * Githack sends mp3 requests on to GitHub, and that response is not an audio
 * content type. An <audio> element then refuses the file. Fetch the bytes
 * (the same path the click sounds use) and hand the element a blob whose
 * type is audio, so the type check is ours.
 */
async function mediaUrl(src: string): Promise<string> {
  const cached = objectUrls.get(src);
  if (cached) return cached;
  const response = await fetch(`${import.meta.env.BASE_URL}${src}`);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
  const type = src.endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg';
  const blob = new Blob([await response.arrayBuffer()], { type });
  const url = URL.createObjectURL(blob);
  objectUrls.set(src, url);
  return url;
}

function watchNode(node: HTMLAudioElement): void {
  if (node.dataset.musicWatch === '1') return;
  node.dataset.musicWatch = '1';
  node.addEventListener('error', () => {
    const detail = formatMediaError(node);
    if (detail) noteMusicError(detail);
  });
}

/** Category, track, and the last media error, for the debug report. */
export function musicStatusLines(): string[] {
  const node = nodes[active];
  const error = lastError || formatMediaError(node) || '(none)';
  return [
    `Category: ${currentScene ?? '(none)'}`,
    `Track: ${node?.dataset.trackTitle || '(none)'}${node?.dataset.trackId ? ` (${node.dataset.trackId})` : ''}`,
    `Playing: ${node && !node.paused && !node.ended ? 'yes' : 'no'}`,
    `Ready state: ${node ? String(node.readyState) : '-'}`,
    `Error: ${error}`,
  ];
}

export function onNowPlaying(listener: (title: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function announce(title: string): void {
  if (!title || title === announced) return;
  announced = title;
  for (const listener of listeners) listener(title);
}

export function dealTrack(list: PoolTrack[], previousId: string, remaining: PoolTrack[]): { track: PoolTrack; remaining: PoolTrack[]; previousId: string } {
  let nextBag = remaining;
  if (!nextBag.length) {
    const rest = list.filter((track) => track.id !== previousId);
    nextBag = shuffle(rest.length ? rest : list);
  }
  const track = nextBag[nextBag.length - 1];
  return { track, remaining: nextBag.slice(0, -1), previousId: track.id };
}

/** The songs a screen may play. Planner and street each add the general tracks. */
export function tracksFor(scene: MusicScene, all: PoolTrack[]): PoolTrack[] {
  const of = (category: MusicCategory) => all.filter((track) => track.category === category || (category === 'reel' && track.reel));
  if (scene === 'planner') return [...of('planner'), ...of('general')];
  if (scene === 'street') return [...of('street'), ...of('general')];
  return of(scene);
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

function loopOne(scene: MusicScene): boolean {
  return scene === 'menu' || scene === 'win' || scene === 'loss' || scene === 'action' || scene === 'reel';
}

export async function loadMusicPool(): Promise<PoolTrack[]> {
  if (tracks.length || typeof fetch === 'undefined') return tracks;
  if (!loading) {
    loading = (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}audio/music-pool.json`);
        if (!response.ok) return tracks;
        const body = await response.json() as { tracks?: PoolTrack[] };
        tracks = (body.tracks ?? []).filter((track) => track.id && track.src);
      } catch { /* the procedural band stands in */ }
      return tracks;
    })();
  }
  return loading;
}

export function reelTheme(): PoolTrack | undefined {
  return tracks.find((track) => track.reel || track.category === 'reel');
}

/** The reel stays on its beat-mapped theme and loops it. Cuts follow currentTime. */
export async function playReelQueue(node: HTMLAudioElement): Promise<void> {
  await loadMusicPool();
  const theme = reelTheme();
  if (!theme) return;
  node.loop = true;
  node.preload = 'auto';
  node.dataset.trackTitle = theme.title;
  node.dataset.trackId = theme.id;
  watchNode(node);
  try {
    node.src = await mediaUrl(theme.src);
  } catch (error) {
    noteMusicError(error instanceof Error ? error.message : 'could not fetch the reel theme');
    return;
  }
  node.onended = null;
  applyMusicMix(node);
  announce(theme.title);
}

function ensureNodes(): void {
  if (nodes.length || typeof Audio === 'undefined') return;
  nodes = [0, 1].map(() => {
    const node = new Audio();
    node.preload = 'auto';
    watchNode(node);
    mixed.add(node);
    return node;
  });
}

function remember(node: HTMLAudioElement, track: PoolTrack): void {
  node.dataset.trackTitle = track.title;
  node.dataset.trackId = track.id;
}

/** Volume and mute from the city settings, for the pool and the loading reel. */
export function applyMusicMix(node?: HTMLAudioElement | null): void {
  if (node) mixed.add(node);
  const prefs = readLocalData().audio;
  const list = node ? [node] : [...mixed];
  for (const target of list) {
    target.muted = prefs.musicMuted === true;
    if (!fading.has(target)) target.volume = Math.max(0, Math.min(1, prefs.music));
  }
}

export function musicPoolPlaying(): boolean {
  const node = nodes[active];
  return !!node && !node.paused && node.currentTime > 0;
}

function bindEnd(node: HTMLAudioElement, scene: MusicScene): void {
  node.onended = () => {
    if (currentScene !== scene || node !== nodes[active] || loopOne(scene)) return;
    void advance(scene);
  };
}

function choose(scene: MusicScene, list: PoolTrack[]): PoolTrack {
  if (loopOne(scene)) {
    const kept = held.get(scene);
    if (kept && list.some((track) => track.id === kept.id)) return kept;
    const track = list[Math.floor(Math.random() * list.length)];
    held.set(scene, track);
    return track;
  }
  if (scene === 'credits' || scene === 'tutorial') {
    const at = sequenceAt.get(scene) ?? 0;
    const track = list[at % list.length];
    sequenceAt.set(scene, at + 1);
    return track;
  }
  const dealt = dealTrack(list, lastByScene.get(scene) ?? '', bags.get(scene) ?? []);
  bags.set(scene, dealt.remaining);
  lastByScene.set(scene, dealt.previousId);
  return dealt.track;
}

async function advance(scene: MusicScene): Promise<void> {
  const list = tracksFor(scene, tracks);
  if (!list.length || currentScene !== scene) return;
  await fadeTo(choose(scene, list), false, scene);
}

async function fadeTo(track: PoolTrack, loop: boolean, scene: MusicScene): Promise<void> {
  ensureNodes();
  if (!nodes.length) { announce(track.title); return; }
  const token = ++fadeToken;
  const nextIndex = 1 - active;
  const next = nodes[nextIndex];
  const prev = nodes[active];
  next.loop = loop;
  next.preload = 'auto';
  remember(next, track);
  let url: string;
  try {
    url = await mediaUrl(track.src);
  } catch (error) {
    noteMusicError(error instanceof Error ? error.message : 'could not fetch the track');
    announce(track.title);
    return;
  }
  if (token !== fadeToken || pending !== scene) return;
  next.src = url;
  applyMusicMix(next);
  const goal = next.volume;
  next.volume = 0;
  bindEnd(next, scene);
  try { await next.play(); } catch (error) {
    noteMusicError(formatMediaError(next) || (error instanceof Error ? error.message : 'play was blocked'));
    announce(track.title);
    return;
  }
  if (token !== fadeToken || pending !== scene) { next.pause(); return; }
  await ramp(prev, next, goal, token, nextIndex, track.title);
}

async function resumeParked(scene: MusicScene): Promise<void> {
  if (!parked || parked.scene !== scene) return;
  const next = nodes[parked.index];
  parked = null;
  if (!next?.src) return;
  const token = ++fadeToken;
  const prev = nodes[active];
  applyMusicMix(next);
  const goal = next.volume;
  bindEnd(next, scene);
  try { await next.play(); } catch { return; }
  if (token !== fadeToken) { next.pause(); return; }
  await ramp(prev, next, goal, token, nodes.indexOf(next), next.dataset.trackTitle ?? '');
}

function ramp(prev: HTMLAudioElement, next: HTMLAudioElement, goal: number, token: number, nextIndex: number, title: string): Promise<void> {
  announce(title);
  fading.add(prev);
  fading.add(next);
  const startVol = prev.volume;
  const t0 = performance.now();
  return new Promise((resolve) => {
    const step = () => {
      if (token !== fadeToken) { fading.delete(prev); fading.delete(next); resolve(); return; }
      const t = Math.min(1, (performance.now() - t0) / FADE_MS);
      const muted = readLocalData().audio.musicMuted === true;
      prev.volume = muted ? 0 : startVol * (1 - t);
      next.volume = muted ? 0 : goal * t;
      if (t < 1) requestAnimationFrame(step);
      else {
        prev.pause();
        prev.onended = null;
        fading.delete(prev);
        fading.delete(next);
        active = nextIndex;
        applyMusicMix(next);
        resolve();
      }
    };
    step();
  });
}

/** Start the score for a screen. The same screen does not cut off a song already playing. */
export async function playScene(cue: MusicCue): Promise<void> {
  const scene = SCENE[cue];
  pending = scene;
  await loadMusicPool();
  if (pending !== scene) return;
  const list = tracksFor(scene, tracks);
  if (!list.length) return;
  ensureNodes();
  if (currentScene === scene && (musicPoolPlaying() || starting === scene)) {
    applyMusicMix();
    return;
  }
  const pausedNode = nodes[active];
  if (pausedScene === scene && pausedNode?.src && !pausedNode.error) {
    currentScene = scene;
    pausedScene = null;
    bindEnd(pausedNode, scene);
    applyMusicMix(pausedNode);
    try {
      await pausedNode.play();
      return;
    } catch (error) {
      noteMusicError(formatMediaError(pausedNode) || (error instanceof Error ? error.message : 'play was blocked'));
    }
  }
  pausedScene = null;
  if (parked && scene === parked.scene) {
    currentScene = scene;
    await resumeParked(scene);
    return;
  }
  if (scene === 'action' && (currentScene === 'street' || currentScene === 'tutorial') && nodes[active]?.src) {
    parked = { index: active, scene: currentScene };
  } else if (scene !== 'action') {
    parked = null;
  }
  if ((scene === 'credits' || scene === 'tutorial') && currentScene !== scene) sequenceAt.set(scene, 0);
  if (scene === 'action' && currentScene !== 'action') held.delete('action');
  currentScene = scene;
  starting = scene;
  const track = choose(scene, list);
  try {
    await fadeTo(track, loopOne(scene), scene);
  } finally {
    if (starting === scene) starting = null;
  }
}

export function stopMusicPool(): void {
  fadeToken++;
  pending = null;
  pausedScene = currentScene;
  currentScene = null;
  for (const node of nodes) {
    node.pause();
    node.onended = null;
    fading.delete(node);
  }
  applyMusicMix();
}
