// Star shards (XP), warm milk (heal) and the gift boxes waiting in sealed rooms.

import type { WorldMap, Chest } from './map';
import type { Player } from './player';
import { PLAYER } from './config';

export const MAX_STARS = 1500;
export const enum PickKind { Star = 0, BigStar = 1, Milk = 2 }

export class Pickups {
  n = 0;
  x = new Float32Array(MAX_STARS);
  y = new Float32Array(MAX_STARS);
  vx = new Float32Array(MAX_STARS);
  vy = new Float32Array(MAX_STARS);
  value = new Float32Array(MAX_STARS);
  kind = new Uint8Array(MAX_STARS);
  pulled = new Uint8Array(MAX_STARS);
  age = new Float32Array(MAX_STARS);
  seed = new Float32Array(MAX_STARS);
  chests: Chest[] = [];
  private chestScan = 0;

  drop(x: number, y: number, value: number, kind: PickKind = PickKind.Star) {
    if (this.n >= MAX_STARS) {
      // Too many: fold the value into a random existing shard and promote it.
      const j = Math.floor(Math.random() * this.n);
      this.value[j] += value;
      if (this.kind[j] === PickKind.Star && this.value[j] >= 10) this.kind[j] = PickKind.BigStar;
      return;
    }
    const i = this.n++;
    const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.2;
    this.x[i] = x; this.y[i] = y; this.vx[i] = Math.cos(a) * s; this.vy[i] = Math.sin(a) * s;
    this.value[i] = value; this.kind[i] = kind; this.pulled[i] = 0; this.age[i] = 0; this.seed[i] = Math.random() * 10;
  }

  private remove(i: number) {
    const l = --this.n;
    if (i === l) return;
    this.x[i] = this.x[l]; this.y[i] = this.y[l]; this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l];
    this.value[i] = this.value[l]; this.kind[i] = this.kind[l]; this.pulled[i] = this.pulled[l];
    this.age[i] = this.age[l]; this.seed[i] = this.seed[l];
  }

  vacuumAll() { for (let i = 0; i < this.n; i++) if (this.kind[i] !== PickKind.Milk) this.pulled[i] = 1; }

  update(dt: number, p: Player, map: WorldMap, onCollect: (kind: PickKind, value: number) => void, onChest: (c: Chest) => void) {
    const R = PLAYER.pickupRadius * p.stats.pickupMul;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      const dx = p.x - this.x[i], dy = p.y - this.y[i];
      const d = Math.hypot(dx, dy);
      if (d < 0.38) { onCollect(this.kind[i] as PickKind, this.value[i]); this.remove(i--); continue; }
      if (!this.pulled[i] && d < R) this.pulled[i] = 1;
      if (this.pulled[i]) {
        // Accelerating attraction with a little orbit so shards spiral in.
        const sp = 7 + this.age[i] * 2;
        const k = 1 - Math.exp(-10 * dt);
        const tx = (dx / d) * sp + (-dy / d) * 1.2, ty = (dy / d) * sp + (dx / d) * 1.2;
        this.vx[i] += (tx - this.vx[i]) * k; this.vy[i] += (ty - this.vy[i]) * k;
      } else {
        const f = Math.exp(-4 * dt); this.vx[i] *= f; this.vy[i] *= f;
      }
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
    }

    // Chests near the player (cheap periodic scan; list kept for rendering).
    this.chestScan -= dt;
    if (this.chestScan <= 0) {
      this.chestScan = 0.5;
      this.chests = map.chestsInRect(p.x - 30, p.y - 30, p.x + 30, p.y + 30);
    }
    for (const c of this.chests) {
      if (c.opened) continue;
      if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 < 0.8 * 0.8) { c.opened = true; onChest(c); }
    }
    this.chests = this.chests.filter((c) => !c.opened);
  }
}
