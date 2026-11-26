/**
 * Fully procedural audio (no sample files): layered cannon/explosion synthesis, generated convolution
 * reverb, stereo panning from world position, and an intensity-driven synthwave score.
 */
const rr = (a, b) => a + Math.random() * (b - a);
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor(settings) {
    this.set = settings;
    this.ctx = null;
    this.last = {};
    this.intensity = 0;
    this.mstep = 0;
    this.nextT = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain();
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -16; this.comp.knee.value = 18; this.comp.ratio.value = 7; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
      this.master.connect(this.comp); this.comp.connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.connect(this.master);
      this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
      // noise buffer
      const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = nb;
      // generated impulse response: dark exponentially decaying stereo noise
      const len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c); let lp = 0;
        for (let i = 0; i < len; i++) {
          const t = i / len;
          lp += ((Math.random() * 2 - 1) - lp) * (0.25 + 0.5 * (1 - t));
          ch[i] = lp * Math.pow(1 - t, 3.2);
        }
      }
      this.verb = ctx.createConvolver(); this.verb.buffer = ir;
      this.verbIn = ctx.createGain(); this.verbIn.gain.value = 1;
      this.verbOut = ctx.createGain(); this.verbOut.gain.value = 0.55;
      this.verbIn.connect(this.verb); this.verb.connect(this.verbOut); this.verbOut.connect(this.master);
      // music delay
      this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.27;
      this.fb = ctx.createGain(); this.fb.gain.value = 0.38;
      this.delay.connect(this.fb); this.fb.connect(this.delay); this.delay.connect(this.musicBus);
      // continuous layers
      this.engineOsc = ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 34;
      this.engineOsc2 = ctx.createOscillator(); this.engineOsc2.type = 'square'; this.engineOsc2.frequency.value = 51;
      this.engineF = ctx.createBiquadFilter(); this.engineF.type = 'lowpass'; this.engineF.frequency.value = 160;
      this.engineG = ctx.createGain(); this.engineG.gain.value = 0;
      this.engineOsc.connect(this.engineF); this.engineOsc2.connect(this.engineF); this.engineF.connect(this.engineG); this.engineG.connect(this.sfx);
      this.engineOsc.start(); this.engineOsc2.start();
      this.chargeOsc = ctx.createOscillator(); this.chargeOsc.type = 'sawtooth'; this.chargeOsc.frequency.value = 110;
      this.chargeF = ctx.createBiquadFilter(); this.chargeF.type = 'lowpass'; this.chargeF.frequency.value = 600;
      this.chargeG = ctx.createGain(); this.chargeG.gain.value = 0;
      this.chargeOsc.connect(this.chargeF); this.chargeF.connect(this.chargeG); this.chargeG.connect(this.sfx);
      this.chargeOsc.start();
      this.windSrc = ctx.createBufferSource(); this.windSrc.buffer = nb; this.windSrc.loop = true;
      this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 500; this.windF.Q.value = 0.6;
      this.windG = ctx.createGain(); this.windG.gain.value = 0;
      this.windSrc.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.sfx); this.windSrc.start();
      this.applyVolume();
      this.nextT = ctx.currentTime + 0.1;
      this.timer = setInterval(() => this._music(), 30);
    } catch (e) { console.warn('audio init failed', e); this.ctx = null; }
  }
  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = this.set.volume;
    this.musicBus.gain.value = this.set.music * 0.5;
  }

  // ---- building blocks -------------------------------------------------------------------------
  _dest(pan, rev) {
    const ctx = this.ctx;
    let out = this.sfx;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(this.sfx); out = p; }
    if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; out.connect(s); s.connect(this.verbIn); }
    return out;
  }
  _env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  noise(t, dur, o) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);
    const g = ctx.createGain(); this._env(g, t, o.a || 0.003, dur, o.gain);
    s.connect(f); f.connect(g); g.connect(this._dest(o.pan || 0, o.rev || 0));
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(t, dur, o) {
    const ctx = this.ctx;
    const os = ctx.createOscillator(); os.type = o.type || 'sine';
    os.frequency.setValueAtTime(o.f0, t);
    if (o.f1) os.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t + dur);
    const g = ctx.createGain(); this._env(g, t, o.a || 0.004, dur, o.gain);
    os.connect(g); g.connect(this._dest(o.pan || 0, o.rev || 0));
    os.start(t); os.stop(t + dur + 0.05);
  }
  _gate(name, ms) {
    const now = performance.now();
    if (now - (this.last[name] || 0) < ms) return false;
    this.last[name] = now; return true;
  }

  // ---- one-shots -------------------------------------------------------------------------------
  play(name, pan, a) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'cannon': {
        const k = a.tier || 0, g = 0.5 + k * 0.12;
        this.tone(t, 0.34 + k * 0.1, { f0: 140, f1: 36, gain: g, pan, rev: 0.25 });
        this.noise(t, 0.32 + k * 0.05, { type: 'lowpass', f0: 3200, f1: 160, gain: g * 0.95, pan, rev: 0.35 });
        this.noise(t, 0.07, { type: 'highpass', f0: 1500, gain: g * 0.55, pan });
        this.tone(t, 0.18, { f0: 520, f1: 90, type: 'square', gain: 0.1, pan });
        break;
      }
      case 'explosion': {
        const s = Math.min(2.5, a.size || 1), d = 0.55 + s * 0.45;
        this.tone(t, d, { f0: 80, f1: 22, gain: 0.7, pan, rev: 0.3 });
        this.noise(t, d, { type: 'lowpass', f0: 2400, f1: 80, gain: 0.8, pan, rev: 0.5 });
        this.noise(t, 0.12, { type: 'bandpass', f0: 1800, q: 0.8, gain: 0.35, pan });
        for (let i = 0; i < 5; i++) this.noise(t + 0.04 + Math.random() * d * 0.7, 0.06, { type: 'highpass', f0: rr(1500, 4000), gain: 0.14, pan });
        break;
      }
      case 'flak': {
        const k = a.tier || 1;
        this.noise(t, 0.16, { type: 'bandpass', f0: 1700, q: 0.7, gain: 0.5, pan, rev: 0.3 });
        this.tone(t, 0.25, { f0: 110, f1: 40, gain: 0.5 + k * 0.08, pan, rev: 0.3 });
        for (let i = 0; i < 7; i++) this.noise(t + 0.03 + Math.random() * 0.35, 0.05, { type: 'highpass', f0: rr(2500, 6000), gain: 0.12, pan });
        break;
      }
      case 'mg': if (this._gate('mg', 55)) { this.noise(t, 0.035, { type: 'bandpass', f0: rr(1800, 2600), q: 1.1, gain: 0.16, pan }); this.tone(t, 0.025, { f0: 170, f1: 90, type: 'square', gain: 0.06, pan }); } break;
      case 'hit': if (this._gate('hit', 35)) { this.tone(t, 0.06, { f0: 1300 + Math.random() * 300, f1: 600, type: 'triangle', gain: 0.1 * (a.gain || 1), pan }); this.noise(t, 0.04, { type: 'highpass', f0: 3000, gain: 0.08, pan }); } break;
      case 'tankhit':
        this.noise(t, 0.18, { type: 'lowpass', f0: 1100, f1: 200, gain: 0.5 * (a.gain || 1), pan, rev: 0.2 });
        this.tone(t, 0.2, { f0: 120, f1: 50, gain: 0.5, pan });
        this.tone(t, 0.08, { f0: 2200, f1: 900, type: 'triangle', gain: 0.12, pan });
        break;
      case 'missile':
        this.noise(t, 0.7, { type: 'bandpass', f0: 500, f1: 2800, q: 1.2, gain: 0.3, pan, rev: 0.2 });
        this.tone(t, 0.6, { f0: 110, f1: 420, type: 'sawtooth', gain: 0.14, pan });
        break;
      case 'whistle': if (this._gate('whistle', 80)) this.tone(t, 0.95, { f0: 2400, f1: 850, gain: 0.05, pan }); break;
      case 'dive': this.tone(t, 1.1, { f0: 500, f1: 2600, type: 'sawtooth', gain: 0.045, pan }); this.noise(t, 1.1, { type: 'bandpass', f0: 800, f1: 3000, q: 2, gain: 0.08, pan }); break;
      case 'incoming': if (this._gate('incoming', 400)) { this.tone(t, 0.1, { f0: 330, type: 'square', gain: 0.035, pan }); this.tone(t + 0.16, 0.1, { f0: 330, type: 'square', gain: 0.035, pan }); } break;
      case 'ebullet': if (this._gate('eb', 60)) this.noise(t, 0.03, { type: 'bandpass', f0: 3200, q: 1.5, gain: 0.08, pan }); break;
      case 'jump': this.noise(t, 0.28, { type: 'lowpass', f0: 800, f1: 200, gain: 0.3, pan }); this.tone(t, 0.3, { f0: 70, f1: 180, type: 'sawtooth', gain: 0.12, pan }); break;
      case 'land': if (this._gate('land', 120)) { this.noise(t, 0.2, { type: 'lowpass', f0: 600, f1: 120, gain: 0.35, pan }); this.tone(t, 0.18, { f0: 70, f1: 36, gain: 0.35, pan }); } break;
      case 'chargeTier': {
        const k = a.tier || 1, f = 440 * (1 + k * 0.3);
        this.tone(t, 0.16, { f0: f, f1: f * 1.5, type: 'triangle', gain: 0.14, pan });
        this.tone(t + 0.05, 0.2, { f0: f * 2, f1: f * 2.5, type: 'sine', gain: 0.07, pan });
        break;
      }
      case 'combo': if (this._gate('combo', 70)) this.tone(t, 0.14, { f0: NOTE(72 + (a.n || 1) * 1.0), type: 'sine', gain: 0.1, pan: 0, rev: 0.2 }); break;
      case 'multikill':
        for (const [i, n] of [0, 4, 7, 12].entries()) this.tone(t + i * 0.05, 0.5, { f0: NOTE(67 + n), type: 'triangle', gain: 0.12, pan: 0, rev: 0.4 });
        this.noise(t, 0.4, { type: 'highpass', f0: 3000, f1: 8000, gain: 0.1 });
        break;
      case 'overdrive':
        this.tone(t, 0.9, { f0: 70, f1: 900, type: 'sawtooth', gain: 0.25, rev: 0.4 });
        this.noise(t, 0.9, { type: 'bandpass', f0: 300, f1: 5000, q: 1, gain: 0.3, rev: 0.4 });
        this.tone(t, 0.6, { f0: 55, f1: 30, gain: 0.6 });
        break;
      case 'odEnd': this.tone(t, 0.6, { f0: 600, f1: 90, type: 'sawtooth', gain: 0.12, rev: 0.3 }); break;
      case 'lightsOut':
        this.tone(t, 1.3, { f0: 220, f1: 55, type: 'triangle', gain: 0.3, pan, rev: 0.6 });
        this.noise(t, 0.8, { type: 'lowpass', f0: 1200, f1: 100, gain: 0.4, pan, rev: 0.5 });
        break;
      case 'overheat': this.tone(t, 0.22, { f0: 900, f1: 380, type: 'square', gain: 0.07, pan }); break;
      case 'zap': {
        const n = a.n || 2;
        this.tone(t, 0.16, { f0: 3200, f1: 700, type: 'triangle', gain: 0.1, pan });
        this.tone(t, 0.2, { f0: 240, f1: 60, type: 'sawtooth', gain: 0.16, pan, rev: 0.15 });
        for (let i = 0; i < 3 + n; i++) this.noise(t + Math.random() * 0.22, 0.04, { type: 'highpass', f0: rr(2500, 7000), gain: 0.16, pan });
        break;
      }
      case 'railCharge':
        this.tone(t, 0.8, { f0: 70, f1: 1400, type: 'sawtooth', gain: 0.1, rev: 0.3 });
        this.noise(t, 0.8, { type: 'bandpass', f0: 300, f1: 5000, q: 2, gain: 0.12 });
        break;
      case 'rail':
        this.tone(t, 0.7, { f0: 170, f1: 26, gain: 0.85, pan, rev: 0.4 });
        this.noise(t, 0.55, { type: 'lowpass', f0: 7000, f1: 160, gain: 0.8, pan, rev: 0.5 });
        this.tone(t, 0.45, { f0: 2600, f1: 180, type: 'sawtooth', gain: 0.12, pan });
        this.noise(t, 0.08, { type: 'highpass', f0: 3000, gain: 0.5, pan });
        break;
      case 'gravityLaunch': this.tone(t, 0.4, { f0: 260, f1: 90, gain: 0.16, pan }); this.noise(t, 0.35, { type: 'lowpass', f0: 1800, f1: 200, gain: 0.2, pan }); break;
      case 'gravityOpen':
        this.tone(t, 1.0, { f0: 64, f1: 28, gain: 0.5, pan, rev: 0.5 });
        this.noise(t, 0.8, { type: 'bandpass', f0: 4500, f1: 160, q: 1.5, gain: 0.3, pan, rev: 0.4 });
        break;
      case 'gravityHum': if (this._gate('gh', 160)) this.tone(t, 0.25, { f0: 48, f1: 40, gain: 0.1, pan }); break;
      case 'laserOn': this.tone(t, 0.35, { f0: 400, f1: 1900, type: 'sawtooth', gain: 0.07, pan, rev: 0.2 }); this.tone(t + 0.05, 0.3, { f0: 800, f1: 3000, type: 'sine', gain: 0.05, pan }); break;
      case 'laserHit': if (this._gate('lh', 90)) this.noise(t, 0.05, { type: 'highpass', f0: rr(3000, 7000), gain: 0.1, pan }); break;
      case 'fwLaunch': this.tone(t, 0.7, { f0: 420, f1: 2000, gain: 0.05, pan }); this.noise(t, 0.12, { type: 'lowpass', f0: 1500, f1: 300, gain: 0.2, pan }); break;
      case 'fwPop':
        this.noise(t, 0.18, { type: 'bandpass', f0: 1600, q: 0.8, gain: 0.45, pan, rev: 0.4 });
        this.tone(t, 0.22, { f0: 110, f1: 45, gain: 0.45, pan, rev: 0.3 });
        for (let i = 0; i < 10; i++) this.noise(t + 0.05 + Math.random() * 0.6, 0.04, { type: 'highpass', f0: rr(3000, 8000), gain: 0.1, pan });
        break;
      case 'drone': if (this._gate('dr', 120)) { this.tone(t, 0.18, { f0: 640, f1: 980, type: 'square', gain: 0.035, pan }); this.noise(t, 0.15, { type: 'bandpass', f0: 2400, q: 2, gain: 0.05, pan }); } break;
      case 'pulse':
        this.tone(t, 0.9, { f0: 100, f1: 22, gain: 0.85, pan, rev: 0.5 });
        this.noise(t, 0.6, { type: 'lowpass', f0: 900, f1: 60, gain: 0.6, pan, rev: 0.5 });
        this.tone(t, 0.3, { f0: 700, f1: 120, type: 'triangle', gain: 0.12, pan });
        break;
      case 'ionMark': for (let i = 0; i < 4; i++) this.tone(t + i * (0.34 - i * 0.05), 0.07, { f0: 1100 + i * 140, type: 'square', gain: 0.045, pan }); break;
      case 'ion':
        this.tone(t, 1.5, { f0: 76, f1: 18, gain: 0.95, pan, rev: 0.6 });
        this.noise(t, 1.2, { type: 'lowpass', f0: 5200, f1: 90, gain: 0.85, pan, rev: 0.7 });
        this.tone(t, 0.9, { f0: 2200, f1: 90, type: 'sawtooth', gain: 0.12, pan });
        break;
      case 'cardOpen': [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.07, 0.25, { f0: f, type: 'triangle', gain: 0.09, pan: 0, rev: 0.3 })); break;
      case 'cardPick': [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.05, 0.5, { f0: f, type: 'triangle', gain: 0.11, pan: 0, rev: 0.4 })); this.noise(t, 0.3, { type: 'highpass', f0: 4000, f1: 9000, gain: 0.08 }); break;
      default: break;
    }
  }

  // ---- continuous layers + music --------------------------------------------------------------
  update(g, dt) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime, tank = g.tank;
    const eng = tank.dead ? 0 : tank.engine;
    this.engineG.gain.setTargetAtTime(g.state === 'paused' ? 0 : 0.045 + eng * 0.07, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(32 + eng * 26, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(48 + eng * 40, t, 0.1);
    this.engineF.frequency.setTargetAtTime(140 + eng * 220, t, 0.1);
    const ch = tank.charging && tank.charge > 0.12 ? Math.min(1, tank.charge / 1.7) : 0;
    this.chargeG.gain.setTargetAtTime(ch * 0.05, t, 0.05);
    this.chargeOsc.frequency.setTargetAtTime(90 + ch * 520, t, 0.05);
    this.chargeF.frequency.setTargetAtTime(300 + ch * 2600, t, 0.05);
    this.windG.gain.setTargetAtTime(0.012 + Math.abs(g.wind.v) * 0.05, t, 0.4);
    this.windF.frequency.setTargetAtTime(380 + Math.abs(g.wind.v) * 700, t, 0.4);
    const enemies = g.enemies.length;
    const target = Math.min(1, enemies * 0.12 + g.combo.n * 0.04 + g.combo.odBlend * 0.5 + (g.state === 'title' ? 0.35 : 0));
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.8);
  }

  _music() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.set.music <= 0.001) { if (ctx) this.nextT = Math.max(this.nextT, ctx.currentTime); return; }
    const spb = 60 / 108 / 4; // 16th
    while (this.nextT < ctx.currentTime + 0.14) {
      this._step(this.mstep, this.nextT);
      this.mstep++; this.nextT += spb;
    }
  }
  _step(s, t) {
    const I = this.intensity;
    const bar = Math.floor(s / 16) % 4, st = s % 16;
    const roots = [45, 41, 48, 43];       // A F C G (low)
    const chords = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
    const minor = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
    const root = roots[bar], ch = minor[bar];
    // bass
    if (st % 2 === 0) {
      const f = NOTE(root + (st === 6 || st === 14 ? 12 : 0));
      const o = ctx0(this.ctx, 'sawtooth', f, t, 0.2);
      const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 260 + I * 900; filt.Q.value = 4;
      const g = this.ctx.createGain(); this._env(g, t, 0.004, 0.2, 0.35);
      o.connect(filt); filt.connect(g); g.connect(this.musicBus);
    }
    // arp
    if (I > 0.08 || st % 4 === 0) {
      const idx = [0, 1, 2, 1, 0, 2, 1, 2][st % 8];
      const n = root + 24 + ch[idx % 3] + (st % 8 === 7 ? 12 : 0);
      const o = ctx0(this.ctx, 'square', NOTE(n), t, 0.18);
      const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 900 + I * 3200;
      const g = this.ctx.createGain(); this._env(g, t, 0.003, 0.17, 0.055 + I * 0.05);
      o.connect(filt); filt.connect(g); g.connect(this.musicBus); g.connect(this.delay);
    }
    // pad on bar start
    if (st === 0) {
      for (const c of ch) {
        for (const det of [-6, 6]) {
          const o = ctx0(this.ctx, 'sawtooth', NOTE(root + 24 + c), t, 2.0); o.detune.value = det;
          const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 700 + I * 900;
          const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.02, t + 0.5); g.gain.linearRampToValueAtTime(0.0001, t + 2.2);
          o.connect(filt); filt.connect(g); g.connect(this.musicBus);
        }
      }
    }
    // drums with intensity
    if (I > 0.2 && st % 4 === 0) {
      const o = ctx0(this.ctx, 'sine', 130, t, 0.2); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
      const g = this.ctx.createGain(); this._env(g, t, 0.002, 0.2, 0.5 * Math.min(1, I + 0.2));
      o.connect(g); g.connect(this.musicBus);
    }
    if (I > 0.4 && st % 4 === 2) {
      const s2 = this.ctx.createBufferSource(); s2.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = this.ctx.createGain(); this._env(g, t, 0.001, 0.05, 0.08);
      s2.connect(f); f.connect(g); g.connect(this.musicBus); s2.start(t, Math.random()); s2.stop(t + 0.08);
    }
    if (I > 0.6 && st % 8 === 4) {
      const s2 = this.ctx.createBufferSource(); s2.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
      const g = this.ctx.createGain(); this._env(g, t, 0.001, 0.12, 0.2);
      s2.connect(f); f.connect(g); g.connect(this.musicBus); s2.start(t, Math.random()); s2.stop(t + 0.15);
    }
  }
}

function ctx0(ctx, type, f, t, dur) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(t + dur + 0.05);
  return o;
}

/** silent stand-in until the first user gesture */
export class NullAudio { play() {} update() {} init() {} applyVolume() {} }
