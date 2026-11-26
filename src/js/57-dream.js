/* LIMINAL · dreamcore layer: floating far objects, film halation & light leaks, grain,
   tap ripples, drag trails, holographic card foil that follows the finger */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const D = (L.Dream = {});
  if (typeof document === 'undefined') return;
  const uri = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  // ---------------------------------------------------------------- sprites (blur baked into the SVG)
  function svg(vb, body, blur) {
    return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><defs><filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${blur || 0}"/></filter>
<radialGradient id="sh" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><g filter="url(#b)">${body}</g></svg>`);
  }
  const SPR = {
    cloud: (bl) => svg('0 0 200 110', `<ellipse cx="100" cy="82" rx="90" ry="18" fill="#f3d6ef" opacity=".7"/><ellipse cx="62" cy="64" rx="44" ry="30" fill="#fff"/><ellipse cx="110" cy="48" rx="50" ry="38" fill="#fff"/><ellipse cx="150" cy="66" rx="38" ry="26" fill="#fff"/><ellipse cx="100" cy="74" rx="84" ry="18" fill="#fff"/><ellipse cx="96" cy="36" rx="26" ry="12" fill="#fff" opacity=".8"/>`, bl),
    ring: (bl) => {
      let s = '';
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
        const p = (a, r) => `${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r * 0.62).toFixed(1)}`;
        s += `<path d="M${p(a0, 46)} A46 28.5 0 0 1 ${p(a1, 46)} L${p(a1, 24)} A24 14.9 0 0 0 ${p(a0, 24)} Z" fill="${i % 2 ? '#fff' : '#ff8fb8'}"/>`;
      }
      return svg('0 0 100 100', s + `<ellipse cx="34" cy="30" rx="12" ry="4" fill="#fff" opacity=".8"/>`, bl);
    },
    balloon: (col, bl) => svg('0 0 60 140', `<path d="M30 66 Q24 90 34 110 Q40 124 30 138" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" fill="none"/><ellipse cx="30" cy="34" rx="24" ry="30" fill="${col}"/><path d="M26 63 L34 63 L30 69 Z" fill="${col}"/><ellipse cx="30" cy="34" rx="24" ry="30" fill="url(#sh)"/>`, bl),
    door: (bl) => svg('0 0 80 150', `<ellipse cx="40" cy="144" rx="34" ry="5" fill="#b7a4d8" opacity=".5"/><rect x="10" y="8" width="60" height="132" rx="2" fill="#fff8fb"/><rect x="16" y="14" width="48" height="126" fill="#ffe9f6"/><rect x="38" y="14" width="4" height="126" fill="#fff" opacity=".95"/><rect x="30" y="10" width="20" height="134" fill="#fff" opacity=".35"/><circle cx="56" cy="80" r="2.5" fill="#d8b8e8"/>`, bl),
    tv: (bl) => svg('0 0 120 110', `<line x1="44" y1="22" x2="30" y2="2" stroke="#c9b5e8" stroke-width="3"/><line x1="70" y1="22" x2="86" y2="4" stroke="#c9b5e8" stroke-width="3"/><rect x="6" y="20" width="108" height="84" rx="12" fill="#d9c6ff"/><rect x="16" y="30" width="76" height="64" rx="10" fill="#fff0fb"/><rect x="16" y="30" width="76" height="64" rx="10" fill="#bfe8ff" opacity=".55"/><circle cx="102" cy="44" r="4" fill="#9a7fc8"/><circle cx="102" cy="58" r="4" fill="#9a7fc8"/>`, bl),
    star: (col, bl) => {
      let d = '';
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 18 : 44; d += (i ? 'L' : 'M') + (50 + Math.cos(a) * r).toFixed(1) + ' ' + (50 + Math.sin(a) * r).toFixed(1); }
      return svg('0 0 100 100', `<path d="${d}Z" fill="${col}"/><circle cx="50" cy="50" r="30" fill="${col}" opacity=".35"/>`, bl);
    },
    moon: (bl) => svg('0 0 100 100', `<circle cx="50" cy="50" r="40" fill="#fff6dc"/><circle cx="66" cy="40" r="34" fill="#cbb8f0"/>`, bl),
    sun: (bl) => svg('0 0 100 100', `<circle cx="50" cy="50" r="46" fill="#fff4d6" opacity=".45"/><circle cx="50" cy="50" r="30" fill="#fff8e6"/>`, bl),
  };

  // far objects per layer: s=sprite, x/y in %, w in vmin, m=motion, d=duration(s), o=opacity
  const FAR = {
    0: [
      { s: () => SPR.balloon('#ff9ac0', 3), x: 64, y: 40, w: 4, m: 'rise', d: 80, o: 0.5 },
      { s: () => SPR.door(3), x: 46, y: 26, w: 4.5, m: 'bob', d: 9, o: 0.22 },
    ],
    1: [
      { s: () => SPR.cloud(2), x: 4, y: 6, w: 36, m: 'drift', d: 150, o: 0.6 },
      { s: () => SPR.cloud(3), x: 60, y: 14, w: 26, m: 'drift', d: 190, o: 0.45 },
      { s: () => SPR.ring(1.5), x: 14, y: 60, w: 11, m: 'bob', d: 7, o: 0.7 },
      { s: () => SPR.ring(2.5), x: 74, y: 72, w: 7, m: 'bob', d: 9, o: 0.55 },
      { s: () => SPR.balloon('#a8d8ff', 2), x: 84, y: 34, w: 5, m: 'rise', d: 70, o: 0.6 },
      { s: () => SPR.balloon('#ffb3d0', 3), x: 8, y: 30, w: 4, m: 'rise', d: 95, o: 0.5 },
    ],
    2: [
      { s: () => SPR.balloon('#ff3b5c', 2), x: 18, y: 60, w: 5, m: 'rise', d: 60, o: 0.55 },
      { s: () => SPR.balloon('#ff6ad5', 3), x: 78, y: 70, w: 4, m: 'rise', d: 80, o: 0.45 },
      { s: () => SPR.balloon('#ff3b5c', 4), x: 50, y: 85, w: 3, m: 'rise', d: 110, o: 0.35 },
      { s: () => SPR.star('#ff7ab8', 3), x: 86, y: 22, w: 4, m: 'bob', d: 6, o: 0.5 },
    ],
    3: [
      { s: () => SPR.sun(2), x: 70, y: 6, w: 22, m: 'bob', d: 14, o: 0.8 },
      { s: () => SPR.cloud(1.5), x: -6, y: 10, w: 42, m: 'drift', d: 160, o: 0.85 },
      { s: () => SPR.cloud(2.5), x: 48, y: 22, w: 30, m: 'drift', d: 210, o: 0.7 },
      { s: () => SPR.cloud(3.5), x: 20, y: 36, w: 22, m: 'drift', d: 260, o: 0.55 },
      { s: () => SPR.cloud(1.5), x: 70, y: 52, w: 34, m: 'drift', d: 180, o: 0.6 },
      { s: () => SPR.door(1.2), x: 76, y: 44, w: 9, m: 'bob', d: 11, o: 0.85 },
      { s: () => SPR.tv(1.4), x: 8, y: 52, w: 11, m: 'bob', d: 9, o: 0.75 },
      { s: () => SPR.ring(1.2), x: 82, y: 76, w: 10, m: 'bob', d: 8, o: 0.8 },
      { s: () => SPR.balloon('#ffb3d0', 1.5), x: 26, y: 70, w: 5, m: 'rise', d: 85, o: 0.7 },
      { s: () => SPR.balloon('#b8e0ff', 2.5), x: 60, y: 80, w: 4, m: 'rise', d: 110, o: 0.6 },
      { s: () => SPR.star('#fff1a8', 2), x: 14, y: 14, w: 4, m: 'bob', d: 5, o: 0.8 },
      { s: () => SPR.star('#ffd0f0', 2), x: 40, y: 8, w: 3, m: 'bob', d: 7, o: 0.7 },
      { s: () => SPR.moon(1.5), x: 4, y: 2, w: 9, m: 'bob', d: 12, o: 0.6 },
    ],
  };

  function buildFar() {
    const scs = document.querySelectorAll('#scene .sc');
    scs.forEach((sc, i) => {
      const list = FAR[i];
      if (!list) return;
      const box = document.createElement('div');
      box.className = 'far';
      list.forEach((o, k) => {
        const img = new Image();
        img.alt = '';
        img.src = o.s();
        img.className = 'fo m-' + o.m;
        img.style.left = o.x + '%';
        img.style.top = o.y + '%';
        img.style.width = o.w + 'vmin';
        img.style.opacity = o.o;
        img.style.setProperty('--d', o.d + 's');
        img.style.setProperty('--dl', -((k * 7.3) % o.d) + 's');
        box.appendChild(img);
      });
      sc.appendChild(box);
    });
  }

  // ---------------------------------------------------------------- film: halation, leaks, grain
  function buildFilm() {
    const f = document.createElement('div');
    f.id = 'dream';
    f.innerHTML = '<div class="halo"></div><div class="leak a"></div><div class="leak b"></div><div class="grain"></div>';
    const app = document.getElementById('app');
    app.insertBefore(f, document.getElementById('fxFront'));
    // grain tile
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const g = c.getContext('2d');
    const id = g.createImageData(160, 160);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = Math.random() * 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = Math.random() < 0.5 ? 40 : 0;
    }
    g.putImageData(id, 0, 0);
    f.querySelector('.grain').style.backgroundImage = `url(${c.toDataURL()})`;
  }

  // ---------------------------------------------------------------- touch: ripples & trails
  const PASTEL = ['#ffb3e6', '#b8e8ff', '#fff1a8', '#d8c4ff', '#c4ffe4'];
  let lastTrail = { x: 0, y: 0 };
  D.trail = function (x, y) {
    if (L.FX.isCalm()) return;
    if (Math.hypot(x - lastTrail.x, y - lastTrail.y) < 14) return;
    lastTrail = { x, y };
    L.FX.burst(x, y, 'dream', 2, { grav: -50, speed: 0.25, life: 1.2, size: 0.8 });
  };
  function ripple(e) {
    if (L.FX.isCalm()) return;
    const col = PASTEL[(Math.random() * PASTEL.length) | 0];
    L.FX.ring(e.clientX, e.clientY, col, 42, 0.55, 3);
    L.FX.burst(e.clientX, e.clientY, 'dream', 3, { grav: -40, speed: 0.3, life: 0.8, size: 0.7 });
  }

  // ---------------------------------------------------------------- holographic foil that follows the finger
  D.tilt = function (card) {
    if (!card) return;
    card.classList.add('tilt');
    const move = (e) => {
      const r = card.getBoundingClientRect();
      const px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      card.style.setProperty('--hx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--hy', (py * 100).toFixed(1) + '%');
      card.style.transform = `perspective(900px) rotateY(${((px - 0.5) * 16).toFixed(2)}deg) rotateX(${((0.5 - py) * 14).toFixed(2)}deg)`;
      card.classList.add('held');
    };
    const host = card.parentNode;
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerleave', () => { card.style.transform = ''; card.classList.remove('held'); });
  };

  D.init = function () {
    buildFar();
    buildFilm();
    window.addEventListener('pointerdown', ripple, { passive: true });
  };
})();
