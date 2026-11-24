// Item 5's order check: the scripted four weeks of the 1.2.91 reference run
// (seed 1932, Standard 40 × 32), on a fresh game. Used by Debug ("Run order
// check") and by tests/order-check.mjs under Node. Lines and replies are
// compared word for word with 1.2.91's; estimates, cash and wages exactly;
// the week's draws, standing-duty minutes and the minutes each order was
// done within ±20 % or shown for information (DESIGN 1.3; proposed).
import { BUILDING_FIELD, COUNT, Exports, GANG_FIELD, TABLE } from './core';
import { readCity } from './city';
import {
  CMD, CREW_FIELD, Draft, ORDER_FIELD, ORDER_TABLE, Order, OrderKind, ORDER_KINDS, Reply, buildingName, command, crewName, issueDraft, newDraft,
  personName, placeName, playerGang, previewDraft, readCrews, readLastWeek, readOrder, readStreets,
} from './orders';
import { TextContext, lineText, replyText } from './orderText';
import { NAMES, TYPE_IDS, TYPE_NAMES } from './tables';

export interface CheckRow { label: string; got: string; want: string; mode: 'exact' | '20%' | 'info'; ok: boolean }
export interface CheckResult { rows: CheckRow[]; passed: number; failed: number; weekMs: number[] }

// 1.2.91 numbers its live buildings in order; the Ada city keeps the ones a
// landmark replaced, so a 1.2.91 number is the n-th live building here.
function siteOf(core: Exports, rank: number): number {
  let n = -1;
  for (let b = 0; b < 40000; b++) {
    if (core.hs_get(TABLE.building, b, 6) === 0 && ++n === rank) return b;
  }
  return -1;
}

const GANG_FIELD_LAST_PURCHASES = 33;

const WEEK_REF = [
  { draws: 254050, cash: 5308, wages: 836 }, { draws: 229972, cash: 4022, wages: 836 },
  { draws: 228697, cash: 3186, wages: 836 }, { draws: 231961, cash: 2266, wages: 920 },
];

export function runOrderCheck(core: Exports, now: () => number = () => performance.now()): CheckResult {
  const rows: CheckRow[] = [];
  const weekMs: number[] = [];
  const add = (label: string, got: string | number, want: string | number, mode: CheckRow['mode'] = 'exact') => {
    const g = String(got), w = String(want);
    const ok = mode === 'info' ? true : mode === '20%'
      ? Math.abs(Number(got) - Number(want)) <= 0.2 * Math.abs(Number(want)) : g === w;
    rows.push({ label, got: g, want: w, mode, ok });
  };
  core.hs_new_game(1932, 1932, 40, 32);
  const city = readCity(core, 1932), streets = readStreets(core);
  const G = playerGang(core);
  const x: TextContext = {
    lang: 'en-GB', me: G,
    place: b => placeName(core, city, streets, b), building: b => buildingName(core, b),
    person: p => personName(core, p), gang: g => `The ${NAMES[core.hs_get(TABLE.gang, g, GANG_FIELD.surname)]} Gang`,
    crew: s => crewName({ nameFirst: core.hs_get(ORDER_TABLE.crews, s, CREW_FIELD.nameFirst) }), type: t => TYPE_NAMES[t] ?? '?',
  };
  const site = (rank: number) => siteOf(core, rank);
  const crew = readCrews(core, G)[0].slot;
  const office = core.hs_get(TABLE.gang, G, GANG_FIELD.office);
  add('lieutenant', personName(core, readCrews(core, G)[0].lieutenant), 'Luigi Romano');
  add('office (1.2.91 number 4576)', office, site(4576));

  const issue = (label: string, d: Partial<Draft> & { kind: OrderKind }, est: number | null, want: string) => {
    const draft = { ...newDraft(crew, d.kind), ...d };
    const p = previewDraft(core, draft);
    if (est !== null) add(`${label}: estimate (minutes)`, p ? p.order.estimate : -1, est);
    const r: Reply = issueDraft(core, draft);
    add(`${label}: reply`, replyText(x, r), want);
    return { preview: p, reply: r };
  };
  const newest = (kind: OrderKind): Order | null => {
    let best: Order | null = null;
    for (let s = 0; s < 512; s++) {
      if (core.hs_get(ORDER_TABLE.order, s, ORDER_FIELD.gang) !== G || ORDER_KINDS[core.hs_get(ORDER_TABLE.order, s, ORDER_FIELD.kind)] !== kind) continue;
      const o = readOrder(core, s);
      if (!best || o.id > best.id) best = o;
    }
    return best;
  };
  const results = (kind: OrderKind) => readLastWeek(core, G).find(o => o.kind === kind);
  const texts = (o: Order | undefined) => (o ? o.results.map(l => lineText(x, l)) : []);
  const week = (n: number) => {
    const t0 = now();
    core.hs_finish_week();
    weekMs.push(Math.round(now() - t0));
    const ref = WEEK_REF[n - 1];
    add(`week ${n}: cash (1.2.91 less business income, item 8)`, core.hs_get(TABLE.gang, G, GANG_FIELD.cash), ref.cash);
    add(`week ${n}: wages`, core.hs_get(TABLE.gang, G, GANG_FIELD.wages), ref.wages);
    add(`week ${n}: random draws`, core.hs_count(COUNT.drawsWeek), ref.draws, '20%');
  };
  const done = (kind: OrderKind, label: string, ref: number) => {
    const o = results(kind);
    add(`${label}: state`, o?.state ?? 'missing', 'done');
    add(`${label}: done at minute (1.2.91 with cars)`, o?.finished ?? -1, ref, 'info');
  };
  const lines = (kind: OrderKind, label: string, want: string[]) => {
    const got = texts(results(kind));
    want.forEach((w, i) => add(`${label}: result ${i + 1}`, got[i] ?? '(none)', w));
    if (got.length !== want.length) add(`${label}: results`, got.length, want.length);
  };

  // Week 1
  issue('collect 1407, 1578', { kind: 'collect', buildings: [site(1407), site(1578)] }, 312, 'Luigi Romano accepted the order.');
  const col = newest('collect');
  add('collect: route', col ? col.targets.map(b => b === site(1578) ? 1578 : b === site(1407) ? 1407 : b).join(' then ') : '', '1578 then 1407');
  const buy = issue('buy 1411', { kind: 'buy', buildings: [site(1411)] }, 359, 'Luigi Romano accepted the order.');
  add('buy 1411: price', buy.preview?.order.cost ?? -1, 160);
  issue('explore block 413', { kind: 'explore', blocks: [413] }, 340, 'Luigi Romano accepted the order.');
  add('explore: sites', newest('explore')?.targets.length ?? 0, 5);
  issue('recruit block 413', { kind: 'recruit', blocks: [413] }, null, 'Nothing there for that order.');
  issue('clear streets block 413', { kind: 'clearStreets', blocks: [413] }, null,
    'Clearing the streets needs the mayor or the police chief on your side (bribed).');
  issue('explore with 3 men', { kind: 'explore', blocks: [413], manpower: 3 }, null, 'Luigi Romano has only 2 people.');
  core.hs_launch_week();
  const who = (k: OrderKind) => { const o = newest(k); return o && o.assigned.length ? personName(core, o.assigned[0]) : o?.state ?? ''; };
  add('week 1 hand-out: collect', who('collect'), 'Sal Rinaldi');
  add('week 1 hand-out: buy', who('buy'), 'Luigi Romano');
  add('week 1 hand-out: explore', who('explore'), 'queued');
  week(1);
  done('buy', 'buy', 498); done('collect', 'collect', 552); done('explore', 'explore', 1321);
  lines('collect', 'collect', ['Collected $152 from Apartment Block on Cermak St at Wood Ave.',
    'Collected $152 from Apartment Block on Maxwell St at Paulina Ave.']);
  lines('buy', 'buy', ['Bought Empty land on Maxwell St at Paulina Ave for $160.']);
  lines('explore', 'explore', ['Looked over Perfume Store on Archer St at Paulina Ave: owned by you.',
    'Looked over Residences on Cermak St at Paulina Ave: paying nobody.', 'Looked over Residences on Cermak St at Paulina Ave: paying nobody.',
    'Looked over Residences on Cermak St at Hermitage Ave: paying nobody.', 'Looked over Office on Cermak St at Paulina Ave: owned by you.']);

  // Week 2
  issue('adjust 1407 to 150 %', { kind: 'adjust', buildings: [site(1407)], level: 150 }, 142, 'Luigi Romano accepted the order.');
  issue('set up a clothing bank at 1583', { kind: 'setUp', buildings: [site(1583)], business: TYPE_IDS.indexOf('clothingBank') }, 538,
    'Luigi Romano accepted the order.');
  const setUp = newest('setUp');
  add('cancel the set-up', setUp ? replyText(x, command(core, CMD.cancel, setUp.slot)) : '', 'Order cancelled.');
  issue('clean up block 413', { kind: 'cleanUp', blocks: [413] }, 338, 'Luigi Romano accepted the order.');
  issue('donate $200 to 1406', { kind: 'donate', buildings: [site(1406)], amount: 200 }, 186, 'Luigi Romano accepted the order.');
  core.hs_launch_week();
  week(2);
  done('adjust', 'adjust', 255); done('cleanUp', 'clean up', 666); done('donate', 'donate', 681);
  lines('adjust', 'adjust', ['Protection at Apartment Block on Maxwell St at Paulina Ave set to $228.']);
  lines('cleanUp', 'clean up', ['Cleaned up round Perfume Store on Archer St at Paulina Ave.',
    'Cleaned up round Residences on Cermak St at Paulina Ave.', 'Cleaned up round Residences on Cermak St at Paulina Ave.',
    'Cleaned up round Residences on Cermak St at Hermitage Ave.', 'Cleaned up round Office on Cermak St at Paulina Ave.']);
  lines('donate', 'donate', ['Donated $200 to Church on Maxwell St at Laflin Ave.']);
  add('week 2: purchases', core.hs_get(TABLE.gang, G, GANG_FIELD_LAST_PURCHASES), 450);

  // Week 3
  issue('run 1583', { kind: 'run', buildings: [site(1583)] }, 176, 'Luigi Romano accepted the order.');
  const lot = core.hs_get(TABLE.building, office, BUILDING_FIELD.lot);
  const lf = (k: number) => core.hs_get(TABLE.lot, lot, k);
  issue('go to the office', { kind: 'goTo', point: { x: lf(2) + Math.trunc(lf(4) / 2), y: lf(3) + Math.trunc(lf(5) / 2) } }, 1200,
    'Luigi Romano accepted the order.');
  core.hs_launch_week();
  week(3);
  done('run', 'run', 176);
  lines('run', 'run', ['New management installed at Perfume Store on Archer St at Paulina Ave.']);
  const goTo = results('goTo');
  add('go to: held position (minutes)', goTo?.results[0]?.b ?? -1, 2376, '20%');
  add('go to: line', texts(goTo)[0] ?? '', 'Held position for 39h 36m.', 'info');
  add('week 3: crew', readCrews(core, G)[0].members.map(p => personName(core, p)).join(', '), 'Gino Costa');

  // Week 4
  const pool = [1, 2].map(k => core.hs_get(TABLE.pool, G, k));
  add('move the first of the pool to the crew', replyText(x, command(core, CMD.moveToCrew, pool[0], crew)), 'Vito Ferrante joined Luigi\'s Crew.');
  add('move the second of the pool to the crew', replyText(x, command(core, CMD.moveToCrew, pool[1], crew)), 'Carmela Romano joined Luigi\'s Crew.');
  issue('patrol block 413', { kind: 'patrol', blocks: [413] }, 600, 'Luigi Romano accepted the order.');
  issue('guard 1583', { kind: 'guard', buildings: [site(1583)] }, 600, 'Luigi Romano accepted the order.');
  issue('recruit block 411', { kind: 'recruit', blocks: [411] }, 213, 'Luigi Romano accepted the order.');
  add('recruit: site (1.2.91 number 1570, the gym)', newest('recruit')?.targets[0] ?? -1, site(1570));
  core.hs_launch_week();
  add('week 4 hand-out: patrol', who('patrol'), 'Luigi Romano');
  add('week 4 hand-out: guard', who('guard'), 'Gino Costa');
  add('week 4 hand-out: recruit', who('recruit'), 'Vito Ferrante');
  week(4);
  done('recruit', 'recruit', 294);
  lines('recruit', 'recruit', ['1 hood signed on, waiting in the pool.']);
  const patrol = results('patrol'), guard = results('guard');
  add('patrol: blocks', patrol?.results[0]?.b ?? -1, 1);
  add('patrol: minutes', patrol?.results[0]?.c ?? -1, 2344, '20%');
  add('patrol: line', texts(patrol)[0] ?? '', 'Patrolled 1 block for 39h 4m.', 'info');
  add('guard: minutes', guard?.results[0]?.b ?? -1, 2399, '20%');
  add('guard: line', texts(guard)[0] ?? '', 'Stood guard at Perfume Store on Archer St at Paulina Ave for 39h 59m.', 'info');
  add('week 4: pool, crew', `${core.hs_get(TABLE.gang, G, GANG_FIELD.poolCount)}, ${readCrews(core, G)[0].members.length}`, '2, 3');
  const failed = rows.filter(r => !r.ok).length;
  return { rows, passed: rows.length - failed, failed, weekMs };
}
