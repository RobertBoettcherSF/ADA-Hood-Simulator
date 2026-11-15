import { useEffect, useRef, useState } from 'react';
import { useGame } from '../app/store';
import { audio } from '../audio/audio';
import { onNowPlaying, setMusicHold } from '../audio/musicPool';
import { Modal } from './common';
import { InterfaceButton } from './InterfaceControls';
import './interface.css';
import { recordAction } from '../app/actionLog';
import { runAutoTest, defaultAutoTestOptions, SAVED_AUTO_TEST_SEEDS, type AutoTestStart, campaignOf, autoTestRunState, onAutoTestRun, takeAutoTestStopped, takeAutoTestMemoryStop, toggleAutoTestStop, type AutoTestSettings } from '../app/autoTest';
import { folderDiary, importLearnedState } from '../app/diary';
import { campaignLabel, DIARY_LEARNING } from '../app/strategy';
import { defaultAutoTestChoice, loadAutoTestChoice, saveAutoTestChoice, type AutoTestChoice } from '../app/autoTestOptions';
import { FULL_VICTORIES, FULL_VICTORY_LABELS, type FullVictory } from '../sim/victory';
import { CITY_SIZE_PRESETS, TERRITORY_TARGET_RANGE, territorySetupMaximum } from '../sim/newGameValidation';

/** 1.2.57: a random 32-bit seed for the Auto Test picker. */
const randomSeed = () => Math.floor(Math.random() * 0xffffffff) >>> 0;
import { installCrashReports, noteAutoTestStopped, setReportWish, setReportWorld, writeDebugReport } from '../app/debugReport';
import { checkForUpdate, type UpdateOffer } from '../app/versionCheck';
import { activeWorldStore } from '../app/worldFolder';
import { isTyping } from './input';
import type { Sim } from '../sim/sim';

/** 1.2.53: resolves once the desk is neither saving, loading nor resolving a week. */
function deskIdle(): Promise<void> {
  const idle = (s: ReturnType<typeof useGame.getState>) => !s.savingSnapshot && s.loadingSave == null && !s.resolvingHeadless;
  return new Promise((resolve) => {
    if (idle(useGame.getState())) { resolve(); return; }
    const unsubscribe = useGame.subscribe((s) => { if (idle(s)) { unsubscribe(); resolve(); } });
  });
}

/** 1.2.53 (proposed): how long the default start waits for the new city before giving up (the player may have kept the old one). */
const NEW_CITY_WAIT_MS = 60_000;

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
  const sim = useGame((s) => s.sim);
  // 1.2.57 (Robert): the options hold the whole start (seed picker, victory and
  // target, opponents, economy, size, or this city) and are remembered across runs.
  const [choice, setChoice] = useState<AutoTestChoice>(defaultAutoTestChoice);
  const patch = (p: Partial<AutoTestChoice>) => setChoice((c) => ({ ...c, ...p }));
  const patchStart = (p: Partial<AutoTestStart>) => setChoice((c) => ({ ...c, start: { ...c.start, ...p } }));
  useEffect(() => { if (open) void loadAutoTestChoice().then(setChoice); }, [open]);
  const { untilEnd, weeks, seed, speed } = choice;
  const sizeNow = CITY_SIZE_PRESETS[choice.start.size] ?? CITY_SIZE_PRESETS.standard;
  const targetMax = territorySetupMaximum({ citySize: sizeNow.w, cityHeight: sizeNow.h });
  const fresh = !choice.thisCity;
  // 1.2.57 (Robert): diary learning is off for now — the option is hidden, the code kept.
  const learn = DIARY_LEARNING;
  const [running, setRunning] = useState(false);
  const campaign = sim ? campaignOf(sim) : null;
  /** 1.2.53: start a new city with the default Auto Test settings; resolves with it, or null when the player kept the old city. */
  const newCity = (s: number) => new Promise<Sim | null>((resolve) => {
    const before = useGame.getState().sim;
    let settled = false;
    const unsubscribe = useGame.subscribe((state) => { if (!settled && state.sim && state.sim !== before) { settled = true; unsubscribe(); resolve(state.sim); } });
    useGame.getState().startGame(defaultAutoTestOptions(useGame.getState().options, s, choice.start));
    // startGame asks before replacing a city; when the player says no, nothing changes.
    window.setTimeout(() => { if (!settled) { settled = true; unsubscribe(); resolve(null); } }, NEW_CITY_WAIT_MS);
  });
  const start = async () => {
    if (running) return;
    void saveAutoTestChoice(choice).catch(() => { /* no world folder: not remembered */ });
    const current = fresh ? await newCity(Math.round(seed) >>> 0) : useGame.getState().sim;
    if (!current) return;
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
      // 1.2.53: End Week only once the desk is idle — a new city is still
      // being saved when the run starts, and End Week returns without playing
      // the week while a save is under way.
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
        <Modal title="Auto Test" kicker="A simulated player" onClose={() => setOpen(false)} width={520}
          footer={<>
            <button className="btn brass" type="button" onClick={() => void start()}>Start</button>
            <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
            {DIARY_LEARNING && <button className="btn" type="button" onClick={() => void resetDiary()}>Reset diary</button>}
          </>}>
          <p>A simulated player uses the same actions as the desk. The game is won only by the victory chosen here (or the open city's own, with "This city"). {campaign ? `This city: ${campaignLabel(campaign)}.` : ''}</p>
          {DIARY_LEARNING && (
            <label className="wood-field">
              <input type="checkbox" checked={learn} readOnly />
              <span>Learn from diary</span>
            </label>
          )}
          <label className="wood-field">
            <span>Start</span>
            <select aria-label="Auto test start" value={choice.thisCity ? 'this' : 'new'} onChange={(e) => patch({ thisCity: e.target.value === 'this' })}>
              <option value="new">A new city (the settings below)</option>
              <option value="this">This city, as it is</option>
            </select>
          </label>
          <label className="wood-field">
            <span>Seed</span>
            <select aria-label="Saved seeds" value={choice.savedSeeds.includes(seed) ? String(seed) : 'other'} onChange={(e) => { if (e.target.value === 'random') patch({ seed: randomSeed() }); else if (e.target.value !== 'other') patch({ seed: Number(e.target.value) }); }}>
              {choice.savedSeeds.map((x, i) => <option key={x} value={String(x)}>{x}{i === 0 && x === SAVED_AUTO_TEST_SEEDS[0] ? ' (default)' : ''}</option>)}
              {!choice.savedSeeds.includes(seed) && <option value="other">{seed} (not saved)</option>}
              <option value="random">Random…</option>
            </select>
            <input type="number" value={seed} aria-label="Auto test seed" onChange={(e) => patch({ seed: Number(e.target.value) >>> 0 })} />
            <button className="btn" type="button" onClick={() => patch({ seed: randomSeed() })}>Random</button>
            <button className="btn" type="button" disabled={choice.savedSeeds.includes(seed)} onClick={() => patch({ savedSeeds: [...choice.savedSeeds, seed] })}>Save seed</button>
            <button className="btn" type="button" disabled={!choice.savedSeeds.includes(seed) || choice.savedSeeds.length <= 1} onClick={() => patch({ savedSeeds: choice.savedSeeds.filter((x) => x !== seed) })}>Remove</button>
          </label>
          <fieldset className="wood-field" disabled={choice.thisCity} style={{ border: 0, padding: 0, margin: 0 }}>
            <label className="wood-field">
              <span>Victory</span>
              <select aria-label="Auto test victory" value={choice.start.mode === 'normal' ? `normal:${choice.start.victory}` : choice.start.mode} onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith('normal:')) patchStart({ mode: 'normal', victory: v.slice(7) as FullVictory });
                else patchStart({ mode: v as AutoTestStart['mode'] });
              }}>
                {FULL_VICTORIES.map((v) => <option key={v} value={`normal:${v}`}>Full game — {FULL_VICTORY_LABELS[v]}</option>)}
                <option value="territory">Territory</option>
                <option value="wealth">Wealth</option>
                <option value="power">Power</option>
              </select>
              {choice.start.mode === 'territory' && (
                <input type="number" min={TERRITORY_TARGET_RANGE.min} max={targetMax} step={25} value={choice.start.territoryTarget} aria-label="Target blocks" onChange={(e) => patchStart({ territoryTarget: Number(e.target.value) })} />
              )}
              {choice.start.mode === 'territory' && <span>blocks (up to {targetMax} here)</span>}
              {choice.start.mode === 'wealth' && <input type="number" min={100000} max={500000} step={25000} value={choice.start.wealthTarget} aria-label="Target wealth" onChange={(e) => patchStart({ wealthTarget: Number(e.target.value) })} />}
              {choice.start.mode === 'power' && <input type="number" min={20} max={100} step={5} value={choice.start.powerWeeks} aria-label="Power weeks" onChange={(e) => patchStart({ powerWeeks: Number(e.target.value) })} />}
              {choice.start.mode === 'power' && <span>weeks</span>}
            </label>
            <label className="wood-field">
              <span>Opponents</span>
              <select aria-label="Auto test opponents" value={choice.start.opponents} onChange={(e) => patchStart({ opponents: e.target.value as AutoTestStart['opponents'] })}>
                {(['passive', 'normal', 'aggressive', 'random'] as const).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <span>Economy</span>
              <select aria-label="Auto test economy" value={choice.start.economy} onChange={(e) => patchStart({ economy: e.target.value as AutoTestStart['economy'] })}>
                {(['weak', 'normal', 'strong'] as const).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <span>Size</span>
              <select aria-label="Auto test size" value={choice.start.size} onChange={(e) => patchStart({ size: e.target.value as AutoTestStart['size'] })}>
                {(Object.keys(CITY_SIZE_PRESETS) as AutoTestStart['size'][]).map((k) => <option key={k} value={k}>{CITY_SIZE_PRESETS[k].label} {CITY_SIZE_PRESETS[k].w}×{CITY_SIZE_PRESETS[k].h}</option>)}
              </select>
            </label>
            <span className="tiny">$6,000, 5 hoods, 3 businesses.</span>
          </fieldset>
          <label className="wood-field">
            <input type="checkbox" checked={untilEnd} onChange={(event) => patch({ untilEnd: event.target.checked })} />
            <span>Until victory or loss</span>
          </label>
          {!untilEnd && (
            <label className="wood-field">
              Weeks
              <input type="number" min={1} max={52} value={weeks} aria-label="Auto test weeks" onChange={(event) => patch({ weeks: Number(event.target.value) })} />
            </label>
          )}
          <label className="wood-field">
            Speed
            <input type="number" min={1} max={10} value={speed} aria-label="Auto test speed" onChange={(event) => patch({ speed: Number(event.target.value) })} />
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
