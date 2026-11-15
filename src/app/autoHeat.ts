import { CRIME_ROW_SUSPICION, FBI_CASE_THRESHOLD, HEAVY_CRIME_SUSPICION, MEMBER_WARRANT_BAR } from '../sim/systems/fbi';
import { ORDERS } from '../sim/constants';
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
}

export interface HeatMan { id: number; name: string; wanted: number; fbiScore: number; cost: number }
export interface HeatOrder { type: string; sites: number; heavyEach?: number }
export type HeatMeasure = 'fbi' | 'warrant' | 'wanted' | 'opinion' | 'crackdown' | 'evidence';
export interface HeatCost { total: number; perMeasure: Record<HeatMeasure, number>; guard: boolean }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function premisesBase(s: HeatState, extraTakings = 0): number {
  return Math.max(100, Math.trunc((s.premisesTakings + extraTakings) * s.opponentsWeight / 10));
}
export function fbiRise(s: HeatState, extraOffice = 0, extraTakings = 0): number {
  if (!s.standard) return 0;
  const office = Math.max(0, s.office + extraOffice);
  return Math.max(0, Math.min(255, Math.trunc((Math.trunc(office / premisesBase(s, extraTakings)) - s.ratioLimit) * 2)));
}
/** The highest FBI total over HEAT_WEEKS at this week's rise (the game's decay). */
export function fbiProject(s: HeatState, extraOffice = 0, extraTakings = 0): number {
  const r = fbiRise(s, extraOffice, extraTakings);
  let t = s.fbiTotal, top = 0;
  for (let k = 0; k < HEAT_WEEKS; k++) { t = Math.min(255, t - Math.trunc(t / 10) + r); top = Math.max(top, t); }
  return top;
}
const fbiP = (x: number) => clamp01((x - (FBI_CASE_THRESHOLD - FBI_BAND)) / FBI_BAND);
/** The hard guard: an order that adds protection must not take the projected total past 200. */
export function fbiGuard(s: HeatState, extraOffice: number): boolean {
  return s.standard && extraOffice > 0 && fbiProject(s, extraOffice) > FBI_CASE_THRESHOLD;
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
  const linear = base * (-chief) * (1 / 260 + 0.5 / STREET_LINE);
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
  // FBI total: protection an extortion adds to the office takings.
  const extraOffice = o.type === 'extort' ? Math.max(1, o.sites) * s.protectionPerSite : 0;
  if (extraOffice > 0) per.fbi = Math.max(0, BOSS_CASE_A * s.A * (fbiP(fbiProject(s, extraOffice)) - fbiP(fbiProject(s))));
  if (crimes > 0) {
    // Mayor and chief: the chief's path toward the mayor over the horizon.
    const dMayor = -MAYOR_PER_RISK * risk * crimes;
    per.opinion = Math.max(0, policeCost(s, chiefAvg(s, dMayor, 0)) - policeCost(s, chiefAvg(s, 0, 0)));
    // The crackdown declaration: our score past the line (6, or the busiest rival).
    const line = Math.max(CRACKDOWN_LINE, s.rivalScore);
    const before = clamp01((s.crimeScore - line + 1) / 2), after = clamp01((s.crimeScore + risk * 10 * crimes - line + 1) / 2);
    if (after > before) per.crackdown = (after - before) * CRACKDOWN_CHANCE * Math.max(0, policeCost(s, chiefAvg(s, dMayor, -CRACKDOWN_HIT)) - policeCost(s, chiefAvg(s, dMayor, 0)));
    // Evidence: the prosecution's 0.25 a point against the defence's ±15% spread.
    const slope = Math.min(0.05, 0.25 / (0.3 * Math.max(10, s.defence)));
    per.evidence = sev * 0.16 * crimes * slope * Math.max(ARREST_PRIOR_PW, s.arrestsPW) * HEAT_WEEKS * s.A;
  }
  if (crew?.length) {
    // Wanted: the crew's most wanted man is taken as the one who does it.
    if (crimes > 0) {
      const perp = [...crew].sort((a, b) => b.wanted - a.wanted)[0];
      const d = sev * 1.6 * crimes;
      per.wanted = (streetRisk(perp.wanted + d, s.officer) - streetRisk(perp.wanted, s.officer)) * perp.cost;
    }
    // A man's FBI score: a heavy crime adds to every man of the crew.
    const each = o.heavyEach ?? ((CRIME_ROW_SUSPICION[o.type] ?? 0) > HEAVY_CRIME_SUSPICION ? CRIME_ROW_SUSPICION[o.type] : 0);
    if (each > 0) {
      const add = each * Math.max(1, o.sites);
      per.warrant = crew.reduce((n, m) => n + (warrantRisk(m.fbiScore + add) - warrantRisk(m.fbiScore)) * m.cost, 0);
    }
  }
  const total = Math.round(Object.values(per).reduce((a, b) => a + b, 0));
  return { total, perMeasure: per, guard: fbiGuard(s, extraOffice) };
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
  return `HEAT (1.2.55, H ${HEAT_WEEKS} wk, bands ${FBI_BAND}/${WANTED_BAND}, boss case ${BOSS_CASE_A}×A, proposed): `
    + `FBI total ${s.fbiTotal} (projected ${fbiNow}, rise ${fbiRise(s)}/wk) line ${FBI_CASE_THRESHOLD} gap ${FBI_CASE_THRESHOLD - fbiNow}, $${Math.round(fbiUnit)}/point; `
    + `top wanted ${Math.round(crewTop.wanted)} line ${Math.round(line)} gap ${Math.round(line - crewTop.wanted)}, $${Math.round(wantedUnit)}/point (×man); `
    + `top FBI score ${Math.round(crewTop.fbiScore)} line ${MEMBER_WARRANT_BAR} gap ${Math.round(MEMBER_WARRANT_BAR - crewTop.fbiScore)}, $${Math.round(warrantUnit)}/point (×man); `
    + `chief ${Math.round(s.chief)} (mayor ${Math.round(s.mayor)}) line ${HOSTILE_LINE} gap ${Math.round(s.chief - HOSTILE_LINE)}, $${Math.round(chiefUnit)}/mayor point; `
    + `crackdown score ${s.crimeScore.toFixed(1)} line ${Math.max(CRACKDOWN_LINE, s.rivalScore).toFixed(1)}; `
    + `evidence ${Math.round(s.evidence)}, $${Math.round(slope * Math.max(ARREST_PRIOR_PW, s.arrestsPW) * HEAT_WEEKS * s.A)}/point; `
    + `spent this week $${Math.round(Object.values(spend).reduce((a, b) => a + b, 0))} on ${given} order(s)${spent ? ` (${spent})` : ''}`;
}
