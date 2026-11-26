/* LIMINAL · all sound is synthesized here with Web Audio. Nothing is sampled. */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const A = (L.Audio = { ready: false });
  let ctx, master, comp, sfxBus, ambBus, verb, verbSend, crush;
  let amb = null; // current ambience handle
  let ambLayer = -1;
  let heart = null;

  function settings() {
    return L.Store ? L.Store.settings : { mute: false, vol: 0.8 };
  }

  A.init = function () {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = settings().mute ? 0 : settings().vol;
    master.connect(comp);
    comp.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    ambBus = ctx.createGain();
    ambBus.gain.value = 0.55;
    ambBus.connect(master);
    verb = ctx.createConvolver();
    verb.buffer = impulse(3.2, 2.6);
    verbSend = ctx.createGain();
    verbSend.gain.value = 0.35;
    verbSend.connect(verb);
    verb.connect(master);
    crush = ctx.createWaveShaper();
    crush.curve = crushCurve(6);
    const crushOut = ctx.createGain();
    crushOut.gain.value = 0.7;
    crush.connect(crushOut);
    crushOut.connect(sfxBus);
    A.ready = true;
    if (A._pendingLayer != null) A.ambience(A._pendingLayer);
  };
  A.setVolume = function () {
    if (!master) return;
    const s = settings();
    master.gain.setTargetAtTime(s.mute ? 0 : s.vol, ctx.currentTime, 0.05);
  };

  // ---------------------------------------------------------------- building blocks
  function impulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  function crushCurve(bits) {
    const n = 2048,
      c = new Float32Array(n),
      steps = Math.pow(2, bits);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.round(x * steps) / steps;
    }
    return c;
  }
  let noiseBuf = null;
  function noiseBuffer() {
    if (noiseBuf) return noiseBuf;
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function out(node, opts) {
    node.connect(opts && opts.crush ? crush : sfxBus);
    if (opts && opts.verb) {
      const g = ctx.createGain();
      g.gain.value = opts.verb;
      node.connect(g);
      g.connect(verbSend);
    }
  }
  // tone: f0 → f1 over dur, ADSR-ish envelope
  function tone(o) {
    const t = ctx.currentTime + (o.at || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + (o.glide || o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const v = o.v == null ? 0.3 : o.v;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.a || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let last = osc;
    osc.connect(g);
    last = g;
    if (o.lp || o.hp || o.bp) {
      const f = ctx.createBiquadFilter();
      f.type = o.lp ? 'lowpass' : o.hp ? 'highpass' : 'bandpass';
      f.frequency.value = o.lp || o.hp || o.bp;
      if (o.q) f.Q.value = o.q;
      g.connect(f);
      last = f;
    }
    out(last, o);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
    return osc;
  }
  function noise(o) {
    const t = ctx.currentTime + (o.at || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    const v = o.v == null ? 0.2 : o.v;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.a || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f);
    f.connect(g);
    out(g, o);
    src.start(t, Math.random());
    src.stop(t + o.dur + 0.05);
  }
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // ---------------------------------------------------------------- sound effects
  const FX = {
    click: () => tone({ f: 1800, f1: 1200, dur: 0.04, v: 0.08, type: 'square', lp: 4000 }),
    hover: () => tone({ f: 2400, dur: 0.025, v: 0.03, type: 'sine' }),
    draw: () => noise({ f: 1800, f1: 6000, dur: 0.12, v: 0.12, q: 0.8 }),
    flip: () => { noise({ f: 3000, f1: 1200, dur: 0.08, v: 0.1 }); tone({ f: 600, f1: 900, dur: 0.06, v: 0.05 }); },
    play: (o) => {
      tone({ f: 140, f1: 48, dur: 0.22, v: 0.5, glide: 0.18 });
      noise({ f: 300, dur: 0.12, v: 0.12, type: 'lowpass' });
      const fac = o && o.faction;
      if (fac === 'site') { tone({ f: 1320, dur: 0.07, v: 0.09, type: 'square', lp: 3500, at: 0.04 }); tone({ f: 1320, dur: 0.07, v: 0.09, type: 'square', lp: 3500, at: 0.15 }); }
      else if (fac === 'level') { for (let i = 0; i < 5; i++) tone({ f: 200 + Math.random() * 800, dur: 0.03, v: 0.08, type: 'square', at: 0.03 + i * 0.03, crush: 1 }); }
      else if (fac === 'dream') { [84, 88, 91].forEach((n, i) => tone({ f: midi(n), dur: 0.9, v: 0.07, at: 0.04 + i * 0.07, verb: 0.6 })); }
      else tone({ f: 420, f1: 300, dur: 0.12, v: 0.1, type: 'triangle', at: 0.03 });
    },
    whoosh: () => noise({ f: 400, f1: 2600, dur: 0.22, v: 0.16, q: 1.2 }),
    hit: (o) => {
      const n = Math.min(10, (o && o.n) || 2);
      tone({ f: 110 + n * 4, f1: 38, dur: 0.24 + n * 0.02, v: 0.35 + n * 0.03 });
      noise({ f: 2500, f1: 600, dur: 0.12 + n * 0.012, v: 0.12 + n * 0.02, type: 'highpass' });
      if (n >= 6) noise({ f: 120, dur: 0.5, v: 0.25, type: 'lowpass', verb: 0.4 });
    },
    heroHit: (o) => { FX.hit(o); tone({ f: 70, f1: 40, dur: 0.4, v: 0.4 }); },
    shield: () => { [2093, 2637, 3136].forEach((f, i) => tone({ f, dur: 0.6, v: 0.06, at: i * 0.02, verb: 0.5 })); noise({ f: 6000, dur: 0.2, v: 0.05, type: 'highpass' }); },
    heal: () => [60, 64, 67, 72].forEach((n, i) => tone({ f: midi(n), dur: 1.1, v: 0.06, a: 0.15, at: i * 0.05, type: 'triangle', verb: 0.5 })),
    armor: () => { tone({ f: 520, f1: 480, dur: 0.25, v: 0.1, type: 'triangle' }); tone({ f: 1560, dur: 0.18, v: 0.04, at: 0.02 }); },
    freeze: () => { for (let i = 0; i < 9; i++) tone({ f: 2000 + Math.random() * 3000, dur: 0.25, v: 0.035, at: i * 0.025, verb: 0.4 }); noise({ f: 5000, f1: 9000, dur: 0.35, v: 0.06, type: 'highpass' }); },
    death_site: () => { for (let k = 0; k < 3; k++) [430, 980, 1610].forEach((f) => tone({ f: f * (1 + Math.random() * 0.05), dur: 0.18, v: 0.07, at: k * 0.09, type: 'triangle' })); tone({ f: 90, f1: 40, dur: 0.6, v: 0.25, at: 0.05 }); },
    death_level: () => { tone({ f: 800, f1: 60, dur: 0.45, v: 0.18, type: 'square', crush: 1 }); noise({ f: 3000, dur: 0.3, v: 0.12, crush: 1 }); },
    death_dream: () => { noise({ f: 900, f1: 3000, dur: 0.6, v: 0.08, type: 'bandpass', q: 3, verb: 0.6 }); [79, 76, 72].forEach((n, i) => tone({ f: midi(n), dur: 0.8, v: 0.05, at: i * 0.12, verb: 0.7 })); },
    death_neutral: () => { tone({ f: 200, f1: 60, dur: 0.35, v: 0.2 }); noise({ f: 800, dur: 0.25, v: 0.08 }); },
    spell_site: () => { tone({ f: 300, f1: 2400, dur: 0.35, v: 0.08, type: 'sawtooth', lp: 3000 }); tone({ f: 2400, dur: 0.2, v: 0.05, at: 0.3, verb: 0.4 }); },
    spell_level: () => { noise({ f: 1500, dur: 0.35, v: 0.14, crush: 1, q: 0.6 }); tone({ f: 120, f1: 60, dur: 0.3, v: 0.12, type: 'square', crush: 1 }); },
    spell_dream: () => [72, 76, 79, 84, 88].forEach((n, i) => tone({ f: midi(n), dur: 0.5, v: 0.06, at: i * 0.05, verb: 0.7 })),
    spell_neutral: () => { tone({ f: 600, f1: 1200, dur: 0.25, v: 0.08, type: 'triangle' }); },
    contain: () => { FX.death_site(); tone({ f: 1200, f1: 200, dur: 0.6, v: 0.1, type: 'sawtooth', lp: 2000, at: 0.2 }); tone({ f: 60, dur: 0.3, v: 0.3, at: 0.6 }); },
    alarm: () => { for (let i = 0; i < 3; i++) tone({ f: 620, f1: 920, dur: 0.38, v: 0.12, type: 'sawtooth', lp: 2200, at: i * 0.4, glide: 0.38 }); },
    limbo: () => { tone({ f: 600, f1: 40, dur: 0.7, v: 0.16, type: 'sine', verb: 0.6 }); noise({ f: 300, f1: 60, dur: 0.7, v: 0.1, type: 'lowpass' }); },
    turn: () => { [76, 83].forEach((n, i) => tone({ f: midi(n), dur: 1.2, v: 0.08, at: i * 0.12, verb: 0.6, type: 'triangle' })); },
    enemyTurn: () => { [64, 63].forEach((n, i) => tone({ f: midi(n), dur: 1.2, v: 0.07, at: i * 0.14, verb: 0.6, type: 'triangle' })); },
    chime: () => { tone({ f: 659.3, dur: 1.4, v: 0.13, verb: 0.8 }); tone({ f: 523.3, dur: 1.8, v: 0.13, at: 0.42, verb: 0.8 }); },
    fade: () => { noise({ f: 500, f1: 4000, dur: 0.5, v: 0.05, q: 4, verb: 0.6 }); },
    fake: () => { noise({ f: 200, f1: 3000, dur: 0.9, v: 0.06, q: 6, verb: 0.9 }); tone({ f: 220, f1: 110, dur: 1.2, v: 0.05, type: 'sine', verb: 0.9, at: 0.2 }); },
    sanity: () => { tone({ f: 300, f1: 180, dur: 0.5, v: 0.07, type: 'sine', verb: 0.6, detune: 30 }); tone({ f: 306, f1: 176, dur: 0.5, v: 0.07, type: 'sine', verb: 0.6 }); },
    depth: () => tone({ f: 90, f1: 70, dur: 0.6, v: 0.12, type: 'sine' }),
    sweep: () => { for (let i = 0; i < 4; i++) tone({ f: 880, dur: 0.06, v: 0.06, at: i * 0.12, type: 'square', lp: 2500 }); tone({ f: 55, f1: 30, dur: 0.8, v: 0.3, at: 0.5 }); },
    collapse: () => { tone({ f: 55, f1: 30, dur: 1.0, v: 0.3, type: 'sawtooth', lp: 400 }); noise({ f: 200, dur: 0.8, v: 0.15, type: 'lowpass' }); },
    burn: () => noise({ f: 800, f1: 4000, dur: 0.4, v: 0.1, type: 'highpass' }),
    error: () => { tone({ f: 180, dur: 0.09, v: 0.12, type: 'square', lp: 1200 }); tone({ f: 140, dur: 0.12, v: 0.12, type: 'square', lp: 1200, at: 0.1 }); },
    heartbeat: () => { tone({ f: 62, f1: 40, dur: 0.16, v: 0.4 }); tone({ f: 58, f1: 38, dur: 0.2, v: 0.32, at: 0.22 }); },
    legendary: () => {
      tone({ f: 70, f1: 30, dur: 1.4, v: 0.5 });
      noise({ f: 150, dur: 1.0, v: 0.25, type: 'lowpass', verb: 0.6 });
      [48, 55, 59, 64, 71].forEach((n, i) => { tone({ f: midi(n), dur: 2.4, v: 0.06, a: 0.3, type: 'sawtooth', lp: 1800, verb: 0.8, at: 0.05 + i * 0.03 }); tone({ f: midi(n), dur: 2.4, v: 0.05, a: 0.3, type: 'sawtooth', lp: 1800, detune: 9, verb: 0.8, at: 0.05 }); });
      tone({ f: midi(83), dur: 1.6, v: 0.05, at: 0.5, verb: 0.9 });
    },
    type: () => tone({ f: 2200 + Math.random() * 400, dur: 0.02, v: 0.025, type: 'square', lp: 5000 }),
    layer: () => {
      // tape stop + static + boom
      tone({ f: 330, f1: 30, dur: 1.2, v: 0.2, type: 'sawtooth', lp: 1500, glide: 1.1 });
      tone({ f: 415, f1: 36, dur: 1.2, v: 0.12, type: 'sawtooth', lp: 1500, glide: 1.1 });
      noise({ f: 3000, dur: 1.0, v: 0.18, at: 0.4, q: 0.3, crush: 1 });
      tone({ f: 48, f1: 24, dur: 2.0, v: 0.55, at: 1.2 });
      noise({ f: 90, dur: 1.6, v: 0.3, type: 'lowpass', at: 1.2, verb: 0.8 });
    },
    flicker: () => { for (let i = 0; i < 2; i++) { tone({ f: 120, dur: 0.07, v: 0.12, type: 'square', at: i * 0.2, lp: 2000 }); noise({ f: 5000, dur: 0.05, v: 0.08, at: i * 0.2 + 0.01, type: 'highpass' }); } },
    win: () => [60, 64, 67, 72, 76].forEach((n, i) => tone({ f: midi(n), dur: 2.2, v: 0.08, at: i * 0.12, type: 'triangle', verb: 0.7 })),
    lose: () => [67, 63, 60, 55].forEach((n, i) => tone({ f: midi(n), dur: 2.0, v: 0.08, at: i * 0.28, type: 'triangle', verb: 0.8, detune: -20 })),
    whisper: () => { for (let i = 0; i < 5; i++) noise({ f: 1200 + Math.random() * 2000, dur: 0.12, v: 0.04, at: i * 0.11, q: 8, verb: 0.8 }); },
  };
  A.play = function (name, o) {
    if (!ctx || settings().mute) return;
    const f = FX[name];
    if (!f) return;
    try {
      f(o);
    } catch (e) {
      /* never let audio break the game */
    }
  };
  A.vibrate = function (ms) {
    if (settings().vibrate && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {}
  };

  // ---------------------------------------------------------------- ambiences
  function stopAmb(fade) {
    if (!amb) return;
    const a = amb;
    amb = null;
    const t = ctx.currentTime;
    a.gain.gain.cancelScheduledValues(t);
    a.gain.gain.setTargetAtTime(0.0001, t, fade || 0.4);
    clearInterval(a.timer);
    setTimeout(() => { a.nodes.forEach((n) => { try { n.stop(); } catch (e) {} }); a.gain.disconnect(); }, (fade || 0.4) * 5000);
  }
  function startHum() {
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(ambBus);
    const nodes = [];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(g);
    const flick = ctx.createGain();
    flick.gain.value = 1;
    flick.connect(lp);
    [[60, 'sawtooth', 0.05], [120, 'sine', 0.09], [180, 'triangle', 0.03], [240, 'sine', 0.02]].forEach(([f, type, v]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og);
      og.connect(flick);
      o.start();
      nodes.push(o);
    });
    // ballast whine
    const w = ctx.createOscillator();
    w.frequency.value = 7800;
    const wg = ctx.createGain();
    wg.gain.value = 0.004;
    w.connect(wg);
    wg.connect(g);
    w.start();
    nodes.push(w);
    g.gain.setTargetAtTime(0.9, ctx.currentTime, 1.2);
    const timer = setInterval(() => {
      if (Math.random() < 0.35) {
        const t = ctx.currentTime;
        flick.gain.setValueAtTime(0.25, t);
        flick.gain.setValueAtTime(1, t + 0.05 + Math.random() * 0.08);
        if (Math.random() < 0.5) tone({ f: 120, dur: 0.05, v: 0.02, type: 'square', lp: 1500 });
      }
    }, 2200);
    return { gain: g, nodes, timer };
  }
  function startWater() {
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(ambBus);
    const nodes = [];
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const lap = ctx.createGain();
    lap.gain.value = 0.25;
    src.connect(lp);
    lp.connect(lap);
    lap.connect(g);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lg = ctx.createGain();
    lg.gain.value = 0.18;
    lfo.connect(lg);
    lg.connect(lap.gain);
    src.start();
    lfo.start();
    nodes.push(src, lfo);
    // hollow drone
    [55, 82.4].forEach((f) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = 0.05;
      o.connect(og);
      og.connect(g);
      const send = ctx.createGain();
      send.gain.value = 0.3;
      og.connect(send);
      send.connect(verbSend);
      o.start();
      nodes.push(o);
    });
    g.gain.setTargetAtTime(0.9, ctx.currentTime, 1.5);
    const timer = setInterval(() => {
      // drips into a big empty room
      if (Math.random() < 0.7) {
        const f = 900 + Math.random() * 1400;
        tone({ f, f1: f * 0.45, dur: 0.18, v: 0.05, verb: 1.2, glide: 0.08 });
      }
      if (Math.random() < 0.08) {
        // a distant whistle
        tone({ f: 2600, dur: 0.45, v: 0.02, type: 'sine', verb: 1.5, at: 0.2 });
      }
    }, 900);
    return { gain: g, nodes, timer };
  }
  function startMall() {
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(ambBus);
    const nodes = [];
    // detuned muzak pad through a tape wobble
    const pad = ctx.createGain();
    pad.gain.value = 0.05;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    pad.connect(lp);
    lp.connect(g);
    const padSend = ctx.createGain();
    padSend.gain.value = 0.6;
    lp.connect(padSend);
    padSend.connect(verbSend);
    const wob = ctx.createOscillator();
    wob.frequency.value = 0.35;
    const wobG = ctx.createGain();
    wobG.gain.value = 14;
    wob.connect(wobG);
    wob.start();
    nodes.push(wob);
    const voices = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      wobG.connect(o.detune);
      const og = ctx.createGain();
      og.gain.value = 0.25;
      o.connect(og);
      og.connect(pad);
      o.start();
      voices.push(o);
      nodes.push(o);
    }
    const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 69]];
    let ci = 0;
    const setChord = () => {
      const ch = chords[ci++ % chords.length];
      voices.forEach((o, i) => o.frequency.setTargetAtTime(midi(ch[i] - 12 + (i === 3 ? 12 : 0)), ctx.currentTime, 0.4));
    };
    setChord();
    g.gain.setTargetAtTime(0.85, ctx.currentTime, 1.5);
    let tick = 0;
    const timer = setInterval(() => {
      tick++;
      if (tick % 4 === 0) setChord();
      if (tick % 9 === 3) announce();
    }, 2000);
    return { gain: g, nodes, timer };
  }
  // the distant, garbled PA voice
  function announce() {
    if (!ctx) return;
    FX.chime();
    const t0 = ctx.currentTime + 1.6;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const f1 = ctx.createBiquadFilter(),
      f2 = ctx.createBiquadFilter();
    f1.type = f2.type = 'bandpass';
    f1.Q.value = 6;
    f2.Q.value = 8;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1400;
    band.Q.value = 0.7;
    const env = ctx.createGain();
    env.gain.value = 0.0001;
    const dist = ctx.createWaveShaper();
    dist.curve = (() => { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(x * 4); } return c; })();
    osc.connect(f1);
    osc.connect(f2);
    f1.connect(env);
    f2.connect(env);
    env.connect(dist);
    dist.connect(band);
    const vol = ctx.createGain();
    vol.gain.value = 0.05;
    band.connect(vol);
    vol.connect(ambBus);
    const send = ctx.createGain();
    send.gain.value = 0.9;
    vol.connect(send);
    send.connect(verbSend);
    const syll = 10 + Math.floor(Math.random() * 8);
    let t = t0;
    for (let i = 0; i < syll; i++) {
      const d = 0.12 + Math.random() * 0.16;
      osc.frequency.setValueAtTime(150 + Math.random() * 70, t);
      f1.frequency.setValueAtTime(400 + Math.random() * 500, t);
      f2.frequency.setValueAtTime(1200 + Math.random() * 1200, t);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(1, t + 0.03);
      env.gain.exponentialRampToValueAtTime(0.05, t + d);
      t += d + (Math.random() < 0.2 ? 0.25 : 0.03);
    }
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.start(t0);
    osc.stop(t + 0.2);
  }
  A.announce = announce;

  A.ambience = function (layer) {
    if (!ctx) {
      A._pendingLayer = layer;
      return;
    }
    if (layer === ambLayer && amb) return;
    stopAmb(0.6);
    ambLayer = layer;
    if (layer == null || layer < 0) return;
    amb = layer === 0 ? startHum() : layer === 1 ? startWater() : startMall();
  };
  A.duck = function (on) {
    if (!ambBus) return;
    ambBus.gain.setTargetAtTime(on ? 0.12 : 0.55, ctx.currentTime, 0.15);
  };
  A.heartbeat = function (on) {
    if (on && !heart) {
      heart = setInterval(() => A.play('heartbeat'), 1100);
      A.play('heartbeat');
    } else if (!on && heart) {
      clearInterval(heart);
      heart = null;
    }
  };
})();
