# ADA Hood Simulator

A browser strategy game set in Saint Volstead, 1932: run a gang, take the city block by block, and outlast the rival gangs.

- **Logic in plain Ada.** The whole simulation (city, people, orders, movement, combat, police, economy, rival gangs and the autoplayer) is plain Ada 2022 with contracts, compiled to WebAssembly.
- **TypeScript only for the view.** The Three.js street view, panels, sound and input read the Ada core through an integer-only interface.
- **Reference.** The TypeScript version, [Hood-Simulator](https://github.com/RobertBoettcherSF/Hood-Simulator) (1.2.91 / 1.2.92), is the behaviour reference this port is measured against.

## Status

Design approved: [docs/DESIGN.md](docs/DESIGN.md). Step 1 (the skeleton page) is next. Each step ends with a link to test in the browser.

