import { useState } from 'react';
import { useGame } from '../app/store';
import type { MessageCategory } from '../sim/types';
import { Modal } from './common';
import { CATEGORIES } from './WeekHud';
import { clockLabel } from '../sim/world';

/**
 * 1.2.21: every report of the week just played, grouped under the street
 * view's message labels and in the order they came in. A click centres the
 * map on where it happened.
 */
export function WeekReports({ className = 'btn' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className={className} title="All of this week's street reports, grouped as in the street view" onClick={() => setOpen(true)}>Reports</button>
    {open && <ReportsSheet onClose={() => setOpen(false)} />}
  </>;
}

function ReportsSheet({ onClose }: { onClose: () => void }) {
  const sim = useGame((s) => s.sim)!;
  const requestCamera = useGame((s) => s.requestCamera);
  useGame((s) => s.version);
  const messages = [...sim.world.messages].sort((a, b) => a.minute - b.minute || a.id - b.id);
  const groups = (Object.keys(CATEGORIES) as MessageCategory[]).map((c) => ({ c, list: messages.filter((m) => m.category === c) }));
  return (
    <Modal title={`Reports — week ${sim.world.week}`} onClose={onClose} width={620}>
      {messages.length === 0 && <p className="muted">No reports this week.</p>}
      {groups.filter((g) => g.list.length).map(({ c, list }) => (
        <div key={c} style={{ marginBottom: 10 }}>
          <b>{CATEGORIES[c].name}</b> <span className="muted tiny">({list.length})</span>
          <div className="scroll-list" style={{ maxHeight: 240 }}>
            {list.map((m) => (
              <button key={m.id} className="list-row" disabled={!m.pos}
                onClick={() => { if (m.pos) { requestCamera({ x: m.pos.x, y: m.pos.y }); onClose(); } }}>
                <span className="muted mono tiny" style={{ minWidth: 92 }}>{clockLabel(m.minute)}</span>
                <span className="tiny">{m.text}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}
