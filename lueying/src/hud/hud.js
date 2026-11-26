// HUD：投影在座舱玻璃上的读数。极细、极安静；随飞船震动轻微晃动。
// 场功率环、离地高度条（标出三档）、速度、热量、扰动强度、场脉冲冷却、侦测弧、卫星过境条、曝光度、武器、僚机、无线电字幕、小地图、指令轮盘、调试层。
import * as THREE from 'three';
import { SHIP, WEAPONS, CLOCK, WINGMEN, DETECT, MISSION } from '../sim/config.js';
import { SPEAKERS } from '../sim/lines.js';
import { ORDER_LABEL } from '../sim/wingmen.js';
import { PHASE_LABEL } from '../sim/mission.js';
import { causeLabel, AWARE_LABEL, dirFromYawPitch, radarCheck } from '../sim/detection.js';
import { clamp } from '../sim/noise.js';
import { EXTRACT, WRECK } from '../sim/level.js';
import { renderMapCanvas } from './mapcanvas.js';

const LANG = { pt: '葡', es: '西', en: '英', ru: '俄' };
const fmt = (s) => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const v3 = new THREE.Vector3();

export class HUD {
  constructor(root, world, renderer) {
    this.w = world;
    this.r = renderer;
    this.root = root;
    root.innerHTML = `
      <canvas id="hudCanvas"></canvas>
      <div id="hudShake">
        <div class="hud-top">
          <div id="satBar" class="sat"><div class="sat-label">卫星过境</div><div class="sat-track"><div class="sat-fill"></div></div><div class="sat-time">--:--</div></div>
          <div id="expoBar" class="expo hidden"><div class="expo-label">曝光度</div><div class="expo-track"><div class="expo-fill"></div></div><div class="expo-text"></div></div>
          <div id="objective" class="objective"></div>
        </div>
        <div id="centerMsg" class="center-msg"></div>
        <div id="coreRing" class="core-ring hidden"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="bg"/><circle cx="50" cy="50" r="44" class="fg"/></svg><span>回收场核</span></div>
        <div class="hud-left">
          <div id="radio" class="radio"></div>
          <div class="gauges">
            <div class="gauge-block"><div id="pwrText" class="big">70<small>%</small></div><div class="lbl">场功率</div></div>
            <div class="gauge-block"><div id="spdText" class="big">0<small>m/s</small></div><div class="lbl">速度</div></div>
            <div class="gauge-block"><div id="altText" class="big">1.8<small>m</small></div><div class="lbl" id="altMode">巡航</div></div>
          </div>
          <div class="rows">
            <div class="row"><span class="lbl">热量</span><div class="bar"><div id="heatFill" class="fill heat"></div></div><span id="heatTxt" class="num">0</span></div>
            <div class="row"><span class="lbl">扰动</span><div class="bar"><div id="distFill" class="fill dist"></div></div><span id="distTxt" class="tags"></span></div>
            <div class="row"><span class="lbl">场脉冲</span><div class="bar"><div id="pulseFill" class="fill pulse"></div></div><span id="pulseTxt" class="num">就绪</span></div>
            <div class="row"><span class="lbl">船体</span><div class="bar"><div id="hullFill" class="fill hull"></div></div><span id="hullTxt" class="num">100</span></div>
          </div>
        </div>
        <div class="hud-bottom">
          <div id="weapons" class="weapons"></div>
          <div id="resonance" class="resonance"></div>
        </div>
        <div class="hud-right">
          <canvas id="minimap" width="220" height="220"></canvas>
          <div id="wingPanel" class="wing-panel"></div>
          <div id="orders" class="orders"></div>
        </div>
        <div id="barks" class="barks"></div>
        <div id="wheel" class="wheel hidden"></div>
        <div id="statusTags" class="status-tags"></div>
      </div>
      <div id="debugPanel" class="debug hidden"></div>
      <div id="dropletLayer" class="droplets"></div>
    `;
    const $ = (id) => root.querySelector('#' + id);
    this.el = {
      canvas: $('hudCanvas'), shake: $('hudShake'), sat: $('satBar'), expo: $('expoBar'), objective: $('objective'), center: $('centerMsg'), core: $('coreRing'),
      radio: $('radio'), pwr: $('pwrText'), spd: $('spdText'), alt: $('altText'), altMode: $('altMode'), heat: $('heatFill'), heatTxt: $('heatTxt'),
      dist: $('distFill'), distTxt: $('distTxt'), pulse: $('pulseFill'), pulseTxt: $('pulseTxt'), hull: $('hullFill'), hullTxt: $('hullTxt'),
      weapons: $('weapons'), reso: $('resonance'), mini: $('minimap'), wing: $('wingPanel'), orders: $('orders'), barks: $('barks'), wheel: $('wheel'),
      tags: $('statusTags'), debug: $('debugPanel'), drops: $('dropletLayer'),
    };
    this.ctx = this.el.canvas.getContext('2d');
    this.mctx = this.el.mini.getContext('2d');
    this.map = renderMapCanvas(world.terrain, 1000);
    this.radioLines = [];
    this.barkLines = [];
    this.centerT = 0;
    this.debug = false;
    this.wheelOpen = false;
    this.wheelSel = -1;
    this.targeting = null;
    this.fps = 60;
    this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
    this.lastWeaponsKey = '';
    this.lastWingKey = '';
    this.drops = [];
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = this.el.canvas;
    c.width = Math.floor(window.innerWidth * dpr); c.height = Math.floor(window.innerHeight * dpr);
    c.style.width = window.innerWidth + 'px'; c.style.height = window.innerHeight + 'px';
    this.dpr = dpr;
  }

  flash(text, cls = '', dur = 2.2) {
    this.el.center.innerHTML = `<span class="${cls}">${text}</span>`;
    this.el.center.classList.add('show');
    this.centerT = dur;
  }

  // ---------- 事件 ----------
  onEvent(e) {
    const w = this.w;
    switch (e.type) {
      case 'radio': {
        const S = SPEAKERS[e.speaker] || { name: e.speaker, color: '#ccc' };
        this.radioLines.push({ html: `<b style="color:${S.color}">${S.name}</b>　${e.text}${e.zh ? `<i>　${e.zh}</i>` : ''}`, t: e.dur + 3 });
        if (this.radioLines.length > 4) this.radioLines.shift();
        break;
      }
      case 'bark': {
        if (e.dist > 90) break;
        this.barkLines.push({ html: `<b>${e.name}·${LANG[e.lang] || ''}</b>　${e.text}<i>　${e.zh}</i>`, t: 4 });
        if (this.barkLines.length > 3) this.barkLines.shift();
        break;
      }
      case 'pa': this.barkLines.push({ html: `<b>值班广播</b>　${e.text}<i>　${e.zh}</i>`, t: 5 }); break;
      case 'alarm': this.flash('警 报', 'alarm', 3); break;
      case 'cooldown': this.flash('营地冷却 · 巡逻加密', 'amber', 3); break;
      case 'satStart': this.flash('卫星过顶 · 25 秒', 'amber', 2); break;
      case 'satCapture': if (e.source === 'player') this.flash('被卫星拍到', 'amber', 2.5); break;
      case 'clip': this.flash(`影像被记录 · ${e.clip.byName}${e.clip.phantom ? '（幻影）' : ''}`, 'alarm', 2.5); break;
      case 'uploadStart': this.flash('卫星终端开始上传', 'alarm', 2.5); break;
      case 'uploadCut': this.flash(e.permanent ? '上传切断 · 终端永久离线' : '上传切断 · 终端 20 秒后重启', 'field', 3); break;
      case 'coreTaken': this.flash('场核已入舱 · 返回回收点', 'field', 3); break;
      case 'blackbox': this.flash('黑 箱 · 研究所与世隔绝', 'field', 3.5); break;
      case 'ship:overheat': if (e.ship === 'player') this.flash('过热 · 强制降功率', 'amber', 2); break;
      case 'weaponMsg': this.flash(e.text, 'amber', 1.8); break;
      case 'garrisonDefeated': this.flash('守军已被击溃', 'field', 3); break;
      case 'heliPhase': this.flash(e.phase === 2 ? '红隼 · 火箭齐射' : '红隼 · 低空死斗', 'alarm', 2); break;
      case 'wave': if (e.wave === 'heliInbound') this.flash('武装直升机正在赶来', 'alarm', 2.5); break;
      case 'powerOut': this.flash('研究所断电', 'field', 2.5); break;
      case 'coreDiscovered': this.flash('残骸失踪已被发现', 'alarm', 2.5); break;
      case 'select': this.lastWingKey = ''; break;
    }
  }

  // ---------- 每帧 ----------
  update(dt, view, ui) {
    const w = this.w, P = w.player, E = this.el;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    // 震动
    const vib = P.vibration();
    const j = (vib * 1.2 + P.impact * 3) * (Math.random() - 0.5);
    E.shake.style.transform = `translate(${j.toFixed(2)}px, ${(j * 0.7 - P.landing * 4).toFixed(2)}px)`;
    // 读数
    E.pwr.innerHTML = `${Math.round(P.power * 100)}<small>%</small>`;
    E.spd.innerHTML = `${Math.round(P.speed)}<small>m/s</small>`;
    E.alt.innerHTML = `${P.hAbove.toFixed(1)}<small>m</small>`;
    E.altMode.textContent = P.silent ? '场静默' : P.jumpT > 0 ? '跃升' : P.altMode === 'low' ? '贴地' : '巡航';
    E.heat.style.width = `${P.heat}%`;
    E.heat.classList.toggle('hot', P.heat > 75 || P.overheated);
    E.heatTxt.textContent = P.overheated ? '过热' : Math.round(P.heat);
    const dist = w.traces.disturbance('player');
    E.dist.style.width = `${dist.value * 100}%`;
    E.distTxt.textContent = dist.labels.join(' · ');
    E.pulse.style.width = `${(1 - P.pulseCd / SHIP.pulse.cooldown) * 100}%`;
    E.pulseTxt.textContent = P.pulseCd > 0 ? `${Math.ceil(P.pulseCd)}s` : '就绪';
    E.hull.style.width = `${P.hull}%`;
    E.hull.classList.toggle('low', P.hull < 35);
    E.hullTxt.textContent = Math.round(P.hull);
    // 卫星
    const sat = w.satellite;
    const satEl = E.sat;
    if (sat.passing) {
      satEl.classList.add('passing');
      satEl.querySelector('.sat-label').textContent = '卫星过顶中';
      satEl.querySelector('.sat-fill').style.width = `${((sat.end - w.time) / CLOCK.satDuration) * 100}%`;
      satEl.querySelector('.sat-time').textContent = `${Math.ceil(sat.end - w.time)}s`;
    } else {
      satEl.classList.remove('passing');
      const left = sat.next - w.time;
      satEl.querySelector('.sat-label').textContent = '下次卫星过境';
      satEl.querySelector('.sat-fill').style.width = `${clamp(1 - left / CLOCK.satPeriod, 0, 1) * 100}%`;
      satEl.querySelector('.sat-time').textContent = fmt(left);
      satEl.classList.toggle('warn', left < CLOCK.satWarn);
    }
    // 曝光
    const X = w.exposure;
    if (X.any) {
      E.expo.classList.remove('hidden');
      const u = X.urgent();
      const n = X.clips.length;
      E.expo.querySelector('.expo-fill').style.width = `${u ? u.progress * 100 : 8}%`;
      E.expo.querySelector('.expo-text').textContent = u ? `${u.label} · 还剩 ${Math.ceil(u.remaining)} 秒` : `影像证据 ${n} 段 · ${w.camp.state === 'normal' ? '警报后将上传' : X.terminalPermanentlyOffline() ? '终端离线' : '终端重启中'}`;
      E.expo.classList.toggle('urgent', !!u);
    } else E.expo.classList.add('hidden');
    // 目标
    const M = w.mission;
    let obj;
    if (!M.core.taken) obj = M.phase === 'recon' ? '侦察：在林缘树冠下观察研究所（右键放大镜头）' : '潜入机库，在残骸 6 米内贴地悬浮 5 秒';
    else obj = '带着场核返回淹水林的回收点';
    if (w.camp.state === 'alarm') obj = X.sat.active ? '切断上传：场脉冲瘫痪终端，或摧毁终端 / 发电机房' : w.isBlackbox() ? '黑箱已成立 · 可以放开打' : M.core.taken ? '突围：赶往回收点' : '突围或开战';
    const sunset = CLOCK.sunset - w.time;
    E.objective.innerHTML = `<span class="phase">${PHASE_LABEL[M.phase] || ''}</span>${obj}<span class="clock">${sunset > 0 ? `日落 ${fmt(sunset)}` : '入夜'} · ${w.env.rain > 0.05 ? '暴雨' : '雨停'}</span>`;
    // 回收进度
    if (M.core.holding) { E.core.classList.remove('hidden'); E.core.querySelector('.fg').style.strokeDashoffset = `${276 * (1 - M.core.progress)}`; }
    else E.core.classList.add('hidden');
    // 状态标签
    const tags = [];
    if (P.silent) tags.push('<span class="tag field">场静默</span>');
    if (P.spoolT > 0) tags.push('<span class="tag amber">场升压</span>');
    if (P.boosting) tags.push('<span class="tag">加速</span>');
    if (P.weaponLock > 0) tags.push('<span class="tag alarm">湮灭束散热</span>');
    if (P.camoFactor() < 0.7) tags.push('<span class="tag dim">外壳匹配</span>');
    if (w.jam) tags.push('<span class="tag field">干扰场</span>');
    if (w.isBlackbox()) tags.push('<span class="tag field">黑箱</span>');
    E.tags.innerHTML = tags.join('');
    // 中央提示淡出
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) E.center.classList.remove('show'); }
    // 无线电与喊话
    this.radioLines.forEach((l) => (l.t -= dt));
    this.radioLines = this.radioLines.filter((l) => l.t > 0);
    E.radio.innerHTML = this.radioLines.map((l) => `<div style="opacity:${clamp(l.t, 0, 1)}">${l.html}</div>`).join('');
    this.barkLines.forEach((l) => (l.t -= dt));
    this.barkLines = this.barkLines.filter((l) => l.t > 0);
    E.barks.innerHTML = this.barkLines.map((l) => `<div style="opacity:${clamp(l.t, 0, 1)}">${l.html}</div>`).join('');
    this._weapons();
    this._wing();
    this._minimap(view);
    this._canvas(view, ui);
    this._droplets(dt);
    if (this.debug) this._debugPanel(view);
  }

  _weapons() {
    const W = this.w.weapons;
    const parts = W.slots.map((id, i) => {
      const s = W.status(id);
      const sel = i === W.sel;
      const cd = s.cd > 0 ? `${Math.ceil(s.cd)}s` : s.locked ? '散热' : s.uses !== undefined ? `×${s.uses}` : '';
      return `<div class="wslot ${sel ? 'sel' : ''} ${s.kind}"><div class="wkey">${i + 5}</div><div class="wname">${s.name}</div><div class="wcd">${cd}</div><div class="wbar" style="width:${(1 - s.frac) * 100}%"></div></div>`;
    });
    const key = parts.join('');
    if (key !== this.lastWeaponsKey) { this.el.weapons.innerHTML = key; this.lastWeaponsKey = key; }
    const r = this.w.combat.resonance;
    this.el.reso.innerHTML = r > 0 ? `场共振 ${'◆'.repeat(r)}${'◇'.repeat(5 - r)}` : '';
  }

  _wing() {
    const w = this.w;
    const sel = w.selected;
    const rows = w.wingmen.map((m) => {
      const s = m.ship;
      const st = m.out ? '撤离战场' : ORDER_LABEL[m.order] || m.order;
      const seen = w.observers.some((o) => o.focus === m.id && o.sus > 30 && w.time - o.lastStim < 1.5);
      return `<div class="wm ${sel === m.id ? 'sel' : ''} ${seen ? 'seen' : ''} ${m.out ? 'out' : ''}"><b>${m.name}</b><span>${st}</span><i style="width:${s.hull}%"></i></div>`;
    });
    const set = w.orderSet();
    const ords = set.map((o, i) => `<span><kbd>${i + 1}</kbd>${ORDER_LABEL[o]}</span>`).join('') + (w.camp.state !== 'alarm' ? '<span><kbd>T</kbd>磐石干扰场</span>' : '');
    const key = rows.join('') + sel + ords;
    if (key !== this.lastWingKey) {
      this.el.wing.innerHTML = `<div class="wsel">指令对象 <kbd>Tab</kbd> <b>${sel === 'all' ? '全队' : WINGMEN.names[sel]}</b></div>` + rows.join('');
      this.el.orders.innerHTML = ords;
      this.lastWingKey = key;
    }
  }

  _minimap(view) {
    const c = this.mctx, w = this.w, P = w.player;
    const S = 220, R = 260; // 显示半径（米）
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); c.clip();
    c.globalAlpha = 0.78;
    const k = this.map.width / 2000; // px/m
    const sx = (P.pos.x + 1000) * k - R * k, sz = (P.pos.z + 1000) * k - R * k;
    c.drawImage(this.map, sx, sz, R * 2 * k, R * 2 * k, 0, 0, S, S);
    c.globalAlpha = 1;
    const toS = (x, z) => [S / 2 + ((x - P.pos.x) / R) * (S / 2), S / 2 + ((z - P.pos.z) / R) * (S / 2)];
    // 撤离点与残骸
    const [ex, ez] = toS(EXTRACT.x, EXTRACT.z);
    c.strokeStyle = 'rgba(143,227,232,0.9)'; c.lineWidth = 1.5; c.beginPath(); c.arc(ex, ez, 6, 0, 6.3); c.stroke();
    if (!w.mission.core.taken) { const [wx, wz] = toS(WRECK.x, WRECK.z); c.fillStyle = 'rgba(143,227,232,0.9)'; c.fillRect(wx - 2.5, wz - 2.5, 5, 5); }
    // 标记的敌人
    for (const o of w.observers) {
      const marked = w.marks.has(o.id) || w.debugAll || (w.camp.state === 'alarm' && o.visNow > 0.1);
      if (!marked || !o.alive || o.down) continue;
      const [x, z] = toS(o.pos.x, o.pos.z);
      c.fillStyle = o.aware === 'quiet' ? 'rgba(230,234,236,0.85)' : o.aware === 'suspicious' ? '#E3A04C' : '#E5483B';
      c.beginPath(); c.arc(x, z, o.kind === 'camera' ? 2 : 2.6, 0, 6.3); c.fill();
      if (o.kind === 'em') { c.strokeStyle = 'rgba(227,160,76,0.35)'; c.beginPath(); c.arc(x, z, (DETECT.em.radius / R) * (S / 2), 0, 6.3); c.stroke(); }
    }
    for (const s of w.swarm) if (s.alive && w.marks.has(s.id)) { const [x, z] = toS(s.pos.x, s.pos.z); c.fillStyle = '#E5483B'; c.fillRect(x - 1.5, z - 1.5, 3, 3); }
    // 雷达扫描线
    if (w.radar.alive && w.power.on) {
      const [rx, rz] = toS(w.radar.pos.x, w.radar.pos.z);
      const a = w.radar.angle;
      c.strokeStyle = 'rgba(229,72,59,0.35)'; c.beginPath(); c.moveTo(rx, rz); c.lineTo(rx - Math.sin(a) * 200, rz - Math.cos(a) * 200); c.stroke();
    }
    // 僚机
    const colors = { echo: '#BFE9EC', glimmer: '#F3D9A0', bedrock: '#C9D3C2' };
    for (const m of w.wingmen) { const [x, z] = toS(m.ship.pos.x, m.ship.pos.z); c.fillStyle = colors[m.id]; c.beginPath(); c.arc(x, z, 3, 0, 6.3); c.fill(); }
    // 自己 + 视向
    c.translate(S / 2, S / 2);
    c.rotate(-view.yaw);
    c.fillStyle = 'rgba(143,227,232,0.18)';
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 60, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); c.closePath(); c.fill();
    c.fillStyle = '#8FE3E8';
    c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 5); c.lineTo(-4, 5); c.closePath(); c.fill();
    c.restore();
    c.strokeStyle = 'rgba(143,227,232,0.35)'; c.lineWidth = 1; c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, 6.3); c.stroke();
    c.fillStyle = 'rgba(143,227,232,0.7)'; c.font = '10px ui-monospace, Menlo, monospace'; c.fillText('N', S / 2 - 3, 12);
    this.miniRect = this.el.mini.getBoundingClientRect();
    this.miniR = R;
  }

  // 小地图点选（手机：惊扰诱敌）
  minimapToWorld(clientX, clientY) {
    const r = this.miniRect, P = this.w.player;
    if (!r) return null;
    const x = (clientX - r.left) / r.width - 0.5, y = (clientY - r.top) / r.height - 0.5;
    return { x: P.pos.x + x * 2 * this.miniR, z: P.pos.z + y * 2 * this.miniR };
  }

  _project(x, y, z) {
    const cam = this.r.camera;
    v3.set(x, y, z);
    const toP = v3.clone().sub(cam.position);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const behind = toP.dot(fwd) < 0;
    v3.project(cam);
    const W = window.innerWidth, H = window.innerHeight;
    return { x: (v3.x * 0.5 + 0.5) * W, y: (-v3.y * 0.5 + 0.5) * H, behind, on: !behind && Math.abs(v3.x) < 1 && Math.abs(v3.y) < 1, dist: toP.length() };
  }

  _canvas(view, ui) {
    const c = this.ctx, w = this.w, P = w.player;
    const W = window.innerWidth, H = window.innerHeight;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    // 准星
    c.strokeStyle = 'rgba(143,227,232,0.75)'; c.lineWidth = 1;
    c.beginPath(); c.arc(cx, cy, 9, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(cx - 18, cy); c.lineTo(cx - 12, cy); c.moveTo(cx + 12, cy); c.lineTo(cx + 18, cy); c.moveTo(cx, cy + 12); c.lineTo(cx, cy + 18); c.stroke();
    // 场功率环（准星外圈）
    c.strokeStyle = 'rgba(143,227,232,0.35)'; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, 34, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * P.power); c.stroke();
    c.strokeStyle = 'rgba(143,227,232,0.12)';
    c.beginPath(); c.arc(cx, cy, 34, Math.PI * 0.75 + Math.PI * 1.5 * P.power, Math.PI * 2.25); c.stroke();
    // 热量环（右侧弧）
    c.strokeStyle = P.heat > 75 ? 'rgba(229,72,59,0.8)' : 'rgba(227,160,76,0.55)';
    c.beginPath(); c.arc(cx, cy, 40, -Math.PI * 0.25, -Math.PI * 0.25 + Math.PI * 0.5 * (P.heat / 100)); c.stroke();
    // 离地高度条（准星左侧）
    const bx = cx - 70, by0 = cy + 50, bh = 100;
    const hy = (h) => by0 - (clamp(h, 0, 4.5) / 4.5) * bh;
    c.strokeStyle = 'rgba(143,227,232,0.3)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(bx, by0); c.lineTo(bx, by0 - bh); c.stroke();
    c.font = '9px ui-monospace, Menlo, monospace';
    for (const [h, label] of [[0.6, '贴地'], [1.8, '巡航'], [3.8, '跃升'], [4.25, '塌缩']]) {
      const y = hy(h);
      c.strokeStyle = h > 4 ? 'rgba(229,72,59,0.5)' : 'rgba(143,227,232,0.45)';
      c.beginPath(); c.moveTo(bx - 5, y); c.lineTo(bx + 5, y); c.stroke();
      c.fillStyle = 'rgba(143,227,232,0.5)'; c.fillText(label, bx - 34, y + 3);
    }
    c.fillStyle = '#8FE3E8';
    const yy = hy(P.hAbove);
    c.beginPath(); c.moveTo(bx + 2, yy); c.lineTo(bx + 9, yy - 4); c.lineTo(bx + 9, yy + 4); c.closePath(); c.fill();
    // 速度条（右侧）
    const sx = cx + 70;
    c.strokeStyle = 'rgba(143,227,232,0.3)';
    c.beginPath(); c.moveTo(sx, by0); c.lineTo(sx, by0 - bh); c.stroke();
    const sy = by0 - clamp(P.speed / 62, 0, 1) * bh;
    c.fillStyle = P.boosting ? '#E3A04C' : '#8FE3E8';
    c.beginPath(); c.moveTo(sx - 2, sy); c.lineTo(sx - 9, sy - 4); c.lineTo(sx - 9, sy + 4); c.closePath(); c.fill();
    const cr = by0 - (38 / 62) * bh;
    c.strokeStyle = 'rgba(143,227,232,0.45)'; c.beginPath(); c.moveTo(sx - 5, cr); c.lineTo(sx + 5, cr); c.stroke();
    // 侦测弧：屏幕边缘的弧形标记，指向正在注意你的敌人
    this._detectionArcs(c, W, H, view);
    // 标记的敌人
    for (const o of w.observers) {
      if (!o.alive || o.down) continue;
      const marked = w.marks.has(o.id) || w.debugAll;
      const show = marked || (o.focus === 'player' && o.sus > 30);
      if (!show) continue;
      const p = this._project(o.eye.x, o.eye.y + 0.4, o.eye.z);
      if (!p.on || p.dist > 500) continue;
      const col = o.aware === 'quiet' ? 'rgba(230,234,236,0.75)' : o.aware === 'suspicious' ? '#E3A04C' : '#E5483B';
      const s = clamp(600 / p.dist, 6, 16);
      c.strokeStyle = col; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(p.x - s, p.y - s + 4); c.lineTo(p.x - s, p.y - s); c.lineTo(p.x - s + 4, p.y - s);
      c.moveTo(p.x + s - 4, p.y - s); c.lineTo(p.x + s, p.y - s); c.lineTo(p.x + s, p.y - s + 4);
      c.moveTo(p.x - s, p.y + s - 4); c.lineTo(p.x - s, p.y + s); c.lineTo(p.x - s + 4, p.y + s);
      c.moveTo(p.x + s - 4, p.y + s); c.lineTo(p.x + s, p.y + s); c.lineTo(p.x + s, p.y + s - 4);
      c.stroke();
      if (o.focus === 'player' && o.sus > 1) {
        c.fillStyle = col; c.fillRect(p.x - s, p.y + s + 3, (2 * s) * (o.sus / 100), 2);
      }
      if (p.dist < 180) { c.fillStyle = 'rgba(230,234,236,0.6)'; c.font = '10px system-ui, sans-serif'; c.fillText(`${o.name} ${Math.round(p.dist)}m`, p.x + s + 4, p.y - s + 8); }
    }
    // 蜂群针锁定
    for (const e of w.weapons.locks) {
      const p = this._project(e.pos.x, e.pos.y + (e.hitY || 0), e.pos.z);
      if (!p.on) continue;
      c.strokeStyle = '#E5483B'; c.lineWidth = 1.5;
      c.save(); c.translate(p.x, p.y); c.rotate(Math.PI / 4); c.strokeRect(-10, -10, 20, 20); c.restore();
    }
    // 撤离点方向（带着场核时）
    if (w.mission.core.taken) {
      const p = this._project(EXTRACT.x, 4, EXTRACT.z);
      this._edgePointer(c, p, W, H, '回收点', '#8FE3E8');
    } else if (w.mission.phase !== 'recon') {
      const p = this._project(WRECK.x, 6, WRECK.z);
      this._edgePointer(c, p, W, H, '残骸', 'rgba(143,227,232,0.7)');
    }
    // 诱敌点选
    if (ui.targeting && ui.targetPoint) {
      const p = this._project(ui.targetPoint.x, ui.targetPoint.y + 0.5, ui.targetPoint.z);
      if (p.on) {
        c.strokeStyle = '#F3D9A0'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(p.x, p.y, 14, 0, 6.3); c.stroke();
        c.beginPath(); c.moveTo(p.x, p.y - 22); c.lineTo(p.x, p.y + 22); c.moveTo(p.x - 22, p.y); c.lineTo(p.x + 22, p.y); c.stroke();
        c.fillStyle = '#F3D9A0'; c.font = '12px system-ui, sans-serif'; c.fillText('惊扰诱敌 · 左键确认 / 右键取消', p.x + 18, p.y - 18);
      }
    }
    if (this.debug) this._debugDraw(c, view);
  }

  _edgePointer(c, p, W, H, label, color) {
    let x = p.x, y = p.y;
    const m = 60;
    if (p.behind) { x = W - x; y = H - m; }
    const on = !p.behind && x > m && x < W - m && y > m && y < H - m;
    x = clamp(x, m, W - m); y = clamp(y, m, H - m);
    c.fillStyle = color; c.strokeStyle = color; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 6, y); c.lineTo(x, y + 7); c.lineTo(x - 6, y); c.closePath(); c.stroke();
    c.font = '11px system-ui, sans-serif';
    c.fillText(`${label} ${Math.round(p.dist)}m`, x + 10, y + 4);
    return on;
  }

  _detectionArcs(c, W, H, view) {
    const w = this.w, cam = this.r.camera;
    const inv = cam.quaternion.clone().invert();
    const rx = W * 0.44, ry = H * 0.42;
    for (const o of w.observers) {
      if (o.focus !== 'player' || !o.alive || o.down || o.kind === 'civ') continue;
      const rising = w.time - o.lastStim < 0.4;
      if (o.sus < 2 && !rising) continue;
      v3.set(o.eye.x, o.eye.y, o.eye.z).sub(cam.position).applyQuaternion(inv);
      const ang = Math.atan2(v3.x, -v3.z); // 0 = 正前方（屏幕上方）
      const s = o.sus / 100;
      const col = s < 0.3 ? `rgba(230,234,236,${0.35 + s})` : s < 0.6 ? `rgba(227,160,76,${0.6 + s * 0.3})` : `rgba(229,72,59,${0.75 + s * 0.25})`;
      const span = 0.08 + s * 0.28;
      c.strokeStyle = col;
      c.lineWidth = 2 + s * 5 + (rising ? Math.sin(w.time * 30) * 1.2 : 0);
      c.beginPath();
      for (let k = 0; k <= 12; k++) {
        const a = ang - span / 2 + (span * k) / 12;
        const x = W / 2 + Math.sin(a) * rx, y = H / 2 - Math.cos(a) * ry;
        if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      if (o.sus > 30) {
        const x = W / 2 + Math.sin(ang) * (rx - 22), y = H / 2 - Math.cos(ang) * (ry - 18);
        c.fillStyle = col; c.font = '10px system-ui, sans-serif'; c.textAlign = 'center';
        c.fillText(`${o.name} · ${causeLabel(o.cause)}`, x, y);
        c.textAlign = 'left';
      }
    }
  }

  // 场静默时，雨水打在座舱玻璃上
  _droplets(dt) {
    const w = this.w, P = w.player;
    const raining = w.env.rain > 0.2 && P.silent && !w.terrain.underCanopy(P.pos.x, P.pos.z);
    if (raining && Math.random() < dt * 14 * w.env.rain && this.drops.length < 60) {
      const d = document.createElement('i');
      const s = 3 + Math.random() * 9;
      d.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 70}%;width:${s}px;height:${s * 1.2}px`;
      this.el.drops.appendChild(d);
      this.drops.push({ el: d, t: 3 + Math.random() * 3 });
    }
    for (const d of this.drops) {
      d.t -= dt * (P.silent ? 1 : 4);
      if (d.t <= 0) d.el.remove();
      else if (d.t < 1) d.el.style.opacity = d.t;
    }
    this.drops = this.drops.filter((d) => d.t > 0);
  }

  // ---------- 调试层 ----------
  _debugDraw(c, view) {
    const w = this.w, P = w.player;
    const line = (a, b, col, wid = 1) => {
      const pa = this._project(a.x, a.y, a.z), pb = this._project(b.x, b.y, b.z);
      if (pa.behind || pb.behind) return;
      c.strokeStyle = col; c.lineWidth = wid; c.beginPath(); c.moveTo(pa.x, pa.y); c.lineTo(pb.x, pb.y); c.stroke();
    };
    const tgt = { x: P.pos.x, y: P.pos.y + 0.3, z: P.pos.z };
    for (const o of w.observers) {
      if (!o.alive || o.down || !o.sense) continue;
      const d = Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z);
      if (d > 260) continue;
      const e = o.eye;
      if (o.sense.type === 'radar') {
        const a = o.angle;
        line(e, { x: e.x - Math.sin(a) * 300, y: e.y - 20, z: e.z - Math.cos(a) * 300 }, 'rgba(229,72,59,0.8)', 2);
        const rc = radarCheck(w, o, w.targets()[0]);
        const p = this._project(e.x, e.y, e.z);
        if (p.on) { c.fillStyle = '#E5483B'; c.font = '11px ui-monospace, monospace'; c.fillText(`雷达 ${rc.seen ? '可见' : '遮挡:' + rc.why}${rc.radial !== undefined ? ' 径向' + rc.radial.toFixed(1) : ''} ${o.sus.toFixed(0)}`, p.x + 8, p.y); }
        continue;
      }
      if (o.sense.type === 'em') {
        const p = this._project(o.x, o.pos.y + 2, o.z);
        if (p.on) { c.fillStyle = '#E3A04C'; c.font = '11px ui-monospace, monospace'; c.fillText(`电磁 ${o.sus.toFixed(0)} 信号${(o.signal || 0).toFixed(2)}`, p.x, p.y); }
        for (let k = 0; k < 24; k++) { const a0 = (k / 24) * 6.283, a1 = ((k + 1) / 24) * 6.283; line({ x: o.x + Math.cos(a0) * 60, y: o.pos.y + 0.5, z: o.z + Math.sin(a0) * 60 }, { x: o.x + Math.cos(a1) * 60, y: o.pos.y + 0.5, z: o.z + Math.sin(a1) * 60 }, 'rgba(227,160,76,0.4)'); }
        continue;
      }
      // 视锥
      const half = ((o.sense.fov || 100) * Math.PI) / 360;
      const R = o.sense.range * (w.env.rain > 0.1 ? 0.6 : 1);
      for (const s of [-1, 1]) {
        const dir = dirFromYawPitch(o.yaw + s * half, o.pitch || 0);
        line(e, { x: e.x + dir.x * R, y: e.y + dir.y * R, z: e.z + dir.z * R }, 'rgba(230,234,236,0.35)');
      }
      // 射线
      const los = w.terrain.los(e.x, e.y, e.z, tgt.x, tgt.y, tgt.z, { skipBox: o.ownerBox });
      if (d < 200) {
        if (los.blocked) {
          const hit = { x: e.x + (tgt.x - e.x) * los.t, y: e.y + (tgt.y - e.y) * los.t, z: e.z + (tgt.z - e.z) * los.t };
          line(e, hit, 'rgba(229,72,59,0.7)'); line(hit, tgt, 'rgba(229,72,59,0.15)');
        } else line(e, tgt, `rgba(120,230,140,${0.3 + los.atten * 0.6})`);
      }
      const p = this._project(e.x, e.y + 0.8, e.z);
      if (p.on) {
        c.fillStyle = '#fff'; c.font = '11px ui-monospace, monospace';
        c.fillText(`${o.name} ${AWARE_LABEL[o.aware]} ${o.sus.toFixed(0)} v${(o.visCache.get('player') || 0).toFixed(2)}${los.blocked ? ' 挡:' + los.by : ''}`, p.x + 6, p.y);
      }
    }
  }

  _debugPanel(view) {
    const w = this.w, P = w.player, r = this.r;
    const info = r.renderer.info;
    const em = w.traces.emissions.get('player') || {};
    this.el.debug.innerHTML = `
      <b>F3 调试</b>　FPS ${this.fps.toFixed(0)}　画质 ${r.qualityName}　三角形 ${(info.render.triangles / 1000).toFixed(0)}k　绘制 ${info.render.calls}<br>
      t ${w.time.toFixed(1)}s　雨 ${w.env.rain.toFixed(2)}　光 ${w.env.light.toFixed(2)}　营地 ${w.camp.state}　痕迹 ${w.traces.list.length}<br>
      位置 ${P.pos.x.toFixed(0)}, ${P.pos.z.toFixed(0)}　离地 ${P.hAbove.toFixed(2)}　树冠 ${w.terrain.canopy(P.pos.x, P.pos.z).toFixed(2)}　水 ${w.terrain.isWater(P.pos.x, P.pos.z)}<br>
      外壳 ×${P.camoFactor().toFixed(2)}　嗡鸣 ${(em.hum || 0).toFixed(2)}　树 ${r.forest.counts ? r.forest.counts.trunk : 0}<br>
      F4 自由相机　F6 快进 60 秒（测试日落/卫星）
    `;
  }

  // ---------- 指令轮盘 ----------
  showWheel(open, set) {
    this.wheelOpen = open;
    const el = this.el.wheel;
    if (!open) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = set.map((o, i) => `<div class="wi w${i} ${i === this.wheelSel ? 'sel' : ''}"><kbd>${i + 1}</kbd>${ORDER_LABEL[o]}</div>`).join('') + `<div class="wc">${this.w.selected === 'all' ? '全队' : WINGMEN.names[this.w.selected]}</div>`;
  }

  setDebug(on) { this.debug = on; this.el.debug.classList.toggle('hidden', !on); }
}

export { fmt };
