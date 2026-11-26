// 临界研究所与城市边缘：玻璃幕墙实验楼、温室、机库与残骸、发电机房、岗楼、通信塔、集装箱、围栏、路灯；
// 大门外的街道、加油站与楼宇。可破坏部件单独保留句柄。
import * as THREE from 'three';
import { MAP } from '../sim/config.js';
import { BUILDINGS, HANGAR, COMM_TOWER, SEARCH_TOWERS, TERMINAL, CONTAINERS, LAMP_POSTS, CITY, WRECK, DRONE_PAD } from '../sim/level.js';
import { patchMaterial } from './shaderfx.js';
import { mergeGeometries } from './forest.js';
import { mulberry32 } from '../sim/noise.js';

const G = MAP.plateauH;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

function box(w, h, d, tile = 4, opts = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (opts.capsBlack && (f === 2 || f === 3)) { uv.setXY(i, 0.001, 0.001); continue; }
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / (opts.tileY || tile));
    }
  }
  if (opts.color) {
    const c = new THREE.Color(opts.color);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return g;
}

class Batch {
  constructor() { this.list = []; }
  add(geo, x, y, z, ry = 0, rx = 0, rz = 0) {
    _q.setFromEuler(_e.set(rx, ry, rz));
    _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
    geo.applyMatrix4(_m);
    this.list.push(geo);
    return geo;
  }
  mesh(mat, shadow = true) {
    if (!this.list.length) return null;
    const m = new THREE.Mesh(mergeGeometries(this.list), mat);
    m.castShadow = shadow; m.receiveShadow = true;
    return m;
  }
}

export function buildCompound(scene, terrain, textures, quality) {
  const root = new THREE.Group();
  scene.add(root);
  const fx = (mat, o = {}) => patchMaterial(mat, { canopy: 'none', ...o });
  const M = {
    panel: fx(new THREE.MeshStandardMaterial({ map: textures.panel, roughness: 0.55, metalness: 0.05, color: 0xe6eaec })),
    concrete: fx(new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.8, color: 0xa8a8a2 })),
    metal: fx(new THREE.MeshStandardMaterial({ map: textures.corrugated, roughness: 0.6, metalness: 0.45, color: 0x8d968e, side: THREE.DoubleSide })),
    container: fx(new THREE.MeshStandardMaterial({ map: textures.corrugated, roughness: 0.62, metalness: 0.35, vertexColors: true })),
    dark: fx(new THREE.MeshStandardMaterial({ color: 0x2d3033, roughness: 0.55, metalness: 0.6 })),
    steel: fx(new THREE.MeshStandardMaterial({ color: 0x6d7378, roughness: 0.4, metalness: 0.8 })),
    glass: new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.42, envMapIntensity: 1.6, depthWrite: false }),
    ghGlass: new THREE.MeshStandardMaterial({ color: 0x9fb4a8, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.22, envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide }),
    labInside: fx(new THREE.MeshStandardMaterial({ color: 0x0b0e10, emissive: 0xdde8ee, emissiveMap: textures.labInterior, emissiveIntensity: 1.6, roughness: 0.9 }), { flicker: true }),
    cityWin: new THREE.MeshStandardMaterial({ color: 0x15161a, map: textures.concrete, emissive: 0xffd9a0, emissiveMap: textures.windows, emissiveIntensity: 1.25, roughness: 0.85 }),
    cityWin2: new THREE.MeshStandardMaterial({ color: 0x15171b, map: textures.concrete, emissive: 0xdfe8ff, emissiveMap: textures.windowsCool, emissiveIntensity: 1.0, roughness: 0.85 }),
    barrackWin: fx(new THREE.MeshStandardMaterial({ color: 0x8a8f8a, map: textures.panel, emissive: 0xffd9a0, emissiveMap: textures.windows, emissiveIntensity: 0.9, roughness: 0.7 }), { flicker: true }),
    lampHead: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff2dc, emissiveIntensity: 5 }),
    sodium: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffa94f, emissiveIntensity: 6 }),
    workLight: fx(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff6e6, emissiveIntensity: 7 }), { flicker: true }),
    redLight: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xe5483b, emissiveIntensity: 6 }),
    chain: new THREE.MeshStandardMaterial({ map: textures.chainlink, alphaTest: 0.35, side: THREE.DoubleSide, color: 0xb8bcb8, metalness: 0.7, roughness: 0.45 }),
    tarp: fx(new THREE.MeshStandardMaterial({ color: 0x2f4a3a, roughness: 0.7, side: THREE.DoubleSide })),
    pearl: fx(new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.32, metalness: 0.15, envMapIntensity: 1.2 })),
    asphalt: fx(new THREE.MeshStandardMaterial({ map: textures.asphalt, color: 0x5a5a5c, roughness: 0.25, metalness: 0.0 })),
    gasCanopy: new THREE.MeshStandardMaterial({ color: 0xe8ecef, emissive: 0xffffff, emissiveIntensity: 2.2, roughness: 0.5 }),
  };
  patchMaterial(M.chain, { canopy: 'none', tag: 'chain' });
  const out = { root, materials: M, panes: null, paneIndex: new Map(), fenceIndex: new Map(), containers: new Map(), towers: new Map(), lamps: null, lampIndex: new Map() };

  const B = { panel: new Batch(), concrete: new Batch(), metal: new Batch(), dark: new Batch(), steel: new Batch(), tarp: new Batch(), lab: new Batch(), barrack: new Batch(), work: new Batch(), red: new Batch(), lampHead: new Batch(), sodium: new Batch(), cityA: new Batch(), cityB: new Batch(), asphalt: new Batch(), gas: new Batch(), pearl: new Batch() };

  // ---------- 实验楼 ----------
  const lab = BUILDINGS.find((b) => b.id === 'lab');
  B.lab.add(box(lab.w - 1.2, lab.h - 0.6, lab.d - 1.2, lab.w, { tileY: lab.h, capsBlack: true }), lab.x, G + lab.h / 2 - 0.3, lab.z);
  B.panel.add(box(lab.w + 0.8, 0.9, lab.d + 0.8, 4), lab.x, G + lab.h + 0.1, lab.z);
  B.panel.add(box(lab.w + 0.4, 0.5, lab.d + 0.4, 4), lab.x, G + 0.25, lab.z);
  for (let f = 1; f < 3; f++) B.panel.add(box(lab.w + 0.5, 0.35, lab.d + 0.5, 4), lab.x, G + f * (lab.h / 3), lab.z);
  // 竖向窗框
  for (let i = 0; i <= 24; i++) B.dark.add(box(0.18, lab.h, 0.25), lab.x - lab.w / 2 + i * (lab.w / 24), G + lab.h / 2, lab.z + lab.d / 2 + 0.12);
  for (let i = 0; i <= 10; i++) {
    B.dark.add(box(0.25, lab.h, 0.18), lab.x + lab.w / 2 + 0.12, G + lab.h / 2, lab.z - lab.d / 2 + i * (lab.d / 10));
    B.dark.add(box(0.25, lab.h, 0.18), lab.x - lab.w / 2 - 0.12, G + lab.h / 2, lab.z - lab.d / 2 + i * (lab.d / 10));
  }
  // 楼顶设备
  for (let i = 0; i < 5; i++) B.steel.add(box(3, 1.6, 2.2, 2), lab.x - 24 + i * 9, G + lab.h + 1.3, lab.z - 6 + (i % 2) * 8);
  // ---------- 温室 ----------
  const gh = BUILDINGS.find((b) => b.id === 'greenhouse');
  const ghWall = 3, ghRise = 4;
  for (let i = 0; i <= 12; i++) {
    const x = gh.x - gh.w / 2 + i * (gh.w / 12);
    B.steel.add(box(0.15, ghWall, 0.15), x, G + ghWall / 2, gh.z + gh.d / 2);
    B.steel.add(box(0.15, ghWall, 0.15), x, G + ghWall / 2, gh.z - gh.d / 2);
    const arch = new THREE.TorusGeometry(gh.d / 2, 0.08, 4, 18, Math.PI).rotateY(Math.PI / 2).scale(1, ghRise / (gh.d / 2), 1);
    B.steel.add(arch, x, G + ghWall, gh.z);
  }
  const ghRoof = new THREE.CylinderGeometry(gh.d / 2, gh.d / 2, gh.w, 20, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, ghRise / (gh.d / 2), 1);
  const ghRoofMesh = new THREE.Mesh(ghRoof, M.ghGlass);
  ghRoofMesh.position.set(gh.x, G + ghWall, gh.z);
  ghRoofMesh.renderOrder = 2;
  root.add(ghRoofMesh);
  // 温室里的植物（暖白生长灯）
  for (let i = 0; i < 10; i++) B.work.add(box(2.5, 0.12, 0.3), gh.x - 13 + i * 2.9, G + ghWall + 2.6, gh.z);
  for (let i = 0; i < 18; i++) B.tarp.add(new THREE.ConeGeometry(0.9, 1.8, 5), gh.x - 15 + (i % 9) * 3.6, G + 0.9, gh.z + (i < 9 ? -4 : 4));
  // ---------- 其他建筑 ----------
  for (const b of BUILDINGS) {
    if (b.id === 'lab' || b.id === 'greenhouse') continue;
    if (b.id === 'barracks') {
      B.barrack.add(box(b.w, b.h, b.d, 12, { tileY: 12, capsBlack: true }), b.x, G + b.h / 2, b.z);
      B.metal.add(box(b.w + 1.5, 0.3, b.d + 2.5, 4), b.x, G + b.h + 0.15, b.z);
      B.tarp.add(new THREE.PlaneGeometry(12, 5), b.x - 8, G + 2.8, b.z + b.d / 2 + 2.4, 0, -1.2);
    } else if (b.id === 'motorpool') {
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.dark.add(box(0.3, b.h, 0.3), b.x + ox * b.w / 2, G + b.h / 2, b.z + oz * b.d / 2);
      B.metal.add(box(b.w + 1, 0.25, b.d + 1, 4), b.x, G + b.h, b.z);
    } else if (b.id === 'generator') {
      B.concrete.add(box(b.w, b.h, b.d, 4), b.x, G + b.h / 2, b.z);
      B.dark.add(new THREE.CylinderGeometry(0.4, 0.4, 4, 8), b.x - 4, G + b.h + 2, b.z - 2);
      B.dark.add(new THREE.CylinderGeometry(0.4, 0.4, 4, 8), b.x - 2, G + b.h + 2, b.z - 2);
      B.steel.add(new THREE.CylinderGeometry(1.6, 1.6, 7, 14).rotateZ(Math.PI / 2), b.x + 12, G + 1.7, b.z);
    } else {
      B.panel.add(box(b.w, b.h, b.d, 4), b.x, G + b.h / 2, b.z);
      B.metal.add(box(b.w + 0.6, 0.25, b.d + 0.6, 4), b.x, G + b.h + 0.12, b.z);
    }
  }
  // 无人机停机坪
  B.concrete.add(box(9, 0.2, 9, 3), DRONE_PAD.x, DRONE_PAD.y - 0.1, DRONE_PAD.z);
  // ---------- 机库 ----------
  {
    const H = HANGAR;
    const x0 = H.x - H.w / 2, x1 = H.x + H.w / 2, z0 = H.z - H.d / 2, z1 = H.z + H.d / 2;
    B.metal.add(box(H.w, H.h, H.wall, 4), H.x, G + H.h / 2, z0);
    B.metal.add(box(H.w, H.h, H.wall, 4), H.x, G + H.h / 2, z1);
    B.metal.add(box(H.wall, H.h, H.d, 4), x0, G + H.h / 2, H.z);
    const side = (H.d - H.doorW) / 2;
    B.metal.add(box(H.wall, H.h, side, 4), x1, G + H.h / 2, z0 + side / 2);
    B.metal.add(box(H.wall, H.h, side, 4), x1, G + H.h / 2, z1 - side / 2);
    B.metal.add(box(H.wall, H.h - H.doorH, H.doorW, 4), x1, G + H.doorH + (H.h - H.doorH) / 2, H.z);
    B.dark.add(new THREE.CylinderGeometry(0.9, 0.9, H.doorW, 12).rotateX(Math.PI / 2), x1 + 0.6, G + H.doorH + 0.5, H.z);
    // 拱形屋顶
    const roof = new THREE.CylinderGeometry(H.d / 2 + 0.5, H.d / 2 + 0.5, H.w + 1, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.32, 1);
    roof.index && roof.index.array.reverse();
    B.metal.add(roof, H.x, G + H.h - 0.2, H.z);
    // 室内：工作灯、脚手架、平台
    B.concrete.add(box(12, 0.6, 9, 3), WRECK.x, G + 0.3, WRECK.z);
    for (const [ox, oz] of [[-7, -6], [7, -6], [-7, 6], [7, 6]]) {
      B.dark.add(new THREE.CylinderGeometry(0.06, 0.08, 6, 6), WRECK.x + ox, G + 3, WRECK.z + oz);
      B.work.add(box(1.2, 0.35, 0.6), WRECK.x + ox * 0.9, G + 6, WRECK.z + oz * 0.9, Math.atan2(ox, oz), 0.6);
    }
    for (let i = 0; i < 4; i++) B.work.add(box(0.4, 0.2, 10), H.x - 12 + i * 8, G + H.h - 1.4, H.z);
    for (let i = 0; i < 6; i++) B.steel.add(box(1.8, 1.2, 1.2, 1.5), x0 + 3 + (i % 3) * 2.2, G + 0.6 + Math.floor(i / 3) * 1.2, z1 - 2.5);
  }
  // 残骸：碎裂的珍珠灰圆盘
  const wreck = new THREE.Group();
  {
    const r = mulberry32(404);
    for (let i = 0; i < 9; i++) {
      const a0 = (i / 9) * Math.PI * 2, a1 = a0 + Math.PI * 2 / 9 * (0.7 + r() * 0.25);
      const shard = new THREE.CylinderGeometry(2.1, 2.3, 0.22, 5, 1, false, a0, a1 - a0);
      const m = new THREE.Mesh(shard, M.pearl);
      m.position.set(WRECK.x + Math.cos(a0) * r() * 0.8, G + 0.75 + r() * 0.25, WRECK.z + Math.sin(a0) * r() * 0.8);
      m.rotation.set((r() - 0.5) * 0.5, r() * 0.4, (r() - 0.5) * 0.4);
      m.castShadow = true;
      wreck.add(m);
    }
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x0a1a1c, emissive: 0x8fe3e8, emissiveIntensity: 4 });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 2), coreMat);
    core.position.set(WRECK.x, G + 1.25, WRECK.z);
    wreck.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 6, 32), coreMat);
    ring.position.copy(core.position); ring.rotation.x = Math.PI / 2;
    wreck.add(ring);
    out.core = core; out.coreRing = ring; out.coreMat = coreMat;
    // 线缆
    for (let i = 0; i < 6; i++) {
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(WRECK.x, G + 1, WRECK.z), new THREE.Vector3(WRECK.x + (r() - 0.5) * 5, G + 0.1, WRECK.z + (r() - 0.5) * 5), new THREE.Vector3(WRECK.x + (r() - 0.5) * 12, G + 0.05, WRECK.z + (r() - 0.5) * 12)]);
      wreck.add(new THREE.Mesh(new THREE.TubeGeometry(c, 12, 0.05, 4), M.dark));
    }
  }
  root.add(wreck);
  out.wreck = wreck;
  // ---------- 涵洞与排水渠 ----------
  {
    const C = MAP.culvert;
    B.concrete.add(box(C.halfW * 2 + 8, MAP.plateauH - C.ceil + 0.05, C.z1 - C.z0, 4), C.x, (C.ceil + MAP.plateauH) / 2, (C.z0 + C.z1) / 2);
    // 洞口端墙
    for (const z of [C.z1, C.z0]) {
      B.concrete.add(box(3.5, MAP.plateauH + 1.6, 1.2, 3), C.x - C.halfW - 1.75, (MAP.plateauH + 1.6) / 2 - 0.8, z);
      B.concrete.add(box(3.5, MAP.plateauH + 1.6, 1.2, 3), C.x + C.halfW + 1.75, (MAP.plateauH + 1.6) / 2 - 0.8, z);
      B.concrete.add(box(C.halfW * 2 + 7, 1.3, 1.2, 3), C.x, C.ceil + 0.65, z);
    }
    // 侧墙
    B.concrete.add(box(0.6, C.ceil + 1.6, C.z1 - C.z0, 4), C.x - C.halfW - 0.3, (C.ceil - 1.6) / 2 + 0.8, (C.z0 + C.z1) / 2);
    B.concrete.add(box(0.6, C.ceil + 1.6, C.z1 - C.z0, 4), C.x + C.halfW + 0.3, (C.ceil - 1.6) / 2 + 0.8, (C.z0 + C.z1) / 2);
    // 院内排水渠的格栅桥
    B.steel.add(box(13, 0.18, 2.2, 1), C.x, MAP.plateauH + 0.05, -216);
    // 雨中滴水的灯
    B.work.add(box(0.5, 0.15, 0.3), C.x, C.ceil - 0.2, (C.z0 + C.z1) / 2);
  }
  // ---------- 集装箱 ----------
  const contColors = [0x8a3b26, 0x2f5a78, 0x3d6a45, 0x7a7d80];
  CONTAINERS.forEach((c, i) => {
    const [cx, cz, rot, stack] = c;
    const grp = new THREE.Group();
    for (let s = 0; s < stack; s++) {
      const col = new THREE.Color(contColors[(i + s) % 4]).multiplyScalar(0.8 + ((i * 7 + s) % 3) * 0.1);
      const g = box(rot ? 2.5 : 12.2, 2.6, rot ? 12.2 : 2.5, 2.6, { color: col });
      const m = new THREE.Mesh(g, M.container);
      m.position.set(cx, G + 1.3 + s * 2.6, cz);
      m.castShadow = true; m.receiveShadow = true;
      grp.add(m);
    }
    root.add(grp);
    out.containers.set('container' + i, grp);
  });
  // ---------- 岗楼 ----------
  for (const t of SEARCH_TOWERS) {
    const grp = new THREE.Group();
    const tb = new Batch(), tm = new Batch(), tr = new Batch();
    for (const [ox, oz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) tb.add(box(0.3, t.h, 0.3), ox, t.h / 2, oz);
    for (let k = 0; k < 3; k++) {
      const y = 1.5 + k * 2.6;
      tb.add(box(3.6, 0.12, 0.12), 0, y, -1.8, 0, 0, 0.6); tb.add(box(3.6, 0.12, 0.12), 0, y, 1.8, 0, 0, -0.6);
      tb.add(box(0.12, 0.12, 3.6), -1.8, y, 0, 0, 0.6); tb.add(box(0.12, 0.12, 3.6), 1.8, y, 0, 0, -0.6);
    }
    tm.add(box(4.4, 2.2, 4.4, 2), 0, t.h + 0.1, 0);
    tm.add(box(5.2, 0.3, 5.2, 2), 0, t.h + 1.9, 0);
    tr.add(box(0.5, 0.5, 0.5), 0, t.h + 2.4, 0);
    grp.add(tb.mesh(M.dark), tm.mesh(M.metal), tr.mesh(M.redLight, false));
    // 探照灯灯头
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.9, 12).rotateX(Math.PI / 2), M.lampHead);
    lamp.position.set(0, t.h + 1.4 + 0.6, 0);
    grp.add(lamp);
    grp.position.set(t.x, G, t.z);
    grp.userData.lamp = lamp;
    root.add(grp);
    out.towers.set(t.id, grp);
  }
  // ---------- 通信塔 + 雷达 ----------
  {
    const grp = new THREE.Group();
    const tb = new Batch();
    const H = COMM_TOWER.h;
    const legs = [[0, 2.2], [2.0, -1.2], [-2.0, -1.2]];
    for (let i = 0; i < 3; i++) {
      const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 3];
      tb.add(new THREE.CylinderGeometry(0.12, 0.16, H, 5), ax * 0.6, H / 2, az * 0.6, 0, 0, 0);
      for (let k = 0; k < 11; k++) {
        const y = 1 + k * (H / 11);
        const s = 1 - (y / H) * 0.4;
        const L = Math.hypot(bx - ax, bz - az) * s * 0.6;
        const g = new THREE.CylinderGeometry(0.05, 0.05, L, 4).rotateZ(Math.PI / 2);
        tb.add(g, (ax + bx) / 2 * s * 0.6, y, (az + bz) / 2 * s * 0.6, -Math.atan2(bz - az, bx - ax));
      }
    }
    grp.add(tb.mesh(M.dark));
    const radar = new THREE.Group();
    const bar = new THREE.Mesh(box(7, 0.8, 0.5, 1), M.steel);
    bar.position.set(0, 0, 0);
    radar.add(bar);
    radar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.2, 8), M.dark));
    radar.position.set(0, H + 0.6, 0);
    grp.add(radar);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), M.redLight);
    beacon.position.set(0, H + 1.8, 0);
    grp.add(beacon);
    const pb = new THREE.Mesh(box(1.4, 1.6, 0.8, 1), M.steel);
    pb.position.set(COMM_TOWER.power.x - COMM_TOWER.x, 0.8, 0);
    grp.add(pb);
    grp.position.set(COMM_TOWER.x, G, COMM_TOWER.z);
    root.add(grp);
    out.commTower = grp; out.radar = radar; out.beacon = beacon; out.powerBox = pb;
  }
  // ---------- 卫星终端 ----------
  {
    const grp = new THREE.Group();
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.6, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), M.panel);
    dish.rotation.x = -Math.PI / 2 + 0.7; dish.rotation.z = 0.3;
    dish.position.y = 1.4;
    grp.add(dish);
    grp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.4, 6).translate(0, 0.7, 0), M.dark));
    grp.add(new THREE.Mesh(box(1, 0.6, 0.7), M.steel));
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xe5483b, emissiveIntensity: 0.3 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), ledMat);
    led.position.set(0.55, 0.45, 0);
    grp.add(led);
    grp.position.set(TERMINAL.x, TERMINAL.y - 1.6, TERMINAL.z);
    root.add(grp);
    out.terminal = grp; out.terminalLed = ledMat;
  }
  // ---------- 玻璃幕墙（实例化，可逐块打碎） ----------
  // 由渲染器根据 combat.destructibles 填充
  out.buildPanes = (destructibles) => {
    const glass = destructibles.filter((d) => d.kind === 'glass');
    const geo = new THREE.PlaneGeometry(1, 1);
    const inst = new THREE.InstancedMesh(geo, M.glass, glass.length);
    const instGH = new THREE.InstancedMesh(geo, M.ghGlass, glass.length);
    let a = 0, b = 0;
    for (const d of glass) {
      const yaw = Math.atan2(d.nx, d.nz);
      _q.setFromAxisAngle(_p.set(0, 1, 0), yaw);
      _m.compose(_p.set(d.x, d.y, d.z), _q, _s.set(d.w, d.h, 1));
      if (d.group === 'lab') { inst.setMatrixAt(a, _m); out.paneIndex.set(d.id, { mesh: inst, i: a++ }); }
      else { instGH.setMatrixAt(b, _m); out.paneIndex.set(d.id, { mesh: instGH, i: b++ }); }
    }
    inst.count = a; instGH.count = b;
    inst.renderOrder = 2; instGH.renderOrder = 2;
    root.add(inst, instGH);
  };
  // ---------- 围栏 ----------
  out.buildFences = (fences) => {
    const n = fences.length;
    const net = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 3.1).translate(0, 1.55, 0), M.chain, n);
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 5).translate(0, 1.8, 0), M.dark, n * 4);
    const wire = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 6, 1, true).rotateZ(Math.PI / 2), M.steel, n);
    let pi = 0;
    fences.forEach((f, i) => {
      const L = Math.hypot(f.bx - f.ax, f.bz - f.az);
      const yaw = -Math.atan2(f.bz - f.az, f.bx - f.ax);
      _q.setFromAxisAngle(_p.set(0, 1, 0), yaw);
      _m.compose(_p.set((f.ax + f.bx) / 2, G, (f.az + f.bz) / 2), _q, _s.set(L, 1, 1));
      net.setMatrixAt(i, _m);
      _m.compose(_p.set((f.ax + f.bx) / 2, G + 3.4, (f.az + f.bz) / 2), _q, _s.set(L, 1, 1));
      wire.setMatrixAt(i, _m);
      for (let k = 0; k < 4; k++) {
        const t = k / 4;
        _m.compose(_p.set(f.ax + (f.bx - f.ax) * t, G, f.az + (f.bz - f.az) * t), _q, _s.set(1, 1, 1));
        posts.setMatrixAt(pi++, _m);
      }
      out.fenceIndex.set(f.id, i);
    });
    posts.count = pi;
    root.add(net, posts, wire);
    out.fenceNet = net; out.fenceWire = wire; out.fencePosts = posts;
  };
  // ---------- 路灯 ----------
  {
    const n = LAMP_POSTS.length;
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 8, 6).translate(0, 4, 0), M.dark, n);
    const heads = new THREE.InstancedMesh(box(1.1, 0.25, 0.5), M.lampHead, n);
    LAMP_POSTS.forEach(([x, z], i) => {
      _m.compose(_p.set(x, G, z), _q.identity(), _s.set(1, 1, 1)); poles.setMatrixAt(i, _m);
      _m.compose(_p.set(x, G + 8, z), _q.identity(), _s.set(1, 1, 1)); heads.setMatrixAt(i, _m);
      out.lampIndex.set('lamp' + i, i);
    });
    root.add(poles, heads);
    out.lamps = heads; out.lampPoles = poles;
  }
  // 清障带泛光灯（围栏上，朝南）
  for (let x = -200; x <= 200; x += 50) B.lampHead.add(box(0.8, 0.4, 0.3), x, G + 3.9, MAP.fenceSouthZ + 0.3);
  // ---------- 城市 ----------
  CITY.blocks.forEach((b, i) => {
    const g = box(b.w, b.h, b.d, 24, { tileY: 48, capsBlack: true });
    (i % 3 === 0 ? B.cityB : B.cityA).add(g, b.x, MAP.plateauH + 0.5 + b.h / 2, b.z);
    B.dark.add(box(b.w + 0.4, 0.4, b.d + 0.4, 4), b.x, MAP.plateauH + 0.5 + b.h + 0.2, b.z);
  });
  // 街灯（钠灯）
  for (let x = -900; x <= 900; x += 32) {
    B.dark.add(new THREE.CylinderGeometry(0.08, 0.1, 7, 5), x, MAP.plateauH + 0.5 + 3.5, CITY.roadZ - 8.5);
    B.sodium.add(box(0.9, 0.2, 0.4), x, MAP.plateauH + 0.5 + 7, CITY.roadZ - 7.8);
  }
  for (let z = -560; z >= -980; z -= 34) {
    for (const s of [-1, 1]) {
      B.dark.add(new THREE.CylinderGeometry(0.08, 0.1, 7, 5), s * 9, MAP.plateauH + 0.5 + 3.5, z);
      B.sodium.add(box(0.9, 0.2, 0.4), s * 8.2, MAP.plateauH + 0.5 + 7, z);
    }
  }
  // 加油站
  {
    const gs = CITY.gasStation;
    B.gas.add(box(24, 0.6, 14), gs.x, MAP.plateauH + 0.5 + 5.4, gs.z);
    for (const [ox, oz] of [[-10, -5], [10, -5], [-10, 5], [10, 5]]) B.panel.add(box(0.5, 5.4, 0.5), gs.x + ox, MAP.plateauH + 0.5 + 2.7, gs.z + oz);
    for (let i = 0; i < 3; i++) B.panel.add(box(1, 1.8, 0.6), gs.x - 6 + i * 6, MAP.plateauH + 0.5 + 0.9, gs.z);
    B.cityA.add(box(16, 4.2, 10, 24, { tileY: 48, capsBlack: true }), gs.x + 18, MAP.plateauH + 0.5 + 2.1, gs.z - 10);
    B.red.add(box(3, 1, 0.3), gs.x, MAP.plateauH + 0.5 + 8, gs.z + 8);
  }
  // ---------- 合并 ----------
  const add = (batch, mat, shadow = true) => { const m = batch.mesh(mat, shadow && quality.shadows); if (m) root.add(m); return m; };
  add(B.panel, M.panel); add(B.concrete, M.concrete); add(B.metal, M.metal); add(B.dark, M.dark); add(B.steel, M.steel); add(B.tarp, M.tarp);
  out.labMesh = add(B.lab, M.labInside); add(B.barrack, M.barrackWin);
  add(B.work, M.workLight, false); add(B.red, M.redLight, false); add(B.lampHead, M.lampHead, false); add(B.sodium, M.sodium, false);
  add(B.cityA, M.cityWin, false); add(B.cityB, M.cityWin2, false); add(B.gas, M.gasCanopy, false);
  return out;
}
