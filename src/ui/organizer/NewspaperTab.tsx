import { useEffect, useState } from 'react';
import { useGame } from '../../app/store';
import { NEWSPAPER_NAMES } from '../../sim/data/names';
import { newspaperEdition, newspaperLead, newspaperNameIndex } from '../../sim/newspaper';
import type { Sim } from '../../sim/sim';
import type { NewsItem } from '../../sim/types';
import { MASTHEADS, art, pressPhoto } from '../art';
import { Empty } from '../common';

const SECTIONS: { id: NewsItem['section']; label: string }[] = [
  { id: 'front', label: 'Front Page' },
  { id: 'business', label: 'Business Moves' },
  { id: 'law', label: 'Law Enforcement' },
  { id: 'crime', label: 'Crimes' },
  { id: 'charity', label: 'Charitable' },
  { id: 'deaths', label: 'Deaths' },
  { id: 'politics', label: 'Political News' },
  { id: 'city', label: 'Around Town' },
];

/** The week's paper: an engraved masthead, a lead with a halftone photograph, the rest in columns. */
export function NewspaperTab() {
  const sim = useGame((s) => s.sim)!;
  useGame((s) => s.version);
  return <NewspaperContent sim={sim} />;
}

export function NewspaperContent({ sim }: { sim: Sim }) {
  const [section, setSection] = useState<NewsItem['section']>('front');

  const w = sim.world;
  const { paper, week: lastWeek, items } = newspaperEdition(w, sim.playerGang.id);
  useEffect(() => setSection('front'), [sim, w.week]);
  const activeSection = items.some(n => n.section === section) ? section : 'front';
  const all = items.filter((n) => n.section === activeSection);
  // The front page prints its lead story large; everything else follows it, and
  // the lead is never repeated in the columns below.
  const lead = activeSection === 'front' ? newspaperLead(items) : null;
  const shown = lead ? all.filter((n) => n !== lead) : all;
  const paperIndex = paper ? newspaperNameIndex(w, paper) : 0;
  const paperName = NEWSPAPER_NAMES[paperIndex];
  const photo = lead ? pressPhoto(lead.photo) : null;

  const available = SECTIONS.filter((s) => items.some((n) => n.section === s.id) || s.id === 'front' && newspaperLead(items) != null);

  return (
    <div className="newspaper">
      <div className="masthead">
        {paper ? <img className="masthead-img" src={MASTHEADS[paperIndex]} alt={paperName} /> : <h2>No newspaper available</h2>}
        <div className="meta">
          <span>New Temperance</span>
          <span>{lastWeek === 0 ? 'Opening edition' : `Week ${lastWeek}`}</span>
          <span>Two Cents</span>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 4, marginBottom: 10 }}>
        {(available.length ? available : SECTIONS.slice(0, 1)).map((s) => (
          <button key={s.id} aria-pressed={activeSection === s.id} className={`btn sm${activeSection === s.id ? ' on' : ''}`} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {lead && (
        <div className="lead" style={{ marginBottom: 12 }}>
          <h2>{lead.headline}</h2>
          {photo && (
            <figure className="press-photo">
              <img src={photo} alt="" />
            </figure>
          )}
          <p>{lead.body}</p>
        </div>
      )}

      {shown.length === 0 ? (
        lead ? null : <Empty>No news under this heading.</Empty>
      ) : (
        <>
          <img className="rule-ornament" src={art('press/rule-ornament.png')} alt="" />
          <div className={shown.length > 2 ? 'paper-cols' : ''}>
            {shown.map((n, i) => (
              <article key={i}>
                <h3>{n.headline}</h3>
                {n.photo && pressPhoto(n.photo) && (
                  <figure className="press-photo">
                    <img src={pressPhoto(n.photo)!} alt="" />
                  </figure>
                )}
                <p>{n.body}</p>
              </article>
            ))}
          </div>
        </>
      )}

      <img className="column-end" src={art('press/column-end.png')} alt="" />
    </div>
  );
}
