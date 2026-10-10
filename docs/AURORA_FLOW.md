# 流光（Aurora Flow · 夜航极光）

> 日常沉浸视觉模式：封面取色**谐和化**的深空夜幕 + 三道极光绸带 + 星尘视差 + 大字逐字卡拉OK（一道柔光扫带跟随演唱头滑过）+ 地平线呼吸波形。
> 定位是"每天都会开着"的默认沉浸模式——好看但不吵，长时间注视不疲劳。

## 设计概念

现有视觉光谱里缺"日常温柔档"：9 个 WebGL 预设都有明确主体物（粒子/骷髅/舞台），胶片电台与涂鸦墙是强风格皮肤。流光对标 Apple Music 沉浸歌词的"最大公约数审美"——挂机、睡前、工作背景音时，用户要的不是视觉表演，而是一个跟歌同色的氛围底。

**夜幕为纸、极光为幕、歌词为唯一发光体。**「流光」本体落在歌词上：一道柔光扫带（sheen）跟随演唱头匀速滑过当前行。

**克制三原则**（吸取风格电台下线的教训）：

1. 无主体物件——绸带/星尘/地平线都是氛围，不是"东西"；
2. 零频闪、无高频运动——节拍只做 ≤4% 的一次性主色相微光脉冲；
3. 色彩一律取自专辑封面，与歌协调。

**色彩纪律（2026-10 重写的核心教训）**：绸带色一律吸附到封面主色相 **±0.09 邻近色域**（`auroraHarmonizePalette`）。互补色在 `lighter` 叠加下出泥浆（旧版色团浑浊的根源），邻近色域才有极光的通透。已唱字色向冷白回拉 55%——暖黄白在暗景上显脏。

## 画面分层

| 层 | 元素 | 实现 |
|---|---|---|
| L0 | 夜空渐变 + 极光绸带 | `#aurora-bg-canvas` 低分辨率（1/3）Canvas 2D + CSS `blur(34px) saturate(1.15)`，GPU 承担模糊 |
| L1 | 星尘 | `#aurora-stars-canvas` 全分辨率（不参与模糊）：~36–110 颗，两层深度视差漂移 + 正弦闪烁，22% 染主题色 |
| L2 | 暗角遮罩 | 纯 CSS 径向+线性渐变（压边聚焦、底部向控制栏过渡） |
| L3 | 角标 | 霜化药丸：圆封面 + 歌名/歌手（`@supports` 内 `backdrop-filter` 渐进增强，Electron 降级为半透明底） |
| L4 | 歌词舞台 | 三行布局 + 舞台上下 mask 溶解入夜幕 + 暗色椭圆底光座把字从绸带亮区里「放」下来 |
| L5 | 地平线波形 | `#aurora-wave-canvas`：细光地平线 + 呼吸波形（两端横向渐隐）+ 水面倒影 |
| L6 | 胶片颗粒 | 静态 SVG `feTurbulence` data-URI，opacity 0.045 + `mix-blend: overlay`——防渐变代带、统一质感 |

## 极光绸带渲染

垂帘模型（真实极光的结构）：横贯天际的帘幕，**底边是蜿蜒亮线**（签名式下沿亮边），向上经垂直渐隐消散；帘高用高频正弦调制出光柱条纹，blur 后成柔和帘幕竖纹。三层视差：远（高/慢/暗）→ 中 → 近（低/快/亮，节拍只推近景带）。两侧溢出 12% 防 blur 边缘断带。

音频驱动：bass 呼吸帘高（±10%）、副歌闸门抬绸带浓度与亮边浮出、节拍微脉冲近景带 alpha。

## 封面取色

- 来源：`#control-cover` 的 `background-image` 解析 URL（与胶片/涂鸦同步机制一致，MutationObserver 监听）。
- 流程：32×32 降采样 → HSL 色相 24 桶分桶（近灰/近黑/近白不入桶）→ 按 `出现率×饱和度` 加权取 top3 主色 → **谐和化**（`auroraHarmonizePalette`：主色相 = 饱和×中间亮度加权最高者，其余吸附 ±0.09；绸带亮度阶梯 0.44/0.52/0.58 远暗近亮）→ 点亮字色 `--af-sung` 向冷白 `[232,243,255]` 回拉 55%。
- 加载：优先 `crossOrigin='anonymous'`（像素可读），失败降级无 crossOrigin + taint 探测，全失败回退默认夜色板（`auroraDefaultPalette`），**任何失败静默不影响播放**。
- 变更时机：仅封面 URL 变化时执行一次（`auroraCoverUrl` 去重 + 序号令牌丢弃过期响应）。
- **鲜艳度补偿**（`auroraVividPalette`，暗色/灰调封面的兜底）：
  - 封面平均亮度 < 0.30 时逐级提亮主色（下限亮度 0.16），否则绸带沉入黑底；
  - 主色平均饱和 < 0.34 时以第一主色为基做 ±色相偏移生成辅色（恢复层次）；
  - 输出 `gain`（上限 1.8）供渲染端上调绸带 alpha——暗封面自动"开大灯"，亮封面恒为 1 不补偿。

## 音频联动

覆盖层激活期间主循环只保活 `frequencyData`/`timeDomainData`（不更新 `bass` 等全局），故本模块**自算特征**（`tickAuroraAudio`）：

| 特征 | 来源 | 驱动 |
|---|---|---|
| `auroraBass` | bin 1–8 平滑 | 绸带帘高呼吸、波形振幅 |
| `auroraEnergy` | bin 2–160 ×0.7 + 161–300 ×0.3 | 波形亮度、副歌闸门输入 |
| `auroraBeat` | 低频突增（>0.10 且 >0.24）→ 1，`pow(0.045, dt)` 快衰减 | 近景带微推 + 全屏 ≤4% 主色相微光 |
| `auroraChorus` | 能量慢积分（升 0.9 / 降 0.35 系数），阈值 0.34–0.64 | 副歌：绸带浓度上浮 + 中景亮边浮出 |

## 歌词（逐字点亮 + 流光扫带）

- 行定位复用 `findStageLyricIndexAtTime` + `getAdjustedLyricPlaybackTime`；`audio` 为 null（未播放过）时按 0 处理渲染首行。
- 分词复用涂鸦墙的 `tokenizeGraffitiText`（拉丁词不可拆行 + CJK 逐字 + grapheme 防劈 emoji），揭示时间表复用 `computeGraffitiReveals`（YRC 真实时序 / LRC 均分+抖动）。
- **三级字态**：未唱 `--af-idle`（34% 冷白）→ 正唱 `.is-live`（纯白 + 微浮 -0.045em + 三层辉光）→ 已唱 `.is-sung`（`--af-sung` 冷白微染色 + 双层柔光）。seek 倒退超 0.5s 回退点亮。
- **流光扫带**（签名元素）：`.aurora-sheen` 柔光带（`mix-blend: screen` 只加光不改字色），跟随演唱头（`elapsed >= reveal - 0.06` 先行半步）匀速滑行；切行/seek 吸附不拖尾；布局盒每行测量一次（`auroraMeasureAuroraChars`），字体/窗口变化置脏重测。
- 无歌词：主行 `♪` 隐藏、侧行清空，留纯夜幕（屏保态）。
- 字号跟随「歌词大小」设置（`--mfs` 乘算主行/侧行）。

## 生命周期（film-radio 范式）

- `body.aurora` + localStorage `orangesea-aurora-flow-v1`；覆盖层互斥（进入时经注册表互退，`setPreset` 选数值预设也互退）。
- 覆盖层 eco 降档由 `91-overlay-transition.js` 统一协调；主循环 `isMainSceneCoveredByOverlay()` 命中后 3D 降频保温 + analyser 保活。
- rAF 节流 ~30fps（扫带滑行每帧推进）；歌词数据轮询 token（`lyricsLines` 无事件）；resize 防抖重建画布 + 星尘场 + 字盒重测。
- `prefers-reduced-motion`：绸带冻结（t 固定）、星尘停闪、扫带瞬移、入场动画关闭。

## 文件清单

| 文件 | 职责 |
|---|---|
| `public/js/modules/10-shell/09-aurora-flow.js` | 模块全部逻辑（切换/取色/谐和化/特征/绸带/星尘/波形/歌词/扫带/循环） |
| `public/css/aurora-flow.css` | `body.aurora` 命名空间，token：`--af-c1/c2/c3` 绸带色、`--af-deep` 夜空基底、`--af-accent` 高光、`--af-sung` 点亮字色、`--af-idle` 未唱字色 |
| `public/index.html` | `#aurora-overlay` 覆盖层 DOM（bg/stars/vignette/grain/badge/stage/wave）+ CSS link |
| `public/js/index-loader.js` | `10-shell/09-aurora-flow.js` 注册 |
| `public/js/modules/07-fx/04-preset-grid-uniforms.js` | 预设网格「流光」卡片 + 激活态 + `setPreset` 退出钩子 |
| `public/js/modules/11-main-loop.js` | `isMainSceneCoveredByOverlay()` 加入 `auroraMode` |
| `tests/aurora-flow.test.js` | vm 沙箱纯函数测试（颜色工具/取色分桶/鲜艳度补偿/音频特征） |

## Do Not Regress

- 覆盖层背景必须**不透明**（Electron 下 `backdrop-filter` 不可靠，半透明会透出 3D 场景）。
- 节拍心跳亮度增量不得超过 5%（零频闪承诺）。
- **绸带色必须过 `auroraHarmonizePalette` 谐和化**（±0.09 邻近色域）——直接拿封面互补色上 `lighter` 会出泥浆。
- 取色失败必须静默回退默认色板，不允许阻断播放。
- 独立实现取色/特征提取，不依赖主循环的 `bass/mid/treble`（覆盖层期间它们不更新）。
- 间奏/无词态必须清空三行歌词（含侧行），只留纯夜幕。
