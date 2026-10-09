# 队列拼贴（Lattice）· 播放队列封面海报墙

> 移植自 Folia（folia-major）的 Lattice 队列展示面，AGPL-3.0，见 NOTICE.md。
> 原版为 React + framer-motion 相机墙；本实现按项目覆盖层范式用纯 DOM 原生等价。

## 是什么

把整个播放队列投影成一面**无限延展的封面海报墙**（2026-10 重写为原版无限晶格模型，layout.ts/blockTemplates.ts/blockReflows.ts 直译）：

- **12×8 block 的无限晶格**：每 block 12 张海报、大小 2×2 ~ 6×6 混合平铺（四基础模板 × 四反射共 16 方向，按 block 位置周期选取，每方向都精确覆盖 block 无空隙无重叠）——海报墙是大小错落的马赛克，不是等大网格；
- **队列环绕**：队列按 cellSlot % len 环绕填满整面墙（歌少时同一批海报周期性重复出现，每个副本都是可点击的实例）；
- **当前播放海报自动 6×6 展开**：同一 block 的另外 11 张按 solver 预计算的让位表（16 方向 × 12 展开槽）重排让位——block 始终精确覆盖；展开卡内实时滚动歌词（原词翻译对照、当前行高亮自动居中）+ 走带（上一首/播放暂停/下一首/进度/时间）；
- 正在播放的其他副本带 accent 光环与「正在播放 · NN」徽章；全部海报带两位编号徽章与标题/歌手；无封面按歌曲 id 稳定取色相渐变兜底；
- **拖拽/滚轮平移整面墙**：视口外的 block 不建 DOM（单视口实例上限 400，差量同步），切歌时相机弹簧居中到新的展开卡；
- 点击任意海报从该曲播放且**不重排队列**（playQueueAt(idx, { skipShuffleOrder: true })——Folia「墙不改队列」铁律）。

## 入口与互斥

DIY 控制台「预设网格 → 队列拼贴」特殊卡片（`toggleLatticeMode`）。经视觉模式注册表（`02-visual/90-visualizer-registry.js`，id `lattice`、order 102）与胶片电台/涂鸦墙/流光/烟纸等所有覆盖层**互斥**；偏好存 `orangesea-lattice-mode-v1`（启动恢复）。激活期间 3D 主场景临时切 `eco` 质量档（退出恢复），主循环走覆盖层保温门控。

## 文件

| 文件 | 职责 |
| --- | --- |
| `public/js/modules/10-shell/22a-lattice-blocks.js` | 块模板与让位表数据（紧凑编码，运行时解码一次） |
| `public/js/modules/10-shell/22-lattice.js` | 模块本体（晶格几何/实例同步/展开让位/相机/歌词走带/生命周期） |
| `public/css/lattice.css` | `body.lattice` 命名空间全部样式（含 reduced-motion 降级） |
| `public/index.html` | `#lattice-overlay` 覆盖层 DOM + 样式引用 |
| `tests/lattice.test.js` | 纯函数单测（块模板精确覆盖/让位表 6×6/环绕候选/兜底渐变/队列指纹/时间/歌词行） |

## 性能纪律

- 海报墙是纯 DOM 绝对定位（世界坐标 + 容器 transform 相机），拖拽/滚轮平移走 rAF 节流的差量实例同步；轮询——队列指纹 600ms、卡片（歌词行/进度/图标）300ms，**值变化才写 DOM**（槽位矩形键、进度键、图标状态各自记忆）；
- 海报 `contain: content` + `aspect-ratio`，无布局反噬；入场动画 CSS stagger（`prefers-reduced-motion` 关闭）；
- 队列指纹 = 长度 + 播放头 + (歌名/封面/id) 拼接：内容没变绝不重建墙，播放头单独变化走**增量类名更新**（不重建、不打断滚动位置）。

## 与原版的取舍

原版 Lattice 还有：键盘方向导航（wallNavigation）、任意海报手动展开为播放器（本版展开跟随当前播放）、海报入场波/离场波、Pixi 歌词渲染（本版为 DOM 滚动歌词）、缩放断点相机。这些列为后续可选；本版保留用户可感知的核心：混合大小马赛克平铺无限墙 + 队列环绕 + 当前播放 6×6 让位展开（实时歌词走带）+ 拖拽平移 + 墙不改队列。