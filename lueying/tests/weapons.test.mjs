import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { emptyCommand } from '../src/sim/ship.js';
import { DT, WEAPONS } from '../src/sim/config.js';
import { spawnCar, spawnHeli } from '../src/sim/enemies.js';

function place(ship, x, z, h = 1.8) {
  ship.pos.x = x; ship.pos.z = z;
  ship.pos.y = ship.terrain.groundHeight(x, z) + h;
  ship.vel.x = 0; ship.vel.y = 0; ship.vel.z = 0;
}
function aimAt(w, tx, ty, tz) {
  const o = { x: w.player.pos.x, y: w.player.pos.y + 0.6, z: w.player.pos.z };
  const dx = tx - o.x, dy = ty - o.y, dz = tz - o.z, l = Math.hypot(dx, dy, dz);
  return { o, d: { x: dx / l, y: dy / l, z: dz / l } };
}
function step(w, n, inp = {}) {
  for (let i = 0; i < n; i++) w.step(DT, { ship: emptyCommand(), ...inp(i) });
}
function setup(loadout) {
  const w = new World({ loadout, weather: { rain: 0, light: 0.8 } });
  for (const m of w.wingmen) m.setOrder('hold', { silent: true });
  return w;
}

test('静滞束 freezes a guard for 8 s, then the guard forgets', () => {
  const w = setup(['stasis', 'phantom', 'beam', 'swarm']);
  const g = w.guards.find((x) => x.id === 'gLab');
  g.sus = 50; g.aware = 'suspicious';
  place(w.player, g.pos.x + 25, g.pos.z + 8, 1.8);
  const aim = aimAt(w, g.pos.x, g.pos.y + 1.2, g.pos.z);
  w.weapons.select(0);
  w.step(DT, { ship: emptyCommand(), aim, firePressed: true });
  assert.ok(g.stunned > 7.5, 'frozen');
  assert.ok(w.traces.list.some((t) => t.type === 'beam'), 'beam leaves a visible trace');
  assert.ok(w.weapons.cd.stasis > 19);
  step(w, Math.round(8.2 / DT), () => ({ aim }));
  assert.equal(g.stunned, 0);
  assert.ok(g.sus < 5, 'memory wiped');
  // 对车辆无效
  const car = spawnCar(w, 0);
  w.weapons.cd.stasis = 0;
  place(w.player, car.pos.x + 20, car.pos.z, 1.8);
  w.step(DT, { ship: emptyCommand(), aim: aimAt(w, car.pos.x, car.pos.y + 1, car.pos.z), firePressed: true });
  assert.ok(!(car.stunned > 0));
});

test('幻影投射 spawns a hologram target that cameras can film as evidence', () => {
  const w = setup(['stasis', 'phantom', 'beam', 'swarm']);
  const cam = w.cameras[2];
  place(w.player, cam.pos.x - 70, cam.pos.z + 0, 1.8);
  w.weapons.select(1);
  const aim = aimAt(w, cam.pos.x - 30, 4.5, cam.pos.z);
  w.step(DT, { ship: emptyCommand(), aim, firePressed: true });
  assert.equal(w.weapons.phantoms.length, 1);
  assert.ok(w.targets().some((t) => t.phantom));
  step(w, Math.round(10.5 / DT), () => ({ aim }));
  assert.equal(w.weapons.phantoms.length, 0, 'gone after 10 s');
});

test('重力锚 holds a patrol car for 15 s and flushes birds', () => {
  const w = setup(['anchor', 'fog', 'hammer', 'storm']);
  const car = spawnCar(w, 0);
  place(w.player, car.pos.x + 30, car.pos.z, 1.8);
  w.weapons.select(0);
  const aim = aimAt(w, car.pos.x, car.pos.y, car.pos.z);
  w.step(DT, { ship: emptyCommand(), aim, firePressed: true });
  assert.ok(w.traces.list.some((t) => t.type === 'thud'));
  step(w, 60, () => ({ aim }));
  assert.ok(car.anchored > 0, 'car held');
  const x0 = car.pos.x, z0 = car.pos.z;
  step(w, 120, () => ({ aim }));
  assert.ok(Math.hypot(car.pos.x - x0, car.pos.z - z0) < 1.5, 'car not moving');
});

test('记忆雾 wipes suspicion of guards in range, once per mission', () => {
  const w = setup(['anchor', 'fog', 'hammer', 'storm']);
  const g = w.guards.find((x) => x.id === 'gYard');
  g.sense = null;
  g.sus = 55; g.aware = 'suspicious';
  place(w.player, g.pos.x + 30, g.pos.z, 1.8);
  w.weapons.select(1);
  const aim = aimAt(w, g.pos.x, g.pos.y, g.pos.z);
  w.step(DT, { ship: emptyCommand(), aim, firePressed: true });
  assert.equal(g.sus, 0);
  assert.equal(g.aware, 'quiet');
  assert.equal(w.weapons.uses.fog, 0);
  assert.equal(w.weapons.fire('fog', aim), false, 'only once');
});

test('湮灭束 melts a car and overheats into a 3 s forced vent', () => {
  const w = setup(['stasis', 'phantom', 'beam', 'swarm']);
  const car = spawnCar(w, 0);
  car.sense = null;
  place(w.player, car.pos.x + 40, car.pos.z, 1.8);
  w.weapons.select(2);
  let locked = false;
  for (let i = 0; i < 60 * 6; i++) {
    const aim = aimAt(w, car.pos.x, car.pos.y + 1.1, car.pos.z);
    w.step(DT, { ship: emptyCommand(), aim, fireHeld: true });
    if (w.player.weaponLock > 0) locked = true;
  }
  assert.equal(car.state, 'wrecked', `car hp ${car.hp}`);
  assert.ok(locked, 'overheat forced vent');
});

test('蜂群针 locks multiple targets and the salvo knocks them down; 12 s reload', () => {
  const w = setup(['stasis', 'phantom', 'beam', 'swarm']);
  const gs = w.guards.filter((g) => ['gYard', 'gHangar'].includes(g.id));
  for (const g of w.observers) g.sense = null;
  // 两名守卫站在一起，堆场空地上
  gs[0].route = [[-10, -300]]; gs[0].pos.x = -10; gs[0].pos.z = -300;
  gs[1].route = [[2, -306]]; gs[1].pos.x = 2; gs[1].pos.z = -306; gs[1].coreChecker = false;
  const mid = { x: (gs[0].pos.x + gs[1].pos.x) / 2, z: (gs[0].pos.z + gs[1].pos.z) / 2 };
  place(w.player, mid.x + 10, mid.z + 70, 1.8);
  w.weapons.select(3);
  const aim = aimAt(w, mid.x, 5.5, mid.z);
  step(w, 60, () => ({ aim, fireHeld: true }));
  assert.ok(w.weapons.locks.length >= 2, `locks=${w.weapons.locks.length}`);
  w.step(DT, { ship: emptyCommand(), aim, fireReleased: true });
  assert.ok(w.weapons.needles.length === WEAPONS.swarm.count);
  assert.ok(w.weapons.cd.swarm > 11);
  step(w, 60 * 4, () => ({ aim }));
  assert.ok(gs.every((g) => g.down), gs.map((g) => g.hp).join(','));
});

test('重力锤 flips a car, knocks guards and recoils the ship', () => {
  const w = setup(['anchor', 'fog', 'hammer', 'storm']);
  const car = spawnCar(w, 0);
  car.sense = null;
  place(w.player, car.pos.x + 12, car.pos.z, 1.8);
  w.weapons.select(2);
  const aim = aimAt(w, car.pos.x, car.pos.y + 1, car.pos.z);
  const vx0 = w.player.vel.x;
  w.step(DT, { ship: emptyCommand(), aim, firePressed: true });
  assert.ok(car.flip, 'car flipping');
  assert.ok(w.player.vel.x > vx0 + 5, 'recoil pushes the ship away');
  assert.ok(w.timeScale < 1, 'close-range slow motion');
});

test('雷暴阵列 needs the whole team; with them it strikes lightning across the area', () => {
  const w = setup(['anchor', 'fog', 'hammer', 'storm']);
  place(w.player, 0, -150, 1.8);
  w.weapons.select(3);
  const aim = aimAt(w, 0, 5, -260);
  // 队友在起点（太远）
  assert.equal(w.weapons.fire('storm', aim), false);
  for (const m of w.wingmen) place(m.ship, (m.id.length - 6) * 10, -140, 1.8);
  assert.equal(w.weapons.fire('storm', aim), true);
  let strikes = 0;
  for (let i = 0; i < 60 * 9; i++) {
    w.step(DT, { ship: emptyCommand(), aim });
    for (const e of w.drainEvents()) if (e.type === 'lightning') strikes++;
  }
  assert.ok(strikes > 20, `strikes=${strikes}`);
  assert.equal(w.weapons.uses.storm, 1);
});

test('glass panes and containers can be shot through', () => {
  const w = setup(['stasis', 'phantom', 'beam', 'swarm']);
  for (const o of w.observers) o.sense = null;
  const pane = w.combat.destructibles.find((d) => d.kind === 'glass' && d.group === 'lab' && d.nz === 1);
  place(w.player, pane.x, pane.z + 30, 1.8);
  w.weapons.select(2);
  for (let i = 0; i < 40; i++) w.step(DT, { ship: emptyCommand(), aim: aimAt(w, pane.x, pane.y, pane.z), fireHeld: true });
  assert.equal(pane.alive, false, 'pane shattered');
  const cont = w.combat.destructibles.find((d) => d.kind === 'container');
  place(w.player, cont.x, cont.z + 30, 1.8);
  w.player.heat = 0; w.player.weaponLock = 0;
  for (let i = 0; i < 120; i++) { w.player.heat = 0; w.step(DT, { ship: emptyCommand(), aim: aimAt(w, cont.x, cont.y, cont.z), fireHeld: true }); }
  assert.equal(cont.alive, false, 'container destroyed');
  const box = w.terrain.boxes.find((b) => b.id === cont.box);
  assert.equal(box.alive, false, 'its collision/occlusion box is gone');
});

test('combat waves: swarm → armored cars → helicopter, and the heli has three phases', () => {
  const w = setup(['stasis', 'phantom', 'beam', 'swarm']);
  place(w.player, -45, 728, 1.8);
  w.raiseAlarm(w.guards[0], 'sight');
  const waves = [];
  for (let i = 0; i < 60 * 110; i++) {
    w.step(DT, { ship: emptyCommand() });
    place(w.player, -45, 728, 1.8);
    w.player.hull = 100;
    for (const e of w.drainEvents()) if (e.type === 'wave') waves.push(e.wave);
  }
  assert.deepEqual(waves.filter((x) => x !== 'heliInbound'), ['swarm', 'cars', 'heli']);
  const h = w.heli;
  h.hp = h.maxHp * 0.5; w.step(DT, { ship: emptyCommand() });
  assert.equal(h.phase, 2);
  h.hp = h.maxHp * 0.2; w.step(DT, { ship: emptyCommand() });
  assert.equal(h.phase, 3);
});
