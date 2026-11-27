// Talks to the background worker; falls back to the main thread if workers
// are unavailable. In the single-file build the worker source is inlined as
// globalThis.__BABEL_WORKER_SRC__ and started from a blob: URL.

import { handle, packHex, unpackHex } from './worker.js';

let worker = null;
let seq = 0;
const pending = new Map();

function start() {
  try {
    if (globalThis.__BABEL_WORKER_SRC__) {
      const url = URL.createObjectURL(new Blob([globalThis.__BABEL_WORKER_SRC__], { type: 'text/javascript' }));
      worker = new Worker(url);
    } else {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    }
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.res);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = () => {
      worker = null;
      for (const [, p] of pending) p.retry();
      pending.clear();
    };
  } catch {
    worker = null;
  }
}
start();

function call(msg) {
  return new Promise((resolve, reject) => {
    const local = () => {
      setTimeout(() => {
        try {
          resolve(handle(msg));
        } catch (e) {
          reject(e);
        }
      }, 0);
    };
    if (!worker) return local();
    const id = ++seq;
    pending.set(id, { resolve, reject, retry: local });
    worker.postMessage({ ...msg, id });
  });
}

export async function readBookAsync(lib, hex, local) {
  const r = await call({ op: 'read', lib: lib.id, hex: packHex(hex), local });
  return r.book;
}

export async function findTextAsync(lib, digits, mode) {
  const r = await call({ op: 'find', lib: lib.id, digits, mode });
  return { ...r, hex: unpackHex(lib, r.hex) };
}

export async function randomBookAsync(lib) {
  const r = await call({ op: 'random', lib: lib.id });
  return { ...r, hex: unpackHex(lib, r.hex) };
}
