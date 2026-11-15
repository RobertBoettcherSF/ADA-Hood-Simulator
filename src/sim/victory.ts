import type { GameOptions } from './types';

/** 1.2.57 (Robert): the win a Full game is played for ('any' keeps all three). */
export type FullVictory = 'any' | 'office' | 'straight' | 'eliminate';
export const FULL_VICTORIES: readonly FullVictory[] = ['any', 'office', 'straight', 'eliminate'];
export const FULL_VICTORY_LABELS: Record<FullVictory, string> = {
  any: 'any ending', office: 'become mayor', straight: 'go straight', eliminate: 'last gang standing',
};

export type VictoryKind = 'mayor' | 'straight' | 'domination' | 'race' | 'power';

/**
 * 1.2.57 (Robert): a game is won only by the victory chosen for it. A Full
 * game with victory 'any' (the default) keeps its three endings; a Full game
 * with one picked has only that one; Territory and Wealth win only by their
 * target, Power only when its clock runs out. Wiping out every rival counts
 * only for Full 'any' or 'eliminate'.
 */
export function victoryAllowed(o: Pick<GameOptions, 'mode' | 'victory'>, kind: VictoryKind): boolean {
  if (o.mode === 'normal') {
    const v = o.victory ?? 'any';
    if (v === 'any') return kind === 'mayor' || kind === 'straight' || kind === 'domination';
    return (v === 'office' && kind === 'mayor') || (v === 'straight' && kind === 'straight') || (v === 'eliminate' && kind === 'domination');
  }
  if (o.mode === 'power') return kind === 'power';
  return kind === 'race';
}
