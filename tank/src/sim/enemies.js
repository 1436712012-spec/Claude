import { C } from '../data/palette.js';
import { SH } from '../gfx/shapes.js';
import { damageEnemy, hurtTank } from './combat.js';
import { clamp, damp } from '../core/math.js';

const rr = (a, b) => a + (b - a) * Math.random();
const BOMB_G = 520;

export const KINDS = {
  bomber: { hp: 135, r: 38, score: 300, speed: [118, 150] },
  scout: { hp: 38, r: 19, score: 100, speed: [250, 300] },
  diver: { hp: 62, r: 22, score: 200, speed: [190, 230] },
};

export function spawnEnemy(w, kind, side, o = {}) {
  const K = KINDS[kind], cam = w.camera, T = w.terrain;
  const dir = o.dir ?? (side > 0 ? -1 : 1); // spawn on the right => fly left
  const x = o.x ?? clamp(cam.x + side * (cam.halfW + 160 + (o.off || 0)), -300, T.W + 300);
  const e = {
    kind, x, y: 0, vx: 0, vy: 0, dir, hp: K.hp * (o.hpMul || 1), maxHp: K.hp * (o.hpMul || 1), r: K.r, score: K.score,
    flash: 0, state: 'fly', t: 0, rot: 0, spin: 0, inCloud: 0, id: ++w.uid, phase: Math.random() * 6.28, cd: rr(0.2, 1.2), chained: new Set(),
    speed: rr(K.speed[0], K.speed[1]),
  };
  if (kind === 'bomber') {
    e.y0 = o.y ?? rr(330, 410); e.y = e.y0; e.vx = dir * e.speed; e.bombs = (w.wave.n >= 4 ? 4 : 3) + (o.bombs || 0); e.bombCd = 0;
  } else if (kind === 'scout') {
    e.y0 = o.y ?? rr(210, 300); e.y = e.y0; e.vx = dir * e.speed; e.phase2 = 'in'; e.burst = 0; e.burstCd = 0; e.fireCd = rr(0.5, 1.4); e.tgtY = e.y0;
  } else {
    e.y0 = o.y ?? rr(440, 480); e.y = e.y0; e.phase2 = 'approach'; e.bombs = 1;
    const alive = w.town.houses.filter((h) => h.alive);
    e.target = (alive.length && Math.random() < 0.75) ? alive[(Math.random() * alive.length) | 0] : w.tank;
    e.dir = Math.sign(e.target.x - e.x) || dir; e.vx = e.dir * e.speed;
  }
  w.enemies.push(e);
  return e;
}

function dropBomb(w, e, ox = 0) {
  w.bombs.push({ x: e.x + ox, y: e.y - 14, vx: e.vx * 0.9, vy: -30, rot: 0, t: 0 });
  w.sfx('whistle', e.x, {});
}

function enemyBullet(w, e, tx, ty, speed = 540) {
  const mx = e.x + e.dir * 26, my = e.y - 2;
  const dx = tx - mx, dy = ty - my, l = Math.hypot(dx, dy) || 1;
  const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.05;
  w.ebullets.push({ x: mx, y: my, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 2.2 });
  w.fx.glow(mx, my, 10, 0.05, [1, 0.5, 0.25], 3);
}

export function updateEnemies(w, dt) {
  const T = w.terrain, fx = w.fx, tank = w.tank, town = w.town;
  for (let i = w.enemies.length - 1; i >= 0; i--) {
    const e = w.enemies[i];
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt * 7);
    e.inCloud = Math.max(0, e.inCloud - dt);
    if (e.state === 'dying') { if (updateDying(w, e, dt)) w.enemies.splice(i, 1); continue; }

    // ---- behaviours ----
    if (e.kind === 'bomber') {
      e.x += e.vx * dt;
      e.y = e.y0 + Math.sin(e.t * 0.9 + e.phase) * 9;
      e.rot = damp(e.rot, Math.cos(e.t * 0.9 + e.phase) * 0.03 * e.dir, 4, dt);
      e.bombCd -= dt;
      if (e.bombs > 0 && e.bombCd <= 0) {
        const gh = T.heightAt(e.x), fall = Math.sqrt(2 * Math.max(40, e.y - gh - 30) / BOMB_G);
        const ix = e.x + e.vx * 0.9 * fall;
        for (const h of town.houses) {
          if (h.alive && Math.abs(ix - h.x) < 28) { dropBomb(w, e); e.bombs--; e.bombCd = 0.34; break; }
        }
      }
      if ((e.dir > 0 && e.x > T.W + 500) || (e.dir < 0 && e.x < -500)) { w.enemies.splice(i, 1); w.escaped++; continue; }
    } else if (e.kind === 'scout') {
      updateScout(w, e, dt);
    } else {
      updateDiver(w, e, dt);
      if (e.gone) { w.enemies.splice(i, 1); w.escaped++; continue; }
    }
    // damage-state smoke / fire
    const hf = e.hp / e.maxHp;
    if (hf < 0.6 && Math.random() < (0.6 - hf) * 1.8 * fx.k) fx.smoke(e.x - e.dir * e.r * 0.6, e.y, -e.vx * 0.15, 20, 9 + (1 - hf) * 8, 1.1 + (1 - hf), false, [0.12, 0.1, 0.15]);
    if (hf < 0.35 && Math.random() < 0.6 * fx.k) fx.fire(e.x - e.dir * e.r * 0.35, e.y - 4, -e.vx * 0.1, 30, 8 + (1 - hf) * 8, 0.35);
    // afterburner
    if (e.kind !== 'bomber' && Math.random() < 0.5 * fx.k) fx.ember(e.x - e.dir * (e.r + 12), e.y, -e.vx * 0.25, (Math.random() - 0.5) * 20, 2.4, 0.3, e.kind === 'scout' ? [0.4, 0.8, 1] : [1, 0.6, 0.25]);
    // flak cloud tint
    if (e.inCloud > 0 && Math.random() < 0.25) fx.sparks(e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.5) * e.r, 0, 1, 2, 160, [1, 0.5, 0.2], 3);
  }
}

function updateScout(w, e, dt) {
  const tank = w.tank;
  const toTank = tank.x - e.x;
  e.x += e.vx * dt;
  e.y = damp(e.y, e.tgtY, 2.2, dt);
  e.rot = damp(e.rot, clamp((e.tgtY - e.y) * 0.004, -0.35, 0.35) * e.dir + Math.sin(e.t * 3 + e.phase) * 0.02, 6, dt);
  if (e.phase2 === 'in') {
    e.tgtY = tank.y + 120 + Math.sin(e.phase) * 50;
    if (Math.abs(toTank) < 560 && Math.sign(toTank) === e.dir) e.phase2 = 'attack';
    else if (Math.sign(toTank) !== e.dir && Math.abs(toTank) > 700) { e.dir = -e.dir; e.vx = e.dir * e.speed; }
  }
  if (e.phase2 === 'attack') {
    e.fireCd -= dt;
    if (e.fireCd <= 0 && e.burst === 0 && Math.abs(toTank) < 520 && Math.sign(toTank) === e.dir) { e.burst = 3; e.burstCd = 0; e.fireCd = rr(1.0, 1.5); }
    if (e.burst > 0) {
      e.burstCd -= dt;
      if (e.burstCd <= 0) {
        e.burstCd = 0.1; e.burst--;
        const lead = 0.5;
        enemyBullet(w, e, tank.x + tank.vx * lead, tank.y + 36);
        w.sfx('ebullet', e.x, {});
      }
    }
    if (Math.sign(toTank) !== e.dir && Math.abs(toTank) > 560) { e.phase2 = 'turn'; e.turnT = 0; }
  }
  if (e.phase2 === 'turn') {
    // pull up and reverse in a lazy loop
    e.turnT += dt;
    e.tgtY = e.y0 + 80;
    e.vx = damp(e.vx, 0, 3.0, dt);
    if (e.turnT > 0.6) { e.dir = -e.dir; e.vx = damp(e.vx, e.dir * e.speed, 4, dt); }
    if (e.turnT > 1.4) { e.phase2 = 'in'; e.vx = e.dir * e.speed; }
  }
}

function updateDiver(w, e, dt) {
  const T = w.terrain, tank = w.tank;
  if (e.phase2 === 'approach') {
    e.x += e.vx * dt; e.y = e.y0 + Math.sin(e.t * 1.3 + e.phase) * 6;
    e.rot = damp(e.rot, 0.04 * e.dir, 4, dt);
    if (!e.target) {
      const alive = w.town.houses.filter((h) => h.alive);
      e.target = (alive.length && Math.random() < 0.75) ? alive[(Math.random() * alive.length) | 0] : tank;
    }
    const tx = e.target.x;
    const dx = tx - e.x;
    if (Math.abs(dx) < 330 && Math.sign(dx) === e.dir) {
      e.phase2 = 'dive';
      const ty = (e.target === tank ? tank.y + 30 : T.heightAt(tx) + 30);
      const ang = Math.atan2(ty - e.y, tx - e.x);
      e.vx = Math.cos(ang) * 440; e.vy = Math.sin(ang) * 440; e.diveRot = ang;
      w.sfx('dive', e.x, {});
    }
    if ((e.dir > 0 && e.x > T.W + 500) || (e.dir < 0 && e.x < -500)) e.gone = true;
  } else if (e.phase2 === 'dive') {
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.rot = (e.vx >= 0 ? 1 : -1) * Math.atan2(e.vy, Math.abs(e.vx));
    const gh = T.heightAt(e.x);
    if (e.y < gh + 120) {
      dropBomb(w, e); e.bombs = 0; e.phase2 = 'climb'; e.vy = 120;
      e.vx = Math.sign(e.vx || e.dir) * 240; e.dir = Math.sign(e.vx);
    }
  } else {
    e.x += e.vx * dt; e.y += e.vy * dt; e.vy = damp(e.vy, 260, 2.2, dt);
    e.rot = damp(e.rot, 0.5 * e.dir, 4, dt);
    if (e.y > 700 || e.x < -500 || e.x > T.W + 500) e.gone = true;
  }
}

/** returns true when the wreck is gone */
function updateDying(w, e, dt) {
  const T = w.terrain, fx = w.fx;
  e.vy -= 480 * dt;
  e.x += e.vx * dt; e.y += e.vy * dt;
  e.rot += e.spin * dt * (e.dir);
  // trail
  if (Math.random() < 0.9) fx.fire(e.x, e.y, -e.vx * 0.1 + (Math.random() - 0.5) * 40, 20, 12 + Math.random() * 10, 0.4);
  if (Math.random() < 0.8) fx.smoke(e.x, e.y, -e.vx * 0.1, 10, 14 + Math.random() * 8, 1.6, true, [0.08, 0.06, 0.1]);
  if (Math.random() < 0.7) fx.ember(e.x, e.y, (Math.random() - 0.5) * 150, (Math.random() - 0.5) * 150, 2.6, 0.7);
  if (Math.random() < 0.3 * fx.k) fx.debrisBurst(e.x, e.y, 1, 200, C.planeBody);
  fx.light(e.x, e.y, 40, 190, [1, 0.5, 0.2], 3.6, 0.07);
  // mid-air breakup
  if (!e.broke && e.t > 0.5) {
    e.broke = true;
    fx.explosion(e.x, e.y, e.kind === 'bomber' ? 0.7 : 0.45, {});
    fx.debrisBurst(e.x, e.y, 18, 460, C.planeWing);
    fx.stop(2);
  }
  // chain: falling wreck smashes other aircraft
  for (const o of w.enemies) {
    if (o === e || o.state === 'dying' || e.chained.has(o.id)) continue;
    if (Math.hypot(o.x - e.x, o.y - e.y) < o.r + e.r * 0.8) {
      e.chained.add(o.id);
      fx.stop(5);
      fx.shock(o.x, o.y, 200, 0.03, 0.4);
      damageEnemy(w, o, 110, o.x, o.y, { chain: true, stop: 0 });
    }
  }
  // crash
  const gh = T.heightAt(e.x);
  if (e.y < gh + 14) {
    const size = e.kind === 'bomber' ? 1.5 : 0.95;
    fx.explosion(e.x, gh + 10, size, { trauma: 0.12 });
    fx.dust(e.x, gh, 50, 70, 320);
    fx.debrisBurst(e.x, gh + 6, 22, 520, C.planeDark);
    T.crater(e.x, 34 * size, 18 * size);
    fx.ring(e.x, gh + 6, 10, 200 * size * 0.6, 5, 0.5, [1, 0.6, 0.3], 3);
    w.sfx('explosion', e.x, { size });
    // area damage
    const tdx = Math.hypot(w.tank.x - e.x, w.tank.y + 30 - gh);
    if (tdx < 120 * size) hurtTank(w, 16 * size * (1 - tdx / (130 * size)), e.x, gh + 20);
    w.town.blast(w, e.x, gh, 80 * size, 50);
    for (const o of w.enemies) {
      if (o !== e && o.state !== 'dying' && Math.hypot(o.x - e.x, o.y - e.y) < 110 * size) damageEnemy(w, o, 70, o.x, o.y, { chain: true, stop: 0 });
    }
    return true;
  }
  if (e.t > 6) return true;
  return false;
}

// ----------------------------------------------------------------------------------------------
export function updateEnemyShots(w, dt) {
  const T = w.terrain, fx = w.fx, tank = w.tank;
  for (let i = w.bombs.length - 1; i >= 0; i--) {
    const b = w.bombs[i];
    b.t += dt; b.vy -= BOMB_G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 1 - 0.1 * dt;
    b.rot = Math.atan2(b.vy, b.vx);
    if (Math.random() < 0.5) fx.ember(b.x, b.y + 4, 0, 10, 2, 0.25, [1, 0.3, 0.2]);
    let boom = false, hit = null;
    for (const h of w.town.houses) {
      if (h.alive && Math.abs(b.x - h.x) < h.w / 2 + 6 && b.y < T.heightAt(h.x) + h.h + 4) { boom = true; hit = h; break; }
    }
    const gh = T.heightAt(b.x);
    if (b.y < gh + 3) boom = true;
    // direct bomb hit on tank
    if (Math.hypot(b.x - tank.x, b.y - (tank.y + 30)) < 48) boom = true;
    if (boom) {
      const y = Math.max(b.y, gh);
      fx.explosion(b.x, y + 4, 1.15);
      fx.dust(b.x, y, 36, 50, 280);
      fx.ring(b.x, y + 4, 8, 150, 4, 0.4, [1, 0.6, 0.3], 3);
      T.crater(b.x, 38, 20);
      w.sfx('explosion', b.x, { size: 1.0 });
      w.town.blast(w, b.x, y, 82, 60);
      const d = Math.hypot(tank.x - b.x, tank.y + 30 - y);
      if (d < 120) hurtTank(w, 28 * (1 - d / 125) + 4, b.x, y + 10);
      w.bombs.splice(i, 1);
    }
  }
  for (let i = w.ebullets.length - 1; i >= 0; i--) {
    const b = w.ebullets[i];
    b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    let dead = b.life <= 0;
    if (Math.hypot(b.x - tank.x, b.y - (tank.y + 30)) < 50 && !tank.dead) {
      hurtTank(w, 4, b.x, b.y); dead = true;
    }
    const gh = T.heightAt(b.x);
    if (b.y < gh) { fx.sparks(b.x, gh, 0, 1, 5, 300, [1, 0.5, 0.2]); fx.dust(b.x, gh, 3, 6, 40); dead = true; }
    for (const h of w.town.houses) {
      if (h.alive && Math.abs(b.x - h.x) < h.w / 2 && b.y < T.heightAt(h.x) + h.h) { h.hp -= 3; dead = true; fx.sparks(b.x, b.y, -b.vx, 20, 4, 200, [1, 0.5, 0.2]); }
    }
    if (dead) w.ebullets.splice(i, 1);
  }
}

// ----------------------------------------------------------------------------------------------
export function drawEnemies(w, L0, LA) {
  const cam = w.camera;
  for (const e of w.enemies) {
    if (Math.abs(e.x - cam.x) > cam.halfW + 200) continue;
    if (e.kind === 'bomber') drawBomber(w, e, L0, LA);
    else if (e.kind === 'scout') drawScout(w, e, L0, LA);
    else drawDiver(w, e, L0, LA);
  }
  for (const b of w.bombs) {
    L0.rbox(b.x, b.y, 11, 4.4, b.rot, 4, [0.16, 0.14, 0.22, 1], 3, 0, 0);
    L0.rbox(b.x + Math.cos(b.rot) * 10, b.y + Math.sin(b.rot) * 10, 3.5, 3.6, b.rot, 2, C.red, 2, 0.8, 0);
    L0.rbox(b.x - Math.cos(b.rot) * 10, b.y - Math.sin(b.rot) * 10, 2.5, 6, b.rot, 1, [0.12, 0.1, 0.18, 1], 1.5, 0, 0);
    LA.glowDot(b.x - Math.cos(b.rot) * 12, b.y - Math.sin(b.rot) * 12, 4, 9, [1, 0.25, 0.2, 1], 1.6);
  }
  for (const b of w.ebullets) {
    const a = Math.atan2(b.vy, b.vx);
    LA.glowLine(b.x - Math.cos(a) * 24, b.y - Math.sin(a) * 24, b.x, b.y, 1.5, 4, C.enemyBullet, 2.8);
    LA.glowDot(b.x, b.y, 2, 4, [1, 0.8, 0.6, 1], 3);
  }
}

function xf(e) {
  const c = Math.cos(e.rot), s = Math.sin(e.rot), d = e.dir;
  return (lx, ly) => ({ x: e.x + c * lx * d - s * ly, y: e.y + s * lx * d + c * ly });
}

function drawBomber(w, e, L0, LA) {
  const d = e.dir, F = e.flash, T = xf(e), rot = e.rot;
  const bp = (lx, ly, hw, hh, r, rad, col, bevel = 4, emis = 0, mat = 0) => { const p = T(lx, ly); L0.rbox(p.x, p.y, hw, hh, rot + r * d, rad, col, bevel, emis, mat, F); };
  // far wing (behind)
  bp(-2, -3, 36, 3, 0.05, 3, C.planeDark, 2);
  // far nacelle
  bp(20, -11, 14, 5.5, 0, 5, C.planeDark, 3);
  // tail
  const fin = T(-56, 14);
  L0.trap(fin.x, fin.y, 15, 12, 5, rot, 3, C.planeWing, 4, 0, 0, F);
  bp(-60, 5, 16, 2.4, 0, 2, C.planeWing, 2);
  // fuselage
  bp(0, 0, 58, 11, 0, 11, C.planeBody, 5);
  bp(0, -8.5, 40, 2.5, 0, 2, C.planeDark, 2);
  bp(0, 3, 48, 1.1, 0, 1, C.planeAccent, 1, 1.0);
  // nose glazing & canopy
  const nose = T(50, 0);
  L0.ell(nose.x, nose.y, 12, 9, rot, C.planeBody, 6, 0, 0, F);
  bp(40, 8, 10, 6, 0, 6, C.cyan, 5, 0.6, 2);
  bp(52, 3, 4.5, 4, 0, 4, C.cyan, 3, 1.2, 2);
  // near wing + nacelles
  bp(-2, -5, 40, 3.6, -0.04, 3, C.planeWing, 3);
  for (const lx of [-14, 22]) {
    bp(lx, -15, 15, 6.5, 0, 6, C.planeBody, 3);
    const pr = T(lx + 16, -15);
    L0.rbox(pr.x, pr.y, 1.6, 6, rot, 1, C.planeDark, 1.5, 0, 0);
    const spin = w.time * 40 + e.phase;
    LA.glow(pr.x, pr.y, 2.5, 10 * (0.8 + 0.2 * Math.sin(spin)), rot, 2.5, SH.ELL, 2.5, [0.7, 0.9, 1, 1], 0.28);
    const ex = T(lx - 16, -15);
    LA.glowDot(ex.x, ex.y, 3, 7, [1, 0.45, 0.15, 1], 0.8);
  }
  // bomb bay
  if (e.bombs > 0) { const p = T(0, -10); LA.glow(p.x, p.y, 18, 1.5, rot, 1.5, SH.RBOX, 5, C.orange, 0.9); }
  // nav lights
  const blink = (Math.floor(w.time * 1.8 + e.phase) % 2) ? 1 : 0.15;
  const l1 = T(-64, 20), l2 = T(60, -2);
  LA.glowDot(l1.x, l1.y, 2, 7, C.red, 3.2 * blink);
  LA.glowDot(l2.x, l2.y, 1.6, 4, C.green, 1.4);
  // shadow-ish glow when inside a flak cloud
  if (e.inCloud > 0) LA.glowDot(e.x, e.y, e.r, e.r * 0.8, [1, 0.45, 0.15, 1], 0.5);
}

function drawScout(w, e, L0, LA) {
  const d = e.dir, F = e.flash, T = xf(e), rot = e.rot;
  const bp = (lx, ly, hw, hh, r, rad, col, bevel = 3, emis = 0, mat = 0) => { const p = T(lx, ly); L0.rbox(p.x, p.y, hw, hh, rot + r * d, rad, col, bevel, emis, mat, F); };
  // tail fins
  const fin = T(-22, 7);
  L0.tri(fin.x, fin.y, 6.5, 8.5, rot + d * 0.15, 1.5, C.scoutDark, -0.7 * d, 2.5, 0, 0, F);
  bp(-14, -6, 14, 1.6, 0.06, 1.5, C.scoutDark, 1.5);
  // fuselage
  bp(0, 0, 26, 5, 0, 5, C.scoutBody, 4);
  const nose = T(28, 0);
  L0.tri(nose.x, nose.y, 5, 5.5, rot - d * Math.PI / 2, 1.5, C.scoutBody, 0, 3, 0, 0, F);
  // wing (delta, side-on)
  const wing = T(-2, -3);
  L0.tri(wing.x, wing.y, 16, 4, rot + d * 0.0, 1.5, C.scoutDark, 0.8 * d, 2.5, 0, 0, F);
  bp(2, 2.4, 20, 0.9, 0, 0.9, C.scoutAccent, 1, 1.6);
  bp(6, 5, 7, 3.6, 0, 3.4, C.cyan, 3, 0.5, 2);
  // engine + afterburner
  const ex = T(-27, 0);
  const flick = 0.85 + 0.15 * Math.sin(w.time * 60 + e.phase);
  LA.glow(ex.x - d * 6, ex.y, 14 * flick, 2.6, rot, 2.6, SH.RBOX, 6, [0.45, 0.8, 1, 1], 1.8);
  LA.glowDot(ex.x, ex.y, 4, 10, [1, 0.6, 0.3, 1], 2.2);
  if (e.inCloud > 0) LA.glowDot(e.x, e.y, e.r, e.r * 0.8, [1, 0.45, 0.15, 1], 0.4);
}

function drawDiver(w, e, L0, LA) {
  const d = e.dir, F = e.flash, T = xf(e), rot = e.rot;
  const bp = (lx, ly, hw, hh, r, rad, col, bevel = 3, emis = 0, mat = 0) => { const p = T(lx, ly); L0.rbox(p.x, p.y, hw, hh, rot + r * d, rad, col, bevel, emis, mat, F); };
  const fin = T(-26, 9);
  L0.trap(fin.x, fin.y, 8, 10, 3, rot, 2, C.diverBody, 3, 0, 0, F);
  bp(-24, 1, 8, 1.8, 0, 1.5, C.scoutDark, 1.5);
  bp(0, 0, 30, 8, 0, 8, C.diverBody, 4);
  bp(0, 3, 24, 1, 0, 1, C.diverAccent, 1, 1.4);
  bp(3, -4, 22, 3, 0.05, 3, C.scoutDark, 2.5);
  bp(10, 6, 9, 5, 0, 5, C.cyan, 4, 0.6, 2);
  const pr = T(33, 0);
  L0.rbox(pr.x, pr.y, 1.6, 6, rot, 1, C.scoutDark, 1.5, 0, 0);
  LA.glow(pr.x, pr.y, 2.2, 9, rot, 2.2, SH.ELL, 2.5, [0.8, 0.9, 1, 1], 0.28);
  if (e.bombs > 0) {
    const p = T(2, -11);
    L0.rbox(p.x, p.y, 10, 3.6, rot, 3.5, [0.15, 0.12, 0.2, 1], 2, 0, 0);
    L0.rbox(p.x + d * 8, p.y, 3, 3.4, rot, 2, C.red, 2, 0.8, 0);
  }
  const ex = T(-31, 0);
  LA.glowDot(ex.x, ex.y, 4, 10, [1, 0.55, 0.2, 1], 1.8);
  if (e.phase2 === 'dive') LA.glowLine(e.x - e.vx * 0.05, e.y - e.vy * 0.05, e.x - e.vx * 0.12, e.y - e.vy * 0.12, 1.5, 6, [1, 0.8, 0.6, 1], 1.2);
}
