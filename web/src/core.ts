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
}

/** Numbers shared with src/hood-host_abi.ads (all proposed there). */
export const COUNT = {
  blocks: 1, merged: 2, lots: 3, buildings: 4, blocksX: 5, blocksY: 6, hq: 7, status: 8, retries: 9,
  classBase: 10, districtBase: 20, useBase: 30, typesUsed: 40, edge: 41, rngLow: 42, rngHigh: 43,
} as const;
export const TABLE = { block: 1, lot: 2, building: 3, hq: 4 } as const;
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
