/* LIMINAL · persistence (localStorage, silently degrading to session memory) */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const mem = {};
  let persistent = true;
  function get(k, dflt) {
    try {
      if (typeof localStorage !== 'undefined') {
        const v = localStorage.getItem('lmn.' + k);
        if (v != null) return JSON.parse(v);
      }
    } catch (e) {
      persistent = false;
    }
    return k in mem ? JSON.parse(mem[k]) : dflt;
  }
  function set(k, v) {
    const s = JSON.stringify(v);
    mem[k] = s;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem('lmn.' + k, s);
      else persistent = false;
    } catch (e) {
      persistent = false;
    }
  }
  const S = (L.Store = { get, set, isPersistent: () => persistent });

  S.settings = Object.assign(
    { mute: false, vol: 0.8, crt: true, barrel: false, speed: 1, calm: false, vibrate: true, fast: false, hints: true, music: 0.7 },
    get('settings', {})
  );
  S.saveSettings = () => set('settings', S.settings);

  S.progress = Object.assign({ beaten: [], wins: 0, losses: 0, seen: [], firstSeen: null }, get('progress', {}));
  S.saveProgress = () => set('progress', S.progress);
  S.beat = function (bossKey) {
    if (!S.progress.beaten.includes(bossKey)) S.progress.beaten.push(bossKey);
    S.saveProgress();
  };
  S.unlockedBossCards = function () {
    return L.BOSS_CARDS.filter((id) => S.progress.beaten.includes(L.CARDS[id].boss));
  };
  S.markSeen = function (cid) {
    if (!S.progress.seen.includes(cid)) {
      S.progress.seen.push(cid);
      S.saveProgress();
    }
  };

  S.decks = get('decks', []);
  S.saveDecks = () => set('decks', S.decks);
  S.allDecks = () => L.PRESETS.concat(S.decks);
  S.selected = get('selected', { agent: 'agent_shen', deck: 'pre_site', boss: 'boss_manager' });
  S.saveSelected = () => set('selected', S.selected);
})();
