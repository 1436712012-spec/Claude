// Memory objects (weapons) and comfort objects (passives), with per-level tables.

import type { Enemies } from './enemies';
import type { Player } from './player';

export type WeaponId = 'nightlight' | 'plane' | 'musicbox';
export type PassiveId = 'pillow' | 'milk' | 'candy' | 'photo' | 'fan' | 'sticker';
export type Tag = '光' | '纸' | '声' | '水' | '屏幕' | '童年';

export interface ItemInfo { id: string; name: string; tags: Tag[]; blurb: string; levels: string[]; maxLevel: number; kind: 'weapon' | 'passive' }

export const WEAPON_INFO: Record<WeaponId, ItemInfo> = {
  nightlight: {
    id: 'nightlight', kind: 'weapon', name: '小夜灯', tags: ['光', '童年'], maxLevel: 8,
    blurb: '一圈暖色的光，靠近的东西都会被轻轻灼伤。',
    levels: ['点亮小夜灯', '范围 +12%', '伤害 +2', '范围 +12%', '脉冲更快', '伤害 +3', '范围 +15%', '光会把它们推开'],
  },
  plane: {
    id: 'plane', kind: 'weapon', name: '纸飞机', tags: ['纸'], maxLevel: 8,
    blurb: '折给某个人的纸飞机，会自己去找它的收件人。',
    levels: ['折一架纸飞机', '伤害 +2', '再多一架', '穿透 +1', '再多一架', '伤害 +3', '冷却 -12%', '再多两架，穿透 +1'],
  },
  musicbox: {
    id: 'musicbox', kind: 'weapon', name: '八音盒', tags: ['声', '童年'], maxLevel: 8,
    blurb: '上紧发条，音符绕着你转，碰到的都被弹开。',
    levels: ['上紧发条', '再多一个音符', '伤害 +3', '再多一个音符', '持续更久', '伤害 +3', '再多一个音符', '旋律不再停下'],
  },
};

export const PASSIVE_INFO: Record<PassiveId, ItemInfo> = {
  pillow: { id: 'pillow', kind: 'passive', name: '枕头', tags: ['童年'], maxLevel: 5, blurb: '最大生命 +20。', levels: Array(5).fill('最大生命 +20') },
  milk: { id: 'milk', kind: 'passive', name: '温牛奶', tags: ['童年'], maxLevel: 5, blurb: '每秒回复 0.3 生命。', levels: Array(5).fill('每秒回复 +0.3') },
  candy: { id: 'candy', kind: 'passive', name: '糖果', tags: ['童年'], maxLevel: 5, blurb: '移动速度 +7%。', levels: Array(5).fill('移动速度 +7%') },
  photo: { id: 'photo', kind: 'passive', name: '旧照片', tags: ['纸'], maxLevel: 5, blurb: '拾取范围 +30%。', levels: Array(5).fill('拾取范围 +30%') },
  fan: { id: 'fan', kind: 'passive', name: '小风扇', tags: ['声'], maxLevel: 5, blurb: '所有冷却 -7%。', levels: Array(5).fill('冷却 -7%') },
  sticker: { id: 'sticker', kind: 'passive', name: '星星贴纸', tags: ['光', '纸'], maxLevel: 5, blurb: '暴击率 +7%，暴击造成双倍伤害。', levels: Array(5).fill('暴击率 +7%') },
};

// ------------------------------------------------------------------ tables

const T = {
  nightlight: {
    radius: [1.5, 1.68, 1.68, 1.88, 1.88, 1.88, 2.16, 2.16],
    dmg: [5, 5, 7, 7, 7, 10, 10, 10],
    tick: [0.6, 0.6, 0.6, 0.6, 0.45, 0.45, 0.45, 0.45],
    push: [0, 0, 0, 0, 0, 0, 0, 2.2],
  },
  plane: {
    count: [1, 1, 2, 2, 3, 3, 3, 5],
    dmg: [12, 14, 14, 14, 14, 17, 17, 17],
    cd: [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.82, 0.82],
    pierce: [1, 1, 1, 2, 2, 2, 2, 3],
  },
  musicbox: {
    notes: [2, 3, 3, 4, 4, 4, 5, 5],
    dmg: [8, 8, 11, 11, 11, 14, 14, 14],
    on: [3, 3, 3, 3, 4.2, 4.2, 4.2, 999],
    off: [3, 3, 3, 3, 3, 3, 3, 0],
    radius: [2.1, 2.1, 2.2, 2.2, 2.3, 2.3, 2.45, 2.6],
  },
};

export interface HitEvent { i: number; dmg: number; crit: boolean; x: number; y: number }

export const MAX_PLANES = 400;

export class Arsenal {
  weapons = new Map<WeaponId, number>();   // id → level (1-based)
  passives = new Map<PassiveId, number>();

  // nightlight
  auraTimer = 0;
  auraPulse = 0;
  // planes
  planeTimer = 0.4;
  pn = 0;
  px = new Float32Array(MAX_PLANES); py = new Float32Array(MAX_PLANES);
  pvx = new Float32Array(MAX_PLANES); pvy = new Float32Array(MAX_PLANES);
  plife = new Float32Array(MAX_PLANES); ppierce = new Int8Array(MAX_PLANES);
  ptarget = new Int32Array(MAX_PLANES); ptuid = new Uint32Array(MAX_PLANES);
  pdmg = new Float32Array(MAX_PLANES);
  plastHit = new Uint32Array(MAX_PLANES * 4);
  // music box
  boxPhase = 0;       // time within on/off cycle
  boxAngle = 0;
  boxOn = 0;          // 0..1 visual presence
  noteCount = 0;
  noteRadius = 2.1;

  level(id: WeaponId) { return this.weapons.get(id) ?? 0; }

  addWeapon(id: WeaponId) { this.weapons.set(id, Math.min(WEAPON_INFO[id].maxLevel, this.level(id) + 1)); }
  addPassive(id: PassiveId, p: Player) {
    const lv = Math.min(PASSIVE_INFO[id].maxLevel, (this.passives.get(id) ?? 0) + 1);
    this.passives.set(id, lv);
    this.applyPassives(p);
  }

  applyPassives(p: Player) {
    const lv = (id: PassiveId) => this.passives.get(id) ?? 0;
    const s = p.stats;
    const oldMax = s.maxHp;
    s.maxHp = 100 + 20 * lv('pillow');
    if (s.maxHp > oldMax) p.hp += s.maxHp - oldMax;
    s.regen = 0.3 * lv('milk');
    s.speedMul = 1 + 0.07 * lv('candy');
    s.pickupMul = 1 + 0.3 * lv('photo');
    s.cooldownMul = Math.pow(0.93, lv('fan'));
    s.critChance = 0.05 + 0.07 * lv('sticker');
  }

  private roll(base: number, p: Player): { dmg: number; crit: boolean } {
    const crit = Math.random() < p.stats.critChance;
    const v = base * p.stats.damageMul * (crit ? 2 : 1) * (0.9 + Math.random() * 0.2);
    return { dmg: Math.round(v), crit };
  }

  update(dt: number, time: number, p: Player, e: Enemies, hit: (h: HitEvent, kx: number, ky: number) => void, sfx: (name: string) => void) {
    const cdm = p.stats.cooldownMul;

    // ---------------- 小夜灯 ----------------
    const nl = this.level('nightlight');
    this.auraPulse = Math.max(0, this.auraPulse - dt * 3);
    if (nl > 0) {
      const L = nl - 1;
      this.auraTimer -= dt;
      if (this.auraTimer <= 0) {
        this.auraTimer = T.nightlight.tick[L] * cdm;
        const r = this.auraRadius(p);
        let any = false;
        e.query(p.x, p.y, r, (i, d2) => {
          const { dmg, crit } = this.roll(T.nightlight.dmg[L], p);
          const d = Math.sqrt(d2) || 1;
          const push = T.nightlight.push[L];
          hit({ i, dmg, crit, x: e.x[i], y: e.y[i] }, ((e.x[i] - p.x) / d) * push, ((e.y[i] - p.y) / d) * push);
          any = true;
        });
        if (any) { this.auraPulse = 1; }
      }
    }

    // ---------------- 纸飞机 ----------------
    const pl = this.level('plane');
    if (pl > 0) {
      const L = pl - 1;
      this.planeTimer -= dt;
      if (this.planeTimer <= 0) {
        this.planeTimer = T.plane.cd[L] * cdm;
        const n = T.plane.count[L];
        const taken = new Set<number>();
        for (let k = 0; k < n; k++) {
          const t = e.nearest(p.x, p.y, 14, (i) => taken.has(i));
          if (t >= 0) taken.add(t);
          let ax: number, ay: number;
          if (t >= 0) { ax = e.x[t] - p.x; ay = e.y[t] - p.y; }
          else { const a = Math.random() * Math.PI * 2; ax = Math.cos(a); ay = Math.sin(a); }
          const l = Math.hypot(ax, ay) || 1;
          const spread = (k - (n - 1) / 2) * 0.35;
          const c = Math.cos(spread), s = Math.sin(spread);
          const dx = (ax / l) * c - (ay / l) * s, dy = (ax / l) * s + (ay / l) * c;
          this.firePlane(p.x, p.y, dx * 9.5, dy * 9.5, t, t >= 0 ? e.uid[t] : 0, T.plane.dmg[L], T.plane.pierce[L]);
        }
        if (n > 0) sfx('plane');
      }
    }
    for (let k = 0; k < this.pn; k++) {
      this.plife[k] -= dt;
      if (this.plife[k] <= 0) { this.removePlane(k--); continue; }
      // re-acquire target if it died / slot reused
      let t = this.ptarget[k];
      if (t < 0 || t >= e.n || e.uid[t] !== this.ptuid[k]) {
        t = e.nearest(this.px[k], this.py[k], 7);
        this.ptarget[k] = t; this.ptuid[k] = t >= 0 ? e.uid[t] : 0;
      }
      if (t >= 0) {
        const ax = e.x[t] - this.px[k], ay = e.y[t] - this.py[k];
        const l = Math.hypot(ax, ay) || 1;
        const sp = Math.hypot(this.pvx[k], this.pvy[k]);
        const turn = 1 - Math.exp(-4.2 * dt);
        this.pvx[k] += ((ax / l) * sp - this.pvx[k]) * turn;
        this.pvy[k] += ((ay / l) * sp - this.pvy[k]) * turn;
        const nl2 = Math.hypot(this.pvx[k], this.pvy[k]) || 1;
        this.pvx[k] *= sp / nl2; this.pvy[k] *= sp / nl2;
      }
      this.px[k] += this.pvx[k] * dt; this.py[k] += this.pvy[k] * dt;
      // collisions
      let removed = false;
      e.query(this.px[k], this.py[k], 0.5, (i) => {
        if (removed) return;
        const base = k * 4;
        for (let h = 0; h < 4; h++) if (this.plastHit[base + h] === e.uid[i]) return;
        for (let h = 3; h > 0; h--) this.plastHit[base + h] = this.plastHit[base + h - 1];
        this.plastHit[base] = e.uid[i];
        const { dmg, crit } = this.roll(this.pdmg[k], p);
        const sp = Math.hypot(this.pvx[k], this.pvy[k]) || 1;
        hit({ i, dmg, crit, x: e.x[i], y: e.y[i] }, (this.pvx[k] / sp) * 3, (this.pvy[k] / sp) * 3);
        this.ppierce[k]--;
        if (this.ppierce[k] <= 0) removed = true;
        else { this.ptarget[k] = -1; }
      });
      if (removed) this.removePlane(k--);
    }

    // ---------------- 八音盒 ----------------
    const mb = this.level('musicbox');
    if (mb > 0) {
      const L = mb - 1;
      const on = T.musicbox.on[L], off = T.musicbox.off[L] * cdm;
      this.boxPhase += dt;
      if (this.boxPhase > on + off) { this.boxPhase = 0; sfx('musicbox'); }
      const active = this.boxPhase < on;
      this.boxOn += ((active ? 1 : 0) - this.boxOn) * (1 - Math.exp(-8 * dt));
      this.boxAngle += dt * 2.7;
      this.noteCount = T.musicbox.notes[L];
      this.noteRadius = T.musicbox.radius[L] * p.stats.areaMul;
      if (active && this.boxOn > 0.6) {
        for (let k = 0; k < this.noteCount; k++) {
          const a = this.boxAngle + (k / this.noteCount) * Math.PI * 2;
          const nx = p.x + Math.cos(a) * this.noteRadius, ny = p.y + Math.sin(a) * this.noteRadius;
          e.query(nx, ny, 0.55, (i) => {
            if (time - e.noteHit[i] < 0.45) return;
            e.noteHit[i] = time;
            const { dmg, crit } = this.roll(T.musicbox.dmg[L], p);
            const dx = e.x[i] - p.x, dy = e.y[i] - p.y, d = Math.hypot(dx, dy) || 1;
            hit({ i, dmg, crit, x: e.x[i], y: e.y[i] }, (dx / d) * 5, (dy / d) * 5);
          });
        }
      }
    } else { this.boxOn = 0; this.noteCount = 0; }
  }

  auraRadius(p: Player) {
    const nl = this.level('nightlight');
    return nl > 0 ? T.nightlight.radius[nl - 1] * p.stats.areaMul : 0;
  }

  private firePlane(x: number, y: number, vx: number, vy: number, target: number, tuid: number, dmg: number, pierce: number) {
    if (this.pn >= MAX_PLANES) return;
    const k = this.pn++;
    this.px[k] = x; this.py[k] = y; this.pvx[k] = vx; this.pvy[k] = vy;
    this.plife[k] = 2.4; this.ppierce[k] = pierce; this.ptarget[k] = target; this.ptuid[k] = tuid; this.pdmg[k] = dmg;
    for (let h = 0; h < 4; h++) this.plastHit[k * 4 + h] = 0;
  }

  private removePlane(k: number) {
    const l = --this.pn;
    if (k === l) return;
    this.px[k] = this.px[l]; this.py[k] = this.py[l]; this.pvx[k] = this.pvx[l]; this.pvy[k] = this.pvy[l];
    this.plife[k] = this.plife[l]; this.ppierce[k] = this.ppierce[l]; this.ptarget[k] = this.ptarget[l];
    this.ptuid[k] = this.ptuid[l]; this.pdmg[k] = this.pdmg[l];
    for (let h = 0; h < 4; h++) this.plastHit[k * 4 + h] = this.plastHit[l * 4 + h];
  }
}

// ------------------------------------------------------------------ upgrade offers

export interface Offer {
  key: string;
  info: ItemInfo;
  nextLevel: number;      // level after taking it
  isNew: boolean;
  text: string;
  rare?: boolean;
  apply: () => void;
}

export function buildOffers(a: Arsenal, p: Player, count: number, banned: Set<string>, onHeal: () => void): Offer[] {
  const pool: Array<Offer & { w: number }> = [];
  const maxWeapons = 6, maxPassives = 6;
  for (const id of Object.keys(WEAPON_INFO) as WeaponId[]) {
    if (banned.has(id)) continue;
    const lv = a.level(id), info = WEAPON_INFO[id];
    if (lv >= info.maxLevel) continue;
    if (lv === 0 && a.weapons.size >= maxWeapons) continue;
    pool.push({ key: id, info, nextLevel: lv + 1, isNew: lv === 0, text: lv === 0 ? info.blurb : info.levels[lv], w: lv > 0 ? 1.25 : 1.0, apply: () => a.addWeapon(id) });
  }
  for (const id of Object.keys(PASSIVE_INFO) as PassiveId[]) {
    if (banned.has(id)) continue;
    const lv = a.passives.get(id) ?? 0, info = PASSIVE_INFO[id];
    if (lv >= info.maxLevel) continue;
    if (lv === 0 && a.passives.size >= maxPassives) continue;
    pool.push({ key: id, info, nextLevel: lv + 1, isNew: lv === 0, text: lv === 0 ? info.blurb : info.levels[lv], w: lv > 0 ? 0.95 : 0.8, apply: () => a.addPassive(id, p) });
  }
  const out: Offer[] = [];
  while (out.length < count && pool.length) {
    let total = 0; for (const o of pool) total += o.w;
    let r = Math.random() * total, idx = 0;
    for (; idx < pool.length; idx++) { r -= pool[idx].w; if (r <= 0) break; }
    idx = Math.min(idx, pool.length - 1);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  while (out.length < count) {
    out.push({
      key: 'snack' + out.length,
      info: { id: 'snack', kind: 'passive', name: '一杯热可可', tags: ['童年'], maxLevel: 1, blurb: '', levels: [] },
      nextLevel: 1, isNew: false, text: '回复 30 生命。', apply: onHeal,
    });
  }
  return out;
}
