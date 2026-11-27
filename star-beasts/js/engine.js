'use strict';
/* =====================================================================
   星图兽 · engine.js
   Utilities, noise, glow sprites, synthesized audio, particle FX,
   procedural night sky and its pre-rendered background.
   ===================================================================== */

/* ---------- math & small helpers ---------- */
const TAU = Math.PI * 2;
const ACUTE = 55 * Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const R = Math.random;
const pick = (a, r = R) => a[Math.floor(r() * a.length)];
const $ = s => document.querySelector(s);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const CN = '零一二三四五六七八九'.split('');
function cn(n) {
  n = Math.floor(n);
  if (n < 10) return CN[n];
  if (n < 20) return '十' + (n % 10 ? CN[n % 10] : '');
  if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
  return String(n);
}
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const c = hexRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const FONT_SERIF = '"Noto Serif SC","Songti SC","STSong","SimSun",serif';
const FONT_BRUSH = '"Ma Shan Zheng","STXingkai","STKaiti","KaiTi",serif';
const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ---------- world data ---------- */
// Spectral classes, hot → cool. Saturation exaggerated for readability.
const SPEC = [
  { k: 'O', c: '#8fb0ff' }, { k: 'B', c: '#a9c6ff' }, { k: 'A', c: '#e2ecff' },
  { k: 'F', c: '#fff6dc' }, { k: 'G', c: '#ffe08f' }, { k: 'K', c: '#ffad62' }, { k: 'M', c: '#ff7458' },
];

const ELEMENTS = {
  storm: { id: 'storm', ch: '雷', color: '#8ea8ff', glow: '#5f7dff', words: ['霆', '雷', '电'], star: '蓝白色的星', lore: '引九霄之电', skill: '九霄链雷', skillD: '雷光在敌阵间跳跃，连击至多三名敌人' },
  frost: { id: 'frost', ch: '霜', color: '#c4f3ff', glow: '#86dcff', words: ['霜', '凛', '雪'], star: '素白色的星', lore: '携长夜之寒', skill: '凛冬霜缚', skillD: '冰封一名敌人使其停滞，解冻后仍会减速' },
  light: { id: 'light', ch: '辉', color: '#ffe7a0', glow: '#ffc94f', words: ['曜', '辉', '明'], star: '金黄色的星', lore: '承晨星之光', skill: '曜日圣辉', skillD: '重疗最虚弱的同伴，并为全队回复生命' },
  flame: { id: 'flame', ch: '焰', color: '#ffa257', glow: '#ff7a2a', words: ['炎', '焰', '燎'], star: '橙红色的星', lore: '燃赤星之火', skill: '焚天流火', skillD: '流火坠向全体敌人，并持续灼烧' },
  ember: { id: 'ember', ch: '烬', color: '#ff5a6a', glow: '#ff2c4c', words: ['烬', '绯', '殷'], star: '深红色的星', lore: '聚将熄之星', skill: '烬灭', skillD: '重击一名敌人，自身越虚弱伤害越高，并吸取生命' },
};
// Each element overpowers the next one; ember closes the ring by overpowering storm.
const EL_ORDER = ['storm', 'frost', 'light', 'flame', 'ember'];
function elMult(a, d) {
  const i = EL_ORDER.indexOf(a), j = EL_ORDER.indexOf(d);
  if ((i + 1) % 5 === j) return 1.4;
  if ((j + 1) % 5 === i) return .8;
  return 1;
}
const counterOf = el => EL_ORDER[(EL_ORDER.indexOf(el) + 4) % 5];

const FORMS = {
  tortoise: { ch: '龟', passive: '玄甲', d: '开战时获得 30% 生命值的护盾', rule: '两处以上闭环', melee: false },
  spider: { ch: '蛛', passive: '千丝', d: '攻击会波及另一名敌人（50% 伤害）', rule: '一星牵出四线以上', melee: false },
  butterfly: { ch: '蝶', passive: '幻翼', d: '22% 几率闪避攻击', rule: '高度对称，横向舒展', melee: false },
  crane: { ch: '鹤', passive: '鹤唳', d: '灵力积蓄速度 +40%', rule: '高度对称，纵向挺拔', melee: false },
  dragon: { ch: '龙', passive: '龙摆', d: '每第三次攻击横扫全体敌人', rule: '七星以上不分叉的长链', melee: true },
  serpent: { ch: '蛇', passive: '缠噬', d: '攻击使目标减速 2.5 秒', rule: '不分叉的短链', melee: true },
  whale: { ch: '鲸', passive: '沧溟', d: '生命 +15%，更容易吸引敌人攻击', rule: '恰好一处闭环', melee: false },
  wolf: { ch: '狼', passive: '獠牙', d: '锐角越多暴击越高，暴击造成 180% 伤害', rule: '锐角密集', melee: true },
  deer: { ch: '鹿', passive: '回春', d: '每秒回复 1.2% 生命', rule: '两处以上三岔', melee: true },
  fox: { ch: '狐', passive: '灵遁', d: '首次濒危时遁入星影 2 秒，并蓄满灵力', rule: '其余形态', melee: false },
};

const RARITY = [
  { ch: '凡', min: 0, mult: 1, seal: '#59628a' },
  { ch: '灵', min: .47, mult: 1.06, seal: '#2b7da6' },
  { ch: '玄', min: .58, mult: 1.13, seal: '#7a4bc2' },
  { ch: '天', min: .69, mult: 1.22, seal: '#c63c2c' },
];

// The 28 lunar mansions, laid across the sky from left to right.
const MANSIONS = '角亢氐房心尾箕斗牛女虚危室壁奎娄胃昴毕觜参井鬼柳星张翼轸'.split('');
const QUADS = ['东方苍龙', '北方玄武', '西方白虎', '南方朱雀'];
const PREFIX = '璇玑瑶枢衡玄紫青孤寒渊流长太北南辰昴澜虚晦朔望霁岚烛夙苍素幽'.split('');

/* ---------- value noise ---------- */
function makeNoise(seed) {
  const r = mulberry32(seed >>> 0), perm = new Uint8Array(512), val = new Float32Array(256), p = [];
  for (let i = 0; i < 256; i++) { p.push(i); val[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const a = val[perm[X + perm[Y]]], b = val[perm[X + 1 + perm[Y]]];
    const c = val[perm[X + perm[Y + 1]]], d = val[perm[X + 1 + perm[Y + 1]]];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}
function fbm(n, x, y, o = 4) {
  let s = 0, a = .5, f = 1, norm = 0;
  for (let i = 0; i < o; i++) { s += a * n(x * f, y * f); norm += a; a *= .5; f *= 2.03; }
  return s / norm;
}

/* ---------- glow sprites (pre-rendered, drawn additively) ---------- */
const spriteCache = new Map();
function glowSprite(col) {
  const key = 'g' + col; let c = spriteCache.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), [r, gg, b] = hexRgb(col);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  gr.addColorStop(.18, `rgba(${r},${gg},${b},.55)`);
  gr.addColorStop(.45, `rgba(${r},${gg},${b},.15)`);
  gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  spriteCache.set(key, c); return c;
}
function coreSprite(col) {
  const key = 'c' + col; let c = spriteCache.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), [r, gg, b] = hexRgb(col);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(.22, `rgba(${r},${gg},${b},.95)`);
  gr.addColorStop(.5, `rgba(${r},${gg},${b},.28)`);
  gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  spriteCache.set(key, c); return c;
}
function spikeSprite() {
  let c = spriteCache.get('spike'); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const line = (x1, y1, x2, y2) => {
    const gr = g.createLinearGradient(x1, y1, x2, y2);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  };
  line(0, 64, 128, 64); line(64, 0, 64, 128);
  spriteCache.set('spike', c); return c;
}
// Assumes globalCompositeOperation = 'lighter'.
function drawStar(g, x, y, r, col, a, spike) {
  if (a <= .01) return;
  g.globalAlpha = a * .5; g.drawImage(glowSprite(col), x - r * 5, y - r * 5, r * 10, r * 10);
  g.globalAlpha = a; g.drawImage(coreSprite(col), x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
  if (spike) { g.globalAlpha = a * .65; g.drawImage(spikeSprite(), x - r * 6, y - r * 6, r * 12, r * 12); }
}

/* ---------- synthesized audio ---------- */
const AU = {
  c: null, muted: false,
  init() {
    if (this.c) { if (this.c.state === 'suspended') this.c.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    try { this.c = new C(); } catch (e) { this.c = null; return; }
    const c = this.c;
    this.out = c.createGain(); this.out.gain.value = this.muted ? 0 : .7;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = .003; comp.release.value = .25;
    this.out.connect(comp); comp.connect(c.destination);
    const verb = c.createConvolver(); verb.buffer = this.ir(3.4, 2.6);
    const wet = c.createGain(); wet.gain.value = .4; verb.connect(wet); wet.connect(this.out);
    this.bus = c.createGain(); this.bus.connect(this.out); this.bus.connect(verb);
    this.nbuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.drone();
  },
  ir(sec, dec) {
    const c = this.c, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, dec); }
    return b;
  },
  setMuted(m) { this.muted = m; if (this.c) this.out.gain.setTargetAtTime(m ? 0 : .7, this.c.currentTime, .05); },
  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  },
  tone(f, o = {}) {
    const c = this.c; if (!c) return;
    const t = c.currentTime + (o.when || 0), dur = o.dur || 1;
    const osc = c.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = c.createGain(); this.env(g, t, o.a || .005, o.gain || .12, dur);
    let n = osc;
    if (o.lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; osc.connect(fl); n = fl; }
    n.connect(g);
    let last = g;
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); g.connect(p); last = p; }
    last.connect(this.bus); osc.start(t); osc.stop(t + dur + .05);
  },
  bell(f, o = {}) {
    const g = o.gain || .1, d = o.dur || 1.4;
    this.tone(f, { ...o, type: 'sine', gain: g, dur: d });
    this.tone(f * 2.0, { ...o, type: 'sine', gain: g * .3, dur: d * .55 });
    this.tone(f * 3.01, { ...o, type: 'sine', gain: g * .12, dur: d * .35 });
  },
  noise(o = {}) {
    const c = this.c; if (!c) return;
    const t = c.currentTime + (o.when || 0), dur = o.dur || .3;
    const s = c.createBufferSource(); s.buffer = this.nbuf;
    const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q || 1;
    const g = c.createGain(); this.env(g, t, o.a || .005, o.gain || .2, dur);
    s.connect(f); f.connect(g); g.connect(this.bus); s.start(t, Math.random()); s.stop(t + dur + .05);
  },
  drone() {
    const c = this.c, g = c.createGain();
    g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(.05, c.currentTime + 5);
    g.connect(this.bus);
    [73.42, 110, 146.83].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = (i - 1) * 5;
      const og = c.createGain(); og.gain.value = i === 2 ? .22 : .45;
      const lfo = c.createOscillator(); lfo.frequency.value = .05 + i * .031;
      const lg = c.createGain(); lg.gain.value = .22; lfo.connect(lg); lg.connect(og.gain);
      o.connect(og); og.connect(g); o.start(); lfo.start();
    });
    const s = c.createBufferSource(); s.buffer = this.nbuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = .7;
    const wg = c.createGain(); wg.gain.value = .14;
    const lfo = c.createOscillator(); lfo.frequency.value = .07;
    const lg = c.createGain(); lg.gain.value = 320; lfo.connect(lg); lg.connect(f.frequency);
    s.connect(f); f.connect(wg); wg.connect(g); s.start(); lfo.start();
  },
  // D minor pentatonic, from D4 upwards.
  note(i) { const deg = [0, 3, 5, 7, 10]; const k = ((i % 5) + 5) % 5; return 293.66 * Math.pow(2, (Math.floor(i / 5) * 12 + deg[k]) / 12); },
  starNote(st, o = {}) {
    if (!st) return;
    const i = clamp(Math.round((1 - (st.y - .08) / .78) * 12), 0, 13);
    this.bell(this.note(i), { gain: .07 + st.mag * .05, dur: 1.8, pan: (st.x / (S.sky ? S.sky.aspect : 1) - .5) * 1.2, ...o });
  },
  tick() { this.tone(1500, { type: 'triangle', gain: .025, dur: .07 }); },
  deny() { this.tone(190, { type: 'triangle', gain: .06, dur: .2, to: 120 }); },
  awaken(freqs) {
    freqs.forEach((f, i) => this.bell(f, { when: i * .045, gain: .06, dur: 3 }));
    this.tone(73.42, { type: 'sine', gain: .25, dur: 2.6, a: .02 });
    this.noise({ type: 'lowpass', f: 3000, to: 200, dur: 1.6, gain: .22 });
  },
  roar() {
    this.noise({ type: 'lowpass', f: 220, to: 1500, dur: .9, gain: .22, a: .08 });
    this.tone(78, { type: 'sawtooth', to: 46, dur: 1.1, gain: .07, lp: 420, a: .05 });
  },
  hit(crit) {
    this.noise({ f: crit ? 1900 : 950, q: .8, gain: crit ? .26 : .16, dur: .13 });
    this.tone(crit ? 230 : 165, { type: 'triangle', to: 60, dur: .16, gain: .11 });
    if (crit) this.bell(1174.66, { gain: .05, dur: .6 });
  },
  whiff() { this.noise({ type: 'highpass', f: 2600, dur: .18, gain: .07 }); },
  charge() { this.tone(220, { type: 'sine', to: 700, dur: .42, gain: .045 }); },
  skill(el) {
    switch (el) {
      case 'storm':
        for (let k = 0; k < 6; k++) this.noise({ type: 'highpass', f: 2800 + Math.random() * 2400, when: k * .045, dur: .07, gain: .2 });
        this.tone(900, { type: 'sawtooth', to: 110, dur: .32, gain: .045, lp: 3200 }); break;
      case 'frost':
        [1760, 2349.3, 2637, 3520].forEach((f, i) => this.bell(f, { when: i * .05, gain: .045, dur: 1.6 })); break;
      case 'light':
        [587.33, 739.99, 880, 1174.66].forEach((f, i) => this.bell(f, { when: i * .07, gain: .06, dur: 2.2 })); break;
      case 'flame':
        this.noise({ type: 'lowpass', f: 300, to: 2600, dur: .6, gain: .24, a: .1 });
        this.tone(90, { type: 'sine', to: 40, dur: .7, gain: .24 }); break;
      case 'ember':
        this.tone(55, { type: 'sawtooth', dur: .9, gain: .1, lp: 300 });
        this.noise({ type: 'lowpass', f: 700, to: 100, dur: .8, gain: .28 }); break;
    }
  },
  death() { [880, 659.25, 493.88, 329.63].forEach((f, i) => this.bell(f, { when: i * .09, gain: .05, dur: 1.2 })); },
  win() { [0, 2, 4, 5, 7, 9].forEach((i, k) => this.bell(this.note(i), { when: k * .11, gain: .08, dur: 2.2 })); },
  lose() { [146.83, 138.59, 110].forEach((f, i) => this.tone(f, { type: 'triangle', when: i * .26, dur: 1.4, gain: .08 })); },
  whoosh() { this.noise({ type: 'bandpass', f: 400, to: 2400, dur: .7, gain: .14, a: .2, q: .6 }); },
};

/* ---------- particle & screen FX ---------- */
const FX = { p: [], rings: [], bolts: [], beams: [], texts: [] };
const JUICE = { shake: 0, flash: 0, flashCol: '#ffffff', stop: 0 };
function part(o) {
  if (FX.p.length > 1600) return;
  FX.p.push(Object.assign({ vx: 0, vy: 0, g: 0, drag: 1, size: 3, life: 1, t: 0, col: '#ffffff', type: 'glow', a: 1, rot: 0, spin: 0, flick: false }, o));
}
function burst(x, y, col, n, spd = 180, size = 4) {
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, v = spd * (.3 + R() * .9);
    part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: .9, life: .45 + R() * .55, size: size * (.5 + R()), col, type: R() < .5 ? 'spark' : 'glow' });
  }
}
function ring(x, y, col, r1, life = .5, lw = 2, r0 = 4, a = 1) { FX.rings.push({ x, y, col, r0, r1, life, t: 0, lw, a }); }
function bolt(x1, y1, x2, y2, col, life = .3) { FX.bolts.push({ x1, y1, x2, y2, col, life, t: 0 }); }
function beam(x, y, col, life = .8, w = 40) { FX.beams.push({ x, y, col, life, t: 0, w }); }
function popText(x, y, txt, col, size = 1, tag = null, brush = false) {
  if (FX.texts.length > 80) FX.texts.shift();
  FX.texts.push({ x, y, txt, col, size, tag, brush, t: 0, life: brush ? 1.5 : 1.1, vx: (R() - .5) * 34 });
}
function shake(v) { if (!REDUCED) JUICE.shake = Math.max(JUICE.shake, v); }
function flashScreen(col, a) { JUICE.flashCol = col; JUICE.flash = Math.max(JUICE.flash, REDUCED ? a * .3 : a); }
function hitStop(s) { JUICE.stop = Math.max(JUICE.stop, s); }

function updateFx(dt) {
  const P = FX.p; let w = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i]; p.t += dt;
    if (p.t >= p.life) continue;
    const dr = Math.pow(p.drag, dt * 60);
    p.vx *= dr; p.vy = p.vy * dr + p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
    P[w++] = p;
  }
  P.length = w;
  for (const k of ['rings', 'bolts', 'beams', 'texts']) {
    const L = FX[k]; let j = 0;
    for (let i = 0; i < L.length; i++) { L[i].t += dt; if (L[i].t < L[i].life) L[j++] = L[i]; }
    L.length = j;
  }
}
function clearFx() { FX.p.length = 0; FX.rings.length = 0; FX.bolts.length = 0; FX.beams.length = 0; FX.texts.length = 0; }

function jagged(g, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
  const n = Math.max(4, Math.floor(d / 16));
  g.moveTo(x1, y1);
  for (let i = 1; i < n; i++) {
    const t = i / n, off = (R() - .5) * d * .14 * Math.sin(t * Math.PI);
    g.lineTo(x1 + dx * t + nx * off, y1 + dy * t + ny * off);
  }
  g.lineTo(x2, y2);
}

function drawFx(g, H) {
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const p of FX.p) {
    const k = p.t / p.life;
    const a = p.a * (1 - k) * (p.flick ? .55 + .45 * Math.sin(p.t * 28 + p.x) : 1);
    if (a <= .005) continue;
    switch (p.type) {
      case 'glow': { const s = p.size * (1 - k * .5); g.globalAlpha = a; g.drawImage(glowSprite(p.col), p.x - s, p.y - s, s * 2, s * 2); break; }
      case 'spark': {
        g.globalAlpha = a; g.strokeStyle = p.col; g.lineWidth = Math.max(1, p.size * .35);
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * .035, p.y - p.vy * .035); g.stroke(); break;
      }
      case 'snow': {
        g.globalAlpha = a; g.strokeStyle = p.col; g.lineWidth = 1; const s = p.size; g.beginPath();
        for (let i = 0; i < 3; i++) { const an = p.rot + i * Math.PI / 3; g.moveTo(p.x - Math.cos(an) * s, p.y - Math.sin(an) * s); g.lineTo(p.x + Math.cos(an) * s, p.y + Math.sin(an) * s); }
        g.stroke(); break;
      }
      case 'shard': {
        g.globalAlpha = a; g.fillStyle = p.col; g.save(); g.translate(p.x, p.y); g.rotate(p.rot); const s = p.size;
        g.beginPath(); g.moveTo(s * 1.8, 0); g.lineTo(0, s * .45); g.lineTo(-s * .8, 0); g.lineTo(0, -s * .45); g.closePath(); g.fill(); g.restore(); break;
      }
      case 'streak': {
        const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, len = sp * .16;
        const gr = g.createLinearGradient(p.x, p.y, p.x - ux * len, p.y - uy * len);
        gr.addColorStop(0, rgba(p.col, a)); gr.addColorStop(1, rgba(p.col, 0));
        g.globalAlpha = 1; g.strokeStyle = gr; g.lineWidth = 1.6; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - ux * len, p.y - uy * len); g.stroke();
        g.globalAlpha = a; g.drawImage(glowSprite(p.col), p.x - 6, p.y - 6, 12, 12); break;
      }
    }
  }
  for (const r of FX.rings) {
    const k = r.t / r.life, rad = lerp(r.r0, r.r1, easeOut(k));
    g.globalAlpha = (1 - k) * r.a; g.strokeStyle = r.col; g.lineWidth = Math.max(.5, r.lw * (1 - k * .6));
    g.beginPath(); g.arc(r.x, r.y, Math.max(0, rad), 0, TAU); g.stroke();
  }
  for (const b of FX.bolts) {
    const k = b.t / b.life;
    g.globalAlpha = (1 - k) * .45; g.strokeStyle = b.col; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); jagged(g, b.x1, b.y1, b.x2, b.y2); g.stroke();
    g.globalAlpha = 1 - k; g.strokeStyle = '#ffffff'; g.lineWidth = 1.6;
    g.beginPath(); jagged(g, b.x1, b.y1, b.x2, b.y2); g.stroke();
  }
  for (const b of FX.beams) {
    const k = b.t / b.life, a = Math.sin(k * Math.PI), w = b.w * (1 - k * .35);
    const gr = g.createLinearGradient(0, b.y - H, 0, b.y);
    gr.addColorStop(0, rgba(b.col, 0)); gr.addColorStop(.75, rgba(b.col, .35 * a)); gr.addColorStop(1, rgba(b.col, .7 * a));
    g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(b.x - w / 2, b.y - H, w, H);
    g.globalAlpha = a * .8; const s = w * 1.6; g.drawImage(glowSprite(b.col), b.x - s, b.y - s, s * 2, s * 2);
  }
  g.restore();
}

function drawTexts(g) {
  if (!FX.texts.length) return;
  g.save(); g.globalCompositeOperation = 'source-over'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const tx of FX.texts) {
    const k = tx.t / tx.life;
    const y = tx.y - (tx.brush ? 26 : 48) * easeOut(Math.min(1, k * 1.4));
    const x = tx.x + tx.vx * k;
    const a = k < .7 ? 1 : 1 - (k - .7) / .3;
    const pop = k < .12 ? 1 + (1 - k / .12) * .6 : 1;
    const fs = Math.round(16 * tx.size * pop);
    g.font = tx.brush ? `${Math.round(fs * 1.35)}px ${FONT_BRUSH}` : `900 ${fs}px ${FONT_SERIF}`;
    g.globalAlpha = a; g.lineWidth = 3.5; g.strokeStyle = 'rgba(5,4,16,.85)'; g.lineJoin = 'round';
    g.strokeText(tx.txt, x, y); g.fillStyle = tx.col; g.fillText(tx.txt, x, y);
    if (tx.tag) {
      const w = g.measureText(tx.txt).width, sz = Math.round(fs * .82), sx = x + w / 2 + sz * .75;
      g.fillStyle = '#c63c2c'; g.fillRect(sx - sz / 2, y - sz / 2, sz, sz);
      g.fillStyle = '#fff3e4'; g.font = `${Math.round(sz * .82)}px ${FONT_BRUSH}`; g.fillText(tx.tag, sx, y + 1);
    }
  }
  g.restore();
}

/* ---------- procedural sky ---------- */
let W = window.innerWidth, H = window.innerHeight, DPR = Math.min(2, window.devicePixelRatio || 1);
const VS = { s: 1, ox: 0, oy: 0 };
function computeView(sky) {
  const s = Math.min(W / sky.aspect, H);
  VS.s = s; VS.ox = (W - sky.aspect * s) / 2; VS.oy = (H - s) / 2;
}
const toScreen = (x, y) => [VS.ox + x * VS.s, VS.oy + y * VS.s];

// One smooth "temperature" field drives both star colours and nebula tint,
// so warm and cool regions of the sky read as places you can go to on purpose.
function skyTemp(sky, x, y) { return clamp((fbm(sky.tn, x * 1.25 + 3.1, y * 1.25 + 7.7, 3) - .5) * 2.6 + .5, 0, 1); }

function genSky(seed, aspect) {
  aspect = clamp(aspect, .5, 2.4);
  const r = mulberry32(seed >>> 0), tn = makeNoise((seed ^ 0x51ed27) >>> 0);
  const portrait = aspect < .8, top = portrait ? .13 : .12, bot = portrait ? .74 : .84;
  const target = Math.round(aspect * (bot - top) * 150), minD = .05, stars = [];
  const sky = { seed, aspect, stars, tn, top, bot };
  let tries = 0;
  while (stars.length < target && tries < target * 90) {
    tries++;
    const x = aspect * (.03 + r() * .94), y = top + r() * (bot - top);
    let ok = true;
    for (const s of stars) { const dx = s.x - x, dy = s.y - y; if (dx * dx + dy * dy < minD * minD) { ok = false; break; } }
    if (!ok) continue;
    const mag = .25 + .75 * Math.pow(r(), 1.9);
    const cls = clamp(Math.round(skyTemp(sky, x, y) * 6.6 - .3 + (r() - .5) * 2), 0, 6);
    stars.push({ id: stars.length, x, y, mag, cls, ph: r() * TAU, sp: .8 + r() * 1.6 });
  }
  return sky;
}

function renderBg(sky, bgc) {
  const w = W, h = H;
  bgc.width = Math.round(w * DPR); bgc.height = Math.round(h * DPR);
  const g = bgc.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#02030a'); gr.addColorStop(.5, '#080d27'); gr.addColorStop(.82, '#141238'); gr.addColorStop(1, '#26173a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);

  // Nebula at 1/5 resolution, domain-warped, tinted by the temperature field.
  const n1 = makeNoise(sky.seed + 11), n2 = makeNoise(sky.seed + 23);
  const cell = 5, nw = Math.ceil(w / cell), nh = Math.ceil(h / cell);
  const nc = document.createElement('canvas'); nc.width = nw; nc.height = nh;
  const nx = nc.getContext('2d'), img = nx.createImageData(nw, nh), D = img.data;
  const ang = -.42, ca = Math.cos(ang), sa = Math.sin(ang);
  for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
    const sx = (i * cell - VS.ox) / VS.s, sy = (j * cell - VS.oy) / VS.s;
    const wx = fbm(n1, sx * 1.4, sy * 1.4, 3), wy = fbm(n1, sx * 1.4 + 5.2, sy * 1.4 + 1.3, 3);
    const d = fbm(n2, sx * 2.1 + wx * 1.8, sy * 2.1 + wy * 1.8, 5);
    const u = (sx - sky.aspect / 2) * sa + (sy - .45) * ca, band = Math.exp(-(u * u) / .05);
    const dens = Math.pow(clamp((d - .4) * 2.3, 0, 1), 1.7) * (.4 + .9 * band) + band * .12;
    const t = skyTemp(sky, sx, sy);
    let rr = lerp(34, 175, t), gg = lerp(66, 46, t), bb = lerp(175, 105, t);
    rr = lerp(rr, 125, wx * .5); bb = lerp(bb, 210, (1 - wx) * .3);
    const k = (j * nw + i) * 4;
    D[k] = rr; D[k + 1] = gg; D[k + 2] = bb; D[k + 3] = clamp(dens * 205, 0, 255);
  }
  nx.putImageData(img, 0, 0);
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = .82;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(nc, 0, 0, w, h); g.restore();

  // Thousands of faint stars, denser along the milky way.
  const fr = mulberry32(sky.seed + 97), cnt = Math.round(w * h / 650);
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < cnt; k++) {
    const x = fr() * w, y = fr() * h * .93;
    const sx = (x - VS.ox) / VS.s, sy = (y - VS.oy) / VS.s;
    const u = (sx - sky.aspect / 2) * sa + (sy - .45) * ca, band = Math.exp(-(u * u) / .05);
    const keep = fr(), a = .12 + fr() * .55, s = fr() < .07 ? 1.5 : .8, cl = SPEC[Math.floor(fr() * 7)].c;
    if (keep > .32 + band * .68) continue;
    g.fillStyle = rgba(cl, a); g.fillRect(x, y, s, s);
  }
  g.restore();

  // Faint celestial grid: arcs around a pole above the frame, like an old star atlas.
  g.save(); g.strokeStyle = 'rgba(232,198,122,.05)'; g.lineWidth = 1;
  const px = w / 2, py = -h * .55;
  for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(px, py, h * (.85 + k * .17), 0, Math.PI); g.stroke(); }
  for (let k = 0; k <= 12; k++) {
    const a = Math.PI * (.18 + k * .64 / 12);
    g.beginPath(); g.moveTo(px + Math.cos(a) * h * .85, py + Math.sin(a) * h * .85); g.lineTo(px + Math.cos(a) * h * 2, py + Math.sin(a) * h * 2); g.stroke();
  }
  g.restore();

  drawMountains(g, w, h, sky.seed);

  const vg = g.createRadialGradient(w / 2, h * .45, Math.min(w, h) * .3, w / 2, h * .5, Math.max(w, h) * .78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,6,.55)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
}

function drawMountains(g, w, h, seed) {
  const n = makeNoise(seed + 5);
  const hz = g.createLinearGradient(0, h * .76, 0, h);
  hz.addColorStop(0, 'rgba(90,70,150,0)'); hz.addColorStop(1, 'rgba(95,62,140,.2)');
  g.fillStyle = hz; g.fillRect(0, h * .76, w, h * .24);
  const layers = [
    { y: .9, a: .075, f: 2.3, c1: '#120f2e', c2: '#0a0a1f' },
    { y: .935, a: .05, f: 4.2, c1: '#0b0a21', c2: '#060715' },
    { y: .97, a: .03, f: 7.5, c1: '#06060f', c2: '#030309' },
  ];
  const ridge = (L, li, x) => {
    const v = fbm(n, x / w * L.f + li * 7.3, li * 3.1, 4), rd = 1 - Math.abs(v * 2 - 1);
    return h * L.y - h * L.a * (v * .6 + rd * .8);
  };
  layers.forEach((L, li) => {
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w + 4; x += 4) g.lineTo(x, ridge(L, li, x));
    g.lineTo(w, h); g.closePath();
    const gg = g.createLinearGradient(0, h * (L.y - L.a), 0, h);
    gg.addColorStop(0, L.c1); gg.addColorStop(1, L.c2); g.fillStyle = gg; g.fill();
    if (li === 0) { g.strokeStyle = 'rgba(232,198,122,.08)'; g.lineWidth = 1; g.stroke(); }
    if (li === 1) {
      // An old observatory with an armillary sphere, standing on the middle ridge.
      const ox = w * .8, base = ridge(L, li, ox), s = Math.max(10, Math.min(w, h) * .022);
      g.fillStyle = '#070816';
      g.fillRect(ox - s * 2.4, base - s * .9, s * 4.8, s * 1.4);
      g.fillRect(ox - s * 1.6, base - s * 1.5, s * 3.2, s * .7);
      g.fillRect(ox - s * .12, base - s * 2.6, s * .24, s * 1.2);
      const cy = base - s * 3.6;
      g.lineWidth = Math.max(1.5, s * .14); g.strokeStyle = '#070816';
      g.beginPath(); g.arc(ox, cy, s, 0, TAU); g.stroke();
      g.beginPath(); g.ellipse(ox, cy, s, s * .32, -.35, 0, TAU); g.stroke();
      g.beginPath(); g.ellipse(ox, cy, s * .32, s, .3, 0, TAU); g.stroke();
      g.lineWidth = 1; g.strokeStyle = 'rgba(232,198,122,.32)';
      g.beginPath(); g.arc(ox, cy, s + 1, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
      g.beginPath(); g.moveTo(ox - s * 2.4, base - s * .9); g.lineTo(ox + s * 2.4, base - s * .9); g.stroke();
    }
  });
}
