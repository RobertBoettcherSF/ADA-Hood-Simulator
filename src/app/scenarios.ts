import { CITY_SIZE_PRESETS, citySizePreset } from '../sim/newGameValidation';
import type { GameOptions } from '../sim/types';

/**
 * Hand-crafted scenarios: a fixed city, a set objective and a difficulty, as
 * the original's Scenario mode offered. Each is a bundle of options on top of
 * the player's identity, so the rest of the game needs no special handling —
 * the objective is one of the short-game or full-game endings.
 */
export interface Scenario {
  id: string;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  blurb: string;
  options: Omit<Partial<GameOptions>, 'playerName' | 'playerFemale' | 'playerPortrait' | 'playerColor' | 'scenarioId' | 'tutorialId'>;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'wetMoney',
    name: 'Wet Money',
    difficulty: 'easy',
    blurb:
      'A soft city with a thirst. The rivals are reluctant to turn violent, the trade is strong, and the first boss to $150,000 in total wealth — cash plus assets — takes it.',
    options: { seed: 1932, mode: 'wealth', wealthTarget: 150_000, economy: 'strong', opponents: 'passive', startMoney: 8000, startHoods: 6, startBusinesses: 4, citySize: 10 },
  },
  {
    id: 'wardHeeler',
    name: 'Ward Heeler',
    difficulty: 'medium',
    blurb: 'Territory is everything. Seventy-five blocks under your colours wins the city, and three ordinary outfits are trying to get there first.',
    // 100 was nine-tenths of all the blocks this city can be claimed in.
    options: { seed: 1931, mode: 'territory', territoryTarget: 75, economy: 'normal', opponents: 'normal', startMoney: 6000, startHoods: 5, startBusinesses: 3, citySize: 12 },
  },
  {
    id: 'twentyWeeks',
    name: 'Twenty Weeks',
    difficulty: 'hard',
    blurb:
      'A race against the clock and against gangs that shoot first. After twenty weeks the most powerful boss still standing wins — wealth, territory and manpower together.',
    options: { seed: 1929, mode: 'power', powerWeeks: 20, economy: 'normal', opponents: 'aggressive', startMoney: 6000, startHoods: 5, startBusinesses: 3, citySize: 14 },
  },
  {
    id: 'drySeason',
    name: 'Dry Season',
    difficulty: 'hard',
    blurb: 'The trade is thin and the rivals are hungry. Reach $300,000 in total wealth — cash plus assets — when every business in town is scraping by.',
    options: { seed: 1933, mode: 'wealth', wealthTarget: 300_000, economy: 'weak', opponents: 'normal', startMoney: 5000, startHoods: 5, startBusinesses: 5, citySize: 12 },
  },
  {
    id: 'fourthWard',
    name: 'The Fourth Ward',
    difficulty: 'hard',
    blurb: 'Three hoods, three thousand dollars and one shop front, facing three quick-tempered rival bosses. The full game, from the bottom.',
    options: { seed: 1926, mode: 'normal', economy: 'normal', opponents: 'aggressive', startMoney: 3000, startHoods: 3, startBusinesses: 1, citySize: 12 },
  },
  {
    id: 'bigHouse',
    name: 'The Big House',
    difficulty: 'medium',
    blurb: 'A large crew: ten hoods, ten thousand dollars and the run of the place. Win the full game any way you can.',
    options: { seed: 1934, mode: 'normal', economy: 'normal', opponents: 'aggressive', startMoney: 10_000, startHoods: 10, startBusinesses: 4, citySize: 16 },
  },
];

export function scenarioById(id: string | undefined): Scenario | null {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

/** The player's identity kept, everything else set by the scenario. */
export function applyScenario(base: GameOptions, scenario: Scenario): GameOptions {
  // 1.2.21: the City Size selection rules every game. A scenario keeps its own
  // money, crew and goal but plays on the chosen city (default Standard 40×32).
  const sized = citySizePreset(base) ? { citySize: base.citySize, cityHeight: base.cityHeight }
    : { citySize: CITY_SIZE_PRESETS.standard.w, cityHeight: CITY_SIZE_PRESETS.standard.h };
  return { ...base, ...scenario.options, ...sized, scenarioId: scenario.id, tutorialId: undefined };
}
