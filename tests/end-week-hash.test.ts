import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { Sim } from '../src/sim/sim';

/**
 * Seed 1934, two headless weeks. 1.2.7 renamed the city, the papers, and the
 * parks, so the stored strings changed. The old hash was
 * cf5f6b54291137135ea45ec2fb66a5d5025e130798495cd9ecfa219b8bd4cb4d.
 */
const TWO_WEEKS = '12c150e7e5be1d35b52ebae02317c9efa0f57a79bb648def1defe7cb4dbbc16f';

describe('headless End Week', () => {
  it('matches the 1.2.7 Friday for seed 1934 over two weeks', () => {
    const sim = new Sim({
      ...defaultGameOptions(),
      seed: 1934,
      citySize: 40,
      cityHeight: 32,
      playerName: 'Otto Keller',
      playerNickname: 'Kraut',
      playerHeritage: 'german',
      era: '1932',
    });
    sim.launchWeek();
    sim.finishWeek();
    sim.launchWeek();
    sim.finishWeek();
    const hash = createHash('sha256').update(JSON.stringify(sim.world)).digest('hex');
    expect(sim.world.week).toBe(3);
    expect(hash).toBe(TWO_WEEKS);
  }, 120000);
});
