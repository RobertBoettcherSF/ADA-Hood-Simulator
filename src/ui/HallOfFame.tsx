import { useState, type CSSProperties } from 'react';
import { clearHallOfFame, hallOfFameTable, loadHallOfFame, type HallEntry } from '../app/save';
import { GANG_COLORS } from '../sim/constants';
import type { Person } from '../sim/types';
import { money } from '../sim/world';
import { ArtImage } from './ArtImage';
import { art } from './art';
import { Modal, Rivets } from './common';
import { Portrait } from './Portrait';

/** Manual p.83: the top three, then the next best eight at a time. */
export const TOP_GANGSTERS = 3;
export const NEXT_BEST_PAGE = 8;

/** The pages of the Hall: page 0 is the Leading Bosses; later pages are Next Best. */
export function hallPages(entries: readonly HallEntry[]): HallEntry[][] {
  const pages = [entries.slice(0, TOP_GANGSTERS)];
  for (let i = TOP_GANGSTERS; i < entries.length; i += NEXT_BEST_PAGE) pages.push(entries.slice(i, i + NEXT_BEST_PAGE));
  return pages;
}

function Face({ entry, size }: { entry: HallEntry; size: number }) {
  if (entry.portrait == null) return <div className="hall-face blank" style={{ width: size, height: size }} />;
  const person = { name: entry.name, portrait: entry.portrait, female: !!entry.female, face: entry.face, status: 'active' } as Person;
  return (
    <div className="hall-face" style={{ '--gang-color': entry.color ? GANG_COLORS[entry.color].hex : 'transparent' } as CSSProperties}>
      <Portrait person={person} size={size} />
    </div>
  );
}

function Achievements({ entry }: { entry: HallEntry }) {
  if (entry.legend && entry.empire) return (
    <div className="hall-achievements">
      <div className="fate">{entry.reason}</div>
      <div><b>Empire</b> {money(entry.empire.cash)} · {entry.empire.blocks} blocks · {entry.empire.men} men</div>
      <div><b>Crime</b> {entry.legend.kills} killing{entry.legend.kills === 1 ? '' : 's'} laid at the door</div>
    </div>
  );
  if (!entry.empire && !entry.crime) return <div className="fate">{entry.reason}</div>;
  return (
    <div className="hall-achievements">
      <div className="fate">{entry.reason}</div>
      {entry.empire && (
        <div><b>Empire</b> {money(entry.empire.cash)} at the peak · {entry.empire.blocks} blocks · {entry.empire.men} men · {entry.empire.businesses} businesses</div>
      )}
      {entry.crime && (
        <div><b>Crime</b> {entry.crime.crimes} crimes on file · {entry.crime.rivalsEliminated} rival gang{entry.crime.rivalsEliminated === 1 ? '' : 's'} wiped out</div>
      )}
    </div>
  );
}

export function HallOfFame({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState(hallOfFameTable);
  const ownResults = loadHallOfFame().length;
  const [page, setPage] = useState(0);
  const pages = hallPages(entries);
  const shown = pages[page] ?? [];
  const first = page === 0 ? 0 : TOP_GANGSTERS + (page - 1) * NEXT_BEST_PAGE;
  return (
    <Modal
      title="Hall of Fame"
      kicker={page === 0 ? 'Leading Bosses' : `Next Best · ${first + 1}–${first + shown.length}`}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn" disabled={page === 0} onClick={() => setPage(0)}>Leading Bosses</button>
          <button className="btn" disabled={pages.length < 2}
            onClick={() => setPage(page + 1 < pages.length ? page + 1 : 1)}>Next Best</button>
          <button className="btn red-text" disabled={ownResults === 0} onClick={() => { clearHallOfFame(); setEntries(hallOfFameTable()); setPage(0); }}>Clear</button>
          <button className="btn" onClick={onClose}>Exit</button>
        </>
      }
    >
      {entries.length === 0 ? (
        <p className="muted">Nobody has made their name yet.</p>
      ) : (
        <div className="brass flat hall-plaque">
          <div className="brass-face">
            <Rivets />
            <div className="plaque-head">
              <ArtImage src={art('endings/plaque-header.png')} alt="" />
              <span>{page === 0 ? 'Leading Bosses' : 'Next Best'}</span>
            </div>
            {shown.map((h, i) => (
              <div key={h.resultId ?? `${h.name}-${h.at}`} className={`plaque-row hall-row${page === 0 ? ' top' : ''}${h.legend ? ' hall-legend' : ''}`}>
                <span className="rank">{first + i + 1}</span>
                <Face entry={h} size={page === 0 ? 64 : 40} />
                <div>
                  <h3>{h.name}</h3>
                  {page === 0 ? <Achievements entry={h} /> : <div className="fate">{h.reason}</div>}
                </div>
                <span className="weeks">{h.legend ? 'Legend' : `${h.weeks} week${h.weeks === 1 ? '' : 's'}`}</span>
                <span className="score">{h.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
