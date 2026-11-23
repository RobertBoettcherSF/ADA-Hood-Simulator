// The people and gangs the core placed (item 4), read through hs_get and
// the people draw layer. Positions cross in 1/256 m.
import { BUILDING_FIELD, Exports, GANG_FIELD, PEOPLE_STRIDE, PERSON_FIELD, PREMISES_FIELD, TABLE, COUNT } from './core';
import { UNITS } from './city';
import { NAMES, ROLES, SKILLS } from './tables';

export const STANCES = ['alliance', 'peace', 'ceasefire', 'aggression', 'war'] as const;
export const LOYALTY_PER_PERCENT = 255;

/** The people layer, copied out of linear memory (it moves if memory grows). */
export function readWalkers(core: Exports): Int32Array {
  return new Int32Array(core.memory.buffer, core.hs_draw_ptr(3), core.hs_draw_len(3)).slice();
}
export const walkerCount = (layer: Int32Array) => layer.length / PEOPLE_STRIDE;

export function personName(core: Exports, index: number): string {
  const n = core.hs_get(TABLE.person, index, PERSON_FIELD.nameLength);
  let s = '';
  for (let k = 1; k <= n; k++) s += String.fromCharCode(core.hs_name_char(index, k));
  return s;
}

export interface Person {
  index: number; id: number; name: string; role: string; gang: number; female: boolean;
  skills: number[]; pay: number; demand: number; loyalty: number; building: number;
  x: number; y: number; walking: boolean; hostility: number; fear: number; opinion: number[];
}

export function readPerson(core: Exports, index: number): Person | null {
  if (index < 0 || index >= core.hs_count(COUNT.people)) return null;
  const f = (k: number) => core.hs_get(TABLE.person, index, k);
  return {
    index, id: f(PERSON_FIELD.id), name: personName(core, index), role: ROLES[f(PERSON_FIELD.role)],
    gang: f(PERSON_FIELD.gang), female: f(PERSON_FIELD.female) === 1,
    skills: SKILLS.map((_, k) => f(PERSON_FIELD.skill + k)),
    pay: f(PERSON_FIELD.pay), demand: f(PERSON_FIELD.demand), loyalty: f(PERSON_FIELD.loyalty) / LOYALTY_PER_PERCENT,
    building: f(PERSON_FIELD.building), x: f(PERSON_FIELD.x) / UNITS, y: f(PERSON_FIELD.y) / UNITS,
    walking: f(PERSON_FIELD.walking) === 1, hostility: f(PERSON_FIELD.hostility), fear: f(PERSON_FIELD.fear),
    opinion: [1, 2, 3, 4].map(g => f(PERSON_FIELD.opinion + g)),
  };
}

export interface Gang {
  id: number; colour: number; name: string; player: boolean; profile: number; boss: number; cash: number;
  office: number; officeLot: number; front: number; frontType: number; manager: number; lieutenant: number;
  crew: number[]; pool: number[]; pistols: number; coupes: number; crewPistols: number; crewCoupes: number;
  wages: number; eliminated: boolean; offered: string[]; protectedCount: number;
}

export function readGangs(core: Exports): Gang[] {
  const gangs: Gang[] = [];
  for (let g = 1; g <= 4; g++) {
    const f = (k: number) => core.hs_get(TABLE.gang, g, k);
    const office = f(GANG_FIELD.office), front = f(GANG_FIELD.front);
    const crew: number[] = [], pool: number[] = [];
    for (let k = 1; k <= f(GANG_FIELD.crewCount); k++) crew.push(core.hs_get(TABLE.crew, g, k));
    for (let k = 1; k <= f(GANG_FIELD.poolCount); k++) pool.push(core.hs_get(TABLE.pool, g, k));
    gangs.push({
      id: g, colour: f(GANG_FIELD.colour), name: NAMES[f(GANG_FIELD.surname)] ?? '?', player: f(GANG_FIELD.player) === 1,
      profile: f(GANG_FIELD.profile), boss: f(GANG_FIELD.boss), cash: f(GANG_FIELD.cash), office,
      officeLot: office >= 0 ? core.hs_get(TABLE.building, office, BUILDING_FIELD.lot) : -1,
      front, frontType: front >= 0 ? core.hs_get(TABLE.building, front, BUILDING_FIELD.type) : -1,
      manager: f(GANG_FIELD.manager), lieutenant: f(GANG_FIELD.lieutenant), crew, pool,
      pistols: f(GANG_FIELD.pistols), coupes: f(GANG_FIELD.coupes), crewPistols: f(GANG_FIELD.crewPistols),
      crewCoupes: f(GANG_FIELD.crewCoupes), wages: f(GANG_FIELD.wages), eliminated: f(GANG_FIELD.eliminated) === 1,
      offered: [1, 2, 3, 4].map(o => STANCES[f(GANG_FIELD.offered + o)] ?? 'peace'),
      protectedCount: 0,
    });
  }
  return gangs;
}

/** Businesses each gang protects, counted over the city's buildings. */
export function countProtected(core: Exports, buildings: number, gangs: Gang[]): void {
  for (let b = 0; b < buildings; b++) {
    const g = core.hs_get(TABLE.premises, b, PREMISES_FIELD.protectGang);
    if (g >= 1 && g <= 4) gangs[g - 1].protectedCount++;
  }
}

export interface Clock { week: number; minute: number; running: boolean; gameOver: boolean; walking: number }
export function readClock(core: Exports): Clock {
  return { week: core.hs_count(COUNT.week), minute: core.hs_count(COUNT.minute), running: core.hs_count(COUNT.phase) === 1,
    gameOver: core.hs_count(COUNT.gameOver) === 1, walking: core.hs_count(COUNT.walking) };
}
