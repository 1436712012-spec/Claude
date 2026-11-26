// 第一幕关卡布局：淹水林 → 雨林带 → 清障带 → 临界研究所 → 城市边缘。
// 纯数据 + 几何辅助函数；Terrain、Detection、Render 共用。
import { MAP } from './config.js';

// 黑水河支流：从南向北，最后进入涵洞和院内排水渠（x, z, 半宽, 河床深度）
export const RIVER = [
  [-20, 1010, 20, 1.6],
  [-60, 900, 19, 1.6],
  [-40, 800, 18, 1.6],
  [-48, 720, 17, 1.6],
  [-10, 640, 15, 1.5],
  [40, 560, 13, 1.4],
  [30, 480, 11, 1.3],
  [-20, 400, 9, 1.3],
  [-30, 320, 8, 1.2],
  [10, 240, 7.5, 1.2],
  [60, 160, 7, 1.2],
  [50, 80, 7, 1.2],
  [10, 0, 7, 1.2],
  [22, -70, 6.5, 1.2],
  [40, -120, 6, 1.2],
  [40, -140, 5.4, 1.2],
  [40, -205, 5.4, 1.2],
  [40, -258, 5.4, 1.2],
];

export const START = { x: -45, z: 728, yaw: 0 };
export const EXTRACT = { x: -122, z: 652, r: 16 };
export const WRECK = { x: -118, z: -300 };

export const WINGMAN_START = {
  echo: { x: -33, z: 738 },
  glimmer: { x: -58, z: 740 },
  bedrock: { x: -46, z: 752 },
};

// 平地化区域（研究所 + 清障带 + 城市），返回 0..1
export function developedMask(x, z) {
  const dx = Math.max(0, Math.abs(x) - 280);
  const dz = Math.max(0, z + 140);
  const rect = 1 - Math.min(1, Math.sqrt(dx * dx + dz * dz) / 30);
  const city = Math.min(1, Math.max(0, (-510 - z) / 30));
  return Math.max(rect, city);
}

export function inCompound(x, z, pad = 0) {
  return Math.abs(x) <= MAP.fenceHalfX + pad && z <= MAP.fenceSouthZ + pad && z >= MAP.fenceNorthZ - pad;
}

export function inClearing(x, z) {
  if (inCompound(x, z)) return false;
  return Math.abs(x) <= 280 && z <= -140 && z >= -540;
}

export function inCity(x, z) {
  return z < MAP.cityZ;
}

export function riverInfo(x, z) {
  let best = 1e9, bw = 6, bd = 1.2, bz = 0;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1];
    const abx = b[0] - a[0], abz = b[1] - a[1];
    const apx = x - a[0], apz = z - a[1];
    const L2 = abx * abx + abz * abz;
    let t = (apx * abx + apz * abz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a[0] + abx * t, pz = a[1] + abz * t;
    const dx = x - px, dz = z - pz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) {
      best = d;
      bw = a[2] + (b[2] - a[2]) * t;
      bd = a[3] + (b[3] - a[3]) * t;
      bz = pz;
    }
  }
  return { d: best, halfW: bw, depth: bd, z: bz };
}

// ---------- 研究所建筑（轴对齐盒子，x/z 为中心，w 沿 x，d 沿 z） ----------
export const BUILDINGS = [
  { id: 'lab', name: '实验楼', x: 62, z: -372, w: 64, d: 26, h: 12.6, kind: 'lab' },
  { id: 'greenhouse', name: '研究温室', x: 152, z: -274, w: 34, d: 18, h: 7, kind: 'greenhouse', seeThrough: true },
  { id: 'generator', name: '发电机房', x: -30, z: -458, w: 16, d: 10, h: 5.5, kind: 'generator' },
  { id: 'barracks', name: '营房与食堂', x: 150, z: -452, w: 38, d: 14, h: 4.6, kind: 'barracks' },
  { id: 'guardhouse', name: '门岗', x: 24, z: -488, w: 8, d: 6, h: 3.4, kind: 'guardhouse' },
  { id: 'droneShed', name: '无人机棚', x: -6, z: -408, w: 12, d: 10, h: 4, kind: 'shed' },
  { id: 'motorpool', name: '车棚', x: -78, z: -482, w: 22, d: 12, h: 4.2, kind: 'shed' },
];

// 机库：四面墙 + 屋顶，东侧开门
export const HANGAR = { x: -110, z: -300, w: 40, d: 30, h: 14, wall: 0.6, doorW: 17, doorH: 9 };

export const COMM_TOWER = { x: -172, z: -452, h: 34, power: { x: -166, z: -452 } };
export const SEARCH_TOWERS = [
  { id: 'towerW', name: '西岗楼', x: -150, z: -207, h: 9, yaw: Math.PI },
  { id: 'towerE', name: '东岗楼', x: 150, z: -207, h: 9, yaw: Math.PI },
];
export const TERMINAL = { x: 82, z: -376, y: 12.6 + 1.6 };
export const DRONE_PAD = { x: -6, z: -408, y: 4.2 };

export const CAMERAS = [
  { id: 'cam1', name: '1号摄像头·南围栏西', x: -62, z: -202, h: 5.2, yaw: Math.PI, sweep: 0.75 },
  { id: 'cam2', name: '2号摄像头·南围栏东', x: 104, z: -202, h: 5.2, yaw: Math.PI, sweep: 0.75 },
  { id: 'cam3', name: '3号摄像头·实验楼', x: 28, z: -357, h: 8.5, yaw: Math.PI * 0.5, sweep: 0.6 },
  { id: 'cam4', name: '4号摄像头·机库', x: -89, z: -286, h: 9.5, yaw: -Math.PI * 0.5 + 0.0, sweep: 0.6 },
];

export const EM_STATIONS = [
  { id: 'em1', name: '涵洞电磁站', x: 49, z: -216 },
  { id: 'em2', name: '实验楼电磁站', x: 38, z: -346 },
];

// 集装箱：x, z, 朝向(0=沿x), 层数
export const CONTAINERS = [
  [-48, -248, 0, 2], [-48, -252, 0, 1], [-30, -246, 0, 1], [-30, -250.2, 0, 2],
  [-62, -262, 1, 1], [-16, -268, 1, 2], [-6, -268, 1, 1], [-40, -272, 0, 1],
  [110, -228, 0, 1], [124, -230, 1, 2], [-180, -360, 1, 1], [-180, -374, 1, 2],
  [180, -380, 0, 1], [-60, -420, 0, 1],
];

export const LAMP_POSTS = [
  [-80, -240], [0, -240], [80, -240], [-60, -330], [-20, -360], [120, -330],
  [-120, -400], [40, -430], [-200, -300], [200, -300], [0, -470], [190, -230], [-190, -230],
];

// 守卫巡逻路线
export const GUARDS = [
  { id: 'gSouth', name: '南围栏巡逻', lang: 'pt', route: [[-205, -216], [205, -216]], pingpong: true, speed: 1.5 },
  { id: 'gYard', name: '堆场守卫', lang: 'es', route: [[-72, -258], [-22, -238], [12, -286], [-56, -322], [-86, -306]], speed: 1.4 },
  { id: 'gLab', name: '实验楼守卫', lang: 'en', route: [[18, -350], [104, -350], [104, -394], [18, -394]], speed: 1.4 },
  { id: 'gHangar', name: '机库巡视', lang: 'ru', route: [[0, -330], [-80, -300], [-112, -296], [-80, -302], [0, -335], [40, -320]], waits: { 2: 5 }, speed: 1.6, coreChecker: true },
  { id: 'gGen', name: '发电机房守卫', lang: 'pt', route: [[-30, -448]], idleYaw: Math.PI, phone: true },
  { id: 'gGate', name: '大门守卫', lang: 'en', route: [[10, -494]], idleYaw: 0 },
  { id: 'gEast', name: '东围栏巡逻', lang: 'es', route: [[202, -232], [202, -488]], pingpong: true, speed: 1.4 },
  { id: 'gWest', name: '西侧巡逻', lang: 'ru', route: [[-202, -236], [-202, -420], [-140, -420], [-140, -236]], speed: 1.3 },
];

// 岗楼探照灯操作员挂在岗楼上
export const TOWER_GUARDS = [
  { id: 'tW', name: '西岗楼哨兵', tower: 'towerW', lang: 'en' },
  { id: 'tE', name: '东岗楼哨兵', tower: 'towerE', lang: 'pt' },
];

export const DRONE_ROUTES = [
  { id: 'd1', name: '蜂鸟-1', alt: 14, route: [[-260, -168], [260, -168]] },
  { id: 'd2', name: '蜂鸟-2', alt: 16, route: [[-140, -250], [120, -260], [120, -420], [-140, -420]] },
  { id: 'd3', name: '蜂鸟-3', alt: 20, route: [[-262, -190], [-262, -480], [262, -480], [262, -190]] },
];

// 研究所外环路：大门 → 东 → 林边道路 → 西 → 大门
export const PERIMETER_ROAD = [[0, -522], [250, -522], [252, -168], [0, -166], [-252, -168], [-250, -522]];
export const MOTORPOOL_EXIT = [-60, -470];

// 城市：道路、街区、加油站、路人
export const CITY = {
  roadZ: -530,
  roadHalfW: 7,
  avenueX: 0,
  crossZ: -720,
  gasStation: { x: 132, z: -572 },
  blocks: [],
  civilians: [
    { id: 'c1', x: 124, z: -566 }, { id: 'c2', x: 140, z: -578 }, { id: 'c3', x: 118, z: -580 },
    { id: 'c4', x: -40, z: -545 }, { id: 'c5', x: -46, z: -547 }, { id: 'c6', x: 210, z: -546 },
    { id: 'c7', x: -180, z: -545 }, { id: 'c8', x: 14, z: -600 },
  ],
};
(function buildCityBlocks() {
  // 街区：避开大道（x≈0）与加油站
  for (let bz = -560; bz > -980; bz -= 64) {
    for (let bx = -960; bx < 960; bx += 56) {
      if (Math.abs(bx + 24) < 26) continue; // 大道
      if (Math.abs(bz - CITY.crossZ) < 30) continue;
      if (bx > 90 && bx < 180 && bz > -610) continue; // 加油站
      const s = Math.abs(Math.sin(bx * 12.9898 + bz * 78.233) * 43758.5453) % 1;
      const h = 6 + Math.floor(s * 5) * 3.2 + (bz < -700 ? 6 : 0);
      CITY.blocks.push({ x: bx + 24, z: bz - 26, w: 40 + s * 8, d: 44, h });
    }
  }
})();

// ---------- 静态盒子：碰撞 + 视线遮挡 ----------
// { id, minX, minY, minZ, maxX, maxY, maxZ, sight: 是否遮挡视线, solid: 是否碰撞, owner }
export function buildStaticBoxes(groundAt) {
  const boxes = [];
  const add = (id, cx, cz, w, d, h, opts = {}) => {
    const g = opts.base ?? groundAt(cx, cz);
    boxes.push({
      id, owner: opts.owner || id,
      minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2,
      minY: g + (opts.lift || 0), maxY: g + (opts.lift || 0) + h,
      sight: opts.sight !== false, solid: opts.solid !== false, alive: true,
      material: opts.material || 'concrete',
    });
  };
  for (const b of BUILDINGS) {
    add(b.id, b.x, b.z, b.w, b.d, b.h, { sight: !b.seeThrough, material: b.kind === 'greenhouse' ? 'glass' : 'concrete' });
  }
  // 机库墙
  const H = HANGAR, g = MAP.plateauH;
  const x0 = H.x - H.w / 2, x1 = H.x + H.w / 2, z0 = H.z - H.d / 2, z1 = H.z + H.d / 2;
  add('hangarN', H.x, z0, H.w, H.wall, H.h, { base: g, owner: 'hangar', material: 'metal' });
  add('hangarS', H.x, z1, H.w, H.wall, H.h, { base: g, owner: 'hangar', material: 'metal' });
  add('hangarW', x0, H.z, H.wall, H.d, H.h, { base: g, owner: 'hangar', material: 'metal' });
  const sideLen = (H.d - H.doorW) / 2;
  add('hangarE1', x1, z0 + sideLen / 2, H.wall, sideLen, H.h, { base: g, owner: 'hangar', material: 'metal' });
  add('hangarE2', x1, z1 - sideLen / 2, H.wall, sideLen, H.h, { base: g, owner: 'hangar', material: 'metal' });
  add('hangarLintel', x1, H.z, H.wall, H.doorW, H.h - H.doorH, { base: g, lift: H.doorH, owner: 'hangar', material: 'metal' });
  add('hangarRoof', H.x, H.z, H.w, H.d, 0.8, { base: g, lift: H.h - 0.8, owner: 'hangar', material: 'metal' });
  // 集装箱
  CONTAINERS.forEach((c, i) => {
    const [cx, cz, rot, stack] = c;
    const w = rot ? 2.5 : 12.2, d = rot ? 12.2 : 2.5;
    add('container' + i, cx, cz, w, d, 2.6 * stack, { base: g, material: 'container', owner: 'container' + i });
  });
  // 岗楼平台（腿之间可穿过，平台遮挡）
  for (const t of SEARCH_TOWERS) {
    add(t.id + 'Cabin', t.x, t.z, 4.2, 4.2, 3, { base: g, lift: t.h - 1, owner: t.id, material: 'metal' });
    for (const [ox, oz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) {
      add(t.id + 'Leg' + ox + oz, t.x + ox, t.z + oz, 0.35, 0.35, t.h - 1, { base: g, owner: t.id, sight: false, material: 'metal' });
    }
  }
  // 通信塔塔基
  add('commBase', COMM_TOWER.x, COMM_TOWER.z, 6, 6, COMM_TOWER.h, { base: g, sight: false, owner: 'commTower', material: 'metal' });
  // 涵洞顶板（遮挡上方视线；碰撞由天花板约束处理）
  const C = MAP.culvert;
  add('culvertRoof', C.x, (C.z0 + C.z1) / 2, C.halfW * 2 + 6, C.z1 - C.z0, MAP.plateauH - C.ceil, { base: C.ceil, solid: false, owner: 'culvert', material: 'concrete' });
  // 城市楼宇
  CITY.blocks.forEach((b, i) => add('city' + i, b.x, b.z, b.w, b.d, b.h, { material: 'concrete', owner: 'city' }));
  // 加油站便利店
  add('gasShop', CITY.gasStation.x + 18, CITY.gasStation.z - 10, 16, 10, 4.2, { material: 'concrete', owner: 'gas' });
  return boxes;
}

// 围栏线段（碰撞高度 3.4 m，跃升可越过）
export function buildFences() {
  const F = MAP, segs = [];
  const sx = F.fenceHalfX;
  segs.push({ id: 'fenceS1', ax: -sx, az: F.fenceSouthZ, bx: -102, bz: F.fenceSouthZ, h: 3.4 });
  segs.push({ id: 'fenceS2', ax: -98, az: F.fenceSouthZ, bx: sx, bz: F.fenceSouthZ, h: 3.4 });
  segs.push({ id: 'fenceE', ax: sx, az: F.fenceSouthZ, bx: sx, bz: F.fenceNorthZ, h: 3.4 });
  segs.push({ id: 'fenceW', ax: -sx, az: F.fenceSouthZ, bx: -sx, bz: F.fenceNorthZ, h: 3.4 });
  segs.push({ id: 'fenceN1', ax: -sx, az: F.fenceNorthZ, bx: -13, bz: F.fenceNorthZ, h: 3.4 });
  segs.push({ id: 'fenceN2', ax: 13, az: F.fenceNorthZ, bx: sx, bz: F.fenceNorthZ, h: 3.4 });
  // 切成约 10 m 一段，便于被打穿
  const out = [];
  for (const g of segs) {
    const L = Math.hypot(g.bx - g.ax, g.bz - g.az);
    const n = Math.max(1, Math.round(L / 10));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      out.push({ id: g.id + '_' + i, ax: g.ax + (g.bx - g.ax) * t0, az: g.az + (g.bz - g.az) * t0, bx: g.ax + (g.bx - g.ax) * t1, bz: g.az + (g.bz - g.az) * t1, h: g.h, broken: false, hp: 90 });
    }
  }
  return out;
}

export const GATES = [
  { id: 'south', inner: [-100, -207], outer: [-100, -193] },
  { id: 'north', inner: [0, -493], outer: [0, -508] },
];
