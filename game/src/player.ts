// The dreamer: movement, water drag, noclip dash, health.

import { NOCLIP, PLAYER } from './config';
import type { WorldMap } from './map';
import { clamp } from './rng';

export interface Stats {
  maxHp: number;
  regen: number;
  speedMul: number;
  pickupMul: number;
  cooldownMul: number;
  critChance: number;
  damageMul: number;
  areaMul: number;
}

export const baseStats = (): Stats => ({
  maxHp: PLAYER.maxHp, regen: 0, speedMul: 1, pickupMul: 1, cooldownMul: 1, critChance: 0.05, damageMul: 1, areaMul: 1,
});

export type NoclipEvent = 'start' | 'through' | 'bounce' | 'end' | null;

export class Player {
  x = 12; y = 14;
  vx = 0; vy = 0;
  faceX = 0; faceY = 1;
  hp = PLAYER.maxHp;
  stats: Stats = baseStats();
  iframes = 0;
  hurtPulse = 0;
  inWater = false;

  // noclip
  dashT = 0;           // > 0 while dashing
  dashCd = 0;
  dashDirX = 0; dashDirY = 1;
  dashFromX = 0; dashFromY = 0;
  dashGrace = 0;
  passedWall = false;
  ghostTrail = 0;      // seconds since last afterimage

  get dashing() { return this.dashT > 0; }
  get dashReady() { return this.dashCd <= 0 && !this.dashing; }
  get dashFrac() { return 1 - clamp(this.dashCd / NOCLIP.cooldown, 0, 1); }

  tryDash(mx: number, my: number): boolean {
    if (!this.dashReady) return false;
    const len = Math.hypot(mx, my);
    if (len > 0.1) { this.dashDirX = mx / len; this.dashDirY = my / len; }
    else { this.dashDirX = this.faceX; this.dashDirY = this.faceY; }
    this.dashT = NOCLIP.duration;
    this.dashGrace = NOCLIP.graceExtend;
    this.dashFromX = this.x; this.dashFromY = this.y;
    this.passedWall = false;
    this.dashCd = NOCLIP.cooldown * this.stats.cooldownMul;
    return true;
  }

  update(dt: number, mx: number, my: number, map: WorldMap): NoclipEvent {
    let event: NoclipEvent = null;
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtPulse = Math.max(0, this.hurtPulse - dt * 2.2);
    this.dashCd = Math.max(0, this.dashCd - dt);
    if (this.stats.regen > 0) this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.regen * dt);

    const len = Math.hypot(mx, my);
    if (len > 0.05) { this.faceX = mx / len; this.faceY = my / len; }

    if (this.dashing) {
      const sp = NOCLIP.speed;
      this.vx = this.dashDirX * sp; this.vy = this.dashDirY * sp;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (map.solidAt(this.x, this.y)) this.passedWall = true;
      this.dashT -= dt;
      if (this.dashT <= 0) {
        if (this.overlapsWall(map)) {
          // Forgiving: keep sliding a little to come out the other side.
          if (this.dashGrace > 0) { this.dashT = dt; this.dashGrace -= dt; }
          else {
            this.x = this.dashFromX; this.y = this.dashFromY;
            this.dashCd += NOCLIP.bouncePenaltyCd;
            this.vx = this.vy = 0;
            event = 'bounce';
          }
        } else {
          event = this.passedWall ? 'through' : 'end';
          this.vx *= 0.25; this.vy *= 0.25;
        }
      }
      return event;
    }

    this.inWater = map.waterAt(this.x, this.y);
    const speed = PLAYER.speed * this.stats.speedMul * (this.inWater ? PLAYER.waterSlow : 1);
    // Slightly floaty acceleration — the dreamer drifts more than walks.
    const k = 1 - Math.exp(-14 * dt);
    this.vx += (mx * speed - this.vx) * k;
    this.vy += (my * speed - this.vy) * k;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.resolveWalls(map);
    return event;
  }

  hurt(amount: number): boolean {
    if (this.iframes > 0 || this.dashing) return false;
    this.hp -= amount;
    this.iframes = PLAYER.iframes;
    this.hurtPulse = 1;
    return true;
  }

  private overlapsWall(map: WorldMap) {
    const r = PLAYER.radius;
    for (let cy = Math.floor(this.y - r); cy <= Math.floor(this.y + r); cy++)
      for (let cx = Math.floor(this.x - r); cx <= Math.floor(this.x + r); cx++) {
        if (!map.solid(cx, cy)) continue;
        const nx = clamp(this.x, cx, cx + 1), ny = clamp(this.y, cy, cy + 1);
        if ((this.x - nx) ** 2 + (this.y - ny) ** 2 < r * r * 0.8) return true;
      }
    return false;
  }

  private resolveWalls(map: WorldMap) {
    resolveCircle(this, PLAYER.radius, map);
  }
}

// Push a circle out of solid cells (shared with enemies).
export function resolveCircle(o: { x: number; y: number; vx?: number; vy?: number }, r: number, map: WorldMap) {
  for (let iter = 0; iter < 2; iter++) {
    for (let cy = Math.floor(o.y - r); cy <= Math.floor(o.y + r); cy++)
      for (let cx = Math.floor(o.x - r); cx <= Math.floor(o.x + r); cx++) {
        if (!map.solid(cx, cy)) continue;
        const nx = clamp(o.x, cx, cx + 1), ny = clamp(o.y, cy, cy + 1);
        let dx = o.x - nx, dy = o.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 < 1e-8) { // centre inside the cell: push out along the shallowest axis
          const l = o.x - cx, rr = cx + 1 - o.x, t = o.y - cy, b = cy + 1 - o.y;
          const m = Math.min(l, rr, t, b);
          if (m === l) o.x = cx - r; else if (m === rr) o.x = cx + 1 + r; else if (m === t) o.y = cy - r; else o.y = cy + 1 + r;
          continue;
        }
        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        o.x = nx + dx * r; o.y = ny + dy * r;
        if (o.vx !== undefined && o.vy !== undefined) {
          const vn = o.vx * dx + o.vy * dy;
          if (vn < 0) { o.vx -= vn * dx; o.vy -= vn * dy; }
        }
      }
  }
}
