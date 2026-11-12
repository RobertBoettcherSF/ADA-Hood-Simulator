import { describe, expect, it } from 'vitest';
import { defaultGameOptions, newCampaignOptions } from '../src/app/newGame';
import { SCENARIOS, applyScenario } from '../src/app/scenarios';
import { TUTORIALS, applyTutorial } from '../src/app/tutorials';
import { createWorld } from '../src/sim/citygen';
import { activeBlocks, streetGraph, streetRouteNodes } from '../src/sim/cityLayout';
import { CELL } from '../src/sim/constants';
import { generatedCityDimensions, isOriginalCity, ORIGINAL_CITY, reconcileTerritorySetup,
  territorySetupMaximum } from '../src/sim/newGameValidation';
import { validateSaveWorld } from '../src/sim/saveSchema';
import { Sim } from '../src/sim/sim';

const original = () => ({ ...newCampaignOptions(), seed: 4032 });
const count = (w: ReturnType<typeof createWorld>['world'], role: string) =>
  Object.values(w.people).filter(p => p.role === role).length;

describe('original 40 × 32 city grid', () => {
  it('offers the original grid first while the tool baseline stays compact', () => {
    expect(isOriginalCity(newCampaignOptions())).toBe(true);
    expect(generatedCityDimensions(newCampaignOptions())).toEqual({ w: 40, h: 32 });
    expect(isOriginalCity(defaultGameOptions())).toBe(false);
    expect(generatedCityDimensions(defaultGameOptions())).toEqual({ w: 14, h: 14 });
  });

  it('generates a rectangular 40 × 32 world with connected streets', () => {
    const { world: w } = createWorld(original());
    expect([w.gridW, w.gridH]).toEqual([ORIGINAL_CITY.w, ORIGINAL_CITY.h]);
    expect(w.blocks).toHaveLength(1280);
    for (const b of w.blocks) expect(w.blocks[b.gy * w.gridW + b.gx]).toBe(b);
    const g = streetGraph(w);
    expect(g.points).toHaveLength(41 * 33);
    // Opposite corners of a wide, short city must still be joined.
    const route = streetRouteNodes(w, { x: 0, y: 0 }, { x: w.gridW * CELL, y: w.gridH * CELL });
    expect(route.at(-1)).toEqual({ x: w.gridW * CELL, y: w.gridH * CELL });
    for (const line of w.cityLayout!.tramLines)
      for (const p of line.points) {
        expect(p.x).toBeLessThanOrEqual(w.gridW * CELL);
        expect(p.y).toBeLessThanOrEqual(w.gridH * CELL);
      }
    // One newspaper in each of the four 20 × 16 quadrants.
    const papers = Object.values(w.buildings).filter(b => b.typeId === 'newspaper')
      .map(b => w.blocks[b.blockId]).map(b => (b.gx >= 20 ? 1 : 0) + (b.gy >= 16 ? 2 : 0));
    expect(new Set(papers)).toEqual(new Set([0, 1, 2, 3]));
    expect(activeBlocks(w).length).toBeGreaterThan(900);
  }, 120000);

  it('uses the original police total and the chosen street density (6,000 civilians)', () => {
    const { world: w } = createWorld(original());
    // Constants.xtx says 2,000; tripled to match the original's street density (playtest).
    expect(count(w, 'citizen')).toBe(6000);
    expect(count(w, 'police')).toBe(400);
  }, 120000);

  it('keeps compact square cities and their populations unchanged', () => {
    const { world: w } = createWorld({ ...defaultGameOptions(), seed: 4032 });
    expect([w.gridW, w.gridH]).toEqual([14, 14]);
    expect(count(w, 'citizen')).toBe(14 * 14 * 14);
    expect(count(w, 'police')).toBe(Math.round(14 * 14 * 0.22));
  });

  it('plays scenarios on the chosen city size and keeps lessons square (1.2.21)', () => {
    for (const scenario of SCENARIOS) {
      const selected = applyScenario(original(), scenario);
      expect(generatedCityDimensions(selected)).toEqual(generatedCityDimensions(original()));
      expect(selected.seed).toBe(scenario.options.seed);
    }
    for (const lesson of TUTORIALS) expect(applyTutorial(original(), lesson).cityHeight).toBeUndefined();
  });

  it('bounds the territory target by the manual 500-block slider in the 1,280-block city', () => {
    expect(territorySetupMaximum(original())).toBe(500);
    const adjusted = reconcileTerritorySetup({ ...original(), mode: 'territory', territoryTarget: 5000 }, 1280);
    expect(adjusted.territoryTarget).toBe(500);
  });

  it('plays a week and restores a saved original city', () => {
    const sim = new Sim(original());
    sim.launchWeek();
    sim.finishWeek();
    const saved = JSON.parse(JSON.stringify(sim.world));
    expect(() => validateSaveWorld(saved)).not.toThrow();
    const restored = Sim.fromSave(saved);
    expect([restored.world.gridW, restored.world.gridH]).toEqual([40, 32]);
    expect(restored.world.options.cityHeight).toBe(32);
    restored.launchWeek();
    restored.finishWeek();
    expect(restored.world.week).toBe(sim.world.week + 1);
  }, 900000);
});
