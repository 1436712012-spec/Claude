import { RNG } from '../core/rng.js';
import { clamp, damp, smoothstep } from '../core/math.js';
import { Terrain } from './terrain.js';
import { Tank } from './tank.js';
import { Fx } from './fx.js';
import { Town, Props } from './town.js';
import { computeSky } from './sky.js';
import { spawnEnemy, updateEnemies, updateEnemyShots, drawEnemies } from './enemies.js';
import { updateShells, updateClouds, updateTracers, updateMissiles, drawShots } from './weapons.js';
import { PT } from '../gfx/particles.js';
import { C } from '../data/palette.js';
import { SH } from '../gfx/shapes.js';

export const WORLD_W = 7000;
export const TOWN_X = 3500;
export const WAVES = 8;
const B = [1, 2, 3, 3, 4, 5, 5, 6], S = [2, 3, 3, 4, 4, 6, 6, 8], D = [0, 0, 2, 2, 3, 4, 5, 6];
const NAMES = ['黄昏', '暮色', '入夜', '深夜', '午夜', '夜半', '拂晓前', '黎明'];

export class Game {
  constructor(renderer, audio, settings, input) {
    this.r = renderer; this.audio = audio; this.set = settings; this.input = input;
    this.fx = new Fx(renderer.particles, settings);
    this.camera = {
      x: 0, y: 0, halfW: 533, halfH: 300, cssW: 1280, cssH: 720,
      screenToWorld(px, py) {
        const nx = px / this.cssW * 2 - 1, ny = -(py / this.cssH * 2 - 1);
        return { x: this.x + nx * this.halfW, y: this.y + ny * this.halfH };
      },
      worldToScreen(wx, wy) {
        return { x: ((wx - this.x) / this.halfW * 0.5 + 0.5) * this.cssW, y: (1 - ((wy - this.y) / this.halfH * 0.5 + 0.5)) * this.cssH };
      },
    };
    this.lp = new Float32Array(64); this.lc = new Float32Array(64); this.shocks = new Float32Array(32);
    this.state = 'title';
    this.skyPhase = 0.04;
    this.fxDt = 0;
    this.bot = null;
    this.reset('ironclad');
  }

  reset(seed) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.terrain = new Terrain(WORLD_W, TOWN_X);
    this.r.initTerrain(this.terrain);
    this.town = new Town(this.terrain, TOWN_X, this.rng);
    this.props = new Props(this.terrain, TOWN_X, this.rng);
    this.enemies = []; this.shells = []; this.tracers = []; this.ebullets = []; this.bombs = []; this.missiles = []; this.clouds = [];
    this.combo = { n: 0, t: 0, meter: 0, odT: 0, kills: [], lastSlow: -10, odBlend: 0 };
    this.wind = { v: 0, target: 0, t: 4 };
    this.score = 0; this.kills = 0; this.chains = 0; this.escaped = 0; this.lightsLost = 0;
    this.time = 0; this.uid = 0; this.overT = 0;
    this.fx.lights.length = 0; this.fx.glows.length = 0; this.fx.rings.length = 0; this.fx.shocks.length = 0; this.fx.texts.length = 0;
    this.fx.trauma = 0; this.fx.hitstop = 0; this.fx.slowT = 0; this.fx.slowScale = 1; this.fx.slowCur = 1;
    this.tank = new Tank(this);
    this.camera.x = this.tank.x; this.camera.y = this.tank.y + 120;
    this.wave = { n: 0, state: 'idle', t: 0, events: [], idx: 0, prog: 0 };
    this.skyPhase = 0.04;
    this.banner = null;
  }

  startGame(seed) {
    this.reset(seed || ('run' + Math.floor(Math.random() * 1e6)));
    this.state = 'play';
    this.startWave(1);
  }

  // ---- hooks used by entities --------------------------------------------------------------
  pan(x) { return clamp((x - this.camera.x) / this.camera.halfW, -1, 1); }
  sfx(name, x, a) { this.audio.play(name, this.pan(x), a || {}); }
  onTankDead() {
    this.overT = 0;
  }
  startOverdrive() {
    const c = this.combo, fx = this.fx, t = this.tank;
    c.odT = 6; c.meter = 0;
    fx.shock(t.x, t.y + 50, 520, 0.05, 0.8);
    fx.ring(t.x, t.y + 50, 20, 420, 6, 0.7, [0.3, 0.9, 1], 4);
    fx.pulse(0.2, 0.01, 0.12);
    fx.slow(0.45, 0.35);
    fx.addTrauma(0.4);
    fx.text(t.x, t.y + 170, 'OVERDRIVE', '#7af0ff', 40, 1.6);
    this.sfx('overdrive', t.x, {});
  }

  // ---- waves -----------------------------------------------------------------------------------
  startWave(n) {
    const W = this.wave;
    W.n = n; W.state = 'banner'; W.t = 0; W.idx = 0; W.prog = 0;
    const span = 15 + n * 2.6;
    const ev = [];
    const r = this.rng;
    for (let i = 0; i < B[n - 1]; i++) ev.push({ t: 1.5 + i * (span / B[n - 1]) + r.range(0, 2), kind: 'bomber', side: r.sign() });
    for (let i = 0; i < S[n - 1]; i++) ev.push({ t: 3 + i * (span / S[n - 1]) + r.range(0, 2), kind: 'scout', side: r.sign() });
    for (let i = 0; i < D[n - 1]; i++) ev.push({ t: 7 + i * (span / Math.max(1, D[n - 1])) + r.range(0, 2), kind: 'diver', side: r.sign() });
    ev.sort((a, b) => a.t - b.t);
    W.events = ev;
    this.banner = { text: '第 ' + n + ' 波', sub: NAMES[n - 1], t: 0, life: 3 };
  }

  /** test helper: spawn an aircraft at an exact position */
  spawnDirect(kind, x, y, dir) {
    const e = spawnEnemy(this, kind, dir > 0 ? -1 : 1, { x, y, dir });
    e.x = x; e.y = y; e.y0 = y; e.dir = dir; e.vx = dir * e.speed; if (e.tgtY !== undefined) e.tgtY = y;
    return e;
  }

  _spawnEvent(ev) {
    const T = this.terrain;
    if (ev.kind === 'bomber') {
      const x = clamp(TOWN_X + ev.side * this.rng.range(1150, 1450), -200, T.W + 200);
      spawnEnemy(this, 'bomber', ev.side, { x, dir: -ev.side, hpMul: 1 + (this.wave.n - 1) * 0.06 });
    } else if (ev.kind === 'scout') spawnEnemy(this, 'scout', ev.side, { hpMul: 1 + (this.wave.n - 1) * 0.04 });
    else spawnEnemy(this, 'diver', ev.side, {});
    this.sfx('incoming', this.camera.x + ev.side * this.camera.halfW, {});
  }

  _updateWave(dt) {
    const W = this.wave;
    if (W.state === 'idle') return;
    W.t += dt;
    if (W.state === 'banner') { if (W.t > 2.8) { W.state = 'spawn'; W.t = 0; } }
    else if (W.state === 'spawn' || W.state === 'clear') {
      while (W.idx < W.events.length && W.events[W.idx].t <= W.t) { this._spawnEvent(W.events[W.idx]); W.idx++; }
      W.prog = W.idx / W.events.length;
      if (W.idx >= W.events.length && W.state === 'spawn') W.state = 'clear';
      if (W.state === 'clear' && this.enemies.length === 0 && this.bombs.length === 0) { W.state = 'rest'; W.t = 0; this._waveCleared(); }
    } else if (W.state === 'rest') {
      if (W.t > 4) {
        if (W.n >= WAVES) this._win();
        else this.startWave(W.n + 1);
      }
    }
  }
  _waveCleared() {
    const t = this.tank, W = this.wave;
    t.hp = Math.min(t.hpMax, t.hp + 30);
    this.banner = { text: '第 ' + W.n + ' 波 · 肃清', sub: '灯火 ' + this.town.litCount + ' / ' + this.town.houses.length, t: 0, life: 3.4 };
    this.score += this.town.litCount * 100;
  }
  _win() {
    this.wave.state = 'idle';
    this.state = 'win';
    this.banner = { text: '黎明', sub: '你守住了 ' + this.town.litCount + ' 盏灯火', t: 0, life: 99 };
    this.fx.pulse(0.2, 0.004, 0.1);
  }

  // ---- sim step ----------------------------------------------------------------------------------
  step(dt) {
    const fx = this.fx, inp = this.input, cam = this.camera;
    fx.tickReal(dt);
    if (this.state === 'paused') return;
    const dtW = dt * fx.slowCur;
    const frozen = fx.hitstop > 0;
    const od = this.combo.odT > 0;
    const dtS = frozen ? 0 : dtW;
    const dtE = frozen ? 0 : dtW * (od ? 0.55 : 1);

    if (this.bot) this.bot.update(this, dt);

    // wind
    const wi = this.wind;
    wi.t -= dtW;
    if (wi.t <= 0) { wi.t = 7 + Math.random() * 7; wi.target = (Math.random() * 2 - 1) * (0.35 + 0.65 * Math.min(1, this.wave.n / 6)); }
    wi.v = damp(wi.v, wi.target, 0.5, dtW);

    const playing = this.state === 'play' || this.state === 'title' || this.state === 'win' || this.state === 'over';
    if (playing) {
      this.time += dtW;
      const tinp = this.state === 'over' ? NO_INPUT : inp;
      this.tank.update(this, dtW, tinp);
      updateShells(this, dtS); updateTracers(this, dtS); updateMissiles(this, dtS); updateClouds(this, dtS);
      updateEnemies(this, dtE); updateEnemyShots(this, dtE);
      this.town.update(this, dtS);
      fx.tickWorld(dtS);
      this.fxDt += dtS;
      if (this.state !== 'over') this._updateWave(dtW);
      // combo
      const c = this.combo;
      c.t -= dtW; if (c.t <= 0 && c.n > 0) c.n = 0;
      c.odBlend = damp(c.odBlend, c.odT > 0 ? 1 : 0, 6, dt);
      if (c.odT > 0) {
        c.odT -= dtW;
        if (Math.random() < 0.5) fx.ember(this.tank.x + (Math.random() - 0.5) * 90, this.tank.y + 20 + Math.random() * 60, 0, 120 + Math.random() * 120, 3, 0.6, C.plasma);
        if (c.odT <= 0) { fx.text(this.tank.x, this.tank.y + 150, '过载结束', '#9ad', 22, 1.0); this.sfx('odEnd', this.tank.x, {}); }
      }
      // state transitions
      if (this.state === 'play' || this.state === 'title') {
        if (this.tank.dead) { this.state = this.state === 'title' ? 'title' : 'over'; this.overT = 0; }
        if (this.town.litCount === 0 && this.state === 'play') { this.state = 'over'; this.overT = 0; this.banner = { text: '灯火尽灭', sub: '', t: 0, life: 99 }; }
      }
      if (this.state === 'over') this.overT += dt;
      if (this.state === 'title' && (this.tank.dead || this.town.litCount === 0)) {
        this.overT += dt;
        if (this.overT > 3) { this.reset('demo' + Math.floor(Math.random() * 999)); this.startWave(1); }
      }
    }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.life) this.banner = null; }

    // camera
    const t = this.tank;
    const lead = clamp((t.aimX - t.x) * 0.22, -150, 150);
    const tx = t.x + lead + (t.vx * 0.25);
    const hw = cam.halfW;
    cam.x = clamp(damp(cam.x, tx, 4.5, dt), hw, this.terrain.W - hw);
    cam.y = damp(cam.y, t.y * 0.8 + this.terrain.heightAt(t.x) * 0.2 + 125, 3, dt);

    // sky
    let target;
    if (this.state === 'win') target = 1;
    else if (this.state === 'title' && !this.bot?.active) target = 0.06;
    else target = clamp(((this.wave.n || 1) - 1 + (this.wave.prog || 0) * 0.85) / WAVES, 0, 0.98);
    this.skyPhase = damp(this.skyPhase, target, 0.6, dt);
  }

  /** step GPU particles for the sim time accumulated since the last draw (used when stepping headless) */
  flushParticles() {
    if (this.fxDt > 0) { this.r.simParticles(this.fxDt, this.wind.v, this.time); this.fxDt = 0; }
  }

  resizeCamera(cssW, cssH) {
    const c = this.camera;
    c.cssW = cssW; c.cssH = cssH;
  }

  // ---- frame assembly ------------------------------------------------------------------------------
  draw(realDt) {
    const fx = this.fx, cam = this.camera, r = this.r;
    const zoom = 1 + fx.zoomPunch * 0.04;
    cam.halfH = 300 / zoom;
    cam.halfW = cam.halfH * (cam.cssW / cam.cssH);
    const shake = fx.shakeOffset();
    const sky = computeSky(this.skyPhase);

    const sh = r.shapes;
    sh.clear();
    const L0 = sh.lists[0], L1 = sh.lists[1], LA = sh.lists[2];
    this.props.draw(this, L0, LA, true);
    this.town.draw(this, L0, LA);
    this.props.draw(this, L0, LA, false);
    this.tank.draw(this, L0, LA);
    drawEnemies(this, L0, LA);
    drawShots(this, L0, L1, LA);
    fx.drawAdd(LA);

    // overdrive aura
    if (this.combo.odBlend > 0.02) {
      const t = this.tank, k = this.combo.odBlend;
      LA.glow(t.x, t.y + 40, 90, 60, 0, 0, SH.ELL, 38, C.plasma, 0.8 * k);
    }

    // lights
    const persistent = [];
    this.town.lights(this, persistent);
    const t = this.tank;
    persistent.push({ x: t.x, y: t.y - 14, z: 26, r: 170, col: [0.3, 0.85, 1.0], i: 0.65 + this.combo.odBlend * 1.8 });
    const lightCount = fx.packLights(cam, persistent, this.lp, this.lc);
    const shockCount = fx.packShocks(cam, this.shocks);

    const set = this.set;
    const lowHp = this.tank.hp < 30 && !this.tank.dead ? (0.5 + 0.5 * Math.sin(this.time * 6)) * 0.25 : 0;
    const frame = {
      cam: { x: cam.x, y: cam.y, halfW: cam.halfW, halfH: cam.halfH },
      shake, time: this.time + fx.t * 0, wind: this.wind.v, fxDt: this.fxDt,
      sky, lightCount, lightPos: this.lp, lightCol: this.lc, shockCount, shocks: this.shocks,
      post: {
        exposure: 1.0 + fx.exposure, bloom: 0.42 * set.bloom, threshold: 1.15, ca: 0.0009 + fx.ca + this.combo.odBlend * 0.0016, vig: 1.0,
        grain: 0.03, hurt: Math.min(1, fx.hurt * 0.9 + lowHp), od: this.combo.odBlend, ray: sky.rayAmt * set.rays, flash: fx.flash,
        sunUv: [(sky.rayUv[0] - 0.5) + 0.5, sky.rayUv[1]],
      },
    };
    this.fxDt = 0;
    this.lastFrame = frame;
    r.render(frame);
  }
}

const NO_INPUT = { left: false, right: false, fire: false, mg: false, jump: false, missile: false, overdrive: false, aimX: 640, aimY: 300 };
