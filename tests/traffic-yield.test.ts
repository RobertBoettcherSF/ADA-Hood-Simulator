import { describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { MINUTES_PER_SECOND, Sim } from '../src/sim/sim';
import { streetGraph } from '../src/sim/cityLayout';
import { onRoad } from '../src/sim/vehicleNavigation';
import { CELL, LANE_OFFSET } from '../src/sim/constants';
import { carsAt, crossingBlocked, FOLLOW_GAP, roadAheadRoom, tickTraffic, type Car, type TrafficContext } from '../src/sim/traffic';
import { driveFrom, previewPosition, stepPerson } from '../src/sim/movement';

const car = (over: Partial<Car>): Car => ({ axisX: true, line: 1, dir: 1, truck: false, speed: 1, s: 0, x: 0, y: CELL + LANE_OFFSET,
  color: 0, halted: false, waited: 0, id: 0, heading: 0, ...over });
const context = (cars: Car[], drivers: TrafficContext['drivers'] = []): TrafficContext => {
  const carsByStreet = new Map<number, Car[]>();
  for (const c of cars) {
    const key = c.line * 2 + (c.axisX ? 1 : 0);
    carsByStreet.set(key, [...carsByStreet.get(key) ?? [], c]);
  }
  return { cars, carsByStreet, drivers, crossings: [] };
};

describe('traffic in the lanes', () => {
  // A gang car driving east along the street at y = CELL, in its lane, well
  // short of the next junction (x = 2 * CELL).
  const at = { x: 60, y: CELL + LANE_OFFSET }, next = { x: 90, y: CELL + LANE_OFFSET };

  it('a driver closes up behind a slower car in its lane and keeps its pace', () => {
    const ahead = car({ s: 70, x: 70, speed: 1 });
    expect(roadAheadRoom(context([ahead]), at, next)).toBeCloseTo(70 + 1 - FOLLOW_GAP - 60);
    // Stopped: up to the following distance and no further.
    expect(roadAheadRoom(context([{ ...ahead, s: 64, x: 64, halted: true }]), at, next)).toBe(0);
  });

  it('ignores the oncoming lane and cars behind', () => {
    const oncoming = car({ s: 70, x: 70, dir: -1, y: CELL - LANE_OFFSET });
    const behind = car({ s: 55, x: 55 });
    expect(roadAheadRoom(context([oncoming, behind]), at, next)).toBe(Infinity);
  });

  it('gives way at a junction to a car coming along the cross street', () => {
    // The junction at x = 2 * CELL; the car is 10 m short of it.
    const near = { x: 2 * CELL - 10, y: CELL + LANE_OFFSET }, beyond = { x: 2 * CELL + 30, y: CELL + LANE_OFFSET };
    const crossing = car({ axisX: false, line: 2, dir: 1, s: CELL - 6, x: 2 * CELL - LANE_OFFSET, y: CELL - 6 });
    const room = roadAheadRoom(context([crossing]), near, beyond);
    expect(room).toBeGreaterThan(0);
    expect(room).toBeLessThan(10 - 4.5);
    // Once it has gone by, the way is clear.
    expect(roadAheadRoom(context([{ ...crossing, s: CELL + 8, y: CELL + 8 }]), near, beyond)).toBe(Infinity);
  });

  it('turning right, gives way only to the lane it turns into', () => {
    // East along y = CELL to the junction at x = 2 * CELL, then right (south) down x = 2 * CELL.
    const near = { x: 2 * CELL - 10, y: CELL + LANE_OFFSET }, corner = { x: 2 * CELL - LANE_OFFSET, y: CELL + LANE_OFFSET };
    const after = { x: 2 * CELL - LANE_OFFSET, y: CELL + 40 };
    // Held in the junction in the far lane, northbound: it never crosses the corner the car takes.
    const far = car({ axisX: false, line: 2, dir: -1, s: CELL + 1, x: 2 * CELL + LANE_OFFSET, y: CELL + 1, halted: true });
    expect(roadAheadRoom(context([far]), near, corner, undefined, after)).toBe(Infinity);
    // Held in the lane it turns into: wait at the line.
    const exit = car({ axisX: false, line: 2, dir: 1, s: CELL - 1, x: 2 * CELL - LANE_OFFSET, y: CELL - 1, halted: true });
    expect(roadAheadRoom(context([exit]), near, corner, undefined, after)).toBeCloseTo(10 - 5.5);
    // Going straight over, the far lane's car is in the way too.
    expect(roadAheadRoom(context([far]), near, { x: 2 * CELL + 30, y: CELL + LANE_OFFSET })).toBeCloseTo(10 - 5.5);
  });

  it('walkers hold back for a driver waiting at the crossing, not only a moving one', () => {
    // Standing at the crossing (the street at x = 2 * CELL, walked across at y = CELL), waiting for the walkers.
    const waiting = { pos: { x: 2 * CELL - LANE_OFFSET, y: CELL - 2 }, halted: true, path: [{ x: 2 * CELL - LANE_OFFSET, y: CELL + 30 }] };
    expect(crossingBlocked(context([], [waiting]), false, 2, CELL, 2 * CELL, CELL)).toBe(true);
  });
});

describe('the city traffic', () => {
  const world = () => new Sim({ ...defaultGameOptions(), citySize: 10, seed: 404 }).world;

  it('cruise the streets, turning at junctions by lot and never back the way they came', () => {
    const w = world(), g = streetGraph(w);
    const dead = (x: number, y: number) => g.neighbours[Math.round(y / CELL) * (w.gridW + 1) + Math.round(x / CELL)]?.length === 1;
    const first = carsAt(w, 0).map(c => ({ ...c }));
    let turned = 0;
    let previous = first;
    for (let t = 1; t <= 2400; t += 1) {
      const now = carsAt(w, t).map(c => ({ ...c }));
      now.forEach((c, k) => {
        expect(onRoad(w, c), JSON.stringify(c)).toBe(true);
        const p = previous[k];
        if (p.axisX !== c.axisX) turned++;
        // Straight back only where the road ends.
        if (p.axisX === c.axisX && p.line === c.line && p.dir !== c.dir) expect(dead(c.x, c.y) || dead(p.x, p.y), JSON.stringify([p, c])).toBe(true);
      });
      previous = now;
    }
    expect(turned).toBeGreaterThan(first.length);
  });

  it('keep out of one another through a working week', () => {
    const sim = new Sim({ ...defaultGameOptions(), citySize: 10, seed: 404 }), w = sim.world;
    sim.launchWeek();
    let close = 0, samples = 0;
    for (let i = 0; i < 600 && w.phase === 'week'; i++) {
      sim.advance(1 / MINUTES_PER_SECOND, 1);
      const cars = carsAt(w, w.minute);
      for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
        samples++;
        if (Math.hypot(cars[a].x - cars[b].x, cars[a].y - cars[b].y) < 3) close++;
      }
    }
    expect(samples).toBeGreaterThan(0);
    expect(close).toBe(0);
  });

  it('are where they were after a save and load', () => {
    const sim = new Sim({ ...defaultGameOptions(), citySize: 10, seed: 404 });
    sim.launchWeek();
    for (let i = 0; i < 90; i++) sim.advance(1 / MINUTES_PER_SECOND, 1);
    const before = carsAt(sim.world, sim.world.minute).map(c => [c.x, c.y]);
    const restored = Sim.fromSave(structuredClone(sim.world)).world;
    expect(carsAt(restored, restored.minute).map(c => [c.x, c.y])).toEqual(before);
  });

  it('cars in one lane share a pace and start apart', () => {
    const w = world(), lanes = new Map<string, Car[]>();
    for (const c of carsAt(w, 0)) {
      const key = `${c.axisX}:${c.line}:${c.dir}`;
      lanes.set(key, [...lanes.get(key) ?? [], c]);
    }
    for (const lane of lanes.values()) {
      expect(new Set(lane.map(c => c.speed)).size).toBe(1);
      const s = lane.map(c => c.s).sort((a, b) => a - b);
      for (let i = 1; i < s.length; i++) expect(s[i] - s[i - 1]).toBeGreaterThan(5);
    }
  });

  it('a car waits behind a gang car standing in its lane instead of driving through it', () => {
    const w = world();
    w.phase = 'week'; w.minute = 10;
    tickTraffic(w);
    const target = carsAt(w, w.minute).find(c => !c.halted)!;
    const p = Object.values(w.people).find(q => q.role === 'hood' && q.status === 'active')!;
    // Four metres in front of it, in its lane, on the way somewhere.
    const ahead = target.s + 4 * target.dir;
    p.inVehicle = true; p.dest = { x: 0, y: 0 }; p.path = [{ x: 0, y: 0 }];
    p.pos = target.axisX ? { x: ahead, y: target.y } : { x: target.x, y: ahead };
    w.minute++;
    tickTraffic(w);
    const index = carsAt(w, w.minute).findIndex(c => c.line === target.line && c.axisX === target.axisX && c.dir === target.dir && Math.abs(c.s - target.s) < 2);
    expect(carsAt(w, w.minute)[index].halted).toBe(true);
  });

  it('a car is drawn along the road it took in the minute, ending where the tick left it', () => {
    const w = world();
    const p = Object.values(w.people).find(q => q.role === 'hood' && q.status === 'active')!;
    p.inVehicle = true; p.pos = { x: 100, y: CELL + LANE_OFFSET }; p.dest = { x: 200, y: CELL + LANE_OFFSET }; p.path = [{ ...p.dest }];
    driveFrom.clear();
    const start = { ...p.pos };
    stepPerson(p, 1);
    expect(previewPosition(p, 0, { x: 0, y: 0 })).toEqual(start);
    expect(previewPosition(p, 1, { x: 0, y: 0 })).toEqual(p.pos);
    const half = previewPosition(p, .5, { x: 0, y: 0 });
    expect(half.x).toBeCloseTo((start.x + p.pos.x) / 2);
  });
});

describe("the game's own cars", () => {
  // Driving east along the street at y = CELL, in its lane, between junctions.
  const lane = CELL + LANE_OFFSET;
  const me = { id: 9, pos: { x: 60, y: lane }, halted: false, path: [{ x: 100, y: lane }] };

  it('follow one another in a lane instead of driving through', () => {
    const ahead = { id: 3, pos: { x: 70, y: lane }, halted: false, path: [{ x: 100, y: lane }] };
    expect(roadAheadRoom(context([], [me, ahead]), me.pos, me.path[0], me)).toBeCloseTo(10 - FOLLOW_GAP);
    // One coming the other way, drifting across to its kerb, is no queue.
    const oncoming = { ...ahead, path: [{ x: 30, y: lane }] };
    expect(roadAheadRoom(context([], [me, oncoming]), me.pos, me.path[0], me)).toBe(Infinity);
    // One that has arrived stands at the kerb, and is passed.
    const arrived = { ...ahead, path: [] };
    expect(roadAheadRoom(context([], [me, arrived]), me.pos, me.path[0], me)).toBe(Infinity);
  });

  it('two cars leaving one spot go one after the other', () => {
    const twin = { id: 3, pos: { ...me.pos }, halted: false, path: [...me.path] };
    expect(roadAheadRoom(context([], [me, twin]), me.pos, me.path[0], me)).toBe(0);
    expect(roadAheadRoom(context([], [me, twin]), twin.pos, twin.path[0], twin)).toBe(Infinity);
  });

  it('hold walkers only when coming to their crossing', () => {
    // The crossing over the column street at x = 2 * CELL, at y = CELL.
    const across = { id: 4, pos: { x: 2 * CELL - 15, y: lane }, halted: false, path: [{ x: 2 * CELL - 40, y: lane }] };
    expect(crossingBlocked(context([], [across]), false, 2, CELL, 2 * CELL, CELL)).toBe(false);
    const coming = { id: 5, pos: { x: 2 * CELL - LANE_OFFSET, y: CELL - 12 }, halted: false, path: [{ x: 2 * CELL - LANE_OFFSET, y: CELL + 30 }] };
    expect(crossingBlocked(context([], [coming]), false, 2, CELL, 2 * CELL, CELL)).toBe(true);
    const leaving = { ...coming, pos: { x: 2 * CELL - LANE_OFFSET, y: CELL + 12 } };
    expect(crossingBlocked(context([], [leaving]), false, 2, CELL, 2 * CELL, CELL)).toBe(false);
  });

  it("don't block the box: one queued behind a car just past a junction waits at the line", () => {
    const near = { x: 2 * CELL - 12, y: lane }, beyond = { x: 2 * CELL + 30, y: lane };
    const self = { id: 9, pos: near, halted: false, path: [beyond] };
    const past = { id: 3, pos: { x: 2 * CELL + 4, y: lane }, halted: true, path: [{ x: 2 * CELL + 30, y: lane }] };
    // Following alone would stop it 3 m short of the middle, in the junction.
    expect(roadAheadRoom(context([], [self, past]), near, beyond, self)).toBeCloseTo(12 - 5.5);
  });

  it('do not wait for an oncoming car when going straight over a junction', () => {
    const near = { x: 2 * CELL - 10, y: lane }, corner = { x: 2 * CELL, y: lane }, beyond = { x: 2 * CELL + 30, y: lane };
    const oncoming = car({ s: 2 * CELL + 1, x: 2 * CELL + 1, dir: -1, y: CELL - LANE_OFFSET });
    expect(roadAheadRoom(context([oncoming]), near, corner, undefined, beyond)).toBe(Infinity);
    // Turning across its lane (away from the kerb side), it is in the way.
    const across = { x: 2 * CELL - LANE_OFFSET, y: CELL - 30 };
    expect(roadAheadRoom(context([oncoming]), near, corner, undefined, across)).toBeLessThan(10);
  });
});

describe('parking', () => {
  it('each car of a gang has its own spot by the office, clear of the junctions', async () => {
    const { parkingSpot } = await import('../src/sim/vehicleNavigation');
    const w = new Sim({ ...defaultGameOptions(), citySize: 10, seed: 404 }).world;
    const door = { x: CELL + 20, y: CELL - 9 };
    const spots: { x: number; y: number }[] = [];
    for (let i = 0; i < 4; i++) spots.push(parkingSpot(w, door, spots));
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++)
      expect(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y)).toBeGreaterThanOrEqual(5.5);
    for (const s of spots) {
      const along = Math.abs(s.y - Math.round(s.y / CELL) * CELL) < 3 ? s.x : s.y;
      expect(Math.abs(along - Math.round(along / CELL) * CELL)).toBeGreaterThanOrEqual(8 - 1e-6);
    }
  });
});

describe('staff cars', () => {
  it('a lawyer walks when fetching his far-off car would take longer than walking there', async () => {
    const { startStaffJourney } = await import('../src/sim/transport');
    const sim = new Sim({ ...defaultGameOptions(), citySize: 10, seed: 404 }), w = sim.world, g = sim.playerGang;
    const lawyer = Object.values(w.people).find(p => p.role === 'citizen' && p.status === 'active')!;
    lawyer.role = 'lawyer'; lawyer.gangId = g.id; g.lawyerId = lawyer.id;
    g.staffVehicles = { accountant: g.staffVehicles?.accountant ?? null, lawyer: 'coupe' };
    // His car is parked at the office; he is across town, with an errand next door.
    lawyer.pos = { x: 6 * CELL + 10, y: 6 * CELL - 9 };
    const errand = { x: 6 * CELL + 30, y: 6 * CELL - 9 };
    startStaffJourney(w, lawyer, errand);
    expect(lawyer.inVehicle).toBe(false);
    expect(lawyer.dest).toEqual(errand);
  });
});

describe('arriving and turning', () => {
  it('a car never slides diagonally across the road to park', async () => {
    const { vehicleRoute } = await import('../src/sim/vehicleNavigation');
    const { activeBlocks, blockPavement } = await import('../src/sim/cityLayout');
    const w = new Sim({ ...defaultGameOptions(), citySize: 10, seed: 404 }).world, blocks = activeBlocks(w);
    let routes = 0;
    for (let i = 0; i < blocks.length; i++) for (let k = 0; k < 6; k++) {
      const from = blockPavement(blocks[i], k), to = blockPavement(blocks[(i + 3 + k) % blocks.length], k * 5 + 2);
      const { start, path } = vehicleRoute(w, from, to, (k & 1) === 0);
      const pts = [start, ...path];
      if (pts.length < 3) continue;
      const p = pts[pts.length - 3], a = pts[pts.length - 2], b = pts[pts.length - 1];
      // The last step stays in the lane it arrived along: no move across the
      // street it came down (a hop to the far lane, drawn as a diagonal slide).
      // (A turn onto a new street is a long leg; the hop is just the road's width.)
      const alongX = Math.abs(a.x - p.x) >= Math.abs(a.y - p.y);
      const across = Math.abs(alongX ? b.y - a.y : b.x - a.x), along = Math.abs(alongX ? b.x - a.x : b.y - a.y);
      const hop = Math.abs(across - 2 * LANE_OFFSET) < 0.6 && along < 0.5;
      expect(hop, JSON.stringify([p, a, b])).toBe(false);
      routes++;
    }
    expect(routes).toBeGreaterThan(50);
  });

  it('waits at the line, not in the junction, for a walker crossing the street it turns into', () => {
    const lane = CELL + LANE_OFFSET;
    const near = { x: 2 * CELL - 12, y: lane }, corner = { x: 2 * CELL - LANE_OFFSET, y: lane };
    const after = { x: 2 * CELL - LANE_OFFSET, y: CELL + 40 };
    // On the crossing over the side street, 5 m round the corner, in the car's new lane.
    const walker = { axisX: false, line: 2, s: CELL + 6, mx: 2 * CELL, my: CELL + 6, wx: 2 * CELL - LANE_OFFSET, wy: CELL + 6 };
    const t = { ...context([]), crossings: [walker] } as unknown as TrafficContext;
    expect(roadAheadRoom(t, near, corner, undefined, after)).toBeCloseTo(12 - 5.5);
  });
});
