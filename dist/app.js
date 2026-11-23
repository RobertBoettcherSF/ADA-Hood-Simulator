import * as b from "./vendor/three.module.min.js?v=v0.4.0%20b20261123-1325%2002c91f0";
const e = window.React, { createElement: Kn, Fragment: $n, useCallback: se, useEffect: I, useMemo: Le, useReducer: Un, useRef: ce, useState: L } = e, It = window.ReactDOM, { createRoot: Ht } = It, E = {
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
}, D = { block: 1, building: 3, person: 5, gang: 6, crew: 7, pool: 8, premises: 9 }, z = {
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
}, A = {
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
}, Dt = { protectGang: 3 }, Te = { lot: 0, type: 2 }, Pe = 480, ze = 2400, Ze = { name: 12, plan: 19 }, Xe = 12, Qe = 10;
class Fe extends Error {
}
async function Ot(t, a) {
  let s = null;
  const r = () => {
    if (!s) return "";
    let u = "";
    const d = s.hs_error_file_length();
    for (let h = 1; h <= d; h++) u += String.fromCharCode(s.hs_error_file_char(h));
    return u;
  }, n = Uint8Array.from(atob(t), (u) => u.charCodeAt(0)), { instance: l } = await WebAssembly.instantiate(n, {
    env: {
      hs_host_error(u, d) {
        const h = { code: u, file: r(), line: d };
        throw a(h), new Fe(`Ada core stopped: ${h.file}:${d}`);
      }
    }
  });
  return s = l.exports, s;
}
const x = (t) => t >>> 0, et = (t) => "0x" + x(t).toString(16).padStart(8, "0"), T = 54, _e = 14, pe = 3, Q = 256, ut = ["downtown", "commercial", "industrial", "residential", "civic"], Wt = ["urban", "park", "civic", "plaza", "avenue", "water"], mt = ["empty", "residential", "tenement", "commercial", "industrial", "municipal", "charity", "illegal"], qt = ["north", "east", "south", "west"], Vt = 192;
function Kt(t, a) {
  const s = (o) => new Int32Array(t.memory.buffer, t.hs_draw_ptr(o), t.hs_draw_len(o)), r = s(1), n = s(2), l = [];
  for (let o = 0; o * Xe < r.length; o++) {
    const m = o * Xe;
    l.push({
      id: o,
      gx: r[m],
      gy: r[m + 1],
      district: r[m + 2],
      use: r[m + 3],
      spanX: r[m + 4],
      spanY: r[m + 5],
      merged: r[m + 6],
      landValue: r[m + 7],
      squalor: r[m + 8],
      content: r[m + 9],
      rail: r[m + 10] === 1,
      landmark: r[m + 11],
      name: t.hs_get(D.block, o, Ze.name),
      plan: t.hs_get(D.block, o, Ze.plan)
    });
  }
  const u = [];
  for (let o = 0; o * Qe < n.length; o++) {
    const m = o * Qe;
    u.push({
      id: o,
      block: n[m],
      index: n[m + 1],
      x: n[m + 2] / Q,
      y: n[m + 3] / Q,
      w: n[m + 4] / Q,
      h: n[m + 5] / Q,
      face: n[m + 6],
      type: n[m + 7],
      cls: n[m + 8],
      storeys: n[m + 9]
    });
  }
  const d = [];
  for (let o = 1; o <= 4; o++) {
    const m = t.hs_get(D.gang, o, A.office), c = m >= 0 ? u[t.hs_get(D.building, m, Te.lot)] : void 0;
    if (!c) continue;
    const _ = c.x + c.w / 2, g = c.y + c.h / 2;
    d.push({
      gang: o,
      colour: t.hs_get(D.gang, o, A.colour),
      block: c.block,
      lot: c.id,
      fx: Math.floor(_ / (T / 5)),
      fy: Math.floor(g / (T / 5))
    });
  }
  const h = t.hs_count(E.blocksX), w = t.hs_count(E.blocksY);
  return {
    seed: a,
    w: h,
    h: w,
    standard: h === 40 && w === 32,
    blocks: l,
    lots: u,
    hq: d,
    cityHash: x(t.hs_city_hash()),
    structureHash: x(t.hs_structure_hash()),
    rngAfter: x(t.hs_count(E.rngLow) | t.hs_count(E.rngHigh) << 16),
    retries: t.hs_count(E.retries),
    status: t.hs_count(E.status),
    counts: {
      blocks: t.hs_count(E.blocks),
      merged: t.hs_count(E.merged),
      lots: t.hs_count(E.lots),
      // As generated, before the gangs turned fronts and offices (item 4).
      buildings: t.hs_count(E.buildings),
      typesUsed: t.hs_count(E.builtTypes),
      classes: mt.map((o, m) => t.hs_count(E.builtClassBase + m)),
      districts: ut.map((o, m) => t.hs_count(E.districtBase + m)),
      uses: Wt.map((o, m) => t.hs_count(E.useBase + m))
    }
  };
}
function ht(t) {
  return {
    x: t.gx * T + _e / 2 + pe,
    y: t.gy * T + _e / 2 + pe,
    w: t.spanX * T - _e - 2 * pe,
    h: t.spanY * T - _e - 2 * pe
  };
}
function $t(t, a, s) {
  const r = Math.floor(a / T), n = Math.floor(s / T);
  if (r < 0 || n < 0 || r >= t.w || n >= t.h) return -1;
  let l = t.blocks[n * t.w + r];
  l.merged >= 0 && (l = t.blocks[l.merged]);
  for (const u of t.lots)
    if (u.block === l.id && a >= u.x && a <= u.x + u.w && s >= u.y && s <= u.y + u.h) return u.id;
  return -1;
}
const tt = ["en-GB", "de", "es", "fr"], Ut = {
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
}, jt = {
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
}, Yt = {
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
}, Jt = {
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
}, Zt = { "en-GB": Ut, de: jt, es: Yt, fr: Jt };
function Ge(t, a, s = {}) {
  return Zt[t][a].replace(/\{(\w+)\}/g, (r, n) => String(s[n] ?? ""));
}
const Xt = performance.now(), Oe = 500, We = () => Math.round(performance.now() - Xt), we = [], be = [], ke = [];
let _t = 0, pt = 0;
function B(t, a) {
  we.length >= Oe && (we.shift(), _t++), we.push({ t_ms: We(), action: t, ...a === void 0 ? {} : { detail: a } });
}
function re(t, a) {
  be.length >= Oe && (be.shift(), pt++), be.push({ t_ms: We(), event: t, ...a === void 0 ? {} : { detail: a } });
}
function ie(t, a, s = {}) {
  ke.length >= Oe && ke.shift(), ke.push({ t_ms: We(), kind: t, message: a, ...s });
}
window.addEventListener("error", (t) => ie("javascript", String(t.message), { file: t.filename, line: t.lineno }));
window.addEventListener("unhandledrejection", (t) => ie("javascript", String(t.reason)));
function nt(t, a, s) {
  const r = {
    schema: "poncelet-report",
    schema_version: 1,
    kind: t,
    stamp: s.stamp,
    created: (/* @__PURE__ */ new Date()).toISOString(),
    seeds: s.seeds,
    test_key: null,
    expected: a,
    state_hash: s.stateHash,
    action_log: we,
    actions_dropped: _t,
    events: be,
    events_dropped: pt,
    errors: ke,
    environment: {
      user_agent: navigator.userAgent,
      browser_language: navigator.language,
      page_language: s.lang,
      viewport: [innerWidth, innerHeight],
      device_pixel_ratio: devicePixelRatio,
      reduced_motion: s.reducedMotion,
      sound: s.sound ? "on" : "off",
      url: location.href
    },
    custom: s.custom
  }, n = document.createElement("a");
  n.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" })), n.download = `hood-report-${s.stamp.split(" ")[1] ?? "dev"}-${Date.now()}.json`, document.body.appendChild(n), n.click(), n.remove(), setTimeout(() => URL.revokeObjectURL(n.href), 1e3), B("report_downloaded", t);
}
let le = null;
function $(t, a = 523.25) {
  if (!t) return;
  le ??= new AudioContext();
  const s = le.createOscillator(), r = le.createGain(), n = le.currentTime;
  s.type = "sine", s.frequency.value = a, r.gain.setValueAtTime(0, n), r.gain.linearRampToValueAtTime(0.05, n + 0.02), r.gain.exponentialRampToValueAtTime(1e-4, n + 0.3), s.connect(r).connect(le.destination), s.start(n), s.stop(n + 0.35);
}
function Ae(t, a) {
  try {
    return localStorage.getItem(t) ?? a;
  } catch {
    return a;
  }
}
function Be(t, a) {
  try {
    localStorage.setItem(t, a);
  } catch {
  }
}
const Qt = 0.55, en = 11, at = 1.5, oe = 900, tn = 240, qe = Math.SQRT2 * Math.tan(Math.PI / 6), Ee = Math.hypot(1, qe, 1), gt = qe / Ee;
function Ve(t) {
  return tn / t;
}
function nn(t) {
  const a = t ? -1 : 1;
  return [a / Ee, qe / Ee, a / Ee];
}
function an(t) {
  return Math.min(en, Math.max(Qt, t));
}
function sn(t, a, s, r) {
  const n = Ve(t.zoom), l = n * a, u = n * Math.SQRT1_2 / (2 * gt) + l * Math.SQRT1_2 / 2, d = (h, w) => w - u < u ? w / 2 : Math.min(w - u, Math.max(u, h));
  return { ...t, x: d(t.x, s), z: d(t.z, r) };
}
function rn(t, a, s, r) {
  const n = Ve(t.zoom) / r, l = t.turned ? -1 : 1, u = -a * n, d = s * n / gt;
  return {
    ...t,
    x: t.x + (u * l - d * l) * Math.SQRT1_2,
    z: t.z + (-u * l - d * l) * Math.SQRT1_2
  };
}
const ve = ["#5d5240", "#c49a6c", "#9b5a48", "#5f8fa8", "#7c7a74", "#e0d9c6", "#a08cc0", "#7a3b3b"], st = ["#8a8478", "#4f6e3a", "#9b9688", "#a99f8a", "#47474a", "#2e4f66"], de = ["#c0392b", "#2e8b57", "#2f5fb3", "#d9822b"], ln = "#3a3937", rt = 2830392, lt = 4.2, X = 0.3, ot = 0.8, q = T / 5, xe = 1.8, it = 0.9, on = [
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
class cn {
  renderer;
  scene = new b.Scene();
  camera = new b.OrthographicCamera(-1, 1, 1, -1, 1, 4e3);
  city = null;
  group = new b.Group();
  buildings = null;
  lotOfInstance = [];
  outline;
  walkers = null;
  personOfInstance = [];
  gangColour = [0, 0, 1, 2, 3];
  ring;
  raycaster = new b.Raycaster();
  view = { x: 0, z: 0, zoom: at, turned: !1 };
  frame = 0;
  constructor(a) {
    this.renderer = new b.WebGLRenderer({ canvas: a, antialias: !0 }), this.renderer.setPixelRatio(Math.min(2, devicePixelRatio)), this.scene.background = new b.Color(rt), this.scene.fog = new b.Fog(rt, oe + 300, oe + 2600), this.scene.add(new b.HemisphereLight(15262420, 3814184, 1.6));
    const s = new b.DirectionalLight(16773852, 1.8);
    s.position.set(-300, 600, -150), this.scene.add(s), this.scene.add(this.group), this.outline = new b.LineSegments(
      new b.EdgesGeometry(new b.BoxGeometry(1, 1, 1)),
      new b.LineBasicMaterial({ color: 16769674 })
    ), this.outline.visible = !1, this.scene.add(this.outline), this.ring = new b.Mesh(new b.RingGeometry(1.4, 2.2, 24), new b.MeshBasicMaterial({ color: 16769674, side: b.DoubleSide })), this.ring.rotation.x = -Math.PI / 2, this.ring.visible = !1, this.scene.add(this.ring);
  }
  setCity(a) {
    this.city = a;
    for (const o of [...this.group.children])
      this.group.remove(o), o instanceof b.Mesh && (o.geometry.dispose(), o.material.dispose());
    const s = a.w * T, r = a.h * T, n = new b.Mesh(
      new b.PlaneGeometry(s + 400, r + 400),
      new b.MeshLambertMaterial({ color: ln })
    );
    n.rotation.x = -Math.PI / 2, n.position.set(s / 2, 0, r / 2), this.group.add(n);
    const l = a.blocks.filter((o) => o.merged < 0), u = new b.InstancedMesh(new b.BoxGeometry(1, 1, 1), new b.MeshLambertMaterial(), l.length), d = new b.Matrix4(), h = new b.Color();
    l.forEach((o, m) => {
      const c = ht(o), g = o.use === 4 || o.use === 5 ? 0.05 : X;
      d.makeScale(c.w, g, c.h).setPosition(c.x + c.w / 2, g / 2, c.y + c.h / 2), u.setMatrixAt(m, d), u.setColorAt(m, h.set(st[o.use] ?? st[0]));
    }), this.group.add(u), this.lotOfInstance = a.lots.map((o) => o.id);
    const w = new b.InstancedMesh(new b.BoxGeometry(1, 1, 1), new b.MeshLambertMaterial(), a.lots.length);
    a.lots.forEach((o, m) => {
      const _ = o.cls === 0 ? 0.25 : Math.max(1, o.storeys) * lt, g = Math.max(0.5, o.w - 2 * ot), C = Math.max(0.5, o.h - 2 * ot);
      d.makeScale(g, _, C).setPosition(o.x + o.w / 2, X + _ / 2, o.y + o.h / 2), w.setMatrixAt(m, d), w.setColorAt(m, h.set(ve[o.cls] ?? ve[0]));
    }), this.buildings = w, this.group.add(w);
    for (const o of a.hq) {
      const m = new b.MeshLambertMaterial({ color: de[o.colour % 4] }), c = new b.Mesh(new b.CylinderGeometry(0.6, 0.6, 40, 8), m);
      c.position.set(o.fx * q + q / 2, 20, o.fy * q + q / 2), this.group.add(c);
      const _ = new b.Mesh(new b.BoxGeometry(12, 7, 0.4), m.clone());
      _.position.set(o.fx * q + q / 2 + 6.5, 36, o.fy * q + q / 2), this.group.add(_);
    }
    this.walkers = null, this.ring.visible = !1, this.outline.visible = !1, this.view = { x: s / 2, z: r / 2, zoom: at, turned: !1 }, this.update();
  }
  /** The people layer (x, y, role, gang, indoors per person): figures for
   * everyone not indoors. gangColours maps gang number to colour index. */
  setPeople(a, s, r) {
    const n = a.length / 5;
    if (!this.walkers || this.walkers.instanceMatrix.count < n) {
      this.walkers && (this.group.remove(this.walkers), this.walkers.geometry.dispose(), this.walkers.material.dispose());
      const h = new b.CylinderGeometry(it / 2, it / 2, xe, 6);
      h.translate(0, xe / 2 + X, 0), this.walkers = new b.InstancedMesh(h, new b.MeshLambertMaterial(), Math.max(n, 1)), this.walkers.frustumCulled = !1, this.group.add(this.walkers);
    }
    this.gangColour = s;
    const l = new b.Matrix4(), u = new b.Color();
    let d = 0;
    this.personOfInstance.length = 0;
    for (let h = 0; h < n; h++) {
      const w = h * 5;
      if (a[w + 4] === 1) continue;
      l.makeTranslation(a[w] / 256, 0, a[w + 1] / 256), this.walkers.setMatrixAt(d, l);
      const o = a[w + 3];
      this.walkers.setColorAt(d++, u.set(o > 0 ? de[(this.gangColour[o] ?? 0) % 4] : on[a[w + 2]] ?? "#ffffff")), this.personOfInstance.push(h), h === r && this.ring.position.set(a[w] / 256, X + 0.05, a[w + 1] / 256);
    }
    return this.ring.visible = r >= 0 && r < n && a[r * 5 + 4] !== 1, this.walkers.count = d, this.walkers.instanceMatrix.needsUpdate = !0, this.walkers.instanceColor && (this.walkers.instanceColor.needsUpdate = !0), this.walkers.computeBoundingSphere(), this.render(), d;
  }
  select(a) {
    const s = this.city?.lots[a];
    if (!s) {
      this.outline.visible = !1, this.render();
      return;
    }
    const r = s.cls === 0 ? 0.6 : Math.max(1, s.storeys) * lt + 0.4;
    this.outline.scale.set(s.w, r, s.h), this.outline.position.set(s.x + s.w / 2, X + r / 2, s.y + s.h / 2), this.outline.visible = !0, this.render();
  }
  size() {
    const a = this.renderer.domElement;
    return { w: a.clientWidth || 1, h: a.clientHeight || 1 };
  }
  /** Applies the view: clamps it, places the camera, renders. */
  update() {
    if (!this.city) return;
    const { w: a, h: s } = this.size();
    this.renderer.setSize(a, s, !1), this.view = sn({ ...this.view, zoom: an(this.view.zoom) }, a / s, this.city.w * T, this.city.h * T);
    const r = Ve(this.view.zoom), n = r * (a / s);
    Object.assign(this.camera, { left: -n / 2, right: n / 2, top: r / 2, bottom: -r / 2 }), this.camera.updateProjectionMatrix();
    const [l, u, d] = nn(this.view.turned);
    this.camera.position.set(this.view.x + l * oe, u * oe, this.view.z + d * oe), this.camera.lookAt(this.view.x, 0, this.view.z), this.render();
  }
  render() {
    cancelAnimationFrame(this.frame), this.frame = requestAnimationFrame(() => this.renderer.render(this.scene, this.camera));
  }
  drag(a, s) {
    this.view = rn(this.view, a, s, this.size().h), this.update();
  }
  zoomBy(a) {
    this.view = { ...this.view, zoom: this.view.zoom * a }, this.update();
  }
  turn() {
    this.view = { ...this.view, turned: !this.view.turned }, this.update();
  }
  lookAt(a, s) {
    this.view = { ...this.view, x: a, z: s }, this.update();
  }
  /** What is under a canvas point: a person (nearest figure within a few
   * pixels) or else a lot; -1 for nothing. */
  pick(a, s) {
    if (!this.buildings) return { person: -1, lot: -1 };
    const r = this.renderer.domElement.getBoundingClientRect(), n = new b.Vector2((a - r.left) / r.width * 2 - 1, -((s - r.top) / r.height) * 2 + 1);
    if (this.walkers && this.walkers.count > 0) {
      const u = new b.Matrix4(), d = new b.Vector3();
      let h = -1, w = 64;
      for (let o = 0; o < this.walkers.count; o++) {
        this.walkers.getMatrixAt(o, u), d.setFromMatrixPosition(u).setY(X + xe / 2).project(this.camera);
        const m = (d.x - n.x) * r.width / 2, c = (d.y - n.y) * r.height / 2, _ = m * m + c * c;
        _ < w && (w = _, h = o);
      }
      if (h >= 0) return { person: this.personOfInstance[h], lot: -1 };
    }
    this.raycaster.setFromCamera(n, this.camera);
    const l = this.raycaster.intersectObject(this.buildings, !1)[0];
    return { person: -1, lot: l?.instanceId != null ? this.lotOfInstance[l.instanceId] : -1 };
  }
  dispose() {
    cancelAnimationFrame(this.frame), this.renderer.dispose();
  }
}
const dn = ["#d8c59a", "#cdbf9f", "#a9a49a", "#c8b9a0", "#bfc3c7"], un = "#7d9a5d", mn = "#5f86a3", hn = "#8f8a80", _n = "#d6ccb4", pn = "#e9dfc6", gn = "#b9ad93";
function fn({ city: t, selected: a, onSelect: s, label: r }) {
  const n = ce(null), l = ce({ scale: 1, ox: 0, oy: 0 });
  I(() => {
    const d = n.current;
    if (!d) return;
    const h = () => {
      const o = Math.min(2, devicePixelRatio), m = d.clientWidth, c = d.clientHeight;
      d.width = Math.round(m * o), d.height = Math.round(c * o);
      const _ = d.getContext("2d");
      if (!_) return;
      const g = t.w * T, C = t.h * T, P = 24, S = Math.min((m - 2 * P) / g, (c - 2 * P) / C), R = (m - g * S) / 2, k = (c - C * S) / 2;
      l.current = { scale: S, ox: R, oy: k }, _.setTransform(o * S, 0, 0, o * S, o * R, o * k), _.fillStyle = pn, _.fillRect(-P / S, -P / S, g + 2 * P / S, C + 2 * P / S), _.fillStyle = gn, _.fillRect(0, 0, g, C);
      for (const p of t.blocks) {
        if (p.merged >= 0) continue;
        const M = ht(p);
        _.fillStyle = p.use === 1 ? un : p.use === 5 ? mn : p.use === 4 ? hn : p.use === 3 ? _n : dn[p.district], _.fillRect(M.x - 2, M.y - 2, M.w + 4, M.h + 4);
      }
      for (const p of t.lots)
        _.fillStyle = ve[p.cls] ?? ve[0], _.globalAlpha = p.cls === 0 ? 0.35 : 0.9, _.fillRect(p.x + 0.6, p.y + 0.6, Math.max(0.5, p.w - 1.2), Math.max(0.5, p.h - 1.2));
      _.globalAlpha = 1;
      const f = t.lots[a];
      f && (_.strokeStyle = "#1b1208", _.lineWidth = 2.5 / S, _.strokeRect(f.x - 1, f.y - 1, f.w + 2, f.h + 2));
      for (const p of t.hq) {
        const M = (p.fx + 0.5) * (T / 5), F = (p.fy + 0.5) * (T / 5), G = 9 / S;
        _.fillStyle = "#1b1208", _.fillRect(M - 0.6 / S, F - 2.2 * G, 1.2 / S, 2.2 * G), _.fillStyle = de[p.colour % 4], _.beginPath(), _.moveTo(M, F - 2.2 * G), _.lineTo(M + 1.6 * G, F - 1.7 * G), _.lineTo(M, F - 1.2 * G), _.fill();
      }
    };
    h();
    const w = new ResizeObserver(h);
    return w.observe(d), () => w.disconnect();
  }, [t, a]);
  const u = (d) => {
    const h = d.currentTarget.getBoundingClientRect(), w = l.current;
    s($t(t, (d.clientX - h.left - w.ox) / w.scale, (d.clientY - h.top - w.oy) / w.scale));
  };
  return /* @__PURE__ */ e.createElement("canvas", { className: "city-plan", ref: n, onClick: u, "aria-label": r });
}
const Ie = [
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
], ft = [48, 31, 59, 54, 80, 33, 22, 63, 76, 45, 72, 89, 91, 73, 21, 13, 95, 51, 49, 97], wt = [
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
], He = [13824, 2764, 1280, 362, 46341, 65536, 128, 5, 38500], wn = [
  { w: 36, h: 28, seed: 1932, rng: 787968811, city: 130389902, structure: 2172434479, blocks: 1008, merged: 140, lots: 8769, buildings: 8769, types: 164, hq: [] },
  { w: 40, h: 32, seed: 1932, rng: 1183664769, city: 162525796, structure: 3010893233, blocks: 1280, merged: 22, lots: 4580, buildings: 4580, types: 170, hq: [[13, 10], [31, 4], [7, 20], [36, 25]] },
  { w: 44, h: 35, seed: 1932, rng: 214220379, city: 1231309806, structure: 2436981367, blocks: 1540, merged: 209, lots: 13488, buildings: 13488, types: 166, hq: [] },
  { w: 40, h: 32, seed: 187, rng: 1183663024, city: 2335500783, structure: 2753879728, blocks: 1280, merged: 20, lots: 4733, buildings: 4733, types: 170, hq: [[11, 9], [29, 4], [9, 17], [25, 23]] }
], bn = [
  { w: 40, h: 32, seed: 1932, people: 8479, rngSetup: 532198006, rngMinute1: 3184470837, hashes: [762905189, 59061474, 867735307, 2325457386] },
  { w: 44, h: 35, seed: 1932, people: 20879, rngSetup: 3696518514, rngMinute1: 2775660613, hashes: [4085821087, 1945027344, 3513816520, 825993883] }
], ee = { seed: 1932, auto: 1932, w: 44, h: 35 };
function De(t) {
  const a = [Ie, ft, wt];
  return {
    random: t.streams.reduce((s, r, n) => s + r.filter((l, u) => l === a[n][u]).length, 0),
    checks: t.checks.filter((s, r) => s === He[r]).length
  };
}
function bt(t) {
  return wn.find((a) => a.w === t.w && a.h === t.h && a.seed === t.seed) ?? null;
}
const ge = ({ v: t, expect: a }) => /* @__PURE__ */ e.createElement("td", { className: t === a ? "ok" : "bad" }, t);
function kn({ t, stamp: a, buildId: s, stateHash: r, step2: n, city: l, core: u, onClose: d, onSound: h, onCrash: w }) {
  const o = l ? bn.find((k) => k.w === l.w && k.h === l.h && k.seed === l.seed) ?? null : null, m = (k, f) => u ? x(u.hs_count(k) | u.hs_count(f) << 16) : 0, c = u && l ? [
    [t("d_people"), u.hs_count(E.people), o?.people ?? null],
    [t("d_rng"), m(E.setupLow, E.setupHigh), o?.rngSetup ?? null],
    ...["people", "positions", "opinions", "names"].map((k, f) => [`${k} hash`, x(u.hs_population_hash(f + 1)), o?.hashes[f] ?? null]),
    // Shown once week 1 has run its first minute (0 before).
    [t("d_minute1"), m(E.m1Low, E.m1High), o?.rngMinute1 ?? null]
  ] : [], _ = c.filter(([, k, f]) => f !== null && x(k) === x(f)).length, g = l ? bt(l) : null, C = l ? [
    [t("d_rng"), l.rngAfter, g?.rng ?? null],
    [t("d_city"), l.cityHash, g?.city ?? null],
    [t("d_structure"), l.structureHash, g?.structure ?? null],
    ["blocks", l.counts.blocks, g?.blocks ?? null],
    ["merged", l.counts.merged, g?.merged ?? null],
    ["lots", l.counts.lots, g?.lots ?? null],
    ["buildings", l.counts.buildings, g?.buildings ?? null],
    ["types", l.counts.typesUsed, g?.types ?? null],
    ...g?.hq.length ? g.hq.map((k, f) => {
      const p = l.hq[f] ? l.blocks[l.hq[f].block] : null;
      return [`HQ ${f + 1} (gx·100 + gy)`, p ? p.gx * 100 + p.gy : -1, k[0] * 100 + k[1]];
    }) : []
  ] : [], P = C.filter(([, k, f]) => f !== null && x(k) === x(f)).length, S = n ? De(n) : null, R = [Ie, ft, wt];
  return /* @__PURE__ */ e.createElement("aside", { className: "drawer", "aria-label": t("d_title") }, /* @__PURE__ */ e.createElement("header", null, /* @__PURE__ */ e.createElement("h2", null, t("d_title")), /* @__PURE__ */ e.createElement("button", { className: "close", onClick: d, "aria-label": t("d_close") }, "×")), u && l && /* @__PURE__ */ e.createElement("section", null, /* @__PURE__ */ e.createElement("h3", null, t("d_step4")), /* @__PURE__ */ e.createElement("p", { className: "sum" }, o ? t("d_match", { n: _, m: c.length }) : t("d_no_ref")), /* @__PURE__ */ e.createElement("table", null, /* @__PURE__ */ e.createElement("tbody", null, c.map(([k, f, p]) => /* @__PURE__ */ e.createElement("tr", { key: k }, /* @__PURE__ */ e.createElement("th", null, k), p === null ? /* @__PURE__ */ e.createElement("td", null, x(f)) : /* @__PURE__ */ e.createElement(ge, { v: x(f), expect: x(p) }), /* @__PURE__ */ e.createElement("td", null, p === null ? "" : x(p))))))), /* @__PURE__ */ e.createElement("section", null, /* @__PURE__ */ e.createElement("h3", null, t("d_step3")), l && /* @__PURE__ */ e.createElement("p", { className: "sum" }, t("d_counts", {
    b: l.counts.blocks,
    m: l.counts.merged,
    l: l.counts.lots,
    n: l.counts.buildings,
    t: l.counts.typesUsed,
    r: l.retries
  })), /* @__PURE__ */ e.createElement("p", { className: "sum" }, g ? t("d_match", { n: P, m: C.length }) : t("d_no_ref")), /* @__PURE__ */ e.createElement("table", null, /* @__PURE__ */ e.createElement("tbody", null, C.map(([k, f, p]) => /* @__PURE__ */ e.createElement("tr", { key: k }, /* @__PURE__ */ e.createElement("th", null, k), p === null ? /* @__PURE__ */ e.createElement("td", null, x(f)) : /* @__PURE__ */ e.createElement(ge, { v: x(f), expect: x(p) }), /* @__PURE__ */ e.createElement("td", null, p === null ? "" : x(p))))))), /* @__PURE__ */ e.createElement("section", null, /* @__PURE__ */ e.createElement("h3", null, t("d_step1")), /* @__PURE__ */ e.createElement("table", null, /* @__PURE__ */ e.createElement("tbody", null, /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("th", null, t("d_stamp")), /* @__PURE__ */ e.createElement("td", null, a)), /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("th", null, t("d_build_id")), /* @__PURE__ */ e.createElement("td", null, s ?? "…")), /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("th", null, t("d_state")), /* @__PURE__ */ e.createElement("td", null, r === null ? "…" : `${et(r)} (${x(r)})`)))), /* @__PURE__ */ e.createElement("div", { className: "row" }, /* @__PURE__ */ e.createElement("button", { className: "main", onClick: h }, t("test_sound")), /* @__PURE__ */ e.createElement("button", { className: "main danger", onClick: w }, t("crash_test")))), n && S && /* @__PURE__ */ e.createElement("section", null, /* @__PURE__ */ e.createElement("h3", null, t("d_step2")), /* @__PURE__ */ e.createElement("p", { className: "sum" }, t("random_sum", { n: S.random, m: 60 })), /* @__PURE__ */ e.createElement("div", { className: "scroll" }, /* @__PURE__ */ e.createElement("table", null, /* @__PURE__ */ e.createElement("thead", null, /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("th", null, t("col_i")), /* @__PURE__ */ e.createElement("th", null, t("col_main")), /* @__PURE__ */ e.createElement("th", null, t("col_ref")), /* @__PURE__ */ e.createElement("th", null, t("col_int")), /* @__PURE__ */ e.createElement("th", null, t("col_ref")), /* @__PURE__ */ e.createElement("th", null, t("col_plan")), /* @__PURE__ */ e.createElement("th", null, t("col_ref")))), /* @__PURE__ */ e.createElement("tbody", null, Ie.map((k, f) => /* @__PURE__ */ e.createElement("tr", { key: f }, /* @__PURE__ */ e.createElement("td", null, f + 1), [0, 1, 2].map((p) => /* @__PURE__ */ e.createElement(e.Fragment, { key: p }, /* @__PURE__ */ e.createElement(ge, { v: n.streams[p][f], expect: R[p][f] }), /* @__PURE__ */ e.createElement("td", null, R[p][f])))))))), /* @__PURE__ */ e.createElement("p", { className: "sum" }, t("numbers_sum", { n: S.checks, m: n.checks.length })), /* @__PURE__ */ e.createElement("table", null, /* @__PURE__ */ e.createElement("thead", null, /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("th", null, t("col_check")), /* @__PURE__ */ e.createElement("th", null, t("col_ada")), /* @__PURE__ */ e.createElement("th", null, t("col_exp")))), /* @__PURE__ */ e.createElement("tbody", null, n.checks.map((k, f) => /* @__PURE__ */ e.createElement("tr", { key: f }, /* @__PURE__ */ e.createElement("th", null, t(`c${f + 1}`)), /* @__PURE__ */ e.createElement(ge, { v: k, expect: He[f] }), /* @__PURE__ */ e.createElement("td", null, He[f]))))), /* @__PURE__ */ e.createElement("p", { className: "sum" }, t("grid_sum", { w: n.gw, h: n.gh, n: n.gw * n.gh })), /* @__PURE__ */ e.createElement("div", { className: "grid-sample", "aria-hidden": "true" }, n.pattern.map((k, f) => /* @__PURE__ */ e.createElement("i", { key: f, className: k === 1 ? "b" : k === 0 ? "s" : "x" }))), /* @__PURE__ */ e.createElement("p", { className: "sum" }, t("grid_legend")), /* @__PURE__ */ e.createElement("p", { className: "sum" }, t("world_sum", {
    seed: ee.seed,
    auto: ee.auto,
    w: n.gw,
    h: n.gh,
    hash: `${et(n.worldHash)} (${x(n.worldHash)})`
  }))));
}
const ye = ["Bakers", "Butchers", "Grocers", "Convenience Store", "Shoe Store", "Tailors", "Book Store", "Printers", "Pawnbrokers", "Jewellers", "Furrier", "Drug Store", "Plumbers", "Cafe", "Milk Bar", "Breakfast Bar", "Restaurant", "Pool Hall", "Gymnasium", "Health Center", "Massage Parlor", "Dance Studio", "Barbers", "Laundry", "Hardware Store", "Auto Shop", "Finance Company", "Accountancy Firm", "Law Offices", "Hotel", "Hotel (Large)", "Department Store", "Bank", "Main Bank", "Newspaper Offices", "Radio Station", "Warehouse", "Foundry", "Mill", "Cannery", "Garage Depot", "Trade Union", "Docks", "Railroad Terminal", "Tenement Block", "Apartment Block", "Residences", "City Hall", "Courthouse", "Police Headquarters", "Hospital", "School", "Library", "Labour Exchange", "Fire House", "F.B.I. Headquarters", "Museum", "Public Baths", "US Post", "Power Plant", "Water Plant", "Residences", "Church", "Orphanage", "Soup Kitchen", "Clothing Bank", "Office", "Speakeasy", "Moonshine Still", "Casino", "Card Games", "Dice Game", "Gambling Den", "Prizefight Ring", "Grifters", "Insider Trading", "Loan Shark", "Counterfeit Press", "Numbers Racket", "Rented Rooms", "Teamsters", "Acupuncture Clinic", "Antiques Dealer", "Art Gallery", "Auction Rooms", "Auto Dealers", "Bailiffs", "Beauty Parlor", "Blacksmiths", "Bridal Parlor", "Cab Company", "Cake Store", "Candy Store", "Carpet Store", "Catering Suppliers", "Cheese Store", "China Store", "Chiropodists", "Clothiers", "Coffin Makers", "Cosmetics Store", "Delicatessen", "Orthodontists", "Detective Agency", "Diamond Merchant", "Doctors", "Dressmakers", "Electrical Suppliers", "Electricians", "Costume Store", "Fishmongers", "Florists", "Fortune Tellers", "French Polishers", "Fruit and Veg. Store", "Funeral Directors", "Furniture Store", "Gardening Suppliers", "Gas Station/Mechanic", "Gift Store", "Gold Merchants", "Golf Store", "Gramophone Store", "Glassware", "Haberdashery", "Hair Salon", "Wig Makers", "Ice Store", "Ice Cream Parlor", "Ladieswear", "Lingerie Store", "Local Store", "Locksmiths", "Lumber Merchant", "Milliners", "Movie Theater", "Music Store", "News Agency", "Nursery Store", "Optometrist", "Perfume Store", "Pest Controllers", "Pet Store", "Photographers", "Piano Store", "Real Estate", "Record Store", "Removals Company", "Saddlers", "Shoe Repairs", "Sign Writers", "Soda Fountain", "Sports Equipment", "Stamp and Coin Dealers", "Stationers", "Tattoo Parlor", "Telegraph Office", "Theater", "Tobacconists", "Toy Store", "Upholsterers", "Watchmakers", "Window Cleaners", "Abattoir", "Builders", "Cement Factory", "Ceramics", "Chandler", "Leather Curers", "Engineers", "Excavators", "Fabricators", "Factory", "Food Processors", "Freight Forwarding", "Furriers", "Glaziers", "Ice House", "Ironmongers", "Joiners", "Junk Yard", "Lumber Yard", "Milk Yard", "Packaging Plant", "Paper Mill", "Sheet Workers", "Steel Mill", "Stone Masons", "Tanners", "Textiles", "Weavers", "Wheelwrights", "Empty land"], En = ["Volstead Green", "Hinge Oak", "Lantern Park", "Cinder Gardens"], yn = ["St. Michael’s", "St. Mary’s", "St. Joseph’s", "St. Patrick’s"], vn = ["Alphonse", "Vito", "Salvatore", "Frank", "Johnny", "Tommy", "Angelo", "Rocco", "Carmine", "Dominic", "Enzo", "Gino", "Luigi", "Marco", "Nico", "Paulie", "Sal", "Tony", "Vinnie", "Bugsy", "Dutch", "Lefty", "Moe", "Jake", "Abe", "Sam", "Meyer", "Solly", "Hymie", "Sean", "Declan", "Patrick", "Liam", "Eamon", "Rory", "Mickey", "Fergus", "Brendan", "Walter", "Harold", "Clarence", "Chester", "Herbert", "Raymond", "Ernest", "Floyd", "Otto", "Klaus", "Heinrich", "Wilhelm", "Stefan", "Anton", "Ludwig", "Amos", "Cyrus", "Silas", "Homer", "Virgil", "Emmett", "Wilbur", "Elmer", "Orville", "Rosa", "Concetta", "Maria", "Angelina", "Lucia", "Carmela", "Gina", "Nina", "Sofia", "Bridget", "Maureen", "Nora", "Colleen", "Kathleen", "Siobhan", "Aileen", "Ruth", "Esther", "Sadie", "Belle", "Pearl", "Mabel", "Hazel", "Edna", "Vera", "Opal", "Dorothy", "Gladys", "Mildred", "Beatrice", "Constance", "Harriet", "Florence", "Greta", "Ilse", "Anneliese", "Hilde", "Marlene", "Lillian", "Wilma", "Norma", "Thelma", "Bessie", "Myrtle", "Ada", "Capone", "Moretti", "Bellini", "Ricci", "Costa", "Rinaldi", "Marino", "Gallo", "Fontana", "Genovese", "Lombardi", "Barbieri", "Vitale", "Ferrante", "Bruno", "Greco", "Rizzo", "OConnell", "Doyle", "Kelly", "Sullivan", "Murphy", "Flanagan", "Gallagher", "Quinn", "Byrne", "Donnelly", "Fitzgerald", "Rourke", "Maguire", "Brennan", "Rosenberg", "Goldstein", "Weiss", "Kaplan", "Lansky", "Bernstein", "Shapiro", "Roth", "Schmidt", "Braun", "Wagner", "Keller", "Hoffman", "Zimmer", "Krause", "Bauer", "Kowalski", "Nowak", "Wozniak", "Zielinski", "Jankowski", "Whitaker", "Ashford", "Carmichael", "Blackwood", "Hollis", "Vance", "Sterling", "Marsh", "Doyle", "Crane", "Hargrove", "Pemberton", "Locke", "Radcliffe", "Winslow", "Petrov", "Sokolov", "Ivanov", "Volkov", "Papadakis", "Stavros", "Kostas", "Scarface", "The Enforcer", "Bugs", "Baby Face", "Pretty Boy", "Lucky", "The Waiter", "Machine Gun", "The Chin", "Three Fingers", "The Cigar", "Ice Pick", "Knuckles", "The Weasel", "Fats", "Slim", "The Ghost", "Nails", "Trigger", "Whitey", "Doc", "The Butcher", "Sleepy", "Cricket", "Half-Moon", "Tick-Tock", "Silk", "Curly", "Moretti", "OConnell", "Rosenberg", "Vanetti", "Delgado", "Kowalski", "Bellini", "Doyle", "Marchetti", "Sullivan", "Weiss", "Corvino", "Clarence", "Amos", "Floyd", "Ellis", "Jesse", "Otis", "Rufus", "Willie", "Booker", "Luther", "Calvin", "Odell", "Pearl", "Bessie", "Hazel", "Mattie", "Viola", "Ida", "Lula", "Minnie", "Washington", "Jefferson", "Coleman", "Freeman", "Banks", "Tillman", "Haywood", "Hollins", "Mosley", "Gaines", "Pruitt", "Dawson", "Walter", "Clarence", "Chester", "Harold", "Herbert", "Leonard", "Raymond", "Everett", "Howard", "Lloyd", "Russell", "Wesley", "Dorothy", "Mildred", "Edna", "Gladys", "Irene", "Myrtle", "Agnes", "Vera", "Whitaker", "Carmichael", "Pemberton", "Ashford", "Blakely", "Hollis", "Prescott", "Thornton", "Granger", "Whitfield", "Kendall", "Hartley", "Henry", "Walter", "Eddie", "Tommy", "Albert", "Johnny", "Frank", "Sam", "George", "Harry", "Mae", "Lillian", "Rose", "Ruby", "Grace", "Alice", "Lee", "Wong", "Chin", "Chan", "Fong", "Lum", "Yee", "Quan", "Moy", "Louie", "Otto", "Heinrich", "Ludwig", "Fritz", "Hans", "Karl", "Werner", "Max", "Franz", "Wilhelm", "Emil", "Gustav", "Greta", "Hilde", "Ilse", "Frieda", "Marta", "Klara", "Liesl", "Erna", "Schmidt", "Keller", "Bauer", "Wagner", "Weber", "Hoffmann", "Kruger", "Fischer", "Becker", "Schulz", "Vogel", "Braun", "Nikos", "Kostas", "Yannis", "Dimitri", "Spiros", "Christos", "Vasilis", "Andreas", "Petros", "Stelios", "Eleni", "Sophia", "Katerina", "Despina", "Irini", "Anastasia", "Papadakis", "Stavros", "Kostas", "Pappas", "Karras", "Demos", "Galanis", "Vlahos", "Manos", "Lykos", "Declan", "Brendan", "Mickey", "Fergus", "Seamus", "Liam", "Cormac", "Dermot", "Owen", "Paddy", "Kieran", "Ronan", "Bridget", "Maureen", "Nora", "Siobhan", "Kathleen", "Peggy", "Eileen", "Molly", "Doyle", "Flanagan", "Maguire", "OConnell", "Sullivan", "Callahan", "Brennan", "Keane", "Murphy", "Quinlan", "Dolan", "Hennessy", "Salvatore", "Rocco", "Carmine", "Vito", "Angelo", "Enzo", "Luigi", "Marco", "Paolo", "Domenico", "Sal", "Nunzio", "Tony", "Frankie", "Gino", "Aldo", "Concetta", "Rosa", "Carmela", "Lucia", "Gina", "Teresa", "Filomena", "Angela", "Moretti", "Rinaldi", "Ferrante", "Vanetti", "Corvino", "Bellini", "Marchetti", "Ricci", "Costa", "Lombardi", "Esposito", "Greco", "Russo", "Romano", "Santoro", "Meyer", "Abe", "Solly", "Moe", "Izzy", "Benny", "Hymie", "Sam", "Lou", "Morris", "Irving", "Nat", "Esther", "Sadie", "Ruth", "Miriam", "Rivka", "Bella", "Fanny", "Goldie", "Rosenberg", "Kaplan", "Shapiro", "Weiss", "Goldberg", "Levine", "Feldman", "Siegel", "Abrams", "Horowitz", "Adler", "Bernstein", "Miguel", "Rafael", "Ernesto", "Jose", "Luis", "Ramon", "Alfonso", "Joaquin", "Arturo", "Ignacio", "Guadalupe", "Rosa", "Elena", "Consuelo", "Dolores", "Lupita", "Carmen", "Juana", "Delgado", "Ramirez", "Castillo", "Morales", "Herrera", "Navarro", "Fuentes", "Ortega", "Salazar", "Mendoza", "Stefan", "Anton", "Kazimierz", "Jan", "Tadeusz", "Wojciech", "Jozef", "Marek", "Leon", "Bronislaw", "Wanda", "Halina", "Jadwiga", "Zofia", "Irena", "Stasia", "Kowalski", "Nowak", "Zielinski", "Wisniewski", "Lewandowski", "Kaminski", "Mazur", "Sobczak", "Pawlak", "Dudek"], Sn = ["boss", "lieutenant", "hood", "accountant", "lawyer", "citizen", "owner", "police", "firefighter", "policeChief", "fbi", "fbiHead", "judge", "da", "mayor", "reporter", "clergy", "snitch"], kt = ["intelligence", "organization", "business", "firearms", "fists", "knives", "arson", "explosives", "intimidation", "driving", "stealth"];
function Cn({ city: t, lot: a, t: s, onClose: r, gangs: n }) {
  const l = t.lots[a];
  if (!l) return /* @__PURE__ */ e.createElement("aside", { className: "card building-card idle" }, /* @__PURE__ */ e.createElement("p", null, s("card_none")));
  const u = t.blocks[l.block], d = t.hq.find((m) => m.lot === l.id), w = (l.type === ye.indexOf("Church") && u.name >= 0 ? yn[u.name] : null) ?? ye[l.type] ?? ye[Vt], o = (m, c) => /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("dt", null, s(m)), /* @__PURE__ */ e.createElement("dd", null, c));
  return /* @__PURE__ */ e.createElement("aside", { className: "card building-card", "aria-live": "polite" }, /* @__PURE__ */ e.createElement("header", null, /* @__PURE__ */ e.createElement("span", { className: "swatch", "data-cls": l.cls }), /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("h3", null, w), /* @__PURE__ */ e.createElement("div", { className: "sub" }, s(`cls_${mt[l.cls]}`), " · ", s(`dist_${ut[u.district]}`))), /* @__PURE__ */ e.createElement("button", { className: "close", onClick: r, "aria-label": s("card_close") }, "×")), /* @__PURE__ */ e.createElement("dl", null, o("card_value", u.landValue), o("card_squalor", u.squalor), o("card_block", `${u.gx}, ${u.gy}${u.spanX * u.spanY > 1 ? ` (${u.spanX} × ${u.spanY})` : ""}`), o("card_plot", l.index), o("card_storeys", l.storeys), o("card_faces", s(`face_${qt[l.face]}`))), d && /* @__PURE__ */ e.createElement("p", { className: "note" }, s("card_hq", { name: n[d.gang - 1]?.name ?? d.gang })), u.use === 1 && u.name >= 0 && /* @__PURE__ */ e.createElement("p", { className: "note" }, En[u.name]));
}
const Mn = [
  ["p_orders", 5],
  ["p_trams", 6],
  ["p_police", 7],
  ["p_money", 8],
  ["p_rivals", 9],
  ["p_reports", 10],
  ["p_auto", 11]
];
function Ln({ t, gangsOpen: a, onGangs: s }) {
  return /* @__PURE__ */ e.createElement("nav", { className: "journal", "aria-label": "Journal" }, /* @__PURE__ */ e.createElement("button", { className: "live", "aria-pressed": a, onClick: s }, /* @__PURE__ */ e.createElement("span", null, t("p_gangs"))), Mn.map(([r, n]) => /* @__PURE__ */ e.createElement("button", { key: r, disabled: !0, title: t("later_title", { n }) }, /* @__PURE__ */ e.createElement("span", null, t(r)), /* @__PURE__ */ e.createElement("small", null, t("later", { n })))));
}
const Pn = [1, 2, 4, 8, 0];
function An(t, a) {
  const s = Math.min(a, ze - 1), r = Math.floor(s / Pe), n = a >= ze ? Pe : s % Pe, l = 8 + Math.floor(n / 60), u = n % 60;
  return { day: t(`day${r}`), time: `${l}:${String(u).padStart(2, "0")}` };
}
function Bn({ t, clock: a, speed: s, onSpeed: r, onLaunch: n, onFinish: l, paused: u, onPause: d }) {
  if (!a) return null;
  const { day: h, time: w } = An(t, a.minute), o = Math.floor(a.minute * 100 / ze);
  return /* @__PURE__ */ e.createElement("div", { className: "card week-clock", "aria-live": "off" }, /* @__PURE__ */ e.createElement("div", { className: "clock-line" }, /* @__PURE__ */ e.createElement("strong", null, t("clock_line", { w: a.week, day: a.running ? h : t("planning"), time: a.running ? w : "" })), /* @__PURE__ */ e.createElement("small", null, t("walking_now", { n: a.walking.toLocaleString() }))), /* @__PURE__ */ e.createElement(
    "div",
    {
      className: "week-bar",
      role: "progressbar",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": o,
      "aria-label": t("week_bar", { w: a.week, pct: o }),
      title: t("week_bar", { w: a.week, pct: o })
    },
    [0, 1, 2, 3, 4].map((m) => /* @__PURE__ */ e.createElement("i", { key: m })),
    /* @__PURE__ */ e.createElement("b", { style: { width: `${o}%` } })
  ), a.gameOver ? /* @__PURE__ */ e.createElement("p", { className: "note" }, t("game_over")) : /* @__PURE__ */ e.createElement("div", { className: "clock-buttons" }, a.running ? /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("button", { className: "main", "aria-pressed": u, onClick: d }, t("pause")), /* @__PURE__ */ e.createElement("button", { className: "main", onClick: l }, t("finish"))) : /* @__PURE__ */ e.createElement("button", { className: "main", onClick: n }, t("launch")), /* @__PURE__ */ e.createElement("span", { className: "speeds", "aria-label": t("speed") }, Pn.map((m) => /* @__PURE__ */ e.createElement("button", { key: m, "aria-pressed": s === m, onClick: () => r(m) }, m === 0 ? t("speed_max") : `${m}×`)))));
}
const xn = (t) => "★".repeat(Math.floor(t / 2)) + (t % 2 ? "½" : "");
function Rn({ person: t, gangs: a, t: s, onClose: r }) {
  const n = t.gang > 0 ? a[t.gang - 1] : null, l = (d, h) => /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("dt", null, s(d)), /* @__PURE__ */ e.createElement("dd", null, h)), u = t.walking ? s("pc_walking") : t.building >= 0 ? s("pc_inside") : s("pc_standing");
  return /* @__PURE__ */ e.createElement("aside", { className: "card building-card person-card", "aria-live": "polite" }, /* @__PURE__ */ e.createElement("header", null, /* @__PURE__ */ e.createElement("span", { className: "swatch", style: { background: n ? de[n.colour % 4] : "#b9ab8f", borderRadius: "50%" } }), /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("h3", null, t.name), /* @__PURE__ */ e.createElement("div", { className: "sub" }, s(`role_${t.role}`), " · #", t.id)), /* @__PURE__ */ e.createElement("button", { className: "close", onClick: r, "aria-label": s("pc_close") }, "×")), /* @__PURE__ */ e.createElement("dl", null, l("pc_gang", n ? s("g_name", { name: n.name }) : s("pc_none")), l("pc_where", u), n && t.role !== "boss" && l("pc_pay", `$${t.pay}`), n && t.role !== "boss" && l("pc_demand", `$${t.demand}`), n && l("pc_loyalty", `${t.loyalty.toFixed(2)} %`), n && l("pc_attitude", `${t.hostility} / ${t.fear}`)), /* @__PURE__ */ e.createElement("h4", null, s("pc_skills")), /* @__PURE__ */ e.createElement("dl", { className: "skills" }, kt.map((d, h) => /* @__PURE__ */ e.createElement("div", { key: d }, /* @__PURE__ */ e.createElement("dt", null, s(`sk_${d}`)), /* @__PURE__ */ e.createElement("dd", null, xn(t.skills[h]))))));
}
function Nn({ gangs: t, t: a, names: s, onPerson: r, onClose: n }) {
  const l = (d) => d >= 0 ? /* @__PURE__ */ e.createElement("button", { className: "link", key: d, onClick: () => r(d) }, s(d)) : /* @__PURE__ */ e.createElement("span", { key: "none" }, "—"), u = t.findIndex((d) => d.player);
  return /* @__PURE__ */ e.createElement("aside", { className: "drawer gang-panel", "aria-label": a("g_title") }, /* @__PURE__ */ e.createElement("header", null, /* @__PURE__ */ e.createElement("h2", null, a("g_title")), /* @__PURE__ */ e.createElement("button", { className: "close", onClick: n, "aria-label": a("pc_close") }, "×")), t.map((d) => /* @__PURE__ */ e.createElement("section", { key: d.id }, /* @__PURE__ */ e.createElement("h3", null, /* @__PURE__ */ e.createElement("span", { className: "swatch", style: { background: de[d.colour % 4] } }), " ", a("g_name", { name: d.name }), /* @__PURE__ */ e.createElement("small", null, " · ", d.player ? a("g_player") : a("g_rival", { p: d.profile }), d.eliminated ? ` · ${a("g_out")}` : "")), /* @__PURE__ */ e.createElement("dl", null, /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("dt", null, a("g_boss")), /* @__PURE__ */ e.createElement("dd", null, l(d.boss))), /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("dt", null, a("g_lt")), /* @__PURE__ */ e.createElement("dd", null, l(d.lieutenant))), /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("dt", null, a("g_crew")), /* @__PURE__ */ e.createElement("dd", null, d.crew.length ? d.crew.map(l) : "—")), /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("dt", null, a("g_pool")), /* @__PURE__ */ e.createElement("dd", null, d.pool.length ? d.pool.map(l) : "—")), /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("dt", null, a("g_manager")), /* @__PURE__ */ e.createElement("dd", null, l(d.manager))), /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("dt", null, a("g_front")), /* @__PURE__ */ e.createElement("dd", null, ye[d.frontType] ?? "—")), /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("dt", null, a("g_cash")), /* @__PURE__ */ e.createElement("dd", null, "$", d.cash.toLocaleString())), /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("dt", null, a("g_wages")), /* @__PURE__ */ e.createElement("dd", null, "$", d.wages.toLocaleString()))), /* @__PURE__ */ e.createElement("p", { className: "sum" }, a("g_kit", { p: d.pistols, c: d.coupes, cp: d.crewPistols, cc: d.crewCoupes })), /* @__PURE__ */ e.createElement("p", { className: "sum" }, a("g_protects", { n: d.protectedCount })), !d.player && u >= 0 && /* @__PURE__ */ e.createElement("p", { className: "sum" }, a("g_offers", { s: a(`st_${d.offered[u]}`) })))));
}
const U = { small: [36, 28], standard: [40, 32], large: [44, 35] };
function Tn({ lang: t, seed: a, size: s, onStart: r, onCancel: n }) {
  const l = (c, _) => Ge(t, c, _), [u, d] = e.useState(String(a)), [h, w] = e.useState(s), o = /^\d{1,10}$/.test(u.trim()) ? Number(u.trim()) : NaN, m = Number.isInteger(o) && o <= 4294967295;
  return /* @__PURE__ */ e.createElement(
    "div",
    {
      className: "overlay open",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "ng-title",
      onKeyDown: (c) => {
        c.key === "Escape" && n();
      }
    },
    /* @__PURE__ */ e.createElement("form", { className: "box", onSubmit: (c) => {
      c.preventDefault(), m && r(o, h);
    } }, /* @__PURE__ */ e.createElement("h2", { id: "ng-title" }, l("ng_title")), /* @__PURE__ */ e.createElement("label", null, l("ng_seed"), /* @__PURE__ */ e.createElement("input", { autoFocus: !0, inputMode: "numeric", value: u, onChange: (c) => d(c.target.value), "aria-invalid": !m })), !m && /* @__PURE__ */ e.createElement("p", { className: "warn" }, l("seed_bad")), /* @__PURE__ */ e.createElement("fieldset", null, /* @__PURE__ */ e.createElement("legend", null, l("ng_size")), Object.keys(U).map((c) => /* @__PURE__ */ e.createElement("label", { key: c, className: "choice" }, /* @__PURE__ */ e.createElement("input", { type: "radio", name: "size", checked: h === c, onChange: () => w(c) }), l(c), " ", /* @__PURE__ */ e.createElement("small", null, l("size_note", { w: U[c][0], h: U[c][1] }))))), /* @__PURE__ */ e.createElement("div", { className: "row" }, /* @__PURE__ */ e.createElement("button", { type: "button", className: "main", onClick: n }, l("cancel")), /* @__PURE__ */ e.createElement("button", { type: "submit", className: "main", disabled: !m }, l("ng_start"))))
  );
}
const zn = ["alliance", "peace", "ceasefire", "aggression", "war"], Fn = 255;
function Gn(t) {
  return new Int32Array(t.memory.buffer, t.hs_draw_ptr(3), t.hs_draw_len(3)).slice();
}
function Et(t, a) {
  const s = t.hs_get(D.person, a, z.nameLength);
  let r = "";
  for (let n = 1; n <= s; n++) r += String.fromCharCode(t.hs_name_char(a, n));
  return r;
}
function ct(t, a) {
  if (a < 0 || a >= t.hs_count(E.people)) return null;
  const s = (r) => t.hs_get(D.person, a, r);
  return {
    index: a,
    id: s(z.id),
    name: Et(t, a),
    role: Sn[s(z.role)],
    gang: s(z.gang),
    female: s(z.female) === 1,
    skills: kt.map((r, n) => s(z.skill + n)),
    pay: s(z.pay),
    demand: s(z.demand),
    loyalty: s(z.loyalty) / Fn,
    building: s(z.building),
    x: s(z.x) / Q,
    y: s(z.y) / Q,
    walking: s(z.walking) === 1,
    hostility: s(z.hostility),
    fear: s(z.fear),
    opinion: [1, 2, 3, 4].map((r) => s(z.opinion + r))
  };
}
function Re(t) {
  const a = [];
  for (let s = 1; s <= 4; s++) {
    const r = (h) => t.hs_get(D.gang, s, h), n = r(A.office), l = r(A.front), u = [], d = [];
    for (let h = 1; h <= r(A.crewCount); h++) u.push(t.hs_get(D.crew, s, h));
    for (let h = 1; h <= r(A.poolCount); h++) d.push(t.hs_get(D.pool, s, h));
    a.push({
      id: s,
      colour: r(A.colour),
      name: vn[r(A.surname)] ?? "?",
      player: r(A.player) === 1,
      profile: r(A.profile),
      boss: r(A.boss),
      cash: r(A.cash),
      office: n,
      officeLot: n >= 0 ? t.hs_get(D.building, n, Te.lot) : -1,
      front: l,
      frontType: l >= 0 ? t.hs_get(D.building, l, Te.type) : -1,
      manager: r(A.manager),
      lieutenant: r(A.lieutenant),
      crew: u,
      pool: d,
      pistols: r(A.pistols),
      coupes: r(A.coupes),
      crewPistols: r(A.crewPistols),
      crewCoupes: r(A.crewCoupes),
      wages: r(A.wages),
      eliminated: r(A.eliminated) === 1,
      offered: [1, 2, 3, 4].map((h) => zn[r(A.offered + h)] ?? "peace"),
      protectedCount: 0
    });
  }
  return a;
}
function In(t, a, s) {
  for (let r = 0; r < a; r++) {
    const n = t.hs_get(D.premises, r, Dt.protectGang);
    n >= 1 && n <= 4 && s[n - 1].protectedCount++;
  }
}
function Hn(t) {
  return {
    week: t.hs_count(E.week),
    minute: t.hs_count(E.minute),
    running: t.hs_count(E.phase) === 1,
    gameOver: t.hs_count(E.gameOver) === 1,
    walking: t.hs_count(E.walking)
  };
}
function Dn({ city: t, selected: a, onSelect: s, turnSignal: r, visible: n, label: l, people: u, gangColours: d, person: h, onPerson: w, focus: o }) {
  const m = ce(null), c = ce(null);
  return I(() => {
    if (!m.current) return;
    const _ = new cn(m.current);
    c.current = _;
    const g = new ResizeObserver(() => _.update());
    return g.observe(m.current), () => {
      g.disconnect(), _.dispose(), c.current = null;
    };
  }, []), I(() => {
    c.current?.setCity(t);
  }, [t]), I(() => {
    c.current?.select(a);
  }, [a, t]), I(() => {
    r && c.current?.turn();
  }, [r]), I(() => {
    u && c.current?.setPeople(u, d, h);
  }, [u, d, h, t]), I(() => {
    o && c.current?.lookAt(o.x, o.y);
  }, [o]), I(() => {
    n && c.current?.update();
  }, [n]), I(() => {
    const _ = m.current;
    if (!_) return;
    const g = /* @__PURE__ */ new Map();
    let C = 0, P = 0;
    const S = (p) => {
      if (_.setPointerCapture(p.pointerId), g.set(p.pointerId, { x: p.clientX, y: p.clientY }), C = 0, g.size === 2) {
        const [M, F] = [...g.values()];
        P = Math.hypot(M.x - F.x, M.y - F.y);
      }
    }, R = (p) => {
      const M = g.get(p.pointerId);
      if (!(!M || !c.current) && (g.size === 1 && (c.current.drag(p.clientX - M.x, p.clientY - M.y), C += Math.abs(p.clientX - M.x) + Math.abs(p.clientY - M.y)), g.set(p.pointerId, { x: p.clientX, y: p.clientY }), g.size === 2)) {
        const [F, G] = [...g.values()], j = Math.hypot(F.x - G.x, F.y - G.y);
        P > 0 && c.current.zoomBy(j / P), P = j, C = 99;
      }
    }, k = (p) => {
      if (g.size === 1 && C < 4 && c.current) {
        const M = c.current.pick(p.clientX, p.clientY);
        M.person >= 0 ? w(M.person) : s(M.lot);
      }
      g.delete(p.pointerId), g.size < 2 && (P = 0);
    }, f = (p) => {
      p.preventDefault(), c.current?.zoomBy(Math.exp(-p.deltaY * 15e-4));
    };
    return _.addEventListener("pointerdown", S), _.addEventListener("pointermove", R), _.addEventListener("pointerup", k), _.addEventListener("pointercancel", k), _.addEventListener("wheel", f, { passive: !1 }), () => {
      _.removeEventListener("pointerdown", S), _.removeEventListener("pointermove", R), _.removeEventListener("pointerup", k), _.removeEventListener("pointercancel", k), _.removeEventListener("wheel", f);
    };
  }, [s, w]), I(() => {
    const _ = (g) => {
      if (!n || !c.current || g.target instanceof HTMLElement && g.target.closest("input, textarea")) return;
      const C = 60, P = { ArrowLeft: [C, 0], ArrowRight: [-C, 0], ArrowUp: [0, C], ArrowDown: [0, -C] };
      P[g.key] ? (g.preventDefault(), c.current.drag(...P[g.key])) : g.key === "+" || g.key === "=" ? c.current.zoomBy(1.25) : g.key === "-" && c.current.zoomBy(0.8);
    };
    return window.addEventListener("keydown", _), () => window.removeEventListener("keydown", _);
  }, [n]), /* @__PURE__ */ e.createElement("canvas", { className: "street-view", ref: m, "aria-label": l, style: { visibility: n ? "visible" : "hidden" } });
}
function On({ lang: t }) {
  switch (t) {
    case "de":
      return /* @__PURE__ */ e.createElement("svg", { viewBox: "0 0 5 3", "aria-hidden": "true" }, /* @__PURE__ */ e.createElement("path", { fill: "#000", d: "M0 0h5v1H0z" }), /* @__PURE__ */ e.createElement("path", { fill: "#D00", d: "M0 1h5v1H0z" }), /* @__PURE__ */ e.createElement("path", { fill: "#FFCE00", d: "M0 2h5v1H0z" }));
    case "es":
      return /* @__PURE__ */ e.createElement("svg", { viewBox: "0 0 4 3", "aria-hidden": "true" }, /* @__PURE__ */ e.createElement("path", { fill: "#AA151B", d: "M0 0h4v3H0z" }), /* @__PURE__ */ e.createElement("path", { fill: "#F1BF00", d: "M0 .75h4v1.5H0z" }));
    case "fr":
      return /* @__PURE__ */ e.createElement("svg", { viewBox: "0 0 3 2", "aria-hidden": "true" }, /* @__PURE__ */ e.createElement("path", { fill: "#002395", d: "M0 0h1v2H0z" }), /* @__PURE__ */ e.createElement("path", { fill: "#fff", d: "M1 0h1v2H1z" }), /* @__PURE__ */ e.createElement("path", { fill: "#ED2939", d: "M2 0h1v2H2z" }));
    default:
      return /* @__PURE__ */ e.createElement("svg", { viewBox: "0 0 60 30", "aria-hidden": "true" }, /* @__PURE__ */ e.createElement("clipPath", { id: "gb-a" }, /* @__PURE__ */ e.createElement("path", { d: "M0,0v30h60V0z" })), /* @__PURE__ */ e.createElement("clipPath", { id: "gb-b" }, /* @__PURE__ */ e.createElement("path", { d: "M30,15h30v15zv15H0zH0V0zV0h30z" })), /* @__PURE__ */ e.createElement("g", { clipPath: "url(#gb-a)" }, /* @__PURE__ */ e.createElement("path", { d: "M0,0v30h60V0z", fill: "#012169" }), /* @__PURE__ */ e.createElement("path", { d: "M0,0L60,30M60,0L0,30", stroke: "#fff", strokeWidth: "6" }), /* @__PURE__ */ e.createElement("path", { d: "M0,0L60,30M60,0L0,30", clipPath: "url(#gb-b)", stroke: "#C8102E", strokeWidth: "4" }), /* @__PURE__ */ e.createElement("path", { d: "M30,0v30M0,15h60", stroke: "#fff", strokeWidth: "10" }), /* @__PURE__ */ e.createElement("path", { d: "M30,0v30M0,15h60", stroke: "#C8102E", strokeWidth: "6" })));
  }
}
const Ne = window.HS.stamp, fe = matchMedia("(prefers-reduced-motion: reduce)"), Wn = 10 / 3, qn = 12;
function dt(t) {
  return Object.keys(U).find((a) => U[a][0] === t.w && U[a][1] === t.h) ?? "standard";
}
function Vn() {
  const [t, a] = L(() => {
    const i = Ae("ahs.lang", "en-GB");
    return tt.includes(i) ? i : "en-GB";
  }), [s, r] = L(() => Ae("ahs.sound", "on") !== "off"), [n, l] = L(null), [u, d] = L(null), [h, w] = L(null), [o, m] = L(null), [c, _] = L(null), [g, C] = L(null), [P, S] = L(-1), [R, k] = L("street"), [f, p] = L(0), [M, F] = L(!1), [G, j] = L(!1), [yt, te] = L(!1), [Se, Ke] = L(""), [vt, St] = L(null), [V, Ct] = L([]), [ne, Mt] = L(null), [Y, ue] = L(-1), [me, $e] = L(!1), [J, Lt] = L(() => {
    const i = Number(Ae("ahs.speed", "1"));
    return [1, 2, 4, 8, 0].includes(i) ? i : 1;
  }), [ae, Ue] = L(!1), [Pt, At] = L(null), [Bt, xt] = L(0), he = ce(0), y = se((i, v) => Ge(t, i, v), [t]), Z = se((i) => {
    St(Gn(i));
    const v = Re(i);
    In(i, i.hs_count(E.lots) * 2, v), Ct(v), Mt(Hn(i)), xt((N) => N + 1);
  }, []), Ce = se((i, v, N) => {
    const [H, K] = U[N], O = performance.now();
    i.hs_new_game(v, v, H, K);
    const W = Kt(i, v);
    _(W), S(-1), ue(-1), C(i.hs_state_hash()), Z(i), re("new_game", {
      seed: v,
      size: N,
      ms: Math.round(performance.now() - O),
      city_hash: W.cityHash,
      structure_hash: W.structureHash,
      lots: W.counts.lots,
      status: W.status
    });
  }, [Z]);
  I(() => {
    if (!n || !ne?.running || ae) return;
    let i = 0, v = performance.now();
    const N = (H) => {
      let K = 0;
      if (J === 0) {
        const O = H + qn;
        for (; performance.now() < O; ) {
          const W = n.hs_tick(4);
          if (K += W, W < 4) break;
        }
      } else {
        he.current += (H - v) / 1e3 * Wn * J;
        const O = Math.floor(he.current);
        he.current -= O, O > 0 && (K = n.hs_tick(Math.min(O, 60)));
      }
      if (v = H, K > 0 && (Z(n), n.hs_count(E.phase) === 0)) {
        C(n.hs_state_hash()), re("week_settled", {
          week: n.hs_count(E.week) - 1,
          draws: n.hs_count(E.drawsWeek),
          wages: Re(n).map((O) => O.wages),
          state_hash: n.hs_state_hash() >>> 0
        }), $(s, 523.25);
        return;
      }
      i = requestAnimationFrame(N);
    };
    return i = requestAnimationFrame(N), () => cancelAnimationFrame(i);
  }, [n, ne?.running, ae, J, Z, s]);
  const Rt = () => {
    n && (n.hs_launch_week(), he.current = 0, Ue(!1), B("launch_week", n.hs_count(E.week)), Z(n));
  }, Nt = () => {
    if (!n) return;
    const i = performance.now(), v = n.hs_count(E.week);
    n.hs_finish_week();
    const N = Math.round(performance.now() - i);
    Z(n), C(n.hs_state_hash()), B("finish_week", v), re("week_settled", {
      week: v,
      ms: N,
      draws: n.hs_count(E.drawsWeek),
      wages: Re(n).map((H) => H.wages),
      state_hash: n.hs_state_hash() >>> 0
    }), $(s, 523.25);
  }, je = se((i) => {
    ue(i), S(-1), i >= 0 && (B("select_person", i), $(s, 587.33));
  }, [s]), Tt = (i) => {
    if (!n) return;
    je(i);
    const v = ct(n, i);
    v && (k("street"), At({ x: v.x, y: v.y, n: Date.now() }));
  }, zt = Le(() => [0, ...V.map((i) => i.colour)], [V]), Me = Le(
    () => n && Y >= 0 ? ct(n, Y) : null,
    // tickNo: the card follows him as he walks.
    [n, Y, Bt]
  );
  I(() => {
    Ot(window.HS.wasm, (i) => {
      ie("last_chance", Ge("en-GB", `err${i.code}`), { ...i }), w(i);
    }).then((i) => {
      i.hs_new_game(ee.seed, ee.auto, ee.w, ee.h);
      const v = {
        streams: [1, 2, 3].map((N) => Array.from({ length: 20 }, (H, K) => i.hs_rng_value(N, K + 1) >>> 0)),
        checks: Array.from({ length: 9 }, (N, H) => i.hs_check_value(H + 1)),
        gw: i.hs_grid_w(),
        gh: i.hs_grid_h(),
        pattern: Array.from({ length: 225 }, (N, H) => i.hs_cell_kind(H % 15, Math.floor(H / 15))),
        worldHash: i.hs_state_hash()
      };
      m(v), re("core_loaded", { build_id: i.hs_build_id(), ...De(v) }), l(i), Ce(i, 1932, "standard");
    }).catch((i) => {
      i instanceof Fe || (d(String(i)), ie("wasm_load", String(i)));
    });
  }, [Ce]), I(() => {
    document.documentElement.lang = t, document.title = y("title");
  }, [t, y]), I(() => {
    const i = (N) => {
      N.key === "F9" ? (N.preventDefault(), B("report_opened", "f9"), te(!0)) : N.key === "Escape" && (te(!1), j(!1));
    };
    window.addEventListener("keydown", i);
    const v = () => re("reduced_motion", fe.matches);
    return fe.addEventListener?.("change", v), () => {
      window.removeEventListener("keydown", i), fe.removeEventListener?.("change", v);
    };
  }, []);
  const Ye = se((i) => {
    S(i), ue(-1), i >= 0 && (B("select_lot", i), $(s, 659.25));
  }, [s]), Je = Le(() => ({
    stamp: Ne,
    lang: t,
    sound: s,
    reducedMotion: fe.matches,
    seeds: c ? { city: c.seed, auto: c.seed } : null,
    stateHash: g === null ? null : "0x" + (g >>> 0).toString(16).padStart(8, "0"),
    custom: {
      build_id: n?.hs_build_id() ?? null,
      core_load_error: u,
      city: c ? {
        w: c.w,
        h: c.h,
        seed: c.seed,
        city_hash: c.cityHash,
        structure_hash: c.structureHash,
        rng_after_city: c.rngAfter,
        counts: c.counts,
        matches_reference: bt(c) !== null
      } : null,
      selected_lot: P,
      selected_person: Y,
      view: R,
      step2: o ? De(o) : null,
      week: ne,
      speed: J,
      gangs: V.map((i) => ({ id: i.id, name: i.name, cash: i.cash, wages: i.wages, crew: i.crew.length, pool: i.pool.length })),
      people: n ? {
        count: n.hs_count(E.people),
        hashes: [1, 2, 3, 4].map((i) => n.hs_population_hash(i) >>> 0),
        rng_after_setup: (n.hs_count(E.setupLow) | n.hs_count(E.setupHigh) << 16) >>> 0,
        rng_after_minute_1: (n.hs_count(E.m1Low) | n.hs_count(E.m1High) << 16) >>> 0
      } : null
    }
  }), [t, s, c, g, n, u, P, Y, R, o, ne, J, V]), Ft = () => {
    B("crash_test");
    try {
      n?.hs_crash_test(4);
    } catch (i) {
      i instanceof Fe || ie("wasm", String(i));
    }
  }, Gt = c ? y(dt(c)) : "";
  return /* @__PURE__ */ e.createElement("div", { className: "game-shell" }, c && /* @__PURE__ */ e.createElement(
    Dn,
    {
      city: c,
      selected: P,
      onSelect: Ye,
      turnSignal: f,
      visible: R === "street",
      label: y("street"),
      people: vt,
      gangColours: zt,
      person: Y,
      onPerson: je,
      focus: Pt
    }
  ), c && R === "plan" && /* @__PURE__ */ e.createElement(fn, { city: c, selected: P, onSelect: Ye, label: y("plan") }), /* @__PURE__ */ e.createElement("header", { className: "map-buttons" }, /* @__PURE__ */ e.createElement("div", { className: "title" }, /* @__PURE__ */ e.createElement("strong", null, y("title")), /* @__PURE__ */ e.createElement("span", null, y("subtitle"))), /* @__PURE__ */ e.createElement("div", { className: "buttons" }, /* @__PURE__ */ e.createElement("button", { className: "hud-btn", "aria-pressed": R === "plan", onClick: () => {
    const i = R === "plan" ? "street" : "plan";
    k(i), B("view", i);
  } }, y(R === "plan" ? "street" : "plan")), /* @__PURE__ */ e.createElement("button", { className: "hud-btn", disabled: R !== "street", onClick: () => {
    p((i) => i + 1), B("turn_view");
  } }, y("turn_view")), /* @__PURE__ */ e.createElement("button", { className: "hud-btn", disabled: !n, onClick: () => {
    F(!0), B("new_game_opened");
  } }, y("new_game")), /* @__PURE__ */ e.createElement("button", { className: "hud-btn", onClick: () => {
    const i = !s;
    r(i), Be("ahs.sound", i ? "on" : "off"), B("sound", i ? "on" : "off"), $(i);
  } }, y(s ? "sound_on" : "sound_off")), /* @__PURE__ */ e.createElement("button", { className: "hud-btn", "aria-pressed": G, onClick: () => {
    j(!G), B("debug", !G);
  } }, y("debug")), /* @__PURE__ */ e.createElement("button", { className: "hud-btn", onClick: () => {
    te(!0), B("report_opened", "button");
  } }, y("feedback")), /* @__PURE__ */ e.createElement("span", { className: "flags", "aria-label": "Language" }, tt.map((i) => /* @__PURE__ */ e.createElement("button", { key: i, "aria-pressed": i === t, title: i, onClick: () => {
    a(i), Be("ahs.lang", i), B("language", i);
  } }, /* @__PURE__ */ e.createElement(On, { lang: i }))))), c && /* @__PURE__ */ e.createElement("div", { className: "city-line" }, y("city_line", { seed: c.seed, size: Gt, w: c.w, h: c.h, lots: c.counts.lots.toLocaleString(t) }))), /* @__PURE__ */ e.createElement(Ln, { t: y, gangsOpen: me, onGangs: () => {
    $e(!me), B("gangs", !me);
  } }), c && !Me && /* @__PURE__ */ e.createElement(Cn, { city: c, lot: P, t: y, gangs: V, onClose: () => S(-1) }), Me && /* @__PURE__ */ e.createElement(Rn, { person: Me, gangs: V, t: y, onClose: () => ue(-1) }), /* @__PURE__ */ e.createElement(
    Bn,
    {
      t: y,
      clock: ne,
      speed: J,
      paused: ae,
      onSpeed: (i) => {
        Lt(i), Be("ahs.speed", String(i)), B("speed", i);
      },
      onPause: () => {
        Ue(!ae), B("pause", !ae);
      },
      onLaunch: Rt,
      onFinish: Nt
    }
  ), me && n && /* @__PURE__ */ e.createElement(
    Nn,
    {
      gangs: V,
      t: y,
      names: (i) => Et(n, i),
      onPerson: Tt,
      onClose: () => $e(!1)
    }
  ), /* @__PURE__ */ e.createElement("p", { className: "view-help" }, y(R === "plan" ? "plan_key" : "view_help")), !c && /* @__PURE__ */ e.createElement("div", { className: "loading" }, u ? y("core_missing", { error: u }) : y("loading")), G && /* @__PURE__ */ e.createElement(
    kn,
    {
      t: y,
      stamp: Ne,
      buildId: n?.hs_build_id() ?? null,
      stateHash: g,
      step2: o,
      city: c,
      core: n,
      onClose: () => j(!1),
      onSound: () => {
        B("test_sound"), $(s);
      },
      onCrash: Ft
    }
  ), M && n && c && /* @__PURE__ */ e.createElement(
    Tn,
    {
      lang: t,
      seed: c.seed,
      size: dt(c),
      onCancel: () => F(!1),
      onStart: (i, v) => {
        F(!1), B("new_game", { seed: i, size: v }), Ce(n, i, v), $(s, 392);
      }
    }
  ), yt && /* @__PURE__ */ e.createElement("div", { className: "overlay open", role: "dialog", "aria-modal": "true", "aria-labelledby": "fb-title" }, /* @__PURE__ */ e.createElement("div", { className: "box" }, /* @__PURE__ */ e.createElement("h2", { id: "fb-title" }, y("report_title")), /* @__PURE__ */ e.createElement("label", null, y("expected"), /* @__PURE__ */ e.createElement("textarea", { autoFocus: !0, value: Se, onChange: (i) => Ke(i.target.value) })), /* @__PURE__ */ e.createElement("div", { className: "row" }, /* @__PURE__ */ e.createElement("button", { className: "main", onClick: () => {
    B("report_cancelled"), te(!1);
  } }, y("cancel")), /* @__PURE__ */ e.createElement(
    "button",
    {
      className: "main",
      disabled: Se.trim() === "",
      onClick: () => {
        nt("manual", Se.trim(), Je), Ke(""), te(!1);
      }
    },
    y("download")
  )))), h && /* @__PURE__ */ e.createElement("div", { className: "overlay open", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "crash-title" }, /* @__PURE__ */ e.createElement("div", { className: "box" }, /* @__PURE__ */ e.createElement("h2", { id: "crash-title" }, y("crash_title")), /* @__PURE__ */ e.createElement("p", null, y("crash_text", { code: h.code, name: y(`err${h.code}`) })), /* @__PURE__ */ e.createElement("p", { className: "where" }, h.file, ":", h.line), /* @__PURE__ */ e.createElement("div", { className: "row" }, /* @__PURE__ */ e.createElement("button", { className: "main", onClick: () => nt("crash", null, Je) }, y("download")), /* @__PURE__ */ e.createElement("button", { className: "main", onClick: () => location.reload() }, y("reload"))))), /* @__PURE__ */ e.createElement("div", { className: "stamp" }, Ne));
}
Ht(document.getElementById("root")).render(/* @__PURE__ */ e.createElement(Vn, null));
