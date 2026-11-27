import { clamp } from '../core/math.js';

/** Height-field terrain with crater deformation. Heights are sampled every `step` world units. */
export class Terrain {
  constructor(width, townX, step = 4) {
    this.W = width; this.step = step;
    this.n = Math.floor(width / step) + 1;
    this.h = new Float32Array(this.n);
    this.base = new Float32Array(this.n);
    this.dirtyMin = 0; this.dirtyMax = this.n - 1;
    for (let i = 0; i < this.n; i++) {
      const x = i * step;
      let h = 70 + 38 * Math.sin(x * 0.00135 + 1.0) + 24 * Math.sin(x * 0.0043 + 2.0) + 9 * Math.sin(x * 0.0113 + 0.4) + 4 * Math.sin(x * 0.027);
      // flatten around the town and at both ends
      const dt = Math.abs(x - townX);
      const flat = 1 - clamp((dt - 560) / 600, 0, 1);
      h = h * (1 - flat) + 46 * flat;
      const edge = Math.min(x, width - x);
      h += clamp(1 - edge / 300, 0, 1) * 40;
      this.base[i] = h; this.h[i] = h;
    }
  }
  heightAt(x) {
    const f = clamp(x / this.step, 0, this.n - 1.001);
    const i = f | 0, t = f - i;
    return this.h[i] + (this.h[i + 1] - this.h[i]) * t;
  }
  slopeAt(x) { return (this.heightAt(x + 7) - this.heightAt(x - 7)) / 14; }
  crater(x, r, depth) {
    const i0 = Math.max(0, Math.floor((x - r * 1.5) / this.step)), i1 = Math.min(this.n - 1, Math.ceil((x + r * 1.5) / this.step));
    for (let i = i0; i <= i1; i++) {
      const d = (i * this.step - x) / r, ad = Math.abs(d);
      let dh = 0;
      if (ad < 1) dh -= depth * 0.5 * (1 + Math.cos(Math.PI * ad));
      const rim = (ad - 1.18) / 0.2;
      dh += depth * 0.22 * Math.exp(-rim * rim);
      this.h[i] = Math.max(this.base[i] - 46, this.h[i] + dh);
    }
    this.dirtyMin = Math.min(this.dirtyMin, i0); this.dirtyMax = Math.max(this.dirtyMax, i1);
  }
}
