'use strict';
/* =====================================================================
   星图兽 · beast.js
   Geometry → genome analysis, names and lore, star-map codes,
   and the spring-skeleton Body that renders a living constellation.
   ===================================================================== */

const MAX_EDGE = .3;      // longest allowed star line, in sky units (sky height = 1)
const STAR_CAP_MAX = 15;

/* ---------- symmetry: best mirror axis through the centroid ---------- */
function symmetry(pts, edges, cx, cy) {
  const P = [];
  for (const p of pts) P.push([p.x - cx, p.y - cy]);
  for (const [a, b] of edges) P.push([(pts[a].x + pts[b].x) / 2 - cx, (pts[a].y + pts[b].y) / 2 - cy]);
  let Rr = 0; for (const q of P) Rr += q[0] * q[0] + q[1] * q[1];
  Rr = Math.sqrt(Rr / P.length) || 1;
  let best = 0;
  for (let k = 0; k < 72; k++) {
    const th = k * Math.PI / 72, c = Math.cos(2 * th), s = Math.sin(2 * th);
    let cost = 0;
    for (const q of P) {
      const rx = c * q[0] + s * q[1], ry = s * q[0] - c * q[1];
      let m = Infinity;
      for (const r of P) { const dx = rx - r[0], dy = ry - r[1], d = dx * dx + dy * dy; if (d < m) m = d; }
      cost += Math.sqrt(m);
    }
    cost /= P.length * Rr;
    best = Math.max(best, 1 - cost / .4);
  }
  return clamp(best, 0, 1);
}

/* ---------- the genome ---------- */
function analyze(pts, edges) {
  const V = pts.length, E = edges.length;
  const adj = pts.map(() => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const C = Math.max(0, E - V + 1);
  let L = 0; for (const [a, b] of edges) L += dist(pts[a], pts[b]);
  const Lmean = E ? L / E : 0;

  let acute = 0, angN = 0;
  for (let i = 0; i < V; i++) {
    const nb = adj[i]; if (nb.length < 2) continue;
    const p = pts[i];
    const an = nb.map(j => Math.atan2(pts[j].y - p.y, pts[j].x - p.x)).sort((x, y) => x - y);
    if (nb.length === 2) {
      let g = Math.abs(an[1] - an[0]); if (g > Math.PI) g = TAU - g;
      angN++; if (g < ACUTE) acute++;
    } else {
      for (let k = 0; k < an.length; k++) {
        const g = (k + 1 < an.length ? an[k + 1] : an[0] + TAU) - an[k];
        angN++; if (g < ACUTE) acute++;
      }
    }
  }
  const sharp = angN ? acute / angN : 0;
  let maxDeg = 0, deg3 = 0;
  adj.forEach(a => { maxDeg = Math.max(maxDeg, a.length); if (a.length === 3) deg3++; });

  let cx = 0, cy = 0; for (const p of pts) { cx += p.x; cy += p.y; } cx /= V; cy /= V;
  let sxx = 0, syy = 0, sxy = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const p of pts) {
    const dx = p.x - cx, dy = p.y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y);
  }
  sxx /= V; syy /= V; sxy /= V;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc);
  const elong = Math.min(6, Math.sqrt(l1 / l2));
  const sym = symmetry(pts, edges, cx, cy);

  let ws = 0, ts = 0, bright = 0;
  for (const p of pts) { const w = .4 + p.mag; ws += w; ts += p.cls * w; bright += p.mag; }
  const temp = ts / ws;
  let tv = 0; for (const p of pts) tv += (p.cls - temp) ** 2; tv /= V;
  const purity = clamp(1 - Math.sqrt(tv) / 2.2, 0, 1);
  const element = temp < 1.6 ? 'storm' : temp < 2.75 ? 'frost' : temp < 3.9 ? 'light' : temp < 5 ? 'flame' : 'ember';
  const w = maxx - minx, h = maxy - miny;

  let form;
  if (C >= 2) form = 'tortoise';
  else if (maxDeg >= 4) form = 'spider';
  else if (sym >= .8 && V >= 5) form = w >= h ? 'butterfly' : 'crane';
  else if (maxDeg <= 2 && C === 0) form = (V >= 7 || elong > 3) ? 'dragon' : 'serpent';
  else if (C === 1) form = 'whale';
  else if (sharp >= .4) form = 'wolf';
  else if (deg3 >= 2) form = 'deer';
  else form = 'fox';

  let hp = 70 + V * 16 + C * 12 + bright * 6;
  const atk = 10 + V * 1.1 + sharp * 18 + acute * 1.6;
  const def = 4 + C * 7 + (maxDeg >= 3 ? 3 : 0) + 6 / elong;
  const spd = 8 + clamp(Lmean / .16, 0, 1.6) * 7 + Math.min(elong - 1, 3) * 1.2 - V * .22;
  const spi = 6 + sym * 24 + bright * 1.4;
  if (form === 'whale') hp *= 1.15;

  const rscore = sym * .42 + Math.min(V / 13, 1) * .26 + Math.min(C / 3, 1) * .14 + purity * .18;
  let rarity = 0;
  for (let i = RARITY.length - 1; i >= 0; i--) if (rscore >= RARITY[i].min) { rarity = i; break; }
  const rm = RARITY[rarity].mult;
  const stats = {
    hp: Math.round(hp * rm), atk: Math.round(atk * rm), def: Math.round(def * rm),
    spd: Math.round(clamp(spd, 5, 24) * rm), spi: Math.round(spi * rm),
  };
  let head = 0;
  const hs = i => pts[i].mag + adj[i].length * .08;
  for (let i = 1; i < V; i++) if (hs(i) > hs(head)) head = i;
  return { V, E, C, L, Lmean, acute, angN, sharp, maxDeg, deg3, elong, sym, temp, purity, bright, element, form, stats, rarity, rscore, head, w, h };
}

/* ---------- quantization & star-map codes ---------- */
// Positions are stored relative to the centroid, quantized to one byte per axis,
// so a beast shared by code is bit-for-bit the same beast.
const qz = v => Math.round((clamp(v, -1.25, 1.25) / 2.5 + .5) * 255);
const unqz = q => (q / 255 - .5) * 2.5;
function quantPoints(raw) {
  let cx = 0, cy = 0; for (const p of raw) { cx += p.x; cy += p.y; } cx /= raw.length; cy /= raw.length;
  return { cx, cy, pts: raw.map(p => ({ x: unqz(qz(p.x - cx)), y: unqz(qz(p.y - cy)), cls: p.cls, mag: Math.round(p.mag * 15) / 15 })) };
}
const B32 = '0123456789abcdefghjkmnpqrstvwxyz';
function toB32(bytes) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
    val &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function fromB32(str) {
  let bits = 0, val = 0; const out = [];
  for (const ch of str) {
    const i = B32.indexOf(ch); if (i < 0) return null;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
    val &= (1 << bits) - 1;
  }
  return out;
}
function encodeRec(r) {
  const by = [1, r.mansion, r.nodes.length, r.edges.length];
  for (const n of r.nodes) by.push(qz(n.x), qz(n.y), (n.cls << 4) | Math.round(n.mag * 15));
  for (const [a, b] of r.edges) by.push((a << 4) | b);
  let ck = 0; for (const v of by) ck = (ck * 31 + v) & 255;
  by.push(ck);
  return 'xt' + toB32(by);
}
function decodeCode(str) {
  str = String(str || '').trim().toLowerCase().replace(/^#/, '').replace(/^xt-?/, '').replace(/[^0-9a-z]/g, '');
  const by = fromB32(str); if (!by || by.length < 9) return null;
  const ck = by.pop(); let c = 0; for (const v of by) c = (c * 31 + v) & 255;
  if (c !== ck) return null;
  const [ver, mansion, V, E] = by;
  if (ver !== 1 || mansion > 27 || V < 3 || V > 16 || E < V - 1 || E > 40 || by.length !== 4 + V * 3 + E) return null;
  const nodes = [];
  for (let i = 0; i < V; i++) {
    const o = 4 + i * 3, cls = by[o + 2] >> 4;
    if (cls > 6) return null;
    nodes.push({ x: unqz(by[o]), y: unqz(by[o + 1]), cls, mag: (by[o + 2] & 15) / 15 });
  }
  const edges = [], seen = new Set();
  for (let k = 0; k < E; k++) {
    const v = by[4 + V * 3 + k], a = v >> 4, b = v & 15;
    if (a >= V || b >= V || a === b) return null;
    const key = Math.min(a, b) * 16 + Math.max(a, b); if (seen.has(key)) return null;
    seen.add(key); edges.push([a, b]);
  }
  // connectivity
  const adj = nodes.map(() => []); edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
  const vis = new Set([0]), q = [0];
  while (q.length) { const v = q.pop(); for (const w of adj[v]) if (!vis.has(w)) { vis.add(w); q.push(w); } }
  if (vis.size !== V) return null;
  return { nodes, edges, mansion };
}

/* ---------- names, lore, power ---------- */
function nameFrom(code, g) {
  const h = hashStr(code);
  return PREFIX[h % PREFIX.length] + ELEMENTS[g.element].words[(h >>> 8) % 3] + FORMS[g.form].ch;
}
function loreOf(g, mansion) {
  const f = [];
  if (g.sharp >= .4) f.push(`锐角${cn(g.acute)}处，棱牙毕露`);
  if (g.C >= 2) f.push(`${cn(g.C)}环相扣，自成玄甲`); else if (g.C === 1) f.push('首尾相衔，环抱成甲');
  if (g.sym >= .75) f.push('左右相映，如镜中影');
  if (g.Lmean >= .17) f.push('星距疏阔，奔行如风');
  if (g.maxDeg >= 4) f.push(`一星牵${cn(g.maxDeg)}线，千丝所系`);
  if (g.V >= 11) f.push('繁星成躯，体魄雄浑');
  if (g.bright / g.V > .62) f.push('诸星灼灼，灵光外溢');
  if (!f.length) f.push('星疏而形简，藏锋未露');
  return `${f.slice(0, 2).join('；')}。生于${MANSIONS[mansion]}宿，${ELEMENTS[g.element].lore}。`;
}
const levelMult = lv => 1 + (lv - 1) * .06;
function powerOf(r) {
  const s = r.g.stats;
  return Math.round((s.hp * .5 + s.atk * 4 + s.def * 3 + s.spd * 5 + s.spi * 2) * levelMult(r.level || 1));
}
function hydrate(r) {
  r.code = encodeRec(r);
  r.g = analyze(r.nodes, r.edges);
  r.name = nameFrom(r.code, r.g);
  r.title = `${QUADS[Math.floor(r.mansion / 7)]} · ${MANSIONS[r.mansion]}宿`;
  r.lore = loreOf(r.g, r.mansion);
  r.level = r.level || 1;
  r.power = powerOf(r);
  return r;
}
function storeRec(r) {
  return { id: r.id, nodes: r.nodes, edges: r.edges, mansion: r.mansion, level: r.level, wins: r.wins || 0, born: r.born, origin: r.origin, skySeed: r.skySeed, starIds: r.starIds };
}

/* ---------- Body: a constellation with a spring skeleton ---------- */
class Body {
  constructor(rec, { facing = 1, enemy = false, ambient = true } = {}) {
    const nodes = rec.nodes, head = rec.g.head;
    let Rm = 0; for (const p of nodes) Rm = Math.max(Rm, Math.hypot(p.x, p.y));
    Rm = Rm || 1;
    this.Rm = Rm;
    const hx0 = nodes[head].x;
    this.mirror = (Math.abs(hx0) < 1e-3 ? 1 : Math.sign(hx0)) * facing;
    this.seed = (hashStr(rec.code || rec.id || 'x') % 1000) / 100;
    this.n = nodes.map((p, i) => ({ rx: p.x / Rm * this.mirror, ry: p.y / Rm, x: 0, y: 0, vx: 0, vy: 0, cls: p.cls, mag: p.mag, ph: i * 1.7 + this.seed }));
    const hn = this.n[head];
    for (const n of this.n) {
      const d = clamp(Math.hypot(n.rx - hn.rx, n.ry - hn.ry) / 2, 0, 1);
      n.k = 260 - 150 * d; n.c = 2 * Math.sqrt(n.k) * .42;
    }
    this.edges = rec.edges; this.head = head; this.el = rec.g.element;
    this.enemy = enemy; this.facing = facing; this.ambient = ambient;
    this.cx = 0; this.cy = 0; this.scale = 50; this.scaleMul = 1; this.kMul = 1;
    this.alpha = 1; this.flash = 0; this.charge = 0; this.dead = false; this.dieT = 0;
    this.eye = 1; this.blink = 2 + R() * 3; this.blinkT = 0;
    this.pin = null; this.emitAcc = 0; this.mx = 0; this.my = 0;
    this.colLine = enemy ? '#c48bff' : ELEMENTS[this.el].color;
    this.colGlow = enemy ? '#6a2bd6' : ELEMENTS[this.el].glow;
  }
  target(n, t, i) {
    if (this.pin) return this.pin[i];
    const br = 1 + .035 * Math.sin(t * 1.7 + this.seed), s = this.scale * this.scaleMul;
    const swx = Math.sin(t * 1.9 + n.ph) * .022, swy = Math.cos(t * 1.6 + n.ph * 1.3) * .022;
    return [this.cx + (n.rx * br + swx) * s, this.cy + (n.ry * br + swy) * s];
  }
  place(x, y, s, instant) {
    this.cx = x; this.cy = y; this.scale = s;
    if (instant) {
      this.n.forEach((n, i) => { const [tx, ty] = this.target(n, 0, i); n.x = tx; n.y = ty; n.vx = n.vy = 0; });
      this.centroid();
    }
  }
  centroid() { let mx = 0, my = 0; for (const n of this.n) { mx += n.x; my += n.y; } this.mx = mx / this.n.length; this.my = my / this.n.length; }
  kick(dx, dy, m) { for (const n of this.n) { const f = .5 + R() * .8; n.vx += dx * m * f; n.vy += dy * m * f; } this.flash = 1; }
  die() {
    this.dead = true; this.dieT = 0;
    for (const n of this.n) { n.vx += (n.x - this.mx) * 2.2 + (R() - .5) * 140; n.vy += (n.y - this.my) * 2.2 - 70; }
  }
  update(dt, t) {
    if (this.dead) {
      this.dieT += dt; this.alpha = Math.max(0, 1 - this.dieT / 1.5);
      for (const n of this.n) { n.vx *= Math.pow(.96, dt * 60); n.vy = n.vy * Math.pow(.96, dt * 60) + 40 * dt; n.x += n.vx * dt; n.y += n.vy * dt; }
      this.centroid(); return;
    }
    const steps = Math.max(1, Math.ceil(dt / .012)), h = dt / steps, km = this.kMul, cm = Math.sqrt(km);
    for (let k = 0; k < steps; k++) {
      for (let i = 0; i < this.n.length; i++) {
        const n = this.n[i], [tx, ty] = this.target(n, t, i);
        n.vx += (n.k * km * (tx - n.x) - n.c * cm * n.vx) * h;
        n.vy += (n.k * km * (ty - n.y) - n.c * cm * n.vy) * h;
        n.x += n.vx * h; n.y += n.vy * h;
      }
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    this.blink -= dt;
    if (this.blink < 0) { this.blinkT = .14; this.blink = 2.5 + R() * 4; }
    if (this.blinkT > 0) this.blinkT -= dt;
    this.centroid();
    if (this.ambient && !this.pin && this.alpha > .3) this.emitAmbient(dt);
  }
  emitAmbient(dt) {
    this.emitAcc += dt * (3 + this.n.length * .45);
    const s = this.scale;
    while (this.emitAcc > 1) {
      this.emitAcc -= 1;
      const i = Math.floor(R() * this.n.length), n = this.n[i];
      if (this.enemy) { part({ x: n.x, y: n.y, vx: (R() - .5) * 14, vy: -18 - R() * 22, life: 1.5, size: s * .05 + 3, col: '#7a3cff', type: 'glow', a: .7 }); continue; }
      switch (this.el) {
        case 'frost': part({ x: n.x, y: n.y, vx: (R() - .5) * 12, vy: 12 + R() * 18, life: 1.8, size: s * .025 + 2, col: '#e3f9ff', type: 'snow', rot: R() * TAU, spin: (R() - .5) * 2 }); break;
        case 'flame': part({ x: n.x, y: n.y, vx: (R() - .5) * 18, vy: -34 - R() * 40, life: 1, size: s * .035 + 2.5, col: '#ffb066', type: 'glow', flick: true }); break;
        case 'ember': part({ x: n.x, y: n.y, vx: (R() - .5) * 10, vy: -14 - R() * 16, life: 1.7, size: s * .045 + 3, col: '#ff4a5a', type: 'glow', flick: true }); break;
        case 'light': part({ x: n.x + (R() - .5) * s * .3, y: n.y, vx: (R() - .5) * 6, vy: -12 - R() * 14, life: 2, size: s * .03 + 2, col: '#fff0b0', type: 'glow' }); break;
        case 'storm': {
          const e = this.edges[Math.floor(R() * this.edges.length)];
          if (e && R() < .35) { const a = this.n[e[0]], b = this.n[e[1]]; bolt(a.x, a.y, b.x, b.y, '#9fb4ff', .12); }
          else part({ x: n.x, y: n.y, vx: (R() - .5) * 90, vy: (R() - .5) * 90, life: .35, size: 3, col: '#cdd9ff', type: 'spark', drag: .9 });
          break;
        }
      }
    }
  }
  draw(g, t, alphaMul = 1) {
    const a = this.alpha * alphaMul; if (a <= .01) return;
    const s = this.scale * this.scaleMul, N = this.n;
    g.save(); g.globalCompositeOperation = 'lighter';
    const gl = glowSprite(this.colGlow);
    if (this.charge > 0) { g.globalAlpha = a * this.charge * .55; const r = s * 2.3; g.drawImage(gl, this.mx - r, this.my - r, 2 * r, 2 * r); }
    // nebular flesh along every limb
    const step = Math.max(6, s * .15), sz = s * .78;
    g.globalAlpha = a * (this.enemy ? .085 : .1) * (1 + this.flash);
    for (const [i, j] of this.edges) {
      const p = N[i], q = N[j], k = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / step));
      for (let m = 0; m <= k; m++) { const x = p.x + (q.x - p.x) * m / k, y = p.y + (q.y - p.y) * m / k; g.drawImage(gl, x - sz / 2, y - sz / 2, sz, sz); }
    }
    g.globalAlpha = a * .24;
    for (const n of N) { const r = s * (.26 + .34 * n.mag); g.drawImage(gl, n.x - r, n.y - r, 2 * r, 2 * r); }
    // star lines
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); for (const [i, j] of this.edges) { g.moveTo(N[i].x, N[i].y); g.lineTo(N[j].x, N[j].y); }
    g.globalAlpha = a * .5; g.strokeStyle = this.colLine; g.lineWidth = Math.max(2.5, s * .055); g.stroke();
    g.globalAlpha = a * .9; g.strokeStyle = this.flash > .3 ? '#ffffff' : '#fff6e4'; g.lineWidth = Math.max(1, s * .014); g.stroke();
    // energy pulses travelling the limbs
    g.globalAlpha = a * .9;
    const pr = Math.max(3, s * .05);
    this.edges.forEach(([i, j], k) => {
      const f = (t * .55 + k * .37 + this.seed) % 1;
      const x = lerp(N[i].x, N[j].x, f), y = lerp(N[i].y, N[j].y, f);
      g.drawImage(gl, x - pr, y - pr, 2 * pr, 2 * pr);
    });
    // stars
    N.forEach((n, i) => {
      const r = Math.max(1.4, s * (.03 + .035 * n.mag)) * (i === this.head ? 1.25 : 1);
      drawStar(g, n.x, n.y, r, SPEC[n.cls].c, a, n.mag > .7 || i === this.head);
    });
    this.drawEyes(g, a, s);
    g.restore();
  }
  drawEyes(g, a, s) {
    const h = this.n[this.head];
    let dx = h.x - this.mx, dy = h.y - this.my, d = Math.hypot(dx, dy);
    if (d < s * .08) { dx = this.facing; dy = -.2; d = Math.hypot(dx, dy); }
    dx /= d; dy /= d;
    const px = -dy, py = dx, open = this.blinkT > 0 ? .1 : this.eye;
    if (open <= .02) return;
    const ang = Math.atan2(dy, dx), col = this.enemy ? '#ff3d5e' : '#fff4cc';
    const glow = glowSprite(this.enemy ? '#ff2850' : ELEMENTS[this.el].glow);
    for (const sgn of [-1, 1]) {
      const ex = h.x + dx * s * .07 + px * s * .06 * sgn, ey = h.y + dy * s * .07 + py * s * .06 * sgn - s * .015;
      const gr = s * .13;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = a * .7 * open;
      g.drawImage(glow, ex - gr, ey - gr, gr * 2, gr * 2);
      g.globalAlpha = a; g.fillStyle = col;
      g.beginPath(); g.ellipse(ex, ey, s * .036, Math.max(.4, s * .022 * open), ang + Math.PI / 2 * 0, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over'; g.fillStyle = this.enemy ? '#2a0010' : '#1a1030';
      g.beginPath(); g.ellipse(ex + dx * s * .008, ey + dy * s * .008, s * .009, Math.max(.3, s * .018 * open), ang, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'lighter';
  }
}
