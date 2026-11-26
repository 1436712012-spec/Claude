// Audio：全部 Web Audio 实时合成，不加载任何音频文件。
// 主角是悬浮场的嗡鸣；最有戏剧性的时刻是它突然消失。
import { clamp } from '../sim/noise.js';

function noiseBuffer(ctx, seconds = 2, type = 'white') {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (type === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; }
    else if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else d[i] = w;
  }
  return b;
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volume = 0.8;
    this.tones = new Map();
    this.musicT = 0;
    this.beat = 0;
  }

  // 只在用户点击时启动
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
    } catch (e) { return false; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 0.9; this.amb.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
    this.white = noiseBuffer(c, 2, 'white');
    this.pink = noiseBuffer(c, 3, 'pink');
    this.brown = noiseBuffer(c, 3, 'brown');
    this._engine();
    this._ambience();
    this.ready = true;
    return true;
  }

  _loop(buffer, dest, gain = 1) {
    const s = this.ctx.createBufferSource(); s.buffer = buffer; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(g); g.connect(dest); s.start();
    return { src: s, gain: g };
  }

  // ---------- 悬浮场 ----------
  _engine() {
    const c = this.ctx;
    this.eng = c.createGain(); this.eng.gain.value = 0; this.eng.connect(this.sfx);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2;
    lp.connect(this.eng);
    this.engLP = lp;
    this.oscA = c.createOscillator(); this.oscA.type = 'sawtooth'; this.oscA.frequency.value = 52;
    this.oscB = c.createOscillator(); this.oscB.type = 'triangle'; this.oscB.frequency.value = 52.7;
    this.oscC = c.createOscillator(); this.oscC.type = 'sine'; this.oscC.frequency.value = 26;
    const gA = c.createGain(); gA.gain.value = 0.18; const gB = c.createGain(); gB.gain.value = 0.35; const gC = c.createGain(); gC.gain.value = 0.6;
    this.oscA.connect(gA); this.oscB.connect(gB); this.oscC.connect(gC);
    gA.connect(lp); gB.connect(lp); gC.connect(lp);
    // 场颤：缓慢的振幅调制
    const lfo = c.createOscillator(); lfo.frequency.value = 5.3; const lg = c.createGain(); lg.gain.value = 0.08;
    lfo.connect(lg); lg.connect(this.eng.gain);
    [this.oscA, this.oscB, this.oscC, lfo].forEach((o) => o.start());
    // 贴地时的落叶水雾沙沙声
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.6;
    this.rustle = this._loop(this.pink, bp, 1);
    this.rustleOut = c.createGain(); this.rustleOut.gain.value = 0; bp.connect(this.rustleOut); this.rustleOut.connect(this.sfx);
    // 风
    const wl = c.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 700;
    this._loop(this.brown, wl, 1);
    this.wind = c.createGain(); this.wind.gain.value = 0.05; wl.connect(this.wind); this.wind.connect(this.sfx);
    // 静默心跳
    this.heartT = 0;
  }

  // ---------- 环境 ----------
  _ambience() {
    const c = this.ctx;
    const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 5200;
    const rh = c.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 280;
    this._loop(this.pink, rh, 1); rh.connect(rl);
    this.rain = c.createGain(); this.rain.gain.value = 0.6; rl.connect(this.rain); this.rain.connect(this.amb);
    // 雨打树冠的低频
    const rb = c.createBiquadFilter(); rb.type = 'lowpass'; rb.frequency.value = 380;
    this._loop(this.brown, rb, 1);
    this.rainLow = c.createGain(); this.rainLow.gain.value = 0.3; rb.connect(this.rainLow); this.rainLow.connect(this.amb);
    // 发电机嗡嗡声（位置相关）
    const gen = c.createOscillator(); gen.type = 'square'; gen.frequency.value = 60;
    const gl = c.createBiquadFilter(); gl.type = 'lowpass'; gl.frequency.value = 220;
    this.gen = c.createGain(); this.gen.gain.value = 0;
    gen.connect(gl); gl.connect(this.gen); this.gen.connect(this.amb); gen.start();
    // 城市车流
    const cl = c.createBiquadFilter(); cl.type = 'lowpass'; cl.frequency.value = 300;
    this._loop(this.brown, cl, 1);
    this.city = c.createGain(); this.city.gain.value = 0; cl.connect(this.city); this.city.connect(this.amb);
    this.frogT = 0; this.insectT = 0;
  }

  _env(t, a, d, peak = 1) {
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + a + d);
    return g;
  }

  _pan(x, z, listener) {
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (!p || !listener) return { node: p, dist: 1 };
    const dx = x - listener.x, dz = z - listener.z;
    const fx = -Math.sin(listener.yaw), fz = -Math.cos(listener.yaw);
    const rx = Math.cos(listener.yaw), rz = -Math.sin(listener.yaw);
    const d = Math.hypot(dx, dz) || 1;
    p.pan.value = clamp((dx * rx + dz * rz) / d, -1, 1) * 0.85;
    return { node: p, dist: d, front: (dx * fx + dz * fz) / d };
  }

  // 一次性声音
  blip(freq, dur, type = 'sine', vol = 0.2, opts = {}) {
    if (!this.ready) return;
    const c = this.ctx, now = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, now);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, now + dur);
    const g = this._env(0, opts.a || 0.005, dur, vol);
    let out = g;
    if (opts.pan) { const p = this._pan(opts.pan.x, opts.pan.z, this.listener); if (p.node) { g.connect(p.node); out = p.node; } }
    o.connect(g); out.connect(opts.bus || this.sfx);
    o.start(now); o.stop(now + dur + 0.05);
  }

  noise(dur, freq, q, vol, opts = {}) {
    if (!this.ready) return;
    const c = this.ctx, now = c.currentTime;
    const s = c.createBufferSource(); s.buffer = opts.buffer || this.white;
    const f = c.createBiquadFilter(); f.type = opts.type || 'bandpass'; f.frequency.setValueAtTime(freq, now); f.Q.value = q;
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, now + dur);
    const g = this._env(0, opts.a || 0.004, dur, vol);
    s.connect(f); f.connect(g);
    let out = g;
    if (opts.pan) { const p = this._pan(opts.pan.x, opts.pan.z, this.listener); if (p.node) { g.connect(p.node); out = p.node; } }
    out.connect(opts.bus || this.sfx);
    s.start(now, Math.random() * 1.5); s.stop(now + dur + 0.1);
  }

  // ---------- 事件 ----------
  onEvent(e, w) {
    if (!this.ready) return;
    const L = this.listener;
    const near = (x, z, r) => L && Math.hypot(x - L.x, z - L.z) < r;
    switch (e.type) {
      case 'ship:scrape': if (e.ship === 'player') { this.noise(0.25 + Math.min(0.4, e.strength * 0.05), 900, 1.2, clamp(0.15 + e.strength * 0.05, 0, 0.5), { type: 'bandpass' }); this.noise(0.15, 160, 1, 0.25, { buffer: this.brown, type: 'lowpass' }); } break;
      case 'ship:silenceOn': this.blip(90, 0.4, 'sine', 0.2, { to: 40 }); break;
      case 'ship:surge': this.noise(0.9, 120, 0.8, 0.4, { to: 900, buffer: this.pink }); this.blip(60, 0.7, 'sawtooth', 0.12, { to: 180 }); break;
      case 'ship:jump': this.noise(0.6, 300, 0.7, 0.18, { to: 1400, buffer: this.pink }); break;
      case 'ship:overheat': this.blip(880, 0.12, 'square', 0.08); setTimeout(() => this.blip(660, 0.18, 'square', 0.08), 140); break;
      case 'ship:damage': if (e.ship === 'player') { this.noise(0.12, 1800, 2, 0.25); this.blip(140, 0.12, 'square', 0.1, { to: 70 }); } break;
      case 'pulse': {
        // 被压缩的闷响，紧接着是断电的寂静
        this.blip(48, 1.4, 'sine', 0.7, { to: 22 });
        this.noise(0.5, 200, 0.6, 0.5, { buffer: this.brown, type: 'lowpass' });
        this._duck(1.6);
        if (e.devices > 0) setTimeout(() => this.voiceMurmur({ x: e.x + 40, z: e.z - 20 }, 0.18, 1.2, 380), 900);
        break;
      }
      case 'thunder': setTimeout(() => this.noise(2.6, 90, 0.5, 0.45, { buffer: this.brown, type: 'lowpass', a: 0.05 }), Math.min(3000, e.dist / 3)); break;
      case 'radio': this._radio(e); break;
      case 'radioEnd': this.blip(1900, 0.03, 'square', 0.05); break;
      case 'satWarn': this.blip(70, 1.4, 'sine', 0.25, { a: 0.3 }); break;
      case 'satEnd': this.blip(98, 0.9, 'sine', 0.18, { a: 0.2 }); break;
      case 'alarm': for (let i = 0; i < 4; i++) setTimeout(() => this.blip(i % 2 ? 620 : 880, 0.22, 'square', 0.09), i * 260); break;
      case 'bark': if (near(e.x, e.z, 120)) this.voiceMurmur(e, 0.16 * (1 - e.dist / 130), 0.9 + e.text.length * 0.04, e.lang === 'ru' ? 160 : 210); break;
      case 'pa': this.voiceMurmur(e, 0.1, 2.4, 300, true); break;
      case 'birds': if (near(e.x, e.z, 320)) { for (let i = 0; i < 10; i++) setTimeout(() => this.blip(2200 + Math.random() * 1800, 0.06, 'sine', 0.05, { to: 1800, pan: e }), i * 40 + Math.random() * 300); this.noise(1.2, 3000, 0.8, 0.12, { pan: e }); } break;
      case 'fire': this._weapon(e); break;
      case 'hit': if (e.src === 'player') this.noise(0.08, e.material === 'glass' ? 4200 : 1500, 1.5, 0.18); break;
      case 'destroyed': if (e.kind === 'glass') { for (let i = 0; i < 6; i++) setTimeout(() => this.blip(3000 + Math.random() * 3000, 0.08, 'triangle', 0.06), i * 25); } else this._boom(0.6); break;
      case 'explosion': this._boom(e.size || 1, e); break;
      case 'tracer': if (L && Math.hypot(e.from.x - L.x, e.from.z - L.z) < 220) this.noise(0.05, 1800, 2, e.hit ? 0.12 : 0.06, { pan: e.from }); break;
      case 'lightning': this._boom(1.4); this.noise(0.25, 5000, 0.6, 0.35); break;
      case 'stormStart': this.blip(36, 3, 'sawtooth', 0.25, { to: 55, a: 0.4 }); break;
      case 'coreStart': this.blip(220, 5, 'sine', 0.08, { to: 880, a: 0.5 }); break;
      case 'coreTaken': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.6, 'sine', 0.08), i * 110)); break;
      case 'clip': this.blip(1250, 0.05, 'square', 0.07); setTimeout(() => this.blip(1250, 0.05, 'square', 0.07), 90); break;
      case 'uploadCut': this.blip(400, 0.5, 'sawtooth', 0.1, { to: 60 }); break;
      case 'lock': this.blip(1600, 0.04, 'square', 0.05); break;
      case 'missionOver': this.music.gain.setTargetAtTime(0, this.ctx.currentTime, 1.5); break;
      case 'wingFire': if (L && Math.hypot(e.from.x - L.x, e.from.z - L.z) < 200) this.noise(0.3, 2600, 3, 0.06, { to: 600, pan: e.from }); break;
      case 'resonance': if (e.level > 0) this.blip(330 * Math.pow(1.122, e.level), 0.15, 'triangle', 0.08); break;
    }
  }

  _weapon(e) {
    switch (e.weapon) {
      case 'stasis': this.blip(1800, 0.5, 'sine', 0.12, { to: 900 }); this.blip(2400, 0.4, 'triangle', 0.05, { to: 2000 }); break;
      case 'phantom': this.blip(660, 0.8, 'triangle', 0.08, { to: 990 }); break;
      case 'anchor': this.blip(55, 0.9, 'sine', 0.5, { to: 30 }); this.noise(0.3, 120, 1, 0.3, { buffer: this.brown, type: 'lowpass' }); break;
      case 'fog': this.noise(2.2, 900, 0.4, 0.08, { to: 300, a: 0.4 }); break;
      case 'swarm': for (let i = 0; i < 24; i++) setTimeout(() => this.blip(2800 + Math.random() * 1500, 0.09, 'square', 0.035, { to: 1200 }), i * 25); break;
      case 'hammer': this.blip(40, 1.2, 'sine', 0.9, { to: 20 }); this.noise(0.6, 90, 0.6, 0.6, { buffer: this.brown, type: 'lowpass' }); this._duck(0.6); break;
      case 'storm': this._boom(1.5); break;
    }
  }

  _boom(size, at) {
    this.blip(60 * (1.2 - Math.min(1, size * 0.3)), 0.9 + size * 0.5, 'sine', Math.min(0.8, 0.35 * size), { to: 25 });
    this.noise(0.8 + size * 0.6, 240, 0.5, Math.min(0.7, 0.3 * size), { buffer: this.brown, type: 'lowpass', to: 60 });
  }

  _duck(dur) {
    const now = this.ctx.currentTime;
    for (const g of [this.amb.gain]) { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0.15, now + 0.05); g.linearRampToValueAtTime(0.9, now + dur); }
  }

  // 无线电：带通 + 轻微失真 + 开口咔哒；用调制噪声暗示说话的节奏
  _radio(e) {
    const c = this.ctx, now = c.currentTime;
    this.blip(2100, 0.025, 'square', 0.07);
    const enemy = e.speaker === 'enemy';
    const s = c.createBufferSource(); s.buffer = this.pink; s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = enemy ? 1400 : 1100; bp.Q.value = 1.8;
    const ws = c.createWaveShaper();
    const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); }
    ws.curve = curve;
    const g = c.createGain(); g.gain.value = 0;
    const dur = Math.min(4.5, e.dur * 0.85);
    // 音节包络
    let t = now + 0.05;
    const syll = enemy ? 0.11 : 0.14;
    while (t < now + dur) {
      const a = 0.025 + Math.random() * 0.03;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(a, t + syll * 0.3);
      g.gain.linearRampToValueAtTime(0.004, t + syll);
      t += syll * (0.8 + Math.random() * 0.6);
    }
    g.gain.linearRampToValueAtTime(0, now + dur + 0.05);
    s.connect(bp); bp.connect(ws); ws.connect(g); g.connect(this.sfx);
    s.start(now, Math.random()); s.stop(now + dur + 0.1);
    // 底噪
    this.noise(dur, 3000, 0.4, enemy ? 0.025 : 0.012, { a: 0.02 });
  }

  voiceMurmur(p, vol, dur, f0, pa = false) {
    if (!this.ready) return;
    const c = this.ctx, now = c.currentTime;
    const pan = this._pan(p.x, p.z, this.listener);
    const s = c.createBufferSource(); s.buffer = this.pink; s.loop = true;
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = f0 * 3; f1.Q.value = 4;
    const g = c.createGain(); g.gain.value = 0;
    let t = now;
    while (t < now + dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * (0.5 + Math.random() * 0.5), t + 0.04);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.12 + Math.random() * 0.08);
      f1.frequency.setValueAtTime(f0 * (2.4 + Math.random() * 1.6), t);
      t += 0.14 + Math.random() * 0.08;
    }
    const dist = pa ? 1 : clamp(1 - pan.dist / 140, 0, 1);
    const out = c.createGain(); out.gain.value = dist * (pa ? 0.7 : 1);
    s.connect(f1); f1.connect(g); g.connect(out);
    if (pan.node) { out.connect(pan.node); pan.node.connect(this.amb); } else out.connect(this.amb);
    s.start(now, Math.random()); s.stop(now + dur + 0.2);
  }

  // ---------- 每帧 ----------
  update(dt, w, view) {
    if (!this.ready) return;
    const c = this.ctx, now = c.currentTime;
    const P = w.player;
    this.listener = { x: P.pos.x, z: P.pos.z, yaw: view.yaw };
    const fieldOn = !P.silent && !P.destroyed;
    const pw = fieldOn ? P.power : 0;
    const sp = clamp(P.speed / 62, 0, 1);
    // 嗡鸣：音高随场功率与速度
    const target = fieldOn ? 0.16 + pw * 0.18 + sp * 0.12 : 0;
    const fade = P.silent ? 0.09 : 0.12;
    this.eng.gain.setTargetAtTime(target * (w.mission.over ? 0.3 : 1), now, fade);
    const base = 40 + pw * 26 + sp * 30 + (P.boosting ? 14 : 0);
    this.oscA.frequency.setTargetAtTime(base, now, 0.15);
    this.oscB.frequency.setTargetAtTime(base * 1.013, now, 0.15);
    this.oscC.frequency.setTargetAtTime(base * 0.5, now, 0.15);
    this.engLP.frequency.setTargetAtTime(260 + pw * 500 + sp * 900 + (P.boosting ? 600 : 0), now, 0.2);
    const close = clamp(1 - (P.hAbove - 0.5) / 1.5, 0, 1);
    this.rustleOut.gain.setTargetAtTime(fieldOn ? close * sp * 0.35 : 0, now, 0.1);
    this.wind.gain.setTargetAtTime(0.03 + sp * 0.12 + (P.silent ? 0.05 : 0), now, 0.3);
    // 场静默：像心跳的低频
    if (P.silent) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 1.05;
        this.blip(52, 0.16, 'sine', 0.32, { to: 38 });
        setTimeout(() => this.blip(46, 0.14, 'sine', 0.22, { to: 34 }), 230);
        if (Math.random() < 0.4) this.noise(0.05, 2400 + Math.random() * 1500, 6, 0.03);
      }
    }
    // 雨与夜
    const rain = w.env.rain, night = 1 - w.env.light;
    const canopy = w.terrain.canopy(P.pos.x, P.pos.z);
    this.rain.gain.setTargetAtTime(rain * (0.5 - canopy * 0.15), now, 0.5);
    this.rainLow.gain.setTargetAtTime(rain * (0.18 + canopy * 0.25), now, 0.5);
    // 雨停后的蛙鸣与虫鸣
    if (rain < 0.4) {
      this.frogT -= dt; this.insectT -= dt;
      if (this.frogT <= 0) { this.frogT = 0.25 + Math.random() * 0.9; const f = 220 + Math.random() * 260; for (let i = 0; i < 3; i++) setTimeout(() => this.blip(f, 0.05, 'triangle', 0.035 * (1 - rain), { to: f * 0.8 }), i * 70); }
      if (this.insectT <= 0) { this.insectT = 0.08 + Math.random() * 0.2; this.blip(4200 + Math.random() * 1600, 0.035, 'sine', 0.012 * (1 - rain) * (0.5 + night)); }
    }
    // 发电机、城市
    const gd = Math.hypot(P.pos.x + 30, P.pos.z + 458);
    this.gen.gain.setTargetAtTime(w.power.on ? clamp(1 - gd / 220, 0, 1) * 0.08 : 0, now, 0.3);
    const cd = Math.max(0, P.pos.z + 540);
    this.city.gain.setTargetAtTime(clamp(1 - cd / 900, 0.02, 1) * 0.12, now, 0.5);
    // 侦测提示：每个注意到你的敌人一个逐渐升高的细音，来自敌人方向
    this._detectionTones(w);
    // 音乐：突围与开战
    this._music(dt, w);
    // 电磁干扰：靠近敌人时对讲机杂音
    let nearest = Infinity;
    for (const g of w.guards) if (g.alive && !g.down) nearest = Math.min(nearest, Math.hypot(g.pos.x - P.pos.x, g.pos.z - P.pos.z));
    if (fieldOn && nearest < 25 && Math.random() < dt * 8) this.noise(0.05 + Math.random() * 0.1, 2500 + Math.random() * 2000, 3, 0.04 * (1 - nearest / 25));
  }

  _detectionTones(w) {
    const c = this.ctx, now = c.currentTime;
    const active = new Set();
    for (const o of w.observers) {
      if (o.focus !== 'player' || o.sus < 3 || o.down || !o.alive || o.kind === 'civ') continue;
      if (w.camp.state === 'alarm') continue;
      active.add(o.id);
      let t = this.tones.get(o.id);
      if (!t) {
        const osc = c.createOscillator(); osc.type = 'sine';
        const g = c.createGain(); g.gain.value = 0;
        const p = c.createStereoPanner ? c.createStereoPanner() : null;
        osc.connect(g); if (p) { g.connect(p); p.connect(this.sfx); } else g.connect(this.sfx);
        osc.start();
        t = { osc, g, p };
        this.tones.set(o.id, t);
      }
      const rising = w.time - o.lastStim < 0.3;
      t.osc.frequency.setTargetAtTime(700 + o.sus * 18, now, 0.05);
      t.g.gain.setTargetAtTime(rising ? 0.012 + o.sus * 0.0006 : 0.0, now, 0.08);
      if (t.p) t.p.pan.value = this._pan(o.pos.x, o.pos.z, this.listener).node ? clamp(((o.pos.x - this.listener.x) * Math.cos(this.listener.yaw) - (o.pos.z - this.listener.z) * Math.sin(this.listener.yaw)) / (Math.hypot(o.pos.x - this.listener.x, o.pos.z - this.listener.z) || 1), -1, 1) * 0.8 : 0;
    }
    for (const [id, t] of this.tones) {
      if (!active.has(id)) { t.g.gain.setTargetAtTime(0, now, 0.05); }
    }
  }

  _music(dt, w) {
    const now = this.ctx.currentTime;
    const alarm = w.camp.state === 'alarm';
    const combat = alarm && w.combat.director.cars;
    const up = w.exposure.sat.active ? w.exposure.sat.progress : 0;
    const storm = !!w.combat.storm;
    this.music.gain.setTargetAtTime(alarm ? (storm ? 0.75 : 0.5) : w.camp.state === 'cooldown' ? 0.18 : 0, now, alarm ? 0.3 : 2);
    if (!alarm && w.camp.state !== 'cooldown') return;
    const bpm = combat ? 132 + up * 30 : 100 + up * 50;
    this.musicT -= dt;
    if (this.musicT > 0) return;
    this.musicT = 60 / bpm / 2;
    this.beat++;
    const b = this.beat % 16;
    const M = this.music;
    // 低频鼓点
    if (b % 4 === 0) this.blip(58, 0.28, 'sine', 0.7, { to: 32, bus: M });
    if (combat) {
      if (b % 8 === 4) this.noise(0.18, 1800, 0.7, 0.35, { bus: M });
      if (b % 2 === 1) this.noise(0.04, 8000, 1, 0.08, { bus: M, type: 'highpass' });
      const notes = [55, 55, 65.4, 55, 73.4, 55, 82.4, 65.4];
      this.blip(notes[b % 8] * (storm ? 2 : 1), 0.16, 'sawtooth', 0.16, { bus: M });
    } else if (b % 8 === 6) this.blip(110, 0.12, 'triangle', 0.15, { bus: M });
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
}
