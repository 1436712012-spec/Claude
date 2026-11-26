// 构建单文件：把 src/ 打成一个内联模块，Three.js 与后期模块从 jsDelivr 加载锁定版本。
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  target: ['es2020'],
  external: ['three', 'three/addons/*'],
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tag = '<script type="module" src="./src/main.js"></script>';
if (!html.includes(tag)) throw new Error('entry script tag not found');
html = html.replace(tag, () => `<script type="module">\n${js}\n</script>`);
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(`dist/index.html  ${(html.length / 1024).toFixed(0)} KB`);
