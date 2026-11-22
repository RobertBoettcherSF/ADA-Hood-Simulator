# ADA Hood Simulator

A browser strategy game set in Saint Volstead, 1932: run a gang, take the city block by block, and outlast the rival gangs.

- **Logic in plain Ada.** The whole simulation (city, people, orders, movement, combat, police, economy, rival gangs and the autoplayer) is plain Ada 2022 with contracts, compiled to WebAssembly.
- **TypeScript only for the view.** The Three.js street view, panels, sound and input read the Ada core through an integer-only interface.
- **Reference.** The TypeScript version, [Hood-Simulator](https://github.com/RobertBoettcherSF/Hood-Simulator) (1.2.91 / 1.2.92), is the behaviour reference this port is measured against.

## Status

Design approved: [docs/DESIGN.md](docs/DESIGN.md). Step 1 (the skeleton page) is built: stamp, four languages, Sound off, Debug / F9 report and a crash test that names the Ada file and line. Each step ends with a link to test in the browser.

## Build

Needs AdaWebPack 24 (GNAT-LLVM) in `~/toolchains/adawebpack-24`, or wherever `ADAWEBPACK` points, and `wasm-ld` (`sudo apt install lld`).
`build.sh` never downloads anything. To get the toolchain once (about 58 MB), run `tools/get-toolchain.sh`; it asks first.

```sh
./build.sh          # writes dist/index.html and dist/version.txt
```

Open `dist/index.html` in a browser.

## Test

The native smoke test calls every `hs_` export with contracts on and prints the values the page shows (build id, state hash, crash file:line). Run `./build.sh` first; it writes `obj/gen/hood-version.ads`.

```sh
gprbuild -P tests/smoke.gpr   # GNAT 12.3 or 14 on PATH
obj/native/smoke
```

The build id and state hash it prints must match the "Ada core" line on the page, and the crash test must name the same file and line.
