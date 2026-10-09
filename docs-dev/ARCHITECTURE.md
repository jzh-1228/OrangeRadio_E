# OrangeSea（橘子海）技术架构文档

> 基于 Mineradio 2.0.2（commit `4abaa19`）二次创作的 Windows 沉浸式音乐播放器。
> 本文档描述当前 OrangeSea 架构（server/ 模块化拆分后），供二次开发参考。

## 一、总体架构

OrangeSea 是「**Electron 主进程 + 同进程内嵌 Node 后端 + 本地 HTTP 前端页面**」三层结构：

```
┌─────────────────────────────────────────────────────┐
│ Electron 主进程 (desktop/main.js, ~6200 行)           │
│  ├─ 窗口管理（主窗口/桌面歌词 overlay/登录弹窗/托盘）    │
│  ├─ IPC 桥（60+ 个 ipcMain.handle）                   │
│  ├─ 完整桌面模式 / 壁纸引擎模式（PowerShell+C# P/Invoke）│
│  └─ require(server.js) 启动内嵌后端 ──┐               │
└───────────────────────────────────────┼───────────────┘
                                        │
┌───────────────────────────────────────▼───────────────┐
│ Node 后端：server.js（73 行门面/装配层）                │
│  监听 http://127.0.0.1:<随机端口>                      │
│  ├─ server/context.js  共享可变状态单例                 │
│  ├─ server/utils.js    纯工具函数                       │
│  ├─ server/routes/*    15 个路由模块（顺序分发）         │
│  ├─ server/handlers/*  平台业务处理器                   │
│  └─ 顶层平台模块：qishui-api / kugou-api / spotify-api  │
│     / qq-* / NeteaseCloudMusicApi / dj-analyzer        │
└───────────────────────────────────────▲───────────────┘
                                        │ fetch /api/*
┌───────────────────────────────────────┴───────────────┐
│ 前端 (public/index.html + js/modules/ 102 个模块)       │
│  纯原生 JS + Three.js(r128) + GSAP，无框架无构建         │
│  ├─ 粒子舞台 / 3D 歌词舞台 / 3D 歌单架 / 电影镜头        │
│  ├─ 9 个视觉预设（含演唱会现场/音域回响/安魂骷髅）        │
│  ├─ 首页仪表盘 / 搜索 / 播放控制 / 视觉控制台            │
│  └─ 视觉存档系统（localStorage + OS2 分享码）            │
└─────────────────────────────────────────────────────┘
```

**关键特征**：
- 后端不 spawn 子进程，由主进程 `require()` 同进程加载（`desktop/main.js` 的 `ensureLocalServerStarted`）
- 端口从 3000 起自动探测空闲端口，注入 `PORT`/`HOST` 环境变量
- 所有平台原生能力（桌面嵌入、壁纸捕获）通过 **PowerShell + Add-Type 内嵌 C#** 实现，无二进制原生模块
- 敏感 IPC 均校验发送者 URL 必须是本地服务源（`isTrustedMainWindowIpc`）

## 二、启动流程

1. `desktop/main.js` — 单实例锁 → `app.whenReady()` → 注册 wallpaper 自定义协议 → `createWindow()`
2. `createWindowOnce()`：
   - 计算 16:9 窗口边界
   - 创建无边框透明主窗口（`frame:false, transparent:true`，preload = `desktop/preload.js`）
   - 先加载 `desktop/startup.html` 启动页（看门狗兜底）
   - `ensureLocalServerStarted()` → 找端口 → 注入环境变量 → `require(server.js)` → 等待 listening + HTTP 探活
   - 主窗口导航到 `http://127.0.0.1:<port>/`，失败重试
   - 全程写 `startup-state.json` 诊断日志

## 三、窗口体系

| 窗口 | 实现 | 说明 |
|---|---|---|
| 主窗口 | `desktop/main.js` | 无边框透明圆角，唯一主 UI |
| 桌面歌词 overlay | `createDesktopLyricsWindow()` | 透明、不聚焦、置顶，加载 `/desktop-lyrics.html` |
| 完整桌面模式 | `desktop/full-desktop-mode-runtime.js`（仅 Win32） | 把主窗口 HWND 重父级到 Explorer 桌面层，支持图标镂空与指针路由 |
| 壁纸引擎模式 | `desktop/wallpaper-engine-runtime.js` | 启动 Wallpaper Engine 场景，经 Windows Graphics Capture / DWM thumbnail 合成 |
| 登录弹窗 | `desktop/main.js` | 五平台各自独立 session partition |
| 系统托盘 | `createOrUpdateTray()` | |

Esc 全局快捷键退出桌面模式；Explorer 重启通过 `TaskbarCreated` 钩子自动恢复。

## 四、IPC 通信

- **preload**：`desktop/preload.js` 暴露 `window.desktopWindow`；overlay 用 `overlay-preload.js` 暴露 `desktopOverlay`
- **ipcMain.handle 分类**：
  - 窗口控制 / 完整桌面模式 / 内存管理（含 GPU 诊断）
  - 缓存设置 / 歌词缓存（sha256 key、LRU 上限）
  - Wallpaper Engine（一组专用 channel）
  - 全局热键 / 数据导入导出 / FX 自动保存
  - 五平台登录（`netease/qq/kugou/qishui/spotify-music-open-login`）
  - 更新与重启 / 桌面歌词 / 壁纸模式开关
- **主→渲染广播**：`desktop-window-state`、全局热键、桌面歌词状态、壁纸运行时状态等

## 五、后端服务（server/）

### 5.1 框架（模块化拆分后的分层）

```
server.js（73 行门面）
  └─ 15 个路由模块按固定顺序分发（server/routes/*），全部未命中落 static 兜底
       ├─ routes 依赖 server/handlers/*（平台业务）
       ├─ 共享可变状态收敛于 server/context.js（cookie 四件套、缓存 Map、日志、常量）
       └─ 纯工具收敛于 server/utils.js（requestText/requestJson、超时、解密音频等）
```

每个路由模块导出 `async handle(req, res, url)`，命中返回 `true`；门面统一做错误兜底（500 + JSON）。顶层 `qishui-api.js` / `kugou-api.js` / `spotify-api.js` / `qq-*.js` 仍为独立平台模块，由 routes 或 context 引用。

### 5.2 路由清单（全部 `/api/*`）

| 路由模块 | 端点 | 功能 |
|---|---|---|
| `routes/system.js` | `/api/app/version`、`/api/platform/capabilities` | 版本、平台能力矩阵 |
| `routes/local.js` | `/api/local/scan\|status\|search\|song/url\|lyric\|audio` | 本地音乐库（Phase 5） |
| `routes/listen.js` | `/api/listen/report`、`/api/listen/total` | 听歌上报（去重日志落 `data/listen-sync-journal.json`） |
| `routes/update.js` | `/api/update/latest\|download\|patch` 等 | 更新检测/多镜像下载/快速补丁 |
| `routes/beatmap.js` | `/api/beatmap/cache`、`/api/cuefield/*` | 节拍图磁盘缓存、DJ 转场规划 |
| `routes/discover.js` | `/api/discover/home`、`/api/weather/radio` | 发现页聚合、天气情绪电台 |
| `routes/search.js` | `/api/search`、`/api/qq\|kugou/search` | 多平台搜索 |
| `routes/spotify.js` / `routes/qishui.js` / `routes/kugou.js` / `routes/qq.js` | 各平台全套（登录/歌单/收藏/播放链接/歌词） | 平台代理 |
| `routes/podcast.js` | `/api/podcast/*`、`dj-beatmap` | 播客 |
| `routes/netease.js` | `/api/song/url\|lyric\|like`、`/api/login/*`、歌单/专辑 | 网易云核心（默认兜底平台） |
| `routes/proxy.js` | `/api/cover`、`/api/audio` | 封面/音频流式代理（Range 透传） |
| `routes/static.js` | `/favicon.ico`、静态兜底 | 路径穿越白名单防护 |

### 5.3 平台接入职责

| 平台 | 模块 | 方式 |
|---|---|---|
| 网易云 | `server/handlers/netease-*` + `NeteaseCloudMusicApi` | 默认/兜底平台；多品质候选串行 + 8KB 字节探测（`audio-probe.js`）+ 同录音匹配（`netease-source-match.js`） |
| QQ 音乐 | `qq-core.js` / `qq-playback.js` / `qq-liked-playlist.js` | cookie + musickey，mobile/web/H5/gateway 四线路 |
| 酷狗 | `kugou-api.js`（1795 行） | 多通道签名（Android/Web/H5/Gateway） |
| 汽水 | `qishui-api.js`（3609 行）+ `qishui-audio-decryptor/` | OAuth/扫码登录；音源 AES-CTR 解密（96MB LRU 缓存） |
| Spotify | `spotify-api.js`（1485 行） | OAuth + Web API，仅元数据/歌单，不产出音频 |

### 5.4 汽水音频解密

`qishui-audio-decryptor/`：`spade_a` 密钥（XOR+bitCount 混淆解密）→ 解析 MP4 box（stsz/stsc/senc）→ AES-128-CTR 逐 sample 解密 → 重组为 `.flac` 或 `.m4a`。`/api/audio` 路由检测 `#auth=` 触发，内存 LRU 缓存 96MB。

### 5.5 节奏分析体系

- **`dj-analyzer.js`**（864 行）：流式 MP3 解码（mpg123-decoder）→ 32Hz 高通 + 178Hz 低通保留 kick 频段 → 10ms hop 聚合 → 差分 onset + 自适应阈值 → BPM 估计 → 产出 kicks/beats/pulseBeats/cameraBeats。长音频按 Range 分段抽样
- **`cuefield/`**：DJ 转场规划器：小节密度曲线 → 候选 exit/entry 点 → 兼容性评估 → 转场配方时间线 → LRC 人声窗口避让 → 用户反馈记录

## 六、前端架构

### 6.1 技术栈

纯原生 JS + Three.js r128 + GSAP + music-tempo（BPM worker），全部 vendored。**无框架、无构建步骤**：`public/js/index-loader.js` 用同步 XHR 把 `js/modules/` 102 个 `.js` 按依赖顺序拼接注入同一 `<script>`（`//# sourceURL=orangesea-index-modules.js`），全局变量共享，加载顺序即依赖顺序。

### 6.2 模块划分（js/modules/ 数字前缀）

| 前缀 | 职责 |
|---|---|
| `00-state/` | 核心状态（`00-core-stores.js` 全部全局变量）、fx 默认值（`04-fx-defaults.js` ~190 字段）、打包存档、帧门控（`10-frame-scheduler.js`） |
| `01-scene/` | 渲染器画质、轨道/自由相机、鼓点镜头、电影镜头 |
| `02-visual/` | 封面粒子舞台（`00-pointer-cover-particles.js` 含 9 预设 shader 分支）、3D 歌词舞台（`14-stage-lyrics-rendering.js` 最大文件）、星河、涟漪 |
| `03-beat/` | BPM worker 预取、离线频带分析、beatmap 运行时、音域频谱监控 |
| `04-omni/` | **音源 Omni 抽象层**（11 模块）：歌曲身份键（`01-song-key.js` 三段键 `online:{provider}:{mediaId}`）→ provider 注册表（`02`）→ 六平台 provider（`03~08`：netease/qq/kugou/qishui/spotify/local，各带能力标志与 search/playback/lyrics URL 构建）→ `omni` 门面（`09`：URL 路由 + request generation 晚到响应防护）→ 资源缓存键（`10`）。UI 不得直接拼平台 URL 或做平台 if/else；详见 `docs/OMNI_PROVIDERS.md` |
| `04-shelf/` | 3D 歌单架（canvas 卡片 + 虚拟滚动） |
| `15-automix/` | **智能混音过渡引擎**（22 模块，四层：证据/决策/执行/宿主）：离线分析（02-track-profile）→ 乐理决策（四接法 + 乐句量化）→ 元素级双 deck 交叉（21-deck-manager 复用 albumGapless 收养通道）；与 Cuefield/专辑无缝让位共存；详见 `docs/AUTOMIX.md` |
| `05-playback/` | 播放核心（`13-playback-start-audio.js` `playQueueAt()`）、搜索、首页仪表盘、EQ、cuefield 自动混音 |
| `06-lyrics/` | 歌词解析、播放列表面板、进度条、拖放导入 |
| `07-fx/` | 视觉控制台、预设网格（`04-preset-grid-uniforms.js`）、用户存档、**演唱会现场聚光灯层（`10-concert-live-stage.js`）** |
| `08-account/` | 登录状态轮询、登录流程（扫码/COOKIE/OAuth）、更新预览 |
| `10-shell/` | splash、手势控制（MediaPipe）、桌面模式控制坞、胶片电台、涂鸦墙、迷你播放器 |
| `11-main-loop.js` | 主渲染循环：帧门控 → 频谱分析 → 节拍引擎 → uniforms → 各子系统 tick → render |

### 6.3 视觉预设切换

`07-fx/04-preset-grid-uniforms.js` `setPreset(p)`：写 `uPreset` uniform → 清理/加载预设资源（如骷髅点云、音域地形、聚光灯层）→ 涟漪+相机 punch 过渡 → 切换相机基线 → 持久化。共 **9 个预设**（0-8）：

| 索引 | 名称 | 说明 |
|---|---|---|
| 0-4 | emily / 滚筒 / 星球 / 虚空 / 唱片 | 经典粒子形态 |
| 5 | 星河 | 壁纸粒子 · 音乐律动 |
| 6 | 安魂 | 骷髅 3D 点云 |
| 7 | 音域回响 | Sonic-Topography 音域地形 |
| 8 | **演唱会现场** | 挥舞荧光棒人海（阶梯看台）+ LED 腕带逐排色浪 + 鼓点集体高举 + 5 道扫动聚光灯（暖白核心+金边光晕）+ 顶部灯架光晕 + 舞台地坪反光 + 鼓点全场地频闪 |

另有独立于数值预设的「胶片电台（Film Radio · 暗房放映）」特殊卡片（`10-shell/06-film-radio.js`，纯 DOM/CSS 全屏播放器皮肤，切换数值预设自动退出）。设计概念：一张胶片影像同时被冲洗（拍立得物质性）和被放映（银幕光线）——封面以**拍立得形态**呈现（暖白粗边相纸 + 微倾 + 底部日期/帧编号戳），左上角一道**放映光束**斜射照亮它，右侧 Cinzel 片头歌名 + 装饰性胶片数据戳（ISO/光圈/快门，由歌名 hash 稳定生成）+ 字幕带歌词。质感档克制：固定颗粒纹理 + 角落漏光缓慢呼吸，无周期划痕。

另有独立于数值预设的「涂鸦墙（Graffiti Wall · 暗夜墨光）」特殊卡片（`10-shell/08-graffiti-lyrics.js`，纯 DOM/CSS 满屏歌词模式，与胶片电台/数值预设互斥）。设计概念：一句歌词用行草书法大字自然换行（2~3 行）铺满屏幕，逐字蹦出——氛围基调「暗夜墨光」四层叠加：L0 模糊封面取色底 + L0.5 暗化遮罩 + L1 双光晕呼吸（11~13s）+ L2 墨光粒子（Canvas 2D 离屏精灵复用，亮度随低频能量）+ L3 歌词大字（text-shadow 三层柔光发光）。字号自适应用二分查找（`scrollHeight ≤ 可视区 74%`）；打字机时序按 YRC 逐字真实节奏或 LRC 均分；每字带稳定随机旋转 ±8°（行/字索引种子）。独立样式在 `public/css/graffiti-lyrics.css`（`body.graffiti` 命名空间，token：`--gw-ink` 字色 / `--gw-glow` 远光晕 / `--gw-font` 字体栈）。

另有「流光（Aurora Flow · 封面极光氛围）」特殊卡片（`10-shell/09-aurora-flow.js`，`docs/AURORA_FLOW.md`）：日常沉浸档——封面取色流体色雾（32×32 降采样 HSL 24 桶取 top3，低分辨率 Canvas + CSS blur）+ 三行歌词逐字点亮（复用 `tokenizeGraffitiText`/`computeGraffitiReveals`，YRC 真实时序）+ 底部呼吸波形线（`timeDomainData`）。音频特征自算（`auroraBass/Energy/Beat/Chorus`，覆盖层期间主循环不更新全局特征值）；节拍只做 ≤4% 亮度心跳（零频闪承诺）；副歌闸门驱动色雾浓度 + 单条极光丝带。样式 `public/css/aurora-flow.css`（`body.aurora`，token：`--af-c1/c2/c3`/`--af-sung`/`--af-idle`）。

另有「雨夜车窗（Rainy Cab · 深夜行车）」特殊卡片（`10-shell/10-rainy-cab.js`，`docs/RAINY_CAB.md`）：深夜情绪档——窗外封面同色 bokeh 光斑（74 个双视差层散景圆，`blur(13px)`）+ 玻璃雨滴对象池（cling 贴附/slide 滑落两态，生成率随音乐能量与间奏雨势）+ 雾玻璃逐字凝出歌词（字体跟随 `fx.lyricFont`）+ 水痕旧句 7s 冲淡 + 仪表台剪影。物理细节：bass 弹簧微颤只抖窗外光斑层（钳制 ±2.2px，玻璃/雨滴/歌词相对不动）；间奏（无歌词行 >1.5s）雨渐大；副歌天际线泛暖。样式 `public/css/rainy-cab.css`（`body.rainy`，token：`--rc-neon1/2/3`/`--rc-sung`/`--rc-font`）。

两者与胶片电台/涂鸦墙构成**四方互斥**的全屏覆盖层模式（互相进入时退出他者，数值预设 `setPreset` 亦互退），均照 film-radio 范式：localStorage 偏好 + 临时 eco 质量档 + MutationObserver 零侵入同步 + 自有 30fps rAF + `isMainSceneCoveredByOverlay()` 主循环保温门控。

### 6.3a 视觉模式平台

`02-visual/90-visualizer-registry.js`：前景模式注册表（覆盖层四模式 + sonic 外挂清单），互斥/保温门控/预设网格激活态的单一 owner（entry 的 stateVar/applyFn 经 window 延迟解析）。`92-background-registry.js` 背景正交协议；`00-state/12-motion-signals.js` 每帧信号对象（主循环写、模式 rAF 读、值变化才唤醒）。详见 `docs/VISUALIZER_PLATFORM.md`。

### 6.3b Folia 移植歌词模式（`10-shell/20-24`，11 个）

移植自 folia-major 的歌词动画模式，全部照 film-radio 覆盖层范式（bodyClass + localStorage + eco 档 + 注册表互斥），与本项目自有模式（胶片/涂鸦/流光/雨夜/极光/雨窗）同池互斥：

| 模块 | 模式 | 核心结构 |
|---|---|---|
| `20-still.js` | 静止 Still | 三行窗口静态歌词；字色/底色随主题服务，黑色径向暗角 0.65 罩层 |
| `20-fume.js` | 烟纸 Fume | 多栏「报纸」排版 + 排版相机逐句飞行；归一化测量（100px 参考字号一次，线性缩放缓存）；副歌 hero 特大块 |
| `20-classic.js` | 流光 Classic | 词级三态 + 随机布局 + 逐字辉光（drop-shadow 分离层）；active/base 双色随主题 |
| `20-partita.js` | 云阶 Partita | 竖列错落词阶 + 逐字流光 + 副歌涟漪 |
| `20-pendolo.js` | 时计 Pendolo | 钟表机械 canvas（齿轮/游丝/辐条轮/60 刻度）+ 弧形轮歌词布局 |
| `20-tilt.js` | 斜排 Tilt | 行拆 1-4 段概率布局 + 大斜体 + 字符 ±yOffset 交错 |
| `20-claddagh.js` | 环歌 Claddagh | 扁椭圆（0.09 短轴）45° 环排字符流 + 聚焦因子衰减 |
| `21-cadenza.js` | 心象 Cadenza | 中轴单行 + 当前字放大呼吸 |
| `22-lattice.js` | 队列拼贴 Lattice | 队列封面海报墙（12×8 混合槽位无限晶格平铺/队列环绕/当前海报 6×6 让位展开/拖拽平移/墙不改队列），详见 `docs/LATTICE.md` |
| `23-cappella.js` | 群唱 Cappella | 聊天气泡歌词：圆形人物头像（`public/assets/cappella/` 15 张）+ 表情贴纸（9 张）+ getBubbleColors 配色公式 + 三档 motion CSS 变量 + 流光/时间戳/逐字 fade |
| `24-monet.js` | 莫奈 Monet | 海报双栏（左：艺术家斜体/装饰线/大标题/歌词轨道/主题胶囊；右：竖幅相框封面+挂钉）；背景 = 封面水洗油画管线；轨道 = ±4 窗口 tone 曲线 + 双色逐词扫过 + 副歌光斑 |
| `25-diorama.js` | 镜台 Diorama | 圆窗景深：圆形镜窗（模糊封面+双环）+ 层叠卡堆 + 三层柔光大字 + 尘埃粒子 canvas + 副歌光台 |
| `26-sonnet.js` | 商籁 Sonnet | 聚光灯诗稿：圆形光台+幕布放射+光束；7 层诗稿行栈（种子旋转错位沉浮）+ 逐字点亮 |
| `27-tempera.js` | 凝彩 Tempera | 剪纸色块：5 种构图模板按歌曲 seed 选择，主题派生 6 色板柔边色块漂移 + 能量驱动明度 + 逐字点亮 |
| `28-lumiere.js` | 绘光 Lumiere | 霓虹光丝：canvas 满帧 4 条贝塞尔光丝（双层描线辉光）+ 光点串 + 星尘上浮 + 星落 + 逐字点亮 |

2026-10 视觉保真度对齐轮：启动 folia 原项目试验场逐模式实机截图对照 + 源码逐行核对，重写 still/monet/cappella 三个粗糙移植、修正 classic 主题跟随、lattice 重写为无限晶格、心象/云阶/时计/斜排/环歌接主题服务、烟纸默认衬线；并补齐 diorama/sonnet/tempera/lumiere 四模式（Folia 14 模式全集完成）。

### 6.4 主题系统

CSS 变量集中在 `public/css/index.css` 多个 `:root` 块（灰阶/品牌色/玻璃材质/图标色）。主题切换 = 运行时改写 CSS 变量（`07-fx/02-accent-background-controls.js`），无预设皮肤机制。胶片电台独立样式在 `public/css/film-radio.css`（`body.film-radio` 命名空间，自带局部 token：`--fr-void` 暖黑底 / `--fr-paper` 相纸暖白 / `--fr-amber` 放映暖光 / `--fr-amber-hi` 强调金 / `--fr-leak` 漏光橙红）。

### 6.5 视觉存档

双层持久化：当前自动保存 `orangesea-current-fx-autosave-v1`（localStorage，~190 字段）+ 命名存档槽 `orangesea-user-fx-archives-v1`。支持 `OS2` 前缀 base64url（可选 gzip）分享码导入导出，delta/全量两种紧凑编码。

## 七、数据存储

**用户数据根目录**：`%AppData%\OrangeSea`（app.setName）

| 文件 | 内容 |
|---|---|
| `.cookie` / `.qq-cookie` / `.kugou-cookie` / `.qishui-cookie` 等 | 平台凭据 |
| `current-fx-autosave.json` | 视觉特效自动保存 |
| `cache-settings.json` | 缓存根目录配置 |
| `startup-state.json` / `startup-error.log` | 启动诊断 |
| `desktop-behavior.json` | 关闭行为偏好 |
| `data/listen-sync-journal.json` | 听歌同步去重日志（600 条上限） |

**缓存目录**：默认 `D:\OrangeSeaCache`（D 盘存在时，否则回退 userData/cache），下分 `lyrics/`（LRU）、`chromium/`、`beatmaps/`、`updates/`、`native-helper-temp/`。**C 盘被禁止用于 beatmap 缓存**（`server/routes/beatmap.js`）。

## 八、自动更新

自研方案（非 electron-updater）：
1. 配置源：`package.json` 的 `mineradio.update` 段（当前 `provider: "none"` 禁用，可被 `MINERADIO_UPDATE_*` 环境变量覆盖）
2. 检查：`/api/update/latest` → GitHub Releases API → 回退 latest.yml → 本地 fallback
3. 下载：`/api/update/download` → 镜像列表轮询 → sha256/sha512 校验
4. 安装：`mineradio-open-update-installer` IPC，强制校验路径必须在更新目录内
5. 快速补丁：`/api/update/patch` — 路径白名单 + sha256 校验 + 12MB 上限 + 原子写 + 备份回滚

## 九、打包构建

- `npm run build:win` → electron-builder NSIS 安装包（`OrangeSea-{version}-Setup.exe`），产物 `dist/`
- 正式版 `asar: false`；内测通道 `electron-builder.internal-beta.json`（OrangeSea_Beat，`asar: true`）
- `build/after-pack.js` 用 rcedit 注入图标；`com.orangesea.desktop` appId
- 打包清单见 `package.json` 的 `build.files`（含 `server/**`）

## 十、测试与开发

- `npm test` → `scripts/run-tests.js` 逐个以子进程跑 `tests/*.test.js`（脚本式 + `node:test` 两种风格并存），任一失败非零退出
- `scripts/quick-check.js`（`quick-check.bat` 包装）：静态冒烟 + 整仓文本守卫（禁 Mineradio 残留标记、关键机制防回退断言），`full` 参数跑 Electron 运行时冒烟
- 开发规范见 `docs-dev/MODDING-GUIDE.md`

## 十一、授权

GPL-3.0。衍生作品对外分发必须以 GPL-3.0 开源并保留版权声明；Mineradio 名称与原创视觉表达归原作者所有，OrangeSea 换皮后不得使用 Mineradio 名称与 Logo。
