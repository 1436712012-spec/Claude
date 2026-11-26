// Headless AI-vs-AI simulation: checks the engine never throws, games terminate, and reports balance stats.
// usage: node tools/sim.mjs [games=200] [seed=1]
import { loadEngine } from './load.mjs';

const L = loadEngine();
const E = L.E, AI = L.AI;
const N = +process.argv[2] || 200;
const seed0 = +process.argv[3] || 1;

const decks = {
  site: L.PRESETS[0].cards, level: L.PRESETS[1].cards, dream: L.PRESETS[2].cards,
  manager: L.HEROES.boss_manager.deck, lifeguard: L.HEROES.boss_lifeguard.deck, broadcast: L.HEROES.boss_broadcast.deck,
};
for (const [k, d] of Object.entries(decks)) {
  const errs = L.validateDeck(d, L.BOSS_CARDS);
  if (errs.length) { console.error('deck', k, errs); process.exitCode = 1; }
}

function runGame(seed, a, b) {
  const G = E.newGame({
    seed,
    depth: b.depth || 0,
    players: [
      { hero: a.hero, deck: a.deck, ai: true },
      { hero: b.hero, deck: b.deck, ai: true },
    ],
  });
  for (const pid of [0, 1]) E.mulligan(G, pid, AI.mulligan(G, pid));
  E.begin(G);
  let guard = 0;
  while (!G.over && guard++ < 200) {
    const pid = G.active;
    AI.playTurn(G, pid, pid === 0 ? a.persona : b.persona);
  }
  return G;
}

const matchups = [];
const agents = L.AGENTS;
const pre = ['site', 'level', 'dream'];
for (const bossId of L.BOSSES) {
  const boss = L.HEROES[bossId];
  for (let i = 0; i < pre.length; i++) {
    matchups.push({
      name: `${pre[i]}/${agents[i].replace('agent_', '')} vs ${boss.bossKey}`,
      a: { hero: agents[i], deck: decks[pre[i]], persona: 'balanced' },
      b: { hero: bossId, deck: decks[boss.bossKey], persona: boss.persona, depth: boss.startDepth },
    });
  }
}
// mirror-ish preset fights
matchups.push({ name: 'site vs level', a: { hero: 'agent_shen', deck: decks.site, persona: 'balanced' }, b: { hero: 'agent_tang', deck: decks.level, persona: 'balanced' } });
matchups.push({ name: 'level vs dream', a: { hero: 'agent_tang', deck: decks.level, persona: 'balanced' }, b: { hero: 'agent_man', deck: decks.dream, persona: 'balanced' } });
matchups.push({ name: 'dream vs site', a: { hero: 'agent_man', deck: decks.dream, persona: 'balanced' }, b: { hero: 'agent_shen', deck: decks.site, persona: 'balanced' } });

const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-');
const t0 = Date.now();
let errors = 0, total = 0;
const per = Math.max(1, Math.round(N / matchups.length));
for (const mu of matchups) {
  let w = 0, l1 = [], l2 = [], fat = 0, turns = 0, layers = [0, 0, 0], draws = 0, timeouts = 0, fake = 0, breach = 0, contained = 0;
  for (let k = 0; k < per; k++) {
    total++;
    let G;
    try {
      G = runGame(seed0 * 1000 + total * 13, mu.a, mu.b);
    } catch (e) {
      errors++;
      console.error('ERROR in', mu.name, 'seed', seed0 * 1000 + total * 13, e.stack);
      continue;
    }
    if (!G.over) timeouts++;
    if (G.winner === 0) w++;
    if (G.winner === -1) draws++;
    turns += G.turn;
    if (G.layerAt[1]) l1.push(G.layerAt[1]);
    if (G.layerAt[2]) l2.push(G.layerAt[2]);
    fat += G.players[0].fatigue + G.players[1].fatigue > 0 ? 1 : 0;
    layers[G.deepest]++;
    breach += G.players[0].stats.breaches + G.players[1].stats.breaches;
    contained += G.players[0].stats.contained + G.players[1].stats.contained;
  }
  console.log(
    `${mu.name.padEnd(28)} P0 win ${((w / per) * 100).toFixed(0).padStart(3)}%  turns ${(turns / per).toFixed(1)}  deepest L0/L1/L2 ${layers.join('/')}  L1@${avg(l1)} L2@${avg(l2)} fatigue ${fat} draws ${draws} timeouts ${timeouts}  contained ${contained} breaches ${breach}`
  );
}
console.log(`\n${total} games, ${errors} errors, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (errors) process.exitCode = 1;
