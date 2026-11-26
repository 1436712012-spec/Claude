/* LIMINAL · canvas particles, ambient layers, shake, floating numbers, flying cards */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const FX = (L.FX = {});
  let front, fctx, back, bctx, dpr = 1, VW = 0, VH = 0;
  const parts = [];
  const pool = [];
  const effects = [];
  let budget = 520, maxBudget = 700;
  let frameAvg = 16, lastT = 0, frames = 0;
  let ambient = { layer: 0, motes: [], t: 0 };
  let shakeAmp = 0, shakeX = 0, shakeY = 0, shakeEl = null;
  let reduced = false;
  let dirtyFront = false;
  FX.speed = 1;

  const COLORS = {
    site: ['#bff8ff', '#9ff3ff', '#e9fbff', '#5fd8ee'],
    level: ['#f2d64b', '#fff6c8', '#c9b25f', '#2b2310'],
    dream: ['#ffb3e6', '#c9a8ff', '#9ff3ff', '#fff59f', '#ffffff'],
    neutral: ['#efe6cf', '#d8d2c4', '#fff8e8'],
    hit: ['#ffffff', '#ffd08a', '#ff6a3a'],
    heal: ['#b8ffd0', '#3dff8a', '#fffbe0'],
    ice: ['#e9fbff', '#9ff3ff', '#ffffff'],
    gold: ['#fff1c0', '#f3cf6a', '#ffffff'],
    red: ['#ff3b4e', '#ff8a8a', '#ffd0d4'],
    neon: ['#ff2a4d', '#ff3ec8', '#3ef0ff'],
    san: ['#d2b4ff', '#b98bff', '#ffffff'],
    dark: ['#1a1612', '#2b2310', '#000000'],
  };
  FX.COLORS = COLORS;

  // pre-rendered glow sprites
  const sprites = {};
  function sprite(col) {
    if (sprites[col]) return sprites[col];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.18, col);
    gr.addColorStop(0.5, col + '55');
    gr.addColorStop(1, col + '00');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    sprites[col] = c;
    return c;
  }

  FX.init = function () {
    front = document.getElementById('fxFront');
    back = document.getElementById('fxBack');
    fctx = front.getContext('2d');
    bctx = back.getContext('2d');
    reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse) { maxBudget = 420; budget = 360; }
    FX.resize();
    window.addEventListener('resize', FX.resize);
    requestAnimationFrame(loop);
  };
  FX.setCalm = function (on) {
    reduced = on || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  FX.isCalm = () => reduced;
  FX.resize = function () {
    VW = window.innerWidth;
    VH = window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    front.width = Math.round(VW * dpr);
    front.height = Math.round(VH * dpr);
    back.width = Math.round(VW);
    back.height = Math.round(VH);
    ambient.motes = [];
    caustic = null;
  };

  function P() {
    return pool.pop() || {};
  }
  function add(p) {
    if (parts.length >= budget) {
      pool.push(p);
      return;
    }
    p.age = 0;
    parts.push(p);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const scaleN = (n) => Math.max(1, Math.round(n * (budget / 520) * (reduced ? 0.35 : 1)));

  // ---------------------------------------------------------------- emitters
  FX.burst = function (x, y, style, n, o) {
    o = o || {};
    n = scaleN(n || 24);
    const cols = COLORS[style] || COLORS.neutral;
    const sp = o.speed || 1;
    for (let i = 0; i < n; i++) {
      const p = P();
      const a = o.dir != null ? o.dir + rnd(-(o.spread || 0.6), o.spread || 0.6) : Math.random() * Math.PI * 2;
      const v = rnd(60, 340) * sp;
      p.x = x + rnd(-4, 4);
      p.y = y + rnd(-4, 4);
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.ax = 0;
      p.ay = o.grav == null ? 260 : o.grav;
      p.drag = 2.2;
      p.life = rnd(0.45, 1.0) * (o.life || 1);
      p.size = rnd(2, 5) * (o.size || 1);
      p.col = pick(cols);
      p.rot = Math.random() * 6.28;
      p.vr = rnd(-8, 8);
      p.type = o.type || (style === 'level' ? 'px' : style === 'dream' ? (Math.random() < 0.5 ? 'bubble' : 'glow') : style === 'site' ? (Math.random() < 0.5 ? 'spark' : 'glow') : style === 'ice' ? 'snow' : 'spark');
      if (p.type === 'glow') p.size *= 3;
      if (p.type === 'bubble') { p.size *= 2; p.ay = -40; p.drag = 3; }
      add(p);
    }
  };
  FX.ring = function (x, y, col, r1, dur, w) {
    const p = P();
    Object.assign(p, { x, y, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, life: (dur || 0.55) * FX.speed, size: 6, size1: r1 || 120, col: col || '#fff', type: 'ring', w: w || 6, rot: 0, vr: 0 });
    add(p);
  };
  FX.motes = function (rect, style, n) {
    const cols = COLORS[style] || COLORS.neutral;
    n = scaleN(n || 18);
    for (let i = 0; i < n; i++) {
      const p = P();
      Object.assign(p, { x: rect.left + Math.random() * rect.width, y: rect.top + Math.random() * rect.height, vx: rnd(-20, 20), vy: rnd(-60, -20), ax: 0, ay: 0, drag: 0.5, life: rnd(0.6, 1.3), size: rnd(6, 14), col: pick(cols), type: 'glow', rot: 0, vr: 0 });
      add(p);
    }
  };
  // level death / glitch: the minion falls apart into its own pixels
  FX.pixelize = function (rect, style) {
    const cols = COLORS[style] || COLORS.level;
    const cell = Math.max(5, rect.width / 9);
    const cols_n = Math.ceil(rect.width / cell), rows = Math.ceil(rect.height / cell);
    for (let i = 0; i < cols_n; i++) for (let j = 0; j < rows; j++) {
      if (Math.random() < 0.35 && parts.length > budget * 0.8) continue;
      const p = P();
      const cx = rect.left + (i + 0.5) * cell, cy = rect.top + (j + 0.5) * cell;
      Object.assign(p, { x: cx, y: cy, vx: rnd(-80, 80) + (cx - (rect.left + rect.width / 2)) * 2, vy: rnd(-160, 20), ax: 0, ay: 420, drag: 1, life: rnd(0.5, 1.1), size: cell * rnd(0.6, 1), col: pick(cols), type: 'px', rot: 0, vr: 0, glitch: Math.random() < 0.3 });
      add(p);
    }
  };
  // dream death: soft faded paper scraps drifting away
  FX.paperize = function (rect) {
    const n = scaleN(26);
    for (let i = 0; i < n; i++) {
      const p = P();
      Object.assign(p, { x: rect.left + Math.random() * rect.width, y: rect.top + Math.random() * rect.height, vx: rnd(-60, 60), vy: rnd(-140, -40), ax: rnd(-30, 30), ay: 30, drag: 1.4, life: rnd(1.0, 1.9), size: rnd(6, 13), col: pick(['#fff8f0', '#ffe3f4', '#e6dcff', '#fff']), type: 'paper', rot: Math.random() * 6.28, vr: rnd(-5, 5), flip: Math.random() * 6.28 });
      add(p);
    }
  };
  FX.dust = function (rect, n) {
    n = scaleN(n || 16);
    for (let i = 0; i < n; i++) {
      const p = P();
      Object.assign(p, { x: rect.left + Math.random() * rect.width, y: rect.top + rect.height * rnd(0.5, 1), vx: rnd(-90, 90), vy: rnd(-60, 10), ax: 0, ay: 80, drag: 2, life: rnd(0.5, 1.0), size: rnd(8, 18), col: pick(['#d8d2c4', '#b9ae94', '#8a8170']), type: 'smoke', rot: 0, vr: 0 });
      add(p);
    }
  };
  FX.snow = function (rect, n) {
    FX.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, 'ice', n || 30, { grav: 40, speed: 0.6, type: 'snow', life: 1.2 });
  };

  // generic timed effect (custom drawers)
  function effect(dur, draw) {
    return new Promise((res) => {
      effects.push({ t: 0, dur: dur * FX.speed, draw, res });
    });
  }
  FX.effect = effect;

  // chains converge from the screen edges onto a rect
  FX.chains = function (rect, col) {
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const anchors = [[-20, cy - 120], [VW + 20, cy - 80], [cx - 60, VH + 20], [cx + 80, -20]].slice(0, reduced ? 2 : 4);
    return effect(0.75, (g, k) => {
      const t = Math.min(1, k * 1.6);
      g.save();
      g.lineWidth = 3 * dpr;
      for (const [ax, ay] of anchors) {
        const ex = ax + (cx - ax) * t, ey = ay + (cy - ay) * t;
        const len = Math.hypot(ex - ax, ey - ay), steps = Math.floor(len / 14);
        const ang = Math.atan2(ey - ay, ex - ax);
        for (let i = 0; i < steps; i++) {
          const px = ax + (ex - ax) * (i / steps), py = ay + (ey - ay) * (i / steps);
          g.strokeStyle = i % 2 ? '#7c9aa0' : col || '#d9f6ff';
          g.globalAlpha = (1 - Math.max(0, k - 0.7) / 0.3) * 0.95;
          g.beginPath();
          g.ellipse(px * dpr, py * dpr, 7 * dpr, 4 * dpr, ang + (i % 2 ? Math.PI / 2 : 0), 0, Math.PI * 2);
          g.stroke();
        }
      }
      g.restore();
    });
  };
  // cyan containment lattice closing around a rect
  FX.lattice = function (rect, col) {
    return effect(0.7, (g, k) => {
      const pad = 40 * (1 - Math.min(1, k * 1.8));
      const x = rect.left - pad, y = rect.top - pad, w = rect.width + pad * 2, h = rect.height + pad * 2;
      g.save();
      g.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4;
      g.strokeStyle = col || '#9ff3ff';
      g.shadowColor = col || '#9ff3ff';
      g.shadowBlur = 12 * dpr;
      g.lineWidth = 2 * dpr;
      const n = 5;
      for (let i = 0; i <= n; i++) {
        g.beginPath();
        g.moveTo((x + (w * i) / n) * dpr, y * dpr);
        g.lineTo((x + (w * i) / n) * dpr, (y + h) * dpr);
        g.stroke();
        g.beginPath();
        g.moveTo(x * dpr, (y + (h * i) / n) * dpr);
        g.lineTo((x + w) * dpr, (y + (h * i) / n) * dpr);
        g.stroke();
      }
      g.restore();
    });
  };
  // red alarm sweep (breach)
  FX.alarm = function () {
    return effect(1.2, (g, k) => {
      const a = (Math.sin(k * Math.PI * 6) * 0.5 + 0.5) * (1 - k) * 0.45;
      g.fillStyle = `rgba(255,30,50,${a})`;
      g.fillRect(0, 0, front.width, front.height);
    });
  };
  FX.flash = function (col, alpha, dur) {
    return effect(dur || 0.3, (g, k) => {
      g.globalAlpha = (alpha || 0.6) * (1 - k);
      g.fillStyle = col || '#fff';
      g.fillRect(0, 0, front.width, front.height);
      g.globalAlpha = 1;
    });
  };
  // scanning spotlight that finds the weakest (mall sweep)
  FX.spotlight = function (rect) {
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    return effect(0.9, (g, k) => {
      const t = Math.min(1, k * 1.4);
      const x = (VW * 0.1 + (cx - VW * 0.1) * t) * dpr;
      g.save();
      g.globalAlpha = 0.55 * (1 - Math.max(0, k - 0.75) / 0.25);
      const gr = g.createRadialGradient(x, cy * dpr, 0, x, cy * dpr, 60 * dpr);
      gr.addColorStop(0, 'rgba(255,60,90,.9)');
      gr.addColorStop(1, 'rgba(255,60,90,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(VW * 0.5 * dpr, 0);
      g.lineTo(x - 50 * dpr, cy * dpr);
      g.lineTo(x + 50 * dpr, cy * dpr);
      g.closePath();
      g.fill();
      g.fillRect(x - 60 * dpr, cy * dpr - 60 * dpr, 120 * dpr, 120 * dpr);
      g.restore();
    });
  };

  // projectile with a faction-flavoured trail; resolves on impact
  FX.projectile = function (x0, y0, x1, y1, style, dur) {
    dur = (dur || 0.42) * FX.speed;
    const cols = COLORS[style] || COLORS.neutral;
    const mx = (x0 + x1) / 2 + (y1 - y0) * 0.18, my = (y0 + y1) / 2 - Math.abs(x1 - x0) * 0.25 - 30;
    return new Promise((res) => {
      effects.push({
        t: 0,
        dur,
        res,
        draw: (g, k) => {
          const e = k < 1 ? k * k * (3 - 2 * k) : 1;
          const x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * mx + e * e * x1;
          const y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * my + e * e * y1;
          for (let i = 0; i < (reduced ? 1 : 3); i++) {
            const p = P();
            Object.assign(p, { x: x + rnd(-3, 3), y: y + rnd(-3, 3), vx: rnd(-30, 30), vy: rnd(-30, 30), ax: 0, ay: style === 'dream' ? -30 : 40, drag: 3, life: rnd(0.25, 0.5), size: rnd(3, 7), col: pick(cols), type: style === 'level' ? 'px' : style === 'dream' && Math.random() < 0.4 ? 'bubble' : 'glow', rot: 0, vr: 0 });
            if (p.type === 'glow') p.size *= 2.4;
            add(p);
          }
          const s = sprite(cols[0]);
          const r = (style === 'level' ? 18 : 26) * dpr;
          g.globalCompositeOperation = 'lighter';
          g.drawImage(s, x * dpr - r, y * dpr - r, r * 2, r * 2);
          g.globalCompositeOperation = 'source-over';
        },
      });
    });
  };

  // ---------------------------------------------------------------- shake / vignette
  FX.setShakeTarget = (el) => (shakeEl = el);
  FX.shake = function (n) {
    if (reduced) return;
    shakeAmp = Math.min(26, Math.max(shakeAmp, n));
  };

  // ---------------------------------------------------------------- DOM text
  const domfx = () => document.getElementById('domfx');
  FX.number = function (x, y, text, cls, big) {
    const d = document.createElement('div');
    d.className = 'dnum ' + (cls || 'dmg');
    d.textContent = text;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    if (big) d.style.fontSize = 'calc(var(--u) * ' + big + ')';
    domfx().appendChild(d);
    const dur = 1100 * FX.speed;
    const a = d.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.2)', opacity: 0 },
        { transform: 'translate(-50%,-62%) scale(1.35)', opacity: 1, offset: 0.14 },
        { transform: 'translate(-50%,-55%) scale(.95)', opacity: 1, offset: 0.26 },
        { transform: 'translate(-50%,-60%) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%,-110%) scale(1)', opacity: 0 },
      ],
      { duration: dur, easing: 'ease-out' }
    );
    a.onfinish = () => d.remove();
  };
  FX.word = function (x, y, text, cls) {
    FX.number(x, y, text, 'word ' + (cls || ''));
  };

  // fly a DOM element (clone) from one rect to another along an arc
  FX.fly = function (el, from, to, o) {
    o = o || {};
    const node = el.cloneNode(true);
    node.classList.add('flycard');
    node.classList.remove('sel', 'playable', 'dim');
    const w = from.width, h = from.height;
    node.style.width = w + 'px';
    node.style.height = h + 'px';
    node.style.setProperty('--cw', w + 'px');
    node.style.margin = '0';
    domfx().appendChild(node);
    const sx = to.width / w, sy = to.height / h;
    const tx = to.left + to.width / 2 - w / 2, ty = to.top + to.height / 2 - h / 2;
    const mx = (from.left + tx) / 2, my = Math.min(from.top, ty) - (o.lift == null ? 80 : o.lift);
    const dur = (o.dur || 520) * FX.speed;
    const a = node.animate(
      [
        { transform: `translate(${from.left}px,${from.top}px) rotate(${o.r0 || 0}deg) scale(1)`, opacity: 1 },
        { transform: `translate(${mx}px,${my}px) rotate(${(o.r0 || 0) / 2 + (o.spin || 0)}deg) scale(${(1 + Math.max(sx, sy)) / 2 + 0.12})`, opacity: 1, offset: 0.5 },
        { transform: `translate(${tx}px,${ty}px) rotate(0deg) scale(${Math.min(sx, sy)})`, opacity: o.fadeOut ? 0 : 1 },
      ],
      { duration: dur, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }
    );
    return a.finished.then(() => {
      if (!o.keep) node.remove();
      return node;
    });
  };

  // ---------------------------------------------------------------- ambient layers (back canvas)
  let caustic = null;
  function makeCaustic() {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const pts = [];
    for (let i = 0; i < 22; i++) pts.push([Math.random() * S, Math.random() * S]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let d1 = 1e9, d2 = 1e9;
      for (const [px, py] of pts) {
        for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
          const dx = x - px - ox, dy = y - py - oy;
          const d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
      }
      const v = Math.max(0, 1 - (Math.sqrt(d2) - Math.sqrt(d1)) / 5);
      const a = Math.pow(v, 2.2) * 255;
      const i = (y * S + x) * 4;
      img.data[i] = 220;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = a;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  FX.setAmbient = function (layer) {
    ambient.layer = layer;
    ambient.motes = [];
  };
  function drawAmbient(dt) {
    const g = bctx;
    const w = back.width, h = back.height;
    g.clearRect(0, 0, w, h);
    ambient.t += dt;
    const lay = ambient.layer;
    const want = reduced ? 10 : lay === 1 ? 14 : 36;
    while (ambient.motes.length < want) {
      ambient.motes.push({ x: Math.random() * w, y: Math.random() * h, vx: rnd(-6, 6), vy: lay === 1 ? rnd(-26, -10) : rnd(-10, 4), r: rnd(1, 3.2), ph: Math.random() * 6.28, sp: rnd(0.5, 1.6) });
    }
    if (lay === 1) {
      if (!caustic) caustic = makeCaustic();
      const pat = g.createPattern(caustic, 'repeat');
      const t = ambient.t;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.16;
      g.translate(-((t * 9) % 128), -((t * 5) % 128));
      g.scale(2, 2);
      g.fillStyle = pat;
      g.fillRect(0, 0, w / 2 + 128, h / 2 + 128);
      g.restore();
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.11;
      g.translate(-((t * -6) % 192) - 192, -((t * 8) % 192));
      g.scale(3, 3);
      g.fillStyle = pat;
      g.fillRect(0, 0, w / 3 + 192, h / 3 + 192);
      g.restore();
    }
    const col = lay === 0 ? '255,244,200' : lay === 1 ? '230,255,255' : '255,80,110';
    for (const m of ambient.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.ph += dt * m.sp;
      if (m.y < -10) { m.y = h + 10; m.x = Math.random() * w; }
      if (m.y > h + 10) m.y = -10;
      if (m.x < -10) m.x = w + 10;
      if (m.x > w + 10) m.x = -10;
      const a = (Math.sin(m.ph) * 0.5 + 0.5) * (lay === 2 ? 0.55 : 0.45);
      if (lay === 1) {
        g.strokeStyle = `rgba(${col},${a})`;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(m.x, m.y, m.r * 1.6, 0, 6.283);
        g.stroke();
      } else {
        g.fillStyle = `rgba(${col},${a})`;
        g.beginPath();
        g.arc(m.x, m.y, m.r, 0, 6.283);
        g.fill();
      }
    }
    if (lay === 2 && !reduced) {
      // slow red scan line
      const y = ((ambient.t * 60) % (h + 200)) - 100;
      const gr = g.createLinearGradient(0, y - 40, 0, y + 40);
      gr.addColorStop(0, 'rgba(255,40,70,0)');
      gr.addColorStop(0.5, 'rgba(255,40,70,.08)');
      gr.addColorStop(1, 'rgba(255,40,70,0)');
      g.fillStyle = gr;
      g.fillRect(0, y - 40, w, 80);
    }
    if (lay === 0 && !reduced && Math.sin(ambient.t * 0.7) > 0.995) {
      g.fillStyle = 'rgba(20,14,0,.18)';
      g.fillRect(0, 0, w, h);
    }
  }

  // ---------------------------------------------------------------- main loop
  function loop(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    frameAvg = frameAvg * 0.95 + dt * 1000 * 0.05;
    if (++frames % 60 === 0) {
      if (frameAvg > 22) budget = Math.max(110, Math.floor(budget * 0.75));
      else if (frameAvg < 17.5) budget = Math.min(maxBudget, budget + 30);
    }
    drawAmbient(dt);
    // shake
    if (shakeEl) {
      if (shakeAmp > 0.3) {
        shakeX = (Math.random() * 2 - 1) * shakeAmp;
        shakeY = (Math.random() * 2 - 1) * shakeAmp * 0.7;
        shakeAmp *= Math.pow(0.0025, dt);
        shakeEl.style.transform = `translate(${shakeX.toFixed(1)}px,${shakeY.toFixed(1)}px)`;
      } else if (shakeAmp > 0) {
        shakeAmp = 0;
        shakeEl.style.transform = '';
      }
    }
    if (parts.length || effects.length || dirtyFront) {
      const g = fctx;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, front.width, front.height);
      dirtyFront = parts.length > 0 || effects.length > 0;
      for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i];
        e.t += dt;
        const k = Math.min(1, e.t / e.dur);
        e.draw(g, k);
        if (k >= 1) {
          effects.splice(i, 1);
          e.res && e.res();
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life) {
          parts[i] = parts[parts.length - 1];
          parts.pop();
          pool.push(p);
          continue;
        }
        const k = p.age / p.life;
        p.vx += p.ax * dt;
        p.vy += p.ay * dt;
        const dr = Math.exp(-p.drag * dt);
        p.vx *= dr;
        p.vy *= dr;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        drawP(g, p, k);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    requestAnimationFrame(loop);
  }
  function drawP(g, p, k) {
    const a = 1 - k;
    const x = p.x * dpr, y = p.y * dpr, s = p.size * dpr;
    switch (p.type) {
      case 'glow': {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a;
        const r = s * (1 - k * 0.4);
        g.drawImage(sprite(p.col), x - r, y - r, r * 2, r * 2);
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'spark': {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a;
        g.strokeStyle = p.col;
        g.lineWidth = Math.max(1, s * 0.5);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - p.vx * 0.05 * dpr, y - p.vy * 0.05 * dpr);
        g.stroke();
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'px': {
        g.globalAlpha = a;
        g.fillStyle = p.glitch && Math.random() < 0.3 ? pick(['#ff2a4d', '#3ef0ff']) : p.col;
        g.fillRect(x - s / 2, y - s / 2, s, s);
        break;
      }
      case 'snow': {
        g.globalAlpha = a;
        g.fillStyle = p.col;
        g.beginPath();
        g.arc(x, y, s * 0.6, 0, 6.283);
        g.fill();
        break;
      }
      case 'paper': {
        g.globalAlpha = a;
        g.save();
        g.translate(x, y);
        g.rotate(p.rot);
        g.scale(1, Math.cos(p.flip + p.age * 6));
        g.fillStyle = p.col;
        g.fillRect(-s / 2, -s * 0.65, s, s * 1.3);
        g.restore();
        break;
      }
      case 'bubble': {
        g.globalAlpha = a * 0.9;
        g.strokeStyle = p.col;
        g.lineWidth = Math.max(1, dpr);
        g.beginPath();
        g.arc(x, y, s, 0, 6.283);
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,.6)';
        g.beginPath();
        g.arc(x - s * 0.35, y - s * 0.35, s * 0.2, 0, 6.283);
        g.fill();
        break;
      }
      case 'ring': {
        const r = (p.size + (p.size1 - p.size) * (1 - Math.pow(1 - k, 3))) * dpr;
        g.globalAlpha = a;
        g.strokeStyle = p.col;
        g.lineWidth = p.w * dpr * (1 - k);
        g.beginPath();
        g.arc(x, y, r, 0, 6.283);
        g.stroke();
        break;
      }
      case 'smoke': {
        g.globalAlpha = a * 0.5;
        g.fillStyle = p.col;
        g.beginPath();
        g.arc(x, y, s * (0.6 + k), 0, 6.283);
        g.fill();
        break;
      }
    }
  }
})();
