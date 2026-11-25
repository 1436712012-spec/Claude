// Instanced views of every moving thing, plus purely visual particles.

import * as THREE from 'three';
import { ENEMIES } from '../config';
import { KINDS, MAX_ENEMIES, type Enemies } from '../enemies';
import { MAX_STARS, PickKind, type Pickups } from '../pickups';
import type { Player } from '../player';
import { MAX_PLANES, type Arsenal } from '../weapons';
import {
  balloonGeometry, buildDreamer, chestGeometry, facelessGeometry, noteGeometry, paperGeometry,
  paperPlaneGeometry, rimMaterial, softDiscTexture, starGeometry,
} from './models';

const MAX_PARTICLES = 3000;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export class EntityView {
  group = new THREE.Group();
  enemyMeshes: THREE.InstancedMesh[] = [];
  paperOutline: THREE.InstancedMesh;
  shadows: THREE.InstancedMesh;
  planes: THREE.InstancedMesh;
  notes: THREE.InstancedMesh;
  stars: THREE.InstancedMesh;
  milk: THREE.InstancedMesh;
  chests: THREE.InstancedMesh;
  beams: THREE.InstancedMesh;
  petals: THREE.InstancedMesh;
  aura: THREE.Mesh;
  ring: THREE.Mesh;
  dreamer: ReturnType<typeof buildDreamer>;
  playerLight: THREE.PointLight;
  ghosts: { obj: THREE.Group; life: number; mats: THREE.MeshBasicMaterial[] }[] = [];
  motes: THREE.Points;

  // particle sim (visual only)
  private pn = 0;
  private ppos = new Float32Array(MAX_PARTICLES * 3);
  private pvel = new Float32Array(MAX_PARTICLES * 3);
  private prot = new Float32Array(MAX_PARTICLES * 3);
  private pspin = new Float32Array(MAX_PARTICLES * 3);
  private plife = new Float32Array(MAX_PARTICLES);
  private pmax = new Float32Array(MAX_PARTICLES);
  private psize = new Float32Array(MAX_PARTICLES);
  private pcol = new Float32Array(MAX_PARTICLES * 3);

  auraU = { uTime: { value: 0 }, uPulse: { value: 0 }, uOn: { value: 0 } };
  ringU = { uFill: { value: 1 }, uReady: { value: 1 }, uTime: { value: 0 }, uDash: { value: 0 } };
  beamU = { uTime: { value: 0 } };

  constructor() {
    // ---- enemies (one instanced mesh per kind) ----
    const geos = [facelessGeometry(), balloonGeometry(), paperGeometry()];
    KINDS.forEach((k, idx) => {
      const mat = rimMaterial({
        roughness: k === 'balloon' ? 0.28 : k === 'paper' ? 0.92 : 0.7,
        rim: k === 'balloon' ? 0.25 : 0.42,
        side: k === 'paper' ? THREE.DoubleSide : THREE.FrontSide,
      });
      const m = new THREE.InstancedMesh(geos[idx], mat, MAX_ENEMIES);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ENEMIES * 3), 3);
      m.count = 0; m.frustumCulled = false; m.castShadow = k !== 'balloon';
      this.enemyMeshes.push(m); this.group.add(m);
    });

    // Paper dolls get an ink outline shell (white-on-white needs a line to read).
    const pg = geos[2].clone();
    pg.translate(0, -0.5, 0); pg.scale(1.07, 1.05, 3.2); pg.translate(0, 0.5, 0);
    this.paperOutline = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ color: 0x6a6388, side: THREE.BackSide, transparent: true, opacity: 0.6, depthWrite: false }), MAX_ENEMIES);
    this.paperOutline.count = 0; this.paperOutline.frustumCulled = false;
    this.group.add(this.paperOutline);

    // ---- soft blob shadows under everything that moves ----
    const disc = softDiscTexture();
    const shGeo = new THREE.PlaneGeometry(1, 1); shGeo.rotateX(-Math.PI / 2);
    const shMat = new THREE.MeshBasicMaterial({ map: disc, color: 0x31405a, transparent: true, opacity: 0.32, depthWrite: false });
    this.shadows = new THREE.InstancedMesh(shGeo, shMat, MAX_ENEMIES + 64);
    this.shadows.count = 0; this.shadows.frustumCulled = false; this.shadows.renderOrder = 1;
    this.group.add(this.shadows);

    // ---- paper planes ----
    this.planes = new THREE.InstancedMesh(paperPlaneGeometry(), new THREE.MeshStandardMaterial({ color: 0xfffdf6, roughness: 0.8, side: THREE.DoubleSide, emissive: 0xfff3e0, emissiveIntensity: 0.25 }), MAX_PLANES);
    this.planes.count = 0; this.planes.frustumCulled = false; this.planes.castShadow = true;
    this.group.add(this.planes);

    // ---- music notes ----
    const noteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.0 });
    this.notes = new THREE.InstancedMesh(noteGeometry(), noteMat, 16);
    this.notes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(16 * 3), 3);
    this.notes.count = 0; this.notes.frustumCulled = false; this.notes.castShadow = true;
    this.group.add(this.notes);

    // ---- star shards & milk ----
    const starMat = new THREE.MeshStandardMaterial({ color: 0xfff1c9, roughness: 0.25, metalness: 0.1, emissive: 0xffe3a6, emissiveIntensity: 1.6 });
    this.stars = new THREE.InstancedMesh(starGeometry(0.11), starMat, MAX_STARS);
    this.stars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STARS * 3), 3);
    this.stars.count = 0; this.stars.frustumCulled = false;
    this.group.add(this.stars);
    const milkGeo = new THREE.CapsuleGeometry(0.09, 0.14, 4, 12); milkGeo.translate(0, 0.16, 0);
    this.milk = new THREE.InstancedMesh(milkGeo, new THREE.MeshStandardMaterial({ color: 0xfffbf0, roughness: 0.35, emissive: 0xffd9e2, emissiveIntensity: 0.5 }), 64);
    this.milk.count = 0; this.milk.frustumCulled = false; this.milk.castShadow = true;
    this.group.add(this.milk);

    // ---- gift boxes in sealed rooms, with a beam you can see through the haze ----
    this.chests = new THREE.InstancedMesh(chestGeometry(), rimMaterial({ roughness: 0.5, rim: 0.5, emissive: 0x332a2a }), 32);
    this.chests.count = 0; this.chests.frustumCulled = false; this.chests.castShadow = true;
    this.group.add(this.chests);
    const beamGeo = new THREE.CylinderGeometry(0.42, 0.6, 7, 24, 1, true); beamGeo.translate(0, 3.5, 0);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: this.beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){
          float a = (1.0 - vUv.y) * (1.0 - vUv.y) * (0.5 + 0.5 * sin(vUv.x * 40.0 + uTime * 1.5 + vUv.y * 6.0));
          a *= 0.55 + 0.45 * sin(uTime * 2.0);
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.9) * a * 0.55, 1.0);
        }`,
    });
    this.beams = new THREE.InstancedMesh(beamGeo, beamMat, 32);
    this.beams.count = 0; this.beams.frustumCulled = false;
    this.group.add(this.beams);

    // ---- petals / confetti / paper scraps ----
    const petalGeo = new THREE.CircleGeometry(0.06, 7); petalGeo.scale(1, 0.55, 1);
    this.petals = new THREE.InstancedMesh(petalGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.15 }), MAX_PARTICLES);
    this.petals.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    this.petals.count = 0; this.petals.frustumCulled = false;
    this.group.add(this.petals);

    // ---- nightlight aura ----
    const auraGeo = new THREE.CircleGeometry(1, 96); auraGeo.rotateX(-Math.PI / 2);
    this.aura = new THREE.Mesh(auraGeo, new THREE.ShaderMaterial({
      uniforms: this.auraU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uPulse; uniform float uOn; varying vec2 vP;
        void main(){
          float r = length(vP);
          float a = atan(vP.y, vP.x);
          float rays = 0.65 + 0.35 * sin(a * 9.0 + uTime * 0.6) * sin(a * 5.0 - uTime * 0.4);
          float body = smoothstep(1.0, 0.25, r) * smoothstep(0.0, 0.5, r) * 0.085 * rays;
          float edge = smoothstep(0.9, 0.975, r) * smoothstep(1.0, 0.975, r) * 0.32;
          float wave = smoothstep(0.05, 0.0, abs(r - (1.0 - uPulse))) * uPulse * 0.45;
          vec3 c = vec3(1.0, 0.78, 0.52) * (body + edge) + vec3(1.0, 0.92, 0.75) * wave;
          gl_FragColor = vec4(c * uOn, 1.0);
        }`,
    }));
    this.aura.renderOrder = 2;
    this.group.add(this.aura);

    // ---- noclip readiness ring under the dreamer ----
    const ringGeo = new THREE.RingGeometry(0.46, 0.52, 96); ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
      uniforms: this.ringU, transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uFill; uniform float uReady; uniform float uTime; uniform float uDash; varying vec2 vP;
        void main(){
          float a = (atan(vP.x, -vP.y) / 6.28318) + 0.5;
          float on = step(a, uFill);
          vec3 base = vec3(0.55, 0.86, 0.95);
          float glow = uReady * (0.75 + 0.25 * sin(uTime * 3.0));
          float alpha = mix(0.18, 0.85, on) * (0.6 + 0.4 * glow);
          gl_FragColor = vec4(mix(base, vec3(1.0), uDash) * (1.0 + glow * 0.6), alpha * (1.0 - uDash * 0.5));
        }`,
    }));
    this.ring.position.y = 0.02; this.ring.renderOrder = 3;
    this.group.add(this.ring);

    // ---- the dreamer ----
    this.dreamer = buildDreamer();
    this.dreamer.root.scale.setScalar(1.3);
    this.group.add(this.dreamer.root);
    this.playerLight = new THREE.PointLight(0xffc89a, 0, 9, 1.6);
    this.playerLight.position.set(0, 1.2, 0);
    this.dreamer.root.add(this.playerLight);
    for (let i = 0; i < 6; i++) {
      const obj = this.dreamer.body.clone(true);
      const mats: THREE.MeshBasicMaterial[] = [];
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const m = new THREE.MeshBasicMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
          mesh.material = m; mesh.castShadow = false; mats.push(m);
        }
        if ((o as THREE.Light).isLight) o.visible = false;
      });
      obj.visible = false;
      this.group.add(obj);
      this.ghosts.push({ obj, life: 0, mats });
    }

    // ---- dust motes drifting in the light (ambient life) ----
    const MOTES = 260;
    const mg = new THREE.BufferGeometry();
    const mp = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i++) { mp[i * 3] = (Math.random() - 0.5) * 30; mp[i * 3 + 1] = Math.random() * 3; mp[i * 3 + 2] = (Math.random() - 0.5) * 22; }
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ map: disc, size: 0.09, color: 0xfff6e8, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
  }

  // ------------------------------------------------------------ particles

  burst(kind: number, x: number, y: number, hue: number) {
    const n = kind === 1 ? 14 : 10;
    for (let k = 0; k < n; k++) {
      if (this.pn >= MAX_PARTICLES) return;
      const i = this.pn++;
      const a = Math.random() * Math.PI * 2, s = 1.2 + Math.random() * 2.4;
      const h0 = kind === 1 ? 1.15 : 0.7;
      this.ppos[i * 3] = x; this.ppos[i * 3 + 1] = h0 + Math.random() * 0.3; this.ppos[i * 3 + 2] = y;
      this.pvel[i * 3] = Math.cos(a) * s; this.pvel[i * 3 + 1] = 1.5 + Math.random() * 2.5; this.pvel[i * 3 + 2] = Math.sin(a) * s;
      for (let j = 0; j < 3; j++) { this.prot[i * 3 + j] = Math.random() * 6.28; this.pspin[i * 3 + j] = (Math.random() - 0.5) * 14; }
      this.pmax[i] = this.plife[i] = 0.9 + Math.random() * 0.8;
      this.psize[i] = kind === 2 ? 1.5 : 1.0 + Math.random() * 0.4;
      if (kind === 0) _c.setHSL(0.72 + Math.random() * 0.1, 0.35, 0.86 + Math.random() * 0.08, THREE.SRGBColorSpace);           // lavender petals
      else if (kind === 1) _c.setHSL((hue + Math.random() * 0.3) % 1, 0.7, 0.75, THREE.SRGBColorSpace);                          // confetti
      else _c.setRGB(0.99, 0.98, 0.95, THREE.SRGBColorSpace);                                                                 // paper scraps
      this.pcol[i * 3] = _c.r; this.pcol[i * 3 + 1] = _c.g; this.pcol[i * 3 + 2] = _c.b;
    }
  }

  sparkle(x: number, y: number, count: number, color: number, height = 0.4, speed = 2.5) {
    _c.set(color);
    for (let k = 0; k < count; k++) {
      if (this.pn >= MAX_PARTICLES) return;
      const i = this.pn++;
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random());
      this.ppos[i * 3] = x; this.ppos[i * 3 + 1] = height; this.ppos[i * 3 + 2] = y;
      this.pvel[i * 3] = Math.cos(a) * s; this.pvel[i * 3 + 1] = 2 + Math.random() * 3; this.pvel[i * 3 + 2] = Math.sin(a) * s;
      for (let j = 0; j < 3; j++) { this.prot[i * 3 + j] = Math.random() * 6.28; this.pspin[i * 3 + j] = (Math.random() - 0.5) * 10; }
      this.pmax[i] = this.plife[i] = 0.8 + Math.random() * 0.9;
      this.psize[i] = 0.8;
      this.pcol[i * 3] = _c.r; this.pcol[i * 3 + 1] = _c.g; this.pcol[i * 3 + 2] = _c.b;
    }
  }

  spawnGhost() {
    const g = this.ghosts.find((g) => g.life <= 0);
    if (!g) return;
    g.life = 1;
    g.obj.position.copy(this.dreamer.root.position);
    g.obj.quaternion.copy(this.dreamer.body.quaternion);
    g.obj.visible = true;
  }

  // ------------------------------------------------------------ per frame

  update(dt: number, time: number, p: Player, e: Enemies, a: Arsenal, pk: Pickups) {
    // --- dreamer ---
    const root = this.dreamer.root, body = this.dreamer.body;
    const speed = Math.hypot(p.vx, p.vy);
    root.position.set(p.x, 0, p.y);
    const targetYaw = Math.atan2(p.faceX, p.faceY);
    let dy = targetYaw - body.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    body.rotation.y += dy * (1 - Math.exp(-14 * dt));
    const bob = Math.sin(time * 2.2) * 0.04;
    body.position.y = 0.08 + bob + (p.dashing ? 0.12 : 0);
    body.rotation.x = Math.min(0.25, speed * 0.035) * (p.dashing ? 1.6 : 1);
    this.dreamer.cap.rotation.x = -Math.min(0.5, speed * 0.06) + Math.sin(time * 2.2 + 0.6) * 0.06;
    const flick = p.iframes > 0 && !p.dashing ? (Math.sin(time * 50) > 0 ? 1 : 0.35) : 1;
    body.visible = flick > 0.5 || p.iframes <= 0;

    if (p.dashing) {
      p.ghostTrail += dt;
      if (p.ghostTrail > 0.045) { p.ghostTrail = 0; this.spawnGhost(); }
    }
    for (const g of this.ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt * 3.2;
      const o = Math.max(0, g.life);
      for (const m of g.mats) m.opacity = o * 0.45;
      g.obj.scale.setScalar(1.3 * (1 + (1 - o) * 0.15));
      if (g.life <= 0) g.obj.visible = false;
    }

    // --- aura & light ---
    const auraR = a.auraRadius(p);
    this.auraU.uTime.value = time;
    this.auraU.uPulse.value = a.auraPulse;
    this.auraU.uOn.value += ((auraR > 0 ? 1 : 0) - this.auraU.uOn.value) * (1 - Math.exp(-4 * dt));
    this.aura.visible = this.auraU.uOn.value > 0.01;
    this.aura.position.set(p.x, 0.03, p.y);
    this.aura.scale.setScalar(Math.max(0.01, auraR));
    this.playerLight.intensity = 1.2 + this.auraU.uOn.value * 2.2 + a.auraPulse * 1.5;

    this.ring.position.x = p.x; this.ring.position.z = p.y;
    this.ringU.uFill.value = p.dashFrac;
    this.ringU.uReady.value += ((p.dashReady ? 1 : 0) - this.ringU.uReady.value) * (1 - Math.exp(-6 * dt));
    this.ringU.uDash.value += ((p.dashing ? 1 : 0) - this.ringU.uDash.value) * (1 - Math.exp(-20 * dt));
    this.ringU.uTime.value = time;

    // --- enemies ---
    const counts = [0, 0, 0];
    let sc = 0;
    for (let i = 0; i < e.n; i++) {
      const k = e.kind[i];
      const mesh = this.enemyMeshes[k];
      const idx = counts[k]++;
      const s = e.seed[i];
      const d = ENEMIES[KINDS[k]];
      const vx = e.vx[i], vy = e.vy[i];
      const sp = Math.hypot(vx, vy);
      if (k === 0) { // faceless: rocking walk, facing where they go
        const walk = time * 7 + s;
        _p.set(e.x[i], Math.abs(Math.sin(walk)) * 0.05, e.y[i]);
        _e.set(0, Math.atan2(vx, vy), Math.sin(walk) * 0.09 * Math.min(1, sp));
        _s.set(1, 1 + Math.sin(walk * 2) * 0.03, 1);
      } else if (k === 1) { // balloon: bobbing, swaying, slowly turning
        _p.set(e.x[i], Math.sin(time * 1.6 + s) * 0.12, e.y[i]);
        _e.set(Math.sin(time * 1.1 + s) * 0.12 + vy * 0.05, Math.sin(time * 0.4 + s) * 0.6, Math.cos(time * 1.3 + s) * 0.12 - vx * 0.05);
        _s.set(1, 1, 1);
      } else { // paper: faces the lens, flutters
        _p.set(e.x[i], 0.04 + Math.abs(Math.sin(time * 9 + s)) * 0.06, e.y[i]);
        _e.set(-0.15, Math.sin(time * 5 + s) * 0.35, Math.sin(time * 11 + s) * 0.08);
        _s.set(1, 1, 1);
      }
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(idx, _m);
      if (k === 2) this.paperOutline.setMatrixAt(idx, _m);
      const f = e.flash[i];
      if (k === 1) _c.setHSL(e.hue[i], 0.68, 0.8, THREE.SRGBColorSpace);
      else if (k === 0) _c.setHSL(0.7 + e.hue[i] * 0.08, 0.15, 0.92, THREE.SRGBColorSpace);
      else _c.setRGB(0.9, 0.9, 0.95);
      _c.multiplyScalar(1 + f * 2.2);
      mesh.setColorAt(idx, _c);

      _m.makeScale(d.radius * 2.8, 1, d.radius * 2.8);
      _m.setPosition(e.x[i], 0.015, e.y[i]);
      this.shadows.setMatrixAt(sc++, _m);
    }
    this.enemyMeshes.forEach((m, k) => { m.count = counts[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    this.paperOutline.count = counts[2]; this.paperOutline.instanceMatrix.needsUpdate = true;
    _m.makeScale(1.0, 1, 1.0); _m.setPosition(p.x, 0.016, p.y);
    this.shadows.setMatrixAt(sc++, _m);

    // --- planes ---
    for (let k = 0; k < a.pn; k++) {
      const yaw = Math.atan2(a.pvx[k], a.pvy[k]);
      _e.set(0, yaw, Math.sin(time * 12 + k) * 0.3);
      _q.setFromEuler(_e);
      _p.set(a.px[k], 0.85 + Math.sin(time * 6 + k) * 0.05, a.py[k]);
      _s.set(1.15, 1.15, 1.15);
      _m.compose(_p, _q, _s);
      this.planes.setMatrixAt(k, _m);
    }
    this.planes.count = a.pn; this.planes.instanceMatrix.needsUpdate = true;

    // --- notes ---
    const nc = a.noteCount;
    const vis = a.boxOn;
    for (let k = 0; k < nc; k++) {
      const ang = a.boxAngle + (k / nc) * Math.PI * 2;
      _p.set(p.x + Math.cos(ang) * a.noteRadius, 0.75 + Math.sin(time * 3 + k) * 0.12, p.y + Math.sin(ang) * a.noteRadius);
      _q.setFromAxisAngle(UP, -ang + Math.PI / 2);
      _s.setScalar(Math.max(0.001, vis) * 1.3);
      _m.compose(_p, _q, _s);
      this.notes.setMatrixAt(k, _m);
      _c.setHSL((k / nc + time * 0.05) % 1, 0.6, 0.78, THREE.SRGBColorSpace).multiplyScalar(1.5);
      this.notes.setColorAt(k, _c);
      if (vis > 0.5 && Math.random() < dt * 14) this.sparkle(_p.x, _p.z, 1, 0xfff0c0, 0.75, 0.4);
    }
    this.notes.count = vis > 0.01 ? nc : 0;
    this.notes.instanceMatrix.needsUpdate = true;
    if (this.notes.instanceColor) this.notes.instanceColor.needsUpdate = true;

    // --- pickups ---
    let sn = 0, mn = 0;
    for (let i = 0; i < pk.n; i++) {
      const kd = pk.kind[i];
      const hover = 0.32 + Math.sin(time * 3 + pk.seed[i]) * 0.06;
      if (kd === PickKind.Milk) {
        if (mn >= 64) continue;
        _q.setFromAxisAngle(UP, time + pk.seed[i]);
        _p.set(pk.x[i], 0.05 + Math.sin(time * 2 + pk.seed[i]) * 0.04, pk.y[i]); _s.setScalar(1);
        _m.compose(_p, _q, _s); this.milk.setMatrixAt(mn++, _m);
        continue;
      }
      const big = kd === PickKind.BigStar;
      _e.set(0.35, time * 2.2 + pk.seed[i], 0); _q.setFromEuler(_e);
      _p.set(pk.x[i], hover, pk.y[i]); _s.setScalar(big ? 1.9 : 1);
      _m.compose(_p, _q, _s);
      this.stars.setMatrixAt(sn, _m);
      if (big) _c.setRGB(1.0, 0.75, 0.85); else _c.setRGB(1, 1, 1);
      this.stars.setColorAt(sn, _c);
      sn++;
    }
    this.stars.count = sn; this.stars.instanceMatrix.needsUpdate = true; if (this.stars.instanceColor) this.stars.instanceColor.needsUpdate = true;
    this.milk.count = mn; this.milk.instanceMatrix.needsUpdate = true;

    const cn = Math.min(32, pk.chests.length);
    for (let i = 0; i < cn; i++) {
      const c = pk.chests[i];
      _q.setFromAxisAngle(UP, Math.sin(time * 0.8 + i) * 0.3 + 0.4);
      _p.set(c.x, 0.06 + Math.sin(time * 1.7 + i) * 0.05, c.y); _s.setScalar(1);
      _m.compose(_p, _q, _s);
      this.chests.setMatrixAt(i, _m);
      _m.makeTranslation(c.x, 0, c.y);
      this.beams.setMatrixAt(i, _m);
      _m.makeScale(1.6, 1, 1.6); _m.setPosition(c.x, 0.015, c.y);
      if (sc < MAX_ENEMIES + 64) this.shadows.setMatrixAt(sc++, _m);
    }
    this.chests.count = cn; this.beams.count = cn;
    this.chests.instanceMatrix.needsUpdate = true; this.beams.instanceMatrix.needsUpdate = true;
    this.beamU.uTime.value = time;
    this.shadows.count = sc; this.shadows.instanceMatrix.needsUpdate = true;

    // --- particles ---
    for (let i = 0; i < this.pn; i++) {
      this.plife[i] -= dt;
      if (this.plife[i] <= 0) { this.removeParticle(i--); continue; }
      const b = i * 3;
      const drag = Math.exp(-2.2 * dt);
      this.pvel[b] *= drag; this.pvel[b + 2] *= drag;
      this.pvel[b + 1] = this.pvel[b + 1] * drag - 5.5 * dt;
      // fluttering fall: petals glide sideways as they sink
      this.pvel[b] += Math.sin(time * 4 + i) * dt * 1.2;
      this.ppos[b] += this.pvel[b] * dt; this.ppos[b + 1] += this.pvel[b + 1] * dt; this.ppos[b + 2] += this.pvel[b + 2] * dt;
      if (this.ppos[b + 1] < 0.02) { this.ppos[b + 1] = 0.02; this.pvel[b + 1] = 0; this.pvel[b] *= 0.5; this.pvel[b + 2] *= 0.5; this.pspin[b] *= 0.3; this.pspin[b + 2] *= 0.3; }
      for (let j = 0; j < 3; j++) this.prot[b + j] += this.pspin[b + j] * dt;
    }
    for (let i = 0; i < this.pn; i++) {
      const b = i * 3;
      const t = this.plife[i] / this.pmax[i];
      _e.set(this.prot[b], this.prot[b + 1], this.prot[b + 2]); _q.setFromEuler(_e);
      _p.set(this.ppos[b], this.ppos[b + 1], this.ppos[b + 2]);
      _s.setScalar(this.psize[i] * Math.min(1, t * 3));
      _m.compose(_p, _q, _s);
      this.petals.setMatrixAt(i, _m);
      _c.setRGB(this.pcol[b], this.pcol[b + 1], this.pcol[b + 2]);
      this.petals.setColorAt(i, _c);
    }
    this.petals.count = this.pn; this.petals.instanceMatrix.needsUpdate = true; if (this.petals.instanceColor) this.petals.instanceColor.needsUpdate = true;

    // --- motes drift around the dreamer, wrapping in a box that follows them ---
    const mp = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    const arr = mp.array as Float32Array;
    for (let i = 0; i < mp.count; i++) {
      const b = i * 3;
      arr[b] += Math.sin(time * 0.3 + i) * dt * 0.15;
      arr[b + 1] += Math.sin(time * 0.5 + i * 1.7) * dt * 0.08 + dt * 0.03;
      arr[b + 2] += Math.cos(time * 0.27 + i) * dt * 0.15;
      if (arr[b] - p.x > 15) arr[b] -= 30; if (arr[b] - p.x < -15) arr[b] += 30;
      if (arr[b + 2] - p.y > 11) arr[b + 2] -= 22; if (arr[b + 2] - p.y < -11) arr[b + 2] += 22;
      if (arr[b + 1] > 3.2) arr[b + 1] = 0.1;
    }
    mp.needsUpdate = true;
  }

  private removeParticle(i: number) {
    const l = --this.pn;
    if (i === l) return;
    for (let j = 0; j < 3; j++) {
      this.ppos[i * 3 + j] = this.ppos[l * 3 + j]; this.pvel[i * 3 + j] = this.pvel[l * 3 + j];
      this.prot[i * 3 + j] = this.prot[l * 3 + j]; this.pspin[i * 3 + j] = this.pspin[l * 3 + j];
      this.pcol[i * 3 + j] = this.pcol[l * 3 + j];
    }
    this.plife[i] = this.plife[l]; this.pmax[i] = this.pmax[l]; this.psize[i] = this.psize[l];
  }
}
