// EnemyAI：铁砧联合体的守卫、岗楼与探照灯、监控摄像头、巡逻无人机「蜂鸟」、周界雷达、电磁监测站、
// 卫星通信终端、城市路人；警报后逐波出动的无人机群、装甲巡逻车和武装直升机。
import { DETECT, MAP, WEAPONS } from './config.js';
import { clamp, wrapAngle, smoothstep, mulberry32, rand } from './noise.js';
import {
  GUARDS, TOWER_GUARDS, SEARCH_TOWERS, CAMERAS, EM_STATIONS, DRONE_ROUTES, DRONE_PAD, COMM_TOWER, TERMINAL,
  CITY, LAMP_POSTS, GATES, inCompound, PERIMETER_ROAD, MOTORPOOL_EXIT, developedMask,
} from './level.js';
import {
  makeObserver, senseTargets, updateAwareness, updateEvidence, noticeTraces, stimulate, setAware, updateRadar, updateEM,
} from './detection.js';

const rnd = () => rand();

export function walkHeight(w, x, z) {
  const h = w.terrain.height(x, z);
  if (developedMask(x, z) > 0.5) return Math.max(h, MAP.plateauH - 0.02);
  return Math.max(h, -0.2);
}

function yawTo(dx, dz) { return Math.atan2(-dx, -dz); }

function turnToward(o, target, rate, dt) {
  const d = wrapAngle(target - o.yaw);
  const s = rate * dt;
  o.yaw = wrapAngle(o.yaw + clamp(d, -s, s));
  return Math.abs(d) < 0.05;
}

export function createEnemies(w) {
  w.observers = [];
  w.guards = [];
  w.towers = [];
  w.cameras = [];
  w.drones = [];
  w.emStations = [];
  w.civilians = [];
  w.cars = [];
  w.swarm = [];
  w.heli = null;

  for (const def of GUARDS) {
    const [x, z] = def.route[0];
    const g = makeObserver({
      id: def.id, name: def.name, kind: 'guard', lang: def.lang, mobile: true, hasRadio: true,
      pos: { x, y: walkHeight(w, x, z), z }, vel: { x: 0, z: 0 }, yaw: def.idleYaw ?? 0, pitch: -0.05,
      route: def.route, routeI: 0, routeDir: 1, pingpong: !!def.pingpong, waits: def.waits || {}, waitT: 0,
      speed: def.speed || 1.4, idleYaw: def.idleYaw, phoneIdle: !!def.phone, coreChecker: !!def.coreChecker,
      sense: { type: 'eye', range: DETECT.eye.range, fov: DETECT.eye.fov, thermal: 'alarm' },
      hp: 100, path: [], fireT: 1 + rnd() * 2, burst: 0, burstT: 0, barkCd: 0, act: 'patrol', walkPhase: rnd() * 10,
      knock: null, idleBarkT: 20 + rnd() * 40,
    });
    w.guards.push(g); w.observers.push(g);
  }
  for (const def of TOWER_GUARDS) {
    const T = SEARCH_TOWERS.find((t) => t.id === def.tower);
    const y = MAP.plateauH + T.h + 0.6;
    const g = makeObserver({
      id: def.id, name: def.name, kind: 'tower', lang: def.lang, mobile: false, hasRadio: true,
      pos: { x: T.x, y, z: T.z }, yaw: T.yaw, pitch: -0.12, baseYaw: T.yaw, tower: T, ownerBox: T.id,
      sense: { type: 'eye', range: 150, fov: 70, thermal: 'alarm' },
      hp: 100, fireT: 2, burst: 0, burstT: 0, barkCd: 0, phase: T.x > 0 ? 1.7 : 0,
      spot: { x: T.x, y: y + 1.4, z: T.z, yaw: T.yaw, pitch: -0.12, cone: DETECT.spotlight.coneDeg, range: DETECT.spotlight.range, owner: T.id, dir: { x: 0, y: 0, z: 1 }, on: true },
    });
    g.eye = { x: T.x, y: y + 1.2, z: T.z };
    w.towers.push(g); w.observers.push(g);
  }
  for (const def of CAMERAS) {
    const y = MAP.plateauH + def.h;
    const c = makeObserver({
      id: def.id, name: def.name, kind: 'camera', mobile: false, pos: { x: def.x, y, z: def.z },
      yaw: def.yaw, baseYaw: def.yaw, sweepAmp: def.sweep, pitch: -0.2, phase: rnd() * 6,
      sense: { type: 'camera', range: DETECT.camera.range, fov: DETECT.camera.fov, gain: 0.9 }, hp: 30,
    });
    c.eye = { x: def.x, y, z: def.z };
    w.cameras.push(c); w.observers.push(c);
  }
  for (const def of EM_STATIONS) {
    const y = walkHeight(w, def.x, def.z);
    const s = makeObserver({ id: def.id, name: def.name, kind: 'em', mobile: false, x: def.x, z: def.z, pos: { x: def.x, y, z: def.z }, sense: { type: 'em' }, hp: 40, signal: 0 });
    s.eye = { x: def.x, y: y + 1, z: def.z };
    w.emStations.push(s); w.observers.push(s);
  }
  {
    const y = MAP.plateauH + COMM_TOWER.h;
    const r = makeObserver({ id: 'radar', name: '周界雷达', kind: 'radar', mobile: false, pos: { x: COMM_TOWER.x, y, z: COMM_TOWER.z }, sense: { type: 'radar' }, angle: 0, contacts: [], offline: 0, hp: 200, powerBoxHp: 50 });
    r.eye = { x: COMM_TOWER.x, y, z: COMM_TOWER.z };
    w.radar = r; w.observers.push(r);
  }
  DRONE_ROUTES.forEach((def, i) => {
    const d = makeObserver({
      id: def.id, name: def.name, kind: 'drone', mobile: true, hasRadio: false,
      pos: { x: DRONE_PAD.x + (i - 1) * 2.2, y: DRONE_PAD.y, z: DRONE_PAD.z }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -0.6,
      route: def.route, routeI: 0, alt: def.alt, state: 'docked', launchAt: null, hp: 30, idx: i,
      sense: { type: 'drone', range: DETECT.drone.range, fov: DETECT.drone.fov, thermal: 'always', gain: 0.95 },
      rotor: 0,
    });
    d.eye = { ...d.pos };
    w.drones.push(d); w.observers.push(d);
  });
  CITY.civilians.forEach((def, i) => {
    const y = walkHeight(w, def.x, def.z);
    const c = makeObserver({
      id: def.id, name: '路人', kind: 'civ', mobile: false, pos: { x: def.x, y, z: def.z }, home: { x: def.x, z: def.z },
      yaw: rnd() * 6.28, pitch: 0.05, sense: { type: 'civ', range: 120, fov: 150, gain: 0.8 }, hp: 1, wander: rnd() * 10, idx: i,
    });
    c.eye = { x: def.x, y: y + 1.6, z: def.z };
    w.civilians.push(c); w.observers.push(c);
  });
  w.terminal = { id: 'terminal', name: '卫星通信终端', x: TERMINAL.x, y: TERMINAL.y, z: TERMINAL.z, alive: true, hp: 60, disabled: 0 };
  w.lamps = LAMP_POSTS.map(([x, z], i) => ({ id: 'lamp' + i, x, z, y: MAP.plateauH + 8, alive: true, disabled: 0, hp: 20 }));
}

// ---------- 通用移动 ----------
function planPath(w, o, tx, tz) {
  const inA = inCompound(o.pos.x, o.pos.z, -1), inB = inCompound(tx, tz, -1);
  if (inA === inB) return [[tx, tz]];
  let best = null, bd = Infinity;
  for (const g of GATES) {
    const a = inA ? g.inner : g.outer, b = inA ? g.outer : g.inner;
    const d = Math.hypot(a[0] - o.pos.x, a[1] - o.pos.z) + Math.hypot(tx - b[0], tz - b[1]);
    if (d < bd) { bd = d; best = [a, b]; }
  }
  return [best[0], best[1], [tx, tz]];
}

function stepWalk(w, o, speed, dt) {
  if (!o.path || o.path.length === 0) return true;
  const [tx, tz] = o.path[0];
  const dx = tx - o.pos.x, dz = tz - o.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.8) { o.path.shift(); return o.path.length === 0; }
  let vx = (dx / d) * speed, vz = (dz / d) * speed;
  // 绕开盒子与树
  for (const b of w.terrain.boxes) {
    if (!b.alive || !b.solid || b.owner === 'city') continue;
    if (b.maxY < o.pos.y + 0.3 || b.minY > o.pos.y + 1.8) continue;
    const cx = clamp(o.pos.x, b.minX, b.maxX), cz = clamp(o.pos.z, b.minZ, b.maxZ);
    const ex = o.pos.x - cx, ez = o.pos.z - cz;
    const ed = Math.hypot(ex, ez);
    if (ed < 2.2 && ed > 1e-3) {
      const push = (2.2 - ed) / 2.2;
      vx += (ex / ed) * speed * push * 1.6; vz += (ez / ed) * speed * push * 1.6;
      // 沿墙滑行：加一点切向
      vx += (-ez / ed) * speed * push * 0.8; vz += (ex / ed) * speed * push * 0.8;
    }
  }
  w.terrain.forTreesNear(o.pos.x, o.pos.z, 3, (t) => {
    const ex = o.pos.x - t.x, ez = o.pos.z - t.z;
    const ed = Math.hypot(ex, ez);
    const R = t.rb + 0.6;
    if (ed < R + 1 && ed > 1e-3) {
      const push = (R + 1 - ed) / (R + 1);
      vx += (ex / ed) * speed * push * 1.5 + (-ez / ed) * speed * push; vz += (ez / ed) * speed * push * 1.5 + (ex / ed) * speed * push;
    }
    return false;
  });
  const vl = Math.hypot(vx, vz);
  if (vl > speed) { vx = (vx / vl) * speed; vz = (vz / vl) * speed; }
  o.pos.x += vx * dt; o.pos.z += vz * dt;
  o.vel.x = vx; o.vel.z = vz;
  o.pos.y = walkHeight(w, o.pos.x, o.pos.z);
  o.moveYaw = yawTo(vx, vz);
  o.walkPhase += dt * speed * 2.2;
  return false;
}

function clampInvestigate(w, x, z) {
  // 守卫不会深入雨林超过林缘 35 m，也不下河
  if (z > MAP.forestEdgeZ + 35) z = MAP.forestEdgeZ + 35;
  if (Math.abs(x) > 600) x = Math.sign(x) * 600;
  return [x, z];
}

// ---------- 守卫 ----------
function updateGuard(w, g, dt) {
  if (g.down) { if (g.knock) applyKnock(w, g, dt); return; }
  if (g.knock) { applyKnock(w, g, dt); return; }
  if (g.stunned > 0) {
    g.stunned -= dt;
    if (g.stunned <= 0) wakeFromStasis(w, g);
    return;
  }
  if (g.phoneDisabled > 0) g.phoneDisabled -= dt;
  if (g.barkCd > 0) g.barkCd -= dt;
  senseTargets(w, g, dt);
  g.traceT = (g.traceT || 0) - dt;
  if (g.traceT <= 0) { g.traceT = 0.25; noticeTraces(w, g); }
  updateAwareness(w, g, dt);
  updateEvidence(w, g, dt);

  const camp = w.camp.state;
  if (camp === 'alarm') return guardCombat(w, g, dt);
  const fast = camp === 'cooldown' ? 1.4 : 1;
  g.phoneOut = (g.aware === 'suspicious' || g.aware === 'search') && !(g.phoneDisabled > 0) && w.time - (g.awareT || 0) > 1.2;
  switch (g.aware) {
    case 'quiet': {
      if (g.act !== 'patrol') { g.act = 'patrol'; g.path = []; }
      patrol(w, g, dt, g.speed * fast);
      g.idleBarkT -= dt;
      if (g.idleBarkT <= 0) {
        g.idleBarkT = 35 + rnd() * 50;
        if (Math.hypot(g.pos.x - w.player.pos.x, g.pos.z - w.player.pos.z) < 70) w.bark(g, 'idle');
      }
      break;
    }
    case 'suspicious': {
      g.act = 'look';
      if (g.lastKnown) turnToward(g, yawTo(g.lastKnown.x - g.pos.x, g.lastKnown.z - g.pos.z), 2.2, dt);
      break;
    }
    case 'search': {
      if (g.act !== 'search' || g.newLead) {
        g.act = 'search'; g.newLead = false; g.arrived = false;
        const lk = g.lastKnown || g.pos;
        const [tx, tz] = clampInvestigate(w, lk.x, lk.z);
        g.path = planPath(w, g, tx, tz);
      }
      if (!g.arrived) {
        if (stepWalk(w, g, 2.8 * fast, dt)) g.arrived = true;
        if (g.moveYaw !== undefined) turnToward(g, g.moveYaw, 4, dt);
        g.searchT = DETECT.searchTime;
      } else {
        g.searchT -= dt;
        g.yaw = wrapAngle(g.yaw + Math.sin(w.time * 0.9 + g.walkPhase) * 1.2 * dt);
      }
      break;
    }
  }
  updateEye(g);
}

function updateEye(g) {
  g.eye.x = g.pos.x; g.eye.y = g.pos.y + 1.65; g.eye.z = g.pos.z;
}

function patrol(w, g, dt, speed) {
  if (g.route.length === 1) {
    const [x, z] = g.route[0];
    if (Math.hypot(x - g.pos.x, z - g.pos.z) > 1) {
      if (!g.path.length) g.path = planPath(w, g, x, z);
      stepWalk(w, g, speed, dt);
      if (g.moveYaw !== undefined) turnToward(g, g.moveYaw, 3, dt);
    } else {
      const base = g.idleYaw ?? 0;
      turnToward(g, base + Math.sin(w.time * 0.15 + g.walkPhase) * 0.9, 0.6, dt);
      g.phoneOut = false;
    }
    updateEye(g);
    return;
  }
  if (g.waitT > 0) { g.waitT -= dt; updateEye(g); return; }
  if (!g.path.length) {
    const [x, z] = g.route[g.routeI];
    g.path = planPath(w, g, x, z);
  }
  if (stepWalk(w, g, speed, dt)) {
    const wait = g.waits[g.routeI];
    if (wait) g.waitT = wait;
    if (g.coreChecker && g.routeI === 2) w.mission.coreCheck(g);
    if (g.pingpong) {
      if (g.routeI + g.routeDir >= g.route.length || g.routeI + g.routeDir < 0) g.routeDir *= -1;
      g.routeI += g.routeDir;
    } else g.routeI = (g.routeI + 1) % g.route.length;
  }
  if (g.moveYaw !== undefined) turnToward(g, g.moveYaw, 3, dt);
  updateEye(g);
}

function guardCombat(w, g, dt) {
  g.act = 'combat';
  g.phoneOut = false;
  const tgt = g.focus ? w.targetById(g.focus) : null;
  if (tgt && g.visNow > 0.1 && !tgt.phantom) {
    turnToward(g, yawTo(tgt.pos.x - g.pos.x, tgt.pos.z - g.pos.z), 5, dt);
    w.combat.enemyFire(g, tgt, dt, { range: 140, damage: 1.0, burst: 5, interval: [1.4, 2.2], spread: 1 });
  } else if (w.camp.lastKnown) {
    const lk = w.camp.lastKnown;
    const d = Math.hypot(lk.x - g.pos.x, lk.z - g.pos.z);
    if (d > 12) {
      if (!g.path.length || g.pathT === undefined || w.time - g.pathT > 3) {
        const [tx, tz] = clampInvestigate(w, lk.x, lk.z);
        g.path = planPath(w, g, tx, tz); g.pathT = w.time;
      }
      stepWalk(w, g, 4.2, dt);
      if (g.moveYaw !== undefined) turnToward(g, g.moveYaw, 5, dt);
    } else {
      g.yaw = wrapAngle(g.yaw + 1.6 * dt);
    }
  }
  updateEye(g);
}

function applyKnock(w, g, dt) {
  const k = g.knock;
  k.t -= dt;
  g.pos.x += k.vx * dt; g.pos.z += k.vz * dt;
  k.vx *= Math.exp(-3 * dt); k.vz *= Math.exp(-3 * dt);
  g.pos.y = walkHeight(w, g.pos.x, g.pos.z) + Math.max(0, k.h * Math.sin(Math.PI * clamp(1 - k.t / k.T, 0, 1)));
  g.tumble = (g.tumble || 0) + dt * 8;
  if (k.t <= 0) { g.knock = null; g.pos.y = walkHeight(w, g.pos.x, g.pos.z); }
  updateEye(g);
}

export function wakeFromStasis(w, o) {
  o.stunned = 0;
  // 醒来后不记得这段时间
  o.sus = 0; o.pending = 0; o.gainRate = 0; o.noticed.clear(); o.memory = [];
  o.phoneOut = false; o.clarity = 0;
  if (w.camp.state !== 'alarm') { o.aware = 'quiet'; o.act = 'patrol'; o.path = []; }
  if (o.kind === 'guard' || o.kind === 'tower') w.bark(o, 'wake', true);
  w.emitEvent({ type: 'wake', id: o.id });
}

// ---------- 岗楼 ----------
function updateTower(w, t, dt) {
  const S = t.spot;
  if (t.down || !t.alive) { S.on = false; return; }
  if (t.stunned > 0) { t.stunned -= dt; if (t.stunned <= 0) wakeFromStasis(w, t); return; }
  S.on = w.power.on && !(t.spotDisabled > 0);
  if (t.spotDisabled > 0) t.spotDisabled -= dt;
  senseTargets(w, t, dt);
  t.traceT = (t.traceT || 0) - dt;
  if (t.traceT <= 0) { t.traceT = 0.3; t.mobile = true; noticeTraces(w, t); t.mobile = false; }
  updateAwareness(w, t, dt);
  let goalYaw, goalPitch;
  if (t.aware === 'quiet') {
    goalYaw = t.baseYaw + Math.sin(w.time * (Math.PI * 2 / 15) + t.phase) * 0.95;
    goalPitch = -Math.atan2(MAP.plateauH + 10 - MAP.plateauH, 75 + Math.sin(w.time * 0.31 + t.phase) * 25);
  } else {
    let lk = t.lastKnown;
    if (w.camp.state === 'alarm' && t.focus && t.visNow > 0.1) { const tg = w.targetById(t.focus); if (tg) lk = tg.pos; }
    if (lk) {
      goalYaw = yawTo(lk.x - S.x, lk.z - S.z);
      goalPitch = Math.atan2((lk.y ?? MAP.plateauH) - S.y, Math.hypot(lk.x - S.x, lk.z - S.z));
    } else { goalYaw = S.yaw; goalPitch = S.pitch; }
  }
  const rate = t.aware === 'quiet' ? 1.2 : 1.6;
  S.yaw = wrapAngle(S.yaw + clamp(wrapAngle(goalYaw - S.yaw), -rate * dt, rate * dt));
  S.pitch += clamp(goalPitch - S.pitch, -rate * dt, rate * dt);
  const cp = Math.cos(S.pitch);
  S.dir = { x: -Math.sin(S.yaw) * cp, y: Math.sin(S.pitch), z: -Math.cos(S.yaw) * cp };
  t.yaw = S.yaw; t.pitch = S.pitch;
  // 黑暗中守卫只看得见光柱里：视野主要靠探照灯
  if (w.camp.state === 'alarm') {
    const tgt = t.focus ? w.targetById(t.focus) : null;
    if (tgt && t.visNow > 0.1 && !tgt.phantom) w.combat.enemyFire(t, tgt, dt, { range: 170, damage: 1.2, burst: 4, interval: [1.6, 2.4], spread: 1.1 });
  }
}

// ---------- 摄像头 ----------
function updateCamera(w, c, dt) {
  if (!c.alive) return;
  if (c.disabled > 0) { c.disabled -= dt; c.gainRate = 0; return; }
  if (c.aware === 'quiet' || !c.lastKnown) {
    c.yaw = c.baseYaw + Math.sin(w.time * (Math.PI * 2 / DETECT.camera.sweepPeriod) + c.phase) * c.sweepAmp;
  } else {
    const lk = c.lastKnown;
    const goal = yawTo(lk.x - c.pos.x, lk.z - c.pos.z);
    const lim = c.sweepAmp + 0.5;
    const rel = clamp(wrapAngle(goal - c.baseYaw), -lim, lim);
    c.yaw = wrapAngle(c.yaw + clamp(wrapAngle(c.baseYaw + rel - c.yaw), -1.2 * dt, 1.2 * dt));
  }
  senseTargets(w, c, dt);
  const prev = c.aware;
  updateAwareness(w, c, dt);
  updateEvidence(w, c, dt);
  if (prev !== 'search' && c.aware === 'search') { w.dispatch(c.lastKnown, 'camera', c); w.enemyRadio('cameraFlag'); }
}

// ---------- 无人机「蜂鸟」 ----------
function updateDrone(w, d, dt) {
  d.rotor += dt * (d.state === 'docked' || d.state === 'down' ? 0 : 60);
  if (d.state === 'down') return;
  if (d.stunned > 0) { d.stunned -= dt; if (d.stunned <= 0) wakeFromStasis(w, d); d.eye = { ...d.pos }; return; }
  if (d.state === 'falling') {
    d.vel.y -= 9.8 * dt;
    d.pos.x += d.vel.x * dt; d.pos.y += d.vel.y * dt; d.pos.z += d.vel.z * dt;
    const g = walkHeight(w, d.pos.x, d.pos.z);
    if (d.pos.y <= g + 0.2) { d.pos.y = g + 0.2; d.state = 'down'; d.alive = false; d.down = true; w.emitEvent({ type: 'droneCrash', x: d.pos.x, y: d.pos.y, z: d.pos.z, id: d.id }); w.combat.onKilled(d, 'crash'); }
    return;
  }
  if (d.anchored > 0) {
    d.anchored -= dt;
    const A = d.anchorAt;
    d.pos.x += (A.x - d.pos.x) * Math.min(1, dt * 3); d.pos.z += (A.z - d.pos.z) * Math.min(1, dt * 3);
    d.pos.y += (walkHeight(w, A.x, A.z) + 0.6 - d.pos.y) * Math.min(1, dt * 3);
    d.eye = { ...d.pos };
    return;
  }
  if (d.state === 'docked') {
    if (w.env.rain < 0.12 && w.camp.state !== 'alarm') {
      if (d.launchAt === null) d.launchAt = w.time + d.idx * 5 + 1;
      if (w.time >= d.launchAt) { d.state = 'launch'; w.emitEvent({ type: 'droneLaunch', id: d.id }); }
    } else if (w.env.rain < 0.12 && w.camp.state === 'alarm') {
      d.state = 'launch';
    }
    d.gainRate = 0;
    return;
  }
  if (d.disabled > 0) { d.disabled -= dt; return; }
  senseTargets(w, d, dt);
  d.traceT = (d.traceT || 0) - dt;
  if (d.traceT <= 0) { d.traceT = 0.3; noticeTraces(w, d); }
  updateAwareness(w, d, dt);
  updateEvidence(w, d, dt);
  let tx, tz, alt = d.alt, speed = 8;
  if (d.state === 'launch') {
    tx = d.pos.x; tz = d.pos.z;
    if (d.pos.y > walkHeight(w, d.pos.x, d.pos.z) + alt - 1) d.state = 'patrol';
  }
  if (d.state !== 'launch') {
    if (w.camp.state === 'alarm') {
      const lk = (d.focus && d.visNow > 0.1 && w.targetById(d.focus)?.pos) || w.camp.lastKnown;
      if (lk) { tx = lk.x + Math.cos(w.time * 0.7 + d.idx) * 25; tz = lk.z + Math.sin(w.time * 0.7 + d.idx) * 25; }
      speed = 15; alt = 12;
    } else if ((d.aware === 'search' || d.aware === 'suspicious') && d.lastKnown) {
      const lk = d.lastKnown;
      tx = lk.x + Math.cos(w.time * 0.5 + d.idx) * 16; tz = lk.z + Math.sin(w.time * 0.5 + d.idx) * 16;
      speed = 12; alt = 11;
      if (Math.hypot(lk.x - d.pos.x, lk.z - d.pos.z) < 25) d.searchT -= dt;
    } else {
      const [rx, rz] = d.route[d.routeI];
      tx = rx; tz = rz;
      if (Math.hypot(rx - d.pos.x, rz - d.pos.z) < 6) d.routeI = (d.routeI + 1) % d.route.length;
    }
  }
  const gy = Math.max(walkHeight(w, d.pos.x, d.pos.z), w.terrain.canopy(d.pos.x, d.pos.z) > 0.3 ? 30 : 0);
  const ty = gy + alt;
  const dx = tx - d.pos.x, dz = tz - d.pos.z;
  const dl = Math.hypot(dx, dz);
  const vx = dl > 1 ? (dx / dl) * speed : 0, vz = dl > 1 ? (dz / dl) * speed : 0;
  d.vel.x += (vx - d.vel.x) * Math.min(1, dt * 1.5);
  d.vel.z += (vz - d.vel.z) * Math.min(1, dt * 1.5);
  d.vel.y = clamp((ty - d.pos.y) * 1.2, -4, d.state === 'launch' ? 3 : 4);
  d.pos.x += d.vel.x * dt; d.pos.y += d.vel.y * dt; d.pos.z += d.vel.z * dt;
  if (Math.hypot(d.vel.x, d.vel.z) > 1) d.yaw = wrapAngle(d.yaw + clamp(wrapAngle(yawTo(d.vel.x, d.vel.z) - d.yaw), -1.5 * dt, 1.5 * dt));
  d.pitch = -0.55;
  d.eye = { x: d.pos.x, y: d.pos.y - 0.2, z: d.pos.z };
}

// ---------- 路人 ----------
function updateCivilian(w, c, dt) {
  if (c.disabled > 0) c.disabled -= dt;
  c.wander += dt;
  if (c.aware === 'quiet') c.yaw = wrapAngle(c.yaw + Math.sin(c.wander * 0.2 + c.idx) * 0.15 * dt);
  senseTargets(w, c, dt);
  // 路人不会拉响营地警报
  c.sus = Math.min(c.sus, 95); c.pending = Math.min(c.pending, 95 - c.sus);
  updateAwareness(w, c, dt);
  if (c.lastKnown && c.aware !== 'quiet') turnToward(c, yawTo(c.lastKnown.x - c.pos.x, c.lastKnown.z - c.pos.z), 2, dt);
  c.phoneOut = c.aware !== 'quiet' && !(c.disabled > 0);
  updateEvidence(w, c, dt);
  c.eye.x = c.pos.x; c.eye.y = c.pos.y + 1.6; c.eye.z = c.pos.z;
}

// ---------- 装甲巡逻车 ----------
export function spawnCar(w, i) {
  const [x, z] = MOTORPOOL_EXIT;
  const car = makeObserver({
    id: 'car' + i, name: i === 0 ? '装甲巡逻车·甲' : '装甲巡逻车·乙', kind: 'car', mobile: false, hasRadio: true,
    pos: { x: x + i * 6, y: MAP.plateauH, z }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -0.05,
    sense: { type: 'eye', range: 170, fov: 150, thermal: 'alarm' }, hp: 650, maxHp: 650,
    road: PERIMETER_ROAD, roadI: i === 0 ? 1 : 5, state: 'drive', speed: 0, turretYaw: 0, flip: null,
    spot: { x, y: MAP.plateauH + 3, z, yaw: 0, pitch: -0.2, cone: 12, range: 120, owner: 'car' + i, dir: { x: 0, y: 0, z: -1 }, on: true },
  });
  car.aware = 'alarm';
  car.eye = { x, y: MAP.plateauH + 2.6, z };
  w.cars.push(car); w.observers.push(car);
  return car;
}

function updateCar(w, c, dt) {
  if (!c.alive) return;
  if (c.flip) {
    const f = c.flip;
    f.t += dt;
    c.pos.x += f.vx * dt; c.pos.z += f.vz * dt; c.pos.y += f.vy * dt; f.vy -= 9.8 * dt;
    f.vx *= Math.exp(-1.2 * dt); f.vz *= Math.exp(-1.2 * dt);
    c.roll = (c.roll || 0) + f.spin * dt;
    const g = walkHeight(w, c.pos.x, c.pos.z);
    if (c.pos.y < g) { c.pos.y = g; f.vy = Math.abs(f.vy) * 0.25; f.spin *= 0.5; }
    if (f.t > 2.2) { c.flip = null; c.state = 'wrecked'; c.roll = Math.PI; c.gainRate = 0; }
    return;
  }
  if (c.state === 'wrecked') return;
  if (c.stunned > 0) { c.stunned -= dt; }
  if (c.disabled > 0) { c.disabled -= dt; c.spot.on = false; c.speed *= Math.exp(-2 * dt); }
  else c.spot.on = true;
  if (c.anchored > 0) { c.anchored -= dt; c.speed = 0; }
  senseTargets(w, c, dt);
  updateAwareness(w, c, dt);
  const tgt = c.focus ? w.targetById(c.focus) : null;
  const engaging = tgt && c.visNow > 0.08 && !tgt.phantom && Math.hypot(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z) < 190;
  if (engaging) {
    const ty = yawTo(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z);
    c.turretYaw = wrapAngle(c.turretYaw + clamp(wrapAngle(ty - c.turretYaw), -2 * dt, 2 * dt));
    if (!(c.disabled > 0)) w.combat.enemyFire(c, tgt, dt, { range: 190, damage: 1.6, burst: 9, interval: [1.8, 2.6], spread: 0.9, rate: 0.08 });
    c.speed += (4 - c.speed) * Math.min(1, dt);
  } else if (!(c.anchored > 0) && !(c.disabled > 0)) {
    c.speed += (13 - c.speed) * Math.min(1, dt * 0.6);
  }
  // 沿道路行驶
  const [rx, rz] = c.road[c.roadI];
  const dx = rx - c.pos.x, dz = rz - c.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 6) c.roadI = (c.roadI + 1) % c.road.length;
  const goal = yawTo(dx, dz);
  c.yaw = wrapAngle(c.yaw + clamp(wrapAngle(goal - c.yaw), -1.1 * dt, 1.1 * dt));
  c.pos.x += -Math.sin(c.yaw) * c.speed * dt; c.pos.z += -Math.cos(c.yaw) * c.speed * dt;
  c.pos.y = walkHeight(w, c.pos.x, c.pos.z);
  c.vel.x = -Math.sin(c.yaw) * c.speed; c.vel.z = -Math.cos(c.yaw) * c.speed;
  if (!engaging) c.turretYaw = wrapAngle(c.turretYaw + clamp(wrapAngle(c.yaw - c.turretYaw), -dt, dt));
  c.eye = { x: c.pos.x, y: c.pos.y + 2.6, z: c.pos.z };
  const S = c.spot;
  S.x = c.pos.x; S.y = c.pos.y + 2.9; S.z = c.pos.z;
  S.yaw = c.turretYaw; S.pitch = -0.12;
  S.dir = { x: -Math.sin(S.yaw) * Math.cos(S.pitch), y: Math.sin(S.pitch), z: -Math.cos(S.yaw) * Math.cos(S.pitch) };
  c.yawEye = c.turretYaw;
  c.yaw2 = c.yaw;
}

// ---------- 武装直升机「红隼」 ----------
export function spawnHeli(w) {
  const h = makeObserver({
    id: 'heli', name: '武装直升机·红隼', kind: 'heli', mobile: false, hasRadio: true,
    pos: { x: 40, y: 60, z: -950 }, vel: { x: 0, y: 0, z: 0 }, yaw: Math.PI, pitch: -0.5,
    sense: { type: 'eye', range: 280, fov: 170, thermal: 'alarm', gain: 1.1 }, hp: 2600, maxHp: 2600,
    phase: 1, orbit: 0, runT: 0, rocketT: 6, dropT: 0, dropped: false, state: 'inbound', bank: 0,
    spot: { x: 0, y: 0, z: 0, yaw: 0, pitch: -0.9, cone: 14, range: 160, owner: 'heli', dir: { x: 0, y: -1, z: 0 }, on: false },
  });
  h.aware = 'alarm';
  h.eye = { ...h.pos };
  w.heli = h; w.observers.push(h);
  return h;
}

function updateHeli(w, h, dt) {
  if (!h.alive) {
    if (h.crash) {
      h.vel.y -= 9.8 * dt; h.pos.x += h.vel.x * dt; h.pos.y += h.vel.y * dt; h.pos.z += h.vel.z * dt;
      h.spinCrash = (h.spinCrash || 0) + dt * 4;
      const g = walkHeight(w, h.pos.x, h.pos.z);
      if (h.pos.y < g + 1) { h.pos.y = g + 1; h.crash = false; w.emitEvent({ type: 'explosion', x: h.pos.x, y: h.pos.y, z: h.pos.z, size: 3 }); w.emitEvent({ type: 'heliDown' }); }
    }
    return;
  }
  if (h.stunned > 0) h.stunned -= dt;
  if (h.anchored > 0) h.anchored -= dt;
  senseTargets(w, h, dt);
  updateAwareness(w, h, dt);
  const frac = h.hp / h.maxHp;
  const newPhase = frac > 0.6 ? 1 : frac > 0.25 ? 2 : 3;
  if (newPhase !== h.phase) { h.phase = newPhase; w.emitEvent({ type: 'heliPhase', phase: newPhase }); }
  const tgt = (h.focus && h.visNow > 0.05 && w.targetById(h.focus)) || null;
  const lk = (tgt && tgt.pos) || w.camp.lastKnown || w.player.pos;
  let tx, ty, tz, speed;
  if (h.state === 'inbound') {
    tx = lk.x; tz = lk.z; ty = 55; speed = 40;
    if (Math.hypot(lk.x - h.pos.x, lk.z - h.pos.z) < 160) h.state = 'fight';
  } else if (h.phase === 1) {
    h.orbit += dt * 0.28;
    tx = lk.x + Math.cos(h.orbit) * 85; tz = lk.z + Math.sin(h.orbit) * 85; ty = 38; speed = 26;
  } else if (h.phase === 2) {
    h.orbit += dt * 0.16;
    tx = lk.x + Math.cos(h.orbit) * 120; tz = lk.z + Math.sin(h.orbit) * 120; ty = 46; speed = 20;
    h.rocketT -= dt;
    if (h.rocketT <= 0 && tgt) { h.rocketT = 8; w.combat.heliRockets(h, tgt); }
    if (!h.dropped) { h.dropped = true; w.combat.spawnSwarm(4, h.pos); w.emitEvent({ type: 'heliDrop' }); }
  } else {
    h.orbit += dt * 0.42;
    tx = lk.x + Math.cos(h.orbit) * 50; tz = lk.z + Math.sin(h.orbit) * 50; ty = 17; speed = 30;
    h.rocketT -= dt;
    if (h.rocketT <= 0 && tgt) { h.rocketT = 6; w.combat.heliRockets(h, tgt); }
  }
  if (h.anchored > 0) { ty = Math.max(10, ty - 20); speed *= 0.4; }
  const gy = Math.max(walkHeight(w, h.pos.x, h.pos.z), w.terrain.canopy(h.pos.x, h.pos.z) > 0.3 ? 30 : 0);
  ty = Math.max(ty, gy + 12);
  const dx = tx - h.pos.x, dz = tz - h.pos.z, dy = ty - h.pos.y;
  const dl = Math.hypot(dx, dz);
  const vx = dl > 1 ? (dx / dl) * Math.min(speed, dl * 0.8) : 0, vz = dl > 1 ? (dz / dl) * Math.min(speed, dl * 0.8) : 0;
  h.vel.x += (vx - h.vel.x) * Math.min(1, dt * 0.9);
  h.vel.z += (vz - h.vel.z) * Math.min(1, dt * 0.9);
  h.vel.y = clamp(dy * 0.8, -6, 6);
  h.pos.x += h.vel.x * dt; h.pos.y += h.vel.y * dt; h.pos.z += h.vel.z * dt;
  const face = tgt ? yawTo(tgt.pos.x - h.pos.x, tgt.pos.z - h.pos.z) : yawTo(h.vel.x, h.vel.z);
  h.yaw = wrapAngle(h.yaw + clamp(wrapAngle(face - h.yaw), -1.2 * dt, 1.2 * dt));
  h.bank = clamp(-wrapAngle(face - h.yaw) * 0.6, -0.5, 0.5);
  h.pitch = -Math.atan2(h.pos.y - (lk.y || 0), Math.max(10, Math.hypot(lk.x - h.pos.x, lk.z - h.pos.z)));
  h.eye = { x: h.pos.x, y: h.pos.y - 1, z: h.pos.z };
  if (tgt && h.state === 'fight' && !(h.stunned > 0)) {
    w.combat.enemyFire(h, tgt, dt, { range: 300, damage: h.phase === 3 ? 2.6 : 2.0, burst: 12, interval: h.phase === 3 ? [1.2, 1.8] : [2.2, 3.2], spread: 1.2, rate: 0.06 });
  }
  const S = h.spot;
  S.on = h.phase === 3 || w.env.light < 0.5;
  S.x = h.pos.x; S.y = h.pos.y - 1.5; S.z = h.pos.z;
  const ax = lk.x - S.x, ay = (lk.y || 0) - S.y, az = lk.z - S.z;
  const al = Math.hypot(ax, ay, az) || 1;
  S.dir = { x: ax / al, y: ay / al, z: az / al };
}

// ---------- 总更新 ----------
export function updateEnemies(w, dt) {
  for (const g of w.guards) updateGuard(w, g, dt);
  for (const t of w.towers) updateTower(w, t, dt);
  for (const c of w.cameras) updateCamera(w, c, dt);
  for (const d of w.drones) updateDrone(w, d, dt);
  for (const s of w.emStations) {
    const prev = s.aware;
    updateEM(w, s, dt);
    if (prev !== 'search' && s.aware === 'search') { w.dispatch(s.lastKnown, 'em', s); w.enemyRadio('emSpike'); }
  }
  {
    const R = w.radar;
    const prev = R.aware;
    updateRadar(w, R, dt);
    if (prev !== 'search' && R.aware === 'search') { w.dispatch(R.lastKnown, 'radar', R); w.enemyRadio('radarContact'); }
  }
  for (const c of w.civilians) updateCivilian(w, c, dt);
  for (const c of w.cars) updateCar(w, c, dt);
  if (w.heli) updateHeli(w, w.heli, dt);
  for (const lp of w.lamps) if (lp.disabled > 0) lp.disabled -= dt;
  if (w.terminal.disabled > 0) w.terminal.disabled -= dt;
}

// 调度：把线索交给最近的守卫
export function dispatchGuard(w, pos, cause, from) {
  if (!pos) return null;
  let best = null, bd = Infinity;
  for (const g of w.guards) {
    if (!g.alive || g.down || g.stunned > 0) continue;
    if (g.aware === 'search') continue;
    const d = Math.hypot(g.pos.x - pos.x, g.pos.z - pos.z);
    if (d < bd) { bd = d; best = g; }
  }
  if (best) {
    best.newLead = true;
    stimulate(w, best, 70, cause === 'radar' ? 'radio' : cause === 'em' ? 'radio' : 'radio', pos, from?.focus);
    best.lastKnown = { x: pos.x, y: pos.y ?? 0, z: pos.z };
    best.dispatchedBy = from?.id;
    if (best.aware !== 'search') setAware(w, best, 'search', 'dispatch');
  }
  // 雨停后的无人机也会去看
  for (const d of w.drones) {
    if (d.state === 'patrol' && d.aware === 'quiet') { d.lastKnown = { ...pos }; stimulate(w, d, 45, 'radio', pos); break; }
  }
  return best;
}

export { yawTo, walkHeight as groundForWalk, WEAPONS, smoothstep };
