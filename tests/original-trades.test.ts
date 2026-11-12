import { describe, expect, it } from 'vitest';
import { BUILDING_BY_ID, ESTABLISHABLE_TYPES, frontFitGrade } from '../src/sim/data/buildings';
import { ORIGINAL_ECONOMICS } from '../src/sim/data/originalEconomics';
import { ORIGINAL_KIND_TYPES } from '../src/sim/data/originalKinds';
import { ORIGINAL_TRADES } from '../src/sim/data/originalTrades';
import { originalTradeFor } from '../src/sim/citygen';
import { runningClass } from '../src/sim/originalTables';

describe('original trades', () => {
  it('gives every original commercial and industrial trade its own type', () => {
    for (const k of ORIGINAL_KIND_TYPES) {
      const record = ORIGINAL_ECONOMICS[k.index];
      if (record.group !== 0 && record.group !== 1) continue;
      expect(k.exact, record.name).toBe(true);
    }
  });
  it('catalogues each new trade with income, cost, cover grades and a running-cost size', () => {
    expect(ORIGINAL_TRADES.length).toBeGreaterThan(100);
    for (const t of ORIGINAL_TRADES) {
      const type = BUILDING_BY_ID[t.id];
      expect(type.name).toBe(t.name);
      expect(type.profit).toBeGreaterThan(0);
      expect(type.cost).toBeGreaterThan(type.profit);
      expect(ESTABLISHABLE_TYPES).toContain(type);
      expect(frontFitGrade('office', t.id)).toBeDefined();
      expect(runningClass({ cls: t.cls } as never, type)).toBe(t.cls === 'industrial' ? 'industrial' : t.storeys >= 4 ? 'medium' : 'small');
    }
  });
  it('puts one plot in four of a module in an original trade, by hash', () => {
    let swapped = 0;
    for (let lot = 0; lot < 400; lot++) if (originalTradeFor('shops', 'residential', lot, 1932)) swapped++;
    expect(swapped).toBeGreaterThan(60);
    expect(swapped).toBeLessThan(140);
    expect(originalTradeFor('homes', 'residential', 3, 1932)).toBeUndefined();
    for (let lot = 0; lot < 200; lot++) {
      const id = originalTradeFor('shops', 'residential', lot, 7);
      if (id) expect(ORIGINAL_TRADES.find((t) => t.id === id)?.upmarket).toBeFalsy();
    }
  });
});
