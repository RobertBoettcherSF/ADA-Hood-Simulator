# ADA Hood Simulator — design (draft 0.1)

Status: draft for Robert's review. Nothing here is built. Every new constant or cap is marked **proposed** until Robert settles it.
Rules: this project follows ada-bot-brain (INSTRUCTIONS, the DECISIONS table rows "Every project", "Ada cores", "Ada/wasm browser builds", "Every browser page", "F9 report"; PRACTICES and PRACTICES-games).
Behaviour reference: the TypeScript tree `RobertBoettcherSF/Hood-Simulator`, branch `build/1.2.91`, commit `9ed8ca7` (source commit `fbcacfd`). All `file:line` references below are into that tree unless they name ada-bot-brain.

---

## 1. Scope and the 1.2.91 reference

### 1.1 Scope

- A browser game: the whole simulation (city, people, orders, movement, combat, police, FBI, economy, politics, rivals, Auto, reports) in Plain Ada 2022 compiled to WebAssembly (brain D-014, D-001).
- TypeScript/JS only for what Ada cannot do in a browser: drawing, sound, input, menus, file download and storage (section 2).
- One rule set: the 1.2.91 "Standard rules" (`src/sim/rules.ts:8-10`, every new game since 1.2.50). The older compact-city branches guarded by `standardRules(w) === false` are **not** ported.
- Game modes kept: Full game with victory any / become mayor / go straight / last gang standing; Power; Territory; Wealth (`src/sim/victory.ts:4-28`, `src/sim/sim.ts:793-857`).
- City sizes kept: Small 36×28, Standard 40×32, Large 44×35 (`src/sim/newGameValidation.ts:10-17`).
- Not in scope for the first items: tutorials, diary, attract mode, save import of TypeScript saves, art pipeline. Art stays optional: 1.2.91 already runs on placeholders drawn in code when no art is present (`src/app/artBase.ts:1-13`).
- The TypeScript tree is paused (Robert, 2026-11-22) except item 0 (rename build).

### 1.2 Reference run

| Key | Value |
|---|---|
| Build | 1.2.91, `build/1.2.91`, play commit `9ed8ca7`, source `fbcacfd` |
| TEST KEY | city seed 1932, Auto seed 1932, taken over at week 1, Full game — last gang standing only, normal opponents, normal economy, 40×32 |
| Outcome | won after week 87 ("Every rival gang has been wiped out."), score 100 |
| Gangs gone (GANG GONE line) | The OConnell Gang w62, The Weiss Gang w79, The Vanetti Gang w87 |
| Our losses | rival kills 178, police 17, FBI 0 |

Timeline from the 1.2.91 SUMMARY (week: blocks / men / managers / cash):

| w10 | w20 | w30 | w40 | w50 | w60 | w70 | w80 | w88 |
|---|---|---|---|---|---|---|---|---|
| 16 / 40 / 2 / $12,369 | 64 / 150 / 10 / $41,850 | 79 / 164 / 40 / $79,520 | 124 / 229 / 97 / $183,607 | 187 / 301 / 182 / $570,874 | 226 / 442 / 293 / $1,736,714 | 264 / 538 / 396 / $3,114,678 | 317 / 614 / 473 / $4,695,585 | 355 / 676 / 525 / $6,104,793 |

The report lines that produce these are `testKeyLine` (`src/app/autoTest.ts:252`) and the SUMMARY block (`src/app/autoSummary.ts:109-119`). The Ada build writes the same lines (section 7.10) so the two reports can be compared line by line.

### 1.3 Outcome comparison method

A bit-identical match with 1.2.91 is **not** a goal: 1.2.91 uses JavaScript doubles, `Math.sin/cos/atan2` and its own RNG call order; the Ada core uses whole-number positions (3.4) and calls the RNG in a different order. The comparison is on outcomes.

1. Run Auto in both builds on the same TEST KEY (1932/1932, last gang standing, normal/normal, 40×32), then on a seed batch (open question Q1).
2. Compare per run: won/lost; win week; week each rival gang is gone; our losses by cause (rival / police / FBI); blocks and men at w20, w40, w60, w80; peak cash over the reserve.
3. Pass band (Robert, 2026-11-22): the same outcome (won/lost), and every compared number within **±20 %** of the 1.2.91 value for the same TEST KEY; over a batch, the median of each number within ±20 % of the 1.2.91 median. For losses of 10 men or fewer the band is ±2 men (otherwise ±20 % of 0 police/FBI losses fails on any loss) — **proposed**.
4. A miss is reported with the metric that moved and the code that moved it (file:line, both trees). Unproven causes are marked unproven.
5. Who runs: Robert, on his machine, from the githack play link (Auto Test button) and, from the Auto items, the native batch runner. Bots run only the compile check and the builds (section 7).

---

## 2. Ada / TypeScript split and the host interface

### 2.1 What goes where

| Ada (wasm core, Plain Ada 2022, web-safe subset D-001) | TypeScript/JS (host) |
|---|---|
| World state, RNG, city generation | The street view: 1.2.91's Three.js renderer with its code-drawn placeholders (`src/app/artBase.ts:1-13`), fed from the draw buffers, from item 3 |
| Clock, weekly loop, settlement stages | Panels (open question Q4) |
| Command API: every player and rival action, with its validation | Input: mouse, touch, keys (`key` and `code`, PRACTICES-games) |
| Order state machine, staffing, crew time, estimates | Text: maps event and message codes to en-GB / de / es / fr (D-025) |
| Movement, routing, transport, traffic, trams | Sound: maps event codes to sounds; Sound off toggle (D-025) |
| Combat, close combat, police, courts, FBI | Save/load: stores the Ada save buffer in IndexedDB (2.5) |
| Economy, taxes, opinion, politics, news | F9 / Debug button: wraps the Ada report buffer in the `poncelet-report` v1 JSON (D-007, D-017, D-026) |
| Rival planner, Auto, Auto's player view | Downloads (report text, F9 JSON), version check |
| Reports: BUILD / TEST KEY / SUMMARY and all report-only lines | Stamp display, `version.txt` check (D-005) |

Rule (PRACTICES-games): the simulation never imports host code. The host never changes world state except through command exports.

### 2.2 Integer-only interface (D-004)

All exports take and return `Interfaces.Integer_32` (or `Unsigned_32` for hashes and seeds). No strings, no floats, no record addresses cross the boundary.

Proposed export groups (names prefixed `hs_`; the release build exports exactly this list, D-006):

| Group | Exports (proposed) |
|---|---|
| Life cycle | `hs_new_game(seed, auto_seed, mode, victory, opponents, economy, w, h)`, `hs_state_hash`, `hs_build_id` |
| Time | `hs_launch_week`, `hs_tick(minutes)`, `hs_finish_week`, `hs_phase`, `hs_week`, `hs_minute` |
| Commands | `hs_cmd_begin(kind)`, `hs_cmd_arg(i, value)`, `hs_cmd_commit` → result code (0 = ok, else a numbered reason) |
| Queries | `hs_count(kind)`, `hs_get(kind, id, field)` — integer fields only; text is built by the host from codes and ids |
| Events | `hs_event_count`, `hs_event_ptr`, `hs_event_clear` (2.3) |
| Draw | `hs_draw_ptr(layer)`, `hs_draw_len(layer)` (2.4) |
| Saves | `hs_save_begin` → length, `hs_save_ptr`, `hs_load_begin(len)`, `hs_load_ptr`, `hs_load_commit` → result code |
| Reports | `hs_report_begin(kind)` → length, `hs_report_ptr` (ASCII bytes in Ada memory; reading memory is not a string pointer handed over, D-004) |
| Auto | `hs_auto_play_week`, `hs_auto_test(weeks_max)` |
| Errors | last-chance handler writes exception, file and line into an error buffer and calls the imported `hs_host_error(code, line)` (D-003, D-027) |

Names (people, gangs, places) are generated in Ada from fixed name tables and written into the report buffer or a name buffer (`hs_name_ptr(kind, id)`); the host reads bytes from wasm memory. This is a read of a versioned buffer, not a string pointer handed across (D-004) — **proposed**, Robert to confirm this reading of D-004.

### 2.3 Numbered event records

1.2.91 has three event streams: player messages (`SimMessage`, `src/sim/types.ts:921-932`; categories combat / police / failed / waiting), news items (`src/sim/types.ts:894-919`) and presentation events for the view (`src/sim/presentationEvents.ts:8`: attack, death, photo, fire, explosion, throw). The Ada core keeps one ring buffer of fixed records:

```
type Event_Record is record
   Seq      : Unsigned_32;   -- running number
   Minute   : Integer_32;    -- week minute 0 .. 2399
   Kind     : Event_Kind;    -- numbered: Msg_Combat, Msg_Police, Msg_Failed, Msg_Waiting,
                             -- News_*, Fx_Attack, Fx_Death, Fx_Photo, Fx_Fire, Fx_Explosion, Fx_Throw, ...
   Text_Id  : Integer_32;    -- numbered message template
   A, B, C  : Integer_32;    -- template arguments: person / gang / building ids, amounts
   X, Y     : Integer_32;    -- position in map units (3.4), or -1
   Sound    : Integer_32;    -- 0 none, 1 gunshot (types.ts:925)
end record;
```

Capacity **proposed** 4,096 records; the host drains it every frame; overflow increments a dropped counter that goes into the F9 report (D-007 "events with a dropped count"). Message templates are numbered in Ada and translated in the host (four languages, D-025).

Player-visible rule: only `Msg_*` and `News_*` records addressed to the player's gang, the week log (2.3.1) and the player's own order results are player-visible information. Auto reads exactly these (section 7.9).

#### 2.3.1 Week log

1.2.91 keeps a per-week log of deaths, take-overs and news lines (`w.weekLog`, cleared at week start `src/sim/sim.ts:171`; every death adds a line `src/sim/execution.ts:2193`), shown to the player as "Deaths & defections" (`src/ui/organizer/LieutenantsTab.tsx:547, :629-638`). Ada keeps it as numbered records (template id + arguments), capacity **proposed** 512 per week.

### 2.4 Draw buffers

Per frame the host asks for layers; each is a flat `Integer_32` array in Ada memory:

| Layer | Record (Integer_32 fields) | Cap (proposed) |
|---|---|---|
| People | id, x, y, heading, role, gang, status, pose/action, vehicle | Max_People (3.2) |
| Vehicles | id, x, y, heading, kind, gang, occupants | Max_Fleet + Max_Traffic_Cars |
| Buildings (changed only) | id, type, owner gang, state, damage | Max_Buildings |
| Blocks (changed only) | id, owner/claimants, district, squalor band | Max_Blocks |
| Trams | id, x, y, heading | 32 |

Positions between ticks: 1.2.91 interpolates with `subMinute` (`src/sim/sim.ts:193-195`); the host does the same with the previous and current layer.

### 2.5 Saves

- The Ada core writes one versioned binary save buffer (`Save_Version` 1, header: magic, version, build id, seeds, week). The host stores it.
- The IndexedDB database keeps the same internal name and object store `saves` as the TypeScript build (`src/app/save.ts:40-42`), so existing browser storage and save-slot UI behaviour do not change. The name is internal and never shown.
- A TypeScript (1.2.x JSON) save is not loadable in the Ada build (the formats differ); the slot list shows it as "made with the TypeScript build". **Proposed.**
- Auto's learned state (1.2.91 `BEGIN AUTO TEST LEARNED STATE` block) is saved in its own small buffer.

---

## 3. Data model with fixed caps

The web-safe subset (D-001, PRACTICES "Web-safe Ada subset") allows no heap: every collection is a fixed array with a count. Ids are array indexes per kind (1.2.91 uses one shared id counter, `newId`, `src/sim/citygen.ts:69`; per-kind indexes are **proposed**).

### 3.1 Existing constants kept (cite)

| Constant | Value | 1.2.91 |
|---|---|---|
| Days per week / minutes per day / week | 5 / 480 / 2,400 | `src/sim/constants.ts:4-6` |
| Block size / street width / cell | 40 / 14 / 54 | `constants.ts:12-14` |
| Walk speed, drive speed | 1.8 / (10/3) per minute; ×3.4 | `constants.ts:25, 33, 34` |
| Minimum drive distance | 18.75 × 54 / 5 | `constants.ts:40` |
| Chase re-route move / board wait | 12 / 60 min | `constants.ts:42, 44` |
| Crews per gang / men per crew | 12 / 10 | `constants.ts:47-48` |
| Snitches | 3 | `constants.ts:49` |
| Election: blocks required / weeks / first term / cycle | 100 / 6 / 4 / 22 | `constants.ts:53-57` |
| Warehouse goods / cash cap | 300 / 15 | `constants.ts:58-59` |
| Weapons (cost, range, damage, accuracy) | pistol 100/22/26/0.5 … twin pistols 3000/40/58/0.78; explosives 500 | `constants.ts:61-113` |
| Vehicles (cost, speed, seats, cargo) | coupe 3000/1/4/60, truck 3000/0.38/10/400, speedster 5000/1.45/2/20 | `constants.ts:124-152` |
| Orders (25 types: max men, minutes per target, target kind, severity, whole week) | table in 6.4 | `constants.ts:198-490` |
| Economy multiplier | weak 0.68, normal 1, strong 1.38; income ×1.5 | `constants.ts:506-514` |
| Ambient slices per minute | 6 | `src/sim/sim.ts:55` |
| Traffic cars | 320 | `src/sim/traffic.ts:20` |
| Largest city | 44 × 35 | `src/sim/newGameValidation.ts:17` |
| Civilians / police at 40×32, scaled by block count | 6,000 / 400 | `src/sim/citygen.ts:35, 586-605` |
| FBI agents / judges / DAs | 5 / 4 / 4 | `citygen.ts:581-594` |

### 3.2 Caps (all proposed; block, lot and building caps measured in item 3)

| Cap | Proposed | Basis |
|---|---|---|
| Max_Blocks | 1,540 | 44 × 35 (`newGameValidation.ts:17`) |
| Max_Lots, Max_Buildings | 18,480 | 12 per block on average. Measured in item 3: Large 1932 has 13,488 lots, Standard 1932 4,580, Small 1932 8,769; one block holds at most 17 (varied layout) or 9 (Standard) |
| Max_People | 16,384 | civilians 6,000 + police 400 at 40×32, scaled ×1.2 for Large; owners, staff, officials; up to ~700 of our men at w88 (1.2.91 timeline); recruit pools |
| Max_Gangs | 4 | four gang colours (`constants.ts:499-504`) |
| Max_Teams | 48 | 12 per gang × 4 |
| Max_Orders (live + last week) | 2,048 | 1.2.91 put forward 16,444 orders in 87 weeks (~190 a week, all gangs' Auto proposals included) |
| Max_Fleet (gang vehicles) | 256 | proposed |
| Max_Traffic_Cars | 320 | `traffic.ts:20` |
| Max_Crimes (ring) | 4,096 | weekly law reads last week's crimes |
| Max_Cases | 512 | court cases open |
| Max_News (ring) / Max_Messages (week) | 512 / 2,048 | |
| Max_Path_Points per person | 64 | routes are street corners; longest route on 44×35 is under 80 corners — measured in item 6 |

Memory estimate (proposed, measured in item 4): a person record ≈ 256 bytes → 4 MB; buildings ≈ 2 MB; the rest < 4 MB. Initial wasm memory 32 MiB (ada-fractal-explorer uses 33,554,432, `build.sh`); stack 1 MiB (PRACTICES).

A cap that is reached is not clamped silently (INSTRUCTIONS, "Do not hide bugs"): the command returns a numbered reason ("city full") and the event goes into the report.

### 3.3 Records (from `src/sim/types.ts`)

Fields carried over; report-only fields are in separate `Report_*` records so Auto's view cannot reach them (6.9).

- **Person** (`types.ts:122-233`): id, role (18 roles, `types.ts:41-81`), status (active, arrested, onTrial, jailed, kidnapped, beaten, dead; `types.ts:83-100`), skills (11 skills, 0.5–5.0 in half stars, `types.ts:10-23`) stored as half-star integers 1..10, gang, team, building, pay, pay demand, loyalty, opinion, hostility, fear, wanted, position, destination and path, vehicle, order, jail weeks, bribed/employed by, hp, death week, captured by, street order.
- **Gang** (`types.ts:728-802`): boss, colour, cash, crews, pool, accountant, lawyer, weapons and vehicles stock, diplomacy offered/known (alliance … war, `types.ts:719`), tax evasion, suspicion, evidence, going straight, running for office, popularity, goodwill, eliminated, recruit list, prisoners, known people (the identified list), history, finances.
- **Team** (`types.ts:654-665`): lieutenant, members, orders, weapons, vehicles, area.
- **Order** (`types.ts:545-653`): type, crew, targets (buildings, blocks, person, point), options (men, priority, wait, repeat, public), assigned and sent men, state (queued, travelling, executing, waiting, done, failed, cancelled; `types.ts:536-543`), cursor, work left, estimate, results (numbered), fail reason, hunting fields, export/raid delivery.
- **Building** (`types.ts:384-453`), **Lot** (`:324-335`), **Block** (`:337-369`), **Protection** (`:371-382`), **FleetVehicle** (`:686-717`), **CrimeRecord** (`:841-858`), **CourtCase** (`:860-877`), **Election** (`:879-892`).

### 3.4 Numbers, grid and time (Robert, 2026-11-22)

- **Positions:** whole numbers. Map units are fixed point, 1/256 of a 1.2.91 metre, in `Integer_32`. Square root, sine/cosine and angles come from integer routines and tables (integer square root; 1,024-entry sine table). AdaWebPack has no `Elementary_Functions` and `Float'Floor` can fail to link (PRACTICES "Wasm maths pitfalls"); whole numbers also keep native and wasm builds bit-identical (PRACTICES, determinism).
- **The map as a grid in the core:** one x/y matrix `Grid (X, Y)` of cells, cell size one fifth of a block-plus-street (54 ÷ 5 = 10.8 units), the cell 1.2.91 already uses for sightings, witnesses and fire range (`src/sim/fireRoll.ts:56`, `src/sim/systems/sightings.ts:24`); the Large city is 220 × 175 = 38,500 cells, holding per cell: block, street/lot/building, owner gang, claimants, squalor and police bands, and a per-gang **known** layer (what that gang has seen). Movement, routing, sighting and the decision module (section 4) all read this one matrix.
- **Time:** man-minutes as in 1.2.91: work per target is minutes × men (`src/sim/execution.ts:991`), crew capacity and free time in man-minutes (`src/sim/crewTime.ts:14-86`), estimates in minutes (`execution.ts:579-646`). A week is 2,400 minutes (`constants.ts:6`).
- **Money:** `Integer_64` dollars (1.2.91 peak cash $6.1M; wealth sums exceed 2^31 in long games). Money is the one currency of the decision module (section 4.3).
- **Chances and multipliers:** per-mille integers (`Chance_Per_Mille`), so the same seed gives the same game natively and in wasm.
- RNG: section 6.1.
- **Step 2 outcome (v0.2.0, Robert's OK 2026-11-22):** `Hood.Units` keeps positions as whole numbers (`type Units`, 256 per unit, floor rounding), not an Ada fixed-point type: the browser runtime has no 64-bit scaled arithmetic (`s-arit64`), so fixed-point products would not link. `Hood.Trig` uses 1,024 angle steps and a 257-entry quarter-wave table scaled by 65,536 (generated by `tools/gen-trig.py`) instead of a full 1,024-entry table. `Hood.Grid` maps a position to its cell as `x × 5 / 13,824` (rounded down); of a block's five cells the middle three are block and the outer two street. `Hood.Random` reproduces mulberry32, the city-plan LCG, `hash32` and every stream seed of 1.2.91 bit for bit (native smoke: all reference values match). All of these constants are **proposed**.

---

## 4. The shared decision module (core)

Robert, 2026-11-22: rivals and Auto see the same thing, and every gang decides through the same module. 1.2.91 started this: Auto's one weekly decision loop (`src/app/autoDecide.ts:6-24`, `decideWeek` `:94`) and the unified value "later a module shared with the rival gangs" (`src/app/autoValue.ts:1-13`, `unifiedValue` `:46-49`). Rivals still use their own planner (`src/sim/ai.ts:90`). In Ada there is one module, `Hood.Decide`, and no other planner.

### 4.1 Boundary

```
 Hood.World (engine state, all rules)          -- no gang may read it directly
        |  builds, once per gang per planning phase
        v
 Hood.View (one gang's player-visible view)    -- input
        |
        v
 Hood.Decide (fitness over the grid)           -- the only decision code
        |  orders and commands (records)
        v
 Hood.Commands (validate, apply)               -- the only way to change the world
```

- `Hood.Decide` may `with` only `Hood.View`, `Hood.Commands` (spec) and its own units. It cannot see `Hood.World`'s body; the compiler enforces the boundary (package visibility).
- Every non-human gang — the three rivals and Auto — runs `Hood.Decide` at its planning slot (rivals: settlement stage 17 + g, `src/sim/sim.ts:435-445`; Auto: the player's planning phase). A human player uses the same `Hood.Commands` from the UI.
- Differences between gangs are **parameters only**: a profile record (aggression, hiring, rackets, bribes, buying, violence weights — 1.2.91 rolls rival profiles, `citygen.ts:736-748`, and the Auto strategy has the same weight names, the learned-state block) and the gang's chosen goal. No code path for one gang only.

### 4.2 Input: the player-visible view

Built per gang from what a player of that gang can see, and nothing else:

| In the view | 1.2.91 source |
|---|---|
| Own gang: men, skills, pay, loyalty, crews, orders, cash, finances, buildings, weapons, cars | own gang records |
| The grid's known layer: blocks, buildings and owners seen; protection in own blocks | `gang.knownPeople`, sightings (`systems/sightings.ts:258`) |
| Identified rival men and where last seen | `knownPeople`, sightings |
| The chart: each rival's men, street men, blocks, as a player's chart shows them | 1.2.91 Auto "chart" (ENDGAME line) |
| Messages to this gang, news, newspaper, the week log | `types.ts:921-932`, `newspaper.ts:66`, `sim.ts:171` |
| Own orders' results last week | `w.lastWeekOrders` |
| Diplomacy as offered and known | `gang.offered`, `gang.known` |

Not in the view: other gangs' cash, plans and orders; hidden suspicion, evidence and FBI scores; any person's status unless a visible text or sighting shows it. A rival man off the identified list is **missing**, not dead, until a visible text names his death (`autoTest.ts:1300-1312`).

### 4.3 Evaluation: one fitness over the grid, one currency

For each candidate order (generated per crew from the view: targets on the grid, people identified, buildings known):

```
fitness = value toward the chosen victory × chance carried out
        − heat − expected losses − manager cost − cash × λ          (all in dollars)
per man-minute = fitness ÷ max(60, man-minutes by the game's estimate)
```

- This is 1.2.91's unified value (`autoValue.ts:1-10, :46-49`) with the goal weights of `autoDecide.ts:16-24` (`KIND_WEIGHTS`, per victory: territory, wealth, power, office, straight, eliminate), moved into the shared module and computed on the grid: value of a block or building = what it adds toward the chosen victory (blocks for territory, takings for wealth, rival strength removed for eliminate, …), read from grid cells.
- Costs, chances and time come from the same engine formulas the orders use (`estimateMinutes`, `roll`, `workForTarget`: `execution.ts:579, :241, :1031`), called through `Hood.View` with view data only.
- Crews take candidates best first by fitness per man-minute while they have free man-minutes (1.2.91 `decideWeek`, `autoDecide.ts:94`; `MIN_FREE_MINUTES` `:92`).
- Learning (`autoLearn.ts:16-19`: decay 0.9, clamp 0.25–4) is part of the module, so rivals learn too if their profile turns it on (**proposed**: on for Auto, off for rivals at first, a profile flag).
- Report-only fields are never inputs.

### 4.4 Outputs

A list of command records: orders (type, crew, targets, men, priority, wait), hires, promotions, pay, purchases, sales, bribes, diplomacy, election entry. Each goes through `Hood.Commands`, which applies the same validation as for a human (1.2.91 `issueOrder` `api.ts:196-215`). A refused command returns a numbered reason that the module logs.

### 4.5 Same engine rules for all

The engine never asks who is deciding. Execution, movement, combat, police, FBI and economy rules (sections 5 and 6) are the same for every gang, human, rival or Auto. If rivals can't, Auto can't, and the other way round.

---

## 5. Weekly loop and order execution (from 1.2.91)

### 5.1 Phases

`phase` is planning, week or gameOver (`types.ts:1009`).

1. **Planning.** The player (or Auto) gives orders through the command API. Rival planning already ran at the end of the previous settlement (5.3, stage 17+).
2. **Launch week** (`src/sim/sim.ts:161-185`): immediate-outcome check; score peaks; phase = week, minute = 0; messages and week log cleared (`:170-171`); each gang's last-week income and costs carried (`:173-179`); `beginWeekOrders` (`:180`); specialist jobs begin; vehicle routes repaired; guard posts cleared; FBI dispatched (`:184`).
3. **Week ticks** (one tick = one game minute, 2,400 a week): `tickOnce` (`sim.ts:292-358`).
4. **Settlement** when minute reaches 2,400 (`sim.ts:354-357`): staged, 0 … 16 then one stage per gang for rival planning (`sim.ts:385-451`).

### 5.2 One tick, in order (`sim.ts:292-358`)

1. Sighting cells before walking (`:304`).
2. Minute + 1; rented rooms charged (`:310-311`).
3. Ambient walking in 6 slices by id (`:313-326`; `AMBIENT_SLICES` `:55`).
4. Weapons allocated for the minute (`:330`).
5. Traffic (`:333`), goods (`:334`).
6. **Orders** (`:335`, `tickOrders`, 5.4). Outcome check.
7. Street orders (`:337`). Outcome check.
8. Building emergencies (`:339`). Outcome check.
9. FBI (`:341`), specialist jobs (`:342`).
10. Movement finish (`:343`), transport reconcile (`:344`).
11. Combat (`:345`), office defence (`:346`).
12. Sightings (`:347`). Outcome check.

The Ada tick keeps this order exactly; the 6 ambient slices exist in 1.2.91 to spread work over frames, and in Ada are one loop (**proposed**), because wasm runs a whole minute well inside a frame (to be measured in item 4).

### 5.3 Settlement stages (`sim.ts:394-445`)

| Stage | Work | 1.2.91 |
|---|---|---|
| 0 | fail unfinished orders, settle specialist jobs, burning escapes | `:395`, `failUnfinishedOrders` `:453` |
| 1 | weekly economy | `:396`, `systems/economy.ts:75` |
| 2 | taxes | `:397`, `systems/taxes.ts:16` |
| 3 | audits | `:398`, `:511` |
| 4 | law (police, courts) | `:399`, `systems/law.ts:16` |
| 5 | FBI | `:400`, `systems/fbi.ts:236` |
| 6 | opinion, charity | `:401`, `systems/opinion.ts:15` |
| 7 | territory goodwill | `:402`, `systems/opinion.ts:163` |
| 8 | politics | `:403`, `systems/politics.ts:17` |
| 9 | news | `:404`, `systems/news.ts:14` |
| 10 | diplomacy knowledge | `:405`, `:534` |
| 11 | rebuild command | `:406`, `:570` |
| 12 | history | `:407`, `:545` |
| 13 | succession (boss dies → heir) | `:408`, `:646` |
| 14 | reserved (empty) | `:409` |
| 15 | end conditions; finances closed; game over if decided | `:410-422`, `:816` |
| 16 | transport reset, week + 1, repairs, trading restarts, recruit pools refilled, police chief replaced, protection fear, finances opened, orders rolled over | `:423-434` |
| 17 + g | rival planning for gang g (`planGang`), then phase = planning | `:435-445` |

### 5.4 Order execution

States: queued → travelling → (waiting) → executing → done / failed; cancelled by the player.

- **Hand-out at week start** (`src/sim/execution.ts:734-755`): every non-cancelled order of every crew is set back to queued (`:738-745`), every person's order cleared, then each queued order is assigned in crew order (`:747-754`).
- **Assign** (`assignOrder`, `execution.ts:657-731`): staffing (`src/sim/orderStaffing.ts:32`) picks the men or gives a wait reason or an impossible reason (`:662-666`); men waiting in an office step out (`:671`); a person target unknown to the gang starts a hunt (`:679-691`); state = travelling (`:698`); at week start each man starts from the office nearest his first job (`:708-717`); cars are handed out (`allocateTransport`, `:722`).
- **Each tick** (`tickOrders`, `execution.ts:780-1029`), per crew, per order:
  - no men left → failed "Nobody was left to carry out the order." (`:795-800`);
  - crew smaller than reported → message (`:802-807`);
  - waiting → men stand (`:827-830`);
  - **travelling** (`:845-972`): target position (`targetPos` `:392`); a kill target found dead → done "X is dead." (`:848-855`); no position → failed "The target could not be found." (`:856-861`); a crew on foot chasing a far target takes a free car (`:865-868`); re-route rules for chases (`:870-884`); hunting (asking at stops, tips, sightings; `:885-947`); all arrived → work left set (`workForTarget` `:1031-1039`: minutes per target × (1.35 − skill × 0.5), at least 20), then waiting (if "wait for the word") or executing (`:948-970`);
  - **executing** (`:974-1018`): whole-week orders run their standing duty (`tickStandingOrder` `:1102`); a person target walking away is followed (`:983-990`); work left −= men × minutes (`:991`); at 0 the target is resolved (`resolveTarget` `:1255`), then the next area target or done/failed (`:1003-1016`);
  - something freed → queued orders of that crew are assigned again (`:1022-1027`).
- **End of week**: unfinished orders fail with "There was not enough time in the week to perform the order." (`sim.ts:453-509`); whole-week duties that worked count as done.
- **Estimate** (`estimateMinutes`, `execution.ts:579-646`): work ÷ men + travel ÷ planned speed + longest walk to a car (1.2.90) + hunt stops × 60. Auto holds back an order whose estimate does not fit the crew's free week.
- **Killing** (`killPerson`, `execution.ts:2134-2194`): removes the dead man from every gang's lists, including every identified list (`:2162`), replaces a dead lieutenant at once, logs the death in the week log (`:2193`).

Port notes (from the 1.2.91 run checks):

1. A kidnap whose target dies on the way ends "could not be found" (`:856-858`), a kill ends "is dead" (`:848-855`). The Ada order ends both with "X is dead." (kill: done; kidnap: failed). **Proposed** (Robert, 2026-11-21 discussion).
2. The note on a lost target says "in the street" for men in custody (`execution.ts:388`); the Ada report names custody. **Proposed.**

---

## 6. Systems in port order (engine first, then the shared decision module, then Auto)

Each subsection: rules (with 1.2.91 references), constants, what the player sees, and the fairness rule. The fairness rule for every system: **the same engine rules apply to every gang; there is no engine rule for one gang only; if rivals can't, Auto can't** (and the other way round). Rivals and Auto both decide through `Hood.Decide` (section 4) and act only through `Hood.Commands` (1.2.91: `src/sim/ai.ts:146-178` and Auto both call `src/sim/api.ts`).

### 6.1 Basics and RNG

- RNG: mulberry32, one 32-bit state, saved in the world (`src/sim/rng.ts:6-30`; `rngState` `types.ts:999`). `next` returns state ÷ 2^32 (`rng.ts:18-25`); `int`, `range`, `chance`, `pick`, `weighted`, `shuffle` as in `rng.ts:27-75`. Ada: `Interfaces.Unsigned_32` arithmetic reproduces `Math.imul` and `>>>` exactly; `next` returns the Unsigned_32 and callers use integer forms (`Int (Lo, Hi)`, `Chance_Per_Mille`) wherever they can (**proposed**) so the native and wasm builds agree bit for bit.
- Two RNG streams as in 1.2.91: city seed (world RNG) and Auto seed (Auto's own strategy rolls), so map and AI can be varied apart (PRACTICES-games, "Two seeds").
- State hash (**proposed**; step 2 field order in `src/hood-world.ads`): FNV-1a over the world arrays, shown on the page and in every report (D-007). 1.2.91 has no world state hash (`src/sim/hash.ts:8` hashes single ids only), so the hash compares native with wasm Ada builds, not Ada with 1.2.91.
- Player-visible: seeds and stamp on the page.

### 6.2 City generation

- Blocks on a grid (`src/sim/citygen.ts:358` `createWorld`); districts downtown / commercial / industrial / residential / civic (`types.ts:322`; `citygen.ts:153`); lots and buildings per block (`citygen.ts:450`, `src/sim/cityLayout.ts`); building types and classes from the 1.2.91 data tables in `src/sim/data/`, carried over unchanged into the public repo (Robert, 2026-11-22).
- Special places: 3 trade unions, 5 gyms, 5 pool halls, 3 accountancies, 3 law firms, 3 warehouses (`citygen.ts:528-536`); owners, clergy, reporters in their buildings (`:548-558`); 4 judges, 4 DAs (`:581-582`); police and civilians scaled by block count (`:586-605`); 5 FBI agents (`:593-595`); 3 snitches (`:597-599`).
- Gangs: four gangs, starting offices and hoods (`citygen.ts:639-660`, `:812`, `:878`); rival profiles rolled per opponent setting (`citygen.ts:736-748`).
- Trams and lines (`src/sim/trams.ts:44-54, :86`).
- Constants: as section 3.1. New (item 3, all proposed): see `docs/HOW_WE_GOT_HERE.md`, step 3.
- Item 3 outcome: the stream state after the city, the city hash, the structure hash and all counts match 1.2.91 for Standard, Large and Small 1932 and further seeds; the Standard headquarters match; trams and the Large and Small headquarters follow later.
- Player-visible: the map, every building's outside type, the player's own gang; rival men are not known until seen or bought from a snitch (`gang.knownPeople`).

### 6.3 People and the weekly loop

- Roles and statuses as 3.3. Hood skills by hood type (`src/sim/hoodGeneration.ts:32-81`); pay demand (`citygen.ts:143`).
- Recruits: weekly pools and quotas (`src/sim/recruitPool.ts:100-153`), hiring (`api.ts:635` `hireRecruit`), free hires and promotions (`ai.ts:417-436` for rivals; same commands for the player).
- Loyalty, wages, half pay, desertion (`systems/economy.ts:283-346`).
- Succession: boss dead → heir; player boss dead → game lost (`sim.ts:646`, `:799-801`).
- Weekly loop and settlement: section 4.
- Player-visible: own men's skills, pay, loyalty; the week log; "Other gangs seen" (identified rival men, `LieutenantsTab.tsx:548-551`).

### 6.4 Orders and the command API

Order table (`src/sim/constants.ts:198-490`):

| Order | Group | Max men | Min/target | Target | Severity | Whole week |
|---|---|---|---|---|---|---|
| buyPremises | business | 2 | 250 | building | 0 | |
| setUpBusiness | business | 2 | 500 | building | 0 | |
| runBusiness | business | 2 | 150 | building | 0 | |
| collectProtection | business | 10 | 33 | area | 0 | |
| adjustProtection | business | 1 | 20 | area | 0 | |
| export | business | 4 | 350 | building | 0 | |
| donate | business | 4 | 33 | building | 0 | |
| cleanUp | business | 4 | 40 | area | 0 | |
| clearStreets | business | 4 | 20 | area | 0 | |
| guardBusiness | personnel | 4 | 0 | building | 0 | yes |
| patrol | personnel | 4 | 0 | area | 0 | yes |
| explore | personnel | 10 | 17 | area | 0 | |
| recruit | personnel | 10 | 33 | area | 0 | |
| goTo | personnel | 4 | 0 | point | 0 | yes |
| bribe | minor | 4 | 100 | person | 1 | |
| intimidate | minor | 10 | 67 | area | 2 | |
| extort | minor | 10 | 33 | area | 2 | |
| raid | minor | 4 | 100 | building | 5 | |
| kidnap | minor | 4 | 500 | person | 6 | |
| smashUp | violent | 4 | 67 | building | 4 | |
| assault | violent | 4 | 400 | person | 5 | |
| torch | violent | 4 | 67 | building | 7 | |
| bomb | violent | 4 | 67 | building | 9 | |
| kill | violent | 4 | 550 | person | 10 | |
| ambush | violent | 4 | 0 | area | 8 | yes |

- Command API = `src/sim/api.ts` (≈ 60 commands: `issueOrder` `:196`, `cancelOrder` `:395`, `rolloverOrders` `:419`, `repeatOrder` `:464`, `setPay` `:482`, `sackPerson` `:492`, `promote` `:520`, `moveToTeam` `:576`, `hireRecruit` `:635`, `buyWeapon` `:719`, `buyVehicle` `:808`, `allocateBlocks` `:866`, `setTrading` `:882`, `repairBuilding` `:906`, `sellBuilding` `:975`, `bribeOfficial` `:1018`, `employPoliceOfficer` `:1022`, …). Each command validates and returns a numbered reason (e.g. `issueOrder` checks `:196-215`).
- Ada: one `Hood.Commands` unit; `Hood.Rivals` and `Hood.Auto` may call only this unit to change the world.
- Crew time and staffing: `src/sim/crewTime.ts:14-86`, `src/sim/orderStaffing.ts:6-32`.
- Player-visible: last week's orders with their results (`LieutenantsTab.tsx:545`), messages during the week.

### 6.5 Movement and transport

- Walking: street-corner routes (`src/sim/movement.ts:150` `walkRoute`), steps per minute (`:310` `stepPerson`), arrival (`:561`); speed by person (`:104`).
- Driving: road routes (`src/sim/vehicleNavigation.ts:97, :193`), kerbside stops (`:66`), traffic: give-way, follow gap, junction box (`src/sim/traffic.ts:20-57`, `:618` `tickTraffic`, `:781` `crossingBlocked`).
- Gang cars: board, ride, step out, send home (`src/sim/transport.ts:96-306`); a crew takes cars only when quicker by car, walk to the car included (1.2.90, `transport.ts:149-215`); planned speed for estimates (`:452`); week reset (`:399`).
- Trams for walkers are off in 1.2.91 (`sim.ts:327-329`, `TRAM_RIDING`); trams still run and block (`trams.ts`). Kept off.
- Constants: `transport.ts:12-25, :289`; `traffic.ts:20-57, :139, :201`; `movement.ts:13-17`.
- Player-visible: everything on the map.

### 6.6 Combat, police and FBI

- Street combat each minute (`src/sim/systems/combat.ts:187` `tickCombat`): combatants by diplomacy and orders (`:60`), weapon range/damage/accuracy (`constants.ts:61-113`, `src/sim/weapons.ts:20, :67`), under fire 30 minutes (`combat.ts:70`), death message to the player when one side is the player (`combat.ts:169-170`). Close combat (`src/sim/closeCombat.ts:51-160`). Office defence (`combat.ts:312`).
- Order resolution for bribe, intimidate, extort, raid, kidnap, smash, assault, torch, bomb, kill: `resolveTarget` (`execution.ts:1255` onward); building damage (`:2058-2085`); kill (`:2134`); beating (`:2197-2200`).
- Crimes and witnesses (`src/sim/events.ts:71, :117`); police arrests and courts (`systems/law.ts:16`, `src/sim/courtOfficials.ts`); officials and bribes (`src/sim/officials.ts:14-117`).
- FBI: dispatch, tick, weekly (`systems/fbi.ts:127, :200, :236`), case threshold 200 (`:27`), suspicion rules (`:29-57`, `:625-708`), warrants (`:673`), street arrest (`:796`), raids (`:832, :877`).
- Player-visible: messages (combat, police), news, the Lawyer tab's crime list, "The FBI wants X" news (1.2.84 Auto reads these, `autoTest.ts:1399-1430`). Hidden: suspicion scores, case evidence — Auto may not read them (6.9).

### 6.7 Economy

- Business profit and weekly economy (`systems/economy.ts:29, :75`), contraband constants (`:22-27`), protection and fear (`src/sim/fitness.ts:27-63`; week-start fear `sim.ts:430`), official retainers (`economy.ts:226`), taxes and laundering (`systems/taxes.ts:16-92`), finances ledger (`src/sim/finances.ts:7-118`), goods, warehouses, export (`src/sim/goodsDelivery.ts`, `goodsStorage.ts`, `exportGoods.ts`), premises and rooms (`premises.ts`, `rentedRooms.ts`), opinion and charity (`systems/opinion.ts`, `systems/charityEffects.ts:25-41`), politics and elections (`systems/politics.ts:17-235`), news (`systems/news.ts:14`, `src/sim/newspaper.ts:66`).
- Scoring (`src/sim/scoring.ts:4-60`).
- Player-visible: own finances, takings, newspaper; rivals' wealth only as the chart shows it.

### 6.8 Rivals (on the shared decision module)

- Rivals run `Hood.Decide` (section 4) with their rolled profile. 1.2.91's rival planner (`src/sim/ai.ts:90`; order of concerns `:94-99`, crews `:161-266`, staff `:402-438`, officials `:470-494`, elections `:496-565`, weapons `:610-642`, stance `:660-700`, businesses `:703-743`; playbook weights `src/sim/rivalPlaybook.ts:16, :34`) is the behaviour reference: each of its concerns becomes a candidate generator in `Hood.Decide`, scored by the one fitness (4.3), not a separate planner.
- Rivals see only their own player view (4.2), as Auto does (Robert, 2026-11-22). This is stricter than 1.2.91 (its rivals read the world) and may change rival strength; the comparison (1.3) shows by how much.
- Report-only (1.2.91): RIVAL INFLOW, RIVALS, RIVAL HITS lines (`src/app/autoReportLines.ts`, `src/sim/hireLog.ts:46-84`). Kept as report-only; nothing reads them.

### 6.9 Auto (the player's gang on the shared decision module)

Auto is `Hood.Decide` run for the player's gang with the Auto profile and the chosen victory, plus the Auto Test runner and its reports. 1.2.91 Auto (`playAutoWeek`, `src/app/autoTest.ts:1176-9115`, and `src/app/auto*.ts`, ≈ 12,300 lines, ≈ 170 named constants) is the behaviour reference. Settled behaviour carried into the module as candidate generators and fitness terms: unified value per man-hour (`autoValue.ts:46-49`); learning, decay 0.9, clamp 0.25–4 (`autoLearn.ts:16-19`); ENDGAME (block ratio 3, cash weeks 26, attack crews 2 per rival, 1 for a rival with ≤ 4 street men, max 6; `autoWin.ts:239-262`); war posture (`autoTest.ts:962-964`); hit run-outs (`:980`); protection switch (`:1028`).

Rules:

1. Player knowledge only, through `Hood.View` (4.2). 1.2.91 kept this by convention (Auto reads `w.people[...]`, e.g. `autoTest.ts:3824` reads a target's status); Ada enforces it by package visibility.
2. A rival man off the identified list is missing, not dead, until a visible text names his death (`autoTest.ts:1300-1312`; week log 2.3.1).
3. A rule Auto needs goes into `Hood.Decide` for every gang; if rivals can't, Auto can't.
4. Report-only fields are never read (separate `Report_*` records).
5. New constants are marked proposed; decisions are fitness-based.

Refinement order (each a sub-item with its own Go and link, as Auto was refined in 1.2.x): hiring and crews → rackets (collect, extort, protection) → buying and businesses → cash and reserve → violence and hits → endgame → learning.

### 6.10 Reports

- Compact text report: `BUILD`, `TEST KEY`, week blocks, `SUMMARY` lines (`autoTest.ts:241-255`, `autoSummary.ts:109-119`), order files (DM rows), snapshots. Same line formats so 1.2.91 and Ada reports compare with the same scripts.
- F9 / Debug button: `poncelet-report` v1 JSON (D-007) with schema, stamp, seeds, `test_key`, action log, state hash, events and dropped count, errors with file and line, environment; Hood data in `custom` (D-017). An `expected` note on a manual report. Opening F9 pauses the game.
- Stamp `vMAJOR.MINOR.PATCH bYYYYMMDD-HHMM <short-sha>` (Europe/Berlin), same string in `version.txt` and every report (D-005).

---

## 7. Toolchain, build and checks

- **Wasm:** AdaWebPack 24 (GNAT-LLVM) at `~/toolchains/adawebpack-24`, path from `ADAWEBPACK`; the build stops with a clear message if it is missing and never downloads (D-016, D-006). One-time download only after Robert agrees: `tools/get-toolchain.sh` (recipe in ada-bot-brain `PRACTICES.md:54-66`; needs `rpm2cpio cpio lld libedit2` and the GNAT 14 runtime library via `alr`).
- **Compile:** `llvm-gcc -c --target=wasm32 -O2 -gnat2022 -gnatp -gnatwa -gnatwe --RTS=$ADAWEBPACK/usr/lib/rts-native` (D-027: `-gnatp` in wasm, contracts stay in the source). Link: `wasm-ld --no-entry --allow-undefined --strip-all --export=<each hs_ name> -z stack-size=1048576 --initial-memory=33554432` plus `s-memcop.o s-memmov.o s-memset.o` from `libgnat.a` (D-006, PRACTICES).
- **Native smoke:** `gprbuild -P tests/smoke.gpr` with GNAT 12.3 from `/usr/bin`, `-gnat2022 -gnata -gnatwa -gnatwe`, static runtime (D-002, D-012, D-015, D-027). It calls every Ada unit once with contracts on (D-027). It also runs one week on seed 1932 and prints the state hash; the wasm page shows the same hash (determinism, PRACTICES "Tests").
- **Ada 2022 note:** ada-fractal-explorer and holographic-principle compile with `-gnat2012` (`build.sh`, `tests/smoke.gpr:8`). This project uses `-gnat2022` as Robert chose (2026-11-22) and D-012 describes: `[...]` array aggregates, warning-free on GNAT 12.3 and 14. Ada 2022 features that GNAT 12.3 lacks or that AdaWebPack's runtime does not support are avoided; the first item proves the subset on both compilers.
- **Page:** `build.sh` writes one self-contained `dist/index.html` (base64 wasm + JS host) and `dist/version.txt` (D-005). The Three.js street view (item 3) needs its library: either inlined (size check) or a sibling file with the same `?v=` stamp (PRACTICES "Githack / publish" step 6) — open question Q5.
- **Web-app defaults (D-025):** en-GB, de, es, fr with flags; soft event sounds and a visible Sound off toggle; `prefers-reduced-motion`; visible stamp; F9 report; visible Debug button.
- **Publish:** commit `dist/` on `main` after Go (D-024), then curl-verify with GET (githack refuses HEAD with 403): the commit-pinned `https://rawcdn.githack.com/RobertBoettcherSF/ADA-Hood-Simulator/<commit>/dist/index.html` must return 200 and contain the new stamp; `version.txt` polled from `raw.githubusercontent.com` (PRACTICES "Githack / publish"). Robert gets the commit-pinned link.
- **Bot-side checks per item:** `gprbuild -gnatc` (syntax/semantics), the wasm build, the native smoke build and run, the GET check. Robert tests in the browser and, from item 11, runs the native batch.
- **Repo files:** `README.md` (build and test commands match the scripts, PRACTICES), `docs/DESIGN.md` (this file), `docs/HOW_WE_GOT_HERE.md`, `tools/get-toolchain.sh`, `build.sh`, `tests/smoke.gpr`, `src/` (Ada), `web/` (host template and JS), `dist/`. The web-safe subset checklist from PRACTICES is copied into `docs/DESIGN.md` §7 and ticked as units land.
- **Never in the repo or any public text:** the private reference files, their names, or the game this tree was first modelled on. The package metadata of the TypeScript tree is not copied.

---

## 8. Items (one item per Go; each ends with a commit-pinned githack link)

Each item: numbered plan → Robert's Go → build fully (not a stub) → GET-verified link `https://rawcdn.githack.com/RobertBoettcherSF/ADA-Hood-Simulator/<commit>/dist/index.html` (item 0: the Hood-Simulator play link). Order (Robert, 2026-11-22): a game a human can play in the placeholder street view first, then rivals on the shared module, then Auto refined as before. Line counts are rough Ada estimates.

| # | Item | Robert opens the link and should see / test |
|---|---|---|
| 0 | **Hood-Simulator 1.2.92 rename build** (TypeScript tree, before the new repo exists): `src/app/versionCheck.ts:1` REPO → `RobertBoettcherSF/Hood-Simulator` (also `PLAY_URL` `:3`); no other source or doc line uses the old name (the only other hits are the assets repo `ADA-Hood-Simulator-Assets`, which keeps its name: `fetch-assets.sh:6, :15`, `docs/DESIGN.md:1209`); package.json 1.2.92; DESIGN "v1.2.92 decisions"; typecheck + play build; push `build/1.2.92`. | The game starts as 1.2.91 did; the update check does not error. Only after this does Robert create `ADA-Hood-Simulator` (that ends GitHub's redirect from the old name). |
| 1 | **Skeleton page**: `build.sh`, `tools/get-toolchain.sh`, `tests/smoke.gpr`, host template, `Hood.Host_ABI`; stamp and `version.txt`; four languages; Sound off; reduced motion; Debug button and F9 JSON; last-chance notice (~600). | Title page with stamp, flags, Sound off, Debug button; F9 downloads a JSON with the stamp; a crash-test button shows the file:line notice. |
| 2 | **Basics, RNG and the grid** (6.1, 3.4): world record, whole-number positions and tables, mulberry32, state hash, the x/y grid (~1,200). | For seed 1932: the first 20 RNG values (same as 1.2.91's RNG and the native smoke) and the state hash; a grid overlay test pattern. |
| 3 | **City generation in the placeholder street view** (6.2): the 1.2.91 Three.js view with code-drawn placeholders reads the Ada draw buffers (~4,000 Ada + host glue). | New game (seed, Small/Standard/Large): the city in the street view with placeholder buildings; camera controls as in 1.2.91; a count panel (blocks, lots, buildings by class, people by role) close to 1.2.91 for 1932; caps (3.2) confirmed from these counts. |
| 4 | **People and the weekly loop** (6.3, 5.1–5.3 without orders) (~3,000). | Walkers in the street view; Launch week / Finish week; clock and week counter; settlement runs; recruits appear; week log panel. |
| 5 | **Orders and commands** (6.4, 5.4): crews panel and the peaceful orders (buy, set up, run, collect, adjust, explore, recruit, goTo, guard, patrol, donate, clean up, clear streets) (~6,000). | A human gives orders, watches men travel and work, reads last week's results and messages; estimates before giving an order. |
| 6 | **Movement and transport** (6.5): routes, cars, traffic, trams (~5,000). | Traffic; crews board cars when quicker; give-way at crossings; buy a car and see it used. |
| 7 | **Combat, police and FBI** (6.6) and the violent and minor orders (~8,000). | Hits, kidnaps, bombings; street fights with hit and death effects; arrests, trials, the Lawyer tab; FBI news. |
| 8 | **Economy, politics, news, score** (6.7) (~6,000). | Finances match the week's takings; buy and run businesses; weekly newspaper; elections; score. A human can play a long sandbox game. |
| 9 | **Shared decision module and rivals** (section 4, 6.8) (~6,000). | **Playable game:** a human plays against three rival gangs that decide through `Hood.Decide`; rivals collect, recruit, fight; the game can be won and lost in every victory mode. |
| 10 | **Reports** (6.10): compact BUILD / TEST KEY / SUMMARY report for any game, order file, snapshots, F9 `poncelet-report` v1 (~3,000). | A human game's report downloads in the 1.2.91 line format; F9 report with action log and state hash. |
| 11 | **Auto**, in sub-items in the refinement order of 6.9, plus the native batch runner (~6,000 on top of item 9). | Auto Test button: Auto plays 1932/1932 last gang standing; each sub-item shows what it changed in the report. |
| 12 | **Regression against 1.2.91** (1.3). | Robert runs 1932/1932 and the seed batch; every compared number within ±20 %, or the miss is reported with its cause. |

Size: 1.2.91 logic to port is about 40,000 TypeScript lines (`src/sim` 23,514, `src/app` 16,524 of which `autoTest.ts` 9,582); estimate 50,000–80,000 Ada lines. Rendering (`src/render` 13,117), UI (`src/ui` 11,788) and audio (`src/audio` 1,316) stay TypeScript.

---

## 9. Open questions

1. **Q1 Seed batch** (1.3): which city and Auto seeds besides 1932/1932, and how many.
2. **Q2 Small losses** (1.3): ±2 men when 10 or fewer, instead of ±20 % (which fails on any loss when 1.2.91 had 0).
3. **Q3 Names across the interface** (2.2): reading name bytes from wasm memory — acceptable under D-004?
4. **Q4 Panels:** settled (Robert, 2026-11-22): the 1.2.91 panel layout, written fresh in React; panels of later items shown disabled with their item number.
5. **Q5 Three.js delivery** (7): settled (Robert, 2026-11-22): sibling files in `dist/vendor/` (Three.js 0.169.0, React 18.3.1), each loaded with the build stamp in its URL.
6. **Q6 Learning for rivals** (4.3): off for rivals at first (a profile flag), on for Auto?
7. **Q7 Toolchain download** on Robert's laptop (D-016): agreed for item 1?
