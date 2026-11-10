import { useEffect, useState } from 'react';
import { useGame } from '../app/store';
import { installCrashReports, setReportWorld, writeDebugReport } from '../app/debugReport';
import { checkForUpdate, type UpdateOffer } from '../app/versionCheck';
import { activeWorldStore } from '../app/worldFolder';

/** Version, update offer, and the debug button. Visible on every screen, including before a city is open. */
export function AlwaysChrome() {
  const sim = useGame((s) => s.sim);
  const [offer, setOffer] = useState<UpdateOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    setReportWorld(() => useGame.getState().sim?.world ?? null);
    installCrashReports();
    let cancel = false;
    void checkForUpdate(__APP_VERSION__).then((next) => { if (!cancel) setOffer(next); });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'F9' || event.repeat) return;
      event.preventDefault();
      void run();
    };
    window.addEventListener('keydown', onKey);
    return () => { cancel = true; window.removeEventListener('keydown', onKey); };
  }, []);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setNote('');
    try {
      await writeDebugReport(useGame.getState().sim?.world ?? null, __APP_VERSION__);
      const where = activeWorldStore() ? `09 Reports in ${activeWorldStore()!.label}, and a download` : 'a download (no folder chosen yet)';
      setNote(`Report written: ${where}.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'The report could not be written.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="always-chrome">
      <div className="always-version" aria-label={`Version ${__APP_VERSION__}`}>v{__APP_VERSION__}</div>
      <button type="button" className="always-debug" onClick={() => void run()} disabled={busy}>
        {busy ? 'Writing…' : 'Debug'}
      </button>
      {note && <p className="always-note" role="status">{note}</p>}
      {offer && (
        <div className="always-update" role="dialog" aria-label="Newer version">
          <p>Version {offer.latest} is available. This copy is {offer.current}.</p>
          <button type="button" onClick={() => { window.location.href = offer.url; }}>Load it</button>
          <button type="button" onClick={() => setOffer(null)}>Keep this one</button>
        </div>
      )}
      {sim?.world.phase === 'planning' && <Autoplay />}
    </div>
  );
}

function Autoplay() {
  const autoplayWeeks = useGame((s) => s.autoplayWeeks);
  const resolving = useGame((s) => s.resolvingHeadless);
  return (
    <button type="button" className="always-debug" disabled={resolving} onClick={() => void autoplayWeeks(4)} title="Four weeks on the same sim, with simple orders for the player">
      Autoplay 4
    </button>
  );
}
