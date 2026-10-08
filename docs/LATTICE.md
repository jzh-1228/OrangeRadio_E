# 队列拼贴（Lattice）· 播放队列封面海报墙

> 移植自 Folia（folia-major）的 Lattice 队列展示面，AGPL-3.0，见 NOTICE.md。
> 原版为 React + framer-motion 相机墙；本实现按项目覆盖层范式用纯 DOM 原生等价。

## 是什么

把整个播放队列投影成一面**封面海报墙**：

- 每首歌一张海报（无封面时按歌曲 id 稳定取色相的渐变兜底），左上角**两位编号徽章**（1 起）；
- **播放头是唯一真相源**（Folia latticeModel 原则：墙只展示队列、绝不改动队列）——已播海报压暗降饱和（`is-played`）、其余正常；
- **海报严格平铺**：等距网格，无缩放无叠压（hover 只提亮不加位移）；
- 点击任意海报（或聚焦后回车）从该曲播放且**不重排队列**（`playQueueAt(idx, { skipShuffleOrder: true })`）——当前播放留在它在队列里的原位；
- **当前播放的海报在墙中原位展开成横向大卡**（`grid-column: span 2`，dense 回填保持平铺）：左侧大封面，右侧"正在播放"徽章、歌名歌手、**实时滚动歌词**（全量行、当前行日落橙高亮并自动居中、原词翻译对照）、进度条、上一首/播放暂停/下一首与时间。切歌时展开卡随播放头移动到新的原位，旧海报收回普通形态。

## 入口与互斥

DIY 控制台「预设网格 → 队列拼贴」特殊卡片（`toggleLatticeMode`）。经视觉模式注册表（`02-visual/90-visualizer-registry.js`，id `lattice`、order 102）与胶片电台/涂鸦墙/流光/烟纸等所有覆盖层**互斥**；偏好存 `orangesea-lattice-mode-v1`（启动恢复）。激活期间 3D 主场景临时切 `eco` 质量档（退出恢复），主循环走覆盖层保温门控。

## 文件

| 文件 | 职责 |
| --- | --- |
| `public/js/modules/10-shell/22-lattice.js` | 模块本体（墙构建/三态/卡片/轮询/生命周期） |
| `public/css/lattice.css` | `body.lattice` 命名空间全部样式（含 reduced-motion 降级） |
| `public/index.html` | `#lattice-overlay` 覆盖层 DOM + 样式引用 |
| `tests/lattice.test.js` | 纯函数单测（徽章/分区/兜底渐变/队列指纹/时间/歌词行） |

## 性能纪律

- **零 canvas 零 rAF**：海报墙是纯 DOM（CSS Grid `auto-fill`），全部更新走轮询——队列指纹 600ms、卡片（歌词行/进度/图标）300ms，且**值变化才写 DOM**（行号、进度键、图标状态各自记忆）；
- 海报 `contain: content` + `aspect-ratio`，无布局反噬；入场动画 CSS stagger（`prefers-reduced-motion` 关闭）；
- 队列指纹 = 长度 + 播放头 + (歌名/封面/id) 拼接：内容没变绝不重建墙，播放头单独变化走**增量类名更新**（不重建、不打断滚动位置）。

## 与原版的取舍

原版 Lattice 还有：墙面相机拖拽平移、键盘焦点导航、任意海报手动展开为播放器（本版只有当前播放海报自动展开）、海报入场波/离场波、歌词预热。这些是体验增强而非结构必需，列为后续可选；本版保留的是用户可感知的核心：平铺编号海报墙三态 + 墙不改队列 + 当前播放原位展开大卡（实时滚动歌词含翻译对照）+ 走带。
