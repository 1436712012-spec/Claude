// Image-generation prompts for every card, hero portrait and token.
// Writes docs/ART_PROMPTS.md and dist/art-prompts.html (copy buttons).
// usage: node tools/prompts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './load.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = loadEngine();

const BASE = 'Painterly digital card-game illustration, rich hand-painted brushwork, soft dramatic lighting with a clear key light and rim light, high detail on the central subject, atmospheric depth, cinematic composition. Faceless humanoids always have smooth, blank faces with no eyes, nose or mouth. No text, no letters, no numbers, no logos, no watermark, no card frame, no border. Square 1:1 image, the main subject centered and kept inside the middle 70% of the canvas because the edges will be cropped.';
const FACTION = {
  site: 'Mood: a sterile containment facility at night — cold cyan and white fluorescent light, clean tiles, frost, yellow-black hazard stripes, small red warning lights, an uncanny calm.',
  level: 'Mood: liminal backrooms — endless mono-yellow wallpaper, damp beige carpet, buzzing fluorescent tubes, sickly yellow light, empty and eerie, deep soft shadows.',
  dream: 'Mood: dreamcore — pastel pink, lavender and sky blue, milky overexposed glow, nostalgic childhood objects, gentle but slightly wrong, hazy light, tiny sparkles.',
  neutral: 'Mood: nostalgic late-1990s liminal spaces — an abandoned mall or kindergarten after closing, VHS-tinted colors, warm but empty, neon reflections.',
};
const CROP = { minion: 'It will be shown inside a tall oval window: a half-length portrait or a single strong object, centered.', spell: 'It will be shown inside a rounded rectangle: one clear magical moment, centered.', field: 'It will be shown as a wide landscape: an environment establishing shot, centered.' };

const SUBJECT = {
  S01: 'a lone night-shift security guard with a blank face, sweeping a flashlight beam across a white corridor; behind him an old CRT television is turned to face the wall and glows faintly around its edges',
  S02: 'a tall cryogenic containment locker with frosted glass, something pale and indistinct pressed against the inside of the glass, frost creeping across the floor, a glowing unreadable temperature display',
  S03: 'a containment specialist in a hooded white hazmat suit with a blank faceplate, raising one hand that releases a freezing cyan lattice of light',
  S04: 'a massive steel isolation door with a round wheel handle and hazard stripes, a red siren lamp above it, small dents bulging outward as if something knocked from the other side',
  S05: 'a rotating red alarm lamp in a dark yellow corridor, red beams sweeping through floating dust, completely silent',
  S06: 'a huge intricate snowflake made of cyan light hovering in darkness, a faint holographic containment grid behind it, drifting snow',
  S07: 'layer upon layer of reinforced wall panels, every new layer covered with the same beige wallpaper, a translucent cyan energy barrier glowing in front',
  S08: 'red-and-white caution tapes criss-crossing a corridor and closing into a loop around a single faceless staff member wearing an ID badge',
  S09: 'a faceless riot guard in a peaked cap holding a tall transparent riot shield scratched from the inside',
  S10: 'an archivist pulling open a drawer of a tall metal filing cabinet, loose papers floating up into the cold air',
  S11: 'a single playing card being wrapped in glowing chains and a cyan containment lattice, a red seal at its center, dark void background',
  S12: 'a wall clock melting down a sterile wall with a heavy padlock hanging on it, time visibly bending',
  S13: 'an entire fluorescent corridor flash-frozen, thick ice on the walls, snow falling slowly under the lights',
  S14: 'three faceless agents in hooded hazmat suits walking toward the viewer down a corridor, chains trailing behind them, strong backlight',
  S15: 'a barred containment cell with heavy chains crossing the frame and a glowing padlock at the center, frost on the bars',
  S16: 'an extremely tall, thin humanoid in a guard uniform standing perfectly still in a white lab, its body covered with many open, watchful eyes',
  S17: 'a supervisor in a long coat seen from behind, standing before a wall of dozens of CRT surveillance monitors showing empty corridors, cold blue glow, commanding presence',
  S18: 'a colossal round vault door coated in thick frost, faint lines of handwriting etched into the frost, snow drifting in darkness',
  B01: 'pale human hands reaching out of a jagged crack in a yellow wallpapered wall',
  B02: 'an office worker with a blank face, a loose tie and an ID badge whose photo is empty, standing politely in an endless cubicle office',
  B03: 'a small figure staring straight up at a ceiling crowded with far too many fluorescent tubes',
  B04: 'a faceless janitor in a hooded work uniform holding a mop beside a yellow wet-floor sign, the carpet glistening wet',
  B05: 'total darkness filled with many glowing almond-shaped eyes slowly opening',
  B06: 'a person halfway slipping sideways through a yellow wall, their body breaking into pixels exactly where it meets the wall',
  B07: 'a yellow corridor the instant the lights die, one tube still flickering, a pair of eyes in the new darkness',
  B08: 'a dark hole torn in the carpet of a yellow corridor, a tiny figure falling into another corridor far below',
  B09: 'an infinite office of identical beige cubicles repeating to the horizon under a grid of fluorescent lights',
  B10: 'a ceiling vent grate dripping warm water onto damp carpet, two faint eyes watching from behind the grate',
  B11: 'a dark underground parking garage, rows of empty cars with every headlight turned on and pointed at the viewer',
  B12: 'elevator doors opening in a yellow lobby, four silhouetted people standing inside, waiting for you to step in',
  B13: 'an impossibly tall, narrow door at the end of a corridor, bending forward to look down at the viewer, thin legs underneath it',
  B14: 'a tall dark figure walking straight through a wall, its body glitching into pixels where it passes the wall surface',
  B15: 'a long-limbed shadow figure standing far down a dim yellow corridor, almost looking like someone you know',
  B16: 'every fluorescent tube blazing white at once, the corridor overexposed, a tiny silhouette at the far end reaching for a light switch',
  B17: 'an empty, worn armchair like a throne in a yellow hall, surrounded by many faceless figures all turned toward it',
  B18: 'a glowing green emergency EXIT sign at the end of an endless dark corridor, a tiny figure walking toward it (the sign shows only the running-man pictogram, no letters)',
  D01: 'iridescent soap bubbles floating in a pastel afternoon sky, one bubble holding a tiny sunny afternoon inside it',
  D02: 'a pastel lavender CRT television in a child\'s bedroom with star wallpaper, its screen glowing with soft cartoon colors',
  D03: 'a kindergarten nap room bathed in warm afternoon sunlight from a window, colorful nap mats, floating dust',
  D04: 'a streak of rainbow light trailing across a pastel sky like a comet, small stars around it',
  D05: 'a pink-and-white swim ring floating alone on a shallow turquoise pool under pastel light',
  D06: 'a small child with pigtails and a blank face standing on a chalk hopscotch grid in a pale corridor',
  D07: 'a soft glowing orb of light hovering above the edge of a swimming pool, a wet whistle lying on the tiles',
  D08: 'a pale hand reaching up to steal a glowing star from a child\'s ceiling of glow-in-the-dark stars',
  D09: 'an oval mirror in a pastel bedroom reflecting a faceless figure who is not standing in the room',
  D10: 'a VHS cassette with a hand-drawn pastel label (no readable text), a small rainbow above it, a child\'s room',
  D11: 'a sleepwalker in pajamas with arms stretched forward, walking under a crescent moon in a lavender night sky',
  D12: 'a rainbow arching over an empty pastel swimming pool, soft clouds',
  D13: 'an empty pastel playground with a slide and swings, the sun frozen in place, long soft shadows',
  D14: 'two identical faceless figures facing each other across a glowing vertical line, perfect mirror symmetry',
  D15: 'a dark child\'s bedroom ceiling covered in glow-in-the-dark stars, with one obvious empty gap where a star is missing',
  D16: 'a pastel pink bubble machine beside a pool, every bubble faintly reflecting a tiny smiling face',
  D17: 'a small child curled up asleep on a nap mat in a sunlit kindergarten, a soft halo of light around them, stars drifting in the air',
  D18: 'an open notebook whose pages fold up into a glowing doorway, light pouring out between handwritten lines',
  N01: 'pale moths swarming around a single buzzing fluorescent tube',
  N02: 'a glowing red vending machine standing alone in a dark, empty mall corridor',
  N03: 'a person with wide, sleepless open eyes sitting up in a dark bedroom, a wall clock hinting at three in the morning',
  N04: 'towers of stacked cardboard moving boxes in a dim mall stockroom lit by stray neon',
  N05: 'a faceless mall security guard in a cap and ID badge shining a flashlight beam, closed neon storefronts behind',
  N06: 'a lost-and-found counter in a closed mall holding a ring of keys, a whistle, a walkie-talkie and an unfinished diary',
  N07: 'an old PA loudspeaker horn on a pillar emitting visible rings of sound into a dark neon mall',
  N08: 'a large clock melting and slowly sinking into clear pool water',
  N09: 'an endless spiral stairwell seen from above, descending forever into darkness',
  N10: 'an old CRT television in an abandoned kindergarten nap room, its screen showing an endless yellow corridor with fresh wet footprints on the carpet',
  X01: 'a huge ring holding dozens of old keys, hanging in a yellow corridor',
  X02: 'a janitor\'s cleaning cart with a mop bucket in a yellow corridor, the floor freshly wet',
  X03: 'a red-and-white life ring floating on calm pool water',
  X04: 'an empty, tall white lifeguard chair beside a very shallow pool, water caustics dancing on the tiles',
  X05: 'glowing neon music notes drifting through a closed shopping mall, a loudspeaker in the corner',
  X06: 'a figure in red running toward a glowing red exit pictogram in a closing mall',
  T_COIN: 'an old coin with a square hole in the middle, glowing softly in darkness',
  T_SHADOW: 'a small shadow figure standing in a dim yellow corridor',
  T_PLAYMATE: 'a faded, half-transparent little child in a pastel sky, like a memory',
};

const HEROES = [
  { id: 'agent_shen', name: '沈砚 · 封存专员', p: 'a calm man in his thirties, containment agent in a dark navy uniform with an ID badge, a strip of white sealing tape in his hand, cool cyan light' },
  { id: 'agent_tang', name: '唐棠 · 测绘员', p: 'a sharp-eyed woman surveyor in practical field clothes, a stick of white chalk in her hand, chalk marks behind her, warm yellow light' },
  { id: 'agent_man', name: '阿满 · 清醒梦者', p: 'a sleepy young volunteer in a soft pastel jacket holding a small pillow, half-closed eyes, gentle pink dream light' },
  { id: 'boss_manager', name: '守门人 · 走廊尽头的管理员', p: 'a faceless janitor holding a mop, a huge ring of keys at his belt, standing at the end of a yellow corridor, menacing stillness' },
  { id: 'boss_lifeguard', name: '守门人 · 泳池里的救生员', p: 'a faceless lifeguard in a red top sitting high on a white lifeguard chair over an empty pool, a whistle on a cord' },
  { id: 'boss_broadcast', name: '守门人 · 闭店广播', p: 'a cluster of old PA loudspeaker horns glowing red in darkness with a recording light, no body, sound rippling outward' },
];
const HERO_BASE = 'Painterly digital character portrait for a card game, rich hand-painted brushwork, soft dramatic lighting with rim light, chest-up bust, centered, square 1:1, eerie liminal atmosphere. No text, no logos, no frame, no border. The portrait will be cropped into a circle, so keep the head and shoulders in the middle 70%.';

const TYPE = { minion: '随从', spell: '法术', field: '场地' };
const items = [];
for (const d of L.CARD_LIST) {
  const sub = SUBJECT[d.id];
  if (!sub) continue;
  items.push({ id: d.id, group: d.boss ? 'boss' : d.token ? 'token' : d.faction, title: `${d.id} · ${d.name}`, meta: `${TYPE[d.type]} · ${L.FACTIONS[d.faction].name} · ${{ common: '普通', rare: '稀有', epic: '史诗', legendary: '传说' }[d.rarity]}`, prompt: `${BASE} ${FACTION[d.faction]} ${CROP[d.type]} Subject: ${sub}.${d.rarity === 'legendary' ? ' This is a legendary card: make it especially striking, with a strong focal glow.' : ''}` });
}
for (const h of HEROES) items.push({ id: h.id, group: 'hero', title: h.name, meta: '英雄头像', prompt: `${HERO_BASE} Subject: ${h.p}.` });

const GROUPS = [['hero', '英雄与守门人头像'], ['site', '收容站'], ['level', '后室层级'], ['dream', '梦核'], ['neutral', '中立'], ['boss', '守门人专属牌'], ['token', '衍生物']];

// ---- markdown
let md = `# 卡牌立绘提示词\n\n共 ${items.length} 条。每条都可以单独复制给图像模型使用，已包含统一画风、阵营氛围与画幅要求。\n\n**建议**：每条生成 2–3 张。文件按「编号-序号」命名，例如 \`S01-1.png\`、\`S01-2.png\`、\`agent_shen-1.png\`。\n\n`;
for (const [g, label] of GROUPS) {
  md += `## ${label}\n\n`;
  for (const it of items.filter((x) => x.group === g)) md += `### ${it.title}\n${it.meta}\n\n\`\`\`\n${it.prompt}\n\`\`\`\n\n`;
}
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/ART_PROMPTS.md'), md);

// ---- html with copy buttons
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let body = '';
for (const [g, label] of GROUPS) {
  const list = items.filter((x) => x.group === g);
  body += `<section id="g-${g}"><h2>${label} <small>${list.length} 条</small></h2>`;
  for (const it of list) body += `<article><header><div><b>${esc(it.title)}</b><span>${esc(it.meta)}</span></div><button type="button" class="cp" data-id="${it.id}">复制</button></header><p id="p-${it.id}">${esc(it.prompt)}</p></article>`;
  body += `</section>`;
}
const nav = GROUPS.map(([g, l]) => `<a href="#g-${g}">${l}</a>`).join('');
const html = `<title>夹层立绘提示词</title>
<style>
:root { --bg: #f6f1f8; --fg: #2a1f30; --muted: #6e5f78; --card: #ffffff; --line: #e4d8ea; --accent: #9a4fbf; --done: #2f8f5b; --f: "Noto Sans SC", system-ui, -apple-system, "PingFang SC", sans-serif; --m: ui-monospace, "SFMono-Regular", Menlo, monospace; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #17121b; --fg: #f1e8f5; --muted: #b3a3be; --card: #221a28; --line: #3a2e42; --accent: #d79bff; --done: #6fd49a; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #17121b; --fg: #f1e8f5; --muted: #b3a3be; --card: #221a28; --line: #3a2e42; --accent: #d79bff; --done: #6fd49a; color-scheme: dark; }
body { background: var(--bg); color: var(--fg); font: 15px/1.6 var(--f); margin: 0; }
main { max-width: 880px; margin: 0 auto; padding-block: 28px 60px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: .04em; }
.lead { color: var(--muted); margin: 0 0 16px; max-width: 65ch; }
.steps { display: grid; gap: 8px; margin: 0 0 18px; padding: 14px 16px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
.steps div { min-width: 0; }
.steps b { color: var(--accent); }
nav { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 0; background: var(--bg); }
nav a { padding: 8px 12px; min-height: 40px; display: inline-flex; align-items: center; border-radius: 20px; background: var(--card); border: 1px solid var(--line); color: var(--fg); text-decoration: none; font-size: 14px; }
h2 { font-size: 19px; margin: 28px 0 10px; }
h2 small { color: var(--muted); font-weight: 400; font-size: 13px; margin-left: 6px; }
article { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
article header { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
article header div { min-width: 0; display: flex; flex-direction: column; }
article header span { color: var(--muted); font-size: 13px; }
article p { margin: 8px 0 0; font: 13px/1.55 var(--m); color: var(--fg); word-break: break-word; user-select: all; }
.cp { flex: none; min-width: 72px; min-height: 40px; border-radius: 8px; border: 1px solid var(--accent); background: transparent; color: var(--accent); font: 600 14px var(--f); cursor: pointer; }
.cp.ok { border-color: var(--done); color: var(--done); }
.cp:focus-visible, nav a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
<main>
<h1>夹层立绘提示词</h1>
<p class="lead">共 ${items.length} 条：64 张收藏卡、6 张守门人卡、3 个衍生物，以及 6 个英雄头像。每条都已包含统一画风、阵营氛围和画幅要求，可以直接复制给图像模型。</p>
<div class="steps">
<div><b>1 · 生成</b> 每条生成 2–3 张，正方形。风格不对时重生成，不必改提示词。</div>
<div><b>2 · 命名</b> 编号-序号，例如 <code>S01-1.png</code>、<code>D17-2.png</code>、<code>agent_shen-1.png</code>。</div>
<div><b>3 · 交回</b> 上传到仓库分支 claude/zen-bohr-t2in21 的 <code>art/incoming/</code> 文件夹，或直接发在对话里。</div>
</div>
<nav>${nav}</nav>
${body}
</main>
<script>
document.addEventListener('click', async (e) => {
  const b = e.target.closest('.cp'); if (!b) return;
  const p = document.getElementById('p-' + b.dataset.id);
  try { await navigator.clipboard.writeText(p.textContent); b.textContent = '已复制'; b.classList.add('ok'); }
  catch (err) { const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = '已选中'; }
  setTimeout(() => { b.textContent = '复制'; b.classList.remove('ok'); }, 1600);
});
</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/art-prompts.html'), html);
console.log('prompts:', items.length, 'missing:', L.CARD_LIST.filter((d) => !SUBJECT[d.id]).map((d) => d.id).join(',') || 'none');
