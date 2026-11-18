/**
 * 1.2.75 (Robert, point 10): report-only lines for the Auto Test report files
 * (the yearly files and the final report), about 1 KB a week. They are written
 * after the week is played and are never read back by Auto's desk — the rival
 * and officials lines show what the game knows, not what Auto knows.
 */
import { hireLines, type HireLine } from '../sim/hireLog';
import { memberLosses } from '../sim/memberLosses';
import { gangManpower, territoryCount } from '../sim/world';
import type { Order, Person, WorldState } from '../sim/types';

const op = (p: Person | undefined, gangId: number) => (p ? Math.round(p.opinion[gangId] ?? 0) : 0);
/** 1.2.77 (Robert, point 15): our own gang is marked "(us)". */
const gangName = (w: WorldState, id: number, us?: number) => `${w.gangs[id]?.name ?? `gang ${id}`}${id === us ? ' (us)' : ''}`;
const owner = (w: WorldState, p: Person | undefined, us?: number) => (p?.bribedBy != null ? gangName(w, p.bribedBy, us) : 'none');

/** OFFICIALS: mayor and chief (owner, opinion of us), judges and DAs (opinion range, owners). */
export function officialsLine(w: WorldState, gangId: number, week: number): string {
  const mayor = w.people[w.mayorId], chief = w.people[w.policeChiefId];
  const group = (ids: readonly number[]) => {
    const ps = ids.map((id) => w.people[id]).filter((p): p is Person => !!p && p.status !== 'dead');
    if (!ps.length) return 'none';
    const ops = ps.map((p) => op(p, gangId));
    const owners = new Map<string, number>();
    for (const p of ps) if (p.bribedBy != null) owners.set(owner(w, p, gangId), (owners.get(owner(w, p, gangId)) ?? 0) + 1);
    return `${ps.length}, opinion ${Math.min(...ops)}..${Math.max(...ops)}${owners.size ? `, bought: ${[...owners].map(([k, n]) => `${k} ${n}`).join(', ')}` : ''}`;
  };
  return `REPORT-ONLY OFFICIALS wk ${week}: mayor ${mayor?.name ?? '?'} (owner ${owner(w, mayor, gangId)}, opinion ${op(mayor, gangId)}); chief ${chief?.name ?? '?'} (owner ${owner(w, chief, gangId)}, opinion ${op(chief, gangId)}); judges ${group(w.judgeIds ?? [])}; DAs ${group(w.daIds ?? [])}`;
}

/** TOP-UP and FREE HIRE lines logged since `sinceWeek`, each once (the `shown` set is the run's). */
export function hireReportLines(w: WorldState, sinceWeek: number, shown: Set<HireLine>): string[] {
  const out: string[] = [];
  for (const l of hireLines(w, sinceWeek)) {
    if (shown.has(l)) continue;
    shown.add(l);
    out.push(`REPORT-ONLY wk ${l.week} ${l.text}`);
  }
  return out;
}

/** BUY TIMING: last week's buys and set-ups by crew type — done, average taken ÷ estimate, ran out, nobody. */
export function buyTimingLine(w: WorldState, gangId: number, week: number, roleOf: (teamId: number) => string): string | null {
  const by = new Map<string, { done: number; ratio: number; n: number; out: number; nobody: number }>();
  for (const o of w.lastWeekOrders as Order[]) {
    if (o.gangId !== gangId || (o.type !== 'buyPremises' && o.type !== 'setUpBusiness')) continue;
    const key = roleOf(o.teamId);
    const s = by.get(key) ?? { done: 0, ratio: 0, n: 0, out: 0, nobody: 0 };
    const why = o.failReason ?? '';
    if (o.completedTargets > 0 && !o.failReason) {
      s.done++;
      if (o.estimatedMinutes > 0 && o.startedMinute != null && o.finishedMinute != null && o.finishedMinute > o.startedMinute) { s.ratio += (o.finishedMinute - o.startedMinute) / o.estimatedMinutes; s.n++; }
    } else if (/nobody|never started/i.test(why)) s.nobody++;
    else if (/time|week/i.test(why)) s.out++;
    by.set(key, s);
  }
  if (!by.size) return null;
  return `REPORT-ONLY BUY TIMING wk ${week}: ${[...by].map(([k, s]) => `${k} done ${s.done}${s.n ? ` (taken ÷ estimate ×${(s.ratio / s.n).toFixed(2)})` : ''}, ran out ${s.out}, nobody ${s.nobody}`).join('; ')}`;
}

/** RIVALS: each live rival's men, crews, pool, cash and blocks (the game's figures; Auto never reads this). */
export function rivalLine(w: WorldState, gangId: number, week: number): string {
  const rivals = Object.values(w.gangs).filter((g) => g.id !== gangId && !g.eliminated);
  return `REPORT-ONLY RIVALS wk ${week} (Auto never reads this; us: ${gangName(w, gangId)}): ${rivals.length ? rivals.map((g) => `${g.name} men ${gangManpower(w, g)}, crews ${g.teamIds.length}, pool ${g.poolIds.length}, cash $${Math.round(g.cash).toLocaleString('en-US')}, blocks ${territoryCount(w, g.id)}`).join('; ') : 'none left'}`;
}

/** 1.2.76 (Robert, point 8): OFFICERS — the police officers' opinion of us (all, and those on nobody's payroll), who pays or bought them. */
export function officersLine(w: WorldState, gangId: number, week: number): string {
  const ps = (w.policeIds ?? []).map((id) => w.people[id]).filter((p): p is Person => !!p && p.status !== 'dead');
  if (!ps.length) return `REPORT-ONLY OFFICERS wk ${week}: none`;
  const ops = ps.map((p) => op(p, gangId));
  const free = ps.filter((p) => p.employedBy == null && p.bribedBy == null).map((p) => op(p, gangId));
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : 0);
  const payers = new Map<string, number>();
  for (const p of ps) {
    const by = p.employedBy ?? p.bribedBy;
    if (by != null) { const k = gangName(w, by, gangId); payers.set(k, (payers.get(k) ?? 0) + 1); }
  }
  return `REPORT-ONLY OFFICERS wk ${week}: ${ps.length}, opinion of us ${Math.min(...ops)}..${Math.max(...ops)} (avg ${avg(ops)}); unpaid ${free.length}, avg ${avg(free)}${payers.size ? `; paid or bought: ${[...payers].map(([k, n]) => `${k} ${n}`).join(', ')}` : '; none paid or bought'}`;
}

/** 1.2.76 (Robert, point 8): ARRESTS BY CAUSE — our men arrested or convicted in the week: police street, police scene, FBI, courts. */
export function arrestsByCauseLine(w: WorldState, gangId: number, week: number): string {
  const ls = memberLosses(w, gangId, week).filter((l) => l.week === week);
  const street = ls.filter((l) => l.by === 'the police' && /arrested in the street/.test(l.cause)).length;
  const scene = ls.filter((l) => l.by === 'the police' && /at the scene/.test(l.cause)).length;
  const otherPolice = ls.filter((l) => l.by === 'the police' && /arrest/.test(l.cause) && !/arrested in the street|at the scene/.test(l.cause)).length;
  const fbi = ls.filter((l) => l.by === 'the FBI').length;
  const courts = ls.filter((l) => l.by === 'the courts').length;
  return `REPORT-ONLY ARRESTS BY CAUSE wk ${week}: police street ${street}, police scene ${scene}${otherPolice ? `, police other ${otherPolice}` : ''}, FBI ${fbi}, convicted ${courts}`;
}

/** 1.2.77 (Robert, point 15): LAWYER JOBS — the lawyer's jobs of the week and how each ended (the game's job record). */
export function lawyerJobsLine(w: WorldState, gangId: number, week: number): string {
  const jobs = Object.values(w.specialistJobs ?? {}).filter((j) => j.gangId === gangId && j.week === week && j.type !== 'audit');
  if (!jobs.length) return `REPORT-ONLY LAWYER JOBS wk ${week}: none`;
  const what = (j: (typeof jobs)[number]) => j.type === 'employPolice' ? `police payroll tour (${j.completed} hired)` : `bribe ${w.people[j.targetPersonId ?? -1]?.name ?? 'an official'} (${w.people[j.targetPersonId ?? -1]?.role ?? '?'})`;
  return `REPORT-ONLY LAWYER JOBS wk ${week}: ${jobs.length} — ${jobs.map((j) => `${what(j)}: ${j.state}${j.result ? ` — ${j.result}` : ''}`).join('; ')}`;
}

/**
 * 1.2.78 (Robert, point 12): report-only — each crew bribe of an official in the week just played:
 * the official, the sum paid, took or refused, and who owns him after.
 */
export function crewBribeResultLine(w: WorldState, gangId: number, week: number): string {
  const officials = new Set(['mayor', 'policeChief', 'judge', 'da', 'police']);
  const bribes = w.lastWeekOrders.filter((o) => o.gangId === gangId && o.type === 'bribe' && o.targetPersonId != null && officials.has(w.people[o.targetPersonId]?.role ?? ''));
  if (!bribes.length) return `REPORT-ONLY CREW BRIBE RESULT wk ${week}: none`;
  const one = (o: Order) => {
    const p = w.people[o.targetPersonId!];
    const text = [...(o.results ?? []), o.failReason ?? ''].join(' ');
    const end = /took the money/.test(text) ? 'took it' : /refused the money/.test(text) ? 'refused' : o.failReason ? `not done (${o.failReason})` : o.state;
    return `${p?.name ?? 'an official'} (${p?.role ?? '?'}): paid $${Math.round(o.spent ?? 0)}, ${end}, owner after ${owner(w, p, gangId)}`;
  };
  return `REPORT-ONLY CREW BRIBE RESULT wk ${week}: ${bribes.map(one).join('; ')}`;
}
