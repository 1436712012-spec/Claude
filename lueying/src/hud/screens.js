// 菜单与结算：标题、挂载（出发前 2 潜行 + 2 战斗）、暂停、操作说明、设置、结算（评级 + 全队航迹回放）。
import { WEAPONS, DEFAULT_LOADOUT } from '../sim/config.js';
import { RATINGS } from '../sim/mission.js';
import { renderMapCanvas } from './mapcanvas.js';
import { EXTRACT, WRECK } from '../sim/level.js';
import { fmt } from './hud.js';

const COST = {
  stasis: '光束在雨雾里看得见；冷却 20 秒；对车辆无效',
  phantom: '幻影被摄像头拍到，同样算影像证据',
  anchor: '落地时一声闷响，惊起附近的鸟群',
  fog: '每局只能用一次；清不掉手机和服务器里已经存下的影像',
  beam: '热量飙升很快，过热后被迫散热 3 秒',
  swarm: '装填 12 秒',
  hammer: '飞碟自己也会被反冲推开',
  storm: '需要全队就位；每局最多用两次',
};
const EFFECT = {
  stasis: '让一名敌人或一架无人机在原地凝固 8 秒，醒来后不记得这段时间',
  phantom: '在 60 米内投出一架飞碟的全息幻影，敌人会追着它跑，10 秒后消散',
  anchor: '在地面种下一个小型重力井，把巡逻车或无人机吸住 15 秒',
  fog: '释放一团看不见的场雾，范围内的人忘掉最近 30 秒看到的东西',
  beam: '白热的持续光束：装甲熔开、玻璃炸裂，能切穿车辆和掩体（按住）',
  swarm: '按住锁定多个目标，松开齐射 24 枚自导微型飞弹',
  hammer: '把场压成一记冲击：掀翻巡逻车、推飞一排敌人，近距离慢动作',
  storm: '四机合击：方阵同时开火，场共振引发一场人造雷暴',
};

export const store = {
  get(key, def) { try { const v = localStorage.getItem('lueying.' + key); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(key, v) { try { localStorage.setItem('lueying.' + key, JSON.stringify(v)); } catch (e) { /* 无存档也能玩 */ } },
};

export class Screens {
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
    this.settings = Object.assign({ quality: 'auto', sens: 1, vol: 0.8, invert: false }, store.get('settings', {}));
    this.loadout = store.get('loadout', DEFAULT_LOADOUT.slice());
    if (!Array.isArray(this.loadout) || this.loadout.length !== 4) this.loadout = DEFAULT_LOADOUT.slice();
  }

  show(html, cls = '') {
    this.root.className = 'screen ' + cls;
    this.root.innerHTML = html;
    this.root.classList.remove('hidden');
  }
  hide() { this.root.classList.add('hidden'); this.root.innerHTML = ''; }

  loading(text) {
    this.show(`<div class="loading"><div class="title-mark">掠影</div><div class="load-text">${text}</div></div>`, 'dark');
  }

  title() {
    const best = store.get('best', null);
    this.show(`
      <div class="title-wrap">
        <div class="title-mark">掠影</div>
        <div class="title-en">LÜEYING · ACT I · 临界研究所</div>
        <div class="title-line">贴着大地呼吸的幽灵；出手时，是一场来自未来的雷暴。</div>
        ${best ? `<div class="best">最佳评级 · <b>${RATINGS[best]?.name || best}</b></div>` : ''}
        <div class="btns">
          <button data-a="start" class="primary">开始任务</button>
          <button data-a="help">操作说明</button>
          <button data-a="settings">设置</button>
        </div>
        <div class="title-foot">一局 6–10 分钟 · 建议戴耳机</div>
      </div>`, 'title');
    this._wire({ start: () => this.loadoutScreen(), help: () => this.help(() => this.title()), settings: () => this.settingsScreen(() => this.title()) });
  }

  loadoutScreen() {
    const sel = new Set(this.loadout);
    const card = (id) => `<button class="wcard ${sel.has(id) ? 'on' : ''} ${WEAPONS[id].kind}" data-w="${id}"><b>${WEAPONS[id].name}</b><span>${EFFECT[id]}</span><i>代价：${COST[id]}</i></button>`;
    const render = () => {
      this.show(`
        <div class="loadout">
          <div class="brief">
            <div class="court">隐庭</div>
            <p>灰翎，这里是隐庭。一架侦察机坠落在马瑙斯北郊的雨林里，被「临界研究所」回收。他们正在拆解它。</p>
            <p>取回机库里的场核，带回淹水林的回收点。不被看见，不留痕迹。</p>
            <p class="dim">暴雨还有大约八分钟。日落之后，雨会停，他们的无人机会起飞。</p>
          </div>
          <div class="lo-title">挂载 · 潜行武器选 2</div>
          <div class="cards">${['stasis', 'phantom', 'anchor', 'fog'].map(card).join('')}</div>
          <div class="lo-title">挂载 · 战斗武器选 2</div>
          <div class="cards">${['beam', 'swarm', 'hammer', 'storm'].map(card).join('')}</div>
          <div class="lo-foot">场脉冲为标配 · 瘫痪 35 米内的电子设备 20 秒，冷却 90 秒</div>
          <div class="btns"><button data-a="back">返回</button><button data-a="go" class="primary">出发</button></div>
        </div>`, 'menu');
      this.root.querySelectorAll('.wcard').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.w, kind = WEAPONS[id].kind;
        if (sel.has(id)) { sel.delete(id); }
        else {
          const same = [...sel].filter((x) => WEAPONS[x].kind === kind);
          if (same.length >= 2) sel.delete(same[0]);
          sel.add(id);
        }
        render();
      }));
      this._wire({
        back: () => this.title(),
        go: () => {
          const st = [...sel].filter((x) => WEAPONS[x].kind === 'stealth'), cb = [...sel].filter((x) => WEAPONS[x].kind === 'combat');
          if (st.length !== 2 || cb.length !== 2) { this.root.querySelector('.lo-foot').textContent = '需要正好 2 件潜行武器和 2 件战斗武器'; return; }
          this.loadout = [...st, ...cb];
          store.set('loadout', this.loadout);
          this.hide();
          this.h.start(this.loadout);
        },
      });
    };
    render();
  }

  help(back) {
    this.show(`
      <div class="help">
        <h2>操作</h2>
        <div class="cols">
          <div>
            <h3>飞行</h3>
            <p><kbd>W A S D</kbd> 全向平移（不用先转向）　<kbd>鼠标</kbd> 座舱视角</p>
            <p><kbd>Shift</kbd> 加速推进（积累热量）　<kbd>Space</kbd> 跃升 1.5 秒</p>
            <p><kbd>C</kbd> 贴地 / 巡航　<kbd>滚轮</kbd> 或 <kbd>[ ]</kbd> 场功率</p>
            <p><kbd>F</kbd> 场静默（无声滑行，重启有场涌）　<kbd>G</kbd> 场脉冲</p>
            <p><kbd>右键</kbd> 放大镜头侦察　<kbd>E</kbd> 标记准星下的敌人</p>
            <h3>武器</h3>
            <p><kbd>左键</kbd> 开火（湮灭束按住；蜂群针按住锁定、松开齐射）</p>
            <p><kbd>5–8</kbd> 选择武器　<kbd>R</kbd> / <kbd>Z</kbd> 切换</p>
          </div>
          <div>
            <h3>僚机</h3>
            <p><kbd>Tab</kbd> 选择对象（全队 / 回声 / 微光 / 磐石）</p>
            <p><kbd>Q</kbd> 按住打开指令轮盘，或 <kbd>1–4</kbd> 直接下令</p>
            <p>潜行：跟随航迹 · 原地待命 · 惊扰诱敌（在视野中点选地点）· 扫描标记</p>
            <p>开战：集火 · 包抄 · 掩护 · 归队　<kbd>T</kbd> 磐石干扰场</p>
            <h3>其他</h3>
            <p><kbd>M</kbd> 大地图　<kbd>Esc</kbd> 暂停　<kbd>F3</kbd> 调试层　<kbd>F4</kbd> 自由相机</p>
            <h3>手机</h3>
            <p>左侧摇杆平移，右侧拖动转视角；右侧按钮：开火、武器、跃升、高度、加速、静默、脉冲、指令；顶部头像选择僚机；诱敌在小地图上点选。</p>
          </div>
        </div>
        <div class="tips">
          <p>· 低即是隐：贴地、慢速、在树冠下，雷达和卫星都看不见你；但地面越近，越容易擦碰。</p>
          <p>· 雷达看得见视线内的移动目标——它会滤掉径向速度低于 6 m/s 的回波。院子里，慢就是隐身。</p>
          <p>· 被拍到并不等于失败：警报后终端要上传 40 秒，切断它。</p>
        </div>
        <div class="btns"><button data-a="back" class="primary">返回</button></div>
      </div>`, 'menu');
    this._wire({ back });
  }

  settingsScreen(back) {
    const s = this.settings;
    this.show(`
      <div class="settings">
        <h2>设置</h2>
        <label>画质 <select id="sQ"><option value="auto">自动</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
        <label>视角灵敏度 <input id="sS" type="range" min="0.3" max="2.5" step="0.05" value="${s.sens}"></label>
        <label>音量 <input id="sV" type="range" min="0" max="1" step="0.05" value="${s.vol}"></label>
        <label><input id="sI" type="checkbox" ${s.invert ? 'checked' : ''}> 反转 Y 轴</label>
        <div class="btns"><button data-a="back" class="primary">完成</button></div>
      </div>`, 'menu');
    this.root.querySelector('#sQ').value = s.quality;
    this._wire({
      back: () => {
        s.quality = this.root.querySelector('#sQ').value;
        s.sens = parseFloat(this.root.querySelector('#sS').value);
        s.vol = parseFloat(this.root.querySelector('#sV').value);
        s.invert = this.root.querySelector('#sI').checked;
        store.set('settings', s);
        this.h.applySettings && this.h.applySettings(s);
        back();
      },
    });
  }

  pause() {
    this.show(`
      <div class="pause">
        <div class="title-mark small">暂停</div>
        <div class="btns col">
          <button data-a="resume" class="primary">继续</button>
          <button data-a="restart">重新开始</button>
          <button data-a="help">操作说明</button>
          <button data-a="settings">设置</button>
          <button data-a="quit">退出到标题</button>
        </div>
      </div>`, 'menu');
    this._wire({ resume: () => this.h.resume(), restart: () => this.h.restart(), help: () => this.help(() => this.pause()), settings: () => this.settingsScreen(() => this.pause()), quit: () => this.h.quit() });
  }

  // ---------- 结算 ----------
  results(world) {
    const M = world.mission, R = M.result;
    const rating = RATINGS[R.rating];
    const best = store.get('best', null);
    if (!best || (RATINGS[best]?.rank ?? -1) < rating.rank) store.set('best', R.rating);
    const ev = M.events.filter((e) => ['aware', 'alarm', 'satellite', 'clip', 'upload', 'uploadCut', 'pulse', 'coreTaken', 'core', 'wingSpotted', 'cooldown', 'defeated', 'powerOut', 'terminal'].includes(e.type));
    const label = (e) => {
      switch (e.type) {
        case 'aware': return `${e.name} · ${e.causeLabel} → ${e.to === 'search' ? '搜索' : '起疑'}${e.focus && e.focus !== 'player' ? `（${{ echo: '回声', glimmer: '微光', bedrock: '磐石' }[e.focus] || '幻影'}）` : ''}`;
        case 'alarm': return `<b class="alarm">警报</b> · ${e.name} · ${e.cause ? (e.cause.startsWith('trace:') ? '痕迹' : '') : ''}`;
        case 'satellite': return `<b class="amber">被卫星拍到</b> · ${{ river: '河面高速', open: '开阔地高速', jump: '跃升', birds: '惊起鸟群' }[e.why] || e.why}${e.source !== 'player' ? `（${{ echo: '回声', glimmer: '微光', bedrock: '磐石' }[e.source]}）` : ''}`;
        case 'clip': return `<b class="alarm">影像证据</b> · ${e.name}`;
        case 'upload': return '<b class="alarm">终端开始上传</b>';
        case 'uploadCut': return '<b class="field">上传被切断</b>';
        case 'pulse': return `场脉冲${e.terminal ? ' · 瘫痪终端' : ''}`;
        case 'coreTaken': return '<b class="field">场核入舱</b>';
        case 'core': return `${e.name} 发现残骸失踪`;
        case 'wingSpotted': return `${{ echo: '回声', glimmer: '微光', bedrock: '磐石' }[e.id]} 被 ${e.name} 发现 · ${e.causeLabel}`;
        case 'cooldown': return '营地进入冷却';
        case 'defeated': return '<b class="field">守军被击溃</b>';
        case 'powerOut': return '研究所断电';
        case 'terminal': return '卫星终端离线';
        default: return e.type;
      }
    };
    const S = R;
    this.show(`
      <div class="results">
        <div class="res-map"><canvas id="replay"></canvas><div class="legend"><span class="lp">掠影一号</span><span class="le">回声</span><span class="lg">微光</span><span class="lb">磐石</span></div></div>
        <div class="res-info">
          <div class="rating r-${R.rating}">${rating.name}</div>
          <div class="rating-desc">${rating.desc}</div>
          <div class="stats">
            <span>用时 <b>${fmt(R.time)}</b></span><span>起疑 <b>${S.suspicious}</b></span><span>搜索 <b>${S.search}</b></span>
            <span>卫星 <b>${S.satCaptures}</b></span><span>影像 <b>${S.clips}</b></span><span>击倒 <b>${S.kills}</b></span>
            <span>场脉冲 <b>${S.pulses}</b></span><span>擦碰 <b>${S.scrapes}</b></span>${S.blackbox ? '<span><b class="field">黑箱</b></span>' : ''}
          </div>
          <div class="ev-title">被注意到的每一刻</div>
          <div class="events">${ev.length ? ev.map((e) => `<div data-t="${e.t}"><span class="t">${fmt(e.t)}</span>${label(e)}</div>`).join('') : '<div class="dim">没有任何人注意到你。</div>'}</div>
          <div class="btns"><button data-a="again" class="primary">再来一局</button><button data-a="title">回到标题</button></div>
        </div>
      </div>`, 'menu results-screen');
    this._wire({ again: () => this.h.restart(), title: () => this.h.quit() });
    this._replay(world, ev);
  }

  _replay(world, events) {
    const cv = this.root.querySelector('#replay');
    const box = cv.parentElement.getBoundingClientRect();
    // 关注区域：回收点到研究所
    const X0 = -420, X1 = 420, Z0 = -600, Z1 = 820;
    const aspect = (X1 - X0) / (Z1 - Z0);
    let h = Math.min(box.height || 600, window.innerHeight * 0.86), wpx = h * aspect;
    if (wpx > (box.width || 400)) { wpx = box.width || 400; h = wpx / aspect; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = wpx * dpr; cv.height = h * dpr; cv.style.width = wpx + 'px'; cv.style.height = h + 'px';
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const map = renderMapCanvas(world.terrain, 1000);
    const k = 1000 / 2000;
    const sx = (x) => ((x - X0) / (X1 - X0)) * wpx, sz = (z) => ((z - Z0) / (Z1 - Z0)) * h;
    const trails = world.mission.trails;
    const T = world.mission.result.time || 1;
    const colors = { player: '#8FE3E8', echo: '#BFE9EC', glimmer: '#F3D9A0', bedrock: '#C9D3C2' };
    const start = performance.now();
    const dur = 7000;
    const draw = () => {
      if (!cv.isConnected) return;
      const f = Math.min(1, (performance.now() - start) / dur);
      const tNow = f * T;
      g.clearRect(0, 0, wpx, h);
      g.globalAlpha = 0.85;
      g.drawImage(map, (X0 + 1000) * k, (Z0 + 1000) * k, (X1 - X0) * k, (Z1 - Z0) * k, 0, 0, wpx, h);
      g.globalAlpha = 1;
      for (const id of ['bedrock', 'glimmer', 'echo', 'player']) {
        const tr = trails[id];
        g.strokeStyle = colors[id]; g.lineWidth = id === 'player' ? 2 : 1; g.globalAlpha = id === 'player' ? 1 : 0.6;
        g.beginPath();
        let first = true, last = null;
        for (const [x, z, t] of tr) { if (t > tNow) break; if (first) { g.moveTo(sx(x), sz(z)); first = false; } else g.lineTo(sx(x), sz(z)); last = [x, z]; }
        g.stroke();
        if (last) { g.fillStyle = colors[id]; g.beginPath(); g.arc(sx(last[0]), sz(last[1]), id === 'player' ? 4 : 2.5, 0, 6.3); g.fill(); }
      }
      g.globalAlpha = 1;
      g.strokeStyle = '#8FE3E8'; g.beginPath(); g.arc(sx(EXTRACT.x), sz(EXTRACT.z), 8, 0, 6.3); g.stroke();
      for (const e of events) {
        if (e.t > tNow || e.x === undefined) continue;
        const x = sx(e.x), y = sz(e.z);
        const col = e.type === 'alarm' || e.type === 'clip' || e.type === 'upload' ? '#E5483B' : e.type === 'satellite' ? '#E3A04C' : e.type === 'aware' ? (e.to === 'search' ? '#E38A4C' : '#E3C24C') : '#8FE3E8';
        g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.5;
        if (e.type === 'satellite') { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y + 4); g.lineTo(x - 5, y + 4); g.closePath(); g.stroke(); }
        else if (e.type === 'alarm') { g.beginPath(); g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5); g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); g.stroke(); }
        else if (e.type === 'pulse') { g.beginPath(); g.arc(x, y, (35 / (X1 - X0)) * wpx, 0, 6.3); g.stroke(); }
        else { g.beginPath(); g.arc(x, y, 3, 0, 6.3); g.fill(); }
      }
      // 高亮列表
      this.root.querySelectorAll('.events > div[data-t]').forEach((d) => d.classList.toggle('lit', parseFloat(d.dataset.t) <= tNow));
      if (f < 1) requestAnimationFrame(draw);
    };
    draw();
  }

  _wire(map) {
    this.root.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const f = map[b.dataset.a]; if (f) f(); }));
  }
}

export { WRECK };
