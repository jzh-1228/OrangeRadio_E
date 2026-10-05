# 视觉模式平台（Visualizer Platform）

> 前景视觉模式的注册表化：覆盖层互斥单一 owner、主循环保温门控注册表查询、
> 背景与前景正交协议、每帧信号对象。新增视觉模式 = 清单一行 + 模块自实现。
> Portions Copyright (c) 2025 chthollyphile and Folia contributors —
> adapted from folia-major (AGPL-3.0) registry 协议思想，原生 JS 移植。

## 文件

| 文件 | 职责 |
| --- | --- |
| `02-visual/90-visualizer-registry.js` | 前景模式注册表：`VISUALIZER_OVERLAY_MODES`（胶片电台/涂鸦墙/流光/雨夜车窗）+ `VISUALIZER_PLUGIN_MODES`（sonic 外挂）。核心 API：`activeVisualizerOverlay()`（保温门控/激活态唯一事实源）、`exitAllVisualizerOverlays(opts)`（用户点常规预设时）、`exitOtherVisualizerOverlays(selfId, opts)`（某模式进入时）、`registerVisualizerOverlayMode(entry)`（动态注册） |
| `02-visual/92-background-registry.js` | 背景注册表：`VISUALIZER_BACKGROUND_MODES`（ambient/star-river/album-blur）+ `visualizerBackgroundContext()`（正交契约输入） |
| `00-state/12-motion-signals.js` | 每帧信号对象：`motionSignalGet/Set/Subscribe`——currentTime/lyricCurrentTime/audioPower/bands/spectrum，主循环写入，值变化才唤醒订阅者 |

## 声明式清单的解析机制

覆盖层 entry 的 `stateVar`/`applyFn` 是**字符串名经 window 延迟解析**（模块顶层
var 挂 window，调用时求值），与加载顺序无关。互斥退出走 `window[applyFn](false, {save})`。

## 互斥收敛（此前 6 处复制 → 注册表单一 owner）

| 调用点 | 收敛前 | 收敛后 |
| --- | --- | --- |
| 四覆盖层 apply 开头 | 各复制三段 if/else 调其它模式 | `exitOtherVisualizerOverlays(selfId, {save:true})` 一行 |
| `setPreset`（04-preset-grid） | 四段退出分支 | `exitAllVisualizerOverlays({save:true})` |
| `refreshPresetGrid` 特殊卡片/常规卡压制 | 四组布尔 or | `overlayModeIsActive(entry)` / `activeVisualizerOverlay()` |
| `isMainSceneCoveredByOverlay`（11-main-loop） | 四布尔 or | `activeVisualizerOverlay()` |

## 信号协议（MotionValue 的原生等价）

「每帧值绝不进响应式状态」：信号是模块级单例，主循环每帧 `motionSignalSet`，
各模式 rAF 读 `motionSignalGet`；离散订阅（值变化才回调）。当前主循环写入
currentTime/spectrum/audioPower/bands（频段计算点）；覆盖层的自算特征迁移到
统一信号源为渐进工作（现状不破坏）。

## 背景正交契约

背景只接 `{theme, coverUrl, audioPower, bands, seed, staticMode, paused}`——
**不拿歌词行、不拿前景模式的 tuning**（测试断言禁字段）。
「背景 × 前景自由组合」的选择器 UI 与覆盖层背景拆出为后续版本。

## Do Not Regress

- 新增覆盖层模式必须登记 `VISUALIZER_OVERLAY_MODES`（不登记 = 互斥/保温门控/
  预设网格激活态三处都看不见它）。
- entry 的 stateVar 必须是模块顶层 `var`（const/let 不挂 window，注册表解析不到）。
- 退出调用带 `{save:true}` 语义不可丢（否则重启后互斥状态错乱）。
- 背景上下文禁止混入歌词行/前景 tuning（正交性的测试钉死）。

## 后续

- 四覆盖层迁移到公共骨架（91-overlay-mode-base：bodyClass/storageKey/eco 档/
  MutationObserver 镜像/30fps 节流的模板化）——当前为最小侵入，仅互斥收敛。
- 背景选择器 UI（背景 × 前景自由组合）；覆盖层自带背景拆出为可复用背景条目。
- 歌词桥：automix blend 期间歌词时间轴冻结在出歌；songHandover 换歌门闸。
