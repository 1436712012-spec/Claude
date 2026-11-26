// Frame-time measurement under 4x CPU throttling while the match autoplays with full effects.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', 'liminal.html'));
  await page.waitForFunction(() => window.LMN_READY);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: +(process.argv[2] || 4) });
  await page.mouse.click(195, 600);
  const mode = process.argv[4] || '';
  await page.evaluate((mode) => {
    if (mode.includes('nocrt')) { LMN.Store.settings.crt = false; LMN.Menus.applySettings(); }
    if (mode.includes('nosheen')) { const st = document.createElement('style'); st.textContent = '.card .cf::after{animation:none!important;display:none!important}'; document.head.appendChild(st); }
    if (mode.includes('noamb')) { LMN.FX.setAmbient(-1); }
  }, mode);
  if (mode.includes('waitart')) await page.waitForFunction(() => LMN.Art.pending() === 0 && LMN.Art.painted > 70, null, { timeout: 400000, polling: 1000 });
  if (mode.includes('nodream')) await page.evaluate(() => { const d = document.getElementById('dream'); if (d) d.remove(); document.querySelectorAll('.far').forEach((f) => f.remove()); });
  await page.evaluate(() => { LMN.UI.start({ agent: 'agent_man', deck: LMN.PRESETS[2].cards.slice(), boss: 'boss_broadcast', first: 1 }); });
  await page.waitForSelector('#mull.on', { timeout: 30000 });
  if (await page.$('#briefOk')) { await page.click('#briefOk'); await page.waitForSelector('#mullOk'); }
  await page.click('#mullOk');
  await page.evaluate(() => {
    window.__ft = [];
    let last = performance.now();
    const f = (t) => { window.__ft.push(t - last); last = t; requestAnimationFrame(f); };
    requestAnimationFrame(f);
    LMN.UI.debug.autoplay(300);
  });
  await page.waitForTimeout(+(process.argv[3] || 40000));
  const r = await page.evaluate(() => {
    const a = window.__ft.slice(5).sort((x, y) => x - y);
    const avg = a.reduce((s, x) => s + x, 0) / a.length;
    const pct = (p) => a[Math.floor(a.length * p)];
    const G = LMN.UI.debug.G;
    return { frames: a.length, avgFps: (1000 / avg).toFixed(1), p50: pct(0.5).toFixed(1), p90: pct(0.9).toFixed(1), p99: pct(0.99).toFixed(1), over50: a.filter((x) => x > 50).length, turn: G && G.turn, layer: G && G.layer };
  });
  console.log(JSON.stringify(r));
  await browser.close();
})();
