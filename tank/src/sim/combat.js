import { C } from '../data/palette.js';

/** Central damage / kill / combo logic shared by every weapon. */
export function damageEnemy(w, e, dmg, hx, hy, o = {}) {
  if (e.state === 'dying' || e.hp <= 0) return false;
  const od = w.combo.odT > 0 ? 1.6 : 1;
  dmg *= o.noOD ? 1 : od;
  e.hp -= dmg;
  e.flash = 1;
  const fx = w.fx;
  fx.sparks(hx, hy, hx - e.x, hy - e.y + 20, o.sparks ?? Math.min(26, 5 + dmg * 0.3), 380, o.color || [1, 0.7, 0.3]);
  if (dmg >= 8) fx.text(e.x, e.y + 28, String(Math.round(dmg)), dmg >= 60 ? '#ffd27a' : '#e8f4ff', dmg >= 60 ? 24 : 17);
  if (o.stop !== 0) fx.stop(o.stop ?? (dmg >= 70 ? 4 : dmg >= 30 ? 3 : dmg >= 10 ? 2 : 0));
  if (!w.combo.odT) w.combo.meter = Math.min(100, w.combo.meter + dmg * 0.035);
  if (e.hp <= 0) { killEnemy(w, e, o.chain, hx, hy); return true; }
  w.sfx('hit', e.x, { gain: Math.min(1, dmg / 60) });
  return false;
}

export function killEnemy(w, e, chain = false, hx = e.x, hy = e.y) {
  const fx = w.fx;
  e.state = 'dying'; e.t = 0;
  e.spin = (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 2.4) * (e.kind === 'bomber' ? 0.6 : 1.3);
  e.vx *= 0.75; e.vy = Math.max(e.vy, 0) * 0.3;
  const big = e.kind === 'bomber' ? 1.0 : e.kind === 'diver' ? 0.75 : 0.6;
  fx.explosion(e.x, e.y, big, { trauma: 0.1 });
  fx.debrisBurst(e.x, e.y, 14, 520, e.kind === 'scout' ? C.scoutBody : C.planeBody);
  fx.stop(e.kind === 'bomber' ? 6 : 4);
  fx.zoomPunch = Math.max(fx.zoomPunch, 0.5);
  w.sfx('explosion', e.x, { size: big });
  registerKill(w, e, chain);
}

export function registerKill(w, e, chain) {
  const c = w.combo, fx = w.fx;
  c.n++; c.t = 3.4;
  c.kills.push(w.time);
  c.kills = c.kills.filter((t) => w.time - t < 2.0);
  const mult = 1 + Math.min(4, (c.n - 1) * 0.1);
  const pts = Math.round(e.score * mult * (chain ? 1.5 : 1));
  w.score += pts;
  if (!c.odT) c.meter = Math.min(100, c.meter + (chain ? 26 : 13));
  fx.text(e.x, e.y + 56, '+' + pts + (chain ? '  连锁!' : ''), chain ? '#ff7ad0' : '#ffe9b0', chain ? 26 : 21, 1.3);
  w.kills++;
  if (chain) w.chains++;
  if (c.kills.length >= 3 && w.time - c.lastSlow > 3.5) {
    c.lastSlow = w.time;
    fx.slow(0.5, 0.28);
    fx.zoomPunch = 1;
    fx.pulse(0.12, 0.006, 0.05);
    fx.text(w.tank.x, w.tank.y + 150, c.kills.length + ' 连杀', '#7af0ff', 34, 1.4);
    w.sfx('multikill', w.tank.x, {});
  }
  w.sfx('combo', e.x, { n: Math.min(c.n, 14) });
}

/** radial damage to enemies; R in world units */
export function splash(w, x, y, R, dmg, o = {}) {
  let hit = 0;
  for (const e of w.enemies) {
    if (e.state === 'dying') continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > R + e.r) continue;
    const f = Math.pow(1 - Math.min(1, d / (R + e.r)), 0.7);
    const target = o.target === e ? 1.5 : 1;
    damageEnemy(w, e, dmg * (0.35 + 0.65 * f) * target, x + (e.x - x) * 0.5, y + (e.y - y) * 0.5, { ...o, stop: o.stop });
    hit++;
  }
  return hit;
}

export function hurtTank(w, dmg, x, y) {
  const t = w.tank;
  if (t.dead || t.invuln > 0 || w.state !== 'play') return;
  t.hp -= dmg; t.invuln = 0.18; t.hitFlash = 1;
  const fx = w.fx;
  fx.hurt = Math.min(1, fx.hurt + dmg / 40);
  fx.sparks(x, y, x - t.x, y - t.y, 14, 420, [1, 0.8, 0.4]);
  fx.addTrauma(0.12 + dmg * 0.012);
  fx.pulse(0.05, 0.004);
  fx.stop(dmg > 10 ? 4 : 2);
  w.sfx('tankhit', t.x, { gain: Math.min(1, dmg / 25) });
  t.lastHurt = w.time;
  if (t.hp <= 0) t.die(w);
}
