// The game screen: the street view (or the city plan) filling the window,
// the map buttons along the top, the journal, the building and person
// cards, the gang panel, the week clock, and the boxes and drawer that open
// over them.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { City, readCity } from '../city';
import { CoreStop, Exports, HostStop, loadCore } from '../core';
import { Key, LANGS, Lang, translate } from '../i18n';
import { chime, downloadReport, logAction, logError, logEvent, store, stored } from '../report';
import { CityPlan } from './CityPlan';
import { DebugDrawer, STEP2_WORLD, Step2, cityReference, step2Matches } from './Debug';
import { BuildingCard, GangPanel, Journal, NewGameBox, PersonCard, SIZES, Size, WeekClock } from './Panels';
import { Clock, Gang, countProtected, personName, readClock, readGangs, readPerson, readWalkers } from '../people';
import { COUNT } from '../core';
import { StreetView } from './StreetView';
import { Flag } from './Flags';

declare global { interface Window { HS: { stamp: string; wasm: string } } }

const STAMP = window.HS.stamp;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
/** 1.2.91's normal pace: 10/3 game minutes a real second (constants.ts MINUTES_PER_SECOND). */
const MINUTES_PER_SECOND = 10 / 3;
/** At Max speed, whole minutes are run until this much of a frame is used (ms, proposed). */
const MAX_BUDGET_MS = 12;

function sizeOf(city: City): Size {
  return (Object.keys(SIZES) as Size[]).find(s => SIZES[s][0] === city.w && SIZES[s][1] === city.h) ?? 'standard';
}

export function App() {
  const [lang, setLang] = useState<Lang>(() => { const l = stored('ahs.lang', 'en-GB'); return (LANGS as readonly string[]).includes(l) ? l as Lang : 'en-GB'; });
  const [sound, setSound] = useState(() => stored('ahs.sound', 'on') !== 'off');
  const [core, setCore] = useState<Exports | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stop, setStop] = useState<CoreStop | null>(null);
  const [step2, setStep2] = useState<Step2 | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [stateHash, setStateHash] = useState<number | null>(null);
  const [lot, setLot] = useState(-1);
  const [view, setView] = useState<'street' | 'plan'>('street');
  const [turn, setTurn] = useState(0);
  const [newGame, setNewGame] = useState(false);
  const [debug, setDebug] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [expected, setExpected] = useState('');
  const [walkers, setWalkers] = useState<Int32Array | null>(null);
  const [gangs, setGangs] = useState<Gang[]>([]);
  const [clock, setClock] = useState<Clock | null>(null);
  const [person, setPerson] = useState(-1);
  const [gangsOpen, setGangsOpen] = useState(false);
  const [speed, setSpeed] = useState(() => Number(stored('ahs.speed', '1')) || 0);
  const [paused, setPaused] = useState(false);
  const [focus, setFocus] = useState<{ x: number; y: number; n: number } | null>(null);
  const [tickNo, setTickNo] = useState(0);
  const carry = useRef(0);
  const t = useCallback((k: Key, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);

  // Everything the page shows of the people, read after each step of the core.
  const refreshPeople = useCallback((c: Exports) => {
    setWalkers(readWalkers(c));
    const g = readGangs(c);
    // Building numbers run past the lot count only by the few replaced
    // ones; hs_get gives 0 past the end, so twice the lots is safe.
    countProtected(c, c.hs_count(COUNT.lots) * 2, g);
    setGangs(g);
    setClock(readClock(c));
    setTickNo(n => n + 1);
  }, []);

  const start = useCallback((c: Exports, seed: number, size: Size) => {
    const [w, h] = SIZES[size];
    const t0 = performance.now();
    c.hs_new_game(seed, seed, w, h);
    const next = readCity(c, seed);
    setCity(next); setLot(-1); setPerson(-1); setStateHash(c.hs_state_hash());
    refreshPeople(c);
    logEvent('new_game', { seed, size, ms: Math.round(performance.now() - t0), city_hash: next.cityHash,
      structure_hash: next.structureHash, lots: next.counts.lots, status: next.status });
  }, [refreshPeople]);

  // The running week: whole minutes at the chosen speed; Max runs as many
  // as fit in a frame's budget. hs_tick runs the week's end at minute 2,400.
  useEffect(() => {
    if (!core || !clock?.running || paused) return;
    let frame = 0, last = performance.now();
    const step = (now: number) => {
      let minutes = 0;
      if (speed === 0) {
        const until = now + MAX_BUDGET_MS;
        while (performance.now() < until) { const ran = core.hs_tick(4); minutes += ran; if (ran < 4) break; }
      } else {
        carry.current += (now - last) / 1000 * MINUTES_PER_SECOND * speed;
        const whole = Math.floor(carry.current);
        carry.current -= whole;
        if (whole > 0) minutes = core.hs_tick(Math.min(whole, 60));
      }
      last = now;
      if (minutes > 0) {
        refreshPeople(core);
        if (core.hs_count(COUNT.phase) === 0) {
          setStateHash(core.hs_state_hash());
          logEvent('week_settled', { week: core.hs_count(COUNT.week) - 1, draws: core.hs_count(COUNT.drawsWeek),
            wages: readGangs(core).map(g => g.wages), state_hash: core.hs_state_hash() >>> 0 });
          chime(sound, 523.25);
          return;
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [core, clock?.running, paused, speed, refreshPeople, sound]);

  const launch = () => {
    if (!core) return;
    core.hs_launch_week(); carry.current = 0; setPaused(false);
    logAction('launch_week', core.hs_count(COUNT.week)); refreshPeople(core);
  };
  const finish = () => {
    if (!core) return;
    const t0 = performance.now(), week = core.hs_count(COUNT.week);
    core.hs_finish_week();
    const ms = Math.round(performance.now() - t0);
    refreshPeople(core); setStateHash(core.hs_state_hash());
    logAction('finish_week', week);
    logEvent('week_settled', { week, ms, draws: core.hs_count(COUNT.drawsWeek), wages: readGangs(core).map(g => g.wages),
      state_hash: core.hs_state_hash() >>> 0 });
    chime(sound, 523.25);
  };
  const showPerson = useCallback((p: number) => {
    setPerson(p); setLot(-1);
    if (p >= 0) { logAction('select_person', p); chime(sound, 587.33); }
  }, [sound]);
  const goToPerson = (p: number) => {
    if (!core) return;
    showPerson(p);
    const who = readPerson(core, p);
    if (who) { setView('street'); setFocus({ x: who.x, y: who.y, n: Date.now() }); }
  };
  const gangColours = useMemo(() => [0, ...gangs.map(g => g.colour)], [gangs]);
  const selectedPerson = useMemo(() => (core && person >= 0 ? readPerson(core, person) : null),
    // tickNo: the card follows him as he walks.
    [core, person, tickNo]);

  useEffect(() => {
    loadCore(window.HS.wasm, s => { logError('last_chance', translate('en-GB', `err${s.code}` as Key), { ...s }); setStop(s); })
      .then(c => {
        // Step 2's checks run on their own world first (seed 1932, Large).
        c.hs_new_game(STEP2_WORLD.seed, STEP2_WORLD.auto, STEP2_WORLD.w, STEP2_WORLD.h);
        const s2: Step2 = {
          streams: [1, 2, 3].map(s => Array.from({ length: 20 }, (_, i) => c.hs_rng_value(s, i + 1) >>> 0)),
          checks: Array.from({ length: 9 }, (_, i) => c.hs_check_value(i + 1)),
          gw: c.hs_grid_w(), gh: c.hs_grid_h(),
          pattern: Array.from({ length: 225 }, (_, i) => c.hs_cell_kind(i % 15, Math.floor(i / 15))),
          worldHash: c.hs_state_hash(),
        };
        setStep2(s2);
        logEvent('core_loaded', { build_id: c.hs_build_id(), ...step2Matches(s2) });
        setCore(c);
        start(c, 1932, 'standard');
      })
      .catch(e => { if (!(e instanceof HostStop)) { setLoadError(String(e)); logError('wasm_load', String(e)); } });
  }, [start]);

  useEffect(() => { document.documentElement.lang = lang; document.title = t('title'); }, [lang, t]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'F9') { e.preventDefault(); logAction('report_opened', 'f9'); setFeedback(true); }
      else if (e.key === 'Escape') { setFeedback(false); setDebug(false); }
    };
    window.addEventListener('keydown', key);
    const motion = () => logEvent('reduced_motion', reducedMotion.matches);
    reducedMotion.addEventListener?.('change', motion);
    return () => { window.removeEventListener('keydown', key); reducedMotion.removeEventListener?.('change', motion); };
  }, []);

  const select = useCallback((id: number) => {
    setLot(id); setPerson(-1);
    if (id >= 0) { logAction('select_lot', id); chime(sound, 659.25); }
  }, [sound]);

  const reportContext = useMemo(() => ({
    stamp: STAMP, lang, sound, reducedMotion: reducedMotion.matches,
    seeds: city ? { city: city.seed, auto: city.seed } : null,
    stateHash: stateHash === null ? null : '0x' + (stateHash >>> 0).toString(16).padStart(8, '0'),
    custom: {
      build_id: core?.hs_build_id() ?? null, core_load_error: loadError,
      city: city ? { w: city.w, h: city.h, seed: city.seed, city_hash: city.cityHash, structure_hash: city.structureHash,
        rng_after_city: city.rngAfter, counts: city.counts, matches_reference: cityReference(city) !== null } : null,
      selected_lot: lot, selected_person: person, view, step2: step2 ? step2Matches(step2) : null,
      week: clock, speed, gangs: gangs.map(g => ({ id: g.id, name: g.name, cash: g.cash, wages: g.wages, crew: g.crew.length, pool: g.pool.length })),
      people: core ? { count: core.hs_count(COUNT.people), hashes: [1, 2, 3, 4].map(k => core.hs_population_hash(k) >>> 0),
        rng_after_setup: (core.hs_count(COUNT.setupLow) | (core.hs_count(COUNT.setupHigh) << 16)) >>> 0,
        rng_after_minute_1: (core.hs_count(COUNT.m1Low) | (core.hs_count(COUNT.m1High) << 16)) >>> 0 } : null,
    },
  }), [lang, sound, city, stateHash, core, loadError, lot, person, view, step2, clock, speed, gangs]);

  const crash = () => {
    logAction('crash_test');
    try { core?.hs_crash_test(4); } catch (e) { if (!(e instanceof HostStop)) logError('wasm', String(e)); }
  };

  const sizeLabel = city ? t(sizeOf(city)) : '';
  return (
    <div className="game-shell">
      {city && <StreetView city={city} selected={lot} onSelect={select} turnSignal={turn} visible={view === 'street'} label={t('street')}
        people={walkers} gangColours={gangColours} person={person} onPerson={showPerson} focus={focus} />}
      {city && view === 'plan' && <CityPlan city={city} selected={lot} onSelect={select} label={t('plan')} />}

      <header className="map-buttons">
        <div className="title"><strong>{t('title')}</strong><span>{t('subtitle')}</span></div>
        <div className="buttons">
          <button className="hud-btn" aria-pressed={view === 'plan'} onClick={() => { const v = view === 'plan' ? 'street' : 'plan'; setView(v); logAction('view', v); }}>
            {view === 'plan' ? t('street') : t('plan')}
          </button>
          <button className="hud-btn" disabled={view !== 'street'} onClick={() => { setTurn(n => n + 1); logAction('turn_view'); }}>{t('turn_view')}</button>
          <button className="hud-btn" disabled={!core} onClick={() => { setNewGame(true); logAction('new_game_opened'); }}>{t('new_game')}</button>
          <button className="hud-btn" onClick={() => { const s = !sound; setSound(s); store('ahs.sound', s ? 'on' : 'off'); logAction('sound', s ? 'on' : 'off'); chime(s); }}>
            {t(sound ? 'sound_on' : 'sound_off')}
          </button>
          <button className="hud-btn" aria-pressed={debug} onClick={() => { setDebug(!debug); logAction('debug', !debug); }}>{t('debug')}</button>
          <button className="hud-btn" onClick={() => { setFeedback(true); logAction('report_opened', 'button'); }}>{t('feedback')}</button>
          <span className="flags" aria-label="Language">
            {LANGS.map(l => (
              <button key={l} aria-pressed={l === lang} title={l} onClick={() => { setLang(l); store('ahs.lang', l); logAction('language', l); }}>
                <Flag lang={l} />
              </button>
            ))}
          </span>
        </div>
        {city && <div className="city-line">{t('city_line', { seed: city.seed, size: sizeLabel, w: city.w, h: city.h, lots: city.counts.lots.toLocaleString(lang) })}</div>}
      </header>

      <Journal t={t} gangsOpen={gangsOpen} onGangs={() => { setGangsOpen(!gangsOpen); logAction('gangs', !gangsOpen); }} />
      {city && !selectedPerson && <BuildingCard city={city} lot={lot} t={t} gangs={gangs} onClose={() => setLot(-1)} />}
      {selectedPerson && <PersonCard person={selectedPerson} gangs={gangs} t={t} onClose={() => setPerson(-1)} />}
      <WeekClock t={t} clock={clock} speed={speed} paused={paused}
        onSpeed={s => { setSpeed(s); store('ahs.speed', String(s)); logAction('speed', s); }}
        onPause={() => { setPaused(!paused); logAction('pause', !paused); }} onLaunch={launch} onFinish={finish} />
      {gangsOpen && core && <GangPanel gangs={gangs} t={t} names={p => personName(core, p)} onPerson={goToPerson}
        onClose={() => setGangsOpen(false)} />}
      <p className="view-help">{view === 'plan' ? t('plan_key') : t('view_help')}</p>
      {!city && <div className="loading">{loadError ? t('core_missing', { error: loadError }) : t('loading')}</div>}

      {debug && <DebugDrawer t={t} stamp={STAMP} buildId={core?.hs_build_id() ?? null} stateHash={stateHash} step2={step2} city={city} core={core}
        onClose={() => setDebug(false)} onSound={() => { logAction('test_sound'); chime(sound); }} onCrash={crash} />}

      {newGame && core && city && (
        <NewGameBox lang={lang} seed={city.seed} size={sizeOf(city)} onCancel={() => setNewGame(false)}
          onStart={(seed, size) => { setNewGame(false); logAction('new_game', { seed, size }); start(core, seed, size); chime(sound, 392); }} />
      )}

      {feedback && (
        <div className="overlay open" role="dialog" aria-modal="true" aria-labelledby="fb-title">
          <div className="box">
            <h2 id="fb-title">{t('report_title')}</h2>
            <label>{t('expected')}<textarea autoFocus value={expected} onChange={e => setExpected(e.target.value)} /></label>
            <div className="row">
              <button className="main" onClick={() => { logAction('report_cancelled'); setFeedback(false); }}>{t('cancel')}</button>
              <button className="main" disabled={expected.trim() === ''}
                onClick={() => { downloadReport('manual', expected.trim(), reportContext); setExpected(''); setFeedback(false); }}>{t('download')}</button>
            </div>
          </div>
        </div>
      )}

      {stop && (
        <div className="overlay open" role="alertdialog" aria-modal="true" aria-labelledby="crash-title">
          <div className="box">
            <h2 id="crash-title">{t('crash_title')}</h2>
            <p>{t('crash_text', { code: stop.code, name: t(`err${stop.code}` as Key) })}</p>
            <p className="where">{stop.file}:{stop.line}</p>
            <div className="row">
              <button className="main" onClick={() => downloadReport('crash', null, reportContext)}>{t('download')}</button>
              <button className="main" onClick={() => location.reload()}>{t('reload')}</button>
            </div>
          </div>
        </div>
      )}
      <div className="stamp">{STAMP}</div>
    </div>
  );
}
