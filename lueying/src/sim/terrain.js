// Terrain：高度函数、法线、树木/倒木分布、树冠覆盖、视线射线检测（地形 + 树干 + 树冠 + 静态盒子）。
// 不依赖渲染。所有查询都基于固定种子预计算的网格，保证确定性和速度。
import { MAP, SEED, DETECT } from './config.js';
import { createNoise2D, fbm, mulberry32, smoothstep, clamp, hash2 } from './noise.js';
import { developedMask, riverInfo, inCompound, START, EXTRACT, buildStaticBoxes, buildFences, PERIMETER_ROAD, CITY } from './level.js';

const HALF = MAP.half;
const STEP = MAP.gridStep;
const N = Math.round((HALF * 2) / STEP) + 1; // 1001

const CANOPY_STEP = 4;
const CN = Math.round((HALF * 2) / CANOPY_STEP);
const TREE_CELL = 8;
const TN = Math.round((HALF * 2) / TREE_CELL);
const LOG_CELL = 16;
const LN = Math.round((HALF * 2) / LOG_CELL);

export const TREE_TYPES = ['giant', 'canopy', 'palm', 'under'];

function distToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const L2 = abx * abx + abz * abz || 1;
  let t = ((px - ax) * abx + (pz - az) * abz) / L2;
  t = clamp(t, 0, 1);
  const dx = px - (ax + abx * t), dz = pz - (az + abz * t);
  return { d: Math.sqrt(dx * dx + dz * dz), t };
}

export function roadDistance(x, z) {
  let best = 1e9;
  const P = PERIMETER_ROAD;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    best = Math.min(best, distToSegment(x, z, a[0], a[1], b[0], b[1]).d);
  }
  return best;
}

export class Terrain {
  constructor(seed = SEED) {
    this.seed = seed;
    this.noise = createNoise2D(seed);
    this.noiseB = createNoise2D(seed + 17);
    this.N = N;
    this.step = STEP;
    this.half = HALF;
    this.grid = new Float32Array(N * N);
    this._buildHeights();
    this._buildTrees();
    this._stamp = new Uint32Array(this.trees.length);
    this._stampId = 1;
    this._buildLogs();
    this._buildCanopy();
    this.boxes = buildStaticBoxes((x, z) => this.height(x, z));
    this.fences = buildFences();
  }

  // ---------- 高度 ----------
  rawHeight(x, z) {
    const n = this.noise, nb = this.noiseB;
    const dev = developedMask(x, z);
    const flood = smoothstep(330, 470, z); // 1 = 淹水林
    // 雨林带：向北缓慢抬升到清障带地坪
    const rise = 1 - smoothstep(-160, 430, z);
    const hills = fbm(n, x * 0.0045, z * 0.0045, 4) * 3.4 + fbm(nb, x * 0.02, z * 0.02, 3) * 0.7;
    const belt = 0.9 + rise * 3.9 + hills * (0.35 + 0.65 * rise);
    const floodH = -0.35 + fbm(nb, x * 0.008, z * 0.008, 4) * 0.95 + fbm(n, x * 0.05, z * 0.05, 2) * 0.12;
    let h = belt * (1 - flood) + floodH * flood;
    // 城市与研究所地坪
    const plateau = MAP.plateauH + 0.5 * smoothstep(-520, -560, z) + fbm(nb, x * 0.06, z * 0.06, 2) * 0.03;
    h = h * (1 - dev) + plateau * dev;
    // 回收点的潟湖与起点水面
    for (const p of [EXTRACT, START]) {
      const dx = x - p.x, dz = z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const lag = 1 - smoothstep(18, 46, d);
      h = h * (1 - lag) + -1.3 * lag;
    }
    // 河道切割
    const r = riverInfo(x, z);
    if (r.d < r.halfW + 16) {
      const inDev = dev > 0.5;
      const bed = -r.depth;
      if (inDev) {
        // 混凝土渠：陡壁
        const wall = smoothstep(r.halfW + 1.2, r.halfW - 0.2, r.d);
        let floor = bed;
        if (r.z < MAP.drainEndZ + 22) floor = bed + (MAP.plateauH - bed) * smoothstep(MAP.drainEndZ + 22, MAP.drainEndZ, r.z);
        h = h * (1 - wall) + floor * wall;
      } else {
        const t = clamp(r.d / r.halfW, 0, 1);
        const channel = bed * (1 - t * t) + 0.15 * t * t;
        const bank = smoothstep(r.halfW + 14, r.halfW, r.d);
        // 河岸：比周围高出一点的天然堤，遮挡雷达
        const levee = (1 - flood) * 0.9 * Math.exp(-((r.d - r.halfW - 3) ** 2) / 10);
        h = Math.min(h + levee, h * (1 - bank) + Math.min(h, channel) * bank + levee * (1 - bank));
        if (r.d < r.halfW) h = Math.min(h, channel);
      }
    }
    // 外环路压平
    if (dev > 0.3) {
      const rd = roadDistance(x, z);
      if (rd < 6) h = h * 0.6 + MAP.plateauH * 0.4;
    }
    return h;
  }

  _buildHeights() {
    const g = this.grid;
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * STEP;
      for (let i = 0; i < N; i++) {
        const x = -HALF + i * STEP;
        g[j * N + i] = this.rawHeight(x, z);
      }
    }
  }

  height(x, z) {
    let fx = (x + HALF) / STEP, fz = (z + HALF) / STEP;
    if (fx < 0) fx = 0; else if (fx > N - 1.001) fx = N - 1.001;
    if (fz < 0) fz = 0; else if (fz > N - 1.001) fz = N - 1.001;
    const i = fx | 0, j = fz | 0;
    const tx = fx - i, tz = fz - j;
    const g = this.grid, k = j * N + i;
    const a = g[k], b = g[k + 1], c = g[k + N], d = g[k + N + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  // 悬浮参考面：水面或地面，取高者
  groundHeight(x, z) {
    const h = this.height(x, z);
    return h > MAP.waterLevel ? h : MAP.waterLevel;
  }

  isWater(x, z) {
    return this.height(x, z) < MAP.waterLevel - 0.05;
  }

  normal(x, z) {
    const e = 1.0;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    const nx = -hx, ny = 2 * e, nz = -hz;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return { x: nx / l, y: ny / l, z: nz / l };
  }

  zone(x, z) {
    if (inCompound(x, z)) return 'compound';
    if (z < MAP.cityZ) return 'city';
    if (developedMask(x, z) > 0.6) return 'clearing';
    if (this.isWater(x, z) && riverInfo(x, z).d < riverInfo(x, z).halfW) return 'river';
    if (z > MAP.floodedZ) return 'flooded';
    return 'forest';
  }

  // 是否在涵洞内（返回天花板高度或 null）
  culvertCeiling(x, z) {
    const C = MAP.culvert;
    if (z < C.z1 + 0.5 && z > C.z0 - 0.5 && Math.abs(x - C.x) < C.halfW + 3) return C.ceil;
    return null;
  }

  // ---------- 树 ----------
  _buildTrees() {
    const rand = mulberry32(this.seed ^ 0x5eed);
    const trees = [];
    const cell = 6;
    const M = Math.round((HALF * 2) / cell);
    const occ = new Int32Array(M * M).fill(-1);
    const tryAdd = (t) => {
      const ci = Math.floor((t.x + HALF) / cell), cj = Math.floor((t.z + HALF) / cell);
      const reach = Math.ceil((t.rb + 6) / cell);
      for (let dj = -reach; dj <= reach; dj++) {
        for (let di = -reach; di <= reach; di++) {
          const ii = ci + di, jj = cj + dj;
          if (ii < 0 || jj < 0 || ii >= M || jj >= M) continue;
          const o = occ[jj * M + ii];
          if (o < 0) continue;
          const u = trees[o];
          const dx = u.x - t.x, dz = u.z - t.z;
          const minD = u.rb + t.rb + 1.6;
          if (dx * dx + dz * dz < minD * minD) return false;
        }
      }
      if (ci >= 0 && cj >= 0 && ci < M && cj < M) occ[cj * M + ci] = trees.length;
      trees.push(t);
      return true;
    };
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < M; i++) {
        const x = -HALF + (i + 0.15 + rand() * 0.7) * cell;
        const z = -HALF + (j + 0.15 + rand() * 0.7) * cell;
        const r0 = rand(), r1 = rand(), r2 = rand(), r3 = rand();
        if (developedMask(x, z) > 0.02) continue;
        const riv = riverInfo(x, z);
        const flooded = z > MAP.floodedZ;
        if (riv.d < riv.halfW + (flooded ? 2 : 1.5)) continue;
        if (Math.hypot(x - START.x, z - START.z) < 34) continue;
        if (Math.hypot(x - EXTRACT.x, z - EXTRACT.z) < 30) continue;
        if (Math.abs(x) > HALF - 8 || Math.abs(z) > HALF - 8) continue;
        // 密度：雨林带最密；林缘一圈大树形成观察掩体
        const edge = 1 - smoothstep(0, 70, Math.abs(z - (MAP.forestEdgeZ + 30)));
        const bank = 1 - smoothstep(riv.halfW + 2, riv.halfW + 9, riv.d);
        let p = flooded ? 0.24 : 0.36;
        p *= 1 - bank * 0.55;
        p += edge * 0.08 * (Math.abs(x) < 320 ? 1 : 0);
        p *= 0.85 + 0.3 * (this.noiseB(x * 0.01, z * 0.01) * 0.5 + 0.5);
        if (r0 > p) continue;
        let type;
        if (flooded) type = r1 < 0.11 ? 0 : r1 < 0.55 ? 1 : r1 < 0.9 ? 2 : 3;
        else type = r1 < 0.08 + edge * 0.08 ? 0 : r1 < 0.6 ? 1 : r1 < 0.78 ? 2 : 3;
        let t;
        const g = this.height(x, z);
        if (type === 0) {
          const r = 1.1 + r2 * 0.9;
          t = { x, z, type, r, rb: r * (2.4 + r3 * 0.6), hb: 1.6 + r3 * 1.4, h: 34 + r2 * 12, cb: 20 + r3 * 6, cr: 11 + r2 * 6 };
        } else if (type === 1) {
          const r = 0.42 + r2 * 0.45;
          t = { x, z, type, r, rb: r * (r3 < 0.35 ? 1.9 : 1.15), hb: r3 < 0.35 ? 0.9 : 0.3, h: 22 + r2 * 10, cb: 13 + r3 * 5, cr: 5.5 + r2 * 4 };
        } else if (type === 2) {
          const r = 0.2 + r2 * 0.1;
          t = { x, z, type, r, rb: r, hb: 0, h: 10 + r2 * 9, cb: 8 + r2 * 7, cr: 3.2 + r3 * 1.6 };
        } else {
          const r = 0.16 + r2 * 0.14;
          t = { x, z, type, r, rb: r, hb: 0, h: 5 + r2 * 5, cb: 2.5 + r3 * 2, cr: 2.2 + r3 * 1.8 };
        }
        t.g = g;
        t.rot = rand() * Math.PI * 2;
        t.seed = (rand() * 1e6) | 0;
        tryAdd(t);
      }
    }
    this.trees = trees;
    // 空间哈希（CSR）：每棵树插入其最大半径覆盖的所有格
    const counts = new Int32Array(TN * TN + 1);
    const cellsOf = (t, cb) => {
      const R = t.rb + 0.01;
      const i0 = Math.max(0, Math.floor((t.x - R + HALF) / TREE_CELL)), i1 = Math.min(TN - 1, Math.floor((t.x + R + HALF) / TREE_CELL));
      const j0 = Math.max(0, Math.floor((t.z - R + HALF) / TREE_CELL)), j1 = Math.min(TN - 1, Math.floor((t.z + R + HALF) / TREE_CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cb(j * TN + i);
    };
    trees.forEach((t) => cellsOf(t, (c) => counts[c + 1]++));
    for (let c = 0; c < TN * TN; c++) counts[c + 1] += counts[c];
    const items = new Int32Array(counts[TN * TN]);
    const fill = counts.slice();
    trees.forEach((t, idx) => cellsOf(t, (c) => { items[fill[c]++] = idx; }));
    this.treeStart = counts;
    this.treeItems = items;
  }

  // 遍历覆盖圆 (x,z,R) 的树；cb 返回 true 时提前结束
  forTreesNear(x, z, R, cb) {
    const stamp = ++this._stampId;
    const i0 = Math.max(0, Math.floor((x - R + HALF) / TREE_CELL)), i1 = Math.min(TN - 1, Math.floor((x + R + HALF) / TREE_CELL));
    const j0 = Math.max(0, Math.floor((z - R + HALF) / TREE_CELL)), j1 = Math.min(TN - 1, Math.floor((z + R + HALF) / TREE_CELL));
    const S = this.treeStart, I = this.treeItems, st = this._stamp;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * TN + i;
        for (let k = S[c]; k < S[c + 1]; k++) {
          const idx = I[k];
          if (st[idx] === stamp) continue;
          st[idx] = stamp;
          if (cb(this.trees[idx], idx)) return;
        }
      }
    }
  }

  // ---------- 倒木 ----------
  _buildLogs() {
    const rand = mulberry32(this.seed ^ 0x10a5);
    const logs = [];
    let guard = 0;
    while (logs.length < 420 && guard++ < 20000) {
      const x = (rand() * 2 - 1) * (HALF - 30);
      const z = -120 + rand() * (HALF + 90);
      if (developedMask(x, z) > 0) continue;
      const riv = riverInfo(x, z);
      if (riv.d < riv.halfW + 3) continue;
      if (Math.hypot(x - START.x, z - START.z) < 40 || Math.hypot(x - EXTRACT.x, z - EXTRACT.z) < 36) continue;
      if (this.height(x, z) < -0.3) continue;
      const ang = rand() * Math.PI;
      const len = 7 + rand() * 10;
      const r = 0.45 + rand() * 0.5;
      const ax = x - Math.cos(ang) * len / 2, az = z - Math.sin(ang) * len / 2;
      const bx = x + Math.cos(ang) * len / 2, bz = z + Math.sin(ang) * len / 2;
      // 不压在树干上
      let blocked = false;
      this.forTreesNear(x, z, len / 2 + 2, (t) => {
        if (distToSegment(t.x, t.z, ax, az, bx, bz).d < t.rb + r + 0.4) { blocked = true; return true; }
        return false;
      });
      if (blocked) continue;
      const ga = this.height(ax, az), gb = this.height(bx, bz);
      logs.push({ x, z, ax, az, bx, bz, ang, len, r, ga, gb, seed: (rand() * 1e6) | 0 });
    }
    this.logs = logs;
    const buckets = Array.from({ length: LN * LN }, () => []);
    logs.forEach((l, idx) => {
      const i0 = Math.floor((Math.min(l.ax, l.bx) - l.r + HALF) / LOG_CELL), i1 = Math.floor((Math.max(l.ax, l.bx) + l.r + HALF) / LOG_CELL);
      const j0 = Math.floor((Math.min(l.az, l.bz) - l.r + HALF) / LOG_CELL), j1 = Math.floor((Math.max(l.az, l.bz) + l.r + HALF) / LOG_CELL);
      for (let j = Math.max(0, j0); j <= Math.min(LN - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(LN - 1, i1); i++) buckets[j * LN + i].push(idx);
    });
    this.logBuckets = buckets;
  }

  // 某点倒木顶面高度（无则 -Infinity）
  logTop(x, z) {
    const i = Math.floor((x + HALF) / LOG_CELL), j = Math.floor((z + HALF) / LOG_CELL);
    if (i < 0 || j < 0 || i >= LN || j >= LN) return -Infinity;
    let top = -Infinity;
    for (const idx of this.logBuckets[j * LN + i]) {
      const l = this.logs[idx];
      const { d, t } = distToSegment(x, z, l.ax, l.az, l.bx, l.bz);
      if (d < l.r) {
        const base = l.ga + (l.gb - l.ga) * t;
        const y = base + l.r * 0.85 + Math.sqrt(l.r * l.r - d * d);
        if (y > top) top = y;
      }
    }
    return top;
  }

  // 悬浮/碰撞参考面：地面、水面、倒木
  surfaceHeight(x, z) {
    const g = this.groundHeight(x, z);
    const l = this.logTop(x, z);
    return l > g ? l : g;
  }

  // ---------- 树冠覆盖 ----------
  _buildCanopy() {
    const cov = new Uint8Array(CN * CN);
    const den = new Uint8Array(CN * CN);
    for (const t of this.trees) {
      const R = t.cr;
      const i0 = Math.max(0, Math.floor((t.x - R + HALF) / CANOPY_STEP)), i1 = Math.min(CN - 1, Math.floor((t.x + R + HALF) / CANOPY_STEP));
      const j0 = Math.max(0, Math.floor((t.z - R + HALF) / CANOPY_STEP)), j1 = Math.min(CN - 1, Math.floor((t.z + R + HALF) / CANOPY_STEP));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const cx = -HALF + (i + 0.5) * CANOPY_STEP, cz = -HALF + (j + 0.5) * CANOPY_STEP;
          const d = Math.hypot(cx - t.x, cz - t.z) / R;
          if (d > 1) continue;
          const v = Math.round(255 * Math.min(1, (1 - d * d) * (t.type === 2 ? 0.75 : 1.25)));
          const k = j * CN + i;
          if (v > cov[k]) cov[k] = v;
          den[k] = Math.min(255, den[k] + (t.type === 3 ? 40 : 22));
        }
      }
    }
    // 下层灌木让林地整体带一点密度
    for (let j = 0; j < CN; j++) {
      for (let i = 0; i < CN; i++) {
        const x = -HALF + (i + 0.5) * CANOPY_STEP, z = -HALF + (j + 0.5) * CANOPY_STEP;
        const k = j * CN + i;
        if (developedMask(x, z) < 0.05 && !this.isWater(x, z)) den[k] = Math.min(255, den[k] + 70);
      }
    }
    this.canopyGrid = cov;
    this.densityGrid = den;
  }

  canopy(x, z) {
    const i = Math.floor((x + HALF) / CANOPY_STEP), j = Math.floor((z + HALF) / CANOPY_STEP);
    if (i < 0 || j < 0 || i >= CN || j >= CN) return 0;
    return this.canopyGrid[j * CN + i] / 255;
  }

  density(x, z) {
    const i = Math.floor((x + HALF) / CANOPY_STEP), j = Math.floor((z + HALF) / CANOPY_STEP);
    if (i < 0 || j < 0 || i >= CN || j >= CN) return 0;
    return this.densityGrid[j * CN + i] / 255;
  }

  underCanopy(x, z) {
    return this.canopy(x, z) > 0.45;
  }

  // 是否紧贴建筑（卫星拍不清）或在涵洞/机库内
  sheltered(x, z, y = 2) {
    if (this.culvertCeiling(x, z) !== null) return true;
    for (const b of this.boxes) {
      if (!b.alive || !b.sight) continue;
      if (b.owner === 'city') continue;
      const dx = Math.max(b.minX - x, 0, x - b.maxX);
      const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
      if (dx < 5 && dz < 5 && b.maxY > y + 3) return true;
    }
    return false;
  }

  // ---------- 视线 ----------
  // 返回 { blocked, by, atten, t } ；atten 为林下植被造成的软衰减（0..1）
  los(ax, ay, az, bx, by, bz, opt = {}) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const out = { blocked: false, by: null, atten: 1, t: 1 };
    if (L < 0.01) return out;
    const ignoreTrees = opt.ignoreTrees;
    const canopyBlocks = opt.canopy !== false;
    // 1) 地形 + 树冠 + 林下植被：步进
    const stepLen = 2;
    const steps = Math.ceil(L / stepLen);
    let attenLen = 0;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = ax + dx * t, y = ay + dy * t, z = az + dz * t;
      const h = this.height(x, z);
      if (y < h - 0.05) { out.blocked = true; out.by = 'terrain'; out.t = t; return out; }
      if (canopyBlocks && y > 14 && y < 40) {
        const c = this.canopy(x, z);
        if (c > 0.55) { out.blocked = true; out.by = 'canopy'; out.t = t; return out; }
      }
      if (y < h + 5) {
        const d = this.density(x, z);
        if (d > 0.2) attenLen += stepLen * d;
      }
    }
    out.atten = Math.exp(-attenLen * DETECT.forestAtten);
    // 2) 静态盒子（slab）
    for (const b of this.boxes) {
      if (!b.alive || !b.sight) continue;
      if (opt.skipBox && opt.skipBox === b.owner) continue;
      const t = rayBox(ax, ay, az, dx, dy, dz, b);
      if (t !== null && t > 0.001 && t < 0.999) { out.blocked = true; out.by = 'building'; out.t = t; return out; }
    }
    // 3) 树干：二维 DDA
    if (!ignoreTrees) {
      const hit = this._rayTrunks(ax, ay, az, dx, dy, dz);
      if (hit) { out.blocked = true; out.by = 'trunk'; out.t = hit.t; out.tree = hit.idx; return out; }
    }
    return out;
  }

  _rayTrunks(ax, ay, az, dx, dy, dz) {
    const L2 = dx * dx + dz * dz;
    if (L2 < 1e-6) return null;
    let x = (ax + HALF) / TREE_CELL, z = (az + HALF) / TREE_CELL;
    let i = Math.floor(x), j = Math.floor(z);
    const ex = (ax + dx + HALF) / TREE_CELL, ez = (az + dz + HALF) / TREE_CELL;
    const ie = Math.floor(ex), je = Math.floor(ez);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(TREE_CELL / dx) : Infinity;
    const tdz = dz !== 0 ? Math.abs(TREE_CELL / dz) : Infinity;
    let tmx = dx !== 0 ? ((dx > 0 ? i + 1 - x : x - i) * TREE_CELL) / Math.abs(dx) : Infinity;
    let tmz = dz !== 0 ? ((dz > 0 ? j + 1 - z : z - j) * TREE_CELL) / Math.abs(dz) : Infinity;
    const S = this.treeStart, I = this.treeItems;
    let best = null;
    for (let guard = 0; guard < 400; guard++) {
      if (i >= 0 && j >= 0 && i < TN && j < TN) {
        const c = j * TN + i;
        for (let k = S[c]; k < S[c + 1]; k++) {
          const t = this.trees[I[k]];
          const hit = rayCircle(ax, az, dx, dz, t.x, t.z, t.r);
          let tt = null;
          if (hit !== null && hit > 0.002 && hit < 0.998) {
            const y = ay + dy * hit;
            if (y < t.g + t.h) tt = hit;
          }
          if (t.hb > 0) {
            const hb = rayCircle(ax, az, dx, dz, t.x, t.z, t.rb);
            if (hb !== null && hb > 0.002 && hb < 0.998) {
              const y = ay + dy * hb;
              if (y < t.g + t.hb && (tt === null || hb < tt)) tt = hb;
            }
          }
          if (tt !== null && (!best || tt < best.t)) best = { t: tt, idx: I[k] };
        }
        if (best) return best;
      }
      if (i === ie && j === je) break;
      if (tmx < tmz) { tmx += tdx; i += sx; } else { tmz += tdz; j += sz; }
      if (Math.min(tmx, tmz) > 1 + tdx && Math.min(tmx, tmz) > 1 + tdz) break;
    }
    return best;
  }

  // 统计数据（测试与调试）
  stats() {
    return { trees: this.trees.length, logs: this.logs.length, boxes: this.boxes.length };
  }
}

// 射线-圆（二维），返回参数 t（0..1，相对于 d）或 null
export function rayCircle(ax, az, dx, dz, cx, cz, r) {
  const fx = ax - cx, fz = az - cz;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  if (c < 0) return 0.0021; // 起点在圆内：视为立即被挡（用于射线从树干内部出发的极端情况）
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export function rayBox(ax, ay, az, dx, dy, dz, b) {
  let tmin = 0, tmax = 1;
  const o = [ax, ay, az], d = [dx, dy, dz];
  const mn = [b.minX, b.minY, b.minZ], mx = [b.maxX, b.maxY, b.maxZ];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < mn[k] || o[k] > mx[k]) return null;
    } else {
      let t1 = (mn[k] - o[k]) / d[k], t2 = (mx[k] - o[k]) / d[k];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

export { hash2 };
