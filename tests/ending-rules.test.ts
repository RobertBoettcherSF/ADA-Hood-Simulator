import { afterEach, describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { act, useGame } from '../src/app/store';
import { finalScore, recordScorePeaks, scoreMeasures, WIN_BONUS } from '../src/sim/scoring';
import { payCash, receiveCash } from '../src/sim/finances';
import { Sim, MINUTES_PER_SECOND } from '../src/sim/sim';
import type { GameOptions, GangWeekStat, ScoreMeasures } from '../src/sim/types';
import { gangWealth } from '../src/sim/world';

function fixture(mode: GameOptions['mode'] = 'normal') {
  const sim = new Sim({ ...defaultGameOptions(), seed: 404, citySize: 10, mode,
    wealthTarget: 500_000, territoryTarget: 50, powerWeeks: 20 });
  return { sim, w: sim.world, gang: sim.playerGang };
}
function settle(sim: Sim, stage = 15) {
  sim.world.phase = 'week'; sim.world.settlementStage = stage;
  sim.finishWeek();
}
afterEach(() => useGame.setState({ sim: null }));

describe('game endings follow the selected game type', () => {
  it.each(['normal', 'power', 'wealth', 'territory'] as const)('a player mayor only wins the full game (%s)', mode => {
    const { sim, w, gang } = fixture(mode);
    w.electionWinnerGangId = gang.id;
    settle(sim);
    expect(w.phase).toBe(mode === 'normal' ? 'gameOver' : 'planning');
    expect(w.outcome?.won).toBe(mode === 'normal' ? true : undefined);
    if (mode === 'normal') expect(w.outcome?.reason).toContain('Mayor');
  });

  it.each(['normal', 'power', 'wealth', 'territory'] as const)('a rival mayor loses in every game type (%s)', mode => {
    const { sim, w } = fixture(mode);
    w.electionWinnerGangId = Object.values(w.gangs).find(g => !g.isPlayer)!.id;
    settle(sim);
    expect(w.phase).toBe('gameOver'); expect(w.outcome?.won).toBe(false);
    expect(w.outcome?.reason).toContain('rival was elected');
  });

  it.each(['normal', 'power', 'wealth', 'territory'] as const)('eliminating all rivals still wins (%s)', mode => {
    const { sim, w, gang } = fixture(mode);
    for (const rival of Object.values(w.gangs)) if (!rival.isPlayer) rival.eliminated = true;
    settle(sim);
    expect(w.outcome?.won).toBe(true); expect(w.outcome?.reason).toContain('wiped out');
    expect(w.outcome?.score).toBe(finalScore(scoreMeasures(w, gang), gang.scorePeaks!, true, WIN_BONUS.domination));
  });

  it.each(['power', 'wealth', 'territory'] as const)('awards the highest win bonus for the actual %s target', mode => {
    const { sim, w, gang } = fixture(mode);
    if (mode === 'power') { w.week = 20; gang.cash = 1_000_000; }
    if (mode === 'wealth') gang.cash = 500_000;
    if (mode === 'territory') {
      w.options.territoryTarget = 1;
      // A unique qualifying gang, not a four-way initial tie awarded to the
      // player merely because that gang appears first in the object.
      for (const b of Object.values(w.buildings)) {
        if (b.ownerGangId !== gang.id) b.ownerGangId = null;
        if (b.protection?.gangId !== gang.id) b.protection = null;
      }
    }
    w.phase = 'week'; w.settlementStage = 15;
    const restored = Sim.fromSave(structuredClone(w));
    restored.finishWeek();
    expect(restored.world.outcome?.won).toBe(true);
    const endingGang = restored.playerGang;
    expect(restored.world.outcome?.score).toBe(finalScore(scoreMeasures(restored.world, endingGang), endingGang.scorePeaks!, true, WIN_BONUS.domination));
    expect(Sim.fromSave(structuredClone(restored.world)).world.outcome).toEqual(restored.world.outcome);
    expect(sim.world.outcome).toBeNull();
  });

  it('does not end Power before its selected final week', () => {
    const { sim, w, gang } = fixture('power');
    w.week = 19; gang.cash = 1_000_000;
    settle(sim);
    expect(w.week).toBe(20); expect(w.outcome).toBeNull();
    settle(sim);
    expect(w.week).toBe(20); expect(w.outcome?.reason).toContain('clock ran out');
  });
});

describe('final score uses cash and preserved campaign highs', () => {
  const maximum: ScoreMeasures = { cash: 600_000, territory: 160, manpower: 22 };
  const zero: ScoreMeasures = { cash: 0, territory: 0, manpower: 0 };

  it('includes final and peak achievement, capped at 100, with ranked win bonuses', () => {
    expect(finalScore(maximum, maximum, true, WIN_BONUS.domination)).toBe(100);
    expect(finalScore(maximum, maximum, true, WIN_BONUS.mayor)).toBe(90);
    expect(finalScore(maximum, maximum, true, WIN_BONUS.straight)).toBe(80);
    expect(finalScore(zero, maximum, true, WIN_BONUS.domination)).toBe(80);
    expect(finalScore(maximum, maximum, false, 45)).toBe(45);
    // Every win outscores every loss; a bare win still scores its bonus.
    expect(finalScore(zero, zero, true, WIN_BONUS.straight)).toBe(40);
    expect(finalScore(zero, zero, false, 0)).toBe(0);
  });

  it('does not add the value of unsold weapons to the cash part of a real ending', () => {
    const ordinary = fixture(), armed = fixture();
    armed.gang.weapons.tommy = 100;
    expect(gangWealth(armed.w, armed.gang)).toBeGreaterThan(gangWealth(ordinary.w, ordinary.gang));
    for (const s of [ordinary, armed]) { s.w.people[s.gang.bossId].status = 'dead'; settle(s.sim); }
    expect(armed.w.outcome?.score).toBe(ordinary.w.outcome?.score);
  });

  it('retains a peak after the corresponding graph entry rolls out and through save/restore', () => {
    const { sim, w, gang } = fixture();
    delete gang.scorePeaks;
    gang.history = Array.from({ length: 40 }, (_, i): GangWeekStat => ({ week: i + 1, power: 100,
      assets: 1000, cash: i === 0 ? 600_000 : 1000, territory: i === 0 ? 30 : 1,
      manpower: i === 0 ? 22 : 5, loyalty: 70, crimes: 0, suspicion: 0 }));
    w.week = 41;
    settle(sim, 12);
    expect(gang.history).toHaveLength(40); expect(gang.history[0].week).toBe(2);
    expect(gang.scorePeaks).toEqual({ cash: 600_000, territory: 30, manpower: 22 });
    const restored = Sim.fromSave(structuredClone(w));
    restored.world.people[restored.playerGang.bossId].status = 'dead';
    settle(restored);
    expect(restored.playerGang.scorePeaks).toEqual(gang.scorePeaks);
    expect(restored.world.outcome!.score).toBeGreaterThan(0);
  });

  it('recovers only known history from legacy saves without inventing cash from combined assets', () => {
    const { sim, w, gang } = fixture();
    delete gang.scorePeaks;
    gang.history = [{ week: 1, power: 100, assets: 2_000_000, territory: 20, manpower: 12,
      loyalty: 70, crimes: 0, suspicion: 0 }];
    const copy = structuredClone(w), restored = Sim.fromSave(copy);
    expect(restored.world).toEqual(w); expect(restored.playerGang.scorePeaks).toBeUndefined();
    restored.launchWeek();
    expect(restored.playerGang.scorePeaks).toEqual({ cash: 6000, territory: 20, manpower: 12 });
    expect(sim.world.phase).toBe('planning');
  });

  it('captures a planning high before it is spent and a street high before the next settlement', () => {
    const { sim, w, gang } = fixture();
    useGame.setState({ sim, savingSnapshot: false, loadingSave: null, streetLoading: false });
    act(s => { s.playerGang.cash = 50_000; });
    act(s => { s.playerGang.cash = 6000; });
    expect(gang.scorePeaks!.cash).toBe(50_000);
    sim.launchWeek(); gang.cash = 60_000;
    sim.advance(1 / MINUTES_PER_SECOND, 1);
    // The minute's peaks are taken in the frame after its tick (Sim.settleDeferred).
    sim.advance(0.001, 1);
    expect(gang.scorePeaks!.cash).toBe(60_000);
    expect(w.minute).toBe(1);
  });

  it('retains real cash receipts spent within the same settlement stage, outside the UI wrapper', () => {
    const { w, gang } = fixture();
    w.phase = 'week'; w.settlementStage = 1;
    receiveCash(w, gang, 'legal', 100_000);
    payCash(w, gang, 'wages', 90_000);
    expect(gang.cash).toBe(16_000);
    expect(gang.scorePeaks!.cash).toBe(106_000);
    expect(Sim.fromSave(structuredClone(w)).playerGang.scorePeaks!.cash).toBe(106_000);
  });

  it.each(['cash', 'territory', 'manpower'] as const)('rejects a corrupted %s high in both save loaders', async key => {
    const { w, gang } = fixture(); gang.scorePeaks![key] = -1;
    expect(() => Sim.fromSave(structuredClone(w))).toThrow(/score peaks/i);
    await expect(Sim.fromSaveResponsive(structuredClone(w))).rejects.toThrow(/score peaks/i);
  });

  it('never rewrites an already saved ending or its highs', () => {
    const { sim, w, gang } = fixture();
    w.people[gang.bossId].status = 'dead'; settle(sim);
    const saved = structuredClone(w), restored = Sim.fromSave(structuredClone(w));
    recordScorePeaks(restored.world); restored.launchWeek(); restored.finishWeek();
    expect(restored.world).toEqual(saved);
  });
});
