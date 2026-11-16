import { useEffect, useRef, useState } from 'react';
import { useGame } from '../app/store';
import { audio } from '../audio/audio';
import { onNowPlaying, setMusicHold } from '../audio/musicPool';
import { Modal } from './common';
import { InterfaceButton } from './InterfaceControls';
import './interface.css';
import { recordAction } from '../app/actionLog';
import { runAutoTest, DEFAULT_AUTO_TEST_SEED, AUTO_TEST_SPEED, autoTestRunState, onAutoTestRun, takeAutoTestStopped, takeAutoTestMemoryStop, toggleAutoTestStop, type AutoTestSettings } from '../app/autoTest';
import { folderDiary, importLearnedState } from '../app/diary';
import { DIARY_LEARNING } from '../app/strategy';

/** A random 32-bit seed for the Auto Test seed field. */
const randomSeed = () => Math.floor(Math.random() * 0xffffffff) >>> 0;
import { installCrashReports, noteAutoTestStopped, setReportWish, setReportWorld, writeDebugReport } from '../app/debugReport';
import { checkForUpdate, type UpdateOffer } from '../app/versionCheck';
import { activeWorldStore } from '../app/worldFolder';
import { isTyping } from './input';

/** 1.2.53: resolves once the desk is neither saving, loading nor resolving a week. */
function deskIdle(): Promise<void> {
  const idle = (s: ReturnType<typeof useGame.getState>) => !s.savingSnapshot && s.loadingSave == null && !s.resolvingHeadless;
  return new Promise((resolve) => {
    if (idle(useGame.getState())) { resolve(); return; }
    const unsubscribe = useGame.subscribe((s) => { if (idle(s)) { unsubscribe(); resolve(); } });
  });
}

/** Version, update offer, and the debug button. Visible on every screen, including before a city is open. */
export function AlwaysChrome() {
  const sim = useGame((s) => s.sim);
  const [offer, setOffer] = useState<UpdateOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [asking, setAsking] = useState(false);
  const [muted, setMuted] = useState(audio.musicMuted);
  const [autoOpen, setAutoOpen] = useState(false);
  const [wish, setWish] = useState('');
  const wishRef = useRef('');

  useEffect(() => {
    setReportWorld(() => useGame.getState().sim?.world ?? null);
    installCrashReports();
    let cancel = false;
    void checkForUpdate(__APP_VERSION__).then((next) => { if (!cancel) setOffer(next); });
    // One key listener for the always-on keys: F9 asks for a report, M mutes the music.
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || isTyping(event.target, 'input, textarea')) return;
      if (event.key === 'F9') { event.preventDefault(); setAsking(true); }
      else if (event.key === 'm' || event.key === 'M') { event.preventDefault(); setMuted(audio.toggleMusicMuted()); }
    };
    const onClick = (event: MouseEvent) => {
      const el = event.target instanceof Element ? event.target.closest('button, a, [role="tab"]') : null;
      if (!el) return;
      const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (label) recordAction('click', label);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick, true);
    return () => {
      cancel = true;
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  useEffect(() => {
    if (!note || note.error) return;
    const timer = window.setTimeout(() => setNote(null), 3000);
    return () => window.clearTimeout(timer);
  }, [note]);

  const run = async (answer: string) => {
    if (busy) return;
    setBusy(true);
    setAsking(false);
    setNote(null);
    try {
      setReportWish(answer);
      await writeDebugReport(useGame.getState().sim?.world ?? null, __APP_VERSION__);
      const where = activeWorldStore() ? `09 Reports in ${activeWorldStore()!.label}, and a download` : 'a download (no folder chosen yet)';
      setNote({ text: `Report written: ${where}.`, error: false });
    } catch (error) {
      setNote({ text: error instanceof Error ? error.message : 'The report could not be written.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="always-chrome wood-tools" aria-label="Desk tools">
      <div className="always-version" aria-label={`Version ${__APP_VERSION__}`} title={`Version ${__APP_VERSION__}`}>v{__APP_VERSION__} · {__APP_COMMIT__}</div>
      <InterfaceButton label={muted ? 'Unmute music' : 'Mute music'} glyph={muted ? '×' : '♪'} caption="Sound" aria-pressed={!muted}
        title={muted ? 'Sound off. Click or press M to unmute.' : 'Sound on. Click or press M to mute.'}
        onClick={() => setMuted(audio.toggleMusicMuted())} />
      <InterfaceButton label="Debug report" glyph="✎" caption={busy ? 'Writing' : 'Debug'} disabled={busy}
        title="Debug — write a report of this session (F9)"
        onClick={() => { setAutoOpen(false); setAsking(true); }} />
      <StopAutoTest />
      {asking && (
        <Modal title="Debug report" kicker="09 Reports" onClose={() => setAsking(false)} width={480}
          footer={<>
            <button className="btn" type="button" onClick={() => void run(wishRef.current)}>Save report</button>
            <button className="btn" type="button" onClick={() => void run('')}>Skip</button>
          </>}>
          <label className="wood-field stack">
            What would you have wished to happen?
            <input
              value={wish}
              onChange={(event) => { wishRef.current = event.target.value; setWish(event.target.value); }}
              maxLength={500}
            />
          </label>
        </Modal>
      )}
      {note && (
        <p className="always-note" role={note.error ? 'alert' : 'status'}>
          {note.text}
          {note.error && <button type="button" onClick={() => setNote(null)}>Dismiss</button>}
        </p>
      )}
      {offer && (
        <Modal title="A newer copy is available" kicker="Version" onClose={() => setOffer(null)} width={460}
          footer={<>
            <button className="btn brass" type="button" onClick={() => { window.location.href = offer.url; }}>Load it</button>
            <button className="btn" type="button" onClick={() => setOffer(null)}>Keep this one</button>
          </>}>
          <p>Version {offer.latest} is available. This copy is {offer.current}.</p>
        </Modal>
      )}
      {sim?.world.phase === 'planning' && <AutoTest open={autoOpen} setOpen={(next) => { if (next) setAsking(false); setAutoOpen(next); }} />}
      <NowPlaying />
    </div>
  );
}

function AutoTest({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const resolving = useGame((s) => s.resolvingHeadless);
  // 1.2.62 (Robert): the dialog holds only the seed, and it seeds only Auto's own
  // choices. Auto Test makes no city: Start hands the open game to Auto from its
  // current week, with the open game's settings, until victory, loss or Stop.
  const [seed, setSeed] = useState(DEFAULT_AUTO_TEST_SEED);
  // 1.2.57 (Robert): diary learning is off for now — the option is hidden, the code kept.
  const learn = DIARY_LEARNING;
  const [running, setRunning] = useState(false);
  const start = async () => {
    if (running) return;
    const s = Math.round(seed) >>> 0;
    const current = useGame.getState().sim;
    if (!current || current.world.phase !== 'planning') return;
    const settings: AutoTestSettings = { weeks: null, seed: s || current.world.options.seed, speed: AUTO_TEST_SPEED, learn };
    setOpen(false);
    setRunning(true);
    setMusicHold(true);
    try {
      // 1.2.53: End Week only once the desk is idle — End Week returns without
      // playing the week while a save is under way.
      await runAutoTest(current, settings, async () => { await deskIdle(); await useGame.getState().endWeekNow(); });
      if (takeAutoTestStopped() && useGame.getState().sim?.world.phase === 'planning') useGame.getState().setTab('lieutenants');
      if (takeAutoTestMemoryStop()) useGame.getState().notify({ ok: false, error: 'Auto Test stopped: the browser is nearly out of memory. The city is saved and the report is in 09 Reports. Reload the page before running more weeks.' });
      else useGame.getState().notify('Auto test report written to 09 Reports.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auto test failed.';
      noteAutoTestStopped(message);
      useGame.getState().notify({ ok: false, error: message });
    } finally {
      setMusicHold(false);
      setRunning(false);
    }
  };
  const importRef = useRef<HTMLInputElement>(null);
  const resetDiary = async () => {
    if (!window.confirm('Erase the auto-test diary? New games will stop learning from it.')) return;
    await folderDiary().remove();
    useGame.getState().notify('Auto test diary erased.');
  };
  return (
    <span className="always-autoplay">
      <InterfaceButton label="Auto Test" glyph="⚑" caption={running ? 'Testing' : 'Test'} disabled={resolving || running}
        title="Auto Test — a simulated player runs the desk and writes a report"
        onClick={() => setOpen(true)} />
      {DIARY_LEARNING && <InterfaceButton label="Import Auto Test" glyph="⇪" caption="Import" disabled={resolving || running}
        title="Import — load an Auto Test report (all its parts) as Auto Test's learned state"
        onClick={() => importRef.current?.click()} />}
      <input ref={importRef} type="file" accept=".txt,.json" multiple hidden onChange={(event) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = '';
        if (!files.length) return;
        void importLearnedState(files).then((n) => useGame.getState().notify(n ? `Imported ${n} Auto Test run${n === 1 ? '' : 's'} into the diary; the next Auto Test learns from ${n === 1 ? 'it' : 'them'}.` : 'No Auto Test learned state found in that file.'))
          .catch((error) => useGame.getState().notify({ ok: false, error: `Import failed: ${error instanceof Error ? error.message : String(error)}` }));
      }} />
      {open && (
        <Modal title="Auto Test" kicker="A simulated player" onClose={() => setOpen(false)} width={420}
          footer={<>
            <button className="btn brass" type="button" onClick={() => void start()}>Start</button>
            <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
            {DIARY_LEARNING && <button className="btn" type="button" onClick={() => void resetDiary()}>Reset diary</button>}
          </>}>
          <label className="wood-field">
            <span>Seed</span>
            <input type="number" min={0} value={seed} aria-label="Auto test seed" onChange={(e) => setSeed(Number(e.target.value) >>> 0)} />
            <button className="btn" type="button" onClick={() => setSeed(DEFAULT_AUTO_TEST_SEED)}>Default</button>
            <button className="btn" type="button" onClick={() => setSeed(randomSeed())}>Random</button>
          </label>
        </Modal>
      )}
    </span>
  );
}

/** Below Debug. Lit while a test runs. One click stops after the week now settling; the next click takes that back. */
function StopAutoTest() {
  const [state, setState] = useState(autoTestRunState);
  useEffect(() => onAutoTestRun(() => setState(autoTestRunState())), []);
  const stopping = state.running && state.stopping;
  return (
    <>
      <InterfaceButton
        label={stopping ? 'Stopping after this week' : 'Stop Auto Test'}
        glyph={stopping ? '↩' : '■'}
        caption={stopping ? 'Stopping' : 'Stop'}
        aria-pressed={state.running}
        disabled={!state.running}
        title={stopping ? 'Stopping after this week. Click again to keep going.' : 'Stop Auto Test when the week now settling is done. Click again before then to cancel.'}
        onClick={() => toggleAutoTestStop()}
      />
      {stopping && <p className="always-note" role="status">Stopping after this week</p>}
    </>
  );
}

/** A short line when the song changes. It does not take clicks. */
function NowPlaying() {
  const [title, setTitle] = useState('');
  useEffect(() => {
    let timer = 0;
    return onNowPlaying((next) => {
      setTitle(next);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTitle(''), 4500);
    });
  }, []);
  if (!title) return null;
  return <p className="now-playing" role="status">Now playing: {title}</p>;
}
