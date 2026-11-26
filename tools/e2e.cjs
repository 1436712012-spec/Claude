// Browser smoke test: phone-portrait viewport, walks title → dispatch → mulligan → match,
// lets the AI play the human seat to the end, and fails on any console error.
// usage: node tools/e2e.cjs [outDir] [--full] [--boss=boss_manager] [--deck=pre_site] [--agent=agent_shen]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'test', 'shots');
const full = args.includes('--full');
const opt = (k, d) => (args.find((a) => a.startsWith('--' + k + '=')) || '').split('=')[1] || d;
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_|net::/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', 'liminal.html'));
  await page.waitForFunction(() => window.LMN_READY);
  await page.evaluate(() => { localStorage.clear(); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, '01-title.png') });
  await page.mouse.click(195, 600);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '02-title-menu.png') });
  await page.click('[data-go="setup"]');
  await page.waitForTimeout(300);
  await page.evaluate(({ boss, deck, agent }) => { LMN.Store.selected = { agent, deck, boss }; LMN.Menus.show('setup'); }, { boss: opt('boss', 'boss_manager'), deck: opt('deck', 'pre_site'), agent: opt('agent', 'agent_shen') });
  await page.screenshot({ path: path.join(out, '03-setup.png'), fullPage: true });
  await page.click('#goMatch');
  await page.waitForSelector('#mull.on', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, '04-mulligan.png') });
  await page.click('#mullOk');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, '05-board.png') });
  // play a few turns via autoplay with fast animations
  await page.evaluate(() => { LMN.Store.settings.fast = true; LMN.Menus.applySettings(); });
  const turns = full ? 400 : 14;
  const t0 = Date.now();
  await page.evaluate((n) => { window.__auto = LMN.UI.debug.autoplay(n); }, turns);
  let shot = 6;
  for (let i = 0; i < (full ? 240 : 40); i++) {
    await page.waitForTimeout(1500);
    const st = await page.evaluate(() => { const G = LMN.UI.debug.G; return G ? { over: G.over, turn: G.turn, layer: G.layer, hp: [G.players[0].hp, G.players[1].hp] } : { over: true }; });
    if (i % 6 === 5 && shot < 14) await page.screenshot({ path: path.join(out, `${String(shot++).padStart(2, '0')}-play-t${st.turn}-L${st.layer}.png`) });
    if (st.over) break;
  }
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(out, '99-end.png') });
  const final = await page.evaluate(() => { const G = LMN.UI.debug.G; return G ? { over: G.over, winner: G.winner, turn: G.turn, deepest: G.deepest } : null; });
  console.log('final', JSON.stringify(final), 'secs', ((Date.now() - t0) / 1000).toFixed(0));
  console.log('errors', errors.length);
  for (const e of errors.slice(0, 12)) console.log('  ', e);
  await browser.close();
  process.exitCode = errors.length ? 1 : 0;
})();
