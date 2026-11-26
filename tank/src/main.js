import { Renderer } from './gfx/renderer.js';
import { Input } from './core/input.js';
import { Game } from './sim/game.js';
import { Bot } from './sim/bot.js';
import { Hud } from './ui/hud.js';
import { AudioEngine } from './audio/audio.js';
import { loadSettings, saveSettings, buildPanel } from './ui/settings.js';
import { DEFS, ORDER } from './sim/arsenal.js';
import { clamp } from './core/math.js';

const params = new URLSearchParams(location.search);
const STEP = 1 / 60;

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const settings = loadSettings();
if (params.has('fx')) settings.fx = +params.get('fx');
const renderer = new Renderer(glCanvas);
const input = new Input(window);
const isTouch = input.touch.enabled;
if (settings.autoFire === null || settings.autoFire === undefined) settings.autoFire = isTouch;
if (params.has('auto')) settings.autoFire = params.get('auto') !== '0';
const audio = new AudioEngine(settings);
const game = new Game(renderer, audio, settings, input);
const hud = new Hud(hudCanvas);
hud.showFps = params.has('fps');

// quality / adaptive resolution ---------------------------------------------------------------
let renderScale = isTouch ? 0.75 : 1, adaptEma = 16.7, adaptCount = 0;
const QUALITY = { low: 0.6, med: 0.8, high: 1 };
function applySize() {
  const cssW = innerWidth, cssH = innerHeight;
  const dprCap = params.has('dpr') ? +params.get('dpr') : (isTouch ? 1.5 : 2);
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  const q = settings.quality === 'auto' ? renderScale : QUALITY[settings.quality] || 1;
  renderer.resize(cssW * dpr * q, cssH * dpr * q);
  glCanvas.style.width = cssW + 'px'; glCanvas.style.height = cssH + 'px';
  hud.resize(cssW, cssH, Math.min(dpr, 2));
  game.resizeCamera(cssW, cssH);
}
addEventListener('resize', applySize);
applySize();

// state / menus ---------------------------------------------------------------------------------
const panel = buildPanel(settings, (key) => {
  saveSettings(settings);
  if (key === 'volume' || key === 'music') audio.applyVolume();
  if (key === 'quality') applySize();
}, () => setPaused(false));
panel.style.display = 'none';
document.body.append(panel);

let bot = null;
function startBot() {
  bot = new Bot(); game.bot = bot; input.virtual = bot.v;
}
function stopBot() { bot = null; game.bot = null; input.virtual = null; }

startBot(); // attract mode behind the title
function parseLoadout() {
  const a = params.get('arms');
  if (!a) return null;
  const lv = Math.max(1, Math.min(5, +(params.get('lv') || 1)));
  const ids = a === 'all' ? ORDER.filter((id) => !DEFS[id].passive) : a.split(',').filter((id) => DEFS[id]);
  return ids.map((id) => [id, lv]);
}
if (params.has('autostart')) game.startGame(params.get('seed') || 'shot', parseLoadout() || [['tesla', 1]]);

function begin() {
  audio.init();
  stopBot();
  game.startGame(null, parseLoadout());
  document.body.classList.add('playing');
  if (isTouch) {
    try { const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el); } catch (e) { /* not allowed */ }
    try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (e) { /* unsupported */ }
  }
}
function setPaused(p) {
  if (p && game.state === 'play') { game.state = 'paused'; panel.style.display = 'block'; document.body.classList.remove('playing'); }
  else if (!p && game.state === 'paused') { game.state = 'play'; panel.style.display = 'none'; document.body.classList.add('playing'); }
}
addEventListener('keydown', (e) => {
  audio.init();
  if (game.state === 'pick') {
    const k = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (k !== undefined) game.choose(k);
    return;
  }
  if (e.code === 'KeyT' && !e.repeat && game.state !== 'title') { settings.autoFire = !settings.autoFire; saveSettings(settings); game.fx.text(game.tank.x, game.tank.y + 150, settings.autoFire ? '全自动开火' : '手动开火', '#7af0ff', 22, 1.2); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(game.state === 'play'); return; }
  if (game.state === 'title' && !e.repeat && e.code !== 'F12') begin();
  else if ((game.state === 'over' && game.overT > 1.5) || game.state === 'win') { if (e.code === 'Enter' || e.code === 'Space') begin(); }
});
input.onPointer = (e) => {
  audio.init();
  if (panel.contains(e.target)) return;
  if (game.state === 'title') begin();
  else if (game.state === 'pick') { const i = hud.hitCard(e.clientX, e.clientY); if (i >= 0) game.choose(i); }
  else if ((game.state === 'over' && game.overT > 1.5) || game.state === 'win') begin();
};
input.onPause = () => setPaused(game.state === 'play');
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
addEventListener('blur', () => setPaused(true));

// loop ------------------------------------------------------------------------------------------
let last = performance.now(), acc = 0, frames = 0, frameEma = 16.7;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.1);
  acc += dt;
  let n = 0;
  if (window.__freeze) acc = 0; // test hook: hold the simulation still for a screenshot
  while (acc >= STEP && n < 5) {
    game.step(STEP); input.endFrame();
    acc -= STEP; n++;
    if (game.state === 'paused') { acc = 0; break; }
  }
  if (n === 5) acc = 0;
  if (window.__noRender) return; // test hook: skip drawing while stepping headless
  audio.update(game, dt);
  game.draw(dt);
  hud.draw(game, input);

  // adaptive resolution
  frameEma += (dt * 1000 - frameEma) * 0.05;
  hud.fps = 1000 / frameEma;
  if (settings.quality === 'auto' && game.state !== 'paused' && !params.has('noadapt')) {
    if (++adaptCount > 90) {
      adaptCount = 0;
      if (frameEma > 21 && renderScale > 0.55) { renderScale = Math.max(0.55, renderScale - 0.1); applySize(); game.fx.auto = clamp(renderScale + 0.15, 0.45, 1); }
      else if (frameEma < 14 && renderScale < 1) { renderScale = Math.min(1, renderScale + 0.05); applySize(); game.fx.auto = clamp(renderScale + 0.15, 0.45, 1); }
    }
  }
  frames++;
  window.__stats = { fps: hud.fps, scale: renderScale, frames, particles: renderer.particles.high, enemies: game.enemies.length };
}
requestAnimationFrame(frame);

// test / debug hooks ----------------------------------------------------------------------------
window.__game = {
  game, renderer, hud, settings, input,
  /** run the simulation headless for `sec` seconds (particles keep stepping, nothing is drawn) */
  advance(sec) {
    const n = Math.round(sec / STEP);
    for (let i = 0; i < n; i++) { game.step(STEP); input.endFrame(); if (i % 2 === 1) game.flushParticles(); }
    game.flushParticles();
  },
  stress(count) {
    const P = renderer.particles, t = game.tank;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, sp = 100 + Math.random() * 700, ty = [0, 1, 4, 2][i % 4];
      P.emit(t.x + 200, t.y + 150, Math.cos(a) * sp, Math.sin(a) * sp, 2 + Math.random() * 3, ty === 2 ? 30 : 3, ty, 1, 0.5, 0.2, ty === 2);
      if (P.n >= 11000) { P._flush(); }
    }
  },
  /** place one aircraft of each type inside the view (visual tests) */
  spawnTest() {
    const c = game.camera;
    const mk = (kind, dx, y, dir) => { const e = game.spawnDirect(kind, c.x + dx, y, dir); return e; };
    mk('bomber', -230, 330, 1); mk('scout', 330, 250, -1); mk('diver', 60, 400, 1);
  },
  give(id, lv = 1) { for (let i = 0; i < lv; i++) game.arms.add(id); },
  begin, startBot, stopBot,
};
