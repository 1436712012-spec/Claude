// Keyboard + gamepad + touch joystick, collapsed into one movement vector and
// a few edge-triggered actions.

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  moveX = 0;
  moveY = 0;
  private touchId: number | null = null;
  private touchOrigin = { x: 0, y: 0 };
  private touchVec = { x: 0, y: 0 };
  private lastTap = 0;
  private padDashLatch = false;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const now = performance.now();
      if (now - this.lastTap < 280) this.pressed.add('Space'); // double tap = noclip
      this.lastTap = now;
      this.touchId = e.pointerId;
      this.touchOrigin = { x: e.clientX, y: e.clientY };
      this.touchVec = { x: 0, y: 0 };
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.touchId) return;
      const dx = e.clientX - this.touchOrigin.x, dy = e.clientY - this.touchOrigin.y;
      const len = Math.hypot(dx, dy), max = 60;
      const k = len > max ? max / len : 1;
      this.touchVec = { x: (dx * k) / max, y: (dy * k) / max };
    });
    const end = (e: PointerEvent) => { if (e.pointerId === this.touchId) { this.touchId = null; this.touchVec = { x: 0, y: 0 }; } };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  down(code: string) { return this.keys.has(code); }
  consume(code: string) { const had = this.pressed.has(code); this.pressed.delete(code); return had; }

  update() {
    let x = 0, y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    x += this.touchVec.x; y += this.touchVec.y;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.18) { x += ax; y += ay; }
      const dash = !!(p.buttons[0]?.pressed || p.buttons[5]?.pressed);
      if (dash && !this.padDashLatch) this.pressed.add('Space');
      this.padDashLatch = dash;
      if (p.buttons[9]?.pressed) this.pressed.add('Escape');
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.moveX = x; this.moveY = y;
  }

  endFrame() { this.pressed.clear(); }
}
