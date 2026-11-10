/** Wall-clock time spent in each simulation system since the last reset. */
const buckets = new Map<string, { ms: number; calls: number }>();

export function timeSystem<T>(name: string, run: () => T): T {
  const start = performance.now();
  try {
    return run();
  } finally {
    const bucket = buckets.get(name) ?? { ms: 0, calls: 0 };
    bucket.ms += performance.now() - start;
    bucket.calls += 1;
    buckets.set(name, bucket);
  }
}

export function systemTimings(): { name: string; ms: number; calls: number }[] {
  return [...buckets.entries()]
    .map(([name, bucket]) => ({ name, ms: Math.round(bucket.ms * 10) / 10, calls: bucket.calls }))
    .sort((a, b) => b.ms - a.ms);
}

export function resetSystemTimings(): void {
  buckets.clear();
}
