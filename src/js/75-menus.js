/* LIMINAL · title, dispatch, deck builder, archive, settings, pause, results */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const CV = L.CV, A = L.Audio, S = L.Store;
  const M = (L.Menus = {});
  const $ = (id) => document.getElementById(id);
  const esc = CV.esc;
  let cur = 'title';
  M.current = () => cur;

  M.show = function (name) {
    cur = name;
    document.querySelectorAll('#stage .screen').forEach((s) => s.classList.toggle('on', s.id === 'screen-' + name));
    if (name !== 'game') {
      $('sideL').classList.remove('on');
      $('sideR').classList.remove('on');
      L.Layers.set(3);
    }
    if (name === 'setup') renderSetup();
    if (name === 'deck') renderDeckManager();
    if (name === 'archive') renderArchive();
    $('stage').scrollTop = 0;
    document.querySelectorAll('#screen-' + name + ' .menu-wrap').forEach((w) => (w.scrollTop = 0));
  };

  M.init = function () {
    document.querySelectorAll('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        A.play('click');
        const go = b.dataset.go;
        if (go === 'settings') return M.settings();
        if (go === 'tutorial') { A.init(); return L.Tutorial.start(); }
        M.show(go);
      })
    );
    $('goMatch').addEventListener('click', startMatch);
    $('deckBack').addEventListener('click', () => {
      A.play('click');
      if (!$('builder').hidden) closeBuilder();
      else M.show('title');
    });
    titleTV();
    const mt = $('muteTitle');
    const syncMute = () => mt.classList.toggle('off', !!S.settings.mute);
    mt.addEventListener('click', (e) => { e.stopPropagation(); A.init(); S.settings.mute = !S.settings.mute; S.saveSettings(); M.applySettings(); syncMute(); });
    syncMute();
    const enter = () => {
      A.init();
      L.Layers.set(3);
      $('tapHint').hidden = true;
      $('titleMenu').hidden = false;
      const tb = $('goTut');
      // newcomers see the training first and marked as recommended; veterans get it as a quiet option
      if (!S.progress.trained) tb.innerHTML = '外勤训练<span class="rec">推荐</span>';
      else { tb.className = 'btn ghost'; tb.parentNode.appendChild(tb); }
      $('titleFoot').textContent = S.isPersistent() ? '档案将保存在本机' : '无法写入本机存储 · 档案只保存在本次会话';
      if (!S.progress.firstSeen) { S.progress.firstSeen = Date.now(); S.saveProgress(); }
    };
    $('screen-title').addEventListener('pointerdown', function once() {
      enter();
      $('screen-title').removeEventListener('pointerdown', once);
    });
  };

  // ------------------------------------------------------------------ title TV
  function titleTV() {
    const cv = $('tvc');
    const g = cv.getContext('2d');
    cv.width = 160;
    cv.height = 120;
    const img = g.createImageData(160, 120);
    let t = 0;
    const frame = () => {
      if (cur === 'title') {
        t++;
        const corridor = t % 220 > 212;
        if (corridor) {
          // a single frame of the corridor bleeds through
          g.fillStyle = '#d9c577';
          g.fillRect(0, 0, 160, 120);
          g.fillStyle = '#efe6bd';
          g.beginPath(); g.moveTo(0, 0); g.lineTo(160, 0); g.lineTo(92, 50); g.lineTo(68, 50); g.fill();
          g.fillStyle = '#8f7d45';
          g.beginPath(); g.moveTo(0, 120); g.lineTo(160, 120); g.lineTo(92, 70); g.lineTo(68, 70); g.fill();
          g.fillStyle = '#b8a456';
          g.fillRect(68, 50, 24, 20);
          g.fillStyle = '#fff';
          g.fillRect(56, 8, 48, 4);
          g.fillStyle = '#2b2618';
          g.fillRect(78, 55, 4, 12);
        } else {
          // pastel static: the snow of a dream television
          const dreamy = L.Layers.current === 3;
          for (let i = 0; i < img.data.length; i += 4) {
            const v = Math.random();
            if (dreamy) {
              img.data[i] = 150 + v * 105;
              img.data[i + 1] = 120 + v * 110;
              img.data[i + 2] = 170 + v * 85;
            } else {
              img.data[i] = v * 126;
              img.data[i + 1] = v * 119;
              img.data[i + 2] = v * 98;
            }
            img.data[i + 3] = 255;
          }
          g.putImageData(img, 0, 0);
          g.fillStyle = 'rgba(255,255,255,.06)';
          g.fillRect(0, (t * 2) % 140 - 20, 160, 10);
        }
      }
      setTimeout(() => requestAnimationFrame(frame), 60);
    };
    frame();
  }

  // ------------------------------------------------------------------ setup / dispatch
  function deckFaction(cards) {
    const c = { site: 0, level: 0, dream: 0 };
    for (const id of cards) { const f = L.CARDS[id] && L.CARDS[id].faction; if (f in c) c[f]++; }
    const top = Object.entries(c).sort((a, b) => b[1] - a[1]);
    if (top[0][1] === 0) return 'neutral';
    return top[0][1] >= cards.length * 0.4 ? top[0][0] : 'neutral';
  }
  function deckRow(dk, on) {
    const errs = L.validateDeck(dk.cards, S.unlockedBossCards());
    const fac = dk.faction || deckFaction(dk.cards);
    const b = document.createElement('button');
    b.className = 'deckrow' + (on ? ' on' : '');
    b.innerHTML = `<span class="crest c-${fac}">${L.Art.crest[fac] || L.Art.crest.neutral}</span><span class="dn"><b>${esc(dk.name)}</b><i>${esc(dk.desc || (dk.preset ? '' : '自定义卡组'))}</i></span><span class="cnt ${errs.length ? 'bad' : ''}">${dk.cards.length}/30</span>`;
    return b;
  }
  function renderSetup() {
    const sel = S.selected;
    const ap = $('agentPick');
    ap.innerHTML = '';
    for (const id of L.AGENTS) {
      const h = L.HEROES[id];
      const b = document.createElement('button');
      b.className = 'choice' + (sel.agent === id ? ' on' : '');
      b.innerHTML = `<span class="pt" style="background-image:url('${L.Art.portrait(id)}')"></span><b>${esc(h.name)}</b><i>${esc(h.title)}</i>`;
      b.onclick = () => { A.play('click'); sel.agent = id; S.saveSelected(); renderSetup(); };
      ap.appendChild(b);
    }
    const ah = L.HEROES[sel.agent];
    $('agentDetail').innerHTML = `<b>英雄技能 · ${esc(ah.power.name)}</b>（2 法力）：${esc(ah.power.text)}<br><q>${esc(ah.quote)}</q><br><span style="opacity:.7">${esc(ah.bio)}</span>`;
    const dp = $('deckPick');
    dp.innerHTML = '';
    const decks = S.allDecks();
    if (!decks.find((d) => d.id === sel.deck)) sel.deck = 'pre_site';
    for (const dk of decks) {
      const b = deckRow(dk, sel.deck === dk.id);
      b.onclick = () => { A.play('click'); sel.deck = dk.id; S.saveSelected(); renderSetup(); };
      dp.appendChild(b);
    }
    const bp = $('bossPick');
    bp.innerHTML = '';
    for (const id of L.BOSSES) {
      const h = L.HEROES[id];
      const b = document.createElement('button');
      b.className = 'choice' + (sel.boss === id ? ' on' : '');
      const beat = S.progress.beaten.includes(h.bossKey);
      b.innerHTML = `<span class="pt" style="background-image:url('${L.Art.portrait(id)}')"></span><b>${esc(h.short)}</b><i>第 ${h.layer} 层 · ${esc(L.LAYERS[h.layer].name)}</i>` + (beat ? '<span class="beat">已收容</span>' : '');
      b.onclick = () => { A.play('click'); sel.boss = id; S.saveSelected(); renderSetup(); };
      bp.appendChild(b);
    }
    const bh = L.HEROES[sel.boss];
    const style = { control: '控场 · 优先解场，偏爱嘲讽与冻结', tempo: '节奏 · 以治疗和漂移拖长对局', aggro: '狂暴 · 猪突打脸，主动推高梦深' }[bh.persona];
    const start = L.E.layerFor(bh.startDepth);
    $('bossDetail').innerHTML = `<b>${esc(bh.name)}</b> · ${esc(bh.code)} · ${esc(bh.klass)}<br>${esc(bh.intro)}<br><b>英雄技能 · ${esc(bh.power.name)}</b>：${esc(bh.power.text)}<br><b>行为</b>：${style}<br><b>起始梦深</b>：${bh.startDepth}（第 ${start} 层「${L.LAYERS[start].name}」）`;
    const dk = decks.find((d) => d.id === sel.deck);
    const errs = L.validateDeck(dk.cards, S.unlockedBossCards());
    $('goMatch').disabled = errs.length > 0;
    $('goMatch').textContent = errs.length ? '卡组不完整：' + errs[0].slice(0, 14) : '进入夹层';
  }
  function startMatch() {
    A.init();
    A.play('click');
    const sel = S.selected;
    const dk = S.allDecks().find((d) => d.id === sel.deck);
    if (!dk) return;
    L.UI.start({ agent: sel.agent, deck: dk.cards.slice(), boss: sel.boss });
  }
  M.startNext = function (bossId) {
    S.selected.boss = bossId;
    S.saveSelected();
    startMatch();
  };

  // ------------------------------------------------------------------ deck builder
  let editing = null; // deck object being edited
  const filt = { f: 'all', c: 'all', r: 'all' };
  function renderDeckManager() {
    $('builder').hidden = true;
    $('dock').hidden = true;
    $('deckManager').hidden = false;
    const box = $('deckManager');
    box.innerHTML = '';
    const nb = document.createElement('button');
    nb.className = 'btn';
    nb.textContent = '新建卡组';
    nb.onclick = () => { A.play('click'); const d = { id: 'd' + Date.now(), name: '新的卡组', cards: [] }; S.decks.push(d); S.saveDecks(); openBuilder(d); };
    box.appendChild(nb);
    const sec1 = document.createElement('div');
    sec1.className = 'sec';
    sec1.textContent = '预组卡组 · 轻触复制并编辑';
    box.appendChild(sec1);
    for (const p of L.PRESETS) {
      const r = deckRow(p);
      r.onclick = () => { A.play('click'); const d = { id: 'd' + Date.now(), name: p.name + ' · 改', cards: p.cards.slice() }; S.decks.push(d); S.saveDecks(); openBuilder(d); };
      box.appendChild(r);
    }
    const sec2 = document.createElement('div');
    sec2.className = 'sec';
    sec2.textContent = '我的卡组';
    box.appendChild(sec2);
    if (!S.decks.length) {
      const e = document.createElement('div');
      e.className = 'detail';
      e.textContent = '还没有自定义卡组。新建一个，或者从预组复制。卡组会' + (S.isPersistent() ? '自动保存在本机。' : '保存在本次会话中（本机存储不可用）。');
      box.appendChild(e);
    }
    for (const d of S.decks) {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.gap = 'calc(var(--u)*1.6)';
      const r = deckRow(d);
      r.style.flex = '1';
      r.onclick = () => { A.play('click'); openBuilder(d); };
      const del = document.createElement('button');
      del.className = 'chip';
      del.textContent = '删除';
      del.onclick = () => {
        if (del.dataset.arm) { S.decks = S.decks.filter((x) => x !== d); S.saveDecks(); renderDeckManager(); return; }
        del.dataset.arm = 1;
        del.textContent = '确认删除';
        del.style.color = 'var(--red)';
        setTimeout(() => { delete del.dataset.arm; del.textContent = '删除'; del.style.color = ''; }, 2500);
      };
      wrap.appendChild(r);
      wrap.appendChild(del);
      box.appendChild(wrap);
    }
  }
  function openBuilder(d) {
    editing = d;
    $('deckManager').hidden = true;
    $('builder').hidden = false;
    $('dock').hidden = false;
    $('deckName').value = d.name;
    $('deckName').oninput = () => { editing.name = $('deckName').value || '未命名'; S.saveDecks(); };
    $('dToggle').onclick = () => { A.play('click'); $('dock').classList.toggle('open'); };
    $('dSave').textContent = '完成';
    $('dSave').onclick = () => { A.play('click'); closeBuilder(); };
    renderFilters();
    renderGrid();
    renderDock();
  }
  function closeBuilder() {
    S.saveDecks();
    editing = null;
    $('dock').classList.remove('open');
    renderDeckManager();
  }
  function renderFilters() {
    const mk = (box, items, key) => {
      box.innerHTML = '';
      for (const [v, label, svg] of items) {
        const b = document.createElement('button');
        b.className = 'chip' + (filt[key] === v ? ' on' : '');
        b.innerHTML = (svg || '') + label;
        b.onclick = () => { A.play('click'); filt[key] = v; renderFilters(); renderGrid(); };
        box.appendChild(b);
      }
    };
    mk($('fFaction'), [['all', '全部'], ['site', '收容站', L.Art.crest.site], ['level', '后室', L.Art.crest.level], ['dream', '梦核', L.Art.crest.dream], ['neutral', '中立', L.Art.crest.neutral]], 'f');
    mk($('fCost'), [['all', '费用'], ...[0, 1, 2, 3, 4, 5, 6].map((c) => [c, String(c)]), [7, '7+']], 'c');
    mk($('fRarity'), [['all', '稀有度'], ['common', '普通'], ['rare', '稀有'], ['epic', '史诗'], ['legendary', '传说']], 'r');
  }
  function countIn(id) {
    return editing ? editing.cards.filter((x) => x === id).length : 0;
  }
  function renderGrid() {
    const grid = $('cardGrid');
    grid.innerHTML = '';
    const unlocked = S.unlockedBossCards();
    const ids = L.COLLECTIBLE.concat(L.BOSS_CARDS).filter((id) => {
      const d = L.CARDS[id];
      if (filt.f !== 'all' && d.faction !== filt.f) return false;
      if (filt.c !== 'all' && (filt.c === 7 ? d.cost < 7 : d.cost !== filt.c)) return false;
      if (filt.r !== 'all' && d.rarity !== filt.r) return false;
      return true;
    });
    ids.sort((a, b) => L.CARDS[a].cost - L.CARDS[b].cost || L.CARDS[a].num - L.CARDS[b].num);
    for (const id of ids) {
      const d = L.CARDS[id];
      const cell = document.createElement('div');
      cell.className = 'cell';
      const locked = d.boss && !unlocked.includes(id);
      const card = CV.card(id, {});
      cell.appendChild(card);
      const n = countIn(id);
      const max = d.rarity === 'legendary' ? 1 : 2;
      if (locked) {
        cell.classList.add('locked');
        const o = document.createElement('span');
        o.className = 'own';
        o.textContent = '击败' + L.HEROES['boss_' + d.boss].short + '解锁';
        cell.appendChild(o);
      } else if (n) {
        const o = document.createElement('span');
        o.className = 'own';
        o.textContent = '×' + n;
        cell.appendChild(o);
      }
      if (n >= max) cell.classList.add('max');
      let lp = null, fired = false;
      card.addEventListener('pointerdown', () => { fired = false; lp = setTimeout(() => { fired = true; if (!locked) L.UI.inspect(id); }, 450); });
      card.addEventListener('pointerup', () => clearTimeout(lp));
      card.addEventListener('pointerleave', () => clearTimeout(lp));
      card.addEventListener('click', () => {
        if (fired || locked) return;
        if (editing.cards.length >= 30) { A.play('error'); L.UI.toast('卡组已满 30 张。'); return; }
        if (countIn(id) >= max) { A.play('error'); L.UI.toast(d.rarity === 'legendary' ? '传说牌最多 1 张。' : '同名牌最多 2 张。'); return; }
        A.play('draw');
        editing.cards.push(id);
        S.saveDecks();
        card.animate([{ transform: 'scale(.92)' }, { transform: 'none' }], { duration: 160 });
        renderGrid();
        renderDock();
      });
      grid.appendChild(cell);
    }
  }
  function renderDock() {
    const cards = editing.cards;
    const n = cards.length;
    $('dCount').textContent = n + '/30';
    $('dCount').className = 'dcount' + (n === 30 ? ' ok' : '');
    const curve = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const id of cards) curve[Math.min(7, L.CARDS[id].cost)]++;
    const mx = Math.max(4, ...curve);
    $('curve').innerHTML = curve.map((v, i) => `<div><span style="height:${(v / mx) * 100}%"></span><i>${i === 7 ? '7+' : i}</i></div>`).join('');
    const list = $('dList');
    list.innerHTML = '';
    const uniq = Array.from(new Set(cards)).sort((a, b) => L.CARDS[a].cost - L.CARDS[b].cost || L.CARDS[a].num - L.CARDS[b].num);
    for (const id of uniq) {
      const d = L.CARDS[id];
      const b = document.createElement('button');
      b.className = 'dli r-' + d.rarity;
      b.innerHTML = `<span class="bg" style="background-image:url('${L.Art.card(id)}')"></span><span class="mc">${d.cost}</span><b>${esc(d.name)}</b><i>${countIn(id) > 1 ? '×' + countIn(id) : ''}</i>`;
      b.onclick = () => {
        A.play('click');
        editing.cards.splice(editing.cards.indexOf(id), 1);
        S.saveDecks();
        renderGrid();
        renderDock();
      };
      list.appendChild(b);
    }
    if (!uniq.length) list.innerHTML = '<div class="detail">轻触上方的卡牌加入卡组。长按查看详情。</div>';
  }

  // ------------------------------------------------------------------ archive
  const BOSS_EPI = {
    manager: { k: '讯', t: '[录音 · 第 0 层] ……闻笛。我以前叫闻笛。帮我把走廊的灯关掉。下面的人，还在等。', after: 'X02' },
    lifeguard: { k: '讯', t: '[录音 · 第 1 层] 我只是想让大家都别离开。替我跟禾说，哨子我还留着。', after: 'X03' },
    broadcast: { k: '讯', t: '[录音 · 第 2 层] 这里是陆鸣。广播结束。出口一直都在你身后。……别回头，直接走。', after: 'X06' },
  };
  let afilter = 'all';
  function renderArchive() {
    const seen = new Set(S.progress.seen);
    const beaten = S.progress.beaten;
    const entries = [];
    for (const id of L.LORE_ORDER) {
      const d = L.CARDS[id];
      if (!d || !d.lore) continue;
      const locked = d.boss ? !beaten.includes(d.boss) : !seen.has(id);
      entries.push({ k: d.lore.k, t: d.lore.t, code: d.code, name: d.name, locked, hint: d.boss ? '击败' + L.HEROES['boss_' + d.boss].short + '后取得' : '在对局或构筑中查看「' + d.name + '」以取得' });
      for (const key in BOSS_EPI) if (BOSS_EPI[key].after === id) entries.push({ k: BOSS_EPI[key].k, t: BOSS_EPI[key].t, code: 'LMN-10' + (L.BOSSES.indexOf('boss_' + key) + 1), name: L.HEROES['boss_' + key].name, locked: !beaten.includes(key), hint: '击败' + L.HEROES['boss_' + key].short + '后取得' });
    }
    const all3 = L.BOSSES.every((b) => beaten.includes(L.HEROES[b].bossKey));
    const now = new Date();
    const date = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`;
    entries.push({
      k: '记', final: true, code: 'LMN-064 · 最后一页的背面', name: '禾',
      t: `${date}。\n今天又有人进来了。\n我听见走廊的灯一根一根亮起来，管理员把拖把靠在墙上，救生员吹了一声很长很长的哨，广播终于安静了。\n你走到了最下面，又走了回去。谢谢你替我们走完这一段。\n屏幕那边的天，是什么颜色的？\n——禾`,
      locked: !all3, hint: '击败全部三位守门人后取得',
    });
    const got = entries.filter((e) => !e.locked).length;
    $('archiveHead').innerHTML = `外勤组「回声-4」相关记录 · 已取得 <b>${got} / ${entries.length}</b><br><span style="opacity:.7">碎片按时间顺序排列。卡牌上的风味文字就是这些记录的一部分。</span>`;
    const fb = $('archiveFilter');
    fb.innerHTML = '';
    for (const [v, label] of [['all', '全部'], ['档', '档案'], ['记', '日记'], ['讯', '无线电']]) {
      const b = document.createElement('button');
      b.className = 'chip' + (afilter === v ? ' on' : '');
      b.textContent = label;
      b.onclick = () => { A.play('click'); afilter = v; renderArchive(); };
      fb.appendChild(b);
    }
    const list = $('archiveList');
    list.innerHTML = '';
    let i = 0;
    for (const e of entries) {
      i++;
      if (afilter !== 'all' && e.k !== afilter) continue;
      const f = document.createElement('div');
      f.className = 'frag' + (e.locked ? ' locked' : '') + (e.final ? ' final' : '');
      const kn = e.k === '档' ? '档案' : e.k === '记' ? '日记' : '无线电';
      f.innerHTML = `<div class="fh"><span>#${String(i).padStart(2, '0')} · ${esc(e.code)}</span><span>${e.locked ? esc(e.hint) : esc(e.name)}</span></div><div class="lore k-${e.k}" style="white-space:pre-line"><span class="lk">${kn}</span>${e.locked ? '██████ ████ ██████████ ███ ██████' : esc(e.t)}</div>`;
      list.appendChild(f);
    }
  }

  // ------------------------------------------------------------------ settings & pause
  M.settings = function () {
    const ov = $('settings');
    const p = $('settingsPanel');
    const s = S.settings;
    const deep = L.Layers.current === 2 && cur === 'game';
    const row = (key, label, sub) => `<div class="set-row"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><button class="toggle ${s[key] ? 'on' : ''}" data-k="${key}" aria-label="${label.replace(/<[^>]+>/g, '')}"></button></div>`;
    p.innerHTML = `<div class="hdr"><h2>设置</h2><button class="back" id="setClose" aria-label="关闭">×</button></div>
      ${row('mute', `<span id="muteLbl">静音</span>`)}
      <div class="set-row"><span>音量</span><div class="seg3" id="volSeg">${[0.3, 0.55, 0.8, 1].map((v) => `<button class="${Math.abs(s.vol - v) < 0.01 ? 'on' : ''}" data-v="${v}">${Math.round(v * 100)}</button>`).join('')}</div></div>
      <div class="set-row"><span>音乐<small>每一层都有自己的配乐</small></span><div class="seg3" id="musSeg">${[0, 0.35, 0.7, 1].map((v) => `<button class="${Math.abs((s.music == null ? 0.7 : s.music) - v) < 0.01 ? 'on' : ''}" data-v="${v}">${v ? Math.round(v * 100) : '关'}</button>`).join('')}</div></div>
      ${row('crt', 'CRT 扫描线', '暗角、扫描线与轻微闪烁')}
      ${row('barrel', '桶形畸变', '屏幕边缘弯曲（较耗性能）')}
      ${row('fast', '快速动画', '缩短对局中的演出时间')}
      ${row('calm', '减少动效', '关闭震屏、闪烁与大部分粒子')}
      ${row('vibrate', '触感振动', '受到伤害时振动（如设备支持）')}
      ${row('hints', '新手提示', '对局中停顿时，提示下一步可以做什么')}
      <div class="set-row"><span>存储<small>${S.isPersistent() ? '档案与卡组保存在本机浏览器中' : '本机存储不可用，只在本次会话中保留'}</small></span></div>
      <div class="set-row"><span>重置进度<small>清除已收容的守门人与档案记录（不影响卡组）</small></span><button class="chip" id="resetProg">重置</button></div>`;
    p.querySelectorAll('.toggle').forEach((t) =>
      t.addEventListener('click', () => {
        const k = t.dataset.k;
        s[k] = !s[k];
        t.classList.toggle('on', s[k]);
        S.saveSettings();
        M.applySettings();
        A.play('click');
      })
    );
    p.querySelectorAll('#volSeg button').forEach((b) => b.addEventListener('click', () => { s.vol = +b.dataset.v; S.saveSettings(); M.applySettings(); p.querySelectorAll('#volSeg button').forEach((x) => x.classList.toggle('on', x === b)); A.play('click'); }));
    p.querySelectorAll('#musSeg button').forEach((b) => b.addEventListener('click', () => { s.music = +b.dataset.v; S.saveSettings(); M.applySettings(); p.querySelectorAll('#musSeg button').forEach((x) => x.classList.toggle('on', x === b)); A.play('click'); }));
    $('setClose').onclick = () => ov.classList.remove('on');
    const rp = $('resetProg');
    rp.onclick = () => {
      if (rp.dataset.arm) { S.progress = { beaten: [], wins: 0, losses: 0, seen: [], firstSeen: Date.now() }; S.saveProgress(); rp.textContent = '已重置'; return; }
      rp.dataset.arm = 1;
      rp.textContent = '再按一次确认';
      rp.style.color = 'var(--red)';
    };
    if (deep) {
      // the deepest layer does not want you to go quiet
      setTimeout(() => { const m = $('muteLbl'); if (m) { m.textContent = '别出声'; setTimeout(() => (m.textContent = '静音'), 220); } }, 900);
    }
    ov.classList.add('on');
  };
  M.applySettings = function () {
    const s = S.settings;
    const app = $('app');
    app.classList.toggle('crt', !!s.crt);
    app.classList.toggle('barrel', !!s.crt && !!s.barrel);
    app.classList.toggle('calm', !!s.calm);
    L.FX.setCalm(!!s.calm);
    L.FX.speed = s.fast ? 0.6 : 1;
    document.documentElement.style.setProperty('--sp', s.fast ? 0.6 : 1);
    A.setVolume();
  };
  M.pause = function () {
    const ov = $('pause');
    const p = $('pausePanel');
    p.innerHTML = `<div class="hdr"><h2>暂停</h2><button class="back" id="pClose" aria-label="关闭">×</button></div>
      <button class="btn" id="pResume">继续</button>
      <button class="btn ghost" id="pMute">${S.settings.mute ? '取消静音' : '静音'}</button>
      <button class="btn ghost" id="pSet">设置</button>
      <button class="btn ghost" id="pLog">本局记录</button>
      <button class="btn ghost" id="pRules">规则速查</button>
      <button class="btn danger" id="pQuit">认输并离开</button>
      <div id="pExtra"></div>`;
    $('pClose').onclick = $('pResume').onclick = () => ov.classList.remove('on');
    $('pSet').onclick = () => { ov.classList.remove('on'); M.settings(); };
    $('pMute').onclick = () => { S.settings.mute = !S.settings.mute; S.saveSettings(); M.applySettings(); $('pMute').textContent = S.settings.mute ? '取消静音' : '静音'; const mt = $('muteTitle'); if (mt) mt.classList.toggle('off', !!S.settings.mute); };
    $('pLog').onclick = () => {
      $('pExtra').innerHTML = '<div class="log" style="max-height:40vh;-webkit-mask:none;mask:none">' + L.UI.logLines().slice(-60).map((l) => `<div class="${l.cls || ''}">${esc(l.t)}</div>`).join('') + '</div>';
    };
    $('pRules').onclick = () => {
      const lay = L.LAYERS.map((l) => `<div><b>第 ${l.id} 层 · ${l.name}</b>${l.rule}${l.closing ? ' ' + l.closing : ''}</div>`).join('');
      $('pExtra').innerHTML = `<div class="kwl">${lay}<div><b>理智</b>上限 10，每回合回复 1。带 ${CV.SYM} 的牌需要额外支付理智，消耗的理智会推高梦深。理智 ≤3 时进入动摇，手里会混进不存在的牌；理智归 0 时每回合开始受到 2 点伤害。</div><div><b>梦深</b>双方共用。达到 ${L.C.DEPTH_T[0]} 进入第 1 层，达到 ${L.C.DEPTH_T[1]} 进入第 2 层，不可逆。每个回合结束时梦深也会 +1。</div>${Object.values(L.KEYWORDS).map((k) => `<div><b>${CV.sym(k.name)}</b>${esc(k.desc)}</div>`).join('')}</div>`;
    };
    const q = $('pQuit');
    q.onclick = () => {
      if (!q.dataset.arm) { q.dataset.arm = 1; q.textContent = '再按一次：认输'; return; }
      ov.classList.remove('on');
      L.UI.concede();
    };
    ov.classList.add('on');
  };

  // ------------------------------------------------------------------ results
  M.endScreen = function (o) {
    const ov = $('endov');
    const me = o.G.players[0];
    const rounds = Math.ceil(o.G.turn / 2);
    const quote = o.win ? o.boss.lines.defeat.join('') : o.boss.lines.victory[0];
    let unlock = '';
    if (o.win && o.newBeat) {
      const cards = L.BOSS_CARDS.filter((id) => L.CARDS[id].boss === o.boss.bossKey).map((id) => '「' + L.CARDS[id].name + '」').join('、');
      unlock = `<div class="unlock">已收容：${esc(o.boss.name)}<br>解锁守门人卡牌 ${esc(cards)} · 档案已更新</div>`;
      if (L.BOSSES.every((b) => S.progress.beaten.includes(L.HEROES[b].bossKey))) unlock += `<div class="unlock" style="border-color:#fff;color:#fff">档案的最后一页，好像多了一行字。</div>`;
    }
    const idx = L.BOSSES.indexOf(o.boss.id);
    const next = o.win && idx < L.BOSSES.length - 1 ? L.BOSSES[idx + 1] : null;
    ov.className = 'ov dim on ' + (o.win ? 'win' : 'lose');
    ov.innerHTML = `<div class="sub">${esc(o.boss.code)} · ${esc(o.boss.name)}</div>
      <div class="big">${o.draw ? '同归于尽' : o.win ? '收容成功' : '你被留下了'}</div>
      <div class="quote">「${esc(quote)}」</div>
      <div class="stats"><div><b>${rounds}</b>轮</div><div><b>${me.stats.dmg}</b>对英雄造成伤害</div><div><b>${o.G.deepest}</b>到达的最深层</div><div><b>${me.stats.played}</b>打出的牌</div><div><b>${me.stats.contained}</b>收容次数</div><div><b>${me.stats.san}</b>消耗的理智</div></div>
      ${unlock}
      <div class="btns">${next ? `<button class="btn" id="eNext">继续下沉 · ${esc(L.HEROES[next].short)}</button>` : ''}<button class="btn ${next ? 'ghost' : ''}" id="eAgain">再来一局</button><button class="btn ghost" id="eHome">返回标题</button></div>`;
    if (next) $('eNext').onclick = () => { ov.classList.remove('on'); L.UI.leave(); M.startNext(next); };
    $('eAgain').onclick = () => { ov.classList.remove('on'); L.UI.leave(); startMatch(); };
    $('eHome').onclick = () => { ov.classList.remove('on'); L.UI.leave(); M.show('title'); };
  };
})();
