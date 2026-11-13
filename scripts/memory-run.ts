/**
 * 1.2.28: Auto Test in Node, with no renderer, for the memory diagnosis.
 * Built by run-memory.sh (esbuild) and run with --expose-gc, so each week's
 * figures are taken after a full garbage collection. It plays the same
 * Auto Test as the browser and writes, after every week, Node's heap and the
 * MEMPROBE line to the report file (appended at once, so a crash keeps them).
 *
 *   WEEKS (default 20), SEED (default 3064130186, the city and the bot),
 *   OUT (default memory-report.txt), SAVE=0 to skip the weekly save copy.
 */
import '../src/memProbeInstall';
import { appendFileSync, writeFileSync } from 'node:fs';
import { runAutoTest } from '../src/app/autoTest';
import { captureDevWeek } from '../src/app/devJournal';
import { newCampaignOptions } from '../src/app/newGame';
import { memProbeLine } from '../src/sim/memProbe';
import { Sim } from '../src/sim/sim';
import type { DiarySink } from '../src/app/diary';

const weeks = Math.max(1, Number(process.env.WEEKS ?? 20) || 20);
const seed = Number(process.env.SEED ?? 3064130186) >>> 0;
const out = process.env.OUT ?? 'memory-report.txt';
const mirrorSave = process.env.SAVE !== '0';
const gc = (globalThis as { gc?: () => void }).gc;
const mb = (n: number) => Math.round(n / 1048576);

const write = (line: string) => { appendFileSync(out, line + '\n'); console.log(line); };
writeFileSync(out, '');
write(`Hood Simulator memory run: ${weeks} weeks, Full Game 40×32, seed ${seed}, Node ${process.version}, forced GC ${gc ? 'on' : 'OFF (run with --expose-gc)'}, weekly save copy ${mirrorSave ? 'on' : 'off'}`);

const options = { ...newCampaignOptions(), seed, mode: 'normal' as const, era: '1932' as const };
const sim = new Sim(options);
write(`city ${sim.world.gridW}×${sim.world.gridH}, people ${Object.keys(sim.world.people).length}`);
const diary: DiarySink = { read: async () => null, write: async () => {}, remove: async () => {} };
let played = 0;
const started = Date.now();

const report = await runAutoTest(sim, { weeks, seed, speed: 1, learn: false }, (current) => {
  const t0 = Date.now();
  current.launchWeek();
  while (current.world.phase === 'week') current.finishWeekSlice(80);
  captureDevWeek(current.world);
  // The browser saves the city after every week; the copy is made here too.
  const saveBytes = mirrorSave ? JSON.stringify(current.world).length : 0;
  gc?.();
  played++;
  const m = process.memoryUsage();
  write(`WEEK ${played} (game week ${current.world.week - 1}): ${Date.now() - t0} ms, heapUsed ${mb(m.heapUsed)} MB, heapTotal ${mb(m.heapTotal)} MB, rss ${mb(m.rss)} MB, external ${mb(m.external)} MB, arrayBuffers ${mb(m.arrayBuffers)} MB, save ${mb(saveBytes)} MB, people ${Object.keys(current.world.people).length}, next id ${current.world.nextId}`);
  write(memProbeLine({ week: played }));
}, diary);

gc?.();
const end = process.memoryUsage();
write(`END after ${played} weeks in ${Math.round((Date.now() - started) / 1000)} s: heapUsed ${mb(end.heapUsed)} MB, rss ${mb(end.rss)} MB`);
writeFileSync(out.replace(/\.txt$/, '') + '-autotest.txt', report);
write(`Auto Test report: ${out.replace(/\.txt$/, '')}-autotest.txt`);
