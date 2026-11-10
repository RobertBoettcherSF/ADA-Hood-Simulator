import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = 'public';
const roots = ['art', 'basis'];

async function walk(dir, out) {
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    const info = await stat(full);
    if (info.isDirectory()) await walk(full, out);
    else out.push(full);
  }
}

function tierOf(rel) {
  if (rel.includes('/sculpt-phone/')) return 'phone';
  if (rel.includes('/sculpt/')) return 'desktop';
  return 'shared';
}

const files = [];
for (const start of roots) await walk(path.join(root, start), files);
files.sort();
const entries = [];
for (const full of files) {
  const rel = full.slice(root.length + 1).replaceAll('\\', '/');
  const data = await readFile(full);
  entries.push({
    path: rel,
    sha256: createHash('sha256').update(data).digest('hex'),
    bytes: data.length,
    tier: tierOf(rel),
  });
}
await writeFile('public/asset-manifest.json', JSON.stringify({ version: 1, files: entries }));
const bytes = entries.reduce((sum, file) => sum + file.bytes, 0);
console.log(entries.length, 'files', bytes, 'bytes');
