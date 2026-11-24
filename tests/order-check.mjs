// Runs the item-5 order check (web/src/orderCheck.ts) on the WebAssembly
// core under Node: node tests/order-check.mjs [obj/wasm/hood.wasm]
// Bundles the check with esbuild from web/node_modules, then prints one line
// per check and exits 1 if any exact or ±20 % check fails. Run build.sh first.
import { build } from '../web/node_modules/esbuild/lib/main.js';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'obj', 'check', 'order-check.mjs');
mkdirSync(path.dirname(out), { recursive: true });
await build({ entryPoints: [path.join(root, 'web/src/orderCheck.ts')], bundle: true, format: 'esm', platform: 'node',
  outfile: out, logLevel: 'warning' });
const { runOrderCheck } = await import(pathToFileURL(out).href);

const wasm = readFileSync(process.argv[2] ?? path.join(root, 'obj/wasm/hood.wasm'));
let exports;
const { instance } = await WebAssembly.instantiate(wasm, { env: { hs_host_error(code, line) {
  throw new Error(`Ada core stopped: code ${code} line ${line}`);
} } });
exports = instance.exports;
const r = runOrderCheck(exports);
for (const row of r.rows) {
  const mark = row.mode === 'info' ? 'info' : row.ok ? 'ok  ' : 'FAIL';
  console.log(`${mark} ${row.mode === '20%' ? '±20%' : row.mode.padEnd(4)} ${row.label}: ${row.got}${row.got === row.want ? '' : `  (1.2.91: ${row.want})`}`);
}
console.log(`week ms: ${r.weekMs.join(', ')}`);
console.log(r.failed ? `order check FAILED: ${r.failed} of ${r.rows.length}` : `order check passed (${r.passed} checks)`);
process.exit(r.failed ? 1 : 0);
