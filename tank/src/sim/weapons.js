import { C } from '../data/palette.js';
import { damageEnemy, splash } from './combat.js';
import { PT } from '../gfx/particles.js';
import { SH } from '../gfx/shapes.js';

export const GRAV = 430;
export const WIND_ACC = 55;
export const TIER = [
  { speed: 1500, power: 0.8, dmg: 55, R: 0, splashR: 48, splashD: 34, size: 0.75 },
  { speed: 950, power: 1.0, dmg: 48, R: 84, cloudDps: 22, cloudLife: 4.0 },
  { speed: 950, power: 1.25, dmg: 78, R: 118, cloudDps: 34, cloudLife: 5.0 },
  { speed: 950, power: 1.6, dmg: 125, R: 160, cloudDps: 50, cloudLife: 6.2 },
];

export function solveBallistic(dx, dy, v, g) {
  dx = Math.max(dx, 1);
  const v2 = v * v, disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  let th;
  if (disc >= 0) th = Math.atan2(v2 - Math.sqrt(disc), g * dx);
  else th = Math.atan2(v2, g * dx); // out of range: best-effort high angle
  th = Math.max(-0.25, Math.min(1.45, th));
  const tof = dx / Math.max(1, v * Math.cos(th));
  return { th, tof };
}

export function fireShell(w, tank, tier, tof) {
  const T = TIER[tier];
  const m = tank.muzzle(), a = tank.barrelAng;
  const od = w.combo.odT > 0;
  w.shells.push({ x: m.x, y: m.y, vx: Math.cos(a) * T.speed, vy: Math.sin(a) * T.speed, tier, t: 0, fuse: tier > 0 ? tof : 99, od, tr: 0 });
  w.fx.muzzle(m.x, m.y, a, T.power);
  w.fx.addTrauma(0.12 + tier * 0.1);
  w.fx.stop(tier >= 2 ? 3 : 1);
  w.fx.pulse(0.03 * T.power, 0.002 * T.power);
  w.fx.zoomPunch = Math.max(w.fx.zoomPunch, 0.12 + tier * 0.1);
  w.sfx('cannon', m.x, { tier });
  // brass
  const f = tank.f;
  w.fx.casing(m.x - Math.cos(a) * 60, m.y - Math.sin(a) * 60 + 10, -f * 90 + (Math.random() - 0.5) * 40, 220 + Math.random() * 120);
}

function groundImpact(w, s, y) {
  const fx = w.fx, T = TIER[s.tier];
  const od = s.od ? 1.25 : 1;
  const size = T.size || 0.9 + s.tier * 0.15;
  fx.explosion(s.x, y, size, { plasma: s.od });
  fx.dust(s.x, y, 40, 40 * size, 260);
  w.terrain.crater(s.x, 30 * size * od, 15 * size * od);
  splash(w, s.x, y, T.splashR || T.R * 0.55, (T.splashD || T.dmg * 0.4) * od, {});
  w.sfx('explosion', s.x, { size });
}

function burst(w, s, hitEnemy) {
  const fx = w.fx, T = TIER[s.tier];
  const od = s.od ? 1.25 : 1;
  if (s.tier === 0) {
    fx.explosion(s.x, s.y, T.size, { plasma: s.od });
    if (hitEnemy) damageEnemy(w, hitEnemy, T.dmg, s.x, s.y, { stop: 3 });
    splash(w, s.x, s.y, T.splashR * od, T.splashD * od, { target: hitEnemy });
    w.sfx('explosion', s.x, { size: 0.6 });
    return;
  }
  const R = T.R * od;
  fx.flakBurst(s.x, s.y, R, s.tier, s.od);
  fx.stop(s.tier >= 2 ? 3 : 2);
  splash(w, s.x, s.y, R, T.dmg, { target: hitEnemy, color: s.od ? C.plasma : undefined });
  const puffs = 9 + s.tier * 2;
  const cl = { x: s.x, y: s.y, R, age: 0, life: T.cloudLife * (s.od ? 1.2 : 1), dps: T.cloudDps * (s.od ? 1.6 : 1), tick: 0.2, puffs: [], plasma: s.od, tier: s.tier };
  for (let i = 0; i < puffs; i++) {
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * R * 0.78;
    cl.puffs.push({ ox: Math.cos(a) * r, oy: Math.sin(a) * r * 0.85, r: R * (0.34 + Math.random() * 0.26), rot: Math.random() * 6.283, seed: Math.random() * 7, spin: (Math.random() - 0.5) * 0.3 });
  }
  w.clouds.push(cl);
  w.sfx('flak', s.x, { tier: s.tier });
}

export function updateShells(w, dt) {
  const T = w.terrain, fx = w.fx;
  for (let i = w.shells.length - 1; i >= 0; i--) {
    const s = w.shells[i];
    s.t += dt;
    s.vx += w.wind.v * WIND_ACC * dt;
    s.vy -= GRAV * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.tr += dt;
    if (s.tr > 0.012) {
      s.tr = 0;
      fx.smoke(s.x, s.y, 0, 10, 4 + s.tier * 1.2, 0.5, false, [0.18, 0.15, 0.22]);
      if (s.tier > 0) fx.ember(s.x, s.y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 2.2, 0.3, s.od ? C.plasma : [1, 0.7, 0.3]);
    }
    let done = false;
    for (const e of w.enemies) {
      if (e.state === 'dying') continue;
      if (Math.hypot(e.x - s.x, e.y - s.y) < e.r + 6) { burst(w, s, e); done = true; break; }
    }
    if (!done && s.y < T.heightAt(s.x) + 2) { 
      if (s.tier === 0) groundImpact(w, s, T.heightAt(s.x)); else burst(w, s, null);
      done = true;
    }
    if (!done && s.t >= s.fuse) { burst(w, s, null); done = true; }
    if (!done && (s.x < -200 || s.x > T.W + 200 || s.y > 2200 || s.t > 6)) done = true;
    if (done) w.shells.splice(i, 1);
  }
}

export function updateClouds(w, dt) {
  const fx = w.fx;
  for (let i = w.clouds.length - 1; i >= 0; i--) {
    const c = w.clouds[i];
    c.age += dt;
    c.x += w.wind.v * 42 * dt; c.y += 6 * dt;
    c.tick -= dt;
    if (c.age > c.life) { w.clouds.splice(i, 1); continue; }
    if (Math.random() < 0.55 * fx.k) {
      const p = c.puffs[(Math.random() * c.puffs.length) | 0];
      fx.ember(c.x + p.ox * 0.8, c.y + p.oy * 0.8, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, 2.4, 0.35, c.plasma ? C.plasma : [1, 0.6, 0.25]);
    }
    if (c.tick <= 0) {
      c.tick += 0.2;
      for (const e of w.enemies) {
        if (e.state === 'dying') continue;
        const d = Math.hypot(e.x - c.x, e.y - c.y);
        if (d < c.R + e.r * 0.5) {
          e.inCloud = 0.25;
          damageEnemy(w, e, c.dps * 0.2, e.x + (Math.random() - 0.5) * 20, e.y + (Math.random() - 0.5) * 10, { stop: 0, sparks: 4, color: c.plasma ? C.plasma : [1, 0.6, 0.2], noOD: true });
        }
      }
    }
  }
}

export function updateTracers(w, dt) {
  const T = w.terrain, fx = w.fx;
  for (let i = w.tracers.length - 1; i >= 0; i--) {
    const b = w.tracers[i];
    b.life -= dt;
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    b.vy -= 120 * dt;
    let hit = false;
    for (const e of w.enemies) {
      if (e.state === 'dying') continue;
      const dx = nx - b.x, dy = ny - b.y, l2 = dx * dx + dy * dy + 1e-6;
      let t = ((e.x - b.x) * dx + (e.y - b.y) * dy) / l2; t = Math.max(0, Math.min(1, t));
      const px = b.x + dx * t, py = b.y + dy * t;
      if (Math.hypot(e.x - px, e.y - py) < e.r + 2) {
        damageEnemy(w, e, b.dmg, px, py, { stop: 0, sparks: 4 });
        fx.glow(px, py, 14, 0.07, [1, 0.8, 0.4], 3);
        hit = true; break;
      }
    }
    const gh = T.heightAt(nx);
    if (!hit && ny < gh) {
      fx.sparks(nx, gh, -b.vx * 0.2, 200, 4, 300, [1, 0.8, 0.4]);
      fx.dust(nx, gh, 2, 6, 40);
      hit = true;
    }
    b.px = b.x; b.py = b.y;
    b.x = nx; b.y = ny;
    if (hit || b.life <= 0) w.tracers.splice(i, 1);
  }
}

export function fireMissiles(w, tank) {
  const aim = { x: tank.aimX, y: tank.aimY };
  const cands = w.enemies.filter((e) => e.state !== 'dying').map((e) => ({ e, d: Math.hypot(e.x - aim.x, e.y - aim.y) })).sort((a, b) => a.d - b.d);
  const n = 3;
  const m = tank.muzzle();
  for (let i = 0; i < n; i++) {
    const target = cands.length ? cands[i % cands.length].e : null;
    const a = Math.PI / 2 + (i - 1) * 0.35 + (tank.f > 0 ? -0.15 : 0.15);
    w.missiles.push({ x: tank.x + tank.f * (-10 + i * 8), y: tank.y + 80, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, t: -i * 0.09, target, rot: a, speed: 300, smokeT: 0 });
  }
  w.fx.addTrauma(0.2); w.fx.zoomPunch = Math.max(w.fx.zoomPunch, 0.25);
  w.sfx('missile', tank.x, {});
}

export function updateMissiles(w, dt) {
  const T = w.terrain, fx = w.fx;
  for (let i = w.missiles.length - 1; i >= 0; i--) {
    const m = w.missiles[i];
    m.t += dt;
    if (m.t < 0) continue;
    if (m.t > 0.28) {
      if (m.target && m.target.state !== 'dying' && w.enemies.includes(m.target)) {
        const want = Math.atan2(m.target.y - m.y, m.target.x - m.x);
        let da = want - m.rot; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
        m.rot += Math.max(-5 * dt, Math.min(5 * dt, da));
      }
      m.speed = Math.min(780, m.speed + 900 * dt);
      m.vx = Math.cos(m.rot) * m.speed; m.vy = Math.sin(m.rot) * m.speed;
    } else {
      m.vy -= 100 * dt; m.rot = Math.atan2(m.vy, m.vx);
    }
    m.x += m.vx * dt; m.y += m.vy * dt;
    m.smokeT -= dt;
    if (m.smokeT <= 0) {
      m.smokeT = 0.014;
      fx.smoke(m.x - Math.cos(m.rot) * 14, m.y - Math.sin(m.rot) * 14, -m.vx * 0.05, -m.vy * 0.05 + 10, 7, 1.2, false, [0.3, 0.26, 0.34]);
      fx.fire(m.x - Math.cos(m.rot) * 10, m.y - Math.sin(m.rot) * 10, -m.vx * 0.1, -m.vy * 0.1, 8, 0.2);
    }
    let boom = false;
    for (const e of w.enemies) {
      if (e.state === 'dying') continue;
      if (Math.hypot(e.x - m.x, e.y - m.y) < e.r + 10) { boom = true; break; }
    }
    if (m.y < T.heightAt(m.x) + 3) boom = true;
    if (boom) {
      fx.explosion(m.x, m.y, 1.05);
      splash(w, m.x, m.y, 66, 80, { stop: 3 });
      if (m.y < T.heightAt(m.x) + 40) T.crater(m.x, 26, 12);
      w.sfx('explosion', m.x, { size: 0.9 });
      w.missiles.splice(i, 1);
    } else if (m.x < -300 || m.x > T.W + 300 || m.y > 2200 || m.t > 5) w.missiles.splice(i, 1);
  }
}

// ----------------------------------------------------------------------------------------------
export function drawShots(w, L0, L1, LA) {
  // shells
  for (const s of w.shells) {
    const a = Math.atan2(s.vy, s.vx);
    const col = s.od ? C.plasma : (s.tier > 0 ? [1, 0.75, 0.35, 1] : [1, 0.9, 0.55, 1]);
    const sz = 1 + s.tier * 0.25;
    LA.glow(s.x, s.y, 16 * sz, 3 * sz, a, 3 * sz, SH.RBOX, 7 * sz, col, 3.2);
    LA.glowDot(s.x, s.y, 4 * sz, 5 * sz, [1, 1, 0.9, 1], 4.5);
    if (s.tier > 0) LA.glowDot(s.x, s.y, 10 * sz, 22 * sz, col, 0.9);
  }
  // tracers
  for (const b of w.tracers) {
    const px = b.px ?? b.x - b.vx * 0.02, py = b.py ?? b.y - b.vy * 0.02;
    const len = 26;
    const a = Math.atan2(b.vy, b.vx);
    LA.glowLine(b.x - Math.cos(a) * len, b.y - Math.sin(a) * len, b.x, b.y, 1.2, 3, b.od ? C.plasma : [1, 0.75, 0.3, 1], 3.0);
    LA.glowDot(b.x, b.y, 1.5, 3, [1, 0.95, 0.8, 1], 3);
  }
  // missiles
  for (const m of w.missiles) {
    if (m.t < 0) continue;
    L0.rbox(m.x, m.y, 14, 3.4, m.rot, 3, C.steel, 2.5, 0, 0);
    L0.tri(m.x + Math.cos(m.rot) * 14, m.y + Math.sin(m.rot) * 14, 4, 3.5, m.rot - Math.PI / 2, 1, C.red, 0, 2, 0.6, 0);
    LA.glowDot(m.x - Math.cos(m.rot) * 14, m.y - Math.sin(m.rot) * 14, 6, 14, [1, 0.6, 0.2, 1], 3.2);
  }
  // flak clouds
  for (const c of w.clouds) {
    const age = c.age;
    const expand = Math.min(1, 0.45 + age * 3.2);
    const fade = Math.min(1, (c.life - age) / 1.4) * Math.min(1, 0.4 + age * 6);
    const heat = Math.max(0, 1 - age / 1.0) * 0.9 + 0.1 * Math.max(0, 1 - age / 2.5);
    for (const p of c.puffs) {
      const col = c.plasma ? [0.04, 0.12, 0.2, 0.85 * fade] : [C.smoke[0], C.smoke[1], C.smoke[2], 0.86 * fade];
      L1.puff(c.x + p.ox * expand, c.y + p.oy * expand, p.r * (0.55 + 0.45 * expand), p.rot + age * p.spin, col, c.plasma ? heat * 0.3 : heat, p.seed);
    }
    // faint danger-zone ring so the player can read the cloud area
    if (age > 0.3) LA.push(c.x, c.y, c.R, 1.2, 0, 0, SH.RING, 3, c.plasma ? 0.1 : 1, c.plasma ? 0.7 : 0.4, c.plasma ? 0.9 : 0.15, 1, 0.5 * fade * (0.6 + 0.4 * Math.sin(age * 6)), 3, 0, 0);
  }
}
