// Replace three.js' global fog so it is measured as horizontal distance from the
// camera's look-at target (the dreamer), not from the lens. The result is a
// "dream bubble": crisp around the child, dissolving into milk-white haze.

import * as THREE from 'three';

export const CAM_OFFSET = new THREE.Vector3(0, 18.5, 12.5);

export function installDreamFog() {
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  const off = `vec2(${(-CAM_OFFSET.x).toFixed(3)}, ${(-CAM_OFFSET.z).toFixed(3)})`;

  C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorld;
#endif`;

  C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vec4 fogWP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fogWP = instanceMatrix * fogWP;
  #endif
  fogWP = modelMatrix * fogWP;
  vFogWorld = fogWP.xyz;
#endif`;

  C.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogWorld;
  uniform float fogNear;
  uniform float fogFar;
#endif`;

  C.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fogD = length( vFogWorld.xz - ( cameraPosition.xz + ${off} ) );
  float fogFactor = smoothstep( fogNear, fogFar, fogD );
  // Tall things reach up out of the dream faster than the floor does.
  fogFactor = clamp( fogFactor + max( vFogWorld.y - 1.6, 0.0 ) * 0.06 * smoothstep( fogNear * 0.6, fogFar, fogD ), 0.0, 1.0 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
}

// Shared GLSL helpers injected into several materials.
export const GLSL_NOISE = /* glsl */ `
float nb_hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float nb_noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = nb_hash(i), b = nb_hash(i+vec2(1,0)), c = nb_hash(i+vec2(0,1)), d = nb_hash(i+vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float nb_fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*nb_noise(p); p*=2.03; a*=0.5; } return s; }
// Water caustics: a few octaves of domain-warped abs-sine interference.
float nb_caustic(vec2 p, float t){
  vec2 q = p;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    q += vec2(sin(q.y*1.7 + t*0.6 + fi*1.3), cos(q.x*1.5 - t*0.5 + fi*2.1)) * 0.45;
    c += 1.0 / (1.0 + 18.0 * abs(sin(q.x + q.y*0.6 + t*0.3 + fi)));
  }
  return c / 3.0;
}
`;
