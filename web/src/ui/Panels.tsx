// The building card (live), and the panels that come in later steps
// (shown, disabled, with the step that brings them).
import React from 'react';
import { CLASSES, City, DISTRICTS, EMPTY_LAND, FACES } from '../city';
import { Key, Lang, translate } from '../i18n';
import { CHURCH_NAMES, PARK_NAMES, TYPE_NAMES } from '../tables';

type T = (key: Key, vars?: Record<string, string | number>) => string;

export function BuildingCard({ city, lot, t, onClose }: { city: City; lot: number; t: T; onClose: () => void }) {
  const l = city.lots[lot];
  if (!l) return <aside className="card building-card idle"><p>{t('card_none')}</p></aside>;
  const b = city.blocks[l.block];
  const hq = city.hq.find(h => h.block === b.id);
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
      {hq && <p className="note">{t('card_hq', { g: hq.gang })}</p>}
      {b.use === 1 && b.name >= 0 && <p className="note">{PARK_NAMES[b.name]}</p>}
    </aside>
  );
}

const LATER: [Key, number][] = [
  ['p_people', 4], ['p_orders', 5], ['p_trams', 6], ['p_police', 7], ['p_money', 8], ['p_rivals', 9], ['p_reports', 10], ['p_auto', 11],
];

export function Journal({ t }: { t: T }) {
  return (
    <nav className="journal" aria-label="Journal">
      {LATER.map(([k, n]) => (
        <button key={k} disabled title={t('later_title', { n })}>
          <span>{t(k)}</span><small>{t('later', { n })}</small>
        </button>
      ))}
    </nav>
  );
}

export function WeekClock({ t }: { t: T }) {
  return (
    <div className="card week-clock disabled" title={t('later_title', { n: 4 })}>
      <span>{t('p_clock')}</span><small>{t('later', { n: 4 })}</small>
    </div>
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
