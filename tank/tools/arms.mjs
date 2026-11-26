// Weapon showcase: each weapon is run in isolation until its signature effect is on screen, then screenshotted.
// usage: node tools/arms.mjs <outPrefix> [weapon,weapon,...] [level]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.argv[2] || '/tmp/arm';
const ids = (process.argv[3] || 'tesla,rail,gravity,prism,firework,drones,pulse,ion,barrage,missiles').split(',');
const lv = +(process.argv[4] || 3);
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// returns a predicate (string) evaluated in-page: true when the signature effect is visible
const COND = {
  tesla: `(s)=>s.bolts.length>0&&s.bolts[0].age>0.05`,
  rail: `(s)=>s.beams.length>0&&s.beams[0].age>0.06`,
  gravity: `(s)=>s.wells.length>0&&s.wells[0].age>1.0`,
  prism: `(s)=>s.state==='fire'&&s.t>0.9`,
  firework: `(s)=>s.stars.length>12&&s.stars[0].life<0.9`,
  drones: `(s)=>s.list.some(d=>d.mode==='attack')&&s.list.filter(d=>d.mode==='attack').length>=2`,
  pulse: `(s)=>!!s.ring&&s.ring.t>0.15`,
  ion: `(s)=>!!s.beam&&s.beam.age>0.06`,
  barrage: `(s)=>s.queue.length===0&&false`,
  missiles: `(s)=>false`,
};
const report = [];
for (const id of ids) {
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(`http://127.0.0.1:${port}/?noadapt=1&dpr=1&autostart=1&arms=${id}&lv=${lv}&seed=arm-${id}`);
  await pg.waitForFunction(() => window.__game);
  const info = await pg.evaluate(([id, cond]) => {
    const G = window.__game, g = G.game;
    G.stopBot(); g.state = 'play'; g.banner = null; g.wave.state = 'idle'; g.skyPhase = 0.3; g.wave.n = 3; g.enemies.length = 0;
    const c = g.camera;
    const tough = (e) => { e.hp = e.maxHp = 5000; return e; };
    tough(g.spawnDirect('bomber', c.x - 230, 330, 1)); tough(g.spawnDirect('bomber', c.x + 120, 380, -1)); tough(g.spawnDirect('scout', c.x + 330, 250, -1));
    tough(g.spawnDirect('scout', c.x - 60, 300, 1)); tough(g.spawnDirect('diver', c.x + 40, 430, 1));
    for (const e of g.enemies) { e.vx = 0; e.speed = 0; }
    g.tank.hp = g.tank.hpMax = 99999;
    if (id === 'pulse') { const t = g.tank; g.spawnDirect('scout', t.x + 160, t.y + 120, -1); const q = g.enemies[g.enemies.length - 1]; q.hp = q.maxHp = 5000; q.vx = 0; q.speed = 0; }
    const s = g.arms.by[id]; if (s) { s.cd = 0.1; }
    window.__cond = eval(cond); window.__noRender = true;
    return true;
  }, [id, COND[id]]);
  // step the sim until the signature moment (max 14 s), keeping the camera on the action
  let ok = false, t = 0;
  while (t < 14) {
    ok = await pg.evaluate((id) => { const G = window.__game; G.advance(0.05); const s = G.game.arms.by[id]; return !!s && window.__cond(s); }, id);
    t += 0.05;
    if (ok) break;
    if ((id === 'barrage' || id === 'missiles') && t > (id === 'barrage' ? 1.9 : 2.6)) { ok = true; break; }
  }
  await pg.evaluate(() => { window.__freeze = true; window.__noRender = false; });
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: `${out}-${id}.png` });
  const st = await pg.evaluate(() => ({ kills: window.__game.game.kills, enemies: window.__game.game.enemies.length }));
  report.push(`${ok ? 'OK  ' : 'MISS'} ${id.padEnd(9)} t=${t.toFixed(2)}s ${JSON.stringify(st)} ${errs.length ? 'ERR ' + errs[0] : ''}`);
  await pg.close();
}
console.log(report.join('\n'));
await b.close(); server.close();
