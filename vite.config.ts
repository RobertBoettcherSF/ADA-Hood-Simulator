import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// The release version, shown on the menu and in the credits for bug reports.
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;
// 1.2.53: the commit the build was made from, for the Auto Test BUILD line;
// "+changes" when src/ differed from that commit. A copy built outside git says so.
// 1.2.54: also shown on screen next to the version ("v1.2.54 · <commit>").
const git = (cmd: string) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };
const head = git('git rev-parse --short HEAD');
const commit = head == null ? 'not built from git' : `${head}${git('git status --porcelain -- src') ? '+changes' : ''}`;

export default defineConfig({
  // Where the game is served from: "/" for the desktop app and local runs, the
  // repository's subfolder for GitHub Pages (set by the Pages workflow).
  base: process.env.OG_BASE ?? '/',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version), __APP_COMMIT__: JSON.stringify(commit) },
  server: { port: 5180, strictPort: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
