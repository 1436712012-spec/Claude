import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LIBRARIES, digitsToText } from '../src/babel/alphabet.js';
import {
  mulSmallAdd, divmodSmall, increment, decrement, halve, double, parity, low32, magnitude,
} from '../src/babel/digits.js';
import { permute, unpermute } from '../src/babel/feistel.js';
import {
  Coord, naturalToCoord, coordToNatural, readBook, shelveBook, originHex, cloneHex,
  bookAddress, locateAddress, BOOKS_PER_HEX, localIndex, splitLocal,
} from '../src/babel/address.js';
import { findText, randomBook } from '../src/babel/search.js';

const { latin, han } = LIBRARIES;

function rand(K, n, seed = 1) {
  let s = seed >>> 0;
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s % K;
  }
  return out;
}

function toBig(a, K) {
  let v = 0n;
  for (let i = a.length - 1; i >= 0; i--) v = v * BigInt(K) + BigInt(a[i]);
  return v;
}

test('alphabets have the advertised shape', () => {
  assert.equal(latin.K, 29);
  assert.equal(latin.bookLen, 1312000);
  assert.equal(han.K, 20905);
  assert.equal(han.bookLen, 656000);
  assert.equal(latin.glyphs[latin.space], ' ');
  assert.equal(han.glyphs[han.space], '　');
  assert.equal(latin.K % 2, 1);
  assert.equal(han.K % 2, 1);
});

test('normalisation maps text onto the alphabet', () => {
  const r = latin.normalize('Hello,  World! Café.');
  assert.equal(digitsToText(latin, r.digits), 'hello, world cafe.');
  assert.deepEqual(r.dropped, ['!']);
  const h = han.normalize('天地玄黄，宇宙洪荒! abc');
  assert.equal(digitsToText(han, h.digits), '天地玄黄，宇宙洪荒。　');
  assert.deepEqual(h.dropped.sort(), ['a', 'b', 'c']);
});

test('digit arithmetic agrees with BigInt', () => {
  for (const K of [29, 20905]) {
    const a = rand(K, 300, K);
    const out = new Uint16Array(302);
    mulSmallAdd(a, K, 640, 123, out);
    assert.equal(toBig(out, K), toBig(a, K) * 640n + 123n);

    const q = new Uint16Array(300);
    const r = divmodSmall(a, K, 640, q);
    assert.equal(toBig(q, K), toBig(a, K) / 640n);
    assert.equal(BigInt(r), toBig(a, K) % 640n);

    const b = Uint16Array.from(a);
    increment(b, K);
    assert.equal(toBig(b, K), toBig(a, K) + 1n);
    decrement(b, K);
    decrement(b, K);
    assert.equal(toBig(b, K), toBig(a, K) - 1n);

    assert.equal(BigInt(parity(a)), toBig(a, K) % 2n);
    const c = Uint16Array.from(a);
    const bit = halve(c, K);
    assert.equal(toBig(c, K), toBig(a, K) / 2n);
    assert.equal(BigInt(bit), toBig(a, K) % 2n);
    const d = Uint16Array.from(c);
    double(d, K);
    assert.equal(toBig(d, K), (toBig(a, K) / 2n) * 2n);

    assert.equal(BigInt(low32(a, K)), toBig(a, K) % (1n << 32n));
  }
});

test('magnitude estimates log10 of huge numbers', () => {
  const a = rand(29, 1000, 7);
  const exact = toBig(a, 29).toString().length - 1;
  assert.equal(Math.floor(magnitude(a, 29).log10), exact);
  const small = Uint16Array.from([5, 3, 0, 0]);
  assert.equal(magnitude(small, 29).exact, 5 + 3 * 29);
});

test('Feistel permutation inverts exactly and diffuses', () => {
  for (const lib of [latin, han]) {
    const x = rand(lib.K, 2000, 11);
    const keys = lib.keys;
    const y = permute(x, lib.K, keys);
    assert.deepEqual(unpermute(y, lib.K, keys), x);
    const x2 = Uint16Array.from(x);
    x2[0] = (x2[0] + 1) % lib.K;
    const y2 = permute(x2, lib.K, keys);
    let same = 0;
    for (let i = 0; i < y.length; i++) if (y[i] === y2[i]) same++;
    // two unrelated vectors agree on ~1/K of their positions by chance
    assert.ok(same < (2 * y.length) / lib.K + 10, `one changed digit must change ~all of the address (${same} equal)`);
  }
});

test('zig-zag maps naturals to integers bijectively', () => {
  const K = 29;
  const seen = new Set();
  for (let n = 0; n < 200; n++) {
    const nat = Coord.fromNumber(latin, n).mag; // reuse as natural digits
    const c = naturalToCoord(Uint16Array.from(nat), K);
    const v = (c.neg ? -1 : 1) * Number(toBig(c.mag, K));
    seen.add(v);
    assert.deepEqual(coordToNatural(c), nat);
  }
  assert.equal(seen.size, 200);
  assert.ok(seen.has(-100) && seen.has(99) && !seen.has(100));
});

test('Coord.add steps through zero and keeps low32 consistent', () => {
  const c = Coord.fromNumber(latin, 2);
  const lows = [];
  for (let i = 0; i < 5; i++) {
    lows.push(c.low32());
    c.add(-1);
  }
  assert.deepEqual(lows, [2, 1, 0, 0xffffffff, 0xfffffffe]);
  assert.equal(c.neg, true);
  c.add(3);
  assert.equal(c.isZero(), true);
  assert.equal(c.neg, false);
});

test('shelf positions round-trip: address <-> location', () => {
  const lib = latin;
  const hex = originHex(lib);
  hex.gallery.add(-3);
  hex.level.add(12);
  hex.corridor.add(-1);
  for (const local of [0, 1, 639, localIndex(2, 3, 17)]) {
    const A = bookAddress(lib, hex, local);
    const loc = locateAddress(lib, A);
    assert.equal(loc.local, local);
    assert.ok(loc.hex.gallery.equals(hex.gallery));
    assert.ok(loc.hex.level.equals(hex.level));
    assert.ok(loc.hex.corridor.equals(hex.corridor));
  }
  assert.deepEqual(splitLocal(localIndex(3, 4, 31)), { wall: 3, shelf: 4, volume: 31 });
  assert.equal(BOOKS_PER_HEX, 640);
});

test('a whole book round-trips: content -> shelf -> content (Latin)', () => {
  const content = rand(latin.K, latin.bookLen, 42);
  const t0 = performance.now();
  const placed = shelveBook(latin, content);
  const back = readBook(latin, placed.hex, placed.local);
  const ms = performance.now() - t0;
  assert.deepEqual(back, content);
  assert.ok(ms < 3000, `round trip took ${ms.toFixed(0)} ms`);
});

test('a whole book round-trips (Han)', () => {
  const content = rand(han.K, han.bookLen, 43);
  const placed = shelveBook(han, content);
  assert.deepEqual(readBook(han, placed.hex, placed.local), content);
});

test('the origin hexagon holds random-looking, distinct books', () => {
  const hex = originHex(latin);
  const a = readBook(latin, hex, 0);
  const b = readBook(latin, hex, 1);
  const page = digitsToText(latin, a, 0, latin.pageLen);
  assert.equal(page.length, 3200);
  let diff = 0;
  for (let i = 0; i < 3200; i++) if (a[i] !== b[i]) diff++;
  assert.ok(diff > 3000);
  const counts = new Array(29).fill(0);
  for (let i = 0; i < a.length; i++) counts[a[i]]++;
  const expected = a.length / 29;
  for (const c of counts) assert.ok(Math.abs(c - expected) < expected * 0.05);
});

test('neighbouring hexagons hold different books', () => {
  const hex = originHex(latin);
  const n = cloneHex(hex);
  n.gallery.add(1);
  const a = readBook(latin, hex, 5);
  const b = readBook(latin, n, 5);
  let same = 0;
  for (let i = 0; i < 3200; i++) if (a[i] === b[i]) same++;
  assert.ok(same < 300);
});

test('search finds the text again at the computed shelf', () => {
  for (const lib of [latin, han]) {
    const text = lib === latin ? 'the universe, which others call the library.' : '宇宙，别人称之为图书馆。';
    const { digits } = lib.normalize(text);
    for (const mode of ['alone', 'noise', 'blank']) {
      const r = findText(lib, digits, mode);
      const book = readBook(lib, r.hex, r.local);
      const start = r.page * lib.pageLen + r.offset;
      assert.equal(digitsToText(lib, book, start, start + digits.length), digitsToText(lib, digits));
    }
  }
});

test('the "alone" book is unique and stable', () => {
  const { digits } = latin.normalize('borges');
  const a = findText(latin, digits, 'alone');
  const b = findText(latin, digits, 'alone');
  assert.equal(a.local, b.local);
  assert.ok(a.hex.gallery.equals(b.hex.gallery));
  assert.ok(a.hex.level.equals(b.hex.level));
  assert.ok(a.hex.corridor.equals(b.hex.corridor));
  assert.equal(a.page, 0);
  assert.equal(a.offset, 0);
});

test('random books are readable', () => {
  const r = randomBook(han);
  const book = readBook(han, r.hex, r.local);
  assert.equal(book.length, han.bookLen);
});
