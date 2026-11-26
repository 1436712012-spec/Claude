/* LIMINAL · 外勤训练: a scripted, coached first match + in-match hints */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const E = L.E;
  const T = (L.Tutorial = {});
  const $ = (id) => document.getElementById(id);
  const ME = 0, FOE = 1;

  // ------------------------------------------------------------------ coach overlay
  let coach = null, spot = null, bub = null, finger = null, raf = 0;
  let cur = null; // { target, pointer:[from,to], dim, text, button }
  function ensure() {
    if (coach) return;
    coach = document.createElement('div');
    coach.id = 'coach';
    coach.innerHTML = `<div class="spot"></div><div class="finger"></div><div class="cbub"><p></p><button class="btn">继续</button></div>`;
    document.getElementById('app').appendChild(coach);
    spot = coach.querySelector('.spot');
    bub = coach.querySelector('.cbub');
    finger = coach.querySelector('.finger');
  }
  const elOf = (t) => (typeof t === 'function' ? t() : t ? document.querySelector(t) : null);
  function place() {
    if (!cur) return;
    const el = elOf(cur.target);
    const vw = window.innerWidth, vh = window.innerHeight;
    if (el) {
      const r = el.getBoundingClientRect();
      const pad = cur.pad == null ? 8 : cur.pad;
      spot.style.display = 'block';
      spot.style.left = r.left - pad + 'px';
      spot.style.top = r.top - pad + 'px';
      spot.style.width = r.width + pad * 2 + 'px';
      spot.style.height = r.height + pad * 2 + 'px';
      // bubble above when the target sits low, else below
      const bh = bub.offsetHeight, bw = bub.offsetWidth;
      let top = r.top + r.height / 2 > vh * 0.5 ? r.top - pad - bh - 16 : r.bottom + pad + 16;
      top = Math.max(10, Math.min(vh - bh - 10, top));
      let left = r.left + r.width / 2 - bw / 2;
      left = Math.max(10, Math.min(vw - bw - 10, left));
      bub.style.left = left + 'px';
      bub.style.top = top + 'px';
    } else {
      spot.style.display = 'none';
      bub.style.left = Math.max(10, vw / 2 - bub.offsetWidth / 2) + 'px';
      bub.style.top = vh * 0.4 + 'px';
    }
    if (cur.pointer) {
      const a = elOf(cur.pointer[0]), b = elOf(cur.pointer[1]);
      if (a && b) {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        finger.style.display = 'block';
        finger.style.setProperty('--fx', ra.left + ra.width / 2 + 'px');
        finger.style.setProperty('--fy', ra.top + ra.height / 2 + 'px');
        finger.style.setProperty('--tx', rb.left + rb.width / 2 + 'px');
        finger.style.setProperty('--ty', rb.top + rb.height / 2 + 'px');
      } else finger.style.display = 'none';
    } else finger.style.display = 'none';
    raf = requestAnimationFrame(place);
  }
  function show(o) {
    ensure();
    cur = o;
    coach.className = (o.dim ? 'dim ' : '') + (o.hint ? 'hint' : '');
    coach.style.display = 'block';
    bub.querySelector('p').innerHTML = o.text;
    const btn = bub.querySelector('button');
    btn.hidden = !o.button;
    btn.onclick = (e) => { e.stopPropagation(); L.Audio.play('click'); o.button && o.button(); };
    bub.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220 });
    cancelAnimationFrame(raf);
    place();
  }
  function hide() {
    cur = null;
    cancelAnimationFrame(raf);
    if (coach) coach.style.display = 'none';
  }
  function nudge() {
    if (!bub || !cur) return;
    bub.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 260 });
  }

  // ------------------------------------------------------------------ in-match hints
  let hintT = null;
  T.hint = function (target, text) {
    if (running) return;
    show({ target, text, hint: true });
    clearTimeout(hintT);
    hintT = setTimeout(() => T.clearHint(), 6500);
  };
  T.clearHint = function () {
    if (running || !cur || !cur.hint) return;
    clearTimeout(hintT);
    hide();
  };

  // ------------------------------------------------------------------ the training match
  let running = false;
  let steps = [];
  let si = 0;
  let passed = -1;
  const handCard = (cid) => () => document.querySelector(`#hand .card[data-cid="${cid}"]`);
  const myMinion = (cid) => () => document.querySelector(`#boardP .minion[data-cid="${cid}"]`);
  const foeMinion = (cid) => () => document.querySelector(`#boardE .minion${cid ? `[data-cid="${cid}"]` : ''}`);
  const cidOf = (G, a) => {
    if (a.t === 'play') { const c = G.players[ME].hand.find((x) => x.uid === a.uid); return c && c.cid; }
    if (a.t === 'atk') { const m = E.char(G, a.a); return m && m.cid; }
    return null;
  };
  const targetCid = (G, uid) => { const t = E.char(G, uid); return t ? (t.isHero ? 'HERO' + t.pid : t.cid) : null; };

  function info(target, text, extra) { return Object.assign({ mode: 'info', target, text }, extra); }
  function act(target, text, allow, extra) { return Object.assign({ mode: 'act', target, text, allow }, extra); }

  const PLAN = {
    1: {
      setup(G) { const p = G.players[ME]; p.maxMana = p.mana = 3; p.hand = ['S04', 'N02'].map((c) => E.mkCard(G, c)); },
      steps: () => [
        info('#heroP', '这是你：外勤特工<b>沈砚</b>。头像右下角是生命值，降到 0，你就会被留在夹层里。'),
        info('#heroE', '这是对手：<b>训练模拟体</b>。把它的生命值打到 0，你就赢了。'),
        info('#hbP .meter.mm', '<b>法力水晶</b>：每回合 +1，最多 10 个。卡牌左上角的蓝宝石是它的费用。这一回合你有 3 点法力。'),
        act(handCard('S04'), '把<b>隔离门</b>拖到战场上。<br>也可以先轻触它，再轻触战场。', (a, G) => a.t === 'play' && cidOf(G, a) === 'S04', { pointer: [handCard('S04'), '#boardP'] }),
        info(myMinion('S04'), '它有<b>嘲讽</b>（身后黄黑相间的盾）：敌人必须先攻击它。<br>刚上场的随从要等到<b>下回合</b>才能攻击。'),
        act('#endTurn', '法力用完了。轻触<b>结束回合</b>，轮到对手。', (a) => a.t === 'end'),
      ],
    },
    2: {
      setup(G) { const p = G.players[ME]; p.maxMana = p.mana = 2; p.hand = ['N02'].map((c) => E.mkCard(G, c)); },
      steps: () => [
        info(foeMinion('N01'), '对手放下了一只<b>日光灯飞虫</b>。随从左下角是<b>攻击力</b>，右下角是<b>生命值</b>。'),
        act(myMinion('S04'), '你的隔离门在<b>发绿光</b>，说明它可以攻击了。<br>轻触它，再轻触飞虫；也可以直接从它拖向飞虫。', (a, G) => a.t === 'atk' && cidOf(G, a) === 'S04' && targetCid(G, a.target) === 'N01', { pointer: [myMinion('S04'), foeMinion('N01')] }),
        info(myMinion('S04'), '攻击时双方<b>互相</b>造成伤害：飞虫被消灭，隔离门也掉了 2 点生命。'),
        act('#hpP', '右侧圆形按钮是<b>英雄技能</b>：每回合一次，2 点法力。<br>沈砚的「深呼吸」会获得护甲并恢复理智。轻触它。', (a) => a.t === 'hp'),
        act('#endTurn', '结束回合。', (a) => a.t === 'end'),
      ],
    },
    3: {
      setup(G) { const p = G.players[ME]; p.maxMana = p.mana = 5; p.hand = ['N03', 'N02'].map((c) => E.mkCard(G, c)); },
      steps: () => [
        info(foeMinion('N04'), '对手放下了<b>堆积的纸箱</b>，它也有嘲讽：它倒下之前，你的随从只能攻击它。'),
        act(handCard('N03'), '<b>失眠者</b>的费用宝石下面多了一个紫色的 <i class="sym"></i>：它是<b>异常牌</b>，除了 3 点法力，还要付 1 点<b>理智</b>，换来比同费更强的身体。打出它。', (a, G) => a.t === 'play' && cidOf(G, a) === 'N03', { pointer: [handCard('N03'), '#boardP'] }),
        info('#hbP .meter.sm', '<b>理智</b>少了 1 点。理智每回合恢复 1 点；降到 3 以下，你的手里会混进<b>不存在的牌</b>；降到 0，每回合开始都会受伤。'),
        info('.depth', '花掉的理智让梦往下沉，看中间的<b>梦深</b>。涨到刻度线时，整局对战会沉到下一层，规则随之改变，而且<b>回不去</b>。'),
        act('#endTurn', '这回合先到这里。结束回合。', (a) => a.t === 'end' || a.t === 'hp'),
      ],
    },
    4: {
      setup(G) { const p = G.players[ME]; p.maxMana = p.mana = 8; p.hand = ['N08', 'S11'].map((c) => E.mkCard(G, c)); G.depth = Math.max(G.depth, 9); G.players[FOE].hp = 6; },
      steps: () => [
        info('.depth', '梦深快到第一道刻度了。模拟体的耐久也只剩 6 点。'),
        act(handCard('N08'), '打出<b>下沉之钟</b>：它的战吼让梦深 +4。看看会发生什么。', (a, G) => a.t === 'play' && cidOf(G, a) === 'N08', { pointer: [handCard('N08'), '#boardP'] }),
        info('.depth', '欢迎来到<b>第 1 层 · 无人泳池</b>：所有治疗翻倍，随从攻击后有一半几率漂到相邻位置。每一层都会改写规则，对双方同时生效。'),
        act(handCard('S11'), '<b>收容程序</b>能把一个敌方随从收进你的牌库。收容那个纸箱：先轻触这张牌，再轻触纸箱。', (a, G) => a.t === 'play' && cidOf(G, a) === 'S11' && targetCid(G, a.target) === 'N04', { pointer: [handCard('S11'), foeMinion('N04')] }),
        info('#deckP', '纸箱进了你的牌库顶部，带着<b>突破倒计时</b>。3 回合内抽到并打出它，它就为你而战；拖得太久，它会突破回对手场上。'),
        act('#heroE', '挡路的嘲讽没了。用你的随从<b>攻击对手英雄</b>，完成训练！', (a, G) => a.t === 'atk' && targetCid(G, a.target) === 'HERO1', { pointer: [myMinion('N03'), '#heroE'], repeat: true }),
      ],
    },
  };

  function goto(i) {
    si = i;
    const st = steps[si];
    if (!st) { hide(); return; }
    show({
      target: st.target,
      text: st.text,
      dim: true,
      pointer: st.pointer,
      button: st.mode === 'info' ? () => goto(si + 1) : null,
    });
  }

  T.start = function () {
    running = true;
    L.Store.progress.briefed = true;
    L.Store.saveProgress();
    L.UI.start({
      agent: 'agent_shen',
      deck: Array(30).fill('N02'),
      boss: 'boss_trainer',
      tutorial: true,
      first: 0,
      seed: 20261126,
      setup(G) {
        G.drift = 0;
        G.players[FOE].hand = [];
        G.players[ME].hand = [];
      },
      onTurn(G) {
        const t = (G.turn + 1) / 2;
        const plan = PLAN[t];
        if (!plan) return;
        plan.setup(G);
        steps = plan.steps();
        setTimeout(() => goto(0), 350);
      },
      gate(a, G) {
        const st = steps[si];
        if (!st || st.mode === 'info' || !st.allow(a, G)) { nudge(); return false; }
        if (a.t === 'end') hide();
        passed = si; // judged before the action changes the board
        return true;
      },
      after(a, G) {
        const st = steps[si];
        if (st && st.mode === 'act' && !st.repeat && passed === si && !G.over) { passed = -1; goto(si + 1); }
      },
      script(G, step) {
        const foe = G.players[FOE];
        foe.mana = 10;
        const plays = { 2: 'N01', 4: 'N04' };
        const cid = plays[G.turn];
        if (cid && !foe.board.some((m) => m.cid === cid) && !foe._played) {
          foe._played = true;
          const ci = E.mkCard(G, cid);
          foe.hand.push(ci);
          return { t: 'play', uid: ci.uid, target: null };
        }
        foe._played = false;
        return { t: 'end' };
      },
      onFinish(win) {
        running = false;
        hide();
        L.Store.progress.trained = true;
        L.Store.saveProgress();
        setTimeout(() => {
          const ov = $('endov');
          ov.className = 'ov dim on win';
          ov.innerHTML = `<div class="sub">LMN-T01 · 外勤训练</div><div class="big">训练完成</div>
            <div class="quote">「你学会了出牌、攻击、英雄技能、理智、梦深与收容。<br>真正的三位守门人在更深的地方等你。」</div>
            <div class="kwl" style="width:calc(var(--u)*84);text-align:left">
              <div><b>小提示</b>新手提示默认开启：对局中你停下来的时候，会有人指给你下一步可以做什么。可以在设置里关掉。</div>
              <div><b>推荐</b>第一次下沉，试试<b>沈砚 + 静滞协议</b>，对手选<b>管理员</b>。</div>
            </div>
            <div class="btns"><button class="btn" id="tGo">开始第一次下沉</button><button class="btn ghost" id="tAgain">再练一次</button><button class="btn ghost" id="tHome">返回标题</button></div>`;
          $('tGo').onclick = () => { ov.classList.remove('on'); L.UI.leave(); L.Store.selected = { agent: 'agent_shen', deck: 'pre_site', boss: 'boss_manager' }; L.Store.saveSelected(); L.Menus.show('setup'); };
          $('tAgain').onclick = () => { ov.classList.remove('on'); L.UI.leave(); T.start(); };
          $('tHome').onclick = () => { ov.classList.remove('on'); L.UI.leave(); L.Menus.show('title'); };
          L.Audio.play('win');
        }, 900);
      },
    });
  };
  T.stop = function () {
    running = false;
    hide();
  };
  T.running = () => running;
})();
