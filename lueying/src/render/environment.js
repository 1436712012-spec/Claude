// 天空、地形网格、黑水河、灯光与雾。黄昏的暴雨天：厚云里透出暗金，城市一侧的低云映着钠灯橙。
import * as THREE from 'three';
import { MAP } from '../sim/config.js';
import { developedMask, inCompound, riverInfo } from '../sim/level.js';
import { roadDistance } from '../sim/terrain.js';
import { FX, patchMaterial } from './shaderfx.js';
import { smoothstep, clamp } from '../sim/noise.js';

export const PALETTE = {
  dusk: new THREE.Color(0xb98a3e),
  forest: new THREE.Color(0x1f3b2d),
  mud: new THREE.Color(0x4a3a2c),
  city: new THREE.Color(0xe39a4c),
  lab: new THREE.Color(0xe6eaec),
  ship: new THREE.Color(0xd8dce0),
  field: new THREE.Color(0x8fe3e8),
  alarm: new THREE.Color(0xe5483b),
};

// ---------- 天空 ----------
export function makeSky(textures) {
  const geo = new THREE.SphereGeometry(2600, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: FX.uTime, uFlash: FX.uFlash, uNight: FX.uNight, uRain: FX.uRain,
      uNoise: { value: textures.noise },
      uFog: { value: new THREE.Color(0x4f4c42) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w * 0.9999;
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform float uTime, uFlash, uNight, uRain;
      uniform sampler2D uNoise;
      uniform vec3 uFog;
      float n2(vec2 p) { return texture2D(uNoise, p / 256.0).r; }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec2 uv = d.xz / max(0.08, h + 0.12) * 18.0 + vec2(uTime * 0.6, uTime * 0.25);
        float c = fbm(uv);
        float c2 = fbm(uv * 0.5 + 40.0);
        vec3 zenith = mix(vec3(0.09, 0.1, 0.115), vec3(0.012, 0.016, 0.024), uNight);
        vec3 horizon = mix(vec3(0.27, 0.235, 0.18), vec3(0.035, 0.04, 0.05), uNight);
        vec3 col = mix(horizon, zenith, smoothstep(-0.02, 0.45, h));
        // 西侧黄昏余光（-x）
        float west = pow(max(0.0, dot(d, normalize(vec3(-1.0, 0.08, 0.25)))), 6.0);
        col += vec3(0.72, 0.5, 0.2) * west * 0.9 * (1.0 - uNight) * (0.55 + 0.45 * c);
        // 北侧城市光晕（-z）：低云被钠灯映亮
        float north = pow(max(0.0, dot(d, normalize(vec3(0.0, 0.12, -1.0)))), 3.0);
        float lowCloud = (1.0 - smoothstep(0.0, 0.35, h));
        col += vec3(0.89, 0.6, 0.3) * north * lowCloud * mix(0.16, 0.42, uNight) * (0.6 + 0.6 * c2);
        // 云层明暗
        col *= mix(0.62, 1.15, c * 0.6 + c2 * 0.4);
        // 闪电：云层内部被照亮
        col += vec3(0.7, 0.75, 0.95) * uFlash * (0.4 + 0.9 * c2) * smoothstep(-0.05, 0.3, h);
        // 地平线融入雾
        col = mix(uFog, col, smoothstep(-0.05, 0.22, h) * (1.0 - 0.35 * uRain) + 0.35 * uRain * smoothstep(0.1, 0.6, h));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

// ---------- 地形 ----------
function terrainColor(T, x, z, h, slope, out) {
  const dev = developedMask(x, z);
  const riv = riverInfo(x, z);
  const can = T.canopy(x, z);
  const flood = smoothstep(330, 470, z);
  // 雨林地面：落叶 + 泥 + 苔藓
  let r = 0.29, g = 0.23, b = 0.17;
  const moss = clamp(can * 0.8 - slope * 0.6, 0, 1) * (1 - flood * 0.5);
  r = r * (1 - moss) + 0.17 * moss; g = g * (1 - moss) + 0.23 * moss; b = b * (1 - moss) + 0.12 * moss;
  // 湿泥：水边与淹水林
  const wet = clamp(1 - (h - 0) / 1.4, 0, 1);
  r = r * (1 - wet * 0.55) + 0.12 * wet * 0.55; g = g * (1 - wet * 0.55) + 0.1 * wet * 0.55; b = b * (1 - wet * 0.55) + 0.07 * wet * 0.55;
  // 陡坡：裸露的红土与根
  r += slope * 0.08; g += slope * 0.02;
  let wetness = clamp(wet + flood * 0.4, 0, 1) * 0.8;
  if (dev > 0.02) {
    const inC = inCompound(x, z, 2);
    const city = z < MAP.cityZ + 10;
    let cr = 0.32, cg = 0.31, cb = 0.24; // 清障带：被压实的泥和稀草
    if (inC) { cr = 0.42; cg = 0.42; cb = 0.4; }
    if (city) { cr = 0.2; cg = 0.2; cb = 0.2; }
    const rd = roadDistance(x, z);
    if (rd < 5) { cr = 0.15; cg = 0.15; cb = 0.15; }
    if (city && (Math.abs(z - (-530)) < 7 || Math.abs(x) < 8 || Math.abs(z - (-720)) < 8)) { cr = 0.1; cg = 0.1; cb = 0.105; }
    if (riv.d < riv.halfW + 1.5 && dev > 0.5) { cr = 0.36; cg = 0.36; cb = 0.35; }
    r = r * (1 - dev) + cr * dev; g = g * (1 - dev) + cg * dev; b = b * (1 - dev) + cb * dev;
    wetness = wetness * (1 - dev) + (inC || city ? 0.75 : 0.5) * dev;
  }
  out[0] = r; out[1] = g; out[2] = b; out[3] = wetness;
}

export function makeTerrain(T, textures, quality) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: textures.ground, roughness: 0.92, metalness: 0, envMapIntensity: 0.32 });
  mat.map.repeat.set(1, 1);
  patchMaterial(mat, { canopy: 'ground', tag: 'terrain' });
  const prevCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prevCompile(shader, r);
    shader.uniforms.uNoiseT = { value: textures.noise };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWet;\nvarying float vWet;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWet = aWet;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWet;\nuniform sampler2D uNoiseT;')
      .replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        float pud = smoothstep(0.58, 0.7, texture2D(uNoiseT, vFxW.xz * 0.012).r * 0.6 + texture2D(uNoiseT, vFxW.xz * 0.05).g * 0.4);
        float wetK = vWet * (0.55 + 0.45 * pud);
        roughnessFactor = mix(roughnessFactor, mix(0.5, 0.08, pud), wetK * 0.85);
        diffuseColor.rgb *= 1.0 - wetK * 0.4;
      `);
  };
  const chunk = 200;
  const near = quality.terrainStep, far = 16;
  const out = [0, 0, 0, 0];
  const build = (cx, cz, step) => {
    const n = Math.round(chunk / step);
    const verts = (n + 1) * (n + 1) + (n + 1) * 4;
    const pos = new Float32Array(verts * 3), col = new Float32Array(verts * 3), uv = new Float32Array(verts * 2), wet = new Float32Array(verts);
    const idx = [];
    let v = 0;
    const put = (x, y, z) => {
      const h = T.height(x, z);
      const hx = T.height(x + 1, z) - T.height(x - 1, z), hz = T.height(x, z + 1) - T.height(x, z - 1);
      const slope = clamp(Math.hypot(hx, hz) * 0.5, 0, 1);
      terrainColor(T, x, z, h, slope, out);
      pos[v * 3] = x; pos[v * 3 + 1] = y ?? h; pos[v * 3 + 2] = z;
      col[v * 3] = out[0]; col[v * 3 + 1] = out[1]; col[v * 3 + 2] = out[2];
      wet[v] = out[3];
      uv[v * 2] = x / 6; uv[v * 2 + 1] = z / 6;
      return v++;
    };
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) put(cx + i * step, null, cz + j * step);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // 裙边：避免 LOD 接缝
    const edge = (list) => {
      const start = v;
      for (const k of list) { const x = pos[k * 3], z = pos[k * 3 + 2]; put(x, pos[k * 3 + 1] - 4, z); }
      for (let i = 0; i < list.length - 1; i++) { const a = list[i], b = list[i + 1], c = start + i, d = start + i + 1; idx.push(a, b, c, b, d, c); idx.push(a, c, b, b, c, d); }
    };
    const top = [], bot = [], left = [], right = [];
    for (let i = 0; i <= n; i++) { top.push(i); bot.push(n * (n + 1) + i); left.push(i * (n + 1)); right.push(i * (n + 1) + n); }
    const gridCount = v;
    edge(top); edge(bot); edge(left); edge(right);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, v * 2), 2));
    geo.setAttribute('aWet', new THREE.BufferAttribute(wet.subarray(0, v), 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // 裙边顶点的正反面法线会相互抵消，显式设为向上，避免 normalize(0) 产生 NaN
    const nrm = geo.attributes.normal;
    for (let k = 0; k < nrm.count; k++) {
      if (k >= gridCount || Math.hypot(nrm.getX(k), nrm.getY(k), nrm.getZ(k)) < 0.5) nrm.setXYZ(k, 0, 1, 0);
    }
    geo.computeBoundingSphere();
    return geo;
  };
  const chunks = [];
  for (let cz = -MAP.half; cz < MAP.half; cz += chunk) {
    for (let cx = -MAP.half; cx < MAP.half; cx += chunk) {
      const lod = new THREE.LOD();
      const fine = new THREE.Mesh(build(cx, cz, near), mat);
      const coarse = new THREE.Mesh(build(cx, cz, far), mat);
      fine.receiveShadow = true; coarse.receiveShadow = true;
      lod.addLevel(fine, 0);
      lod.addLevel(coarse, 380);
      lod.position.set(0, 0, 0);
      // LOD 用中心距离判断
      fine.geometry.translate(0, 0, 0);
      lod.userData.center = new THREE.Vector3(cx + chunk / 2, 2, cz + chunk / 2);
      lod.autoUpdate = false;
      group.add(lod);
      chunks.push(lod);
    }
  }
  group.userData.update = (camera) => {
    for (const l of chunks) {
      const d = l.userData.center.distanceTo(camera.position) - chunk * 0.6;
      const useFine = d < 380;
      l.levels[0].object.visible = useFine;
      l.levels[1].object.visible = !useFine;
    }
  };
  group.userData.material = mat;
  return group;
}

// ---------- 黑水河 ----------
export function makeWater(textures) {
  const geo = new THREE.PlaneGeometry(2000, 1400, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, MAP.waterLevel, 300);
  const mat = new THREE.MeshStandardMaterial({ color: 0x060403, roughness: 0.09, metalness: 0.0, envMapIntensity: 0.5 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, FX);
    shader.uniforms.uNoiseW = { value: textures.noise };
    shader.vertexShader = 'varying vec3 vWW;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `
      varying vec3 vWW;
      uniform float uTime, uRain, uFlash, uNight;
      uniform vec4 uShips[4];
      uniform vec3 uGlowColor;
      uniform vec4 uPulse;
      uniform sampler2D uNoiseW;
      float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      vec2 rainRipples(vec2 p, float scale, float speed) {
        vec2 g = vec2(0.0);
        vec2 cell = floor(p * scale);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 c = cell + vec2(float(i), float(j));
          float h = hash12(c);
          vec2 center = (c + vec2(hash12(c + 7.1), hash12(c + 3.3))) / scale;
          float t = fract(uTime * speed + h);
          vec2 d = p - center;
          float dist = length(d);
          float r = t * 0.55 / scale * 1.8;
          float w = (1.0 - t);
          float ring = sin(clamp((dist - r) * scale * 18.0, -3.14159, 3.14159)) * w * w * (1.0 - smoothstep(0.0, 0.08 / scale, abs(dist - r)));
          g += normalize(d + 1e-4) * ring;
        }
        return g;
      }
    ` + shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      {
        vec2 grad = vec2(0.0);
        grad += rainRipples(vWW.xz, 1.6, 1.1) * 0.55 * uRain;
        grad += rainRipples(vWW.xz + 13.0, 0.9, 0.8) * 0.35 * uRain;
        // 微风细浪
        grad += (vec2(texture2D(uNoiseW, vWW.xz * 0.02 + uTime * 0.01).r, texture2D(uNoiseW, vWW.zx * 0.021 - uTime * 0.012).g) - 0.5) * 0.12;
        // 场涟漪：飞碟在水面压出的同心圆
        for (int i = 0; i < 4; i++) {
          vec2 d = vWW.xz - uShips[i].xz;
          float dist = length(d);
          float hgt = uShips[i].y;
          float strength = uShips[i].w * (1.0 - smoothstep(0.6, 5.0, hgt));
          float wave = cos(dist * 1.9 - uTime * 8.5) * exp(-dist * 0.11) * strength * smoothstep(0.5, 3.5, dist);
          grad += normalize(d + 1e-4) * wave * 0.9;
        }
        vec3 nW = normalize(vec3(-grad.x, 1.0, -grad.y));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
      }
    `).replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      for (int i = 0; i < 4; i++) {
        vec2 d = vWW.xz - uShips[i].xz;
        float dist = length(d);
        float strength = uShips[i].w * (1.0 - smoothstep(0.6, 5.5, uShips[i].y));
        float ring = 0.5 + 0.5 * cos(dist * 1.9 - uTime * 8.5);
        totalEmissiveRadiance += uGlowColor * strength * exp(-dist * 0.22) * (0.25 + 0.75 * ring) * 0.55;
      }
      {
        float age = uTime - uPulse.w;
        if (age > 0.0 && age < 1.4) {
          float pd = abs(length(vWW - uPulse.xyz) - age * 55.0);
          totalEmissiveRadiance += vec3(0.55, 0.95, 1.0) * exp(-pd * pd * 0.3) * (1.0 - age / 1.4) * 2.0;
        }
      }
      totalEmissiveRadiance += vec3(0.4, 0.45, 0.55) * uFlash * 0.15;
    `);
  };
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

// ---------- 灯光与雾 ----------
export function makeLights(scene, quality) {
  const hemi = new THREE.HemisphereLight(0x8e8a78, 0x1d2419, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xb98a3e, 0.8);
  sun.position.set(-300, 120, 80);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -90; c.right = 90; c.top = 90; c.bottom = -90; c.near = 10; c.far = 700;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.6;
  }
  scene.add(sun);
  scene.add(sun.target);
  const spots = [0, 1].map(() => {
    const s = new THREE.SpotLight(0xf2f4ff, 0, 190, THREE.MathUtils.degToRad(10), 0.45, 1.3);
    scene.add(s); scene.add(s.target);
    return s;
  });
  const flash = new THREE.PointLight(0xffc488, 0, 60, 1.6);
  scene.add(flash);
  scene.fog = new THREE.FogExp2(0x4f4c42, 0.006);
  return { hemi, sun, spots, flash };
}

export function updateAtmosphere(env, scene, lights, sky, camPos, flashBoost) {
  const night = 1 - env.light;
  const rain = env.rain;
  const fogDusk = new THREE.Color(0x4e4a3e), fogNight = new THREE.Color(0x0a0e12);
  const fog = fogDusk.clone().lerp(fogNight, Math.pow(night, 0.8));
  fog.lerp(new THREE.Color(0x9aa4b4), env.flash * 0.25);
  scene.fog.color.copy(fog);
  scene.fog.density = 0.0026 + rain * 0.0052 + night * 0.0008;
  sky.material.uniforms.uFog.value.copy(fog);
  lights.hemi.intensity = (0.95 * (1 - night) + 0.1 * night) + env.flash * 1.6;
  lights.hemi.color.setRGB(0.56 - night * 0.4, 0.54 - night * 0.38, 0.47 - night * 0.3);
  lights.hemi.groundColor.setRGB(0.12 - night * 0.08, 0.14 - night * 0.1, 0.1 - night * 0.07);
  lights.sun.intensity = 0.75 * (1 - night) * (1 - rain * 0.35);
  lights.sun.position.set(camPos.x - 300, 110 * (1 - night) + 30, camPos.z + 90);
  lights.sun.target.position.set(camPos.x, 0, camPos.z);
  FX.uNight.value = night;
  FX.uRain.value = rain;
  FX.uFlash.value = env.flash + flashBoost;
}
