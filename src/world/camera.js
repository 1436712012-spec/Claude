// Camera basis. Yaw is measured in the xz plane from +x toward +z; pitch up.
// The shader computes rd = uCamRot * (sx, sy, 1) with x to the right on screen.

export function cameraBasis(yaw, pitch) {
  const cp = Math.cos(pitch);
  const f = [cp * Math.cos(yaw), Math.sin(pitch), cp * Math.sin(yaw)];
  const r = [-Math.sin(yaw), 0, Math.cos(yaw)]; // f × up
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  // column-major mat3: columns right, up, forward
  return { f, r, u, mat: [r[0], r[1], r[2], u[0], u[1], u[2], f[0], f[1], f[2]] };
}

/** Ray direction through a screen point (ndc in [-1, 1], aspect = w/h). */
export function rayDir(basis, nx, ny, aspect, tanHalf) {
  const sx = nx * aspect * tanHalf;
  const sy = ny * tanHalf;
  const d = [
    basis.r[0] * sx + basis.u[0] * sy + basis.f[0],
    basis.r[1] * sx + basis.u[1] * sy + basis.f[1],
    basis.r[2] * sx + basis.u[2] * sy + basis.f[2],
  ];
  const l = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / l, d[1] / l, d[2] / l];
}
