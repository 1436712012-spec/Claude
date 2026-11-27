// "Find a sentence": normalise the text, compute where its book stands, and
// show the four Feistel rounds that turn content into an address.

import { digitsToText } from '../babel/alphabet.js';
import { log10BooksContaining } from '../babel/search.js';
import { findTextAsync } from '../babel/client.js';
import { coordHTML, coordGlyphs, pow10HTML } from './format.js';
import { encodeShare, setShareHash } from './share.js';

const $ = (s, r = document) => r.querySelector(s);

const MODES = {
  alone: { name: '唯一之书', desc: '第一页以你的文字开头，其余 409 页半个字也没有。全馆只有这一本。' },
  noise: { name: '藏于乱码', desc: '你的文字落在某一页的随机位置，四周都是乱码。每次寻找都会抵达另一本书。' },
  blank: { name: '空白之中', desc: '你的文字落在随机的一页、随机的位置，其余都是空白。' },
};

const EXAMPLES = {
  latin: [
    'the universe, which others call the library, is composed of an indefinite number of hexagonal galleries.',
    'i have searched for you in every hexagon.',
    'somewhere in this library there is a book that is the perfect index of all the others.',
  ],
  han: ['宇宙，别人称之为图书馆，由数目不定的六角形回廊组成。', '我在每一间六角形回廊里寻找过你。', '天地玄黄，宇宙洪荒。'],
};

export class SearchPanel {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.mode = 'alone';
    this.result = null;
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = `
      <header class="panel-head">
        <div><div class="eyebrow">Search the Library</div><h2>寻书</h2></div>
        <button class="btn ghost close" data-close aria-label="关闭">✕</button>
      </header>
      <p class="lede">你想写下的每一句话，早已印在这座图书馆的某本书里。写下它，我会算出那本书站在哪一层、哪一间、哪一格书架上。</p>
      <label class="field-label" for="searchText">文字</label>
      <textarea id="searchText" rows="4" spellcheck="false"></textarea>
      <div class="hint-row"><span id="searchCount"></span><button class="link" id="searchExample">换一句示例</button></div>
      <div class="warn" id="searchDropped" hidden></div>
      <fieldset class="modes" id="searchModes">
        <legend class="field-label">这本书长什么样</legend>
        ${Object.entries(MODES).map(([k, m]) => `
          <label class="mode"><input type="radio" name="mode" value="${k}" ${k === 'alone' ? 'checked' : ''}>
            <span><b>${m.name}</b><small>${m.desc}</small></span></label>`).join('')}
      </fieldset>
      <div class="stat" id="searchStat"></div>
      <button class="btn primary wide" id="searchGo">推算它的位置</button>
      <section class="cipher" id="cipher" hidden>
        <div class="eyebrow">Feistel · 四轮置换</div>
        <canvas id="cipherCanvas" aria-label="四轮 Feistel 置换的可视化"></canvas>
        <p class="cipher-note">每一行显示整本书的左半与右半的前 120 个字符（颜色代表字符）。每一轮把右半送进散列函数，再按位叠加到左半上，然后两半交换。四轮之后，内容变成了地址；反过来走，地址又变回这本书。</p>
      </section>
      <section class="result" id="result" hidden></section>`;
    $('[data-close]', r).onclick = () => this.app.closePanels();
    const ta = $('#searchText', r);
    ta.value = EXAMPLES[this.app.lib.id][0];
    ta.oninput = () => this.update();
    $('#searchExample', r).onclick = () => {
      const ex = EXAMPLES[this.app.lib.id];
      const i = (ex.indexOf(ta.value) + 1) % ex.length;
      ta.value = ex[i];
      this.update();
    };
    r.querySelectorAll('input[name=mode]').forEach((el) => (el.onchange = () => { this.mode = el.value; this.update(); }));
    $('#searchGo', r).onclick = () => this.go();
    this.update();
  }

  onLibraryChange() {
    const ta = $('#searchText', this.root);
    ta.value = EXAMPLES[this.app.lib.id][0];
    $('#cipher', this.root).hidden = true;
    $('#result', this.root).hidden = true;
    this.update();
  }

  normalized() {
    return this.app.lib.normalize($('#searchText', this.root).value);
  }

  update() {
    const lib = this.app.lib;
    const { digits, dropped } = this.normalized();
    const n = digits.length;
    const over = n > lib.pageLen;
    $('#searchCount', this.root).textContent = `${n.toLocaleString('en-US')} / ${lib.pageLen.toLocaleString('en-US')} 个字符（一页）`;
    const dz = $('#searchDropped', this.root);
    const msgs = [];
    if (dropped.length) msgs.push(`这座图书馆的字母表里没有 ${dropped.slice(0, 12).map((c) => `「${c}」`).join('')}${dropped.length > 12 ? '…' : ''}，已略去。${lib.id === 'latin' ? '拉丁卷只有 26 个小写字母、空格、逗号和句号。' : '汉字卷收录 20,902 个汉字与空格、逗号、句号。'}`);
    if (over) msgs.push('文字超过了一页，请删短一些。');
    dz.hidden = msgs.length === 0;
    dz.textContent = msgs.join(' ');
    const stat = $('#searchStat', this.root);
    if (n === 0) stat.innerHTML = '';
    else
      stat.innerHTML = `这段文字出现在约 <b>${pow10HTML(log10BooksContaining(lib, n))}</b> 本书里。${this.mode === 'alone' ? '其中只有一本，除了它之外通篇空白。' : '我会替你挑出其中一本。'}`;
    $('#searchGo', this.root).disabled = n === 0 || over;
  }

  async go() {
    const lib = this.app.lib;
    const { digits } = this.normalized();
    if (!digits.length || digits.length > lib.pageLen) return;
    const btn = $('#searchGo', this.root);
    btn.disabled = true;
    btn.textContent = '正在置换 ' + lib.bookLen.toLocaleString('en-US') + ' 个字符…';
    const t0 = performance.now();
    try {
      this.lastMode = this.mode;
      const res = await findTextAsync(lib, digits, this.mode);
      res.ms = performance.now() - t0;
      res.text = digitsToText(lib, digits);
      this.result = res;
      $('#cipher', this.root).hidden = false;
      await this.animateCipher(res);
      this.showResult(res);
    } catch (e) {
      $('#result', this.root).hidden = false;
      $('#result', this.root).innerHTML = `<p class="warn">计算失败：${e.message}</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '推算它的位置';
    }
  }

  animateCipher(res) {
    const lib = this.app.lib;
    const cv = $('#cipherCanvas', this.root);
    const W = cv.clientWidth || 380;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const rows = [res.input, ...res.rounds];
    const cell = W / 120;
    const rowH = Math.max(7, cell * 3.2);
    const gap = rowH * 1.25;
    const H = rows.length * (rowH * 2 + gap) + 4;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.height = H + 'px';
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const color = (d) => {
      if (d === lib.space) return 'rgba(234,223,200,0.10)';
      const h = (d * 360) / lib.K;
      return `hsl(${(h * 7.3) % 360} 52% ${38 + ((d * 13) % 30)}%)`;
    };
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return new Promise((resolve) => {
      const total = rows.length;
      const per = reduce ? 0 : 420;
      const start = performance.now();
      const draw = () => {
        const t = performance.now() - start;
        g.clearRect(0, 0, W, H);
        g.font = '10px "IBM Plex Mono", monospace';
        for (let r = 0; r < total; r++) {
          const local = per ? Math.min(1, Math.max(0, (t - r * per) / per)) : 1;
          if (local <= 0) break;
          const y = r * (rowH * 2 + gap);
          g.fillStyle = 'rgba(185,171,144,0.85)';
          g.fillText(r === 0 ? '书的内容' : `第 ${r} 轮`, 0, y + 9);
          const row = rows[r];
          const show = Math.floor(120 * local);
          for (let i = 0; i < show; i++) {
            g.fillStyle = color(row.L[i]);
            g.fillRect(i * cell, y + 12, cell - 0.4, rowH - 1);
            g.fillStyle = color(row.R[i]);
            g.fillRect(i * cell, y + 12 + rowH, cell - 0.4, rowH - 1);
          }
        }
        if (t < total * per + 60) requestAnimationFrame(draw);
        else resolve();
      };
      draw();
    });
  }

  /** Arrive from a shared link: search in "alone" mode and set off. */
  async followLink(text) {
    $('#searchText', this.root).value = text;
    this.mode = 'alone';
    this.root.querySelector('input[value=alone]').checked = true;
    this.update();
    this.app.openPanel('search');
    await this.go();
    if (this.result) setTimeout(() => this.app.travelTo(this.result), 900);
  }

  showResult(res) {
    const lib = this.app.lib;
    const el = $('#result', this.root);
    el.hidden = false;
    const h = res.hex;
    el.innerHTML = `
      <div class="eyebrow">它在这里</div>
      <dl class="loc">
        <dt>廊</dt><dd>${coordHTML(h.corridor)}<code>${coordGlyphs(lib, h.corridor)}</code></dd>
        <dt>室</dt><dd>${coordHTML(h.gallery)}<code>${coordGlyphs(lib, h.gallery)}</code></dd>
        <dt>层</dt><dd>${coordHTML(h.level)}<code>${coordGlyphs(lib, h.level)}</code></dd>
        <dt>书</dt><dd>第 ${res.wall + 1} 壁 · 第 ${res.shelf + 1} 架 · 第 ${res.volume + 1} 卷 · 第 ${res.page + 1} 页 · 第 ${Math.floor(res.offset / lib.cols) + 1} ${lib.vertical ? '列' : '行'}</dd>
      </dl>
      <p class="small">每个坐标都是一个 ${h.level.sigLength().toLocaleString('en-US')} 位的 ${lib.K} 进制数，上面的 <code>code</code> 是它用这座图书馆自己的字母写出的开头。这次置换在 ${Math.round(res.ms)} ms 内完成。</p>
      ${this.lastMode === 'alone' && res.text.length <= 240 ? `<div class="share"><p class="small">这本书是确定的：任何人算出的都是同一个书架。把链接发给别人，他们会被领到这一页。</p><button class="btn ghost wide" id="shareCopy">复制通往这本书的链接</button></div>` : ''}
      <button class="btn primary wide" id="travelGo">前往这本书</button>`;
    $('#travelGo', el).onclick = () => this.app.travelTo(res);
    const share = $('#shareCopy', el);
    if (share) {
      const name = encodeShare(lib.id, res.text);
      setShareHash(name);
      share.onclick = async () => {
        const url = location.href.split('#')[0] + '#' + name;
        try {
          await navigator.clipboard.writeText(url);
          share.textContent = '链接已复制';
        } catch {
          share.textContent = '地址栏里的链接已指向这本书';
        }
        setTimeout(() => (share.textContent = '复制通往这本书的链接'), 2200);
      };
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
