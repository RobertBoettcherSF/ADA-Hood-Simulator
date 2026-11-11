/**
 * The game's audio. Recorded sounds and score (samples.ts, public/audio) load
 * in the background after the first gesture; everything also has a
 * synthesised Web Audio stand-in, used until the recordings arrive or if they
 * cannot be loaded: a 1920s small band for the score (jazz.ts), the street's
 * sounds (streetSound.ts) and the interface's cues.
 */
import { JazzBand } from './jazz';
import { patchLocalData, readLocalData } from '../app/localData';
import { applyMusicMix, playMusicPool, stopMusicPool } from './musicPool';
import { loadSamples, playSample, type SampleName } from './samples';

/** Which piece of score is wanted: the menu's ballad, planning's speakeasy band, or the week's tension. */
export type MusicTrack = 'menu' | 'planning' | 'week';
const CROSSFADE = 1.6;
/** Sound settings kept in the world folder, with the original's two music
 * switches: music at the menus (InterfaceAmbient) and in the game (GameAmbient). */
interface AudioPrefs { music: number; sfx: number; menuMusic: boolean; gameMusic: boolean; musicMuted: boolean; reelMuted?: boolean }

function readPrefs(): AudioPrefs {
  const saved = readLocalData().audio;
  return {
    music: saved.music,
    sfx: saved.sfx,
    menuMusic: saved.menuMusic,
    gameMusic: saved.gameMusic,
    musicMuted: saved.musicMuted === true || saved.reelMuted === true,
  };
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private band: JazzBand | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private started = false;
  private track: MusicTrack | null = null;
  private playing: { track: MusicTrack; src: AudioBufferSourceNode; gain: GainNode } | null = null;

  private prefs = readPrefs();
  musicVolume = this.prefs.music;
  sfxVolume = this.prefs.sfx;
  private mixListeners = new Set<() => void>();
  get menuMusic(): boolean { return this.prefs.menuMusic; }
  get gameMusic(): boolean { return this.prefs.gameMusic; }
  get musicMuted(): boolean { return this.prefs.musicMuted; }

  onMix(listener: () => void): () => void {
    this.mixListeners.add(listener);
    return () => this.mixListeners.delete(listener);
  }

  private emitMix(): void {
    applyMusicMix();
    for (const listener of this.mixListeners) listener();
  }

  /** Browsers require a gesture before audio can start. */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume * 0.5;
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.ctx.destination);

      const len = 2 * this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
      // Recordings arrive in the background; the score switches over when its track has.
      void loadSamples(() => { if (this.track) this.music(this.track); });
    } catch {
      this.ctx = null;
    }
  }

  /** The live context and effects bus, for the street sound layer (streetSound.ts). */
  bus(): { ctx: AudioContext; out: GainNode; noise: AudioBuffer } | null {
    return this.ctx && this.sfxGain && this.noiseBuffer ? { ctx: this.ctx, out: this.sfxGain, noise: this.noiseBuffer } : null;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.musicGain) this.musicGain.gain.value = this.prefs.musicMuted ? 0 : v * 0.5;
    this.savePrefs({ music: v });
    this.emitMix();
  }

  /** One mute for the loading reel and the desk score. */
  setMusicMuted(muted: boolean): void {
    this.savePrefs({ musicMuted: muted, reelMuted: muted });
    if (this.musicGain) this.musicGain.gain.value = muted ? 0 : this.musicVolume * 0.5;
    this.emitMix();
    if (muted) stopMusicPool();
    else if (this.track) void playMusicPool();
  }

  toggleMusicMuted(): boolean {
    this.setMusicMuted(!this.prefs.musicMuted);
    return this.prefs.musicMuted;
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = v;
    if (this.sfxGain) this.sfxGain.gain.value = v;
    this.savePrefs({ sfx: v });
  }

  /** The original's music switches; the score follows at once. */
  setMusicPlaces(places: { menuMusic?: boolean; gameMusic?: boolean }): void {
    this.savePrefs(places);
    const track = this.track;
    if (track) { this.track = null; this.music(track); }
  }

  /** Apply prefs loaded from the world folder after this engine was constructed. */
  loadStored(): void {
    this.prefs = readPrefs();
    this.musicVolume = this.prefs.music;
    this.sfxVolume = this.prefs.sfx;
    if (this.musicGain) this.musicGain.gain.value = this.prefs.musicMuted ? 0 : this.musicVolume * 0.5;
    this.emitMix();
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
  }

  private savePrefs(change: Partial<AudioPrefs>): void {
    this.prefs = { ...this.prefs, ...change };
    patchLocalData({ audio: this.prefs });
  }

  private silenceMusic(): void {
    if (this.started) { this.band?.stop(); this.started = false; }
    this.fadeOutRecorded();
  }

  /**
   * Play a piece of the score, crossfading from whatever is playing. The
   * recorded track loops; until it has loaded, the procedural band plays.
   */
  music(track: MusicTrack): void {
    this.ensure();
    this.track = track;
    if (this.prefs.musicMuted || !(track === 'menu' ? this.prefs.menuMusic : this.prefs.gameMusic)) {
      this.silenceMusic();
      stopMusicPool();
      return;
    }
    void playMusicPool();
    this.silenceMusic();
  }

  /** The score for a game screen: the planning band, which music() may change with the phase. */
  startMusic(track: MusicTrack = 'planning'): void { this.music(track); }

  stopMusic(): void {
    this.band?.stop();
    this.started = false;
    this.fadeOutRecorded();
    stopMusicPool();
    this.track = null;
  }

  private fadeOutRecorded(): void {
    const p = this.playing;
    if (!p || !this.ctx) return;
    const now = this.ctx.currentTime;
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setValueAtTime(Math.max(0.0001, p.gain.gain.value), now);
    p.gain.gain.exponentialRampToValueAtTime(0.0001, now + CROSSFADE);
    p.src.stop(now + CROSSFADE + 0.05);
    this.playing = null;
  }

  /** A recorded interface cue straight to the effects bus; false if not loaded. */
  private cue(name: SampleName, gain: number): boolean {
    return !!this.sfxGain && playSample(name, this.sfxGain, gain, 0.97 + Math.random() * 0.06);
  }

  private noise(duration: number, filterFreq: number, gainValue: number, type: BiquadFilterType = 'bandpass'): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + duration);
    src.connect(filter).connect(gain).connect(this.sfxGain);
    src.start(now);
    src.stop(now + duration);
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'sine', gainValue = 0.18): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration);
  }

  click(): void {
    this.ensure();
    this.tone(880, 0.05, 'square', 0.06);
  }

  /** A bakelite plaque pressed home: a dull clack with a woody body. */
  plaque(): void {
    this.ensure();
    if (this.cue('ui-click', 0.55)) return;
    this.noise(0.06, 1800, 0.32, 'bandpass');
    this.tone(150, 0.08, 'triangle', 0.12);
  }

  /** The faint tick of a fingertip over a plaque or tab. */
  hover(): void {
    this.ensure();
    this.noise(0.025, 4200, 0.05, 'highpass');
  }

  /** A ledger page turned: a swept rustle of paper. */
  pageTurn(): void {
    this.ensure();
    if (this.cue('ui-page', 0.5)) return;
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(4200, now + 0.22);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0005, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.3);
    src.connect(filter).connect(gain).connect(this.sfxGain);
    src.start(now, Math.random());
    src.stop(now + 0.32);
  }

  gunshot(): void {
    this.ensure();
    if (this.cue('shot-pistol', 0.6)) return;
    this.noise(0.22, 1400, 0.55, 'lowpass');
    this.tone(90, 0.16, 'square', 0.16);
  }

  cash(): void {
    this.ensure();
    if (this.cue('ui-cash', 0.45)) return;
    this.tone(1046, 0.09, 'triangle', 0.13);
    window.setTimeout(() => this.tone(1568, 0.13, 'triangle', 0.1), 70);
  }

  alert(): void {
    this.ensure();
    this.tone(392, 0.16, 'sawtooth', 0.11);
    window.setTimeout(() => this.tone(311, 0.24, 'sawtooth', 0.1), 150);
  }

  siren(): void {
    this.ensure();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.linearRampToValueAtTime(880, now + 0.4);
    osc.frequency.linearRampToValueAtTime(620, now + 0.8);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.9);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.95);
  }

  typewriter(): void {
    this.ensure();
    this.noise(0.04, 2600, 0.22, 'bandpass');
  }
}

export const audio = new AudioEngine();
