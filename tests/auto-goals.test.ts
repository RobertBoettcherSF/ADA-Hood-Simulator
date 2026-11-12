import { describe, expect, it } from 'vitest';
import { chooseGoal, GOAL_POLICY, GOAL_SWITCH_MARGIN, goalScores } from '../src/app/autoGoals';
import { defaultGameOptions } from '../src/app/newGame';
import { Sim } from '../src/sim/sim';

const city = (mode: 'normal' | 'wealth' = 'normal') =>
  new Sim({ ...defaultGameOptions(), seed: 1932, citySize: 8, cityLayout: 'classic', era: '1932', mode });

describe('Auto Test victory goals', () => {
  it('scores all three wins in a full game and picks the best', () => {
    const sim = city();
    const scores = goalScores(sim.world, sim.playerGang);
    const { goal } = chooseGoal(sim.world, sim.playerGang);
    expect(Object.values(scores).every((n) => n >= 0 && n <= 1.5)).toBe(true);
    expect(scores[goal]).toBe(Math.max(...Object.values(scores)));
  });

  it('keeps the current goal unless another is clearly ahead', () => {
    const sim = city();
    const scores = goalScores(sim.world, sim.playerGang);
    const best = chooseGoal(sim.world, sim.playerGang).goal;
    const other = (['office', 'straight', 'eliminate'] as const).find((g) => g !== best && scores[best] - scores[g] < GOAL_SWITCH_MARGIN);
    if (other) expect(chooseGoal(sim.world, sim.playerGang, other).goal).toBe(other);
  });

  it('a stalled goal counts less, and cash pushes towards going straight', () => {
    const sim = city();
    const before = goalScores(sim.world, sim.playerGang).straight;
    sim.playerGang.cash = 400_000;
    expect(goalScores(sim.world, sim.playerGang).straight).toBeGreaterThan(before);
    expect(chooseGoal(sim.world, sim.playerGang, 'eliminate', true).scores.eliminate)
      .toBeLessThan(goalScores(sim.world, sim.playerGang).eliminate + 1e-9);
  });

  it('a short game has no mayoralty or going straight to play for', () => {
    const sim = city('wealth');
    const scores = goalScores(sim.world, sim.playerGang);
    expect(scores.office).toBe(0);
    expect(scores.straight).toBe(0);
  });

  it('going straight plays without violence or new rackets', () => {
    expect(GOAL_POLICY.straight).toEqual({ expansion: 0.6, violence: 'low', illegal: false });
    expect(GOAL_POLICY.eliminate.violence).toBe('high');
  });
});
