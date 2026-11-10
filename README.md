# Original Gangster

Inspired by *Gangsters: Organized Crime* (1998): a Prohibition-era crime
strategy game. Plan your gang's week at
the desk, then watch it play out on the streets of a fully 3D city.

Planned extension: From New Temperance in 1932 to a imaginary city in 2032. Same mechanics, similar goods.

## Play

- **In your browser:** 

Browser saves are kept in that browser; the desktop app saves to disk.

## Requirements

- yet to be determined, as few as possible

## Getting started

Goal: just open browser, play.


## Scripts

| Command | What it does |
| --- | --- |

## Project layout

For now, considers restructure & simplification without reinventing the wheel here.

```
src/
  app/      game state, saves, scenarios and tutorials
  sim/      the simulation: economy, combat, AI gangs, elections, police
  render/   the Three.js city, characters, vehicles and effects
  ui/       React interface: desk, menus, city view
  audio/    music and street sound
public/     art, models and audio
scripts/    build, packaging and asset tools
tests/      Vitest suites
```

## Credits

Inspiration: *Gangsters: Organized Crime* was designed by Martin Capel, developed by Hothouse
Creations and published by Eidos Interactive in 1998.

Original Repo: Built with Three.js, React, Vite, Zustand, Electron and Vitest. Fonts are Barlow,
Barlow Condensed, Special Elite and Cinzel from Google Fonts (SIL Open Font License).

This Repo: Build with Grok Bot. It can list absolutely essentail tools it used here.

## License

[MIT](LICENSE)
