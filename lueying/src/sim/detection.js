// Detection：视锥、雷达（含多普勒门限）、电磁监测站、摄像头与手机、卫星过境、热成像、怀疑度与警戒状态机。
// 规则：玩家必须随时看得懂自己为什么被发现。每次状态跃迁都记录“谁、因为什么、在哪里”。
import { DETECT, RAIN, CLOCK, TRACE, SHIP } from './config.js';
import { clamp, lerp, smoothstep, wrapAngle } from './noise.js';
import { TRACE_SENSE, TRACE_LABEL } from './traces.js';

export const CAUSE_LABEL = {
  sight: '视线', spotlight: '探照灯', lamp: '灯光下', thermal: '热成像', radar: '雷达', em: '电磁异常',
  camera: '摄像头', phone: '手机', drone: '无人机镜头', hum: '嗡鸣', emi: '电台杂音', pulse: '场脉冲',
  surge: '场涌', scan: '扫描脉冲', satellite: '卫星', dispatch: '调度', alarm: '营地警报', radio: '对讲机呼叫',
  core: '残骸失踪', explosion: '爆炸', jam: '干扰杂音',
};
export function causeLabel(c) {
  if (!c) return '';
  if (c.startsWith('trace:')) return TRACE_LABEL[c.slice(6)] || c;
  return CAUSE_LABEL[c] || c;
}

export const AWARE_LABEL = { quiet: '安静', suspicious: '起疑', search: '搜索', alarm: '警报' };

export function makeObserver(o) {
  return Object.assign({
    alive: true, down: false, disabled: 0, stunned: 0, anchored: 0,
    sus: 0, pending: 0, gainRate: 0, visNow: 0, focus: null, lastKnown: null, cause: '', lastStim: -99,
    aware: 'quiet', searchT: 0, clarity: 0, clipCd: 0, phoneOut: false, noticed: new Set(),
    thinkT: Math.random() * 0.07, visCache: new Map(), yaw: 0, pitch: 0, eye: { x: 0, y: 0, z: 0 },
    memory: [], // 最近 30 s 的见闻（记忆雾会清掉）
  }, o);
}

function dirFromYawPitch(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}
export { dirFromYawPitch };

// 某点是否被探照灯/路灯照亮
export function lightingAt(w, x, y, z) {
  const out = { spot: null, lamp: null };
  for (const L of w.spotlights()) {
    const dx = x - L.x, dy = y - L.y, dz = z - L.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > L.range || d < 0.5) continue;
    const dir = L.dir;
    const cos = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
    if (cos < Math.cos((L.cone * Math.PI) / 180)) continue;
    const los = w.terrain.los(L.x, L.y, L.z, x, y, z, { skipBox: L.owner });
    if (los.blocked) continue;
    out.spot = L;
    break;
  }
  if (!out.spot && w.power.on) {
    for (const lp of w.lamps) {
      if (!lp.alive || lp.disabled > 0) continue;
      const dx = x - lp.x, dz = z - lp.z;
      if (dx * dx + dz * dz < 22 * 22) { out.lamp = lp; break; }
    }
  }
  return out;
}

// 观察者对目标的可见度 0..1 与原因
export function visibility(w, o, tg) {
  const S = o.sense;
  if (!S || S.type === 'radar' || S.type === 'em') return { v: 0 };
  const e = o.eye;
  const tx = tg.pos.x, ty = tg.pos.y + 0.3, tz = tg.pos.z;
  const dx = tx - e.x, dy = ty - e.y, dz = tz - e.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const env = w.env;
  const rainV = lerp(1, RAIN.visionMul, env.rain);
  const isCam = S.type === 'camera' || S.type === 'drone' || S.type === 'civ';
  const lightMul = lerp(isCam ? 0.6 : 0.5, 1, env.light);
  // 视野角
  const f = dirFromYawPitch(o.yaw, o.pitch || 0);
  const cosA = (dx * f.x + dy * f.y + dz * f.z) / Math.max(d, 1e-3);
  const half = ((S.fov || 100) * Math.PI) / 360;
  const ang = Math.acos(clamp(cosA, -1, 1));
  let best = { v: 0, cause: null };
  if (ang < half) {
    const lit = d < 260 ? lightingAt(w, tx, ty, tz) : { spot: null, lamp: null };
    let R = S.range * rainV * lightMul;
    let cause = isCam ? (S.type === 'drone' ? 'drone' : S.type === 'civ' ? 'phone' : 'camera') : 'sight';
    if (lit.spot) {
      R = Math.max(R, env.rain > 0.15 ? DETECT.spotlight.rainSilhouette : 220);
      cause = 'spotlight';
    } else if (lit.lamp) {
      R = Math.max(R, S.range * rainV * 0.85);
      if (!isCam) cause = 'lamp';
    }
    if (!tg.phantom) R *= tg.camo;
    if (tg.height < 1.25 && w.terrain.density(tx, tz) > 0.3) R *= DETECT.undergrowthConceal;
    if (tg.height > 2.6) R *= 1.2;
    if (o.aware === 'search' || w.camp.state === 'cooldown') R *= 1.12;
    if (d < R) {
      const los = w.terrain.los(e.x, e.y, e.z, tx, ty, tz, { skipBox: o.ownerBox });
      if (!los.blocked) {
        const fd = 1 - smoothstep(0.35 * R, R, d);
        const fa = 1 - smoothstep(0.55 * half, half, ang);
        const v = fd * fa * los.atten * (lit.spot || lit.lamp ? 1 : 0.85);
        if (v > best.v) best = { v, cause };
      }
    }
  }
  // 热成像：无人机常开；守卫、车辆、直升机在警报后启用
  const thermalOn = S.thermal === 'always' || (S.thermal === 'alarm' && w.camp.state !== 'normal');
  if (thermalOn && !tg.phantom && ang < half * 1.1) {
    const Rt = DETECT.thermal.base + DETECT.thermal.perHeat * tg.heat;
    if (d < Rt) {
      const los = w.terrain.los(e.x, e.y, e.z, tx, ty, tz, { skipBox: o.ownerBox });
      if (!los.blocked) {
        const v = (1 - smoothstep(0.4 * Rt, Rt, d)) * los.atten * 0.9;
        if (v > best.v) best = { v, cause: 'thermal' };
      }
    }
  }
  return best;
}

// 给观察者一个离散线索：怀疑度以不超过上限的速率注入
export function stimulate(w, o, amount, cause, pos, focus = 'player') {
  if (!o.alive || o.down) return;
  if (o.stunned > 0) return;
  o.pending = Math.min(140, o.pending + amount);
  o.cause = cause;
  o.focus = focus;
  if (pos) o.lastKnown = { x: pos.x, y: pos.y ?? 0, z: pos.z };
  o.lastStim = w.time;
  o.memory.push({ t: w.time, cause });
  if (w.camp.state !== 'alarm' && (o.aware === 'quiet')) {
    if (w.camp.state === 'cooldown' && o.mobile) setAware(w, o, 'search', cause);
    else if (amount >= 12) setAware(w, o, 'suspicious', cause);
  }
}

export function setAware(w, o, next, cause) {
  const prev = o.aware;
  if (prev === next) return;
  o.aware = next;
  if (next === 'search') o.searchT = DETECT.searchTime;
  w.logDetection(o, prev, next, cause || o.cause);
  w.emitEvent({ type: 'aware', id: o.id, from: prev, to: next, cause: cause || o.cause });
  if (o.onAware) o.onAware(w, prev, next);
}

// 每帧：把可见度增益与待注入线索合成怀疑度，并驱动状态机
export function updateAwareness(w, o, dt) {
  if (!o.alive || o.down) return;
  if (o.stunned > 0) return;
  const max = DETECT.maxRate * dt;
  let inc = Math.min(o.gainRate * dt, max);
  let room = max - inc;
  if (o.pending > 0 && room > 0) {
    const take = Math.min(o.pending, room);
    o.pending -= take;
    inc += take;
  }
  if (inc > 0.0001) {
    o.sus = Math.min(100, o.sus + inc);
    if (o.gainRate > 0) o.lastStim = w.time;
  } else if (w.time - o.lastStim > 1.5) {
    o.sus = Math.max(0, o.sus - DETECT.decay * dt);
  }
  if (w.camp.state === 'alarm') {
    if (o.aware !== 'alarm') setAware(w, o, 'alarm', 'alarm');
    return;
  }
  if (o.sus >= DETECT.alarmAt - 0.01) {
    w.raiseAlarm(o, o.cause);
    return;
  }
  switch (o.aware) {
    case 'quiet':
      if (o.sus > DETECT.suspiciousAt) setAware(w, o, w.camp.state === 'cooldown' && o.mobile ? 'search' : 'suspicious', o.cause);
      break;
    case 'suspicious':
      if (o.sus > DETECT.searchAt) setAware(w, o, 'search', o.cause);
      else if (o.sus < 8 && o.pending <= 0) setAware(w, o, 'quiet', 'calm');
      break;
    case 'search':
      if (o.searchT <= 0 && o.sus < DETECT.suspiciousAt && o.pending <= 0) setAware(w, o, 'quiet', 'calm');
      break;
    case 'alarm':
      if (w.camp.state === 'cooldown') { o.aware = 'quiet'; o.sus = Math.min(o.sus, 20); }
      break;
  }
  // 记忆只保留 30 秒
  if (o.memory.length && w.time - o.memory[0].t > 30) o.memory.shift();
}

// 视觉观察者：每 1/15 s 计算一次可见度，缓存增益速率
export function senseTargets(w, o, dt) {
  o.thinkT -= dt;
  if (o.thinkT > 0) return;
  o.thinkT = 1 / 15;
  o.gainRate = 0; o.visNow = 0;
  if (!o.alive || o.down || o.disabled > 0 || o.stunned > 0 || !o.sense) return;
  if (o.sense.type === 'camera' && !w.power.on) return;
  let bestV = 0, bestT = null, bestCause = null, total = 0;
  for (const tg of w.targets()) {
    const r = visibility(w, o, tg);
    o.visCache.set(tg.id, r.v);
    if (r.v <= 0.02) continue;
    const motion = 0.55 + 0.45 * clamp(tg.speed / 18, 0, 1);
    let g = 140 * Math.pow(r.v, 0.8) * motion;
    if (o.aware === 'search' && r.v > 0.6) g *= 2;
    total += g;
    if (r.v > bestV) { bestV = r.v; bestT = tg; bestCause = r.cause; }
  }
  if (bestT) {
    o.gainRate = total * (o.sense.gain ?? 1);
    o.visNow = bestV;
    o.focus = bestT.id;
    o.cause = bestCause;
    o.lastKnown = { x: bestT.pos.x, y: bestT.pos.y, z: bestT.pos.z };
    w.camp.lastSeenT = w.time;
    w.camp.lastKnown = { x: bestT.pos.x, y: bestT.pos.y, z: bestT.pos.z };
    if (bestT.isShip) w.noteSeen(bestT.id, o, bestCause, bestV);
  }
}

// 影像证据：摄像头、无人机、掏出手机的人
export function updateEvidence(w, o, dt) {
  if (o.clipCd > 0) o.clipCd -= dt;
  if (!o.sense) return;
  const films = (o.sense && (o.sense.type === 'camera' || o.sense.type === 'drone')) || o.phoneOut;
  if (!films || !o.alive || o.down || o.disabled > 0 || o.stunned > 0) { o.clarity = Math.max(0, o.clarity - dt); return; }
  if (o.sense.type === 'camera' && !w.power.on) return;
  let best = 0, subject = null;
  for (const tg of w.targets()) {
    let v = o.visCache.get(tg.id) || 0;
    if (o.phoneOut && o.sense.type !== 'camera' && o.sense.type !== 'drone') v *= 1.1;
    if (v > best) { best = v; subject = tg; }
  }
  if (best >= DETECT.evidenceClarity && subject) {
    o.clarity += dt / DETECT.evidenceTime;
    if (o.clarity >= 1 && o.clipCd <= 0) {
      o.clarity = 0;
      o.clipCd = 8;
      w.addClip(o, subject);
    }
  } else {
    o.clarity = Math.max(0, o.clarity - dt * 0.5);
  }
}

// 守卫/无人机读取痕迹
export function noticeTraces(w, o) {
  if (!o.alive || o.down || o.disabled > 0 || o.stunned > 0 || !o.mobile || !o.sense) return;
  const e = o.eye;
  const hearing = lerp(1, RAIN.hearingMul, w.env.rain);
  const vis = lerp(1, RAIN.visionMul, w.env.rain);
  for (const t of w.traces.list) {
    if (o.noticed.has(t.id)) continue;
    if (w.time - t.t0 > t.dur) continue;
    if (t.source === o.id) continue;
    const sense = TRACE_SENSE[t.type];
    if (!sense || sense === 'em' || sense === 'camp') continue;
    const dx = t.x - e.x, dy = t.y - e.y, dz = t.z - e.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let range = t.range;
    if (sense === 'visual' || sense === 'visualFar') range *= vis * lerp(0.55, 1, w.env.light);
    if (sense === 'thermal') {
      const thermalOn = o.sense.thermal === 'always' || (o.sense.thermal === 'alarm' && w.camp.state !== 'normal');
      if (!thermalOn) continue;
      range = DETECT.thermal.base + DETECT.thermal.perHeat * 60 * t.strength;
    }
    if (t.type === 'mist') range *= 0.5 + 0.5 * t.strength;
    if (d > range) continue;
    if (sense === 'visual' || sense === 'thermal') {
      const los = w.terrain.los(e.x, e.y, e.z, t.x, t.y + 0.6, t.z, { skipBox: o.ownerBox });
      if (los.blocked || los.atten < 0.25) continue;
    } else if (sense === 'visualFar') {
      const los = w.terrain.los(e.x, e.y, e.z, t.x, t.y, t.z, { ignoreTrees: true, canopy: false, skipBox: o.ownerBox });
      if (los.blocked) continue;
    }
    o.noticed.add(t.id);
    const falloff = 1 - 0.5 * (d / range);
    const jitter = t.type === 'birds' ? 18 : t.type === 'scrape' ? 8 : 4;
    stimulate(w, o, t.value * falloff, 'trace:' + t.type, { x: t.x + (Math.random() - 0.5) * jitter, y: t.y, z: t.z + (Math.random() - 0.5) * jitter }, t.source);
    w.emitEvent({ type: 'noticeTrace', id: o.id, trace: t.type, source: t.source });
  }
  // 连续量：嗡鸣与电磁干扰（无线电杂音）
  for (const s of w.allShips()) {
    if (s.destroyed || s.silent) continue;
    const dx = s.pos.x - e.x, dz = s.pos.z - e.z;
    const d = Math.hypot(dx, dz);
    const humR = DETECT.hearing.hum * s.power * hearing * (1 + s.speed / 60);
    if (d < humR) {
      o.pending += (1 - d / humR) * 10 * (1 / 15);
      o.cause = 'hum'; o.lastKnown = { x: s.pos.x, y: s.pos.y, z: s.pos.z }; o.lastStim = w.time; o.focus = s.id;
    }
    if (d < TRACE.emi.range && o.hasRadio) {
      o.pending += TRACE.emi.value * (1 - d / TRACE.emi.range) * (1 / 15);
      o.cause = 'emi'; o.lastKnown = { x: s.pos.x + (Math.random() - 0.5) * 10, y: s.pos.y, z: s.pos.z + (Math.random() - 0.5) * 10 }; o.lastStim = w.time; o.focus = s.id;
      if (o.aware === 'quiet' && o.pending > 8) setAware(w, o, 'suspicious', 'emi');
    }
  }
}

// ---------- 周界雷达 ----------
export function updateRadar(w, R, dt) {
  const C = DETECT.radar;
  const prev = R.angle;
  R.angle = wrapAngle(R.angle + ((Math.PI * 2) / C.period) * dt);
  R.contacts = R.contacts.filter((c) => w.time - c.t < 3);
  if (!R.alive || R.offline > 0 || R.disabled > 0 || !w.power.on) {
    if (R.offline > 0) R.offline -= dt;
    if (R.disabled > 0) R.disabled -= dt;
    R.gainRate = 0;
    updateAwareness(w, R, dt);
    return;
  }
  R.gainRate = 0;
  for (const tg of w.targets()) {
    const dx = tg.pos.x - R.eye.x, dz = tg.pos.z - R.eye.z;
    const d = Math.hypot(dx, dz);
    // 方位角（与 yaw 约定一致：yaw=0 指向 -z）
    const az = Math.atan2(-dx, -dz);
    const a0 = wrapAngle(az - prev), a1 = wrapAngle(az - R.angle);
    const crossed = a0 >= 0 && a1 < 0 && a0 - a1 < Math.PI;
    if (!crossed) continue;
    const res = radarCheck(w, R, tg, d);
    R.lastCheck = { id: tg.id, ...res, t: w.time };
    if (!res.seen) continue;
    R.contacts.push({ x: tg.pos.x, z: tg.pos.z, t: w.time, id: tg.id });
    stimulate(w, R, C.perSweep, 'radar', { x: tg.pos.x + (Math.random() - 0.5) * 20, y: tg.pos.y, z: tg.pos.z + (Math.random() - 0.5) * 20 }, tg.id);
    if (tg.isShip) w.noteSeen(tg.id, R, 'radar', 0.6);
    w.emitEvent({ type: 'radarPing', id: tg.id, x: tg.pos.x, z: tg.pos.z });
  }
  updateAwareness(w, R, dt);
}

export function radarCheck(w, R, tg, d) {
  const C = DETECT.radar;
  if (d === undefined) d = Math.hypot(tg.pos.x - R.eye.x, tg.pos.z - R.eye.z);
  if (d > C.range) return { seen: false, why: 'range' };
  if (d < C.minRange) return { seen: false, why: 'blind' };
  const T = w.terrain;
  if (T.underCanopy(tg.pos.x, tg.pos.z)) return { seen: false, why: 'canopy' };
  if (T.culvertCeiling(tg.pos.x, tg.pos.z) !== null && tg.pos.y < 3.4) return { seen: false, why: 'culvert' };
  const los = T.los(R.eye.x, R.eye.y, R.eye.z, tg.pos.x, tg.pos.y + 0.5, tg.pos.z, { skipBox: 'commTower' });
  if (los.blocked) return { seen: false, why: los.by };
  // 多普勒门限：径向速度
  const dx = tg.pos.x - R.eye.x, dz = tg.pos.z - R.eye.z;
  const l = Math.hypot(dx, dz) || 1;
  const radial = Math.abs((tg.vel.x * dx + tg.vel.z * dz) / l);
  if (radial < C.doppler) return { seen: false, why: 'doppler', radial };
  return { seen: true, radial };
}

// ---------- 电磁监测站 ----------
export function updateEM(w, S, dt) {
  S.gainRate = 0;
  if (!S.alive || S.disabled > 0 || !w.power.on) {
    if (S.disabled > 0) S.disabled -= dt;
    updateAwareness(w, S, dt);
    return;
  }
  const C = DETECT.em;
  let bestSig = 0, best = null;
  for (const s of w.allShips()) {
    if (s.destroyed) continue;
    const d = Math.hypot(s.pos.x - S.x, s.pos.z - S.z);
    if (d > C.radius) continue;
    const sig = s.power * (1 - d / C.radius);
    S.gainRate += C.rate * sig;
    if (sig > bestSig) { bestSig = sig; best = s; }
  }
  // 磐石干扰场本身是一个很响的电磁源
  const bed = w.wingmen && w.wingmen.find((m) => m.id === 'bedrock');
  if (bed && bed.jamming && !bed.ship.destroyed) {
    const d = Math.hypot(bed.ship.pos.x - S.x, bed.ship.pos.z - S.z);
    if (d < C.radius * 2.2) { S.gainRate += 30 * (1 - d / (C.radius * 2.2)); best = best || bed.ship; }
  }
  S.signal = bestSig;
  if (best && S.gainRate > 0.5) {
    S.focus = best.id;
    S.cause = 'em';
    S.lastKnown = { x: best.pos.x + (Math.random() - 0.5) * 16, y: best.pos.y, z: best.pos.z + (Math.random() - 0.5) * 16 };
    if (best.id === 'player' || best.isWingman) w.noteSeen(best.id, S, 'em', bestSig);
  }
  updateAwareness(w, S, dt);
}

// 场涌 / 扫描脉冲 → 电磁站
export function emImpulse(w, x, z, amount, cause, sourceId, radius = DETECT.em.radius) {
  for (const S of w.emStations) {
    if (!S.alive || S.disabled > 0 || !w.power.on) continue;
    const d = Math.hypot(x - S.x, z - S.z);
    if (d > radius) continue;
    stimulate(w, S, amount, cause, { x, y: 1, z }, sourceId);
    w.noteSeen(sourceId, S, cause, 1);
    w.emitEvent({ type: 'emSpike', id: S.id, x, z, source: sourceId });
  }
}

// ---------- 卫星过境 ----------
export function makeSatellite() {
  return { next: CLOCK.satFirst, passing: false, end: 0, warned: false, checkT: 0, captured: new Set(), passes: 0 };
}

export function updateSatellite(w, sat, dt) {
  const t = w.time;
  if (!sat.passing) {
    if (!sat.warned && t >= sat.next - CLOCK.satWarn) { sat.warned = true; w.emitEvent({ type: 'satWarn' }); }
    if (t >= sat.next) {
      sat.passing = true; sat.end = sat.next + CLOCK.satDuration; sat.captured = new Set(); sat.passes++;
      w.emitEvent({ type: 'satStart' });
    }
    return;
  }
  sat.checkT -= dt;
  if (sat.checkT <= 0) {
    sat.checkT = 0.25;
    for (const s of w.allShips()) {
      if (s.destroyed || sat.captured.has(s.id)) continue;
      const r = satelliteExposure(w, s);
      if (r.exposed) w.satelliteCapture(s.id, r.why, s.pos.x, s.pos.z);
    }
  }
  if (t >= sat.end) {
    sat.passing = false; sat.next += CLOCK.satPeriod; sat.warned = false;
    w.emitEvent({ type: 'satEnd' });
  }
}

export function satelliteExposure(w, s) {
  const T = w.terrain;
  const open = !T.underCanopy(s.pos.x, s.pos.z) && !T.sheltered(s.pos.x, s.pos.z, s.pos.y);
  if (!open) return { exposed: false, why: 'cover' };
  const fast = s.speed > CLOCK.satSpeed;
  const high = s.hAbove > 2.6;
  if (fast) return { exposed: true, why: T.isWater(s.pos.x, s.pos.z) ? 'river' : 'open' };
  if (high) return { exposed: true, why: 'jump' };
  return { exposed: false, why: 'slow' };
}

export { SHIP };
