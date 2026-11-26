// 程序化纹理：全部在运行时用 canvas 绘制，不加载任何外部图片。
import * as THREE from 'three';
import { mulberry32 } from '../sim/noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, opts = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (opts.repeat) t.repeat.set(opts.repeat, opts.repeat);
  t.needsUpdate = true;
  return t;
}

function hsl(h, s, l, a = 1) { return `hsla(${h},${s}%,${l}%,${a})`; }

// 叶片图集：4×4 簇，带透明通道（树冠从下往上看时，光从缝隙里漏下来）
export function leafAtlas() {
  const S = 1024, N = 4, cell = S / N;
  const [c, g] = canvas(S, S);
  const r = mulberry32(11);
  g.clearRect(0, 0, S, S);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const cx = i * cell + cell / 2, cy = j * cell + cell / 2;
      const broad = (i + j) % 3;
      const n = broad === 0 ? 26 : broad === 1 ? 46 : 70;
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * cell * 0.36;
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        const len = (broad === 0 ? 46 : broad === 1 ? 30 : 18) * (0.7 + r() * 0.6);
        const wid = len * (broad === 0 ? 0.42 : 0.3);
        const rot = a + (r() - 0.5) * 1.4;
        g.save();
        g.translate(x, y); g.rotate(rot);
        const hue = 95 + r() * 40, sat = 35 + r() * 25, lig = 18 + r() * 22;
        g.fillStyle = hsl(hue, sat, lig);
        g.beginPath();
        g.moveTo(0, -len / 2);
        g.quadraticCurveTo(wid, 0, 0, len / 2);
        g.quadraticCurveTo(-wid, 0, 0, -len / 2);
        g.fill();
        g.strokeStyle = hsl(hue, sat - 10, lig + 12, 0.55);
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, -len / 2); g.lineTo(0, len / 2); g.stroke();
        // 湿润高光
        g.fillStyle = hsl(hue - 10, 20, lig + 30, 0.18);
        g.beginPath(); g.ellipse(wid * 0.2, -len * 0.1, wid * 0.25, len * 0.25, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      // 细枝
      g.strokeStyle = 'rgba(40,30,20,0.8)';
      g.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        g.beginPath(); g.moveTo(cx, cy + cell * 0.45);
        g.quadraticCurveTo(cx + (r() - 0.5) * cell * 0.5, cy, cx + (r() - 0.5) * cell * 0.6, cy - cell * 0.3);
        g.stroke();
      }
    }
  }
  const t = tex(c);
  t.anisotropy = 8;
  return t;
}

// 蕨类叶片
export function fernTexture() {
  const [c, g] = canvas(256, 512);
  const r = mulberry32(5);
  g.clearRect(0, 0, 256, 512);
  for (let f = 0; f < 3; f++) {
    const ox = 128 + (f - 1) * 50;
    g.strokeStyle = hsl(100, 40, 22);
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(ox, 512); g.quadraticCurveTo(ox + (f - 1) * 30, 260, ox + (f - 1) * 60, 20); g.stroke();
    for (let k = 0; k < 34; k++) {
      const t = k / 34;
      const x = ox + (f - 1) * 60 * t * t, y = 512 - t * 490;
      const len = 60 * Math.sin(Math.PI * (0.15 + t * 0.85)) * (0.8 + r() * 0.3);
      for (const s of [-1, 1]) {
        g.fillStyle = hsl(95 + r() * 25, 45, 20 + r() * 18);
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + s * len * 0.6, y - 8, x + s * len, y - 16 - t * 10);
        g.quadraticCurveTo(x + s * len * 0.5, y + 2, x, y + 4);
        g.fill();
      }
    }
  }
  return tex(c, { clamp: true });
}

// 棕榈叶
export function palmTexture() {
  const [c, g] = canvas(128, 512);
  const r = mulberry32(8);
  g.clearRect(0, 0, 128, 512);
  g.strokeStyle = hsl(80, 30, 25); g.lineWidth = 4;
  g.beginPath(); g.moveTo(64, 512); g.lineTo(64, 0); g.stroke();
  for (let k = 0; k < 70; k++) {
    const y = 500 - k * 7;
    const len = 58 * Math.sin(Math.PI * (0.08 + (k / 70) * 0.9));
    for (const s of [-1, 1]) {
      g.strokeStyle = hsl(85 + r() * 30, 40, 18 + r() * 15);
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + s * len * 0.5, y - 6, 64 + s * len, y + 14); g.stroke();
    }
  }
  return tex(c, { clamp: true });
}

// 树皮：竖向纹理 + 苔藓斑
export function barkTexture() {
  const [c, g] = canvas(256, 512);
  const r = mulberry32(21);
  g.fillStyle = '#4A3A2C'; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 900; i++) {
    const x = r() * 256, y = r() * 512;
    g.fillStyle = r() < 0.5 ? 'rgba(25,18,12,0.35)' : 'rgba(110,95,75,0.18)';
    g.fillRect(x, y, 1 + r() * 3, 8 + r() * 50);
  }
  for (let i = 0; i < 70; i++) {
    const x = r() * 256, y = r() * 512, rr = 6 + r() * 28;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(70,95,45,0.75)'); gr.addColorStop(1, 'rgba(70,95,45,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
  // 地衣白斑
  for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(190,195,175,0.22)'; g.beginPath(); g.arc(r() * 256, r() * 512, 1 + r() * 3, 0, 6.3); g.fill(); }
  return tex(c);
}

// 地面细节：落叶、泥和小树枝（灰度，乘在顶点色上）
export function groundDetail() {
  const S = 512;
  const [c, g] = canvas(S, S);
  const r = mulberry32(33);
  g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 24000; i++) {
    const v = 100 + r() * 90;
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S, len = 4 + r() * 12;
    const v = r() < 0.5 ? 60 + r() * 40 : 150 + r() * 70;
    g.save(); g.translate(x, y); g.rotate(r() * 6.3);
    g.fillStyle = `rgba(${v},${v * 0.95},${v * 0.85},0.75)`;
    g.beginPath(); g.ellipse(0, 0, len * 0.35, len * 0.5, 0, 0, 6.3); g.fill();
    g.restore();
  }
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(55,45,35,0.7)`; g.lineWidth = 1 + r() * 1.5;
    const x = r() * S, y = r() * S, a = r() * 6.3, l = 10 + r() * 40;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return tex(c);
}

// 混凝土 / 碎石地坪
export function concreteTexture() {
  const [c, g] = canvas(256, 256);
  const r = mulberry32(44);
  g.fillStyle = '#9a9a96'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 120 + r() * 70; g.fillStyle = `rgba(${v},${v},${v * 0.97},0.3)`; g.fillRect(r() * 256, r() * 256, 1, 1); }
  for (let i = 0; i < 30; i++) {
    const x = r() * 256, y = r() * 256, rr = 10 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(50,45,35,0.25)'); gr.addColorStop(1, 'rgba(50,45,35,0)');
    g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  g.strokeStyle = 'rgba(40,40,40,0.35)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.moveTo(128, 0); g.lineTo(128, 256); g.stroke();
  return tex(c);
}

// 白色复合板（研究所）：拼缝 + 雨痕
export function panelTexture() {
  const [c, g] = canvas(256, 256);
  const r = mulberry32(55);
  g.fillStyle = '#e2e6e8'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(80,90,95,0.45)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); }
  g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  for (let i = 0; i < 140; i++) {
    const x = r() * 256, y = r() * 200;
    const gr = g.createLinearGradient(x, y, x, y + 30 + r() * 60);
    gr.addColorStop(0, 'rgba(90,85,70,0.18)'); gr.addColorStop(1, 'rgba(90,85,70,0)');
    g.fillStyle = gr; g.fillRect(x, y, 1 + r() * 3, 90);
  }
  return tex(c);
}

// 波纹铁皮（机库、集装箱）
export function corrugatedTexture() {
  const [c, g] = canvas(256, 256);
  const r = mulberry32(66);
  for (let x = 0; x < 256; x++) {
    const v = 150 + Math.sin((x / 256) * Math.PI * 2 * 16) * 45;
    g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, 256);
  }
  for (let i = 0; i < 70; i++) {
    const x = r() * 256, y = r() * 256, rr = 6 + r() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(110,60,30,0.45)'); gr.addColorStop(1, 'rgba(110,60,30,0)');
    g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(40,30,20,0.25)'; g.fillRect(r() * 256, r() * 256, 1, 20 + r() * 80); }
  return tex(c);
}

// 铁丝网（透明）
export function chainlinkTexture() {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(170,175,170,1)'; g.lineWidth = 2.2;
  for (let i = -128; i < 256; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke();
  }
  return tex(c, { linear: false });
}

// 窗格（城市楼宇、营房）：随机亮灯
export function windowTexture(seed = 7, warm = true) {
  const [c, g] = canvas(256, 256);
  const r = mulberry32(seed);
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 8; i++) {
      if (r() < 0.42) {
        const hueWarm = warm ? 35 + r() * 15 : 200;
        g.fillStyle = hsl(hueWarm, warm ? 70 : 20, 45 + r() * 30);
        g.fillRect(i * 32 + 5, j * 16 + 3, 22, 10);
        if (r() < 0.3) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(i * 32 + 5 + r() * 12, j * 16 + 3, 6, 10); }
      }
    }
  }
  return tex(c);
}

// 实验楼室内灯光（冷白）
export function labInteriorTexture() {
  const [c, g] = canvas(256, 128);
  const r = mulberry32(77);
  g.fillStyle = '#05080a'; g.fillRect(0, 0, 256, 128);
  for (let f = 0; f < 3; f++) {
    for (let i = 0; i < 16; i++) {
      if (r() < 0.75) {
        g.fillStyle = `rgba(225,235,240,${0.5 + r() * 0.5})`;
        g.fillRect(i * 16 + 1, f * 42 + 6, 14, 3);
      }
      if (r() < 0.25) { g.fillStyle = 'rgba(30,40,45,0.9)'; g.fillRect(i * 16 + 3, f * 42 + 18, 10, 20); }
    }
  }
  return tex(c, { clamp: true });
}

export function asphaltTexture() {
  const [c, g] = canvas(256, 256);
  const r = mulberry32(88);
  g.fillStyle = '#2a2a2b'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 12000; i++) { const v = 30 + r() * 50; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(r() * 256, r() * 256, 1, 1); }
  return tex(c);
}

// 软光斑（光晕、烟雾、火花）
export function glowSprite() {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.65)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c, { clamp: true });
}

export function smokeSprite() {
  const [c, g] = canvas(128, 128);
  const r = mulberry32(99);
  for (let i = 0; i < 40; i++) {
    const x = 64 + (r() - 0.5) * 50, y = 64 + (r() - 0.5) * 50, rr = 12 + r() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  return tex(c, { clamp: true });
}

export function leafParticle() {
  const [c, g] = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = '#6b6a3a';
  g.beginPath(); g.ellipse(32, 32, 10, 24, 0.4, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(40,40,20,0.8)'; g.beginPath(); g.moveTo(22, 54); g.lineTo(42, 10); g.stroke();
  return tex(c, { clamp: true });
}

// 噪声（着色器用）
export function noiseTexture() {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const r = mulberry32(123);
  for (let i = 0; i < data.length; i++) data[i] = r() * 255;
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// 树冠覆盖网格 → 纹理（树冠下的天光遮蔽）
export function canopyTexture(terrain) {
  const N = Math.round(Math.sqrt(terrain.canopyGrid.length));
  const data = new Uint8Array(N * N);
  // 轻微模糊，避免硬边
  const src = terrain.canopyGrid;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        s += src[jj * N + ii]; n++;
      }
      data[j * N + i] = s / n;
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export function makeTextures(terrain) {
  return {
    leaf: leafAtlas(),
    fern: fernTexture(),
    palm: palmTexture(),
    bark: barkTexture(),
    ground: groundDetail(),
    concrete: concreteTexture(),
    panel: panelTexture(),
    corrugated: corrugatedTexture(),
    chainlink: chainlinkTexture(),
    windows: windowTexture(7, true),
    windowsCool: windowTexture(13, false),
    labInterior: labInteriorTexture(),
    asphalt: asphaltTexture(),
    glow: glowSprite(),
    smoke: smokeSprite(),
    leafP: leafParticle(),
    noise: noiseTexture(),
    canopy: canopyTexture(terrain),
  };
}
