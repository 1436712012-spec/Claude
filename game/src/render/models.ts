// Procedural models. Everything is built from primitives merged with vertex
// colours so each kind is one draw call, but silhouettes are designed to be
// recognisable at 30 px tall: balloon heads, blank faces, paper-doll cut-outs.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Geo = THREE.BufferGeometry;

function paint(g: Geo, hex: number | THREE.Color): Geo {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = hex instanceof THREE.Color ? hex : new THREE.Color(hex);
  const n = ng.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return ng;
}

function merge(parts: Geo[]): Geo {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('merge failed');
  g.computeBoundingSphere();
  return g;
}

const at = (g: Geo, x: number, y: number, z: number) => { g.translate(x, y, z); return g; };

// Soft fresnel rim so pale figures separate from pale tiles.
export function rimMaterial(opts: THREE.MeshStandardMaterialParameters & { rim?: number; rimColor?: number } = {}) {
  const { rim = 0.35, rimColor = 0xfff6ee, ...rest } = opts;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, ...rest });
  const rc = new THREE.Color(rimColor);
  mat.onBeforeCompile = (s) => {
    s.uniforms.uRim = { value: rim };
    s.uniforms.uRimColor = { value: rc };
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim; uniform vec3 uRimColor;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);
totalEmissiveRadiance += uRimColor * rimF * uRim;`);
  };
  return mat;
}

// ---------------------------------------------------------------- enemies

export function facelessGeometry(): Geo {
  const skin = 0xf3efea, uniform = 0xd8d3e6, collar = 0x3d4a6e;
  const body = at(new THREE.CapsuleGeometry(0.2, 0.36, 6, 14), 0, 0.42, 0);
  const head = at(new THREE.SphereGeometry(0.19, 18, 14), 0, 0.93, 0);
  const neckRing = new THREE.TorusGeometry(0.13, 0.035, 6, 16); neckRing.rotateX(Math.PI / 2); at(neckRing, 0, 0.73, 0);
  const tie = new THREE.ConeGeometry(0.045, 0.16, 4); tie.rotateX(Math.PI); at(tie, 0, 0.63, 0.18);
  const armL = new THREE.CapsuleGeometry(0.05, 0.36, 4, 8); armL.rotateZ(0.08); at(armL, -0.24, 0.5, 0);
  const armR = new THREE.CapsuleGeometry(0.05, 0.36, 4, 8); armR.rotateZ(-0.08); at(armR, 0.24, 0.5, 0);
  return merge([paint(body, uniform), paint(head, skin), paint(neckRing, collar), paint(tie, collar), paint(armL, uniform), paint(armR, uniform)]);
}

export function balloonGeometry(): Geo {
  const balloon = new THREE.SphereGeometry(0.3, 22, 16); balloon.scale(1, 1.12, 1); at(balloon, 0, 1.18, 0);
  const knot = at(new THREE.ConeGeometry(0.05, 0.07, 8), 0, 0.82, 0);
  const string = at(new THREE.CylinderGeometry(0.006, 0.006, 0.62, 4), 0, 0.5, 0);
  // A smiling face that is always just slightly too wide.
  const eyeL = new THREE.SphereGeometry(0.03, 8, 6); eyeL.scale(1, 1.5, 0.5); at(eyeL, -0.09, 1.25, 0.29);
  const eyeR = new THREE.SphereGeometry(0.03, 8, 6); eyeR.scale(1, 1.5, 0.5); at(eyeR, 0.09, 1.25, 0.29);
  const smile = new THREE.TorusGeometry(0.13, 0.013, 5, 16, Math.PI * 0.8);
  smile.rotateZ(Math.PI + Math.PI * 0.1); at(smile, 0, 1.17, 0.285);
  const ink = 0x2b2f45;
  return merge([paint(balloon, 0xffffff), paint(knot, 0xffffff), paint(string, 0xe9e6e1), paint(eyeL, ink), paint(eyeR, ink), paint(smile, ink)]);
}

export function paperGeometry(): Geo {
  // A paper doll cut from one folded sheet: round head, A-line body, arms out.
  const s = new THREE.Shape();
  s.moveTo(-0.08, 0);
  s.lineTo(-0.11, 0.3); s.lineTo(-0.16, 0.32); s.lineTo(-0.2, 0.62); s.lineTo(-0.36, 0.66);
  s.lineTo(-0.36, 0.72); s.lineTo(-0.1, 0.74); s.lineTo(-0.07, 0.8);
  s.absarc(0, 0.92, 0.13, -Math.PI * 0.35, Math.PI * 1.35, false);
  s.lineTo(0.07, 0.8); s.lineTo(0.1, 0.74); s.lineTo(0.36, 0.72); s.lineTo(0.36, 0.66);
  s.lineTo(0.2, 0.62); s.lineTo(0.16, 0.32); s.lineTo(0.11, 0.3); s.lineTo(0.08, 0);
  s.lineTo(0.02, 0); s.lineTo(0, 0.26); s.lineTo(-0.02, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: false });
  g.translate(0, 0.04, -0.009);
  const holeL = at(new THREE.CircleGeometry(0.022, 10), -0.045, 0.95, 0.011);
  const holeR = at(new THREE.CircleGeometry(0.022, 10), 0.045, 0.95, 0.011);
  return merge([paint(g, 0xfbfaf6), paint(holeL, 0x22263a), paint(holeR, 0x22263a)]);
}

// ---------------------------------------------------------------- player

export function buildDreamer(): { root: THREE.Group; body: THREE.Group; cap: THREE.Object3D } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const pajama = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  pajama.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;')
      .replace('#include <color_fragment>', `#include <color_fragment>
float st = smoothstep(0.42, 0.5, abs(fract(vLP.y * 11.0) - 0.5) * 2.0);
diffuseColor.rgb = mix(vec3(0.56, 0.72, 0.93), vec3(0.97, 0.97, 0.99), st);`);
  };
  const skin = new THREE.MeshStandardMaterial({ color: 0xf8e6d8, roughness: 0.7 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xf3b8c8, roughness: 0.9 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfbf8f2, roughness: 0.9 });
  const ink = new THREE.MeshBasicMaterial({ color: 0x3a3550 });
  const blush = new THREE.MeshBasicMaterial({ color: 0xf6a9b6, transparent: true, opacity: 0.75 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.26, 6, 16), pajama);
  torso.position.y = 0.36;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 24, 18), skin);
  head.position.y = 0.8;
  const feetL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), white); feetL.scale.set(1, 0.6, 1.4); feetL.position.set(-0.08, 0.05, 0.03);
  const feetR = feetL.clone(); feetR.position.x = 0.08;
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.2, 4, 8), pajama); armL.position.set(-0.22, 0.4, 0.06); armL.rotation.set(-0.9, 0, 0.25);
  const armR = armL.clone(); armR.position.x = 0.22; armR.rotation.z = -0.25; // sleepwalker arms: reaching forward

  // Closed eyes: two little downward arcs. Cheeks: blush.
  const lid = new THREE.TorusGeometry(0.045, 0.009, 4, 12, Math.PI);
  lid.rotateZ(Math.PI);
  const eyeL = new THREE.Mesh(lid, ink); eyeL.position.set(-0.075, 0.82, 0.195);
  const eyeR = new THREE.Mesh(lid, ink); eyeR.position.set(0.075, 0.82, 0.195);
  const cheekL = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), blush); cheekL.position.set(-0.12, 0.76, 0.18); cheekL.rotation.y = -0.5;
  const cheekR = cheekL.clone(); cheekR.position.x = 0.12; cheekR.rotation.y = 0.5;

  // Nightcap: a drooping cone with a pompom, pivoting so it can swing.
  const cap = new THREE.Group();
  cap.position.set(0, 0.95, -0.02);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.04, 8, 24), white);
  brim.rotation.x = Math.PI / 2 + 0.25;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 18, 4), capMat);
  cone.position.set(0, 0.17, -0.1); cone.rotation.x = -0.7;
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), white);
  pom.position.set(0, 0.29, -0.3);
  cap.add(brim, cone, pom);

  body.add(torso, head, feetL, feetR, armL, armR, eyeL, eyeR, cheekL, cheekR, cap);
  body.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  // Inverted-hull ink outline so the dreamer always reads against pale tiles.
  const outline = new THREE.MeshBasicMaterial({ color: 0x5b5378, side: THREE.BackSide, transparent: true, opacity: 0.55, depthWrite: false });
  for (const m of [torso, head, cone, armL, armR]) {
    const o = new THREE.Mesh(m.geometry, outline);
    o.scale.setScalar(1.12);
    o.castShadow = false;
    m.add(o);
  }
  return { root, body, cap };
}

// ---------------------------------------------------------------- weapons & pickups

export function paperPlaneGeometry(): Geo {
  const v = [
    0, 0, 0.24, -0.17, 0.02, -0.12, 0, 0, -0.1,   // left wing
    0, 0, 0.24, 0, 0, -0.1, 0.17, 0.02, -0.12,    // right wing
    0, 0, 0.24, 0, -0.06, -0.1, 0, 0, -0.1,        // keel
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

export function noteGeometry(): Geo {
  const s = new THREE.Shape();
  s.absellipse(0, 0, 0.1, 0.075, 0, Math.PI * 2, false, -0.4);
  const head = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
  const stem = at(new THREE.BoxGeometry(0.022, 0.34, 0.03), 0.085, 0.17, 0.015);
  const fs = new THREE.Shape();
  fs.moveTo(0.075, 0.34); fs.quadraticCurveTo(0.2, 0.28, 0.19, 0.12); fs.quadraticCurveTo(0.16, 0.22, 0.075, 0.24); fs.closePath();
  const flag = new THREE.ExtrudeGeometry(fs, { depth: 0.03, bevelEnabled: false });
  const g = merge([paint(head, 0xffffff), paint(stem, 0xffffff), paint(flag, 0xffffff)]);
  g.translate(-0.05, -0.12, 0);
  return g;
}

export function starGeometry(size = 0.12): Geo {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? size : size * 0.45;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: size * 0.25, bevelEnabled: true, bevelSize: size * 0.12, bevelThickness: size * 0.12, bevelSegments: 2 });
  g.center();
  return g;
}

export function chestGeometry(): Geo {
  const base = at(new THREE.BoxGeometry(0.56, 0.3, 0.42), 0, 0.15, 0);
  const lid = at(new THREE.BoxGeometry(0.6, 0.12, 0.46), 0, 0.36, 0);
  const rib1 = at(new THREE.BoxGeometry(0.09, 0.44, 0.47), 0, 0.22, 0);
  const rib2 = at(new THREE.BoxGeometry(0.61, 0.44, 0.09), 0, 0.22, 0);
  const bowL = new THREE.TorusGeometry(0.07, 0.025, 6, 14); bowL.rotateY(Math.PI / 2); bowL.rotateZ(0.6); at(bowL, -0.07, 0.48, 0);
  const bowR = new THREE.TorusGeometry(0.07, 0.025, 6, 14); bowR.rotateY(Math.PI / 2); bowR.rotateZ(-0.6); at(bowR, 0.07, 0.48, 0);
  return merge([paint(base, 0xbfe6dc), paint(lid, 0xf4c3cf), paint(rib1, 0xfffaf0), paint(rib2, 0xfffaf0), paint(bowL, 0xfffaf0), paint(bowR, 0xfffaf0)]);
}

export function softDiscTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}
