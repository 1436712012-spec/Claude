// 雨林：实例化树干、板根、叶簇树冠（近处叶片卡，远处团块）、棕榈、垂藤、倒木、蕨类。按相机位置流式更新。
import * as THREE from 'three';
import { mulberry32, hash2 } from '../sim/noise.js';
import { developedMask } from '../sim/level.js';
import { patchMaterial } from './shaderfx.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

function trunkGeometry() {
  // 单位树干：半径 1、高 1，向上收细，略带弯曲
  const g = new THREE.CylinderGeometry(0.62, 1, 1, 9, 6, true);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + Math.sin(y * 3.1) * 0.25 * y);
    p.setZ(i, p.getZ(i) + Math.cos(y * 2.3) * 0.18 * y);
  }
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 6);
  g.computeVertexNormals();
  return g;
}

function buttressGeometry() {
  // 板根：5 片从树干向外展开的薄翼
  const parts = [];
  const r = mulberry32(3);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + r() * 0.4;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(1, 0);
    shape.quadraticCurveTo(0.42, 0.18, 0.12, 1); shape.lineTo(0, 1); shape.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false, curveSegments: 5 });
    g.translate(0, 0, -0.035);
    g.rotateY(-a);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function canopyCluster(cards = 72, seed = 1) {
  // 单位树冠：扁平半球上的叶片卡片，内侧更暗（环境光遮蔽）
  const r = mulberry32(seed);
  const pos = [], uv = [], col = [], idx = [];
  let v = 0;
  const subs = 9;
  for (let s = 0; s < subs; s++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.75;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = (1 - d * d) * 0.35 + r() * 0.15;
    for (let k = 0; k < cards / subs; k++) {
      const size = 0.32 + r() * 0.28;
      const ox = cx + (r() - 0.5) * 0.4, oy = cy + (r() - 0.5) * 0.25, oz = cz + (r() - 0.5) * 0.4;
      _e.set((r() - 0.5) * 1.2 - 1.2, r() * Math.PI * 2, (r() - 0.5) * 0.8);
      _q.setFromEuler(_e);
      const cell = Math.floor(r() * 16), ux = (cell % 4) / 4, uy = Math.floor(cell / 4) / 4;
      const shade = 0.45 + 0.55 * Math.min(1, (oy + 0.1) * 1.6) * (0.7 + 0.3 * d);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [cx2, cy2] of corners) {
        _p.set(cx2 * size, cy2 * size, 0).applyQuaternion(_q);
        pos.push(ox + _p.x, oy + _p.y, oz + _p.z);
        uv.push(ux + (cx2 * 0.5 + 0.5) * 0.25, uy + (cy2 * 0.5 + 0.5) * 0.25);
        col.push(shade, shade, shade);
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 法线朝上，让天光更自然
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) { n.setXYZ(i, n.getX(i) * 0.3, 0.9, n.getZ(i) * 0.3); }
  return g;
}

function blobGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 2);
  g.scale(1, 0.62, 1);
  const p = g.attributes.position;
  const r = mulberry32(9);
  for (let i = 0; i < p.count; i++) { const k = 0.85 + r() * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
  g.computeVertexNormals();
  return g;
}

function frondGeometry() {
  // 棕榈冠：10 片下垂的羽状叶
  const pos = [], uv = [], idx = [];
  let v = 0;
  const F = 10, S = 7;
  for (let f = 0; f < F; f++) {
    const a = (f / F) * Math.PI * 2 + (f % 2) * 0.2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const lift = 0.35 + (f % 3) * 0.12;
    for (let s = 0; s <= S; s++) {
      const t = s / S;
      const along = t;
      const y = Math.sin(t * Math.PI * 0.55) * lift - t * t * 0.55;
      const w = 0.16 * Math.sin(Math.PI * (0.1 + t * 0.9));
      const x = ca * along, z = sa * along;
      pos.push(x - sa * w, y, z + ca * w, x + sa * w, y, z - ca * w);
      uv.push(0, t, 1, t);
      if (s < S) { idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      v += 2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function fernGeometry() {
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.PlaneGeometry(1, 1.4, 1, 3);
    g.translate(0, 0.7, 0);
    // 外倾
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, y * y * 0.35); }
    g.rotateY((k / 4) * Math.PI + 0.3);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function vineGeometry() {
  const parts = [];
  const r = mulberry32(17);
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(0.12, 1, 1, 8);
    g.translate(0, -0.5, 0);
    const p = g.attributes.position;
    const ph = r() * 6;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y * 9 + ph) * 0.04); }
    g.rotateY(r() * Math.PI);
    g.translate((r() - 0.5) * 1.4, 0, (r() - 0.5) * 1.4);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function logGeometry() {
  const g = new THREE.CylinderGeometry(1, 1, 1, 9, 1, false);
  g.rotateZ(Math.PI / 2);
  return g;
}

export function mergeGeometries(list) {
  // 简化版合并（保留 position/normal/uv/color）
  let total = 0, totalIdx = 0;
  const hasColor = list.every((g) => g.attributes.color);
  for (const g of list) { total += g.attributes.position.count; totalIdx += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const col = hasColor ? new Float32Array(total * 3) : null;
  const idx = new Uint32Array(totalIdx);
  let vo = 0, io = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), vo * 3);
    nor.set(g.attributes.normal.array.subarray(0, n * 3), vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, n * 2), vo * 2);
    if (col) col.set(g.attributes.color.array.subarray(0, n * 3), vo * 3);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo; io += g.index.count; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

export class Forest {
  constructor(scene, terrain, textures, quality) {
    this.T = terrain;
    this.q = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    const barkMat = patchMaterial(new THREE.MeshStandardMaterial({ map: textures.bark, roughness: 0.88, color: 0xb8a890 }), { canopy: 'ground', tag: 'bark' });
    const leafMat = patchMaterial(new THREE.MeshStandardMaterial({ map: textures.leaf, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.72, vertexColors: true, color: 0xc8d8b8 }), { canopy: 'leaves', sway: 0.06, tag: 'leaf' });
    const blobMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x14261a, roughness: 0.98, flatShading: true }), { canopy: 'leaves', glow: false, tag: 'blob' });
    const palmMat = patchMaterial(new THREE.MeshStandardMaterial({ map: textures.palm, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7, color: 0xb0c8a0 }), { canopy: 'leaves', sway: 0.2, tag: 'palm' });
    const fernMat = patchMaterial(new THREE.MeshStandardMaterial({ map: textures.fern, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, color: 0xa8c098 }), { canopy: 'ground', sway: 1.0, tag: 'fern' });
    const vineMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x2a3320, roughness: 0.9, side: THREE.DoubleSide }), { canopy: 'ground', sway: 0.04, tag: 'vine' });
    const logMat = patchMaterial(new THREE.MeshStandardMaterial({ map: textures.bark, color: 0x7d8a60, roughness: 0.95 }), { canopy: 'ground', tag: 'log' });
    this.materials = [barkMat, leafMat, blobMat, palmMat, fernMat, vineMat, logMat];
    const hi = quality.treeRadius > 300;
    const cap = { trunk: 4200, butt: 1200, canopy: hi ? 6000 : 3600, blob: 4200, frond: 1800, fern: hi ? 2600 : 1400, vine: 1400 };
    const mk = (geo, mat, n, shadow = false) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.frustumCulled = false;
      m.count = 0;
      m.castShadow = shadow && quality.shadows;
      m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      return m;
    };
    this.trunks = mk(trunkGeometry(), barkMat, cap.trunk, true);
    this.butts = mk(buttressGeometry(), barkMat, cap.butt, true);
    this.canopyA = mk(canopyCluster(hi ? 72 : 48, 1), leafMat, cap.canopy, true);
    this.canopyB = mk(canopyCluster(hi ? 64 : 42, 2), leafMat, cap.canopy);
    this.blobs = mk(blobGeometry(), blobMat, cap.blob);
    this.fronds = mk(frondGeometry(), palmMat, cap.frond, true);
    this.ferns = mk(fernGeometry(), fernMat, cap.fern);
    this.vines = mk(vineGeometry(), vineMat, cap.vine);
    // 倒木：全部
    const logs = terrain.logs;
    this.logs = new THREE.InstancedMesh(logGeometry(), logMat, logs.length);
    this.logs.receiveShadow = true;
    logs.forEach((l, i) => {
      _p.set(l.x, (l.ga + l.gb) / 2 + l.r * 0.85, l.z);
      _q.setFromEuler(_e.set(0, -l.ang, (l.gb - l.ga) / l.len));
      _s.set(l.len, l.r, l.r);
      _m.compose(_p, _q, _s);
      this.logs.setMatrixAt(i, _m);
    });
    this.group.add(this.logs);
    this.last = new THREE.Vector3(1e9, 0, 1e9);
    this.lastFern = new THREE.Vector3(1e9, 0, 1e9);
    this.cap = cap;
  }

  update(camPos, force = false) {
    if (force || camPos.distanceTo(this.last) > 14) { this.last.copy(camPos); this._trees(camPos); }
    if (force || camPos.distanceTo(this.lastFern) > 7) { this.lastFern.copy(camPos); this._ferns(camPos); }
  }

  _trees(cam) {
    const R = this.q.treeRadius, nearR = R > 300 ? 165 : R > 220 ? 125 : 90;
    const c = { trunk: 0, butt: 0, canopy: 0, canopyB: 0, blob: 0, frond: 0, vine: 0 };
    const cap = this.cap;
    const put = (mesh, key, max) => {
      if (c[key] >= max) return;
      mesh.setMatrixAt(c[key]++, _m);
    };
    this.T.forTreesNear(cam.x, cam.z, R, (t) => {
      const dx = t.x - cam.x, dz = t.z - cam.z;
      const d = Math.hypot(dx, dz);
      if (d > R) return false;
      const near = d < nearR;
      // 树干
      const trunkH = t.type === 2 ? t.h : t.cb + (t.h - t.cb) * 0.5;
      _q.setFromAxisAngle(_p.set(0, 1, 0), t.rot);
      _m.compose(_p.set(t.x, t.g - 0.3, t.z), _q, _s.set(t.r, trunkH + 0.3, t.r));
      put(this.trunks, 'trunk', cap.trunk);
      if (t.hb > 0 && d < nearR * 1.4) {
        _m.compose(_p.set(t.x, t.g - 0.2, t.z), _q, _s.set(t.rb, t.hb + 0.4, t.rb));
        put(this.butts, 'butt', cap.butt);
      }
      if (t.type === 2) {
        _m.compose(_p.set(t.x, t.g + t.h, t.z), _q, _s.set(t.cr, t.cr, t.cr));
        put(this.fronds, 'frond', cap.frond);
        return false;
      }
      const crH = (t.h - t.cb) * 0.9;
      if (near) {
        const k = t.type === 0 ? 3 : t.type === 1 ? 2 : 1;
        for (let i = 0; i < k; i++) {
          const a = t.rot + i * 2.1;
          const off = i === 0 ? 0 : t.cr * 0.45;
          const sc = i === 0 ? 1 : 0.7;
          _q.setFromAxisAngle(_p.set(0, 1, 0), a);
          _m.compose(_p.set(t.x + Math.cos(a) * off, t.g + t.cb + (i === 0 ? crH * 0.25 : -crH * 0.15 * i + crH * 0.1), t.z + Math.sin(a) * off), _q, _s.set(t.cr * sc, crH * sc * 1.2, t.cr * sc));
          if (i % 2 === 0) put(this.canopyA, 'canopy', cap.canopy); else put(this.canopyB, 'canopyB', cap.canopy);
        }
        if (t.type === 0 && d < nearR * 0.8) {
          _q.setFromAxisAngle(_p.set(0, 1, 0), t.rot);
          _m.compose(_p.set(t.x, t.g + t.cb, t.z), _q, _s.set(t.cr * 0.6, t.cb - 1.5, t.cr * 0.6));
          put(this.vines, 'vine', cap.vine);
        }
      } else {
        _q.setFromAxisAngle(_p.set(0, 1, 0), t.rot);
        _m.compose(_p.set(t.x, t.g + t.cb + crH * 0.45, t.z), _q, _s.set(t.cr, crH * 1.1, t.cr));
        put(this.blobs, 'blob', cap.blob);
      }
      return false;
    });
    this.trunks.count = c.trunk; this.butts.count = c.butt; this.canopyA.count = c.canopy; this.canopyB.count = c.canopyB;
    this.blobs.count = c.blob; this.fronds.count = c.frond; this.vines.count = c.vine;
    for (const m of [this.trunks, this.butts, this.canopyA, this.canopyB, this.blobs, this.fronds, this.vines]) m.instanceMatrix.needsUpdate = true;
    this.counts = c;
  }

  _ferns(cam) {
    const R = this.q.fernRadius, cell = 3.6;
    let n = 0;
    const T = this.T;
    const i0 = Math.floor((cam.x - R) / cell), i1 = Math.floor((cam.x + R) / cell);
    const j0 = Math.floor((cam.z - R) / cell), j1 = Math.floor((cam.z + R) / cell);
    for (let j = j0; j <= j1 && n < this.cap.fern; j++) {
      for (let i = i0; i <= i1 && n < this.cap.fern; i++) {
        const h = hash2(i, j, 77);
        const x = (i + hash2(i, j, 1)) * cell, z = (j + hash2(i, j, 2)) * cell;
        const dx = x - cam.x, dz = z - cam.z;
        if (dx * dx + dz * dz > R * R) continue;
        const den = T.density(x, z);
        if (h > den * 0.9) continue;
        if (developedMask(x, z) > 0.05) continue;
        const g = T.height(x, z);
        if (g < 0.05) continue;
        const s = 0.9 + hash2(i, j, 3) * 1.5;
        _q.setFromAxisAngle(_p.set(0, 1, 0), hash2(i, j, 4) * 6.28);
        _m.compose(_p.set(x, g - 0.05, z), _q, _s.set(s * 1.3, s, s * 1.3));
        this.ferns.setMatrixAt(n++, _m);
      }
    }
    this.ferns.count = n;
    this.ferns.instanceMatrix.needsUpdate = true;
  }
}
