// All sound is synthesised: a long generated reverb makes everything sound like
// it's happening in an empty, tiled hall at four in the afternoon.

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private verb!: ConvolverNode;
  private verbIn!: GainNode;
  private dry!: GainNode;
  private hum?: { g: GainNode; f: BiquadFilterNode };
  private last: Record<string, number> = {};
  private combo = 0;
  private comboT = 0;
  muted = false;

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.dry = ctx.createGain(); this.dry.gain.value = 0.75; this.dry.connect(this.master);
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(4.2, 2.6);
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.55;
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.9;
    this.verbIn.connect(this.verb).connect(verbOut).connect(this.master);
    this.ambience();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.1);
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Early reflections off tile, then a long smooth tail.
        const early = i < ctx.sampleRate * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.8 : 0;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * 0.5 + early;
      }
    }
    return buf;
  }

  private out(node: AudioNode, wet = 0.5) {
    node.connect(this.dry);
    const g = this.ctx!.createGain(); g.gain.value = wet;
    node.connect(g).connect(this.verbIn);
  }

  // A pool hall's hum: filtered noise + two detuned low sines, slowly breathing.
  private ambience() {
    const ctx = this.ctx!;
    const noise = ctx.createBufferSource();
    const b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = last * 0.985 + (Math.random() * 2 - 1) * 0.015; d[i] = last * 6; }
    noise.buffer = b; noise.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = ctx.createGain(); g.gain.value = 0.0;
    noise.connect(f).connect(g);
    this.out(g, 0.8);
    noise.start();
    for (const fr of [55, 55.4, 110.3]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
      const og = ctx.createGain(); og.gain.value = fr > 100 ? 0.008 : 0.018;
      o.connect(og).connect(g); o.start();
    }
    g.gain.setTargetAtTime(0.5, ctx.currentTime, 2.5);
    // Slow LFO on the filter so the room breathes.
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 160;
    lfo.connect(lg).connect(f.frequency); lfo.start();
    this.hum = { g, f };
  }

  private throttle(name: string, ms: number) {
    const now = performance.now();
    if ((this.last[name] ?? 0) + ms > now) return false;
    this.last[name] = now; return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, wet = 0.5, when = 0, attack = 0.005) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); this.out(g, wet);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // Music-box voice: a sine with a quiet, slightly inharmonic overtone.
  private chime(freq: number, vol: number, when = 0, dur = 1.6) {
    this.tone(freq, dur, 'sine', vol, 0.7, when);
    this.tone(freq * 4.01, dur * 0.35, 'sine', vol * 0.22, 0.7, when);
    this.tone(freq * 2.0, dur * 0.6, 'triangle', vol * 0.12, 0.7, when);
  }

  private noiseBurst(dur: number, vol: number, f0: number, f1: number, q = 1.2, wet = 0.4) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g); this.out(g, wet);
    s.start(t);
  }

  tick(dt: number, intensity: number) {
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    if (this.hum && this.ctx) this.hum.f.Q.value = 0.7 + intensity * 4;
  }

  play(name: string) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'star': {
        if (!this.throttle('star', 45)) return;
        const step = PENTA[Math.min(PENTA.length - 1, this.combo)];
        this.combo = Math.min(PENTA.length - 1, this.combo + 1);
        this.comboT = 0.9;
        this.chime(880 * Math.pow(2, step / 12), 0.05, 0, 0.7);
        break;
      }
      case 'pop': if (this.throttle('pop', 55)) this.noiseBurst(0.09, 0.12, 2400, 600, 2, 0.3); break;
      case 'hit': if (this.throttle('hit', 40)) this.tone(300 + Math.random() * 80, 0.06, 'triangle', 0.035, 0.2); break;
      case 'plane': if (this.throttle('plane', 120)) this.noiseBurst(0.22, 0.05, 900, 3200, 0.8, 0.5); break;
      case 'musicbox': {
        const base = 659.25;
        [0, 4, 7, 12, 7].forEach((s, k) => this.chime(base * Math.pow(2, s / 12), 0.045, k * 0.14));
        break;
      }
      case 'hurt': {
        if (!this.throttle('hurt', 200)) return;
        this.tone(140, 0.35, 'sine', 0.22, 0.6);
        this.tone(147, 0.4, 'sine', 0.12, 0.6);
        break;
      }
      case 'noclip': {
        this.noiseBurst(0.45, 0.16, 300, 5000, 0.7, 0.8);
        this.tone(220, 0.5, 'sine', 0.06, 0.9, 0, 0.12);
        this.tone(330, 0.5, 'sine', 0.04, 0.9, 0.03, 0.12);
        break;
      }
      case 'through': this.chime(1318.5, 0.05, 0, 1.4); this.chime(1975.5, 0.03, 0.06, 1.2); break;
      case 'bounce': this.tone(98, 0.3, 'square', 0.04, 0.4); this.noiseBurst(0.18, 0.1, 500, 200, 3, 0.3); break;
      case 'levelup': {
        const base = 523.25;
        [0, 7, 12, 16, 19, 24].forEach((s, k) => this.chime(base * Math.pow(2, s / 12), 0.06, k * 0.09, 2.2));
        break;
      }
      case 'door': this.noiseBurst(0.7, 0.05, 200, 900, 4, 0.9); this.chime(392, 0.05, 0.1, 2.5); break;
      case 'choose': [0, 4, 7].forEach((s, k) => this.chime(784 * Math.pow(2, s / 12), 0.06, k * 0.05, 1.8)); break;
      case 'chest': [0, 2, 4, 7, 9, 12, 16].forEach((s, k) => this.chime(523.25 * Math.pow(2, s / 12), 0.055, k * 0.07, 2.0)); break;
      case 'milk': this.chime(587.3, 0.06, 0, 1.2); this.chime(880, 0.05, 0.08, 1.2); break;
      case 'swarm': this.tone(196, 2.4, 'sine', 0.05, 0.95, 0, 0.6); this.tone(233.1, 2.4, 'sine', 0.04, 0.95, 0.2, 0.6); break;
      case 'alarm': [0, 0.5, 1.0].forEach((w) => this.chime(1046.5, 0.08, w, 0.4)); break;
      case 'death': [12, 7, 4, 0, -5].forEach((s, k) => this.chime(523.25 * Math.pow(2, s / 12), 0.06, k * 0.28, 2.8)); break;
    }
  }
}
