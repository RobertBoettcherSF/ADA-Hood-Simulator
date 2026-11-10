import { MoneyRoll } from '../MoneyRoll';
import { MapAccess } from '../MapAccess';
import { JobCardPanel } from '../JobCardPanel';
import { useGame, type OrganizerTab } from '../../app/store';
import type { OverlayKind } from '../../render/scene';
import { MINUTES_PER_WEEK, ORDERS } from '../../sim/constants';
import { gangAssets, territoryCount, gangManpower, money } from '../../sim/world';
import { spendableCash } from '../../sim/orderCost';
import { cameraApi } from '../CityView';
import { VIEW_ZOOM } from '../../render/viewModes';
import { Icon, Kicker, Rivets } from '../common';
import { AccountantTab } from './AccountantTab';
import { DiplomacyTab } from './DiplomacyTab';
import { GraphsTab } from './GraphsTab';
import { LawyerTab } from './LawyerTab';
import { LieutenantStrip, LieutenantsTab } from './LieutenantsTab';
import { MapsTab } from './MapsTab';
import { LieutenantAreaControls } from './LieutenantAreaControls';
import { NewspaperTab } from './NewspaperTab';
import { OptionsTab } from './OptionsTab';
import { RightSheet } from './RightSheet';
import { TutorialPanel } from '../TutorialPanel';
import { SpecialistJobCard } from '../SpecialistJobCard';
import { SPECIALIST_JOB_NAMES } from '../../sim/specialistJobs';
import { buildingList } from '../../sim/entityLists';

const TABS: { id: OrganizerTab; label: string; key: string }[] = [
  { id: 'lieutenants', label: 'Lieutenants', key: 'F1' },
  { id: 'accountant', label: 'Accountant', key: 'F2' },
  { id: 'lawyer', label: 'Lawyer', key: 'F3' },
  { id: 'diplomacy', label: 'Diplomacy', key: 'F4' },
  { id: 'newspaper', label: 'Newspaper', key: 'F5' },
  { id: 'graphs', label: 'Graphs', key: 'F6' },
  { id: 'maps', label: 'City Maps', key: 'F7' },
  { id: 'options', label: 'Game Options', key: 'F8' },
];

const MAP_OVERLAYS: { id: OverlayKind; label: string }[] = [
  { id: 'territory', label: 'Territory' },
  { id: 'lieutenant', label: "Lt's area" },
  { id: 'landValue', label: 'Land value' },
  { id: 'security', label: 'Security' },
  { id: 'hostility', label: 'Hostility' },
  { id: 'crime', label: 'Crime hot spots' },
  { id: 'events', label: 'Recent events' },
];

/**
 * The manual's Organizer hierarchy: all eight sections across the top,
 * lieutenant details and orders on the left, map/resources on the right.
 */
export function Organizer() {
  const jobCard = useGame(s => s.jobCard);
  const staff = useGame(s => s.specialistCard);
  const selectedTeamId = useGame(s => s.selectedTeamId);
  const sim = useGame((s) => s.sim);
  const tab = useGame((s) => s.organizerTab);
  const setTab = useGame((s) => s.setTab);
  const launchWeek = useGame((s) => s.launchWeek);
  const endWeekNow = useGame((s) => s.endWeekNow);
  const collapsed = useGame((s) => s.organizerCollapsed);
  const setCollapsed = useGame((s) => s.setOrganizerCollapsed);
  const pickMode = useGame((s) => s.pickMode);
  const overlays = useGame((s) => s.overlays);
  const toggleOverlay = useGame((s) => s.toggleOverlay);
  const requestCamera = useGame((s) => s.requestCamera);
  const planningView = useGame((s) => s.planningView);
  const setPlanningView = useGame((s) => s.setPlanningView);
  useGame((s) => s.version);

  if (!sim) return null;
  const w = sim.world;
  const gang = sim.playerGang;

  const mapButtons = (
    <div className="brass flat map-buttons">
      <div className="instrument">
        <Rivets />
        <Kicker className="gold">Map</Kicker>
        <button className={`hud-btn${planningView === 'plan' ? ' on' : ''}`} onClick={() => setPlanningView('plan')} title="Street plan with building types and known holdings">
          <Icon name="tabs/maps" size={13} /> City plan
        </button>
        <button className={`hud-btn${planningView === 'city' ? ' on' : ''}`} onClick={() => setPlanningView('city')} title="The city itself">
          City
        </button>
        {planningView === 'city' && (
          <>
            <button className="hud-btn" onClick={() => cameraApi.ref?.setZoom(VIEW_ZOOM.plan)} title="City Plan (Insert)">
              Plan
            </button>
            <button className="hud-btn" onClick={() => cameraApi.ref?.setZoom(VIEW_ZOOM.roof)} title="Rooftop (Home)">
              Rooftop
            </button>
            <button className="hud-btn" onClick={() => cameraApi.ref?.setZoom(VIEW_ZOOM.street)} title="Street (Page Up)">
              Street
            </button>
            <button className="hud-btn" onClick={() => cameraApi.ref?.flipView()} title="Flip the view (F)">
              Flip
            </button>
            <button
              className="hud-btn"
              title="Centre on your headquarters"
              onClick={() => {
                const hq = buildingList(w).find((b) => b.ownerGangId === gang.id && b.isHQ);
                if (hq) requestCamera({ x: w.lots[hq.lotId].center.x, y: w.lots[hq.lotId].center.y });
              }}
            >
              ⌂ HQ
            </button>
          </>
        )}
        <span className="sep" />
        {MAP_OVERLAYS.map((o) => (
          <button key={o.id} aria-pressed={overlays.includes(o.id)} className={`hud-btn${overlays.includes(o.id) ? ' on' : ''}`} onClick={() => toggleOverlay(o.id)}>
            <Icon name={`overlays/${o.id}`} size={13} /> {o.label}
          </button>
        ))}
        <button className="hud-btn" title="Clear map overlays" onClick={()=>useGame.getState().setOverlays([])}>Clear</button>
      </div>
    </div>
  );

  if (collapsed) {
    const team = pickMode?.kind === 'lieutenantArea' ? w.teams[pickMode.teamId] : null;
    const lt = team ? w.people[team.lieutenantId] : null;
    const targetKind = jobCard ? ORDERS[jobCard.type].target : null;
    const selection = !jobCard ? '' : targetKind === 'area'
      ? `${jobCard.blockIds.length} block${jobCard.blockIds.length === 1 ? '' : 's'} · ${jobCard.buildingIds.length} individual site${jobCard.buildingIds.length === 1 ? '' : 's'} selected`
      : targetKind === 'building' ? `${jobCard.buildingIds.length} site selected`
      : targetKind === 'person' ? (jobCard.personId != null ? 'Person selected' : 'Choose a person')
      : targetKind === 'point' ? (jobCard.pos ? 'Position selected' : 'Choose a position')
      : 'No target needed';
    return (
      <>
        {staff ? <div className="brass flat order-target-bar" role="region" aria-label="Specialist map selection"><div className="instrument">
          <Kicker className="gold">{SPECIALIST_JOB_NAMES[staff.type]}</Kicker>
          <button className="btn" onClick={() => setCollapsed(false)}>Back to order</button>
          <MapAccess label="Clipboard" />
          <button className="btn" onClick={() => { useGame.getState().selectSpecialistTarget(null); useGame.getState().clearPoliceArea(); }}>Clear selection</button>
        </div></div> : jobCard ? (
          <div className="brass flat order-target-bar" role="region" aria-label="Order map selection">
            <div className="instrument">
              <div><Kicker className="gold">{ORDERS[jobCard.type].name}</Kicker><span role="status">{selection}</span></div>
              <button className="btn" onClick={() => setCollapsed(false)}>Back to order</button>
              <MapAccess label="Find by name" />
              <button className="btn" onClick={() => useGame.getState().updateJobCard({ buildingIds: [], blockIds: [], personId: null, pos: null })}>Clear selection</button>
            </div>
          </div>
        ) : planningView === 'plan' ? (
          <div className="brass flat plan-map-bar">
            <div className="instrument">
              <button className="btn" onClick={() => setCollapsed(false)}>Open journal</button>
              <MapAccess label="Find by name" />
              <LieutenantAreaControls />
            </div>
          </div>
        ) : <>
          <MapAccess className="btn map-access-floating" />
          <button className="journal-handle" onClick={() => setCollapsed(false)} title="Open the journal">
            <span>▲ Open the journal</span>
          </button>
        </>}
        {!jobCard && !staff && planningView === 'city' && <div className="brass flat map-card">
          <div className="instrument">
            <Rivets />
            <span className="kicker gold">Map</span>
            {team && lt
              ? <LieutenantAreaControls />
              : ' · click a site for its papers'}
          </div>
        </div>}
        {mapButtons}
      </>
    );
  }

  const boss = w.people[gang.bossId];
  const totalCommitted = gang.teamIds
    .map((id) => w.teams[id])
    .filter(Boolean)
    .reduce((s, t) => s + t.timeUsed, 0);
  const capacity = Math.max(1, gang.teamIds.length) * MINUTES_PER_WEEK;
  const pct = Math.round((totalCommitted / capacity) * 100);
  const ordersQueued = Object.values(w.orders).filter((o) => o.gangId === gang.id && o.state === 'queued').length +
    Object.values(w.specialistJobs ?? {}).filter(j => j.gangId === gang.id && j.week === w.week && j.state === 'queued').length;
  const wages = Object.values(w.people)
    .filter((p) => p.gangId === gang.id && p.role !== 'boss' && p.status !== 'dead')
    .reduce((s, p) => s + p.pay, 0);
  const withStrip = tab === 'lieutenants' && !jobCard && !staff;

  return (
    <>
      <div className="organizer-frame">
        <div className="journal-tabs" role="tablist" aria-label="Organizer sections">
          {TABS.map((t) => (
            <button key={t.id} role="tab" tabIndex={tab === t.id ? 0 : -1} onKeyDown={e => {
              const i = TABS.findIndex(x => x.id === t.id);
              const next = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
              if (next >= 0) { e.preventDefault(); setTab(TABS[next].id); (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus(); }
            }} aria-selected={tab === t.id} aria-controls="organizer-page" className={`jtab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)} title={t.key}>
              <span className="key">{t.key}</span>
              <span className="label">
                <Icon name={`tabs/${t.id}`} size={14} /> {t.label}
              </span>
            </button>
          ))}
        </div>
        <div className={`journal planning-journal${withStrip ? ' with-strip' : ''}`}>
          <div className="journal-heading">
            <Kicker className="gold">Gang Organizer · Week {w.week}</Kicker>
            <div className="journal-tools">
              <button className="journal-help" aria-label="Help" title="Help (?)" onClick={()=>useGame.getState().setHelpOpen(true)}>?</button>
              {!jobCard && <MapAccess />}
              <button className="journal-fold" onClick={() => setCollapsed(true)} title="Fold the journal away to see the whole city">
                {jobCard ? '▼ See full map' : '▼ See the city'}
              </button>
            </div>
          </div>
          {withStrip && <LieutenantStrip />}

          <div key={staff ? `staff-${staff.type}` : jobCard ? `job-${jobCard.type}` : tab} id="organizer-page" className="paper page" role="tabpanel" aria-label={TABS.find(t => t.id === tab)?.label}>
            {staff ? <SpecialistJobCard /> : jobCard ? <JobCardPanel /> : <>
              {withStrip && <label className="mobile-crew">Lieutenant <select aria-label="Crew" value={selectedTeamId ?? ''} onChange={e => useGame.getState().selectTeam(Number(e.target.value))}>
                {gang.teamIds.map(id => <option key={id} value={id}>{w.teams[id]?.name}</option>)}
              </select></label>}
              <details className="gang-summary">
                <summary><span>Cash <b><MoneyRoll value={spendableCash(w, gang.id)} /></b></span><span>Gang details</span></summary>
                <div className="gang-summary-body">
                  <b>{boss?.name ?? 'The Boss'}</b>
                  <span>Assets {money(gangAssets(w, gang))}</span>
                  <span>{territoryCount(w, gang.id)} blocks</span>
                  <span>{gangManpower(w, gang)} men · {money(wages)} weekly wages</span>
                </div>
              </details>

              <div className="page-body">
                <TutorialPanel />
                {tab === 'lieutenants' && <LieutenantsTab />}
                {tab === 'accountant' && <AccountantTab />}
                {tab === 'lawyer' && <LawyerTab />}
                {tab === 'diplomacy' && <DiplomacyTab />}
                {tab === 'newspaper' && <NewspaperTab />}
                {tab === 'graphs' && <GraphsTab />}
                {tab === 'maps' && <MapsTab />}
                {tab === 'options' && <OptionsTab />}
              </div>

              <div className="page-foot">
                <div className="progress">
                  <div className="bar">
                    <i style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <span>
                    <b>{ordersQueued} order{ordersQueued === 1 ? '' : 's'}</b> · {pct}% of crew time assigned
                  </span>
                </div>
                <div className="brass flat week-actions">
                  <button className="hit-streets" onClick={() => void endWeekNow()} title="Resolve the week minute by minute, without the city view">
                    End Week
                  </button>
                  <button className="hit-streets" onClick={launchWeek} title="Save your orders and start the working week">
                    Hit the Streets!
                  </button>
                </div>
              </div>
            </>}
          </div>
        </div>

        <RightSheet />
      </div>
      {mapButtons}
    </>
  );
}
