import * as E from "./vendor/three.module.min.js?v=v0.3.0%20b20261122-2049%20281a437";
const e = window.React, { createElement: Ut, Fragment: $t, useCallback: ie, useEffect: L, useMemo: tt, useReducer: Yt, useRef: ne, useState: C } = e, at = window.ReactDOM, { createRoot: nt } = at, M = {
  blocks: 1,
  merged: 2,
  lots: 3,
  buildings: 4,
  blocksX: 5,
  blocksY: 6,
  hq: 7,
  status: 8,
  retries: 9,
  classBase: 10,
  districtBase: 20,
  useBase: 30,
  typesUsed: 40,
  rngLow: 42,
  rngHigh: 43
}, F = { block: 1, hq: 4 }, xe = { name: 12, plan: 19 }, $ = { block: 0, frontAs: 2, fx: 3, fy: 4 }, Ae = 12, Ne = 10;
class pe extends Error {
}
async function rt(t, r) {
  let a = null;
  const o = () => {
    if (!a) return "";
    let m = "";
    const h = a.hs_error_file_length();
    for (let _ = 1; _ <= h; _++) m += String.fromCharCode(a.hs_error_file_char(_));
    return m;
  }, n = Uint8Array.from(atob(t), (m) => m.charCodeAt(0)), { instance: l } = await WebAssembly.instantiate(n, {
    env: {
      hs_host_error(m, h) {
        const _ = { code: m, file: o(), line: h };
        throw r(_), new pe(`Ada core stopped: ${_.file}:${h}`);
      }
    }
  });
  return a = l.exports, a;
}
const N = (t) => t >>> 0, Te = (t) => "0x" + N(t).toString(16).padStart(8, "0"), x = 54, Y = 14, Z = 3, j = 256, qe = ["downtown", "commercial", "industrial", "residential", "civic"], st = ["urban", "park", "civic", "plaza", "avenue", "water"], Oe = ["empty", "residential", "tenement", "commercial", "industrial", "municipal", "charity", "illegal"], lt = ["north", "east", "south", "west"], ot = 192;
function ct(t, r) {
  const a = (s) => new Int32Array(t.memory.buffer, t.hs_draw_ptr(s), t.hs_draw_len(s)), o = a(1), n = a(2), l = [];
  for (let s = 0; s * Ae < o.length; s++) {
    const d = s * Ae;
    l.push({
      id: s,
      gx: o[d],
      gy: o[d + 1],
      district: o[d + 2],
      use: o[d + 3],
      spanX: o[d + 4],
      spanY: o[d + 5],
      merged: o[d + 6],
      landValue: o[d + 7],
      squalor: o[d + 8],
      content: o[d + 9],
      rail: o[d + 10] === 1,
      landmark: o[d + 11],
      name: t.hs_get(F.block, s, xe.name),
      plan: t.hs_get(F.block, s, xe.plan)
    });
  }
  const m = [];
  for (let s = 0; s * Ne < n.length; s++) {
    const d = s * Ne;
    m.push({
      id: s,
      block: n[d],
      index: n[d + 1],
      x: n[d + 2] / j,
      y: n[d + 3] / j,
      w: n[d + 4] / j,
      h: n[d + 5] / j,
      face: n[d + 6],
      type: n[d + 7],
      cls: n[d + 8],
      storeys: n[d + 9]
    });
  }
  const h = [];
  for (let s = 1; s <= t.hs_count(M.hq); s++)
    h.push({
      gang: s,
      block: t.hs_get(F.hq, s, $.block),
      fx: t.hs_get(F.hq, s, $.fx),
      fy: t.hs_get(F.hq, s, $.fy),
      frontAs: t.hs_get(F.hq, s, $.frontAs)
    });
  const _ = t.hs_count(M.blocksX), c = t.hs_count(M.blocksY);
  return {
    seed: r,
    w: _,
    h: c,
    standard: _ === 40 && c === 32,
    blocks: l,
    lots: m,
    hq: h,
    cityHash: N(t.hs_city_hash()),
    structureHash: N(t.hs_structure_hash()),
    rngAfter: N(t.hs_count(M.rngLow) | t.hs_count(M.rngHigh) << 16),
    retries: t.hs_count(M.retries),
    status: t.hs_count(M.status),
    counts: {
      blocks: t.hs_count(M.blocks),
      merged: t.hs_count(M.merged),
      lots: t.hs_count(M.lots),
      buildings: t.hs_count(M.buildings),
      typesUsed: t.hs_count(M.typesUsed),
      classes: Oe.map((s, d) => t.hs_count(M.classBase + d)),
      districts: qe.map((s, d) => t.hs_count(M.districtBase + d)),
      uses: st.map((s, d) => t.hs_count(M.useBase + d))
    }
  };
}
function We(t) {
  return {
    x: t.gx * x + Y / 2 + Z,
    y: t.gy * x + Y / 2 + Z,
    w: t.spanX * x - Y - 2 * Z,
    h: t.spanY * x - Y - 2 * Z
  };
}
function it(t, r, a) {
  const o = Math.floor(r / x), n = Math.floor(a / x);
  if (o < 0 || n < 0 || o >= t.w || n >= t.h) return -1;
  let l = t.blocks[n * t.w + o];
  l.merged >= 0 && (l = t.blocks[l.merged]);
  for (const m of t.lots)
    if (m.block === l.id && r >= m.x && r <= m.x + m.w && a >= m.y && a <= m.y + m.h) return m.id;
  return -1;
}
const Re = ["en-GB", "de", "es", "fr"], dt = {
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
  card_hq: "Headquarters site of gang {g} (front and office: step 4)",
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
  plan_key: "Blocks by district; lots by class; gang flags mark the headquarters sites.",
  view_help: "Drag to move · wheel or pinch to zoom · click a building",
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
  face_west: "west"
}, ut = {
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
  card_hq: "Hauptquartier-Standort von Bande {g} (Tarnfirma und Büro: Schritt 4)",
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
  plan_key: "Blöcke nach Viertel, Grundstücke nach Art; Fahnen markieren die Hauptquartier-Standorte.",
  view_help: "Ziehen zum Verschieben · Mausrad oder zwei Finger zum Zoomen · Gebäude anklicken",
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
  face_west: "Westen"
}, mt = {
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
  card_hq: "Sitio del cuartel de la banda {g} (tapadera y oficina: paso 4)",
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
  plan_key: "Manzanas por distrito; solares por clase; las banderas marcan los sitios de los cuarteles.",
  view_help: "Arrastra para mover · rueda o dos dedos para acercar · haz clic en un edificio",
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
  face_west: "oeste"
}, ht = {
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
  card_hq: "Site du quartier général du gang {g} (façade et bureau : étape 4)",
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
  plan_key: "Pâtés par quartier ; parcelles par catégorie ; les drapeaux marquent les sites des quartiers généraux.",
  view_help: "Glisser pour déplacer · molette ou deux doigts pour zoomer · cliquer sur un bâtiment",
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
  face_west: "ouest"
}, _t = { "en-GB": dt, de: ut, es: mt, fr: ht };
function ge(t, r, a = {}) {
  return _t[t][r].replace(/\{(\w+)\}/g, (o, n) => String(a[n] ?? ""));
}
const pt = performance.now(), Ee = 500, ve = () => Math.round(performance.now() - pt), J = [], ee = [], te = [];
let Ve = 0, Ue = 0;
function A(t, r) {
  J.length >= Ee && (J.shift(), Ve++), J.push({ t_ms: ve(), action: t, ...r === void 0 ? {} : { detail: r } });
}
function de(t, r) {
  ee.length >= Ee && (ee.shift(), Ue++), ee.push({ t_ms: ve(), event: t, ...r === void 0 ? {} : { detail: r } });
}
function U(t, r, a = {}) {
  te.length >= Ee && te.shift(), te.push({ t_ms: ve(), kind: t, message: r, ...a });
}
window.addEventListener("error", (t) => U("javascript", String(t.message), { file: t.filename, line: t.lineno }));
window.addEventListener("unhandledrejection", (t) => U("javascript", String(t.reason)));
function Le(t, r, a) {
  const o = {
    schema: "poncelet-report",
    schema_version: 1,
    kind: t,
    stamp: a.stamp,
    created: (/* @__PURE__ */ new Date()).toISOString(),
    seeds: a.seeds,
    test_key: null,
    expected: r,
    state_hash: a.stateHash,
    action_log: J,
    actions_dropped: Ve,
    events: ee,
    events_dropped: Ue,
    errors: te,
    environment: {
      user_agent: navigator.userAgent,
      browser_language: navigator.language,
      page_language: a.lang,
      viewport: [innerWidth, innerHeight],
      device_pixel_ratio: devicePixelRatio,
      reduced_motion: a.reducedMotion,
      sound: a.sound ? "on" : "off",
      url: location.href
    },
    custom: a.custom
  }, n = document.createElement("a");
  n.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 2)], { type: "application/json" })), n.download = `hood-report-${a.stamp.split(" ")[1] ?? "dev"}-${Date.now()}.json`, document.body.appendChild(n), n.click(), n.remove(), setTimeout(() => URL.revokeObjectURL(n.href), 1e3), A("report_downloaded", t);
}
let W = null;
function K(t, r = 523.25) {
  if (!t) return;
  W ??= new AudioContext();
  const a = W.createOscillator(), o = W.createGain(), n = W.currentTime;
  a.type = "sine", a.frequency.value = r, o.gain.setValueAtTime(0, n), o.gain.linearRampToValueAtTime(0.05, n + 0.02), o.gain.exponentialRampToValueAtTime(1e-4, n + 0.3), a.connect(o).connect(W.destination), a.start(n), a.stop(n + 0.35);
}
function ze(t, r) {
  try {
    return localStorage.getItem(t) ?? r;
  } catch {
    return r;
  }
}
function Pe(t, r) {
  try {
    localStorage.setItem(t, r);
  } catch {
  }
}
const gt = 0.55, ft = 11, Be = 1.5, V = 900, bt = 240, Se = Math.SQRT2 * Math.tan(Math.PI / 6), ae = Math.hypot(1, Se, 1), $e = Se / ae;
function ye(t) {
  return bt / t;
}
function wt(t) {
  const r = t ? -1 : 1;
  return [r / ae, Se / ae, r / ae];
}
function Et(t) {
  return Math.min(ft, Math.max(gt, t));
}
function vt(t, r, a, o) {
  const n = ye(t.zoom), l = n * r, m = n * Math.SQRT1_2 / (2 * $e) + l * Math.SQRT1_2 / 2, h = (_, c) => c - m < m ? c / 2 : Math.min(c - m, Math.max(m, _));
  return { ...t, x: h(t.x, a), z: h(t.z, o) };
}
function St(t, r, a, o) {
  const n = ye(t.zoom) / o, l = t.turned ? -1 : 1, m = -r * n, h = a * n / $e;
  return {
    ...t,
    x: t.x + (m * l - h * l) * Math.SQRT1_2,
    z: t.z + (-m * l - h * l) * Math.SQRT1_2
  };
}
const re = ["#5d5240", "#c49a6c", "#9b5a48", "#5f8fa8", "#7c7a74", "#e0d9c6", "#a08cc0", "#7a3b3b"], He = ["#8a8478", "#4f6e3a", "#9b9688", "#a99f8a", "#47474a", "#2e4f66"], Ye = ["#c0392b", "#2e8b57", "#2f5fb3", "#d9822b"], yt = "#3a3937", Ie = 2830392, Ge = 4.2, ue = 0.3, Fe = 0.8, X = x / 5;
class kt {
  renderer;
  scene = new E.Scene();
  camera = new E.OrthographicCamera(-1, 1, 1, -1, 1, 4e3);
  city = null;
  group = new E.Group();
  buildings = null;
  lotOfInstance = [];
  outline;
  raycaster = new E.Raycaster();
  view = { x: 0, z: 0, zoom: Be, turned: !1 };
  frame = 0;
  constructor(r) {
    this.renderer = new E.WebGLRenderer({ canvas: r, antialias: !0 }), this.renderer.setPixelRatio(Math.min(2, devicePixelRatio)), this.scene.background = new E.Color(Ie), this.scene.fog = new E.Fog(Ie, V + 300, V + 2600), this.scene.add(new E.HemisphereLight(15262420, 3814184, 1.6));
    const a = new E.DirectionalLight(16773852, 1.8);
    a.position.set(-300, 600, -150), this.scene.add(a), this.scene.add(this.group), this.outline = new E.LineSegments(
      new E.EdgesGeometry(new E.BoxGeometry(1, 1, 1)),
      new E.LineBasicMaterial({ color: 16769674 })
    ), this.outline.visible = !1, this.scene.add(this.outline);
  }
  setCity(r) {
    this.city = r;
    for (const s of [...this.group.children])
      this.group.remove(s), s instanceof E.Mesh && (s.geometry.dispose(), s.material.dispose());
    const a = r.w * x, o = r.h * x, n = new E.Mesh(
      new E.PlaneGeometry(a + 400, o + 400),
      new E.MeshLambertMaterial({ color: yt })
    );
    n.rotation.x = -Math.PI / 2, n.position.set(a / 2, 0, o / 2), this.group.add(n);
    const l = r.blocks.filter((s) => s.merged < 0), m = new E.InstancedMesh(new E.BoxGeometry(1, 1, 1), new E.MeshLambertMaterial(), l.length), h = new E.Matrix4(), _ = new E.Color();
    l.forEach((s, d) => {
      const i = We(s), b = s.use === 4 || s.use === 5 ? 0.05 : ue;
      h.makeScale(i.w, b, i.h).setPosition(i.x + i.w / 2, b / 2, i.y + i.h / 2), m.setMatrixAt(d, h), m.setColorAt(d, _.set(He[s.use] ?? He[0]));
    }), this.group.add(m), this.lotOfInstance = r.lots.map((s) => s.id);
    const c = new E.InstancedMesh(new E.BoxGeometry(1, 1, 1), new E.MeshLambertMaterial(), r.lots.length);
    r.lots.forEach((s, d) => {
      const g = s.cls === 0 ? 0.25 : Math.max(1, s.storeys) * Ge, b = Math.max(0.5, s.w - 2 * Fe), f = Math.max(0.5, s.h - 2 * Fe);
      h.makeScale(b, g, f).setPosition(s.x + s.w / 2, ue + g / 2, s.y + s.h / 2), c.setMatrixAt(d, h), c.setColorAt(d, _.set(re[s.cls] ?? re[0]));
    }), this.buildings = c, this.group.add(c);
    for (const s of r.hq) {
      const d = new E.Mesh(
        new E.CylinderGeometry(0.6, 0.6, 40, 8),
        new E.MeshLambertMaterial({ color: Ye[(s.gang - 1) % 4] })
      );
      d.position.set(s.fx * X + X / 2, 20, s.fy * X + X / 2), this.group.add(d);
    }
    this.outline.visible = !1, this.view = { x: a / 2, z: o / 2, zoom: Be, turned: !1 }, this.update();
  }
  select(r) {
    const a = this.city?.lots[r];
    if (!a) {
      this.outline.visible = !1, this.render();
      return;
    }
    const o = a.cls === 0 ? 0.6 : Math.max(1, a.storeys) * Ge + 0.4;
    this.outline.scale.set(a.w, o, a.h), this.outline.position.set(a.x + a.w / 2, ue + o / 2, a.y + a.h / 2), this.outline.visible = !0, this.render();
  }
  size() {
    const r = this.renderer.domElement;
    return { w: r.clientWidth || 1, h: r.clientHeight || 1 };
  }
  /** Applies the view: clamps it, places the camera, renders. */
  update() {
    if (!this.city) return;
    const { w: r, h: a } = this.size();
    this.renderer.setSize(r, a, !1), this.view = vt({ ...this.view, zoom: Et(this.view.zoom) }, r / a, this.city.w * x, this.city.h * x);
    const o = ye(this.view.zoom), n = o * (r / a);
    Object.assign(this.camera, { left: -n / 2, right: n / 2, top: o / 2, bottom: -o / 2 }), this.camera.updateProjectionMatrix();
    const [l, m, h] = wt(this.view.turned);
    this.camera.position.set(this.view.x + l * V, m * V, this.view.z + h * V), this.camera.lookAt(this.view.x, 0, this.view.z), this.render();
  }
  render() {
    cancelAnimationFrame(this.frame), this.frame = requestAnimationFrame(() => this.renderer.render(this.scene, this.camera));
  }
  drag(r, a) {
    this.view = St(this.view, r, a, this.size().h), this.update();
  }
  zoomBy(r) {
    this.view = { ...this.view, zoom: this.view.zoom * r }, this.update();
  }
  turn() {
    this.view = { ...this.view, turned: !this.view.turned }, this.update();
  }
  lookAt(r, a) {
    this.view = { ...this.view, x: r, z: a }, this.update();
  }
  /** The lot under a canvas point, or -1. */
  pick(r, a) {
    if (!this.buildings) return -1;
    const o = this.renderer.domElement.getBoundingClientRect(), n = new E.Vector2((r - o.left) / o.width * 2 - 1, -((a - o.top) / o.height) * 2 + 1);
    this.raycaster.setFromCamera(n, this.camera);
    const l = this.raycaster.intersectObject(this.buildings, !1)[0];
    return l?.instanceId != null ? this.lotOfInstance[l.instanceId] : -1;
  }
  dispose() {
    cancelAnimationFrame(this.frame), this.renderer.dispose();
  }
}
const Ct = ["#d8c59a", "#cdbf9f", "#a9a49a", "#c8b9a0", "#bfc3c7"], Mt = "#7d9a5d", xt = "#5f86a3", At = "#8f8a80", Nt = "#d6ccb4", Tt = "#e9dfc6", Rt = "#b9ad93";
function Lt({ city: t, selected: r, onSelect: a, label: o }) {
  const n = ne(null), l = ne({ scale: 1, ox: 0, oy: 0 });
  L(() => {
    const h = n.current;
    if (!h) return;
    const _ = () => {
      const s = Math.min(2, devicePixelRatio), d = h.clientWidth, i = h.clientHeight;
      h.width = Math.round(d * s), h.height = Math.round(i * s);
      const g = h.getContext("2d");
      if (!g) return;
      const b = t.w * x, f = t.h * x, p = 24, v = Math.min((d - 2 * p) / b, (i - 2 * p) / f), y = (d - b * v) / 2, H = (i - f * v) / 2;
      l.current = { scale: v, ox: y, oy: H }, g.setTransform(s * v, 0, 0, s * v, s * y, s * H), g.fillStyle = Tt, g.fillRect(-p / v, -p / v, b + 2 * p / v, f + 2 * p / v), g.fillStyle = Rt, g.fillRect(0, 0, b, f);
      for (const S of t.blocks) {
        if (S.merged >= 0) continue;
        const T = We(S);
        g.fillStyle = S.use === 1 ? Mt : S.use === 5 ? xt : S.use === 4 ? At : S.use === 3 ? Nt : Ct[S.district], g.fillRect(T.x - 2, T.y - 2, T.w + 4, T.h + 4);
      }
      for (const S of t.lots)
        g.fillStyle = re[S.cls] ?? re[0], g.globalAlpha = S.cls === 0 ? 0.35 : 0.9, g.fillRect(S.x + 0.6, S.y + 0.6, Math.max(0.5, S.w - 1.2), Math.max(0.5, S.h - 1.2));
      g.globalAlpha = 1;
      const z = t.lots[r];
      z && (g.strokeStyle = "#1b1208", g.lineWidth = 2.5 / v, g.strokeRect(z.x - 1, z.y - 1, z.w + 2, z.h + 2));
      for (const S of t.hq) {
        const T = (S.fx + 0.5) * (x / 5), B = (S.fy + 0.5) * (x / 5), R = 9 / v;
        g.fillStyle = "#1b1208", g.fillRect(T - 0.6 / v, B - 2.2 * R, 1.2 / v, 2.2 * R), g.fillStyle = Ye[(S.gang - 1) % 4], g.beginPath(), g.moveTo(T, B - 2.2 * R), g.lineTo(T + 1.6 * R, B - 1.7 * R), g.lineTo(T, B - 1.2 * R), g.fill();
      }
    };
    _();
    const c = new ResizeObserver(_);
    return c.observe(h), () => c.disconnect();
  }, [t, r]);
  const m = (h) => {
    const _ = h.currentTarget.getBoundingClientRect(), c = l.current;
    a(it(t, (h.clientX - _.left - c.ox) / c.scale, (h.clientY - _.top - c.oy) / c.scale));
  };
  return /* @__PURE__ */ e.createElement("canvas", { className: "city-plan", ref: n, onClick: m, "aria-label": o });
}
const fe = [
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
], Ze = [48, 31, 59, 54, 80, 33, 22, 63, 76, 45, 72, 89, 91, 73, 21, 13, 95, 51, 49, 97], je = [
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
], be = [13824, 2764, 1280, 362, 46341, 65536, 128, 5, 38500], zt = [
  { w: 36, h: 28, seed: 1932, rng: 787968811, city: 130389902, structure: 2172434479, blocks: 1008, merged: 140, lots: 8769, buildings: 8769, types: 164, hq: [] },
  { w: 40, h: 32, seed: 1932, rng: 1183664769, city: 162525796, structure: 3010893233, blocks: 1280, merged: 22, lots: 4580, buildings: 4580, types: 170, hq: [[13, 10], [31, 4], [7, 20], [36, 25]] },
  { w: 44, h: 35, seed: 1932, rng: 214220379, city: 1231309806, structure: 2436981367, blocks: 1540, merged: 209, lots: 13488, buildings: 13488, types: 166, hq: [] },
  { w: 40, h: 32, seed: 187, rng: 1183663024, city: 2335500783, structure: 2753879728, blocks: 1280, merged: 20, lots: 4733, buildings: 4733, types: 170, hq: [[11, 9], [29, 4], [9, 17], [25, 23]] }
], D = { seed: 1932, auto: 1932, w: 44, h: 35 };
function we(t) {
  const r = [fe, Ze, je];
  return {
    random: t.streams.reduce((a, o, n) => a + o.filter((l, m) => l === r[n][m]).length, 0),
    checks: t.checks.filter((a, o) => a === be[o]).length
  };
}
function Ke(t) {
  return zt.find((r) => r.w === t.w && r.h === t.h && r.seed === t.seed) ?? null;
}
const me = ({ v: t, expect: r }) => /* @__PURE__ */ e.createElement("td", { className: t === r ? "ok" : "bad" }, t);
function Pt({ t, stamp: r, buildId: a, stateHash: o, step2: n, city: l, onClose: m, onSound: h, onCrash: _ }) {
  const c = l ? Ke(l) : null, s = l ? [
    [t("d_rng"), l.rngAfter, c?.rng ?? null],
    [t("d_city"), l.cityHash, c?.city ?? null],
    [t("d_structure"), l.structureHash, c?.structure ?? null],
    ["blocks", l.counts.blocks, c?.blocks ?? null],
    ["merged", l.counts.merged, c?.merged ?? null],
    ["lots", l.counts.lots, c?.lots ?? null],
    ["buildings", l.counts.buildings, c?.buildings ?? null],
    ["types", l.counts.typesUsed, c?.types ?? null],
    ...c?.hq.length ? c.hq.map((b, f) => {
      const p = l.hq[f] ? l.blocks[l.hq[f].block] : null;
      return [`HQ ${f + 1} (gx·100 + gy)`, p ? p.gx * 100 + p.gy : -1, b[0] * 100 + b[1]];
    }) : []
  ] : [], d = s.filter(([, b, f]) => f !== null && N(b) === N(f)).length, i = n ? we(n) : null, g = [fe, Ze, je];
  return /* @__PURE__ */ e.createElement("aside", { className: "drawer", "aria-label": t("d_title") }, /* @__PURE__ */ e.createElement("header", null, /* @__PURE__ */ e.createElement("h2", null, t("d_title")), /* @__PURE__ */ e.createElement("button", { className: "close", onClick: m, "aria-label": t("d_close") }, "×")), /* @__PURE__ */ e.createElement("section", null, /* @__PURE__ */ e.createElement("h3", null, t("d_step3")), l && /* @__PURE__ */ e.createElement("p", { className: "sum" }, t("d_counts", {
    b: l.counts.blocks,
    m: l.counts.merged,
    l: l.counts.lots,
    n: l.counts.buildings,
    t: l.counts.typesUsed,
    r: l.retries
  })), /* @__PURE__ */ e.createElement("p", { className: "sum" }, c ? t("d_match", { n: d, m: s.length }) : t("d_no_ref")), /* @__PURE__ */ e.createElement("table", null, /* @__PURE__ */ e.createElement("tbody", null, s.map(([b, f, p]) => /* @__PURE__ */ e.createElement("tr", { key: b }, /* @__PURE__ */ e.createElement("th", null, b), p === null ? /* @__PURE__ */ e.createElement("td", null, N(f)) : /* @__PURE__ */ e.createElement(me, { v: N(f), expect: N(p) }), /* @__PURE__ */ e.createElement("td", null, p === null ? "" : N(p))))))), /* @__PURE__ */ e.createElement("section", null, /* @__PURE__ */ e.createElement("h3", null, t("d_step1")), /* @__PURE__ */ e.createElement("table", null, /* @__PURE__ */ e.createElement("tbody", null, /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("th", null, t("d_stamp")), /* @__PURE__ */ e.createElement("td", null, r)), /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("th", null, t("d_build_id")), /* @__PURE__ */ e.createElement("td", null, a ?? "…")), /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("th", null, t("d_state")), /* @__PURE__ */ e.createElement("td", null, o === null ? "…" : `${Te(o)} (${N(o)})`)))), /* @__PURE__ */ e.createElement("div", { className: "row" }, /* @__PURE__ */ e.createElement("button", { className: "main", onClick: h }, t("test_sound")), /* @__PURE__ */ e.createElement("button", { className: "main danger", onClick: _ }, t("crash_test")))), n && i && /* @__PURE__ */ e.createElement("section", null, /* @__PURE__ */ e.createElement("h3", null, t("d_step2")), /* @__PURE__ */ e.createElement("p", { className: "sum" }, t("random_sum", { n: i.random, m: 60 })), /* @__PURE__ */ e.createElement("div", { className: "scroll" }, /* @__PURE__ */ e.createElement("table", null, /* @__PURE__ */ e.createElement("thead", null, /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("th", null, t("col_i")), /* @__PURE__ */ e.createElement("th", null, t("col_main")), /* @__PURE__ */ e.createElement("th", null, t("col_ref")), /* @__PURE__ */ e.createElement("th", null, t("col_int")), /* @__PURE__ */ e.createElement("th", null, t("col_ref")), /* @__PURE__ */ e.createElement("th", null, t("col_plan")), /* @__PURE__ */ e.createElement("th", null, t("col_ref")))), /* @__PURE__ */ e.createElement("tbody", null, fe.map((b, f) => /* @__PURE__ */ e.createElement("tr", { key: f }, /* @__PURE__ */ e.createElement("td", null, f + 1), [0, 1, 2].map((p) => /* @__PURE__ */ e.createElement(e.Fragment, { key: p }, /* @__PURE__ */ e.createElement(me, { v: n.streams[p][f], expect: g[p][f] }), /* @__PURE__ */ e.createElement("td", null, g[p][f])))))))), /* @__PURE__ */ e.createElement("p", { className: "sum" }, t("numbers_sum", { n: i.checks, m: n.checks.length })), /* @__PURE__ */ e.createElement("table", null, /* @__PURE__ */ e.createElement("thead", null, /* @__PURE__ */ e.createElement("tr", null, /* @__PURE__ */ e.createElement("th", null, t("col_check")), /* @__PURE__ */ e.createElement("th", null, t("col_ada")), /* @__PURE__ */ e.createElement("th", null, t("col_exp")))), /* @__PURE__ */ e.createElement("tbody", null, n.checks.map((b, f) => /* @__PURE__ */ e.createElement("tr", { key: f }, /* @__PURE__ */ e.createElement("th", null, t(`c${f + 1}`)), /* @__PURE__ */ e.createElement(me, { v: b, expect: be[f] }), /* @__PURE__ */ e.createElement("td", null, be[f]))))), /* @__PURE__ */ e.createElement("p", { className: "sum" }, t("grid_sum", { w: n.gw, h: n.gh, n: n.gw * n.gh })), /* @__PURE__ */ e.createElement("div", { className: "grid-sample", "aria-hidden": "true" }, n.pattern.map((b, f) => /* @__PURE__ */ e.createElement("i", { key: f, className: b === 1 ? "b" : b === 0 ? "s" : "x" }))), /* @__PURE__ */ e.createElement("p", { className: "sum" }, t("grid_legend")), /* @__PURE__ */ e.createElement("p", { className: "sum" }, t("world_sum", {
    seed: D.seed,
    auto: D.auto,
    w: n.gw,
    h: n.gh,
    hash: `${Te(n.worldHash)} (${N(n.worldHash)})`
  }))));
}
const he = ["Bakers", "Butchers", "Grocers", "Convenience Store", "Shoe Store", "Tailors", "Book Store", "Printers", "Pawnbrokers", "Jewellers", "Furrier", "Drug Store", "Plumbers", "Cafe", "Milk Bar", "Breakfast Bar", "Restaurant", "Pool Hall", "Gymnasium", "Health Center", "Massage Parlor", "Dance Studio", "Barbers", "Laundry", "Hardware Store", "Auto Shop", "Finance Company", "Accountancy Firm", "Law Offices", "Hotel", "Hotel (Large)", "Department Store", "Bank", "Main Bank", "Newspaper Offices", "Radio Station", "Warehouse", "Foundry", "Mill", "Cannery", "Garage Depot", "Trade Union", "Docks", "Railroad Terminal", "Tenement Block", "Apartment Block", "Residences", "City Hall", "Courthouse", "Police Headquarters", "Hospital", "School", "Library", "Labour Exchange", "Fire House", "F.B.I. Headquarters", "Museum", "Public Baths", "US Post", "Power Plant", "Water Plant", "Residences", "Church", "Orphanage", "Soup Kitchen", "Clothing Bank", "Office", "Speakeasy", "Moonshine Still", "Casino", "Card Games", "Dice Game", "Gambling Den", "Prizefight Ring", "Grifters", "Insider Trading", "Loan Shark", "Counterfeit Press", "Numbers Racket", "Rented Rooms", "Teamsters", "Acupuncture Clinic", "Antiques Dealer", "Art Gallery", "Auction Rooms", "Auto Dealers", "Bailiffs", "Beauty Parlor", "Blacksmiths", "Bridal Parlor", "Cab Company", "Cake Store", "Candy Store", "Carpet Store", "Catering Suppliers", "Cheese Store", "China Store", "Chiropodists", "Clothiers", "Coffin Makers", "Cosmetics Store", "Delicatessen", "Orthodontists", "Detective Agency", "Diamond Merchant", "Doctors", "Dressmakers", "Electrical Suppliers", "Electricians", "Costume Store", "Fishmongers", "Florists", "Fortune Tellers", "French Polishers", "Fruit and Veg. Store", "Funeral Directors", "Furniture Store", "Gardening Suppliers", "Gas Station/Mechanic", "Gift Store", "Gold Merchants", "Golf Store", "Gramophone Store", "Glassware", "Haberdashery", "Hair Salon", "Wig Makers", "Ice Store", "Ice Cream Parlor", "Ladieswear", "Lingerie Store", "Local Store", "Locksmiths", "Lumber Merchant", "Milliners", "Movie Theater", "Music Store", "News Agency", "Nursery Store", "Optometrist", "Perfume Store", "Pest Controllers", "Pet Store", "Photographers", "Piano Store", "Real Estate", "Record Store", "Removals Company", "Saddlers", "Shoe Repairs", "Sign Writers", "Soda Fountain", "Sports Equipment", "Stamp and Coin Dealers", "Stationers", "Tattoo Parlor", "Telegraph Office", "Theater", "Tobacconists", "Toy Store", "Upholsterers", "Watchmakers", "Window Cleaners", "Abattoir", "Builders", "Cement Factory", "Ceramics", "Chandler", "Leather Curers", "Engineers", "Excavators", "Fabricators", "Factory", "Food Processors", "Freight Forwarding", "Furriers", "Glaziers", "Ice House", "Ironmongers", "Joiners", "Junk Yard", "Lumber Yard", "Milk Yard", "Packaging Plant", "Paper Mill", "Sheet Workers", "Steel Mill", "Stone Masons", "Tanners", "Textiles", "Weavers", "Wheelwrights", "Empty land"], Bt = ["Volstead Green", "Hinge Oak", "Lantern Park", "Cinder Gardens"], Ht = ["St. Michael’s", "St. Mary’s", "St. Joseph’s", "St. Patrick’s"];
function It({ city: t, lot: r, t: a, onClose: o }) {
  const n = t.lots[r];
  if (!n) return /* @__PURE__ */ e.createElement("aside", { className: "card building-card idle" }, /* @__PURE__ */ e.createElement("p", null, a("card_none")));
  const l = t.blocks[n.block], m = t.hq.find((s) => s.block === l.id), _ = (n.type === he.indexOf("Church") && l.name >= 0 ? Ht[l.name] : null) ?? he[n.type] ?? he[ot], c = (s, d) => /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("dt", null, a(s)), /* @__PURE__ */ e.createElement("dd", null, d));
  return /* @__PURE__ */ e.createElement("aside", { className: "card building-card", "aria-live": "polite" }, /* @__PURE__ */ e.createElement("header", null, /* @__PURE__ */ e.createElement("span", { className: "swatch", "data-cls": n.cls }), /* @__PURE__ */ e.createElement("div", null, /* @__PURE__ */ e.createElement("h3", null, _), /* @__PURE__ */ e.createElement("div", { className: "sub" }, a(`cls_${Oe[n.cls]}`), " · ", a(`dist_${qe[l.district]}`))), /* @__PURE__ */ e.createElement("button", { className: "close", onClick: o, "aria-label": a("card_close") }, "×")), /* @__PURE__ */ e.createElement("dl", null, c("card_value", l.landValue), c("card_squalor", l.squalor), c("card_block", `${l.gx}, ${l.gy}${l.spanX * l.spanY > 1 ? ` (${l.spanX} × ${l.spanY})` : ""}`), c("card_plot", n.index), c("card_storeys", n.storeys), c("card_faces", a(`face_${lt[n.face]}`))), m && /* @__PURE__ */ e.createElement("p", { className: "note" }, a("card_hq", { g: m.gang })), l.use === 1 && l.name >= 0 && /* @__PURE__ */ e.createElement("p", { className: "note" }, Bt[l.name]));
}
const Gt = [
  ["p_people", 4],
  ["p_orders", 5],
  ["p_trams", 6],
  ["p_police", 7],
  ["p_money", 8],
  ["p_rivals", 9],
  ["p_reports", 10],
  ["p_auto", 11]
];
function Ft({ t }) {
  return /* @__PURE__ */ e.createElement("nav", { className: "journal", "aria-label": "Journal" }, Gt.map(([r, a]) => /* @__PURE__ */ e.createElement("button", { key: r, disabled: !0, title: t("later_title", { n: a }) }, /* @__PURE__ */ e.createElement("span", null, t(r)), /* @__PURE__ */ e.createElement("small", null, t("later", { n: a })))));
}
function Dt({ t }) {
  return /* @__PURE__ */ e.createElement("div", { className: "card week-clock disabled", title: t("later_title", { n: 4 }) }, /* @__PURE__ */ e.createElement("span", null, t("p_clock")), /* @__PURE__ */ e.createElement("small", null, t("later", { n: 4 })));
}
const G = { small: [36, 28], standard: [40, 32], large: [44, 35] };
function qt({ lang: t, seed: r, size: a, onStart: o, onCancel: n }) {
  const l = (i, g) => ge(t, i, g), [m, h] = e.useState(String(r)), [_, c] = e.useState(a), s = /^\d{1,10}$/.test(m.trim()) ? Number(m.trim()) : NaN, d = Number.isInteger(s) && s <= 4294967295;
  return /* @__PURE__ */ e.createElement(
    "div",
    {
      className: "overlay open",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "ng-title",
      onKeyDown: (i) => {
        i.key === "Escape" && n();
      }
    },
    /* @__PURE__ */ e.createElement("form", { className: "box", onSubmit: (i) => {
      i.preventDefault(), d && o(s, _);
    } }, /* @__PURE__ */ e.createElement("h2", { id: "ng-title" }, l("ng_title")), /* @__PURE__ */ e.createElement("label", null, l("ng_seed"), /* @__PURE__ */ e.createElement("input", { autoFocus: !0, inputMode: "numeric", value: m, onChange: (i) => h(i.target.value), "aria-invalid": !d })), !d && /* @__PURE__ */ e.createElement("p", { className: "warn" }, l("seed_bad")), /* @__PURE__ */ e.createElement("fieldset", null, /* @__PURE__ */ e.createElement("legend", null, l("ng_size")), Object.keys(G).map((i) => /* @__PURE__ */ e.createElement("label", { key: i, className: "choice" }, /* @__PURE__ */ e.createElement("input", { type: "radio", name: "size", checked: _ === i, onChange: () => c(i) }), l(i), " ", /* @__PURE__ */ e.createElement("small", null, l("size_note", { w: G[i][0], h: G[i][1] }))))), /* @__PURE__ */ e.createElement("div", { className: "row" }, /* @__PURE__ */ e.createElement("button", { type: "button", className: "main", onClick: n }, l("cancel")), /* @__PURE__ */ e.createElement("button", { type: "submit", className: "main", disabled: !d }, l("ng_start"))))
  );
}
function Ot({ city: t, selected: r, onSelect: a, turnSignal: o, visible: n, label: l }) {
  const m = ne(null), h = ne(null);
  return L(() => {
    if (!m.current) return;
    const _ = new kt(m.current);
    h.current = _;
    const c = new ResizeObserver(() => _.update());
    return c.observe(m.current), () => {
      c.disconnect(), _.dispose(), h.current = null;
    };
  }, []), L(() => {
    h.current?.setCity(t);
  }, [t]), L(() => {
    h.current?.select(r);
  }, [r, t]), L(() => {
    o && h.current?.turn();
  }, [o]), L(() => {
    n && h.current?.update();
  }, [n]), L(() => {
    const _ = m.current;
    if (!_) return;
    const c = /* @__PURE__ */ new Map();
    let s = 0, d = 0;
    const i = (p) => {
      if (_.setPointerCapture(p.pointerId), c.set(p.pointerId, { x: p.clientX, y: p.clientY }), s = 0, c.size === 2) {
        const [v, y] = [...c.values()];
        d = Math.hypot(v.x - y.x, v.y - y.y);
      }
    }, g = (p) => {
      const v = c.get(p.pointerId);
      if (!(!v || !h.current) && (c.size === 1 && (h.current.drag(p.clientX - v.x, p.clientY - v.y), s += Math.abs(p.clientX - v.x) + Math.abs(p.clientY - v.y)), c.set(p.pointerId, { x: p.clientX, y: p.clientY }), c.size === 2)) {
        const [y, H] = [...c.values()], z = Math.hypot(y.x - H.x, y.y - H.y);
        d > 0 && h.current.zoomBy(z / d), d = z, s = 99;
      }
    }, b = (p) => {
      c.size === 1 && s < 4 && h.current && a(h.current.pick(p.clientX, p.clientY)), c.delete(p.pointerId), c.size < 2 && (d = 0);
    }, f = (p) => {
      p.preventDefault(), h.current?.zoomBy(Math.exp(-p.deltaY * 15e-4));
    };
    return _.addEventListener("pointerdown", i), _.addEventListener("pointermove", g), _.addEventListener("pointerup", b), _.addEventListener("pointercancel", b), _.addEventListener("wheel", f, { passive: !1 }), () => {
      _.removeEventListener("pointerdown", i), _.removeEventListener("pointermove", g), _.removeEventListener("pointerup", b), _.removeEventListener("pointercancel", b), _.removeEventListener("wheel", f);
    };
  }, [a]), L(() => {
    const _ = (c) => {
      if (!n || !h.current || c.target instanceof HTMLElement && c.target.closest("input, textarea")) return;
      const s = 60, d = { ArrowLeft: [s, 0], ArrowRight: [-s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] };
      d[c.key] ? (c.preventDefault(), h.current.drag(...d[c.key])) : c.key === "+" || c.key === "=" ? h.current.zoomBy(1.25) : c.key === "-" && h.current.zoomBy(0.8);
    };
    return window.addEventListener("keydown", _), () => window.removeEventListener("keydown", _);
  }, [n]), /* @__PURE__ */ e.createElement("canvas", { className: "street-view", ref: m, "aria-label": l, style: { visibility: n ? "visible" : "hidden" } });
}
function Wt({ lang: t }) {
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
const _e = window.HS.stamp, Q = matchMedia("(prefers-reduced-motion: reduce)");
function De(t) {
  return Object.keys(G).find((r) => G[r][0] === t.w && G[r][1] === t.h) ?? "standard";
}
function Vt() {
  const [t, r] = C(() => {
    const u = ze("ahs.lang", "en-GB");
    return Re.includes(u) ? u : "en-GB";
  }), [a, o] = C(() => ze("ahs.sound", "on") !== "off"), [n, l] = C(null), [m, h] = C(null), [_, c] = C(null), [s, d] = C(null), [i, g] = C(null), [b, f] = C(null), [p, v] = C(-1), [y, H] = C("street"), [z, S] = C(0), [T, B] = C(!1), [R, se] = C(!1), [Xe, q] = C(!1), [le, ke] = C(""), w = ie((u, k) => ge(t, u, k), [t]), oe = ie((u, k, P) => {
    const [I, ce] = G[P], et = performance.now();
    u.hs_new_game(k, k, I, ce);
    const O = ct(u, k);
    g(O), v(-1), f(u.hs_state_hash()), de("new_game", {
      seed: k,
      size: P,
      ms: Math.round(performance.now() - et),
      city_hash: O.cityHash,
      structure_hash: O.structureHash,
      lots: O.counts.lots,
      status: O.status
    });
  }, []);
  L(() => {
    rt(window.HS.wasm, (u) => {
      U("last_chance", ge("en-GB", `err${u.code}`), { ...u }), c(u);
    }).then((u) => {
      u.hs_new_game(D.seed, D.auto, D.w, D.h);
      const k = {
        streams: [1, 2, 3].map((P) => Array.from({ length: 20 }, (I, ce) => u.hs_rng_value(P, ce + 1) >>> 0)),
        checks: Array.from({ length: 9 }, (P, I) => u.hs_check_value(I + 1)),
        gw: u.hs_grid_w(),
        gh: u.hs_grid_h(),
        pattern: Array.from({ length: 225 }, (P, I) => u.hs_cell_kind(I % 15, Math.floor(I / 15))),
        worldHash: u.hs_state_hash()
      };
      d(k), de("core_loaded", { build_id: u.hs_build_id(), ...we(k) }), l(u), oe(u, 1932, "standard");
    }).catch((u) => {
      u instanceof pe || (h(String(u)), U("wasm_load", String(u)));
    });
  }, [oe]), L(() => {
    document.documentElement.lang = t, document.title = w("title");
  }, [t, w]), L(() => {
    const u = (P) => {
      P.key === "F9" ? (P.preventDefault(), A("report_opened", "f9"), q(!0)) : P.key === "Escape" && (q(!1), se(!1));
    };
    window.addEventListener("keydown", u);
    const k = () => de("reduced_motion", Q.matches);
    return Q.addEventListener?.("change", k), () => {
      window.removeEventListener("keydown", u), Q.removeEventListener?.("change", k);
    };
  }, []);
  const Ce = ie((u) => {
    v(u), u >= 0 && (A("select_lot", u), K(a, 659.25));
  }, [a]), Me = tt(() => ({
    stamp: _e,
    lang: t,
    sound: a,
    reducedMotion: Q.matches,
    seeds: i ? { city: i.seed, auto: i.seed } : null,
    stateHash: b === null ? null : "0x" + (b >>> 0).toString(16).padStart(8, "0"),
    custom: {
      build_id: n?.hs_build_id() ?? null,
      core_load_error: m,
      city: i ? {
        w: i.w,
        h: i.h,
        seed: i.seed,
        city_hash: i.cityHash,
        structure_hash: i.structureHash,
        rng_after_city: i.rngAfter,
        counts: i.counts,
        matches_reference: Ke(i) !== null
      } : null,
      selected_lot: p,
      view: y,
      step2: s ? we(s) : null
    }
  }), [t, a, i, b, n, m, p, y, s]), Qe = () => {
    A("crash_test");
    try {
      n?.hs_crash_test(4);
    } catch (u) {
      u instanceof pe || U("wasm", String(u));
    }
  }, Je = i ? w(De(i)) : "";
  return /* @__PURE__ */ e.createElement("div", { className: "game-shell" }, i && /* @__PURE__ */ e.createElement(Ot, { city: i, selected: p, onSelect: Ce, turnSignal: z, visible: y === "street", label: w("street") }), i && y === "plan" && /* @__PURE__ */ e.createElement(Lt, { city: i, selected: p, onSelect: Ce, label: w("plan") }), /* @__PURE__ */ e.createElement("header", { className: "map-buttons" }, /* @__PURE__ */ e.createElement("div", { className: "title" }, /* @__PURE__ */ e.createElement("strong", null, w("title")), /* @__PURE__ */ e.createElement("span", null, w("subtitle"))), /* @__PURE__ */ e.createElement("div", { className: "buttons" }, /* @__PURE__ */ e.createElement("button", { className: "hud-btn", "aria-pressed": y === "plan", onClick: () => {
    const u = y === "plan" ? "street" : "plan";
    H(u), A("view", u);
  } }, w(y === "plan" ? "street" : "plan")), /* @__PURE__ */ e.createElement("button", { className: "hud-btn", disabled: y !== "street", onClick: () => {
    S((u) => u + 1), A("turn_view");
  } }, w("turn_view")), /* @__PURE__ */ e.createElement("button", { className: "hud-btn", disabled: !n, onClick: () => {
    B(!0), A("new_game_opened");
  } }, w("new_game")), /* @__PURE__ */ e.createElement("button", { className: "hud-btn", onClick: () => {
    const u = !a;
    o(u), Pe("ahs.sound", u ? "on" : "off"), A("sound", u ? "on" : "off"), K(u);
  } }, w(a ? "sound_on" : "sound_off")), /* @__PURE__ */ e.createElement("button", { className: "hud-btn", "aria-pressed": R, onClick: () => {
    se(!R), A("debug", !R);
  } }, w("debug")), /* @__PURE__ */ e.createElement("button", { className: "hud-btn", onClick: () => {
    q(!0), A("report_opened", "button");
  } }, w("feedback")), /* @__PURE__ */ e.createElement("span", { className: "flags", "aria-label": "Language" }, Re.map((u) => /* @__PURE__ */ e.createElement("button", { key: u, "aria-pressed": u === t, title: u, onClick: () => {
    r(u), Pe("ahs.lang", u), A("language", u);
  } }, /* @__PURE__ */ e.createElement(Wt, { lang: u }))))), i && /* @__PURE__ */ e.createElement("div", { className: "city-line" }, w("city_line", { seed: i.seed, size: Je, w: i.w, h: i.h, lots: i.counts.lots.toLocaleString(t) }))), /* @__PURE__ */ e.createElement(Ft, { t: w }), i && /* @__PURE__ */ e.createElement(It, { city: i, lot: p, t: w, onClose: () => v(-1) }), /* @__PURE__ */ e.createElement(Dt, { t: w }), /* @__PURE__ */ e.createElement("p", { className: "view-help" }, w(y === "plan" ? "plan_key" : "view_help")), !i && /* @__PURE__ */ e.createElement("div", { className: "loading" }, m ? w("core_missing", { error: m }) : w("loading")), R && /* @__PURE__ */ e.createElement(
    Pt,
    {
      t: w,
      stamp: _e,
      buildId: n?.hs_build_id() ?? null,
      stateHash: b,
      step2: s,
      city: i,
      onClose: () => se(!1),
      onSound: () => {
        A("test_sound"), K(a);
      },
      onCrash: Qe
    }
  ), T && n && i && /* @__PURE__ */ e.createElement(
    qt,
    {
      lang: t,
      seed: i.seed,
      size: De(i),
      onCancel: () => B(!1),
      onStart: (u, k) => {
        B(!1), A("new_game", { seed: u, size: k }), oe(n, u, k), K(a, 392);
      }
    }
  ), Xe && /* @__PURE__ */ e.createElement("div", { className: "overlay open", role: "dialog", "aria-modal": "true", "aria-labelledby": "fb-title" }, /* @__PURE__ */ e.createElement("div", { className: "box" }, /* @__PURE__ */ e.createElement("h2", { id: "fb-title" }, w("report_title")), /* @__PURE__ */ e.createElement("label", null, w("expected"), /* @__PURE__ */ e.createElement("textarea", { autoFocus: !0, value: le, onChange: (u) => ke(u.target.value) })), /* @__PURE__ */ e.createElement("div", { className: "row" }, /* @__PURE__ */ e.createElement("button", { className: "main", onClick: () => {
    A("report_cancelled"), q(!1);
  } }, w("cancel")), /* @__PURE__ */ e.createElement(
    "button",
    {
      className: "main",
      disabled: le.trim() === "",
      onClick: () => {
        Le("manual", le.trim(), Me), ke(""), q(!1);
      }
    },
    w("download")
  )))), _ && /* @__PURE__ */ e.createElement("div", { className: "overlay open", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "crash-title" }, /* @__PURE__ */ e.createElement("div", { className: "box" }, /* @__PURE__ */ e.createElement("h2", { id: "crash-title" }, w("crash_title")), /* @__PURE__ */ e.createElement("p", null, w("crash_text", { code: _.code, name: w(`err${_.code}`) })), /* @__PURE__ */ e.createElement("p", { className: "where" }, _.file, ":", _.line), /* @__PURE__ */ e.createElement("div", { className: "row" }, /* @__PURE__ */ e.createElement("button", { className: "main", onClick: () => Le("crash", null, Me) }, w("download")), /* @__PURE__ */ e.createElement("button", { className: "main", onClick: () => location.reload() }, w("reload"))))), /* @__PURE__ */ e.createElement("div", { className: "stamp" }, _e));
}
nt(document.getElementById("root")).render(/* @__PURE__ */ e.createElement(Vt, null));
