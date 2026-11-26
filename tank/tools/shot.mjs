// Headless smoke test + screenshot tool.
// usage: node tools/shot.mjs [--query "autostart=1&bot=1"] [--at 0,12,25] [--w 1280] [--h 720] [--out /path/prefix] [--file dist/neon-ironclad.html]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(process.env.NODE_PATH || '', 'playwright'))); }

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = +(args.w || 1280), H = +(args.h || 720);
const times = String(args.at || '0').split(',').map(Number);
const out = args.out || path.join(root, 'tests', 'shot');
const query = args.query || 'autostart=1&bot=1&noadapt=1&dpr=1';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const url = args.file ? 'file://' + path.resolve(args.file) + '?' + query : `http://127.0.0.1:${port}/?${query}`;
await page.goto(url);
await page.waitForFunction(() => window.__game, null, { timeout: 20000 });
let prev = 0;
for (const t of times) {
  if (t > prev) await page.evaluate((s) => window.__game.advance(s), t - prev);
  prev = t;
  await page.waitForTimeout(250);
  const file = `${out}-${String(t).padStart(3, '0')}.png`;
  await page.screenshot({ path: file });
  const info = await page.evaluate(() => {
    const g = window.__game.game;
    return { t: +g.time.toFixed(1), state: g.state, wave: g.wave.n, enemies: g.enemies.length, score: g.score, kills: g.kills, hp: Math.round(g.tank.hp), lamps: g.town.litCount, particlesHigh: window.__game.renderer.particles.high, phase: +g.skyPhase.toFixed(2) };
  });
  console.log(file, JSON.stringify(info));
}
if (args.perf) {
  const r = await page.evaluate(async () => {
    window.__game.stress(40000);
    const t0 = performance.now(); let n = 0;
    await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 > 3000) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
    return { frames: n, fps: n / 3, high: window.__game.renderer.particles.high };
  });
  console.log('perf', JSON.stringify(r));
}
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n') : 'no console errors');
await browser.close(); server.close();
