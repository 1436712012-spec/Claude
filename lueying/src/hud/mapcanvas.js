// 俯视地图：小地图与结算回放共用。按地形区域着色，叠加建筑、围栏、道路、河道与标注。
import { BUILDINGS, HANGAR, CONTAINERS, CITY, EXTRACT, WRECK, SEARCH_TOWERS, COMM_TOWER, MAP_TEXT } from '../sim/level.js';
import { MAP } from '../sim/config.js';
import { developedMask, inCompound } from '../sim/level.js';

export function renderMapCanvas(T, size = 1000) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const k = 2000 / size;
  for (let j = 0; j < size; j++) {
    const z = -1000 + (j + 0.5) * k;
    for (let i = 0; i < size; i++) {
      const x = -1000 + (i + 0.5) * k;
      const h = T.height(x, z);
      let r, gg, b;
      if (h < -0.05) { r = 14; gg = 18; b = 20; }
      else {
        const dev = developedMask(x, z);
        const can = T.canopy(x, z);
        r = 24 + h * 2; gg = 40 + h * 2.5 - can * 8; b = 30;
        if (dev > 0.5) {
          if (inCompound(x, z)) { r = 58; gg = 60; b = 60; }
          else if (z < MAP.cityZ) { r = 46; gg = 44; b = 42; }
          else { r = 62; gg = 58; b = 44; }
        }
      }
      const o = (j * size + i) * 4;
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const S = (x) => (x + 1000) / k;
  const rect = (cx, cz, w, dd, col) => { g.fillStyle = col; g.fillRect(S(cx - w / 2), S(cz - dd / 2), w / k, dd / k); };
  for (const b of BUILDINGS) rect(b.x, b.z, b.w, b.d, b.kind === 'lab' ? '#9aa3a8' : '#7b8084');
  rect(HANGAR.x, HANGAR.z, HANGAR.w, HANGAR.d, '#6f7a72');
  for (const [x, z, rot, s] of CONTAINERS) rect(x, z, rot ? 2.5 : 12, rot ? 12 : 2.5, '#8a5a40');
  for (const b of CITY.blocks) rect(b.x, b.z, b.w, b.d, '#5a5650');
  g.strokeStyle = 'rgba(200,205,200,0.6)'; g.lineWidth = 1;
  for (const f of T.fences) { g.beginPath(); g.moveTo(S(f.ax), S(f.az)); g.lineTo(S(f.bx), S(f.bz)); g.stroke(); }
  g.fillStyle = '#E5483B';
  for (const t of SEARCH_TOWERS) g.fillRect(S(t.x) - 2, S(t.z) - 2, 4, 4);
  g.fillRect(S(COMM_TOWER.x) - 2, S(COMM_TOWER.z) - 2, 4, 4);
  // 涵洞
  g.strokeStyle = 'rgba(143,227,232,0.5)'; g.setLineDash([3, 2]);
  g.beginPath(); g.moveTo(S(MAP.culvert.x), S(MAP.culvert.z1)); g.lineTo(S(MAP.culvert.x), S(MAP.culvert.z0)); g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(230,234,236,0.55)'; g.font = `${Math.round(size / 90)}px system-ui, sans-serif`;
  for (const [text, x, z] of MAP_TEXT) g.fillText(text, S(x), S(z));
  return c;
}
