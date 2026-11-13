/**
 * Rival men spotted on the street: the original's only tip line, "I've just
 * seen %s moving round here!" (built by 0x481000 with the man's exact position
 * and the street corner). Two sources, both for the player's gang only (the
 * original posts to every gang's box, 0x481C20 shows the human's):
 *  - 0x6F66E0: one of the gang's men sees a rival gang's boss, lieutenant or
 *    hood, who is noticed when his Stealth (byte +0xB0, 0..63) is below
 *    `rand % 63` plus the spotter's Intelligence (byte +0x80, 0..255);
 *  - 0x5A3C90: a business the gang protects sees one walk into the cell at
 *    its door (event 9), noticed when `rand & 255` beats his Stealth.
 * Either way he becomes known to the gang (0x4386E0) and can be named in orders.
 *
 * Where and when a man looks (traced 28 October 2026,
 * docs/audit/2026-10-28/sightings/review.md):
 *  - The look (0x6F6E20) scans whole map cells: standing, or in a car, the
 *    square rings round his own cell out to 9 cells (0x6F6B10); walking, a
 *    block of cells ahead in his heading (0x6F6BE0). Only open cells are
 *    scanned (0x6F69A0), men in cars included.
 *  - Each man seen must be in view (0x609200): a line drawn in eighths of a
 *    cell from the spotter to him crosses no building cell.
 *  - A man looks once every 32 of his own ticks (0x6F22D0: counter & 31 when
 *    standing, (counter + 16) & 31 when walking). The original runs 24,000
 *    ticks a week (30 ms each), ten to our minute.
 * Cells are converted as elsewhere: five to a block (`ORIGINAL_CELL_METRES`).
 *
 * The original city only (traced 29 October 2026, same review):
 *  - A man standing on a chase (step 6: Kill, Assault, Kidnap, Tail, Recruit
 *    aimed at a person) looks every 12 ticks, `counter % 12` (0x4C3DD0 case 6,
 *    0x6F22D0 case 5). Step 7 (32 / speed) is never created: its only maker,
 *    0x565D40, has no caller.
 *  - A man riding in a car (step 10) does not look: its case in 0x6F22D0 calls
 *    no scan for a step 10. Men in cars are still seen.
 *  - 0x480700 is not a car branch: a look that falls on a man of another gang
 *    (not the police) who is fighting (his step 3 has an opponent) sends
 *    "There's a fight going on!" to the spotter's gang (Combat messages).
 *  - A protected business (0x5A3C90, vt+0x60 of 0x77EA04) hears event 9 from
 *    every rival boss, lieutenant or hood who walks into a cell beside it
 *    (0x5DD630: the 3 × 3 cells round his new cell, each building cell
 *    calling its keeper). Each call rolls `rand & 255 > Stealth`; won, he is
 *    reported (its recent-list check, vt+0x40 = 0x5A3C10, reads a gang bit
 *    with a pointer and is always 0). Known or not.
 *  - The message boxes (0x481E20) drop a tip at the same street corner within
 *    1,000 sub-cell units (96 to a cell) of one still listed, and replace one
 *    further off; one fight message at a time, on the same distance rule. Tips
 *    go to the Hoods and the Law box (type 7), fights to Combat (type 2).
 */
import { BUILDING_BY_ID } from '../data/buildings';
import { blockRect, cityBlockAt, lotRect, streetLocation } from '../cityLayout';
import { CELL, MINUTES_PER_WEEK } from '../constants';
import { addMessage } from '../events';
import { peopleList, buildingList } from '../entityLists';
import { ORIGINAL_CELL_METRES } from '../fireRoll';
import { buildingDoor, dist } from '../world';
import { absoluteMinute, UNDER_FIRE_MINUTES } from './combat';
import type { Rng } from '../rng';
import type { Building, Gang, ID, MessageCategory, Person, Vec2, WorldState } from '../types';
import { registerProbe } from '../memProbe';

/** The original's ticks to one of our minutes: 24,000 a week over our 2,400 minutes. */
export const ORIGINAL_TICKS_PER_MINUTE = 24_000 / MINUTES_PER_WEEK;
/** A man looks round once every 32 of his ticks (0x6F22D0). */
export const LOOK_PERIOD_TICKS = 32;
/** How far the standing look reaches, in rings of cells round his own (0x6F6B10). */
export const SIGHT_CELLS = 9;
/** A man standing on a chase (step 6) looks when his tick counter is a multiple of 12 (0x4C3DD0 case 6). */
export const CHASE_LOOK_TICKS = 12;
/** 0x481E20: a tip or fight message nearer than 1,000 sub-cell units (96 to a cell) to a listed one is dropped. */
export const MESSAGE_NEAR_METRES = 1000 / 96 * ORIGINAL_CELL_METRES;
export const TIP_TEXT = 'moving round here!"';
export const FIGHT_TEXT = 'There\'s a fight going on!';

/** The original's byte scales: skills 0..63, Intelligence 0..255, from 0.5..5 stars. */
const skillByte = (stars: number) => Math.round(stars / 5 * 63);
const intelligenceByte = (stars: number) => Math.round(stars / 5 * 255);

const counts = (p: Person) => p.role === 'boss' || p.role === 'lieutenant' || p.role === 'hood';
const outdoors = (p: Person) => p.status === 'active' && p.buildingId == null;
const walking = (p: Person) => !p.inVehicle && !p.halted && (p.path.length > 0 || p.dest != null);

const cellOf = (v: number) => Math.floor(v / ORIGINAL_CELL_METRES);
const cellKey = (pos: Vec2) => `${cellOf(pos.x)},${cellOf(pos.y)}`;

/** 0x6F6B10: his own cell, then square rings of radius 1..9. */
const RING: ReadonlySet<string> = (() => {
  const s = new Set<string>();
  for (let i = -SIGHT_CELLS; i <= SIGHT_CELLS; i++) for (let j = -SIGHT_CELLS; j <= SIGHT_CELLS; j++) s.add(`${i},${j}`);
  return s;
})();

/** 0x6F6BE0(dx, dy), walked as the original walks it: the cells scanned ahead of a man heading (dx, dy). */
export function lookAheadCells(dx: number, dy: number): Set<string> {
  const s = new Set<string>();
  const line = (x: number, y: number, n: number) => { for (let i = 0; i < n; i++) s.add(`${x + i * dx},${y + i * dy}`); };
  if (dx !== 0 && dy !== 0) {
    line(0, 0, 4);
    let ax = 0, ay = 0, bx = 0, by = 0;            // local_c/local_8 and local_14/local_10
    for (let k = 1; k < 7; k++) {
      if (k & 1) { ay += dy; bx += dx; } else { ax -= dx; by -= dy; }
      line(ax, ay, 4); line(bx, by, 4);
    }
  } else {
    line(0, 0, 5);
    for (let k = 1; k <= 4; k++) { line(dy * k, dx * k, 4); line(-dy * k, -dx * k, 4); }
  }
  return s;
}
const AHEAD = new Map<string, Set<string>>();
registerProbe('sightingLookAhead', () => AHEAD.size); // 1.2.28
const ahead = (dx: number, dy: number) => {
  const key = `${dx},${dy}`;
  let s = AHEAD.get(key);
  if (!s) AHEAD.set(key, s = lookAheadCells(dx, dy));
  return s;
};

/** A walking man's heading as one of the eight cell steps, from where he is going next. */
function heading(p: Person): { dx: number; dy: number } | null {
  const to = p.path[0] ?? p.dest;
  if (!to) return null;
  const ux = to.x - p.pos.x, uy = to.y - p.pos.y;
  if (!ux && !uy) return null;
  const oct = ((Math.round(Math.atan2(uy, ux) / (Math.PI / 4)) % 8) + 8) % 8;
  return [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 },
    { dx: -1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }][oct];
}

/**
 * A cell that stops the eye (the cell's vt+0x20 above 0): one whose middle
 * falls on a block's buildings. Streets, parks, plazas, avenues and water are
 * open; a cell off the map is no cell, and blocks the view as in 0x6092D0.
 */
export function cellBlocksView(w: WorldState, cx: number, cy: number): boolean {
  const x = (cx + 0.5) * ORIGINAL_CELL_METRES, y = (cy + 0.5) * ORIGINAL_CELL_METRES;
  const block = cityBlockAt(w, Math.floor(x / CELL), Math.floor(y / CELL));
  if (!block) return true;
  const use = block.layout?.use ?? 'urban';
  if (use !== 'urban' && use !== 'civic') return false;
  const r = blockRect(block);
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * 0x609200: the view from one man to another. Both points in eighths of a cell
 * (the original's `cell * 8 + sub / 12`); a Bresenham line from the one
 * further up the map, along its major axis, checking his own cell and every
 * cell it enters (0x6092D0 x-major, 0x609410 y-major). Same cell: in view.
 */
export function inView(w: WorldState, from: Vec2, to: Vec2): boolean {
  if (cellOf(from.x) === cellOf(to.x) && cellOf(from.y) === cellOf(to.y)) return true;
  const eighth = ORIGINAL_CELL_METRES / 8;
  let x0 = Math.floor(from.x / eighth), y0 = Math.floor(from.y / eighth);
  let x1 = Math.floor(to.x / eighth), y1 = Math.floor(to.y / eighth);
  if (y1 < y0) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }
  const dy = y1 - y0, s = x1 - x0 > 0 ? 1 : -1, dx = Math.abs(x1 - x0);
  const open = (x: number, y: number) => !cellBlocksView(w, Math.floor(x / 8), Math.floor(y / 8));
  const c0x = Math.floor(x0 / 8), c0y = Math.floor(y0 / 8);
  const stillHome = (x: number, y: number) => Math.floor(x / 8) === c0x && Math.floor(y / 8) === c0y;
  let x = x0, y = y0;
  if (!open(x, y)) return false;
  if (dy < dx) {
    const up = 2 * dy, back = -2 * dx;
    let n = dx, e = 2 * dy - dx;
    for (;;) {
      do {
        if (n === 0) return true;
        n--;
        let inc = up;
        if (e >= 0) { y++; inc = up + back; }
        e += inc; x += s;
      } while (stillHome(x, y));
      if (!open(x, y)) return false;
    }
  }
  const across = 2 * dx, back = -2 * dy;
  let m = dy, e = 2 * dx - dy;
  for (;;) {
    do {
      if (m === 0) return true;
      m--;
      let inc = across;
      if (e >= 0) { x += s; inc = across + back; }
      e += inc; y++;
    } while (stillHome(x, y));
    if (!open(x, y)) return false;
  }
}

/** Whether a man looks round in the coming minute: one of its ten ticks lands on
 * his 32-tick beat. His tick counter's phase is the remake's, from his id. */
export function looksThisMinute(w: WorldState, p: Person): boolean {
  const phase = ((p.id * 11) & 31) + (walking(p) ? 16 : 0);
  const t0 = ((w.week - 1) * MINUTES_PER_WEEK + w.minute) * ORIGINAL_TICKS_PER_MINUTE + phase;
  return Math.floor((t0 + ORIGINAL_TICKS_PER_MINUTE - 1) / LOOK_PERIOD_TICKS) > Math.floor((t0 - 1) / LOOK_PERIOD_TICKS);
}

const CHASES: ReadonlySet<string> = new Set(['kill', 'assault', 'kidnap', 'recruit']);
const OPEN_ORDER: ReadonlySet<string> = new Set(['travelling', 'waiting', 'executing']);

/** On a chase (the original's step 6, pushed by 0x565B00 for orders 0x0F, 0x14, 0x18,
 * 0x1A and 0x1D): an order or street order aimed at a person. */
export function chasing(w: WorldState, p: Person): boolean {
  const order = p.orderId == null ? undefined : w.orders[p.orderId];
  if (order && CHASES.has(order.type) && order.targetPersonId != null && OPEN_ORDER.has(order.state)) return true;
  return p.streetOrder != null && p.streetOrder.type !== 'goTo' && p.streetOrder.targetPersonId != null;
}

/**
 * Whether one of the player's men looks round in the coming minute. In the
 * original city: never while riding in a car (step 10 has no scan in 0x6F22D0);
 * standing on a chase, when his byte tick counter passes a multiple of 12
 * (step 6, 0x4C3DD0 case 6); otherwise his 32-tick beat (`looksThisMinute`).
 */
export function spotterLooksThisMinute(w: WorldState, p: Person): boolean {
  if (!w.cityLayout?.original) return looksThisMinute(w, p);
  if (p.inVehicle) return false;
  if (walking(p) || !chasing(w, p)) return looksThisMinute(w, p);
  const t0 = ((w.week - 1) * MINUTES_PER_WEEK + w.minute) * ORIGINAL_TICKS_PER_MINUTE + ((p.id * 11) & 31);
  for (let k = 0; k < ORIGINAL_TICKS_PER_MINUTE; k++) if (((t0 + k) & 255) % CHASE_LOOK_TICKS === 0) return true;
  return false;
}

/**
 * In a fight now (the original's step 3 with an opponent at +8): struck in
 * close combat or shot at within the last minute. The remake keeps no fight
 * step; these are the marks a fight leaves on the man.
 */
export function fighting(w: WorldState, p: Person): boolean {
  const blow = p.closeCombat?.lastBlow;
  if (blow && blow.week === w.week && blow.minute >= w.minute - 1) return true;
  return p.underFireUntil != null && p.underFireUntil - UNDER_FIRE_MINUTES >= absoluteMinute(w) - 1;
}

/** Whether `man` is in the cells `spotter` scans, in an open cell and in view. */
export function spotterSees(w: WorldState, spotter: Person, man: Person): boolean {
  const ox = cellOf(man.pos.x) - cellOf(spotter.pos.x), oy = cellOf(man.pos.y) - cellOf(spotter.pos.y);
  const dir = walking(spotter) ? heading(spotter) : null;
  const cells = dir ? ahead(dir.dx, dir.dy) : RING;
  if (!cells.has(`${ox},${oy}`)) return false;
  if (cellBlocksView(w, cellOf(man.pos.x), cellOf(man.pos.y))) return false;
  return inView(w, spotter.pos, man.pos);
}

/** Where every rival gang man about the streets stands, by cell, before the minute's movement. */
export function sightingCells(w: WorldState, from?: ReadonlyMap<Person, Vec2>): Map<ID, string> {
  const cells = new Map<ID, string>();
  for (const p of peopleList(w)) if (p.gangId != null && counts(p) && outdoors(p)) cells.set(p.id, cellKey(from?.get(p) ?? p.pos));
  return cells;
}

/**
 * One minute of sightings for the player's gang. `before` is where each man
 * stood before the minute's movement (`sightingCells`): a business sees only
 * a man who has just walked into its door's cell (in the original city, into
 * a cell beside it). Without it, a man found in that cell counts as just
 * arrived.
 */
export function tickSightings(w: WorldState, rng: Rng, before?: ReadonlyMap<ID, string>): void {
  const player = Object.values(w.gangs).find(g => g.isPlayer && !g.eliminated);
  if (!player) return;
  const original = !!w.cityLayout?.original;
  const known = new Set(player.knownPeople);
  const spotters: Person[] = [], strangers: Person[] = [], passers: Person[] = [], fighters: Person[] = [];
  for (const p of peopleList(w)) {
    if (p.gangId == null || !outdoors(p)) continue;
    if (p.gangId === player.id) { if (counts(p) && spotterLooksThisMinute(w, p)) spotters.push(p); continue; }
    if (w.gangs[p.gangId]?.eliminated) continue;
    if (original && fighting(w, p)) fighters.push(p);
    if (!counts(p)) continue;
    if (!known.has(p.id)) strangers.push(p);
    if (original && !p.inVehicle) passers.push(p);
  }
  // 0x6F66E0 → 0x480700: a look that falls on a rival in a fight.
  for (const f of fighters) {
    const seenBy = spotters.find(s => spotterSees(w, s, f));
    if (seenBy) postOriginal(w, 'combat', FIGHT_TEXT, null,
      `${seenBy.name}: "${FIGHT_TEXT}" ${streetLocation(w, f.pos)}.`, f.pos, f.id);
  }
  let doors: Map<string, Building> | null = null;
  for (const man of strangers) {
    const stealth = skillByte(man.skills.stealth);
    const seenBy = spotters.find(s => spotterSees(w, s, man)
      && stealth < rng.int(0, 62) + intelligenceByte(s.skills.intelligence));
    if (seenBy) { spotted(w, player, man, `${seenBy.name}`); continue; }
    if (original || man.inVehicle) continue;
    const cell = cellKey(man.pos);
    if (before?.get(man.id) === cell) continue;
    if (!doors) {
      doors = new Map();
      for (const b of buildingList(w)) if (b.protection?.gangId === player.id && b.state !== 'destroyed') {
        const key = cellKey(buildingDoor(w, b));
        if (!doors.has(key)) doors.set(key, b);
      }
    }
    const shop = doors.get(cell);
    if (shop && rng.int(0, 255) > stealth) spotted(w, player, man, `The ${BUILDING_BY_ID[shop.typeId]?.name ?? 'shopkeeper'}`);
  }
  if (passers.length) passingBy(w, rng, player, passers, before);
}

/** The cells a business's keeper answers for: those whose middle lies on its (front's) lot. */
export function businessCells(w: WorldState, b: Building): string[] {
  const entrance = b.frontId != null ? w.buildings[b.frontId] ?? b : b;
  const lot = w.lots[entrance.lotId];
  if (!lot) return [];
  const r = lotRect(lot), out: string[] = [];
  for (let cx = cellOf(r.x); cx <= cellOf(r.x + r.w); cx++) for (let cy = cellOf(r.y); cy <= cellOf(r.y + r.h); cy++) {
    const mx = (cx + 0.5) * ORIGINAL_CELL_METRES, my = (cy + 0.5) * ORIGINAL_CELL_METRES;
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) out.push(`${cx},${cy}`);
  }
  return out;
}

/** The cells a man walking from cell `from` to `to` steps into, in order (a line of cells; not `from` itself). */
export function cellsEntered(from: string | undefined, to: string): string[] {
  const [tx, ty] = to.split(',').map(Number);
  const [fx, fy] = (from ?? '').split(',').map(Number);
  if (from === undefined || !Number.isFinite(fx) || !Number.isFinite(fy)) return [to];
  const n = Math.max(Math.abs(tx - fx), Math.abs(ty - fy));
  const out: string[] = [];
  for (let i = 1; i <= n; i++) out.push(`${fx + Math.round((tx - fx) * i / n)},${fy + Math.round((ty - fy) * i / n)}`);
  return out;
}

/**
 * The original city's protected businesses (0x5A3C90, event 9). A rival boss,
 * lieutenant or hood on foot who walks into a new cell calls on the keeper of
 * every building cell in the 3 × 3 round it (0x5DD630 → 0x5DD420), once per
 * cell; each call rolls `rand & 255 > Stealth` and, won, reports him to the
 * gang protecting it. Whether the gang knows him already is not asked.
 */
function passingBy(w: WorldState, rng: Rng, gang: Gang, men: Person[], before?: ReadonlyMap<ID, string>): void {
  let cells: Map<string, Building[]> | null = null;
  for (const man of men) {
    const now = cellKey(man.pos), was = before?.get(man.id);
    if (was === now) continue;
    for (const cell of cellsEntered(was, now)) {
      const [cx, cy] = cell.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!cells) {
          cells = new Map();
          for (const b of buildingList(w)) if (b.protection?.gangId === gang.id && b.state !== 'destroyed')
            for (const key of businessCells(w, b)) {
              const list = cells.get(key);
              if (list) list.push(b); else cells.set(key, [b]);
            }
        }
        for (const shop of cells.get(`${cx + dx},${cy + dy}`) ?? [])
          if (rng.int(0, 255) > skillByte(man.skills.stealth))
            spotted(w, gang, man, `The ${BUILDING_BY_ID[shop.typeId]?.name ?? 'shopkeeper'}`);
      }
    }
  }
}

/**
 * 0x481E20, the message box's own check, for the original city: a message of
 * the same kind (`mark`), at the same street corner when `corner` is given,
 * nearer than `MESSAGE_NEAR_METRES` drops the new one; further off, the old one
 * is taken out (the boxes are walked oldest first). Returns whether it was posted.
 */
export function postOriginal(w: WorldState, category: MessageCategory, mark: string, corner: string | null,
  text: string, pos: Vec2, personId: ID): boolean {
  for (let i = 0; i < w.messages.length; i++) {
    const m = w.messages[i];
    if (m.category !== category || !m.pos || !m.text.includes(mark)) continue;
    if (corner != null && streetLocation(w, m.pos) !== corner) continue;
    if (dist(m.pos, pos) < MESSAGE_NEAR_METRES) return false;
    w.messages.splice(i--, 1);
  }
  addMessage(w, category, text, pos, personId);
  return true;
}

function spotted(w: WorldState, gang: Gang, man: Person, who: string): void {
  if (!gang.knownPeople.includes(man.id)) gang.knownPeople.push(man.id);
  const corner = streetLocation(w, man.pos);
  const text = `${who}: "I've just seen ${man.name} ${TIP_TEXT} ${corner}.`;
  // The original's tip is type 7: the Hoods and the Law box (0x47FE00).
  if (w.cityLayout?.original) postOriginal(w, 'police', TIP_TEXT, corner, text, man.pos, man.id);
  else addMessage(w, 'waiting', text, man.pos, man.id);
}
