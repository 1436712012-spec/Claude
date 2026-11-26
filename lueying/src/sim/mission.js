// Mission：任务阶段、场核回收、撤离、影像证据与上传、黑箱、评级、航迹回放数据。
import { MISSION, WINGMEN } from './config.js';
import { WRECK, EXTRACT, inCompound } from './level.js';
import { stimulate, setAware } from './detection.js';

export const PHASE_LABEL = {
  recon: '侦察', infiltrate: '潜入', retrieve: '回收', exfil: '撤离', breakout: '突围', combat: '开战', done: '结算',
};

export const RATINGS = {
  ghost: { name: '幽灵', desc: '全程没有敌人进入搜索状态，也没有被卫星拍到', rank: 5 },
  shadow: { name: '影子', desc: '有敌人起疑或搜索，或被卫星拍到，但没有拉响警报', rank: 4 },
  thunder: { name: '雷霆', desc: '先把研究所变成黑箱，再正面击溃守军和武装直升机，带出场核且没有影像外传', rank: 4 },
  breakout: { name: '突围', desc: '拉响警报后带着场核撤离，且没有影像外传', rank: 3 },
  exposed: { name: '曝光', desc: '影像上传成功，隐庭可能被世界看见；任务失败', rank: 1 },
  fail: { name: '失败', desc: '飞船被击毁，或没有带出场核', rank: 0 },
};

export class Exposure {
  constructor(w) {
    this.w = w;
    this.clips = [];
    this.sat = { active: false, progress: 0, aborts: 0, rebootNotified: false };
    this.uploaded = null;
    this.bedrockNotified = false;
  }

  terminalOnline() {
    const T = this.w.terminal;
    return T.alive && this.w.power.on && !(T.disabled > 0);
  }

  terminalPermanentlyOffline() {
    return !this.w.terminal.alive || !this.w.power.on;
  }

  add(o, subject) {
    const w = this.w;
    const channel = o.kind === 'civ' ? 'cell' : 'sat';
    const c = { id: this.clips.length + 1, by: o.id, byName: o.name, kind: o.kind, channel, t: w.time, subject: subject.id, phantom: !!subject.phantom, x: subject.pos.x, z: subject.pos.z, progress: 0, uploaded: false };
    this.clips.push(c);
    w.mission.log({ type: 'clip', by: o.id, name: o.name, kind: o.kind, x: subject.pos.x, z: subject.pos.z, subject: subject.id, channel });
    w.emitEvent({ type: 'clip', clip: c });
    if (o.kind !== 'civ' && o.kind !== 'camera' && o.kind !== 'drone') w.bark(o, 'phone');
    return c;
  }

  get pendingSat() { return this.clips.filter((c) => c.channel === 'sat' && !c.uploaded); }
  get pendingCell() { return this.clips.filter((c) => c.channel === 'cell' && !c.uploaded); }
  get any() { return this.clips.length > 0; }

  uploadDuration() {
    return MISSION.uploadTime + (this.bedrockJammingTerminal() ? MISSION.jamBonus : 0);
  }

  bedrockJammingTerminal() {
    const w = this.w;
    const b = w.wingmanById('bedrock');
    if (!b || b.out || b.ship.destroyed) return false;
    const d = Math.hypot(b.ship.pos.x - w.terminal.x, b.ship.pos.z - w.terminal.z);
    return w.camp.state !== 'normal' && d < WINGMEN.jamRadius + 140;
  }

  terminalLost(reason) {
    const w = this.w;
    if (this.sat.active) {
      this.sat.active = false; this.sat.progress = 0; this.sat.aborts++;
      w.emitEvent({ type: 'uploadCut', reason, permanent: true });
      w.enemyRadio('uploadCut');
    }
    w.emitEvent({ type: 'terminalLost', reason });
    w.mission.log({ type: 'terminal', reason, x: w.terminal.x, z: w.terminal.z });
  }

  update(dt) {
    const w = this.w;
    if (this.uploaded) return;
    const satPending = this.pendingSat.length > 0;
    const campAlerted = w.camp.state !== 'normal';
    if (satPending && campAlerted) {
      if (this.terminalOnline()) {
        if (!this.sat.active) {
          this.sat.active = true;
          this.sat.progress = 0;
          w.emitEvent({ type: 'uploadStart' });
          w.enemyRadio('upload');
          w.courtSay('exposedWarn');
          w.mission.log({ type: 'upload', x: w.terminal.x, z: w.terminal.z });
        }
        if (this.bedrockJammingTerminal() && !this.bedrockNotified) {
          this.bedrockNotified = true;
          w.wingmanById('bedrock')?.say('terminalJam', { force: true });
        }
        this.sat.progress += dt / this.uploadDuration();
        if (this.sat.progress >= 1) {
          this.sat.progress = 1;
          for (const c of this.pendingSat) c.uploaded = true;
          this.uploaded = { channel: 'sat', t: w.time };
          w.mission.fail('exposed');
        }
      } else if (this.sat.active) {
        this.sat.active = false;
        this.sat.progress = 0;
        this.sat.aborts++;
        w.emitEvent({ type: 'uploadCut', reason: 'offline', permanent: this.terminalPermanentlyOffline() });
        w.enemyRadio('uploadCut');
        w.mission.log({ type: 'uploadCut', x: w.terminal.x, z: w.terminal.z });
      }
    }
    // 路人的蜂窝上传：磐石干扰场内暂停
    for (const c of this.pendingCell) {
      const civ = w.civilians.find((x) => x.id === c.by);
      const jammed = w.jamCovers(civ ? civ.pos : c);
      const dead = civ && civ.disabled > 0;
      if (jammed || dead) continue;
      c.progress += dt / MISSION.cellUploadTime;
      if (c.progress >= 1) {
        c.uploaded = true;
        this.uploaded = { channel: 'cell', t: w.time };
        w.mission.fail('exposed');
        return;
      }
    }
  }

  // HUD：最紧迫的上传
  urgent() {
    let best = null;
    if (this.sat.active) best = { channel: 'sat', progress: this.sat.progress, remaining: (1 - this.sat.progress) * this.uploadDuration(), label: '卫星终端上传' };
    for (const c of this.pendingCell) {
      const rem = (1 - c.progress) * MISSION.cellUploadTime;
      if (c.progress > 0 && (!best || rem < best.remaining)) best = { channel: 'cell', progress: c.progress, remaining: rem, label: '路人手机上传' };
    }
    return best;
  }
}

export class Mission {
  constructor(w) {
    this.w = w;
    this.phase = 'recon';
    this.core = { taken: false, progress: 0, holding: false, takenAt: null, discovered: false };
    this.over = false;
    this.result = null;
    this.events = [];
    this.trails = { player: [], echo: [], glimmer: [], bedrock: [] };
    this.trailT = 0;
    this.stats = {
      suspicious: 0, search: 0, alarm: false, alarmAt: null, satCaptures: [], kills: 0, scrapes: 0, pulses: 0,
      weaponsUsed: new Set(), clips: 0, maxSus: 0, firstSearch: null, defeatedAt: null, blackboxAt: null,
    };
  }

  log(e) {
    this.events.push({ t: this.w.time, ...e });
  }

  coreCheck(g) {
    const w = this.w;
    if (!this.core.taken || this.core.discovered || !g.alive || g.down || g.stunned > 0) return;
    this.core.discovered = true;
    w.bark(g, 'core', true);
    stimulate(w, g, 75, 'core', { x: WRECK.x, y: 5, z: WRECK.z });
    g.lastKnown = { x: WRECK.x, y: 5, z: WRECK.z };
    if (w.camp.state === 'normal') {
      setAware(w, g, 'search', 'core');
      for (const o of w.guards) if (o !== g && o.alive && !o.down) stimulate(w, o, 38, 'radio', w.player.pos);
    }
    w.emitEvent({ type: 'coreDiscovered' });
    this.log({ type: 'core', id: g.id, name: g.name, x: WRECK.x, z: WRECK.z });
  }

  fail(kind) {
    if (this.over) return;
    this.finish(kind);
  }

  finish(kind) {
    const w = this.w;
    if (this.over) return;
    this.over = true;
    this.phase = 'done';
    let rating = kind;
    if (!rating) rating = this.evaluate();
    this.result = { rating, time: w.time, ...this.summary() };
    w.emitEvent({ type: 'missionOver', rating });
  }

  evaluate() {
    const w = this.w;
    if (w.exposure.uploaded) return 'exposed';
    if (w.player.destroyed || !this.core.taken) return 'fail';
    const s = this.stats;
    if (!s.alarm) {
      if (s.search === 0 && s.satCaptures.length === 0) return 'ghost';
      return 'shadow';
    }
    const bb = w.combat.blackboxAt;
    if (bb !== null && s.defeatedAt !== null && bb <= s.defeatedAt) return 'thunder';
    return 'breakout';
  }

  summary() {
    const w = this.w, s = this.stats;
    return {
      kills: s.kills, satCaptures: s.satCaptures.length, clips: w.exposure.clips.length, uploads: w.exposure.uploaded ? 1 : 0,
      search: s.search, suspicious: s.suspicious, alarm: s.alarm, pulses: s.pulses, scrapes: s.scrapes,
      weaponsUsed: [...s.weaponsUsed], blackbox: w.combat.blackboxAt !== null, garrisonDefeated: s.defeatedAt !== null,
    };
  }

  update(dt) {
    const w = this.w, p = w.player;
    if (this.over) return;
    // 航迹记录
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.5;
      for (const s of w.allShips()) {
        const tr = this.trails[s.id];
        if (tr) tr.push([Math.round(s.pos.x * 10) / 10, Math.round(s.pos.z * 10) / 10, w.time]);
      }
    }
    // 阶段
    if (this.phase === 'recon' && (p.pos.z < -105 || inCompound(p.pos.x, p.pos.z, 30))) this.phase = 'infiltrate';
    if ((this.phase === 'recon' || this.phase === 'infiltrate') && Math.hypot(p.pos.x - WRECK.x, p.pos.z - WRECK.z) < 40) this.phase = 'retrieve';
    if (w.camp.state === 'alarm' && this.phase !== 'combat') this.phase = w.isBlackbox() ? 'combat' : 'breakout';
    // 回收
    if (!this.core.taken) this._retrieve(dt);
    // 撤离
    if (this.core.taken && Math.hypot(p.pos.x - EXTRACT.x, p.pos.z - EXTRACT.z) < EXTRACT.r) {
      this.finish();
      return;
    }
    if (p.destroyed) { this.finish('fail'); return; }
    // 守军被击溃
    if (this.stats.defeatedAt === null && w.combat.garrisonDefeated()) {
      this.stats.defeatedAt = w.time;
      this.log({ type: 'defeated', x: p.pos.x, z: p.pos.z });
      w.emitEvent({ type: 'garrisonDefeated' });
      w.radioSay('echo', '守军清空了。');
      w.radioSay('glimmer', '整座研究所……安静了。');
    }
    for (const o of w.observers) if (o.focus === 'player' && o.sus > this.stats.maxSus) this.stats.maxSus = o.sus;
  }

  _retrieve(dt) {
    const w = this.w, p = w.player;
    const d = Math.hypot(p.pos.x - WRECK.x, p.pos.z - WRECK.z);
    const ok = d <= MISSION.coreRadius && p.hAbove <= MISSION.coreLowMax && p.speed < 3 && !p.silent && p.spoolT <= 0 && p.jumpT <= 0;
    const C = this.core;
    if (ok) {
      if (!C.holding) { C.holding = true; w.emitEvent({ type: 'coreStart' }); }
      p.lockPower = 0.4;
      p.lockMove = true;
      C.progress += dt / MISSION.coreHold;
      w.flicker = { x: WRECK.x, z: WRECK.z, r: 45, t: w.time };
      // 灯光闪烁：附近守卫会注意到
      for (const g of w.guards) {
        if (!g.alive || g.down || g.stunned > 0) continue;
        const gd = Math.hypot(g.pos.x - WRECK.x, g.pos.z - WRECK.z);
        if (gd < 45) { g.pending += (1 - gd / 45) * 7 * dt; g.cause = 'trace:emi'; g.lastKnown = { x: WRECK.x, y: 6, z: WRECK.z }; g.lastStim = w.time; }
      }
      if (C.progress >= 1) {
        C.taken = true; C.holding = false; C.takenAt = w.time;
        p.lockPower = null; p.lockMove = false;
        this.phase = 'exfil';
        w.emitEvent({ type: 'coreTaken' });
        w.courtSay('core');
        w.wingmanById('glimmer')?.say('coreClock', { force: true });
        this.log({ type: 'coreTaken', x: WRECK.x, z: WRECK.z });
        w.flicker = null;
      }
    } else {
      if (C.holding) {
        C.holding = false;
        p.lockPower = null; p.lockMove = false;
        w.emitEvent({ type: 'coreAbort' });
        w.flicker = null;
      }
      C.progress = Math.max(0, C.progress - dt * 0.5);
    }
  }
}
