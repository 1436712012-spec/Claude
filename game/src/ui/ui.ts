// DOM layer: HUD, toasts, the three doors, paper screens, damage numbers.

import type { Offer } from '../weapons';
import { PASSIVE_INFO, WEAPON_INFO } from '../weapons';
import { ICONS } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(html: string): T => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
};

const DOOR_COLORS: Record<string, [string, string]> = {
  nightlight: ['#f9dcc4', '#fff1dc'], plane: ['#d8e8f4', '#eef6fb'], musicbox: ['#f6d0da', '#fde8ee'],
  pillow: ['#e3e2f4', '#f1f1fb'], milk: ['#f6ecdf', '#fffaf2'], candy: ['#f7d6df', '#fde9ef'],
  photo: ['#dcebe9', '#eef7f5'], fan: ['#d4ece5', '#e9f6f2'], sticker: ['#f8e8bd', '#fff5d9'], snack: ['#efdccd', '#faf0e6'],
};

interface Num { x: number; y: number; z: number; v: string; crit: boolean; life: number; vx: number }

export interface HudState {
  clock: string; ampm: string; where: string; kills: number;
  xpFrac: number; level: number; hp: number; maxHp: number;
  playerScreen: { x: number; y: number } | null;
}

export class UI {
  root = $('<div class="hud"></div>');
  private horizonFill: HTMLElement;
  private lv: HTMLElement;
  private clockT: HTMLElement;
  private where: HTMLElement;
  private kills: HTMLElement;
  private slots: HTMLElement;
  private hp: HTMLElement;
  private hpFill: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private toastQueue: string[] = [];
  statsEl: HTMLElement;
  private levelEl: HTMLElement;
  private whiteout: HTMLElement;
  private start: HTMLElement;
  private pause: HTMLElement;
  private end: HTMLElement;
  private fx: HTMLCanvasElement;
  private fxc: CanvasRenderingContext2D;
  private nums: Num[] = [];
  private last: Partial<Record<string, string | number>> = {};

  constructor() {
    document.body.appendChild(this.root);
    this.root.innerHTML = `
      <div class="horizon"><div class="fill"></div><div class="lv">LV<b>1</b></div></div>
      <div class="clock"><div class="t">00:00<small>AM</small></div><div class="where"></div><div class="kills"><i></i><span>0</span></div></div>
      <div class="slots"><div class="row w"></div><div class="row p"></div></div>
      <div class="hp"><div class="fill"></div></div>
      <div class="toast"></div>
      <div class="stats"></div>`;
    this.horizonFill = this.root.querySelector('.horizon .fill')!;
    this.lv = this.root.querySelector('.horizon .lv b')!;
    this.clockT = this.root.querySelector('.clock .t')!;
    this.where = this.root.querySelector('.clock .where')!;
    this.kills = this.root.querySelector('.clock .kills span')!;
    this.slots = this.root.querySelector('.slots')!;
    this.hp = this.root.querySelector('.hp')!;
    this.hpFill = this.root.querySelector('.hp .fill')!;
    this.toastEl = this.root.querySelector('.toast')!;
    this.statsEl = this.root.querySelector('.stats')!;

    this.fx = document.createElement('canvas'); this.fx.id = 'fx';
    document.body.appendChild(this.fx);
    this.fxc = this.fx.getContext('2d')!;

    this.levelEl = $('<div class="levelup"></div>'); document.body.appendChild(this.levelEl);
    this.whiteout = $('<div class="whiteout"></div>'); document.body.appendChild(this.whiteout);

    this.start = $(`<div class="screen start"><div class="title-card">
        <div class="kicker">静默档案馆 · 未归档</div>
        <h1>梦隙</h1>
        <div class="en">NOCLIP BLOOM</div>
        <p class="tag">你穿过了墙，掉进一个没有人的下午。<br/>闹钟会在七点响起。在那之前，别醒。</p>
        <button class="pill" data-act="start">入睡</button>
        <div class="keys"><span><kbd>WASD</kbd>移动</span><span><kbd>空格</kbd>穿模</span><span><kbd>Esc</kbd>暂停</span><span><kbd>M</kbd>声音</span></div>
      </div></div>`);
    this.pause = $(`<div class="screen pause"><div class="paper">
        <div class="stamp">HUSHED ARCHIVE · TEMP RECORD</div>
        <h2>暂停的梦</h2>
        <div class="sub">梦游者在这里停了一下。档案员把时间按住了。</div>
        <dl class="pd"></dl>
        <div class="actions"><button class="pill" data-act="resume">继续做梦</button><button class="pill ghost" data-act="quit">醒来</button></div>
      </div></div>`);
    this.end = $(`<div class="screen end"><div class="paper">
        <div class="stamp ed-stamp"></div>
        <h2 class="ed-title"></h2>
        <div class="sub ed-sub"></div>
        <dl class="ed"></dl>
        <div class="actions"><button class="pill" data-act="again">再睡一次</button></div>
      </div></div>`);
    document.body.append(this.start, this.pause, this.end);
  }

  on(act: string, fn: () => void) {
    document.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (t && t.dataset.act === act) fn();
    });
  }

  showStart(on: boolean) { this.start.classList.toggle('on', on); }
  showHud(on: boolean) { this.root.classList.toggle('on', on); }

  showPause(on: boolean, rows: Array<[string, string]> = []) {
    if (on) this.pause.querySelector('.pd')!.innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    this.pause.classList.toggle('on', on);
  }

  showEnd(on: boolean, won = false, rows: Array<[string, string]> = []) {
    if (on) {
      this.end.querySelector('.ed-stamp')!.textContent = won ? 'CASE CLOSED · 07:00 AM' : 'CASE OPEN · SUBJECT WOKE EARLY';
      this.end.querySelector('.ed-title')!.textContent = won ? '闹钟响了' : '你醒了吗？';
      this.end.querySelector('.ed-sub')!.innerHTML = won
        ? '窗外是真的早晨。你记得泳池的水声，<br/>却想不起是谁把你带到那里的。'
        : '天花板很近，房间很安静。<br/>可那片瓷砖的反光，好像还在眼皮后面。';
      this.end.querySelector('.ed')!.innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('') +
        `<dt>梦魇的来源</dt><dd><span class="redact"></span></dd>`;
    }
    this.end.classList.toggle('on', on);
  }

  // ------------------------------------------------------------ HUD

  private set(key: string, v: string | number, fn: () => void) { if (this.last[key] !== v) { this.last[key] = v; fn(); } }

  hud(s: HudState) {
    this.set('clock', s.clock, () => { this.clockT.innerHTML = `${s.clock}<small>${s.ampm}</small>`; });
    this.set('where', s.where, () => { this.where.textContent = s.where; });
    this.set('kills', s.kills, () => { this.kills.textContent = String(s.kills); });
    this.set('xp', Math.round(s.xpFrac * 400), () => { this.horizonFill.style.width = `${(s.xpFrac * 100).toFixed(2)}%`; });
    this.set('lv', s.level, () => { this.lv.textContent = String(s.level); });
    const hpFrac = Math.max(0, s.hp / s.maxHp);
    this.set('hp', Math.round(hpFrac * 200), () => { this.hpFill.style.width = `${(hpFrac * 100).toFixed(1)}%`; this.hp.classList.toggle('low', hpFrac < 0.3); });
    if (s.playerScreen) { this.hp.style.transform = `translate(${s.playerScreen.x.toFixed(1)}px, ${s.playerScreen.y.toFixed(1)}px)`; }
  }

  setSlots(weapons: Map<string, number>, passives: Map<string, number>, pulseId?: string) {
    const render = (row: HTMLElement, map: Map<string, number>, max: (id: string) => number) => {
      row.innerHTML = '';
      for (const [id, lv] of map) {
        const pips = Array.from({ length: max(id) }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
        const el = $(`<div class="slot${id === pulseId ? ' pulse' : ''}">${ICONS[id] ?? ''}<div class="pips">${pips}</div></div>`);
        row.appendChild(el);
      }
    };
    render(this.slots.querySelector('.row.w')!, weapons, (id) => WEAPON_INFO[id as keyof typeof WEAPON_INFO].maxLevel);
    render(this.slots.querySelector('.row.p')!, passives, (id) => PASSIVE_INFO[id as keyof typeof PASSIVE_INFO].maxLevel);
  }

  toast(html: string) {
    if (this.toastTimer > 0) { if (this.toastQueue.length < 3) this.toastQueue.push(html); return; }
    this.toastEl.innerHTML = html;
    this.toastEl.classList.add('on');
    this.toastTimer = 2.8;
  }

  tick(dt: number) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0.4) this.toastEl.classList.remove('on');
      if (this.toastTimer <= 0) { this.toastTimer = 0; const n = this.toastQueue.shift(); if (n) setTimeout(() => this.toast(n), 120); }
    }
  }

  // ------------------------------------------------------------ damage numbers

  number(x: number, y: number, v: number, crit: boolean) {
    if (this.nums.length > 160) this.nums.shift();
    this.nums.push({ x, y: 1.3, z: y, v: String(v), crit, life: crit ? 1.0 : 0.75, vx: (Math.random() - 0.5) * 0.6 });
  }

  drawNumbers(dt: number, project: (x: number, y: number, z: number) => { x: number; y: number } | null) {
    const c = this.fx, g = this.fxc;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(window.innerWidth * dpr), h = Math.floor(window.innerHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, window.innerWidth, window.innerHeight);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < this.nums.length; i++) {
      const n = this.nums[i];
      n.life -= dt;
      if (n.life <= 0) { this.nums.splice(i--, 1); continue; }
      n.y += dt * 1.1; n.x += n.vx * dt;
      const sp = project(n.x, n.y, n.z);
      if (!sp) continue;
      const maxL = n.crit ? 1.0 : 0.75;
      const t = 1 - n.life / maxL;
      const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.6 : 1.2 - Math.min(0.2, (t - 0.15) * 0.6);
      const size = (n.crit ? 28 : 18) * pop;
      g.globalAlpha = Math.min(1, n.life * 3.5);
      g.font = `700 ${size.toFixed(1)}px Caveat, 'Comic Sans MS', cursive`;
      g.lineWidth = 4; g.strokeStyle = 'rgba(255,252,246,0.9)';
      g.strokeText(n.v, sp.x, sp.y);
      g.fillStyle = n.crit ? '#e07a93' : '#5a5470';
      g.fillText(n.v, sp.x, sp.y);
    }
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------ doors

  doors(title: string, kicker: string, offers: Offer[], opts: { rerolls: number; banishes: number; sfx: (n: string) => void },
        onReroll: () => Offer[] | null, onBanish: (o: Offer) => Offer[] | null): Promise<Offer> {
    return new Promise((resolve) => {
      let banishMode = false;
      let done = false;
      let current = offers;
      let focus = -1;
      const el = this.levelEl;

      const render = () => {
        el.classList.remove('banish');
        el.innerHTML = `
          <div class="head"><div class="k">${kicker}</div><h3>${title}</h3></div>
          <div class="doors"></div>
          <div class="tools">
            <button class="pill ghost" data-tool="reroll" ${opts.rerolls <= 0 ? 'disabled' : ''}>再睡五分钟 · ${opts.rerolls}</button>
            <button class="pill ghost" data-tool="banish" ${opts.banishes <= 0 ? 'disabled' : ''}>忘掉它 · ${opts.banishes}</button>
          </div>`;
        const wrap = el.querySelector('.doors')!;
        current.forEach((o, i) => {
          const [doorC, picC] = DOOR_COLORS[o.info.id] ?? ['#f1e3dc', '#fbf1ec'];
          const tilt = [-3.5, 2.5, -1.5][i] ?? 0;
          const chip = o.isNew ? '<span class="chip">新</span>' : o.info.maxLevel > 1 ? `<span class="chip lv">Lv ${o.nextLevel}</span>` : '';
          const slot = $(`<div class="door-slot" style="--door:${doorC};--pic:${picC};--tilt:${tilt}deg">
              <div class="frame"><div class="door"><div class="panel-low"></div><div class="knob"></div>
                <div class="polaroid"><div class="pic">${ICONS[o.info.id] ?? ICONS.snack}</div><div class="cap">${o.info.name}</div></div>
              </div></div>
              <div class="label"><div class="name">${o.info.name}${chip}</div><div class="desc">${o.text}</div>
                <div class="tags">${o.info.tags.map((t) => `<span>${t}</span>`).join('')}</div><div class="key">${i + 1}</div></div>
            </div>`);
          slot.addEventListener('mouseenter', () => opts.sfx('door'));
          slot.addEventListener('click', () => choose(i));
          wrap.appendChild(slot);
        });
        // restart rise animation
        el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
      };

      const choose = (i: number) => {
        if (done) return;
        const o = current[i]; if (!o) return;
        if (banishMode) {
          const next = onBanish(o);
          opts.banishes--; banishMode = false;
          if (next) { current = next; opts.sfx('bounce'); render(); }
          return;
        }
        done = true;
        const slots = el.querySelectorAll('.door-slot');
        slots.forEach((s, k) => s.classList.add(k === i ? 'chosen' : 'dim'));
        opts.sfx('choose');
        window.removeEventListener('keydown', key);
        setTimeout(() => this.whiteout.classList.add('on'), 520);
        setTimeout(() => {
          el.classList.remove('on');
          this.whiteout.classList.remove('on');
          resolve(o);
        }, 820);
      };

      const key = (e: KeyboardEvent) => {
        if (done) return;
        const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
        if (n >= 0) choose(n);
        if (e.code === 'ArrowRight' || e.code === 'KeyD') setFocus(Math.min(current.length - 1, focus + 1));
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') setFocus(Math.max(0, focus - 1));
        if ((e.code === 'Enter' || e.code === 'Space') && focus >= 0) { e.preventDefault(); choose(focus); }
      };
      const setFocus = (i: number) => {
        focus = i;
        el.querySelectorAll('.door-slot').forEach((s, k) => s.classList.toggle('focus', k === i));
        opts.sfx('door');
      };
      window.addEventListener('keydown', key);

      el.onclick = (e) => {
        const t = (e.target as HTMLElement).closest('[data-tool]') as HTMLButtonElement | null;
        if (!t || t.disabled || done) return;
        if (t.dataset.tool === 'reroll' && opts.rerolls > 0) {
          const next = onReroll();
          if (next) { opts.rerolls--; current = next; opts.sfx('door'); render(); }
        } else if (t.dataset.tool === 'banish' && opts.banishes > 0) {
          banishMode = !banishMode;
          el.classList.toggle('banish', banishMode);
          t.classList.toggle('armed', banishMode);
        }
      };
      render();
    });
  }
}
