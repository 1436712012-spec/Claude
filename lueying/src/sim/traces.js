// 痕迹系统：飞碟在世界上留下的可见/可闻线索。玩家看得见，敌人也读得懂。
// 每条痕迹都有类型、位置、持续时间、被发现距离和来源。
import { TRACE, CLOCK } from './config.js';
import { clamp, mulberry32 } from './noise.js';

export const TRACE_LABEL = {
  mist: '落叶与水雾',
  birds: '惊飞的鸟群',
  ripple: '场涟漪',
  emi: '电磁干扰',
  scrape: '刮擦声',
  surge: '场涌',
  pulse: '场脉冲',
  heat: '热雾',
  beam: '静滞束光迹',
  thud: '重力锚闷响',
  core: '残骸失踪',
  hum: '悬浮场嗡鸣',
  splash: '落水声',
  explosion: '爆炸',
};

// 感知方式：visual 需要视线，audio 不需要，thermal 仅热成像，em 仅电磁站
export const TRACE_SENSE = {
  mist: 'visual', birds: 'visualFar', ripple: 'visual', scrape: 'audio', splash: 'audio', surge: 'em',
  pulse: 'camp', heat: 'thermal', beam: 'visual', thud: 'audio', core: 'visual', explosion: 'audio',
};

const BIRD_CELL = 40;

export class TraceSystem {
  constructor(world) {
    this.world = world;
    this.list = [];
    this.nextId = 1;
    this.rand = mulberry32(777);
    this.birdRoosts = new Map(); // cellKey → flushedUntil
    this.emitT = new Map(); // `${ship}:${type}` → 下次可发射时间
    this.flocks = []; // 渲染用：正在飞起的鸟群
    this.emissions = new Map(); // shipId → { mist, ripple, heat, birds, hum, rainShell, lit }
  }

  add(type, x, y, z, opts = {}) {
    const w = this.world;
    const cfg = TRACE[type] || {};
    const rain = w.env.rain;
    let dur = opts.dur ?? (Array.isArray(cfg.dur) ? cfg.dur[0] + this.rand() * (cfg.dur[1] - cfg.dur[0]) : cfg.dur ?? 0.2);
    if (type === 'mist') dur *= 1 - (1 - TRACE.mist.rainDur) * rain;
    if (type === 'heat') dur *= 1 - 0.5 * rain;
    let range = opts.range ?? cfg.range ?? 50;
    if (type === 'scrape' || type === 'splash' || type === 'thud') range *= 1 - 0.5 * rain;
    if (type === 'beam') range = rain > 0.3 ? TRACE.beam.range : 45;
    const t = {
      id: this.nextId++, type, x, y, z, t0: w.time, dur, range,
      value: opts.value ?? cfg.value ?? 20, source: opts.source || 'player', strength: opts.strength ?? 1,
      a: opts.a, b: opts.b,
    };
    this.list.push(t);
    w.emitEvent({ type: 'trace', trace: t });
    return t;
  }

  active(t) {
    return this.world.time - t.t0 <= t.dur;
  }

  update(dt) {
    const w = this.world;
    // 过期清理
    if (this.list.length > 0) this.list = this.list.filter((t) => w.time - t.t0 <= t.dur + 0.5);
    this.flocks = this.flocks.filter((f) => w.time - f.t0 < 9);
    for (const s of w.allShips()) {
      if (s.destroyed) continue;
      this._shipEmissions(s, dt);
    }
  }

  _can(key, interval) {
    const now = this.world.time;
    const next = this.emitT.get(key) || 0;
    if (now < next) return false;
    this.emitT.set(key, now + interval);
    return true;
  }

  _shipEmissions(s, dt) {
    const w = this.world, T = w.terrain;
    const p = s.pos;
    const em = { mist: false, ripple: false, heat: false, birds: false, hum: 0, rainShell: false, lit: false, emi: false };
    const fieldOn = !s.silent && s.spoolT <= 0 && s.power > 0.02;
    // 落叶与水雾：低于 1.2 m 且速度高于 20 m/s
    if (fieldOn && s.hAbove < TRACE.mist.maxHeight && s.speed > TRACE.mist.minSpeed) {
      em.mist = true;
      if (this._can(s.id + ':mist', 0.35)) this.add('mist', p.x, p.y - 0.5, p.z, { source: s.id, strength: clamp(s.speed / 50, 0.3, 1) * (0.6 + s.power * 0.6) });
    }
    // 场涟漪：任何悬浮状态，水面最明显
    if (fieldOn && T.isWater(p.x, p.z) && s.hAbove < 3) {
      em.ripple = true;
      if (this._can(s.id + ':ripple', 0.5)) this.add('ripple', p.x, 0, p.z, { source: s.id, strength: s.power });
    }
    // 热雾
    if (s.venting) {
      em.heat = true;
      if (this._can(s.id + ':heat', 0.5)) this.add('heat', p.x, p.y + 0.5, p.z, { source: s.id, strength: clamp(s.heat / 100, 0.2, 1) });
    }
    // 惊飞的鸟群：在树冠下高速飞行
    if (s.speed > TRACE.birds.speed && T.underCanopy(p.x, p.z)) {
      if (this.flushBirds(p.x, p.z, s.id)) em.birds = true;
    }
    // 嗡鸣（听觉，连续量）
    em.hum = fieldOn ? s.power * (0.6 + clamp(s.speed / 60, 0, 1) * 0.4) : 0;
    em.emi = fieldOn;
    // 雨幕轮廓
    em.rainShell = fieldOn && w.env.rain > 0.15 && !T.underCanopy(p.x, p.z) && T.culvertCeiling(p.x, p.z) === null;
    this.emissions.set(s.id, em);
  }

  // 惊起某格的鸟群；返回是否真的飞起（每格有回巢时间）
  flushBirds(x, z, source = 'player', force = false) {
    const w = this.world;
    const ci = Math.floor(x / BIRD_CELL), cj = Math.floor(z / BIRD_CELL);
    const key = ci * 10000 + cj;
    const until = this.birdRoosts.get(key) || 0;
    if (w.time < until) return false;
    // 林地里才有鸟群栖息（城市一侧零星）
    const T = w.terrain;
    if (!force && T.canopy(x, z) < 0.3) return false;
    this.birdRoosts.set(key, w.time + TRACE.birds.resettle);
    const bx = (ci + 0.5) * BIRD_CELL, bz = (cj + 0.5) * BIRD_CELL;
    const fx = (x + bx) / 2, fz = (z + bz) / 2;
    const g = T.groundHeight(fx, fz);
    this.add('birds', fx, g + 28, fz, { source });
    this.flocks.push({ x: fx, y: g + 24, z: fz, t0: w.time, seed: key, n: 18 + ((key * 7) & 15) });
    w.emitEvent({ type: 'birds', x: fx, y: g + 24, z: fz, source });
    if (w.satellite && w.satellite.passing) w.satelliteCapture(source, 'birds', fx, fz);
    return true;
  }

  // HUD：扰动强度 0..1 与正在留下的痕迹
  disturbance(shipId) {
    const em = this.emissions.get(shipId);
    if (!em) return { value: 0, labels: [] };
    const labels = [];
    let v = em.hum * 0.22;
    if (em.mist) { v += 0.3; labels.push('水雾'); }
    if (em.ripple) { v += 0.12; labels.push('涟漪'); }
    if (em.heat) { v += 0.18; labels.push('热雾'); }
    if (em.birds) { v += 0.35; labels.push('鸟群'); }
    if (em.rainShell) { v += 0.08; labels.push('雨幕'); }
    return { value: clamp(v, 0, 1), labels };
  }
}

export { CLOCK };
