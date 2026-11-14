import type { FinanceReport, Gang, ID, Order, WorldState } from './types';
import { recordCashPeak } from './scoring';
import { originalSkimFraction } from './originalWages';
import { observeTargetRace } from './targetRace';
import { standardRules } from './rules';

export function skimRate(loyalty: number, organization: number): number {
  return Math.min(.4, Math.max(0, (60 - loyalty) / 260) + Math.max(0, (3 - organization) * .02));
}

export function recordTakings(w: WorldState, personId: ID, gross: number, declared: number): void {
  w.personTakings ??= {};
  const old = w.personTakings[personId];
  const entry = old?.week === w.week ? old : { week: w.week, gross: 0, declared: 0 };
  entry.gross += gross; entry.declared += declared; w.personTakings[personId] = entry;
}

/** The lieutenant handles the crew's takings, using the same skimming rule as managers. */
export function receiveOrderCash(w: WorldState, gang: Gang, order: Order, kind: keyof FinanceReport['income'], gross: number): number {
  const lt = w.people[w.teams[order.teamId]?.lieutenantId];
  const collector = lt?.gangId === gang.id && lt.status !== 'dead' ? lt : order.assignedIds.map(id => w.people[id]).find(p => p?.status === 'active');
  // The original city uses the original greed skim (0x48E140).
  const rate = !collector ? 0 : standardRules(w) ? originalSkimFraction(collector, gang.id) : skimRate(collector.loyalty, collector.skills.organization);
  const declared = collector && gross > 0 ? Math.round(gross * (1 - rate)) : gross;
  if (collector) recordTakings(w, collector.id, gross, declared);
  receiveCash(w, gang, kind, declared);
  // 1.2.51: the order's own takings, and the week's protection, full and after the skim.
  order.earned = (order.earned ?? 0) + gross;
  if (kind === 'protection') {
    if (gang.protectionTake?.week !== w.week) gang.protectionTake = { week: w.week, full: 0, declared: 0 };
    gang.protectionTake.full += gross; gang.protectionTake.declared += declared;
  }
  return declared;
}

export function openFinances(w: WorldState, gang: Gang, partial = false): FinanceReport {
  return gang.finances = {
    week: w.week, openingCash: gang.cash, closingCash: gang.cash, partial,
    income: { legal: 0, illegal: 0, protection: 0, other: 0 },
    costs: { wages: 0, purchases: 0, upkeep: 0, tax: 0 },
    taxableProfit: 0, riskyIncome: 0, closedSiteUpkeep: 0, campaignCost: 0,
  };
}

/** Old ledgers cannot separate asset proceeds/operating purchases retrospectively. */
export function currentFinances(w: WorldState, gang: Gang): FinanceReport {
  const report = gang.finances ?? openFinances(w, gang, true);
  if (report.taxableProfit == null) {
    report.taxableProfit = report.income.legal + report.income.illegal + report.income.protection - report.costs.wages - report.costs.upkeep;
    report.partial = true;
  }
  if (report.riskyIncome == null) {
    report.riskyIncome = Math.max(0, report.income.illegal) + Math.max(0, report.income.protection);
    report.partial = true;
  }
  return report;
}

export function recordRiskyIncome(w: WorldState, gang: Gang, amount: number): void {
  const report = currentFinances(w, gang);
  report.riskyIncome! += Math.max(0, amount);
}

function bookReceipt(w: WorldState, gang: Gang, kind: keyof FinanceReport['income'], amount: number, profit: number): void {
  const report = currentFinances(w, gang);
  gang.cash += amount;
  recordCashPeak(w, gang);
  report.income[kind] += amount;
  report.taxableProfit! += profit;
  report.closingCash = gang.cash;
  gang.lastWeekIncome[kind] += amount;
}

export function receiveCash(w: WorldState, gang: Gang, kind: keyof FinanceReport['income'], amount: number): void {
  bookReceipt(w, gang, kind, amount, amount);
  if (kind !== 'legal') recordRiskyIncome(w, gang, amount);
  observeTargetRace(w, [gang.id]);
}

export function receiveAssetCash(w: WorldState, gang: Gang, proceeds: number, basis: number): void {
  bookReceipt(w, gang, 'other', proceeds, proceeds - basis);
  observeTargetRace(w, [gang.id]);
}

export function payCash(w: WorldState, gang: Gang, kind: keyof FinanceReport['costs'], amount: number, treatment: 'operating' | 'capital' = 'operating'): void {
  const report = currentFinances(w, gang);
  recordCashPeak(w, gang);
  gang.cash -= amount;
  report.costs[kind] += amount;
  if (kind !== 'tax' && treatment !== 'capital') report.taxableProfit! -= amount;
  report.closingCash = gang.cash;
  if (kind !== 'tax') gang.lastWeekCosts[kind] += amount;
}

/** 1.2.49 (Robert): bribes paid, per gang and finance week (in memory, not saved), so the weekly cash line can show them apart from purchases. */
const bribeLedger = new WeakMap<WorldState, Map<ID, Map<number, number>>>();

/** A bribe paid out of the gang's purchases (officials, witnesses, jurors, squealers). */
export function noteBribe(w: WorldState, gang: Gang, amount: number): void {
  let byGang = bribeLedger.get(w);
  if (!byGang) { byGang = new Map(); bribeLedger.set(w, byGang); }
  let byWeek = byGang.get(gang.id);
  if (!byWeek) { byWeek = new Map(); byGang.set(gang.id, byWeek); }
  const week = currentFinances(w, gang).week;
  byWeek.set(week, (byWeek.get(week) ?? 0) + amount);
  for (const old of byWeek.keys()) if (old < week - 4) byWeek.delete(old);
}

/** Bribes the gang paid in one finance week (0 when none were noted). */
export function bribesPaid(w: WorldState, gangId: ID, week: number): number {
  return bribeLedger.get(w)?.get(gangId)?.get(week) ?? 0;
}

export function financeNet(report: FinanceReport): number {
  return Object.values(report.income).reduce((a, b) => a + b, 0) - Object.values(report.costs).reduce((a, b) => a + b, 0);
}

export function closeFinances(w: WorldState): void {
  for (const gang of Object.values(w.gangs)) {
    const report = gang.finances ?? openFinances(w, gang, true);
    gang.lastFinanceReport = { ...report, closingCash: gang.cash, income: { ...report.income }, costs: { ...report.costs } };
  }
}
