import { useEffect, useRef, useState } from 'react';
import { useGame } from '../app/store';
import { recordAction } from '../app/actionLog';
import { runAutoTest, type AutoTestSettings } from '../app/autoTest';
import { installCrashReports, setReportWish, setReportWorld, writeDebugReport } from '../app/debugReport';
import { checkForUpdate, type UpdateOffer } from '../app/versionCheck';
import { activeWorldStore } from '../app/worldFolder';

/** Version, update offer, and the debug button. Visible on every screen, including before a city is open. */
export function AlwaysChrome() {
  const sim = useGame((s) => s.sim);
  const [offer, setOffer] = useState<UpdateOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [asking, setAsking] = useState(false);
  const [wish, setWish] = useState('');
  const wishRef = useRef('');

  useEffect(() => {
    setReportWorld(() => useGame.getState().sim?.world ?? null);
    installCrashReports();
    let cancel = false;
    void checkForUpdate(__APP_VERSION__).then((next) => { if (!cancel) setOffer(next); });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'F9' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea')) return;
      event.preventDefault();
      setAsking(true);
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
    <div className="always-chrome">
      <div className="always-version" aria-label={`Version ${__APP_VERSION__}`}>v{__APP_VERSION__}</div>
      <button type="button" className="always-debug" onClick={() => setAsking(true)} disabled={busy}>
        {busy ? 'Writing…' : 'Debug'}
      </button>
      {asking && (
        <form className="always-update" onSubmit={(event) => { event.preventDefault(); void run(wishRef.current); }}>
          <label>
            What would you have wished to happen?
            <input
              value={wish}
              onChange={(event) => { wishRef.current = event.target.value; setWish(event.target.value); }}
              maxLength={500}
            />
          </label>
          <button type="submit">Save report</button>
          <button type="button" onClick={() => void run('')}>Skip</button>
        </form>
      )}
      {note && (
        <p className="always-note" role={note.error ? 'alert' : 'status'}>
          {note.text}
          {note.error && <button type="button" onClick={() => setNote(null)}>Dismiss</button>}
        </p>
      )}
      {offer && (
        <div className="always-update" role="dialog" aria-label="Newer version">
          <p>Version {offer.latest} is available. This copy is {offer.current}.</p>
          <button type="button" onClick={() => { window.location.href = offer.url; }}>Load it</button>
          <button type="button" onClick={() => setOffer(null)}>Keep this one</button>
        </div>
      )}
      {sim?.world.phase === 'planning' && <AutoTest />}
    </div>
  );
}

function AutoTest() {
  const resolving = useGame((s) => s.resolvingHeadless);
  const sim = useGame((s) => s.sim);
  const [open, setOpen] = useState(false);
  const [untilEnd, setUntilEnd] = useState(false);
  const [weeks, setWeeks] = useState(4);
  const [seed, setSeed] = useState(sim?.world.options.seed ?? 1932);
  const [speed, setSpeed] = useState(4);
  const [running, setRunning] = useState(false);
  const start = async () => {
    const current = useGame.getState().sim;
    if (!current || running) return;
    const settings: AutoTestSettings = {
      weeks: untilEnd ? null : Math.max(1, Math.round(weeks) || 1),
      seed: Math.round(seed) || current.world.options.seed,
      speed: Math.max(1, Math.round(speed) || 1),
    };
    setOpen(false);
    setRunning(true);
    useGame.getState().setSpeed(settings.speed);
    try {
      await runAutoTest(current, settings, () => useGame.getState().endWeekNow());
      useGame.getState().notify('Auto test report written to 09 Reports.');
    } catch (error) {
      useGame.getState().notify({ ok: false, error: error instanceof Error ? error.message : 'Auto test failed.' });
    } finally {
      setRunning(false);
    }
  };
  return (
    <span className="always-autoplay">
      <button type="button" className="always-debug" disabled={resolving || running} onClick={() => setOpen(true)}>
        {running ? 'Testing…' : 'Auto Test'}
      </button>
      {open && (
        <form className="always-update" role="dialog" aria-label="Auto Test" onSubmit={(event) => { event.preventDefault(); void start(); }}>
          <p>A simulated player uses the same actions as the desk.</p>
          <label>
            <input type="checkbox" checked={untilEnd} onChange={(event) => setUntilEnd(event.target.checked)} />
            Until victory or loss
          </label>
          {!untilEnd && (
            <label>
              Weeks
              <input type="number" min={1} value={weeks} aria-label="Auto test weeks" onChange={(event) => setWeeks(Number(event.target.value))} />
            </label>
          )}
          <label>
            Seed
            <input type="number" value={seed} aria-label="Auto test seed" onChange={(event) => setSeed(Number(event.target.value))} />
          </label>
          <label>
            Speed
            <input type="number" min={1} max={10} value={speed} aria-label="Auto test speed" onChange={(event) => setSpeed(Number(event.target.value))} />
          </label>
          <button type="submit">Start</button>
          <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        </form>
      )}
    </span>
  );
}
