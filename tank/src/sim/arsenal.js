import { C } from '../data/palette.js';
import { SH } from '../gfx/shapes.js';
import { damageEnemy, splash } from './combat.js';
import { solveBallistic, WIND_ACC, fireMissiles } from './weapons.js';

const rr = (a, b) => a + (b - a) * Math.random();
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------
function hsv(h, s = 1, v = 1) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
}
const live = (w) => w.enemies.filter((e) => e.state !== 'dying');
function nearest(w, x, y, range, skip) {
  let best = null, bd = range;
  for (const e of w.enemies) {
    if (e.state === 'dying' || (skip && skip.has(e.id))) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
/** densest group of aircraft near (x,y); bombers weigh double. returns {x,y,n,score} or null */
function cluster(w, x, y, range, rad) {
  let best = null;
  for (const e of w.enemies) {
    if (e.state === 'dying' || Math.hypot(e.x - x, e.y - y) > range) continue;
    let sc = e.kind === 'bomber' ? 2 : 1, cx = e.x * sc, cy = e.y * sc, wt = sc, n = 1;
    for (const o of w.enemies) {
      if (o === e || o.state === 'dying') continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) < rad) { const k = o.kind === 'bomber' ? 2 : 1; cx += o.x * k; cy += o.y * k; wt += k; n++; sc += k; }
    }
    if (!best || sc > best.score) best = { x: cx / wt, y: cy / wt, n, score: sc };
  }
  return best;
}
function shove(e, dx, dy) {
  e.x += dx; e.y += dy;
  if (e.y0 !== undefined) e.y0 += dy;
  if (e.tgtY !== undefined) e.tgtY += dy;
}
function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy + 1e-6;
  let t = ((px - x0) * dx + (py - y0) * dy) / l2; t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t)), t };
}
function jagged(ax, ay, bx, by, levels, amp = 0.28) {
  let pts = [[ax, ay], [bx, by]];
  for (let lv = 0; lv < levels; lv++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, len = Math.hypot(x1 - x0, y1 - y0) + 1e-6;
      const nx = -(y1 - y0) / len, ny = (x1 - x0) / len, off = (Math.random() - 0.5) * len * amp * 2;
      out.push([mx + nx * off, my + ny * off], pts[i + 1]);
    }
    pts = out;
  }
  return pts;
}
function buildBolt(pts) {
  const main = [], branches = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = jagged(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 4, 0.22);
    main.push(seg);
    for (let k = 3; k < seg.length - 3; k += 3) {
      if (Math.random() < 0.3) {
        const a = seg[k], dir = Math.atan2(seg[k + 2][1] - a[1], seg[k + 2][0] - a[0]) + (Math.random() < 0.5 ? -1 : 1) * rr(0.5, 0.9);
        const L = rr(25, 70);
        branches.push(jagged(a[0], a[1], a[0] + Math.cos(dir) * L, a[1] + Math.sin(dir) * L, 2, 0.25));
      }
    }
  }
  return { main, branches };
}
function polyDraw(LA, poly, thick, soft, col, inten) {
  for (let i = 0; i < poly.length - 1; i++) LA.glowLine(poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1], thick, soft, col, inten);
}

// ---------------------------------------------------------------------------------------------
// weapon definitions
// ---------------------------------------------------------------------------------------------
export const DEFS = {
  cannon: {
    name: '高射炮', glyph: '炮', col: [1, 0.72, 0.3], max: 5, passive: true,
    desc: '按住蓄力、三档空爆。强化：伤害与装填速度',
    stat: (lv) => `伤害 +${(lv - 1) * 18}% · 装填 +${(lv - 1) * 8}%`,
  },
  mg: {
    name: '同轴机枪', glyph: '枪', col: [1, 0.9, 0.4], max: 5, passive: true,
    desc: '压制近身的侦察机与俯冲机。强化：伤害与过热余量',
    stat: (lv) => `伤害 +${(lv - 1) * 22}% · 散热 +${(lv - 1) * 8}%`,
  },
  missiles: {
    name: '蜂群导弹', glyph: '弹', col: [1, 0.3, 0.75], max: 5,
    desc: '齐射追踪导弹，自动锁定最危险的目标',
    stat: (lv) => `${3 + lv} 发 · 伤害 ${Math.round(80 * (1 + 0.15 * (lv - 1)))}`,
    init(s) { s.cd = 1.5; },
    update(w, s, dt, rate) {
      s.cd -= dt * rate;
      if (s.cd > 0 || !w.enemies.some((e) => e.state !== 'dying')) return;
      s.cd = 7.5 - 0.5 * s.lv;
      fireMissiles(w, w.tank, 3 + s.lv, 80 * (1 + 0.15 * (s.lv - 1)), 66 + 4 * s.lv);
    },
  },

  // ---- 特斯拉电弧 ----------------------------------------------------------------------------
  tesla: {
    name: '特斯拉电弧', glyph: '电', col: [0.45, 0.85, 1], max: 5,
    desc: '电弧在敌机之间连锁跳跃，并使其短暂麻痹',
    stat: (lv) => `${3 + lv} 次连锁 · 伤害 ${Math.round(24 * (1 + 0.22 * (lv - 1)))} · 间隔 ${(1.75 - 0.17 * lv).toFixed(1)}s`,
    init(s) { s.cd = 1.2; s.bolts = []; s.charge = 0; },
    update(w, s, dt, rate) {
      s.cd -= dt * rate;
      for (const b of s.bolts) { b.age += dt; b.regen -= dt; if (b.regen <= 0) { b.regen = 0.045; b.poly = buildBolt(b.pts); } }
      s.bolts = s.bolts.filter((b) => b.age < b.life);
      const t = w.tank, from = t.T(-26, 74);
      s.charge = Math.max(0, 1 - s.cd / 0.6);
      if (s.cd > 0) return;
      const first = nearest(w, from.x, from.y, 540 + 40 * s.lv);
      if (!first) { s.cd = 0.15; return; }
      s.cd = 1.75 - 0.17 * s.lv;
      const hit = new Set([first.id]), chain = [first];
      let cur = first;
      for (let j = 0; j < 2 + s.lv; j++) {
        const nx = nearest(w, cur.x, cur.y, 260 + 25 * s.lv, hit);
        if (!nx) break;
        hit.add(nx.id); chain.push(nx); cur = nx;
      }
      const pts = [[from.x, from.y]];
      const dmg0 = 24 * (1 + 0.22 * (s.lv - 1));
      chain.forEach((e, j) => {
        pts.push([e.x, e.y]);
        damageEnemy(w, e, dmg0 * Math.pow(0.88, j), e.x, e.y, { stop: 0, sparks: 14, color: [0.5, 0.85, 1] });
        e.stun = 0.8;
        w.fx.glow(e.x, e.y, 22, 0.14, [0.5, 0.85, 1], 1.5);
        w.fx.light(e.x, e.y, 40, 190, [0.4, 0.8, 1], 2.6, 0.2);
      });
      s.bolts.push({ pts, age: 0, life: 0.34, regen: 0, poly: buildBolt(pts) });
      w.fx.addTrauma(0.05 + 0.01 * chain.length);
      w.fx.glow(from.x, from.y, 20, 0.12, [0.5, 0.85, 1], 1.8);
      w.fx.pulse(0.01, 0.0025);
      w.sfx('zap', first.x, { n: chain.length });
    },
    draw(w, s, L0, L1, LA) {
      const t = w.tank;
      if (!t.dead) {
        // tesla coil on the rear deck
        const base = t.T(-27, 46);
        const col = [0.4, 0.5, 0.75, 1];
        const rot = t.ang;
        L0.rbox(base.x, base.y, 7, 3, rot, 1.5, C.hullDark, 2, 0, 0);
        for (let i = 0; i < 3; i++) { const p = t.T(-27, 51 + i * 6); L0.rbox(p.x, p.y, 5 - i, 3.4, rot, 1.4, i % 2 ? C.hullLight : C.steel, 1.8, 0, 0); }
        const top = t.T(-27, 72);
        L0.circle(top.x, top.y, 5.2, [0.12, 0.2, 0.3, 1], 3, 0.0, 2);
        const k = 0.5 + 0.5 * s.charge;
        LA.glowDot(top.x, top.y, 4, 14, [0.4, 0.85, 1, 1], 1.8 + 3.2 * s.charge);
        if (s.charge > 0.2 || Math.random() < 0.04) {
          for (let i = 0; i < 2; i++) {
            const a = rr(0, TAU), L = rr(14, 30) * k;
            const seg = jagged(top.x, top.y, top.x + Math.cos(a) * L, top.y + Math.sin(a) * L, 2, 0.3);
            polyDraw(LA, seg, 0.7, 2.5, [0.7, 0.95, 1, 1], 2.2 * k);
          }
        }
      }
      for (const b of s.bolts) {
        const f = 1 - b.age / b.life, fl = 0.65 + 0.35 * Math.random();
        for (const m of b.poly.main) {
          polyDraw(LA, m, 2.2, 6, [0.2, 0.6, 1, 1], 0.7 * f * fl);
          polyDraw(LA, m, 0.8, 2.2, [0.85, 1, 1, 1], 3.0 * f * fl);
        }
        for (const br of b.poly.branches) polyDraw(LA, br, 0.6, 2.2, [0.5, 0.85, 1, 1], 1.3 * f * fl);
      }
    },
  },

  // ---- 磁轨炮 --------------------------------------------------------------------------------
  rail: {
    name: '磁轨炮', glyph: '轨', col: [0.75, 0.9, 1], max: 5,
    desc: '蓄力后发射贯穿整条直线的光束，击穿线上所有敌机',
    stat: (lv) => `伤害 ${95 + 30 * (lv - 1)} · 间隔 ${(7.4 - 0.7 * lv).toFixed(1)}s`,
    init(s) { s.cd = 3; s.state = 'idle'; s.ct = 0; s.ang = 0; s.beams = []; },
    muzzle(w) { return w.tank.T(12, 64); },
    update(w, s, dt, rate) {
      const t = w.tank;
      for (const b of s.beams) b.age += dt;
      s.beams = s.beams.filter((b) => b.age < b.life);
      if (s.state === 'idle') {
        s.cd -= dt * rate;
        if (s.cd > 0) return;
        const from = this.muzzle(w);
        let best = null, bw = 0;
        for (const e of w.enemies) {
          if (e.state === 'dying') continue;
          const ang = Math.atan2(e.y - from.y, e.x - from.x);
          if (Math.hypot(e.x - from.x, e.y - from.y) > 1500) continue;
          let wt = 0;
          for (const o of w.enemies) {
            if (o.state === 'dying') continue;
            const { d, t: tt } = segDist(o.x, o.y, from.x, from.y, from.x + Math.cos(ang) * 2400, from.y + Math.sin(ang) * 2400);
            if (d < o.r + 14 && tt > 0) wt += o.kind === 'bomber' ? 2 : 1;
          }
          if (wt > bw) { bw = wt; best = e; }
        }
        if (!best) { s.cd = 0.2; return; }
        s.state = 'charge'; s.ct = 0; s.target = best; s.ang = Math.atan2(best.y - from.y, best.x - from.x);
        w.sfx('railCharge', t.x, {});
      } else {
        const from = this.muzzle(w);
        s.ct += dt;
        if (s.target && s.target.state !== 'dying') {
          const want = Math.atan2(s.target.y + s.target.vy * 0.25 - from.y, s.target.x + s.target.vx * 0.25 - from.x);
          let d = want - s.ang; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
          s.ang += d * Math.min(1, dt * 9);
        }
        // charge: sparks funnelling into the barrel
        if (Math.random() < 0.8) {
          const a = rr(0, TAU), r = rr(30, 70);
          w.fx.ember(from.x + Math.cos(a) * r, from.y + Math.sin(a) * r, -Math.cos(a) * r / 0.2, -Math.sin(a) * r / 0.2, 2.4, 0.2, [0.6, 0.9, 1]);
        }
        if (s.ct >= 0.8 - 0.07 * s.lv) this.fire(w, s, from);
      }
    },
    fire(w, s, from) {
      const t = w.tank, T = w.terrain, fx = w.fx;
      s.state = 'idle'; s.cd = 7.4 - 0.7 * s.lv;
      const dx = Math.cos(s.ang), dy = Math.sin(s.ang);
      let L = 2400, hitGround = false;
      for (let d = 30; d < 2400; d += 18) {
        const x = from.x + dx * d, y = from.y + dy * d;
        if (x < 0 || x > T.W) { L = d; break; }
        if (y < T.heightAt(x)) { L = d; hitGround = true; break; }
      }
      const x1 = from.x + dx * L, y1 = from.y + dy * L;
      const dmg = 95 + 30 * (s.lv - 1);
      let hits = 0;
      for (const e of w.enemies) {
        if (e.state === 'dying') continue;
        const { d, t: tt } = segDist(e.x, e.y, from.x, from.y, x1, y1);
        if (d < e.r + 10 && tt >= 0) { hits++; damageEnemy(w, e, dmg, e.x, e.y, { stop: 0, sparks: 24, color: [0.7, 0.95, 1] }); e.stun = 1.2; fx.glow(e.x, e.y, 30, 0.16, [0.7, 0.95, 1], 1.8); }
      }
      s.beams.push({ x0: from.x, y0: from.y, x1, y1, ang: s.ang, age: 0, life: 0.6 });
      // refraction streaks along the path + sparks
      for (let i = 1; i <= 4; i++) fx.shock(from.x + dx * L * i / 5, from.y + dy * L * i / 5, 110, 0.02, 0.5);
      const n = Math.min(70, Math.floor(L / 30));
      for (let i = 0; i < n; i++) {
        const d = (i + Math.random()) * L / n, px = from.x + dx * d, py = from.y + dy * d, a = s.ang + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1) + rr(-0.5, 0.5);
        fx.P.emit(px, py, Math.cos(a) * rr(80, 420), Math.sin(a) * rr(80, 420), rr(0.3, 0.9), rr(1.8, 2.8), 0, 0.5, 0.85, 1.0);
      }
      fx.glow(from.x + dx * 20, from.y + dy * 20, 60, 0.14, [0.6, 0.9, 1], 1.8, SH.RBOX, s.ang, 10);
      fx.ring(from.x, from.y, 8, 130, 3, 0.3, [0.5, 0.85, 1], 1.4);
      fx.light(from.x, from.y, 60, 380, [0.5, 0.85, 1], 5, 0.25);
      if (hitGround) { fx.explosion(x1, y1 + 4, 0.9, { plasma: true }); T.crater(x1, 28, 14); fx.dust(x1, y1, 30, 40, 260); }
      fx.addTrauma(0.5); fx.stop(5 + Math.min(4, hits)); fx.slow(0.22, 0.3); fx.pulse(0.05, 0.006, 0.02);
      fx.zoomPunch = Math.max(fx.zoomPunch, 0.5);
      t.vx -= Math.cos(s.ang) * 170; t.recoil = Math.max(t.recoil, 9);
      w.sfx('rail', t.x, {});
    },
    draw(w, s, L0, L1, LA) {
      const from = this.muzzle(w);
      if (s.state === 'charge') {
        const k = Math.min(1, s.ct / (0.8 - 0.07 * s.lv));
        const dx = Math.cos(s.ang), dy = Math.sin(s.ang);
        const fl = 0.6 + 0.4 * Math.sin(w.time * 70);
        LA.glowLine(from.x, from.y, from.x + dx * 1900, from.y + dy * 1900, 0.5 + k, 3, [0.5, 0.9, 1, 1], (0.25 + 0.9 * k) * fl);
        LA.glowDot(from.x, from.y, 4 + k * 8, 10 + k * 18, [0.7, 0.95, 1, 1], 1.5 + 5 * k);
        LA.push(from.x, from.y, 20 * (1.3 - 0.7 * k), 1.5, 0, 0, SH.RING, 3, 0.6, 0.9, 1, 1, 2 + 3 * k, 3, 0, 0);
      }
      for (const b of s.beams) {
        const k = b.age / b.life, f = Math.pow(1 - k, 1.4), th = 4.5 * Math.pow(1 - k, 0.6) + 0.5;
        const nx = -Math.sin(b.ang), ny = Math.cos(b.ang), sp = 2 + 12 * k;
        LA.glowLine(b.x0, b.y0, b.x1, b.y1, th * 1.8, 12, [0.25, 0.65, 1, 1], 0.7 * f);
        LA.glowLine(b.x0 + nx * sp, b.y0 + ny * sp, b.x1 + nx * sp, b.y1 + ny * sp, th * 0.55, 6, [1, 0.2, 0.7, 1], 1.0 * f);
        LA.glowLine(b.x0 - nx * sp, b.y0 - ny * sp, b.x1 - nx * sp, b.y1 - ny * sp, th * 0.55, 6, [1, 0.8, 0.2, 1], 0.8 * f);
        LA.glowLine(b.x0, b.y0, b.x1, b.y1, th * 0.6, 3, [1, 1, 1, 1], 4.5 * f);
        LA.glowDot(b.x1, b.y1, 10 * (1 - k), 22, [0.8, 0.95, 1, 1], 2.2 * f);
      }
    },
  },

  // ---- 引力奇点 ------------------------------------------------------------------------------
  gravity: {
    name: '引力奇点', glyph: '引', col: [0.7, 0.4, 1], max: 5,
    desc: '抛出微型黑洞，吸住飞机、炸弹与粒子，末尾坍缩爆炸',
    stat: (lv) => `半径 ${150 + 15 * lv} · 持续 ${(3.2 + 0.5 * lv).toFixed(1)}s · 坍缩 ${70 + 25 * lv}`,
    init(s) { s.cd = 4; s.orb = null; s.wells = []; s.uid = 0; },
    update(w, s, dt, rate) {
      const t = w.tank, fx = w.fx;
      s.cd -= dt * rate;
      if (s.cd <= 0 && !s.orb) {
        const c = cluster(w, t.x, t.y, 900, 220);
        if (c && (c.n >= 2 || w.enemies.some((e) => e.kind !== 'scout' && e.state !== 'dying'))) {
          const from = t.T(0, 62);
          s.orb = { x: from.x, y: from.y, tx: c.x, ty: Math.max(c.y, w.terrain.heightAt(c.x) + 90), t: 0 };
          s.cd = 10.5 - 0.8 * s.lv;
          w.sfx('gravityLaunch', t.x, {});
        } else s.cd = 0.4;
      }
      if (s.orb) {
        const o = s.orb;
        o.t += dt;
        const dx = o.tx - o.x, dy = o.ty - o.y, d = Math.hypot(dx, dy);
        const sp = 600 * dt;
        if (d <= sp + 8 || o.t > 2.4) {
          s.wells.push({ id: ++s.uid, x: o.tx, y: o.ty, r: 150 + 15 * s.lv, life: 3.2 + 0.5 * s.lv, age: 0, tick: 0.2, spin: 0 });
          fx.shock(o.tx, o.ty, 180, 0.03, 0.5); fx.ring(o.tx, o.ty, 8, 120, 4, 0.4, [0.7, 0.4, 1], 3);
          fx.glow(o.tx, o.ty, 40, 0.2, [0.8, 0.6, 1], 4);
          w.sfx('gravityOpen', o.tx, {});
          s.orb = null;
        } else {
          o.x += dx / d * sp; o.y += dy / d * sp;
          fx.ember(o.x, o.y, rr(-40, 40), rr(-40, 40), 3, 0.5, [0.7, 0.4, 1]);
        }
      }
      for (let i = s.wells.length - 1; i >= 0; i--) {
        const g = s.wells[i];
        g.age += dt; g.spin += dt;
        const k = Math.min(1, g.age / 0.35) * Math.min(1, (g.life - g.age) / 0.3 + 0.3);
        fx.lens('well' + g.id, g.x, g.y, g.r * 0.62 * k, -0.04 * k);
        const R = g.r * 1.7;
        for (const e of w.enemies) {
          if (e.state === 'dying') continue;
          const dx = g.x - e.x, dy = g.y - e.y, d = Math.hypot(dx, dy);
          if (d < R) {
            const f = 1 - d / R, pull = (320 * f * f + 70 * f) * dt;
            shove(e, dx / (d + 1) * pull, dy / (d + 1) * pull);
            e.stun = Math.max(e.stun || 0, 0.15);
          }
        }
        for (const arr of [w.bombs, w.ebullets]) {
          for (let j = arr.length - 1; j >= 0; j--) {
            const b = arr[j], dx = g.x - b.x, dy = g.y - b.y, d = Math.hypot(dx, dy);
            if (d < R) { const f = 1 - d / R, pull = (520 * f + 120) * dt; b.x += dx / (d + 1) * pull; b.y += dy / (d + 1) * pull; }
            if (d < 24) { fx.explosion(b.x, b.y, 0.35, { debris: false }); arr.splice(j, 1); w.score += 20; }
          }
        }
        g.tick -= dt;
        if (g.tick <= 0) {
          g.tick += 0.25;
          for (const e of w.enemies) {
            if (e.state === 'dying') continue;
            if (Math.hypot(e.x - g.x, e.y - g.y) < g.r) damageEnemy(w, e, (16 + 7 * s.lv) * 0.25 * (Math.random() < 0.15 ? 3 : 1), e.x, e.y, { stop: 0, sparks: 3, color: [0.8, 0.5, 1], noOD: false });
          }
        }
        if (Math.random() < 0.3) w.sfx('gravityHum', g.x, {});
        if (g.age >= g.life) {
          fx.explosion(g.x, g.y, 1.6, { plasma: true });
          fx.shock(g.x, g.y, g.r * 2.2, 0.06, 0.7);
          fx.ring(g.x, g.y, 10, g.r * 1.5, 6, 0.6, [0.8, 0.5, 1], 4);
          fx.pulse(0.08, 0.006, 0.04); fx.slow(0.25, 0.35); fx.stop(5); fx.addTrauma(0.4);
          splash(w, g.x, g.y, g.r * 1.1, 70 + 25 * s.lv, { stop: 0 });
          w.sfx('explosion', g.x, { size: 1.6 });
          s.wells.splice(i, 1);
        }
      }
    },
    attractors(s, out) {
      let n = 0;
      for (const g of s.wells) { if (n >= 3) break; out.push(g.x, g.y, 2400, g.r * 2.6); n++; }
      return n;
    },
    draw(w, s, L0, L1, LA) {
      if (s.orb) {
        LA.glowDot(s.orb.x, s.orb.y, 5, 16, [0.7, 0.4, 1, 1], 3);
        L0.circle(s.orb.x, s.orb.y, 4.5, [0.02, 0, 0.04, 1], 2, 0, 1);
      }
      for (const g of s.wells) {
        const k = Math.min(1, g.age / 0.35) * Math.min(1, (g.life - g.age) / 0.3 + 0.3);
        const R = 34 * k;
        // spiralling infall
        for (let i = 0; i < 30; i++) {
          const u = i / 30, a = g.spin * (1.4 + 2.2 * (1 - u)) + u * 11, rad = g.r * 0.95 * Math.pow(1 - u * 0.97, 1.6) * k;
          LA.glowDot(g.x + Math.cos(a) * rad, g.y + Math.sin(a) * rad * 0.62, 2 * (1 - u * 0.5), 5, [0.55, 0.3, 1, 1], 0.3 + 0.9 * u);
        }
        // accretion disc (side-on ellipse), brighter on the approaching side
        for (let i = 0; i < 44; i++) {
          const a = i / 44 * TAU + g.spin * 3.2, rad = R * (1.15 + 0.35 * Math.sin(i * 1.7));
          const beam = 0.5 + 0.5 * Math.cos(a - 0.6), dx = Math.cos(a) * rad * 1.8, dy = Math.sin(a) * rad * 0.34;
          if (Math.hypot(dx, dy * 1.6) < R * 0.78) continue; // keep the event horizon visibly black
          LA.glowDot(g.x + dx, g.y + dy, 2.2, 5, [1, 0.45 + 0.4 * beam, 0.15 + 0.6 * beam, 1], 0.45 + 1.5 * beam * beam);
        }
        L0.circle(g.x, g.y, R * 0.62, [0, 0, 0, 1], 2, 0, 1);
        LA.push(g.x, g.y, R * 0.68, 1.2, 0, 0, SH.RING, 2.2, 1, 0.7, 0.85, 1, 2.2 * k, 3, 0, 0);
        LA.push(g.x, g.y, g.r * 0.62 * k, 1.5, 0, 0, SH.RING, 5, 0.5, 0.35, 1, 1, 0.5 + 0.2 * Math.sin(g.spin * 6), 3, 0, 0);
        LA.glowDot(g.x, g.y, R * 1.0, 30, [0.5, 0.3, 1, 1], 0.25 * k);
      }
    },
  },

  // ---- 棱镜激光 ------------------------------------------------------------------------------
  prism: {
    name: '棱镜激光', glyph: '棱', col: [1, 0.5, 0.9], max: 5,
    desc: '多色光束编织缠绕，持续灼烧并贯穿沿线敌机',
    stat: (lv) => `${[3, 3, 5, 5, 7][lv - 1]} 束 · 灼烧 ${30 + 14 * lv}/s · 持续 ${(2 + 0.3 * lv).toFixed(1)}s`,
    init(s) { s.cd = 2; s.state = 'cool'; s.t = 0; s.target = null; s.tick = 0; },
    origin(w) { return w.tank.T(14, 72); },
    update(w, s, dt, rate) {
      const from = this.origin(w), fx = w.fx;
      if (s.state === 'cool') {
        s.cd -= dt * rate;
        if (s.cd <= 0) {
          const e = nearest(w, from.x, from.y, 520 + 40 * s.lv);
          if (e) { s.state = 'fire'; s.t = 0; s.target = e; s.tick = 0; w.sfx('laserOn', w.tank.x, {}); } else s.cd = 0.25;
        }
        return;
      }
      s.t += dt;
      if (!s.target || s.target.state === 'dying' || Math.hypot(s.target.x - from.x, s.target.y - from.y) > 700) s.target = nearest(w, from.x, from.y, 600 + 40 * s.lv);
      if (!s.target || s.t > 2 + 0.3 * s.lv) { s.state = 'cool'; s.cd = 4.2 - 0.3 * s.lv; s.target = null; return; }
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick += 0.1;
        const tg = s.target, dmg = (30 + 14 * s.lv) * 0.1;
        damageEnemy(w, tg, dmg, tg.x, tg.y, { stop: 0, sparks: 2, color: hsv(Math.random(), 0.7, 1), noOD: false });
        for (const e of w.enemies) {
          if (e === tg || e.state === 'dying') continue;
          if (segDist(e.x, e.y, from.x, from.y, tg.x, tg.y).d < e.r + 8) damageEnemy(w, e, dmg * 0.5, e.x, e.y, { stop: 0, sparks: 1, color: [1, 0.7, 1] });
        }
        if (Math.random() < 0.3) w.sfx('laserHit', tg.x, {});
      }
      const tg = s.target;
      for (let i = 0; i < 2; i++) { const c = hsv(Math.random(), 0.75, 1); fx.P.emit(tg.x, tg.y, rr(-260, 260), rr(-200, 300), rr(0.2, 0.55), rr(1.6, 2.6), 0, c[0], c[1], c[2]); }
      fx.light(tg.x, tg.y, 40, 170, [1, 0.8, 1], 1.5, 0.06);
    },
    draw(w, s, L0, L1, LA) {
      const from = this.origin(w), t = w.tank;
      if (!t.dead) {
        // crystal on the turret roof
        L0.rbox(from.x, from.y, 4.6, 6.6, t.ang + 0.78, 1.2, [0.55, 0.75, 1, 0.9], 2.5, 0.25, 2);
        L0.rbox(from.x, from.y, 3, 4.5, t.ang - 0.5, 1, [1, 0.6, 0.9, 0.7], 2, 0.4, 2);
        const on = s.state === 'fire' ? 1 : 0.25;
        LA.glowDot(from.x, from.y, 3, 14, [1, 0.8, 1, 1], 1 + 2.5 * on);
      }
      if (s.state !== 'fire' || !s.target) return;
      const tg = s.target, N = [3, 3, 5, 5, 7][s.lv - 1], tt = s.t;
      const ax = tg.x - from.x, ay = tg.y - from.y, L = Math.hypot(ax, ay) + 1, nx = -ay / L, ny = ax / L;
      const open = Math.min(1, tt / 0.18), close = Math.min(1, (2 + 0.3 * s.lv - tt) / 0.2 + 0.3);
      for (let i = 0; i < N; i++) {
        const ph = i / N * TAU, wv = Math.sin(tt * 6.5 + ph) * 20 * open;
        const ex = tg.x + nx * wv, ey = tg.y + ny * wv;
        const mid = 0.5 + 0.5 * Math.sin(tt * 3 + ph);
        // each colour beam bows outwards so the bundle visibly braids
        const bow = Math.sin(tt * 6.5 + ph + 1.2) * 34 * open * (1 - 0.0);
        const mx = (from.x + ex) / 2 + nx * bow, my = (from.y + ey) / 2 + ny * bow;
        const col = hsv(i / N + tt * 0.1, 1.0, 1);
        LA.glowLine(from.x, from.y, mx, my, 0.9, 2.6, col, 1.5 * close);
        LA.glowLine(mx, my, ex, ey, 0.9, 2.6, col, 1.5 * close);
      }
      LA.glowLine(from.x, from.y, tg.x, tg.y, 0.5, 1.5, [1, 1, 1, 1], 0.4 * close);
      LA.glowDot(tg.x, tg.y, 7, 13, [1, 0.95, 1, 1], 1.5 * close);
      LA.push(tg.x, tg.y, 16 + 6 * Math.sin(tt * 20), 1.2, 0, 0, SH.RING, 2.5, 1, 0.85, 1, 1, 1.4 * close, 3, 0, 0);
      // lens flare at the prism
      const a = tt * 4;
      for (let i = 0; i < 3; i++) LA.glowLine(from.x + Math.cos(a + i * 1.05) * 18, from.y + Math.sin(a + i * 1.05) * 18, from.x - Math.cos(a + i * 1.05) * 18, from.y - Math.sin(a + i * 1.05) * 18, 0.7, 3, [1, 0.8, 1, 1], 1.0 * close);
    },
  },

  // ---- 烟花榴弹 ------------------------------------------------------------------------------
  firework: {
    name: '烟花榴弹', glyph: '花', col: [1, 0.85, 0.3], max: 5,
    desc: '空中绽放为圆环、螺旋、爱心或垂柳，每一颗星火都会造成伤害',
    stat: (lv) => `${14 + 3 * lv}+ 颗星 · 星伤 ${11 + 3 * lv} · 间隔 ${(3.5 - 0.3 * lv).toFixed(1)}s`,
    init(s) { s.cd = 2; s.shells = []; s.stars = []; },
    update(w, s, dt, rate) {
      const t = w.tank, fx = w.fx;
      s.cd -= dt * rate;
      if (s.cd <= 0) {
        const c = cluster(w, t.x, t.y, 1000, 240);
        if (c) {
          const from = t.T(-8, 58);
          const dx = Math.abs(c.x - from.x), dy = c.y - from.y;
          const sol = solveBallistic(dx, dy, 780, 430);
          const a = c.x >= from.x ? sol.th : Math.PI - sol.th;
          s.shells.push({ x: from.x, y: from.y, vx: Math.cos(a) * 780, vy: Math.sin(a) * 780, t: 0, fuse: sol.tof, pat: ['ring', 'dbl', 'spiral', 'heart', 'saturn', 'willow'][(Math.random() * 6) | 0], hue: Math.random() });
          s.cd = 3.5 - 0.3 * s.lv;
          fx.muzzle(from.x, from.y, a, 0.5);
          w.sfx('fwLaunch', t.x, {});
        } else s.cd = 0.4;
      }
      for (let i = s.shells.length - 1; i >= 0; i--) {
        const sh = s.shells[i];
        sh.t += dt; sh.vy -= 430 * dt; sh.vx += w.wind.v * WIND_ACC * dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt;
        fx.ember(sh.x, sh.y, rr(-30, 30), rr(-30, 30), 2.2, 0.45, [1, 0.8, 0.4]);
        if (sh.t >= sh.fuse || sh.y < w.terrain.heightAt(sh.x)) { this.burst(w, s, sh); s.shells.splice(i, 1); }
      }
      for (let i = s.stars.length - 1; i >= 0; i--) {
        const st = s.stars[i];
        st.life -= dt;
        const dr = Math.pow(st.drag, dt * 60);
        st.vx *= dr; st.vy = st.vy * dr - st.grav * dt; st.vx += w.wind.v * 20 * dt;
        st.x += st.vx * dt; st.y += st.vy * dt;
        fx.ember(st.x, st.y, rr(-12, 12), rr(-12, 12) - 10, 2.2, st.trail, st.col);
        let dead = st.life <= 0 || st.y < w.terrain.heightAt(st.x);
        if (!dead) for (const e of w.enemies) {
          if (e.state === 'dying') continue;
          if (Math.hypot(e.x - st.x, e.y - st.y) < e.r + 5) { damageEnemy(w, e, 11 + 3 * s.lv, st.x, st.y, { stop: 0, sparks: 6, color: st.col }); dead = true; break; }
        }
        if (dead) {
          for (let k = 0; k < 4; k++) fx.P.emit(st.x, st.y, rr(-140, 140), rr(-140, 140), rr(0.25, 0.6), 2, 0, st.col[0], st.col[1], st.col[2]);
          fx.glow(st.x, st.y, 10, 0.1, st.col, 2.2);
          s.stars.splice(i, 1);
        }
      }
    },
    burst(w, s, sh) {
      const fx = w.fx, N = 14 + 3 * s.lv, vel = [];
      const col = hsv(sh.hue, 0.8, 1), col2 = hsv(sh.hue + 0.5, 0.8, 1);
      let life = 1.1, grav = 40, drag = 0.985, trail = 0.45, cols = [col];
      if (sh.pat === 'ring') for (let i = 0; i < N; i++) { const a = i / N * TAU; vel.push([Math.cos(a) * 270, Math.sin(a) * 270, 0]); }
      else if (sh.pat === 'dbl') { for (let i = 0; i < N; i++) { const a = i / N * TAU; vel.push([Math.cos(a) * 175, Math.sin(a) * 175, 0], [Math.cos(a + 0.2) * 310, Math.sin(a + 0.2) * 310, 1]); } cols = [col, col2]; }
      else if (sh.pat === 'spiral') for (let i = 0; i < N + 8; i++) { const a = i * 0.62, sp = 70 + i * 11; vel.push([Math.cos(a) * sp, Math.sin(a) * sp, 0]); }
      else if (sh.pat === 'heart') for (let i = 0; i < N + 12; i++) {
        const u = i / (N + 12) * TAU, hx = 16 * Math.pow(Math.sin(u), 3), hy = 13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u);
        vel.push([hx * 13, hy * 13 + 20, 0]);
      } else if (sh.pat === 'saturn') {
        for (let i = 0; i < N + 6; i++) { const a = i / (N + 6) * TAU; vel.push([Math.cos(a) * 330, Math.sin(a) * 55, 0]); }
        for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; vel.push([Math.cos(a) * 120, Math.sin(a) * 120, 1]); }
        cols = [col, col2];
      } else {
        for (let i = 0; i < N + 8; i++) { const a = rr(0, TAU), sp = rr(90, 270); vel.push([Math.cos(a) * sp, Math.sin(a) * sp + 60, 0]); }
        life = 2.0; grav = 230; drag = 0.99; trail = 0.8; cols = [[1, 0.78, 0.3]];
      }
      for (const v of vel) s.stars.push({ x: sh.x, y: sh.y, vx: v[0], vy: v[1], life: life * rr(0.9, 1.1), grav, drag, trail, col: cols[v[2] % cols.length] || col });
      fx.glow(sh.x, sh.y, 70, 0.22, col, 5);
      fx.ring(sh.x, sh.y, 6, 140, 3, 0.4, col, 2.4);
      fx.light(sh.x, sh.y, 70, 360, col, 7, 0.5);
      fx.shock(sh.x, sh.y, 120, 0.014, 0.35);
      fx.addTrauma(0.1); fx.pulse(0.02, 0.0015);
      w.sfx('fwPop', sh.x, {});
    },
    draw(w, s, L0, L1, LA) {
      for (const sh of s.shells) LA.glowDot(sh.x, sh.y, 3.5, 9, [1, 0.9, 0.6, 1], 3.5);
      for (const st of s.stars) LA.glowDot(st.x, st.y, 2.8, 7, st.col, 2.6 * Math.min(1, st.life * 3));
    },
  },

  // ---- 蜂群无人机 ----------------------------------------------------------------------------
  drones: {
    name: '蜂群无人机', glyph: '机', col: [0.4, 1, 0.7], max: 5,
    desc: '无人机群环绕坦克，自动出击扫射并撞击敌机',
    stat: (lv) => `${2 + lv} 架 · 撞击 ${14 + 4 * lv} · 扫射 ${(3.2 * (1 + 0.2 * (lv - 1))).toFixed(1)}`,
    init(s) { s.list = []; s.n = 0; },
    update(w, s, dt, rate) {
      const t = w.tank, fx = w.fx;
      while (s.list.length < 2 + s.lv) {
        const i = s.list.length;
        s.list.push({ x: t.x, y: t.y + 90, vx: 0, vy: 0, a: i * 1.7, mode: 'orbit', tg: null, cd: rr(0.3, 1.2), shots: 0, shotCd: 0, trail: [], trT: 0, hue: i * 0.19, i });
      }
      for (const d of s.list) {
        d.a += dt * (1.3 + (d.i % 3) * 0.2);
        const ox = t.x + Math.cos(d.a) * (100 + (d.i % 4) * 14), oy = t.y + 105 + Math.sin(d.a * 1.4) * 38 + (d.i % 2) * 20;
        if (d.mode === 'orbit') {
          d.vx += ((ox - d.x) * 9 - d.vx * 3.2) * dt; d.vy += ((oy - d.y) * 9 - d.vy * 3.2) * dt;
          d.cd -= dt * rate;
          if (d.cd <= 0) {
            const claimed = new Set(s.list.filter((o) => o.mode === 'attack' && o.tg).map((o) => o.tg.id));
            const tg = nearest(w, t.x, t.y, 760, claimed) || nearest(w, t.x, t.y, 760);
            if (tg) { d.mode = 'attack'; d.tg = tg; d.shots = 5; d.shotCd = 0; d.phase = rr(0, TAU); w.sfx('drone', d.x, {}); } else d.cd = 0.4;
          }
        } else if (d.mode === 'attack') {
          const tg = d.tg;
          if (!tg || tg.state === 'dying') { d.mode = 'return'; continue; }
          const dx = tg.x - d.x, dy = tg.y - d.y, dist = Math.hypot(dx, dy) + 1;
          const sw = Math.sin(w.time * 9 + d.phase) * 160;
          const wvx = dx / dist * 520 - dy / dist * sw, wvy = dy / dist * 520 + dx / dist * sw;
          d.vx += (wvx - d.vx) * Math.min(1, dt * 6); d.vy += (wvy - d.vy) * Math.min(1, dt * 6);
          d.shotCd -= dt;
          if (dist < 260 && d.shots > 0 && d.shotCd <= 0) {
            d.shotCd = 0.09; d.shots--;
            const a = Math.atan2(dy, dx) + rr(-0.05, 0.05);
            w.tracers.push({ x: d.x, y: d.y, vx: Math.cos(a) * 1300, vy: Math.sin(a) * 1300, life: 0.5, dmg: 3.2 * (1 + 0.2 * (s.lv - 1)) });
            fx.glow(d.x, d.y, 8, 0.05, [0.5, 1, 0.8], 3);
          }
          if (dist < tg.r + 10) {
            damageEnemy(w, tg, 14 + 4 * s.lv, d.x, d.y, { stop: 2, sparks: 16, color: hsv(d.hue, 0.6, 1) });
            fx.explosion(d.x, d.y, 0.3, { debris: false });
            d.mode = 'return'; d.vx *= -0.6; d.vy = Math.abs(d.vy) * 0.5 + 120;
          } else if (d.shots <= 0 && dist > 200) d.mode = 'return';
        } else {
          d.vx += ((ox - d.x) * 7 - d.vx * 2.6) * dt; d.vy += ((oy - d.y) * 7 - d.vy * 2.6) * dt;
          if (Math.hypot(ox - d.x, oy - d.y) < 50) { d.mode = 'orbit'; d.cd = rr(0.6, 1.6); }
        }
        d.x += d.vx * dt; d.y += d.vy * dt;
        d.y = Math.max(d.y, w.terrain.heightAt(d.x) + 20);
        d.trT -= dt;
        if (d.trT <= 0) { d.trT = 0.02; d.trail.push([d.x, d.y]); if (d.trail.length > 16) d.trail.shift(); }
      }
    },
    draw(w, s, L0, L1, LA) {
      for (const d of s.list) {
        const col = hsv(d.hue, 0.6, 1);
        for (let k = 0; k < d.trail.length - 1; k++) {
          const f = k / d.trail.length;
          LA.glowLine(d.trail[k][0], d.trail[k][1], d.trail[k + 1][0], d.trail[k + 1][1], 1 + f * 0.8, 4, col, 0.2 + 1.5 * f * f);
        }
        const rot = Math.max(-0.5, Math.min(0.5, d.vx * 0.0012));
        L0.rbox(d.x, d.y, 8, 3.6, rot, 3.4, [0.1, 0.16, 0.2, 1], 2.6, 0, 0);
        L0.ell(d.x, d.y + 2, 3, 2.4, 0, [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, 1], 2, 0.9, 2);
        const sp = w.time * 60 + d.i;
        LA.glow(d.x - 5, d.y + 4, 1.2, 6 * (0.7 + 0.3 * Math.sin(sp)), rot, 1.2, SH.ELL, 2, [0.8, 1, 1, 1], 0.4);
        LA.glow(d.x + 5, d.y + 4, 1.2, 6 * (0.7 + 0.3 * Math.cos(sp)), rot, 1.2, SH.ELL, 2, [0.8, 1, 1, 1], 0.4);
        LA.glowDot(d.x, d.y, 2, 7, col, 2.6);
      }
    },
  },

  // ---- 音爆脉冲 ------------------------------------------------------------------------------
  pulse: {
    name: '音爆脉冲', glyph: '波', col: [1, 0.6, 0.25], max: 5,
    desc: '感知威胁时释放冲击波：摧毁炸弹与子弹，震退并击伤敌机',
    stat: (lv) => `半径 ${430 + 35 * lv} · 伤害 ${26 + 8 * lv} · 间隔 ${(6.9 - 0.4 * lv).toFixed(1)}s`,
    init(s) { s.cd = 2; s.ring = null; },
    update(w, s, dt, rate) {
      const t = w.tank, fx = w.fx;
      s.cd -= dt * rate;
      const cy = t.y + 40;
      if (!s.ring && s.cd <= 0) {
        let danger = 0;
        for (const b of w.bombs) if (Math.hypot(b.x - t.x, b.y - cy) < 300) danger += 1;
        for (const b of w.ebullets) if (Math.hypot(b.x - t.x, b.y - cy) < 280) danger += 0.5;
        for (const e of w.enemies) if (e.state !== 'dying' && Math.hypot(e.x - t.x, e.y - cy) < 250) danger += 1;
        if (danger >= 1.5) {
          s.ring = { t: 0, dur: 0.5, R: 430 + 35 * s.lv, hit: new Set() };
          s.cd = 6.9 - 0.4 * s.lv;
          const R = s.ring.R;
          fx.shock(t.x, cy, R, 0.065, 0.6);
          fx.ring(t.x, cy, 14, R, 5, 0.5, [1, 0.6, 0.3], 1.8);
          fx.ring(t.x, cy, 6, R * 0.75, 3, 0.42, [0.4, 0.85, 1], 1.4);
          fx.dust(t.x, t.y, 70, R * 0.3, 520);
          fx.addTrauma(0.32); fx.pulse(0.05, 0.004, 0.02);
          w.sfx('pulse', t.x, {});
        } else s.cd = 0.25;
      }
      if (s.ring) {
        const r = s.ring; r.t += dt;
        const rad = r.R * (1 - Math.pow(1 - Math.min(1, r.t / r.dur), 2.2));
        for (const e of w.enemies) {
          if (e.state === 'dying' || r.hit.has(e.id)) continue;
          const d = Math.hypot(e.x - t.x, e.y - cy);
          if (d < rad + 20) { r.hit.add(e.id); damageEnemy(w, e, 26 + 8 * s.lv, e.x, e.y, { stop: 3, sparks: 18, color: [1, 0.7, 0.4] }); shove(e, Math.sign(e.x - t.x || 1) * 90, 30); e.stun = 1.0; fx.glow(e.x, e.y, 40, 0.15, [1, 0.8, 0.5], 3); }
        }
        for (const arr of [w.bombs, w.ebullets]) {
          for (let j = arr.length - 1; j >= 0; j--) {
            const b = arr[j];
            if (Math.hypot(b.x - t.x, b.y - cy) < rad + 20) { fx.explosion(b.x, b.y, 0.4, { debris: false }); fx.glow(b.x, b.y, 24, 0.12, [1, 0.8, 0.5], 2.5); arr.splice(j, 1); w.score += 25; w.kills += 0; }
          }
        }
        if (r.t >= r.dur) s.ring = null;
      }
    },
    draw(w, s, L0, L1, LA) {
      if (!s.ring) return;
      const t = w.tank, r = s.ring, k = r.t / r.dur, rad = r.R * (1 - Math.pow(1 - k, 2.2)), f = (1 - k) * (1 - k);
      LA.push(t.x, t.y + 40, rad, 4 * (1 - k * 0.6), 0, 0, SH.RING, 5, 1, 0.6, 0.3, 1, 1.0 * f, 3, 0, 0);
      LA.push(t.x, t.y + 40, rad * 0.8, 2, 0, 0, SH.RING, 4, 0.4, 0.85, 1, 1, 0.8 * f, 3, 0, 0);
    },
  },

  // ---- 轨道离子炮 ----------------------------------------------------------------------------
  ion: {
    name: '轨道离子炮', glyph: '离', col: [0.6, 0.85, 1], max: 5,
    desc: '锁定敌群后，一道光柱从天而降。3 级起光柱会横扫',
    stat: (lv) => `伤害 ${150 + 30 * lv} · 光柱半径 ${62 + 8 * lv} · 间隔 ${(16 - 1.2 * lv).toFixed(1)}s`,
    init(s) { s.cd = 5; s.mark = null; s.beam = null; },
    update(w, s, dt, rate) {
      const fx = w.fx, T = w.terrain;
      s.cd -= dt * rate;
      if (!s.mark && !s.beam && s.cd <= 0) {
        const c = cluster(w, w.camera.x, w.camera.y, w.camera.halfW * 1.1, 200);
        if (c && (c.n >= 2 || c.score >= 2)) { s.mark = { x: c.x, y: c.y, t: 0, delay: 1.25 }; s.cd = 16 - 1.2 * s.lv; w.sfx('ionMark', c.x, {}); } else s.cd = 0.4;
      }
      if (s.mark) {
        const m = s.mark; m.t += dt;
        // follow the densest group a little while locking on
        const c = cluster(w, m.x, m.y, 260, 200);
        if (c && m.t < m.delay * 0.7) { m.x += (c.x - m.x) * Math.min(1, dt * 3); m.y += (c.y - m.y) * Math.min(1, dt * 3); }
        if (m.t >= m.delay) {
          s.beam = { x: m.x, x0: m.x, age: 0, life: 0.75, r: 62 + 8 * s.lv, sweep: s.lv >= 3 ? 150 + 30 * (s.lv - 3) : 0, dir: Math.random() < 0.5 ? -1 : 1, hit: new Set(), struck: false };
          s.mark = null;
        }
      }
      if (s.beam) {
        const b = s.beam; b.age += dt;
        if (b.sweep) b.x = b.x0 + b.dir * b.sweep * (b.age / b.life - 0.3) * 1.6;
        const gy = T.heightAt(b.x);
        if (!b.struck) {
          b.struck = true;
          fx.explosion(b.x, gy + 6, 1.3, { plasma: true, trauma: 0.2 });
          fx.shock(b.x, gy + 30, 360, 0.06, 0.7);
          fx.ring(b.x, gy + 8, 12, 300, 5, 0.6, [0.5, 0.85, 1], 2.0);
          fx.dust(b.x, gy, 80, 90, 420);
          T.crater(b.x, 62, 28);
          fx.addTrauma(0.55); fx.stop(7); fx.slow(0.35, 0.3); fx.pulse(0.05, 0.007, 0.02); fx.zoomPunch = Math.max(fx.zoomPunch, 0.8);
          w.sfx('ion', b.x, {});
        }
        fx.light(b.x, gy + 100, 80, 560, [0.5, 0.8, 1], 4.5 * (1 - b.age / b.life), 0.1);
        for (const e of w.enemies) {
          if (e.state === 'dying' || b.hit.has(e.id)) continue;
          if (Math.abs(e.x - b.x) < b.r + e.r * 0.6) { b.hit.add(e.id); damageEnemy(w, e, 150 + 30 * s.lv, e.x, e.y, { stop: 5, sparks: 30, color: [0.7, 0.95, 1] }); e.stun = 1.5; }
        }
        if (Math.random() < 0.8) fx.P.emit(b.x + rr(-b.r, b.r), gy + 4, rr(-60, 60), rr(200, 700), rr(0.4, 1.0), rr(1.8, 2.8), 0, 0.6, 0.9, 1);
        if (b.age >= b.life) s.beam = null;
      }
    },
    draw(w, s, L0, L1, LA) {
      const cam = w.camera, T = w.terrain;
      if (s.mark) {
        const m = s.mark, k = m.t / m.delay, gy = T.heightAt(m.x);
        const blink = Math.sin(m.t * (10 + 30 * k)) > 0 ? 1 : 0.35;
        const R = 54 * (1.25 - 0.55 * k);
        LA.push(m.x, m.y, R, 1.6, 0, 0, SH.RING, 3, 0.6, 0.9, 1, 1, 2.2 * blink, 3, 0, 0);
        LA.push(m.x, m.y, R * 0.55, 1.2, 0, 0, SH.RING, 2, 1, 0.4, 0.7, 1, 1.8 * blink, 3, 0, 0);
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + m.t * 2; LA.glowLine(m.x + Math.cos(a) * R * 0.7, m.y + Math.sin(a) * R * 0.7, m.x + Math.cos(a) * R * 1.35, m.y + Math.sin(a) * R * 1.35, 1, 3, [0.7, 0.95, 1, 1], 2 * blink); }
        LA.glowLine(m.x, m.y - R, m.x, gy, 0.5, 3, [0.5, 0.85, 1, 1], 0.5 + 1.2 * k);
        LA.glow(m.x, gy + 3, 40 + 40 * k, 3, 0, 0, SH.ELL, 12, [0.5, 0.85, 1, 1], 0.6 + 1.6 * k);
      }
      if (s.beam) {
        const b = s.beam, k = b.age / b.life, gy = T.heightAt(b.x), top = cam.y + cam.halfH + 80;
        const grow = Math.min(1, b.age / 0.07), fade = Math.pow(Math.max(0, 1 - k), 1.2);
        const wv = b.r * grow * (0.35 + 0.65 * fade), mid = (top + gy) / 2, hh = (top - gy) / 2;
        LA.glow(b.x, mid, wv * 1.2, hh, 0, wv * 1.2, SH.RBOX, 16, [0.2, 0.55, 1, 1], 0.65 * fade);
        LA.glow(b.x, mid, wv * 0.5, hh, 0, wv * 0.5, SH.RBOX, 7, [0.6, 0.85, 1, 1], 1.5 * fade);
        LA.glow(b.x, mid, wv * 0.2, hh, 0, wv * 0.2, SH.RBOX, 3, [1, 1, 1, 1], 3.6 * fade);
        LA.glowDot(b.x, gy + 8, wv * 0.9, 24, [0.6, 0.88, 1, 1], 1.5 * fade);
        LA.glow(b.x, gy + 4, wv * 2, 5, 0, 0, SH.ELL, 12, [0.4, 0.8, 1, 1], 0.9 * fade);
      }
    },
  },

  // ---- 高射弹幕 ------------------------------------------------------------------------------
  barrage: {
    name: '高射弹幕', glyph: '幕', col: [1, 0.5, 0.25], max: 5,
    desc: '连发一串空爆弹，排成一堵火墙封锁航线',
    stat: (lv) => `${4 + lv} 发 · 间隔 ${(9.2 - 0.8 * lv).toFixed(1)}s`,
    init(s) { s.cd = 3; s.queue = []; },
    update(w, s, dt, rate) {
      const t = w.tank;
      s.cd -= dt * rate;
      if (s.cd <= 0 && !s.queue.length) {
        const c = cluster(w, t.x, t.y, 1050, 300);
        if (c) {
          const n = 4 + s.lv, sp = 95 + 5 * s.lv;
          for (let i = 0; i < n; i++) s.queue.push({ delay: i * 0.1, tx: c.x + (i - (n - 1) / 2) * sp, ty: c.y + rr(-22, 22) });
          s.cd = 9.2 - 0.8 * s.lv;
        } else s.cd = 0.4;
      }
      for (let i = s.queue.length - 1; i >= 0; i--) {
        const q = s.queue[i];
        q.delay -= dt * rate;
        if (q.delay > 0) continue;
        s.queue.splice(i, 1);
        const from = t.T(-4, 64);
        const sol = solveBallistic(Math.abs(q.tx - from.x), q.ty - from.y, 950, 430);
        const a = q.tx >= from.x ? sol.th : Math.PI - sol.th;
        w.shells.push({ x: from.x, y: from.y, vx: Math.cos(a) * 950, vy: Math.sin(a) * 950, tier: s.lv >= 4 ? 2 : 1, t: 0, fuse: sol.tof, od: false, tr: 0 });
        w.fx.muzzle(from.x, from.y, a, 0.55);
        w.fx.addTrauma(0.03);
        w.sfx('cannon', t.x, { tier: 0 });
      }
    },
  },
};

export const ORDER = ['cannon', 'mg', 'missiles', 'tesla', 'rail', 'gravity', 'prism', 'firework', 'drones', 'pulse', 'ion', 'barrage'];

// ---------------------------------------------------------------------------------------------
export class Arsenal {
  constructor(w) { this.w = w; this.list = []; this.by = {}; this.add('cannon'); this.add('mg'); }
  has(id) { return !!this.by[id]; }
  lv(id) { return this.by[id] ? this.by[id].lv : 0; }
  add(id) {
    const def = DEFS[id];
    if (!def) return null;
    let s = this.by[id];
    if (s) { s.lv = Math.min(def.max, s.lv + 1); return s; }
    s = { id, lv: 1, cd: 0 };
    if (def.init) def.init(s);
    this.by[id] = s; this.list.push(s);
    return s;
  }
  update(dt) {
    const w = this.w, rate = w.combo.odT > 0 ? 1.6 : 1;
    for (const s of this.list) { const d = DEFS[s.id]; if (d.update) d.update(w, s, dt, rate); }
    // gravity-well attractors for the GPU particles
    const arr = [];
    let n = 0;
    for (const s of this.list) { const d = DEFS[s.id]; if (d.attractors) n += d.attractors(s, arr); }
    w.attr.fill(0);
    for (let i = 0; i < arr.length && i < 16; i++) w.attr[i] = arr[i];
    w.attrCount = Math.min(4, n);
  }
  draw(L0, L1, LA) {
    for (const s of this.list) { const d = DEFS[s.id]; if (d.draw) d.draw(this.w, s, L0, L1, LA); }
  }
  /** cooldown readiness 0..1 for the HUD */
  ready(s) {
    if (s.id === 'rail') return s.state === 'charge' ? 0.9 : Math.max(0, 1 - Math.max(0, s.cd) / (7.4 - 0.7 * s.lv));
    if (s.id === 'prism') return s.state === 'fire' ? 1 : Math.max(0, 1 - Math.max(0, s.cd) / (4.2 - 0.3 * s.lv));
    if (s.id === 'drones' || s.id === 'cannon' || s.id === 'mg') return 1;
    return Math.max(0, Math.min(1, 1 - Math.max(0, s.cd) / 8));
  }
  /** three distinct cards: new weapons and upgrades */
  offer(rng, n = 3) {
    const pool = [];
    for (const id of ORDER) {
      const d = DEFS[id], lv = this.lv(id);
      if (lv >= d.max) continue;
      pool.push({ id, lv, weight: lv === 0 ? 1.5 : (d.passive ? 0.6 : 1) });
    }
    const out = [];
    while (out.length < n && pool.length) {
      const tot = pool.reduce((a, p) => a + p.weight, 0);
      let r = rng.next() * tot, k = 0;
      for (; k < pool.length - 1; k++) { r -= pool[k].weight; if (r <= 0) break; }
      out.push(pool.splice(k, 1)[0]);
    }
    return out;
  }
}
