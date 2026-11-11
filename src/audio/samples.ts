import { audio } from './audio';

/**
 * Recorded effects and street beds in public/audio. They load in the
 * background after the first gesture; until a sound has loaded, or if it
 * fails to, callers fall back to the synthesised version. The score is not
 * in this list. It is streamed from the music pool.
 */
export type SampleName =
  | 'shot-pistol' | 'shot-shotgun' | 'shot-rifle' | 'shot-tommy' | 'shot-twin' | 'explosion' | 'punch' | 'fall'
  | 'camera-flash' | 'horn' | 'siren' | 'car-speed' | 'car-door' | 'bed-street' | 'bed-fire' | 'ui-click' | 'ui-page' | 'ui-cash';

const ALL: SampleName[] = ['ui-click', 'ui-page', 'ui-cash', 'shot-pistol', 'shot-shotgun', 'shot-rifle', 'shot-tommy', 'shot-twin',
  'explosion', 'punch', 'fall', 'camera-flash', 'horn', 'siren', 'car-speed', 'car-door', 'bed-street', 'bed-fire'];

const buffers = new Map<SampleName, AudioBuffer>();
let loading: Promise<void> | null = null;

/** Fetch and decode every sample once, short sounds first; `loaded` hears of each. */
export function loadSamples(loaded?: (name: SampleName) => void): Promise<void> {
  const bus = audio.bus();
  if (!bus || loading) return loading ?? Promise.resolve();
  loading = (async () => {
    for (const name of ALL) {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}audio/${name}.mp3`);
        if (!res.ok) continue;
        buffers.set(name, await bus.ctx.decodeAudioData(await res.arrayBuffer()));
        loaded?.(name);
      } catch { /* the synthesised sound stands in */ }
    }
  })();
  return loading;
}

export function sample(name: SampleName): AudioBuffer | null { return buffers.get(name) ?? null; }

/** Play a loaded sample into `dest`; false if it is not loaded yet. */
export function playSample(name: SampleName, dest: AudioNode, gain = 1, rate = 1): boolean {
  const bus = audio.bus(), buf = buffers.get(name);
  if (!bus || !buf) return false;
  const src = bus.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
  const g = bus.ctx.createGain(); g.gain.value = gain;
  src.connect(g).connect(dest); src.start();
  return true;
}
