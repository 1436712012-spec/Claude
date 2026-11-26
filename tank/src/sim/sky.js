import { hexLin, lerp, clamp, smoothstep } from '../core/math.js';

const KF = [
  { t: 0.0,  top: 0x24104f, mid: 0x9d2a86, hor: 0xff7a3c, stars: 0.12, sunE: 0.07,  sunX: 0.68, city: 0.8 },
  { t: 0.22, top: 0x14083a, mid: 0x5b1c7a, hor: 0xe0407a, stars: 0.5,  sunE: -0.05, sunX: 0.70, city: 1.0 },
  { t: 0.42, top: 0x03040f, mid: 0x0b1245, hor: 0x2a3f8a, stars: 1.0,  sunE: -0.22, sunX: 0.70, city: 1.2 },
  { t: 0.66, top: 0x02030c, mid: 0x0a1036, hor: 0x1d3470, stars: 1.0,  sunE: -0.22, sunX: 0.30, city: 1.2 },
  { t: 0.86, top: 0x0c1a48, mid: 0x2a4f8a, hor: 0xe08a70, stars: 0.35, sunE: -0.14, sunX: 0.30, city: 0.9 },
  { t: 1.0,  top: 0x2c4a9a, mid: 0xe58aa8, hor: 0xffcf70, stars: 0.0,  sunE: 0.11,  sunX: 0.30, city: 0.35 },
].map((k) => ({ ...k, topL: hexLin(k.top), midL: hexLin(k.mid), horL: hexLin(k.hor) }));

const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const sc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** phase 0 (dusk) .. 1 (dawn) -> everything the shaders need */
export function computeSky(phase) {
  phase = clamp(phase, 0, 1);
  let i = 0;
  while (i < KF.length - 2 && phase > KF[i + 1].t) i++;
  const a = KF[i], b = KF[i + 1];
  const t = clamp((phase - a.t) / (b.t - a.t), 0, 1);
  const e = t * t * (3 - 2 * t);
  const top = mix3(a.topL, b.topL, e), mid = mix3(a.midL, b.midL, e), hor = mix3(a.horL, b.horL, e);
  const sunE = lerp(a.sunE, b.sunE, e), sunX = lerp(a.sunX, b.sunX, e);
  const stars = lerp(a.stars, b.stars, e), city = lerp(a.city, b.city, e);
  const sunVis = clamp((sunE + 0.12) / 0.14, 0, 1);
  const moonVis = smoothstep(0.22, 0.34, phase) * (1 - smoothstep(0.78, 0.9, phase));
  const mt = clamp((phase - 0.25) / 0.6, 0, 1);
  const moonPos = [lerp(0.16, 0.86, mt), 0.66 + 0.2 * Math.sin(mt * Math.PI)];
  const sunPos = [sunX, 0.4 + sunE, 0.085];
  const moonActive = moonVis > sunVis;
  const lx = moonActive ? moonPos[0] : sunX;
  const dirx = lx > 0.5 ? 1 : -1;
  const sunDir = [dirx * 0.8, 0.28];
  const sunOrange = [1.0, 0.5, 0.22];
  const sunLight = add(sc(sunOrange, sunVis * 1.5), sc([0.22, 0.34, 0.72], moonVis * 0.55));
  const ambS = add(sc(add(sc(top, 0.5), sc(mid, 0.85)), 1.15), [0.018, 0.024, 0.05]);
  const ambG = add(sc(hor, 0.32), sc(mid, 0.1));
  const rim = add(sc(hor, 1.15), [0.0, 0.07, 0.11]);
  return {
    phase, top, mid, hor, stars, cityLit: city, sunVis, moonVis, sunPos, moonPos,
    sunDisc: [1.0, 0.45, 0.2], sunLight, sunDir, ambS, ambG, rim,
    rimA: [0.08, 0.85, 1.0], rimB: [1.0, 0.18, 0.62],
    gradeLift: [0.9, 0.96, 1.14], gradeGain: [1.09, 1.0, 0.93],
    rayAmt: 0.065 * sunVis + 0.035 * moonVis,
    rayUv: moonActive ? [moonPos[0], moonPos[1]] : [sunPos[0], sunPos[1]],
  };
}
