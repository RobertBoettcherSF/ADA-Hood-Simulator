import { DialogFrame } from './DialogFrame';
import type { CSSProperties, ReactNode } from 'react';
import type { Gang, Person, Skills } from '../sim/types';
import { art, iconUrl } from './art';
import { useArtStatus } from './useArtStatus';
import { Portrait } from './Portrait';

/** Skill diamonds, one to five, half-filled for the half marks. */
export function Stars({ value, max = 5 }: { value: number; max?: number }) {
  const out = [];
  for (let i = 1; i <= max; i++) {
    const cls = value >= i ? 'full' : value >= i - 0.5 ? 'half' : '';
    out.push(<i key={i} className={`star ${cls}`} />);
  }
  return <span className="stars">{out}</span>;
}

/** The lieutenant's time indicator: a dial that fills as his week is spoken for. */
export function Dial({ pct, label, size, title }: { pct: number; label?: string; size?: number; title?: string }) {
  const p = Math.round(Math.max(0, Math.min(100, pct)));
  return (
    <div className="dial" title={title ?? `${p}%`} style={{ ['--pct' as string]: p, ...(size ? { width: size, height: size } : {}) }}>
      <span>{label ?? `${p}`}</span>
    </div>
  );
}

export function Meter({ value, max = 100, good }: { value: number; max?: number; good?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`meter${good ? ' good' : ''}`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Avatar({ person, gang, size }: { person: Person; gang?: Gang; size?: number }) {
  return (
    <div className="avatar" title={person.name}>
      <Portrait person={person} gang={gang} size={size ?? 30} />
    </div>
  );
}

export function Pill({ children, kind }: { children: ReactNode; kind?: 'good' | 'bad' | 'warn' }) {
  return <span className={`pill${kind ? ` ${kind}` : ''}`}>{children}</span>;
}

export function Money({ value }: { value: number }) {
  const neg = value < 0;
  return (
    <span className="mono" style={{ color: neg ? 'var(--red)' : undefined }}>
      {neg ? '-' : ''}${Math.abs(Math.round(value)).toLocaleString('en-US')}
    </span>
  );
}

/** The four brass screws that hold a plate to the desk. */
export function Rivets() {
  return (
    <>
      <i className="rivet tl" />
      <i className="rivet tr" />
      <i className="rivet bl" />
      <i className="rivet br" />
    </>
  );
}

/** A small uppercase label in brass ink. */
export function Kicker({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`kicker${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  );
}

/**
 * A sheet of paper in a brass frame, dropped over the desk: the load list, the
 * hall of fame, the briefing.
 */
export function Modal({
  title,
  kicker,
  children,
  onClose,
  footer,
  width,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <DialogFrame title={title} onClose={onClose} width={width}>
        <div className="paper sheet">
          <Rivets />
          <div className="brass-face sheet-head">
            <div>
              {kicker && <Kicker className="dark">{kicker}</Kicker>}
              <h3 className="sheet-title">{title}</h3>
            </div>
            <button className="sheet-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <div className="body">{children}</div>
          <div className="foot">{footer ?? <button className="btn" onClick={onClose}>Close</button>}</div>
        </div>
    </DialogFrame>
  );
}

/** A section of the page with a small brass heading. */
export function Panel({ title, right, children, className }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`panel${className ? ` ${className}` : ''}`}>
      {title && (
        <h4>
          <span>{title}</span>
          {right}
        </h4>
      )}
      {children}
    </div>
  );
}

const SKILL_ROWS: [keyof Skills, string][] = [
  ['intelligence', 'Intelligence'],
  ['organization', 'Organization'],
  ['business', 'Business'],
  ['firearms', 'Firearms'],
  ['fists', 'Fists'],
  ['knives', 'Knives'],
  ['arson', 'Arson'],
  ['explosives', 'Explosives'],
  ['intimidation', 'Intimidation'],
  ['driving', 'Driving'],
  ['stealth', 'Stealth'],
];

export function SkillList({ skills, columns = 2, only }: { skills: Skills; columns?: number; only?: readonly (keyof Skills)[] }) {
  return (
    <div className="skills" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {SKILL_ROWS.filter(([k]) => !only || only.includes(k)).map(([k, label]) => (
        <div key={k} className="row between tiny">
          <span className="muted">
            <Icon name={`skills/${k}`} size={13} /> {label}
          </span>
          <Stars value={skills[k]} />
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-note">{children}</div>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <div className="hint">{children}</div>;
}

/** "A window will appear, prompting you to confirm your actions." */
export function ConfirmDialog({ text, onYes, onNo }: { text: string; onYes: () => void; onNo: () => void }) {
  return (
    <DialogFrame title="Confirm action" onClose={onNo} width={460}>
        <div className="paper sheet">
          <Rivets />
          <div className="body" style={{ padding: '26px 24px 10px', fontSize: 15, lineHeight: 1.45 }}>
            {text}
          </div>
          <div className="foot">
            <button className="btn danger lg" onClick={onYes}>
              Yes
            </button>
            <button className="btn lg" data-autofocus onClick={onNo}>
              No
            </button>
          </div>
        </div>
    </DialogFrame>
  );
}

/**
 * One of the engraved glyphs from public/art/icons, cut out of the current
 * text colour: ink on paper, gold on brass, cream on a dark button.
 */
export function Icon({ name, size = 16, className, title }: { name: string; size?: number; className?: string; title?: string }) {
  const src = iconUrl(name, size);
  const loaded = useArtStatus(src) === 'loaded';
  if (!loaded) return <i className="icon icon-fallback" aria-hidden style={{ width: size, height: size }}>◆</i>;
  const url = `url(${src})`;
  return (
    <i
      className={`icon${className ? ` ${className}` : ''}`}
      title={title}
      aria-hidden
      style={{ width: size, height: size, WebkitMaskImage: url, maskImage: url }}
    />
  );
}

/** A red rubber stamp across a piece of paper: PAID, REFUSED, WANTED. */
export function Stamp({ kind, className }: { kind: 'paid' | 'refused' | 'wanted'; className?: string }) {
  return <img className={`stamp${className ? ` ${className}` : ''}`} src={art(`stamps/${kind}.png`)} alt={kind.toUpperCase()} draggable={false} />;
}
