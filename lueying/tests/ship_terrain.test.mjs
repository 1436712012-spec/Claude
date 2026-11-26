import test from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../src/sim/terrain.js';
import { ShipSim, emptyCommand } from '../src/sim/ship.js';
import { SHIP, DT, MAP } from '../src/sim/config.js';
import { START } from '../src/sim/level.js';

const T = new Terrain();

function run(ship, seconds, cmdFn = () => emptyCommand()) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) ship.step(DT, cmdFn(i * DT));
}

test('terrain is deterministic and continuous', () => {
  const T2 = new Terrain();
  assert.equal(T2.trees.length, T.trees.length);
  for (const [x, z] of [[0, 0], [123.4, -55.1], [-400, 600]]) {
    assert.equal(T2.height(x, z), T.height(x, z));
    const d = Math.abs(T.height(x + 0.1, z) - T.height(x, z));
    assert.ok(d < 0.6, 'height continuous');
  }
});

test('compound and clearing are flat plateau, start is on water', () => {
  assert.ok(Math.abs(T.height(0, -300) - MAP.plateauH) < 0.2);
  assert.ok(Math.abs(T.height(-100, -170) - MAP.plateauH) < 0.3);
  assert.ok(T.isWater(START.x, START.z));
});

test('hover spring settles at cruise height without oscillation', () => {
  const s = new ShipSim(T, { x: START.x, z: START.z });
  s.pos.y += 2;
  let maxOver = 0;
  run(s, 4, () => emptyCommand());
  for (let i = 0; i < 60; i++) {
    s.step(DT, emptyCommand());
    maxOver = Math.max(maxOver, Math.abs(s.hAbove - SHIP.heights.cruise));
  }
  assert.ok(maxOver < 0.25, `settled within 0.25m (got ${maxOver.toFixed(3)})`);
});

test('low altitude mode reaches ~0.6 m', () => {
  const s = new ShipSim(T, { x: START.x, z: START.z });
  const c = emptyCommand(); c.setAlt = 'low';
  s.step(DT, c);
  run(s, 4);
  assert.ok(Math.abs(s.hAbove - SHIP.heights.low) < 0.2, `h=${s.hAbove}`);
});

test('omnidirectional translation reaches cruise speed ~38 m/s in about 2 s at 70% power', () => {
  const s = new ShipSim(T, { x: START.x, z: START.z });
  // 沿河向北（世界 -z），也测侧向 +x
  let t38 = null;
  for (let i = 0; i < 240; i++) {
    const c = emptyCommand(); c.mx = 1; c.mz = 0;
    s.step(DT, c);
    // 去掉碰撞干扰：重置位置，只看速度
    s.pos.x = START.x; s.pos.z = START.z;
    if (t38 === null && s.speed > 37.5) t38 = i * DT;
  }
  assert.ok(t38 !== null && t38 > 1.6 && t38 < 2.6, `t38=${t38}`);
  assert.ok(Math.abs(s.speed - SHIP.cruiseSpeed) < 1, `speed=${s.speed}`);
});

test('jump holds 1.5 s, never exceeds ~4 m, then cooldown 4 s', () => {
  const s = new ShipSim(T, { x: START.x, z: START.z });
  run(s, 2);
  const c = emptyCommand(); c.jump = true;
  s.step(DT, c);
  let maxH = 0;
  run(s, 1.4, () => { maxH = Math.max(maxH, s.hAbove); return emptyCommand(); });
  assert.ok(s.jumpT > 0, 'still jumping at 1.4s');
  assert.ok(maxH > 3.3 && maxH < 4.3, `maxH=${maxH}`);
  run(s, 0.2);
  assert.equal(s.jumpT, 0);
  assert.ok(s.jumpCd > 3.7);
  const c2 = emptyCommand(); c2.jump = true;
  s.step(DT, c2);
  assert.equal(s.jumpT, 0, 'cannot jump during cooldown');
});

test('field silence: power to 0, sinks ~0.4 m/s, spool 0.8 s then surge event', () => {
  const s = new ShipSim(T, { x: START.x, z: START.z });
  run(s, 3);
  const c = emptyCommand(); c.silence = true;
  s.step(DT, c);
  run(s, 0.5);
  assert.equal(s.power, 0);
  const y0 = s.pos.y;
  run(s, 1);
  const sink = y0 - s.pos.y;
  assert.ok(sink > 0.3 && sink < 0.5, `sink=${sink}`);
  s.events.length = 0;
  const c2 = emptyCommand(); c2.silence = true;
  s.step(DT, c2);
  let surgeAt = null;
  for (let i = 0; i < 80; i++) {
    s.step(DT, emptyCommand());
    if (surgeAt === null && s.events.some((e) => e.type === 'surge')) surgeAt = (i + 1) * DT;
  }
  assert.ok(surgeAt !== null && Math.abs(surgeAt - 0.8) < 0.05, `surgeAt=${surgeAt}`);
});

test('silence glide eventually scrapes the ground', () => {
  const s = new ShipSim(T, { x: START.x, z: START.z });
  const lo = emptyCommand(); lo.setAlt = 'low';
  s.step(DT, lo);
  run(s, 3);
  s.vel.x = 8;
  const c = emptyCommand(); c.silence = true;
  s.step(DT, c);
  let scraped = false;
  run(s, 5, () => { if (s.events.some((e) => e.type === 'scrape')) scraped = true; return emptyCommand(); });
  assert.ok(scraped, 'touching down while silent produces a scrape');
});

test('boost heats the ship and overheat caps power', () => {
  const s = new ShipSim(T, { x: START.x, z: START.z });
  for (let i = 0; i < 60 * 12; i++) {
    const c = emptyCommand(); c.mx = 1; c.boost = true;
    s.step(DT, c);
    s.pos.x = START.x; s.pos.z = START.z;
  }
  assert.ok(s.overheated, 'overheated after sustained boost');
  run(s, 2);
  assert.ok(s.power <= SHIP.heat.overheatCap + 0.01, `power=${s.power}`);
});

test('trunk collision pushes the ship out and emits scrape', () => {
  const tree = T.trees.find((t) => t.type === 1 && Math.abs(t.z) < 300);
  const s = new ShipSim(T, { x: tree.x + 8, z: tree.z });
  run(s, 1);
  s.events.length = 0;
  for (let i = 0; i < 90; i++) {
    const c = emptyCommand(); c.mx = -1;
    s.step(DT, c);
  }
  const d = Math.hypot(s.pos.x - tree.x, s.pos.z - tree.z);
  assert.ok(d >= SHIP.radius + tree.r - 0.3, `kept outside trunk, d=${d}`);
  assert.ok(s.events.some((e) => e.type === 'scrape'));
});

test('line of sight is blocked by trunks and terrain', () => {
  const tree = T.trees.find((t) => t.type === 0);
  const r = T.los(tree.x - 20, tree.g + 1.5, tree.z, tree.x + 20, tree.g + 1.5, tree.z);
  assert.ok(r.blocked);
  // 地形：从低处看向远处高地的背后
  const r2 = T.los(0, -100, 0, 0, 100, 0);
  assert.ok(r2.blocked && r2.by === 'terrain');
});
