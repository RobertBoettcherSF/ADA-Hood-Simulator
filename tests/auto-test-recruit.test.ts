import { describe, expect, it } from 'vitest';
import {
  chooseHoodRecruitSites,
  EMPTY_VENUE_STREAK,
  newRecruitMemory,
  rememberRecruitResults,
} from '../src/app/autoTest';

describe('Auto Test recruiting sites (1.2.25 rules)', () => {
  it('puts last week\'s productive venue first, then a rumour, then the rest', () => {
    const cafe = { id: 1 };
    const hall = { id: 2 };
    const bar = { id: 3 };
    const memory = newRecruitMemory();
    rememberRecruitResults([{ type: 'recruit', recruitHintId: hall.id, emptyRecruitIds: [cafe.id], targetBuildingIds: [cafe.id, bar.id] }], memory);
    expect(chooseHoodRecruitSites([cafe, hall, bar], memory).map((s) => s.id)).toEqual([bar.id, hall.id, cafe.id]);
  });

  it('skips a venue empty three weeks running, with no comeback and no fallback to every venue', () => {
    const cafe = { id: 1 };
    const hall = { id: 2 };
    const memory = newRecruitMemory();
    for (let i = 0; i < EMPTY_VENUE_STREAK; i++) rememberRecruitResults([{ type: 'recruit', emptyRecruitIds: [cafe.id, hall.id] }], memory);
    expect(chooseHoodRecruitSites([cafe, hall], memory)).toEqual([]);
    // Weeks pass with no rumour: still skipped.
    rememberRecruitResults([], memory);
    expect(chooseHoodRecruitSites([cafe, hall], memory)).toEqual([]);
  });

  it('tries a skipped venue again once a rumour mentions it', () => {
    const cafe = { id: 1 };
    const hall = { id: 2 };
    const memory = newRecruitMemory();
    for (let i = 0; i < EMPTY_VENUE_STREAK; i++) rememberRecruitResults([{ type: 'recruit', emptyRecruitIds: [cafe.id] }], memory);
    expect(chooseHoodRecruitSites([cafe, hall], memory).map((s) => s.id)).toEqual([hall.id]);
    rememberRecruitResults([{ type: 'recruit', recruitHintId: cafe.id }], memory);
    expect(chooseHoodRecruitSites([cafe, hall], memory).map((s) => s.id)).toEqual([cafe.id, hall.id]);
  });
});
