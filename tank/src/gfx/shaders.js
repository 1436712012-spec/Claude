// All GLSL (WebGL2 / ES 3.00). Colours are linear HDR; tone mapping happens in the composite pass.
const H = `#version 300 es
precision highp float;
precision highp int;
`;

const CAM = `
uniform vec4 uCam;    // x, y, halfW, halfH (world units, zoom already applied)
uniform vec3 uShake;  // offx, offy, rot
vec2 w2n(vec2 w){
  vec2 p = w - uCam.xy;
  float c = cos(uShake.z), s = sin(uShake.z);
  p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + uShake.xy;
  return p / uCam.zw;
}
`;

const NOISE = `
float hash11(float n){ return fract(sin(n*127.1)*43758.5453); }
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<4;i++){ s += a*vn(p); p = p*2.03 + 17.0; a *= 0.5; }
  return s;
}
float vn1(float x){ float i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f); return mix(hash11(i), hash11(i+1.0), f); }
float fbm1(float x){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vn1(x); x=x*2.03+7.0; a*=0.5; } return s; }
`;

const LIGHTS = `
#define MAXL 16
uniform int uNL;
uniform vec4 uLP[MAXL];   // x, y, height, radius
uniform vec4 uLC[MAXL];   // rgb * intensity
uniform vec3 uAmbS, uAmbG, uSunCol, uRim, uHor;
uniform vec2 uSunDir;
vec3 pointLights(vec3 wp, vec3 n, vec3 albedo, float spec, float shin){
  vec3 acc = vec3(0.0);
  for(int i=0;i<MAXL;i++){
    if(i >= uNL) break;
    vec3 L = vec3(uLP[i].xy - wp.xy, uLP[i].z - wp.z);
    float d2 = dot(L, L);
    float r = uLP[i].w;
    float att = clamp(1.0 - d2/(r*r), 0.0, 1.0);
    att *= att;
    if(att <= 0.0) continue;
    vec3 Ln = L * inversesqrt(d2 + 1.0);
    float nd = max(dot(n, Ln), 0.0);
    vec3 Hh = normalize(Ln + vec3(0.0, 0.0, 1.0));
    float sp = pow(max(dot(n, Hh), 0.0), shin) * spec;
    acc += uLC[i].rgb * att * (albedo*nd + sp);
  }
  return acc;
}
vec3 shadeSurface(vec3 albedo, vec3 n, vec3 wp, float metal, float spec){
  vec3 col = albedo * mix(uAmbG, uAmbS, n.y*0.5 + 0.5);
  vec3 Ls = normalize(vec3(uSunDir, 0.32));
  float nd = max(dot(n, Ls), 0.0);
  col += albedo * uSunCol * nd;
  vec3 Hh = normalize(Ls + vec3(0.0, 0.0, 1.0));
  col += uSunCol * pow(max(dot(n, Hh), 0.0), 36.0) * spec;
  float edge = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
  float side = clamp(dot(normalize(n.xy + vec2(1e-4)), normalize(uSunDir)), 0.0, 1.0);
  col += uRim * edge * (0.22 + 1.25*side) * (0.5 + metal*0.7);
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.5);
  float up = smoothstep(-0.2, 0.7, n.y);
  vec3 env = mix(uAmbG*0.6, uHor*1.1 + uAmbS*0.4, up);
  col += env * metal * (0.02 + 0.4*fres) * (0.35 + albedo*1.6);
  col += pointLights(wp, n, albedo, spec*0.55, 36.0);
  return col;
}
`;

// ---------------------------------------------------------------------------------------------
// SDF instanced shapes (tank, planes, houses, props, glows, smoke puffs)
// ---------------------------------------------------------------------------------------------
export const SHAPE_VS = H + CAM + `
layout(location=0) in vec2 aQuad;
layout(location=1) in vec4 aA;  // x, y, hw, hh
layout(location=2) in vec4 aB;  // rot, radius, shape, bevel
layout(location=3) in vec4 aC;  // colour
layout(location=4) in vec4 aD;  // emissive, material, flash, param
out vec2 vP;
out vec2 vW;
flat out vec4 fA;
flat out vec4 fB;
flat out vec4 fC;
flat out vec4 fD;
void main(){
  float mat = aD.y;
  float margin = (mat > 2.5 && mat < 4.5) ? aB.w*4.5 + 3.0 : 3.0;
  vec2 hs = (aB.z > 3.5) ? vec2(aA.z + aA.w) : aA.zw;
  vec2 lp = aQuad * (hs + margin);
  float c = cos(aB.x), s = sin(aB.x);
  vec2 w = aA.xy + vec2(c*lp.x - s*lp.y, s*lp.x + c*lp.y);
  vP = lp; vW = w;
  fA = aA; fB = aB; fC = aC; fD = aD;
  gl_Position = vec4(w2n(w), 0.0, 1.0);
}
`;

export const SHAPE_FS = H + NOISE + LIGHTS + `
in vec2 vP;
in vec2 vW;
flat in vec4 fA;
flat in vec4 fB;
flat in vec4 fC;
flat in vec4 fD;
out vec4 o;

float dot2(vec2 v){ return dot(v, v); }
float sdRBox(vec2 p, vec2 b, float r){
  r = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float sdEll(vec2 p, vec2 b){
  if(abs(b.x - b.y) < 0.01) return length(p) - b.x;
  float k0 = length(p/b);
  float k1 = length(p/(b*b));
  if(k1 < 1e-6) return -min(b.x, b.y);
  return k0*(k0 - 1.0)/k1;
}
float sdTrapezoid(vec2 p, float r1, float r2, float he){
  vec2 k1 = vec2(r2, he);
  vec2 k2 = vec2(r2 - r1, 2.0*he);
  p.x = abs(p.x);
  vec2 ca = vec2(p.x - min(p.x, (p.y < 0.0) ? r1 : r2), abs(p.y) - he);
  vec2 cb = p - k1 + k2*clamp(dot(k1 - p, k2)/dot2(k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s*sqrt(min(dot2(ca), dot2(cb)));
}
float sdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2){
  vec2 e0 = p1-p0, e1 = p2-p1, e2 = p0-p2;
  vec2 v0 = p-p0, v1 = p-p1, v2 = p-p2;
  vec2 pq0 = v0 - e0*clamp(dot(v0,e0)/dot(e0,e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1*clamp(dot(v1,e1)/dot(e1,e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2*clamp(dot(v2,e2)/dot(e2,e2), 0.0, 1.0);
  float s = sign(e0.x*e2.y - e0.y*e2.x);
  vec2 d = min(min(vec2(dot(pq0,pq0), s*(v0.x*e0.y - v0.y*e0.x)),
                   vec2(dot(pq1,pq1), s*(v1.x*e1.y - v1.y*e1.x))),
                   vec2(dot(pq2,pq2), s*(v2.x*e2.y - v2.y*e2.x)));
  return -sqrt(d.x)*sign(d.y);
}
float sdf(vec2 p){
  int shape = int(fB.z + 0.5);
  vec2 hw = fA.zw;
  float rad = fB.y;
  float prm = fD.w;
  if(shape == 0) return sdRBox(p, hw, rad);
  if(shape == 1) return sdEll(p, hw);
  if(shape == 2){
    float r = min(rad, min(hw.x, hw.y)*0.9);
    vec2 b = hw - r;
    return sdTriangle(p, vec2(-b.x, -b.y), vec2(b.x, -b.y), vec2(prm*b.x, b.y)) - r;
  }
  if(shape == 3){
    float r = min(rad, hw.y*0.9);
    return sdTrapezoid(p, max(hw.x - r, 0.5), max(prm - r, 0.0), hw.y - r) - r;
  }
  return abs(length(p) - hw.x) - hw.y;
}
float puffDens(vec2 q, float seed){
  float r = length(q);
  float n = fbm(q*2.3 + seed*13.0);
  return smoothstep(1.0, 0.12, r + (n - 0.5)*0.95);
}

void main(){
  int mat = int(fD.y + 0.5);
  float emis = fD.x;
  float flash = fD.z;
  float bevel = max(fB.w, 0.5);
  float d = sdf(vP);

  if(mat == 3){ // additive glow
    float md = bevel*4.5;
    float g = exp(-max(d, 0.0)/bevel) * (1.0 - smoothstep(md*0.45, md, max(d, 0.0)));
    o = vec4(fC.rgb * emis * g * fC.a, 1.0);
    return;
  }
  if(mat == 4){ // soft blob (shadows)
    float a = fC.a * exp(-max(d, 0.0)/bevel) * (1.0 - smoothstep(bevel*1.8, bevel*4.4, max(d, 0.0)));
    o = vec4(fC.rgb, a);
    return;
  }
  if(mat == 5){ // volumetric smoke puff
    float R = fA.z;
    vec2 q = vP / R;
    float seed = fD.w;
    float dn = puffDens(q, seed);
    if(dn < 0.01) discard;
    vec2 sd = normalize(vec2(uSunDir.x, uSunDir.y) + 1e-4);
    float dl = puffDens(q + sd*0.28, seed);
    float lit = clamp((dn - dl)*3.0, 0.0, 1.0);
    vec3 wp = vec3(vW, 0.0);
    vec3 base = fC.rgb;
    vec3 col = base * mix(uAmbG, uAmbS, 0.6) * (1.0 - 0.35*dn);
    col += base * uSunCol * lit * 0.9 + uRim * lit * 0.22;
    col += pointLights(wp, vec3(0.0, 0.0, 1.0), base*1.6, 0.0, 8.0)*0.45;
    float core = smoothstep(0.7, 0.0, length(q));
    col += vec3(1.0, 0.45, 0.12) * emis * core * dn * 2.4;
    o = vec4(col, fC.a * dn * 0.9);
    return;
  }

  float aa = max(fwidth(d)*0.85, 0.3);
  float alpha = 1.0 - smoothstep(-aa, aa, d);
  if(alpha <= 0.004) discard;

  float e = 1.0;
  vec2 g = vec2(sdf(vP + vec2(e, 0.0)) - sdf(vP - vec2(e, 0.0)),
                sdf(vP + vec2(0.0, e)) - sdf(vP - vec2(0.0, e)));
  vec2 n2 = g / (length(g) + 1e-5);
  float c = cos(fB.x), s = sin(fB.x);
  n2 = vec2(c*n2.x - s*n2.y, s*n2.x + c*n2.y);
  float h = clamp(-d/bevel, 0.0, 1.0);
  float th = (1.0 - h) * 1.5708;
  vec3 n = normalize(vec3(n2*sin(th), cos(th) + 0.001));

  float metal = 0.0, spec = 0.1;
  if(mat == 0){ metal = 0.7; spec = 0.6; }
  else if(mat == 2){ metal = 0.9; spec = 1.8; }
  vec3 albedo = fC.rgb;
  // subtle panel grain
  albedo *= 0.94 + 0.12*hash21(floor(vW*0.5));
  vec3 col = shadeSurface(albedo, n, vec3(vW, 0.0), metal, spec);
  col += albedo * emis;
  col = mix(col, vec3(2.4, 2.0, 1.7), flash*0.65);
  col += flash * vec3(1.0, 0.55, 0.25) * 0.8;
  o = vec4(col, fC.a * alpha);
}
`;

// ---------------------------------------------------------------------------------------------
// Fullscreen helpers
// ---------------------------------------------------------------------------------------------
export const FS_VS = H + `
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p*2.0 - 1.0, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------------------------
// Procedural background: synth-dusk sky, sun with slits, moon, stars, clouds, mountains, cities
// ---------------------------------------------------------------------------------------------
export const BG_FS = H + NOISE + `
in vec2 vUv;
out vec4 o;
uniform vec2 uView;       // world view size
uniform float uCamX, uTime;
uniform vec3 uTop, uMid, uHorC;
uniform vec3 uSunPosR;    // uv.xy, radius (in uv-y units)
uniform vec3 uSunCol;
uniform float uSunVis, uStars, uMoonVis, uCityLit;
uniform vec2 uMoonPos;
uniform vec2 uShakeUv;

float horizon = 0.40;

vec3 layerMountain(vec3 col, vec2 uv, float pf, float base, float amp, float freq, float fog, float seed, vec3 tint){
  float x = uv.x*uView.x + uCamX*pf;
  float hgt = horizon + base + amp*fbm1(x*freq + seed);
  float m = 1.0 - smoothstep(0.0, 0.0022, uv.y - hgt);
  vec3 lc = mix(tint, uHorC*0.55 + uMid*0.15, fog);
  float rim = exp(-max(hgt - uv.y, 0.0)*260.0) * (0.5 + 0.5*uSunVis);
  lc += uHorC*rim*0.55*(1.0 - fog*0.6);
  return mix(col, lc, m);
}

vec3 layerCity(vec3 col, vec2 uv, float pf, float base, float amp, float bw, float fog, float seed, vec3 tint, float litAmt){
  float x = uv.x*uView.x + uCamX*pf;
  float id = floor(x/bw);
  float fx = fract(x/bw);
  float rnd = hash11(id*3.17 + seed);
  float rnd2 = hash11(id*7.77 + seed + 4.0);
  float hgt = horizon + base + (0.25 + rnd*rnd)*amp;
  // stepped roof
  float hgt2 = hgt - amp*0.22*step(0.5, rnd2) * step(0.35, fx) * step(fx, 0.65) * -1.0;
  hgt = (fx > 0.3 && fx < 0.7 && rnd2 > 0.55) ? hgt + amp*0.18 : hgt;
  float gap = step(0.07, fx) * step(fx, 0.93);
  float inb = step(uv.y, hgt) * gap;
  vec3 lc = mix(tint, uHorC*0.5 + uMid*0.12, fog);
  vec3 outc = col;
  if(inb > 0.5){
    outc = lc;
    // neon windows
    float wy = (uv.y - horizon - base) * uView.y;
    vec2 cell = vec2(floor(fx*bw/5.0), floor(wy/7.0));
    float wr = hash21(cell + id*13.1 + seed);
    float lit = step(0.62, wr) * litAmt;
    lit *= 0.75 + 0.25*sin(uTime*(0.5 + wr*2.0) + wr*40.0);
    vec2 wf = vec2(fract(fx*bw/5.0), fract(wy/7.0));
    float win = step(0.2, wf.x)*step(wf.x, 0.8)*step(0.25, wf.y)*step(wf.y, 0.75);
    vec3 wc = wr > 0.88 ? vec3(0.1, 0.9, 1.0) : (wr > 0.75 ? vec3(1.0, 0.2, 0.7) : vec3(1.0, 0.65, 0.25));
    outc += wc * win * lit * (1.0 - fog*0.6) * 2.2;
    // roof edge light
    float edge = exp(-(hgt - uv.y)*400.0);
    outc += uHorC * edge * 0.6 * (1.0 - fog*0.5);
  }
  // antenna blink
  float ant = step(0.8, rnd2) * step(abs(fx - 0.5), 0.012) * step(hgt, uv.y) * step(uv.y, hgt + amp*0.25);
  outc = mix(outc, lc, ant*0.9);
  float tipD = length(vec2((fx - 0.5)*bw/uView.y, uv.y - (hgt + amp*0.25)));
  float tip = step(0.8, rnd2) * (1.0 - smoothstep(0.002, 0.007, tipD));
  outc += vec3(1.0, 0.1, 0.1) * tip * (0.4 + 0.6*step(0.5, fract(uTime*0.7 + rnd2*5.0))) * 5.0 * litAmt;
  return outc;
}

void main(){
  vec2 uv = vUv + uShakeUv;
  float asp = uView.x/uView.y;
  float y = uv.y;

  // sky gradient
  vec3 col = mix(uHorC, uMid, smoothstep(horizon - 0.08, horizon + 0.28, y));
  col = mix(col, uTop, smoothstep(horizon + 0.20, 1.02, y));
  col += uHorC * 0.5 * exp(-abs(y - horizon - 0.02)*10.0);

  // stars
  vec2 sp = uv*vec2(asp, 1.0)*vec2(90.0, 90.0);
  vec2 sc = floor(sp);
  float sr = hash21(sc);
  vec2 sf = fract(sp) - 0.5;
  float star = step(0.975, sr) * smoothstep(0.28, 0.0, length(sf - (vec2(hash21(sc+3.0), hash21(sc+9.0)) - 0.5)*0.5));
  star *= 0.6 + 0.4*sin(uTime*(1.0 + sr*3.0) + sr*60.0);
  col += vec3(0.8, 0.85, 1.0) * star * uStars * smoothstep(horizon + 0.05, horizon + 0.35, y) * 1.4;

  // sun
  vec2 sv = (uv - uSunPosR.xy) * vec2(asp, 1.0);
  float sd = length(sv);
  float sr0 = uSunPosR.z;
  float disc = smoothstep(sr0, sr0 - 0.0035, sd);
  // retro slits in the lower half
  float lowerT = clamp(-sv.y/sr0, 0.0, 1.0);
  float slits = mix(1.0, step(0.35 + lowerT*0.4, fract(sv.y*34.0 + uTime*0.03)), step(0.0, -sv.y) * smoothstep(0.1, 0.5, lowerT));
  vec3 sunBody = mix(vec3(1.0, 0.35, 0.18), vec3(1.0, 0.85, 0.45), smoothstep(-sr0, sr0, sv.y));
  col += (sunBody * 5.0 * disc * slits + uSunCol * (exp(-sd*5.5)*0.8 + exp(-sd*22.0)*1.2)) * uSunVis;

  // moon
  vec2 mv = (uv - uMoonPos) * vec2(asp, 1.0);
  float md = length(mv);
  float mr = 0.045;
  float mdisc = smoothstep(mr, mr - 0.003, md);
  float crater = fbm(mv*60.0)*0.5 + 0.5;
  vec3 moonc = vec3(0.75, 0.85, 1.0) * (0.55 + 0.5*crater) * 1.4;
  col += (moonc * mdisc + vec3(0.35, 0.5, 0.9) * exp(-md*14.0)*0.5) * uMoonVis;

  // clouds
  vec2 cp = vec2(uv.x*uView.x*0.0016 + uCamX*0.00006 + uTime*0.004, y*5.0);
  float cl = fbm(cp*vec2(1.0, 2.6));
  float cmask = smoothstep(0.52, 0.78, cl) * smoothstep(horizon + 0.02, horizon + 0.22, y) * (1.0 - smoothstep(horizon + 0.45, horizon + 0.75, y));
  float cl2 = fbm(cp*vec2(1.0, 2.6) + vec2(0.0, 0.08));
  float clit = clamp((cl - cl2)*10.0, 0.0, 1.0);
  vec3 cloudBase = mix(uMid*0.45, uTop*0.6, 0.5);
  col = mix(col, cloudBase + uHorC*(0.25 + clit*1.0) + uSunCol*clit*0.8*uSunVis, cmask*0.78);

  // far layers (back to front)
  vec3 far = uTop*0.35 + uMid*0.12;
  col = layerMountain(col, uv, 0.02, -0.01, 0.09, 0.0042, 0.88, 3.0, far*0.6);
  col = layerCity(col, uv, 0.04, -0.02, 0.17, 30.0, 0.80, 1.0, far*0.5, uCityLit*0.8);
  col = layerMountain(col, uv, 0.07, -0.03, 0.12, 0.0035, 0.70, 9.0, far*0.45);
  col = layerCity(col, uv, 0.11, -0.04, 0.21, 38.0, 0.56, 5.0, far*0.35, uCityLit);
  col = layerMountain(col, uv, 0.18, -0.06, 0.10, 0.0052, 0.40, 14.0, far*0.3);
  col = layerCity(col, uv, 0.26, -0.07, 0.14, 52.0, 0.30, 11.0, far*0.22, uCityLit*0.9);

  // low haze above the horizon line
  col += uHorC * 0.25 * exp(-max(y - horizon, 0.0)*14.0) * smoothstep(horizon - 0.12, horizon, y) * 0.6;
  col += (hash21(uv*uView*0.5 + uTime) - 0.5) * 0.004;
  o = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------------------------
// Terrain strip
// ---------------------------------------------------------------------------------------------
export const TERRAIN_VS = H + CAM + `
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aDS; // depth, slope
out vec2 vW;
out float vDepth;
out float vSlope;
void main(){
  vW = aPos; vDepth = aDS.x; vSlope = aDS.y;
  gl_Position = vec4(w2n(aPos), 0.0, 1.0);
}
`;

export const TERRAIN_FS = H + NOISE + LIGHTS + `
in vec2 vW;
in float vDepth;
in float vSlope;
out vec4 o;
uniform float uPx;    // world units per pixel
uniform float uTime;
uniform vec3 uRimA, uRimB;
void main(){
  float edge = smoothstep(0.0, uPx*1.2, vDepth);
  vec3 n = normalize(vec3(-vSlope*1.1, 1.0, 0.55));
  float nz = vn(vW*0.06) * 0.5 + fbm(vW*0.02)*0.5;
  float strata = 0.5 + 0.5*sin(vDepth*0.16 + nz*4.0 + vW.x*0.003);
  vec3 soil = mix(vec3(0.030, 0.018, 0.050), vec3(0.072, 0.040, 0.095), nz);
  soil = mix(soil, soil*1.5 + vec3(0.02, 0.0, 0.03), smoothstep(0.55, 0.9, strata)*0.4);
  float grit = hash21(floor(vW*0.7));
  soil *= 0.88 + 0.24*grit;
  vec3 deep = vec3(0.012, 0.008, 0.022);
  soil = mix(soil, deep, smoothstep(6.0, 150.0, vDepth));
  vec3 wp = vec3(vW.x, vW.y, 0.0);
  float dim = exp(-vDepth/70.0);
  vec3 col = soil * mix(uAmbG, uAmbS, n.y*0.5 + 0.5) * 0.9;
  col += soil * uSunCol * max(dot(n, normalize(vec3(uSunDir, 0.4))), 0.0) * 0.4 * dim;
  col += pointLights(wp, n, soil*1.6, 0.0, 18.0) * dim;
  // neon rim along the ridge
  float pulse = 0.85 + 0.15*sin(uTime*1.3 + vW.x*0.01);
  vec3 rimCol = mix(uRimA, uRimB, 0.5 + 0.5*sin(vW.x*0.0021 + 1.0));
  float rimThin = exp(-vDepth/(uPx*1.8));
  float rimWide = exp(-vDepth/11.0);
  col += rimCol * (rimThin*2.6 + rimWide*0.38) * pulse;
  col += uRim * rimWide * 0.25;
  o = vec4(col, edge);
}
`;

// ---------------------------------------------------------------------------------------------
// GPU particles: transform-feedback update + instanced draw
// state per particle: A=(pos.xy, vel.xy)  B=(life, maxLife, size, type)  C=(r, g, b, seed[+1 hot])
// types: 0 spark 1 ember 2 smoke 3 debris 4 fire 5 dust 6 casing
// ---------------------------------------------------------------------------------------------
export const PART_UPDATE_VS = H + `
layout(location=0) in vec4 aA;
layout(location=1) in vec4 aB;
layout(location=2) in vec4 aC;
uniform float uDt, uTime, uWind;
uniform sampler2D uH;
uniform vec3 uTerr; // x0, invStep, count
out vec4 oA;
out vec4 oB;
out vec4 oC;
float groundH(float x){
  float f = (x - uTerr.x)*uTerr.y;
  f = clamp(f, 0.0, uTerr.z - 1.001);
  int i = int(floor(f));
  float t = f - float(i);
  float a = texelFetch(uH, ivec2(i, 0), 0).r;
  float b = texelFetch(uH, ivec2(i + 1, 0), 0).r;
  return mix(a, b, t);
}
void main(){
  vec4 A = aA, B = aB, C = aC;
  if(B.x > 0.0){
    int ty = int(B.w + 0.5);
    vec2 p = A.xy, v = A.zw;
    vec2 acc = vec2(0.0);
    float drag = 0.0, bounce = 0.0, turb = 0.0;
    bool coll = false;
    vec2 wind = vec2(uWind, 0.0);
    if(ty == 0){ acc = vec2(0.0, -680.0) + wind*0.25; drag = 0.55; coll = true; bounce = 0.42; }
    else if(ty == 1){ acc = vec2(0.0, 30.0) + wind; drag = 1.7; turb = 70.0; }
    else if(ty == 2){ acc = vec2(0.0, 34.0) + wind; drag = 1.5; turb = 55.0; }
    else if(ty == 3){ acc = vec2(0.0, -900.0); drag = 0.12; coll = true; bounce = 0.32; }
    else if(ty == 4){ acc = vec2(0.0, 140.0) + wind*0.5; drag = 2.0; turb = 90.0; }
    else if(ty == 5){ acc = vec2(0.0, 8.0) + wind*0.8; drag = 2.4; turb = 40.0; }
    else { acc = vec2(0.0, -1000.0); drag = 0.05; coll = true; bounce = 0.38; }
    if(turb > 0.0){
      vec2 q = p*0.011 + vec2(0.0, uTime*0.55);
      float sd = fract(C.w)*40.0;
      acc += vec2(sin(q.y*3.1 + q.x*1.7 + sd), cos(q.x*2.7 - q.y*1.3 + sd*0.7)) * turb;
    }
    v += acc*uDt;
    v *= max(0.0, 1.0 - drag*uDt);
    p += v*uDt;
    if(coll){
      float gh = groundH(p.x);
      if(p.y < gh){
        p.y = gh;
        if(abs(v.y) < 45.0){ v.y = 0.0; v.x *= 0.82; if(ty == 0) B.x -= 0.02; }
        else { v.y = -v.y*bounce; v.x *= 0.72; }
      }
    }
    B.x -= uDt;
    A = vec4(p, v);
  }
  oA = A; oB = B; oC = C;
  gl_Position = vec4(0.0);
}
`;
export const PART_UPDATE_FS = H + `
out vec4 o;
void main(){ o = vec4(0.0); }
`;

export const PART_DRAW_VS = H + CAM + `
layout(location=0) in vec2 aQ;
layout(location=1) in vec4 aA;
layout(location=2) in vec4 aB;
layout(location=3) in vec4 aC;
uniform int uPass;
out vec2 vQ;
out vec2 vW;
flat out vec4 fC;
flat out float fType;
flat out float fL;
flat out float fSize;
void main(){
  int ty = int(aB.w + 0.5);
  bool addT = (ty == 0 || ty == 1 || ty == 4);
  bool ok = aB.x > 0.0 && ((uPass == 0) == addT);
  if(!ok){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); fType = 0.0; fL = 0.0; fC = vec4(0.0); fSize = 0.0; vQ = vec2(0.0); vW = vec2(0.0); return; }
  float l = clamp(aB.x/aB.y, 0.0, 1.0);
  float size = aB.z;
  float sd = fract(aC.w);
  vec2 hs = vec2(size);
  float ang = 0.0;
  if(ty == 0){
    float sp = length(aA.zw);
    ang = sp > 1.0 ? atan(aA.w, aA.z) : 0.0;
    hs = vec2(max(size, sp*0.02 + size), size*0.55);
  } else if(ty == 2){
    hs = vec2(size*(1.0 + (1.0 - l)*1.8)); ang = sd*6.28 + (1.0 - l)*(sd - 0.5)*1.5;
  } else if(ty == 3 || ty == 6){
    ang = sd*6.28 + (aB.y - aB.x)*(sd - 0.5)*18.0; hs = vec2(size, size*0.62);
  } else if(ty == 4){
    hs = vec2(size*(0.35 + 0.9*l)); ang = sd*6.28;
  } else if(ty == 5){
    hs = vec2(size*(1.0 + (1.0 - l)*1.2)); ang = sd*6.28;
  } else if(ty == 1){
    hs = vec2(size*(0.5 + 0.5*l));
  }
  float c = cos(ang), s = sin(ang);
  vec2 lp = aQ*hs;
  vec2 w = aA.xy + vec2(c*lp.x - s*lp.y, s*lp.x + c*lp.y);
  vQ = aQ; vW = w; fC = aC; fType = float(ty); fL = l; fSize = size;
  gl_Position = vec4(w2n(w), 0.0, 1.0);
}
`;

export const PART_DRAW_FS = H + NOISE + LIGHTS + `
in vec2 vQ;
in vec2 vW;
flat in vec4 fC;
flat in float fType;
flat in float fL;
flat in float fSize;
out vec4 o;
uniform float uTime;
vec3 ramp(vec3 base, float l){
  vec3 hot = mix(base, vec3(1.0, 0.92, 0.7), 0.4);
  return l > 0.5 ? mix(base, hot, (l - 0.5)*2.0) : mix(base*0.15, base, l*2.0);
}
void main(){
  int ty = int(fType + 0.5);
  float l = fL;
  float sd = fract(fC.w);
  if(ty == 0){
    float g = exp(-vQ.y*vQ.y*8.0) * smoothstep(-1.0, 0.9, vQ.x) * (1.0 - smoothstep(0.88, 1.0, abs(vQ.x)));
    float head = exp(-pow((vQ.x - 0.78)*3.2, 2.0));
    vec3 c = ramp(fC.rgb, l) * (1.9 + head*3.2) * g * (0.25 + 0.75*sqrt(l));
    o = vec4(c, 1.0);
  } else if(ty == 1){
    float g = exp(-dot(vQ, vQ)*4.5);
    float fl = 0.75 + 0.25*sin(uTime*30.0 + sd*80.0);
    o = vec4(ramp(fC.rgb, l) * g * (1.6 + 1.4*l) * fl, 1.0);
  } else if(ty == 4){
    float r = length(vQ);
    float n = fbm(vQ*2.6 + sd*20.0 + uTime*0.6);
    float g = smoothstep(1.0, 0.05, r + (n - 0.5)*0.7);
    o = vec4(ramp(fC.rgb, l) * g*g * (1.0 + 1.1*l), 1.0);
  } else if(ty == 2 || ty == 5){
    float r = length(vQ);
    float n = fbm(vQ*2.2 + sd*30.0);
    float dn = smoothstep(1.0, 0.1, r + (n - 0.5)*0.95);
    if(dn < 0.01) discard;
    float hot = step(1.0, fC.w);
    vec3 base = fC.rgb;
    vec3 col = base * mix(uAmbG, uAmbS, 0.55);
    col += base * uSunCol * 0.5;
    col += pointLights(vec3(vW, 0.0), vec3(0.0, 0.0, 1.0), base*1.8, 0.0, 8.0)*0.45;
    col += vec3(1.0, 0.42, 0.1) * hot * pow(l, 3.0) * 1.5 * smoothstep(0.8, 0.0, r);
    float a = dn * (ty == 2 ? 0.88 : 0.5) * smoothstep(0.0, 0.25, l) * clamp(l*1.6, 0.0, 1.0);
    o = vec4(col, a);
  } else {
    float bx = max(abs(vQ.x), abs(vQ.y));
    float a = 1.0 - smoothstep(0.78, 1.0, bx);
    if(a < 0.01) discard;
    vec3 n = normalize(vec3(vQ*0.8, 0.7));
    vec3 base = fC.rgb;
    vec3 col = shadeSurface(base, n, vec3(vW, 0.0), ty == 6 ? 0.9 : 0.4, 0.6);
    float hot = step(1.0, fC.w);
    col += vec3(1.0, 0.4, 0.08) * hot * smoothstep(0.6, 1.0, l) * 2.0;
    o = vec4(col, a);
  }
}
`;

// ---------------------------------------------------------------------------------------------
// Bloom (dual Kawase style) + composite
// ---------------------------------------------------------------------------------------------
export const BLOOM_DOWN_FS = H + `
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uPre;     // 1 = apply threshold
uniform float uThresh, uKnee;
vec3 pre(vec3 c){
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThresh + uKnee, 0.0, 2.0*uKnee);
  soft = soft*soft/(4.0*uKnee + 1e-4);
  float k = max(soft, br - uThresh)/max(br, 1e-4);
  return c * max(k, 0.0);
}
void main(){
  vec2 t = uTexel;
  vec3 a = texture(uTex, vUv + vec2(-t.x, -t.y)).rgb;
  vec3 b = texture(uTex, vUv + vec2( t.x, -t.y)).rgb;
  vec3 c = texture(uTex, vUv + vec2(-t.x,  t.y)).rgb;
  vec3 d = texture(uTex, vUv + vec2( t.x,  t.y)).rgb;
  vec3 e = texture(uTex, vUv).rgb;
  if(uPre > 0.5){ a = pre(a); b = pre(b); c = pre(c); d = pre(d); e = pre(e); }
  o = vec4((a + b + c + d)*0.125 + e*0.5, 1.0);
}
`;
export const BLOOM_UP_FS = H + `
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uWeight;
void main(){
  vec2 t = uTexel;
  vec3 s = vec3(0.0);
  s += texture(uTex, vUv + vec2(-t.x*2.0, 0.0)).rgb;
  s += texture(uTex, vUv + vec2(-t.x, t.y)).rgb*2.0;
  s += texture(uTex, vUv + vec2(0.0, t.y*2.0)).rgb;
  s += texture(uTex, vUv + vec2(t.x, t.y)).rgb*2.0;
  s += texture(uTex, vUv + vec2(t.x*2.0, 0.0)).rgb;
  s += texture(uTex, vUv + vec2(t.x, -t.y)).rgb*2.0;
  s += texture(uTex, vUv + vec2(0.0, -t.y*2.0)).rgb;
  s += texture(uTex, vUv + vec2(-t.x, -t.y)).rgb*2.0;
  o = vec4(s/12.0*uWeight, 1.0);
}
`;

export const COMPOSITE_FS = H + `
in vec2 vUv;
out vec4 o;
uniform sampler2D uScene, uBloom, uBloom1;
uniform vec2 uRes;
uniform float uTime, uExposure, uBloomAmt, uCA, uVig, uGrain, uHurt, uOD, uRay, uFlash;
uniform vec2 uSun;
uniform vec4 uShock[8];
uniform int uNS;
uniform vec3 uGradeLift, uGradeGain;

float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }

vec2 distortUV(vec2 uv){
  float asp = uRes.x/uRes.y;
  vec2 off = vec2(0.0);
  for(int i=0;i<8;i++){
    if(i >= uNS) break;
    vec2 c = uShock[i].xy;
    float r = uShock[i].z;
    float s = uShock[i].w;
    vec2 dv = (uv - c)*vec2(asp, 1.0);
    float d = length(dv);
    float w = 0.012 + r*0.10;
    float ring = exp(-pow((d - r)/w, 2.0));
    off += normalize(dv + 1e-5)/vec2(asp, 1.0) * ring * s;
  }
  return uv + off;
}
vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x*(a*x + b))/(x*(c*x + d) + e), 0.0, 1.0);
}
void main(){
  vec2 uv = distortUV(vUv);
  vec2 cdir = (uv - 0.5);
  float ca = uCA*(0.4 + dot(cdir, cdir)*3.0);
  vec3 col;
  col.r = texture(uScene, uv + cdir*ca).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - cdir*ca).b;

  vec3 bl = texture(uBloom, uv).rgb;
  col += bl * uBloomAmt;

  // god rays from the sun / moon position
  if(uRay > 0.001){
    vec2 dir = (uSun - uv)/24.0;
    vec2 p = uv;
    vec3 acc = vec3(0.0);
    float w = 1.0;
    for(int i=0;i<24;i++){
      p += dir*0.7;
      acc += texture(uBloom1, p).rgb * w;
      w *= 0.93;
    }
    col += acc * (uRay/24.0);
  }
  col *= uExposure;
  col += uFlash*vec3(1.0, 0.85, 0.7);
  // overdrive: cool edge tint + desaturate slightly
  float vd = length(cdir*vec2(uRes.x/uRes.y, 1.0));
  if(uOD > 0.001){
    float l0 = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(l0)*vec3(0.75, 0.95, 1.3), uOD*0.28);
    col += vec3(0.0, 0.25, 0.5) * smoothstep(0.35, 0.95, vd) * uOD * 0.6;
  }
  col = aces(col*0.95);
  // split-tone grade
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col*uGradeLift*1.1, col*uGradeGain, smoothstep(0.1, 0.8, lum));
  float sat = 1.12;
  col = mix(vec3(lum), col, sat);
  col = pow(col, vec3(1.0/2.2));
  // vignette
  float vig = smoothstep(0.35, 1.05, vd*uVig);
  col *= 1.0 - vig*0.62;
  col += vec3(0.7, 0.02, 0.05) * uHurt * smoothstep(0.3, 1.0, vd) * 0.9;
  col += (hash21(vUv*uRes + fract(uTime)*91.7) - 0.5) * uGrain;
  o = vec4(col, 1.0);
}
`;
