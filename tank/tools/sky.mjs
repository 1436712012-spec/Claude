import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.argv[2] || '/tmp/sky';
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto(`http://127.0.0.1:${port}/?autostart=1&noadapt=1&dpr=1`);
await pg.waitForFunction(() => window.__game);
for (const ph of [0.3, 0.5, 0.78, 1.0]) {
  await pg.evaluate((ph) => { const g = window.__game.game; window.__game.stopBot(); g.state = ph >= 1 ? 'win' : 'play'; g.banner = null; g.wave.state = 'idle'; g.skyPhase = ph; g.wave.n = Math.round(ph * 8) + 1; window.__game.advance(0.2); g.skyPhase = ph; }, ph);
  await pg.waitForTimeout(350);
  await pg.screenshot({ path: `${out}-${String(Math.round(ph * 100)).padStart(3, '0')}.png` });
}
console.log(errs.length ? errs.join('\n') : 'ok');
await b.close(); server.close();
