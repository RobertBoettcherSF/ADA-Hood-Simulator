import { describe, expect, it } from 'vitest';
import { addGameRecord, clearGameRecords, loadGameRecords, readLocalData } from '../src/app/localData';
import type { GameRecord } from '../src/app/save';
import { sortGames } from '../src/ui/Leaderboard';
import { finalScore, gameScoreNow } from '../src/sim/scoring';
import { Sim } from '../src/sim/sim';
import { defaultGameOptions } from '../src/app/newGame';

const rec = (id: string, score: number, at: number): GameRecord => ({ resultId: id, boss: 'Al', gang: 'The Outfit', won: score > 50, reason: 'r', week: 10, score, at });

describe('leaderboard', () => {
  it('keeps each finished game once, newest first, and sorts by score', () => {
    clearGameRecords();
    addGameRecord(rec('a', 40, 1));
    addGameRecord(rec('b', 70, 2));
    addGameRecord(rec('a', 40, 1));
    expect(loadGameRecords().map((g) => g.resultId)).toEqual(['b', 'a']);
    expect(readLocalData().games).toHaveLength(2);
    expect(sortGames([rec('x', 10, 5), rec('y', 90, 1)], 'score')[0].resultId).toBe('y');
    expect(sortGames([rec('x', 10, 5), rec('y', 90, 1)], 'date')[0].resultId).toBe('x');
    clearGameRecords();
  });
});

describe('one score', () => {
  it('Auto Test reports the ending screen score', () => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 7, citySize: 8, cityLayout: 'classic', era: '1932' });
    const now = gameScoreNow(sim.world);
    expect(now).toBeGreaterThanOrEqual(0);
    expect(now).toBeLessThanOrEqual(100);
    sim.world.outcome = { won: true, reason: 'test', score: 66 };
    expect(gameScoreNow(sim.world)).toBe(66);
    expect(finalScore({ cash: 0, territory: 0, manpower: 0 }, { cash: 0, territory: 0, manpower: 0 }, true, 0)).toBe(0);
  });
});
