// The open book: a two-page spread (one page on narrow screens) with 3D page
// turns. Latin volumes are set in 40 lines of 80 characters; Han volumes in
// 40 vertical columns of 40 characters, read right to left like a traditional
// thread-bound book.

import { digitsToText } from '../babel/alphabet.js';
import { hash, rnd } from '../world/geometry.js';
import { hanSpineGlyphs, SPINE_LATIN } from '../render/renderer.js';
import { coordHTML } from './format.js';

const $ = (sel, root = document) => root.querySelector(sel);

export function spineTitle(lib, seed) {
  if (lib.id === 'latin') {
    const n = 3 + Math.floor(rnd(seed, 9) * 3);
    let s = '';
    for (let r = 0; r < n; r++) s += SPINE_LATIN[hash((seed + r * 7919) >>> 0) % 29];
    return s.replace(/ /g, '·');
  }
  const n = 3 + Math.floor(rnd(seed, 9) * 4);
  const g = hanSpineGlyphs();
  let s = '';
  for (let r = 0; r < n; r++) s += g[hash((seed + r * 7919) >>> 0) % 224];
  return s;
}

let paperURL = null;
function paperTexture() {
  if (paperURL) return paperURL;
  const c = document.createElement('canvas');
  c.width = c.height = 384;
  const g = c.getContext('2d');
  const img = g.createImageData(384, 384);
  let s = 1234567;
  const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 236 + (r() - 0.5) * 22;
    img.data[i] = v;
    img.data[i + 1] = v - 9;
    img.data[i + 2] = v - 28;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // fibres
  g.globalAlpha = 0.07;
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = r() < 0.5 ? '#6b5434' : '#fff7e6';
    g.lineWidth = 0.6 + r();
    g.beginPath();
    const x = r() * 384;
    const y = r() * 384;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, x + (r() - 0.5) * 50, y + (r() - 0.5) * 50);
    g.stroke();
  }
  paperURL = c.toDataURL('image/png');
  return paperURL;
}

function foxing(seed, page) {
  const out = [];
  const k = hash((seed ^ Math.imul(page + 1, 0x9e3779b1)) >>> 0);
  const n = 2 + (k % 4);
  for (let i = 0; i < n; i++) {
    const x = (rnd(k, i * 3 + 1) * 100).toFixed(1);
    const y = (rnd(k, i * 3 + 2) * 100).toFixed(1);
    const sz = (3 + rnd(k, i * 3 + 3) * 11).toFixed(1);
    out.push(`radial-gradient(circle at ${x}% ${y}%, rgba(132,86,38,0.16), rgba(132,86,38,0.05) ${sz}%, transparent ${(+sz + 4).toFixed(1)}%)`);
  }
  return out.join(',');
}

export class Reader {
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    this.book = null;
    this.lib = null;
    this.page = 0; // first page of the current spread
    this.flipping = false;
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = `
      <div class="reader-shade"></div>
      <header class="reader-head">
        <div class="reader-title">
          <div class="spine-title" id="readerSpine"></div>
          <div class="reader-loc" id="readerLoc"></div>
        </div>
        <button class="btn ghost" id="readerClose" aria-label="合上书">合上书 <kbd>Esc</kbd></button>
      </header>
      <div class="reader-stage">
        <div class="spread" id="spread">
          <div class="page pa"><div class="txt"></div><div class="folio"></div></div>
          <div class="page pb"><div class="txt"></div><div class="folio"></div></div>
          <div class="gutter"></div>
        </div>
        <div class="reader-loading" id="readerLoading">正在从地址反推这本书的 <b></b> 个字符…</div>
      </div>
      <footer class="reader-foot">
        <button class="btn" id="readerPrev" aria-label="上一页">‹</button>
        <input type="range" id="readerSlider" min="1" max="410" value="1" aria-label="页码">
        <span class="pageno"><input id="readerPageInput" type="number" min="1" max="410" value="1" aria-label="跳到页码"> / 410</span>
        <button class="btn" id="readerNext" aria-label="下一页">›</button>
        <button class="btn ghost" id="readerHit" hidden>回到你的文字</button>
        <button class="btn ghost" id="readerCopy">复制本页</button>
      </footer>`;
    $('#readerClose', r).onclick = () => this.opts.onClose();
    $('#readerPrev', r).onclick = () => this.turn(-1);
    $('#readerNext', r).onclick = () => this.turn(1);
    $('#readerSlider', r).oninput = (e) => this.jump(+e.target.value - 1);
    $('#readerPageInput', r).onchange = (e) => this.jump(Math.max(0, Math.min(409, +e.target.value - 1)));
    $('#readerHit', r).onclick = () => this.hit && this.jump(this.hit.page);
    $('#readerCopy', r).onclick = (e) => this.copy(e.currentTarget);
    window.addEventListener('resize', () => this.isOpen() && this.layout());
    r.addEventListener('wheel', (e) => {
      if (!this.isOpen() || this.flipping) return;
      if (Math.abs(e.deltaY) > 30) this.turn(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
    let sx = null;
    r.addEventListener('touchstart', (e) => (sx = e.touches[0].clientX), { passive: true });
    r.addEventListener('touchend', (e) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      sx = null;
      if (Math.abs(dx) > 50) this.turn((dx < 0) !== !!(this.lib && this.lib.vertical) ? 1 : -1);
    });
  }

  isOpen() {
    return !this.root.hidden;
  }

  /** Show the reader in a loading state; content arrives via setBook. */
  open(lib, meta) {
    this.lib = lib;
    this.meta = meta;
    this.book = null;
    this.hit = meta.hit || null;
    this.root.hidden = false;
    this.root.classList.toggle('vertical', lib.vertical);
    this.root.classList.add('opening');
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove('opening')));
    $('#readerSpine', this.root).textContent = spineTitle(lib, meta.seed);
    const h = meta.hex;
    $('#readerLoc', this.root).innerHTML =
      `<span>廊 ${coordHTML(h.corridor)}</span><span>室 ${coordHTML(h.gallery)}</span><span>层 ${coordHTML(h.level)}</span>` +
      `<span>第 ${meta.wall + 1} 壁 · 第 ${meta.shelf + 1} 架 · 第 ${meta.volume + 1} 卷</span>`;
    $('#readerLoading b', this.root).textContent = lib.bookLen.toLocaleString('en-US');
    $('#readerLoading', this.root).hidden = false;
    $('#readerHit', this.root).hidden = !this.hit;
    this.page = 0;
    this.layout();
    this.render();
  }

  setBook(book) {
    this.book = book;
    $('#readerLoading', this.root).hidden = true;
    const start = this.hit ? this.hit.page : 0;
    this.page = this.spreadStart(start);
    this.render();
    if (this.hit) this.root.querySelectorAll('mark').forEach((m) => m.classList.add('ink'));
  }

  close() {
    this.root.hidden = true;
    this.book = null;
  }

  perSpread() {
    return this.single ? 1 : 2;
  }

  spreadStart(p) {
    return this.single ? p : p - (p % 2);
  }

  layout() {
    const stage = $('.reader-stage', this.root);
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    this.single = W < 760;
    this.root.classList.toggle('single', this.single);
    const lib = this.lib;
    // page aspect: Latin 80×40 monospace (char width 0.6em, line 1.28em); Han 40×40 squares
    const pad = 0.075;
    const aspect = lib && !lib.vertical ? (80 * 0.6) / (40 * 1.28) : 1.0;
    const cols = this.single ? 1 : 2;
    let pw = Math.min((W - 24) / cols, (H - 16) * aspect * (1 - 2 * pad + 2 * pad));
    pw = Math.max(200, pw);
    const ph = pw / aspect;
    const spread = $('#spread', this.root);
    spread.style.width = `${pw * cols}px`;
    spread.style.height = `${ph}px`;
    const inner = pw * (1 - 2 * pad);
    const fs = lib && lib.vertical ? (ph * (1 - 2 * pad)) / 40 : inner / (80 * 0.6);
    spread.style.setProperty('--fs', `${fs}px`);
    spread.style.setProperty('--pad', `${pw * pad}px`);
    this.pw = pw;
    if (this.book) this.page = this.spreadStart(this.page);
  }

  pageHTML(p) {
    const lib = this.lib;
    if (!this.book || p < 0 || p >= lib.pages) return '';
    const base = p * lib.pageLen;
    const hl = this.hit && this.hit.page === p ? [this.hit.offset, this.hit.offset + this.hit.length] : null;
    const rows = [];
    for (let line = 0; line < lib.lines; line++) {
      const a = line * lib.cols;
      const b = a + lib.cols;
      if (hl && hl[0] < b && hl[1] > a) {
        const s = Math.max(a, hl[0]);
        const e = Math.min(b, hl[1]);
        rows.push(
          digitsToText(lib, this.book, base + a, base + s) +
            '<mark>' + digitsToText(lib, this.book, base + s, base + e) + '</mark>' +
            digitsToText(lib, this.book, base + e, base + b),
        );
      } else rows.push(digitsToText(lib, this.book, base + a, base + b));
    }
    return rows.join('\n');
  }

  fillPage(el, p) {
    const txt = el.querySelector('.txt');
    const folio = el.querySelector('.folio');
    const valid = p >= 0 && p < this.lib.pages;
    txt.innerHTML = valid ? this.pageHTML(p) : '';
    folio.textContent = valid ? String(p + 1) : '';
    el.style.backgroundImage = `${valid ? foxing(this.meta.seed, p) + ',' : ''}url(${paperTexture()})`;
    el.classList.toggle('blank', !valid);
    if (this.book && this.hit && this.hit.page === p) txt.querySelectorAll('mark').forEach((m) => m.classList.add('ink'));
  }

  /** Which page sits in slot A (left) and slot B (right) for the current spread. */
  slots(start = this.page) {
    if (this.single) return [start, null];
    return this.lib.vertical ? [start + 1, start] : [start, start + 1];
  }

  render() {
    const [a, b] = this.slots();
    this.fillPage($('.pa', this.root), a);
    if (b !== null) this.fillPage($('.pb', this.root), b);
    const shown = this.page + 1;
    $('#readerSlider', this.root).value = shown;
    $('#readerPageInput', this.root).value = shown;
    $('#readerPrev', this.root).disabled = this.page <= 0;
    $('#readerNext', this.root).disabled = this.page + this.perSpread() >= this.lib.pages;
  }

  jump(p) {
    if (!this.book) return;
    this.page = this.spreadStart(Math.max(0, Math.min(this.lib.pages - 1, p)));
    this.render();
  }

  turn(dir) {
    if (!this.book || this.flipping) return;
    const next = this.page + dir * this.perSpread();
    if (next < 0 || next >= this.lib.pages) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      this.page = next;
      this.render();
      return;
    }
    this.flipping = true;
    const spread = $('#spread', this.root);
    const pa = $('.pa', this.root);
    const pb = $('.pb', this.root);
    const old = this.slots();
    const neu = this.slots(next);
    // Which physical side lifts: turning "forward" lifts the right page in
    // a left-to-right book and the left page in a right-to-left book.
    const forward = dir > 0;
    const liftRight = this.single ? true : forward !== this.lib.vertical;
    const leaf = document.createElement('div');
    leaf.className = 'leaf';
    const front = document.createElement('div');
    const back = document.createElement('div');
    front.className = 'page face front';
    back.className = 'page face back';
    for (const f of [front, back]) f.innerHTML = '<div class="txt"></div><div class="folio"></div>';
    leaf.append(front, back);
    if (this.single) {
      this.fillPage(front, old[0]);
      this.fillPage(back, -1);
      this.fillPage(pa, neu[0]);
      leaf.style.left = '0';
      leaf.style.transformOrigin = forward ? 'left center' : 'right center';
    } else if (liftRight) {
      this.fillPage(front, old[1]);
      this.fillPage(back, neu[0]);
      this.fillPage(pb, neu[1]);
      leaf.style.left = '50%';
      leaf.style.transformOrigin = 'left center';
    } else {
      this.fillPage(front, old[0]);
      this.fillPage(back, neu[1]);
      this.fillPage(pa, neu[0]);
      leaf.style.left = '0';
      leaf.style.transformOrigin = 'right center';
    }
    spread.appendChild(leaf);
    const sign = this.single ? (forward ? -1 : 1) : liftRight ? -1 : 1;
    const anim = leaf.animate(
      [
        { transform: 'rotateY(0deg)' },
        { transform: `rotateY(${sign * 90}deg)`, offset: 0.5 },
        { transform: `rotateY(${sign * 180}deg)` },
      ],
      { duration: this.single ? 520 : 760, easing: 'cubic-bezier(.45,.05,.3,1)' },
    );
    leaf.animate([{ '--shade': 0 }, { '--shade': 1, offset: 0.5 }, { '--shade': 0 }], { duration: 760 });
    anim.onfinish = () => {
      this.page = next;
      this.render();
      leaf.remove();
      this.flipping = false;
    };
  }

  async copy(btn) {
    if (!this.book) return;
    const [a, b] = this.slots();
    const p = this.single || b === null ? a : Math.min(a, b);
    const lib = this.lib;
    const lines = [];
    for (let l = 0; l < lib.lines; l++) {
      const s = p * lib.pageLen + l * lib.cols;
      lines.push(digitsToText(lib, this.book, s, s + lib.cols));
    }
    const text = lines.join('\n');
    const label = btn.textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = `已复制第 ${p + 1} 页`;
    } catch {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents($(this.lib.vertical ? '.pb .txt' : '.pa .txt', this.root));
      sel.removeAllRanges();
      sel.addRange(range);
      btn.textContent = '已选中，可手动复制';
    }
    setTimeout(() => (btn.textContent = label), 1800);
  }
}
