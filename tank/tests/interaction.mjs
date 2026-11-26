// Real keyboard/mouse smoke test: drive, aim, charge-fire, machine-gun, jump, missiles, pause.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto(`http://127.0.0.1:${port}/?noadapt=1&dpr=1&bot=1`);
await pg.waitForFunction(() => window.__game);
const G = (fn) => pg.evaluate(fn);
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

check('title state first', (await G(() => window.__game.game.state)) === 'title');
await pg.mouse.click(480, 270);               // start the run -> weapon pick screen
await pg.waitForTimeout(300);
check('click opens the weapon pick', (await G(() => window.__game.game.state)) === 'pick');
check('pick offers 3 new weapons', (await G(() => window.__game.game.offer.length)) === 3);
await pg.keyboard.press('Digit2');
await pg.waitForTimeout(300);
check('pressing 2 picks a weapon and starts', (await G(() => window.__game.game.state)) === 'play' && (await G(() => window.__game.game.arms.list.length)) === 3);
await G(() => { window.__game.game.wave.state = 'idle'; window.__game.game.banner = null; window.__game.game.enemies.length = 0; });

// driving
const x0 = await G(() => window.__game.game.tank.x);
await pg.keyboard.down('KeyD'); await pg.waitForTimeout(900); await pg.keyboard.up('KeyD');
const x1 = await G(() => window.__game.game.tank.x);
check('D drives right', x1 > x0 + 20, `x ${x0.toFixed(0)} -> ${x1.toFixed(0)}`);
await pg.keyboard.down('KeyA'); await pg.waitForTimeout(900); await pg.keyboard.up('KeyA');
check('A drives left', (await G(() => window.__game.game.tank.x)) < x1 - 10);

// aiming follows the mouse
await pg.mouse.move(800, 120); await pg.waitForTimeout(250);
const a1 = await G(() => window.__game.game.tank.barrelAng);
await pg.mouse.move(800, 400); await pg.waitForTimeout(250);
const a2 = await G(() => window.__game.game.tank.barrelAng);
check('barrel follows the cursor', Math.abs(a1 - a2) > 0.05, `${a1.toFixed(2)} -> ${a2.toFixed(2)}`);

// charge-fire: hold ~1s => tier>=2 flak, release => shell, then a cloud appears
await pg.mouse.move(700, 150);
await pg.mouse.down(); await G(() => window.__game.advance(1.1));
const tier = await G(() => window.__game.game.tank.tier);
await pg.mouse.up(); await pg.waitForTimeout(150);
const shells = await G(() => window.__game.game.shells.length);
check('hold charges to a higher tier', tier >= 2, 'tier ' + tier);
check('release fires a shell', shells >= 1, 'shells ' + shells);
await G(() => window.__game.advance(3));
check('flak shell airbursts into a cloud', (await G(() => window.__game.game.clouds.length)) >= 1);

// machine gun
await pg.mouse.move(700, 200);
await pg.mouse.down({ button: 'right' }); await G(() => window.__game.advance(0.4));
const tr = await G(() => window.__game.game.tracers.length);
await pg.mouse.up({ button: 'right' });
check('right mouse fires the machine gun', tr >= 1, 'tracers ' + tr);

// jump
await G(() => window.__game.advance(1));
await pg.keyboard.press('Space'); await pg.waitForTimeout(200);
check('Space jumps (jets)', await G(() => window.__game.game.tank.air));

// missiles need a target
await G(() => { window.__game.give('missiles', 1); window.__game.game.spawnDirect('scout', window.__game.game.camera.x + 200, 260, -1); window.__game.game.tank.missileCd = 0; });
await pg.keyboard.press('KeyQ'); await pg.waitForTimeout(120);
check('Q launches the missile salvo', (await G(() => window.__game.game.missiles.length)) >= 3);

// pause
await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
check('Esc pauses', (await G(() => window.__game.game.state)) === 'paused');
await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
check('Esc resumes', (await G(() => window.__game.game.state)) === 'play');

// hurt + death flow
await G(() => { const g = window.__game.game; g.tank.hp = 1; g.tank.invuln = 0; });
await G(() => { const g = window.__game.game; g.ebullets.push({ x: g.tank.x, y: g.tank.y + 30, vx: 0, vy: 0, life: 1 }); window.__game.advance(0.2); });
check('tank can be destroyed', await G(() => window.__game.game.tank.dead));
await G(() => window.__game.advance(3));
check('game over is reached', (await G(() => window.__game.game.state)) === 'over');
await G(() => { window.__game.game.overT = 2; });
await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
check('Enter restarts (weapon pick again)', (await G(() => window.__game.game.state)) === 'pick');
await pg.keyboard.press('Digit1'); await pg.waitForTimeout(200);
// auto-fire toggle
await pg.keyboard.press('KeyT'); await pg.waitForTimeout(100);
check('T toggles full-auto fire', (await G(() => window.__game.settings.autoFire)) === true);

check('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(results.every(Boolean) ? '\nALL PASSED' : '\nSOME FAILED');
await b.close(); server.close();
process.exit(results.every(Boolean) ? 0 : 1);
