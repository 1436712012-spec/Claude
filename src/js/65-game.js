/* LIMINAL · match controller: render, input, event playback, AI turns */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const E = L.E, CV = L.CV, FX = L.FX, A = L.Audio;
  const UI = (L.UI = {});
  const $ = (id) => document.getElementById(id);
  const ME = 0, AI_PID = 1;

  let G = null;
  let cfg = null;
  let busy = false;
  let sel = null; // {kind:'card'|'minion'|'hp'|'bc', uid, pos}
  let aiMemo = {};
  let snap = null;
  let els = null;
  const minEls = new Map();
  const handEls = new Map();
  const dying = new Set();
  let skipAnim = false;
  let lastLineAt = 0;
  let saidLow = false, saidFourth = false;
  let idleTimer = null;
  let logLines = [];
  let preview = null;
  let lastTurnSeen = -1;
  let aiStep = 0;
  let hintTimer = null;
  UI.cfg = () => cfg;

  UI.isMyTurn = () => !!G && G.active === ME && !G.over;
  UI.state = () => G;
  UI.busy = () => busy;
  const speed = () => (L.Store.settings.fast ? 0.55 : 1);
  const sleep = (ms) => new Promise((r) => setTimeout(r, skipAnim ? 0 : ms * speed()));
  const rectOfEl = (el) => (el ? el.getBoundingClientRect() : null);
  const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const def = (cid) => L.CARDS[cid];

  function heroEl(pid) {
    return pid === ME ? els.heroP : els.heroE;
  }
  function elOf(uid) {
    if (!G) return null;
    if (uid === G.players[ME].uid) return els.heroP;
    if (uid === G.players[AI_PID].uid) return els.heroE;
    return minEls.get(uid) || null;
  }
  function rectOf(uid) {
    const el = elOf(uid);
    return el ? el.getBoundingClientRect() : null;
  }
  function pidOfUid(uid) {
    if (uid === G.players[0].uid) return 0;
    if (uid === G.players[1].uid) return 1;
    const m = E.char(G, uid);
    return m ? m.owner : null;
  }

  // ------------------------------------------------------------------ setup
  UI.init = function () {
    els = {
      screen: $('screen-game'), heroP: $('heroP'), heroE: $('heroE'), boardP: $('boardP'), boardE: $('boardE'), hand: $('hand'), ehand: $('ehand'),
      endTurn: $('endTurn'), hpP: $('hpP'), hpE: $('hpE'), field: $('field'), trackFill: $('trackFill'), trackMk: $('trackMk'), layerName: $('layerName'), depthNum: $('depthNum'),
      aim: $('aim'), aimPath: $('aimPath'), hbP: $('hbP'), hbE: $('hbE'), vign: $('vign'), sanv: $('sanv'), log: $('log'), sideR: $('sideR'), sideL: $('sideL'),
    };
    FX.setShakeTarget(els.screen);
    const T = L.C.DEPTH_T, MX = L.C.DEPTH_MAX;
    $('tick1').style.left = (T[0] / MX) * 100 + '%';
    $('tick2').style.left = (T[1] / MX) * 100 + '%';
    bindInput();
  };

  UI.start = function (c) {
    cfg = c;
    const boss = L.HEROES[c.boss];
    const deck = c.deck.slice();
    G = E.newGame({
      seed: c.seed != null ? c.seed : (Math.random() * 2 ** 31) | 0,
      first: c.first,
      depth: boss.startDepth,
      rec: true,
      players: [
        { hero: c.agent, deck, name: L.HEROES[c.agent].name },
        { hero: boss.id, deck: boss.deck, ai: true, name: boss.short },
      ],
    });
    if (c.setup) c.setup(G);
    lastTurnSeen = -1;
    aiStep = 0;
    L.Art.prioritize(deck.concat(boss.deck));
    minEls.clear();
    handEls.clear();
    dying.clear();
    els.boardP.innerHTML = els.boardE.innerHTML = els.hand.innerHTML = els.ehand.innerHTML = '';
    sel = null;
    saidLow = saidFourth = false;
    logLines = [];
    els.log.innerHTML = '';
    aiMemo = {};
    $('nameP').textContent = L.HEROES[c.agent].name;
    $('codeP').textContent = L.HEROES[c.agent].title;
    $('nameE').textContent = boss.name;
    $('codeE').textContent = boss.code;
    els.heroP.querySelector('.pt').style.backgroundImage = `url("${L.Art.portrait(c.agent)}")`;
    els.heroE.querySelector('.pt').style.backgroundImage = `url("${L.Art.portrait(boss.id)}")`;
    els.heroE.dataset.boss = boss.bossKey;
    els.hpP.querySelector('.ic').innerHTML = CV.HP_ICON[c.agent];
    els.hpE.querySelector('.ic').innerHTML = CV.HP_ICON[boss.id];
    L.Layers.set(G.layer, true);
    L.Menus.show('game');
    els.sideL.classList.add('on');
    els.sideR.classList.add('on');
    els.sideR.innerHTML = '';
    G.events.length = 0;
    render(E.snapshot(G));
    log('进入夹层。守门人：' + boss.name + '。', 's');
    busy = true;
    (async () => {
      await sleep(400);
      if (c.tutorial) {
        E.begin(G);
        await drain();
        afterAction();
        return;
      }
      const hour = new Date().getHours();
      const lines = boss.lines.intro.slice();
      if (hour >= 23 || hour < 5) lines.push(boss.lines.night[0]);
      for (const ln of lines) {
        say(ln, 2600);
        await sleep(1500);
      }
      E.mulligan(G, AI_PID, L.AI.mulligan(G, AI_PID));
      if (!L.Store.progress.briefed && !L.Store.progress.trained) await briefing();
      await mulligan();
      E.begin(G);
      await drain();
      // the gatekeeper may have won the coin flip
      if (!G.over && G.active === AI_PID) await aiTurn();
      afterAction();
    })();
  };

  // ------------------------------------------------------------------ first-time briefing
  function briefing() {
    return new Promise((res) => {
      const ov = $('mull');
      ov.classList.remove('four');
      ov.innerHTML = `<div class="ttl">外勤须知</div><div class="sub">LMN-000 · 第一次进入</div>
        <div class="kwl" style="width:calc(var(--u)*86)">
          <div><b>出牌</b>轻触手牌选中，再轻触战场或目标；也可以直接把牌拖上去。按住手牌左右滑动可以放大阅读。</div>
          <div><b>攻击</b>轻触一个发光的随从，再轻触敌人；或者从随从拖向目标。长按任何东西查看详情。</div>
          <div><b>${CV.SYM}理智</b>带 ${CV.SYM} 的牌更强，但要额外支付理智。理智太低，你的手里会出现不存在的牌。</div>
          <div><b>梦深</b>消耗的理智和时间会让梦往下沉。沉到下一层时，规则会对双方同时改变，而且回不去。</div>
          <div><b>收容</b>被收容的敌人会进入你的牌库。及时打出它，它就是你的；拖得太久，它会突破回去。</div>
        </div><button class="btn" id="briefOk">明白了</button>`;
      ov.classList.add('on');
      $('briefOk').onclick = () => {
        A.play('click');
        L.Store.progress.briefed = true;
        L.Store.saveProgress();
        ov.classList.remove('on');
        res();
      };
    });
  }

  // ------------------------------------------------------------------ mulligan
  function mulligan() {
    return new Promise((res) => {
      const ov = $('mull');
      const p = G.players[ME];
      const swap = new Set();
      ov.innerHTML = `<div class="ttl">起手</div><div class="sub">${G.first === ME ? '你先手' : '你后手 · 获得「旧硬币」'} · 轻触选择要更换的牌</div><div class="row"></div><button class="btn" id="mullOk">确认</button>`;
      const row = ov.querySelector('.row');
      for (const ci of p.hand) {
        const el = CV.card(ci.cid, { uid: ci.uid, cost: E.costOf(G, p, ci) });
        el.addEventListener('click', () => {
          A.play('click');
          if (swap.has(ci.uid)) swap.delete(ci.uid);
          else swap.add(ci.uid);
          el.classList.toggle('swap', swap.has(ci.uid));
        });
        row.appendChild(el);
      }
      ov.classList.toggle('four', p.hand.length > 3);
      ov.classList.add('on');
      $('mullOk').onclick = () => {
        A.play('flip');
        E.mulligan(G, ME, Array.from(swap));
        ov.classList.remove('on');
        res();
      };
    });
  }

  // ------------------------------------------------------------------ rendering
  function render(s) {
    snap = s;
    if (!s) return;
    const P0 = s.p[ME], P1 = s.p[AI_PID];
    renderHero(els.heroP, els.hbP, P0, 'P');
    renderHero(els.heroE, els.hbE, P1, 'E');
    // enemy hand backs
    const eh = els.ehand;
    while (eh.children.length > P1.hand.length) eh.lastChild.remove();
    while (eh.children.length < P1.hand.length) eh.appendChild(CV.back());
    Array.from(eh.children).forEach((b, i) => {
      const n = P1.hand.length;
      b.style.transform = `rotate(${(i - (n - 1) / 2) * 4}deg)`;
    });
    $('deckP').textContent = '牌库 ' + P0.deckN;
    $('deckE').textContent = '牌库 ' + P1.deckN;
    // boards with FLIP
    const before = new Map();
    for (const [uid, el] of minEls) if (!dying.has(uid)) before.set(uid, el.getBoundingClientRect());
    renderBoard(els.boardP, P0.board);
    renderBoard(els.boardE, P1.board);
    for (const [uid, el] of minEls) {
      const b = before.get(uid);
      if (!b || dying.has(uid)) continue;
      const a = el.getBoundingClientRect();
      const dx = b.left - a.left, dy = b.top - a.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 320 * speed(), easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    renderHand(P0.hand);
    renderMid(s);
    updateInteractivity();
  }
  function renderHero(hero, bar, p, side) {
    hero.querySelector('.hpb b').textContent = p.hp;
    hero.querySelector('.hpb').classList.toggle('hurt', p.hp < p.maxHp);
    const arm = hero.querySelector('.arm');
    arm.classList.toggle('on', p.armor > 0);
    arm.querySelector('b').textContent = p.armor;
    hero.classList.toggle('shaken', !!p.shaken);
    bar.classList.toggle('shaken', !!p.shaken);
    bar.classList.toggle('zero', p.sanity === 0);
    pips($('san' + side), 10, p.sanity, 'san');
    pips($('mana' + side), Math.max(p.maxMana, 1), p.mana, 'mana', p.maxMana);
    $('sanLbl' + side).textContent = '理智 ' + p.sanity;
    $('manaLbl' + side).textContent = '法力 ' + p.mana + '/' + p.maxMana;
    const btn = side === 'P' ? els.hpP : els.hpE;
    btn.classList.toggle('used', !!p.hpUsed);
  }
  function pips(box, n, on, cls, max) {
    if (box.children.length !== n || box.dataset.cls !== cls) {
      box.innerHTML = '';
      box.dataset.cls = cls;
      for (let i = 0; i < n; i++) {
        const d = document.createElement('i');
        d.className = 'pip ' + cls;
        box.appendChild(d);
      }
    }
    Array.from(box.children).forEach((d, i) => d.classList.toggle('on', i < on));
  }
  function renderBoard(box, list) {
    const keep = new Set(list.map((m) => m.uid));
    // remove elements that left this board (unless they are mid-death)
    Array.from(box.children).forEach((el) => {
      if (el.classList.contains('gap')) return;
      const uid = +el.dataset.uid;
      if (!keep.has(uid) && !dying.has(uid)) {
        el.remove();
        if (minEls.get(uid) === el) minEls.delete(uid);
      }
    });
    let prev = null;
    for (const m of list) {
      let el = minEls.get(m.uid);
      if (!el) {
        el = CV.minion(m);
        minEls.set(m.uid, el);
      } else CV.updateMinion(el, m);
      el.classList.toggle('breached', !!m.breached);
      const want = prev ? prev.nextSibling : box.firstChild;
      if (el.parentNode !== box || want !== el) box.insertBefore(el, want);
      prev = el;
    }
  }
  function renderHand(list) {
    const keep = new Set(list.map((c) => c.uid));
    for (const [uid, el] of handEls) if (!keep.has(uid)) { el.remove(); handEls.delete(uid); }
    list.forEach((c, i) => {
      let el = handEls.get(c.uid);
      if (!el) {
        el = CV.card(c.cid, c);
        handEls.set(c.uid, el);
        els.hand.appendChild(el);
      } else CV.updateCard(el, c);
      el.dataset.idx = i;
    });
    layoutHand();
  }
  function layoutHand() {
    const list = snap ? snap.p[ME].hand : [];
    const n = list.length;
    const W = els.hand.clientWidth || 1;
    const cw = els.hand.querySelector('.card') ? els.hand.querySelector('.card').offsetWidth : W * 0.23;
    const usable = W * 0.9 - cw;
    const step = n > 1 ? Math.min(cw * 0.8, usable / (n - 1)) : 0;
    list.forEach((c, i) => {
      const el = handEls.get(c.uid);
      if (!el || el.classList.contains('dragging')) return;
      const k = i - (n - 1) / 2;
      const rot = k * Math.min(5, 34 / Math.max(n, 1));
      const y = Math.abs(k) * Math.abs(k) * (n > 6 ? 1.1 : 1.6);
      let t = `translateX(${(k * step).toFixed(1)}px) translateY(${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
      if (sel && (sel.kind === 'card' || sel.kind === 'bc') && sel.uid === c.uid) t = `translateX(${(k * step).toFixed(1)}px) translateY(${(-cw * 0.42).toFixed(1)}px) rotate(0deg) scale(1.12)`;
      el.style.transform = t;
      el.style.zIndex = sel && sel.uid === c.uid ? 30 : 10 + i;
    });
  }
  function renderMid(s) {
    const lay = L.LAYERS[s.layer];
    els.layerName.textContent = `第 ${s.layer} 层 · ${lay.name}`;
    els.depthNum.textContent = '梦深 ' + String(s.depth).padStart(3, '0');
    const pct = Math.min(100, (s.depth / L.C.DEPTH_MAX) * 100);
    els.trackFill.style.width = pct + '%';
    els.trackFill.style.setProperty('--trackW', (100 / Math.max(pct, 0.01)) * 100 + '%');
    els.trackMk.style.left = pct + '%';
    const f = els.field;
    if (s.field) {
      const d = def(s.field.cid);
      f.className = 'field on ' + (s.field.owner === ME ? 'mine' : 'theirs');
      f.style.backgroundImage = `url("${L.Art.card(s.field.cid)}")`;
      f.innerHTML = `<span class="fo">${s.field.owner === ME ? '▼ 我方' : '▲ 敌方'}</span><span class="fn">${CV.esc(d.name)}</span>`;
    } else {
      f.className = 'field';
      f.style.backgroundImage = '';
      f.innerHTML = '<span>场地 · 空</span>';
    }
  }

  // which of my things can act right now
  function updateInteractivity() {
    if (!G) return;
    const live = UI.isMyTurn() && !busy;
    const p = G.players[ME];
    let any = false;
    for (const [uid, el] of handEls) {
      const can = live && E.canPlay(G, ME, uid);
      el.classList.toggle('playable', can);
      if (can) any = true;
    }
    for (const m of p.board) {
      const el = minEls.get(m.uid);
      if (!el) continue;
      const can = live && E.canAttack(G, m.uid);
      el.classList.toggle('ready', can && !(sel && sel.kind === 'minion' && sel.uid === m.uid));
      if (can) any = true;
    }
    for (const m of G.players[AI_PID].board) {
      const el = minEls.get(m.uid);
      if (el) el.classList.remove('ready');
    }
    const hpOk = live && E.canHeroPower(G, ME);
    els.hpP.classList.toggle('ready', hpOk);
    if (hpOk) any = true;
    const et = els.endTurn;
    if (!G.over && G.active === ME && !busy) {
      et.className = 'endturn' + (any ? '' : ' done');
      et.textContent = '结束回合';
    } else {
      et.className = 'endturn wait';
      et.textContent = G.over ? '——' : G.active === ME ? '……' : '对手回合';
    }
    clearTargets();
    if (live && sel) showTargets();
  }

  // ------------------------------------------------------------------ targets & selection
  function targetUidsForSel() {
    if (!sel) return [];
    if (sel.kind === 'card' || sel.kind === 'bc') {
      const ci = G.players[ME].hand.find((c) => c.uid === sel.uid);
      if (!ci) return [];
      if (ci.fake) {
        // a fake asks for targets like the real thing would
        const d = def(ci.cid);
        return d.tgt ? E.validTargets(G, ME, d.tgt, null, { p: ME }) : [];
      }
      return E.cardTargets(G, ME, sel.uid);
    }
    if (sel.kind === 'minion') return E.attackTargets(G, sel.uid);
    if (sel.kind === 'hp') return E.heroPowerTargets(G, ME);
    return [];
  }
  function clearTargets() {
    document.querySelectorAll('.target').forEach((e) => e.classList.remove('target', 'friendly'));
    document.querySelectorAll('.minion.sel').forEach((e) => e.classList.remove('sel'));
    els.hpP.classList.remove('sel');
    els.boardP.classList.remove('dropzone');
    els.boardP.querySelectorAll('.gap').forEach((g) => g.remove());
  }
  function showTargets() {
    if (!sel) return;
    if (sel.kind === 'minion') { const el = minEls.get(sel.uid); if (el) el.classList.add('sel'); }
    if (sel.kind === 'hp') els.hpP.classList.add('sel');
    const ci = sel.kind === 'card' ? G.players[ME].hand.find((c) => c.uid === sel.uid) : null;
    if (ci && def(ci.cid).type === 'minion') els.boardP.classList.add('dropzone');
    else if (ci && !def(ci.cid).tgt) els.boardP.classList.add('dropzone');
    if (sel.kind === 'card' && ci && def(ci.cid).type === 'minion') return; // place first
    for (const uid of targetUidsForSel()) {
      const el = elOf(uid);
      if (!el) continue;
      el.classList.add('target');
      if (pidOfUid(uid) === ME) el.classList.add('friendly');
    }
    if (sel.kind === 'bc') {
      const gap = document.createElement('div');
      gap.className = 'gap';
      const kids = Array.from(els.boardP.children).filter((c) => !c.classList.contains('gap'));
      els.boardP.insertBefore(gap, kids[sel.pos] || null);
    }
  }
  function setSel(s) {
    if (L.Tutorial && L.Tutorial.clearHint) L.Tutorial.clearHint();
    if (!s) hideAim();
    sel = s;
    layoutHand();
    updateInteractivity();
    showSidePreview(s && (s.kind === 'card' || s.kind === 'bc') ? s.uid : null);
  }
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    $('domfx').appendChild(t);
    t.animate([{ opacity: 0, transform: 'translate(-50%,10px)' }, { opacity: 1, transform: 'translate(-50%,0)', offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1600 }).onfinish = () => t.remove();
  }
  UI.toast = toast;

  function whyCantPlay(uid) {
    const p = G.players[ME];
    const ci = p.hand.find((c) => c.uid === uid);
    if (!ci) return '';
    const d = def(ci.cid);
    if (G.active !== ME) return '现在是对手的回合。';
    if (E.costOf(G, p, ci) > p.mana) return '法力值不足。';
    if ((d.san || 0) > p.sanity) return '理智不足。';
    if (d.type === 'minion' && p.board.length >= 7) return '场上已经站满了。';
    return '没有合法的目标。';
  }

  // ------------------------------------------------------------------ input
  let press = null;
  function bindInput() {
    const hand = els.hand;
    hand.addEventListener('pointerdown', onHandDown);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', () => { cancelPress(); });
    els.screen.addEventListener('click', onBoardClick);
    els.endTurn.addEventListener('click', () => {
      if (!UI.isMyTurn() || busy) return;
      A.play('click');
      setSel(null);
      endMyTurn();
    });
    els.hpP.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!UI.isMyTurn() || busy) return inspectHeroPower(ME);
      if (!E.canHeroPower(G, ME)) {
        if (G.players[ME].hpUsed) toast('英雄技能每回合只能使用一次。');
        else toast(G.players[ME].mana < 2 ? '法力值不足。' : '现在无法使用。');
        A.play('error');
        return;
      }
      const hp = E.heroPowerInfo(G, ME);
      if (!hp.tgt) { A.play('click'); doAction({ t: 'hp', target: null }); return; }
      setSel(sel && sel.kind === 'hp' ? null : { kind: 'hp' });
    });
    els.hpE.addEventListener('click', (e) => { e.stopPropagation(); if (sel) return tryTarget(G.players[AI_PID].uid); inspectHeroPower(AI_PID); });
    els.field.addEventListener('click', (e) => { e.stopPropagation(); if (G && G.field) UI.inspect(G.field.cid); });
    $('gameMenu').addEventListener('click', (e) => { e.stopPropagation(); L.Menus.pause(); });
    // long-press inspect on board things
    let lp = null;
    els.screen.addEventListener('pointerdown', (e) => {
      const m = e.target.closest('.minion, .hero');
      if (!m) return;
      lp = setTimeout(() => {
        lp = 'fired';
        if (m.classList.contains('minion')) inspectMinion(+m.dataset.uid);
        else inspectHeroPower(m === els.heroP ? ME : AI_PID);
      }, 480);
      const clear = () => { if (lp && lp !== 'fired') clearTimeout(lp); window.removeEventListener('pointerup', clear); };
      window.addEventListener('pointerup', clear);
    });
    els.screen.addEventListener('click', (e) => { if (lp === 'fired') { e.stopPropagation(); lp = null; } }, true);
    // minion drag-to-attack
    els.boardP.addEventListener('pointerdown', (e) => {
      const m = e.target.closest('.minion');
      if (!m || !UI.isMyTurn() || busy) return;
      const uid = +m.dataset.uid;
      if (!E.canAttack(G, uid)) return;
      press = { kind: 'minion', uid, x: e.clientX, y: e.clientY, drag: false, el: m };
    });
    window.addEventListener('mousemove', (e) => {
      if (!sel || press) return;
      if (sel.kind === 'minion' || sel.kind === 'hp' || sel.kind === 'bc' || (sel.kind === 'card' && targetUidsForSel().length && def(G.players[ME].hand.find((c) => c.uid === sel.uid)?.cid || 'S01').type !== 'minion')) {
        const src = sel.kind === 'minion' ? rectOf(sel.uid) : sel.kind === 'hp' ? els.hpP.getBoundingClientRect() : (handEls.get(sel.uid) || els.hand).getBoundingClientRect();
        if (src) aim(center(src), { x: e.clientX, y: e.clientY });
      }
    });
    els.hand.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || press) return;
      const uid = cardIndexAt(e.clientX);
      if (uid != null && uid !== els.hand._hover) { els.hand._hover = uid; showSidePreview(uid); }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && G && !G.over && L.Menus.current() === 'game') setTimeout(() => toast('你离开的时候，走廊变长了。'), 400);
    });
  }
  function aim(a, b) {
    els.aim.classList.add('on');
    const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 60;
    els.aimPath.setAttribute('d', `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`);
  }
  function hideAim() { els.aim.classList.remove('on'); }

  function cardIndexAt(x) {
    let best = null, bd = 1e9;
    for (const [uid, el] of handEls) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const d = Math.abs(cx - x);
      if (d < bd && x > r.left - 10 && x < r.right + 10) { bd = d; best = uid; }
    }
    return best;
  }
  function onHandDown(e) {
    if (!G) return;
    const uid = cardIndexAt(e.clientX);
    if (uid == null) return;
    press = { kind: 'hand', uid, x: e.clientX, y: e.clientY, t: performance.now(), drag: false, previewed: false };
    press.timer = setTimeout(() => { if (press && !press.drag) { press.previewed = true; showPreview(press.uid); } }, 260);
  }
  function onMove(e) {
    if (!press) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (press.kind === 'hand') {
      if (!press.drag && dy < -28 && Math.abs(dy) > Math.abs(dx) * 0.8 && UI.isMyTurn() && !busy) {
        if (!E.canPlay(G, ME, press.uid)) { toast(whyCantPlay(press.uid)); A.play('error'); cancelPress(); return; }
        press.drag = true;
        hidePreview();
        clearTimeout(press.timer);
        setSel({ kind: 'card', uid: press.uid });
        const el = handEls.get(press.uid);
        el.classList.add('dragging');
        press.el = el;
        press.r0 = el.getBoundingClientRect();
      }
      if (press.drag) {
        e.preventDefault();
        const el = press.el;
        const r0 = press.r0;
        const ci = G.players[ME].hand.find((c) => c.uid === press.uid);
        const d = ci && def(ci.cid);
        const needsAim = d && d.type === 'spell' && d.tgt && !ci.fake;
        const hr = els.hand.getBoundingClientRect();
        if (needsAim && e.clientY < hr.top) {
          el.style.transform = `translate(${(press.x - r0.left - r0.width / 2) * 0}px, ${(-r0.height * 0.5).toFixed(0)}px) scale(.9)`;
          aim(center(el.getBoundingClientRect()), { x: e.clientX, y: e.clientY });
        } else {
          hideAim();
          const base = el.style.transform.match(/translateX\([^)]*\)/);
          el.style.transform = `translate(${(e.clientX - press.x).toFixed(0)}px, ${(e.clientY - press.y).toFixed(0)}px) scale(1.05)`;
          if (base) el.style.transform = `${base[0]} ` + el.style.transform;
        }
        // live placement gap for minions
        if (d && d.type === 'minion') {
          const br = els.boardP.getBoundingClientRect();
          if (e.clientY > br.top - 20 && e.clientY < br.bottom + 20) showGapAt(insertIndex(e.clientX));
          else els.boardP.querySelectorAll('.gap').forEach((g) => g.remove());
        }
      } else if (press.previewed) {
        const uid = cardIndexAt(e.clientX);
        if (uid != null && uid !== press.uid) { press.uid = uid; showPreview(uid); }
      } else if (Math.abs(dx) > 14) {
        press.previewed = true;
        clearTimeout(press.timer);
        showPreview(press.uid);
      }
    } else if (press.kind === 'minion') {
      if (!press.drag && Math.hypot(dx, dy) > 14) {
        press.drag = true;
        setSel({ kind: 'minion', uid: press.uid });
      }
      if (press.drag) {
        e.preventDefault();
        aim(center(press.el.getBoundingClientRect()), { x: e.clientX, y: e.clientY });
      }
    }
  }
  function onUp(e) {
    if (!press) return;
    const p = press;
    press = null;
    clearTimeout(p.timer);
    hidePreview();
    hideAim();
    if (p.kind === 'hand') {
      if (p.drag) {
        p.el.classList.remove('dragging');
        UI._suppress = performance.now(); // the synthetic click after a drag must not cancel targeting
        dropCard(p.uid, e.clientX, e.clientY);
        return;
      }
      // the hand is a scrubber: press, slide to the card you want, release to pick it up
      if (p.previewed && !(UI.isMyTurn() && !busy && E.canPlay(G, ME, p.uid))) return;
      // a tap (or a scrub release)
      if (!UI.isMyTurn() || busy) { UI.inspectHand(p.uid); return; }
      if (!p.previewed && sel && sel.uid === p.uid && sel.kind === 'card') { setSel(null); return; }
      if (!E.canPlay(G, ME, p.uid)) { toast(whyCantPlay(p.uid)); A.play('error'); setSel(null); return; }
      A.play('hover');
      const ci = G.players[ME].hand.find((c) => c.uid === p.uid);
      const d = def(ci.cid);
      // untargeted spells / fields: one more tap on the board casts them
      setSel({ kind: 'card', uid: p.uid });
      if (d.type !== 'minion' && !d.tgt) toast('轻触战场以使用');
      return;
    }
    if (p.kind === 'minion' && p.drag) {
      const t = e.target && document.elementFromPoint(e.clientX, e.clientY);
      const tEl = t && t.closest('.minion, .hero');
      if (tEl) {
        const uid = tEl.classList.contains('hero') ? (tEl === els.heroE ? G.players[AI_PID].uid : G.players[ME].uid) : +tEl.dataset.uid;
        p.suppressClick = true;
        UI._suppress = performance.now();
        tryTarget(uid);
      } else setSel(null);
    }
  }
  function cancelPress() {
    if (!press) return;
    clearTimeout(press.timer);
    if (press.el) press.el.classList.remove('dragging');
    press = null;
    hidePreview();
    hideAim();
    layoutHand();
  }
  function insertIndex(x) {
    const kids = Array.from(els.boardP.children).filter((c) => c.classList.contains('minion') && !dying.has(+c.dataset.uid));
    let i = 0;
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      if (x > r.left + r.width / 2) i++;
    }
    return i;
  }
  function showGapAt(i) {
    const cur = els.boardP.querySelector('.gap');
    const kids = Array.from(els.boardP.children).filter((c) => c.classList.contains('minion'));
    if (cur && +cur.dataset.i === i) return;
    if (cur) cur.remove();
    const gap = document.createElement('div');
    gap.className = 'gap';
    gap.dataset.i = i;
    els.boardP.insertBefore(gap, kids[i] || null);
  }
  function dropCard(uid, x, y) {
    const ci = G.players[ME].hand.find((c) => c.uid === uid);
    if (!ci) return setSel(null);
    const d = def(ci.cid);
    const hr = els.hand.getBoundingClientRect();
    const t = document.elementFromPoint(x, y);
    if (d.type === 'minion') {
      const br = els.boardP.getBoundingClientRect();
      if (y < hr.top && y > br.top - 60) return placeMinion(uid, insertIndex(x));
      return setSel(null);
    }
    if (d.tgt && !ci.fake) {
      const tEl = t && t.closest('.minion, .hero');
      if (tEl) {
        const tu = tEl.classList.contains('hero') ? (tEl === els.heroE ? G.players[AI_PID].uid : G.players[ME].uid) : +tEl.dataset.uid;
        return tryTarget(tu);
      }
      return setSel(null);
    }
    if (y < hr.top - 10) return doAction({ t: 'play', uid, target: null });
    setSel(null);
  }
  function placeMinion(uid, pos) {
    const ci = G.players[ME].hand.find((c) => c.uid === uid);
    const d = def(ci.cid);
    const needs = !ci.fake ? E.cardTargets(G, ME, uid) : d.tgt ? E.validTargets(G, ME, d.tgt, null, { p: ME }) : [];
    if (d.tgt && needs.length) {
      setSel({ kind: 'bc', uid, pos });
      toast('选择战吼的目标');
      return;
    }
    doAction({ t: 'play', uid, target: null, pos });
  }
  function onBoardClick(e) {
    if (!G || G.over) return;
    if (UI._suppress && performance.now() - UI._suppress < 300) return;
    if (e.target.closest('#hand, #endTurn, #hpP, #hpE, #field, #gameMenu')) return;
    const hit = e.target.closest('.minion, .hero');
    const uid = hit ? (hit.classList.contains('hero') ? (hit === els.heroE ? G.players[AI_PID].uid : G.players[ME].uid) : +hit.dataset.uid) : null;
    if (!UI.isMyTurn() || busy) {
      if (hit && hit.classList.contains('minion')) inspectMinion(uid);
      return;
    }
    if (sel) {
      if (sel.kind === 'card') {
        const ci = G.players[ME].hand.find((c) => c.uid === sel.uid);
        const d = ci && def(ci.cid);
        if (!d) return setSel(null);
        if (d.type === 'minion') {
          const br = els.boardP.getBoundingClientRect();
          if (e.clientY > br.top - 30 && e.clientY < br.bottom + 30) return placeMinion(sel.uid, insertIndex(e.clientX));
          return setSel(null);
        }
        if (!d.tgt || ci.fake) {
          if (ci.fake && d.tgt && uid == null) return setSel(null);
          return doAction({ t: 'play', uid: sel.uid, target: null });
        }
      }
      if (uid != null) return tryTarget(uid);
      return setSel(null);
    }
    if (hit) {
      if (hit.classList.contains('minion') && pidOfUid(uid) === ME && E.canAttack(G, uid)) {
        A.play('hover');
        return setSel({ kind: 'minion', uid });
      }
      if (hit.classList.contains('minion')) inspectMinion(uid);
    }
  }
  function tryTarget(uid) {
    if (!sel) return;
    const valid = targetUidsForSel();
    if (valid.indexOf(uid) < 0) {
      const t = E.char(G, uid);
      if (sel.kind === 'minion' && t && t.isHero !== true && t.kw && t.kw.stealth) toast('潜行的随从无法被选为目标。');
      else if (sel.kind === 'minion' && G.players[AI_PID].board.some((m) => m.kw.taunt && !m.kw.stealth)) toast('你必须先攻击具有嘲讽的随从。');
      else if (sel.kind === 'minion' && t && t.isHero) toast('这个随从这回合还不能攻击英雄。');
      else toast('这不是一个合法的目标。');
      A.play('error');
      return;
    }
    if (sel.kind === 'minion') return doAction({ t: 'atk', a: sel.uid, target: uid });
    if (sel.kind === 'hp') return doAction({ t: 'hp', target: uid });
    if (sel.kind === 'card') return doAction({ t: 'play', uid: sel.uid, target: uid });
    if (sel.kind === 'bc') return doAction({ t: 'play', uid: sel.uid, target: uid, pos: sel.pos });
  }

  async function doAction(a) {
    if (busy || !UI.isMyTurn()) return;
    if (cfg.gate && !cfg.gate(a, G)) {
      A.play('error');
      setSel(null);
      render(E.snapshot(G));
      return;
    }
    const s = sel;
    setSel(null);
    // fake cards with a target: pretend, then play without effect
    if (a.t === 'play') {
      const ci = G.players[ME].hand.find((c) => c.uid === a.uid);
      if (ci && ci.fake) a.target = null;
    }
    const ok = L.AI.apply(G, ME, a);
    if (!ok) {
      A.play('error');
      toast('无法执行。');
      render(E.snapshot(G));
      return;
    }
    await drain();
    afterAction();
    if (cfg.after) cfg.after(a, G);
  }
  async function endMyTurn() {
    if (busy) return;
    if (cfg.gate && !cfg.gate({ t: 'end' }, G)) { A.play('error'); return; }
    busy = true;
    E.endTurn(G, ME);
    await drain();
    if (!G.over && G.active === AI_PID) await aiTurn();
    afterAction();
  }
  function afterAction() {
    busy = false;
    render(E.snapshot(G));
    if (G.over) return finish();
    if (G.active === ME && G.turn !== lastTurnSeen) {
      lastTurnSeen = G.turn;
      if (cfg.onTurn) { cfg.onTurn(G); render(E.snapshot(G)); }
    }
    armIdle();
    armHint();
  }
  // gentle in-match hints for new players: after a pause, point at the next sensible thing
  function armHint() {
    clearTimeout(hintTimer);
    if (cfg.tutorial || !L.Store.settings.hints || !UI.isMyTurn()) return;
    hintTimer = setTimeout(() => {
      if (!UI.isMyTurn() || busy || sel || !L.Tutorial) return;
      const p = G.players[ME];
      const card = p.hand.find((c) => E.canPlay(G, ME, c.uid) && !c.fake);
      const atk = p.board.find((m) => E.canAttack(G, m.uid));
      if (card) L.Tutorial.hint(`#hand .card[data-uid="${card.uid}"]`, '这张牌现在就能打出：轻触它，再轻触战场或目标。');
      else if (atk) L.Tutorial.hint(`#boardP .minion[data-uid="${atk.uid}"]`, '发光的随从可以攻击：轻触它，再轻触敌人。');
      else if (E.canHeroPower(G, ME)) L.Tutorial.hint('#hpP', '还剩法力，可以用英雄技能。');
      else L.Tutorial.hint('#endTurn', '没什么可做的了，结束回合吧。');
    }, 9000);
  }
  function armIdle() {
    clearTimeout(idleTimer);
    if (!UI.isMyTurn()) return;
    idleTimer = setTimeout(() => {
      if (!UI.isMyTurn() || busy) return;
      const boss = L.HEROES[cfg.boss];
      if (G.layer >= 1) say(boss.lines.fourth[1] || boss.lines.fourth[0], 3200, true);
    }, 45000);
  }

  async function aiTurn() {
    aiMemo = {};
    const boss = L.HEROES[cfg.boss];
    await sleep(450);
    for (let i = 0; i < 40 && !G.over && G.active === AI_PID; i++) {
      const a = cfg.script ? cfg.script(G, aiStep++) : await L.AIW.decide(G, AI_PID, boss.persona, aiMemo);
      if (!G || G.over) break;
      if (a.t === 'end') break;
      if (a.t === 'atk') {
        const el = minEls.get(a.a);
        if (el) {
          el.classList.add('sel');
          await sleep(220);
          el.classList.remove('sel');
        }
      }
      const ok = L.AI.apply(G, AI_PID, a);
      if (!ok) break;
      await drain();
      await sleep(380);
    }
    if (!G.over && G.active === AI_PID) {
      await sleep(250);
      E.endTurn(G, AI_PID);
      await drain();
    }
  }

  // ------------------------------------------------------------------ event playback
  async function drain() {
    busy = true;
    updateInteractivity();
    while (G.events.length) {
      const ev = G.events.shift();
      if (ev.bid) {
        const grp = [ev];
        while (G.events.length && G.events[0].bid === ev.bid) grp.push(G.events.shift());
        await playGroup(grp);
      } else await playGroup([ev]);
    }
    render(E.snapshot(G));
  }
  const PRE = new Set(['summon', 'draw', 'gain', 'return', 'steal', 'fakein', 'control', 'transform', 'field', 'turn', 'mana', 'countdown', 'fade', 'kw', 'buff', 'unstealth', 'silence', 'sanity', 'depth', 'armor', 'thaw', 'drift']);
  async function playGroup(grp) {
    const last = grp[grp.length - 1];
    const pre = grp.some((e) => PRE.has(e.type));
    if (pre) render(last.snap);
    try {
      await Promise.all(grp.map((e) => handle(e)));
    } catch (err) {
      console.error('anim error', err);
    }
    if (!pre) render(last.snap);
  }

  function factionOfUid(uid) {
    const el = minEls.get(uid);
    return el ? def(el.dataset.cid).faction : 'neutral';
  }
  function heroCenter(pid) {
    return center(heroEl(pid).getBoundingClientRect());
  }

  const H = {};
  async function handle(ev) {
    const f = H[ev.type];
    if (f) await f(ev);
  }

  H.turn = async (ev) => {
    const mine = ev.pid === ME;
    A.play(mine ? 'turn' : 'enemyTurn');
    banner(mine ? '你的回合' : L.HEROES[cfg.boss].short + '的回合', mine ? 'TURN ' + Math.ceil(ev.turn / 2) : '……');
    log(mine ? `—— 第 ${Math.ceil(ev.turn / 2)} 轮 · 你的回合 ——` : `—— ${L.HEROES[cfg.boss].short}的回合 ——`, mine ? 'p' : 'e');
    if (!mine && Math.random() < 0.28 && performance.now() - lastLineAt > 9000) {
      const boss = L.HEROES[cfg.boss];
      const deep = G.layer >= 1 && !saidFourth && ev.turn >= 8 && Math.random() < 0.5;
      if (deep) { saidFourth = true; say(boss.lines.fourth[0], 3000, true); }
      else say(pick(boss.lines.turn), 2600);
    }
    if (mine && G.layer === 2 && Math.random() < 0.35) glitchButton();
    await sleep(mine ? 700 : 600);
  };
  H.draw = async (ev) => {
    if (ev.pid === ME) {
      const el = handEls.get(ev.uid);
      A.play('draw');
      if (!el) return;
      const deck = $('deckP').getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const dx = deck.left - r.left, dy = deck.top - r.top - 40;
      el.animate([{ transform: `translate(${dx}px,${dy}px) scale(.4) rotate(20deg)`, opacity: 0.2 }, { transform: el.style.transform, opacity: 1 }], { duration: 420 * speed(), easing: 'cubic-bezier(.2,.8,.2,1)' });
      if (ev.breach) { FX.word(r.left + r.width / 2, r.top, '收容物回到手中', 'cold'); }
      await sleep(180);
    } else {
      const b = els.ehand.lastChild;
      if (b) b.animate([{ transform: 'translateY(-30px) scale(1.4)', opacity: 0 }, { opacity: 1 }], { duration: 300 * speed() });
      await sleep(120);
    }
  };
  H.gain = async (ev) => {
    const words = { copy: '复制', echo: '回响', bounce: '移回手牌', gen: '获得' };
    if (ev.pid === ME) {
      const el = handEls.get(ev.uid);
      if (el) {
        const r = el.getBoundingClientRect();
        el.animate([{ filter: 'brightness(2.2) saturate(0)', transform: el.style.transform + ' translateY(-30px)' }, { filter: 'none', transform: el.style.transform }], { duration: 600 * speed() });
        FX.burst(r.left + r.width / 2, r.top + 20, ev.how === 'echo' || ev.how === 'copy' ? 'dream' : 'neutral', 14, { grav: -60 });
        FX.word(r.left + r.width / 2, r.top - 10, words[ev.how] || '获得', 'dream');
      }
    } else {
      const r = els.ehand.getBoundingClientRect();
      FX.word(r.left + r.width / 2, r.bottom + 10, words[ev.how] || '获得', 'dream');
    }
    await sleep(250);
  };
  H.burn = async (ev) => {
    const host = $('domfx');
    const c = CV.card(ev.cid, {});
    c.style.position = 'absolute';
    c.style.setProperty('--cw', 'calc(var(--u) * 30)');
    const vw = window.innerWidth, vh = window.innerHeight;
    c.style.left = vw / 2 + 'px';
    c.style.top = (ev.pid === ME ? vh * 0.62 : vh * 0.24) + 'px';
    c.style.transform = 'translate(-50%,-50%)';
    host.appendChild(c);
    A.play('burn');
    await sleep(500);
    const r = c.getBoundingClientRect();
    FX.pixelize(r, 'red');
    c.remove();
    FX.word(vw / 2, r.top + r.height / 2, '手牌已满 · 焚毁', 'bad');
    log((ev.pid === ME ? '你' : '对手') + '的手牌已满，' + def(ev.cid).name + ' 被焚毁。');
    await sleep(300);
  };
  H.fatigue = async (ev) => {
    const c = heroCenter(ev.pid);
    FX.word(c.x, c.y - 50, '牌库已空 · 疲劳 ' + ev.n, 'bad');
    log((ev.pid === ME ? '你' : '对手') + '受到疲劳伤害 ' + ev.n + '。');
    await sleep(400);
  };
  H.play = async (ev) => {
    const d = def(ev.cid);
    const mine = ev.pid === ME;
    if (!ev.fake) L.Store.markSeen(ev.cid);
    log(`${mine ? '你' : L.HEROES[cfg.boss].short}打出了「${ev.fake && !mine ? d.name : d.name}」` + (ev.faded ? '（已褪色）' : '') + (ev.contained ? '（收容物）' : ''), mine ? 'p' : 'e');
    if (ev.san) log(`支付 ${ev.san} 点理智。`, 's');
    A.play('play', { faction: d.faction });
    const legend = d.rarity === 'legendary' && !ev.fake;
    if (mine) {
      const el = handEls.get(ev.uid);
      if (legend) { if (el) el.style.visibility = 'hidden'; await legendary(ev.cid, ev.pid); return; }
      if (el) {
        const from = el.getBoundingClientRect();
        let to;
        if (d.type === 'minion') {
          const br = els.boardP.getBoundingClientRect();
          to = { left: br.left + br.width / 2 - from.width * 0.3, top: br.top + br.height / 2 - from.height * 0.3, width: from.width * 0.6, height: from.height * 0.6 };
        } else if (d.type === 'field') to = els.field.getBoundingClientRect();
        else { const vw = window.innerWidth, vh = window.innerHeight; to = { left: vw / 2 - from.width * 0.6, top: vh * 0.42 - from.height * 0.6, width: from.width * 1.2, height: from.height * 1.2 }; }
        el.style.visibility = 'hidden';
        await FX.fly(el, from, to, { dur: 380, lift: 40, fadeOut: d.type !== 'spell' });
        if (d.type === 'spell') await sleep(120);
      }
    } else {
      if (legend) { await legendary(ev.cid, ev.pid); return; }
      // reveal what the gatekeeper is doing
      const host = $('domfx');
      const c = CV.card(ev.cid, ev.fake ? { fake: { v: ev.uid } } : {});
      c.style.position = 'absolute';
      c.style.setProperty('--cw', 'calc(var(--u) * 34)');
      const vw = window.innerWidth, vh = window.innerHeight;
      c.style.left = vw / 2 + 'px';
      c.style.top = vh * 0.36 + 'px';
      host.appendChild(c);
      const a = c.animate([{ transform: 'translate(-50%,-80%) rotateY(90deg) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) rotateY(0) scale(1)', opacity: 1 }], { duration: 300 * speed(), fill: 'forwards', easing: 'ease-out' });
      await a.finished;
      showSideCard(ev.cid);
      await sleep(d.type === 'minion' ? 750 : 900);
      const b = c.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: 'translate(-50%,-10%) scale(.4)', opacity: 0 }], { duration: 260 * speed(), fill: 'forwards' });
      await b.finished;
      c.remove();
      if ((d.san || 0) >= 3 && performance.now() - lastLineAt > 6000) say(pick(L.HEROES[cfg.boss].lines.big), 2200);
    }
  };
  async function legendary(cid, pid) {
    const d = def(cid);
    const ov = $('legend');
    const klass = { site: '静滞级', level: '游移级', dream: '失序级', neutral: '无界级' }[d.faction];
    ov.innerHTML = `<div class="typed"></div>`;
    ov.classList.add('on');
    A.duck(true);
    let skip = false;
    ov.onclick = () => (skip = true);
    const typed = ov.querySelector('.typed');
    const lines = `> 正在调阅收容档案 ${d.code} ……\n> 名称：${d.name}\n> 等级：${klass}\n> 状态：${pid === ME ? '已授权释放' : '收容失效'}\n> 记录：${d.lore.t.slice(0, 24)}……`;
    for (let i = 0; i < lines.length && !skip; i += 2) {
      typed.textContent = lines.slice(0, i + 2) + '▌';
      if (i % 6 === 0) A.play('type');
      await sleep(14);
    }
    typed.textContent = lines;
    const card = CV.card(cid, {}, { big: true });
    ov.appendChild(card);
    A.play('legendary');
    const flip = card.animate([{ transform: 'rotateY(180deg) scale(.3)', opacity: 0, filter: 'brightness(3)' }, { transform: 'rotateY(0) scale(1.08)', opacity: 1, filter: 'brightness(1.6)', offset: 0.7 }, { transform: 'rotateY(0) scale(1)', opacity: 1, filter: 'none' }], { duration: skip ? 1 : 700 * speed(), fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)' });
    await flip.finished;
    await sleep(skip ? 0 : 600);
    const r = card.getBoundingClientRect();
    const target = pid === ME ? els.boardP.getBoundingClientRect() : els.boardE.getBoundingClientRect();
    const slam = card.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: `translate(${center(target).x - center(r).x}px, ${center(target).y - center(r).y}px) scale(.25)`, opacity: 0.9 }], { duration: 260 * speed(), fill: 'forwards', easing: 'cubic-bezier(.6,0,.9,.4)' });
    await slam.finished;
    ov.classList.remove('on');
    ov.innerHTML = '';
    A.duck(false);
    const c = center(target);
    FX.ring(c.x, c.y, '#f3cf6a', 260, 0.8, 10);
    FX.ring(c.x, c.y, '#ffffff', 180, 0.5, 6);
    FX.burst(c.x, c.y, 'gold', 60, { speed: 1.6 });
    FX.shake(18);
    A.vibrate([30, 40, 60]);
    if (pid !== ME && performance.now() - lastLineAt > 4000) say(pick(L.HEROES[cfg.boss].lines.big), 2200);
  }
  H.summon = async (ev) => {
    const el = minEls.get(ev.uid);
    if (!el) return;
    const d = def(ev.cid);
    const r = el.getBoundingClientRect();
    const c = center(r);
    if (ev.how === 'breach') {
      el.animate([{ transform: 'scale(1.6)', filter: 'brightness(3) hue-rotate(-40deg)', opacity: 0 }, { transform: 'scale(1)', filter: 'none', opacity: 1 }], { duration: 520 * speed(), easing: 'cubic-bezier(.2,.8,.2,1)' });
      FX.pixelize(r, 'red');
      FX.ring(c.x, c.y, '#ff3b4e', 140, 0.6, 8);
      await sleep(400);
      return;
    }
    el.animate([{ transform: 'translateY(-26px) scale(1.25)', opacity: 0 }, { transform: 'translateY(4px) scale(.96)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 380 * speed(), easing: 'cubic-bezier(.3,.7,.3,1)' });
    await sleep(240);
    FX.ring(c.x, c.y + r.height * 0.2, FX.COLORS[d.faction][0], 110, 0.5, 7);
    FX.burst(c.x, c.y + r.height * 0.25, d.faction, 22, { dir: -Math.PI / 2, spread: 1.4, speed: 0.8 });
    if (ev.how === 'tamed') { FX.lattice(r, '#9ff3ff'); FX.word(c.x, r.top - 6, '收容物 · 为你作战', 'cold'); }
    const sm = E.char(G, ev.uid);
    if (d.faction === 'level' && sm && sm.kw && sm.kw.stealth) FX.eyes(r, 4);
    if (d.faction === 'dream') FX.halo(c.x, c.y, r.width * 1.2);
    if (ev.how === 'exit') FX.burst(c.x, c.y, 'heal', 16);
    FX.shake(3);
    await sleep(140);
  };
  H.battlecry = async (ev) => {
    const el = minEls.get(ev.uid);
    if (el) el.animate([{ filter: 'brightness(1.8)' }, { filter: 'none' }], { duration: 400 * speed() });
    if (ev.target != null) {
      const a = rectOf(ev.uid), b = rectOf(ev.target);
      if (a && b) { const s = center(a), t = center(b); await FX.projectile(s.x, s.y, t.x, t.y, factionOfUid(ev.uid)); }
    }
  };
  H.spell = async (ev) => {
    const d = def(ev.cid);
    A.play('spell_' + d.faction);
    const from = heroCenter(ev.pid);
    if (ev.target != null) {
      const r = rectOf(ev.target);
      if (r) { const t = center(r); await FX.projectile(from.x, from.y, t.x, t.y, d.faction, 0.45); FX.burst(t.x, t.y, d.faction, 26); }
    } else {
      const vw = window.innerWidth, vh = window.innerHeight;
      FX.ring(vw / 2, vh * 0.46, FX.COLORS[d.faction][0], Math.max(vw, vh) * 0.5, 0.7, 10);
      FX.burst(vw / 2, vh * 0.46, d.faction, 34, { speed: 1.4 });
      await sleep(260);
    }
  };
  H.heroPower = async (ev) => {
    const btn = ev.pid === ME ? els.hpP : els.hpE;
    const h = L.HEROES[ev.hero];
    log(`${ev.pid === ME ? '你' : L.HEROES[cfg.boss].short}使用了英雄技能「${h.power.name}」。`, ev.pid === ME ? 'p' : 'e');
    btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)', filter: 'brightness(1.8)' }, { transform: 'scale(1)' }], { duration: 360 * speed() });
    A.play('click');
    const c = center(btn.getBoundingClientRect());
    FX.word(c.x, c.y - 40, h.power.name, 'dream');
    const style = { agent_shen: 'site', agent_tang: 'level', agent_man: 'dream', boss_manager: 'site', boss_lifeguard: 'ice', boss_broadcast: 'neon' }[ev.hero] || 'neutral';
    let tgt = ev.target;
    if (ev.hero === 'boss_broadcast') tgt = G.players[ME].uid;
    if (tgt != null) {
      const r = rectOf(tgt);
      if (r) { const t = center(r); await FX.projectile(c.x, c.y, t.x, t.y, style === 'ice' ? 'heal' : style, 0.4); }
    } else { FX.burst(c.x, c.y, style, 20); await sleep(200); }
  };
  H.attack = async (ev) => {
    const a = elOf(ev.from), t = elOf(ev.to);
    if (!a || !t) return;
    const ra = a.getBoundingClientRect(), rt = t.getBoundingClientRect();
    const dx = (center(rt).x - center(ra).x) * 0.78, dy = (center(rt).y - center(ra).y) * 0.78;
    A.play('whoosh');
    a.style.zIndex = 20;
    const fwd = a.animate([{ transform: 'none' }, { transform: `translate(${-dx * 0.08}px,${-dy * 0.08}px) scale(1.08)`, offset: 0.35 }, { transform: `translate(${dx}px,${dy}px) scale(1.12)` }], { duration: 300 * speed(), easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' });
    await fwd.finished;
    const imp = center(rt);
    FX.burst(imp.x, imp.y, 'hit', 26, { speed: 1.2 });
    FX.ring(imp.x, imp.y, '#ffffff', 70, 0.3, 5);
    const back = a.animate([{ transform: `translate(${dx}px,${dy}px) scale(1.12)` }, { transform: 'none' }], { duration: 260 * speed(), easing: 'cubic-bezier(.2,.8,.2,1)' });
    fwd.cancel();
    back.onfinish = () => (a.style.zIndex = '');
    const an = E.char(G, ev.from), tn = E.char(G, ev.to);
    log(`${an ? def(an.cid).name : '随从'} 攻击了 ${tn ? (tn.isHero ? (tn.pid === ME ? '你' : L.HEROES[cfg.boss].short) : def(tn.cid).name) : '目标'}。`);
  };
  H.ambush = async (ev) => {
    const r = rectOf(ev.uid);
    if (r) { FX.word(center(r).x, r.top - 4, '暗袭', 'bad'); FX.eyes(r, 6); }
  };
  H.damage = async (ev) => {
    const el = elOf(ev.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const c = center(r);
    FX.number(c.x, c.y, '-' + ev.amount, 'dmg', ev.amount >= 6 ? 11 : null);
    el.animate([{ filter: 'brightness(2.5) saturate(0)' }, { filter: 'none' }], { duration: 260 * speed() });
    if (ev.hero) {
      A.play('heroHit', { n: ev.amount });
      FX.shake(4 + ev.amount * 1.6);
      FX.burst(c.x, c.y, 'red', 10 + ev.amount * 3);
      if (ev.pid === ME) { pulseVignette(ev.amount); A.vibrate(Math.min(120, 20 + ev.amount * 12)); }
      else if (ev.amount >= 3 && performance.now() - lastLineAt > 7000 && Math.random() < 0.6) say(pick(L.HEROES[cfg.boss].lines.hurt), 1800);
      const special = { fatigue: '疲劳', collapse: '理智崩溃', closing: '闭店时间' }[ev.kind];
      if (special) FX.word(c.x, r.top - 10, special, 'bad');
    } else {
      A.play('hit', { n: ev.amount });
      FX.shake(1.5 + ev.amount * 1.1);
      if (ev.poison) FX.word(c.x, r.top - 4, '剧毒', 'bad');
    }
    await sleep(220);
  };
  H.shield = async (ev) => {
    const r = rectOf(ev.uid);
    if (!r) return;
    const c = center(r);
    A.play('shield');
    FX.ring(c.x, c.y, '#ffe7a0', 80, 0.5, 8);
    FX.burst(c.x, c.y, 'gold', 24);
    FX.word(c.x, r.top - 4, '圣盾破碎', '');
    await sleep(200);
  };
  H.heal = async (ev) => {
    const r = rectOf(ev.target);
    if (!r) return;
    const c = center(r);
    A.play('heal');
    FX.number(c.x, c.y, '+' + ev.amount, 'heal');
    FX.motes(r, 'heal', 14);
    if (ev.doubled) FX.word(c.x, r.top - 8, '泳池 · 治疗×2', 'cold');
    await sleep(200);
  };
  H.armor = async (ev) => {
    const c = heroCenter(ev.pid);
    A.play('armor');
    FX.number(c.x + 30, c.y - 30, '+' + ev.amount, 'armor');
    FX.ring(c.x, c.y, '#c9d2d6', 90, 0.4, 6);
  };
  H.freeze = async (ev) => {
    const r = rectOf(ev.uid);
    if (!r) return;
    A.play('freeze');
    FX.snow(r, 26);
    FX.ring(center(r).x, center(r).y, '#9ff3ff', 70, 0.45, 6);
    await sleep(120);
  };
  H.buff = async (ev) => {
    const r = rectOf(ev.uid);
    if (!r) return;
    const c = center(r);
    const txt = (ev.atk ? (ev.atk > 0 ? '+' : '') + ev.atk : '+0') + '/' + (ev.hp ? (ev.hp > 0 ? '+' : '') + ev.hp : '+0');
    FX.word(c.x, r.top - 4, txt, 'dream');
    FX.motes(r, 'gold', 10);
  };
  H.kw = async (ev) => {
    const r = rectOf(ev.uid);
    if (!r) return;
    const names = { stealth: '潜行', divine: '圣盾', taunt: '嘲讽', poison: '剧毒', charge: '冲锋', rush: '突袭', windfury: '风怒' };
    FX.word(center(r).x, r.top - 4, names[ev.kw] || ev.kw, ev.kw === 'stealth' ? '' : 'dream');
    if (ev.kw === 'divine') A.play('shield');
  };
  H.death = async (ev) => {
    const el = minEls.get(ev.uid);
    const d = def(ev.cid);
    log(`${d.name} 被消灭了。`);
    if (!el) return;
    dying.add(ev.uid);
    const r = el.getBoundingClientRect();
    ev._rect = r;
    A.play('death_' + d.faction);
    let anim;
    if (d.faction === 'site') {
      FX.chains(r);
      FX.lattice(r, '#ff3b4e');
      anim = el.animate([{ transform: 'none', filter: 'none' }, { transform: 'translateY(6px) scale(.95)', filter: 'brightness(1.5) hue-rotate(160deg)', offset: 0.4 }, { transform: 'translateY(60px) scale(.6)', opacity: 0, filter: 'brightness(.3)' }], { duration: 760 * speed(), easing: 'cubic-bezier(.6,0,.8,.4)', fill: 'forwards' });
    } else if (d.faction === 'level') {
      FX.pixelize(r, 'level');
      anim = el.animate([{ opacity: 1, clipPath: 'inset(0 0 0 0)' }, { opacity: 1, clipPath: 'inset(30% 0 20% 0)', transform: 'translateX(4px)', offset: 0.3 }, { opacity: 0, clipPath: 'inset(48% 0 48% 0)', transform: 'translateX(-6px) scaleX(1.3)' }], { duration: 420 * speed(), fill: 'forwards', easing: 'steps(6)' });
    } else if (d.faction === 'dream') {
      FX.paperize(r);
      anim = el.animate([{ opacity: 1, filter: 'none' }, { opacity: 0, filter: 'saturate(0) brightness(1.6) blur(3px)', transform: 'translateY(-24px) rotate(-6deg) scale(1.08)' }], { duration: 900 * speed(), fill: 'forwards', easing: 'ease-out' });
    } else {
      FX.dust(r, 18);
      anim = el.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.8) translateY(10px)' }], { duration: 480 * speed(), fill: 'forwards' });
    }
    await anim.finished;
    el.remove();
    dying.delete(ev.uid);
    if (minEls.get(ev.uid) === el) minEls.delete(ev.uid);
  };
  H.deathrattle = async (ev) => {
    const box = ev.owner === ME ? els.boardP : els.boardE;
    const r = box.getBoundingClientRect();
    FX.word(r.left + r.width / 2, r.top + r.height * 0.3, '亡语 · ' + def(ev.cid).name, 'dream');
    await sleep(200);
  };
  H.contain = async (ev) => {
    const el = minEls.get(ev.uid);
    log(`${def(ev.cid).name} 被收容，洗入${ev.by === ME ? '你' : '对手'}的牌库（突破倒计时 3）。`, 's');
    if (!el) return;
    dying.add(ev.uid);
    const r = el.getBoundingClientRect();
    A.play('contain');
    FX.chains(r, '#9ff3ff');
    await FX.lattice(r, '#9ff3ff');
    const deck = (ev.by === ME ? $('deckP') : $('deckE')).getBoundingClientRect();
    FX.word(center(r).x, r.top - 4, '收容', 'cold');
    const a = el.animate([{ transform: 'none', filter: 'none' }, { transform: 'scale(.7,.95)', filter: 'brightness(2) hue-rotate(160deg) saturate(.3)', offset: 0.35 }, { transform: `translate(${deck.left - r.left}px,${deck.top - r.top}px) scale(.2)`, opacity: 0.2, filter: 'brightness(2) hue-rotate(160deg) saturate(0)' }], { duration: 650 * speed(), fill: 'forwards', easing: 'cubic-bezier(.5,0,.6,1)' });
    await a.finished;
    el.remove();
    dying.delete(ev.uid);
    if (minEls.get(ev.uid) === el) minEls.delete(ev.uid);
    FX.ring(center(deck).x, center(deck).y, '#9ff3ff', 60, 0.4, 5);
  };
  H.countdown = async (ev) => {
    if (ev.pid !== ME) return;
    const el = handEls.get(ev.uid);
    const r = el ? el.getBoundingClientRect() : $('deckP').getBoundingClientRect();
    FX.word(center(r).x, r.top - 6, `${def(ev.cid).name} · 突破倒计时 ${ev.turns}`, ev.turns <= 1 ? 'bad' : 'cold');
    await sleep(150);
  };
  H.alarm = async (ev) => {
    A.play('alarm');
    FX.alarm();
    FX.shake(10);
    const vw = window.innerWidth, vh = window.innerHeight;
    FX.word(vw / 2, vh * 0.45, '收容失效 · ' + def(ev.cid).name + ' 突破！', 'bad');
    log(`${def(ev.cid).name} 突破了收容，回到了${ev.to === ME ? '你' : '对手'}的场上。`, 'e');
    await sleep(700);
  };
  H.breachfail = async (ev) => {
    const vw = window.innerWidth, vh = window.innerHeight;
    FX.word(vw / 2, vh * 0.45, def(ev.cid).name + ' 在突破中消散', 'cold');
    await sleep(300);
  };
  H.limbo = async (ev) => {
    const el = minEls.get(ev.uid);
    log(`${def(ev.cid).name} 坠入了夹层。`);
    if (!el) return;
    dying.add(ev.uid);
    const r = el.getBoundingClientRect();
    A.play('limbo');
    FX.word(center(r).x, r.top - 4, '坠入夹层', '');
    FX.burst(center(r).x, r.bottom, 'dark', 20, { grav: 300 });
    const a = el.animate([{ transform: 'none', opacity: 1, filter: 'none' }, { transform: 'translateY(40px) scale(.3,.1)', opacity: 0, filter: 'brightness(0)' }], { duration: 520 * speed(), fill: 'forwards', easing: 'cubic-bezier(.6,0,.9,.3)' });
    await a.finished;
    el.remove();
    dying.delete(ev.uid);
    if (minEls.get(ev.uid) === el) minEls.delete(ev.uid);
  };
  H.return = async (ev) => {
    const el = minEls.get(ev.uid);
    log(`${def(ev.cid).name} 从夹层中回来了。`);
    if (!el) return;
    el.animate([{ transform: 'translateY(40px) scale(.3,.1)', opacity: 0, filter: 'brightness(0)' }, { transform: 'none', opacity: 1, filter: 'none' }], { duration: 500 * speed(), easing: 'cubic-bezier(.2,.8,.2,1)' });
    await sleep(300);
  };
  H.bounce = async (ev) => {
    const el = minEls.get(ev.uid);
    log(`${def(ev.cid).name} 被移回手牌。`);
    if (!el) return;
    dying.add(ev.uid);
    const target = (ev.owner === ME ? els.hand : els.ehand).getBoundingClientRect();
    const r = el.getBoundingClientRect();
    FX.burst(center(r).x, center(r).y, 'level', 18);
    const a = el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${center(target).x - center(r).x}px,${center(target).y - center(r).y}px) scale(.4)`, opacity: 0 }], { duration: 480 * speed(), fill: 'forwards', easing: 'cubic-bezier(.5,0,.5,1)' });
    await a.finished;
    el.remove();
    dying.delete(ev.uid);
    if (minEls.get(ev.uid) === el) minEls.delete(ev.uid);
  };
  H.control = async (ev) => {
    const r = rectOf(ev.uid);
    log(`${ev.to === ME ? '你' : '对手'}夺取了一个随从的控制权。`, 'e');
    if (r) { FX.word(center(r).x, r.top - 4, '控制权转移', 'dream'); FX.motes(r, 'dream', 16); }
    await sleep(350);
  };
  H.transform = async (ev) => {
    const r = rectOf(ev.uid);
    if (r) { FX.burst(center(r).x, center(r).y, 'dream', 30); FX.word(center(r).x, r.top - 4, '镜像', 'dream'); }
    await sleep(250);
  };
  H.steal = async (ev) => {
    const mine = ev.to === ME;
    const from = (mine ? els.ehand : els.hand).getBoundingClientRect();
    const to = (mine ? els.hand : els.ehand).getBoundingClientRect();
    const back = CV.back();
    back.style.position = 'absolute';
    back.style.setProperty('--cw', 'calc(var(--u) * 14)');
    $('domfx').appendChild(back);
    const a = back.animate([{ transform: `translate(${center(from).x}px,${center(from).y}px) translate(-50%,-50%)` }, { transform: `translate(${(center(from).x + center(to).x) / 2 + 60}px,${window.innerHeight * 0.45}px) translate(-50%,-50%) rotate(180deg) scale(1.3)` }, { transform: `translate(${center(to).x}px,${center(to).y}px) translate(-50%,-50%) rotate(360deg)` }], { duration: 650 * speed(), easing: 'ease-in-out', fill: 'forwards' });
    await a.finished;
    back.remove();
    FX.word(center(to).x, to.top - 10, mine ? '偷来的' : '被偷走了', 'dream');
    log(mine ? `你偷走了「${def(ev.cid).name}」。` : '对手偷走了你的一张牌。', mine ? 'p' : 'e');
  };
  H.field = async (ev) => {
    const r = els.field.getBoundingClientRect();
    const c = center(r);
    log(`场地变为「${def(ev.cid).name}」` + (ev.replaced ? `，取代了「${def(ev.replaced).name}」。` : '。'), 's');
    if (ev.replaced) FX.pixelize(r, 'level');
    FX.ring(c.x, c.y, '#f2d64b', Math.max(window.innerWidth, window.innerHeight) * 0.7, 0.9, 14);
    FX.burst(c.x, c.y, 'level', 30);
    els.field.animate([{ transform: 'scale(1.6)', filter: 'brightness(2.2)' }, { transform: 'none', filter: 'none' }], { duration: 500 * speed() });
    FX.shake(5);
    await sleep(350);
  };
  H.depth = async (ev) => {
    if (ev.why === 'drift') return;
    const r = els.trackMk.getBoundingClientRect();
    FX.ring(center(r).x, center(r).y, '#b98bff', 50, 0.5, 4);
    FX.word(center(r).x, r.top - 12, '梦深 +' + ev.delta, ev.why === 'sanity' ? 'dream' : '');
    A.play('depth');
  };
  H.layer = async (ev) => {
    log(`梦境下沉：第 ${ev.to} 层「${L.LAYERS[ev.to].name}」。${L.LAYERS[ev.to].rule}`, 's');
    await L.Layers.transition(ev.from, ev.to);
    render(ev.snap);
    const boss = L.HEROES[cfg.boss];
    if (boss.layer === ev.to) say(pick(boss.lines.big), 2400);
  };
  H.sanity = async (ev) => {
    if (ev.delta < 0) {
      A.play('sanity');
      const c = heroCenter(ev.pid);
      FX.word(c.x + 40, c.y, '理智 ' + ev.delta, 'dream');
      if (ev.pid === ME) FX.flash('#6a3fc0', 0.18, 0.4);
    }
    updateSanityFx();
  };
  H.collapse = async (ev) => {
    A.play('collapse');
    const c = heroCenter(ev.pid);
    FX.word(c.x, c.y - 60, '理智归零', 'bad');
    if (ev.pid === ME) FX.flash('#2a0050', 0.5, 0.8);
    log((ev.pid === ME ? '你' : '对手') + '的理智归零，受到 2 点伤害。', 's');
    await sleep(500);
  };
  H.shaken = async (ev) => {
    const c = heroCenter(ev.pid);
    if (ev.on) {
      FX.word(c.x, c.y - 60, '动摇', 'bad');
      log((ev.pid === ME ? '你' : '对手') + '进入动摇状态。手里好像多了点什么。', 's');
      if (ev.pid === ME) A.play('whisper');
    } else {
      FX.word(c.x, c.y - 60, '回过神来', 'cold');
      if (ev.pid === ME && ev.removed && ev.removed.length) log('回过神来——那几张牌从来不存在。', 's');
    }
    updateSanityFx();
    await sleep(300);
  };
  H.fakein = async (ev) => {
    if (ev.pid !== ME) return;
    const el = handEls.get(ev.uid);
    if (el) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1200 * speed() });
  };
  H.fakeplay = async (ev) => {
    const mine = ev.pid === ME;
    A.play('fake');
    const vw = window.innerWidth, vh = window.innerHeight;
    FX.word(vw / 2, vh * 0.42, mine ? '……这张牌从来不存在。' : L.HEROES[cfg.boss].short + '打出了一张不存在的牌。', 'dream');
    log(mine ? '你打出了一张不存在的牌。什么也没有发生。' : '守门人打出了一张不存在的牌。它愣住了。', 's');
    FX.paperize({ left: vw / 2 - 60, top: vh * 0.36, width: 120, height: 160 });
    await sleep(900);
  };
  H.fade = async (ev) => {
    if (ev.pid !== ME) return;
    const el = handEls.get(ev.uid);
    if (!el) return;
    A.play('fade');
    const r = el.getBoundingClientRect();
    FX.word(center(r).x, r.top - 6, ev.level >= 3 ? '已褪色 · 费用 -1' : '褪色 ' + ev.level, 'dream');
  };
  H.fadefx = async (ev) => {
    const r = rectOf(ev.uid) || els.boardP.getBoundingClientRect();
    FX.word(center(r).x, r.top - 10, '褪色 · ' + ev.name, 'dream');
    log(`褪色的效果：${ev.name}——${ev.text}`, 's');
    FX.paperize(r);
    await sleep(500);
  };
  H.drift = async (ev) => {
    const r = rectOf(ev.uid);
    if (r) { FX.ring(center(r).x, r.bottom, '#e8ffff', 60, 0.6, 3); FX.word(center(r).x, r.top - 4, '漂移', 'cold'); }
    await sleep(220);
  };
  H.sweep = async (ev) => {
    const r = rectOf(ev.uid);
    A.play('sweep');
    if (r) await FX.spotlight(r);
    log('商场清场：最虚弱的那个被带走了。', 's');
  };
  H.closing = async (ev) => {
    A.play('chime');
    const c = heroCenter(ev.pid);
    FX.word(c.x, c.y - 70, '闭店时间 · ' + ev.n, 'bad');
    log(`闭店时间：${ev.pid === ME ? '你' : '对手'}受到 ${ev.n} 点伤害。`, 's');
    await sleep(500);
  };
  H.over = async () => {
    await sleep(500);
  };

  // ------------------------------------------------------------------ fx helpers
  function pulseVignette(n) {
    const v = els.vign;
    v.animate([{ opacity: Math.min(0.9, 0.3 + n * 0.08) }, { opacity: 0 }], { duration: 700 });
    updateLowHp();
  }
  function updateLowHp() {
    const low = G && G.players[ME].hp <= 10 && !G.over;
    els.vign.classList.toggle('low', low && !FX.isCalm());
    A.heartbeat(low && !G.over);
  }
  function updateSanityFx() {
    const p = G.players[ME];
    els.sanv.classList.toggle('on', p.sanity <= 3);
  }
  function banner(t, s) {
    const b = document.createElement('div');
    b.className = 'banner';
    b.innerHTML = `<div class="bt">${t}</div><div class="bs">${s}</div>`;
    $('domfx').appendChild(b);
    b.animate([{ opacity: 0, transform: 'scaleY(.2)' }, { opacity: 1, transform: 'none', offset: 0.15 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 1100 * speed() }).onfinish = () => b.remove();
  }
  function say(line, ms, glitch) {
    lastLineAt = performance.now();
    document.querySelectorAll('.speech').forEach((s) => s.remove());
    const r = els.heroE.getBoundingClientRect();
    const s = document.createElement('div');
    s.className = 'speech' + (glitch ? ' glitch' : '');
    s.textContent = line;
    s.style.left = Math.max(8, r.left) + 'px';
    s.style.top = r.bottom + 14 + 'px';
    $('domfx').appendChild(s);
    log(`${L.HEROES[cfg.boss].short}：「${line}」`, 'e');
    s.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none', offset: 0.1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: ms * Math.max(0.7, speed()) }).onfinish = () => s.remove();
    if (glitch) A.play('whisper');
  }
  UI.say = say;
  function glitchButton() {
    const et = els.endTurn;
    const words = ['醒来', '别结束', '再待一会', '你在吗'];
    setTimeout(() => {
      if (!UI.isMyTurn()) return;
      const old = et.textContent;
      et.textContent = pick(words);
      setTimeout(() => { if (et.textContent !== '对手回合') et.textContent = old; }, 160);
    }, 1800 + Math.random() * 4000);
  }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  function log(t, cls) {
    logLines.push({ t, cls });
    if (logLines.length > 200) logLines.shift();
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = t;
    els.log.appendChild(d);
    while (els.log.children.length > 80) els.log.firstChild.remove();
    els.log.scrollTop = els.log.scrollHeight;
  }
  UI.logLines = () => logLines;

  // ------------------------------------------------------------------ previews & inspect
  function showPreview(uid) {
    hidePreview();
    const ci = snap.p[ME].hand.find((c) => c.uid === uid);
    if (!ci) return;
    const el = handEls.get(uid);
    const r = el.getBoundingClientRect();
    const p = CV.card(ci.cid, ci, { big: true });
    p.style.position = 'absolute';
    p.style.setProperty('--cw', 'calc(var(--u) * 46)');
    p.style.pointerEvents = 'none';
    $('domfx').appendChild(p);
    const pr = p.getBoundingClientRect();
    const vw = window.innerWidth;
    let x = r.left + r.width / 2 - pr.width / 2;
    x = Math.max(8, Math.min(vw - pr.width - 8, x));
    p.style.left = x + 'px';
    p.style.top = Math.max(8, r.top - pr.height - 10) + 'px';
    preview = p;
    showSidePreview(uid);
  }
  function hidePreview() {
    if (preview) preview.remove();
    preview = null;
  }
  function showSidePreview(uid) {
    if (uid == null || !snap) return;
    const ci = snap.p[ME].hand.find((c) => c.uid === uid);
    if (ci) showSideCard(ci.cid, ci);
  }
  function showSideCard(cid, inst) {
    const side = els.sideR;
    if (!side || getComputedStyle(side).display === 'none') return;
    side.innerHTML = '';
    side.appendChild(CV.card(cid, inst || {}, { big: true }));
    const d = def(cid);
    if (d.lore && !(inst && inst.fake)) {
      const l = document.createElement('div');
      l.className = 'lore k-' + d.lore.k;
      l.innerHTML = `<span class="lk">${d.lore.k === '档' ? '档案' : d.lore.k === '记' ? '日记' : '无线电'}</span>${CV.esc(d.lore.t)}`;
      side.appendChild(l);
    }
  }
  UI.inspectHand = function (uid) {
    const ci = snap && snap.p[ME].hand.find((c) => c.uid === uid);
    if (ci) UI.inspect(ci.cid, ci);
  };
  function inspectMinion(uid) {
    const m = snap && snap.p.flatMap((p) => p.board).find((x) => x.uid === uid);
    if (!m) return;
    UI.inspect(m.cid, null, m);
  }
  function inspectHeroPower(pid) {
    if (!G) return;
    const h = L.HEROES[G.players[pid].hero];
    const ov = $('inspect');
    ov.innerHTML = `<div class="ttl" style="font-size:calc(var(--u)*6)">${CV.esc(h.name)}</div><div class="sub">${CV.esc(h.title || '')}</div>` +
      `<div class="meta"><div class="kwl"><div><b>英雄技能 · ${CV.esc(h.power.name)}（${h.power.cost} 法力）</b>${CV.esc(h.power.text)}</div></div>` +
      (h.kind === 'boss' ? `<div class="lore k-档"><span class="lk">档案</span>${CV.esc(h.intro)}</div>` : `<div class="lore k-记"><span class="lk">档案</span>${CV.esc(h.bio)}</div>`) +
      `</div><div class="hintline">轻触任意处关闭</div>`;
    ov.classList.add('on');
    ov.onclick = () => ov.classList.remove('on');
  }
  UI.inspect = function (cid, inst, m) {
    const ov = $('inspect');
    ov.innerHTML = '';
    const d = def(cid);
    const card = CV.card(cid, inst || {}, { big: true });
    if (m) {
      card.querySelector('.st.atk b').textContent = m.atk;
      card.querySelector('.st.hp b').textContent = m.hp;
    }
    ov.appendChild(card);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const kws = CV.keywordsOf(cid);
    let h = '';
    if (m) {
      const st = [];
      if (m.frozen) st.push('<div><b>冻结</b>这个随从会失去下一次攻击。</div>');
      if (m.kw.stealth) st.push('<div><b>潜行</b>在攻击之前无法被选为目标。</div>');
      if (m.breached) st.push('<div><b>突破者</b>它曾被收容，然后逃了出来。</div>');
      if (m.silenced) st.push('<div><b>褪色</b>它的文字已经无法辨认。</div>');
      h += st.join('');
    }
    if (inst && inst.breach) h += `<div><b>收容物</b>突破倒计时 ${inst.breach}。在倒计时归零前打出它，它就为你作战；否则它将在敌方场上突破。</div>`;
    if (inst && (inst.fz || inst.echo || d.fade)) h += `<div><b>褪色 ${inst.fade || 0}/3</b>${inst.fade >= 3 ? '效果已经随机化，费用 -1。' : '在手里每多留一回合，就有一个词变得模糊。'}</div>`;
    h += kws.map((k) => `<div><b>${CV.sym(k.name)}</b>${CV.esc(k.desc)}</div>`).join('');
    meta.innerHTML = `<div class="kwl">${h}</div>`;
    if (inst && inst.fake) {
      meta.innerHTML += `<div class="lore k-讯"><span class="lk">？？？</span>${CV.esc(CV.whisper(inst.fake.v || 0))}</div>`;
    } else if (d.lore) {
      const kname = d.lore.k === '档' ? '档案' : d.lore.k === '记' ? '日记' : '无线电';
      meta.innerHTML += `<div class="lore k-${d.lore.k}"><span class="lk">${kname} · ${d.code}</span>${CV.esc(d.lore.t)}</div>`;
      L.Store.markSeen(cid);
    }
    meta.innerHTML += `<div class="hintline">轻触任意处关闭</div>`;
    ov.appendChild(meta);
    ov.classList.add('on');
    ov.onclick = () => ov.classList.remove('on');
  };

  // ------------------------------------------------------------------ end of match
  function finish() {
    clearTimeout(idleTimer);
    clearTimeout(hintTimer);
    if (cfg.onFinish) {
      A.heartbeat(false);
      els.vign.classList.remove('low');
      els.sanv.classList.remove('on');
      return cfg.onFinish(G.winner === ME, G);
    }
    A.heartbeat(false);
    els.vign.classList.remove('low');
    els.sanv.classList.remove('on');
    const boss = L.HEROES[cfg.boss];
    const win = G.winner === ME;
    const draw = G.winner === -1;
    if (win) {
      const newBeat = !L.Store.progress.beaten.includes(boss.bossKey);
      L.Store.beat(boss.bossKey);
      L.Store.progress.wins++;
      L.Store.saveProgress();
      A.play('win');
      say(boss.lines.defeat[0], 3000);
      setTimeout(() => L.Menus.endScreen({ win, draw, boss, G, newBeat }), 2200 * speed());
    } else {
      L.Store.progress.losses++;
      L.Store.saveProgress();
      A.play('lose');
      say(boss.lines.victory[0], 2600);
      setTimeout(() => L.Menus.endScreen({ win, draw, boss, G }), 2000 * speed());
    }
  }
  UI.concede = function () {
    if (!G || G.over) return;
    E.concede(G, ME);
    drain().then(afterAction);
  };
  UI.leave = function () {
    clearTimeout(idleTimer);
    clearTimeout(hintTimer);
    if (L.Tutorial) L.Tutorial.stop();
    A.heartbeat(false);
    els.vign.classList.remove('low');
    els.sanv.classList.remove('on');
    els.sideL.classList.remove('on');
    els.sideR.classList.remove('on');
    G = null;
  };
  UI.relayout = function () {
    if (snap) layoutHand();
  };
  UI._forceRender = function () {
    if (G) render(E.snapshot(G));
  };

  // test / debug hooks
  UI.debug = {
    get G() { return G; },
    act: doAction,
    endTurn: endMyTurn,
    autoplay: async function (n) {
      // let the AI play the human seat (used by the browser smoke test)
      for (let k = 0; k < (n || 400) && G && !G.over; k++) {
        while (busy) await new Promise((r) => setTimeout(r, 50));
        if (!G || G.over) break;
        if (G.active !== ME) { await new Promise((r) => setTimeout(r, 50)); continue; }
        const a = L.AI.decide(G, ME, 'balanced', UI._autoMemo || (UI._autoMemo = {}));
        if (a.t === 'end') await endMyTurn();
        else await doAction(a);
      }
    },
    skip: (v) => (skipAnim = v),
  };
})();
