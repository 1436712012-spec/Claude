export function initGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('需要支持 WebGL2 的浏览器');
  const hdr = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');
  return { gl, hdr };
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    throw new Error(`Shader compile error:\n${log}\n${lines}`);
  }
  return s;
}

export class Prog {
  constructor(gl, vs, fs, tfVaryings) {
    this.gl = gl;
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    if (tfVaryings) gl.transformFeedbackVaryings(p, tfVaryings, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
    this.p = p;
    this.loc = new Map();
  }
  use() { this.gl.useProgram(this.p); return this; }
  L(n) {
    let l = this.loc.get(n);
    if (l === undefined) { l = this.gl.getUniformLocation(this.p, n); this.loc.set(n, l); }
    return l;
  }
  f1(n, a) { const l = this.L(n); if (l) this.gl.uniform1f(l, a); return this; }
  f2(n, a, b) { const l = this.L(n); if (l) this.gl.uniform2f(l, a, b); return this; }
  f3(n, a, b, c) { const l = this.L(n); if (l) this.gl.uniform3f(l, a, b, c); return this; }
  f4(n, a, b, c, d) { const l = this.L(n); if (l) this.gl.uniform4f(l, a, b, c, d); return this; }
  i1(n, a) { const l = this.L(n); if (l) this.gl.uniform1i(l, a); return this; }
  v4(n, arr) { const l = this.L(n); if (l) this.gl.uniform4fv(l, arr); return this; }
}

export function makeTarget(gl, w, h, hdr, linear = true) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const f = linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}

export function freeTarget(gl, t) {
  if (!t) return;
  gl.deleteTexture(t.tex);
  gl.deleteFramebuffer(t.fbo);
}
