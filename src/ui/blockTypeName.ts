import type { WorldState } from '../sim/types';

/**
 * The name the original's organizer map shows for a block, in the small tag
 * it puts over the map while the left button is held on it.
 *
 * the original executable, traced 29 October 2026 (docs/audit/2026-10-29/map-hover/review.md):
 * 0x4EC3D0 switches on the cell's content id (block record +0x64, the city
 * generator's content, `Block.original.content` here) and prints one of these
 * names, nothing else: no coordinates, owner or site name. Content ids it does
 * not list (58 empty, 59..61, 71 and up) get no name.
 */
export function originalBlockTypeName(content: number): string | null {
  if (content <= 3 || content === 39) return 'Residential';
  if (content === 5 || (content >= 68 && content <= 70)) return 'Church';
  if (content >= 11 && content <= 14) return 'Industrial';
  if (content >= 15 && content <= 18) return 'Commercial';
  if (content >= 19 && content <= 24) return 'River';
  if ((content >= 25 && content <= 33) || (content >= 62 && content <= 67)) return 'Park';
  if (content >= 34 && content <= 37) return 'Tramway';
  return ORIGINAL_NAMES[content] ?? null;
}

const ORIGINAL_NAMES: Record<number, string> = {
  4: 'Radio Station', 6: 'Power Station', 7: 'Newspaper', 8: 'Water Works', 9: 'Docks', 10: 'Warehouse',
  38: 'Railroad Terminal', 40: 'Railroad bridge', 41: 'Tram crossing', 42: 'City Hall', 43: 'Hospital',
  44: 'Police Headquarters', 45: 'Labour Exchange', 46: 'Fire House', 47: 'US Post', 48: 'Museum',
  49: 'Department Store', 50: 'Bank', 51: 'Courthouse', 52: 'Public Baths', 53: 'Trade Union',
  54: 'F.B.I. Headquarters', 55: 'Hotel', 56: 'Orphanage', 57: 'School',
};

/** The original's names for the landmark building types, for cities without original content ids. */
const LANDMARK_NAMES: Record<string, string> = {
  church: 'Church', cityHall: 'City Hall', hospital: 'Hospital', policeHQ: 'Police Headquarters',
  labourExchange: 'Labour Exchange', firehouse: 'Fire House', usPost: 'US Post', museum: 'Museum',
  courthouse: 'Courthouse', publicBaths: 'Public Baths', fbiHQ: 'F.B.I. Headquarters', orphanage: 'Orphanage',
  school: 'School', powerPlant: 'Power Station', waterPlant: 'Water Works', railroad: 'Railroad Terminal',
  radioStation: 'Radio Station', newspaper: 'Newspaper', docks: 'Docks',
};

/**
 * The block-type name for the city cell at gx, gy. The original city reads the
 * cell's own content id, as 0x4EC3D0 does. The remake's other cities have no
 * content ids, so their blocks are named from the same list by use, landmark
 * and district.
 */
export function blockTypeName(w: WorldState, gx: number, gy: number): string | null {
  if (gx < 0 || gy < 0 || gx >= w.gridW || gy >= w.gridH) return null;
  const cell = w.blocks[gy * w.gridW + gx];
  if (!cell) return null;
  if (cell.original) return originalBlockTypeName(cell.original.content);
  const blk = cell.layout?.mergedInto != null ? w.blocks[cell.layout.mergedInto] : cell;
  const layout = blk.layout;
  if (layout?.landmark && LANDMARK_NAMES[layout.landmark]) return LANDMARK_NAMES[layout.landmark];
  if (layout?.use === 'park' || layout?.use === 'plaza') return 'Park';
  if (layout?.use === 'water') return 'River';
  if (layout?.use === 'avenue') return 'Tramway';
  if (blk.district === 'residential') return 'Residential';
  if (blk.district === 'commercial' || blk.district === 'downtown') return 'Commercial';
  if (blk.district === 'industrial') return 'Industrial';
  return null;
}
