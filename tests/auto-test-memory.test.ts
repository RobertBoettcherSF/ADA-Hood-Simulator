import { afterEach, describe, expect, it } from 'vitest';
import {
  checkMemoryStop,
  formatHeapMb,
  heapShare,
  MEMORY_CHECK_SHARE,
  MEMORY_STOP_SHARE,
  readHeap,
} from '../src/app/autoTest';
import { buildDebugReport, clearWeekHeaps, noteWeekHeap } from '../src/app/debugReport';

type ChromeMemory = { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };

function setMemory(used: number, total: number, limit = 2_483_000_000): void {
  Object.defineProperty(globalThis.performance, 'memory', {
    configurable: true,
    value: { usedJSHeapSize: used, totalJSHeapSize: total, jsHeapSizeLimit: limit } satisfies ChromeMemory,
  });
}

function clearMemory(): void {
  // Node has no performance.memory; leave the property missing.
  try { delete (globalThis.performance as { memory?: ChromeMemory }).memory; } catch { /* ignore */ }
}

afterEach(() => {
  clearMemory();
  clearWeekHeaps();
});

describe('Auto Test memory stop', () => {
  it('measures used heap, not reserved heap', () => {
    // 1.2.14 stopped at 67% because reserved heap was high; used heap was far smaller.
    setMemory(230 * 1048576, 0.67 * 2_483_000_000, 2_483_000_000);
    const share = heapShare();
    expect(share).not.toBeNull();
    expect(share!).toBeLessThan(MEMORY_CHECK_SHARE);
    expect(readHeap()?.total).toBeGreaterThan(readHeap()!.used);
  });

  it('pauses when used heap is high, then continues if it falls below 80%', async () => {
    const limit = 2_000_000_000;
    setMemory(0.67 * limit, 0.90 * limit, limit);
    const result = await checkMemoryStop(0);
    expect(result.stop).toBe(false);
    expect(result.heap).not.toBeNull();
  });

  it('stops only if used heap is still at least 80% after the pause', async () => {
    const limit = 2_000_000_000;
    setMemory(0.85 * limit, 0.95 * limit, limit);
    const result = await checkMemoryStop(0);
    expect(result.stop).toBe(true);
    expect(result.heap!.used / result.heap!.limit).toBeGreaterThanOrEqual(MEMORY_STOP_SHARE);
  });

  it('does not pause when used heap is comfortably under the check line', async () => {
    const limit = 2_000_000_000;
    setMemory(0.2 * limit, 0.7 * limit, limit);
    const started = Date.now();
    const result = await checkMemoryStop(5_000);
    expect(Date.now() - started).toBeLessThan(200);
    expect(result.stop).toBe(false);
  });

  it('formats used and reserved heap in megabytes', () => {
    expect(formatHeapMb({ used: 230 * 1048576, total: 240 * 1048576 })).toBe('230/240 MB');
  });

  it('lists weekly heaps in the debug report', () => {
    noteWeekHeap(2, 180 * 1048576, 400 * 1048576);
    noteWeekHeap(3, 190 * 1048576, 410 * 1048576);
    const report = buildDebugReport(null, '1.2.15', null);
    expect(report).toContain('Heap after each week (used / reserved)');
    expect(report).toContain('Week 2: 180/400 MB');
    expect(report).toContain('Week 3: 190/410 MB');
  });
});
