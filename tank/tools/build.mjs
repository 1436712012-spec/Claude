// Minimal zero-dependency bundler: inlines every ES module under src/ into dist/nightwatch-flak.html
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'src');
const entry = path.join(src, 'main.js');

const mods = new Map(); // abs path -> {id, deps:[abs], code, exports:[]}
const order = [];
let nextId = 0;

const IMPORT_RE = /^import\s+([\s\S]*?)\s+from\s+['"](.+?)['"];?[ \t]*$/gm;

function load(file) {
  if (mods.has(file)) return mods.get(file);
  const m = { id: nextId++, file, deps: [], exports: [], code: '' };
  mods.set(file, m);
  let code = fs.readFileSync(file, 'utf8');
  // imports
  code = code.replace(IMPORT_RE, (all, spec, from) => {
    const dep = load(path.resolve(path.dirname(file), from));
    m.deps.push(dep);
    spec = spec.trim();
    if (spec.startsWith('* as ')) return `const ${spec.slice(5).trim()} = __M[${dep.id}];`;
    if (spec.startsWith('{')) {
      const inner = spec.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': '));
      return `const { ${inner.join(', ')} } = __M[${dep.id}];`;
    }
    throw new Error('default imports are not supported: ' + all);
  });
  // exports
  code = code.replace(/^export\s+(async\s+)?(function|class|const|let|var)\s+([A-Za-z0-9_$]+)/gm, (all, a, kind, name) => {
    m.exports.push(name);
    return `${a || ''}${kind} ${name}`;
  });
  code = code.replace(/^export\s*\{([^}]*)\};?[ \t]*$/gm, (all, names) => {
    for (const n of names.split(',').map((s) => s.trim()).filter(Boolean)) m.exports.push(n);
    return '';
  });
  m.code = code;
  order.push(m);
  return m;
}
load(entry);

let out = '';
for (const m of order) {
  const rel = path.relative(src, m.file);
  out += `\n// ---- ${rel}\n__M[${m.id}] = (() => {\n${m.code}\nreturn { ${m.exports.join(', ')} };\n})();\n`;
}
const js = `'use strict';\nconst __M = {};\n${out}`;

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<!--BUNDLE-->[\s\S]*?<!--\/BUNDLE-->/, () => `<script>\n${js}\n</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const outFile = path.join(root, 'dist', 'nightwatch-flak.html');
fs.writeFileSync(outFile, html);
console.log(`built ${path.relative(root, outFile)}  ${(html.length / 1024).toFixed(0)} KB, ${order.length} modules`);
