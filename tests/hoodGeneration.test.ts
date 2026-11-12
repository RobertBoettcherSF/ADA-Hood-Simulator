import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';
import { HOOD_TYPES, generateHoodSkills, isBusinessHood, starsFromByte } from '../src/sim/hoodGeneration';

describe('hood generation table', () => {
  it('has 18 types with weight 140', () => {
    expect(HOOD_TYPES).toHaveLength(18);
    expect(HOOD_TYPES.reduce((a, t) => a + t.weight, 0)).toBe(140);
  });
  it('maps bytes to half stars', () => {
    expect(starsFromByte('business', 0)).toBe(0.5);
    expect(starsFromByte('business', 63)).toBe(5);
    expect(starsFromByte('intelligence', 255)).toBe(5);
  });
  it('business types are business hoods and arson is not over-represented', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 50; i++) expect(isBusinessHood(generateHoodSkills(rng, { business: true }))).toBe(true);
    let arson = 0, business = 0;
    for (let i = 0; i < 4000; i++) {
      const s = generateHoodSkills(rng);
      if (s.arson >= 3) arson++;
      if (s.business >= 3) business++;
    }
    expect(business).toBeGreaterThan(arson * 0.4);
  });
});
