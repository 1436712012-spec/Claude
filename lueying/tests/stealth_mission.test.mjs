import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { emptyCommand } from '../src/sim/ship.js';
import { DT, DETECT, MISSION, CLOCK, SHIP } from '../src/sim/config.js';
import { radarCheck, satelliteExposure, stimulate, updateAwareness } from '../src/sim/detection.js';
import { WRECK, EXTRACT, TERMINAL } from '../src/sim/level.js';
import { spawnCar } from '../src/sim/enemies.js';

function place(ship, x, z, h = 1.8) {
  ship.pos.x = x; ship.pos.z = z;
  ship.pos.y = ship.terrain.groundHeight(x, z) + h;
  ship.vel.x = 0; ship.vel.y = 0; ship.vel.z = 0;
}

function idle(w, seconds, cmdFn) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) w.step(DT, { ship: cmdFn ? cmdFn(i * DT) : emptyCommand() });
}

// 把僚机停在远处，避免干扰测试
function parkWingmen(w) {
  for (const m of w.wingmen) { m.setOrder('hold', { silent: true }); place(m.ship, m.ship.pos.x, m.ship.pos.z + 40, 0.6); }
}

test('suspicion needs at least 0.6 s from 0 to 100 even at full visibility', () => {
  const w = new World();
  const g = w.guards[0];
  g.gainRate = 10000;
  g.sense = null; // 固定增益，不重算
  let t = 0;
  while (g.sus < 99.99 && t < 3) { updateAwareness(w, g, DT); t += DT; }
  assert.ok(t >= DETECT.minRiseTime - 1e-6, `rise time ${t}`);
  // 离散线索同样受限
  const w2 = new World();
  const g2 = w2.guards[1];
  stimulate(w2, g2, 500, 'trace:mist', { x: 0, y: 0, z: 0 });
  let t2 = 0;
  while (g2.sus < 99.99 && t2 < 3) { updateAwareness(w2, g2, DT); t2 += DT; }
  assert.ok(t2 >= DETECT.minRiseTime - 1e-6, `discrete rise ${t2}`);
});

test('state machine: quiet → suspicious → search → alarm, and decays back to quiet', () => {
  const w = new World();
  const g = w.guards.find((x) => x.id === 'gLab');
  g.sense = null;
  const tick = (n) => { for (let i = 0; i < n; i++) { w.time += DT; updateAwareness(w, g, DT); } };
  stimulate(w, g, 35, 'trace:mist', { x: g.pos.x + 30, y: 5, z: g.pos.z });
  tick(30);
  assert.equal(g.aware, 'suspicious');
  stimulate(w, g, 40, 'trace:mist', { x: g.pos.x + 30, y: 5, z: g.pos.z });
  tick(30);
  assert.equal(g.aware, 'search');
  // 没有新线索：搜索计时结束后，怀疑度每秒下降 8，回到安静
  g.searchT = 0;
  tick(60 * 12);
  assert.equal(g.aware, 'quiet');
  // 满 100 → 营地警报
  stimulate(w, g, 120, 'sight', g.pos);
  tick(60);
  assert.equal(w.camp.state, 'alarm');
});

test('radar: blocked under canopy, below river bank and by doppler gate; sees fast target in the open', () => {
  const w = new World();
  const R = w.radar;
  const T = w.terrain;
  const mk = (x, z, h, vx, vz) => ({ id: 'probe', pos: { x, y: T.groundHeight(x, z) + h, z }, vel: { x: vx, y: 0, z: vz } });
  // 清障带：开阔、径向速度 30 → 看得见
  const open = mk(-100, -170, 1.8, 0, 30);
  assert.equal(radarCheck(w, R, open).seen, true);
  // 同一点但慢速（< 6 m/s）→ 多普勒滤掉
  assert.equal(radarCheck(w, R, mk(-100, -170, 1.8, 0, 3)).why, 'doppler');
  // 树冠下
  let canopyPt = null;
  for (let z = -100; z < 200 && !canopyPt; z += 7) for (let x = -200; x < 200; x += 7) if (T.underCanopy(x, z) && T.canopy(x, z) > 0.8) { canopyPt = [x, z]; break; }
  assert.equal(radarCheck(w, R, mk(canopyPt[0], canopyPt[1], 1.8, 0, 30)).seen, false);
  // 河岸下：沿小溪找一个不在树冠下、但被地形遮住的点
  let bankHidden = false;
  for (let z = -100; z < 400; z += 4) {
    const x = [10, 22, 40, 50, 60, 10, -30, -20][Math.min(7, Math.floor((z + 100) / 70))];
    const r = radarCheck(w, R, mk(x, z, 0.6, 0, 30));
    if (!r.seen && (r.why === 'terrain' || r.why === 'trunk')) { bankHidden = true; break; }
  }
  assert.ok(bankHidden, 'some creek segment is masked by terrain/trunks');
});

test('satellite: fast over the river is captured, slow or under canopy is not', () => {
  const w = new World();
  const s = w.player;
  place(s, -45, 728, 1.8);
  s.vel.z = -30; s.speed = 30; s.hAbove = 1.8;
  assert.equal(satelliteExposure(w, s).exposed, true);
  s.speed = 8;
  assert.equal(satelliteExposure(w, s).exposed, false);
  const T = w.terrain;
  const t = T.trees.find((tr) => tr.type === 0 && T.canopy(tr.x + 5, tr.z) > 0.6);
  place(s, t.x + 5, t.z, 1.8);
  s.speed = 40;
  assert.equal(satelliteExposure(w, s).exposed, false);
  // 完整流程：等到过境，在河面高速飞
  const w2 = new World();
  parkWingmen(w2);
  w2.warp(CLOCK.satFirst - 1);
  place(w2.player, -45, 728, 1.8);
  idle(w2, 3, () => { const c = emptyCommand(); c.mz = -1; w2.player.pos.x = -45; w2.player.pos.z = 728; return c; });
  assert.ok(w2.mission.stats.satCaptures.length >= 1, 'captured during pass');
});

test('drones stay docked in heavy rain and launch after the rain stops', () => {
  const w = new World();
  parkWingmen(w);
  idle(w, 5);
  assert.ok(w.drones.every((d) => d.state === 'docked'));
  w.warp(CLOCK.sunset - 5 - w.time);
  idle(w, 25);
  assert.ok(w.env.rain < 0.12);
  assert.ok(w.drones.some((d) => d.state === 'patrol' || d.state === 'launch'), w.drones.map((d) => d.state).join(','));
});

test('upload: clip + alarm starts a 40 s upload; field pulse at the terminal cuts it', () => {
  const w = new World();
  parkWingmen(w);
  place(w.player, -45, 728);
  const cam = w.cameras[0];
  w.addClip(cam, w.targets()[0]);
  w.raiseAlarm(w.guards[0], 'sight');
  idle(w, 20);
  assert.ok(w.exposure.sat.active);
  assert.ok(w.exposure.sat.progress > 0.35 && w.exposure.sat.progress < 0.65, `progress ${w.exposure.sat.progress}`);
  // 场脉冲：飞到终端旁
  place(w.player, TERMINAL.x, TERMINAL.z - 20, 1.8);
  const c = emptyCommand(); c.pulse = true;
  w.step(DT, { ship: c });
  idle(w, 0.2);
  assert.equal(w.exposure.sat.active, false);
  assert.equal(w.exposure.uploaded, null);
  assert.ok(w.terminal.disabled > 0);
});

test('upload completes → mission fails as 曝光', () => {
  const w = new World();
  parkWingmen(w);
  w.wingmen.find((m) => m.id === 'bedrock').out = true;
  w.addClip(w.cameras[1], w.targets()[0]);
  w.raiseAlarm(w.guards[0], 'sight');
  idle(w, MISSION.uploadTime + 2);
  assert.equal(w.mission.over, true);
  assert.equal(w.mission.result.rating, 'exposed');
});

test('bedrock jams the terminal after alarm: upload takes 55 s', () => {
  const w = new World();
  for (const m of w.wingmen) m.setOrder('hold', { silent: true });
  const b = w.wingmen.find((m) => m.id === 'bedrock');
  place(b.ship, 40, -300, 0.6);
  w.addClip(w.cameras[1], w.targets()[0]);
  w.raiseAlarm(w.guards[0], 'sight');
  b.setOrder('hold', { silent: true });
  place(b.ship, 40, -300, 0.6);
  idle(w, 1);
  assert.equal(w.exposure.uploadDuration(), MISSION.uploadTime + MISSION.jamBonus);
});

function grabCoreAndExtract(w) {
  place(w.player, WRECK.x, WRECK.z, 0.6);
  const c = emptyCommand(); c.setAlt = 'low';
  w.step(DT, { ship: c });
  idle(w, MISSION.coreHold + 1.5, () => { place(w.player, WRECK.x, WRECK.z, w.player.hAbove); w.player.vel.x = 0; w.player.vel.z = 0; return emptyCommand(); });
  assert.ok(w.mission.core.taken, 'core taken');
  place(w.player, EXTRACT.x, EXTRACT.z, 1.8);
  idle(w, 0.5);
}

test('rating 幽灵: retrieve and extract without any search or satellite capture', () => {
  const w = new World();
  parkWingmen(w);
  // 让守卫“看不见”：只测规则
  for (const o of w.observers) o.sense = null;
  grabCoreAndExtract(w);
  assert.equal(w.mission.over, true);
  assert.equal(w.mission.result.rating, 'ghost');
});

test('rating 影子 / 突围 / 雷霆 / 失败 follow the rules', () => {
  // 影子：有人搜索但没有警报
  const a = new World(); parkWingmen(a);
  for (const o of a.observers) o.sense = null;
  a.mission.stats.search = 1;
  grabCoreAndExtract(a);
  assert.equal(a.mission.result.rating, 'shadow');
  // 突围：警报后带出场核、无影像外传
  const b = new World(); parkWingmen(b);
  for (const o of b.observers) o.sense = null;
  b.raiseAlarm(b.guards[0], 'sight');
  grabCoreAndExtract(b);
  assert.equal(b.mission.result.rating, 'breakout');
  // 雷霆：先黑箱再击溃守军
  const c = new World(); parkWingmen(c);
  for (const o of c.observers) o.sense = null;
  c.raiseAlarm(c.guards[0], 'sight');
  c.combat.blackboxAt = 10; c.mission.stats.defeatedAt = 20;
  grabCoreAndExtract(c);
  assert.equal(c.mission.result.rating, 'thunder');
  // 失败：没有场核就到撤离点不会结算；被击毁直接失败
  const d = new World(); parkWingmen(d);
  d.player.damage(500);
  idle(d, 0.2);
  assert.equal(d.mission.result.rating, 'fail');
});

test('wingman follow-trail replays the player path with ~2 s delay', () => {
  const w = new World();
  const echo = w.wingmen[0];
  for (const m of w.wingmen) if (m !== echo) m.setOrder('hold', { silent: true });
  // 玩家沿河直线飞
  idle(w, 3);
  const samples = [];
  idle(w, 8, (t) => {
    const c = emptyCommand(); c.mx = 0.6;
    samples.push({ t: w.time, x: w.player.pos.x, z: w.player.pos.z });
    return c;
  });
  const now = w.time;
  const past = samples.reduce((best, s) => (Math.abs(s.t - (now - 2)) < Math.abs(best.t - (now - 2)) ? s : best));
  const d = Math.hypot(echo.ship.pos.x - past.x, echo.ship.pos.z - past.z);
  assert.ok(echo.locked, 'locked on trail');
  assert.ok(d < 3, `echo is on the player's position from 2 s ago (d=${d.toFixed(2)})`);
});

test('distract lures at least one guard off its patrol route', () => {
  const w = new World({ weather: { rain: 0, light: 1 } });
  parkWingmen(w);
  for (const o of w.observers) if (o.kind !== 'guard') o.sense = null;
  const g = w.guards.find((x) => x.id === 'gSouth');
  const glim = w.wingmanById('glimmer');
  const P = { x: g.pos.x, z: -150 };
  place(glim.ship, P.x - 60, -120, 1.8);
  w.selected = 'glimmer';
  w.command('distract', { point: P });
  let lured = false;
  idle(w, 25, () => {
    if (g.aware === 'search' || (g.aware === 'suspicious' && Math.abs(g.pos.z + 216) > 0.5)) lured = true;
    return emptyCommand();
  });
  assert.ok(lured, `guard aware=${g.aware} act=${g.act}`);
});

test('field silence makes the ship invisible to EM stations; re-start surge is caught', () => {
  const w = new World();
  parkWingmen(w);
  const em = w.emStations[0];
  place(w.player, em.x + 15, em.z + 5, 1.8);
  idle(w, 2);
  assert.ok(em.sus > 10, `powered ship raises EM suspicion (${em.sus})`);
  const em2 = new World().emStations[0];
  const w2 = new World(); parkWingmen(w2);
  const s = w2.player;
  place(s, em2.x + 15, em2.z + 5, 1.8);
  const c = emptyCommand(); c.silence = true;
  w2.step(DT, { ship: c });
  const station = w2.emStations[0];
  station.sus = 0; station.pending = 0;
  idle(w2, 0.3);
  const before = station.sus;
  idle(w2, 1.5, () => { s.pos.y = Math.max(s.pos.y, w2.terrain.groundHeight(s.pos.x, s.pos.z) + 1); return emptyCommand(); });
  assert.ok(station.sus <= before + 0.5, `silent ship invisible to EM (${station.sus})`);
  const c2 = emptyCommand(); c2.silence = true;
  w2.step(DT, { ship: c2 });
  idle(w2, 1.6);
  assert.ok(station.sus > 30, `surge caught (${station.sus})`);
});

test('pulse disables cameras, lamps and drones within 35 m and alerts the camp', () => {
  const w = new World({ weather: { rain: 0, light: 0.5 } });
  parkWingmen(w);
  const cam = w.cameras[2];
  place(w.player, cam.pos.x + 10, cam.pos.z + 10, 1.8);
  const c = emptyCommand(); c.pulse = true;
  w.step(DT, { ship: c });
  assert.ok(cam.disabled > 19);
  assert.ok(w.player.pulseCd > 89);
  idle(w, 2);
  assert.ok(w.guards.some((g) => g.aware !== 'quiet'), 'camp noticed the anomaly');
});

test('the simulation is deterministic for the same seed and inputs', () => {
  const runOnce = () => {
    const w = new World({ seed: 7 });
    for (let i = 0; i < 60 * 25; i++) {
      const c = emptyCommand(); c.mz = -0.7; c.mx = Math.sin(i * 0.01) * 0.5;
      w.step(DT, { ship: c });
    }
    return JSON.stringify([w.player.pos, w.wingmen.map((m) => m.ship.pos), w.guards.map((g) => [g.pos, g.sus]), w.traces.list.length]);
  };
  assert.equal(runOnce(), runOnce());
});
