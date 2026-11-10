import { MapAccess } from './MapAccess';
import { useEffect, useRef, useState } from 'react';
import { act, useGame } from '../app/store';
import { recordAction } from '../app/actionLog';
import { defaultOptions, issueOrder, previewOrder, replaceOrder, validBuildingTarget } from '../sim/api';
import { selectableOrderPerson, selectableOrderSite } from '../app/orderSelection';
import { MINUTES_PER_WEEK, ORDERS, ORDER_GROUPS } from '../sim/constants';
import { BUILDING_BY_ID, ILLEGAL_TYPES, ESTABLISHABLE_TYPES, coverQuality } from '../sim/data/buildings';
import { expandTargets } from '../sim/execution';
import { donationAmount } from '../sim/charity';
import { crewPeople, orderStaffing, readyForPlanning } from '../sim/orderStaffing';
import { orderCashCost, spendableCash } from '../sim/orderCost';
import { buildingName, buildingsOfBlock, money } from '../sim/world';
import { Icon, Kicker, Rivets, Stars } from './common';

/** The job card occupies the journal page, leaving the map available for targets. */
export function JobCardPanel() {
  const sim = useGame((s) => s.sim)!;
  const jc = useGame((s) => s.jobCard);
  const [offer, setOffer] = useState<{ count: number; total: number; original: { buildingIds: number[]; blockIds: number[] } } | null>(null);
  const update = useGame(s => s.updateJobCard);
  const updateOpts = useGame((s) => s.updateJobOpts);
  const cancel = useGame((s) => s.cancelJobCard);
  const notify = useGame((s) => s.notify);
  const setSheet = useGame((s) => s.setSheet);
  const sheet = useGame((s) => s.sheet);
  const setCollapsed = useGame((s) => s.setOrganizerCollapsed);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.focus(); }, []);
  useGame((s) => s.version);

  if (!jc) return null;
  const w = sim.world;
  const gang = sim.playerGang;
  const def = ORDERS[jc.type];
  const groupName = ORDER_GROUPS.find((g) => g.id === def.group)?.name ?? '';
  const team = w.teams[jc.teamId];
  const lt = team ? w.people[team.lieutenantId] : null;
  const people = team ? crewPeople(w, team) : [];
  const staffing = team ? orderStaffing(w, team, jc, true) : null;
  const crewIndex = team ? gang.teamIds.indexOf(team.id) + 1 : 0;

  const expanded = expandTargets(w, gang.id, jc.type, jc.blockIds, jc.buildingIds);
  const targetCount = def.target === 'area' ? expanded.length : jc.buildingIds.length;
  const person = jc.personId != null ? w.people[jc.personId] : null;

  const prompt = (() => {
    switch (def.target) {
      case 'person':
        return person ? `Target: ${person.name}` : 'Click their highlighted building, or choose a person from the Clipboard.';
      case 'building':
        return jc.buildingIds.length ? `Target: ${buildingName(w, jc.buildingIds[0])}` : 'Click a site on the map.';
      case 'area':
        return targetCount ? `${targetCount} valid target${targetCount === 1 ? '' : 's'} selected` : 'Click blocks or drag an area. Repeat over a selected area to clear it.';
      case 'point':
        return jc.pos ? 'Position chosen' : 'Click where you want them to go.';
      default:
        return 'No target needed.';
    }
  })();

  // Set Up Business needs a type, and an illegal one needs a front on the block.
  const landId = jc.buildingIds[0];
  const land = landId != null ? w.buildings[landId] : null;
  const isCentreLot = land ? w.lots[land.lotId].index === 4 : false;
  // Only fronts the order would accept (trading, of a class that can cover one).
  const blockFronts =
    land && isCentreLot
      ? buildingsOfBlock(w, w.blocks[land.blockId]).filter((b) => b.ownerGangId === gang.id && b.cls !== 'illegal' && b.cls !== 'empty' &&
        validBuildingTarget(w, gang.id, 'setUpBusiness', land, defaultOptions({ ...jc.opts, businessTypeId: jc.opts.businessTypeId ?? ILLEGAL_TYPES.find(t => t.id !== 'office')?.id, frontBuildingId: b.id })))
      : [];
  const chosenType = jc.opts.businessTypeId ? BUILDING_BY_ID[jc.opts.businessTypeId] : null;
  const chosenFront = jc.opts.frontBuildingId != null ? w.buildings[jc.opts.frontBuildingId] : null;

  const orderPrice = orderCashCost(w, jc.type, jc.opts, jc.buildingIds);
  const cashLeft = spendableCash(w, gang.id, jc.editingOrderId ?? undefined);
  const priced = orderPrice != null && orderPrice > 0;
  const unaffordable = priced && orderPrice > cashLeft;
  const awaitingPrice = (jc.type === 'buyPremises' || jc.type === 'setUpBusiness') && orderPrice == null;

  const canConfirm = (() => {
    if (!team || staffing?.reason || unaffordable) return false;
    if(jc.type==='export'&&!team?.vehicles.truck)return false;
    if (def.target === 'person') return person != null && selectableOrderPerson(w, gang.id, jc.type, person);
    if (def.target === 'building') return !!land && selectableOrderSite(w, gang.id, jc, land) &&
      (jc.type !== 'setUpBusiness' || !!chosenType && (!isCentreLot || !!chosenFront) &&
        // The order's own test: the right kind of business for the lot, a front on this block.
        validBuildingTarget(w, gang.id, jc.type, land, defaultOptions(jc.opts)));
    if (def.target === 'point') return jc.pos != null;
    if (def.target === 'area') return targetCount > 0;
    return true;
  })();

  // Retain an accepted quote while editing the same site. A different charity
  // receives a fresh quote; old saves' explicit donations remain honoured.
  const previous = jc.editingOrderId == null ? null : w.orders[jc.editingOrderId];
  const opts = jc.type === 'donate' && land && previous?.targetBuildingIds[0] !== land.id
    ? { ...jc.opts, amount: donationAmount(w, land) } : jc.opts;
  const draft = previewOrder(w, gang.id, { ...jc, opts });
  const dispatchIssue = staffing?.reason ?? (jc.type==='export'&&!team?.vehicles.truck ? 'Allocate a truck to this crew to export goods.' : null);
  const estimate = draft ? (draft.estimatedMinutes / 60).toFixed(1) + 'h estimated crew time' : 'Choose a crew';
  const committed = Math.max(0, (team?.timeUsed ?? 0) - (jc.editingOrderId != null ? w.orders[jc.editingOrderId]?.estimatedMinutes ?? 0 : 0));
  const exceedsBudget = !!team && !!draft && committed + draft.estimatedMinutes > MINUTES_PER_WEEK * 1.02;

  const send = (buildingIds: number[], blockIds: number[]) => {
    const res = act((s) => {
      const input = {
        teamId: jc.teamId,
        type: jc.type,
        buildingIds,
        blockIds,
        personId: jc.personId,
        pos: jc.pos,
        opts,
      };
      recordAction('order', `${input.type} confirmed`);
      return jc.editingOrderId != null ? replaceOrder(s.world, s.playerGang.id, jc.editingOrderId, input)
        : issueOrder(s.world, s.playerGang.id, input);
    });
    if (res) {
      // Undermanned for the whole area, the lieutenant offers the part he can do.
      if (!res.ok && res.suggestion) {
        setOffer({ ...res.suggestion, original: { buildingIds: [...buildingIds], blockIds: [...blockIds] } });
        update({ buildingIds: res.suggestion.buildingIds, blockIds: [] });
        return;
      }
      notify(res);
      if (res.ok) cancel();
    }
  };
  const confirm = () => send(jc.buildingIds, jc.blockIds);

  return (
    <div ref={panel} tabIndex={-1} className="brass jobcard" role="region" aria-label="Job card">
      <div className="paper">
        <Rivets />
        <div className="brass-face head">
          <div className="row" style={{ gap: 12 }}>
            <Icon name={`orders/${jc.type}`} size={34} />
            <div>
              <Kicker className="dark">Job card · {groupName.replace(' Orders', '')}</Kicker>
              <h4>{def.name}</h4>
            </div>
          </div>
          <button className="sheet-close" onClick={cancel} aria-label="Cancel">
            ×
          </button>
        </div>

        <div className="body">
          {offer && <div className="target-box" role="status">
            The original {offer.total} sites exceed the remaining week. The {offer.count} sites this crew can cover are now selected in red.
            <p>Confirm this area, change it on the map, or restore the original area and increase manpower.</p>
            <button className="btn sm" onClick={() => { update(offer.original); setOffer(null); }}>Restore original area</button>
          </div>}
          {!offer && jc.trimmed && <div className="target-box" role="status">
            {lt?.name ?? 'The lieutenant'} has not got the time for all {jc.trimmed.total} sites: the {jc.trimmed.dropped} farthest
            {jc.trimmed.dropped === 1 ? ' was' : ' were'} left off. Add manpower or reduce other orders to take more.
          </div>}
          <div className="muted" style={{ lineHeight: 1.45 }}>
            {def.desc}
          </div>
          <div className="row between" style={{ fontSize: 12.5 }}>
            <span>
              <b style={{ fontWeight: 500 }}>
                Crew {crewIndex} · {lt?.name ?? team?.name ?? 'Crew'}
              </b>
            </span>
            <span className="muted tiny">{def.skills.join(' · ') || 'no skill needed'}</span>
          </div>

          <div className="target-box">
            <b>{prompt}</b>
            <div className="row wrap job-target-actions">
              {def.target !== 'none' &&
                <button className="btn sm" onClick={() => setCollapsed(true)}>Pick on map</button>}
              <MapAccess label="Find by name" />
              {(jc.blockIds.length > 0 || jc.buildingIds.length > 0 || jc.personId != null || jc.pos != null) &&
                <button className="btn sm" onClick={() => { update({ blockIds: [], buildingIds: [], personId: null, pos: null }); setOffer(null); }}>Clear selection</button>}
            </div>
            {def.target === 'area' && (jc.blockIds.length > 0 || jc.buildingIds.length > 0) && (
              <div className="sub">
                {jc.blockIds.length > 0 && `${jc.blockIds.length} block${jc.blockIds.length === 1 ? '' : 's'}`}
                {jc.blockIds.length > 0 && jc.buildingIds.length > 0 && ' and '}
                {jc.buildingIds.length > 0 && `${jc.buildingIds.length} single site${jc.buildingIds.length === 1 ? '' : 's'}`}
                {' chosen. Click again to remove; shift-click picks one site.'}
              </div>
            )}
            {def.target === 'person' && (
              <div className="sub">
                {!person && 'Buildings containing an available target are highlighted in blue. '}
                If you do not know where they are, your hoods will ask around the pool halls and gyms until they find them.
                <div style={{ marginTop: 6 }}>
                  <button className={`btn sm${sheet?.kind === 'clipboard' ? ' on' : ''}`} onClick={() => setSheet({ kind: 'clipboard' })}>
                    Open the clipboard
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---- Set Up Business */}
          {jc.type === 'setUpBusiness' && land && (
            <div>
              <Kicker style={{ marginBottom: 6 }}>{isCentreLot ? 'Illegal business · centre lot' : 'Legal business'}</Kicker>
              <select aria-label="Business type" className="text-input" value={jc.opts.businessTypeId ?? ''} onChange={(e) => updateOpts({ businessTypeId: e.target.value })}>
                <option value="">Choose a business…</option>
                {(isCentreLot ? ILLEGAL_TYPES.filter((t) => t.id !== 'office') : ESTABLISHABLE_TYPES).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {money(t.cost)}
                  </option>
                ))}
              </select>
              {chosenType?.id === 'rentedRooms' && (
                <div style={{ marginTop: 8 }}>
                  <label className="muted tiny" htmlFor="rented-floors">
                    Floors, one apartment each. The tenant pays that day's rent from their own earnings. If they cannot pay, the apartment stays empty until someone new moves in.
                  </label>
                  <select
                    id="rented-floors"
                    className="text-input"
                    aria-label="Floors"
                    value={jc.opts.roomsFloors ?? 2}
                    onChange={(e) => updateOpts({ roomsFloors: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4].map((floors) => (
                      <option key={floors} value={floors}>{floors} floor{floors === 1 ? '' : 's'}</option>
                    ))}
                  </select>
                </div>
              )}
              {isCentreLot && (
                <div style={{ marginTop: 8 }}>
                  <div className="muted tiny" style={{ marginBottom: 4 }}>
                    Choose the front it hides behind. The better the match, the longer the Bureau takes to find it.
                  </div>
                  {blockFronts.length === 0 ? (
                    <div className="tiny" style={{ color: 'var(--red)' }}>
                      You own no legal business on this block. Buy one first.
                    </div>
                  ) : (
                    blockFronts.map((f) => {
                      const q = chosenType ? coverQuality(chosenType.id, f.typeId) : 0;
                      return (
                        <button
                          key={f.id}
                          className={`list-row${jc.opts.frontBuildingId === f.id ? ' on' : ''}`}
                          onClick={() => updateOpts({ frontBuildingId: f.id })}
                          disabled={f.hidesId != null && f.hidesId !== land.id}
                        >
                          <span className="name">{buildingName(w, f.id)}</span>
                          {chosenType && <Stars value={q * 5} />}
                          {f.hidesId != null && <span className="muted tiny">in use</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
              {chosenType && chosenFront && (
                <div className="tiny" style={{ marginTop: 6 }}>
                  Cover quality: <b>{Math.round(coverQuality(chosenType.id, chosenFront.typeId) * 100)}%</b>
                </div>
              )}
            </div>
          )}

          {/* ---- Adjust Protection */}
          {jc.type === 'adjustProtection' && (
            <div className="field">
              <label htmlFor="JobCardPanel-field-1">
                Rate<span className="value">{Math.round((jc.opts.protectionLevel ?? 1) * 100)}% of normal</span>
              </label>
              <input id="JobCardPanel-field-1" type="range" min={0} max={2} step={0.1} value={jc.opts.protectionLevel ?? 1} onChange={(e) => updateOpts({ protectionLevel: Number(e.target.value) })} />
              <div className="muted tiny">Anything above the going rate breeds refusals — and refusers talk to the police.</div>
            </div>
          )}

          {jc.type === 'donate' && (
            <div className="field" aria-label="Donation amount">
              <Kicker>Donation</Kicker>
              {land ? <><strong>{money(draft?.opts.amount ?? donationAmount(w, land))}</strong>
                <p className="muted">Calculated for this charity’s local poverty.</p></>
                : <p className="muted">Choose a church or orphanage to see the donation.</p>}
            </div>
          )}
          {/* ---- Bribe amount */}
          {jc.type === 'bribe' && (
            <div className="field">
              <label htmlFor="JobCardPanel-field-2">
                Amount<span className="value">{money(jc.opts.amount ?? 1000)}</span>
              </label>
              <input id="JobCardPanel-field-2" type="range" min={200} max={Math.max(1000, Math.min(25000, gang.cash))} step={100} value={jc.opts.amount ?? 1000} onChange={(e) => updateOpts({ amount: Number(e.target.value) })} />
            </div>
          )}

          {/* ---- shared options */}
          <div>
            <Kicker style={{ marginBottom: 6 }}>Options</Kicker>
            <div className="opt-row">
              <button aria-pressed={!!jc.opts.priority} className={`chip${jc.opts.priority ? ' on' : ''}`} title="Priority orders avoid combat and ignore the police to get the job done." onClick={() => updateOpts({ priority: !jc.opts.priority })}>
                Priority
              </button>
              <button aria-pressed={!!jc.opts.wait} className={`chip${jc.opts.wait ? ' on' : ''}`} title="They will hold in position until you tell them to continue." onClick={() => updateOpts({ wait: !jc.opts.wait })}>
                Wait
              </button>
              {def.supportsRepeat && (
                <button aria-pressed={!!jc.opts.repeat} className={`chip${jc.opts.repeat ? ' on' : ''}`} title="Reissue this order automatically every week." onClick={() => updateOpts({ repeat: !jc.opts.repeat })}>
                  Repeat
                </button>
              )}
              {def.supportsPublic && (
                <button aria-pressed={!!jc.opts.isPublic} className={`chip${jc.opts.isPublic ? ' on' : ''}`} title="A public job frightens a wider area — and leaves more witnesses." onClick={() => updateOpts({ isPublic: !jc.opts.isPublic })}>
                  {jc.opts.isPublic ? 'Public' : 'Private'}
                </button>
              )}
            </div>
          </div>

          <div className="row between">
            <Kicker>Manpower</Kicker>
            <div className="stepper">
              <button aria-label="Decrease manpower" className="btn sm" onClick={() => updateOpts({ manpower: Math.max(1, jc.opts.manpower - 1) })}>
                −
              </button>
              <span className="n">{jc.opts.manpower}</span>
              <button aria-label="Increase manpower" className="btn sm" onClick={() => updateOpts({ manpower: Math.min((team?.memberIds.length ?? 0) + 1, def.maxManpower, jc.opts.manpower + 1) })}>
                +
              </button>
            </div>
          </div>

          {team && (
            <div className="row between tiny muted" style={{ borderTop: '1px dotted var(--dots)', paddingTop: 8 }}>
              <span>Crew of {people.length} · {staffing?.available ?? 0} available</span>
              <span>
                {Math.round((committed / MINUTES_PER_WEEK) * 100)}% of the week already committed
                {!dispatchIssue && <> · this job {estimate}{exceedsBudget ? ' · exceeds remaining week' : ''}</>}
              </span>
            </div>
          )}

          {dispatchIssue && <p className="tiny" role="status">{dispatchIssue}</p>}
          {(priced || awaitingPrice) && (
            <p className="tiny" role="status">
              Available {money(cashLeft)}
              {priced ? ` · this order ${money(orderPrice)}` : ' · pick a target to see the price'}
              {unaffordable ? ' · not enough cash, so Confirm stays off' : ''}
            </p>
          )}

          {team && (
            <div>
              <Kicker style={{ marginBottom: 6 }}>Send somebody in particular?</Kicker>
              <select aria-label="Preferred crew member" className="text-input" value={jc.opts.preferredHoodId ?? ''} onChange={(e) => updateOpts({ preferredHoodId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Let the lieutenant choose</option>
                {people
                  .map((p) => (
                    <option key={p.id} value={p.id} disabled={!readyForPlanning(w, p)}>
                      {p.name}{!readyForPlanning(w, p) ? ' — unavailable' : ''}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>

        <div className="foot">
          <button className="btn brass lg" style={{ flex: 1 }} disabled={!canConfirm} onClick={confirm}
            title={unaffordable ? `This costs ${money(orderPrice ?? 0)} and ${money(cashLeft)} is available` : undefined}>
            Confirm order
          </button>
          <button className="btn lg" onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
