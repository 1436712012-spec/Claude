import { C } from '../data/palette.js';
import { SH } from '../gfx/shapes.js';
import { rgba } from '../core/math.js';

const rr = (a, b) => a + (b - a) * Math.random();
const WALLS = [C.wall, C.wall2, rgba(0x57406e), rgba(0x3d3558)];
const WIN_COLS = [C.amber, rgba(0xffa04a), rgba(0xffd27a)];

/** The sleeping town behind the tank. Each lit house is one "lamp" worth protecting. */
export class Town {
  constructor(terrain, cx, rng) {
    this.cx = cx;
    this.houses = [];
    const N = 9;
    for (let i = 0; i < N; i++) {
      const x = cx + (i - (N - 1) / 2) * 96 + rng.range(-10, 10);
      const wd = rng.range(58, 80), ht = rng.range(46, 72);
      this.houses.push({
        x, w: wd, h: ht, hp: 100, maxHp: 100, alive: true, wall: rng.pick(WALLS), roofH: rng.range(22, 34), flat: rng.chance(0.25),
        cols: Math.max(2, Math.floor(wd / 22)), seed: rng.next() * 100, winCol: rng.pick(WIN_COLS), hurt: 0, rubble: null, smolder: 0, chim: rng.chance(0.6),
      });
    }
  }
  get litCount() { return this.houses.reduce((n, h) => n + (h.alive ? 1 : 0), 0); }

  blast(w, x, y, R, dmg) {
    for (const h of this.houses) {
      if (!h.alive) continue;
      const gy = w.terrain.heightAt(h.x);
      const dx = Math.max(0, Math.abs(h.x - x) - h.w / 2);
      const dy = Math.max(0, y - (gy + h.h));
      const d = Math.hypot(dx, dy);
      if (d < R) {
        h.hp -= dmg * (1 - d / R) + 2;
        h.hurt = 1;
        w.fx.sparks(h.x, gy + h.h * 0.6, h.x - x, 40, 12, 400, [1, 0.7, 0.3]);
        if (h.hp <= 0) this.collapse(w, h);
      }
    }
  }

  collapse(w, h) {
    if (!h.alive) return;
    h.alive = false; h.smolder = 1;
    const T = w.terrain, fx = w.fx, gy = T.heightAt(h.x);
    fx.explosion(h.x, gy + h.h * 0.5, 1.15, { trauma: 0.18 });
    fx.debrisBurst(h.x, gy + h.h * 0.6, 30, 600, h.wall);
    fx.dust(h.x, gy, 40, h.w * 0.6, 260, [0.25, 0.18, 0.28]);
    fx.stop(7); fx.slow(0.35, 0.4);
    fx.text(h.x, gy + h.h + 60, '灯火熄灭', '#ff9aa8', 26, 1.6);
    w.sfx('lightsOut', h.x, {});
    w.lightsLost++;
    h.rubble = [];
    for (let i = 0; i < 9; i++) h.rubble.push({ ox: rr(-h.w * 0.5, h.w * 0.5), oy: rr(1, 14), hw: rr(5, 16), hh: rr(3, 8), rot: rr(-0.8, 0.8), c: Math.random() < 0.5 ? h.wall : C.rubble });
  }

  update(w, dt) {
    const fx = w.fx, T = w.terrain;
    for (const h of this.houses) {
      h.hurt = Math.max(0, h.hurt - dt * 3);
      if (h.alive && h.hp <= 0) this.collapse(w, h);
      if (h.alive && h.hp < h.maxHp * 0.5 && Math.random() < 0.15) fx.smoke(h.x + rr(-h.w / 3, h.w / 3), T.heightAt(h.x) + h.h, 0, 30, 10, 1.4, false, [0.15, 0.12, 0.2]);
      if (!h.alive) {
        h.smolder = Math.max(0, h.smolder - dt * 0.012);
        if (Math.random() < 0.35 * h.smolder * fx.k) {
          const gy = T.heightAt(h.x);
          fx.fire(h.x + rr(-h.w / 3, h.w / 3), gy + rr(4, 16), rr(-10, 10), 30, 10 + Math.random() * 8, 0.6);
          if (Math.random() < 0.3) fx.smoke(h.x + rr(-h.w / 3, h.w / 3), gy + 18, 0, 40, 14, 2.4, true, [0.1, 0.07, 0.12]);
        }
      }
    }
  }

  lights(w, out) {
    for (const h of this.houses) {
      const gy = w.terrain.heightAt(h.x);
      if (h.alive) {
        const flick = h.hurt > 0 ? 0.5 + 0.5 * Math.sin(w.time * 50) : 1;
        out.push({ x: h.x, y: gy + h.h * 0.55, z: 60, r: 220, col: [1.0, 0.62, 0.25], i: 2.0 * flick });
      } else if (h.smolder > 0.15) {
        out.push({ x: h.x, y: gy + 14, z: 30, r: 150, col: [1.0, 0.35, 0.1], i: 2.2 * h.smolder });
      }
    }
  }

  draw(w, L0, LA) {
    const cam = w.camera, T = w.terrain;
    for (const h of this.houses) {
      if (Math.abs(h.x - cam.x) > cam.halfW + 120) continue;
      const gy = T.heightAt(h.x - h.w * 0.3) * 0.5 + T.heightAt(h.x + h.w * 0.3) * 0.5;
      L0.blob(h.x, gy + 2, h.w * 0.62, 6, [0, 0, 0, 0.5], 9);
      if (!h.alive) {
        for (const p of h.rubble) L0.rbox(h.x + p.ox, gy + p.oy, p.hw, p.hh, p.rot, 2, p.c, 3, 0, 1);
        if (h.smolder > 0.1) LA.glow(h.x, gy + 8, h.w * 0.5, 6, 0, 0, SH.ELL, 10, [1, 0.35, 0.1, 1], 0.8 * h.smolder);
        continue;
      }
      const hurtF = h.hurt * 0.5;
      // body
      L0.rbox(h.x, gy + h.h / 2, h.w / 2, h.h / 2, 0, 3, h.wall, 6, 0, 1, hurtF);
      // roof
      if (h.flat) L0.rbox(h.x, gy + h.h + 4, h.w / 2 + 4, 5, 0, 2, C.roof, 3, 0, 1, hurtF);
      else L0.tri(h.x, gy + h.h + h.roofH / 2 - 1, h.w / 2 + 7, h.roofH / 2, 0, 2, C.roof, 0, 5, 0, 1, hurtF);
      if (h.chim) L0.rbox(h.x + h.w * 0.22, gy + h.h + h.roofH * 0.62, 5, 11, 0, 1.5, C.roof2, 3, 0, 1, hurtF);
      // windows (warm light spills into bloom)
      const rows = h.h > 58 ? 2 : 1;
      const flick = h.hurt > 0 ? (Math.sin(w.time * 50) > 0 ? 1 : 0.2) : 0.92 + 0.08 * Math.sin(w.time * 2.1 + h.seed);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < h.cols; c++) {
          const wx = h.x - h.w / 2 + (c + 0.5) * (h.w / h.cols);
          const wy = gy + h.h * (rows === 2 ? 0.34 + r * 0.38 : 0.58);
          const on = ((c * 7 + r * 3 + Math.floor(h.seed)) % 5) !== 0 || r === 0;
          if (!on) { L0.rbox(wx, wy, 4.6, 5.8, 0, 1, C.hullTrim, 1.5, 0, 1); continue; }
          L0.rbox(wx, wy, 4.8, 6, 0, 1, h.winCol, 2, 1.7 * flick, 1);
          LA.glow(wx, wy, 5.5, 7, 0, 1, SH.RBOX, 8, h.winCol, 0.26 * flick);
        }
      }
      // door + step light
      L0.rbox(h.x + h.w * 0.0, gy + 10, 5, 10, 0, 1.5, C.roof, 2, 0, 1);
      LA.glow(h.x, gy + 5, h.w * 0.55, 2.5, 0, 0, SH.ELL, 9, h.winCol, 0.14 * flick);
      // street lamp
      const lx = h.x + h.w / 2 + 13;
      const lgy = T.heightAt(lx);
      L0.rbox(lx, lgy + 20, 1.5, 20, 0, 1, C.pylon, 1.2, 0, 0);
      L0.rbox(lx - 3, lgy + 41, 5, 1.2, 0, 1, C.pylon, 1, 0, 0);
      LA.glowDot(lx - 6, lgy + 40, 2.4, 6, [0.55, 0.9, 1, 1], 1.7);
      LA.glow(lx - 6, lgy + 8, 14, 3, 0, 0, SH.ELL, 10, [0.4, 0.8, 1, 1], 0.1);
    }
  }
}

// ---------------------------------------------------------------------------------------------
export class Props {
  constructor(terrain, townX, rng) {
    this.list = [];
    const W = terrain.W;
    let x = 120;
    while (x < W - 100) {
      x += rng.range(90, 230);
      if (Math.abs(x - townX) < 520) continue;
      const r = rng.next();
      const type = r < 0.28 ? 'rock' : r < 0.45 ? 'pylon' : r < 0.6 ? 'tree' : r < 0.74 ? 'wall' : r < 0.88 ? 'wreck' : 'trap';
      this.list.push({ type, x, s: rng.range(0.8, 1.35), seed: rng.next() * 50, back: rng.chance(0.45) });
    }
  }
  draw(w, L0, LA, back) {
    const cam = w.camera, T = w.terrain;
    for (const p of this.list) {
      if (p.back !== back) continue;
      if (Math.abs(p.x - cam.x) > cam.halfW + 150) continue;
      const gy = T.heightAt(p.x) - (back ? 0 : 0);
      const dark = back ? 0.62 : 1;
      const col = (c) => [c[0] * dark, c[1] * dark, c[2] * dark, 1];
      const s = p.s * (back ? 0.85 : 1);
      if (p.type === 'rock') {
        L0.blob(p.x, gy + 2, 28 * s, 5, [0, 0, 0, 0.45], 8);
        L0.ell(p.x, gy + 12 * s, 24 * s, 15 * s, 0.05, col(C.rock), 9 * s, 0, 1);
        L0.ell(p.x + 16 * s, gy + 7 * s, 13 * s, 9 * s, -0.2, col(C.rockLight), 6 * s, 0, 1);
      } else if (p.type === 'pylon') {
        const h = 120 * s;
        L0.rbox(p.x - 8 * s, gy + h / 2, 2.4 * s, h / 2 + 2, 0.07, 1, col(C.pylon), 1.5, 0, 0);
        L0.rbox(p.x + 8 * s, gy + h / 2, 2.4 * s, h / 2 + 2, -0.07, 1, col(C.pylon), 1.5, 0, 0);
        for (let i = 1; i < 5; i++) L0.rbox(p.x, gy + i * h / 5, 8 * (1 - i * 0.12) * s, 1.3, 0, 0.6, col(C.pylon), 1.2, 0, 0);
        L0.rbox(p.x, gy + h, 22 * s, 2.2, 0, 1, col(C.pylon), 1.5, 0, 0);
        const blink = (Math.floor(w.time * 0.9 + p.seed) % 2) ? 1 : 0.12;
        LA.glowDot(p.x, gy + h + 5, 2.5, 10, C.red, 3.4 * blink);
        LA.glowDot(p.x - 20 * s, gy + h, 1.8, 6, C.cyan, 1.2);
      } else if (p.type === 'tree') {
        const h = 70 * s;
        L0.rbox(p.x, gy + h / 2, 3.2 * s, h / 2, 0.04, 1.5, col(C.pylon), 2, 0, 1);
        L0.rbox(p.x + 12 * s, gy + h * 0.72, 2 * s, 18 * s, -0.9, 1, col(C.pylon), 1.5, 0, 1);
        L0.rbox(p.x - 11 * s, gy + h * 0.6, 1.8 * s, 15 * s, 0.9, 1, col(C.pylon), 1.5, 0, 1);
        L0.rbox(p.x + 18 * s, gy + h * 0.95, 1.4 * s, 11 * s, -0.4, 1, col(C.pylon), 1.2, 0, 1);
      } else if (p.type === 'wall') {
        L0.blob(p.x, gy + 2, 40 * s, 5, [0, 0, 0, 0.45], 8);
        L0.rbox(p.x, gy + 22 * s, 30 * s, 22 * s, 0, 2, col(C.wall2), 5, 0, 1);
        L0.rbox(p.x - 12 * s, gy + 46 * s, 9 * s, 8 * s, 0.1, 2, col(C.wall2), 4, 0, 1);
        L0.rbox(p.x + 18 * s, gy + 40 * s, 7 * s, 4 * s, -0.2, 2, col(C.wall), 3, 0, 1);
        L0.rbox(p.x + 2 * s, gy + 18 * s, 6 * s, 9 * s, 0, 1, [0.02, 0.01, 0.04, 1], 2, 0, 1);
        LA.glow(p.x + 2 * s, gy + 18 * s, 8, 10, 0, 1, SH.RBOX, 12, C.magenta, 0.28);
      } else if (p.type === 'wreck') {
        L0.blob(p.x, gy + 2, 38 * s, 5, [0, 0, 0, 0.45], 8);
        L0.rbox(p.x, gy + 12 * s, 30 * s, 8 * s, 0.05, 4, col(C.metalRust), 4, 0, 0);
        L0.rbox(p.x - 4 * s, gy + 22 * s, 17 * s, 7 * s, 0.05, 4, col(C.metalRust), 4, 0, 0);
        L0.circle(p.x - 18 * s, gy + 8 * s, 8 * s, col(C.track), 3, 0, 0);
        L0.circle(p.x + 18 * s, gy + 8 * s, 8 * s, col(C.track), 3, 0, 0);
        LA.glowDot(p.x + 26 * s, gy + 14 * s, 2, 8, C.magenta, 1.6);
      } else {
        for (const r of [0.7, -0.7, 1.57]) L0.rbox(p.x, gy + 16 * s, 3 * s, 20 * s, r, 1, col(C.pylon), 2, 0, 0);
      }
    }
  }
}
