import { scenarioById } from './scenarios';
import type { WorldState } from '../sim/types';

const MODE_LABELS: Record<WorldState['options']['mode'], string> = {
  normal: 'Full game', power: 'Power', wealth: 'Wealth', territory: 'Territory',
};

/** The win the game was set up for, as the New Game screen states it. */
export function victoryTarget(w: WorldState): string {
  const o = w.options;
  if (o.mode === 'territory') return `Territory ${o.territoryTarget} blocks`;
  if (o.mode === 'wealth') return `Wealth $${o.wealthTarget.toLocaleString('en-US')}`;
  if (o.mode === 'power') return `Power after ${o.powerWeeks} weeks`;
  return 'Full game (become mayor, go straight, or be the last gang standing)';
}

/**
 * 1.2.23: the game's starting conditions, written once at the top of the Auto
 * Test report and the debug report. Everything here is fixed when the city is
 * made (options, the rival gangs and their temper), so the block reads the
 * same in week 1 and week 100.
 */
const written = new WeakMap<WorldState, string[]>();
export function startingConditions(w: WorldState | null, autoTestSeed?: number): string[] {
  if (!w) return ['Starting conditions', '(no game loaded)'];
  let lines = written.get(w);
  if (!lines) {
    const o = w.options;
    const scenario = o.scenarioId ? scenarioById(o.scenarioId) : undefined;
    const rivals = Object.values(w.gangs).filter((g) => !g.isPlayer);
    lines = [
      'Starting conditions',
      `Game type: ${MODE_LABELS[o.mode]}`,
      `Victory target: ${victoryTarget(w)}`,
      `Scenario: ${scenario ? scenario.name : o.tutorialId != null ? `lesson ${o.tutorialId}` : 'none'}`,
      `Starting money: $${o.startMoney.toLocaleString('en-US')}; hoods ${o.startHoods}; businesses ${o.startBusinesses}`,
      `Map size: ${w.gridW} × ${w.gridH} blocks${o.cityLayout ? ` (${o.cityLayout})` : ''}`,
      `City seed: ${o.seed}`,
      `Economy: ${o.economy}`,
      `Opponents setting: ${o.opponents}`,
      `Rival gangs: ${rivals.length ? rivals.map((g) => `${g.name} (${g.personality})`).join(', ') : 'none'}`,
    ];
    written.set(w, lines);
  }
  return autoTestSeed == null ? lines : [...lines.slice(0, 7), `Auto Test strategy seed: ${autoTestSeed}`, ...lines.slice(7)];
}
