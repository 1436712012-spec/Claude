// Searching the Library: build a book that contains the text, then compute
// where that book already stands. Nothing is generated; the shelf position is
// a function of the content.

import { shelveBook, splitLocal, BOOKS_PER_HEX } from './address.js';

export const MODES = ['alone', 'noise', 'blank'];

function randomDigits(K, n) {
  const out = new Uint16Array(n);
  const buf = new Uint32Array(Math.min(n, 16384));
  for (let i = 0; i < n; i += buf.length) {
    const m = Math.min(buf.length, n - i);
    crypto.getRandomValues(buf.subarray(0, m));
    for (let j = 0; j < m; j++) out[i + j] = buf[j] % K;
  }
  return out;
}

function randomInt(n) {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] % n;
}

/**
 * Find a book holding `digits` (already normalised to the library's alphabet).
 *   alone  - the one book whose first page begins with the text and is blank elsewhere
 *   noise  - the text on a random page among random characters (a different book each time)
 *   blank  - the text on a random page and position, everything else blank
 */
export function findText(lib, digits, mode = 'alone', onRound) {
  if (digits.length === 0) throw new Error('empty text');
  if (digits.length > lib.pageLen) throw new Error('text longer than one page');
  let content;
  let page = 0;
  let offset = 0;
  if (mode === 'noise') {
    content = randomDigits(lib.K, lib.bookLen);
    page = randomInt(lib.pages);
    offset = randomInt(lib.pageLen - digits.length + 1);
  } else {
    content = new Uint16Array(lib.bookLen).fill(lib.space);
    if (mode === 'blank') {
      page = randomInt(lib.pages);
      offset = randomInt(lib.pageLen - digits.length + 1);
    }
  }
  content.set(digits, page * lib.pageLen + offset);
  const placed = shelveBook(lib, content, onRound);
  return {
    hex: placed.hex,
    local: placed.local,
    ...splitLocal(placed.local),
    page,
    offset,
    length: digits.length,
    content,
  };
}

/** A uniformly random shelf position (random address, then located). */
export function randomBook(lib) {
  const content = randomDigits(lib.K, lib.bookLen);
  const placed = shelveBook(lib, content);
  return { hex: placed.hex, local: placed.local, ...splitLocal(placed.local) };
}

/** log10 of the number of books in the library. */
export function log10Books(lib) {
  return lib.bookLen * Math.log10(lib.K);
}

/** log10 of the number of hexagons. */
export function log10Hexagons(lib) {
  return log10Books(lib) - Math.log10(BOOKS_PER_HEX);
}

/**
 * log10 of how many books contain a given string of length n at least once
 * (upper-bound style count: positions × free choices for the other symbols).
 */
export function log10BooksContaining(lib, n) {
  const N = lib.bookLen;
  return Math.log10(N - n + 1) + (N - n) * Math.log10(lib.K);
}

export function formatPow10(x) {
  if (!isFinite(x)) return '0';
  const e = Math.floor(x);
  const m = Math.pow(10, x - e);
  return { mantissa: m.toFixed(2), exponent: e.toLocaleString('en-US') };
}
