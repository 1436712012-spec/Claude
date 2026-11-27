// The architecture of the Library, shared by the GPU ray marcher and the CPU
// (picking, collision, the book that flies off the shelf). One source of truth:
// the GLSL constants are generated from this object.
//
// Frame: x runs along the corridor, y is up, z across. Each cell holds one
// hexagonal gallery centred at the origin (flat sides facing ±x) and half of
// the hallway on each side. Cells repeat every PX along x and HF along y.

export const G = (() => {
  const g = {
    A: 4.2, // gallery apothem: centre to the front plane of the shelves
    D: 0.36, // depth of the shelf recess behind that plane
    HC: 2.5, // ceiling height
    HF: 2.85, // floor-to-floor pitch
    AS: 1.5, // apothem of the air shaft
    LH: 5.0, // hallway length between two galleries
    HW: 0.8, // hallway half width
    HH: 2.25, // hallway height
    RW: 1.5, // stair well radius
    REYE: 0.42, // radius of the open eye of the spiral stair
    ZW: 1.9, // stair well centre (z), beside the hallway
    Y0: 0.1, // lowest shelf
    Y1: 2.42, // top of the shelving
    BT: 0.03, // board thickness
    CORNER: 0.26, // solid margin at each corner of a shelf wall
    NSHELF: 5,
    NBOOK: 32,
    NSTEP: 16, // steps per turn of the stair
    LAMP_Y: 1.95,
    LAMP_Z: 2.75,
    LAMP_R: 0.16,
    WELL_LAMP_Y: 1.45,
    EYE: 1.62, // eye height of a librarian
    RAIL_H: 0.92,
  };
  g.SIDE = (2 * g.A) / Math.sqrt(3);
  g.W2 = g.SIDE / 2 - g.CORNER; // half width of the shelved part of a wall
  g.SW = (2 * g.W2) / g.NBOOK; // width of one book slot
  g.HS = (g.Y1 - g.Y0) / g.NSHELF; // shelf pitch
  g.PX = 2 * g.A + g.LH; // cell length along the corridor
  g.RISE = g.HF / g.NSTEP;
  return Object.freeze(g);
})();

// Shelf walls: normal angles 60°, 120°, 240°, 300° → wall 0..3.
export const WALL_ANGLES = [60, 120, 240, 300].map((d) => (d * Math.PI) / 180);

export function glslConstants() {
  return Object.entries(G)
    .map(([k, v]) => `const float ${k} = ${Number.isInteger(v) ? v.toFixed(1) : v.toFixed(6)};`)
    .join('\n');
}

// ---------------------------------------------------------------- hashing

/** 32-bit integer hash; the GLSL version is bit-identical. */
export function hash(x) {
  x |= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

export function cellSeed(seeds, cx, cy) {
  const a = hash((seeds[0] + cx) >>> 0);
  const b = hash((a ^ ((seeds[1] + cy) >>> 0)) >>> 0);
  return hash((b ^ seeds[2]) >>> 0);
}

/** Seed of one book; `shelfB` counts shelves from the bottom (0..4). */
export function bookSeed(cseed, wall, shelfB, slot) {
  const k = (Math.imul(wall * 5 + shelfB + 1, 0x9e3779b1) ^ Math.imul(slot + 1, 0x85ebca77)) >>> 0;
  return hash((cseed ^ k) >>> 0);
}

export function rnd(seed, k) {
  return hash((seed + k) >>> 0) / 4294967296;
}

/** Physical parameters of a book in its wall frame (u along wall, v into recess). */
export function bookParams(seed, shelfB, slot) {
  const tf = 0.8 + 0.17 * rnd(seed, 1);
  const h = (0.6 + 0.33 * rnd(seed, 2)) * (G.HS - G.BT - 0.03);
  const vf = 0.008 + 0.045 * rnd(seed, 3);
  const jitter = (rnd(seed, 4) - 0.5) * G.SW * (1 - tf) * 0.9;
  const uc = -G.W2 + (slot + 0.5) * G.SW + jitter;
  const y0 = G.Y0 + shelfB * G.HS;
  return {
    uc,
    halfT: (G.SW * tf) / 2,
    y0,
    h,
    vf,
    vb: G.D - 0.02,
  };
}

// ---------------------------------------------------------------- frames

export function hexApo(x, z) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  return Math.max(ax, ax * 0.5 + az * 0.8660254);
}

/** Which side of the hexagon a point faces: 0..5 (sides 0 and 3 are the free ones). */
export function sector(x, z) {
  const a = Math.atan2(z, x);
  return ((Math.round(a / (Math.PI / 3)) % 6) + 6) % 6;
}

const SECTOR_TO_WALL = [-1, 0, 1, -1, 2, 3];
export function wallOfSector(s) {
  return SECTOR_TO_WALL[s];
}

export function wallFrame(wall) {
  const t = WALL_ANGLES[wall];
  return { n: [Math.cos(t), Math.sin(t)], t: [-Math.sin(t), Math.cos(t)] };
}

export function cellOf(x, y) {
  const cx = Math.floor((x + G.PX / 2) / G.PX);
  const cy = Math.floor(y / G.HF);
  return { cx, cy, lx: x - cx * G.PX, ly: y - cy * G.HF };
}

// ---------------------------------------------------------------- CPU SDF (coarse)

function sdBox3(px, py, pz, bx, by, bz) {
  const qx = Math.abs(px) - bx;
  const qy = Math.abs(py) - by;
  const qz = Math.abs(pz) - bz;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0);
}

/**
 * Coarse distance to solid matter, good enough for picking: books are a flat
 * plane just behind the shelf front, steps and balusters are omitted.
 */
export function coarseSDF(x, y, z) {
  const { lx, ly } = cellOf(x, y);
  const ax = Math.abs(lx);
  const hx = hexApo(lx, z);
  const sec = sector(lx, z);
  const shelfSide = wallOfSector(sec) >= 0;
  const aEff = shelfSide ? G.A + 0.03 : G.A;
  let air = Math.max(hx - aEff, Math.max(-ly, ly - G.HC));
  air = Math.min(air, hx - G.AS);
  const hc = (G.A - 0.5 + G.PX / 2 + 1.0) / 2;
  const hh = (G.PX / 2 + 1.0 - (G.A - 0.5)) / 2;
  air = Math.min(air, sdBox3(ax - hc, ly - G.HH / 2, z, hh, G.HH / 2, G.HW));
  const wx = lx - Math.sign(lx || 1) * (G.PX / 2);
  const well = Math.max(Math.hypot(wx, z - G.ZW) - G.RW, G.HW - z);
  air = Math.min(air, well);
  air = Math.min(air, Math.max(Math.max(Math.hypot(wx, z - G.ZW) - G.RW, G.HW - 0.3 - z), Math.max(-ly, ly - G.HH)));
  let d = -air;
  // railing as a solid ring
  const rail = Math.max(Math.max(G.AS + 0.02 - hx, hx - (G.AS + 0.12)), Math.max(-ly, ly - G.RAIL_H));
  d = Math.min(d, rail);
  // lamps
  for (const s of [-1, 1]) {
    d = Math.min(d, Math.hypot(lx, ly - G.LAMP_Y, z - s * G.LAMP_Z) - G.LAMP_R);
  }
  return d;
}

/**
 * Cast a ray in anchor-local space. Returns the first hit with what it is.
 * kind: 'book' (with cell, wall, shelf, slot), 'shaft' (ray fell through the
 * shaft for a long way), or 'surface'.
 */
export function castRay(ro, rd, maxT = 40) {
  let t = 0.02;
  for (let i = 0; i < 220 && t < maxT; i++) {
    const x = ro[0] + rd[0] * t;
    const y = ro[1] + rd[1] * t;
    const z = ro[2] + rd[2] * t;
    const d = coarseSDF(x, y, z);
    if (d < 0.002) return describeHit([x, y, z], t);
    t += Math.max(d * 0.9, 0.004);
  }
  return { kind: 'none', t };
}

export function describeHit(p, t) {
  const { cx, cy, lx, ly } = cellOf(p[0], p[1]);
  const z = p[2];
  const sec = sector(lx, z);
  const wall = wallOfSector(sec);
  if (wall >= 0 && ly > G.Y0 && ly < G.Y1 - G.BT) {
    const f = wallFrame(wall);
    const u = lx * f.t[0] + z * f.t[1];
    const v = lx * f.n[0] + z * f.n[1] - G.A;
    if (Math.abs(u) < G.W2 && v > -0.05) {
      const shelfB = Math.min(G.NSHELF - 1, Math.floor((ly - G.Y0) / G.HS));
      const slot = Math.min(G.NBOOK - 1, Math.max(0, Math.floor((u + G.W2) / G.SW)));
      return { kind: 'book', t, p, cx, cy, wall, shelfB, shelf: G.NSHELF - 1 - shelfB, slot };
    }
  }
  return { kind: 'surface', t, p, cx, cy };
}

/** World-space pose of a book on its shelf (centre, orthonormal axes, half extents). */
export function bookPose(seeds, cx, cy, wall, shelfB, slot) {
  const cs = cellSeed(seeds, cx, cy);
  const seed = bookSeed(cs, wall, shelfB, slot);
  const bp = bookParams(seed, shelfB, slot);
  const f = wallFrame(wall);
  const vMid = (bp.vf + bp.vb) / 2;
  const ox = cx * G.PX;
  const oy = cy * G.HF;
  const cxw = ox + f.n[0] * (G.A + vMid) + f.t[0] * bp.uc;
  const czw = f.n[1] * (G.A + vMid) + f.t[1] * bp.uc;
  return {
    seed,
    center: [cxw, oy + bp.y0 + bp.h / 2, czw],
    // axes: X = along the wall (thickness), Y = up (height), Z = into the wall (depth)
    axes: [
      [f.t[0], 0, f.t[1]],
      [0, 1, 0],
      [f.n[0], 0, f.n[1]],
    ],
    half: [bp.halfT, bp.h / 2, (bp.vb - bp.vf) / 2],
    params: bp,
  };
}

// ---------------------------------------------------------------- walking

const BODY = 0.28;

/** Signed distance to the edge of the walkable floor (negative = walkable), in cell-local xz. */
export function walkSDF(lx, z) {
  const hx = hexApo(lx, z);
  const ring = Math.max(hx - (G.A - BODY - 0.05), G.AS + 0.12 + BODY - hx);
  const ax = Math.abs(lx);
  const hc = (G.A - 1.0 + G.PX / 2 + 1.0) / 2;
  const hh = (G.PX / 2 + 1.0 - (G.A - 1.0)) / 2;
  const qx = Math.abs(ax - hc) - hh;
  const qz = Math.abs(z) - (G.HW - BODY);
  const hall = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
  return Math.min(ring, hall);
}

/** Push a point back onto the walkable floor. */
export function resolveWalk(lx, z) {
  for (let i = 0; i < 4; i++) {
    const d = walkSDF(lx, z);
    if (d <= 0) break;
    const e = 0.001;
    const gx = (walkSDF(lx + e, z) - walkSDF(lx - e, z)) / (2 * e);
    const gz = (walkSDF(lx, z + e) - walkSDF(lx, z - e)) / (2 * e);
    const gl = Math.hypot(gx, gz) || 1;
    lx -= (gx / gl) * (d + 1e-4);
    z -= (gz / gl) * (d + 1e-4);
  }
  return [lx, z];
}

/** Where the stair landing is relative to a cell, and whether a point is close to it. */
export function nearStair(lx, z) {
  const wx = lx - Math.sign(lx || 1) * (G.PX / 2);
  return { wx, dist: Math.hypot(wx, z - (G.HW - 0.3)), side: Math.sign(lx || 1) };
}

/** Closest point is at the railing (for leaping into the shaft). */
export function nearRail(lx, z) {
  const hx = hexApo(lx, z);
  return hx < G.AS + 0.12 + BODY + 0.35 && Math.abs(lx) < G.A;
}
