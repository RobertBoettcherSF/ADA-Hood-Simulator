import { CRIME_ROW_SUSPICION, FBI_CASE_THRESHOLD, HEAVY_CRIME_SUSPICION, MEMBER_WARRANT_BAR } from '../sim/systems/fbi';
import { MINUTES_PER_WEEK, ORDERS } from '../sim/constants';
import type { OrderType } from '../sim/types';

/**
 * 1.2.55 (Robert): heat fitness. Every order carries an expected heat cost on
 * each measure the game keeps — the FBI total, each man's FBI score, each
 * man's wanted level, the mayor's and the chief's opinion (with the mayor's
 * crackdown declaration) and the evidence — priced as the expected
 * consequence cost it adds: E[cost | x + Δ] − E[cost | x], with x projected
 * over HEAT_WEEKS by the game's own decay. Far below a line the price is
 * near zero (leeway); it rises steeply near it. Replaces the lie-low rule.
 *
 * The game's rules used (sim/systems):
 *  - FBI total: −1/10 a week, + trunc((trunc(office ÷ base) − limit) × 2);
 *    above 200 a case and a raid on the HQ (fbi.ts).
 *  - A man's FBI score: heavy crimes (> 59) add to his whole crew, −1/10 a
 *    week; a warrant when 200 + rand(0..63) < score (fbi.ts).
 *  - Wanted: + severity × 1.6 a reported crime, −2 a week working; a street
 *    arrest when wanted − officer opinion × 0.5 > 45 (law.ts, combat.ts).
 *  - Mayor: −5 × Σ arrest risk of the week's crimes; the chief moves 35% a
 *    week toward the mayor; below −20 police presence +0.4; the most active
 *    gang above 6 (Σ arrest risk × 10) is named 30% of weeks: chief −22
 *    (opinion.ts). Scene arrest risk × (1 − chief ÷ 260) (law.ts).
 *  - Evidence: + severity × 0.16 a reported crime, never decays; 0.25 a
 *    point in the prosecution (law.ts).
 */
export const HEAT_WEEKS = 4; // proposed
export const FBI_BAND = 20; // proposed
export const WANTED_BAND = 10; // proposed
/** A boss case costs this many A (proposed). */
export const BOSS_CASE_A = 100;
/** proposed: the chief's band above the game's −20 line over which the presence cost ramps in. */
export const CHIEF_BAND = 10;
/** proposed: witness weight assumed for a planned crime's arrest risk (one owner or officer). */
export const WITNESS_WEIGHT_EST = 1;
/** proposed: least police arrests a week assumed for pricing, before any are seen. */
export const ARREST_PRIOR_PW = 0.25;
/** proposed: a man at this street-arrest risk (0–1 over the wanted band) rests in the pool. */
export const REST_RISK = 0.5;
const STREET_LINE = 45, HOSTILE_LINE = -20, CHIEF_PULL = 0.35, MAYOR_PER_RISK = 5;
const CRACKDOWN_LINE = 6, CRACKDOWN_CHANCE = 0.3, CRACKDOWN_HIT = 22, PRESENCE_HOSTILE = 0.4;
const WARRANT_SPREAD = 64, WANTED_DECAY_WORKING = 2;

export interface HeatState {
  A: number;
  standard: boolean;
  fbiTotal: number;
  office: number;
  premisesTakings: number;
  opponentsWeight: number;
  ratioLimit: number;
  mayor: number;
  chief: number;
  /** Average opinion of the officers not on our payroll. */
  officer: number;
  /** Σ arrest risk × 10 of our crimes planned so far this week. */
  crimeScore: number;
  /** The most active rival's score last week (unknown: 0). */
  rivalScore: number;
  evidence: number;
  /** Police arrests a week expected (trailing or forward, at least ARREST_PRIOR_PW). */
  arrestsPW: number;
  /** The trial defence expected (16 × lawyer + 15). */
  defence: number;
  /** Weekly protection a new extorted site adds, after the collection rate. */
  protectionPerSite: number;
  /** 1.2.56: what one collect stop brings in (last week's collected ÷ shops). */
  collectPerSite: number;
  /** 1.2.56: what one raid or export order brought in last week (the office's 'other' takings). */
  otherPerOrder: number;
  /** 1.2.56: office takings (collects, raids, exports) given so far this week. */
  plannedOffice: number;
  /** 1.2.56: new protection from the extortions given so far this week. */
  plannedExtort: number;
  /** 1.2.56: an open case, a man in custody or the FBI total near its line — evidence matters within the horizon. */
  trialLikely: boolean;
  /** 1.2.63: what a whole-gang rest would cost (men × V × REST_WEEKS_LOST); 0 or unset prices no rest exposure. */
  restCost?: number;
  /** 1.2.65: the whole week's crime load expected (Σ arrest risk; last week's when more than planned so far). */
  weekRisk?: number;
  /** 1.2.65: street arrests a week with the whole gang past the officers' cliff (men × street rate × heat units a man). */
  cliffArrestsFull?: number;
}

export interface HeatMan { id: number; name: string; wanted: number; fbiScore: number; cost: number }
export interface HeatOrder { type: string; sites: number; heavyEach?: number; /** 1.2.78: the order's minutes on the street (the game's estimate); unknown = the whole week. */ streetMinutes?: number }
export type HeatMeasure = 'fbi' | 'warrant' | 'wanted' | 'opinion' | 'crackdown' | 'evidence';
export interface HeatCost { total: number; perMeasure: Record<HeatMeasure, number>; guard: boolean }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function premisesBase(s: HeatState, extraTakings = 0): number {
  return Math.max(100, Math.trunc((s.premisesTakings + extraTakings) * s.opponentsWeight / 10));
}
/**
 * 1.2.56 (Robert): the office takings the week will show — last week's, or
 * this week's collects, raids and exports given so far when they are more —
 * plus the new protection from this week's extortions, so each order given
 * counts against the next one.
 */
export function officeThisWeek(s: HeatState, extraOffice = 0, plannedAdd = 0): number {
  return Math.max(s.office, s.plannedOffice + plannedAdd) + s.plannedExtort + extraOffice;
}
/** 1.2.56: what an order adds to the office takings — new protection (extortion) or takings (collect, raid, export). */
export function officeAdds(o: HeatOrder, s: HeatState): { extort: number; takings: number } {
  const n = Math.max(1, o.sites);
  if (o.type === 'extort') return { extort: n * s.protectionPerSite, takings: 0 };
  if (o.type === 'collectProtection') return { extort: 0, takings: n * s.collectPerSite };
  if (o.type === 'raid' || o.type === 'export') return { extort: 0, takings: s.otherPerOrder };
  return { extort: 0, takings: 0 };
}
export function fbiRise(s: HeatState, extraOffice = 0, extraTakings = 0, plannedAdd = 0): number {
  if (!s.standard) return 0;
  const office = Math.max(0, officeThisWeek(s, extraOffice, plannedAdd));
  return Math.max(0, Math.min(255, Math.trunc((Math.trunc(office / premisesBase(s, extraTakings)) - s.ratioLimit) * 2)));
}
/** The highest FBI total over HEAT_WEEKS at this week's rise (the game's decay). */
export function fbiProject(s: HeatState, extraOffice = 0, extraTakings = 0, plannedAdd = 0): number {
  const r = fbiRise(s, extraOffice, extraTakings, plannedAdd);
  let t = s.fbiTotal, top = 0;
  for (let k = 0; k < HEAT_WEEKS; k++) { t = Math.min(255, t - Math.trunc(t / 10) + r); top = Math.max(top, t); }
  return top;
}
const fbiP = (x: number) => clamp01((x - (FBI_CASE_THRESHOLD - FBI_BAND)) / FBI_BAND);
/** The hard guard: an order that adds office takings must not take the projected total past 200 (1.2.56: with every order given this week counted). */
export function fbiGuard(s: HeatState, extraOffice: number, plannedAdd = 0): boolean {
  if (!s.standard || (extraOffice <= 0 && plannedAdd <= 0)) return false;
  const after = fbiProject(s, extraOffice, 0, plannedAdd);
  return after > FBI_CASE_THRESHOLD && after > fbiProject(s);
}
/** The FBI heat price removed by more legal takings (a legal buy raises the premises base). */
export function legalCredit(s: HeatState, extraTakings: number): number {
  return Math.max(0, BOSS_CASE_A * s.A * (fbiP(fbiProject(s)) - fbiP(fbiProject(s, 0, extraTakings))));
}

/** Chance of an FBI warrant within HEAT_WEEKS for a man whose score is s after this week's crimes. */
export function warrantRisk(score: number): number {
  let s = score, clear = 1;
  for (let k = 0; k < HEAT_WEEKS; k++) { s -= Math.trunc(s / 10); clear *= 1 - clamp01((s - MEMBER_WARRANT_BAR) / WARRANT_SPREAD); }
  return 1 - clear;
}
/** Street-arrest risk (0–1 over WANTED_BAND below the game's line) next week. */
export function streetRisk(wanted: number, officer: number): number {
  const line = STREET_LINE + officer * 0.5;
  return clamp01((wanted - WANTED_DECAY_WORKING - (line - WANTED_BAND)) / WANTED_BAND);
}

/** 1.2.63: the game's street line — a man whose wanted level is past it is arrested on sight (with his crew). */
export function streetLine(officer: number): number {
  return STREET_LINE + officer * 0.5;
}
/**
 * 1.2.63 (Robert): the chance an order's wanted gain takes a man over the street
 * line — 0 for a man with no wanted level (he cannot be arrested on the street
 * whatever the police think of us), the heat model's risk otherwise.
 */
export function overLineChance(wanted: number, officer: number): number {
  return wanted > 0 ? streetRisk(wanted, officer) : 0;
}
/**
 * 1.2.59 (Robert): the officers' opinion at which even a man with no wanted
 * level reaches the rest line (streetRisk(0, op) = REST_RISK) — below it the
 * whole gang rests. About −84 with the lines above.
 */
export function restOpinionLine(): number {
  return 2 * (WANTED_BAND - WANTED_DECAY_WORKING - STREET_LINE - REST_RISK * WANTED_BAND);
}
/** 1.2.59 (proposed): opinion points above the rest line where a gang-wide rest starts to be priced (0 there, full at the line). */
export const REST_OPINION_BAND = 20;
/** 1.2.59 (proposed): weeks a gang-wide rest takes (4–5 seen in the 1.2.58 runs). */
export const REST_WEEKS_LOST = 4;
/** How close the officers' opinion is to the gang-wide rest line (0 far above, 1 at or below it). */
export function restNearness(officer: number): number {
  return clamp01((restOpinionLine() + REST_OPINION_BAND - officer) / REST_OPINION_BAND);
}
/**
 * 1.2.59 (Robert): the officers' lowest opinion over HEAT_WEEKS — the mayor
 * drifts by our crime load (MAYOR_PER_RISK a point of risk), the chief follows
 * him 35% a week and the officers follow the chief 25% a week (the game's
 * weekly opinion). dMayor / dChief / dOfficer are a bribe's lift.
 */
export function officerLow(s: HeatState, riskPerWeek: number, dMayor = 0, dChief = 0, dOfficer = 0): number {
  let m = s.mayor + dMayor, c = s.chief + dChief, o = s.officer + dOfficer, low = o;
  for (let k = 0; k < HEAT_WEEKS; k++) {
    m = Math.max(-100, m - riskPerWeek * MAYOR_PER_RISK);
    c += (m - c) * CHIEF_PULL;
    o += (c - o) * 0.25;
    low = Math.min(low, o);
  }
  return low;
}
/**
 * 1.2.60 (Robert): the expected weeks under the rest line over HEAT_WEEKS —
 * each projected week of the officers' opinion counts its depth below the line
 * + REST_OPINION_BAND in bands, not capped at 1 (a deeper week takes a bigger
 * lift to clear), so a lift always shows. Same projection as officerLow.
 */
export function restWeeksUnder(s: HeatState, riskPerWeek: number, dMayor = 0, dChief = 0, dOfficer = 0): number {
  let m = s.mayor + dMayor, c = s.chief + dChief, o = s.officer + dOfficer, weeks = 0;
  const top = restOpinionLine() + REST_OPINION_BAND;
  for (let k = 0; k < HEAT_WEEKS; k++) {
    m = Math.max(-100, m - riskPerWeek * MAYOR_PER_RISK);
    c += (m - c) * CHIEF_PULL;
    o += (c - o) * 0.25;
    weeks += Math.max(0, (top - o) / REST_OPINION_BAND);
  }
  return weeks;
}
/** 1.2.60 (Robert): nearness to a gang-wide rest — the expected weeks under the line ÷ HEAT_WEEKS (uncapped). */
export function restNearnessAhead(s: HeatState, riskPerWeek: number, dMayor = 0, dChief = 0, dOfficer = 0): number {
  return restWeeksUnder(s, riskPerWeek, dMayor, dChief, dOfficer) / HEAT_WEEKS;
}
/** 1.2.63 (proposed): opinion points above the rest line where the rest exposure starts (0 there, 1 at the line). */
export const REST_PRICE_BAND = 100;
/**
 * 1.2.63 (Robert): the exposure to a whole-gang rest over HEAT_WEEKS — the
 * average of N² a week, N = how far the officers' projected opinion has come
 * down REST_PRICE_BAND toward the rest line (0 at the top, 1 at the line, more
 * below it). An opinion point therefore costs restCost × 2N ÷ REST_PRICE_BAND:
 * little far from the line, rising as we approach it. Same projection as officerLow.
 */
export function restExposure(s: HeatState, riskPerWeek: number, dMayor = 0, dChief = 0, dOfficer = 0): number {
  let m = s.mayor + dMayor, c = s.chief + dChief, o = s.officer + dOfficer, sum = 0;
  const top = restOpinionLine() + REST_PRICE_BAND;
  for (let k = 0; k < HEAT_WEEKS; k++) {
    // 1.2.65 (Robert): pressure keeps counting past mayor −100 (no floor), so a crime there still costs.
    m -= riskPerWeek * MAYOR_PER_RISK;
    c += (m - c) * CHIEF_PULL;
    o += (c - o) * 0.25;
    const n = Math.max(0, (top - o) / REST_PRICE_BAND);
    sum += n * n;
  }
  return sum / HEAT_WEEKS;
}
/** 1.2.65 (proposed): the officers' opinion where a man with no wanted level can be arrested (wanted − opinion × 0.5 > 45). */
export const CLIFF_LINE = -90;
/** 1.2.65 (proposed): opinion points above the cliff over which its price ramps in (0 at −80, full at −90). */
export const CLIFF_BAND = 10;
/** 1.2.65 (proposed): heat units a man with no wanted level carries past the cliff (45 ÷ 100). */
export const CLIFF_UNITS_PER_MAN = 0.45;
/**
 * 1.2.65 (Robert): weeks over HEAT_WEEKS the officers' projected opinion spends
 * past the cliff (ramped over CLIFF_BAND), where the whole gang is arrestable.
 * Same projection as restExposure (no −100 floor on the mayor).
 */
export function cliffExposure(s: HeatState, riskPerWeek: number, dMayor = 0, dChief = 0, dOfficer = 0): number {
  let m = s.mayor + dMayor, c = s.chief + dChief, o = s.officer + dOfficer, weeks = 0;
  for (let k = 0; k < HEAT_WEEKS; k++) {
    m -= riskPerWeek * MAYOR_PER_RISK;
    c += (m - c) * CHIEF_PULL;
    o += (c - o) * 0.25;
    weeks += clamp01((CLIFF_LINE + CLIFF_BAND - o) / CLIFF_BAND);
  }
  return weeks;
}
/** 1.2.65 (Robert): the cliff's expected cost — men × arrest cost (A) × the chance (street arrests a week past it) × weeks past it. */
export function cliffCost(s: HeatState, riskPerWeek: number, dMayor = 0, dChief = 0, dOfficer = 0): number {
  return (s.cliffArrestsFull ?? 0) * s.A * cliffExposure(s, riskPerWeek, dMayor, dChief, dOfficer);
}
/** 1.2.65: what a lift saves on the cliff. */
export function cliffRelief(s: HeatState, riskPerWeek: number, dMayor = 0, dChief = 0, dOfficer = 0): number {
  return Math.max(0, cliffCost(s, riskPerWeek) - cliffCost(s, riskPerWeek, dMayor, dChief, dOfficer));
}
/**
 * 1.2.65 (Robert): the opinion cost of a whole week's crime load (Σ arrest
 * risk): the police cost of the mayor's fall, the whole-gang rest exposure and
 * the cliff, against no crime at all. Each order pays its share.
 */
export function weekOpinionCost(s: HeatState, weekRisk: number): number {
  if (weekRisk <= 0) return 0;
  const police = Math.max(0, policeCost(s, chiefAvg(s, -MAYOR_PER_RISK * weekRisk, 0)) - policeCost(s, chiefAvg(s, 0, 0)));
  const rest = s.restCost ? Math.max(0, s.restCost * (restExposure(s, weekRisk) - restExposure(s, 0))) : 0;
  return police + rest + Math.max(0, cliffCost(s, weekRisk) - cliffCost(s, 0));
}
/** 1.2.59 (Robert): the gang-wide rest a lift prevents — restCost (men × V × REST_WEEKS_LOST) × the fall in exposure (1.2.63: restExposure, rising as the line nears). */
export function restRelief(s: HeatState, riskPerWeek: number, restCost: number, dMayor = 0, dChief = 0, dOfficer = 0): number {
  const before = restExposure(s, riskPerWeek);
  const after = restExposure(s, riskPerWeek, dMayor, dChief, dOfficer);
  return Math.max(0, restCost * (before - after));
}

/** The arrest risk the game gives a planned crime of this severity (one witness of weight WITNESS_WEIGHT_EST). */
export function crimeRisk(type: string): number {
  const sev = ORDERS[type as OrderType]?.severity ?? 0;
  return sev > 0 ? Math.min(0.92, 0.05 + 0.09 * WITNESS_WEIGHT_EST + 0.035 * sev) : 0;
}

/** The chief's average opinion over HEAT_WEEKS, pulled toward the mayor 35% a week. */
function chiefAvg(s: HeatState, dMayor: number, dChief: number): number {
  const m = s.mayor + dMayor;
  let c = s.chief + dChief, sum = 0;
  for (let k = 0; k < HEAT_WEEKS; k++) { c += (m - c) * CHIEF_PULL; sum += c; }
  return sum / HEAT_WEEKS;
}
/** Expected police cost over HEAT_WEEKS at a chief opinion: arrests rise with (1 − op ÷ 260) and the officers' street line, and by 0.4 presence below −20. */
function policeCost(s: HeatState, chief: number): number {
  const base = Math.max(ARREST_PRIOR_PW, s.arrestsPW) * s.A * HEAT_WEEKS;
  // 1.2.56 (Robert): far above the −20 line the chief's opinion costs about
  // nothing — the linear part ramps in from HOSTILE_LINE + 2 bands (0) to one band (−10).
  const near = clamp01(((HOSTILE_LINE + 2 * CHIEF_BAND) - chief) / CHIEF_BAND);
  const linear = base * (-chief) * (1 / 260 + 0.5 / STREET_LINE) * near;
  const hostile = base * PRESENCE_HOSTILE * clamp01(((HOSTILE_LINE + CHIEF_BAND) - chief) / CHIEF_BAND);
  return linear + hostile;
}
/** What a mayor or chief change saves over HEAT_WEEKS at a weekly crime load (Σ arrest risk).
 * A chief bribe fades by itself: the chief keeps moving 35% a week toward the mayor; a mayor's change stays. */
export function opinionRelief(s: HeatState, dMayor: number, dChief: number, weeklyRisk: number): number {
  const load = -MAYOR_PER_RISK * weeklyRisk * HEAT_WEEKS / 2;
  return Math.max(0, policeCost(s, chiefAvg(s, load, 0)) - policeCost(s, chiefAvg(s, load + dMayor, dChief)));
}

export function heatCost(o: HeatOrder, s: HeatState, crew?: HeatMan[]): HeatCost {
  const per: Record<HeatMeasure, number> = { fbi: 0, warrant: 0, wanted: 0, opinion: 0, crackdown: 0, evidence: 0 };
  const sev = ORDERS[o.type as OrderType]?.severity ?? 0;
  const crimes = sev > 0 ? Math.max(1, o.sites) : 0;
  const risk = crimeRisk(o.type);
  // FBI total: what the order adds to the office takings (1.2.56: collects, raids and exports too).
  const adds = officeAdds(o, s);
  const extraOffice = adds.extort;
  if (extraOffice > 0 || adds.takings > 0) per.fbi = Math.max(0, BOSS_CASE_A * s.A * (fbiP(fbiProject(s, extraOffice, 0, adds.takings)) - fbiP(fbiProject(s))));
  if (crimes > 0) {
    // Mayor and chief: the chief's path toward the mayor over the horizon.
    const dMayor = -MAYOR_PER_RISK * risk * crimes;
    // 1.2.65 (Robert): the order pays its share (its risk ÷ the week's) of the
    // whole week's crime load — police, whole-gang rest and the cliff — not
    // only its own marginal step. The week's load is what is planned so far
    // with this order, or last week's when that was more.
    const own = risk * crimes;
    const week = Math.max(s.weekRisk ?? 0, s.crimeScore / 10 + own);
    per.opinion = week > 0 ? weekOpinionCost(s, week) * own / week : 0;
    // The crackdown declaration: our score past the line (6, or the busiest rival).
    const line = Math.max(CRACKDOWN_LINE, s.rivalScore);
    const before = clamp01((s.crimeScore - line + 1) / 2), after = clamp01((s.crimeScore + risk * 10 * crimes - line + 1) / 2);
    if (after > before) per.crackdown = (after - before) * CRACKDOWN_CHANCE * Math.max(0, policeCost(s, chiefAvg(s, dMayor, -CRACKDOWN_HIT)) - policeCost(s, chiefAvg(s, dMayor, 0)));
    // Evidence: the prosecution's 0.25 a point against the defence's ±15% spread.
    const slope = Math.min(0.05, 0.25 / (0.3 * Math.max(10, s.defence)));
    // 1.2.56 (Robert): evidence never decays and counts only at a trial — priced only while one is likely.
    per.evidence = !s.trialLikely ? 0 : sev * 0.16 * crimes * slope * Math.max(ARREST_PRIOR_PW, s.arrestsPW) * HEAT_WEEKS * s.A;
  }
  if (crew?.length) {
    // Wanted: the crew's most wanted man is taken as the one who does it.
    // 1.2.63 (Robert): the expected arrest cost — the chance the order's wanted
    // gain takes him over the street line × the crew (a street arrest takes the
    // whole crew) × A. A man with no wanted level starts at no risk.
    if (crimes > 0) {
      const perp = [...crew].sort((a, b) => b.wanted - a.wanted)[0];
      const d = sev * 1.6 * crimes;
      // 1.2.78 (Robert, point 8): a man already past the street line is not free of risk — he is priced at the
      // street arrest chance × the order's street hours ÷ the week × A (the crossing alone priced him at $0).
      if (perp.wanted >= streetLine(s.officer)) {
        const share = Math.min(1, Math.max(0, o.streetMinutes ?? MINUTES_PER_WEEK) / MINUTES_PER_WEEK);
        per.wanted = streetRisk(perp.wanted, s.officer) * share * s.A;
      } else {
        per.wanted = Math.max(0, overLineChance(perp.wanted + d, s.officer) - overLineChance(perp.wanted, s.officer)) * crew.length * s.A;
      }
    }
    // A man's FBI score: a heavy crime adds to every man of the crew.
    const each = o.heavyEach ?? ((CRIME_ROW_SUSPICION[o.type] ?? 0) > HEAVY_CRIME_SUSPICION ? CRIME_ROW_SUSPICION[o.type] : 0);
    if (each > 0) {
      const add = each * Math.max(1, o.sites);
      per.warrant = crew.reduce((n, m) => n + (warrantRisk(m.fbiScore + add) - warrantRisk(m.fbiScore)) * m.cost, 0);
    }
  }
  const total = Math.round(Object.values(per).reduce((a, b) => a + b, 0));
  return { total, perMeasure: per, guard: fbiGuard(s, extraOffice, adds.takings) };
}

/** Price per unit of each measure now (the cost of one more unit), for the report. */
export function heatLine(s: HeatState, crewTop: { wanted: number; fbiScore: number }, spend: Record<HeatMeasure, number>, given: number): string {
  const fbiNow = fbiProject(s), fbiUnit = s.standard ? BOSS_CASE_A * s.A * (fbiP(fbiNow + 1) - fbiP(fbiNow)) : 0;
  const line = STREET_LINE + s.officer * 0.5;
  const wantedUnit = (streetRisk(crewTop.wanted + 1, s.officer) - streetRisk(crewTop.wanted, s.officer)) * s.A;
  const warrantUnit = (warrantRisk(crewTop.fbiScore + 1) - warrantRisk(crewTop.fbiScore)) * s.A;
  const chiefUnit = policeCost(s, chiefAvg(s, -1, 0)) - policeCost(s, chiefAvg(s, 0, 0));
  const slope = Math.min(0.05, 0.25 / (0.3 * Math.max(10, s.defence)));
  const spent = Object.entries(spend).filter(([, v]) => v > 0.5).map(([k, v]) => `${k} $${Math.round(v)}`).join(', ');
  return `HEAT (1.2.56, H ${HEAT_WEEKS} wk, bands ${FBI_BAND}/${WANTED_BAND}, boss case ${BOSS_CASE_A}×A, proposed): `
    + `FBI total ${s.fbiTotal} (projected ${fbiNow}, rise ${fbiRise(s)}/wk) line ${FBI_CASE_THRESHOLD} gap ${FBI_CASE_THRESHOLD - fbiNow}, $${Math.round(fbiUnit)}/point; `
    + `top wanted ${Math.round(crewTop.wanted)} line ${Math.round(line)} gap ${Math.round(line - crewTop.wanted)}, $${Math.round(wantedUnit)}/point (×man); `
    + `top FBI score ${Math.round(crewTop.fbiScore)} line ${MEMBER_WARRANT_BAR} gap ${Math.round(MEMBER_WARRANT_BAR - crewTop.fbiScore)}, $${Math.round(warrantUnit)}/point (×man); `
    + `chief ${Math.round(s.chief)} (mayor ${Math.round(s.mayor)}) line ${HOSTILE_LINE} gap ${Math.round(s.chief - HOSTILE_LINE)}, $${Math.round(chiefUnit)}/mayor point; `
    + `crackdown score ${s.crimeScore.toFixed(1)} line ${Math.max(CRACKDOWN_LINE, s.rivalScore).toFixed(1)}; `
    + `evidence ${Math.round(s.evidence)}${s.trialLikely ? '' : ' (no trial likely: $0)'}, $${Math.round(slope * Math.max(ARREST_PRIOR_PW, s.arrestsPW) * HEAT_WEEKS * s.A)}/point; `
    + `spent this week $${Math.round(Object.values(spend).reduce((a, b) => a + b, 0))} on ${given} order(s)${spent ? ` (${spent})` : ''}`;
}
