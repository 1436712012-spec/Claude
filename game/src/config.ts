// Balance baseline from docs/GAME_PLAN.md §13. Every tunable number lives here.

export const RUN_SECONDS = 15 * 60;          // 00:00 → 07:00 in dream time
export const FINAL_RUSH_AT = RUN_SECONDS - 60;
export const SIM_HZ = 60;
export const DT = 1 / SIM_HZ;

export const PLAYER = {
  speed: 4.2,
  radius: 0.32,
  maxHp: 100,
  iframes: 0.5,
  pickupRadius: 1.7,
  waterSlow: 0.72,
};

export const NOCLIP = {
  duration: 0.35,
  speed: 15,
  cooldown: 6,
  graceExtend: 0.16,       // forgiving extension if the dash ends inside a wall
  bouncePenaltyCd: 1.5,     // extra cooldown when bounced back
};

export const MAP = {
  chunk: 24,
  window: 96,               // flow-field & floor-mask window (cells), centred on player
  wallHeight: 1.8,
};

export const SPAWN = {
  maxEnemies: 900,
  capAt: (min: number) => Math.min(900, 60 + 60 * min),
  hpScale: (min: number) => 1 + 0.12 * min,
  ringMin: 15,
  ringMax: 20,
  perSecond: (min: number) => 6 + min * 3.2,
  swarmEvery: 60,
};

export const xpForLevel = (n: number) => Math.floor(6 * Math.pow(n, 1.35));

export type EnemyKind = 'faceless' | 'balloon' | 'paper';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  xp: number;
  mass: number;
  waterSlow: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  faceless: { kind: 'faceless', name: '无脸同学', hp: 10, speed: 2.55, radius: 0.34, damage: 8, xp: 1, mass: 1.0, waterSlow: 0.55 },
  balloon:  { kind: 'balloon',  name: '气球人',   hp: 6,  speed: 1.65, radius: 0.36, damage: 5, xp: 1, mass: 0.5, waterSlow: 1.0 },
  paper:    { kind: 'paper',    name: '纸人',     hp: 9,  speed: 4.3,  radius: 0.28, damage: 6, xp: 2, mass: 0.7, waterSlow: 0.4 },
};

// Spawn composition by minute: weights for each kind.
export function spawnWeights(min: number): Record<EnemyKind, number> {
  return {
    faceless: 1,
    balloon: min < 1 ? 1.4 : 0.8,
    paper: min < 2 ? 0 : Math.min(0.9, 0.25 + (min - 2) * 0.08),
  };
}
