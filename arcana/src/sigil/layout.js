// Radial layout of one spell's syntax tree into a magic circle.
//
// Reading the circle, from the rim inward:
//   outer band   the spell's own source text, transliterated into runes
//   star ring    a polygram whose point count is seeded by the spell name
//   seals        one per parameter; arguments appear here when summoned
//   channels     dashed rings carrying each parameter to where it is used
//   leaf ring    every input of the computation (literals and variables)
//   inner rings  operations, one ring per tree depth
//   heart        the root expression; its value is the spell's answer
//
// Mana flows inward: leaves resolve first and pour their values along the
// elbow-routed edges toward the heart, exactly in evaluation order.
// Coordinates: circle radius = 1000 units, centre at the origin, y down.

import { childrenOf, nodeLabel } from '../lang/parser.js';
import { opGlyph, runeGlyph, cistercianGlyph, charGlyph, glyphPath, glyphDots, circleD, polygonD, f1 } from './glyphs.js';
import { hashString } from './random.js';

export const RADII = {
  outer: 1000, outer2: 986, bandMid: 948, bandIn: 910, tickIn: 886,
  star: 868, seal: 830, sealR: 30, chan0: 792, chanStep: 11, leaf: 700,
};

const TAU = Math.PI * 2;
const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
const P = (pt) => `${f1(pt[0])} ${f1(pt[1])}`;

/** SVG arc from angle a0 to a1 on radius r (the pen is assumed at a0). */
function arcTo(r, a0, a1) {
  const d = a1 - a0;
  if (Math.abs(d) < 1e-6) return '';
  if (Math.abs(d) >= TAU - 1e-6) {
    // full turn: split in two halves
    const m = a0 + d / 2;
    return `A${f1(r)} ${f1(r)} 0 0 ${d > 0 ? 1 : 0} ${P(polar(r, m))}A${f1(r)} ${f1(r)} 0 0 ${d > 0 ? 1 : 0} ${P(polar(r, a1))}`;
  }
  return `A${f1(r)} ${f1(r)} 0 ${Math.abs(d) > Math.PI ? 1 : 0} ${d > 0 ? 1 : 0} ${P(polar(r, a1))}`;
}
function arcPts(r, a0, a1, out) {
  const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 0.06));
  for (let i = 1; i <= steps; i++) out.push(polar(r, a0 + ((a1 - a0) * i) / steps));
}
const wrapPi = (a) => { let x = (a + Math.PI) % TAU; if (x < 0) x += TAU; return x - Math.PI; };

/**
 * @param {object} sigil a spell or the cast, as produced by parse()
 * @param {object} program the whole program (for self-recursion detection)
 */
export function layoutSigil(sigil, program) {
  const src = sigil.nodes;
  const N = src.length;
  const kids = src.map((n) => childrenOf(n).map((c) => c.idx));
  const isLeaf = kids.map((k) => k.length === 0);
  const leaves = [];
  for (let i = 0; i < N; i++) if (isLeaf[i]) leaves.push(i);
  const L = leaves.length;

  let maxInternal = 0;
  for (let i = 0; i < N; i++) if (!isLeaf[i]) maxInternal = Math.max(maxInternal, src[i].depth);
  const D = maxInternal + 1;
  const spacing = RADII.leaf / D;

  // ---- angles: leaves evenly around the ring, clockwise from bottom-left
  const ang = new Float64Array(N);
  const rad = new Float64Array(N);
  leaves.forEach((li, k) => { ang[li] = Math.PI / 2 + ((k + 0.5) / L) * TAU; });
  for (let i = N - 1; i >= 0; i--) {
    if (isLeaf[i]) continue;
    const k = kids[i];
    ang[i] = (ang[k[0]] + ang[k[k.length - 1]]) / 2;
  }
  for (let i = 0; i < N; i++) rad[i] = isLeaf[i] ? RADII.leaf : spacing * src[i].depth;
  if (N === 1) rad[0] = 0; // a spell that is a single literal sits in the heart

  // ---- glyph sizes, bounded by ring spacing and by neighbours on the ring
  const gBase = clamp(spacing * 0.34, 16, 54);
  const glyphR = new Float64Array(N);
  const leafChord = L > 1 ? 2 * RADII.leaf * Math.sin(Math.PI / L) : 1e9;
  const gLeaf = Math.max(12, Math.min(gBase * 1.05, leafChord * 0.36, 48));
  const rings = new Map();
  for (let i = 0; i < N; i++) {
    if (isLeaf[i] && rad[i] > 0) continue;
    const d = src[i].depth;
    if (!rings.has(d)) rings.set(d, []);
    rings.get(d).push(i);
  }
  for (const [d, list] of rings) {
    if (d === 0) continue;
    const r = spacing * d;
    const sorted = list.map((i) => ang[i]).sort((a, b) => a - b);
    let minGap = TAU;
    for (let k = 1; k < sorted.length; k++) minGap = Math.min(minGap, sorted[k] - sorted[k - 1]);
    if (sorted.length > 1) minGap = Math.min(minGap, TAU - (sorted[sorted.length - 1] - sorted[0]));
    const chord = 2 * r * Math.sin(Math.min(Math.PI, minGap) / 2);
    const g = Math.max(12, Math.min(gBase, chord * 0.42));
    for (const i of list) glyphR[i] = g;
  }
  for (let i = 0; i < N; i++) if (isLeaf[i] && rad[i] > 0) glyphR[i] = gLeaf;
  glyphR[0] = N === 1 ? 70 : clamp(spacing * 0.46, 30, 86);

  const pos = (i) => polar(rad[i], ang[i]);
  const selfName = sigil.kind === 'spell' ? sigil.name : null;
  const P_COUNT = sigil.params.length;
  const sealAngle = (i) => -Math.PI / 2 + (i / Math.max(1, P_COUNT)) * TAU;

  // ---- nodes: outline, glyph, edge to parent, data-flow channel
  const nodes = [];
  for (let i = 0; i < N; i++) {
    const n = src[i];
    const [x, y] = pos(i);
    const g = glyphR[i];
    const out = { idx: i, id: n.id, type: n.type, x, y, g, angle: ang[i], radius: rad[i], depth: n.depth, leaf: isLeaf[i], parent: n.parentIdx, kids: kids[i], label: nodeLabel(n), start: n.start, end: n.end };
    Object.assign(out, nodeArt(n, x, y, g, selfName));

    if (n.parentIdx >= 0) {
      const p = n.parentIdx;
      const pts = [[x, y]];
      let d = `M${P([x, y])}`;
      if (rad[p] === 0) {
        pts.push([0, 0]);
        d += 'L0 0';
      } else {
        const ra = rad[p] + spacing * 0.5;
        const a = polar(ra, ang[i]);
        pts.push(a); d += `L${P(a)}`;
        d += arcTo(ra, ang[i], ang[p]);
        arcPts(ra, ang[i], ang[p], pts);
        const pp = pos(p);
        pts.push(pp); d += `L${P(pp)}`;
      }
      out.edge = { d, pts, len: polyLen(pts) };
    } else out.edge = null;

    if (n.type === 'Var') {
      if (n.bind.kind === 'param') {
        const k = n.bind.index;
        const as = sealAngle(k);
        const rc = RADII.chan0 - (k % 4) * RADII.chanStep;
        const delta = wrapPi(ang[i] - as);
        const s0 = polar(RADII.seal - RADII.sealR, as);
        const s1 = polar(rc, as);
        const pts = [s0, s1];
        let d = `M${P(s0)}L${P(s1)}${arcTo(rc, as, as + delta)}`;
        arcPts(rc, as, as + delta, pts);
        const e = polar(rad[i] + g, ang[i]);
        pts.push(e); d += `L${P(e)}`;
        out.flow = { kind: 'param', from: k, d, pts, len: polyLen(pts) };
      } else {
        const li = n.bind.idx;
        const [lx, ly] = pos(li);
        const am = (ang[li] + ang[i]) / 2;
        const rm = Math.max(0, (rad[li] + rad[i]) / 2 - spacing * 0.7);
        const [cx, cy] = rad[li] === 0 ? polar(rad[i] * 0.45, am + 0.25) : polar(rm, am);
        const pts = [];
        for (let s = 0; s <= 24; s++) {
          const t = s / 24, u = 1 - t;
          pts.push([u * u * lx + 2 * u * t * cx + t * t * x, u * u * ly + 2 * u * t * cy + t * t * y]);
        }
        out.flow = { kind: 'let', from: li, d: `M${P([lx, ly])}Q${P([cx, cy])} ${P([x, y])}`, pts, len: polyLen(pts) };
      }
    } else out.flow = null;
    nodes.push(out);
  }

  // ---- parameter seals
  const seals = sigil.params.map((p, k) => {
    const a = sealAngle(k);
    const [x, y] = polar(RADII.seal, a);
    const rr = RADII.sealR;
    const inward = polar(RADII.seal - rr - 14, a);
    const tl = polar(RADII.seal - rr - 2, a - 0.022), tr = polar(RADII.seal - rr - 2, a + 0.022);
    const rune = runeGlyph(p.name);
    return {
      name: p.name, index: k, x, y, r: rr, angle: a,
      outlineD: circleD(x, y, rr) + circleD(x, y, rr * 0.78),
      glyphD: glyphPath(rune, x, y, rr * 0.48) + `M${P(tl)}L${P(inward)}L${P(tr)}`,
      dotsD: glyphDots(rune, x, y, rr * 0.48),
    };
  });

  // ---- decorative layers
  const h = hashString(sigil.name + ':' + sigil.params.length);
  const starN = 5 + (h % 5);
  const starK = Math.floor((starN - 1) / 2);
  const band = [];
  const star = [];
  const core = [];

  band.push({ d: circleD(0, 0, RADII.outer), role: 'line', w: 9 });
  band.push({ d: circleD(0, 0, RADII.outer2), role: 'thin', w: 2.4 });
  band.push({ d: circleD(0, 0, RADII.bandIn), role: 'line', w: 3.2 });
  let ticks = '';
  for (let k = 0; k < 180; k++) {
    const a = (k / 180) * TAU;
    const major = k % 5 === 0;
    const a0 = polar(major ? RADII.tickIn - 8 : RADII.tickIn + 6, a);
    const a1 = polar(RADII.bandIn, a);
    ticks += `M${P(a0)}L${P(a1)}`;
  }
  band.push({ d: ticks, role: 'thin', w: 2 });
  const bandRunes = bandText(sigil.text);
  band.push({ d: bandRunes.d, role: 'rune', w: 3.4 });
  if (bandRunes.dots) band.push({ d: bandRunes.dots, role: 'rune', fill: true });

  star.push({ d: circleD(0, 0, RADII.star), role: 'thin', w: 2.6 });
  let sd = '';
  const vert = (i) => polar(RADII.star, -Math.PI / 2 + (i / starN) * TAU);
  for (let i = 0; i < starN; i++) sd += `M${P(vert(i))}L${P(vert((i + starK) % starN))}`;
  star.push({ d: sd, role: 'faint', w: 2.6 });
  let vd = '';
  for (let i = 0; i < starN; i++) { const [x, y] = vert(i); vd += circleD(x, y, 9); }
  star.push({ d: vd, role: 'thin', w: 2.2 });

  core.push({ d: circleD(0, 0, RADII.leaf + gLeaf + 22), role: 'faint', w: 1.6 });
  let flowD = '';
  for (const n of nodes) if (n.flow) flowD += n.flow.d;
  if (flowD) core.push({ d: flowD, role: 'flow', w: 2.4, dash: [10, 12] });
  let edgeD = '';
  for (const n of nodes) if (n.edge) edgeD += n.edge.d;
  if (edgeD) core.push({ d: edgeD, role: 'line', w: 4.4 });
  if (N > 1) core.push({ d: circleD(0, 0, glyphR[0] + 18), role: 'thin', w: 2 });
  let fillD = '', outlineD = '', glyphD = '', dotsD = '';
  for (const n of nodes) { fillD += n.fillD; outlineD += n.outlineD; glyphD += n.glyphD; dotsD += n.dotsD; }
  for (const s of seals) { fillD += circleD(s.x, s.y, s.r); outlineD += s.outlineD; glyphD += s.glyphD; dotsD += s.dotsD; }
  core.push({ d: fillD, role: 'shade', fill: true });
  core.push({ d: outlineD, role: 'line', w: 3.8 });
  core.push({ d: glyphD, role: 'rune', w: 4 });
  if (dotsD) core.push({ d: dotsD, role: 'rune', fill: true });

  return {
    name: sigil.name, kind: sigil.kind, params: sigil.params.map((p) => p.name), text: sigil.text,
    nodes, seals, layers: { band, star, core },
    meta: { spacing, depth: D, leaves: L, starN, starK, hue: h },
  };
}

/** Container outline + inner glyph for one node, in absolute coordinates. */
function nodeArt(n, x, y, g, selfName) {
  let outline = '', fill = '', glyph = null, gs = g * 0.56, extra = '';
  switch (n.type) {
    case 'Call': {
      fill = circleD(x, y, g);
      outline = circleD(x, y, g);
      if (n.target === 'spell') {
        outline += circleD(x, y, g * 0.76);
        gs = g * 0.46;
        if (n.name === selfName) extra += ouroboros(x, y, g * 1.28);
      } else {
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + Math.PI / 4;
          extra += `M${f1(x + Math.cos(a) * g)} ${f1(y + Math.sin(a) * g)}L${f1(x + Math.cos(a) * g * 1.28)} ${f1(y + Math.sin(a) * g * 1.28)}`;
        }
      }
      glyph = runeGlyph(n.name);
      break;
    }
    case 'Binary': fill = outline = circleD(x, y, g); glyph = opGlyph(n.op); break;
    case 'Unary': fill = outline = polygonD(x, y, g * 1.25, 3, -Math.PI / 2); glyph = opGlyph(n.op === '-' ? 'neg' : 'not'); gs = g * 0.46; break;
    case 'If': fill = outline = polygonD(x, y, g * 1.25, 4, -Math.PI / 2); glyph = opGlyph('if'); gs = g * 0.5; break;
    case 'Let': fill = outline = polygonD(x, y, g * 1.2, 4, -Math.PI / 4); glyph = opGlyph('let'); gs = g * 0.55; break;
    case 'Var': fill = outline = polygonD(x, y, g * 1.08, 6, 0); glyph = runeGlyph(n.name); gs = g * 0.55; break;
    case 'Num': fill = outline = circleD(x, y, g * 0.92); glyph = cistercianGlyph(n.value); gs = g * 0.6; break;
    case 'Bool': fill = outline = circleD(x, y, g * 0.92); glyph = opGlyph(n.value ? 'true' : 'false'); gs = g * 0.55; break;
    default: fill = outline = circleD(x, y, g);
  }
  return {
    fillD: fill,
    outlineD: outline + extra,
    glyphD: glyph ? glyphPath(glyph, x, y, gs) : '',
    dotsD: glyph ? glyphDots(glyph, x, y, gs) : '',
  };
}

/** A tiny ouroboros marks a spell calling itself. */
function ouroboros(x, y, r) {
  const a0 = -Math.PI * 0.85, a1 = Math.PI * 0.35;
  const s = [x + Math.cos(a0) * r, y + Math.sin(a0) * r];
  const e = [x + Math.cos(a1) * r, y + Math.sin(a1) * r];
  const tang = a1 + Math.PI / 2;
  const h1 = [e[0] - Math.cos(tang - 0.5) * r * 0.32, e[1] - Math.sin(tang - 0.5) * r * 0.32];
  const h2 = [e[0] - Math.cos(tang + 0.5) * r * 0.32, e[1] - Math.sin(tang + 0.5) * r * 0.32];
  return `M${P(s)}A${f1(r)} ${f1(r)} 0 0 1 ${P(e)}M${P(h1)}L${P(e)}L${P(h2)}`;
}

/** The spell's own source, written clockwise around the outer band. */
function bandText(text) {
  const chars = [...text];
  const mid = RADII.bandMid;
  const avail = TAU * mid * 0.97;
  const unit = (c) => (c === ' ' ? 0.55 : 1);
  let total = 2; // opening seal mark
  for (const c of chars) total += unit(c);
  let w = Math.min(74, avail / total);
  let shown = chars;
  if (w < 18) {
    w = 18;
    let acc = 2 + 2;
    let k = 0;
    while (k < chars.length && acc + unit(chars[k]) <= avail / w) { acc += unit(chars[k]); k++; }
    shown = [...chars.slice(0, k), '…'];
  }
  const s = Math.min(25, w * 0.4);
  let d = '', dots = '';
  let a = -Math.PI / 2 + (w * 1.0) / mid;
  // opening mark: a small diamond with a dot
  const m = polar(mid, -Math.PI / 2);
  d += polygonD(m[0], m[1], s * 0.9, 4, -Math.PI / 2 + -Math.PI / 2);
  dots += circleD(m[0], m[1], s * 0.2);
  a += (w * 0.5) / mid;
  for (const c of shown) {
    const step = (unit(c) * w) / mid;
    const ac = a + step / 2;
    if (c === '…') {
      for (let k = -1; k <= 1; k++) { const q = polar(mid, ac + (k * w * 0.25) / mid); dots += circleD(q[0], q[1], 4); }
    } else if (c !== ' ') {
      const [x, y] = polar(mid, ac);
      const gl = charGlyph(c);
      d += glyphPath(gl, x, y, s, ac + Math.PI / 2);
      dots += glyphDots(gl, x, y, s, ac + Math.PI / 2, 0.14);
    }
    a += step;
  }
  return { d, dots };
}

function polyLen(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

/** Point at fraction t along a polyline (with cached length). */
export function alongPolyline(pts, len, t) {
  if (pts.length === 1 || len === 0) return pts[0];
  let target = Math.max(0, Math.min(1, t)) * len;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (target <= seg) {
      const u = seg ? target / seg : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u];
    }
    target -= seg;
  }
  return pts[pts.length - 1];
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
