// The Library of Babel — application state machine.
//
// modes: intro · walk · climb · fall · grab · pull · read · return · travel · switch

import { LIBRARIES } from './babel/alphabet.js';
import { originHex, cloneHex, hexSeeds, localIndex } from './babel/address.js';
import { readBookAsync, randomBookAsync } from './babel/client.js';
import { log10Books, log10Hexagons } from './babel/search.js';
import { Renderer, QUALITY } from './render/renderer.js';
import { G, castRay, bookPose, resolveWalk, walkSDF, hexApo, WALL_ANGLES } from './world/geometry.js';
import { cameraBasis, rayDir } from './world/camera.js';
import { Reader } from './ui/reader.js';
import { SearchPanel } from './ui/search.js';
import { coordHTML, coordGlyphs, coordFullGlyphs, pow10HTML, fmtInt } from './ui/format.js';
import { decodeShare } from './ui/share.js';

const $ = (s) => document.querySelector(s);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const angLerp = (a, b, t) => a + wrapAng(b - a) * t;
function wrapAng(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

class App {
  constructor() {
    document.body.classList.add('intro');
    this.canvas = $('#stage');
    try {
      this.renderer = new Renderer(this.canvas);
    } catch (e) {
      $('#fatal').hidden = false;
      $('#fatal p').textContent = e.message;
      throw e;
    }
    const q = new URLSearchParams(location.search);
    this.renderer.quality = q.get('q') || (matchMedia('(pointer: coarse)').matches ? 'medium' : 'high');
    if (q.get('scale')) {
      this.renderer.scale = +q.get('scale');
      this.renderer.minScale = this.renderer.maxScale = +q.get('scale');
    }
    this.lib = LIBRARIES.latin;
    this.anchor = originHex(this.lib);
    this.seeds = hexSeeds(this.anchor);
    this.pos = [0, G.EYE, -2.55];
    this.yaw = Math.PI / 2;
    this.pitch = -0.1;
    this.mode = 'intro';
    this.anim = null;
    this.keys = new Set();
    this.hover = null;
    this.hide = [0, 0, -1, 0];
    this.sel = { center: [0, 0, 0], rot: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [-1, 0, 0], seed: 0 };
    this.mark = null;
    this.markGlow = 0;
    this.warp = 0;
    this.fall = 0;
    this.fade = 1;
    this.fadeCol = [0.02, 0.014, 0.01];
    this.exposure = 1;
    this.time = 0;
    this.still = false;
    this.lastMove = 0;
    this.hudDirty = true;
    this.joy = null;
    this.vel = 0;

    this.reader = new Reader($('#reader'), { onClose: () => this.closeBook() });
    this.search = new SearchPanel($('#panelSearch'), this);
    this.bindUI();
    this.bindInput();
    this.renderAbout();
    this.updateHUD();
    this.updateQualityLabel();
    document.fonts?.ready.then(() => this.renderer.refreshGlyphs());
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    this.shared = decodeShare(location.hash);
    if (this.shared) {
      const note = $('#introNote');
      note.hidden = false;
      note.innerHTML = `有人在这座图书馆里给你留了一句话。它印在${LIBRARIES[this.shared.lib].name}的某一本书里，那本书的位置由这句话唯一确定。`;
      $(this.shared.lib === 'han' ? '#enterHan' : '#enterLatin').classList.add('primary');
      $(this.shared.lib === 'han' ? '#enterLatin' : '#enterHan').classList.remove('primary');
    }
    if (q.get('enter') === '1') this.enter();
  }

  // ------------------------------------------------------------ coordinates

  setAnchor(hex) {
    this.anchor = hex;
    this.seeds = hexSeeds(hex);
    this.hudDirty = true;
  }

  stepAnchor(axis, d) {
    this.anchor[axis].add(d);
    const i = axis === 'gallery' ? 0 : 1;
    this.seeds[i] = (this.seeds[i] + d) >>> 0;
    this.hudDirty = true;
  }

  rebase() {
    let dx = 0;
    let dy = 0;
    while (this.pos[0] > G.PX / 2) { this.pos[0] -= G.PX; dx -= G.PX; this.stepAnchor('gallery', 1); }
    while (this.pos[0] < -G.PX / 2) { this.pos[0] += G.PX; dx += G.PX; this.stepAnchor('gallery', -1); }
    while (this.pos[1] >= G.HF) { this.pos[1] -= G.HF; dy -= G.HF; this.stepAnchor('level', 1); }
    while (this.pos[1] < 0) { this.pos[1] += G.HF; dy += G.HF; this.stepAnchor('level', -1); }
    if ((dx || dy) && this.anim && this.anim.shift) this.anim.shift(dx, dy);
  }

  absHex(cx, cy) {
    const h = cloneHex(this.anchor);
    if (cx) h.gallery.add(cx);
    if (cy) h.level.add(cy);
    return h;
  }

  // ------------------------------------------------------------ UI wiring

  bindUI() {
    $('#enterLatin').onclick = () => this.enter('latin');
    $('#enterHan').onclick = () => this.enter('han');
    $('#btnSearch').onclick = () => this.openPanel('search');
    $('#btnAbout').onclick = () => this.openPanel('about');
    $('#btnRandom').onclick = () => this.randomJourney();
    $('#btnLib').onclick = () => this.switchLibrary();
    $('#btnQuality').onclick = () => {
      const order = ['high', 'medium', 'low'];
      this.renderer.quality = order[(order.indexOf(this.renderer.quality) + 1) % order.length];
      this.updateQualityLabel();
      this.still = false;
    };
    $('#actUp').onclick = () => this.climb(1);
    $('#actDown').onclick = () => this.climb(-1);
    $('#actLeap').onclick = () => this.leap();
    $('#actGrab').onclick = () => this.grab();
    $('#panelScrim').onclick = () => this.closePanels();
    $('#locName').onclick = () => this.openPanel('about', true);
  }

  updateQualityLabel() {
    $('#btnQuality').textContent = '画质 · ' + QUALITY[this.renderer.quality].label;
  }

  openPanel(name, focusName = false) {
    if (this.mode === 'intro' || this.reader.isOpen()) return;
    $('#panelSearch').hidden = name !== 'search';
    $('#panelAbout').hidden = name !== 'about';
    $('#panelScrim').hidden = false;
    document.body.classList.add('panel-open');
    if (name === 'about') {
      this.renderAbout();
      if (focusName) $('#aboutName')?.scrollIntoView({ block: 'start' });
    }
    if (name === 'search') setTimeout(() => $('#searchText')?.focus({ preventScroll: true }), 50);
  }

  closePanels() {
    $('#panelSearch').hidden = true;
    $('#panelAbout').hidden = true;
    $('#panelScrim').hidden = true;
    document.body.classList.remove('panel-open');
  }

  panelOpen() {
    return !$('#panelSearch').hidden || !$('#panelAbout').hidden;
  }

  enter(libId) {
    if (this.mode !== 'intro') return;
    if (libId && libId !== this.lib.id) {
      this.lib = LIBRARIES[libId];
      this.setAnchor(originHex(this.lib));
      this.search.onLibraryChange();
    }
    document.body.classList.remove('intro');
    document.body.classList.toggle('lib-han', this.lib.id === 'han');
    $('#intro').classList.add('leaving');
    setTimeout(() => ($('#intro').hidden = true), 1200);
    const from = { pos: [...this.pos], yaw: this.yaw, pitch: this.pitch };
    this.startAnim({
      dur: 1.6,
      update: (t) => {
        const e = ease(t);
        this.pos[1] = lerp(from.pos[1], G.EYE, e);
        this.pitch = lerp(from.pitch, -0.05, e);
        this.exposure = lerp(0.75, 1, e);
      },
      done: () => {
        this.mode = 'walk';
        const sh = this.shared;
        if (sh && sh.lib === this.lib.id) {
          this.shared = null;
          this.search.followLink(sh.text);
        }
      },
      mode: 'enter',
    });
    this.hudDirty = true;
    this.renderAbout();
  }

  // ------------------------------------------------------------ input

  bindInput() {
    const c = this.canvas;
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('textarea,input')) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (this.reader.isOpen()) this.closeBook();
        else this.closePanels();
        return;
      }
      if (this.reader.isOpen()) {
        if (k === 'arrowright') this.reader.turn(this.lib.vertical ? -1 : 1);
        if (k === 'arrowleft') this.reader.turn(this.lib.vertical ? 1 : -1);
        return;
      }
      if (this.mode === 'intro' && (k === 'enter' || k === ' ')) return this.enter();
      if (k === '/') { e.preventDefault(); this.openPanel('search'); return; }
      if (this.panelOpen()) return;
      this.keys.add(k);
      if (k === 'e') this.climb(1);
      if (k === 'q') this.climb(-1);
      if (k === 'f') this.leap();
      if (k === ' ') { e.preventDefault(); this.grab(); }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    let drag = null;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const touchLeft = e.pointerType !== 'mouse' && e.clientX < window.innerWidth * 0.42;
      if (touchLeft && this.mode === 'walk') {
        this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, y: 0 };
        this.showJoy(e.clientX, e.clientY, 0, 0);
        return;
      }
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, type: e.pointerType };
    });
    c.addEventListener('pointermove', (e) => {
      if (this.joy && e.pointerId === this.joy.id) {
        const dx = e.clientX - this.joy.x0;
        const dy = e.clientY - this.joy.y0;
        const l = Math.min(1, Math.hypot(dx, dy) / 60);
        const a = Math.atan2(dy, dx);
        this.joy.x = Math.cos(a) * l;
        this.joy.y = Math.sin(a) * l;
        this.showJoy(this.joy.x0, this.joy.y0, this.joy.x * 60, this.joy.y * 60);
        return;
      }
      if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        if (drag.moved > 4 && this.canLook()) {
          const k = e.pointerType === 'mouse' ? 0.0042 : 0.006;
          this.yaw += dx * k;
          this.pitch = clamp(this.pitch - dy * k, -1.45, 1.45);
          this.touched();
        }
        return;
      }
      if (e.pointerType === 'mouse') this.pickHover(e.clientX, e.clientY);
    });
    const end = (e) => {
      if (this.joy && e.pointerId === this.joy.id) {
        this.joy = null;
        this.showJoy();
        return;
      }
      if (drag && e.pointerId === drag.id) {
        if (drag.moved < 8 && e.type === 'pointerup') this.click(e.clientX, e.clientY);
        drag = null;
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => {
      if (this.hover && !drag) this.setHover(null);
    });
  }

  showJoy(x, y, kx, ky) {
    const j = $('#joy');
    if (x === undefined) return (j.hidden = true);
    j.hidden = false;
    j.style.left = x + 'px';
    j.style.top = y + 'px';
    j.firstElementChild.style.transform = `translate(${kx}px, ${ky}px)`;
  }

  canLook() {
    return ['walk', 'intro', 'fall', 'enter'].includes(this.mode);
  }

  touched() {
    this.lastMove = this.time;
    this.still = false;
  }

  screenRay(x, y) {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((x - r.left) / r.width) * 2 - 1;
    const ny = 1 - ((y - r.top) / r.height) * 2;
    return rayDir(cameraBasis(this.yaw, this.pitch), nx, ny, r.width / r.height, this.tanHalf());
  }

  tanHalf() {
    return Math.tan((this.fov || 68) * Math.PI / 360);
  }

  pickHover(x, y) {
    if (this.mode !== 'walk' || this.panelOpen()) return this.setHover(null);
    const hit = castRay(this.pos, this.screenRay(x, y), 6);
    if (hit.kind === 'book' && hit.t < 4.6) this.setHover(hit);
    else this.setHover(null);
  }

  setHover(hit) {
    const prev = this.hover;
    this.hover = hit;
    const same = prev && hit && prev.cx === hit.cx && prev.cy === hit.cy && prev.wall === hit.wall && prev.shelfB === hit.shelfB && prev.slot === hit.slot;
    if (!same) {
      this.still = false;
      this.canvas.style.cursor = hit ? 'pointer' : '';
      const tip = $('#tip');
      if (hit) {
        tip.hidden = false;
        tip.textContent = `第 ${hit.wall + 1} 壁 · 第 ${hit.shelf + 1} 架 · 第 ${hit.slot + 1} 卷`;
      } else tip.hidden = true;
    }
  }

  click(x, y) {
    if (this.mode === 'intro') return;
    if (this.mode !== 'walk') return;
    const hit = castRay(this.pos, this.screenRay(x, y), 6);
    if (hit.kind === 'book') {
      if (hit.t > 4.6) return this.toast('走近一些才能够到那本书');
      this.openBook(hit);
    }
  }

  // ------------------------------------------------------------ toasts & HUD

  toast(text, ms = 2200) {
    const t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => (t.hidden = true), ms);
  }

  updateHUD() {
    const a = this.anchor;
    const lib = this.lib;
    $('#hudLib').textContent = `${lib.name} · ${lib.nameEn}`;
    const row = (c) => (c.magnitude().exact !== null ? coordHTML(c) : `${coordHTML(c)}<code>${coordGlyphs(lib, c, 10)}</code>`);
    $('#hudCorridor').innerHTML = row(a.corridor);
    $('#hudGallery').innerHTML = row(a.gallery);
    $('#hudLevel').innerHTML = row(a.level);
    $('#btnLib').textContent = lib.id === 'latin' ? '去汉字卷' : '去拉丁卷';
    this.hudDirty = false;
  }

  rollHUD() {
    // odometer while travelling: random glyphs scroll past
    const lib = this.lib;
    const rnd = () => {
      let s = '';
      for (let i = 0; i < 10; i++) s += lib.glyphs[Math.floor(Math.random() * lib.K)];
      return s.replace(/ /g, '·');
    };
    for (const id of ['#hudCorridor', '#hudGallery', '#hudLevel']) {
      $(id).innerHTML = `<span class="num rolling">≈ ?.??<span class="x">×</span>10<sup>${fmtInt(Math.floor(Math.random() * 1e6))}</sup></span><code>${rnd()}</code>`;
    }
  }

  hints() {
    const lx = this.pos[0];
    const z = this.pos[2];
    const side = Math.sign(lx || 1);
    const wx = lx - side * (G.PX / 2);
    const nearStair = this.mode === 'walk' && Math.abs(wx) < 1.25 && z > -0.2 && Math.abs(lx) > G.A;
    const nearRail = this.mode === 'walk' && hexApo(lx, z) < G.AS + 0.95 && Math.abs(lx) < G.A;
    $('#actUp').hidden = !nearStair;
    $('#actDown').hidden = !nearStair;
    $('#actLeap').hidden = !nearRail;
    $('#actGrab').hidden = this.mode !== 'fall';
    const coarse = matchMedia('(pointer: coarse)').matches;
    let h = '';
    if (this.mode === 'walk') {
      if (nearStair) h = coarse ? '旋梯就在旁边，上下各一层' : '<kbd>E</kbd> 上楼 · <kbd>Q</kbd> 下楼';
      else if (nearRail) h = coarse ? '栏杆之外，竖井没有底' : '<kbd>F</kbd> 越过栏杆，坠入竖井';
      else h = coarse ? '左侧拖动行走 · 右侧拖动环顾 · 轻点书脊取书' : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 行走 · 拖动环顾 · 点击书脊取书 · <kbd>/</kbd> 寻书';
    } else if (this.mode === 'fall') h = coarse ? '' : '<kbd>空格</kbd> 抓住栏杆';
    else if (this.mode === 'travel') h = '穿过回廊……';
    else if (this.mode === 'climb') h = '沿旋梯而行';
    const el = $('#hint');
    if (el.dataset.h !== h) {
      el.innerHTML = h;
      el.dataset.h = h;
    }
  }

  renderAbout() {
    const lib = this.lib;
    const el = $('#panelAbout');
    const a = this.anchor;
    el.innerHTML = `
      <header class="panel-head">
        <div><div class="eyebrow">How the Library works</div><h2>这座图书馆</h2></div>
        <button class="btn ghost close" data-close aria-label="关闭">✕</button>
      </header>
      <blockquote class="epigraph">宇宙（别人称之为图书馆）由数目不定、或许无限的六角形回廊构成。<cite>—— 博尔赫斯《巴别图书馆》，1941（本页译文为自译）</cite></blockquote>
      <p>这里是那座图书馆的一个可以走进去的版本。每间回廊有 4 面书墙，每面 5 层书架，每层 32 卷；每卷 410 页，每页 ${lib.lines} ${lib.vertical ? '列' : '行'}、每${lib.vertical ? '列' : '行'} ${lib.cols} 个字符。${lib.name}的字母表共 <b>${fmtInt(lib.K)}</b> 个符号。</p>
      <dl class="facts">
        <dt>一本书的字符数</dt><dd>${fmtInt(lib.bookLen)}</dd>
        <dt>馆藏总数</dt><dd>${pow10HTML(log10Books(lib))} 本</dd>
        <dt>六角形回廊</dt><dd>${pow10HTML(log10Hexagons(lib))} 间</dd>
        <dt>每个坐标的位数</dt><dd>${fmtInt(lib.coordLen)} 位 ${fmtInt(lib.K)} 进制数</dd>
      </dl>
      <h3>每一本书恰好一册</h3>
      <p>书的全部内容被看作一个 ${fmtInt(lib.bookLen)} 位的 ${fmtInt(lib.K)} 进制数。一个四轮 Feistel 网络把它一一映射为另一个同样长的数，也就是这本书的<em>地址</em>。地址除以 640，余数决定墙、架、卷；商的各位数字三三交错，拆成三个自然数，再用“之”字映射（0, 1, 2, 3, 4 → 0, −1, 1, −2, 2）变成廊、室、层三个整数。</p>
      <p>每一步都可逆，所以反过来算：走进任意一间回廊、抽出任意一本书，它的内容都由坐标唯一确定，而所有可能的书都在某处各有一册。搜索并不是生成文字，而是计算这段文字所在的那本书早已站在哪里。</p>
      <p>全部运算只用 ${fmtInt(lib.K)} 进制的逐位乘除、加一、减半，不依赖大整数库，所以在手机上也能在几十毫秒内解出一整本书。</p>
      <h3 id="aboutName">你此刻所在之处的全名</h3>
      <p class="small">以下是三个坐标用本馆字母写出的完整形式。在原点附近它们很短；去过一本被搜索出来的书之后，每一个都长达数十万字符。</p>
      <div class="fullname"><b>廊</b> ${coordHTML(a.corridor)}<pre>${coordFullGlyphs(lib, a.corridor).slice(0, 20000)}</pre>
      <b>室</b> ${coordHTML(a.gallery)}<pre>${coordFullGlyphs(lib, a.gallery).slice(0, 20000)}</pre>
      <b>层</b> ${coordHTML(a.level)}<pre>${coordFullGlyphs(lib, a.level).slice(0, 20000)}</pre></div>
      <h3>操作</h3>
      <ul class="keys">
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 或方向键行走，按住 <kbd>Shift</kbd> 快走；拖动鼠标环顾</li>
        <li>点击书脊抽出一本书；<kbd>←</kbd><kbd>→</kbd> 翻页，<kbd>Esc</kbd> 合上</li>
        <li>在走廊的旋梯旁按 <kbd>E</kbd> / <kbd>Q</kbd> 上下楼；在竖井栏杆旁按 <kbd>F</kbd> 跃下，<kbd>空格</kbd> 抓住栏杆</li>
        <li><kbd>/</kbd> 打开寻书</li>
      </ul>`;
    el.querySelector('[data-close]').onclick = () => this.closePanels();
  }

  // ------------------------------------------------------------ animation core

  startAnim(a) {
    a.t = 0;
    this.anim = a;
    if (a.mode) this.mode = a.mode;
  }

  stepAnim(dt) {
    const a = this.anim;
    if (!a) return;
    a.t += dt;
    const k = a.dur ? clamp(a.t / a.dur, 0, 1) : 0;
    a.update(k, dt);
    if (a.dur && a.t >= a.dur) {
      this.anim = null;
      a.done && a.done();
    }
  }

  // ------------------------------------------------------------ walking

  walk(dt) {
    let fx = 0;
    let fz = 0;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) fz += 1;
    if (k.has('s') || k.has('arrowdown')) fz -= 1;
    if (k.has('d') || k.has('arrowright')) fx += 1;
    if (k.has('a') || k.has('arrowleft')) fx -= 1;
    if (this.joy) {
      fx += this.joy.x;
      fz -= this.joy.y;
    }
    const len = Math.hypot(fx, fz);
    const speed = k.has('shift') ? 4.2 : 2.1;
    const target = len > 0 ? speed * Math.min(1, len) : 0;
    this.vel = lerp(this.vel, target, 1 - Math.exp(-dt * 10));
    if (len > 0.01) this.dir = [fx / len, fz / len];
    if (this.vel < 0.01 || !this.dir) return;
    const b = cameraBasis(this.yaw, 0);
    const mx = (b.f[0] * this.dir[1] + b.r[0] * this.dir[0]) * this.vel * dt;
    const mz = (b.f[2] * this.dir[1] + b.r[2] * this.dir[0]) * this.vel * dt;
    const [nx, nz] = resolveWalk(this.pos[0] + mx, this.pos[2] + mz);
    this.pos[0] = nx;
    this.pos[2] = nz;
    this.bob = (this.bob || 0) + this.vel * dt * 5.5;
    this.pos[1] = G.EYE + Math.sin(this.bob) * 0.018 * Math.min(1, this.vel / 2);
    this.touched();
  }

  // ------------------------------------------------------------ stairs

  climb(dir) {
    if (this.mode !== 'walk') return;
    const lx = this.pos[0];
    const z = this.pos[2];
    const side = Math.sign(lx || 1);
    const wx = lx - side * (G.PX / 2);
    if (!(Math.abs(wx) < 1.25 && z > -0.2 && Math.abs(lx) > G.A)) return this.toast('旋梯在走廊一侧的拱门里');
    const wc = [side * (G.PX / 2), G.ZW];
    const R = 0.95;
    const start = { pos: [...this.pos], yaw: this.yaw, pitch: this.pitch };
    const landing = [wc[0], G.ZW - R];
    const th0 = -Math.PI / 2;
    const turn = 2 * Math.PI * dir;
    let yBase = 0;
    const T1 = 0.7;
    const T2 = REDUCED ? 1.2 : 3.6;
    const T3 = 0.8;
    const dur = T1 + T2 + T3;
    this.startAnim({
      mode: 'climb',
      dur,
      shift: (dx, dy) => {
        yBase += dy;
        start.pos[0] += dx;
        start.pos[1] += dy;
        wc[0] += dx;
        landing[0] += dx;
      },
      update: (k) => {
        const t = k * dur;
        if (t < T1) {
          const e = ease(t / T1);
          this.pos[0] = lerp(start.pos[0], landing[0], e);
          this.pos[2] = lerp(start.pos[2], landing[1], e);
          this.pos[1] = lerp(start.pos[1], G.EYE + yBase, e);
          this.yaw = angLerp(start.yaw, th0 + (dir > 0 ? Math.PI / 2 : -Math.PI / 2), e);
          this.pitch = lerp(start.pitch, dir > 0 ? 0.22 : -0.28, e);
        } else if (t < T1 + T2) {
          const e = ease((t - T1) / T2);
          const th = th0 + turn * e;
          this.pos[0] = wc[0] + Math.cos(th) * R;
          this.pos[2] = wc[1] + Math.sin(th) * R;
          this.pos[1] = G.EYE + yBase + G.HF * dir * e + Math.sin(e * Math.PI * 16) * 0.02;
          this.yaw = th + (dir > 0 ? Math.PI / 2 : -Math.PI / 2) + (dir > 0 ? 0.35 : -0.35);
          this.pitch = dir > 0 ? 0.22 : -0.28;
        } else {
          const e = ease((t - T1 - T2) / T3);
          this.pos[0] = landing[0];
          this.pos[2] = lerp(landing[1], 0.1, e);
          this.pos[1] = G.EYE + yBase + G.HF * dir;
          this.yaw = angLerp(th0 + (dir > 0 ? Math.PI / 2 : -Math.PI / 2) + (dir > 0 ? 0.35 : -0.35), side > 0 ? Math.PI : 0, e);
          this.pitch = lerp(dir > 0 ? 0.22 : -0.28, 0, e);
        }
        this.touched();
      },
      done: () => {
        this.mode = 'walk';
        this.toast(dir > 0 ? '上了一层' : '下了一层', 1400);
      },
    });
  }

  // ------------------------------------------------------------ the fall

  leap() {
    if (this.mode !== 'walk') return;
    if (!(hexApo(this.pos[0], this.pos[2]) < G.AS + 0.95 && Math.abs(this.pos[0]) < G.A)) return;
    const start = { pos: [...this.pos], pitch: this.pitch };
    this.startAnim({
      mode: 'leapin',
      dur: 1.1,
      update: (k) => {
        const e = ease(k);
        this.pos[0] = lerp(start.pos[0], 0, e);
        this.pos[2] = lerp(start.pos[2], 0, e);
        this.pos[1] = start.pos[1] + Math.sin(e * Math.PI) * 0.5;
        this.pitch = lerp(start.pitch, -0.9, e);
        this.touched();
      },
      done: () => {
        this.mode = 'fall';
        this.vy = 0;
        this.fallStart = this.time;
      },
    });
  }

  fallStep(dt) {
    this.vy = Math.max(-52, this.vy - 9.81 * dt);
    this.pos[1] += this.vy * dt;
    this.pos[0] = lerp(this.pos[0], 0, 1 - Math.exp(-dt * 2));
    this.pos[2] = lerp(this.pos[2], 0, 1 - Math.exp(-dt * 2));
    this.fall = Math.min(0.85, (-this.vy / 52) * 0.85);
    this.touched();
  }

  grab() {
    if (this.mode !== 'fall') return;
    const v = this.vy;
    const T = clamp(-v / 22, 0.6, 2.4);
    const y0 = this.pos[1];
    const yStop = y0 + (v * T) / 2;
    const k = Math.floor((yStop - G.EYE) / G.HF);
    let yT = G.EYE + k * G.HF;
    let yStart = y0;
    const pitch0 = this.pitch;
    this.startAnim({
      mode: 'grab',
      dur: T + 1.0,
      shift: (dx, dy) => { yT += dy; yStart += dy; },
      update: (kk) => {
        const t = kk * (T + 1.0);
        if (t < T) {
          const e = t / T;
          // decelerate: position follows a curve whose slope matches the fall speed at the start
          const s = 1 - Math.pow(1 - e, 2);
          this.pos[1] = lerp(yStart, yT, s);
          this.fall = 0.85 * (1 - e) * Math.min(1, -v / 52);
        } else {
          const e = ease((t - T) / 1.0);
          this.pos[1] = yT;
          this.pos[2] = lerp(0, -(G.AS + 0.75), e);
          this.pitch = lerp(pitch0, 0, e);
          this.fall = 0;
        }
        this.touched();
      },
      done: () => {
        this.mode = 'walk';
        this.fall = 0;
        const [x, z] = resolveWalk(this.pos[0], this.pos[2]);
        this.pos[0] = x;
        this.pos[2] = z;
        this.toast('抓住了栏杆。这是另一层，和刚才那层一模一样。', 2600);
      },
    });
  }

  // ------------------------------------------------------------ books

  bookTarget() {
    const b = cameraBasis(this.yaw, this.pitch);
    const c = [this.pos[0] + b.f[0] * 0.6 - b.u[0] * 0.03, this.pos[1] + b.f[1] * 0.6 - 0.03, this.pos[2] + b.f[2] * 0.6 - b.u[2] * 0.03];
    const alpha = Math.atan2(-b.f[2], -b.f[0]);
    return { c, alpha };
  }

  setSel(center, alpha, half, seed, tilt = 0) {
    const X = [Math.cos(alpha), 0, Math.sin(alpha)];
    let Y = [0, 1, 0];
    let Z = [Math.sin(alpha), 0, -Math.cos(alpha)];
    if (tilt) {
      // rotate Y and Z about X
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      const Y2 = [Y[0] * ct + Z[0] * st, Y[1] * ct + Z[1] * st, Y[2] * ct + Z[2] * st];
      const Z2 = [Z[0] * ct - Y[0] * st, Z[1] * ct - Y[1] * st, Z[2] * ct - Y[2] * st];
      Y = Y2;
      Z = Z2;
    }
    this.sel = { center, rot: [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]], half, seed };
  }

  openBook(hit, extra = {}) {
    if (this.mode !== 'walk' && this.mode !== 'arrive') return;
    this.setHover(null);
    const { cx, cy, wall, shelfB, slot } = hit;
    const pose = bookPose(this.seeds, cx, cy, wall, shelfB, slot);
    const shelf = G.NSHELF - 1 - shelfB;
    const hex = this.absHex(cx, cy);
    const meta = { seed: pose.seed, hex, wall, shelf, volume: slot, local: localIndex(wall, shelf, slot), hit: extra.hit || null };
    const bookP = readBookAsync(this.lib, hex, meta.local);
    this.hide = [cx, cy, wall, shelfB * 64 + slot];
    const th = WALL_ANGLES[wall];
    const n = [Math.cos(th), 0, Math.sin(th)];
    const alpha0 = th + Math.PI / 2;
    const c0 = pose.center;
    const c1 = [c0[0] - n[0] * 0.34, c0[1] + 0.02, c0[2] - n[2] * 0.34];
    const tgt = this.bookTarget();
    let alphaT = tgt.alpha;
    while (alphaT - alpha0 > Math.PI) alphaT -= 2 * Math.PI;
    while (alphaT - alpha0 < -Math.PI) alphaT += 2 * Math.PI;
    this.opened = { hit, pose, meta, c0, c1, alpha0 };
    const T1 = 0.5;
    const T2 = 0.85;
    this.startAnim({
      mode: 'pull',
      dur: T1 + T2,
      update: (k) => {
        const t = k * (T1 + T2);
        if (t < T1) {
          const e = ease(t / T1);
          this.setSel([lerp(c0[0], c1[0], e), lerp(c0[1], c1[1], e), lerp(c0[2], c1[2], e)], alpha0, pose.half, pose.seed);
        } else {
          const e = ease((t - T1) / T2);
          const tg = this.bookTarget();
          const c = [lerp(c1[0], tg.c[0], e), lerp(c1[1], tg.c[1], e) + Math.sin(e * Math.PI) * 0.12, lerp(c1[2], tg.c[2], e)];
          this.setSel(c, lerp(alpha0, alphaT, e), pose.half, pose.seed, Math.sin(e * Math.PI) * 0.4);
          if (e > 0.55) document.body.classList.add('reading');
        }
        this.touched();
      },
      done: () => {
        this.mode = 'read';
        this.reader.open(this.lib, meta);
        bookP.then((book) => {
          if (this.opened && this.opened.meta === meta) this.reader.setBook(book);
        }).catch((e) => this.toast('这本书读不出来：' + e.message));
      },
    });
  }

  closeBook() {
    if (!this.reader.isOpen() || !this.opened) return;
    this.reader.close();
    document.body.classList.remove('reading');
    const { pose, c0, c1, alpha0 } = this.opened;
    const from = this.bookTarget();
    const T = 0.9;
    this.startAnim({
      mode: 'return',
      dur: T,
      update: (k) => {
        if (k < 0.6) {
          const e = ease(k / 0.6);
          this.setSel([lerp(from.c[0], c1[0], e), lerp(from.c[1], c1[1], e), lerp(from.c[2], c1[2], e)], angLerp(from.alpha, alpha0, e), pose.half, pose.seed);
        } else {
          const e = ease((k - 0.6) / 0.4);
          this.setSel([lerp(c1[0], c0[0], e), lerp(c1[1], c0[1], e), lerp(c1[2], c0[2], e)], alpha0, pose.half, pose.seed);
        }
        this.touched();
      },
      done: () => {
        this.sel.half = [-1, 0, 0];
        this.hide = [0, 0, -1, 0];
        this.opened = null;
        this.mode = 'walk';
      },
    });
  }

  // ------------------------------------------------------------ travel

  async randomJourney() {
    if (this.mode !== 'walk') return;
    this.toast('随机抽取一本书……', 1500);
    const r = await randomBookAsync(this.lib);
    this.travelTo({ ...r, page: 0, offset: 0, length: 0, random: true });
  }

  travelTo(res) {
    if (this.mode !== 'walk') {
      if (this.panelOpen()) this.closePanels();
      if (this.mode !== 'walk') return;
    }
    this.closePanels();
    const N = 12;
    const shelfB = G.NSHELF - 1 - res.shelf;
    const slot = res.volume;
    const wall = res.wall;
    const start = { pos: [...this.pos], yaw: this.yaw, pitch: this.pitch };
    const TA = 1.0;
    const TB = REDUCED ? 0.6 : 2.6;
    const TC = REDUCED ? 0.8 : 2.2;
    const TD = 1.5;
    let switched = false;
    let xC0 = null;
    let xEnd = 0;
    const th = WALL_ANGLES[wall];
    const n = [Math.cos(th), Math.sin(th)];
    const tvec = [-Math.sin(th), Math.cos(th)];
    const uc = -G.W2 + (slot + 0.5) * G.SW;
    const stand = [n[0] * (G.A - 1.45) + tvec[0] * uc, n[1] * (G.A - 1.45) + tvec[1] * uc];
    const bookY = G.Y0 + shelfB * G.HS + 0.17;
    const lookPitch = Math.atan2(bookY - G.EYE, 1.45);
    const lookYaw = Math.atan2(n[1], n[0]);
    const anim = {
      mode: 'travel',
      dur: TA + TB + TC + TD,
      shift: (dx) => {
        xEnd += dx;
        if (xC0 !== null) xC0 += dx;
      },
      update: (k, dt) => {
        const t = k * anim.dur;
        if (t < TA) {
          const e = ease(t / TA);
          this.pos[1] = lerp(start.pos[1], G.EYE, e);
          this.pos[2] = lerp(start.pos[2], 0, e);
          this.yaw = angLerp(start.yaw, 0, e);
          this.pitch = lerp(start.pitch, 0, e);
        } else if (t < TA + TB) {
          // accelerate down the corridor through real neighbouring galleries
          const e = (t - TA) / TB;
          const v = 4 + easeIn(Math.min(1, e * 1.4)) * 70;
          this.pos[0] += v * dt;
          this.pos[2] = 0;
          this.warp = Math.min(1, e * 1.6);
          this.fov = 68 + this.warp * 22;
          if (!switched && e > 0.55) {
            // at full blur, slip into the target corridor N galleries short of the book
            switched = true;
            const h = cloneHex(res.hex);
            h.gallery.add(-N);
            this.setAnchor(h);
            xEnd = N * G.PX;
          }
          if (Math.random() < 0.5) this.rollHUD();
        } else if (t < TA + TB + TC) {
          const e = (t - TA - TB) / TC;
          if (xC0 === null) xC0 = this.pos[0];
          this.pos[0] = xC0 + (xEnd - xC0) * (1 - Math.pow(1 - e, 3));
          this.warp = Math.max(0, 1 - e * 1.6);
          this.fov = 68 + this.warp * 22;
          this.hudDirty = true;
        } else {
          if (!anim.arrived) {
            anim.arrived = true;
            this.setAnchor(cloneHex(res.hex)); // exact, whatever the float path did
            this.pos[0] = 0;
            this.warp = 0;
            this.fov = 68;
            this.mark = [0, 0, wall, shelfB * 64 + slot];
            this.hudDirty = true;
          }
          const e = ease((t - TA - TB - TC) / TD);
          this.pos[0] = lerp(0, stand[0], e);
          this.pos[2] = lerp(0, stand[1], e);
          this.yaw = angLerp(0, lookYaw, e);
          this.pitch = lerp(0, lookPitch, e);
          this.markGlow = e;
        }
        this.touched();
      },
      done: () => {
        this.mode = 'arrive';
        this.markGlow = 1;
        setTimeout(() => {
          this.markGlow = 0;
          this.mark = null;
          this.mode = 'walk';
          const hit = { cx: 0, cy: 0, wall, shelfB, shelf: res.shelf, slot };
          const extra = res.random ? {} : { hit: { page: res.page, offset: res.offset, length: res.length } };
          this.openBook(hit, extra);
        }, 1400);
      },
    };
    this.startAnim(anim);
  }

  // ------------------------------------------------------------ library switch

  switchLibrary() {
    if (this.mode !== 'walk') return;
    const next = this.lib.id === 'latin' ? LIBRARIES.han : LIBRARIES.latin;
    const start = this.fade;
    let swapped = false;
    this.startAnim({
      mode: 'switch',
      dur: 2.0,
      update: (k) => {
        if (k < 0.45) this.fade = lerp(start, 1, ease(k / 0.45));
        else {
          if (!swapped) {
            swapped = true;
            this.lib = next;
            document.body.classList.toggle('lib-han', next.id === 'han');
            this.setAnchor(originHex(next));
            this.pos = [0, G.EYE, -2.55];
            this.yaw = Math.PI / 2;
            this.pitch = -0.1;
            this.search.onLibraryChange();
            this.renderAbout();
          }
          this.fade = lerp(1, 0, ease((k - 0.45) / 0.55));
        }
        this.touched();
      },
      done: () => {
        this.mode = 'walk';
        this.toast(`${next.name}：${fmtInt(next.K)} 个符号，另一个宇宙`, 2600);
      },
    });
  }

  // ------------------------------------------------------------ frame

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const camBefore = this.pos.join() + this.yaw + this.pitch;

    if (this.mode === 'intro') {
      this.yaw += dt * 0.045;
      this.pitch = -0.12 + Math.sin(this.time * 0.13) * 0.18;
      this.fade = Math.max(0, this.fade - dt * 0.6);
      this.exposure = 0.75;
    } else if (this.fade > 0 && this.mode !== 'switch') this.fade = Math.max(0, this.fade - dt);
    if (this.mode === 'walk' && !this.panelOpen()) this.walk(dt);
    if (this.mode === 'fall') this.fallStep(dt);
    this.stepAnim(dt);
    this.rebase();
    if (this.mode !== 'travel' && this.hudDirty) this.updateHUD();
    this.hints();

    const moved = camBefore !== this.pos.join() + this.yaw + this.pitch;
    if (moved) this.still = false;
    else if (this.time - this.lastMove > 0.15 && !this.anim && this.mode !== 'fall') this.still = true;

    const skip = this.mode === 'read' && this.still && this.renderer.accumN > 8;
    if (!skip) {
      const b = cameraBasis(this.yaw, this.pitch);
      const hv = this.hover;
      this.renderer.adapt(dt * 1000, this.still);
      this.renderer.render({
        camPos: this.pos,
        camRot: b.mat,
        tanHalf: this.tanHalf(),
        time: this.time,
        seeds: this.seeds,
        lib: this.lib.id === 'latin' ? 0 : 1,
        hover: hv ? [hv.cx, hv.cy, hv.wall, hv.shelfB * 64 + hv.slot] : [0, 0, -1, 0],
        hide: this.hide,
        sel: this.sel,
        mark: this.mark || [0, 0, -1, 0],
        markGlow: this.markGlow,
        exposure: this.exposure,
        warp: this.warp,
        warpCenter: [0.5, 0.5],
        fall: this.fall,
        fade: this.fade,
        fadeCol: this.fadeCol,
        bloom: 1,
        still: this.still && !this.markGlow,
      });
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}

window.__babel = new App();
