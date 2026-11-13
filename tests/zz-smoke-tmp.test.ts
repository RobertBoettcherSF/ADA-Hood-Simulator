import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { playAutoWeek } from '../src/app/autoTest';
import { defaultStrategy } from '../src/app/strategy';
import { newCampaignOptions } from '../src/app/newGame';
import { applyScenario, scenarioById } from '../src/app/scenarios';
import { captureDevWeek, devJournalWeeks, clearDevJournal } from '../src/app/devJournal';
import { Sim } from '../src/sim/sim';
import { memberLosses } from '../src/sim/memberLosses';
import { gangManpower, territoryCount, gangHoldings } from '../src/sim/world';
import type { GameOptions } from '../src/sim/types';
import { systemTimings, resetSystemTimings } from '../src/sim/simTimings';
import { gameScoreNow } from '../src/sim/scoring';
import { hash32 } from '../src/sim/hash';
function fingerprint(w: any): string {
  let h = 0;
  for (const p of Object.values(w.people) as any[]) h = hash32(h ^ Math.round(p.pos.x * 100) ^ (Math.round(p.pos.y * 100) << 7) ^ (p.id << 3) ^ (p.status === 'active' ? 1 : 2));
  const g = Object.values(w.gangs).map((x: any) => Math.round(x.cash)).join(',');
  return `${(w.rngState ?? 0).toString?.() ?? ''}|${h.toString(16)}|${g}|n${w.nextId}`;
}

const kind = process.env.SMOKE ?? 'quick';

function run(label: string, options: GameOptions, weeks: number): string {
  clearDevJournal();
  const sim = new Sim({ ...options, era: '1932' });
  const w = sim.world, gang = sim.playerGang;
  const out: string[] = [`## ${label}: ${w.gridW}×${w.gridH} seed ${options.seed} money ${options.startMoney} hoods ${options.startHoods}`];
  const crews = () => gang.teamIds.map((id) => w.teams[id]?.memberIds.length ?? 0).join('/');
  out.push(`start: men ${gangManpower(w, gang)} crews ${gang.teamIds.length} (${crews()}) pool ${gang.poolIds.length} cash ${gang.cash}`);
  const verdicts = new Map<number, Set<string>>();
  let deadConvicted = 0;
  for (let i = 0; i < weeks && w.phase === 'planning'; i++) {
    const t0 = Date.now();
    const actions = playAutoWeek(sim, 7 + i, defaultStrategy());
    const tPlan = Date.now() - t0;
    sim.launchWeek();
    resetSystemTimings();
    const tw = Date.now();
    let tSettle = 0;
    if (process.env.FRAMES) {
      // The browser's way: seven frames a minute, so all six ambient slices run ahead of each tick.
      while (w.phase === 'week') { const ts = Date.now(), settling = w.settlementStage != null || w.minute >= 10079; sim.advance(1 / (7 * (10 / 3)), 1); if (settling) tSettle += Date.now() - ts; }
    } else while (w.phase === 'week') { const ts = Date.now(), settling = w.settlementStage != null; sim.finishWeekSlice(80); if (settling) tSettle += Date.now() - ts; }
    const tWeek = Date.now() - tw;
    if (process.env.PERF) {
      (globalThis as any).gc?.();
      const sys = systemTimings().slice(0, 8).map((x) => `${x.name} ${Math.round(x.ms)}`).join(', ');
      out.push(`perf wk ${w.week - 1}: plan ${tPlan}ms week ${tWeek}ms (settlement ${tSettle}ms) heap ${Math.round(process.memoryUsage().heapUsed / 1048576)}MB people ${Object.keys(w.people).length} | ${sys}`);
      out.push(`fp wk ${w.week - 1}: ${fingerprint(w)} score ${gameScoreNow(w)}`);
    }
    captureDevWeek(w);
    for (const c of Object.values(w.cases)) {
      if (c.gangId !== gang.id || !['convicted', 'acquitted'].includes(c.status)) continue;
      const set = verdicts.get(c.defendantId) ?? new Set<string>(); set.add(`${c.status}@${c.id}`); verdicts.set(c.defendantId, set);
      if (c.status === 'convicted' && w.people[c.defendantId]?.status === 'dead') deadConvicted++;
    }
    const losses = memberLosses(w, gang.id, w.week - 1);
    const arrests = losses.filter((l) => /arrest/i.test(l.cause));
    const inc = gang.lastWeekIncome, takings = inc.legal + inc.illegal + inc.protection + inc.other;
    const wages = gang.lastWeekCosts.wages;
    const notes = process.env.ALL ? actions : actions.filter((a) => /reserve|recruit held|police chief|hands in|FBI|order did not run|shut down/i.test(a));
    out.push(`wk ${w.week - 1}: bldgs ${Object.values(w.buildings).filter((b) => b.ownerGangId === gang.id && b.state !== 'destroyed').length} cash ${Math.round(gang.cash)} men ${gangManpower(w, gang)} blocks ${territoryCount(w, gang.id)} crews ${crews()} pool ${gang.poolIds.length} takings ${Math.round(takings)} wages ${Math.round(wages)}${wages > takings ? ' WAGES>TAKINGS' : ''} susp ${Math.round(gang.suspicion)} mgrs ${Object.values(w.buildings).filter((b: any) => b.managerId != null && w.people[b.managerId]?.gangId === gang.id && w.people[b.managerId]?.status === 'active').length} arrests ${arrests.length}${arrests.length ? ` [${arrests.map((a) => a.cause).join('; ')}]` : ''} heap ${Math.round(process.memoryUsage().heapUsed / 1048576)}MB ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    for (const n of notes.slice(0, process.env.ALL ? 400 : 8)) out.push(`   ${n}`);
  }
  const twice = [...verdicts].filter(([, s]) => [...s].some((v) => v.startsWith('convicted')) && [...s].some((v) => v.startsWith('acquitted')));
  out.push(`trials: ${verdicts.size} defendants; acquitted-and-convicted ${twice.length}; dead convicted ${deadConvicted}`);
  for (const g of Object.values(w.gangs)) { const h = gangHoldings(w, g); out.push(`gang ${g.name}${g.isPlayer ? ' (player)' : ''}: cash ${Math.round(g.cash)} assets ${h.assets} men ${gangManpower(w, g)} blocks ${territoryCount(w, g.id)}`); }
  out.push(`journal: ${devJournalWeeks().length} weeks, ${devJournalWeeks().reduce((s, x) => s + x.length, 0)} chars`);
  return out.join('\n');
}

it('smoke', () => {
  mkdirSync('/tmp/smoke', { recursive: true });
  const parts: string[] = [];
  if (kind === 'quick') {
    for (const seed of [1, 2]) parts.push(run(`quick 16x16 seed ${seed}`, { ...newCampaignOptions(), seed, citySize: 16, cityHeight: 16, cityLayout: 'varied', territoryTarget: 40 } as GameOptions, 4));
    parts.push(run('quick 3 hoods 36x28', { ...newCampaignOptions(), seed: 5, citySize: 36, cityHeight: 28, startHoods: 3 } as GameOptions, 0));
    parts.push(run('quick 10 hoods 36x28', { ...newCampaignOptions(), seed: 6, citySize: 36, cityHeight: 28, startHoods: 10 } as GameOptions, 0));
  } else if (kind === 'std') {
    parts.push(run('smoke 40x32 default', { ...newCampaignOptions(), seed: 1934 } as GameOptions, Number(process.env.WEEKS ?? 8)));
    writeFileSync('/tmp/smoke/journal-std.txt', devJournalWeeks().join('\n'));
  } else if (kind === 'terr') {
    parts.push(run('territory 40x32', { ...newCampaignOptions(), seed: Number(process.env.SEED ?? 2407541768), mode: 'territory', territoryTarget: 500, opponents: 'random', economy: 'normal' } as GameOptions, Number(process.env.WEEKS ?? 24)));
    writeFileSync('/tmp/smoke/journal-terr.txt', devJournalWeeks().join('\n'));
  } else if (kind === 'perf') {
    parts.push(run('perf territory 40x32', { ...newCampaignOptions(), seed: Number(process.env.SEED ?? 2407541768), mode: 'territory', territoryTarget: 500, opponents: 'random', economy: 'normal', ...(process.env.W ? { citySize: Number(process.env.W), cityHeight: Number(process.env.H) } : {}) } as GameOptions, Number(process.env.WEEKS ?? 6)));
  } else if (kind === 'small') {
    parts.push(run('small territory 36x28', { ...newCampaignOptions(), seed: Number(process.env.SEED ?? 1942407619), mode: 'territory', territoryTarget: Number(process.env.TT ?? 500), opponents: 'normal', economy: 'normal', citySize: Number(process.env.CW ?? 36), cityHeight: Number(process.env.CH ?? 28), cityLayout: 'varied', startMoney: 10000, startHoods: 10, startBusinesses: 10 } as GameOptions, Number(process.env.WEEKS ?? 12)));
  } else if (kind === 'long') {
    parts.push(run('long 40x32', { ...newCampaignOptions(), seed: Number(process.env.SEED ?? 3311433221) } as GameOptions, Number(process.env.WEEKS ?? 40)));
    writeFileSync('/tmp/smoke/journal-long.txt', devJournalWeeks().map((wk) => wk.split('\n').filter((l) => /^(=|#|Week|\S.*Gang|  cash|  income|  costs|  men|  crew capacity|  sacked)/.test(l)).join('\n')).join('\n'));
  } else if (kind === 'dry') {
    parts.push(run('smoke Dry Season', applyScenario({ ...newCampaignOptions() }, scenarioById('drySeason')!), Number(process.env.WEEKS ?? 6)));
  }
  writeFileSync(`/tmp/smoke/${kind}${process.env.TAG ?? ''}.txt`, parts.join('\n\n'));
}, 3_600_000);
