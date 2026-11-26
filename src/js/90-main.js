/* LIMINAL · boot */
(function () {
  'use strict';
  const L = globalThis.LMN;
  if (typeof document === 'undefined') return;
  const $ = (id) => document.getElementById(id);

  function size() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const W = Math.floor(Math.min(vw, vh * 0.6, 640));
    const root = document.documentElement.style;
    root.setProperty('--W', W + 'px');
    root.setProperty('--u', (W / 100).toFixed(3) + 'px');
    // taller screens get bigger hand cards
    const ratio = vh / W;
    root.setProperty('--cw', ratio > 2 ? 'calc(var(--u) * 24)' : 'calc(var(--u) * 22)');
    document.querySelectorAll('.hand').forEach((h) => h.style.setProperty('--cw', ratio > 2.05 ? 'calc(var(--u) * 24.5)' : ratio > 1.85 ? 'calc(var(--u) * 23)' : 'calc(var(--u) * 21)'));
    if (L.UI && L.UI.relayout) L.UI.relayout();
  }

  function barrelMap() {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const nx = (x / (S - 1)) * 2 - 1, ny = (y / (S - 1)) * 2 - 1;
        const r2 = nx * nx + ny * ny;
        const i = (y * S + x) * 4;
        img.data[i] = 128 + nx * r2 * 0.5 * 127;
        img.data[i + 1] = 128 + ny * r2 * 0.5 * 127;
        img.data[i + 2] = 128;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const fe = $('barrelMap');
    fe.setAttribute('href', c.toDataURL());
    fe.setAttribute('width', '100%');
    fe.setAttribute('height', '100%');
  }

  function boot() {
    size();
    const root = document.documentElement.style;
    for (const k of ['mana', 'san', 'atk', 'hp', 'armor']) root.setProperty('--gem-' + k, `url("${L.Frames.gem(k)}")`);
    window.addEventListener('resize', size);
    window.addEventListener('orientationchange', () => setTimeout(size, 200));
    L.FX.init();
    L.UI.init();
    L.Menus.init();
    L.Menus.applySettings();
    try { barrelMap(); } catch (e) { /* barrel is optional */ }
    L.Layers.set(0, true);
    // keep the noise-filtered SVG art off the hot path: bitmap it while the player reads the title
    setTimeout(() => L.Art.rasterizeAll(), 600);
    setTimeout(() => L.AIW.warm(), 1200);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.ov.on').forEach((o) => o.classList.remove('on'));
      }
      if ((e.key === 'e' || e.key === 'E') && L.Menus.current() === 'game' && L.UI.isMyTurn() && !L.UI.busy()) $('endTurn').click();
    });
    // first interaction unlocks audio anywhere
    window.addEventListener('pointerdown', () => L.Audio.init(), { once: true });
    window.LMN_READY = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
