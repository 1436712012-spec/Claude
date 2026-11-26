import { initGL, Prog, makeTarget, freeTarget } from './gl.js';
import * as S from './shaders.js';
import { ShapeBatch } from './shapes.js';
import { Particles } from './particles.js';

const BLOOM_LEVELS = 5;

export class Renderer {
  constructor(canvas) {
    const { gl, hdr } = initGL(canvas);
    this.gl = gl; this.hdr = hdr; this.canvas = canvas;
    this.bg = new Prog(gl, S.FS_VS, S.BG_FS);
    this.terrainProg = new Prog(gl, S.TERRAIN_VS, S.TERRAIN_FS);
    this.bloomDown = new Prog(gl, S.FS_VS, S.BLOOM_DOWN_FS);
    this.bloomUp = new Prog(gl, S.FS_VS, S.BLOOM_UP_FS);
    this.comp = new Prog(gl, S.FS_VS, S.COMPOSITE_FS);
    this.shapes = new ShapeBatch(gl);
    this.particles = new Particles(gl, 65536);
    this.emptyVAO = gl.createVertexArray();

    // terrain strip buffer
    this.tVao = gl.createVertexArray();
    gl.bindVertexArray(this.tVao);
    this.tBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tBuf);
    this.tCap = 1200;
    gl.bufferData(gl.ARRAY_BUFFER, this.tCap * 2 * 4 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
    this.tData = new Float32Array(this.tCap * 2 * 4);

    this.heightTex = null;
    this.scene = null;
    this.bloom = [];
    this.stats = { drawCalls: 0 };
    this.scale = 1;
  }

  resize(w, h) {
    const gl = this.gl;
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (this.canvas.width === w && this.canvas.height === h && this.scene) return;
    this.canvas.width = w; this.canvas.height = h;
    this.w = w; this.h = h;
    freeTarget(gl, this.scene);
    this.scene = makeTarget(gl, w, h, this.hdr);
    for (const b of this.bloom) freeTarget(gl, b);
    this.bloom = [];
    let bw = w, bh = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
      this.bloom.push(makeTarget(gl, bw, bh, this.hdr));
    }
  }

  initTerrain(terrain) {
    const gl = this.gl;
    this.terr = terrain;
    if (this.heightTex) gl.deleteTexture(this.heightTex);
    this.heightTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, terrain.n, 1, 0, gl.RED, gl.FLOAT, terrain.h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.terrInfo = [0, 1 / terrain.step, terrain.n];
  }

  _uploadHeights() {
    const t = this.terr;
    if (t.dirtyMax < t.dirtyMin) return;
    const gl = this.gl;
    const a = Math.max(0, t.dirtyMin), b = Math.min(t.n - 1, t.dirtyMax);
    gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, a, 0, b - a + 1, 1, gl.RED, gl.FLOAT, t.h.subarray(a, b + 1));
    t.dirtyMin = 1e9; t.dirtyMax = -1;
  }

  _common(p, f) {
    p.f4('uCam', f.cam.x, f.cam.y, f.cam.halfW, f.cam.halfH);
    p.f3('uShake', f.shake.x, f.shake.y, f.shake.rot);
    p.i1('uNL', f.lightCount);
    p.v4('uLP', f.lightPos);
    p.v4('uLC', f.lightCol);
    const s = f.sky;
    p.f3('uAmbS', s.ambS[0], s.ambS[1], s.ambS[2]);
    p.f3('uAmbG', s.ambG[0], s.ambG[1], s.ambG[2]);
    p.f3('uSunCol', s.sunLight[0], s.sunLight[1], s.sunLight[2]);
    p.f3('uRim', s.rim[0], s.rim[1], s.rim[2]);
    p.f3('uHor', s.hor[0], s.hor[1], s.hor[2]);
    p.f2('uSunDir', s.sunDir[0], s.sunDir[1]);
  }

  _fullscreen() {
    const gl = this.gl;
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  _terrainMesh(f) {
    const t = this.terr, cam = f.cam;
    const margin = 40;
    const x0 = Math.max(0, Math.floor((cam.x - cam.halfW - margin) / 8) * 8);
    const x1 = Math.min(t.W, cam.x + cam.halfW + margin + 8);
    const d = this.tData;
    let n = 0;
    const DEPTH = 560;
    for (let x = x0; x <= x1 + 8 && n < this.tCap; x += 8) {
      const xx = Math.min(x, t.W);
      const h = t.heightAt(xx), sl = t.slopeAt(xx);
      let o = n * 8;
      d[o] = xx; d[o + 1] = h; d[o + 2] = 0; d[o + 3] = sl;
      d[o + 4] = xx; d[o + 5] = h - DEPTH; d[o + 6] = DEPTH; d[o + 7] = sl;
      n++;
    }
    return n * 2;
  }

  /** advance the GPU particle simulation (also callable without drawing, e.g. headless tests) */
  simParticles(dt, wind, time) {
    this._uploadHeights();
    this.particles.step(dt, wind, time, this.heightTex, this.terrInfo);
  }

  render(f) {
    const gl = this.gl;
    const px = (f.cam.halfH * 2) / this.h;

    // GPU particle simulation step (uses frame fx dt, frozen during hit-stop)
    this.simParticles(f.fxDt, f.wind, f.time);

    // ---------------- scene pass ----------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.BLEND);

    const s = f.sky;
    this.bg.use()
      .f2('uView', f.cam.halfW * 2, f.cam.halfH * 2)
      .f1('uCamX', f.cam.x).f1('uTime', f.time)
      .f3('uTop', s.top[0], s.top[1], s.top[2]).f3('uMid', s.mid[0], s.mid[1], s.mid[2]).f3('uHorC', s.hor[0], s.hor[1], s.hor[2])
      .f3('uSunPosR', s.sunPos[0], s.sunPos[1], s.sunPos[2]).f3('uSunCol', s.sunDisc[0], s.sunDisc[1], s.sunDisc[2])
      .f1('uSunVis', s.sunVis).f1('uStars', s.stars).f1('uMoonVis', s.moonVis).f1('uCityLit', s.cityLit)
      .f2('uMoonPos', s.moonPos[0], s.moonPos[1])
      .f2('uShakeUv', -f.shake.x / (f.cam.halfW * 2), -f.shake.y / (f.cam.halfH * 2));
    this._fullscreen();

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // terrain
    const tp = this.terrainProg.use();
    this._common(tp, f);
    tp.f1('uPx', px).f1('uTime', f.time).f3('uRimA', s.rimA[0], s.rimA[1], s.rimA[2]).f3('uRimB', s.rimB[0], s.rimB[1], s.rimB[2]);
    const verts = this._terrainMesh(f);
    gl.bindVertexArray(this.tVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.tData, 0, verts * 4);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, verts);
    gl.bindVertexArray(null);

    // shapes: opaque list, then smoke clouds
    const sp = this.shapes.prog.use();
    this._common(sp, f);
    this.shapes.draw(0);
    this.shapes.draw(1);

    // alpha particles (debris, smoke, dust, casings)
    const pd = this.particles.draw.use();
    this._common(pd, f);
    pd.f1('uTime', f.time);
    this.particles.render(1);

    // additive particles + additive shapes
    gl.blendFunc(gl.ONE, gl.ONE);
    this.particles.render(0);
    sp.use();
    this.shapes.draw(2);
    gl.disable(gl.BLEND);

    // ---------------- bloom ----------------
    const bd = this.bloomDown.use();
    gl.activeTexture(gl.TEXTURE0);
    let src = this.scene, sw = this.w, sh = this.h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      const dst = this.bloom[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      bd.i1('uTex', 0).f2('uTexel', 1 / sw, 1 / sh).f1('uPre', i === 0 ? 1 : 0).f1('uThresh', f.post.threshold).f1('uKnee', 0.6);
      this._fullscreen();
      src = dst; sw = dst.w; sh = dst.h;
    }
    const bu = this.bloomUp.use();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = BLOOM_LEVELS - 1; i >= 1; i--) {
      const from = this.bloom[i], to = this.bloom[i - 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
      gl.viewport(0, 0, to.w, to.h);
      gl.bindTexture(gl.TEXTURE_2D, from.tex);
      bu.i1('uTex', 0).f2('uTexel', 1 / from.w, 1 / from.h).f1('uWeight', 0.62);
      this._fullscreen();
    }
    gl.disable(gl.BLEND);

    // ---------------- composite to screen ----------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    const c = this.comp.use();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.bloom[0].tex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.bloom[1].tex);
    const P = f.post;
    c.i1('uScene', 0).i1('uBloom', 1).i1('uBloom1', 2)
      .f2('uRes', this.w, this.h).f1('uTime', f.time)
      .f1('uExposure', P.exposure).f1('uBloomAmt', P.bloom).f1('uCA', P.ca).f1('uVig', P.vig)
      .f1('uGrain', P.grain).f1('uHurt', P.hurt).f1('uOD', P.od).f1('uRay', P.ray).f1('uFlash', P.flash)
      .f2('uSun', P.sunUv[0], P.sunUv[1])
      .i1('uNS', f.shockCount).v4('uShock', f.shocks)
      .f3('uGradeLift', s.gradeLift[0], s.gradeLift[1], s.gradeLift[2])
      .f3('uGradeGain', s.gradeGain[0], s.gradeGain[1], s.gradeGain[2]);
    this._fullscreen();
    gl.activeTexture(gl.TEXTURE0);
  }
}
