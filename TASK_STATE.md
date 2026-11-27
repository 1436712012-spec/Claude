# TASK_STATE — The Library of Babel

Goal: an explorable, GPU ray-marched Library of Babel with an exact, book-level
bijection, text search that computes a book's location, and a cinematic journey to it.

## Done
- [x] Core math: alphabets, linear-time base-K digit arithmetic, 4-round Feistel, address mapping, search (15 tests)
- [x] Ray-marched renderer: galleries, shaft + balustrade, hallway, closets, mirror, spiral stair with lamp cable, books with glyph spines
- [x] Post: accumulation when still, bloom, ACES grade, grain, travel/fall streaks
- [x] Walking (keys, drag, touch joystick), collision, stairs (E/Q), the fall (F / Space)
- [x] Book picking, pull-out flight, reader with 3D page turns (Latin horizontal, Han vertical RTL)
- [x] Search panel with live Feistel visualisation and location card; travel animation; random book
- [x] HUD, intro, about panel with full coordinate names, library switch, quality toggle
- [x] Shareable sentence links (#l-/#h- + hex UTF-8): intro note → auto search → travel → page
- [x] Single-file build (dist/index.html, dist/artifact.html), e2e + movement scripts, README

## Verified (headless Chromium, SwiftShader)
- e2e Latin and Han: intro → walk → open book → flip → search → travel → found text highlighted
- stairs change level by exactly one; fall + grab lands on the walkway of a lower level
- shared Han link opens the reader with the sentence highlighted
- phone layout (iPhone 13 profile): no horizontal overflow

## Ideas for later
- Brass plaques above hallway doors showing gallery numbers
- Dust motes in lamp light; ambient sound
