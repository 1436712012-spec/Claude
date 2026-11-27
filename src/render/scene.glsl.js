// The ray-marched Library. One fragment shader draws the infinite lattice of
// hexagonal galleries: shelves of books with glyph spines, the air shaft and its
// railing, hallways with closets and a mirror, a spiral stair with an open eye
// strung with lamps, and the "spherical fruits" that light every gallery.

import { glslConstants } from '../world/geometry.js';

export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

export function sceneFrag() {
  return `#version 300 es
precision highp float;
precision highp int;
${glslConstants()}

uniform vec2 uRes;
uniform vec2 uJitter;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform float uTan;
uniform float uTime;
uniform uvec3 uSeed;
uniform int uLib;
uniform int uSteps;
uniform int uShadows;
uniform int uMirror;
uniform sampler2D uGlyphs;
uniform ivec4 uHover;      // cx, cy, wall, shelfB*64+slot   (wall<0: none)
uniform ivec4 uHide;       // the book that left its shelf
uniform vec3 uSelC;        // flying book: centre
uniform mat3 uSelR;        // flying book: world->local rotation
uniform vec3 uSelH;        // flying book: half extents (x<0: none)
uniform float uSelSeedF;
uniform vec4 uMark;        // target book glow: cx, cy, wall, shelfB*64+slot
uniform float uMarkGlow;
uniform float uExposure;
uniform int uDebug;

in vec2 vUv;
out vec4 oColor;

#define MAT_STONE 0
#define MAT_FLOOR 1
#define MAT_CEIL 2
#define MAT_WOOD 3
#define MAT_BOOK 4
#define MAT_LAMP 5
#define MAT_MIRROR 6
#define MAT_BRASS 7
#define MAT_STEP 8
#define MAT_DARK 9

const float PI = 3.14159265;

uint hashu(uint x){ x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
float rnd(uint s, uint k){ return float(hashu(s + k)) * (1.0/4294967296.0); }
uint cellSeed(int cx, int cy){
  uint a = hashu(uSeed.x + uint(cx + 0x40000000) - 0x40000000u);
  uint b = hashu(a ^ (uSeed.y + uint(cy + 0x40000000) - 0x40000000u));
  return hashu(b ^ uSeed.z);
}
uint bookSeed(uint cs, int wall, int shelfB, int slot){
  uint k = (uint(wall*5 + shelfB + 1) * 0x9e3779b1u) ^ (uint(slot + 1) * 0x85ebca77u);
  return hashu(cs ^ k);
}
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float noise3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x),mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x),mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y),f.z);
}

float hexApo(vec2 p){ p = abs(p); return max(p.x, dot(p, vec2(0.5, 0.8660254))); }
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p)-b; return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0); }
float sdRBox(vec3 p, vec3 b, float r){ vec3 q = abs(p)-b+r; return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0) - r; }

// ------------------------------------------------------------------ material output
int gMat; uint gSeed; vec4 gInfo; int gCellX; int gCellY; int gWall; int gSlotId;

// shelf-wall frame selection without atan: the most-facing of the 4 shelf normals
// returns wall index (0..3) or -1 for the free sides, and the frame (u, v)
int wallFrame(vec2 p, out float u, out float v, out vec2 n){
  float ax = p.x, az = abs(p.y);
  float d0 = ax, d1 = 0.5*ax + 0.8660254*az, d2 = -0.5*ax + 0.8660254*az, d3 = -ax;
  float m = max(max(d0,d1),max(d2,d3));
  int w = -1;
  if (m == d1) { n = vec2(0.5, 0.8660254); w = 0; }
  else if (m == d2) { n = vec2(-0.5, 0.8660254); w = 1; }
  else { n = vec2(sign(p.x+1e-6), 0.0); }
  if (p.y < 0.0) { n.y = -n.y; if (w==0) w = 3; else if (w==1) w = 2; }
  vec2 t = vec2(-n.y, n.x);
  u = dot(p, t); v = dot(p, n) - A;
  return w;
}

// one book of slot s on shelf jb; returns distance, fills params
float bookDist(vec3 q, uint cs, int wall, int jb, int s, int cx, int cy, out uint seed, out vec4 info){
  seed = bookSeed(cs, wall, jb, s);
  float tf = 0.8 + 0.17*rnd(seed,1u);
  float h = (0.6 + 0.33*rnd(seed,2u)) * (HS - BT - 0.03);
  float vf = 0.008 + 0.045*rnd(seed,3u);
  float jit = (rnd(seed,4u)-0.5)*SW*(1.0-tf)*0.9;
  float uc = -W2 + (float(s)+0.5)*SW + jit;
  float y0 = Y0 + float(jb)*HS;
  float vb = D - 0.02;
  vec3 c = vec3(uc, y0 + h*0.5, (vf+vb)*0.5);
  vec3 hb = vec3(SW*tf*0.5, h*0.5, (vb-vf)*0.5);
  info = vec4(q.x - uc, (q.y - y0)/h, hb.x, h);
  if (uHide.z == wall && uHide.x == cx && uHide.y == cy && uHide.w == jb*64+s) return 1e3;
  return sdRBox(q - c, hb, 0.007);
}

float map(vec3 p, bool mat){
  float cxf = floor((p.x + PX*0.5)/PX);
  float lx = p.x - cxf*PX;
  float cyf = floor(p.y / HF);
  float ly = p.y - cyf*HF;
  float z = p.z;
  int cx = int(cxf), cy = int(cyf);
  float ax = abs(lx);
  vec2 pxz = vec2(lx, z);
  float hx = hexApo(pxz);

  // ---- air (negative inside)
  float room = max(hx - A, max(-ly, ly - HC));
  float air = room;
  float u, v; vec2 n;
  int wall = wallFrame(pxz, u, v, n);
  if (wall >= 0) {
    float rec = sdBox(vec3(u, ly - (Y0 + Y1 - BT)*0.5, v - (D - 0.5)*0.5), vec3(W2, (Y1 - BT - Y0)*0.5, (D + 0.5)*0.5));
    air = min(air, rec);
  }
  air = min(air, hx - AS);
  float hc = (A - 0.5 + PX*0.5 + 1.0)*0.5, hh = (PX*0.5 + 1.0 - (A - 0.5))*0.5;
  air = min(air, sdBox(vec3(ax - hc, ly - HH*0.5, z), vec3(hh, HH*0.5, HW)));
  float sgn = lx >= 0.0 ? 1.0 : -1.0;
  float wx = lx - sgn*PX*0.5;
  vec2 wc = vec2(wx, z - ZW);
  float wr = length(wc);
  air = min(air, max(wr - RW, HW - z));
  // doorway into the well: overlaps hallway and well so the union has no seam
  air = min(air, max(max(wr - RW, HW - 0.3 - z), max(-ly, ly - HH)));
  // closets (east end of each gallery only)
  air = min(air, sdBox(vec3(lx - (A + 0.55), ly - 1.0, abs(z) - (HW + 0.40)), vec3(0.32, 1.0, 0.44)));

  float d = -air;
  int m = MAT_STONE;
  if (mat) {
    if (wall >= 0 && v > -0.01 && v < D + 0.05 && ly > Y0 - 0.02 && abs(u) < W2 + 0.02) m = MAT_WOOD;
    if (ax > A + 0.1 && ax < A + 1.0 && abs(z) > HW + 0.05 && lx > 0.0) m = MAT_DARK;
  }

  // ---- shelves and books
  if (wall >= 0 && v > -0.08) {
    uint cs = cellSeed(cx, cy);
    float yb = ly - Y0;
    float bi = clamp(floor(yb/HS + 0.5), 1.0, 4.0);
    float board = sdBox(vec3(u, ly - (Y0 + bi*HS - BT*0.5), v - D*0.5 + 0.01), vec3(W2, BT*0.5, D*0.5 + 0.01));
    if (board < d) { d = board; m = MAT_WOOD; }
    // vertical stiles at the ends
    float stile = sdBox(vec3(abs(u) - W2, ly - Y1*0.5, v - D*0.5), vec3(0.025, Y1*0.5, D*0.5));
    if (stile < d) { d = stile; m = MAT_WOOD; }
    int jb = int(clamp(floor(yb/HS), 0.0, 4.0));
    float sf = (u + W2)/SW;
    int s0 = int(clamp(floor(sf), 0.0, 31.0));
    int s1 = clamp(s0 + (fract(sf) > 0.5 ? 1 : -1), 0, 31);
    vec3 q = vec3(u, ly, v);
    uint sd; vec4 inf;
    float b0 = bookDist(q, cs, wall, jb, s0, cx, cy, sd, inf);
    if (b0 < d) { d = b0; m = MAT_BOOK; gSeed = sd; gInfo = inf; gSlotId = jb*64+s0; }
    float b1 = bookDist(q, cs, wall, jb, s1, cx, cy, sd, inf);
    if (b1 < d) { d = b1; m = MAT_BOOK; gSeed = sd; gInfo = inf; gSlotId = jb*64+s1; }
    gCellX = cx; gCellY = cy; gWall = wall;
  } else if (wall >= 0) {
    d = min(d, -v - 0.05);
  }

  // ---- railing around the shaft (entirely outside the shaft prism)
  if (ly < RAIL_H + 0.2 && hx < AS + 0.4) {
    float rail = length(vec2(hx - (AS + 0.07), ly - RAIL_H)) - 0.035;
    float curb = sdBox(vec3(hx - (AS + 0.07), ly - 0.05, 0.0), vec3(0.05, 0.05, 1e3));
    // balusters: repeat along each of the six edges
    float au, av; vec2 nn;
    vec2 pp = pxz;
    float ang = atan(pp.y, pp.x);
    float sec = floor(ang/(PI/3.0) + 0.5);
    float ca = sec*PI/3.0;
    vec2 en = vec2(cos(ca), sin(ca));
    vec2 et = vec2(-en.y, en.x);
    au = dot(pp, et); av = dot(pp, en) - (AS + 0.07);
    float halfE = AS / 1.7320508;
    float sp = 0.19;
    float ur = au - sp*clamp(floor(au/sp + 0.5), -floor(halfE/sp), floor(halfE/sp));
    float post = max(length(vec2(ur, av)) - 0.017, abs(ly - RAIL_H*0.5) - RAIL_H*0.5);
    float r = min(min(rail, curb), post);
    if (r < d) { d = r; m = MAT_BRASS; if (rail > min(curb,post)) m = MAT_WOOD; }
  }

  // ---- lamps hanging over the walkway, placed transversally
  {
    vec3 lp = vec3(lx, ly - LAMP_Y, abs(z) - LAMP_Z);
    float lamp = length(lp) - LAMP_R;
    if (lamp < d) { d = lamp; m = MAT_LAMP; }
    float rod = max(length(lp.xz) - 0.012, abs(ly - (LAMP_Y + HC)*0.5) - (HC - LAMP_Y)*0.5);
    float cap = sdBox(vec3(lp.x, ly - HC + 0.03, lp.z), vec3(0.09, 0.03, 0.09));
    float rr = min(rod, cap);
    if (rr < d) { d = rr; m = MAT_BRASS; }
  }

  // ---- mirror in the hallway (on the -z wall, centred on the cell boundary)
  if (ax > A + 1.0 && z < -HW + 0.2) {
    float fr = sdBox(vec3(wx, ly - 1.2, z + HW), vec3(0.62, 0.9, 0.035));
    float glass = sdBox(vec3(wx, ly - 1.2, z + HW - 0.02), vec3(0.54, 0.82, 0.02));
    if (fr < d) { d = fr; m = MAT_WOOD; }
    if (glass < d) { d = glass; m = MAT_MIRROR; }
  }

  // ---- spiral stair in the well
  if (wr < RW + 0.3 && z > HW - 0.6) {
    float th = atan(wc.y, wc.x);
    float dth = 2.0*PI/NSTEP;
    float rel = th - (-PI*0.5);
    float k0 = floor(rel/dth + 0.5);
    for (int i = -1; i <= 1; i++) {
      float k = k0 + float(i);
      float ca = -PI*0.5 + k*dth;
      vec2 sdir = vec2(cos(ca), sin(ca));
      vec2 st = vec2(-sdir.y, sdir.x);
      vec2 lc = vec2(dot(wc, sdir), dot(wc, st));
      float top = mod(k, NSTEP)*RISE;
      float yy = ly - top;
      yy -= HF*floor(yy/HF + 0.5);
      float wedge = max(abs(lc.y) - lc.x*tan(dth*0.5)*1.04, max(REYE - lc.x, lc.x - RW + 0.02));
      float stp = max(max(wedge, abs(yy + 0.045) - 0.045), HW - z);
      if (stp < d) { d = stp; m = MAT_STEP; }
      // a slender post at the eye of every step
      vec2 pc = lc - vec2(REYE + 0.04, 0.0);
      float post = max(length(pc) - 0.012, abs(yy - 0.47) - 0.47);
      if (post < d) { d = post; m = MAT_BRASS; }
    }
    // the infinite cable through the eye, with a lamp on every floor
    float cable = length(wc) - 0.006;
    if (cable < d) { d = cable; m = MAT_BRASS; }
    float wl = length(vec3(wc.x, ly - WELL_LAMP_Y, wc.y)) - 0.11;
    if (wl < d) { d = wl; m = MAT_LAMP; }
  }

  // ---- the book in flight
  if (uSelH.x > 0.0) {
    vec3 lq = uSelR * (p - uSelC);
    float sb = sdRBox(lq, uSelH, 0.007);
    if (sb < d) { d = sb; m = MAT_BOOK; gSeed = uint(uSelSeedF); gInfo = vec4(lq.x, (lq.y + uSelH.y)/(2.0*uSelH.y), uSelH.x, 2.0*uSelH.y); gCellX = -99999; }
  }

  if (mat) { gMat = m; if (m != MAT_BOOK) gCellX = -99999; }
  return d;
}

vec3 calcNormal(vec3 p, float t){
  float e = 0.0006 + t*0.0004;
  vec2 k = vec2(1,-1);
  return normalize(k.xyy*map(p + k.xyy*e,false) + k.yyx*map(p + k.yyx*e,false) + k.yxy*map(p + k.yxy*e,false) + k.xxx*map(p + k.xxx*e,false));
}

float march(vec3 ro, vec3 rd, int steps, float tmax){
  float t = 0.0;
  for (int i = 0; i < 400; i++){
    if (i >= steps) break;
    float d = map(ro + rd*t, false);
    if (d < 0.0006*t + 0.0004) return t;
    t += d*0.92;
    if (t > tmax) break;
  }
  return -1.0;
}

float softShadow(vec3 ro, vec3 rd, float tmax){
  float res = 1.0, t = 0.06;
  for (int i = 0; i < 32; i++){
    float h = map(ro + rd*t, false);
    res = min(res, 40.0*h/t);
    t += clamp(h, 0.02, 0.5);
    if (res < 0.01 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}

float calcAO(vec3 p, vec3 n){
  float occ = 0.0, s = 1.0;
  for (int i = 1; i <= 5; i++){
    float h = 0.02 + 0.07*float(i);
    occ += (h - map(p + n*h, false))*s;
    s *= 0.72;
  }
  return clamp(1.0 - 2.2*occ, 0.0, 1.0);
}

// ------------------------------------------------------------------ materials
vec3 leather(uint seed){
  float r = rnd(seed, 5u);
  vec3 c;
  if (uLib == 0) {
    if (r < 0.18) c = vec3(0.36,0.07,0.05);       // oxblood
    else if (r < 0.32) c = vec3(0.22,0.11,0.05);  // cordovan
    else if (r < 0.45) c = vec3(0.07,0.16,0.10);  // bottle green
    else if (r < 0.56) c = vec3(0.06,0.08,0.18);  // navy
    else if (r < 0.68) c = vec3(0.45,0.29,0.12);  // tan calf
    else if (r < 0.78) c = vec3(0.05,0.04,0.035); // black morocco
    else if (r < 0.88) c = vec3(0.38,0.30,0.18);  // vellum
    else c = vec3(0.30,0.16,0.09);
  } else {
    if (r < 0.26) c = vec3(0.07,0.10,0.24);       // indigo cloth
    else if (r < 0.40) c = vec3(0.16,0.24,0.33);  // pale blue
    else if (r < 0.54) c = vec3(0.42,0.08,0.05);  // cinnabar
    else if (r < 0.70) c = vec3(0.46,0.36,0.20);  // ochre paper
    else if (r < 0.84) c = vec3(0.12,0.11,0.10);  // ink grey
    else c = vec3(0.26,0.28,0.18);                // tea green
  }
  float v = 0.75 + 0.5*rnd(seed, 6u);
  return c*v;
}

float glyph(int gi, vec2 uv, float lod){
  vec2 cell = vec2(float(gi % 16), float(gi / 16));
  vec2 tuv = (cell + clamp(uv, 0.02, 0.98)) / 16.0;
  return textureLod(uGlyphs, tuv, lod).r;
}

// spine decoration. returns albedo, writes metal mask and roughness
vec3 spine(uint seed, vec4 info, vec3 lp, out float metal, out float rough, float t){
  vec3 base = leather(seed);
  metal = 0.0; rough = 0.55;
  float su = info.x / info.z;          // -1..1 across the spine
  float sy = info.y;                   // 0..1 up the spine
  float hm = info.w;                   // book height in m
  float wm = info.z * 2.0;             // width in m
  float edge = smoothstep(0.75, 1.0, abs(su));
  base *= 1.0 - 0.45*edge;
  float lod = clamp(log2(max(1.0, t * uTan * 2.0 / uRes.y * 64.0 / (wm*0.6))), 0.0, 6.0);
  float wear = noise3(lp*38.0 + float(seed & 255u));
  base *= 0.82 + 0.3*wear;
  vec3 gold = vec3(0.85, 0.62, 0.28);
  vec3 col = base;
  if (uLib == 0) {
    // raised bands
    int nb = 2 + int(rnd(seed,7u)*3.0);
    for (int i = 0; i < 4; i++) {
      if (i >= nb) break;
      float by = 0.12 + 0.76*float(i+1)/float(nb+1);
      float b = abs(sy - by)*hm;
      if (b < 0.006) { col = mix(col, gold, 0.85); metal = 1.0; rough = 0.3; }
      else if (b < 0.011) col *= 0.55;
    }
    // title label
    float ly0 = 0.62, ly1 = 0.86;
    if (sy > ly0 && sy < ly1 && abs(su) < 0.78) {
      if (rnd(seed, 8u) < 0.45) col = mix(col, vec3(0.08,0.05,0.03), 0.8);
      int ng = 3 + int(rnd(seed,9u)*3.0);
      float gh = (ly1 - ly0)*hm / float(ng);
      float gs = min(gh, wm*0.75);
      float gy = (ly1*hm - sy*hm) / gh;
      int row = int(floor(gy));
      vec2 guv = vec2((su*info.z)/gs + 0.5, fract(gy)*gh/gs - (gh/gs - 1.0)*0.5);
      if (row >= 0 && row < ng && guv.x > 0.0 && guv.x < 1.0 && guv.y > 0.0 && guv.y < 1.0) {
        int gi = int(hashu(seed + uint(row)*7919u) % 29u);
        float a = glyph(gi, vec2(guv.x, 1.0 - guv.y), lod);
        col = mix(col, gold, a); metal = max(metal, a); rough = mix(rough, 0.28, a);
      }
    }
  } else {
    // paper title strip (题签) with ink characters, and two thread lines
    float sx0 = 0.55;
    if (abs(su) < sx0 && sy > 0.3 && sy < 0.92) {
      col = vec3(0.80,0.74,0.60)*(0.85+0.2*wear);
      rough = 0.85;
      int ng = 3 + int(rnd(seed,9u)*4.0);
      float sh = 0.58*hm;
      float gh = sh / float(ng);
      float gs = min(gh, wm*sx0*0.95);
      float gy = (0.9*hm - sy*hm) / gh;
      int row = int(floor(gy));
      vec2 guv = vec2((su*info.z)/gs + 0.5, fract(gy)*gh/gs - (gh/gs - 1.0)*0.5);
      if (row >= 0 && row < ng && guv.x > 0.0 && guv.x < 1.0 && guv.y > 0.0 && guv.y < 1.0) {
        int gi = 32 + int(hashu(seed + uint(row)*7919u) % 224u);
        float a = glyph(gi, vec2(guv.x, 1.0 - guv.y), lod);
        col = mix(col, vec3(0.05,0.04,0.035), a*0.92);
      }
    }
    for (int i = 0; i < 2; i++) {
      float ty = i == 0 ? 0.08 : 0.95;
      if (abs(sy - ty)*hm < 0.003) col = mix(col, vec3(0.75,0.7,0.6), 0.6);
    }
  }
  return col;
}

vec3 hexTiles(vec2 p){
  // a small hexagonal floor tiling with grout
  vec2 s = vec2(1.0, 1.7320508) * 0.36;
  vec2 h = s*0.5;
  vec2 a = mod(p, s) - h;
  vec2 b = mod(p - h, s) - h;
  vec2 g = dot(a,a) < dot(b,b) ? a : b;
  vec2 id = p - g;
  float e = 0.18 - hexApo(g);
  float grout = smoothstep(0.0, 0.012, e);
  float tone = hash13(vec3(floor(id*10.0), 3.0));
  return vec3(grout, tone, e);
}

vec3 lampEmission(){ return uLib == 0 ? vec3(1.0, 0.66, 0.34) : vec3(1.0, 0.56, 0.30); }

vec3 shadeLight(vec3 p, vec3 n, vec3 rd, vec3 alb, float metal, float rough, vec3 lp, float power, bool shadows){
  vec3 l = lp - p;
  float d2 = dot(l, l);
  float dist = sqrt(d2);
  l /= dist;
  float ndl = max(dot(n, l), 0.0);
  if (ndl <= 0.0) return vec3(0);
  float sh = shadows ? softShadow(p + n*0.012, l, dist - LAMP_R - 0.25) : 1.0;
  vec3 hv = normalize(l - rd);
  float spow = mix(80.0, 6.0, rough);
  float spec = pow(max(dot(n, hv), 0.0), spow) * (spow + 2.0) / 8.0;
  vec3 F = mix(vec3(0.04), alb, metal);
  vec3 diff = alb * (1.0 - metal) / PI;
  float att = power / (d2 + 0.35);
  return (diff + F*spec*0.25) * ndl * att * sh * lampEmission();
}

vec3 shade(vec3 ro, vec3 rd, float t, bool allowShadow, out bool isMirror, out vec3 mN){
  vec3 p = ro + rd*t;
  map(p, true);
  int mt = gMat;
  uint bseed = gSeed;
  vec4 binfo = gInfo;
  int bcx = gCellX, bcy = gCellY, bwall = gWall, bslot = gSlotId;
  vec3 n = calcNormal(p, t);
  mN = n;
  if (mt == MAT_STONE) { if (n.y > 0.8) mt = MAT_FLOOR; else if (n.y < -0.8) mt = MAT_CEIL; }
  isMirror = mt == MAT_MIRROR;

  float cxf = floor((p.x + PX*0.5)/PX);
  float lx = p.x - cxf*PX;
  float cyf = floor(p.y / HF);
  float ly = p.y - cyf*HF;
  vec3 lpos = vec3(lx, ly, p.z);
  vec3 alb = vec3(0.5); float metal = 0.0; float rough = 0.8; vec3 emit = vec3(0);
  float nz = noise3(p*3.1);
  float nz2 = noise3(p*17.0);

  if (mt == MAT_STONE) { alb = vec3(0.34,0.29,0.24)*(0.75 + 0.35*nz + 0.1*nz2); rough = 0.9; }
  else if (mt == MAT_FLOOR) {
    vec3 ht = hexTiles(p.xz);
    alb = mix(vec3(0.05,0.04,0.035), vec3(0.20,0.15,0.11)*(0.7+0.6*ht.y), ht.x) * (0.85+0.3*nz);
    rough = mix(0.9, 0.32, ht.x);
  }
  else if (mt == MAT_CEIL) { alb = vec3(0.16,0.12,0.09)*(0.7+0.5*nz); rough = 0.95; }
  else if (mt == MAT_WOOD) {
    float grain = noise3(vec3(p.x*2.0+p.z*2.0, p.y*60.0, p.z*2.0 - p.x));
    alb = vec3(0.17,0.085,0.04)*(0.65 + 0.55*grain + 0.2*nz2); rough = 0.45;
  }
  else if (mt == MAT_DARK) { alb = vec3(0.05,0.04,0.035); rough = 0.95; }
  else if (mt == MAT_BRASS) { alb = vec3(0.55,0.40,0.20)*(0.7+0.4*nz2); metal = 0.85; rough = 0.35; }
  else if (mt == MAT_STEP) { alb = vec3(0.30,0.26,0.22)*(0.7+0.4*nz); rough = 0.75; }
  else if (mt == MAT_LAMP) {
    float f = pow(clamp(dot(n, -rd), 0.0, 1.0), 0.6);
    emit = lampEmission() * (7.0 + 6.0*f);
    alb = vec3(0);
  }
  else if (mt == MAT_MIRROR) { alb = vec3(0.02); rough = 0.1; }
  else if (mt == MAT_BOOK) {
    // which face are we on? spine faces the room: n ≈ -wall normal
    vec2 wn = vec2(0.0);
    if (bcx != -99999) { float ang = (bwall==0?60.0:bwall==1?120.0:bwall==2?240.0:300.0)*PI/180.0; wn = vec2(cos(ang), sin(ang)); }
    float spineFace = bcx != -99999 ? -dot(n.xz, wn) : -dot(n, uSelR[2]);
    if (bcx == -99999 && uSelH.x > 0.0) {
      vec3 lq = uSelR * (p - uSelC);
      spineFace = abs(lq.z + uSelH.z) < 0.01 ? 1.0 : 0.0;
    }
    if (spineFace > 0.6) {
      alb = spine(bseed, binfo, p, metal, rough, t);
    } else if (abs(n.y) > 0.6) {
      // top or bottom: page block inside the boards
      float cov = smoothstep(0.82, 0.9, abs(binfo.x)/binfo.z);
      alb = mix(vec3(0.62,0.55,0.42)*(0.8+0.3*nz2), leather(bseed)*0.8, cov);
      rough = 0.9;
    } else {
      alb = leather(bseed)*0.85; rough = 0.6;
    }
    // hover / mark glow (verdigris)
    if (bcx == uHover.x && bcy == uHover.y && bwall == uHover.z && bslot == uHover.w) {
      emit += vec3(0.25, 0.75, 0.62) * (0.35 + 0.65*pow(1.0 - abs(dot(n, rd)), 2.0)) * 0.9;
    }
    if (uMarkGlow > 0.0 && float(bcx) == uMark.x && float(bcy) == uMark.y && float(bwall) == uMark.z && float(bslot) == uMark.w) {
      emit += vec3(0.30, 0.95, 0.78) * uMarkGlow * (0.6 + 0.4*sin(uTime*5.0));
    }
  }

  vec3 col = emit;
  if (mt != MAT_LAMP) {
    float ao = calcAO(p, n);
    bool sh = allowShadow && uShadows == 1;
    // the two lamps of this gallery
    vec3 base = vec3(cxf*PX, cyf*HF, 0.0);
    col += shadeLight(p, n, rd, alb, metal, rough, base + vec3(0.0, LAMP_Y, LAMP_Z), 9.0, sh);
    col += shadeLight(p, n, rd, alb, metal, rough, base + vec3(0.0, LAMP_Y, -LAMP_Z), 9.0, sh);
    // the stair lamps nearest to this point (hallway and well)
    if (abs(lx) > A - 1.5) {
      float sgn = lx >= 0.0 ? 1.0 : -1.0;
      vec3 wl = base + vec3(sgn*PX*0.5, WELL_LAMP_Y, ZW);
      col += shadeLight(p, n, rd, alb, metal, rough, wl, 2.2, false) * (sh ? softShadow(p + n*0.012, normalize(wl - p), length(wl-p) - 0.15) : 1.0);
      col += shadeLight(p, n, rd, alb, metal, rough, wl + vec3(0.0, -HF, 0.0), 1.4, false) * clamp(1.0 - abs(lx - sgn*PX*0.5)/2.0, 0.0, 1.0);
    }
    // warm bounce from the lit floor + faint ambient
    float up = 0.5 + 0.5*n.y;
    col += alb * ao * (vec3(0.040,0.028,0.018) * (1.0 - up) * 1.6 + vec3(0.012,0.010,0.009) * up);
  }
  return col;
}

// in-scattered glow around the lamps nearest to the camera (analytic)
float glowLine(vec3 ro, vec3 rd, float tmax, vec3 lp){
  vec3 w = lp - ro;
  float b = dot(w, rd);
  float h2 = max(dot(w, w) - b*b, 1e-4);
  float h = sqrt(h2);
  return (atan((tmax - b)/h) - atan(-b/h)) / h;
}

void main(){
  vec2 frag = gl_FragCoord.xy + uJitter;
  vec2 sc = (2.0*frag - uRes) / uRes.y;
  vec3 rd = normalize(uCamRot * vec3(sc.x*uTan, sc.y*uTan, 1.0));
  vec3 ro = uCamPos;

  float tmax = 160.0;
  float t = march(ro, rd, uSteps, tmax);
  vec3 col = vec3(0);
  float tt = t < 0.0 ? tmax : t;
  vec3 fogCol = uLib == 0 ? vec3(0.0045, 0.0028, 0.0018) : vec3(0.005, 0.0027, 0.002);
  if (uDebug == 1) {
    if (t < 0.0) { oColor = vec4(0.0,0.0,0.2,1.0); return; }
    vec3 p = ro + rd*t; map(p, true); vec3 n = calcNormal(p, t);
    vec3 mc[10] = vec3[10](vec3(0.6),vec3(0.2,0.6,0.2),vec3(0.2,0.2,0.6),vec3(0.6,0.35,0.1),vec3(0.8,0.1,0.1),vec3(1.0,1.0,0.3),vec3(0.3,0.9,0.9),vec3(0.9,0.6,0.1),vec3(0.9,0.2,0.9),vec3(0.1));
    oColor = vec4(mc[gMat] * (0.35 + 0.65*abs(dot(n, normalize(vec3(0.3,0.8,0.5))))) * exp(-t*0.03), 1.0); return;
  }
  if (t > 0.0) {
    bool mir; vec3 n;
    col = shade(ro, rd, t, true, mir, n);
    if (mir && uMirror == 1) {
      vec3 p = ro + rd*t;
      vec3 r = reflect(rd, n);
      float t2 = march(p + n*0.01, r, uSteps/2 + 20, 60.0);
      vec3 rc = fogCol;
      if (t2 > 0.0) { bool m2; vec3 n2; rc = shade(p + n*0.01, r, t2, false, m2, n2); rc = mix(fogCol, rc, exp(-t2*0.045)); }
      // aged silvering: dimmer, faintly green, foxed at the edges
      float fox = noise3(p*24.0);
      col = rc * vec3(0.78, 0.82, 0.76) * (0.75 + 0.25*fox) + col;
    }
  }
  float fog = exp(-tt*0.042);
  col = mix(fogCol, col, fog);

  // lamp halos: own column of floors and the neighbouring galleries
  float cxf = floor((ro.x + PX*0.5)/PX);
  float cyf = floor(ro.y / HF);
  float g = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -2; j <= 2; j++) {
    vec3 base = vec3((cxf + float(i))*PX, (cyf + float(j))*HF, 0.0);
    g += glowLine(ro, rd, tt, base + vec3(0.0, LAMP_Y, LAMP_Z));
    g += glowLine(ro, rd, tt, base + vec3(0.0, LAMP_Y, -LAMP_Z));
  }
  col += lampEmission() * g * 0.0016;

  oColor = vec4(col * uExposure, 1.0);
}
`;
}
