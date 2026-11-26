/* LIMINAL · procedural card art. Scene + motifs + distortion, built as SVG and rasterized once. */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const U = L.U;
  const W = 200, H = 140;
  const Art = (L.Art = {});

  // ---------------------------------------------------------------- palettes
  const PAL = {
    site: { a: '#e9f7f8', b: '#9ff3ff', c: '#3c6f7a', d: '#10262c', glow: '#bff8ff', warn: '#ff3b4e' },
    level: { a: '#e8d48a', b: '#c9b25f', c: '#8a7434', d: '#2b2310', glow: '#fffbe0', warn: '#2d2a12' },
    dream: { a: '#ffe3f4', b: '#d9c6ff', c: '#a9e5ff', d: '#4a2a58', glow: '#fff4fd', warn: '#ff7ac8' },
    neutral: { a: '#ece4d0', b: '#b9ae94', c: '#6d6553', d: '#24211b', glow: '#fff8e8', warn: '#e05a3a' },
  };

  // ---------------------------------------------------------------- helpers
  const f1 = (n) => Math.round(n * 10) / 10;
  const X = (v) => f1(v * W);
  const Y = (v) => f1(v * H);
  function parse(spec) {
    // 'motif k1 k2v' → {m, o:{}}
    const parts = spec.trim().split(/\s+/);
    const o = {};
    for (const p of parts.slice(1)) {
      const mm = /^([a-z]+)(.*)$/.exec(p);
      if (!mm) continue;
      const k = mm[1],
        v = mm[2];
      if (v === '') o[k] = 1;
      else if (v[0] === '#') o[k] = v;
      else o[k] = parseFloat(v);
    }
    return { m: parts[0], o };
  }
  function shade(hex, amt) {
    // amt -1..1 (darken..lighten)
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
    const n = parseInt(full, 16);
    let r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    if (amt >= 0) {
      r += (255 - r) * amt;
      g += (255 - g) * amt;
      b += (255 - b) * amt;
    } else {
      r *= 1 + amt;
      g *= 1 + amt;
      b *= 1 + amt;
    }
    return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  }
  Art.shade = shade;

  // ---------------------------------------------------------------- scenes
  function persp(vx, vy) {
    // one-point perspective room: returns polygons for ceiling, walls, floor, back
    const bw = 34,
      bh = 26;
    const bx0 = vx - bw / 2,
      bx1 = vx + bw / 2,
      by0 = vy - bh / 2,
      by1 = vy + bh / 2;
    return {
      back: [bx0, by0, bx1, by1],
      ceil: `0,0 ${W},0 ${bx1},${by0} ${bx0},${by0}`,
      floor: `0,${H} ${W},${H} ${bx1},${by1} ${bx0},${by1}`,
      lw: `0,0 ${bx0},${by0} ${bx0},${by1} 0,${H}`,
      rw: `${W},0 ${bx1},${by0} ${bx1},${by1} ${W},${H}`,
      vx,
      vy,
      bx0,
      bx1,
      by0,
      by1,
    };
  }
  const SCENES = {
    hall(r, ctx) {
      const p = persp(100 + r.range(-14, 14), 60 + r.range(-6, 6));
      ctx.room = p;
      let s = `<defs><linearGradient id="hw" x1="0" x2="1"><stop offset="0" stop-color="#cdb865"/><stop offset=".5" stop-color="#e7d488"/><stop offset="1" stop-color="#c4ae5c"/></linearGradient>
      <pattern id="wp" width="6" height="10" patternUnits="userSpaceOnUse"><rect width="6" height="10" fill="none"/><path d="M3 0v10" stroke="#a89548" stroke-width=".5" opacity=".5"/><circle cx="0" cy="5" r=".7" fill="#a89548" opacity=".35"/></pattern></defs>`;
      s += `<rect width="${W}" height="${H}" fill="#d9c577"/>`;
      s += `<polygon points="${p.ceil}" fill="#efe6bd"/>`;
      s += `<polygon points="${p.lw}" fill="url(#hw)"/><polygon points="${p.lw}" fill="url(#wp)"/>`;
      s += `<polygon points="${p.rw}" fill="url(#hw)"/><polygon points="${p.rw}" fill="url(#wp)"/>`;
      s += `<polygon points="${p.floor}" fill="#8f7d45"/>`;
      // carpet stains
      for (let i = 0; i < 4; i++) s += `<ellipse cx="${f1(r.range(30, 170))}" cy="${f1(r.range(110, 135))}" rx="${f1(r.range(8, 20))}" ry="${f1(r.range(2, 5))}" fill="#6f5f30" opacity=".35"/>`;
      s += `<rect x="${f1(p.bx0)}" y="${f1(p.by0)}" width="${f1(p.bx1 - p.bx0)}" height="${f1(p.by1 - p.by0)}" fill="#b8a456"/>`;
      // wall seams
      for (let i = 1; i < 5; i++) {
        const t = i / 5;
        const x0 = f1(p.bx0 * t),
          y0 = f1(p.by0 * t),
          y1 = f1(H - (H - p.by1) * t);
        s += `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="#9e8c45" stroke-width=".6" opacity=".6"/>`;
        const x1 = f1(W - (W - p.bx1) * t);
        s += `<line x1="${x1}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#9e8c45" stroke-width=".6" opacity=".6"/>`;
      }
      if (!ctx.hasTubes) s += M.tubes(r, { n: 3 }, ctx);
      return s;
    },
    office(r, ctx) {
      const p = persp(100 + r.range(-10, 10), 58);
      ctx.room = p;
      let s = `<rect width="${W}" height="${H}" fill="#cfc7a8"/>`;
      s += `<polygon points="${p.ceil}" fill="#e6e2cf"/>`;
      s += `<polygon points="${p.lw}" fill="#c2b98f"/><polygon points="${p.rw}" fill="#bdb48a"/>`;
      s += `<polygon points="${p.floor}" fill="#7c7a63"/>`;
      for (let i = 0; i < 9; i++) {
        const t = i / 9;
        const y = f1(p.by1 + (H - p.by1) * t * t);
        s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#6a6852" stroke-width=".4" opacity=".5"/>`;
      }
      s += `<rect x="${f1(p.bx0)}" y="${f1(p.by0)}" width="${f1(p.bx1 - p.bx0)}" height="${f1(p.by1 - p.by0)}" fill="#a9a280"/>`;
      return s;
    },
    pool(r, ctx) {
      let s = `<defs><linearGradient id="pw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfeef3"/><stop offset="1" stop-color="#7fd0dc"/></linearGradient>
      <linearGradient id="pq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb4c8" stop-opacity=".75"/><stop offset="1" stop-color="#0f5f73" stop-opacity=".95"/></linearGradient>
      <pattern id="pt" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="none" stroke="#e8fbff" stroke-width=".6" opacity=".7"/></pattern></defs>`;
      s += `<rect width="${W}" height="${H}" fill="url(#pw)"/><rect width="${W}" height="${H}" fill="url(#pt)"/>`;
      const wl = f1(H * r.range(0.5, 0.6));
      s += `<rect y="${wl}" width="${W}" height="${f1(H - wl)}" fill="url(#pq)"/>`;
      for (let i = 0; i < 10; i++) {
        const y = f1(wl + 4 + i * r.range(5, 8));
        let d = `M0 ${y}`;
        for (let x = 0; x <= W; x += 20) d += ` Q${x + 10} ${f1(y + r.range(-3, 3))} ${x + 20} ${y}`;
        s += `<path d="${d}" fill="none" stroke="#e8ffff" stroke-width="${f1(r.range(0.4, 1.2))}" opacity="${f1(r.range(0.15, 0.45))}"/>`;
      }
      s += `<rect y="${f1(wl - 1)}" width="${W}" height="2" fill="#fff" opacity=".6"/>`;
      ctx.water = wl;
      return s;
    },
    mall(r, ctx) {
      let s = `<defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14060b"/><stop offset=".62" stop-color="#2a0c14"/><stop offset="1" stop-color="#07030a"/></linearGradient></defs>`;
      s += `<rect width="${W}" height="${H}" fill="url(#mg)"/>`;
      const cols = ['#ff2a4d', '#ff3ec8', '#3ef0ff', '#ffd23e'];
      for (let i = 0; i < 5; i++) {
        const x = f1(i * 42 + r.range(-4, 4)),
          w = f1(r.range(26, 36)),
          y = f1(r.range(26, 40)),
          h = f1(r.range(34, 46));
        const c = r.pick(cols);
        s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1b0910" stroke="${c}" stroke-width=".8" opacity=".9"/>`;
        for (let k = 0; k < 6; k++) s += `<line x1="${x}" y1="${f1(y + 4 + k * 6)}" x2="${f1(x + w)}" y2="${f1(y + 4 + k * 6)}" stroke="#3a1a22" stroke-width="1"/>`;
        s += `<rect x="${f1(x + 3)}" y="${f1(y - 7)}" width="${f1(w - 6)}" height="4" fill="${c}" opacity=".85" filter="url(#glw)"/>`;
      }
      s += `<rect y="${f1(H * 0.74)}" width="${W}" height="${f1(H * 0.26)}" fill="#12060a"/>`;
      for (let i = 0; i < 7; i++) s += `<rect x="${f1(r.range(0, W))}" y="${f1(H * 0.76 + r.range(0, 20))}" width="${f1(r.range(6, 24))}" height="1" fill="${r.pick(cols)}" opacity=".35"/>`;
      return s;
    },
    lab(r, ctx) {
      const p = persp(100 + r.range(-8, 8), 56);
      ctx.room = p;
      let s = `<defs><pattern id="lg" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="#9fd8e0" stroke-width=".4" opacity=".6"/></pattern></defs>`;
      s += `<rect width="${W}" height="${H}" fill="#dbeef0"/>`;
      s += `<polygon points="${p.ceil}" fill="#f4fbfb"/>`;
      s += `<polygon points="${p.lw}" fill="#cfe6e9"/><polygon points="${p.rw}" fill="#c7e0e4"/>`;
      s += `<polygon points="${p.lw}" fill="url(#lg)"/><polygon points="${p.rw}" fill="url(#lg)"/>`;
      s += `<polygon points="${p.floor}" fill="#9fb8bc"/>`;
      s += `<rect x="${f1(p.bx0)}" y="${f1(p.by0)}" width="${f1(p.bx1 - p.bx0)}" height="${f1(p.by1 - p.by0)}" fill="#a8c7cc"/>`;
      // hazard stripe at floor line
      s += `<polygon points="0,${H} ${f1(p.bx0)},${f1(p.by1)} ${f1(p.bx0)},${f1(p.by1 - 2)} 0,${H - 6}" fill="#ff3b4e" opacity=".55"/>`;
      return s;
    },
    cell(r) {
      let s = `<rect width="${W}" height="${H}" fill="#1d2629"/>`;
      s += `<rect y="${H * 0.78}" width="${W}" height="${H * 0.22}" fill="#141b1d"/>`;
      for (let x = 10; x < W; x += 18) s += `<rect x="${x}" y="0" width="4" height="${H}" fill="#526266"/><rect x="${x}" y="0" width="1.2" height="${H}" fill="#9fb4b8" opacity=".6"/>`;
      s += `<rect width="${W}" height="8" fill="#3c4a4e"/><rect y="${H - 26}" width="${W}" height="5" fill="#3c4a4e"/>`;
      return s;
    },
    sky(r) {
      let s = `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe8ff"/><stop offset=".55" stop-color="#ffd3ee"/><stop offset="1" stop-color="#fff0d6"/></linearGradient></defs>`;
      s += `<rect width="${W}" height="${H}" fill="url(#sk)"/>`;
      for (let i = 0; i < 4; i++) s += cloud(r.range(10, 190), r.range(15, 70), r.range(0.6, 1.3), 0.7);
      return s;
    },
    room(r) {
      let s = `<defs><pattern id="rp" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#f6dcef"/><circle cx="4" cy="4" r="1.3" fill="#fff" opacity=".7"/><circle cx="12" cy="12" r="1" fill="#c9b5ff" opacity=".6"/></pattern></defs>`;
      s += `<rect width="${W}" height="${H}" fill="url(#rp)"/>`;
      s += `<rect y="${H * 0.72}" width="${W}" height="${H * 0.28}" fill="#d9b8a4"/><rect y="${H * 0.72}" width="${W}" height="2" fill="#fff" opacity=".6"/>`;
      return s;
    },
    kinder(r) {
      let s = `<rect width="${W}" height="${H}" fill="#f8e7c6"/>`;
      s += `<rect width="${W}" height="${H * 0.6}" fill="#f6d9d4"/>`;
      for (let x = 0; x < W; x += 24) s += `<rect x="${x}" y="${H * 0.56}" width="12" height="4" fill="#9fd3c7" opacity=".7"/>`;
      s += `<rect y="${H * 0.64}" width="${W}" height="${H * 0.36}" fill="#e2c196"/>`;
      return s;
    },
    void(r) {
      let s = `<defs><radialGradient id="vg"><stop offset="0" stop-color="#1c1a22"/><stop offset="1" stop-color="#050507"/></radialGradient></defs>`;
      s += `<rect width="${W}" height="${H}" fill="url(#vg)"/>`;
      return s;
    },
    park(r, ctx) {
      const p = persp(100 + r.range(-10, 10), 56);
      ctx.room = p;
      let s = `<rect width="${W}" height="${H}" fill="#24262a"/>`;
      s += `<polygon points="${p.ceil}" fill="#33363b"/><polygon points="${p.floor}" fill="#1a1b1e"/>`;
      s += `<polygon points="${p.lw}" fill="#2b2d31"/><polygon points="${p.rw}" fill="#2b2d31"/>`;
      for (let i = 0; i < 5; i++) {
        const t = 0.2 + i * 0.16;
        const x0 = f1(p.bx0 * (1 - t) + 0 * t),
          x1 = f1(p.bx1 * (1 - t) + W * t);
        s += `<rect x="${f1(x0 + 8 * (1 - t))}" y="${f1(p.by0 * (1 - t))}" width="${f1(4 + 6 * t)}" height="${f1(H - p.by0 * (1 - t) - (H - p.by1) * (1 - t))}" fill="#3b3e44"/>`;
        s += `<rect x="${f1(x1 - 8 * (1 - t) - 6 * t)}" y="${f1(p.by0 * (1 - t))}" width="${f1(4 + 6 * t)}" height="${f1(H - p.by0 * (1 - t) - (H - p.by1) * (1 - t))}" fill="#3b3e44"/>`;
      }
      s += `<line x1="${f1(p.vx)}" y1="${f1(p.by1)}" x2="${f1(p.vx)}" y2="${H}" stroke="#d8c94a" stroke-width="1.2" stroke-dasharray="5 6" opacity=".6"/>`;
      return s;
    },
    stair(r) {
      let s = `<rect width="${W}" height="${H}" fill="#bfb9a6"/>`;
      s += `<rect width="${W}" height="${H}" fill="#2a2822" opacity=".25"/>`;
      return s;
    },
  };

  function cloud(x, y, s, o) {
    return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})" opacity="${o}"><ellipse cx="0" cy="0" rx="18" ry="8" fill="#fff"/><ellipse cx="-10" cy="-4" rx="10" ry="8" fill="#fff"/><ellipse cx="8" cy="-6" rx="12" ry="9" fill="#fff"/></g>`;
  }

  // ---------------------------------------------------------------- motifs
  const M = {
    tubes(r, o, ctx) {
      ctx.hasTubes = true;
      const n = o.n || 6;
      const p = ctx.room || persp(100, 60);
      let s = '';
      const rows = Math.max(2, Math.ceil(n / (o.dense ? 3 : 2)));
      const perRow = o.dense ? 3 : 2;
      let k = 0;
      for (let i = 0; i < rows && k < n; i++) {
        const t = Math.pow(i / rows, 0.75);
        const y = f1(p.by0 * t + 4 * (1 - t));
        const span = (W * (1 - t) + (p.bx1 - p.bx0) * t) * 0.7;
        const w = f1(span / (perRow + 1));
        const h = f1(Math.max(1.2, 6 * (1 - t)));
        for (let j = 0; j < perRow && k < n; j++, k++) {
          const cx = p.vx + (j - (perRow - 1) / 2) * (span / perRow);
          const off = o.off && r() < 0.45;
          const col = off ? '#6b6237' : o.blaze ? '#ffffff' : '#fffbe6';
          s += `<rect x="${f1(cx - w / 2)}" y="${y}" width="${w}" height="${h}" rx="${f1(h / 3)}" fill="${col}" ${off ? '' : 'filter="url(#glw)"'} opacity="${off ? 0.7 : 0.95}"/>`;
        }
      }
      if (o.blaze) s += `<rect width="${W}" height="${H}" fill="#fff" opacity=".35"/>`;
      return s;
    },
    door(r, o, ctx) {
      const x = X(o.x || 0.5),
        w = (o.w || 0.3) * W,
        h = (o.h || 0.9) * H * 0.75;
      const base = Y(o.y ? o.y + 0.32 : 0.86);
      const top = base - h;
      const col = o.c || '#8b7a45';
      const bend = (o.bend || 0) * w;
      let s = '';
      if (o.glow) s += `<rect x="${f1(x - w / 2 - 6)}" y="${f1(top - 6)}" width="${f1(w + 12)}" height="${f1(h + 12)}" fill="#fff" opacity=".35" filter="url(#blr)"/>`;
      s += `<path d="M${f1(x - w / 2 - 3)} ${f1(base)} L${f1(x - w / 2 - 3 + bend)} ${f1(top - 3)} L${f1(x + w / 2 + 3 + bend)} ${f1(top - 3)} L${f1(x + w / 2 + 3)} ${f1(base)} Z" fill="${shade(col.slice(0, 7), -0.45)}"/>`;
      s += `<path d="M${f1(x - w / 2)} ${f1(base)} L${f1(x - w / 2 + bend)} ${f1(top)} L${f1(x + w / 2 + bend)} ${f1(top)} L${f1(x + w / 2)} ${f1(base)} Z" fill="${col}"/>`;
      s += `<path d="M${f1(x - w / 2 + 3)} ${f1(base - 4)} L${f1(x - w / 2 + 3 + bend * 0.95)} ${f1(top + 4)}" stroke="#fff" stroke-width=".8" opacity=".25"/>`;
      if (o.vault) {
        s += `<circle cx="${f1(x + bend * 0.5)}" cy="${f1((top + base) / 2)}" r="${f1(w * 0.22)}" fill="none" stroke="#2a3a40" stroke-width="2.2"/>`;
        for (let i = 0; i < 4; i++) s += `<line x1="${f1(x + bend * 0.5)}" y1="${f1((top + base) / 2)}" x2="${f1(x + bend * 0.5 + Math.cos(i * 1.57 + 0.4) * w * 0.22)}" y2="${f1((top + base) / 2 + Math.sin(i * 1.57 + 0.4) * w * 0.22)}" stroke="#2a3a40" stroke-width="2"/>`;
        for (let i = 0; i < 6; i++) s += `<rect x="${f1(x - w / 2 + i * (w / 6))}" y="${f1(base - 7)}" width="${f1(w / 12)}" height="6" fill="#ffd23e" opacity=".85"/>`;
      } else {
        s += `<circle cx="${f1(x + w * 0.32 + bend * 0.5)}" cy="${f1(top + h * 0.55)}" r="1.6" fill="#e7d9a0"/>`;
        s += `<rect x="${f1(x - w / 2)}" y="${f1(base - 1.5)}" width="${f1(w)}" height="1.5" fill="#fff6c8" opacity=".7" filter="url(#glw)"/>`;
      }
      return s;
    },
    legs(r, o) {
      const x = X(o.x || 0.5);
      return `<path d="M${x - 14} ${H} Q${x - 18} ${H - 14} ${x - 10} ${H - 20}" stroke="#3a3018" stroke-width="1.6" fill="none"/><path d="M${x + 14} ${H} Q${x + 20} ${H - 12} ${x + 10} ${H - 20}" stroke="#3a3018" stroke-width="1.6" fill="none"/>`;
    },
    faceless(r, o) {
      const x = X(o.x || 0.5),
        s = (o.s || 1) * 1.0;
      const base = Y(o.y != null ? o.y + 0.3 : 1.0);
      const c = o.c || '#2b2618';
      const hh = 46 * s;
      let g = '';
      let tf = `translate(${f1(x)} ${f1(base)})`;
      if (o.fall) tf += ' rotate(35)';
      if (o.run) tf += ' skewX(-14)';
      g += `<g transform="${tf}">`;
      if (o.half) g += `<clipPath id="hc${Math.floor(x)}"><rect x="-60" y="${f1(-hh * 1.6)}" width="${f1(60 + r.range(0, 8))}" height="${f1(hh * 2)}"/></clipPath><g clip-path="url(#hc${Math.floor(x)})">`;
      // shoulders/torso
      g += `<path d="M${f1(-18 * s)} 0 Q${f1(-18 * s)} ${f1(-hh * 0.62)} ${f1(-9 * s)} ${f1(-hh * 0.7)} L${f1(9 * s)} ${f1(-hh * 0.7)} Q${f1(18 * s)} ${f1(-hh * 0.62)} ${f1(18 * s)} 0 Z" fill="${c}"/>`;
      if (o.arms) g += `<path d="M${f1(-10 * s)} ${f1(-hh * 0.6)} L${f1(26 * s)} ${f1(-hh * 0.66)} M${f1(8 * s)} ${f1(-hh * 0.6)} L${f1(34 * s)} ${f1(-hh * 0.62)}" stroke="${c}" stroke-width="${f1(5 * s)}" stroke-linecap="round"/>`;
      // neck + head
      const hy = o.up ? -hh * 0.98 : -hh * 0.92;
      g += `<rect x="${f1(-3.5 * s)}" y="${f1(-hh * 0.8)}" width="${f1(7 * s)}" height="${f1(8 * s)}" fill="${c}"/>`;
      g += `<ellipse cx="0" cy="${f1(hy)}" rx="${f1(9.5 * s)}" ry="${f1(12 * s)}" fill="${c}" ${o.up ? 'transform="rotate(-18)"' : ''}/>`;
      if (!o.back) {
        // a face that is not there
        g += `<ellipse cx="0" cy="${f1(hy + 1.5 * s)}" rx="${f1(6.5 * s)}" ry="${f1(8.5 * s)}" fill="#fff" opacity=".18"/>`;
        if (o.eyes) g += `<circle cx="${f1(-3 * s)}" cy="${f1(hy)}" r="${f1(2.6 * s)}" fill="#fff"/><circle cx="${f1(3 * s)}" cy="${f1(hy)}" r="${f1(2.6 * s)}" fill="#fff"/><circle cx="${f1(-3 * s)}" cy="${f1(hy)}" r="${f1(0.9 * s)}" fill="#000"/><circle cx="${f1(3 * s)}" cy="${f1(hy)}" r="${f1(0.9 * s)}" fill="#000"/>`;
      }
      if (o.badge) g += `<rect x="${f1(4 * s)}" y="${f1(-hh * 0.5)}" width="${f1(8 * s)}" height="${f1(10 * s)}" fill="#f4f1e6"/><rect x="${f1(5.5 * s)}" y="${f1(-hh * 0.48)}" width="${f1(5 * s)}" height="${f1(5 * s)}" fill="#ddd"/>`;
      if (o.half) g += `</g>`;
      g += `</g>`;
      if (o.mirror) g = `<g transform="translate(${f1(2 * x)} 0) scale(-1 1)">${g}</g>`;
      return g;
    },
    longfig(r, o) {
      const x = X(o.x || 0.5),
        s = o.s || 1;
      const base = Y(o.y != null ? o.y + 0.3 : 1.0);
      const c = o.c || '#1a1712';
      const hh = 120 * s;
      let g = `<g transform="translate(${f1(x)} ${f1(base)})" ${o.phase ? 'opacity=".85"' : ''}>`;
      g += `<path d="M${f1(-3 * s)} 0 L${f1(-5 * s)} ${f1(-hh * 0.45)} L${f1(-8 * s)} ${f1(-hh * 0.8)} L${f1(8 * s)} ${f1(-hh * 0.8)} L${f1(5 * s)} ${f1(-hh * 0.45)} L${f1(3 * s)} 0 Z" fill="${c}"/>`;
      g += `<path d="M${f1(-8 * s)} ${f1(-hh * 0.78)} Q${f1(-22 * s)} ${f1(-hh * 0.5)} ${f1(-16 * s)} ${f1(-hh * 0.12)} M${f1(8 * s)} ${f1(-hh * 0.78)} Q${f1(22 * s)} ${f1(-hh * 0.5)} ${f1(17 * s)} ${f1(-hh * 0.1)}" stroke="${c}" stroke-width="${f1(2.6 * s)}" fill="none" stroke-linecap="round"/>`;
      g += `<ellipse cx="0" cy="${f1(-hh * 0.88)}" rx="${f1(6 * s)}" ry="${f1(9 * s)}" fill="${c}"/>`;
      g += `</g>`;
      return g;
    },
    ring(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.55),
        s = o.s || 1;
      const R = 26 * s,
        T = 11 * s;
      const c1 = o.red ? '#ff3b3b' : '#ff7a9a',
        c2 = '#ffffff';
      let g = `<g transform="translate(${f1(x)} ${f1(y)})">`;
      g += `<ellipse cx="0" cy="${f1(R * 0.55)}" rx="${f1(R * 1.3)}" ry="${f1(R * 0.28)}" fill="#0e4d5f" opacity=".35"/>`;
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2,
          a1 = ((i + 1) / 8) * Math.PI * 2;
        const p = (a, rr) => `${f1(Math.cos(a) * rr)} ${f1(Math.sin(a) * rr * 0.5)}`;
        g += `<path d="M${p(a0, R + T / 2)} A${f1(R + T / 2)} ${f1((R + T / 2) * 0.5)} 0 0 1 ${p(a1, R + T / 2)} L${p(a1, R - T / 2)} A${f1(R - T / 2)} ${f1((R - T / 2) * 0.5)} 0 0 0 ${p(a0, R - T / 2)} Z" fill="${i % 2 ? c2 : c1}"/>`;
      }
      g += `<ellipse cx="${f1(-R * 0.35)}" cy="${f1(-R * 0.3)}" rx="${f1(R * 0.35)}" ry="${f1(T * 0.18)}" fill="#fff" opacity=".7"/>`;
      g += `</g>`;
      return g;
    },
    eyes(r, o) {
      const n = o.n || 5,
        cx = X(o.x || 0.5),
        cy = Y(o.y || 0.5),
        rr = (o.r || 0.6) * 90;
      let s = '';
      for (let i = 0; i < n; i++) {
        const x = cx + r.range(-rr, rr),
          y = cy + r.range(-rr * 0.5, rr * 0.5);
        const w = r.range(4, 9);
        s += `<g transform="translate(${f1(x)} ${f1(y)})"><path d="M${f1(-w)} 0 Q0 ${f1(-w * 0.7)} ${f1(w)} 0 Q0 ${f1(w * 0.7)} ${f1(-w)} 0Z" fill="#fff7d6" filter="url(#glw)"/><circle r="${f1(w * 0.32)}" fill="#1a0f00"/><circle r="${f1(w * 0.1)}" cx="${f1(-w * 0.1)}" cy="${f1(-w * 0.1)}" fill="#fff"/></g>`;
      }
      return s;
    },
    tv(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.55),
        s = o.s || 1;
      const w = 54 * s,
        h = 42 * s;
      let g = `<g transform="translate(${f1(x)} ${f1(y)})">`;
      g += `<rect x="${f1(-w / 2)}" y="${f1(-h / 2)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(5 * s)}" fill="${o.pastel ? '#d9c6ff' : '#5a5044'}"/>`;
      g += `<line x1="${f1(-8 * s)}" y1="${f1(-h / 2)}" x2="${f1(-16 * s)}" y2="${f1(-h / 2 - 14 * s)}" stroke="#333" stroke-width="1.2"/><line x1="${f1(6 * s)}" y1="${f1(-h / 2)}" x2="${f1(14 * s)}" y2="${f1(-h / 2 - 15 * s)}" stroke="#333" stroke-width="1.2"/>`;
      if (o.back) {
        g += `<rect x="${f1(-w / 2 + 6 * s)}" y="${f1(-h / 2 + 6 * s)}" width="${f1(w - 12 * s)}" height="${f1(h - 12 * s)}" rx="3" fill="#3a3329"/>`;
        g += `<ellipse cx="0" cy="0" rx="${f1(w * 0.7)}" ry="${f1(h * 0.7)}" fill="#fff6c8" opacity=".25" filter="url(#blr)"/>`;
      } else {
        const sw = w - 14 * s,
          sh = h - 12 * s;
        g += `<rect x="${f1(-w / 2 + 5 * s)}" y="${f1(-h / 2 + 5 * s)}" width="${f1(sw)}" height="${f1(sh)}" rx="${f1(4 * s)}" fill="${o.pastel ? '#fff0fb' : '#cfe8e0'}"/>`;
        if (o.hallway) {
          const sx = -w / 2 + 5 * s,
            sy = -h / 2 + 5 * s;
          g += `<g transform="translate(${f1(sx)} ${f1(sy)}) scale(${f1(sw / W)} ${f1(sh / H)})"><polygon points="0,0 ${W},0 115,52 85,52" fill="#efe6bd"/><polygon points="0,0 85,52 85,76 0,${H}" fill="#e2cf80"/><polygon points="${W},0 115,52 115,76 ${W},${H}" fill="#d8c473"/><polygon points="0,${H} ${W},${H} 115,76 85,76" fill="#8f7d45"/><rect x="85" y="52" width="30" height="24" fill="#b8a456"/><rect x="70" y="8" width="60" height="5" fill="#fff" opacity=".9"/></g>`;
        } else {
          for (let i = 0; i < 14; i++) g += `<rect x="${f1(-w / 2 + 5 * s + r.range(0, sw - 6))}" y="${f1(-h / 2 + 5 * s + r.range(0, sh - 2))}" width="${f1(r.range(2, 10))}" height="1" fill="#fff" opacity="${f1(r.range(0.3, 0.9))}"/>`;
        }
        g += `<rect x="${f1(-w / 2 + 5 * s)}" y="${f1(-h / 2 + 5 * s)}" width="${f1(sw)}" height="${f1(sh)}" rx="${f1(4 * s)}" fill="#fff" opacity=".12" filter="url(#glw)"/>`;
        g += `<circle cx="${f1(w / 2 - 4.5 * s)}" cy="${f1(-h / 4)}" r="${f1(1.6 * s)}" fill="#222"/><circle cx="${f1(w / 2 - 4.5 * s)}" cy="${f1(0)}" r="${f1(1.6 * s)}" fill="#222"/>`;
      }
      g += `</g>`;
      return g;
    },
    cabinet(r, o) {
      const x = X(o.x || 0.5),
        s = o.s || 1;
      const w = 60 * s,
        h = 92 * s,
        y0 = Y(0.94) - h;
      let g = `<rect x="${f1(x - w / 2)}" y="${f1(y0)}" width="${f1(w)}" height="${f1(h)}" rx="3" fill="#cfe4e8" stroke="#6f9aa2" stroke-width="1.4"/>`;
      g += `<rect x="${f1(x - w / 2 + 6)}" y="${f1(y0 + 8)}" width="${f1(w - 12)}" height="${f1(h * 0.55)}" rx="2" fill="#9ff3ff" opacity=".45"/>`;
      g += `<rect x="${f1(x - w / 2 + 6)}" y="${f1(y0 + 8)}" width="${f1(w - 12)}" height="${f1(h * 0.55)}" rx="2" fill="#fff" opacity=".35" filter="url(#blr)"/>`;
      g += `<rect x="${f1(x - w / 2)}" y="${f1(y0 + h * 0.72)}" width="${f1(w)}" height="7" fill="#ffd23e"/>`;
      for (let i = 0; i < 6; i++) g += `<rect x="${f1(x - w / 2 + i * (w / 6) + 2)}" y="${f1(y0 + h * 0.72)}" width="${f1(w / 12)}" height="7" fill="#222"/>`;
      g += `<text x="${f1(x)}" y="${f1(y0 + h * 0.9)}" font-family="monospace" font-size="7" fill="#33535a" text-anchor="middle">-40°C</text>`;
      return g;
    },
    snow(r, o) {
      let s = '';
      for (let i = 0; i < (o.n || 20); i++) s += `<circle cx="${f1(r.range(0, W))}" cy="${f1(r.range(0, H))}" r="${f1(r.range(0.4, 1.6))}" fill="#fff" opacity="${f1(r.range(0.4, 0.95))}"/>`;
      return s;
    },
    snowflake(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.5),
        R = 38 * (o.s || 1);
      let g = `<g transform="translate(${f1(x)} ${f1(y)})" stroke="#bff8ff" stroke-width="2" stroke-linecap="round" filter="url(#glw)">`;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const ex = Math.cos(a) * R,
          ey = Math.sin(a) * R;
        g += `<line x1="0" y1="0" x2="${f1(ex)}" y2="${f1(ey)}"/>`;
        for (const t of [0.45, 0.72]) {
          const bx = Math.cos(a) * R * t,
            by = Math.sin(a) * R * t;
          const l = R * 0.22;
          g += `<line x1="${f1(bx)}" y1="${f1(by)}" x2="${f1(bx + Math.cos(a + 0.7) * l)}" y2="${f1(by + Math.sin(a + 0.7) * l)}"/><line x1="${f1(bx)}" y1="${f1(by)}" x2="${f1(bx + Math.cos(a - 0.7) * l)}" y2="${f1(by + Math.sin(a - 0.7) * l)}"/>`;
        }
      }
      g += `</g>`;
      return g;
    },
    grid(r, o) {
      let s = `<g stroke="#9ff3ff" stroke-width=".6" opacity="${o.o || 0.5}">`;
      for (let x = 0; x <= W; x += 16) s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`;
      for (let y = 0; y <= H; y += 16) s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`;
      s += `</g>`;
      return s;
    },
    wall(r, o) {
      let s = '';
      const n = o.n || 3;
      for (let i = 0; i < n; i++) {
        const inset = 14 + i * 10;
        s += `<rect x="${inset}" y="${f1(inset * 0.55)}" width="${W - inset * 2}" height="${f1(H - inset * 1.1)}" fill="none" stroke="#7d6a32" stroke-width="${2 - i * 0.3}" opacity="${0.8 - i * 0.12}"/>`;
      }
      return s;
    },
    shield(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.6),
        s = o.s || 1;
      const w = 46 * s,
        h = 64 * s;
      let g = `<g transform="translate(${f1(x)} ${f1(y)})"><rect x="${f1(-w / 2)}" y="${f1(-h / 2)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(5 * s)}" fill="${o.c || '#8ef'}" opacity=".55" stroke="#e9fbff" stroke-width="1.2"/>`;
      g += `<rect x="${f1(-w / 2 + 6 * s)}" y="${f1(-h / 2 + 7 * s)}" width="${f1(w - 12 * s)}" height="${f1(12 * s)}" fill="#fff" opacity=".35"/>`;
      if (o.scratch) for (let i = 0; i < 5; i++) g += `<line x1="${f1(r.range(-w / 2, w / 2))}" y1="${f1(r.range(-h / 2, 0))}" x2="${f1(r.range(-w / 2, w / 2))}" y2="${f1(r.range(0, h / 2))}" stroke="#3a5a60" stroke-width=".7" opacity=".7"/>`;
      g += `</g>`;
      return g;
    },
    tape(r, o) {
      let s = '';
      for (let i = 0; i < (o.n || 2); i++) {
        const y = 30 + i * 34 + r.range(-6, 6),
          a = r.range(-16, 16);
        s += `<g transform="rotate(${f1(a)} 100 ${f1(y)})"><rect x="-20" y="${f1(y - 5)}" width="${W + 40}" height="10" fill="#f4f1e6"/>`;
        for (let x = -20; x < W + 20; x += 14) s += `<rect x="${x}" y="${f1(y - 5)}" width="7" height="10" fill="#e8353f"/>`;
        s += `</g>`;
      }
      return s;
    },
    files(r, o) {
      const x = X(o.x || 0.5);
      let s = `<rect x="${f1(x - 32)}" y="22" width="64" height="112" fill="#a8c1c6" stroke="#53757c"/>`;
      for (let i = 0; i < 4; i++) {
        const y = 28 + i * 26;
        s += `<rect x="${f1(x - 28)}" y="${y}" width="56" height="22" fill="#c9dde0" stroke="#53757c" stroke-width=".8"/><rect x="${f1(x - 7)}" y="${y + 9}" width="14" height="4" rx="1" fill="#53757c"/>`;
        if (i === 1) s += `<rect x="${f1(x - 22)}" y="${y - 6}" width="40" height="9" fill="#fffdf2" transform="rotate(-4 ${x} ${y})"/>`;
      }
      return s;
    },
    paper(r, o) {
      let s = '';
      for (let i = 0; i < (o.n || 5); i++) s += `<rect x="${f1(r.range(0, W - 14))}" y="${f1(r.range(0, H - 16))}" width="12" height="16" fill="#fffdf2" opacity=".85" transform="rotate(${f1(r.range(-40, 40))} ${f1(r.range(0, W))} ${f1(r.range(0, H))})"/>`;
      return s;
    },
    cardshape(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.5),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(-8)"><rect x="${f1(-22 * s)}" y="${f1(-31 * s)}" width="${f1(44 * s)}" height="${f1(62 * s)}" rx="4" fill="#e9f7f8" stroke="#9ff3ff" stroke-width="2" filter="url(#glw)"/><rect x="${f1(-17 * s)}" y="${f1(-25 * s)}" width="${f1(34 * s)}" height="${f1(24 * s)}" fill="#2a4a52"/><circle cx="0" cy="${f1(-13 * s)}" r="${f1(6 * s)}" fill="#ff3b4e" opacity=".85"/></g>`;
    },
    chains(r, o) {
      let s = '';
      for (let i = 0; i < (o.n || 3); i++) {
        const x0 = r.range(-10, W + 10),
          y0 = r() < 0.5 ? -5 : H + 5,
          x1 = r.range(40, 160),
          y1 = r.range(40, 100);
        const len = Math.hypot(x1 - x0, y1 - y0),
          steps = Math.floor(len / 7);
        const a = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
        for (let k = 0; k < steps; k++) {
          const t = k / steps;
          s += `<ellipse cx="${f1(x0 + (x1 - x0) * t)}" cy="${f1(y0 + (y1 - y0) * t)}" rx="4.2" ry="2.3" fill="none" stroke="${k % 2 ? '#7c9aa0' : '#b9d4d8'}" stroke-width="1.6" transform="rotate(${f1(a + (k % 2 ? 90 : 0))} ${f1(x0 + (x1 - x0) * t)} ${f1(y0 + (y1 - y0) * t)})"/>`;
        }
      }
      return s;
    },
    clock(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.5),
        R = 28 * (o.s || 1);
      const melt = o.melt || 0;
      let g = `<g transform="translate(${f1(x)} ${f1(y)})">`;
      if (melt) g += `<path d="M${f1(-R)} 0 Q${f1(-R)} ${f1(R * (1 + melt * 2))} ${f1(-R * 0.3)} ${f1(R * (1 + melt * 2.4))} Q0 ${f1(R * 1.2)} ${f1(R * 0.4)} ${f1(R * (1 + melt * 1.6))} Q${f1(R)} ${f1(R * 1.1)} ${f1(R)} 0Z" fill="#f4f1e6"/>`;
      g += `<circle r="${f1(R)}" fill="#f4f1e6" stroke="#3a3a3a" stroke-width="2"/>`;
      for (let i = 0; i < 12; i++) g += `<line x1="${f1(Math.cos((i / 12) * 6.283) * R * 0.82)}" y1="${f1(Math.sin((i / 12) * 6.283) * R * 0.82)}" x2="${f1(Math.cos((i / 12) * 6.283) * R * 0.92)}" y2="${f1(Math.sin((i / 12) * 6.283) * R * 0.92)}" stroke="#3a3a3a" stroke-width="1.2"/>`;
      g += `<line x1="0" y1="0" x2="${f1(R * 0.45)}" y2="${f1(R * 0.2)}" stroke="#222" stroke-width="2.2" stroke-linecap="round"/><line x1="0" y1="0" x2="${f1(-R * 0.1)}" y2="${f1(-R * 0.72)}" stroke="#222" stroke-width="1.4" stroke-linecap="round"/>`;
      g += `</g>`;
      return g;
    },
    lock(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.6),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><path d="M-9 -4 V-12 A9 9 0 0 1 9 -12 V-4" fill="none" stroke="#bcd" stroke-width="3.5"/><rect x="-13" y="-5" width="26" height="22" rx="3" fill="#d9eef0" stroke="#466" stroke-width="1"/><circle cx="0" cy="4" r="3" fill="#355"/><rect x="-1.2" y="5" width="2.4" height="6" fill="#355"/></g>`;
    },
    siren(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.4),
        s = o.s || 1;
      let g = `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})">`;
      g += `<polygon points="0,0 -90,-34 -90,34" fill="#ff2a3c" opacity=".28" filter="url(#blr)"/><polygon points="0,0 90,-30 90,30" fill="#ff2a3c" opacity=".18" filter="url(#blr)"/>`;
      g += `<rect x="-14" y="8" width="28" height="7" fill="#3a3a3a"/><path d="M-11 8 V-6 A11 11 0 0 1 11 -6 V8 Z" fill="#ff3b4e"/><path d="M-6 6 V-5 A6 6 0 0 1 2 -9" stroke="#ffd0d4" stroke-width="2" fill="none"/>`;
      g += `<circle cx="0" cy="-2" r="16" fill="#ff3b4e" opacity=".35" filter="url(#blr)"/></g>`;
      return g;
    },
    monitors(r, o) {
      let s = '';
      const n = o.n || 9;
      const cols = Math.ceil(Math.sqrt(n * 1.6)),
        rows = Math.ceil(n / cols);
      const cw = 180 / cols,
        ch = 70 / rows;
      for (let i = 0; i < n; i++) {
        const cx = 10 + (i % cols) * cw,
          cy = 8 + Math.floor(i / cols) * ch;
        const glowC = r.pick(['#9ff3ff', '#bfe', '#e6fff8', '#ff3b4e']);
        s += `<rect x="${f1(cx + 1)}" y="${f1(cy + 1)}" width="${f1(cw - 3)}" height="${f1(ch - 3)}" rx="2" fill="#203034"/><rect x="${f1(cx + 3)}" y="${f1(cy + 3)}" width="${f1(cw - 7)}" height="${f1(ch - 7)}" rx="1.5" fill="${glowC}" opacity="${f1(r.range(0.35, 0.8))}"/>`;
        if (r() < 0.5) s += `<path d="M${f1(cx + 5)} ${f1(cy + ch - 6)} L${f1(cx + cw / 2)} ${f1(cy + 5)} L${f1(cx + cw - 6)} ${f1(cy + ch - 6)}" fill="none" stroke="#203034" stroke-width=".8" opacity=".5"/>`;
      }
      return s;
    },
    vault(r, o) {
      const x = X(o.x || 0.5),
        y = Y(0.52),
        R = 48 * (o.s || 1);
      let g = `<g transform="translate(${f1(x)} ${f1(y)})"><circle r="${f1(R + 6)}" fill="#2b3b40"/><circle r="${f1(R)}" fill="#9fb8bf" stroke="#d9eef2" stroke-width="2"/>`;
      g += `<circle r="${f1(R * 0.62)}" fill="none" stroke="#56747b" stroke-width="3"/>`;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 6.283;
        g += `<line x1="0" y1="0" x2="${f1(Math.cos(a) * R * 0.6)}" y2="${f1(Math.sin(a) * R * 0.6)}" stroke="#56747b" stroke-width="3" stroke-linecap="round"/>`;
      }
      g += `<circle r="${f1(R * 0.14)}" fill="#33494f"/>`;
      g += `<circle r="${f1(R)}" fill="#e9fbff" opacity=".22"/></g>`;
      return g;
    },
    textlines(r, o) {
      let s = '';
      for (let i = 0; i < (o.n || 5); i++) s += `<rect x="${f1(46 + r.range(0, 10))}" y="${f1(30 + i * 11)}" width="${f1(r.range(50, 105))}" height="1.6" fill="#fff" opacity=".55"/>`;
      return s;
    },
    crack(r, o) {
      const x = X(o.x || 0.5);
      let d = `M${f1(x)} 0`;
      let cx = x;
      for (let y = 10; y <= H; y += 12) {
        cx += r.range(-10, 10);
        d += ` L${f1(cx)} ${y}`;
      }
      return `<path d="${d}" stroke="#0a0804" stroke-width="7" fill="none" stroke-linejoin="bevel"/><path d="${d}" stroke="#2b2310" stroke-width="10" fill="none" opacity=".35"/>`;
    },
    hand(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.5),
        s = (o.s || 1) * 1.2,
        a = o.a || 0;
      const col = o.reach ? '#f5d3e6' : '#e8dcc4';
      let g = `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${a}) scale(${f1(s)})">`;
      g += `<path d="M-6 30 L-7 6 Q-8 -2 -3 -2 L-2 -18 Q0 -22 2 -18 L3 -4 L4 -22 Q6 -26 8 -22 L8 -4 L10 -19 Q12 -22 14 -19 L13 -2 L16 -12 Q18 -15 20 -11 L16 10 Q14 22 6 30 Z" fill="${col}" stroke="#5a4a30" stroke-width=".8"/>`;
      g += `</g>`;
      return g;
    },
    pixtear(r, o) {
      let s = '';
      const cols = ['#ff2a4d', '#3ef0ff', '#f2d64b', '#000', '#fff'];
      for (let i = 0; i < (o.n || 8); i++) s += `<rect x="${f1(r.range(0, W))}" y="${f1(r.range(0, H))}" width="${f1(r.range(4, 26))}" height="${f1(r.range(1, 5))}" fill="${r.pick(cols)}" opacity="${f1(r.range(0.4, 0.9))}"/>`;
      return s;
    },
    hole(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.7),
        s = o.s || 1;
      return `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(46 * s)}" ry="${f1(14 * s)}" fill="#000"/><ellipse cx="${f1(x)}" cy="${f1(y - 2)}" rx="${f1(46 * s)}" ry="${f1(12 * s)}" fill="none" stroke="#5c4c22" stroke-width="1.5"/>`;
    },
    cubicles(r, o, ctx) {
      const p = ctx.room || persp(100, 58);
      let s = '';
      for (let i = 0; i < (o.n || 8); i++) {
        const t = i / (o.n || 8);
        const k = 1 - t * 0.85;
        const y = p.by1 + (H - p.by1) * k * 0.95;
        const h = 22 * k,
          w = 40 * k;
        for (const side of [-1, 1]) {
          const x = p.vx + side * (24 + 70 * k) - w / 2;
          s += `<rect x="${f1(x)}" y="${f1(y - h)}" width="${f1(w)}" height="${f1(h)}" fill="#9a9478" stroke="#6b6650" stroke-width=".6"/>`;
        }
      }
      return s;
    },
    vent(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.3),
        s = o.s || 1;
      let g = `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><rect x="-26" y="-12" width="52" height="24" fill="#2f2a1a" stroke="#c9b25f" stroke-width="1.5"/>`;
      for (let i = -9; i <= 9; i += 4.5) g += `<rect x="-23" y="${i - 1}" width="46" height="2" fill="#8a7a44"/>`;
      g += `</g>`;
      return g;
    },
    drips(r, o) {
      let s = '';
      for (let i = 0; i < (o.n || 5); i++) {
        const x = r.range(60, 140),
          y = r.range(46, 120);
        s += `<path d="M${f1(x)} ${f1(y - 5)} Q${f1(x + 2.4)} ${f1(y)} ${f1(x)} ${f1(y + 2.4)} Q${f1(x - 2.4)} ${f1(y)} ${f1(x)} ${f1(y - 5)}Z" fill="#cfeef5" opacity=".8"/>`;
      }
      return s;
    },
    cars(r, o) {
      let s = '';
      for (let i = 0; i < (o.n || 3); i++) {
        const x = 20 + i * (160 / (o.n || 3)) + r.range(-6, 6),
          y = 96 + r.range(-6, 8),
          k = r.range(0.8, 1.15);
        s += `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(k)})"><path d="M-22 10 L-20 -2 L-12 -10 L12 -10 L20 -2 L22 10 Z" fill="#15161a"/><rect x="-22" y="6" width="44" height="6" fill="#0c0c0e"/>`;
        s += `<ellipse cx="-14" cy="3" rx="4" ry="2.6" fill="#fff8d0" filter="url(#glw)"/><ellipse cx="14" cy="3" rx="4" ry="2.6" fill="#fff8d0" filter="url(#glw)"/>`;
        s += `<polygon points="-14,3 -60,40 30,40" fill="#fff6c8" opacity=".08"/></g>`;
      }
      return s;
    },
    elevator(r, o) {
      const x = X(o.x || 0.5);
      let s = `<rect x="${f1(x - 40)}" y="28" width="80" height="106" fill="#8a7a50"/><rect x="${f1(x - 34)}" y="36" width="33" height="98" fill="#c9bd8e"/><rect x="${f1(x + 1)}" y="36" width="33" height="98" fill="#c2b585"/>`;
      s += `<rect x="${f1(x - 1)}" y="36" width="2" height="98" fill="#fffbe0" filter="url(#glw)"/>`;
      s += `<rect x="${f1(x - 14)}" y="16" width="28" height="9" fill="#1a1408"/><text x="${f1(x)}" y="23.5" font-family="monospace" font-size="7" fill="#ff5a3a" text-anchor="middle">B∞</text>`;
      return s;
    },
    throne(r, o) {
      const x = X(o.x || 0.5),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(Y(0.9))}) scale(${f1(s)})"><rect x="-16" y="-70" width="32" height="56" rx="2" fill="#6a5a2a"/><rect x="-20" y="-16" width="40" height="8" fill="#5a4c22"/><rect x="-18" y="-8" width="4" height="10" fill="#4a3e1a"/><rect x="14" y="-8" width="4" height="10" fill="#4a3e1a"/><rect x="-12" y="-64" width="24" height="44" fill="#7d6b35"/></g>`;
    },
    exit(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.35),
        s = o.s || 1;
      const c = o.red ? '#ff3b4e' : '#3dff8a';
      return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><rect x="-26" y="-11" width="52" height="22" rx="2" fill="${c}" opacity=".35" filter="url(#blr)"/><rect x="-22" y="-8" width="44" height="16" rx="1.5" fill="#0a1a10" stroke="${c}" stroke-width="1.2"/><text x="0" y="4" font-family="monospace" font-weight="700" font-size="10" fill="${c}" text-anchor="middle" filter="url(#glw)">EXIT</text></g>`;
    },
    wetfloor(r) {
      const x = r.range(130, 170);
      return `<ellipse cx="100" cy="128" rx="80" ry="8" fill="#fff" opacity=".2"/><g transform="translate(${f1(x)} 118)"><polygon points="-10,14 0,-16 10,14" fill="#f2d000" stroke="#333" stroke-width=".8"/><text x="0" y="8" font-size="8" text-anchor="middle" fill="#222">!</text></g>`;
    },
    mop(r, o) {
      const x = X(o.x || 0.6),
        y = Y(o.y || 0.6),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(12) scale(${f1(s)})"><rect x="-1.2" y="-48" width="2.4" height="64" fill="#9a8a5a"/><path d="M-10 16 L10 16 L13 30 L-13 30 Z" fill="#d8d0b8"/></g>`;
    },
    bubbles(r, o) {
      let s = '';
      for (let i = 0; i < (o.n || 6); i++) {
        const x = r.range(14, 186),
          y = r.range(14, 120),
          R = o.big ? r.range(8, 24) : r.range(4, 14);
        s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R)}" fill="url(#bub)" stroke="url(#rb)" stroke-width="${f1(R * 0.08 + 0.4)}" opacity=".9"/><ellipse cx="${f1(x - R * 0.35)}" cy="${f1(y - R * 0.4)}" rx="${f1(R * 0.22)}" ry="${f1(R * 0.12)}" fill="#fff" opacity=".85"/>`;
      }
      return s;
    },
    window(r, o) {
      const x = X(o.x || 0.65),
        y = Y(o.y || 0.35),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><rect x="-26" y="-22" width="52" height="44" fill="#fffbe8"/><rect x="-26" y="-22" width="52" height="44" fill="#fff" opacity=".8" filter="url(#blr)"/><line x1="0" y1="-22" x2="0" y2="22" stroke="#d8b49a" stroke-width="2"/><line x1="-26" y1="0" x2="26" y2="0" stroke="#d8b49a" stroke-width="2"/><rect x="-28" y="-24" width="56" height="48" fill="none" stroke="#c99f86" stroke-width="2.4"/></g>`;
    },
    sunbeam(r, o) {
      const x = X(o.x || 0.6);
      return `<polygon points="${f1(x - 20)},20 ${f1(x + 26)},20 ${f1(x - 30)},${H} ${f1(x - 110)},${H}" fill="#fff8d8" opacity=".45"/>`;
    },
    mats(r, o) {
      let s = '';
      const cols = ['#ffb3c7', '#b3d9ff', '#c8f0b8', '#fff1a8'];
      for (let i = 0; i < (o.n || 3); i++) s += `<rect x="${f1(14 + i * 60 + r.range(-4, 4))}" y="${f1(112 + r.range(-4, 6))}" width="48" height="14" rx="5" fill="${cols[i % 4]}" stroke="#d8a888" stroke-width=".6"/>`;
      return s;
    },
    rainbow(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.6),
        s = o.s || 1;
      const cols = ['#ff8fb5', '#ffc38f', '#fff38f', '#a8f0a8', '#8fd8ff', '#c8a8ff'];
      let g = `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})" opacity=".85">`;
      if (o.streak) {
        for (let i = 0; i < 6; i++) g += `<path d="M-110 ${20 - i * 4} Q-20 ${-40 - i * 4} 110 ${-6 - i * 4}" stroke="${cols[i]}" stroke-width="4" fill="none" filter="url(#glw)"/>`;
      } else {
        for (let i = 0; i < 6; i++) g += `<path d="M${-70 + i * 5} 0 A${70 - i * 5} ${60 - i * 5} 0 0 1 ${70 - i * 5} 0" stroke="${cols[i]}" stroke-width="5" fill="none"/>`;
      }
      g += `</g>`;
      return g;
    },
    stars(r, o) {
      let s = '';
      for (let i = 0; i < (o.n || 6); i++) s += star(r.range(8, 192), r.range(8, 100), r.range(2, 5), o.glow ? '#e8ffb8' : '#fff7b0', o.glow);
      return s;
    },
    star(r, o) {
      return star(X(o.x || 0.5), Y(o.y || 0.4), 14 * (o.s || 1), '#fff3a0', true);
    },
    hopscotch(r) {
      let s = '';
      const cells = [[0, 0], [0, 1], [-1, 2], [1, 2], [0, 3], [-1, 4], [1, 4]];
      for (const [cx, row] of cells) {
        const t = row / 5;
        const y = 134 - row * 13,
          w = 26 * (1 - t * 0.45),
          h = 12 * (1 - t * 0.4);
        const x = 100 + cx * w;
        s += `<rect x="${f1(x - w / 2)}" y="${f1(y - h)}" width="${f1(w)}" height="${f1(h)}" fill="none" stroke="#fff" stroke-width="1.4" opacity=".85"/><text x="${f1(x)}" y="${f1(y - h * 0.25)}" font-size="${f1(h * 0.7)}" fill="#fff" text-anchor="middle" opacity=".8">${row + 1}</text>`;
      }
      return s;
    },
    child(r, o) {
      const x = X(o.x || 0.5),
        s = (o.s || 1) * 0.9;
      const base = Y(o.y != null ? o.y + 0.25 : 0.95);
      const c = o.faded ? '#e8d8f0' : '#3a2a40';
      if (o.sleep) return `<g transform="translate(${f1(x)} ${f1(base)}) scale(${f1(s)})"><ellipse cx="0" cy="-6" rx="28" ry="9" fill="${c}"/><circle cx="-26" cy="-12" r="9" fill="${c}"/><circle cx="-26" cy="-12" r="6" fill="#fff" opacity=".15"/></g>`;
      return `<g transform="translate(${f1(x)} ${f1(base)}) scale(${f1(s)})" ${o.faded ? 'opacity=".75"' : ''}><path d="M-11 0 L-8 -26 L8 -26 L11 0 Z" fill="${c}"/><circle cx="0" cy="-34" r="11" fill="${c}"/><circle cx="-12" cy="-40" r="4" fill="${c}"/><circle cx="12" cy="-40" r="4" fill="${c}"/><ellipse cx="0" cy="-33" rx="7" ry="8" fill="#fff" opacity=".18"/></g>`;
    },
    halo(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.45),
        R = 40 * (o.s || 1);
      return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R)}" fill="url(#halo)"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R * 0.3)}" fill="#fff" opacity=".75" filter="url(#blr)"/>`;
    },
    whistle(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.8),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><path d="M-30 -30 Q-10 -6 -8 0" stroke="#ff6a6a" stroke-width="1.4" fill="none"/><rect x="-8" y="-6" width="18" height="10" rx="5" fill="#d9e2e6" stroke="#5a6a70"/><rect x="8" y="-4" width="8" height="5" fill="#d9e2e6" stroke="#5a6a70"/><circle cx="0" cy="-1" r="2" fill="#5a6a70"/></g>`;
    },
    mirror(r, o) {
      const x = X(o.x || 0.5);
      return `<ellipse cx="${f1(x)}" cy="66" rx="40" ry="56" fill="#c9b5d8"/><ellipse cx="${f1(x)}" cy="66" rx="34" ry="50" fill="url(#mir)"/><path d="M${f1(x - 20)} 30 Q${f1(x - 26)} 50 ${f1(x - 24)} 70" stroke="#fff" stroke-width="2" opacity=".6" fill="none"/>`;
    },
    cassette(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.5),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)}) rotate(-6)"><rect x="-48" y="-28" width="96" height="56" rx="4" fill="#2b2a30"/><rect x="-40" y="-22" width="80" height="22" rx="2" fill="#fff6e0"/><rect x="-40" y="-22" width="80" height="6" fill="#ff9fc8"/><text x="0" y="-5" font-family="monospace" font-size="6" text-anchor="middle" fill="#555">HAPPY BIRTHDAY · B</text><circle cx="-20" cy="12" r="8" fill="#ddd"/><circle cx="20" cy="12" r="8" fill="#ddd"/><circle cx="-20" cy="12" r="3" fill="#2b2a30"/><circle cx="20" cy="12" r="3" fill="#2b2a30"/><rect x="-12" y="8" width="24" height="9" fill="#433"/></g>`;
    },
    moon(r, o) {
      const x = X(o.x || 0.7),
        y = Y(o.y || 0.25),
        R = 16 * (o.s || 1);
      return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R * 1.8)}" fill="#fff8d8" opacity=".25" filter="url(#blr)"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R)}" fill="#fff6cf"/><circle cx="${f1(x + R * 0.45)}" cy="${f1(y - R * 0.2)}" r="${f1(R * 0.85)}" fill="#c9b8e8"/>`;
    },
    sun(r, o) {
      const x = X(o.x || 0.75),
        y = Y(o.y || 0.25),
        R = 16 * (o.s || 1);
      return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R * 2.2)}" fill="#fff3c0" opacity=".45" filter="url(#blr)"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R)}" fill="#fff1b8"/>`;
    },
    slide(r, o) {
      const x = X(o.x || 0.35),
        y = Y(o.y || 0.7),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><rect x="-30" y="-46" width="3" height="66" fill="#9ad"/><rect x="-14" y="-46" width="3" height="66" fill="#9ad"/><path d="M-28 -46 L-12 -46 L40 18 L28 22 Z" fill="#ff9fb5"/><path d="M-30 -20 L-12 -20 M-30 -6 L-12 -6 M-30 8 L-12 8" stroke="#9ad" stroke-width="2"/></g>`;
    },
    swing(r, o) {
      const x = X(o.x || 0.7),
        y = Y(o.y || 0.66),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><path d="M-30 30 L-18 -36 L18 -36 L30 30" stroke="#a9c" stroke-width="3" fill="none"/><line x1="-6" y1="-36" x2="-8" y2="8" stroke="#777" stroke-width="1"/><line x1="8" y1="-36" x2="10" y2="8" stroke="#777" stroke-width="1"/><rect x="-10" y="8" width="22" height="4" fill="#ffb3c7"/></g>`;
    },
    line(r, o) {
      return `<rect x="${f1(X(o.x || 0.5) - 1)}" y="0" width="2" height="${H}" fill="#fff" opacity=".8" filter="url(#glw)"/>`;
    },
    machine(r, o) {
      const x = X(o.x || 0.45),
        y = Y(o.y || 0.62),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><rect x="-24" y="-18" width="48" height="34" rx="6" fill="#ffd0e8" stroke="#c98aa8"/><circle cx="-10" cy="-2" r="6" fill="#fff" opacity=".7"/><rect x="6" y="-8" width="12" height="4" fill="#c98aa8"/><path d="M24 -10 L44 -30" stroke="#c98aa8" stroke-width="2"/><circle cx="48" cy="-34" r="6" fill="none" stroke="#c98aa8" stroke-width="2"/></g>`;
    },
    notebook(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.55),
        s = o.s || 1;
      let g = `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><path d="M0 -28 Q-24 -34 -48 -28 L-48 24 Q-24 18 0 24 Z" fill="#fffaf0" stroke="#c9b99a"/><path d="M0 -28 Q24 -34 48 -28 L48 24 Q24 18 0 24 Z" fill="#fbf3e2" stroke="#c9b99a"/>`;
      for (let i = 0; i < 6; i++) g += `<line x1="-42" y1="${-18 + i * 7}" x2="-6" y2="${-18 + i * 7}" stroke="#9fb0d0" stroke-width=".6"/><line x1="6" y1="${-18 + i * 7}" x2="${f1(42 - r.range(0, 20))}" y2="${-18 + i * 7}" stroke="#555" stroke-width=".7" opacity="${i < 4 ? 0.7 : 0.2}"/>`;
      g += `</g>`;
      return g;
    },
    moths(r, o) {
      let s = '';
      for (let i = 0; i < (o.n || 6); i++) {
        const x = r.range(40, 160),
          y = r.range(10, 70),
          a = r.range(-40, 40);
        s += `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(a)})"><ellipse cx="-3" cy="0" rx="3.5" ry="2.2" fill="#d8ccaa" opacity=".9"/><ellipse cx="3" cy="0" rx="3.5" ry="2.2" fill="#d8ccaa" opacity=".9"/><rect x="-.5" y="-2" width="1" height="4" fill="#5a5030"/></g>`;
      }
      return s;
    },
    vending(r, o) {
      const x = X(o.x || 0.5),
        s = o.s || 1;
      let g = `<g transform="translate(${f1(x)} ${f1(Y(0.98))}) scale(${f1(s)})"><rect x="-34" y="-118" width="68" height="118" rx="3" fill="#c8202f"/><rect x="-28" y="-110" width="40" height="80" fill="#fff6e0"/><rect x="-28" y="-110" width="40" height="80" fill="#fff" opacity=".5" filter="url(#blr)"/>`;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) g += `<rect x="${-25 + j * 12}" y="${-106 + i * 19}" width="8" height="12" rx="2" fill="${r.pick(['#3ab', '#fa3', '#6c4', '#e5a', '#47f'])}"/>`;
      g += `<rect x="16" y="-100" width="12" height="20" fill="#222"/><rect x="-28" y="-24" width="40" height="10" fill="#1a1a1a"/></g>`;
      return g;
    },
    boxes(r, o) {
      let s = '';
      for (let i = 0; i < (o.n || 6); i++) {
        const w = r.range(30, 52),
          h = r.range(22, 34);
        const x = r.range(10, 190 - w),
          y = 134 - h - Math.floor(i / 3) * 28 + r.range(-4, 4);
        s += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="#b98d58" stroke="#7a5a32"/><rect x="${f1(x + w / 2 - 3)}" y="${f1(y)}" width="6" height="${f1(h)}" fill="#d8b47a" opacity=".6"/><rect x="${f1(x + 4)}" y="${f1(y + 5)}" width="${f1(w * 0.4)}" height="5" fill="#fff6e0" opacity=".8"/>`;
      }
      return s;
    },
    counter(r) {
      return `<rect x="10" y="66" width="180" height="70" fill="#3a2a2e"/><rect x="10" y="62" width="180" height="6" fill="#ff3ec8" opacity=".6" filter="url(#glw)"/><text x="100" y="50" font-size="11" fill="#ff8fd8" text-anchor="middle" filter="url(#glw)">失物招领</text>`;
    },
    keys(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.5),
        s = o.s || 1;
      let g = `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><circle cx="0" cy="-16" r="10" fill="none" stroke="#d9c88a" stroke-width="2.2"/>`;
      const n = o.many ? 11 : 4;
      for (let i = 0; i < n; i++) {
        const a = -70 + (140 / (n - 1)) * i + r.range(-5, 5);
        g += `<g transform="rotate(${f1(a)} 0 -16)"><rect x="-1.6" y="-8" width="3.2" height="${f1(r.range(22, 34))}" fill="${r.pick(['#d9c88a', '#c0b070', '#e6d9a8', '#a89858'])}"/><circle cx="0" cy="-8" r="4" fill="none" stroke="#d9c88a" stroke-width="2"/></g>`;
      }
      g += `</g>`;
      return g;
    },
    radio(r, o) {
      const x = X(o.x || 0.6),
        y = Y(o.y || 0.5),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><rect x="-9" y="-16" width="18" height="32" rx="3" fill="#333"/><rect x="4" y="-30" width="3" height="16" fill="#333"/><rect x="-6" y="-12" width="12" height="9" fill="#9f9"/></g>`;
    },
    speaker(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.42),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><rect x="-30" y="-6" width="10" height="12" fill="#888"/><path d="M-20 -6 L18 -26 L18 26 L-20 6 Z" fill="#d9d9d9" stroke="#666"/><ellipse cx="18" cy="0" rx="5" ry="26" fill="#aaa"/><ellipse cx="18" cy="0" rx="3" ry="20" fill="#555"/></g>`;
    },
    waves(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.5);
      let s = '';
      for (let i = 1; i <= (o.n || 3); i++) s += `<path d="M${f1(x + 24 + i * 12)} ${f1(y - i * 10)} Q${f1(x + 34 + i * 14)} ${f1(y)} ${f1(x + 24 + i * 12)} ${f1(y + i * 10)}" stroke="#ff8fd8" stroke-width="2" fill="none" opacity="${f1(1 - i * 0.2)}" filter="url(#glw)"/>`;
      return s;
    },
    stairs(r, o) {
      let s = '';
      for (let i = 0; i < 12; i++) {
        const t = i / 12;
        const w = 160 * (1 - t * 0.8),
          y = 134 - i * 9;
        const x = 100 + (o.spiral ? Math.sin(i * 0.7) * 30 * (1 - t) : 0);
        s += `<rect x="${f1(x - w / 2)}" y="${f1(y - 8)}" width="${f1(w)}" height="8" fill="${shade('#8a8470', -t * 0.6)}" stroke="#4a4638" stroke-width=".5"/>`;
      }
      s += `<path d="M30 134 Q60 60 100 20" stroke="#5a5446" stroke-width="2" fill="none"/><path d="M170 134 Q140 60 100 20" stroke="#5a5446" stroke-width="2" fill="none"/>`;
      return s;
    },
    chair(r, o) {
      const x = X(o.x || 0.7),
        y = Y(o.y || 0.45),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><path d="M-14 50 L-8 -10 M14 50 L8 -10 M-11 20 L11 20 M-12 36 L12 36" stroke="#fff" stroke-width="3"/><rect x="-14" y="-16" width="28" height="7" fill="#ff5a5a"/><rect x="-12" y="-38" width="4" height="24" fill="#fff"/><rect x="8" y="-38" width="4" height="24" fill="#fff"/><rect x="-12" y="-38" width="24" height="6" fill="#ff5a5a"/></g>`;
    },
    cart(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.65),
        s = o.s || 1;
      return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><rect x="-34" y="-18" width="68" height="34" rx="2" fill="#3c6f8a"/><rect x="-30" y="-36" width="26" height="20" rx="3" fill="#f2d000"/><rect x="4" y="-44" width="2" height="30" fill="#b9a86a"/><circle cx="-24" cy="20" r="5" fill="#222"/><circle cx="24" cy="20" r="5" fill="#222"/></g>`;
    },
    notes(r, o) {
      let s = '';
      for (let i = 0; i < (o.n || 5); i++) {
        const x = r.range(20, 170),
          y = r.range(30, 110),
          c = r.pick(['#ff2a4d', '#ff3ec8', '#3ef0ff']);
        s += `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(r.range(-20, 20))})" filter="url(#glw)"><ellipse cx="0" cy="8" rx="5" ry="3.6" fill="${c}"/><rect x="4" y="-12" width="1.6" height="20" fill="${c}"/><path d="M5.6 -12 Q14 -8 12 0" stroke="${c}" stroke-width="1.6" fill="none"/></g>`;
      }
      return s;
    },
    coin(r, o) {
      const x = X(o.x || 0.5),
        y = Y(o.y || 0.5),
        R = 30 * (o.s || 1);
      return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R * 1.6)}" fill="#ffd98a" opacity=".25" filter="url(#blr)"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R)}" fill="#c9a24a" stroke="#f6dc8e" stroke-width="2"/><rect x="${f1(x - R * 0.25)}" y="${f1(y - R * 0.25)}" width="${f1(R * 0.5)}" height="${f1(R * 0.5)}" fill="#0a0a0c"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R * 0.8)}" fill="none" stroke="#8a6a2a" stroke-width="1"/>`;
    },
    beam(r, o) {
      const x = X(o.x || 0.4),
        y = Y(o.y || 0.45),
        a = o.a || 0,
        len = o.long ? 170 : 110;
      return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${a})"><polygon points="0,0 ${len},-34 ${len},34" fill="url(#beamg)"/></g>`;
    },
  };
  function star(x, y, R, col, glow) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5,
        rr = i % 2 ? R * 0.45 : R;
      d += (i ? 'L' : 'M') + f1(x + Math.cos(a) * rr) + ' ' + f1(y + Math.sin(a) * rr);
    }
    return `<path d="${d}Z" fill="${col}" ${glow ? 'filter="url(#glw)"' : ''}/>`;
  }

  // ---------------------------------------------------------------- assembly
  function defs(warp, seed) {
    return `<defs>
<filter id="glw" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="blr" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="${seed % 97}" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 1.4 -.55"/></filter>
${warp ? `<filter id="warp" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".018 .03" numOctaves="2" seed="${seed % 53}"/><feDisplacementMap in="SourceGraphic" scale="${f1(warp * 26)}" xChannelSelector="R" yChannelSelector="G"/></filter>` : ''}
<radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
<radialGradient id="halo"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".4" stop-color="#ffe6f6" stop-opacity=".6"/><stop offset="1" stop-color="#ffd0ee" stop-opacity="0"/></radialGradient>
<radialGradient id="bub" cx=".4" cy=".35"><stop offset="0" stop-color="#fff" stop-opacity=".15"/><stop offset=".8" stop-color="#e8f4ff" stop-opacity=".1"/><stop offset="1" stop-color="#ffd8f0" stop-opacity=".45"/></radialGradient>
<linearGradient id="rb" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ff9fd0"/><stop offset=".35" stop-color="#fff59f"/><stop offset=".65" stop-color="#9ff3ff"/><stop offset="1" stop-color="#c9a8ff"/></linearGradient>
<linearGradient id="mir" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f6f0ff"/><stop offset="1" stop-color="#b9c8e8"/></linearGradient>
<linearGradient id="beamg" x1="0" x2="1"><stop offset="0" stop-color="#fffbe0" stop-opacity=".85"/><stop offset="1" stop-color="#fffbe0" stop-opacity="0"/></linearGradient>
</defs>`;
  }

  function build(spec, seed) {
    const r = U.seeded(seed);
    const ctx = {};
    const scene = spec[0];
    let warp = 0;
    for (const item of spec.slice(1)) if (typeof item === 'object' && item.warp) warp = item.warp;
    // scene first (records room geometry for motifs), then items in order; overlays apply where they are listed
    const bg = (SCENES[scene] || SCENES.void)(r, ctx);
    let fg = '';
    let post = '';
    for (const item of spec.slice(1)) {
      if (typeof item === 'string') {
        const mo = parse(item);
        const fn = M[mo.m];
        if (fn) fg += fn(r, mo.o, ctx);
      } else {
        if (item.tint) fg += `<rect width="${W}" height="${H}" fill="${item.tint}" opacity=".28" style="mix-blend-mode:multiply"/>`;
        if (item.dark) fg += `<rect width="${W}" height="${H}" fill="#050405" opacity="${item.dark}"/>`;
        if (item.bright) post += `<rect width="${W}" height="${H}" fill="#fff" opacity="${item.bright * 0.4}"/>`;
      }
    }
    let body = `<g ${warp ? 'filter="url(#warp)"' : ''}>${bg}${fg}</g>${post}`;
    body += `<rect width="${W}" height="${H}" fill="url(#vig)"/>`;
    body += `<rect width="${W}" height="${H}" filter="url(#grain)" opacity=".2"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}" preserveAspectRatio="xMidYMid slice">${defs(warp, seed)}${body}</svg>`;
  }

  // ---------------------------------------------------------------- portraits (square)
  function portrait(h) {
    const P = h.portrait;
    const r = U.seeded(P.seed);
    const [c1, c2, c3] = P.pal;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="240" height="240">${defs(0, P.seed)}`;
    const grad = `<defs><radialGradient id="pg" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="${c3}"/><stop offset=".55" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>`;
    s += grad + `<rect width="120" height="120" fill="url(#pg)"/>`;
    if (P.body === 'manager') {
      s += `<polygon points="0,0 120,0 76,46 44,46" fill="#f3ead0" opacity=".7"/><rect x="40" y="6" width="40" height="5" fill="#fff" filter="url(#glw)"/>`;
      s += `<polygon points="0,120 120,120 76,70 44,70" fill="#7a6a38"/>`;
      s += `<g transform="translate(60 120)"><path d="M-34 0 Q-34 -44 -16 -52 L16 -52 Q34 -44 34 0Z" fill="#2c2a26"/><rect x="-5" y="-60" width="10" height="10" fill="#2c2a26"/><ellipse cx="0" cy="-72" rx="15" ry="19" fill="#2c2a26"/><ellipse cx="0" cy="-70" rx="10" ry="13" fill="#fff" opacity=".14"/></g>`;
      s += `<g transform="translate(86 72) rotate(14)"><rect x="-1.5" y="-50" width="3" height="80" fill="#a8946a"/><path d="M-12 30 L12 30 L15 44 L-15 44Z" fill="#d8d0b8"/></g>`;
      s += `<g transform="translate(44 96)">` + M.keys(r, { x: 0, y: 0, s: 0.5, many: 1 }).replace(/translate\([^)]*\)/, 'translate(0 0)') + `</g>`;
    } else if (P.body === 'lifeguard') {
      s += `<rect y="70" width="120" height="50" fill="#1f8aa0" opacity=".85"/>`;
      for (let i = 0; i < 5; i++) s += `<path d="M0 ${78 + i * 8} Q30 ${74 + i * 8} 60 ${78 + i * 8} T120 ${78 + i * 8}" stroke="#e8ffff" stroke-width=".8" fill="none" opacity=".4"/>`;
      s += `<g transform="translate(60 92)"><path d="M-30 30 L-18 -30 M30 30 L18 -30 M-24 0 L24 0" stroke="#fff" stroke-width="4"/><rect x="-22" y="-34" width="44" height="8" fill="#ff5a5a"/></g>`;
      s += `<g transform="translate(60 58)"><path d="M-22 0 Q-22 -26 -10 -30 L10 -30 Q22 -26 22 0Z" fill="#e33"/><rect x="-4" y="-36" width="8" height="8" fill="#e8c8a8"/><ellipse cx="0" cy="-46" rx="11" ry="14" fill="#e8c8a8"/><ellipse cx="0" cy="-45" rx="8" ry="10" fill="#fff" opacity=".35"/><path d="M-11 -50 Q0 -64 11 -50" fill="#3a2a1a"/></g>`;
      s += M.whistle(r, { x: 0.53, y: 0.44, s: 0.55 });
    } else if (P.body === 'broadcast') {
      s += `<rect width="120" height="120" fill="#0d0306"/>`;
      for (let i = 0; i < 4; i++) {
        const x = 18 + (i % 2) * 52,
          y = 24 + Math.floor(i / 2) * 50;
        s += `<g transform="translate(${x} ${y}) rotate(${i % 2 ? -12 : 12}) scale(.75)"><rect x="-30" y="-6" width="10" height="12" fill="#666"/><path d="M-20 -6 L18 -26 L18 26 L-20 6 Z" fill="#c9c9c9"/><ellipse cx="18" cy="0" rx="5" ry="26" fill="#888"/></g>`;
      }
      s += `<circle cx="60" cy="60" r="34" fill="#ff2a4d" opacity=".25" filter="url(#blr)"/>`;
      for (let i = 1; i <= 4; i++) s += `<circle cx="60" cy="60" r="${10 + i * 9}" fill="none" stroke="#ff2a4d" stroke-width="1.4" opacity="${1 - i * 0.2}" filter="url(#glw)"/>`;
      s += `<text x="60" y="66" font-family="monospace" font-size="16" fill="#ffd0d8" text-anchor="middle" filter="url(#glw)">●REC</text>`;
    } else {
      // agents
      s += `<rect y="84" width="120" height="36" fill="${c2}" opacity=".6"/>`;
      s += `<g transform="translate(60 122)"><path d="M-36 0 Q-36 -42 -16 -50 L16 -50 Q36 -42 36 0Z" fill="${c2}"/><rect x="-5" y="-58" width="10" height="10" fill="#d8c0a8"/><ellipse cx="0" cy="-72" rx="15" ry="18" fill="#e6cdb3"/><path d="M-16 -74 Q-14 -96 0 -94 Q16 -96 16 -74 Q8 -84 -16 -74Z" fill="#2a221c"/>`;
      s += `<rect x="-8" y="-46" width="16" height="10" fill="#f4f1e6"/><text x="0" y="-38.5" font-family="monospace" font-size="5" text-anchor="middle" fill="#333">LMN</text></g>`;
      if (P.prop === 'seal') s += `<g transform="translate(92 34) rotate(-20)"><rect x="-22" y="-5" width="44" height="10" fill="#f4f1e6"/><text x="0" y="3" font-size="6.5" text-anchor="middle" fill="#c22">封 存</text></g>`;
      if (P.prop === 'chalk') s += `<g transform="translate(28 36)"><path d="M-10 6 L10 -6" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M6 14 L22 14 M14 6 L14 22" stroke="#fff" stroke-width="2" opacity=".7"/></g>`;
      if (P.prop === 'pillow') s += `<g transform="translate(92 30)"><path d="M-14 0 Q-6 -10 6 -6 Q14 -12 18 0 Q10 10 -6 8 Q-16 8 -14 0Z" fill="#fff" opacity=".85"/><text x="2" y="3" font-size="7" text-anchor="middle" fill="#a8a">z z</text></g>`;
    }
    s += `<rect width="120" height="120" fill="url(#vig)"/><rect width="120" height="120" filter="url(#grain)" opacity=".18"/></svg>`;
    return s;
  }

  // card back
  function back() {
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" width="200" height="280">${defs(0, 5)}`;
    s += `<defs><linearGradient id="cb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1a22"/><stop offset="1" stop-color="#0b0a0e"/></linearGradient></defs>`;
    s += `<rect width="100" height="140" rx="7" fill="url(#cb)"/>`;
    for (let i = 0; i < 6; i++) s += `<rect x="0" y="${20 + i * 3}" width="100" height="1.4" fill="${['#ff3b4e', '#f2d64b', '#9ff3ff', '#ffb3e6', '#fff', '#3dff8a'][i]}" opacity=".55"/>`;
    s += `<rect x="8" y="8" width="84" height="124" rx="4" fill="none" stroke="#c9b25f" stroke-width="1" opacity=".6"/>`;
    s += `<g transform="translate(50 76)"><path d="M-26 0 Q0 -20 26 0 Q0 20 -26 0Z" fill="#efe6cf"/><circle r="8" fill="#16141a"/><circle r="3" fill="#f2d64b" filter="url(#glw)"/></g>`;
    s += `<text x="50" y="116" font-family="monospace" font-size="9" fill="#c9b25f" text-anchor="middle" letter-spacing="3">LIMINAL</text>`;
    s += `<rect width="100" height="140" filter="url(#grain)" opacity=".25"/></svg>`;
    return s;
  }

  // ---------------------------------------------------------------- cache & rasterization
  const cache = {};
  const toURI = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  function key(k, make) {
    if (!cache[k]) cache[k] = { svg: make(), url: null };
    if (!cache[k].url) cache[k].url = toURI(cache[k].svg);
    return cache[k];
  }
  Art.card = function (cid) {
    const d = L.CARDS[cid];
    return key('c:' + cid, () => build(d.art || ['void'], U.hash(cid))).url;
  };
  Art.portrait = function (heroId) {
    return key('p:' + heroId, () => portrait(L.HEROES[heroId])).url;
  };
  Art.back = function () {
    return key('back', back).url;
  };
  Art.svgOf = function (cid) {
    return build(L.CARDS[cid].art || ['void'], U.hash(cid));
  };
  // swap heavy SVG (with noise filters) for bitmaps once, in idle time
  Art.rasterizeAll = function (onEach) {
    if (typeof document === 'undefined') return;
    const ids = Object.keys(L.CARDS).map((c) => 'c:' + c).concat(L.AGENTS.concat(L.BOSSES).map((h) => 'p:' + h), ['back']);
    let i = 0;
    const step = () => {
      const t0 = performance.now();
      while (i < ids.length && performance.now() - t0 < 12) {
        const k = ids[i++];
        if (k === 'back') Art.back();
        else if (k[0] === 'c') Art.card(k.slice(2));
        else Art.portrait(k.slice(2));
        const entry = cache[k];
        if (!entry || entry.raster) continue;
        entry.raster = 'pending';
        const img = new Image();
        img.onload = () => {
          try {
            const isP = k[0] === 'p' || k === 'back';
            const cw = k === 'back' ? 200 : isP ? 240 : 400,
              ch = k === 'back' ? 280 : isP ? 240 : 280;
            const cv = document.createElement('canvas');
            cv.width = cw;
            cv.height = ch;
            cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
            cv.toBlob((b) => {
              if (!b) return;
              entry.url = URL.createObjectURL(b);
              entry.raster = 'done';
              if (onEach) onEach(k, entry.url);
            }, 'image/png');
          } catch (e) {
            entry.raster = 'failed';
          }
        };
        img.onerror = () => (entry.raster = 'failed');
        img.src = toURI(entry.svg);
      }
      if (i < ids.length) (window.requestIdleCallback || ((f) => setTimeout(f, 30)))(step);
    };
    step();
  };

  // faction crests (inline SVG strings)
  Art.crest = {
    site: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><rect x="8" y="8" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke="currentColor" stroke-width="2"/></svg>',
    level: '<svg viewBox="0 0 24 24"><path d="M6 22V4h12v18" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 22V8h6v14" fill="currentColor" opacity=".35"/><circle cx="14" cy="15" r="1.2" fill="currentColor"/></svg>',
    dream: '<svg viewBox="0 0 24 24"><path d="M15 3a8 8 0 1 0 6 13 7 7 0 0 1-6-13z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 5l1 2 2 .5-2 .5-1 2-1-2-2-.5 2-.5z" fill="currentColor"/></svg>',
    neutral: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 2l3 4 3-4" fill="none" stroke="currentColor" stroke-width="2"/><rect x="6" y="9" width="10" height="8" rx="1.5" fill="currentColor" opacity=".35"/></svg>',
  };
  Art.PAL = PAL;
})();
