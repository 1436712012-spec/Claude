// Book content  <->  (corridor, gallery, level, wall, shelf, volume)
//
//   content  --Feistel-->  address A  (N base-K digits)
//   A = H * 640 + local            local = wall*160 + shelf*32 + volume
//   H (padded to 3M digits) --de-interleave digits--> three naturals
//   natural --zig-zag--> integer   0,1,2,3,4 -> 0,-1,1,-2,2
//
// Every arrow is a bijection, so every possible book sits on exactly one shelf.

import {
  mulSmallAdd, divmodSmall, increment, decrement, parity, halve, double,
  isZero, low32, magnitude, sigLength,
} from './digits.js';
import { permute, unpermute } from './feistel.js';

export const WALLS = 4;
export const SHELVES = 5;
export const VOLUMES = 32;
export const BOOKS_PER_HEX = WALLS * SHELVES * VOLUMES; // 640

export const AXES = ['gallery', 'level', 'corridor'];

/** A signed integer with a base-K magnitude of fixed width M. */
export class Coord {
  constructor(K, M, neg = false, mag = new Uint16Array(M)) {
    this.K = K;
    this.M = M;
    this.neg = neg;
    this.mag = mag;
  }

  static zero(lib) {
    return new Coord(lib.K, lib.coordLen);
  }

  static fromNumber(lib, n) {
    const c = Coord.zero(lib);
    let v = Math.abs(Math.trunc(n));
    for (let i = 0; v > 0 && i < c.M; i++) {
      c.mag[i] = v % c.K;
      v = Math.floor(v / c.K);
    }
    c.neg = n < 0 && !isZero(c.mag);
    return c;
  }

  clone() {
    return new Coord(this.K, this.M, this.neg, Uint16Array.from(this.mag));
  }

  isZero() {
    return isZero(this.mag);
  }

  /** In-place add of +1 or -1 (or any small integer, by repetition). */
  add(delta) {
    const K = this.K;
    for (let s = 0; s < Math.abs(delta); s++) {
      const up = delta > 0;
      if (this.isZero()) {
        increment(this.mag, K);
        this.neg = !up;
      } else if (this.neg === !up) {
        increment(this.mag, K); // moving away from zero
      } else {
        decrement(this.mag, K); // moving toward zero
        if (this.isZero()) this.neg = false;
      }
    }
    return this;
  }

  /** Low 32 bits of the two's-complement value; stepping ±1 changes it by ±1 mod 2^32. */
  low32() {
    const v = low32(this.mag, this.K);
    return this.neg ? (-v) >>> 0 : v;
  }

  magnitude() {
    return magnitude(this.mag, this.K);
  }

  sigLength() {
    return sigLength(this.mag);
  }

  equals(o) {
    if (this.neg !== o.neg || this.M !== o.M) return false;
    for (let i = 0; i < this.M; i++) if (this.mag[i] !== o.mag[i]) return false;
    return true;
  }
}

/** natural (consumed) -> Coord via zig-zag: even n -> n/2, odd n -> -(n+1)/2. */
export function naturalToCoord(nat, K) {
  const M = nat.length;
  if (parity(nat) === 0) {
    halve(nat, K);
    return new Coord(K, M, false, nat);
  }
  increment(nat, K);
  halve(nat, K);
  return new Coord(K, M, true, nat);
}

/** Coord -> natural (fresh array): v >= 0 -> 2v, v < 0 -> 2|v| - 1. Returns null on overflow. */
export function coordToNatural(c) {
  const nat = Uint16Array.from(c.mag);
  if (double(nat, c.K)) return null;
  if (c.neg) decrement(nat, c.K);
  return nat;
}

export function localIndex(wall, shelf, volume) {
  return (wall * SHELVES + shelf) * VOLUMES + volume;
}

export function splitLocal(local) {
  return {
    wall: Math.floor(local / (SHELVES * VOLUMES)),
    shelf: Math.floor(local / VOLUMES) % SHELVES,
    volume: local % VOLUMES,
  };
}

/** Hexagon number H (3M digits) from the three coordinates. */
export function hexNumber(lib, hex) {
  const M = lib.coordLen;
  const H = new Uint16Array(3 * M);
  for (let a = 0; a < 3; a++) {
    const nat = coordToNatural(hex[AXES[a]]);
    if (!nat) return null;
    for (let j = 0; j < M; j++) H[3 * j + a] = nat[j];
  }
  return H;
}

/** Book address A (N digits) of a shelf position; null when it lies past the last book. */
export function bookAddress(lib, hex, local) {
  const H = hexNumber(lib, hex);
  if (!H) return null;
  const A = new Uint16Array(H.length + 1);
  if (mulSmallAdd(H, lib.K, BOOKS_PER_HEX, local, A)) return null;
  for (let i = lib.bookLen; i < A.length; i++) if (A[i] !== 0) return null;
  return A.subarray(0, lib.bookLen);
}

/** Address A -> shelf position. */
export function locateAddress(lib, A) {
  const M = lib.coordLen;
  const H = new Uint16Array(3 * M);
  const local = divmodSmall(A, lib.K, BOOKS_PER_HEX, H.subarray(0, A.length));
  const hex = {};
  for (let a = 0; a < 3; a++) {
    const nat = new Uint16Array(M);
    for (let j = 0; j < M; j++) nat[j] = H[3 * j + a];
    hex[AXES[a]] = naturalToCoord(nat, lib.K);
  }
  return { hex, local };
}

/** The full text of the book at a shelf position, as digits (null past the end). */
export function readBook(lib, hex, local) {
  const A = bookAddress(lib, hex, local);
  if (!A) return null;
  return unpermute(A, lib.K, lib.keys);
}

/** Where a given book content is shelved. */
export function shelveBook(lib, content, onRound) {
  if (content.length !== lib.bookLen) throw new Error('content must be a whole book');
  const A = permute(content, lib.K, lib.keys, onRound);
  return { ...locateAddress(lib, A), address: A };
}

export function cloneHex(hex) {
  return { gallery: hex.gallery.clone(), level: hex.level.clone(), corridor: hex.corridor.clone() };
}

export function originHex(lib) {
  return { gallery: Coord.zero(lib), level: Coord.zero(lib), corridor: Coord.zero(lib) };
}

/** Deterministic 32-bit seeds for the renderer, consistent under ±1 steps. */
export function hexSeeds(hex) {
  return [hex.gallery.low32(), hex.level.low32(), hex.corridor.low32()];
}
