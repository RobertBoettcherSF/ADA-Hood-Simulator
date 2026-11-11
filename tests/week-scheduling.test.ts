import { describe, expect, it, vi } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { act, useGame } from '../src/app/store';
import { Sim } from '../src/sim/sim';
import { MINUTES_PER_WEEK } from '../src/sim/constants';

describe('bounded end-week scheduling', () => {
  it('bounds rendering interpolation while deferred ticks catch up', () => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10 });
    sim.launchWeek();
    sim.advance(1, 60, 0);
    expect(sim.world.minute).toBe(1);
    expect(sim.subMinute).toBe(1);
    sim.advance(0, 60);
    expect(sim.world.minute).toBeGreaterThan(1);
    expect(sim.subMinute).toBeLessThan(1);
  });

  it('safely ignores UI actions during settlement', () => {
    useGame.getState().startGame({ ...defaultGameOptions(), seed: 404, citySize: 10 });
    const state = useGame.getState();
    state.sim!.world.settlementStage = 0;
    const mutation = vi.fn(() => ({ ok: true as const }));
    expect(() => state.notify(act(mutation))).not.toThrow();
    expect(mutation).not.toHaveBeenCalled();
  });
  it('resumes a save from every settlement boundary without repeating transactions or RNG', () => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10 });
    sim.launchWeek();
    sim.world.minute = MINUTES_PER_WEEK - 1;
    const start = JSON.stringify(sim.world);
    const checkpoints: string[] = [];
    while (sim.world.phase === 'week') {
      sim.finishWeekSlice(0);
      if (sim.world.settlementStage != null) checkpoints.push(JSON.stringify(sim.world));
    }
    const expected = JSON.stringify(sim.world);
    const synchronous = Sim.fromSave(JSON.parse(start));
    synchronous.finishWeek();
    expect(JSON.stringify(synchronous.world)).toBe(expected);
    expect(checkpoints.length).toBeGreaterThan(15);
    for (const snapshot of checkpoints) {
      const restored = Sim.fromSave(JSON.parse(snapshot));
      restored.finishWeek();
      expect(JSON.stringify(restored.world)).toBe(expected);
    }
  });
  it('produces exactly the synchronous result, including RNG and IDs', () => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10 });
    sim.launchWeek();
    const start = JSON.stringify(sim.world);
    sim.finishWeek();
    const expected = JSON.parse(JSON.stringify(sim.world)) as typeof sim.world;
    const sliced = Sim.fromSave(JSON.parse(start));
    let slices = 0;
    while (sliced.world.phase === 'week') {
      sliced.finishWeekSlice(2);
      slices++;
    }
    expect(slices).toBeGreaterThan(1);
    // Report the differing field rather than dumping a multi-megabyte world.
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
      expect(JSON.stringify(sliced.world[key]) === JSON.stringify(expected[key]), key).toBe(true);
    }
  }, 60000);

  it('yields before work, ignores repeat clicks and can stop before the next batch', async () => {
    useGame.getState().startGame({ ...defaultGameOptions(), seed: 404, citySize: 10 });
    const sim = useGame.getState().sim!;
    sim.launchWeek();
    const slice = vi.spyOn(sim, 'finishWeekSlice');
    const pending = useGame.getState().finishWeek();
    await useGame.getState().finishWeek();
    expect(slice).not.toHaveBeenCalled();
    useGame.getState().cancelFinishWeek();
    await pending;
    expect(slice).not.toHaveBeenCalled();
    expect(useGame.getState().paused).toBe(true);
  });

  it('does not advance a replaced world', async () => {
    const options = { ...defaultGameOptions(), seed: 404, citySize: 10 };
    useGame.getState().startGame(options);
    const old = useGame.getState().sim!;
    old.launchWeek();
    const pending = useGame.getState().finishWeek();
    useGame.getState().startGame(options);
    await pending;
    expect(old.world.minute).toBe(0);
    expect(useGame.getState().sim!.world.minute).toBe(0);
  });

  it('Escape from End Week continues the street at normal speed', async () => {
    const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10 });
    sim.launchWeek();
    useGame.setState({ sim, screen: 'game', finishingWeek: false, paused: false, streetLoading: false, savingToQuit: false, savingSnapshot: false, loadingSave: null, speed: 8 });
    const slice = vi.spyOn(sim, 'finishWeekSlice').mockImplementation(() => useGame.getState().resumeFromEndWeek());
    await useGame.getState().finishWeek();
    expect(slice).toHaveBeenCalled();
    expect(useGame.getState()).toMatchObject({ finishingWeek: false, paused: false, speed: 1 });
    expect(sim.world.phase).toBe('week');
  });

  it('keeps a cancelled run stopped when skipping is immediately restarted', async () => {
    useGame.getState().startGame({ ...defaultGameOptions(), seed: 404, citySize: 10 });
    const sim = useGame.getState().sim!;
    sim.launchWeek();
    const slice = vi.spyOn(sim, 'finishWeekSlice').mockImplementation(() => useGame.getState().cancelFinishWeek());
    const first = useGame.getState().finishWeek();
    useGame.getState().cancelFinishWeek();
    const second = useGame.getState().finishWeek();
    await Promise.all([first, second]);
    expect(slice).toHaveBeenCalledTimes(1);
  });
});
