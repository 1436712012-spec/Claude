// Records each layer's score through an AnalyserNode: levels, clipping, and a spectrogram image.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = process.argv[2] || '/tmp';
  const secs = +(process.argv[3] || 12);
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts/, (r) => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', 'liminal.html'));
  await p.waitForFunction(() => window.LMN_READY);
  await p.mouse.click(600, 700);
  await p.waitForFunction(() => LMN.Audio.ready && LMN.Music._probe && LMN.Music._probe());
  const res = await p.evaluate(async (secs) => {
    const ctx = LMN.Audio._eng().ctx;
    const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
    LMN.Music._probe().connect(an);
    const cv = document.createElement('canvas'); cv.width = 4 * secs * 10; cv.height = 4 * 128;
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
    const td = new Float32Array(an.fftSize), fd = new Uint8Array(an.frequencyBinCount);
    const report = [];
    const order = [3, 0, 1, 2];
    for (let li = 0; li < 4; li++) {
      LMN.Layers.set(order[li]);
      await new Promise((r) => setTimeout(r, 1500));
      let peak = 0, sum = 0, n = 0, nan = false;
      for (let k = 0; k < secs * 10; k++) {
        await new Promise((r) => setTimeout(r, 100));
        an.getFloatTimeDomainData(td);
        let rms = 0; for (const v of td) { if (!isFinite(v)) nan = true; rms += v * v; peak = Math.max(peak, Math.abs(v)); }
        rms = Math.sqrt(rms / td.length); sum += rms; n++;
        an.getByteFrequencyData(fd);
        const x = li * secs * 10 + k;
        // log-ish frequency axis: bins 0..400 (~0–8.6 kHz), 128 rows per layer band
        for (let y = 0; y < 128; y++) {
          const bin = Math.floor(Math.pow(y / 127, 2.2) * 400) + 1;
          const v = fd[bin];
          g.fillStyle = `rgb(${v},${Math.max(0, v - 90) * 1.6},${255 - v})`;
          g.fillRect(x, (127 - y) * 4, 1, 4);
        }
      }
      report.push({ layer: order[li], avgRms: +(sum / n).toFixed(4), peak: +peak.toFixed(3), nan });
    }
    return { report, png: cv.toDataURL() };
  }, secs);
  console.log(JSON.stringify(res.report));
  const fs = require('fs');
  fs.writeFileSync(path.join(out, 'spectro.png'), Buffer.from(res.png.split(',')[1], 'base64'));
  console.log('errors', errs);
  await b.close();
})();
