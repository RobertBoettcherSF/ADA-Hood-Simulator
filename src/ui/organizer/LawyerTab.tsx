import { isValidAreaTarget } from '../../sim/execution';
import { hireQuote } from '../../sim/originalWages';
import { useState } from 'react';
import { act, useGame } from '../../app/store';
import {
  assignStaffVehicle,
  bribePrice,
  canGoStraight,
  policeTourCapacity,
  hireRecruit,
  issueOrder,
  moveToPool,
  type ApiResult,
  sackPerson,
  setGoStraight,
  setPay,
  setRunForOffice,
} from '../../sim/api';
import { GO_STRAIGHT_ASSETS } from '../../sim/constants';
import { campaignWeeklyCost, officeEntryCheck, electionBlocksRequired } from '../../sim/systems/politics';
import type { CourtCase, Person, WorldState } from '../../sim/types';
import { gangAssets, money, territoryCount } from '../../sim/world';
import { Avatar, ConfirmDialog, Empty, Hint, Modal, Panel, Pill, Stars } from '../common';
import { VEHICLES, VEHICLE_ORDER } from '../../sim/constants';
import { SpecialistJobList } from '../SpecialistJobCard';
import { peopleList } from '../../sim/entityLists';
import { quitGangPayroll } from '../../sim/payrollMark';
import { crewFreeMinutes } from '../../sim/crewTime';

const CASE_STATUS: Record<CourtCase['status'], string> = {
  awaiting: 'Awaiting trial',
  onTrial: 'On trial',
  dismissed: 'Dismissed',
  acquitted: 'Acquitted',
  convicted: 'Convicted',
};

export function LawyerTab() {
  const sim = useGame((s) => s.sim)!;
  const notify = useGame((s) => s.notify);
  const [intimidating, setIntimidating] = useState<number[] | null>(null);
  const beginSpecialistOrder = useGame(s => s.beginSpecialistOrder);
  const requestCamera = useGame((s) => s.requestCamera);
  useGame((s) => s.version);
  const [officialKind, setOfficialKind] = useState<'mayor' | 'policeChief' | 'judge' | 'da' | 'police'>('mayor');
  const [sacking, setSacking] = useState(false);

  const w = sim.world;
  const gang = sim.playerGang;
  const lawyer = gang.lawyerId != null ? w.people[gang.lawyerId] : null;
  const straight = canGoStraight(w, gang.id);
  const officeEntry = officeEntryCheck(w, gang.id);
  const cases = Object.values(w.cases).filter((c) => c.gangId === gang.id);
  const squealers = peopleList(w).filter(
    (p) => p.role === 'owner' && (p.opinion[gang.id] ?? 0) < -40 && p.status === 'active',
  );
  const wanted = Object.values(w.people)
    .filter((p) => p.gangId === gang.id && p.wanted > 25 && p.status !== 'dead')
    .sort((a, b) => b.wanted - a.wanted);
  const crimes = w.crimes.filter((c) => c.gangId === gang.id && c.week >= w.week - 1 && !c.charge);

  const officials: Person[] = (() => {
    switch (officialKind) {
      case 'mayor':
        return [w.people[w.mayorId]].filter(Boolean);
      case 'policeChief':
        return [w.people[w.policeChiefId]].filter(Boolean);
      case 'judge':
        return w.judgeIds.map((id) => w.people[id]).filter(Boolean);
      case 'da':
        return w.daIds.map((id) => w.people[id]).filter(Boolean);
      case 'police':
        return w.policeIds
          .map((id) => w.people[id])
          .filter((p) => p && p.status === 'active')
          .slice(0, 24);
    }
  })();

  const freeLawyers = peopleList(w).filter(
    (p) => p.role === 'lawyer' && p.gangId == null && p.status === 'active',
  );

  return (
    <div>
      <Panel title="The Lawyer">
        {lawyer ? (
          <>
            <div className="row" style={{ gap: 10 }}>
              <Avatar person={lawyer} gang={gang} />
              <div style={{ flex: 1 }}>
                <div className="row between">
                  <b style={{ color: lawyer.pay < lawyer.payDemand ? 'var(--blood)' : undefined }}>{lawyer.name}</b>
                  <Stars value={lawyer.skills.intelligence} />
                </div>
                <div className="muted tiny">
                  Pay {money(lawyer.pay)} · wants {money(lawyer.payDemand)}
                </div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 4, marginTop: 8 }}>
              <button
                className="btn sm"
                onClick={() => notify(act((s) => setPay(s.world, lawyer.id, lawyer.payDemand))!)}
              >
                Meet Pay
              </button>
              <button
                className="btn sm danger"
                onClick={() => setSacking(true)}
              >
                Sack
              </button>
            </div>
            {sacking && (
              <ConfirmDialog
                text={`Sack ${lawyer.name}? He leaves bearing a grudge, and you will need a new lawyer.`}
                onYes={() => { setSacking(false); notify(act((s) => sackPerson(s.world, gang.id, lawyer.id))!); }}
                onNo={() => setSacking(false)}
              />
            )}
            <Hint>He defends your people in court automatically. Everything else you must ask for.</Hint>
          </>
        ) : (
          <>
            <Empty>
              No lawyer. Your hoods will face the district attorney alone, and you cannot bribe
              officials, employ police, run for office or go straight.
            </Empty>
            {freeLawyers.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div className="muted tiny" style={{ marginBottom: 4 }}>
                  Recruit at a law office or the courthouse to bring one in.
                </div>
                {freeLawyers.slice(0, 4).map((p) => (
                  <div key={p.id} className="row between" style={{ padding: '3px 0' }}>
                    <span className="tiny">{p.name}</span>
                    <div className="row" style={{ gap: 5 }}>
                      <Stars value={p.skills.intelligence} />
                      <span className="muted tiny mono">{money(hireQuote(w, p, gang.id))}</span>
                      {gang.recruitIds.includes(p.id) && (
                        <button
                          className="btn sm"
                          onClick={() => notify(act((s) => hireRecruit(s.world, gang.id, p.id, 'pool'))!)}
                        >
                          Hire
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Panel>

      {lawyer && (
        <>
          <Panel title="Employ Police">
            <Hint>
              He tours an area you mark on the map and puts the officers on its beats on a weekly retainer to
              overlook your crimes — {policeTourCapacity(gang)} of them in a week{gang.staffVehicles?.lawyer ? ' with the car' : ', twice that with a car'}.
            </Hint>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <button className="btn brass" onClick={() => beginSpecialistOrder('employPolice')}>Mark the area</button>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <span className="tiny muted">
                Car: {gang.staffVehicles?.lawyer ? VEHICLES[gang.staffVehicles.lawyer].name : 'none'}
              </span>
              {VEHICLE_ORDER.filter((v) => (gang.vehicles[v] ?? 0) > 0 && gang.staffVehicles?.lawyer !== v).map((v) => (
                <button key={v} className="btn sm" onClick={() => notify(act((s) => assignStaffVehicle(s.world, gang.id, 'lawyer', v))!)}>
                  Give {VEHICLES[v].name}
                </button>
              ))}
              {gang.staffVehicles?.lawyer && (
                <button className="btn sm" onClick={() => notify(act((s) => assignStaffVehicle(s.world, gang.id, 'lawyer', null))!)}>
                  Take the car back
                </button>
              )}
            </div>
          </Panel>

          <Panel title="Bribe Officials">
            <div className="row wrap" style={{ gap: 4, marginBottom: 8 }}>
              {(
                [
                  ['mayor', 'Mayor'],
                  ['policeChief', 'Chief'],
                  ['judge', 'Judges'],
                  ['da', 'District Attorneys'],
                  ['police', 'Officers'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  className={`btn sm${officialKind === k ? ' on' : ''}`}
                  title={k === 'da' ? 'District Attorneys: they prosecute your men in court. A bought DA hands over the witness and juror lists.' : undefined}
                  onClick={() => setOfficialKind(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="scroll-list">
              {officials.map((p) => {
                const view = p.opinion[gang.id] ?? 0;
                return (
                  <div key={p.id} className="row between" style={{ padding: '4px 0', borderBottom: '1px dotted #bdb094' }}>
                    <button
                      className="name tiny"
                      style={{ textAlign: 'left', flex: 1 }}
                      onClick={() => requestCamera({ x: p.pos.x, y: p.pos.y })}
                    >
                      {p.name}
                      {p.bribedBy === gang.id && ' ✓'}
                    </button>
                    <div className="row" style={{ gap: 5 }}>
                      <Pill kind={view > 20 ? 'good' : view < -20 ? 'bad' : undefined}>
                        {view > 20 ? 'friendly' : view < -20 ? 'hostile' : 'neutral'}
                      </Pill>
                      <span className="muted tiny mono">{money(bribePrice(w, p, gang.id))}</span>
                      <button
                        className="btn sm"
                        onClick={() => beginSpecialistOrder('bribeOfficials', p.id)}
                      >
                        Bribe
                      </button>
                      {p.role === 'police' && p.employedBy == null && !quitGangPayroll(p, gang.id) && (
                        <button
                          className="btn sm"
                          onClick={() => beginSpecialistOrder('employPolice', p.id)}
                        >
                          Employ
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <Hint>
              The head of the Bureau cannot be bought. Bribe a judge while he is hearing your case and
              it will be thrown out; bribe the DA and you will learn who is testifying.
            </Hint>
          </Panel>

          <Panel title="The Long Game">
            <div className="row between" style={{ marginBottom: 6 }}>
              <div>
                <b className="tiny">Go Straight</b>
                <div className="muted tiny">{straight.reason}</div>
              </div>
              <button
                className={`btn sm${gang.goingStraight ? ' on' : ''}`}
                disabled={!straight.can && !gang.goingStraight}
                onClick={() => notify(act((s) => setGoStraight(s.world, gang.id, !gang.goingStraight))!)}
              >
                {gang.goingStraight ? 'Cancel' : 'Begin'}
              </button>
            </div>
            <div className="row between tiny muted" style={{ marginBottom: 10 }}>
              <span>
                Assets excluding cash: {money(gangAssets(w, gang))} of {money(GO_STRAIGHT_ASSETS)}
              </span>
            </div>

            <div className="row between">
              <div>
                <b className="tiny">Run for Office</b>
                <div className="muted tiny">
                  {w.election.active
                    ? `Election in ${w.election.weeksLeft} week(s). You hold ${territoryCount(w, gang.id)} of ${electionBlocksRequired(w)} blocks needed.`
                    : 'No election is under way.'}
                </div>
                {w.election.active && <div className="muted tiny">
                  {money(campaignWeeklyCost(w, gang.id))} a week · changes with your territory and land values.
                  {!gang.runningForOffice && !officeEntry.can && ` ${officeEntry.reason}`}
                </div>}
              </div>
              <button
                className={`btn sm${gang.runningForOffice ? ' on' : ''}`}
                disabled={!officeEntry.can && !gang.runningForOffice}
                onClick={() => notify(act((s) => setRunForOffice(s.world, gang.id, !gang.runningForOffice))!)}
              >
                {gang.runningForOffice ? 'Withdraw' : 'Stand'}
              </button>
            </div>
          </Panel>
        </>
      )}

      <SpecialistJobList role="lawyer" />
      {w.election.active && (
        <Panel title="The Election">
          {gang.runningForOffice && <Hint>Campaign costs are paid after wages. If you cannot pay the full bill, you withdraw. Keep a lawyer available through the campaign; replace a lost lawyer before week's end to stay in the race.</Hint>}
          {w.election.candidates.map((c) => (
            <div key={c.id} className="row between tiny" style={{ padding: '3px 0' }}>
              <span>
                {w.people[c.id]?.name ?? 'Candidate'}
                {c.gangId != null && ` (${w.gangs[c.gangId]?.name})`}
              </span>
              <b className="mono">{c.votes}</b>
            </div>
          ))}
        </Panel>
      )}

      {!w.election.active && w.election.lastResult && w.week - w.election.lastResult.week <= 1 && (
        <Panel title="The Election Result">
          {w.election.lastResult.candidates.map((c) => (
            <div key={c.id} className="row between tiny" style={{ padding: '3px 0' }}>
              <span>
                {c.id === w.election.lastResult!.winnerId ? <b>{w.people[c.id]?.name ?? 'Candidate'} · elected</b> : w.people[c.id]?.name ?? 'Candidate'}
                {c.gangId != null && ` (${w.gangs[c.gangId]?.name})`}
              </span>
              <b className="mono">{c.votes}</b>
            </div>
          ))}
        </Panel>
      )}

      <Panel title="Legal Proceedings">
        {cases.length === 0 ? (
          <Empty>Nobody of yours is before the courts.</Empty>
        ) : (
          cases.map((c) => (
            <div key={c.id} style={{ padding: '5px 0', borderBottom: '1px dotted #bdb094' }}>
              <div className="row between">
                <b className="tiny">{w.people[c.defendantId]?.name}</b>
                <Pill kind={c.status === 'convicted' ? 'bad' : c.status === 'awaiting' || c.status === 'onTrial' ? 'warn' : 'good'}>
                  {CASE_STATUS[c.status]}
                </Pill>
              </div>
              <div className="muted tiny">
                {c.crime} · Judge {w.people[c.judgeId]?.name} · DA {w.people[c.daId]?.name}
                {c.weeksToTrial > 0 && ` · trial in ${c.weeksToTrial} week(s)`}
              </div>
              {c.knowsWitnesses && (
                <div className="tiny" style={{ marginTop: 2 }}>
                  Witnesses: {c.witnessIds.map((id) => w.people[id]?.name).filter(Boolean).join(', ') || 'none left'}
                </div>
              )}
              {c.knowsJurors && (
                <div className="tiny">
                  Jurors: {c.jurorIds.map((id) => w.people[id]?.name).filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          ))
        )}
      </Panel>

      <Panel title="Most Wanted">
        {wanted.length === 0 ? (
          <Empty>None of your people are being watched.</Empty>
        ) : (
          wanted.slice(0, 12).map((p) => (
            <div key={p.id} className="row between tiny" style={{ padding: '2px 0' }}>
              <span>{p.name}</span>
              <b className="mono">{Math.round(p.wanted)}</b>
            </div>
          ))
        )}
        <Hint>Keep a hot hood off the streets for a week or two and the heat falls away.</Hint>
      </Panel>

      <Panel title="Squealers">
        <Hint>Squealers are outsiders — shopkeepers so hostile to you (opinion below −40) that they would talk to the police. Intimidate leans on his business.</Hint>
        {squealers.length === 0 ? (
          <Empty>Nobody is talking.</Empty>
        ) : (
          <>
            {squealers.slice(0, 12).map((p) => (
              <div key={p.id} className="list-row">
                <span className="name tiny">{p.name}</span>
                {p.gangId !== gang.id && <button className="btn sm" title="Choose a crew to intimidate his business" onClick={() => setIntimidating([p.id])}>Intimidate</button>}
                <Pill kind="bad">hostile</Pill>
                {p.gangId === gang.id && <ToPool personId={p.id} />}
              </div>
            ))}
            <button className="btn sm" style={{ marginTop: 6 }} title="Choose a crew to intimidate every squealer's business"
              onClick={() => setIntimidating(squealers.filter((p) => p.gangId !== gang.id).map((p) => p.id))}>Intimidate all</button>
            {intimidating && <CrewPicker personIds={intimidating} onClose={() => setIntimidating(null)} />}
          </>
        )}
      </Panel>

      <Panel title="Crimes — This Week">
        {crimes.length === 0 ? (
          <Empty>Nothing on the books.</Empty>
        ) : (
          crimes.slice(-14).map((c) => (
            <div key={c.id} className="row between tiny" style={{ padding: '2px 0' }}>
              <span>
                {w.people[c.perpetratorId]?.name ?? 'Unknown'} — {c.kind}
              </span>
              <span className="muted mono">{Math.round(c.arrestRisk * 100)}% risk</span>
              <ToPool personId={c.perpetratorId} />
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}

/** 1.2.21: the crew a man is in, and a button that sends him to the pool (off the streets). */
function ToPool({ personId }: { personId: number }) {
  const sim = useGame((s) => s.sim)!;
  const notify = useGame((s) => s.notify);
  useGame((s) => s.version);
  const w = sim.world, gang = sim.playerGang, p = w.people[personId];
  if (!p || p.gangId !== gang.id || p.status !== 'active' || p.role !== 'hood') return null;
  const team = p.teamId != null ? w.teams[p.teamId] : undefined;
  if (!team) return <span className="muted tiny">in the pool</span>;
  return (
    <span className="row" style={{ gap: 4 }} onClick={(e) => e.stopPropagation()}>
      <span className="muted tiny">{team.name}</span>
      <button className="btn sm" title="Take him off his crew into the pool so he stays off the streets" onClick={() => notify(act((s) => moveToPool(s.world, gang.id, p.id))!)}>To pool</button>
    </span>
  );
}


/**
 * 1.2.21: queue Intimidate on the squealers' businesses through the normal
 * order flow: the selected crew (or the one with most of its week free), one
 * area order over every business that can be leaned on. Shopkeepers whose
 * business is not a valid Intimidate target (it neither refused nor stopped
 * paying) are named in the reply.
 */
function squealerSites(w: WorldState, gangId: number, personIds: number[]): { sites: number[]; skipped: string[] } {
  const sites: number[] = [], skipped: string[] = [];
  for (const id of personIds) {
    const p = w.people[id];
    const site = Object.values(w.buildings).find((b) => b.ownerPersonId === id || b.managerId === id) ?? (p?.buildingId != null ? w.buildings[p.buildingId] : undefined);
    if (site && isValidAreaTarget(w, gangId, 'intimidate', site)) { if (!sites.includes(site.id)) sites.push(site.id); }
    else if (p) skipped.push(p.name);
  }
  return { sites, skipped };
}

function queueIntimidate(personIds: number[], teamId: number): ApiResult {
  const result = act((sim) => {
    const w = sim.world, gang = sim.playerGang;
    const { sites, skipped } = squealerSites(w, gang.id, personIds);
    if (!sites.length) return { ok: false as const, error: `Nothing to intimidate: ${skipped.join(', ') || 'no squealer'} has no business that refused you.` };
    const team = w.teams[teamId];
    if (!team) return { ok: false as const, error: 'You have no crew to send.' };
    let r = issueOrder(w, gang.id, { type: 'intimidate', teamId: team.id, buildingIds: sites, opts: { manpower: Math.min(2, team.memberIds.length + 1) } });
    if (!r.ok && r.suggestion?.buildingIds?.length) r = issueOrder(w, gang.id, { type: 'intimidate', teamId: team.id, buildingIds: r.suggestion.buildingIds, opts: { manpower: Math.min(2, team.memberIds.length + 1) } });
    if (r.ok && skipped.length) return { ok: true as const, message: `Intimidate queued for ${w.people[team.lieutenantId]?.name ?? 'the crew'}. Not a valid target: ${skipped.join(', ')}.` };
    return r;
  });
  return result ?? { ok: false, error: 'Orders can be given at the desk only.' };
}

/**
 * 1.2.21: which crew leans on the squealers. Each crew with its free minutes;
 * the crew whose lieutenant stands nearest the squealers' businesses is
 * preselected. Confirming queues the order as the Gang Organizer would.
 */
function CrewPicker({ personIds, onClose }: { personIds: number[]; onClose: () => void }) {
  const sim = useGame((s) => s.sim)!;
  const notify = useGame((s) => s.notify);
  const w = sim.world, gang = sim.playerGang;
  const crews = gang.teamIds.map((id) => w.teams[id]).filter(Boolean);
  const { sites } = squealerSites(w, gang.id, personIds);
  const spots = sites.map((id) => w.lots[w.buildings[id].lotId].center);
  const reach = (teamId: number) => {
    const lt = w.people[w.teams[teamId].lieutenantId];
    if (!lt || !spots.length) return Infinity;
    return spots.reduce((sum, at) => sum + Math.hypot(at.x - lt.pos.x, at.y - lt.pos.y), 0) / spots.length;
  };
  const nearest = [...crews].sort((a, b) => reach(a.id) - reach(b.id))[0];
  const [teamId, setTeamId] = useState<number | null>(nearest?.id ?? null);
  return (
    <Modal title="Intimidate — choose a crew" onClose={onClose} width={460}
      footer={<>
        <button className="btn brass" disabled={teamId == null} onClick={() => { if (teamId != null) notify(queueIntimidate(personIds, teamId)); onClose(); }}>Queue the order</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </>}>
      <p className="tiny">{personIds.length === 1 ? `Lean on ${w.people[personIds[0]]?.name ?? 'him'}` : `Lean on ${personIds.length} squealers`}: {sites.length} business{sites.length === 1 ? '' : 'es'} can be intimidated.</p>
      {crews.length === 0 && <Empty>You have no crew.</Empty>}
      {crews.map((t) => (
        <label key={t.id} className="wood-field" style={{ display: 'flex', gap: 6 }}>
          <input type="radio" name="intimidate-crew" checked={teamId === t.id} onChange={() => setTeamId(t.id)} />
          <span>{w.people[t.lieutenantId]?.name ?? 'Crew'} — {t.name} · {Math.max(0, Math.round(crewFreeMinutes(w, t)))} man-min free{t.id === nearest?.id ? ' · nearest' : ''}</span>
        </label>
      ))}
    </Modal>
  );
}
