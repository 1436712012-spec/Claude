import { Prog } from './gl.js';
import { PART_UPDATE_VS, PART_UPDATE_FS, PART_DRAW_VS, PART_DRAW_FS } from './shaders.js';

export const PT = { SPARK: 0, EMBER: 1, SMOKE: 2, DEBRIS: 3, FIRE: 4, DUST: 5, CASING: 6 };
const F = 12; // floats per particle

/**
 * GPU particle system. State lives in a ping-pong pair of buffers, updated with transform feedback
 * (gravity, drag, turbulence, wind and collision against the terrain height texture all run on the GPU).
 * New particles are written by the CPU into a ring region of the current buffer.
 */
export class Particles {
  constructor(gl, cap = 65536) {
    this.gl = gl;
    this.cap = cap;
    this.stageCap = 12000;
    this.stage = new Float32Array(this.stageCap * F);
    this.n = 0;
    this.head = 0;
    this.high = 0;
    this.cur = 0;
    this.update = new Prog(gl, PART_UPDATE_VS, PART_UPDATE_FS, ['oA', 'oB', 'oC']);
    this.draw = new Prog(gl, PART_DRAW_VS, PART_DRAW_FS);
    this.bufs = [gl.createBuffer(), gl.createBuffer()];
    const zero = new Float32Array(cap * F);
    for (const b of this.bufs) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, zero, gl.DYNAMIC_COPY);
    }
    this.tf = [gl.createTransformFeedback(), gl.createTransformFeedback()];
    for (let i = 0; i < 2; i++) {
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tf[i]);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.bufs[i]);
    }
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    this.vaoU = [0, 1].map((i) => this._vaoInput(this.bufs[i], false));
    this.vaoD = [0, 1].map((i) => this._vaoInput(this.bufs[i], true));
  }
  _vaoInput(buf, instanced) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const base = instanced ? 1 : 0;
    if (instanced) {
      if (!this.quad) {
        this.quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(base + i);
      gl.vertexAttribPointer(base + i, 4, gl.FLOAT, false, F * 4, i * 16);
      if (instanced) gl.vertexAttribDivisor(base + i, 1);
    }
    gl.bindVertexArray(null);
    return vao;
  }
  get aliveHint() { return this.high; }
  /** type: PT.*, rgb tint, hot flag adds +1 to seed */
  emit(x, y, vx, vy, life, size, type, r, g, b, hot = false) {
    if (this.n >= this.stageCap) return;
    const s = this.stage, o = this.n * F;
    s[o] = x; s[o + 1] = y; s[o + 2] = vx; s[o + 3] = vy;
    s[o + 4] = life; s[o + 5] = life; s[o + 6] = size; s[o + 7] = type;
    s[o + 8] = r; s[o + 9] = g; s[o + 10] = b; s[o + 11] = Math.random() * 0.999 + (hot ? 1 : 0);
    this.n++;
  }
  _flush() {
    if (!this.n) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[this.cur]);
    let remain = this.n, src = 0;
    while (remain > 0) {
      const room = this.cap - this.head;
      const take = Math.min(room, remain);
      gl.bufferSubData(gl.ARRAY_BUFFER, this.head * F * 4, this.stage, src * F, take * F);
      this.head = (this.head + take) % this.cap;
      this.high = Math.max(this.high, this.head === 0 ? this.cap : this.head, this.high);
      src += take; remain -= take;
    }
    this.n = 0;
  }
  step(dt, wind, time, heightTex, terrInfo, attr, nAttr) {
    const gl = this.gl;
    this._flush();
    gl.bindBuffer(gl.ARRAY_BUFFER, null); // a TF target must not stay bound to another target
    const from = this.cur, to = 1 - from;
    this.update.use()
      .f1('uDt', dt).f1('uTime', time).f1('uWind', wind)
      .f3('uTerr', terrInfo[0], terrInfo[1], terrInfo[2]).i1('uH', 3)
      .i1('uNA', nAttr || 0);
    if (nAttr) this.update.v4('uAttr', attr);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, heightTex);
    gl.bindVertexArray(this.vaoU[from]);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tf[to]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, Math.max(this.high, 1));
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);
    this.cur = to;
  }
  /** pass 0 = additive types, 1 = alpha types; caller sets blend + common uniforms on this.draw */
  render(pass) {
    const gl = this.gl;
    if (!this.high) return;
    this.draw.i1('uPass', pass);
    gl.bindVertexArray(this.vaoD[this.cur]);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.high);
    gl.bindVertexArray(null);
  }
}
