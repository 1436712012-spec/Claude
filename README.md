# The Library of Babel · 巴别图书馆

An explorable, real-time ray-marched version of Borges' *Library of Babel*, built on an **exact book-level bijection**: every possible 410-page book has exactly one shelf position, and every shelf position holds exactly one book.

You can walk the hexagonal galleries, look down the bottomless air shaft, climb the spiral stair, take any book off any shelf and read it, or type a sentence and travel to the book it is already printed in.

```
npm install
npm run dev      # http://localhost:5173/
npm test         # bijection tests (node:test)
npm run build    # dist/index.html — one self-contained 117 KB file
```

## What makes it different

**Every book, not every page.** Most online versions of the Library guarantee that every *page* exists somewhere. Here the whole book is the unit: the 1,312,000 characters of a Latin volume (656,000 for a Han volume) are treated as a single base-K number and mapped by a keyed Feistel permutation to an address of the same length. Nothing is generated and nothing repeats; a search computes where a book already stands.

**No BigInt.** Coordinates have up to 437,334 base-29 digits each. All arithmetic — multiply/divide by 640, increment, halve, parity — runs directly on `Uint16Array` digit vectors in linear time, so decoding a whole book takes ~50 ms in a background worker on ordinary hardware and does not depend on the JavaScript engine having fast big integers.

**One architecture, two renderers of it.** The gallery geometry lives in `src/world/geometry.js`. The GLSL constants are generated from it, and the CPU uses the same numbers and the same integer hash for picking, collision and for the book that flies off the shelf. The book you click is exactly the book the GPU drew, with the same spine glyphs that appear on the reader's title.

**Links that lead to a sentence.** After a search in "only this book" mode the page hash holds the sentence itself (hex-encoded, never the address). Whoever opens the link is told someone left them a message, enters the right library, and is carried to the page — the bijection guarantees everyone arrives at the same shelf.

**Two universes.**
| | Latin volumes | Han volumes |
|---|---|---|
| alphabet | 26 letters, space, comma, period (K = 29) | 20,902 CJK ideographs, space, comma, period (K = 20,905) |
| page | 40 lines × 80 characters | 40 vertical columns × 40 characters, read right to left |
| books | ≈ 10^1,918,666 | ≈ 10^2,834,084 |

## The mapping

```
content  ──Feistel (4 rounds, digit-wise mod K)──▶  address A        (N digits)
A = H · 640 + local          local = wall·160 + shelf·32 + volume
H's digits, de-interleaved 3 ways  ──▶  three naturals
natural ──zig-zag (0,1,2,3,4 → 0,−1,1,−2,2)──▶  corridor, gallery, level
```

Each arrow is a bijection; `test/babel.test.js` checks every one of them, including full-book round trips in both alphabets and that a searched sentence is found again at the computed shelf. Because K is odd, the parity of a base-K number is the parity of its digit sum, which keeps the zig-zag step linear.

Walking one gallery along the corridor changes the gallery coordinate by exactly one, so neighbouring rooms are genuinely neighbouring addresses. The renderer only needs the low 32 bits of each coordinate (two's complement, maintained incrementally) to seed the look of each room.

## The scene

`src/render/scene.glsl.js` ray-marches a signed distance field of the whole lattice in one fragment shader:

- hexagonal galleries with four shelved walls (5 shelves × 32 books), a central air shaft with a balustrade, two hanging lamps;
- hallways with two closets and an aged mirror (one reflection bounce), a stair well with a 16-step-per-turn helical stair whose open eye carries an endless cable of lamps;
- books with per-volume height, thickness, depth, leather or cloth, raised gold bands and glyph titles sampled from a font atlas (paper title strips for Han volumes);
- soft shadows, AO, analytic in-scattering around lamps, fog;
- progressive accumulation with Halton jitter whenever the camera rests, dual-filter bloom, ACES grade, grain;
- dynamic resolution to hold frame time.

## Controls

| | |
|---|---|
| `W A S D` / arrows, `Shift` | walk, walk faster |
| drag | look around |
| click a spine | take the book; `←` `→` turn pages, `Esc` close |
| `E` / `Q` beside a stair | climb up / down one level |
| `F` at the railing, `Space` | leap into the shaft, grab a railing |
| `/` | search |

Touch: drag on the left third to walk, elsewhere to look; tap a spine to read; contextual buttons appear for the stair and the shaft.

## Layout

```
src/babel/     alphabets, digit arithmetic, Feistel, address mapping, search, worker
src/world/     shared geometry, camera
src/render/    scene shader, post-processing, WebGL2 renderer
src/ui/        reader, search panel, number formatting
scripts/       dev server, single-file build, screenshot and end-to-end scripts
test/          bijection tests
```

The opening line quoted in the interface is a short translation made for this project.
