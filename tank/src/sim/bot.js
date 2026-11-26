import { TIER, GRAV, WIND_ACC } from './weapons.js';
import { TOWN_X } from './game.js';

/** Auto-pilot: drives the tank through the same virtual-input path a player would use.
 *  Used for the attract mode behind the title screen and for automated screenshots/perf tests. */
export class Bot {
  constructor() {
    this.v = { left: false, right: false, fire: false, mg: false, jump: false, missile: false, overdrive: false, aimX: 640, aimY: 300 };
    this.active = true;
    this.phase = 'idle'; this.chargeT = 0; this.goal = 0.5; this.wait = 0.3;
  }
  update(g, dt) {
    const v = this.v, t = g.tank, cam = g.camera;
    v.jump = v.missile = v.overdrive = false;
    let best = null, bs = -1e9;
    for (const e of g.enemies) {
      if (e.state === 'dying') continue;
      if (Math.abs(e.x - cam.x) > cam.halfW + 10 || e.y > cam.y + cam.halfH - 15) continue;
      const s = (e.kind === 'bomber' ? 260 : e.kind === 'diver' ? 200 : 120) - Math.abs(e.x - t.x) * 0.12 - Math.abs(e.x - TOWN_X) * 0.1;
      if (s > bs) { bs = s; best = e; }
    }
    // movement: orbit around the town, drift toward scouts
    const home = TOWN_X + Math.sin(g.time * 0.23) * 260;
    const dx = home - t.x;
    v.left = dx < -40; v.right = dx > 40;
    if (!best) {
      v.fire = false; v.mg = false; this.phase = 'idle';
      const a = cam.worldToScreen(t.x + t.f * 400, t.y + 160);
      v.aimX = a.x; v.aimY = a.y;
    } else {
      const spd = this.goal < 0.2 ? TIER[0].speed : TIER[1].speed;
      const dist = Math.hypot(best.x - t.x, best.y - t.y);
      const tof = dist / spd;
      let px = best.x + best.vx * (tof + 0.05), py = best.y + best.vy * (tof + 0.05);
      px -= 0.5 * g.wind.v * WIND_ACC * tof * tof; // wind compensation
      const a = cam.worldToScreen(px, py);
      v.aimX = a.x; v.aimY = a.y;
      v.mg = (best.kind !== 'bomber') && dist < 560;
      if (this.phase === 'idle') {
        this.wait -= dt;
        if (this.wait <= 0 && t.cd <= 0) {
          const r = Math.random();
          this.goal = dist < 380 && best.kind === 'scout' ? 0.05 : r < 0.4 ? 0.4 : r < 0.8 ? 0.85 : 1.45;
          this.chargeT = 0; this.phase = 'charge';
        }
        v.fire = false;
      } else {
        v.fire = true;
        this.chargeT += dt;
        if (this.chargeT >= this.goal) { v.fire = false; this.phase = 'idle'; this.wait = 0.12; }
      }
    }
    if (g.enemies.length >= 3 && t.missileCd <= 0) v.missile = true;
    if (g.combo.meter >= 100) v.overdrive = true;
  }
}
