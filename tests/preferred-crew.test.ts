import { describe, expect, it } from 'vitest';
import type { Person, Skills } from '../src/sim/types';
import { preferredCrewLabel, preferredCrewOrder, skillStars } from '../src/ui/preferredCrew';

function person(name: string, business: number, organization: number): Pick<Person, 'name' | 'skills'> {
  return { name, skills: { business, organization } as Skills };
}

describe('preferred crew list', () => {
  it('writes star marks for the skills a job uses', () => {
    expect(skillStars(3)).toBe('★★★☆☆');
    expect(skillStars(3.5)).toBe('★★★½☆');
    const hood = person('Otto Weber', 3, 2);
    expect(preferredCrewLabel(hood, ['business'])).toBe('Otto Weber ★★★☆☆ Business');
    expect(preferredCrewLabel(hood, ['business', 'organization'])).toBe('Otto Weber ★★★☆☆ Business ★★☆☆☆ Organization');
  });

  it('sorts the best relevant hood first', () => {
    const weak = person('Ada Low', 1, 1);
    const strong = person('Otto Weber', 4, 3);
    const mid = person('Bea Mid', 2, 2);
    expect(preferredCrewOrder([weak, mid, strong], ['business', 'organization']).map((p) => p.name)).toEqual([
      'Otto Weber',
      'Bea Mid',
      'Ada Low',
    ]);
  });
});
