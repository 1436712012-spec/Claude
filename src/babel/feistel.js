// A keyed Feistel permutation over Z_K^N (vectors of N base-K digits, N even).
//
// One round maps (L, R) -> (R, L + F(R)) with digit-wise addition mod K.
// Whatever F is, every round is a bijection, so the whole network is one:
// each possible book content corresponds to exactly one address and back.
// F hashes its half into 128 bits and expands that seed into a full half of
// pseudo-random digits, so one changed letter scrambles the whole address.

const C1 = 0x239b961b;
const C2 = 0xab0e9789;
const C3 = 0x38b34ae5;
const C4 = 0xa1e38b93;

function rotl(x, r) {
  return (x << r) | (x >>> (32 - r));
}

function fmix(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h;
}

/** 128-bit MurmurHash3-style digest of a digit vector, mixed with a round key. */
export function digest(src, key) {
  let h1 = key[0] | 0;
  let h2 = key[1] | 0;
  let h3 = key[2] | 0;
  let h4 = key[3] | 0;
  const n = src.length;
  let i = 0;
  for (; i + 8 <= n; i += 8) {
    let k1 = src[i] | (src[i + 1] << 16);
    let k2 = src[i + 2] | (src[i + 3] << 16);
    let k3 = src[i + 4] | (src[i + 5] << 16);
    let k4 = src[i + 6] | (src[i + 7] << 16);

    k1 = Math.imul(k1, C1); k1 = rotl(k1, 15); k1 = Math.imul(k1, C2); h1 ^= k1;
    h1 = rotl(h1, 19); h1 = (h1 + h2) | 0; h1 = (Math.imul(h1, 5) + 0x561ccd1b) | 0;

    k2 = Math.imul(k2, C2); k2 = rotl(k2, 16); k2 = Math.imul(k2, C3); h2 ^= k2;
    h2 = rotl(h2, 17); h2 = (h2 + h3) | 0; h2 = (Math.imul(h2, 5) + 0x0bcaa747) | 0;

    k3 = Math.imul(k3, C3); k3 = rotl(k3, 17); k3 = Math.imul(k3, C4); h3 ^= k3;
    h3 = rotl(h3, 15); h3 = (h3 + h4) | 0; h3 = (Math.imul(h3, 5) + 0x96cd1c35) | 0;

    k4 = Math.imul(k4, C4); k4 = rotl(k4, 18); k4 = Math.imul(k4, C1); h4 ^= k4;
    h4 = rotl(h4, 13); h4 = (h4 + h1) | 0; h4 = (Math.imul(h4, 5) + 0x32ac3b17) | 0;
  }
  // tail: fold the remaining (< 8) digits into lane 1 one at a time
  for (; i < n; i++) {
    let k = Math.imul(src[i] + 0x9e3779b9, C1);
    k = rotl(k, 15);
    h1 ^= Math.imul(k, C2);
    h1 = (Math.imul(rotl(h1, 13), 5) + 0xe6546b64) | 0;
  }
  h1 ^= n; h2 ^= n; h3 ^= n; h4 ^= n;
  h1 = (h1 + h2 + h3 + h4) | 0;
  h2 = (h2 + h1) | 0; h3 = (h3 + h1) | 0; h4 = (h4 + h1) | 0;
  h1 = fmix(h1); h2 = fmix(h2); h3 = fmix(h3); h4 = fmix(h4);
  h1 = (h1 + h2 + h3 + h4) | 0;
  h2 = (h2 + h1) | 0; h3 = (h3 + h1) | 0; h4 = (h4 + h1) | 0;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Expand a 128-bit seed into `out.length` digits in [0, K) with sfc32. */
export function expand(seed, K, out) {
  let a = seed[0] | 0;
  let b = seed[1] | 0;
  let c = seed[2] | 0;
  let d = seed[3] | 0;
  const scale = K / 4294967296;
  for (let i = -12; i < out.length; i++) {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    if (i >= 0) out[i] = Math.floor((t >>> 0) * scale);
  }
  return out;
}

/** F(R): the round function, written into `out`. */
export function roundFunction(half, K, key, out) {
  return expand(digest(half, key), K, out);
}

/**
 * Forward permutation: content -> address. `onRound(r, left, right, f)` is
 * called after every round with views of the state (for visualisation).
 */
export function permute(x, K, keys, onRound) {
  const N = x.length;
  if (N % 2) throw new Error('Feistel width must be even');
  const h = N >> 1;
  let a = Uint16Array.from(x);
  let b = new Uint16Array(N);
  const f = new Uint16Array(h);
  for (let r = 0; r < keys.length; r++) {
    const L = a.subarray(0, h);
    const R = a.subarray(h);
    roundFunction(R, K, keys[r], f);
    b.set(R, 0);
    for (let i = 0; i < h; i++) {
      const s = L[i] + f[i];
      b[h + i] = s >= K ? s - K : s;
    }
    const t = a; a = b; b = t;
    if (onRound) onRound(r, a.subarray(0, h), a.subarray(h), f);
  }
  return a;
}

/** Inverse permutation: address -> content. */
export function unpermute(y, K, keys) {
  const N = y.length;
  if (N % 2) throw new Error('Feistel width must be even');
  const h = N >> 1;
  let a = Uint16Array.from(y);
  let b = new Uint16Array(N);
  const f = new Uint16Array(h);
  for (let r = keys.length - 1; r >= 0; r--) {
    const L2 = a.subarray(0, h); // = R of the previous state
    const R2 = a.subarray(h); // = L + F(R)
    roundFunction(L2, K, keys[r], f);
    for (let i = 0; i < h; i++) {
      const s = R2[i] - f[i];
      b[i] = s < 0 ? s + K : s;
    }
    b.set(L2, h);
    const t = a; a = b; b = t;
  }
  return a;
}
