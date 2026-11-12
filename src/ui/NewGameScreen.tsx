import { ArtImage } from './ArtImage';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { describeMode, newCampaignOptions } from '../app/newGame';
import { SCENARIOS, applyScenario } from '../app/scenarios';
import { useGame } from '../app/store';
import { GANG_COLORS } from '../sim/constants';
import { bossName } from '../sim/newGameValidation';
import { bossFace, HERITAGE_BY_ID, HERITAGES, sitterCount, type Heritage } from '../sim/heritage';
import { CITY_SIZE_PRESETS, citySizePreset, generatedCityDimensions, isOriginalCity, reconcileTerritorySetup,
  territorySetupMaximum, territorySetupMinimum, TerritoryTargetError } from '../sim/newGameValidation';
import type { GameOptions, GangColorName, Person } from '../sim/types';
import { crestUrl } from './art';
import { Icon } from './common';
import { Plaque } from './Plaque';
import { audio } from '../audio/audio';
import { Portrait } from './Portrait';

/** Step through the selected 64-male or 32-female pool, preserving the name sentinel. */
function stepPortrait(current: number, dir: 1 | -1, female: boolean): number {
  const n = female ? 32 : 64;
  return ((current + dir + n) % n) || n;
}

/** A stable number from a name, so the face on the form is the face in the game. */
export function portraitFromName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

export function NewGameScreen() {
  const options = useGame((s) => s.options);
  useEffect(() => { audio.music('menu'); }, []);
  const setOptions = useGame((s) => s.setOptions);
  const startGame = useGame((s) => s.startGame);
  const setScreen = useGame((s) => s.setScreen);
  const [seedText, setSeedText] = useState(String(options.seed));
  const [setupNotice, setSetupNotice] = useState('');
  const [capacity, setCapacity] = useState<{ key: string; maximum: number } | null>(null);
  const capacityKey = (o: GameOptions) => JSON.stringify({ ...o, territoryTarget: 0 });
  const currentCapacity = capacity?.key === capacityKey(options) ? capacity.maximum : undefined;
  const targetMaximum = territorySetupMaximum(options, currentCapacity);
  const cityDims = generatedCityDimensions(options), originalCity = isOriginalCity(options);
  useEffect(() => setSeedText(String(options.seed)), [options.seed]);
  // Options may come from an older save before this form is opened. Updating
  // the separate setup options must not rewrite that saved world's objective.
  useEffect(() => {
    const next = reconcileTerritorySetup(options, currentCapacity);
    if (next !== options) {
      setOptions(next);
      setSetupNotice(`Territory target adjusted from ${options.territoryTarget} to ${next.territoryTarget} blocks for this city.`);
    }
  }, [options, currentCapacity, setOptions]);

  const set = (patch: Partial<GameOptions>) => {
    const requested = { ...options, ...patch };
    const knownCapacity = capacity?.key === capacityKey(requested) ? capacity.maximum : undefined;
    const next = reconcileTerritorySetup(requested, knownCapacity);
    setSetupNotice(next.territoryTarget !== requested.territoryTarget
      ? `Territory target adjusted from ${requested.territoryTarget} to ${next.territoryTarget} blocks for this city.` : '');
    setOptions(next);
  };
  // Manual p.31: Restore Defaults resets the game conditions; your details stay.
  const restoreDefaults = () => {
    const d = newCampaignOptions();
    set({ mode: d.mode, scenarioId: undefined, tutorialId: undefined, economy: d.economy, opponents: d.opponents,
      startMoney: d.startMoney, startHoods: d.startHoods, startBusinesses: d.startBusinesses, powerWeeks: d.powerWeeks,
      wealthTarget: d.wealthTarget, territoryTarget: d.territoryTarget, citySize: d.citySize, cityHeight: d.cityHeight });
  };
  const beginGame = () => {
    try {
      startGame({ ...options, cityLayout: 'varied', playerPortrait: options.playerPortrait || portraitFromName(options.playerName) });
    } catch (error) {
      if (error instanceof TerritoryTargetError) {
        setCapacity({ key: capacityKey(options), maximum: error.maximum });
        const next = reconcileTerritorySetup(options, error.maximum);
        setOptions(next);
        setSetupNotice(`This city has at most ${error.maximum} controllable blocks. Territory target adjusted from ${options.territoryTarget} to ${next.territoryTarget}. Review the target and start when ready.`);
      } else setSetupNotice(error instanceof Error ? error.message : 'The game could not be started.');
    }
  };

  // The original's three desks: the summary, Change Details and Game Options.
  // A sheet edits the live options; Cancel puts back what was there.
  const [page, setPage] = useState<'desk' | 'details' | 'options'>('desk');
  const [snapshot, setSnapshot] = useState<GameOptions | null>(null);
  const openPage = (next: 'details' | 'options') => {
    setSnapshot(options);
    setPage(next);
  };
  const closePage = (keep: boolean) => {
    if (!keep && snapshot) setOptions(snapshot);
    if (!keep) setSetupNotice('');
    setSnapshot(null);
    setPage('desk');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (page === 'desk') setScreen('menu');
      else closePage(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The original's nationality and face traits: a heritage's painted sitters,
  // stepped through with the face arrows like the original's head buttons.
  const sitters = sitterCount(options.playerFemale);
  const sitter = ((options.playerSitter ?? 0) % sitters + sitters) % sitters;
  const suggestName = () => {
    const h = options.playerHeritage && HERITAGE_BY_ID[options.playerHeritage];
    if (!h) return;
    const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
    const name = `${pick(options.playerFemale ? h.female : h.male)} ${pick(h.surnames)}`;
    audio.pageTurn();
    set({ playerName: name, playerPortrait: portraitFromName(name) });
  };
  const preview = {
    name: bossName(options.playerName || 'The Boss', options.playerNickname),
    female: options.playerFemale,
    portrait: options.playerPortrait || portraitFromName(options.playerName),
    face: options.playerHeritage ? bossFace(options.playerHeritage, options.playerFemale, sitter) : undefined,
    status: 'active',
  } as Person;

  const seg = <T extends string>(value: T, list: readonly T[], label: (v: T) => ReactNode, on: (v: T) => void) => (
    <div className="chip-row">
      {list.map((v) => (
        <button key={v} type="button" aria-pressed={value === v} className={`chip${value === v ? ' on' : ''}`}
          onMouseEnter={() => audio.hover()} onClick={() => { audio.plaque(); on(v); }}>
          {label(v)}
        </button>
      ))}
    </div>
  );
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const colour = GANG_COLORS[options.playerColor];
  const stepFace = (dir: 1 | -1) => {
    audio.pageTurn();
    if (options.playerHeritage) set({ playerSitter: (sitter + dir + sitters) % sitters });
    else set({ playerPortrait: stepPortrait(preview.portrait, dir, options.playerFemale) });
  };

  const footer = (left: ReactNode, right: ReactNode, middle?: ReactNode) => (
    <div className="scene-foot">
      {left}
      <div className="scene-foot-mid">
        {setupNotice ? <span className="scene-notice" role="status">{setupNotice}</span> : middle}
      </div>
      {right}
    </div>
  );

  return (
    <div className={`scene scene-desk newgame page-${page}`}>
      <div className="scene-light" aria-hidden="true" />
      <div className="scene-mark">{page === 'desk' ? 'New Game' : page === 'details' ? 'Change Details' : 'Game Options'}</div>

      <div className="leader-card">
        <div className="scene-label">Gang Leader</div>
        <div className="leader-frame">
          {page === 'details' && <button type="button" className="face-step" aria-label="Previous face" title="The face before this one" onClick={() => stepFace(-1)}>◀</button>}
          <div className="leader-photo"><Portrait person={preview} size={132} /></div>
          {page === 'details' && <button type="button" className="face-step" aria-label="Next face" title="The next face" onClick={() => stepFace(1)}>▶</button>}
        </div>
        <div className="leader-name">{bossName(options.playerName || 'The Boss', options.playerNickname)}</div>
      </div>

      {page === 'desk' && (
        <>
          <Plaque size="sm" className="desk-plaque" onClick={() => openPage('details')}>Change Details</Plaque>
          <div className="smoked-panel desk-summary">
            <ArtImage className="summary-crest" src={crestUrl(options.playerColor)} alt={colour.label} draggable={false} />
            <div>
              <div className="scene-heading">{options.scenarioId ? 'Scenario' : options.mode === 'normal' ? 'Full Game' : `${cap(options.mode)} Game`}</div>
              <p className="summary-lead">{describeMode(options)}</p>
              <dl className="summary-facts">
                <div><dt>Economy</dt><dd>{cap(options.economy)}</dd></div>
                <div><dt>Opponents</dt><dd>{cap(options.opponents)}</dd></div>
                <div><dt>Money</dt><dd>${options.startMoney.toLocaleString('en-US')}</dd></div>
                <div><dt>Hoods</dt><dd>{options.startHoods}</dd></div>
                <div><dt>Businesses</dt><dd>{options.startBusinesses}</dd></div>
                <div><dt>City</dt><dd>{cityDims.w} × {cityDims.h}{originalCity ? ' · original' : ''}</dd></div>
              </dl>
            </div>
          </div>
          <Plaque size="sm" className="desk-plaque" onClick={() => openPage('options')}>Game Options</Plaque>
          {footer(
            <Plaque size="lg" disabled={options.mode === 'territory' && targetMaximum < 1} onClick={beginGame}>Start Game</Plaque>,
            <Plaque size="lg" onClick={() => setScreen('menu')}>Cancel</Plaque>,
          )}
        </>
      )}

      {page === 'details' && (
        <>
          <div className="smoked-panel details-panel">
            <div className="field">
              <label htmlFor="player-name" className="scene-label">Name</label>
              <input
                id="player-name"
                className="ivory-input"
                value={options.playerName}
                maxLength={28}
                onChange={(e) => set({ playerName: e.target.value, playerPortrait: portraitFromName(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="player-nickname" className="scene-label">Nickname</label>
              <input
                id="player-nickname"
                className="ivory-input"
                value={options.playerNickname ?? ''}
                maxLength={18}
                placeholder="What the papers call you"
                onChange={(e) => set({ playerNickname: e.target.value.replace(/"/g, '') })}
              />
            </div>
            <div className="field">
              <span className="scene-label">Bearing</span>
              {seg(
                options.playerFemale ? 'female' : 'male',
                ['male', 'female'] as const,
                (v) => (
                  <>
                    <Icon name={v === 'male' ? 'misc/bearingMale' : 'misc/bearingFemale'} size={14} /> {cap(v)}
                  </>
                ),
                (v) => set({ playerFemale: v === 'female' }),
              )}
            </div>
            <div className="field">
              <label htmlFor="player-heritage" className="scene-label">Heritage</label>
              <div className="heritage-row">
                <select id="player-heritage" className="ivory-input" value={options.playerHeritage ?? ''}
                  onChange={(e) => { audio.plaque(); set({ playerHeritage: (e.target.value || undefined) as Heritage | undefined }); }}>
                  <option value="">Any (the city's faces)</option>
                  {HERITAGES.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
                </select>
                {options.playerHeritage && <button type="button" className="chip" onClick={suggestName}>Suggest a name</button>}
              </div>
            </div>
            <div className="field">
              <span className="scene-label">Gang Colour</span>
              <div className="color-row">
                {(Object.keys(GANG_COLORS) as GangColorName[]).map((c) => (
                  <button key={c} type="button" aria-pressed={options.playerColor === c} className={`crest-swatch${options.playerColor === c ? ' on' : ''}`} style={{ '--gang-color': GANG_COLORS[c].hex } as CSSProperties} title={GANG_COLORS[c].label}
                    onClick={() => { audio.plaque(); set({ playerColor: c }); }}>
                    <ArtImage src={crestUrl(c)} alt={GANG_COLORS[c].label} draggable={false} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          {footer(
            <Plaque size="lg" onClick={() => closePage(true)}>OK</Plaque>,
            <Plaque size="lg" onClick={() => closePage(false)}>Cancel</Plaque>,
          )}
        </>
      )}

      {page === 'options' && (
        <>
          <div className="smoked-panel options-panel">
            <div className="options-col">
              <div className="scene-heading">Game Type</div>
              {seg(
                options.scenarioId ? 'scenario' : options.mode,
                ['normal', 'power', 'wealth', 'territory', 'scenario'] as const,
                (v) => (v === 'normal' ? 'Full' : cap(v)),
                (v) => {
                  if (v === 'scenario') set(applyScenario(options, SCENARIOS[0]));
                  else set({ mode: v, scenarioId: undefined, tutorialId: undefined });
                },
              )}
              {options.scenarioId && (
                <div className="scenario-list">
                  {SCENARIOS.map((sc) => (
                    <button key={sc.id} type="button" aria-pressed={options.scenarioId === sc.id} className={`scenario-slip${options.scenarioId === sc.id ? ' on' : ''}`}
                      onClick={() => { audio.pageTurn(); set(applyScenario(options, sc)); }}>
                      <span className="row between">
                        <b>{sc.name}</b>
                        <span className={`diff ${sc.difficulty}`}>{sc.difficulty}</span>
                      </span>
                      <span className="tiny">{sc.blurb}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="scene-note">
                {options.scenarioId
                  ? describeMode(options)
                  : options.mode === 'normal'
                    ? 'Full game: three endings — wipe out the rivals, win the mayoralty, or go straight with $250,000 in clean assets.'
                    : describeMode(options)}
              </p>
              {!options.scenarioId && options.mode === 'power' && (
                <div className="field">
                  <label htmlFor="NewGameScreen-field-1">
                    Weeks<span className="value">{options.powerWeeks}</span>
                  </label>
                  <input id="NewGameScreen-field-1" className="brass-rail" type="range" min={20} max={100} step={5} value={options.powerWeeks} onChange={(e) => set({ powerWeeks: Number(e.target.value) })} />
                </div>
              )}
              {!options.scenarioId && options.mode === 'wealth' && (
                <div className="field">
                  <label htmlFor="NewGameScreen-field-2">
                    Target wealth<span className="value">${options.wealthTarget.toLocaleString('en-US')}</span>
                  </label>
                  <input id="NewGameScreen-field-2" className="brass-rail" type="range" min={100000} max={500000} step={25000} value={options.wealthTarget} onChange={(e) => set({ wealthTarget: Number(e.target.value) })} />
                </div>
              )}
              {!options.scenarioId && options.mode === 'territory' && (
                <div className="field">
                  <label htmlFor="NewGameScreen-field-3">
                    Target blocks<span className="value">{options.territoryTarget}</span>
                  </label>
                  <input id="NewGameScreen-field-3" className="brass-rail" type="range" min={territorySetupMinimum(targetMaximum)} max={targetMaximum} step={targetMaximum >= 50 ? 25 : 1} value={options.territoryTarget} onChange={(e) => set({ territoryTarget: Number(e.target.value) })} />
                  <div className="scene-small">Choose {territorySetupMinimum(targetMaximum)}–{targetMaximum} blocks for this city size. The city's controllable blocks are checked before play begins.</div>
                </div>
              )}
              <div className="field">
                <span className="scene-label">Economy</span>
                {seg(options.economy, ['weak', 'normal', 'strong'] as const, cap, (v) => set({ economy: v }))}
              </div>
              <div className="field">
                <span className="scene-label">Opponents</span>
                {seg(options.opponents, ['passive', 'normal', 'aggressive', 'random'] as const, cap, (v) => set({ opponents: v }))}
              </div>
            </div>

            <div className="options-col">
              <div className="scene-heading">Starting Conditions</div>
              <div className="field">
                <label htmlFor="NewGameScreen-field-4">
                  Money<span className="value">${options.startMoney.toLocaleString('en-US')}</span>
                </label>
                <input id="NewGameScreen-field-4" className="brass-rail" type="range" min={3000} max={10000} step={500} value={options.startMoney} onChange={(e) => set({ startMoney: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label htmlFor="NewGameScreen-field-5">
                  Total starting hoods<span className="value">{options.startHoods}</span>
                </label>
                <input id="NewGameScreen-field-5" className="brass-rail" type="range" min={3} max={10} value={options.startHoods} onChange={(e) => set({ startHoods: Number(e.target.value) })} />
                <div className="scene-small">1 lieutenant + 1 crew hood + 1 front manager{options.startHoods > 3 ? ` + ${options.startHoods - 3} in the pool` : ''}. Your boss is separate.</div>
              </div>
              <div className="field">
                <label htmlFor="NewGameScreen-field-6">
                  Businesses<span className="value">{options.startBusinesses}</span>
                </label>
                <input id="NewGameScreen-field-6" className="brass-rail" type="range" min={1} max={10} value={options.startBusinesses} onChange={(e) => set({ startBusinesses: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label htmlFor="NewGameScreen-field-7">
                  City size
                  <span className="value">
                    {cityDims.w} × {cityDims.h} blocks
                  </span>
                </label>
                {seg(
                  citySizePreset(options) ?? 'standard',
                  ['small', 'standard', 'large'] as const,
                  (v) => `${CITY_SIZE_PRESETS[v].label} ${CITY_SIZE_PRESETS[v].w}×${CITY_SIZE_PRESETS[v].h}`,
                  (v) => set({ citySize: CITY_SIZE_PRESETS[v].w, cityHeight: CITY_SIZE_PRESETS[v].h }),
                )}
                <div className="scene-small">{originalCity
                  ? 'The standard 40 × 32 city, laid out as in the original game.'
                  : citySizePreset(options) === 'small' ? 'A smaller 36 × 28 city: rivals are closer and the election needs fewer blocks.'
                    : citySizePreset(options) === 'large' ? 'A larger 44 × 35 city with more room to grow.'
                      : `${cityDims.w} × ${cityDims.h} blocks (a test size).`}</div>
              </div>
              <div className="field">
                <label htmlFor="city-seed">City seed</label>
                <div className="row">
                  <input
                    id="city-seed"
                    className="ivory-input typewriter"
                    inputMode="numeric"
                    value={seedText}
                    onChange={(e) => {
                      // Digits only, so what is shown is always the seed used.
                      const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                      const seed = digits ? Number(digits) >>> 0 : 0;
                      setSeedText(String(seed));
                      set({ seed });
                    }}
                  />
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      audio.plaque();
                      const n = Math.floor(Math.random() * 0xffffffff) >>> 0;
                      setSeedText(String(n));
                      set({ seed: n });
                    }}
                  >
                    <Icon name="misc/roll" size={14} /> Roll
                  </button>
                </div>
              </div>
            </div>
          </div>
          {footer(
            <Plaque size="lg" onClick={() => closePage(true)}>OK</Plaque>,
            <Plaque size="lg" onClick={() => closePage(false)}>Cancel</Plaque>,
            <Plaque size="sm" onClick={restoreDefaults} title="Reset the game type and starting conditions; your name, face and colour stay">Restore Defaults</Plaque>,
          )}
        </>
      )}
    </div>
  );
}
