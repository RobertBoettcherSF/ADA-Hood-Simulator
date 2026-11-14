/**
 * 1.2.52 (Robert): cash as a fitness function, on the 1.2.51 dollar scale.
 *
 * - R, the cash the gang needs: the shortfall of the lowest recent takings
 *   under the bill, one week's bill, and money already committed.
 * - λ, the value of holding a dollar: below R a dollar short is priced as
 *   unpaid men × P(desert) × L plus the risk to sacked men's crew jobs (A);
 *   above R holding loses IDLE_PENALTY a week.
 * - Every discretionary spend states its return per dollar (dollars back over
 *   LASTING_WEEKS for each dollar spent); one pass, best return first, takes
 *   each while its return is at least λ at the cash left after it.
 */
import { LASTING_WEEKS, type DollarScale } from './autoFitness';

/** Weekly loss of holding a dollar above the need (Robert, proposed). */
export const IDLE_PENALTY = 0.005;
/** Weeks of the lowest takings looked back over (Robert: 4). */
export const CASH_LOOKBACK_WEEKS = 4;
/** Chance an unpaid man deserts (proposed). */
export const P_DESERT_UNPAID = 0.25;
/** Share of men sacked for wages who held a crew job (proposed). */
export const SACKED_CREW_SHARE = 0.5;

export interface CashNeed { R: number; bill: number; lowest: number; shortfall: number; committed: number }

/** R = max(0, bill − lowest takings of the last weeks) + one week's bill + committed. */
export function cashNeed(bill: number, takings: readonly number[], committed: number): CashNeed {
  const recent = takings.slice(-CASH_LOOKBACK_WEEKS);
  const lowest = recent.length ? Math.min(...recent) : 0;
  const shortfall = Math.max(0, bill - lowest);
  return { R: Math.round(shortfall + bill + committed), bill: Math.round(bill), lowest: Math.round(lowest), shortfall: Math.round(shortfall), committed: Math.round(committed) };
}

/**
 * λ at a cash level: what a dollar held there is worth, in dollars. Above R
 * a dollar held for LASTING_WEEKS loses IDLE_PENALTY a week; below R each
 * dollar short leaves 1/avgPay of a man unpaid.
 */
export function holdValue(cashAfter: number, R: number, avgPay: number, scale: DollarScale): number {
  if (cashAfter >= R) return 1 - IDLE_PENALTY * LASTING_WEEKS;
  const perMan = P_DESERT_UNPAID * scale.L + SACKED_CREW_SHARE * scale.A;
  return 1 + (avgPay > 0 ? perMan / avgPay : 0);
}

/** One discretionary spend put to the pass. */
export interface CashSpend {
  label: string;
  kind: 'buy' | 'set-up' | 'bribe' | 'police' | 'car' | 'charity' | 'raise' | 'recruit' | 'asset';
  cost: number;
  /** Dollars back for each dollar spent. */
  ret: number;
  why: string;
  /** Carries the spend out (an API call or a proposed order); false when the game refused it. */
  run: () => boolean;
  /** 1.2.53: paid at once (an API call), so it can still be taken after the decision with cash a refused order released. */
  immediate?: boolean;
}

export interface CashPassResult { lines: string[]; spent: number; taken: number; takenSet: Set<CashSpend> }

/**
 * The one spending pass: best return per dollar first; a spend is taken while
 * its return is at least λ at the cash left after it and the week-end
 * forecast still covers the bill (the hard rule).
 */
export function runCashPass(spends: CashSpend[], cash: number, R: number, floor: number, avgPay: number, scale: DollarScale): CashPassResult {
  const lines: string[] = [];
  let left = cash, spent = 0, taken = 0;
  const takenSet = new Set<CashSpend>();
  const order = [...spends].sort((a, b) => b.ret - a.ret || a.cost - b.cost);
  for (const s of order) {
    const after = left - s.cost;
    const lambda = holdValue(after, R, avgPay, scale);
    const line = `${s.label} [${s.kind}] $${Math.round(s.cost)} at ${s.ret.toFixed(2)}/$ vs λ ${lambda.toFixed(2)}`;
    if (after < floor) { lines.push(`${line} — not taken: it would put the wage bill at risk`); continue; }
    if (s.ret < lambda) { lines.push(`${line} — not taken (${s.why})`); continue; }
    if (!s.run()) { lines.push(`${line} — taken but refused by the game (${s.why})`); continue; }
    left = after; spent += s.cost; taken++; takenSet.add(s);
    lines.push(`${line} — taken (${s.why})`);
  }
  return { lines, spent, taken, takenSet };
}
