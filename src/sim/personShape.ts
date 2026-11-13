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
    // The fields the city's walking reads every minute come first, side by side:
    // they then share one or two cache lines, where spread through the record
    // every walker cost seven (1.2.23; values and saves are unchanged).
    id: o.id,
    status: o.status,
    role: o.role,
    buildingId: o.buildingId,
    orderId: o.orderId,
    streetOrder: o.streetOrder,
    inVehicle: o.inVehicle,
    vehicleKey: o.vehicleKey,
    dest: o.dest,
    path: o.path,
    pos: o.pos,
    halted: o.halted,
    commandFraction: o.commandFraction,
    burningEscape: o.burningEscape,
    emergencyResponse: o.emergencyResponse,
    shockReaction: o.shockReaction,
    fbiAssignment: o.fbiAssignment,
    tram: o.tram,
    gangId: o.gangId,
    teamId: o.teamId,
    name: o.name,
    female: o.female,
    portrait: o.portrait,
    face: o.face,
    skills: o.skills,
    pay: o.pay,
    payDemand: o.payDemand,
    loyalty: o.loyalty,
    opinion: o.opinion,
    hostility: o.hostility,
    fear: o.fear,
    wanted: o.wanted,
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
    snitchKnows: o.snitchKnows,
    hp: o.hp,
    closeCombat: o.closeCombat,
    diedWeek: o.diedWeek,
    interrogationValue: o.interrogationValue,
    capturedBy: o.capturedBy,
    underFireUntil: o.underFireUntil,
    beatenUntil: o.beatenUntil,
    resumeOrderId: o.resumeOrderId,
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
