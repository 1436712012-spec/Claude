/* LIMINAL · ornate card frames, gems and badges (SVG, generated once per combination) */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const F = (L.Frames = {});
  const cache = {};
  const uri = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  // metal = bevelled frame band; body = dark card base; paper = text panel; ribbon = name banner
  const MAT = {
    site: { metal: ['#f4fbfd', '#8fb0b8', '#e9f6f8', '#4d6d75', '#cfe5ea'], body: ['#24434c', '#0f2328'], paper: ['#eef7f6', '#cfe3e3'], ribbon: ['#3d6670', '#1c3940'], ink: '#10262c', glow: '#9ff3ff' },
    level: { metal: ['#fff3c0', '#b38f2a', '#f7e08e', '#6e500e', '#e9cd6c'], body: ['#4a3a14', '#211806'], paper: ['#f3e6b8', '#dcc88a'], ribbon: ['#6e5518', '#3a2c08'], ink: '#2b2310', glow: '#f2d64b' },
    dream: { metal: ['#fff6fd', '#d3a2d6', '#ffffff', '#9a6cb8', '#f3d6f0'], body: ['#4a2d5a', '#23142c'], paper: ['#fbf0fa', '#e8d6f0'], ribbon: ['#7a4a8e', '#41234f'], ink: '#43264f', glow: '#ffb3e6' },
    neutral: { metal: ['#f1e3c3', '#9a7f52', '#e8d6ae', '#5a4526', '#d8c094'], body: ['#3a3226', '#18140e'], paper: ['#efe5cd', '#d9cba8'], ribbon: ['#5e4a2c', '#2e2416'], ink: '#2a2620', glow: '#efe6cf' },
  };
  const RAR = { common: null, rare: '#5aa8ff', epic: '#b26bff', legendary: '#ffc84a' };
  F.MAT = MAT;

  function grads(m, r) {
    const [a, b, c, d, e] = m.metal;
    return `<linearGradient id="mt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".22" stop-color="${b}"/><stop offset=".45" stop-color="${c}"/><stop offset=".7" stop-color="${d}"/><stop offset="1" stop-color="${e}"/></linearGradient>
<linearGradient id="mt2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${d}"/><stop offset=".5" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<linearGradient id="bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.body[0]}"/><stop offset="1" stop-color="${m.body[1]}"/></linearGradient>
<linearGradient id="pp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.paper[0]}"/><stop offset="1" stop-color="${m.paper[1]}"/></linearGradient>
<linearGradient id="rb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.ribbon[0]}"/><stop offset=".55" stop-color="${m.ribbon[1]}"/><stop offset="1" stop-color="${m.ribbon[0]}"/></linearGradient>
<radialGradient id="pv" cx=".5" cy=".45" r=".7"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.6" flood-color="#000" flood-opacity=".6"/></filter>
<filter id="gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
<pattern id="tx" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8 8 0" stroke="#fff" stroke-opacity=".04" stroke-width="1"/></pattern>
${r ? `<radialGradient id="rg"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="${r}"/><stop offset="1" stop-color="${r}" stop-opacity=".2"/></radialGradient>` : ''}`;
  }

  function rivets(cx, cy, rx, ry, n) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.3" fill="url(#mt2)" stroke="#000" stroke-opacity=".5" stroke-width=".6"/><circle cx="${(x - 0.6).toFixed(1)}" cy="${(y - 0.7).toFixed(1)}" r=".8" fill="#fff" opacity=".8"/>`;
    }
    return s;
  }

  // window geometry per type, in the 200×280 frame space
  const WIN = {
    minion: { kind: 'ellipse', cx: 100, cy: 86, rx: 72, ry: 79 },
    spell: { kind: 'rect', x: 24, y: 20, w: 152, h: 120, r: 22 },
    field: { kind: 'poly', pts: [[20, 18], [180, 18], [166, 140], [34, 140]] },
  };
  F.WIN = WIN;

  F.frame = function (faction, rarity, type, layer) {
    layer = layer || 'back';
    const k = faction + rarity + type + layer;
    if (cache[k]) return cache[k];
    const m = MAT[faction];
    const r = RAR[rarity];
    const w = WIN[type];
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" width="400" height="560"><defs>${grads(m, r)}</defs>`;
    // rarity aura
    if (r) s += `<rect x="4" y="4" width="192" height="272" rx="18" fill="none" stroke="${r}" stroke-width="6" opacity="${rarity === 'legendary' ? 0.75 : 0.5}" filter="url(#gl)"/>`;
    // body
    const bodyPath = type === 'minion'
      ? 'M24 8 H176 Q192 8 192 24 V258 Q192 272 178 272 H22 Q8 272 8 258 V24 Q8 8 24 8 Z'
      : type === 'spell'
      ? 'M100 6 L184 14 Q193 15 193 26 V256 Q193 272 178 272 H22 Q7 272 7 256 V26 Q7 15 16 14 Z'
      : 'M14 8 H186 Q194 8 194 18 V262 Q194 272 184 272 H16 Q6 272 6 262 V18 Q6 8 14 8 Z';
    s += `<path d="${bodyPath}" fill="url(#bd)"/><path d="${bodyPath}" fill="url(#tx)"/>`;
    s += `<path d="${bodyPath}" fill="none" stroke="#000" stroke-width="9" stroke-opacity=".55"/>`;
    s += `<path d="${bodyPath}" fill="none" stroke="url(#mt)" stroke-width="6"/>`;
    s += `<path d="${bodyPath}" fill="none" stroke="#fff" stroke-width=".8" stroke-opacity=".5" transform="translate(-.6 -.6)"/>`;
    // corner studs
    for (const [x, y] of [[20, 20], [180, 20], [20, 260], [180, 260]]) s += `<path d="M${x} ${y - 4} L${x + 4} ${y} L${x} ${y + 4} L${x - 4} ${y} Z" fill="url(#mt2)" stroke="#000" stroke-opacity=".4" stroke-width=".6"/>`;
    // text panel
    s += `<rect x="20" y="168" width="160" height="90" rx="11" fill="#000" opacity=".45" transform="translate(0 2)"/>`;
    s += `<rect x="20" y="168" width="160" height="90" rx="11" fill="url(#pp)" stroke="url(#mt)" stroke-width="3"/>`;
    s += `<rect x="20" y="168" width="160" height="90" rx="11" fill="url(#pv)"/>`;
    s += `<rect x="70" y="262" width="60" height="11" rx="3" fill="url(#mt2)" stroke="#000" stroke-opacity=".45" stroke-width=".8"/>`;
    if (layer === 'back') { s += `</svg>`; return (cache[k] = uri(s)); }
    // ---- front layer: everything drawn over the illustration
    s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" width="400" height="560"><defs>${grads(m, r)}</defs>`;
    // art window bezel (the art itself is a separate element clipped to the same shape)
    if (w.kind === 'ellipse') {
      s += `<ellipse cx="${w.cx}" cy="${w.cy + 2}" rx="${w.rx + 7}" ry="${w.ry + 7}" fill="none" stroke="#000" stroke-width="7" stroke-opacity=".55"/>`;
      s += `<ellipse cx="${w.cx}" cy="${w.cy}" rx="${w.rx + 5}" ry="${w.ry + 5}" fill="none" stroke="url(#mt)" stroke-width="9"/>`;
      s += `<ellipse cx="${w.cx}" cy="${w.cy}" rx="${w.rx + 0.5}" ry="${w.ry + 0.5}" fill="none" stroke="#000" stroke-width="2" stroke-opacity=".7"/>`;
      s += `<ellipse cx="${w.cx}" cy="${w.cy}" rx="${w.rx + 9}" ry="${w.ry + 9}" fill="none" stroke="#fff" stroke-width=".7" stroke-opacity=".45"/>`;
      s += rivets(w.cx, w.cy, w.rx + 5, w.ry + 5, 10);
    } else if (w.kind === 'rect') {
      s += `<rect x="${w.x - 7}" y="${w.y - 5}" width="${w.w + 14}" height="${w.h + 14}" rx="${w.r + 6}" fill="none" stroke="#000" stroke-width="7" stroke-opacity=".55"/>`;
      s += `<rect x="${w.x - 5}" y="${w.y - 5}" width="${w.w + 10}" height="${w.h + 10}" rx="${w.r + 5}" fill="none" stroke="url(#mt)" stroke-width="9"/>`;
      s += `<rect x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" rx="${w.r}" fill="none" stroke="#000" stroke-width="2" stroke-opacity=".7"/>`;
      for (const [x, y] of [[w.x + 4, w.y + 4], [w.x + w.w - 4, w.y + 4], [w.x + 4, w.y + w.h - 4], [w.x + w.w - 4, w.y + w.h - 4]]) s += `<circle cx="${x}" cy="${y}" r="3" fill="url(#mt2)" stroke="#000" stroke-opacity=".5" stroke-width=".6"/>`;
      // a spell's pointed crest
      s += `<path d="M86 10 L100 0 L114 10 L100 18 Z" fill="url(#mt2)" stroke="#000" stroke-opacity=".5" stroke-width=".8"/><circle cx="100" cy="9" r="3" fill="${m.glow}"/>`;
    } else {
      const p = w.pts.map((q) => q.join(',')).join(' ');
      s += `<polygon points="${p}" fill="none" stroke="#000" stroke-width="14" stroke-opacity=".55" stroke-linejoin="round"/>`;
      s += `<polygon points="${p}" fill="none" stroke="url(#mt)" stroke-width="9" stroke-linejoin="round"/>`;
      s += `<polygon points="${p}" fill="none" stroke="#000" stroke-width="2" stroke-opacity=".7"/>`;
      s += `<rect x="70" y="134" width="60" height="12" rx="3" fill="url(#mt2)" stroke="#000" stroke-opacity=".5"/><text x="100" y="143" font-family="monospace" font-weight="700" font-size="8" text-anchor="middle" fill="#2b2310" letter-spacing="2">LOCATION</text>`;
    }
    // name ribbon with folded tails
    const ry = type === 'minion' ? 150 : 146;
    s += `<path d="M4 ${ry + 6} L18 ${ry + 2} L18 ${ry + 22} L4 ${ry + 20} L10 ${ry + 13} Z" fill="${m.ribbon[1]}" stroke="url(#mt)" stroke-width="1.5"/>`;
    s += `<path d="M196 ${ry + 6} L182 ${ry + 2} L182 ${ry + 22} L196 ${ry + 20} L190 ${ry + 13} Z" fill="${m.ribbon[1]}" stroke="url(#mt)" stroke-width="1.5"/>`;
    s += `<path d="M14 ${ry + 4} Q100 ${ry - 16} 186 ${ry + 4} L186 ${ry + 24} Q100 ${ry + 4} 14 ${ry + 24} Z" fill="url(#rb)" stroke="url(#mt)" stroke-width="2.4" filter="url(#sh)"/>`;
    s += `<path d="M18 ${ry + 7} Q100 ${ry - 12} 182 ${ry + 7}" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1"/>`;
    // rarity gem on the ribbon
    if (r) s += `<g transform="translate(100 ${ry + 16})"><path d="M0 -7 L6 0 L0 7 L-6 0 Z" fill="url(#rg)" stroke="#000" stroke-opacity=".6" stroke-width=".8"/><path d="M0 -7 L6 0 L0 0 Z" fill="#fff" opacity=".45"/></g>`;
    else s += `<g transform="translate(100 ${ry + 16})"><path d="M0 -6 L5 0 L0 6 L-5 0 Z" fill="#cfc8b8" stroke="#000" stroke-opacity=".6" stroke-width=".8"/></g>`;
    // legendary crest: a winged seal with an open eye
    if (rarity === 'legendary') {
      s += `<g transform="translate(100 6)" filter="url(#sh)">`;
      s += `<path d="M-46 14 Q-30 -6 -8 4 Q-22 2 -30 14 Q-38 10 -46 14 Z" fill="url(#mt)" stroke="#5a3e00" stroke-width="1"/>`;
      s += `<path d="M46 14 Q30 -6 8 4 Q22 2 30 14 Q38 10 46 14 Z" fill="url(#mt)" stroke="#5a3e00" stroke-width="1"/>`;
      s += `<path d="M-14 12 Q0 -14 14 12 Z" fill="url(#mt2)" stroke="#5a3e00" stroke-width="1"/>`;
      s += `<path d="M-8 6 Q0 -1 8 6 Q0 13 -8 6 Z" fill="#fff8dc"/><circle cx="0" cy="6" r="2.6" fill="${m.glow}"/><circle cx="0" cy="6" r="1.1" fill="#111"/></g>`;
    } else if (rarity === 'epic') {
      s += `<g transform="translate(100 5)"><path d="M-16 8 L0 -4 L16 8 L0 4 Z" fill="url(#mt)" stroke="#000" stroke-opacity=".5"/><circle cx="0" cy="3" r="2.4" fill="${r}"/></g>`;
    }
    s += `</svg>`;
    return (cache[k] = uri(s));
  };

  // ---------------------------------------------------------------- gems & badges
  F.gem = function (kind) {
    const k = 'g:' + kind;
    if (cache[k]) return cache[k];
    let s = '';
    if (kind === 'mana') {
      // faceted hexagonal crystal
      const pts = [];
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 3; pts.push([50 + Math.cos(a) * 46, 50 + Math.sin(a) * 46]); }
      const shades = ['#b9e6ff', '#7cc4ff', '#3d8fe0', '#1d5fae', '#2a74c8', '#8ed0ff'];
      s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="c" cx=".35" cy=".3"><stop offset="0" stop-color="#e8f7ff"/><stop offset="1" stop-color="#2a74c8"/></radialGradient></defs>`;
      s += `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="#0b2442" transform="translate(0 3)" opacity=".6"/>`;
      for (let i = 0; i < 6; i++) { const a = pts[i], b = pts[(i + 1) % 6]; s += `<polygon points="50,50 ${a.join(',')} ${b.join(',')}" fill="${shades[i]}"/>`; }
      s += `<polygon points="${pts.map((p) => [50 + (p[0] - 50) * 0.5, 50 + (p[1] - 50) * 0.5].join(',')).join(' ')}" fill="url(#c)" opacity=".9"/>`;
      s += `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#0b2442" stroke-width="3"/><polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#dff3ff" stroke-width="1" opacity=".7"/></svg>`;
    } else if (kind === 'san') {
      s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 92"><polygon points="50,4 96,88 4,88" fill="#1a0b33" transform="translate(0 3)" opacity=".6"/><polygon points="50,4 50,62 4,88" fill="#d7b8ff"/><polygon points="50,4 96,88 50,62" fill="#8a56e0"/><polygon points="4,88 96,88 50,62" fill="#5a2fb0"/><polygon points="50,30 70,72 30,72" fill="none" stroke="#fff" stroke-width="3" opacity=".75"/><polygon points="50,4 96,88 4,88" fill="none" stroke="#1a0b33" stroke-width="3"/></svg>`;
    } else if (kind === 'atk') {
      s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="a" cx=".38" cy=".32"><stop offset="0" stop-color="#fff1b0"/><stop offset=".55" stop-color="#e2a024"/><stop offset="1" stop-color="#7a4600"/></radialGradient></defs><circle cx="50" cy="53" r="45" fill="#2a1600" opacity=".6"/><circle cx="50" cy="50" r="45" fill="url(#a)" stroke="#3e2200" stroke-width="4"/>` +
        `<path d="M70 18 L80 28 L42 66 L34 58 Z" fill="#fff6d8" opacity=".55"/><path d="M30 60 L40 70 L28 82 L18 72 Z" fill="#5a3000" opacity=".5"/><circle cx="50" cy="50" r="41" fill="none" stroke="#fff4c0" stroke-width="1.6" opacity=".6"/></svg>`;
    } else if (kind === 'hp') {
      s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110"><defs><radialGradient id="h" cx=".38" cy=".4"><stop offset="0" stop-color="#ffb3b3"/><stop offset=".55" stop-color="#d42c3a"/><stop offset="1" stop-color="#5a0008"/></radialGradient></defs><path d="M50 8 C62 30 92 50 92 72 A42 34 0 0 1 8 72 C8 50 38 30 50 8 Z" fill="#300004" transform="translate(0 3)" opacity=".6"/><path d="M50 8 C62 30 92 50 92 72 A42 34 0 0 1 8 72 C8 50 38 30 50 8 Z" fill="url(#h)" stroke="#3a0004" stroke-width="4"/><path d="M34 52 C38 40 44 32 48 26" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".45" fill="none"/></svg>`;
    } else if (kind === 'armor') {
      s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110"><defs><linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#9aa8ae"/><stop offset="1" stop-color="#4a575c"/></linearGradient></defs><path d="M50 6 L92 18 L86 66 Q78 92 50 104 Q22 92 14 66 L8 18 Z" fill="url(#r)" stroke="#1c2426" stroke-width="4"/><path d="M50 16 L80 25 L76 64 Q70 84 50 94" fill="none" stroke="#fff" stroke-width="2" opacity=".5"/></svg>`;
    }
    return (cache[k] = uri(s));
  };

  // oval token bezel for board minions
  F.bezel = function (faction, rarity) {
    const k = 'z:' + faction + rarity;
    if (cache[k]) return cache[k];
    const m = MAT[faction];
    const r = RAR[rarity];
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 150" width="260" height="300"><defs>${grads(m, r)}</defs>`;
    if (r) s += `<ellipse cx="65" cy="72" rx="62" ry="70" fill="none" stroke="${r}" stroke-width="5" opacity=".6" filter="url(#gl)"/>`;
    s += `<ellipse cx="65" cy="74" rx="58" ry="66" fill="none" stroke="#000" stroke-width="11" stroke-opacity=".55"/>`;
    s += `<ellipse cx="65" cy="72" rx="57" ry="65" fill="none" stroke="url(#mt)" stroke-width="8"/>`;
    s += `<ellipse cx="65" cy="72" rx="52.5" ry="60.5" fill="none" stroke="#000" stroke-width="1.6" stroke-opacity=".7"/>`;
    s += rivets(65, 72, 57, 65, 8);
    if (rarity === 'legendary') s += `<g transform="translate(65 6)"><path d="M-30 12 Q-18 -4 -4 4 Q-14 4 -20 12 Z M30 12 Q18 -4 4 4 Q14 4 20 12 Z" fill="url(#mt)" stroke="#5a3e00"/><path d="M-9 10 Q0 -8 9 10 Z" fill="url(#mt2)" stroke="#5a3e00"/><circle cx="0" cy="6" r="2.2" fill="${m.glow}"/></g>`;
    s += `</svg>`;
    return (cache[k] = uri(s));
  };

  // curved name on the ribbon
  F.nameSVG = function (name, type, faction) {
    const len = Array.from(name).length;
    const size = len <= 5 ? 15 : len <= 7 ? 13.5 : len <= 9 ? 11.5 : len <= 12 ? 9.6 : 8.4;
    const y = 24;
    const id = 'np' + Math.random().toString(36).slice(2, 8);
    return `<svg viewBox="0 0 200 40" preserveAspectRatio="none"><defs><path id="${id}" d="M16 ${y} Q100 ${y - 19} 184 ${y}"/></defs><text font-family="'Noto Serif SC','Songti SC',serif" font-weight="900" font-size="${size}" fill="#fff8e6" stroke="#0a0604" stroke-width="3.2" paint-order="stroke" stroke-linejoin="round" text-anchor="middle" letter-spacing=".5"><textPath href="#${id}" startOffset="50%">${L.CV.esc(name)}</textPath></text></svg>`;
  };
})();
