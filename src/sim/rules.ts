import type { GameOptions } from './types';

/**
 * 1.2.50 (Robert): one ruleset for every city size. Every new game plays the
 * Standard rules (the rules of the Standard 40 × 32 city) whatever its size or
 * layout; only the election count still depends on the Standard city's map
 * (1.2.51). Saves made before 1.2.50 keep the rules they were started with.
 */
export function standardRules(w: { options: Pick<GameOptions, 'standardRules'> }): boolean {
  return w.options.standardRules === true;
}
