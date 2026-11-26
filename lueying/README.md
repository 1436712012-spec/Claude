# 掠影 · 第一幕

浏览器里的第一人称潜行飞行游戏。驾驶一架离地不到三米的近地悬浮飞碟，带着三架僚机，在黄昏的暴雨里潜入马瑙斯北郊雨林边缘的「临界研究所」，取回坠毁侦察机的场核，不让世界看见你。

- 单个 HTML 页面，Three.js 0.160.0（jsDelivr 锁定版本），纹理、模型、声音全部由代码生成，不请求其他网络资源。
- 模拟层（`src/sim/`）不依赖 Three.js，固定 60 Hz 步长，可在 Node 中测试。

## 运行

```bash
npm install
npm run dev        # http://localhost:8765/
npm test           # 单元测试
npm run build      # dist/index.html 单文件
node tools/e2e.mjs # 浏览器交互测试（无头 Chromium）
```

## 操作（电脑）

| 键 | 作用 |
| --- | --- |
| WASD / 鼠标 | 全向平移 / 座舱视角 |
| Shift / Space / C | 加速推进 / 跃升 / 贴地↔巡航 |
| 滚轮 或 [ ] | 场功率 |
| F / G | 场静默 / 场脉冲 |
| 左键 / 右键 | 开火 / 放大镜头 |
| 5–8、R、Z | 选择武器 |
| Tab / Q / 1–4 / T | 选择僚机 / 指令轮盘 / 直接下令 / 磐石干扰场 |
| E / M / Esc | 标记敌人 / 大地图 / 暂停 |
| F3 / F4 / F6 | 调试层 / 自由相机 / 快进 60 秒（调试层打开时） |

## 目录

```
src/sim      模拟：地形、飞船、侦测、痕迹、敌人、僚机、武器、战斗、任务、世界
src/render   渲染：纹理、天空地形水、雨林、研究所与城市、角色、特效、后期
src/hud      座舱 HUD、小地图、菜单与结算回放
src/audio    Web Audio 合成
src/input    键鼠、触屏、手柄
tests        node:test 单元测试
tools        构建、本地服务器、冒烟与交互测试
```

进度与已知问题见 `TASK_STATE.md`，设计说明见 `docs/M1_PLAN.md`。
