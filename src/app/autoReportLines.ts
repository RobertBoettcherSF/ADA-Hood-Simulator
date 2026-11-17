/**
 * 1.2.75 (Robert, point 10): report-only lines for the Auto Test report files
 * (the yearly files and the final report), about 1 KB a week. They are written
 * after the week is played and are never read back by Auto's desk — the rival
 * and officials lines show what the game knows, not what Auto knows.
 */
import { hireLines, type HireLine } from '../sim/hireLog';
import { gangManpower, territoryCount } from '../sim/world';
import type { Order, Person, WorldState } from '../sim/types';

const op = (p: Person | undefined, gangId: number) => (p ? Math.round(p.opinion[gangId] ?? 0) : 0);
const owner = (w: WorldState, p: Person | undefined) => (p?.bribedBy != null ? w.gangs[p.bribedBy]?.name ?? `gang ${p.bribedBy}` : 'none');

/** OFFICIALS: mayor and chief (owner, opinion of us), judges and DAs (opinion range, owners). */
export function officialsLine(w: WorldState, gangId: number, week: number): string {
  const mayor = w.people[w.mayorId], chief = w.people[w.policeChiefId];
  const group = (ids: readonly number[]) => {
    const ps = ids.map((id) => w.people[id]).filter((p): p is Person => !!p && p.status !== 'dead');
    if (!ps.length) return 'none';
    const ops = ps.map((p) => op(p, gangId));
    const owners = new Map<string, number>();
    for (const p of ps) if (p.bribedBy != null) owners.set(owner(w, p), (owners.get(owner(w, p)) ?? 0) + 1);
    return `${ps.length}, opinion ${Math.min(...ops)}..${Math.max(...ops)}${owners.size ? `, bought: ${[...owners].map(([k, n]) => `${k} ${n}`).join(', ')}` : ''}`;
  };
  return `REPORT-ONLY OFFICIALS wk ${week}: mayor ${mayor?.name ?? '?'} (owner ${owner(w, mayor)}, opinion ${op(mayor, gangId)}); chief ${chief?.name ?? '?'} (owner ${owner(w, chief)}, opinion ${op(chief, gangId)}); judges ${group(w.judgeIds ?? [])}; DAs ${group(w.daIds ?? [])}`;
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
  return `REPORT-ONLY RIVALS wk ${week} (Auto never reads this): ${rivals.length ? rivals.map((g) => `${g.name} men ${gangManpower(w, g)}, crews ${g.teamIds.length}, pool ${g.poolIds.length}, cash $${Math.round(g.cash).toLocaleString('en-US')}, blocks ${territoryCount(w, g.id)}`).join('; ') : 'none left'}`;
}
