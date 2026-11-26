// Plays through 外勤训练 with real pointer events, screenshotting coached steps.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = process.argv[2] || '/tmp';
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/net::|fonts/.test(m.text()) && errs.push(m.text()));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', 'liminal.html'));
  await p.waitForFunction(() => window.LMN_READY);
  await p.evaluate(() => { localStorage.clear(); LMN.Store.settings.fast = true; LMN.Menus.applySettings(); });
  await p.mouse.click(195, 700);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(out, 't00-title.png') });
  await p.click('#goTut');
  const idle = () => p.waitForFunction(() => LMN.UI.isMyTurn() && !LMN.UI.busy() && document.getElementById('coach') && document.getElementById('coach').style.display === 'block', null, { timeout: 60000 });
  const center = (sel) => p.evaluate((s) => { const e = typeof s === 'string' ? document.querySelector(s) : null; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left }; }, sel);
  let shot = 1;
  const snap = async (n) => p.screenshot({ path: path.join(out, `t${String(shot++).padStart(2, '0')}-${n}.png`) });
  const next = async () => { await idle(); await p.waitForTimeout(300); await p.click('#coach .cbub button'); await p.waitForTimeout(250); };
  const drag = async (fromSel, toSel) => { await idle(); await p.waitForTimeout(300); const a = await center(fromSel), t = await center(toSel); const sx = a.l + 12; await p.mouse.move(sx, a.y); await p.mouse.down(); for (let k = 1; k <= 10; k++) await p.mouse.move(sx + ((t.x - sx) * k) / 10, a.y + ((t.y - a.y) * k) / 10); await p.mouse.up(); await p.waitForTimeout(400); };
  const tap = async (sel) => { const c = await center(sel); await p.mouse.click(c.x, c.y); await p.waitForTimeout(250); };
  // turn 1
  await idle(); await p.waitForTimeout(400); await snap('hero');
  await next(); await next(); await snap('mana'); await next();
  await idle(); await p.waitForTimeout(500); await snap('drag-hint');
  // a wrong move is refused
  await tap('#endTurn'); await snap('refused');
  await drag('#hand .card[data-cid="S04"]', '#boardP');
  await idle(); await snap('taunt-info'); await next();
  await idle(); await tap('#endTurn');
  // turn 2
  await idle(); await next();
  await idle(); await p.waitForTimeout(300); await snap('attack-hint');
  await tap('#boardP .minion[data-cid="S04"]'); await tap('#boardE .minion[data-cid="N01"]');
  await idle(); await next();
  await idle(); await tap('#hpP');
  await idle(); await tap('#endTurn');
  // turn 3
  await idle(); await next();
  await idle(); await p.waitForTimeout(300); await snap('anomaly');
  await drag('#hand .card[data-cid="N03"]', '#boardP');
  await idle(); await snap('sanity'); await next(); await idle(); await snap('depth'); await next();
  await idle(); await tap('#endTurn');
  // turn 4
  await idle(); await next();
  await drag('#hand .card[data-cid="N08"]', '#boardP');
  await idle(); await snap('layer1'); await next();
  await idle(); await tap('#hand .card[data-cid="S11"]'); await tap('#boardE .minion[data-cid="N04"]');
  await idle(); await snap('contain'); await next();
  await idle(); await snap('lethal');
  await tap('#boardP .minion[data-cid="N03"]'); await tap('#heroE');
  await idle(); await tap('#boardP .minion[data-cid="S04"]'); await tap('#heroE');
  await p.waitForSelector('#endov.on', { timeout: 30000 }); await p.waitForTimeout(600); await snap('done');
  console.log('trained:', await p.evaluate(() => LMN.Store.progress.trained), 'errors', errs);
  await b.close();
})();
