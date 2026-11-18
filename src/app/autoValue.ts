/**
 * 1.2.77 (Robert, point 13): the unified action value — the first step toward one value for every
 * order Auto weighs (later a module shared with the rival gangs). Every existing score feeds it:
 *
 *   net      = value × kind weight × chance carried out − heat − expected losses − manager cost − cash × λ
 *   per hour = net ÷ max(UNIFIED_MIN_HOURS, the man-hours the order takes by the game's estimate)
 *
 * All in dollars (the dollar scale of autoFitness.ts); the decision ranks by the value per crew hour.
 * The hard holds (heat above worth, the d20, defence loss, lying low) stay where they are for now.
 */

/** 1.2.77 (proposed): the fewest man-hours an order is divided by (a quick order is not worth infinitely much an hour). */
export const UNIFIED_MIN_HOURS = 1;

export interface UnifiedParts {
  /** The proposal's value (dollars, after the learned ratio). */
  value: number;
  /** The goal's kind weight. */
  weight: number;
  /** The chance it is carried out. */
  chance: number;
  /** The expected heat cost (dollars). */
  heat: number;
  /** Expected losses: our men killed × L and arrested × A at the order type's learned rate × the men sent. */
  losses: number;
  /** A hood taken from the crews as a manager (a buy or set-up). */
  managerCost: number;
  /** Cash the order spends (the cash pass's approved price). */
  cash: number;
  /** λ, the value of holding a dollar now. */
  lambda: number;
  /** Men sent × the game's estimated hours (a standing order: its men × the week). */
  manHours: number;
  /** 1.2.79 (Robert, point 1): the building a buy or set-up leaves us owning — its price × ASSET_RETURN,
   *  credited as the cash pass credits it (the site stays ours), × the chance it is carried out. */
  asset?: number;
}

export interface UnifiedValue extends UnifiedParts { net: number; perHour: number }

export function unifiedValue(u: UnifiedParts): UnifiedValue {
  const net = u.value * u.weight * u.chance + (u.asset ?? 0) * u.chance - u.heat - u.losses - u.managerCost - u.cash * u.lambda;
  return { ...u, net, perHour: net / Math.max(UNIFIED_MIN_HOURS, u.manHours) };
}

/** One proposal's value for the log. */
export function unifiedWhy(u: UnifiedValue): string {
  const parts = [`$${Math.round(u.value)} × ${u.weight} × ${u.chance.toFixed(2)}${u.asset ? ` + building $${Math.round(u.asset)} × ${u.chance.toFixed(2)}` : ''}`];
  if (u.heat > 0) parts.push(`heat $${Math.round(u.heat)}`);
  if (u.losses > 0) parts.push(`losses $${Math.round(u.losses)}`);
  if (u.managerCost > 0) parts.push(`manager $${Math.round(u.managerCost)}`);
  if (u.cash > 0) parts.push(`cash $${Math.round(u.cash)} × λ ${u.lambda.toFixed(2)}`);
  return `$${Math.round(u.perHour)}/crew-hour = (${parts.join(' − ')} = $${Math.round(u.net)}) ÷ ${Math.max(UNIFIED_MIN_HOURS, u.manHours).toFixed(1)} h`;
}
