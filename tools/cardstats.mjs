// Per-card "played-in-wins" rate across mixed matchups, to spot over/under-tuned cards.
import { loadEngine } from './load.mjs';
const L = loadEngine(); const E = L.E, AI = L.AI;
const N = +process.argv[2] || 300;
const decks = [L.PRESETS[0], L.PRESETS[1], L.PRESETS[2]].map((p) => p.cards);
const bosses = L.BOSSES.map((id) => L.HEROES[id]);
const st = {}; // cid -> {games, wins}
const fw = { win: [0, 0, 0], n: [0, 0, 0] };
let turns = 0;
for (let g = 0; g < N; g++) {
  const a = g % 3, b = (g + 1 + (g % 2)) % 3;
  const useBoss = g % 2 === 0;
  const bh = bosses[g % 3];
  const P1 = useBoss ? { hero: bh.id, deck: bh.deck, persona: bh.persona } : { hero: L.AGENTS[b], deck: decks[b], persona: 'balanced' };
  const G = E.newGame({ seed: 9000 + g * 31, depth: useBoss ? bh.startDepth : 0, players: [{ hero: L.AGENTS[a], deck: decks[a] }, { hero: P1.hero, deck: P1.deck }] });
  for (const pid of [0, 1]) E.mulligan(G, pid, AI.mulligan(G, pid));
  E.begin(G);
  let guard = 0;
  while (!G.over && guard++ < 200) AI.playTurn(G, G.active, G.active === 0 ? 'balanced' : P1.persona);
  turns += G.turn;
  fw.n[a]++; if (G.winner === 0) fw.win[a]++;
  for (const pid of [0, 1]) {
    for (const cid in G.players[pid].stats.cids) {
      const s = (st[cid] = st[cid] || { g: 0, w: 0, n: 0 });
      s.g++; s.n += G.players[pid].stats.cids[cid]; if (G.winner === pid) s.w++;
    }
  }
}
console.log('faction win as P0:', ['site', 'level', 'dream'].map((f, i) => f + ' ' + ((fw.win[i] / fw.n[i]) * 100).toFixed(0) + '%').join('  '), ' avg turns', (turns / N).toFixed(1));
const rows = Object.entries(st).map(([cid, s]) => [cid, L.CARDS[cid].name, s.g, ((s.w / s.g) * 100).toFixed(0)]).sort((x, y) => x[3] - y[3]);
for (const r of rows) console.log(r[0].padEnd(10), String(r[2]).padStart(4), (r[3] + '%').padStart(5), r[1]);
