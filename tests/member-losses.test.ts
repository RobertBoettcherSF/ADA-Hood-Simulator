import { describe, expect, it } from 'vitest';
import { lostLines } from '../src/app/autoTest';
import { defaultGameOptions } from '../src/app/newGame';
import { sackPerson } from '../src/sim/api';
import { killPerson } from '../src/sim/execution';
import { memberLosses } from '../src/sim/memberLosses';
import { Sim } from '../src/sim/sim';
import { gangMembers } from '../src/sim/world';

describe('men lost are logged with cause and culprit', () => {
  it('a killing names the gang, a sacking says so, and Auto Test writes LOST lines', () => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 1932, citySize: 8, cityLayout: 'classic', era: '1932' });
    const w = sim.world, gang = sim.playerGang;
    const rival = Object.values(w.gangs).find((g) => !g.isPlayer)!;
    const before = new Map(gangMembers(w, gang).map((p) => [p.id, p.status] as const));
    const hoods = gangMembers(w, gang).filter((p) => p.role === 'hood');
    killPerson(w, hoods[0], `gunned down by ${rival.name}`);
    expect(sackPerson(w, gang.id, hoods[1].id).ok).toBe(true);
    const losses = memberLosses(w, gang.id);
    expect(losses.map((l) => l.by)).toEqual([rival.name, gang.name]);
    const lines = lostLines(w, gang.id, before, w.week);
    expect(lines.map((l) => l.text)).toEqual([
      `LOST ${hoods[0].name} (hood) — gunned down by ${rival.name} [${rival.name}]`,
      `LOST ${hoods[1].name} (hood) — sacked [${gang.name}]`,
    ].sort((a, b) => lines.findIndex((l) => l.text === a) - lines.findIndex((l) => l.text === b)));
    expect(lines.map((l) => l.key).sort()).toEqual([`killed by ${rival.name}`, `sacked by ${gang.name}`].sort());
  });
});
