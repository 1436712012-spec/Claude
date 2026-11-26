// 浏览器交互验证：真实键鼠事件 → 游戏状态断言；再用手机视口验证触屏布局与按钮。
// node tools/e2e.mjs [dev|dist]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { serve } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const mode = process.argv[2] || 'dev';
const port = 8400 + Math.floor(Math.random() * 300);
const server = await serve(port, root);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const target = mode === 'dist' ? `http://localhost:${port}/dist/index.html` : `http://localhost:${port}/index.html`;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

async function open(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (route) => {
    const rel = route.request().url().split('three@0.160.0/')[1];
    route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'node_modules/three', rel)) });
  });
  await page.addInitScript(() => localStorage.setItem('lueying.settings', JSON.stringify({ quality: 'low' })));
  await page.goto(target);
  await page.waitForFunction(() => window.__lueying && window.__lueying.mode === 'title', null, { timeout: 240000 });
  return { page, ctx, errors };
}
const frames = (page, n) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => { if (++k >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
const st = (page, fn) => page.evaluate(fn);

// ---------- 桌面 ----------
{
  const { page, ctx, errors } = await open({ viewport: { width: 400, height: 240 } });
  await page.click('button[data-a="start"]');
  // 挂载：换成 重力锚 + 记忆雾 + 重力锤 + 雷暴阵列
  for (const id of ['stasis', 'phantom', 'beam', 'swarm']) await page.click(`.wcard[data-w="${id}"]`);
  for (const id of ['anchor', 'fog', 'hammer', 'storm']) await page.click(`.wcard[data-w="${id}"]`);
  await page.click('button[data-a="go"]');
  await page.waitForFunction(() => window.__lueying.mode === 'play');
  check('loadout applied', await st(page, () => window.__lueying.world.weapons.slots.join(',')) === 'anchor,fog,hammer,storm');
  const z0 = await st(page, () => window.__lueying.world.player.pos.z);
  await page.keyboard.down('KeyW'); await frames(page, 25); await page.keyboard.up('KeyW');
  const z1 = await st(page, () => window.__lueying.world.player.pos.z);
  check('W moves the ship forward (north)', z1 < z0 - 0.5, `${z0.toFixed(1)} → ${z1.toFixed(1)}`);
  await page.keyboard.press('KeyC'); await frames(page, 3);
  check('C toggles low altitude', await st(page, () => window.__lueying.world.player.altMode) === 'low');
  await page.keyboard.press('KeyF'); await frames(page, 3);
  check('F engages field silence', await st(page, () => window.__lueying.world.player.silent) === true);
  await page.keyboard.press('KeyF'); await frames(page, 3);
  check('F again spools the field back up', await st(page, () => !window.__lueying.world.player.silent));
  await page.keyboard.press('Tab'); await frames(page, 2);
  check('Tab selects a wingman', await st(page, () => window.__lueying.world.selected) === 'echo');
  await page.keyboard.press('Digit2'); await frames(page, 3);
  check('2 orders hold to the selected wingman', await st(page, () => window.__lueying.world.wingmanById('echo').order) === 'hold');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await frames(page, 2);
  check('Tab cycles back to all', await st(page, () => window.__lueying.world.selected) === 'all');
  await page.keyboard.press('Digit3'); await frames(page, 3);
  check('3 enters distract targeting', await st(page, () => window.__lueying.ui.targeting) === true);
  await page.mouse.click(200, 120); await frames(page, 4);
  check('click confirms distract point', await st(page, () => window.__lueying.world.wingmen.some((m) => m.order === 'distract')));
  // 指令轮盘
  await page.keyboard.down('KeyQ'); await frames(page, 2);
  check('Q opens the command wheel', await st(page, () => !document.getElementById('wheel').classList.contains('hidden')));
  await page.keyboard.up('KeyQ'); await frames(page, 2);
  check('releasing Q closes the wheel', await st(page, () => document.getElementById('wheel').classList.contains('hidden')));
  await page.keyboard.press('Digit7'); await frames(page, 2);
  check('7 selects the third weapon slot', await st(page, () => window.__lueying.world.weapons.current) === 'hammer');
  await page.keyboard.press('KeyR'); await frames(page, 2);
  check('R cycles weapons', await st(page, () => window.__lueying.world.weapons.current) === 'storm');
  await page.keyboard.press('Digit5'); await frames(page, 2);
  await page.mouse.click(200, 130); await frames(page, 4);
  check('clicking fires the gravity anchor', await st(page, () => window.__lueying.world.weapons.cd.anchor > 0));
  await page.keyboard.press('KeyG'); await frames(page, 3);
  check('G releases the field pulse', await st(page, () => window.__lueying.world.player.pulseCd > 80));
  await page.keyboard.press('F3'); await frames(page, 3);
  check('F3 shows the debug layer', await st(page, () => !document.getElementById('debugPanel').classList.contains('hidden')));
  await page.keyboard.press('F3');
  await page.keyboard.press('KeyM'); await frames(page, 2);
  check('M opens the big map', await st(page, () => !!document.getElementById('bigmap')));
  await page.keyboard.press('KeyM');
  await page.keyboard.press('Escape'); await frames(page, 2);
  check('Esc pauses', await st(page, () => window.__lueying.mode) === 'pause');
  await page.click('button[data-a="resume"]'); await frames(page, 2);
  check('resume returns to play', await st(page, () => window.__lueying.mode) === 'play');
  check('desktop: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------- 手机 ----------
{
  const phone = devices['iPhone 13'];
  const { page, ctx, errors } = await open({ ...phone, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.tap('button[data-a="start"]');
  await page.tap('button[data-a="go"]');
  await page.waitForFunction(() => window.__lueying.mode === 'play');
  await frames(page, 3);
  check('touch controls are shown', await st(page, () => !document.getElementById('touch').classList.contains('hidden')));
  await page.tap('#touch [data-p="alt"]'); await frames(page, 3);
  check('touch: altitude button', await st(page, () => window.__lueying.world.player.altMode) === 'low');
  await page.tap('#touch [data-p="silence"]'); await frames(page, 3);
  check('touch: silence button', await st(page, () => window.__lueying.world.player.silent) === true);
  await page.tap('#touch [data-sel="glimmer"]'); await frames(page, 2);
  check('touch: avatar selects glimmer', await st(page, () => window.__lueying.world.selected) === 'glimmer');
  await page.tap('#touch [data-c="2"]'); await frames(page, 2);
  check('touch: distract asks for a minimap point', await st(page, () => window.__lueying.ui.pickOnMap) === true);
  const box = await page.locator('#minimap').boundingBox();
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.2); await frames(page, 3);
  check('touch: minimap tap sends glimmer to distract', await st(page, () => window.__lueying.world.wingmanById('glimmer').order) === 'distract');
  // 虚拟摇杆：左下拖动
  const cdp = await ctx.newCDPSession(page);
  const z0 = await st(page, () => window.__lueying.world.player.pos.z);
  await page.tap('#touch [data-p="silence"]'); await frames(page, 30);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 80, y: 700 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 80, y: 640 }] });
  await frames(page, 25);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const z1 = await st(page, () => window.__lueying.world.player.pos.z);
  check('touch: left stick moves the ship', z1 < z0 - 0.3, `${z0.toFixed(1)} → ${z1.toFixed(1)}`);
  await page.screenshot({ path: path.join(root, '.smoke', 'phone.png') });
  check('phone: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
