import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;
// 1.2.53: the commit the build was made from, for the Auto Test BUILD line;
// "+changes" when src/ differed from that commit. A copy built outside git says so.
const git = (cmd: string) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };
const head = git('git rev-parse --short HEAD');
const commit = head == null ? 'not built from git' : `${head}${git('git status --porcelain -- src') ? '+changes' : ''}`;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version), __APP_COMMIT__: JSON.stringify(commit) },
  test: {
    // Disposable checkouts and staged patches live under .scratch. Only the
    // project's test directory belongs to this invocation.
    include: ['tests/**/*.test.{ts,mjs}'],
    // Simulation suites are CPU-bound. Running every file at once starves both
    // individual tests and the browser on ordinary desktop machines.
    maxWorkers: 2,
    // Match the audited default under concurrent simulation/browser load.
    testTimeout: 180_000,
  },
});
