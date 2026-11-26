// Paints all art in a real browser and screenshots finished cards (frames + painterly art).
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = process.argv[2] || '/tmp';
  const ids = (process.argv[3] || 'S17,B13,D18,N10,S02,B05,D05,X03,S11,B11,D12,N07').split(',');
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/net::|fonts/.test(m.text()) && errs.push(m.text()));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', 'liminal.html'));
  await p.waitForFunction(() => window.LMN_READY);
  const t0 = Date.now();
  await p.evaluate((ids) => LMN.Art.prioritize(ids), ids);
  await p.waitForFunction(() => LMN.Art.painted > 6 && LMN.Art.pending() === 0, null, { timeout: 400000, polling: 1000 });
  console.log('painted', await p.evaluate(() => LMN.Art.painted), 'in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await p.evaluate((ids) => {
    document.getElementById('stage').style.display = 'none';
    const w = document.createElement('div');
    w.style.cssText = 'position:fixed;inset:0;z-index:99;background:#14110c;display:flex;flex-wrap:wrap;gap:34px 26px;padding:34px;--cw:190px;align-content:flex-start';
    for (const id of ids) w.appendChild(LMN.CV.card(id, {}, { big: true }));
    document.body.appendChild(w);
  }, ids);
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(out, 'artsheet.png') });
  // one large card to judge brushwork
  await p.evaluate((id) => { const w = document.body.lastChild; w.innerHTML = ''; w.style.setProperty('--cw', '420px'); w.appendChild(LMN.CV.card(id, {}, { big: true })); }, ids[0]);
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(out, 'artbig.png'), clip: { x: 0, y: 0, width: 520, height: 680 } });
  console.log('errors', errs);
  await b.close();
})();
