/** How long image and model files took to arrive. The slowest stay at the top of the debug report. */
export interface AssetLoad {
  file: string;
  ms: number;
  ok: boolean;
}

const loads: AssetLoad[] = [];

export function noteAssetLoad(file: string, ms: number, ok: boolean): void {
  const name = file.replace(/^.*\/art\//, 'art/');
  loads.push({ file: name, ms: Math.round(ms), ok });
  if (loads.length > 80) loads.shift();
}

export function slowestAssets(limit = 12): AssetLoad[] {
  return [...loads].sort((a, b) => b.ms - a.ms).slice(0, limit);
}
