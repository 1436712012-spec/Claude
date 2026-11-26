// ShipSim：掠影 MK-II 的悬浮、推进、热量、场静默、场脉冲与碰撞。
// 输入是世界坐标下的期望移动方向；视角由上层单独控制（飞碟没有前后之分）。
import { SHIP, MAP } from './config.js';
import { clamp, smoothstep } from './noise.js';

const RIM_N = 6;
const RIM_R = 2.7;

export function emptyCommand() {
  return { mx: 0, mz: 0, boost: false, jump: false, altToggle: false, setAlt: null, powerDelta: 0, silence: false, pulse: false };
}

export class ShipSim {
  constructor(terrain, opts = {}) {
    this.terrain = terrain;
    this.id = opts.id || 'player';
    this.isPlayer = this.id === 'player';
    const g = terrain.groundHeight(opts.x || 0, opts.z || 0);
    this.pos = { x: opts.x || 0, y: g + SHIP.heights.cruise, z: opts.z || 0 };
    this.prev = { ...this.pos };
    this.vel = { x: 0, y: 0, z: 0 };
    this.altMode = 'cruise';
    this.jumpT = 0;
    this.jumpCd = 0;
    this.targetPower = SHIP.powerDefault;
    this.power = SHIP.powerDefault;
    this.silent = false;
    this.silentT = 0;
    this.spoolT = 0;
    this.heat = 0;
    this.overheated = false;
    this.venting = false;
    this.weaponHeat = 0; // 每帧由武器系统写入（/s）
    this.weaponLock = 0; // 湮灭束过热后被迫散热
    this.hull = SHIP.hull;
    this.lastDamage = -99;
    this.destroyed = false;
    this.tilt = { x: 0, z: 0 };
    this.accel = { x: 0, z: 0 };
    this.hAbove = SHIP.heights.cruise;
    this.groundRef = g;
    this.speed = 0;
    this.boosting = false;
    this.airborne = false;
    this.collapsed = false;
    this.pulseCd = 0;
    this.lockMove = false;
    this.lockPower = null;
    this.scrapeT = 0;
    this.landing = 0; // 落地压缩感（相机用）
    this.impact = 0; // 最近一次碰撞强度（相机/HUD）
    this.contact = false;
    this.time = 0;
    this.bobPhase = (opts.seed || 1) * 1.7;
    this.ai = !!opts.ai; // 僚机：软碰撞、不留刮擦痕迹
    this.events = [];
  }

  emit(type, data = {}) {
    this.events.push({ type, ship: this.id, x: this.pos.x, y: this.pos.y, z: this.pos.z, ...data });
  }

  get targetHeight() {
    if (this.jumpT > 0) return SHIP.heights.jump;
    return SHIP.heights[this.altMode];
  }

  // 船体下方某点的参考面：地面 / 水面 / 倒木 / 盒子顶 / 涵洞顶板
  surfaceAt(x, z) {
    const T = this.terrain;
    let s = T.surfaceHeight(x, z);
    const y = this.pos.y;
    const ceil = T.culvertCeiling(x, z);
    if (ceil !== null && y > ceil + 0.2) s = Math.max(s, MAP.plateauH);
    for (const b of T.boxes) {
      if (!b.alive || !b.solid) continue;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (b.maxY <= y - 0.1 && b.maxY > s) s = b.maxY;
    }
    return s;
  }

  sampleGround() {
    const p = this.pos;
    const c = this.surfaceAt(p.x, p.z);
    let rimMax = -Infinity;
    for (let k = 0; k < RIM_N; k++) {
      const a = (k / RIM_N) * Math.PI * 2;
      const s = this.surfaceAt(p.x + Math.cos(a) * RIM_R, p.z + Math.sin(a) * RIM_R);
      if (s > rimMax) rimMax = s;
    }
    return { c, rim: rimMax, ref: Math.max(c, rimMax - 0.15) };
  }

  damage(amount, cause = 'fire') {
    if (this.destroyed || amount <= 0) return;
    this.hull = Math.max(0, this.hull - amount);
    this.lastDamage = this.time;
    this.emit('damage', { amount, cause });
    if (this.hull <= 0) {
      this.destroyed = true;
      this.emit('destroyed', { cause });
    }
  }

  step(dt, cmd) {
    this.time += dt;
    this.prev.x = this.pos.x; this.prev.y = this.pos.y; this.prev.z = this.pos.z;
    const v = this.vel, p = this.pos;
    if (this.destroyed) {
      v.y -= SHIP.gravity * dt;
      v.x *= Math.exp(-1.5 * dt); v.z *= Math.exp(-1.5 * dt);
      p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
      const g = this.terrain.groundHeight(p.x, p.z);
      if (p.y < g + 0.3) { p.y = g + 0.3; v.y = 0; }
      return;
    }

    // ---------- 指令 ----------
    if (cmd.altToggle) this.altMode = this.altMode === 'low' ? 'cruise' : 'low';
    if (cmd.setAlt) this.altMode = cmd.setAlt;
    if (cmd.silence) this.toggleSilence();
    if (cmd.jump && this.jumpCd <= 0 && this.jumpT <= 0 && !this.silent && this.spoolT <= 0 && !this.collapsed) {
      this.jumpT = SHIP.jumpHold;
      this.emit('jump');
    }
    if (this.jumpT > 0) {
      this.jumpT -= dt;
      if (this.jumpT <= 0) { this.jumpT = 0; this.jumpCd = SHIP.jumpCooldown; }
    } else if (this.jumpCd > 0) this.jumpCd = Math.max(0, this.jumpCd - dt);
    if (this.pulseCd > 0) this.pulseCd = Math.max(0, this.pulseCd - dt);
    if (cmd.pulse && this.pulseCd <= 0 && !this.silent && this.spoolT <= 0) {
      this.pulseCd = SHIP.pulse.cooldown;
      this.emit('pulse', { radius: SHIP.pulse.radius });
    }
    this.targetPower = clamp(this.targetPower + (cmd.powerDelta || 0), 0.1, 1);

    // ---------- 场功率 ----------
    let powerGoal = this.targetPower;
    if (this.overheated) powerGoal = Math.min(powerGoal, SHIP.heat.overheatCap);
    if (this.lockPower !== null) powerGoal = this.lockPower;
    if (this.silent) {
      this.silentT += dt;
      this.power = Math.max(0, this.power - dt * (SHIP.powerDefault / SHIP.silence.fadeOut));
    } else if (this.spoolT > 0) {
      this.spoolT -= dt;
      this.power = powerGoal * clamp(1 - this.spoolT / SHIP.silence.spool, 0, 1);
      if (this.spoolT <= 0) {
        this.spoolT = 0;
        this.emit('surge');
      }
    } else {
      const d = powerGoal - this.power;
      const r = SHIP.powerFollow * dt;
      this.power += clamp(d, -r, r);
    }
    const P = this.power;
    const fieldOn = !this.silent && this.spoolT <= 0;

    // ---------- 水平推进 ----------
    let mx = cmd.mx || 0, mz = cmd.mz || 0;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    if (this.lockMove) { mx = 0; mz = 0; }
    const wantBoost = !!cmd.boost && ml > 0.1 && fieldOn && !this.overheated;
    this.boosting = wantBoost;
    const pf = P / SHIP.powerDefault;
    const vCruise = SHIP.cruiseSpeed * clamp(0.3 + 0.7 * pf, 0.25, 1.3);
    const vBoost = SHIP.boostSpeed * clamp(0.55 + 0.45 * pf, 0.5, 1.15);
    const vmax = wantBoost ? vBoost : vCruise;
    let ax = 0, az = 0;
    if (fieldOn) {
      const tvx = mx * vmax, tvz = mz * vmax;
      const dvx = tvx - v.x, dvz = tvz - v.z;
      const dl = Math.hypot(dvx, dvz);
      const acc = (wantBoost ? SHIP.boostAccel : ml > 0.05 ? SHIP.accel : SHIP.brake) * clamp(0.5 + 0.5 * pf, 0.4, 1.2);
      if (dl > 1e-4) {
        const a = Math.min(acc, dl / dt);
        ax = (dvx / dl) * a; az = (dvz / dl) * a;
      }
      v.x += ax * dt; v.z += az * dt;
    } else {
      const k = Math.min(SHIP.silence.dragMax, SHIP.silence.dragBase + SHIP.silence.dragGrowth * this.silentT);
      const f = Math.exp(-k * dt);
      v.x *= f; v.z *= f;
    }
    this.accel.x = ax; this.accel.z = az;

    // ---------- 悬浮弹簧 ----------
    const gs = this.sampleGround();
    this.groundRef = gs.ref;
    const h = p.y - gs.ref;
    this.hAbove = h;
    this.collapsed = h > SHIP.fieldCollapse;
    let ay;
    if (fieldOn && !this.collapsed) {
      const omega = 2 * Math.PI * SHIP.springHz * clamp(0.65 + 0.5 * pf, 0.5, 1.2);
      const zeta = SHIP.damping;
      this.bobPhase += dt * (1.3 + 0.7 * (1 - P));
      const bob = Math.sin(this.bobPhase) * Math.sin(this.bobPhase * 0.37 + 1.3) * (0.03 + (1 - P) * 0.16) * (this.altMode === 'low' ? 1 : 0.5);
      const target = gs.ref + this.targetHeight + bob;
      ay = omega * omega * (target - p.y) - 2 * zeta * omega * v.y;
      ay = clamp(ay, -SHIP.gravity, SHIP.maxLift);
    } else if (this.silent) {
      const sink = -SHIP.silence.sinkRate;
      ay = v.y > sink ? (sink - v.y) * 4 : clamp((sink - v.y) * 2, -SHIP.gravity, SHIP.gravity);
    } else if (this.spoolT > 0) {
      ay = -1.2 + (1 - this.spoolT / SHIP.silence.spool) * 2;
    } else {
      ay = -SHIP.gravity; // 场塌缩
    }
    const vyBefore = v.y;
    v.y += ay * dt;
    // 场控制器：上升速度不超过“仅靠重力即可停在目标高度”的上限，避免过冲
    if (fieldOn && !this.collapsed && v.y > 0) {
      const tgt = gs.ref + this.targetHeight;
      const vUp = Math.sqrt(2 * 0.85 * SHIP.gravity * Math.max(0, tgt - p.y)) + 0.35;
      if (v.y > vUp) v.y = vUp;
    }

    // ---------- 积分 ----------
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    this.airborne = h > this.targetHeight + 0.35 && v.y < 0;

    // ---------- 地面与天花板 ----------
    this.contact = false;
    const bottom = SHIP.hullBottom;
    const cNow = this.surfaceAt(p.x, p.z);
    if (p.y - bottom < cNow) {
      const pen = cNow - (p.y - bottom);
      p.y = cNow + bottom;
      if (v.y < 0) {
        if (vyBefore < -2.5) this.landing = Math.min(1, -vyBefore / 9);
        v.y = 0;
      }
      this.contact = true;
      this._scrape('ground', Math.hypot(v.x, v.z) * 0.25 + pen * 4, dt);
      const fr = Math.exp(-(this.silent ? 2.2 : 1.2) * dt);
      v.x *= fr; v.z *= fr;
    } else if (gs.rim - 0.12 > p.y - bottom + 0.05) {
      // 船缘擦到地形/倒木
      this.contact = true;
      v.y = Math.max(v.y, 2.5);
      this._scrape('edge', Math.hypot(v.x, v.z) * 0.18, dt);
      v.x *= Math.exp(-0.9 * dt); v.z *= Math.exp(-0.9 * dt);
    }
    const ceil = this.terrain.culvertCeiling(p.x, p.z);
    if (ceil !== null && p.y < ceil + 0.2) {
      const top = ceil - 0.55;
      if (p.y > top) {
        p.y = top;
        if (v.y > 0) { this._scrape('ceiling', v.y * 2 + 1, dt); v.y = -0.5; }
      }
    }

    // ---------- 水平碰撞 ----------
    this._collide(dt);

    // ---------- 边界 ----------
    const B = MAP.half - 15;
    if (Math.abs(p.x) > B) { p.x = Math.sign(p.x) * B; v.x *= -0.2; this.emit('boundary'); }
    if (Math.abs(p.z) > B) { p.z = Math.sign(p.z) * B; v.z *= -0.2; this.emit('boundary'); }

    this.speed = Math.hypot(v.x, v.z);

    // ---------- 热量 ----------
    let gain = this.weaponHeat;
    if (this.boosting) gain += SHIP.heat.boostRate;
    if (P > 0.75) gain += ((P - 0.75) / 0.25) * SHIP.heat.highPowerRate;
    const cool = SHIP.heat.coolRate * (this.silent ? 1.6 : 1);
    this.heat = clamp(this.heat + (gain - cool) * dt, 0, 100);
    this.venting = gain < cool && this.heat > SHIP.heat.ventMin;
    if (this.heat >= 100 && !this.overheated) {
      this.overheated = true;
      this.emit('overheat');
    }
    if (this.overheated && this.heat < SHIP.heat.recoverBelow) {
      this.overheated = false;
      this.emit('overheatEnd');
    }
    if (this.weaponLock > 0) this.weaponLock = Math.max(0, this.weaponLock - dt);
    this.weaponHeat = 0;

    // ---------- 姿态 ----------
    const tiltMax = (SHIP.tiltMax * Math.PI) / 180;
    const tx = clamp(ax / SHIP.accel, -1, 1) * tiltMax;
    const tz = clamp(az / SHIP.accel, -1, 1) * tiltMax;
    const k = 1 - Math.exp(-6 * dt);
    this.tilt.x += (tx - this.tilt.x) * k;
    this.tilt.z += (tz - this.tilt.z) * k;
    this.landing *= Math.exp(-5 * dt);
    this.impact *= Math.exp(-6 * dt);
    if (this.scrapeT > 0) this.scrapeT -= dt;

    // ---------- 船体自修复 ----------
    if (this.time - this.lastDamage > SHIP.hullRegenDelay && this.hull < SHIP.hull) {
      this.hull = Math.min(SHIP.hull, this.hull + SHIP.hullRegen * dt);
    }
  }

  toggleSilence() {
    if (this.silent) {
      this.silent = false;
      this.spoolT = SHIP.silence.spool;
      this.emit('silenceOff');
    } else if (this.spoolT <= 0) {
      this.silent = true;
      this.silentT = 0;
      this.jumpT = 0;
      this.emit('silenceOn');
    }
  }

  _scrape(kind, strength, dt) {
    if (strength < 0.35) return;
    this.impact = Math.max(this.impact, clamp(strength / 6, 0, 1));
    if (this.scrapeT > 0) return;
    this.scrapeT = 0.22;
    if (!this.ai) this.emit('scrape', { kind, strength });
  }

  _collide(dt) {
    const p = this.pos, v = this.vel;
    const R = SHIP.radius;
    const T = this.terrain;
    const bottom = p.y - SHIP.hullBottom;
    const resolve = (nx, nz, pen, kind) => {
      p.x += nx * pen; p.z += nz * pen;
      const vn = v.x * nx + v.z * nz;
      if (vn < 0) {
        const impact = -vn;
        const e = this.ai ? 0 : 0.25;
        v.x -= (1 + e) * vn * nx; v.z -= (1 + e) * vn * nz;
        const tf = this.ai ? 0.98 : 0.86;
        v.x *= tf; v.z *= tf;
        this.impact = Math.max(this.impact, clamp(impact / 20, 0.15, 1));
        if (!this.ai) {
          this.scrapeT = 0;
          this._scrape(kind, impact, dt);
          if (impact > SHIP.scrapeDamageSpeed) this.damage((impact - SHIP.scrapeDamageSpeed) * 1.4, 'collision');
        }
      }
    };
    // 树干与板根
    T.forTreesNear(p.x, p.z, R + 5.5, (t) => {
      const lowZone = bottom < t.g + t.hb;
      const r = lowZone ? t.rb : t.r;
      const dx = p.x - t.x, dz = p.z - t.z;
      const d = Math.hypot(dx, dz);
      const minD = R + r * (t.hb > 0 && lowZone ? 0.85 : 1);
      if (d < minD && d > 1e-4) resolve(dx / d, dz / d, minD - d, lowZone && t.hb > 0 ? 'buttress' : 'trunk');
      return false;
    });
    // 盒子
    for (const b of T.boxes) {
      if (!b.alive || !b.solid) continue;
      if (b.maxY <= bottom + 0.05 || b.minY >= p.y + 0.6) continue;
      if (p.x < b.minX - R || p.x > b.maxX + R || p.z < b.minZ - R || p.z > b.maxZ + R) continue;
      const cx = clamp(p.x, b.minX, b.maxX), cz = clamp(p.z, b.minZ, b.maxZ);
      let dx = p.x - cx, dz = p.z - cz;
      let d = Math.hypot(dx, dz);
      if (d < 1e-4) {
        // 圆心在盒内：沿最近面推出
        const l = p.x - b.minX, r = b.maxX - p.x, n = p.z - b.minZ, s = b.maxZ - p.z;
        const m = Math.min(l, r, n, s);
        if (m === l) resolve(-1, 0, l + R, b.material);
        else if (m === r) resolve(1, 0, r + R, b.material);
        else if (m === n) resolve(0, -1, n + R, b.material);
        else resolve(0, 1, s + R, b.material);
      } else if (d < R) {
        resolve(dx / d, dz / d, R - d, b.material === 'container' ? 'metal' : b.material);
      }
    }
    // 围栏
    for (const f of T.fences) {
      if (f.broken) continue;
      const fg = MAP.plateauH;
      if (bottom > fg + f.h) continue;
      const abx = f.bx - f.ax, abz = f.bz - f.az;
      const L2 = abx * abx + abz * abz;
      let t = ((p.x - f.ax) * abx + (p.z - f.az) * abz) / L2;
      t = clamp(t, 0, 1);
      const qx = f.ax + abx * t, qz = f.az + abz * t;
      const dx = p.x - qx, dz = p.z - qz;
      const d = Math.hypot(dx, dz);
      if (d < R && d > 1e-4) resolve(dx / d, dz / d, R - d, 'fence');
    }
    // 涵洞侧墙
    const C = MAP.culvert;
    if (p.z < C.z1 && p.z > C.z0 && p.y < C.ceil + 0.2) {
      const lim = C.halfW - R;
      const off = p.x - C.x;
      if (off > lim) resolve(-1, 0, off - lim, 'concrete');
      else if (off < -lim) resolve(1, 0, -lim - off, 'concrete');
    }
  }

  // 自适应外壳：肉眼/摄像头发现距离倍率
  camoFactor() {
    const t = smoothstep(10, 26, this.speed);
    return 0.6 + 0.4 * t;
  }

  // 驾驶舱震动 0..1（离地越近越大）
  vibration() {
    const close = 1 - clamp((this.hAbove - 0.5) / 3.2, 0, 1);
    const sp = clamp(this.speed / 45, 0, 1);
    return clamp(close * (0.35 + 0.65 * sp) + this.impact * 0.8, 0, 1);
  }
}
