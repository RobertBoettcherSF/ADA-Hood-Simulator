// Re-encode the PNG textures embedded in the built GLB models as WebP, at the
// same resolution (EXT_texture_webp, which three's GLTFLoader reads natively).
// Colour maps are lossy at high quality; normal and other data maps are lossless
// so lighting is unchanged. Works on dist/ after `vite build`; public/ keeps the
// PNG masters. Usage: node scripts/optimize-art.mjs [dir=dist/art] [--dry]
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';

const root = process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'dist/art';
const dry = process.argv.includes('--dry');
// 1.2.29: the art is optional (fetch-assets.sh); with none there is nothing to optimise.
if (!(await import('node:fs')).existsSync(root)) { console.log(`optimize-art: no ${root}, nothing to do`); process.exit(0); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function* glbs(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* glbs(full);
    else if (entry.name.endsWith('.glb')) yield full;
  }
}

/** Which material slots a texture fills: colour slots may be lossy. */
function slotsOf(doc) {
  const slots = new Map();
  for (const material of doc.getRoot().listMaterials()) {
    const add = (tex, slot) => { if (tex) slots.set(tex, [...(slots.get(tex) ?? []), slot]); };
    add(material.getBaseColorTexture(), 'color');
    add(material.getEmissiveTexture(), 'color');
    add(material.getNormalTexture(), 'data');
    add(material.getMetallicRoughnessTexture(), 'data');
    add(material.getOcclusionTexture(), 'data');
  }
  return slots;
}

let before = 0, after = 0;
for await (const file of glbs(root)) {
  const size = (await stat(file)).size;
  const doc = await io.read(file);
  const slots = slotsOf(doc);
  let changed = false;
  for (const texture of doc.getRoot().listTextures()) {
    if (texture.getMimeType() !== 'image/png') continue;
    const colour = (slots.get(texture) ?? ['data']).every(s => s === 'color');
    const image = Buffer.from(texture.getImage());
    const webp = await sharp(image).webp(colour ? { quality: 92, effort: 6 } : { lossless: true, effort: 6 }).toBuffer();
    if (webp.length >= image.length) continue;
    texture.setImage(new Uint8Array(webp)).setMimeType('image/webp');
    const uri = texture.getURI();
    if (uri) texture.setURI(uri.replace(/\.png$/i, '.webp'));
    changed = true;
  }
  if (changed) doc.createExtension(EXTTextureWebP).setRequired(true);
  const bytes = changed ? await io.writeBinary(doc) : null;
  if (bytes && !dry) await import('node:fs/promises').then(fs => fs.writeFile(file, bytes));
  const out = bytes?.length ?? size;
  before += size; after += out;
  console.log(`${(size / 1048576).toFixed(1).padStart(6)} → ${(out / 1048576).toFixed(1).padStart(6)} MB  ${path.relative(root, file)}`);
}
console.log(`Total ${(before / 1048576).toFixed(1)} → ${(after / 1048576).toFixed(1)} MB${dry ? ' (dry run)' : ''}`);
