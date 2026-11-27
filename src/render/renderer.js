// WebGL2 renderer: scene ray-march → progressive accumulation → bloom → grade.

import { VERT, sceneFrag } from './scene.glsl.js';
import { ACCUM, DOWN, UP, COMPOSITE } from './post.glsl.js';

const SPINE_HAN =
  '天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏闰余成岁律吕调阳云腾致雨露结为霜金生丽水玉出昆冈剑号巨阙珠称夜光果珍李柰菜重芥姜海咸河淡鳞潜羽翔龙师火帝鸟官人皇始制文字乃服衣裳推位让国有虞陶唐吊民伐罪周发殷汤坐朝问道垂拱平章爱育黎首臣伏戎羌遐迩一体率宾归王鸣凤在竹白驹食场化被草木赖及万方盖此身四大五常恭惟鞠养岂敢毁伤女慕贞洁男效才良知过必改得能莫忘罔谈彼短靡恃己长信使可覆器欲难量墨悲丝染诗赞羔羊景行维贤克念作圣德建名立形端表正空谷传声虚堂习听祸因恶积福缘善庆尺璧非宝寸阴是竞资父事君曰严与敬孝当竭力忠则尽命临深履薄夙兴温凊似兰斯馨如松之盛川流不息渊澄取映容止若思言辞安定笃初诚美慎终宜令荣业所基籍甚无竟学优登仕摄职从政存以甘棠去而益咏乐殊贵贱礼别尊卑上和下睦夫唱妇随外受傅训入奉母仪诸姑伯叔犹子比儿孔怀兄弟同气连枝交友投分切磨箴规';

export const SPINE_LATIN = 'abcdefghijklmnopqrstuvwxyz ,.';

/** The 224 characters that may appear on Han spines (index 32..255 of the atlas). */
export function hanSpineGlyphs() {
  const seen = new Set();
  const out = [];
  for (const ch of SPINE_HAN) {
    if (!seen.has(ch)) {
      seen.add(ch);
      out.push(ch);
    }
    if (out.length === 224) break;
  }
  return out;
}

function makeGlyphAtlas() {
  const N = 16;
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = N * S;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${S * 0.78}px "IM Fell English", "Cormorant Garamond", Georgia, serif`;
  for (let i = 0; i < SPINE_LATIN.length; i++) {
    const ch = SPINE_LATIN[i] === ' ' ? '·' : SPINE_LATIN[i];
    g.fillText(ch, (i % N) * S + S / 2, Math.floor(i / N) * S + S * 0.56);
  }
  g.font = `700 ${S * 0.8}px "Noto Serif SC", "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif`;
  const han = hanSpineGlyphs();
  for (let k = 0; k < han.length; k++) {
    const i = 32 + k;
    g.fillText(han[k], (i % N) * S + S / 2, Math.floor(i / N) * S + S * 0.54);
  }
  return c;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.float = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.scale = 0.6;
    this.maxScale = 1.0;
    this.minScale = 0.3;
    this.frameMs = 16;
    this.accumN = 0;
    this.quality = 'high';

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.progs = {
      scene: this.program(VERT, sceneFrag()),
      accum: this.program(VERT, ACCUM),
      down: this.program(VERT, DOWN),
      up: this.program(VERT, UP),
      comp: this.program(VERT, COMPOSITE),
    };
    this.glyphTex = null;
    this.refreshGlyphs();
    this.targets = null;
  }

  refreshGlyphs() {
    const gl = this.gl;
    const atlas = makeGlyphAtlas();
    if (!this.glyphTex) this.glyphTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.glyphTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        const lines = src.split('\n');
        const m = /ERROR: \d+:(\d+)/.exec(log || '');
        const ctx = m ? lines.slice(Math.max(0, +m[1] - 3), +m[1] + 2).join('\n') : '';
        throw new Error('Shader compile failed: ' + log + '\n' + ctx);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link failed: ' + gl.getProgramInfoLog(p));
    const uni = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      uni[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    return { p, uni };
  }

  makeTarget(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }

  freeTargets() {
    if (!this.targets) return;
    const gl = this.gl;
    const all = [this.targets.scene, ...this.targets.accum, ...this.targets.bloom];
    for (const t of all) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fb);
    }
    this.targets = null;
  }

  ensureTargets() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    const rw = Math.max(16, Math.round(cw * this.scale));
    const rh = Math.max(16, Math.round(ch * this.scale));
    const t = this.targets;
    if (t && t.scene.w === rw && t.scene.h === rh) return false;
    this.freeTargets();
    const bloom = [];
    let bw = rw;
    let bh = rh;
    for (let i = 0; i < 6; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      bloom.push(this.makeTarget(bw, bh));
    }
    this.targets = { scene: this.makeTarget(rw, rh), accum: [this.makeTarget(rw, rh), this.makeTarget(rw, rh)], bloom, ping: 0 };
    this.accumN = 0;
    return true;
  }

  pass(prog, target, setup) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    setup(prog.uni);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  bindTex(unit, tex, loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  /** Adapt the render scale to the measured frame time. */
  adapt(dtMs, still) {
    this.frameMs = this.frameMs * 0.9 + dtMs * 0.1;
    if (still) return;
    if (this.frameMs > 30 && this.scale > this.minScale) this.scale = Math.max(this.minScale, this.scale - 0.04);
    else if (this.frameMs < 18 && this.scale < this.maxScale) this.scale = Math.min(this.maxScale, this.scale + 0.02);
  }

  render(f) {
    const gl = this.gl;
    if (this.ensureTargets()) f.still = false;
    const T = this.targets;
    if (!f.still) this.accumN = 0;
    const n = this.accumN;
    const jitter = n === 0 ? [0, 0] : [halton(n, 2) - 0.5, halton(n, 3) - 0.5];
    const q = QUALITY[this.quality];

    this.pass(this.progs.scene, T.scene, (u) => {
      gl.uniform2f(u.uRes, T.scene.w, T.scene.h);
      gl.uniform2f(u.uJitter, jitter[0], jitter[1]);
      gl.uniform3fv(u.uCamPos, f.camPos);
      gl.uniformMatrix3fv(u.uCamRot, false, f.camRot);
      gl.uniform1f(u.uTan, f.tanHalf);
      gl.uniform1f(u.uTime, f.time);
      gl.uniform3ui(u.uSeed, f.seeds[0], f.seeds[1], f.seeds[2]);
      gl.uniform1i(u.uLib, f.lib);
      gl.uniform1i(u.uSteps, q.steps);
      gl.uniform1i(u.uShadows, q.shadows);
      gl.uniform1i(u.uMirror, q.mirror);
      gl.uniform4iv(u.uHover, f.hover);
      gl.uniform4iv(u.uHide, f.hide);
      gl.uniform3fv(u.uSelC, f.sel.center);
      gl.uniformMatrix3fv(u.uSelR, false, f.sel.rot);
      gl.uniform3fv(u.uSelH, f.sel.half);
      gl.uniform1f(u.uSelSeedF, f.sel.seed);
      gl.uniform4fv(u.uMark, f.mark);
      gl.uniform1f(u.uMarkGlow, f.markGlow);
      gl.uniform1i(u.uDebug, f.debug | 0);
      gl.uniform1f(u.uExposure, (this.float ? 1 : 0.25) * f.exposure);
      this.bindTex(0, this.glyphTex, u.uGlyphs);
    });

    const src = T.accum[T.ping];
    const dst = T.accum[1 - T.ping];
    this.pass(this.progs.accum, dst, (u) => {
      this.bindTex(0, T.scene.tex, u.uCur);
      this.bindTex(1, src.tex, u.uPrev);
      gl.uniform1f(u.uW, 1 / (n + 1));
    });
    T.ping = 1 - T.ping;
    if (f.still && this.accumN < 48) this.accumN++;

    // bloom
    let prev = dst;
    for (let i = 0; i < T.bloom.length; i++) {
      const b = T.bloom[i];
      this.pass(this.progs.down, b, (u) => {
        this.bindTex(0, prev.tex, u.uSrc);
        gl.uniform2f(u.uTexel, 1 / prev.w, 1 / prev.h);
        gl.uniform1f(u.uPrefilter, i === 0 ? 1 : 0);
      });
      prev = b;
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = T.bloom.length - 1; i > 0; i--) {
      const from = T.bloom[i];
      const to = T.bloom[i - 1];
      this.pass(this.progs.up, to, (u) => {
        this.bindTex(0, from.tex, u.uSrc);
        gl.uniform2f(u.uTexel, 1 / from.w, 1 / from.h);
      });
    }
    gl.disable(gl.BLEND);

    this.pass(this.progs.comp, null, (u) => {
      this.bindTex(0, dst.tex, u.uScene);
      this.bindTex(1, T.bloom[0].tex, u.uBloom);
      gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
      gl.uniform1f(u.uTime, f.time);
      gl.uniform1f(u.uWarp, f.warp);
      gl.uniform2fv(u.uWarpC, f.warpCenter);
      gl.uniform1f(u.uFall, f.fall);
      gl.uniform1f(u.uFade, f.fade);
      gl.uniform3fv(u.uFadeCol, f.fadeCol);
      gl.uniform1f(u.uBloomK, 0.55 * f.bloom);
      gl.uniform1f(u.uGain, this.float ? 1 : 4);
    });
  }
}

export const QUALITY = {
  low: { steps: 110, shadows: 0, mirror: 0, label: '流畅' },
  medium: { steps: 160, shadows: 0, mirror: 1, label: '均衡' },
  high: { steps: 220, shadows: 1, mirror: 1, label: '精美' },
};

function halton(i, b) {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
}
