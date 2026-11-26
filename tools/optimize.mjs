// Hill-climbing deck optimizer: swaps cards within faction + neutral pool, scored by
// win rate against the three gatekeepers (common random numbers to cut noise).
// usage: node tools/optimize.mjs <presetIndex 0|1|2> [iterations=45] [gamesPerBoss=50]
import { loadEngine } from './load.mjs';
const L = loadEngine();
const E = L.E, AI = L.AI;
const pi = +process.argv[2] || 0;
const ITER = +process.argv[3] || 45;
const N = +process.argv[4] || 50;
const preset = L.PRESETS[pi];
const agent = L.AGENTS[pi];
const fac = preset.faction;
const pool = L.COLLECTIBLE.filter((id) => [fac, 'neutral'].includes(L.CARDS[id].faction));
const maxOf = (id) => (L.CARDS[id].rarity === 'legendary' ? 1 : 2);

function score(deck) {
  let w = 0, n = 0;
  for (const bid of L.BOSSES) {
    const b = L.HEROES[bid];
    for (let k = 0; k < N; k++) {
      const G = E.newGame({ seed: (+process.env.SEED || 7000) + k * 131 + bid.length, first: k % 2, depth: b.startDepth, players: [{ hero: agent, deck }, { hero: bid, deck: b.deck }] });
      for (const pid of [0, 1]) E.mulligan(G, pid, AI.mulligan(G, pid));
      E.begin(G);
      let g = 0;
      while (!G.over && g++ < 200) AI.playTurn(G, G.active, G.active === 0 ? 'balanced' : b.persona);
      if (G.winner === 0) w++;
      n++;
    }
  }
  return w / n;
}
const count = (d, id) => d.filter((x) => x === id).length;
let best = preset.cards.slice();
let bestS = score(best);
console.log(`start ${preset.name}: ${(bestS * 100).toFixed(1)}%`);
const rnd = (n) => Math.floor(Math.random() * n);
for (let it = 0; it < ITER; it++) {
  const d = best.slice();
  const swaps = 1 + rnd(2);
  for (let s = 0; s < swaps; s++) {
    d.splice(rnd(d.length), 1);
    let id;
    for (let t = 0; t < 50; t++) { id = pool[rnd(pool.length)]; if (count(d, id) < maxOf(id)) break; }
    d.push(id);
  }
  // keep faction identity
  if (d.filter((id) => L.CARDS[id].faction === fac).length < 18) continue;
  if (L.validateDeck(d, []).length) continue;
  const s = score(d);
  if (s >= bestS) {
    bestS = s;
    best = d;
    console.log(`it ${it}: ${(s * 100).toFixed(1)}%`);
  }
}
const tally = {};
for (const id of best) tally[id] = (tally[id] || 0) + 1;
console.log('FINAL', preset.id, (bestS * 100).toFixed(1) + '%', JSON.stringify(Object.entries(tally).sort()));
