/* LIMINAL · rules engine (pure data, deterministic, DOM-free) */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const C = L.C;
  const { rand, ri, pick, shuffle, clone } = L.U;

  const E = (L.E = {});

  // ------------------------------------------------------------------
  // lookups
  // ------------------------------------------------------------------
  const def = (cid) => L.CARDS[cid];
  const P = (G, pid) => G.players[pid];
  const opp = (pid) => 1 - pid;
  E.def = def;
  E.P = P;

  function isHero(t) {
    return !!(t && t.isHero);
  }
  function char(G, uid) {
    if (uid == null) return null;
    const a = G.players[0],
      b = G.players[1];
    if (a.uid === uid) return a;
    if (b.uid === uid) return b;
    for (let i = 0; i < a.board.length; i++) if (a.board[i].uid === uid) return a.board[i];
    for (let i = 0; i < b.board.length; i++) if (b.board[i].uid === uid) return b.board[i];
    return null;
  }
  function onBoard(G, m) {
    return !!m && !isHero(m) && P(G, m.owner).board.indexOf(m) >= 0;
  }
  function alive(G, m) {
    return onBoard(G, m) && m.hp > 0 && !m.dead;
  }
  function ownerOf(G, t) {
    return isHero(t) ? t.pid : t.owner;
  }
  function allMinions(G) {
    const first = G.players[G.active].board,
      second = G.players[opp(G.active)].board;
    return first.concat(second);
  }
  E.char = char;
  E.isHero = isHero;
  E.alive = alive;
  E.onBoard = onBoard;
  E.allMinions = allMinions;
  E.ownerOf = ownerOf;

  // ------------------------------------------------------------------
  // events & snapshots
  // ------------------------------------------------------------------
  function emit(G, type, data) {
    if (!G.rec) return;
    const ev = data || {};
    ev.type = type;
    ev.bid = G.bid || 0;
    ev.snap = snapshot(G);
    G.events.push(ev);
  }
  E.emit = emit;

  function group(G, fn) {
    if (G.bid) return fn();
    G.bid = ++G.batch;
    try {
      return fn();
    } finally {
      G.bid = 0;
    }
  }
  E.group = group;

  function snapMinion(G, m) {
    const d = def(m.cid);
    return {
      uid: m.uid,
      cid: m.cid,
      owner: m.owner,
      atk: atkOf(G, m),
      hp: m.hp,
      maxHp: m.maxHp,
      baseAtk: d.atk,
      baseHp: d.hp,
      kw: Object.assign({}, m.kw, { poison: hasPoison(G, m) }),
      frozen: m.frozen,
      sick: m.sick,
      canAttack: G.active === m.owner && canAttackM(G, m),
      silenced: m.silenced,
      dr: !m.silenced && (!!d.dr || m.dr.length > 0),
      trig: !m.silenced && !!(d.on || d.auraAtk || d.auraPoison),
      breached: !!m.breached,
    };
  }
  function snapCard(G, p, ci) {
    return {
      uid: ci.uid,
      cid: ci.cid,
      cost: costOf(G, p, ci),
      san: sanOf(ci),
      fade: ci.fade || 0,
      echo: !!ci.echo,
      fz: !!(ci.fz || ci.echo || def(ci.cid).fade),
      fake: ci.fake ? Object.assign({}, ci.fake) : null,
      breach: ci.breach ? ci.breach.turns : 0,
      gen: ci.gen || null,
    };
  }
  function snapshot(G) {
    return {
      turn: G.turn,
      active: G.active,
      depth: G.depth,
      layer: G.layer,
      over: G.over,
      winner: G.winner,
      field: G.field ? Object.assign({}, G.field) : null,
      limbo: G.limbo.map((e) => ({ uid: e.m.uid, cid: e.m.cid, owner: e.owner })),
      p: G.players.map((p) => ({
        pid: p.pid,
        uid: p.uid,
        hero: p.hero,
        hp: p.hp,
        maxHp: p.maxHp,
        armor: p.armor,
        mana: p.mana,
        maxMana: p.maxMana,
        sanity: p.sanity,
        maxSan: p.maxSan,
        shaken: p.shaken,
        deckN: p.deck.length,
        breachInDeck: p.deck.filter((c) => c.breach).map((c) => ({ cid: c.cid, turns: c.breach.turns })),
        hand: p.hand.map((ci) => snapCard(G, p, ci)),
        board: p.board.map((m) => snapMinion(G, m)),
        hpUsed: p.hpUsed,
        fatigue: p.fatigue,
      })),
    };
  }
  E.snapshot = snapshot;

  // ------------------------------------------------------------------
  // stats helpers
  // ------------------------------------------------------------------
  function atkOf(G, m) {
    let a = m.atk;
    if (G.layer === 2) a += 1;
    if (G.field) {
      const fd = def(G.field.cid);
      if (fd.auraAtk) a += fd.auraAtk(G, G.field, m) || 0;
    }
    for (let s = 0; s < 2; s++) {
      const b = G.players[s].board;
      for (let i = 0; i < b.length; i++) {
        const src = b[i];
        if (src === m || src.silenced) continue;
        const d = def(src.cid);
        if (d.auraAtk) a += d.auraAtk(G, src, m) || 0;
      }
    }
    return Math.max(0, a);
  }
  function hasPoison(G, m) {
    if (m.kw.poison) return true;
    const b = P(G, m.owner).board;
    for (let i = 0; i < b.length; i++) {
      const src = b[i];
      if (src === m || src.silenced) continue;
      const d = def(src.cid);
      if (d.auraPoison && d.auraPoison(G, src, m)) return true;
    }
    return false;
  }
  function costOf(G, p, ci) {
    const d = def(ci.cid);
    let c = d.cost + (ci.costMod || 0);
    return Math.max(0, c);
  }
  function sanOf(ci) {
    return def(ci.cid).san || 0;
  }
  E.atkOf = atkOf;
  E.hasPoison = hasPoison;
  E.costOf = costOf;
  E.sanOf = sanOf;
  function layerFor(depth) {
    let l = 0;
    while (l < 2 && depth >= C.DEPTH_T[l]) l++;
    return l;
  }
  E.layerFor = layerFor;

  // ------------------------------------------------------------------
  // creation
  // ------------------------------------------------------------------
  function mkCard(G, cid, extra) {
    const ci = { uid: G.uid++, cid, costMod: 0, fade: 0 };
    if (extra) Object.assign(ci, extra);
    return ci;
  }
  E.mkCard = mkCard;

  function mkPlayer(G, pid, cfg) {
    const h = L.HEROES[cfg.hero];
    const p = {
      isHero: true,
      pid,
      uid: pid + 1,
      name: cfg.name || h.name,
      hero: cfg.hero,
      hp: cfg.hp || h.hp || C.HERO_HP,
      maxHp: cfg.hp || h.hp || C.HERO_HP,
      armor: 0,
      mana: 0,
      maxMana: 0,
      sanity: C.MAX_SAN,
      maxSan: C.MAX_SAN,
      deck: [],
      hand: [],
      board: [],
      fatigue: 0,
      hpUsed: false,
      spentSan: 0,
      played: 0,
      last: null,
      ai: !!cfg.ai,
      shaken: false,
      stats: { dmg: 0, played: 0, kills: 0, san: 0, healed: 0, contained: 0, breaches: 0, cids: {} },
    };
    p.deck = (cfg.deck || []).map((cid) => mkCard(G, cid));
    return p;
  }

  E.newGame = function (opt) {
    const G = {
      rng: opt.seed >>> 0 || 1,
      uid: 3,
      turn: 0,
      active: 0,
      first: 0,
      depth: opt.depth || 0,
      layer: 0,
      field: null,
      limbo: [],
      over: false,
      winner: null,
      rec: !!opt.rec,
      events: [],
      batch: 0,
      bid: 0,
      phase: 'mulligan',
      drift: opt.drift == null ? 1 : opt.drift,
      deepest: 0,
      layerAt: [0, 0, 0],
      meta: opt.meta || {},
    };
    G.layer = layerFor(G.depth);
    G.deepest = G.layer;
    G.players = [mkPlayer(G, 0, opt.players[0]), mkPlayer(G, 1, opt.players[1])];
    for (const p of G.players) shuffle(G, p.deck);
    G.first = opt.first == null ? ri(G, 2) : opt.first;
    G.active = G.first;
    // opening hands
    const fp = P(G, G.first),
      sp = P(G, opp(G.first));
    for (let i = 0; i < 3; i++) fp.hand.push(fp.deck.shift());
    for (let i = 0; i < 4; i++) sp.hand.push(sp.deck.shift());
    return G;
  };

  E.mulligan = function (G, pid, uids) {
    const p = P(G, pid);
    const back = [];
    p.hand = p.hand.map((ci) => {
      if (uids.indexOf(ci.uid) >= 0 && p.deck.length) {
        back.push(ci);
        return p.deck.shift();
      }
      return ci;
    });
    for (const ci of back) p.deck.splice(ri(G, p.deck.length + 1), 0, ci);
  };

  E.begin = function (G) {
    const sp = P(G, opp(G.first));
    sp.hand.push(mkCard(G, 'T_COIN'));
    G.phase = 'play';
    startTurn(G);
  };

  // ------------------------------------------------------------------
  // targeting
  // ------------------------------------------------------------------
  function targetPool(G, pid, spec) {
    const me = P(G, pid),
      en = P(G, opp(pid));
    const visEnemy = en.board.filter((m) => !m.kw.stealth && !m.dead && m.hp > 0);
    const mine = me.board.filter((m) => !m.dead && m.hp > 0);
    switch (spec) {
      case 'any':
        return [me, en].concat(mine, visEnemy);
      case 'minion':
        return mine.concat(visEnemy);
      case 'enemyMinion':
        return visEnemy;
      case 'friendlyMinion':
        return mine;
      case 'enemy':
        return [en].concat(visEnemy);
      case 'friendly':
        return [me].concat(mine);
      default:
        return [];
    }
  }
  function validTargets(G, pid, spec, cond, ctx) {
    if (!spec) return [];
    let pool = targetPool(G, pid, spec);
    if (ctx && ctx.selfUid) pool = pool.filter((t) => t.uid !== ctx.selfUid);
    if (cond) pool = pool.filter((t) => cond(G, t, ctx || { p: pid }));
    return pool.map((t) => t.uid);
  }
  E.validTargets = validTargets;

  E.cardTargets = function (G, pid, uid) {
    const p = P(G, pid);
    const ci = p.hand.find((c) => c.uid === uid);
    if (!ci) return [];
    const d = def(ci.cid);
    if (!d.tgt) return [];
    return validTargets(G, pid, d.tgt, d.tgtCond, { p: pid, card: ci });
  };
  E.cardNeedsTarget = function (G, pid, uid) {
    return E.cardTargets(G, pid, uid).length > 0;
  };

  // ------------------------------------------------------------------
  // play legality
  // ------------------------------------------------------------------
  E.canPlay = function (G, pid, uid) {
    if (G.over || G.phase !== 'play' || G.active !== pid) return false;
    const p = P(G, pid);
    const ci = p.hand.find((c) => c.uid === uid);
    if (!ci) return false;
    const d = def(ci.cid);
    if (costOf(G, p, ci) > p.mana) return false;
    if (sanOf(ci) > p.sanity) return false;
    if (d.type === 'minion' && p.board.length >= C.MAX_BOARD) return false;
    if (ci.fake) return true;
    if (d.type === 'spell' && d.tgt && !d.tgtOptional) {
      if (validTargets(G, pid, d.tgt, d.tgtCond, { p: pid, card: ci }).length === 0) return false;
    }
    if (d.playable && !d.playable(G, { p: pid, card: ci })) return false;
    return true;
  };

  // ------------------------------------------------------------------
  // core mutations
  // ------------------------------------------------------------------
  function freshMinion(G, pid, cid, uid) {
    const d = def(cid);
    const kw = {};
    if (d.kw) for (const k of d.kw) kw[k] = true;
    return {
      uid: uid || G.uid++,
      cid,
      owner: pid,
      atk: d.atk,
      hp: d.hp,
      maxHp: d.hp,
      kw,
      frozen: false,
      thawAt: 0,
      sick: true,
      attacks: 0,
      silenced: false,
      dr: [],
      dead: false,
      tempStealth: false,
      born: G.turn,
    };
  }

  function summon(G, pid, cid, pos, opts) {
    const p = P(G, pid);
    if (p.board.length >= C.MAX_BOARD) return null;
    const m = freshMinion(G, pid, cid, opts && opts.uid);
    if (pos == null || pos > p.board.length) pos = p.board.length;
    if (pos < 0) pos = 0;
    p.board.splice(pos, 0, m);
    emit(G, 'summon', { pid, uid: m.uid, cid, pos, how: (opts && opts.how) || 'summon' });
    fire(G, 'summon', { m });
    return m;
  }
  E.summon = summon;

  function damage(G, srcUid, tgtUid, n, kind) {
    const t = char(G, tgtUid);
    if (!t || n <= 0) return 0;
    if (isHero(t)) {
      let rem = n;
      if (t.armor > 0) {
        const a = Math.min(t.armor, rem);
        t.armor -= a;
        rem -= a;
      }
      t.hp -= rem;
      const s = char(G, srcUid);
      const so = s ? ownerOf(G, s) : null;
      if (so != null && so !== t.pid) P(G, so).stats.dmg += n;
      emit(G, 'damage', { target: t.uid, amount: n, src: srcUid, kind: kind || 'effect', hero: true, pid: t.pid });
      return n;
    }
    if (!onBoard(G, t) || t.dead) return 0;
    if (t.kw.divine) {
      t.kw.divine = false;
      emit(G, 'shield', { uid: t.uid });
      return 0;
    }
    t.hp -= n;
    const s = char(G, srcUid);
    let poisoned = false;
    if (s && !isHero(s) && hasPoison(G, s)) {
      t.dead = true;
      poisoned = true;
    }
    emit(G, 'damage', { target: t.uid, amount: n, src: srcUid, kind: kind || 'effect', poison: poisoned });
    fire(G, 'damaged', { t, src: srcUid, amount: n });
    return n;
  }
  E.damage = damage;

  function heal(G, srcUid, tgtUid, n) {
    const t = char(G, tgtUid);
    if (!t || n <= 0) return 0;
    if (G.layer === 1) n *= 2;
    const amt = Math.min(n, t.maxHp - t.hp);
    if (amt <= 0) return 0;
    t.hp += amt;
    const s = char(G, srcUid);
    if (s) P(G, ownerOf(G, s)).stats.healed += amt;
    emit(G, 'heal', { target: t.uid, amount: amt, doubled: G.layer === 1 });
    fire(G, 'healed', { t, amount: amt });
    return amt;
  }
  E.heal = heal;

  function armor(G, pid, n) {
    const p = P(G, pid);
    p.armor += n;
    emit(G, 'armor', { pid, amount: n });
  }
  E.armor = armor;

  function freeze(G, uid) {
    const t = char(G, uid);
    if (!t || isHero(t) || !onBoard(G, t)) return;
    t.frozen = true;
    t.thawAt = t.owner === G.active ? G.turn + 2 : G.turn + 1;
    emit(G, 'freeze', { uid });
    fire(G, 'frozen', { t });
  }
  E.freeze = freeze;

  function destroy(G, m, how) {
    if (!m || isHero(m)) return;
    m.dead = true;
    if (how) m.deathHow = how;
  }
  E.destroy = destroy;

  function buff(G, m, a, h) {
    if (!m) return;
    m.atk += a;
    m.maxHp += h;
    m.hp += h;
    emit(G, 'buff', { uid: m.uid, atk: a, hp: h });
  }
  E.buff = buff;

  function giveKw(G, m, k, temp) {
    if (!m) return;
    if (k === 'stealth') {
      if (temp) {
        if (!m.kw.stealth) m.tempStealth = true;
      } else m.tempStealth = false;
    }
    m.kw[k] = true;
    emit(G, 'kw', { uid: m.uid, kw: k });
  }
  E.giveKw = giveKw;

  function silence(G, m, quiet) {
    const d = def(m.cid);
    m.silenced = true;
    m.kw = {};
    m.dr = [];
    m.frozen = false;
    m.atk = d.atk;
    m.maxHp = d.hp;
    m.hp = Math.min(m.hp, m.maxHp);
    if (!quiet) emit(G, 'silence', { uid: m.uid });
  }
  E.silence = silence;

  function draw(G, pid, n, opts) {
    const p = P(G, pid);
    const got = [];
    for (let i = 0; i < (n || 1); i++) {
      if (!p.deck.length) {
        p.fatigue++;
        emit(G, 'fatigue', { pid, n: p.fatigue });
        damage(G, null, p.uid, p.fatigue, 'fatigue');
        continue;
      }
      const ci = p.deck.shift();
      if (p.hand.length >= C.MAX_HAND) {
        emit(G, 'burn', { pid, cid: ci.cid, uid: ci.uid });
        continue;
      }
      p.hand.push(ci);
      got.push(ci);
      emit(G, 'draw', { pid, uid: ci.uid, cid: ci.cid, breach: !!ci.breach });
    }
    return got;
  }
  E.draw = draw;

  function drawWhere(G, pid, pred) {
    const p = P(G, pid);
    const idx = p.deck.findIndex(pred);
    if (idx < 0) return null;
    const [ci] = p.deck.splice(idx, 1);
    if (p.hand.length >= C.MAX_HAND) {
      emit(G, 'burn', { pid, cid: ci.cid, uid: ci.uid });
      return null;
    }
    p.hand.push(ci);
    emit(G, 'draw', { pid, uid: ci.uid, cid: ci.cid, breach: !!ci.breach });
    return ci;
  }
  E.drawWhere = drawWhere;

  function addToHand(G, pid, cid, extra, how) {
    const p = P(G, pid);
    if (p.hand.length >= C.MAX_HAND) {
      emit(G, 'burn', { pid, cid });
      return null;
    }
    const ci = mkCard(G, cid, extra);
    p.hand.push(ci);
    emit(G, 'gain', { pid, uid: ci.uid, cid, how: how || 'gen' });
    return ci;
  }
  E.addToHand = addToHand;

  function gainSanity(G, pid, n) {
    const p = P(G, pid);
    const before = p.sanity;
    p.sanity = Math.min(p.maxSan, p.sanity + n);
    if (p.sanity !== before) emit(G, 'sanity', { pid, delta: p.sanity - before, value: p.sanity });
  }
  function loseSanity(G, pid, n, why) {
    const p = P(G, pid);
    const before = p.sanity;
    p.sanity = Math.max(0, p.sanity - n);
    const lost = before - p.sanity;
    if (lost > 0) {
      p.spentSan += lost;
      p.stats.san += lost;
      emit(G, 'sanity', { pid, delta: -lost, value: p.sanity, why: why || 'spend' });
      addDepth(G, lost, 'sanity');
    }
    return lost;
  }
  E.gainSanity = gainSanity;
  E.loseSanity = loseSanity;

  function addDepth(G, n, why) {
    if (n <= 0) return;
    G.depth = Math.min(C.DEPTH_MAX, G.depth + n);
    emit(G, 'depth', { value: G.depth, delta: n, why: why || 'card' });
  }
  E.addDepth = addDepth;

  function removeFromBoard(G, m) {
    const p = P(G, m.owner);
    const i = p.board.indexOf(m);
    if (i >= 0) p.board.splice(i, 1);
    return i;
  }

  // 【收容】
  function contain(G, byPid, m) {
    if (!m || isHero(m) || !onBoard(G, m)) return false;
    const owner = m.owner;
    removeFromBoard(G, m);
    const by = P(G, byPid);
    const ci = mkCard(G, m.cid, { breach: { turns: C.BREACH_TURNS, owner } });
    const span = Math.min(3, by.deck.length + 1);
    by.deck.splice(ri(G, span), 0, ci);
    by.stats.contained++;
    emit(G, 'contain', { uid: m.uid, cid: m.cid, owner, by: byPid, card: ci.uid });
    fire(G, 'contained', { m, by: byPid });
    return true;
  }
  E.contain = contain;

  function breach(G, holder, ci) {
    const h = P(G, holder);
    let i = h.deck.indexOf(ci);
    if (i >= 0) h.deck.splice(i, 1);
    else {
      i = h.hand.indexOf(ci);
      if (i >= 0) h.hand.splice(i, 1);
    }
    const to = ci.breach.owner;
    const target = P(G, to);
    if (target.board.length >= C.MAX_BOARD) {
      emit(G, 'breachfail', { cid: ci.cid, to, card: ci.uid });
      return null;
    }
    P(G, to).stats.breaches++;
    emit(G, 'alarm', { cid: ci.cid, to, card: ci.uid, from: holder });
    const m = summon(G, to, ci.cid, null, { how: 'breach' });
    if (m) m.breached = true;
    return m;
  }

  // 坠入夹层
  function limbo(G, m) {
    if (!m || !onBoard(G, m)) return false;
    removeFromBoard(G, m);
    const at = m.owner === G.active ? G.turn + 2 : G.turn + 1;
    m.frozen = false;
    m.tempStealth = false;
    G.limbo.push({ m, owner: m.owner, at });
    emit(G, 'limbo', { uid: m.uid, cid: m.cid, owner: m.owner });
    return true;
  }
  E.limbo = limbo;

  function bounce(G, m, costPlus) {
    if (!m || !onBoard(G, m)) return false;
    removeFromBoard(G, m);
    const p = P(G, m.owner);
    emit(G, 'bounce', { uid: m.uid, cid: m.cid, owner: m.owner });
    if (p.hand.length >= C.MAX_HAND) {
      emit(G, 'burn', { pid: m.owner, cid: m.cid });
      return true;
    }
    const ci = mkCard(G, m.cid, { costMod: costPlus || 0 });
    p.hand.push(ci);
    emit(G, 'gain', { pid: m.owner, uid: ci.uid, cid: m.cid, how: 'bounce' });
    return true;
  }
  E.bounce = bounce;

  function takeControl(G, pid, m) {
    if (!m || !onBoard(G, m) || m.owner === pid) return false;
    const p = P(G, pid);
    if (p.board.length >= C.MAX_BOARD) return false;
    const from = m.owner;
    removeFromBoard(G, m);
    m.owner = pid;
    m.sick = true;
    m.attacks = 0;
    p.board.push(m);
    emit(G, 'control', { uid: m.uid, from, to: pid });
    return true;
  }
  E.takeControl = takeControl;

  function transform(G, m, src) {
    m.cid = src.cid;
    m.atk = src.atk;
    m.maxHp = src.maxHp;
    m.hp = src.hp;
    m.kw = Object.assign({}, src.kw);
    m.dr = src.dr.slice();
    m.silenced = src.silenced;
    emit(G, 'transform', { uid: m.uid, cid: m.cid });
  }
  E.transform = transform;

  function setField(G, pid, cid, uid) {
    const old = G.field;
    G.field = { uid: uid || G.uid++, cid, owner: pid, since: G.turn };
    emit(G, 'field', { cid, owner: pid, replaced: old ? old.cid : null, oldOwner: old ? old.owner : null });
  }
  E.setField = setField;

  function moveMinion(G, m, toIdx) {
    const p = P(G, m.owner);
    const from = p.board.indexOf(m);
    if (from < 0) return;
    p.board.splice(from, 1);
    toIdx = Math.max(0, Math.min(p.board.length, toIdx));
    p.board.splice(toIdx, 0, m);
    emit(G, 'drift', { uid: m.uid, from, to: toIdx });
  }
  E.moveMinion = moveMinion;

  function stealCard(G, toPid, ci) {
    const from = P(G, opp(toPid)),
      to = P(G, toPid);
    const i = from.hand.indexOf(ci);
    if (i < 0) return null;
    from.hand.splice(i, 1);
    if (to.hand.length >= C.MAX_HAND) {
      emit(G, 'burn', { pid: toPid, cid: ci.cid });
      return null;
    }
    if (ci.breach && ci.breach.owner === toPid) ci.breach = null;
    to.hand.push(ci);
    emit(G, 'steal', { from: from.pid, to: toPid, uid: ci.uid, cid: ci.cid });
    return ci;
  }
  E.stealCard = stealCard;

  function copyCard(G, toPid, ci, extra) {
    const x = { fake: ci.fake ? Object.assign({}, ci.fake) : undefined };
    if (!x.fake) delete x.fake;
    if (extra) Object.assign(x, extra);
    const c = addToHand(G, toPid, ci.cid, x, 'copy');
    return c;
  }
  E.copyCard = copyCard;

  // ------------------------------------------------------------------
  // trigger dispatch
  // ------------------------------------------------------------------
  function fire(G, name, ev) {
    const order = [G.active, opp(G.active)];
    for (let k = 0; k < 2; k++) {
      const b = G.players[order[k]].board.slice();
      for (let i = 0; i < b.length; i++) {
        const m = b[i];
        if (m.silenced) continue;
        // a minion still reacts to the blow that kills it
        if ((m.dead || m.hp <= 0) && !(name === 'damaged' && ev && ev.t === m)) continue;
        const d = def(m.cid);
        const h = d.on && d.on[name];
        if (!h) continue;
        if (!onBoard(G, m)) continue;
        h(G, { self: m, p: m.owner, ev });
      }
    }
    if (G.field) {
      const f = G.field;
      const d = def(f.cid);
      const h = d.on && d.on[name];
      if (h) h(G, { field: f, p: f.owner, ev });
    }
  }
  E.fire = fire;

  // ------------------------------------------------------------------
  // death resolution / layers / game over
  // ------------------------------------------------------------------
  function resolve(G) {
    for (let guard = 0; guard < 40; guard++) {
      const dead = [];
      const order = [G.active, opp(G.active)];
      for (const pid of order) {
        const b = P(G, pid).board;
        for (let i = 0; i < b.length; i++) if (b[i].hp <= 0 || b[i].dead) dead.push(b[i]);
      }
      if (!dead.length) break;
      const infos = [];
      group(G, () => {
        for (const m of dead) {
          const pos = removeFromBoard(G, m);
          const killer = opp(m.owner);
          P(G, killer).stats.kills++;
          infos.push({ m, pos });
          emit(G, 'death', { uid: m.uid, cid: m.cid, owner: m.owner, pos, how: m.deathHow || 'die' });
        }
      });
      for (const { m, pos } of infos) {
        if (m.silenced) continue;
        const d = def(m.cid);
        const ctx = { self: m, p: m.owner, pos };
        if (d.dr) {
          emit(G, 'deathrattle', { uid: m.uid, cid: m.cid, owner: m.owner });
          d.dr(G, ctx);
        }
        for (const extra of m.dr) {
          const xd = def(extra);
          if (xd && xd.dr) xd.dr(G, ctx);
        }
      }
      for (const { m } of infos) fire(G, 'minionDied', { m });
      checkOver(G);
      if (G.over) break;
    }
    checkOver(G);
  }
  E.resolve = resolve;

  function checkLayer(G) {
    while (G.layer < 2 && G.depth >= C.DEPTH_T[G.layer]) {
      const from = G.layer;
      G.layer++;
      G.deepest = Math.max(G.deepest, G.layer);
      G.layerAt[G.layer] = G.turn;
      emit(G, 'layer', { from, to: G.layer });
      fire(G, 'layerChange', { from, to: G.layer });
      resolve(G);
    }
  }
  E.checkLayer = checkLayer;

  // forces the dream one layer deeper (cards that "sink" the dream)
  E.sinkLayer = function (G) {
    if (G.layer >= 2) return false;
    const need = C.DEPTH_T[G.layer] - G.depth;
    addDepth(G, Math.max(1, need), 'card');
    return true;
  };

  function checkOver(G) {
    if (G.over) return;
    const d0 = G.players[0].hp <= 0,
      d1 = G.players[1].hp <= 0;
    if (d0 || d1) {
      G.over = true;
      G.winner = d0 && d1 ? -1 : d0 ? 1 : 0;
      G.phase = 'over';
      emit(G, 'over', { winner: G.winner });
    }
  }

  function act(G, fn) {
    if (G.over) return false;
    const r = fn();
    resolve(G);
    checkLayer(G);
    checkOver(G);
    return r;
  }

  // ------------------------------------------------------------------
  // fake cards (动摇)
  // ------------------------------------------------------------------
  function makeFake(G, pid) {
    const p = P(G, pid);
    if (p.hand.length >= C.MAX_HAND) return null;
    let pool = p.deck.filter((c) => !c.fake && !def(c.cid).token).map((c) => c.cid);
    if (!pool.length) pool = L.COLLECTIBLE;
    const mimic = pick(G, pool);
    const ci = mkCard(G, mimic, { fake: { v: ri(G, 1 << 20) } });
    p.hand.splice(ri(G, p.hand.length + 1), 0, ci);
    emit(G, 'fakein', { pid, uid: ci.uid, cid: mimic });
    return ci;
  }
  E.makeFake = makeFake;

  // ------------------------------------------------------------------
  // turn structure
  // ------------------------------------------------------------------
  function startTurn(G) {
    if (G.over) return;
    G.turn++;
    const pid = G.active;
    const p = P(G, pid);
    p.maxMana = Math.min(C.MAX_MANA, p.maxMana + 1);
    p.mana = p.maxMana;
    p.hpUsed = false;
    p.spentSan = 0;
    p.played = 0;
    emit(G, 'turn', { pid, turn: G.turn });
    for (const m of p.board) {
      m.sick = false;
      m.attacks = 0;
      if (m.tempStealth) {
        m.kw.stealth = false;
        m.tempStealth = false;
        emit(G, 'unstealth', { uid: m.uid });
      }
    }
    // sanity collapse, then regen
    if (p.sanity <= 0) {
      emit(G, 'collapse', { pid });
      damage(G, null, p.uid, 2, 'collapse');
      checkOver(G);
      if (G.over) return;
    }
    gainSanity(G, pid, 1);
    // 动摇
    if (p.sanity <= 3) {
      if (!p.shaken) {
        p.shaken = true;
        emit(G, 'shaken', { pid, on: true });
      }
      makeFake(G, pid);
    } else if (p.shaken) {
      p.shaken = false;
      const fakes = p.hand.filter((c) => c.fake);
      p.hand = p.hand.filter((c) => !c.fake);
      emit(G, 'shaken', { pid, on: false, removed: fakes.map((c) => c.uid) });
    }
    fire(G, 'turnStart', { pid });
    resolve(G);
    draw(G, pid, 1);
    resolve(G);
    checkLayer(G);
    checkOver(G);
  }

  function endTurnInner(G) {
    const pid = G.active;
    const p = P(G, pid);
    fire(G, 'turnEnd', { pid });
    resolve(G);
    if (G.over) return;
    // layer 2: the mall sweeps away the weakest
    if (G.layer === 2) {
      const all = allMinions(G).filter((m) => m.hp > 0 && !m.dead);
      if (all.length) {
        const minHp = Math.min.apply(null, all.map((m) => m.hp));
        const cands = all.filter((m) => m.hp === minHp);
        const v = pick(G, cands);
        emit(G, 'sweep', { uid: v.uid });
        destroy(G, v, 'sweep');
        resolve(G);
        if (G.over) return;
      }
    }
    // 褪色
    for (const ci of p.hand) {
      if (ci.fake) continue;
      const d = def(ci.cid);
      if ((d.fade || ci.echo || ci.fz) && ci.fade < 3) {
        ci.fade++;
        if (ci.fade === 3) ci.costMod -= 1;
        emit(G, 'fade', { pid, uid: ci.uid, level: ci.fade });
      }
    }
    // breach countdown for cards this player contained
    const held = p.deck.concat(p.hand).filter((c) => c.breach);
    for (const ci of held) {
      ci.breach.turns--;
      if (ci.breach.turns <= 0) breach(G, pid, ci);
      else emit(G, 'countdown', { pid, uid: ci.uid, cid: ci.cid, turns: ci.breach.turns });
    }
    resolve(G);
    // limbo returns
    const back = G.limbo.filter((e) => e.at <= G.turn);
    for (const e of back) {
      const o = P(G, e.owner);
      if (o.board.length < C.MAX_BOARD) {
        G.limbo.splice(G.limbo.indexOf(e), 1);
        e.m.owner = e.owner;
        e.m.dead = false;
        o.board.push(e.m);
        emit(G, 'return', { uid: e.m.uid, cid: e.m.cid, owner: e.owner });
      } else e.at = G.turn + 2;
    }
    // thaw
    for (const m of allMinions(G)) {
      if (m.frozen && m.thawAt <= G.turn) {
        m.frozen = false;
        emit(G, 'thaw', { uid: m.uid });
      }
    }
    // the dream keeps sinking on its own
    if (G.drift) addDepth(G, G.drift, 'drift');
    // 闭店时间: the bottom of the dream closes in on whoever is standing in it
    if (G.layer === 2 && G.depth >= C.DEPTH_MAX) {
      G.closing = (G.closing || 0) + 1;
      emit(G, 'closing', { pid, n: G.closing });
      damage(G, null, p.uid, G.closing, 'closing');
    }
    resolve(G);
    checkLayer(G);
    checkOver(G);
  }

  E.endTurn = function (G, pid) {
    if (G.over || G.phase !== 'play') return false;
    if (pid != null && pid !== G.active) return false;
    endTurnInner(G);
    if (G.over) return true;
    G.active = opp(G.active);
    startTurn(G);
    return true;
  };

  // ------------------------------------------------------------------
  // fade randomization pool (when a 褪色 card reaches 3)
  // ------------------------------------------------------------------
  const FADE_FX = [
    { name: '梦见了火', text: '对一个随机敌人造成 3 点伤害。', fx: (G, c) => { const en = P(G, opp(c.p)); const t = pick(G, [en].concat(en.board.filter((m) => m.hp > 0 && !m.dead))); damage(G, P(G, c.p).uid, t.uid, 3, 'spell'); } },
    { name: '梦见了朋友', text: '召唤一个 2/2 的褪色的玩伴。', fx: (G, c) => { summon(G, c.p, 'T_PLAYMATE'); } },
    { name: '梦见了一封信', text: '抽一张牌。', fx: (G, c) => { draw(G, c.p, 1); } },
    { name: '梦见了晚饭', text: '为你的英雄恢复 5 点生命值和 1 点理智。', fx: (G, c) => { heal(G, P(G, c.p).uid, P(G, c.p).uid, 5); gainSanity(G, c.p, 1); } },
    { name: '梦见了长大', text: '使一个随机友方随从获得 +2/+2。', fx: (G, c) => { const m = pick(G, P(G, c.p).board.filter((x) => x.hp > 0 && !x.dead)); if (m) buff(G, m, 2, 2); } },
    { name: '梦见了冬天', text: '冻结一个随机敌方随从。', fx: (G, c) => { const m = pick(G, P(G, opp(c.p)).board.filter((x) => x.hp > 0 && !x.dead)); if (m) freeze(G, m.uid); } },
    { name: '梦见了你', text: '复制对手手牌中的一张牌。', fx: (G, c) => { const ci = pick(G, P(G, opp(c.p)).hand); if (ci) copyCard(G, c.p, ci); } },
    { name: '梦见了坠落', text: '梦深 +3。对所有敌方随从造成 1 点伤害。', fx: (G, c) => { addDepth(G, 3, 'card'); group(G, () => { for (const m of P(G, opp(c.p)).board.slice()) damage(G, P(G, c.p).uid, m.uid, 1, 'spell'); }); } },
    { name: '梦见了泡泡', text: '使你的所有随从获得圣盾。', fx: (G, c) => { group(G, () => { for (const m of P(G, c.p).board) giveKw(G, m, 'divine'); }); } },
    // the risky half of fading: a dream does not owe you anything
    { name: '梦见了醒来', text: '什么也没有发生。', fx: () => {} },
    { name: '梦见了黑暗', text: '你失去 2 点理智。', fx: (G, c) => { loseSanity(G, c.p, 2, 'fade'); } },
    { name: '梦见了对方', text: '使一个随机敌方随从获得 +1/+1。', fx: (G, c) => { const m = pick(G, P(G, opp(c.p)).board.filter((x) => x.hp > 0 && !x.dead)); if (m) buff(G, m, 1, 1); } },
  ];
  E.FADE_FX = FADE_FX;

  // ------------------------------------------------------------------
  // actions
  // ------------------------------------------------------------------
  E.play = function (G, pid, uid, opts) {
    opts = opts || {};
    if (!E.canPlay(G, pid, uid)) return false;
    const p = P(G, pid);
    const ci = p.hand.find((c) => c.uid === uid);
    const d = def(ci.cid);
    let target = opts.target == null ? null : opts.target;
    if (!ci.fake && d.tgt) {
      const tg = validTargets(G, pid, d.tgt, d.tgtCond, { p: pid, card: ci });
      if (tg.length) {
        if (target == null || tg.indexOf(target) < 0) {
          if (!d.tgtOptional) return false;
          target = tg.indexOf(target) >= 0 ? target : null;
        }
      } else target = null;
    }
    return act(G, () => {
      const cost = costOf(G, p, ci);
      const san = sanOf(ci);
      p.mana -= cost;
      p.hand.splice(p.hand.indexOf(ci), 1);
      p.played++;
      p.stats.played++;
      p.stats.cids[ci.cid] = (p.stats.cids[ci.cid] || 0) + 1;
      const faded = !ci.fake && ci.fade >= 3 && (d.fade || ci.echo || ci.fz);
      const wasContained = !!ci.breach;
      emit(G, 'play', {
        pid,
        uid: ci.uid,
        cid: ci.cid,
        kind: d.type,
        target,
        pos: opts.pos,
        fake: !!ci.fake,
        faded,
        contained: wasContained,
        echo: !!ci.echo,
        cost,
        san,
      });
      if (san > 0) loseSanity(G, pid, san, 'spend');
      if (ci.fake) {
        emit(G, 'fakeplay', { pid, uid: ci.uid, cid: ci.cid });
        return true;
      }
      ci.breach = null;
      const ctx = { p: pid, card: ci, target, pos: opts.pos };
      let fadeFx = null;
      if (faded) fadeFx = pick(G, FADE_FX);
      if (d.type === 'minion') {
        const m = summon(G, pid, ci.cid, opts.pos, { uid: ci.uid, how: wasContained ? 'tamed' : 'play' });
        ctx.self = m;
        if (m) {
          if (faded) {
            silence(G, m, true);
            emit(G, 'fadefx', { pid, uid: m.uid, name: fadeFx.name, text: fadeFx.text });
            fadeFx.fx(G, ctx);
          } else if (d.bc) {
            emit(G, 'battlecry', { uid: m.uid, cid: m.cid, target });
            d.bc(G, ctx);
          }
          fire(G, 'minionPlayed', { m, pid });
        }
      } else if (d.type === 'spell') {
        emit(G, 'spell', { pid, cid: ci.cid, target, faded });
        if (faded) {
          emit(G, 'fadefx', { pid, uid: ci.uid, name: fadeFx.name, text: fadeFx.text });
          fadeFx.fx(G, ctx);
        } else d.spell(G, ctx);
        fire(G, 'spellCast', { pid, cid: ci.cid });
      } else if (d.type === 'field') {
        if (faded) {
          emit(G, 'fadefx', { pid, uid: ci.uid, name: fadeFx.name, text: fadeFx.text });
          fadeFx.fx(G, ctx);
        } else setField(G, pid, ci.cid, ci.uid);
      }
      if (d.echo && !ci.echo) addToHand(G, pid, ci.cid, { echo: true, fade: 1 }, 'echo');
      p.last = ci.cid;
      fire(G, 'cardPlayed', { pid, cid: ci.cid });
      return true;
    });
  };

  function canAttackM(G, m) {
    if (!m || G.over || G.phase !== 'play') return false;
    if (m.owner !== G.active) return false;
    if (m.frozen || m.dead || m.hp <= 0) return false;
    if (atkOf(G, m) <= 0) return false;
    if (m.kw.cantAttack) return false;
    if (m.attacks >= (m.kw.windfury ? 2 : 1)) return false;
    if (m.sick && !m.kw.charge && !m.kw.rush) return false;
    return true;
  }
  E.canAttack = function (G, uid) {
    const m = char(G, uid);
    return !!m && !isHero(m) && canAttackM(G, m);
  };
  E.attackTargets = function (G, uid) {
    const m = char(G, uid);
    if (!m || isHero(m) || !canAttackM(G, m)) return [];
    const en = P(G, opp(m.owner));
    const vis = en.board.filter((x) => !x.kw.stealth && x.hp > 0 && !x.dead);
    const taunts = vis.filter((x) => x.kw.taunt);
    const canFace = !m.sick || m.kw.charge;
    if (taunts.length) return taunts.map((x) => x.uid);
    const r = vis.map((x) => x.uid);
    if (canFace) r.push(en.uid);
    return r;
  };

  E.attack = function (G, pid, aUid, tUid) {
    const a = char(G, aUid);
    if (!a || isHero(a) || a.owner !== pid || !canAttackM(G, a)) return false;
    if (E.attackTargets(G, aUid).indexOf(tUid) < 0) return false;
    const t = char(G, tUid);
    return act(G, () => {
      const ad = def(a.cid);
      const wasStealth = !!a.kw.stealth;
      const ambush = wasStealth && ad.ambush && !a.silenced ? ad.ambush : null;
      emit(G, 'attack', { from: a.uid, to: t.uid, ambush: !!ambush });
      let dA = atkOf(G, a);
      if (ambush) {
        if (ambush.double) dA *= 2;
        if (ambush.bonus) dA += ambush.bonus;
        emit(G, 'ambush', { uid: a.uid });
      }
      const dT = isHero(t) ? 0 : atkOf(G, t);
      a.attacks++;
      group(G, () => {
        damage(G, a.uid, t.uid, dA, 'atk');
        if (dT > 0) damage(G, t.uid, a.uid, dT, 'atk');
      });
      // stealth breaks once the blow has landed (auras keyed to stealth apply to the strike itself)
      if (wasStealth) {
        a.kw.stealth = false;
        a.tempStealth = false;
        emit(G, 'unstealth', { uid: a.uid });
      }
      fire(G, 'afterAttack', { a, t });
      // layer 1: drifting
      if (G.layer === 1 && a.hp > 0 && !a.dead && onBoard(G, a)) {
        const b = P(G, a.owner).board;
        if (b.length > 1 && rand(G) < 0.5) {
          const i = b.indexOf(a);
          let j = rand(G) < 0.5 ? i - 1 : i + 1;
          if (j < 0) j = 1;
          if (j >= b.length) j = b.length - 2;
          moveMinion(G, a, j);
        }
      }
      return true;
    });
  };

  // hero powers
  E.heroPowerInfo = function (G, pid) {
    const h = L.HEROES[P(G, pid).hero];
    return h.power;
  };
  E.canHeroPower = function (G, pid) {
    if (G.over || G.phase !== 'play' || G.active !== pid) return false;
    const p = P(G, pid);
    const hp = E.heroPowerInfo(G, pid);
    if (p.hpUsed || p.mana < (hp.cost == null ? C.HP_COST : hp.cost)) return false;
    if (hp.canUse && !hp.canUse(G, { p: pid })) return false;
    if (hp.tgt && validTargets(G, pid, hp.tgt, hp.tgtCond, { p: pid }).length === 0) return false;
    return true;
  };
  E.heroPowerTargets = function (G, pid) {
    const hp = E.heroPowerInfo(G, pid);
    if (!hp.tgt) return [];
    return validTargets(G, pid, hp.tgt, hp.tgtCond, { p: pid });
  };
  E.heroPower = function (G, pid, target) {
    if (!E.canHeroPower(G, pid)) return false;
    const hp = E.heroPowerInfo(G, pid);
    if (hp.tgt) {
      const tg = E.heroPowerTargets(G, pid);
      if (tg.indexOf(target) < 0) return false;
    } else target = null;
    const p = P(G, pid);
    return act(G, () => {
      p.mana -= hp.cost == null ? C.HP_COST : hp.cost;
      p.hpUsed = true;
      emit(G, 'heroPower', { pid, target, hero: p.hero });
      hp.fx(G, { p: pid, target });
      fire(G, 'heroPowerUsed', { pid });
      return true;
    });
  };

  E.concede = function (G, pid) {
    if (G.over) return;
    P(G, pid).hp = 0;
    checkOver(G);
  };

  // clone for AI search (never carries the UI event log)
  E.cloneForSim = function (G) {
    const ev = G.events;
    G.events = [];
    const rec = G.rec;
    const c = clone(G);
    G.events = ev;
    c.rec = false;
    c.sim = true;
    c.events = [];
    G.rec = rec;
    return c;
  };

  // convenient helpers used by card scripts
  E.h = {
    P,
    opp,
    enemyBoard: (G, pid) => P(G, opp(pid)).board.filter((m) => m.hp > 0 && !m.dead),
    myBoard: (G, pid) => P(G, pid).board.filter((m) => m.hp > 0 && !m.dead),
    heroUid: (G, pid) => P(G, pid).uid,
    pick: (G, arr) => pick(G, arr),
    rand: (G) => rand(G),
    ri: (G, n) => ri(G, n),
    shuffle: (G, a) => shuffle(G, a),
  };
})();
