/* LIMINAL · DOM card faces, minion tokens, rules text (keywords, fading, fakes) */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const CV = (L.CV = {});
  const TYPE = { minion: '随从', spell: '法术', field: '场地' };
  const KW_RE = /(坠入夹层|嘲讽|冲锋|突袭|战吼|亡语|圣盾|潜行|剧毒|冻结|收容|褪色|回响|暗袭|场地)/;
  const SYM = '<i class="sym" aria-label="理智"></i>';
  CV.SYM = SYM;
  CV.sym = (s) => String(s).replace(/⟁/g, SYM);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  CV.esc = esc;

  // ------------------------------------------------------------ fake-card corruption
  const GLYPH = { 门: '闩', 人: '入', 大: '太', 日: '曰', 未: '末', 己: '已', 王: '玉', 土: '士', 白: '自', 手: '毛', 的: '旳', 者: '著', 水: '氺', 子: '孑', 天: '夭', 木: '术', 灯: '炉', 员: '贠', 机: '杋', 电: '申', 视: '祝', 管: '菅', 夜: '液', 星: '昰', 光: '兴', 墙: '墻', 眼: '眠', 睛: '晴', 柜: '拒', 线: '綫', 钟: '钏', 箱: '葙', 车: '东', 圈: '圏', 泡: '炮', 处: '外', 动: '劝', 雪: '雷', 冰: '水', 层: '屋', 主: '玍', 镜: '境', 书: '韦', 录: '彔', 广: '厂', 播: '潘', 失: '矢', 物: '勿', 风: '凤', 口: '囗', 有: '有', 午: '牛', 后: '后' };
  const TEXT_SWAP = [['抽一张牌', '抽一张脸'], ['造成', '遭成'], ['获得', '获侍'], ['随从', '随丛'], ['恢复', '恢夏'], ['伤害', '伤宝'], ['冻结', '冻洁'], ['嘲讽', '嘲风'], ['潜行', '潜衍'], ['回合', '回含'], ['敌方', '故方'], ['友方', '反方']];
  const WHISPERS = ['这张牌不存在。', '你确定你看清楚了吗？', '别打出我。', '它在你手里待了多久了？', '你数过你的手牌吗？', '墙后面也有一张这样的牌。', '睡吧，没关系的。', '翻过来看看背面。'];
  function fakeName(name, v) {
    const chars = Array.from(name);
    const idx = chars.map((c, i) => (GLYPH[c] && GLYPH[c] !== c ? i : -1)).filter((i) => i >= 0);
    if (idx.length) {
      const i = idx[v % idx.length];
      chars[i] = GLYPH[chars[i]];
      return chars.join('');
    }
    if (chars.length > 2) {
      const i = 1 + (v % (chars.length - 2));
      [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    }
    return chars.join('');
  }
  function fakeText(text, v) {
    for (let k = 0; k < TEXT_SWAP.length; k++) {
      const [a, b] = TEXT_SWAP[(k + v) % TEXT_SWAP.length];
      if (text.includes(a)) return text.replace(a, b);
    }
    return text ? text + '。' : '……';
  }
  CV.fakeName = fakeName;
  CV.whisper = (v) => WHISPERS[v % WHISPERS.length];

  // ------------------------------------------------------------ rules text with fading
  function tokenize(text) {
    const out = [];
    let rest = text;
    while (rest.length) {
      const m = KW_RE.exec(rest);
      const plainEnd = m ? m.index : rest.length;
      const plain = rest.slice(0, plainEnd);
      // split plain into numbers / punctuation / 2-char words
      const re = /(\d+(?:\/\d+)?|[+\-]\d+(?:\/[+\-]?\d+)?|[，。：、「」（）！？；·\s]+|[A-Za-z0-9\-]+|[^\d，。：、「」（）！？；·\sA-Za-z]{1,2})/g;
      let mm;
      while ((mm = re.exec(plain))) {
        const t = mm[0];
        const kind = /^[+\-]?\d/.test(t) ? 'num' : /^[，。：、「」（）！？；·\s]+$/.test(t) ? 'p' : 'w';
        out.push({ t, kind });
      }
      if (!m) break;
      out.push({ t: m[0], kind: 'kw' });
      rest = rest.slice(plainEnd + m[0].length);
    }
    return out;
  }
  CV.textHTML = function (text, fade, seed) {
    if (!text) return '';
    const toks = tokenize(text);
    const cand = toks.map((t, i) => (t.kind !== 'p' ? i : -1)).filter((i) => i >= 0);
    // numbers and keywords fade first: they matter most
    const r = L.U.seeded(seed || 1);
    cand.sort((a, b) => {
      const pa = toks[a].kind === 'num' ? 0 : toks[a].kind === 'kw' ? 1 : 2;
      const pb = toks[b].kind === 'num' ? 0 : toks[b].kind === 'kw' ? 1 : 2;
      return pa - pb || r() - 0.5;
    });
    const blurred = new Set(cand.slice(0, Math.min(fade || 0, 2)));
    return toks
      .map((t, i) => {
        let h = esc(t.t);
        if (t.kind === 'kw') h = '<b>' + h + '</b>';
        if (blurred.has(i)) h = '<span class="fz f1">' + h + '</span>';
        return h;
      })
      .join('');
  };

  function nameClass(n) {
    const len = Array.from(n).length;
    return len > 10 ? 'xlong' : len > 7 ? 'long' : '';
  }

  // ------------------------------------------------------------ card face
  // inst: { uid, cost, san, fade, echo, fz, fake, breach }
  CV.card = function (cid, inst, opts) {
    inst = inst || {};
    opts = opts || {};
    const d = L.CARDS[cid];
    const el = document.createElement('div');
    el.dataset.cid = cid;
    if (inst.uid != null) el.dataset.uid = inst.uid;
    const v = inst.fake ? inst.fake.v || 0 : 0;
    const name = inst.fake ? fakeName(d.name, v) : d.name;
    const text = inst.fake ? fakeText(d.text, v) : d.text;
    const cost = inst.cost == null ? d.cost : inst.cost;
    const san = inst.san == null ? d.san || 0 : inst.san;
    el.className = `card f-${d.faction} r-${d.rarity} t-${d.type}` + (san ? ' anom' : '') + (inst.echo ? ' echo' : '') + (inst.fake ? ' fake' : '') + (inst.breach ? ' breach' : '');
    const typeLine = TYPE[d.type] + ' · ' + L.FACTIONS[d.faction].name + (san ? ' · ⟁异常' : '');
    const whisper = d.whisper && opts.big ? `<span class="whisper">${esc(d.whisper)}</span>` : '';
    el.innerHTML =
      `<div class="cf"><div class="art"></div><div class="fr"></div>` +
      `<div class="nm">${L.Frames.nameSVG(name, d.type, d.faction)}</div>` +
      `<div class="tl">${CV.sym(esc(typeLine))}</div>` +
      `<div class="tx"><div class="crest">${L.Art.crest[d.faction]}</div><p>${CV.textHTML(text, inst.fade, (inst.uid || 7) * 31 + 3)}${whisper}</p></div>` +
      `<div class="code">${d.code}</div></div>` +
      `<div class="gem"><b>${cost}</b></div><div class="sanc"><b>${san}</b></div>` +
      (d.type === 'minion' ? `<div class="st atk"><b>${d.atk}</b></div><div class="st hp"><b>${d.hp}</b></div>` : '') +
      `<div class="brc">突破 ${inst.breach || 0}</div>`;
    el.querySelector('.cf').style.backgroundImage = `url("${L.Frames.frame(d.faction, d.rarity, d.type, 'back')}")`;
    el.querySelector('.fr').style.backgroundImage = `url("${L.Frames.frame(d.faction, d.rarity, d.type, 'front')}")`;
    el.querySelector('.art').style.backgroundImage = `url("${L.Art.card(cid)}")`;
    CV.updateCard(el, inst, true);
    return el;
  };
  CV.updateCard = function (el, inst, first) {
    const d = L.CARDS[el.dataset.cid];
    const cost = inst.cost == null ? d.cost : inst.cost;
    const gem = el.querySelector('.gem');
    const gb = gem.firstChild;
    if (gb.textContent !== String(cost)) gb.textContent = cost;
    gem.classList.toggle('up', cost > d.cost);
    gem.classList.toggle('down', cost < d.cost);
    const fade = inst.fade || 0;
    const fz = inst.fz || inst.echo || d.fade;
    el.classList.toggle('fading', !!fz && fade > 0 && fade < 3);
    el.classList.toggle('faded3', !!fz && fade >= 3);
    if (!first && el.dataset.fade !== String(fade) && !inst.fake) {
      el.querySelector('.tx p').innerHTML = CV.textHTML(d.text, fade, (inst.uid || 7) * 31 + 3);
    }
    el.dataset.fade = fade;
    el.classList.toggle('breach', !!inst.breach);
    if (inst.breach) el.querySelector('.brc').textContent = '突破 ' + inst.breach;
  };

  CV.back = function (fake) {
    const el = document.createElement('div');
    el.className = 'cardback' + (fake ? ' fake' : '');
    el.style.backgroundImage = `url("${L.Art.back()}")`;
    return el;
  };

  // ------------------------------------------------------------ minion token
  CV.minion = function (m) {
    const d = L.CARDS[m.cid];
    const el = document.createElement('div');
    el.className = `minion f-${d.faction} r-${d.rarity}`;
    el.dataset.uid = m.uid;
    el.dataset.cid = m.cid;
    el.innerHTML = `<div class="m-art"></div><div class="m-bz"></div><div class="m-st atk"><b></b></div><div class="m-st hp"><b></b></div><div class="m-ic"></div>`;
    el.querySelector('.m-art').style.backgroundImage = `url("${L.Art.card(m.cid)}")`;
    el.querySelector('.m-bz').style.backgroundImage = `url("${L.Frames.bezel(d.faction, d.rarity)}")`;
    CV.updateMinion(el, m);
    return el;
  };
  CV.updateMinion = function (el, m) {
    if (el.dataset.cid !== m.cid) {
      el.dataset.cid = m.cid;
      const d = L.CARDS[m.cid];
      el.className = `minion f-${d.faction} r-${d.rarity}`;
      el.querySelector('.m-art').style.backgroundImage = `url("${L.Art.card(m.cid)}")`;
      el.querySelector('.m-bz').style.backgroundImage = `url("${L.Frames.bezel(d.faction, d.rarity)}")`;
    }
    const a = el.querySelector('.m-st.atk b'),
      h = el.querySelector('.m-st.hp b');
    if (a.textContent !== String(m.atk)) a.textContent = m.atk;
    if (h.textContent !== String(m.hp)) h.textContent = m.hp;
    a.className = m.atk > m.baseAtk ? 'up' : '';
    h.className = m.hp < m.maxHp ? 'hurt' : m.maxHp > m.baseHp ? 'up' : '';
    const c = el.classList;
    c.toggle('taunt', !!m.kw.taunt);
    c.toggle('divine', !!m.kw.divine);
    c.toggle('stealth', !!m.kw.stealth);
    c.toggle('frozen', !!m.frozen);
    c.toggle('silenced', !!m.silenced);
    const ic = (m.dr ? '<i class="dr"></i>' : '') + (m.trig ? '<i class="tg"></i>' : '') + (m.kw.poison ? '<i class="ps"></i>' : '');
    const icEl = el.querySelector('.m-ic');
    if (icEl.dataset.h !== ic) {
      icEl.innerHTML = ic;
      icEl.dataset.h = ic;
    }
    let zz = el.querySelector('.zz');
    const sleepy = m.sick && !m.kw.charge && !m.kw.rush && m.owner === 0 && L.UI && L.UI.isMyTurn && L.UI.isMyTurn();
    if (sleepy && !zz) {
      zz = document.createElement('div');
      zz.className = 'zz';
      zz.textContent = 'z';
      el.appendChild(zz);
    } else if (!sleepy && zz) zz.remove();
  };

  // hero-power icons
  CV.HP_ICON = {
    agent_shen: '<svg viewBox="0 0 24 24"><path d="M4 9c3-3 5 3 8 0s5 3 8 0M4 14c3-3 5 3 8 0s5 3 8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 3v3M12 18v3" stroke="currentColor" stroke-width="2"/></svg>',
    agent_tang: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    agent_man: '<svg viewBox="0 0 24 24"><path d="M14 3a8 8 0 1 0 7 12A7 7 0 0 1 14 3z" fill="currentColor"/><text x="15" y="10" font-size="7" fill="currentColor" font-family="monospace">z</text></svg>',
    boss_manager: '<svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 12l9 9M16 17l2-2M18 19l2-2" stroke="currentColor" stroke-width="2"/></svg>',
    boss_lifeguard: '<svg viewBox="0 0 24 24"><rect x="3" y="9" width="13" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 11h5v3h-5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="13" r="1.6" fill="currentColor"/></svg>',
    boss_broadcast: '<svg viewBox="0 0 24 24"><path d="M3 10h4l8-5v14l-8-5H3z" fill="currentColor"/><path d="M18 8q3 4 0 8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  };

  // keyword glossary for a card (inspect view)
  CV.keywordsOf = function (cid) {
    const d = L.CARDS[cid];
    const found = [];
    const txt = d.text || '';
    const map = { 嘲讽: 'taunt', 冲锋: 'charge', 突袭: 'rush', 战吼: 'battlecry', 亡语: 'deathrattle', 圣盾: 'divine', 潜行: 'stealth', 剧毒: 'poison', 冻结: 'freeze', 收容: 'contain', 褪色: 'fade', 回响: 'echo', 暗袭: 'ambush', 坠入夹层: 'limbo', 场地: 'field' };
    for (const zh in map) if (txt.includes(zh)) found.push(L.KEYWORDS[map[zh]]);
    if (d.san) found.push(L.KEYWORDS.anomaly);
    return found;
  };
})();
