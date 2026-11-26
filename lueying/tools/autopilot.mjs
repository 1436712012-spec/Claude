// 潜入自动驾驶探针：沿“小溪 → 涵洞 → 机库北墙 → 残骸”飞一遍完整模拟，打印谁、因为什么注意到你。用于调平衡。
// node tools/autopilot.mjs
import { World } from '../src/sim/world.js';
import { emptyCommand } from '../src/sim/ship.js';
import { RIVER, WRECK, EXTRACT } from '../src/sim/level.js';
const DT = 1 / 60;
const w = new World();
for (const m of w.wingmen) m.setOrder('hold', { silent: true });
const P = w.player;
// 路线：沿河道（倒序）到涵洞，院内绕到机库
const river = RIVER.slice(0, RIVER.length).map(([x, z]) => [x, z]).filter(([x, z]) => z < 728);
const route = [
  ...river.map(([x, z]) => ({ x, z, speed: z > -100 ? 24 : 12, alt: 'low', power: z > -100 ? 0.55 : 0.15 })),
  { x: 40, z: -262, speed: 6, alt: 'low', power: 0.15 },
  { x: 10, z: -300, speed: 5, alt: 'low', power: 0.15 },
  { x: -30, z: -322, speed: 5, alt: 'low', power: 0.15 },
  { x: -100, z: -326, speed: 5, alt: 'low', power: 0.15, wait: true },
  { x: -83, z: -319, speed: 4, alt: 'low', power: 0.15 },
  { x: -83, z: -300, speed: 4, alt: 'low', power: 0.15 },
  { x: -100, z: -300, speed: 3, alt: 'low', power: 0.15 },
  { x: WRECK.x + 2, z: WRECK.z, speed: 3, alt: 'low', power: 0.2, hold: true },
];
let i = 0, t = 0, phase = 'in';
const log = [];
let last = '';
while (t < 420 && !w.mission.over) {
  const c = emptyCommand();
  const wp = route[Math.min(i, route.length - 1)];
  const dx = wp.x - P.pos.x, dz = wp.z - P.pos.z, d = Math.hypot(dx, dz);
  if (phase === 'in') {
    const gH = w.guards.find((g) => g.id === 'gHangar');
    const clear = Math.hypot(gH.pos.x + 90, gH.pos.z + 300) > 55 && gH.routeI === 5;
    if (d < 6 && i < route.length - 1 && (!wp.wait || clear)) i++;
    const sp = wp.speed / (38 * (0.3 + 0.7 * P.power / 0.7));
    if (d > 1.5) { c.mx = (dx / d) * Math.min(1, sp); c.mz = (dz / d) * Math.min(1, sp); }
    P.targetPower = wp.power;
    if (wp.alt !== P.altMode) c.setAlt = wp.alt;
    if (w.mission.core.taken) { phase = 'out'; i = route.length - 2; }
  } else {
    // 原路返回
    const back = [...route].reverse();
    const bp = back[Math.min(i - (route.length - 2), back.length - 1)] || back[back.length - 1];
    const k = Math.min(route.length - 1, Math.max(0, i));
    const target = i >= route.length + river.length + 3 ? EXTRACT : back[Math.min(i - (route.length - 2), back.length - 1)];
    const tx = target.x, tz = target.z;
    const ex = tx - P.pos.x, ez = tz - P.pos.z, ed = Math.hypot(ex, ez);
    if (ed < 6) i++;
    const spd = (target.speed || 24) / 38;
    c.mx = (ex / ed) * Math.min(1, spd * 1.2); c.mz = (ez / ed) * Math.min(1, spd * 1.2);
    P.targetPower = target.power ?? 0.6;
    c.setAlt = 'low';
  }
  w.step(DT, { ship: c });
  t += DT;
  for (const e of w.drainEvents()) {
    if (e.type === 'aware' && e.to !== 'quiet') log.push(`${t.toFixed(1)}s ${e.id} ${e.from}->${e.to} ${e.cause} @(${P.pos.x.toFixed(0)},${P.pos.z.toFixed(0)})`);
    if (['alarm', 'satCapture', 'clip', 'coreTaken', 'coreDiscovered', 'ship:destroyed'].includes(e.type)) log.push(`${t.toFixed(1)}s ${e.type} ${e.by || e.source || ''} ${e.cause || e.why || ''} @(${P.pos.x.toFixed(0)},${P.pos.z.toFixed(0)})`);
  }
  const s = `${i}`;
  if (s !== last && i % 4 === 0) { last = s; }
}
console.log('time', t.toFixed(1), 'pos', P.pos.x.toFixed(0), P.pos.z.toFixed(0), 'core', w.mission.core.taken, 'over', w.mission.over, w.mission.result?.rating, 'hull', P.hull.toFixed(0), 'scrapes', w.mission.stats.scrapes);
console.log(log.slice(0, 40).join('\n'));
const top = w.observers.filter(o => o.sus > 5).map(o => `${o.id}:${o.sus.toFixed(0)}`);
console.log('residual sus', top.join(' '));
