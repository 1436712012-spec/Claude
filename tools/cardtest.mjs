// Scripted rules tests: one scenario per card plus the cross-cutting mechanics.
// usage: node tools/cardtest.mjs
import { loadEngine } from './load.mjs';

const L = loadEngine();
const E = L.E;
const tests = [];
const t = (name, fn) => tests.push({ name, fn });
class Fail extends Error {}
function ok(cond, msg) { if (!cond) throw new Fail(msg); }
function eq(a, b, msg) { if (a !== b) throw new Fail(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ------------------------------------------------------------ scenario helpers
function mk(o = {}) {
  const fill = (cid, n) => Array.from({ length: n }, () => cid);
  const G = E.newGame({
    seed: o.seed || 7,
    depth: o.depth || 0,
    first: 0,
    players: [
      { hero: o.hero0 || 'agent_shen', deck: o.deck0 || fill('N04', 12) },
      { hero: o.hero1 || 'agent_tang', deck: o.deck1 || fill('N01', 12) },
    ],
  });
  G.phase = 'play';
  G.active = 0;
  G.turn = 5;
  for (const p of G.players) { p.hand = []; p.mana = p.maxMana = 10; p.sanity = 10; }
  G.drift = 0;
  return G;
}
const P = (G, pid) => G.players[pid];
function hand(G, pid, cid, extra) { const ci = E.mkCard(G, cid, extra); P(G, pid).hand.push(ci); return ci; }
function put(G, pid, cid, over) { const m = E.summon(G, pid, cid); m.sick = false; if (over) Object.assign(m, over); return m; }
function play(G, ci, opts, pid = 0) { const r = E.play(G, pid, ci.uid, opts || {}); ok(r, `play ${ci.cid} failed`); return r; }
function attack(G, a, tgt, pid = 0) { const r = E.attack(G, pid, a.uid, tgt.uid); ok(r, 'attack failed'); return r; }
const onBoard = (G, pid, cid) => P(G, pid).board.filter((m) => m.cid === cid);
// simulate the opponent's turn passing without actions
function passTurn(G) { E.endTurn(G, G.active); }

// ============================================================ SITE
t('S01 夜班巡逻员: taunt 1/2, battlecry armor 1', () => { const G = mk(); play(G, hand(G, 0, 'S01')); const m = onBoard(G, 0, 'S01')[0]; ok(m.kw.taunt, 'taunt'); eq(m.atk + '/' + m.hp, '1/2', 'stats'); eq(P(G, 0).armor, 1, 'armor'); });
t('S02 低温收容柜: freezes minions that damage it, not spells', () => {
  const G = mk(); const box = put(G, 0, 'S02'); G.active = 1; const foe = put(G, 1, 'N05'); foe.sick = false;
  attack(G, foe, box, 1); ok(foe.frozen, 'attacker frozen');
  G.active = 0; const G2 = mk(); const b2 = put(G2, 0, 'S02'); G2.active = 1; P(G2, 1).hand = []; play(G2, hand(G2, 1, 'N07'), { target: b2.uid }, 1); ok(!P(G2, 1).board.some((m) => m.frozen), 'no freeze from spells');
});
t('S03 收容专员: battlecry freezes an enemy minion', () => { const G = mk(); const f = put(G, 1, 'N04'); play(G, hand(G, 0, 'S03'), { target: f.uid }); ok(f.frozen, 'frozen'); });
t('S04 隔离门: 2/5 taunt', () => { const G = mk(); play(G, hand(G, 0, 'S04')); const m = onBoard(G, 0, 'S04')[0]; ok(m.kw.taunt && m.atk === 2 && m.hp === 5, 'stats'); });
t('S05 警报红灯: +1 attack when an enemy minion is frozen', () => { const G = mk(); const s = put(G, 0, 'S05'); const f = put(G, 1, 'N04'); const own = put(G, 0, 'N01'); E.freeze(G, own.uid); eq(s.atk, 2, 'own freeze ignored'); play(G, hand(G, 0, 'S06'), { target: f.uid }); eq(s.atk, 3, 'buffed'); });
t('S06 冻结指令: freeze enemy minion and draw', () => { const G = mk(); const f = put(G, 1, 'N04'); play(G, hand(G, 0, 'S06'), { target: f.uid }); ok(f.frozen, 'frozen'); eq(P(G, 0).hand.length, 1, 'drew'); });
t('S07 加固墙体: 5 armor, draw', () => { const G = mk(); play(G, hand(G, 0, 'S07')); eq(P(G, 0).armor, 5, 'armor'); eq(P(G, 0).hand.length, 1, 'drew'); });
t('S08 警戒线: +1/+2 and taunt', () => { const G = mk(); const m = put(G, 0, 'N01'); play(G, hand(G, 0, 'S08'), { target: m.uid }); ok(m.atk === 3 && m.hp === 3 && m.kw.taunt, 'buffed'); });
t('S09 防暴盾手: 2 armor whenever damaged', () => { const G = mk(); const s = put(G, 0, 'S09'); play(G, hand(G, 0, 'N07'), { target: s.uid }); eq(P(G, 0).armor, 2, 'armor'); });
t('S10 档案调阅员: draws a contained card, else 2 armor', () => {
  const G = mk(); const f = put(G, 1, 'N03'); E.contain(G, 0, f); P(G, 0).deck.push(...P(G, 0).deck.splice(0, 3)); // bury it
  play(G, hand(G, 0, 'S10')); ok(P(G, 0).hand.some((c) => c.breach), 'drew contained'); eq(P(G, 0).armor, 0, 'no armor');
  const G2 = mk(); play(G2, hand(G2, 0, 'S10')); eq(P(G2, 0).armor, 2, 'armor fallback');
});
t('S11 收容程序: contain any enemy minion, no deathrattle, into top 3 with countdown 3', () => {
  const G = mk(); const f = put(G, 1, 'N02'); const h0 = P(G, 1).hand.length; play(G, hand(G, 0, 'S11'), { target: f.uid });
  eq(P(G, 1).board.length, 0, 'removed'); eq(P(G, 1).hand.length, h0, 'no deathrattle draw');
  const idx = P(G, 0).deck.findIndex((c) => c.breach); ok(idx >= 0 && idx < 3, 'in top 3'); eq(P(G, 0).deck[idx].breach.turns, 3, 'countdown');
});
t('S12 加固协议: countdowns +2, draw', () => { const G = mk(); const f = put(G, 1, 'N01'); E.contain(G, 0, f); play(G, hand(G, 0, 'S12')); const all = P(G, 0).deck.concat(P(G, 0).hand); eq(all.find((c) => c.breach).breach.turns, 5, 'countdown'); eq(P(G, 0).hand.length, 1 + (P(G, 0).hand.some((c) => c.breach) ? 0 : 0), 'drew'); });
t('S13 全区降温: 2 damage to all enemy minions, freeze; ⟁2 sinks the dream', () => {
  const G = mk(); const a = put(G, 1, 'N04'), b = put(G, 1, 'N01'), mine = put(G, 0, 'N04'); play(G, hand(G, 0, 'S13'));
  eq(a.hp, 3, 'damaged'); ok(a.frozen, 'frozen'); ok(!E.onBoard(G, b), 'killed'); eq(mine.hp, 5, 'own untouched'); eq(P(G, 0).sanity, 8, 'sanity'); eq(G.depth, 2, 'depth');
});
t('S14 收容小队: contain an enemy with attack ≤3 only', () => {
  const G = mk(); const big = put(G, 1, 'N05'), small = put(G, 1, 'N04'); const ci = hand(G, 0, 'S14');
  const tg = E.cardTargets(G, 0, ci.uid); ok(tg.includes(small.uid) && !tg.includes(big.uid), 'targets'); play(G, ci, { target: small.uid }); ok(!E.onBoard(G, small), 'contained');
});
t('S15 锁链拘束: contain a frozen enemy only', () => { const G = mk(); const f = put(G, 1, 'N05'); const ci = hand(G, 0, 'S15'); ok(!E.canPlay(G, 0, ci.uid), 'needs frozen'); E.freeze(G, f.uid); play(G, ci, { target: f.uid }); ok(!E.onBoard(G, f), 'contained'); eq(P(G, 0).sanity, 9, 'sanity'); });
t('S16 不眠哨兵: freezes enemy minions after they attack', () => { const G = mk(); put(G, 0, 'S16'); G.active = 1; const f = put(G, 1, 'N05'); attack(G, f, P(G, 0).board[0], 1); ok(f.frozen, 'frozen'); });
t('S17 镜七: contains all enemy minions with attack ≤2 (stealthed too)', () => {
  const G = mk(); const a = put(G, 1, 'N01'), b = put(G, 1, 'B01'), c = put(G, 1, 'N04'); play(G, hand(G, 0, 'S17'));
  ok(!E.onBoard(G, a) && !E.onBoard(G, b), 'contained'); ok(E.onBoard(G, c), 'attack 3 stays'); eq(P(G, 0).deck.filter((x) => x.breach).length, 2, 'two contained');
});
t('S18 冰封档案库: freezes the highest-attack enemy at your turn end', () => { const G = mk(); put(G, 0, 'S18'); const a = put(G, 1, 'N05'), b = put(G, 1, 'N01'); passTurn(G); ok(a.frozen && !b.frozen, 'froze highest'); });

// ============================================================ LEVELS
t('B01 墙缝之手: stealth + poison kills anything it damages', () => { const G = mk(); const h = put(G, 0, 'B01'); ok(h.kw.stealth, 'stealth'); const big = put(G, 1, 'N09'); attack(G, h, big); ok(!E.onBoard(G, big), 'poisoned'); });
t('B02 迷路的同事: deathrattle sends a random enemy into limbo', () => { const G = mk(); const s = put(G, 0, 'B02'); ok(s.kw.stealth && s.hp === 3, 'stats'); const f = put(G, 1, 'N04'); E.destroy(G, s); E.resolve(G); ok(!E.onBoard(G, f) && G.limbo.length === 1, 'limbo'); });
t('B03 数灯管的人: +1/+1 and draw only if a field is in play', () => { const G = mk(); play(G, hand(G, 0, 'B03')); const m = onBoard(G, 0, 'B03')[0]; eq(m.atk + '/' + m.hp, '3/4', 'no field'); const G2 = mk(); E.setField(G2, 1, 'B10'); play(G2, hand(G2, 0, 'B03')); const m2 = onBoard(G2, 0, 'B03')[0]; eq(m2.atk + '/' + m2.hp, '4/5', 'with field'); eq(P(G2, 0).hand.length, 1, 'drew'); });
t('B04 无面清洁工: others stealthed until your next turn', () => { const G = mk(); const o = put(G, 0, 'N04'); play(G, hand(G, 0, 'B04')); ok(o.kw.stealth && !onBoard(G, 0, 'B04')[0].kw.stealth, 'stealth others'); passTurn(G); ok(o.kw.stealth, 'still during enemy turn'); passTurn(G); ok(!o.kw.stealth, 'gone at my turn'); });
t('B04 keeps permanent stealth intact', () => { const G = mk(); const s = put(G, 0, 'B05'); play(G, hand(G, 0, 'B04')); passTurn(G); passTurn(G); ok(s.kw.stealth, 'permanent stealth kept'); });
t('B05 暗处的眼睛: ambush adds 2 damage when attacking from stealth', () => { const G = mk(); const e = put(G, 0, 'B05'); const f = put(G, 1, 'N09'); attack(G, e, f); eq(f.hp, 1, '3+2 damage'); ok(!e.kw.stealth, 'lost stealth'); });
t('B06 切出: bounce enemy minion, cost +2', () => { const G = mk(); const f = put(G, 1, 'N05'); play(G, hand(G, 0, 'B06'), { target: f.uid }); const ci = P(G, 1).hand.find((c) => c.cid === 'N05'); ok(ci && E.costOf(G, P(G, 1), ci) === 7, 'cost 7'); });
t('B07 熄灯: give stealth, draw', () => { const G = mk(); const m = put(G, 0, 'N04'); play(G, hand(G, 0, 'B07'), { target: m.uid }); ok(m.kw.stealth, 'stealth'); eq(P(G, 0).hand.length, 1, 'drew'); });
t('B08 坠入夹层: limbo until owner next turn end, draw', () => {
  const G = mk(); const f = put(G, 1, 'N04'); play(G, hand(G, 0, 'B08'), { target: f.uid }); ok(!E.onBoard(G, f), 'gone'); eq(P(G, 0).hand.length, 1, 'drew');
  passTurn(G); ok(!E.onBoard(G, f), 'away for its owner turn'); passTurn(G); ok(E.onBoard(G, f), 'back at end of owner turn');
});
t('B08 own minion returns at end of my next turn', () => { const G = mk(); const m = put(G, 0, 'N04'); play(G, hand(G, 0, 'B08'), { target: m.uid }); passTurn(G); passTurn(G); ok(!E.onBoard(G, m), 'still away until my next turn ends'); passTurn(G); ok(E.onBoard(G, m), 'back'); });
t('B09 无限办公室: at your turn end a non-stealthed friendly gains stealth', () => { const G = mk(); const m = put(G, 0, 'N04'); play(G, hand(G, 0, 'B09')); passTurn(G); ok(m.kw.stealth, 'stealth'); });
t('B10 排风管道: your stealthed minions +2 attack', () => { const G = mk(); const s = put(G, 0, 'B05'), n = put(G, 0, 'N04'); const es = put(G, 1, 'B05'); play(G, hand(G, 0, 'B10')); eq(E.atkOf(G, s), 5, 'stealthed +2'); eq(E.atkOf(G, n), 3, 'normal'); eq(E.atkOf(G, es), 3, 'enemy unaffected'); });
t('B11 熄灯的停车场: each turn end, 1 damage to non-stealthed minions', () => { const G = mk(); const a = put(G, 0, 'N04'), s = put(G, 0, 'B05'), f = put(G, 1, 'N04'); play(G, hand(G, 0, 'B11')); passTurn(G); eq(a.hp, 4, 'mine'); eq(f.hp, 4, 'theirs'); eq(s.hp, 3, 'stealth safe'); passTurn(G); eq(f.hp, 3, 'every turn'); });
t('B12 电梯间: summons a 1/1 stealth shadow at your turn end', () => { const G = mk(); play(G, hand(G, 0, 'B12')); passTurn(G); const s = onBoard(G, 0, 'T_SHADOW'); ok(s.length === 1 && s[0].kw.stealth, 'shadow'); });
t('B13 长腿的门: battlecry limbo enemy', () => { const G = mk(); const f = put(G, 1, 'N04'); play(G, hand(G, 0, 'B13'), { target: f.uid }); ok(!E.onBoard(G, f) && G.limbo.length, 'limbo'); });
t('B14 穿墙者: rush, ambush doubles damage', () => { const G = mk(); play(G, hand(G, 0, 'B14')); const w = onBoard(G, 0, 'B14')[0]; const f = put(G, 1, 'N09'); ok(E.attackTargets(G, w.uid).includes(f.uid) && !E.attackTargets(G, w.uid).includes(P(G, 1).uid), 'rush targets'); attack(G, w, f); ok(!E.onBoard(G, f), '8 damage'); });
t('B15 游荡的猎手: grows while stealthed at turn end', () => { const G = mk(); const h = put(G, 0, 'B15'); passTurn(G); eq(h.atk + '/' + h.hp, '4/4', 'grew'); h.kw.stealth = false; passTurn(G); passTurn(G); eq(h.atk, 4, 'no growth without stealth'); });
t('B16 荧光过载: 3 damage to all non-stealthed minions', () => { const G = mk(); const a = put(G, 0, 'N09'), s = put(G, 0, 'B05'), f = put(G, 1, 'N09'); play(G, hand(G, 0, 'B16')); eq(a.hp, 3, 'mine hit'); eq(f.hp, 3, 'theirs hit'); eq(s.hp, 3, 'stealth safe'); });
t('B17 无面之王: other stealthed friendlies have poison', () => { const G = mk(); const s = put(G, 0, 'B15'), n = put(G, 0, 'N04'); put(G, 0, 'B17'); ok(E.hasPoison(G, s) && !E.hasPoison(G, n), 'aura'); const f = put(G, 1, 'N09'); attack(G, s, f); ok(!E.onBoard(G, f), 'poison kill'); });
t('B18 出口标志: summons a minion from your deck with stealth', () => { const G = mk(); const d0 = P(G, 0).deck.length; play(G, hand(G, 0, 'B18')); passTurn(G); const m = onBoard(G, 0, 'N04'); ok(m.length === 1 && m[0].kw.stealth, 'pulled'); eq(P(G, 0).deck.length, d0 - 1 - 0, 'deck shrank'); });

// ============================================================ DREAMCORE
t('D01 肥皂泡: divine shield, echo leaves a faded copy', () => { const G = mk(); play(G, hand(G, 0, 'D01')); ok(onBoard(G, 0, 'D01')[0].kw.divine, 'divine'); const c = P(G, 0).hand.find((x) => x.cid === 'D01'); ok(c && c.echo && c.fade === 1, 'echo copy'); play(G, c); ok(!P(G, 0).hand.some((x) => x.cid === 'D01'), 'copy does not echo'); });
t('D02 旧电视机: copies a card from the enemy hand', () => { const G = mk(); hand(G, 1, 'S07'); play(G, hand(G, 0, 'D02')); ok(P(G, 0).hand.some((c) => c.cid === 'S07'), 'copied'); eq(P(G, 1).hand.length, 1, 'enemy kept it'); });
t('D03 午睡的下午: draw 2; fading randomizes after 3 turns with cost -1', () => {
  const G = mk(); play(G, hand(G, 0, 'D03')); eq(P(G, 0).hand.length, 2, 'drew 2');
  const G2 = mk(); const ci = hand(G2, 0, 'D03'); for (let i = 0; i < 3; i++) { passTurn(G2); passTurn(G2); } eq(ci.fade, 3, 'faded'); eq(E.costOf(G2, P(G2, 0), ci), 2, 'cost -1');
  G2.rec = true; G2.events = []; play(G2, ci); ok(G2.events.some((e) => e.type === 'fadefx'), 'random effect');
});
t('D04 彩虹拖影: 2 damage, echo', () => { const G = mk(); play(G, hand(G, 0, 'D04'), { target: P(G, 1).uid }); eq(P(G, 1).hp, 28, 'damage'); ok(P(G, 0).hand.some((c) => c.cid === 'D04' && c.echo), 'echo'); });
t('D05 漂浮泳圈: deathrattle gives a random friendly divine shield', () => { const G = mk(); const r = put(G, 0, 'D05'); const o = put(G, 0, 'N04'); E.destroy(G, r); E.resolve(G); ok(o.kw.divine, 'divine'); });
t('D06 小时候的玩伴: 2/1 echo', () => { const G = mk(); play(G, hand(G, 0, 'D06')); ok(P(G, 0).hand.some((c) => c.cid === 'D06' && c.echo), 'echo'); });
t('D07 温柔的光晕: heal hero 4 and 2 sanity', () => { const G = mk(); P(G, 0).hp = 20; P(G, 0).sanity = 5; play(G, hand(G, 0, 'D07')); eq(P(G, 0).hp, 24, 'healed'); eq(P(G, 0).sanity, 7, 'sanity'); });
t('D08 梦里的小偷: steals a random card', () => { const G = mk(); hand(G, 1, 'S07'); play(G, hand(G, 0, 'D08')); ok(P(G, 0).hand.some((c) => c.cid === 'S07'), 'stolen'); eq(P(G, 1).hand.length, 0, 'gone from enemy'); });
t('D09 镜中人: becomes a copy of a minion', () => { const G = mk(); const f = put(G, 1, 'N09'); play(G, hand(G, 0, 'D09'), { target: f.uid }); const m = P(G, 0).board[0]; eq(m.cid, 'N09', 'copied'); eq(m.atk + '/' + m.hp, '5/6', 'stats'); });
t('D10 回声录像带: copy opponent last card at -1, else draw', () => { const G = mk(); P(G, 1).last = 'S07'; play(G, hand(G, 0, 'D10')); const c = P(G, 0).hand.find((x) => x.cid === 'S07'); ok(c && E.costOf(G, P(G, 0), c) === 2, 'copy -1'); const G2 = mk(); play(G2, hand(G2, 0, 'D10')); eq(P(G2, 0).hand.length, 1, 'drew'); });
t('D11 梦游者: battlecry draw, fades', () => { const G = mk(); play(G, hand(G, 0, 'D11')); eq(P(G, 0).hand.length, 1, 'drew'); ok(L.CARDS.D11.fade, 'fade keyword'); });
t('D12 彩虹桥: all friendlies +1/+1 and divine', () => { const G = mk(); const a = put(G, 0, 'N01'), b = put(G, 0, 'N04'); play(G, hand(G, 0, 'D12')); ok(a.atk === 3 && a.hp === 2 && a.kw.divine && b.kw.divine, 'buffed'); eq(P(G, 0).sanity, 8, 'sanity'); });
t('D13 无尽的午后: three 2/2 playmates', () => { const G = mk(); play(G, hand(G, 0, 'D13')); eq(onBoard(G, 0, 'T_PLAYMATE').length, 3, 'three'); });
t('D14 另一个我: copies two cards from enemy hand', () => { const G = mk(); hand(G, 1, 'S07'); hand(G, 1, 'S06'); hand(G, 1, 'N01'); play(G, hand(G, 0, 'D14')); eq(P(G, 0).hand.length, 2, 'two copies'); eq(P(G, 1).hand.length, 3, 'enemy keeps'); });
t('D15 借走的星星: take the top card of the enemy deck', () => { const G = mk(); const top = P(G, 1).deck[0]; const n = P(G, 1).deck.length; play(G, hand(G, 0, 'D15')); ok(P(G, 0).hand.includes(top), 'mine now'); eq(P(G, 1).deck.length, n - 1, 'removed'); });
t('D16 泡泡机: shields a random friendly without divine at turn end', () => { const G = mk(); const m = put(G, 0, 'N04'); const b = put(G, 0, 'D16'); passTurn(G); ok(m.kw.divine || b.kw.divine, 'one shielded'); });
t('D17 不会醒的孩子: deathrattle takes control of a random enemy', () => { const G = mk(); const c = put(G, 0, 'D17'); const f = put(G, 1, 'N04'); E.destroy(G, c); E.resolve(G); eq(f.owner, 0, 'controlled'); ok(P(G, 0).board.includes(f), 'moved'); });
t('D18 记录员 · 禾: copies top 2 of enemy deck, they fade', () => { const G = mk(); const n = P(G, 1).deck.length; const top = P(G, 1).deck.slice(0, 2).map((c) => c.cid); play(G, hand(G, 0, 'D18')); const got = P(G, 0).hand.filter((c) => c.fz); eq(got.length, 2, 'two'); eq(got.map((c) => c.cid).join(), top.join(), 'same cards'); eq(P(G, 1).deck.length, n, 'enemy deck intact'); });

// ============================================================ NEUTRAL
t('N01 日光灯飞虫: 2/1', () => { const G = mk(); play(G, hand(G, 0, 'N01')); eq(onBoard(G, 0, 'N01')[0].atk, 2, 'atk'); });
t('N02 自动贩卖机: deathrattle draw', () => { const G = mk(); const v = put(G, 0, 'N02'); E.destroy(G, v); E.resolve(G); eq(P(G, 0).hand.length, 1, 'drew'); });
t('N03 失眠者: ⟁1 4/4', () => { const G = mk(); play(G, hand(G, 0, 'N03')); eq(P(G, 0).sanity, 9, 'sanity'); eq(G.depth, 1, 'depth'); });
t('N04 堆积的纸箱: 3/5 taunt', () => { const G = mk(); play(G, hand(G, 0, 'N04')); ok(onBoard(G, 0, 'N04')[0].kw.taunt, 'taunt'); });
t('N05 手电筒保安: 2 damage to an enemy minion', () => { const G = mk(); const f = put(G, 1, 'N04'); play(G, hand(G, 0, 'N05'), { target: f.uid }); eq(f.hp, 3, 'damaged'); });
t('N06 失物招领处: adds a non-neutral faction card', () => { const G = mk(); play(G, hand(G, 0, 'N06')); const c = P(G, 0).hand[0]; ok(c && L.CARDS[c.cid].faction !== 'neutral' && L.CARDS[c.cid].collectible, 'faction card'); });
t('N07 走失广播: 3 damage, depth +2', () => { const G = mk(); play(G, hand(G, 0, 'N07'), { target: P(G, 1).uid }); eq(P(G, 1).hp, 27, 'damage'); eq(G.depth, 2, 'depth'); });
t('N08 下沉之钟: depth +4', () => { const G = mk(); play(G, hand(G, 0, 'N08')); eq(G.depth, 4, 'depth'); });
t('N09 楼梯间回声: 2 damage to a random enemy at your turn end', () => { const G = mk(); put(G, 0, 'N09'); passTurn(G); const P1 = P(G, 1); ok(P1.hp === 28, 'hit hero (only enemy)'); });
t('N10 那台电视: sinks one layer; at the bottom, 3 damage to all other minions', () => {
  const G = mk(); play(G, hand(G, 0, 'N10')); eq(G.layer, 1, 'layer 1'); eq(G.depth, L.C.DEPTH_T[0], 'depth set');
  const G2 = mk({ depth: 30 }); const a = put(G2, 1, 'N09'), b = put(G2, 0, 'N04'); play(G2, hand(G2, 0, 'N10')); eq(a.hp, 3, 'enemy hit'); eq(b.hp, 2, 'own hit'); eq(onBoard(G2, 0, 'N10')[0].hp, 6, 'self spared');
});

// ============================================================ GATEKEEPER CARDS & TOKENS
t('X01 管理员的钥匙串: freeze target + adjacent, 1 damage each', () => { const G = mk(); const a = put(G, 1, 'N04'), b = put(G, 1, 'N04'), c = put(G, 1, 'N04'), d = put(G, 1, 'N04'); play(G, hand(G, 0, 'X01'), { target: b.uid }); ok(a.frozen && b.frozen && c.frozen && !d.frozen, 'freeze'); ok(a.hp === 4 && b.hp === 4 && c.hp === 4 && d.hp === 5, 'damage'); });
t('X02 清洁推车: heals friendly minions 1 at your turn end', () => { const G = mk(); const m = put(G, 0, 'N04'); m.hp = 2; put(G, 0, 'X02'); passTurn(G); eq(m.hp, 3, 'healed'); });
t('X03 救生圈: divine + heal 2', () => { const G = mk(); const m = put(G, 0, 'N04'); m.hp = 1; play(G, hand(G, 0, 'X03'), { target: m.uid }); ok(m.kw.divine && m.hp === 3, 'ok'); });
t('X04 浅水区: heals all friendly characters 1 at your turn end', () => { const G = mk(); P(G, 0).hp = 20; const m = put(G, 0, 'N04'); m.hp = 2; play(G, hand(G, 0, 'X04')); passTurn(G); eq(P(G, 0).hp, 21, 'hero'); eq(m.hp, 3, 'minion'); });
t('X05 闭店音乐: 4 damage split among enemies, depth +2', () => { const G = mk(); play(G, hand(G, 0, 'X05')); eq(P(G, 1).hp, 26, 'all to hero'); eq(G.depth, 3, 'depth (+1 sanity, +2 card)'); });
t('X06 请尽快离开: charge', () => { const G = mk(); play(G, hand(G, 0, 'X06')); const m = onBoard(G, 0, 'X06')[0]; ok(E.attackTargets(G, m.uid).includes(P(G, 1).uid), 'can hit face'); });
t('T_COIN 旧硬币: +1 mana this turn', () => { const G = mk(); P(G, 0).mana = 3; play(G, hand(G, 0, 'T_COIN')); eq(P(G, 0).mana, 4, 'mana'); });

// ============================================================ MECHANICS
t('turn start: mana +1, sanity +1 (cap 10), draw', () => { const G = mk(); P(G, 1).maxMana = 3; P(G, 1).sanity = 4; passTurn(G); eq(P(G, 1).maxMana, 4, 'mana'); eq(P(G, 1).sanity, 5, 'sanity'); eq(P(G, 1).hand.length, 1, 'drew'); });
t('sanity 0: 2 damage at turn start, then regen', () => { const G = mk(); P(G, 1).sanity = 0; passTurn(G); eq(P(G, 1).hp, 28, 'collapse'); eq(P(G, 1).sanity, 1, 'regen'); });
t('shaken: fake cards appear at ≤3 sanity, do nothing, vanish when sane', () => {
  const G = mk(); P(G, 1).sanity = 2; passTurn(G); const fake = P(G, 1).hand.find((c) => c.fake); ok(fake && P(G, 1).shaken, 'fake added');
  P(G, 1).mana = 10; const m0 = P(G, 1).mana; const cost = E.costOf(G, P(G, 1), fake); const b0 = P(G, 1).board.length;
  ok(E.play(G, 1, fake.uid, {}), 'playable'); eq(P(G, 1).mana, m0 - cost, 'mana spent'); eq(P(G, 1).board.length, b0, 'no effect');
  P(G, 1).sanity = 9; const f2 = E.makeFake(G, 1); passTurn(G); passTurn(G); ok(!P(G, 1).hand.includes(f2), 'vanished');
});
t('fatigue increments', () => { const G = mk(); P(G, 1).deck = []; passTurn(G); eq(P(G, 1).hp, 29, '1'); passTurn(G); passTurn(G); eq(P(G, 1).hp, 27, '2'); });
t('hand limit: 11th card is burned', () => { const G = mk(); for (let i = 0; i < 10; i++) hand(G, 1, 'N01'); const d = P(G, 1).deck.length; passTurn(G); eq(P(G, 1).hand.length, 10, 'still 10'); eq(P(G, 1).deck.length, d - 1, 'burned'); });
t('board limit: no 8th minion', () => { const G = mk(); for (let i = 0; i < 7; i++) put(G, 0, 'N01'); ok(!E.canPlay(G, 0, hand(G, 0, 'N01').uid), 'blocked'); });
t('taunt forces attacks', () => { const G = mk(); const a = put(G, 0, 'N05'); const tt = put(G, 1, 'N04'); put(G, 1, 'N01'); const tg = E.attackTargets(G, a.uid); eq(tg.join(), String(tt.uid), 'only taunt'); });
t('stealth: untargetable by enemies, targetable by owner', () => { const G = mk(); const s = put(G, 1, 'B05'); const ci = hand(G, 0, 'N07'); ok(!E.cardTargets(G, 0, ci.uid).includes(s.uid), 'hidden'); G.active = 1; const c2 = hand(G, 1, 'B07'); ok(E.cardTargets(G, 1, c2.uid).includes(s.uid), 'owner can'); });
t('divine shield absorbs poison', () => { const G = mk(); const h = put(G, 0, 'B01'); const d = put(G, 1, 'N04', {}); d.kw.divine = true; attack(G, h, d); ok(E.onBoard(G, d) && !d.kw.divine, 'survived'); });
t('freeze timing: frozen on enemy turn misses the next attack, then thaws', () => { const G = mk(); const m = put(G, 1, 'N05'); E.freeze(G, m.uid); passTurn(G); ok(!E.canAttack(G, m.uid), 'cannot attack'); passTurn(G); ok(!m.frozen, 'thawed'); });
t('rush vs charge on the summoning turn', () => { const G = mk(); play(G, hand(G, 0, 'X06')); const c = onBoard(G, 0, 'X06')[0]; ok(E.canAttack(G, c.uid), 'charge'); const G2 = mk(); play(G2, hand(G2, 0, 'B14')); const r = onBoard(G2, 0, 'B14')[0]; ok(!E.attackTargets(G2, r.uid).includes(P(G2, 1).uid), 'rush no face'); });
t('layer thresholds and irreversibility', () => { const G = mk(); E.addDepth(G, L.C.DEPTH_T[0]); E.checkLayer(G); eq(G.layer, 1, 'L1'); E.addDepth(G, L.C.DEPTH_T[1] - L.C.DEPTH_T[0]); E.checkLayer(G); eq(G.layer, 2, 'L2'); });
t('layer 1: healing doubled', () => { const G = mk({ depth: 13 }); P(G, 0).hp = 10; play(G, hand(G, 0, 'D07')); eq(P(G, 0).hp, 18, 'x2'); });
t('layer 1: attackers sometimes drift to an adjacent slot', () => { let moved = 0; for (let s = 1; s <= 30; s++) { const G = mk({ depth: 13, seed: s }); put(G, 0, 'N04'); const a = put(G, 0, 'N09'); put(G, 0, 'N04'); const f = put(G, 1, 'N01'); attack(G, a, P(G, 1)); if (P(G, 0).board.indexOf(a) !== 1) moved++; } ok(moved > 5 && moved < 25, 'about half: ' + moved); });
t('layer 2: +1 attack and end-turn sweep of the weakest', () => { const G = mk({ depth: 27 }); const a = put(G, 0, 'N04'); const w = put(G, 1, 'N01'); eq(E.atkOf(G, a), 4, '+1'); passTurn(G); ok(!E.onBoard(G, w), 'weakest swept'); });
t('breach: an unplayed contained card escapes after 3 of the container\'s turns', () => { const G = mk(); const f = put(G, 1, 'N05'); E.contain(G, 0, f); P(G, 0).deck.push(...P(G, 0).deck.splice(0, 3)); for (let i = 0; i < 3; i++) { passTurn(G); passTurn(G); } ok(P(G, 1).board.some((m) => m.cid === 'N05' && m.breached), 'breached back to owner'); });
t('breach: playing the contained card in time makes it yours', () => { const G = mk(); const f = put(G, 1, 'N05'); E.contain(G, 0, f); const ci = P(G, 0).deck.find((c) => c.breach); P(G, 0).deck.splice(P(G, 0).deck.indexOf(ci), 1); P(G, 0).hand.push(ci); play(G, ci); ok(onBoard(G, 0, 'N05').length === 1, 'mine'); for (let i = 0; i < 4; i++) passTurn(G); eq(onBoard(G, 1, 'N05').length, 0, 'never breaches'); });
t('closing time at the bottom of the dream', () => { const G = mk({ depth: L.C.DEPTH_MAX }); passTurn(G); eq(P(G, 0).hp, 29, '1'); passTurn(G); eq(P(G, 1).hp, 28, '2'); });
t('sanity cost requires enough sanity', () => { const G = mk(); P(G, 0).sanity = 1; ok(!E.canPlay(G, 0, hand(G, 0, 'S13').uid), 'blocked'); });
t('limbo return waits for space', () => { const G = mk(); const m = put(G, 1, 'N04'); E.limbo(G, m); for (let i = 0; i < 7; i++) put(G, 1, 'N01'); passTurn(G); ok(!E.onBoard(G, m), 'waits'); });
t('mulligan keeps hand size', () => { const G = E.newGame({ seed: 3, players: [{ hero: 'agent_shen', deck: L.PRESETS[0].cards }, { hero: 'agent_tang', deck: L.PRESETS[1].cards }] }); const n = G.players[0].hand.length; E.mulligan(G, 0, G.players[0].hand.map((c) => c.uid)); eq(G.players[0].hand.length, n, 'size'); eq(G.players[0].deck.length + n, 30, 'conserved'); });
t('second player gets the coin', () => { const G = E.newGame({ seed: 3, first: 0, players: [{ hero: 'agent_shen', deck: L.PRESETS[0].cards }, { hero: 'agent_tang', deck: L.PRESETS[1].cards }] }); E.begin(G); ok(G.players[1].hand.some((c) => c.cid === 'T_COIN'), 'coin'); eq(G.players[1].hand.length, 5, '4 + coin'); });
t('hero powers', () => {
  const G = mk(); P(G, 0).sanity = 5; E.heroPower(G, 0, null); eq(P(G, 0).armor, 2, 'shen armor'); eq(P(G, 0).sanity, 6, 'shen sanity'); ok(!E.canHeroPower(G, 0), 'once');
  const G2 = mk({ hero0: 'agent_tang' }); E.heroPower(G2, 0, P(G2, 1).uid); eq(P(G2, 1).hp, 29, 'tang ping');
  const G3 = mk({ hero0: 'agent_man' }); E.heroPower(G3, 0, null); eq(P(G3, 0).hand.length, 1, 'man draws'); eq(P(G3, 0).sanity, 9, 'man sanity');
  const G4 = mk({ hero0: 'boss_manager' }); const f = put(G4, 1, 'N05'); E.heroPower(G4, 0, f.uid); ok(f.frozen, 'lock freeze'); P(G4, 0).hpUsed = false; E.heroPower(G4, 0, f.uid); eq(f.hp, 2, 'lock 3 dmg');
  const G5 = mk({ hero0: 'boss_lifeguard' }); const m = put(G5, 0, 'N04'); m.hp = 1; E.heroPower(G5, 0, m.uid); ok(m.hp === 4 && m.atk === 4, 'whistle');
  const G6 = mk({ hero0: 'boss_broadcast' }); E.heroPower(G6, 0, null); eq(P(G6, 1).hp, 28, 'broadcast'); eq(G6.depth, 1, 'depth');
});
t('every collectible card has text, lore and art', () => { for (const id of L.COLLECTIBLE.concat(L.BOSS_CARDS)) { const d = L.CARDS[id]; ok(d.lore && d.lore.t && d.art && d.code, id); } eq(L.COLLECTIBLE.length, 64, '64 collectible'); });
t('faction counts', () => { const c = {}; for (const id of L.COLLECTIBLE) c[L.CARDS[id].faction] = (c[L.CARDS[id].faction] || 0) + 1; eq(JSON.stringify(c), JSON.stringify({ site: 18, level: 18, dream: 18, neutral: 10 }), 'counts'); });
t('AI returns a legal decision on a busy board', () => { const G = mk(); for (let i = 0; i < 4; i++) { put(G, 0, 'N04'); put(G, 1, 'N05'); } hand(G, 0, 'S13'); hand(G, 0, 'N07'); const a = L.AI.decide(G, 0, 'balanced', {}); ok(a && a.t, 'decision'); if (a.t !== 'end') ok(L.AI.apply(E.cloneForSim(G), 0, a), 'legal'); });

// ------------------------------------------------------------ run
let pass = 0, fail = 0;
for (const x of tests) {
  try { x.fn(); pass++; }
  catch (e) { fail++; console.log('✗', x.name, '\n   ', e instanceof Fail ? e.message : e.stack); }
}
console.log(`\n${pass} passed, ${fail} failed (${tests.length} tests)`);
if (fail) process.exitCode = 1;
