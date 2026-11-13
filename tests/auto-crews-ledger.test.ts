import { describe, expect, it } from 'vitest';
import { crewNameFor, crewNames } from '../src/app/autoActions';
import { ledgerKey, noteLedger, targetsThatFit } from '../src/app/autoTest';

describe('crew names', () => {
  it('names crews after the lieutenant and the job', () => {
    expect(crewNameFor("Marco's Crew", 'collect', 'Eddie Chin')).toBe("Eddie's Protection");
    expect(crewNameFor('Collect Protection 2', 'intimidation', 'Eddie Chin')).toBe("Eddie's Intimidation");
    expect(crewNameFor("Eddie's Protection", 'muscle', 'Gina Vanetti')).toBe("Gina's Strike");
    expect(crewNameFor("Gina's Crew", 'scout', 'Gina Vanetti')).toBe("Gina's Scouting");
    expect(crewNameFor("Gina's Crew", 'recruit', 'Gina Vanetti')).toBe("Gina's Recruiting");
    expect(crewNameFor("Gina's Crew", 'business', 'Gina Vanetti')).toBe('Business');
  });
  it('leaves a crew the player renamed alone', () => {
    expect(crewNameFor('The Night Shift', 'collect', 'Eddie Chin')).toBeNull();
  });
  it('numbers a name only when two crews would share it', () => {
    const names = crewNames([
      { id: 1, name: "Eddie's Crew", role: 'collect', lieutenantName: 'Eddie Chin' },
      { id: 2, name: "Eddie's Crew", role: 'collect', lieutenantName: 'Eddie Ross' },
      { id: 3, name: "Gina's Crew", role: 'collect', lieutenantName: 'Gina Vanetti' },
      { id: 4, name: 'Night Shift', role: 'intimidation', lieutenantName: 'Rosa Ricci' },
    ]);
    expect(names.get(1)).toBe("Eddie's Protection");
    expect(names.get(2)).toBe("Eddie's Protection 2");
    expect(names.get(3)).toBe("Gina's Protection");
    expect(names.has(4)).toBe(false);
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

import { heatLevel } from '../src/app/autoTest';
describe('heat', () => {
  it('eases past 30, lies low past 50, and counts a fast rise as a level hotter', () => {
    expect(heatLevel(17, 0)).toBe(1);
    expect(heatLevel(10, 5)).toBe(0);
    expect(heatLevel(31, 17)).toBe(1);
    expect(heatLevel(47, 31)).toBe(2);
    expect(heatLevel(52, 50)).toBe(2);
    expect(heatLevel(29, 25)).toBe(0);
  });
});
