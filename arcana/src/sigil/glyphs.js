// Glyph vocabulary of the magic circle.
//
// * Operators get hand-drawn runic forms that still read as math.
// * Names (spells, variables, parameters) get a procedural rune: a stem with
//   branches, seeded by the name, so `fib` looks the same everywhere.
// * Integers are written in Cistercian numerals — the medieval monks' cipher
//   that writes any number from 1 to 9999 as a single glyph on one stem.
//
// All shapes live in a [-1, 1] box: { segs: [[x1,y1,x2,y2]], rings: [[x,y,r]], dots: [[x,y]] }

import { hashString, mulberry32 } from './random.js';

const shape = (segs = [], rings = [], dots = []) => ({ segs, rings, dots });

// ---------------------------------------------------------------- operators
const OPS = {
  '+': shape([[0, -0.9, 0, 0.9], [-0.9, 0, 0.9, 0], [-0.9, -0.25, -0.9, 0.25], [0.9, -0.25, 0.9, 0.25]]),
  '-': shape([[-0.9, 0, 0.9, 0], [-0.9, -0.3, -0.9, 0.3], [0.9, -0.3, 0.9, 0.3]]),
  '*': shape([[0, -0.95, 0, 0.95], [-0.82, -0.47, 0.82, 0.47], [-0.82, 0.47, 0.82, -0.47]]),
  '/': shape([[-0.9, 0, 0.9, 0]], [], [[0, -0.55], [0, 0.55]]),
  '%': shape([[-0.75, 0.85, 0.75, -0.85]], [[-0.48, -0.45, 0.22], [0.48, 0.45, 0.22]]),
  '^': shape([[0, 0.9, 0, -0.75], [-0.6, -0.15, 0, -0.85], [0.6, -0.15, 0, -0.85]]),
  '<': shape([[0.7, -0.8, -0.7, 0], [-0.7, 0, 0.7, 0.8]]),
  '>': shape([[-0.7, -0.8, 0.7, 0], [0.7, 0, -0.7, 0.8]]),
  '<=': shape([[0.7, -0.9, -0.7, -0.25], [-0.7, -0.25, 0.7, 0.4], [-0.7, 0.85, 0.7, 0.85]]),
  '>=': shape([[-0.7, -0.9, 0.7, -0.25], [0.7, -0.25, -0.7, 0.4], [-0.7, 0.85, 0.7, 0.85]]),
  '==': shape([[-0.85, -0.32, 0.85, -0.32], [-0.85, 0.32, 0.85, 0.32]]),
  '!=': shape([[-0.85, -0.32, 0.85, -0.32], [-0.85, 0.32, 0.85, 0.32], [0.45, -0.9, -0.45, 0.9]]),
  and: shape([[-0.8, 0.75, 0, -0.75], [0, -0.75, 0.8, 0.75]], [], [[0, 0.55]]),
  or: shape([[-0.8, -0.75, 0, 0.75], [0, 0.75, 0.8, -0.75]], [], [[0, -0.55]]),
  not: shape([[-0.85, -0.2, 0.75, -0.2], [0.75, -0.2, 0.75, 0.55]]),
  neg: shape([[-0.7, 0, 0.7, 0]], [], [[0, -0.5]]),
  if: shape([[0, 0.9, 0, 0.05], [0, 0.05, -0.7, -0.75], [0, 0.05, 0.7, -0.75]], [[-0.7, -0.75, 0.16], [0.7, -0.75, 0.16]]),
  let: shape([[-0.15, 0, 0.9, 0], [0.9, -0.3, 0.9, 0.3]], [[-0.5, 0, 0.36]]),
  true: shape(
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return [Math.cos(a) * 0.62, Math.sin(a) * 0.62, Math.cos(a) * 0.95, Math.sin(a) * 0.95];
    }),
    [[0, 0, 0.38]],
  ),
  false: (() => {
    // crescent moon: outer half circle and an inner half ellipse, as segments
    const N = 12;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = -Math.PI / 2 + (i / N) * Math.PI;
      pts.push([0.25 - 0.85 * Math.cos(t), 0.85 * Math.sin(t)]);
    }
    for (let i = 1; i <= N; i++) {
      const t = Math.PI / 2 - (i / N) * Math.PI;
      pts.push([0.25 - 0.32 * Math.cos(t), 0.85 * Math.sin(t)]);
    }
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
    return shape(segs);
  })(),
};

export function opGlyph(op) {
  return OPS[op] || OPS['+'];
}

// ------------------------------------------------------------ procedural rune
const STEM_Y = [-1, -0.5, 0, 0.5, 1];

/**
 * A rune seeded by a string. Elder-Futhark-like: a stem, two or three
 * branches, sometimes mirrored, sometimes a bow or a dot.
 */
export function runeGlyph(name, salt = 0) {
  const rnd = mulberry32(hashString(name) ^ (salt * 0x9e3779b9));
  const segs = [];
  const rings = [];
  const dots = [];
  const stem = rnd() > 0.12;
  if (stem) segs.push([0, -1, 0, 1]);
  const mirror = rnd() < 0.32;
  const count = 1 + Math.floor(rnd() * 3);
  const keys = new Set();
  for (let k = 0; k < count; k++) {
    const kind = rnd();
    const side = rnd() < 0.5 ? -1 : 1;
    const ia = Math.floor(rnd() * STEM_Y.length);
    const ya = STEM_Y[ia];
    let seg;
    if (kind < 0.62) {
      // diagonal branch from the stem
      const dir = rnd() < 0.5 ? -1 : 1;
      const yb = Math.max(-1, Math.min(1, ya + dir * (rnd() < 0.6 ? 0.5 : 1)));
      if (yb === ya) continue;
      seg = [0, ya, 0.62 * side, yb];
    } else if (kind < 0.82) {
      // bow: a closed triangle hanging off the stem (like thurisaz)
      const y0 = Math.max(-1, ya - 0.5), y1 = Math.min(1, y0 + 1);
      const key = `bow${side}${y0}`;
      if (keys.has(key)) continue;
      keys.add(key);
      segs.push([0, y0, 0.6 * side, (y0 + y1) / 2], [0.6 * side, (y0 + y1) / 2, 0, y1]);
      if (mirror) segs.push([0, y0, -0.6 * side, (y0 + y1) / 2], [-0.6 * side, (y0 + y1) / 2, 0, y1]);
      continue;
    } else {
      // crossbar
      seg = [-0.45, ya * 0.85, 0.45, ya * 0.85 + (rnd() < 0.5 ? 0 : 0.35 * side)];
    }
    const key = seg.map((v) => v.toFixed(2)).join(',');
    if (keys.has(key)) continue;
    keys.add(key);
    segs.push(seg);
    if (mirror && seg[0] === 0) segs.push([0, seg[1], -seg[2], seg[3]]);
  }
  if (!stem) {
    // without a stem, make sure the rune still has a spine: an X or a diamond
    if (rnd() < 0.5) segs.push([-0.6, -1, 0.6, 1], [0.6, -1, -0.6, 1]);
    else segs.push([0, -1, 0.6, 0], [0.6, 0, 0, 1], [0, 1, -0.6, 0], [-0.6, 0, 0, -1]);
  }
  if (rnd() < 0.22) dots.push([(rnd() < 0.5 ? -1 : 1) * 0.38, STEM_Y[1 + Math.floor(rnd() * 3)]]);
  if (rnd() < 0.12) rings.push([0, -1.05, 0.2]);
  return shape(segs, rings, dots);
}

// ------------------------------------------------------ Cistercian numerals
// Unit digit shapes in the top-right quadrant; u = away from stem, v = down
// from the stem's end. Other places are mirrors of these.
const CIST = {
  1: [[0, 0, 1, 0]],
  2: [[0, 1, 1, 1]],
  3: [[0, 0, 1, 1]],
  4: [[0, 1, 1, 0]],
  5: [[0, 0, 1, 0], [0, 1, 1, 0]],
  6: [[1, 0, 1, 1]],
  7: [[0, 0, 1, 0], [1, 0, 1, 1]],
  8: [[0, 1, 1, 1], [1, 0, 1, 1]],
  9: [[0, 0, 1, 0], [0, 1, 1, 1], [1, 0, 1, 1]],
};

export function cistercianGlyph(value) {
  const segs = [[0, -1, 0, 1]];
  const dots = [];
  if (!Number.isFinite(value)) return shape(segs, [[0, 0, 0.4]]);
  let n = Math.round(Math.abs(value));
  const fractional = !Number.isInteger(value);
  if (n > 9999) {
    // beyond the cipher: an overflow mark (ring on the stem)
    return shape(segs, [[0, 0, 0.35]], [[0.5, 0], [-0.5, 0]]);
  }
  const W = 0.62, H = 0.62;
  const places = [
    { sx: 1, sy: 1, top: true },   // units: top right
    { sx: -1, sy: 1, top: true },  // tens: top left
    { sx: 1, sy: -1, top: false }, // hundreds: bottom right
    { sx: -1, sy: -1, top: false } // thousands: bottom left
  ];
  for (let p = 0; p < 4; p++) {
    const d = n % 10; n = Math.floor(n / 10);
    if (!d) continue;
    const pl = places[p];
    for (const [u1, v1, u2, v2] of CIST[d]) {
      const map = (u, v) => [u * W * pl.sx, pl.top ? -1 + v * H : 1 - v * H];
      const [x1, y1] = map(u1, v1); const [x2, y2] = map(u2, v2);
      segs.push([x1, y1, x2, y2]);
    }
  }
  if (value < 0) segs.push([-0.28, 0, 0.28, 0]);
  if (fractional) dots.push([0.34, 0.08]);
  return shape(segs, [], dots);
}

// --------------------------------------------------------------- text runes
const PUNCT = {
  '(': shape([[0.25, -0.8, -0.2, 0], [-0.2, 0, 0.25, 0.8]]),
  ')': shape([[-0.25, -0.8, 0.2, 0], [0.2, 0, -0.25, 0.8]]),
  ',': shape([[0.1, 0.5, -0.15, 0.95]]),
  '=': shape([[-0.5, -0.25, 0.5, -0.25], [-0.5, 0.25, 0.5, 0.25]]),
  '+': OPS['+'], '-': OPS['-'], '*': OPS['*'], '/': OPS['/'], '%': OPS['%'], '^': OPS['^'],
  '<': OPS['<'], '>': OPS['>'], '!': shape([[0, -0.9, 0, 0.35]], [], [[0, 0.8]]),
  '#': shape([[-0.3, -0.8, -0.3, 0.8], [0.3, -0.8, 0.3, 0.8], [-0.7, -0.3, 0.7, -0.3], [-0.7, 0.3, 0.7, 0.3]]),
  "'": shape([[0, -1, 0, -0.5]]),
};

/** Glyph for a single source character in the outer band. */
export function charGlyph(ch) {
  if (PUNCT[ch]) return PUNCT[ch];
  if (ch >= '0' && ch <= '9') return cistercianGlyph(Number(ch));
  return runeGlyph(ch, 7);
}

// ------------------------------------------------------------ path emission
const f1 = (v) => (Math.round(v * 10) / 10).toString();

/** Serialise a glyph to SVG path data at (cx, cy) with half-size s, rotated by rot. */
export function glyphPath(g, cx, cy, s, rot = 0) {
  const c = Math.cos(rot), sn = Math.sin(rot);
  const tx = (x, y) => cx + (x * c - y * sn) * s;
  const ty = (x, y) => cy + (x * sn + y * c) * s;
  let d = '';
  for (const [x1, y1, x2, y2] of g.segs) {
    d += `M${f1(tx(x1, y1))} ${f1(ty(x1, y1))}L${f1(tx(x2, y2))} ${f1(ty(x2, y2))}`;
  }
  for (const [x, y, r] of g.rings) d += circleD(tx(x, y), ty(x, y), r * s);
  return d;
}

export function glyphDots(g, cx, cy, s, rot = 0, dotR = 0.12) {
  const c = Math.cos(rot), sn = Math.sin(rot);
  let d = '';
  for (const [x, y] of g.dots) d += circleD(cx + (x * c - y * sn) * s, cy + (x * sn + y * c) * s, dotR * s);
  return d;
}

export function circleD(cx, cy, r) {
  return `M${f1(cx + r)} ${f1(cy)}A${f1(r)} ${f1(r)} 0 1 0 ${f1(cx - r)} ${f1(cy)}A${f1(r)} ${f1(r)} 0 1 0 ${f1(cx + r)} ${f1(cy)}Z`;
}

export function polygonD(cx, cy, r, sides, rot = -Math.PI / 2) {
  let d = '';
  for (let i = 0; i <= sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    d += `${i ? 'L' : 'M'}${f1(cx + Math.cos(a) * r)} ${f1(cy + Math.sin(a) * r)}`;
  }
  return d + 'Z';
}

export { f1 };
