import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/audio';
import { applyMusicMix, playReelQueue } from '../audio/musicPool';
import { deviceIsPhone } from '../app/device';
import { CityRenderer } from '../render/scene';
import { VIEW_ZOOM } from '../render/viewModes';
import { yieldForInput } from '../yieldForInput';
import { LOADING_TIPS } from './StreetLoading';
import {
  REEL_TRACK_SECONDS,
  buildReel,
  createReelSim,
  cueReelFire,
  frameAt,
  type ReelFrame,
} from './reel/reelShow';

/**
 * A private city, cut to the loading theme. The player's world is not in this
 * component. The track is an &lt;audio&gt; element so the browser streams it
 * and nothing is written into the city folder.
 */
export function LoadingReel({ percent, ready, onSkip, onFallback }: {
  percent: number;
  ready: boolean;
  onSkip: () => void;
  onFallback: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tip, setTip] = useState(0);
  const [logo, setLogo] = useState(false);
  const [muted, setMuted] = useState(() => audio.musicMuted);
  const [needsTap, setNeedsTap] = useState(false);
  const needsTapRef = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const skipLock = useRef(false);
  const finishRef = useRef<() => void>(() => {});
  const onSkipRef = useRef(onSkip);
  const onFallbackRef = useRef(onFallback);
  const readyRef = useRef(ready);
  onSkipRef.current = onSkip;
  onFallbackRef.current = onFallback;
  readyRef.current = ready;

  useEffect(() => {
    const timer = window.setInterval(() => setTip((index) => (index + 1) % LOADING_TIPS.length), 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const music = audioRef.current;
    if (!canvas || !music) return;
    let alive = true;
    let renderer: CityRenderer | null = null;
    let raf = 0;
    const phone = deviceIsPhone();
    let clockOrigin = performance.now();
    let renderedAt = 0;
    let slow = 0;
    let shot = -1;
    const brigade = { current: false };
    let frames: ReelFrame[] = [];
    let sim: ReturnType<typeof createReelSim> | null = null;
    let unmix = () => {};

    const time = () => {
      if (music.currentTime > 0 && !music.paused) return music.currentTime;
      return ((performance.now() - clockOrigin) / 1000) % REEL_TRACK_SECONDS;
    };

    const finish = () => {
      if (!alive || skipLock.current) return;
      skipLock.current = true;
      setLeaving(true);
      const from = music.volume;
      const fadeStarted = performance.now();
      const fade = () => {
        const t = Math.min(1, (performance.now() - fadeStarted) / 400);
        music.volume = from * (1 - t);
        if (t < 1 && alive) requestAnimationFrame(fade);
        else music.pause();
      };
      fade();
      onSkipRef.current();
    };
    finishRef.current = finish;

    const skip = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish();
    };
    window.addEventListener('keydown', skip, true);

    const open = async () => {
      // The storage probe finishes before the demo city is built, so the reel
      // does not hold the menu behind a WebGL startup.
      while (alive && !readyRef.current) await yieldForInput();
      if (!alive) return;
      sim = createReelSim();
      await yieldForInput();
      if (!alive) return;
      frames = buildReel(sim);
      void playReelQueue(music).then(async () => {
        if (!alive) return;
        unmix = audio.onMix(() => { applyMusicMix(music); setMuted(music.muted); });
        applyMusicMix(music);
        setMuted(music.muted);
        try {
          await music.play();
          needsTapRef.current = false;
          setNeedsTap(false);
        } catch {
          needsTapRef.current = true;
          setNeedsTap(true);
          clockOrigin = performance.now();
        }
      });
      if (!alive) return;
      const created = await CityRenderer.create(canvas, sim.world, () => alive);
      if (!created || !alive) { created?.dispose(); return; }
      renderer = created;
      // The street view sizes itself from the canvas. Without that, every
      // frame clears the sky and draws the city into a one-pixel viewport,
      // so the reel is a flat colour with the title on top.
      const fit = () => {
        if (!renderer) return;
        const width = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
        const height = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
        renderer.resize(Math.max(1, width), Math.max(1, height));
      };
      fit();
      const observer = new ResizeObserver(fit);
      observer.observe(canvas);
      const stopFit = () => observer.disconnect();
      const previousUnmix = unmix;
      unmix = () => { stopFit(); previousUnmix(); };
      renderer.setZoom(VIEW_ZOOM.street);
      renderer.setHiddenRoofs(true);
      renderer.setStreetsOpen(true);
      const firstStreet = frames.find((frame) => frame.kind === 'street');
      if (firstStreet) renderer.centerOn(firstStreet.x, firstStreet.y);
      // Painted colours are enough to show the street. Photographs replace
      // them when they arrive; the reel does not wait on that download.
      void renderer.prepare().catch(() => {});
      if (!alive) return;
      renderedAt = performance.now();
      const bootStart = performance.getEntriesByName('hood-boot-start')[0]?.startTime ?? renderedAt;
      document.documentElement.dataset.reelFrameMs = String(Math.round(renderedAt - bootStart));
      let last = performance.now();
      const loop = (now: number) => {
        if (!alive || !renderer || !sim) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (renderedAt && now - renderedAt > 12000) {
          if (dt > 0.05) slow += dt;
          else slow = 0;
          if (slow > 1.5) { onFallbackRef.current(); return; }
        }
        const at = time();
        const index = frameAt(at, frames.length);
        const frame = frames[index];
        if (!frame) return;
        if (index !== shot) {
          shot = index;
          setLogo(frame.kind === 'logo');
          if (frame.kind === 'street') renderer.centerOn(frame.x, frame.y);
          if (frame.pace === 'dusk') sim.world.minute = 400;
          else if (sim.world.minute > 450) sim.world.minute = 90;
          if (frame.fireId != null) cueReelFire(sim, frame.fireId, brigade);
        }
        if (frame.pace !== 'still' && sim.world.phase === 'week') {
          if (sim.world.minute > 2000) sim.world.minute = 120;
          const speed = frame.pace === 'dusk' ? 1.5 : phone ? 4 : 8;
          sim.advance(dt, speed, phone ? 3 : 6);
        }
        renderer.setSubMinute(sim.subMinute);
        renderer.setTimeScale(frame.pace === 'still' ? 0 : frame.pace === 'dusk' ? 1.5 : phone ? 4 : 8);
        renderer.update();
        if (frame.kind === 'street') renderer.render();
      };
      raf = requestAnimationFrame(loop);
    };

    void open().catch(() => { if (alive) onFallbackRef.current(); });
    return () => {
      alive = false;
      window.removeEventListener('keydown', skip, true);
      unmix();
      cancelAnimationFrame(raf);
      music.pause();
      renderer?.dispose();
    };
  }, []);

  const toggleSound = (event: { stopPropagation: () => void; preventDefault: () => void }) => {
    event.stopPropagation();
    event.preventDefault();
    audio.setMusicMuted(!audio.musicMuted);
    const music = audioRef.current;
    if (music) {
      applyMusicMix(music);
      if (!music.muted) void music.play().catch(() => { music.muted = true; setMuted(true); });
      setMuted(music.muted);
    } else setMuted(audio.musicMuted);
  };

  const label = ready ? 'Ready, click to start' : `Loading ${Math.max(0, Math.min(100, Math.round(percent)))}%`;
  return (
    <div className={`loading-reel${leaving ? ' leaving' : ''}${logo ? ' logo-card' : ''}`} onPointerDown={() => {
      const node = audioRef.current;
      if (needsTapRef.current && node) {
        applyMusicMix(node);
        void node.play().then(() => { needsTapRef.current = false; setNeedsTap(false); }).catch(() => {});
        return;
      }
      finishRef.current();
    }} role="presentation">
      <canvas ref={canvasRef} className="loading-reel-canvas" aria-hidden="true" />
      <audio ref={audioRef} data-audio-slot="loading-reel" preload="none" playsInline />
      {!logo && <h1 className="reel-logo">Hood Simulator</h1>}
      {!logo && <p className="reel-tip">{LOADING_TIPS[tip]}</p>}
      {logo && (
        <div className="reel-end">
          <h1>Hood Simulator</h1>
        </div>
      )}
      <div className="reel-status" role="status">{needsTap ? 'Click to start the theme' : label}</div>
      <button
        type="button"
        className="reel-sound"
        aria-pressed={!muted}
        aria-label={muted ? 'Unmute the theme' : 'Mute the theme'}
        onPointerDown={toggleSound}
      >
        {muted ? 'Sound off' : 'Sound on'}
      </button>
    </div>
  );
}
