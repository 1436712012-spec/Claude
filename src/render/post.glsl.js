// Post-processing: progressive accumulation while the camera rests, a dual-filter
// bloom chain, and the final grade (ACES, vignette, grain, travel streaks).

export const ACCUM = `#version 300 es
precision highp float;
uniform sampler2D uCur; uniform sampler2D uPrev; uniform float uW;
in vec2 vUv; out vec4 o;
void main(){ o = mix(texture(uPrev, vUv), texture(uCur, vUv), uW); }`;

export const DOWN = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uPrefilter;
in vec2 vUv; out vec4 o;
vec3 pre(vec3 c){ float b = max(c.r, max(c.g, c.b)); float k = max(b - 0.9, 0.0); k = k*k/(b*0.6+1e-4); return c * max(k, b - 1.6)/max(b, 1e-4); }
void main(){
  vec2 t = uTexel;
  vec3 c = texture(uSrc, vUv).rgb*4.0;
  c += texture(uSrc, vUv + vec2(-t.x,-t.y)).rgb + texture(uSrc, vUv + vec2(t.x,-t.y)).rgb;
  c += texture(uSrc, vUv + vec2(-t.x, t.y)).rgb + texture(uSrc, vUv + vec2(t.x, t.y)).rgb;
  c /= 8.0;
  if (uPrefilter > 0.5) c = pre(c);
  o = vec4(c, 1.0);
}`;

export const UP = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uTexel;
in vec2 vUv; out vec4 o;
void main(){
  vec2 t = uTexel;
  vec3 c = texture(uSrc, vUv + vec2(-2.0*t.x, 0.0)).rgb + texture(uSrc, vUv + vec2(2.0*t.x, 0.0)).rgb;
  c += texture(uSrc, vUv + vec2(0.0, -2.0*t.y)).rgb + texture(uSrc, vUv + vec2(0.0, 2.0*t.y)).rgb;
  c += (texture(uSrc, vUv + vec2(-t.x, t.y)).rgb + texture(uSrc, vUv + vec2(t.x, t.y)).rgb
      + texture(uSrc, vUv + vec2(-t.x,-t.y)).rgb + texture(uSrc, vUv + vec2(t.x,-t.y)).rgb) * 2.0;
  o = vec4(c/12.0, 1.0);
}`;

export const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uScene; uniform sampler2D uBloom;
uniform vec2 uRes; uniform float uTime; uniform float uWarp; uniform vec2 uWarpC;
uniform float uFall; uniform float uFade; uniform vec3 uFadeCol; uniform float uBloomK; uniform float uGain;
in vec2 vUv; out vec4 o;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec2 uv = vUv;
  vec3 c;
  if (uWarp > 0.001 || uFall > 0.001) {
    // radial streaks toward the vanishing point (travel) / vertical (falling)
    vec2 dir = uWarp > uFall ? (uv - uWarpC) : vec2(0.0, 1.0)*0.25;
    float amt = max(uWarp, uFall);
    c = vec3(0); float wsum = 0.0;
    for (int i = 0; i < 16; i++) {
      float f = float(i)/15.0;
      float w = 1.0 - f*0.6;
      vec2 s = uv - dir*f*0.22*amt;
      c += (texture(uScene, s).rgb + texture(uBloom, s).rgb*uBloomK)*w; wsum += w;
    }
    c /= wsum;
  } else {
    // a whisper of chromatic aberration toward the corners
    vec2 d = (uv - 0.5)*0.0025;
    c = vec3(texture(uScene, uv + d).r, texture(uScene, uv).g, texture(uScene, uv - d).b);
    c += texture(uBloom, uv).rgb*uBloomK;
  }
  c = aces(c*1.15*uGain);
  // warm split tone
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  c = mix(c, c*vec3(1.04,0.99,0.92), smoothstep(0.0, 0.6, l));
  c = mix(c, c*vec3(0.92,0.96,1.05), 1.0 - smoothstep(0.0, 0.25, l));
  vec2 q = uv - 0.5; q.x *= uRes.x/uRes.y;
  c *= mix(1.0, smoothstep(1.15, 0.25, length(q)), 0.75);
  c = pow(c, vec3(1.0/2.2));
  c += (h12(gl_FragCoord.xy + fract(uTime)*917.0) - 0.5) * 0.035;
  c = mix(c, uFadeCol, uFade);
  o = vec4(c, 1.0);
}`;
