// Infinite liminal architecture, generated per chunk from a seeded hash.
// Every chunk owns its north row and west column of walls (with wide gaps),
// so neighbouring chunks are always connected; the interior gets one of a few
// "room templates" (pool hall, colonnade, broken partitions, sealed secret room).

import { MAP } from './config';
import { hash3, mulberry32 } from './rng';

export const enum Cell { Floor = 0, Wall = 1, Water = 2, Secret = 3 }

export interface Chest { id: string; x: number; y: number; opened: boolean }
export interface Ring { x: number; y: number; hue: number; phase: number }

interface Chunk { cells: Uint8Array; chests: Chest[]; rings: Ring[] }

const N = MAP.chunk;

export class WorldMap {
  private chunks = new Map<number, Chunk>();
  constructor(public seed: number) {}

  private key(cx: number, cy: number) { return (cx + 32768) * 65536 + (cy + 32768); }

  chunk(cx: number, cy: number): Chunk {
    const k = this.key(cx, cy);
    let c = this.chunks.get(k);
    if (!c) { c = this.generate(cx, cy); this.chunks.set(k, c); }
    return c;
  }

  cell(x: number, y: number): Cell {
    const cx = Math.floor(x / N), cy = Math.floor(y / N);
    const c = this.chunk(cx, cy);
    return c.cells[(y - cy * N) * N + (x - cx * N)] as Cell;
  }

  solid(x: number, y: number) { return this.cell(x, y) === Cell.Wall; }
  solidAt(wx: number, wy: number) { return this.solid(Math.floor(wx), Math.floor(wy)); }
  waterAt(wx: number, wy: number) { return this.cell(Math.floor(wx), Math.floor(wy)) === Cell.Water; }

  chestsInRect(x0: number, y0: number, x1: number, y1: number): Chest[] {
    const out: Chest[] = [];
    for (let cy = Math.floor(y0 / N); cy <= Math.floor(y1 / N); cy++)
      for (let cx = Math.floor(x0 / N); cx <= Math.floor(x1 / N); cx++)
        for (const ch of this.chunk(cx, cy).chests) if (!ch.opened) out.push(ch);
    return out;
  }

  ringsInRect(x0: number, y0: number, x1: number, y1: number): Ring[] {
    const out: Ring[] = [];
    for (let cy = Math.floor(y0 / N); cy <= Math.floor(y1 / N); cy++)
      for (let cx = Math.floor(x0 / N); cx <= Math.floor(x1 / N); cx++)
        out.push(...this.chunk(cx, cy).rings);
    return out;
  }

  private generate(cx: number, cy: number): Chunk {
    const r = mulberry32(hash3(cx, cy, this.seed));
    const cells = new Uint8Array(N * N);
    const set = (x: number, y: number, v: Cell) => { if (x >= 0 && y >= 0 && x < N && y < N) cells[y * N + x] = v; };
    const get = (x: number, y: number) => cells[y * N + x];
    const isStart = cx === 0 && cy === 0;

    // --- Boundary walls (north row, west column) with generous openings ---
    const edge = (horizontal: boolean) => {
      if (r() < 0.22) return; // open seam: two halls bleed into one big space
      const gaps: Array<[number, number]> = [];
      const count = r() < 0.55 ? 1 : 2;
      for (let g = 0; g < count; g++) {
        const w = 4 + Math.floor(r() * 5);
        const s = 2 + Math.floor(r() * (N - 4 - w));
        gaps.push([s, s + w]);
      }
      for (let i = 0; i < N; i++) {
        if (gaps.some(([a, b]) => i >= a && i < b)) continue;
        horizontal ? set(i, 0, Cell.Wall) : set(0, i, Cell.Wall);
      }
    };
    edge(true);
    edge(false);
    set(0, 0, Cell.Wall); // corner post

    const chests: Chest[] = [];
    const rings: Ring[] = [];

    const pool = (minW: number, maxW: number) => {
      const w = minW + Math.floor(r() * (maxW - minW));
      const h = 5 + Math.floor(r() * 5);
      const x0 = 3 + Math.floor(r() * (N - 5 - w));
      const y0 = 3 + Math.floor(r() * (N - 5 - h));
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (get(x, y) === Cell.Floor) set(x, y, Cell.Water);
      const ringCount = r() < 0.7 ? 1 + Math.floor(r() * 2) : 0;
      for (let i = 0; i < ringCount; i++) {
        rings.push({ x: cx * N + x0 + 1 + r() * (w - 2), y: cy * N + y0 + 1 + r() * (h - 2), hue: r(), phase: r() * 6.28 });
      }
    };

    const pillars = () => {
      const step = 5 + Math.floor(r() * 3);
      const off = 3 + Math.floor(r() * 2);
      for (let y = off; y < N - 2; y += step) for (let x = off; x < N - 2; x += step) set(x, y, Cell.Wall);
    };

    const halfWalls = () => {
      const n = 2 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const len = 4 + Math.floor(r() * 5);
        const horiz = r() < 0.5;
        const x0 = 4 + Math.floor(r() * (N - 8 - (horiz ? len : 0)));
        const y0 = 4 + Math.floor(r() * (N - 8 - (horiz ? 0 : len)));
        for (let k = 0; k < len; k++) set(horiz ? x0 + k : x0, horiz ? y0 : y0 + k, Cell.Wall);
        if (r() < 0.5) { // L-shaped return
          const ret = 2 + Math.floor(r() * 2);
          for (let k = 1; k <= ret; k++) set(horiz ? x0 + len - 1 : x0 + k, horiz ? y0 + k : y0 + len - 1, Cell.Wall);
        }
      }
    };

    // A sealed 4×4 room — only reachable by noclipping through its wall.
    const secret = () => {
      const x0 = 5 + Math.floor(r() * (N - 13));
      const y0 = 5 + Math.floor(r() * (N - 13));
      for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 6; x++) {
        const border = x === x0 || y === y0 || x === x0 + 5 || y === y0 + 5;
        set(x, y, border ? Cell.Wall : Cell.Secret);
      }
      chests.push({ id: `${cx},${cy}`, x: cx * N + x0 + 3, y: cy * N + y0 + 3, opened: false });
    };

    if (isStart) {
      // First impression: an open, quiet hall with a pool slightly up-right.
      for (let y = 6; y < 12; y++) for (let x = 14; x < 22; x++) set(x, y, Cell.Water);
      rings.push({ x: 17.3, y: 8.4, hue: 0.92, phase: 0 });
      set(5, 18, Cell.Wall); set(5, 5, Cell.Wall); set(19, 18, Cell.Wall);
    } else {
      const roll = r();
      if (roll < 0.34) { pool(6, 13); if (r() < 0.4) pillars(); }
      else if (roll < 0.54) pillars();
      else if (roll < 0.74) halfWalls();
      else if (roll < 0.9) { secret(); if (r() < 0.5) pool(5, 8); }
      // else: empty hall — the loneliest rooms are the most liminal ones
      // Pillars/half walls must never seal water or secret rooms; re-stamp secret floor.
    }

    return { cells, chests, rings };
  }

  // RGBA mask for the floor shader: R = water, G = wall, B = blurred water (depth), A = secret floor.
  buildMask(ox: number, oy: number, size: number, out: Uint8Array) {
    const water = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const c = this.cell(ox + x, oy + y);
      const i = (y * size + x) * 4;
      out[i] = c === Cell.Water ? 255 : 0;
      out[i + 1] = c === Cell.Wall ? 255 : 0;
      out[i + 3] = c === Cell.Secret ? 255 : 0;
      water[y * size + x] = c === Cell.Water ? 1 : 0;
    }
    // Distance-ish depth: repeated erosion so pool centres read deeper.
    let cur = water;
    const depth = new Float32Array(size * size);
    for (let pass = 0; pass < 4; pass++) {
      const next = new Float32Array(size * size);
      for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        next[i] = Math.min(cur[i], cur[i - 1], cur[i + 1], cur[i - size], cur[i + size]);
        depth[i] += next[i];
      }
      cur = next;
    }
    for (let i = 0; i < size * size; i++) out[i * 4 + 2] = Math.min(255, Math.round((depth[i] / 4) * 255));
  }
}
