import { THRESH } from '../sim/tank.js';
import { TIER, GRAV } from '../sim/weapons.js';
import { WAVES } from '../sim/game.js';

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
    this.w = w; this.h = h; this.dpr = dpr;
    this.c.width = Math.floor(w * dpr); this.c.height = Math.floor(h * dpr);
    this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
  }
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
    const ctx = this.ctx, W = this.w, H = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cam = g.camera, ppw = H / (2 * cam.halfH);
    this.ppw = ppw;
    if (g.state === 'title') { this.drawWorldTexts(g); this.drawTitle(g); return; }
    if (g.state !== 'paused') this.drawCrosshair(g, input);
    this.drawWorldTexts(g);
    this.drawOffscreen(g);
    this.drawHUD(g);
    this.drawBanner(g);
    if (g.state === 'over') this.drawEnd(g, false);
    if (g.state === 'win') this.drawEnd(g, true);
    if (g.state === 'paused') { ctx.fillStyle = 'rgba(4,2,14,0.55)'; ctx.fillRect(0, 0, W, H); }
    if (this.showFps) { ctx.fillStyle = '#9f9'; ctx.font = `12px monospace`; ctx.textAlign = 'left'; ctx.fillText(this.fps.toFixed(0) + ' fps', 8, H - 8); }
  }

  drawWorldTexts(g) {
    const ctx = this.ctx;
    for (const t of g.fx.texts) {
      const p = g.camera.worldToScreen(t.x, t.y);
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
    const ax = input.aimX, ay = input.aimY, ppw = this.ppw;
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
      const s = g.camera.worldToScreen(x, y);
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
      // progress ring + tier arcs
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
    const ctx = this.ctx, cam = g.camera, W = this.w, H = this.h;
    for (const e of g.enemies) {
      if (e.state === 'dying') continue;
      const p = cam.worldToScreen(e.x, e.y);
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
    const n = Math.max(1, g.wave.n);
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
    this.glowText('灯火', W - 28 - hs.length * 20, 34, 14, AM, 'left', 700, 8, 2);
    for (let i = 0; i < hs.length; i++) {
      const x = W - 28 - (hs.length - i) * 20 + 10, y = 66;
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
    // missiles
    const my = hy + 16;
    const rdy = t.missileCd <= 0;
    ctx.fillStyle = 'rgba(120,140,180,0.22)'; ctx.fillRect(bx, my, 80, 4);
    ctx.fillStyle = rdy ? MG : '#9a5a8a'; ctx.fillRect(bx, my, 80 * (1 - t.missileCd / 7), 4);
    this.glowText(rdy ? '导弹 [Q]' : '导弹', bx + 90, my + 2, 11, rdy ? MG : '#a89', 'left', 600, 4, 1);

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
    if (g.state === 'play' && g.time < 14 && g.wave.n === 1) {
      const a = Math.min(1, (14 - g.time) / 2);
      ctx.globalAlpha = a * 0.9;
      this.glowText('按住左键蓄力 · 准星位置就是爆点 · 注意头顶风旗', W / 2, H - 100, 16, '#cfe', 'center', 600, 6, 2);
      this.glowText('A / D 行驶   右键 机枪   Q 导弹   空格 喷口   Esc 设置', W / 2, H - 124, 13, 'rgba(180,210,255,0.8)', 'center', 500, 4, 1);
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
    this.glowText('点击或按任意键开始', W / 2, H * 0.62, 20, '#fff', 'center', 600, 12, 6);
    ctx.globalAlpha = 1;
    ctx.globalAlpha = 0.85;
    this.glowText('A/D 行驶 · 鼠标瞄准 · 左键 按住蓄力、松开开火 · 右键 机枪 · Q 导弹 · E 过载 · 空格 喷口', W / 2, H - 46, 14, 'rgba(190,215,255,0.9)', 'center', 500, 4, 1);
    this.glowText('守住身后小镇的灯火，撑过 8 波，直到黎明', W / 2, H - 22, 13, 'rgba(255,200,140,0.9)', 'center', 500, 4, 2);
    ctx.globalAlpha = 1;
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
    this.glowText('点击或按 Enter 再来一局', W / 2, cy + 70 + lines.length * 34 + 30, 18, CY, 'center', 700, 10, 4);
    ctx.globalAlpha = 1;
  }
}
