/* LIMINAL · card pool. Every rules text below is mirrored 1:1 by its script. */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const E = L.E;
  const H = E.h;

  const me = (G, c) => E.P(G, c.p);
  const en = (G, c) => E.P(G, 1 - c.p);
  const T = (G, c) => E.char(G, c.target);
  const live = (arr) => arr.filter((m) => m.hp > 0 && !m.dead);
  const heroOf = (G, pid) => E.P(G, pid).uid;

  const CARDS = (L.CARDS = {});
  const list = [];
  function card(d) {
    d.kw = d.kw || [];
    if (d.collectible == null) d.collectible = !d.token && !d.boss;
    CARDS[d.id] = d;
    list.push(d);
    return d;
  }

  // =====================================================================
  // 收容站 SITE — control: taunt / freeze / armor / 收容
  // =====================================================================
  card({
    id: 'S01', name: '夜班巡逻员', faction: 'site', type: 'minion', rarity: 'common', cost: 1, atk: 1, hp: 2, kw: ['taunt'],
    text: '嘲讽。战吼：获得 1 点护甲。',
    lore: { k: '档', t: '收容措施：电视屏幕须朝墙放置。夜班人员不得与画面中的走廊产生眼神接触。是的，走廊。' },
    art: ['lab', 'tv x.72 y.62 s.7 back1', 'faceless x.34 s.9 c#cfe', 'beam x.34 y.5 a-20'],
    bc: (G, c) => E.armor(G, c.p, 1),
  });
  card({
    id: 'S02', name: '低温收容柜', faction: 'site', type: 'minion', rarity: 'common', cost: 2, atk: 1, hp: 4, kw: ['taunt'],
    text: '嘲讽。冻结任何对此随从造成伤害的随从。',
    lore: { k: '档', t: '低温收容柜用于暂存性质不明的实体。柜内温度与柜外流逝的时间成反比。请勿在柜前等人。' },
    art: ['lab', 'cabinet x.5 s1.1', 'snow n26', { warp: 0.15 }],
    on: {
      damaged: (G, c) => {
        if (c.ev.t !== c.self) return;
        const s = E.char(G, c.ev.src);
        if (s && !E.isHero(s) && E.alive(G, s)) E.freeze(G, s.uid);
      },
    },
  });
  card({
    id: 'S03', name: '收容专员', faction: 'site', type: 'minion', rarity: 'common', cost: 3, atk: 3, hp: 2,
    text: '战吼：冻结一个敌方随从。',
    lore: { k: '档', t: '收容专员守则 第 1 条：不要在走廊里奔跑。第 2 条：不要在走廊里停下。第 3 条：如果你数得清灯管，请立即撤离。' },
    art: ['hall', 'tubes n5', 'faceless x.3 s.8 c#dff', 'faceless x.68 s.75 c#dff', 'grid o.5', 'snow n12'],
    tgt: 'enemyMinion',
    bc: (G, c) => { if (T(G, c)) E.freeze(G, c.target); },
  });
  card({
    id: 'S04', name: '隔离门', faction: 'site', type: 'minion', rarity: 'common', cost: 3, atk: 2, hp: 5, kw: ['taunt'],
    text: '嘲讽。',
    lore: { k: '讯', t: '[04:02:19] 隔离门 B-7 已关闭。……门的另一边有人在敲。节奏和我的心跳一样。' },
    art: ['lab', 'door x.5 w.5 h.95 vault1 c#9ab', 'siren x.5 y.14 s.5'],
  });
  card({
    id: 'S05', name: '警报红灯', faction: 'site', type: 'minion', rarity: 'common', cost: 2, atk: 2, hp: 3,
    text: '每当一个敌方随从被冻结时，此随从获得 +1 攻击。',
    lore: { k: '讯', t: '[--:--:--] 警报灯一直在转，没有警报声。我们后来才明白，它是在替我们屏住呼吸。' },
    art: ['hall', 'siren x.5 y.38 s1.4', { tint: '#ff2a3c', dark: 0.55 }],
    on: {
      frozen: (G, c) => {
        const t = c.ev.t;
        if (t && !E.isHero(t) && t.owner !== c.p) E.buff(G, c.self, 1, 0);
      },
    },
  });
  card({
    id: 'S06', name: '冻结指令', faction: 'site', type: 'spell', rarity: 'common', cost: 1,
    text: '冻结一个敌方随从。抽一张牌。',
    lore: { k: '档', t: '冻结指令仅对「正在移动」的实体有效。附注：在夹层里，一切都在移动。' },
    art: ['void', 'snowflake x.5 y.5 s1.3', 'grid o.6', 'snow n30'],
    tgt: 'enemyMinion',
    spell: (G, c) => { E.freeze(G, c.target); E.draw(G, c.p, 1); },
  });
  card({
    id: 'S07', name: '加固墙体', faction: 'site', type: 'spell', rarity: 'common', cost: 3,
    text: '获得 5 点护甲。抽一张牌。',
    lore: { k: '档', t: '第 3 次加固后，走廊墙体厚度达到 1.2 米。第 4 次测量时，墙的另一面贴着同样的米黄色壁纸。' },
    art: ['hall', 'wall x.5 n4', 'shield x.5 y.55 s.8 c#bff'],
    spell: (G, c) => { E.armor(G, c.p, 5); E.draw(G, c.p, 1); },
  });
  card({
    id: 'S08', name: '警戒线', faction: 'site', type: 'spell', rarity: 'common', cost: 2,
    text: '使一个友方随从获得 +1/+2 和嘲讽。',
    lore: { k: '记', t: '第 2 天。闻笛在每个转角拉上警戒线，说这样就知道哪些地方走过了。第二天早上，警戒线绕成了一个圈，把我们围在中间。' },
    art: ['hall', 'tape n3', 'faceless x.5 s.7 c#ffe'],
    tgt: 'friendlyMinion',
    spell: (G, c) => { const m = T(G, c); E.buff(G, m, 1, 2); E.giveKw(G, m, 'taunt'); },
  });
  card({
    id: 'S09', name: '防暴盾手', faction: 'site', type: 'minion', rarity: 'rare', cost: 4, atk: 3, hp: 5, kw: ['taunt'],
    text: '嘲讽。每当此随从受到伤害时，你获得 2 点护甲。',
    lore: { k: '讯', t: '[09:14:50] 盾牌上的划痕不是从外面来的。重复，不是从外面来的。' },
    art: ['lab', 'faceless x.5 s1 c#cfe', 'shield x.5 y.62 s1.1 c#8ef scratch1'],
    on: { damaged: (G, c) => { if (c.ev.t === c.self) E.armor(G, c.p, 2); } },
  });
  card({
    id: 'S10', name: '档案调阅员', faction: 'site', type: 'minion', rarity: 'rare', cost: 2, atk: 2, hp: 3,
    text: '战吼：从你的牌库中抽一张被收容的牌。如果没有，获得 2 点护甲。',
    lore: { k: '档', t: '派遣令 #0417：外勤组「回声-4」进入 LMN-000。成员：闻笛（组长）、岑夏（医疗）、陆鸣（通讯）、禾（记录）。预计停留时间：6 小时。' },
    art: ['lab', 'files x.5 s1', 'paper n6'],
    bc: (G, c) => { const got = E.drawWhere(G, c.p, (ci) => !!ci.breach); if (!got) E.armor(G, c.p, 2); },
  });
  card({
    id: 'S11', name: '收容程序', faction: 'site', type: 'spell', rarity: 'rare', cost: 5,
    text: '收容一个敌方随从。',
    lore: { k: '档', t: '收容程序 7-α：被收容的实体会被压缩为卡片形态，暂存于执行者的随身档案中。超过 3 个记录周期仍未转化的实体，会尝试「突破」。' },
    art: ['void', 'cardshape x.5 y.5 s1', 'chains n4', 'grid o.8'],
    tgt: 'enemyMinion',
    spell: (G, c) => E.contain(G, c.p, T(G, c)),
  });
  card({
    id: 'S12', name: '加固协议', faction: 'site', type: 'spell', rarity: 'rare', cost: 1,
    text: '使你所有被收容的牌的突破倒计时 +2。抽一张牌。',
    lore: { k: '讯', t: '[07:50:12] 回声-4，收到请回答。你们已经失联 19 天。……什么？你们说才过去 6 天？' },
    art: ['lab', 'clock x.5 y.48 s1.1 melt.2', 'lock x.5 y.72 s.6'],
    spell: (G, c) => {
      const p = me(G, c);
      for (const ci of p.deck.concat(p.hand)) if (ci.breach) { ci.breach.turns += 2; E.emit(G, 'countdown', { pid: c.p, uid: ci.uid, cid: ci.cid, turns: ci.breach.turns }); }
      E.draw(G, c.p, 1);
    },
  });
  card({
    id: 'S13', name: '全区降温', faction: 'site', type: 'spell', rarity: 'rare', cost: 4, san: 2,
    text: '对所有敌方随从造成 2 点伤害，并将其冻结。',
    lore: { k: '档', t: '事故报告：全区降温程序启动后，走廊内的温度降至 -40°C。灯管仍然是温的。' },
    art: ['hall', 'tubes n7', 'snow n60', { tint: '#9feaff', dark: 0.2 }],
    spell: (G, c) => {
      const foes = live(en(G, c).board.slice());
      E.group(G, () => { for (const m of foes) E.damage(G, heroOf(G, c.p), m.uid, 2, 'spell'); });
      E.group(G, () => { for (const m of foes) if (E.onBoard(G, m)) E.freeze(G, m.uid); });
    },
  });
  card({
    id: 'S14', name: '收容小队', faction: 'site', type: 'minion', rarity: 'epic', cost: 5, atk: 4, hp: 4,
    text: '战吼：收容一个攻击力小于或等于 3 的敌方随从。',
    lore: { k: '讯', t: '[12:00:00] 收容小队第二梯队已进入。……第一梯队在门口迎接了我们。他们没有变老。' },
    art: ['hall', 'faceless x.25 s.75 c#dff', 'faceless x.5 s.85 c#dff', 'faceless x.75 s.75 c#dff', 'chains n2'],
    tgt: 'enemyMinion',
    tgtCond: (G, t) => E.atkOf(G, t) <= 3,
    bc: (G, c) => { const t = T(G, c); if (t) E.contain(G, c.p, t); },
  });
  card({
    id: 'S15', name: '锁链拘束', faction: 'site', type: 'spell', rarity: 'epic', cost: 2, san: 1,
    text: '收容一个被冻结的敌方随从。',
    lore: { k: '档', t: '实体在冻结状态下无法抵抗收容。锁链本身并无特殊之处，真正起作用的，是你相信它锁得住东西。' },
    art: ['cell', 'chains n6', 'snow n14', 'lock x.5 y.5 s.9'],
    tgt: 'enemyMinion',
    tgtCond: (G, t) => !!t.frozen,
    spell: (G, c) => E.contain(G, c.p, T(G, c)),
  });
  card({
    id: 'S16', name: '不眠哨兵', faction: 'site', type: 'minion', rarity: 'epic', cost: 4, san: 2, atk: 4, hp: 6, kw: ['taunt'],
    text: '嘲讽。每当一个敌方随从攻击后，冻结它。',
    lore: { k: '档', t: '实体记录：不眠哨兵。它原本是站点的一名夜班员，已经 4,000 个小时没有合眼，也不打算合眼。' },
    art: ['lab', 'longfig x.5 s1.2 c#5f8f98', 'eyes n7 x.5 y.3 r.4', { warp: 0.1 }],
    on: {
      afterAttack: (G, c) => {
        const a = c.ev.a;
        if (a && a.owner !== c.p && E.alive(G, a)) E.freeze(G, a.uid);
      },
    },
  });
  card({
    id: 'S17', name: '收容主管 · 镜七', faction: 'site', type: 'minion', rarity: 'legendary', cost: 7, atk: 6, hp: 6, kw: ['taunt'],
    text: '嘲讽。战吼：收容所有攻击力小于或等于 2 的敌方随从。',
    lore: { k: '档', t: '回声-4 状态更新：闻笛，确认为「走廊尽头的管理员」；岑夏，确认为「泳池里的救生员」；陆鸣，确认为「闭店广播」；禾，未找到。签发人：主管 镜七。' },
    art: ['lab', 'monitors n12', 'faceless x.5 s1 c#eff back1'],
    bc: (G, c) => {
      const t = live(en(G, c).board.slice()).filter((m) => E.atkOf(G, m) <= 2);
      E.group(G, () => { for (const m of t) E.contain(G, c.p, m); });
    },
  });
  card({
    id: 'S18', num: 19, name: 'LMN-019 冰封档案库', faction: 'site', type: 'minion', rarity: 'legendary', cost: 6, san: 3, atk: 4, hp: 9, kw: ['taunt'],
    text: '嘲讽。在你的回合结束时，冻结攻击力最高的敌方随从。',
    whisper: '（霜上的第十三行，写的是你的名字。）',
    lore: { k: '档', t: 'LMN-019 是一座无法打开的档案库。我们知道里面保存着回声-4 的全部记录，因为每天早上，柜门上的霜都会多出一行字。' },
    art: ['void', 'vault x.5 s1.1', 'snow n40', 'textlines n7'],
    on: {
      turnEnd: (G, c) => {
        if (c.ev.pid !== c.p) return;
        const foes = live(en(G, c).board);
        if (!foes.length) return;
        const hi = Math.max.apply(null, foes.map((m) => E.atkOf(G, m)));
        const t = H.pick(G, foes.filter((m) => E.atkOf(G, m) === hi));
        E.freeze(G, t.uid);
      },
    },
  });

  // =====================================================================
  // 后室层级 LEVELS — fields / teleport / stealth / poison / ambush
  // =====================================================================
  card({
    id: 'B01', name: '墙缝之手', faction: 'level', type: 'minion', rarity: 'common', cost: 1, atk: 1, hp: 1, kw: ['stealth', 'poison'],
    text: '潜行。剧毒。',
    lore: { k: '档', t: '实体记录：墙缝中伸出的手。在未被注视时无攻击性。建议：不要注视。附注：它们一直在被注视。' },
    art: ['hall', 'crack x.5', 'hand x.45 y.55 s.9 a-30', 'hand x.58 y.4 s.6 a20'],
  });
  card({
    id: 'B02', name: '迷路的同事', faction: 'level', type: 'minion', rarity: 'common', cost: 2, atk: 2, hp: 3, kw: ['stealth'],
    text: '潜行。亡语：随机使一个敌方随从坠入夹层。',
    lore: { k: '档', t: '实体记录：迷路的同事。外表与站点职员无异，工牌照片为空白。会礼貌地问路。请勿回答，它问的是你回家的路。' },
    art: ['office', 'faceless x.5 s.95 c#ccb8 badge1'],
    dr: (G, c) => { const t = H.pick(G, live(en(G, c).board)); if (t) E.limbo(G, t); },
  });
  card({
    id: 'B03', name: '数灯管的人', faction: 'level', type: 'minion', rarity: 'common', cost: 3, atk: 2, hp: 4,
    text: '战吼：如果场上有场地牌，获得 +1/+1 并抽一张牌。',
    lore: { k: '记', t: '第 2 天。灯管一共有 312 根。不对，是 313 根。陆鸣说多出来的那一根在看着我们。' },
    art: ['hall', 'tubes n13 dense1', 'faceless x.5 y.82 s.55 up1'],
    bc: (G, c) => { if (G.field) { E.buff(G, c.self, 1, 1); E.draw(G, c.p, 1); } },
  });
  card({
    id: 'B04', name: '无面清洁工', faction: 'level', type: 'minion', rarity: 'common', cost: 4, atk: 4, hp: 5,
    text: '战吼：使你的其他随从获得潜行，直到你的下个回合。',
    lore: { k: '档', t: '实体记录：无面清洁工。在灯光熄灭时清理「痕迹」，包括脚印、声音与人。它对你很客气。' },
    art: ['hall', 'wetfloor', 'faceless x.45 s.9 c#bb9', 'mop x.62 y.6 s.9'],
    bc: (G, c) => { E.group(G, () => { for (const m of live(me(G, c).board)) if (m !== c.self) E.giveKw(G, m, 'stealth', true); }); },
  });
  card({
    id: 'B05', name: '暗处的眼睛', faction: 'level', type: 'minion', rarity: 'common', cost: 3, atk: 3, hp: 3, kw: ['stealth'],
    text: '潜行。暗袭：额外造成 2 点伤害。',
    ambush: { bonus: 2 },
    lore: { k: '讯', t: '[03:33:03] 关掉手电筒。……对，就这样。现在你看见它们了吗？它们一直都在，只是灯太亮了。' },
    art: ['void', 'eyes n9 x.5 y.5 r.9'],
  });
  card({
    id: 'B06', name: '切出', faction: 'level', type: 'spell', rarity: 'common', cost: 2,
    text: '将一个敌方随从移回其拥有者的手牌，其法力值消耗增加 2 点。',
    lore: { k: '档', t: '「切出」现象：以特定角度贴墙行走时，人会滑入墙的另一侧。另一侧也是走廊。另一侧也有一个你，正在贴墙行走。' },
    art: ['hall', 'faceless x.45 s.85 half1', 'pixtear x.5 n8'],
    tgt: 'enemyMinion',
    spell: (G, c) => E.bounce(G, T(G, c), 2),
  });
  card({
    id: 'B07', name: '熄灯', faction: 'level', type: 'spell', rarity: 'common', cost: 1,
    text: '使一个友方随从获得潜行。抽一张牌。',
    lore: { k: '记', t: '第 3 天。灯灭了十一秒。十一秒里，我听见有人在我耳边数数，数到了十二。' },
    art: ['hall', 'tubes n5 off1', { dark: 0.75 }, 'eyes n2 x.6 y.55 r.2'],
    tgt: 'friendlyMinion',
    spell: (G, c) => { E.giveKw(G, T(G, c), 'stealth'); E.draw(G, c.p, 1); },
  });
  card({
    id: 'B08', name: '坠入夹层', faction: 'level', type: 'spell', rarity: 'rare', cost: 3,
    text: '使一个随从坠入夹层：将其移出战场，在其拥有者的下个回合结束时回到场上。抽一张牌。',
    lore: { k: '讯', t: '[--:--:--] 地板下面还有地板。地板下面的地板下面，还有人在走路。' },
    art: ['hall', 'hole x.5 y.66 s1', 'faceless x.5 y.7 s.4 fall1'],
    tgt: 'minion',
    spell: (G, c) => { E.limbo(G, T(G, c)); E.draw(G, c.p, 1); },
  });
  card({
    id: 'B09', name: '无限办公室', faction: 'level', type: 'field', rarity: 'rare', cost: 1,
    text: '场地：在你的回合结束时，随机使一个没有潜行的友方随从获得潜行。',
    lore: { k: '档', t: '走廊长度测量：第一次 41 米，第二次 41 米，第三次 2,113 米。测量员坚称自己没有走动。' },
    art: ['office', 'cubicles n9', 'tubes n6'],
    on: {
      turnEnd: (G, c) => {
        if (c.ev.pid !== c.p) return;
        const m = H.pick(G, live(me(G, c).board).filter((x) => !x.kw.stealth));
        if (m) E.giveKw(G, m, 'stealth');
      },
    },
  });
  card({
    id: 'B10', name: '排风管道', faction: 'level', type: 'field', rarity: 'common', cost: 1,
    text: '场地：你的潜行随从获得 +2 攻击。',
    lore: { k: '讯', t: '[00:14:02] 回声-4 呼叫站点。地毯是湿的。重复，地毯是湿的。……水是从通风口滴下来的，温的。' },
    art: ['hall', 'vent x.5 y.3 s1.2', 'drips n7', 'eyes n2 x.5 y.3 r.15'],
    auraAtk: (G, f, m) => (m.owner === f.owner && m.kw.stealth ? 2 : 0),
  });
  card({
    id: 'B11', name: '熄灯的停车场', faction: 'level', type: 'field', rarity: 'epic', cost: 2, san: 1,
    text: '场地：在每个回合结束时，对所有没有潜行的随从造成 1 点伤害。',
    lore: { k: '记', t: '第 9 天。停车场里停满了车，每一辆的车灯都对着我们，每一辆都没有发动机。我们在车与车之间睡了一晚。' },
    art: ['park', { dark: 0.35 }, 'cars n4'],
    on: {
      turnEnd: (G, c) => {
        const t = E.allMinions(G).filter((m) => m.hp > 0 && !m.dead && !m.kw.stealth);
        E.group(G, () => { for (const m of t) E.damage(G, null, m.uid, 1, 'field'); });
      },
    },
  });
  card({
    id: 'B12', name: '电梯间', faction: 'level', type: 'field', rarity: 'rare', cost: 3,
    text: '场地：在你的回合结束时，召唤一个 1/1 并具有潜行的「游荡的影子」。',
    whisper: '（电梯里一共站着五个人。）',
    lore: { k: '讯', t: '[14:00:41] 电梯到了，门开了。里面站着我们四个人。他们在等我们进去。' },
    art: ['hall', 'elevator x.5 s1', 'faceless x.42 y.66 s.35 c#111', 'faceless x.58 y.66 s.35 c#111'],
    on: { turnEnd: (G, c) => { if (c.ev.pid === c.p) E.summon(G, c.p, 'T_SHADOW', null, { how: 'field' }); } },
  });
  card({
    id: 'B13', name: '长腿的门', faction: 'level', type: 'minion', rarity: 'rare', cost: 4, atk: 3, hp: 4,
    text: '战吼：使一个敌方随从坠入夹层。',
    lore: { k: '讯', t: '[02:41:55] 走廊尽头有一扇门。它昨天没有这么高。今天，它弯下腰看了看我们。' },
    art: ['hall', 'door x.5 w.3 h1.6 bend.25 c#7a6436', 'legs x.5'],
    tgt: 'enemyMinion',
    bc: (G, c) => { const t = T(G, c); if (t) E.limbo(G, t); },
  });
  card({
    id: 'B14', name: '穿墙者', faction: 'level', type: 'minion', rarity: 'epic', cost: 5, atk: 4, hp: 4, kw: ['stealth', 'rush'],
    text: '潜行。突袭。暗袭：伤害翻倍。',
    ambush: { double: true },
    lore: { k: '档', t: '实体记录：穿墙者。只沿直线移动，墙对它不构成障碍。墙对我们构成障碍。这就是全部区别。' },
    art: ['hall', 'wall x.5 n1', 'longfig x.5 s1 c#211 phase1', 'pixtear x.5 n12'],
  });
  card({
    id: 'B15', name: '游荡的猎手', faction: 'level', type: 'minion', rarity: 'rare', cost: 3, atk: 3, hp: 3, kw: ['stealth'],
    text: '潜行。在你的回合结束时，如果此随从具有潜行，获得 +1/+1。',
    lore: { k: '记', t: '第 6 天。有东西跟着我们，跟了三天。它走得越来越近，也越来越像我们中的某一个人。' },
    art: ['hall', 'tubes n6', 'longfig x.62 y.6 s.55 c#2a2210', { dark: 0.3 }],
    on: { turnEnd: (G, c) => { if (c.ev.pid === c.p && c.self.kw.stealth) E.buff(G, c.self, 1, 1); } },
  });
  card({
    id: 'B16', name: '荧光过载', faction: 'level', type: 'spell', rarity: 'epic', cost: 3, san: 2,
    text: '对所有没有潜行的随从造成 3 点伤害。',
    lore: { k: '讯', t: '[18:48:00] 所有灯管同时亮到了最亮。一瞬间我看见了走廊的尽头。尽头站着一个人，正在关灯。' },
    art: ['hall', 'tubes n11 blaze1', { bright: 0.7 }, 'faceless x.5 y.6 s.3 c#000'],
    spell: (G, c) => {
      const t = E.allMinions(G).filter((m) => m.hp > 0 && !m.dead && !m.kw.stealth);
      E.group(G, () => { for (const m of t) E.damage(G, heroOf(G, c.p), m.uid, 3, 'spell'); });
    },
  });
  card({
    id: 'B17', num: 40, name: 'LMN-040 无面之王', faction: 'level', type: 'minion', rarity: 'legendary', cost: 7, san: 2, atk: 6, hp: 6, kw: ['stealth'],
    text: '潜行。你的其他潜行随从拥有剧毒。',
    lore: { k: '档', t: 'LMN-040：所有「无面」实体都朝向同一个方向。我们沿着它们面朝的方向走了七天，找到了一把空椅子。' },
    art: ['hall', 'throne x.5 s1', 'faceless x.18 s.55 c#c9b46a', 'faceless x.82 s.55 c#c9b46a', 'faceless x.33 y.85 s.4 c#c9b46a', 'faceless x.67 y.85 s.4 c#c9b46a'],
    auraPoison: (G, src, m) => m.owner === src.owner && !!m.kw.stealth,
  });
  card({
    id: 'B18', num: 44, name: 'LMN-044 出口标志', faction: 'level', type: 'field', rarity: 'legendary', cost: 5, san: 2,
    text: '场地：在你的回合结束时，从你的牌库中随机召唤一个随从，并使其获得潜行。',
    lore: { k: '记', t: '第 9 天。陆鸣说他找到了出口。出口标志是绿色的，一直亮着。我们走了很久，它一直在前面，一直在前面。' },
    art: ['hall', { dark: 0.6 }, 'exit x.5 y.36 s1.2', 'faceless x.5 y.86 s.3 c#000'],
    on: {
      turnEnd: (G, c) => {
        if (c.ev.pid !== c.p) return;
        const p = me(G, c);
        if (p.board.length >= L.C.MAX_BOARD) return;
        const pool = p.deck.filter((ci) => L.CARDS[ci.cid].type === 'minion' && !ci.fake);
        const ci = H.pick(G, pool);
        if (!ci) return;
        p.deck.splice(p.deck.indexOf(ci), 1);
        const m = E.summon(G, c.p, ci.cid, null, { uid: ci.uid, how: 'exit' });
        if (m) E.giveKw(G, m, 'stealth');
      },
    },
  });

  // =====================================================================
  // 梦核 DREAMCORE — copy / echo / steal / 褪色
  // =====================================================================
  card({
    id: 'D01', name: '肥皂泡', faction: 'dream', type: 'minion', rarity: 'common', cost: 1, atk: 1, hp: 1, kw: ['divine'], echo: true,
    text: '圣盾。回响。',
    lore: { k: '记', t: '第 4 天。走廊里飘过一个肥皂泡，里面有一个下午。我伸手去碰，它破了，那个下午落在我手心里，很轻。' },
    art: ['sky', 'bubbles n7 big1'],
  });
  card({
    id: 'D02', name: '旧电视机', faction: 'dream', type: 'minion', rarity: 'common', cost: 2, atk: 2, hp: 2,
    text: '战吼：随机复制对手手牌中的一张牌，将其置入你的手牌。',
    lore: { k: '记', t: '第 6 天。旧电视机里在放我小时候看的动画片。可是我小时候，家里没有电视机。' },
    art: ['room', 'tv x.5 y.56 s1.25 pastel1', 'stars n5'],
    bc: (G, c) => { const ci = H.pick(G, en(G, c).hand); if (ci) E.copyCard(G, c.p, ci); },
  });
  card({
    id: 'D03', name: '午睡的下午', faction: 'dream', type: 'spell', rarity: 'common', cost: 3, fade: true,
    text: '抽两张牌。褪色。',
    lore: { k: '记', t: '第 1 天。走廊里很暖，像小时候午睡醒来、大人们都不在的那种下午。闻笛说不要摸墙。我摸了。墙是软的，有温度。' },
    art: ['kinder', 'window x.66 y.36 s1', 'sunbeam x.6', 'mats n3'],
    spell: (G, c) => E.draw(G, c.p, 2),
  });
  card({
    id: 'D04', name: '彩虹拖影', faction: 'dream', type: 'spell', rarity: 'common', cost: 1, echo: true,
    text: '造成 2 点伤害。回响。',
    lore: { k: '讯', t: '[--:--:--]（录音带里只有一段口哨，吹的是《小星星》。吹到第二句就停了，然后从头开始。）' },
    art: ['sky', 'rainbow x.5 y.6 s1 streak1', 'stars n4'],
    tgt: 'any',
    spell: (G, c) => E.damage(G, heroOf(G, c.p), c.target, 2, 'spell'),
  });
  card({
    id: 'D05', name: '漂浮泳圈', faction: 'dream', type: 'minion', rarity: 'common', cost: 2, atk: 2, hp: 2,
    text: '亡语：使一个随机友方随从获得圣盾。',
    lore: { k: '记', t: '第 4 天。岑夏找到了一座泳池。水只到脚踝，但她不肯下去。她说她七岁时差点淹死，是一个救生员把她捞了上来。那个救生员没有脸。' },
    art: ['pool', 'ring x.5 y.55 s1.2'],
    dr: (G, c) => { const m = H.pick(G, live(me(G, c).board)); if (m) E.giveKw(G, m, 'divine'); },
  });
  card({
    id: 'D06', name: '小时候的玩伴', faction: 'dream', type: 'minion', rarity: 'common', cost: 2, atk: 2, hp: 1, echo: true,
    text: '回响。',
    lore: { k: '记', t: '第 5 天。有个小孩在走廊里跳格子。她说她在等我回去一起玩。我想不起她的名字，但我记得我答应过她。' },
    art: ['hall', 'hopscotch x.5', 'child x.6 y.62 s.7', { tint: '#ffc8e8', dark: 0 }],
  });
  card({
    id: 'D07', name: '温柔的光晕', faction: 'dream', type: 'spell', rarity: 'common', cost: 2,
    text: '为你的英雄恢复 4 点生命值和 2 点理智。',
    lore: { k: '记', t: '第 8 天。我们在泳池边睡了一觉。醒来的时候岑夏不见了。池边放着她的哨子，还是湿的，还是温的。' },
    art: ['pool', 'halo x.5 y.45 s1.2', 'whistle x.5 y.8 s.6'],
    spell: (G, c) => { E.heal(G, heroOf(G, c.p), heroOf(G, c.p), 4); E.gainSanity(G, c.p, 2); },
  });
  card({
    id: 'D08', name: '梦里的小偷', faction: 'dream', type: 'minion', rarity: 'rare', cost: 4, atk: 3, hp: 3,
    text: '战吼：偷取对手手牌中的一张随机牌。',
    lore: { k: '档', t: '实体记录：梦里的小偷。它不偷东西，只偷「你曾经拥有过它」的那部分记忆。被偷走的东西一直在原处，只是你不再认得。' },
    art: ['room', 'stars n8', 'hand x.5 y.6 s1.1 a-10 reach1', 'star x.5 y.25 s.9'],
    bc: (G, c) => { const ci = H.pick(G, en(G, c).hand); if (ci) E.stealCard(G, c.p, ci); },
  });
  card({
    id: 'D09', name: '镜中人', faction: 'dream', type: 'minion', rarity: 'rare', cost: 4, san: 1, atk: 3, hp: 3,
    text: '战吼：选择一个随从，变成它的复制。',
    lore: { k: '讯', t: '[06:12:33] 组长，有人在跟着我们。……不，不是有人。是我们在跟着我们。' },
    art: ['room', 'mirror x.5 s1', 'faceless x.5 y.62 s.6 c#e8d0f0'],
    tgt: 'minion',
    bc: (G, c) => { const t = T(G, c); if (t && c.self) E.transform(G, c.self, t); },
  });
  card({
    id: 'D10', name: '回声录像带', faction: 'dream', type: 'spell', rarity: 'rare', cost: 2,
    text: '将对手上一张使用的牌的复制置入你的手牌，其法力值消耗减少 1 点。如果没有，抽一张牌。',
    lore: { k: '讯', t: '[录像带 B 面] ……祝你生日快乐，祝你生日快乐——（掌声）——（掌声持续了四十分钟）' },
    art: ['room', 'cassette x.5 y.52 s1.2', 'rainbow x.5 y.2 s.5'],
    spell: (G, c) => {
      const last = en(G, c).last;
      if (last && L.CARDS[last]) E.addToHand(G, c.p, last, { costMod: -1 }, 'copy');
      else E.draw(G, c.p, 1);
    },
  });
  card({
    id: 'D11', name: '梦游者', faction: 'dream', type: 'minion', rarity: 'rare', cost: 4, atk: 3, hp: 3, fade: true,
    text: '战吼：抽一张牌。褪色。',
    lore: { k: '记', t: '第 5 天。我的笔记本自己多写了一页。字迹是我的，日期是明天的。上面写着：不要相信明天的我。' },
    art: ['sky', { dark: 0.4 }, 'moon x.72 y.25 s.8', 'faceless x.42 s.85 c#efe0ff arms1'],
    bc: (G, c) => E.draw(G, c.p, 1),
  });
  card({
    id: 'D12', name: '彩虹桥', faction: 'dream', type: 'spell', rarity: 'epic', cost: 3, san: 2,
    text: '使你的所有随从获得 +1/+1 和圣盾。',
    lore: { k: '记', t: '第 7 天。泳池上方出现了一道彩虹，一端落在出口，另一端落在我七岁那年。我们选了出口。我后悔了。' },
    art: ['pool', 'rainbow x.5 y.62 s1.3', 'clouds n3'],
    spell: (G, c) => { E.group(G, () => { for (const m of live(me(G, c).board)) { E.buff(G, m, 1, 1); E.giveKw(G, m, 'divine'); } }); },
  });
  card({
    id: 'D13', name: '无尽的午后', faction: 'dream', type: 'spell', rarity: 'epic', cost: 5, fade: true,
    text: '召唤三个 2/2 的「褪色的玩伴」。褪色。',
    lore: { k: '记', t: '第 ？天。下午一直没有结束，太阳停在三点十五分。我们玩了很久的捉迷藏，没有人来找我们。' },
    art: ['sky', 'sun x.75 y.24 s.8', 'slide x.35 y.7 s1', 'swing x.72 y.66 s.8'],
    spell: (G, c) => { E.group(G, () => { for (let i = 0; i < 3; i++) E.summon(G, c.p, 'T_PLAYMATE'); }); },
  });
  card({
    id: 'D14', name: '另一个我', faction: 'dream', type: 'minion', rarity: 'epic', cost: 5, san: 3, atk: 5, hp: 5,
    text: '战吼：复制对手手牌中的两张牌，将其置入你的手牌。',
    lore: { k: '讯', t: '[22:22:22] 这里是禾。……这里是禾。……请问，你们那边，也有一个禾吗？' },
    art: ['room', 'faceless x.33 s.85 c#f0d8ff', 'faceless x.67 s.85 c#f0d8ff mirror1', 'line x.5'],
    bc: (G, c) => {
      const h = en(G, c).hand.slice();
      H.shuffle(G, h);
      for (const ci of h.slice(0, 2)) E.copyCard(G, c.p, ci);
    },
  });
  card({
    id: 'D15', name: '借走的星星', faction: 'dream', type: 'spell', rarity: 'rare', cost: 2,
    text: '将对手牌库顶的一张牌置入你的手牌。',
    lore: { k: '记', t: '第 6 天。天花板上贴着夜光星星，和我小时候房间里的一模一样。我数了数，少了一颗。那一颗在我口袋里。' },
    art: ['room', { dark: 0.6 }, 'stars n14 glow1', 'star x.5 y.7 s.7'],
    spell: (G, c) => {
      const o = en(G, c), p = me(G, c);
      const ci = o.deck.shift();
      if (!ci) return;
      if (p.hand.length >= L.C.MAX_HAND) { E.emit(G, 'burn', { pid: c.p, cid: ci.cid }); return; }
      if (ci.breach && ci.breach.owner === c.p) ci.breach = null;
      p.hand.push(ci);
      E.emit(G, 'steal', { from: o.pid, to: c.p, uid: ci.uid, cid: ci.cid, deck: true });
    },
  });
  card({
    id: 'D16', name: '泡泡机', faction: 'dream', type: 'minion', rarity: 'rare', cost: 3, atk: 2, hp: 3,
    text: '在你的回合结束时，使一个随机的没有圣盾的友方随从获得圣盾。',
    lore: { k: '档', t: '在第 1 层发现一台仍在工作的泡泡机，没有接电源。每一个泡泡里都映着一张站点职员的脸，他们在微笑。' },
    art: ['pool', 'machine x.45 y.62 s1', 'bubbles n6'],
    on: {
      turnEnd: (G, c) => {
        if (c.ev.pid !== c.p) return;
        const m = H.pick(G, live(me(G, c).board).filter((x) => !x.kw.divine));
        if (m) E.giveKw(G, m, 'divine');
      },
    },
  });
  card({
    id: 'D17', num: 7, name: 'LMN-007 不会醒的孩子', faction: 'dream', type: 'minion', rarity: 'legendary', cost: 5, san: 2, atk: 4, hp: 5,
    text: '亡语：随机获得一个敌方随从的控制权。',
    lore: { k: '档', t: 'LMN-007：一个蜷在午睡垫上的孩子，呼吸平稳。所有试图叫醒它的人员都会在一小时内入睡，梦见同一间幼儿园。他们醒来后，会坚称自己才是那个孩子。' },
    art: ['kinder', 'child x.5 y.7 s.8 sleep1', 'halo x.5 y.62 s.9', 'stars n6'],
    dr: (G, c) => { const t = H.pick(G, live(en(G, c).board)); if (t) E.takeControl(G, c.p, t); },
  });
  card({
    id: 'D18', num: 64, name: 'LMN-064 记录员 · 禾', faction: 'dream', type: 'minion', rarity: 'legendary', cost: 5, atk: 4, hp: 4,
    text: '战吼：将对手牌库顶的两张牌的复制置入你的手牌，它们具有褪色。',
    whisper: '（别醒得太快，我还没写完。）',
    lore: { k: '记', t: '最后一页。我没有变成守门人。我变成了门。如果你正在读这一页，说明你已经打开我了。' },
    art: ['void', 'notebook x.5 y.55 s1.2', 'door x.5 y.5 w.24 h.6 c#fff8 glow1'],
    bc: (G, c) => {
      const top = en(G, c).deck.slice(0, 2);
      for (const ci of top) E.addToHand(G, c.p, ci.cid, { fz: true }, 'copy');
    },
  });

  // =====================================================================
  // 中立 NEUTRAL
  // =====================================================================
  card({
    id: 'N01', name: '日光灯飞虫', faction: 'neutral', type: 'minion', rarity: 'common', cost: 1, atk: 2, hp: 1,
    text: '',
    lore: { k: '档', t: '日光灯飞虫只在第 0 层出现，数量恒为 313。每捕获一只，灯管就会多出一根。' },
    art: ['hall', 'tubes n3', 'moths n9'],
  });
  card({
    id: 'N02', name: '自动贩卖机', faction: 'neutral', type: 'minion', rarity: 'common', cost: 2, atk: 2, hp: 1,
    text: '亡语：抽一张牌。',
    lore: { k: '记', t: '第 3 天。我往贩卖机里投了一枚硬币，掉出来的是一颗乳牙，上面写着我的名字。' },
    art: ['mall', 'vending x.5 s1'],
    dr: (G, c) => E.draw(G, c.p, 1),
  });
  card({
    id: 'N03', name: '失眠者', faction: 'neutral', type: 'minion', rarity: 'common', cost: 3, san: 1, atk: 4, hp: 4,
    text: '',
    whisper: '（现在几点了？你也该睡了。）',
    lore: { k: '档', t: '警告：长时间处于理智低值状态的人员，会在手中看见「不存在的卡片」。请勿使用它们。若已使用，请勿告诉任何人。' },
    art: ['room', { dark: 0.5 }, 'faceless x.5 s.9 c#cfc4d8 eyes1', 'clock x.78 y.24 s.45'],
  });
  card({
    id: 'N04', name: '堆积的纸箱', faction: 'neutral', type: 'minion', rarity: 'common', cost: 4, atk: 3, hp: 5, kw: ['taunt'],
    text: '嘲讽。',
    lore: { k: '记', t: '第 10 天。商场后仓堆满了搬家纸箱，每一箱上都写着一户人家的地址。我找到了我家的那一箱，里面是空的。' },
    art: ['mall', 'boxes n7'],
  });
  card({
    id: 'N05', name: '手电筒保安', faction: 'neutral', type: 'minion', rarity: 'common', cost: 5, atk: 4, hp: 5,
    text: '战吼：对一个敌方随从造成 2 点伤害。',
    lore: { k: '讯', t: '[01:15:00] 保安室有人。他让我们出示证件。我们出示了。他说：「照片上的人不是你们。」' },
    art: ['mall', 'faceless x.35 s.9 c#9aa', 'beam x.38 y.45 a-12 long1'],
    tgt: 'enemyMinion',
    bc: (G, c) => { if (T(G, c)) E.damage(G, c.self ? c.self.uid : heroOf(G, c.p), c.target, 2, 'effect'); },
  });
  card({
    id: 'N06', name: '失物招领处', faction: 'neutral', type: 'minion', rarity: 'rare', cost: 3, atk: 2, hp: 3,
    text: '战吼：随机将一张收容站、后室层级或梦核卡牌置入你的手牌。',
    lore: { k: '档', t: '失物招领处的登记簿上有 4 条新记录：一串钥匙、一只哨子、一台对讲机、一本没写完的日记。认领人一栏都是空白。' },
    art: ['mall', 'counter x.5', 'keys x.3 y.52 s.5', 'whistle x.45 y.52 s.45', 'radio x.6 y.5 s.5', 'notebook x.75 y.53 s.35'],
    bc: (G, c) => {
      const pool = L.COLLECTIBLE.filter((id) => L.CARDS[id].faction !== 'neutral');
      E.addToHand(G, c.p, H.pick(G, pool), null, 'gen');
    },
  });
  card({
    id: 'N07', name: '走失广播', faction: 'neutral', type: 'spell', rarity: 'rare', cost: 2,
    text: '造成 3 点伤害。梦深 +2。',
    lore: { k: '讯', t: '[05:00:00] 站点，这里是陆鸣。墙里有商场的广播，是我小时候常去的那家，九七年就拆了。广播在找一个走失的孩子。念的是我的名字。' },
    art: ['mall', 'speaker x.5 y.42 s1.2', 'waves x.5 y.42 n4'],
    tgt: 'any',
    spell: (G, c) => { E.damage(G, heroOf(G, c.p), c.target, 3, 'spell'); E.addDepth(G, 2, 'card'); },
  });
  card({
    id: 'N08', name: '下沉之钟', faction: 'neutral', type: 'minion', rarity: 'epic', cost: 3, atk: 2, hp: 4,
    text: '战吼：梦深 +4。',
    lore: { k: '档', t: '观察到「下沉」现象：特工每次动用理智（见附录 ⟁），夹层就会向下沉降。沉降不可逆。附录 ⟁ 已遗失。' },
    art: ['pool', 'clock x.5 y.5 s1.2 melt.6', 'waves x.5 y.8 n3'],
    bc: (G, c) => E.addDepth(G, 4, 'card'),
  });
  card({
    id: 'N09', name: '楼梯间回声', faction: 'neutral', type: 'minion', rarity: 'rare', cost: 6, atk: 5, hp: 6,
    text: '在你的回合结束时，对一个随机敌人造成 2 点伤害。',
    lore: { k: '讯', t: '[--:--:--] 我在往下走。我在往上走。脚步声是往下的，楼层数字是往上的。' },
    art: ['stair', 'stairs x.5 s1 spiral1'],
    on: {
      turnEnd: (G, c) => {
        if (c.ev.pid !== c.p) return;
        const o = en(G, c);
        const t = H.pick(G, [o].concat(live(o.board)));
        E.damage(G, c.self.uid, t.uid, 2, 'effect');
      },
    },
  });
  card({
    id: 'N10', num: 0, name: 'LMN-000 那台电视', faction: 'neutral', type: 'minion', rarity: 'legendary', cost: 5, atk: 4, hp: 6,
    text: '战吼：梦境立即下沉一层。如果已在最深层，改为对所有其他随从造成 3 点伤害。',
    lore: { k: '档', t: 'LMN-000 发现报告：一台 21 英寸显像管电视，于已关闭的向日葵幼儿园午睡室内被发现，未接电源。屏幕上持续显示一条米黄色的走廊。走廊的地毯上，有一行新鲜的湿脚印。' },
    art: ['kinder', 'tv x.5 y.55 s1.4 hallway1', 'mats n2'],
    bc: (G, c) => {
      if (G.layer < 2) E.sinkLayer(G);
      else {
        const t = E.allMinions(G).filter((m) => m !== c.self && m.hp > 0 && !m.dead);
        E.group(G, () => { for (const m of t) E.damage(G, c.self.uid, m.uid, 3, 'effect'); });
      }
    },
  });

  // =====================================================================
  // 守门人专属牌 (unlocked into the collection after each gatekeeper falls)
  // =====================================================================
  card({
    id: 'X01', boss: 'manager', name: '管理员的钥匙串', faction: 'site', type: 'spell', rarity: 'epic', cost: 3,
    text: '冻结一个敌方随从及其相邻的随从，并对它们造成 1 点伤害。',
    lore: { k: '记', t: '第 11 天。闻笛决定留下来。他说走廊总得有人看着，不能让后来的人走到下面去。他把钥匙串挂在腰上。钥匙一天比一天多，没有一把能打开出口。' },
    art: ['hall', 'keys x.5 y.5 s1.4 many1', { dark: 0.2 }],
    tgt: 'enemyMinion',
    spell: (G, c) => {
      const t = T(G, c);
      const b = en(G, c).board;
      const i = b.indexOf(t);
      const hit = [b[i - 1], t, b[i + 1]].filter(Boolean);
      E.group(G, () => { for (const m of hit) E.damage(G, heroOf(G, c.p), m.uid, 1, 'spell'); });
      E.group(G, () => { for (const m of hit) if (E.onBoard(G, m)) E.freeze(G, m.uid); });
    },
  });
  card({
    id: 'X02', boss: 'manager', name: '清洁推车', faction: 'site', type: 'minion', rarity: 'rare', cost: 3, atk: 2, hp: 5, kw: ['taunt'],
    text: '嘲讽。在你的回合结束时，为所有友方随从恢复 1 点生命值。',
    lore: { k: '记', t: '第 3 天。我们见到了管理员。他在拖一块永远拖不干的地。他对闻笛点了点头，好像认识他很久了。' },
    art: ['hall', 'cart x.5 y.65 s1', 'wetfloor'],
    on: {
      turnEnd: (G, c) => {
        if (c.ev.pid !== c.p) return;
        E.group(G, () => { for (const m of live(me(G, c).board)) E.heal(G, c.self.uid, m.uid, 1); });
      },
    },
  });
  card({
    id: 'X03', boss: 'lifeguard', name: '救生圈', faction: 'dream', type: 'spell', rarity: 'rare', cost: 1,
    text: '使一个友方随从获得圣盾，并为其恢复 2 点生命值。',
    lore: { k: '讯', t: '[11:11:11] 不要在池边奔跑。不要在池边奔跑。不要在池边——（这不是岑夏的声音。）（这就是岑夏的声音。）' },
    art: ['pool', 'ring x.5 y.5 s1.4 red1'],
    tgt: 'friendlyMinion',
    spell: (G, c) => { const m = T(G, c); E.giveKw(G, m, 'divine'); E.heal(G, heroOf(G, c.p), m.uid, 2); },
  });
  card({
    id: 'X04', boss: 'lifeguard', name: '浅水区', faction: 'dream', type: 'field', rarity: 'epic', cost: 2,
    text: '场地：在你的回合结束时，为所有友方角色恢复 1 点生命值。',
    lore: { k: '档', t: '第 1 层「无人泳池」：水深恒定为 4 厘米。溺水事故记录：27 起。' },
    art: ['pool', 'chair x.7 y.45 s1', 'waves x.5 y.85 n2'],
    on: {
      turnEnd: (G, c) => {
        if (c.ev.pid !== c.p) return;
        const p = me(G, c);
        E.group(G, () => {
          E.heal(G, p.uid, p.uid, 1);
          for (const m of live(p.board)) E.heal(G, p.uid, m.uid, 1);
        });
      },
    },
  });
  card({
    id: 'X05', boss: 'broadcast', name: '闭店音乐', faction: 'neutral', type: 'spell', rarity: 'epic', cost: 3, san: 1,
    text: '造成 4 点伤害，随机分配到所有敌人身上。梦深 +2。',
    lore: { k: '讯', t: '叮咚——尊敬的顾客，本商场即将闭店。请尚未离开的顾客，尽快前往最近的出口。最近的出口在——（杂音）' },
    art: ['mall', 'notes n7', 'speaker x.78 y.3 s.6'],
    spell: (G, c) => {
      for (let i = 0; i < 4; i++) {
        const o = en(G, c);
        const t = H.pick(G, [o].concat(live(o.board)));
        E.damage(G, heroOf(G, c.p), t.uid, 1, 'spell');
      }
      E.addDepth(G, 2, 'card');
    },
  });
  card({
    id: 'X06', boss: 'broadcast', name: '请尽快离开', faction: 'neutral', type: 'minion', rarity: 'rare', cost: 2, atk: 3, hp: 1, kw: ['charge'],
    text: '冲锋。',
    lore: { k: '讯', t: '[23:59:58] 这里是陆鸣，这里是陆鸣。我在广播室。我可以把所有人都叫出去，只要我一直广播下去就行。只要我一直——' },
    art: ['mall', 'exit x.5 y.3 s.8 red1', 'faceless x.5 y.72 s.6 run1 c#ff5a6a'],
  });

  // =====================================================================
  // tokens
  // =====================================================================
  card({
    id: 'T_COIN', token: true, name: '旧硬币', faction: 'neutral', type: 'spell', rarity: 'common', cost: 0,
    text: '在本回合中，获得一个法力水晶。',
    lore: { k: '档', t: '投币口开在一面墙上。墙后面什么也没有。' },
    art: ['void', 'coin x.5 y.5 s1.3'],
    spell: (G, c) => { const p = me(G, c); p.mana = Math.min(10, p.mana + 1); E.emit(G, 'mana', { pid: c.p, delta: 1 }); },
  });
  card({
    id: 'T_SHADOW', token: true, name: '游荡的影子', faction: 'level', type: 'minion', rarity: 'common', cost: 1, atk: 1, hp: 1, kw: ['stealth'],
    text: '潜行。',
    lore: { k: '档', t: '它跟着光走。光走了，它就留下来。' },
    art: ['hall', { dark: 0.7 }, 'faceless x.5 s.8 c#000'],
  });
  card({
    id: 'T_PLAYMATE', token: true, name: '褪色的玩伴', faction: 'dream', type: 'minion', rarity: 'common', cost: 2, atk: 2, hp: 2,
    text: '',
    lore: { k: '记', t: '你还记得她的名字吗？' },
    art: ['sky', 'child x.5 y.65 s.8 faded1'],
  });

  // ---------------------------------------------------------------------
  // derived tables
  // ---------------------------------------------------------------------
  L.CARD_LIST = list;
  L.COLLECTIBLE = list.filter((d) => d.collectible).map((d) => d.id);
  L.BOSS_CARDS = list.filter((d) => d.boss).map((d) => d.id);

  // story chronology — the archive reads the fragments in this order
  L.LORE_ORDER = [
    'N10', 'S01', 'S10', 'D03', 'B10', 'B09', 'B03', 'N01', 'S08', 'B13', 'N08', 'X02', 'N02', 'B07', 'T_COIN',
    'N07', 'B01', 'S04', 'D01', 'D05', 'X04', 'S02', 'D11', 'D06', 'D09', 'B02', 'D02', 'D15', 'B15', 'S11',
    'S12', 'S03', 'S06', 'B05', 'D12', 'D07', 'X03', 'D16', 'B04', 'B06', 'B08', 'B11', 'B18', 'D04', 'N04',
    'N05', 'X05', 'X06', 'N09', 'B12', 'S07', 'S13', 'S05', 'S09', 'S14', 'S15', 'S16', 'X01', 'N03', 'B14',
    'B16', 'D10', 'D13', 'D08', 'D14', 'B17', 'S17', 'N06', 'S18', 'D17', 'D18', 'T_SHADOW', 'T_PLAYMATE',
  ];

  // LMN numbers: legendaries keep their famous numbers, everything else follows the story order
  (function assignNumbers() {
    const reserved = new Set(list.filter((d) => d.num != null).map((d) => d.num));
    let n = 1;
    for (const id of L.LORE_ORDER) {
      const d = CARDS[id];
      if (!d || d.num != null) continue;
      while (reserved.has(n)) n++;
      d.num = n++;
    }
    for (const d of list) {
      if (d.num == null) {
        while (reserved.has(n)) n++;
        d.num = n++;
      }
      d.code = 'LMN-' + String(d.num).padStart(3, '0');
    }
  })();
})();
