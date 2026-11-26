// 共享着色器注入：树冠下的天光遮蔽、飞碟场光（不占真实光源）、闪电照亮、场脉冲扫过地表的波前、植被摇曳与被场推开。
import * as THREE from 'three';

export const FX = {
  uTime: { value: 0 },
  uCanopy: { value: null },
  uShips: { value: [new THREE.Vector4(0, -999, 0, 0), new THREE.Vector4(0, -999, 0, 0), new THREE.Vector4(0, -999, 0, 0), new THREE.Vector4(0, -999, 0, 0)] },
  uGlowColor: { value: new THREE.Color(0x8fe3e8) },
  uFlash: { value: 0 },
  uRain: { value: 1 },
  uNight: { value: 0 },
  uPulse: { value: new THREE.Vector4(0, -999, 0, -100) },
  uWind: { value: new THREE.Vector2(0.25, 0.55) },
  uFlicker: { value: new THREE.Vector4(0, -999, 0, 0) },
};

const VERT_HEAD = `
varying vec3 vFxW;
uniform float uTime;
uniform vec4 uShips[4];
uniform vec2 uWind;
`;
const FRAG_HEAD = `
varying vec3 vFxW;
uniform sampler2D uCanopy;
uniform vec4 uShips[4];
uniform vec3 uGlowColor;
uniform float uFlash;
uniform float uTime;
uniform float uNight;
uniform vec4 uPulse;
uniform vec4 uFlicker;
`;

// opts: { canopy: 'ground'|'leaves'|'none', glow: bool, sway: 0..1, pulse: bool, emissiveFlicker: bool }
export function patchMaterial(mat, opts = {}) {
  const canopy = opts.canopy ?? 'ground';
  const glow = opts.glow !== false;
  const sway = opts.sway || 0;
  const pulse = opts.pulse !== false;
  const key = `fx:${canopy}:${glow}:${sway}:${pulse}:${!!opts.flicker}:${opts.tag || ''}`;
  mat.customProgramCacheKey = () => key;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    Object.assign(shader.uniforms, FX);
    shader.vertexShader = VERT_HEAD + shader.vertexShader;
    if (sway > 0) {
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float hh = max(position.y, 0.0);
          float k = ${sway.toFixed(3)} * hh * hh * 0.04;
          float ph = ip.x * 0.13 + ip.z * 0.17;
          vec2 wv = uWind * (0.6 + 0.4 * sin(uTime * 0.7 + ph)) + vec2(sin(uTime * 2.1 + ph * 3.0), cos(uTime * 1.7 + ph * 2.0)) * 0.18;
          transformed.xz += wv * k;
          // 被悬浮场推开：离船越近越明显
          vec3 wp = ip + transformed;
          for (int i = 0; i < 4; i++) {
            vec3 d = wp - uShips[i].xyz;
            float dist = length(d.xz);
            float f = uShips[i].w * (1.0 - smoothstep(2.0, 9.0, dist)) * smoothstep(-3.0, 1.0, -d.y + 2.5);
            transformed.xz += normalize(d.xz + vec2(0.001)) * f * hh * 0.35;
            transformed.y -= f * hh * 0.18;
          }
        }
      `);
    }
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      #include <project_vertex>
      {
        vec4 fxw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fxw = instanceMatrix * fxw;
        #endif
        vFxW = (modelMatrix * fxw).xyz;
      }
    `);
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader;
    let lightMod = '';
    if (canopy !== 'none') {
      const dark = canopy === 'leaves' ? '0.5' : '0.2';
      lightMod += `
        float fxCov = texture2D(uCanopy, (vFxW.xz + 1000.0) / 2000.0).r;
        float fxShade = mix(1.0, ${dark}, smoothstep(0.2, 0.85, fxCov));
        fxShade = mix(fxShade, 1.0, smoothstep(14.0, 34.0, vFxW.y));
        reflectedLight.directDiffuse *= fxShade;
        reflectedLight.indirectDiffuse *= fxShade;
        reflectedLight.directSpecular *= fxShade;
        reflectedLight.indirectSpecular *= mix(1.0, fxShade, 0.7);
        reflectedLight.indirectDiffuse += uFlash * vec3(0.55, 0.6, 0.75) * diffuseColor.rgb * mix(1.0, 0.25, smoothstep(0.3, 0.9, fxCov));
      `;
    } else {
      lightMod += `reflectedLight.indirectDiffuse += uFlash * vec3(0.55, 0.6, 0.75) * diffuseColor.rgb;`;
    }
    if (glow) {
      lightMod += `
        vec3 fxGlow = vec3(0.0);
        for (int i = 0; i < 4; i++) {
          vec3 d = uShips[i].xyz - vFxW;
          float d2 = dot(d, d);
          float lam = max(dot(normal, normalize(d)), 0.0) * 0.75 + 0.25;
          fxGlow += uGlowColor * uShips[i].w * lam / (1.0 + d2 * 0.28);
        }
        reflectedLight.directDiffuse += fxGlow * diffuseColor.rgb * 1.6;
      `;
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `
      #include <lights_fragment_end>
      ${lightMod}
    `);
    let emi = '';
    if (pulse) {
      emi += `
        {
          float age = uTime - uPulse.w;
          if (age > 0.0 && age < 1.4) {
            float radius = age * 55.0;
            float pd = abs(length(vFxW - uPulse.xyz) - radius);
            totalEmissiveRadiance += vec3(0.55, 0.95, 1.0) * exp(-pd * pd * 0.35) * (1.0 - age / 1.4) * 2.5;
          }
        }
      `;
    }
    if (opts.flicker) {
      emi += `
        {
          float fd = length(vFxW.xz - uFlicker.xz);
          float on = uFlicker.w * (1.0 - smoothstep(10.0, 45.0, fd));
          float fl = step(0.5, fract(sin(floor(uTime * 17.0) * 12.9898) * 43758.5453));
          totalEmissiveRadiance *= 1.0 - on * fl * 0.85;
        }
      `;
    }
    if (emi) shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emi}`);
  };
  mat.needsUpdate = true;
  return mat;
}
