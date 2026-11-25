// Horde simulation in structure-of-arrays form. Dense storage with swap-remove,
// a uid per slot so projectiles can detect when their target slot was reused,
// and a spatial hash rebuilt every tick for separation and weapon queries.

import { ENEMIES, MAP, SPAWN, spawnWeights, type EnemyKind } from './config';
import type { FlowField } from './flowfield';
import type { WorldMap } from './map';
import { Cell } from './map';
import { clamp, randRange, weightedPick } from './rng';

export const MAX_ENEMIES = 1200;
export const KINDS: EnemyKind[] = ['faceless', 'balloon', 'paper'];
const KIND_INDEX: Record<EnemyKind, number> = { faceless: 0, balloon: 1, paper: 2 };

const HASH = MAP.window;            // spatial hash covers the flow-field window, 1 m cells

export class Enemies {
  n = 0;
  x = new Float32Array(MAX_ENEMIES);
  y = new Float32Array(MAX_ENEMIES);
  vx = new Float32Array(MAX_ENEMIES);
  vy = new Float32Array(MAX_ENEMIES);
  kx = new Float32Array(MAX_ENEMIES);   // knockback velocity
  ky = new Float32Array(MAX_ENEMIES);
  hp = new Float32Array(MAX_ENEMIES);
  maxHp = new Float32Array(MAX_ENEMIES);
  kind = new Uint8Array(MAX_ENEMIES);
  flash = new Float32Array(MAX_ENEMIES);
  seed = new Float32Array(MAX_ENEMIES);
  hue = new Float32Array(MAX_ENEMIES);
  charge = new Float32Array(MAX_ENEMIES);  // paper dolls: seconds of straight-line charge left
  cdx = new Float32Array(MAX_ENEMIES);
  cdy = new Float32Array(MAX_ENEMIES);
  noteHit = new Float32Array(MAX_ENEMIES); // last time hit by orbiting notes
  uid = new Uint32Array(MAX_ENEMIES);
  private nextUid = 1;

  // spatial hash
  hashOx = 0; hashOy = 0;
  head = new Int32Array(HASH * HASH);
  next = new Int32Array(MAX_ENEMIES);

  spawnAcc = 0;
  swarmTimer = 0;
  onSwarm: () => void = () => {};
  private tmp = { x: 0, y: 0 };

  constructor(private map: WorldMap, private flow: FlowField) {}

  def(i: number) { return ENEMIES[KINDS[this.kind[i]]]; }

  spawn(kind: EnemyKind, x: number, y: number, hpScale: number): number {
    if (this.n >= MAX_ENEMIES) return -1;
    const i = this.n++;
    const d = ENEMIES[kind];
    this.x[i] = x; this.y[i] = y;
    this.vx[i] = this.vy[i] = this.kx[i] = this.ky[i] = 0;
    this.hp[i] = this.maxHp[i] = d.hp * hpScale;
    this.kind[i] = KIND_INDEX[kind];
    this.flash[i] = 0;
    this.seed[i] = Math.random() * 100;
    this.hue[i] = Math.random();
    this.charge[i] = 0;
    this.noteHit[i] = -10;
    this.uid[i] = this.nextUid++;
    return i;
  }

  remove(i: number) {
    const last = --this.n;
    if (i === last) return;
    this.x[i] = this.x[last]; this.y[i] = this.y[last];
    this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last];
    this.kx[i] = this.kx[last]; this.ky[i] = this.ky[last];
    this.hp[i] = this.hp[last]; this.maxHp[i] = this.maxHp[last];
    this.kind[i] = this.kind[last]; this.flash[i] = this.flash[last];
    this.seed[i] = this.seed[last]; this.hue[i] = this.hue[last];
    this.charge[i] = this.charge[last]; this.cdx[i] = this.cdx[last]; this.cdy[i] = this.cdy[last];
    this.noteHit[i] = this.noteHit[last]; this.uid[i] = this.uid[last];
  }

  // ------------------------------------------------------------ spawning

  private findSpawnPoint(px: number, py: number, rMin: number, rMax: number, angle?: number): { x: number; y: number } | null {
    for (let t = 0; t < 8; t++) {
      const a = angle !== undefined ? angle + randRange(-0.25, 0.25) : Math.random() * Math.PI * 2;
      const r = randRange(rMin, rMax);
      const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
      const cx = Math.floor(x), cy = Math.floor(y);
      const c = this.map.cell(cx, cy);
      if (c === Cell.Wall || c === Cell.Secret) continue;
      if (this.flow.inside(x, y) && !this.flow.reachable(cx, cy)) continue;
      return { x: cx + 0.5, y: cy + 0.5 };
    }
    return null;
  }

  updateSpawning(dt: number, minute: number, px: number, py: number, finalRush: boolean) {
    const cap = finalRush ? SPAWN.maxEnemies : SPAWN.capAt(minute);
    const hpScale = SPAWN.hpScale(minute);
    const rate = finalRush ? 60 : SPAWN.perSecond(minute);
    this.spawnAcc += dt * rate;
    const weights = spawnWeights(minute);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.n >= cap) { this.spawnAcc = 0; break; }
      const kind = weightedPick(KINDS, (k) => weights[k]) ?? 'faceless';
      const p = this.findSpawnPoint(px, py, SPAWN.ringMin, SPAWN.ringMax);
      if (!p) continue;
      if (kind === 'paper') this.spawnPaperLine(p.x, p.y, px, py, hpScale, 3 + Math.floor(Math.random() * 3));
      else this.spawn(kind, p.x, p.y, hpScale);
    }

    this.swarmTimer += dt;
    if (this.swarmTimer >= SPAWN.swarmEvery) {
      this.swarmTimer = 0;
      this.spawnSwarm(minute, px, py, hpScale);
    }
  }

  // Paper dolls arrive in a straight file, all charging along the same line.
  spawnPaperLine(x: number, y: number, px: number, py: number, hpScale: number, count: number) {
    let dx = px - x, dy = py - y;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    for (let k = 0; k < count; k++) {
      const sx = x - dx * k * 0.8, sy = y - dy * k * 0.8;
      if (this.map.solidAt(sx, sy)) continue;
      const i = this.spawn('paper', sx, sy, hpScale);
      if (i < 0) return;
      this.charge[i] = 3.2; this.cdx[i] = dx; this.cdy[i] = dy;
    }
  }

  // A ring of balloons closing in from every side.
  spawnSwarm(minute: number, px: number, py: number, hpScale: number) {
    this.onSwarm();
    const count = Math.min(90, 26 + Math.floor(minute * 6));
    const R = 13;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      const x = px + Math.cos(a) * R, y = py + Math.sin(a) * R;
      const c = this.map.cell(Math.floor(x), Math.floor(y));
      if (c === Cell.Wall || c === Cell.Secret) continue;
      this.spawn('balloon', x, y, hpScale * 0.8);
    }
  }

  // ------------------------------------------------------------ simulation

  update(dt: number, time: number, px: number, py: number, onContact: (i: number) => void) {
    const { x, y, vx, vy, kx, ky, kind } = this;
    const dir = this.tmp;
    for (let i = 0; i < this.n; i++) {
      const d = this.def(i);
      let tx = px - x[i], ty = py - y[i];
      const dist = Math.hypot(tx, ty) || 1;

      // Far behind? Re-enter the dream from the other side, ahead of the player.
      if (dist > 30) {
        const p = this.findSpawnPoint(px, py, SPAWN.ringMin, SPAWN.ringMax);
        if (p) { x[i] = p.x; y[i] = p.y; this.charge[i] = 0; }
        continue;
      }

      let dX: number, dY: number;
      if (this.charge[i] > 0) {
        this.charge[i] -= dt;
        dX = this.cdx[i]; dY = this.cdy[i];
      } else if (dist < 2.2 || !this.flow.sample(x[i], y[i], dir)) {
        dX = tx / dist; dY = ty / dist;
      } else {
        dX = dir.x; dY = dir.y;
        // Blend toward a direct line as they close in, for a less robotic final approach.
        const b = clamp((6 - dist) / 4, 0, 0.6);
        dX = dX * (1 - b) + (tx / dist) * b; dY = dY * (1 - b) + (ty / dist) * b;
      }
      if (kind[i] === 1) { // balloons wander on the air
        const s = this.seed[i];
        dX += Math.sin(time * 0.9 + s) * 0.35; dY += Math.cos(time * 0.7 + s * 1.3) * 0.35;
      }
      const inWater = d.waterSlow < 1 && this.map.waterAt(x[i], y[i]);
      const sp = d.speed * (inWater ? d.waterSlow : 1);
      const k = 1 - Math.exp(-6 * dt);
      vx[i] += (dX * sp - vx[i]) * k;
      vy[i] += (dY * sp - vy[i]) * k;
      const kd = Math.exp(-7 * dt);
      kx[i] *= kd; ky[i] *= kd;
      x[i] += (vx[i] + kx[i]) * dt;
      y[i] += (vy[i] + ky[i]) * dt;
      this.flash[i] = Math.max(0, this.flash[i] - dt * 6);
    }

    this.rebuildHash(px, py);
    this.separate();

    const o = { x: 0, y: 0, vx: 0, vy: 0 };
    for (let i = 0; i < this.n; i++) {
      const d = this.def(i);
      if (kind[i] !== 1) { // balloons float over walls' shadows but not through walls
        o.x = x[i]; o.y = y[i]; o.vx = vx[i]; o.vy = vy[i];
        resolveEnemy(o, d.radius, this.map);
        x[i] = o.x; y[i] = o.y; vx[i] = o.vx; vy[i] = o.vy;
      } else {
        o.x = x[i]; o.y = y[i]; o.vx = vx[i]; o.vy = vy[i];
        resolveEnemy(o, d.radius * 0.6, this.map);
        x[i] = o.x; y[i] = o.y; vx[i] = o.vx; vy[i] = o.vy;
      }
      const dx = x[i] - px, dy = y[i] - py;
      const rr = d.radius + 0.3;
      if (dx * dx + dy * dy < rr * rr) onContact(i);
    }
  }

  private rebuildHash(px: number, py: number) {
    this.hashOx = Math.floor(px) - (HASH >> 1);
    this.hashOy = Math.floor(py) - (HASH >> 1);
    this.head.fill(-1);
    for (let i = 0; i < this.n; i++) {
      const cx = Math.floor(this.x[i]) - this.hashOx, cy = Math.floor(this.y[i]) - this.hashOy;
      if (cx < 0 || cy < 0 || cx >= HASH || cy >= HASH) { this.next[i] = -2; continue; }
      const c = cy * HASH + cx;
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }

  private separate() {
    const { x, y, head, next } = this;
    for (let i = 0; i < this.n; i++) {
      if (next[i] === -2) continue;
      const ri = this.def(i).radius, mi = this.def(i).mass;
      const cx = Math.floor(x[i]) - this.hashOx, cy = Math.floor(y[i]) - this.hashOy;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const hx = cx + ox, hy = cy + oy;
        if (hx < 0 || hy < 0 || hx >= HASH || hy >= HASH) continue;
        for (let j = head[hy * HASH + hx]; j >= 0; j = next[j]) {
          if (j <= i) continue;
          const dx = x[j] - x[i], dy = y[j] - y[i];
          const rr = (ri + this.def(j).radius) * 0.92;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 < 1e-9) continue;
          const d = Math.sqrt(d2);
          const push = (rr - d) / d;
          const mj = this.def(j).mass, wi = mj / (mi + mj), wj = mi / (mi + mj);
          x[i] -= dx * push * wi * 0.5; y[i] -= dy * push * wi * 0.5;
          x[j] += dx * push * wj * 0.5; y[j] += dy * push * wj * 0.5;
        }
      }
    }
  }

  // Calls fn(i, dist2) for every enemy within r of (px, py).
  query(px: number, py: number, r: number, fn: (i: number, d2: number) => void) {
    const r2 = r * r;
    const x0 = Math.floor(px - r) - this.hashOx, x1 = Math.floor(px + r) - this.hashOx;
    const y0 = Math.floor(py - r) - this.hashOy, y1 = Math.floor(py + r) - this.hashOy;
    for (let hy = Math.max(0, y0); hy <= Math.min(HASH - 1, y1); hy++)
      for (let hx = Math.max(0, x0); hx <= Math.min(HASH - 1, x1); hx++)
        for (let j = this.head[hy * HASH + hx]; j >= 0; j = this.next[j]) {
          const dx = this.x[j] - px, dy = this.y[j] - py;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2) fn(j, d2);
        }
  }

  nearest(px: number, py: number, maxR: number, skip?: (i: number) => boolean): number {
    let best = -1, bd = maxR * maxR;
    this.query(px, py, maxR, (i, d2) => { if (d2 < bd && !(skip && skip(i))) { bd = d2; best = i; } });
    return best;
  }
}

function resolveEnemy(o: { x: number; y: number; vx: number; vy: number }, r: number, map: WorldMap) {
  for (let cy = Math.floor(o.y - r); cy <= Math.floor(o.y + r); cy++)
    for (let cx = Math.floor(o.x - r); cx <= Math.floor(o.x + r); cx++) {
      if (!map.solid(cx, cy)) continue;
      const nx = clamp(o.x, cx, cx + 1), ny = clamp(o.y, cy, cy + 1);
      let dx = o.x - nx, dy = o.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 < 1e-8) {
        const l = o.x - cx, rr = cx + 1 - o.x, t = o.y - cy, b = cy + 1 - o.y;
        const m = Math.min(l, rr, t, b);
        if (m === l) o.x = cx - r; else if (m === rr) o.x = cx + 1 + r; else if (m === t) o.y = cy - r; else o.y = cy + 1 + r;
        continue;
      }
      const d = Math.sqrt(d2); dx /= d; dy /= d;
      o.x = nx + dx * r; o.y = ny + dy * r;
      const vn = o.vx * dx + o.vy * dy;
      if (vn < 0) { o.vx -= vn * dx; o.vy -= vn * dy; }
    }
}
