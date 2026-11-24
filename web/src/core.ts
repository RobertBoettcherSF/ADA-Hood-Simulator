// The Ada core: loads the WebAssembly module the page carries inline and
// wraps its hs_ exports. Every number that crosses is a 32-bit integer.

export interface Exports {
  memory: WebAssembly.Memory;
  hs_build_id(): number;
  hs_state_hash(): number;
  hs_crash_test(code: number): void;
  hs_error_file_length(): number;
  hs_error_file_char(i: number): number;
  hs_new_game(seed: number, auto: number, w: number, h: number): void;
  hs_rng_value(stream: number, index: number): number;
  hs_grid_w(): number;
  hs_grid_h(): number;
  hs_cell_kind(x: number, y: number): number;
  hs_check_value(id: number): number;
  hs_count(what: number): number;
  hs_get(table: number, index: number, field: number): number;
  hs_draw_ptr(layer: number): number;
  hs_draw_len(layer: number): number;
  hs_city_hash(): number;
  hs_structure_hash(): number;
  hs_name_char(person: number, index: number): number;
  hs_population_hash(which: number): number;
  hs_launch_week(): void;
  hs_tick(minutes: number): number;
  hs_finish_week(): void;
  hs_order_begin(crew: number, kind: number, manpower: number): void;
  hs_order_add(what: number, a: number, b: number): void;
  hs_order_preview(): number;
  hs_order_issue(): number;
  hs_command(cmd: number, a: number, b: number): number;
  hs_reply(field: number): number;
}

/** Numbers shared with src/hood-host_abi.ads (all proposed there). */
export const COUNT = {
  blocks: 1, merged: 2, lots: 3, buildings: 4, blocksX: 5, blocksY: 6, hq: 7, status: 8, retries: 9,
  classBase: 10, districtBase: 20, useBase: 30, typesUsed: 40, edge: 41, rngLow: 42, rngHigh: 43,
  people: 50, nextId: 51, week: 52, minute: 53, phase: 54, gameOver: 55, popStatus: 56, drawsWeek: 57,
  setupLow: 58, setupHigh: 59, m1Low: 60, m1High: 61, walking: 62, roleBase: 70, builtClassBase: 90, builtTypes: 99,
  cars: 108, fleet: 109, trams: 110, carsHalted: 111, kerb: 112, boardings: 113,
} as const;
export const TABLE = { block: 1, lot: 2, building: 3, hq: 4, person: 5, gang: 6, crew: 7, pool: 8, premises: 9 } as const;
export const PERSON_FIELD = {
  id: 0, role: 1, gang: 2, female: 3, portrait: 4, pay: 5, demand: 6, loyalty: 7, team: 8, building: 9, x: 10, y: 11,
  walking: 12, status: 13, hostility: 14, fear: 15, nameLength: 16, skill: 20, opinion: 40,
} as const;
export const GANG_FIELD = {
  colour: 0, surname: 1, player: 2, profile: 3, boss: 4, cash: 5, office: 6, front: 7, manager: 8, team: 9,
  lieutenant: 10, crewCount: 11, poolCount: 12, pistols: 13, coupes: 14, crewPistols: 15, crewCoupes: 16,
  wages: 17, eliminated: 18, heritage: 19, offered: 20,
} as const;
export const PREMISES_FIELD = { ownerGang: 0, ownerPerson: 1, manager: 2, protectGang: 3, protectWeekly: 4, frontOf: 5, hides: 6, hq: 7 } as const;
export const BUILDING_FIELD = { lot: 0, block: 1, type: 2 } as const;
export const PEOPLE_STRIDE = 5;
/** Item 6 draw layers: city cars, gang cars, trams (src/hood-host_abi.ads). */
export const LAYER = { people: 3, cars: 4, fleet: 5, trams: 6 } as const;
export const CAR_STRIDE = 6, FLEET_STRIDE = 7, TRAM_STRIDE = 6;
export const MINUTES_PER_DAY = 480;
export const MINUTES_PER_WEEK = 2400;
export const BLOCK_FIELD = { name: 12, module: 13, turn: 14, plan: 19 } as const;
export const HQ_FIELD = { block: 0, front: 1, frontAs: 2, fx: 3, fy: 4 } as const;
export const BLOCK_STRIDE = 12;
export const LOT_STRIDE = 10;

export class HostStop extends Error {}

export interface CoreStop { code: number; file: string; line: number }

export async function loadCore(base64: string, onStop: (stop: CoreStop) => void): Promise<Exports> {
  let exports: Exports | null = null;
  const fileName = () => {
    if (!exports) return '';
    let s = '';
    const n = exports.hs_error_file_length();
    for (let i = 1; i <= n; i++) s += String.fromCharCode(exports.hs_error_file_char(i));
    return s;
  };
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: {
      hs_host_error(code: number, line: number) {
        const stop = { code, file: fileName(), line };
        onStop(stop);
        throw new HostStop(`Ada core stopped: ${stop.file}:${line}`);
      },
    },
  });
  exports = instance.exports as unknown as Exports;
  return exports;
}

export const u32 = (v: number) => v >>> 0;
export const hex = (v: number) => '0x' + u32(v).toString(16).padStart(8, '0');
