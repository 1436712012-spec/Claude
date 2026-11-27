// Tree-walking interpreter that records a complete execution trace.
//
// The trace is the contract between the language and the stage: every node
// evaluation becomes an enter/exit pair, every spell invocation becomes a
// call/return pair and spawns a new *frame* (a magic circle on stage).
// Within one frame each AST node is evaluated at most once (there are no
// loops; repetition is recursion), which keeps per-frame state tiny.

import { SpellError } from './lexer.js';
import { BUILTINS, formatValue } from './parser.js';

export const DEFAULT_LIMITS = {
  maxEvents: 60000,   // trace size cap (what the stage can animate)
  maxFrames: 1500,    // circles on stage
  maxDepth: 360,      // recursion depth before the tower collapses
  maxSteps: 4_000_000 // hard cap for the untraced fallback run
};

class TraceLimit extends Error {}
class StepLimit extends Error {}

/**
 * @typedef {{type:'enter'|'exit'|'call'|'return'|'error', frame:number, node:number, value?:any, child?:number, args?:any[], message?:string}} TraceEvent
 * @typedef {{id:number, sigil:number, spell:string, parent:number, depth:number, callNode:number, args:any[], children:number[], value:any, status:'open'|'returned'|'broken', order:number}} Frame
 */

/**
 * Perform the program's cast. Returns the full ritual (trace + frames).
 */
export function perform(program, limits = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const frames = [];
  const events = [];
  let steps = 0;
  let maxDepthSeen = 0;

  const emit = (e) => {
    if (events.length >= L.maxEvents) throw new TraceLimit();
    events.push(e);
  };

  const castSigil = program.sigils.length - 1;
  const root = newFrame(castSigil, 'cast', -1, -1, []);

  function newFrame(sigil, spell, parent, callNode, args) {
    if (frames.length >= L.maxFrames) throw new TraceLimit();
    const depth = parent < 0 ? 0 : frames[parent].depth + 1;
    const f = { id: frames.length, sigil, spell, parent, depth, callNode, args, children: [], value: undefined, status: 'open', order: frames.length };
    frames.push(f);
    if (parent >= 0) frames[parent].children.push(f.id);
    if (depth > maxDepthSeen) maxDepthSeen = depth;
    return f;
  }

  function fail(msg, node, frame) {
    const err = new SpellError(msg, node.start, node.end, 'runtime');
    err.frame = frame; err.node = node.idx;
    throw err;
  }

  const num = (v, node, frame, what) => {
    if (typeof v !== 'number') fail(`${what} 需要数字，却得到了 ${formatValue(v)}`, node, frame);
    return v;
  };
  const bool = (v, node, frame, what) => {
    if (typeof v !== 'boolean') fail(`${what} 需要真假值（true/false），却得到了 ${formatValue(v)}`, node, frame);
    return v;
  };

  function ev(node, env, f) {
    if (++steps > L.maxSteps) throw new StepLimit();
    emit({ type: 'enter', frame: f, node: node.idx });
    let v;
    switch (node.type) {
      case 'Num': case 'Bool': v = node.value; break;
      case 'Var': v = node.bind.kind === 'param' ? env.args[node.bind.index] : env.lets[node.bind.id]; break;
      case 'Unary': {
        const a = ev(node.arg, env, f);
        v = node.op === '-' ? -num(a, node, f, '取负') : !bool(a, node, f, 'not');
        break;
      }
      case 'Binary': {
        const op = node.op;
        if (op === 'and' || op === 'or') {
          const l = bool(ev(node.left, env, f), node, f, op);
          if (op === 'and' ? !l : l) { v = l; break; } // short circuit: right side stays dark
          v = bool(ev(node.right, env, f), node, f, op);
          break;
        }
        const l = ev(node.left, env, f);
        const r = ev(node.right, env, f);
        v = binop(op, l, r, node, f);
        break;
      }
      case 'If': {
        const c = bool(ev(node.cond, env, f), node.cond, f, 'if 的条件');
        v = ev(c ? node.then : node.else, env, f);
        break;
      }
      case 'Let': {
        const val = ev(node.value, env, f);
        v = ev(node.body, { args: env.args, lets: { ...env.lets, [node.id]: val } }, f);
        break;
      }
      case 'Call': {
        const args = node.args.map((a) => ev(a, env, f));
        if (node.target === 'builtin') {
          args.forEach((a) => num(a, node, f, node.name));
          try { v = BUILTINS[node.name].fn(...args); } catch (e) { fail(e.message, node, f); }
        } else {
          v = invoke(program.spellMap.get(node.name), args, f, node);
        }
        break;
      }
      default: fail(`未知节点 ${node.type}`, node, f);
    }
    emit({ type: 'exit', frame: f, node: node.idx, value: v });
    return v;
  }

  function binop(op, l, r, node, f) {
    if (op === '==') return l === r;
    if (op === '!=') return l !== r;
    num(l, node, f, op); num(r, node, f, op);
    switch (op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/': if (r === 0) fail('除以零：法阵在这里崩裂', node, f); return l / r;
      case '%': if (r === 0) fail('对零取余：法阵在这里崩裂', node, f); return ((l % r) + r) % r;
      case '^': return Math.pow(l, r);
      case '<': return l < r;
      case '<=': return l <= r;
      case '>': return l > r;
      case '>=': return l >= r;
      default: return fail(`未知运算 ${op}`, node, f);
    }
  }

  function invoke(spell, args, parentId, callNode) {
    const parent = frames[parentId];
    if (parent.depth + 1 > L.maxDepth) {
      fail(`递归超过 ${L.maxDepth} 层：法阵之塔坍塌了（是否缺少终止条件？）`, callNode, parentId);
    }
    const fr = newFrame(spell.index, spell.name, parentId, callNode.idx, args);
    emit({ type: 'call', frame: parentId, node: callNode.idx, child: fr.id, args });
    const v = ev(spell.body, { args, lets: {} }, fr.id);
    fr.value = v;
    fr.status = 'returned';
    emit({ type: 'return', frame: fr.id, node: -1, value: v });
    return v;
  }

  let result, error = null, truncated = false;
  try {
    result = ev(program.cast.body, { args: [], lets: {} }, root.id);
    root.value = result;
    root.status = 'returned';
  } catch (e) {
    if (e instanceof TraceLimit) {
      truncated = true;
    } else if (e instanceof StepLimit) {
      truncated = true;
    } else if (e instanceof SpellError) {
      error = e;
      events.push({ type: 'error', frame: e.frame ?? 0, node: e.node ?? 0, message: e.message });
      for (const f of frames) if (f.status === 'open') f.status = 'broken';
    } else if (e instanceof RangeError) {
      error = new SpellError('调用栈溢出：法阵之塔坍塌了', 0, 1, 'runtime');
      events.push({ type: 'error', frame: frames.length - 1, node: 0, message: error.message });
      for (const f of frames) if (f.status === 'open') f.status = 'broken';
    } else {
      throw e;
    }
  }

  // When the trace was cut short, still find out the true answer with a fast,
  // untraced run, so the ritual can tell you what the full spell would yield.
  let fullResult = result;
  let fullStats = null;
  if (truncated) {
    const fast = performFast(program, L);
    fullResult = fast.result;
    fullStats = fast;
    if (fast.error) error = null; // the visible part did not fail; report in stats
  }

  computeWeights(frames);
  return {
    frames, events, result: fullResult, error, truncated,
    stats: {
      calls: frames.length - 1,
      maxDepth: maxDepthSeen,
      steps,
      full: fullStats,
    },
  };
}

/** Untraced evaluation with the same semantics, used for oversized rituals. */
export function performFast(program, limits = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  let steps = 0, calls = 0, maxDepth = 0;
  const ev = (node, env, depth) => {
    if (++steps > L.maxSteps) throw new StepLimit();
    switch (node.type) {
      case 'Num': case 'Bool': return node.value;
      case 'Var': return node.bind.kind === 'param' ? env.args[node.bind.index] : env.lets[node.bind.id];
      case 'Unary': { const a = ev(node.arg, env, depth); return node.op === '-' ? -a : !a; }
      case 'Binary': {
        const op = node.op;
        if (op === 'and') return ev(node.left, env, depth) ? ev(node.right, env, depth) : false;
        if (op === 'or') return ev(node.left, env, depth) ? true : ev(node.right, env, depth);
        const l = ev(node.left, env, depth), r = ev(node.right, env, depth);
        switch (op) {
          case '==': return l === r; case '!=': return l !== r;
          case '+': return l + r; case '-': return l - r; case '*': return l * r;
          case '/': if (r === 0) throw new SpellError('除以零', node.start, node.end, 'runtime'); return l / r;
          case '%': if (r === 0) throw new SpellError('对零取余', node.start, node.end, 'runtime'); return ((l % r) + r) % r;
          case '^': return Math.pow(l, r);
          case '<': return l < r; case '<=': return l <= r; case '>': return l > r; case '>=': return l >= r;
        }
        return undefined;
      }
      case 'If': return ev(ev(node.cond, env, depth) ? node.then : node.else, env, depth);
      case 'Let': return ev(node.body, { args: env.args, lets: { ...env.lets, [node.id]: ev(node.value, env, depth) } }, depth);
      case 'Call': {
        const args = node.args.map((a) => ev(a, env, depth));
        if (node.target === 'builtin') return BUILTINS[node.name].fn(...args);
        if (depth + 1 > L.maxDepth * 4) throw new SpellError('递归过深', node.start, node.end, 'runtime');
        calls++; if (depth + 1 > maxDepth) maxDepth = depth + 1;
        return ev(program.spellMap.get(node.name).body, { args, lets: {} }, depth + 1);
      }
    }
    return undefined;
  };
  try {
    const result = ev(program.cast.body, { args: [], lets: {} }, 0);
    return { result, calls, maxDepth, steps, error: null };
  } catch (e) {
    if (e instanceof StepLimit) return { result: undefined, calls, maxDepth, steps, error: '运算超过四百万步，已中止' };
    if (e instanceof SpellError || e instanceof RangeError) return { result: undefined, calls, maxDepth, steps, error: e.message };
    throw e;
  }
}

/** weight = size of the call subtree; drives circle sizes in the mandala. */
function computeWeights(frames) {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    f.weight = 1 + f.children.reduce((s, c) => s + frames[c].weight, 0);
  }
}
