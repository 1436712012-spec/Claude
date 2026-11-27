import { THRESH } from '../sim/tank.js';
import { TIER, GRAV } from '../sim/weapons.js';
import { WAVES } from '../data/consts.js';
import { DEFS } from '../sim/arsenal.js';

const FONT = "'Orbitron','Rajdhani','Segoe UI','Microsoft YaHei','PingFang SC',sans-serif";
const CY = '#19f0ff', MG = '#ff2fb4', AM = '#ffb347';
const NAMES = ['黄昏', '暮色', '入夜', '深夜', '午夜', '夜半', '拂晓前', '黎明'];

export class Hud {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1; this.w = 1280; this.h = 720;
    this.showFps = false; this.fps = 0;
  }
  resize(w, h, dpr) {
    this.cssW = w; this.cssH = h; this.dpr = dpr;
    this.c.width = Math.floor(w * dpr); this.c.height = Math.floor(h * dpr);
    this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
    this.s = Math.max(0.6, Math.min(1.35, h / 720));
    this.w = w / this.s; this.h = h / this.s;
  }
  /** world -> logical HUD coordinates */
  ws(g, wx, wy) { const p = g.camera.worldToScreen(wx, wy); return { x: p.x / this.s, y: p.y / this.s }; }
  glowText(str, x, y, size, color, align = 'left', weight = 700, blur = 12, spacing = 0) {
    const ctx = this.ctx;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
    ctx.shadowColor = color; ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.globalAlpha *= 0.55;
    ctx.fillText(str, x, y);
    ctx.globalAlpha /= 0.55;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  draw(g, input) {
    const ctx = this.ctx;
    this.touch = input.touch.enabled;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.setTransform(this.dpr * this.s, 0, 0, this.dpr * this.s, 0, 0);
    const W = this.w, H = this.h;
    const cam = g.camera;
    this.ppw = (this.cssH / (2 * cam.halfH)) / this.s;
    this.cards = null;
    if (g.state === 'title') { this.drawWorldTexts(g); this.drawTitle(g); this.drawTouch(g, input, true); return; }
    if (g.state !== 'paused' && g.state !== 'pick') this.drawCrosshair(g, input);
    this.drawWorldTexts(g);
    this.drawOffscreen(g);
    this.drawHUD(g);
    this.drawArms(g);
    this.drawBanner(g);
    if (g.state === 'over') this.drawEnd(g, false);
    if (g.state === 'win') this.drawEnd(g, true);
    if (g.state === 'paused') { ctx.fillStyle = 'rgba(4,2,14,0.55)'; ctx.fillRect(0, 0, W, H); }
    if (g.state === 'pick') this.drawPick(g, input);
    this.drawTouch(g, input, false);
    if (this.showFps) { ctx.fillStyle = '#9f9'; ctx.font = `12px monospace`; ctx.textAlign = 'left'; ctx.fillText(this.fps.toFixed(0) + ' fps', 8, H - 8); }
  }

  drawWorldTexts(g) {
    const ctx = this.ctx;
    for (const t of g.fx.texts) {
      const p = this.ws(g, t.x, t.y);
      const a = Math.min(1, t.life / (t.max * 0.5));
      const pop = 1 + Math.max(0, (t.life / t.max - 0.85)) * 3;
      ctx.globalAlpha = a;
      this.glowText(t.str, p.x, p.y, t.size * pop, t.color, 'center', 800, 10);
      ctx.globalAlpha = 1;
    }
  }

  drawCrosshair(g, input) {
    const ctx = this.ctx, t = g.tank;
    if (t.dead) return;
    const ap = this.ws(g, t.aimX, t.aimY), ax = ap.x, ay = ap.y, ppw = this.ppw;
    // ballistic preview (no wind: reading the wind is the player's job)
    const m = t.muzzle();
    const flak = t.charging && t.charge >= THRESH[0];
    const v = flak ? TIER[1].speed : TIER[0].speed;
    let x = m.x, y = m.y, vx = Math.cos(t.barrelAng) * v, vy = Math.sin(t.barrelAng) * v;
    const maxT = flak ? Math.min(t.tof || 1, 2.5) : 0.9;
    ctx.fillStyle = 'rgba(120,235,255,0.55)';
    for (let tt = 0, i = 0; tt < maxT; tt += 0.045, i++) {
      vy -= GRAV * 0.045; x += vx * 0.045; y += vy * 0.045;
      if (i % 2) continue;
      const s = this.ws(g, x, y);
      ctx.globalAlpha = 0.6 * (1 - tt / maxT * 0.8);
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.8, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const ready = t.cd <= 0;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.lineWidth = 2;
    const col = t.charging ? (t.tier >= 3 ? MG : CY) : (ready ? '#bff' : '#567');
    ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, 6.283); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18); ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); ctx.stroke();
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 2, 0, 6.283); ctx.fill();
    if (t.charging) {
      const k = Math.min(1, t.charge / 1.7);
      ctx.lineWidth = 4;
      ctx.strokeStyle = t.tier >= 3 ? MG : CY;
      ctx.beginPath(); ctx.arc(0, 0, 33, -Math.PI / 2, -Math.PI / 2 + k * 6.283); ctx.stroke();
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = t.tier > i ? (i === 2 ? MG : AM) : 'rgba(150,170,210,0.35)';
        ctx.beginPath(); ctx.arc(0, 0, 41, -Math.PI / 2 + i * 2.0944 + 0.14, -Math.PI / 2 + (i + 1) * 2.0944 - 0.14); ctx.stroke();
      }
      if (t.tier >= 1) {
        const R = TIER[t.tier].R * (g.combo.odT > 0 ? 1.25 : 1) * ppw;
        ctx.shadowBlur = 0;
        ctx.fillStyle = t.tier >= 3 ? 'rgba(255,47,180,0.07)' : 'rgba(25,240,255,0.07)';
        ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.fill();
        ctx.setLineDash([6, 8]); ctx.lineWidth = 1.5;
        ctx.strokeStyle = t.tier >= 3 ? 'rgba(255,120,210,0.8)' : 'rgba(120,235,255,0.8)';
        ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  drawOffscreen(g) {
    const ctx = this.ctx, W = this.w, H = this.h;
    for (const e of g.enemies) {
      if (e.state === 'dying') continue;
      const p = this.ws(g, e.x, e.y);
      if (p.x > 0 && p.x < W) continue;
      const left = p.x <= 0;
      const x = left ? 14 : W - 14, y = Math.max(80, Math.min(H * 0.6, p.y));
      const col = e.kind === 'bomber' ? '#ff4a5a' : e.kind === 'diver' ? AM : CY;
      const s = e.kind === 'bomber' ? 11 : 8;
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(g.time * 8 + e.id);
      ctx.beginPath();
      ctx.moveTo(x + (left ? -s * 0.4 : s * 0.4), y);
      ctx.lineTo(x + (left ? s : -s), y - s * 0.8);
      ctx.lineTo(x + (left ? s : -s), y + s * 0.8);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
  }

  drawHUD(g) {
    const ctx = this.ctx, W = this.w, H = this.h, t = g.tank, c = g.combo;
    // top-left wave & score
    const n = Math.min(WAVES, Math.max(1, g.wave.n));
    this.glowText('第 ' + n + ' 波 · ' + NAMES[n - 1], 28, 34, 17, CY, 'left', 700, 10, 2);
    this.glowText(String(g.score).padStart(7, '0'), 28, 66, 34, '#fff', 'left', 800, 14, 3);
    // wave progress pips
    for (let i = 0; i < WAVES; i++) {
      ctx.fillStyle = i < n - 1 ? CY : i === n - 1 ? AM : 'rgba(150,170,210,0.3)';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = i === n - 1 ? 8 : 0;
      ctx.fillRect(28 + i * 16, 90, 12, 3);
    }
    ctx.shadowBlur = 0;

    // top-right: town lamps
    const hs = g.town.houses;
    const lx0 = W - 28 - (this.touch ? 70 : 0);
    this.glowText('灯火', lx0 - hs.length * 20, 34, 14, AM, 'left', 700, 8, 2);
    for (let i = 0; i < hs.length; i++) {
      const x = lx0 - (hs.length - i) * 20 + 10, y = 66;
      const on = hs[i].alive;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, on ? 16 : 6);
      gr.addColorStop(0, on ? 'rgba(255,200,110,1)' : 'rgba(80,70,100,0.9)');
      gr.addColorStop(0.35, on ? 'rgba(255,170,70,0.55)' : 'rgba(60,50,80,0.4)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, on ? 16 : 6, 0, 6.283); ctx.fill();
      ctx.fillStyle = on ? '#fff3d0' : '#3a3050';
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 6.283); ctx.fill();
    }

    // wind flag, top center
    this.drawWind(g, W / 2, 46);

    // bottom-left bars
    const bx = 28, by = H - 74;
    this.glowText('装甲', bx, by - 14, 12, CY, 'left', 700, 6, 2);
    const segs = 22, sw = 10, gap = 3;
    const hp = Math.max(0, t.hp / t.hpMax);
    for (let i = 0; i < segs; i++) {
      const on = i < Math.ceil(hp * segs);
      const col = hp < 0.3 ? '#ff3a4a' : hp < 0.6 ? AM : CY;
      ctx.fillStyle = on ? col : 'rgba(120,140,180,0.22)';
      ctx.shadowColor = col; ctx.shadowBlur = on ? 6 : 0;
      ctx.fillRect(bx + i * (sw + gap), by, sw, 10);
    }
    ctx.shadowBlur = 0;
    // MG heat
    const hy = by + 20;
    ctx.fillStyle = 'rgba(120,140,180,0.22)'; ctx.fillRect(bx, hy, segs * (sw + gap) - gap, 4);
    ctx.fillStyle = t.overheat ? (Math.sin(g.time * 24) > 0 ? '#ff3a4a' : '#802030') : AM;
    ctx.fillRect(bx, hy, (segs * (sw + gap) - gap) * Math.min(1, t.heat), 4);
    this.glowText(t.overheat ? '机枪过热' : '机枪', bx + segs * (sw + gap) + 8, hy + 2, 11, t.overheat ? '#ff6a7a' : AM, 'left', 600, 4, 1);
    // overdrive meter bottom center
    const ow = Math.min(420, W * 0.34), ox = W / 2 - ow / 2, oy = H - 38;
    const od = c.odT > 0;
    const k = od ? c.odT / 6 : c.meter / 100;
    ctx.fillStyle = 'rgba(10,14,40,0.55)'; ctx.fillRect(ox - 3, oy - 3, ow + 6, 14);
    const gr = ctx.createLinearGradient(ox, 0, ox + ow, 0);
    gr.addColorStop(0, '#19f0ff'); gr.addColorStop(1, '#ff2fb4');
    ctx.fillStyle = gr; ctx.shadowColor = od || c.meter >= 100 ? '#7af' : '#000'; ctx.shadowBlur = od || c.meter >= 100 ? 16 : 0;
    ctx.fillRect(ox, oy, ow * k, 8);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(160,200,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(ox - 3, oy - 3, ow + 6, 14);
    if (od) this.glowText('OVERDRIVE', W / 2, oy - 18, 15, '#7af0ff', 'center', 800, 14, 6);
    else if (c.meter >= 100) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(g.time * 9); this.glowText('按 E 释放过载', W / 2, oy - 18, 15, '#fff', 'center', 800, 14, 4); ctx.globalAlpha = 1; }
    else this.glowText('过载', W / 2, oy - 16, 11, 'rgba(160,200,255,0.8)', 'center', 600, 4, 3);

    // combo
    if (c.n >= 2) {
      const x = W - 40, y = H * 0.45;
      const pulse = 1 + Math.max(0, c.t - 3.1) * 1.6;
      this.glowText('×' + c.n, x, y, 54 * pulse, c.n >= 8 ? MG : AM, 'right', 900, 20);
      this.glowText('连击', x, y + 40, 14, '#fff', 'right', 700, 6, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 100, y + 58, 100, 3);
      ctx.fillStyle = AM; ctx.fillRect(x - 100 * (c.t / 3.4), y + 58, 100 * (c.t / 3.4), 3);
    }

    // controls hint at start
    if (g.state === 'play' && g.time < 14 && g.wave.n === 1 && !this.touch) {
      const a = Math.min(1, (14 - g.time) / 2);
      ctx.globalAlpha = a * 0.9;
      this.glowText('按住左键蓄力 · 准星位置就是爆点 · 注意头顶风旗', W / 2, H - 168, 16, '#cfe', 'center', 600, 6, 2);
      this.glowText('A / D 行驶   右键 机枪   Q 导弹   空格 喷口   Esc 设置', W / 2, H - 192, 13, 'rgba(180,210,255,0.8)', 'center', 500, 4, 1);
      ctx.globalAlpha = 1;
    }
  }

  drawWind(g, x, y) {
    const ctx = this.ctx, v = g.wind.v, a = Math.abs(v);
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(190,210,255,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, -16); ctx.stroke();
    const dir = v >= 0 ? 1 : -1;
    const len = 14 + a * 52;
    ctx.fillStyle = CY; ctx.shadowColor = CY; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    const N = 10;
    const top = [], bot = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, wave = Math.sin(g.time * (4 + a * 8) - u * 6) * (2 + a * 6) * u;
      top.push([dir * len * u, -16 + wave + 2 * u]);
      bot.push([dir * len * u, -6 + wave + 6 * (1 - u) * 0 + 2 * u * 0]);
    }
    ctx.moveTo(top[0][0], top[0][1]);
    for (const p of top) ctx.lineTo(p[0], p[1]);
    for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1] + (1 - i / N) * 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    this.glowText('风 ' + (v >= 0 ? '→' : '←') + ' ' + (a * 10).toFixed(1), x, y + 34, 12, '#bde', 'center', 600, 4, 1);
  }

  drawBanner(g) {
    const b = g.banner;
    if (!b || g.state === 'over' || g.state === 'win') return;
    const ctx = this.ctx, W = this.w, H = this.h;
    const a = Math.min(1, b.t / 0.45, (b.life - b.t) / 0.6);
    if (a <= 0) return;
    const cy = H * 0.3;
    ctx.globalAlpha = a;
    const bw = W * 0.5 * Math.min(1, b.t / 0.5);
    const gr = ctx.createLinearGradient(W / 2 - bw, 0, W / 2 + bw, 0);
    gr.addColorStop(0, 'rgba(25,240,255,0)'); gr.addColorStop(0.5, 'rgba(25,240,255,0.9)'); gr.addColorStop(1, 'rgba(25,240,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(W / 2 - bw, cy - 46, bw * 2, 2); ctx.fillRect(W / 2 - bw, cy + 50, bw * 2, 2);
    this.glowText(b.text, W / 2, cy, 46, '#fff', 'center', 800, 22, 10);
    if (b.sub) this.glowText(b.sub, W / 2, cy + 32, 20, b.text.includes('肃清') ? AM : CY, 'center', 600, 10, 8);
    ctx.globalAlpha = 1;
  }

  drawTitle(g) {
    const ctx = this.ctx, W = this.w, H = this.h, t = performance.now() / 1000;
    const gr = ctx.createLinearGradient(0, H * 0.1, 0, H * 0.75);
    gr.addColorStop(0, 'rgba(4,2,16,0.0)'); gr.addColorStop(0.5, 'rgba(4,2,16,0.55)'); gr.addColorStop(1, 'rgba(4,2,16,0.0)');
    ctx.fillStyle = gr; ctx.fillRect(0, H * 0.1, W, H * 0.65);
    const cy = H * 0.36;
    this.glowText('NIGHTWATCH FLAK', W / 2, cy, Math.min(78, W * 0.068), '#ffffff', 'center', 900, 34, 14);
    // chromatic split accents
    ctx.globalAlpha = 0.5;
    this.glowText('NIGHTWATCH FLAK', W / 2 - 3, cy, Math.min(78, W * 0.068), MG, 'center', 900, 0, 14);
    this.glowText('NIGHTWATCH FLAK', W / 2 + 3, cy, Math.min(78, W * 0.068), CY, 'center', 900, 0, 14);
    ctx.globalAlpha = 1;
    this.glowText('守 夜 炮', W / 2, cy + 62, 26, AM, 'center', 700, 16, 14);
    ctx.fillStyle = 'rgba(4,2,16,0.5)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(W / 2 - 170, H * 0.62 - 24, 340, 48, 24) : ctx.rect(W / 2 - 170, H * 0.62 - 24, 340, 48); ctx.fill();
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 3.2);
    this.glowText(this.touch ? '轻触屏幕开始' : '点击或按任意键开始', W / 2, H * 0.62, 20, '#fff', 'center', 600, 12, 6);
    ctx.globalAlpha = 1;
    ctx.globalAlpha = 0.85;
    this.glowText(this.touch ? '左摇杆行驶 · 右侧拖动指定瞄准点 · 全部武器自动开火 · 点按按钮跳跃 / 过载' : 'A/D 行驶 · 鼠标瞄准 · 左键 按住蓄力、松开开火 · 右键 机枪 · Q 导弹 · E 过载 · 空格 喷口 · T 全自动', W / 2, H - 46, 14, 'rgba(190,215,255,0.9)', 'center', 500, 4, 1);
    this.glowText('守住身后小镇的灯火，撑过 8 波，直到黎明', W / 2, H - 22, 13, 'rgba(255,200,140,0.9)', 'center', 500, 4, 2);
    ctx.globalAlpha = 1;
  }

  hitCard(x, y) {
    if (!this.cards) return -1;
    for (let i = 0; i < this.cards.length; i++) { const c = this.cards[i]; if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return i; }
    return -1;
  }
  rrect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  rgb(c, a = 1) { return `rgba(${Math.round(Math.min(1, Math.pow(c[0], 1 / 2.2)) * 255)},${Math.round(Math.min(1, Math.pow(c[1], 1 / 2.2)) * 255)},${Math.round(Math.min(1, Math.pow(c[2], 1 / 2.2)) * 255)},${a})`; }
  wrap(text, maxW) {
    const ctx = this.ctx, lines = [];
    let cur = '';
    for (const ch of text) {
      if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /** weapon bar: every owned weapon with cooldown fill and level pips */
  drawArms(g) {
    const ctx = this.ctx, W = this.w, H = this.h, list = g.arms.list;
    const n = list.length, sz = 40, gap = 8, total = n * sz + (n - 1) * gap;
    const x0 = W / 2 - total / 2, y = H - 114;
    list.forEach((st, i) => {
      const d = DEFS[st.id], x = x0 + i * (sz + gap), col = this.rgb(d.col);
      const rdy = g.arms.ready(st);
      ctx.fillStyle = 'rgba(8,10,30,0.72)'; this.rrect(x, y, sz, sz, 8); ctx.fill();
      ctx.save(); this.rrect(x, y, sz, sz, 8); ctx.clip();
      ctx.fillStyle = this.rgb(d.col, 0.28); ctx.fillRect(x, y + sz * (1 - rdy), sz, sz * rdy);
      ctx.restore();
      const hot = rdy >= 0.999 && !d.passive;
      ctx.strokeStyle = col; ctx.lineWidth = hot ? 2 : 1.2; ctx.shadowColor = col; ctx.shadowBlur = hot ? 10 : 0;
      this.rrect(x, y, sz, sz, 8); ctx.stroke(); ctx.shadowBlur = 0;
      this.glowText(d.glyph, x + sz / 2, y + sz / 2 + 1, 21, col, 'center', 800, 8);
      for (let k = 0; k < st.lv; k++) { ctx.fillStyle = col; ctx.fillRect(x + sz / 2 - st.lv * 4 + k * 8 + 1, y + sz + 4, 6, 2.4); }
    });
    if (g.ctrl === 'auto' || g.ctrl === 'assist') this.glowText(g.ctrl === 'auto' ? '全自动' : '自动瞄准', W / 2, y - 12, 12, '#7af0ff', 'center', 700, 6, 3);
  }

  /** three-card weapon pick (start of run and after every wave) */
  drawPick(g, input) {
    const ctx = this.ctx, sp = Math.max(0.72, Math.min(1.3, this.cssH / 560));
    ctx.setTransform(this.dpr * sp, 0, 0, this.dpr * sp, 0, 0);
    const W = this.cssW / sp, H = this.cssH / sp;
    ctx.fillStyle = 'rgba(4,2,16,0.68)'; ctx.fillRect(0, 0, W, H);
    const t = Math.min(1, g.pickT / 0.35), e = 1 - Math.pow(1 - t, 3);
    ctx.globalAlpha = e;
    this.glowText(g.pickStart ? '选择开局武器' : '补给 · 选择武器或升级', W / 2, H * 0.12, 30, '#fff', 'center', 800, 20, 8);
    this.glowText('所有武器都会自动开火 · 你负责走位、风向与时机', W / 2, H * 0.12 + 36, 15, 'rgba(160,220,255,0.9)', 'center', 500, 6, 2);
    const cw = 236, ch = 318, gap = 26, n = g.offer.length;
    const x0 = W / 2 - (n * cw + (n - 1) * gap) / 2, y0 = H / 2 - ch / 2 + 22 + (1 - e) * 60;
    this.cards = [];
    g.offer.forEach((o, i) => {
      const d = DEFS[o.id], x = x0 + i * (cw + gap), y = y0;
      const col = this.rgb(d.col), colA = (a) => this.rgb(d.col, a);
      const hover = !this.touch && input.mx >= x * sp && input.mx <= (x + cw) * sp && input.my >= y * sp && input.my <= (y + ch) * sp;
      this.cards.push({ x: x * sp, y: y * sp, w: cw * sp, h: ch * sp });
      const lift = hover ? -8 : 0;
      ctx.save(); ctx.translate(0, lift);
      const gr = ctx.createLinearGradient(x, y, x, y + ch);
      gr.addColorStop(0, 'rgba(22,14,50,0.96)'); gr.addColorStop(1, 'rgba(8,6,26,0.96)');
      ctx.fillStyle = gr; this.rrect(x, y, cw, ch, 14); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = hover ? 3 : 2; ctx.shadowColor = col; ctx.shadowBlur = hover ? 26 : 12;
      this.rrect(x, y, cw, ch, 14); ctx.stroke(); ctx.shadowBlur = 0;
      // glyph medallion
      const cx = x + cw / 2, cy = y + 96;
      const rg = ctx.createRadialGradient(cx, cy, 4, cx, cy, 60);
      rg.addColorStop(0, colA(0.5)); rg.addColorStop(1, colA(0));
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, 60, 0, 6.283); ctx.fill();
      ctx.strokeStyle = colA(0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 40, 0, 6.283); ctx.stroke();
      this.glowText(d.glyph, cx, cy + 2, 46, col, 'center', 900, 16);
      // tag
      ctx.globalAlpha = e;
      this.glowText(o.lv === 0 ? 'NEW · 新武器' : `LV ${o.lv} → ${o.lv + 1}`, x + 16, y + 22, 13, o.lv === 0 ? '#7af0ff' : '#ffb347', 'left', 800, 6, 1);
      this.glowText(d.name, cx, y + 170, 22, '#fff', 'center', 800, 10, 2);
      ctx.font = `500 14px ${FONT}`;
      const lines = this.wrap(d.desc, cw - 40);
      ctx.fillStyle = 'rgba(205,220,255,0.92)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.slice(0, 4).forEach((ln, k) => ctx.fillText(ln, cx, y + 202 + k * 20));
      ctx.font = `600 13px ${FONT}`;
      const stat = d.stat(o.lv + 1);
      ctx.fillStyle = '#ffb347';
      const sl = this.wrap(stat, cw - 32);
      sl.slice(0, 2).forEach((ln, k) => ctx.fillText(ln, cx, y + ch - 44 + k * 17));
      ctx.fillStyle = 'rgba(150,170,210,0.7)'; ctx.textAlign = 'right'; ctx.font = `600 12px ${FONT}`;
      ctx.fillText(`[${i + 1}]`, x + cw - 12, y + 22);
      ctx.restore();
    });
    ctx.globalAlpha = 1;
    ctx.setTransform(this.dpr * this.s, 0, 0, this.dpr * this.s, 0, 0);
  }

  /** touch controls are drawn in raw css pixels */
  drawTouch(g, input, title) {
    if (!input.touch.enabled || title || g.state === 'pick' || g.state === 'paused') return;
    const ctx = this.ctx, T = input.touch, R = input.stickR;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // stick
    const st = T.stick, act = st.id >= 0;
    const bx = act ? st.bx : input.stickHome.x, by = act ? st.by : input.stickHome.y;
    ctx.lineWidth = 2;
    ctx.strokeStyle = act ? 'rgba(120,235,255,0.85)' : 'rgba(120,235,255,0.35)';
    ctx.fillStyle = act ? 'rgba(20,40,80,0.35)' : 'rgba(20,40,80,0.18)';
    ctx.beginPath(); ctx.arc(bx, by, R, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(160,235,255,0.5)';
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(bx + sgn * (R * 0.62), by); ctx.lineTo(bx + sgn * (R * 0.42), by - 9); ctx.lineTo(bx + sgn * (R * 0.42), by + 9); ctx.closePath(); ctx.fill(); }
    const tx = act ? st.x : bx, ty = act ? st.y : by;
    ctx.fillStyle = act ? 'rgba(160,240,255,0.7)' : 'rgba(160,240,255,0.28)';
    ctx.shadowColor = '#19f0ff'; ctx.shadowBlur = act ? 14 : 0;
    ctx.beginPath(); ctx.arc(tx, ty, R * 0.38, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
    // aim finger
    if (T.aim.active) {
      const ap = g.camera.worldToScreen(g.tank.aimX, g.tank.aimY);
      ctx.strokeStyle = 'rgba(255,200,120,0.6)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(T.aim.x, T.aim.y); ctx.lineTo(ap.x, ap.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,200,120,0.35)'; ctx.beginPath(); ctx.arc(T.aim.x, T.aim.y, 22, 0, 6.283); ctx.fill();
    }
    // buttons
    const B = input.btns, c = g.combo;
    const circle = (b, active, col) => {
      ctx.fillStyle = active ? 'rgba(40,70,120,0.55)' : 'rgba(14,20,50,0.42)';
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.shadowColor = col; ctx.shadowBlur = active ? 16 : 6;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    };
    circle(B.jump, T.btn.jump >= 0, '#7af0ff');
    ctx.strokeStyle = '#d8faff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(B.jump.x - B.jump.r * 0.38, B.jump.y + B.jump.r * 0.16); ctx.lineTo(B.jump.x, B.jump.y - B.jump.r * 0.28); ctx.lineTo(B.jump.x + B.jump.r * 0.38, B.jump.y + B.jump.r * 0.16); ctx.stroke();
    const od = c.odT > 0, ready = c.meter >= 100;
    circle(B.od, T.btn.od >= 0, ready || od ? '#ff2fb4' : 'rgba(255,47,180,0.5)');
    const k = od ? c.odT / 6 : c.meter / 100;
    ctx.strokeStyle = od ? '#7af0ff' : '#ff7ad0'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(B.od.x, B.od.y, B.od.r + 6, -Math.PI / 2, -Math.PI / 2 + k * 6.283); ctx.stroke();
    ctx.fillStyle = ready || od ? '#fff' : 'rgba(255,200,240,0.6)';
    ctx.shadowColor = '#ff2fb4'; ctx.shadowBlur = ready ? 14 + 8 * Math.sin(g.time * 9) : 0;
    const bo = B.od, u = bo.r * 0.5;
    ctx.beginPath(); ctx.moveTo(bo.x + u * 0.15, bo.y - u); ctx.lineTo(bo.x - u * 0.55, bo.y + u * 0.1); ctx.lineTo(bo.x - u * 0.02, bo.y + u * 0.1); ctx.lineTo(bo.x - u * 0.15, bo.y + u); ctx.lineTo(bo.x + u * 0.55, bo.y - u * 0.15); ctx.lineTo(bo.x + u * 0.02, bo.y - u * 0.15); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // pause
    const bp = B.pause;
    ctx.fillStyle = 'rgba(14,20,50,0.4)'; ctx.strokeStyle = 'rgba(190,210,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bp.x, bp.y, bp.r, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(220,235,255,0.85)'; ctx.fillRect(bp.x - bp.r * 0.32, bp.y - bp.r * 0.4, bp.r * 0.22, bp.r * 0.8); ctx.fillRect(bp.x + bp.r * 0.1, bp.y - bp.r * 0.4, bp.r * 0.22, bp.r * 0.8);
    // first-time hint
    if (g.state === 'play' && g.time < 14 && g.wave.n === 1) {
      ctx.globalAlpha = Math.min(1, (14 - g.time) / 2) * 0.9;
      ctx.font = `600 14px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#cfe';
      ctx.fillText('左摇杆行驶 · 上推跳跃 · 右侧拖动指定瞄准点 · 武器自动开火', this.cssW / 2, this.cssH * 0.62);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(this.dpr * this.s, 0, 0, this.dpr * this.s, 0, 0);
  }

  drawEnd(g, win) {
    const ctx = this.ctx, W = this.w, H = this.h;
    const a = Math.min(1, g.overT / 1.2 || 1);
    ctx.fillStyle = win ? 'rgba(40,20,20,0.35)' : 'rgba(6,2,14,0.6)';
    ctx.globalAlpha = win ? 1 : Math.min(1, g.overT / 1.5);
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    if (!win && g.overT < 1.4) return;
    const cy = H * 0.3;
    const title = win ? '黎 明' : (g.tank.dead ? '战车损毁' : '灯火尽灭');
    this.glowText(title, W / 2, cy, 64, win ? AM : '#ff5a6a', 'center', 900, 30, 14);
    const lines = [
      ['评分', String(g.score).padStart(7, '0')],
      ['守住的灯火', g.town.litCount + ' / ' + g.town.houses.length],
      ['击落', g.kills + ' 架   (连锁 ' + g.chains + ')'],
      ['抵达波次', Math.max(1, g.wave.n) + ' / ' + WAVES],
    ];
    lines.forEach((l, i) => {
      this.glowText(l[0], W / 2 - 20, cy + 70 + i * 34, 17, 'rgba(180,200,240,0.9)', 'right', 600, 4, 2);
      this.glowText(l[1], W / 2 + 20, cy + 70 + i * 34, 22, '#fff', 'left', 800, 8, 2);
    });
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 300);
    this.glowText((this.touch ? '轻触屏幕再来一局' : '点击或按 Enter 再来一局'), W / 2, cy + 70 + lines.length * 34 + 30, 18, CY, 'center', 700, 10, 4);
    ctx.globalAlpha = 1;
  }
}
