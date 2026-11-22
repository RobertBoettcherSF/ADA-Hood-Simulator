// The game screen: the street view (or the city plan) filling the window,
// the map buttons along the top, the journal of later panels, the building
// card, the week clock, and the boxes and drawer that open over them.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { City, readCity } from '../city';
import { CoreStop, Exports, HostStop, loadCore } from '../core';
import { Key, LANGS, Lang, translate } from '../i18n';
import { chime, downloadReport, logAction, logError, logEvent, store, stored } from '../report';
import { CityPlan } from './CityPlan';
import { DebugDrawer, STEP2_WORLD, Step2, cityReference, step2Matches } from './Debug';
import { BuildingCard, Journal, NewGameBox, SIZES, Size, WeekClock } from './Panels';
import { StreetView } from './StreetView';
import { Flag } from './Flags';

declare global { interface Window { HS: { stamp: string; wasm: string } } }

const STAMP = window.HS.stamp;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

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
  const t = useCallback((k: Key, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);

  const start = useCallback((c: Exports, seed: number, size: Size) => {
    const [w, h] = SIZES[size];
    const t0 = performance.now();
    c.hs_new_game(seed, seed, w, h);
    const next = readCity(c, seed);
    setCity(next); setLot(-1); setStateHash(c.hs_state_hash());
    logEvent('new_game', { seed, size, ms: Math.round(performance.now() - t0), city_hash: next.cityHash,
      structure_hash: next.structureHash, lots: next.counts.lots, status: next.status });
  }, []);

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
    setLot(id);
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
      selected_lot: lot, view, step2: step2 ? step2Matches(step2) : null,
    },
  }), [lang, sound, city, stateHash, core, loadError, lot, view, step2]);

  const crash = () => {
    logAction('crash_test');
    try { core?.hs_crash_test(4); } catch (e) { if (!(e instanceof HostStop)) logError('wasm', String(e)); }
  };

  const sizeLabel = city ? t(sizeOf(city)) : '';
  return (
    <div className="game-shell">
      {city && <StreetView city={city} selected={lot} onSelect={select} turnSignal={turn} visible={view === 'street'} label={t('street')} />}
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

      <Journal t={t} />
      {city && <BuildingCard city={city} lot={lot} t={t} onClose={() => setLot(-1)} />}
      <WeekClock t={t} />
      <p className="view-help">{view === 'plan' ? t('plan_key') : t('view_help')}</p>
      {!city && <div className="loading">{loadError ? t('core_missing', { error: loadError }) : t('loading')}</div>}

      {debug && <DebugDrawer t={t} stamp={STAMP} buildId={core?.hs_build_id() ?? null} stateHash={stateHash} step2={step2} city={city}
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
