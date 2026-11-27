import { clamp, damp, wrapPi, approach } from '../core/math.js';
import { C } from '../data/palette.js';
import { SH } from '../gfx/shapes.js';
import { GRAV, TIER, solveBallistic, fireShell } from './weapons.js';

export const SC = 1.25;
export const THRESH = [0.22, 0.7, 1.3];
const MAX_CHARGE = 1.7;
const BARREL_LEN = 74;

export class Tank {
  constructor(w) { this.reset(w); }
  reset(w) {
    const T = w.terrain;
    this.x = T.W / 2 - 520; this.y = T.heightAt(this.x);
    this.vx = 0; this.vy = 0; this.air = false;
    this.ang = 0; this.f = 1;
    this.barrelAng = 0.15; this.aimX = this.x + 300; this.aimY = this.y + 100;
    this.recoil = 0; this.recoilV = 0;
    this.hp = 100; this.hpMax = 100; this.invuln = 0; this.hitFlash = 0; this.lastHurt = -10;
    this.charging = false; this.charge = 0; this.tier = 0; this.prevFire = false; this.cd = 0;
    this.mgCd = 0; this.heat = 0; this.overheat = false; this.mgShots = 0;
    this.missileCd = 0;
    this.odo = 0; this.wob = 0; this.wobV = 0; this.exhaust = 0; this.thrustT = 0;
    this.wheelDy = [0, 0, 0, 0, 0];
    this.dead = false; this.deadT = 0; this.tilt = 0;
    this.chargeSparkT = 0; this.engine = 0; this.slopeCur = 0;
  }
  // ---- geometry helpers --------------------------------------------------------------
  T(lx, ly) {
    const c = Math.cos(this.ang), s = Math.sin(this.ang);
    const X = this.f * lx * SC, Y = ly * SC;
    return { x: this.x + c * X - s * Y, y: this.y + s * X + c * Y };
  }
  pivot() { return this.T(14, 53); }
  muzzle() {
    const p = this.pivot();
    return { x: p.x + Math.cos(this.barrelAng) * (BARREL_LEN * SC * 0.92), y: p.y + Math.sin(this.barrelAng) * (BARREL_LEN * SC * 0.92) };
  }
  mgPos() { return this.T(6, 66); }

  // ---- simulation ----------------------------------------------------------------------
  update(w, dt, inp) {
    const T = w.terrain, fx = w.fx;
    if (this.dead) { this.deadT += dt; return; }
    this.cd = Math.max(0, this.cd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.missileCd = Math.max(0, this.missileCd - dt);
    this.mgCd = Math.max(0, this.mgCd - dt);
    this.heat = Math.max(0, this.heat - dt * (this.overheat ? 0.35 : 0.55));
    if (this.overheat && this.heat < 0.35) this.overheat = false;
    // slow regen when not hurt recently
    if (w.time - this.lastHurt > 6 && this.hp < this.hpMax) this.hp = Math.min(this.hpMax, this.hp + 3 * dt);

    // ---- driving ----
    const dir = inp.axis;
    const od = w.combo.odT > 0;
    let maxV = 340 * (this.charging && this.charge > 0.2 ? 0.7 : 1);
    const sl = T.slopeAt(this.x);
    this.slopeCur = damp(this.slopeCur, sl, 8, dt);
    if (dir) maxV *= (1 - 0.3 * clamp(this.slopeCur * dir, 0, 1)) * Math.min(1, 0.35 + Math.abs(dir));
    if (Math.abs(dir) > 0.05) this.vx += dir * 1700 * dt; else this.vx = approach(this.vx, 0, 1400 * dt);
    this.vx = clamp(this.vx, -maxV, maxV);
    this.x = clamp(this.x + this.vx * dt, 170, T.W - 170);
    this.odo += this.vx * dt * (this.f > 0 ? 1 : -1);
    this.engine = damp(this.engine, Math.abs(this.vx) / 340, 6, dt);

    const hF = T.heightAt(this.x + 38 * SC * 0.95), hB = T.heightAt(this.x - 38 * SC * 0.95), hM = T.heightAt(this.x);
    const gy = (hF + hB + hM * 2) / 4;
    const tAng = Math.atan2(hF - hB, 76 * SC * 0.95);
    this.ang = damp(this.ang, tAng, 12, dt);
    for (let i = 0; i < 5; i++) {
      const wx = this.x + (i - 2) * 19 * SC * this.f * 0.98;
      const off = clamp(T.heightAt(wx) - (gy + Math.sin(tAng) * (i - 2) * 19 * SC * this.f), -7, 7);
      this.wheelDy[i] = damp(this.wheelDy[i], off, 18, dt);
    }
    if (!this.air) {
      const prev = this.y;
      this.y = damp(this.y, gy, 26, dt);
      // dust when moving
      if (Math.abs(this.vx) > 60 && Math.random() < 0.5) {
        fx.dust(this.x - Math.sign(this.vx) * 46 * SC, this.y + 2, 1, 8, 40);
      }
    } else {
      this.vy -= 980 * dt; this.y += this.vy * dt;
      this.thrustT -= dt;
      if (this.thrustT > 0) {
        for (const lx of [-28, 28]) {
          const p = this.T(lx, 4);
          fx.fire(p.x, p.y, (Math.random() - 0.5) * 60, -260 - Math.random() * 120, 12 + Math.random() * 8, 0.22);
          if (Math.random() < 0.5) fx.ember(p.x, p.y, (Math.random() - 0.5) * 200, -300 * Math.random(), 2.5, 0.5, [0.5, 0.9, 1.0]);
        }
        w.fx.light(this.x, this.y, 30, 150, [0.4, 0.8, 1], 3.0, 0.06);
      }
      if (this.y <= gy && this.vy <= 0) {
        this.air = false; this.y = gy;
        fx.dust(this.x, this.y + 2, 28, 60, 260);
        fx.shock(this.x, this.y + 10, 120, 0.012, 0.3);
        fx.addTrauma(0.16);
        w.sfx('land', this.x, {});
      }
    }
    if (inp.jump && !this.air) {
      this.air = true; this.vy = 360; this.thrustT = 0.4;
      fx.dust(this.x, this.y + 2, 20, 50, 220);
      fx.addTrauma(0.1);
      w.sfx('jump', this.x, {});
    }

    // ---- aiming ----
    const aim = w.camera.screenToWorld(inp.aimX, inp.aimY);
    this.aimX = aim.x; this.aimY = aim.y;
    if (this.f > 0 && aim.x < this.x - 26) this.f = -1;
    else if (this.f < 0 && aim.x > this.x + 26) this.f = 1;
    const P = this.pivot();
    const wantSpeed = this.charging && this.charge >= THRESH[0] ? TIER[1].speed : TIER[0].speed;
    const sol = solveBallistic(Math.abs(aim.x - P.x), aim.y - P.y, wantSpeed, GRAV);
    const targetAng = this.f > 0 ? sol.th : Math.PI - sol.th;
    this.barrelAng += wrapPi(targetAng - this.barrelAng) * Math.min(1, dt * 26);
    this.tof = sol.tof;
    // recoil spring
    this.recoilV += (-this.recoil * 340 - this.recoilV * 22) * dt;
    this.recoil += this.recoilV * dt;
    this.wobV += (-this.wob * 220 - this.wobV * 6 - this.vx * 0.25) * dt;
    this.wob += this.wobV * dt;

    // ---- main cannon: hold = charge, release = fire ----
    const fireHeld = inp.fire && !this.overheatLock;
    if (fireHeld && !this.prevFire && this.cd <= 0) { this.charging = true; this.charge = 0; this.tier = 0; }
    if (this.charging) {
      if (fireHeld) {
        this.charge = Math.min(MAX_CHARGE, this.charge + dt * (w.combo.odT > 0 ? 1.4 : 1));
        let t = this.charge >= THRESH[2] ? 3 : this.charge >= THRESH[1] ? 2 : this.charge >= THRESH[0] ? 1 : 0;
        if (t > this.tier) {
          this.tier = t;
          const m = this.muzzle();
          fx.glow(m.x, m.y, 26 + t * 8, 0.14, [0.5, 0.9, 1.0], 3.5);
          fx.ring(m.x, m.y, 6, 60 + t * 20, 2.5, 0.25, [0.5, 0.9, 1.0], 3.0);
          fx.addTrauma(0.05 + t * 0.03);
          w.sfx('chargeTier', this.x, { tier: t });
        }
        // sparks streaming into the muzzle
        if (this.charge > 0.12) {
          this.chargeSparkT -= dt;
          if (this.chargeSparkT <= 0) {
            this.chargeSparkT = 0.016;
            const m = this.muzzle();
            const a = Math.random() * 6.283, r = 40 + Math.random() * 40 + this.tier * 14;
            fx.ember(m.x + Math.cos(a) * r, m.y + Math.sin(a) * r, -Math.cos(a) * r / 0.22, -Math.sin(a) * r / 0.22, 2.6, 0.22, this.tier >= 3 ? [1, 0.4, 0.9] : [0.5, 0.9, 1]);
          }
        }
        if (this.tier >= 3) fx.addTrauma(0.004); // gentle rumble while overcharged
      } else {
        // release
        this.charging = false;
        const tier = this.tier;
        fireShell(w, this, tier, this.tof);
        const T = TIER[tier];
        this.recoil = 12 * T.power; this.recoilV = 0;
        this.vx -= this.f * (70 + tier * 55);
        this.cd = (0.28 + tier * 0.06) / (1 + 0.08 * (w.arms.lv('cannon') - 1));
        this.charge = 0;
      }
    }
    this.prevFire = inp.fire;

    // ---- coax machine gun ----
    if (inp.mg && this.mgCd <= 0 && !this.overheat) {
      this.mgCd = 0.07;
      const g = this.mgPos();
      const a = Math.atan2(aim.y - g.y, aim.x - g.x) + (Math.random() - 0.5) * 0.06;
      const od2 = w.combo.odT > 0;
      w.tracers.push({ x: g.x + Math.cos(a) * 20, y: g.y + Math.sin(a) * 20, vx: Math.cos(a) * 1500, vy: Math.sin(a) * 1500, life: 0.7, dmg: 4.2 * (1 + 0.22 * (w.arms.lv('mg') - 1)), od: od2 });
      fx.sparks(g.x + Math.cos(a) * 22, g.y + Math.sin(a) * 22, Math.cos(a), Math.sin(a), 3, 600, [1, 0.8, 0.4], 0.35);
      fx.glow(g.x + Math.cos(a) * 18, g.y + Math.sin(a) * 18, 14, 0.05, [1, 0.85, 0.5], 4);
      fx.light(g.x, g.y, 40, 110, [1, 0.8, 0.5], 2.6, 0.05);
      fx.casing(g.x, g.y, -this.f * (60 + Math.random() * 80), 150 + Math.random() * 120);
      fx.addTrauma(0.012);
      this.heat += od2 ? 0.01 : 0.032 * (1 - 0.08 * (w.arms.lv('mg') - 1));
      this.mgShots++;
      if (this.mgShots % 2 === 0) w.sfx('mg', this.x, {});
      if (this.heat >= 1) { this.overheat = true; w.sfx('overheat', this.x, {}); }
    }
    if (this.heat > 0.6 && Math.random() < 0.35) {
      const g = this.mgPos();
      fx.smoke(g.x, g.y + 4, this.f * 10, 50, 5, 0.9, false, [0.5, 0.5, 0.55]);
    }
    // ---- missiles / overdrive ----
    if (inp.missile && w.arms.by.missiles && w.enemies.length && this.missileCd <= 0) { this.missileCd = 3; w.arms.by.missiles.cd = 0; }
    if (inp.overdrive && w.combo.meter >= 100 && w.combo.odT <= 0) w.startOverdrive();

    // ---- exhaust ----
    this.exhaust -= dt;
    if (this.exhaust <= 0) {
      this.exhaust = 0.05 - this.engine * 0.025;
      const p = this.T(-52, 32);
      fx.smoke(p.x, p.y, -this.f * 20 - this.vx * 0.2, 40 + Math.random() * 30, 5 + this.engine * 4, 0.9, false, [0.2, 0.17, 0.25]);
    }
  }

  die(w) {
    if (this.dead) return;
    this.dead = true; this.hp = 0;
    const fx = w.fx;
    fx.explosion(this.x, this.y + 40, 2.2, { trauma: 0.4 });
    fx.explosion(this.x + 30, this.y + 60, 1.4);
    fx.debrisBurst(this.x, this.y + 40, 40, 700, C.hullMid);
    fx.stop(10); fx.slow(1.2, 0.2);
    fx.pulse(0.3, 0.01, 0.2);
    w.sfx('explosion', this.x, { size: 2.2 });
    w.onTankDead();
  }

  // ---- rendering -------------------------------------------------------------------------
  draw(w, L0, LA) {
    if (this.dead) return;
    const S = SC, f = this.f, th = this.ang;
    const fl = this.hitFlash * 0.8 + (this.invuln > 0 ? 0.15 : 0);
    const part = (lx, ly, hw, hh, rot, rad, col, bevel = 3.5, emis = 0, mat = 0) => {
      const p = this.T(lx, ly);
      L0.rbox(p.x, p.y, hw * S, hh * S, th + rot * f, rad * S, col, bevel * S * 0.8, emis, mat, fl);
    };
    // ground shadow
    L0.blob(this.x, w.terrain.heightAt(this.x) + 2, 58 * S, 7 * S, [0, 0, 0, 0.55], 10);
    // tracks + wheels
    part(0, 11, 52, 11, 0, 11, C.track, 5);
    for (let i = 0; i < 14; i++) {
      const lx = ((i * 7.5 + this.odo / S) % 105 + 105) % 105 - 52.5;
      const p1 = this.T(lx, 22), p2 = this.T(lx, 0.5);
      L0.rbox(p1.x, p1.y, 2.6 * S, 1.6 * S, th, 0.8 * S, C.tread, 1.2);
      L0.rbox(p2.x, p2.y, 2.6 * S, 1.6 * S, th, 0.8 * S, C.tread, 1.2);
    }
    for (let i = 0; i < 5; i++) {
      const lx = (i - 2) * 19, dy = this.wheelDy[i] / S;
      const p = this.T(lx, 11 + dy * 0.6);
      L0.circle(p.x, p.y, 8.2 * S, C.wheel, 4 * S * 0.8, 0, 0, fl);
      const a = this.odo / (8 * S) + i;
      const q = this.T(lx + Math.cos(a) * 4.2, 11 + dy * 0.6 + Math.sin(a) * 4.2);
      L0.circle(q.x, q.y, 1.6 * S, C.hullLight, 1.2, 0.0, 0, 0);
    }
    for (const lx of [-50, 50]) {
      const p = this.T(lx, 11);
      L0.circle(p.x, p.y, 9.5 * S, C.wheel, 4 * S * 0.8, 0, 0, fl);
      L0.circle(p.x, p.y, 3.2 * S, C.hullDark, 2, 0, 0, 0);
    }
    // underglow
    const ug = this.T(0, 3);
    LA.glow(ug.x, ug.y, 50 * S, 1.6 * S, th, 1.6 * S, SH.RBOX, 7, C.cyan, 0.7 + this.engine * 0.5);
    LA.glow(ug.x, ug.y - 3, 38 * S, 1.2 * S, th, 1.2 * S, SH.RBOX, 9, C.magenta, 0.4);

    // skirt + hull
    part(0, 20, 48, 4.5, 0, 3, C.hullTrim, 3);
    const hp = this.T(0, 35);
    L0.trap(hp.x, hp.y, 46 * S, 9 * S, 33 * S, th, 3 * S, C.hullMid, 5 * S, 0, 0, fl);
    part(0, 27, 47, 4, 0, 3, C.hullDark, 3);
    // front glacis plate + rear plate
    const gp = this.T(41, 33);
    L0.rbox(gp.x, gp.y, 12 * S, 4.2 * S, th + f * -0.55, 2.5 * S, C.hullLight, 3 * S, 0, 0, fl);
    const rp = this.T(-41, 33);
    L0.rbox(rp.x, rp.y, 9 * S, 4 * S, th + f * 0.8, 2.5 * S, C.hullDark, 3 * S, 0, 0, fl);
    // neon trim
    part(0, 22.5, 46, 0.9, 0, 0.9, C.cyan, 1, 2.6, 0);
    part(-2, 42.5, 28, 0.8, 0, 0.8, C.magenta, 1, 2.3, 0);
    // reactive armour tiles
    for (let i = 0; i < 3; i++) part(30 + i * 5.5, 36.5 - i * 2.1, 2.2, 2.2, -0.55, 0.6, i === 1 ? C.amber : C.hullDark, 1.5, i === 1 ? 0.5 : 0);

    // barrel (behind the turret mantlet)
    const P = this.pivot();
    const ba = this.barrelAng, bc = Math.cos(ba), bs = Math.sin(ba);
    const rec = this.recoil * S;
    const bl = BARREL_LEN * S * 0.5;
    const bcx = P.x + bc * (bl - rec), bcy = P.y + bs * (bl - rec);
    L0.rbox(bcx, bcy, bl, 3.6 * S, ba, 3.4 * S, C.hullDark, 3 * S, 0, 0, fl);
    L0.rbox(P.x + bc * (bl * 0.42 - rec), P.y + bs * (bl * 0.42 - rec), 11 * S, 5.2 * S, ba, 3 * S, C.hullMid, 4 * S * 0.8, 0, 0, fl);
    const mb = { x: P.x + bc * (bl * 2 - 2 * S - rec * 0.6), y: P.y + bs * (bl * 2 - 2 * S - rec * 0.6) };
    L0.rbox(mb.x, mb.y, 6.5 * S, 5.5 * S, ba, 2 * S, C.hullLight, 3 * S, 0, 0, fl);
    // charge glow at muzzle
    if (this.charging && this.charge > 0.1) {
      const k = Math.min(1, this.charge / THRESH[2]);
      const col = this.tier >= 3 ? [1, 0.35, 0.85, 1] : [0.45, 0.9, 1, 1];
      LA.glowDot(mb.x + bc * 8, mb.y + bs * 8, 6 + this.tier * 3, 14 + this.tier * 6, col, 1.5 + k * 3);
      LA.glowLine(P.x + bc * 6, P.y + bs * 6, mb.x, mb.y, 1.2, 5, col, 0.8 + k * 1.6);
    }
    // overheated barrel glow
    if (this.heat > 0.5) {
      const g = this.mgPos();
      LA.glowDot(g.x, g.y, 5, 10, [1, 0.35, 0.1, 1], (this.heat - 0.5) * 6);
    }

    // turret
    part(4, 44, 20, 3.5, 0, 2, C.hullTrim, 2.5);
    const tp = this.T(4, 53);
    L0.trap(tp.x, tp.y, 24 * S, 9.5 * S, 17 * S, th, 4 * S, C.hullMid, 5 * S, 0, 0, fl);
    part(-16, 52, 10, 7, 0, 4, C.hullDark, 4);
    part(18, 53, 5, 7.5, 0, 3, C.hullLight, 3);
    part(8, 59.5, 14, 1, 0, 1, C.cyan, 1, 2.2, 0);
    // cupola + visor
    const cp = this.T(-6, 63);
    L0.circle(cp.x, cp.y, 6.5 * S, C.hullDark, 4 * S * 0.8, 0, 0, fl);
    part(-4, 63.6, 3.6, 1.2, 0, 0.8, C.cyan, 1, 3.2, 2);
    // roof MG
    const g = this.mgPos();
    const mga = Math.atan2(this.aimY - g.y, this.aimX - g.x);
    L0.rbox(g.x + Math.cos(mga) * 9 * S, g.y + Math.sin(mga) * 9 * S, 10 * S, 1.9 * S, mga, 1.2 * S, C.steel, 2, 0, 0, fl);
    L0.rbox(g.x, g.y - 2 * S, 3.2 * S, 2.4 * S, th, 1 * S, C.hullDark, 2, 0, 0, fl);
    // antenna with blinking tip
    const ab = this.T(-30, 44);
    const aa = th + this.wob * 0.02 + f * 0.12;
    const alen = 20 * S;
    L0.rbox(ab.x - Math.sin(aa) * alen * 0.0 + Math.sin(aa) * -alen, ab.y + Math.cos(aa) * alen, 0.7 * S, alen, aa, 0.6, C.steel, 1);
    const tipx = ab.x - Math.sin(aa) * 2 * alen, tipy = ab.y + Math.cos(aa) * 2 * alen;
    const blink = (Math.floor(w.time * 1.6) % 2) ? 1 : 0.2;
    LA.glowDot(tipx, tipy, 1.6, 5, C.red, 2.5 * blink);
    // engine exhaust glow
    const ex = this.T(-52, 32);
    LA.glowDot(ex.x, ex.y, 3, 8, [1, 0.35, 0.1, 1], 0.4 + this.engine * 1.2);
    // thrusters while airborne
    if (this.thrustT > 0) {
      for (const lx of [-28, 28]) { const p = this.T(lx, 2); LA.glowDot(p.x, p.y, 7, 18, [0.4, 0.8, 1, 1], 3.2); }
    }
  }
}
