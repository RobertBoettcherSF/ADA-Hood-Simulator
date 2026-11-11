import { describe, expect, it } from 'vitest';
import { originalBlockTypeName } from '../src/ui/blockTypeName';

// 0x4EC3D0, the organizer map's block tag (docs/audit/2026-10-29/map-hover/review.md).
describe('organizer map block tag names', () => {
  it.each([
    [0, 'Residential'], [3, 'Residential'], [39, 'Residential'], [4, 'Radio Station'], [5, 'Church'],
    [6, 'Power Station'], [7, 'Newspaper'], [8, 'Water Works'], [9, 'Docks'], [10, 'Warehouse'],
    [11, 'Industrial'], [14, 'Industrial'], [15, 'Commercial'], [18, 'Commercial'], [19, 'River'], [24, 'River'],
    [25, 'Park'], [33, 'Park'], [62, 'Park'], [67, 'Park'], [34, 'Tramway'], [37, 'Tramway'],
    [38, 'Railroad Terminal'], [40, 'Railroad bridge'], [41, 'Tram crossing'], [42, 'City Hall'], [43, 'Hospital'],
    [44, 'Police Headquarters'], [45, 'Labour Exchange'], [46, 'Fire House'], [47, 'US Post'],
    [48, 'Museum'], [49, 'Department Store'], [50, 'Bank'], [51, 'Courthouse'], [52, 'Public Baths'],
    [53, 'Trade Union'], [54, 'F.B.I. Headquarters'], [55, 'Hotel'], [56, 'Orphanage'], [57, 'School'],
    [68, 'Church'], [70, 'Church'],
  ])('content %i is "%s"', (content, name) => {
    expect(originalBlockTypeName(content)).toBe(name);
  });

  it.each([58, 59, 60, 61, 71, 80])('content %i has no name', content => {
    expect(originalBlockTypeName(content)).toBeNull();
  });

  it('names the block type only: no coordinates', () => {
    for (let c = 0; c <= 80; c++) expect(originalBlockTypeName(c) ?? '').not.toMatch(/\d|block/i);
  });
});
