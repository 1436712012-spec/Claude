'use strict';
/* =====================================================================
   星图兽 · game.js
   State, sky drawing, constellation editing, the awakening ritual,
   bestiary, auto-battles against eclipse beasts, and the main loop.
   ===================================================================== */

const KEY = 'astral-bestiary-v1';
const S = {
  mode: 'title', t: 0, save: null, sky: null,
  draft: { nodes: [], edges: [], active: -1, hist: [] },
  ana: null, anaPts: null, anaEdges: null, anaMansion: 0,
  ptr: { x: -99, y: -99, down: false, star: -1, drag: false, hover: -1, sx: 0, sy: 0 },
  awaken: null, battle: null, wave: null, attract: null, ghost: null,
  overlay: null, cardMode: null, cardRec: null, cardBody: null, thumbs: [],
  radarO: { cur: [0, 0, 0, 0, 0], tgt: [0, 0, 0, 0, 0], col: '#e8c67a' },
  radarC: { cur: [0, 0, 0, 0, 0], tgt: [0, 0, 0, 0, 0], col: '#e8c67a' },
};

/* ---------- persistence ---------- */
function newSave() {
  return { v: 1, uid: (Math.random() * 1e9) | 0, skySeed: (Math.random() * 1e9) | 0, skyAspect: clamp(W / H, .5, 2.4), claimed: {}, beasts: [], team: [], night: 1, cap: 7, muted: false, tut: 0, speed: 1 };
}
function loadSave() {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return null;
    const s = JSON.parse(raw); if (!s || s.v !== 1) return null;
    const d = newSave();
    for (const k in d) if (s[k] === undefined) s[k] = d[k];
    s.beasts = (s.beasts || []).filter(b => b && b.nodes && b.edges).map(b => { try { return hydrate(b); } catch (e) { return null; } }).filter(Boolean);
    const ids = new Set(s.beasts.map(b => b.id));
    for (const k in s.claimed) if (!ids.has(s.claimed[k])) delete s.claimed[k];
    s.team = s.team.filter(id => ids.has(id));
    return s;
  } catch (e) { return null; }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ ...S.save, beasts: S.save.beasts.map(storeRec) })); } catch (e) { /* storage unavailable: play continues in memory */ }
}

/* ---------- DOM ---------- */
const cv = $('#sky'), ctx = cv.getContext('2d'), bgc = document.createElement('canvas');
const el = {
  hud: $('#hud'), night: $('#night-label'), cap: $('#cap-chip'), mute: $('#mute'), atlasCount: $('#atlas-count'),
  oracle: $('#oracle'), dock: $('#dock'), undo: $('#b-undo'), clear: $('#b-clear'), awaken: $('#b-awaken'), newsky: $('#b-newsky'),
  toast: $('#toast'), card: $('#card'), atlas: $('#atlas'), prep: $('#prep'), bhud: $('#bhud'), result: $('#result'), title: $('#title'),
};
let bgReady = false, bgTimer = 0;
function scheduleBg() { clearTimeout(bgTimer); bgTimer = setTimeout(() => { renderBg(S.sky, bgc); bgReady = true; }, 140); }
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  if (S.sky) { computeView(S.sky); scheduleBg(); }
  if (S.battle) layoutBattle();
}

/* ---------- sky helpers ---------- */
const mansionAt = x => clamp(Math.floor(x / S.sky.aspect * 28), 0, 27);
const zenithStart = () => ((S.save.night - 1) * 3) % 28;
const inZenith = m => ((m - zenithStart() + 28) % 28) < 7;
const zenText = () => `${MANSIONS[zenithStart()]}—${MANSIONS[(zenithStart() + 6) % 28]}`;
const zenList = () => Array.from({ length: 7 }, (_, k) => MANSIONS[(zenithStart() + k) % 28]).join('');
const starScale = () => clamp(VS.s / 850, .75, 1.35);
function ownerName(id) { const b = S.save.beasts.find(x => x.id === S.save.claimed[id]); return b ? b.name : '另一只星图兽'; }

function drawZenithBand(t, dim) {
  const st = zenithStart(), colW = S.sky.aspect * VS.s / 28;
  const y0 = VS.oy + VS.s * (S.sky.top - .06), y1 = VS.oy + VS.s * (S.sky.bot + .02);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 7; k++) {
    const m = (st + k) % 28, x = VS.ox + m * colW;
    const edge = k === 0 || k === 6 ? .55 : 1;
    const a = (.055 + .02 * Math.sin(t * .8 + k * .9)) * dim * edge;
    const gr = ctx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, `rgba(232,198,122,${a})`); gr.addColorStop(.55, `rgba(120,160,255,${a * .4})`); gr.addColorStop(1, 'rgba(120,160,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(x, y0, colW + .6, y1 - y0);
  }
  ctx.restore();
}
function drawMansionLabels(dim) {
  const colW = S.sky.aspect * VS.s / 28, y = VS.oy + VS.s * (S.sky.top - .035);
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${colW < 22 ? 9 : 11}px ${FONT_SERIF}`;
  for (let m = 0; m < 28; m++) {
    const z = inZenith(m);
    ctx.fillStyle = z ? `rgba(232,198,122,${.85 * dim})` : `rgba(165,172,210,${.26 * dim})`;
    ctx.fillText(MANSIONS[m], VS.ox + (m + .5) * colW, y);
  }
  ctx.restore();
}
function drawClaimed(dim) {
  const seed = S.sky.seed, st = S.sky.stars;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1;
  ctx.textAlign = 'center'; ctx.font = `15px ${FONT_BRUSH}`;
  for (const b of S.save.beasts) {
    if (b.skySeed !== seed || !b.starIds) continue;
    const pts = b.starIds.map(id => st[id]); if (pts.some(p => !p)) continue;
    ctx.strokeStyle = rgba(ELEMENTS[b.g.element].color, .24 * dim);
    ctx.beginPath();
    for (const [i, j] of b.edges) { const p = toScreen(pts[i].x, pts[i].y), q = toScreen(pts[j].x, pts[j].y); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
    ctx.stroke();
    let cx = 0, my = -1e9; for (const p of pts) { cx += p.x; my = Math.max(my, p.y); } cx /= pts.length;
    const [lx, ly] = toScreen(cx, my);
    ctx.fillStyle = rgba('#e8c67a', .42 * dim); ctx.fillText(b.name, lx, ly + 24);
  }
  ctx.restore();
}
function drawStars(t, dim) {
  const sc = starScale(), inDraft = new Set(S.draft.nodes);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const s of S.sky.stars) {
    const [x, y] = toScreen(s.x, s.y), claimed = S.save.claimed[s.id] != null;
    const tw = .75 + .25 * Math.sin(t * s.sp + s.ph);
    let a = (claimed ? .38 : 1) * tw * dim, r = (.9 + s.mag * 2.3) * sc;
    if (inDraft.has(s.id)) { a = Math.min(1, a + .3); r *= 1.25; }
    drawStar(ctx, x, y, r, SPEC[s.cls].c, a, s.mag > .78 && !claimed);
  }
  ctx.restore();
}
function drawSkyLayer(t, dim) { drawZenithBand(t, dim); drawMansionLabels(dim); drawClaimed(dim); drawStars(t, dim); }

/* ---------- title attract mode: constellations trace themselves ---------- */
function newTrace() {
  const st = S.sky.stars.filter(s => s.mag > .45); if (!st.length) return;
  const start = pick(st), used = [start.id], edges = [];
  const want = 4 + Math.floor(R() * 4);
  while (used.length < want) {
    let best = null, bd = 1e9, from = -1;
    for (const id of used) for (const s of S.sky.stars) {
      if (used.includes(s.id)) continue;
      const d = dist(S.sky.stars[id], s); if (d < bd && d < .24) { bd = d; best = s; from = id; }
    }
    if (!best) break;
    used.push(best.id); edges.push([from, best.id]);
  }
  if (R() < .5 && used.length > 3) edges.push([used[used.length - 1], used[Math.max(0, used.length - 4)]]);
  const temp = used.reduce((a, id) => a + S.sky.stars[id].cls, 0) / used.length;
  const el = temp < 1.6 ? 'storm' : temp < 2.75 ? 'frost' : temp < 3.9 ? 'light' : temp < 5 ? 'flame' : 'ember';
  S.attract = { t: 0, lines: edges.map((e, i) => ({ a: e[0], b: e[1], t0: i * .38 })), dur: edges.length * .38 + 1.6, col: ELEMENTS[el].color };
}
function updateAttract(dt) { if (!S.attract || S.attract.t > S.attract.dur + 1.6) newTrace(); else S.attract.t += dt; }
function drawAttract() {
  const A = S.attract; if (!A) return;
  const fade = A.t > A.dur ? Math.max(0, 1 - (A.t - A.dur) / 1.6) : 1, st = S.sky.stars, gl = glowSprite(A.col);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const L of A.lines) {
    const p = clamp((A.t - L.t0) / .38, 0, 1); if (p <= 0) continue;
    const [x1, y1] = toScreen(st[L.a].x, st[L.a].y), [x2, y2] = toScreen(st[L.b].x, st[L.b].y);
    const x = lerp(x1, x2, p), y = lerp(y1, y2, p);
    ctx.globalAlpha = .4 * fade; ctx.strokeStyle = A.col; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x, y); ctx.stroke();
    ctx.globalAlpha = .85 * fade; ctx.strokeStyle = '#fff6e4'; ctx.lineWidth = 1.2; ctx.stroke();
    if (p < 1) { ctx.globalAlpha = fade; ctx.drawImage(gl, x - 12, y - 12, 24, 24); }
  }
  ctx.restore();
}
function maybeShootingStar(dt) {
  if (R() > dt * .14) return;
  const x = W * (.2 + R() * .8), y = H * (.05 + R() * .35), a = Math.PI * (.75 + R() * .12), v = 700 + R() * 500;
  part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .7 + R() * .4, type: 'streak', col: '#dfe8ff', a: .9 });
}

/* ---------- constellation editing ---------- */
function edgeProblem(a, b) {
  const d = S.draft, st = S.sky.stars;
  if (a === b) return 'same';
  if (S.save.claimed[a] != null) return `这颗星已属于「${ownerName(a)}」`;
  if (S.save.claimed[b] != null) return `这颗星已属于「${ownerName(b)}」`;
  if (d.nodes.length && !d.nodes.includes(a)) return '从已点亮的星出发，星图才能连成一体';
  if (dist(st[a], st[b]) > MAX_EDGE) return '相隔太远，星光连不过去';
  const add = (d.nodes.includes(a) ? 0 : 1) + (d.nodes.includes(b) ? 0 : 1);
  if (d.nodes.length + add > S.save.cap) return `星力只够驾驭 ${S.save.cap} 颗星（每赢一夜 +1）`;
  return '';
}
const hasEdge = (a, b) => S.draft.edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
function tryConnect(a, b) {
  const d = S.draft;
  if (hasEdge(a, b)) { d.active = b; AU.tick(); return false; }
  const why = edgeProblem(a, b);
  if (why) { if (why !== 'same') { toast(why); AU.deny(); } return false; }
  const add = [a, b].filter(id => !d.nodes.includes(id));
  d.hist.push({ edge: true, add, prev: d.active });
  add.forEach(id => d.nodes.push(id)); d.edges.push([a, b]); d.active = b;
  const st = S.sky.stars[b];
  AU.starNote(st);
  const [x, y] = toScreen(st.x, st.y);
  burst(x, y, SPEC[st.cls].c, 10, 90, 3); ring(x, y, '#e8c67a', 22, .5, 1.2);
  onDraftChange();
  return true;
}
function tapStar(id) {
  const d = S.draft;
  if (S.save.claimed[id] != null) { toast(`这颗星已属于「${ownerName(id)}」`); AU.deny(); return; }
  if (!d.nodes.length) {
    d.hist.push({ edge: false, add: [id], prev: d.active }); d.nodes.push(id); d.active = id;
    AU.starNote(S.sky.stars[id]); onDraftChange(); return;
  }
  if (d.active < 0) {
    if (d.nodes.includes(id)) { d.active = id; AU.tick(); }
    else toast('先点选一颗已点亮的星，再连向新的星');
    return;
  }
  if (id === d.active) { d.active = -1; AU.tick(); return; }
  tryConnect(d.active, id);
}
function dragConnect(a, b) {
  const d = S.draft;
  if (d.nodes.length && !d.nodes.includes(a)) { toast('从已点亮的星出发，星图才能连成一体'); AU.deny(); return; }
  tryConnect(a, b);
}
function undo() {
  const d = S.draft, h = d.hist.pop(); if (!h) return;
  if (h.edge) d.edges.pop();
  h.add.forEach(id => { const i = d.nodes.lastIndexOf(id); if (i >= 0) d.nodes.splice(i, 1); });
  d.active = h.prev; AU.tick(); onDraftChange();
}
function clearDraft() { S.draft = { nodes: [], edges: [], active: -1, hist: [] }; onDraftChange(); }
function draftQuant() {
  const d = S.draft, raw = d.nodes.map(id => S.sky.stars[id]);
  const q = quantPoints(raw), idx = new Map(d.nodes.map((id, i) => [id, i]));
  return { pts: q.pts, edges: d.edges.map(([a, b]) => [idx.get(a), idx.get(b)]), cx: q.cx, cy: q.cy };
}
function onDraftChange() {
  const d = S.draft;
  if (d.nodes.length >= 2 && d.edges.length >= 1) {
    const q = draftQuant();
    S.ana = analyze(q.pts, q.edges); S.anaPts = q.pts; S.anaEdges = q.edges; S.anaMansion = mansionAt(q.cx);
  } else S.ana = null;
  updateOracle(); updateDock();
  if (!(S.save.tut & 1) && d.edges.length >= 1) {
    S.save.tut |= 1; persist();
    toast('继续延伸：闭合成环会长出护甲，锐角会长出獠牙，星的颜色决定元素', 4600);
  } else if ((S.save.tut & 1) && !(S.save.tut & 2) && d.nodes.length >= 3) {
    S.save.tut |= 2; persist();
    toast('「星象推演」会随你的每一笔改变。满意了就按「点睛」唤醒它', 4200);
  }
}

/* ---------- pointer ---------- */
const drawActive = () => S.mode === 'draw' && !S.overlay && el.card.hidden;
function starAt(px, py) {
  const rad = Math.max(18, Math.min(30, VS.s * .032));
  let best = -1, bd = rad * rad;
  for (const s of S.sky.stars) { const [x, y] = toScreen(s.x, s.y), dx = x - px, dy = y - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = s.id; } }
  return best;
}
cv.addEventListener('pointerdown', e => {
  if (!drawActive()) return;
  const P = S.ptr; P.down = true; P.x = P.sx = e.clientX; P.y = P.sy = e.clientY; P.drag = false;
  P.star = starAt(P.x, P.y); P.hover = P.star;
  try { cv.setPointerCapture(e.pointerId); } catch (_) { }
  if (P.star >= 0) AU.tick();
});
cv.addEventListener('pointermove', e => {
  const P = S.ptr; P.x = e.clientX; P.y = e.clientY;
  if (!drawActive()) { P.hover = -1; return; }
  P.hover = starAt(P.x, P.y);
  if (P.down && !P.drag && Math.hypot(P.x - P.sx, P.y - P.sy) > 8) P.drag = true;
  cv.style.cursor = P.hover >= 0 ? 'pointer' : 'crosshair';
});
cv.addEventListener('pointerup', e => {
  const P = S.ptr; if (!P.down) return; P.down = false;
  if (drawActive()) {
    if (P.drag) { if (P.star >= 0 && P.hover >= 0 && P.hover !== P.star) dragConnect(P.star, P.hover); }
    else if (P.star >= 0) tapStar(P.star);
  }
  P.star = -1; P.drag = false;
  if (e.pointerType !== 'mouse') P.hover = -1;
});
cv.addEventListener('pointercancel', () => { const P = S.ptr; P.down = false; P.drag = false; P.star = -1; });

function drawDraft(t) {
  const d = S.draft, st = S.sky.stars, col = S.ana ? ELEMENTS[S.ana.element].color : '#e8c67a', P = S.ptr;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  if (d.edges.length) {
    ctx.beginPath();
    for (const [a, b] of d.edges) { const p = toScreen(st[a].x, st[a].y), q = toScreen(st[b].x, st[b].y); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
    ctx.globalAlpha = 1; ctx.strokeStyle = rgba(col, .35); ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,246,228,.9)'; ctx.lineWidth = 1.4; ctx.stroke();
    const gs = glowSprite(col);
    d.edges.forEach(([a, b], k) => {
      const f = (t * .5 + k * .31) % 1, p = toScreen(st[a].x, st[a].y), q = toScreen(st[b].x, st[b].y);
      ctx.globalAlpha = .85; ctx.drawImage(gs, lerp(p[0], q[0], f) - 7, lerp(p[1], q[1], f) - 7, 14, 14);
    });
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  for (const id of d.nodes) { const [x, y] = toScreen(st[id].x, st[id].y); ctx.strokeStyle = rgba(col, .55); ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.stroke(); }
  if (d.active >= 0) {
    const [x, y] = toScreen(st[d.active].x, st[d.active].y), p = (t * 1.3) % 1;
    ctx.strokeStyle = rgba('#e8c67a', .85 * (1 - p)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 9 + p * 18, 0, TAU); ctx.stroke();
  }
  if (P.down && P.drag && P.star >= 0) {
    const [x1, y1] = toScreen(st[P.star].x, st[P.star].y);
    let x2 = P.x, y2 = P.y, ok = true;
    if (P.hover >= 0 && P.hover !== P.star) {
      [x2, y2] = toScreen(st[P.hover].x, st[P.hover].y);
      const why = hasEdge(P.star, P.hover) ? '' : edgeProblem(P.star, P.hover); ok = !why;
    } else if (Math.hypot(x2 - x1, y2 - y1) > MAX_EDGE * VS.s) ok = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 30;
    ctx.strokeStyle = ok ? 'rgba(232,198,122,.9)' : 'rgba(255,100,100,.85)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(232,198,122,.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x1, y1, MAX_EDGE * VS.s, 0, TAU); ctx.stroke();
  }
  if (P.hover >= 0 && drawActive()) {
    const [x, y] = toScreen(st[P.hover].x, st[P.hover].y);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = S.save.claimed[P.hover] != null ? 'rgba(255,120,120,.6)' : 'rgba(232,198,122,.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
function pickGhost() {
  const st = S.sky.stars.filter(s => S.save.claimed[s.id] == null);
  const c = { x: S.sky.aspect / 2, y: (S.sky.top + S.sky.bot) / 2 };
  st.sort((a, b) => dist(a, c) - dist(b, c));
  for (const a of st.slice(0, 12)) for (const b of st) {
    const d = dist(a, b); if (b !== a && d > .1 && d < .2) { S.ghost = { a: a.id, b: b.id }; return; }
  }
  S.ghost = null;
}
function drawGhost(t) {
  if ((S.save.tut & 1) || S.draft.nodes.length || !S.ghost || S.overlay) return;
  const st = S.sky.stars, [x1, y1] = toScreen(st[S.ghost.a].x, st[S.ghost.a].y), [x2, y2] = toScreen(st[S.ghost.b].x, st[S.ghost.b].y);
  const p = (t % 2.6) / 2.6, k = easeInOut(clamp(p / .65, 0, 1)), a = p < .8 ? 1 : 1 - (p - .8) / .2;
  const x = lerp(x1, x2, k), y = lerp(y1, y2, k);
  ctx.save(); ctx.globalAlpha = a * .8; ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(232,198,122,.9)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,246,228,.22)'; ctx.strokeStyle = 'rgba(255,246,228,.75)';
  ctx.beginPath(); ctx.arc(x, y, 14 - 3 * Math.sin(p * Math.PI), 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/* ---------- oracle panel ---------- */
const STAT_KEYS = [['hp', '体魄', 420], ['atk', '攻势', 62], ['def', '护甲', 42], ['spd', '迅捷', 24], ['spi', '灵力', 44]];
const normStats = s => STAT_KEYS.map(([k, , m]) => clamp(s[k] / m, .04, 1));
const spanWord = L => L < .09 ? '密' : L < .14 ? '匀' : L < .2 ? '疏' : '阔';
let lastFeat = {};
function tagHTML(rec, g, mansion) {
  const E = ELEMENTS[g.element], F = FORMS[g.form];
  return `<span class="tag" style="color:${E.color};border-color:${rgba(E.color, .5)}">${E.ch} · 元素</span>` +
    `<span class="tag">${F.ch}形 · ${F.rule}</span>` +
    `<span class="tag">${MANSIONS[mansion]}宿</span>` +
    (inZenith(mansion) ? '<span class="tag zen">今夜当空</span>' : '');
}
function updateOracle() {
  const d = S.draft, a = S.ana;
  $('#o-count').textContent = `${d.nodes.length} / ${S.save.cap} 星`;
  const nameEl = $('#o-name'), rar = $('#o-rar');
  $('#o-empty').hidden = !!a; $('#o-more').hidden = !a;
  if (!a) {
    nameEl.textContent = d.nodes.length ? '星火初燃' : '未成形'; nameEl.style.color = '';
    rar.hidden = true; $('#o-tags').innerHTML = ''; S.radarO.tgt = [0, 0, 0, 0, 0]; lastFeat = {};
    return;
  }
  const E = ELEMENTS[a.element], F = FORMS[a.form], Rr = RARITY[a.rarity];
  nameEl.textContent = nameFrom(encodeRec({ mansion: S.anaMansion, nodes: S.anaPts, edges: S.anaEdges }), a);
  nameEl.style.color = E.color;
  rar.hidden = false; rar.textContent = Rr.ch; rar.style.background = Rr.seal;
  $('#o-tags').innerHTML = tagHTML(null, a, S.anaMansion);
  S.radarO.tgt = normStats(a.stats); S.radarO.col = E.color;
  const rows = [
    ['V', '星点', a.V, '体魄'], ['C', '闭环', a.C, '护甲'], ['A', '锐角', a.acute, '攻势'],
    ['L', '跨度', spanWord(a.Lmean), '迅捷'], ['S', '对称', Math.round(a.sym * 100) + '%', '灵力 · 稀有'],
    ['T', '星温', SPEC[clamp(Math.round(a.temp), 0, 6)].k + ' 型', '元素'],
  ];
  const ul = $('#o-feat');
  if (ul.children.length !== rows.length) ul.innerHTML = rows.map(r => `<li data-k="${r[0]}"><span>${r[1]}</span><b></b><em>→ ${r[3]}</em></li>`).join('');
  rows.forEach((r, i) => {
    const li = ul.children[i], b = li.querySelector('b'), v = String(r[2]);
    if (b.textContent !== v) { b.textContent = v; if (lastFeat[r[0]] !== undefined) { li.classList.remove('pulse'); void li.offsetWidth; li.classList.add('pulse'); } }
    lastFeat[r[0]] = v;
  });
  $('#o-skills').innerHTML = `<div><b>天赋 · ${F.passive}</b>${F.d}</div><div><b>星技 · ${E.skill}</b>${E.skillD}</div>`;
}
function updateDock() {
  const d = S.draft, ok = !!S.ana && d.nodes.length >= 3;
  el.awaken.disabled = !ok; el.awaken.classList.toggle('ready', ok);
  el.undo.disabled = !d.hist.length; el.clear.disabled = !d.nodes.length;
}
function drawRadar(c, R5, labels = true) {
  const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
  if (c.width !== Math.round(w * DPR)) { c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); }
  const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 4, r = Math.min(w, h) * .36, ang = i => -Math.PI / 2 + i * TAU / 5;
  g.strokeStyle = 'rgba(232,198,122,.16)'; g.lineWidth = 1;
  for (let k = 1; k <= 3; k++) {
    g.beginPath();
    for (let i = 0; i < 5; i++) { const x = cx + Math.cos(ang(i)) * r * k / 3, y = cy + Math.sin(ang(i)) * r * k / 3; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.stroke();
  }
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r); g.stroke(); }
  g.beginPath();
  R5.cur.forEach((v, i) => { const x = cx + Math.cos(ang(i)) * r * v, y = cy + Math.sin(ang(i)) * r * v; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.closePath(); g.fillStyle = rgba(R5.col, .22); g.fill(); g.strokeStyle = R5.col; g.lineWidth = 1.5; g.stroke();
  R5.cur.forEach((v, i) => { g.fillStyle = '#fff6e4'; g.beginPath(); g.arc(cx + Math.cos(ang(i)) * r * v, cy + Math.sin(ang(i)) * r * v, 2.2, 0, TAU); g.fill(); });
  if (labels) {
    g.font = `600 11px ${FONT_SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(232,198,122,.9)';
    STAT_KEYS.forEach(([, l], i) => g.fillText(l, cx + Math.cos(ang(i)) * (r + 15), cy + Math.sin(ang(i)) * (r + 12)));
  }
}
function updateRadars(dt) {
  for (const R5 of [S.radarO, S.radarC]) for (let i = 0; i < 5; i++) R5.cur[i] = lerp(R5.cur[i], R5.tgt[i], Math.min(1, dt * 7));
  if (!el.oracle.hidden && !$('#o-more').hidden) drawRadar($('#o-radar'), S.radarO);
  if (!el.card.hidden) drawRadar($('#c-radar'), S.radarC);
}

/* ---------- toast ---------- */
let toastTimer = 0;
function toast(msg, ms = 2600) {
  el.toast.textContent = msg; el.toast.classList.add('show'); clearTimeout(toastTimer);
  if (ms > 0) toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
}

/* ---------- awakening ritual ---------- */
function getPose() {
  if (W < 760 || W < H) return { x: W / 2, y: Math.max(140, H * .22), s: Math.min(W * .28, H * .14) };
  return { x: W * .31, y: H * .53, s: Math.min(W * .19, H * .27) };
}
function startAwaken() {
  const d = S.draft; if (!S.ana || d.nodes.length < 3 || S.mode !== 'draw') return;
  const q = draftQuant();
  const rec = hydrate({ id: uid(), nodes: q.pts, edges: q.edges, mansion: mansionAt(q.cx), level: 1, wins: 0, born: Date.now(), origin: 'sky', skySeed: S.sky.seed, starIds: [...d.nodes] });
  const body = new Body(rec, { facing: 1 });
  const pin = d.nodes.map(id => toScreen(S.sky.stars[id].x, S.sky.stars[id].y));
  body.pin = pin; body.n.forEach((n, i) => { n.x = pin[i][0]; n.y = pin[i][1]; }); body.centroid(); body.eye = 0;
  const adj = q.pts.map(() => []);
  q.edges.forEach(([a, b], k) => { adj[a].push([b, k]); adj[b].push([a, k]); });
  const depth = q.pts.map(() => -1), order = [], seen = new Set(), queue = [rec.g.head];
  depth[rec.g.head] = 0;
  while (queue.length) {
    const v = queue.shift();
    for (const [w, k] of adj[v]) {
      if (seen.has(k)) continue; seen.add(k);
      order.push({ k, from: v, to: w, dep: depth[v] });
      if (depth[w] < 0) { depth[w] = depth[v] + 1; queue.push(w); }
    }
  }
  const maxDep = Math.max(1, ...order.map(o => o.dep + 1)), step = Math.min(.24, 1.15 / maxDep);
  order.forEach(o => { o.t0 = .2 + o.dep * step; o.t1 = o.t0 + step * .95; });
  S.awaken = { rec, body, t: 0, order, igEnd: .2 + maxDep * step, flashed: false, ft: 0, eyes: false, card: false, noted: new Set([rec.g.head]), pin, ret: null };
  S.mode = 'awaken'; showDrawUI(false); el.hud.classList.add('dim'); el.toast.classList.remove('show');
  AU.starNote(S.sky.stars[d.nodes[rec.g.head]], { gain: .12 });
}
function updateAwaken(dt) {
  const A = S.awaken, b = A.body, E = ELEMENTS[A.rec.g.element];
  A.t += dt;
  for (const o of A.order) {
    if (A.t >= o.t1 && !A.noted.has(o.to)) {
      A.noted.add(o.to);
      AU.starNote(S.sky.stars[A.rec.starIds[o.to]], { gain: .07 });
      burst(A.pin[o.to][0], A.pin[o.to][1], E.color, 9, 100, 3);
    }
  }
  if (!A.flashed && A.t >= A.igEnd + .35) {
    A.flashed = true; A.ft = A.t;
    const pose = getPose(); b.pin = null; b.kMul = .16; b.place(pose.x, pose.y, pose.s, false);
    flashScreen(E.color, .6); shake(12);
    ring(b.mx, b.my, E.color, Math.max(W, H) * .6, 1.2, 3); ring(b.mx, b.my, '#ffffff', Math.max(W, H) * .35, .8, 1.5);
    burst(b.mx, b.my, E.color, 60, 420, 5);
    AU.awaken(A.rec.starIds.map(id => S.sky.stars[id]).map(st => AU.note(clamp(Math.round((1 - (st.y - .08) / .78) * 12), 0, 13))));
  }
  if (A.flashed && !A.ret) {
    const k = A.t - A.ft;
    b.kMul = Math.min(1, .16 + k * .7);
    if (!A.eyes && k > 1.05) { A.eyes = true; AU.roar(); burst(b.n[b.head].x, b.n[b.head].y, '#fff4cc', 16, 140, 3); }
    b.eye = A.eyes ? Math.min(1, (k - 1.05) * 4) : 0;
    if (!A.card && k > 1.35) { A.card = true; showCard(A.rec, 'new'); }
  }
  if (A.ret) {
    A.ret.t += dt;
    b.alpha = Math.max(0, 1 - A.ret.t / 1.1);
    if (A.ret.t > 1.15) finishAwaken();
  }
  b.update(dt, S.t);
}
function returnToSky(keep) {
  const A = S.awaken; if (!A || A.ret) return;
  hideCard();
  A.ret = { t: 0, keep }; A.body.pin = A.pin; A.body.kMul = .22; AU.whoosh();
}
function finishAwaken() {
  const A = S.awaken, keep = A.ret.keep, rec = A.rec;
  if (keep) {
    S.save.beasts.push(rec);
    rec.starIds.forEach(id => { S.save.claimed[id] = rec.id; });
    if (S.save.team.length < 3) S.save.team.push(rec.id);
    persist();
    A.pin.forEach(([x, y], i) => { burst(x, y, SPEC[rec.nodes[i].cls].c, 6, 60, 3); });
    S.draft = { nodes: [], edges: [], active: -1, hist: [] }; onDraftChange();
    toast(!(S.save.tut & 4) ? `「${rec.name}」已收入图鉴，它的星座留在了夜空里。点上方「星战」带它迎战蚀星` : `「${rec.name}」已收入图鉴`, 4400);
    S.save.tut |= 4; persist();
  }
  S.awaken = null; S.mode = 'draw'; el.hud.classList.remove('dim'); showDrawUI(true); updateHud();
}
function drawChartRing(x, y, r, t, alpha, mansion) {
  if (alpha <= .01) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(232,198,122,.32)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 1.09, 0, TAU); ctx.stroke();
  ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.arc(x, y, r * .72, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.max(10, r * .07)}px ${FONT_SERIF}`;
  for (let i = 0; i < 28; i++) {
    const a = t * .04 + (i - mansion) * TAU / 28 - Math.PI / 2;
    const c = Math.cos(a), s = Math.sin(a);
    ctx.strokeStyle = i === mansion ? 'rgba(232,198,122,.9)' : 'rgba(232,198,122,.3)';
    ctx.beginPath(); ctx.moveTo(x + c * r, y + s * r); ctx.lineTo(x + c * r * 1.09, y + s * r * 1.09); ctx.stroke();
    ctx.fillStyle = i === mansion ? 'rgba(255,230,160,.95)' : 'rgba(232,198,122,.35)';
    ctx.fillText(MANSIONS[i], x + c * r * 1.18, y + s * r * 1.18);
  }
  ctx.restore();
}
function renderAwaken(t) {
  const A = S.awaken, b = A.body, E = ELEMENTS[A.rec.g.element];
  const k = A.flashed ? clamp((A.t - A.ft) / .6, 0, 1) : 0;
  const back = A.ret ? clamp(A.ret.t / 1, 0, 1) : 0;
  drawSkyLayer(t, 1 - .62 * k * (1 - back));
  if (!A.flashed) {
    const st = S.sky.stars, gl = glowSprite(E.color);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,246,228,.25)'; ctx.lineWidth = 1; ctx.beginPath();
    for (const [i, j] of A.rec.edges) { ctx.moveTo(A.pin[i][0], A.pin[i][1]); ctx.lineTo(A.pin[j][0], A.pin[j][1]); }
    ctx.stroke();
    for (const o of A.order) {
      const p = clamp((A.t - o.t0) / (o.t1 - o.t0), 0, 1); if (p <= 0) continue;
      const [x1, y1] = A.pin[o.from], [x2, y2] = A.pin[o.to], x = lerp(x1, x2, p), y = lerp(y1, y2, p);
      ctx.globalAlpha = .5; ctx.strokeStyle = E.color; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 1.8; ctx.stroke();
      if (p < 1) ctx.drawImage(gl, x - 16, y - 16, 32, 32);
    }
    const h = A.pin[A.rec.g.head], pr = 20 + 6 * Math.sin(t * 8);
    ctx.globalAlpha = .9; ctx.drawImage(gl, h[0] - pr, h[1] - pr, pr * 2, pr * 2);
    ctx.restore();
    void st;
  } else {
    const pose = getPose();
    drawChartRing(pose.x, pose.y, pose.s * 1.32, t, .85 * k * (1 - back * 2), A.rec.mansion);
    b.draw(ctx, t);
  }
}

/* ---------- beast card ---------- */
function showCard(rec, mode) {
  S.cardMode = mode; S.cardRec = rec;
  const g = rec.g, E = ELEMENTS[g.element], F = FORMS[g.form], Rr = RARITY[g.rarity], lm = levelMult(rec.level);
  el.card.classList.toggle('center', mode !== 'new');
  $('#c-title').textContent = rec.title + (rec.origin === 'far' ? ' · 远方星图' : '');
  $('#c-lv').textContent = mode === 'new' ? '新生' : `Lv.${rec.level}${rec.wins ? ' · 胜 ' + rec.wins : ''}`;
  const nm = $('#c-name'); nm.textContent = rec.name; nm.style.color = E.color;
  nm.classList.remove('ink'); void nm.offsetWidth; nm.classList.add('ink');
  const rs = $('#c-rar'); rs.textContent = Rr.ch; rs.style.background = Rr.seal;
  $('#c-tags').innerHTML = tagHTML(rec, g, rec.mansion);
  $('#c-lore').textContent = rec.lore;
  $('#c-stats').innerHTML = STAT_KEYS.map(([k, l]) => `<dt>${l}</dt><dd>${Math.round(g.stats[k] * (k === 'spd' ? 1 : lm))}</dd>`).join('') + `<dt>战力</dt><dd class="pw">${rec.power}</dd>`;
  S.radarC.tgt = normStats(g.stats); S.radarC.col = E.color; S.radarC.cur = [0, 0, 0, 0, 0];
  $('#c-skills').innerHTML = `<div class="c-skill"><span class="k">${F.passive}</span><span><b>天赋</b>${F.d}</span></div><div class="c-skill"><span class="k" style="color:${E.color}">${E.skill}</span><span><b>星技</b>${E.skillD}</span></div>`;
  $('#c-geo').textContent = `${g.V} 星 · ${g.E} 线 · ${g.C} 环 · 锐角 ${g.acute} · 对称 ${Math.round(g.sym * 100)}% · ${Rr.ch}品（稀有度 ${Math.round(g.rscore * 100)}）`;
  const box = $('#c-code'); box.hidden = true; box.textContent = '';
  const act = $('#c-actions'); act.innerHTML = '';
  const btn = (txt, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = txt; b.addEventListener('click', fn); act.appendChild(b); return b; };
  if (mode === 'new') {
    btn('收入图鉴', 'btn-primary', () => returnToSky(true));
    btn('再改改', '', () => returnToSky(false));
    btn('复制星图码', '', () => copyCode(rec));
  } else if (mode === 'far') {
    btn('收入图鉴', 'btn-primary', () => keepFar(rec));
    btn('关闭', '', hideCard);
  } else {
    const inTeam = S.save.team.includes(rec.id);
    btn(inTeam ? '取消出战' : '设为出战', inTeam ? '' : 'btn-primary', () => { toggleTeam(rec.id); showCard(rec, 'detail'); });
    btn('复制星图码', '', () => copyCode(rec));
    const rel = btn('放归星空', '', () => {
      if (!rel.classList.contains('danger')) { rel.classList.add('danger'); rel.textContent = '再按一次确认放归'; setTimeout(() => { rel.classList.remove('danger'); rel.textContent = '放归星空'; }, 3200); return; }
      releaseBeast(rec);
    });
    btn('关闭', '', hideCard);
  }
  const view = $('#c-view');
  view.hidden = mode === 'new';
  S.cardBody = mode === 'new' ? null : new Body(rec, { facing: 1, ambient: false });
  S.cardBodyW = 0;
  el.card.hidden = false; el.card.classList.remove('in'); void el.card.offsetWidth; el.card.classList.add('in');
  el.card.scrollTop = 0;
}
function hideCard() { el.card.hidden = true; S.cardBody = null; S.cardMode = null; }
function updateCardView(dt) {
  const c = $('#c-view'), b = S.cardBody, w = c.clientWidth, h = c.clientHeight; if (!w) return;
  if (S.cardBodyW !== w) { S.cardBodyW = w; c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); b.place(w / 2, h / 2, Math.min(w, h) * .42, true); }
  b.update(dt, S.t);
  const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h); b.draw(g, S.t);
}
function selectText(node) { try { const r = document.createRange(); r.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { } }
function copyCode(rec) {
  const box = $('#c-code'); box.hidden = false; box.textContent = rec.code;
  const fail = () => { selectText(box); toast('星图码已显示并选中，请手动复制'); };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(rec.code).then(() => toast('星图码已复制。朋友在「图鉴」里导入，就能召唤同一只星图兽', 3600), fail);
    else fail();
  } catch (e) { fail(); }
}
function keepFar(rec) {
  if (S.save.beasts.some(b => b.code === rec.code)) { toast('这只星图兽已在你的图鉴里'); hideCard(); return; }
  S.save.beasts.push(rec); if (S.save.team.length < 3) S.save.team.push(rec.id);
  persist(); hideCard(); updateHud(); if (!el.atlas.hidden) buildAtlas();
  toast(`来自远方的「${rec.name}」加入了图鉴`);
}
function releaseBeast(rec) {
  S.save.beasts = S.save.beasts.filter(b => b.id !== rec.id);
  S.save.team = S.save.team.filter(id => id !== rec.id);
  for (const k in S.save.claimed) if (S.save.claimed[k] === rec.id) delete S.save.claimed[k];
  persist(); hideCard(); updateHud(); buildAtlas(); AU.death();
  toast(`「${rec.name}」回到了星空`);
}
function importCode(str) {
  const d = decodeCode(str);
  if (!d) { toast('星图码无法辨认，请检查是否完整'); return false; }
  const rec = hydrate({ id: uid(), nodes: d.nodes, edges: d.edges, mansion: d.mansion, level: 1, wins: 0, born: Date.now(), origin: 'far' });
  if (S.save.beasts.some(b => b.code === rec.code)) { toast('这只星图兽已在你的图鉴里'); return false; }
  showCard(rec, 'far'); return true;
}

/* ---------- bestiary ---------- */
function openAtlas() { S.overlay = 'atlas'; el.atlas.hidden = false; buildAtlas(); el.atlas.scrollTop = 0; }
function updateTeamLabel() { $('#a-team').textContent = `出战 ${getTeam(false).length} / 3`; }
function buildAtlas() {
  const grid = $('#a-grid'); grid.innerHTML = ''; S.thumbs = [];
  const list = [...S.save.beasts].sort((a, b) => b.born - a.born);
  $('#a-n').textContent = list.length; $('#a-empty').hidden = list.length > 0;
  updateTeamLabel();
  for (const rec of list) {
    const E = ELEMENTS[rec.g.element], F = FORMS[rec.g.form], Rr = RARITY[rec.g.rarity], team = S.save.team.includes(rec.id);
    const card = document.createElement('article');
    card.className = 'bcard frame' + (team ? ' team' : ''); card.tabIndex = 0; card.setAttribute('role', 'button');
    card.innerHTML = `<canvas></canvas><div class="b-row"><span class="nm" style="color:${E.color}">${rec.name}</span><span class="seal xs" style="background:${Rr.seal}">${Rr.ch}</span></div>` +
      `<div class="meta"><span>${E.ch} · ${F.ch} · Lv.${rec.level}</span><span>${MANSIONS[rec.mansion]}宿${inZenith(rec.mansion) ? ' · <em>当空</em>' : ''}${rec.origin === 'far' ? ' · 远方' : ''}</span></div>` +
      `<div class="b-foot"><span class="pw">战力 ${rec.power}</span><button class="btn xs team-btn${team ? ' on' : ''}" type="button">${team ? '出战中' : '设为出战'}</button></div>`;
    grid.appendChild(card);
    S.thumbs.push({ cvs: card.querySelector('canvas'), body: new Body(rec, { facing: 1, ambient: false }), w: 0 });
    card.addEventListener('click', ev => { if (ev.target.closest('.team-btn')) { toggleTeam(rec.id); buildAtlas(); return; } showCard(rec, 'detail'); });
    card.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target === card) showCard(rec, 'detail'); });
  }
}
function updateThumbs(dt) {
  for (const th of S.thumbs) {
    const c = th.cvs, w = c.clientWidth, h = c.clientHeight; if (!w) continue;
    if (th.w !== w) { th.w = w; c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); th.body.place(w / 2, h / 2, Math.min(w, h) * .4, true); }
    th.body.update(dt, S.t);
    const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h); th.body.draw(g, S.t);
  }
}
function toggleTeam(id) {
  const t = S.save.team, i = t.indexOf(id);
  if (i >= 0) t.splice(i, 1);
  else if (t.length >= 3) { toast('最多三只出战，先让一只休息'); return; }
  else t.push(id);
  persist(); updateTeamLabel();
}
function getTeam(auto = true) {
  const bs = S.save.beasts;
  let team = S.save.team.map(id => bs.find(b => b.id === id)).filter(Boolean);
  if (auto && !team.length && bs.length) { team = [...bs].sort((a, b) => b.power - a.power).slice(0, 3); S.save.team = team.map(b => b.id); persist(); }
  return team;
}

/* ---------- eclipse beasts (enemies) ---------- */
function genEnemy(night, rng, theme, boss) {
  const V = boss ? Math.min(15, 9 + Math.floor(night / 4)) : clamp(4 + Math.floor(night * .45) + Math.floor(rng() * 3), 3, 13);
  const pts = [{ x: 0, y: 0 }], edges = [];
  let tries = 0;
  while (pts.length < V && tries < 600) {
    tries++;
    const pi = rng() < .6 ? pts.length - 1 : Math.floor(rng() * pts.length);
    const a = rng() * TAU, d = .08 + rng() * .14, np = { x: pts[pi].x + Math.cos(a) * d, y: pts[pi].y + Math.sin(a) * d };
    if (pts.some(p => Math.hypot(p.x - np.x, p.y - np.y) < .06)) continue;
    pts.push(np); edges.push([pi, pts.length - 1]);
  }
  const extra = boss ? 2 : rng() < .4 ? 1 : 0;
  for (let k = 0; k < extra; k++) {
    for (let t = 0; t < 40; t++) {
      const i = Math.floor(rng() * pts.length), j = Math.floor(rng() * pts.length);
      if (i === j || edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i)) || dist(pts[i], pts[j]) > .24) continue;
      edges.push([i, j]); break;
    }
  }
  const el = night <= 2 || rng() < .6 ? theme : EL_ORDER[Math.floor(rng() * 5)];
  const base = { storm: .6, frost: 2.2, light: 3.3, flame: 4.4, ember: 5.6 }[el];
  pts.forEach(p => { p.cls = clamp(Math.round(base + (rng() - .5) * 1.1), 0, 6); p.mag = .3 + rng() * .7; });
  const q = quantPoints(pts);
  const rec = hydrate({ id: 'foe' + uid(), nodes: q.pts, edges, mansion: Math.floor(rng() * 28), level: 1, wins: 0, origin: 'foe' });
  rec.g.element = el;
  rec.name = (boss ? '蚀月·' : '蚀·') + nameFrom(rec.code, rec.g);
  rec.boss = boss;
  return rec;
}
function genWave(night, favor) {
  const rng = mulberry32(hashStr(`wave:${S.save.uid}:${night}`));
  const boss = night % 5 === 0, theme = favor || EL_ORDER[Math.floor(rng() * 5)];
  const count = boss ? (night >= 10 ? 3 : 2) : night === 1 ? 1 : night === 2 ? 2 : 3;
  const list = [];
  for (let i = 0; i < count; i++) list.push(genEnemy(night, rng, theme, boss && i === 0));
  return { night, list, mult: night === 1 ? .72 : .74 + .15 * (night - 1), boss, theme };
}
function counterTip(wave) {
  const cnt = {}; wave.list.forEach(r => { cnt[r.g.element] = (cnt[r.g.element] || 0) + 1; });
  const dom = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0], best = counterOf(dom);
  return `蚀星多为「${ELEMENTS[dom].ch}」。用${ELEMENTS[best].star}连出的「${ELEMENTS[best].ch}」兽能克制它们（伤害 ×1.4）。`;
}

/* ---------- battle prep ---------- */
function openPrep() {
  const team = getTeam();
  if (!team.length) { toast('图鉴里还没有星图兽。先在夜空中连星吧'); return false; }
  if (!S.wave || S.wave.night !== S.save.night) {
    // The first two nights send eclipse beasts your lead beast overpowers, so the element ring is learned by winning.
    const favor = S.save.night <= 2 ? EL_ORDER[(EL_ORDER.indexOf(team[0].g.element) + 1) % 5] : null;
    S.wave = genWave(S.save.night, favor);
  }
  const w = S.wave;
  S.overlay = 'prep'; el.prep.hidden = false;
  $('#p-title').textContent = `第${cn(w.night)}夜`;
  $('#p-sub').textContent = w.boss ? '蚀月当空 · 首领来袭' : '蚀星来袭';
  $('#p-zen').textContent = `今夜当空七宿：${zenList()}。生于其中的星图兽攻势 +20%、迅捷 +15%。`;
  $('#p-foes').innerHTML = w.list.map(r => {
    const E = ELEMENTS[r.g.element];
    return `<li><span class="dot" style="color:${E.color}"></span><span class="nm">${r.name}</span><small>${E.ch} · ${FORMS[r.g.form].ch}${r.boss ? ' · 首领' : ''} · ${r.g.V} 星</small></li>`;
  }).join('');
  $('#p-team').innerHTML = team.map(r => {
    const E = ELEMENTS[r.g.element], z = inZenith(r.mansion);
    return `<li><span class="dot" style="color:${E.color}"></span><span class="nm" style="color:${E.color}">${r.name}</span><small>${z ? '<em>当空</em> · ' : ''}Lv.${r.level} · 战力 ${r.power}</small></li>`;
  }).join('');
  $('#p-tip').textContent = counterTip(w);
  $('#p-cycle').innerHTML = cycleHTML();
  return true;
}
function cycleHTML() {
  return '相克 ' + [...EL_ORDER, 'storm'].map(k => `<span style="color:${ELEMENTS[k].color}">${ELEMENTS[k].ch}</span>`).join(' › ');
}

/* ---------- battle ---------- */
function makeUnit(rec, side, mult, boss) {
  const g = rec.g, lm = side === 0 ? levelMult(rec.level) : 1, zen = side === 0 && inZenith(rec.mansion);
  let hp = g.stats.hp * 1.3 * lm * mult * (boss ? 1.9 : 1), atk = g.stats.atk * lm * mult * (boss ? 1.25 : 1);
  const def = g.stats.def * lm * Math.sqrt(mult);
  let spd = g.stats.spd * (side ? 1 + .012 * S.save.night : 1);
  if (zen) { atk *= 1.2; spd *= 1.15; }
  return {
    rec, side, name: rec.name, el: g.element, form: g.form, boss, zen,
    maxHp: hp, hp, hpShow: hp, atk, def, spd, spi: g.stats.spi * lm, sharp: g.sharp,
    shield: g.form === 'tortoise' ? hp * .3 : 0, actG: R() * 45, spG: 0, alive: true,
    slowT: 0, freezeT: 0, burnT: 0, burnDps: 0, burnAcc: 0, burnTick: .5, regenAcc: 0, evadeT: 0,
    atkCount: 0, foxUsed: false, anim: null, ox: 0, oy: 0, hx: 0, hy: 0, scale: 50, dmg: 0, heal: 0,
    sizeF: clamp(.75 + g.V / 15 * .5, .75, 1.25) * (boss ? 1.5 : 1),
    body: new Body(rec, { facing: side ? -1 : 1, enemy: side === 1 }),
  };
}
function layoutBattle() {
  const b = S.battle; if (!b) return;
  const portrait = W < H * 1.05;
  const maxN = Math.max(...[0, 1].map(s => b.units.filter(u => u.side === s).length));
  const base = portrait ? Math.min(W * (maxN >= 3 ? .12 : .17), H * .09) : Math.min(W * .075, H * (maxN >= 3 ? .1 : .14));
  for (const side of [0, 1]) {
    const us = b.units.filter(u => u.side === side), n = us.length;
    us.forEach((u, i) => {
      u.scale = base * u.sizeF;
      if (portrait) {
        u.hx = W * (i + 1) / (n + 1); u.hy = side === 0 ? H * .68 : H * .33;
        if (n === 3 && i === 1) u.hy += side === 0 ? H * .05 : -H * .05;
      } else {
        u.hx = side === 0 ? W * .27 : W * .73; u.hy = n === 1 ? H * .5 : H * (.25 + .48 * i / (n - 1));
        if (n === 3 && i === 1) u.hx += side === 0 ? -W * .06 : W * .06;
      }
    });
  }
}
const alive = side => S.battle.units.filter(u => u.side === side && u.alive);
function startBattle() {
  const team = getTeam(), wave = S.wave; if (!team.length || !wave) return;
  closeOverlays();
  const b = { t: 0, speed: S.save.speed || 1, units: [], proj: [], timers: [], over: false, result: null, night: S.save.night, wave, endT: 0, shown: false };
  S.battle = b;
  team.forEach(r => b.units.push(makeUnit(r, 0, 1, false)));
  wave.list.forEach(r => b.units.push(makeUnit(r, 1, wave.mult, r.boss)));
  layoutBattle();
  for (const u of b.units) {
    if (u.side === 0) { u.body.place(u.hx - W * .45, u.hy, u.scale, true); u.body.kMul = .3; }
    else { u.body.place(u.hx, u.hy, u.scale, true); u.body.alpha = 0; }
  }
  clearFx(); el.toast.classList.remove('show');
  S.mode = 'battle'; showDrawUI(false); el.hud.classList.add('battle'); el.bhud.hidden = false;
  $('#bh-speed').textContent = '×' + b.speed;
  AU.tone(110, { type: 'sine', dur: 2.2, gain: .12, to: 55 }); AU.noise({ type: 'lowpass', f: 200, to: 1200, dur: 1.4, gain: .14, a: .4 });
}
function chooseTarget(u, foes) {
  const taunt = foes.filter(f => f.form === 'whale');
  if (taunt.length && R() < .55) return pick(taunt);
  const vis = foes.filter(f => f.evadeT <= 0), pool = vis.length ? vis : foes;
  if (R() < .5) return pool.reduce((a, c) => a.hp / a.maxHp < c.hp / c.maxHp ? a : c);
  return pick(pool);
}
function act(u) {
  const foes = alive(1 - u.side); if (!foes.length) return;
  const tgt = chooseTarget(u, foes);
  if (u.spG >= 100) {
    u.spG = 0; u.anim = { type: 'skill', t: 0, dur: .95, tgt, fired: false };
    AU.charge(); popText(u.body.mx, u.body.my - u.scale * 1.15, ELEMENTS[u.el].skill, ELEMENTS[u.el].color, 1.25, null, true);
    return;
  }
  u.atkCount++;
  if (u.form === 'dragon' && u.atkCount % 3 === 0) { u.anim = { type: 'sweep', t: 0, dur: .75, tgt, fired: false }; return; }
  const melee = FORMS[u.form].melee;
  u.anim = { type: melee ? 'dash' : 'shoot', t: 0, dur: melee ? .55 : .42, tgt, fired: false };
}
function advanceAnim(u, dt) {
  const a = u.anim; a.t += dt; const p = Math.min(1, a.t / a.dur);
  let tg = a.tgt;
  if ((!tg || !tg.alive) && !a.fired) { const foes = alive(1 - u.side); tg = a.tgt = foes.length ? chooseTarget(u, foes) : null; }
  const tx = tg ? tg.hx : u.hx, ty = tg ? tg.hy : u.hy, dx = tx - u.hx, dy = ty - u.hy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  if (a.type === 'dash' || a.type === 'sweep') {
    const reach = a.type === 'sweep' ? d * .5 : Math.max(0, d - (tg ? tg.scale * .9 : 0) - u.scale * .4);
    const k = p < .38 ? easeIn(p / .38) : p < .55 ? 1 : 1 - easeOut((p - .55) / .45);
    u.ox = ux * reach * k; u.oy = uy * reach * k;
    if (!a.fired && p >= .4) {
      a.fired = true;
      if (a.type === 'sweep') {
        const E = ELEMENTS[u.el];
        ring(u.body.mx, u.body.my, E.color, u.scale * 3.4, .6, 3);
        popText(u.body.mx, u.body.my - u.scale, '龙摆', E.color, 1.1, null, true);
        alive(1 - u.side).forEach(f => dealHit(u, f, .7, { kind: 'atk' }));
      } else if (tg && tg.alive) hitWithPassives(u, tg, 1);
    }
  } else if (a.type === 'shoot') {
    const k = Math.sin(p * Math.PI); u.ox = -ux * u.scale * .15 * k; u.oy = -uy * u.scale * .15 * k;
    if (!a.fired && p >= .3) { a.fired = true; if (tg && tg.alive) spawnProj(u, tg); }
  } else if (a.type === 'skill') {
    u.body.charge = p < .4 ? p / .4 : Math.max(0, 1 - (p - .4) / .6);
    u.body.scaleMul = 1 + .14 * Math.sin(Math.min(1, p / .5) * Math.PI);
    if (!a.fired && p >= .38) { a.fired = true; if (tg) castSkill(u, tg); }
  }
  if (p >= 1) { u.anim = null; u.ox = u.oy = 0; u.body.charge = 0; u.body.scaleMul = 1; }
}
function hitWithPassives(u, tgt, mult) {
  dealHit(u, tgt, mult, { kind: 'atk' });
  if (u.form === 'spider') {
    const other = alive(1 - u.side).filter(x => x !== tgt);
    if (other.length) {
      const o = pick(other);
      FX.bolts.push({ x1: tgt.body.mx, y1: tgt.body.my, x2: o.body.mx, y2: o.body.my, col: '#e8e0ff', life: .25, t: 0 });
      dealHit(u, o, .5, { kind: 'atk', noCrit: true });
    }
  }
}
function spawnProj(att, tgt, opt = {}) {
  const h = att.body.n[att.body.head];
  S.battle.proj.push(Object.assign({
    x: h.x, y: h.y, tgt, att, kind: 'bolt', col: ELEMENTS[att.el].color, sp: 900, trail: [],
    onHit: p => hitWithPassives(p.att, p.tgt, 1),
  }, opt));
}
function updateProj(dt) {
  const P = S.battle.proj;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    if (!p.tgt.alive) { const foes = alive(p.tgt.side); if (foes.length) p.tgt = pick(foes); else { P.splice(i, 1); continue; } }
    const tx = p.tgt.body.mx, ty = p.tgt.body.my, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), step = p.sp * dt;
    p.trail.push([p.x, p.y]); if (p.trail.length > 12) p.trail.shift();
    if (d <= step + 6) { P.splice(i, 1); if (!S.battle.over) p.onHit(p); continue; }
    p.x += dx / d * step; p.y += dy / d * step;
  }
}
function drawProj() {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const p of S.battle.proj) {
    const big = p.kind === 'meteor';
    if (p.trail.length > 1) {
      ctx.beginPath(); ctx.moveTo(p.trail[0][0], p.trail[0][1]); for (const q of p.trail) ctx.lineTo(q[0], q[1]); ctx.lineTo(p.x, p.y);
      ctx.globalAlpha = .55; ctx.strokeStyle = p.col; ctx.lineWidth = big ? 10 : 4; ctx.stroke();
      ctx.globalAlpha = .9; ctx.strokeStyle = '#fff6e4'; ctx.lineWidth = big ? 2.5 : 1.2; ctx.stroke();
    }
    const s = big ? 30 : 16; ctx.globalAlpha = 1; ctx.drawImage(glowSprite(p.col), p.x - s, p.y - s, s * 2, s * 2);
    ctx.drawImage(coreSprite('#ffffff'), p.x - s * .3, p.y - s * .3, s * .6, s * .6);
    if (big && R() < .6) part({ x: p.x, y: p.y, vx: (R() - .5) * 60, vy: -R() * 60, life: .5, size: 6, col: '#ffb066', type: 'glow' });
  }
  ctx.restore();
}
function dealHit(att, def, mult, opt = {}) {
  if (!def.alive) return 0;
  if (def.evadeT > 0 || (def.form === 'butterfly' && R() < .22)) {
    popText(def.body.mx, def.body.my - def.scale * .4, '闪', '#cfd6ff', 1.1, null, true); AU.whiff(); return 0;
  }
  let dmg = att.atk * mult * (.9 + R() * .2);
  const em = elMult(att.el, def.el); dmg *= em;
  let crit = false;
  const cc = att.form === 'wolf' ? .15 + att.sharp * .3 : .06;
  if (!opt.noCrit && R() < cc) { crit = true; dmg *= att.form === 'wolf' ? 1.8 : 1.5; }
  dmg = Math.max(1, Math.round(dmg * 60 / (60 + def.def)));
  let rem = dmg;
  if (def.shield > 0) {
    const s = Math.min(def.shield, rem); def.shield -= s; rem -= s;
    if (def.shield <= 0) { ring(def.body.mx, def.body.my, '#dceaff', def.scale * 2, .5, 2); popText(def.body.mx, def.body.my - def.scale * .8, '甲碎', '#dceaff', 1, null, true); }
  }
  def.hp -= rem; att.dmg += dmg;
  if (opt.kind === 'atk') att.spG = Math.min(100, att.spG + (12 + att.spi * .45) * (att.form === 'crane' ? 1.4 : 1));
  def.spG = Math.min(100, def.spG + 5 * (def.form === 'crane' ? 1.4 : 1));
  if (att.form === 'serpent' && opt.kind === 'atk') def.slowT = Math.max(def.slowT, 2.5);
  const hx = def.body.mx, hy = def.body.my, E = ELEMENTS[att.el];
  const dx = hx - att.body.mx, dy = hy - att.body.my, dd = Math.hypot(dx, dy) || 1;
  burst(hx, hy, E.color, crit ? 26 : 14, crit ? 300 : 200, crit ? 5 : 4);
  ring(hx, hy, E.color, def.scale * (crit ? 1.8 : 1.2), .4, crit ? 3 : 2);
  popText(hx, hy - def.scale * .5, (crit ? '暴 ' : '') + dmg, crit ? '#ffd36a' : '#ffffff', crit ? 1.5 : 1, em > 1 ? '克' : null);
  def.body.kick(dx / dd, dy / dd, crit ? 420 : 240);
  shake(crit ? 9 : 4); if (crit) hitStop(.09);
  AU.hit(crit);
  if (def.hp <= 0) kill(def);
  else if (def.form === 'fox' && !def.foxUsed && def.hp / def.maxHp < .3) {
    def.foxUsed = true; def.evadeT = 2; def.spG = 100;
    popText(hx, hy - def.scale, '灵遁', '#c59bff', 1.2, null, true); ring(hx, hy, '#c59bff', def.scale * 2.5, .8, 2);
  }
  return dmg;
}
function heal(u, amt, src, quiet) {
  if (!u.alive) return;
  const a = Math.round(Math.min(u.maxHp - u.hp, amt)); if (a <= 0) return;
  u.hp += a; if (src) src.heal += a;
  popText(u.body.mx, u.body.my - u.scale * .5, '+' + a, '#9ff0c6', quiet ? .8 : 1.1);
  if (!quiet) burst(u.body.mx, u.body.my, '#9ff0c6', 12, 120, 3);
}
function kill(u) {
  if (!u.alive) return;
  u.alive = false; u.hp = 0; u.anim = null; u.ox = u.oy = 0;
  const x = u.body.mx, y = u.body.my;
  u.body.die();
  burst(x, y, ELEMENTS[u.el].color, 40, 320, 5); ring(x, y, '#ffffff', u.scale * 3, .8, 2);
  for (const n of u.body.n) part({ x: n.x, y: n.y, vx: (R() - .5) * 80, vy: -60 - R() * 80, g: 260, type: 'glow', col: SPEC[n.cls].c, size: 7, life: 1.6 });
  popText(x, y - u.scale * .6, '陨', '#d9dcff', 1.4, null, true);
  AU.death(); hitStop(.16); shake(12); flashScreen('#ffffff', .14);
}
function castSkill(u, tgt) {
  const E = ELEMENTS[u.el], spf = 1 + u.spi / 60, b = S.battle;
  AU.skill(u.el); flashScreen(E.color, .22); hitStop(.1); shake(6);
  const foes = alive(1 - u.side), allies = alive(u.side), head = u.body.n[u.body.head];
  switch (u.el) {
    case 'storm': {
      const chain = [tgt], rest = foes.filter(f => f !== tgt);
      while (chain.length < 3 && rest.length) {
        const last = chain[chain.length - 1];
        rest.sort((a, c) => Math.hypot(a.hx - last.hx, a.hy - last.hy) - Math.hypot(c.hx - last.hx, c.hy - last.hy));
        chain.push(rest.shift());
      }
      const mults = [1.3, 1, .75];
      chain.forEach((f, i) => b.timers.push({
        t: i * .11, fn: () => {
          const from = i === 0 ? [head.x, head.y] : [chain[i - 1].body.mx, chain[i - 1].body.my];
          bolt(from[0], from[1], f.body.mx, f.body.my, E.color, .4); bolt(from[0], from[1], f.body.mx, f.body.my, '#ffffff', .22);
          burst(f.body.mx, f.body.my, '#cfe0ff', 18, 260, 3);
          dealHit(u, f, mults[i] * spf, { kind: 'skill' });
        },
      }));
      break;
    }
    case 'frost': {
      const x = tgt.body.mx, y = tgt.body.my;
      ring(x, y, '#c4f3ff', tgt.scale * 2.6, .7, 3); ring(x, y, '#ffffff', tgt.scale * 1.4, .5, 1.5);
      for (let k = 0; k < 26; k++) { const a = R() * TAU, v = 120 + R() * 260; part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, type: 'shard', col: '#e3f9ff', life: .9, size: 4 + R() * 5, drag: .9, rot: a }); }
      dealHit(u, tgt, 1.1 * spf, { kind: 'skill' });
      if (tgt.alive) { tgt.freezeT = 2.2; tgt.slowT = Math.max(tgt.slowT, 5.2); tgt.actG *= .5; popText(x, y - tgt.scale, '冰封', '#c4f3ff', 1.1, null, true); }
      break;
    }
    case 'light': {
      const spf2 = 1 + u.spi / 90, low = allies.reduce((a, c) => a.hp / a.maxHp < c.hp / c.maxHp ? a : c);
      beam(low.body.mx, low.body.my, '#fff1b8', 1.1, low.scale * 1.4); heal(low, low.maxHp * .22 * spf2, u);
      allies.forEach(a => { if (a !== low) { beam(a.body.mx, a.body.my, '#ffe9a8', .8, a.scale * .8); heal(a, a.maxHp * .08 * spf2, u, true); } });
      dealHit(u, tgt, .6 * spf, { kind: 'skill' });
      break;
    }
    case 'flame': {
      foes.forEach((f, i) => b.timers.push({
        t: i * .14, fn: () => {
          if (!f.alive) return;
          b.proj.push({
            x: f.body.mx + (u.side ? 1 : -1) * W * .22, y: -40, tgt: f, att: u, kind: 'meteor', col: '#ffa257', sp: 1150, trail: [],
            onHit: p => {
              const x = p.tgt.body.mx, y = p.tgt.body.my;
              burst(x, y, '#ffb066', 30, 320, 5); ring(x, y, '#ff8a3a', p.tgt.scale * 2.2, .5, 4); shake(7);
              dealHit(u, p.tgt, .75 * spf, { kind: 'skill' });
              if (p.tgt.alive) { p.tgt.burnT = 4; p.tgt.burnDps = u.atk * .16; p.tgt.burnTick = .5; }
            },
          });
        },
      }));
      break;
    }
    case 'ember': {
      const x = tgt.body.mx, y = tgt.body.my;
      for (let k = 0; k < 34; k++) { const a = R() * TAU, r = tgt.scale * (1.5 + R()); part({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.6, vy: -Math.sin(a) * r * 2.6, type: 'glow', col: '#ff4a5a', life: .4, size: 5, drag: .97 }); }
      ring(x, y, '#ff2c4c', tgt.scale * .2, .45, 4, tgt.scale * 2.4);
      const miss = 1 - u.hp / u.maxHp;
      b.timers.push({ t: .3, fn: () => { const d = dealHit(u, tgt, 1.5 * (1 + miss) * spf, { kind: 'skill' }); if (d > 0) heal(u, d * .4, u); burst(x, y, '#ff5a6a', 40, 380, 6); } });
      break;
    }
  }
}
function tickStatus(u, dt) {
  if (u.slowT > 0) u.slowT -= dt;
  if (u.freezeT > 0) u.freezeT -= dt;
  if (u.evadeT > 0) u.evadeT -= dt;
  if (u.burnT > 0) {
    u.burnT -= dt; u.burnAcc += u.burnDps * dt; u.burnTick -= dt;
    if (u.burnTick <= 0) {
      u.burnTick = .5; const d = Math.floor(u.burnAcc); u.burnAcc -= d;
      if (d > 0) {
        u.hp -= d; popText(u.body.mx, u.body.my - u.scale * .3, String(d), '#ffb066', .75);
        part({ x: u.body.mx, y: u.body.my, vy: -50, life: .6, size: 10, col: '#ff8a3a', type: 'glow', flick: true });
        if (u.hp <= 0) kill(u);
      }
    }
  }
  if (u.form === 'deer' && u.alive && u.hp < u.maxHp) {
    u.regenAcc += u.maxHp * .012 * dt;
    if (u.regenAcc >= Math.max(4, u.maxHp * .025)) { heal(u, u.regenAcc, u, true); u.regenAcc = 0; }
  }
}
function updateBattle(dt) {
  const b = S.battle;
  let sdt = dt * b.speed;
  if (JUICE.stop > 0) { JUICE.stop -= dt; sdt *= .12; }
  b.t += sdt;
  for (const u of b.units) {
    if (u.side === 1 && u.alive) u.body.alpha = Math.min(1, b.t / 1.1);
    if (u.side === 0) u.body.kMul = Math.min(1, .3 + b.t * .5);
    u.hpShow = lerp(u.hpShow, u.hp, Math.min(1, sdt * 3));
  }
  if (b.t > 1.6 && !b.over) {
    for (let i = b.timers.length - 1; i >= 0; i--) { const tm = b.timers[i]; tm.t -= sdt; if (tm.t <= 0) { b.timers.splice(i, 1); tm.fn(); } }
    for (const u of b.units) {
      if (!u.alive) continue;
      tickStatus(u, sdt); if (!u.alive) continue;
      if (u.anim) { advanceAnim(u, sdt); continue; }
      if (u.freezeT > 0) continue;
      u.actG += u.spd * 4.6 * (u.slowT > 0 ? .6 : 1) * sdt;
      if (u.actG >= 100) { u.actG = 0; act(u); }
    }
    updateProj(sdt);
    const pa = alive(0).length, ea = alive(1).length;
    if (!pa || !ea) { b.over = true; b.result = pa ? 'win' : 'lose'; b.endT = b.t; b.timers.length = 0; if (pa) AU.win(); else AU.lose(); }
  } else if (b.over) {
    b.proj.length = 0;
    if (b.result === 'win') for (const u of alive(0)) { u.body.charge = .4 + .2 * Math.sin(S.t * 3); if (R() < dt * 14) part({ x: u.body.mx + (R() - .5) * u.scale * 2, y: u.body.my + u.scale * .6, vy: -40 - R() * 50, life: 1.4, size: 5, col: '#ffe7a0', type: 'glow' }); }
    if (!b.shown && b.t - b.endT > 1.8 * b.speed) { b.shown = true; showResult(b.result === 'win'); }
  }
  for (const u of b.units) {
    u.body.cx = u.hx + u.ox; u.body.cy = u.hy + u.oy; u.body.scale = u.scale;
    if (u.freezeT > 0 && u.alive) { u.body.update(sdt * .05, S.t); if (R() < dt * 8) part({ x: u.body.mx + (R() - .5) * u.scale, y: u.body.my, vy: 20, life: 1, size: 3, col: '#e3f9ff', type: 'snow', rot: R() * 3 }); }
    else u.body.update(sdt, S.t);
  }
}
function renderBattle(t) {
  const b = S.battle;
  ctx.fillStyle = 'rgba(2,3,10,.3)'; ctx.fillRect(-20, -20, W + 40, H + 40);
  drawStars(t, .42);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const u of b.units) {
    if (!u.alive) continue;
    const ry = u.hy + u.scale * 1.02;
    ctx.globalAlpha = .5 * u.body.alpha; ctx.strokeStyle = u.side ? 'rgba(160,90,255,.35)' : (u.zen ? 'rgba(232,198,122,.7)' : 'rgba(232,198,122,.25)');
    ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(u.hx, ry, u.scale * .95, u.scale * .22, 0, 0, TAU); ctx.stroke();
    if (u.zen) { ctx.globalAlpha = .18 + .08 * Math.sin(t * 2); ctx.drawImage(glowSprite('#e8c67a'), u.hx - u.scale * 1.6, u.hy - u.scale * 1.6, u.scale * 3.2, u.scale * 3.2); }
  }
  ctx.restore();
  [...b.units].sort((a, c) => a.hy - c.hy).forEach(u => u.body.draw(ctx, t));
  drawProj();
}
function renderBars() {
  const b = S.battle;
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const u of b.units) {
    const a = u.alive ? u.body.alpha : Math.max(0, u.body.alpha - .3); if (a <= .02) continue;
    ctx.globalAlpha = a;
    const x = u.hx, y = u.hy + u.scale * 1.12 + 16, w = clamp(u.scale * 1.5, 70, 150), bx = x - w / 2;
    ctx.font = `600 12px ${FONT_SERIF}`; ctx.fillStyle = u.side ? '#e9b8cf' : '#f2e9d3';
    ctx.fillText(u.name + (u.side === 0 ? `  Lv.${u.rec.level}` : ''), x, y - 6);
    if (u.zen) { ctx.font = `600 10px ${FONT_SERIF}`; ctx.fillStyle = '#e8c67a'; ctx.fillText('当 空', x, y - 21); }
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(bx - 1, y - 1, w + 2, 7);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(bx, y, w * clamp(u.hpShow / u.maxHp, 0, 1), 5);
    const gr = ctx.createLinearGradient(bx, 0, bx + w, 0);
    if (u.side) { gr.addColorStop(0, '#a3325a'); gr.addColorStop(1, '#ff7a95'); } else { gr.addColorStop(0, '#3ea883'); gr.addColorStop(1, '#9ff0c6'); }
    ctx.fillStyle = gr; ctx.fillRect(bx, y, w * clamp(u.hp / u.maxHp, 0, 1), 5);
    if (u.shield > 0) { ctx.fillStyle = 'rgba(220,235,255,.85)'; ctx.fillRect(bx, y - 4, w * clamp(u.shield / u.maxHp, 0, 1), 2); }
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(bx, y + 8, w, 2);
    ctx.fillStyle = ELEMENTS[u.el].color; ctx.globalAlpha = a * (u.spG >= 100 ? .6 + .4 * Math.sin(S.t * 10) : .9);
    ctx.fillRect(bx, y + 8, w * u.spG / 100, 2); ctx.globalAlpha = a;
    const st = []; if (u.freezeT > 0) st.push('冻'); else if (u.slowT > 0) st.push('缓'); if (u.burnT > 0) st.push('灼'); if (u.evadeT > 0) st.push('遁');
    if (st.length) { ctx.font = `600 11px ${FONT_SERIF}`; ctx.fillStyle = '#ffd9a0'; ctx.fillText(st.join(' '), x, y + 24); }
  }
  ctx.restore();
}
function drawBanner() {
  const b = S.battle; if (!b || b.t > 2.2) return;
  const k = b.t, a = k < .4 ? k / .4 : k > 1.5 ? Math.max(0, 1 - (k - 1.5) / .7) : 1, m = Math.min(W, H);
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(m * .13)}px ${FONT_BRUSH}`; ctx.fillStyle = '#f2e9d3';
  ctx.shadowColor = 'rgba(232,198,122,.65)'; ctx.shadowBlur = 30; ctx.fillText(`第${cn(b.night)}夜`, W / 2, H * .45); ctx.shadowBlur = 0;
  ctx.font = `600 ${Math.round(m * .024) + 6}px ${FONT_SERIF}`; ctx.fillStyle = '#e8c67a';
  ctx.fillText(b.wave.boss ? '蚀 月 当 空' : '蚀 星 来 袭', W / 2, H * .45 + m * .11);
  ctx.restore();
}
function showResult(win) {
  const b = S.battle, team = b.units.filter(u => u.side === 0);
  S.overlay = 'result'; el.result.hidden = false; el.bhud.hidden = true;
  const seal = $('#r-seal'); seal.textContent = win ? '胜' : '败'; seal.classList.toggle('lose', !win);
  $('#r-title').textContent = win ? `第${cn(b.night)}夜 · 蚀星尽散` : `第${cn(b.night)}夜 · 星光暂熄`;
  const maxD = Math.max(1, ...team.map(u => u.dmg + u.heal));
  $('#r-list').innerHTML = team.map(u => `<li><span class="nm" style="color:${ELEMENTS[u.el].color}">${u.name}</span><span class="bar"><i style="width:${((u.dmg + u.heal) / maxD * 100).toFixed(1)}%"></i></span><span class="num">${Math.round(u.dmg)} 伤${u.heal ? ' · ' + Math.round(u.heal) + ' 疗' : ''}</span></li>`).join('');
  const act = $('#r-actions'); act.innerHTML = '';
  const btn = (txt, cls, fn) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn ' + cls; x.textContent = txt; x.addEventListener('click', fn); act.appendChild(x); };
  if (win) {
    const oldCap = S.save.cap; S.save.cap = Math.min(STAR_CAP_MAX, S.save.cap + 1);
    const lv = [];
    team.forEach(u => { const r = u.rec; if (r.level < 12) { r.level++; lv.push(`${r.name} Lv.${r.level}`); } r.wins = (r.wins || 0) + 1; r.power = powerOf(r); });
    S.save.night++; S.wave = null; persist(); updateHud();
    $('#r-sub').textContent = '星图兽们的光芒更盛了。';
    $('#r-gain').innerHTML = [
      S.save.cap > oldCap ? `星力 ${oldCap} → ${S.save.cap}：下一只星图兽可以多连一颗星` : '星力已满盈（15）',
      lv.length ? `成长：${lv.join('、')}` : '',
      `夜空轮转，当空移至 ${zenText()}`,
    ].filter(Boolean).map(s => `<span>${s}</span>`).join('');
    $('#r-tip').hidden = true;
    btn('回到观星', '', () => endBattle('draw'));
    btn('迎接下一夜', 'btn-primary', () => endBattle('prep'));
  } else {
    $('#r-sub').textContent = '蚀星仍在徘徊。换个形状、换种星色，再来一次。';
    $('#r-gain').innerHTML = '';
    $('#r-tip').hidden = false; $('#r-tip').textContent = counterTip(b.wave) + ' 闭环越多护甲越厚，锐角越多攻势越强。';
    btn('回到观星', '', () => endBattle('draw'));
    btn('再战一次', 'btn-primary', () => endBattle('prep'));
  }
}
function endBattle(next) {
  S.battle = null; clearFx(); el.bhud.hidden = true; el.hud.classList.remove('battle'); el.result.hidden = true; S.overlay = null;
  S.mode = 'draw'; updateHud();
  setTab(next === 'prep' ? 'battle' : 'draw');
}

/* ---------- navigation ---------- */
function showDrawUI(on) { el.oracle.hidden = !on; el.dock.hidden = !on; }
function closeOverlays() {
  el.atlas.hidden = true; el.prep.hidden = true; hideCard(); S.overlay = null; S.thumbs = [];
}
function setTab(tab) {
  if (S.mode === 'battle' || S.mode === 'awaken' || S.mode === 'title') return;
  closeOverlays();
  let shown = tab;
  if (tab === 'battle' && !openPrep()) shown = 'draw';
  if (tab === 'atlas') openAtlas();
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === shown));
  showDrawUI(shown === 'draw');
  if (shown !== 'draw') el.toast.classList.remove('show');
  else if (!(S.save.tut & 1)) toast('按住一颗星，拖向附近的另一颗星，连成第一条星线', 0);
}
function updateHud() {
  el.night.textContent = `第${cn(S.save.night)}夜 · 当空 ${zenText()}`;
  el.cap.textContent = `星力 ${S.save.cap}`;
  el.atlasCount.textContent = S.save.beasts.length;
  el.mute.classList.toggle('off', S.save.muted);
  updateOracle(); updateDock();
}

/* ---------- wiring ---------- */
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
el.undo.addEventListener('click', undo);
el.clear.addEventListener('click', () => { clearDraft(); AU.tick(); });
el.awaken.addEventListener('click', startAwaken);
el.newsky.addEventListener('click', () => {
  S.draft = { nodes: [], edges: [], active: -1, hist: [] };
  S.save.skySeed = (Math.random() * 1e9) | 0; S.save.skyAspect = clamp(W / H, .5, 2.4); S.save.claimed = {};
  S.sky = genSky(S.save.skySeed, S.save.skyAspect); computeView(S.sky); renderBg(S.sky, bgc); bgReady = true;
  persist(); onDraftChange(); pickGhost(); flashScreen('#9fb6ff', .3); AU.whoosh();
  toast('转向了一片新的星域。冷色的星聚集处生雷与霜，暖色的星聚集处生焰与烬', 4200);
});
el.mute.addEventListener('click', () => { S.save.muted = !S.save.muted; AU.setMuted(S.save.muted); persist(); updateHud(); });
$('#o-toggle').addEventListener('click', () => el.oracle.classList.toggle('open'));
$('#p-go').addEventListener('click', startBattle);
$('#p-edit').addEventListener('click', () => setTab('atlas'));
$('#bh-speed').addEventListener('click', () => {
  if (!S.battle) return;
  S.battle.speed = S.battle.speed === 1 ? 2 : S.battle.speed === 2 ? 3 : 1; S.save.speed = S.battle.speed; persist();
  $('#bh-speed').textContent = '×' + S.battle.speed;
});
$('#bh-quit').addEventListener('click', () => { if (S.battle && !S.battle.over) { S.battle.over = true; S.battle.result = 'lose'; S.battle.endT = S.battle.t - 9; AU.lose(); } });
$('#a-import').addEventListener('submit', e => { e.preventDefault(); const v = $('#a-code').value; if (importCode(v)) $('#a-code').value = ''; });
window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT')) return;
  if (e.key === 'Escape') {
    if (!el.card.hidden) { if (S.cardMode === 'new') returnToSky(false); else hideCard(); }
    else if (S.overlay === 'atlas' || S.overlay === 'prep') setTab('draw');
    return;
  }
  if (!drawActive()) return;
  if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey || !e.shiftKey)) { e.preventDefault(); undo(); }
  else if (e.key === 'Backspace') { e.preventDefault(); undo(); }
  else if (e.key === 'Enter') startAwaken();
});
window.addEventListener('resize', resize);

$('#t-start').addEventListener('click', () => {
  AU.init(); AU.setMuted(S.save.muted);
  el.title.classList.add('out'); setTimeout(() => { el.title.hidden = true; }, 800);
  el.hud.hidden = false; S.mode = 'draw'; S.attract = null;
  setTab('draw'); pickGhost(); updateHud();
  const h = (location.hash || '').slice(1);
  if (/^xt[0-9a-z]{8,}$/i.test(h)) setTimeout(() => importCode(h), 600);
});

/* ---------- main loop ---------- */
let last = performance.now();
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (bgReady) ctx.drawImage(bgc, 0, 0, W, H); else { ctx.fillStyle = '#03040b'; ctx.fillRect(0, 0, W, H); }
  if (JUICE.shake > .2) ctx.translate((R() - .5) * JUICE.shake, (R() - .5) * JUICE.shake);
  const t = S.t;
  if (S.mode === 'title') { drawSkyLayer(t, 1); drawAttract(); }
  else if (S.mode === 'draw') { drawSkyLayer(t, S.overlay ? .55 : 1); drawDraft(t); drawGhost(t); }
  else if (S.mode === 'awaken') renderAwaken(t);
  else if (S.mode === 'battle' && S.battle) renderBattle(t);
  drawFx(ctx, H);
  if (S.mode === 'battle' && S.battle) { renderBars(); drawBanner(); }
  drawTexts(ctx);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (JUICE.flash > .003) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = JUICE.flash * .55; ctx.fillStyle = JUICE.flashCol; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
}
function frame(now) {
  const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now; S.t += dt;
  try {
    if (S.mode === 'title') { updateAttract(dt); maybeShootingStar(dt); }
    else if (S.mode === 'draw') maybeShootingStar(dt);
    else if (S.mode === 'awaken') updateAwaken(dt);
    else if (S.mode === 'battle' && S.battle) updateBattle(dt);
    const fxdt = S.mode === 'battle' && S.battle ? dt * S.battle.speed * (JUICE.stop > 0 ? .12 : 1) : dt;
    updateFx(fxdt);
    if (S.thumbs.length && !el.atlas.hidden) updateThumbs(dt);
    if (S.cardBody && !el.card.hidden) updateCardView(dt);
    updateRadars(dt);
    render();
  } catch (err) { console.error(err); }
  JUICE.shake = Math.max(0, JUICE.shake - dt * 45); JUICE.flash = Math.max(0, JUICE.flash - dt * 1.8);
  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
(function boot() {
  W = window.innerWidth; H = window.innerHeight;
  S.save = loadSave() || newSave();
  AU.muted = S.save.muted;
  S.sky = genSky(S.save.skySeed, S.save.skyAspect);
  resize();
  renderBg(S.sky, bgc); bgReady = true;
  updateHud();
  $('#t-night').textContent = cn(S.save.night);
  $('#t-cont').textContent = S.save.beasts.length ? `继续 · 第${cn(S.save.night)}夜 · 图鉴已收 ${S.save.beasts.length} 只` : '首次观星约需一分钟：连星、点睛、迎战。';
  $('#o-cycle').innerHTML = cycleHTML();
  requestAnimationFrame(t => { last = t; frame(t); });
  window.__starBeasts = { S, analyze, toScreen, tryConnect, startAwaken, setTab, genWave, importCode, persist };
})();
