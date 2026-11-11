import { describe, expect, it } from 'vitest';
import {
  chooseHoodRecruitSites,
  EMPTY_VENUE_SKIP_WEEKS,
  newRecruitMemory,
  rememberRecruitResults,
} from '../src/app/autoTest';

describe('Auto Test recruiting sites', () => {
  it('puts last week\'s "looking for work" tip first and skips a recently empty venue', () => {
    const cafe = { id: 1, name: 'Cafe' };
    const hall = { id: 2, name: 'Pool Hall' };
    const bar = { id: 3, name: 'Bar' };
    const memory = newRecruitMemory();
    rememberRecruitResults(
      [{ type: 'recruit', recruitHintId: hall.id, emptyRecruitIds: [cafe.id] }],
      2,
      memory,
    );
    expect(memory.hintIds).toEqual([hall.id]);
    expect(memory.emptyUntil.get(cafe.id)).toBe(2 + EMPTY_VENUE_SKIP_WEEKS);

    const ranked = chooseHoodRecruitSites([cafe, hall, bar], memory, 3);
    expect(ranked.map((site) => site.id)).toEqual([hall.id, bar.id]);
  });

  it('tries every venue again once the skip expires', () => {
    const cafe = { id: 1 };
    const hall = { id: 2 };
    const memory = newRecruitMemory();
    rememberRecruitResults(
      [{ type: 'recruit', recruitHintId: hall.id, emptyRecruitIds: [cafe.id] }],
      2,
      memory,
    );
    const stillSkipping = chooseHoodRecruitSites([cafe, hall], memory, 2 + EMPTY_VENUE_SKIP_WEEKS - 1);
    expect(stillSkipping.map((site) => site.id)).toEqual([hall.id]);
    const expired = chooseHoodRecruitSites([cafe, hall], memory, 2 + EMPTY_VENUE_SKIP_WEEKS);
    expect(expired.map((site) => site.id)).toEqual([hall.id, cafe.id]);
  });

  it('falls back to the original list if every venue is still cooling down', () => {
    const cafe = { id: 1 };
    const hall = { id: 2 };
    const memory = newRecruitMemory();
    rememberRecruitResults(
      [{ type: 'recruit', emptyRecruitIds: [cafe.id, hall.id] }],
      2,
      memory,
    );
    const ranked = chooseHoodRecruitSites([cafe, hall], memory, 3);
    expect(ranked.map((site) => site.id)).toEqual([cafe.id, hall.id]);
  });
});
