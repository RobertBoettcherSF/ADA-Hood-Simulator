import { describe, expect, it } from 'vitest';
import {
  chooseHoodRecruitSites,
  EMPTY_VENUE_SKIP_WEEKS,
  newRecruitMemory,
  rememberRecruitResults,
} from '../src/app/autoTest';

describe('Auto Test recruiting sites', () => {
  it('puts last week\'s "looking for work" tip first and skips a venue empty three weeks running', () => {
    const cafe = { id: 1, name: 'Cafe' };
    const hall = { id: 2, name: 'Pool Hall' };
    const bar = { id: 3, name: 'Bar' };
    const memory = newRecruitMemory();
    for (const week of [0, 1, 2]) rememberRecruitResults(
      [{ type: 'recruit', recruitHintId: hall.id, emptyRecruitIds: [cafe.id] }],
      week,
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
    for (const week of [0, 1, 2]) rememberRecruitResults(
      [{ type: 'recruit', recruitHintId: hall.id, emptyRecruitIds: [cafe.id] }],
      week,
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
    for (const week of [0, 1, 2]) rememberRecruitResults(
      [{ type: 'recruit', emptyRecruitIds: [cafe.id, hall.id] }],
      week,
      memory,
    );
    const ranked = chooseHoodRecruitSites([cafe, hall], memory, 3);
    expect(ranked.map((site) => site.id)).toEqual([cafe.id, hall.id]);
  });

  it('keeps an empty venue for two weeks, puts last week\'s productive venue first, and follows a rumour to a skipped one', () => {
    const cafe = { id: 1 };
    const hall = { id: 2 };
    const bar = { id: 3 };
    const memory = newRecruitMemory();
    rememberRecruitResults([{ type: 'recruit', emptyRecruitIds: [cafe.id], targetBuildingIds: [cafe.id, bar.id] }], 1, memory);
    expect(chooseHoodRecruitSites([cafe, hall, bar], memory, 2).map((s) => s.id)).toEqual([bar.id, cafe.id, hall.id]);
    for (const week of [2, 3]) rememberRecruitResults([{ type: 'recruit', emptyRecruitIds: [cafe.id] }], week, memory);
    expect(chooseHoodRecruitSites([cafe, hall, bar], memory, 4).map((s) => s.id)).toEqual([hall.id, bar.id]);
    rememberRecruitResults([{ type: 'recruit', recruitHintId: cafe.id }], 4, memory);
    expect(chooseHoodRecruitSites([cafe, hall, bar], memory, 5)[0].id).toBe(cafe.id);
  });
});
