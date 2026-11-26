// 掠影 · 全部手感与规则数值。起始值，以试玩为准调整。
// 模拟层的唯一数值来源；渲染与音频也从这里读取需要同步的量。

export const SEED = 19112026;
export const DT = 1 / 60;

export const MAP = {
  half: 1000,
  waterLevel: 0,
  gridStep: 2, // 高度网格分辨率（米）
  floodedZ: 450, // z > 此值：淹水林
  forestEdgeZ: -140, // 雨林南缘到清障带
  fenceSouthZ: -200,
  fenceNorthZ: -500,
  fenceHalfX: 220,
  clearWidth: 60,
  plateauH: 4.5, // 清障带、研究所地坪
  cityZ: -540,
  creekX: 40, // 涵洞处小溪的 x
  culvert: { x: 40, z0: -205, z1: -140, halfW: 5, ceil: 3.2 },
  drainEndZ: -275,
};

export const SHIP = {
  radius: 3.5,
  hullBottom: 0.35, // 船底到中心
  heights: { low: 0.6, cruise: 1.8, jump: 3.8 },
  fieldCollapse: 4.25, // 离地超过即塌缩（带一点滞回，跃升峰值约 4 m）
  jumpHold: 1.5,
  jumpCooldown: 4,
  cruiseSpeed: 38, // 70% 场功率时
  boostSpeed: 62,
  accel: 18,
  boostAccel: 24,
  brake: 15,
  yawRate: 95, // °/s 键盘/触屏转向
  yawRateFast: 60,
  springHz: 2.2,
  damping: 0.7,
  maxLift: 46,
  gravity: 9.81,
  tiltMax: 12, // 度
  fovBase: 78,
  fovFast: 90,
  shakeMinMm: 0.6,
  shakeMaxMm: 3,
  powerDefault: 0.7,
  powerKeyRate: 0.55,
  powerFollow: 1.6,
  silence: { sinkRate: 0.4, dragBase: 0.05, dragGrowth: 0.12, dragMax: 0.9, spool: 0.8, fadeOut: 0.3 },
  heat: { boostRate: 22, highPowerRate: 18, coolRate: 11, ventMin: 18, overheatCap: 0.3, recoverBelow: 45 },
  camo: { speedFull: 10, speedNone: 26, factor: 0.6 },
  pulse: { radius: 35, duration: 20, cooldown: 90 },
  hull: 100,
  hullRegenDelay: 6,
  hullRegen: 1.2,
  scrapeDamageSpeed: 12,
  recoveryPower: 0.4,
};

export const DETECT = {
  minRiseTime: 0.6, // 怀疑度 0→100 最短时间
  get maxRate() { return 100 / this.minRiseTime; },
  suspiciousAt: 30,
  searchAt: 60,
  alarmAt: 100,
  decay: 8,
  searchTime: 20,
  alarmCooldownSight: 30,
  eye: { range: 140, fov: 110, nightRange: 70 },
  camera: { range: 95, fov: 64, sweep: 50, sweepPeriod: 9 },
  spotlight: { range: 170, coneDeg: 9, rainSilhouette: 150 },
  drone: { range: 95, fov: 80 },
  radar: { period: 6, beamDeg: 5, range: 720, minRange: 40, doppler: 6, perSweep: 34, offline: 45 },
  em: { radius: 60, rate: 44, surge: 70, scanCatch: 160 },
  thermal: { base: 60, perHeat: 3 },
  hearing: { scrape: 60, hum: 26 },
  undergrowthConceal: 0.7,
  forestAtten: 0.045, // 每米林地衰减
  evidenceClarity: 0.55,
  evidenceTime: 1.1,
};

export const RAIN = {
  hearingMul: 0.3, // 听觉范围缩短 70%
  visionMul: 0.6, // 视野缩短 40%
};

export const CLOCK = {
  rainFadeStart: 400,
  sunset: 480, // 8 分钟日落、雨停
  dusk: 380,
  satFirst: 150,
  satPeriod: 180,
  satDuration: 25,
  satWarn: 10,
  satSpeed: 14,
};

export const TRACE = {
  mist: { minSpeed: 20, maxHeight: 1.2, dur: [6, 10], range: 120, rainDur: 0.6, value: 26 },
  birds: { speed: 25, dur: 4, range: 300, value: 32, resettle: 70 },
  ripple: { dur: 3, range: 40, value: 14 },
  emi: { range: 25, value: 12 },
  scrape: { range: 60, value: 34 },
  surge: { value: 70 },
  pulse: { dur: 20, value: 45 },
  heat: { dur: 5, value: 30 },
  beam: { range: 150, dur: 2.5, value: 40 },
  thud: { range: 90, dur: 2, value: 30 },
  core: { value: 60 },
};

export const MISSION = {
  coreRadius: 6,
  coreHold: 5,
  coreLowMax: 1.1,
  extractRadius: 16,
  uploadTime: 40,
  cellUploadTime: 30,
  jamBonus: 15,
  terminalReboot: 20,
  coreCheckInterval: 90,
};

export const COMBAT = {
  hitstopMin: 0.04,
  hitstopMax: 0.06,
  resonanceMax: 5,
  resonanceDamage: 0.15,
  resonanceCooldown: 0.08,
  resonanceHold: 5,
  resonanceDecay: 1.5,
};

export const WEAPONS = {
  stasis: { kind: 'stealth', name: '静滞束', range: 90, freeze: 8, cooldown: 20 },
  phantom: { kind: 'stealth', name: '幻影投射', range: 60, life: 10, cooldown: 30, speed: 22 },
  anchor: { kind: 'stealth', name: '重力锚', range: 80, radius: 12, hold: 15, cooldown: 25 },
  fog: { kind: 'stealth', name: '记忆雾', range: 50, radius: 18, uses: 1, memory: 30 },
  beam: { kind: 'combat', name: '湮灭束', range: 170, dps: 230, heatRate: 38, ventLock: 3 },
  swarm: { kind: 'combat', name: '蜂群针', count: 24, maxLocks: 8, lockCone: 24, lockTime: 0.12, reload: 12, damage: 42, speed: 70, life: 4.5 },
  hammer: { kind: 'combat', name: '重力锤', range: 42, cone: 55, damage: 260, cooldown: 5, recoil: 15 },
  storm: { kind: 'combat', name: '雷暴阵列', range: 130, radius: 46, duration: 6.5, uses: 2, gather: 140 },
};

export const DEFAULT_LOADOUT = ['stasis', 'phantom', 'beam', 'swarm'];

export const WINGMEN = {
  ids: ['echo', 'glimmer', 'bedrock'],
  names: { echo: '回声', glimmer: '微光', bedrock: '磐石' },
  trailDelay: { echo: 2.0, glimmer: 3.5, bedrock: 5.0 },
  holdPower: 0.2,
  distractTime: 6,
  scanTime: 8,
  scanRadius: 260,
  cruiseSpeed: 30,
  dashSpeed: 50,
  jamRadius: 260,
};

export const QUALITY = {
  high: { shadows: true, bloomScale: 1, particles: 1, treeRadius: 330, fernRadius: 90, pixelRatio: 2, terrainStep: 5 },
  medium: { shadows: false, bloomScale: 0.75, particles: 0.7, treeRadius: 260, fernRadius: 70, pixelRatio: 1.5, terrainStep: 6 },
  low: { shadows: false, bloomScale: 0.5, particles: 0.5, treeRadius: 190, fernRadius: 45, pixelRatio: 1, terrainStep: 8 },
};
