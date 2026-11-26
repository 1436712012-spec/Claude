/* LIMINAL · AI — greedy one-ply search over simulated clones, persona-weighted, with lethal detection */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const E = L.E;
  const C = L.C;

  const PERSONAS = {
    balanced: { self: 1.0, face: 1.0, board: 1.0, threat: 1.05, hand: 0.9, san: 0.7, depth: 0, field: 2.5, taunt: 1.0, freezeV: 0.6, heal: 1.0 },
    // 管理员：优先解场，爱用嘲讽
    control: { self: 1.15, face: 0.55, board: 1.0, threat: 1.45, hand: 1.1, san: 0.7, depth: -0.05, field: 2.5, taunt: 2.0, freezeV: 0.9, heal: 1.0 },
    // 救生员：靠治疗与场面拖长对局
    tempo: { self: 1.35, face: 0.8, board: 1.3, threat: 1.1, hand: 0.8, san: 0.6, depth: 0.1, field: 3.0, taunt: 1.2, freezeV: 0.6, heal: 1.4 },
    // 闭店广播：狂暴打脸，主动推高梦深
    aggro: { self: 0.6, face: 1.75, board: 0.95, threat: 0.75, hand: 0.6, san: 0.35, depth: 0.45, field: 2.0, taunt: 0.6, freezeV: 0.4, heal: 0.6 },
  };
  const AI = (L.AI = { PERSONAS });

  function heroScore(h) {
    if (h <= 0) return -400;
    let s = h;
    if (h < 15) s -= (15 - h) * 0.6;
    if (h < 8) s -= (8 - h) * 1.2;
    return s;
  }

  function minionValue(G, m, W, mine) {
    const atk = E.atkOf(G, m);
    const hp = Math.max(0, m.hp);
    if (hp <= 0 || m.dead) return 0;
    const d = E.def(m.cid);
    let v = 1.2 + atk * 1.05 + hp * 0.85 + Math.sqrt(atk * hp) * 0.55;
    if (m.kw.taunt) v += mine ? 1.0 * W.taunt : 1.2;
    if (m.kw.divine) v += 0.8 + atk * 0.55;
    if (m.kw.stealth) v += 0.8 + atk * 0.3;
    if (E.hasPoison(G, m)) v += 2.2;
    if (m.kw.windfury) v += atk * 0.8;
    if (m.frozen) v -= atk * (mine ? 0.5 : 0.55 * (1 + W.freezeV));
    if (!m.silenced) {
      if (d.on) v += 1.6 + (d.aiValue || 0);
      if (d.dr) v += 1.2;
      if (d.auraAtk || d.auraPoison) v += 2.0;
    }
    if (m.breached) v += 0.3;
    return v;
  }

  function boardValue(G, pid, W, mine) {
    let s = 0;
    const b = E.P(G, pid).board;
    for (const m of b) s += minionValue(G, m, W, mine);
    return s;
  }

  function potentialDamage(G, pid) {
    // what pid's board could hit next turn (ignores taunt soaks)
    let s = 0;
    for (const m of E.P(G, pid).board) {
      if (m.hp <= 0 || m.dead) continue;
      const a = E.atkOf(G, m);
      if (m.frozen && m.thawAt > G.turn + 1) continue;
      s += a * (m.kw.windfury ? 2 : 1);
    }
    return s;
  }

  function sanScore(s) {
    if (s <= 0) return -9;
    if (s <= 3) return -4 + s * 0.6;
    return Math.min(s, 7) * 0.25;
  }

  AI.evaluate = function (G, pid, W) {
    if (G.over) return G.winner === pid ? 1e5 : G.winner === -1 ? -4e4 : -1e5;
    const me = E.P(G, pid),
      op = E.P(G, 1 - pid);
    let s = 0;
    s += heroScore(me.hp + me.armor) * W.self;
    s -= heroScore(op.hp + op.armor) * W.face;
    s += boardValue(G, pid, W, true) * W.board;
    s -= boardValue(G, 1 - pid, W, false) * W.threat;
    s += Math.min(me.hand.filter((c) => !c.fake).length, 9) * W.hand;
    s -= Math.min(op.hand.length, 9) * W.hand * 0.4;
    s += sanScore(me.sanity) * W.san;
    s -= sanScore(op.sanity) * W.san * 0.4;
    s += G.depth * W.depth;
    if (G.field) s += (G.field.owner === pid ? 1 : -1) * W.field;
    // danger: can the opponent kill me next turn?
    const myTaunt = me.board.filter((m) => m.kw.taunt && m.hp > 0 && !m.dead).reduce((a, m) => a + m.hp, 0);
    const incoming = potentialDamage(G, 1 - pid);
    const eff = me.hp + me.armor;
    const over = incoming - myTaunt * 0.5 - eff;
    if (over >= 0) s -= (18 + over * 2.5) * W.self;
    else if (incoming >= eff * 0.6) s -= 4 * W.self * (incoming / Math.max(1, eff));
    // contained cards waiting in my deck are latent value, breaches looming in opponent's are a threat
    for (const ci of me.deck) if (ci.breach) s += 0.6;
    for (const ci of me.hand) if (ci.breach) s += 1.2;
    return s;
  };

  // ------------------------------------------------------------ actions
  AI.legalActions = function (G, pid, opts) {
    const acts = [];
    const p = E.P(G, pid);
    const fooled = opts && opts.fooled;
    for (const ci of p.hand) {
      if (!E.canPlay(G, pid, ci.uid)) continue;
      if (ci.fake) {
        if (fooled) acts.push({ t: 'play', uid: ci.uid, fake: true });
        continue;
      }
      const d = E.def(ci.cid);
      const tg = d.tgt ? E.cardTargets(G, pid, ci.uid) : [];
      const targets = tg.length ? tg : [null];
      const positions = d.type === 'minion' ? (p.board.length > 0 && d.posMatters ? [0, p.board.length] : [p.board.length]) : [null];
      for (const t of targets) for (const pos of positions) acts.push({ t: 'play', uid: ci.uid, target: t, pos });
    }
    for (const m of p.board) {
      if (!E.canAttack(G, m.uid)) continue;
      for (const t of E.attackTargets(G, m.uid)) acts.push({ t: 'atk', a: m.uid, target: t });
    }
    if (E.canHeroPower(G, pid)) {
      const hp = E.heroPowerInfo(G, pid);
      if (hp.tgt) for (const t of E.heroPowerTargets(G, pid)) acts.push({ t: 'hp', target: t });
      else acts.push({ t: 'hp', target: null });
    }
    return acts;
  };

  AI.apply = function (G, pid, a) {
    if (a.t === 'play') return E.play(G, pid, a.uid, { target: a.target, pos: a.pos });
    if (a.t === 'atk') return E.attack(G, pid, a.a, a.target);
    if (a.t === 'hp') return E.heroPower(G, pid, a.target);
    if (a.t === 'end') return E.endTurn(G, pid);
    return false;
  };

  function scoreAction(G, pid, a, W, samples) {
    let total = 0;
    for (let k = 0; k < samples; k++) {
      const g = E.cloneForSim(G);
      g.rng = (g.rng + k * 7919) | 0;
      if (!AI.apply(g, pid, a)) return -Infinity;
      total += AI.evaluate(g, pid, W);
    }
    return total / samples;
  }

  // greedy face-plan: tries to find a kill this turn
  function lethalPlan(G, pid) {
    const op = E.P(G, 1 - pid);
    const eff = op.hp + op.armor;
    // cheap bound: all attack + up to 10 burn
    let bound = 0;
    for (const m of E.P(G, pid).board) if (E.canAttack(G, m.uid)) bound += E.atkOf(G, m) * (m.kw.windfury ? 2 : 1);
    bound += E.P(G, pid).mana * 2 + 4;
    if (bound < eff) return null;
    const W = { self: 0.05, face: 12, board: 0.05, threat: 0.6, hand: 0, san: 0, depth: 0, field: 0, taunt: 0, freezeV: 0, heal: 0 };
    let g = E.cloneForSim(G);
    const plan = [];
    for (let step = 0; step < 24; step++) {
      if (g.over) break;
      const acts = AI.legalActions(g, pid);
      if (!acts.length) break;
      let best = null,
        bestS = AI.evaluate(g, pid, W) + 0.01;
      for (const a of acts) {
        const s = scoreAction(g, pid, a, W, 1);
        if (s > bestS) { bestS = s; best = a; }
      }
      if (!best) break;
      AI.apply(g, pid, best);
      plan.push(best);
    }
    if (g.over && g.winner === pid) return plan;
    return null;
  }

  // per-turn memo so a found lethal line is followed without recomputation
  AI.decide = function (G, pid, personaName, memo) {
    const W = PERSONAS[personaName] || PERSONAS.balanced;
    memo = memo || {};
    if (memo.turn !== G.turn) {
      memo.turn = G.turn;
      memo.plan = null;
      memo.steps = 0;
      const p = E.P(G, pid);
      memo.fooled = p.shaken && p.hand.some((c) => c.fake) && E.U_rand(G) < 0.3;
    }
    memo.steps++;
    if (memo.steps > 40) return { t: 'end' };

    // follow a lethal plan if it is still valid
    if (memo.plan && memo.plan.length) {
      const a = memo.plan[0];
      const g = E.cloneForSim(G);
      if (AI.apply(g, pid, a)) {
        memo.plan.shift();
        return a;
      }
      memo.plan = null;
    }
    const lp = lethalPlan(G, pid);
    if (lp && lp.length) {
      memo.plan = lp.slice(1);
      return lp[0];
    }

    // a confused gatekeeper sometimes plays a card that never existed
    if (memo.fooled) {
      memo.fooled = false;
      const fake = E.P(G, pid).hand.find((c) => c.fake && E.canPlay(G, pid, c.uid));
      if (fake) return { t: 'play', uid: fake.uid, fake: true };
    }

    const acts = AI.legalActions(G, pid);
    if (!acts.length) return { t: 'end' };
    const base = AI.evaluate(G, pid, W);
    let best = null,
      bestS = base + 0.25;
    for (const a of acts) {
      const d = a.t === 'play' ? E.def(E.P(G, pid).hand.find((c) => c.uid === a.uid).cid) : null;
      const samples = d && d.random ? 3 : 1;
      let s = scoreAction(G, pid, a, W, samples);
      // prefer spending mana efficiently: tiny tempo nudge for plays
      if (a.t === 'play' && d) s += Math.min(d.cost, 10) * 0.08;
      // contained cards about to breach should be played
      if (a.t === 'play') {
        const ci = E.P(G, pid).hand.find((c) => c.uid === a.uid);
        if (ci && ci.breach) s += 2.5;
      }
      if (s > bestS) { bestS = s; best = a; }
    }
    return best || { t: 'end' };
  };

  AI.mulligan = function (G, pid) {
    const p = E.P(G, pid);
    return p.hand.filter((ci) => E.def(ci.cid).cost >= 4).map((ci) => ci.uid);
  };

  // headless full turn (used by simulations / auto-play)
  AI.playTurn = function (G, pid, persona) {
    const memo = {};
    for (let i = 0; i < 45 && !G.over && G.active === pid; i++) {
      const a = AI.decide(G, pid, persona, memo);
      if (a.t === 'end') break;
      if (!AI.apply(G, pid, a)) break;
    }
    if (!G.over && G.active === pid) E.endTurn(G, pid);
  };

  E.U_rand = (G) => L.U.rand(G);
})();
