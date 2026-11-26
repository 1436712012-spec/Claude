// World：固定 60 Hz 步长的模拟总装。只产出状态与事件，不依赖渲染。
import { SEED, DETECT, CLOCK, WINGMEN, DEFAULT_LOADOUT, SHIP, WEAPONS } from './config.js';
import { clamp, smoothstep, mulberry32, srand } from './noise.js';
import { Terrain } from './terrain.js';
import { START, EXTRACT, inCompound } from './level.js';
import { ShipSim } from './ship.js';
import { TraceSystem } from './traces.js';
import { makeSatellite, updateSatellite, stimulate, setAware, emImpulse, causeLabel } from './detection.js';
import { createEnemies, updateEnemies, dispatchGuard } from './enemies.js';
import { createWingmen, STEALTH_ORDERS, COMBAT_ORDERS_LIST } from './wingmen.js';
import { Combat } from './combat.js';
import { PlayerWeapons } from './weapons.js';
import { Mission, Exposure } from './mission.js';
import { BARKS, COURT, ENEMY_RADIO, PA, WING, makePicker } from './lines.js';

let sharedTerrain = null;
export function getTerrain() {
  if (!sharedTerrain) sharedTerrain = new Terrain(SEED);
  return sharedTerrain;
}

export class World {
  constructor(opts = {}) {
    this.opts = opts;
    srand(opts.seed || 20261126);
    this.time = opts.startTime || 0;
    this.frame = 0;
    this.terrain = opts.terrain || getTerrain();
    // 每局重置可破坏状态
    for (const b of this.terrain.boxes) b.alive = true;
    for (const f of this.terrain.fences) { f.broken = false; f.hp = 90; }
    this.env = { rain: 1, light: 1, flash: 0, wind: { x: 0.25, z: 0.55 } };
    this.events = [];
    this.camp = { state: 'normal', lastSeenT: -99, lastKnown: null, alarmAt: null, cooldownAt: null, seenPlayerT: -99 };
    this.power = { on: true };
    this.rand = mulberry32(opts.seed || 99);
    this.pick = makePicker(opts.seed || 3);
    this.player = new ShipSim(this.terrain, { id: 'player', x: START.x, z: START.z });
    this.viewYaw = START.yaw;
    this.extract = EXTRACT;
    this.trail = [];
    createEnemies(this);
    this.traces = new TraceSystem(this);
    this.satellite = makeSatellite();
    this.mission = new Mission(this);
    this.exposure = new Exposure(this);
    this.combat = new Combat(this);
    this.wingmen = createWingmen(this);
    this.weapons = new PlayerWeapons(this, opts.loadout || DEFAULT_LOADOUT);
    this.selected = 'all';
    this.marks = new Map();
    this.radioQueue = [];
    this.radioNow = null;
    this.radioCd = new Map();
    this.hitstop = 0;
    this.hitstopCd = 0;
    this.timeScale = 1;
    this.slowmoT = 0;
    this.jam = null;
    this.flicker = null;
    this.paT = 50;
    this._targets = null;
    this.debugAll = !!opts.debugAll;
    this.lastSeenBy = new Map();
    this.briefed = false;
  }

  // ---------- 查询 ----------
  allShips() {
    if (!this._ships) this._ships = [this.player, ...this.wingmen.map((m) => m.ship)];
    return this._ships;
  }

  targets() {
    if (this._targets) return this._targets;
    const out = [];
    for (const s of this.allShips()) {
      if (s.destroyed) continue;
      const m = s.isWingman ? this.wingmanById(s.id) : null;
      let camo = s.camoFactor();
      if (m && m.jamming) camo *= 1.25;
      if (m && this.camp.state === 'alarm' && m.id === 'bedrock' && this.exposure.bedrockJammingTerminal()) camo *= 1.3;
      out.push({ id: s.id, isShip: true, ship: s, pos: s.pos, vel: s.vel, speed: s.speed, camo, height: s.hAbove, heat: s.heat });
    }
    for (const ph of this.weapons.phantoms) out.push({ id: ph.id, phantom: true, pos: ph.pos, vel: ph.vel, speed: ph.speed || 20, camo: 1, height: 1.8, heat: 0 });
    this._targets = out;
    return out;
  }

  targetById(id) { return this.targets().find((t) => t.id === id) || null; }
  wingmanById(id) { return this.wingmen.find((m) => m.id === id) || null; }

  entityById(id) {
    if (!id) return null;
    return this.observers.find((o) => o.id === id) || this.swarm.find((s) => s.id === id) || null;
  }

  spotlights() {
    const out = [];
    if (this.power.on) for (const t of this.towers) if (t.spot.on && !t.down && !(t.spotDisabled > 0)) out.push(t.spot);
    for (const c of this.cars) if (c.spot.on && this.combat.isAlive(c)) out.push(c.spot);
    if (this.heli && this.heli.alive && this.heli.spot.on) out.push(this.heli.spot);
    return out;
  }

  emitEvent(e) { e.t = this.time; this.events.push(e); }

  drainEvents() { const e = this.events; this.events = []; return e; }

  // ---------- 主步进 ----------
  step(dt, input = {}) {
    if (this.mission.over) { this._radio(dt); return; }
    this.time += dt;
    this.frame++;
    this._targets = null;
    this._env(dt);
    if (input.viewYaw !== undefined) this.viewYaw = input.viewYaw;
    if (!this.briefed && this.time > 1.2) {
      this.briefed = true;
      this.courtSay('briefing');
      this.radioSay('echo', '回声，就位。');
      this.radioSay('glimmer', '微光就位！默认跟着你的航迹走。');
      this.radioSay('bedrock', '磐石到位。');
    }
    // 玩家
    const P = this.player;
    P.step(dt, input.ship || {});
    this._shipEvents(P);
    this._recordTrail();
    // 僚机
    for (const m of this.wingmen) { m.update(dt); this._shipEvents(m.ship); }
    this._targets = null;
    // 武器
    this.weapons.update(dt, input);
    this._targets = null;
    // 痕迹、敌人、卫星
    this.traces.update(dt);
    updateEnemies(this, dt);
    updateSatellite(this, this.satellite, dt);
    this._campState(dt);
    this.combat.update(dt);
    this.exposure.update(dt);
    this.mission.update(dt);
    this._radio(dt);
    this._pa(dt);
    for (const [id, until] of this.marks) if (until < this.time) this.marks.delete(id);
    if (this.hitstopCd > 0) this.hitstopCd -= dt;
  }

  _env(dt) {
    const t = this.time;
    const forced = this.opts.weather;
    this.env.rain = forced?.rain ?? 1 - smoothstep(CLOCK.rainFadeStart, CLOCK.sunset, t);
    this.env.light = forced?.light ?? 1 - smoothstep(CLOCK.dusk, CLOCK.sunset + 20, t);
    this.env.flash = Math.max(0, this.env.flash - dt * 3);
    if (this.env.rain > 0.5 && this.rand() < dt * 0.05) {
      this.env.flash = 1;
      this.emitEvent({ type: 'thunder', dist: 600 + this.rand() * 2000 });
    }
  }

  _recordTrail() {
    const P = this.player;
    this.trail.push({ t: this.time, x: P.pos.x, y: P.pos.y, z: P.pos.z, vx: P.vel.x, vz: P.vel.z, h: P.hAbove, power: P.power, silent: P.silent, boost: P.boosting });
    // 保留 12 秒
    while (this.trail.length > 2 && this.trail[0].t < this.time - 12) this.trail.shift();
  }

  trailAt(t) {
    const T = this.trail;
    if (T.length === 0) return null;
    if (t <= T[0].t) return T[0];
    if (t >= T[T.length - 1].t) return T[T.length - 1];
    let lo = 0, hi = T.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid].t < t) lo = mid; else hi = mid; }
    const a = T[lo], b = T[hi], k = (t - a.t) / (b.t - a.t || 1);
    return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, vx: a.vx + (b.vx - a.vx) * k, vz: a.vz + (b.vz - a.vz) * k, h: a.h, power: a.power, silent: a.silent, boost: a.boost };
  }

  _shipEvents(s) {
    for (const e of s.events) {
      switch (e.type) {
        case 'scrape': {
          const water = this.terrain.isWater(e.x, e.z) && e.kind === 'ground';
          this.traces.add(water ? 'splash' : 'scrape', e.x, e.y, e.z, { source: s.id, range: water ? 35 : undefined, value: water ? 18 : undefined });
          if (s === this.player) {
            this.mission.stats.scrapes++;
            if (e.strength > 2.5 && this.rand() < 0.5) this.wingmen[Math.floor(this.rand() * 3)].say('playerScrape', { cd: 12 });
          }
          break;
        }
        case 'pulse': this.onPulse(s); break;
        case 'surge': this.onSurge(s); break;
        case 'destroyed': if (s === this.player) this.mission.fail('fail'); break;
      }
      this.emitEvent({ ...e, type: 'ship:' + e.type });
    }
    s.events.length = 0;
  }

  // ---------- 营地警戒 ----------
  raiseAlarm(o, cause) {
    const c = this.camp;
    if (c.state === 'alarm') return;
    const prev = c.state;
    c.state = 'alarm';
    c.alarmAt = this.time;
    c.lastSeenT = this.time;
    if (!c.lastKnown) c.lastKnown = o.lastKnown || { ...this.player.pos };
    this.mission.stats.alarm = true;
    if (this.mission.stats.alarmAt === null) this.mission.stats.alarmAt = this.time;
    this.mission.log({ type: 'alarm', id: o.id, name: o.name, kind: o.kind, cause, x: (o.lastKnown || o.pos).x, z: (o.lastKnown || o.pos).z, focus: o.focus });
    this.emitEvent({ type: 'alarm', by: o.id, name: o.name, cause, from: prev });
    if (o.kind === 'guard' || o.kind === 'tower') this.bark(o, 'alarm', true);
    for (const x of this.observers) if (x.alive && !x.down && x.kind !== 'civ') { x.aware = 'alarm'; x.sus = Math.max(x.sus, 100); }
    const m = this.wingmen[Math.floor(this.rand() * 3)];
    m.say('alarm', { force: true });
    // 战斗指令下，原来的潜行指令中断
    for (const w of this.wingmen) if (w.order === 'hold' || w.order === 'follow') w.setOrder('cover', { silent: true });
  }

  _campState(dt) {
    const c = this.camp;
    if (c.state === 'alarm') {
      if (this.time - c.lastSeenT > DETECT.alarmCooldownSight) {
        c.state = 'cooldown';
        c.cooldownAt = this.time;
        this.emitEvent({ type: 'cooldown' });
        this.mission.log({ type: 'cooldown', x: this.player.pos.x, z: this.player.pos.z });
        for (const o of this.observers) {
          if (o.kind === 'civ' || o.kind === 'car' || o.kind === 'heli') continue;
          o.aware = 'quiet'; o.sus = 15; o.pending = 0; o.act = 'patrol'; if (o.path) o.path = [];
        }
        this.radioSay('echo', '他们跟丢了。营地进入冷却，巡逻会变密。');
      }
    }
  }

  logDetection(o, from, to, cause) {
    const lk = o.lastKnown || o.pos;
    const focus = o.focus;
    const ours = focus && (focus === 'player' || WINGMEN.ids.includes(focus) || String(focus).startsWith('phantom'));
    if (to === 'suspicious' && from === 'quiet') this.mission.stats.suspicious++;
    if (to === 'search') {
      this.mission.stats.search++;
      if (this.mission.stats.firstSearch === null) this.mission.stats.firstSearch = this.time;
    }
    if (to === 'quiet' || to === 'alarm') return;
    this.mission.log({ type: 'aware', id: o.id, name: o.name, kind: o.kind, from, to, cause, causeLabel: causeLabel(cause), x: lk.x, z: lk.z, focus, ours });
  }

  logDetectionWing(id, o) {
    this.mission.log({ type: 'wingSpotted', id, by: o.id, name: o.name, cause: o.cause, causeLabel: causeLabel(o.cause), x: this.wingmanById(id).ship.pos.x, z: this.wingmanById(id).ship.pos.z });
  }

  noteSeen(id, o, cause, v) {
    this.lastSeenBy.set(o.id, { id, cause, v, t: this.time });
    if (id === 'player') this.camp.seenPlayerT = this.time;
  }

  addClip(o, subject) { return this.exposure.add(o, subject); }
  dispatch(pos, cause, from) { return dispatchGuard(this, pos, cause, from); }

  loudNoise(x, y, z, amount, cause) {
    const r = amount * 1.6;
    for (const o of this.observers) {
      if (!o.alive || o.down || o.kind === 'radar' || o.kind === 'em' || o.kind === 'camera') continue;
      const d = Math.hypot(o.pos.x - x, o.pos.z - z);
      if (d > r) continue;
      stimulate(this, o, amount * (1 - d / r) * 1.2, cause, { x, y, z });
    }
  }

  // ---------- 场脉冲 / 场涌 / 扫描 / 干扰 ----------
  onPulse(s) {
    const R = SHIP.pulse.radius, D = SHIP.pulse.duration;
    const x = s.pos.x, z = s.pos.z;
    const within = (px, pz) => Math.hypot(px - x, pz - z) <= R;
    this.mission.stats.pulses++;
    let hitTerminal = false, n = 0;
    if (within(this.terminal.x, this.terminal.z)) {
      this.terminal.disabled = D; hitTerminal = true; n++;
      this.emitEvent({ type: 'terminalDisabled' });
    }
    for (const c of this.cameras) if (within(c.pos.x, c.pos.z)) { c.disabled = D; n++; }
    for (const e of this.emStations) if (within(e.x, e.z)) { e.disabled = D; n++; }
    for (const l of this.lamps) if (within(l.x, l.z)) { l.disabled = D; n++; }
    for (const t of this.towers) if (within(t.pos.x, t.pos.z)) { t.spotDisabled = D; n++; }
    if (within(this.radar.pos.x, this.radar.pos.z)) { this.radar.disabled = D; n++; }
    for (const d of this.drones) {
      if (d.state === 'docked' || d.state === 'down' || d.state === 'falling') continue;
      if (Math.hypot(d.pos.x - x, d.pos.z - z) <= R + 10) { d.state = 'falling'; d.vel.y = 0; n++; }
    }
    for (const f of this.swarm) if (f.alive && Math.hypot(f.pos.x - x, f.pos.z - z) <= R + 5) { f.disabled = D; n++; }
    for (const c of this.cars) if (this.combat.isAlive(c) && within(c.pos.x, c.pos.z)) { c.disabled = D; n++; }
    for (const g of this.guards) if (within(g.pos.x, g.pos.z)) { g.phoneDisabled = D; g.phoneOut = false; }
    for (const c of this.civilians) if (within(c.pos.x, c.pos.z)) { c.disabled = D; c.phoneOut = false; for (const clip of this.exposure.pendingCell) if (clip.by === c.id) clip.progress = 0; }
    this.traces.add('pulse', x, s.pos.y, z, { source: s.id });
    this.traces.flushBirds(x, z, s.id, true);
    this.emitEvent({ type: 'pulse', x, y: s.pos.y, z, r: R, devices: n, terminal: hitTerminal, source: s.id });
    this.mission.log({ type: 'pulse', x, z, terminal: hitTerminal });
    // 全营地察觉异常
    if (this.camp.state !== 'alarm') {
      const near = inCompound(x, z, 80) || Math.hypot(x, z + 350) < 400;
      if (near) {
        for (const o of this.observers) {
          if (!o.alive || o.down || o.kind === 'civ') continue;
          stimulate(this, o, o.kind === 'guard' || o.kind === 'tower' ? 40 : 25, 'pulse', { x, y: 5, z });
        }
        this.enemyRadio('pulse', true);
        const sorted = this.guards.filter((g) => g.alive && !g.down).sort((a, b) => Math.hypot(a.pos.x - x, a.pos.z - z) - Math.hypot(b.pos.x - x, b.pos.z - z));
        for (const g of sorted.slice(0, 2)) { g.newLead = true; g.lastKnown = { x, y: 5, z }; stimulate(this, g, 30, 'pulse', { x, y: 5, z }); }
      }
    }
  }

  onSurge(s) {
    emImpulse(this, s.pos.x, s.pos.z, DETECT.em.surge, 'surge', s.id);
    this.traces.add('surge', s.pos.x, s.pos.y, s.pos.z, { source: s.id });
  }

  scanPulse(m) {
    const s = m.ship;
    let n = 0;
    for (const o of this.observers) {
      if (!o.alive || o.down) continue;
      if (Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z) < WINGMEN.scanRadius) { this.marks.set(o.id, this.time + WINGMEN.scanTime); n++; }
    }
    for (const f of this.swarm) if (f.alive) this.marks.set(f.id, this.time + WINGMEN.scanTime);
    emImpulse(this, s.pos.x, s.pos.z, 60, 'scan', m.id, DETECT.em.scanCatch);
    this.emitEvent({ type: 'scan', id: m.id, x: s.pos.x, y: s.pos.y, z: s.pos.z, r: WINGMEN.scanRadius, n });
    this.mission.log({ type: 'scan', id: m.id, x: s.pos.x, z: s.pos.z });
  }

  onJamStart(m) {
    this.jam = m;
    this.emitEvent({ type: 'jamStart', id: m.id });
    if (this.camp.state === 'normal') {
      for (const g of this.guards) if (g.alive && !g.down) stimulate(this, g, 18, 'jam', null);
      this.enemyRadio('jam', true);
    }
  }
  onJamStop() { this.jam = null; this.emitEvent({ type: 'jamStop' }); }

  jamCovers(p) {
    if (!this.jam || !p) return false;
    const m = this.jam;
    if (!m.jamming || m.out || m.ship.destroyed) return false;
    return Math.hypot(m.ship.pos.x - p.x, m.ship.pos.z - p.z) < WINGMEN.jamRadius;
  }

  isBlackbox() {
    const m = this.jam;
    const jamOn = !!(m && m.jamming && !m.out && !m.ship.destroyed && Math.hypot(m.ship.pos.x - 0, m.ship.pos.z + 350) < WINGMEN.jamRadius + 60);
    return jamOn && this.exposure.terminalPermanentlyOffline();
  }

  powerOut() {
    if (!this.power.on) return;
    this.power.on = false;
    this.emitEvent({ type: 'powerOut' });
    this.radioSay('glimmer', '整个研究所断电了！灯、摄像头、终端，全黑了！');
    this.exposure.terminalLost('power');
    this.mission.log({ type: 'powerOut', x: -30, z: -458 });
  }

  satelliteCapture(source, why, x, z) {
    const sat = this.satellite;
    if (sat.captured.has(source)) return;
    sat.captured.add(source);
    const ours = source === 'player' || WINGMEN.ids.includes(source);
    if (!ours) return;
    this.mission.stats.satCaptures.push({ t: this.time, source, why, x, z });
    this.mission.log({ type: 'satellite', source, why, x, z });
    this.emitEvent({ type: 'satCapture', source, why });
    this.courtSay('satCaught');
  }

  findCover(x, z, away) {
    const T = this.terrain;
    let best = { x, z }, bs = -Infinity;
    for (let r = 20; r <= 120; r += 20) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (!T.underCanopy(px, pz) || inCompound(px, pz, 5)) continue;
        let score = -r * 0.5 + T.canopy(px, pz) * 30;
        if (away) score += Math.hypot(px - away.pos.x, pz - away.pos.z) * 0.6;
        if (score > bs) { bs = score; best = { x: px, z: pz }; }
      }
      if (bs > -Infinity && r >= 40) break;
    }
    return best;
  }

  // ---------- 战斗节奏 ----------
  requestHitstop(dmg) {
    if (this.hitstopCd > 0) return;
    this.hitstop = Math.max(this.hitstop, 0.04 + 0.02 * clamp(dmg / 160, 0, 1));
    this.hitstopCd = 0.12;
  }
  slowmo(scale, dur) { this.timeScale = scale; this.slowmoT = dur; this.emitEvent({ type: 'slowmo', scale, dur }); }

  // ---------- 指令 ----------
  selectNext() {
    const order = ['all', 'echo', 'glimmer', 'bedrock'];
    this.selected = order[(order.indexOf(this.selected) + 1) % order.length];
    this.emitEvent({ type: 'select', id: this.selected });
    return this.selected;
  }

  orderSet() { return this.camp.state === 'alarm' ? COMBAT_ORDERS_LIST : STEALTH_ORDERS; }

  command(index, opts = {}) {
    const set = this.orderSet();
    const order = typeof index === 'string' ? index : set[index];
    if (!order) return false;
    const list = this.selected === 'all' ? this.wingmen : [this.wingmanById(this.selected)];
    let ok = false;
    for (const m of list) {
      if (!m) continue;
      if (order === 'jam' && m.id !== 'bedrock') continue;
      const o = { ...opts };
      if (order === 'distract' && this.selected === 'all') {
        // 全队诱敌：只派最近的一架，其余待命
        if (m !== this._nearestTo(list, opts.point)) continue;
      }
      if (order === 'scan' && this.selected === 'all' && m.id !== 'glimmer') continue;
      ok = m.setOrder(order, o) || ok;
    }
    if (ok) this.emitEvent({ type: 'command', order, target: this.selected });
    return ok;
  }

  _nearestTo(list, p) {
    if (!p) return list[0];
    let best = list[0], bd = Infinity;
    for (const m of list) { if (m.out) continue; const d = Math.hypot(m.ship.pos.x - p.x, m.ship.pos.z - p.z); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  markEnemy(id, dur = 30) { this.marks.set(id, this.time + dur); }

  // ---------- 无线电 ----------
  radioSay(speaker, text, opts = {}) {
    if (!text) return;
    const item = { speaker, text, dur: 1.4 + text.length * 0.085, prio: opts.prio || (speaker === 'court' ? 2 : 1), zh: opts.zh };
    if (this.radioQueue.length > 4) this.radioQueue = this.radioQueue.filter((q) => q.prio > 1).slice(-3);
    this.radioQueue.push(item);
  }

  courtSay(key) {
    const arr = COURT[key];
    if (!arr) return;
    const last = this.radioCd.get('court:' + key) || -99;
    if (this.time - last < 20) return;
    this.radioCd.set('court:' + key, this.time);
    this.radioSay('court', this.pick('court' + key, arr), { prio: 2 });
  }

  enemyRadio(key, force = false) {
    const arr = ENEMY_RADIO[key];
    if (!arr) return;
    const last = this.radioCd.get('enemy:' + key) || -99;
    if (!force && this.time - last < 10) return;
    this.radioCd.set('enemy:' + key, this.time);
    const [o, zh] = this.pick('enemy' + key, arr);
    this.radioSay('enemy', o, { zh });
  }

  bark(o, cat, force = false) {
    const set = BARKS[cat];
    if (!set) return;
    const lines = set[o.lang] || set.en;
    if (!lines) return;
    if (!force && o.barkCd > 0) return;
    o.barkCd = 6;
    const d = Math.hypot(o.pos.x - this.player.pos.x, o.pos.z - this.player.pos.z);
    if (!force && d > 110) return;
    const [text, zh] = this.pick(o.id + cat, lines);
    this.emitEvent({ type: 'bark', id: o.id, name: o.name, lang: o.lang, text, zh, x: o.pos.x, y: o.pos.y + 1.7, z: o.pos.z, cat, dist: d });
  }

  _radio(dt) {
    if (this.radioNow) {
      this.radioNow.left -= dt;
      if (this.radioNow.left <= 0) { this.emitEvent({ type: 'radioEnd', speaker: this.radioNow.speaker }); this.radioNow = null; this.radioGap = 0.25; }
      return;
    }
    if (this.radioGap > 0) { this.radioGap -= dt; return; }
    const next = this.radioQueue.shift();
    if (next) {
      this.radioNow = { ...next, left: next.dur };
      this.emitEvent({ type: 'radio', speaker: next.speaker, text: next.text, zh: next.zh, dur: next.dur });
    }
  }

  _pa(dt) {
    this.paT -= dt;
    if (this.paT > 0) return;
    this.paT = 65 + this.rand() * 40;
    if (!this.power.on || this.camp.state === 'alarm') return;
    const d = Math.hypot(this.player.pos.x, this.player.pos.z + 350);
    if (d > 520) return;
    const [text, zh] = this.pick('pa', PA);
    this.emitEvent({ type: 'pa', text, zh, x: 60, y: 14, z: -372 });
  }

  // 调试：快进时间（测试雨停/卫星）
  warp(seconds) { this.time += seconds; }
}

export { WEAPONS, WING };
