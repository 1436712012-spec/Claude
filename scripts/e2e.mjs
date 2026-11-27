// End-to-end walkthrough in headless Chromium: intro → walk → open a book →
// search → travel → reader. Saves screenshots into the given directory.
// usage: node scripts/e2e.mjs outDir [page=index.html] [width height]
import { createRequire } from 'node:module';
import { createServer } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [outDir = '.', page = 'index.html', W = '1280', H = '760', lib = 'latin'] = process.argv.slice(2);
const server = createServer('.');
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await browser.newPage({ viewport: { width: +W, height: +H } });
const logs = [];
p.on('console', (m) => { if (m.type() !== 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const shot = async (name) => { await p.screenshot({ path: `${outDir}/${name}.png` }); console.log('shot', name); };
const sleep = (ms) => p.waitForTimeout(ms);
const mode = () => p.evaluate(() => window.__babel && window.__babel.mode);

await p.goto(`http://localhost:${port}/${page}?scale=0.45&q=high`);
await p.waitForFunction(() => window.__babel, null, { timeout: 60000 });
await sleep(2500);
await shot('01-intro');

await p.click(lib === 'han' ? '#enterHan' : '#enterLatin');
await sleep(2600);
console.log('mode after enter:', await mode());
await shot('02-walk');

// open a book by clicking the centre of a shelf wall
await p.evaluate(() => { const a = window.__babel; a.yaw = (60 * Math.PI) / 180; a.pitch = -0.05; a.pos = [0.9, 1.62, 1.2]; });
await sleep(400);
const box = await p.locator('#stage').boundingBox();
await p.mouse.move(box.width / 2, box.height / 2);
await sleep(300);
await p.mouse.click(box.width / 2, box.height / 2);
await sleep(600);
await shot('03-pull');
await p.waitForFunction(() => document.querySelector('#readerLoading')?.hidden === true, null, { timeout: 60000 });
await sleep(800);
await shot('04-reader');
await p.click('#readerNext');
await sleep(300);
await shot('05-flip');
await sleep(900);
await p.keyboard.press('Escape');
await sleep(1500);
console.log('mode after close:', await mode());

// search and travel
await p.click('#btnSearch');
await sleep(500);
await shot('06-search');
await p.click('#searchGo');
await p.waitForSelector('#travelGo', { timeout: 60000 });
await sleep(400);
await shot('07-result');
await p.click('#travelGo');
await sleep(2600);
await shot('08-travel');
await p.waitForFunction(() => window.__babel.mode === 'arrive' || window.__babel.mode === 'pull' || window.__babel.mode === 'read', null, { timeout: 90000 });
await shot('09-arrive');
await p.waitForFunction(() => document.querySelector('#readerLoading')?.hidden === true && window.__babel.mode === 'read', null, { timeout: 90000 });
await sleep(1500);
await shot('10-found');
const markText = await p.evaluate(() => document.querySelector('#reader mark')?.textContent || null);
console.log('highlighted text:', markText);

console.log(logs.slice(0, 30).join('\n'));
await browser.close();
server.close();
