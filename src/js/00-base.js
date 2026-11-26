/* LIMINAL · base namespace, constants, rng, clone */
(function () {
  'use strict';
  const L = (globalThis.LMN = globalThis.LMN || {});

  L.C = {
    MAX_BOARD: 7,
    MAX_HAND: 10,
    MAX_MANA: 10,
    MAX_SAN: 10,
    HERO_HP: 30,
    HP_COST: 2,
    DECK_SIZE: 30,
    BREACH_TURNS: 3,
    // dream depth thresholds to enter layer 1 and layer 2
    DEPTH_T: [12, 26],
    DEPTH_MAX: 34,
  };

  L.LAYERS = [
    { id: 0, name: '黄墙走廊', en: 'THE YELLOW HALL', rule: '无特殊规则。日光灯在嗡鸣。' },
    { id: 1, name: '无人泳池', en: 'THE EMPTY POOL', rule: '所有治疗翻倍。随从攻击后有 50% 几率漂移到相邻位置。' },
    { id: 2, name: '深夜商场', en: 'THE MALL AFTER CLOSING', rule: '所有随从 +1 攻击。每个回合结束时，随机摧毁一个生命值最低的随从。', closing: '梦深见底后进入闭店时间：每个回合结束时，当前玩家受到递增的伤害。' },
  ];

  L.FACTIONS = {
    site: { id: 'site', name: '收容站', en: 'SITE', color: '#9ff3ff' },
    level: { id: 'level', name: '后室层级', en: 'LEVELS', color: '#f2d64b' },
    dream: { id: 'dream', name: '梦核', en: 'DREAMCORE', color: '#ffb3e6' },
    neutral: { id: 'neutral', name: '中立', en: 'NEUTRAL', color: '#d8d2c4' },
  };

  L.RARITY = {
    common: { id: 'common', name: '普通', order: 0 },
    rare: { id: 'rare', name: '稀有', order: 1 },
    epic: { id: 'epic', name: '史诗', order: 2 },
    legendary: { id: 'legendary', name: '传说', order: 3 },
  };

  L.KEYWORDS = {
    taunt: { name: '嘲讽', desc: '敌人必须先攻击具有嘲讽的随从。' },
    charge: { name: '冲锋', desc: '可以在召唤的回合立即攻击。' },
    rush: { name: '突袭', desc: '可以在召唤的回合攻击随从（不能攻击英雄）。' },
    battlecry: { name: '战吼', desc: '从手牌中打出时产生效果。' },
    deathrattle: { name: '亡语', desc: '死亡时产生效果。' },
    divine: { name: '圣盾', desc: '抵挡下一次受到的伤害。' },
    stealth: { name: '潜行', desc: '在攻击之前，无法被敌人攻击或选为目标。' },
    poison: { name: '剧毒', desc: '消灭任何受到此随从伤害的随从。' },
    freeze: { name: '冻结', desc: '被冻结的随从会失去下一次攻击。' },
    contain: { name: '收容', desc: '消灭一个敌方随从（不触发亡语），将其洗入你牌库顶部 3 张牌中，附带 3 回合突破倒计时。倒计时归零前打出它，它就为你而战；否则它会在敌方场上突破复活。' },
    fade: { name: '褪色', desc: '在手牌中每多留一回合，牌面就有一个词变得模糊。3 回合后效果随机化，但法力值消耗减少 1 点。' },
    echo: { name: '回响', desc: '打出后，在你的手牌中留下一张褪色的复制。' },
    anomaly: { name: '⟁异常', desc: '除了法力值，还需要额外支付理智。消耗的理智会推高梦深。' },
    ambush: { name: '暗袭', desc: '在潜行状态下发起攻击时触发额外效果。' },
    limbo: { name: '坠入夹层', desc: '将随从移出战场，在其拥有者的下个回合结束时回到场上。' },
    field: { name: '场地', desc: '占据场地槽位，持续改变规则。新的场地会替换旧的场地。' },
  };

  // ---------- RNG (mulberry32, state lives in G.rng) ----------
  function rand(G) {
    let t = (G.rng = (G.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function ri(G, n) {
    return Math.floor(rand(G) * n);
  }
  function pick(G, arr) {
    return arr && arr.length ? arr[ri(G, arr.length)] : null;
  }
  function shuffle(G, a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = ri(G, i + 1);
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  // fast deep clone for plain data (arrays / objects / primitives)
  function clone(o) {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) {
      const n = o.length;
      const r = new Array(n);
      for (let i = 0; i < n; i++) r[i] = clone(o[i]);
      return r;
    }
    const r = {};
    for (const k in o) r[k] = clone(o[k]);
    return r;
  }

  // simple seeded hash for deterministic visuals
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function seeded(seed) {
    const S = { rng: seed | 0 || 7 };
    const f = () => rand(S);
    f.int = (n) => Math.floor(f() * n);
    f.range = (a, b) => a + (b - a) * f();
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.chance = (p) => f() < p;
    return f;
  }

  L.U = { rand, ri, pick, shuffle, clone, hash, seeded, clamp: (v, a, b) => Math.max(a, Math.min(b, v)) };
})();
