// Mobile touch smoke test: emulated phone (landscape), real multi-touch via CDP.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const shot = process.argv[2];
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
const pg = await ctx.newPage();
const cdp = await ctx.newCDPSession(pg);
const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id ?? 0, radiusX: 8, radiusY: 8, force: 1 })) });
const G = (fn, a) => pg.evaluate(fn, a);
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

await pg.goto(`http://127.0.0.1:${port}/?noadapt=1&dpr=1&bot=1`);
await pg.waitForFunction(() => window.__game);
check('touch device detected', await G(() => window.__game.input.touch.enabled));
check('auto-fire defaults ON for touch', await G(() => window.__game.settings.autoFire === true));
check('title state', (await G(() => window.__game.game.state)) === 'title');
await touch('touchStart', [[420, 195, 1]]); await touch('touchEnd', []);
await pg.waitForTimeout(400);
check('tap starts the run (card pick)', (await G(() => window.__game.game.state)) === 'pick');
await pg.waitForTimeout(500);
await G(() => window.__game.hud.draw(window.__game.game, window.__game.input));
const card = await G(() => { const c = window.__game.hud.cards; return c ? c[1] : null; });
check('three cards are laid out', !!card && (await G(() => window.__game.hud.cards.length)) === 3);
if (shot) await pg.screenshot({ path: shot + '-pick.png' });
await touch('touchStart', [[card.x + card.w / 2, card.y + card.h / 2, 1]]); await touch('touchEnd', []);
await pg.waitForTimeout(400);
check('tapping a card picks the weapon', (await G(() => window.__game.game.state)) === 'play' && (await G(() => window.__game.game.arms.list.length)) === 3);
await G(() => { const g = window.__game.game; g.wave.state = 'idle'; g.banner = null; g.enemies.length = 0; });

// virtual stick: drag right
const x0 = await G(() => window.__game.game.tank.x);
await touch('touchStart', [[110, 300, 2]]); await touch('touchMove', [[190, 300, 2]]);
check('stick registers a drag', (await G(() => window.__game.input.touch.stick.axis)) > 0.5);
await G(() => window.__game.advance(1.0));
await touch('touchEnd', []);
const x1 = await G(() => window.__game.game.tank.x);
check('stick drives the tank right', x1 > x0 + 30, `x ${x0.toFixed(0)} -> ${x1.toFixed(0)}`);
check('stick release stops input', (await G(() => window.__game.input.touch.stick.axis)) === 0);

// flick up = jump
await touch('touchStart', [[110, 300, 3]]); await touch('touchMove', [[110, 215, 3]]);
await G(() => window.__game.advance(0.1));
check('flick up on the stick jumps', await G(() => window.__game.game.tank.air));
await touch('touchEnd', []);
await G(() => window.__game.advance(2));

// two fingers at once: stick + aim
await G(() => { const g = window.__game.game; g.spawnDirect('scout', g.camera.x + 150, 250, -1); g.enemies.forEach((e) => (e.hp = e.maxHp = 9999)); });
await touch('touchStart', [[110, 300, 4]]); await touch('touchStart', [[110, 300, 4], [600, 130, 5]]);
check('aim finger is tracked simultaneously', await G(() => window.__game.input.touch.aim.active));
await G(() => window.__game.advance(0.4));
const aim = await G(() => { const g = window.__game, t = g.game.tank, a = g.input.touch.aim; const w = g.game.camera.screenToWorld(a.x, a.y - a.off); return { dx: Math.abs(t.aimX - w.x), dy: Math.abs(t.aimY - w.y) }; });
check('manual aim overrides auto-target', aim.dx < 8 && aim.dy < 8, JSON.stringify(aim));
await G(() => window.__game.advance(2.5));
check('cannon fires automatically', (await G(() => window.__game.game.shells.length + window.__game.game.clouds.length)) > 0);
if (shot) await pg.screenshot({ path: shot + '-play.png' });
await touch('touchEnd', []);
check('aim released', !(await G(() => window.__game.input.touch.aim.active)));

// overdrive button
await G(() => { window.__game.game.combo.meter = 100; });
const od = await G(() => window.__game.input.btns.od);
await touch('touchStart', [[od.x, od.y, 6]]); await touch('touchEnd', []);
await G(() => window.__game.advance(0.1));
check('overdrive button works', (await G(() => window.__game.game.combo.odT)) > 0);

// pause button
const pb = await G(() => window.__game.input.btns.pause);
await touch('touchStart', [[pb.x, pb.y, 7]]); await touch('touchEnd', []);
await pg.waitForTimeout(250);
check('pause button pauses', (await G(() => window.__game.game.state)) === 'paused');
if (shot) await pg.screenshot({ path: shot + '-pause.png' });
await pg.click('#panel button');
check('resume button resumes', (await G(() => window.__game.game.state)) === 'play');
check('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(results.every(Boolean) ? '\nALL PASSED' : '\nSOME FAILED');
await b.close(); server.close();
process.exit(results.every(Boolean) ? 0 : 1);
