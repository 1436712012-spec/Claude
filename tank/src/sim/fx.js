import { PT } from '../gfx/particles.js';
import { noise1, clamp } from '../core/math.js';
import { C } from '../data/palette.js';
import { SH } from '../gfx/shapes.js';

const rr = (a, b) => a + (b - a) * Math.random();
const TAU = Math.PI * 2;

/**
 * Juice manager: trauma-based screen shake, hit-stop, slow-motion, dynamic lights, shockwaves,
 * transient glows and all the particle "recipes" (explosions, muzzle flash, sparks, smoke...).
 */
export class Fx {
  constructor(particles, settings) {
    this.P = particles;
    this.set = settings;
    this.trauma = 0; this.hitstop = 0;
    this.slowT = 0; this.slowScale = 1; this.slowCur = 1;
    this.lights = []; this.shocks = []; this.lenses = new Map(); this.glows = []; this.rings = []; this.texts = [];
    this.flash = 0; this.exposure = 0; this.ca = 0; this.zoomPunch = 0; this.t = 0;
    this.hurt = 0; this.auto = 1;
  }
  get k() { return this.set.fx * this.auto; }

  // ---- feel primitives ------------------------------------------------------------------
  addTrauma(v) { this.trauma = Math.min(1, this.trauma + v * this.set.shake); }
  stop(frames) { this.hitstop = Math.max(this.hitstop, frames / 60); }
  slow(duration, scale) { this.slowT = Math.max(this.slowT, duration); this.slowScale = Math.min(this.slowScale, scale); }
  pulse(exposure, ca, flash = 0) {
    const f = this.set.reduceFlash ? 0.25 : 1;
    this.exposure = Math.min(0.16, this.exposure + exposure * f);
    this.ca = Math.min(0.012, this.ca + ca * (this.set.reduceFlash ? 0.5 : 1));
    this.flash = Math.min(0.1, this.flash + flash * f);
  }
  light(x, y, z, radius, col, intensity, life, pow = 2) {
    if (this.lights.length > 40) this.lights.shift();
    this.lights.push({ x, y, z, r: radius, col, i: intensity, life, max: life, pow });
  }
  shock(x, y, maxR, strength, dur = 0.5) {
    if (this.shocks.length >= 12) this.shocks.shift();
    this.shocks.push({ x, y, maxR, s: strength * (this.set.reduceFlash ? 0.6 : 1), t: 0, dur });
  }
  /** persistent screen-space lens (negative strength pulls light inward); call every step while alive */
  lens(id, x, y, r, s) { this.lenses.set(id, { x, y, r, s, ttl: 0.1 }); }
  glow(x, y, r, life, col, intensity, shape = SH.ELL, rot = 0, hh = null) {
    this.glows.push({ x, y, r, hh: hh === null ? r : hh, rot, life, max: life, col, i: intensity, shape });
  }
  ring(x, y, r0, r1, thick, life, col, intensity) { this.rings.push({ x, y, r0, r1, thick, life, max: life, col, i: intensity }); }
  text(x, y, str, color = '#ffe9b0', size = 18, life = 0.9) { if (this.set.numbers) this.texts.push({ x, y, str, color, size, life, max: life }); }

  tickReal(dt) {
    this.hitstop = Math.max(0, this.hitstop - dt);
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowScale = 1; }
    this.slowCur += (this.slowScale - this.slowCur) * Math.min(1, dt * (this.slowScale < this.slowCur ? 30 : 7));
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    this.exposure = Math.max(0, this.exposure - dt * 1.2);
    this.flash = Math.max(0, this.flash - dt * 2.0);
    this.ca = Math.max(0, this.ca - dt * 0.03);
    this.zoomPunch = Math.max(0, this.zoomPunch - dt * 2.5);
    this.hurt = Math.max(0, this.hurt - dt * 1.8);
    this.t += dt;
  }
  tickWorld(dt) {
    for (const L of this.lights) L.life -= dt;
    this.lights = this.lights.filter((L) => L.life > 0);
    for (const s of this.shocks) s.t += dt;
    this.shocks = this.shocks.filter((s) => s.t < s.dur);
    for (const [k, l] of this.lenses) { l.ttl -= dt; if (l.ttl <= 0) this.lenses.delete(k); }
    for (const g of this.glows) g.life -= dt;
    this.glows = this.glows.filter((g) => g.life > 0);
    for (const g of this.rings) g.life -= dt;
    this.rings = this.rings.filter((g) => g.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y += 40 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
  }
  shakeOffset() {
    const a = this.trauma * this.trauma;
    const t = this.t * 38;
    return { x: a * 16 * noise1(t), y: a * 12 * noise1(t + 31.7), rot: a * 0.014 * noise1(t + 77.1) };
  }

  /** Writes lights into typed arrays (strongest/nearest 16). */
  packLights(cam, persistent, lp, lc) {
    const all = [];
    const reach = cam.halfW + 260;
    for (const L of this.lights) {
      const f = Math.pow(Math.max(0, L.life / L.max), L.pow);
      all.push({ x: L.x, y: L.y, z: L.z, r: L.r, c: L.col, i: L.i * f, w: 100 + L.i * f * L.r });
    }
    for (const L of persistent) {
      if (Math.abs(L.x - cam.x) > reach) continue;
      all.push({ x: L.x, y: L.y, z: L.z, r: L.r, c: L.col, i: L.i, w: L.i * L.r * 0.4 });
    }
    all.sort((a, b) => b.w - a.w);
    const n = Math.min(16, all.length);
    for (let i = 0; i < n; i++) {
      const L = all[i];
      lp[i * 4] = L.x; lp[i * 4 + 1] = L.y; lp[i * 4 + 2] = L.z; lp[i * 4 + 3] = L.r;
      lc[i * 4] = L.c[0] * L.i; lc[i * 4 + 1] = L.c[1] * L.i; lc[i * 4 + 2] = L.c[2] * L.i; lc[i * 4 + 3] = 1;
    }
    return n;
  }
  packShocks(cam, arr) {
    let n = 0;
    for (const s of this.shocks) {
      const t = s.t / s.dur;
      const r = s.maxR * (1 - Math.pow(1 - t, 2.2));
      const ux = (s.x - cam.x) / (cam.halfW * 2) + 0.5, uy = (s.y - cam.y) / (cam.halfH * 2) + 0.5;
      arr[n * 4] = ux; arr[n * 4 + 1] = uy; arr[n * 4 + 2] = r / (cam.halfH * 2); arr[n * 4 + 3] = s.s * (1 - t) * (1 - t);
      n++;
    }
    for (const l of this.lenses.values()) {
      if (n >= 16) break;
      arr[n * 4] = (l.x - cam.x) / (cam.halfW * 2) + 0.5; arr[n * 4 + 1] = (l.y - cam.y) / (cam.halfH * 2) + 0.5;
      arr[n * 4 + 2] = l.r / (cam.halfH * 2); arr[n * 4 + 3] = l.s;
      n++;
    }
    return n;
  }
  /** additive glows + rings into an instance list */
  drawAdd(L) {
    for (const g of this.glows) {
      const f = g.life / g.max;
      L.glow(g.x, g.y, g.r, g.hh, g.rot, g.shape === SH.RBOX ? g.hh : 0, g.shape, g.r * 0.35, g.col, g.i * f * f);
    }
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      const R = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - t, 2.4));
      const a = (1 - t) * (1 - t);
      L.push(r.x, r.y, R, r.thick * (1 - t * 0.6), 0, 0, SH.RING, r.thick * 1.4, r.col[0], r.col[1], r.col[2], 1, r.i * a, 3, 0, 0);
    }
  }

  // ---- particle recipes ----------------------------------------------------------------
  explosion(x, y, size = 1, o = {}) {
    const P = this.P, k = this.k * size;
    const sq = Math.sqrt(size);
    const tint = o.plasma ? C.plasma : [1.0, 0.52, 0.14];
    const ns = Math.round(80 * k);
    for (let i = 0; i < ns; i++) {
      const a = rr(0, TAU), sp = rr(160, 900) * sq * (Math.random() < 0.2 ? 1.5 : 1);
      P.emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp + 120, rr(0.5, 1.5), rr(2.0, 3.6), PT.SPARK, tint[0], tint[1], tint[2]);
    }
    const ne = Math.round(34 * k);
    for (let i = 0; i < ne; i++) {
      const a = rr(0, TAU), sp = rr(30, 260) * sq;
      P.emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp + 40, rr(1.0, 2.6), rr(3, 6.5), PT.EMBER, tint[0], tint[1] * 0.9, tint[2] * 0.6);
    }
    const nf = Math.round(8 * k);
    for (let i = 0; i < nf; i++) {
      const a = rr(0, TAU), sp = rr(0, 150) * sq;
      P.emit(x + Math.cos(a) * 8 * sq, y + Math.sin(a) * 8 * sq, Math.cos(a) * sp, Math.sin(a) * sp + 40, rr(0.4, 0.8), rr(20, 42) * Math.pow(size, 0.7), PT.FIRE, tint[0], tint[1] * 0.85, tint[2] * 0.5);
    }
    const nm = Math.round(10 * k);
    for (let i = 0; i < nm; i++) {
      const a = rr(0, TAU), sp = rr(10, 120) * sq;
      P.emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp + 30, rr(1.8, 3.6), rr(34, 66) * Math.pow(size, 0.7), PT.SMOKE, C.smoke[0], C.smoke[1], C.smoke[2], true);
    }
    if (o.debris !== false) {
      const nd = Math.round(8 * k);
      for (let i = 0; i < nd; i++) {
        const a = rr(0.1, Math.PI - 0.1), sp = rr(140, 520) * sq;
        P.emit(x, y, Math.cos(a) * sp * rr(-1, 1) * 1.4, Math.sin(a) * sp, rr(1.2, 2.6), rr(3, 7), PT.DEBRIS, C.hullMid[0], C.hullMid[1], C.hullMid[2], true);
      }
    }
    this.glow(x, y, 46 * sq, 0.14, [1.0, 0.8, 0.5], 3.6);
    this.glow(x, y, 100 * sq, 0.32, [1.0, 0.4, 0.12], 1.1);
    this.light(x, y, 60, 300 * sq, [1, 0.58, 0.24], 6 * size, 0.5);
    this.shock(x, y, 170 * sq, 0.032 * sq, 0.5);
    this.ring(x, y, 12, 130 * sq, 4 * sq, 0.45, [1, 0.7, 0.4], 2.0);
    this.addTrauma(0.2 * size + (o.trauma || 0));
    this.pulse(0.035 * size, 0.0025 * size, 0.02 * size);
  }
  flakBurst(x, y, R, tier, plasma = false) {
    const P = this.P, k = this.k;
    const col = plasma ? C.plasma : [1.0, 0.62, 0.2];
    const ns = Math.round((90 + tier * 40) * k);
    for (let i = 0; i < ns; i++) {
      const a = rr(0, TAU), sp = rr(250, 760) * (0.6 + R / 160);
      P.emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.4, 1.1), rr(1.8, 3.0), PT.SPARK, col[0], col[1], col[2]);
    }
    for (let i = 0; i < Math.round(8 * k); i++) {
      const a = rr(0, TAU), sp = rr(30, 150);
      P.emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rr(1.4, 2.4), rr(R * 0.35, R * 0.6), PT.SMOKE, 0.09, 0.06, 0.12, true);
    }
    this.glow(x, y, R * 0.65, 0.14, plasma ? [0.5, 0.95, 1] : [1, 0.85, 0.55], 7);
    this.ring(x, y, 8, R * 1.15, 3.5, 0.34, col, 3.6);
    this.light(x, y, 80, R * 3.2, col, 7 + tier * 1.5, 0.4);
    this.shock(x, y, R * 1.8, 0.02 + tier * 0.004, 0.4);
    this.addTrauma(0.1 + tier * 0.06);
    this.pulse(0.04 + tier * 0.015, 0.0018);
  }
  muzzle(x, y, ang, power = 1) {
    const P = this.P, k = this.k, c = Math.cos(ang), s = Math.sin(ang);
    const n = Math.round(30 * k * power);
    for (let i = 0; i < n; i++) {
      const a = ang + rr(-0.26, 0.26), sp = rr(350, 1300) * (0.6 + 0.4 * power);
      P.emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.15, 0.55), rr(1.6, 2.8), PT.SPARK, 1.0, 0.62, 0.2);
    }
    for (let i = 0; i < Math.round(6 * k); i++) {
      const a = ang + rr(-0.5, 0.5), sp = rr(80, 380);
      P.emit(x + c * 6, y + s * 6, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.9, 1.7), rr(14, 26) * power, PT.SMOKE, 0.16, 0.13, 0.2, true);
    }
    this.glow(x + c * 22 * power, y + s * 22 * power, 62 * power, 0.08, [1.0, 0.82, 0.55], 6.5, SH.RBOX, ang, 15 * power);
    this.glow(x, y, 46 * power, 0.1, [1.0, 0.55, 0.2], 3);
    this.light(x + c * 20, y + s * 20, 50, 280 * power, [1, 0.72, 0.38], 7.5 * power, 0.13);
    this.ring(x + c * 8, y + s * 8, 6, 70 * power, 3, 0.2, [1, 0.8, 0.55], 2.6);
    this.shock(x + c * 10, y + s * 10, 90 * power, 0.012 * power, 0.28);
  }
  sparks(x, y, dx, dy, n, speed = 420, col = [1.0, 0.6, 0.2], spread = 1.1) {
    const P = this.P, base = Math.atan2(dy, dx), cnt = Math.round(n * this.k);
    for (let i = 0; i < cnt; i++) {
      const a = base + rr(-spread, spread), sp = rr(0.3, 1) * speed;
      P.emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.25, 0.8), rr(1.6, 2.6), PT.SPARK, col[0], col[1], col[2]);
    }
  }
  smoke(x, y, vx, vy, size, life, hot = false, col = C.smoke) {
    this.P.emit(x, y, vx, vy, life, size, PT.SMOKE, col[0], col[1], col[2], hot);
  }
  fire(x, y, vx, vy, size, life) { this.P.emit(x, y, vx, vy, life, size, PT.FIRE, 1.0, 0.45, 0.1); }
  ember(x, y, vx, vy, size, life, col = [1, 0.6, 0.2]) { this.P.emit(x, y, vx, vy, life, size, PT.EMBER, col[0], col[1], col[2]); }
  dust(x, y, n, spread, speed, col = [0.2, 0.14, 0.2]) {
    const cnt = Math.round(n * this.k);
    for (let i = 0; i < cnt; i++) {
      const dir = rr(-1, 1);
      this.P.emit(x + dir * spread, y + rr(0, 5), dir * speed * rr(0.4, 1) + rr(-20, 20), rr(10, 60), rr(0.7, 1.6), rr(10, 22), PT.DUST, col[0], col[1], col[2]);
    }
  }
  debrisBurst(x, y, n, speed, col = C.hullMid, hot = true) {
    const cnt = Math.round(n * this.k);
    for (let i = 0; i < cnt; i++) {
      const a = rr(0.05, Math.PI - 0.05), sp = rr(0.3, 1) * speed;
      this.P.emit(x, y, Math.cos(a) * sp * rr(-1, 1) * 1.5, Math.sin(a) * sp, rr(1.2, 2.6), rr(2.5, 6), PT.DEBRIS, col[0], col[1], col[2], hot);
    }
  }
  casing(x, y, vx, vy) { this.P.emit(x, y, vx, vy, 2.2, 3.2, PT.CASING, C.brass[0], C.brass[1], C.brass[2]); }
}
