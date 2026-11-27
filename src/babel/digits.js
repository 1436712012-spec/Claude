// Arithmetic on huge natural numbers stored as little-endian base-K digit
// vectors (Uint16Array, digit i has weight K^i).
//
// Every operation the library needs is linear in the number of digits:
// multiplying or dividing by a small integer, incrementing, halving, parity.
// Nothing here converts to binary, so a 1.3-million-digit address costs a few
// milliseconds on any JavaScript engine, with or without fast BigInt.

/** out = src * m + add. Returns true when the result overflowed `out.length` digits. */
export function mulSmallAdd(src, K, m, add, out) {
  let carry = add;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const v = (i < src.length ? src[i] : 0) * m + carry;
    carry = Math.floor(v / K);
    out[i] = v - carry * K;
  }
  return carry !== 0;
}

/** Long division by a small integer. Writes the quotient into `q`, returns the remainder. */
export function divmodSmall(src, K, m, q) {
  let rem = 0;
  for (let i = src.length - 1; i >= 0; i--) {
    const cur = rem * K + src[i];
    const d = Math.floor(cur / m);
    q[i] = d;
    rem = cur - d * m;
  }
  return rem;
}

/** In-place increment. Returns true on overflow. */
export function increment(a, K) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] + 1 < K) {
      a[i] += 1;
      return false;
    }
    a[i] = 0;
  }
  return true;
}

/** In-place decrement of a non-zero number. Returns true on underflow (input was zero). */
export function decrement(a, K) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] > 0) {
      a[i] -= 1;
      return false;
    }
    a[i] = K - 1;
  }
  return true;
}

/** Parity of the number. For odd K every power of K is odd, so it is the digit-sum parity. */
export function parity(a) {
  let p = 0;
  for (let i = 0; i < a.length; i++) p ^= a[i] & 1;
  return p;
}

/** In-place floor division by two. Returns the dropped bit. */
export function halve(a, K) {
  let rem = 0;
  for (let i = a.length - 1; i >= 0; i--) {
    const cur = rem * K + a[i];
    a[i] = cur >> 1;
    rem = cur & 1;
  }
  return rem;
}

/** In-place doubling. Returns true on overflow. */
export function double(a, K) {
  let carry = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i] * 2 + carry;
    if (v >= K) {
      a[i] = v - K;
      carry = 1;
    } else {
      a[i] = v;
      carry = 0;
    }
  }
  return carry !== 0;
}

export function isZero(a) {
  for (let i = 0; i < a.length; i++) if (a[i] !== 0) return false;
  return true;
}

/** Number of significant digits (index of the highest non-zero digit + 1). */
export function sigLength(a) {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] !== 0) return i + 1;
  return 0;
}

/** Value modulo 2^32 (two's-complement friendly), via Horner with 32-bit multiply. */
export function low32(a, K) {
  let v = 0;
  for (let i = a.length - 1; i >= 0; i--) v = (Math.imul(v, K) + a[i]) | 0;
  return v >>> 0;
}

export function compare(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = n - 1; i >= 0; i--) {
    const x = i < a.length ? a[i] : 0;
    const y = i < b.length ? b[i] : 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Magnitude of the number as base-10 scientific notation, from its leading
 * digits and the logarithm of the radix. Exact (as a Number) when it fits.
 */
export function magnitude(a, K) {
  const L = sigLength(a);
  if (L === 0) return { exact: 0, log10: -Infinity, digits: 0 };
  if (L * Math.log2(K) < 52) {
    let v = 0;
    for (let i = L - 1; i >= 0; i--) v = v * K + a[i];
    return { exact: v, log10: Math.log10(v), digits: L };
  }
  let m = 0;
  let scale = 1;
  for (let i = L - 1; i >= Math.max(0, L - 4); i--) {
    m += a[i] * scale;
    scale /= K;
  }
  return { exact: null, log10: Math.log10(m) + (L - 1) * Math.log10(K), digits: L };
}
