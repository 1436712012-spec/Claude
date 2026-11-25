// Inline the Vite build into one self-contained HTML fragment (for sharing as
// a single page). Usage: npm run build && node scripts/single.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const assets = join(dist, 'assets');
const files = readdirSync(assets);
const css = readFileSync(join(assets, files.find((f) => f.endsWith('.css'))), 'utf8');
let js = readFileSync(join(assets, files.find((f) => f.endsWith('.js'))), 'utf8');
js = js.replace(/<\/script/gi, '<\\/script');

const fonts = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Long+Cang&family=Noto+Serif+SC:wght@400;600&family=Nunito:wght@300;500;600;700;800&display=swap';
const html = `<title>梦隙 Noclip Bloom</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${fonts}" />
<style>${css}</style>
<script type="module">${js}</script>
`;
writeFileSync(join(dist, 'noclip-bloom.html'), html);
console.log('wrote dist/noclip-bloom.html', (html.length / 1024).toFixed(0) + ' KB');
