/* LIMINAL · dream layers: scene switching and the layer-change sequence */
(function () {
  'use strict';
  const L = globalThis.LMN;
  const Layers = (L.Layers = { current: 0 });
  const $ = (id) => document.getElementById(id);

  Layers.set = function (layer, instant) {
    Layers.current = layer;
    const app = $('app');
    app.dataset.layer = layer;
    document.querySelectorAll('#scene .sc').forEach((s, i) => {
      if (instant) s.style.transition = 'none';
      s.classList.toggle('on', i === layer);
      if (instant) { void s.offsetWidth; s.style.transition = ''; }
    });
    L.FX.setAmbient(layer);
    L.Audio.ambience(layer);
    if (L.Music) L.Music.setLayer(layer);
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  Layers.transition = function (from, to) {
    const box = $('layerT');
    const cv = $('ltc');
    const g = cv.getContext('2d');
    const flash = box.querySelector('.flash');
    const title = box.querySelector('.title');
    const osd = box.querySelector('.osd');
    const lay = L.LAYERS[to];
    title.querySelector('.n').textContent = `LAYER ${String(to).padStart(2, '0')} · ${lay.en}`;
    title.querySelector('.t').textContent = `第 ${to} 层 · ${lay.name}`;
    title.querySelector('.r').textContent = lay.rule;
    const W = (cv.width = Math.round(window.innerWidth / 2));
    const H = (cv.height = Math.round(window.innerHeight / 2));
    g.imageSmoothingEnabled = false;
    const noise = document.createElement('canvas');
    noise.width = 160;
    noise.height = 100;
    const ng = noise.getContext('2d');
    const nimg = ng.createImageData(160, 100);
    const calm = L.FX.isCalm();
    let skipped = false;
    let raf = 0;
    box.classList.add('on');
    return new Promise((resolve) => {
      const t0 = performance.now();
      const T = calm ? { flick: 0, glitch: 0, black: 0, reveal: 300, end: 1700 } : { flick: 520, glitch: 1450, black: 1700, reveal: 2350, end: 2700 };
      let switched = false;
      const doSwitch = () => {
        if (switched) return;
        switched = true;
        $('app').classList.remove('glitching');
        Layers.set(to);
      };
      const finish = () => {
        cancelAnimationFrame(raf);
        doSwitch();
        $('app').classList.remove('glitching');
        g.clearRect(0, 0, W, H);
        flash.style.opacity = 0;
        osd.style.opacity = 0;
        title.style.opacity = 0;
        box.classList.remove('on');
        box.onclick = null;
        L.Audio.duck(false);
        resolve();
      };
      box.onclick = () => {
        skipped = true;
        finish();
      };
      L.Audio.duck(true);
      if (!calm) {
        if (L.Music) L.Music.glitch(true);
        // the dream exhales before it tears: a soft burst of bubbles and light
        L.FX.burst(window.innerWidth / 2, window.innerHeight * 0.45, 'dream', 46, { grav: -70, speed: 1.1, life: 1.6, size: 1.4 });
        L.FX.ring(window.innerWidth / 2, window.innerHeight * 0.45, '#ffe6f6', Math.max(window.innerWidth, window.innerHeight) * 0.6, 1.1, 18);
        L.Audio.play('flicker');
        flash.animate([{ opacity: 0 }, { opacity: 0.85 }, { opacity: 0 }, { opacity: 0 }, { opacity: 0.9 }, { opacity: 0.1 }, { opacity: 0 }], { duration: 520 });
        setTimeout(() => { if (!skipped) { L.Audio.play('layer'); $('app').classList.add('glitching'); L.FX.shake(12); } }, T.flick);
      }
      const frame = (now) => {
        if (skipped) return;
        const t = now - t0;
        g.clearRect(0, 0, W, H);
        if (t > T.flick && t < T.black) {
          // VHS tracking failure
          const k = (t - T.flick) / (T.black - T.flick);
          for (let i = 0; i < nimg.data.length; i += 4) {
            const v = Math.random() * 255;
            nimg.data[i] = nimg.data[i + 1] = nimg.data[i + 2] = v;
            nimg.data[i + 3] = 60 + k * 160;
          }
          ng.putImageData(nimg, 0, 0);
          g.globalAlpha = 0.5 + k * 0.5;
          g.drawImage(noise, 0, 0, W, H);
          g.globalAlpha = 1;
          const bands = 6 + Math.floor(k * 14);
          for (let i = 0; i < bands; i++) {
            const y = Math.random() * H, h = 2 + Math.random() * 18;
            g.fillStyle = ['rgba(255,0,64,.55)', 'rgba(0,224,255,.5)', 'rgba(255,255,255,.7)', 'rgba(0,0,0,.8)', 'rgba(242,214,75,.5)'][i % 5];
            g.fillRect(Math.random() * -40, y, W + 80, h);
          }
          // tracking bar
          const ty = ((t * 0.6) % (H + 60)) - 30;
          g.fillStyle = 'rgba(255,255,255,.25)';
          g.fillRect(0, ty, W, 14);
          osd.style.opacity = Math.floor(t / 180) % 2 ? 1 : 0.4;
          osd.textContent = k < 0.5 ? '▶ PLAY   TRACKING —' : '■ ERR    TAPE ' + String(to).padStart(2, '0');
        } else if (t >= T.black && t < T.reveal) {
          osd.style.opacity = 0;
          const k = (t - T.black) / (T.reveal - T.black);
          g.fillStyle = '#000';
          g.globalAlpha = Math.min(1, k * 4);
          g.fillRect(0, 0, W, H);
          g.globalAlpha = 1;
          if (k > 0.25) doSwitch();
        } else if (t >= T.reveal && t < T.end) {
          doSwitch();
          // the new layer surfaces from scanlines (interlaced reveal)
          const k = (t - T.reveal) / (T.end - T.reveal);
          g.fillStyle = '#000';
          const step = 4;
          for (let y = 0; y < H; y += step) {
            const odd = (y / step) % 2;
            const kk = Math.max(0, Math.min(1, k * 1.6 - (odd ? 0.35 : 0)));
            const th = step * (1 - kk);
            if (th > 0.1) g.fillRect(0, y, W, th);
          }
          title.style.opacity = k < 0.15 ? k / 0.15 : 1;
        } else if (t >= T.end) {
          title.style.opacity = Math.max(0, 1 - (t - T.end) / 500);
          if (t > T.end + 520) return finish();
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
  };
})();
