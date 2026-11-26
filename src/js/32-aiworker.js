/* LIMINAL · runs the gatekeeper's thinking in a Web Worker built from this very script,
   so the main thread keeps animating while it decides. Falls back to synchronous search. */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const W = (L.AIW = {});
  // capture our own source while it is executing (inline single-file build)
  const SRC = typeof document !== 'undefined' && document.currentScript ? document.currentScript.textContent : null;
  let worker = null;
  let failed = false;
  let seq = 0;
  const pending = new Map();

  function shim() {
    self.onmessage = function (e) {
      const d = e.data;
      let a;
      try {
        a = self.LMN.AI.decide(d.G, d.pid, d.persona, d.memo);
      } catch (err) {
        a = { t: 'end' };
      }
      self.postMessage({ id: d.id, a: a, memo: d.memo });
    };
  }

  function ensure() {
    if (worker || failed) return worker;
    if (typeof Worker === 'undefined' || !SRC) { failed = true; return null; }
    try {
      const blob = new Blob([SRC + '\n;(' + shim.toString() + ')();'], { type: 'text/javascript' });
      worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = (e) => {
        const p = pending.get(e.data.id);
        if (p) { pending.delete(e.data.id); clearTimeout(p.timer); p.res(e.data); }
      };
      worker.onerror = () => { failed = true; worker = null; for (const p of pending.values()) p.fallback(); pending.clear(); };
    } catch (e) {
      failed = true;
      worker = null;
    }
    return worker;
  }

  // resolves to the decided action; memo is updated in place
  W.decide = function (G, pid, persona, memo) {
    const sync = () => L.AI.decide(G, pid, persona, memo);
    const w = ensure();
    if (!w) return Promise.resolve(sync());
    return new Promise((resolve) => {
      const id = ++seq;
      const fallback = () => resolve(sync());
      const timer = setTimeout(() => { if (pending.has(id)) { pending.delete(id); fallback(); } }, 8000);
      pending.set(id, {
        timer,
        fallback,
        res: (d) => {
          for (const k in memo) delete memo[k];
          Object.assign(memo, d.memo);
          resolve(d.a);
        },
      });
      const ev = G.events;
      G.events = [];
      try {
        w.postMessage({ id, G, pid, persona, memo: JSON.parse(JSON.stringify(memo)) });
      } catch (e) {
        pending.delete(id);
        clearTimeout(timer);
        failed = true;
        G.events = ev;
        resolve(sync());
        return;
      }
      G.events = ev;
    });
  };
  W.warm = function () { ensure(); };
})();
