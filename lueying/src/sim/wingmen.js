// Wingman：回声、微光、磐石。听从队长指令，自己避开视锥，被发现时逃向掩护并呼叫队长。
// 潜行指令：跟随航迹 / 原地待命 / 惊扰诱敌 / 扫描标记；战斗指令：集火 / 包抄 / 掩护 / 归队；磐石专属：干扰场。
import { WINGMEN, SHIP, WEAPONS } from './config.js';
import { ShipSim, emptyCommand } from './ship.js';
import { clamp, wrapAngle } from './noise.js';
import { WING, COMBAT_ORDERS } from './lines.js';
import { WINGMAN_START } from './level.js';
import { visibility, emImpulse } from './detection.js';

export const STEALTH_ORDERS = ['follow', 'hold', 'distract', 'scan'];
export const COMBAT_ORDERS_LIST = ['focus', 'flank', 'cover', 'regroup'];
export const ORDER_LABEL = {
  follow: '跟随航迹', hold: '原地待命', distract: '惊扰诱敌', scan: '扫描标记',
  focus: '集火', flank: '包抄', cover: '掩护', regroup: '归队', jam: '干扰场', storm: '雷暴阵列', evade: '规避', retreat: '撤离战场',
};

export class Wingman {
  constructor(world, id) {
    this.w = world;
    this.id = id;
    this.name = WINGMEN.names[id];
    const s0 = WINGMAN_START[id];
    this.ship = new ShipSim(world.terrain, { id, x: s0.x, z: s0.z, ai: true, seed: id.length });
    this.ship.isWingman = true;
    this.delay = WINGMEN.trailDelay[id];
    this.order = 'follow';
    this.prevOrder = 'follow';
    this.point = null;
    this.targetId = null;
    this.phaseT = 0;
    this.stage = '';
    this.jamming = false;
    this.locked = false; // 已贴上航迹
    this.riskT = 0;
    this.blockedT = 0;
    this.lineCd = new Map();
    this.fireT = 1 + Math.random();
    this.spottedBy = null;
    this.evadeT = 0;
    this.out = false; // 撤离战场
    this.status = '';
    this.kills = 0;
    this.beam = null; // 渲染：当前射击
  }

  say(cat, opts = {}) {
    const lines = WING[this.id][cat];
    if (!lines) return;
    const key = this.id + cat;
    const cd = opts.cd ?? 6;
    const last = this.lineCd.get(cat) || -99;
    if (!opts.force && this.w.time - last < cd) return;
    this.lineCd.set(cat, this.w.time);
    this.w.radioSay(this.id, this.w.pick(key, lines), opts);
  }

  setOrder(order, opts = {}) {
    const w = this.w;
    if (this.out) { this.say('spotted', { force: true }); return false; }
    if (order === 'jam' && this.id !== 'bedrock') return false;
    if (this.jamming && order !== 'jam') this.stopJam();
    this.prevOrder = this.order;
    this.order = order;
    this.point = opts.point || null;
    this.targetId = opts.targetId || null;
    this.phaseT = 0;
    this.stage = 'go';
    this.locked = false;
    this.blockedT = 0;
    if (order === 'jam') {
      if (this.jamming) { this.stopJam(); this.order = 'hold'; return true; }
      this.jamming = true;
      this.say('jamOn', { force: true });
      w.onJamStart(this);
    } else if (COMBAT_ORDERS[order]) {
      const l = COMBAT_ORDERS[order][this.id];
      w.radioSay(this.id, w.pick(this.id + order, l));
    } else if (order === 'storm') {
      // 雷暴阵列：静默响应，由战斗系统播报
    } else if (!opts.silent) {
      this.say(order === 'follow' ? 'follow' : order === 'hold' ? 'hold' : 'confirm', { force: true });
    }
    return true;
  }

  stopJam() {
    if (!this.jamming) return;
    this.jamming = false;
    this.say('jamOff', { force: true });
    this.w.onJamStop(this);
  }

  // ---------- 每步 ----------
  update(dt) {
    const w = this.w, s = this.ship;
    if (s.destroyed) return;
    this.beam = null;
    let cmd = emptyCommand();
    this._checkSpotted(dt);
    if (this.out) cmd = this._retreat(dt);
    else switch (this.order) {
      case 'follow': cmd = this._follow(dt); break;
      case 'hold': cmd = this._hold(dt); break;
      case 'distract': cmd = this._distract(dt); break;
      case 'scan': cmd = this._scan(dt); break;
      case 'jam': cmd = this._jam(dt); break;
      case 'evade': cmd = this._evade(dt); break;
      case 'storm': cmd = this._storm(dt); break;
      case 'focus': case 'flank': case 'cover': case 'regroup': cmd = this._combat(dt); break;
      default: cmd = this._hold(dt);
    }
    if (!this.locked) s.step(dt, cmd);
    if (s.hull < 18 && !this.out) {
      this.out = true;
      this.stopJam();
      w.radioSay(this.id, this.id === 'glimmer' ? '我中弹太多了……先撤了，对不起！' : this.id === 'echo' ? '船体撑不住了，我退出。' : '磐石受损，撤离战场。');
    }
  }

  // 朝目标点飞，带树干避让；返回指令
  _steer(tx, tz, speed, opts = {}) {
    const s = this.ship, T = this.w.terrain;
    let dx = tx - s.pos.x, dz = tz - s.pos.z;
    const d = Math.hypot(dx, dz);
    const cmd = emptyCommand();
    if (d < (opts.arrive ?? 2)) { cmd.mx = 0; cmd.mz = 0; return { cmd, arrived: true, d }; }
    let vx = dx / d, vz = dz / d;
    // 前瞻避障
    const look = 10 + s.speed * 0.4;
    let ax = 0, az = 0;
    T.forTreesNear(s.pos.x + vx * look * 0.5, s.pos.z + vz * look * 0.5, look, (t) => {
      const ex = s.pos.x - t.x, ez = s.pos.z - t.z;
      const ed = Math.hypot(ex, ez);
      const R = SHIP.radius + t.rb + 2.5;
      const ahead = -(ex * vx + ez * vz);
      if (ahead < -2 || ed > R + 6) return false;
      const k = clamp((R + 6 - ed) / (R + 6), 0, 1);
      // 侧向偏离
      const side = ex * -vz + ez * vx >= 0 ? 1 : -1;
      ax += -vz * side * k * 1.4 + (ex / ed) * k * 0.6;
      az += vx * side * k * 1.4 + (ez / ed) * k * 0.6;
      return false;
    });
    for (const b of T.boxes) {
      if (!b.alive || !b.solid || b.owner === 'city' || b.maxY < s.pos.y - 0.4) continue;
      const cx = clamp(s.pos.x, b.minX, b.maxX), cz = clamp(s.pos.z, b.minZ, b.maxZ);
      const ex = s.pos.x - cx, ez = s.pos.z - cz;
      const ed = Math.hypot(ex, ez);
      if (ed < 9 && ed > 1e-3) { const k = (9 - ed) / 9; ax += (ex / ed) * k * 1.5; az += (ez / ed) * k * 1.5; }
    }
    vx += ax; vz += az;
    const vl = Math.hypot(vx, vz) || 1;
    const slow = clamp(d / (opts.slowDist ?? 20), 0.25, 1);
    const want = (speed / SHIP.cruiseSpeed) * slow;
    cmd.mx = (vx / vl) * Math.min(1, want);
    cmd.mz = (vz / vl) * Math.min(1, want);
    cmd.boost = speed > SHIP.cruiseSpeed + 2 && d > 25;
    s.targetPower = clamp(speed / 50 + 0.2, 0.3, 0.95);
    return { cmd, arrived: false, d };
  }

  // 自己避开视锥：评估目标点是否会被看见
  _riskAt(x, y, z) {
    const w = this.w;
    const probe = { id: this.id, pos: { x, y, z }, vel: { x: 0, z: 0 }, speed: 10, camo: this.ship.camoFactor(), height: this.ship.hAbove, heat: this.ship.heat };
    let worst = 0, who = null;
    for (const o of w.observers) {
      if (!o.alive || o.down || o.kind === 'radar' || o.kind === 'em' || o.kind === 'civ') continue;
      if (o.disabled > 0 || o.stunned > 0) continue;
      const dd = Math.hypot(o.pos.x - x, o.pos.z - z);
      if (dd > 200) continue;
      const v = visibility(w, o, probe).v;
      if (v > worst) { worst = v; who = o; }
    }
    return { v: worst, who };
  }

  _follow(dt) {
    const w = this.w, s = this.ship;
    let p = w.trailAt(w.time - this.delay);
    if (!p) return this._hold(dt);
    // 与队长和彼此保持间距：太近就停在航迹更早的位置
    const spacing = { echo: 11, glimmer: 20, bedrock: 29 }[this.id];
    const pl = w.player.pos;
    if (Math.hypot(p.x - pl.x, p.z - pl.z) < spacing) {
      const T = w.trail;
      let found = null;
      for (let i = T.length - 1; i >= 0; i--) {
        if (T[i].t > w.time - this.delay) continue;
        if (Math.hypot(T[i].x - pl.x, T[i].z - pl.z) >= spacing) { found = T[i]; break; }
      }
      if (found) p = found;
      else { this.locked = false; return this._hold(dt); }
    }
    const d = Math.hypot(p.x - s.pos.x, p.z - s.pos.z);
    if (!this.locked && d < 5) this.locked = true;
    if (this.locked) {
      // 精确复刻航迹：你安全走过的路，它也安全
      s.prev.x = s.pos.x; s.prev.y = s.pos.y; s.prev.z = s.pos.z;
      const k = 1 - Math.exp(-14 * dt);
      s.pos.x += (p.x - s.pos.x) * k; s.pos.y += (p.y - s.pos.y) * k; s.pos.z += (p.z - s.pos.z) * k;
      s.vel.x = p.vx; s.vel.z = p.vz; s.vel.y = 0;
      s.speed = Math.hypot(p.vx, p.vz);
      s.hAbove = p.h; s.power = p.power; s.silent = p.silent; s.spoolT = 0; s.heat = Math.max(0, s.heat - dt * 10);
      s.venting = false; s.boosting = p.boost;
      s.time += dt;
      if (d > 30) this.locked = false;
      return emptyCommand();
    }
    return this._steer(p.x, p.z, WINGMEN.dashSpeed, { arrive: 3 }).cmd;
  }

  _hold(dt) {
    const s = this.ship;
    const cmd = emptyCommand();
    cmd.setAlt = 'low';
    s.targetPower = WINGMEN.holdPower;
    // 巡逻靠近时提醒，太近自己挪开
    const w = this.w;
    let near = null, nd = Infinity;
    for (const g of w.guards) {
      if (!g.alive || g.down) continue;
      const d = Math.hypot(g.pos.x - s.pos.x, g.pos.z - s.pos.z);
      if (d < nd) { nd = d; near = g; }
    }
    if (near && nd < 28) this.say('holdBump', { cd: 18 });
    if (near && nd < 13) {
      const dx = s.pos.x - near.pos.x, dz = s.pos.z - near.pos.z, l = Math.hypot(dx, dz) || 1;
      return this._steer(s.pos.x + (dx / l) * 25, s.pos.z + (dz / l) * 25, 14).cmd;
    }
    return cmd;
  }

  _distract(dt) {
    const s = this.ship;
    const P = this.point;
    if (!P) { this.order = 'hold'; return this._hold(dt); }
    this.phaseT += dt;
    if (this.stage === 'go') {
      const r = this._steer(P.x, P.z, WINGMEN.dashSpeed, { arrive: 10, slowDist: 6 });
      if (r.arrived || this.phaseT > 40) { this.stage = 'sweep'; this.phaseT = 0; this.say('inPosition', { force: true }); this.home = this.home || { x: s.pos.x, z: s.pos.z }; }
      return r.cmd;
    }
    if (this.stage === 'sweep') {
      // 高速掠过：贴地绕圈，惊起鸟群和水雾
      const a = this.phaseT * 1.25;
      const tx = P.x + Math.cos(a) * 18, tz = P.z + Math.sin(a) * 18;
      const r = this._steer(tx, tz, 44, { arrive: 0, slowDist: 1 });
      r.cmd.setAlt = 'low';
      r.cmd.boost = true;
      s.targetPower = 0.95;
      this.w.traces.flushBirds(s.pos.x, s.pos.z, this.id);
      if (this.phaseT > WINGMEN.distractTime) {
        this.stage = 'retreat'; this.phaseT = 0;
        const pl = this.w.player.pos;
        const dx = pl.x - P.x, dz = pl.z - P.z, l = Math.hypot(dx, dz) || 1;
        this.retreatTo = this.w.findCover(P.x + (dx / l) * 70, P.z + (dz / l) * 70);
        this.say('done', { force: true });
        this.w.emitEvent({ type: 'distractDone', id: this.id });
      }
      return r.cmd;
    }
    const R = this.retreatTo || P;
    const r = this._steer(R.x, R.z, 36, { arrive: 5 });
    if (r.arrived) { this.order = 'hold'; this.stage = ''; }
    return r.cmd;
  }

  _scan(dt) {
    const s = this.ship, w = this.w;
    this.phaseT += dt;
    if (this.stage === 'go') {
      this.stage = 'charge';
      return emptyCommand();
    }
    if (this.stage === 'charge' && this.phaseT > 0.6) {
      this.stage = 'done';
      w.scanPulse(this);
      this.say('scanHit', { force: true, cd: 0 });
      if (!WING[this.id].scanHit) this.say('done', { force: true });
      this.order = this.prevOrder === 'scan' ? 'hold' : this.prevOrder;
      this.locked = false;
    }
    const c = emptyCommand(); c.setAlt = 'low';
    s.targetPower = 0.5;
    return c;
  }

  _jam(dt) {
    const c = emptyCommand();
    c.setAlt = 'low';
    this.ship.targetPower = 0.9;
    return c;
  }

  _storm(dt) {
    const P = this.point;
    if (!P) return emptyCommand();
    const i = ['echo', 'glimmer', 'bedrock'].indexOf(this.id);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4 + (P.rot || 0);
    const tx = P.x + Math.cos(a) * 34, tz = P.z + Math.sin(a) * 34;
    const r = this._steer(tx, tz, 60, { arrive: 3, slowDist: 10 });
    this.stormReady = r.arrived || r.d < 8;
    if (this.stormReady) { r.cmd.mx = 0; r.cmd.mz = 0; }
    r.cmd.boost = !this.stormReady;
    return r.cmd;
  }

  _evade(dt) {
    const w = this.w;
    this.evadeT += dt;
    if (!this.coverPoint) this.coverPoint = w.findCover(this.ship.pos.x, this.ship.pos.z, this.spottedBy);
    const r = this._steer(this.coverPoint.x, this.coverPoint.z, 48, { arrive: 4 });
    r.cmd.setAlt = 'low';
    const stillSeen = w.observers.some((o) => o.focus === this.id && o.visNow > 0.1 && w.time - o.lastStim < 1);
    if (r.arrived && !stillSeen && this.evadeT > 6) {
      this.order = this.prevOrder === 'evade' ? 'hold' : this.prevOrder;
      if (this.order === 'follow') this.locked = false;
      this.coverPoint = null;
      this.say('inPosition', { cd: 4 });
    }
    return r.cmd;
  }

  _retreat(dt) {
    const E = this.w.extract;
    const r = this._steer(E.x + (this.id.length - 5) * 8, E.z + 10, 40, { arrive: 6 });
    return r.cmd;
  }

  _checkSpotted(dt) {
    const w = this.w;
    if (this.order === 'evade' || this.out || this.order === 'storm') return;
    let worst = null, ws = 0;
    for (const o of w.observers) {
      if (o.focus !== this.id || !o.alive || o.down) continue;
      if (o.sus > ws && w.time - o.lastStim < 1.2) { ws = o.sus; worst = o; }
    }
    const threshold = w.camp.state === 'alarm' ? 999 : 55;
    if (worst && ws > threshold && this.order !== 'jam') {
      this.spottedBy = worst;
      this.prevOrder = this.order === 'follow' ? 'hold' : this.order;
      this.order = 'evade';
      this.evadeT = 0;
      this.coverPoint = null;
      this.locked = false;
      this.say('spotted', { force: true });
      w.emitEvent({ type: 'wingmanSpotted', id: this.id, by: worst.id });
      w.logDetectionWing(this.id, worst);
    }
  }

  // 战斗：集火 / 包抄 / 掩护 / 归队
  _combat(dt) {
    const w = this.w, s = this.ship, pl = w.player;
    let target = this.targetId ? w.entityById(this.targetId) : null;
    if (target && !w.combat.isAlive(target)) target = null;
    if (!target) target = w.combat.nearestHostile(s.pos, 170);
    let tx, tz;
    const i = ['echo', 'glimmer', 'bedrock'].indexOf(this.id);
    if (this.order === 'regroup' || !target) {
      const a = pl.time * 0 + (i - 1) * 0.9 + Math.PI;
      const fy = w.viewYaw;
      tx = pl.pos.x + Math.sin(fy + a) * -14; tz = pl.pos.z + Math.cos(fy + a) * -14;
    } else if (this.order === 'cover') {
      const a = (i / 3) * Math.PI * 2 + w.time * 0.3;
      tx = pl.pos.x + Math.cos(a) * 16; tz = pl.pos.z + Math.sin(a) * 16;
    } else if (this.order === 'flank') {
      const dx = target.pos.x - pl.pos.x, dz = target.pos.z - pl.pos.z, l = Math.hypot(dx, dz) || 1;
      const side = i === 1 ? -1 : 1;
      const off = i === 2 ? 0.5 : 1;
      tx = target.pos.x + (-dz / l) * 55 * side * off - (dx / l) * 10;
      tz = target.pos.z + (dx / l) * 55 * side * off - (dz / l) * 10;
    } else {
      const dx = s.pos.x - target.pos.x, dz = s.pos.z - target.pos.z, l = Math.hypot(dx, dz) || 1;
      tx = target.pos.x + (dx / l) * 50; tz = target.pos.z + (dz / l) * 50;
    }
    const r = this._steer(tx, tz, 42, { arrive: 4, slowDist: 15 });
    // 开火
    this.fireT -= dt;
    if (target && this.fireT <= 0) {
      const d = Math.hypot(target.pos.x - s.pos.x, target.pos.z - s.pos.z);
      if (d < 160) {
        const los = w.terrain.los(s.pos.x, s.pos.y + 0.6, s.pos.z, target.pos.x, (target.pos.y || 0) + 1, target.pos.z);
        if (!los.blocked || los.by === 'canopy') {
          this.fireT = 1.0 + Math.random() * 0.6;
          w.combat.wingmanAttack(this, target);
        } else this.fireT = 0.4;
      }
    }
    return r.cmd;
  }
}

export function createWingmen(w) {
  return WINGMEN.ids.map((id) => new Wingman(w, id));
}

export { ORDER_LABEL as WING_ORDER_LABEL, WEAPONS, wrapAngle, emImpulse };
