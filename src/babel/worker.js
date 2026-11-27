// Background computation of books and searches, so the 1.3-million-digit
// Feistel network never stalls an animation frame.

import { LIBRARIES } from './alphabet.js';
import { readBook, Coord, AXES } from './address.js';
import { findText, randomBook } from './search.js';

export function packHex(hex) {
  const out = {};
  for (const a of AXES) out[a] = { neg: hex[a].neg, mag: hex[a].mag };
  return out;
}

export function unpackHex(lib, p) {
  const out = {};
  for (const a of AXES) out[a] = new Coord(lib.K, lib.coordLen, p[a].neg, Uint16Array.from(p[a].mag));
  return out;
}

const VIZ = 120; // digits of each half recorded per round for the visualisation

export function handle(msg) {
  const lib = LIBRARIES[msg.lib];
  if (msg.op === 'read') {
    const book = readBook(lib, unpackHex(lib, msg.hex), msg.local);
    return { book };
  }
  if (msg.op === 'find') {
    const rounds = [];
    const r = findText(lib, Uint16Array.from(msg.digits), msg.mode, (i, L, R, f) => {
      rounds.push({ L: L.slice(0, VIZ), R: R.slice(0, VIZ), F: f.slice(0, VIZ) });
    });
    const h = lib.bookLen / 2;
    const input = { L: r.content.slice(0, VIZ), R: r.content.slice(h, h + VIZ) };
    return {
      hex: packHex(r.hex), local: r.local, wall: r.wall, shelf: r.shelf, volume: r.volume,
      page: r.page, offset: r.offset, length: r.length, rounds, input,
    };
  }
  if (msg.op === 'random') {
    const r = randomBook(lib);
    return { hex: packHex(r.hex), local: r.local, wall: r.wall, shelf: r.shelf, volume: r.volume };
  }
  throw new Error('unknown op ' + msg.op);
}

if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.onmessage = (e) => {
    const { id } = e.data;
    try {
      const res = handle(e.data);
      const transfer = [];
      if (res.book) transfer.push(res.book.buffer);
      self.postMessage({ id, ok: true, res }, transfer);
    } catch (err) {
      self.postMessage({ id, ok: false, error: String(err && err.message || err) });
    }
  };
}
