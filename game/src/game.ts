// Orchestrates simulation, rendering and UI. Fixed-step sim, free-running render.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Audio } from './audio';
import { DT, ENEMIES, FINAL_RUSH_AT, MAP, RUN_SECONDS, xpForLevel } from './config';
import { Enemies } from './enemies';
import { FlowField } from './flowfield';
import { Input } from './input';
import { WorldMap } from './map';
import { PickKind, Pickups } from './pickups';
import { Player } from './player';
import { CAM_OFFSET, installDreamFog } from './render/dreamfog';
import { EntityView } from './render/entities';
import { Post } from './render/post';
import { WorldView } from './render/world';
import { clamp, damp } from './rng';
import { UI } from './ui/ui';
import { Arsenal, buildOffers, type HitEvent, type Offer } from './weapons';

type State = 'title' | 'play' | 'doors' | 'paused' | 'end';

const FOG_COLOR = new THREE.Color(0xf1f2ee);
const params = new URLSearchParams(location.search);

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  post: Post;
  sun: THREE.DirectionalLight;
  ui = new UI();
  audio = new Audio();
  input: Input;

  map!: WorldMap;
  flow = new FlowField(MAP.window);
  player!: Player;
  enemies!: Enemies;
  arsenal!: Arsenal;
  pickups!: Pickups;
  worldView!: WorldView;
  entities: EntityView;

  state: State = 'title';
  time = 0;            // run time (s)
  anim = 0;            // render time, always running
  acc = 0;
  xp = 0; level = 1; kills = 0; starsTotal = 0;
  pendingLevels = 0;
  rerolls = 2; banishes = 1;
  banned = new Set<string>();
  flowTimer = 0;
  shake = 0;
  noclipFx = 0;
  rushAnnounced = false;
  firstNoclip = true;
  firstSecret = true;
  timeScale = Number(params.get('speed') ?? 1);
  god = params.has('god');
  auto = params.has('auto');
  private camTarget = new THREE.Vector3();
  private camLead = new THREE.Vector2();
  private frameMs: number[] = [];
  private pixelRatio = Math.min(1.75, window.devicePixelRatio || 1);
  private qualityCheckT = 0;
  private lastT = performance.now();
  private simMs = 0;
  private autoT = 0;

  constructor() {
    installDreamFog();
    const canvas = document.createElement('canvas'); canvas.id = 'gl';
    document.body.prepend(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.info.autoReset = false;
    this.input = new Input(canvas);

    this.camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 1, 80);
    this.scene.background = FOG_COLOR.clone();
    this.scene.fog = new THREE.Fog(FOG_COLOR, 8.5, 19);

    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;

    // Light: a huge, sourceless afternoon glow + one soft "skylight" for shadows.
    this.scene.add(new THREE.HemisphereLight(0xf4f6f8, 0xb2d6e2, 0.72));
    this.sun = new THREE.DirectionalLight(0xfffaf2, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 50;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03; this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);

    this.entities = new EntityView();
    this.scene.add(this.entities.group);

    this.post = new Post(this.renderer, this.scene, this.camera);
    this.post.setSize(window.innerWidth, window.innerHeight, this.pixelRatio);
    window.addEventListener('resize', () => this.resize());

    this.newRun();
    this.bindUI();
    (window as unknown as { __game: Game }).__game = this;
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------ run setup

  newRun() {
    if (this.worldView) this.scene.remove(this.worldView.group);
    this.map = new WorldMap(Math.floor(Math.random() * 1e9));
    this.player = new Player();
    this.enemies = new Enemies(this.map, this.flow);
    this.arsenal = new Arsenal();
    this.pickups = new Pickups();
    this.worldView = new WorldView(this.map);
    this.scene.add(this.worldView.group);
    this.time = Number(params.get('t') ?? 0);
    this.xp = 0; this.level = 1; this.kills = 0; this.starsTotal = 0; this.pendingLevels = 0;
    this.rerolls = 2; this.banishes = 1; this.banned.clear();
    this.rushAnnounced = this.time >= FINAL_RUSH_AT;
    this.firstNoclip = true; this.firstSecret = true;
    this.arsenal.addWeapon('plane');
    const preLv = Number(params.get('lv') ?? 0);
    for (let k = 0; k < preLv; k++) { const o = buildOffers(this.arsenal, this.player, 1, this.banned, () => {}); o[0]?.apply(); }
    this.flow.rebuild(this.map, this.player.x, this.player.y);
    this.enemies.swarmTimer = 20; // first swarm arrives at 0:40
    this.enemies.onSwarm = () => { this.audio.play('swarm'); this.ui.toast('气球从<em>四面八方</em>飘过来了'); };
    this.camTarget.set(this.player.x, 0, this.player.y);
    this.ui.setSlots(this.arsenal.weapons, this.arsenal.passives);
    // A few balloons drifting in the title screen, harmless.
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      this.enemies.spawn('balloon', this.player.x + Math.cos(a) * (5 + k % 3 * 2), this.player.y + Math.sin(a) * (4 + k % 2 * 2), 1);
    }
  }

  private bindUI() {
    this.ui.on('start', () => this.begin());
    this.ui.on('resume', () => this.setPaused(false));
    this.ui.on('quit', () => { this.setPaused(false); this.finish(false); });
    this.ui.on('again', () => { this.ui.showEnd(false); this.newRun(); this.enemies.n = 0; this.begin(); });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && this.state === 'title') this.begin();
      if (e.code === 'KeyM') this.audio.setMuted(!this.audio.muted);
      if (e.code === 'Backquote' || e.code === 'F3') this.ui.statsEl.classList.toggle('on');
    });
    if (params.has('stats')) this.ui.statsEl.classList.add('on');
    if (params.has('play')) setTimeout(() => this.begin(), 50);
    else this.ui.showStart(true);
  }

  begin() {
    if (this.state !== 'title') return;
    this.audio.start();
    this.enemies.n = 0; // the harmless title balloons drift away
    this.ui.showStart(false);
    this.ui.showHud(true);
    this.state = 'play';
    this.lastT = performance.now();
    setTimeout(() => this.ui.toast(`${this.clockText()[0]} · 你睡着了。<em>七点</em>前别醒来`), 700);
  }

  private setPaused(p: boolean) {
    if (p && this.state === 'play') {
      this.state = 'paused';
      this.ui.showPause(true, this.summaryRows());
    } else if (!p && this.state === 'paused') {
      this.state = 'play';
      this.ui.showPause(false);
      this.lastT = performance.now();
    }
  }

  private summaryRows(): Array<[string, string]> {
    const items = [...this.arsenal.weapons, ...this.arsenal.passives].length;
    return [
      ['梦中时间', `${this.clockText().join(' ')}`],
      ['等级', `Lv ${this.level}`],
      ['击散的梦魇', `${this.kills}`],
      ['收集的星屑', `${this.starsTotal}`],
      ['带在身上的东西', `${items} 件`],
    ];
  }

  private finish(won: boolean) {
    if (this.state === 'end') return;
    this.state = 'end';
    this.audio.play(won ? 'alarm' : 'death');
    this.ui.showHud(false);
    const m = Math.floor(this.time / 60), s = Math.floor(this.time % 60);
    this.ui.showEnd(true, won, [
      ['现实中睡了', `${m} 分 ${String(s).padStart(2, '0')} 秒`],
      ['梦中时间', this.clockText().join(' ')],
      ['等级', `Lv ${this.level}`],
      ['击散的梦魇', `${this.kills}`],
      ['收集的星屑', `${this.starsTotal}`],
    ]);
  }

  // ------------------------------------------------------------ helpers

  clockText(): [string, string] {
    const dreamMin = Math.floor((clamp(this.time / RUN_SECONDS, 0, 1)) * 7 * 60);
    const h = Math.floor(dreamMin / 60), mm = dreamMin % 60;
    return [`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 'AM'];
  }

  private project(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Keep roughly the same field of view on tall phones.
    this.camera.fov = w / h < 1 ? 42 : 30;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, this.pixelRatio);
  }

  // ------------------------------------------------------------ simulation

  private hit = (h: HitEvent, kx: number, ky: number) => {
    const e = this.enemies;
    if (e.hp[h.i] <= 0) return;
    e.hp[h.i] -= h.dmg;
    e.flash[h.i] = 1;
    const m = e.def(h.i).mass;
    e.kx[h.i] += kx / m; e.ky[h.i] += ky / m;
    this.ui.number(h.x, h.y, h.dmg, h.crit);
    this.audio.play('hit');
  };

  private kill(i: number) {
    const e = this.enemies;
    const d = e.def(i);
    this.entities.burst(e.kind[i], e.x[i], e.y[i], e.hue[i]);
    this.pickups.drop(e.x[i], e.y[i], d.xp);
    if (Math.random() < 0.006) this.pickups.drop(e.x[i], e.y[i], 25, PickKind.Milk);
    this.kills++;
    this.audio.play('pop');
    e.remove(i);
  }

  private step(dt: number) {
    const p = this.player, e = this.enemies;
    let mx = this.input.moveX, my = this.input.moveY;
    if (this.auto) { // test pilot: slow figure-eight
      this.autoT += dt;
      mx = Math.cos(this.autoT * 0.35); my = Math.sin(this.autoT * 0.7) * 0.8;
    }

    if (this.input.consume('Space') && p.tryDash(mx, my)) {
      this.audio.play('noclip');
      this.noclipFx = 1;
      if (this.firstNoclip) { this.firstNoclip = false; }
    }
    const ev = p.update(dt, mx, my, this.map);
    if (ev === 'through') {
      this.audio.play('through');
      this.entities.sparkle(p.x, p.y, 16, 0xbfe9ff, 0.6, 3);
      this.ui.toast('你<em>穿过</em>了墙');
    } else if (ev === 'bounce') {
      this.audio.play('bounce');
      this.shake = Math.max(this.shake, 0.5);
      this.ui.toast('墙把你<em>推了回来</em>');
    }

    this.flowTimer -= dt;
    if (this.flowTimer <= 0) { this.flowTimer = 0.25; this.flow.rebuild(this.map, p.x, p.y); }

    const minute = this.time / 60;
    const rush = this.time >= FINAL_RUSH_AT;
    if (rush && !this.rushAnnounced) {
      this.rushAnnounced = true;
      this.audio.play('alarm');
      this.ui.toast('06:32 · 闹钟<em>就快响了</em>，撑住');
    }
    const t0 = performance.now();
    e.updateSpawning(dt, minute, p.x, p.y, rush);
    e.update(dt, this.anim, p.x, p.y, (i) => {
      if (this.god) return;
      if (p.hurt(e.def(i).damage)) {
        this.audio.play('hurt');
        this.shake = Math.max(this.shake, 0.35);
        const dx = e.x[i] - p.x, dy = e.y[i] - p.y, d = Math.hypot(dx, dy) || 1;
        e.kx[i] += (dx / d) * 6; e.ky[i] += (dy / d) * 6;
      }
    });
    this.arsenal.update(dt, this.time, p, e, this.hit, (n) => this.audio.play(n));
    for (let i = e.n - 1; i >= 0; i--) if (e.hp[i] <= 0) this.kill(i);
    this.simMs = this.simMs * 0.95 + (performance.now() - t0) * 0.05;

    this.pickups.update(dt, p, this.map, (kind, value) => {
      if (kind === PickKind.Milk) {
        p.hp = Math.min(p.stats.maxHp, p.hp + value);
        this.audio.play('milk');
        this.entities.sparkle(p.x, p.y, 10, 0xffd6e0, 0.5, 2);
        return;
      }
      this.xp += value; this.starsTotal += value;
      this.audio.play('star');
      while (this.xp >= xpForLevel(this.level)) { this.xp -= xpForLevel(this.level); this.level++; this.pendingLevels++; }
    }, () => {
      this.audio.play('chest');
      this.entities.sparkle(p.x, p.y, 40, 0xffd0dc, 0.5, 4);
      if (this.firstSecret) { this.firstSecret = false; this.ui.toast('夹层里有一份<em>礼物</em>'); }
      this.openDoors('chest');
    });

    this.time += dt;
    if (p.hp <= 0) { this.finish(false); return; }
    if (this.time >= RUN_SECONDS) { this.finish(true); return; }
    if (this.pendingLevels > 0 && this.state === 'play') { this.pendingLevels--; this.openDoors('level'); }
  }

  private openDoors(source: 'level' | 'chest') {
    this.state = 'doors';
    this.audio.play(source === 'chest' ? 'chest' : 'levelup');
    this.entities.sparkle(this.player.x, this.player.y, 24, 0xffe7b0, 0.4, 3);
    const heal = () => { this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + 30); };
    const offers = buildOffers(this.arsenal, this.player, 3, this.banned, heal);
    const opts = { rerolls: this.rerolls, banishes: this.banishes, sfx: (n: string) => this.audio.play(n) };
    const title = source === 'chest' ? '门后有礼物' : '你又长大了一点';
    const kicker = source === 'chest' ? '夹层 · 选一扇门' : `LV ${this.level} · 选一扇门`;
    const pick = (o: Offer) => {
      this.rerolls = opts.rerolls; this.banishes = opts.banishes;
      o.apply();
      this.ui.setSlots(this.arsenal.weapons, this.arsenal.passives, o.info.id);
      this.state = 'play';
      this.lastT = performance.now();
      if (this.pendingLevels > 0) { this.pendingLevels--; setTimeout(() => this.state === 'play' && this.openDoors('level'), 180); }
    };
    if (this.auto) { setTimeout(() => pick(offers[0]), 200); return; }
    this.ui.doors(title, kicker, offers, opts,
      () => buildOffers(this.arsenal, this.player, 3, this.banned, heal),
      (o) => { if (!o.key.startsWith('snack')) this.banned.add(o.key); return buildOffers(this.arsenal, this.player, 3, this.banned, heal); },
    ).then(pick);
  }

  // ------------------------------------------------------------ frame

  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    const real = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    this.anim += real;
    this.input.update();

    if (this.input.consume('Escape') || this.input.consume('KeyP')) {
      if (this.state === 'play') this.setPaused(true); else if (this.state === 'paused') this.setPaused(false);
    }

    if (this.state === 'play') {
      this.acc += real * this.timeScale;
      let steps = 0;
      while (this.acc >= DT && steps < 4 * Math.max(1, this.timeScale)) {
        this.step(DT); this.acc -= DT; steps++;
        if (this.state !== 'play') { this.acc = 0; break; }
      }
      if (this.acc > DT * 4) this.acc = 0;
    } else if (this.state === 'title') {
      // Title: balloons drift, nothing hurts.
      this.enemies.update(real, this.anim, this.player.x + Math.sin(this.anim * 0.2) * 6, this.player.y + Math.cos(this.anim * 0.17) * 4, () => {});
    }
    this.input.endFrame();
    this.render(real);
  }

  private render(dt: number) {
    const p = this.player;
    // camera: critically-damped follow with a lead into the direction of travel
    const title = this.state === 'title';
    this.camLead.x = damp(this.camLead.x, p.vx * 0.32, 3, dt);
    this.camLead.y = damp(this.camLead.y, p.vy * 0.32, 3, dt);
    const tx = p.x + this.camLead.x + (title ? Math.sin(this.anim * 0.07) * 2.5 : 0);
    const tz = p.y + this.camLead.y + (title ? Math.cos(this.anim * 0.05) * 0.6 - 5.6 : 0);
    this.camTarget.x = damp(this.camTarget.x, tx, 6, dt);
    this.camTarget.z = damp(this.camTarget.z, tz, 6, dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake * 0.35;
    const zoom = title ? 0.82 : 1;
    this.camera.position.set(
      this.camTarget.x + CAM_OFFSET.x * zoom + (Math.random() - 0.5) * sh,
      CAM_OFFSET.y * zoom + (Math.random() - 0.5) * sh,
      this.camTarget.z + CAM_OFFSET.z * zoom,
    );
    this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z);

    // shadow camera follows, snapped to texels to stop shimmering
    const texel = 34 / 2048;
    const sx = Math.round(p.x / texel) * texel, sz = Math.round(p.y / texel) * texel;
    this.sun.position.set(sx - 7, 16, sz - 4);
    this.sun.target.position.set(sx, 0, sz);

    this.worldView.update(p.x, p.y, this.anim);
    this.camera.updateMatrixWorld();
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.worldView.setPeephole(this.camera, buf.x, buf.y, p.x, p.y);
    this.entities.update(dt, this.anim, p, this.enemies, this.arsenal, this.pickups);

    // post uniforms
    const g = this.post.grade.uniforms;
    this.noclipFx = Math.max(p.dashing ? 1 : 0, this.noclipFx - dt * 2.4);
    g.uNoclip.value = this.noclipFx;
    g.uHurt.value = p.hurtPulse;
    g.uDream.value = clamp(this.time / RUN_SECONDS, 0, 1);
    g.uTime.value = this.anim;
    const ps = new THREE.Vector3(p.x, 0.6, p.y).project(this.camera);
    (g.uPlayerUv.value as THREE.Vector2).set(ps.x * 0.5 + 0.5, ps.y * 0.5 + 0.5);
    this.post.tilt.uniforms.uFocusY.value = ps.y * 0.5 + 0.5;
    g.uFade.value = damp(g.uFade.value as number, this.state === 'end' ? 0.35 : 0, 2, dt);

    this.renderer.info.reset();
    if (params.has('nopost')) this.renderer.render(this.scene, this.camera); else this.post.render();

    // HUD
    const [clock, ampm] = this.clockText();
    const scr = this.project(p.x, 0, p.y);
    this.ui.hud({
      clock, ampm, where: 'L0 · 午后四点的游泳馆', kills: this.kills,
      xpFrac: clamp(this.xp / xpForLevel(this.level), 0, 1), level: this.level,
      hp: p.hp, maxHp: p.stats.maxHp,
      playerScreen: scr ? { x: scr.x, y: scr.y + 20 } : null,
    });
    this.ui.tick(dt);
    this.ui.drawNumbers(this.state === 'play' ? dt : 0, (x, y, z) => this.project(x, y, z));
    this.audio.tick(dt, clamp(this.enemies.n / 600, 0, 1));

    // perf
    this.frameMs.push(dt * 1000);
    if (this.frameMs.length > 120) this.frameMs.shift();
    this.qualityCheckT += dt;
    if (this.qualityCheckT > 2.5 && this.state === 'play') {
      this.qualityCheckT = 0;
      const avg = this.frameMs.reduce((a, b) => a + b, 0) / this.frameMs.length;
      if (avg > 21 && this.pixelRatio > 0.8 && !params.has('fixedres')) { this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25); this.resize(); }
    }
    if (this.ui.statsEl.classList.contains('on')) {
      const avg = this.frameMs.reduce((a, b) => a + b, 0) / Math.max(1, this.frameMs.length);
      this.ui.statsEl.textContent =
        `fps ${(1000 / avg).toFixed(0)}  frame ${avg.toFixed(1)}ms  sim ${this.simMs.toFixed(2)}ms\n` +
        `enemies ${this.enemies.n}  planes ${this.arsenal.pn}  stars ${this.pickups.n}\n` +
        `pr ${this.pixelRatio}  draw ${this.renderer.info.render.calls}  tris ${(this.renderer.info.render.triangles / 1000).toFixed(0)}k`;
    }
  }
}
