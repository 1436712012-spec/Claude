// Combat：可破坏的研究所、伤害与材质反馈、敌方火力与投射物、场共振连击、逐波升级（步兵 → 无人机群 → 装甲车 → 直升机）。
import { COMBAT, MAP } from './config.js';
import { clamp, mulberry32 } from './noise.js';
import { BUILDINGS, CONTAINERS, SEARCH_TOWERS, COMM_TOWER, HANGAR } from './level.js';
import { makeObserver, setAware } from './detection.js';
import { spawnCar, spawnHeli, walkHeight } from './enemies.js';

const rnd = mulberry32(9001);

export class Combat {
  constructor(world) {
    this.w = world;
    this.destructibles = [];
    this.projectiles = [];
    this.resonance = 0;
    this.resonanceT = 0;
    this.kills = 0;
    this.hostileKills = 0;
    this.director = { started: false, t: 0, swarm: false, cars: false, heli: false, noSwarmSaid: false };
    this.buildDestructibles();
    this.storm = null;
    this.blackboxAt = null;
  }

  buildDestructibles() {
    const D = this.destructibles;
    const g = MAP.plateauH;
    // 实验楼玻璃幕墙：南、东、西三面，每块 2.6 × 4.2 m
    const lab = BUILDINGS.find((b) => b.id === 'lab');
    const floors = 3, fh = lab.h / floors;
    const addPane = (x, y, z, nx, nz, w) => D.push({ id: 'pane' + D.length, kind: 'glass', material: 'glass', hp: 14, x, y, z, nx, nz, w, h: fh - 0.25, alive: true, group: 'lab' });
    const ns = Math.floor(lab.w / 2.6);
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < ns; i++) addPane(lab.x - lab.w / 2 + (i + 0.5) * (lab.w / ns), g + f * fh + fh / 2, lab.z + lab.d / 2 + 0.05, 0, 1, lab.w / ns - 0.1);
      const ne = Math.floor(lab.d / 2.6);
      for (let i = 0; i < ne; i++) {
        addPane(lab.x + lab.w / 2 + 0.05, g + f * fh + fh / 2, lab.z - lab.d / 2 + (i + 0.5) * (lab.d / ne), 1, 0, lab.d / ne - 0.1);
        addPane(lab.x - lab.w / 2 - 0.05, g + f * fh + fh / 2, lab.z - lab.d / 2 + (i + 0.5) * (lab.d / ne), -1, 0, lab.d / ne - 0.1);
      }
    }
    // 温室玻璃
    const gh = BUILDINGS.find((b) => b.id === 'greenhouse');
    for (let i = 0; i < 12; i++) {
      D.push({ id: 'gh' + i, kind: 'glass', material: 'glass', hp: 10, x: gh.x - gh.w / 2 + (i + 0.5) * (gh.w / 12), y: g + 3, z: gh.z + gh.d / 2 + 0.05, nx: 0, nz: 1, w: gh.w / 12 - 0.1, h: 5.5, alive: true, group: 'greenhouse' });
      D.push({ id: 'ghn' + i, kind: 'glass', material: 'glass', hp: 10, x: gh.x - gh.w / 2 + (i + 0.5) * (gh.w / 12), y: g + 3, z: gh.z - gh.d / 2 - 0.05, nx: 0, nz: -1, w: gh.w / 12 - 0.1, h: 5.5, alive: true, group: 'greenhouse' });
    }
    // 集装箱
    CONTAINERS.forEach((c, i) => {
      const [cx, cz, rot, stack] = c;
      D.push({ id: 'container' + i, kind: 'container', material: 'metal', hp: 160 * stack, x: cx, y: g + 1.3 * stack, z: cz, rot, stack, alive: true, box: 'container' + i, color: i % 4 });
    });
    // 岗楼
    for (const t of SEARCH_TOWERS) D.push({ id: t.id, kind: 'tower', material: 'metal', hp: 240, x: t.x, y: g + t.h, z: t.z, alive: true, box: t.id + 'Cabin' });
    D.push({ id: 'commTower', kind: 'commTower', material: 'metal', hp: 420, x: COMM_TOWER.x, y: g + 16, z: COMM_TOWER.z, alive: true, box: 'commBase' });
    D.push({ id: 'radarPower', kind: 'powerBox', material: 'metal', hp: 40, x: COMM_TOWER.power.x, y: g + 0.8, z: COMM_TOWER.power.z, alive: true });
    const gen = BUILDINGS.find((b) => b.id === 'generator');
    D.push({ id: 'generator', kind: 'generator', material: 'metal', hp: 300, x: gen.x, y: g + 2.5, z: gen.z, alive: true });
    D.push({ id: 'terminal', kind: 'terminal', material: 'metal', hp: 60, x: this.w.terminal.x, y: this.w.terminal.y, z: this.w.terminal.z, alive: true });
    for (const s of this.w.emStations) D.push({ id: s.id, kind: 'emStation', material: 'metal', hp: 40, x: s.x, y: s.pos.y + 1, z: s.z, alive: true, ref: s });
    for (const c of this.w.cameras) D.push({ id: c.id, kind: 'camera', material: 'metal', hp: 20, x: c.pos.x, y: c.pos.y, z: c.pos.z, alive: true, ref: c });
    for (const l of this.w.lamps) D.push({ id: l.id, kind: 'lamp', material: 'metal', hp: 25, x: l.x, y: l.y, z: l.z, alive: true, ref: l });
    for (const f of this.w.terrain.fences) D.push({ id: f.id, kind: 'fence', material: 'fence', hp: 70, x: (f.ax + f.bx) / 2, y: g + 1.7, z: (f.az + f.bz) / 2, alive: true, ref: f });
    this.byId = new Map(D.map((d) => [d.id, d]));
  }

  // ---------- 查询 ----------
  isAlive(e) {
    if (!e) return false;
    if (e.kind === 'guard' || e.kind === 'tower') return e.alive && !e.down;
    if (e.kind === 'car') return e.alive && e.state !== 'wrecked';
    return e.alive !== false && !e.down;
  }

  hostiles() {
    const w = this.w;
    const out = [];
    for (const g of w.guards) if (this.isAlive(g)) out.push(g);
    for (const t of w.towers) if (this.isAlive(t)) out.push(t);
    for (const d of w.drones) if (d.state !== 'docked' && this.isAlive(d)) out.push(d);
    for (const c of w.cars) if (this.isAlive(c)) out.push(c);
    for (const s of w.swarm) if (s.alive) out.push(s);
    if (w.heli && w.heli.alive) out.push(w.heli);
    return out;
  }

  nearestHostile(p, maxD = 200) {
    let best = null, bd = maxD;
    for (const e of this.hostiles()) {
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // 守军是否被击溃：全部守卫、装甲车、直升机
  garrisonDefeated() {
    const w = this.w;
    if (!this.director.cars || !this.director.heli) return false;
    if (w.guards.some((g) => this.isAlive(g))) return false;
    if (w.towers.some((t) => this.isAlive(t))) return false;
    if (w.cars.some((c) => this.isAlive(c))) return false;
    if (w.heli && w.heli.alive) return false;
    return true;
  }

  garrisonStatus() {
    const w = this.w;
    const alive = (arr) => arr.filter((e) => this.isAlive(e)).length;
    return {
      guards: alive(w.guards) + alive(w.towers), guardsTotal: w.guards.length + w.towers.length,
      cars: alive(w.cars), carsTotal: this.director.cars ? w.cars.length : 2,
      heli: w.heli ? (w.heli.alive ? 1 : 0) : (this.director.heli ? 0 : 1), swarm: w.swarm.filter((s) => s.alive).length,
    };
  }

  // ---------- 伤害 ----------
  mult() { return 1 + COMBAT.resonanceDamage * this.resonance; }
  cdMult() { return 1 - COMBAT.resonanceCooldown * this.resonance; }

  // 对实体或可破坏物造成伤害；hit 为命中点
  damage(e, amount, src = 'player', hit = null, opts = {}) {
    const w = this.w;
    if (!e || amount <= 0) return false;
    const isHostile = ['guard', 'tower', 'drone', 'car', 'heli', 'fpv'].includes(e.kind);
    if (isHostile && !this.isAlive(e)) return false;
    if (!isHostile && e.alive === false) return false;
    const dmg = amount * (src === 'player' ? this.mult() : 1);
    e.hp -= dmg;
    const p = hit || e.pos || { x: e.x, y: e.y, z: e.z };
    const material = e.material || (e.kind === 'guard' || e.kind === 'tower' ? 'flesh' : 'metal');
    w.emitEvent({ type: 'hit', x: p.x, y: p.y, z: p.z, material, kind: e.kind, amount: dmg, src, weapon: opts.weapon });
    if (src === 'player' && !opts.noHitstop) w.requestHitstop(dmg);
    if (isHostile) {
      if (e.kind === 'guard' || e.kind === 'tower') {
        if (e.aware !== 'alarm' && w.camp.state !== 'alarm') { e.sus = 100; e.cause = 'hit'; }
        if (rnd() < 0.3) w.bark(e, 'hit');
      }
      if (e.kind === 'heli' && e.hp <= 0) { this._kill(e, src); return true; }
      if (e.hp <= 0) { this._kill(e, src, opts); return true; }
      return false;
    }
    if (e.hp <= 0) { this._destroy(e, src, opts); return true; }
    return false;
  }

  _kill(e, src, opts = {}) {
    const w = this.w;
    if (e.kind === 'guard' || e.kind === 'tower') {
      e.down = true; e.gainRate = 0; e.phoneOut = false;
      if (!e.knock && opts.knock) e.knock = opts.knock;
      if (e.kind === 'tower') e.spot.on = false;
    } else if (e.kind === 'drone') {
      e.state = 'falling'; e.alive = true; e.vel.y = 2; e.hp = 0; e.down = false;
      w.emitEvent({ type: 'explosion', x: e.pos.x, y: e.pos.y, z: e.pos.z, size: 0.6 });
      return; // 坠地时计击倒
    } else if (e.kind === 'car') {
      e.state = 'wrecked'; e.alive = true; e.gainRate = 0; e.spot.on = false;
      w.emitEvent({ type: 'explosion', x: e.pos.x, y: e.pos.y + 1, z: e.pos.z, size: 2 });
      w.emitEvent({ type: 'carDestroyed', id: e.id });
    } else if (e.kind === 'heli') {
      e.alive = false; e.crash = true; e.gainRate = 0; e.spot.on = false;
      e.vel.x *= 0.5; e.vel.z *= 0.5;
      w.emitEvent({ type: 'explosion', x: e.pos.x, y: e.pos.y, z: e.pos.z, size: 2.5 });
      w.radioSay('glimmer', '直升机下来了！！');
    } else if (e.kind === 'fpv') {
      e.alive = false;
      w.emitEvent({ type: 'explosion', x: e.pos.x, y: e.pos.y, z: e.pos.z, size: 0.5 });
    }
    this.onKilled(e, src);
  }

  onKilled(e, src) {
    const w = this.w;
    this.kills++;
    if (src === 'player' || src === 'storm') {
      this.resonance = Math.min(COMBAT.resonanceMax, this.resonance + 1);
      this.resonanceT = COMBAT.resonanceHold;
      w.emitEvent({ type: 'resonance', level: this.resonance });
    }
    if (typeof src === 'string' && w.wingmanById(src)) {
      const m = w.wingmanById(src);
      m.kills++;
      if (rnd() < 0.7) m.say('kill', { cd: 3 });
    }
    w.emitEvent({ type: 'kill', id: e.id, kind: e.kind, src });
    w.mission.stats.kills++;
  }

  _destroy(d, src, opts = {}) {
    const w = this.w;
    d.alive = false;
    w.emitEvent({ type: 'destroyed', id: d.id, kind: d.kind, x: d.x, y: d.y, z: d.z, material: d.material, nx: d.nx, nz: d.nz, src });
    const loud = { glass: 45, container: 80, fence: 40, tower: 140, commTower: 200, powerBox: 60, generator: 220, terminal: 90, emStation: 40, camera: 25, lamp: 35 }[d.kind] || 50;
    // 声音：附近守卫听见
    w.loudNoise(d.x, d.y, d.z, loud, d.kind === 'glass' ? 'trace:explosion' : 'explosion');
    if (d.box) { const b = w.terrain.boxes.find((x) => x.id === d.box); if (b) b.alive = false; }
    switch (d.kind) {
      case 'tower': {
        const t = w.towers.find((x) => x.tower.id === d.id);
        if (t && this.isAlive(t)) { t.hp = 0; this._kill(t, src); }
        for (const b of w.terrain.boxes) if (b.owner === d.id) b.alive = false;
        break;
      }
      case 'commTower': w.radar.alive = false; w.emitEvent({ type: 'radarDown', permanent: true }); break;
      case 'powerBox': w.radar.offline = 45; w.emitEvent({ type: 'radarDown', permanent: false }); w.radioSay('glimmer', '雷达停了，四十五秒！'); break;
      case 'generator': w.powerOut(); break;
      case 'terminal': w.terminal.alive = false; w.exposure.terminalLost('destroyed'); break;
      case 'emStation': d.ref.alive = false; break;
      case 'camera': d.ref.alive = false; break;
      case 'lamp': d.ref.alive = false; break;
      case 'fence': d.ref.broken = true; break;
    }
    if (src === 'player' && d.kind !== 'glass' && d.kind !== 'fence') {
      this.resonanceT = Math.max(this.resonanceT, 2);
    }
  }

  // ---------- 射线命中（玩家武器用） ----------
  // 返回最近命中：{ t, point, entity|destructible|terrain }
  raycast(o, dir, range, opts = {}) {
    const w = this.w;
    const end = { x: o.x + dir.x * range, y: o.y + dir.y * range, z: o.z + dir.z * range };
    const los = w.terrain.los(o.x, o.y, o.z, end.x, end.y, end.z, { canopy: true });
    let bestT = los.blocked ? los.t * range : range;
    let best = { kind: los.blocked ? 'world' : 'none', by: los.by };
    const test = (cx, cy, cz, r) => {
      const fx = o.x - cx, fy = o.y - cy, fz = o.z - cz;
      const b = fx * dir.x + fy * dir.y + fz * dir.z;
      const c = fx * fx + fy * fy + fz * fz - r * r;
      const disc = b * b - c;
      if (disc < 0) return null;
      const t = -b - Math.sqrt(disc);
      return t > 0 ? t : null;
    };
    const entities = opts.entities || this.targetables();
    for (const e of entities) {
      const r = e.hitR || 1;
      const t = test(e.pos.x, e.pos.y + (e.hitY || 0), e.pos.z, r * (opts.fat || 1));
      if (t !== null && t < bestT) { bestT = t; best = { kind: 'entity', entity: e }; }
    }
    if (!opts.skipDestructibles) {
      for (const d of this.destructibles) {
        if (!d.alive) continue;
        const r = d.kind === 'glass' ? 1.6 : d.kind === 'container' ? 3 : d.kind === 'fence' ? 4.5 : d.kind === 'tower' ? 2.6 : d.kind === 'commTower' ? 3 : d.kind === 'generator' ? 5 : d.kind === 'lamp' ? 0.8 : 1.2;
        const t = test(d.x, d.y, d.z, r);
        if (t !== null && t < bestT + (d.kind === 'glass' ? 0.5 : 0)) { bestT = t; best = { kind: 'destructible', d }; }
      }
    }
    best.t = bestT;
    best.point = { x: o.x + dir.x * bestT, y: o.y + dir.y * bestT, z: o.z + dir.z * bestT };
    return best;
  }

  targetables() {
    const w = this.w;
    const list = [];
    for (const g of w.guards) if (this.isAlive(g)) { g.hitR = 0.9; g.hitY = 1; list.push(g); }
    for (const t of w.towers) if (this.isAlive(t)) { t.hitR = 1; t.hitY = 0.5; list.push(t); }
    for (const d of w.drones) if (d.state !== 'docked' && this.isAlive(d) && d.state !== 'falling') { d.hitR = 1.1; d.hitY = 0; list.push(d); }
    for (const c of w.cars) if (this.isAlive(c)) { c.hitR = 2.8; c.hitY = 1.1; list.push(c); }
    for (const s of w.swarm) if (s.alive) { s.hitR = 0.9; s.hitY = 0; list.push(s); }
    if (w.heli && w.heli.alive) { w.heli.hitR = 5; w.heli.hitY = 0; list.push(w.heli); }
    for (const c of w.civilians) { c.hitR = 0.6; c.hitY = 1; }
    return list;
  }

  // ---------- 敌方火力 ----------
  enemyFire(o, tgt, dt, cfg) {
    const w = this.w;
    if (o.stunned > 0 || o.disabled > 0) return;
    o.fireT = (o.fireT ?? 1) - dt;
    if (o.burst > 0) {
      o.burstT -= dt;
      if (o.burstT <= 0) {
        o.burst--;
        o.burstT = cfg.rate || 0.11;
        this._shot(o, tgt, cfg);
      }
      return;
    }
    if (o.fireT <= 0) {
      const d = Math.hypot(tgt.pos.x - o.pos.x, tgt.pos.z - o.pos.z);
      if (d > cfg.range) { o.fireT = 0.5; return; }
      o.burst = cfg.burst;
      o.burstT = 0;
      o.fireT = cfg.interval[0] + rnd() * (cfg.interval[1] - cfg.interval[0]);
    }
  }

  _shot(o, tgt, cfg) {
    const w = this.w;
    const from = { x: o.eye.x, y: o.eye.y - 0.2, z: o.eye.z };
    const d = Math.hypot(tgt.pos.x - from.x, tgt.pos.y - from.y, tgt.pos.z - from.z);
    const ship = tgt.ship;
    let p = 0.55 * (1 - d / (cfg.range * 1.15)) * (1 - Math.min(0.6, tgt.speed / 75));
    if (ship && ship.hAbove < 1) p *= 0.85;
    p = clamp(p * (cfg.spread ?? 1), 0.04, 0.62);
    const los = w.terrain.los(from.x, from.y, from.z, tgt.pos.x, tgt.pos.y + 0.4, tgt.pos.z);
    const hit = !los.blocked && rnd() < p;
    const miss = 2 + d * 0.04;
    const to = hit ? { x: tgt.pos.x, y: tgt.pos.y + 0.3, z: tgt.pos.z } : { x: tgt.pos.x + (rnd() - 0.5) * miss * 2, y: tgt.pos.y + (rnd() - 0.3) * miss, z: tgt.pos.z + (rnd() - 0.5) * miss * 2 };
    if (los.blocked) { const t = los.t; to.x = from.x + (tgt.pos.x - from.x) * t; to.y = from.y + (tgt.pos.y - from.y) * t; to.z = from.z + (tgt.pos.z - from.z) * t; }
    w.emitEvent({ type: 'tracer', from, to, hit, kind: o.kind, by: o.id });
    if (hit && ship) ship.damage(cfg.damage, o.kind);
  }

  heliRockets(h, tgt) {
    const w = this.w;
    for (let i = 0; i < 6; i++) {
      const ox = (rnd() - 0.5) * 16, oz = (rnd() - 0.5) * 16;
      const aim = { x: tgt.pos.x + tgt.vel.x * 1.2 + ox, y: tgt.pos.y, z: tgt.pos.z + tgt.vel.z * 1.2 + oz };
      const dx = aim.x - h.pos.x, dy = aim.y - h.pos.y, dz = aim.z - h.pos.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = 55;
      this.projectiles.push({ kind: 'rocket', x: h.pos.x, y: h.pos.y - 1, z: h.pos.z, vx: (dx / l) * sp, vy: (dy / l) * sp, vz: (dz / l) * sp, life: 4, delay: i * 0.18, dmg: 11, r: 8, from: 'heli' });
    }
    w.emitEvent({ type: 'rocketSalvo' });
  }

  spawnSwarm(n, from) {
    const w = this.w;
    const base = from || { x: -6, y: 6, z: -408 };
    for (let i = 0; i < n; i++) {
      const s = { id: 'fpv' + (w.swarm.length + 1), kind: 'fpv', name: '穿越机', alive: true, hp: 18, pos: { x: base.x + (rnd() - 0.5) * 6, y: (base.y || 6) + rnd() * 3, z: base.z + (rnd() - 0.5) * 6 }, vel: { x: 0, y: 6, z: 0 }, t: 0, delay: i * 0.4, target: null, disabled: 0, stunned: 0, anchored: 0, aware: 'alarm' };
      w.swarm.push(s);
    }
  }

  wingmanAttack(m, target) {
    const w = this.w, s = m.ship;
    const kind = m.id === 'bedrock' ? 'needles' : 'beam';
    const p = { x: target.pos.x, y: (target.pos.y || 0) + (target.hitY ?? 1), z: target.pos.z };
    m.beam = { kind, to: p, t: 0.45 };
    w.emitEvent({ type: 'wingFire', id: m.id, kind, from: { x: s.pos.x, y: s.pos.y + 0.4, z: s.pos.z }, to: p });
    const dmg = kind === 'needles' ? 70 : 55;
    this.damage(target, dmg, m.id, p, { noHitstop: true, weapon: kind });
  }

  // ---------- 声音与爆炸 ----------
  explode(x, y, z, r, dmg, src) {
    const w = this.w;
    w.emitEvent({ type: 'explosion', x, y, z, size: r / 8 });
    for (const s of w.allShips()) {
      const d = Math.hypot(s.pos.x - x, s.pos.y - y, s.pos.z - z);
      if (d < r) s.damage(dmg * (1 - d / r) + 2, 'explosion');
    }
    if (src === 'player') {
      for (const e of this.targetables()) {
        const d = Math.hypot(e.pos.x - x, e.pos.y - y, e.pos.z - z);
        if (d < r) this.damage(e, dmg * (1 - d / r), src, null, { noHitstop: true });
      }
    }
  }

  // ---------- 每步 ----------
  update(dt) {
    const w = this.w;
    if (this.resonanceT > 0) this.resonanceT -= dt;
    else if (this.resonance > 0) {
      this.resonanceDecay = (this.resonanceDecay || 0) + dt;
      if (this.resonanceDecay > COMBAT.resonanceDecay) { this.resonanceDecay = 0; this.resonance--; w.emitEvent({ type: 'resonance', level: this.resonance }); }
    }
    this._projectiles(dt);
    this._swarm(dt);
    this._director(dt);
    if (this.storm) this._stormStep(dt);
    // 黑箱判定
    const bb = w.isBlackbox();
    if (bb && this.blackboxAt === null) { this.blackboxAt = w.time; w.courtSay('blackbox'); w.emitEvent({ type: 'blackbox' }); }
    if (!bb && this.blackboxAt !== null && !w.exposure.terminalOnline()) { /* 干扰撤掉了 */ this.blackboxAt = null; }
  }

  _projectiles(dt) {
    const w = this.w;
    for (const p of this.projectiles) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind === 'rocket') p.vy -= 2 * dt;
      const g = w.terrain.groundHeight(p.x, p.z);
      let boom = p.y <= g + 0.3 || p.life <= 0;
      if (!boom) for (const s of w.allShips()) if (Math.hypot(s.pos.x - p.x, s.pos.y - p.y, s.pos.z - p.z) < 3.2) boom = true;
      if (boom) { p.dead = true; this.explode(p.x, Math.max(p.y, g), p.z, p.r, p.dmg, p.from); }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  _swarm(dt) {
    const w = this.w;
    for (const s of w.swarm) {
      if (!s.alive) continue;
      if (s.delay > 0) { s.delay -= dt; continue; }
      if (s.disabled > 0 || s.stunned > 0) {
        s.disabled = Math.max(0, s.disabled - dt); s.stunned = Math.max(0, s.stunned - dt);
        if (s.disabled > 0) { s.vel.y -= 9.8 * dt; s.pos.y += s.vel.y * dt; if (s.pos.y < w.terrain.groundHeight(s.pos.x, s.pos.z) + 0.3) { s.hp = 0; this._kill(s, 'crash'); } }
        continue;
      }
      if (s.anchored > 0) { s.anchored -= dt; s.pos.y += (w.terrain.groundHeight(s.pos.x, s.pos.z) + 0.5 - s.pos.y) * Math.min(1, dt * 4); continue; }
      s.t += dt;
      // 追最近的已知飞碟
      let tgt = null, bd = Infinity;
      for (const sh of w.allShips()) {
        if (sh.destroyed) continue;
        const d = Math.hypot(sh.pos.x - s.pos.x, sh.pos.z - s.pos.z);
        if (d < bd) { bd = d; tgt = sh; }
      }
      if (!tgt) continue;
      const lead = Math.min(1, bd / 40);
      const tx = tgt.pos.x + tgt.vel.x * lead, ty = tgt.pos.y + 0.5, tz = tgt.pos.z + tgt.vel.z * lead;
      const dx = tx - s.pos.x, dy = ty - s.pos.y, dz = tz - s.pos.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = s.t < 1 ? 10 : 30;
      s.vel.x += ((dx / l) * sp - s.vel.x) * Math.min(1, dt * 2.2);
      s.vel.y += ((dy / l) * sp - s.vel.y) * Math.min(1, dt * 2.2);
      s.vel.z += ((dz / l) * sp - s.vel.z) * Math.min(1, dt * 2.2);
      s.pos.x += s.vel.x * dt; s.pos.y += s.vel.y * dt; s.pos.z += s.vel.z * dt;
      const ground = w.terrain.groundHeight(s.pos.x, s.pos.z);
      if (s.pos.y < ground + 0.5) s.pos.y = ground + 0.5;
      if (l < 3.5) {
        s.alive = false;
        this.explode(s.pos.x, s.pos.y, s.pos.z, 7, 13, 'fpv');
      }
      // 撞树
      w.terrain.forTreesNear(s.pos.x, s.pos.z, 2, (t) => {
        if (Math.hypot(t.x - s.pos.x, t.z - s.pos.z) < t.r + 0.4 && s.pos.y < t.g + t.h) { s.alive = false; this.explode(s.pos.x, s.pos.y, s.pos.z, 5, 6, 'fpv'); return true; }
        return false;
      });
    }
  }

  // 逐波升级
  _director(dt) {
    const w = this.w, D = this.director;
    if (w.camp.state === 'normal') return;
    if (!D.started) { D.started = true; D.t = 0; }
    D.t += dt;
    if (!D.swarm && D.t > 12) {
      if (w.env.rain < 0.3) {
        D.swarm = true;
        this.spawnSwarm(8, { x: -6, y: 6, z: -408 });
        w.enemyRadio('swarm');
        w.emitEvent({ type: 'wave', wave: 'swarm' });
      } else if (!D.noSwarmSaid) { D.noSwarmSaid = true; w.enemyRadio('noSwarm'); }
    }
    if (!D.cars && D.t > (D.swarm ? 26 : 16)) {
      D.cars = true;
      spawnCar(w, 0); spawnCar(w, 1);
      w.enemyRadio('cars');
      w.emitEvent({ type: 'wave', wave: 'cars' });
    }
    // 雨停后补放无人机群
    if (D.noSwarmSaid && !D.swarm && w.env.rain < 0.3) { D.swarm = true; this.spawnSwarm(8, { x: -6, y: 6, z: -408 }); w.enemyRadio('swarm'); }
    const carsDown = D.cars && w.cars.every((c) => !this.isAlive(c));
    if (!D.heli && D.cars && (carsDown || D.t > 85)) {
      D.heli = true;
      D.heliT = 0;
      w.enemyRadio('heli');
      w.emitEvent({ type: 'wave', wave: 'heliInbound' });
    }
    if (D.heli && !w.heli) {
      D.heliT += dt;
      if (D.heliT > 10) { spawnHeli(w); w.emitEvent({ type: 'wave', wave: 'heli' }); w.radioSay('bedrock', '直升机进场。压轴的来了。'); }
    }
  }

  // ---------- 雷暴阵列 ----------
  startStorm(P) {
    this.storm = { x: P.x, z: P.z, t: 0, strikeT: 0, gathered: false, gatherT: 0, total: 0 };
  }

  _stormStep(dt) {
    const w = this.w, S = this.storm;
    if (!S.gathered) {
      S.gatherT += dt;
      const ready = w.wingmen.every((m) => m.out || m.stormReady);
      if (ready || S.gatherT > 3) {
        S.gathered = true;
        w.emitEvent({ type: 'stormStart', x: S.x, z: S.z });
        w.slowmo(0.35, 0.8);
      }
      return;
    }
    S.t += dt;
    S.strikeT -= dt;
    const R = 46;
    if (S.strikeT <= 0) {
      S.strikeT = 0.09 + rnd() * 0.08;
      // 优先劈向敌人
      const hs = this.targetables().filter((e) => Math.hypot(e.pos.x - S.x, e.pos.z - S.z) < R);
      let x, z, y;
      if (hs.length && rnd() < 0.7) { const e = hs[(rnd() * hs.length) | 0]; x = e.pos.x; z = e.pos.z; y = e.pos.y; }
      else { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R; x = S.x + Math.cos(a) * r; z = S.z + Math.sin(a) * r; y = w.terrain.groundHeight(x, z); }
      w.emitEvent({ type: 'lightning', x, y, z, src: 'storm' });
      for (const e of hs) {
        const d = Math.hypot(e.pos.x - x, e.pos.z - z);
        if (d < 9) this.damage(e, 160 * (1 - d / 12) + 40, 'storm', { x: e.pos.x, y: e.pos.y + 1, z: e.pos.z }, { noHitstop: true });
      }
      for (const d of this.destructibles) {
        if (!d.alive) continue;
        if (Math.hypot(d.x - x, d.z - z) < 8) this.damage(d, 120, 'storm', null, { noHitstop: true });
      }
    }
    if (S.t > 6.5) {
      this.storm = null;
      w.emitEvent({ type: 'stormEnd' });
      for (const m of w.wingmen) if (m.order === 'storm') m.setOrder('cover', { silent: true });
    }
  }
}

export { HANGAR, walkHeight, makeObserver, setAware };
