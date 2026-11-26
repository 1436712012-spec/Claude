// Input-layer test with real pointer events on a phone viewport:
// tap card → tap board (place), drag card onto board, tap minion → tap enemy (attack), hero power, end turn.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::|fonts/.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', 'liminal.html'));
  await page.waitForFunction(() => window.LMN_READY);
  await page.mouse.click(195, 600);
  const results = [];
  const check = (name, cond) => { results.push((cond ? '✓ ' : '✗ ') + name); };
  // deterministic start: we go first with a known hand of cheap minions
  await page.evaluate(() => {
    LMN.Store.settings.fast = true; LMN.Menus.applySettings();
    const deck = Array(30).fill('N01').map((c, i) => (i % 3 === 0 ? 'S01' : i % 3 === 1 ? 'N01' : 'N04'));
    LMN.UI.start({ agent: 'agent_shen', deck, boss: 'boss_manager' });
  });
  await page.waitForSelector('#mull.on', { timeout: 15000 });
  if (await page.$('#briefOk')) { await page.click('#briefOk'); await page.waitForSelector('#mullOk'); }
  await page.click('#mullOk');
  const waitIdle = () => page.waitForFunction(() => LMN.UI.isMyTurn() && !LMN.UI.busy(), null, { timeout: 60000 });
  await waitIdle();
  await page.evaluate(() => { const G = LMN.UI.debug.G; G.players[0].mana = G.players[0].maxMana = 10; LMN.UI.relayout(); });
  await page.waitForTimeout(300);
  const handRect = (i) => page.evaluate((i) => { const els = Array.from(document.querySelectorAll('#hand .card')); els.sort((a, b) => +a.dataset.idx - +b.dataset.idx); const r = els[i].getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, uid: +els[i].dataset.uid }; }, i);
  const boardN = (side) => page.evaluate((s) => document.querySelectorAll(s === 'P' ? '#boardP .minion' : '#boardE .minion').length, side);
  const box = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

  // 1) tap a card, then tap the board
  let c0 = await handRect(0);
  await page.mouse.click(c0.x + 8, c0.y + 30);
  await page.waitForTimeout(200);
  const selected = await page.evaluate(() => document.querySelector('#boardP').classList.contains('dropzone'));
  check('tap selects a minion card (board shows drop zone)', selected);
  const bp = await box('#boardP');
  await page.mouse.click(bp.x, bp.y);
  await waitIdle();
  check('tap on board places the minion', (await boardN('P')) === 1);

  // 2) drag a card from the hand onto the board
  c0 = await handRect(0);
  await page.mouse.move(c0.x + 8, c0.y + 30);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(c0.x + 8 + k * 6, c0.y + 30 - k * 28);
  const bp2 = await box('#boardP');
  await page.mouse.move(bp2.x + 60, bp2.y);
  await page.mouse.up();
  await waitIdle();
  check('drag-to-play places a second minion', (await boardN('P')) === 2);

  // 3) hero power (沈砚: no target)
  const hp = await box('#hpP');
  const arm0 = await page.evaluate(() => LMN.UI.debug.G.players[0].armor);
  await page.mouse.click(hp.x, hp.y);
  await waitIdle();
  check('hero power grants armor', (await page.evaluate(() => LMN.UI.debug.G.players[0].armor)) === arm0 + 2);

  // 4) end turn, let the gatekeeper act, come back
  const et = await box('#endTurn');
  await page.mouse.click(et.x, et.y);
  await page.waitForTimeout(500);
  check('turn passed to the gatekeeper', await page.evaluate(() => LMN.UI.debug.G.active === 1));
  await waitIdle();
  check('turn came back', await page.evaluate(() => LMN.UI.debug.G.active === 0));

  // 5) attack: tap a ready minion, then tap a legal target
  const target = await page.evaluate(() => {
    const G = LMN.UI.debug.G;
    const m = G.players[0].board.find((x) => LMN.E.canAttack(G, x.uid));
    if (!m) return null;
    const tg = LMN.E.attackTargets(G, m.uid);
    const t = tg[0];
    const el = (u) => (u === G.players[1].uid ? document.getElementById('heroE') : document.querySelector(`.minion[data-uid="${u}"]`));
    const a = el(m.uid).getBoundingClientRect(), b = el(t).getBoundingClientRect();
    return { a: { x: a.left + a.width / 2, y: a.top + a.height / 2 }, b: { x: b.left + b.width / 2, y: b.top + b.height / 2 }, uid: m.uid, t };
  });
  if (target) {
    const before = await page.evaluate((u) => { const c = LMN.E.char(LMN.UI.debug.G, u); return c ? c.hp : 0; }, target.t);
    await page.mouse.click(target.a.x, target.a.y);
    await page.waitForTimeout(150);
    await page.mouse.click(target.b.x, target.b.y);
    await waitIdle();
    const after = await page.evaluate((u) => { const c = LMN.E.char(LMN.UI.debug.G, u); return c ? c.hp : -99; }, target.t);
    check('tap-tap attack damages the target', after < before);
  } else check('a minion was ready to attack', false);

  // 6) scrub: press on the hand, slide, release selects the card under the finger
  const n = await page.evaluate(() => document.querySelectorAll('#hand .card').length);
  if (n >= 2) {
    const a = await handRect(0), b = await handRect(n - 1);
    await page.mouse.move(a.x + 8, a.y + 40);
    await page.mouse.down();
    await page.waitForTimeout(320);
    const prev = await page.evaluate(() => !!document.querySelector('#domfx .card'));
    for (let k = 1; k <= 10; k++) await page.mouse.move(a.x + 8 + ((b.x + 20 - a.x) * k) / 10, a.y + 40);
    await page.mouse.up();
    await page.waitForTimeout(200);
    check('long press shows a big preview', prev);
    const sel = await page.evaluate((u) => { const el = document.querySelector(`#hand .card[data-uid="${u}"]`); return el && el.style.transform.includes('scale(1.12)'); }, b.uid);
    check('scrub release selects the last card', sel);
  }
  // 7) inspect via long press on a minion
  await page.evaluate(() => document.querySelectorAll('.ov.on').forEach((o) => o.classList.remove('on')));
  const mm = await box('#boardP .minion');
  await page.mouse.move(mm.x, mm.y);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await page.waitForTimeout(200);
  check('long press on a minion opens the inspect view', await page.evaluate(() => document.getElementById('inspect').classList.contains('on')));
  // 8) drag a battlecry minion onto the board, then pick its target
  await page.evaluate(() => document.querySelectorAll('.ov.on').forEach((o) => o.classList.remove('on')));
  await waitIdle();
  const prep = await page.evaluate(() => {
    const G = LMN.UI.debug.G;
    if (G.players[0].board.length >= 7) G.players[0].board.length = 5;
    if (!G.players[1].board.some((m) => !m.kw.stealth)) LMN.E.summon(G, 1, 'N04');
    G.players[0].mana = 10;
    const ci = LMN.E.mkCard(G, 'S03');
    G.players[0].hand.unshift(ci);
    return ci.uid;
  });
  // re-render so the injected card exists in the DOM
  await page.evaluate(() => LMN.UI._forceRender());
  await page.waitForTimeout(300);
  const cr = await page.evaluate((u) => { const el = document.querySelector(`#hand .card[data-uid="${u}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + 10, y: r.top + 30 }; }, prep);
  if (cr) {
    const bp3 = await box('#boardP');
    await page.mouse.move(cr.x, cr.y);
    await page.mouse.down();
    for (let k = 1; k <= 12; k++) await page.mouse.move(cr.x + k * 4, cr.y - k * 30);
    await page.mouse.move(bp3.x, bp3.y);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const tgt = await page.evaluate(() => { const el = document.querySelector('#boardE .minion.target'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, uid: +el.dataset.uid }; });
    check('dragged battlecry minion keeps waiting for a target', !!tgt);
    if (tgt) {
      await page.mouse.click(tgt.x, tgt.y);
      await waitIdle();
      check('battlecry target frozen', await page.evaluate((u) => { const c = LMN.E.char(LMN.UI.debug.G, u); return !!(c && c.frozen); }, tgt.uid));
    }
  } else check('battlecry card rendered in hand', false);
  await page.screenshot({ path: path.join(process.argv[2] || '/tmp', 'interact.png') });
  console.log(results.join('\n'));
  console.log('errors', errors.length, errors.slice(0, 5));
  await browser.close();
  process.exitCode = results.some((r) => r.startsWith('✗')) || errors.length ? 1 : 0;
})();
