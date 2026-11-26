// 角色与设备：飞碟（玩家船缘 + 三架僚机 + 全息幻影）、守卫、路人、无人机、摄像头、电磁站、装甲车、直升机、穿越机、探照灯光柱、城市车流。
import * as THREE from 'three';
import { MAP } from '../sim/config.js';
import { CITY, CAMERAS } from '../sim/level.js';
import { patchMaterial, FX } from './shaderfx.js';
import { mulberry32 } from '../sim/noise.js';

const G = MAP.plateauH;
const tmpV = new THREE.Vector3();

// ---------- 飞碟 ----------
export function saucerGeometry(seg = 64) {
  const pts = [
    [0, 1.12], [0.5, 1.08], [0.92, 0.9], [1.15, 0.62], [1.3, 0.34], [1.9, 0.2], [2.8, 0.09], [3.42, 0.015], [3.5, 0],
    [3.4, -0.03], [2.7, -0.13], [1.8, -0.24], [1.0, -0.32], [0.4, -0.35], [0, -0.355],
  ].map(([x, y]) => new THREE.Vector2(x, y)).reverse(); // 自下而上：法线朝外
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  return g;
}

function hullMaterial(textures) {
  const m = new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.3, metalness: 0.12, envMapIntensity: 1.25 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = FX.uTime;
    shader.vertexShader = 'varying vec3 vObj;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    shader.fragmentShader = 'varying vec3 vObj;\nuniform float uTime;\n' + shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      // 极细的流线纹理：沿径向的发丝线
      float rr = length(vObj.xz);
      float ang = atan(vObj.z, vObj.x + 1e-4);
      float lines = smoothstep(0.92, 1.0, sin(ang * 180.0 + rr * 2.0) * 0.5 + 0.5) * smoothstep(1.3, 2.0, rr);
      diffuseColor.rgb *= 1.0 - lines * 0.06;
      roughnessFactor += lines * 0.15;
    `).replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      // 船底场发生面：很淡的青白光
      float under = (1.0 - smoothstep(-0.33, -0.2, vObj.y)) * (1.0 - smoothstep(1.0, 3.0, length(vObj.xz)));
      totalEmissiveRadiance += vec3(0.56, 0.89, 0.91) * under * (0.55 + 0.15 * sin(uTime * 3.0 + length(vObj.xz) * 4.0));
    `);
  };
  return m;
}

function hologramMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: FX.uTime, uFade: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){ vN = normalize(normalMatrix * normal); vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV; uniform float uTime; uniform float uFade;
      void main(){
        float fres = pow(1.0 - abs(dot(vN, vV)), 2.0);
        float scan = 0.55 + 0.45 * sin(vP.y * 60.0 - uTime * 14.0);
        float flick = 0.75 + 0.25 * sin(uTime * 37.0) * sin(uTime * 13.0);
        vec3 c = vec3(0.56, 0.89, 0.91) * (0.25 + fres * 1.6) * scan * flick;
        gl_FragColor = vec4(c * uFade, (0.2 + fres) * uFade);
      }`,
  });
}

function fieldShellMaterial() {
  // 暴雨中雨滴被场弹开，在飞碟上方勾出的水雾外壳
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: FX.uTime, uRain: FX.uRain, uLit: { value: 0 }, uOn: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vN = normalize(normalMatrix * normal); vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float uTime, uRain, uLit, uOn;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        float fres = pow(1.0 - abs(dot(vN, vV)), 3.0);
        vec2 q = vec2(atan(vP.z, vP.x) * 18.0, vP.y * 8.0 + uTime * 9.0);
        float streak = step(0.86, h(floor(q))) * fract(q.y);
        float a = (fres * 0.35 + streak * 0.5) * uRain * uOn * (0.35 + uLit * 1.4);
        gl_FragColor = vec4(vec3(0.78, 0.84, 0.88) * (0.6 + uLit), a);
      }`,
  });
}

// ---------- 人形 ----------
function makeHuman(mats, opts = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const leg = new THREE.BoxGeometry(0.17, 0.85, 0.2).translate(0, -0.42, 0);
  const arm = new THREE.BoxGeometry(0.13, 0.62, 0.14).translate(0, -0.3, 0);
  const legL = new THREE.Mesh(leg, mats.pants), legR = new THREE.Mesh(leg, mats.pants);
  legL.position.set(-0.11, 0.9, 0); legR.position.set(0.11, 0.9, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.28).translate(0, 1.21, 0), opts.civ ? mats.civTop[opts.variant % mats.civTop.length] : mats.vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8).translate(0, 1.66, 0), mats.skin[opts.variant % mats.skin.length]);
  const armL = new THREE.Mesh(arm, opts.civ ? torso.material : mats.vest), armR = new THREE.Mesh(arm, opts.civ ? torso.material : mats.vest);
  armL.position.set(-0.29, 1.5, 0); armR.position.set(0.29, 1.5, 0);
  body.add(legL, legR, torso, head, armL, armR);
  if (!opts.civ) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.7, 0), mats.helmet);
    body.add(cap);
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.8).translate(0, 0, -0.25), mats.gun);
    rifle.position.set(0.12, 1.22, -0.18); rifle.rotation.set(0.35, 0.3, 0);
    body.add(rifle);
    g.userData.rifle = rifle;
  } else if (opts.umbrella) {
    const um = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.35, 8, 1, true).translate(0, 2.15, 0), mats.umbrella[opts.variant % 2]);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9).translate(0, 1.75, 0), mats.gun);
    body.add(um, stick);
    g.userData.umbrella = um;
  }
  const phone = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.14), mats.phone);
  phone.position.set(0.12, 1.45, -0.32); phone.rotation.y = Math.PI;
  phone.visible = false;
  body.add(phone);
  const stasis = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.1, 4, 10).translate(0, 0.95, 0), mats.stasis);
  stasis.visible = false;
  g.add(stasis);
  g.userData = { ...g.userData, body, legL, legR, armL, armR, phone, stasis, head };
  return g;
}

// ---------- 无人机 ----------
function makeDrone(mats, small = false) {
  const g = new THREE.Group();
  const s = small ? 0.6 : 1.5;
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.36 * s, 0.12 * s, 0.36 * s), mats.droneBody);
  g.add(bodyM);
  const rotors = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 0.035 * s, 0.05 * s), mats.droneBody);
    arm.position.set(Math.cos(a) * 0.22 * s, 0.02 * s, Math.sin(a) * 0.22 * s);
    arm.rotation.y = -a;
    g.add(arm);
    const rotor = new THREE.Mesh(new THREE.CircleGeometry(0.17 * s, 14).rotateX(-Math.PI / 2), mats.rotor);
    rotor.position.set(Math.cos(a) * 0.42 * s, 0.07 * s, Math.sin(a) * 0.42 * s);
    g.add(rotor); rotors.push(rotor);
  }
  const ledR = new THREE.Mesh(new THREE.SphereGeometry(0.04 * s, 6, 4), mats.ledRed);
  ledR.position.set(-0.3 * s, 0, -0.3 * s);
  const ledG = new THREE.Mesh(new THREE.SphereGeometry(0.04 * s, 6, 4), mats.ledGreen);
  ledG.position.set(0.3 * s, 0, -0.3 * s);
  g.add(ledR, ledG);
  if (!small) {
    const cam = new THREE.Mesh(new THREE.SphereGeometry(0.08 * s, 10, 8), mats.gun);
    cam.position.set(0, -0.12 * s, -0.1 * s);
    g.add(cam);
  }
  const stasis = new THREE.Mesh(new THREE.SphereGeometry(0.9 * s, 12, 8), mats.stasis);
  stasis.visible = false;
  g.add(stasis);
  g.userData = { rotors, ledR, ledG, stasis };
  return g;
}

// ---------- 车辆 ----------
function makeCar(mats) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.1, 5.2).translate(0, 1.0, 0), mats.armor);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.95, 2.3).translate(0, 2.0, -0.6), mats.armor);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.05).translate(0, 2.1, -1.78), mats.carGlass);
  body.add(hull, cab, glass);
  for (const [x, z] of [[-1.15, -1.7], [1.15, -1.7], [-1.15, 1.7], [1.15, 1.7]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.38, 12).rotateZ(Math.PI / 2), mats.tire);
    w.position.set(x, 0.48, z);
    body.add(w);
  }
  const turret = new THREE.Group();
  turret.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.4, 10), mats.gun));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6).rotateX(Math.PI / 2).translate(0, 0.1, -0.9), mats.gun);
  turret.add(barrel);
  turret.position.set(0, 2.6, 0.9);
  body.add(turret);
  const bar = new THREE.Group();
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.25), mats.ledRed);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.25), mats.ledBlue);
  red.position.x = -0.35; blue.position.x = 0.35;
  bar.add(red, blue);
  bar.position.set(0, 2.55, -0.8);
  body.add(bar);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.15, 0.05).translate(0, 1.15, -2.62), mats.headlight);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.05).translate(0, 1.2, 2.62), mats.ledRed);
  body.add(head, tail);
  g.userData = { body, turret, red, blue };
  return g;
}

function makeHeli(mats) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const fus = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12).scale(1.35, 1.25, 3.2), mats.heli);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 6, 8).rotateX(Math.PI / 2).translate(0, 0.35, 5.2), mats.heli);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 1.1).translate(0, 1.1, 8.1), mats.heli);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2.4).scale(1.25, 1.0, 1.6).rotateX(-Math.PI / 2.6).translate(0, 0.25, -1.9), mats.carGlass);
  body.add(fus, boom, fin, glass);
  for (const s of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4, 6).rotateX(Math.PI / 2).translate(s * 1.2, -1.55, 0), mats.gun);
    body.add(skid);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 8).rotateX(Math.PI / 2).translate(s * 1.75, -0.5, -0.4), mats.gun);
    body.add(pod);
  }
  const rotor = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.4), mats.gun);
    blade.rotation.y = (i * Math.PI) / 2 / 2 * 2;
    blade.rotation.y = i * Math.PI / 4 * 2 / 2;
    rotor.add(blade);
  }
  rotor.children.forEach((b, i) => { b.rotation.y = (i * Math.PI) / 4; });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.6, 32).rotateX(-Math.PI / 2), mats.rotor);
  rotor.add(disc);
  rotor.position.set(0, 1.45, 0);
  body.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16).rotateY(Math.PI / 2), mats.rotor);
  tailRotor.position.set(0.25, 1.2, 8.2);
  body.add(tailRotor);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), mats.ledRed);
  navR.position.set(-1.35, 0, 0);
  const navG = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), mats.ledGreen);
  navG.position.set(1.35, 0, 0);
  body.add(navR, navG);
  g.userData = { body, rotor, tailRotor, navR, navG };
  return g;
}

// ---------- 探照灯光柱 ----------
function beamMaterial(color = 0xf4f2e8) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uRain: FX.uRain, uNight: FX.uNight, uOn: { value: 1 }, uTime: FX.uTime },
    vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vT = -position.y; vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vT; varying vec3 vN; varying vec3 vV; varying vec3 vW; uniform vec3 uColor; uniform float uRain, uNight, uOn, uTime;
      void main(){
        float edge = pow(abs(dot(vN, vV)), 1.6);
        float along = exp(-vT * 2.6) * (1.0 - smoothstep(0.8, 1.0, vT));
        float dust = 0.75 + 0.25 * sin(vW.y * 3.0 + uTime * 2.0 + vW.x);
        float a = edge * along * (0.06 + uRain * 0.16 + uNight * 0.12) * uOn * dust;
        gl_FragColor = vec4(uColor * a * 2.2, a);
      }`,
  });
}

function beamMesh(range, coneDeg, color) {
  // 单位圆锥：顶点在原点、底面在 -y=1 处；按射程整体缩放
  const r = Math.tan(THREE.MathUtils.degToRad(coneDeg));
  const g = new THREE.ConeGeometry(r, 1, 20, 1, true).translate(0, -0.5, 0);
  const m = new THREE.Mesh(g, beamMaterial(color));
  m.scale.set(range, range, range);
  m.frustumCulled = false;
  m.renderOrder = 5;
  return m;
}

// ---------- 总装 ----------
export class Actors {
  constructor(scene, world, textures) {
    this.scene = scene;
    this.w = world;
    const fx = (m, o = {}) => patchMaterial(m, { canopy: 'ground', ...o });
    const std = (c, o = {}) => fx(new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o }));
    this.mats = {
      pants: std(0x2c3029), vest: std(0x4a4f3a), helmet: std(0x2e332b), gun: std(0x1b1c1e, { metalness: 0.5, roughness: 0.5 }),
      skin: [std(0x8a6248), std(0x5a3d2c), std(0xb48a6e), std(0x3d2a20)],
      civTop: [std(0x7b2e2e), std(0x2e4a7b), std(0xc9c3b0), std(0x3a6b4a), std(0x6b5a2e)],
      umbrella: [std(0x111111, { side: THREE.DoubleSide }), std(0x6b1d1d, { side: THREE.DoubleSide })],
      phone: new THREE.MeshBasicMaterial({ color: 0xcfe6ff }),
      stasis: new THREE.MeshBasicMaterial({ color: 0x8fe3e8, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
      droneBody: std(0x2a2c2e, { metalness: 0.4, roughness: 0.5 }), rotor: new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
      ledRed: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3322, emissiveIntensity: 5 }),
      ledGreen: new THREE.MeshStandardMaterial({ color: 0x002200, emissive: 0x33ff66, emissiveIntensity: 4 }),
      ledBlue: new THREE.MeshStandardMaterial({ color: 0x000022, emissive: 0x3366ff, emissiveIntensity: 5 }),
      ledAmber: new THREE.MeshStandardMaterial({ color: 0x221100, emissive: 0xffaa33, emissiveIntensity: 4 }),
      armor: std(0x3c4234, { metalness: 0.35, roughness: 0.6 }), tire: std(0x111111), carGlass: new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.05, metalness: 0.8 }),
      headlight: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff4dd, emissiveIntensity: 6 }),
      heli: std(0x2f352e, { metalness: 0.4, roughness: 0.5 }),
      camBody: std(0xd0d2d0, { roughness: 0.4 }), emBox: std(0x5a5f55),
    };
    this.hullMat = hullMaterial(textures);
    this.saucerGeo = saucerGeometry(56);
    // 玩家船缘（第一人称看得见的上表面）
    this.player = new THREE.Mesh(saucerGeometry(96), this.hullMat.clone());
    this.player.material.onBeforeCompile = this.hullMat.onBeforeCompile;
    this.player.material.color.setHex(0x8e959b);
    this.player.material.roughness = 0.42;
    this.player.material.envMapIntensity = 0.7;
    this.player.renderOrder = 1;
    scene.add(this.player);
    // 僚机
    this.wing = world.wingmen.map((m) => {
      const mat = this.hullMat.clone();
      mat.onBeforeCompile = this.hullMat.onBeforeCompile;
      const mesh = new THREE.Mesh(this.saucerGeo, mat);
      mesh.castShadow = true;
      const shell = new THREE.Mesh(new THREE.SphereGeometry(4.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1), fieldShellMaterial());
      shell.renderOrder = 3;
      mesh.add(shell);
      scene.add(mesh);
      return { id: m.id, mesh, mat, shell };
    });
    // 幻影
    this.holoMat = hologramMaterial();
    this.phantoms = [];
    // 守卫、岗楼哨兵、路人
    this.humans = new Map();
    const r = mulberry32(5);
    for (const g of [...world.guards, ...world.towers]) { const h = makeHuman(this.mats, { variant: (r() * 4) | 0 }); scene.add(h); this.humans.set(g.id, h); }
    world.civilians.forEach((c, i) => { const h = makeHuman(this.mats, { civ: true, variant: i, umbrella: i % 2 === 0 }); scene.add(h); this.humans.set(c.id, h); });
    // 无人机
    this.drones = new Map();
    for (const d of world.drones) { const m = makeDrone(this.mats); scene.add(m); this.drones.set(d.id, m); }
    this.fpv = [];
    // 摄像头
    this.cams = new Map();
    for (const c of world.cameras) {
      const g = new THREE.Group();
      const def = CAMERAS.find((x) => x.id === c.id);
      const poleH = def.h;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, poleH, 6).translate(0, -poleH / 2, 0), this.mats.gun);
      const head = new THREE.Group();
      head.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.55).translate(0, 0, -0.15), this.mats.camBody));
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.05, 10).rotateX(Math.PI / 2).translate(0, 0, -0.44), this.mats.gun);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4).translate(0.1, 0.1, -0.42), this.mats.ledRed.clone());
      head.add(lens, led);
      g.add(pole, head);
      g.position.set(c.pos.x, c.pos.y, c.pos.z);
      scene.add(g);
      this.cams.set(c.id, { g, head, led });
    }
    // 电磁监测站
    this.ems = new Map();
    for (const s of world.emStations) {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4), this.mats.gun);
        leg.position.set(Math.cos(a) * 0.35, 0.75, Math.sin(a) * 0.35); leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
        g.add(leg);
      }
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.4).translate(0, 1.6, 0), this.mats.emBox));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.8).translate(0.2, 2.6, 0), this.mats.gun));
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 14).translate(-0.15, 2.0, 0), this.mats.camBody);
      g.add(disc);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4).translate(0.31, 1.7, 0), this.mats.ledAmber.clone());
      g.add(led);
      g.position.set(s.pos.x, s.pos.y, s.pos.z);
      scene.add(g);
      this.ems.set(s.id, { g, led });
    }
    // 车辆、直升机
    this.cars = new Map();
    this.heli = null;
    // 探照灯光柱
    this.beams = new Map();
    for (const t of world.towers) { const b = beamMesh(170, t.spot.cone, 0xf4f2e8); scene.add(b); this.beams.set(t.id, b); }
    // 路灯光晕
    this.glowMat = new THREE.SpriteMaterial({ map: textures.glow, color: 0xfff1d8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    this.lampGlows = world.lamps.map((l) => { const s = new THREE.Sprite(this.glowMat); s.position.set(l.x, l.y, l.z); s.scale.set(6, 6, 6); scene.add(s); return s; });
    this.sodiumMat = new THREE.SpriteMaterial({ map: textures.glow, color: 0xffa54d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
    for (let x = -900; x <= 900; x += 32) { const s = new THREE.Sprite(this.sodiumMat); s.position.set(x, MAP.plateauH + 7.3, CITY.roadZ - 7.8); s.scale.set(9, 9, 9); scene.add(s); }
    for (let z = -560; z >= -980; z -= 34) for (const sx of [-1, 1]) { const s = new THREE.Sprite(this.sodiumMat); s.position.set(sx * 8.2, MAP.plateauH + 7.3, z); s.scale.set(8, 8, 8); scene.add(s); }
    // 城市车流（纯表现）
    this.traffic = [];
    const carGeo = new THREE.BoxGeometry(1.8, 1.3, 4.3).translate(0, 0.9, 0);
    const trafficMat = std(0x3a3d42, { metalness: 0.6, roughness: 0.35 });
    const hl = new THREE.BoxGeometry(1.6, 0.18, 0.05);
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(carGeo, trafficMat));
      const f = new THREE.Mesh(hl, this.mats.headlight); f.position.set(0, 0.95, -2.16);
      const b = new THREE.Mesh(hl, this.mats.ledRed); b.position.set(0, 1.0, 2.16);
      g.add(f, b);
      const lane = i % 4;
      g.userData = { lane, t: i / 16, speed: 11 + (i % 5) * 2.2 };
      scene.add(g);
      this.traffic.push(g);
    }
  }

  // 根据模拟状态同步所有角色（alpha：渲染插值）
  sync(dt, alpha, camPos) {
    const w = this.w, t = w.time;
    // 玩家船缘
    const P = w.player;
    const px = P.prev.x + (P.pos.x - P.prev.x) * alpha, py = P.prev.y + (P.pos.y - P.prev.y) * alpha, pz = P.prev.z + (P.pos.z - P.prev.z) * alpha;
    this.player.position.set(px, py, pz);
    this.player.rotation.set(P.tilt.z * 0.7, 0, -P.tilt.x * 0.7);
    this._hullColor(this.player.material, P, 0.3, 0x8e959b);
    // 僚机
    for (const v of this.wing) {
      const m = w.wingmanById(v.id), s = m.ship;
      v.mesh.visible = !s.destroyed;
      v.mesh.position.set(s.prev.x + (s.pos.x - s.prev.x) * alpha, s.prev.y + (s.pos.y - s.prev.y) * alpha, s.prev.z + (s.pos.z - s.prev.z) * alpha);
      v.mesh.rotation.set(s.tilt.z * 0.8, t * 0.05, -s.tilt.x * 0.8);
      this._hullColor(v.mat, s, 1);
      const em = w.traces.emissions.get(s.id);
      v.shell.material.uniforms.uOn.value = em && em.rainShell ? 1 : 0;
      v.shell.material.uniforms.uLit.value = em && em.lit ? 1 : 0;
    }
    // 幻影
    while (this.phantoms.length < w.weapons.phantoms.length) { const m = new THREE.Mesh(this.saucerGeo, this.holoMat.clone()); this.scene.add(m); this.phantoms.push(m); }
    this.phantoms.forEach((m, i) => {
      const ph = w.weapons.phantoms[i];
      m.visible = !!ph;
      if (ph) { m.position.set(ph.pos.x, ph.pos.y, ph.pos.z); m.rotation.y = t * 0.6; m.material.uniforms.uFade.value = Math.min(1, ph.life / 1.5) * Math.min(1, ph.t / 0.4); }
    });
    // 人形
    for (const o of [...w.guards, ...w.towers, ...w.civilians]) {
      const h = this.humans.get(o.id);
      if (!h) continue;
      const d2 = (o.pos.x - camPos.x) ** 2 + (o.pos.z - camPos.z) ** 2;
      h.visible = d2 < 400 * 400;
      if (!h.visible) continue;
      h.position.set(o.pos.x, o.pos.y, o.pos.z);
      h.rotation.y = o.yaw;
      const u = h.userData;
      const moving = o.vel && Math.hypot(o.vel.x, o.vel.z) > 0.2 && o.act !== 'look' && !o.down && !(o.stunned > 0);
      const ph = o.walkPhase || 0;
      const sw = moving ? Math.sin(ph * 2.6) * 0.55 : 0;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.6; u.armR.rotation.x = o.phoneOut ? -1.3 : sw * 0.6;
      u.phone.visible = !!o.phoneOut;
      u.stasis.visible = o.stunned > 0;
      if (o.down) {
        u.body.rotation.x = -Math.PI / 2 + 0.1; u.body.position.y = 0.25;
      } else if (o.knock) {
        u.body.rotation.x = -(o.tumble || 0); u.body.position.y = 0;
      } else { u.body.rotation.x = o.aware === 'search' ? 0.08 : 0; u.body.position.y = 0; }
      if (o.kind === 'tower') { h.position.y = o.pos.y - 0.6; }
    }
    // 无人机
    for (const d of w.drones) {
      const m = this.drones.get(d.id);
      m.position.set(d.pos.x, d.pos.y, d.pos.z);
      m.rotation.set(d.state === 'down' ? 0.6 : (d.vel?.z || 0) * 0.02, d.yaw, -(d.vel?.x || 0) * 0.02);
      m.visible = true;
      for (const r of m.userData.rotors) r.visible = d.state !== 'down' && d.state !== 'docked';
      const blink = Math.sin(t * 6 + d.idx) > 0.4 && d.state !== 'down' && !(d.disabled > 0);
      m.userData.ledR.visible = blink; m.userData.ledG.visible = blink;
      m.userData.stasis.visible = d.stunned > 0;
    }
    // 穿越机
    while (this.fpv.length < w.swarm.length) { const m = makeDrone(this.mats, true); this.scene.add(m); this.fpv.push(m); }
    this.fpv.forEach((m, i) => {
      const s = w.swarm[i];
      m.visible = !!s && s.alive && !(s.delay > 0);
      if (m.visible) { m.position.set(s.pos.x, s.pos.y, s.pos.z); m.lookAt(s.pos.x + s.vel.x, s.pos.y + s.vel.y, s.pos.z + s.vel.z); m.userData.ledR.visible = Math.sin(t * 20 + i) > 0; }
    });
    // 摄像头
    for (const c of w.cameras) {
      const v = this.cams.get(c.id);
      v.head.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
      const on = c.alive && !(c.disabled > 0) && w.power.on;
      v.led.visible = on && Math.sin(t * 3) > -0.3;
      v.g.visible = c.alive;
    }
    for (const s of w.emStations) {
      const v = this.ems.get(s.id);
      const on = s.alive && !(s.disabled > 0) && w.power.on;
      v.led.visible = on && (Math.sin(t * (2 + s.sus * 0.15)) > 0);
      v.led.material.emissiveIntensity = 2 + s.sus * 0.06;
      v.g.visible = s.alive;
    }
    // 车辆
    for (const c of w.cars) {
      let v = this.cars.get(c.id);
      if (!v) { v = makeCar(this.mats); this.scene.add(v); this.cars.set(c.id, v); }
      v.position.set(c.pos.x, c.pos.y, c.pos.z);
      v.rotation.set(0, c.yaw, c.roll || 0);
      v.userData.turret.rotation.y = (c.turretYaw || 0) - c.yaw;
      const wrecked = c.state === 'wrecked';
      v.userData.red.visible = !wrecked && Math.sin(t * 9) > 0;
      v.userData.blue.visible = !wrecked && Math.sin(t * 9) <= 0;
      let b = this.beams.get(c.id);
      if (!b) { b = beamMesh(120, c.spot.cone, 0xf2f4ff); this.scene.add(b); this.beams.set(c.id, b); }
    }
    // 直升机
    if (w.heli) {
      if (!this.heli) { this.heli = makeHeli(this.mats); this.scene.add(this.heli); const b = beamMesh(160, 14, 0xf2f4ff); this.scene.add(b); this.beams.set('heli', b); }
      const h = w.heli;
      this.heli.position.set(h.pos.x, h.pos.y, h.pos.z);
      this.heli.rotation.set(-(h.vel.z * Math.cos(h.yaw) + h.vel.x * Math.sin(h.yaw)) * -0.01, h.yaw, h.bank || 0, 'YXZ');
      if (!h.alive) this.heli.rotation.y += (h.spinCrash || 0);
      this.heli.userData.rotor.rotation.y = t * (h.alive ? 28 : 6);
      this.heli.userData.tailRotor.rotation.x = t * 40;
      const bl = Math.sin(t * 4) > 0.6;
      this.heli.userData.navR.visible = bl; this.heli.userData.navG.visible = bl;
    }
    // 光柱
    const spots = w.spotlights();
    for (const [id, b] of this.beams) {
      let L = null;
      if (id === 'heli') L = w.heli?.spot;
      else if (id.startsWith('car')) L = w.cars.find((c) => c.id === id)?.spot;
      else L = w.towers.find((x) => x.id === id)?.spot;
      const on = !!L && spots.includes(L);
      b.visible = on;
      if (!on) continue;
      b.position.set(L.x, L.y, L.z);
      tmpV.set(L.x + L.dir.x, L.y + L.dir.y, L.z + L.dir.z);
      b.lookAt(tmpV);
      b.rotateX(-Math.PI / 2);
    }
    // 路灯
    w.lamps.forEach((l, i) => { this.lampGlows[i].visible = l.alive && !(l.disabled > 0) && w.power.on; });
    // 城市车流
    for (const g of this.traffic) {
      const u = g.userData;
      u.t = (u.t + (dt * u.speed) / 1800) % 1;
      if (u.lane < 2) {
        const dir = u.lane === 0 ? 1 : -1;
        const x = -900 + ((dir > 0 ? u.t : 1 - u.t) * 1800);
        g.position.set(x, MAP.plateauH + 0.5, CITY.roadZ + (u.lane === 0 ? 2.5 : -2.5));
        g.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      } else {
        const dir = u.lane === 2 ? 1 : -1;
        const z = -545 - ((dir > 0 ? u.t : 1 - u.t) * 440);
        g.position.set(u.lane === 2 ? 2.5 : -2.5, MAP.plateauH + 0.5, z);
        g.rotation.y = dir > 0 ? 0 : Math.PI;
      }
    }
  }

  // 自适应外壳：低速时缓慢匹配周围的亮度
  _hullColor(mat, s, strength, base = 0xd8dce0) {
    const camo = 1 - (s.camoFactor() - 0.6) / 0.4; // 1 = 最隐蔽
    const env = this.w.env;
    const ambient = 0.12 + env.light * 0.25;
    const target = new THREE.Color(base).lerp(new THREE.Color(ambient * 0.9, ambient, ambient * 0.85), camo * 0.75 * strength);
    mat.color.lerp(target, 0.04);
  }
}
