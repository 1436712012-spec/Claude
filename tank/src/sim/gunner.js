import { TIER, WIND_ACC } from './weapons.js';
import { TOWN_X } from '../data/consts.js';

/**
 * Automatic gunner for the main cannon + machine gun. It picks the most dangerous target, leads it,
 * compensates for wind and runs the charge/release state machine. A manual aim point (finger or mouse)
 * overrides the targeting but the gun still fires and charges by itself.
 * Output uses screen coordinates so it can be fed through the same Input path as a human.
 */
export class Gunner {
  constructor() {
    this.out = { fire: false, mg: false, aimX: 640, aimY: 300, target: null };
    this.phase = 'idle'; this.chargeT = 0; this.goal = 0.5; this.wait = 0.3;
  }
  pick(g) {
    const t = g.tank, cam = g.camera;
    let best = null, bs = -1e9;
    for (const e of g.enemies) {
      if (e.state === 'dying') continue;
      if (Math.abs(e.x - cam.x) > cam.halfW + 10 || e.y > cam.y + cam.halfH - 15) continue;
      const s = (e.kind === 'bomber' ? 260 : e.kind === 'diver' ? 200 : 120) - Math.abs(e.x - t.x) * 0.12 - Math.abs(e.x - TOWN_X) * 0.1;
      if (s > bs) { bs = s; best = e; }
    }
    return best;
  }
  update(g, dt, manual) {
    const o = this.out, t = g.tank, cam = g.camera;
    const best = this.pick(g);
    let aim;
    const spd = this.goal < 0.2 ? TIER[0].speed : TIER[1].speed;
    if (manual) aim = manual;
    else if (best) {
      const dist = Math.hypot(best.x - t.x, best.y - t.y), tof = dist / spd;
      aim = { x: best.x + best.vx * (tof + 0.05) - 0.5 * g.wind.v * WIND_ACC * tof * tof, y: best.y + best.vy * (tof + 0.05) };
    } else aim = { x: t.x + t.f * 420, y: t.y + 170 };
    const s = cam.worldToScreen(aim.x, aim.y);
    o.aimX = s.x; o.aimY = s.y; o.target = best;
    // machine gun: anything non-bomber close to the tank or close to the manual aim point
    let mg = false;
    if (best && best.kind !== 'bomber' && Math.hypot(best.x - t.x, best.y - t.y) < 560) mg = true;
    if (manual) for (const e of g.enemies) if (e.state !== 'dying' && Math.hypot(e.x - manual.x, e.y - manual.y) < 90 && Math.hypot(e.x - t.x, e.y - t.y) < 650) mg = true;
    o.mg = mg;
    // cannon charge state machine
    const wantFire = !!best || !!manual;
    if (!wantFire) { o.fire = false; this.phase = 'idle'; return; }
    if (this.phase === 'idle') {
      this.wait -= dt; o.fire = false;
      if (this.wait <= 0 && t.cd <= 0) {
        const r = Math.random();
        const close = best && Math.hypot(best.x - t.x, best.y - t.y) < 380 && best.kind === 'scout';
        this.goal = close ? 0.05 : r < 0.4 ? 0.4 : r < 0.8 ? 0.85 : 1.45;
        this.chargeT = 0; this.phase = 'charge';
      }
    } else {
      o.fire = true; this.chargeT += dt;
      if (this.chargeT >= this.goal) { o.fire = false; this.phase = 'idle'; this.wait = 0.12; }
    }
  }
}
