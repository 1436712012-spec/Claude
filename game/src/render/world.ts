// The poolrooms: one floor plane whose look (tiles, coping, water, caustics,
// soft AO against walls) is driven by a mask texture of the map window, plus
// instanced tiled walls that dissolve with ordered dithering when they stand
// between the camera and the dreamer.

import * as THREE from 'three';
import { MAP } from '../config';
import type { WorldMap } from '../map';
import { GLSL_NOISE } from './dreamfog';

const W = MAP.window;

export class WorldView {
  group = new THREE.Group();
  maskData = new Uint8Array(W * W * 4);
  mask: THREE.DataTexture;
  maskOrigin = new THREE.Vector2(1e9, 1e9);
  floor: THREE.Mesh;
  walls: THREE.InstancedMesh;
  rings: THREE.InstancedMesh;
  private ringList: { x: number; y: number; hue: number; phase: number }[] = [];
  uniforms = {
    uMask: { value: null as unknown as THREE.Texture },
    uMaskOrigin: { value: new THREE.Vector2() },
    uMaskSize: { value: W },
    uTime: { value: 0 },
    uPlayer: { value: new THREE.Vector3() },
    uPlayerScreen: { value: new THREE.Vector2() },
    uPlayerDepth: { value: 0 },
    uCutR: { value: 100 },
  };

  constructor(private map: WorldMap) {
    this.mask = new THREE.DataTexture(this.maskData, W, W, THREE.RGBAFormat);
    this.mask.magFilter = THREE.LinearFilter;
    this.mask.minFilter = THREE.LinearFilter;
    this.mask.wrapS = this.mask.wrapT = THREE.ClampToEdgeWrapping;
    this.uniforms.uMask.value = this.mask;

    // ---------------- Floor ----------------
    const floorGeo = new THREE.PlaneGeometry(W, W, 1, 1);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0 });
    floorMat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.uniforms);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position,1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D uMask; uniform vec2 uMaskOrigin; uniform float uMaskSize; uniform float uTime;
varying vec3 vW;
${GLSL_NOISE}
vec4 maskAt(vec2 wp){ return texture2D(uMask, (wp - uMaskOrigin) / uMaskSize); }
float waterAmt; float wallAO; float groutAmt; float causticAmt; float wetAmt;
`)
        .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
{
  vec2 wp = vW.xz;
  vec4 m = maskAt(wp);
  waterAmt = smoothstep(0.46, 0.56, m.r);
  float coping = smoothstep(0.08, 0.40, m.r) * (1.0 - waterAmt);

  // Soft ambient occlusion where floor meets walls.
  float ao = 0.0;
  ao += maskAt(wp + vec2( 0.55, 0.0)).g; ao += maskAt(wp + vec2(-0.55, 0.0)).g;
  ao += maskAt(wp + vec2(0.0,  0.55)).g; ao += maskAt(wp + vec2(0.0, -0.55)).g;
  ao += maskAt(wp + vec2( 0.9, 0.9)).g * 0.5; ao += maskAt(wp + vec2(-0.9, 0.9)).g * 0.5;
  ao += maskAt(wp + vec2( 0.9,-0.9)).g * 0.5; ao += maskAt(wp + vec2(-0.9,-0.9)).g * 0.5;
  wallAO = clamp(ao / 4.0, 0.0, 1.0);

  // 0.5 m glazed tiles; each tile has its own slightly different glaze.
  vec2 t = wp * 2.0;
  vec2 cellId = floor(t);
  vec2 g = abs(fract(t) - 0.5);
  float gl = max(g.x, g.y);
  groutAmt = smoothstep(0.455, 0.49, gl);
  float tid = nb_hash(cellId);
  vec3 tile = mix(vec3(0.925, 0.945, 0.940), vec3(0.880, 0.915, 0.925), tid);
  // Rare mint and blush tiles — someone tiled this room from memory.
  float accent = step(0.988, nb_hash(cellId + 17.0));
  tile = mix(tile, mix(vec3(0.70, 0.88, 0.84), vec3(0.95, 0.80, 0.82), step(0.5, nb_hash(cellId + 3.0))), accent * 0.55);
  // Big, slow stains of age, barely there.
  tile *= 0.965 + 0.05 * nb_fbm(wp * 0.18);
  vec3 grout = vec3(0.66, 0.71, 0.73);
  vec3 floorCol = mix(tile, grout, groutAmt);

  // Raised cream coping around pools.
  floorCol = mix(floorCol, vec3(0.965, 0.945, 0.905), coping);

  // Secret rooms: warm, sun-faded pink tiles.
  float secret = smoothstep(0.4, 0.6, m.a);
  floorCol = mix(floorCol, mix(vec3(0.97, 0.86, 0.85), grout * vec3(1.05, 0.92, 0.9), groutAmt), secret);

  // Water: shallow aqua → deep teal, with the pool's own bigger tiles below.
  float depth = m.b;
  vec2 tw = wp * 1.0 + vec2(sin(wp.y * 1.3 + uTime * 0.8), cos(wp.x * 1.1 + uTime * 0.7)) * 0.05;
  vec2 gw = abs(fract(tw) - 0.5);
  float poolGrout = smoothstep(0.46, 0.49, max(gw.x, gw.y));
  vec3 shallow = vec3(0.42, 0.84, 0.86);
  vec3 deep = vec3(0.10, 0.46, 0.62);
  vec3 waterCol = mix(shallow, deep, smoothstep(0.0, 1.0, depth));
  waterCol = mix(waterCol, waterCol * 0.82, poolGrout * (1.0 - depth * 0.7));
  causticAmt = nb_caustic(wp * 1.15, uTime) * waterAmt;
  wetAmt = smoothstep(0.02, 0.2, m.r) * (1.0 - waterAmt) * (0.6 + 0.4 * nb_noise(wp * 3.0));

  diffuseColor.rgb = mix(floorCol, waterCol, waterAmt);
  diffuseColor.rgb *= mix(1.0, 0.62, wallAO * (1.0 - waterAmt));
}
`)
        .replace('#include <roughnessmap_fragment>', /* glsl */ `
float roughnessFactor = roughness;
roughnessFactor = mix(0.22, 0.6, groutAmt);
roughnessFactor = mix(roughnessFactor, 0.1, wetAmt);
roughnessFactor = mix(roughnessFactor, 0.035, waterAmt);
`)
        .replace('#include <normal_fragment_maps>', /* glsl */ `
{
  // Height field: recessed grout + rippling water, turned into a normal via derivatives.
  vec2 wp = vW.xz;
  float h = waterAmt * 0.012 * (nb_noise(wp * 2.6 + vec2(uTime * 0.35, uTime * 0.2)) + 0.6 * nb_noise(wp * 5.3 - uTime * 0.45));
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad);
}
`)
        .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.80, 1.0, 0.97) * pow(causticAmt, 1.8) * 0.95;
`);
    };
    this.floor = new THREE.Mesh(floorGeo, floorMat);
    this.floor.receiveShadow = true;
    this.group.add(this.floor);

    // ---------------- Walls ----------------
    const wallGeo = new THREE.BoxGeometry(1, MAP.wallHeight, 1);
    wallGeo.translate(0.5, MAP.wallHeight / 2, 0.5);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
    wallMat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.uniforms);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vWN;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 wpos = instanceMatrix * vec4(position, 1.0);
vW = (modelMatrix * wpos).xyz;
vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);`);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>
uniform vec3 uPlayer; uniform float uTime; uniform vec2 uPlayerScreen; uniform float uPlayerDepth; uniform float uCutR;
varying vec3 vW; varying vec3 vWN;
${GLSL_NOISE}
float wGrout;
float bayer4(vec2 p){
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{
  // Cut-away: a round, screen-space peephole through any wall that stands
  // between the lens and the dreamer. Clean circle, no per-block staircase.
  float dpx = length(gl_FragCoord.xy - uPlayerScreen) / uCutR;
  float inFront = smoothstep(0.2, 1.0, uPlayerDepth - vViewPosition.z);
  float fade = (1.0 - smoothstep(0.7, 1.0, dpx)) * inFront * smoothstep(0.05, 0.5, vW.y) * 0.96;
  if (fade > bayer4(gl_FragCoord.xy)) discard;
}`)
        .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
{
  vec3 n = abs(vWN);
  // Tile UVs on whichever face we're on.
  vec2 uv = n.y > 0.5 ? vW.xz : (n.x > 0.5 ? vec2(vW.z, vW.y) : vec2(vW.x, vW.y));
  vec2 t = uv * vec2(4.0, 4.0);
  vec2 g = abs(fract(t) - 0.5);
  wGrout = smoothstep(0.44, 0.49, max(g.x, g.y)) * (1.0 - step(0.5, n.y));
  float tid = nb_hash(floor(t) + floor(vW.xz) * 7.0);
  vec3 tile = mix(vec3(0.955, 0.965, 0.96), vec3(0.90, 0.935, 0.94), tid);
  // Two rows of pale-blue tiles near the floor, like every pool you've ever forgotten.
  float band = step(0.25, vW.y) * step(vW.y, 0.75);
  tile = mix(tile, vec3(0.62, 0.82, 0.88), band * (1.0 - n.y));
  // Caps: pale-aqua bullnose coping, echoing the band at the foot of the wall,
  // with a bright lip along the edge where the light catches it.
  vec2 cf = abs(fract(vW.xz) - 0.5);
  float lip = smoothstep(0.40, 0.48, max(cf.x, cf.y));
  vec3 cap = mix(vec3(0.70, 0.85, 0.88), vec3(0.93, 0.97, 0.97), lip * 0.7);
  tile = mix(tile, cap, step(0.5, n.y));
  vec3 col = mix(tile, vec3(0.76, 0.8, 0.8), wGrout);
  // Grime collects at the base; light gathers near the top.
  col *= mix(0.72, 1.0, smoothstep(0.0, 0.5, vW.y));
  col *= 0.97 + 0.04 * nb_fbm(uv * 0.7);
  diffuseColor.rgb = col;
}`)
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(0.18, 0.55, wGrout);`);
    };
    this.walls = new THREE.InstancedMesh(wallGeo, wallMat, W * W);
    this.walls.castShadow = true;
    this.walls.receiveShadow = true;
    this.walls.count = 0;
    this.walls.frustumCulled = false;
    this.group.add(this.walls);

    // ---------------- Swim rings drifting in pools ----------------
    const ringGeo = new THREE.TorusGeometry(0.34, 0.13, 14, 40);
    ringGeo.rotateX(-Math.PI / 2);
    // Eight alternating segments: tinted (1) vs. sun-bleached white (0).
    const pos = ringGeo.attributes.position;
    const stripe = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      stripe[i] = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2;
    }
    ringGeo.setAttribute('stripe', new THREE.BufferAttribute(stripe, 1));
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32 });
    ringMat.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float stripe; varying float vStripe;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStripe = stripe;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vStripe;')
        .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef USE_INSTANCING_COLOR
diffuseColor.rgb = mix(vec3(0.98, 0.97, 0.95), vColor, vStripe);
#endif`);
    };
    this.rings = new THREE.InstancedMesh(ringGeo, ringMat, 256);
    this.rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3);
    this.rings.castShadow = true;
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    this.group.add(this.rings);
  }

  // Where the dreamer is on screen and how far from the lens (for the peephole).
  setPeephole(camera: THREE.Camera, bufW: number, bufH: number, px: number, py: number) {
    const v = new THREE.Vector3(px, 0.7, py);
    const view = v.clone().applyMatrix4(camera.matrixWorldInverse);
    this.uniforms.uPlayerDepth.value = -view.z;
    v.project(camera);
    this.uniforms.uPlayerScreen.value.set((v.x * 0.5 + 0.5) * bufW, (v.y * 0.5 + 0.5) * bufH);
    this.uniforms.uCutR.value = bufH * 0.13;
  }

  // Re-centre the floor mask, walls and props when the dreamer drifts far enough.
  update(px: number, py: number, time: number) {
    this.uniforms.uTime.value = time;
    this.uniforms.uPlayer.value.set(px, 0, py);
    const ox = Math.floor(px) - (W >> 1), oy = Math.floor(py) - (W >> 1);
    if (Math.abs(ox - this.maskOrigin.x) > 16 || Math.abs(oy - this.maskOrigin.y) > 16) this.rebuild(ox, oy);

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < this.ringList.length; i++) {
      const r = this.ringList[i];
      const bob = Math.sin(time * 1.3 + r.phase) * 0.025;
      const drift = Math.sin(time * 0.11 + r.phase) * 0.35;
      p.set(r.x + drift, -0.02 + bob, r.y + Math.cos(time * 0.09 + r.phase) * 0.3);
      e.set(Math.sin(time * 0.9 + r.phase) * 0.06, time * 0.05 + r.phase, Math.cos(time * 1.1 + r.phase) * 0.06);
      q.setFromEuler(e);
      m.compose(p, q, s);
      this.rings.setMatrixAt(i, m);
    }
    this.rings.instanceMatrix.needsUpdate = true;
  }

  private rebuild(ox: number, oy: number) {
    this.maskOrigin.set(ox, oy);
    this.uniforms.uMaskOrigin.value.set(ox, oy);
    this.map.buildMask(ox, oy, W, this.maskData);
    this.mask.needsUpdate = true;
    this.floor.position.set(ox + W / 2, 0, oy + W / 2);

    let n = 0;
    const m = new THREE.Matrix4();
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      if (this.maskData[(y * W + x) * 4 + 1] > 127) {
        m.makeTranslation(ox + x, 0, oy + y);
        this.walls.setMatrixAt(n++, m);
      }
    }
    this.walls.count = n;
    this.walls.instanceMatrix.needsUpdate = true;

    this.ringList = this.map.ringsInRect(ox, oy, ox + W, oy + W);
    const c = new THREE.Color();
    this.rings.count = Math.min(256, this.ringList.length);
    for (let i = 0; i < this.rings.count; i++) {
      const hue = this.ringList[i].hue;
      c.setHSL(hue, 0.62, 0.74, THREE.SRGBColorSpace);
      this.rings.setColorAt(i, c);
    }
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
  }
}
