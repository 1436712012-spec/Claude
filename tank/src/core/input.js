import { clamp } from './math.js';

/**
 * Keyboard + mouse + touch input.
 *  - `virtual` lets the demo bot drive the tank.
 *  - `auto` lets the Gunner drive cannon + machine gun (full-auto mode).
 *  - Touch: floating left stick (move / flick up = jump), right-side drag = manual aim, buttons for jump / overdrive / pause.
 */
export class Input {
  constructor(target) {
    this.keys = new Set();
    this.edge = new Set();
    this.mx = innerWidth / 2; this.my = innerHeight / 2; this.mouseT = -1e9;
    this.lmb = false; this.rmb = false;
    this.virtual = null; this.auto = null;
    this.anyPress = false;
    this.onPause = null; this.onPointer = null;
    this.touch = {
      enabled: (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window,
      stick: { id: -1, bx: 0, by: 0, x: 0, y: 0, axis: 0, up: false, ay: 0 },
      aim: { id: -1, x: 0, y: 0, active: false, off: 70 },
      btn: { jump: -1, od: -1, pause: -1 },
    };
    this.W = innerWidth; this.H = innerHeight; this.layout();
    const kd = (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.edge.add(e.code);
      this.keys.add(e.code);
      this.anyPress = true;
    };
    addEventListener('keydown', kd);
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.lmb = this.rmb = false; this.releaseTouches(); });
    target.addEventListener('mousemove', (e) => { this.mx = e.clientX; this.my = e.clientY; this.mouseT = performance.now(); });
    target.addEventListener('mousedown', (e) => {
      this.mx = e.clientX; this.my = e.clientY; this.mouseT = performance.now();
      if (e.button === 0) this.lmb = true;
      if (e.button === 2) this.rmb = true;
      this.anyPress = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.rmb = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    // touch via pointer events (multi-touch aware)
    addEventListener('pointerdown', (e) => this._pd(e), { passive: false });
    addEventListener('pointermove', (e) => this._pm(e), { passive: false });
    addEventListener('pointerup', (e) => this._pu(e));
    addEventListener('pointercancel', (e) => this._pu(e));
    addEventListener('resize', () => { this.W = innerWidth; this.H = innerHeight; this.layout(); });
  }

  layout() {
    const W = this.W, H = this.H, r = clamp(Math.min(W, H) * 0.105, 32, 58);
    this.r = r;
    this.btns = {
      jump: { x: W - r * 1.7, y: H - r * 1.8, r },
      od: { x: W - r * 3.9, y: H - r * 1.35, r: r * 0.86 },
      pause: { x: W - r * 0.95, y: r * 0.95, r: r * 0.58 },
    };
    this.stickR = clamp(Math.min(W, H) * 0.16, 46, 84);
    this.stickHome = { x: this.stickR * 1.55, y: H - this.stickR * 1.45 };
  }
  hitBtn(x, y) {
    for (const k of Object.keys(this.btns)) {
      const b = this.btns[k];
      if (Math.hypot(x - b.x, y - b.y) <= b.r * 1.15) return k;
    }
    return null;
  }

  _pd(e) {
    if (this.onPointer) this.onPointer(e);
    if (e.pointerType === 'mouse') return;
    this.touch.enabled = true;
    e.preventDefault();
    this.anyPress = true;
    const x = e.clientX, y = e.clientY, T = this.touch;
    const b = this.hitBtn(x, y);
    if (b) {
      T.btn[b] = e.pointerId;
      if (b === 'jump') this.edge.add('Space');
      else if (b === 'od') this.edge.add('KeyE');
      else if (b === 'pause' && this.onPause) this.onPause();
      return;
    }
    if (x < this.W * 0.42 && T.stick.id < 0) {
      T.stick.id = e.pointerId; T.stick.bx = x; T.stick.by = y; T.stick.x = x; T.stick.y = y; T.stick.axis = 0; T.stick.up = false;
    } else if (T.aim.id < 0) {
      T.aim.id = e.pointerId; T.aim.x = x; T.aim.y = y; T.aim.active = true;
    }
  }
  _pm(e) {
    if (e.pointerType === 'mouse') return;
    const T = this.touch;
    if (e.pointerId === T.stick.id) {
      e.preventDefault();
      const s = T.stick, R = this.stickR;
      let dx = e.clientX - s.bx, dy = e.clientY - s.by;
      const l = Math.hypot(dx, dy);
      if (l > R) { // drag the base along so the thumb never leaves it
        s.bx += dx / l * (l - R); s.by += dy / l * (l - R); dx = e.clientX - s.bx; dy = e.clientY - s.by;
      }
      s.x = s.bx + dx; s.y = s.by + dy;
      const a = dx / R;
      s.axis = Math.abs(a) < 0.14 ? 0 : clamp((Math.abs(a) - 0.14) / 0.7, 0, 1) * Math.sign(a);
      const up = dy / R < -0.8;
      if (up && !s.up) this.edge.add('Space');
      s.up = up;
    } else if (e.pointerId === T.aim.id) {
      e.preventDefault();
      T.aim.x = e.clientX; T.aim.y = e.clientY;
    }
  }
  _pu(e) {
    const T = this.touch;
    if (e.pointerId === T.stick.id) { T.stick.id = -1; T.stick.axis = 0; T.stick.up = false; }
    if (e.pointerId === T.aim.id) { T.aim.id = -1; T.aim.active = false; }
    for (const k of Object.keys(T.btn)) if (T.btn[k] === e.pointerId) T.btn[k] = -1;
  }
  releaseTouches() {
    const T = this.touch;
    T.stick.id = -1; T.stick.axis = 0; T.aim.id = -1; T.aim.active = false;
    for (const k of Object.keys(T.btn)) T.btn[k] = -1;
  }

  held(code) { return this.keys.has(code); }
  pressed(code) { return this.edge.has(code); }
  get axis() {
    if (this.virtual) return (this.virtual.right ? 1 : 0) - (this.virtual.left ? 1 : 0);
    if (this.touch.stick.id >= 0) return this.touch.stick.axis;
    return ((this.held('KeyD') || this.held('ArrowRight')) ? 1 : 0) - ((this.held('KeyA') || this.held('ArrowLeft')) ? 1 : 0);
  }
  get left() { return this.axis < -0.2; }
  get right() { return this.axis > 0.2; }
  get fire() { return this.virtual ? this.virtual.fire : (this.auto && !this.auto.aimOnly) ? this.auto.fire : (this.lmb || !!this.touchFire); }
  get mg() { return this.virtual ? this.virtual.mg : (this.auto && !this.auto.aimOnly) ? this.auto.mg : (this.rmb || this.held('KeyF') || !!this.touchFire); }
  get jump() { return this.virtual ? this.virtual.jump : this.pressed('Space') || this.pressed('KeyW'); }
  get missile() { return this.virtual ? this.virtual.missile : this.pressed('KeyQ'); }
  get overdrive() { return this.virtual ? this.virtual.overdrive : this.pressed('KeyE'); }
  get aimX() { return this.virtual ? this.virtual.aimX : this.auto ? this.auto.aimX : (this.touch.aim.active ? this.touch.aim.x : this.mx); }
  get aimY() { return this.virtual ? this.virtual.aimY : this.auto ? this.auto.aimY : (this.touch.aim.active ? this.touch.aim.y - this.touch.aim.off : this.my); }
  endFrame() {
    this.edge.clear(); this.anyPress = false;
    if (this.virtual) { this.virtual.jump = this.virtual.missile = this.virtual.overdrive = false; }
  }
}
