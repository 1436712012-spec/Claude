export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const saturate = (v) => clamp(v, 0, 1);
export const smoothstep = (a, b, x) => {
  const t = saturate((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapPi = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
export const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));
/** smooth pseudo-noise in [-1,1] built from incommensurate sines */
export function noise1(t) {
  return (Math.sin(t) + Math.sin(t * 2.17 + 1.3) * 0.6 + Math.sin(t * 4.31 + 2.1) * 0.35) / 1.95;
}
/** sRGB hex -> linear rgb triple */
export function hexLin(hex) {
  const r = ((hex >> 16) & 255) / 255,
    g = ((hex >> 8) & 255) / 255,
    b = (hex & 255) / 255;
  return [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];
}
export const rgba = (hex, a = 1) => {
  const c = hexLin(hex);
  return [c[0], c[1], c[2], a];
};
export function mixRGB(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
