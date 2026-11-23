// The building card, the person card, the gang panel and the week clock
// (live), and the panels that come in later steps (shown, disabled, with
// the step that brings them).
import React from 'react';
import { CLASSES, City, DISTRICTS, EMPTY_LAND, FACES } from '../city';
import { MINUTES_PER_DAY, MINUTES_PER_WEEK } from '../core';
import { Key, Lang, translate } from '../i18n';
import { Clock, Gang, Person } from '../people';
import { GANG_COLOURS } from '../street/scene';
import { CHURCH_NAMES, PARK_NAMES, SKILLS, TYPE_NAMES } from '../tables';

type T = (key: Key, vars?: Record<string, string | number>) => string;

export function BuildingCard({ city, lot, t, onClose, gangs }: { city: City; lot: number; t: T; onClose: () => void; gangs: Gang[] }) {
  const l = city.lots[lot];
  if (!l) return <aside className="card building-card idle"><p>{t('card_none')}</p></aside>;
  const b = city.blocks[l.block];
  const hq = city.hq.find(h => h.lot === l.id);
  const church = l.type === TYPE_NAMES.indexOf('Church') && b.name >= 0 ? CHURCH_NAMES[b.name] : null;
  const name = church ?? TYPE_NAMES[l.type] ?? TYPE_NAMES[EMPTY_LAND];
  const row = (k: Key, v: string | number) => <div><dt>{t(k)}</dt><dd>{v}</dd></div>;
  return (
    <aside className="card building-card" aria-live="polite">
      <header>
        <span className="swatch" data-cls={l.cls} />
        <div>
          <h3>{name}</h3>
          <div className="sub">{t(`cls_${CLASSES[l.cls]}` as Key)} · {t(`dist_${DISTRICTS[b.district]}` as Key)}</div>
        </div>
        <button className="close" onClick={onClose} aria-label={t('card_close')}>×</button>
      </header>
      <dl>
        {row('card_value', b.landValue)}
        {row('card_squalor', b.squalor)}
        {row('card_block', `${b.gx}, ${b.gy}${b.spanX * b.spanY > 1 ? ` (${b.spanX} × ${b.spanY})` : ''}`)}
        {row('card_plot', l.index)}
        {row('card_storeys', l.storeys)}
        {row('card_faces', t(`face_${FACES[l.face]}` as Key))}
      </dl>
      {hq && <p className="note">{t('card_hq', { name: gangs[hq.gang - 1]?.name ?? hq.gang })}</p>}
      {b.use === 1 && b.name >= 0 && <p className="note">{PARK_NAMES[b.name]}</p>}
    </aside>
  );
}

const LATER: [Key, number][] = [
  ['p_orders', 5], ['p_trams', 6], ['p_police', 7], ['p_money', 8], ['p_rivals', 9], ['p_reports', 10], ['p_auto', 11],
];

export function Journal({ t, gangsOpen, onGangs }: { t: T; gangsOpen: boolean; onGangs: () => void }) {
  return (
    <nav className="journal" aria-label="Journal">
      <button className="live" aria-pressed={gangsOpen} onClick={onGangs}><span>{t('p_gangs')}</span></button>
      {LATER.map(([k, n]) => (
        <button key={k} disabled title={t('later_title', { n })}>
          <span>{t(k)}</span><small>{t('later', { n })}</small>
        </button>
      ))}
    </nav>
  );
}

export const SPEEDS = [1, 2, 4, 8, 0] as const;   // 0 = as fast as a frame allows

/** "Monday 8:00" for a minute of the week (five days of 480 minutes from 8:00). */
export function clockText(t: T, minute: number) {
  const m = Math.min(minute, MINUTES_PER_WEEK - 1);
  const day = Math.floor(m / MINUTES_PER_DAY), within = minute >= MINUTES_PER_WEEK ? MINUTES_PER_DAY : m % MINUTES_PER_DAY;
  const h = 8 + Math.floor(within / 60), mm = within % 60;
  return { day: t(`day${day}` as Key), time: `${h}:${String(mm).padStart(2, '0')}` };
}

export function WeekClock({ t, clock, speed, onSpeed, onLaunch, onFinish, paused, onPause }: {
  t: T; clock: Clock | null; speed: number; onSpeed: (s: number) => void; onLaunch: () => void; onFinish: () => void;
  paused: boolean; onPause: () => void;
}) {
  if (!clock) return null;
  const { day, time } = clockText(t, clock.minute);
  const pct = Math.floor(clock.minute * 100 / MINUTES_PER_WEEK);
  return (
    <div className="card week-clock" aria-live="off">
      <div className="clock-line">
        <strong>{t('clock_line', { w: clock.week, day: clock.running ? day : t('planning'), time: clock.running ? time : '' })}</strong>
        <small>{t('walking_now', { n: clock.walking.toLocaleString() })}</small>
      </div>
      <div className="week-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        aria-label={t('week_bar', { w: clock.week, pct })} title={t('week_bar', { w: clock.week, pct })}>
        {[0, 1, 2, 3, 4].map(d => <i key={d} />)}<b style={{ width: `${pct}%` }} />
      </div>
      {clock.gameOver ? <p className="note">{t('game_over')}</p> : (
        <div className="clock-buttons">
          {clock.running
            ? <>
                <button className="main" aria-pressed={paused} onClick={onPause}>{t('pause')}</button>
                <button className="main" onClick={onFinish}>{t('finish')}</button>
              </>
            : <button className="main" onClick={onLaunch}>{t('launch')}</button>}
          <span className="speeds" aria-label={t('speed')}>
            {SPEEDS.map(s => (
              <button key={s} aria-pressed={speed === s} onClick={() => onSpeed(s)}>{s === 0 ? t('speed_max') : `${s}×`}</button>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

const stars = (halves: number) => '★'.repeat(Math.floor(halves / 2)) + (halves % 2 ? '½' : '');

export function PersonCard({ person, gangs, t, onClose }: { person: Person; gangs: Gang[]; t: T; onClose: () => void }) {
  const gang = person.gang > 0 ? gangs[person.gang - 1] : null;
  const row = (k: Key, v: string | number) => <div><dt>{t(k)}</dt><dd>{v}</dd></div>;
  const where = person.walking ? t('pc_walking') : person.building >= 0 ? t('pc_inside') : t('pc_standing');
  return (
    <aside className="card building-card person-card" aria-live="polite">
      <header>
        <span className="swatch" style={{ background: gang ? GANG_COLOURS[gang.colour % 4] : '#b9ab8f', borderRadius: '50%' }} />
        <div>
          <h3>{person.name}</h3>
          <div className="sub">{t(`role_${person.role}` as Key)} · #{person.id}</div>
        </div>
        <button className="close" onClick={onClose} aria-label={t('pc_close')}>×</button>
      </header>
      <dl>
        {row('pc_gang', gang ? t('g_name', { name: gang.name }) : t('pc_none'))}
        {row('pc_where', where)}
        {gang && person.role !== 'boss' && row('pc_pay', `$${person.pay}`)}
        {gang && person.role !== 'boss' && row('pc_demand', `$${person.demand}`)}
        {gang && row('pc_loyalty', `${person.loyalty.toFixed(2)} %`)}
        {gang && row('pc_attitude', `${person.hostility} / ${person.fear}`)}
      </dl>
      <h4>{t('pc_skills')}</h4>
      <dl className="skills">
        {SKILLS.map((k, i) => <div key={k}><dt>{t(`sk_${k}` as Key)}</dt><dd>{stars(person.skills[i])}</dd></div>)}
      </dl>
    </aside>
  );
}

export function GangPanel({ gangs, t, names, onPerson, onClose }: {
  gangs: Gang[]; t: T; names: (person: number) => string; onPerson: (person: number) => void; onClose: () => void;
}) {
  const man = (p: number) => p >= 0
    ? <button className="link" key={p} onClick={() => onPerson(p)}>{names(p)}</button> : <span key="none">—</span>;
  const player = gangs.findIndex(g => g.player);
  return (
    <aside className="drawer gang-panel" aria-label={t('g_title')}>
      <header><h2>{t('g_title')}</h2><button className="close" onClick={onClose} aria-label={t('pc_close')}>×</button></header>
      {gangs.map(g => (
        <section key={g.id}>
          <h3><span className="swatch" style={{ background: GANG_COLOURS[g.colour % 4] }} /> {t('g_name', { name: g.name })}
            <small> · {g.player ? t('g_player') : t('g_rival', { p: g.profile })}{g.eliminated ? ` · ${t('g_out')}` : ''}</small></h3>
          <dl>
            <div><dt>{t('g_boss')}</dt><dd>{man(g.boss)}</dd></div>
            <div><dt>{t('g_lt')}</dt><dd>{man(g.lieutenant)}</dd></div>
            <div><dt>{t('g_crew')}</dt><dd>{g.crew.length ? g.crew.map(man) : '—'}</dd></div>
            <div><dt>{t('g_pool')}</dt><dd>{g.pool.length ? g.pool.map(man) : '—'}</dd></div>
            <div><dt>{t('g_manager')}</dt><dd>{man(g.manager)}</dd></div>
            <div><dt>{t('g_front')}</dt><dd>{TYPE_NAMES[g.frontType] ?? '—'}</dd></div>
            <div><dt>{t('g_cash')}</dt><dd>${g.cash.toLocaleString()}</dd></div>
            <div><dt>{t('g_wages')}</dt><dd>${g.wages.toLocaleString()}</dd></div>
          </dl>
          <p className="sum">{t('g_kit', { p: g.pistols, c: g.coupes, cp: g.crewPistols, cc: g.crewCoupes })}</p>
          <p className="sum">{t('g_protects', { n: g.protectedCount })}</p>
          {!g.player && player >= 0 && <p className="sum">{t('g_offers', { s: t(`st_${g.offered[player]}` as Key) })}</p>}
        </section>
      ))}
    </aside>
  );
}

export const SIZES = { small: [36, 28], standard: [40, 32], large: [44, 35] } as const;
export type Size = keyof typeof SIZES;

export function NewGameBox({ lang, seed, size, onStart, onCancel }: {
  lang: Lang; seed: number; size: Size; onStart: (seed: number, size: Size) => void; onCancel: () => void;
}) {
  const t: T = (k, v) => translate(lang, k, v);
  const [text, setText] = React.useState(String(seed));
  const [pick, setPick] = React.useState<Size>(size);
  const value = /^\d{1,10}$/.test(text.trim()) ? Number(text.trim()) : NaN;
  const ok = Number.isInteger(value) && value <= 4294967295;
  return (
    <div className="overlay open" role="dialog" aria-modal="true" aria-labelledby="ng-title"
      onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}>
      <form className="box" onSubmit={e => { e.preventDefault(); if (ok) onStart(value, pick); }}>
        <h2 id="ng-title">{t('ng_title')}</h2>
        <label>{t('ng_seed')}
          <input autoFocus inputMode="numeric" value={text} onChange={e => setText(e.target.value)} aria-invalid={!ok} />
        </label>
        {!ok && <p className="warn">{t('seed_bad')}</p>}
        <fieldset>
          <legend>{t('ng_size')}</legend>
          {(Object.keys(SIZES) as Size[]).map(s => (
            <label key={s} className="choice">
              <input type="radio" name="size" checked={pick === s} onChange={() => setPick(s)} />
              {t(s)} <small>{t('size_note', { w: SIZES[s][0], h: SIZES[s][1] })}</small>
            </label>
          ))}
        </fieldset>
        <div className="row">
          <button type="button" className="main" onClick={onCancel}>{t('cancel')}</button>
          <button type="submit" className="main" disabled={!ok}>{t('ng_start')}</button>
        </div>
      </form>
    </div>
  );
}
