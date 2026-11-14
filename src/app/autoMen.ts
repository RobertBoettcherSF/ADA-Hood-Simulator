/**
 * 1.2.52 (Robert, proposed): man fitness — what one man is worth to the gang a
 * week, on the 1.2.51 dollar scale.
 *
 * value = the earnings of his skills in his best open job (that job's order
 * efficiency per man-minute × the minutes a man works × his stars ÷ 3)
 *       + his worth as a lieutenant (a share of his crew's earnings)
 *       + a hard-to-replace bonus (lieutenant, rare skills)
 *       − wage − wanted risk (expected arrest cost a week).
 */
import type { Person } from '../sim/types';
import type { CrewRole } from './autoActions';
import { ARREST_WEEKS, LASTING_WEEKS, type DollarScale } from './autoFitness';

/** The order type whose fitness prices each crew job (none for scouting). */
export const ROLE_ORDER_TYPE: Record<CrewRole, string | null> = {
  collect: 'collectProtection', intimidation: 'extort', recruit: 'recruit', business: 'setUpBusiness', muscle: 'raid', scout: null, expendables: 'kill',
};
/** A lieutenant's worth: this share of his crew's earnings (proposed). */
export const LIEUTENANT_SHARE = 0.1;
/** Weeks it takes to find a lieutenant as good (proposed). */
export const REPLACE_WEEKS = 4;
/** Stars from which a skill counts as rare (proposed). */
export const RARE_STARS = 4;
/** Weekly arrest chance for a man with an FBI warrant out (proposed). */
export const WARRANT_ARREST_CHANCE = 0.3;
/** Weekly arrest chance at the heavy-crime warrant line, scaled by his crime suspicion (proposed). */
export const SUSPICION_ARREST_CHANCE = 0.1;
/** A court bribe for a man on trial, in dollars (proposed). */
export const COURT_BRIBE_COST = 2000;
/** Share of a lieutenant's crew taken with him (proposed). */
export const CREW_TAKEN_SHARE = 0.5;
/** A pool spare or office defender is worth this share of V a week (proposed). */
export const SPARE_SHARE = 0.5;

export interface ManContext {
  scale: DollarScale;
  /** Dollars per man-minute for a crew job (null: no order data yet). */
  eff: (role: CrewRole) => number | null;
  /** Minutes a man works a week (his crew's used share of the week). */
  workMinutes: number;
  /** Stars for a job. */
  stars: (p: Person, role: CrewRole) => number;
  warrantBar: number;
}

export interface ManValue { job: CrewRole | null; earn: number; lieutenant: number; bonus: number; wage: number; risk: number; net: number }

/** Earnings a week in a job: its efficiency (or V spread over the week with no data, proposed) × minutes × stars ÷ 3. */
export function jobEarnings(p: Person, role: CrewRole, ctx: ManContext, weekMinutes: number): number {
  const e = ctx.eff(role);
  const perMinute = e ?? ctx.scale.V / weekMinutes;
  return Math.max(0, perMinute) * ctx.workMinutes * ctx.stars(p, role) / 3;
}

/** The expected arrest cost a week: jail weeks × V + a court bribe (+ part of his crew for a lieutenant). */
export function wantedRisk(p: Person, ctx: ManContext, crewSize: number): number {
  const chance = Math.min(1, (p.fbiWarrant ? WARRANT_ARREST_CHANCE : 0) + SUSPICION_ARREST_CHANCE * (p.crimeSuspicion ?? 0) / ctx.warrantBar);
  const cost = ARREST_WEEKS * ctx.scale.V + COURT_BRIBE_COST + (p.role === 'lieutenant' ? crewSize * CREW_TAKEN_SHARE * ctx.scale.A : 0);
  return chance * cost;
}

/**
 * A man's weekly worth in `job` (null: no open job — a spare, a defender or nothing).
 * `spare` marks a pool man kept as a spare or office defender.
 */
export function manValue(p: Person, job: CrewRole | null, ctx: ManContext, weekMinutes: number, opts: { crewEarnings?: number; crewSize?: number; spare?: boolean } = {}): ManValue {
  const earn = job ? jobEarnings(p, job, ctx, weekMinutes) : opts.spare ? SPARE_SHARE * ctx.scale.V : 0;
  const lieutenant = p.role === 'lieutenant' ? LIEUTENANT_SHARE * (opts.crewEarnings ?? 0) : 0;
  const best = Math.max(0, ...(['collect', 'intimidation', 'recruit', 'business', 'muscle', 'scout'] as CrewRole[]).map((r) => ctx.stars(p, r)));
  const bonus = (p.role === 'lieutenant' ? (ctx.scale.hire + REPLACE_WEEKS * ctx.scale.V) / LASTING_WEEKS : 0) + (best >= RARE_STARS ? REPLACE_WEEKS * ctx.scale.V / LASTING_WEEKS : 0);
  const risk = wantedRisk(p, ctx, opts.crewSize ?? 0);
  const net = earn + lieutenant + bonus - p.pay - risk;
  return { job, earn: Math.round(earn), lieutenant: Math.round(lieutenant), bonus: Math.round(bonus), wage: p.pay, risk: Math.round(risk), net: Math.round(net) };
}

export function manLine(p: Person, v: ManValue): string {
  return `${p.name} (${p.role}${v.job ? `, ${v.job}` : ''}) net $${v.net} = earn $${v.earn}${v.lieutenant ? ` + lt $${v.lieutenant}` : ''}${v.bonus ? ` + bonus $${v.bonus}` : ''} − wage $${v.wage}${v.risk ? ` − risk $${v.risk}` : ''}`;
}
