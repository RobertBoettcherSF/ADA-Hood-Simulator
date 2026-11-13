/**
 * Streamed score. One new track is one object in public/audio/music-pool.json.
 * The files are played by <audio> elements, so a phone streams them and they
 * are never copied into the city folder.
 */
import { readLocalData } from '../app/localData';
import { registerProbe } from '../sim/memProbe';
import { artPresent, artUrl } from '../app/artBase';

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
registerProbe('music', () => ({ tracks: tracks.length, bags: bags.size, nodes: nodes.length, mixed: mixed.size, fading: fading.size, listeners: listeners.size, objectUrls: objectUrls.size })); // 1.2.28
/** The loading reel plays on its own element, not on the two pool players. */
let reelNode: HTMLAudioElement | null = null;

const MEDIA_ERROR = ['', 'aborted', 'network', 'decode', 'source not supported'];
/** Pauses before each fetch of a music file: now, then two retries. */
const MEDIA_RETRY_MS = [0, 2000, 8000];

function noteMusicError(message: string): void {
  lastError = message;
}

function formatMediaError(node: HTMLAudioElement | null | undefined): string {
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
  const direct = artUrl(src);
  // Githack hands binary files on to raw.githubusercontent.com, which drops
  // requests when a page asks for a lot at once ("Failed to fetch"). Try
  // again after a pause before giving up on the track.
  let failure: unknown = null;
  for (const wait of MEDIA_RETRY_MS) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const response = await fetch(direct);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
      const type = src.endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg';
      const blob = new Blob([await response.arrayBuffer()], { type });
      const url = URL.createObjectURL(blob);
      objectUrls.set(src, url);
      if (lastError) lastError = '';
      return url;
    } catch (error) {
      failure = error;
    }
  }
  // GitHub now sends mp3 files as audio/mpeg, so the element can stream the
  // file itself. Keep the reason for the debug report.
  noteMusicError(`${failure instanceof Error ? failure.message : 'fetch failed'} (${src}); streaming it instead`);
  return direct;
}

function watchNode(node: HTMLAudioElement): void {
  if (node.dataset.musicWatch === '1') return;
  node.dataset.musicWatch = '1';
  node.addEventListener('error', () => {
    const detail = formatMediaError(node);
    if (detail) noteMusicError(detail);
  });
}

function audible(node: HTMLAudioElement | null | undefined): boolean {
  return !!node && node.src !== '' && !node.paused && !node.ended;
}

function trackName(node: HTMLAudioElement | null | undefined): string {
  if (!node?.dataset.trackTitle) return '(none)';
  return `${node.dataset.trackTitle}${node.dataset.trackId ? ` (${node.dataset.trackId})` : ''}`;
}

/** Category, track, and the last media error, for the debug report. The reel has its own player. */
export function musicStatusLines(): string[] {
  const pool = nodes[active];
  const reelAudible = audible(reelNode);
  const node = reelAudible ? reelNode : pool;
  const error = lastError || formatMediaError(node) || '(none)';
  const lines = [
    `Category: ${reelAudible ? 'reel' : (currentScene ?? '(none)')}`,
    `Track: ${trackName(node)}`,
    `Playing: ${audible(node) ? 'yes' : 'no'}`,
    `Ready state: ${node ? String(node.readyState) : '-'}`,
    `Error: ${error}`,
    `Reel: ${trackName(reelNode)}`,
    `Reel playing: ${reelAudible ? 'yes' : 'no'}`,
  ];
  if (reelAudible) {
    lines.push(`Pool category: ${currentScene ?? '(none)'}`);
    lines.push(`Pool playing: ${audible(pool) ? 'yes' : 'no'}`);
  }
  return lines;
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

/** The reel is one theme on its own element. Every other category plays the next track when a song ends. */
function sequences(scene: MusicScene): boolean {
  return scene === 'credits' || scene === 'tutorial';
}

export async function loadMusicPool(): Promise<PoolTrack[]> {
  if (tracks.length || typeof fetch === 'undefined') return tracks;
  if (!loading) {
    loading = (async () => {
      try {
        // 1.2.29: with no art present there is no score to stream.
        if (!(await artPresent())) return tracks;
        let response = await fetch(artUrl('audio/music-pool.json')).catch(() => null);
        if (!response?.ok) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          response = await fetch(artUrl('audio/music-pool.json'));
        }
        if (!response.ok) return tracks;
        const body = await response.json() as { tracks?: PoolTrack[] };
        tracks = (body.tracks ?? []).filter((track) => track.id && track.src);
      } catch { /* the procedural band stands in */ }
      if (!tracks.length) loading = null;
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
  reelNode = node;
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

let reelElement: HTMLAudioElement | null = null;

/**
 * The loading theme's player. It belongs to this module, not to the reel's
 * picture, so the theme keeps going when the picture gives way to the
 * Loading card, and only stops when the player skips or the menu's score
 * takes over.
 */
export function reelAudioElement(): HTMLAudioElement {
  if (!reelElement) {
    reelElement = new Audio();
    reelElement.preload = 'none';
    reelElement.dataset.audioSlot = 'loading-reel';
    (reelElement as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  }
  return reelElement;
}

/** Fade the loading theme out (the menu's score is starting, or the player skipped). */
export function fadeOutReel(ms = 600): void {
  const node = reelNode;
  if (!node || node.paused) return;
  fading.add(node);
  const from = node.volume, t0 = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - t0) / ms);
    node.volume = from * (1 - t);
    if (t < 1 && !node.paused) requestAnimationFrame(step);
    else { node.pause(); fading.delete(node); applyMusicMix(node); }
  };
  if (typeof requestAnimationFrame === 'undefined') { node.pause(); fading.delete(node); return; }
  step();
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

let continuing = false;

function bindEnd(node: HTMLAudioElement, scene: MusicScene): void {
  node.onended = () => {
    if (continuing || currentScene !== scene || node !== nodes[active]) return;
    pending = scene;
    void follow(scene);
  };
}

function choose(scene: MusicScene, list: PoolTrack[]): PoolTrack {
  if (sequences(scene)) {
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

function still(scene: MusicScene, token: number): boolean {
  return token === fadeToken && (pending === scene || currentScene === scene);
}

let unlockScene: MusicScene | null = null;
let unlockArmed = false;

function armUnlock(scene: MusicScene): void {
  unlockScene = scene;
  if (unlockArmed || typeof window === 'undefined') return;
  unlockArmed = true;
  const go = () => {
    const scene = unlockScene;
    if (!scene) return;
    unlockScene = null;
    const cue: MusicCue = scene === 'planner' ? 'planning' : scene === 'street' ? 'week' : scene === 'reel' ? 'menu' : scene;
    void playScene(cue);
  };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
}

async function startNode(node: HTMLAudioElement): Promise<boolean> {
  try {
    await node.play();
    unlockScene = null;
    return true;
  } catch (error) {
    noteMusicError(formatMediaError(node) || (error instanceof Error ? error.message : 'play was blocked'));
    if (currentScene) armUnlock(currentScene);
    return false;
  }
}

/** The song that just finished, and a song that failed to open, both hand the same player the next track. */
async function follow(scene: MusicScene, skips = 0): Promise<void> {
  if (continuing || skips >= 8 || currentScene !== scene) return;
  const list = tracksFor(scene, tracks);
  if (!list.length) return;
  continuing = true;
  pending = scene;
  try {
    const result = await fadeTo(choose(scene, list), scene, true);
    if (result === 'failed' && currentScene === scene) {
      continuing = false;
      await follow(scene, skips + 1);
    }
  } finally {
    continuing = false;
  }
}

async function fadeTo(track: PoolTrack, scene: MusicScene, sameNode = false): Promise<'ok' | 'stale' | 'failed'> {
  ensureNodes();
  if (!nodes.length) { announce(track.title); return 'failed'; }
  const token = ++fadeToken;
  const index = sameNode ? active : 1 - active;
  const next = nodes[index];
  const prev = nodes[active];
  next.loop = false;
  next.preload = 'auto';
  remember(next, track);
  let url: string;
  try {
    url = await mediaUrl(track.src);
  } catch (error) {
    noteMusicError(error instanceof Error ? error.message : 'could not fetch the track');
    return 'failed';
  }
  if (!still(scene, token)) return 'stale';
  const cross = !sameNode && prev !== next;
  const begun = await playUrl(next, url, scene, token, cross);
  if (begun === 'ok' && cross) {
    const goal = readLocalData().audio.musicMuted ? 0 : Math.max(0, Math.min(1, readLocalData().audio.music));
    await ramp(prev, next, goal, token, index, track.title);
    return still(scene, token) ? 'ok' : 'stale';
  }
  if (begun === 'failed' && !sameNode && prev !== next && prev) {
    prev.loop = false;
    remember(prev, track);
    const recovered = await playUrl(prev, url, scene, token);
    if (recovered !== 'ok') return recovered;
    announce(track.title);
    applyMusicMix(prev);
    return 'ok';
  }
  if (begun !== 'ok') return begun;
  announce(track.title);
  active = index;
  applyMusicMix(next);
  return 'ok';
}

/** Point one element at a track and start it. A rejection here is a failed open, not a new silence. */
async function playUrl(node: HTMLAudioElement, url: string, scene: MusicScene, token: number, quiet = false): Promise<'ok' | 'stale' | 'failed'> {
  if (!still(scene, token)) return 'stale';
  node.src = url;
  applyMusicMix(node);
  if (quiet) node.volume = 0;
  bindEnd(node, scene);
  if (!await startNode(node)) return 'failed';
  if (!still(scene, token)) { node.pause(); return 'stale'; }
  return 'ok';
}

async function resumeParked(scene: MusicScene): Promise<void> {
  if (!parked || parked.scene !== scene) return;
  const next = nodes[parked.index];
  parked = null;
  if (!next?.src) { await follow(scene); return; }
  const token = ++fadeToken;
  const prev = nodes[active];
  applyMusicMix(next);
  const goal = next.volume;
  bindEnd(next, scene);
  if (!await startNode(next)) { await follow(scene); return; }
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
/** Game scenes that may share one running track while the music is held. */
const HELD_SCENES = new Set<MusicScene>(['planner', 'street', 'action']);
let holding = false;

/**
 * Auto Test flips between the desk and the street every few seconds. While it
 * runs, the playing track is held: each song plays to its end, and the next
 * one comes from whichever game scene is current then. Win and loss still cut in.
 */
export function setMusicHold(on: boolean): void {
  holding = on;
}

export async function playScene(cue: MusicCue): Promise<void> {
  const scene = SCENE[cue];
  if (holding && HELD_SCENES.has(scene) && currentScene && HELD_SCENES.has(currentScene) && (musicPoolPlaying() || starting != null)) {
    if (currentScene !== scene) {
      currentScene = scene;
      pending = scene;
      if (nodes[active]) bindEnd(nodes[active], scene);
    }
    return;
  }
  pending = scene;
  // The loading theme hands over to the screen's own score.
  fadeOutReel();
  await loadMusicPool();
  if (pending !== scene) return;
  const list = tracksFor(scene, tracks);
  if (!list.length) return;
  ensureNodes();
  if (currentScene === scene && (musicPoolPlaying() || starting === scene)) {
    if (nodes[active]) bindEnd(nodes[active], scene);
    applyMusicMix();
    return;
  }
  const pausedNode = nodes[active];
  if (pausedScene === scene && pausedNode?.src && !pausedNode.error) {
    currentScene = scene;
    pausedScene = null;
    pending = scene;
    bindEnd(pausedNode, scene);
    applyMusicMix(pausedNode);
    if (await startNode(pausedNode)) return;
    await follow(scene);
    return;
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
  currentScene = scene;
  starting = scene;
  const track = choose(scene, list);
  try {
    const started = await fadeTo(track, scene, false);
    if (started === 'failed' && currentScene === scene) await follow(scene);
  } finally {
    if (starting === scene) starting = null;
  }
}

export function stopMusicPool(): void {
  fadeOutReel();
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
