import { useEffect, useRef, useState } from 'react';
import { useGame } from '../app/store';
import { audio } from '../audio/audio';
import { onNowPlaying, setMusicHold } from '../audio/musicPool';
import { Modal } from './common';
import { InterfaceButton } from './InterfaceControls';
import './interface.css';
import { recordAction } from '../app/actionLog';
import { runAutoTest, campaignOf, autoTestRunState, onAutoTestRun, takeAutoTestStopped, takeAutoTestMemoryStop, toggleAutoTestStop, type AutoTestSettings } from '../app/autoTest';
import { folderDiary, importLearnedState } from '../app/diary';
import { campaignLabel, isDefaultCampaign } from '../app/strategy';
import { installCrashReports, noteAutoTestStopped, setReportWish, setReportWorld, writeDebugReport } from '../app/debugReport';
import { checkForUpdate, type UpdateOffer } from '../app/versionCheck';
import { activeWorldStore } from '../app/worldFolder';
import { isTyping } from './input';

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
      <div className="always-version" aria-label={`Version ${__APP_VERSION__}`} title={`Version ${__APP_VERSION__}`}>v{__APP_VERSION__}</div>
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
  const sim = useGame((s) => s.sim);
  const [untilEnd, setUntilEnd] = useState(false);
  const [weeks, setWeeks] = useState(4);
  const [seed, setSeed] = useState(sim?.world.options.seed ?? 1932);
  const [speed, setSpeed] = useState(4);
  const [learn, setLearn] = useState(true);
  const [running, setRunning] = useState(false);
  const campaign = sim ? campaignOf(sim) : null;
  const start = async () => {
    const current = useGame.getState().sim;
    if (!current || running) return;
    const settings: AutoTestSettings = {
      weeks: untilEnd ? null : Math.max(1, Math.round(weeks) || 1),
      seed: Math.round(seed) || current.world.options.seed,
      speed: Math.max(1, Math.round(speed) || 1),
      learn,
    };
    setOpen(false);
    setRunning(true);
    setMusicHold(true);
    try {
      await runAutoTest(current, settings, () => useGame.getState().endWeekNow());
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
      <InterfaceButton label="Import Auto Test" glyph="⇪" caption="Import" disabled={resolving || running}
        title="Import — load an Auto Test report (all its parts) as Auto Test's learned state"
        onClick={() => importRef.current?.click()} />
      <input ref={importRef} type="file" accept=".txt,.json" multiple hidden onChange={(event) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = '';
        if (!files.length) return;
        void importLearnedState(files).then((n) => useGame.getState().notify(n ? `Imported ${n} Auto Test run${n === 1 ? '' : 's'} into the diary; the next Auto Test learns from ${n === 1 ? 'it' : 'them'}.` : 'No Auto Test learned state found in that file.'))
          .catch((error) => useGame.getState().notify({ ok: false, error: `Import failed: ${error instanceof Error ? error.message : String(error)}` }));
      }} />
      {open && (
        <Modal title="Auto Test" kicker="A simulated player" onClose={() => setOpen(false)} width={520}
          footer={<>
            <button className="btn brass" type="button" onClick={() => void start()}>Start</button>
            <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="button" onClick={() => void resetDiary()}>Reset diary</button>
          </>}>
          <p>A simulated player uses the same actions as the desk. The diary learns the default campaign: normal opponents, normal economy, 40×32. This city is {campaign ? campaignLabel(campaign) : 'not open'}{campaign && isDefaultCampaign(campaign) ? ', the default.' : '. It is kept separate.'}</p>
          <label className="wood-field">
            <input type="checkbox" checked={learn} onChange={(event) => setLearn(event.target.checked)} />
            Learn from diary
          </label>
          <label className="wood-field">
            <input type="checkbox" checked={untilEnd} onChange={(event) => setUntilEnd(event.target.checked)} />
            Until victory or loss
          </label>
          {!untilEnd && (
            <label className="wood-field">
              Weeks
              <input type="number" min={1} max={52} value={weeks} aria-label="Auto test weeks" onChange={(event) => setWeeks(Number(event.target.value))} />
            </label>
          )}
          <label className="wood-field">
            Seed
            <input type="number" value={seed} aria-label="Auto test seed" onChange={(event) => setSeed(Number(event.target.value))} />
          </label>
          <label className="wood-field">
            Speed
            <input type="number" min={1} max={10} value={speed} aria-label="Auto test speed" onChange={(event) => setSpeed(Number(event.target.value))} />
            <span>Written on the report. The test runs flat out.</span>
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
