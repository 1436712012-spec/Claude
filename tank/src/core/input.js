/** Keyboard + mouse input. `virtual` lets the demo bot drive the tank. */
export class Input {
  constructor(target) {
    this.keys = new Set();
    this.edge = new Set();
    this.mx = innerWidth / 2;
    this.my = innerHeight / 2;
    this.lmb = false;
    this.rmb = false;
    this.virtual = null; // {left,right,fire,mg,aimX,aimY,jump,missile,overdrive}
    this.anyPress = false;
    const kd = (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.edge.add(e.code);
      this.keys.add(e.code);
      this.anyPress = true;
    };
    addEventListener('keydown', kd);
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.lmb = this.rmb = false; });
    target.addEventListener('mousemove', (e) => { this.mx = e.clientX; this.my = e.clientY; });
    target.addEventListener('mousedown', (e) => {
      this.mx = e.clientX; this.my = e.clientY;
      if (e.button === 0) this.lmb = true;
      if (e.button === 2) this.rmb = true;
      this.anyPress = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.rmb = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  held(code) { return this.keys.has(code); }
  pressed(code) { return this.edge.has(code); }
  get left() { return this.virtual ? this.virtual.left : this.held('KeyA') || this.held('ArrowLeft'); }
  get right() { return this.virtual ? this.virtual.right : this.held('KeyD') || this.held('ArrowRight'); }
  get fire() { return this.virtual ? this.virtual.fire : this.lmb; }
  get mg() { return this.virtual ? this.virtual.mg : this.rmb || this.held('KeyF'); }
  get jump() { return this.virtual ? this.virtual.jump : this.pressed('Space') || this.pressed('KeyW'); }
  get missile() { return this.virtual ? this.virtual.missile : this.pressed('KeyQ'); }
  get overdrive() { return this.virtual ? this.virtual.overdrive : this.pressed('KeyE'); }
  get aimX() { return this.virtual ? this.virtual.aimX : this.mx; }
  get aimY() { return this.virtual ? this.virtual.aimY : this.my; }
  endFrame() { this.edge.clear(); this.anyPress = false; if (this.virtual) { this.virtual.jump = this.virtual.missile = this.virtual.overdrive = false; } }
}
