import { describe, expect, it } from 'vitest';
import { crewNameFor } from '../src/app/autoActions';
import { ledgerKey, noteLedger, targetsThatFit } from '../src/app/autoTest';

describe('crew names', () => {
  it('names default and auto-named crews after their job, numbering extra collectors', () => {
    expect(crewNameFor("Marco's Crew", 'collect', 1)).toBe('Collect Protection');
    expect(crewNameFor('Collect Protection', 'collect', 2)).toBe('Collect Protection 2');
    expect(crewNameFor('Extortion', 'muscle', 1)).toBe('Strike');
    expect(crewNameFor("Gina's Crew", 'scout', 1)).toBe('Scouting');
    expect(crewNameFor("Gina's Crew", 'recruit', 1)).toBe('Recruiting');
  });
  it('leaves a crew the player renamed alone', () => {
    expect(crewNameFor('The Night Shift', 'collect', 1)).toBeNull();
  });
});

describe('time ledger', () => {
  it('averages minutes per target by order type and car', () => {
    const ledger: Record<string, number> = {};
    const key = ledgerKey('collectProtection', true);
    expect(key).toBe('collectProtection|car');
    noteLedger(ledger, key, 100);
    expect(ledger[key]).toBe(100);
    noteLedger(ledger, key, 200);
    expect(ledger[key]).toBe(130);
    noteLedger(ledger, key, Number.NaN);
    expect(ledger[key]).toBe(130);
  });
  it('fits orders to the time a crew has left', () => {
    const ledger = { 'extort|foot': 120 };
    expect(targetsThatFit(ledger, 'extort|foot', 5, 400)).toBe(3);
    expect(targetsThatFit(ledger, 'extort|foot', 5, 60)).toBe(0);
    expect(targetsThatFit(ledger, 'recruit|foot', 2, 10)).toBe(2);
  });
});
