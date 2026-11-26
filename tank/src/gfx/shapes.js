import { Prog } from './gl.js';
import { SHAPE_VS, SHAPE_FS } from './shaders.js';

export const SH = { RBOX: 0, ELL: 1, TRI: 2, TRAP: 3, RING: 4 };
export const MAT = { METAL: 0, MATTE: 1, GLASS: 2, GLOW: 3, BLOB: 4, PUFF: 5 };
const STRIDE = 16;

/** A flat instance list. One instance = 16 floats (see SHAPE_VS). */
export class List {
  constructor(cap) { this.cap = cap; this.a = new Float32Array(cap * STRIDE); this.n = 0; }
  clear() { this.n = 0; }
  push(x, y, hw, hh, rot, rad, shape, bevel, r, g, b, al, emis, mat, flash, prm) {
    if (this.n >= this.cap) return;
    const a = this.a, o = this.n * STRIDE;
    a[o] = x; a[o + 1] = y; a[o + 2] = hw; a[o + 3] = hh;
    a[o + 4] = rot; a[o + 5] = rad; a[o + 6] = shape; a[o + 7] = bevel;
    a[o + 8] = r; a[o + 9] = g; a[o + 10] = b; a[o + 11] = al;
    a[o + 12] = emis; a[o + 13] = mat; a[o + 14] = flash; a[o + 15] = prm;
    this.n++;
  }
  // convenience builders ---------------------------------------------------------------------
  rbox(x, y, hw, hh, rot, rad, c, bevel = 4, emis = 0, mat = 0, flash = 0) {
    this.push(x, y, hw, hh, rot, rad, SH.RBOX, bevel, c[0], c[1], c[2], c[3], emis, mat, flash, 0);
  }
  ell(x, y, hw, hh, rot, c, bevel = 4, emis = 0, mat = 0, flash = 0) {
    this.push(x, y, hw, hh, rot, 0, SH.ELL, bevel, c[0], c[1], c[2], c[3], emis, mat, flash, 0);
  }
  circle(x, y, r, c, bevel = 4, emis = 0, mat = 0, flash = 0) {
    this.push(x, y, r, r, 0, 0, SH.ELL, bevel, c[0], c[1], c[2], c[3], emis, mat, flash, 0);
  }
  tri(x, y, hw, hh, rot, rad, c, shear = 0, bevel = 3, emis = 0, mat = 0, flash = 0) {
    this.push(x, y, hw, hh, rot, rad, SH.TRI, bevel, c[0], c[1], c[2], c[3], emis, mat, flash, shear);
  }
  trap(x, y, hwBottom, hh, hwTop, rot, rad, c, bevel = 4, emis = 0, mat = 0, flash = 0) {
    this.push(x, y, hwBottom, hh, rot, rad, SH.TRAP, bevel, c[0], c[1], c[2], c[3], emis, mat, flash, hwTop);
  }
  ring(x, y, R, thick, c, emis = 0, mat = 0) {
    this.push(x, y, R, thick, 0, 0, SH.RING, 2, c[0], c[1], c[2], c[3], emis, mat, 0, 0);
  }
  /** additive soft glow of any shape (soft = falloff length in world units) */
  glow(x, y, hw, hh, rot, rad, shape, soft, c, intensity) {
    this.push(x, y, hw, hh, rot, rad, shape, soft, c[0], c[1], c[2], c[3] === undefined ? 1 : c[3], intensity, MAT.GLOW, 0, 0);
  }
  glowDot(x, y, r, soft, c, intensity) { this.glow(x, y, r, r, 0, 0, SH.ELL, soft, c, intensity); }
  glowLine(x0, y0, x1, y1, thick, soft, c, intensity) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    this.glow((x0 + x1) / 2, (y0 + y1) / 2, len / 2 + thick, thick, Math.atan2(dy, dx), thick, SH.RBOX, soft, c, intensity);
  }
  blob(x, y, hw, hh, c, soft) {
    this.push(x, y, hw, hh, 0, 0, SH.ELL, soft, c[0], c[1], c[2], c[3], 0, MAT.BLOB, 0, 0);
  }
  puff(x, y, r, rot, c, heat, seed) {
    this.push(x, y, r, r, rot, 0, SH.ELL, 2, c[0], c[1], c[2], c[3], heat, MAT.PUFF, 0, seed);
  }
}

export class ShapeBatch {
  constructor(gl, cap = 9000) {
    this.gl = gl;
    this.prog = new Prog(gl, SHAPE_VS, SHAPE_FS);
    this.lists = [new List(cap), new List(cap), new List(cap)]; // 0 opaque-ish, 1 smoke clouds, 2 additive
    this.cap = cap;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const q = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, q);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferData(gl.ARRAY_BUFFER, cap * STRIDE * 4, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
  }
  clear() { for (const l of this.lists) l.clear(); }
  /** program must already be configured with common uniforms by the renderer */
  draw(listIdx) {
    const l = this.lists[listIdx];
    if (!l.n) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, l.a, 0, l.n * STRIDE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, l.n);
    gl.bindVertexArray(null);
  }
}
