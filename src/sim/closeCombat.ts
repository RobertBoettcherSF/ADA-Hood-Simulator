/**
 * The original's close-combat exchange: CloseCombat_OpposedHitRoll 0x465150
 * and CloseCombat_ExchangeResolver 0x465330, with the Cart.txt result tables
 * (src/sim/data/cart.ts) and the melee rows of Hit/Damage Table.txt.
 *
 * One blow:
 *  1. The victim's posture picks the attack band: standing → head or stomach
 *     (rand & 1); kneeling → stomach or a kneeling attack; down → a ground attack.
 *  2. The opposed roll (atk (fists, or knives with a knife) >> 3 + 1; def
 *     stealth >> 3 + 1 for gang members, owners and police, else rand % 4 + 1;
 *     chance = atk · (rand % 40 + 80) · 52 / (100 · def), hit if rand % 100 + 1 < chance).
 *  3. The weapon and band pick the Cart attack type (0x465330 lines 262–400),
 *     including the coup de grâce (types 12/15) for a pistol carrier who
 *     lands on a kneeling or fallen man.
 *  4. When the swing reaches its trigger frame the goal executor (0x5D2740,
 *     goal 13 state 1) sends the victim message 0x11; his handler (0x5D6B70)
 *     calls CloseCombat_ApplyBlow 0x465C20, which draws the reaction again
 *     from the list chosen by hit and facing: missed/hit from behind or from
 *     the front (the resolver's own hit-front draw only times the swing).
 *  5. The reaction moves the victim between standing, kneeling and down; a hit
 *     costs him the entry's lost turns (every hit entry has 1, every miss 0).
 *  6. Damage (0x465C20): a landed blow of level d costs rand % d + 1 stamina,
 *     none for d = 0. Stamina is the 4-bit field in bits 10–13 of the
 *     fighter's goal-13 flags, 15 when the goal is made (0x5614D0, 0x5DE3B0),
 *     floored at 0. Level 5 is no instant death: it is a 1..5 draw like the rest.
 *  7. At 0 stamina (goal 13 states 2 and 5) the fight ends for both: message
 *     0x13 to the other man, the loser's posture kept in person+0x64 bits
 *     20–21, and 0x5DE580 gets him up later. No person field loses health.
 *
 * What kills (traced 28 October 2026): nothing in close combat. The Kill
 * order 0x4D6E40, in its first state, reads the hit man's weapon (+0xC4):
 * with a gun (1, 2, 3, 9, 10) he shoots; otherwise (0, 4, 5, 11) the order's
 * type becomes 0x18, Assault, which runs goal 13 and ends with 0x4DE430(100),
 * the victim beaten. Only a shopkeeper is executed in his premises (0x4E0220,
 * whatever the weapon). The original city plays it so (`meleeKills` false);
 * compact cities keep the remake's rule that an armed (bat or knife, i.e.
 * Kill) fighter left at 0 stamina dies. The remake has no facings: the first
 * blow lands from behind, later ones from the front.
 */
import { CART, type CartEntry } from './data/cart';
import { skillByte } from './fireRoll';
import type { Rng } from './rng';
import type { CombatPosture, Person } from './types';
import type { Firearm } from './weapons';

export type MeleeWeapon = 'fist' | 'bat' | 'knife';

/** Hit Table rows 4–6, column 0 (range 0). */
const MELEE_HIT = 52;
/** 0x5614D0 case 13: goal flags |= 0x3C00, a fresh fight's stamina. */
export const CLOSE_COMBAT_STAMINA = 15;

/** 0x465C20: the stamina a landed blow of damage level d costs, rand % d + 1 (0 for d = 0). */
export function staminaLoss(rng: Rng, damage: number): number {
  return damage > 0 ? rng.int(1, damage) : 0;
}

const DODGERS = new Set<Person['role']>(['boss', 'lieutenant', 'hood', 'owner', 'police', 'fbi', 'policeChief', 'fbiHead']);
const tier = (stars: number) => (skillByte(stars) >> 3) + 1;

/** The weapon a man brings to a fistfight. The manual says hoods supply their
 * own knives and bats, and that an assault usually involves fists and bats.
 * Here: a knife for a Kill when his Knives are at least his Fists, else a bat;
 * bare fists for an Assault (the choice rule itself is an interpretation). */
export function meleeWeapon(p: Person, kill: boolean): MeleeWeapon {
  if (!kill) return 'fist';
  return p.skills.knives >= p.skills.fists ? 'knife' : 'bat';
}

/** The opposed roll's exact odds, averaged over the morale draw and a civilian's 1..4. */
export function closeCombatOdds(attacker: Person, defender: Person, weapon: MeleeWeapon): number {
  const atk = tier(weapon === 'knife' ? attacker.skills.knives : attacker.skills.fists);
  const defs = DODGERS.has(defender.role) ? [tier(defender.skills.stealth)] : [1, 2, 3, 4];
  let hit = 0;
  for (const def of defs) for (let m = 0; m < 40; m++) {
    const chance = Math.trunc(atk * (m + 80) * MELEE_HIT / (100 * def));
    hit += Math.max(0, Math.min(100, chance - 1)) / 100;
  }
  return hit / (40 * defs.length);
}

/** 0x465330 lines 262–400: the Cart attack type for a weapon and band. */
export function cartAttack(rng: Rng, weapon: MeleeWeapon, band: 0 | 1 | 2 | 3, coup: boolean): number {
  const coin = () => rng.chance(.5);
  if (weapon === 'fist') {
    if (band === 0) return coin() ? 2 : 1;
    if (band === 1) return 5;
    if (band === 2) return coin() && coup ? 12 : 9;
    return coin() && coup ? 15 : 14;
  }
  if (weapon === 'bat') {
    if (band === 0) return coin() ? 3 : 0;
    if (band === 1) return 6;
    if (band === 2) {
      const r = rng.int(0, 2);
      return r === 0 ? 8 : r === 1 ? 10 : coup ? 12 : coin() ? 8 : 10;
    }
    const r = rng.int(0, 2);
    return r === 0 ? 13 : r === 1 ? (coup ? 15 : coin() ? 13 : 14) : 14;
  }
  if (band === 0) return 4;
  if (band === 1) return 7;
  if (band === 2) return coin() && coup ? 12 : 11;
  return coin() && coup ? 15 : 14;
}

/** Cart reaction ids onto the posture they leave the victim in. */
export function postureAfter(reaction: number, before: CombatPosture): CombatPosture {
  if (reaction === 3 || reaction === 8 || reaction === 11) return 'kneeling';
  if (reaction === 4 || reaction === 5 || reaction === 9) return 'down';
  if (reaction === 6 || reaction === 7) return before;
  return 'standing';
}

export interface Blow { hit: boolean; attack: number; entry: CartEntry; lethal: boolean; posture: CombatPosture; stamina: number; exhausted: boolean }

/**
 * Resolve one blow from attacker to victim. `pistol` is whether the attacker
 * carries a pistol or twin pistols (the coup de grâce). `front` is whether
 * the victim faces him (an engaged opponent); a first blow lands from behind.
 */
export function closeCombatBlow(rng: Rng, attacker: Person, victim: Person, weapon: MeleeWeapon,
  pistol: Firearm | undefined, minute: number, week: number, meleeKills = true): Blow {
  const state = victim.closeCombat ??= { posture: 'standing', turnsLost: 0 };
  const front = !!state.lastBlow;
  const band: 0 | 1 | 2 | 3 = state.posture === 'down' ? 3 : state.posture === 'kneeling' ? (rng.chance(.5) ? 2 : 1) : (rng.chance(.5) ? 1 : 0);
  const hit = rng.chance(closeCombatOdds(attacker, victim, weapon));
  const coup = hit && state.posture !== 'standing' && (pistol === 'pistol' || pistol === 'twinPistols');
  const attack = cartAttack(rng, weapon, band, coup);
  const table = CART[attack];
  // 0x465C20: hit (flag 0x200) and facing (bit 0) pick list +0x10/+0x0C/+0x08/+0x04.
  const list = hit ? (front ? table.hitFront : table.hitBehind) : front ? table.missFront : table.missBehind;
  const entry = list[Math.max(0, Math.min(list.length - 1, rng.int(0, list.length - 1)))];
  state.posture = postureAfter(entry[0], state.posture);
  let stamina = state.stamina ?? CLOSE_COMBAT_STAMINA;
  if (hit) {
    state.turnsLost += entry[3];
    stamina = Math.max(0, stamina - staminaLoss(rng, entry[4]));
    state.stamina = stamina;
  }
  const exhausted = stamina === 0;
  // Compact cities (remake choice): an exhausted man in an armed (Kill) fight
  // is finished off. The original city passes meleeKills = false: there a
  // Kill without a gun is an Assault (0x4D6E40) and close combat never kills.
  const lethal = meleeKills && hit && exhausted && weapon !== 'fist';
  if (lethal) victim.hp = 0;
  state.lastBlow = { attack, reaction: entry[0], hit, minute, week };
  return { hit, attack, entry, lethal, posture: state.posture, stamina, exhausted };
}

/** A fighter who has lost a turn sits this exchange out. */
export function spendLostTurn(p: Person): boolean {
  const s = p.closeCombat;
  if (!s || s.turnsLost <= 0) return false;
  s.turnsLost--;
  return true;
}

/** The fight is over for this person: he gets back on his feet. */
export function endCloseCombat(p: Person): void {
  p.closeCombat = undefined;
}
