// Input：把键鼠、触屏、手柄统一成同一组操作。
// 连续量（移动、视角、加速、开火按住）每帧读取；离散操作（跃升、静默、脉冲、指令……）进入边沿队列。

export const KEYMAP = {
  KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right', ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
  ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'jump', KeyC: 'alt', ControlLeft: 'alt', KeyF: 'silence', KeyG: 'pulse',
  KeyR: 'weaponNext', Digit5: 'w0', Digit6: 'w1', Digit7: 'w2', Digit8: 'w3', Tab: 'select', KeyQ: 'wheel',
  Digit1: 'c0', Digit2: 'c1', Digit3: 'c2', Digit4: 'c3', KeyT: 'jam', KeyE: 'mark', KeyM: 'map', Escape: 'pause',
  F3: 'debug', F4: 'freecam', F6: 'warp', BracketLeft: 'powerDown', BracketRight: 'powerUp', KeyZ: 'weaponPrev', KeyX: 'zoomToggle',
  KeyV: 'freeUp', KeyB: 'freeDown',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.edges = [];
    this.look = { dx: 0, dy: 0 };
    this.mouse = { left: false, right: false, x: 0, y: 0 };
    this.fire = { held: false, pressed: false, released: false };
    this.wheel = 0;
    this.locked = false;
    this.lockFailed = false;
    this.touch = { active: false, move: { x: 0, y: 0 }, stick: null, lookId: null, last: null, boost: false, fire: false, zoom: false };
    this.sensitivity = 0.0022;
    this.invertY = false;
    this.enabled = true;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (a) e.preventDefault();
      if (!this.enabled && a !== 'pause') return;
      if (this.keys.has(e.code)) return;
      this.keys.add(e.code);
      if (a) this.edges.push({ action: a, down: true });
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      this.keys.delete(e.code);
      if (a) this.edges.push({ action: a, down: false });
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.fire.held = false; this.mouse.right = false; });
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.mouse.left = true; this.fire.held = true; this.fire.pressed = true; this.edges.push({ action: 'click', down: true }); }
      if (e.button === 2) { this.mouse.right = true; this.edges.push({ action: 'rclick', down: true }); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.mouse.left) { this.mouse.left = false; this.fire.held = false; this.fire.released = true; }
      if (e.button === 2) this.mouse.right = false;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (!this.enabled) return;
      if (this.locked || this.lockFailed) { this.look.dx += e.movementX || 0; this.look.dy += e.movementY || 0; }
    });
    c.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === c; });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    // 触屏：左半屏摇杆，右半屏拖动视角
    c.addEventListener('touchstart', (e) => this._touch(e, 'start'), { passive: false });
    c.addEventListener('touchmove', (e) => this._touch(e, 'move'), { passive: false });
    c.addEventListener('touchend', (e) => this._touch(e, 'end'), { passive: false });
    c.addEventListener('touchcancel', (e) => this._touch(e, 'end'), { passive: false });
  }

  requestLock() {
    if (this.isTouch || this.locked) return;
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.lockFailed = true; });
    } catch (e) { this.lockFailed = true; }
  }

  releaseLock() {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* 忽略 */ }
  }

  _touch(e, phase) {
    e.preventDefault();
    if (!this.enabled) return;
    this.touch.active = true;
    const W = window.innerWidth;
    for (const t of e.changedTouches) {
      if (phase === 'start') {
        if (t.clientX < W * 0.42 && !this.touch.stick) {
          this.touch.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
        } else if (this.touch.lookId === null) {
          this.touch.lookId = t.identifier; this.touch.last = { x: t.clientX, y: t.clientY };
        }
      } else if (phase === 'move') {
        if (this.touch.stick && t.identifier === this.touch.stick.id) { this.touch.stick.x = t.clientX; this.touch.stick.y = t.clientY; }
        if (t.identifier === this.touch.lookId) {
          this.look.dx += (t.clientX - this.touch.last.x) * 2.2;
          this.look.dy += (t.clientY - this.touch.last.y) * 2.2;
          this.touch.last = { x: t.clientX, y: t.clientY };
        }
      } else {
        if (this.touch.stick && t.identifier === this.touch.stick.id) this.touch.stick = null;
        if (t.identifier === this.touch.lookId) this.touch.lookId = null;
      }
    }
    const s = this.touch.stick;
    if (s) {
      const R = 60;
      let dx = (s.x - s.x0) / R, dy = (s.y - s.y0) / R;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      this.touch.move.x = dx; this.touch.move.y = -dy;
    } else { this.touch.move.x = 0; this.touch.move.y = 0; }
  }

  // 触屏按钮
  press(action) { this.edges.push({ action, down: true }); }
  hold(name, v) { this.touch[name] = v; if (name === 'fire') { if (v) { this.fire.held = true; this.fire.pressed = true; } else { this.fire.held = false; this.fire.released = true; } } }

  // ---------- 每帧读取 ----------
  axes() {
    const k = (c) => this.keys.has(c);
    let x = 0, z = 0;
    if (k('KeyW') || k('ArrowUp')) z += 1;
    if (k('KeyS') || k('ArrowDown')) z -= 1;
    if (k('KeyD') || k('ArrowRight')) x += 1;
    if (k('KeyA') || k('ArrowLeft')) x -= 1;
    x += this.touch.move.x; z += this.touch.move.y;
    const gp = this._gamepad();
    if (gp) { x += gp.mx; z += gp.mz; }
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    return { x, z, boost: k('ShiftLeft') || k('ShiftRight') || this.touch.boost || !!(gp && gp.boost) };
  }

  _gamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find((g) => g && g.connected);
    if (!p) return null;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    const b = (i) => p.buttons[i] && p.buttons[i].pressed;
    const prev = this._padPrev || [];
    const edge = (i, action) => { if (b(i) && !prev[i]) this.edges.push({ action, down: true }); };
    edge(0, 'jump'); edge(1, 'silence'); edge(2, 'pulse'); edge(3, 'alt'); edge(4, 'weaponPrev'); edge(5, 'weaponNext');
    edge(12, 'c0'); edge(15, 'c1'); edge(13, 'c2'); edge(14, 'c3'); edge(11, 'select'); edge(9, 'pause'); edge(8, 'jam');
    const fire = p.buttons[7] && p.buttons[7].value > 0.3;
    if (fire && !this._padFire) { this.fire.held = true; this.fire.pressed = true; }
    if (!fire && this._padFire) { this.fire.held = false; this.fire.released = true; }
    this._padFire = fire;
    this._padPrev = p.buttons.map((x) => x.pressed);
    this.look.dx += dz(p.axes[2] || 0) * 14;
    this.look.dy += dz(p.axes[3] || 0) * 10;
    return { mx: dz(p.axes[0] || 0), mz: -dz(p.axes[1] || 0), boost: b(10), zoom: p.buttons[6] && p.buttons[6].value > 0.3 };
  }

  zoomHeld() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
    return this.mouse.right || this.touch.zoom || !!(gp && gp.buttons[6] && gp.buttons[6].value > 0.3);
  }

  consume() {
    const e = this.edges; this.edges = [];
    const look = { dx: this.look.dx, dy: this.look.dy }; this.look.dx = 0; this.look.dy = 0;
    const fire = { ...this.fire }; this.fire.pressed = false; this.fire.released = false;
    const wheel = this.wheel; this.wheel = 0;
    return { edges: e, look, fire, wheel };
  }
}
