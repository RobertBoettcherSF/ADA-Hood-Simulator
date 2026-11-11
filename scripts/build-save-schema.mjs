import fs from 'node:fs';
import ts from 'typescript';

// Compile the persisted TypeScript model to a small runtime shape description.
// Run after changing WorldState or its nested types; --check detects drift.
const program = ts.createProgram(['src/sim/types.ts'], { strict: true, target: ts.ScriptTarget.ES2022 });
const checker = program.getTypeChecker();
const file = program.getSourceFile('src/sim/types.ts');
const declaration = file.statements.find(s => ts.isInterfaceDeclaration(s) && s.name.text === 'WorldState');
const defs = {}, seen = new Map();
function shape(type) {
  const f = type.flags, F = ts.TypeFlags;
  if (f & F.StringLiteral || f & F.NumberLiteral) return { literal: type.value };
  if (f & F.BooleanLiteral) return { literal: type.intrinsicName === 'true' };
  if (f & F.Null) return { literal: null };
  if (f & F.String) return { type: 'string' };
  if (f & F.Number) return { type: 'number' };
  if (f & F.Boolean) return { type: 'boolean' };
  if (type.isUnion()) return { union: type.types.filter(t => !(t.flags & F.Undefined)).map(shape) };
  if (seen.has(type)) return { ref: seen.get(type) };
  const key = `T${seen.size}`;
  seen.set(type, key);
  defs[key] = {};
  if (checker.isArrayType(type)) defs[key] = { array: shape(checker.getIndexTypeOfType(type, ts.IndexKind.Number)) };
  else if (f & F.Object) {
    const props = {};
    for (const p of type.getProperties()) props[p.name] = {
      optional: !!(p.flags & ts.SymbolFlags.Optional),
      shape: shape(checker.getTypeOfSymbolAtLocation(p, p.valueDeclaration ?? declaration)),
    };
    const index = checker.getIndexTypeOfType(type, ts.IndexKind.String) ?? checker.getIndexTypeOfType(type, ts.IndexKind.Number);
    // Entries, not an object keyed by field name: a schema object with x and y keys
    // shared V8's {x, y} shape and turned every position's coordinates into boxed
    // numbers, about 4 GB of garbage per End Week.
    defs[key] = { object: Object.entries(props), ...(index ? { values: shape(index) } : {}) };
  } else throw Error(`Unsupported save type: ${checker.typeToString(type)}`);
  return { ref: key };
}
const root = shape(checker.getTypeAtLocation(declaration));
const json = JSON.stringify({ root, defs }, null, 2) + '\n';
const output = 'src/sim/world-schema.json';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(output, 'utf8') !== json) throw Error('Save schema is stale; run node scripts/build-save-schema.mjs');
} else fs.writeFileSync(output, json);
console.log(`Save schema ${process.argv.includes('--check') ? 'verified' : 'generated'} (${Object.keys(defs).length} shapes).`);
