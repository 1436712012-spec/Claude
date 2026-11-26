// 无头 Chromium 整页验证：控制台报错、关键流程、截图。
// node tools/smoke.mjs [dev|dist] [outDir]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { serve } from './serve.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const mode = process.argv[2] || 'dev';
const outDir = path.resolve(process.argv[3] || path.join(root, '.smoke'));
fs.mkdirSync(outDir, { recursive: true });
const port = 8790 + Math.floor(Math.random() * 100);
const server = await serve(port, root);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 880, height: 495 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
await page.addInitScript((q) => { localStorage.setItem('lueying.settings', JSON.stringify({ quality: q })); }, process.env.Q || 'low');
const errors = [], logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '')));
// 把 jsDelivr 上的 three 路由到本地 node_modules
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (route) => {
  const rel = route.request().url().split('three@0.160.0/')[1];
  const f = path.join(root, 'node_modules/three', rel);
  route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(f) });
});
const target = mode === 'dist' ? `http://localhost:${port}/dist/index.html` : `http://localhost:${port}/index.html`;
const t0 = Date.now();
await page.goto(target);
const shot = async (name) => { await page.screenshot({ path: path.join(outDir, name + '.png'), timeout: 180000 }); console.log('shot', name, ((Date.now() - t0) / 1000).toFixed(1) + 's'); };
await page.waitForFunction(() => window.__lueying && window.__lueying.mode === 'title', null, { timeout: 120000 });
await page.waitForTimeout(4500);
await shot('01_title');
await page.click('button[data-a="start"]');
await page.waitForTimeout(1200);
await shot('02_loadout');
await page.click('button[data-a="go"]');
await page.waitForFunction(() => window.__lueying.mode === 'play');
await page.waitForTimeout(7500);
await shot('03_start_river');
// 沿河向北飞行
await page.keyboard.down('KeyW');
await page.waitForTimeout(15000);
await shot('04_flying');
await page.keyboard.up('KeyW');
// 树林里贴地
await page.evaluate(() => { const S = window.__lueying, P = S.world.player; P.pos.x = -60; P.pos.z = 150; P.pos.y = S.world.terrain.groundHeight(-60, 150) + 1.2; P.altMode = 'low'; S.view.yaw = 0.3; S.view.pitch = 0.05; });
await page.waitForTimeout(7500);
await shot('05_forest_low');
// 林缘观察研究所
await page.evaluate(() => { const S = window.__lueying, P = S.world.player; P.pos.x = -10; P.pos.z = -118; P.pos.y = S.world.terrain.groundHeight(-10, -118) + 1.8; P.altMode = 'cruise'; S.view.yaw = 0; S.view.pitch = 0.04; });
await page.waitForTimeout(7500);
await shot('06_forest_edge_compound');
// 调试层
await page.keyboard.press('F3');
await page.waitForTimeout(3600);
await shot('07_debug');
await page.keyboard.press('F3');
// 机库内
await page.evaluate(() => { const S = window.__lueying, P = S.world.player; P.pos.x = -100; P.pos.z = -300; P.pos.y = 4.5 + 1.8; S.view.yaw = Math.PI / 2; S.view.pitch = -0.1; });
await page.waitForTimeout(6000);
await shot('08_hangar');
// 自由相机俯瞰营地
await page.evaluate(() => { const S = window.__lueying; S.view.freeCam = true; S.renderer.freeCam = { x: 120, y: 90, z: -150, yaw: 0.6, pitch: -0.45 }; S.view.freeYaw = 0.6; S.view.freePitch = -0.45; });
await page.waitForTimeout(6000);
await shot('09_freecam_compound');
// 入夜 + 警报 + 战斗
await page.evaluate(() => { const S = window.__lueying, w = S.world; S.view.freeCam = false; w.warp(560); const P = w.player; P.pos.x = 0; P.pos.z = -240; P.pos.y = 4.5 + 1.8; S.view.yaw = 0; w.raiseAlarm(w.guards[0], 'sight'); w.weapons.select(2); });
await page.waitForTimeout(9000);
await page.mouse.move(440, 247);
await page.mouse.down();
await page.waitForTimeout(4500);
await shot('10_night_combat_beam');
await page.mouse.up();
const state = await page.evaluate(() => { const S = window.__lueying, w = S.world; return { mode: S.mode, t: w.time.toFixed(1), camp: w.camp.state, fps: S.hud.fps.toFixed(1), tris: S.renderer.renderer.info.render.triangles, calls: S.renderer.renderer.info.render.calls, trees: S.renderer.forest.counts }; });
console.log('state', JSON.stringify(state));
console.log('errors', errors.length);
for (const e of errors.slice(0, 20)) console.log('  ', e.slice(0, 400));
for (const l of logs.slice(0, 15)) console.log('  log', l.slice(0, 300));
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
