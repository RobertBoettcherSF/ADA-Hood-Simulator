// Values from the TypeScript build 1.2.91 run in Node, shown beside the
// core's own in the Debug drawer. The same numbers are typed into
// tests/smoke.adb.

// Step 2, seed 1932: src/sim/rng.ts.
export const REF_MAIN = [2087000994, 1345216982, 2537227108, 2322682548, 3464602834, 1449177721, 955002386, 2725655775,
  3304141253, 1945812103, 3106597394, 3860522775, 3923203638, 3143742962, 942210133, 573572034, 4118670652, 2227219457,
  2140019606, 4173634592];
export const REF_INT = [48, 31, 59, 54, 80, 33, 22, 63, 76, 45, 72, 89, 91, 73, 21, 13, 95, 51, 49, 97];
export const REF_PLAN = [6347, 31496, 30113, 27735, 13669, 28831, 25076, 12886, 27578, 14561, 15010, 14895, 11210, 18983,
  2483, 24216, 15099, 5001, 1002, 15126];
export const EXPECTED_CHECKS = [13824, 2764, 1280, 362, 46341, 65536, 128, 5, 38500];

// Step 3: createWorld up to citygen.ts:539 (hashes as Hood.City.City_Hash
// describes) and the headquarters blocks of the finished world.
export interface CityReference {
  w: number; h: number; seed: number; rng: number; city: number; structure: number;
  blocks: number; merged: number; lots: number; buildings: number; types: number; hq: [number, number][];
}
export const CITY_REFS: CityReference[] = [
  { w: 36, h: 28, seed: 1932, rng: 787968811, city: 130389902, structure: 2172434479, blocks: 1008, merged: 140, lots: 8769, buildings: 8769, types: 164, hq: [] },
  { w: 40, h: 32, seed: 1932, rng: 1183664769, city: 162525796, structure: 3010893233, blocks: 1280, merged: 22, lots: 4580, buildings: 4580, types: 170, hq: [[13, 10], [31, 4], [7, 20], [36, 25]] },
  { w: 44, h: 35, seed: 1932, rng: 214220379, city: 1231309806, structure: 2436981367, blocks: 1540, merged: 209, lots: 13488, buildings: 13488, types: 166, hq: [] },
  { w: 40, h: 32, seed: 187, rng: 1183663024, city: 2335500783, structure: 2753879728, blocks: 1280, merged: 20, lots: 4733, buildings: 4733, types: 170, hq: [[11, 9], [29, 4], [9, 17], [25, 23]] },
];

// Step 4: the people of 1.2.91's finished world (createWorld) and its
// random state after minute 1 of week 1, rival planning off (hashes as
// Hood.Population describes).
export interface PeopleReference {
  w: number; h: number; seed: number; people: number; rngSetup: number; rngMinute1: number; hashes: number[];
}
export const PEOPLE_REFS: PeopleReference[] = [
  { w: 40, h: 32, seed: 1932, people: 8479, rngSetup: 532198006, rngMinute1: 3184470837, hashes: [762905189, 59061474, 867735307, 2325457386] },
  { w: 44, h: 35, seed: 1932, people: 20879, rngSetup: 3696518514, rngMinute1: 2775660613, hashes: [4085821087, 1945027344, 3513816520, 825993883] },
];
