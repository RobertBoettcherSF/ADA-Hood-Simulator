// Item 5's panels: the crews drawer (crews, their men and orders, the pool,
// last week's orders and this week's messages) and the job card that stages
// an order: crew, order, men, sites picked in the street or on the plan,
// options, the estimate, then Give the order.
import React from 'react';
import { Exports, MINUTES_PER_WEEK, PERSON_FIELD, TABLE } from '../core';
import { Key } from '../i18n';
import {
  CMD, Crew, Draft, Line, Order, OrderKind, ORDER_DEFS, ORDER_KINDS, Preview, command, crewName, issueDraft,
  newDraft, previewDraft, readCrews, readLastWeek, readOrder, Reply,
} from '../orders';
import { TextContext, hm, lineText, money, orderName, replyText } from '../orderText';
import { TYPE_CLASSES, TYPE_COSTS, TYPE_NAMES } from '../tables';
import { clockText } from './Panels';

type T = (key: Key, vars?: Record<string, string | number>) => string;

/** Pay steps of the crew panel (proposed). */
const PAY_STEP = 10;

export interface OrdersView { crews: Crew[]; orders: Order[]; last: Order[]; pool: number[]; messages: Line[] }

export function readOrdersView(core: Exports, gang: number, pool: number[], messages: Line[]): OrdersView {
  const crews = readCrews(core, gang);
  return { crews, orders: crews.flatMap(c => c.orders.map(s => readOrder(core, s))), last: readLastWeek(core, gang), pool, messages };
}

interface CrewsProps {
  t: T; x: TextContext; core: Exports; view: OrdersView; running: boolean;
  onPerson: (p: number) => void; onNewOrder: (crew: number) => void; onChanged: (reply: Reply) => void; onClose: () => void;
  onShow: (order: Order) => void;
}

function OrderLine({ t, x, o, onCancel, onShow }: { t: T; x: TextContext; o: Order; onCancel?: () => void; onShow: () => void }) {
  const where = o.targets.length === 1 ? x.place(o.targets[0])
    : o.point ? t('o_point') : t('o_sites', { n: o.targets.length });
  const at = o.finished >= 0 ? clockText(t, o.finished) : null;
  return (
    <li className={`order-line st-${o.state}`}>
      <button className="link" onClick={onShow}>{orderName(x.lang, o.kind)}</button>
      <span className="where"> · {where}</span>
      <span className="state"> · {t(`st_${o.state}` as Key)}{o.estimate > 0 && o.state === 'queued' ? ` · ${hm(o.estimate)}` : ''}
        {at ? ` · ${t('o_done_at', { day: at.day, time: at.time })}` : ''}
        {o.assigned.length ? ` · ${o.assigned.map(p => x.person(p)).join(', ')}` : ''}</span>
      {onCancel && <button className="mini" onClick={onCancel} title={t('o_cancel')} aria-label={t('o_cancel')}>×</button>}
      {o.fail.kind !== 'L_None' && <div className="fail">{lineText(x, o.fail)}</div>}
      {o.results.length > 0 && <ul className="results">{o.results.map((l, i) => <li key={i}>{lineText(x, l)}</li>)}</ul>}
    </li>
  );
}

export function CrewsPanel({ t, x, core, view, running, onPerson, onNewOrder, onChanged, onClose, onShow }: CrewsProps) {
  const act = (cmd: number, a: number, b = 0) => onChanged(command(core, cmd, a, b));
  const pay = (p: number) => core.hs_get(TABLE.person, p, PERSON_FIELD.pay);
  const man = (p: number, crew: Crew | null) => (
    <li key={p} className="man">
      <button className="link" onClick={() => onPerson(p)}>{x.person(p)}</button>
      <span className="pay"> {money(x.lang, pay(p))}</span>
      <span className="acts">
        <button className="mini" title={t('o_pay_down')} aria-label={t('o_pay_down')} onClick={() => act(CMD.setPay, p, Math.max(0, pay(p) - PAY_STEP))}>−</button>
        <button className="mini" title={t('o_pay_up')} aria-label={t('o_pay_up')} onClick={() => act(CMD.setPay, p, pay(p) + PAY_STEP)}>+</button>
        {crew
          ? <button className="mini wide" onClick={() => act(CMD.moveToPool, p)}>{t('o_to_pool')}</button>
          : view.crews.map(c => <button key={c.slot} className="mini wide" onClick={() => act(CMD.moveToCrew, p, c.slot)}>
              {t('o_to_crew', { crew: crewName(c) })}</button>)}
        <button className="mini wide" onClick={() => act(CMD.promote, p)}>{t('o_promote')}</button>
        <button className="mini wide danger" onClick={() => act(CMD.sack, p)}>{t('o_sack')}</button>
      </span>
    </li>
  );
  return (
    <aside className="drawer crews-panel" aria-label={t('o_title')}>
      <header><h2>{t('o_title')}</h2><button className="close" onClick={onClose} aria-label={t('pc_close')}>×</button></header>
      {view.crews.map(c => {
        const orders = view.orders.filter(o => o.crew === c.slot);
        const cap = Math.max(1, c.men) * MINUTES_PER_WEEK;
        return (
          <section key={c.slot}>
            <h3>{crewName(c)} <small>· {t('o_lt')} <button className="link" onClick={() => onPerson(c.lieutenant)}>{x.person(c.lieutenant)}</button></small></h3>
            <p className="sum">{t('o_crew_time', { used: c.timeUsed.toLocaleString(), cap: cap.toLocaleString(), men: c.men })}</p>
            <ul className="men">{c.members.length ? c.members.map(p => man(p, c)) : <li>{t('o_none')}</li>}</ul>
            <h4>{t('o_orders')}</h4>
            <ul className="orders">
              {orders.length ? orders.map(o => <OrderLine key={o.slot} t={t} x={x} o={o} onShow={() => onShow(o)}
                onCancel={['done', 'failed', 'cancelled'].includes(o.state) ? undefined : () => act(CMD.cancel, o.slot)} />) : <li>{t('o_none')}</li>}
            </ul>
            <div className="row">
              <button className="main" onClick={() => onNewOrder(c.slot)}>{t('o_new')}</button>
              <button className="main danger" onClick={() => act(CMD.demote, c.slot)}>{t('o_demote')}</button>
            </div>
          </section>
        );
      })}
      <section>
        <h3>{t('o_pool')}</h3>
        <ul className="men">{view.pool.length ? view.pool.map(p => man(p, null)) : <li>{t('o_none')}</li>}</ul>
      </section>
      <section>
        <h3>{t('o_last')}</h3>
        <ul className="orders">
          {view.last.length ? view.last.map((o, i) => (
            <React.Fragment key={i}>
              <OrderLine t={t} x={x} o={o} onShow={() => onShow(o)} />
              <li className="again"><button className="mini wide" disabled={running}
                onClick={() => onChanged(command(core, CMD.repeat, o.slot))}>{t('o_again')}</button></li>
            </React.Fragment>
          )) : <li>{t('o_none')}</li>}
        </ul>
      </section>
      <section>
        <h3>{t('o_messages')}</h3>
        <ul className="messages">
          {view.messages.length ? view.messages.map((l, i) => <li key={i}>{lineText(x, l)}</li>) : <li>{t('o_no_messages')}</li>}
        </ul>
      </section>
    </aside>
  );
}

/** Business types the job card offers for Set Up: those with a fit-out price (proposed). */
const BUSINESSES = TYPE_NAMES.map((n, i) => ({ id: i, name: n, cost: TYPE_COSTS[i], cls: TYPE_CLASSES[i] }))
  .filter(b => b.cost > 0 && ['commercial', 'industrial', 'illegal'].includes(b.cls))
  .sort((a, b) => a.name.localeCompare(b.name));

interface JobProps {
  t: T; x: TextContext; core: Exports; crews: Crew[]; draft: Draft; setDraft: (d: Draft) => void; selectedBuilding: number;
  selectedBlock: number; onIssued: (r: Reply) => void; onClose: () => void;
}

export function JobCard({ t, x, core, crews, draft, setDraft, selectedBuilding, selectedBlock, onIssued, onClose }: JobProps) {
  const def = ORDER_DEFS[draft.kind];
  const [reply, setReply] = React.useState<Reply | null>(null);
  // tickNo-free: the preview is read again on every render (cheap, no draws).
  const preview: Preview | null = React.useMemo(() => previewDraft(core, draft), [core, draft]);
  const set = (p: Partial<Draft>) => { setReply(null); setDraft({ ...draft, ...p }); };
  const kind = (k: OrderKind) => set({ ...newDraft(draft.crew, k), manpower: Math.min(draft.manpower, ORDER_DEFS[k].max) });
  const lt = crews.find(c => c.slot === draft.crew);
  const pick = def.target === 'point' ? t('job_pick_point') : def.target === 'area' ? t('job_pick_area') : t('job_pick_building');
  const give = () => {
    const r = issueDraft(core, draft);
    setReply(r);
    if (r.ok) onIssued(r);
  };
  return (
    <aside className="card job-card" aria-label={t('job_title')}>
      <header>
        <h3>{t('job_title')}</h3>
        <button className="close" onClick={onClose} aria-label={t('job_close')}>×</button>
      </header>
      <div className="fields">
        <label>{t('job_crew')}
          <select value={draft.crew} onChange={e => set({ crew: Number(e.target.value) })}>
            {crews.map(c => <option key={c.slot} value={c.slot}>{crewName(c)}</option>)}
          </select>
        </label>
        <label>{t('job_kind')}
          <select value={draft.kind} onChange={e => kind(e.target.value as OrderKind)}>
            {ORDER_KINDS.map(k => <option key={k} value={k}>{orderName(x.lang, k)}</option>)}
          </select>
        </label>
        <label>{t('job_men')}
          <input type="number" min={1} max={def.max} value={draft.manpower}
            onChange={e => set({ manpower: Math.max(1, Math.min(def.max, Math.trunc(Number(e.target.value) || 1))) })} />
          <small> {t('job_men_note', { max: def.max, have: lt ? lt.members.length + 1 : 0 })}</small>
        </label>
        {draft.kind === 'donate' && <label>{t('job_amount')}
          <input type="number" min={0} step={10} value={draft.amount < 0 ? '' : draft.amount}
            onChange={e => set({ amount: e.target.value === '' ? -1 : Math.max(0, Math.trunc(Number(e.target.value))) })} /></label>}
        {draft.kind === 'adjust' && <label>{t('job_level')}
          <input type="number" min={0} max={200} step={10} value={draft.level < 0 ? '' : draft.level}
            onChange={e => set({ level: e.target.value === '' ? -1 : Math.max(0, Math.min(200, Math.trunc(Number(e.target.value)))) })} /></label>}
        {draft.kind === 'setUp' && <>
          <label>{t('job_business')}
            <select value={draft.business} onChange={e => set({ business: Number(e.target.value) })}>
              <option value={-1}>—</option>
              {BUSINESSES.map(b => <option key={b.id} value={b.id}>{b.name} · {money(x.lang, b.cost)}</option>)}
            </select>
          </label>
          <div className="pickrow">{t('job_front')}: {draft.front >= 0 ? x.place(draft.front) : '—'}
            <button className="mini wide" disabled={selectedBuilding < 0} onClick={() => set({ front: selectedBuilding })}>{t('job_front_pick')}</button></div>
        </>}
        <label className="check"><input type="checkbox" checked={draft.repeat} onChange={e => set({ repeat: e.target.checked })} /> {t('job_repeat')}</label>
      </div>
      <p className="hint">{pick}</p>
      <div className="pickrow">
        {def.target !== 'point' && <button className="mini wide" disabled={selectedBuilding < 0 || draft.buildings.includes(selectedBuilding)}
          onClick={() => set({ buildings: def.target === 'building' ? [selectedBuilding] : [...draft.buildings, selectedBuilding] })}>{t('job_add')}</button>}
        {def.target === 'area' && <button className="mini wide" disabled={selectedBlock < 0 || draft.blocks.includes(selectedBlock)}
          onClick={() => set({ blocks: [...draft.blocks, selectedBlock] })}>{t('job_block')}</button>}
        <button className="mini wide" onClick={() => set({ buildings: [], blocks: [], point: null })}>{t('job_clear')}</button>
      </div>
      <ul className="targets">
        {draft.buildings.map(b => <li key={`b${b}`}>{x.place(b)} <button className="mini" aria-label={t('job_remove')}
          onClick={() => set({ buildings: draft.buildings.filter(v => v !== b) })}>×</button></li>)}
        {draft.blocks.map(b => <li key={`k${b}`}>{t('o_block', { n: b })} <button className="mini" aria-label={t('job_remove')}
          onClick={() => set({ blocks: draft.blocks.filter(v => v !== b) })}>×</button></li>)}
        {draft.point && <li>{t('o_point')} ({Math.round(draft.point.x / 256)}, {Math.round(draft.point.y / 256)} m)</li>}
      </ul>
      {preview && (
        <p className="estimate">
          {preview.order.targets.length > 0 || preview.order.point ? t('job_estimate', { time: hm(preview.order.estimate) }) : ''}
          {preview.order.cost > 0 ? ` · ${t('job_cost', { cost: money(x.lang, preview.order.cost) })}` : ''}
          {preview.order.targets.length > 1 ? ` · ${t('o_sites', { n: preview.order.targets.length })}` : ''}
          {!preview.hasTime && (preview.order.targets.length > 0 || preview.order.point) ? ` · ${t('job_no_time')}` : ''}
          {preview.staffing.kind !== 'L_None' ? ` · ${lineText(x, preview.staffing)}` : ''}
        </p>
      )}
      {reply && <p className={reply.ok ? 'reply ok' : 'reply bad'} role="status">{replyText(x, reply)}</p>}
      {reply && reply.kind === 'Y_No_Time_Trim' && reply.kept.length > 0 &&
        <div className="pickrow"><button className="mini wide" onClick={() => set({ buildings: reply.kept, blocks: [] })}>{t('job_take_kept', { n: reply.kept.length })}</button></div>}
      <div className="row">
        <button className="main" onClick={onClose}>{t('job_close')}</button>
        <button className="main" onClick={give}>{t('job_issue')}</button>
      </div>
    </aside>
  );
}
