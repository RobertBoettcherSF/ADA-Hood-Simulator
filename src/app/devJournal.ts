/**
 * 1.2.21: the debug report is the developer's full view. After every week the
 * journal records what really happened in the city — every gang's books,
 * crews and orders, the collection rounds stop by stop, minutes planned and
 * used, the news and its causes, wages asked against wages paid, and a world
 * snapshot (block grid with overlays). It lives in memory for the session,
 * is never saved with the city, and keeps the last JOURNAL_WEEKS weeks (1.2.23):
 * the report is split into part files when large. The Auto Test log keeps only in-game knowledge.
 */
import { takeStopTraces, type StopTrace } from '../sim/devTrace';
import { MAX_TEAMS, MAX_TEAM_SIZE } from '../sim/constants';
import { memberLosses } from '../sim/memberLosses';
import { crewRoleFromName, roleStars } from './autoActions';
import { hireQuote } from '../sim/originalWages';
import { peopleList } from '../sim/entityLists';
import type { Gang, Order, Person, WorldState } from '../sim/types';
import { gangHoldings, gangManpower, powerRating, territoryCount, teamsOf } from '../sim/world';
import { registerProbe } from '../sim/memProbe';

const weeks: string[] = [];
/** 1.2.23: the most weeks the journal holds in memory. */
export const JOURNAL_WEEKS = 60;
let droppedWeeks = 0;
/** Weeks let go from the front of the journal this session. */
export function devJournalDropped(): number { return droppedWeeks; }
/** 1.2.22: the Auto Test desk's own notes for the week (business crew, buy targets, drops, HQ scouting and strikes). */
const deskLines: string[] = [];
export function noteDevDesk(line: string): void { deskLines.push(line); }
// 1.2.28: memory probe.
registerProbe('journal', () => ({ weeks: weeks.length, kb: Math.round(weeks.reduce((n, s) => n + s.length, 0) / 1024), dropped: droppedWeeks, deskLines: deskLines.length }));

export function clearDevJournal(): void {
  weeks.length = 0;
  droppedWeeks = 0;
  deskLines.length = 0;
  takeStopTraces();
}

export function devJournalWeeks(): readonly string[] {
  return weeks;
}

const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const letter = (w: WorldState, gangId: number | null | undefined) => {
  if (gangId == null) return '.';
  const ids = Object.keys(w.gangs).map(Number).sort((a, b) => a - b);
  const g = w.gangs[gangId];
  const i = ids.indexOf(gangId);
  const ch = String.fromCharCode(65 + Math.max(0, i));
  return g?.isPlayer ? ch : ch.toLowerCase();
};

function gangBooks(w: WorldState, gang: Gang): string[] {
  const h = gangHoldings(w, gang);
  const inc = gang.lastWeekIncome, cost = gang.lastWeekCosts;
  return [
    `${gang.name}${gang.isPlayer ? ' (player)' : ''}${gang.eliminated ? ' ELIMINATED' : ''} [${letter(w, gang.id)}]`,
    `  cash ${$(gang.cash)} · property ${$(h.property)} · weapons ${$(h.weapons)} · vehicles ${$(h.vehicles)} · assets ${$(h.assets)} · wealth ${$(h.wealth)}`,
    `  income: legal ${$(inc.legal)} · illegal ${$(inc.illegal)} · protection ${$(inc.protection)} · other ${$(inc.other)} = ${$(inc.legal + inc.illegal + inc.protection + inc.other)}`,
    `  costs: wages ${$(cost.wages)} · upkeep ${$(cost.upkeep)} · purchases ${$(cost.purchases)}`,
    crewCapacity(w, gang),
    ...sackings(w, gang),
    `  men ${gangManpower(w, gang)} · crews ${gang.teamIds.length} · pool ${gang.poolIds.length} · blocks ${territoryCount(w, gang.id)} · power ${powerRating(w, gang)} · suspicion ${Math.round(gang.suspicion)} · evidence ${Math.round(gang.evidence)}`,
  ];
}

/** Crew capacity (eight lieutenants with nine hoods) against the men in crews and the pool. */
function crewCapacity(w: WorldState, gang: Gang): string {
  const inCrews = teamsOf(w, gang).reduce((sum, t) => sum + t.memberIds.length + 1, 0);
  const idle = gang.poolIds.filter((id) => w.people[id]?.status === 'active').length;
  return `  crew capacity ${MAX_TEAMS * MAX_TEAM_SIZE} · in crews ${inCrews} · pool ${gang.poolIds.length} (${idle} active) · crew men + pool ${inCrews + gang.poolIds.length}`;
}

function sackings(w: WorldState, gang: Gang): string[] {
  const sacked = memberLosses(w, gang.id, w.week - 1).filter((l) => l.cause === 'sacked');
  return sacked.length ? [`  sacked ${sacked.length}: ${sacked.map((l) => `${l.name} (${l.role}, week ${l.week})`).join(', ')}`] : [];
}

/** The crew's job (from its name) and its men's average stars in that job's skills. */
function crewStars(w: WorldState, name: string, ids: number[]): string {
  const role = crewRoleFromName(name);
  const men = ids.map((id) => w.people[id]).filter((p): p is Person => !!p);
  if (!role || !men.length) return '';
  return ` · ${role} ${(men.reduce((sum, p) => sum + roleStars(p, role), 0) / men.length).toFixed(1)}★ avg`;
}

function blockLabel(w: WorldState, buildingId: number | null): string {
  if (buildingId == null) return '-';
  const b = w.buildings[buildingId];
  if (!b) return `#${buildingId}`;
  const blk = w.blocks[b.blockId], lot = w.lots[b.lotId];
  return `${b.typeId}#${b.id} @${blk?.gx},${blk?.gy}/${(lot?.index ?? 0) + 1}`;
}

function ordersSection(w: WorldState, gang: Gang, traces: StopTrace[], visitsByBuilding: Map<number, number[]>): string[] {
  const out: string[] = [];
  const orders = w.lastWeekOrders.filter((o) => o.gangId === gang.id);
  const live = Object.values(w.orders).filter((o) => o.gangId === gang.id);
  for (const team of teamsOf(w, gang)) {
    const lt = w.people[team.lieutenantId];
    const mine = orders.filter((o) => o.teamId === team.id);
    const carried = live.filter((o) => o.teamId === team.id && o.opts.repeat);
    const tr = traces.filter((t) => t.teamId === team.id);
    const planned = mine.reduce((s, o) => s + (o.estimatedMinutes || 0), 0);
    const used = tr.length ? Math.max(...tr.map((t) => t.minute)) : 0;
    out.push(`  crew ${team.name} (lt ${lt?.name ?? '?'} ${lt?.status ?? ''}, ${team.memberIds.length} men${crewStars(w, team.name, [team.lieutenantId, ...team.memberIds])}) planned ${Math.round(planned)} min · last stop at minute ${used}${carried.length ? ` · repeat carryover ${carried.length}` : ''}`);
    for (const o of mine) out.push(...orderLines(w, o, tr.filter((t) => t.orderId === o.id), visitsByBuilding));
  }
  return out;
}

function orderLines(w: WorldState, o: Order, tr: StopTrace[], visitsByBuilding: Map<number, number[]>): string[] {
  const out = [`    ${o.type}#${o.id} ${o.state} targets ${o.targetBuildingIds.length} done ${o.completedTargets} est ${Math.round(o.estimatedMinutes)} min worked ${Math.round(o.workedMinutes ?? 0)}${o.opts.repeat ? ' repeat' : ''}${o.failReason ? ` — ${o.failReason}` : ''}`];
  if (o.type === 'collectProtection' || o.type === 'extort' || o.targetBuildingIds.length > 1) {
    let lastEnd = 0;
    o.targetBuildingIds.forEach((id, i) => {
      const arrive = tr.find((t) => t.buildingId === id && t.event === 'arrive');
      const end = tr.find((t) => t.buildingId === id && (t.event === 'done' || t.event === 'miss'));
      const b = w.buildings[id];
      const visits = visitsByBuilding.get(id) ?? [];
      const dbl = visits.length > 1 ? ` DOUBLE VISIT (orders ${visits.join(', ')})` : '';
      if (!arrive && !end) { out.push(`      ${i + 1}. ${blockLabel(w, id)} SKIPPED (not reached)${dbl}`); return; }
      const travel = arrive ? arrive.minute - lastEnd : 0;
      const stay = arrive && end ? end.minute - arrive.minute : 0;
      if (end) lastEnd = end.minute;
      out.push(`      ${i + 1}. ${blockLabel(w, id)} travel ${travel} min · at stop ${stay} min · ${end?.event ?? 'unfinished'}${end?.note ? ` (${end.note})` : ''}${b?.protection ? ` · pays ${$(b.protection.weekly)}` : ''}${dbl}`);
    });
  }
  return out;
}

function grid(w: WorldState, title: string, cell: (gx: number, gy: number) => string): string[] {
  const out = [title];
  const header = '     ' + Array.from({ length: w.gridW }, (_, x) => String(x % 100).padStart(3, ' ')).join('');
  out.push(header);
  for (let y = 0; y < w.gridH; y++) {
    out.push(String(y).padStart(4, ' ') + ' ' + Array.from({ length: w.gridW }, (_, x) => cell(x, y).padStart(3, ' ')).join(''));
  }
  return out;
}

function snapshot(w: WorldState, player: Gang | undefined): string[] {
  const blockAt = new Map<string, (typeof w.blocks)[number]>();
  for (const b of w.blocks) if (b.lotIds.length) blockAt.set(`${b.gx},${b.gy}`, b);
  const out: string[] = ['World snapshot (x across, y down). Gang letters: capital = player.'];
  // 9 squares per block: each lot's owner, protection or building class.
  out.push('Territory, 3×3 squares per block (lot owner = letter, protected by = letter+, empty lot = ., no lot = space):');
  out.push('     ' + Array.from({ length: w.gridW }, (_, x) => String(x).padStart(3, ' ')).join(' '));
  for (let y = 0; y < w.gridH; y++) {
    for (let row = 0; row < 3; row++) {
      let line = row === 1 ? String(y).padStart(4, ' ') + ' ' : '     ';
      for (let x = 0; x < w.gridW; x++) {
        const blk = blockAt.get(`${x},${y}`);
        let cells = '';
        for (let col = 0; col < 3; col++) {
          const lotId = blk?.lotIds.find((id) => w.lots[id]?.index === row * 3 + col);
          const b = lotId != null ? w.buildings[w.lots[lotId].buildingId] : undefined;
          cells += !b ? ' ' : b.ownerGangId != null ? letter(w, b.ownerGangId) : b.protection ? (w.gangs[b.protection.gangId]?.isPlayer ? '*' : '+') : b.cls === 'empty' ? '.' : '_';
        }
        line += cells + ' ';
      }
      out.push(line);
    }
  }
  out.push('Key: letter = owned by that gang; * = protected by the player, + = protected by a rival; _ = unowned building; . = empty lot.');
  const area = new Map<number, string>();
  if (player) teamsOf(w, player).forEach((t, i) => { for (const id of t.allocatedBlockIds) area.set(id, String(i + 1)); });
  out.push(...grid(w, 'Lieutenant areas (player crew number per block):', (x, y) => { const b = blockAt.get(`${x},${y}`); return b ? area.get(b.id) ?? '.' : ''; }));
  out.push(...grid(w, 'Land value (0–9):', (x, y) => { const b = blockAt.get(`${x},${y}`); return b ? String(Math.min(9, Math.floor(b.landValue / 10))) : ''; }));
  out.push(...grid(w, 'Security — police presence per block:', (x, y) => { const b = blockAt.get(`${x},${y}`); return b ? String(Math.round(b.policePresence)) : ''; }));
  const hostility = (bid: number) => {
    const owners = peopleList(w).filter((p) => p.role === 'owner' && p.status === 'active' && p.buildingId != null && w.buildings[p.buildingId]?.blockId === bid);
    if (!owners.length || !player) return '.';
    const avg = owners.reduce((s, p) => s + -(p.opinion[player.id] ?? 0), 0) / owners.length;
    return avg <= 0 ? '0' : String(Math.min(9, Math.floor(avg / 10)));
  };
  out.push(...grid(w, 'Shopkeeper hostility to the player (0–9, tens of points):', (x, y) => { const b = blockAt.get(`${x},${y}`); return b ? hostility(b.id) : ''; }));
  out.push(...grid(w, 'Crime hot spots (crime heat, tens):', (x, y) => { const b = blockAt.get(`${x},${y}`); return b ? String(Math.min(9, Math.floor(b.crimeHeat / 10))) : ''; }));
  const events = new Map<string, number>();
  for (const c of w.crimes.filter((c) => c.week === w.week - 1 || c.week === w.week)) {
    const b = c.buildingId != null ? w.buildings[c.buildingId] : undefined;
    const blk = b ? w.blocks[b.blockId] : undefined;
    if (blk) events.set(`${blk.gx},${blk.gy}`, (events.get(`${blk.gx},${blk.gy}`) ?? 0) + 1);
  }
  out.push(...grid(w, 'Recent events (crimes recorded last week per block):', (x, y) => { const n = events.get(`${x},${y}`); return blockAt.get(`${x},${y}`) ? (n ? String(Math.min(9, n)) : '.') : ''; }));
  return out;
}

/** Record the week just finished. Call once each time the city is back at the desk. */
export function captureDevWeek(w: WorldState): void {
  const traces = takeStopTraces();
  const lines: string[] = [`=================== Week ${w.week - 1} (recorded at the start of week ${w.week}) ===================`];
  lines.push('', 'Gangs — books');
  for (const gang of Object.values(w.gangs)) lines.push(...gangBooks(w, gang));
  // Every building visited by more than one order this week.
  const visitsByBuilding = new Map<number, number[]>();
  for (const t of traces) if (t.event === 'arrive' && t.buildingId != null) {
    const list = visitsByBuilding.get(t.buildingId) ?? [];
    if (!list.includes(t.orderId)) list.push(t.orderId);
    visitsByBuilding.set(t.buildingId, list);
  }
  if (deskLines.length) {
    lines.push('', 'Auto Test desk (planning notes for this week)');
    for (const l of deskLines.splice(0)) lines.push(`  ${l}`);
  }
  lines.push('', 'Crews and orders (every gang), with each round stop by stop');
  for (const gang of Object.values(w.gangs)) {
    if (gang.eliminated) continue;
    lines.push(`${gang.name}:`);
    lines.push(...ordersSection(w, gang, traces, visitsByBuilding));
  }
  lines.push('', 'News this week, with causes');
  for (const n of w.news.filter((n) => n.week === w.week - 1 || n.week === w.week)) {
    const cause = [n.kind && `kind ${n.kind}`, n.gangId != null && `gang ${w.gangs[n.gangId]?.name}`, n.buildingId != null && `site ${blockLabel(w, n.buildingId)}`, n.amount != null && `amount ${$(n.amount)}`].filter(Boolean).join(', ');
    lines.push(`  [${n.section}] ${n.headline} — ${n.body}${cause ? ` (cause: ${cause})` : ''}`);
  }
  for (const l of w.weekLog) lines.push(`  log: ${l}`);
  const player = Object.values(w.gangs).find((g) => g.isPlayer);
  if (player) {
    lines.push('', 'Prices asked vs paid (player gang: wages)');
    for (const p of peopleList(w).filter((p) => p.gangId === player.id && p.status !== 'dead' && p.role !== 'boss')) {
      if (p.pay !== p.payDemand) lines.push(`  ${p.role} ${p.name}: asks ${$(p.payDemand)} · paid ${$(p.pay)}${p.pay < p.payDemand ? ' (short)' : ''}`);
    }
    for (const p of peopleList(w).filter((p) => p.gangId == null && (p.role === 'lawyer' || p.role === 'accountant') && p.status === 'active').slice(0, 12)) {
      lines.push(`  for hire ${p.role} ${p.name}: stored demand ${$(p.payDemand)} · would be paid ${$(hireQuote(w, p, player.id))} on joining us`);
    }
    const fin = player.finances;
    if (fin) lines.push('', `Accountant's numbers: opening ${$(fin.openingCash)} closing ${$(fin.closingCash)} · income legal ${$(fin.income.legal)} illegal ${$(fin.income.illegal)} protection ${$(fin.income.protection)} other ${$(fin.income.other)} · costs wages ${$(fin.costs.wages)} upkeep ${$(fin.costs.upkeep)} purchases ${$(fin.costs.purchases)} tax ${$(fin.costs.tax)} · taxable ${$(fin.taxableProfit ?? 0)} · risky ${$(fin.riskyIncome ?? 0)}`);
    lines.push('', 'Officials (lawyer\'s view, with labels)');
    const official = (id: number | undefined, label: string) => {
      const o = id != null ? w.people[id] : undefined;
      if (o) lines.push(`  ${label}: ${o.name} · ${o.status} · opinion of us ${Math.round(o.opinion[player.id] ?? 0)}${o.bribedBy != null ? ` · bought by ${w.gangs[o.bribedBy]?.name ?? o.bribedBy}` : ''}`);
    };
    official(w.mayorId, 'Mayor'); official(w.policeChiefId, 'Police chief');
    for (const id of w.judgeIds) official(id, 'Judge');
    for (const id of w.daIds) official(id, 'District Attorney');
  }
  lines.push('', ...snapshot(w, player));
  lines.push('');
  weeks.push(lines.join('\n'));
  // 1.2.23: bounded — the last JOURNAL_WEEKS weeks are kept (a year and more);
  // the oldest go first, and the report says how many were let go.
  if (weeks.length > JOURNAL_WEEKS) { droppedWeeks += weeks.length - JOURNAL_WEEKS; weeks.splice(0, weeks.length - JOURNAL_WEEKS); }
}

/** The report split into parts of at most `size` characters, never cutting a line. */
export function splitReport(text: string, size = 4_000_000): string[] {
  if (text.length <= size) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) { const nl = text.lastIndexOf('\n', end); if (nl > start) end = nl + 1; }
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}

