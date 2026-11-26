// 特效：GPU 暴雨（被场弹开的雨滴勾出水雾外壳）、粒子、碎片（玻璃/铁皮/混凝土）、鸟群、光束、曳光弹、闪电、冲击波。
import * as THREE from 'three';
import { FX } from './shaderfx.js';
import { mulberry32 } from '../sim/noise.js';

const rnd = mulberry32(2024);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

// ---------- 暴雨 ----------
export function makeRain(count) {
  const BOX = 70, H = 38;
  const pos = new Float32Array(count * 2 * 3);
  const seed = new Float32Array(count * 2 * 4);
  for (let i = 0; i < count; i++) {
    const sx = rnd() * BOX, sy = rnd(), sz = rnd() * BOX, sp = 0.8 + rnd() * 0.4;
    for (let e = 0; e < 2; e++) {
      const k = i * 2 + e;
      seed[k * 4] = sx; seed[k * 4 + 1] = sy; seed[k * 4 + 2] = sz; seed[k * 4 + 3] = e + sp * 10;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: FX.uTime, uRain: FX.uRain, uShips: FX.uShips, uWind: FX.uWind, uCam: { value: new THREE.Vector3() }, uFlash: FX.uFlash, uNight: FX.uNight, uFogColor: { value: new THREE.Color() } },
    vertexShader: `
      attribute vec4 aSeed;
      uniform float uTime, uRain;
      uniform vec4 uShips[4];
      uniform vec2 uWind;
      uniform vec3 uCam;
      varying float vA;
      const float BOX = ${BOX.toFixed(1)};
      const float H = ${H.toFixed(1)};
      vec3 deflect(vec3 p, inout float hit) {
        for (int i = 0; i < 4; i++) {
          vec3 s = uShips[i].xyz;
          float on = step(0.02, uShips[i].w);
          float dy = p.y - (s.y - 0.2);
          if (dy < 0.0 || dy > 3.6) continue;
          float R = 4.6 * sqrt(max(0.0, 1.0 - (dy * dy) / (3.6 * 3.6)));
          vec2 d = p.xz - s.xz;
          float l = length(d);
          if (l < R && on > 0.5) { p.xz = s.xz + d / max(l, 0.001) * R; hit = 1.0; }
        }
        return p;
      }
      void main() {
        float sp = fract(aSeed.w) * 10.0;
        float e = floor(aSeed.w);
        float speed = 17.0 + sp * 4.0;
        vec3 p;
        p.x = mod(aSeed.x - uCam.x + uWind.x * uTime * 3.0, BOX) - BOX * 0.5 + uCam.x;
        p.z = mod(aSeed.z - uCam.z + uWind.y * uTime * 3.0, BOX) - BOX * 0.5 + uCam.z;
        p.y = uCam.y + H * 0.6 - mod(aSeed.y * H + uTime * speed, H);
        vec3 dir = normalize(vec3(uWind.x * 0.3, -1.0, uWind.y * 0.3));
        vec3 q = p - dir * e * (0.55 + 0.25 * sp / 10.0);
        float hit = 0.0;
        q = deflect(q, hit);
        vec4 mv = modelViewMatrix * vec4(q, 1.0);
        float dist = length(mv.xyz);
        vA = uRain * (1.0 - smoothstep(18.0, 34.0, dist)) * (0.5 + hit * 0.8) * step(0.001, uRain);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      uniform float uFlash, uNight;
      void main() {
        vec3 c = mix(vec3(0.62, 0.64, 0.62), vec3(0.22, 0.25, 0.3), uNight) + uFlash * 0.6;
        gl_FragColor = vec4(c, vA * 0.32);
      }`,
  });
  const mesh = new THREE.LineSegments(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return mesh;
}

// ---------- 粒子池 ----------
class ParticlePool {
  constructor(scene, max, texture, additive) {
    this.max = max;
    this.n = 0;
    this.p = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTex: { value: texture }, uScale: { value: 600 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.005 } },
      vertexShader: `
        attribute vec4 aColor; attribute float aSize; varying vec4 vC; varying float vFog; uniform float uScale; uniform float fogDensity;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv;
          float d = length(mv.xyz); vFog = 1.0 - exp(-fogDensity * fogDensity * d * d);
          vC.a *= smoothstep(1.2, 5.0, d); }`,
      fragmentShader: `
        uniform sampler2D uTex; uniform vec3 fogColor; varying vec4 vC; varying float vFog;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); vec3 c = vC.rgb * t.rgb; float a = vC.a * t.a;
          ${additive ? 'gl_FragColor = vec4(c * a * (1.0 - vFog), a);' : 'gl_FragColor = vec4(mix(c, fogColor, vFog), a);'} }`,
    });
    this.mesh = new THREE.Points(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 8 : 7;
    scene.add(this.mesh);
  }

  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 1, age: 0, s0: o.size || 1, s1: o.size1 ?? o.size ?? 1, r: o.r ?? 1, g: o.g ?? 1, b: o.b ?? 1, a: o.a ?? 1, drag: o.drag ?? 0.5, grav: o.grav ?? 0, ground: o.ground });
  }

  update(dt, fog) {
    const P = this.p;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.age += dt;
      if (q.age >= q.life) continue;
      const f = Math.exp(-q.drag * dt);
      q.vx *= f; q.vy = q.vy * f - q.grav * dt; q.vz *= f;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.ground !== undefined && q.y < q.ground) { q.y = q.ground; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
      P[w++] = q;
    }
    P.length = w;
    for (let i = 0; i < w; i++) {
      const q = P[i], t = q.age / q.life;
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      this.col[i * 4] = q.r; this.col[i * 4 + 1] = q.g; this.col[i * 4 + 2] = q.b; this.col[i * 4 + 3] = q.a * fade;
      this.size[i] = q.s0 + (q.s1 - q.s0) * t;
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, w);
    g.attributes.position.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
    if (fog) { this.mesh.material.uniforms.fogColor.value.copy(fog.color); this.mesh.material.uniforms.fogDensity.value = fog.density; }
  }
}

// ---------- 碎片 ----------
class DebrisPool {
  constructor(scene, max, geo, mat) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.max = max;
    this.p = [];
    if (mat.vertexColors === undefined || true) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    scene.add(this.mesh);
  }
  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, vz: o.vz, rx: rnd() * 6, ry: rnd() * 6, rz: rnd() * 6, wx: (rnd() - 0.5) * 14, wy: (rnd() - 0.5) * 14, wz: (rnd() - 0.5) * 14, s: o.s || 0.3, sy: o.sy || o.s || 0.3, sz: o.sz || o.s || 0.3, life: o.life || 3, age: 0, c: o.color || [1, 1, 1] });
  }
  update(dt, terrain) {
    const P = this.p;
    let w = 0;
    for (const q of P) {
      q.age += dt;
      if (q.age > q.life) continue;
      q.vy -= 9.8 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.rx += q.wx * dt; q.ry += q.wy * dt; q.rz += q.wz * dt;
      const g = terrain.groundHeight(q.x, q.z);
      if (q.y < g + 0.05) { q.y = g + 0.05; q.vy *= -0.25; q.vx *= 0.5; q.vz *= 0.5; q.wx *= 0.5; q.wy *= 0.5; q.wz *= 0.5; }
      const k = q.age > q.life - 0.5 ? (q.life - q.age) / 0.5 : 1;
      _q.setFromEuler(_e.set(q.rx, q.ry, q.rz));
      _m.compose(_p.set(q.x, q.y, q.z), _q, _s.set(q.s * k, q.sy * k, q.sz * k));
      this.mesh.setMatrixAt(w, _m);
      this.mesh.instanceColor.setXYZ(w, q.c[0], q.c[1], q.c[2]);
      P[w++] = q;
    }
    P.length = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------- 光束 / 线条 ----------
function beamCylinder(color, radius, opacity) {
  const g = new THREE.CylinderGeometry(radius, radius, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return mesh;
}

function orient(mesh, a, b) {
  const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  mesh.position.set(a.x, a.y, a.z);
  mesh.lookAt(b.x, b.y, b.z);
  mesh.scale.set(1, 1, L);
}

class LinePool {
  constructor(scene, max, color, additive = true) {
    this.max = max;
    this.items = [];
    this.pos = new Float32Array(max * 6);
    this.col = new Float32Array(max * 8);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, fog: false }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    scene.add(this.mesh);
  }
  add(a, b, color, life, opts = {}) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ a, b, color, life, age: 0, travel: opts.travel || 0, len: opts.len || 1 });
  }
  update(dt) {
    let w = 0;
    for (const it of this.items) {
      it.age += dt;
      if (it.age > it.life) continue;
      let a = it.a, b = it.b;
      if (it.travel) {
        // 曳光弹：一段短亮线沿弹道飞
        const t = Math.min(1, it.age / it.travel);
        const t0 = Math.max(0, t - 0.25);
        a = { x: it.a.x + (it.b.x - it.a.x) * t0, y: it.a.y + (it.b.y - it.a.y) * t0, z: it.a.z + (it.b.z - it.a.z) * t0 };
        b = { x: it.a.x + (it.b.x - it.a.x) * t, y: it.a.y + (it.b.y - it.a.y) * t, z: it.a.z + (it.b.z - it.a.z) * t };
      }
      const f = 1 - it.age / it.life;
      this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], w * 6);
      const [r, g, bb] = it.color;
      this.col.set([r * f, g * f, bb * f, f, r * f, g * f, bb * f, f], w * 8);
      this.items[w++] = it;
    }
    this.items.length = w;
    const g = this.mesh.geometry;
    g.setDrawRange(0, w * 2);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
}

function shellMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uA; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(uColor * f * uA * 2.0, f * uA); }`,
  });
}

// ---------- 总装 ----------
export class Effects {
  constructor(scene, world, textures, quality) {
    this.scene = scene;
    this.w = world;
    this.q = quality;
    this.T = world.terrain;
    this.rain = makeRain(Math.round(11000 * quality.particles));
    scene.add(this.rain);
    this.add = new ParticlePool(scene, Math.round(2600 * quality.particles), textures.glow, true);
    this.alpha = new ParticlePool(scene, Math.round(2600 * quality.particles), textures.smoke, false);
    this.leaves = new ParticlePool(scene, Math.round(700 * quality.particles), textures.leafP, false);
    const shardGeo = new THREE.BufferGeometry();
    shardGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0.3, 1, 0], 3));
    shardGeo.computeVertexNormals();
    this.glass = new DebrisPool(scene, 900, shardGeo, new THREE.MeshStandardMaterial({ color: 0xb8d4dc, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.7, side: THREE.DoubleSide, envMapIntensity: 2 }));
    this.chunks = new DebrisPool(scene, 500, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.5 }));
    this.tracers = new LinePool(scene, 260, [1, 0.8, 0.4]);
    this.bolts = new LinePool(scene, 600, [0.8, 0.9, 1]);
    // 湮灭束 / 静滞束 / 僚机光束
    this.beamCore = beamCylinder(0xfff6e8, 0.05, 1);
    this.beamGlow = beamCylinder(0xff9a4a, 0.2, 0.28);
    this.beamCore.visible = this.beamGlow.visible = false;
    scene.add(this.beamCore, this.beamGlow);
    this.flashBeams = [];
    // 冲击波球壳
    this.shells = [];
    this.shellGeo = new THREE.SphereGeometry(1, 32, 16);
    this.ringGeo = new THREE.TorusGeometry(1, 0.012, 4, 96);
    // 鸟群
    const birdGeo = new THREE.BufferGeometry();
    birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0.1, 0, 0, -0.15, 0, 0.02, 0.15, 0.5, 0, 0.1, 0, 0, -0.15, 0, 0.02, 0.15], 3));
    birdGeo.computeVertexNormals();
    this.birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: 0x15161a, side: THREE.DoubleSide }), 400);
    this.birds.frustumCulled = false; this.birds.count = 0;
    scene.add(this.birds);
    this.flocks = [];
    // 闪光点光源
    this.flash = null;
    this.flashT = 0;
    // 撤离点信标
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 140, 16, 1, true).translate(0, 70, 0), new THREE.MeshBasicMaterial({ color: 0x8fe3e8, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beacon.position.set(world.extract.x, 0, world.extract.z);
    scene.add(beacon);
    this.beacon = beacon;
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0x8fe3e8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = Math.PI / 2; ring.scale.setScalar(world.extract.r); ring.position.set(world.extract.x, 0.3, world.extract.z);
    scene.add(ring);
    this.beaconRing = ring;
    this.anchors = new Map();
    this.time = 0;
    this.smokeT = 0;
  }

  setFlashLight(light) { this.flash = light; }

  // ---------- 事件 ----------
  onEvent(e, camPos) {
    const w = this.w;
    switch (e.type) {
      case 'hit': this._hit(e); break;
      case 'destroyed': this._destroyed(e); break;
      case 'explosion': this._explosion(e.x, e.y, e.z, e.size || 1); break;
      case 'tracer': this.tracers.add(e.from, e.to, e.kind === 'heli' ? [1, 0.6, 0.3] : [1, 0.82, 0.45], 0.22, { travel: 0.12 }); if (e.hit) this._sparks(e.to, 6, [1, 0.7, 0.4]); break;
      case 'fire': this._fire(e); break;
      case 'wingFire': {
        const b = beamCylinder(e.kind === 'needles' ? 0xbfe9ec : 0x8fe3e8, 0.07, 0.9);
        orient(b, e.from, e.to);
        this.scene.add(b);
        this.flashBeams.push({ mesh: b, life: 0.35, age: 0 });
        this._sparks(e.to, 10, [0.6, 0.9, 1]);
        break;
      }
      case 'needleHit': this._sparks(e, 5, [0.7, 0.95, 1]); this.add.spawn({ x: e.x, y: e.y, z: e.z, size: 2.5, size1: 0.5, life: 0.25, r: 0.6, g: 0.9, b: 1 }); break;
      case 'beamImpact': this._sparks(e, 9, [1, 0.75, 0.45]); this.add.spawn({ x: e.x, y: e.y, z: e.z, size: 3, size1: 1.5, life: 0.2, r: 1, g: 0.7, b: 0.4 }); break;
      case 'lightning': this._lightning(e); break;
      case 'pulse': this._shell(e, 0x8fe3e8, e.r, 0.7); this._ring(e, 0x8fe3e8, e.r * 1.2, 0.9); break;
      case 'scan': this._ring(e, 0x8fe3e8, e.r, 2.4, 0.6); break;
      case 'birds': this._flock(e); break;
      case 'ship:scrape': this._scrape(e); break;
      case 'stasis': this._sparks(e, 14, [0.6, 0.95, 1], 4); break;
      case 'droneCrash': this._sparks(e, 16, [1, 0.8, 0.5]); this._chunks(e, 5, [0.15, 0.15, 0.16], 0.25); break;
      case 'stormStart': this._shell({ x: e.x, y: 10, z: e.z }, 0x9ab8ff, 60, 1.2); break;
      case 'ship:damage': if (e.ship === 'player') this._sparks({ x: e.x, y: e.y + 0.3, z: e.z }, 3, [1, 0.6, 0.3]); break;
    }
  }

  _hit(e) {
    const mat = e.material;
    if (mat === 'glass') this._glassBurst(e, 8);
    else if (mat === 'flesh') this.alpha.spawn({ x: e.x, y: e.y, z: e.z, size: 1.2, size1: 2.5, life: 0.5, r: 0.5, g: 0.5, b: 0.5, a: 0.5 });
    else { this._sparks(e, e.weapon === 'beam' ? 4 : 10, [1, 0.75, 0.4]); if (rnd() < 0.3) this._chunks(e, 2, [0.25, 0.26, 0.25], 0.18); }
  }

  _destroyed(e) {
    switch (e.kind) {
      case 'glass': this._glassBurst(e, 46, e.nx, e.nz); break;
      case 'container': this._chunks(e, 22, [0.45, 0.22, 0.14], 0.9, 2.6); this._explosion(e.x, e.y, e.z, 0.6); break;
      case 'fence': this._chunks(e, 8, [0.5, 0.52, 0.5], 0.2, 1.2); break;
      case 'tower': case 'commTower': case 'generator': this._explosion(e.x, e.y, e.z, 1.6); this._chunks(e, 26, [0.2, 0.2, 0.22], 0.6, 3); break;
      default: this._explosion(e.x, e.y, e.z, 0.5); this._chunks(e, 6, [0.2, 0.2, 0.2], 0.25);
    }
  }

  _sparks(p, n, c, speed = 9) {
    for (let i = 0; i < n * this.q.particles; i++) {
      this.add.spawn({ x: p.x, y: p.y, z: p.z, vx: (rnd() - 0.5) * speed * 2, vy: rnd() * speed, vz: (rnd() - 0.5) * speed * 2, life: 0.35 + rnd() * 0.4, size: 0.35, size1: 0.05, r: c[0], g: c[1], b: c[2], drag: 1.2, grav: 12 });
    }
  }

  _chunks(p, n, c, s, spd = 6) {
    for (let i = 0; i < n; i++) {
      const k = 0.7 + rnd() * 0.6;
      this.chunks.spawn({ x: p.x + (rnd() - 0.5) * 2, y: p.y + rnd(), z: p.z + (rnd() - 0.5) * 2, vx: (rnd() - 0.5) * spd * 2, vy: rnd() * spd + 2, vz: (rnd() - 0.5) * spd * 2, s: s * k, sy: s * k * (0.2 + rnd() * 0.8), sz: s * k * (0.5 + rnd()), life: 3 + rnd() * 2, color: [c[0] * k, c[1] * k, c[2] * k] });
    }
  }

  _glassBurst(p, n, nx = 0, nz = 0) {
    for (let i = 0; i < n; i++) {
      this.glass.spawn({ x: p.x + (rnd() - 0.5) * 2, y: p.y + (rnd() - 0.5) * 2.5, z: p.z + (rnd() - 0.5) * 2, vx: nx * (3 + rnd() * 5) + (rnd() - 0.5) * 6, vy: rnd() * 4, vz: nz * (3 + rnd() * 5) + (rnd() - 0.5) * 6, s: 0.15 + rnd() * 0.35, life: 2.5 + rnd(), color: [0.8, 0.9, 0.95] });
    }
    for (let i = 0; i < n * 0.4; i++) this.add.spawn({ x: p.x, y: p.y, z: p.z, vx: (rnd() - 0.5) * 8, vy: rnd() * 5, vz: (rnd() - 0.5) * 8, life: 0.5, size: 0.25, size1: 0.02, r: 0.85, g: 0.95, b: 1, drag: 1, grav: 9 });
  }

  _explosion(x, y, z, size) {
    const q = this.q.particles;
    for (let i = 0; i < 22 * size * q; i++) this.add.spawn({ x, y, z, vx: (rnd() - 0.5) * 14 * size, vy: rnd() * 10 * size, vz: (rnd() - 0.5) * 14 * size, life: 0.5 + rnd() * 0.5, size: 3 * size, size1: 7 * size, r: 1, g: 0.55 + rnd() * 0.2, b: 0.25, a: 0.9, drag: 2.5 });
    for (let i = 0; i < 16 * size * q; i++) this.alpha.spawn({ x, y, z, vx: (rnd() - 0.5) * 6, vy: 2 + rnd() * 4, vz: (rnd() - 0.5) * 6, life: 2.5 + rnd() * 2, size: 3 * size, size1: 12 * size, r: 0.16, g: 0.15, b: 0.14, a: 0.65, drag: 0.8 });
    this._sparks({ x, y, z }, 20 * size, [1, 0.7, 0.35], 14);
    this._ring({ x, y: y + 0.3, z }, 0xffb070, 10 * size, 0.45, 0.8);
    if (this.flash) { this.flash.position.set(x, y + 2, z); this.flash.intensity = 60 * size; this.flash.distance = 40 + 30 * size; this.flashT = 0.25; this.flash.color.setHex(0xffb070); }
  }

  _fire(e) {
    switch (e.weapon) {
      case 'stasis': {
        const b = beamCylinder(0x8fe3e8, 0.05, 0.9);
        orient(b, e.from, e.to);
        this.scene.add(b);
        this.flashBeams.push({ mesh: b, life: 0.6, age: 0 });
        for (let i = 0; i < 20; i++) { const t = rnd(); this.add.spawn({ x: e.from.x + (e.to.x - e.from.x) * t, y: e.from.y + (e.to.y - e.from.y) * t, z: e.from.z + (e.to.z - e.from.z) * t, vy: 0.3, life: 0.8, size: 0.3, size1: 0, r: 0.6, g: 0.95, b: 1, drag: 1 }); }
        break;
      }
      case 'anchor': this._ring(e.to, 0x8fe3e8, 12, 0.5); this.anchors.set(this.time, { p: e.to, t: 15 }); this._chunks(e.to, 6, [0.25, 0.2, 0.15], 0.2, 3); break;
      case 'fog': this._shell(e.to, 0xd8f2f4, e.to.r, 2.5, 0.25); break;
      case 'hammer': {
        const a = Math.atan2(e.dir.x, e.dir.z);
        for (let k = 0; k < 3; k++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 4, 40, Math.PI * 0.62), shellMaterial(0xd8f6f8));
          ring.position.set(e.from.x, e.from.y - 0.3, e.from.z);
          ring.rotation.set(Math.PI / 2, 0, -a - Math.PI * 0.31 + Math.PI / 2);
          this.scene.add(ring);
          this.shells.push({ mesh: ring, life: 0.5 + k * 0.08, age: -k * 0.06, r0: 2, r1: 42 });
        }
        for (let i = 0; i < 40; i++) {
          const sp = (rnd() - 0.5) * 1.2;
          const dx = e.dir.x * Math.cos(sp) - e.dir.z * Math.sin(sp), dz = e.dir.x * Math.sin(sp) + e.dir.z * Math.cos(sp);
          this.alpha.spawn({ x: e.from.x + dx * 4, y: e.from.y - 0.8, z: e.from.z + dz * 4, vx: dx * 30, vy: 1, vz: dz * 30, life: 1.4, size: 2, size1: 7, r: 0.42, g: 0.38, b: 0.32, a: 0.45, drag: 2.2 });
        }
        break;
      }
      case 'swarm': for (let i = 0; i < 12; i++) this.add.spawn({ x: e.from.x, y: e.from.y - 0.3, z: e.from.z, vx: (rnd() - 0.5) * 8, vy: rnd() * 4, vz: (rnd() - 0.5) * 8, life: 0.3, size: 0.8, size1: 0.1, r: 0.7, g: 0.95, b: 1 }); break;
    }
  }

  _lightning(e) {
    const top = { x: e.x + (rnd() - 0.5) * 30, y: e.y + 90, z: e.z + (rnd() - 0.5) * 30 };
    const segs = 14;
    let prev = top;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const p = { x: top.x + (e.x - top.x) * t + (rnd() - 0.5) * 7 * (1 - t), y: top.y + (e.y - top.y) * t, z: top.z + (e.z - top.z) * t + (rnd() - 0.5) * 7 * (1 - t) };
      this.bolts.add(prev, p, [0.85, 0.92, 1], 0.22);
      if (rnd() < 0.35) {
        const b = { x: p.x + (rnd() - 0.5) * 14, y: p.y - 6 - rnd() * 8, z: p.z + (rnd() - 0.5) * 14 };
        this.bolts.add(p, b, [0.6, 0.7, 1], 0.16);
      }
      prev = p;
    }
    this.add.spawn({ x: e.x, y: e.y + 1, z: e.z, size: 14, size1: 4, life: 0.25, r: 0.75, g: 0.85, b: 1 });
    this._sparks(e, 10, [0.8, 0.9, 1], 12);
    if (this.flash) { this.flash.position.set(e.x, e.y + 6, e.z); this.flash.intensity = 120; this.flash.distance = 90; this.flash.color.setHex(0xbfd4ff); this.flashT = 0.12; }
  }

  _shell(p, color, r, life, a = 1) {
    const m = new THREE.Mesh(this.shellGeo, shellMaterial(color));
    m.position.set(p.x, p.y, p.z);
    m.material.uniforms.uA.value = a;
    m.renderOrder = 9;
    this.scene.add(m);
    this.shells.push({ mesh: m, life, age: 0, r0: 0.5, r1: r, a });
  }

  _ring(p, color, r, life, a = 1) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: a, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.rotation.x = Math.PI / 2;
    m.position.set(p.x, (p.y ?? 0) + 0.2, p.z);
    this.scene.add(m);
    this.shells.push({ mesh: m, life, age: 0, r0: 0.5, r1: r, ring: true, a });
  }

  _flock(e) {
    const n = 18 + ((e.x * 7) & 15);
    const birds = [];
    for (let i = 0; i < n; i++) birds.push({ x: e.x + (rnd() - 0.5) * 10, y: e.y - 6 + rnd() * 3, z: e.z + (rnd() - 0.5) * 10, vx: (rnd() - 0.5) * 6, vy: 3 + rnd() * 3, vz: (rnd() - 0.5) * 6, ph: rnd() * 6, s: 0.6 + rnd() * 0.5 });
    this.flocks.push({ birds, age: 0 });
    for (let i = 0; i < 30 * this.q.particles; i++) this.leaves.spawn({ x: e.x + (rnd() - 0.5) * 14, y: e.y - 4 + rnd() * 4, z: e.z + (rnd() - 0.5) * 14, vx: (rnd() - 0.5) * 2, vy: -1 - rnd(), vz: (rnd() - 0.5) * 2, life: 4, size: 0.5, r: 0.6, g: 0.6, b: 0.5, drag: 1.5, grav: 0.5 });
  }

  _scrape(e) {
    const water = this.T.isWater(e.x, e.z);
    for (let i = 0; i < 14 * this.q.particles; i++) {
      if (water) this.alpha.spawn({ x: e.x + (rnd() - 0.5) * 6, y: 0.2, z: e.z + (rnd() - 0.5) * 6, vx: (rnd() - 0.5) * 4, vy: 2 + rnd() * 3, vz: (rnd() - 0.5) * 4, life: 1, size: 0.8, size1: 2.5, r: 0.7, g: 0.72, b: 0.72, a: 0.5, grav: 6 });
      else this.add.spawn({ x: e.x + (rnd() - 0.5) * 6, y: e.y - 0.3, z: e.z + (rnd() - 0.5) * 6, vx: (rnd() - 0.5) * 8, vy: rnd() * 4, vz: (rnd() - 0.5) * 8, life: 0.4, size: 0.3, size1: 0.05, r: 1, g: 0.8, b: 0.5, grav: 10, drag: 1 });
    }
    if (!water) for (let i = 0; i < 6; i++) this.leaves.spawn({ x: e.x, y: e.y, z: e.z, vx: (rnd() - 0.5) * 6, vy: 2 + rnd() * 3, vz: (rnd() - 0.5) * 6, life: 2.5, size: 0.5, r: 0.55, g: 0.5, b: 0.35, drag: 1.4, grav: 2 });
  }

  // ---------- 每帧 ----------
  update(dt, camPos, fog) {
    const w = this.w;
    this.time += dt;
    this.rain.material.uniforms.uCam.value.copy(camPos);
    this.rain.visible = w.env.rain > 0.01;
    // 低空高速：落叶与水雾
    for (const s of w.allShips()) {
      const em = w.traces.emissions.get(s.id);
      if (!em || s.destroyed) continue;
      const d2 = (s.pos.x - camPos.x) ** 2 + (s.pos.z - camPos.z) ** 2;
      if (d2 > 160 * 160) continue;
      if (em.mist) {
        const water = this.T.isWater(s.pos.x, s.pos.z);
        const n = Math.ceil(dt * 70 * this.q.particles * (s.speed / 40));
        for (let i = 0; i < n; i++) {
          const a = rnd() * Math.PI * 2, r = 2.5 + rnd() * 2.5;
          const g = this.T.groundHeight(s.pos.x + Math.cos(a) * r, s.pos.z + Math.sin(a) * r);
          this.alpha.spawn({ x: s.pos.x + Math.cos(a) * r, y: g + 0.2, z: s.pos.z + Math.sin(a) * r, vx: Math.cos(a) * 5 + s.vel.x * 0.25, vy: 1.5 + rnd() * 2.5, vz: Math.sin(a) * 5 + s.vel.z * 0.25, life: 1.6 + rnd(), size: 1.2, size1: 4.5, r: 0.66, g: 0.68, b: 0.66, a: water ? 0.35 : 0.22, drag: 1.2 });
          if (!water && rnd() < 0.45) this.leaves.spawn({ x: s.pos.x + Math.cos(a) * r, y: g + 0.3, z: s.pos.z + Math.sin(a) * r, vx: Math.cos(a) * 6 + s.vel.x * 0.4, vy: 2 + rnd() * 4, vz: Math.sin(a) * 6 + s.vel.z * 0.4, life: 2.5, size: 0.45, r: 0.62, g: 0.55, b: 0.38, drag: 1.6, grav: 2.5 });
        }
      }
      if (em.heat && rnd() < dt * 12) {
        const l = Math.hypot(s.vel.x, s.vel.z) || 1;
        this.alpha.spawn({ x: s.pos.x - (s.vel.x / l) * 3.4, y: s.pos.y + 0.1, z: s.pos.z - (s.vel.z / l) * 3.4, vx: -s.vel.x * 0.1, vy: 1.2, vz: -s.vel.z * 0.1, life: 1.8, size: 1, size1: 3.5, r: 0.8, g: 0.8, b: 0.8, a: 0.18 * (1 - w.env.rain * 0.5), drag: 0.6 });
      }
    }
    // 发电机排烟
    this.smokeT -= dt;
    if (this.smokeT <= 0 && w.power.on) {
      this.smokeT = 0.18;
      for (const x of [-34, -32]) this.alpha.spawn({ x, y: 14, z: -460, vx: 0.4 + rnd() * 0.4, vy: 2.5, vz: 0.6, life: 4, size: 1.2, size1: 5, r: 0.25, g: 0.25, b: 0.25, a: 0.35, drag: 0.2 });
    }
    this.add.update(dt, fog); this.alpha.update(dt, fog); this.leaves.update(dt, fog);
    this.glass.update(dt, this.T); this.chunks.update(dt, this.T);
    this.tracers.update(dt); this.bolts.update(dt);
    // 湮灭束
    const beam = w.weapons.beam;
    this.beamCore.visible = this.beamGlow.visible = !!beam;
    if (beam) {
      const dx = beam.to.x - beam.from.x, dy = beam.to.y - beam.from.y, dz = beam.to.z - beam.from.z, L = Math.hypot(dx, dy, dz) || 1;
      const from = { x: beam.from.x + (dx / L) * 4.2, y: beam.from.y - 1.05 + (dy / L) * 4.2, z: beam.from.z + (dz / L) * 4.2 };
      orient(this.beamCore, from, beam.to); orient(this.beamGlow, from, beam.to);
      const flick = 0.8 + rnd() * 0.4;
      this.beamGlow.scale.x = this.beamGlow.scale.y = flick;
      if (beam.hit !== 'none') {
        this.add.spawn({ x: beam.to.x, y: beam.to.y, z: beam.to.z, vx: (rnd() - 0.5) * 10, vy: rnd() * 8, vz: (rnd() - 0.5) * 10, life: 0.4, size: 0.4, size1: 0.05, r: 1, g: 0.75, b: 0.4, grav: 14, drag: 1 });
        this.add.spawn({ x: beam.to.x, y: beam.to.y, z: beam.to.z, life: 0.08, size: 4, size1: 3, r: 1, g: 0.8, b: 0.55 });
      }
      if (this.flash) { this.flash.position.set(beam.to.x, beam.to.y + 1, beam.to.z); this.flash.intensity = 25; this.flash.distance = 30; this.flash.color.setHex(0xffb070); this.flashT = 0.05; }
    }
    // 蜂群针
    for (const n of w.weapons.needles) if (!(n.delay > 0)) this.add.spawn({ x: n.x, y: n.y, z: n.z, life: 0.18, size: 0.5, size1: 0.1, r: 0.7, g: 0.95, b: 1 });
    // 火箭
    for (const p of w.combat.projectiles) if (!(p.delay > 0)) { this.add.spawn({ x: p.x, y: p.y, z: p.z, life: 0.12, size: 1.2, size1: 0.4, r: 1, g: 0.7, b: 0.3 }); this.alpha.spawn({ x: p.x, y: p.y, z: p.z, life: 1.2, size: 0.8, size1: 2.5, r: 0.5, g: 0.5, b: 0.5, a: 0.3 }); }
    // 瞬时光束
    for (const b of this.flashBeams) { b.age += dt; b.mesh.material.opacity = Math.max(0, 1 - b.age / b.life); if (b.age > b.life) { this.scene.remove(b.mesh); b.mesh.geometry.dispose(); b.dead = true; } }
    this.flashBeams = this.flashBeams.filter((b) => !b.dead);
    // 冲击波
    for (const s of this.shells) {
      s.age += dt;
      if (s.age < 0) { s.mesh.visible = false; continue; }
      s.mesh.visible = true;
      const t = Math.min(1, s.age / s.life);
      const r = s.r0 + (s.r1 - s.r0) * (1 - Math.pow(1 - t, 2.2));
      s.mesh.scale.setScalar(r);
      const a = (1 - t) * (s.a ?? 1);
      if (s.mesh.material.uniforms) s.mesh.material.uniforms.uA.value = a; else s.mesh.material.opacity = a;
      if (s.age > s.life) { this.scene.remove(s.mesh); s.dead = true; }
    }
    this.shells = this.shells.filter((s) => !s.dead);
    // 重力锚：旋涡粒子
    for (const [k, a] of this.anchors) {
      a.t -= dt;
      if (a.t <= 0) { this.anchors.delete(k); continue; }
      for (let i = 0; i < 3; i++) {
        const ang = rnd() * Math.PI * 2, r = 4 + rnd() * 8;
        this.add.spawn({ x: a.p.x + Math.cos(ang) * r, y: a.p.y + 0.5 + rnd() * 3, z: a.p.z + Math.sin(ang) * r, vx: -Math.cos(ang) * r * 0.8 - Math.sin(ang) * 5, vy: -0.8, vz: -Math.sin(ang) * r * 0.8 + Math.cos(ang) * 5, life: 1, size: 0.3, size1: 0.05, r: 0.55, g: 0.85, b: 0.95, drag: 0.5 });
      }
    }
    // 鸟群
    let bi = 0;
    for (const f of this.flocks) {
      f.age += dt;
      for (const b of f.birds) {
        b.vy += (2.5 - b.vy) * dt * 0.5; b.vx *= 1 + dt * 0.3; b.vz *= 1 + dt * 0.3;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        if (bi < 400 && f.age < 9) {
          const flap = 0.4 + Math.abs(Math.sin(this.time * 14 + b.ph)) * 0.9;
          _q.setFromEuler(_e.set(0, Math.atan2(b.vx, b.vz), 0));
          _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(b.s * 1.4, b.s * flap * 2.2, b.s));
          this.birds.setMatrixAt(bi++, _m);
        }
      }
    }
    this.flocks = this.flocks.filter((f) => f.age < 9);
    this.birds.count = bi;
    this.birds.instanceMatrix.needsUpdate = true;
    // 闪光
    if (this.flash) { this.flashT -= dt; if (this.flashT <= 0) this.flash.intensity *= Math.exp(-dt * 18); }
    // 撤离点信标：带着场核时更亮
    const core = w.mission.core.taken;
    this.beacon.material.opacity = (core ? 0.14 : 0.05) * (0.8 + 0.2 * Math.sin(this.time * 2));
    this.beaconRing.material.opacity = core ? 0.6 : 0.25;
  }
}
