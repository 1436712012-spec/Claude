// One breadth-first search from the player feeds every enemy. Directions are
// stored per cell and bilinearly sampled, so hordes pour around corners as a
// smooth fluid instead of zig-zagging along grid lines.

import type { WorldMap } from './map';

const INF = 0xffff;

export class FlowField {
  readonly size: number;
  ox = 0; oy = 0;
  dist: Uint16Array;
  dirX: Float32Array;
  dirY: Float32Array;
  private blocked: Uint8Array;
  private queue: Int32Array;

  constructor(size: number) {
    this.size = size;
    const n = size * size;
    this.dist = new Uint16Array(n).fill(INF);
    this.dirX = new Float32Array(n);
    this.dirY = new Float32Array(n);
    this.blocked = new Uint8Array(n);
    this.queue = new Int32Array(n);
  }

  rebuild(map: WorldMap, px: number, py: number) {
    const S = this.size;
    const tx = Math.floor(px), ty = Math.floor(py);
    this.ox = tx - (S >> 1);
    this.oy = ty - (S >> 1);
    const { dist, blocked, queue, dirX, dirY } = this;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) blocked[y * S + x] = map.solid(this.ox + x, this.oy + y) ? 1 : 0;
    dist.fill(INF);

    const start = (ty - this.oy) * S + (tx - this.ox);
    let head = 0, tail = 0;
    dist[start] = 0; queue[tail++] = start;
    // 8-connected BFS with integer costs (10 orthogonal, 14 diagonal) via a
    // two-pass relaxation: BFS on 4-neighbours, then diagonal smoothing.
    while (head < tail) {
      const i = queue[head++];
      const x = i % S, y = (i / S) | 0;
      const d = dist[i] + 10;
      if (x > 0 && !blocked[i - 1] && dist[i - 1] > d) { dist[i - 1] = d; queue[tail++] = i - 1; }
      if (x < S - 1 && !blocked[i + 1] && dist[i + 1] > d) { dist[i + 1] = d; queue[tail++] = i + 1; }
      if (y > 0 && !blocked[i - S] && dist[i - S] > d) { dist[i - S] = d; queue[tail++] = i - S; }
      if (y < S - 1 && !blocked[i + S] && dist[i + S] > d) { dist[i + S] = d; queue[tail++] = i + S; }
    }

    // Direction = towards the lowest-cost neighbour (diagonals only when both
    // orthogonal cells are open, so enemies never cut through wall corners).
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
      const i = y * S + x;
      if (blocked[i] || dist[i] === INF) { dirX[i] = 0; dirY[i] = 0; continue; }
      let best = dist[i], bx = 0, by = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const j = i + dy * S + dx;
        if (blocked[j]) continue;
        if (dx && dy && (blocked[i + dx] || blocked[i + dy * S])) continue;
        const c = dist[j] + (dx && dy ? 4 : 0); // diagonal penalty ≈ 14 vs 10
        if (c < best) { best = c; bx = dx; by = dy; }
      }
      const l = Math.hypot(bx, by) || 1;
      dirX[i] = bx / l; dirY[i] = by / l;
    }
  }

  inside(wx: number, wy: number) {
    const x = wx - this.ox, y = wy - this.oy;
    return x >= 1 && y >= 1 && x < this.size - 2 && y < this.size - 2;
  }

  reachable(cx: number, cy: number) {
    const x = cx - this.ox, y = cy - this.oy;
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false;
    return this.dist[y * this.size + x] !== INF;
  }

  // Bilinear sample of the direction field at a world position.
  sample(wx: number, wy: number, out: { x: number; y: number }): boolean {
    const S = this.size;
    const fx = wx - this.ox - 0.5, fy = wy - this.oy - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    if (x0 < 1 || y0 < 1 || x0 >= S - 2 || y0 >= S - 2) return false;
    const tx = fx - x0, ty = fy - y0;
    const i = y0 * S + x0;
    let sx = 0, sy = 0, w = 0;
    const acc = (j: number, k: number) => {
      if (this.dist[j] === 0xffff) return;
      sx += this.dirX[j] * k; sy += this.dirY[j] * k; w += k;
    };
    acc(i, (1 - tx) * (1 - ty)); acc(i + 1, tx * (1 - ty));
    acc(i + S, (1 - tx) * ty); acc(i + S + 1, tx * ty);
    if (w < 1e-4) return false;
    const l = Math.hypot(sx, sy);
    if (l < 1e-4) { out.x = 0; out.y = 0; return true; }
    out.x = sx / l; out.y = sy / l;
    return true;
  }

  distAt(cx: number, cy: number) {
    const x = cx - this.ox, y = cy - this.oy;
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return INF;
    return this.dist[y * this.size + x];
  }
}
