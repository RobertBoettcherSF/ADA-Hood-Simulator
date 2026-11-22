// The Debug drawer: the checks of steps 1 to 3 against 1.2.91 values, the
// test sound and the crash test.
import React from 'react';
import { City } from '../city';
import { hex, u32 } from '../core';
import { Key } from '../i18n';
import { CITY_REFS, EXPECTED_CHECKS, REF_INT, REF_MAIN, REF_PLAN } from '../references';

type T = (key: Key, vars?: Record<string, string | number>) => string;

export interface Step2 {
  streams: number[][]; checks: number[]; gw: number; gh: number; pattern: number[]; worldHash: number;
}
export const STEP2_WORLD = { seed: 1932, auto: 1932, w: 44, h: 35 };

export function step2Matches(s: Step2) {
  const refs = [REF_MAIN, REF_INT, REF_PLAN];
  return {
    random: s.streams.reduce((n, list, k) => n + list.filter((v, i) => v === refs[k][i]).length, 0),
    checks: s.checks.filter((v, i) => v === EXPECTED_CHECKS[i]).length,
  };
}

export function cityReference(city: City) {
  return CITY_REFS.find(r => r.w === city.w && r.h === city.h && r.seed === city.seed) ?? null;
}

const Cell = ({ v, expect }: { v: number; expect: number }) => <td className={v === expect ? "ok" : "bad"}>{v}</td>;

interface Props {
  t: T; stamp: string; buildId: number | null; stateHash: number | null; step2: Step2 | null; city: City | null;
  onClose: () => void; onSound: () => void; onCrash: () => void;
}

export function DebugDrawer({ t, stamp, buildId, stateHash, step2, city, onClose, onSound, onCrash }: Props) {
  const ref = city ? cityReference(city) : null;
  const cityRows: [string, number, number | null][] = city ? [
    [t('d_rng'), city.rngAfter, ref?.rng ?? null],
    [t('d_city'), city.cityHash, ref?.city ?? null],
    [t('d_structure'), city.structureHash, ref?.structure ?? null],
    ['blocks', city.counts.blocks, ref?.blocks ?? null],
    ['merged', city.counts.merged, ref?.merged ?? null],
    ['lots', city.counts.lots, ref?.lots ?? null],
    ['buildings', city.counts.buildings, ref?.buildings ?? null],
    ['types', city.counts.typesUsed, ref?.types ?? null],
    ...(ref?.hq.length ? ref.hq.map((xy, g): [string, number, number] => {
      const got = city.hq[g] ? city.blocks[city.hq[g].block] : null;
      return [`HQ ${g + 1} (gx·100 + gy)`, got ? got.gx * 100 + got.gy : -1, xy[0] * 100 + xy[1]];
    }) : []),
  ] : [];
  const cityMatch = cityRows.filter(([, v, r]) => r !== null && u32(v) === u32(r)).length;
  const m = step2 ? step2Matches(step2) : null;
  const refs = [REF_MAIN, REF_INT, REF_PLAN];
  return (
    <aside className="drawer" aria-label={t('d_title')}>
      <header><h2>{t('d_title')}</h2><button className="close" onClick={onClose} aria-label={t('d_close')}>×</button></header>

      <section>
        <h3>{t('d_step3')}</h3>
        {city && <p className="sum">{t('d_counts', { b: city.counts.blocks, m: city.counts.merged, l: city.counts.lots,
          n: city.counts.buildings, t: city.counts.typesUsed, r: city.retries })}</p>}
        <p className="sum">{ref ? t('d_match', { n: cityMatch, m: cityRows.length }) : t('d_no_ref')}</p>
        <table><tbody>
          {cityRows.map(([k, v, r]) => (
            <tr key={k}><th>{k}</th>
              {r === null ? <td>{u32(v)}</td> : <Cell v={u32(v)} expect={u32(r)} />}
              <td>{r === null ? '' : u32(r)}</td></tr>
          ))}
        </tbody></table>
      </section>

      <section>
        <h3>{t('d_step1')}</h3>
        <table><tbody>
          <tr><th>{t('d_stamp')}</th><td>{stamp}</td></tr>
          <tr><th>{t('d_build_id')}</th><td>{buildId ?? '…'}</td></tr>
          <tr><th>{t('d_state')}</th><td>{stateHash === null ? '…' : `${hex(stateHash)} (${u32(stateHash)})`}</td></tr>
        </tbody></table>
        <div className="row">
          <button className="main" onClick={onSound}>{t('test_sound')}</button>
          <button className="main danger" onClick={onCrash}>{t('crash_test')}</button>
        </div>
      </section>

      {step2 && m && (
        <section>
          <h3>{t('d_step2')}</h3>
          <p className="sum">{t('random_sum', { n: m.random, m: 60 })}</p>
          <div className="scroll"><table>
            <thead><tr><th>{t('col_i')}</th><th>{t('col_main')}</th><th>{t('col_ref')}</th><th>{t('col_int')}</th>
              <th>{t('col_ref')}</th><th>{t('col_plan')}</th><th>{t('col_ref')}</th></tr></thead>
            <tbody>{REF_MAIN.map((_, i) => (
              <tr key={i}><td>{i + 1}</td>
                {[0, 1, 2].map(k => <React.Fragment key={k}><Cell v={step2.streams[k][i]} expect={refs[k][i]} /><td>{refs[k][i]}</td></React.Fragment>)}
              </tr>
            ))}</tbody>
          </table></div>
          <p className="sum">{t('numbers_sum', { n: m.checks, m: step2.checks.length })}</p>
          <table>
            <thead><tr><th>{t('col_check')}</th><th>{t('col_ada')}</th><th>{t('col_exp')}</th></tr></thead>
            <tbody>{step2.checks.map((v, i) => (
              <tr key={i}><th>{t(`c${i + 1}` as Key)}</th><Cell v={v} expect={EXPECTED_CHECKS[i]} /><td>{EXPECTED_CHECKS[i]}</td></tr>
            ))}</tbody>
          </table>
          <p className="sum">{t('grid_sum', { w: step2.gw, h: step2.gh, n: step2.gw * step2.gh })}</p>
          <div className="grid-sample" aria-hidden="true">
            {step2.pattern.map((k, i) => <i key={i} className={k === 1 ? 'b' : k === 0 ? 's' : 'x'} />)}
          </div>
          <p className="sum">{t('grid_legend')}</p>
          <p className="sum">{t('world_sum', { seed: STEP2_WORLD.seed, auto: STEP2_WORLD.auto, w: step2.gw, h: step2.gh,
            hash: `${hex(step2.worldHash)} (${u32(step2.worldHash)})` })}</p>
        </section>
      )}
    </aside>
  );
}
