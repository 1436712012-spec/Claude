// Loads the DOM-free part of the game (engine, cards, heroes, AI) into a Node VM context.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENGINE_FILES = ['00-base.js', '10-engine.js', '20-cards.js', '25-heroes.js', '30-ai.js'];

export function loadEngine() {
  const ctx = { console, Math, Date, JSON, Object, Array, Set, Map };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ENGINE_FILES) {
    const src = fs.readFileSync(path.join(root, 'src/js', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx.LMN;
}
