// Visual audit: captures specific states (inspect, legendary entrance, layer transition, deck builder, archive, results, desktop).
// usage: node tools/shots.cjs outDir
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = process.argv[2] || path.join(__dirname, '..', 'test', 'shots');
fs.mkdirSync(out, { recursive: true });
const file = 'file://' + path.join(__dirname, '..', 'liminal.html');
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function page(vp, mobile) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: !!mobile, isMobile: !!mobile });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/net::|fonts/.test(m.text())) errors.push(m.text()); });
    await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await p.goto(file);
    await p.waitForFunction(() => window.LMN_READY);
    await p.mouse.click(vp.width / 2, vp.height * 0.7);
    return p;
  }
  const shot = (p, n) => p.screenshot({ path: path.join(out, n + '.png') });
  const p = await page({ width: 390, height: 844 }, true);
  // deck builder
  await p.evaluate(() => LMN.Menus.show('deck'));
  await p.waitForTimeout(300); await shot(p, 'a1-deck-manager');
  await p.evaluate(() => document.querySelectorAll('#deckManager .deckrow')[0].click());
  await p.waitForTimeout(500); await shot(p, 'a2-builder');
  await p.evaluate(() => document.getElementById('dToggle').click());
  await p.waitForTimeout(300); await shot(p, 'a3-builder-list');
  // archive
  await p.evaluate(() => { LMN.Store.progress.seen = LMN.L ? [] : ['N10','S01','S10','D03','B10','B09']; LMN.Menus.show('archive'); });
  await p.waitForTimeout(300); await shot(p, 'a4-archive');
  // match with forced states
  await p.evaluate(() => { LMN.Store.settings.fast = true; LMN.Menus.applySettings(); LMN.UI.start({ agent: 'agent_tang', deck: LMN.PRESETS[1].cards.slice(), boss: 'boss_broadcast' }); });
  await p.waitForSelector('#mull.on', { timeout: 15000 }); if (await p.$('#briefOk')) { await p.click('#briefOk'); await p.waitForSelector('#mullOk'); }
  await p.click('#mullOk'); await p.waitForTimeout(2500);
  await p.evaluate(() => { const G = LMN.UI.debug.G; const ci = G.players[0].hand[0]; LMN.UI.inspect(ci.cid, { uid: ci.uid, fade: 1, fz: true }); });
  await p.waitForTimeout(300); await shot(p, 'b1-inspect');
  await p.evaluate(() => document.getElementById('inspect').classList.remove('on'));
  // legendary entrance (forced)
  await p.evaluate(() => { const G = LMN.UI.debug.G; if (G.active !== 0) return; const ci = LMN.E.mkCard(G, 'S17'); G.players[0].hand.push(ci); G.players[0].mana = 10; LMN.UI.debug.act({ t: 'play', uid: ci.uid, target: null }); });
  await p.waitForTimeout(900); await shot(p, 'b2-legend-typing');
  await p.waitForTimeout(700); await shot(p, 'b3-legend-card');
  await p.waitForTimeout(2500); await shot(p, 'b4-after-legend');
  // force a layer change
  await p.evaluate(() => { const G = LMN.UI.debug.G; if (G.active !== 0) return; const ci = LMN.E.mkCard(G, 'N10'); G.players[0].hand.push(ci); G.players[0].mana = 10; LMN.UI.debug.act({ t: 'play', uid: ci.uid, target: null }); });
  await p.waitForTimeout(2300); await shot(p, 'c1-layer-glitch');
  await p.waitForTimeout(1900); await shot(p, 'c2-layer-reveal');
  await p.waitForTimeout(2500); await shot(p, 'c3-mall');
  // end screen
  await p.evaluate(() => { const G = LMN.UI.debug.G; G.players[1].hp = 1; });
  await p.evaluate(() => LMN.UI.debug.autoplay(60));
  for (let i = 0; i < 60; i++) { await p.waitForTimeout(1000); if (await p.evaluate(() => document.getElementById('endov').classList.contains('on'))) break; }
  await p.waitForTimeout(500); await shot(p, 'd1-end');
  // desktop
  const d = await page({ width: 1440, height: 900 });
  await d.evaluate(() => { LMN.Store.settings.fast = true; LMN.Menus.applySettings(); LMN.UI.start({ agent: 'agent_man', deck: LMN.PRESETS[2].cards.slice(), boss: 'boss_lifeguard' }); });
  await d.waitForSelector('#mull.on', { timeout: 15000 }); if (await d.$('#briefOk')) { await d.click('#briefOk'); await d.waitForSelector('#mullOk'); }
  await d.click('#mullOk');
  await d.evaluate(() => LMN.UI.debug.autoplay(16));
  await d.waitForTimeout(16000); await shot(d, 'e1-desktop');
  console.log('errors', errors.length, errors.slice(0, 8));
  await browser.close();
})();
