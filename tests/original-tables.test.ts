import { describe, expect, it } from 'vitest';
import { emptyLandPrice, illegalSaturationFactor, landValueLoss, marketShareFactor, runningCost } from '../src/sim/originalTables';
import { coverQuality } from '../src/sim/data/buildings';

describe('economy tables', () => {
  it('market share falls with each same-type shop and never rises', () => {
    expect(marketShareFactor(1)).toBe(1);
    expect(marketShareFactor(2)).toBe(0.95);
    let last = 1;
    for (let n = 1; n <= 45; n++) { const f = marketShareFactor(n); expect(f).toBeLessThanOrEqual(last); last = f; }
    expect(marketShareFactor(40)).toBe(0.37);
  });
  it('illegal trades saturate', () => {
    expect(illegalSaturationFactor('speakeasy', 4)).toBe(1);
    expect(illegalSaturationFactor('speakeasy', 1)).toBeCloseTo(270 / 240);
    expect(illegalSaturationFactor('casino', 1)).toBe(1.5);
    expect(illegalSaturationFactor('cardGames', 20)).toBeCloseTo(40 / 240);
    expect(illegalSaturationFactor('counterfeitPress', 30)).toBe(1);
  });
  it('running costs, land prices and land loss', () => {
    expect(runningCost('small', 0)).toBe(40);
    expect(runningCost('large', 100)).toBe(1700);
    expect(emptyLandPrice(0)).toBe(40);
    expect(emptyLandPrice(100)).toBe(640);
    expect(landValueLoss('bomb')).toBeCloseTo(12.55, 1);
    expect(landValueLoss('extort')).toBe(0);
  });
  it('front fit grades', () => {
    expect(coverQuality('speakeasy', 'cafe')).toBe(0.95);
    expect(coverQuality('office', 'bakers')).toBe(0.95);
  });
});
