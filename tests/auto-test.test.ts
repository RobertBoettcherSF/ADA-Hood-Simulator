import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { persistentBytes, persistentFiles } from '../src/app/assetSync';
import { runAutoTest, takeAutoTestStopped, toggleAutoTestStop } from '../src/app/autoTest';
import { memoryDiary, parseDiary } from '../src/app/diary';
import { defaultGameOptions } from '../src/app/newGame';
import { balanceAnomalies, defaultStrategy, planRun, plateauNote, playbookForNewCity, type Diary, type DiaryEntry } from '../src/app/strategy';
import type { AssetFile } from '../src/app/assetCache';
import { Sim } from '../src/sim/sim';

function smallCity(): Sim {
  return new Sim({ ...defaultGameOptions(), seed: 1932, citySize: 8, cityLayout: 'classic', era: '1932' });
}

describe('phone artwork copy', () => {
  it('keeps the phone copy to the phone-tier models only', () => {
    const files = JSON.parse(readFileSync('public/asset-manifest.json', 'utf8')).files as AssetFile[];
    const phone = persistentFiles(files, 'phone');
    expect(phone.every((file) => file.tier === 'phone')).toBe(true);
    expect(phone.some((file) => file.path.includes('/sculpt/'))).toBe(false);
    expect(phone.some((file) => file.path.startsWith('art/portraits/'))).toBe(false);
    expect(persistentBytes(files, 'phone')).toBeLessThan(8_000_000);
    expect(persistentBytes(files, 'phone')).toBeGreaterThan(1_000_000);
  });
});

describe('auto test', () => {
  it('stops after the week that is settling, and a second click keeps going', async () => {
    const book = memoryDiary();
    const stopped = new Sim({ ...defaultGameOptions(), seed: 7, citySize: 8, cityLayout: 'classic', era: '1932' });
    let calls = 0;
    const report = await runAutoTest(stopped, { weeks: 3, seed: 7, speed: 1, learn: false }, (current) => {
      calls += 1;
      if (calls === 1) {
        expect(toggleAutoTestStop()).toBe(true);
        expect(toggleAutoTestStop()).toBe(false);
        expect(toggleAutoTestStop()).toBe(true);
      }
      current.launchWeek();
      current.finishWeek();
    }, book.sink);
    expect(calls).toBe(1);
    expect(takeAutoTestStopped()).toBe(true);
    expect(report).toContain('Stopped after this week');
    expect(stopped.world.phase).toBe('planning');

    const kept = new Sim({ ...defaultGameOptions(), seed: 7, citySize: 8, cityLayout: 'classic', era: '1932' });
    let more = 0;
    await runAutoTest(kept, { weeks: 2, seed: 7, speed: 1, learn: false }, (current) => {
      more += 1;
      if (more === 1) { toggleAutoTestStop(); toggleAutoTestStop(); }
      current.launchWeek();
      current.finishWeek();
    }, book.sink);
    expect(more).toBe(2);
    expect(takeAutoTestStopped()).toBe(false);
  }, 120000);

  it('finishes two weeks on the small map and writes a report', async () => {
    const book = memoryDiary();
    const sim = smallCity();
    const report = await runAutoTest(sim, { weeks: 2, seed: 1932, speed: 4 }, (current) => {
      current.launchWeek();
      current.finishWeek();
    }, book.sink);
    expect(sim.world.week).toBe(3);
    expect(sim.world.phase === 'planning' || sim.world.phase === 'gameOver').toBe(true);
    expect(report).toContain('Strategy seed: 1932');
    expect(report).toContain('Timeline');
    expect(report).toContain('Week 2:');
    expect(report).toContain('Actions');
    expect(report).toContain('end-week');
    expect(report).toContain('Outcome');
    expect(report).toContain('Anomalies');
    expect(report).toContain('Plateau:');
    expect(report).toContain('normal opponents, normal economy, 8×8');
    expect(report).toContain('runs flat out');
  }, 120000);

  it('learns the second run from the first, and only inside the same settings', async () => {
    const book = memoryDiary();
    const finish = (current: Sim) => { current.launchWeek(); current.finishWeek(); };
    const first = smallCity();
    await runAutoTest(first, { weeks: 2, seed: 1932, speed: 4, learn: true }, finish, book.sink);
    const afterFirst = parseDiary(book.text() ?? '');
    expect(afterFirst.entries).toHaveLength(1);
    expect(afterFirst.entries[0].settings).toEqual({ opponents: 'normal', economy: 'normal', mapW: 8, mapH: 8 });
    const expected = planRun(afterFirst, afterFirst.entries[0].settings, 1932, true);

    const second = smallCity();
    const report = await runAutoTest(second, { weeks: 2, seed: 1932, speed: 4, learn: true }, finish, book.sink);
    const diary = parseDiary(book.text() ?? '');
    expect(diary.entries).toHaveLength(2);
    expect(diary.entries[1].strategy).toEqual(expected.strategy);
    expect(diary.entries[1].strategy).not.toEqual(diary.entries[0].strategy);
    expect(report).toContain('Changed vs last matching run');
    expect(report).toContain('Beat the previous best:');
    expect(playbookForNewCity(diary)).toBeNull();
  }, 180000);
});

describe('diary rules', () => {
  it('teaches rivals only from three default-campaign runs, and names a plateau', () => {
    const strategy = defaultStrategy();
    const entry = (score: number, mapW: number, mapH: number): DiaryEntry => ({
      at: 't', settings: { opponents: 'normal', economy: 'normal', mapW, mapH },
      seed: 1, weeks: 2, speed: 4, learn: true, strategy, changes: [], summary: [],
      score, outcome: 'still playing', beatBest: false, previousBest: null, anomalies: [],
    });
    const small: Diary = { version: 1, entries: [entry(10, 8, 8), entry(12, 8, 8), entry(9, 8, 8)] };
    expect(playbookForNewCity(small)).toBeNull();
    const ready: Diary = { version: 1, entries: [entry(10, 40, 32), entry(14, 40, 32), entry(11, 40, 32)] };
    expect(playbookForNewCity(ready)?.weights.hiring).toBe(strategy.weights.hiring);
    const flat = plateauNote([entry(10, 40, 32), entry(8, 40, 32), entry(7, 40, 32), entry(6, 40, 32)], ready.entries[0].settings);
    expect(flat).toContain('stayed 10');
    const moving = plateauNote([entry(10, 40, 32), entry(12, 40, 32), entry(11, 40, 32), entry(13, 40, 32)], ready.entries[0].settings);
    expect(moving).toContain('still moving');
    const odd = balanceAnomalies([{ week: 2, cash: -5, men: 4, territory: 1, heat: 3, suspicion: 1, standings: 'Them $-20 men 3' }], [], null, 64);
    expect(odd.some((line) => line.includes('cash is -5'))).toBe(true);
    expect(odd.some((line) => line.includes('negative cash'))).toBe(true);
  });
});
