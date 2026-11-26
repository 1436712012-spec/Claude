/* LIMINAL · agents, gatekeepers, decks */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const E = L.E;

  const rep = (pairs) => {
    const out = [];
    for (const [id, n] of pairs) for (let i = 0; i < n; i++) out.push(id);
    return out;
  };

  L.HEROES = {
    // ------------------------------------------------------------ agents
    agent_shen: {
      id: 'agent_shen', kind: 'agent', name: '沈砚', title: '封存专员',
      quote: '把门关好，是我唯一会做的事。',
      bio: '前收容站夜班员，在 LMN-019 门前值过 300 个夜班。他说那扇门从来没有开过，只是每天早上都比前一天更冷。',
      style: '防守 · 续航理智',
      portrait: { seed: 11, body: 'agent', pal: ['#9ff3ff', '#2c4a55', '#e9fbff'], prop: 'seal' },
      power: {
        name: '深呼吸', cost: 2, text: '获得 2 点护甲，恢复 1 点理智。',
        fx: (G, c) => { E.armor(G, c.p, 2); E.gainSanity(G, c.p, 1); },
      },
    },
    agent_tang: {
      id: 'agent_tang', kind: 'agent', name: '唐棠', title: '测绘员',
      quote: '走过的地方都要画记号，不然会走回来。',
      bio: '回声-4 的后备测绘员，出发前一天因病留下。她一直觉得，那张病假条是别人替她写的。',
      style: '灵活 · 精确点杀',
      portrait: { seed: 23, body: 'agent', pal: ['#f2d64b', '#4a3e1a', '#fff6c8'], prop: 'chalk' },
      power: {
        name: '粉笔记号', cost: 2, text: '造成 1 点伤害。', tgt: 'any',
        fx: (G, c) => E.damage(G, E.P(G, c.p).uid, c.target, 1, 'power'),
      },
    },
    agent_man: {
      id: 'agent_man', kind: 'agent', name: '阿满', title: '清醒梦者',
      quote: '我不怕睡着，我怕醒错地方。',
      bio: '志愿者，长期失眠，能在夹层里保持清醒地做梦。登记表的「既往住址」一栏里，他写的是：向日葵幼儿园。',
      style: '过牌 · 以理智换资源',
      portrait: { seed: 37, body: 'agent', pal: ['#ffb3e6', '#4a2a48', '#fff0fb'], prop: 'pillow' },
      power: {
        name: '打个盹', cost: 2, text: '抽一张牌，失去 1 点理智。',
        canUse: (G, c) => E.P(G, c.p).sanity >= 1,
        fx: (G, c) => { E.draw(G, c.p, 1); E.loseSanity(G, c.p, 1, 'power'); },
      },
    },

    // ------------------------------------------------------- gatekeepers
    boss_manager: {
      id: 'boss_manager', kind: 'boss', bossKey: 'manager', layer: 0, startDepth: 0,
      name: '走廊尽头的管理员', short: '管理员', title: '第 0 层守门人',
      code: 'LMN-101', klass: '静滞级',
      persona: 'control',
      intro: '一个永远在拖地的人。钥匙串在他腰间叮当作响，钥匙的数量与走廊里走失的人数相同。',
      portrait: { seed: 101, body: 'manager', pal: ['#e8d58a', '#3a3216', '#fffbe0'] },
      power: {
        name: '锁门', cost: 2, text: '冻结一个敌方随从。如果它已被冻结，改为对其造成 3 点伤害。', tgt: 'enemyMinion',
        fx: (G, c) => {
          const t = E.char(G, c.target);
          if (t.frozen) E.damage(G, E.P(G, c.p).uid, t.uid, 3, 'power');
          else E.freeze(G, t.uid);
        },
      },
      lines: {
        intro: ['又有人在走廊里跑了。', '……别跑。地板刚拖过。'],
        turn: ['灯管还剩三百一十三根。', '这里很安全。这里一直很安全。', '你的鞋底是湿的。', '我在等一个人回来。不是你。', '不要摸墙。'],
        hurt: ['嘘——', '你踩脏了。', '别碰我的钥匙。'],
        low: ['钥匙……我把钥匙放哪了……', '灯，灯要灭了。'],
        big: ['把门锁上。', '收容程序，第一条——'],
        defeat: ['……闻笛。我以前叫闻笛。', '帮我把走廊的灯关掉。下面的人，还在等。'],
        victory: ['回去吧。下面没有什么好看的。'],
        fourth: ['屏幕前的你，也别跑。', '你那边几点了？这里永远是下午三点。'],
        night: ['这么晚了，还不睡吗？'],
      },
      deck: rep([
        ['S01', 2], ['S02', 2], ['S03', 2], ['S04', 2], ['S06', 2], ['S07', 1], ['S08', 1], ['S09', 2], ['S11', 1],
        ['S13', 2], ['S14', 1], ['S15', 2], ['S16', 1], ['S18', 1], ['N04', 2], ['N05', 2], ['X01', 2], ['X02', 2],
      ]),
    },
    boss_lifeguard: {
      id: 'boss_lifeguard', kind: 'boss', bossKey: 'lifeguard', layer: 1, startDepth: 4,
      name: '泳池里的救生员', short: '救生员', title: '第 1 层守门人',
      code: 'LMN-102', klass: '游移级',
      persona: 'tempo',
      intro: '高脚椅上坐着一个没有脸的救生员，哨子挂在胸前，一直是湿的。她会救起每一个落水的人，然后不让任何人上岸。',
      portrait: { seed: 102, body: 'lifeguard', pal: ['#9fe3ee', '#14465a', '#f0ffff'] },
      power: {
        name: '哨声', cost: 2, text: '为一个友方角色恢复 3 点生命值。如果目标是随从，使其获得 +1 攻击。', tgt: 'friendly',
        fx: (G, c) => {
          const t = E.char(G, c.target);
          E.heal(G, E.P(G, c.p).uid, t.uid, 3);
          if (!E.isHero(t)) E.buff(G, t, 1, 0);
        },
      },
      lines: {
        intro: ['不要在池边奔跑。', '水很浅的。下来吧，我会看着你。'],
        turn: ['深呼吸。对，就这样。', '我数到十，你就可以上岸了。一、二、二、二……', '哨子是湿的，一直都是。', '你听，水在说话。'],
        hurt: ['别怕，别怕。', '呛水了吗？', '——哔！'],
        low: ['我……我救不了所有人。', '水在变深。'],
        big: ['抓住我的手。', '没事了，没事了。'],
        defeat: ['我只是想让大家都别离开。', '替我跟禾说，哨子我还留着。'],
        victory: ['好了，好了。你可以一直待在这里了。'],
        fourth: ['屏幕前的你，坐得离水太近了。', '你的手机屏幕上有水渍。不是你的。'],
        night: ['夜泳是不被允许的。'],
      },
      deck: rep([
        ['D01', 2], ['D05', 2], ['D07', 2], ['D06', 2], ['D16', 2], ['D12', 1], ['D08', 1], ['X03', 2], ['X04', 1],
        ['N02', 2], ['N03', 2], ['N04', 1], ['N05', 1], ['D11', 2], ['N08', 2], ['D17', 1], ['N09', 1], ['D13', 1],
        ['D10', 1], ['S08', 1],
      ]),
    },
    boss_broadcast: {
      id: 'boss_broadcast', kind: 'boss', bossKey: 'broadcast', layer: 2, startDepth: 14,
      name: '闭店广播', short: '广播', title: '第 2 层守门人',
      code: 'LMN-103', klass: '失序级',
      persona: 'aggro',
      intro: '没有形体，只有声音。它在每一个喇叭里同时说话，催促所有人离开。没有人知道它要把人催到哪里去。',
      portrait: { seed: 103, body: 'broadcast', pal: ['#ff2a4d', '#1a0509', '#ffd0d8'] },
      power: {
        name: '广播', cost: 2, text: '对敌方英雄造成 2 点伤害。梦深 +1。',
        fx: (G, c) => { E.damage(G, E.P(G, c.p).uid, E.P(G, 1 - c.p).uid, 2, 'power'); E.addDepth(G, 1, 'power'); },
      },
      lines: {
        intro: ['叮咚——尊敬的顾客，本商场即将闭店。', '请尚未离开的顾客，尽快前往最近的出口。'],
        turn: ['现在播报寻人启事：陆鸣小朋友，你的家长在服务台等你。', '本店所有商品，今夜五折。今夜不会结束。', '闭店倒计时：∞。', '请勿在扶梯上逆行。'],
        hurt: ['——滋——', '请勿在广播期间奔跑。', '信号……不良……'],
        low: ['这里是陆鸣……有人收到吗……', '出口在……出口在……'],
        big: ['请全体顾客注意。', '音量，调到最大。'],
        defeat: ['这里是陆鸣。广播结束。', '出口一直都在你身后。……别回头，直接走。'],
        victory: ['感谢您的光临。欢迎您，永远光临。'],
        fourth: ['请屏幕前的顾客，不要关闭页面。', '我们注意到，您已经停留很久了。'],
        night: ['现在是闭店后第 ∞ 分钟。'],
      },
      deck: rep([
        ['N01', 2], ['B01', 2], ['B02', 2], ['B05', 2], ['X06', 2], ['D04', 2], ['N07', 2], ['N08', 2], ['B15', 2],
        ['B07', 1], ['B10', 1], ['B14', 1], ['X05', 2], ['N03', 2], ['B13', 1], ['N10', 1], ['B11', 1], ['D06', 2],
      ]),
    },
  };

  L.HEROES.boss_trainer = {
    id: 'boss_trainer', kind: 'boss', bossKey: 'trainer', layer: 0, startDepth: 0,
    name: '训练模拟体', short: '模拟体', title: '外勤训练', code: 'LMN-T01', klass: '训练用',
    persona: 'balanced', hp: 30,
    intro: '收容站用来训练新人的模拟体。它不会真的伤害你。大概不会。',
    portrait: { seed: 404, body: 'agent', pal: ['#cfd8dc', '#3a4448', '#f4f8f8'], prop: 'seal' },
    power: { name: '待机', cost: 99, text: '训练模拟体不会使用技能。', canUse: () => false, fx: () => {} },
    lines: { intro: ['训练开始。'], turn: ['……'], hurt: ['记录：受到伤害。'], low: ['记录：耐久不足。'], big: ['……'], defeat: ['训练结束。干得好。'], victory: ['再来一次。'], fourth: ['……'], night: ['……'] },
    deck: Array(20).fill('N01'),
  };
  L.AGENTS = ['agent_shen', 'agent_tang', 'agent_man'];
  L.BOSSES = ['boss_manager', 'boss_lifeguard', 'boss_broadcast'];

  L.PRESETS = [
    {
      id: 'pre_site', preset: true, name: '静滞协议', faction: 'site',
      desc: '收容站预组：冻结、嘲讽与收容。先让一切停下来，再决定谁留下。',
      cards: rep([
        ['N02', 2], ['N03', 1], ['N04', 1], ['S01', 2], ['S02', 2], ['S03', 2], ['S04', 1], ['S05', 2], ['S06', 2], ['S07', 1], ['S08', 2], ['S09', 2], ['S10', 2], ['S11', 1], ['S13', 2], ['S14', 2], ['S16', 1], ['S17', 1], ['S18', 1],
      ]),
    },
    {
      id: 'pre_level', preset: true, name: '无尽走廊', faction: 'level',
      desc: '后室层级预组：场地、潜行与剧毒。在黑暗里等待，然后从墙里出来。',
      cards: rep([
        ['B01', 2], ['B02', 1], ['B03', 2], ['B04', 1], ['B06', 1], ['B07', 2], ['B08', 1], ['B09', 1], ['B10', 1], ['B11', 1], ['B13', 1], ['B14', 2], ['B15', 2], ['B16', 1], ['B17', 1], ['B18', 1], ['N04', 2], ['N02', 2], ['N05', 2], ['N07', 1], ['N09', 2],
      ]),
    },
    {
      id: 'pre_dream', preset: true, name: '午后回响', faction: 'dream',
      desc: '梦核预组：复制、偷取与回响。把对手的牌变成你的回忆。',
      cards: rep([
        ['D01', 2], ['D04', 2], ['D05', 2], ['D06', 2], ['D07', 1], ['D08', 2], ['D10', 1], ['D11', 2], ['D12', 2], ['D13', 1], ['D14', 1], ['D17', 1], ['N02', 1], ['N04', 2], ['N05', 1], ['N06', 2], ['N07', 2], ['N08', 1], ['N09', 2],
      ]),
    },
  ];

  // deck legality
  L.validateDeck = function (cards, unlockedBossCards) {
    const errs = [];
    if (cards.length !== L.C.DECK_SIZE) errs.push('卡组需要正好 ' + L.C.DECK_SIZE + ' 张牌（当前 ' + cards.length + ' 张）。');
    const count = {};
    for (const id of cards) {
      const d = L.CARDS[id];
      if (!d || d.token) { errs.push('无效卡牌：' + id); continue; }
      if (d.boss && !(unlockedBossCards || []).includes(id)) errs.push(d.name + ' 尚未解锁。');
      count[id] = (count[id] || 0) + 1;
    }
    for (const id in count) {
      const d = L.CARDS[id];
      const max = d.rarity === 'legendary' ? 1 : 2;
      if (count[id] > max) errs.push(d.name + ' 最多携带 ' + max + ' 张。');
    }
    return errs;
  };
})();
