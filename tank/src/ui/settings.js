const KEY = 'nightwatch-flak-settings-v1';
export const DEFAULTS = { autoFire: null, fx: 1, shake: 1, bloom: 1, rays: 1, reduceFlash: false, numbers: true, volume: 0.8, music: 0.5, quality: 'auto' };

export function loadSettings() {
  const s = { ...DEFAULTS };
  try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage unavailable */ }
  return s;
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

/** DOM settings panel (shown on pause). */
export function buildPanel(settings, onChange, onResume) {
  const el = document.createElement('div');
  el.id = 'panel';
  el.innerHTML = `<h2>设置 · SETTINGS</h2><div class="rows"></div><p class="hint">Esc 继续 · 设置会自动保存</p>`;
  const rows = el.querySelector('.rows');
  const add = (label, key, type, opts = {}) => {
    const row = document.createElement('label');
    row.innerHTML = `<span>${label}</span>`;
    let inp;
    if (type === 'range') {
      inp = document.createElement('input'); inp.type = 'range'; inp.min = opts.min; inp.max = opts.max; inp.step = opts.step || 0.05; inp.value = settings[key];
      const val = document.createElement('b'); val.textContent = (+settings[key]).toFixed(2);
      inp.oninput = () => { settings[key] = +inp.value; val.textContent = (+inp.value).toFixed(2); onChange(key); };
      row.append(inp, val);
    } else if (type === 'check') {
      inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = settings[key];
      inp.onchange = () => { settings[key] = inp.checked; onChange(key); };
      row.append(inp);
    } else {
      inp = document.createElement('select');
      for (const o of opts.options) { const op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; if (settings[key] === o[0]) op.selected = true; inp.append(op); }
      inp.onchange = () => { settings[key] = inp.value; onChange(key); };
      row.append(inp);
    }
    rows.append(row);
  };
  add('全自动开火 (T)', 'autoFire', 'check');
  add('特效强度', 'fx', 'range', { min: 0.25, max: 1.5 });
  add('屏幕震动', 'shake', 'range', { min: 0, max: 1.5 });
  add('辉光强度', 'bloom', 'range', { min: 0, max: 1.5 });
  add('体积光', 'rays', 'range', { min: 0, max: 1.5 });
  add('减少闪光 / 色差', 'reduceFlash', 'check');
  add('伤害数字', 'numbers', 'check');
  add('音量', 'volume', 'range', { min: 0, max: 1 });
  add('配乐', 'music', 'range', { min: 0, max: 1 });
  add('画质', 'quality', 'select', { options: [['auto', '自动'], ['low', '低'], ['med', '中'], ['high', '高']] });
  const btn = document.createElement('button');
  btn.textContent = '继续游戏';
  btn.onclick = () => onResume && onResume();
  el.append(btn);
  return el;
}
