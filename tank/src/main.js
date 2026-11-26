import { Renderer } from './gfx/renderer.js';
import { Input } from './core/input.js';
import { Game } from './sim/game.js';
import { Bot } from './sim/bot.js';
import { Hud } from './ui/hud.js';
import { AudioEngine } from './audio/audio.js';
import { loadSettings, saveSettings, buildPanel } from './ui/settings.js';
import { clamp } from './core/math.js';

const params = new URLSearchParams(location.search);
const STEP = 1 / 60;

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const settings = loadSettings();
if (params.has('fx')) settings.fx = +params.get('fx');
const renderer = new Renderer(glCanvas);
const input = new Input(window);
const audio = new AudioEngine(settings);
const game = new Game(renderer, audio, settings, input);
const hud = new Hud(hudCanvas);
hud.showFps = params.has('fps');

// quality / adaptive resolution ---------------------------------------------------------------
let renderScale = 1, adaptEma = 16.7, adaptCount = 0;
const QUALITY = { low: 0.6, med: 0.8, high: 1 };
function applySize() {
  const cssW = innerWidth, cssH = innerHeight;
  const dprCap = params.has('dpr') ? +params.get('dpr') : 2;
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
});
panel.style.display = 'none';
document.body.append(panel);

let bot = null;
function startBot() {
  bot = new Bot(); game.bot = bot; input.virtual = bot.v;
}
function stopBot() { bot = null; game.bot = null; input.virtual = null; }

if (params.has('bot') || params.has('autostart') || true) startBot(); // attract mode behind the title
if (params.has('autostart')) { game.startGame(params.get('seed') || 'shot'); if (!params.has('bot')) { /* keep bot for hands-free runs */ } }

function begin() {
  audio.init();
  stopBot();
  game.startGame();
  document.body.classList.add('playing');
}
function setPaused(p) {
  if (p && game.state === 'play') { game.state = 'paused'; panel.style.display = 'block'; document.body.classList.remove('playing'); }
  else if (!p && game.state === 'paused') { game.state = 'play'; panel.style.display = 'none'; document.body.classList.add('playing'); }
}
addEventListener('keydown', (e) => {
  audio.init();
  if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(game.state === 'play'); return; }
  if (game.state === 'title' && !e.repeat && e.code !== 'F12') begin();
  else if ((game.state === 'over' && game.overT > 1.5) || game.state === 'win') { if (e.code === 'Enter' || e.code === 'Space') begin(); }
});
addEventListener('mousedown', (e) => {
  audio.init();
  if (panel.contains(e.target)) return;
  if (game.state === 'title') begin();
  else if ((game.state === 'over' && game.overT > 1.5) || game.state === 'win') begin();
});
addEventListener('blur', () => setPaused(true));

// loop ------------------------------------------------------------------------------------------
let last = performance.now(), acc = 0, frames = 0, frameEma = 16.7;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.1);
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 5) {
    game.step(STEP); input.endFrame();
    acc -= STEP; n++;
    if (game.state === 'paused') { acc = 0; break; }
  }
  if (n === 5) acc = 0;
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
  begin, startBot, stopBot,
};
