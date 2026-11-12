import { describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { applyTutorial, TUTORIALS } from '../src/app/tutorials';
import { Sim } from '../src/sim/sim';
import { DRIVE_MIN_DISTANCE, LANE_OFFSET } from '../src/sim/constants';
import { activeBlocks, blockRect, cityStreetInset } from '../src/sim/cityLayout';
import { buildingDoor, dist } from '../src/sim/world';
import { onRoad, roadHeading, roadPosition, vehicleRoute } from '../src/sim/vehicleNavigation';
import { clearDestination, driveFrom, previewPosition, setDestination, stepPerson } from '../src/sim/movement';
import { hireRecruit, issueOrder, returnToBase } from '../src/sim/api';
import { isValidAreaTarget, tickOrders } from '../src/sim/execution';
import { streetPersonVisible } from '../src/render/characterPresentation';
import type { Vec2, WorldState } from '../src/sim/types';

const fixture = (cityLayout: 'classic' | 'varied' = 'varied') => new Sim({ ...defaultGameOptions(), seed:404, citySize:14, cityLayout });
const copy = <T>(x:T):T => JSON.parse(JSON.stringify(x));

/** Independent geometry check: a car's centre/body never enters a building
 * block, including the old streets absorbed by larger civic/park parcels. */
function expectClear(w: WorldState, points: Vec2[]) {
  const blocks = activeBlocks(w).map(blockRect);
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[i], n = Math.max(1, Math.ceil(dist(a, b) / 1.5));
    for (let j = 0; j <= n; j++) {
      const x = a.x + (b.x - a.x) * j / n, y = a.y + (b.y - a.y) * j / n;
      const blocked = blocks.some(r => x > r.x - 1.2 && x < r.x + r.w + 1.2 && y > r.y - 1.2 && y < r.y + r.h + 1.2);
      if (blocked) throw new Error(`Car entered a block at ${x},${y}: ${JSON.stringify(points)}`);
    }
  }
}

describe.each(['classic', 'varied'] as const)('%s city vehicle navigation', layout => {
  it('puts every building entrance outside its block, including corners and HQ fronts', () => {
    const sim = fixture(layout), w = sim.world;
    for (const b of Object.values(w.buildings)) {
      const door = buildingDoor(w,b), r = blockRect(w.blocks[b.blockId]);
      expect(door.x < r.x || door.x > r.x + r.w || door.y < r.y || door.y > r.y + r.h, String(b.id)).toBe(true);
      if (b.frontId != null) expect(door).toEqual(buildingDoor(w,w.buildings[b.frontId]));
    }
  });

  it('keeps departures, short trips, turns and arrival segments out of blocks', () => {
    const sim = fixture(layout), w = sim.world;
    const hq = Object.values(w.buildings).find(b => b.isHQ && b.ownerGangId === sim.playerGang.id)!;
    const sites = Object.values(w.buildings).filter((b,i) => i % 19 === 0 || w.blocks[b.blockId].layout?.use === 'civic');
    let from = w.lots[hq.lotId].center;
    for (const site of sites) {
      const route = vehicleRoute(w, from, buildingDoor(w,site), (site.id & 1) === 0);
      expectClear(w, [route.start, ...route.path]);
      expect(onRoad(w,route.start)).toBe(true); expect(onRoad(w,route.dest)).toBe(true);
      from = route.dest;
    }
    const block = activeBlocks(w)[0], r = blockRect(block);
    const short = vehicleRoute(w, {x:r.x+3,y:r.y-5.05}, {x:r.x-5.05,y:r.y+3}, true);
    expectClear(w,[short.start,...short.path]);
    expect(short.path.length).toBeGreaterThan(1);
    const across = vehicleRoute(w, {x:20,y:5.4}, {x:20,y:-5.4}, true);
    expect(across.start).toEqual({x:20,y:1.95});
    expect(across.dest).toEqual({x:20,y:-1.95});
  });

  it('launches an actual two-site extortion order at the HQ street front and reaches both sites', () => {
    const sim = fixture(layout), w = sim.world, gang = sim.playerGang, team = w.teams[gang.teamIds[0]];
    const hq = Object.values(w.buildings).find(b => b.isHQ && b.ownerGangId === gang.id)!;
    const sites = Object.values(w.buildings).filter(b => isValidAreaTarget(w,gang.id,'extort',b) && dist(buildingDoor(w,b),buildingDoor(w,hq))>DRIVE_MIN_DISTANCE+10)
      .sort((a,b) => dist(buildingDoor(w,a),buildingDoor(w,hq)) - dist(buildingDoor(w,b),buildingDoor(w,hq))).slice(0,2);
    expect(issueOrder(w,gang.id,{teamId:team.id,type:'extort',buildingIds:sites.map(b=>b.id)}).ok).toBe(true);
    sim.launchWeek();
    const order = w.orders[team.orderIds[0]], driver = w.people[order.assignedIds[0]];
    expect(driver.inVehicle).toBe(true);
    expect(dist(driver.pos,buildingDoor(w,hq))).toBeLessThan(8+cityStreetInset(w));
    expectClear(w,[driver.pos,...driver.path]);
    let executing = 0;
    for (let minute = 0; minute < 600 && order.state !== 'done'; minute++) {
      const before = {...driver.pos}; w.minute++;
      driveFrom.clear();
      tickOrders(w,sim.rng,1);
      expectClear(w,[driver.pos,...driver.path]);
      expect(onRoad(w,driver.pos)).toBe(true);
      if (order.state === 'executing') {
        expect(driver.dest).toBeNull();
        // In either lane beside the site: the original's cars stop across the road if they came that way.
        expect(dist(driver.pos,buildingDoor(w,sites[order.cursor]))).toBeLessThan(4+2*LANE_OFFSET+cityStreetInset(w));
        executing++;
      }
      // Between ticks the car is drawn along the road it took, never across a block.
      if (driver.dest && dist(before,driver.pos) > 0) for (const f of [.25,.5,.75]) {
        const shown = previewPosition(driver,f,{x:0,y:0},w);
        expectClear(w,[shown,shown]); expect(onRoad(w,shown)).toBe(true);
      }
    }
    // Both sites reached and worked (an owner may refuse: that site is a failed attempt).
    expect(executing).toBeGreaterThan(0); expect(order.cursor).toBe(2); expect(['done', 'failed']).toContain(order.state);
    expect(order.state === 'done').toBe(order.completedTargets > 0);
    expect(returnToBase(w,gang.id,driver.id).ok).toBe(true);
    expectClear(w,[driver.pos,...driver.path]);
    stepPerson(driver,10000);
    expect(driver.dest).toBeNull(); expect(onRoad(w,driver.pos)).toBe(true);
    expect(dist(driver.pos,buildingDoor(w,hq))).toBeLessThan(4+2*LANE_OFFSET+cityStreetInset(w));
  });
});

describe('vehicle save repair and indoor boss presentation', () => {
  it('gets a new business manager out of the car before moving them indoors', () => {
    const sim=fixture(), w=sim.world, gang=sim.playerGang, team=w.teams[gang.teamIds[0]];
    const manager=w.people[team.memberIds[0]];
    for(const id of team.memberIds){w.people[id].skills.business=.5;w.people[id].skills.organization=.5;}
    manager.skills.business=5;manager.skills.organization=5;
    // Far enough from the office that he drives there.
    const hq=Object.values(w.buildings).find(b=>b.isHQ&&b.ownerGangId===gang.id)!;
    const site=Object.values(w.buildings).find(b=>b.cls==='commercial' && b.ownerGangId==null && dist(buildingDoor(w,b),buildingDoor(w,hq))>DRIVE_MIN_DISTANCE+10)!;
    site.ownerGangId=gang.id;site.knowledge[gang.id]=4;
    expect(issueOrder(w,gang.id,{teamId:team.id,type:'runBusiness',buildingIds:[site.id],opts:{preferredHoodId:manager.id}}).ok).toBe(true);
    sim.launchWeek(); expect(manager.inVehicle).toBe(true);
    for(let i=0;i<1500 && manager.buildingId==null;i++){w.minute++;tickOrders(w,sim.rng,1);}
    expect(manager.buildingId).toBe(site.id);expect(site.managerId).toBe(manager.id);
    expect(manager.inVehicle).toBe(false);expect(streetPersonVisible(manager,null)).toBe(false);
    expect(manager.pos).toEqual(w.lots[site.lotId].center);
  });

  it('repairs a saved indoor manager without relocating the resident or changing the business', () => {
    const sim=fixture(), w=sim.world;
    const site=Object.values(w.buildings).find(b=>b.ownerGangId===sim.playerGang.id && b.managerId!=null)!;
    const manager=w.people[site.managerId!];manager.inVehicle=true;manager.pos={...w.lots[site.lotId].center};
    const before=copy(w), restored=Sim.fromSave(copy(w)).world;
    before.people[manager.id].inVehicle=false;
    expect(JSON.stringify(restored)).toBe(JSON.stringify(before));
    expect(streetPersonVisible(restored.people[manager.id],null)).toBe(false);
  });

  it.each(['hood','accountant'] as const)('clears an old vehicle flag when hiring a %s into HQ', role => {
    const sim=fixture(), w=sim.world;
    const recruit=Object.values(w.people).find(p=>p.role===role && p.gangId==null)!;
    recruit.inVehicle=true;
    expect(hireRecruit(w,sim.playerGang.id,recruit.id,'pool').ok).toBe(true);
    expect(recruit.inVehicle).toBe(false);
  });

  it('gives each HQ a developed street front, including the business tutorial seed', () => {
    const w = new Sim(applyTutorial(defaultGameOptions(),TUTORIALS[1])).world;
    for (const hq of Object.values(w.buildings).filter(b=>b.isHQ)) {
      const front=w.buildings[hq.frontId!];
      expect(['commercial','industrial','tenement','charity'],`HQ ${hq.id}, front ${front.typeId}`).toContain(front.cls);
      expect(front.state).toBe('trading');
    }
  });
  it('aligns stopped cars with their lanes in both directions', () => {
    const w = fixture('classic').world;
    expect(roadHeading(w,{x:20,y:1.95})).toBeCloseTo(Math.PI/2);
    expect(roadHeading(w,{x:20,y:-1.95})).toBeCloseTo(-Math.PI/2);
    expect(roadHeading(w,{x:1.95,y:20})).toBeCloseTo(Math.PI);
    expect(roadHeading(w,{x:-1.95,y:20})).toBe(0);
  });
  it.each(['sync','responsive'])('repairs an old indoor car and bad path on %s restore, preserving the job', async mode => {
    const sim = fixture(), w = sim.world, team = w.teams[sim.playerGang.teamIds[0]], driver = w.people[team.memberIds[0]];
    sim.launchWeek();
    const hq = Object.values(w.buildings).find(b=>b.isHQ && b.ownerGangId===sim.playerGang.id)!;
    driver.pos = {...w.lots[hq.lotId].center}; driver.inVehicle = true;
    driver.dest = {x:driver.pos.x+15,y:driver.pos.y+15}; driver.path=[{...driver.dest}];
    // A current save always has a fleet; without one the restore takes the legacy path and seats him in a car.
    w.vehicleFleet ??= {};
    const before = copy(w);
    const restored = mode==='sync' ? Sim.fromSave(copy(w)) : await Sim.fromSaveResponsive(copy(w));
    const fixed = restored.world.people[driver.id];
    expectClear(restored.world,[fixed.pos,...fixed.path]);
    expect(onRoad(restored.world,fixed.dest!)).toBe(true);
    const expected = copy(before);
    Object.assign(expected.people[driver.id],{pos:fixed.pos,dest:fixed.dest,path:fixed.path});
    expect(JSON.stringify(restored.world)).toBe(JSON.stringify(expected));
    expect(JSON.stringify(Sim.fromSave(copy(restored.world)).world)).toBe(JSON.stringify(restored.world));
  });

  it('repairs a stationary stranded car without inventing a new order', () => {
    const sim = fixture(), w = sim.world, driver = w.people[w.teams[sim.playerGang.teamIds[0]].memberIds[0]];
    driver.inVehicle=true; clearDestination(driver);
    const saved = Sim.fromSave(copy(w)), fixed=saved.world.people[driver.id];
    expect(onRoad(saved.world,fixed.pos)).toBe(true); expect(fixed.dest).toBeNull(); expect(fixed.path).toEqual([]);
    expect(fixed.orderId).toBe(driver.orderId);
  });

  it('keeps a valid live route byte-for-byte on reload', () => {
    const sim=fixture(), w=sim.world, driver=w.people[w.teams[sim.playerGang.teamIds[0]].memberIds[0]];
    driver.inVehicle=true; driver.pos=roadPosition(w,driver.pos);
    setDestination(w,driver,{x:10,y:10}); stepPerson(driver,.2);
    const before=JSON.stringify(w); expect(JSON.stringify(Sim.fromSave(copy(w)).world)).toBe(before);
  });

  it('hides an office boss even when selected, without removing the boss from the simulation', () => {
    const sim=fixture(), boss=sim.world.people[sim.playerGang.bossId];
    const before=JSON.stringify(boss);
    expect(streetPersonVisible(boss,null)).toBe(false); expect(streetPersonVisible(boss,boss.id)).toBe(false);
    expect(JSON.stringify(boss)).toBe(before); expect(boss.buildingId).not.toBeNull();
    // An actual arrest/outing remains representable.
    expect(streetPersonVisible({...boss,status:'arrested'},null)).toBe(true);
    expect(streetPersonVisible({...boss,dest:{x:0,y:0}},null)).toBe(true);
  });
});
