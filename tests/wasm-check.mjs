// Runs the WebAssembly core in Node and prints the same "city ..." lines as
// the native smoke test (tests/smoke.adb, City_Checks), so the two can be
// compared line by line:
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
    + ` lots ${c.hs_count(3)} buildings ${c.hs_count(4)} types ${c.hs_count(40)} retries ${c.hs_count(9)} hq`;
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
for (const l of lines) console.log(l);
const file = process.argv[2];
if (file) {
  const native = readFileSync(file, 'utf8').split('\n').filter(l => l.startsWith('city '));
  const mine = lines.filter(l => l.startsWith('city '));
  const ok = native.length === mine.length && native.every((l, i) => l === mine[i]) && !lines.some(l => l.includes('DIFFER'));
  console.log(ok ? `wasm matches the native smoke output (${mine.length} cities)` : 'wasm and native smoke output DIFFER');
  process.exit(ok ? 0 : 1);
}
