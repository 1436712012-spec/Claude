// Alphabets of the two libraries.
//
// Every library is defined by an odd radix K (the number of orthographic
// symbols), a page shape and the number of pages per book. A book is a vector
// of `bookLen` base-K digits. Odd K matters: parity of a base-K number is then
// the parity of its digit sum, which keeps the zig-zag coordinate mapping O(n).

const HAN_FIRST = 0x4e00;
const HAN_LAST = 0x9fa5; // inclusive: the 20,902 ideographs supported by virtually every CJK font

function freezeLib(lib) {
  if (lib.K % 2 === 0) throw new Error('radix must be odd');
  if (lib.bookLen % 2 !== 0) throw new Error('book length must be even');
  // glyph code points as a typed array for fast page decoding
  const codes = new Uint16Array(lib.K);
  for (let i = 0; i < lib.K; i++) codes[i] = lib.glyphs[i].charCodeAt(0);
  lib.codes = codes;
  const index = new Map();
  for (let i = 0; i < lib.K; i++) index.set(lib.glyphs[i], i);
  lib.index = index;
  lib.coordLen = Math.ceil(lib.bookLen / 3); // digits per coordinate
  return Object.freeze(lib);
}

function makeLatin() {
  const glyphs = 'abcdefghijklmnopqrstuvwxyz ,.'.split('');
  const lines = 40;
  const cols = 80;
  const pages = 410;
  return freezeLib({
    id: 'latin',
    name: '拉丁卷',
    nameEn: 'Latin Volumes',
    K: glyphs.length, // 29
    glyphs,
    space: glyphs.indexOf(' '),
    lines,
    cols,
    pageLen: lines * cols,
    pages,
    bookLen: lines * cols * pages,
    vertical: false,
    // four 128-bit round keys for the Feistel permutation
    keys: [
      [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a],
      [0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19],
      [0xcbbb9d5d, 0x629a292a, 0x9159015a, 0x152fecd8],
      [0x67332667, 0x8eb44a87, 0xdb0c2e0d, 0x47b5481d],
    ],
    normalize: normalizeLatin,
  });
}

function makeHan() {
  const glyphs = [];
  for (let c = HAN_FIRST; c <= HAN_LAST; c++) glyphs.push(String.fromCharCode(c));
  glyphs.push('　', '，', '。');
  const lines = 40; // columns on the page (vertical text)
  const cols = 40; // characters per column
  const pages = 410;
  return freezeLib({
    id: 'han',
    name: '汉字卷',
    nameEn: 'Han Volumes',
    K: glyphs.length, // 20,905
    glyphs,
    space: glyphs.indexOf('　'),
    lines,
    cols,
    pageLen: lines * cols,
    pages,
    bookLen: lines * cols * pages,
    vertical: true,
    keys: [
      [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5],
      [0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5],
      [0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3],
      [0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174],
    ],
    normalize: normalizeHan,
  });
}

/**
 * Map free text onto the Latin alphabet: lower case, diacritics stripped,
 * whitespace collapsed to single spaces. Returns the digits and what was lost.
 */
function normalizeLatin(text) {
  const out = [];
  const dropped = new Set();
  const decomposed = text.normalize('NFKD').toLowerCase();
  let lastSpace = false;
  for (const ch of decomposed) {
    if (/[̀-ͯ]/.test(ch)) continue; // combining marks
    if (/\s/.test(ch)) {
      if (!lastSpace) out.push(26);
      lastSpace = true;
      continue;
    }
    lastSpace = false;
    const c = ch.charCodeAt(0);
    if (c >= 97 && c <= 122) out.push(c - 97);
    else if (ch === ',') out.push(27);
    else if (ch === '.') out.push(28);
    else dropped.add(ch);
  }
  return { digits: Uint16Array.from(out), dropped: [...dropped] };
}

const HAN_COMMA = new Set([',', '、', '，', ';', '；', ':', '：', '·']);
const HAN_STOP = new Set(['.', '。', '!', '！', '?', '？', '…']);

function normalizeHan(text) {
  const out = [];
  const dropped = new Set();
  let lastSpace = false;
  for (const ch of text) {
    if (/\s/.test(ch)) {
      if (!lastSpace) out.push(HAN_LAST - HAN_FIRST + 1);
      lastSpace = true;
      continue;
    }
    lastSpace = false;
    const c = ch.codePointAt(0);
    if (c >= HAN_FIRST && c <= HAN_LAST) out.push(c - HAN_FIRST);
    else if (HAN_COMMA.has(ch)) out.push(HAN_LAST - HAN_FIRST + 2);
    else if (HAN_STOP.has(ch)) out.push(HAN_LAST - HAN_FIRST + 3);
    else dropped.add(ch);
  }
  return { digits: Uint16Array.from(out), dropped: [...dropped] };
}

export const LIBRARIES = Object.freeze({ latin: makeLatin(), han: makeHan() });

/** Decode a run of digits into a string (chunked to stay under argument limits). */
export function digitsToText(lib, digits, start = 0, end = digits.length) {
  const codes = lib.codes;
  let s = '';
  const CHUNK = 8192;
  const buf = new Uint16Array(Math.min(CHUNK, end - start));
  for (let i = start; i < end; i += CHUNK) {
    const n = Math.min(CHUNK, end - i);
    for (let j = 0; j < n; j++) buf[j] = codes[digits[i + j]];
    s += String.fromCharCode.apply(null, n === buf.length ? buf : buf.subarray(0, n));
  }
  return s;
}
