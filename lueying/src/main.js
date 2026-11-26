// 掠影 · 启动与主循环：固定 60 Hz 模拟 + 渲染插值；输入 → 模拟 → 事件 → 渲染/HUD/音频。
import * as THREE from 'three';
import { World } from './sim/world.js';
import { DT, SHIP, QUALITY, WEAPONS } from './sim/config.js';
import { START } from './sim/level.js';
import { clamp } from './sim/noise.js';
import { GameRenderer } from './render/renderer.js';
import { HUD } from './hud/hud.js';
import { Screens, store } from './hud/screens.js';
import { renderMapCanvas } from './hud/mapcanvas.js';
import { Input } from './input/input.js';
import { GameAudio } from './audio/audio.js';
import { FX } from './render/shaderfx.js';

const canvas = document.getElementById('game');
const hudRoot = document.getElementById('hud');
const screenRoot = document.getElementById('screens');
const touchRoot = document.getElementById('touch');

const S = {
  mode: 'loading',
  world: null, renderer: null, hud: null, input: null, audio: new GameAudio(), screens: null,
  view: { yaw: START.yaw, pitch: -0.1, zoom: false, freeCam: false, freeYaw: 0, freePitch: -0.5, fx: 0, fy: 0, fz: 0 },
  ui: { targeting: false, targetPoint: null, wheel: false, wheelSel: -1, wheelAcc: { x: 0, y: 0 }, mapOpen: false, pickOnMap: false },
  pending: { jump: false, alt: false, silence: false, pulse: false, power: 0 },
  acc: 0, last: 0, fpsWin: [], qualityChecked: 0, endT: 0, lockedOnce: false, visualT: 0, zoomMark: new Map(),
};

const settings = () => S.screens.settings;

function nextFrame() { return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); }

function pickQuality() {
  const q = settings().quality;
  if (q !== 'auto') return q;
  const touch = matchMedia('(pointer: coarse)').matches;
  return touch ? 'low' : 'high';
}

async function boot() {
  S.screens = new Screens(screenRoot, {
    start: (loadout) => startMission(loadout),
    resume: () => resume(),
    restart: () => restart(),
    quit: () => quit(),
    applySettings: (s) => { S.audio.setVolume(s.vol); if (s.quality !== 'auto' && S.renderer) S.renderer.setQuality(s.quality); },
  });
  S.screens.loading('正在生成雨林、河道与研究所……');
  await nextFrame();
  try {
    S.world = new World({ loadout: S.screens.loadout });
    S.screens.loading('正在编译着色器……');
    await nextFrame();
    S.renderer = new GameRenderer(canvas, S.world, pickQuality());
    S.hud = new HUD(hudRoot, S.world, S.renderer);
    S.input = new Input(canvas);
    hudRoot.classList.add('hidden');
    // 预热：渲染一帧
    S.renderer.render(0.016, 1, titleView());
  } catch (err) {
    console.error(err);
    S.screens.show(`<div class="loading"><div class="title-mark">掠影</div><div class="load-text">无法启动 WebGL：${String(err.message || err)}</div></div>`, 'dark');
    return;
  }
  window.addEventListener('resize', () => { S.renderer.resize(); S.hud.resize(); });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (locked) S.lockedOnce = true;
    if (!locked && S.mode === 'play' && S.lockedOnce && !S.input.isTouch) pause();
  });
  canvas.addEventListener('click', () => { if (S.mode === 'play') S.input.requestLock(); });
  let quick = false;
  try { quick = sessionStorage.getItem('lueying.quick') === '1'; sessionStorage.removeItem('lueying.quick'); } catch (e) { /* 忽略 */ }
  S.mode = 'title';
  if (quick) S.screens.loadoutScreen(); else S.screens.title();
  S.last = performance.now();
  requestAnimationFrame(loop);
}

function titleView() {
  const t = S.visualT;
  return { yaw: 0, pitch: 0, zoom: false, freeCam: true, freeYaw: 0.4 + Math.sin(t * 0.05) * 0.5, freePitch: -0.08, fx: 0, fy: 0, fz: 0, visualTime: t };
}

function startMission(loadout) {
  const w = S.world;
  if (w.time > 0) { restart(); return; }
  w.weapons.slots = loadout.slice();
  w.weapons.sel = 0;
  S.renderer.freeCam = null;
  S.view.freeCam = false;
  S.view.yaw = START.yaw; S.view.pitch = -0.1;
  S.mode = 'play';
  hudRoot.classList.remove('hidden');
  if (S.input.isTouch) buildTouch();
  S.audio.start();
  S.audio.setVolume(settings().vol);
  S.input.requestLock();
  S.last = performance.now();
  S.qualityChecked = performance.now();
}

function pause() {
  if (S.mode !== 'play') return;
  S.mode = 'pause';
  S.input.releaseLock();
  S.screens.pause();
  if (S.audio.ctx) S.audio.ctx.suspend();
}
function resume() {
  S.screens.hide();
  S.mode = 'play';
  if (S.audio.ctx) S.audio.ctx.resume();
  S.input.requestLock();
  S.last = performance.now();
}
function restart() {
  try { sessionStorage.setItem('lueying.quick', '1'); } catch (e) { /* 忽略 */ }
  location.reload();
}
function quit() { location.reload(); }

// ---------- 输入处理（每帧） ----------
function viewDir() {
  const v = S.view, cp = Math.cos(v.pitch);
  return { x: -Math.sin(v.yaw) * cp, y: Math.sin(v.pitch), z: -Math.cos(v.yaw) * cp };
}

function aimRay() {
  const P = S.world.player;
  return { o: { x: P.pos.x, y: P.pos.y + 0.95, z: P.pos.z }, d: viewDir() };
}

function groundPick(maxD = 400) {
  const w = S.world, a = aimRay();
  const hit = w.combat.raycast(a.o, a.d, maxD, { skipDestructibles: true, entities: [] });
  return { x: hit.point.x, y: w.terrain.groundHeight(hit.point.x, hit.point.z), z: hit.point.z };
}

function markUnderReticle(coneDeg = 3) {
  const w = S.world, a = aimRay();
  let best = null, bd = Math.cos((coneDeg * Math.PI) / 180);
  for (const o of w.observers) {
    if (!o.alive || o.down) continue;
    const dx = o.eye.x - a.o.x, dy = o.eye.y - a.o.y, dz = o.eye.z - a.o.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 600) continue;
    const dot = (dx * a.d.x + dy * a.d.y + dz * a.d.z) / d;
    if (dot > bd) {
      const los = w.terrain.los(a.o.x, a.o.y, a.o.z, o.eye.x, o.eye.y, o.eye.z, { skipBox: o.ownerBox });
      if (!los.blocked || los.by === 'canopy') { bd = dot; best = o; }
    }
  }
  if (best) { w.markEnemy(best.id, 45); return best; }
  return null;
}

function handleEdges(edges) {
  const w = S.world, ui = S.ui, P = S.pending;
  for (const e of edges) {
    if (!e.down) {
      if (e.action === 'wheel' && ui.wheel) {
        if (ui.wheelSel >= 0) issueCommand(ui.wheelSel);
        ui.wheel = false; S.hud.showWheel(false);
      }
      continue;
    }
    switch (e.action) {
      case 'jump': P.jump = true; break;
      case 'alt': P.alt = true; break;
      case 'silence': P.silence = true; break;
      case 'pulse': P.pulse = true; break;
      case 'powerUp': P.power += 0.1; break;
      case 'powerDown': P.power -= 0.1; break;
      case 'weaponNext': w.weapons.next(1); break;
      case 'weaponPrev': w.weapons.next(-1); break;
      case 'w0': case 'w1': case 'w2': case 'w3': w.weapons.select(+e.action[1]); break;
      case 'select': w.selectNext(); break;
      case 'wheel': ui.wheel = true; ui.wheelSel = -1; ui.wheelAcc = { x: 0, y: 0 }; S.hud.wheelSel = -1; S.hud.showWheel(true, w.orderSet()); break;
      case 'c0': case 'c1': case 'c2': case 'c3': issueCommand(+e.action[1]); break;
      case 'jam': { const b = w.wingmanById('bedrock'); if (b) { b.setOrder('jam'); S.hud.lastWingKey = ''; } break; }
      case 'mark': { const o = markUnderReticle(4); if (o) S.hud.flash(`已标记 · ${o.name}`, 'field', 1.2); break; }
      case 'map': toggleMap(); break;
      case 'pause': if (ui.targeting) { ui.targeting = false; } else pause(); break;
      case 'debug': S.hud.setDebug(!S.hud.debug); break;
      case 'freecam': S.view.freeCam = !S.view.freeCam; if (S.view.freeCam) { S.view.freeYaw = S.view.yaw; S.view.freePitch = -0.5; } break;
      case 'warp': if (S.hud.debug) { w.warp(60); S.hud.flash('快进 60 秒', 'amber', 1); } break;
      case 'zoomToggle': S.view.zoomLatch = !S.view.zoomLatch; break;
      case 'click':
        if (ui.targeting) { ui.targeting = false; const pt = groundPick(); w.command('distract', { point: pt }); S.input.fire.pressed = false; S.input.fire.held = false; S.skipFire = true; }
        break;
      case 'rclick': if (ui.targeting) { ui.targeting = false; S.hud.flash('取消诱敌', '', 1); } break;
    }
  }
}

function issueCommand(i) {
  const w = S.world;
  const set = w.orderSet();
  const order = set[i];
  if (!order) return;
  if (order === 'distract') {
    if (S.input.isTouch) { S.ui.pickOnMap = true; S.hud.flash('在小地图上点选诱敌地点', 'amber', 2.5); }
    else { S.ui.targeting = true; S.hud.flash('点选诱敌地点 · 左键确认', 'amber', 1.6); }
    return;
  }
  let targetId = null;
  if (order === 'focus' || order === 'flank') {
    const a = aimRay();
    const hit = w.combat.raycast(a.o, a.d, 400, { fat: 3, skipDestructibles: true });
    if (hit.kind === 'entity') targetId = hit.entity.id;
    else { const n = w.combat.nearestHostile(groundPick(300), 120); if (n) targetId = n.id; }
  }
  w.command(i, { targetId });
}

function toggleMap() {
  const ui = S.ui;
  ui.mapOpen = !ui.mapOpen;
  let el = document.getElementById('bigmap');
  if (!ui.mapOpen) { if (el) el.remove(); return; }
  el = document.createElement('div');
  el.id = 'bigmap';
  const c = renderMapCanvas(S.world.terrain, 900);
  const g = c.getContext('2d');
  const w = S.world, k = 900 / 2000, sx = (x) => (x + 1000) * k;
  const dot = (x, z, col, r = 4) => { g.fillStyle = col; g.beginPath(); g.arc(sx(x), sx(z), r, 0, 6.3); g.fill(); };
  for (const o of w.observers) if (w.marks.has(o.id) && o.alive && !o.down) dot(o.pos.x, o.pos.z, '#E3A04C', 3);
  for (const m of w.wingmen) dot(m.ship.pos.x, m.ship.pos.z, '#C9D3C2', 3);
  dot(w.extract.x, w.extract.z, '#8FE3E8', 6);
  dot(w.player.pos.x, w.player.pos.z, '#8FE3E8', 5);
  el.appendChild(c);
  el.insertAdjacentHTML('beforeend', '<div class="bm-hint">M 关闭 · 只显示已标记的敌人</div>');
  document.body.appendChild(el);
}

// ---------- 触屏 ----------
function buildTouch() {
  touchRoot.classList.remove('hidden');
  touchRoot.innerHTML = `
    <div class="t-avatars"><button data-sel="all">全队</button><button data-sel="echo">回声</button><button data-sel="glimmer">微光</button><button data-sel="bedrock">磐石</button><button data-p="pause">❚❚</button></div>
    <div class="t-power"><input type="range" min="10" max="100" value="70" id="tPower" orient="vertical"><span>场功率</span></div>
    <div class="t-right">
      <div class="t-cmds"><button data-c="0">1</button><button data-c="1">2</button><button data-c="2">3</button><button data-c="3">4</button></div>
      <div class="t-actions">
        <button data-p="silence">静默</button><button data-p="pulse">脉冲</button><button data-p="alt">高度</button>
        <button data-h="boost">加速</button><button data-p="jump">跃升</button><button data-p="weaponNext">武器</button>
        <button data-h="zoom">放大</button><button data-p="jam">干扰</button>
      </div>
      <button class="t-fire" data-h="fire">开火</button>
    </div>`;
  const inp = S.input;
  touchRoot.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); if (b.dataset.p === 'pause') pause(); else inp.press(b.dataset.p); }, { passive: false }));
  touchRoot.querySelectorAll('[data-h]').forEach((b) => {
    b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); inp.hold(b.dataset.h, true); b.classList.add('on'); }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); inp.hold(b.dataset.h, false); b.classList.remove('on'); }, { passive: false });
  });
  touchRoot.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); issueCommand(+b.dataset.c); }, { passive: false }));
  touchRoot.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('touchstart', (e) => { e.preventDefault(); S.world.selected = b.dataset.sel; S.hud.lastWingKey = ''; }, { passive: false }));
  const pw = touchRoot.querySelector('#tPower');
  pw.addEventListener('input', () => { S.world.player.targetPower = pw.value / 100; });
  // 小地图点选
  const mini = document.getElementById('minimap');
  mini.addEventListener('touchstart', (e) => {
    if (!S.ui.pickOnMap) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    const p = S.hud.minimapToWorld(t.clientX, t.clientY);
    if (p) { S.world.command('distract', { point: { x: p.x, y: S.world.terrain.groundHeight(p.x, p.z), z: p.z } }); S.ui.pickOnMap = false; }
  }, { passive: false });
}

// ---------- 主循环 ----------
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - S.last) / 1000;
  S.last = now;
  if (!(dt > 0)) dt = 0.016;
  dt = Math.min(dt, 0.1);
  S.visualT += dt;
  const w = S.world, R = S.renderer;
  if (!w || !R) return;
  if (S.mode === 'title' || S.mode === 'loading') {
    R.freeCam = { x: START.x + 30 + Math.sin(S.visualT * 0.05) * 20, y: 7, z: START.z + 46, yaw: 0, pitch: -0.08 };
    const v = titleView();
    R.freeCam.yaw = v.freeYaw; R.freeCam.pitch = v.freePitch;
    R.render(dt, 1, { ...v, fx: 0, fy: 0, fz: 0 });
    FX.uTime.value = S.visualT;
    return;
  }
  if (S.mode === 'pause' || S.mode === 'results') {
    if (S.mode === 'results') R.render(dt, 1, { ...S.view, freeCam: false });
    return;
  }
  const inp = S.input;
  const frame = inp.consume();
  handleEdges(frame.edges);
  // 视角
  const sens = settings().sens * inp.sensitivity * (S.view.zoom ? 0.32 : 1);
  if (S.ui.wheel) {
    S.ui.wheelAcc.x += frame.look.dx; S.ui.wheelAcc.y += frame.look.dy;
    const a = S.ui.wheelAcc;
    if (Math.hypot(a.x, a.y) > 25) {
      const ang = Math.atan2(a.x, -a.y);
      const sel = ((Math.round(ang / (Math.PI / 2)) % 4) + 4) % 4;
      if (sel !== S.ui.wheelSel) { S.ui.wheelSel = sel; S.hud.wheelSel = sel; S.hud.showWheel(true, w.orderSet()); }
    }
  } else if (S.view.freeCam) {
    S.view.freeYaw -= frame.look.dx * sens;
    S.view.freePitch = clamp(S.view.freePitch - frame.look.dy * sens * (settings().invert ? -1 : 1), -1.5, 1.2);
  } else {
    S.view.yaw -= frame.look.dx * sens;
    S.view.pitch = clamp(S.view.pitch - frame.look.dy * sens * (settings().invert ? -1 : 1), -1.25, 1.1);
  }
  S.view.zoom = inp.zoomHeld() || !!S.view.zoomLatch;
  // 放大镜头凝视标记
  if (S.view.zoom) {
    const o = markUnderReticle(2.2);
    if (o && !w.marks.has(o.id)) w.markEnemy(o.id, 45);
  }
  // 飞船指令
  const ax = inp.axes();
  const P = S.pending;
  const yaw = S.view.yaw;
  const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) }, rgt = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  let mx = rgt.x * ax.x + fwd.x * ax.z, mz = rgt.z * ax.x + fwd.z * ax.z;
  if (S.view.freeCam) {
    S.view.fx = ax.x; S.view.fz = ax.z; S.view.fy = (inp.keys.has('KeyV') ? 1 : 0) - (inp.keys.has('KeyB') ? 1 : 0);
    mx = 0; mz = 0;
  }
  const powerDelta = P.power - frame.wheel * 0.05;
  P.power = 0;
  let fireHeld = frame.fire.held, firePressed = frame.fire.pressed, fireReleased = frame.fire.released;
  if (S.ui.targeting || S.ui.wheel || S.skipFire || S.view.freeCam) { firePressed = false; fireHeld = fireHeld && !S.ui.targeting && !S.skipFire && !S.view.freeCam; }
  if (!frame.fire.held) S.skipFire = false;
  if (S.ui.targeting) S.ui.targetPoint = groundPick();
  // 固定步长
  if (w.slowmoT > 0) { w.slowmoT -= dt; if (w.slowmoT <= 0) w.timeScale = 1; }
  let alpha = 1;
  if (w.hitstop > 0) {
    w.hitstop -= dt;
  } else {
    S.acc += dt * w.timeScale;
    let first = true, steps = 0;
    while (S.acc >= DT && steps < 8) {
      const cmd = { mx, mz, boost: ax.boost, jump: first && P.jump, altToggle: first && P.alt, powerDelta: first ? powerDelta : 0, silence: first && P.silence, pulse: first && P.pulse };
      w.step(DT, { ship: cmd, viewYaw: yaw, aim: aimRay(), fireHeld, firePressed: first && firePressed, fireReleased: first && fireReleased });
      if (first) { P.jump = P.alt = P.silence = P.pulse = false; }
      first = false;
      S.acc -= DT;
      steps++;
    }
    if (steps >= 8) S.acc = 0;
    alpha = S.acc / DT;
  }
  // 事件
  const events = w.drainEvents();
  R.onEvents(events);
  for (const e of events) { S.hud.onEvent(e); S.audio.onEvent(e, w); if (e.type === 'missionOver') S.endT = 2.4; }
  R.render(dt, alpha, S.view);
  S.hud.update(dt, S.view, S.ui);
  S.audio.update(dt, w, S.view);
  // 结算
  if (S.endT > 0) {
    S.endT -= dt;
    if (S.endT <= 0) { S.mode = 'results'; S.input.releaseLock(); hudRoot.classList.add('hidden'); touchRoot.classList.add('hidden'); S.screens.results(w); }
  }
  autoQuality(dt);
}

function autoQuality(dt) {
  if (settings().quality !== 'auto') return;
  S.fpsWin.push(dt);
  if (S.fpsWin.length < 240) return;
  const avg = S.fpsWin.reduce((a, b) => a + b, 0) / S.fpsWin.length;
  S.fpsWin = [];
  const fps = 1 / avg;
  const R = S.renderer;
  const order = ['high', 'medium', 'low'];
  const i = order.indexOf(R.qualityName);
  if (fps < 45 && i < 2) { R.setQuality(order[i + 1]); S.hud.flash(`画质自动降为「${{ medium: '中', low: '低' }[order[i + 1]]}」`, '', 1.5); }
}

window.__lueying = S;
boot();
