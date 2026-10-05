# 流光（Aurora Flow · 封面极光氛围）

> 日常沉浸视觉模式：专辑封面取色的流体色雾背景 + 大字逐字卡拉OK歌词 + 底部呼吸波形线。
> 定位是"每天都会开着"的默认沉浸模式——好看但不吵，长时间注视不疲劳。

## 设计概念

现有视觉光谱里缺"日常温柔档"：9 个 WebGL 预设都有明确主体物（粒子/骷髅/舞台），胶片电台与涂鸦墙是强风格皮肤。流光对标 Apple Music 沉浸歌词的"最大公约数审美"——挂机、睡前、工作背景音时，用户要的不是视觉表演，而是一个跟歌同色的氛围底。

**克制三原则**（吸取风格电台下线的教训）：

1. 全场景只有「色雾 + 歌词 + 呼吸线」三样东西，无主体物件；
2. 零频闪、无高频运动——节拍只做 ≤4% 的一次性亮度心跳；
3. 色彩一律取自专辑封面，与歌协调。

## 画面分层

| 层 | 元素 | 实现 |
|---|---|---|
| L0 | 色雾 | `#aurora-bg-canvas` 低分辨率（1/3）Canvas 2D + CSS `blur(46px) saturate(1.28)`，GPU 承担模糊 |
| L0.5 | 暗角遮罩 | 纯 CSS 径向+线性渐变（压边聚焦、底部向控制栏过渡） |
| L1 | 角标 | 小封面 + 歌名/歌手（`top:92px` 避开顶栏悬浮区，opacity 0.62） |
| L2 | 歌词 | 三行布局：上一行淡出远去 / 当前行大字逐字点亮 / 下一行小字预览 |
| L3 | 呼吸波形线 | `#aurora-wave-canvas` 消费 `timeDomainData`，两遍描线模拟柔光（避免慢速 shadowBlur） |

## 封面取色

- 来源：`#control-cover` 的 `background-image` 解析 URL（与胶片/涂鸦同步机制一致，MutationObserver 监听）。
- 流程：32×32 降采样 → HSL 色相 24 桶分桶（近灰/近黑/近白不入桶）→ 按 `出现率×饱和度` 加权取 top3 主色 → 亮主色与白 55% 混合生成点亮字色 `--af-sung`。
- 加载：优先 `crossOrigin='anonymous'`（像素可读），失败降级无 crossOrigin + taint 探测，全失败回退默认夜色板（`auroraDefaultPalette`），**任何失败静默不影响播放**。
- 变更时机：仅封面 URL 变化时执行一次（`auroraCoverUrl` 去重 + 序号令牌丢弃过期响应）。
- **鲜艳度补偿**（`auroraVividPalette`，暗色/灰调封面的兜底）：
  - 封面平均亮度 < 0.30 时逐级提亮主色（下限亮度 0.16），否则色雾沉入黑底；
  - 主色平均饱和 < 0.34 时以第一主色为基做 ±色相偏移生成辅色（恢复层次）；
  - 输出 `gain`（上限 1.8）供渲染端上调色团 alpha——暗封面自动"开大灯"，亮封面恒为 1 不补偿。

## 音频联动

覆盖层激活期间主循环只保活 `frequencyData`/`timeDomainData`（不更新 `bass` 等全局），故本模块**自算特征**（`tickAuroraAudio`）：

| 特征 | 来源 | 驱动 |
|---|---|---|
| `auroraBass` | bin 1–8 平滑 | 色团半径呼吸（±5%） |
| `auroraEnergy` | bin 2–160 ×0.7 + 161–300 ×0.3 | 色团漂移观感、波形线亮度 |
| `auroraBeat` | 低频突增（>0.10 且 >0.24）→ 1，`pow(0.045, dt)` 快衰减 | 全屏 ≤4% 亮度心跳 |
| `auroraChorus` | 能量慢积分（升 0.9 / 降 0.35 系数），阈值 0.34–0.64 | 副歌：色雾浓度上浮 + 一条正弦扭动的极光丝带 |

色团：3 个离屏径向渐变精灵（256px，避免每帧 `createRadialGradient`），互质角速度正弦轨道（周期 62–106s 级），`lighter` 混合。

## 歌词（逐字点亮式卡拉OK）

- 行定位复用 `findStageLyricIndexAtTime` + `getAdjustedLyricPlaybackTime`；`audio` 为 null（未播放过）时按 0 处理渲染首行。
- 分词复用涂鸦墙的 `tokenizeGraffitiText`（拉丁词不可拆行 + CJK 逐字 + grapheme 防劈 emoji），揭示时间表复用 `computeGraffitiReveals`（YRC 真实时序 / LRC 均分+抖动）。
- 点亮交互：`.aurora-char` 未唱态 `--af-idle`（26% 透明白），唱到加 `.is-sung` → `--af-sung` 填色 + 双层柔光（`color-mix`）。seek 倒退超 0.5s 回退点亮。
- 无歌词：主行显示 `♪`；无播放时静止在行首是卡拉OK语义的正确行为。

## 生命周期（film-radio 范式）

- `body.aurora` + localStorage `orangesea-aurora-flow-v1`；四方互斥（胶片/涂鸦/雨窗，进入时互退，`setPreset` 选数值预设也互退）。
- 进入临时切 `fx.performanceQuality='eco'`（备份恢复，不写存档）；主循环 `isMainSceneCoveredByOverlay()` 命中后 3D 降频约 0.5fps 保温 + analyser 保活。
- rAF 节流 ~30fps；歌词数据轮询 token（`lyricsLines` 无事件）；resize 防抖重建画布。

## 文件清单

| 文件 | 职责 |
|---|---|
| `public/js/modules/10-shell/09-aurora-flow.js` | 模块全部逻辑（切换/取色/特征/歌词/循环） |
| `public/css/aurora-flow.css` | `body.aurora` 命名空间，token：`--af-c1/c2/c3` 主色、`--af-sung` 点亮字色、`--af-idle` 未唱字色 |
| `public/index.html` | `#aurora-overlay` 覆盖层 DOM + CSS link |
| `public/js/index-loader.js` | `10-shell/09-aurora-flow.js` 注册 |
| `public/js/modules/07-fx/04-preset-grid-uniforms.js` | 预设网格「流光」卡片 + 激活态 + `setPreset` 退出钩子 |
| `public/js/modules/11-main-loop.js` | `isMainSceneCoveredByOverlay()` 加入 `auroraMode` |
| `tests/aurora-flow.test.js` | vm 沙箱纯函数测试（颜色工具/取色分桶/音频特征） |

## Do Not Regress

- 覆盖层背景必须**不透明**（Electron 下 `backdrop-filter` 不可靠，半透明会透出 3D 场景）。
- 节拍心跳亮度增量不得超过 5%（零频闪承诺）。
- 取色失败必须静默回退默认色板，不允许阻断播放。
- 独立实现取色/特征提取，不依赖主循环的 `bass/mid/treble`（覆盖层期间它们不更新）。
