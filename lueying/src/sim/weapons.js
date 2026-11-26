// 玩家武器：两件潜行武器 + 两件战斗武器（出发前挂载），场脉冲为标配。
// 潜行：静滞束、幻影投射、重力锚、记忆雾；战斗：湮灭束、蜂群针、重力锤、雷暴阵列。
import { WEAPONS, SHIP, WINGMEN } from './config.js';
import { clamp, mulberry32 } from './noise.js';
import { wakeFromStasis } from './enemies.js';

const rnd = mulberry32(31337);

export class PlayerWeapons {
  constructor(world, loadout) {
    this.w = world;
    this.slots = loadout.slice(0, 4);
    this.sel = 0;
    this.cd = {};
    this.uses = { fog: WEAPONS.fog.uses, storm: WEAPONS.storm.uses };
    this.phantoms = [];
    this.anchors = [];
    this.fogs = [];
    this.needles = [];
    this.locks = [];
    this.lockT = 0;
    this.beam = null; // { from, to, on }
    this.beamHitT = 0;
    this.message = null;
    this.stats = { shots: 0 };
  }

  get current() { return this.slots[this.sel]; }

  select(i) {
    if (i >= 0 && i < this.slots.length && i !== this.sel) {
      this.sel = i; this.locks = []; this.w.emitEvent({ type: 'weaponSelect', id: this.current });
    }
  }
  next(dir = 1) { this.select((this.sel + dir + this.slots.length) % this.slots.length); }

  ready(id) {
    if ((this.cd[id] || 0) > 0) return false;
    if (id in this.uses && this.uses[id] <= 0) return false;
    if (WEAPONS[id].kind === 'combat' && this.w.player.weaponLock > 0) return false;
    return true;
  }

  status(id) {
    const C = WEAPONS[id];
    const cd = this.cd[id] || 0;
    const total = id === 'swarm' ? C.reload : C.cooldown || 0;
    return { id, name: C.name, kind: C.kind, cd, frac: total ? clamp(cd / (total * this.w.combat.cdMult()), 0, 1) : 0, uses: this.uses[id], locked: id === 'beam' ? this.w.player.weaponLock > 0 : false };
  }

  say(text) { this.message = { text, t: this.w.time }; this.w.emitEvent({ type: 'weaponMsg', text }); }

  update(dt, inp) {
    const w = this.w, ship = w.player;
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.beam = null;
    const id = this.current;
    const aim = inp.aim;
    if (!ship.destroyed && aim && !w.mission.over) {
      if (id === 'beam') this._beam(dt, inp, aim);
      else if (id === 'swarm') this._swarmLock(dt, inp, aim);
      else if (inp.firePressed) this.fire(id, aim);
    }
    this._phantoms(dt);
    this._anchors(dt);
    this._fogs(dt);
    this._needles(dt);
  }

  fire(id, aim) {
    const w = this.w;
    if (!this.ready(id)) {
      if (id in this.uses && this.uses[id] <= 0) this.say(`${WEAPONS[id].name}已用尽`);
      return false;
    }
    const cm = w.combat.cdMult();
    switch (id) {
      case 'stasis': {
        const C = WEAPONS.stasis;
        const hit = w.combat.raycast(aim.o, aim.d, C.range, { fat: 1.5, skipDestructibles: true });
        const to = hit.point;
        w.emitEvent({ type: 'fire', weapon: 'stasis', from: aim.o, to });
        w.traces.add('beam', (aim.o.x + to.x) / 2, (aim.o.y + to.y) / 2, (aim.o.z + to.z) / 2, { a: aim.o, b: to, source: 'player' });
        if (hit.kind === 'entity') {
          const e = hit.entity;
          if (e.kind === 'car' || e.kind === 'heli') this.say('静滞束对车辆无效');
          else {
            e.stunned = C.freeze;
            e.gainRate = 0; e.phoneOut = false;
            e.stunPos = { ...e.pos };
            w.emitEvent({ type: 'stasis', id: e.id, x: e.pos.x, y: e.pos.y, z: e.pos.z });
          }
        }
        this.cd.stasis = C.cooldown * cm;
        break;
      }
      case 'phantom': {
        const C = WEAPONS.phantom;
        const hit = w.combat.raycast(aim.o, aim.d, C.range, { skipDestructibles: true, entities: [] });
        const p = hit.point;
        const g = w.terrain.groundHeight(p.x, p.z);
        const dx = p.x - w.player.pos.x, dz = p.z - w.player.pos.z, l = Math.hypot(dx, dz) || 1;
        const ph = { id: 'phantom' + (this.stats.shots++), phantom: true, pos: { x: p.x, y: g + 1.8, z: p.z }, vel: { x: (dx / l) * C.speed, y: 0, z: (dz / l) * C.speed }, life: C.life, heading: Math.atan2(dz, dx), t: 0 };
        this.phantoms.push(ph);
        w.emitEvent({ type: 'fire', weapon: 'phantom', from: aim.o, to: ph.pos });
        this.cd.phantom = C.cooldown * cm;
        break;
      }
      case 'anchor': {
        const C = WEAPONS.anchor;
        const hit = w.combat.raycast(aim.o, aim.d, C.range, { skipDestructibles: true });
        const p = hit.point;
        const g = w.terrain.groundHeight(p.x, p.z);
        const a = { x: p.x, y: g, z: p.z, t: C.hold, r: C.radius };
        this.anchors.push(a);
        w.emitEvent({ type: 'fire', weapon: 'anchor', from: aim.o, to: a });
        w.traces.add('thud', a.x, a.y + 1, a.z, { source: 'player' });
        w.traces.flushBirds(a.x, a.z, 'player', true);
        this.cd.anchor = C.cooldown * cm;
        break;
      }
      case 'fog': {
        const C = WEAPONS.fog;
        const hit = w.combat.raycast(aim.o, aim.d, C.range, { skipDestructibles: true, entities: [] });
        const p = hit.point;
        const f = { x: p.x, y: w.terrain.groundHeight(p.x, p.z), z: p.z, r: C.radius, t: 4 };
        this.fogs.push(f);
        this.uses.fog--;
        w.emitEvent({ type: 'fire', weapon: 'fog', from: aim.o, to: f });
        this._applyFog(f);
        break;
      }
      case 'hammer': return this._hammer(aim);
      case 'storm': return this._storm(aim);
      default: return false;
    }
    w.mission.stats.weaponsUsed.add(id);
    return true;
  }

  _applyFog(f) {
    const w = this.w;
    let n = 0;
    for (const o of w.observers) {
      if (!['guard', 'tower', 'civ'].includes(o.kind) || o.down) continue;
      if (Math.hypot(o.pos.x - f.x, o.pos.z - f.z) > f.r) continue;
      if (o.fogged) continue;
      o.fogged = true;
      o.sus = 0; o.pending = 0; o.memory = []; o.noticed.clear(); o.phoneOut = false; o.clarity = 0;
      if (w.camp.state !== 'alarm') { o.aware = 'quiet'; o.act = 'patrol'; o.path = []; }
      w.emitEvent({ type: 'fogged', id: o.id });
      n++;
    }
    return n;
  }

  _fogs(dt) {
    for (const f of this.fogs) { f.t -= dt; this._applyFog(f); }
    this.fogs = this.fogs.filter((f) => f.t > 0);
    if (this.fogs.length === 0) for (const o of this.w.observers) o.fogged = false;
  }

  _phantoms(dt) {
    const w = this.w;
    for (const ph of this.phantoms) {
      ph.t += dt;
      ph.life -= dt;
      // 之字形逃逸
      ph.heading += Math.sin(ph.t * 1.7) * 0.9 * dt;
      const sp = WEAPONS.phantom.speed;
      ph.vel.x = Math.cos(ph.heading) * sp; ph.vel.z = Math.sin(ph.heading) * sp;
      ph.pos.x += ph.vel.x * dt; ph.pos.z += ph.vel.z * dt;
      ph.pos.y = w.terrain.surfaceHeight(ph.pos.x, ph.pos.z) + 1.8;
      ph.speed = sp;
    }
    const before = this.phantoms.length;
    this.phantoms = this.phantoms.filter((p) => p.life > 0);
    if (this.phantoms.length < before) w.emitEvent({ type: 'phantomEnd' });
  }

  _anchors(dt) {
    const w = this.w;
    for (const a of this.anchors) {
      a.t -= dt;
      const catchE = (e) => {
        if (!e || !e.pos) return;
        if (Math.hypot(e.pos.x - a.x, e.pos.z - a.z) > a.r) return;
        if (e.kind === 'heli' && e.pos.y - a.y > 30) return;
        if ((e.anchored || 0) < 0.2) w.emitEvent({ type: 'anchored', id: e.id });
        e.anchored = Math.max(e.anchored || 0, Math.min(a.t, 0.25));
        e.anchorAt = a;
      };
      for (const c of w.cars) catchE(c);
      for (const d of w.drones) if (d.state !== 'docked' && d.state !== 'down') catchE(d);
      for (const s of w.swarm) if (s.alive) catchE(s);
      if (w.heli && w.heli.alive) catchE(w.heli);
    }
    this.anchors = this.anchors.filter((a) => a.t > 0);
  }

  // 湮灭束：持续光束，穿透玻璃
  _beam(dt, inp, aim) {
    const w = this.w, ship = w.player, C = WEAPONS.beam;
    if (!inp.fireHeld) return;
    if (ship.weaponLock > 0) return;
    ship.weaponHeat += C.heatRate;
    if (ship.heat >= 99.5) {
      ship.weaponLock = C.ventLock;
      w.emitEvent({ type: 'beamOverheat' });
      this.say('湮灭束过热 · 强制散热 3 秒');
      return;
    }
    let o = { ...aim.o };
    let remaining = C.range;
    let hit = null;
    for (let k = 0; k < 6; k++) {
      hit = w.combat.raycast(o, aim.d, remaining);
      if (hit.kind === 'destructible' && hit.d.kind === 'glass') {
        w.combat.damage(hit.d, C.dps * dt * 8, 'player', hit.point, { noHitstop: true, weapon: 'beam' });
        const adv = hit.t + 0.4;
        o = { x: o.x + aim.d.x * adv, y: o.y + aim.d.y * adv, z: o.z + aim.d.z * adv };
        remaining -= adv;
        if (remaining <= 1) break;
        continue;
      }
      break;
    }
    const to = hit.point;
    this.beam = { from: aim.o, to, hit: hit.kind };
    this.beamHitT -= dt;
    if (hit.kind === 'entity') w.combat.damage(hit.entity, C.dps * dt, 'player', to, { noHitstop: this.beamHitT > 0, weapon: 'beam' });
    else if (hit.kind === 'destructible') w.combat.damage(hit.d, C.dps * dt * 1.4, 'player', to, { noHitstop: this.beamHitT > 0, weapon: 'beam' });
    if (this.beamHitT <= 0 && hit.kind !== 'none') { this.beamHitT = 0.14; w.emitEvent({ type: 'beamImpact', x: to.x, y: to.y, z: to.z, kind: hit.kind }); }
    if (w.camp.state !== 'alarm') w.loudNoise(to.x, to.y, to.z, 70, 'explosion');
    w.mission.stats.weaponsUsed.add('beam');
  }

  // 蜂群针：按住锁定，松开齐射
  _swarmLock(dt, inp, aim) {
    const w = this.w, C = WEAPONS.swarm;
    if (!this.ready('swarm')) { this.locks = []; return; }
    if (inp.fireHeld) {
      this.lockT -= dt;
      if (this.lockT <= 0 && this.locks.length < C.maxLocks) {
        this.lockT = C.lockTime;
        const cone = Math.cos((C.lockCone * Math.PI) / 180);
        let best = null, bestDot = cone;
        for (const e of w.combat.targetables()) {
          if (this.locks.includes(e)) continue;
          const dx = e.pos.x - aim.o.x, dy = e.pos.y + (e.hitY || 0) - aim.o.y, dz = e.pos.z - aim.o.z;
          const d = Math.hypot(dx, dy, dz);
          if (d > 240 || d < 3) continue;
          const dot = (dx * aim.d.x + dy * aim.d.y + dz * aim.d.z) / d;
          if (dot > bestDot) { bestDot = dot; best = e; }
        }
        if (best) { this.locks.push(best); w.emitEvent({ type: 'lock', id: best.id }); }
      }
    }
    if (inp.fireReleased) {
      const targets = this.locks.filter((e) => w.combat.isAlive(e));
      for (let i = 0; i < C.count; i++) {
        const t = targets.length ? targets[i % targets.length] : null;
        const a = (i / C.count) * Math.PI * 2;
        const spread = 0.35;
        const up = 0.25 + rnd() * 0.3;
        const dir = { x: aim.d.x + Math.cos(a) * spread * 0.6, y: aim.d.y + up, z: aim.d.z + Math.sin(a) * spread * 0.6 };
        const l = Math.hypot(dir.x, dir.y, dir.z);
        this.needles.push({ x: aim.o.x, y: aim.o.y - 0.3, z: aim.o.z, vx: (dir.x / l) * 30, vy: (dir.y / l) * 30, vz: (dir.z / l) * 30, target: t, life: C.life, delay: i * 0.025, aim: { ...aim.d } });
      }
      w.emitEvent({ type: 'fire', weapon: 'swarm', from: aim.o, count: C.count, locks: targets.length });
      this.cd.swarm = C.reload * w.combat.cdMult();
      this.locks = [];
      if (w.camp.state !== 'alarm') w.loudNoise(aim.o.x, aim.o.y, aim.o.z, 90, 'explosion');
      w.mission.stats.weaponsUsed.add('swarm');
    }
  }

  _needles(dt) {
    const w = this.w, C = WEAPONS.swarm;
    for (const n of this.needles) {
      if (n.delay > 0) { n.delay -= dt; continue; }
      n.life -= dt;
      const sp = C.speed;
      let tx, ty, tz;
      if (n.target && w.combat.isAlive(n.target)) { tx = n.target.pos.x; ty = n.target.pos.y + (n.target.hitY || 0); tz = n.target.pos.z; }
      else { tx = n.x + n.aim.x * 50; ty = n.y + n.aim.y * 50; tz = n.z + n.aim.z * 50; }
      const dx = tx - n.x, dy = ty - n.y, dz = tz - n.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      // 绕开树干
      let ax = 0, az = 0;
      w.terrain.forTreesNear(n.x, n.z, 4, (t) => {
        if (n.y > t.g + t.h) return false;
        const ex = n.x - t.x, ez = n.z - t.z, ed = Math.hypot(ex, ez) || 1;
        if (ed < t.rb + 3) { ax += (ex / ed) * 40; az += (ez / ed) * 40; }
        return false;
      });
      const turn = Math.min(1, dt * (5 + 40 / Math.max(l, 1)));
      n.vx += ((dx / l) * sp + ax - n.vx) * turn;
      n.vy += ((dy / l) * sp - n.vy) * turn;
      n.vz += ((dz / l) * sp + az - n.vz) * turn;
      n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt;
      const l2 = Math.hypot(tx - n.x, ty - n.y, tz - n.z);
      if (n.target && (l < 2.4 || l2 < 2.4)) {
        n.dead = true;
        w.combat.damage(n.target, C.damage, 'player', { x: n.x, y: n.y, z: n.z }, { weapon: 'swarm' });
        w.emitEvent({ type: 'needleHit', x: n.x, y: n.y, z: n.z });
        continue;
      }
      const g = w.terrain.groundHeight(n.x, n.z);
      if (n.y < g || n.life <= 0) {
        n.dead = true;
        w.emitEvent({ type: 'needleHit', x: n.x, y: Math.max(g, n.y), z: n.z });
        for (const d of w.combat.destructibles) if (d.alive && Math.hypot(d.x - n.x, d.y - n.y, d.z - n.z) < 4) w.combat.damage(d, 30, 'player', null, { noHitstop: true });
      }
    }
    this.needles = this.needles.filter((n) => !n.dead);
  }

  // 重力锤：锥形冲击，掀翻车辆、推飞敌人；飞碟自己被反冲推开
  _hammer(aim) {
    const w = this.w, C = WEAPONS.hammer, ship = w.player;
    if (!this.ready('hammer')) return false;
    const cos = Math.cos((C.cone * Math.PI) / 180);
    const o = aim.o;
    let close = false, hits = 0;
    const inCone = (x, y, z, extra = 0) => {
      const dx = x - o.x, dy = (y - o.y) * 0.5, dz = z - o.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > C.range + extra || d < 0.5) return null;
      const dot = (dx * aim.d.x + dz * aim.d.z) / (Math.hypot(dx, dz) * Math.hypot(aim.d.x, aim.d.z) || 1);
      if (dot < cos) return null;
      return { d, nx: dx / (Math.hypot(dx, dz) || 1), nz: dz / (Math.hypot(dx, dz) || 1) };
    };
    for (const e of w.combat.targetables()) {
      const c = inCone(e.pos.x, e.pos.y, e.pos.z, e.kind === 'heli' ? 10 : 0);
      if (!c) continue;
      hits++;
      if (c.d < 15) close = true;
      const f = 1 - c.d / (C.range + 10);
      if (e.kind === 'guard' || e.kind === 'tower') {
        e.knock = { vx: c.nx * 22 * f + 4 * c.nx, vz: c.nz * 22 * f + 4 * c.nz, h: 2.5 * f + 0.5, t: 1.1, T: 1.1 };
      } else if (e.kind === 'car') {
        e.flip = { vx: c.nx * 16 * f, vz: c.nz * 16 * f, vy: 8 * f + 3, spin: (rnd() < 0.5 ? -1 : 1) * (5 + 4 * f), t: 0 };
      } else if (e.vel) {
        e.vel.x += c.nx * 30 * f; e.vel.z += c.nz * 30 * f; e.vel.y = (e.vel.y || 0) + 6;
      }
      w.combat.damage(e, C.damage * (0.5 + 0.5 * f), 'player', { x: e.pos.x, y: e.pos.y + 1, z: e.pos.z }, { noHitstop: true, weapon: 'hammer', knock: e.knock });
    }
    for (const d of w.combat.destructibles) {
      if (!d.alive) continue;
      const c = inCone(d.x, d.y, d.z, 4);
      if (!c) continue;
      hits++;
      w.combat.damage(d, 220 * (1 - c.d / (C.range + 4)) + 30, 'player', null, { noHitstop: true, weapon: 'hammer' });
    }
    // 反冲
    ship.vel.x -= aim.d.x * C.recoil; ship.vel.z -= aim.d.z * C.recoil; ship.vel.y += 2;
    ship.impact = 1;
    w.emitEvent({ type: 'fire', weapon: 'hammer', from: o, dir: aim.d, hits, close });
    w.requestHitstop(200);
    if (close) w.slowmo(0.3, 0.55);
    if (w.camp.state !== 'alarm') w.loudNoise(o.x, o.y, o.z, 110, 'explosion');
    this.cd.hammer = C.cooldown * w.combat.cdMult();
    w.mission.stats.weaponsUsed.add('hammer');
    return true;
  }

  // 雷暴阵列：四机合击
  _storm(aim) {
    const w = this.w, C = WEAPONS.storm;
    if (!this.ready('storm')) return false;
    const avail = w.wingmen.filter((m) => !m.out && !m.ship.destroyed);
    if (avail.length < 3) { this.say('雷暴阵列需要全队就位'); return false; }
    const far = avail.find((m) => Math.hypot(m.ship.pos.x - w.player.pos.x, m.ship.pos.z - w.player.pos.z) > C.gather);
    if (far) { this.say(`${far.name}离你太远，无法组成方阵`); w.radioSay(far.id, '我离得太远了，过不来！'); return false; }
    const hit = w.combat.raycast(aim.o, aim.d, C.range, { skipDestructibles: true, entities: [] });
    const P = { x: hit.point.x, z: hit.point.z, rot: Math.atan2(aim.d.z, aim.d.x) };
    for (const m of avail) { m.stormReady = false; m.setOrder('storm', { point: P }); }
    w.combat.startStorm(P);
    this.uses.storm--;
    w.emitEvent({ type: 'fire', weapon: 'storm', to: P });
    w.radioSay('echo', '方阵！');
    if (w.camp.state !== 'alarm') w.loudNoise(P.x, 5, P.z, 250, 'explosion');
    w.mission.stats.weaponsUsed.add('storm');
    return true;
  }
}

export { SHIP, WINGMEN, wakeFromStasis };
