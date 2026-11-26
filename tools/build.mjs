// Builds the single self-contained game file.
//   liminal.html                 full standalone document (open directly in a browser)
//   dist/liminal.artifact.html   body-fragment variant for hosts that wrap pages in their own skeleton
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const css = fs.readdirSync(path.join(root, 'src/css')).filter((f) => f.endsWith('.css')).sort().map((f) => read('src/css/' + f)).join('\n');
const jsFiles = fs.readdirSync(path.join(root, 'src/js')).filter((f) => f.endsWith('.js')).sort();
const js = jsFiles.map((f) => `/* ---- ${f} ---- */\n` + read('src/js/' + f)).join('\n');
const tpl = read('src/index.html');

const filled = tpl.replace('/*CSS*/', () => css).replace('/*JS*/', () => js.replace(/<\/script/gi, '<\\/script'));
const head = filled.slice(filled.indexOf('<!--HEAD-->') + 11, filled.indexOf('<!--/HEAD-->'));
const body = filled.slice(filled.indexOf('<!--/HEAD-->') + 12);

const full = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
${head.trim()}
</head>
<body>
${body.trim()}
</body>
</html>
`;
const fragment = `${head.trim()}\n${body.trim()}\n`;

fs.writeFileSync(path.join(root, 'liminal.html'), full);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/liminal.artifact.html'), fragment);
const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB';
console.log(`built liminal.html (${kb(full)}) from ${jsFiles.length} scripts; artifact fragment ${kb(fragment)}`);
