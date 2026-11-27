# TASK_STATE — 星图兽 (Astral Bestiary)

目标：单页浏览器游戏《星图兽》——在夜空中连星成兽，几何形状决定生物基因，并进行自动星战。

## 架构
- `star-beasts/index.html` — 样式、界面结构、加载脚本
- `star-beasts/js/engine.js` — 工具、噪声、精灵缓存、音频合成、星空生成与背景渲染、特效系统
- `star-beasts/js/beast.js` — 几何分析(基因)、命名、星图码编解码、Body 弹簧骨骼渲染
- `star-beasts/js/game.js` — 状态、观星/点睛/图鉴/星战/结算、输入、主循环

## 进度
- [x] 设计定稿（见上一轮对话）
- [ ] engine.js
- [ ] beast.js
- [ ] game.js
- [ ] index.html
- [ ] Playwright 验证（无报错、连星、点睛、图鉴、星战、手机尺寸）
- [ ] 发布 Artifact、提交推送

## 下一步
按上面顺序写文件，然后用 Playwright 驱动完整流程并截图检查。
