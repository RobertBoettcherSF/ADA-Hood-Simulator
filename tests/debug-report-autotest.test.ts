import { afterEach, describe, expect, it } from 'vitest';
import { buildDebugReport, clearAutoTestSession, noteAutoTestRunning, noteLastAutoTest } from '../src/app/debugReport';

afterEach(() => clearAutoTestSession());

describe('auto test in the debug report', () => {
  it('says none only when Auto Test has not started', () => {
    clearAutoTestSession();
    const report = buildDebugReport(null, '1.2.8.1', null);
    expect(report).toContain('Music\nCategory: (none)');
    expect(report).toContain('Auto test\n(none this session)');
  });

  it('records a run as soon as it starts, and the result when it finishes', () => {
    noteAutoTestRunning('seed 1934 learn on', '2 weeks');
    const running = buildDebugReport(null, '1.2.8', null);
    expect(running).not.toContain('(none this session)');
    expect(running).toContain('seed 1934 learn on');
    expect(running).toContain('This session: running.');
    noteLastAutoTest({
      settings: 'normal/normal/40×32 seed 1934 learn on',
      weeks: '2 weeks',
      cash: 1000,
      men: 8,
      territory: 3,
      score: 12,
      diary: 'Diary: appended.',
      file: 'auto-test-example.txt',
    });
    const done = buildDebugReport(null, '1.2.8', null);
    expect(done).not.toContain('(none this session)');
    expect(done).toContain('Final: cash 1000 men 8 blocks 3 score 12');
    expect(done).toContain('09 Reports/auto-test-example.txt');
  });
});
