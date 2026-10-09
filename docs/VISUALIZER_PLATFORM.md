# 视觉模式平台（Visualizer Platform）

> 前景视觉模式的注册表化：覆盖层互斥单一 owner、主循环保温门控注册表查询、
> 背景与前景正交协议、每帧信号对象、转场协调器（交叉淡化 + eco 统一管理）、
> 覆盖期资源门控、模式模块懒加载。新增视觉模式 = 清单一行 + 模块自实现。
> Portions Copyright (c) 2025 chthollyphile and Folia contributors —
> adapted from folia-major (AGPL-3.0) registry 协议思想，原生 JS 移植。

## 文件

| 文件 | 职责 |
| --- | --- |
| `02-visual/90-visualizer-registry.js` | 前景模式注册表：`VISUALIZER_OVERLAY_MODES`（19 模式，entry 含 id/label/stateVar/applyFn/icon/desc/cardClass/lazy/storeKey/src/trimCache/order）+ `VISUALIZER_PLUGIN_MODES`（sonic 外挂）。核心 API：`activeVisualizerOverlay()`（保温门控/激活态唯一事实源）、`exitAllVisualizerOverlays` / `exitOtherVisualizerOverlays`（退出 + 同步退场续命 + 缓存释放调度）、`toggleVisualizerOverlay(id)`（预设卡片通用入口）、`ensureOverlayModeLoaded(entry, cb)`（lazy 模块按需注入）、`registerVisualizerOverlayMode(entry)`（动态注册） |
| `02-visual/91-overlay-transition.js` | 转场协调器：①退场交叉淡化（容器续命 320ms opacity 淡出 + z-index 压 4，与新模式 0.7s 入场重叠）②eco 质量档统一管理（activeOverlay 边沿压/恢复，替代 19 份模式自管样板）③退出补帧（`overlayCoverRenderLast = 0` 让主循环下一帧立即重渲染）。150ms 轮询边沿检测兜底直退路径 |
| `02-visual/92-background-registry.js` | 背景注册表：`VISUALIZER_BACKGROUND_MODES`（ambient/star-river/album-blur）+ `visualizerBackgroundContext()`（正交契约输入） |
| `00-state/12-motion-signals.js` | 每帧信号对象：`motionSignalGet/Set/Subscribe`——currentTime/lyricCurrentTime/audioPower/bands/spectrum，主循环写入，值变化才唤醒订阅者 |

## 声明式清单的解析机制

覆盖层 entry 的 `stateVar`/`applyFn`/`trimCache` 是**字符串名经 window 延迟解析**
（模块顶层 var/function 挂 window，调用时求值），与加载顺序无关。互斥退出走
`window[applyFn](false, {save})`。preset 网格卡片由注册表 `icon`/`desc` 通用生成
（`buildOverlayPresetCard`），不再有 per-mode builder。

## 三层切换体系与转场

- **数值预设（0-8）**：共用一个 WebGL 场景，切换 = `uPreset` uniform 写入 +
  0.24s 粒子爆裂脉冲，零销毁重建。
- **覆盖层模式（19）**：常驻 DOM 容器（`#<id>-overlay`，z-index:5）+ body class
  显隐 + 0.7s 入场淡入。**退出侧由 91 协调器续命交叉淡化**：旧容器内联
  `display:block; z-index:4; opacity 1→0（320ms）` 后逐属性清除回归 CSS；
  新模式 z5 淡入盖在上面，中间不闪出主场景。reduced-motion 直退瞬时切换。
- **正交背景（6）**：与前景自由组合，`#visualizer-bg-layer`（z-index:1 垫底），
  真卸载重建（unmount → innerHTML='' → mount）。

### eco 质量档（统一管理）

覆盖层激活期间主场景被盖住 → 统一压 `fx.performanceQuality='eco'`、退出恢复
原档（91 协调器 `applyOverlayEco`，幂等边沿）。**模式模块自身不再读写 quality**
（19 份 `xxxPrevQuality` 样板已删除）。渲染器现取现算该值，写入即生效。

### 覆盖期资源门控（防「底下还在跑」）

| 资源 | 覆盖层激活时 | 恢复时机 |
| --- | --- | --- |
| 主 WebGL 场景 | 节拍/粒子模拟跳过（uTime 冻结），保温渲染 4s/帧 | 退出后首帧立即全量渲染（协调器置零门控时钟） |
| 正交背景层 | tick/tickSlow 整段跳过（rAF 空转，实测 0 tick） | 下一帧自然续跑（dt clamp 0.1s） |
| 频谱采集 | 继续（胶片电台底部频谱依赖） | — |
| 模式重缓存 | — | 退出 2s 后复查未重激活即释放（`trimCache` 钩子：凝彩烘焙贴图；莫奈海报退出即清） |

## 懒加载协议（试点：凝彩 tempera / 队列拼贴 lattice）

entry 加 `lazy: true, storeKey, src: [...]` 后，该模块从 `index-loader.js` 的
启动清单移除，改为按需注入：

- **切换触发**：`toggleVisualizerOverlay(id)` → `ensureOverlayModeLoaded` →
  fetch src 列表 → 内联 script 注入（同步执行，顶层声明挂 window）→ apply。
  首次点击多一次本地 fetch，由 0.7s 入场动画吸收；inflight 去重防双击竞态。
- **启动恢复**：`restoreLazyOverlayModes`（启动 900ms 后）读 localStorage
  storeKey（`'1'`，与 `readBooleanPreference` 同语义），上次激活则预载——
  模块尾部的 `scheduleUiWarmTask` 恢复段自动还原现场。
- **未加载模式的兼容性**：stateVar 为 undefined → `overlayModeIsActive` false
  → 互斥/保温门控/卡片激活态天然视作未激活；`window[trimCache]` 未定义时
  trim 静默跳过。协议要求：模式模块的符号不得被其它模块静态引用
  （注册表字符串解析除外），模块间依赖写进同一 `src` 数组按序注入。
- 试点验证通过后推广其余 17 个模式；CSS 保持静态 link（解析成本小）。

## 互斥收敛（此前 6 处复制 → 注册表单一 owner）

| 调用点 | 收敛前 | 收敛后 |
| --- | --- | --- |
| 19 覆盖层 apply 开头 | 各复制互斥 if/else | `exitOtherVisualizerOverlays(selfId, {save:true})` 一行 |
| `setPreset`（04-preset-grid） | 每模式一段退出分支 | `exitAllVisualizerOverlays({save:true})` |
| `refreshPresetGrid` 卡片激活态 | 19 段复制 if | `document.querySelectorAll('[data-overlay-id]')` 通用循环 |
| `isMainSceneCoveredByOverlay`（11-main-loop） | 每模式布尔 or | `activeVisualizerOverlay()` |
| preset 网格卡片 onclick | 19 个 `toggleXxxMode` 直连 | `toggleVisualizerOverlay(id)`（旧 toggle 保留为转发 wrapper） |

## 信号协议（MotionValue 的原生等价）

「每帧值绝不进响应式状态」：信号是模块级单例，主循环每帧 `motionSignalSet`，
各模式 rAF 读 `motionSignalGet`；离散订阅（值变化才回调）。

## 背景正交契约

背景只接 `{theme, coverUrl, audioPower, bands, seed, staticMode, paused}`——
**不拿歌词行、不拿前景模式的 tuning**（测试断言禁字段）。
背景选择器 UI（fx-panel「背景」seg）已接入：ambient/cover-fluid/solid-gradient/
geometric 可用，star-river/album-blur 为预留登记（implReady:false 点击提示）。

## 预设网格分组 UI

DIY 控制台预设网格分两分区（`.preset-section-title` 通栏标题）：「场景预设
（3D 粒子场景）」9 张数值卡 +「歌词模式（全屏歌词视觉）」19 张模式卡，
激活卡片经注册表 `overlayModeIsActive` 高亮。

## Do Not Regress

- 新增覆盖层模式必须登记 `VISUALIZER_OVERLAY_MODES`（不登记 = 互斥/保温门控/
  预设网格激活态三处都看不见它），并提供 `icon`/`desc`（通用卡片依赖）。
- entry 的 stateVar 必须是模块顶层 `var`（const/let 不挂 window，注册表解析不到）。
- **模式模块不要自管 eco/quality**——91 协调器统一边沿管理，模块内读写会与
  协调器状态机打架（双记账恢复错乱）。
- 退出调用带 `{save:true}` 语义不可丢（否则重启后互斥状态错乱）。
- 背景上下文禁止混入歌词行/前景 tuning（正交性的测试钉死）。
- lazy 模式的 src 数组内保持依赖顺序；被移出启动清单的模块不能被静态引用。
- 覆盖层容器 id 约定 `<id>-overlay`（协调器退场续命按此查找，测试钉死一致性）。

## 后续

- 懒加载试点（tempera/lattice）真机沉淀后推广至其余 17 个覆盖层模式。
- 交叉淡化重叠期在亮→暗模式切换时可能轻微透出主场景静止帧（暗色系下不可见），
  如需彻底遮蔽可加一层共享过渡底色。
- 歌词桥：automix blend 期间歌词时间轴冻结在出歌；songHandover 换歌门闸。
