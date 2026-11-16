/**
 * 1.2.59 (Robert): the SUMMARY block at the top of every Auto Test report
 * (right after BUILD and TEST KEY) — built from the report's own lines and the
 * weekly snapshots, for the weeks the file covers (the final report: the run).
 */

/** The weekly snapshot fields the summary reads. */
export interface SummaryWeek { week: number; territory: number; men: number; cash: number }

/** 1.2.59 (Robert): a slow stretch — at least this many weeks running with fewer than SLOW_GAIN blocks gained each. */
export const SLOW_WEEKS = 3;
export const SLOW_GAIN = 2;
/** 1.2.59 (Robert): the timeline is sampled every this many weeks. */
export const SUMMARY_EVERY = 10;

/** The report lines the summary needs, kept across the 60-week files (long lines cut to what is read). */
export function summaryKeep(line: string): string | null {
  if (line.startsWith('CASH FIT R ')) { const m = /idle penalty \$\d+\/wk on \$\d+ idle/.exec(line); return m ? `CASH FIT R ${m[0]}` : null; }
  return /^(-- week |NOTE men: |FITNESS week |FAIL orders — no crew|LOST |HEAT |ORDER EXEC |LEARN \(|LEARN coin|BUYS week )/.test(line) ? line : null;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const bump = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const list = (m: Map<string, number>, n = Infinity) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k, v]) => `${k} ×${v}`).join(', ');

export function summaryBlock(opts: { lines: readonly string[]; weeks: readonly SummaryWeek[]; from: number; to: number; outcome: string }): string[] {
  const { lines, weeks } = opts;
  let week = opts.from;
  const managers = new Map<number, number>(), reserve = new Map<number, number>();
  const noCrew: number[] = [];
  const rival = new Map<string, number>(), fbi = new Map<string, number>(), other = new Map<string, number>();
  let policeStreet = 0, policeScene = 0, sacked = 0, reArrests = 0;
  const peak = { fbi: [0, 0], fbiScore: [0, 0], wanted: [0, 0], chief: [Infinity, 0], mayor: [Infinity, 0], idle: [0, 0], free: [-Infinity, 0] };
  const exec = { put: 0, given: 0, done: 0, partly: 0, notDone: 0, notGiven: 0, carried: 0, approved: 0 };
  const reasons = new Map<string, number>();
  let learnLast = '';
  const coins = { doIt: 0, hold: 0, tryIt: 0, notTried: 0 };
  const buys = { done: 0, failed: 0 };
  const buyWhy = new Map<string, number>();
  for (const line of lines) {
    if (line.startsWith('-- week ')) { week = Number(line.slice(8)) || week; continue; }
    if (line.startsWith('NOTE men: ')) { const m = /(\d+) managers/.exec(line); if (m) managers.set(week, Number(m[1])); continue; }
    if (line.startsWith('FITNESS week ')) {
      const m = /^FITNESS week (\d+):.*cash \$([\d,]+) vs reserve \$([\d,]+)/.exec(line);
      if (m) {
        const wk = Number(m[1]), cash = Number(m[2].replace(/,/g, '')), r = Number(m[3].replace(/,/g, ''));
        reserve.set(wk + 1, r);
        if (cash - r > peak.free[0]) peak.free = [cash - r, wk + 1];
      }
      continue;
    }
    if (line.startsWith('FAIL orders — no crew')) { if (!noCrew.includes(week)) noCrew.push(week); continue; }
    if (line.startsWith('LOST ')) {
      if (/\(re-arrest — already counted\)/.test(line)) { reArrests++; continue; }
      const m = /^LOST .*? — (.*?) \[([^\]]+)\]/.exec(line);
      if (!m) continue;
      const [, cause, by] = m;
      if (cause.startsWith('sacked')) sacked++;
      else if (by === 'the police') { if (/scene/.test(cause)) policeScene++; else policeStreet++; }
      else if (by === 'the FBI') bump(fbi, /raid/.test(cause) ? 'raid' : /with his lieutenant/.test(cause) ? 'with his lieutenant' : /warrant/.test(cause) ? 'warrant' : cause.split(' (')[0]);
      else if (/gunned down|killed|shot|bomb|died/.test(cause)) bump(rival, by);
      else bump(other, `${cause.split(' (')[0]} [${by}]`);
      continue;
    }
    if (line.startsWith('HEAT ')) {
      const g = (re: RegExp) => { const m = re.exec(line); return m ? Number(m[1]) : null; };
      const f = g(/FBI total (\d+)/), s = g(/top FBI score (\d+)/), wt = g(/top wanted (\d+)/), c = g(/chief (-?\d+) \(mayor/), my = g(/\(mayor (-?\d+)\)/);
      if (f != null && f > peak.fbi[0]) peak.fbi = [f, week];
      if (s != null && s > peak.fbiScore[0]) peak.fbiScore = [s, week];
      if (wt != null && wt > peak.wanted[0]) peak.wanted = [wt, week];
      if (c != null && c < peak.chief[0]) peak.chief = [c, week];
      if (my != null && my < peak.mayor[0]) peak.mayor = [my, week];
      continue;
    }
    if (line.startsWith('CASH FIT R ')) { const m = /on \$(\d+) idle/.exec(line); if (m && Number(m[1]) > peak.idle[0]) peak.idle = [Number(m[1]), week]; continue; }
    if (line.startsWith('ORDER EXEC ')) {
      const m = /: (\d+) put forward, (\d+) given — (\d+) carried out,(?: (\d+) partly done,)? \d+ cancelled, (\d+) not carried out; (\d+) not given; \$(\d+) carried out of \$(\d+) approved/.exec(line);
      if (m) { exec.put += +m[1]; exec.given += +m[2]; exec.done += +m[3]; exec.partly += +(m[4] ?? 0); exec.notDone += +m[5]; exec.notGiven += +m[6]; exec.carried += +m[7]; exec.approved += +m[8]; }
      const r = /top reasons: (.*)$/.exec(line);
      if (r) for (const x of r[1].matchAll(/([^,]+?) ×(\d+)/g)) bump(reasons, x[1].trim(), Number(x[2]));
      continue;
    }
    if (line.startsWith('LEARN (')) { learnLast = line; continue; }
    if (line.startsWith('LEARN coin')) {
      if (/→ do it/.test(line)) coins.doIt++; else if (/→ hold/.test(line)) coins.hold++;
      else if (/→ try it/.test(line)) coins.tryIt++; else if (/→ not this week/.test(line)) coins.notTried++;
      continue;
    }
    if (line.startsWith('BUYS week ')) {
      const m = /(\d+) done, (\d+) failed/.exec(line);
      if (m) { buys.done += +m[1]; buys.failed += +m[2]; }
      const r = /failed \((.*)\)$/.exec(line);
      if (r) for (const x of r[1].matchAll(/([^;]+?) ×(\d+)/g)) bump(buyWhy, x[1].trim(), Number(x[2]));
    }
  }
  const inRange = weeks.filter((x) => x.week >= opts.from && x.week <= opts.to + 1);
  const out: string[] = [`SUMMARY (1.2.59) weeks ${opts.from}–${opts.to}: ${opts.outcome}`];
  // Timeline every SUMMARY_EVERY weeks, plus the last.
  const sample = inRange.filter((x, i) => x.week % SUMMARY_EVERY === 0 || i === inRange.length - 1);
  const near = (m: Map<number, number>, wk: number) => { let best: number | undefined; for (const [k, v] of m) if (k <= wk) best = v; return best; };
  if (sample.length) out.push(`SUMMARY timeline (week: blocks / men / managers / cash / reserve): ${sample.map((x) => { const mg = managers.get(x.week) ?? near(managers, x.week); const r = reserve.get(x.week) ?? near(reserve, x.week); return `w${x.week} ${x.territory} / ${x.men} / ${mg ?? '–'} / ${money(x.cash)} / ${r != null ? money(r) : '–'}`; }).join('; ')}`);
  // Slow stretches.
  const slow: string[] = [];
  for (let i = 1, s = -1; i <= inRange.length; i++) {
    const slowNow = i < inRange.length && inRange[i].territory - inRange[i - 1].territory < SLOW_GAIN;
    if (slowNow && s < 0) s = i - 1;
    if (!slowNow && s >= 0) { if (i - 1 - s >= SLOW_WEEKS) slow.push(`w${inRange[s].week}–${inRange[i - 1].week} ${inRange[s].territory} → ${inRange[i - 1].territory}`); s = -1; }
  }
  out.push(`SUMMARY slow stretches (${SLOW_WEEKS}+ weeks under ${SLOW_GAIN} blocks gained a week): ${slow.length ? slow.join('; ') : 'none'}; no-crew weeks: ${noCrew.length ? noCrew.join(', ') : 'none'}`);
  const rivalN = [...rival.values()].reduce((a, b) => a + b, 0), fbiN = [...fbi.values()].reduce((a, b) => a + b, 0);
  out.push(`SUMMARY losses: rival kills ${rivalN}${rival.size ? ` (${list(rival)})` : ''}; police ${policeStreet + policeScene} (street ${policeStreet}, at the scene ${policeScene}); FBI ${fbiN}${fbi.size ? ` (${list(fbi)})` : ''}${other.size ? `; other ${list(other)}` : ''}`);
  out.push(`SUMMARY not counted as losses: sacked ${sacked}; re-arrests ${reArrests}`);
  const pk = (p: number[], label: string) => (Number.isFinite(p[0]) ? `${label} ${p[0]} (w${p[1]})` : `${label} –`);
  out.push(`SUMMARY peaks: ${pk(peak.fbi, 'FBI total')}; ${pk(peak.fbiScore, 'top FBI score')}; ${pk(peak.wanted, 'top wanted')}; lowest ${pk(peak.chief, 'chief')}; lowest ${pk(peak.mayor, 'mayor')}`);
  out.push(`SUMMARY idle cash: peak cash over the reserve ${Number.isFinite(peak.free[0]) ? `${money(peak.free[0])} (w${peak.free[1]})` : '–'}; peak idle in the cash pass ${money(peak.idle[0])} (w${peak.idle[1]})`);
  out.push(`SUMMARY ORDER EXEC: ${exec.put} put forward, ${exec.given} given — ${exec.done} carried out, ${exec.partly} partly done, ${exec.notDone} not carried out; ${exec.notGiven} not given; ${money(exec.carried)} carried out of ${money(exec.approved)} approved; top reasons: ${reasons.size ? list(reasons, 3) : 'none'}`);
  const factors = [...learnLast.matchAll(/(\w+) value exp \$[\d.e+]+ act \$[\d.e+]+ ×([\d.]+); heat exp \$[\d.e+]+ act \$[\d.e+]+ ×([\d.]+)/g)].map((m) => `${m[1]} ×${m[2]}/heat ×${m[3]}`);
  out.push(`SUMMARY LEARN: ${factors.length ? factors.join(', ') : 'no factors yet'}; coin flips ${coins.doIt + coins.hold} (${coins.doIt} do it, ${coins.hold} hold); trials ${coins.tryIt + coins.notTried} (${coins.tryIt} tried)`);
  out.push(`SUMMARY buys: ${buys.done + buys.failed} judged — ${buys.done} done, ${buys.failed} failed${buyWhy.size ? ` (${list(buyWhy)})` : ''}`);
  return out;
}
