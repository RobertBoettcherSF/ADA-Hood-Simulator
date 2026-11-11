import { describe, expect, it } from 'vitest';
import { newCampaignOptions } from '../src/app/newGame';
import { cityBlockAt } from '../src/sim/cityLayout';
import { createWorld } from '../src/sim/citygen';
import { CELL } from '../src/sim/constants';
import { ORIGINAL_CELL_METRES } from '../src/sim/fireRoll';
import { Rng } from '../src/sim/rng';
import { absoluteMinute, UNDER_FIRE_MINUTES } from '../src/sim/systems/combat';
import {
  businessCells, cellBlocksView, cellsEntered, CHASE_LOOK_TICKS, FIGHT_TEXT, inView, LOOK_PERIOD_TICKS, lookAheadCells,
  looksThisMinute, MESSAGE_NEAR_METRES, ORIGINAL_TICKS_PER_MINUTE, postOriginal, SIGHT_CELLS, spotterLooksThisMinute,
  sightingCells, spotterSees, tickSightings, TIP_TEXT,
} from '../src/sim/systems/sightings';
import type { Person, WorldState } from '../src/sim/types';

// Traced 28 October 2026: the look 0x6F6E20 (rings 0x6F6B10, ahead 0x6F6BE0),
// the view test 0x609200 and the 32-tick beat of 0x6F22D0.
function setup() {
  const w: WorldState = createWorld({ ...newCampaignOptions(), seed: 404 }).world;
  const player = Object.values(w.gangs).find(g => g.isPlayer)!;
  const rival = Object.values(w.gangs).find(g => !g.isPlayer)!;
  const people = Object.values(w.people);
  const mine = people.find(p => p.gangId === player.id && p.role === 'hood')!;
  const theirs = people.find(p => p.gangId === rival.id && p.role === 'hood')!;
  player.knownPeople = player.knownPeople.filter(id => id !== theirs.id);
  for (const p of people) if (p !== mine && p !== theirs && p.gangId != null) p.buildingId = p.buildingId ?? -1;
  for (const p of [mine, theirs]) {
    p.status = 'active'; p.buildingId = null; p.inVehicle = false; p.path = []; p.dest = null; p.halted = false;
  }
  return { w, player, mine, theirs };
}
const at = (p: Person, x: number, y: number) => { p.pos = { x, y }; };

/** A single urban block with a single urban block south of it, both unmerged. */
function urbanColumn(w: WorldState) {
  const single = (gx: number, gy: number) => {
    const b = cityBlockAt(w, gx, gy);
    return !!b && b.gx === gx && b.gy === gy && (b.layout?.use ?? 'urban') === 'urban'
      && (b.layout?.spanX ?? 1) === 1 && (b.layout?.spanY ?? 1) === 1;
  };
  for (let gy = 2; gy < w.gridH - 3; gy++) for (let gx = 2; gx < w.gridW - 3; gx++)
    if (single(gx, gy) && single(gx, gy + 1)) return { gx, gy };
  throw new Error('no urban column');
}

describe('the view test (0x609200)', () => {
  it('a building block stops the eye; the street along it does not', () => {
    const { w } = setup();
    const { gx, gy } = urbanColumn(w);
    const west = gx * CELL + 2, east = (gx + 1) * CELL - 2, mid = gy * CELL + 27;
    expect(cellBlocksView(w, Math.floor(west / ORIGINAL_CELL_METRES), Math.floor(mid / ORIGINAL_CELL_METRES))).toBe(false);
    expect(cellBlocksView(w, Math.floor((gx * CELL + 27) / ORIGINAL_CELL_METRES), Math.floor(mid / ORIGINAL_CELL_METRES))).toBe(true);
    // Across the block: blocked both ways.
    expect(inView(w, { x: west, y: mid }, { x: east, y: mid })).toBe(false);
    expect(inView(w, { x: east, y: mid }, { x: west, y: mid })).toBe(false);
    // Down the street past the next block: open.
    expect(inView(w, { x: west, y: mid }, { x: west, y: mid + CELL })).toBe(true);
    // Same cell: always in view.
    expect(inView(w, { x: west, y: mid }, { x: west + 1, y: mid + 1 })).toBe(true);
  });
});

describe('where a man looks (0x6F6B10, 0x6F6BE0)', () => {
  it('standing, he sees nine cells down the street but not ten', () => {
    const { w, mine, theirs } = setup();
    const { gx, gy } = urbanColumn(w);
    const x = gx * CELL + 2, y = gy * CELL + 2;
    at(mine, x, y);
    at(theirs, x, y + SIGHT_CELLS * ORIGINAL_CELL_METRES);
    expect(spotterSees(w, mine, theirs)).toBe(true);
    at(theirs, x, y + (SIGHT_CELLS + 1) * ORIGINAL_CELL_METRES);
    expect(spotterSees(w, mine, theirs)).toBe(false);
  });

  it('walking, he sees the block ahead of him and not behind', () => {
    const { w, mine, theirs } = setup();
    const { gx, gy } = urbanColumn(w);
    const x = gx * CELL + 2, y = gy * CELL + 2 + 5 * ORIGINAL_CELL_METRES;
    at(mine, x, y);
    mine.dest = { x, y: y + 200 };                        // heading down the map
    at(theirs, x, y + 3 * ORIGINAL_CELL_METRES);
    expect(spotterSees(w, mine, theirs)).toBe(true);
    at(theirs, x, y - 3 * ORIGINAL_CELL_METRES);
    expect(spotterSees(w, mine, theirs)).toBe(false);
    mine.dest = null;                                     // standing: all round
    expect(spotterSees(w, mine, theirs)).toBe(true);
  });

  it('the block ahead: 5 cells on the heading, 4 on each of 8 side lines; 52 cells on a diagonal', () => {
    const east = lookAheadCells(1, 0);
    expect(east.size).toBe(37);
    for (const c of ['0,0', '4,0', '3,4', '3,-4', '0,-4']) expect(east.has(c)).toBe(true);
    for (const c of ['4,1', '-1,0', '0,5']) expect(east.has(c)).toBe(false);
    const south = lookAheadCells(0, 1);
    expect(south.has('4,3')).toBe(true);
    expect(south.has('0,4')).toBe(true);
    const diag = lookAheadCells(1, 1);
    expect(diag.size).toBe(52);
    for (const c of ['0,0', '3,3', '-3,3', '3,-3', '0,1', '1,0']) expect(diag.has(c)).toBe(true);
    expect(diag.has('-1,-1')).toBe(false);
  });
});

describe('how often a man looks (0x6F22D0)', () => {
  it('once every 32 ticks: 1,000 looks in 3,200 minutes, never two in a minute', () => {
    const { w, mine } = setup();
    expect(ORIGINAL_TICKS_PER_MINUTE).toBe(10);
    let looks = 0;
    for (let m = 0; m < 3200; m++) { w.week = 1 + Math.floor(m / 2400); w.minute = m % 2400; if (looksThisMinute(w, mine)) looks++; }
    expect(looks).toBe(3200 * ORIGINAL_TICKS_PER_MINUTE / LOOK_PERIOD_TICKS);
  });

  it('a man who is not looking this minute reports nothing', () => {
    const { w, player, mine, theirs } = setup();
    const { gx, gy } = urbanColumn(w);
    mine.skills.intelligence = 5; theirs.skills.stealth = 0.5;
    at(mine, gx * CELL + 2, gy * CELL + 2); at(theirs, gx * CELL + 2, gy * CELL + 2 + 2 * ORIGINAL_CELL_METRES);
    const still = new Map([[theirs.id, `${Math.floor(theirs.pos.x / ORIGINAL_CELL_METRES)},${Math.floor(theirs.pos.y / ORIGINAL_CELL_METRES)}`]]);
    let quiet = 0;
    while (looksThisMinute(w, mine)) w.minute++;
    tickSightings(w, new Rng(1), still);
    if (!player.knownPeople.includes(theirs.id)) quiet++;
    while (!looksThisMinute(w, mine)) w.minute++;
    tickSightings(w, new Rng(1), still);
    expect(quiet).toBe(1);
    expect(player.knownPeople).toContain(theirs.id);
    expect(w.messages[w.messages.length - 1].text).toContain(`I've just seen ${theirs.name} moving round here!`);
  });
});

// Traced 29 October 2026: the keeper's event 9 (0x5A3C90, sent by 0x5DD630 to
// the 3 × 3 cells round a walker's new cell), the box check 0x481E20, the fight
// report 0x480700, the chase's 12-tick look and the car's lack of one.
const cellCentre = (key: string) => {
  const [cx, cy] = key.split(',').map(Number);
  return { x: (cx + 0.5) * ORIGINAL_CELL_METRES, y: (cy + 0.5) * ORIGINAL_CELL_METRES };
};
const keyOf = (p: { x: number; y: number }) => `${Math.floor(p.x / ORIGINAL_CELL_METRES)},${Math.floor(p.y / ORIGINAL_CELL_METRES)}`;
const tips = (w: WorldState) => w.messages.filter(m => m.text.includes(TIP_TEXT));

function shopSetup() {
  const s = setup();
  const { w, player, mine, theirs } = s;
  expect(w.cityLayout?.original).toBeTruthy();
  mine.buildingId = -1;                                   // nobody of ours looks
  for (const b of Object.values(w.buildings)) if (b.protection?.gangId === player.id) b.protection = null;
  const shop = Object.values(w.buildings).find(b => b.state === 'trading' && b.frontId == null && businessCells(w, b).length > 0)!;
  shop.protection = { gangId: player.id, weekly: 0, base: 0, refusing: false, grievance: 0 };
  const cells = new Set(businessCells(w, shop));
  const [cx, cy] = [...cells][0].split(',').map(Number);
  // A cell beside the shop, and one four cells out the same way.
  const dir = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dy]) => !cells.has(`${cx + dx},${cy + dy}`))!;
  const beside = `${cx + dir[0]},${cy + dir[1]}`;
  const far = `${cx + 4 * dir[0]},${cy + 4 * dir[1]}`;
  theirs.skills.stealth = 0;                              // rand & 255 > 0: all but 1 in 256
  return { ...s, shop, cells, beside, far };
}
const besideAny = (cells: Set<string>, key: string) => {
  const [x, y] = key.split(',').map(Number);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (cells.has(`${x + dx},${y + dy}`)) return true;
  return false;
};

describe('a protected business sees a rival walk past it (0x5A3C90, event 9 from 0x5DD630)', () => {
  it('walking into a cell beside it, not standing there and not four cells off', () => {
    const { w, player, theirs, cells, beside, far } = shopSetup();
    expect(besideAny(cells, beside)).toBe(true);
    expect(besideAny(cells, far)).toBe(false);
    theirs.pos = cellCentre(beside);
    tickSightings(w, new Rng(3), new Map([[theirs.id, beside]]));    // standing: no event
    expect(player.knownPeople).not.toContain(theirs.id);
    theirs.pos = cellCentre(far);
    tickSightings(w, new Rng(3));                                     // arrived four cells off
    expect(player.knownPeople).not.toContain(theirs.id);
    theirs.pos = cellCentre(beside);
    tickSightings(w, new Rng(3), new Map([[theirs.id, far]]));       // walked in from four cells off
    expect(player.knownPeople).toContain(theirs.id);
    const tip = tips(w).at(-1)!;
    expect(tip.category).toBe('police');                             // type 7: Hoods and the Law
    expect(tip.text).toMatch(/^The .*: "I've just seen .* moving round here!" /);
    expect(tip.personId).toBe(theirs.id);
  });

  it('a man the gang knows is reported too; a man in a car is not', () => {
    const { w, player, theirs, beside, far } = shopSetup();
    player.knownPeople.push(theirs.id);
    theirs.pos = cellCentre(beside);
    tickSightings(w, new Rng(5), new Map([[theirs.id, far]]));
    expect(tips(w)).toHaveLength(1);
    w.messages = [];
    theirs.inVehicle = true;
    tickSightings(w, new Rng(5), new Map([[theirs.id, far]]));
    expect(tips(w)).toHaveLength(0);
  });

  it('the box keeps one tip for the same corner and place (0x481E20)', () => {
    const { w, theirs, beside, far } = shopSetup();
    theirs.pos = cellCentre(beside);
    tickSightings(w, new Rng(7), new Map([[theirs.id, far]]));
    tickSightings(w, new Rng(8), new Map([[theirs.id, far]]));
    expect(tips(w)).toHaveLength(1);
  });
});

describe('the cells a walker steps into', () => {
  it('a line of cells, not the one he left; none when he stays', () => {
    expect(cellsEntered('0,0', '3,1')).toEqual(['1,0', '2,1', '3,1']);
    expect(cellsEntered('2,2', '2,2')).toEqual([]);
    expect(cellsEntered(undefined, '4,5')).toEqual(['4,5']);
  });
});

describe('the message box check (0x481E20)', () => {
  it('drops a message near one listed, replaces one further off', () => {
    const { w, theirs } = setup();
    w.messages = [];
    const a = { x: 100, y: 100 };
    expect(postOriginal(w, 'combat', FIGHT_TEXT, null, `x: "${FIGHT_TEXT}"`, a, theirs.id)).toBe(true);
    expect(postOriginal(w, 'combat', FIGHT_TEXT, null, `y: "${FIGHT_TEXT}"`, { x: a.x + MESSAGE_NEAR_METRES - 1, y: a.y }, theirs.id)).toBe(false);
    const b = { x: a.x + MESSAGE_NEAR_METRES + 1, y: a.y };
    expect(postOriginal(w, 'combat', FIGHT_TEXT, null, `z: "${FIGHT_TEXT}"`, b, theirs.id)).toBe(true);
    const fights = w.messages.filter(m => m.text.includes(FIGHT_TEXT));
    expect(fights).toHaveLength(1);
    expect(fights[0].pos).toEqual(b);
    expect(MESSAGE_NEAR_METRES).toBeCloseTo(1000 / 96 * ORIGINAL_CELL_METRES);
  });
});

describe('a fight in sight (0x6F66E0 → 0x480700)', () => {
  it('"There\'s a fight going on!" in the Combat box, once for one place', () => {
    const { w, mine, theirs } = setup();
    const { gx, gy } = urbanColumn(w);
    const x = gx * CELL + 2, y = gy * CELL + 2;
    at(mine, x, y); at(theirs, x, y + 3 * ORIGINAL_CELL_METRES);
    theirs.skills.stealth = 5; mine.skills.intelligence = 0.5;
    w.messages = [];
    while (!spotterLooksThisMinute(w, mine)) w.minute++;
    tickSightings(w, new Rng(1), new Map([[theirs.id, keyOf(theirs.pos)]]));
    expect(w.messages.some(m => m.text.includes(FIGHT_TEXT))).toBe(false); // not fighting
    theirs.underFireUntil = absoluteMinute(w) + UNDER_FIRE_MINUTES;     // shot at this minute
    tickSightings(w, new Rng(1), new Map([[theirs.id, keyOf(theirs.pos)]]));
    const fights = w.messages.filter(m => m.text.includes(FIGHT_TEXT));
    expect(fights).toHaveLength(1);
    expect(fights[0].category).toBe('combat');
    expect(fights[0].text.startsWith(`${mine.name}: `)).toBe(true);
    expect(fights[0].pos).toEqual(theirs.pos);
    tickSightings(w, new Rng(2), new Map([[theirs.id, keyOf(theirs.pos)]]));
    expect(w.messages.filter(m => m.text.includes(FIGHT_TEXT))).toHaveLength(1);
  });
});

describe('who looks when, in the original city (0x4C3DD0, 0x6F22D0)', () => {
  it('standing on a chase: every 12 ticks of his byte counter', () => {
    const { w, mine, theirs } = setup();
    let plain = 0, chase = 0;
    for (let m = 0; m < 3200; m++) {
      w.week = 1 + Math.floor(m / 2400); w.minute = m % 2400;
      mine.streetOrder = null;
      if (spotterLooksThisMinute(w, mine)) plain++;
      mine.streetOrder = { type: 'kill', targetPersonId: theirs.id, pos: null };
      if (spotterLooksThisMinute(w, mine)) chase++;
    }
    expect(plain).toBe(3200 * ORIGINAL_TICKS_PER_MINUTE / LOOK_PERIOD_TICKS);
    // 32,000 ticks are 125 turns of the byte counter, 22 multiples of 12 in each;
    // a minute holding both 252 and 0 counts once.
    expect(chase).toBeLessThanOrEqual(125 * 22);
    expect(chase).toBeGreaterThanOrEqual(125 * 21);
    expect(CHASE_LOOK_TICKS).toBe(12);
  });

  it('walking on a chase keeps the walking beat; riding in a car, no look at all', () => {
    const { w, mine, theirs } = setup();
    mine.streetOrder = { type: 'kill', targetPersonId: theirs.id, pos: null };
    mine.dest = { x: mine.pos.x + 100, y: mine.pos.y };
    for (let m = 0; m < 200; m++) { w.minute = m; expect(spotterLooksThisMinute(w, mine)).toBe(looksThisMinute(w, mine)); }
    mine.dest = null; mine.streetOrder = null; mine.inVehicle = true;
    for (let m = 0; m < 200; m++) { w.minute = m; expect(spotterLooksThisMinute(w, mine)).toBe(false); }
  });
});

describe('where the minute began (sim.ts, the early ambient slices)', () => {
  it('takes a man already stepped by an early slice from where he stood', () => {
    const { w, theirs } = setup();
    const start = { ...theirs.pos };
    theirs.pos = { x: start.x + 40 * CELL, y: start.y };
    const moved = sightingCells(w).get(theirs.id);
    const before = sightingCells(w, new Map([[theirs, start]])).get(theirs.id);
    theirs.pos = start;
    expect(before).toBe(sightingCells(w).get(theirs.id));
    expect(before).not.toBe(moved);
  });
});
