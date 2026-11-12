import { describe, expect, it } from 'vitest';
import { chooseGoal, goalScores, GOAL_POLICY } from '../src/app/autoGoals';
import { defaultActionRanks, RANK_MIN } from '../src/app/autoActions';
import { playAutoWeek, streetHeat, STREET_HEAT_REST } from '../src/app/autoTest';
import { defaultStrategy } from '../src/app/strategy';
import { defaultGameOptions } from '../src/app/newGame';
import { issueOrder, nearTerritory, BUY_REACH_BLOCKS } from '../src/sim/api';
import { allBuildings } from '../src/sim/world';
import { purchasablePremisesType } from '../src/sim/premises';
import { CITY_SIZE_PRESETS, citySizePreset, generatedCityDimensions } from '../src/sim/newGameValidation';
import { HERITAGES, heritageName } from '../src/sim/heritage';
import { Rng } from '../src/sim/rng';
import { Sim } from '../src/sim/sim';

const city = (mode: 'normal' | 'wealth' | 'territory' | 'power' = 'normal') =>
  new Sim({ ...defaultGameOptions(), seed: 1932, citySize: 8, cityLayout: 'classic', era: '1932', mode, territoryTarget: 40 });

describe('1.2.20 Auto Test and rules', () => {
  it('plays for the short game\'s own race', () => {
    for (const mode of ['wealth', 'territory', 'power'] as const) {
      const sim = city(mode);
      const scores = goalScores(sim.world, sim.playerGang);
      expect(scores.office).toBe(0);
      expect(scores.straight).toBe(0);
      expect(chooseGoal(sim.world, sim.playerGang, 'eliminate', true, [mode]).goal).toBe(mode);
      expect(GOAL_POLICY[mode]).toBeTruthy();
    }
    expect(goalScores(city('wealth').world, city('wealth').playerGang).wealth).toBeGreaterThan(0);
  });

  it('rests a man before the police arrest line', () => {
    expect(streetHeat(20, -40)).toBeGreaterThanOrEqual(STREET_HEAT_REST);
    expect(streetHeat(20, 0)).toBeLessThan(STREET_HEAT_REST);
  });

  it('keeps the FBI strike rare and low-ranked', () => {
    expect(defaultActionRanks().strikeFbi).toBe(RANK_MIN);
  });

  it('buys premises anywhere in the city', () => {
    const sim = city(), w = sim.world, gang = sim.playerGang, team = w.teams[gang.teamIds[0]];
    gang.cash = 1_000_000;
    const far = allBuildings(w).find((b) => b.ownerGangId == null && b.state === 'trading' && purchasablePremisesType(b) &&
      !nearTerritory(w, gang.id, b.blockId, BUY_REACH_BLOCKS));
    if (!far) return;
    const result = issueOrder(w, gang.id, { teamId: team.id, type: 'buyPremises', buildingIds: [far.id] });
    if (!result.ok) expect(result.error).not.toMatch(/too far/i);
  });

  it('offers Small, Standard and Large cities', () => {
    expect(generatedCityDimensions({ citySize: 44, cityHeight: 35 })).toEqual({ w: 44, h: 35 });
    expect(generatedCityDimensions({ citySize: 36, cityHeight: 28 })).toEqual({ w: 36, h: 28 });
    expect(citySizePreset({ citySize: 40, cityHeight: 32 })).toBe('standard');
    expect(Object.keys(CITY_SIZE_PRESETS)).toEqual(['small', 'standard', 'large']);
  });

  it('names hoods with more variety', () => {
    const rng = new Rng(5);
    for (const h of HERITAGES) {
      const names = new Set(Array.from({ length: 40 }, () => heritageName(rng, false, h.id)));
      expect(names.size).toBeGreaterThanOrEqual(25);
    }
  });

  it('keeps the lawyer and accountant off crews and the street', () => {
    const sim = city(), w = sim.world, gang = sim.playerGang;
    for (let week = 0; week < 6; week++) {
      playAutoWeek(sim, 7, defaultStrategy());
      for (const id of [gang.lawyerId, gang.accountantId]) {
        const p = id == null ? undefined : w.people[id];
        if (!p) continue;
        expect(p.teamId ?? null).toBeNull();
        expect(gang.poolIds).not.toContain(p.id);
        expect(p.streetOrder).toBeNull();
      }
      sim.launchWeek(); sim.finishWeek();
    }
  }, 300000);
});
