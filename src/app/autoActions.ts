/**
 * Auto Test as a player who tries things. A ranked table of riskier actions:
 * when a crew and cash are spare, the desk rolls dice weighted by rank, gives
 * the order, and next Monday reads how it went. Success (the men got away with
 * the takings, a stubborn owner gave in, a rival's place went up, a rival was
 * taken or named) moves the action up; arrests, deaths or nothing gained move
 * it down. The table is kept in the diary, so later runs start from it.
 */
import type { Rng } from '../sim/rng';
import { buildingMapIntel } from '../sim/mapIntel';
import type { Building, Gang, ID, Order, Person, Team, WorldState } from '../sim/types';

export const ACTION_KEYS = ['raid', 'pressRefuser', 'torchRival', 'bombRival', 'kidnapRival', 'killRival', 'snitch',
  'bribeJudge', 'bribeDA', 'bribeWitness', 'scareWitness', 'bribeJuror', 'strikeFbi', 'strikeHQ'] as const;
/** Answers to a trial: chosen only while one of the gang's men is up before a court. */
export type ActionKey = (typeof ACTION_KEYS)[number];
export type ActionRanks = Record<ActionKey, number>;

export const ACTION_LABELS: Record<ActionKey, string> = {
  raid: 'rob a rich site', pressRefuser: 'lean on an owner who refused', torchRival: 'torch rival premises',
  bombRival: 'bomb rival premises', kidnapRival: 'kidnap a rival hood', killRival: 'kill a rival hood',
  snitch: 'buy a snitch\'s names',
  bribeJudge: 'bribe the judge on a case', bribeDA: 'bribe the DA for the witness and juror lists',
  bribeWitness: 'pay a witness to forget', scareWitness: 'rough up a witness', bribeJuror: 'pay a juror',
  strikeFbi: 'attack the FBI: kill its director',
  strikeHQ: 'attack a rival HQ our scouts found',
};

export const RANK_MIN = 0.2;
export const RANK_MAX = 4;

export function defaultActionRanks(): ActionRanks {
  return { raid: 1.2, pressRefuser: 1.4, torchRival: 0.8, bombRival: 0.7, kidnapRival: 0.8, killRival: 0.5, snitch: 1,
    bribeJudge: 1.5, bribeDA: 1.2, bribeWitness: 1, scareWitness: 0.8, bribeJuror: 1, strikeFbi: RANK_MIN, strikeHQ: 0.6 };
}

/** Ranks from an earlier run, filled in and clamped. */
export function loadActionRanks(saved: Partial<Record<string, number>> | undefined): ActionRanks {
  const ranks = defaultActionRanks();
  for (const key of ACTION_KEYS) {
    const v = saved?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) ranks[key] = clampRank(v);
  }
  return ranks;
}

const clampRank = (n: number) => Math.round(Math.min(RANK_MAX, Math.max(RANK_MIN, n)) * 100) / 100;

/** Roll one action from those available, weighted by rank. */
export function rollAction(ranks: ActionRanks, available: readonly ActionKey[], rng: Rng): ActionKey | null {
  const total = available.reduce((sum, key) => sum + ranks[key], 0);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const key of available) { roll -= ranks[key]; if (roll < 0) return key; }
  return available[available.length - 1] ?? null;
}

export function rankUp(ranks: ActionRanks, key: ActionKey): number { return (ranks[key] = clampRank(ranks[key] * 1.25 + 0.05)); }
export function rankDown(ranks: ActionRanks, key: ActionKey): number { return (ranks[key] = clampRank(ranks[key] * 0.8)); }

/** An action given this week, judged next Monday. */
export interface PendingAction {
  key: ActionKey;
  orderId?: ID;
  /** For a snitch: how many people the gang knew before. */
  knownBefore?: number;
  targetBuildingId?: ID;
  targetPersonId?: ID;
  /** For a trial answer: the case and its defendant. */
  caseId?: ID;
  defendantId?: ID;
  cashBefore: number;
}

/** The order's fail reason when the crew simply ran out of week. */
export const OUT_OF_TIME = /not enough time|out of time|ran out of (the )?week/i;

const LOST = new Set<Person['status']>(['arrested', 'onTrial', 'jailed', 'dead', 'kidnapped']);

/** True for a success, false for a failure, with a short reason. */
export function judgeAction(w: WorldState, gang: Gang, pending: PendingAction, orders: readonly Order[]): { ok: boolean | null; why: string } {
  if (pending.key === 'snitch') {
    const named = gang.knownPeople.length - (pending.knownBefore ?? gang.knownPeople.length);
    return named > 0 ? { ok: true, why: `${named} rivals named` } : { ok: false, why: 'nobody named' };
  }
  if (pending.key === 'bribeJudge' || pending.key === 'bribeDA') {
    const c = pending.caseId != null ? w.cases?.[pending.caseId] : undefined;
    const official = pending.targetPersonId != null ? w.people[pending.targetPersonId] : undefined;
    const defendant = pending.defendantId != null ? w.people[pending.defendantId] : undefined;
    // The lawyer's visit: one he never made says nothing about the bribe.
    const job = Object.values(w.specialistJobs ?? {}).filter((j) => j.gangId === gang.id && j.type === 'bribeOfficials' && j.targetPersonId === pending.targetPersonId)
      .sort((a, b) => b.id - a.id)[0];
    if (job && (job.state !== 'done' && job.state !== 'failed' || /no longer available|not available/i.test(job.result))) return { ok: null, why: `the lawyer never reached ${official?.name ?? 'the official'} (${job.state})` };
    if (job?.state === 'failed' && !official?.bribedBy && !c?.judgeBribed && !c?.knowsWitnesses) return { ok: false, why: job.result || 'the official would not take it' };
    if (pending.key === 'bribeJudge') {
      if (c?.judgeBribed || c?.status === 'dismissed' || (!c && defendant?.status === 'active')) return { ok: true, why: 'case thrown out' };
      return official?.bribedBy === gang.id ? { ok: true, why: 'judge bought' } : { ok: false, why: 'the judge did not take it' };
    }
    if (c?.knowsWitnesses || c?.knowsJurors) return { ok: true, why: `lists revealed (${c.knowsJurors ? 'witnesses and jurors' : 'witnesses'})` };
    return { ok: false, why: c ? 'no list' : 'case closed before the DA was seen' };
  }
  const order = orders.find((o) => o.id === pending.orderId);
  // 1.2.21: an order that never finished (cancelled, merged, or still queued
  // when the week ran out) is not in last week's list. That says nothing about
  // the action itself: no rank change, and the reason in plain words.
  if (!order) return { ok: null, why: 'the order did not run to the end of the week (cancelled or not reached)' };
  const lost = order.assignedIds.filter((id) => LOST.has(w.people[id]?.status ?? 'active'));
  if (lost.length) return { ok: false, why: `${lost.length} man${lost.length === 1 ? '' : 'en'} lost (${lost.map((id) => w.people[id]?.status).join(', ')})` };
  // Running out of week says nothing about the action itself: no rank change.
  if (order.failReason && OUT_OF_TIME.test(order.failReason) && !order.completedTargets) return { ok: null, why: order.failReason };
  if (order.failReason) return { ok: false, why: order.failReason };
  const target = pending.targetBuildingId != null ? w.buildings[pending.targetBuildingId] : undefined;
  const victim = pending.targetPersonId != null ? w.people[pending.targetPersonId] : undefined;
  switch (pending.key) {
    case 'pressRefuser':
      if (target && target.protection?.gangId === gang.id) return { ok: true, why: 'the owner now pays' };
      break;
    case 'torchRival': case 'bombRival':
      if (target && target.state !== 'trading') return { ok: true, why: `rival site ${target.state}` };
      break;
    case 'kidnapRival':
      if (victim && (victim.status === 'kidnapped' || victim.capturedBy === gang.id)) return { ok: true, why: `${victim.name} taken` };
      break;
    case 'killRival': case 'strikeFbi':
      if (victim && victim.status === 'dead') return { ok: true, why: `${victim.name} dead` };
      break;
    case 'strikeHQ':
      if (target && target.state !== 'trading') return { ok: true, why: `rival HQ ${target.state}` };
      if (victim && victim.status === 'dead') return { ok: true, why: `${victim.name} dead at the HQ` };
      break;
    case 'raid':
      if (order.completedTargets > 0 || order.targetPaid) return { ok: true, why: 'got away with the takings' };
      break;
    case 'bribeWitness': case 'bribeJuror':
      if (victim && victim.bribedBy === gang.id) return { ok: true, why: `${victim.name} took the money` };
      return { ok: false, why: victim ? `${victim.name} refused` : 'gone' };
    case 'scareWitness':
      if (victim && victim.status !== 'active') return { ok: true, why: `${victim.name} ${victim.status}` };
      break;
  }
  return order.completedTargets > 0 ? { ok: true, why: 'done' } : { ok: false, why: order.lastMiss ?? 'nothing gained' };
}

// ------------------------------------------------------------ talent groups

export type CrewRole = 'business' | 'intimidation' | 'collect' | 'muscle' | 'recruit' | 'scout';

/** The job word in a crew's name: "Eddie's Protection", "Eddie's Strike" (1.2.18). */
export const CREW_JOBS: Record<CrewRole, string> = {
  collect: 'Protection', recruit: 'Recruiting', intimidation: 'Intimidation', business: 'Business', muscle: 'Attack', scout: 'Scouting',
};
/** Names Auto Test (or the game) gave: the default "X's Crew", 1.2.17's bare job names, and "X's <Job>". */
const OLD_NAMES = ['Collect Protection', 'Recruiting', 'Extortion', 'Business', 'Strike', 'Scouting'];
/** 1.2.30: the job words crews carried before the extortion crew was renamed Intimidation (1.2.30) and the strike crew Attack (1.2.31). */
const OLD_JOBS = ['Extortion', 'Strike'];
const AUTO_NAME = new RegExp(`^(.+'s (Crew|${Object.values(CREW_JOBS).join('|')}|${OLD_JOBS.join('|')})|${OLD_NAMES.join('|')})( \\d+)?$`);
/** Whether a crew still carries a name the player did not choose. */
export const isAutoCrewName = (name: string) => AUTO_NAME.test(name.trim());
/** The lieutenant's first name and the crew's job; null when the player named the crew. */
export function crewNameFor(current: string, role: CrewRole, lieutenantName: string): string | null {
  if (!isAutoCrewName(current)) return null;
  // 1.2.23 (Robert): the crew that buys and sets up is simply "Business".
  if (role === 'business') return CREW_JOBS.business;
  const first = lieutenantName.trim().split(/\s+/)[0] || 'The';
  return `${first}'s ${CREW_JOBS[role]}`;
}
/** Names for every crew, numbered only where two would otherwise share a name; player names are left alone. */
export function crewNames(crews: { id: number; name: string; role: CrewRole; lieutenantName: string }[]): Map<number, string> {
  const out = new Map<number, string>();
  const taken = new Set(crews.filter((c) => !isAutoCrewName(c.name)).map((c) => c.name));
  const base = crews.map((c) => ({ c, name: crewNameFor(c.name, c.role, c.lieutenantName) }));
  const seen = new Map<string, number>();
  for (const { c, name } of base) {
    if (!name) continue;
    let n = (seen.get(name) ?? 0) + 1;
    let candidate = n > 1 ? `${name} ${n}` : name;
    while (taken.has(candidate)) { n += 1; candidate = `${name} ${n}`; }
    seen.set(name, n);
    taken.add(candidate);
    out.set(c.id, candidate);
  }
  return out;
}
export const recruitTalent = (p: Person) => p.skills.intelligence * 2 + p.skills.organization;
export const scoutTalent = (p: Person) => p.skills.stealth * 2 + p.skills.intelligence + p.skills.driving * 0.5;

export const businessTalent = (p: Person) => p.skills.business * 2 + p.skills.organization + p.skills.intelligence;
export const intimidationTalent = (p: Person) => p.skills.intimidation * 2 + p.skills.fists * 0.5;
export const muscleTalent = (p: Person) => p.skills.firearms * 2 + p.skills.stealth + p.skills.driving * 0.5 + p.skills.explosives * 0.5;
/**
 * 1.2.21: the skills each crew job asks for, read as stars (the mean of the
 * listed skills). Extortion and strike want fists and guns, collection wants
 * driving and organisation, recruiting and bribes want brains.
 */
export const ROLE_SKILLS: Record<CrewRole, readonly (keyof Person['skills'])[]> = {
  intimidation: ['intimidation', 'fists'],
  muscle: ['firearms', 'fists', 'stealth'],
  collect: ['driving', 'organization'],
  recruit: ['intelligence', 'organization'],
  business: ['business', 'organization'],
  scout: ['stealth', 'intelligence', 'driving'],
};
export const roleStars = (p: Person, role: CrewRole) => ROLE_SKILLS[role].reduce((sum, k) => sum + (p.skills[k] ?? 0), 0) / ROLE_SKILLS[role].length;
/** A crew's job read back from its auto name ("Eddie's Strike"), or null. */
export function crewRoleFromName(name: string): CrewRole | null {
  if (/^Business( \d+)?$/.test(name.trim())) return 'business';
  if (/'s Extortion( \d+)?$/.test(name)) return 'intimidation';
  if (/'s Strike( \d+)?$/.test(name)) return 'muscle';
  for (const [role, job] of Object.entries(CREW_JOBS) as [CrewRole, string][]) if (new RegExp(`'s ${job}( \\d+)?$`).test(name)) return role;
  return null;
}
const totalSkill = (p: Person) => Object.values(p.skills).reduce((a, b) => a + b, 0);

/**
 * 1.2.30 (Robert's rule): crews open in this order — recruiting first, then
 * the business crew, then intimidation and protection collecting; later
 * crews do the rough work, the scouting, and then collect. Until the
 * business crew exists nobody buys.
 */
export const CREW_OPENING_ORDER: readonly CrewRole[] = ['recruit', 'business', 'intimidation', 'collect', 'muscle', 'scout'];
/** 1.2.30: the basic crews, formed (and rebuilt) before the gang expands. */
export const BASIC_CREWS: readonly CrewRole[] = ['recruit', 'business', 'intimidation', 'collect'];

/**
 * Each crew keeps its job for as long as it exists (a lieutenant in custody
 * does not hand his crew's job to another crew). A crew without a job takes
 * the job its auto name says, else the first job in the opening order no crew
 * holds yet, else collecting. `kept` is updated in place.
 */
export function assignCrewRoles(teams: readonly Team[], kept: Map<ID, CrewRole>): Map<ID, CrewRole> {
  const ids = new Set(teams.map((t) => t.id));
  for (const id of [...kept.keys()]) if (!ids.has(id)) kept.delete(id);
  for (const t of [...teams].sort((a, b) => a.id - b.id)) {
    if (kept.has(t.id)) continue;
    const held = new Set(kept.values());
    const named = crewRoleFromName(t.name);
    const role = named && (named === 'collect' || !held.has(named)) ? named : CREW_OPENING_ORDER.find((r) => !held.has(r)) ?? 'collect';
    kept.set(t.id, role);
  }
  return new Map(teams.map((t) => [t.id, kept.get(t.id)!] as const));
}

/** Swap men so each crew gets the hoods its role wants. Returns the moves to make. */
export function talentSwaps(w: WorldState, teams: readonly Team[], roles: Map<ID, CrewRole>, limit = 3): { personId: ID; toTeamId: ID }[] {
  const moves: { personId: ID; toTeamId: ID }[] = [];
  const score: Record<CrewRole, (p: Person) => number> = { business: businessTalent, intimidation: intimidationTalent, muscle: muscleTalent, recruit: recruitTalent, scout: scoutTalent, collect: (p) => -totalSkill(p) };
  const moved = new Set<ID>();
  for (const role of ['business', 'intimidation', 'muscle'] as const) {
    const team = teams.find((t) => roles.get(t.id) === role);
    // 1.2.24: crews are filled to the maximum, no longer evened out.
    if (!team || team.memberIds.length >= 9) continue;
    // The best man for this role who sits in a crew with a different role.
    // 1.2.25: the business crew lends nobody to another crew.
    const candidates = teams.filter((t) => t !== team && roles.get(t.id) !== role && roles.get(t.id) !== 'business' && t.memberIds.length > 2)
      .flatMap((t) => t.memberIds.map((id) => w.people[id]).filter((p): p is Person => !!p && p.status === 'active' && p.orderId == null && !moved.has(p.id)));
    const mine = team.memberIds.map((id) => w.people[id]).filter((p): p is Person => !!p);
    const worstMine = mine.length ? Math.min(...mine.map(score[role])) : -Infinity;
    const best = candidates.sort((a, b) => score[role](b) - score[role](a))[0];
    if (best && score[role](best) > worstMine + 1) { moves.push({ personId: best.id, toTeamId: team.id }); moved.add(best.id); }
    if (moves.length >= limit) break;
  }
  return moves;
}

// ------------------------------------------------------------ cars

/** Walking and driving speeds (metres a minute), from the sim's constants. */
export function carMinutesSaved(distanceMetres: number, walkPerMinute: number, drivePerMinute: number, trips = 2): number {
  if (distanceMetres <= 0 || walkPerMinute <= 0 || drivePerMinute <= walkPerMinute) return 0;
  return trips * (distanceMetres / walkPerMinute - distanceMetres / drivePerMinute);
}

/**
 * A rich site worth robbing: a bank or jeweller, or premises our map shows as
 * a rival's (1.2.25: only what the player can see — the map's owner, never the
 * stock inside or an owner our scouts have not found).
 */
export function raidValue(b: Building, gangId: ID): number {
  if (b.state !== 'trading' || b.cls === 'municipal' || b.cls === 'empty') return 0;
  const owner = buildingMapIntel(b, gangId).ownerGangId;
  if (b.ownerGangId === gangId || owner === gangId) return 0;
  const rich = /bank|jewel|furrier|financeCompany|departmentStore/i.test(b.typeId) ? 40 : 0;
  return rich + (owner != null ? 10 : 0);
}
