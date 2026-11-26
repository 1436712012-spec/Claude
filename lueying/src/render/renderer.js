// Render 总装：场景、座舱相机、画质档位、事件驱动的破坏表现、后期。
import * as THREE from 'three';
import { QUALITY, SHIP, MAP } from '../sim/config.js';
import { clamp, damp } from '../sim/noise.js';
import { makeTextures } from './textures.js';
import { FX } from './shaderfx.js';
import { makeSky, makeTerrain, makeWater, makeLights, updateAtmosphere } from './environment.js';
import { Forest } from './forest.js';
import { buildCompound } from './compound.js';
import { Actors } from './actors.js';
import { Effects } from './fx.js';
import { makeComposer } from './post.js';

export const EYE = 0.95;

export class GameRenderer {
  constructor(canvas, world, qualityName = 'high') {
    this.canvas = canvas;
    this.w = world;
    this.qualityName = qualityName;
    this.q = { ...QUALITY[qualityName] };
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = !!this.q.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.08, 3200);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.textures = makeTextures(world.terrain);
    FX.uCanopy.value = this.textures.canopy;
    this.sky = makeSky(this.textures);
    this.scene.add(this.sky);
    this.terrainMesh = makeTerrain(world.terrain, this.textures, this.q);
    this.scene.add(this.terrainMesh);
    this.water = makeWater(this.textures);
    this.scene.add(this.water);
    this.lights = makeLights(this.scene, this.q);
    this.forest = new Forest(this.scene, world.terrain, this.textures, this.q);
    this.compound = buildCompound(this.scene, world.terrain, this.textures, this.q);
    this.compound.buildPanes(world.combat.destructibles);
    this.compound.buildFences(world.terrain.fences);
    this.actors = new Actors(this.scene, world, this.textures);
    this.fx = new Effects(this.scene, world, this.textures, this.q);
    this.fx.setFlashLight(this.lights.flash);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envNight = -1;
    this._env();
    this.post = makeComposer(r, this.scene, this.camera, this.q);
    this.shake = { x: 0, y: 0, t: 0, kick: 0 };
    this.fov = SHIP.fovBase;
    this.damageFlash = 0;
    this.flashBoost = 0;
    this.falling = [];
    this.freeCam = null;
    this.camPos = new THREE.Vector3();
    this.resize();
    this.forest.update(new THREE.Vector3(world.player.pos.x, 0, world.player.pos.z), true);
  }

  _env() {
    const night = Math.round((1 - this.w.env.light) * 10) / 10;
    if (night === this.envNight) return;
    this.envNight = night;
    FX.uNight.value = night;
    const s = new THREE.Scene();
    const sky = new THREE.Mesh(this.sky.geometry, this.sky.material);
    s.add(sky);
    s.add(new THREE.Mesh(new THREE.CircleGeometry(2000, 16).rotateX(-Math.PI / 2).translate(0, -40, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.035, 0.03).multiplyScalar(1 - night * 0.7) })));
    const rt = this.pmrem.fromScene(s, 0.04, 0.1, 3000);
    if (this.scene.environment) this.scene.environment.dispose();
    this.scene.environment = rt.texture;
  }

  setQuality(name) {
    this.qualityName = name;
    const shadows = this.q.shadows;
    Object.assign(this.q, QUALITY[name]);
    this.q.shadows = shadows; // 阴影在构建时决定
    this.forest.update(this.camPos, true);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.post.composer.setPixelRatio(pr);
    this.post.composer.setSize(w, h);
    this.post.bloom.resolution.set(w * this.q.bloomScale, h * this.q.bloomScale);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.grade.uniforms.uAspect.value = w / h;
  }

  // 水平视场角 → 垂直视场角
  _vfov(hfov) {
    const a = this.camera.aspect;
    const v = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfov) / 2) / a);
    return Math.min(THREE.MathUtils.radToDeg(v), 74);
  }

  onEvents(events) {
    const C = this.compound;
    for (const e of events) {
      this.fx.onEvent(e, this.camPos);
      switch (e.type) {
        case 'destroyed': this._destroyVisual(e); break;
        case 'ship:damage': if (e.ship === 'player') { this.damageFlash = Math.min(1, this.damageFlash + e.amount * 0.08); this.shake.kick = Math.max(this.shake.kick, 0.25); } break;
        case 'ship:scrape': if (e.ship === 'player') this.shake.kick = Math.max(this.shake.kick, Math.min(1, e.strength / 6)); break;
        case 'pulse': FX.uPulse.value.set(e.x, e.y, e.z, this.w.time); this.flashBoost = 0.6; this.shake.kick = 0.5; break;
        case 'fire': if (e.weapon === 'hammer') this.shake.kick = 1; if (e.weapon === 'storm') this.shake.kick = 0.6; break;
        case 'lightning': this.flashBoost = Math.max(this.flashBoost, 0.5); this.shake.kick = Math.max(this.shake.kick, 0.35); break;
        case 'explosion': {
          const d = Math.hypot(e.x - this.camPos.x, e.z - this.camPos.z);
          this.shake.kick = Math.max(this.shake.kick, clamp(1.2 - d / 60, 0, 1) * (e.size || 1));
          break;
        }
        case 'hit': if (e.src === 'player') this.shake.kick = Math.max(this.shake.kick, clamp(e.amount / 200, 0.08, 0.5)); break;
        case 'coreTaken': C.core.visible = false; C.coreRing.visible = false; break;
        case 'powerOut': C.materials.labInside.emissiveIntensity = 0.05; C.materials.barrackWin.emissiveIntensity = 0.05; C.materials.workLight.emissiveIntensity = 0.1; C.materials.lampHead.emissiveIntensity = 0.1; break;
      }
    }
  }

  _destroyVisual(e) {
    const C = this.compound;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    if (C.paneIndex.has(e.id)) { const { mesh, i } = C.paneIndex.get(e.id); mesh.setMatrixAt(i, zero); mesh.instanceMatrix.needsUpdate = true; return; }
    if (C.fenceIndex.has(e.id)) { const i = C.fenceIndex.get(e.id); C.fenceNet.setMatrixAt(i, zero); C.fenceWire.setMatrixAt(i, zero); C.fenceNet.instanceMatrix.needsUpdate = true; C.fenceWire.instanceMatrix.needsUpdate = true; return; }
    if (C.containers.has(e.id)) { C.containers.get(e.id).visible = false; return; }
    if (C.lampIndex.has(e.id)) { C.lamps.setMatrixAt(C.lampIndex.get(e.id), zero); C.lamps.instanceMatrix.needsUpdate = true; return; }
    if (C.towers.has(e.id)) { this.falling.push({ obj: C.towers.get(e.id), t: 0, axis: new THREE.Vector3(1, 0, 0.3).normalize(), dir: 1 }); return; }
    if (e.id === 'commTower') { this.falling.push({ obj: C.commTower, t: 0, axis: new THREE.Vector3(0.4, 0, 1).normalize(), dir: -1 }); return; }
    if (e.id === 'terminal') { this.falling.push({ obj: C.terminal, t: 0, axis: new THREE.Vector3(1, 0, 0), dir: 1, drop: 1.5 }); return; }
    if (e.id === 'radarPower') { C.powerBox.scale.set(1, 0.35, 1); return; }
  }

  render(dt, alpha, view) {
    const w = this.w;
    const t = view.visualTime ?? w.time;
    FX.uTime.value = t;
    FX.uWind.value.set(w.env.wind.x, w.env.wind.z);
    // 飞碟场光
    const ships = w.allShips();
    for (let i = 0; i < 4; i++) {
      const s = ships[i];
      const v = FX.uShips.value[i];
      if (!s || s.destroyed) { v.set(0, -999, 0, 0); continue; }
      const x = s.prev.x + (s.pos.x - s.prev.x) * alpha, y = s.prev.y + (s.pos.y - s.prev.y) * alpha, z = s.prev.z + (s.pos.z - s.prev.z) * alpha;
      const on = s.silent ? 0 : s.power;
      v.set(x, y - 0.5, z, on * 0.75);
    }
    // 闪烁（回收时的电磁干扰）
    if (w.flicker) FX.uFlicker.value.set(w.flicker.x, 0, w.flicker.z, 1); else FX.uFlicker.value.w = 0;
    // ---------- 相机 ----------
    const P = w.player;
    const cam = this.camera;
    const px = P.prev.x + (P.pos.x - P.prev.x) * alpha, py = P.prev.y + (P.pos.y - P.prev.y) * alpha, pz = P.prev.z + (P.pos.z - P.prev.z) * alpha;
    if (view.freeCam) {
      if (!this.freeCam) this.freeCam = { x: px, y: py + 60, z: pz + 60, yaw: view.yaw, pitch: -0.6 };
      const F = this.freeCam;
      F.yaw = view.freeYaw ?? F.yaw; F.pitch = view.freePitch ?? F.pitch;
      const sp = 90 * dt;
      const fx = -Math.sin(F.yaw), fz = -Math.cos(F.yaw);
      F.x += (fx * view.fz + Math.cos(F.yaw) * view.fx) * sp;
      F.z += (fz * view.fz - Math.sin(F.yaw) * view.fx) * sp;
      F.y += view.fy * sp;
      cam.position.set(F.x, F.y, F.z);
      cam.rotation.set(F.pitch, F.yaw, 0);
      cam.fov = 60;
    } else {
      this.freeCam = null;
      const vib = P.vibration();
      this.shake.t += dt;
      this.shake.kick *= Math.exp(-dt * 6);
      const mm = (SHIP.shakeMinMm + (SHIP.shakeMaxMm - SHIP.shakeMinMm) * vib) / 1000;
      const n1 = Math.sin(this.shake.t * 61.3) * Math.sin(this.shake.t * 23.1 + 1.3);
      const n2 = Math.sin(this.shake.t * 47.7 + 2.1) * Math.sin(this.shake.t * 31.9);
      const kick = this.shake.kick;
      const f = { x: -Math.sin(view.yaw), z: -Math.cos(view.yaw) };
      const rgt = { x: Math.cos(view.yaw), z: -Math.sin(view.yaw) };
      const tiltF = P.tilt.x * f.x + P.tilt.z * f.z;
      const tiltR = P.tilt.x * rgt.x + P.tilt.z * rgt.z;
      cam.position.set(px + n1 * mm * 4, py + EYE - P.landing * 0.1 + n2 * mm * 4, pz);
      const ang = (0.0006 + vib * 0.0035) + kick * 0.02;
      cam.rotation.set(view.pitch - tiltF * 0.45 + n2 * ang, view.yaw + n1 * ang * 0.6, -tiltR * 0.5 + n1 * ang * 0.8 + Math.sin(this.shake.t * 90) * kick * 0.01);
      const sp = clamp(P.speed / SHIP.boostSpeed, 0, 1);
      const targetH = view.zoom ? 24 : SHIP.fovBase + (SHIP.fovFast - SHIP.fovBase) * sp;
      this.fov = damp(this.fov, targetH, view.zoom ? 10 : 3, dt);
      cam.fov = this._vfov(this.fov);
    }
    cam.updateProjectionMatrix();
    this.camPos.copy(cam.position);
    this.actors.player.visible = !view.freeCam ? true : true;
    // ---------- 世界 ----------
    this.forest.update(cam.position);
    this.terrainMesh.userData.update(cam);
    this.sky.position.copy(cam.position);
    updateAtmosphere(w.env, this.scene, this.lights, this.sky, cam.position, this.flashBoost);
    this.flashBoost *= Math.exp(-dt * 8);
    this._env();
    this._spots();
    this.actors.sync(dt, alpha, cam.position);
    this.fx.update(dt, cam.position, this.scene.fog);
    this._compoundDynamics(dt);
    // ---------- 后期 ----------
    const G = this.post.grade.uniforms;
    G.uTime.value = t;
    G.uSpeed.value = view.freeCam ? 0 : clamp((P.speed - 30) / 32, 0, 1) * (P.hAbove < 1.2 ? 1 : 0.6);
    this.damageFlash *= Math.exp(-dt * 3);
    G.uDamage.value = this.damageFlash + (P.hull < 30 ? (0.25 + 0.15 * Math.sin(t * 6)) * (1 - P.hull / 30) : 0);
    G.uFlash.value = w.env.flash * 0.05 + this.flashBoost * 0.08;
    G.uSilence.value = damp(G.uSilence.value, P.silent ? 1 : 0, 4, dt);
    G.uSlowmo.value = damp(G.uSlowmo.value, w.timeScale < 0.9 ? 1 : 0, 10, dt);
    G.uAlarm.value = w.camp.state === 'alarm' ? 1 : 0;
    G.uZoom.value = damp(G.uZoom.value, view.zoom ? 1 : 0, 10, dt);
    this.post.composer.render(dt);
  }

  _spots() {
    const L = this.lights.spots;
    const spots = this.w.spotlights().map((s) => ({ s, d: Math.hypot(s.x - this.camPos.x, s.z - this.camPos.z) })).filter((x) => x.d < 320).sort((a, b) => a.d - b.d);
    const night = 1 - this.w.env.light;
    for (let i = 0; i < L.length; i++) {
      const sl = L[i], it = spots[i];
      if (!it) { sl.intensity = 0; continue; }
      const s = it.s;
      sl.position.set(s.x, s.y, s.z);
      sl.target.position.set(s.x + s.dir.x * 60, s.y + s.dir.y * 60, s.z + s.dir.z * 60);
      sl.angle = THREE.MathUtils.degToRad(s.cone * 1.25);
      sl.distance = s.range * 1.2;
      sl.intensity = 2600 + night * 3000;
    }
  }

  _compoundDynamics(dt) {
    const w = this.w, C = this.compound, t = w.time;
    if (w.radar.alive && !(w.radar.offline > 0) && !(w.radar.disabled > 0) && w.power.on) C.radar.rotation.y = w.radar.angle;
    C.beacon.visible = Math.sin(t * 3) > 0.2 && w.power.on;
    if (C.core.visible) {
      const k = 3 + Math.sin(t * 2.4) * 1.2 + (w.mission.core.holding ? 6 * w.mission.core.progress : 0);
      C.coreMat.emissiveIntensity = k;
      C.coreRing.rotation.z = t * 0.8;
      if (w.mission.core.holding) {
        const P = w.player;
        C.core.position.y = MAP.plateauH + 1.25 + w.mission.core.progress * 1.2;
        C.core.position.x += (P.pos.x - C.core.position.x) * dt * w.mission.core.progress * 2;
        C.core.position.z += (P.pos.z - C.core.position.z) * dt * w.mission.core.progress * 2;
      }
    }
    // 上传中：终端红灯
    const up = w.exposure.sat.active;
    C.terminalLed.emissiveIntensity = up ? (Math.sin(t * 10) > 0 ? 8 : 1) : w.terminal.alive && w.power.on ? 0.6 : 0;
    for (const T of w.towers) {
      const g = C.towers.get(T.tower.id);
      if (g) g.userData.lamp.material.emissiveIntensity = T.spot.on && w.power.on ? 5 : 0.05;
    }
    // 倒塌动画
    for (const f of this.falling) {
      if (f.done) continue;
      f.t += dt;
      const k = Math.min(1, (f.t / 1.6) ** 2);
      f.obj.quaternion.setFromAxisAngle(f.axis, f.dir * k * (Math.PI / 2 - 0.15));
      if (f.drop) f.obj.position.y -= dt * f.drop * 4 * (k < 1 ? 1 : 0);
      if (f.t > 1.6) f.done = true;
    }
  }
}
