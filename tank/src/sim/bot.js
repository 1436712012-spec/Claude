import { TOWN_X } from '../data/consts.js';
import { Gunner } from './gunner.js';

/** Auto-pilot for the attract mode and automated tests: drives movement and uses the same Gunner as touch/auto-fire. */
export class Bot {
  constructor() {
    this.v = { left: false, right: false, fire: false, mg: false, jump: false, missile: false, overdrive: false, aimX: 640, aimY: 300 };
    this.active = true;
    this.gunner = new Gunner();
  }
  update(g, dt) {
    const v = this.v, t = g.tank;
    v.jump = v.missile = v.overdrive = false;
    const home = TOWN_X + Math.sin(g.time * 0.23) * 260;
    const dx = home - t.x;
    v.left = dx < -40; v.right = dx > 40;
    this.gunner.update(g, dt, null);
    const o = this.gunner.out;
    v.fire = o.fire; v.mg = o.mg; v.aimX = o.aimX; v.aimY = o.aimY;
    if (g.combo.meter >= 100) v.overdrive = true;
  }
}
