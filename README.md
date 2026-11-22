# ADA Hood Simulator

A browser strategy game set in Saint Volstead, 1932: run a gang, take the city block by block, and outlast the rival gangs.

- **Logic in plain Ada.** The whole simulation (city, people, orders, movement, combat, police, economy, rival gangs and the autoplayer) is plain Ada 2022 with contracts, compiled to WebAssembly.
- **TypeScript only for the view.** The Three.js street view, panels, sound and input read the Ada core through an integer-only interface.
- **Reference.** The TypeScript version, [Hood-Simulator](https://github.com/RobertBoettcherSF/Hood-Simulator) (1.2.91 / 1.2.92), is the behaviour reference this port is measured against.

## Status

Design approved: [docs/DESIGN.md](docs/DESIGN.md). Built so far (see [docs/HOW_WE_GOT_HERE.md](docs/HOW_WE_GOT_HERE.md)): step 1, the skeleton page (stamp, four languages, Sound off, Debug / F9 report, crash test with the Ada file and line); step 2, random numbers identical to 1.2.91, whole-number positions, table trigonometry, the 220 × 175 grid and the world hash. Step 3, city generation identical to 1.2.91 (Small, Standard and Large), shown in a placeholder street view and a city plan, with a building card. Each step ends with a link to test in the browser.

## Build

Needs Node.js 18 or later for the page (TypeScript, Vite), and AdaWebPack 24 (GNAT-LLVM) in `~/toolchains/adawebpack-24`, or wherever `ADAWEBPACK` points, and `wasm-ld` (`sudo apt install lld`).
`build.sh` never downloads anything. To get the toolchain once (about 58 MB), run `tools/get-toolchain.sh`; it asks first.

```sh
(cd web && npm ci)  # once: the pinned page tools and libraries
./build.sh          # writes dist/ (index.html, app.js, app.css, vendor/, version.txt)
```

Serve `dist/` over HTTP and open `index.html` (the page loads `app.js` as a module, which browsers do not allow from `file://`).

`tools/gen-tables.py` regenerates `src/hood-tables.ads` and `web/src/tables.ts` from `data/tables.json` (both committed; only needed if the tables change).

## Test

The native smoke test calls every `hs_` export with contracts on and prints the values the page shows (build id, state hash, crash file:line). Run `./build.sh` first; it writes `obj/gen/hood-version.ads`.

```sh
gprbuild -P tests/smoke.gpr   # GNAT 12.3 or 14 on PATH
obj/native/smoke
```

The build id, random numbers, number checks, grid size, world hash and the `city …` lines it prints must match the page, and the crash test must name the same file and line. `tools/gen-trig.py` regenerates `src/hood-trig_table.ads` (committed; only needed if the table changes).

The browser build is checked in Node against the same lines:

```sh
obj/native/smoke > /tmp/smoke.txt
node tests/wasm-check.mjs /tmp/smoke.txt   # exits non-zero unless every city line matches
```
