// Runs the WebAssembly core in Node and prints the same "city ..." lines as
// the native smoke test (tests/smoke.adb, City_Checks), and the same
// "people ..." and walking-draw lines (People_Checks, item 4), so the two
// can be compared line by line; it also times each week in WebAssembly:
//   node tests/wasm-check.mjs [smoke-output.txt]
// With a smoke output file it exits non-zero unless every line matches.
import { readFileSync } from 'node:fs';

const wasm = readFileSync(new URL('../obj/wasm/hood.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(wasm, {
  env: { hs_host_error(code, line) { throw new Error(`core stopped: code ${code} line ${line}`); } },
});
const c = instance.exports;
const cases = [[36, 28, 1932], [40, 32, 1932], [44, 35, 1932], [40, 32, 187]];
const lines = [];
for (const [w, h, seed] of cases) {
  c.hs_new_game(seed, 1932, w, h);
  const rng = ((c.hs_count(42) | (c.hs_count(43) << 16)) >>> 0);
  let line = `city ${w}x${h} seed ${seed}: rng ${rng} city ${c.hs_city_hash() >>> 0}`
    + ` structure ${c.hs_structure_hash() >>> 0} blocks ${c.hs_count(1)} merged ${c.hs_count(2)}`
    + ` lots ${c.hs_count(3)} buildings ${c.hs_count(4)} types ${c.hs_count(99)} retries ${c.hs_count(9)} hq`;
  for (let g = 1; g <= c.hs_count(7); g++) {
    const b = c.hs_get(4, g, 0);
    line += ` ${c.hs_get(1, b, 0)},${c.hs_get(1, b, 1)}`;
  }
  lines.push(line);
  // The draw layers hold the same numbers as hs_get.
  const blocks = new Int32Array(c.memory.buffer, c.hs_draw_ptr(1), c.hs_draw_len(1));
  const lots = new Int32Array(c.memory.buffer, c.hs_draw_ptr(2), c.hs_draw_len(2));
  let same = blocks.length === c.hs_count(1) * 12 && lots.length === c.hs_count(3) * 10;
  for (let i = 0; same && i < c.hs_count(1); i++)
    for (const f of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) same &&= blocks[i * 12 + f] === c.hs_get(1, i, f);
  for (let i = 0; same && i < c.hs_count(3); i++)
    for (const f of [0, 1, 2, 3, 4, 5, 6]) same &&= lots[i * 10 + f] === c.hs_get(2, i, f);
  lines.push(`layers ${w}x${h} seed ${seed}: ${same ? 'agree with hs_get' : 'DIFFER from hs_get'}`);
}
// Item 4: people, hashes and three weeks of walking.
const people = [[40, 32], [44, 35]];
const joined = (lo, hi) => ((lo | (hi << 16)) >>> 0);
const per = (got, ref) => Math.trunc((got - ref) * 1000 / ref);
const dayRefs = {
  '40x32': [70114, 46838, 45305, 46363, 45430, 46512, 45611, 45824, 45809, 46216, 45229, 46068, 45645, 45901, 45854],
  '44x35': [68277, 45502, 42037, 43956, 43078, 42807, 43126, 42885, 43239, 42783, 43419, 42664, 42626, 42902, 42570],
};
for (const [w, h] of people) {
  c.hs_new_game(1932, 1932, w, h);
  const label = `${w}x${h} seed 1932`;
  lines.push(`people ${label}: ${c.hs_count(50)} first ${c.hs_get(5, 0, 0)} next ${c.hs_count(51)} rng ${joined(c.hs_count(58), c.hs_count(59))}`);
  const roles = []; for (let r = 0; r < 18; r++) roles.push(c.hs_count(70 + r));
  lines.push(`${label} people by role: ${roles.join(' ')}`);
  lines.push(`${label} people/position/opinion/name hashes: ${[1, 2, 3, 4].map(k => c.hs_population_hash(k) >>> 0).join(' ')}`);
  const walkers = new Int32Array(c.memory.buffer, c.hs_draw_ptr(3), c.hs_draw_len(3));
  let same = walkers.length === c.hs_count(50) * 5;
  for (let i = 0; same && i < c.hs_count(50); i++)
    same &&= walkers[i * 5] === c.hs_get(5, i, 10) && walkers[i * 5 + 1] === c.hs_get(5, i, 11)
      && walkers[i * 5 + 2] === c.hs_get(5, i, 1) && walkers[i * 5 + 3] === c.hs_get(5, i, 2)
      && walkers[i * 5 + 4] === (c.hs_get(5, i, 9) >= 0 && c.hs_get(5, i, 12) === 0 ? 1 : 0);
  lines.push(`layers people ${label}: ${same ? 'agree with hs_get' : 'DIFFER from hs_get'}`);
  for (let week = 1; week <= 3; week++) {
    const t0 = performance.now();
    c.hs_launch_week();
    for (let day = 1; day <= 5; day++) {
      const before = c.hs_count(57);
      c.hs_tick(480);
      const got = c.hs_count(57) - before, ref = dayRefs[`${w}x${h}`][(week - 1) * 5 + day - 1];
      lines.push(`  ${label} week ${week} day ${day} draws ${got} (1.2.91 ${ref}, ${per(got, ref)} per mille)`);
    }
    console.log(`  ${label} week ${week}: ${Math.round(performance.now() - t0)} ms in WebAssembly (Node)`);
  }
}
for (const l of lines) console.log(l);
const file = process.argv[2];
if (file) {
  const keep = l => !/^(ok|FAIL) /.test(l) && (l.startsWith('city ') || l.startsWith('people ') || / people (by role|\/)/.test(l) || / draws /.test(l));
  // The native line prints "week1"; the same text either way.
  const norm = l => l.replace(/ week ?(\d)/, ' week $1').replace(/ day ?(\d)/, ' day $1');
  const native = readFileSync(file, 'utf8').split('\n').filter(keep).map(norm);
  const mine = lines.filter(keep).map(norm);
  const ok = native.length === mine.length && native.every((l, i) => l === mine[i]) && !lines.some(l => l.includes('DIFFER'));
  console.log(ok ? `wasm matches the native smoke output (${mine.length} lines)` : 'wasm and native smoke output DIFFER');
  process.exit(ok ? 0 : 1);
}
