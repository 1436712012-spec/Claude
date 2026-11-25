// Post chain: Render → Bloom (HDR, only true overexposure) → Tilt-shift (diorama
// focus band around the dreamer) → Output (AgX tonemap) → Dream grade.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const TiltShift = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFocusY: { value: 0.5 },
    uBand: { value: 0.16 },
    uAmount: { value: 1.0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uFocusY; uniform float uBand; uniform float uAmount;
varying vec2 vUv;
void main(){
  float d = abs(vUv.y - uFocusY);
  float blur = smoothstep(uBand, uBand + 0.32, d) * uAmount;
  vec4 c = texture2D(tDiffuse, vUv);
  if (blur < 0.01) { gl_FragColor = c; return; }
  // 12-tap golden-angle disc, radius in pixels.
  float r = blur * 5.5;
  vec4 acc = c; float w = 1.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i) + 0.5;
    float a = fi * 2.39996;
    vec2 o = vec2(cos(a), sin(a)) * sqrt(fi / 12.0) * r / uRes;
    acc += texture2D(tDiffuse, vUv + o); w += 1.0;
  }
  gl_FragColor = acc / w;
}`,
};

const DreamGrade = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNoclip: { value: 0 },
    uHurt: { value: 0 },
    uDream: { value: 0 },
    uFade: { value: 0 },
    uPlayerUv: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes;
uniform float uNoclip; uniform float uHurt; uniform float uDream; uniform float uFade; uniform vec2 uPlayerUv;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 sat(vec3 c, float s){ float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return mix(vec3(l), c, s); }
void main(){
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);

  // Noclip: reality slips — a ripple from the dreamer outward.
  vec2 pd = uv - uPlayerUv;
  float pr = length(pd * vec2(uRes.x / uRes.y, 1.0));
  float wave = sin(pr * 38.0 - uTime * 22.0) * exp(-pr * 3.2) * uNoclip;
  uv += normalize(pd + 1e-5) * wave * 0.006;

  // Chromatic fringe lives only at the edges (and during a noclip).
  float ca = (r2 * 0.0042) + uNoclip * 0.006;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + cc * ca).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - cc * ca).b;

  // Pastel grade: lift shadows toward lavender, fold highlights toward cream.
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, col * vec3(0.96, 0.95, 1.04) + vec3(0.035, 0.03, 0.055), 1.0 - smoothstep(0.0, 0.55, l));
  col = mix(col, col * vec3(1.02, 1.0, 0.965), smoothstep(0.55, 1.0, l));
  col = sat(col, 0.94 + uDream * 0.25 - uNoclip * 0.35);

  // Milky edge haze (dreamcore vignettes glow instead of going dark)…
  float vig = smoothstep(0.16, 0.62, r2 * 1.6);
  col = mix(col, vec3(0.97, 0.955, 0.93), vig * 0.14);
  // …with only the very corners sinking slightly.
  col *= 1.0 - smoothstep(0.35, 0.9, r2 * 1.8) * 0.12;

  // Hurt: a soft warm pulse from the edges.
  col = mix(col, vec3(0.95, 0.42, 0.45), uHurt * smoothstep(0.05, 0.5, r2 * 1.6) * 0.45);

  // Film grain, luminance-weighted so it lives in the midtones.
  float gr = h(vUv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
  col += gr * 0.045 * (0.4 + 0.6 * (1.0 - abs(l - 0.5) * 2.0));

  col = mix(col, vec3(0.975, 0.965, 0.95), uFade);
  gl_FragColor = vec4(col, 1.0);
}`,
};

export class Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  tilt: ShaderPass;
  grade: ShaderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.7, 1.6);
    this.composer.addPass(this.bloom);
    this.tilt = new ShaderPass(TiltShift);
    this.composer.addPass(this.tilt);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(DreamGrade);
    this.composer.addPass(this.grade);
  }

  setSize(w: number, h: number, pr: number) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    (this.tilt.uniforms.uRes.value as THREE.Vector2).set(w * pr, h * pr);
    (this.grade.uniforms.uRes.value as THREE.Vector2).set(w * pr, h * pr);
  }

  render() { this.composer.render(); }
}
