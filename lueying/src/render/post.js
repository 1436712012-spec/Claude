// 后期：ACES 色调映射（OutputPass）、克制的泛光、胶片颗粒与暗角、高速径向模糊、受击与闪光、慢动作。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uDamage: { value: 0 },
    uFlash: { value: 0 },
    uSilence: { value: 0 },
    uSlowmo: { value: 0 },
    uAlarm: { value: 0 },
    uZoom: { value: 0 },
    uAspect: { value: 1 },
    uGrain: { value: 0.09 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uSpeed, uDamage, uFlash, uSilence, uSlowmo, uAlarm, uZoom, uAspect, uGrain;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // 高速：轻微径向模糊（只在画面边缘）
      if (uSpeed > 0.01) {
        float r = length(c * vec2(uAspect, 1.0));
        float k = uSpeed * smoothstep(0.18, 0.7, r) * 0.035;
        vec3 acc = col;
        for (int i = 1; i <= 6; i++) acc += texture2D(tDiffuse, vUv - c * k * float(i) / 6.0).rgb;
        col = acc / 7.0;
      }
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      // 场静默：世界略微沉下去
      col = mix(col, vec3(lum) * vec3(0.92, 0.97, 1.0), uSilence * 0.25) * (1.0 - uSilence * 0.08);
      // 慢动作：降饱和、偏冷
      col = mix(col, vec3(lum) * vec3(0.9, 0.98, 1.08), uSlowmo * 0.45);
      // 暗角
      float v = (1.0 - smoothstep(0.25, 0.85, length(c * vec2(uAspect * 0.85, 1.0))));
      col *= mix(0.62, 1.0, v);
      // 放大镜头：圆形遮罩
      if (uZoom > 0.01) {
        float rr = length(c * vec2(uAspect, 1.0));
        col *= mix(1.0, (1.0 - smoothstep(0.44, 0.52, rr)), uZoom * 0.85);
      }
      // 受击：边缘一闪信号红
      float edge = smoothstep(0.35, 0.75, length(c * vec2(uAspect * 0.8, 1.0)));
      col = mix(col, vec3(0.9, 0.28, 0.23), edge * uDamage * 0.55);
      col += vec3(0.9, 0.28, 0.23) * edge * uAlarm * 0.06 * (0.5 + 0.5 * sin(uTime * 5.0));
      col += vec3(uFlash);
      // 胶片颗粒
      float g = hash(vUv * 1000.0 + fract(uTime * 7.0) * 100.0) - 0.5;
      col *= 1.0 + g * uGrain;
      col = max(col, 0.0);
      if (any(isnan(col))) col = vec3(0.0);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function makeComposer(renderer, scene, camera, quality) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x * quality.bloomScale, size.y * quality.bloomScale), 0.55, 0.55, 0.86);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return { composer, bloom, grade };
}
