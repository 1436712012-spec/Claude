// Render screenshots of dev/preview.html in headless Chromium (SwiftShader).
// usage: node scripts/shoot.mjs out.png "query" [width height]
import { createRequire } from 'node:module';
import { createServer } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [out, query = '', w = '960', h = '540', page = 'dev/preview.html'] = process.argv.slice(2);
const server = createServer('.');
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
p.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await p.goto(`http://localhost:${port}/${page}?${query}`);
try {
  await p.waitForFunction(() => document.title === 'done' || document.title === 'error', null, { timeout: 240000 });
} catch (e) {
  logs.push('timeout');
}
await p.screenshot({ path: out });
console.log(`rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(logs.slice(0, 20).join('\n'));
await browser.close();
server.close();
