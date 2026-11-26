import { rgba } from '../core/math.js';
// Neon-dusk palette. Everything here is linear RGBA.
export const C = {
  hullDark: rgba(0x171b2e), hullMid: rgba(0x2a3358), hullLight: rgba(0x4a5890), hullTrim: rgba(0x111424),
  track: rgba(0x0e1018), wheel: rgba(0x1e2335), tread: rgba(0x2a3048),
  cyan: rgba(0x19f0ff), magenta: rgba(0xff2fb4), amber: rgba(0xffb347), orange: rgba(0xff7a2f), red: rgba(0xff2a3a), green: rgba(0x35ff9a),
  white: [1, 1, 1, 1], brass: rgba(0xd9a441), steel: rgba(0x4a5170),
  planeBody: rgba(0x3a2a55), planeDark: rgba(0x1e1630), planeWing: rgba(0x2c2142), planeAccent: rgba(0xff5a3a),
  scoutBody: rgba(0x2a3c5c), scoutDark: rgba(0x141d33), scoutAccent: rgba(0x19f0ff),
  diverBody: rgba(0x4a2a3a), diverAccent: rgba(0xffb347),
  wall: rgba(0x4a3b66), wall2: rgba(0x3a2d52), roof: rgba(0x241b3a), roof2: rgba(0x34264f), window: rgba(0xffb347), rubble: rgba(0x2a2140),
  rock: rgba(0x2f2648), rockLight: rgba(0x453869), pylon: rgba(0x211c36), metalRust: rgba(0x5a3a3a),
  shadow: [0, 0, 0, 0.55],
  smoke: [0.07, 0.05, 0.1, 0.88], smokeLight: [0.16, 0.12, 0.2, 0.9],
  bullet: rgba(0xffd060), enemyBullet: rgba(0xff4a2a), plasma: rgba(0x2fe6ff),
};
