import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { Sim } from '../src/sim/sim';

/**
 * Seed 1934, two headless weeks. 1.2.7 renamed the city, the papers, and the
 * parks, so the stored strings changed. The old hash was
 * cf5f6b54291137135ea45ec2fb66a5d5025e130798495cd9ecfa219b8bd4cb4d.
 *
 * 1.2.13 gives every person one fixed field order (a speed fix), so the raw
 * JSON lists the same values in a different key order. The raw hash went from
 * 12c150e7e5be1d35b52ebae02317c9efa0f57a79bb648def1defe7cb4dbbc16f to the one
 * below. The canonical hash sorts keys first, so it shows the world itself is
 * unchanged: 1.2.12 and 1.2.13 give the same canonical hash.
 *
 * 1.2.15 records the empty site and the "looking for work" tip as IDs on a
 * recruit order, so Auto Test can follow the tip. A two-week Friday that
 * includes an AI recruit order now lists those fields, and both hashes change.
 * The 1.2.15 walking work keeps this same canonical hash.
 *
 * 1.2.16 rolls recruits from the hood-generation types (a different random
 * draw for every hood), reprices empty land, charges running costs on closed
 * sites and lowers land value per crime, so both hashes change again.
 */
const TWO_WEEKS = '61c8cf1c6a78e0288affcc7d32a15b124e8de6a5c868e8596206fca635186185';
const TWO_WEEKS_CANONICAL = '291bd835eb247a23bee86f7db03d267695247d80264472ff69d26f917ec03e35';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : canonical(item)));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = canonical(item);
    }
    return out;
  }
  return value;
}

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
    const raw = JSON.stringify(sim.world);
    const hash = createHash('sha256').update(raw).digest('hex');
    const canon = createHash('sha256').update(JSON.stringify(canonical(JSON.parse(raw)))).digest('hex');
    expect(sim.world.week).toBe(3);
    expect(canon).toBe(TWO_WEEKS_CANONICAL);
    expect(hash).toBe(TWO_WEEKS);
  }, 120000);
});
