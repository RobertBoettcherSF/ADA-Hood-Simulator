import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame } from '../app/store';
import { MINUTES_PER_WEEK } from '../sim/constants';
import { CONTROL_EXCLUDE, CONTROL_SCOPE, CONTROL_SELECTOR, controlHelp, controlLabel, keyFromTip } from './controlHelp';

interface Shown {
  kind: 'tip' | 'card';
  x: number;
  y: number;
  title: string;
  body?: string;
  rows: { label: string; value: string }[];
}

const TIP_DELAY_MS = 350;

function controlAt(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(CONTROL_SELECTOR);
  if (!(el instanceof HTMLElement) || !el.closest(CONTROL_SCOPE) || el.closest(CONTROL_EXCLUDE)) return null;
  return el;
}

/** The button's own tooltip, moved off the element so the browser does not draw a second one. */
function tipOf(el: HTMLElement): string {
  const title = el.getAttribute('title');
  if (title) {
    el.setAttribute('data-tip', title);
    el.removeAttribute('title');
  }
  return el.getAttribute('data-tip') ?? '';
}

function crewRows(teamId: number): { title: string; rows: Shown['rows'] } | null {
  const sim = useGame.getState().sim;
  const team = sim?.world.teams[teamId];
  if (!sim || !team) return null;
  const lt = sim.world.people[team.lieutenantId];
  const orders = team.orderIds.filter((id) => sim.world.orders[id]).length;
  return {
    title: lt?.name ?? team.name,
    rows: [
      { label: 'Crew', value: team.name },
      { label: 'People', value: String(team.memberIds.length + 1) },
      { label: 'Week given out', value: `${Math.round((team.timeUsed / MINUTES_PER_WEEK) * 100)}%` },
      { label: 'Orders', value: String(orders) },
      ...(lt ? [{ label: 'Loyalty', value: String(Math.round(lt.loyalty)) }, { label: 'Status', value: lt.status }] : []),
    ],
  };
}

function describe(el: HTMLElement, kind: Shown['kind'], x: number, y: number): Shown | null {
  const tip = tipOf(el);
  const label = controlLabel(el);
  const help = controlHelp(label) ?? (tip ? controlHelp(tip) : undefined);
  if (kind === 'tip') {
    const text = tip || label;
    return text ? { kind, x, y, title: text, rows: [] } : null;
  }
  const teamId = el.closest('[data-team-id]')?.getAttribute('data-team-id');
  const crew = teamId ? crewRows(Number(teamId)) : null;
  const rows: Shown['rows'] = [...(crew?.rows ?? [])];
  const keys = help?.keys ?? keyFromTip(tip);
  if (keys) rows.push({ label: 'Key', value: keys });
  const pressed = el.getAttribute('aria-pressed') ?? el.getAttribute('aria-selected');
  if (pressed === 'true' || pressed === 'false') rows.push({ label: 'Now', value: pressed === 'true' ? 'On' : 'Off' });
  if ((el as HTMLButtonElement).disabled) rows.push({ label: 'Now', value: 'Not available' });
  const body = help?.body ?? (tip && tip !== label ? tip : undefined);
  const title = crew?.title ?? (label || tip);
  if (!title) return null;
  return { kind, x, y, title, body, rows };
}

/**
 * Tips on hover and a detail card on right-click for the desk's buttons, in
 * place of the browser's own tooltip and context menu there.
 */
export function ControlHelp() {
  const [shown, setShown] = useState<Shown | null>(null);
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    let timer = 0;
    let over: HTMLElement | null = null;
    const hideTip = () => {
      window.clearTimeout(timer);
      over = null;
      setShown((now) => (now?.kind === 'tip' ? null : now));
    };
    const onOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const el = controlAt(event.target);
      if (el === over) return;
      hideTip();
      if (!el) return;
      over = el;
      tipOf(el);
      const { clientX, clientY } = event;
      timer = window.setTimeout(() => {
        if (over !== el || !el.isConnected) return;
        const next = describe(el, 'tip', clientX, clientY);
        setShown((now) => (now?.kind === 'card' ? now : next));
      }, TIP_DELAY_MS);
    };
    const onMove = (event: PointerEvent) => {
      if (over && event.pointerType === 'mouse') setShown((now) => (now?.kind === 'tip' ? { ...now, x: event.clientX, y: event.clientY } : now));
    };
    const onMenu = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !target.closest(CONTROL_SCOPE) || target.closest(CONTROL_EXCLUDE)) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      const el = controlAt(target);
      window.clearTimeout(timer);
      setShown(el ? describe(el, 'card', event.clientX, event.clientY) : null);
    };
    const onDown = (event: PointerEvent) => {
      if (event.button === 2) return;
      hideTip();
      setShown((now) => (now?.kind === 'card' ? null : now));
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShown((now) => {
        if (now?.kind === 'card') event.stopImmediatePropagation();
        return null;
      });
    };
    window.addEventListener('pointerover', onOver);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('contextmenu', onMenu);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', hideTip);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('contextmenu', onMenu);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', hideTip);
    };
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !shown) return;
    const rect = el.getBoundingClientRect();
    const gap = shown.kind === 'tip' ? 16 : 10;
    let left = shown.x + gap;
    let top = shown.y + gap;
    if (left + rect.width > window.innerWidth - 8) left = shown.x - rect.width - gap;
    if (top + rect.height > window.innerHeight - 8) top = shown.y - rect.height - gap;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${Math.max(8, top)}px`;
  }, [shown]);

  if (!shown) return null;
  if (shown.kind === 'tip') {
    return <div ref={box as React.RefObject<HTMLDivElement>} className="control-tip" role="tooltip">{shown.title}</div>;
  }
  return (
    <aside ref={box} className="inspect-card control-card" role="dialog" aria-label={shown.title}>
      <h4>{shown.title}</h4>
      {shown.body && <p>{shown.body}</p>}
      {!!shown.rows.length && (
        <dl>
          {shown.rows.map((row, i) => (
            <div key={`${row.label}${i}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}
