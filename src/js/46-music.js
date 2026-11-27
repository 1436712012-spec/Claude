/* LIMINAL · generative score. Every layer has its own piece, played live through a worn tape:
   wow & flutter, soft saturation, rolled-off highs. Low sanity makes the tape wobble and notes go missing.
   All melodies are original except the public-domain nursery tune 《小星星》, which forgets its second line. */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const M = (L.Music = {});
  if (typeof window === 'undefined') return;

  let ctx = null, eng = null, bus, out, tapeIn, toneF, delay, wowG, flutG;
  let piece = null, pbus = null, layer = -1, pending = null;
  let step = 0, nextT = 0, timer = null;
  const st = { sanity: 10, depth: 0, tension: 0 };
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const rnd = Math.random;
  const vol = () => {
    const s = L.Store ? L.Store.settings : {};
    return 0.6 * (s.music == null ? 0.7 : s.music);
  };

  // ---------------------------------------------------------------- the tape
  M.boot = function () {
    if (ctx) return;
    eng = L.Audio._eng();
    ctx = eng.ctx;
    tapeIn = ctx.createGain();
    const sat = ctx.createWaveShaper();
    const c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); }
    sat.curve = c;
    toneF = ctx.createBiquadFilter();
    toneF.type = 'lowpass';
    toneF.frequency.value = 5200;
    toneF.Q.value = 0.4;
    delay = ctx.createDelay(0.05);
    delay.delayTime.value = 0.012;
    const wow = ctx.createOscillator();
    wow.frequency.value = 0.55;
    wowG = ctx.createGain();
    wowG.gain.value = 0.0018;
    wow.connect(wowG);
    wowG.connect(delay.delayTime);
    const flut = ctx.createOscillator();
    flut.frequency.value = 6.4;
    flutG = ctx.createGain();
    flutG.gain.value = 0.00022;
    flut.connect(flutG);
    flutG.connect(delay.delayTime);
    wow.start();
    flut.start();
    out = ctx.createGain();
    out.gain.value = 1;
    bus = ctx.createGain();
    bus.gain.value = vol();
    tapeIn.connect(sat);
    sat.connect(toneF);
    toneF.connect(delay);
    delay.connect(out);
    out.connect(bus);
    bus.connect(eng.master);
    const vs = ctx.createGain();
    vs.gain.value = 0.5;
    out.connect(vs);
    vs.connect(eng.verbSend);
    timer = setInterval(schedule, 40);
    if (pending != null) { const l = pending; pending = null; M.setLayer(l); }
  };
  M.volume = function () {
    if (bus) bus.gain.setTargetAtTime(vol(), ctx.currentTime, 0.1);
  };
  // the tape catches: a dip in level and pitch, then it recovers
  M.glitch = function (hard) {
    if (!ctx) return;
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(1, t);
    out.gain.linearRampToValueAtTime(hard ? 0.05 : 0.3, t + 0.06);
    out.gain.linearRampToValueAtTime(1, t + (hard ? 0.9 : 0.4));
    delay.delayTime.cancelScheduledValues(t);
    delay.delayTime.setValueAtTime(0.012, t);
    delay.delayTime.linearRampToValueAtTime(hard ? 0.045 : 0.026, t + 0.25);
    delay.delayTime.linearRampToValueAtTime(0.012, t + 0.7);
  };
  M.state = function (sanity, depth) {
    st.sanity = sanity;
    st.depth = depth;
    st.tension = depth >= L.C.DEPTH_MAX ? 1 : depth >= L.C.DEPTH_T[1] ? 0.4 : 0;
    if (!ctx) return;
    const shaky = sanity <= 3 ? (4 - sanity) * 0.0012 : 0;
    wowG.gain.setTargetAtTime(0.0018 + shaky + st.tension * 0.0016, ctx.currentTime, 0.5);
    toneF.frequency.setTargetAtTime(sanity <= 3 ? 3000 : 5200, ctx.currentTime, 0.8);
  };
  // when sanity runs low, the tape forgets notes
  const forgets = () => (st.sanity <= 3 ? 0.1 + (3 - st.sanity) * 0.07 : 0) + st.tension * 0.05;

  // ---------------------------------------------------------------- instruments
  function g0(t, dest, peak, a, end) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + end);
    g.connect(dest);
    return g;
  }
  function osc(type, f, t, end, dest, detune) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    if (detune) o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(t + end + 0.05);
    return o;
  }
  const I = {
    // music box: bright tine with inharmonic overtones and a long, slightly flat tail
    box(t, n, v, d) {
      const f = midi(n) * (1 + (rnd() - 0.5) * 0.008);
      for (const [k, a, dec] of [[1, 1, 2.6], [3, 0.22, 0.9], [5.4, 0.08, 0.35]]) osc('sine', f * k, t, dec, g0(t, d, v * a * 0.22, 0.003, dec));
    },
    // toy piano: hollow triangle with a quick bell
    toy(t, n, v, d) {
      const f = midi(n);
      osc('triangle', f, t, 1.1, g0(t, d, v * 0.16, 0.004, 1.1));
      osc('sine', f * 2.01, t, 0.5, g0(t, d, v * 0.08, 0.002, 0.5));
    },
    // electric piano (two-operator FM): the sound of a mall at night
    ep(t, n, v, d, len) {
      const f = midi(n);
      const car = ctx.createOscillator();
      car.frequency.value = f;
      const mod = ctx.createOscillator();
      mod.frequency.value = f;
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 2.2, t);
      mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.9);
      mod.connect(mg);
      mg.connect(car.frequency);
      const end = (len || 1) + 1.3;
      car.connect(g0(t, d, v * 0.11, 0.005, end));
      car.start(t); mod.start(t);
      car.stop(t + end + 0.05); mod.stop(t + end + 0.05);
      osc('sine', f * 4, t, 0.15, g0(t, d, v * 0.02, 0.002, 0.15));
    },
    pad(t, notes, len, v, d) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1300;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v * 0.05, t + Math.min(1.2, len * 0.4));
      g.gain.setValueAtTime(v * 0.05, t + len * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 1.4);
      lp.connect(g);
      g.connect(d);
      for (const n of notes) { osc('triangle', midi(n), t, len + 1.4, lp, -7); osc('triangle', midi(n), t, len + 1.4, lp, 7); }
    },
    bass(t, n, len, v, d) {
      const f = midi(n);
      osc('sine', f, t, len, g0(t, d, v * 0.3, 0.012, len));
      osc('triangle', f * 2, t, len * 0.5, g0(t, d, v * 0.05, 0.01, len * 0.5));
    },
    // a reedy lead with late vibrato: an imagined saxophone in an empty food court
    lead(t, n, len, v, d) {
      const f = midi(n);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.2;
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(0, t);
      vg.gain.linearRampToValueAtTime(f * 0.008, t + Math.min(len, 0.5));
      vib.connect(vg);
      vg.connect(o.frequency);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1150;
      bp.Q.value = 0.8;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v * 0.1, t + 0.06);
      g.gain.setValueAtTime(v * 0.1, t + Math.max(0.07, len - 0.12));
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.18);
      o.connect(bp); bp.connect(lp); lp.connect(g); g.connect(d);
      o.start(t); vib.start(t);
      o.stop(t + len + 0.25); vib.stop(t + len + 0.25);
    },
    // glass bell for the pool: sine with an inharmonic partial, long ring
    glass(t, n, v, d) {
      const f = midi(n);
      osc('sine', f, t, 3.4, g0(t, d, v * 0.12, 0.004, 3.4));
      osc('sine', f * 2.76, t, 1.2, g0(t, d, v * 0.035, 0.003, 1.2));
    },
    kick(t, v, d) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
      o.connect(g0(t, d, v * 0.45, 0.004, 0.3));
      o.start(t); o.stop(t + 0.35);
    },
    noiseHit(t, v, d, f, q, dur) {
      const src = ctx.createBufferSource();
      src.buffer = eng.noise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      src.connect(bp);
      bp.connect(g0(t, d, v, 0.002, dur));
      src.start(t, rnd());
      src.stop(t + dur + 0.05);
    },
  };
  // play unless the dream forgets
  const P = (fn, ...a) => { if (rnd() >= forgets()) fn(...a); };

  // ---------------------------------------------------------------- pieces
  // prog: [bass root, chord tones] per bar; melodies as [bar, step16, note, len16]
  const LULLABY_A = [[0, 0, 76, 4], [0, 4, 79, 4], [0, 8, 81, 8], [1, 0, 79, 4], [1, 4, 76, 4], [1, 8, 74, 8], [2, 0, 76, 4], [2, 4, 79, 2], [2, 6, 81, 2], [2, 8, 84, 4], [2, 12, 81, 4], [3, 0, 79, 16]];
  const LULLABY_B = [[0, 0, 81, 4], [0, 4, 79, 4], [0, 8, 76, 8], [1, 0, 74, 4], [1, 4, 76, 4], [1, 8, 72, 8], [2, 0, 74, 4], [2, 4, 76, 2], [2, 6, 79, 2], [2, 8, 76, 4], [2, 12, 74, 4], [3, 0, 72, 16]];
  // 《小星星》(public domain). First line whole, second line breaks off: the tape in LMN-0xx stops here too.
  const TWINKLE = [[0, 0, 72, 4], [0, 4, 72, 4], [0, 8, 79, 4], [0, 12, 79, 4], [1, 0, 81, 4], [1, 4, 81, 4], [1, 8, 79, 8], [2, 0, 77, 4], [2, 4, 77, 4], [2, 8, 76, 4]];
  const SAX = [
    [[0, 0, 70, 4], [0, 4, 72, 2], [0, 6, 74, 2], [0, 8, 75, 8], [1, 0, 74, 4], [1, 4, 72, 4], [1, 8, 70, 8]],
    [[0, 0, 67, 2], [0, 2, 70, 2], [0, 4, 72, 4], [0, 8, 70, 4], [0, 12, 67, 4], [1, 0, 65, 6], [1, 6, 63, 2], [1, 8, 62, 8]],
    [[0, 2, 75, 2], [0, 4, 74, 2], [0, 6, 72, 2], [0, 8, 70, 6], [1, 0, 67, 4], [1, 4, 70, 4], [1, 8, 72, 8]],
  ];
  function melody(list, barInPhrase, s, t, spb, fn, v, d) {
    for (const [b, k, n, len] of list) if (b === barInPhrase && k === s) P(fn, t, n, v, d, len * spb);
  }

  const PIECES = {
    // 梦的入口: lullaby on music box over a warm worn pad
    3: {
      bpm: 74,
      prog: [[48, [60, 64, 67, 71]], [45, [57, 60, 64, 67]], [41, [57, 60, 64, 65]], [43, [55, 59, 62, 65]]],
      step(bar, s, t, spb, d) {
        const [root, ch] = this.prog[bar % 4];
        if (s === 0) { I.pad(t, ch, spb * 16, 0.9, d); P(I.bass, t, root, spb * 6, 0.7, d); }
        if (s === 8 && rnd() < 0.5) P(I.bass, t, root + 7, spb * 4, 0.45, d);
        const cyc = bar % 16;
        // arpeggio on the music box, sparse and gentle
        if (s % 2 === 0 && rnd() < (cyc >= 8 && cyc < 12 ? 0.75 : 0.45)) P(I.box, t, ch[[0, 2, 1, 3, 2, 1, 3, 0][(s / 2) | 0]] + 12, 0.55, d);
        if (cyc < 4) melody(LULLABY_A, cyc, s, t, spb, (tt, n, v, dd) => I.box(tt, n, v, dd), 1, d);
        else if (cyc < 8) melody(LULLABY_B, cyc - 4, s, t, spb, (tt, n, v, dd) => I.box(tt, n, v, dd), 1, d);
        else if (cyc >= 12 && cyc < 15) melody(TWINKLE, cyc - 12, s, t, spb, (tt, n, v, dd) => I.toy(tt, n, v, dd), 1, d);
      },
    },
    // 黄墙走廊: almost nothing. A far piano, long gaps, and muzak leaking through a wall
    0: {
      bpm: 56,
      prog: [[45, [57, 60, 64, 71]], [41, [53, 57, 60, 64]], [48, [55, 60, 64, 67]], [40, [55, 59, 62, 64]]],
      setup(d) {
        this.wall = ctx.createBiquadFilter();
        this.wall.type = 'lowpass';
        this.wall.frequency.value = 420;
        const g = ctx.createGain();
        g.gain.value = 0.9;
        this.wall.connect(g);
        g.connect(d);
      },
      step(bar, s, t, spb, d) {
        const [root, ch] = this.prog[bar % 4];
        if (s === 0) I.pad(t, ch, spb * 16, 0.65, d);
        if (s === 0 && bar % 2 === 0 && rnd() < 0.7) P(I.toy, t, ch[(rnd() * ch.length) | 0] + 12, 0.9, d);
        if (s === 10 && rnd() < 0.22) P(I.toy, t, ch[(rnd() * ch.length) | 0] + 24, 0.3, d);
        // someone else's elevator music, behind the wallpaper
        const cyc = bar % 24;
        if (cyc >= 16) {
          if (s === 0 || s === 6 || s === 10) for (const n of ch) I.ep(t, n, 0.7, this.wall, spb * 3);
          if (s === 0 || s === 8) I.bass(t, root, spb * 6, 0.7, this.wall);
        }
      },
    },
    // 无人泳池: underwater electric piano, glass bells, everything heard through water
    1: {
      bpm: 62,
      prog: [[41, [57, 60, 64, 67]], [40, [55, 59, 62, 67]], [38, [57, 60, 62, 65]], [36, [55, 59, 64, 67]]],
      setup(d) {
        this.water = ctx.createBiquadFilter();
        this.water.type = 'lowpass';
        this.water.frequency.value = 1100;
        this.water.Q.value = 2;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.07;
        const lg = ctx.createGain();
        lg.gain.value = 450;
        lfo.connect(lg);
        lg.connect(this.water.frequency);
        lfo.start();
        this.nodes = [lfo];
        this.water.connect(d);
        this.note = 81;
      },
      step(bar, s, t, spb) {
        const d = this.water;
        const [root, ch] = this.prog[bar % 4];
        if (s === 0) { I.pad(t, ch, spb * 16, 0.6, d); for (const n of ch) P(I.ep, t, n, 0.8, d, spb * 8); P(I.bass, t, root, spb * 10, 0.8, d); }
        if (s === 10) for (const n of ch.slice(1)) P(I.ep, t, n + 12, 0.35, d, spb * 4);
        if (s === 12) P(I.bass, t, root + 7, spb * 4, 0.5, d);
        if (s % 4 === 0 && rnd() < 0.4) {
          const scale = [72, 74, 77, 79, 81, 84, 86, 89];
          let i = scale.indexOf(this.note);
          i = Math.max(0, Math.min(scale.length - 1, i + ((rnd() * 3) | 0) - 1));
          this.note = scale[i];
          P(I.glass, t, this.note, 0.8, d);
        }
      },
    },
    // 深夜商场: slowed muzak — soft drums, walking bass, a sax that forgets the end of its phrases
    2: {
      bpm: 82,
      prog: [[39, [55, 58, 62, 65]], [36, [55, 58, 60, 63]], [44, [55, 60, 63, 67]], [46, [53, 56, 60, 62]]],
      step(bar, s, t, spb, d) {
        const [root, ch] = this.prog[bar % 4];
        if (s === 0 || s === 10) P(I.kick, t, 0.8, d);
        if (s === 4 || s === 12) P(I.noiseHit, t, 0.12, d, 1900, 4, 0.08);
        if (s % 2 === 0) P(I.noiseHit, t, s % 4 ? 0.025 : 0.04, d, 8000, 1.5, 0.04);
        if (s === 0) P(I.bass, t, root, spb * 5, 0.9, d);
        if (s === 6) P(I.bass, t, root + 12, spb * 2, 0.5, d);
        if (s === 8) P(I.bass, t, root + 7, spb * 5, 0.8, d);
        if (s === 14) P(I.bass, t, root + 5, spb * 2, 0.6, d);
        if (s === 2 || s === 7 || s === 11) for (const n of ch) P(I.ep, t, n, 0.45, d, spb * 3);
        const cyc = bar % 8;
        if (cyc === 0 && s === 0) this.ph = SAX[(rnd() * SAX.length) | 0];
        if (this.ph && (cyc === 1 || cyc === 2)) melody(this.ph, cyc - 1, s, t, spb, (tt, n, v, dd, len) => I.lead(tt, n, len, v, dd), 0.9, d);
        if (this.ph && (cyc === 5 || cyc === 6)) melody(this.ph, cyc - 5, s, t, spb, (tt, n, v, dd, len) => I.lead(tt, n + 12, len, v * 0.7, dd), 0.9, d);
        // closing time: the tape catches
        if (st.tension >= 1 && s === 0 && bar % 4 === 3) M.glitch(false);
      },
    },
  };

  // ---------------------------------------------------------------- scheduling
  function schedule() {
    if (!piece || !ctx) return;
    const spb = 60 / piece.bpm / 4;
    let guard = 0;
    while (nextT < ctx.currentTime + 0.3 && guard++ < 32) {
      // a slight lazy swing on the off-steps, like a tired player
      const sw = step % 2 ? spb * 0.12 : 0;
      try { piece.step(Math.floor(step / 16), step % 16, nextT + sw, spb, pbus); } catch (e) { /* never break the night */ }
      step++;
      nextT += spb;
    }
  }

  M.setLayer = function (l) {
    if (!ctx) { pending = l; return; }
    if (l === layer) return;
    layer = l;
    const t = ctx.currentTime;
    if (pbus) {
      const old = pbus, oldPiece = piece;
      old.gain.cancelScheduledValues(t);
      old.gain.setTargetAtTime(0.0001, t, 0.5);
      setTimeout(() => { try { old.disconnect(); } catch (e) {} if (oldPiece && oldPiece.nodes) oldPiece.nodes.forEach((n) => { try { n.stop(); } catch (e) {} }); }, 4000);
    }
    const proto = PIECES[l];
    if (!proto) { piece = null; pbus = null; return; }
    piece = Object.create(proto);
    pbus = ctx.createGain();
    pbus.gain.setValueAtTime(0.0001, t);
    pbus.gain.setTargetAtTime(1, t + 0.3, 0.8);
    pbus.connect(tapeIn);
    if (piece.setup) piece.setup(pbus);
    step = 0;
    nextT = t + 0.35;
  };
  M.current = () => layer;
  M._probe = () => bus;
})();
