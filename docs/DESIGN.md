# ADA Hood Simulator — design

This document describes the game as the code stands, and the shape of the browser game to build on top of it. It does not change any rules. The playable entry today is the repository root (`index.html` → `src/main.tsx`). This page is the design. Later, this page or the root `index.html` becomes the game the player opens.

The setting in the code is New Temperance in 1932, a Prohibition-era city in the vein of *Gangsters: Organized Crime* (1998). A second presentation, an imaginary city in 2032, uses the same rules and similar goods. The 2032 names below are proposals. The city still needs a name from the owner.

Package name in `package.json`: `original-gangster`. The playable build is version 1.2.0.

## Decisions

The owner answered the open questions in §8. These decisions override anything later in this document that still describes the earlier proposal.

1. **2032** is a pair of inert flags (`era` on the city, `ERA_2032_ENABLED` in `src/app/era.ts`). There is no 2032 content. A later merge can turn the flag on. The game that ships is New Temperance in 1932.
2. The default map is the original 40×32 grid. New Game also offers a small test map, 8×8.
3. End Week and autoplay run the existing minute-by-minute sim (`Sim.finishWeekSlice`) and do not mount the 3D city. One rule set. Autoplay may issue every order a person can give, then resolves that turn the same way. The default run is 4 weeks. The box accepts any whole number of weeks from 1 upward.
4. One living world per folder, in the manner of Dwarf Fortress. The folder holds `world.json` (the city, which is also the current save) and `manifest.json`. The save keeps running in that folder.
5. The game runs in a desktop or mobile browser. The Electron shell has been removed.
6. The win and loss checks in `src/sim/sim.ts` stay as they are.
7. **Rented Rooms** has one tenant per floor. The tenant pays the day's rent out of their own earnings. The player does not pay them. If a tenant cannot pay, that apartment stays empty until a new tenant moves in. The copy is not explicit.
8. Four gangs.
9. The same folder and the same orders produce the same Friday on any device. The sim’s saved `rngState` is the stream. A 40×32 layout that would have hung is re-rolled, and that re-roll is written into the debug report (`cityLayout.original.notes`).
10. The world file, debug reports, audio settings, interface scale, display options, and the hall of fame live in the folder (`world.json`, `prefs.json`, `09 Reports/`). The browser only remembers which folder was picked, or holds the same files in private storage when it cannot pick a folder. Reading and writing the city are chunked, and parsing runs off the main thread when a worker is available.
11. At startup the game fetches `version.json` (then `package.json`) from `main` on GitHub and, if that version is newer, offers to open it. The version number is on screen the whole time. A built copy lives in `play/` so the branch can be opened on raw.githack without a compile.

§8 records the same answers. The 2032 column in §4 is a rejected proposal, not content in the game.

## 1. Current state

### How this was surveyed

The survey below is a reading of the source as it stood before version 1.2.0, including the Electron shell that 1.2.0 removed. The Decisions section is the current game. About 225 TypeScript files sat under `src/`, and about 185 test files under `tests/`.

This pass did not boot the Vite app, did not run Vitest, and did not play a week. Where the text says a system is implemented, that means the code path is present and, in many cases, a test file exists for it. It does not mean this survey watched it run. Places that could not be checked are called out at the end of this section.

`README.md` is a stub. Its script table is empty, and its requirements line says they are still to be determined. The scripts that actually exist are in `package.json`.

### Tech stack

| Piece | What the repo uses |
| --- | --- |
| Language | TypeScript 5.6 (`tsconfig.json`) |
| UI | React 18, Zustand 5 |
| Build | Vite 7 (`vite.config.ts`). Dev server port 5180. `OG_BASE` sets the public path; GitHub Pages sets it to `/<repo>/`. |
| 3D | Three.js 0.169, plus `three.quarks` and `@wolffo/three-fire` |
| Desktop shell | Electron 44 and electron-builder. Entry `electron/main.cjs`. |
| Tests | Vitest 4. Playwright is a dev dependency. `fake-indexeddb` is used by save tests. |
| Node | `.node-version` is 24.19.0. `package.json` allows `^20.19.0`, `^22.12.0`, or `>=24`. npm 11.6.2. |
| Publish | `.github/workflows/pages.yml` builds the Vite app and deploys `dist/` to GitHub Pages on pushes to `main`. `.github/workflows/mac-build.yml` is a desktop Mac build. This survey did not check whether either workflow is green or whether Pages is enabled on the fork. |

Art and sound live in `public/` (about 532 files under `public/art/`, plus `public/audio/`). Fonts named in the root `index.html` are Barlow, Barlow Condensed, Special Elite, and Cinzel, loaded from Google Fonts.

### What is on disk

```
src/app/       Zustand store, new game, saves, scenarios, tutorials, speed
src/sim/       Rules: world, week, economy, combat, AI, law, politics
src/sim/systems/   Weekly and per-minute passes
src/sim/data/      Building catalogue, names, original economics tables
src/render/    Three.js city, people, vehicles, fire, interiors
src/ui/        React screens: menu, desk, organizer, city view
src/audio/     Music and street sound
electron/      Window, preload, on-disk save files
public/        Art and audio
scripts/       Save-schema check, desktop dev, packaging, art optimize
tests/         Vitest
```

There is no `docs/` tree in the revision this survey started from. Comments in `src/sim/originalCityGen.ts` point at `docs/audit/2026-09-28/city-grid/` and at `full_recode/scripts/re_export/`. `src/sim/data/originalEconomics.ts` says it was generated by `scripts/audit/build-original-economics.mjs`. None of those paths are in this repository. The generated economics table itself is present.

### App and screens

`src/main.tsx` mounts `src/ui/App.tsx`.

`src/app/store.ts` holds the session in Zustand. Screens are `menu`, `newGame`, `game`, and `gameOver`. The type also lists `halloFame`, and nothing ever sets it. The hall of fame is a sheet on the main menu and on the game-over screen (`src/ui/MainMenu.tsx`, `src/ui/HallOfFame.tsx`, `src/ui/GameOverScreen.tsx`), stored in `localStorage` by `src/app/save.ts`.

`src/ui/GameScreen.tsx` is the session. During `planning` it shows the organizer (`src/ui/organizer/Organizer.tsx`) and, by default, a blueprint of the city (`src/ui/Blueprint.tsx`). The player can switch the planning view to the 3D city. During `week` it shows the 3D city (`src/ui/CityView.tsx`) and the week HUD (`src/ui/WeekHud.tsx`). A title sequence plays once per browser session (`src/ui/TitleSequence.tsx`). The menu can run an attract-mode city that is not saved (`attract` on the store).

The organizer tabs are lieutenants, accountant, lawyer, diplomacy, newspaper, graphs, maps, and options (`src/ui/organizer/`).

New games are configured in `src/ui/NewGameScreen.tsx` and `src/app/newGame.ts`. The new-campaign defaults are the original 40×32 grid. `defaultGameOptions()` is a 14×14 varied city and is the baseline for tests. Six hand-authored scenarios live in `src/app/scenarios.ts` (fixed seeds, compact square cities). Four tutorials live in `src/app/tutorials.ts`.

### Simulation

`src/sim/sim.ts` is the session object (`Sim`). A new game calls `createWorld` (`src/sim/citygen.ts`). A load calls `Sim.fromSave`, which checks the world against `src/sim/saveSchema.ts` and `src/sim/world-schema.json`.

The world is one JSON-ready object, `WorldState` in `src/sim/types.ts`. `schemaVersion` is 2. The comment at the top of `types.ts` says the whole state is meant to clone into a save.

Phases are `planning`, `week`, and `gameOver`.

The clock (`src/sim/constants.ts`): a working week is Monday to Friday, 8:00 start, 480 minutes a day, 2,400 minutes a week. One tick is one simulated minute. At speed 1 the week is about twelve real minutes (`MINUTES_PER_SECOND` is 10/3). Speeds are 1, 2, 4, 8, and 10 (`src/app/speed.ts`). Speed 10 runs the sim flat out inside a small frame budget. `Sim.finishWeek()` walks every remaining minute and then settles Friday. So a "skip the rest of the week" path already exists. The UI still presents the week as something you watch.

`launchWeek()` moves from planning into the week, clears the message list, and starts orders. Each minute (`tickOnce`) roughly:

1. Ambient pedestrians and traffic, in slices so one frame does not walk the whole city.
2. Goods production and deliveries (`src/sim/goodsDelivery.ts`).
3. Orders (`src/sim/execution.ts`).
4. Street orders given during the week: kill, assault, tail, go to (`src/sim/systems/street.ts`).
5. Fires and other building emergencies.
6. FBI movement (`src/sim/systems/fbi.ts`).
7. Specialist jobs (audit, bribes, putting police on the payroll).
8. Combat (`src/sim/systems/combat.ts`).
9. Sightings.

When the clock passes 2,400 minutes, Friday settlement runs in stages so a save can land in the middle of it (`settlementStage` on the world):

| Stage | What it does |
| --- | --- |
| 0 | Fail unfinished orders, settle specialists, burning escapes |
| 1 | Weekly economy |
| 2 | Taxes |
| 3 | Audits |
| 4 | Police, arrests, courts |
| 5 | FBI weekly pass |
| 6 | Opinion |
| 7 | Territory goodwill |
| 8 | Elections |
| 9 | Newspaper |
| 10 | Diplomacy knowledge (what you believe rivals offered, one week late) |
| 11 | Rebuild command |
| 12 | History for the graphs |
| 13 | Succession |
| 14 | Empty. The comment says it is reserved so old saves keep their stage numbers. |
| 15 | Win and loss checks, close the books |
| 16 | Next week number, repairs, recruit pool, police chief, order rollover |
| 17+ | One AI gang plans, then the phase returns to `planning` |

### City generation

`createWorld` (`src/sim/citygen.ts`) branches on size.

**Original grid.** If `citySize` is 40 and `cityHeight` is 32 (`isOriginalCity` in `src/sim/newGameValidation.ts`), `buildOriginalCity` calls `generateOriginalCitySafe` (`src/sim/originalCityGen.ts`). That is a port of the 1998 city generator: district seeds, land value, parks, a river, an elevated railway, avenues, civic buildings. It uses its own random stream, `OriginalRng`, an MSVC `rand()` LCG, seeded from `options.seed`. The file's own comment says a seed does not reproduce the 1998 city exactly, because the original's cell builders also drew from that stream and this port does not include every one of those draws. If a layout would spin forever, `generateOriginalCitySafe` tries the next seed, up to 16 times, and records that in `plan.notes`, which is stored on `cityLayout.original.notes`.

Block content is then turned into lots and buildings. Business kinds come from `src/sim/data/originalEconomics.ts` (the decoded Economics table: name, group, land-value window, size). `src/sim/data/originalKinds.ts` maps each original kind onto one of our building type ids. Its header says placement follows those records, and that price, profit, stock, and recruits still use our catalogue until the economy tables are ported. Buildings keep `originalKind` for a later switch.

**Compact grid.** Any other size is a square from 8 to 20 blocks (`generatedCitySize`). The new-game default for tools is 14. Districts are rings: industrial on one edge, then downtown, civic, commercial, residential (`districtFor` in `citygen.ts`). `cityLayout: 'classic'` fills each block with nine lots. `cityLayout: 'varied'` (the test default, and what the new-game screen forces on start) places authored block kits from `src/sim/blockModules.ts`, then drops landmarks: city hall, courthouse, police headquarters, hospital, four newspapers, docks, railroad, churches, orphanage, labour exchange, unions, a main bank, gyms, pool halls, accountants, lawyers, warehouses.

After the map, both paths fill people: business owners, civilians, police, firefighters, the mayor, the police chief, the FBI head, judges, district attorneys, reporters, clergy, snitches. The original 40×32 map aims at 6,000 civilians and 400 police (`ORIGINAL_CIVILIANS`, `ORIGINAL_POLICE` in `citygen.ts`). The comment says the 1998 constant was 2,000 civilians and that 6,000 was chosen so the pavements look as busy as the original at this game's figure size. This survey did not compare the two on screen.

Four gangs are placed, one to a quadrant (`gangIds` 1–4). The colors are red, green, blue, and orange. The player picks one; the other three are shuffled. Quadrants are shuffled too, so the player's corner is not fixed. The original map places headquarters with `placeOriginalHeadquarters` (`src/sim/originalBootstrap.ts`): the comment there and in `citygen.ts` says the player is the top-left quadrant on that map. Each gang gets a boss, hoods, an office behind a legal front, starting businesses, and some protection rackets. Rival bosses get a personality: passive, normal, or aggressive. On the original map they also get a 7-byte profile (`src/sim/aiStance.ts`).

### Economy, businesses, goods

The catalogue is `BUILDING_TYPES` in `src/sim/data/buildings.ts`. Classes: commercial, industrial, tenement, municipal, charity, illegal, residential, empty.

Three goods (`GoodsKind` in `types.ts`): `liquor`, `stolen`, `counterfeit`. Stills and presses produce them. Warehouses and some shops store them. Speakeasies drink liquor. Shops pass counterfeit as change and fence stolen goods. Exports leave through the docks or the railroad (`src/sim/exportGoods.ts`, order `export`). Raids haul goods back to a warehouse.

Illegal sites sit on the centre lot and name a legal front (`fronts` on the type, `frontId` / `hidesId` on the building). `coverQuality` scores how convincing the front is, from 0.35 to 0.95. The FBI tracks `fbiSuspicion` and `discovered`.

Legal weekly profit is `businessProfit` in `src/sim/systems/economy.ts`: base profit from our catalogue, times the economy setting (`weak` / `normal` / `strong`), a market roll, land value, squalor, and the manager's business skill. A recalled manager takes that week's takings. Municipal buildings pay nothing. Soup kitchens lose money and buy goodwill (`src/sim/charity.ts`).

Protection is a weekly amount on a building (`Protection` in `types.ts`). Collect and adjust are orders. An owner can refuse. Grievance can turn into squealing (`weeklyLaw`).

Gang books are `FinanceReport` on the gang (`src/sim/finances.ts`): legal income, illegal income, protection, other, wages, purchases, upkeep, tax. The accountant can skim. Tax evasion is a weekly choice; the FBI and the courts can see it (`src/sim/systems/taxes.ts`).

`Gang.campaignSpend` is documented in `types.ts` as kept only so old saves load. It is not used for bills or votes.

### People

Roles (`PersonRole`): boss, lieutenant, hood, accountant, lawyer, citizen, owner, police, firefighter, police chief, FBI agent, FBI head, judge, district attorney, mayor, reporter, clergy, snitch.

Eleven skills, each 0.5 to 5 in half steps (`SKILLS` in `types.ts`): intelligence, organization, business, firearms, fists, knives, arson, explosives, intimidation, driving, stealth.

A hood has `pay`, `payDemand`, and `loyalty` (0–100). Loyalty falls when wages are unpaid, raises are refused, or people die at the office. Pay demand scales with skill (`hoodPayDemand` in `citygen.ts`). The original-city wage path has its own numbers in `src/sim/originalWages.ts`.

Status: active, arrested, on trial, jailed, kidnapped, beaten, dead.

Hiring is the recruit order, plus a pool that refills (`src/sim/recruitPool.ts`). Gyms, pool halls, cafes, docks, and the labour exchange are hood sites. Accountancy firms, finance companies, and the main bank produce accountants. Law offices and the courthouse produce lawyers. The player accepts or refuses from the organizer.

Teams hold up to 10 people, and a gang has up to 8 teams (`MAX_TEAM_SIZE`, `MAX_TEAMS`). Weapons and vehicles are stock the gang owns and hands out:

| Id | Name | Cost |
| --- | --- | --- |
| pistol | Pistol | 100 |
| shotgun | Shotgun | 750 |
| rifle | Rifle | 750 |
| tommy | Tommy gun | 2,000 |
| twinPistols | Twin pack pistols | 3,000 |
| explosives | Explosives | 500 |
| coupe | Coupe | 3,000 |
| truck | Truck | 3,000 |
| speedster | Speedster | 5,000 |

Numbers are from `WEAPONS` and `VEHICLES` in `constants.ts`.

### Orders

Orders are issued in planning and resolved during the week by `src/sim/execution.ts`. The same functions are what the AI calls (`src/sim/api.ts`). Definitions, durations, and crime severity are `ORDERS` in `constants.ts`.

| Group | Orders |
| --- | --- |
| Business | Buy premises, set up business, run business, collect protection, adjust protection, export goods, donate to charity |
| Personnel | Guard business, patrol, explore, recruit, go to |
| Minor | Bribe, intimidate, extort, raid, kidnap |
| Violent | Smash up, assault, torch, bomb, kill, ambush |

Specialist jobs, separate from team orders (`SpecialistOrderType`): audit, bribe officials, employ police, go straight, run for office.

During a live week the player can also point at people on the street: kill, assault, tail, go to.

### Combat

`tickCombat` builds a coarse grid of people who can shoot or be shot: gang members, police, and FBI on the street. Hostility follows diplomacy (war and aggression), ambushes, and being shot at. A hood on a priority job does not start a fight.

Firearm hits use `originalFireRoll` (`src/sim/fireRoll.ts`): no hit points, a high wound class kills, anything less staggers. Close combat still uses the remake's hit points. The comment in `combat.ts` says that stays until the 1998 move tables are traced. `src/sim/closeCombat.ts` is the fist-and-knife exchange.

Combat writes crime records (`recordCrime` in `src/sim/events.ts`) with witnesses and an arrest risk. Those records are what Friday's police pass reads.

### Rival AI

`planGang` (`src/sim/ai.ts`) runs at city creation and again at the end of Friday, one gang per settlement step, before control returns to the player. It buys weapons and cars, hires, moves people between teams, sells or repairs buildings, sets diplomacy, and issues the same orders the player can. Personality (`passive`, `normal`, `aggressive`) scales how readily it picks a fight. On the original map, `aiStance.ts` also keeps a hostility byte per rival.

Diplomacy levels (`types.ts`): alliance, peace, ceasefire, aggression, war. What you offer is immediate. What you believe they offered updates a week later (`known` vs `offered`).

This survey did not trace every branch inside `planGang`. The file is about 700 lines and it calls into `api.ts`.

### Police, FBI, courts

`weeklyLaw` (`src/sim/systems/law.ts`): reported crimes of the week are investigated. Minor severity (extortion, bribery, intimidation) is mostly overlooked. The police chief's opinion and officers on the payroll lower the arrest chance. A priority job raises it. Arrested people become cases (`CourtCase`): a judge, a district attorney, witnesses, jurors, weeks until trial, bribes. Sentences set `jailWeeks`. Heat on a block and on a person cools each week. Crimes older than eight weeks drop off the list.

The FBI (`src/sim/systems/fbi.ts`) is a second agency. Agents travel, search, and raid. A case against the boss opens when suspicion crosses a threshold (`FBI_CASE_THRESHOLD` is 200). Some racket types are never investigated: card games, dice, grifters, and the office (`UNINVESTIGATED_RACKETS`). Accountants can carry tax records that survive leaving the gang. There is a payroll crackdown when too many people are on gang payrolls.

Fire, police, and reporters also respond to emergencies during the week (`EmergencyResponse` on a person, `src/sim/systems/buildingEmergency.ts`).

### Elections and corruption

`weeklyPolitics` (`src/sim/systems/politics.ts`) advances a mayor term. A new mayor starts at 4 weeks. The counter trips an election at 22 (`MAYOR_ELECTION_CYCLE`). An election lasts 6 weeks (`ELECTION_WEEKS`). Candidates are the mayor, judges, and gang bosses who are standing. The original-city path does not drop a candidate for lack of a lawyer after they have entered. Entering still requires a lawyer (`officeEntryCheck`). Votes are tallied in `src/sim/originalElection.ts` and `src/sim/originalElectionVotes.ts`. This survey did not re-derive the vote formula.

A boss who stands needs a lawyer, cash for the weekly campaign bill, and enough blocks. The constant `ELECTION_BLOCKS_REQUIRED` is 100. `electionBlocksRequired` in `politics.ts` lowers that on a small map: 28% of the blocks, at least 12, and never more than 100. The campaign bill is the land value of the gang's territory blocks, divided by four (`campaignWeeklyCost`). Bribes are an order and a specialist job. Employing police is a lawyer tour of chosen blocks. Charity and quiet streets add goodwill, which feeds popularity (`src/sim/systems/opinion.ts`). Owning a newspaper keeps some of your purchases out of other papers (`NewsItem.paperOwnerId`).

Going straight (`canGoStraight` in `api.ts`) needs a lawyer, at least $250,000 in assets excluding cash (`GO_STRAIGHT_ASSETS`), no open trials, and no illegal business except the office. It is only offered in a full game (`mode: 'normal'`).

### Win and loss

From `checkEndConditions` in `sim.ts`:

Loss: the boss is dead, the boss is jailed for a life term (`jailWeeks >= 999`), the gang is broke with no people and under $1,000 of wealth at Friday, or a rival is elected mayor.

Win, full game: you are elected mayor, every rival is eliminated, you and the last rival are in a mutual alliance, or you go straight.

Short games (`GameOptions.mode`): `power` (highest power rating after N weeks), `wealth` (first to a cash-plus-assets target), `territory` (first to N blocks). Ties use a seeded rank (`src/sim/targetRace.ts`).

The score (`src/sim/scoring.ts`) is 0–100 from territory, manpower, and cash, plus a win bonus. The comment says the 1998 manual names the factors and not the weights, and that this remake weights them equally.

### Render, audio, desktop

`src/render/scene.ts` is about 3,400 lines and is the city: blocks, roads, buildings, people, cars, trams, fire, territory outlines, overlays (land value, crime, security, hostility, events). Characters, weapons, vehicles, interiors, and rubble are split across the rest of `src/render/`. A large share of `tests/` is render tests. This survey did not open a frame.

`src/audio/audio.ts` plays three music beds (menu, planning, week) from `public/audio/`, with a synthesized jazz band (`src/audio/jazz.ts`) until the files load or if they fail. Street sound is `src/audio/streetSound.ts`. Browsers require a click before audio starts. Volume is stored in `localStorage` under `og.audio`.

`electron/main.cjs` opens one window, serves `dist/` as `app://game/`, and saves under the Electron `userData` folder (`Original Gangster/saves`, or `OG_USER_DATA`). `electron/preload.cjs` exposes list, read, write, remove, and reveal. `electron/saveStore.cjs` writes one file per slot: a metadata line, then the world JSON, via a temp file and rename, with a `.bak` if the previous file parsed. The filename is a hash of the slot id, not the player's name.

### Saves today

Two backends, chosen in `src/app/save.ts`:

- **Browser.** IndexedDB database `original-gangster`, object store `saves`, key `id`. The record is metadata plus `format: 2` plus `worldJson` (a string). Older records that stored a world object are still read.
- **Desktop.** The Electron store above. The browser copy is migrated to disk once (`og.savesOnDisk` in `localStorage`).

The world carries `schemaVersion`. Missing or `1` is treated as a legacy world and patched on load (sequence counters, and a list of repairs in `Sim.restoreValidated`: street spawns, vehicle routes, transport, FBI investigations, election timing). Any other number is rejected with "This save needs a different version of the game."

The campaign id is not inside the world. It lives in a `WeakMap` in `save.ts` and is written on the save envelope. UI scale, texture quality, mouse reversal, road names, roof behavior, audio, and the hall of fame are `localStorage`, not part of the city.

There is no File System Access API, no OPFS, and no "pick a folder" step.

### Switched off, unused, or unfinished

| Item | Where | State |
| --- | --- | --- |
| Tram boarding | `TRAM_RIDING` in `src/sim/tramRiding.ts` is `false`. `sim.ts` says this matches the shipped game: nothing sets the walk order's riding flag. The riding code and the tests are still in the tree. | Off |
| `campaignSpend` | `Gang` in `types.ts` | Stored, unused |
| Settlement stage 14 | `sim.ts` | Empty on purpose |
| Screen `halloFame` | `store.ts` | Never selected |
| Original economy numbers | `originalKinds.ts` | Kinds place buildings. Prices, profits, stock, and recruits still use `buildings.ts`. |
| Close-combat move tables | comment in `systems/combat.ts` | Firearms use the ported roll. Fists use remake hit points. |
| Original city vs 1998 city | comment in `originalCityGen.ts` | Same seed is stable in this port. It is not a byte-match of the 1998 map. |
| README scripts and requirements | `README.md` | Not filled in |
| Audit notes and the economics generator script | paths cited above | Not in this repo |

Comments in `src/render/closedFront.ts`, `src/render/elevatedTrains.ts`, and `src/ui/MoneyRoll.tsx` point at "TODO §4". The drawing code is there. The document they point at is not in this repo, so this survey cannot say which of those items someone still considers open.

### What this survey could not verify

- Whether `npm test` or `npm run build` passes on this revision.
- Whether a new 40×32 city finishes in a reasonable time in the browser, or how large the resulting save is. The save writer allows up to 256 MB on disk (`MAX_BYTES` in `saveStore.cjs`). A full world is one JSON object of every person, building, and order.
- Whether GitHub Pages for this fork is actually serving the game.
- Frame rate, art completeness, or audio files that fail to decode.
- The File System Access API against a real browser. It is not used here yet. Support still depends on the browser: Chromium has `showDirectoryPicker`; other browsers need the fallback below.
- That every order in `ORDERS` resolves the way a player would expect. The execution file is about 2,000 lines. Tests exist (`tests/order-outcomes.test.ts` and others). They were not run.

## 2. Core loop

The player is a boss at a desk in the morning.

They look at the city as a plan: blocks, businesses, their people, their cash. They give orders for the week. Orders go to gang members (a team does a job), to businesses (buy, open, run, collect), and to rackets (extort, adjust the take, export the goods). They hire, pay, buy a gun or a car, and set a stance toward each rival. Then they end the week.

The week resolves on its own. The player does not have to watch anyone walk. When it is done, the desk is back: money changed, orders succeeded or failed, people are hurt or in jail or dead, the paper has a few lines, rivals have moved. The player reads that and plans the next week.

That is the first playable loop.

Watching the same week in the 3D city is a later tier. The minute loop, the city renderer, the speed buttons, and the street orders already exist. Alpha does not depend on them. Alpha calls the resolution that is already there (`Sim.finishWeek`, which runs the remaining minutes and the Friday stages) and then shows the report the sim already writes: `weekLog`, `messages`, `news`, and the gang's `FinanceReport`.

Nothing in that loop is a second ruleset. The desk writes orders into `WorldState`. The existing sim consumes them. The report reads the world the sim left behind.

A session looks like this:

1. Open the page. No install, no account.
2. The game asks for a folder on disk, if the browser allows it. Otherwise it keeps the city inside the browser and offers a file the player can download. See §5.
3. New city, or continue the city already in the folder.
4. Planning. Give orders. End the week.
5. The sim runs to Friday. The desk shows the result.
6. The world is written back to the folder before the next week starts, and when the player leaves.

Losing and winning stay the checks in `checkEndConditions`. Which of them Alpha must surface is an open question (§8).

## 3. Systems

Each system below is the rule the game should keep. The file names are where that rule lives now. Alpha uses a thin slice of each. Later tiers turn on the rest. The slice is named in §7.

### Economy and businesses

A block has lots. Most lots are legal businesses, housing, or civic buildings. The centre lot is where a gang hides an illegal business behind a front it controls.

Legal businesses earn the weekly profit from the catalogue, modified by the economy, the block, and the manager. They also store goods when their type says they can, which is how a shop launders counterfeit or fences stolen property.

Illegal businesses earn more, produce goods, or both, and they attract the FBI in proportion to how bad the front is. The three goods stay three goods. Production, storage caps, delivery vans, raids, and export through the port and the freight terminal stay as they are in `goodsDelivery.ts`, `goodsStorage.ts`, and `exportGoods.ts`.

Rackets are protection records on someone else's building. One collection a week. The owner can refuse. Intimidation can change their mind. A long grievance can send them to the police. Extortion is the order that puts a building on the racket. Buying the premises clears the racket (`execution.ts`).

Alpha's businesses: buy a legal premises, put a manager in it, collect protection, set up one illegal business behind a front, and see the money on Friday. The full catalogue can exist in the world from the start, because `createWorld` already places it. The player does not have to be offered every illegal type on day one.

### Gang members

The player starts with a boss, a handful of hoods (`startHoods`), and a few businesses (`startBusinesses`). Hoods have the eleven skills, a wage, a demand, and loyalty. They sit in teams. A team carries one order.

Hiring pulls from the recruit pool at the sites the catalogue marks. The player pays the demand or refuses. Unpaid people lose loyalty and can leave. The original-city desertion rule is in `originalWages.ts` (`ORIGINAL_DESERTION_LOYALTY`).

An accountant and a lawyer are single specialists, not team members. The accountant audits and covers tax. The lawyer bribes, puts police on the payroll, files for office, and files the paperwork to go straight.

Alpha's people: see the crew, give a team an order, recruit one hood, and pay wages on Friday so loyalty moves. Accountants, lawyers, and the full skill list can stay in the data. The desk can hide the specialist jobs until a later tier if the owner wants a smaller first screen. The question is in §8.

### Combat

Combat is what happens when two hostile people are on the street in the same minute. It is not a separate battle screen. Orders that imply violence (assault, kill, ambush, torch, bomb, smash) create those meetings while the week resolves, even when nobody is watching.

The result is a crime record: who did it, who saw it, how likely an arrest is. Death, injury, and arrest are then ordinary facts on the person for the next planning morning.

Alpha does not need the player to aim. It needs one violent order to change the world when the week resolves, and the report to say so. Firearm numbers stay the table in `constants.ts`.

### Rival gangs

There are four gangs, counting the player. The other three plan on Friday through `planGang`, using the same order API. They have cash, territory, diplomacy, and a personality.

The player sets a stance toward each of them. Alliances, wars, and ceasefires change who shoots and who will sit out a fight. The player learns the rival's stance a week late.

Alpha keeps all four. They must do something visible by week two: take a business, collect a racket, or hit one of the player's people. If that does not happen with the current AI on a small city, that is a defect to fix in `planGang`, not a reason to write a second AI.

### Police

Police are people in the world, plus a weekly investigation. Crime during the week becomes an arrest roll on Friday, reduced by a friendly chief and by officers on the payroll, increased by a messy or priority job. Arrest leads to a case, a wait, and a verdict. Bribing the judge, the district attorney, the witnesses, or the jurors is the lawyer's work.

Alpha can ship with the arrest roll and a one-line result ("Vito was arrested") before the full court screen. The data model for the case should still be `CourtCase`, so the later screen does not need a new save shape.

### Elections and corruption

The mayor has a term. When it ends, or when the mayor dies, there is an election. A boss can stand. Money, territory, goodwill, and bribes move votes. A rival who wins the election ends the player's game. The player who wins has won the full game.

Corruption is the same money as everywhere else: bribes, employed police, a bought newspaper, tax hidden by the accountant, charity as a bid for goodwill.

This is later than Alpha unless the owner wants the election in the first build. The weekly call can keep running so that a long Alpha game does not freeze the mayor's counter. The desk does not have to explain it until the tier that adds "run for office."

### Saves

The city is the save. See §5 and §6 for the folder and the file format. The player should be able to close the tab in the middle of planning and come back to the same week, the same orders, and the same people.

A mid-week save already exists for the live clock (`minute`, `settlementStage`, `ambientSlicesDone`). Alpha, which does not show the clock, still writes the world before resolution and after it. A crash during resolution may lose the in-progress week and keep the Monday snapshot. That is acceptable for Alpha if it is stated on the desk. It is not acceptable to regenerate the city.

## 4. Setting

New Temperance, 1932, is the world the data describes. The 2032 column is the same mechanic with a different label. Type ids (`liquor`, `speakeasy`, `policeHQ`, and the rest) stay. A city records which column it uses, once, at creation. Saves do not retitle themselves later.

The 2032 city has no name yet. Until the owner picks one, the UI can say "the 2032 city."

Goods are the same three stock types.

| 1932, New Temperance | 2032 equivalent |
| --- | --- |
| Liquor. Made in a still, sold in a speakeasy, stored in warehouses, drunk down by the bar. | Unlicensed spirits. Same crates, stills, bars, and export trail. The ban is a licensing wall, not a new substance. |
| Stolen goods. Fenced through pawn shops, furriers, jewelers, tailors, and the depot. | Stolen cargo: electronics, appliances, and freight. Same fences, same warehouse cap. |
| Counterfeit. Printed in a back room, passed as change in ordinary shops. | Forged cash. Printed in a back room, passed as change. Chip-and-card fraud is out of scope; it would be a new good. |

Legal businesses. The id in parentheses is the one in `buildings.ts`.

| 1932, New Temperance | 2032 equivalent |
| --- | --- |
| Bakers (`bakers`) | Bakery |
| Butchers (`butchers`) | Butcher |
| Grocers (`grocers`) | Grocer |
| Convenience store (`convenienceStore`) | Corner market |
| Shoe store (`shoeStore`) | Shoe shop |
| Tailors (`tailors`) | Tailor |
| Book store (`bookStore`) | Bookshop |
| Printers (`printers`) | Print shop |
| Pawnbrokers (`pawnbroker`) | Pawn shop |
| Jewellers (`jewellers`) | Jeweller |
| Furrier (`furrier`) | Luxury clothing |
| Drug store (`drugStore`) | Pharmacy |
| Plumbers (`plumbers`) | Plumber |
| Cafe (`cafe`) | Cafe |
| Milk bar (`milkBar`) | Soda fountain |
| Breakfast bar (`breakfastBar`) | Breakfast counter |
| Restaurant (`restaurant`) | Restaurant |
| Pool hall (`poolHall`) | Pool hall |
| Gymnasium (`gym`) | Gym |
| Health center (`healthCenter`) | Clinic |
| Massage parlor (`massageParlor`) | Massage studio |
| Dance studio (`danceStudio`) | Dance studio |
| Barbers (`barbers`) | Barbershop |
| Laundry (`laundry`) | Laundry |
| Hardware store (`hardwareStore`) | Hardware store |
| Auto shop (`autoShop`) | Garage |
| Finance company (`financeCompany`) | Small lender |
| Accountancy firm (`accountancy`) | Accountants |
| Law offices (`lawFirm`) | Law office |
| Hotel (`hotelSmall`) | Hotel |
| Hotel, large (`hotelLarge`) | Large hotel |
| Department store (`departmentStore`) | Department store |
| Bank (`bankSmall`) | Bank branch |
| Main bank (`bankLarge`) | Main bank |
| Newspaper offices (`newspaper`) | Newsroom |
| Radio station (`radioStation`) | City broadcaster |
| Warehouse (`warehouse`) | Warehouse |
| Foundry (`foundry`) | Fabrication shop |
| Mill (`mill`) | Mill |
| Cannery (`cannery`) | Food plant |
| Garage depot (`garageDepot`) | Freight garage |
| Trade union (`tradeUnion`) | Union hall |
| Docks (`docks`) | Port |
| Railroad terminal (`railroad`) | Freight terminal |
| Tenement block (`tenementPoor`) | Walk-up block |
| Apartment block (`tenementMid`) | Apartment block |
| Residences, tenement (`tenementRich`) | Better apartments |
| Row houses (`residence`) | Row houses |
| Soup kitchen (`soupKitchen`) | Meal kitchen |

Illegal businesses. Fronts stay the fronts already listed on each type.

| 1932, New Temperance | 2032 equivalent |
| --- | --- |
| Office (`office`). The gang's desk. Any front will do, poorly. | Office. Same. |
| Speakeasy (`speakeasy`). Sells liquor from behind a bar or a hotel. | Closed club. Sells unlicensed spirits from behind a bar or a hotel. |
| Moonshine still (`moonshineStill`). Produces liquor. | Still. Produces unlicensed spirits. |
| Casino (`casino`) | Unlicensed casino |
| Card games (`cardGames`) | Card room |
| Dice game (`diceGame`) | Dice game |
| Gambling den (`gamblingDen`) | Gambling den |
| Prizefight ring (`prizeFight`) | Unlicensed fights |
| Grifters (`grifters`). Work out of a pawn shop or a jeweller. | Fraud crew. Same fronts. |
| Insider trading (`insiderTrading`) | Insider trading |
| Loan shark (`loanShark`) | Loan shark |
| Counterfeit press (`counterfeitPress`) | Forgery press. Produces forged cash. |
| Numbers racket (`numbersRacket`) | Numbers racket |
| Rented rooms (`rentedRooms`). One tenant per floor pays the day's rent from their own earnings. An empty apartment waits for a new tenant. Fronts are a massage parlor, a dance studio, a hotel, or a clinic. | Not in this version. |
| Teamsters (`teamsters`). A freight racket behind a union, a depot, or a mill. | Freight racket. Same fronts. |

Institutions and roles. These are buildings with `special`, or people with a `PersonRole`. They are not bought on the open market except where the catalogue already sets a price (newspapers, radio, unions, docks, the railroad).

| 1932, New Temperance | 2032 equivalent |
| --- | --- |
| City hall, the mayor | City hall, the mayor |
| Courthouse, judges, district attorney | Courthouse, judges, district attorney |
| Police headquarters, police, the chief | Police headquarters, police, the chief |
| F.B.I. headquarters, agents, the director | Federal investigators and their office. The letters on the door can change with the city's name. The suspicion numbers stay. |
| Fire house, firefighters | Fire station, firefighters |
| Hospital | Hospital |
| School | School |
| Library | Library |
| Labour exchange | Employment office |
| US Post | City post |
| Museum | Museum |
| Public baths | Civic baths |
| Power plant | Power plant |
| Water plant | Water plant |
| Church, clergy | Church, clergy |
| Orphanage | Children's home |
| Newspaper, reporter | Newsroom, reporter |
| Radio station | City broadcaster |
| Trade union | Union hall |
| Bank | Bank |
| Snitch | Informant |
| Boss, lieutenant, hood | Boss, lieutenant, crew |
| Accountant | Accountant |
| Lawyer | Lawyer |
| Civilian, business owner | Civilian, business owner |

Mechanics. The 2032 column is the same rule.

| 1932, New Temperance | 2032 equivalent |
| --- | --- |
| Week planned at the desk, resolved Monday to Friday | Same clock |
| Protection racket | Weekly payment to leave the place alone |
| Extortion, intimidation, refusal, squealing | Same |
| Legal front hiding an illegal business | Same |
| Three goods, production, vans, raids, export by port or rail | Same, with the good names above |
| Hiring, eleven skills, wage demands, loyalty | Same skills and numbers. Labels stay plain words (driving, firearms, stealth). |
| Teams, one order each, weapons and cars from the table | Same. The art can show a current-year car; capacity and cost stay. |
| Street fights from orders, even if the player looks away | Same |
| Arrests, trials, bribes, officers on the payroll | Same |
| FBI searches and raids | Federal searches and raids |
| Tax evasion and the accountant's books | Same |
| Mayor, term, election, campaign, goodwill | Same |
| Diplomacy: alliance through war, learned a week late | Same |
| Go straight: lawyer, assets, no open cases, no illegal shops | Same thresholds |
| Territory as blocks the gang holds | Same |
| Newspaper as the morning report | A morning edition. Paper or a site, the `NewsItem` is the same. |
| Charity and the soup kitchen | The meal kitchen. Same goodwill. |

Districts stay districts: downtown, civic, commercial, industrial, residential. The original map also has parks, plazas, avenues, water, and the elevated line. Those are geometry, not a second economy. In 2032 they are the same shapes with different trim.

## 5. Tech

The player opens a browser and plays. They do not install Node, Electron, or an account. Building the game still needs Node, as `package.json` says. That requirement is for the developer, not the player.

GitHub Pages already publishes the Vite build of the game (`.github/workflows/pages.yml`). This design document is not part of that build. It is a static file so it can be read without a compile.

### Folder at the start of a session

On launch, if `window.showDirectoryPicker` exists, the game asks for a folder. The player can create one. The game stores the directory handle in IndexedDB so the next visit can ask for permission again without making them hunt for the folder. Permission is per visit in current Chromium; the handle survives, the grant may not.

Inside the folder:

```
manifest.json     folder format, seed, timestamps, schema version
world.json        the WorldState, the living city
saves/            optional named copies, same envelope the game already writes
prefs.json        audio, scale, and the hall of fame, if those move out of the browser
```

`world.json` is the city. If it is present, the game loads it and does not call `createWorld`. A new game writes a new world only after the player confirms, and only into an empty folder or a folder whose manifest they agree to replace. Replacing a folder archives the previous `world.json` to `saves/` first.

`manifest.json`:

```json
{
  "format": 1,
  "game": "ada-hood-simulator",
  "schemaVersion": 2,
  "seed": 1928,
  "created": "2032-01-01T00:00:00.000Z",
  "updated": "2032-01-01T00:00:00.000Z"
}
```

`format` is the folder layout. `schemaVersion` is a copy of the world's `schemaVersion`, so a person can see it without parsing the city. The world file is the authority if they disagree.

Named snapshots in `saves/` can keep today's envelope: one metadata object and the world JSON. Desktop already does this as a header line plus a body (`electron/saveStore.cjs`). The browser IndexedDB record is the same idea (`format: 2` in `src/app/save.ts`). The folder writer should call the same `validateSaveWorld` before it replaces `world.json`.

### When the folder API is missing

Use the Origin Private File System (`navigator.storage.getDirectory()`) with the same three files. The city then survives in that browser on that machine, and the player cannot see it in their file manager.

Also offer, always:

- **Export.** Download `world.json` (and the manifest) so the player can put the city in a folder themselves.
- **Import.** A file input that loads a `world.json` this game wrote, runs it through `saveSchema.ts`, and adopts it.

If OPFS is missing too, keep today's IndexedDB database (`original-gangster` / `saves`) as the last resort, plus the same export and import. That is the path the browser build already has, so Alpha does not depend on a brand-new store to be playable.

The Electron shell can stay. It is not required to play. If it stays, it should write the same folder layout into the directory the player picked, instead of a private `userData` path. Until that change, Electron keeps working as it does now.

### What not to rewrite

Keep these, and call them:

| Keep | Why |
| --- | --- |
| `src/sim/` | The rules, the week, the save shape |
| `src/sim/saveSchema.ts` and `world-schema.json` | The check that runs before a world is trusted |
| `src/app/save.ts` | Slot envelope, lazy read, migration of old records. Add a backend beside IndexedDB; do not replace the checks. |
| `src/app/store.ts`, `src/ui/organizer/`, `src/ui/Blueprint.tsx` | The desk |
| `src/render/`, `src/ui/CityView.tsx` | The later tier. Leave them in the build. Alpha does not mount the city in order to finish a week. |
| `src/audio/` | Planning music is enough for Alpha |
| `public/` | Art the desk already uses |
| `electron/` | Optional shell |
| `tests/` | Run the save, week, finance, and order suites against any storage change |

Add one module, `src/app/folderStore.ts` (name can change), that implements pick, read, write, export, and import. `save.ts` chooses it when a handle or an OPFS root exists, and falls back to IndexedDB.

Do not add a second simulation, a second save schema, or a new city format. Do not split `WorldState` into a database of tables for Alpha. One JSON document is what the sim already clones.

Suggested layout once that module exists. This is a target, not a move to do before the folder store is real:

```
index.html            the game, when the player-facing entry moves here
docs/index.html       this document until then
docs/DESIGN.md
src/app/              store, new game, scenarios, tutorials, saves, folder store
src/sim/              unchanged role
src/ui/               desk first
src/render/           city, used when the player chooses to watch
src/audio/
electron/             optional
public/
tests/
```

## 6. World

A city is generated from a seed once. After that, the saved world is the city. Every purchase, death, fire, and election is in that file. The next session loads the file. It does not roll the map again.

### Pipeline

1. The player enters a name and a seed. The new-game screen today draws the seed with `Math.random` once (`src/app/newGame.ts`) and then stores it on `GameOptions.seed`. The player should be able to type a seed.
2. `createWorld(options)` (`src/sim/citygen.ts`) builds a `WorldState` and a `Rng`.
3. Size decides the map.
   - 40×32: `generateOriginalCitySafe({ seed })` produces content ids, land values, parks, river, rail, avenues, and civic sites. `buildOriginalCity` turns those into blocks, lots, and buildings. Business rows come from `originalEconomics.ts` through `ourTypeForOriginalKind`. Squalor and the people use the sim RNG, which was also seeded from `options.seed`.
   - Any other size: district rings, then either nine lots per block or a varied block module, then landmark placement, then buildings from `BUILDING_TYPES` weights.
4. People: owners, civilians, police and other officials, snitches.
5. Four gangs, headquarters, starting businesses, starting rackets, crews.
6. `Sim` stores `rng.state` on `world.rngState`, lets the rival gangs plan, and returns to `planning` at week 1, minute 0.
7. The game writes `manifest.json` and `world.json`. Generation is finished.

Loading reads `world.json`, validates it, and constructs `Sim.fromSave`. `createWorld` is not called.

### Determinism

The sim's random stream is `Rng` in `src/sim/rng.ts` (mulberry32, one uint32). The file's comment says `src/sim` does not call `Math.random`. A search of `src/sim` found that phrase and no call. The stream is saved as `world.rngState` and restored on load, so a saved city continues the same sequence.

The 40×32 map uses a second stream, `OriginalRng`, seeded from the same `options.seed`. Given the same code, the same seed produces the same plan, including the "try the next seed" retries inside `generateOriginalCitySafe`. Those retries are recorded on the city. They do not make the save non-deterministic. They do mean "seed 1000" might have been built from 1001 if 1000 would have hung. The manifest should store the seed the player asked for (`options.seed`), which is already on the world.

Visual variation (coats, trim, which car sits on a street) uses `hash32` in `src/sim/hash.ts`, derived from ids, and does not consume the sim stream.

Audio noise (`src/audio/audio.ts`) uses `Math.random` and does not affect the city.

Consequences:

- Two browsers that load the same `world.json` and then apply the same orders will reach the same Friday, if they run the same game version. This was not executed in this survey.
- Editing the generator changes new cities only. Old `world.json` files stay as they were.
- Do not re-roll a city to apply a patch. Migrate the JSON, or refuse it.

### Persistence format and versioning

The world is JSON, `schemaVersion: 2`, checked by `src/sim/saveSchema.ts`. The checker rejects a world whose `schemaVersion` is anything other than missing, 1, or 2. Missing and 1 are legacy and get the repairs in `Sim.restoreValidated`.

Rules for the folder:

- Write `schemaVersion` on the world, as today.
- Refuse to load a higher number. Tell the player they need a newer build of the game. The sentence is already in `saveSchema.ts`.
- Bump `schemaVersion` only when the shape changes in a way old code must not guess at. Add the migration in `saveSchema.ts` in the same change, and keep the old number loadable.
- `manifest.format` starts at 1. Bump it if the filenames change. A game that does not know the format number refuses the folder and offers import of `world.json` alone, which it does know how to check.
- Write to a temporary file in the folder, then rename over `world.json`, and keep the previous file as `world.json.bak` when the previous file parsed. That is the rule `electron/saveStore.cjs` already uses.
- Record `world.rngState` on every save. Without it, the next week diverges.
- The campaign id stays on the envelope (`manifest.json` or the snapshot header), not inside the world, matching `save.ts`.

A save in the middle of Friday keeps `settlementStage`, as it does now, so a future "watch the week" tier can resume a city an Alpha player saved.

## 7. Scope tiers

Each tier is playable on its own. Later tiers add to the same world file. They do not start a new game.

### Alpha — the desk week

A player can finish this with a browser and nothing else.

- Open the page. Pick a folder, or land in OPFS / IndexedDB and export a file.
- Start a city from a seed, or load `world.json`.
- See cash, the crew, and the businesses they own.
- Give orders the sim already implements: buy premises, run a business, collect protection, extort, recruit, and one violent order (assault or smash).
- End the week. `Sim.finishWeek` runs. The desk lists the week's lines, the cash change, and arrests or deaths.
- Rivals plan. Their moves show up in the report or on the plan.
- Close the tab. Open it again. The same week, or the next Monday, is there.
- The boss can die or go broke, and the game says so, using `checkEndConditions`.

Alpha does not require the 3D view, street orders, the election screen, tutorials, or scenarios. The systems can still tick in the background so the world stays consistent. The compact city (the 14-block varied map, or whichever size the owner picks) is the Alpha map. The 40×32 map stays available if it already loads, and it is not the bar for "Alpha works."

### Tier 2 — watch the week

The player can let the week play in the city that `src/render/scene.ts` already draws, at the speeds in `src/app/speed.ts`, and can pause. Street orders (kill, assault, tail, go to) work because `tickStreetOrders` already runs. This tier is wiring and hardening of code that is in the tree, plus a way to switch between "resolve it" and "watch it" for the same orders. It is not a new sim.

### Tier 3 — the long game

The rest of the desk that the code already models, surfaced and checked:

- Accountant, lawyer, tax, audits.
- Police on the payroll, trials, bribes.
- FBI heat and raids.
- Diplomacy.
- Elections and going straight.
- The full order list, weapons, and vehicles.
- Scenarios and the four tutorials.
- The morning paper as a full sheet (`src/ui/organizer/NewspaperTab.tsx`).

Win and loss for the full game and the three short games are the ones in §1.

### Tier 4 — 2032

A switch at city creation chooses the column in §4. Ids, prices, and rules stay. Names, the newspaper's voice, and art change. The choice is stored on the world (a field such as `options.era`) so a save opens in the era it was built in. Adding the field is a schema bump with a default of `1932` for every existing save.

The 3D city's trim for 2032 is part of this tier, and only if Tier 2 has shipped. Alpha can show 2032 with text and the desk art alone, if the owner wants the switch earlier. That is an open question.

### Not a tier

Electron, GitHub Pages, and the test suite stay as developer tools. The player never needs them. A packaging change that points Electron at the same folder format can happen whenever the folder store exists. It does not gate Alpha.

## 8. Open questions

Answered by the owner. The record is the Decisions section at the top.

1. 2032 waits. Flags only, no content, no city name yet.
2. Default map: original 40×32. A small test size is also offered.
3. End Week reuses the minute-by-minute sim, without the 3D view.
4. One living world per folder.
5. Browser on desktop and mobile. The Electron shell is gone.
6. Keep the existing win and loss conditions.
7. 2032 is not a label-and-art switch in this version. It is an inert flag.
8. Rented rooms: one tenant per floor pays daily rent from their own earnings. An apartment they cannot pay for stays empty until a new tenant moves in.
9. Four gangs.
10. Yes. Same folder, same orders, same Friday.
11. Audio settings, interface scale, the hall of fame, and the world file go in the folder.
12. Seed fallback is acceptable, and it is logged in the debug report.
13. Startup checks GitHub for a newer version and offers to load it. The version number stays on screen.
