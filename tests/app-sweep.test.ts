import { describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { recordHallOfFame } from '../src/app/save';
import { useGame } from '../src/app/store';
import { Sim } from '../src/sim/sim';
import { pressStories } from '../src/sim/pressStories';
import { gangManpower } from '../src/sim/world';

describe('game flow', () => {
  it('a lesson is not entered in the Hall of Fame', () => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10, tutorialId: 4 });
    sim.world.phase = 'gameOver';
    sim.world.outcome = { won: false, reason: 'Killed.', score: 12 };
    expect(recordHallOfFame(sim.world)).toBe(false);
  });

  it('New Game after a lesson starts an ordinary campaign, keeping the boss', () => {
    useGame.setState({ options: { ...defaultGameOptions(), tutorialId: 1, seed: 101, playerName: 'Al Moretti' } });
    useGame.getState().setScreen('newGame');
    const o = useGame.getState().options;
    expect(o.tutorialId).toBeUndefined();
    expect(o.playerName).toBe('Al Moretti');
    useGame.setState({ screen: 'menu' });
  });

  it('prints only the highest milestone a gang jumps to', () => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 404 });
    const w = sim.world, g = sim.playerGang;
    const before = w.news.length;
    // A gang that has grown past 25 and 50 men since the last paper.
    for (const p of Object.values(w.people).filter(p => p.gangId == null && p.role === 'citizen').slice(0, 60)) { p.gangId = g.id; p.role = 'hood'; g.poolIds.push(p.id); }
    expect(gangManpower(w, g)).toBeGreaterThanOrEqual(50);
    pressStories(w);
    expect(w.news.slice(before).filter(n => n.headline === "MOBSTER'S PRIVATE ARMY!" && n.gangId === g.id)).toHaveLength(1);
    expect(g.pressMilestones).toContain('army-25');
  });
});
