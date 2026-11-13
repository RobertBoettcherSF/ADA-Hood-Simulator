import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import thickened from '../src/data/icons-small-index.json';
import { iconUrl, SMALL_ICON_PX } from '../src/ui/art';

describe('thickened small icons (A23-S03)', () => {
  it('has a 32 px variant for every listed thin glyph, and none for the rest', () => {
    expect(thickened.length).toBeGreaterThan(10);
    for (const name of thickened) {
      expect(existsSync(`public/art/icons-small/${name}.png`)).toBe(true);
      expect(existsSync(`public/art/icons/${name}.png`)).toBe(true);
    }
  });

  it('uses the thickened glyph only at small sizes and only where one exists', () => {
    expect(iconUrl('weapons/rifle', 16)).toBe('/art/icons-small/weapons/rifle.png');
    expect(iconUrl('weapons/rifle', SMALL_ICON_PX + 1)).toBe('/art/icons/weapons/rifle.png');
    expect(iconUrl('weapons/rifle')).toBe('/art/icons/weapons/rifle.png');
    expect(iconUrl('weapons/pistol', 16)).toBe('/art/icons/weapons/pistol.png');
  });
});
