import { describe, expect, it, vi } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { BUILDING_BY_ID } from '../src/sim/data/buildings';
import { Sim } from '../src/sim/sim';
import { closeInspect, inspectFacts, inspectPlacement, openInspect, PressWatch, showInspect } from '../src/ui/inspectCard';

function city(): Sim {
  return new Sim({ ...defaultGameOptions(), seed: 1934, citySize: 8, cityLayout: 'classic', era: '1932' });
}

describe('inspect card', () => {
  it('opens from a long press on a phone and not from a mouse hold', () => {
    vi.useFakeTimers();
    const watch = new PressWatch();
    let opened = 0;
    watch.arm({ button: 0, pointerType: 'touch', clientX: 1, clientY: 2 }, () => { opened += 1; });
    vi.advanceTimersByTime(549);
    expect(opened).toBe(0);
    vi.advanceTimersByTime(1);
    expect(opened).toBe(1);
    expect(watch.finish()).toBe(true);
    watch.arm({ button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 }, () => { opened += 1; });
    vi.advanceTimersByTime(2000);
    expect(opened).toBe(1);
    vi.useRealTimers();
  });

  it('names a building, its owner, the weekly take, and who is inside', () => {
    const sim = city();
    const w = sim.world;
    const gang = sim.playerGang;
    const site = Object.values(w.buildings).find((b) => b.cls === 'tenement' && b.state === 'trading')!;
    site.ownerGangId = gang.id;
    site.knowledge[gang.id] = 4;
    site.protection = null;
    const resident = Object.values(w.people).find((p) => p.status === 'active')!;
    resident.buildingId = site.id;
    const rent = inspectFacts(w, gang.id, { buildingId: site.id, blockId: site.blockId, personId: null, point: { x: 0, y: 0 } });
    expect(rent?.rows.find((row) => row.label === 'Rent')?.value).toBe(`$${BUILDING_BY_ID[site.typeId].profit}/wk`);
    expect(rent?.rows.find((row) => row.label === 'Inside')?.value).toContain(resident.name);

    site.protection = { gangId: gang.id, weekly: 180, base: 180, refusing: false, grievance: 0 };
    const protectedSite = inspectFacts(w, gang.id, { buildingId: site.id, blockId: site.blockId, personId: null, point: { x: 0, y: 0 } });
    expect(protectedSite?.title).toBe(BUILDING_BY_ID[site.typeId].name);
    expect(protectedSite?.rows).toEqual(expect.arrayContaining([
      { label: 'Business', value: BUILDING_BY_ID[site.typeId].name },
      { label: 'Owner', value: gang.name },
      { label: 'Protection', value: `$180/wk to ${gang.name}` },
    ]));
  });

  it('names a person, their gang, and the order they are carrying out', () => {
    const sim = city();
    const person = sim.world.people[sim.playerGang.bossId];
    person.streetOrder = { type: 'goTo', targetPersonId: null, pos: { x: 1, y: 1 } };
    const facts = inspectFacts(sim.world, sim.playerGang.id, { buildingId: null, blockId: null, personId: person.id, point: person.pos });
    expect(facts?.title).toBe(person.name);
    expect(facts?.rows).toEqual([
      { label: 'Gang', value: sim.playerGang.name },
      { label: 'Order', value: 'Go to' },
    ]);
  });

  it('does not name a racket the player has not found', () => {
    const sim = city();
    const gang = sim.playerGang;
    const site = Object.values(sim.world.buildings).find((b) => b.cls === 'illegal' && b.ownerGangId !== gang.id)!;
    site.knowledge[gang.id] = 0;
    const facts = inspectFacts(sim.world, gang.id, { buildingId: site.id, blockId: site.blockId, personId: null, point: { x: 0, y: 0 } });
    expect(facts?.rows.find((row) => row.label === 'Business')?.value).toBe('Unknown');
    expect(facts?.rows.find((row) => row.label === 'Owner')?.value).toBe('Unknown');
    expect(facts?.title).not.toBe(BUILDING_BY_ID[site.typeId].name);
  });

  it('reads the lot under a ground point, and a street click puts the card away', () => {
    const sim = city();
    const site = Object.values(sim.world.buildings).find((b) => b.ownerGangId === sim.playerGang.id)!;
    const lot = sim.world.lots[site.lotId];
    const facts = inspectFacts(sim.world, sim.playerGang.id, { buildingId: null, blockId: site.blockId, personId: null, point: { ...lot.center } });
    expect(facts?.rows.find((row) => row.label === 'Business')?.value).toBe(BUILDING_BY_ID[site.typeId].name);

    openInspect(4, 4, { buildingId: site.id, blockId: site.blockId, personId: null, point: lot.center });
    showInspect(8, 8, sim.world, sim.playerGang.id, { buildingId: null, blockId: null, personId: null, point: { x: -20, y: -20 } });
    expect(inspectPlacement()).toBeNull();
    closeInspect();
  });
});
