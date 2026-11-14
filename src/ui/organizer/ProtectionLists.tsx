import { useState } from 'react';
import { useGame } from '../../app/store';
import { collectQueued } from '../../sim/collectRoutes';
import { buildingName, money, protectedBuildings } from '../../sim/world';
import { Empty, Panel, Pill } from '../common';

type ExtortSort = 'week' | 'name' | 'result';
type OwedSort = 'pays' | 'name' | 'status' | 'queued';

/**
 * 1.2.44 (Robert): the Protection lists — (a) every shop we tried to extort
 * (agreed or refused, the week, the crew) and (b) every shop that owes us
 * (paid or refused last week, queued this week, what it pays). Sortable;
 * a click shows the shop on the map.
 */
export function ProtectionLists() {
  const sim = useGame((s) => s.sim)!;
  const selectBuilding = useGame((s) => s.selectBuilding);
  const requestCamera = useGame((s) => s.requestCamera);
  useGame((s) => s.version);
  const [extortSort, setExtortSort] = useState<ExtortSort>('week');
  const [owedSort, setOwedSort] = useState<OwedSort>('pays');
  const w = sim.world;
  const gang = sim.playerGang;
  const show = (id: number) => {
    const b = w.buildings[id];
    if (!b) return;
    selectBuilding(b.id);
    requestCamera({ x: w.lots[b.lotId].center.x, y: w.lots[b.lotId].center.y });
  };

  const tries = Object.entries(w.extortLog ?? {}).map(([id, e]) => ({ id: Number(id), ...e, name: w.buildings[Number(id)] ? buildingName(w, Number(id)) : 'gone' }))
    .filter((e) => w.buildings[e.id])
    .sort((a, b) => extortSort === 'week' ? b.week - a.week || a.name.localeCompare(b.name)
      : extortSort === 'name' ? a.name.localeCompare(b.name)
      : Number(b.agreed) - Number(a.agreed) || b.week - a.week);

  const queued = collectQueued(w, gang.id);
  const lastWeek = w.week - 1;
  const owed = protectedBuildings(w, gang.id).map((b) => {
    const p = b.protection!;
    const status = p.collectedWeek === w.week ? 'paid this week' : p.collectedWeek === lastWeek ? 'paid last week' : p.refusedWeek === lastWeek ? 'refused last week' : p.refusing ? 'refusing' : 'not collected last week';
    const crewId = queued.get(b.id);
    return { b, name: buildingName(w, b.id), pays: p.weekly, status, crew: crewId != null ? w.teams[crewId]?.name ?? 'a crew' : '' };
  }).sort((a, b) => owedSort === 'pays' ? b.pays - a.pays || a.name.localeCompare(b.name)
    : owedSort === 'name' ? a.name.localeCompare(b.name)
    : owedSort === 'queued' ? Number(!!a.crew) - Number(!!b.crew) || b.pays - a.pays
    : a.status.localeCompare(b.status) || b.pays - a.pays);
  const unassigned = owed.filter((o) => !o.crew && o.status !== 'paid this week').length;

  const sorter = <T extends string>(now: T, set: (v: T) => void, options: [T, string][]) => (
    <div className="row" style={{ gap: 4, marginBottom: 4 }}>
      <span className="muted tiny">Sort:</span>
      {options.map(([id, label]) => (
        <button key={id} aria-pressed={now === id} className={`chip${now === id ? ' on' : ''}`} onClick={() => set(id)}>{label}</button>
      ))}
    </div>
  );

  return (
    <>
      <Panel title={`Shops That Owe Us (${owed.length}; ${unassigned} unassigned this week)`}>
        {owed.length === 0 ? <Empty>No shop pays us protection yet.</Empty> : (
          <>
            {sorter(owedSort, setOwedSort, [['pays', 'Pays'], ['name', 'Name'], ['status', 'Last week'], ['queued', 'Queued']])}
            <div className="scroll-list" style={{ maxHeight: 260 }}>
              {owed.map((o) => (
                <button key={o.b.id} className="list-row" onClick={() => show(o.b.id)} title="Show on the map">
                  <span className="name tiny">{o.name}</span>
                  <Pill kind={o.status.startsWith('paid') ? 'good' : o.status.startsWith('refus') ? 'bad' : undefined}>{o.status}</Pill>
                  <span className="muted tiny">{o.crew ? `queued: ${o.crew}` : 'not queued'}</span>
                  <span className="muted tiny mono">{money(o.pays)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </Panel>
      <Panel title={`Extortion Tries (${tries.length})`}>
        {tries.length === 0 ? <Empty>No shop asked for protection yet.</Empty> : (
          <>
            {sorter(extortSort, setExtortSort, [['week', 'Week'], ['name', 'Name'], ['result', 'Result']])}
            <div className="scroll-list" style={{ maxHeight: 260 }}>
              {tries.map((e) => (
                <button key={e.id} className="list-row" onClick={() => show(e.id)} title="Show on the map">
                  <span className="name tiny">{e.name}</span>
                  <Pill kind={e.agreed ? 'good' : 'bad'}>{e.agreed ? 'agreed' : 'refused'}</Pill>
                  <span className="muted tiny">week {e.week}{e.crew ? ` · ${e.crew}` : ''}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
