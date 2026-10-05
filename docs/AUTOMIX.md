# Automix 智能混音过渡

> 歌曲之间的智能衔接：离线分析节拍/响度/调性/段落/结尾形态，乐理决策过渡方式，
> 双 deck 交叉执行。DIY 控制台「系统 → 智能混音」开关（默认关）。
> Portions Copyright (c) 2025 chthollyphile and Folia contributors —
> adapted from folia-major (AGPL-3.0)，原生 JS 移植。

## 四层架构（`public/js/modules/15-automix/`，22 模块）

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 证据 | `01-signal-analysis`（fft/K 计权/自相关测速/重拍估计/等功率曲线）、`02-track-profile`（BPM 全曲+尾段、小节线、LUFS、首尾调性、三频段、段落边界、结尾形态、人声起点）、`03-runtime-stubs`（2a 模型存根）、`19-profile-service`（字节来源/持久化/LRU） | 测量音频客观事实 |
| 决策 | `04-musical-time`（拍/小节/乐句量化、速度关系分档）、`05-transition-chooser`（四接法 beatCut/bassSwap/tailRide/plainBlend）、`06-transition-planner`（TransitionPlan 纯数据 + AUTOMIX_MAX_OVERLAP_SEC=25 天花板）、`07-crossfade-planner`（定长等功率）、`08-transition-strategy`（automix/crossfade 双规划器分派） | 事实 → 方案 |
| 执行 | `10-deck-clock`（阶梯拟合毫秒时钟）、`11-deck-analyser`、`12-tempo-bend`（变速不变调）、`16-crossfade-graph`（三频段接缝/回声抛掷/软限幅，2a 未接线） | 方案 → 音频事件 |
| 宿主 | `21-deck-manager`（窗口检测/布防/交接/回退状态机）、`20-blob-url-ledger`（blob 台账） | 播放链路接线 |

stem 手势（`13/14/15`）与诊断（`17`）、会话状态机（`18`）已移植就绪，
等待 2b 常驻双 deck 图接线。

## 2a 执行形态（元素级混合）

决策引擎完整（四接法/乐句量化/结尾形态/人声窗口/平衡修正），执行层为**元素级**：
等功率曲线（`buildCrossfadeCurves` 的 together 平台段）驱动双元素 volume 交叉、
`playbackRate + preservesPitch` 变速——复用 albumGapless 已验证的混合通道与
playQueueAt 收养分支（`automixAdopted` 增益语义），**不触碰主音频图**。

时序：距歌尾 ≤26s 预载 B（静默预缓冲 + 离线分析）→ 距 `outStart` 1s 布防
（B seek 到 inStart、抑制出 deck onended）→ 到点 fading（曲线交叉 + 出场曲变速）
→ settle 收养 B 为主元素（失败干净回退常规切歌）。

## 与既有过渡机制的关系

| 机制 | 关系 |
| --- | --- |
| albumGapless（同专辑无缝） | 优先：预载存在时 automix 让位（`albumGaplessState.preload` 检查） |
| Cuefield AutoMix（LRC 锚点，实验性） | 让位共存：cuefield 开启时 automix 不抢；其 LRC 锚点思想已由 planner 的 `lines` 输入吸收（歌词时间轴即人声窗口证据） |
| 单曲循环 | automix 不介入 |

## 分析链路（`19-profile-service`）

- 分析键 = Omni 歌曲身份键；档案 localStorage 持久化（`orangesea-automix-profile-v1:*`），内存 LRU 200 条
- 字节来源：播放代理 URL（`/api/audio?url=…`）Range 前缀 1.5MB（约 40s@320kbps），服务器拒绝 206 则跳过分析（"完整下载不是我们花的"）
- 分析范围限 [当前, 下一首]，串行队列，出队复查（跳过的歌不占解码）
- partial 档案：只有头段 → 尾部字段 null；`gridless` 标记区分"模型没跑"与"没有网格"

## Do Not Regress

- 变速只弯出场曲，永不弯进场曲（`tempoBend` 单侧原则）。
- 启发式只决定"怎么接"不决定"接不接"：`planForMode` 无证据回落 crossfade 而非跳过；
  `hardCut` 只留给"结尾真正不可知"的歌。
- 长度系数会相乘（调性冲突 ×0.4 × 速度 ×0.5 …），地板 0.25（06 的 `lengthScale` 纪律）。
- 出 deck 的 `onended` 在布防后被抑制，**任何退出路径**（abort/settle）都必须恢复或使旧元素退役。
- 收养失败必须干净回退：静音 B、恢复 A 音量、`audio.ended` 时走常规 nextTrack。
- 分析失败静默跳过，不允许阻断播放（`ensureTrackProfile` 全链 try/catch）。
- `AUTOMIX_MAX_OVERLAP_SEC = 25` 是天花板不是答案：实际长度按乐句量化得出。

## 2b 待办（采样级执行 + 神经网络证据）

- `desktop/analysis/`：utilityProcess 推理宿主 + worker（Beat This! ONNX 拍点，
  F-measure 对拍 1.0000 验收）+ Python sidecar（htdemucs 人声分离，
  `enable_mem_reuse=False` 省约 2GB）+ 模型下载器（多镜像 + sha256 双校验）
- 常驻双 deck AutomixDeckChain（`16-crossfade-graph` 接线：三频段接缝、回声抛掷、
  stem 交接 8ms 交叉、软限幅总线）替代元素级 volume
- stem 手势接线（`13/14/15`）与表现模式 build-up
- `18-automix-session` 完整状态机（ports 注入）替换 deckManager 的轻量时序
