/**
 * The original's two attitude channels, per person and gang: hostility and
 * fear, each a byte (0..255). The single remake `Person.opinion` scalar stays
 * for the systems that were written against it; the recovered election tally
 * and anything else ported from the original reads these channels instead.
 *
 * Initial values: `base + rand % range` from Constants.xtx per actor class
 * (OWNER_/CIVILIAN_/HOOD_/… HOSTILITY and FEAR, #12..#63). A person who has
 * never been written holds that roll, derived from a stable hash of the person
 * and gang so the remake's RNG sequence and old saves are unchanged. Owners
 * and civilians roll fear as base + roll + their hostility, so they start
 * close to neutral (h − f = −(fear base + roll)); the sum never goes negative.
 *
 * Shopkeepers in the original city also get the HQ-distance initialisation of
 * Gang_PlaceHeadquarters (0x6566A0): see `seedOriginalOwnerAttitudes`.
 */
import type { ID, Person, PersonRole, WorldState } from './types';
import { buildingList, peopleList } from './entityLists';
import { CENTRE_LOT } from './world';
import { buildingClaimants } from './territory';
import { standardRules } from './rules';
import { FEAR_LOST_UNCOLLECTED } from './fitnessWeights';

interface Channel { base: number; range: number }
interface AttitudeClass { hostility: Channel; fear: Channel }
const cls = (hBase: number, hRange: number, fBase: number, fRange: number): AttitudeClass =>
  ({ hostility: { base: hBase, range: hRange }, fear: { base: fBase, range: fRange } });

/** Constants.xtx fear/hostility bases and ranges, by original actor class. */
export const ORIGINAL_ATTITUDE_CONSTANTS = {
  owner: cls(20, 130, -20, 100), civilian: cls(20, 130, -20, 100), illegalPerson: cls(0, 256, 0, 128),
  hood: cls(0, 256, 0, 128), police: cls(0, 256, 0, 128), policeChief: cls(128, 128, 0, 128),
  fbi: cls(0, 256, 0, 128), fbiHead: cls(128, 128, 0, 128), attorney: cls(128, 128, 0, 128),
  judge: cls(128, 128, 0, 128), mayor: cls(128, 128, 0, 128), reporter: cls(128, 128, 0, 128),
  religiousLeader: cls(128, 128, 0, 128),
} as const;

const CLASS_BY_ROLE: Record<PersonRole, keyof typeof ORIGINAL_ATTITUDE_CONSTANTS> = {
  boss: 'hood', lieutenant: 'hood', hood: 'hood', accountant: 'illegalPerson', lawyer: 'illegalPerson',
  citizen: 'civilian', snitch: 'civilian', owner: 'owner', police: 'police', firefighter: 'police',
  policeChief: 'policeChief', fbi: 'fbi', fbiHead: 'fbiHead', judge: 'judge', da: 'attorney', mayor: 'mayor',
  reporter: 'reporter', clergy: 'religiousLeader',
};

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function hash(a: number, b: number, salt: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + salt, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return h >>> 0;
}

/** The creation roll for one channel, stable per person and gang. */
export function initialAttitude(p: Pick<Person, 'id' | 'role'>, gangId: ID, channel: 'hostility' | 'fear'): number {
  const kind = CLASS_BY_ROLE[p.role] ?? 'civilian';
  const c = ORIGINAL_ATTITUDE_CONSTANTS[kind][channel];
  const roll = c.base + hash(p.id, gangId, channel === 'fear' ? 0x51ed : 0x4a7c) % c.range;
  // Owners (0x5A2CD0) and civilians (0x5D1FB0) add the hostility just rolled
  // to their fear; hoods, police and officials roll the two apart.
  if (channel === 'fear' && FEAR_ADDS_HOSTILITY.has(kind)) return clampByte(roll + initialAttitude(p, gangId, 'hostility'));
  return clampByte(roll);
}
const FEAR_ADDS_HOSTILITY = new Set<keyof typeof ORIGINAL_ATTITUDE_CONSTANTS>(['owner', 'civilian']);

export function hostilityOf(p: Person, gangId: ID): number {
  return p.hostility?.[gangId] ?? initialAttitude(p, gangId, 'hostility');
}
export function fearOf(p: Person, gangId: ID): number {
  return p.fear?.[gangId] ?? initialAttitude(p, gangId, 'fear');
}

/** Set channels directly (original setters vt+104 hostility, 0x405E7F fear). */
export function setAttitude(p: Person, gangId: ID, values: { hostility?: number; fear?: number }): void {
  if (values.hostility != null) (p.hostility ??= {})[gangId] = clampByte(values.hostility);
  if (values.fear != null) (p.fear ??= {})[gangId] = clampByte(values.fear);
}

/** Add to either channel, saturating at the byte limits. */
export function shiftAttitude(p: Person, gangId: ID, hostility: number, fear: number): void {
  setAttitude(p, gangId, {
    ...(hostility ? { hostility: hostilityOf(p, gangId) + hostility } : {}),
    ...(fear ? { fear: fearOf(p, gangId) + fear } : {}),
  });
}

/** 0x5A4400: (hostility − fear + 256) >> 1. Below 64 supports, 164+ rejects. */
export function effectiveHostility(p: Person, gangId: ID, suppressSelf = false): number {
  return ((suppressSelf ? 0 : hostilityOf(p, gangId)) - fearOf(p, gangId) + 256) >> 1;
}

/** Hostility and fear bands by whole blocks from the gang's HQ (0x6566A0 tail). */
const OWNER_BANDS: readonly [number, number][] = [[50, 100], [60, 90], [70, 90], [80, 80], [90, 80], [100, 70], [100, 70],
  [110, 60], [110, 60], [120, 50], [120, 50]];

/**
 * After placing the HQs the original walks every building cell whose occupier
 * is a shopkeeper (type 15) and, by Euclidean distance from each gang's HQ in
 * whole blocks (0x60ACF0: 96 units per fine cell, / 480), sets hostility to
 * `rand % range` and fear to the band's fear plus that hostility, so the
 * effective value is `(256 − band fear) >> 1` whatever the roll. Beyond ten blocks
 * the switch default calls vt+0x6C (owner vtable 0x780118 → 0x401942 →
 * 0x5A2B10, add hostility, saturating) with twice the block count: the
 * creation roll stands, two points more hostile per block, and no LCG draw.
 * `next` is the original-city LCG.
 */
export function seedOriginalOwnerAttitudes(
  hqs: readonly { gangId: ID; fx: number; fy: number }[], ownerCells: readonly { owner: Person; fx: number; fy: number }[],
  next: () => number,
): void {
  for (const hq of hqs) for (const { owner, fx, fy } of ownerCells) {
    const units = Math.trunc(Math.hypot(fx - hq.fx, fy - hq.fy) * 96);
    const blocks = Math.trunc(units / 480), band = OWNER_BANDS[blocks];
    if (!band) { shiftAttitude(owner, hq.gangId, blocks * 2, 0); continue; }
    // Hostility (byte +0x18) is set first; the fear setter (0x5A42E0, byte
    // +0x1C) then takes the band plus the getter 0x5A2AB0, which reads +0x18 —
    // the hostility just set, not the old fear.
    const hostility = next() % band[0];
    setAttitude(owner, hq.gangId, { hostility, fear: band[1] + hostility });
  }
}

/**
 * Move the remake opinion and the original channels together. Writers with a
 * traced original effect pass it; otherwise the opinion change is carried into
 * hostility at the byte scale (1.28 per opinion point, love lowering hostility)
 * with fear unchanged — a remake mapping, not an original delta.
 */
export function opinionShift(p: Person, gangId: ID, delta: number,
  original?: { hostility: number; fear: number }): void {
  p.opinion[gangId] = (p.opinion[gangId] ?? 0) + delta;
  if (original) shiftAttitude(p, gangId, original.hostility, original.fear);
  else shiftAttitude(p, gangId, -Math.round(delta * 1.28), 0);
}

/** Set the opinion to a value, carrying the change into the channels as above. */
export function opinionSet(p: Person, gangId: ID, value: number,
  original?: { hostility: number; fear: number }): void {
  opinionShift(p, gangId, value - (p.opinion[gangId] ?? 0), original);
}

/** No attitude-channel write in the original. The complete set of callers of
 * the hostility/fear writers (0x5A2B10/0x5A2BB0/0x5A2C50/0x5A42E0, directly and
 * through vt+0x68/+0x6C) contains no bribe, payroll, officials' drift or
 * FBI-violence handler, so these move the remake opinion only. */
export const NO_ORIGINAL_CHANNEL = { hostility: 0, fear: 0 } as const;

/** Leaving a gang: Gang_RemoveMember (0x6D87A0) calls vt+0x108, which for hoods
 * (0x4C0A20) and specialists (0x6F9300) adds 64 hostility towards the gang.
 * Reached by sacking (cmd1), dismissing a professional (cmd13/17) and the
 * weekly defection (0x460300 → 0x40819D). */
export const LEFT_GANG = { hostility: 64, fear: 0 } as const;

/** Gang_HandleMemberDeath (0x6D8360) → 0x48D1A0 → 0x48D0B0: every remaining
 * member of the gang (boss, crews, specialists) gains 16 fear of it. */
export const MEMBER_DEATH_FEAR = 16;

/**
 * 0x527640, each premises' weekly update: an occupier (one whose state bits
 * +0x24 & 0x38000000 read 2 or 3 is evicted instead — dead or jailed, by our
 * reading of those states) who is no gangster (0x712D30: classes 26..31),
 * at premises with a protecting gang (vt+0xB0), loses 5 fear of that gang
 * (0x409516 → 0x5A2BB0) unless cell flag 1 or 8 is set. The flags (vt+0x88,
 * bits 3 and 6 of cell +0x38) are written only by the collect-protection order
 * 0x4CD730: 1 = the owner paid at a collection call, 8 = he refused (hostile,
 * or the till came up short). So fear fades where the racket went uncollected.
 * The city's weekly step clears them: 0x663A00 (called at 0x66059A, after the
 * gangs' turns) masks every lot's flags with 0x1C0, dropping 1, 2, 4, 8, 0x10,
 * 0x20 and 0x200 up. So a flag lasts the week it was set, and one collection
 * call per premises per week; the remake keys them to the week just ended
 * (the update runs after the week rolls over).
 */
export function weeklyProtectionFear(w: WorldState): void {
  const lastWeek = w.week - 1;
  for (const b of buildingList(w)) {
    const owner = b.ownerPersonId != null ? w.people[b.ownerPersonId] : null, racket = b.protection;
    if (!racket || !owner || owner.status === 'dead' || owner.status === 'jailed' || owner.gangId != null) continue;
    if (!w.gangs[racket.gangId]) continue;
    if (racket.collectedWeek === lastWeek || racket.refusedWeek === lastWeek) continue;
    shiftAttitude(owner, racket.gangId, 0, -FEAR_LOST_UNCOLLECTED);
  }
}

/**
 * How friendly a person is to a gang on the −100..100 scale the map overlays
 * use. The original city reads the original channels (effective hostility,
 * 128 = neutral; the vote tally keeps blocks below 64 and rejects 164+);
 * compact cities keep the remake opinion.
 */
export function attitudeScore(w: WorldState, p: Person, gangId: ID): number {
  if (!standardRules(w)) return p.opinion[gangId] ?? 0;
  return Math.max(-100, Math.min(100, (128 - effectiveHostility(p, gangId)) / 1.28));
}

/** Constants.xtx read #64, OWNER_SQUEAL_BASE. */
export const OWNER_SQUEAL_BASE = 125;

/**
 * An owner's squeal level toward a gang, the baseline of 0x5A4520 (occupier
 * vt+0x78): hostility + OWNER_SQUEAL_BASE + 20 if the gang holds no influence
 * at the premises − fear, clamped to a byte. Above 200, a refusing owner files
 * a crime record against the gang (0x4CD730 ln 210-217; 0x4DD9C0 reads the same
 * byte). The original caches this in +0x20 and moves the cache a quarter of
 * the way to the baseline each week (0x5A40E0); the remake reads the baseline
 * directly, so a change in hostility or fear takes effect at once.
 */
export function ownerSquealLevel(p: Person, gangId: ID, gangHasInfluence: boolean): number {
  return clampByte(hostilityOf(p, gangId) + OWNER_SQUEAL_BASE + (gangHasInfluence ? 0 : 20) - fearOf(p, gangId));
}

/**
 * The `damage` argument the original order handlers pass to 0x4DE430
 * (dispatch 0x4C3DD0; order names from OrderFailed.xtx).
 */
export const BLAST_DAMAGE = {
  bomb: 400, bombFailed: 50,          // order 0x19, 0x4D2950
  torch: 200, torchFailed: 50,        // order 0x1C, 0x4D3AB0
  smashUp: 100,                       // order 0x1B, 0x4D3290 (no failure call)
  assault: 100,                       // order 0x18, 0x4D6060 state 5, at the victim
  kill: 200,                          // order 0x1A, 0x4D6E40, once the victim is dead
} as const;

/**
 * 0x4DE430's radius in blocks: 2 when the order carries flag bit 2, else 5.
 * Order creation 0x4C8BB0 sets that bit for a bomb, smash-up or torch (0x19,
 * 0x1B, 0x1C) whose target fine cell is a block's centre (x % 5 = y % 5 = 2),
 * the illegal-business site — the remake's centre lot.
 */
export function blastRadius(w: WorldState, damaged: { lotId?: ID }): 2 | 5 {
  return damaged.lotId != null && w.lots[damaged.lotId]?.index === CENTRE_LOT ? 2 : 5;
}

/**
 * The original actor class (person byte +0x0A) behind each remake role, as
 * 0x4DE430 switches on it. From the class-byte stores in the constructors:
 * 0x0F shopkeeper (0x5A1580), 0x10 civilian (0x5D1D20), 0x11 policeman
 * (0x516240; 0x12 is a police squad), 0x13 FBI agent (0x425430; 0x14 an FBI
 * squad), 0x15 judge (0x486F90, the city list +0xE4 whose size is
 * Constants.xtx "number of judges"), 0x16 attorney (0x4FBC70, list +0x104,
 * "number of attourneys"), 0x18 reporter (0x468AB0, the one at the
 * newspaper), 0x19/0x23 religious (0x702640; 0x6EF0A0 derives from it with a
 * follower list +0x7C, city list +0x44), 0x1A accountant, 0x1B lawyer, 0x1C
 * gangster, 0x1D unattached hood, 0x1E boss, 0x1F lieutenant, 0x20 mayor
 * (0x4C2E20), 0x21 police chief (0x56D040), 0x22 FBI head (0x4F3EC5). Remake
 * mapping: a snitch is a civilian, a firefighter a policeman (as in
 * `CLASS_BY_ROLE`), the clergy are the 0x23 leaders.
 */
export const ORIGINAL_ACTOR_CLASS: Record<PersonRole, number> = {
  owner: 0x0F, citizen: 0x10, snitch: 0x10, police: 0x11, firefighter: 0x11, fbi: 0x13, judge: 0x15, da: 0x16,
  reporter: 0x18, clergy: 0x23, accountant: 0x1A, lawyer: 0x1B, hood: 0x1C, boss: 0x1E, lieutenant: 0x1F,
  mayor: 0x20, policeChief: 0x21, fbiHead: 0x22,
};

/**
 * The block byte +0x6A + g that 0x4DE430 and 0x5A2AE0 test: a per-gang count
 * of the block's lots, not a flag. Its only writers are the protector setter
 * 0x526570 (cell +0x30, read back by vt+0xB0: −1 for the old protecting gang,
 * +1 for the new) and the occupier setter 0x52572F (cell +0x2C: −1/+1 for a
 * gangster or lieutenant, 0x1C/0x1F, by his gang +0x84 & 0x1F, or the boss,
 * 0x1E, by +0xF8; a gangster moving in also makes his gang the protector,
 * vt+0xB4, when it has no claim there). When a count reaches 0 or leaves it,
 * 0x411EC0 / 0x411E80 redraw the block's territory. So a gang is present in a
 * block when it protects a lot there or one of its men runs a lot there (its
 * own businesses and its HQ). Remake mapping: a standing business in that
 * block (not merged into its neighbours) that the gang protects or owns —
 * `buildingClaimants`, which is also how the remake draws territory.
 */
export function gangsPresentInBlock(w: WorldState, blockId: ID): ID[] {
  const present = new Set<ID>();
  for (const b of buildingList(w)) if (b.blockId === blockId) for (const g of buildingClaimants(w, b)) present.add(g);
  return [...present].sort((a, b) => a - b);
}

/**
 * 0x4DE430: the damage an order does to its victim (the occupier of the
 * target premises, or the man assaulted or killed), toward the attacker's gang
 * (`gangId`, the order's gang +0x84 & 0x1F). With d the damage and
 * f = 100 + d·10/100, first the victim himself, by his class:
 * - shopkeeper (0x0F): +48·d/100 fear;
 * - civilian (0x10): fear × f/100, but a witness on a case (+0x64 bit 0x10000)
 *   is struck off it instead (0x579470 / 0x4F8620 find the police or FBI case,
 *   0x723BB0 drops him and takes a fifth off the case value +0x24) and gains
 *   +32·d/100 fear;
 * - policemen, judges, attorneys, reporter, the religious, the mayor and the
 *   police chief (0x11, 0x12, 0x15, 0x16, 0x18, 0x19, 0x20, 0x21, 0x23): fear
 *   × f/100 (0x5A42E0, clamped);
 * - FBI agents and the FBI head (0x13, 0x14, 0x22): hostility ×
 *   (100 + d·20/100)/100;
 * - accountant and lawyer (0x1A, 0x1B): fear × f/100 when in no gang
 *   (+0x84 & 0x1F = 15), else hostility × f/100;
 * - gang men (0x1C–0x1F): hostility × f/100.
 * The hostility scalings go through vt+0x68, which on every person vtable is
 * 0x5A2C50: it stores the low byte, so a product over 255 wraps.
 *
 * Then, by the same class, who else takes it badly (vt+0x6C, 0x5A2B10: add,
 * clamped), always toward the attacker's gang except in the first row:
 * - shopkeeper, civilian, accountant, lawyer, gang men: for every gang present
 *   in the victim's block (see `gangsPresentInBlock`) the mayor (city+0x2A4)
 *   and police chief (city+0x29C) +4·d/100 toward that gang; then the area
 *   pass (radius `blastRadius`) — each shopkeeper in it +48·d/100 fear if the
 *   attacker protects his premises (vt+0xB0), else +8·d/100, and +8·d/100
 *   hostility toward each gang present in his own block (0x5A2AE0). Nothing at
 *   all when the premises have no occupier (the class defaults to 0x0F but
 *   the branch needs one);
 * - policeman: mayor +8, police chief +16, every policeman +8 (0x573BA0 walks
 *   the department, the victim included);
 * - FBI agent: mayor +8, FBI head (city+0x2A0) +16, every agent +8 (0x4F7A80);
 * - judge: mayor, police chief, FBI head +16; the other judges +32; the
 *   attorneys +16;
 * - attorney: mayor, police chief, FBI head +16; the judges +16; the other
 *   attorneys +32;
 * - reporter: mayor and police chief +64, FBI head +32, judges and attorneys
 *   +32, the other reporters +64, the religious +16;
 * - religious: every other religious person +64;
 * - mayor: police chief +64 and every policeman +8, FBI head +64 and every
 *   agent +8, judges and attorneys +32;
 * - police chief: mayor and FBI head +64, every policeman +8, judges and
 *   attorneys +16;
 * - FBI head: mayor +64, the FBI head (himself: the original reads
 *   city+0x2A0 here) +64, every agent +8, judges and attorneys +16.
 * (each figure ·d/100). Bomb, torch and smash-up call it with the premises'
 * occupier; assault and kill with the victim (`BLAST_DAMAGE`).
 */
export function blastFear(w: WorldState, gangId: ID,
  damaged: { blockId: ID; ownerPersonId: ID | null; managerId?: ID | null; lotId?: ID }, damage: number): void {
  const victimId = damaged.ownerPersonId ?? damaged.managerId ?? null;
  const victim = victimId != null ? w.people[victimId] : undefined;
  if (!victim) return;
  const cls = ORIGINAL_ACTOR_CLASS[victim.role];
  const part = (k: number) => Math.trunc(k * damage / 100);
  const f = Math.trunc(damage * 10 / 100) + 100;
  const scaleFear = (k: number) => setAttitude(victim, gangId, { fear: Math.trunc(fearOf(victim, gangId) * k / 100) });
  const scaleHostility = (k: number) =>
    setAttitude(victim, gangId, { hostility: Math.trunc(hostilityOf(victim, gangId) * k / 100) & 0xFF });
  switch (cls) {
    case 0x0F: shiftAttitude(victim, gangId, 0, part(48)); break;
    case 0x10: {
      const strikeOff = Object.values(w.cases ?? {}).sort((a, b) => a.id - b.id).find(c => c.witnessIds.includes(victim.id));
      if (strikeOff) {
        strikeOff.witnessIds = strikeOff.witnessIds.filter(id => id !== victim.id);
        strikeOff.strength -= Math.trunc(strikeOff.strength / 5);
        shiftAttitude(victim, gangId, 0, part(32));
      } else scaleFear(f);
      break;
    }
    case 0x11: case 0x15: case 0x16: case 0x18: case 0x20: case 0x21: case 0x23: scaleFear(f); break;
    case 0x13: case 0x22: scaleHostility(Math.trunc(damage * 20 / 100) + 100); break;
    case 0x1A: case 0x1B: if (victim.gangId == null) scaleFear(f); else scaleHostility(f); break;
    case 0x1C: case 0x1E: case 0x1F: scaleHostility(f); break;
  }

  const living = (id: ID | null | undefined) => {
    const p = id == null ? undefined : w.people[id];
    return p && p.status !== 'dead' ? p : undefined;
  };
  const toward = (p: Person | undefined, k: number, g = gangId) => { if (p) shiftAttitude(p, g, part(k), 0); };
  const everyone = (role: PersonRole) => peopleList(w).filter(p => p.role === role && p.status !== 'dead');
  const listed = (ids: readonly ID[] | undefined) => (ids ?? []).map(living).filter((p): p is Person => !!p);
  const others = (people: readonly Person[]) => people.filter(p => p.id !== victim.id);
  const mayor = living(w.mayorId), chief = living(w.policeChiefId), fbiHead = living(w.fbiHeadId);
  const judges = listed(w.judgeIds), attorneys = listed(w.daIds);
  switch (cls) {
    case 0x11:
      toward(mayor, 8); toward(chief, 16);
      for (const p of everyone('police')) toward(p, 8);
      return;
    case 0x13:
      toward(mayor, 8); toward(fbiHead, 16);
      for (const p of everyone('fbi')) toward(p, 8);
      return;
    case 0x15:
      for (const p of [mayor, chief, fbiHead]) toward(p, 16);
      for (const p of others(judges)) toward(p, 32);
      for (const p of attorneys) toward(p, 16);
      return;
    case 0x16:
      for (const p of [mayor, chief, fbiHead]) toward(p, 16);
      for (const p of judges) toward(p, 16);
      for (const p of others(attorneys)) toward(p, 32);
      return;
    case 0x18:
      toward(mayor, 64); toward(chief, 64); toward(fbiHead, 32);
      for (const p of [...judges, ...attorneys]) toward(p, 32);
      for (const p of others(everyone('reporter'))) toward(p, 64);
      for (const p of everyone('clergy')) toward(p, 16);
      return;
    case 0x23:
      for (const p of others(everyone('clergy'))) toward(p, 64);
      return;
    case 0x20:
      toward(chief, 64);
      for (const p of everyone('police')) toward(p, 8);
      toward(fbiHead, 64);
      for (const p of everyone('fbi')) toward(p, 8);
      for (const p of [...judges, ...attorneys]) toward(p, 32);
      return;
    case 0x21:
      toward(mayor, 64); toward(fbiHead, 64);
      for (const p of everyone('police')) toward(p, 8);
      for (const p of [...judges, ...attorneys]) toward(p, 16);
      return;
    case 0x22:
      toward(mayor, 64); toward(fbiHead, 64);
      for (const p of everyone('fbi')) toward(p, 8);
      for (const p of [...judges, ...attorneys]) toward(p, 16);
      return;
  }

  // Shopkeeper, civilian, accountant, lawyer, gang men: the block's presence
  // and the area pass.
  const centre = w.blocks[damaged.blockId];
  if (!centre) return;
  const presence = new Map<ID, ID[]>();
  const present = (blockId: ID) => {
    let gangs = presence.get(blockId);
    if (!gangs) presence.set(blockId, gangs = gangsPresentInBlock(w, blockId));
    return gangs;
  };
  for (const g of present(centre.id)) for (const official of [mayor, chief]) toward(official, 4, g);
  const radius = blastRadius(w, damaged);
  for (const b of buildingList(w)) {
    const blk = w.blocks[b.blockId], owner = b.ownerPersonId != null ? w.people[b.ownerPersonId] : null;
    if (!blk || !owner || owner.role !== 'owner' || owner.status === 'dead' || b.cls === 'empty') continue;
    if (Math.max(Math.abs(blk.gx - centre.gx), Math.abs(blk.gy - centre.gy)) > radius) continue;
    const theirs = b.protection?.gangId === gangId || b.ownerGangId === gangId;
    shiftAttitude(owner, gangId, 0, part(theirs ? 48 : 8));
    for (const g of present(blk.id)) shiftAttitude(owner, g, part(8), 0);
  }
}
