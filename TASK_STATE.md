# TASK_STATE — 《夹层 LIMINAL》

单文件 HTML 卡牌对战（SCP / 后室 / 梦核题材）。源码在 `src/`，`node tools/build.mjs` 产出 `liminal.html`。

## 架构
- `src/js/00-base.js` 常量 / RNG / clone / 关键词表
- `src/js/10-engine.js` 纯数据规则引擎（可克隆、带种子），事件 + 快照流供 UI 播放
- `src/js/20-cards.js` 64 张收藏卡 + 6 张守门人卡 + 衍生物，含故事碎片与卡图参数
- `src/js/25-heroes.js` 3 特工 / 3 守门人（技能、台词、卡组、性格）/ 3 预组
- `src/js/30-ai.js` 克隆模拟 + 性格权重评估 + 斩杀搜索
- UI 层（浏览器）：store / audio / art / fx / ui-card / ui-game / layers / menus / main
- `tools/sim.mjs` 无头 AI 对战；`tools/cardstats.mjs` 单卡胜率；`tools/cardtest.mjs` 逐卡规则测试；`tools/e2e.mjs` Playwright 冒烟

## 进度
- [x] 阶段 1/2 引擎：回合、出牌、攻击、死亡结算、疲劳、换牌、硬币、全部关键词、收容/突破、褪色、回响、双资源、动摇假牌、梦深切层规则、闭店时间
- [x] 卡池 64 + 6 + 3 衍生物；预组 3 套；守门人卡组 3 套
- [x] AI（平衡 / 控场 / 节奏 / 狂暴）
- [x] 平衡初调（预组互打约 50%，守门人对 AI 玩家约 55–63%）
- [ ] 逐卡规则测试 cardtest
- [ ] UI：构建、牌面、棋盘、交互、事件播放
- [ ] 卡图生成器
- [ ] 特效（粒子、震屏、死亡、法术、传说出场、受击暗角）
- [ ] Web Audio（三层环境音 + 全部音效）
- [ ] 切层演出（2.5s，可跳过）+ 每层氛围
- [ ] 菜单：标题、对战设置、卡组构筑、档案、设置、结算
- [ ] 第四面墙彩蛋
- [ ] 手机实测、性能、e2e

## 下一步
写构建脚本与 HTML 模板，然后是 UI 层。
