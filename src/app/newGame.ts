import { COMPACT_CITY_SIZES, ORIGINAL_CITY } from '../sim/newGameValidation';
import type { GameOptions } from '../sim/types';
import { money } from '../sim/world';
import { scenarioById } from './scenarios';
import { tutorialById } from './tutorials';

export function defaultGameOptions(): GameOptions {
  return {
    seed: Math.floor(Math.random() * 0xffffffff) >>> 0,
    playerName: 'Johnny Moretti',
    playerFemale: false,
    playerPortrait: 0,
    playerColor: 'red',
    mode: 'normal',
    economy: 'normal',
    opponents: 'normal',
    startMoney: 6000,
    startHoods: 5,
    startBusinesses: 3,
    powerWeeks: 40,
    wealthTarget: 250_000,
    territoryTarget: 125,
    citySize: COMPACT_CITY_SIZES.default,
    cityLayout: 'varied',
    era: '1932',
  };
}

/** What the New Game screen offers first: the original 40 × 32 city. The
 * compact square default above remains the baseline for tests and tools. */
export function newCampaignOptions(): GameOptions {
  return { ...defaultGameOptions(), citySize: ORIGINAL_CITY.w, cityHeight: ORIGINAL_CITY.h };
}

export const MODE_LABELS: Record<GameOptions['mode'], string> = {
  normal: 'Full Game',
  power: 'Short Game — Power',
  wealth: 'Short Game — Wealth',
  territory: 'Short Game — Territory',
};

export function describeMode(o: GameOptions): string {
  const scenario = scenarioById(o.scenarioId);
  if (scenario) return `${scenario.name}: ${describeObjective(o)}`;
  const lesson = tutorialById(o.tutorialId);
  if (lesson) return `Lesson ${lesson.id}, ${lesson.name}: ${describeObjective(o)}`;
  return describeObjective(o);
}

function describeObjective(o: GameOptions): string {
  switch (o.mode) {
    case 'normal':
      return 'Play until you eliminate every rival, win the mayoralty, or go straight.';
    case 'power':
      return `Be the most powerful boss still standing after ${o.powerWeeks} weeks.`;
    case 'wealth':
      return `First to ${money(o.wealthTarget)} in total wealth (cash plus assets) takes the city.`;
    case 'territory':
      return `First to control ${o.territoryTarget} city blocks takes the city.`;
  }
}
