/**
 * The original city's wage quote, weekly pay satisfaction and greed skim.
 *
 * Person_WeeklyUpdate 0x460300 (step 6–8), Lieutenant weekly remit 0x48E140
 * and Person_BankOnArrivalAtHq 0x4C3AA0 (deep/05 §8.2–8.3). The two stat
 * getters the reference left unnamed were read from the pristine executable's
 * vtables (1 October 2026):
 *  - crew hoods and lieutenants (0x781878 / 0x77EF60): vt+0x10C 0x6F95C0 =
 *    (intelligence>>2 + Σ ten skills)/11, vt+0x110 0x6F9620 = the best of
 *    intelligence>>2 and the ten skills, vt+0x13C 0x6FA0A0 = skills above 52;
 *  - accountant/lawyer class (0x77EC80): vt+0x10C = vt+0x110 0x461B20/30 =
 *    intelligence>>2, vt+0x13C 0x463440 = 0.
 * Compact cities keep the remake's wage drift and loyalty-based skim.
 */
import { effectiveHostility, fearOf, hostilityOf, shiftAttitude } from './attitudes';
import { SKILLS, type ID, type Person, type Skill } from './types';

/** Our half-star skill to the original byte: the midpoint of each star band
 * in Character Generation.txt (intelligence 0..256, other skills 0..64). */
const INT_BANDS = [12, 38, 63, 88, 113, 138, 163, 188, 213, 241];
const SKILL_BANDS = [2, 8, 16, 24, 30, 34, 38, 46, 54, 60];
export function skillByte(p: Person, skill: Skill): number {
  const i = Math.max(0, Math.min(9, Math.round((p.skills[skill] ?? .5) * 2) - 1));
  return (skill === 'intelligence' ? INT_BANDS : SKILL_BANDS)[i];
}

/** Base pay by class: 100 for accountant, lawyer (26/27) and crew lieutenant
 * (31); 50 for the other gang classes (28/29). */
function base(p: Person): number {
  return p.role === 'accountant' || p.role === 'lawyer' || p.role === 'lieutenant' ? 100 : 50;
}

/** The weekly asking wage (0x460300 step 6), before the ratchet. */
export function originalWageQuote(p: Person, gangId: ID): number {
  const int = skillByte(p, 'intelligence');
  const others = SKILLS.filter(s => s !== 'intelligence').map(s => skillByte(p, s));
  const specialist = p.role === 'accountant' || p.role === 'lawyer';
  const average = specialist ? int >> 2 : Math.trunc(((int >> 2) + others.reduce((a, b) => a + b, 0)) / 11);
  const best = specialist ? int >> 2 : Math.max(int >> 2, ...others);
  const stars = specialist ? 0 : others.filter(v => v > 52).length;
  return base(p) + Math.trunc((best - fearOf(p, gangId) + hostilityOf(p, gangId) + int + average) / 4) + 10 * stars;
}

/** Loyalty bytes onto our 0..100 scale. */
const loyaltyStep = (bytes: number) => bytes * 100 / 255;
/** 0x460300 step 8: a member below 16 loyalty (byte) deserts. */
export const ORIGINAL_DESERTION_LOYALTY = loyaltyStep(16);

/**
 * Steps 6–7 for one member: recompute the quote, ratchet the stored demand
 * (it never falls; it jumps to the new quote only once 20 above), then judge
 * the wage against it. A penalty also adds 4 hostility towards the gang.
 */
export function originalWeeklyWage(p: Person, gangId: ID): void {
  const quote = originalWageQuote(p, gangId);
  p.payDemand = Math.max(p.payDemand, p.pay);
  if (p.payDemand + 20 < quote) p.payDemand = quote;
  const short = p.payDemand - p.pay;
  if (short <= 0) { p.loyalty = Math.min(100, p.loyalty + loyaltyStep(4)); return; }
  if (short <= 20) return;
  const ratio = 100 * p.pay / Math.max(1, p.payDemand);
  const cut = ratio > 76 ? 4 : ratio > 51 ? 8 : ratio > 26 ? 16 : ratio > 1 ? 32 : 64;
  p.loyalty = Math.max(0, p.loyalty - loyaltyStep(cut));
  shiftAttitude(p, gangId, 4, 0);
}

/**
 * The greed skim (0x48E140 / 0x4C3AA0): only a collector who is hostile to his
 * own gang beyond fear by more than 64 *and* paid below his demand keeps
 * ((h − f + 256) >> 1)/256 of the takings — at least 62.5%. Otherwise nothing.
 */
export function originalSkimFraction(p: Person, gangId: ID): number {
  const margin = hostilityOf(p, gangId) - fearOf(p, gangId);
  if (margin <= 64 || p.pay >= p.payDemand) return 0;
  return (((margin + 256) >> 1) & 0xff) / 256;
}

/**
 * An official's weekly retainer quote, in the original's dollars (the same
 * units as the wage quote above, taken 1:1 as ours): `(eff >> 1) + 50`, where
 * eff is 0x5A4400 `(hostility − fear + 256) >> 1` toward the gang. The lawyer's
 * hire 0x75D3B0 stores this as the fee ($50..$177); the weekly pass 0x75DA90
 * re-quotes it and treats a fifth of the quote as the floor (see below).
 */
export function originalRetainerQuote(p: Person, gangId: ID): number {
  return (effectiveHostility(p, gangId) >> 1) + 50;
}

/** 0x75DA90: the least weekly fee an official accepts, `quote / 5` truncated
 * ($10..$35). A fee below it costs the shortfall in hostility each week. */
export function originalRetainerFloor(p: Person, gangId: ID): number {
  return Math.trunc(originalRetainerQuote(p, gangId) / 5);
}

/** A starting or newly hired member is offered his quote. */
export function originalStartingWage(p: Person, gangId: ID): void {
  p.payDemand = originalWageQuote(p, gangId);
  p.pay = p.payDemand;
}

/**
 * 1.2.21: the wage a recruit will actually be paid on joining this gang, so the
 * hire lists show the same number the books then charge. In the original city
 * the stored demand is a general quote; hiring re-quotes it for the gang (its
 * fear and hostility toward it), which is why a list could say $210 and the
 * first wage come to $133.
 */
export function hireQuote(w: { cityLayout?: { original?: unknown } | null }, p: Person, gangId: ID): number {
  return w.cityLayout?.original ? originalWageQuote(p, gangId) : p.payDemand;
}
