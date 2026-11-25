# 梦隙 · NOCLIP BLOOM（游戏工程）

俯视角割草肉鸽 × 梦核 × 阈限空间。设计见 [`../docs/GAME_PLAN.md`](../docs/GAME_PLAN.md)，进度见 [`../TASK_STATE.md`](../TASK_STATE.md)。

## 运行

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # tsc 类型检查 + 生产构建到 dist/
npm run preview    # 预览生产构建 http://127.0.0.1:4173
```

## 操作

| 输入 | 作用 |
|---|---|
| WASD / 方向键 / 左摇杆 | 移动 |
| 空格 / 手柄 A | 穿模（穿墙冲刺，无敌 0.35 秒，冷却 6 秒） |
| 1 / 2 / 3，或 ← → 加回车 | 选择升级门 |
| Esc / P | 暂停 |
| M | 静音 |
| ` 或 F3 | 性能面板 |
| 触屏 | 拖动移动，双击穿模 |

## 调试参数（URL 查询串）

| 参数 | 作用 |
|---|---|
| `play` | 跳过标题直接开始 |
| `t=600` | 从第 600 秒开局 |
| `lv=10` | 开局先随机获得 10 次升级 |
| `speed=4` | 模拟时间倍速 |
| `god` | 无敌 |
| `auto` | 自动驾驶（走 8 字并自动选第一扇门，用于无头测试） |
| `stats` | 默认显示性能面板 |
| `nopost` | 关闭后期处理 |
| `fixedres` | 关闭自动降分辨率 |

## 结构

```
src/
  config.ts        全部数值（计划书 §13 基线）
  map.ts           区块无限生成：泳池厅 / 柱廊 / 半墙 / 只能穿模进入的夹层密室
  flowfield.ts     每 0.25 秒一次 BFS 流场 + 双线性方向采样
  enemies.ts       SoA 敌群：稠密交换删除、uid 代际、空间哈希分离
  player.ts        移动、水中减速、穿模（结束卡墙时先宽限延伸，再弹回）
  weapons.ts       小夜灯 / 纸飞机 / 八音盒 + 6 被动 + 升级池
  pickups.ts       星屑（磁吸螺旋）、温牛奶、夹层礼物盒
  audio.ts         WebAudio 全合成：生成式卷积混响、池水嗡鸣、八音盒音色
  game.ts          固定 60Hz 步长、状态机、相机、自适应分辨率
  render/
    dreamfog.ts    以玩家为中心的“梦境能见泡”雾（改写 three 全局 fog chunk）
    world.ts       遮罩驱动的瓷砖 / 泳池 / 焦散地面，屏幕空间圆形窥孔墙体
    entities.ts    实例化敌人、弹体、拾取物、花瓣粒子、穿模残影
    models.ts      程序化模型（梦游者、无脸同学、气球人、纸人……）
    post.ts        泛光 → 移轴景深 → Neutral 色调映射 → 梦核调色
  ui/              HUD、拱形门升级界面、档案纸片界面、手写伤害数字
```
