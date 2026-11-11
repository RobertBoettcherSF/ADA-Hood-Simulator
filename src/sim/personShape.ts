import type { Person } from './types';

/**
 * Every person carries the same fields in the same order, unset ones as
 * undefined. JSON leaves undefined out, so a save reads the same. The sim
 * reads a dozen fields of 8,000 people every minute; when each person had
 * their own mix of fields the engine could not keep those reads fast, and
 * End Week spent much of its time looking fields up. Clearing a field sets it
 * to undefined (clearPersonField) rather than deleting it, which would undo this.
 */
type Shaped = { [K in keyof Required<Person>]: Person[K] | undefined };

export function shapePerson(o: Person): Person {
  const shaped: Shaped = {
    id: o.id,
    name: o.name,
    female: o.female,
    portrait: o.portrait,
    face: o.face,
    role: o.role,
    skills: o.skills,
    gangId: o.gangId,
    teamId: o.teamId,
    buildingId: o.buildingId,
    pay: o.pay,
    payDemand: o.payDemand,
    loyalty: o.loyalty,
    opinion: o.opinion,
    hostility: o.hostility,
    fear: o.fear,
    status: o.status,
    commandFraction: o.commandFraction,
    wanted: o.wanted,
    pos: o.pos,
    dest: o.dest,
    path: o.path,
    halted: o.halted,
    inVehicle: o.inVehicle,
    vehicleKey: o.vehicleKey,
    orderId: o.orderId,
    jailWeeks: o.jailWeeks,
    bribedBy: o.bribedBy,
    employedBy: o.employedBy,
    weeklyRetainer: o.weeklyRetainer,
    retainerShort: o.retainerShort,
    quitPayrollOf: o.quitPayrollOf,
    taxRecords: o.taxRecords,
    taxEvasionWeeks: o.taxEvasionWeeks,
    fbiWarrant: o.fbiWarrant,
    crimeSuspicion: o.crimeSuspicion,
    fbiAgentZeal: o.fbiAgentZeal,
    fbiAssignment: o.fbiAssignment,
    snitchKnows: o.snitchKnows,
    hp: o.hp,
    closeCombat: o.closeCombat,
    diedWeek: o.diedWeek,
    burningEscape: o.burningEscape,
    emergencyResponse: o.emergencyResponse,
    shockReaction: o.shockReaction,
    interrogationValue: o.interrogationValue,
    capturedBy: o.capturedBy,
    streetOrder: o.streetOrder,
    underFireUntil: o.underFireUntil,
    beatenUntil: o.beatenUntil,
    resumeOrderId: o.resumeOrderId,
    tram: o.tram,
  };
  // A field an older save carried that Person no longer names.
  for (const key in o) if (!(key in shaped)) (shaped as Record<string, unknown>)[key] = (o as unknown as Record<string, unknown>)[key];
  return shaped as Person;
}

/**
 * Every person in the common shape (after a load), in a new record: the
 * cached people lists (entityLists, peopleSlices) are keyed by the record, so
 * none of them can hand out the old objects.
 */
export function shapePeople(people: Record<number, Person>): Record<number, Person> {
  const shaped: Record<number, Person> = {};
  for (const key in people) shaped[key as unknown as number] = shapePerson(people[key]);
  return shaped;
}

/** Clear an optional field without deleting it (see shapePerson). */
export function clearPersonField<K extends keyof Person>(p: Person, key: K): void {
  if (p[key] !== undefined) (p as Record<K, unknown>)[key] = undefined;
}
