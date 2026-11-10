import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { bossFace, HERITAGES, heritageOfSurname, sitterCount, sitterFromSeed, sitterTraits } from '../src/sim/heritage';
import { GANG_SURNAMES } from '../src/sim/data/names';
import { Sim } from '../src/sim/sim';

describe('boss heritage (the original\'s nationality and face traits)', () => {
  it('names a delivered painting for every heritage and sitter', () => {
    for (const h of HERITAGES) for (const female of [false, true]) for (let i = 0; i < sitterCount(female); i++) {
      const face = bossFace(h.id, female, i);
      expect(existsSync(`public/art/portraits/nationality/${face}.png`), face).toBe(true);
      expect(sitterTraits(female, i)).toBeTruthy();
    }
    expect(bossFace('italian', false, 6)).toBe('italian/m-07');
    expect(bossFace('irish', true, 7)).toBe('irish/f-02');
    expect(bossFace('greek', false, -1)).toBe('greek/m-12');
  });

  it('gives the player the chosen sitter and rivals faces from their surnames', () => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10, playerHeritage: 'greek', playerSitter: 3 });
    expect(sim.world.people[sim.playerGang.bossId].face).toBe('greek/m-04');
    for (const gang of Object.values(sim.world.gangs)) {
      if (gang.isPlayer) continue;
      const boss = sim.world.people[gang.bossId], surname = gang.name.replace(/^The | Gang$/g, '');
      expect(boss.face?.split('/')[0] ?? null).toBe(heritageOfSurname(surname));
    }
  });

  it('has a face for every rival gang surname', () => {
    for (const surname of GANG_SURNAMES) expect(heritageOfSurname(surname), surname).not.toBeNull();
  });

  it('does not disturb the generated city', () => {
    const plain = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10 });
    const chosen = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10, playerHeritage: 'irish' });
    const strip = (s: Sim) => JSON.stringify({ ...s.world, options: null,
      people: Object.values(s.world.people).map(p => ({ ...p, face: undefined, name: '' })),
      teams: Object.fromEntries(Object.entries(s.world.teams).map(([id, team]) => [id, { ...team, name: '' }])) });
    expect(strip(chosen)).toBe(strip(plain));
  });

  it('rolls stable sitters from a seed', () => {
    expect(sitterFromSeed(12)).toBe(sitterFromSeed(12));
    expect(new Set(Array.from({ length: 60 }, (_, i) => sitterFromSeed(i) % 12)).size).toBeGreaterThan(8);
  });
});
