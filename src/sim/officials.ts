import { effectiveHostility, hostilityOf, NO_ORIGINAL_CHANNEL, opinionSet, shiftAttitude } from './attitudes';
import { originalRetainerQuote } from './originalWages';
import { quitGangPayroll } from './payrollMark';
import type { ApiResult } from './api';
import { activeBlocks, blockPavement } from './cityLayout';
import { createPerson } from './citygen';
import { addMessage, addNews } from './events';
import { payCash } from './finances';
import { clearDestination } from './movement';
import type { Rng } from './rng';
import type { ID, Person, WorldState } from './types';

export function isBribableOfficial(p: Person): boolean {
  return p.status === 'active' && ['mayor', 'policeChief', 'judge', 'da', 'police'].includes(p.role);
}

/** Bribe prices tuned to original-game values: a base plus a multiplier
 * scaled by how hostile the official is (0..1 over effective hostility). An
 * official sitting on one of the gang's cases asks the case price. */
const BRIBE_PRICE: Record<string, { base: number; mult: number; caseBase?: number; caseMult?: number }> = {
  mayor: { base: 10000, mult: 10000 },
  policeChief: { base: 10000, mult: 10000 },
  judge: { base: 4000, mult: 8000, caseBase: 10000, caseMult: 20000 },
  da: { base: 2000, mult: 2000, caseBase: 5000, caseMult: 3000 },
  police: { base: 500, mult: 500 },
};
/** Effective hostility (0..255, 128 neutral) above which an official will not take money. */
export const BRIBE_REFUSAL_HOSTILITY = 224;

function sitsOnCase(w: WorldState, p: Person, gangId: ID): boolean {
  return Object.values(w.cases ?? {}).some((c) => c.gangId === gangId && ['awaiting', 'onTrial'].includes(c.status) &&
    (c.judgeId === p.id || c.daId === p.id));
}

export function bribePrice(w: WorldState, p: Person, gangId: ID): number {
  const row = BRIBE_PRICE[p.role] ?? BRIBE_PRICE.police;
  const share = Math.max(0, Math.min(1, effectiveHostility(p, gangId) / 255));
  const onCase = row.caseBase != null && p.role !== 'police' && sitsOnCase(w, p, gangId);
  const base = onCase ? row.caseBase! : row.base, mult = onCase ? row.caseMult! : row.mult;
  return Math.round((base + mult * share) / 50) * 50;
}

/** The manual: money works unless the official is very hostile towards you. */
export function refusesBribe(p: Person, gangId: ID): boolean {
  return effectiveHostility(p, gangId) > BRIBE_REFUSAL_HOSTILITY;
}

/** Called only after the lawyer reaches the official and completes the visit. */
export function completeOfficialBribe(w: WorldState, gangId: ID, p: Person, price: number): ApiResult {
  const gang = w.gangs[gangId];
  if (!gang || !isBribableOfficial(p)) return { ok: false, error: 'That official is no longer available.' };
  if (gang.cash < price) return { ok: false, error: 'There is no longer enough cash for the agreed bribe.' };
  if (refusesBribe(p, gangId)) {
    // Too hostile to be bought: he keeps his hands clean and thinks less of the gang.
    shiftAttitude(p, gangId, 8, 0);
    return { ok: false, error: `${p.name} is too hostile to take your money.` };
  }
  payCash(w, gang, 'purchases', price);
  p.bribedBy = gangId;
  opinionSet(p, gangId, Math.min(100, (p.opinion[gangId] ?? 0) + 34), NO_ORIGINAL_CHANNEL);
  for (const c of Object.values(w.cases)) {
    if (c.gangId !== gangId || !['awaiting', 'onTrial'].includes(c.status)) continue;
    if (c.judgeId === p.id) {
      c.judgeBribed = true;
      c.status = 'dismissed';
      const defendant = w.people[c.defendantId];
      if (defendant && ['arrested', 'onTrial'].includes(defendant.status)) {
        defendant.status = 'active'; defendant.jailWeeks = 0;
        defendant.wanted = Math.max(0, defendant.wanted - 30);
        clearDestination(defendant);
      }
      if (gang.isPlayer) w.weekLog.push(`The case against ${defendant?.name ?? 'your hood'} was dismissed after the judge's visit.`);
      if (gang.isPlayer) addMessage(w, 'police', `${defendant?.name ?? 'Your hood'} walked free — case dismissed.`);
    }
    if (c.daId === p.id) {
      if (!c.knowsWitnesses) c.knowsWitnesses = true;
      else c.knowsJurors = true;
    }
  }
  return { ok: true, message: `${p.name} took the money.` };
}

export function completePoliceEmployment(w: WorldState, gangId: ID, p: Person): ApiResult {
  const gang = w.gangs[gangId];
  if (!gang || p.role !== 'police' || p.status !== 'active') return { ok: false, error: 'That officer is not available.' };
  if (p.employedBy === gangId) return { ok: true, message: `${p.name} is already on your payroll.` };
  if (p.employedBy != null) return { ok: false, error: 'That officer is already on another gang\'s payroll.' };
  // 0x75D3B0 does nothing for an official who still carries the gang's bit.
  if (quitGangPayroll(p, gangId)) return { ok: false, error: `${p.name} quit your payroll and will not go back on it.` };
  const original = !!w.cityLayout?.original;
  // Original city, the lawyer's hire 0x75D3B0: the fee is the official's quote
  // (eff >> 1) + 50 taken before the hire, which then halves his hostility
  // toward the gang (vt+0x6C add-hostility −(h >> 1)). It has no cash check.
  const retainer = original ? originalRetainerQuote(p, gangId) : Math.round(120 + p.skills.intelligence * 40);
  if (!original && gang.cash < retainer * 2) return { ok: false, error: 'You cannot cover the retainer.' };
  p.employedBy = gangId; p.weeklyRetainer = retainer;
  if (original) shiftAttitude(p, gangId, -(hostilityOf(p, gangId) >> 1), 0);
  opinionSet(p, gangId, Math.min(100, (p.opinion[gangId] ?? 0) + 30), NO_ORIGINAL_CHANNEL);
  if (!gang.employedPoliceIds.includes(p.id)) gang.employedPoliceIds.push(p.id);
  return { ok: true, message: `${p.name} is on the payroll at ${retainer.toLocaleString('en-US')} a week.` };
}

/**
 * A police chief killed or sent down is replaced when the week ends: a new
 * one comes in from outside, with no friends in the gangs yet, and the papers
 * say so. (A kidnapped or arrested chief keeps the post.)
 */
export function replacePoliceChief(w: WorldState, rng: Rng): Person | null {
  const old = w.people[w.policeChiefId];
  if (old && old.status !== 'dead' && old.status !== 'jailed') return null;
  const civic = activeBlocks(w).filter(b => b.district === 'civic');
  const block = rng.pick(civic.length ? civic : activeBlocks(w));
  const chief = createPerson(w, rng, 'policeChief', blockPavement(block, w.nextId), { quality: 1.15 });
  w.policeChiefId = chief.id;
  const why = !old ? '' : old.status === 'dead' ? `, after the death of ${old.name}` : `, after ${old.name} was sent to prison`;
  addNews(w, {
    section: 'law',
    headline: 'NEW POLICE CHIEF SWORN IN',
    frontPagePriority: 2,
    body: `${chief.name} was sworn in as Chief of Police this week${why}, promising to clean up the city's streets.`,
    gangId: null,
  });
  w.weekLog.push(`${chief.name} became Chief of Police.`);
  return chief;
}
