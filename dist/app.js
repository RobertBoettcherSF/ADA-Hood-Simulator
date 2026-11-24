import * as C from "./vendor/three.module.min.js?v=v0.6.0%20b20261124-1826%208720a29";
const t = window.React, { createElement: zo, Fragment: Do, useCallback: ve, useEffect: U, useMemo: Se, useReducer: jo, useRef: Pe, useState: B } = t, oa = window.ReactDOM, { createRoot: ra } = oa, F = {
  blocks: 1,
  merged: 2,
  lots: 3,
  buildings: 4,
  blocksX: 5,
  blocksY: 6,
  status: 8,
  retries: 9,
  districtBase: 20,
  useBase: 30,
  rngLow: 42,
  rngHigh: 43,
  people: 50,
  week: 52,
  minute: 53,
  phase: 54,
  gameOver: 55,
  drawsWeek: 57,
  setupLow: 58,
  setupHigh: 59,
  m1Low: 60,
  m1High: 61,
  walking: 62,
  builtClassBase: 90,
  builtTypes: 99
}, Y = { block: 1, lot: 2, building: 3, person: 5, gang: 6, crew: 7, pool: 8, premises: 9 }, q = {
  id: 0,
  role: 1,
  gang: 2,
  female: 3,
  pay: 5,
  demand: 6,
  loyalty: 7,
  building: 9,
  x: 10,
  y: 11,
  walking: 12,
  hostility: 14,
  fear: 15,
  nameLength: 16,
  skill: 20,
  opinion: 40
}, D = {
  colour: 0,
  surname: 1,
  player: 2,
  profile: 3,
  boss: 4,
  cash: 5,
  office: 6,
  front: 7,
  manager: 8,
  lieutenant: 10,
  crewCount: 11,
  poolCount: 12,
  pistols: 13,
  coupes: 14,
  crewPistols: 15,
  crewCoupes: 16,
  wages: 17,
  eliminated: 18,
  offered: 20
}, sa = { protectGang: 3 }, Ae = { lot: 0, type: 2 }, bt = { cars: 4, fleet: 5, trams: 6 }, wt = 480, it = 2400, Jt = { name: 12, plan: 19 }, Qt = 12, Xt = 10;
class Mt extends Error {
}
async function la(e, n) {
  let o = null;
  const r = () => {
    if (!o) return "";
    let i = "";
    const d = o.hs_error_file_length();
    for (let p = 1; p <= d; p++) i += String.fromCharCode(o.hs_error_file_char(p));
    return i;
  }, a = Uint8Array.from(atob(e), (i) => i.charCodeAt(0)), { instance: s } = await WebAssembly.instantiate(a, {
    env: {
      hs_host_error(i, d) {
        const p = { code: i, file: r(), line: d };
        throw n(p), new Mt(`Ada core stopped: ${p.file}:${d}`);
      }
    }
  });
  return o = s.exports, o;
}
const H = (e) => e >>> 0, en = (e) => "0x" + H(e).toString(16).padStart(8, "0"), K = 54, Qe = 14, Xe = 3, Ne = 256, wn = ["downtown", "commercial", "industrial", "residential", "civic"], ia = ["urban", "park", "civic", "plaza", "avenue", "water"], kn = ["empty", "residential", "tenement", "commercial", "industrial", "municipal", "charity", "illegal"], ca = ["north", "east", "south", "west"], da = 192;
function Ft(e, n) {
  const o = (_) => new Int32Array(e.memory.buffer, e.hs_draw_ptr(_), e.hs_draw_len(_)), r = o(1), a = o(2), s = [];
  for (let _ = 0; _ * Qt < r.length; _++) {
    const u = _ * Qt;
    s.push({
      id: _,
      gx: r[u],
      gy: r[u + 1],
      district: r[u + 2],
      use: r[u + 3],
      spanX: r[u + 4],
      spanY: r[u + 5],
      merged: r[u + 6],
      landValue: r[u + 7],
      squalor: r[u + 8],
      content: r[u + 9],
      rail: r[u + 10] === 1,
      landmark: r[u + 11],
      name: e.hs_get(Y.block, _, Jt.name),
      plan: e.hs_get(Y.block, _, Jt.plan)
    });
  }
  const i = [];
  for (let _ = 0; _ * Xt < a.length; _++) {
    const u = _ * Xt;
    i.push({
      id: _,
      block: a[u],
      index: a[u + 1],
      x: a[u + 2] / Ne,
      y: a[u + 3] / Ne,
      w: a[u + 4] / Ne,
      h: a[u + 5] / Ne,
      face: a[u + 6],
      type: a[u + 7],
      cls: a[u + 8],
      storeys: a[u + 9]
    });
  }
  const d = [];
  for (let _ = 1; _ <= 4; _++) {
    const u = e.hs_get(Y.gang, _, D.office), c = u >= 0 ? i[e.hs_get(Y.building, u, Ae.lot)] : void 0;
    if (!c) continue;
    const h = c.x + c.w / 2, m = c.y + c.h / 2;
    d.push({
      gang: _,
      colour: e.hs_get(Y.gang, _, D.colour),
      block: c.block,
      lot: c.id,
      fx: Math.floor(h / (K / 5)),
      fy: Math.floor(m / (K / 5))
    });
  }
  const p = e.hs_count(F.blocksX), k = e.hs_count(F.blocksY);
  return {
    seed: n,
    w: p,
    h: k,
    standard: p === 40 && k === 32,
    blocks: s,
    lots: i,
    hq: d,
    cityHash: H(e.hs_city_hash()),
    structureHash: H(e.hs_structure_hash()),
    rngAfter: H(e.hs_count(F.rngLow) | e.hs_count(F.rngHigh) << 16),
    retries: e.hs_count(F.retries),
    status: e.hs_count(F.status),
    counts: {
      blocks: e.hs_count(F.blocks),
      merged: e.hs_count(F.merged),
      lots: e.hs_count(F.lots),
      // As generated, before the gangs turned fronts and offices (item 4).
      buildings: e.hs_count(F.buildings),
      typesUsed: e.hs_count(F.builtTypes),
      classes: kn.map((_, u) => e.hs_count(F.builtClassBase + u)),
      districts: wn.map((_, u) => e.hs_count(F.districtBase + u)),
      uses: ia.map((_, u) => e.hs_count(F.useBase + u))
    }
  };
}
function yn(e) {
  return {
    x: e.gx * K + Qe / 2 + Xe,
    y: e.gy * K + Qe / 2 + Xe,
    w: e.spanX * K - Qe - 2 * Xe,
    h: e.spanY * K - Qe - 2 * Xe
  };
}
function ua(e, n, o) {
  const r = Math.floor(n / K), a = Math.floor(o / K);
  if (r < 0 || a < 0 || r >= e.w || a >= e.h) return -1;
  let s = e.blocks[a * e.w + r];
  s.merged >= 0 && (s = e.blocks[s.merged]);
  for (const i of e.lots)
    if (i.block === s.id && n >= i.x && n <= i.x + i.w && o >= i.y && o <= i.y + i.h) return i.id;
  return -1;
}
const tn = ["en-GB", "de", "es", "fr"], _a = {
  title: "Hood Simulator",
  subtitle: "Saint Volstead, 1932",
  loading: "Loading the Ada core…",
  core_missing: "The Ada core did not load: {error}",
  plan: "City plan",
  street: "Street",
  new_game: "New game",
  debug: "Debug",
  feedback: "Feedback (F9)",
  sound_on: "Sound: on",
  sound_off: "Sound: off",
  turn_view: "Turn view",
  ng_title: "New game",
  ng_seed: "City seed",
  ng_size: "City size",
  ng_start: "Build the city",
  cancel: "Cancel",
  small: "Small",
  standard: "Standard",
  large: "Large",
  size_note: "{w} × {h} blocks",
  seed_bad: "A whole number from 0 to 4,294,967,295.",
  city_line: "Seed {seed} · {size} {w} × {h} · {lots} lots",
  card_none: "Click a building in the street or on the city plan.",
  card_class: "Class",
  card_district: "District",
  card_value: "Land value",
  card_squalor: "Squalor",
  card_block: "Block",
  card_plot: "Plot",
  card_storeys: "Storeys",
  card_faces: "Faces",
  card_close: "Close",
  card_hq: "Office of the {name} gang",
  later: "Step {n}",
  later_title: "Comes in step {n}",
  p_people: "People and hiring",
  p_orders: "Orders and crews",
  p_trams: "Movement and trams",
  p_police: "Fights and the police",
  p_money: "Money",
  p_rivals: "Rivals",
  p_reports: "Week reports",
  p_auto: "Auto",
  p_clock: "Week clock",
  p_inspect: "Inspect card",
  plan_key: "Blocks by district; lots by class; gang flags mark the offices.",
  view_help: "Drag to move · wheel or pinch to zoom · click a building or a person",
  d_title: "Debug",
  d_close: "Close",
  d_step1: "Step 1: page and core",
  d_step2: "Step 2: numbers",
  d_step3: "Step 3: the city",
  d_stamp: "Build",
  d_build_id: "Build id",
  d_state: "State hash",
  test_sound: "Test sound",
  crash_test: "Crash test",
  d_city: "City hash",
  d_structure: "Structure hash",
  d_rng: "Random state after the city",
  d_counts: "Blocks {b} ({m} merged) · lots {l} · buildings {n} · types {t} · plan retries {r}",
  d_ref: "1.2.91",
  d_match: "{n}/{m} values match the TypeScript build 1.2.91.",
  d_no_ref: "No 1.2.91 reference for this seed and size.",
  random_sum: "{n}/{m} values match the TypeScript build 1.2.91.",
  col_i: "#",
  col_main: "mulberry32",
  col_int: "int(0,99)",
  col_plan: "city-plan LCG",
  col_ref: "1.2.91",
  numbers_sum: "{n}/{m} checks give the expected value.",
  col_check: "check",
  col_ada: "Ada",
  col_exp: "expected",
  c1: "54 units (×256)",
  c2: "10.8 units = 54/5 (×256, rounded down)",
  c3: "distance (3, 4) (×256)",
  c4: "distance (1, 1) = √2 (×256)",
  c5: "sin 45° (×65536)",
  c6: "cos 0° (×65536)",
  c7: "atan2 (1, 1) (1/1024 turn)",
  c8: "cell of x = 54 units",
  c9: "cells in the Large city",
  grid_sum: "{w} × {h} = {n} cells (Large city, 44 × 35 blocks, cell 10.8 units).",
  grid_legend: "Top-left 3 × 3 blocks: light = block cell, dark = street cell.",
  world_sum: "Seed {seed} / Auto seed {auto}, Large ({w} × {h} cells): world hash {hash}.",
  report_title: "Feedback report",
  expected: "What did you expect?",
  download: "Download report",
  crash_title: "The game stopped",
  crash_text: "Error {code}: {name}.",
  reload: "Reload",
  err1: "an index outside its table",
  err2: "a value outside its range",
  err3: "an unexpected state",
  err4: "crash test",
  cls_empty: "Empty land",
  cls_residential: "Houses",
  cls_tenement: "Tenement",
  cls_commercial: "Commercial",
  cls_industrial: "Industrial",
  cls_municipal: "Municipal",
  cls_charity: "Charity",
  cls_illegal: "Illegal",
  dist_downtown: "Downtown",
  dist_commercial: "Commercial",
  dist_industrial: "Industrial",
  dist_residential: "Residential",
  dist_civic: "Civic",
  face_north: "north",
  face_east: "east",
  face_south: "south",
  face_west: "west",
  p_gangs: "Gangs",
  clock_line: "Week {w} · {day} {time}",
  launch: "Launch week",
  finish: "Finish week",
  pause: "Pause",
  speed: "Speed",
  speed_max: "Max",
  week_bar: "Week {w}: {pct} % done",
  planning: "Planning",
  game_over: "Your boss is gone: game over.",
  walking_now: "{n} walking",
  day0: "Monday",
  day1: "Tuesday",
  day2: "Wednesday",
  day3: "Thursday",
  day4: "Friday",
  g_title: "Gangs",
  g_player: "yours",
  g_rival: "rival (profile {p})",
  g_boss: "Boss",
  g_office: "Office",
  g_front: "Front",
  g_cash: "Cash",
  g_wages: "Wages last week",
  g_lt: "Lieutenant",
  g_crew: "Crew",
  g_pool: "Pool",
  g_manager: "Front manager",
  g_kit: "Pistols {p}, coupés {c} in the office · pistols {cp}, coupés {cc} with the crew",
  g_protects: "Protects {n} businesses",
  g_offers: "Offers you: {s}",
  g_name: "The {name} Gang",
  g_out: "eliminated",
  st_alliance: "alliance",
  st_peace: "peace",
  st_ceasefire: "ceasefire",
  st_aggression: "aggression",
  st_war: "war",
  pc_gang: "Gang",
  pc_none: "none",
  pc_where: "Where",
  pc_walking: "walking",
  pc_inside: "inside a building",
  pc_standing: "standing",
  pc_pay: "Pay",
  pc_demand: "Asks",
  pc_loyalty: "Loyalty",
  pc_attitude: "Hostility / fear",
  pc_skills: "Skills",
  pc_close: "Close",
  d_step4: "Step 4: people and the week",
  d_step5: "Step 5: orders",
  d_order_note: "Plays 1.2.91's scripted four weeks (seed 1932, Standard) on a fresh game, then starts this city again.",
  d_order_check: "Run order check",
  d_order_sum: "{n}/{m} checks pass · weeks ran in {ms} ms",
  m_menu: "Menu",
  m_continue: "Continue previous game",
  m_new: "New game",
  m_load: "Load game",
  m_tutorials: "Tutorials",
  m_hof: "Hall of Fame",
  m_leaderboard: "Leaderboard",
  m_how: "How to play",
  m_credits: "Credits",
  m_unassigned: "No step yet",
  m_out: "Not planned",
  m_this_session: "This browser session only",
  o_title: "Crews and orders",
  o_crew_time: "{used} of {cap} man-minutes booked ({men} men)",
  o_lt: "lieutenant",
  o_none: "None",
  o_orders: "Orders this week",
  o_new: "New order",
  o_demote: "Break up the crew",
  o_cars: "Cars: speedsters {s}, coupés {c}, trucks {t}",
  o_buy: "Buy a {name} ({cost})",
  o_buy_confirm: "Buy a {name} for {cost} and give it to {team}? Cash in the safe: {cash}.",
  o_pool: "The pool",
  o_last: "Last week's orders",
  o_again: "Give again",
  o_messages: "Messages this week",
  o_no_messages: "No messages yet.",
  o_pay_up: "Pay $10 more",
  o_pay_down: "Pay $10 less",
  o_to_pool: "To the pool",
  o_to_crew: "To {crew}",
  o_promote: "Make lieutenant",
  o_sack: "Sack",
  o_cancel: "Cancel the order",
  o_point: "a point",
  o_sites: "{n} sites",
  o_done_at: "done {day} {time}",
  o_block: "Block {n}",
  st_queued: "queued",
  st_travelling: "on the way",
  st_waiting: "waiting",
  st_executing: "at work",
  st_done: "done",
  st_failed: "failed",
  st_cancelled: "cancelled",
  job_title: "New order",
  job_close: "Close",
  job_crew: "Crew",
  job_kind: "Order",
  job_men: "Men",
  job_men_note: "at most {max}; the crew has {have}",
  job_amount: "Amount ($)",
  job_level: "Rate (% of the going rate)",
  job_business: "Business",
  job_front: "Front",
  job_front_pick: "Use the selected building",
  job_repeat: "Give it again every week",
  job_pick_point: "Click where the men should go.",
  job_pick_area: "Click buildings to add or remove them, or add the selected building's whole block.",
  job_pick_building: "Click a building in the street or on the city plan.",
  job_add: "Add the selected building",
  job_block: "Add its whole block",
  job_clear: "Clear the sites",
  job_remove: "Remove",
  job_estimate: "Estimate {time}",
  job_cost: "costs {cost}",
  job_no_time: "the crew has not got the time",
  job_issue: "Give the order",
  job_take_kept: "Keep the {n} sites he can manage",
  d_people: "People",
  d_minute1: "Random state after minute 1",
  role_boss: "Boss",
  role_lieutenant: "Lieutenant",
  role_hood: "Hood",
  role_accountant: "Accountant",
  role_lawyer: "Lawyer",
  role_citizen: "Citizen",
  role_owner: "Owner",
  role_police: "Police officer",
  role_firefighter: "Firefighter",
  role_policeChief: "Police chief",
  role_fbi: "FBI agent",
  role_fbiHead: "FBI head",
  role_judge: "Judge",
  role_da: "District attorney",
  role_mayor: "Mayor",
  role_reporter: "Reporter",
  role_clergy: "Clergy",
  role_snitch: "Snitch",
  sk_intelligence: "Intelligence",
  sk_organization: "Organisation",
  sk_business: "Business",
  sk_firearms: "Firearms",
  sk_fists: "Fists",
  sk_knives: "Knives",
  sk_arson: "Arson",
  sk_explosives: "Explosives",
  sk_intimidation: "Intimidation",
  sk_driving: "Driving",
  sk_stealth: "Stealth"
}, ma = {
  title: "Hood Simulator",
  subtitle: "Saint Volstead, 1932",
  loading: "Ada-Kern wird geladen …",
  core_missing: "Ada-Kern nicht geladen: {error}",
  plan: "Stadtplan",
  street: "Straße",
  new_game: "Neues Spiel",
  debug: "Debug",
  feedback: "Rückmeldung (F9)",
  sound_on: "Ton: an",
  sound_off: "Ton: aus",
  turn_view: "Ansicht drehen",
  ng_title: "Neues Spiel",
  ng_seed: "Stadt-Seed",
  ng_size: "Stadtgröße",
  ng_start: "Stadt bauen",
  cancel: "Abbrechen",
  small: "Klein",
  standard: "Standard",
  large: "Groß",
  size_note: "{w} × {h} Blöcke",
  seed_bad: "Eine ganze Zahl von 0 bis 4.294.967.295.",
  city_line: "Seed {seed} · {size} {w} × {h} · {lots} Grundstücke",
  card_none: "Klicke ein Gebäude auf der Straße oder im Stadtplan an.",
  card_class: "Art",
  card_district: "Viertel",
  card_value: "Bodenwert",
  card_squalor: "Verwahrlosung",
  card_block: "Block",
  card_plot: "Parzelle",
  card_storeys: "Stockwerke",
  card_faces: "Front nach",
  card_close: "Schließen",
  card_hq: "Büro der Bande {name}",
  later: "Schritt {n}",
  later_title: "Kommt in Schritt {n}",
  p_people: "Leute und Anheuern",
  p_orders: "Befehle und Trupps",
  p_trams: "Bewegung und Straßenbahnen",
  p_police: "Kämpfe und Polizei",
  p_money: "Geld",
  p_rivals: "Rivalen",
  p_reports: "Wochenberichte",
  p_auto: "Auto",
  p_clock: "Wochenuhr",
  p_inspect: "Infokarte",
  plan_key: "Blöcke nach Viertel; Grundstücke nach Klasse; Bandenflaggen markieren die Büros.",
  view_help: "Ziehen zum Bewegen · Rad oder Pinch zum Zoomen · Gebäude oder Person anklicken",
  d_title: "Debug",
  d_close: "Schließen",
  d_step1: "Schritt 1: Seite und Kern",
  d_step2: "Schritt 2: Zahlen",
  d_step3: "Schritt 3: die Stadt",
  d_stamp: "Build",
  d_build_id: "Build-ID",
  d_state: "Zustands-Hash",
  test_sound: "Ton testen",
  crash_test: "Absturztest",
  d_city: "Stadt-Hash",
  d_structure: "Struktur-Hash",
  d_rng: "Zufallszustand nach der Stadt",
  d_counts: "Blöcke {b} ({m} verbunden) · Grundstücke {l} · Gebäude {n} · Typen {t} · Plan-Wiederholungen {r}",
  d_ref: "1.2.91",
  d_match: "{n}/{m} Werte stimmen mit der TypeScript-Version 1.2.91 überein.",
  d_no_ref: "Keine 1.2.91-Referenz für diesen Seed und diese Größe.",
  random_sum: "{n}/{m} Werte stimmen mit der TypeScript-Version 1.2.91 überein.",
  col_i: "#",
  col_main: "mulberry32",
  col_int: "int(0,99)",
  col_plan: "Stadtplan-LCG",
  col_ref: "1.2.91",
  numbers_sum: "{n}/{m} Prüfungen ergeben den erwarteten Wert.",
  col_check: "Prüfung",
  col_ada: "Ada",
  col_exp: "erwartet",
  c1: "54 Einheiten (×256)",
  c2: "10,8 Einheiten = 54/5 (×256, abgerundet)",
  c3: "Abstand (3, 4) (×256)",
  c4: "Abstand (1, 1) = √2 (×256)",
  c5: "sin 45° (×65536)",
  c6: "cos 0° (×65536)",
  c7: "atan2 (1, 1) (1/1024 Umdrehung)",
  c8: "Zelle von x = 54 Einheiten",
  c9: "Zellen der großen Stadt",
  grid_sum: "{w} × {h} = {n} Zellen (große Stadt, 44 × 35 Blöcke, Zelle 10,8 Einheiten).",
  grid_legend: "Oben links 3 × 3 Blöcke: hell = Blockzelle, dunkel = Straßenzelle.",
  world_sum: "Seed {seed} / Auto-Seed {auto}, groß ({w} × {h} Zellen): Welt-Hash {hash}.",
  report_title: "Feedback-Bericht",
  expected: "Was hast du erwartet?",
  download: "Bericht herunterladen",
  crash_title: "Das Spiel wurde angehalten",
  crash_text: "Fehler {code}: {name}.",
  reload: "Neu laden",
  err1: "ein Index außerhalb seiner Tabelle",
  err2: "ein Wert außerhalb seines Bereichs",
  err3: "ein unerwarteter Zustand",
  err4: "Absturztest",
  cls_empty: "Brachland",
  cls_residential: "Wohnhäuser",
  cls_tenement: "Mietshaus",
  cls_commercial: "Gewerbe",
  cls_industrial: "Industrie",
  cls_municipal: "Städtisch",
  cls_charity: "Wohltätigkeit",
  cls_illegal: "Illegal",
  dist_downtown: "Innenstadt",
  dist_commercial: "Geschäftsviertel",
  dist_industrial: "Industrieviertel",
  dist_residential: "Wohnviertel",
  dist_civic: "Behördenviertel",
  face_north: "Norden",
  face_east: "Osten",
  face_south: "Süden",
  face_west: "Westen",
  p_gangs: "Banden",
  clock_line: "Woche {w} · {day} {time}",
  launch: "Woche starten",
  finish: "Woche beenden",
  pause: "Pause",
  speed: "Tempo",
  speed_max: "Max",
  week_bar: "Woche {w}: {pct} % vorbei",
  planning: "Planung",
  game_over: "Dein Boss ist weg: Spiel vorbei.",
  walking_now: "{n} unterwegs",
  day0: "Montag",
  day1: "Dienstag",
  day2: "Mittwoch",
  day3: "Donnerstag",
  day4: "Freitag",
  g_title: "Banden",
  g_player: "deine",
  g_rival: "Rivale (Profil {p})",
  g_boss: "Boss",
  g_office: "Büro",
  g_front: "Tarnfirma",
  g_cash: "Kasse",
  g_wages: "Löhne letzte Woche",
  g_lt: "Leutnant",
  g_crew: "Trupp",
  g_pool: "Reserve",
  g_manager: "Geschäftsführer",
  g_kit: "Pistolen {p}, Coupés {c} im Büro · Pistolen {cp}, Coupés {cc} beim Trupp",
  g_protects: "Schützt {n} Geschäfte",
  g_offers: "Bietet dir: {s}",
  g_name: "Bande {name}",
  g_out: "ausgeschaltet",
  st_alliance: "Bündnis",
  st_peace: "Frieden",
  st_ceasefire: "Waffenstillstand",
  st_aggression: "Aggression",
  st_war: "Krieg",
  pc_gang: "Bande",
  pc_none: "keine",
  pc_where: "Wo",
  pc_walking: "unterwegs",
  pc_inside: "in einem Gebäude",
  pc_standing: "steht",
  pc_pay: "Lohn",
  pc_demand: "Fordert",
  pc_loyalty: "Loyalität",
  pc_attitude: "Feindseligkeit / Furcht",
  pc_skills: "Fähigkeiten",
  pc_close: "Schließen",
  d_step4: "Schritt 4: Leute und die Woche",
  d_step5: "Schritt 5: Befehle",
  d_order_note: "Spielt die vier vorgegebenen Wochen von 1.2.91 (Seed 1932, Standard) in einem neuen Spiel und startet danach diese Stadt neu.",
  d_order_check: "Befehlsprüfung starten",
  d_order_sum: "{n}/{m} Prüfungen bestanden · Wochen in {ms} ms",
  m_menu: "Menü",
  m_continue: "Letztes Spiel fortsetzen",
  m_new: "Neues Spiel",
  m_load: "Spiel laden",
  m_tutorials: "Tutorials",
  m_hof: "Ruhmeshalle",
  m_leaderboard: "Bestenliste",
  m_how: "Spielanleitung",
  m_credits: "Mitwirkende",
  m_unassigned: "Noch kein Schritt",
  m_out: "Nicht geplant",
  m_this_session: "Nur in dieser Browsersitzung",
  o_title: "Trupps und Befehle",
  o_crew_time: "{used} von {cap} Mannminuten verplant ({men} Mann)",
  o_lt: "Leutnant",
  o_none: "Keine",
  o_orders: "Befehle dieser Woche",
  o_new: "Neuer Befehl",
  o_demote: "Trupp auflösen",
  o_cars: "Wagen: Speedster {s}, Coupés {c}, Lastwagen {t}",
  o_buy: "{name} kaufen ({cost})",
  o_buy_confirm: "Einen {name} für {cost} kaufen und {team} geben? Bargeld im Safe: {cash}.",
  o_pool: "Der Pool",
  o_last: "Befehle der letzten Woche",
  o_again: "Noch einmal geben",
  o_messages: "Meldungen dieser Woche",
  o_no_messages: "Noch keine Meldungen.",
  o_pay_up: "$10 mehr Lohn",
  o_pay_down: "$10 weniger Lohn",
  o_to_pool: "In den Pool",
  o_to_crew: "Zu {crew}",
  o_promote: "Zum Leutnant machen",
  o_sack: "Feuern",
  o_cancel: "Befehl zurücknehmen",
  o_point: "ein Punkt",
  o_sites: "{n} Orte",
  o_done_at: "fertig {day} {time}",
  o_block: "Block {n}",
  st_queued: "wartet",
  st_travelling: "unterwegs",
  st_waiting: "wartet ab",
  st_executing: "bei der Arbeit",
  st_done: "erledigt",
  st_failed: "gescheitert",
  st_cancelled: "zurückgenommen",
  job_title: "Neuer Befehl",
  job_close: "Schließen",
  job_crew: "Trupp",
  job_kind: "Befehl",
  job_men: "Männer",
  job_men_note: "höchstens {max}; der Trupp hat {have}",
  job_amount: "Betrag ($)",
  job_level: "Satz (% des üblichen)",
  job_business: "Geschäft",
  job_front: "Tarnung",
  job_front_pick: "Ausgewähltes Gebäude nehmen",
  job_repeat: "Jede Woche wieder geben",
  job_pick_point: "Klicke, wohin die Männer gehen sollen.",
  job_pick_area: "Klicke Gebäude zum Hinzufügen oder Entfernen, oder nimm den ganzen Block des ausgewählten Gebäudes.",
  job_pick_building: "Klicke ein Gebäude auf der Straße oder im Stadtplan.",
  job_add: "Ausgewähltes Gebäude hinzufügen",
  job_block: "Ganzen Block hinzufügen",
  job_clear: "Orte leeren",
  job_remove: "Entfernen",
  job_estimate: "Schätzung {time}",
  job_cost: "kostet {cost}",
  job_no_time: "der Trupp hat keine Zeit",
  job_issue: "Befehl geben",
  job_take_kept: "Die {n} Orte nehmen, die er schafft",
  d_people: "Leute",
  d_minute1: "Zufallszustand nach Minute 1",
  role_boss: "Boss",
  role_lieutenant: "Leutnant",
  role_hood: "Ganove",
  role_accountant: "Buchhalter",
  role_lawyer: "Anwalt",
  role_citizen: "Bürger",
  role_owner: "Inhaber",
  role_police: "Polizist",
  role_firefighter: "Feuerwehrmann",
  role_policeChief: "Polizeichef",
  role_fbi: "FBI-Agent",
  role_fbiHead: "FBI-Leiter",
  role_judge: "Richter",
  role_da: "Staatsanwalt",
  role_mayor: "Bürgermeister",
  role_reporter: "Reporter",
  role_clergy: "Geistlicher",
  role_snitch: "Spitzel",
  sk_intelligence: "Intelligenz",
  sk_organization: "Organisation",
  sk_business: "Geschäft",
  sk_firearms: "Schusswaffen",
  sk_fists: "Fäuste",
  sk_knives: "Messer",
  sk_arson: "Brandstiftung",
  sk_explosives: "Sprengstoff",
  sk_intimidation: "Einschüchterung",
  sk_driving: "Fahren",
  sk_stealth: "Heimlichkeit"
}, ha = {
  title: "Hood Simulator",
  subtitle: "Saint Volstead, 1932",
  loading: "Cargando el núcleo Ada…",
  core_missing: "El núcleo Ada no se cargó: {error}",
  plan: "Plano",
  street: "Calle",
  new_game: "Partida nueva",
  debug: "Depurar",
  feedback: "Comentarios (F9)",
  sound_on: "Sonido: sí",
  sound_off: "Sonido: no",
  turn_view: "Girar vista",
  ng_title: "Partida nueva",
  ng_seed: "Semilla de la ciudad",
  ng_size: "Tamaño",
  ng_start: "Construir la ciudad",
  cancel: "Cancelar",
  small: "Pequeña",
  standard: "Estándar",
  large: "Grande",
  size_note: "{w} × {h} manzanas",
  seed_bad: "Un número entero de 0 a 4.294.967.295.",
  city_line: "Semilla {seed} · {size} {w} × {h} · {lots} solares",
  card_none: "Haz clic en un edificio de la calle o del plano.",
  card_class: "Clase",
  card_district: "Distrito",
  card_value: "Valor del suelo",
  card_squalor: "Miseria",
  card_block: "Manzana",
  card_plot: "Parcela",
  card_storeys: "Plantas",
  card_faces: "Fachada al",
  card_close: "Cerrar",
  card_hq: "Oficina de la banda {name}",
  later: "Paso {n}",
  later_title: "Llega en el paso {n}",
  p_people: "Gente y contratación",
  p_orders: "Órdenes y cuadrillas",
  p_trams: "Movimiento y tranvías",
  p_police: "Peleas y policía",
  p_money: "Dinero",
  p_rivals: "Rivales",
  p_reports: "Informes semanales",
  p_auto: "Auto",
  p_clock: "Reloj semanal",
  p_inspect: "Ficha",
  plan_key: "Manzanas por distrito; solares por clase; las banderas marcan las oficinas.",
  view_help: "Arrastra para mover · rueda o pellizco para zoom · haz clic en un edificio o una persona",
  d_title: "Depurar",
  d_close: "Cerrar",
  d_step1: "Paso 1: página y núcleo",
  d_step2: "Paso 2: números",
  d_step3: "Paso 3: la ciudad",
  d_stamp: "Compilación",
  d_build_id: "Id de compilación",
  d_state: "Hash de estado",
  test_sound: "Probar sonido",
  crash_test: "Prueba de fallo",
  d_city: "Hash de la ciudad",
  d_structure: "Hash de la estructura",
  d_rng: "Estado aleatorio tras la ciudad",
  d_counts: "Manzanas {b} ({m} unidas) · solares {l} · edificios {n} · tipos {t} · reintentos del plano {r}",
  d_ref: "1.2.91",
  d_match: "{n}/{m} valores coinciden con la versión TypeScript 1.2.91.",
  d_no_ref: "No hay referencia 1.2.91 para esta semilla y tamaño.",
  random_sum: "{n}/{m} valores coinciden con la versión TypeScript 1.2.91.",
  col_i: "#",
  col_main: "mulberry32",
  col_int: "int(0,99)",
  col_plan: "LCG del plano",
  col_ref: "1.2.91",
  numbers_sum: "{n}/{m} comprobaciones dan el valor esperado.",
  col_check: "comprobación",
  col_ada: "Ada",
  col_exp: "esperado",
  c1: "54 unidades (×256)",
  c2: "10,8 unidades = 54/5 (×256, redondeado hacia abajo)",
  c3: "distancia (3, 4) (×256)",
  c4: "distancia (1, 1) = √2 (×256)",
  c5: "sen 45° (×65536)",
  c6: "cos 0° (×65536)",
  c7: "atan2 (1, 1) (1/1024 de vuelta)",
  c8: "celda de x = 54 unidades",
  c9: "celdas de la ciudad grande",
  grid_sum: "{w} × {h} = {n} celdas (ciudad grande, 44 × 35 manzanas, celda de 10,8 unidades).",
  grid_legend: "Arriba a la izquierda 3 × 3 manzanas: claro = celda de manzana, oscuro = celda de calle.",
  world_sum: "Semilla {seed} / semilla Auto {auto}, grande ({w} × {h} celdas): hash del mundo {hash}.",
  report_title: "Informe de comentarios",
  expected: "¿Qué esperabas?",
  download: "Descargar informe",
  crash_title: "El juego se detuvo",
  crash_text: "Error {code}: {name}.",
  reload: "Recargar",
  err1: "un índice fuera de su tabla",
  err2: "un valor fuera de su rango",
  err3: "un estado inesperado",
  err4: "prueba de fallo",
  cls_empty: "Solar vacío",
  cls_residential: "Viviendas",
  cls_tenement: "Casa de vecinos",
  cls_commercial: "Comercio",
  cls_industrial: "Industria",
  cls_municipal: "Municipal",
  cls_charity: "Beneficencia",
  cls_illegal: "Ilegal",
  dist_downtown: "Centro",
  dist_commercial: "Comercial",
  dist_industrial: "Industrial",
  dist_residential: "Residencial",
  dist_civic: "Cívico",
  face_north: "norte",
  face_east: "este",
  face_south: "sur",
  face_west: "oeste",
  p_gangs: "Bandas",
  clock_line: "Semana {w} · {day} {time}",
  launch: "Empezar la semana",
  finish: "Terminar la semana",
  pause: "Pausa",
  speed: "Velocidad",
  speed_max: "Máx",
  week_bar: "Semana {w}: {pct} % hecho",
  planning: "Planificación",
  game_over: "Tu jefe ya no está: fin de la partida.",
  walking_now: "{n} caminando",
  day0: "lunes",
  day1: "martes",
  day2: "miércoles",
  day3: "jueves",
  day4: "viernes",
  g_title: "Bandas",
  g_player: "la tuya",
  g_rival: "rival (perfil {p})",
  g_boss: "Jefe",
  g_office: "Oficina",
  g_front: "Tapadera",
  g_cash: "Caja",
  g_wages: "Sueldos de la semana pasada",
  g_lt: "Lugarteniente",
  g_crew: "Cuadrilla",
  g_pool: "Reserva",
  g_manager: "Encargado",
  g_kit: "Pistolas {p}, cupés {c} en la oficina · pistolas {cp}, cupés {cc} con la cuadrilla",
  g_protects: "Protege {n} negocios",
  g_offers: "Te ofrece: {s}",
  g_name: "Banda {name}",
  g_out: "eliminada",
  st_alliance: "alianza",
  st_peace: "paz",
  st_ceasefire: "alto el fuego",
  st_aggression: "agresión",
  st_war: "guerra",
  pc_gang: "Banda",
  pc_none: "ninguna",
  pc_where: "Dónde",
  pc_walking: "caminando",
  pc_inside: "dentro de un edificio",
  pc_standing: "parado",
  pc_pay: "Sueldo",
  pc_demand: "Pide",
  pc_loyalty: "Lealtad",
  pc_attitude: "Hostilidad / miedo",
  pc_skills: "Habilidades",
  pc_close: "Cerrar",
  d_step4: "Paso 4: gente y la semana",
  d_step5: "Paso 5: órdenes",
  d_order_note: "Juega las cuatro semanas guionizadas de 1.2.91 (semilla 1932, Estándar) en una partida nueva y luego vuelve a empezar esta ciudad.",
  d_order_check: "Comprobar órdenes",
  d_order_sum: "{n}/{m} comprobaciones correctas · semanas en {ms} ms",
  m_menu: "Menú",
  m_continue: "Continuar la partida anterior",
  m_new: "Nueva partida",
  m_load: "Cargar partida",
  m_tutorials: "Tutoriales",
  m_hof: "Salón de la fama",
  m_leaderboard: "Clasificación",
  m_how: "Cómo jugar",
  m_credits: "Créditos",
  m_unassigned: "Aún sin paso",
  m_out: "No previsto",
  m_this_session: "Solo en esta sesión del navegador",
  o_title: "Cuadrillas y órdenes",
  o_crew_time: "{used} de {cap} minutos-hombre reservados ({men} hombres)",
  o_lt: "lugarteniente",
  o_none: "Ninguna",
  o_orders: "Órdenes de esta semana",
  o_new: "Nueva orden",
  o_demote: "Disolver la cuadrilla",
  o_cars: "Coches: deportivos {s}, cupés {c}, camiones {t}",
  o_buy: "Comprar un {name} ({cost})",
  o_buy_confirm: "¿Comprar un {name} por {cost} y dárselo a {team}? Dinero en la caja fuerte: {cash}.",
  o_pool: "La reserva",
  o_last: "Órdenes de la semana pasada",
  o_again: "Dar otra vez",
  o_messages: "Mensajes de esta semana",
  o_no_messages: "Aún no hay mensajes.",
  o_pay_up: "$10 más de paga",
  o_pay_down: "$10 menos de paga",
  o_to_pool: "A la reserva",
  o_to_crew: "A {crew}",
  o_promote: "Hacer lugarteniente",
  o_sack: "Despedir",
  o_cancel: "Cancelar la orden",
  o_point: "un punto",
  o_sites: "{n} sitios",
  o_done_at: "hecho {day} {time}",
  o_block: "Manzana {n}",
  st_queued: "en cola",
  st_travelling: "en camino",
  st_waiting: "esperando",
  st_executing: "trabajando",
  st_done: "hecho",
  st_failed: "fallida",
  st_cancelled: "cancelada",
  job_title: "Nueva orden",
  job_close: "Cerrar",
  job_crew: "Cuadrilla",
  job_kind: "Orden",
  job_men: "Hombres",
  job_men_note: "como mucho {max}; la cuadrilla tiene {have}",
  job_amount: "Cantidad ($)",
  job_level: "Tarifa (% de la habitual)",
  job_business: "Negocio",
  job_front: "Tapadera",
  job_front_pick: "Usar el edificio elegido",
  job_repeat: "Darla otra vez cada semana",
  job_pick_point: "Haz clic donde deben ir los hombres.",
  job_pick_area: "Haz clic en edificios para añadirlos o quitarlos, o añade la manzana entera del edificio elegido.",
  job_pick_building: "Haz clic en un edificio de la calle o del plano.",
  job_add: "Añadir el edificio elegido",
  job_block: "Añadir su manzana entera",
  job_clear: "Vaciar los sitios",
  job_remove: "Quitar",
  job_estimate: "Estimación {time}",
  job_cost: "cuesta {cost}",
  job_no_time: "la cuadrilla no tiene tiempo",
  job_issue: "Dar la orden",
  job_take_kept: "Quedarse con los {n} sitios que puede hacer",
  d_people: "Gente",
  d_minute1: "Estado aleatorio tras el minuto 1",
  role_boss: "Jefe",
  role_lieutenant: "Lugarteniente",
  role_hood: "Matón",
  role_accountant: "Contable",
  role_lawyer: "Abogado",
  role_citizen: "Ciudadano",
  role_owner: "Dueño",
  role_police: "Policía",
  role_firefighter: "Bombero",
  role_policeChief: "Jefe de policía",
  role_fbi: "Agente del FBI",
  role_fbiHead: "Jefe del FBI",
  role_judge: "Juez",
  role_da: "Fiscal",
  role_mayor: "Alcalde",
  role_reporter: "Reportero",
  role_clergy: "Clérigo",
  role_snitch: "Soplón",
  sk_intelligence: "Inteligencia",
  sk_organization: "Organización",
  sk_business: "Negocios",
  sk_firearms: "Armas de fuego",
  sk_fists: "Puños",
  sk_knives: "Cuchillos",
  sk_arson: "Incendios",
  sk_explosives: "Explosivos",
  sk_intimidation: "Intimidación",
  sk_driving: "Conducción",
  sk_stealth: "Sigilo"
}, pa = {
  title: "Hood Simulator",
  subtitle: "Saint Volstead, 1932",
  loading: "Chargement du noyau Ada…",
  core_missing: "Le noyau Ada n'a pas été chargé : {error}",
  plan: "Plan de la ville",
  street: "Rue",
  new_game: "Nouvelle partie",
  debug: "Débogage",
  feedback: "Retour (F9)",
  sound_on: "Son : activé",
  sound_off: "Son : coupé",
  turn_view: "Tourner la vue",
  ng_title: "Nouvelle partie",
  ng_seed: "Graine de la ville",
  ng_size: "Taille",
  ng_start: "Construire la ville",
  cancel: "Annuler",
  small: "Petite",
  standard: "Standard",
  large: "Grande",
  size_note: "{w} × {h} pâtés",
  seed_bad: "Un nombre entier de 0 à 4 294 967 295.",
  city_line: "Graine {seed} · {size} {w} × {h} · {lots} parcelles",
  card_none: "Cliquez sur un bâtiment dans la rue ou sur le plan.",
  card_class: "Catégorie",
  card_district: "Quartier",
  card_value: "Valeur du terrain",
  card_squalor: "Misère",
  card_block: "Pâté",
  card_plot: "Parcelle",
  card_storeys: "Étages",
  card_faces: "Façade au",
  card_close: "Fermer",
  card_hq: "Bureau du gang {name}",
  later: "Étape {n}",
  later_title: "Arrive à l'étape {n}",
  p_people: "Gens et recrutement",
  p_orders: "Ordres et équipes",
  p_trams: "Déplacements et tramways",
  p_police: "Combats et police",
  p_money: "Argent",
  p_rivals: "Rivaux",
  p_reports: "Rapports de la semaine",
  p_auto: "Auto",
  p_clock: "Horloge de la semaine",
  p_inspect: "Fiche",
  plan_key: "Pâtés par quartier ; parcelles par classe ; les drapeaux marquent les bureaux.",
  view_help: "Glisser pour déplacer · molette ou pincement pour zoomer · cliquer un bâtiment ou une personne",
  d_title: "Débogage",
  d_close: "Fermer",
  d_step1: "Étape 1 : page et noyau",
  d_step2: "Étape 2 : nombres",
  d_step3: "Étape 3 : la ville",
  d_stamp: "Build",
  d_build_id: "Id de build",
  d_state: "Hash d'état",
  test_sound: "Tester le son",
  crash_test: "Test de plantage",
  d_city: "Hash de la ville",
  d_structure: "Hash de la structure",
  d_rng: "État aléatoire après la ville",
  d_counts: "Pâtés {b} ({m} réunis) · parcelles {l} · bâtiments {n} · types {t} · reprises du plan {r}",
  d_ref: "1.2.91",
  d_match: "{n}/{m} valeurs identiques à la version TypeScript 1.2.91.",
  d_no_ref: "Pas de référence 1.2.91 pour cette graine et cette taille.",
  random_sum: "{n}/{m} valeurs identiques à la version TypeScript 1.2.91.",
  col_i: "#",
  col_main: "mulberry32",
  col_int: "int(0,99)",
  col_plan: "LCG du plan",
  col_ref: "1.2.91",
  numbers_sum: "{n}/{m} vérifications donnent la valeur attendue.",
  col_check: "vérification",
  col_ada: "Ada",
  col_exp: "attendu",
  c1: "54 unités (×256)",
  c2: "10,8 unités = 54/5 (×256, arrondi par défaut)",
  c3: "distance (3, 4) (×256)",
  c4: "distance (1, 1) = √2 (×256)",
  c5: "sin 45° (×65536)",
  c6: "cos 0° (×65536)",
  c7: "atan2 (1, 1) (1/1024 de tour)",
  c8: "cellule de x = 54 unités",
  c9: "cellules de la grande ville",
  grid_sum: "{w} × {h} = {n} cellules (grande ville, 44 × 35 pâtés, cellule de 10,8 unités).",
  grid_legend: "En haut à gauche 3 × 3 pâtés : clair = cellule de pâté, sombre = cellule de rue.",
  world_sum: "Graine {seed} / graine Auto {auto}, grande ({w} × {h} cellules) : hash du monde {hash}.",
  report_title: "Rapport de retour",
  expected: "Qu'attendiez-vous ?",
  download: "Télécharger le rapport",
  crash_title: "Le jeu s'est arrêté",
  crash_text: "Erreur {code} : {name}.",
  reload: "Recharger",
  err1: "un index hors de sa table",
  err2: "une valeur hors de son domaine",
  err3: "un état inattendu",
  err4: "test de plantage",
  cls_empty: "Terrain vague",
  cls_residential: "Maisons",
  cls_tenement: "Immeuble locatif",
  cls_commercial: "Commerce",
  cls_industrial: "Industrie",
  cls_municipal: "Municipal",
  cls_charity: "Bienfaisance",
  cls_illegal: "Illégal",
  dist_downtown: "Centre-ville",
  dist_commercial: "Commerçant",
  dist_industrial: "Industriel",
  dist_residential: "Résidentiel",
  dist_civic: "Administratif",
  face_north: "nord",
  face_east: "est",
  face_south: "sud",
  face_west: "ouest",
  p_gangs: "Gangs",
  clock_line: "Semaine {w} · {day} {time}",
  launch: "Lancer la semaine",
  finish: "Finir la semaine",
  pause: "Pause",
  speed: "Vitesse",
  speed_max: "Max",
  week_bar: "Semaine {w} : {pct} % écoulés",
  planning: "Planification",
  game_over: "Votre chef a disparu : partie terminée.",
  walking_now: "{n} en marche",
  day0: "lundi",
  day1: "mardi",
  day2: "mercredi",
  day3: "jeudi",
  day4: "vendredi",
  g_title: "Gangs",
  g_player: "le vôtre",
  g_rival: "rival (profil {p})",
  g_boss: "Chef",
  g_office: "Bureau",
  g_front: "Façade",
  g_cash: "Caisse",
  g_wages: "Salaires de la semaine passée",
  g_lt: "Lieutenant",
  g_crew: "Équipe",
  g_pool: "Réserve",
  g_manager: "Gérant",
  g_kit: "Pistolets {p}, coupés {c} au bureau · pistolets {cp}, coupés {cc} avec l’équipe",
  g_protects: "Protège {n} commerces",
  g_offers: "Vous propose : {s}",
  g_name: "Gang {name}",
  g_out: "éliminé",
  st_alliance: "alliance",
  st_peace: "paix",
  st_ceasefire: "cessez-le-feu",
  st_aggression: "agression",
  st_war: "guerre",
  pc_gang: "Gang",
  pc_none: "aucun",
  pc_where: "Où",
  pc_walking: "en marche",
  pc_inside: "dans un bâtiment",
  pc_standing: "immobile",
  pc_pay: "Salaire",
  pc_demand: "Demande",
  pc_loyalty: "Loyauté",
  pc_attitude: "Hostilité / peur",
  pc_skills: "Compétences",
  pc_close: "Fermer",
  d_step4: "Étape 4 : les gens et la semaine",
  d_step5: "Étape 5 : ordres",
  d_order_note: "Joue les quatre semaines scénarisées de 1.2.91 (graine 1932, Standard) dans une nouvelle partie, puis relance cette ville.",
  d_order_check: "Vérifier les ordres",
  d_order_sum: "{n}/{m} vérifications réussies · semaines en {ms} ms",
  m_menu: "Menu",
  m_continue: "Reprendre la partie précédente",
  m_new: "Nouvelle partie",
  m_load: "Charger une partie",
  m_tutorials: "Tutoriels",
  m_hof: "Panthéon",
  m_leaderboard: "Classement",
  m_how: "Comment jouer",
  m_credits: "Crédits",
  m_unassigned: "Pas encore d'étape",
  m_out: "Non prévu",
  m_this_session: "Seulement pendant cette session du navigateur",
  o_title: "Équipes et ordres",
  o_crew_time: "{used} sur {cap} minutes-homme réservées ({men} hommes)",
  o_lt: "lieutenant",
  o_none: "Aucun",
  o_orders: "Ordres de la semaine",
  o_new: "Nouvel ordre",
  o_demote: "Dissoudre l'équipe",
  o_cars: "Voitures : sport {s}, coupés {c}, camionnettes {t}",
  o_buy: "Acheter : {name} ({cost})",
  o_buy_confirm: "Acheter : {name} pour {cost}, pour {team} ? Argent dans le coffre : {cash}.",
  o_pool: "La réserve",
  o_last: "Ordres de la semaine dernière",
  o_again: "Redonner",
  o_messages: "Messages de la semaine",
  o_no_messages: "Pas encore de messages.",
  o_pay_up: "$10 de plus",
  o_pay_down: "$10 de moins",
  o_to_pool: "Vers la réserve",
  o_to_crew: "Vers {crew}",
  o_promote: "Nommer lieutenant",
  o_sack: "Renvoyer",
  o_cancel: "Annuler l'ordre",
  o_point: "un point",
  o_sites: "{n} lieux",
  o_done_at: "fini {day} {time}",
  o_block: "Pâté {n}",
  st_queued: "en attente",
  st_travelling: "en route",
  st_waiting: "patiente",
  st_executing: "au travail",
  st_done: "fait",
  st_failed: "échoué",
  st_cancelled: "annulé",
  job_title: "Nouvel ordre",
  job_close: "Fermer",
  job_crew: "Équipe",
  job_kind: "Ordre",
  job_men: "Hommes",
  job_men_note: "au plus {max} ; l'équipe en a {have}",
  job_amount: "Montant ($)",
  job_level: "Taux (% du tarif courant)",
  job_business: "Affaire",
  job_front: "Couverture",
  job_front_pick: "Prendre le bâtiment choisi",
  job_repeat: "Le redonner chaque semaine",
  job_pick_point: "Cliquez où les hommes doivent aller.",
  job_pick_area: "Cliquez des bâtiments pour les ajouter ou les retirer, ou ajoutez tout le pâté du bâtiment choisi.",
  job_pick_building: "Cliquez un bâtiment dans la rue ou sur le plan.",
  job_add: "Ajouter le bâtiment choisi",
  job_block: "Ajouter tout son pâté",
  job_clear: "Vider les lieux",
  job_remove: "Retirer",
  job_estimate: "Estimation {time}",
  job_cost: "coûte {cost}",
  job_no_time: "l'équipe n'a pas le temps",
  job_issue: "Donner l'ordre",
  job_take_kept: "Garder les {n} lieux qu'il peut faire",
  d_people: "Gens",
  d_minute1: "État aléatoire après la minute 1",
  role_boss: "Chef",
  role_lieutenant: "Lieutenant",
  role_hood: "Truand",
  role_accountant: "Comptable",
  role_lawyer: "Avocat",
  role_citizen: "Citoyen",
  role_owner: "Propriétaire",
  role_police: "Policier",
  role_firefighter: "Pompier",
  role_policeChief: "Chef de la police",
  role_fbi: "Agent du FBI",
  role_fbiHead: "Chef du FBI",
  role_judge: "Juge",
  role_da: "Procureur",
  role_mayor: "Maire",
  role_reporter: "Reporter",
  role_clergy: "Ecclésiastique",
  role_snitch: "Indic",
  sk_intelligence: "Intelligence",
  sk_organization: "Organisation",
  sk_business: "Affaires",
  sk_firearms: "Armes à feu",
  sk_fists: "Poings",
  sk_knives: "Couteaux",
  sk_arson: "Incendie",
  sk_explosives: "Explosifs",
  sk_intimidation: "Intimidation",
  sk_driving: "Conduite",
  sk_stealth: "Discrétion"
}, ga = { "en-GB": _a, de: ma, es: ha, fr: pa };
function Pt(e, n, o = {}) {
  return ga[e][n].replace(/\{(\w+)\}/g, (r, a) => String(o[a] ?? ""));
}
const fa = performance.now(), Yt = 500, xt = () => Math.round(performance.now() - fa), ot = [], rt = [], st = [];
let En = 0, vn = 0;
function z(e, n) {
  ot.length >= Yt && (ot.shift(), En++), ot.push({ t_ms: xt(), action: e, ...n === void 0 ? {} : { detail: n } });
}
function Ce(e, n) {
  rt.length >= Yt && (rt.shift(), vn++), rt.push({ t_ms: xt(), event: e, ...n === void 0 ? {} : { detail: n } });
}
function ze(e, n, o = {}) {
  st.length >= Yt && st.shift(), st.push({ t_ms: xt(), kind: e, message: n, ...o });
}
window.addEventListener("error", (e) => ze("javascript", String(e.message), { file: e.filename, line: e.lineno }));
window.addEventListener("unhandledrejection", (e) => ze("javascript", String(e.reason)));
function nn(e, n, o) {
  const r = {
    schema: "poncelet-report",
    schema_version: 1,
    kind: e,
    stamp: o.stamp,
    created: (/* @__PURE__ */ new Date()).toISOString(),
    seeds: o.seeds,
    test_key: null,
    expected: n,
    state_hash: o.stateHash,
    action_log: ot,
    actions_dropped: En,
    events: rt,
    events_dropped: vn,
    errors: st,
    environment: {
      user_agent: navigator.userAgent,
      browser_language: navigator.language,
      page_language: o.lang,
      viewport: [innerWidth, innerHeight],
      device_pixel_ratio: devicePixelRatio,
      reduced_motion: o.reducedMotion,
      sound: o.sound ? "on" : "off",
      url: location.href
    },
    custom: o.custom
  }, a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" })), a.download = `hood-report-${o.stamp.split(" ")[1] ?? "dev"}-${Date.now()}.json`, document.body.appendChild(a), a.click(), a.remove(), setTimeout(() => URL.revokeObjectURL(a.href), 1e3), z("report_downloaded", e);
}
let xe = null;
function se(e, n = 523.25) {
  if (!e) return;
  xe ??= new AudioContext();
  const o = xe.createOscillator(), r = xe.createGain(), a = xe.currentTime;
  o.type = "sine", o.frequency.value = n, r.gain.setValueAtTime(0, a), r.gain.linearRampToValueAtTime(0.05, a + 0.02), r.gain.exponentialRampToValueAtTime(1e-4, a + 0.3), o.connect(r).connect(xe.destination), o.start(a), o.stop(a + 0.35);
}
function kt(e, n) {
  try {
    return localStorage.getItem(e) ?? n;
  } catch {
    return n;
  }
}
function yt(e, n) {
  try {
    localStorage.setItem(e, n);
  } catch {
  }
}
const ba = 0.55, wa = 11, an = 1.5, Re = 900, ka = 240, Rt = Math.SQRT2 * Math.tan(Math.PI / 6), lt = Math.hypot(1, Rt, 1), Sn = Rt / lt;
function Ot(e) {
  return ka / e;
}
function ya(e) {
  const n = e ? -1 : 1;
  return [n / lt, Rt / lt, n / lt];
}
function Ea(e) {
  return Math.min(wa, Math.max(ba, e));
}
function va(e, n, o, r) {
  const a = Ot(e.zoom), s = a * n, i = a * Math.SQRT1_2 / (2 * Sn) + s * Math.SQRT1_2 / 2, d = (p, k) => k - i < i ? k / 2 : Math.min(k - i, Math.max(i, p));
  return { ...e, x: d(e.x, o), z: d(e.z, r) };
}
function Sa(e, n, o, r) {
  const a = Ot(e.zoom) / r, s = e.turned ? -1 : 1, i = -n * a, d = o * a / Sn;
  return {
    ...e,
    x: e.x + (i * s - d * s) * Math.SQRT1_2,
    z: e.z + (-i * s - d * s) * Math.SQRT1_2
  };
}
const ct = ["#5d5240", "#c49a6c", "#9b5a48", "#5f8fa8", "#7c7a74", "#e0d9c6", "#a08cc0", "#7a3b3b"], on = ["#8a8478", "#4f6e3a", "#9b9688", "#a99f8a", "#47474a", "#2e4f66"], pe = ["#c0392b", "#2e8b57", "#2f5fb3", "#d9822b"], Ca = "#3a3937", rn = 2830392, sn = 4.2, me = 0.3, ln = 0.8, le = K / 5, Et = 1.8, cn = 0.9, dn = [4.4, 1.9, 1.5], Na = [6.5, 2.3, 2.6], La = [11, 2.4, 3.2], Ma = [[4, 1.8, 1.3], [4.4, 1.9, 1.5], [6.5, 2.3, 2.6]], un = ["#2b2b2b", "#5a2a27", "#2f3e57", "#44513a", "#6b6155", "#8a7f6a", "#3d3d45", "#7a6040"], Fa = "#5b4a35", Pa = "#9b5143", Aa = [
  "#f1d58f",
  "#f1d58f",
  "#f1d58f",
  "#d8d0b8",
  "#d8d0b8",
  "#b9ab8f",
  "#8c6a46",
  "#1f3f8f",
  "#c0392b",
  "#14286a",
  "#111111",
  "#111111",
  "#6b3f8f",
  "#6b3f8f",
  "#6b3f8f",
  "#e5c84a",
  "#f4f0e6",
  "#6f8f6a"
];
class Ta {
  renderer;
  scene = new C.Scene();
  camera = new C.OrthographicCamera(-1, 1, 1, -1, 1, 4e3);
  city = null;
  group = new C.Group();
  buildings = null;
  lotOfInstance = [];
  outline;
  walkers = null;
  cars = null;
  fleet = null;
  trams = null;
  personOfInstance = [];
  gangColour = [0, 0, 1, 2, 3];
  ring;
  markers = null;
  raycaster = new C.Raycaster();
  view = { x: 0, z: 0, zoom: an, turned: !1 };
  frame = 0;
  constructor(n) {
    this.renderer = new C.WebGLRenderer({ canvas: n, antialias: !0 }), this.renderer.setPixelRatio(Math.min(2, devicePixelRatio)), this.scene.background = new C.Color(rn), this.scene.fog = new C.Fog(rn, Re + 300, Re + 2600), this.scene.add(new C.HemisphereLight(15262420, 3814184, 1.6));
    const o = new C.DirectionalLight(16773852, 1.8);
    o.position.set(-300, 600, -150), this.scene.add(o), this.scene.add(this.group), this.outline = new C.LineSegments(
      new C.EdgesGeometry(new C.BoxGeometry(1, 1, 1)),
      new C.LineBasicMaterial({ color: 16769674 })
    ), this.outline.visible = !1, this.scene.add(this.outline), this.ring = new C.Mesh(new C.RingGeometry(1.4, 2.2, 24), new C.MeshBasicMaterial({ color: 16769674, side: C.DoubleSide })), this.ring.rotation.x = -Math.PI / 2, this.ring.visible = !1, this.scene.add(this.ring);
  }
  setCity(n) {
    const o = !!this.city && this.city.seed === n.seed && this.city.w === n.w && this.city.h === n.h;
    this.city = n;
    for (const u of [...this.group.children])
      this.group.remove(u), u instanceof C.Mesh && (u.geometry.dispose(), u.material.dispose());
    const r = n.w * K, a = n.h * K, s = new C.Mesh(
      new C.PlaneGeometry(r + 400, a + 400),
      new C.MeshLambertMaterial({ color: Ca })
    );
    s.rotation.x = -Math.PI / 2, s.position.set(r / 2, 0, a / 2), this.group.add(s);
    const i = n.blocks.filter((u) => u.merged < 0), d = new C.InstancedMesh(new C.BoxGeometry(1, 1, 1), new C.MeshLambertMaterial(), i.length), p = new C.Matrix4(), k = new C.Color();
    i.forEach((u, c) => {
      const h = yn(u), N = u.use === 4 || u.use === 5 ? 0.05 : me;
      p.makeScale(h.w, N, h.h).setPosition(h.x + h.w / 2, N / 2, h.y + h.h / 2), d.setMatrixAt(c, p), d.setColorAt(c, k.set(on[u.use] ?? on[0]));
    }), this.group.add(d), this.lotOfInstance = n.lots.map((u) => u.id);
    const _ = new C.InstancedMesh(new C.BoxGeometry(1, 1, 1), new C.MeshLambertMaterial(), n.lots.length);
    n.lots.forEach((u, c) => {
      const m = u.cls === 0 ? 0.25 : Math.max(1, u.storeys) * sn, N = Math.max(0.5, u.w - 2 * ln), g = Math.max(0.5, u.h - 2 * ln);
      p.makeScale(N, m, g).setPosition(u.x + u.w / 2, me + m / 2, u.y + u.h / 2), _.setMatrixAt(c, p), _.setColorAt(c, k.set(ct[u.cls] ?? ct[0]));
    }), this.buildings = _, this.group.add(_);
    for (const u of n.hq) {
      const c = new C.MeshLambertMaterial({ color: pe[u.colour % 4] }), h = new C.Mesh(new C.CylinderGeometry(0.6, 0.6, 40, 8), c);
      h.position.set(u.fx * le + le / 2, 20, u.fy * le + le / 2), this.group.add(h);
      const m = new C.Mesh(new C.BoxGeometry(12, 7, 0.4), c.clone());
      m.position.set(u.fx * le + le / 2 + 6.5, 36, u.fy * le + le / 2), this.group.add(m);
    }
    this.walkers = null, this.cars = this.fleet = this.trams = null, this.ring.visible = !1, this.outline.visible = !1, o || (this.view = { x: r / 2, z: a / 2, zoom: an, turned: !1 }), this.update();
  }
  /** Item 5: pins over order sites (metres; the job card's in gold, given orders in the gang's colour). */
  setMarkers(n) {
    if (this.markers && (this.scene.remove(this.markers), this.markers.geometry.dispose(), this.markers.material.dispose(), this.markers = null), n.length) {
      const o = new C.InstancedMesh(new C.ConeGeometry(2.2, 7, 10).rotateX(Math.PI), new C.MeshBasicMaterial(), n.length), r = new C.Matrix4(), a = new C.Color();
      n.forEach((s, i) => {
        r.makeTranslation(s.x, 34, s.y), o.setMatrixAt(i, r), o.setColorAt(i, a.set(s.colour));
      }), this.markers = o, this.scene.add(o);
    }
    this.render();
  }
  /** The people layer (x, y, role, gang, indoors per person): figures for
   * everyone not indoors. gangColours maps gang number to colour index. */
  setPeople(n, o, r) {
    const a = n.length / 5;
    if (!this.walkers || this.walkers.instanceMatrix.count < a) {
      this.walkers && (this.group.remove(this.walkers), this.walkers.geometry.dispose(), this.walkers.material.dispose());
      const p = new C.CylinderGeometry(cn / 2, cn / 2, Et, 6);
      p.translate(0, Et / 2 + me, 0), this.walkers = new C.InstancedMesh(p, new C.MeshLambertMaterial(), Math.max(a, 1)), this.walkers.frustumCulled = !1, this.group.add(this.walkers);
    }
    this.gangColour = o;
    const s = new C.Matrix4(), i = new C.Color();
    let d = 0;
    this.personOfInstance.length = 0;
    for (let p = 0; p < a; p++) {
      const k = p * 5;
      if (n[k + 4] !== 0) continue;
      s.makeTranslation(n[k] / 256, 0, n[k + 1] / 256), this.walkers.setMatrixAt(d, s);
      const _ = n[k + 3];
      this.walkers.setColorAt(d++, i.set(_ > 0 ? pe[(this.gangColour[_] ?? 0) % 4] : Aa[n[k + 2]] ?? "#ffffff")), this.personOfInstance.push(p), p === r && this.ring.position.set(n[k] / 256, me + 0.05, n[k + 1] / 256);
    }
    return this.ring.visible = r >= 0 && r < a && n[r * 5 + 4] === 0, this.walkers.count = d, this.walkers.instanceMatrix.needsUpdate = !0, this.walkers.instanceColor && (this.walkers.instanceColor.needsUpdate = !0), this.walkers.computeBoundingSphere(), this.render(), d;
  }
  /** Item 6: one instanced box layer, grown as needed. */
  boxes(n, o) {
    if (n && n.instanceMatrix.count >= o) return n;
    n && (this.group.remove(n), n.geometry.dispose(), n.material.dispose());
    const r = new C.BoxGeometry(1, 1, 1);
    r.translate(0, 0.5, 0);
    const a = new C.InstancedMesh(r, new C.MeshLambertMaterial(), Math.max(o, 1) + 16);
    return a.frustumCulled = !1, this.group.add(a), a;
  }
  /** Item 6: the city's cars (x, y, heading, truck, colour, halted), the gang
   * cars (x, y, kind, gang, crew, riders, heading) and the trams (x, y,
   * direction x, y, on the map, line), positions in 1/256 m. */
  setVehicles(n, o, r, a) {
    const s = new C.Matrix4(), i = new C.Quaternion(), d = new C.Vector3(), p = new C.Vector3(), k = new C.Vector3(0, 1, 0), _ = new C.Color(), u = (y, w, f, $, S, b, v) => {
      i.setFromAxisAngle(k, S), d.set(b[0], b[2], b[1]), p.set(f, me, $), y.setMatrixAt(w, s.compose(p, i, d)), y.setColorAt(w, _.set(v));
    }, c = (y) => -y * Math.PI / 2, h = n.length / 6;
    this.cars = this.boxes(this.cars, h);
    for (let y = 0; y < h; y++) {
      const w = y * 6, f = n[w + 3] === 1;
      u(
        this.cars,
        y,
        n[w] / 256,
        n[w + 1] / 256,
        c(n[w + 2]),
        f ? Na : dn,
        f ? Fa : un[n[w + 4] % un.length]
      );
    }
    this.cars.count = h;
    const m = o.length / 7;
    this.fleet = this.boxes(this.fleet, m);
    for (let y = 0; y < m; y++) {
      const w = y * 7, f = o[w + 6];
      u(
        this.fleet,
        y,
        o[w] / 256,
        o[w + 1] / 256,
        c(f < 0 ? 0 : f),
        Ma[o[w + 2]] ?? dn,
        pe[(a[o[w + 3]] ?? 0) % 4]
      );
    }
    this.fleet.count = m;
    const N = r.length / 6;
    this.trams = this.boxes(this.trams, N);
    let g = 0;
    for (let y = 0; y < N; y++) {
      const w = y * 6;
      r[w + 4] === 1 && u(this.trams, g++, r[w] / 256, r[w + 1] / 256, -Math.atan2(r[w + 3], r[w + 2]), La, Pa);
    }
    this.trams.count = g;
    for (const y of [this.cars, this.fleet, this.trams])
      y.instanceMatrix.needsUpdate = !0, y.instanceColor && (y.instanceColor.needsUpdate = !0);
    this.render();
  }
  select(n) {
    const o = this.city?.lots[n];
    if (!o) {
      this.outline.visible = !1, this.render();
      return;
    }
    const r = o.cls === 0 ? 0.6 : Math.max(1, o.storeys) * sn + 0.4;
    this.outline.scale.set(o.w, r, o.h), this.outline.position.set(o.x + o.w / 2, me + r / 2, o.y + o.h / 2), this.outline.visible = !0, this.render();
  }
  size() {
    const n = this.renderer.domElement;
    return { w: n.clientWidth || 1, h: n.clientHeight || 1 };
  }
  /** Applies the view: clamps it, places the camera, renders. */
  update() {
    if (!this.city) return;
    const { w: n, h: o } = this.size();
    this.renderer.setSize(n, o, !1), this.view = va({ ...this.view, zoom: Ea(this.view.zoom) }, n / o, this.city.w * K, this.city.h * K);
    const r = Ot(this.view.zoom), a = r * (n / o);
    Object.assign(this.camera, { left: -a / 2, right: a / 2, top: r / 2, bottom: -r / 2 }), this.camera.updateProjectionMatrix();
    const [s, i, d] = ya(this.view.turned);
    this.camera.position.set(this.view.x + s * Re, i * Re, this.view.z + d * Re), this.camera.lookAt(this.view.x, 0, this.view.z), this.render();
  }
  render() {
    cancelAnimationFrame(this.frame), this.frame = requestAnimationFrame(() => this.renderer.render(this.scene, this.camera));
  }
  drag(n, o) {
    this.view = Sa(this.view, n, o, this.size().h), this.update();
  }
  zoomBy(n) {
    this.view = { ...this.view, zoom: this.view.zoom * n }, this.update();
  }
  turn() {
    this.view = { ...this.view, turned: !this.view.turned }, this.update();
  }
  lookAt(n, o) {
    this.view = { ...this.view, x: n, z: o }, this.update();
  }
  /** What is under a canvas point: a person (nearest figure within a few
   * pixels) or else a lot; -1 for nothing. */
  pick(n, o) {
    if (!this.buildings) return { person: -1, lot: -1 };
    const r = this.renderer.domElement.getBoundingClientRect(), a = new C.Vector2((n - r.left) / r.width * 2 - 1, -((o - r.top) / r.height) * 2 + 1);
    if (this.walkers && this.walkers.count > 0) {
      const i = new C.Matrix4(), d = new C.Vector3();
      let p = -1, k = 64;
      for (let _ = 0; _ < this.walkers.count; _++) {
        this.walkers.getMatrixAt(_, i), d.setFromMatrixPosition(i).setY(me + Et / 2).project(this.camera);
        const u = (d.x - a.x) * r.width / 2, c = (d.y - a.y) * r.height / 2, h = u * u + c * c;
        h < k && (k = h, p = _);
      }
      if (p >= 0) return { person: this.personOfInstance[p], lot: -1 };
    }
    this.raycaster.setFromCamera(a, this.camera);
    const s = this.raycaster.intersectObject(this.buildings, !1)[0];
    return { person: -1, lot: s?.instanceId != null ? this.lotOfInstance[s.instanceId] : -1 };
  }
  dispose() {
    cancelAnimationFrame(this.frame), this.renderer.dispose();
  }
}
const Ba = ["#d8c59a", "#cdbf9f", "#a9a49a", "#c8b9a0", "#bfc3c7"], Ya = "#7d9a5d", xa = "#5f86a3", Ra = "#8f8a80", Oa = "#d6ccb4", za = "#e9dfc6", Da = "#b9ad93";
function ja({ city: e, selected: n, onSelect: o, label: r, markers: a }) {
  const s = Pe(null), i = Pe({ scale: 1, ox: 0, oy: 0 });
  U(() => {
    const p = s.current;
    if (!p) return;
    const k = () => {
      const u = Math.min(2, devicePixelRatio), c = p.clientWidth, h = p.clientHeight;
      p.width = Math.round(c * u), p.height = Math.round(h * u);
      const m = p.getContext("2d");
      if (!m) return;
      const N = e.w * K, g = e.h * K, y = 24, w = Math.min((c - 2 * y) / N, (h - 2 * y) / g), f = (c - N * w) / 2, $ = (h - g * w) / 2;
      i.current = { scale: w, ox: f, oy: $ }, m.setTransform(u * w, 0, 0, u * w, u * f, u * $), m.fillStyle = za, m.fillRect(-y / w, -y / w, N + 2 * y / w, g + 2 * y / w), m.fillStyle = Da, m.fillRect(0, 0, N, g);
      for (const b of e.blocks) {
        if (b.merged >= 0) continue;
        const v = yn(b);
        m.fillStyle = b.use === 1 ? Ya : b.use === 5 ? xa : b.use === 4 ? Ra : b.use === 3 ? Oa : Ba[b.district], m.fillRect(v.x - 2, v.y - 2, v.w + 4, v.h + 4);
      }
      for (const b of e.lots)
        m.fillStyle = ct[b.cls] ?? ct[0], m.globalAlpha = b.cls === 0 ? 0.35 : 0.9, m.fillRect(b.x + 0.6, b.y + 0.6, Math.max(0.5, b.w - 1.2), Math.max(0.5, b.h - 1.2));
      m.globalAlpha = 1;
      const S = e.lots[n];
      S && (m.strokeStyle = "#1b1208", m.lineWidth = 2.5 / w, m.strokeRect(S.x - 1, S.y - 1, S.w + 2, S.h + 2));
      for (const b of a)
        m.fillStyle = b.colour, m.strokeStyle = "#1b1208", m.lineWidth = 1 / w, m.beginPath(), m.arc(b.x, b.y, 6 / w, 0, Math.PI * 2), m.fill(), m.stroke();
      for (const b of e.hq) {
        const v = (b.fx + 0.5) * (K / 5), O = (b.fy + 0.5) * (K / 5), I = 9 / w;
        m.fillStyle = "#1b1208", m.fillRect(v - 0.6 / w, O - 2.2 * I, 1.2 / w, 2.2 * I), m.fillStyle = pe[b.colour % 4], m.beginPath(), m.moveTo(v, O - 2.2 * I), m.lineTo(v + 1.6 * I, O - 1.7 * I), m.lineTo(v, O - 1.2 * I), m.fill();
      }
    };
    k();
    const _ = new ResizeObserver(k);
    return _.observe(p), () => _.disconnect();
  }, [e, n, a]);
  const d = (p) => {
    const k = p.currentTarget.getBoundingClientRect(), _ = i.current;
    o(ua(e, (p.clientX - k.left - _.ox) / _.scale, (p.clientY - k.top - _.oy) / _.scale));
  };
  return /* @__PURE__ */ t.createElement("canvas", { className: "city-plan", ref: s, onClick: d, "aria-label": r });
}
const At = [
  2087000994,
  1345216982,
  2537227108,
  2322682548,
  3464602834,
  1449177721,
  955002386,
  2725655775,
  3304141253,
  1945812103,
  3106597394,
  3860522775,
  3923203638,
  3143742962,
  942210133,
  573572034,
  4118670652,
  2227219457,
  2140019606,
  4173634592
], Cn = [48, 31, 59, 54, 80, 33, 22, 63, 76, 45, 72, 89, 91, 73, 21, 13, 95, 51, 49, 97], Nn = [
  6347,
  31496,
  30113,
  27735,
  13669,
  28831,
  25076,
  12886,
  27578,
  14561,
  15010,
  14895,
  11210,
  18983,
  2483,
  24216,
  15099,
  5001,
  1002,
  15126
], Tt = [13824, 2764, 1280, 362, 46341, 65536, 128, 5, 38500], Ga = [
  { w: 36, h: 28, seed: 1932, rng: 787968811, city: 130389902, structure: 2172434479, blocks: 1008, merged: 140, lots: 8769, buildings: 8769, types: 164, hq: [] },
  { w: 40, h: 32, seed: 1932, rng: 1183664769, city: 162525796, structure: 3010893233, blocks: 1280, merged: 22, lots: 4580, buildings: 4580, types: 170, hq: [[13, 10], [31, 4], [7, 20], [36, 25]] },
  { w: 44, h: 35, seed: 1932, rng: 214220379, city: 1231309806, structure: 2436981367, blocks: 1540, merged: 209, lots: 13488, buildings: 13488, types: 166, hq: [] },
  { w: 40, h: 32, seed: 187, rng: 1183663024, city: 2335500783, structure: 2753879728, blocks: 1280, merged: 20, lots: 4733, buildings: 4733, types: 170, hq: [[11, 9], [29, 4], [9, 17], [25, 23]] }
], Ha = [
  { w: 40, h: 32, seed: 1932, people: 8479, rngSetup: 532198006, rngMinute1: 3184470837, hashes: [762905189, 59061474, 867735307, 2325457386] },
  { w: 44, h: 35, seed: 1932, people: 20879, rngSetup: 3696518514, rngMinute1: 2775660613, hashes: [4085821087, 1945027344, 3513816520, 825993883] }
], Le = { seed: 1932, auto: 1932, w: 44, h: 35 };
function Bt(e) {
  const n = [At, Cn, Nn];
  return {
    random: e.streams.reduce((o, r, a) => o + r.filter((s, i) => s === n[a][i]).length, 0),
    checks: e.checks.filter((o, r) => o === Tt[r]).length
  };
}
function Ln(e) {
  return Ga.find((n) => n.w === e.w && n.h === e.h && n.seed === e.seed) ?? null;
}
const et = ({ v: e, expect: n }) => /* @__PURE__ */ t.createElement("td", { className: e === n ? "ok" : "bad" }, e);
function Ia({ t: e, stamp: n, buildId: o, stateHash: r, step2: a, city: s, core: i, onClose: d, onSound: p, onCrash: k, orderCheck: _, onOrderCheck: u }) {
  const c = s ? Ha.find((S) => S.w === s.w && S.h === s.h && S.seed === s.seed) ?? null : null, h = (S, b) => i ? H(i.hs_count(S) | i.hs_count(b) << 16) : 0, m = i && s ? [
    [e("d_people"), i.hs_count(F.people), c?.people ?? null],
    [e("d_rng"), h(F.setupLow, F.setupHigh), c?.rngSetup ?? null],
    ...["people", "positions", "opinions", "names"].map((S, b) => [`${S} hash`, H(i.hs_population_hash(b + 1)), c?.hashes[b] ?? null]),
    // Shown once week 1 has run its first minute (0 before).
    [e("d_minute1"), h(F.m1Low, F.m1High), c?.rngMinute1 ?? null]
  ] : [], N = m.filter(([, S, b]) => b !== null && H(S) === H(b)).length, g = s ? Ln(s) : null, y = s ? [
    [e("d_rng"), s.rngAfter, g?.rng ?? null],
    [e("d_city"), s.cityHash, g?.city ?? null],
    [e("d_structure"), s.structureHash, g?.structure ?? null],
    ["blocks", s.counts.blocks, g?.blocks ?? null],
    ["merged", s.counts.merged, g?.merged ?? null],
    ["lots", s.counts.lots, g?.lots ?? null],
    ["buildings", s.counts.buildings, g?.buildings ?? null],
    ["types", s.counts.typesUsed, g?.types ?? null],
    ...g?.hq.length ? g.hq.map((S, b) => {
      const v = s.hq[b] ? s.blocks[s.hq[b].block] : null;
      return [`HQ ${b + 1} (gx·100 + gy)`, v ? v.gx * 100 + v.gy : -1, S[0] * 100 + S[1]];
    }) : []
  ] : [], w = y.filter(([, S, b]) => b !== null && H(S) === H(b)).length, f = a ? Bt(a) : null, $ = [At, Cn, Nn];
  return /* @__PURE__ */ t.createElement("aside", { className: "drawer", "aria-label": e("d_title") }, /* @__PURE__ */ t.createElement("header", null, /* @__PURE__ */ t.createElement("h2", null, e("d_title")), /* @__PURE__ */ t.createElement("button", { className: "close", onClick: d, "aria-label": e("d_close") }, "×")), /* @__PURE__ */ t.createElement("section", null, /* @__PURE__ */ t.createElement("h3", null, e("d_step5")), /* @__PURE__ */ t.createElement("p", { className: "sum" }, e("d_order_note")), /* @__PURE__ */ t.createElement("div", { className: "row" }, /* @__PURE__ */ t.createElement("button", { className: "main", disabled: !i || !s, onClick: u }, e("d_order_check"))), _ && /* @__PURE__ */ t.createElement(t.Fragment, null, /* @__PURE__ */ t.createElement("p", { className: "sum" }, e("d_order_sum", { n: _.passed, m: _.rows.length, ms: _.weekMs.join(", ") })), /* @__PURE__ */ t.createElement("div", { className: "scroll" }, /* @__PURE__ */ t.createElement("table", { className: "checks" }, /* @__PURE__ */ t.createElement("thead", null, /* @__PURE__ */ t.createElement("tr", null, /* @__PURE__ */ t.createElement("th", null, e("col_check")), /* @__PURE__ */ t.createElement("th", null, e("col_ada")), /* @__PURE__ */ t.createElement("th", null, "1.2.91"), /* @__PURE__ */ t.createElement("th", null))), /* @__PURE__ */ t.createElement("tbody", null, _.rows.map((S, b) => /* @__PURE__ */ t.createElement("tr", { key: b }, /* @__PURE__ */ t.createElement("th", null, S.label), /* @__PURE__ */ t.createElement("td", { className: S.mode === "info" ? "" : S.ok ? "ok" : "bad" }, S.got), /* @__PURE__ */ t.createElement("td", null, S.want), /* @__PURE__ */ t.createElement("td", null, S.mode === "20%" ? "±20 %" : S.mode === "info" ? "info" : "=")))))))), i && s && /* @__PURE__ */ t.createElement("section", null, /* @__PURE__ */ t.createElement("h3", null, e("d_step4")), /* @__PURE__ */ t.createElement("p", { className: "sum" }, c ? e("d_match", { n: N, m: m.length }) : e("d_no_ref")), /* @__PURE__ */ t.createElement("table", null, /* @__PURE__ */ t.createElement("tbody", null, m.map(([S, b, v]) => /* @__PURE__ */ t.createElement("tr", { key: S }, /* @__PURE__ */ t.createElement("th", null, S), v === null ? /* @__PURE__ */ t.createElement("td", null, H(b)) : /* @__PURE__ */ t.createElement(et, { v: H(b), expect: H(v) }), /* @__PURE__ */ t.createElement("td", null, v === null ? "" : H(v))))))), /* @__PURE__ */ t.createElement("section", null, /* @__PURE__ */ t.createElement("h3", null, e("d_step3")), s && /* @__PURE__ */ t.createElement("p", { className: "sum" }, e("d_counts", {
    b: s.counts.blocks,
    m: s.counts.merged,
    l: s.counts.lots,
    n: s.counts.buildings,
    t: s.counts.typesUsed,
    r: s.retries
  })), /* @__PURE__ */ t.createElement("p", { className: "sum" }, g ? e("d_match", { n: w, m: y.length }) : e("d_no_ref")), /* @__PURE__ */ t.createElement("table", null, /* @__PURE__ */ t.createElement("tbody", null, y.map(([S, b, v]) => /* @__PURE__ */ t.createElement("tr", { key: S }, /* @__PURE__ */ t.createElement("th", null, S), v === null ? /* @__PURE__ */ t.createElement("td", null, H(b)) : /* @__PURE__ */ t.createElement(et, { v: H(b), expect: H(v) }), /* @__PURE__ */ t.createElement("td", null, v === null ? "" : H(v))))))), /* @__PURE__ */ t.createElement("section", null, /* @__PURE__ */ t.createElement("h3", null, e("d_step1")), /* @__PURE__ */ t.createElement("table", null, /* @__PURE__ */ t.createElement("tbody", null, /* @__PURE__ */ t.createElement("tr", null, /* @__PURE__ */ t.createElement("th", null, e("d_stamp")), /* @__PURE__ */ t.createElement("td", null, n)), /* @__PURE__ */ t.createElement("tr", null, /* @__PURE__ */ t.createElement("th", null, e("d_build_id")), /* @__PURE__ */ t.createElement("td", null, o ?? "…")), /* @__PURE__ */ t.createElement("tr", null, /* @__PURE__ */ t.createElement("th", null, e("d_state")), /* @__PURE__ */ t.createElement("td", null, r === null ? "…" : `${en(r)} (${H(r)})`)))), /* @__PURE__ */ t.createElement("div", { className: "row" }, /* @__PURE__ */ t.createElement("button", { className: "main", onClick: p }, e("test_sound")), /* @__PURE__ */ t.createElement("button", { className: "main danger", onClick: k }, e("crash_test")))), a && f && /* @__PURE__ */ t.createElement("section", null, /* @__PURE__ */ t.createElement("h3", null, e("d_step2")), /* @__PURE__ */ t.createElement("p", { className: "sum" }, e("random_sum", { n: f.random, m: 60 })), /* @__PURE__ */ t.createElement("div", { className: "scroll" }, /* @__PURE__ */ t.createElement("table", null, /* @__PURE__ */ t.createElement("thead", null, /* @__PURE__ */ t.createElement("tr", null, /* @__PURE__ */ t.createElement("th", null, e("col_i")), /* @__PURE__ */ t.createElement("th", null, e("col_main")), /* @__PURE__ */ t.createElement("th", null, e("col_ref")), /* @__PURE__ */ t.createElement("th", null, e("col_int")), /* @__PURE__ */ t.createElement("th", null, e("col_ref")), /* @__PURE__ */ t.createElement("th", null, e("col_plan")), /* @__PURE__ */ t.createElement("th", null, e("col_ref")))), /* @__PURE__ */ t.createElement("tbody", null, At.map((S, b) => /* @__PURE__ */ t.createElement("tr", { key: b }, /* @__PURE__ */ t.createElement("td", null, b + 1), [0, 1, 2].map((v) => /* @__PURE__ */ t.createElement(t.Fragment, { key: v }, /* @__PURE__ */ t.createElement(et, { v: a.streams[v][b], expect: $[v][b] }), /* @__PURE__ */ t.createElement("td", null, $[v][b])))))))), /* @__PURE__ */ t.createElement("p", { className: "sum" }, e("numbers_sum", { n: f.checks, m: a.checks.length })), /* @__PURE__ */ t.createElement("table", null, /* @__PURE__ */ t.createElement("thead", null, /* @__PURE__ */ t.createElement("tr", null, /* @__PURE__ */ t.createElement("th", null, e("col_check")), /* @__PURE__ */ t.createElement("th", null, e("col_ada")), /* @__PURE__ */ t.createElement("th", null, e("col_exp")))), /* @__PURE__ */ t.createElement("tbody", null, a.checks.map((S, b) => /* @__PURE__ */ t.createElement("tr", { key: b }, /* @__PURE__ */ t.createElement("th", null, e(`c${b + 1}`)), /* @__PURE__ */ t.createElement(et, { v: S, expect: Tt[b] }), /* @__PURE__ */ t.createElement("td", null, Tt[b]))))), /* @__PURE__ */ t.createElement("p", { className: "sum" }, e("grid_sum", { w: a.gw, h: a.gh, n: a.gw * a.gh })), /* @__PURE__ */ t.createElement("div", { className: "grid-sample", "aria-hidden": "true" }, a.pattern.map((S, b) => /* @__PURE__ */ t.createElement("i", { key: b, className: S === 1 ? "b" : S === 0 ? "s" : "x" }))), /* @__PURE__ */ t.createElement("p", { className: "sum" }, e("grid_legend")), /* @__PURE__ */ t.createElement("p", { className: "sum" }, e("world_sum", {
    seed: Le.seed,
    auto: Le.auto,
    w: a.gw,
    h: a.gh,
    hash: `${en(a.worldHash)} (${H(a.worldHash)})`
  }))));
}
const ce = ["Bakers", "Butchers", "Grocers", "Convenience Store", "Shoe Store", "Tailors", "Book Store", "Printers", "Pawnbrokers", "Jewellers", "Furrier", "Drug Store", "Plumbers", "Cafe", "Milk Bar", "Breakfast Bar", "Restaurant", "Pool Hall", "Gymnasium", "Health Center", "Massage Parlor", "Dance Studio", "Barbers", "Laundry", "Hardware Store", "Auto Shop", "Finance Company", "Accountancy Firm", "Law Offices", "Hotel", "Hotel (Large)", "Department Store", "Bank", "Main Bank", "Newspaper Offices", "Radio Station", "Warehouse", "Foundry", "Mill", "Cannery", "Garage Depot", "Trade Union", "Docks", "Railroad Terminal", "Tenement Block", "Apartment Block", "Residences", "City Hall", "Courthouse", "Police Headquarters", "Hospital", "School", "Library", "Labour Exchange", "Fire House", "F.B.I. Headquarters", "Museum", "Public Baths", "US Post", "Power Plant", "Water Plant", "Residences", "Church", "Orphanage", "Soup Kitchen", "Clothing Bank", "Office", "Speakeasy", "Moonshine Still", "Casino", "Card Games", "Dice Game", "Gambling Den", "Prizefight Ring", "Grifters", "Insider Trading", "Loan Shark", "Counterfeit Press", "Numbers Racket", "Rented Rooms", "Teamsters", "Acupuncture Clinic", "Antiques Dealer", "Art Gallery", "Auction Rooms", "Auto Dealers", "Bailiffs", "Beauty Parlor", "Blacksmiths", "Bridal Parlor", "Cab Company", "Cake Store", "Candy Store", "Carpet Store", "Catering Suppliers", "Cheese Store", "China Store", "Chiropodists", "Clothiers", "Coffin Makers", "Cosmetics Store", "Delicatessen", "Orthodontists", "Detective Agency", "Diamond Merchant", "Doctors", "Dressmakers", "Electrical Suppliers", "Electricians", "Costume Store", "Fishmongers", "Florists", "Fortune Tellers", "French Polishers", "Fruit and Veg. Store", "Funeral Directors", "Furniture Store", "Gardening Suppliers", "Gas Station/Mechanic", "Gift Store", "Gold Merchants", "Golf Store", "Gramophone Store", "Glassware", "Haberdashery", "Hair Salon", "Wig Makers", "Ice Store", "Ice Cream Parlor", "Ladieswear", "Lingerie Store", "Local Store", "Locksmiths", "Lumber Merchant", "Milliners", "Movie Theater", "Music Store", "News Agency", "Nursery Store", "Optometrist", "Perfume Store", "Pest Controllers", "Pet Store", "Photographers", "Piano Store", "Real Estate", "Record Store", "Removals Company", "Saddlers", "Shoe Repairs", "Sign Writers", "Soda Fountain", "Sports Equipment", "Stamp and Coin Dealers", "Stationers", "Tattoo Parlor", "Telegraph Office", "Theater", "Tobacconists", "Toy Store", "Upholsterers", "Watchmakers", "Window Cleaners", "Abattoir", "Builders", "Cement Factory", "Ceramics", "Chandler", "Leather Curers", "Engineers", "Excavators", "Fabricators", "Factory", "Food Processors", "Freight Forwarding", "Furriers", "Glaziers", "Ice House", "Ironmongers", "Joiners", "Junk Yard", "Lumber Yard", "Milk Yard", "Packaging Plant", "Paper Mill", "Sheet Workers", "Steel Mill", "Stone Masons", "Tanners", "Textiles", "Weavers", "Wheelwrights", "Empty land"], Wa = ["bakers", "butchers", "grocers", "convenienceStore", "shoeStore", "tailors", "bookStore", "printers", "pawnbroker", "jewellers", "furrier", "drugStore", "plumbers", "cafe", "milkBar", "breakfastBar", "restaurant", "poolHall", "gym", "healthCenter", "massageParlor", "danceStudio", "barbers", "laundry", "hardwareStore", "autoShop", "financeCompany", "accountancy", "lawFirm", "hotelSmall", "hotelLarge", "departmentStore", "bankSmall", "bankLarge", "newspaper", "radioStation", "warehouse", "foundry", "mill", "cannery", "garageDepot", "tradeUnion", "docks", "railroad", "tenementPoor", "tenementMid", "tenementRich", "cityHall", "courthouse", "policeHQ", "hospital", "school", "library", "labourExchange", "firehouse", "fbiHQ", "museum", "publicBaths", "usPost", "powerPlant", "waterPlant", "residence", "church", "orphanage", "soupKitchen", "clothingBank", "office", "speakeasy", "moonshineStill", "casino", "cardGames", "diceGame", "gamblingDen", "prizeFight", "grifters", "insiderTrading", "loanShark", "counterfeitPress", "numbersRacket", "rentedRooms", "teamsters", "acupunctureClinic", "antiquesDealer", "artGallery", "auctionRooms", "autoDealers", "bailiffs", "beautyParlor", "blacksmiths", "bridalParlor", "cabCompany", "cakeStore", "candyStore", "carpetStore", "cateringSuppliers", "cheeseStore", "chinaStore", "chiropodists", "clothiers", "coffinMakers", "cosmeticsStore", "delicatessen", "orthodontists", "detectiveAgency", "diamondMerchant", "doctors", "dressmakers", "electricalSuppliers", "electricians", "costumeStore", "fishmongers", "florists", "fortuneTellers", "frenchPolishers", "fruitAndVegStore", "funeralDirectors", "furnitureStore", "gardeningSuppliers", "gasStationMechanic", "giftStore", "goldMerchants", "golfStore", "gramophoneStore", "glassware", "haberdashery", "hairSalon", "wigMakers", "iceStore", "iceCreamParlor", "ladieswear", "lingerieStore", "localStore", "locksmiths", "lumberMerchant", "milliners", "movieTheater", "musicStore", "newsAgency", "nurseryStore", "optometrist", "perfumeStore", "pestControllers", "petStore", "photographers", "pianoStore", "realEstate", "recordStore", "removalsCompany", "saddlers", "shoeRepairs", "signWriters", "sodaFountain", "sportsEquipment", "stampAndCoinDealers", "stationers", "tattooParlor", "telegraphOffice", "theater", "tobacconists", "toyStore", "upholsterers", "watchmakers", "windowCleaners", "abattoir", "builders", "cementFactory", "ceramics", "chandler", "leatherCurers", "engineers", "excavators", "fabricators", "factory", "foodProcessors", "freightForwarding", "furriers", "glaziers", "iceHouse", "ironmongers", "joiners", "junkYard", "lumberYard", "milkYard", "packagingPlant", "paperMill", "sheetWorkers", "steelMill", "stoneMasons", "tanners", "textiles", "weavers", "wheelwrights", "emptyLand"], $a = ["commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "tenement", "tenement", "tenement", "municipal", "municipal", "municipal", "municipal", "municipal", "municipal", "municipal", "municipal", "municipal", "municipal", "municipal", "municipal", "municipal", "municipal", "residential", "charity", "charity", "charity", "charity", "illegal", "illegal", "illegal", "illegal", "illegal", "illegal", "illegal", "illegal", "illegal", "illegal", "illegal", "illegal", "illegal", "illegal", "illegal", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "commercial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "industrial", "empty"], Va = [5200, 5600, 6e3, 14200, 6800, 7200, 6600, 8200, 7e3, 12500, 12e3, 7400, 5800, 6200, 5800, 5600, 16800, 7600, 4500, 9e3, 8400, 3800, 4800, 5400, 6600, 9200, 5900, 11e3, 12e3, 13e3, 26e3, 34e3, 22e3, 46e3, 44e3, 44e3, 9e3, 16e3, 14e3, 23800, 11e3, 12e3, 41200, 3e4, 4200, 7e3, 12e3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3e3, 2e3, 6e3, 8e3, 4500, 18e3, 4e3, 3600, 6500, 7e3, 4200, 12e3, 7500, 9500, 5e3, 11e3, 8500, 5800, 8100, 8100, 13900, 10400, 4100, 7e3, 4400, 7e3, 10400, 5800, 4400, 10400, 5800, 5500, 8100, 8100, 5500, 5800, 7e3, 5800, 8100, 5500, 11600, 8100, 8100, 5800, 5500, 4100, 5800, 4400, 4600, 5500, 5800, 5800, 11600, 5800, 4400, 7e3, 8100, 4600, 5800, 2900, 5800, 5800, 4600, 4400, 5800, 8100, 7e3, 13900, 5500, 5800, 5800, 11600, 4400, 5500, 5800, 8100, 7e3, 4400, 4100, 5800, 5500, 8100, 5500, 10400, 4100, 4100, 5500, 5800, 5800, 4100, 4400, 2900, 5500, 9300, 4100, 4100, 5500, 10400, 4100, 5800, 16200, 16200, 16200, 31900, 16200, 20900, 16200, 31900, 16200, 20900, 16200, 31900, 16200, 2300, 16200, 16200, 2300, 5800, 16200, 16200, 20900, 20900, 31900, 16200, 16200, 20900, 16200, 16200, 0], qa = ["Volstead Green", "Hinge Oak", "Lantern Park", "Cinder Gardens"], Ua = ["St. Michael’s", "St. Mary’s", "St. Joseph’s", "St. Patrick’s"], tt = ["Wabash", "Clark", "Dearborn", "State", "Halsted", "Ashland", "Racine", "Morgan", "Sangamon", "Peoria", "Carpenter", "Laflin", "Wood", "Paulina", "Hermitage", "Wolcott", "Damen", "Leavitt", "Oakley", "Claremont"], nt = ["Madison", "Monroe", "Adams", "Jackson", "Van Buren", "Harrison", "Polk", "Taylor", "Roosevelt", "Maxwell", "Cermak", "Archer", "Pershing", "Garfield", "Lawrence", "Belmont", "Fullerton", "Diversey", "Addison", "Irving"], zt = ["Alphonse", "Vito", "Salvatore", "Frank", "Johnny", "Tommy", "Angelo", "Rocco", "Carmine", "Dominic", "Enzo", "Gino", "Luigi", "Marco", "Nico", "Paulie", "Sal", "Tony", "Vinnie", "Bugsy", "Dutch", "Lefty", "Moe", "Jake", "Abe", "Sam", "Meyer", "Solly", "Hymie", "Sean", "Declan", "Patrick", "Liam", "Eamon", "Rory", "Mickey", "Fergus", "Brendan", "Walter", "Harold", "Clarence", "Chester", "Herbert", "Raymond", "Ernest", "Floyd", "Otto", "Klaus", "Heinrich", "Wilhelm", "Stefan", "Anton", "Ludwig", "Amos", "Cyrus", "Silas", "Homer", "Virgil", "Emmett", "Wilbur", "Elmer", "Orville", "Rosa", "Concetta", "Maria", "Angelina", "Lucia", "Carmela", "Gina", "Nina", "Sofia", "Bridget", "Maureen", "Nora", "Colleen", "Kathleen", "Siobhan", "Aileen", "Ruth", "Esther", "Sadie", "Belle", "Pearl", "Mabel", "Hazel", "Edna", "Vera", "Opal", "Dorothy", "Gladys", "Mildred", "Beatrice", "Constance", "Harriet", "Florence", "Greta", "Ilse", "Anneliese", "Hilde", "Marlene", "Lillian", "Wilma", "Norma", "Thelma", "Bessie", "Myrtle", "Ada", "Capone", "Moretti", "Bellini", "Ricci", "Costa", "Rinaldi", "Marino", "Gallo", "Fontana", "Genovese", "Lombardi", "Barbieri", "Vitale", "Ferrante", "Bruno", "Greco", "Rizzo", "OConnell", "Doyle", "Kelly", "Sullivan", "Murphy", "Flanagan", "Gallagher", "Quinn", "Byrne", "Donnelly", "Fitzgerald", "Rourke", "Maguire", "Brennan", "Rosenberg", "Goldstein", "Weiss", "Kaplan", "Lansky", "Bernstein", "Shapiro", "Roth", "Schmidt", "Braun", "Wagner", "Keller", "Hoffman", "Zimmer", "Krause", "Bauer", "Kowalski", "Nowak", "Wozniak", "Zielinski", "Jankowski", "Whitaker", "Ashford", "Carmichael", "Blackwood", "Hollis", "Vance", "Sterling", "Marsh", "Doyle", "Crane", "Hargrove", "Pemberton", "Locke", "Radcliffe", "Winslow", "Petrov", "Sokolov", "Ivanov", "Volkov", "Papadakis", "Stavros", "Kostas", "Scarface", "The Enforcer", "Bugs", "Baby Face", "Pretty Boy", "Lucky", "The Waiter", "Machine Gun", "The Chin", "Three Fingers", "The Cigar", "Ice Pick", "Knuckles", "The Weasel", "Fats", "Slim", "The Ghost", "Nails", "Trigger", "Whitey", "Doc", "The Butcher", "Sleepy", "Cricket", "Half-Moon", "Tick-Tock", "Silk", "Curly", "Moretti", "OConnell", "Rosenberg", "Vanetti", "Delgado", "Kowalski", "Bellini", "Doyle", "Marchetti", "Sullivan", "Weiss", "Corvino", "Clarence", "Amos", "Floyd", "Ellis", "Jesse", "Otis", "Rufus", "Willie", "Booker", "Luther", "Calvin", "Odell", "Pearl", "Bessie", "Hazel", "Mattie", "Viola", "Ida", "Lula", "Minnie", "Washington", "Jefferson", "Coleman", "Freeman", "Banks", "Tillman", "Haywood", "Hollins", "Mosley", "Gaines", "Pruitt", "Dawson", "Walter", "Clarence", "Chester", "Harold", "Herbert", "Leonard", "Raymond", "Everett", "Howard", "Lloyd", "Russell", "Wesley", "Dorothy", "Mildred", "Edna", "Gladys", "Irene", "Myrtle", "Agnes", "Vera", "Whitaker", "Carmichael", "Pemberton", "Ashford", "Blakely", "Hollis", "Prescott", "Thornton", "Granger", "Whitfield", "Kendall", "Hartley", "Henry", "Walter", "Eddie", "Tommy", "Albert", "Johnny", "Frank", "Sam", "George", "Harry", "Mae", "Lillian", "Rose", "Ruby", "Grace", "Alice", "Lee", "Wong", "Chin", "Chan", "Fong", "Lum", "Yee", "Quan", "Moy", "Louie", "Otto", "Heinrich", "Ludwig", "Fritz", "Hans", "Karl", "Werner", "Max", "Franz", "Wilhelm", "Emil", "Gustav", "Greta", "Hilde", "Ilse", "Frieda", "Marta", "Klara", "Liesl", "Erna", "Schmidt", "Keller", "Bauer", "Wagner", "Weber", "Hoffmann", "Kruger", "Fischer", "Becker", "Schulz", "Vogel", "Braun", "Nikos", "Kostas", "Yannis", "Dimitri", "Spiros", "Christos", "Vasilis", "Andreas", "Petros", "Stelios", "Eleni", "Sophia", "Katerina", "Despina", "Irini", "Anastasia", "Papadakis", "Stavros", "Kostas", "Pappas", "Karras", "Demos", "Galanis", "Vlahos", "Manos", "Lykos", "Declan", "Brendan", "Mickey", "Fergus", "Seamus", "Liam", "Cormac", "Dermot", "Owen", "Paddy", "Kieran", "Ronan", "Bridget", "Maureen", "Nora", "Siobhan", "Kathleen", "Peggy", "Eileen", "Molly", "Doyle", "Flanagan", "Maguire", "OConnell", "Sullivan", "Callahan", "Brennan", "Keane", "Murphy", "Quinlan", "Dolan", "Hennessy", "Salvatore", "Rocco", "Carmine", "Vito", "Angelo", "Enzo", "Luigi", "Marco", "Paolo", "Domenico", "Sal", "Nunzio", "Tony", "Frankie", "Gino", "Aldo", "Concetta", "Rosa", "Carmela", "Lucia", "Gina", "Teresa", "Filomena", "Angela", "Moretti", "Rinaldi", "Ferrante", "Vanetti", "Corvino", "Bellini", "Marchetti", "Ricci", "Costa", "Lombardi", "Esposito", "Greco", "Russo", "Romano", "Santoro", "Meyer", "Abe", "Solly", "Moe", "Izzy", "Benny", "Hymie", "Sam", "Lou", "Morris", "Irving", "Nat", "Esther", "Sadie", "Ruth", "Miriam", "Rivka", "Bella", "Fanny", "Goldie", "Rosenberg", "Kaplan", "Shapiro", "Weiss", "Goldberg", "Levine", "Feldman", "Siegel", "Abrams", "Horowitz", "Adler", "Bernstein", "Miguel", "Rafael", "Ernesto", "Jose", "Luis", "Ramon", "Alfonso", "Joaquin", "Arturo", "Ignacio", "Guadalupe", "Rosa", "Elena", "Consuelo", "Dolores", "Lupita", "Carmen", "Juana", "Delgado", "Ramirez", "Castillo", "Morales", "Herrera", "Navarro", "Fuentes", "Ortega", "Salazar", "Mendoza", "Stefan", "Anton", "Kazimierz", "Jan", "Tadeusz", "Wojciech", "Jozef", "Marek", "Leon", "Bronislaw", "Wanda", "Halina", "Jadwiga", "Zofia", "Irena", "Stasia", "Kowalski", "Nowak", "Zielinski", "Wisniewski", "Lewandowski", "Kaminski", "Mazur", "Sobczak", "Pawlak", "Dudek"], Ka = ["boss", "lieutenant", "hood", "accountant", "lawyer", "citizen", "owner", "police", "firefighter", "policeChief", "fbi", "fbiHead", "judge", "da", "mayor", "reporter", "clergy", "snitch"], Mn = ["intelligence", "organization", "business", "firearms", "fists", "knives", "arson", "explosives", "intimidation", "driving", "stealth"];
function Za({ city: e, lot: n, t: o, onClose: r, gangs: a }) {
  const s = e.lots[n];
  if (!s) return /* @__PURE__ */ t.createElement("aside", { className: "card building-card idle" }, /* @__PURE__ */ t.createElement("p", null, o("card_none")));
  const i = e.blocks[s.block], d = e.hq.find((u) => u.lot === s.id), k = (s.type === ce.indexOf("Church") && i.name >= 0 ? Ua[i.name] : null) ?? ce[s.type] ?? ce[da], _ = (u, c) => /* @__PURE__ */ t.createElement("div", null, /* @__PURE__ */ t.createElement("dt", null, o(u)), /* @__PURE__ */ t.createElement("dd", null, c));
  return /* @__PURE__ */ t.createElement("aside", { className: "card building-card", "aria-live": "polite" }, /* @__PURE__ */ t.createElement("header", null, /* @__PURE__ */ t.createElement("span", { className: "swatch", "data-cls": s.cls }), /* @__PURE__ */ t.createElement("div", null, /* @__PURE__ */ t.createElement("h3", null, k), /* @__PURE__ */ t.createElement("div", { className: "sub" }, o(`cls_${kn[s.cls]}`), " · ", o(`dist_${wn[i.district]}`))), /* @__PURE__ */ t.createElement("button", { className: "close", onClick: r, "aria-label": o("card_close") }, "×")), /* @__PURE__ */ t.createElement("dl", null, _("card_value", i.landValue), _("card_squalor", i.squalor), _("card_block", `${i.gx}, ${i.gy}${i.spanX * i.spanY > 1 ? ` (${i.spanX} × ${i.spanY})` : ""}`), _("card_plot", s.index), _("card_storeys", s.storeys), _("card_faces", o(`face_${ca[s.face]}`))), d && /* @__PURE__ */ t.createElement("p", { className: "note" }, o("card_hq", { name: a[d.gang - 1]?.name ?? d.gang })), i.use === 1 && i.name >= 0 && /* @__PURE__ */ t.createElement("p", { className: "note" }, qa[i.name]));
}
const Ja = [
  ["p_police", 7],
  ["p_money", 8],
  ["p_rivals", 9],
  ["p_reports", 10],
  ["p_auto", 11]
];
function Qa({ t: e, gangsOpen: n, onGangs: o, ordersOpen: r, onOrders: a }) {
  return /* @__PURE__ */ t.createElement("nav", { className: "journal", "aria-label": "Journal" }, /* @__PURE__ */ t.createElement("button", { className: "live", "aria-pressed": n, onClick: o }, /* @__PURE__ */ t.createElement("span", null, e("p_gangs"))), /* @__PURE__ */ t.createElement("button", { className: "live", "aria-pressed": r, onClick: a }, /* @__PURE__ */ t.createElement("span", null, e("p_orders"))), Ja.map(([s, i]) => /* @__PURE__ */ t.createElement("button", { key: s, disabled: !0, title: e("later_title", { n: i }) }, /* @__PURE__ */ t.createElement("span", null, e(s)), /* @__PURE__ */ t.createElement("small", null, e("later", { n: i })))));
}
const Xa = [1, 2, 4, 8, 0];
function Fn(e, n) {
  const o = Math.min(n, it - 1), r = Math.floor(o / wt), a = n >= it ? wt : o % wt, s = 8 + Math.floor(a / 60), i = a % 60;
  return { day: e(`day${r}`), time: `${s}:${String(i).padStart(2, "0")}` };
}
function eo({ t: e, clock: n, speed: o, onSpeed: r, onLaunch: a, onFinish: s, paused: i, onPause: d }) {
  if (!n) return null;
  const { day: p, time: k } = Fn(e, n.minute), _ = Math.floor(n.minute * 100 / it);
  return /* @__PURE__ */ t.createElement("div", { className: "card week-clock", "aria-live": "off" }, /* @__PURE__ */ t.createElement("div", { className: "clock-line" }, /* @__PURE__ */ t.createElement("strong", null, e("clock_line", { w: n.week, day: n.running ? p : e("planning"), time: n.running ? k : "" })), /* @__PURE__ */ t.createElement("small", null, e("walking_now", { n: n.walking.toLocaleString() }))), /* @__PURE__ */ t.createElement(
    "div",
    {
      className: "week-bar",
      role: "progressbar",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": _,
      "aria-label": e("week_bar", { w: n.week, pct: _ }),
      title: e("week_bar", { w: n.week, pct: _ })
    },
    [0, 1, 2, 3, 4].map((u) => /* @__PURE__ */ t.createElement("i", { key: u })),
    /* @__PURE__ */ t.createElement("b", { style: { width: `${_}%` } })
  ), n.gameOver ? /* @__PURE__ */ t.createElement("p", { className: "note" }, e("game_over")) : /* @__PURE__ */ t.createElement("div", { className: "clock-buttons" }, n.running ? /* @__PURE__ */ t.createElement(t.Fragment, null, /* @__PURE__ */ t.createElement("button", { className: "main", "aria-pressed": i, onClick: d }, e("pause")), /* @__PURE__ */ t.createElement("button", { className: "main", onClick: s }, e("finish"))) : /* @__PURE__ */ t.createElement("button", { className: "main", onClick: a }, e("launch")), /* @__PURE__ */ t.createElement("span", { className: "speeds", "aria-label": e("speed") }, Xa.map((u) => /* @__PURE__ */ t.createElement("button", { key: u, "aria-pressed": o === u, onClick: () => r(u) }, u === 0 ? e("speed_max") : `${u}×`)))));
}
const to = (e) => "★".repeat(Math.floor(e / 2)) + (e % 2 ? "½" : "");
function no({ person: e, gangs: n, t: o, onClose: r }) {
  const a = e.gang > 0 ? n[e.gang - 1] : null, s = (d, p) => /* @__PURE__ */ t.createElement("div", null, /* @__PURE__ */ t.createElement("dt", null, o(d)), /* @__PURE__ */ t.createElement("dd", null, p)), i = e.walking ? o("pc_walking") : e.building >= 0 ? o("pc_inside") : o("pc_standing");
  return /* @__PURE__ */ t.createElement("aside", { className: "card building-card person-card", "aria-live": "polite" }, /* @__PURE__ */ t.createElement("header", null, /* @__PURE__ */ t.createElement("span", { className: "swatch", style: { background: a ? pe[a.colour % 4] : "#b9ab8f", borderRadius: "50%" } }), /* @__PURE__ */ t.createElement("div", null, /* @__PURE__ */ t.createElement("h3", null, e.name), /* @__PURE__ */ t.createElement("div", { className: "sub" }, o(`role_${e.role}`), " · #", e.id)), /* @__PURE__ */ t.createElement("button", { className: "close", onClick: r, "aria-label": o("pc_close") }, "×")), /* @__PURE__ */ t.createElement("dl", null, s("pc_gang", a ? o("g_name", { name: a.name }) : o("pc_none")), s("pc_where", i), a && e.role !== "boss" && s("pc_pay", `$${e.pay}`), a && e.role !== "boss" && s("pc_demand", `$${e.demand}`), a && s("pc_loyalty", `${e.loyalty.toFixed(2)} %`), a && s("pc_attitude", `${e.hostility} / ${e.fear}`)), /* @__PURE__ */ t.createElement("h4", null, o("pc_skills")), /* @__PURE__ */ t.createElement("dl", { className: "skills" }, Mn.map((d, p) => /* @__PURE__ */ t.createElement("div", { key: d }, /* @__PURE__ */ t.createElement("dt", null, o(`sk_${d}`)), /* @__PURE__ */ t.createElement("dd", null, to(e.skills[p]))))));
}
function ao({ gangs: e, t: n, names: o, onPerson: r, onClose: a }) {
  const s = (d) => d >= 0 ? /* @__PURE__ */ t.createElement("button", { className: "link", key: d, onClick: () => r(d) }, o(d)) : /* @__PURE__ */ t.createElement("span", { key: "none" }, "—"), i = e.findIndex((d) => d.player);
  return /* @__PURE__ */ t.createElement("aside", { className: "drawer gang-panel", "aria-label": n("g_title") }, /* @__PURE__ */ t.createElement("header", null, /* @__PURE__ */ t.createElement("h2", null, n("g_title")), /* @__PURE__ */ t.createElement("button", { className: "close", onClick: a, "aria-label": n("pc_close") }, "×")), e.map((d) => /* @__PURE__ */ t.createElement("section", { key: d.id }, /* @__PURE__ */ t.createElement("h3", null, /* @__PURE__ */ t.createElement("span", { className: "swatch", style: { background: pe[d.colour % 4] } }), " ", n("g_name", { name: d.name }), /* @__PURE__ */ t.createElement("small", null, " · ", d.player ? n("g_player") : n("g_rival", { p: d.profile }), d.eliminated ? ` · ${n("g_out")}` : "")), /* @__PURE__ */ t.createElement("dl", null, /* @__PURE__ */ t.createElement("div", null, /* @__PURE__ */ t.createElement("dt", null, n("g_boss")), /* @__PURE__ */ t.createElement("dd", null, s(d.boss))), /* @__PURE__ */ t.createElement("div", null, /* @__PURE__ */ t.createElement("dt", null, n("g_lt")), /* @__PURE__ */ t.createElement("dd", null, s(d.lieutenant))), /* @__PURE__ */ t.createElement("div", null, /* @__PURE__ */ t.createElement("dt", null, n("g_crew")), /* @__PURE__ */ t.createElement("dd", null, d.crew.length ? d.crew.map(s) : "—")), /* @__PURE__ */ t.createElement("div", null, /* @__PURE__ */ t.createElement("dt", null, n("g_pool")), /* @__PURE__ */ t.createElement("dd", null, d.pool.length ? d.pool.map(s) : "—")), /* @__PURE__ */ t.createElement("div", null, /* @__PURE__ */ t.createElement("dt", null, n("g_manager")), /* @__PURE__ */ t.createElement("dd", null, s(d.manager))), /* @__PURE__ */ t.createElement("div", null, /* @__PURE__ */ t.createElement("dt", null, n("g_front")), /* @__PURE__ */ t.createElement("dd", null, ce[d.frontType] ?? "—")), /* @__PURE__ */ t.createElement("div", null, /* @__PURE__ */ t.createElement("dt", null, n("g_cash")), /* @__PURE__ */ t.createElement("dd", null, "$", d.cash.toLocaleString())), /* @__PURE__ */ t.createElement("div", null, /* @__PURE__ */ t.createElement("dt", null, n("g_wages")), /* @__PURE__ */ t.createElement("dd", null, "$", d.wages.toLocaleString()))), /* @__PURE__ */ t.createElement("p", { className: "sum" }, n("g_kit", { p: d.pistols, c: d.coupes, cp: d.crewPistols, cc: d.crewCoupes })), /* @__PURE__ */ t.createElement("p", { className: "sum" }, n("g_protects", { n: d.protectedCount })), !d.player && i >= 0 && /* @__PURE__ */ t.createElement("p", { className: "sum" }, n("g_offers", { s: n(`st_${d.offered[i]}`) })))));
}
const ge = { small: [36, 28], standard: [40, 32], large: [44, 35] };
function oo({ lang: e, seed: n, size: o, onStart: r, onCancel: a }) {
  const s = (c, h) => Pt(e, c, h), [i, d] = t.useState(String(n)), [p, k] = t.useState(o), _ = /^\d{1,10}$/.test(i.trim()) ? Number(i.trim()) : NaN, u = Number.isInteger(_) && _ <= 4294967295;
  return /* @__PURE__ */ t.createElement(
    "div",
    {
      className: "overlay open",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "ng-title",
      onKeyDown: (c) => {
        c.key === "Escape" && a();
      }
    },
    /* @__PURE__ */ t.createElement("form", { className: "box", onSubmit: (c) => {
      c.preventDefault(), u && r(_, p);
    } }, /* @__PURE__ */ t.createElement("h2", { id: "ng-title" }, s("ng_title")), /* @__PURE__ */ t.createElement("label", null, s("ng_seed"), /* @__PURE__ */ t.createElement("input", { autoFocus: !0, inputMode: "numeric", value: i, onChange: (c) => d(c.target.value), "aria-invalid": !u })), !u && /* @__PURE__ */ t.createElement("p", { className: "warn" }, s("seed_bad")), /* @__PURE__ */ t.createElement("fieldset", null, /* @__PURE__ */ t.createElement("legend", null, s("ng_size")), Object.keys(ge).map((c) => /* @__PURE__ */ t.createElement("label", { key: c, className: "choice" }, /* @__PURE__ */ t.createElement("input", { type: "radio", name: "size", checked: p === c, onChange: () => k(c) }), s(c), " ", /* @__PURE__ */ t.createElement("small", null, s("size_note", { w: ge[c][0], h: ge[c][1] }))))), /* @__PURE__ */ t.createElement("div", { className: "row" }, /* @__PURE__ */ t.createElement("button", { type: "button", className: "main", onClick: a }, s("cancel")), /* @__PURE__ */ t.createElement("button", { type: "submit", className: "main", disabled: !u }, s("ng_start"))))
  );
}
const ro = ["alliance", "peace", "ceasefire", "aggression", "war"], so = 255;
function lo(e) {
  return new Int32Array(e.memory.buffer, e.hs_draw_ptr(3), e.hs_draw_len(3)).slice();
}
function io(e) {
  const n = (o) => new Int32Array(e.memory.buffer, e.hs_draw_ptr(o), e.hs_draw_len(o)).slice();
  return { cars: n(bt.cars), fleet: n(bt.fleet), trams: n(bt.trams) };
}
function he(e, n) {
  const o = e.hs_get(Y.person, n, q.nameLength);
  let r = "";
  for (let a = 1; a <= o; a++) r += String.fromCharCode(e.hs_name_char(n, a));
  return r;
}
function _n(e, n) {
  if (n < 0 || n >= e.hs_count(F.people)) return null;
  const o = (r) => e.hs_get(Y.person, n, r);
  return {
    index: n,
    id: o(q.id),
    name: he(e, n),
    role: Ka[o(q.role)],
    gang: o(q.gang),
    female: o(q.female) === 1,
    skills: Mn.map((r, a) => o(q.skill + a)),
    pay: o(q.pay),
    demand: o(q.demand),
    loyalty: o(q.loyalty) / so,
    building: o(q.building),
    x: o(q.x) / Ne,
    y: o(q.y) / Ne,
    walking: o(q.walking) === 1,
    hostility: o(q.hostility),
    fear: o(q.fear),
    opinion: [1, 2, 3, 4].map((r) => o(q.opinion + r))
  };
}
function vt(e) {
  const n = [];
  for (let o = 1; o <= 4; o++) {
    const r = (p) => e.hs_get(Y.gang, o, p), a = r(D.office), s = r(D.front), i = [], d = [];
    for (let p = 1; p <= r(D.crewCount); p++) i.push(e.hs_get(Y.crew, o, p));
    for (let p = 1; p <= r(D.poolCount); p++) d.push(e.hs_get(Y.pool, o, p));
    n.push({
      id: o,
      colour: r(D.colour),
      name: zt[r(D.surname)] ?? "?",
      player: r(D.player) === 1,
      profile: r(D.profile),
      boss: r(D.boss),
      cash: r(D.cash),
      office: a,
      officeLot: a >= 0 ? e.hs_get(Y.building, a, Ae.lot) : -1,
      front: s,
      frontType: s >= 0 ? e.hs_get(Y.building, s, Ae.type) : -1,
      manager: r(D.manager),
      lieutenant: r(D.lieutenant),
      crew: i,
      pool: d,
      pistols: r(D.pistols),
      coupes: r(D.coupes),
      crewPistols: r(D.crewPistols),
      crewCoupes: r(D.crewCoupes),
      wages: r(D.wages),
      eliminated: r(D.eliminated) === 1,
      offered: [1, 2, 3, 4].map((p) => ro[r(D.offered + p)] ?? "peace"),
      protectedCount: 0
    });
  }
  return n;
}
function co(e, n, o) {
  for (let r = 0; r < n; r++) {
    const a = e.hs_get(Y.premises, r, sa.protectGang);
    a >= 1 && a <= 4 && o[a - 1].protectedCount++;
  }
}
function uo(e) {
  return {
    week: e.hs_count(F.week),
    minute: e.hs_count(F.minute),
    running: e.hs_count(F.phase) === 1,
    gameOver: e.hs_count(F.gameOver) === 1,
    walking: e.hs_count(F.walking)
  };
}
function _o({ city: e, selected: n, onSelect: o, turnSignal: r, visible: a, label: s, people: i, gangColours: d, person: p, onPerson: k, focus: _, markers: u, vehicles: c }) {
  const h = Pe(null), m = Pe(null);
  return U(() => {
    if (!h.current) return;
    const N = new Ta(h.current);
    m.current = N;
    const g = new ResizeObserver(() => N.update());
    return g.observe(h.current), () => {
      g.disconnect(), N.dispose(), m.current = null;
    };
  }, []), U(() => {
    m.current?.setCity(e);
  }, [e]), U(() => {
    m.current?.select(n);
  }, [n, e]), U(() => {
    r && m.current?.turn();
  }, [r]), U(() => {
    i && m.current?.setPeople(i, d, p);
  }, [i, d, p, e]), U(() => {
    c && m.current?.setVehicles(c.cars, c.fleet, c.trams, d);
  }, [c, d, e]), U(() => {
    _ && m.current?.lookAt(_.x, _.y);
  }, [_]), U(() => {
    m.current?.setMarkers(u);
  }, [u, e]), U(() => {
    a && m.current?.update();
  }, [a]), U(() => {
    const N = h.current;
    if (!N) return;
    const g = /* @__PURE__ */ new Map();
    let y = 0, w = 0;
    const f = (v) => {
      if (N.setPointerCapture(v.pointerId), g.set(v.pointerId, { x: v.clientX, y: v.clientY }), y = 0, g.size === 2) {
        const [O, I] = [...g.values()];
        w = Math.hypot(O.x - I.x, O.y - I.y);
      }
    }, $ = (v) => {
      const O = g.get(v.pointerId);
      if (!(!O || !m.current) && (g.size === 1 && (m.current.drag(v.clientX - O.x, v.clientY - O.y), y += Math.abs(v.clientX - O.x) + Math.abs(v.clientY - O.y)), g.set(v.pointerId, { x: v.clientX, y: v.clientY }), g.size === 2)) {
        const [I, ue] = [...g.values()], X = Math.hypot(I.x - ue.x, I.y - ue.y);
        w > 0 && m.current.zoomBy(X / w), w = X, y = 99;
      }
    }, S = (v) => {
      if (g.size === 1 && y < 4 && m.current) {
        const O = m.current.pick(v.clientX, v.clientY);
        O.person >= 0 ? k(O.person) : o(O.lot);
      }
      g.delete(v.pointerId), g.size < 2 && (w = 0);
    }, b = (v) => {
      v.preventDefault(), m.current?.zoomBy(Math.exp(-v.deltaY * 15e-4));
    };
    return N.addEventListener("pointerdown", f), N.addEventListener("pointermove", $), N.addEventListener("pointerup", S), N.addEventListener("pointercancel", S), N.addEventListener("wheel", b, { passive: !1 }), () => {
      N.removeEventListener("pointerdown", f), N.removeEventListener("pointermove", $), N.removeEventListener("pointerup", S), N.removeEventListener("pointercancel", S), N.removeEventListener("wheel", b);
    };
  }, [o, k]), U(() => {
    const N = (g) => {
      if (!a || !m.current || g.target instanceof HTMLElement && g.target.closest("input, textarea")) return;
      const y = 60, w = { ArrowLeft: [y, 0], ArrowRight: [-y, 0], ArrowUp: [0, y], ArrowDown: [0, -y] };
      w[g.key] ? (g.preventDefault(), m.current.drag(...w[g.key])) : g.key === "+" || g.key === "=" ? m.current.zoomBy(1.25) : g.key === "-" && m.current.zoomBy(0.8);
    };
    return window.addEventListener("keydown", N), () => window.removeEventListener("keydown", N);
  }, [a]), /* @__PURE__ */ t.createElement("canvas", { className: "street-view", ref: h, "aria-label": s, style: { visibility: a ? "visible" : "hidden" } });
}
function mo({ lang: e }) {
  switch (e) {
    case "de":
      return /* @__PURE__ */ t.createElement("svg", { viewBox: "0 0 5 3", "aria-hidden": "true" }, /* @__PURE__ */ t.createElement("path", { fill: "#000", d: "M0 0h5v1H0z" }), /* @__PURE__ */ t.createElement("path", { fill: "#D00", d: "M0 1h5v1H0z" }), /* @__PURE__ */ t.createElement("path", { fill: "#FFCE00", d: "M0 2h5v1H0z" }));
    case "es":
      return /* @__PURE__ */ t.createElement("svg", { viewBox: "0 0 4 3", "aria-hidden": "true" }, /* @__PURE__ */ t.createElement("path", { fill: "#AA151B", d: "M0 0h4v3H0z" }), /* @__PURE__ */ t.createElement("path", { fill: "#F1BF00", d: "M0 .75h4v1.5H0z" }));
    case "fr":
      return /* @__PURE__ */ t.createElement("svg", { viewBox: "0 0 3 2", "aria-hidden": "true" }, /* @__PURE__ */ t.createElement("path", { fill: "#002395", d: "M0 0h1v2H0z" }), /* @__PURE__ */ t.createElement("path", { fill: "#fff", d: "M1 0h1v2H1z" }), /* @__PURE__ */ t.createElement("path", { fill: "#ED2939", d: "M2 0h1v2H2z" }));
    default:
      return /* @__PURE__ */ t.createElement("svg", { viewBox: "0 0 60 30", "aria-hidden": "true" }, /* @__PURE__ */ t.createElement("clipPath", { id: "gb-a" }, /* @__PURE__ */ t.createElement("path", { d: "M0,0v30h60V0z" })), /* @__PURE__ */ t.createElement("clipPath", { id: "gb-b" }, /* @__PURE__ */ t.createElement("path", { d: "M30,15h30v15zv15H0zH0V0zV0h30z" })), /* @__PURE__ */ t.createElement("g", { clipPath: "url(#gb-a)" }, /* @__PURE__ */ t.createElement("path", { d: "M0,0v30h60V0z", fill: "#012169" }), /* @__PURE__ */ t.createElement("path", { d: "M0,0L60,30M60,0L0,30", stroke: "#fff", strokeWidth: "6" }), /* @__PURE__ */ t.createElement("path", { d: "M0,0L60,30M60,0L0,30", clipPath: "url(#gb-b)", stroke: "#C8102E", strokeWidth: "4" }), /* @__PURE__ */ t.createElement("path", { d: "M30,0v30M0,15h60", stroke: "#fff", strokeWidth: "10" }), /* @__PURE__ */ t.createElement("path", { d: "M30,0v30M0,15h60", stroke: "#C8102E", strokeWidth: "6" })));
  }
}
const Te = { last: 64, messages: 65, cityVersion: 66, playerGang: 68, avenueCol: 100, avenueRow: 104 }, Q = { crews: 10, gangCrews: 11, order: 12, last: 13, message: 14, preview: 15 }, Z = {
  id: 0,
  lieutenant: 2,
  count: 3,
  pistols: 4,
  coupes: 5,
  orderCount: 6,
  timeUsed: 7,
  nameFirst: 8,
  men: 9,
  speedsters: 11,
  trucks: 12,
  member: 20,
  order: 40
}, A = {
  id: 0,
  gang: 1,
  crew: 2,
  kind: 3,
  state: 4,
  manpower: 5,
  repeat: 6,
  amount: 7,
  level: 8,
  business: 9,
  front: 10,
  px: 11,
  py: 12,
  hasPoint: 13,
  targets: 14,
  blocks: 15,
  assigned: 16,
  completed: 18,
  estimate: 19,
  worked: 20,
  started: 21,
  finished: 22,
  results: 24,
  cost: 25,
  fail: 30,
  waiting: 35,
  hasTime: 45,
  staffing: 46,
  target: 100,
  block: 200,
  person: 220,
  result: 300
}, ie = { building: 1, block: 2, point: 3, amount: 4, level: 5, business: 6, front: 7, repeat: 8 }, J = { cancel: 1, setPay: 2, sack: 3, promote: 4, demote: 5, moveToCrew: 6, moveToPool: 7, repeat: 8, buyVehicle: 9 }, ho = [{ kind: 0, cost: 5e3, seats: 2 }, { kind: 1, cost: 3e3, seats: 4 }, { kind: 2, cost: 3e3, seats: 10 }], po = 3, go = 13, fe = [
  "buy",
  "setUp",
  "run",
  "collect",
  "adjust",
  "donate",
  "cleanUp",
  "clearStreets",
  "guard",
  "patrol",
  "explore",
  "recruit",
  "goTo"
], mn = {
  buy: { target: "building", max: 2, group: "business" },
  setUp: { target: "building", max: 2, group: "business" },
  run: { target: "building", max: 2, group: "business" },
  collect: { target: "area", max: 10, group: "business" },
  adjust: { target: "area", max: 1, group: "business" },
  donate: { target: "building", max: 4, group: "business" },
  cleanUp: { target: "area", max: 4, group: "business" },
  clearStreets: { target: "area", max: 4, group: "business" },
  guard: { target: "building", max: 4, group: "personnel" },
  patrol: { target: "area", max: 4, group: "personnel" },
  explore: { target: "area", max: 10, group: "personnel" },
  recruit: { target: "area", max: 10, group: "personnel" },
  goTo: { target: "point", max: 4, group: "personnel" }
}, fo = ["queued", "travelling", "waiting", "executing", "done", "failed", "cancelled"], Dt = [
  "L_None",
  "L_Bought",
  "L_Opened",
  "L_New_Management",
  "L_Collected",
  "L_Refused_Pay",
  "L_Already_Paid",
  "L_Protection_Set",
  "L_Donated",
  "L_Cleaned_Up",
  "L_Cleared",
  "L_Looked_Over",
  "L_Found_Hidden",
  "L_Nobody_Hiring",
  "L_Signed_On",
  "L_Nobody_Willing",
  "L_Stood_Guard",
  "L_Patrolled",
  "L_Held",
  "L_Ran_Out",
  "L_Continuing",
  "F_No_Site",
  "F_Owned_Already",
  "F_Not_For_Sale",
  "F_Price",
  "F_Not_Yours",
  "F_No_Type",
  "F_Illegal_Centre",
  "F_Legal_Centre",
  "F_City_Only",
  "F_No_Front",
  "F_Front_Taken",
  "F_Fit_Out",
  "F_Not_Your_Site",
  "F_No_Hood_Free",
  "F_No_Charity",
  "F_No_Donation",
  "F_Spare_Money",
  "F_Clean_Up_Money",
  "F_Streets_Not_Bribed",
  "F_Site_Gone",
  "F_Nobody_Left",
  "F_Never_Started",
  "F_Not_Enough_Time",
  "F_Nothing_Came",
  "F_Needs_People",
  "F_Needs_Free",
  "F_Target_Lost",
  "F_Never_Started_Default",
  "M_Acquired",
  "M_Opened",
  "M_Refused_Protection",
  "M_Uncovered",
  "M_Order_Failed",
  "M_Order_Cut_Short",
  "M_Queued_Waiting"
], Pn = [
  "Y_None",
  "Y_Accepted",
  "Y_Cancelled",
  "Y_Back_On_Street",
  "Y_Promoted",
  "Y_Broken_Up",
  "Y_Joined",
  "Y_Already_In",
  "Y_Bought",
  "Y_Done",
  "Y_No_Crew",
  "Y_Lt_Unavailable",
  "Y_Positive_Whole",
  "Y_Only_People",
  "Y_At_Most",
  "Y_Staffing",
  "Y_Valid_Amount",
  "Y_Donation_Zero",
  "Y_Streets",
  "Y_Rate",
  "Y_No_Block",
  "Y_No_Site",
  "Y_Valid_Site",
  "Y_Site_Not_Valid",
  "Y_Inside_City",
  "Y_Nothing_There",
  "Y_Cannot_Afford",
  "Y_No_Time_Trim",
  "Y_No_Time",
  "Y_Too_Many_Orders",
  "Y_No_Order",
  "Y_No_Person",
  "Y_Choose_Hood",
  "Y_Not_In_Pool",
  "Y_Max_Lieutenants",
  "Y_Could_Not_Promote",
  "Y_Choose_Hood_Crew",
  "Y_Crew_Full",
  "Y_Choose_Crew_Hood",
  "Y_Cannot_Afford_It"
], bo = Pn.indexOf("Y_Done"), De = (e, n) => ({
  kind: Dt[e(n)] ?? "L_None",
  a: e(n + 1),
  b: e(n + 2),
  c: e(n + 3),
  d: e(n + 4)
}), dt = (e) => e.hs_count(Te.playerGang);
function Oe(e, n) {
  const o = [], r = e.hs_get(Q.gangCrews, n, 0);
  for (let a = 1; a <= r; a++) {
    const s = e.hs_get(Q.gangCrews, n, a);
    if (s < 0) continue;
    const i = (k) => e.hs_get(Q.crews, s, k), d = i(Z.count), p = i(Z.orderCount);
    o.push({
      slot: s,
      id: i(Z.id),
      lieutenant: i(Z.lieutenant),
      nameFirst: i(Z.nameFirst),
      members: Array.from({ length: d }, (k, _) => i(Z.member + _ + 1)),
      orders: Array.from({ length: p }, (k, _) => i(Z.order + _ + 1)),
      timeUsed: i(Z.timeUsed),
      men: i(Z.men),
      pistols: i(Z.pistols),
      coupes: i(Z.coupes),
      speedsters: i(Z.speedsters),
      trucks: i(Z.trucks)
    });
  }
  return o;
}
function Fe(e) {
  return `${zt[e.nameFirst] ?? "?"}'s Crew`;
}
function jt(e, n, o) {
  const r = (s) => e.hs_get(n, o, s), a = (s, i) => Array.from({ length: i }, (d, p) => r(s + p));
  return {
    slot: o,
    id: r(A.id),
    crew: r(A.crew),
    kind: fe[r(A.kind)],
    state: fo[r(A.state)],
    manpower: r(A.manpower),
    repeat: r(A.repeat) === 1,
    amount: r(A.amount),
    level: r(A.level),
    business: r(A.business),
    front: r(A.front),
    point: r(A.hasPoint) === 1 ? { x: r(A.px), y: r(A.py) } : null,
    targets: a(A.target, r(A.targets)),
    blocks: a(A.block, r(A.blocks)),
    assigned: a(A.person, r(A.assigned)),
    completed: r(A.completed),
    estimate: r(A.estimate),
    worked: r(A.worked),
    started: r(A.started),
    finished: r(A.finished),
    cost: r(A.cost),
    fail: De(r, A.fail),
    waiting: De(r, A.waiting),
    results: Array.from({ length: r(A.results) }, (s, i) => De(r, A.result + 5 * i))
  };
}
const An = (e, n) => jt(e, Q.order, n);
function Tn(e, n) {
  const o = [];
  for (let r = 0; r < e.hs_count(Te.last); r++)
    e.hs_get(Q.last, r, A.gang) === n && o.push(jt(e, Q.last, r));
  return o;
}
function wo(e) {
  return Array.from({ length: e.hs_count(Te.messages) }, (n, o) => De((r) => e.hs_get(Q.message, o + 1, r), 0));
}
const Gt = (e, n) => ({
  crew: e,
  kind: n,
  manpower: 1,
  buildings: [],
  blocks: [],
  point: null,
  amount: -1,
  level: -1,
  business: -1,
  front: -1,
  repeat: !1
});
function Bn(e, n) {
  e.hs_order_begin(n.crew, fe.indexOf(n.kind), n.manpower);
  for (const o of n.buildings) e.hs_order_add(ie.building, o, 0);
  for (const o of n.blocks) e.hs_order_add(ie.block, o, 0);
  n.point && e.hs_order_add(ie.point, n.point.x, n.point.y), n.amount !== -1 && e.hs_order_add(ie.amount, n.amount, 0), n.level !== -1 && e.hs_order_add(ie.level, n.level, 0), n.business !== -1 && e.hs_order_add(ie.business, n.business, 0), n.front !== -1 && e.hs_order_add(ie.front, n.front, 0), n.repeat && e.hs_order_add(ie.repeat, 1, 0);
}
function Yn(e, n) {
  if (Bn(e, n), e.hs_order_preview() !== 1) return null;
  const o = (r) => e.hs_get(Q.preview, 0, r);
  return { order: jt(e, Q.preview, 0), hasTime: o(A.hasTime) === 1, staffing: De(o, A.staffing) };
}
function xn(e, n) {
  const o = e.hs_reply(5);
  return {
    kind: Pn[n] ?? "Y_None",
    ok: n >= 1 && n <= bo,
    a: e.hs_reply(1),
    b: e.hs_reply(2),
    c: e.hs_reply(3),
    d: e.hs_reply(4),
    kept: Array.from({ length: o }, (r, a) => e.hs_reply(10 + a)),
    slot: e.hs_reply(6)
  };
}
function Rn(e, n) {
  return Bn(e, n), xn(e, e.hs_order_issue());
}
function je(e, n, o, r = 0) {
  return xn(e, e.hs_command(n, o, r));
}
function On(e) {
  const n = (o) => [0, 1, 2, 3].map((r) => e.hs_count(o + r)).filter((r) => r >= 0);
  return { cols: n(Te.avenueCol), rows: n(Te.avenueRow) };
}
function St(e, n) {
  const o = e.cols.includes(n - 1) ? n - 1 : n;
  return `${tt[(o % tt.length + tt.length) % tt.length]} Ave`;
}
function Ct(e, n) {
  const o = e.rows.includes(n - 1) ? n - 1 : n;
  return `${nt[(o % nt.length + nt.length) % nt.length]} St`;
}
function Ht(e, n) {
  return n < 0 ? "nowhere" : e.hs_get(Y.building, n, po) === 0 ? "Empty land" : ce[e.hs_get(Y.building, n, Ae.type)] ?? "unknown";
}
function zn(e, n, o, r) {
  const a = Ht(e, r), s = n.lots[e.hs_get(Y.building, r, Ae.lot)], i = s ? n.blocks[s.block] : void 0;
  if (!s || !i) return a;
  if (!n.standard && (i.use === 2 || e.hs_get(Y.block, i.id, go) >= 0)) {
    const c = ["north", "east", "south", "west"][s.face], h = i.gx + (c === "east" ? i.spanX : 0), m = i.gy + (c === "south" ? i.spanY : 0);
    return `${a} on ${c === "east" || c === "west" ? St(o, h) : Ct(o, m)}`;
  }
  const p = s.index % 3, k = Math.floor(s.index / 3), _ = p === 2 ? i.gx + 1 : i.gx, u = k === 2 ? i.gy + 1 : i.gy;
  return k === 1 && p !== 1 ? `${a} on ${St(o, _)} at ${Ct(o, u)}` : `${a} on ${Ct(o, u)} at ${St(o, _)}`;
}
function hn(e, n, o) {
  return o >= 0 && o < n.lots.length ? e.hs_get(Y.lot, o, 7) : -1;
}
const pn = (e) => e.hs_count(Te.cityVersion), ko = { "en-GB": "en-US", de: "de-DE", es: "es-ES", fr: "fr-FR" }, ae = (e, n) => "$" + n.toLocaleString(ko[e]);
function ut(e) {
  const n = Math.round(e), o = Math.abs(n), r = Math.floor(o / 60), a = o % 60, s = n < 0 ? "−" : "";
  return r ? `${s}${r}h ${a}m` : `${s}${a}m`;
}
const yo = {
  "en-GB": {
    buy: "Buy Premises",
    setUp: "Set Up Business",
    run: "Run Business",
    collect: "Collect Protection",
    adjust: "Adjust Protection",
    donate: "Donate to Charity",
    cleanUp: "Clean-up Drive",
    clearStreets: "Clear the Streets",
    guard: "Guard Business",
    patrol: "Patrol",
    explore: "Explore",
    recruit: "Recruit",
    goTo: "Go To"
  },
  de: {
    buy: "Gebäude kaufen",
    setUp: "Geschäft eröffnen",
    run: "Geschäft führen",
    collect: "Schutzgeld kassieren",
    adjust: "Schutzgeld anpassen",
    donate: "Spenden",
    cleanUp: "Aufräumaktion",
    clearStreets: "Straßen räumen",
    guard: "Geschäft bewachen",
    patrol: "Streife",
    explore: "Erkunden",
    recruit: "Anwerben",
    goTo: "Gehe zu"
  },
  es: {
    buy: "Comprar local",
    setUp: "Abrir negocio",
    run: "Llevar negocio",
    collect: "Cobrar protección",
    adjust: "Ajustar protección",
    donate: "Donar",
    cleanUp: "Campaña de limpieza",
    clearStreets: "Despejar las calles",
    guard: "Vigilar negocio",
    patrol: "Patrulla",
    explore: "Explorar",
    recruit: "Reclutar",
    goTo: "Ir a"
  },
  fr: {
    buy: "Acheter des locaux",
    setUp: "Ouvrir une affaire",
    run: "Gérer une affaire",
    collect: "Encaisser la protection",
    adjust: "Ajuster la protection",
    donate: "Faire un don",
    cleanUp: "Opération nettoyage",
    clearStreets: "Dégager les rues",
    guard: "Garder une affaire",
    patrol: "Patrouille",
    explore: "Explorer",
    recruit: "Recruter",
    goTo: "Aller à"
  }
}, Ge = (e, n) => yo[e][n], Dn = {
  L_Bought: "Bought {place} for {b$}.",
  L_Opened: "Opened a {type}.",
  L_New_Management: "New management installed at {place}.",
  L_Collected: "Collected {b$} from {place}.",
  L_Refused_Pay: "{owner} refused to pay.",
  L_Already_Paid: "{place} has already paid this week.",
  L_Protection_Set: "Protection at {place} set to {b$}.",
  L_Donated: "Donated {b$} to {place}.",
  L_Cleaned_Up: "Cleaned up round {place}.",
  L_Cleared: "The streets round {place} were cleared.",
  L_Looked_Over: "Looked over {place}: {standing}.",
  owned_by: "owned by {who}",
  paying_to: "paying {d$} a week to {who}",
  paying_nobody: "paying nobody",
  you: "you",
  L_Found_Hidden: "Found a {hidden} behind {place}.",
  L_Nobody_Hiring: "Nobody worth hiring at {place}.",
  L_Nobody_Hiring_Else: "Nobody worth hiring at {place} — word is there are people looking for work at {else}.",
  L_Signed_On_1: "1 hood signed on, waiting in the pool.",
  L_Signed_On_n: "{b} hoods signed on, waiting in the pool.",
  L_Nobody_Willing: "Nobody new was willing to work for you.",
  L_Stood_Guard: "Stood guard at {place} for {bhm}.",
  L_Patrolled_1: "Patrolled 1 block for {chm}.",
  L_Patrolled_n: "Patrolled {b} blocks for {chm}.",
  L_Held: "Held position for {bhm}.",
  L_Ran_Out: "Ran out of week before finishing every target.",
  L_Continuing: "{order}: continuing with {b} of {c} people; the others are unavailable.",
  F_No_Site: "No such site.",
  F_Owned_Already: "Somebody else already owns it.",
  F_Not_For_Sale: "Those premises are no longer available to buy.",
  F_Price: "You could not cover the asking price.",
  F_Not_Yours: "You do not own that land.",
  F_No_Type: "No business type was chosen.",
  F_Illegal_Centre: "Illegal businesses can only occupy the centre of a block.",
  F_Legal_Centre: "Only illegal businesses belong in the centre of a block.",
  F_City_Only: "Only the city builds those.",
  F_No_Front: "That illegal business has no front on the block.",
  F_Front_Taken: "That front already hides another operation.",
  F_Fit_Out: "You could not afford the fit-out.",
  F_Not_Your_Site: "That is not one of your sites.",
  F_No_Hood_Free: "No hood was free to run {place}.",
  F_No_Charity: "No charity there.",
  F_No_Donation: "No donation was offered.",
  F_Spare_Money: "You could not spare the money.",
  F_Clean_Up_Money: "You could not pay for the clean-up.",
  F_Streets_Not_Bribed: "Neither the mayor nor the police chief will do it for you any more.",
  F_Site_Gone: "The site is gone.",
  F_Nobody_Left: "Nobody was left to carry out the order.",
  F_Never_Started: "The order never started. {inner}",
  F_Not_Enough_Time: "There was not enough time in the week to perform the order.",
  F_Nothing_Came: "Nothing came of it.",
  F_Needs_People: "This order needs {a} people, but only {b} remain in the crew.",
  F_Needs_Free_1: "This order needs {a} people; 1 is {free}.",
  F_Needs_Free_n: "This order needs {a} people; {b} are {free}.",
  available: "available",
  free: "free",
  F_Target_Lost: "The target could not be found.",
  F_Never_Started_Default: "The order never started. No crew was available before the week ended.",
  M_Acquired: "Acquired {place}.",
  M_Opened: "Opened a {type}.",
  M_Refused_Protection: "{place} refused to pay protection.",
  M_Uncovered: "Your hoods uncovered a hidden {hiddenB}.",
  M_Order_Failed: "Order failed: {order} — {inner}",
  M_Order_Cut_Short: "Order cut short: {order} — {inner}",
  M_Queued_Waiting: "{order} is queued: {inner}",
  the_owner: "The owner",
  Y_Accepted: "{lt} accepted the order.",
  Y_Cancelled: "Order cancelled.",
  Y_Back_On_Street: "{pa} is back on the street.",
  Y_Promoted: "{pa} now runs his own crew.",
  Y_Broken_Up: "The crew has been broken up.",
  Y_Joined: "{pa} joined {crewB}.",
  Y_Already_In: "{pa} is already in {crewB}.",
  Y_Done: "",
  Y_No_Crew: "No such crew.",
  Y_Lt_Unavailable: "That lieutenant is not available. Promote somebody to take the crew.",
  Y_Positive_Whole: "Choose a positive whole number of people.",
  Y_Only_People: "{lt} has only {b} people.",
  Y_At_Most_1: "{order} takes at most 1 person.",
  Y_At_Most_n: "{order} takes at most {b} people.",
  Y_Valid_Amount: "Choose a valid amount.",
  Y_Donation_Zero: "A donation must be greater than zero.",
  Y_Streets: "Clearing the streets needs the mayor or the police chief on your side (bribed).",
  Y_Rate: "Choose a protection rate between zero and double.",
  Y_No_Block: "No such block.",
  Y_No_Site: "No such site.",
  Y_Valid_Site: "Choose a valid site for that order.",
  Y_Site_Not_Valid: "That site is not valid for this order.",
  Y_Inside_City: "Choose a place inside the city.",
  Y_Nothing_There: "Nothing there for that order.",
  Y_Cannot_Afford: "You cannot afford it: it costs {a$} and {b$} is left after this week's orders.",
  Y_No_Time_Trim: "{lt} has not got the time for all {b} sites — he could manage {c} of them.",
  Y_No_Time: "{lt} has not got the time. Reduce the area, add manpower, or leave it until next week.",
  Y_Too_Many_Orders: "That crew cannot take more orders this week.",
  Y_No_Order: "No such order.",
  Y_No_Person: "No such person.",
  Y_Choose_Hood: "Choose one of your hoods.",
  Y_Not_In_Pool: "That hood is not in the pool or a crew.",
  Y_Max_Lieutenants: "You already have {a} lieutenants.",
  Y_Could_Not_Promote: "Could not promote.",
  Y_Choose_Hood_Crew: "Choose one of your hoods and one of your crews.",
  Y_Crew_Full: "That crew is full.",
  Y_Choose_Crew_Hood: "Choose one of your crew hoods.",
  Y_Bought: "Bought a {vehicle}.",
  Y_Cannot_Afford_It: "You cannot afford it.",
  V_0: "Speedster",
  V_1: "Coupe",
  V_2: "Truck"
}, Eo = {
  L_Bought: "{place} für {b$} gekauft.",
  L_Opened: "{type} eröffnet.",
  L_New_Management: "Neue Leitung in {place} eingesetzt.",
  L_Collected: "{b$} von {place} kassiert.",
  L_Refused_Pay: "{owner} hat sich geweigert zu zahlen.",
  L_Already_Paid: "{place} hat diese Woche schon gezahlt.",
  L_Protection_Set: "Schutzgeld bei {place} auf {b$} gesetzt.",
  L_Donated: "{b$} an {place} gespendet.",
  L_Cleaned_Up: "Rund um {place} aufgeräumt.",
  L_Cleared: "Die Straßen um {place} wurden geräumt.",
  L_Looked_Over: "{place} angesehen: {standing}.",
  owned_by: "gehört {who}",
  paying_to: "zahlt {d$} pro Woche an {who}",
  paying_nobody: "zahlt niemandem",
  you: "dir",
  L_Found_Hidden: "{hidden} hinter {place} gefunden.",
  L_Nobody_Hiring: "Niemand Brauchbares bei {place}.",
  L_Nobody_Hiring_Else: "Niemand Brauchbares bei {place} — es heißt, bei {else} suchen Leute Arbeit.",
  L_Signed_On_1: "1 Mann angeheuert, wartet im Pool.",
  L_Signed_On_n: "{b} Männer angeheuert, warten im Pool.",
  L_Nobody_Willing: "Niemand Neues wollte für dich arbeiten.",
  L_Stood_Guard: "Wache bei {place} für {bhm}.",
  L_Patrolled_1: "1 Block für {chm} bestreift.",
  L_Patrolled_n: "{b} Blocks für {chm} bestreift.",
  L_Held: "Position für {bhm} gehalten.",
  L_Ran_Out: "Die Woche war vorbei, bevor jedes Ziel erledigt war.",
  L_Continuing: "{order}: weiter mit {b} von {c} Leuten; die anderen sind nicht verfügbar.",
  F_No_Site: "Kein solcher Ort.",
  F_Owned_Already: "Das gehört schon jemand anderem.",
  F_Not_For_Sale: "Das Gebäude ist nicht mehr zu kaufen.",
  F_Price: "Du konntest den Preis nicht aufbringen.",
  F_Not_Yours: "Das Grundstück gehört dir nicht.",
  F_No_Type: "Keine Geschäftsart gewählt.",
  F_Illegal_Centre: "Illegale Geschäfte gehören nur in die Mitte eines Blocks.",
  F_Legal_Centre: "In die Mitte eines Blocks gehören nur illegale Geschäfte.",
  F_City_Only: "Das baut nur die Stadt.",
  F_No_Front: "Dieses illegale Geschäft hat keine Tarnung im Block.",
  F_Front_Taken: "Diese Tarnung versteckt schon ein anderes Geschäft.",
  F_Fit_Out: "Du konntest die Einrichtung nicht bezahlen.",
  F_Not_Your_Site: "Das ist keins deiner Gebäude.",
  F_No_Hood_Free: "Kein Mann war frei, um {place} zu führen.",
  F_No_Charity: "Dort ist keine Wohltätigkeit.",
  F_No_Donation: "Es wurde keine Spende angeboten.",
  F_Spare_Money: "Du konntest das Geld nicht entbehren.",
  F_Clean_Up_Money: "Du konntest die Aufräumaktion nicht bezahlen.",
  F_Streets_Not_Bribed: "Weder der Bürgermeister noch der Polizeichef tun das noch für dich.",
  F_Site_Gone: "Das Gebäude ist weg.",
  F_Nobody_Left: "Niemand war mehr da, um den Befehl auszuführen.",
  F_Never_Started: "Der Befehl hat nie begonnen. {inner}",
  F_Not_Enough_Time: "Die Woche hatte nicht genug Zeit für den Befehl.",
  F_Nothing_Came: "Es ist nichts dabei herausgekommen.",
  F_Needs_People: "Dieser Befehl braucht {a} Leute, aber nur {b} sind im Trupp.",
  F_Needs_Free_1: "Dieser Befehl braucht {a} Leute; 1 ist {free}.",
  F_Needs_Free_n: "Dieser Befehl braucht {a} Leute; {b} sind {free}.",
  available: "verfügbar",
  free: "frei",
  F_Target_Lost: "Das Ziel war nicht zu finden.",
  F_Never_Started_Default: "Der Befehl hat nie begonnen. Vor Wochenende war kein Trupp frei.",
  M_Acquired: "{place} erworben.",
  M_Opened: "{type} eröffnet.",
  M_Refused_Protection: "{place} hat sich geweigert, Schutzgeld zu zahlen.",
  M_Uncovered: "Deine Männer haben ein verstecktes Geschäft entdeckt: {hiddenB}.",
  M_Order_Failed: "Befehl gescheitert: {order} — {inner}",
  M_Order_Cut_Short: "Befehl abgebrochen: {order} — {inner}",
  M_Queued_Waiting: "{order} wartet: {inner}",
  the_owner: "Der Besitzer",
  Y_Accepted: "{lt} hat den Befehl angenommen.",
  Y_Cancelled: "Befehl zurückgenommen.",
  Y_Back_On_Street: "{pa} ist wieder auf der Straße.",
  Y_Promoted: "{pa} führt jetzt einen eigenen Trupp.",
  Y_Broken_Up: "Der Trupp wurde aufgelöst.",
  Y_Joined: "{pa} ist jetzt in {crewB}.",
  Y_Already_In: "{pa} ist schon in {crewB}.",
  Y_Done: "",
  Y_No_Crew: "Kein solcher Trupp.",
  Y_Lt_Unavailable: "Dieser Leutnant ist nicht verfügbar. Befördere jemanden, der den Trupp übernimmt.",
  Y_Positive_Whole: "Wähle eine positive ganze Zahl von Leuten.",
  Y_Only_People: "{lt} hat nur {b} Leute.",
  Y_At_Most_1: "{order} braucht höchstens 1 Person.",
  Y_At_Most_n: "{order} braucht höchstens {b} Leute.",
  Y_Valid_Amount: "Wähle einen gültigen Betrag.",
  Y_Donation_Zero: "Eine Spende muss größer als null sein.",
  Y_Streets: "Zum Räumen der Straßen brauchst du den Bürgermeister oder den Polizeichef auf deiner Seite (bestochen).",
  Y_Rate: "Wähle einen Satz zwischen null und dem Doppelten.",
  Y_No_Block: "Kein solcher Block.",
  Y_No_Site: "Kein solcher Ort.",
  Y_Valid_Site: "Wähle einen gültigen Ort für diesen Befehl.",
  Y_Site_Not_Valid: "Dieser Ort passt nicht zu diesem Befehl.",
  Y_Inside_City: "Wähle einen Ort in der Stadt.",
  Y_Nothing_There: "Dort gibt es nichts für diesen Befehl.",
  Y_Cannot_Afford: "Das kannst du dir nicht leisten: es kostet {a$}, und nach den Befehlen dieser Woche bleiben {b$}.",
  Y_No_Time_Trim: "{lt} hat nicht für alle {b} Orte Zeit — er schafft {c} davon.",
  Y_No_Time: "{lt} hat keine Zeit. Verkleinere das Gebiet, nimm mehr Leute oder warte bis nächste Woche.",
  Y_Too_Many_Orders: "Dieser Trupp kann diese Woche keine Befehle mehr annehmen.",
  Y_No_Order: "Kein solcher Befehl.",
  Y_No_Person: "Keine solche Person.",
  Y_Choose_Hood: "Wähle einen deiner Männer.",
  Y_Not_In_Pool: "Dieser Mann ist weder im Pool noch in einem Trupp.",
  Y_Max_Lieutenants: "Du hast schon {a} Leutnants.",
  Y_Could_Not_Promote: "Beförderung nicht möglich.",
  Y_Choose_Hood_Crew: "Wähle einen deiner Männer und einen deiner Trupps.",
  Y_Crew_Full: "Dieser Trupp ist voll.",
  Y_Choose_Crew_Hood: "Wähle einen Mann aus einem deiner Trupps.",
  Y_Bought: "Gekauft: ein {vehicle}.",
  Y_Cannot_Afford_It: "Das kannst du dir nicht leisten.",
  V_0: "Speedster",
  V_1: "Coupé",
  V_2: "Lastwagen"
}, vo = {
  L_Bought: "Comprado {place} por {b$}.",
  L_Opened: "Abierto: {type}.",
  L_New_Management: "Nueva gerencia en {place}.",
  L_Collected: "Cobrados {b$} de {place}.",
  L_Refused_Pay: "{owner} se negó a pagar.",
  L_Already_Paid: "{place} ya pagó esta semana.",
  L_Protection_Set: "Protección en {place} fijada en {b$}.",
  L_Donated: "Donados {b$} a {place}.",
  L_Cleaned_Up: "Limpieza alrededor de {place}.",
  L_Cleared: "Se despejaron las calles alrededor de {place}.",
  L_Looked_Over: "Revisado {place}: {standing}.",
  owned_by: "propiedad de {who}",
  paying_to: "paga {d$} a la semana a {who}",
  paying_nobody: "no paga a nadie",
  you: "ti",
  L_Found_Hidden: "Encontrado un {hidden} detrás de {place}.",
  L_Nobody_Hiring: "Nadie que valga la pena en {place}.",
  L_Nobody_Hiring_Else: "Nadie que valga la pena en {place} — dicen que hay gente buscando trabajo en {else}.",
  L_Signed_On_1: "1 matón contratado, espera en la reserva.",
  L_Signed_On_n: "{b} matones contratados, esperan en la reserva.",
  L_Nobody_Willing: "Nadie nuevo quiso trabajar para ti.",
  L_Stood_Guard: "Guardia en {place} durante {bhm}.",
  L_Patrolled_1: "Patrullada 1 manzana durante {chm}.",
  L_Patrolled_n: "Patrulladas {b} manzanas durante {chm}.",
  L_Held: "Posición mantenida durante {bhm}.",
  L_Ran_Out: "La semana acabó antes de terminar todos los objetivos.",
  L_Continuing: "{order}: sigue con {b} de {c} personas; las demás no están disponibles.",
  F_No_Site: "No existe ese sitio.",
  F_Owned_Already: "Ya es de otro.",
  F_Not_For_Sale: "Ese local ya no está en venta.",
  F_Price: "No pudiste cubrir el precio.",
  F_Not_Yours: "Ese terreno no es tuyo.",
  F_No_Type: "No se eligió tipo de negocio.",
  F_Illegal_Centre: "Los negocios ilegales solo pueden ocupar el centro de una manzana.",
  F_Legal_Centre: "En el centro de una manzana solo van negocios ilegales.",
  F_City_Only: "Eso solo lo construye la ciudad.",
  F_No_Front: "Ese negocio ilegal no tiene tapadera en la manzana.",
  F_Front_Taken: "Esa tapadera ya oculta otra operación.",
  F_Fit_Out: "No pudiste pagar el acondicionamiento.",
  F_Not_Your_Site: "Ese no es uno de tus sitios.",
  F_No_Hood_Free: "No había ningún matón libre para llevar {place}.",
  F_No_Charity: "Ahí no hay beneficencia.",
  F_No_Donation: "No se ofreció donación.",
  F_Spare_Money: "No pudiste prescindir del dinero.",
  F_Clean_Up_Money: "No pudiste pagar la limpieza.",
  F_Streets_Not_Bribed: "Ni el alcalde ni el jefe de policía lo harán ya por ti.",
  F_Site_Gone: "El sitio ya no existe.",
  F_Nobody_Left: "No quedó nadie para cumplir la orden.",
  F_Never_Started: "La orden no llegó a empezar. {inner}",
  F_Not_Enough_Time: "No hubo tiempo suficiente en la semana para cumplir la orden.",
  F_Nothing_Came: "No salió nada.",
  F_Needs_People: "Esta orden necesita {a} personas, pero solo quedan {b} en la cuadrilla.",
  F_Needs_Free_1: "Esta orden necesita {a} personas; 1 está {free}.",
  F_Needs_Free_n: "Esta orden necesita {a} personas; {b} están {free}.",
  available: "disponible",
  free: "libre",
  F_Target_Lost: "No se encontró el objetivo.",
  F_Never_Started_Default: "La orden no llegó a empezar. No hubo cuadrilla disponible antes del fin de semana.",
  M_Acquired: "Adquirido {place}.",
  M_Opened: "Abierto: {type}.",
  M_Refused_Protection: "{place} se negó a pagar protección.",
  M_Uncovered: "Tus matones descubrieron un negocio oculto: {hiddenB}.",
  M_Order_Failed: "Orden fallida: {order} — {inner}",
  M_Order_Cut_Short: "Orden interrumpida: {order} — {inner}",
  M_Queued_Waiting: "{order} en espera: {inner}",
  the_owner: "El dueño",
  Y_Accepted: "{lt} aceptó la orden.",
  Y_Cancelled: "Orden cancelada.",
  Y_Back_On_Street: "{pa} vuelve a la calle.",
  Y_Promoted: "{pa} dirige ahora su propia cuadrilla.",
  Y_Broken_Up: "La cuadrilla se ha disuelto.",
  Y_Joined: "{pa} se unió a {crewB}.",
  Y_Already_In: "{pa} ya está en {crewB}.",
  Y_Done: "",
  Y_No_Crew: "No existe esa cuadrilla.",
  Y_Lt_Unavailable: "Ese lugarteniente no está disponible. Asciende a alguien para que lleve la cuadrilla.",
  Y_Positive_Whole: "Elige un número entero positivo de personas.",
  Y_Only_People: "{lt} solo tiene {b} personas.",
  Y_At_Most_1: "{order} admite como mucho 1 persona.",
  Y_At_Most_n: "{order} admite como mucho {b} personas.",
  Y_Valid_Amount: "Elige una cantidad válida.",
  Y_Donation_Zero: "Una donación debe ser mayor que cero.",
  Y_Streets: "Despejar las calles requiere al alcalde o al jefe de policía de tu lado (sobornado).",
  Y_Rate: "Elige una tarifa entre cero y el doble.",
  Y_No_Block: "No existe esa manzana.",
  Y_No_Site: "No existe ese sitio.",
  Y_Valid_Site: "Elige un sitio válido para esa orden.",
  Y_Site_Not_Valid: "Ese sitio no vale para esta orden.",
  Y_Inside_City: "Elige un lugar dentro de la ciudad.",
  Y_Nothing_There: "Ahí no hay nada para esa orden.",
  Y_Cannot_Afford: "No te lo puedes permitir: cuesta {a$} y quedan {b$} tras las órdenes de esta semana.",
  Y_No_Time_Trim: "{lt} no tiene tiempo para los {b} sitios — podría con {c}.",
  Y_No_Time: "{lt} no tiene tiempo. Reduce la zona, añade gente o déjalo para la semana que viene.",
  Y_Too_Many_Orders: "Esa cuadrilla no puede aceptar más órdenes esta semana.",
  Y_No_Order: "No existe esa orden.",
  Y_No_Person: "No existe esa persona.",
  Y_Choose_Hood: "Elige a uno de tus matones.",
  Y_Not_In_Pool: "Ese matón no está en la reserva ni en una cuadrilla.",
  Y_Max_Lieutenants: "Ya tienes {a} lugartenientes.",
  Y_Could_Not_Promote: "No se pudo ascender.",
  Y_Choose_Hood_Crew: "Elige a uno de tus matones y una de tus cuadrillas.",
  Y_Crew_Full: "Esa cuadrilla está llena.",
  Y_Choose_Crew_Hood: "Elige a un matón de tus cuadrillas.",
  Y_Bought: "Compraste un {vehicle}.",
  Y_Cannot_Afford_It: "No te lo puedes permitir.",
  V_0: "deportivo",
  V_1: "cupé",
  V_2: "camión"
}, So = {
  L_Bought: "Acheté {place} pour {b$}.",
  L_Opened: "Ouvert : {type}.",
  L_New_Management: "Nouvelle gérance installée à {place}.",
  L_Collected: "Encaissé {b$} de {place}.",
  L_Refused_Pay: "{owner} a refusé de payer.",
  L_Already_Paid: "{place} a déjà payé cette semaine.",
  L_Protection_Set: "Protection de {place} fixée à {b$}.",
  L_Donated: "Don de {b$} à {place}.",
  L_Cleaned_Up: "Nettoyé autour de {place}.",
  L_Cleared: "Les rues autour de {place} ont été dégagées.",
  L_Looked_Over: "Inspecté {place} : {standing}.",
  owned_by: "appartient à {who}",
  paying_to: "paie {d$} par semaine à {who}",
  paying_nobody: "ne paie personne",
  you: "vous",
  L_Found_Hidden: "Trouvé un {hidden} derrière {place}.",
  L_Nobody_Hiring: "Personne à embaucher à {place}.",
  L_Nobody_Hiring_Else: "Personne à embaucher à {place} — on dit que des gens cherchent du travail à {else}.",
  L_Signed_On_1: "1 homme engagé, il attend dans la réserve.",
  L_Signed_On_n: "{b} hommes engagés, ils attendent dans la réserve.",
  L_Nobody_Willing: "Personne de nouveau ne voulait travailler pour vous.",
  L_Stood_Guard: "Garde à {place} pendant {bhm}.",
  L_Patrolled_1: "1 pâté patrouillé pendant {chm}.",
  L_Patrolled_n: "{b} pâtés patrouillés pendant {chm}.",
  L_Held: "Position tenue pendant {bhm}.",
  L_Ran_Out: "La semaine a pris fin avant que chaque cible soit traitée.",
  L_Continuing: "{order} : continue avec {b} sur {c} personnes ; les autres sont indisponibles.",
  F_No_Site: "Ce lieu n’existe pas.",
  F_Owned_Already: "Quelqu’un d’autre le possède déjà.",
  F_Not_For_Sale: "Ces locaux ne sont plus à vendre.",
  F_Price: "Vous n’avez pas pu payer le prix.",
  F_Not_Yours: "Ce terrain ne vous appartient pas.",
  F_No_Type: "Aucun type d’affaire choisi.",
  F_Illegal_Centre: "Les affaires illégales ne vont qu’au centre d’un pâté.",
  F_Legal_Centre: "Seules les affaires illégales vont au centre d’un pâté.",
  F_City_Only: "Seule la ville construit cela.",
  F_No_Front: "Cette affaire illégale n’a pas de couverture dans le pâté.",
  F_Front_Taken: "Cette couverture cache déjà une autre opération.",
  F_Fit_Out: "Vous n’avez pas pu payer l’aménagement.",
  F_Not_Your_Site: "Ce n’est pas un de vos lieux.",
  F_No_Hood_Free: "Aucun homme n’était libre pour gérer {place}.",
  F_No_Charity: "Pas d’œuvre de charité ici.",
  F_No_Donation: "Aucun don n’a été proposé.",
  F_Spare_Money: "Vous n’avez pas pu dégager l’argent.",
  F_Clean_Up_Money: "Vous n’avez pas pu payer le nettoyage.",
  F_Streets_Not_Bribed: "Ni le maire ni le chef de la police ne le feront plus pour vous.",
  F_Site_Gone: "Le lieu a disparu.",
  F_Nobody_Left: "Il ne restait personne pour exécuter l’ordre.",
  F_Never_Started: "L’ordre n’a jamais commencé. {inner}",
  F_Not_Enough_Time: "La semaine n’a pas suffi pour exécuter l’ordre.",
  F_Nothing_Came: "Rien n’en est sorti.",
  F_Needs_People: "Cet ordre demande {a} personnes, mais il n’en reste que {b} dans l’équipe.",
  F_Needs_Free_1: "Cet ordre demande {a} personnes ; 1 est {free}.",
  F_Needs_Free_n: "Cet ordre demande {a} personnes ; {b} sont {free}.",
  available: "disponible",
  free: "libre",
  F_Target_Lost: "La cible est introuvable.",
  F_Never_Started_Default: "L’ordre n’a jamais commencé. Aucune équipe n’était libre avant la fin de la semaine.",
  M_Acquired: "Acquis {place}.",
  M_Opened: "Ouvert : {type}.",
  M_Refused_Protection: "{place} a refusé de payer la protection.",
  M_Uncovered: "Vos hommes ont découvert une affaire cachée : {hiddenB}.",
  M_Order_Failed: "Ordre échoué : {order} — {inner}",
  M_Order_Cut_Short: "Ordre interrompu : {order} — {inner}",
  M_Queued_Waiting: "{order} en attente : {inner}",
  the_owner: "Le propriétaire",
  Y_Accepted: "{lt} a accepté l’ordre.",
  Y_Cancelled: "Ordre annulé.",
  Y_Back_On_Street: "{pa} est de retour à la rue.",
  Y_Promoted: "{pa} dirige désormais sa propre équipe.",
  Y_Broken_Up: "L’équipe a été dissoute.",
  Y_Joined: "{pa} a rejoint {crewB}.",
  Y_Already_In: "{pa} est déjà dans {crewB}.",
  Y_Done: "",
  Y_No_Crew: "Cette équipe n’existe pas.",
  Y_Lt_Unavailable: "Ce lieutenant n’est pas disponible. Promouvez quelqu’un pour reprendre l’équipe.",
  Y_Positive_Whole: "Choisissez un nombre entier positif de personnes.",
  Y_Only_People: "{lt} n’a que {b} personnes.",
  Y_At_Most_1: "{order} prend au plus 1 personne.",
  Y_At_Most_n: "{order} prend au plus {b} personnes.",
  Y_Valid_Amount: "Choisissez un montant valide.",
  Y_Donation_Zero: "Un don doit être supérieur à zéro.",
  Y_Streets: "Dégager les rues demande le maire ou le chef de la police de votre côté (soudoyé).",
  Y_Rate: "Choisissez un taux entre zéro et le double.",
  Y_No_Block: "Ce pâté n’existe pas.",
  Y_No_Site: "Ce lieu n’existe pas.",
  Y_Valid_Site: "Choisissez un lieu valide pour cet ordre.",
  Y_Site_Not_Valid: "Ce lieu ne convient pas à cet ordre.",
  Y_Inside_City: "Choisissez un endroit dans la ville.",
  Y_Nothing_There: "Rien à faire là pour cet ordre.",
  Y_Cannot_Afford: "Vous n’en avez pas les moyens : cela coûte {a$} et il reste {b$} après les ordres de la semaine.",
  Y_No_Time_Trim: "{lt} n’a pas le temps pour les {b} lieux — il pourrait en faire {c}.",
  Y_No_Time: "{lt} n’a pas le temps. Réduisez la zone, ajoutez du monde ou attendez la semaine prochaine.",
  Y_Too_Many_Orders: "Cette équipe ne peut plus prendre d’ordres cette semaine.",
  Y_No_Order: "Cet ordre n’existe pas.",
  Y_No_Person: "Cette personne n’existe pas.",
  Y_Choose_Hood: "Choisissez un de vos hommes.",
  Y_Not_In_Pool: "Cet homme n’est ni dans la réserve ni dans une équipe.",
  Y_Max_Lieutenants: "Vous avez déjà {a} lieutenants.",
  Y_Could_Not_Promote: "Promotion impossible.",
  Y_Choose_Hood_Crew: "Choisissez un de vos hommes et une de vos équipes.",
  Y_Crew_Full: "Cette équipe est complète.",
  Y_Choose_Crew_Hood: "Choisissez un homme de vos équipes.",
  Y_Bought: "Vous avez acheté une {vehicle}.",
  Y_Cannot_Afford_It: "Vous n’en avez pas les moyens.",
  V_0: "voiture de sport",
  V_1: "coupé",
  V_2: "camionnette"
}, Co = { "en-GB": Dn, de: Eo, es: vo, fr: So };
function R(e, n, o) {
  return (Co[e][n] ?? Dn[n] ?? n).replace(/\{(\w+\$?)\}/g, (a, s) => String(o[s] ?? ""));
}
function de(e, n) {
  const { lang: o } = e, r = (i) => Dt[i] ?? "L_None", a = {
    a: n.a,
    b: n.b,
    c: n.c,
    d: n.d,
    a$: ae(o, n.a),
    b$: ae(o, n.b),
    d$: ae(o, n.d),
    bhm: ut(n.b),
    chm: ut(n.c)
  }, s = () => e.place(n.a);
  switch (n.kind) {
    case "L_None":
      return "";
    case "L_Opened":
    case "M_Opened":
      return R(o, n.kind, { type: e.type(n.a) });
    case "L_Refused_Pay":
      return R(o, n.kind, { owner: n.b >= 0 ? e.person(n.b) : R(o, "the_owner", {}) });
    case "L_Looked_Over": {
      const i = (p) => p === e.me ? R(o, "you", {}) : e.gang(p), d = n.b > 0 ? R(o, "owned_by", { who: i(n.b) }) : n.c > 0 ? R(o, "paying_to", { ...a, who: i(n.c) }) : R(o, "paying_nobody", {});
      return R(o, n.kind, { place: s(), standing: d });
    }
    case "L_Found_Hidden":
      return R(o, n.kind, { place: s(), hidden: e.building(n.b) });
    case "L_Nobody_Hiring":
      return n.b >= 0 ? R(o, "L_Nobody_Hiring_Else", { place: s(), else: e.place(n.b) }) : R(o, n.kind, { place: s() });
    case "L_Signed_On":
      return R(o, n.b === 1 ? "L_Signed_On_1" : "L_Signed_On_n", a);
    case "L_Patrolled":
      return R(o, n.b === 1 ? "L_Patrolled_1" : "L_Patrolled_n", a);
    case "L_Continuing":
      return R(o, n.kind, { ...a, order: Ge(o, fe[n.a]) });
    case "F_Needs_Free":
      return R(o, n.b === 1 ? "F_Needs_Free_1" : "F_Needs_Free_n", { ...a, free: R(o, n.c === 1 ? "available" : "free", {}) });
    case "F_Never_Started":
      return R(o, n.kind, { inner: de(e, { kind: r(n.a), a: n.b, b: n.c, c: n.d, d: 0 }) });
    case "M_Uncovered":
      return R(o, n.kind, { hiddenB: e.building(n.b) });
    case "M_Order_Failed":
    case "M_Order_Cut_Short":
    case "M_Queued_Waiting":
      return R(o, n.kind, {
        order: Ge(o, fe[n.a]),
        inner: de(e, { kind: r(n.b), a: n.c, b: n.d, c: 0, d: 0 })
      });
    default:
      return R(o, n.kind, { ...a, place: n.a >= 0 ? s() : "" });
  }
}
function Me(e, n) {
  const { lang: o } = e, r = { a: n.a, b: n.b, c: n.c, d: n.d, a$: ae(o, n.a), b$: ae(o, n.b) }, a = n.kind;
  switch (a) {
    case "Y_Accepted":
    case "Y_Only_People":
    case "Y_No_Time_Trim":
    case "Y_No_Time":
      return R(o, a, { ...r, lt: e.person(n.a) });
    case "Y_Back_On_Street":
    case "Y_Promoted":
      return R(o, a, { pa: e.person(n.a) });
    case "Y_Joined":
    case "Y_Already_In":
      return R(o, a, { pa: e.person(n.a), crewB: e.crew(n.b) });
    case "Y_At_Most":
      return R(o, n.b === 1 ? "Y_At_Most_1" : "Y_At_Most_n", { ...r, order: Ge(o, fe[n.a]) });
    case "Y_Bought":
      return R(o, a, { vehicle: R(o, `V_${n.a}`, {}) });
    case "Y_Staffing":
      return de(e, { kind: Dt[n.a] ?? "L_None", a: n.b, b: n.c, c: n.d, d: 0 });
    default:
      return R(o, a, r);
  }
}
function gn(e, n) {
  return R(e, `V_${n}`, {});
}
const fn = 10;
function No(e, n, o, r) {
  const a = Oe(e, n);
  return { crews: a, orders: a.flatMap((s) => s.orders.map((i) => An(e, i))), last: Tn(e, n), pool: o, messages: r };
}
function bn({ t: e, x: n, o, onCancel: r, onShow: a }) {
  const s = o.targets.length === 1 ? n.place(o.targets[0]) : o.point ? e("o_point") : e("o_sites", { n: o.targets.length }), i = o.finished >= 0 ? Fn(e, o.finished) : null;
  return /* @__PURE__ */ t.createElement("li", { className: `order-line st-${o.state}` }, /* @__PURE__ */ t.createElement("button", { className: "link", onClick: a }, Ge(n.lang, o.kind)), /* @__PURE__ */ t.createElement("span", { className: "where" }, " · ", s), /* @__PURE__ */ t.createElement("span", { className: "state" }, " · ", e(`st_${o.state}`), o.estimate > 0 && o.state === "queued" ? ` · ${ut(o.estimate)}` : "", i ? ` · ${e("o_done_at", { day: i.day, time: i.time })}` : "", o.assigned.length ? ` · ${o.assigned.map((d) => n.person(d)).join(", ")}` : ""), r && /* @__PURE__ */ t.createElement("button", { className: "mini", onClick: r, title: e("o_cancel"), "aria-label": e("o_cancel") }, "×"), o.fail.kind !== "L_None" && /* @__PURE__ */ t.createElement("div", { className: "fail" }, de(n, o.fail)), o.results.length > 0 && /* @__PURE__ */ t.createElement("ul", { className: "results" }, o.results.map((d, p) => /* @__PURE__ */ t.createElement("li", { key: p }, de(n, d)))));
}
function Lo({ t: e, x: n, core: o, view: r, running: a, onPerson: s, onNewOrder: i, onChanged: d, onClose: p, onShow: k }) {
  const _ = (h, m, N = 0) => d(je(o, h, m, N)), u = (h) => o.hs_get(Y.person, h, q.pay), c = (h, m) => /* @__PURE__ */ t.createElement("li", { key: h, className: "man" }, /* @__PURE__ */ t.createElement("button", { className: "link", onClick: () => s(h) }, n.person(h)), /* @__PURE__ */ t.createElement("span", { className: "pay" }, " ", ae(n.lang, u(h))), /* @__PURE__ */ t.createElement("span", { className: "acts" }, /* @__PURE__ */ t.createElement("button", { className: "mini", title: e("o_pay_down"), "aria-label": e("o_pay_down"), onClick: () => _(J.setPay, h, Math.max(0, u(h) - fn)) }, "−"), /* @__PURE__ */ t.createElement("button", { className: "mini", title: e("o_pay_up"), "aria-label": e("o_pay_up"), onClick: () => _(J.setPay, h, u(h) + fn) }, "+"), m ? /* @__PURE__ */ t.createElement("button", { className: "mini wide", onClick: () => _(J.moveToPool, h) }, e("o_to_pool")) : r.crews.map((N) => /* @__PURE__ */ t.createElement("button", { key: N.slot, className: "mini wide", onClick: () => _(J.moveToCrew, h, N.slot) }, e("o_to_crew", { crew: Fe(N) }))), /* @__PURE__ */ t.createElement("button", { className: "mini wide", onClick: () => _(J.promote, h) }, e("o_promote")), /* @__PURE__ */ t.createElement("button", { className: "mini wide danger", onClick: () => _(J.sack, h) }, e("o_sack"))));
  return /* @__PURE__ */ t.createElement("aside", { className: "drawer crews-panel", "aria-label": e("o_title") }, /* @__PURE__ */ t.createElement("header", null, /* @__PURE__ */ t.createElement("h2", null, e("o_title")), /* @__PURE__ */ t.createElement("button", { className: "close", onClick: p, "aria-label": e("pc_close") }, "×")), r.crews.map((h) => {
    const m = r.orders.filter((g) => g.crew === h.slot), N = Math.max(1, h.men) * it;
    return /* @__PURE__ */ t.createElement("section", { key: h.slot }, /* @__PURE__ */ t.createElement("h3", null, Fe(h), " ", /* @__PURE__ */ t.createElement("small", null, "· ", e("o_lt"), " ", /* @__PURE__ */ t.createElement("button", { className: "link", onClick: () => s(h.lieutenant) }, n.person(h.lieutenant)))), /* @__PURE__ */ t.createElement("p", { className: "sum" }, e("o_crew_time", { used: h.timeUsed.toLocaleString(), cap: N.toLocaleString(), men: h.men })), /* @__PURE__ */ t.createElement("p", { className: "sum" }, e("o_cars", { s: h.speedsters, c: h.coupes, t: h.trucks })), /* @__PURE__ */ t.createElement("div", { className: "row cars" }, ho.map((g) => /* @__PURE__ */ t.createElement(
      "button",
      {
        key: g.kind,
        className: "mini wide",
        onClick: () => {
          const y = o.hs_get(Y.gang, dt(o), D.cash);
          window.confirm(e("o_buy_confirm", { name: gn(n.lang, g.kind), cost: ae(n.lang, g.cost), team: Fe(h), cash: ae(n.lang, y) })) && _(J.buyVehicle, g.kind, h.slot);
        }
      },
      e("o_buy", { name: gn(n.lang, g.kind), cost: ae(n.lang, g.cost) })
    ))), /* @__PURE__ */ t.createElement("ul", { className: "men" }, h.members.length ? h.members.map((g) => c(g, h)) : /* @__PURE__ */ t.createElement("li", null, e("o_none"))), /* @__PURE__ */ t.createElement("h4", null, e("o_orders")), /* @__PURE__ */ t.createElement("ul", { className: "orders" }, m.length ? m.map((g) => /* @__PURE__ */ t.createElement(
      bn,
      {
        key: g.slot,
        t: e,
        x: n,
        o: g,
        onShow: () => k(g),
        onCancel: ["done", "failed", "cancelled"].includes(g.state) ? void 0 : () => _(J.cancel, g.slot)
      }
    )) : /* @__PURE__ */ t.createElement("li", null, e("o_none"))), /* @__PURE__ */ t.createElement("div", { className: "row" }, /* @__PURE__ */ t.createElement("button", { className: "main", onClick: () => i(h.slot) }, e("o_new")), /* @__PURE__ */ t.createElement("button", { className: "main danger", onClick: () => _(J.demote, h.slot) }, e("o_demote"))));
  }), /* @__PURE__ */ t.createElement("section", null, /* @__PURE__ */ t.createElement("h3", null, e("o_pool")), /* @__PURE__ */ t.createElement("ul", { className: "men" }, r.pool.length ? r.pool.map((h) => c(h, null)) : /* @__PURE__ */ t.createElement("li", null, e("o_none")))), /* @__PURE__ */ t.createElement("section", null, /* @__PURE__ */ t.createElement("h3", null, e("o_last")), /* @__PURE__ */ t.createElement("ul", { className: "orders" }, r.last.length ? r.last.map((h, m) => /* @__PURE__ */ t.createElement(t.Fragment, { key: m }, /* @__PURE__ */ t.createElement(bn, { t: e, x: n, o: h, onShow: () => k(h) }), /* @__PURE__ */ t.createElement("li", { className: "again" }, /* @__PURE__ */ t.createElement(
    "button",
    {
      className: "mini wide",
      disabled: a,
      onClick: () => d(je(o, J.repeat, h.slot))
    },
    e("o_again")
  )))) : /* @__PURE__ */ t.createElement("li", null, e("o_none")))), /* @__PURE__ */ t.createElement("section", null, /* @__PURE__ */ t.createElement("h3", null, e("o_messages")), /* @__PURE__ */ t.createElement("ul", { className: "messages" }, r.messages.length ? r.messages.map((h, m) => /* @__PURE__ */ t.createElement("li", { key: m }, de(n, h))) : /* @__PURE__ */ t.createElement("li", null, e("o_no_messages")))));
}
const Mo = ce.map((e, n) => ({ id: n, name: e, cost: Va[n], cls: $a[n] })).filter((e) => e.cost > 0 && ["commercial", "industrial", "illegal"].includes(e.cls)).sort((e, n) => e.name.localeCompare(n.name));
function Fo({ t: e, x: n, core: o, crews: r, draft: a, setDraft: s, selectedBuilding: i, selectedBlock: d, onIssued: p, onClose: k }) {
  const _ = mn[a.kind], [u, c] = t.useState(null), h = t.useMemo(() => Yn(o, a), [o, a]), m = (f) => {
    c(null), s({ ...a, ...f });
  }, N = (f) => m({ ...Gt(a.crew, f), manpower: Math.min(a.manpower, mn[f].max) }), g = r.find((f) => f.slot === a.crew), y = _.target === "point" ? e("job_pick_point") : _.target === "area" ? e("job_pick_area") : e("job_pick_building"), w = () => {
    const f = Rn(o, a);
    c(f), f.ok && p(f);
  };
  return /* @__PURE__ */ t.createElement("aside", { className: "card job-card", "aria-label": e("job_title") }, /* @__PURE__ */ t.createElement("header", null, /* @__PURE__ */ t.createElement("h3", null, e("job_title")), /* @__PURE__ */ t.createElement("button", { className: "close", onClick: k, "aria-label": e("job_close") }, "×")), /* @__PURE__ */ t.createElement("div", { className: "fields" }, /* @__PURE__ */ t.createElement("label", null, e("job_crew"), /* @__PURE__ */ t.createElement("select", { value: a.crew, onChange: (f) => m({ crew: Number(f.target.value) }) }, r.map((f) => /* @__PURE__ */ t.createElement("option", { key: f.slot, value: f.slot }, Fe(f))))), /* @__PURE__ */ t.createElement("label", null, e("job_kind"), /* @__PURE__ */ t.createElement("select", { value: a.kind, onChange: (f) => N(f.target.value) }, fe.map((f) => /* @__PURE__ */ t.createElement("option", { key: f, value: f }, Ge(n.lang, f))))), /* @__PURE__ */ t.createElement("label", null, e("job_men"), /* @__PURE__ */ t.createElement(
    "input",
    {
      type: "number",
      min: 1,
      max: _.max,
      value: a.manpower,
      onChange: (f) => m({ manpower: Math.max(1, Math.min(_.max, Math.trunc(Number(f.target.value) || 1))) })
    }
  ), /* @__PURE__ */ t.createElement("small", null, " ", e("job_men_note", { max: _.max, have: g ? g.members.length + 1 : 0 }))), a.kind === "donate" && /* @__PURE__ */ t.createElement("label", null, e("job_amount"), /* @__PURE__ */ t.createElement(
    "input",
    {
      type: "number",
      min: 0,
      step: 10,
      value: a.amount < 0 ? "" : a.amount,
      onChange: (f) => m({ amount: f.target.value === "" ? -1 : Math.max(0, Math.trunc(Number(f.target.value))) })
    }
  )), a.kind === "adjust" && /* @__PURE__ */ t.createElement("label", null, e("job_level"), /* @__PURE__ */ t.createElement(
    "input",
    {
      type: "number",
      min: 0,
      max: 200,
      step: 10,
      value: a.level < 0 ? "" : a.level,
      onChange: (f) => m({ level: f.target.value === "" ? -1 : Math.max(0, Math.min(200, Math.trunc(Number(f.target.value)))) })
    }
  )), a.kind === "setUp" && /* @__PURE__ */ t.createElement(t.Fragment, null, /* @__PURE__ */ t.createElement("label", null, e("job_business"), /* @__PURE__ */ t.createElement("select", { value: a.business, onChange: (f) => m({ business: Number(f.target.value) }) }, /* @__PURE__ */ t.createElement("option", { value: -1 }, "—"), Mo.map((f) => /* @__PURE__ */ t.createElement("option", { key: f.id, value: f.id }, f.name, " · ", ae(n.lang, f.cost))))), /* @__PURE__ */ t.createElement("div", { className: "pickrow" }, e("job_front"), ": ", a.front >= 0 ? n.place(a.front) : "—", /* @__PURE__ */ t.createElement("button", { className: "mini wide", disabled: i < 0, onClick: () => m({ front: i }) }, e("job_front_pick")))), /* @__PURE__ */ t.createElement("label", { className: "check" }, /* @__PURE__ */ t.createElement("input", { type: "checkbox", checked: a.repeat, onChange: (f) => m({ repeat: f.target.checked }) }), " ", e("job_repeat"))), /* @__PURE__ */ t.createElement("p", { className: "hint" }, y), /* @__PURE__ */ t.createElement("div", { className: "pickrow" }, _.target !== "point" && /* @__PURE__ */ t.createElement(
    "button",
    {
      className: "mini wide",
      disabled: i < 0 || a.buildings.includes(i),
      onClick: () => m({ buildings: _.target === "building" ? [i] : [...a.buildings, i] })
    },
    e("job_add")
  ), _.target === "area" && /* @__PURE__ */ t.createElement(
    "button",
    {
      className: "mini wide",
      disabled: d < 0 || a.blocks.includes(d),
      onClick: () => m({ blocks: [...a.blocks, d] })
    },
    e("job_block")
  ), /* @__PURE__ */ t.createElement("button", { className: "mini wide", onClick: () => m({ buildings: [], blocks: [], point: null }) }, e("job_clear"))), /* @__PURE__ */ t.createElement("ul", { className: "targets" }, a.buildings.map((f) => /* @__PURE__ */ t.createElement("li", { key: `b${f}` }, n.place(f), " ", /* @__PURE__ */ t.createElement(
    "button",
    {
      className: "mini",
      "aria-label": e("job_remove"),
      onClick: () => m({ buildings: a.buildings.filter(($) => $ !== f) })
    },
    "×"
  ))), a.blocks.map((f) => /* @__PURE__ */ t.createElement("li", { key: `k${f}` }, e("o_block", { n: f }), " ", /* @__PURE__ */ t.createElement(
    "button",
    {
      className: "mini",
      "aria-label": e("job_remove"),
      onClick: () => m({ blocks: a.blocks.filter(($) => $ !== f) })
    },
    "×"
  ))), a.point && /* @__PURE__ */ t.createElement("li", null, e("o_point"), " (", Math.round(a.point.x / 256), ", ", Math.round(a.point.y / 256), " m)")), h && /* @__PURE__ */ t.createElement("p", { className: "estimate" }, h.order.targets.length > 0 || h.order.point ? e("job_estimate", { time: ut(h.order.estimate) }) : "", h.order.cost > 0 ? ` · ${e("job_cost", { cost: ae(n.lang, h.order.cost) })}` : "", h.order.targets.length > 1 ? ` · ${e("o_sites", { n: h.order.targets.length })}` : "", !h.hasTime && (h.order.targets.length > 0 || h.order.point) ? ` · ${e("job_no_time")}` : "", h.staffing.kind !== "L_None" ? ` · ${de(n, h.staffing)}` : ""), u && /* @__PURE__ */ t.createElement("p", { className: u.ok ? "reply ok" : "reply bad", role: "status" }, Me(n, u)), u && u.kind === "Y_No_Time_Trim" && u.kept.length > 0 && /* @__PURE__ */ t.createElement("div", { className: "pickrow" }, /* @__PURE__ */ t.createElement("button", { className: "mini wide", onClick: () => m({ buildings: u.kept, blocks: [] }) }, e("job_take_kept", { n: u.kept.length }))), /* @__PURE__ */ t.createElement("div", { className: "row" }, /* @__PURE__ */ t.createElement("button", { className: "main", onClick: k }, e("job_close")), /* @__PURE__ */ t.createElement("button", { className: "main", onClick: w }, e("job_issue"))));
}
function Po({ t: e, canContinue: n, ready: o, onContinue: r, onNew: a }) {
  const s = (i, d) => /* @__PURE__ */ t.createElement("button", { key: i, className: "menu-item", disabled: !0, title: d }, /* @__PURE__ */ t.createElement("span", null, e(i)), /* @__PURE__ */ t.createElement("small", null, d));
  return /* @__PURE__ */ t.createElement("div", { className: "overlay open start-menu", role: "dialog", "aria-modal": "true", "aria-labelledby": "menu-title" }, /* @__PURE__ */ t.createElement("div", { className: "box" }, /* @__PURE__ */ t.createElement("h2", { id: "menu-title" }, e("title")), /* @__PURE__ */ t.createElement("p", { className: "menu-sub" }, e("subtitle")), /* @__PURE__ */ t.createElement("nav", { className: "menu-list" }, /* @__PURE__ */ t.createElement("button", { className: "menu-item live", disabled: !n, onClick: r, autoFocus: n }, /* @__PURE__ */ t.createElement("span", null, e("m_continue")), !n && /* @__PURE__ */ t.createElement("small", null, e("m_this_session"))), /* @__PURE__ */ t.createElement("button", { className: "menu-item live", disabled: !o, onClick: a, autoFocus: !n }, /* @__PURE__ */ t.createElement("span", null, e("m_new"))), s("m_load", e("m_unassigned")), s("m_tutorials", e("m_out")), s("m_hof", e("later", { n: 8 })), s("m_leaderboard", e("later", { n: 8 })), s("m_how", e("m_unassigned")), s("m_credits", e("m_unassigned")))));
}
function Ao(e, n) {
  let o = -1;
  for (let r = 0; r < 4e4; r++)
    if (e.hs_get(Y.building, r, 6) === 0 && ++o === n) return r;
  return -1;
}
const To = 33, Bo = [
  { draws: 254050, cash: 5308, wages: 836 },
  { draws: 229972, cash: 4022, wages: 836 },
  { draws: 228697, cash: 3186, wages: 836 },
  { draws: 231961, cash: 2266, wages: 920 }
];
function Yo(e, n = () => performance.now()) {
  const o = [], r = [], a = (L, x, G, V = "exact") => {
    const W = String(x), te = String(G), ne = V === "info" ? !0 : V === "20%" ? Math.abs(Number(x) - Number(G)) <= 0.2 * Math.abs(Number(G)) : W === te;
    o.push({ label: L, got: W, want: te, mode: V, ok: ne });
  };
  e.hs_new_game(1932, 1932, 40, 32);
  const s = Ft(e, 1932), i = On(e), d = dt(e), p = {
    lang: "en-GB",
    me: d,
    place: (L) => zn(e, s, i, L),
    building: (L) => Ht(e, L),
    person: (L) => he(e, L),
    gang: (L) => `The ${zt[e.hs_get(Y.gang, L, D.surname)]} Gang`,
    crew: (L) => Fe({ nameFirst: e.hs_get(Q.crews, L, Z.nameFirst) }),
    type: (L) => ce[L] ?? "?"
  }, k = (L) => Ao(e, L), _ = Oe(e, d)[0].slot, u = e.hs_get(Y.gang, d, D.office);
  a("lieutenant", he(e, Oe(e, d)[0].lieutenant), "Luigi Romano"), a("office (1.2.91 number 4576)", u, k(4576));
  const c = (L, x, G, V) => {
    const W = { ...Gt(_, x.kind), ...x }, te = Yn(e, W);
    G !== null && a(`${L}: estimate (minutes)`, te ? te.order.estimate : -1, G);
    const ne = Rn(e, W);
    return a(`${L}: reply`, Me(p, ne), V), { preview: te, reply: ne };
  }, h = (L) => {
    let x = null;
    for (let G = 0; G < 512; G++) {
      if (e.hs_get(Q.order, G, A.gang) !== d || fe[e.hs_get(Q.order, G, A.kind)] !== L) continue;
      const V = An(e, G);
      (!x || V.id > x.id) && (x = V);
    }
    return x;
  }, m = (L) => Tn(e, d).find((x) => x.kind === L), N = (L) => L ? L.results.map((x) => de(p, x)) : [], g = (L) => {
    const x = n();
    e.hs_finish_week(), r.push(Math.round(n() - x));
    const G = Bo[L - 1];
    a(`week ${L}: cash (1.2.91 less business income, item 8)`, e.hs_get(Y.gang, d, D.cash), G.cash), a(`week ${L}: wages`, e.hs_get(Y.gang, d, D.wages), G.wages), a(`week ${L}: random draws`, e.hs_count(F.drawsWeek), G.draws, "20%");
  }, y = (L, x, G) => {
    const V = m(L);
    a(`${x}: state`, V?.state ?? "missing", "done"), a(`${x}: done at minute (1.2.91 with cars)`, V?.finished ?? -1, G, "info");
  }, w = (L, x, G) => {
    const V = N(m(L));
    G.forEach((W, te) => a(`${x}: result ${te + 1}`, V[te] ?? "(none)", W)), V.length !== G.length && a(`${x}: results`, V.length, G.length);
  };
  c("collect 1407, 1578", { kind: "collect", buildings: [k(1407), k(1578)] }, 312, "Luigi Romano accepted the order.");
  const f = h("collect");
  a("collect: route", f ? f.targets.map((L) => L === k(1578) ? 1578 : L === k(1407) ? 1407 : L).join(" then ") : "", "1578 then 1407");
  const $ = c("buy 1411", { kind: "buy", buildings: [k(1411)] }, 359, "Luigi Romano accepted the order.");
  a("buy 1411: price", $.preview?.order.cost ?? -1, 160), c("explore block 413", { kind: "explore", blocks: [413] }, 340, "Luigi Romano accepted the order."), a("explore: sites", h("explore")?.targets.length ?? 0, 5), c("recruit block 413", { kind: "recruit", blocks: [413] }, null, "Nothing there for that order."), c(
    "clear streets block 413",
    { kind: "clearStreets", blocks: [413] },
    null,
    "Clearing the streets needs the mayor or the police chief on your side (bribed)."
  ), c("explore with 3 men", { kind: "explore", blocks: [413], manpower: 3 }, null, "Luigi Romano has only 2 people."), e.hs_launch_week();
  const S = (L) => {
    const x = h(L);
    return x && x.assigned.length ? he(e, x.assigned[0]) : x?.state ?? "";
  };
  a("week 1 hand-out: collect", S("collect"), "Sal Rinaldi"), a("week 1 hand-out: buy", S("buy"), "Luigi Romano"), a("week 1 hand-out: explore", S("explore"), "queued"), g(1), y("buy", "buy", 498), y("collect", "collect", 552), y("explore", "explore", 1321), w("collect", "collect", [
    "Collected $152 from Apartment Block on Cermak St at Wood Ave.",
    "Collected $152 from Apartment Block on Maxwell St at Paulina Ave."
  ]), w("buy", "buy", ["Bought Empty land on Maxwell St at Paulina Ave for $160."]), w("explore", "explore", [
    "Looked over Perfume Store on Archer St at Paulina Ave: owned by you.",
    "Looked over Residences on Cermak St at Paulina Ave: paying nobody.",
    "Looked over Residences on Cermak St at Paulina Ave: paying nobody.",
    "Looked over Residences on Cermak St at Hermitage Ave: paying nobody.",
    "Looked over Office on Cermak St at Paulina Ave: owned by you."
  ]), c("adjust 1407 to 150 %", { kind: "adjust", buildings: [k(1407)], level: 150 }, 142, "Luigi Romano accepted the order."), c(
    "set up a clothing bank at 1583",
    { kind: "setUp", buildings: [k(1583)], business: Wa.indexOf("clothingBank") },
    538,
    "Luigi Romano accepted the order."
  );
  const b = h("setUp");
  a("cancel the set-up", b ? Me(p, je(e, J.cancel, b.slot)) : "", "Order cancelled."), c("clean up block 413", { kind: "cleanUp", blocks: [413] }, 338, "Luigi Romano accepted the order."), c("donate $200 to 1406", { kind: "donate", buildings: [k(1406)], amount: 200 }, 186, "Luigi Romano accepted the order."), e.hs_launch_week(), g(2), y("adjust", "adjust", 255), y("cleanUp", "clean up", 666), y("donate", "donate", 681), w("adjust", "adjust", ["Protection at Apartment Block on Maxwell St at Paulina Ave set to $228."]), w("cleanUp", "clean up", [
    "Cleaned up round Perfume Store on Archer St at Paulina Ave.",
    "Cleaned up round Residences on Cermak St at Paulina Ave.",
    "Cleaned up round Residences on Cermak St at Paulina Ave.",
    "Cleaned up round Residences on Cermak St at Hermitage Ave.",
    "Cleaned up round Office on Cermak St at Paulina Ave."
  ]), w("donate", "donate", ["Donated $200 to Church on Maxwell St at Laflin Ave."]), a("week 2: purchases", e.hs_get(Y.gang, d, To), 450), c("run 1583", { kind: "run", buildings: [k(1583)] }, 176, "Luigi Romano accepted the order.");
  const v = e.hs_get(Y.building, u, Ae.lot), O = (L) => e.hs_get(Y.lot, v, L);
  c(
    "go to the office",
    { kind: "goTo", point: { x: O(2) + Math.trunc(O(4) / 2), y: O(3) + Math.trunc(O(5) / 2) } },
    1200,
    "Luigi Romano accepted the order."
  ), e.hs_launch_week(), g(3), y("run", "run", 176), w("run", "run", ["New management installed at Perfume Store on Archer St at Paulina Ave."]);
  const I = m("goTo");
  a("go to: held position (minutes)", I?.results[0]?.b ?? -1, 2376, "20%"), a("go to: line", N(I)[0] ?? "", "Held position for 39h 36m.", "info"), a("week 3: crew", Oe(e, d)[0].members.map((L) => he(e, L)).join(", "), "Gino Costa");
  const ue = [1, 2].map((L) => e.hs_get(Y.pool, d, L));
  a("move the first of the pool to the crew", Me(p, je(e, J.moveToCrew, ue[0], _)), "Vito Ferrante joined Luigi's Crew."), a("move the second of the pool to the crew", Me(p, je(e, J.moveToCrew, ue[1], _)), "Carmela Romano joined Luigi's Crew."), c("patrol block 413", { kind: "patrol", blocks: [413] }, 600, "Luigi Romano accepted the order."), c("guard 1583", { kind: "guard", buildings: [k(1583)] }, 600, "Luigi Romano accepted the order."), c("recruit block 411", { kind: "recruit", blocks: [411] }, 213, "Luigi Romano accepted the order."), a("recruit: site (1.2.91 number 1570, the gym)", h("recruit")?.targets[0] ?? -1, k(1570)), e.hs_launch_week(), a("week 4 hand-out: patrol", S("patrol"), "Luigi Romano"), a("week 4 hand-out: guard", S("guard"), "Gino Costa"), a("week 4 hand-out: recruit", S("recruit"), "Vito Ferrante"), g(4), y("recruit", "recruit", 294), w("recruit", "recruit", ["1 hood signed on, waiting in the pool."]);
  const X = m("patrol"), be = m("guard");
  a("patrol: blocks", X?.results[0]?.b ?? -1, 1), a("patrol: minutes", X?.results[0]?.c ?? -1, 2344, "20%"), a("patrol: line", N(X)[0] ?? "", "Patrolled 1 block for 39h 4m.", "info"), a("guard: minutes", be?.results[0]?.b ?? -1, 2399, "20%"), a("guard: line", N(be)[0] ?? "", "Stood guard at Perfume Store on Archer St at Paulina Ave for 39h 59m.", "info"), a("week 4: pool, crew", `${e.hs_get(Y.gang, d, D.poolCount)}, ${Oe(e, d)[0].members.length}`, "2, 3");
  const Be = o.filter((L) => !L.ok).length;
  return { rows: o, passed: o.length - Be, failed: Be, weekMs: r };
}
const Nt = window.HS.stamp, at = matchMedia("(prefers-reduced-motion: reduce)"), xo = 10 / 3, Ro = 12;
function Lt(e) {
  return Object.keys(ge).find((n) => ge[n][0] === e.w && ge[n][1] === e.h) ?? "standard";
}
function Oo() {
  const [e, n] = B(() => {
    const l = kt("ahs.lang", "en-GB");
    return tn.includes(l) ? l : "en-GB";
  }), [o, r] = B(() => kt("ahs.sound", "on") !== "off"), [a, s] = B(null), [i, d] = B(null), [p, k] = B(null), [_, u] = B(null), [c, h] = B(null), [m, N] = B(null), [g, y] = B(-1), [w, f] = B("street"), [$, S] = B(0), [b, v] = B(!1), [O, I] = B(!1), [ue, X] = B(!1), [be, Be] = B(""), [L, x] = B(null), [G, V] = B(null), [W, te] = B([]), [ne, jn] = B(null), [we, He] = B(-1), [Ie, _t] = B(!1), [ke, Gn] = B(() => {
    const l = Number(kt("ahs.speed", "1"));
    return [1, 2, 4, 8, 0].includes(l) ? l : 1;
  }), [Ye, mt] = B(!1), [Hn, It] = B(null), [In, Wn] = B(0), We = Pe(0), [$e, ht] = B(!0), [$n, Vn] = B(!1), [Ve, pt] = B(!1), [ye, qn] = B(null), [oe, Ee] = B(null), [qe, Ue] = B(""), [Un, Kn] = B(null), Ke = Pe(-1), M = ve((l, E) => Pt(e, l, E), [e]), _e = ve((l) => {
    x(lo(l)), V(io(l));
    const E = vt(l);
    co(l, l.hs_count(F.lots) * 2, E), te(E), jn(uo(l));
    const T = dt(l);
    qn(T > 0 ? No(l, T, E[T - 1]?.pool ?? [], wo(l)) : null);
    const P = pn(l);
    P !== Ke.current && (Ke.current >= 0 && h((j) => j && Ft(l, j.seed)), Ke.current = P), Wn((j) => j + 1);
  }, []), Ze = ve((l, E, T) => {
    const [P, j] = ge[T], ee = performance.now();
    l.hs_new_game(E, E, P, j);
    const re = Ft(l, E);
    h(re), y(-1), He(-1), N(l.hs_state_hash()), Ke.current = pn(l), Ee(null), Ue(""), Vn(!0), _e(l), Ce("new_game", {
      seed: E,
      size: T,
      ms: Math.round(performance.now() - ee),
      city_hash: re.cityHash,
      structure_hash: re.structureHash,
      lots: re.counts.lots,
      status: re.status
    });
  }, [_e]);
  U(() => {
    if (!a || !ne?.running || Ye || $e) return;
    let l = 0, E = performance.now();
    const T = (P) => {
      let j = 0;
      if (ke === 0) {
        const ee = P + Ro;
        for (; performance.now() < ee; ) {
          const re = a.hs_tick(4);
          if (j += re, re < 4) break;
        }
      } else {
        We.current += (P - E) / 1e3 * xo * ke;
        const ee = Math.floor(We.current);
        We.current -= ee, ee > 0 && (j = a.hs_tick(Math.min(ee, 60)));
      }
      if (E = P, j > 0 && (_e(a), a.hs_count(F.phase) === 0)) {
        N(a.hs_state_hash()), Ce("week_settled", {
          week: a.hs_count(F.week) - 1,
          draws: a.hs_count(F.drawsWeek),
          wages: vt(a).map((ee) => ee.wages),
          state_hash: a.hs_state_hash() >>> 0
        }), se(o, 523.25);
        return;
      }
      l = requestAnimationFrame(T);
    };
    return l = requestAnimationFrame(T), () => cancelAnimationFrame(l);
  }, [a, ne?.running, Ye, $e, ke, _e, o]);
  const Zn = () => {
    a && (a.hs_launch_week(), We.current = 0, mt(!1), z("launch_week", a.hs_count(F.week)), _e(a));
  }, Jn = () => {
    if (!a) return;
    const l = performance.now(), E = a.hs_count(F.week);
    a.hs_finish_week();
    const T = Math.round(performance.now() - l);
    _e(a), N(a.hs_state_hash()), z("finish_week", E), Ce("week_settled", {
      week: E,
      ms: T,
      draws: a.hs_count(F.drawsWeek),
      wages: vt(a).map((P) => P.wages),
      state_hash: a.hs_state_hash() >>> 0
    }), se(o, 523.25);
  }, Wt = ve((l) => {
    He(l), y(-1), l >= 0 && (z("select_person", l), se(o, 587.33));
  }, [o]), $t = (l) => {
    if (!a) return;
    Wt(l);
    const E = _n(a, l);
    E && (f("street"), It({ x: E.x, y: E.y, n: Date.now() }));
  }, Qn = Se(() => [0, ...W.map((l) => l.colour)], [W]), gt = Se(
    () => a && we >= 0 ? _n(a, we) : null,
    // tickNo: the card follows him as he walks.
    [a, we, In]
  );
  U(() => {
    la(window.HS.wasm, (l) => {
      ze("last_chance", Pt("en-GB", `err${l.code}`), { ...l }), k(l);
    }).then((l) => {
      l.hs_new_game(Le.seed, Le.auto, Le.w, Le.h);
      const E = {
        streams: [1, 2, 3].map((T) => Array.from({ length: 20 }, (P, j) => l.hs_rng_value(T, j + 1) >>> 0)),
        checks: Array.from({ length: 9 }, (T, P) => l.hs_check_value(P + 1)),
        gw: l.hs_grid_w(),
        gh: l.hs_grid_h(),
        pattern: Array.from({ length: 225 }, (T, P) => l.hs_cell_kind(P % 15, Math.floor(P / 15))),
        worldHash: l.hs_state_hash()
      };
      u(E), Ce("core_loaded", { build_id: l.hs_build_id(), ...Bt(E) }), s(l);
    }).catch((l) => {
      l instanceof Mt || (d(String(l)), ze("wasm_load", String(l)));
    });
  }, [Ze]), U(() => {
    document.documentElement.lang = e, document.title = M("title");
  }, [e, M]), U(() => {
    const l = (T) => {
      T.key === "F9" ? (T.preventDefault(), z("report_opened", "f9"), X(!0)) : T.key === "Escape" && (X(!1), I(!1));
    };
    window.addEventListener("keydown", l);
    const E = () => Ce("reduced_motion", at.matches);
    return at.addEventListener?.("change", E), () => {
      window.removeEventListener("keydown", l), at.removeEventListener?.("change", E);
    };
  }, []);
  const Vt = ve((l) => {
    y(l), He(-1), l >= 0 && (z("select_lot", l), se(o, 659.25)), l >= 0 && a && c && Ee((E) => {
      if (!E) return E;
      const T = c.lots[l];
      if (!T) return E;
      if (E.kind === "goTo") return { ...E, point: { x: Math.round((T.x + T.w / 2) * 256), y: Math.round((T.y + T.h / 2) * 256) } };
      const P = hn(a, c, l);
      return P < 0 ? E : ["buy", "setUp", "run", "donate", "guard"].includes(E.kind) ? { ...E, buildings: [P] } : E.buildings.includes(P) ? { ...E, buildings: E.buildings.filter((j) => j !== P) } : { ...E, buildings: [...E.buildings, P] };
    });
  }, [o, a, c]), qt = Se(() => a && c ? On(a) : { cols: [], rows: [] }, [a, c]), ft = Se(() => ({
    lang: e,
    me: a ? dt(a) : 0,
    place: (l) => a && c ? zn(a, c, qt, l) : String(l),
    building: (l) => a ? Ht(a, l) : String(l),
    person: (l) => a && l >= 0 ? he(a, l) : "—",
    gang: (l) => M("g_name", { name: W[l - 1]?.name ?? String(l) }),
    crew: (l) => a ? Fe({ nameFirst: a.hs_get(Q.crews, l, Z.nameFirst) }) : String(l),
    type: (l) => ce[l] ?? "?"
  }), [e, a, c, qt, W, M]), Je = ve((l) => {
    if (!a || !c) return null;
    const E = c.lots[a.hs_get(3, l, 0)];
    return E ? { x: E.x + E.w / 2, y: E.y + E.h / 2 } : null;
  }, [a, c]), Ut = Se(() => {
    const l = [];
    if (!c) return l;
    const E = W.find((P) => P.player), T = E ? pe[E.colour % 4] : "#f1d58f";
    for (const P of ye?.orders ?? [])
      if (!["done", "failed", "cancelled"].includes(P.state)) {
        for (const j of P.targets) {
          const ee = Je(j);
          ee && l.push({ ...ee, colour: T });
        }
        P.point && l.push({ x: P.point.x / 256, y: P.point.y / 256, colour: T });
      }
    if (oe) {
      for (const P of oe.buildings) {
        const j = Je(P);
        j && l.push({ ...j, colour: "#f1d58f" });
      }
      for (const P of oe.blocks)
        for (const j of c.lots) j.block === P && l.push({ x: j.x + j.w / 2, y: j.y + j.h / 2, colour: "#f1d58f" });
      oe.point && l.push({ x: oe.point.x / 256, y: oe.point.y / 256, colour: "#f1d58f" });
    }
    return l;
  }, [c, W, ye, oe, Je]), Xn = (l) => {
    const E = l.targets.length ? Je(l.targets[0]) : l.point ? { x: l.point.x / 256, y: l.point.y / 256 } : null;
    E && (f("street"), It({ ...E, n: Date.now() }));
  }, Kt = (l) => {
    const E = Me(ft, l);
    Ue(E), z("command", { reply: l.kind, a: l.a, b: l.b }), a && _e(a);
  }, ea = () => {
    if (!a || !c) return;
    const l = c.seed, E = Lt(c);
    z("order_check");
    const T = Yo(a);
    Kn(T), Ce("order_check", { passed: T.passed, failed: T.failed, week_ms: T.weekMs }), Ze(a, l, E);
  }, ta = () => {
    ht(!0), z("menu");
  };
  U(() => {
    if (!qe) return;
    const l = setTimeout(() => Ue(""), 6e3);
    return () => clearTimeout(l);
  }, [qe]);
  const Zt = Se(() => ({
    stamp: Nt,
    lang: e,
    sound: o,
    reducedMotion: at.matches,
    seeds: c ? { city: c.seed, auto: c.seed } : null,
    stateHash: m === null ? null : "0x" + (m >>> 0).toString(16).padStart(8, "0"),
    custom: {
      build_id: a?.hs_build_id() ?? null,
      core_load_error: i,
      city: c ? {
        w: c.w,
        h: c.h,
        seed: c.seed,
        city_hash: c.cityHash,
        structure_hash: c.structureHash,
        rng_after_city: c.rngAfter,
        counts: c.counts,
        matches_reference: Ln(c) !== null
      } : null,
      selected_lot: g,
      selected_person: we,
      view: w,
      step2: _ ? Bt(_) : null,
      week: ne,
      speed: ke,
      gangs: W.map((l) => ({ id: l.id, name: l.name, cash: l.cash, wages: l.wages, crew: l.crew.length, pool: l.pool.length })),
      people: a ? {
        count: a.hs_count(F.people),
        hashes: [1, 2, 3, 4].map((l) => a.hs_population_hash(l) >>> 0),
        rng_after_setup: (a.hs_count(F.setupLow) | a.hs_count(F.setupHigh) << 16) >>> 0,
        rng_after_minute_1: (a.hs_count(F.m1Low) | a.hs_count(F.m1High) << 16) >>> 0
      } : null
    }
  }), [e, o, c, m, a, i, g, we, w, _, ne, ke, W]), na = () => {
    z("crash_test");
    try {
      a?.hs_crash_test(4);
    } catch (l) {
      l instanceof Mt || ze("wasm", String(l));
    }
  }, aa = c ? M(Lt(c)) : "";
  return /* @__PURE__ */ t.createElement("div", { className: "game-shell" }, c && /* @__PURE__ */ t.createElement(
    _o,
    {
      city: c,
      selected: g,
      onSelect: Vt,
      turnSignal: $,
      visible: w === "street",
      label: M("street"),
      people: L,
      gangColours: Qn,
      person: we,
      onPerson: Wt,
      focus: Hn,
      markers: Ut,
      vehicles: G
    }
  ), c && w === "plan" && /* @__PURE__ */ t.createElement(ja, { city: c, selected: g, onSelect: Vt, label: M("plan"), markers: Ut }), /* @__PURE__ */ t.createElement("header", { className: "map-buttons" }, /* @__PURE__ */ t.createElement("div", { className: "title" }, /* @__PURE__ */ t.createElement("strong", null, M("title")), /* @__PURE__ */ t.createElement("span", null, M("subtitle"))), /* @__PURE__ */ t.createElement("div", { className: "buttons" }, /* @__PURE__ */ t.createElement("button", { className: "hud-btn", "aria-pressed": w === "plan", onClick: () => {
    const l = w === "plan" ? "street" : "plan";
    f(l), z("view", l);
  } }, M(w === "plan" ? "street" : "plan")), /* @__PURE__ */ t.createElement("button", { className: "hud-btn", disabled: w !== "street", onClick: () => {
    S((l) => l + 1), z("turn_view");
  } }, M("turn_view")), /* @__PURE__ */ t.createElement("button", { className: "hud-btn", onClick: ta }, M("m_menu")), /* @__PURE__ */ t.createElement("button", { className: "hud-btn", disabled: !a || !c, onClick: () => {
    v(!0), z("new_game_opened");
  } }, M("new_game")), /* @__PURE__ */ t.createElement("button", { className: "hud-btn", onClick: () => {
    const l = !o;
    r(l), yt("ahs.sound", l ? "on" : "off"), z("sound", l ? "on" : "off"), se(l);
  } }, M(o ? "sound_on" : "sound_off")), /* @__PURE__ */ t.createElement("button", { className: "hud-btn", "aria-pressed": O, onClick: () => {
    I(!O), z("debug", !O);
  } }, M("debug")), /* @__PURE__ */ t.createElement("button", { className: "hud-btn", onClick: () => {
    X(!0), z("report_opened", "button");
  } }, M("feedback")), /* @__PURE__ */ t.createElement("span", { className: "flags", "aria-label": "Language" }, tn.map((l) => /* @__PURE__ */ t.createElement("button", { key: l, "aria-pressed": l === e, title: l, onClick: () => {
    n(l), yt("ahs.lang", l), z("language", l);
  } }, /* @__PURE__ */ t.createElement(mo, { lang: l }))))), c && /* @__PURE__ */ t.createElement("div", { className: "city-line" }, M("city_line", { seed: c.seed, size: aa, w: c.w, h: c.h, lots: c.counts.lots.toLocaleString(e) }))), /* @__PURE__ */ t.createElement(
    Qa,
    {
      t: M,
      gangsOpen: Ie,
      onGangs: () => {
        _t(!Ie), pt(!1), z("gangs", !Ie);
      },
      ordersOpen: Ve,
      onOrders: () => {
        pt(!Ve), _t(!1), z("orders", !Ve);
      }
    }
  ), c && !gt && !oe && /* @__PURE__ */ t.createElement(Za, { city: c, lot: g, t: M, gangs: W, onClose: () => y(-1) }), oe && a && c && ye && /* @__PURE__ */ t.createElement(
    Fo,
    {
      t: M,
      x: ft,
      core: a,
      crews: ye.crews,
      draft: oe,
      setDraft: Ee,
      selectedBuilding: g >= 0 ? hn(a, c, g) : -1,
      selectedBlock: c.lots[g]?.block ?? -1,
      onIssued: (l) => {
        Kt(l), Ee(null);
      },
      onClose: () => Ee(null)
    }
  ), qe && /* @__PURE__ */ t.createElement("p", { className: "toast", role: "status", onClick: () => Ue("") }, qe), gt && /* @__PURE__ */ t.createElement(no, { person: gt, gangs: W, t: M, onClose: () => He(-1) }), /* @__PURE__ */ t.createElement(
    eo,
    {
      t: M,
      clock: ne,
      speed: ke,
      paused: Ye,
      onSpeed: (l) => {
        Gn(l), yt("ahs.speed", String(l)), z("speed", l);
      },
      onPause: () => {
        mt(!Ye), z("pause", !Ye);
      },
      onLaunch: Zn,
      onFinish: Jn
    }
  ), Ve && a && ye && /* @__PURE__ */ t.createElement(
    Lo,
    {
      t: M,
      x: ft,
      core: a,
      view: ye,
      running: !!ne?.running,
      onPerson: $t,
      onNewOrder: (l) => {
        Ee(Gt(l, "collect")), z("job_card", l);
      },
      onChanged: Kt,
      onClose: () => pt(!1),
      onShow: Xn
    }
  ), Ie && a && /* @__PURE__ */ t.createElement(
    ao,
    {
      gangs: W,
      t: M,
      names: (l) => he(a, l),
      onPerson: $t,
      onClose: () => _t(!1)
    }
  ), /* @__PURE__ */ t.createElement("p", { className: "view-help" }, M(w === "plan" ? "plan_key" : "view_help")), !c && !$e && /* @__PURE__ */ t.createElement("div", { className: "loading" }, i ? M("core_missing", { error: i }) : M("loading")), O && /* @__PURE__ */ t.createElement(
    Ia,
    {
      t: M,
      stamp: Nt,
      buildId: a?.hs_build_id() ?? null,
      stateHash: m,
      step2: _,
      city: c,
      core: a,
      onClose: () => I(!1),
      onSound: () => {
        z("test_sound"), se(o);
      },
      onCrash: na,
      orderCheck: Un,
      onOrderCheck: ea
    }
  ), $e && /* @__PURE__ */ t.createElement(
    Po,
    {
      t: M,
      canContinue: $n && !!c,
      ready: !!a,
      onContinue: () => {
        ht(!1), z("continue");
      },
      onNew: () => {
        a && (ht(!1), mt(!1), z("new_game", { seed: 1932, size: "standard", from: "menu" }), Ze(a, 1932, "standard"), se(o, 392));
      }
    }
  ), b && a && c && /* @__PURE__ */ t.createElement(
    oo,
    {
      lang: e,
      seed: c.seed,
      size: Lt(c),
      onCancel: () => v(!1),
      onStart: (l, E) => {
        v(!1), z("new_game", { seed: l, size: E }), Ze(a, l, E), se(o, 392);
      }
    }
  ), ue && /* @__PURE__ */ t.createElement("div", { className: "overlay open", role: "dialog", "aria-modal": "true", "aria-labelledby": "fb-title" }, /* @__PURE__ */ t.createElement("div", { className: "box" }, /* @__PURE__ */ t.createElement("h2", { id: "fb-title" }, M("report_title")), /* @__PURE__ */ t.createElement("label", null, M("expected"), /* @__PURE__ */ t.createElement("textarea", { autoFocus: !0, value: be, onChange: (l) => Be(l.target.value) })), /* @__PURE__ */ t.createElement("div", { className: "row" }, /* @__PURE__ */ t.createElement("button", { className: "main", onClick: () => {
    z("report_cancelled"), X(!1);
  } }, M("cancel")), /* @__PURE__ */ t.createElement(
    "button",
    {
      className: "main",
      disabled: be.trim() === "",
      onClick: () => {
        nn("manual", be.trim(), Zt), Be(""), X(!1);
      }
    },
    M("download")
  )))), p && /* @__PURE__ */ t.createElement("div", { className: "overlay open", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "crash-title" }, /* @__PURE__ */ t.createElement("div", { className: "box" }, /* @__PURE__ */ t.createElement("h2", { id: "crash-title" }, M("crash_title")), /* @__PURE__ */ t.createElement("p", null, M("crash_text", { code: p.code, name: M(`err${p.code}`) })), /* @__PURE__ */ t.createElement("p", { className: "where" }, p.file, ":", p.line), /* @__PURE__ */ t.createElement("div", { className: "row" }, /* @__PURE__ */ t.createElement("button", { className: "main", onClick: () => nn("crash", null, Zt) }, M("download")), /* @__PURE__ */ t.createElement("button", { className: "main", onClick: () => location.reload() }, M("reload"))))), /* @__PURE__ */ t.createElement("div", { className: "stamp" }, Nt));
}
ra(document.getElementById("root")).render(/* @__PURE__ */ t.createElement(Oo, null));
