# Changelog

## 未发布

- 主题系统补全 folia 三源：新增**基础预设对「墨染/素白」**（baseThemes.ts 逐字段：夜 zinc 系 / 昼 stone 系 + orange-600 强调，无封面与"保存前"的默认观感）与**我的主题库**（Theme Park 保存主题等价：一键把当前生效双主题存进 localStorage，列表应用/删除，悬空回退封面派生）；`fx.themePreset` 三源选择（封面派生/墨染素白/custom:\<id\>）持久化。
- 新增**群唱（Cappella · 聊天气泡歌词）沉浸模式**（移植自 Folia cappella）：每句歌词是一条左右聊天消息——左侧四位"合唱成员"轮换（稳定色相字块头像）、右侧"主唱"发出歌名卡；间奏"......"变表情包大贴纸、普通行后按概率触发回应贴纸（概率/上限/间隔按 calm/normal/chaotic 三档照搬）；当前句气泡放大发亮逐字点亮、唱完收缩变暗，聊天流自动滚到最新。发送者分配按歌曲 key 确定性播种（同歌同对话）。测试基线 47 → 48。
- 新增**莫奈（Monet · 油画海报歌词）沉浸模式**（移植自 Folia monet 的背景管线与歌词轨道）：封面在 1920×1080 离屏画布上烘焙成印象派海报——模糊 → 灰度/饱和/水洗像素后处理（亮度沿 shadow→accent→highlight 两段折线向主题三色混色）→ 对角渐变 + 左侧 bloom + 右侧 veil + 18 条竖笔触痕，仅封面/主题变化时重算；海报缓漂移 + 主题色光斑装饰；右侧逐词歌词轨道（当前行大字、逐词点亮、唱过缩小沉入画里）。测试基线 48 → 49，八模式烟测扩展至十模式全绿。
- 新增**封面派生双主题系统**（Folia builtinTheme 全链移植，DIY 控制台「主题」组）：每首歌按封面取色 + 和声方案（duotone/analogous/complementary/split/triadic/monochrome）实时生成**昼/夜一对主题**——背景基调三档（素墨/轻染/浓彩）、primary/secondary/accent 沿亮度轴解 WCAG 对比度地板（9:1/4.5:1/3.2:1，保色相不退化为黑白）、诗意见证名（色相桶前缀"绯色/琥珀/鎏金/新柳/潮汐/紫烟…" × 昼"破晓/晨光/微光…"/夜"子夜/夜色/深潭…" + Built-in 尾标）与同色系第一人称氛围描述；`fx.themeMode` 跟随昼夜（7-19 点为昼）或手动固定，持久化。消费端：正交背景层主题色、烟纸纸面文字与底色（亮主题=亮纸暗墨，整版自动重排）、`:root` 的 `--theme-*` CSS 变量。随机源按歌曲 key 播种（同歌同主题跨会话稳定）；色板键连续两拍一致才重生成（防取色分步写入翻主题）。详见 `docs/THEMES.md`，测试基线 46 → 47。
- 新增 **Web 版部署**：`npm run web`（= `node server.js`，PORT 可环境变量覆盖）+ `deploy/web/`（Dockerfile + docker-compose，凭据经 `COOKIE_FILE*` 环境变量入 `/app/data` 卷）。前端对 `window.electron` 桥全量护栏（修复 automix 模型进度订阅在纯浏览器崩溃），无桩浏览器启动零报错、烟纸/队列拼贴/流光/雨夜四模式实测可用；桌面专属能力（本地库导入/Automix ONNX/桌面歌词等）自动降级。详见 `docs/DEPLOY_WEB.md`。
- 新增 **Android APK 打包设置**：`npm run android:sync`（生成 WebView 壳启动页 + `capacitor.config.json`，`--url` 可烧录服务地址）+ Capacitor 打包全流程文档（SDK/JDK 前置、cap add/sync、明文流量许可、签名发布、已知边界）。APK = 壳 × Web 服务，业务代码全在服务端同源加载，服务升级免重打包。详见 `docs/ANDROID.md`。
- 新增**队列拼贴（Lattice）沉浸模式**（DIY 控制台预设网格特殊卡片，移植自 Folia Lattice 队列展示面）：整个播放队列投影成**封面海报墙**——每曲一张海报（无封面按歌曲 id 稳定取色相渐变兜底）+ 两位编号徽章 + 播放头三态（已播压暗 / 在播日落橙描边加"正在播放"呼吸徽章 / 待播正常），切歌时当前海报自动平滑滚到视口中央，点击任意海报即从该曲播放；中央浮**正在播放卡片**：封面 + 歌名歌手 + **原词与翻译对照的当前句**（与静止/烟纸同源）+ 进度条 + 上一首/播放暂停/下一首，可收起为小条。纯 DOM 零 canvas 零 rAF（队列指纹 600ms / 卡片 300ms 轮询且值变化才写 DOM），海报 `contain: content`；经视觉模式注册表与全部覆盖层互斥（id `lattice`）。详见 `docs/LATTICE.md`，测试基线 45 → 46。
- 新增**副歌元数据链路**（Folia chorusResolver 移植，烟纸 hero 特大块的情感落点）：服务端新增 `/api/song/chorus`（网易 song_chorus 接口，毫秒→秒归一，失败静默降级空区间）；前端歌词应用后异步拉取副歌区间，按行时间重叠标记 `isChorus`，无区间时回退**重复行文本检测**（出现次数最多的歌词行视为副歌，Folia chorusDetector 同款启发式）；打标完成递增 `lyricsMetaVersion` 驱动烟纸 600ms 轮询重排。烟纸的 hero 变体选择（副歌短行必为特大块 + fallback hero 评分的 chorusScore 0.28 权重）与排版缓存键本就支持 isChorus，此前缺的只是数据——现在每到副歌稳定出现"夕阳"式特大字块与相机大飞行（实测 Girlfriend 副歌区间命中 31 行，特大块 23 → 41 个其中 24 个落在副歌行，hero/body 字号对比约 2 倍，与原版参照一致）。歌词渲染签名补入 isChorus（迟到打标不再被"同态跳过"吞掉）。
- **烟纸（Fume）性能与观感对齐原版三连修**：① 排版重建**测量风暴**——排版搜索（4 列数 × 8 密度二分 × 每行 8 轮字号二分 ≈ 每行 256 次全文准备）此前每次都做 O(n²) 前缀 measureText、且字号每轮变化令测量缓存全 miss，118 行歌词重建一次冻结 9.7 秒（切歌/进模式即卡死数秒，相机也被拖成慢动作横扫）；现按 Folia 所用 pretext 库架构改为**归一化测量**——每行文本只在 100px 参考字号测一次（段宽 + 段内逐字前进量，canvas 文本宽度与字号线性），其余字号线性缩放，缓存跨全部排版尝试与重建复用：同一首歌重建 **9748ms → 43ms**；② 渲染循环由 30fps 门控升为**满帧 rAF**（原版即全速，相机弹簧的飞行手感依赖 60fps）；③ **几何纸面装饰默认关闭**（对齐原版 `DEFAULT_FUME_TUNING.disableGeometricBackground: true`），纸面更干净且每帧省一层渐变描边。相机物理经合成时间轴逐帧验证与原版无偏差：歌词密集段 30 秒 15 次换行飞行、满版二维移动、深推缩放 1.9~2.2×。
- 新增**八个沉浸式歌词动画模式**（移植自 Folia，DIY 控制台预设网格特殊卡片，与胶片电台/涂鸦墙/流光/雨夜等既有覆盖层经视觉模式注册表互斥，均照 film-radio 覆盖层范式：bodyClass + localStorage 偏好 + 临时 eco 质量档 + 主循环保温门控）：**经典 / 定格 / 华彩 / 组曲 / 钟摆 / 倾斜 / 克拉达 / 烟纸**——其中烟纸把整首歌词排成一张多栏「报纸」，排版相机沿演唱进度逐句飞近（暗房基底 + 暖纸墨 + 几何纸面装饰 + 印章光斑；静态文本块离屏快照缓存、shadowBlur 整数量化避免每帧铸造新 glyph strike）。配套**背景正交组合**（DIY 控制台「背景」分组：背景只接主题/封面/音频信号，与任意前景模式自由组合，`94-background-presets` + `95-background-runtime`）与**首页三区信息流重构**（新仪表 + 空屋壁纸 + 发现/天气数据服务端聚合）。新增 `tests/bg-switcher.test.js`、`tests/partita.test.js` 与八模式浏览器烟测 `tests/manual/visualizer-modes-smoke.cjs`。
- 修复**烟纸模式黑屏两连**：① 背景绘制的两处调用点实参顺序颠倒（不透明度倍率与视差对象互换），`clamp(对象)` 产出 NaN 渗入渐变色令 `addColorStop` 抛 TypeError——rAF 循环首帧死亡后不再自愈、模式永久黑屏；现单帧异常只丢帧不丢循环（`frame` 补 try/catch），并以八模式烟测固化回归；② 纯音乐/取词失败时纸面只剩极淡装饰易被当成黑屏，补**歌名占位排版**（歌名大字呼吸辉光 + 「等待歌词抵达 · 纸面会自动排版」提示）。
- 主进程新增**渲染层 console 转发**：主窗口渲染进程的 error 全量、warn 按文案去重限流转进主进程 stdout——黑屏/静默异常类问题从此在启动终端直接可见渲染层报错，无需开 DevTools。

- **歌词行层循环性能修复**（渲染帧的最大隐性开销）：播放中 `updateLyricRowLayers` 对整首歌驻留的全部歌词行（长歌可达 600 行）每帧无条件执行目标计算、位置插值与 uniform 写入——现在**不在渲染窗口且透明度已收敛为 0 的行直接跳过重活区**（微基准 4.92ms→2.43ms/帧，-50% 纯 JS，还不含原先 three r128 对全部不可见 mesh 的每帧矩阵重组），行进入渲染窗口的边沿帧一次性 snap 到目标位置消除从冻结位置追赶的偏移；冻结行同时关闭 `matrixAutoUpdate`，唤醒帧恢复——消除 60fps 下对 600~1800 个 Object3D 的每帧矩阵级联（真机推断收益与本项相当或更大）。

- **内存优化五件套**：① 处理类 canvas 池（封面裁切等高频短命 canvas 按尺寸分桶复用，每桶 2 总 8 上限，此前每次切歌 3~4 个临时 canvas 靠 GC）；② 本地歌曲 blob URL 台账与定期清扫（不在队列且不在任何 audio 元素出声即 revoke——修复拖放导入的文件字节被浏览器进程持有到刷新）；③ THREE 资源分级释放（detach 常规切换零重建 / dispose 真释放，内存压力处理器注册制）；④ 主进程 RSS 水位驱动（渲染进程工作集超 2.5GB 触发压力事件，渲染侧 aggressive trim + THREE 重资源 dispose，5 分钟冷却——定时器驱动升级为定时+水位双驱动）；⑤ 内存探针脚本（`tests/manual/memory-probe.mjs`，OS 工作集按进程类型采样，"差值不过 run-to-run 摆幅不报告"判读纪律）。歌词缓存 LRU 的读时时间戳重盖核查确认已存在。
- 新增**视觉模式平台**（注册表化）：覆盖层互斥从 6 处复制收敛为注册表单一 owner（`02-visual/90-visualizer-registry.js` 声明式清单 + window 延迟解析，与加载顺序无关）；主循环保温门控（`isMainSceneCoveredByOverlay`）与预设网格特殊卡片激活态改注册表查询——**新增覆盖层模式 = 清单一行**；背景注册表落地正交协议（背景只接主题/封面/音频信号，不拿歌词行与前景 tuning，测试钉死）；新增每帧信号对象（`00-state/12-motion-signals.js`，MotionValue 原生等价：主循环写 currentTime/audioPower/bands/spectrum，值变化才唤醒订阅者）。详见 `docs/VISUALIZER_PLATFORM.md`，测试基线 42 → 43。
- 智能混音新增**神经网络推理层**（可选，模型按需下载）：`desktop/analysis/` 推理宿主（utilityProcess 进程隔离，主进程零阻塞）+ Beat This! 拍点 ONNX 模型（83MB，MIT）+ htdemucs 人声分离（109MB + 裁剪 Python 运行时，sidecar 进程用完即退）；多镜像下载（hf-mirror→hf→github）+ sha256 双校验；DIY 控制台新增「混音模型」管理面板（状态/下载/进度/取消）。模型缺失自动回退自研估计器（2a 链路），不装模型功能完整可用。详见 `docs/AUTOMIX.md`。
- 新增**智能混音过渡（Automix）**（DIY 控制台「系统 → 智能混音」分组，默认关）：歌曲之间智能衔接——离线分析（节拍/响度/调性/段落边界/结尾形态/人声窗口，播放代理 Range 前缀取字节，档案 localStorage 持久化）→ 乐理决策（四接法 beatCut/bassSwap/tailRide/plainBlend，过渡长度按乐句量化而非固定秒数，调性×速度系数乘积带地板）→ 双 deck 等功率曲线交叉（together 平台段）+ 出场曲变速不变调；与同专辑无缝、Cuefield、单曲循环的让位关系明确，收养失败干净回退常规切歌。详见 `docs/AUTOMIX.md`。
- 新增**音源 Omni 抽象层**（`public/js/modules/04-omni/`，11 个模块）：前端多平台音源统一门面——歌曲身份键（`getPlaybackSongKey` 三段键 `online:{provider}:{mediaId}`，判别式 sourceRef）、六平台 provider 注册表（网易/QQ/酷狗/汽水/Spotify/本地，各带能力标志与 URL 构建）、`omni` 门面（搜索/播放/歌词 URL 路由 + 数据方法带 request generation 晚到响应防护——切换平台事务后旧响应变 AbortError 丢弃）、资源缓存键规范（`{kind}_{songKey}`）。**纯重构零行为变化**：playQueueAt 与专辑无缝两处播放 URL if/else、歌词端点、搜索端点全部改经 omni 路由，`qqPlaybackEvidenceQuery`/`neteasePlaybackMatchQuery` 收敛至 provider 层（全局名保留）。详见 `docs/OMNI_PROVIDERS.md`，测试基线 40 → 41。
- **许可证由 GPL-3.0 切换为 AGPL-3.0**：本项目将引入来自 Folia（AGPL-3.0）的智能混音引擎、音源抽象层与视觉平台协议等适配代码，依 GPLv3 §14 合并条款将整体按 AGPL-3.0 授权（原 Mineradio GPL-3.0 衍生关系保留，详见 NOTICE.md 移植清单）。
- 新增两个**沉浸式视觉预设**（DIY 控制台预设网格特殊卡片，与胶片电台/涂鸦墙四方互斥，照 film-radio 覆盖层范式：localStorage 偏好 + 临时 eco 质量档 + 主循环 0.5fps 保温门控）：
  - **流光（Aurora Flow · 封面极光氛围）**：日常沉浸档。专辑封面取色（32×32 降采样 HSL 分桶 top3）的流体色雾背景（低分辨率 Canvas + CSS blur，3 色团互质轨道慢漂）+ 大字逐字卡拉OK歌词（复用涂鸦墙分词与 YRC 揭示时间表，点亮式填色）+ 底部呼吸波形线；歌词字体跟随 DIY 控制台设置的歌词字体（`fx.lyricFont`，与雨夜车窗/涂鸦墙一致）；低频呼吸/节拍心跳（≤4% 亮度，零频闪）/副歌闸门（色雾浓度 + 单条极光丝带）全部自算自 `frequencyData`。取色失败静默回退默认夜色板。详见 `docs/AURORA_FLOW.md`。
  - **雨夜车窗（Rainy Cab · 深夜行车）**：深夜情绪档。窗外封面同色霓虹 bokeh 光斑（74 个双视差层散景圆）+ 玻璃雨滴对象池（贴附/滑落两态、分叉、透镜折射三层绘制，密度随音乐能量）+ 雾玻璃逐字凝出歌词（字体跟随用户歌词字体）+ 旧句水痕 7s 冲淡 + 水痕旧句悬浮于当前行上方淡出（不遮挡当前行）+ 仪表台剪影；bass 弹簧微颤只抖窗外光斑（钳制 ±2.2px），间奏雨势渐大，副歌天际线泛暖。详见 `docs/RAINY_CAB.md`。
  - 两者均修复了胶片/涂鸦同样存在的隐性小问题：`audio` 为 null（启动后从未播放）时歌词 tick 静默失效，新模式按 0 兜底渲染首行。
  - 两个模式均内置**暗色/灰调封面补偿**（`auroraVividPalette` / `rainyVividPalette`）：封面过暗时提亮主色并输出亮度增益上调氛围 alpha，主色过灰时做 ±色相偏移扩展层次——修复深色封面歌曲下流光色雾不可见、雨夜车窗光斑全是灰白糊斑的问题。
  - 雨夜车窗**雨滴系统改为 WebGL2 shader 方案**（照 rain-glass-demo 实现）：雨滴位置/滑落/拖尾全在 fragment shader 用网格哈希+时间相位计算；折射用屏幕空间梯度当法线偏移 UV 采样背景（透镜成像的物理模拟，水珠内部清晰、边缘出轮廓）；滑落为蓄水-加速时间线；**泪痕**为连续渐细水线+残珠串；**汇聚**：滑落路径吸收静态冷凝微滴；mipmap LOD 景深（背景模糊水珠清晰）；WebGL2 不可用时优雅降级为纯光斑背景。设置面板雨势/雾气/车速映射为 shader 的 uDensity/uBlur/uSpeed。
  - 新增 DIY 控制台**「雨夜车窗」动效设置分组**（激活该模式时自动显示）：雨的大小 / 雾气浓度（玻璃雾 + 窗外模糊联动）/ 车流亮度 / 车速 四个滑块，走 fx 面板标准链路（绑定/重置/持久化/搜索命中），复用 Sonic 条件显隐机制随模式开关。
  - 雨夜车窗外景重构为**三层纵深光斑**（64 远灯小亮点 / 26 中层霓虹光团 / 12 近处大光晕，色彩扩展板含暖白/冷白路灯记忆），三层速度差强化行车视差，光斑带路面颠簸微浮动。
  - 新增 `tests/aurora-flow.test.js` / `tests/rainy-cab.test.js`（vm 沙箱：取色分桶/颜色工具/鲜艳度补偿/音频特征/雨滴生命周期/微颤钳制/间奏雨势），测试基线 38 → 40。
- 修复点击画面偶发**渲染进程崩溃**（`Cannot set properties of undefined (setting 'x')` at addRipple）：音域回响预设的对象池（涟漪/陨石/拖尾）在场景构建完成前是空数组，而 `isActive` 门控只检查预设号——切到该预设后的首个动画帧窗口期内点击画布，`pointerRipple` 即对 `undefined` 槽位写属性抛 TypeError。池入口（`addRipple`/`addMeteor`/`spawnTrail`）补空守卫，未构建时静默忽略。
- **移除「风格电台」模式**（按曲风自动切换的八世界视觉模式）：视觉表现不达预期，整体下线。删除全部相关模块——风格识别（`16-genre-resolve.js`）、世界注册表/引擎/转场/性能管理（`17-20-*.js`）、八个世界 kit（`02-visual/genre-worlds/`）、世界歌词渲染（`06-lyrics/08-genre-world-lyrics.js`）、模式生命周期与频道控制台（`10-shell/09-genre-mode.js`）、`css/genre-mode.css`、`index.html` 的 `#genre-overlay` 覆盖层、预设网格「风格电台」卡片，以及 7 个 genre 专项测试与 `docs/GENRE_MODE.md`；同步清理主循环 genre 帧门控、胶片电台/涂鸦墙的三方互斥分支（退化为双向互斥）、`preload-mode.js` 预加载类、渲染功耗管理的 genre 视口所有权分支。歌曲元数据中的曲风字段（搜索/本地库/详情页「风格」行）不受影响；遗留的 localStorage 键（`orangesea-genre-mode-v1`/`orangesea-genre-lock-v1`）无代码再读，无需迁移。
- 启动页视频**加载防卡顿**：`#splash-video` 预加载策略由 `preload="auto"` 改为 `metadata`，避免页面解析期整段拉取默认视频（JS 随后可能切换到其他预设造成双份加载）；移除 `loadeddata` 里的同步 Canvas 截帧（`toDataURL` 阻塞启动主线程，唱片封面直接用预生成 poster）；首页壁纸预热推迟到视频元数据就绪后的空闲时机，避免与视频解码争用。

## v1.0.1 - 2026-08-18

- 新增**任务栏缩略图控制按钮**：鼠标悬停任务栏图标时，预览缩略图下方显示「上一首 | 播放/暂停 | 下一首」三枚按钮（同网易云），中间按钮的图标与提示随播放状态自动切换。点击动作复用全局快捷键通道（`mineradio-global-hotkey`），播放执行路径与快捷键/迷你播放器完全一致；播放状态由渲染进程低频轮询、仅在翻转时上报（新增轻量 IPC `mineradio-playback-state`）。图标为 32x32 深棕图形（`desktop/assets/thumbar/`，纯 Node 脚本 `tools/gen-thumbar-icons.js` 生成，可重生成）；窗口重载与 explorer.exe 重启（TaskbarCreated 消息）后自动重设按钮。
- 安装器/卸载器向导全面**控件暗色化**，消灭所有白色区域：输入框（安装目录路径框、卸载反馈页两框）由"米白底"反转为深底米白字并套 Windows 深色主题（边框/滚动条随之变暗）；向导按钮（下一步/取消/卸载/浏览等）由系统白底改为 DarkMode_Explorer 暗色按钮；安装/卸载进度页的白色大面板（1018 rect）与详情区染成深底，进度条去主题后以品牌橙上色；修复完成页"运行 OrangeSea"复选框文字不可见（视觉样式下按钮类控件忽略 SetCtlColors 文字色导致黑字落深底，去主题后恢复）。卸载反馈页联系方式占位提示改为常显橙色标签（cue banner 灰字深底不可读）。技术细节见 `docs/INSTALLER_STYLE.md`「控件暗色化」章节。
- 新增客户端内**问题反馈**功能：标题栏新增对话气泡入口（更新与赞赏按钮之间），DIY 控制台「系统」页新增「问题反馈」分组（搜索"反馈/问题/建议/bug/报告/意见"可命中）。反馈弹窗为日落暖夜风格——类型三选（问题报告/功能建议/其他）、正文与选填联系方式、可取消勾选的「附带诊断信息」；提交经本地服务新增的 `POST /api/feedback` 路由转发至自建反馈服务器（与卸载器共用端点，`app` 字段以 `.inapp` 区分来源），诊断信息（版本、平台、启动错误日志尾部约 1.5KB）由服务端组装、客户端不可篡改；成功时标题区纸飞机轻飞淡出，失败显示原因并提供网页表单兜底。反馈服务器按来源区分邮件主题（「客户端反馈」/「卸载反馈」，已重新部署生效；`install-remote.sh` 内嵌副本同步，防重装回退）。
- 修复 `v1.0.0` tag 触发的 **Build macOS CI 失败**：electron-builder 在 tag 触发的 GitHub Actions 环境会自动尝试发布 GitHub Releases，因项目未配置 repository 字段、发布目标无法解析，导致整个构建退出；显式补 `--publish never`（产物本就只走 artifact 上传）。

## v1.0.0 - 2026-08-18

OrangeSea 第一个正式版。项目自此脱离上游版本序列，以自有版本号发布。

- 新增**赞赏支持**：窗口标题栏新增心形入口（位于更新按钮与 DIY 按钮之间），DIY 控制台「系统」页新增「赞赏支持」分组（搜索"打赏 / 捐赠 / 微信 / 咖啡"等关键词可命中），点开即弹赞赏弹窗——微信收款码白底卡片展示，配文「如果 OrangeSea 陪你多听了一首歌，可以请作者喝杯咖啡」；弹窗复用通用 `openGsapModal` 动效，支持点击背景关闭。README 同步新增「赞赏支持」区块（收款码位于 `docs/assets/support/wechat-qr.png`）。
- 版本号统一为 `1.0.0`：`package.json` 由 `0.1.0` 升至 `1.0.0`（安装器 DisplayVersion 自动跟随）；清除继承自上游的 `v2.0.2` 硬编码残留——更新弹窗静态占位符（`index.html`）、前端更新状态默认值（`01-perf-render-state.js`）、服务端版本兜底值（`server/context.js`）。应用内更新检测保持默认关闭（`mineradio.update.provider: "none"`），README「更新机制」描述与实际行为对齐。

- 启动页新增**内置视频轮换**：内置背景视频从 1 个扩充为 4 个（`splash.mp4` + 新增 `splash-2/3/4.mp4`，均 720p，新视频已去除音轨并 faststart 优化加载，海报自动截帧生成）；DIY 控制台「启动与退出」组新增「内置启动视频」分段切换（随机 / 视频一~四），默认随机——每次启动轮换一个；选择即时生效并持久化（localStorage `orangesea-splash-preset-v1`），自定义 MP4 仍优先于内置选择；任一视频加载失败自动回退到视频一。顺手修复本地静态服务器缺少 `.mp4` MIME（此前以 `text/plain` 返回靠浏览器嗅探播放）。

- 卸载器新增**卸载反馈页**：卸载向导第一页替换为品牌暗色反馈表单（多行「建议/卸载原因」+ 单行「联系方式」，可留空跳过），填写后经系统 PowerShell 静默 POST JSON 到反馈端点，由自建接收器（`tools/uninstall-feedback-server/`，零依赖 Node 单文件，含 QQ 邮箱 SMTP 转发与部署文档）转发至开发者邮箱 1226163446@qq.com；发送失败时询问是否打开网页表单兜底，任何情况不阻塞卸载。端点由 `build/installer.nsh` 的 `MINERADIO_FEEDBACK_ENDPOINT` 控制（默认注释=功能整体关闭，卸载器行为与旧版一致）。用户文本仅经临时文件传递（防 PowerShell 注入），字节级 BOM 判别编码（兼容 GBK/UTF-16），HTTP 强制直连（绕过系统代理），中文实测无乱码；`/S` 静默卸载与升级覆盖安装不弹页。放弃 Formspree（注册依赖 Firebase，国内浏览器易卡）与 formsubmit/web3forms（实测拒绝服务端调用）。

- 壁纸引擎启用时，胶片电台/涂鸦墙现在以壁纸作底：覆盖层背景改为半透明（暖色蒙版保证文字可读），涂鸦墙隐藏自身封面底图，让壁纸透出。
- 性能：胶片电台/涂鸦墙激活时真正暂停 3D 场景的高频渲染。此前仅靠覆盖层视觉遮挡，3D 仍每帧渲染浪费 GPU；现参照 splash 覆盖策略，主循环检测到覆盖层盖住 3D 时降频到约 0.5fps（保持场景温热、退出不卡顿），并跳过节拍分析/粒子模拟，但保留每帧 `analyser.getByteFrequencyData` 采集（胶片电台底部频谱依赖它）。配合壁纸层提至 z-2，3D 粒子既不透出、也不再空转。
- 修复从 3D 预设（如 emily）切到胶片电台/涂鸦墙后，3D 粒子场景从半透明覆盖层透出：壁纸启用时把壁纸层提到 3D 画布之上（z-2），用不透明壁纸盖住粒子。
- 修复壁纸引擎「壁纸媒体不可用」：项目从 Mineradio 改名 OrangeSea 时，渲染进程的壁纸媒体 URL 与 CSP 已改为 `orangesea-wallpaper://`，但主进程协议常量仍是 `mineradio-wallpaper`——请求发到 `orangesea-wallpaper://` 却无处理器接管，video 加载失败；统一为 `orangesea-wallpaper`。
- 修复胶片电台/涂鸦墙模式下点「主页」无法显示主页：`#empty-home` 层级为 z-index 4，低于覆盖层（z-index 5）被盖住；现在这两种模式下主页提升到覆盖层之上显示——**不退出模式**，关掉主页后模式仍保持。
- 重设计听歌报告页：深暖夜底 + 日落橙/琥珀金渐变卡片，站酷小薇衬线体标题与**自动总结句**（如"夜深了还在听——你把安静留给了音乐，「XX」是你的常听歌手。"，按主导时段+本命歌手生成，年度报告风格）；JetBrains Mono 呈现数据；列表行悬停动效；匹配项目风格的细滚动条。
- 修复报告时段分布柱全部等高：嵌套 flex 里百分比高度不可靠，改为 JS 直接计算像素高度（0/6/12/18 时刻标注）。
- 播放日历格子悬停显示自定义提示（日期 + 次数），悬停微放大描边。
- 「查看偏好」改为独立设计的**音乐画像**弹窗：画像标签（深夜电台 DJ / 清晨追光者等，按常听时段生成）、本命歌手、常听曲目、聆听总量、常听时段、平台足迹。
- 修复点击年度/月度听歌报告报错：报告弹窗 HTML 使用的 `escapeHtmlSafe` 此前仅存在于测试沙箱，应用内未定义，点击即抛 ReferenceError；在报告模块内补齐该转义函数。
- 修复听歌报告点击"无反应"：`openListenReport` 创建的 `.modal-mask` 未加 `.show` 类（该类默认 `display:none`），弹窗实际已挂载但不可见；补上后正常弹出。
- 重做胶片电台布局：右侧主区改为**热门评论卡片**（复用平台评论接口，切歌自动重载，含载入/暂无/失败三态），歌词收为标题下的**当前一行**（暖金单行跟随）；删除胶片电台内的重复控制按钮（喜欢/上一首/播放/下一首/播放顺序），播放操作统一走底部控制栏，仅保留细进度条；底部频谱铺满整宽（柱数 24→48）；覆盖层改为铺满全屏（`bottom:0`），修复底部 3D 场景/预设透出。
- 胶片电台评论支持**无限滚动分页**：qq/网易按 `offset`、汽水按 `cursor` 逐页追加，滚动到底部自动加载，加载完自动停止；切歌重置分页。
- 修复迷你播放器关闭按钮无响应 / 无法拖拽：关闭按钮元素只有 `class="mp-close"` 而无 `id="mp-close"`，脚本用 `getElementById('mp-close')` 取到 `null`，`.addEventListener` 抛出未捕获 TypeError 并中断整个脚本，导致关闭按钮及排在它后面的拖拽逻辑全部失效；补上 `id` 后脚本正常执行。同时改用 JS 拖拽（参照桌面歌词 `move-by`），彻底弃用 CSS `-webkit-app-region` 拖拽区——body 上的 `backdrop-filter` 会破坏 no-drag 穿透，曾导致按钮点不动。
- 修复迷你播放器播放/上一首/下一首按钮无反应，以及关闭后底部「迷你播放器」按钮仍显示激活：`mini-player-runtime.js` 是独立模块，读不到 main.js 模块级 `mainWindow`，导致转发控制动作（`forwardMiniPlayerAction`）与回传开关状态（`broadcastMiniPlayerEnabledState`）双双静默失效；改为由 main.js 注入 `setMainWindowGetter(() => mainWindow)` 闭包。
- 修复切换到「胶片电台」「涂鸦墙」时原视觉预设卡片仍显示激活（两个预设同亮）：`refreshPresetGrid` 在胶片电台/涂鸦墙激活时不再给常规预设卡片加 active 态。
- 修复「星河 → 涂鸦墙/胶片电台 → 再点星河」切不回去（但能切到别的预设）：`setPreset` 退出特殊模式的条件原为 `changed`，预设号未变时不触发；改为 `!opts.silent`，只要用户主动点常规预设（非 silent 恢复）且特殊模式在激活即退出。
- 修复主窗口退出后迷你播放器悬浮残留：迷你播放器此前未纳入主窗口关闭清理，作为存活窗口阻止了 `window-all-closed` 触发，导致应用无法退出；`closeOverlayWindows` 现一并关闭迷你播放器。
- 修复均衡器、睡眠定时器弹层点击外部不自动收起：补齐与音量/音质/mini 队列弹层一致的 document 点击外部关闭监听。
- 桌面歌词新增底部控制条入口按钮（紧邻迷你播放器），状态随开关实时同步；原 `Alt+L` 快捷键与 DIY 视觉控制台入口保留。
- 歌曲下载新增歌词落盘：下载音频时自动从对应平台取词，写同名 `.lrc` 文件（含译文按时间戳交错），mp3 额外嵌入 USLT 歌词帧（flac/m4a/ogg 等仅 `.lrc`）；取词失败不阻断下载，元数据 `.osdownload.json` 新增 `hasLyric`/`lyricFile`/`lyricEmbedded` 字段。
- 修复听歌报告热力图缺陷：`buildListenReport` 已聚合的 `dayHeatmap` 此前未渲染，现补上「播放日历」方格热力图（月度 35 天 / 年度 84 天，按播放次数分 4 档着色），并修正时段分布标题。
- 重做「演唱会现场」视觉预设（Preset 8）：荧光棒人海从静态光点升级为随节奏挥舞的阶梯看台人群，低音加大挥幅、鼓点集体高举、LED 腕带色浪逐排滚动；舞台打光系统从 3 道细光柱升级为 5 道扫动聚光灯（暖白核心 + 金边光晕双层）、顶部灯架光晕、舞台地坪反光、鼓点全场地频闪。
- 移除登录彩蛋门禁：右上角点击头像直接打开登录面板，不再需要多次点击与输入解锁口令。
- 胶片电台重做为视觉预设模式：不再使用全屏覆盖层，去掉右上角关闭按钮，与普通视觉预设一致通过 DIY 控制台卡片切换；进入时保留底部播放控制栏与 DIY 控制台，选择其他预设或再次点击卡片即退出。
- 胶片电台左侧为方形专辑封面下压圆形转动黑胶（播放时旋转、暂停停转），右侧歌词区当前行居中显示；覆盖层背景改为不透明，避免 Electron 下 3D 场景透出遮挡歌词。

## v2.0.2

- 修复 QQ 会员状态识别与登录同步。
- 修复无可用音源时反复切换导致的卡顿与闪退。
- 提升连续播放、异常恢复与账号状态提示的稳定性。

## v2.0.1

- 修正部分账号状态识别。
- 改进汽水音乐本地登录态检测。
- 修正首次主题色与 3D 歌单架显示层级。
- 提升播放与启动稳定性。

## v2.0.0

- 全面优化视觉层次与动态表现，整体观感更统一。
- 桌面模式与全屏交互更自然，桌面使用体验更完整。
- 重整主页与搜索体验，推荐、历史和长列表浏览更顺手。
- 修复连续播放与切歌稳定性问题，并优化启动和后台性能。

## v1.1.1

- P0 installer safety fix: installation now defaults to the first available non-C drive from `D:\Mineradio` through `Z:\Mineradio`; it falls back to `C:\Mineradio` only when no D-Z drive exists.
- The installer now forces the target path into a dedicated `Mineradio` folder, blocks non-empty non-Mineradio-owned targets, and blocks C drive installs when a D-Z drive is available.
- Existing registered installs in a dedicated `...\Mineradio` folder are adopted in place so users can run the new setup over their current installation and receive the safe uninstaller.
- Existing dedicated `...\Mineradio` folders that already contain Mineradio files can be overwritten even if they were created before the new safety marker existed.
- The new uninstaller no longer removes the whole installation root or app subfolders recursively; it deletes only known top-level Mineradio/Electron files and leaves unrelated files in place.
- Legacy uninstallers without the new safety marker are skipped during install; the setup deletes only the old `Uninstall Mineradio.exe` file and registry entry so it cannot indirectly trigger an older unsafe uninstall routine.
- Installer/uninstaller safety fixes require the full setup package; quick patch JSON files must not be used as the only delivery path for this issue.

## v1.1.0

- 纯净安装发布版：从当前 `resources/app` 可信源码重新构建 1.1.0 安装包，旧打包产物、旧备份包和旧安装包不再作为发布来源。
- 重要安全说明：`v1.0.10` 及更早旧安装包不再建议继续安装或传播，请先隔离旧安装包；本次不提供从 `v1.0.10` 到 `v1.1.0` 的软件内本地更新，请到 GitHub Release 手动下载 `v1.1.0` 进行纯净安装。
- 默认视觉参数更新：将 `默认测试.json` 作为首次启动默认用户存档和软件内视觉参数默认值；新用户首次启动即使用同一份快照，用户存档中自动预置「默认测试」。
- 默认视觉快照包括：`emily` 视觉预设、封面粒子分辨率 `1.55`、电影镜头强度 `0.5`、歌词发光 `0.28`、高亮色 `#fac900`、发光色 `#008aff`、UI/Home/视觉图标白色、3D 歌单架静态常驻、播客歌单默认关闭、侧向角度 `-15`。
- 3D 歌单架新增内容开关：可关闭播客歌单，可选择是否把「我的歌单」与「收藏歌单」合并成一条连续滚动列表。
- 3D 歌单架交互修复：动态/静态详情页绑定分流，静态详情页跟随封面粒子世界轴，动态详情页跟随镜头；常驻歌单架未命中时不再长期挡歌词，命中卡片时才浮起到前景。
- 3D 歌单详情页修复：详情页打开后保持更完整的页面显示和中心高亮行；修复固定/常驻状态下详情页被歌词或卡片遮挡、动态镜头触发区异常、滚轮高亮不同步等问题。
- 歌词透明度修复：详情页选歌/切歌时新词不再突然跳亮；详情页打开时歌词保持可读，但降低发光层并保持在详情页下层，避免遮挡中心高亮行。
- 高级设置新增性能项：后台策略支持自动优化、保持运行、停止释放；画质档位支持低/中/高/超高；直播后台保持开启后不再进入低占用暂停。
- 用户存档修复：应用用户视觉存档后会提交播放态视觉预设，跳转歌曲、切歌不再回退到上一个视觉预设。
- 全屏/控制台修复：视觉预设热键按钮不再被全屏 DIY 悬浮入口遮挡；视觉控制台隐藏按钮会跟随一起隐藏，不再残留一个孤立标记。
- 更新 Electron / electron-builder 依赖，修复已知高风险构建依赖告警。
- 修复软件内更新失败后的循环体验：快速补丁失败后不再自动反复拉完整安装包，完整安装包下载完成后也不再自动打开，需用户手动确认。
- 更新下载会复用本地已校验通过的安装包，避免重复下载同一文件。

## v1.0.10

- 重做桌面歌词视觉与交互：保持软件内歌词质感，优化白底可读性、长歌词滚动、锁定穿透、电影震动与最小化状态一致性。
- 修复安魂预设歌词位置无法调整的问题，当前嘴部歌词原位置作为原点，景深改为按视角前后移动。
- 歌词布局新增上下角度与左右角度调节，并会随本地布局和用户存档保存。
- 歌词镜头绑定开启时避让右侧 3D 歌单架，安魂预设也同步处理，避免遮挡歌单架操作。
- 新增方向键上下调节音量，每次 5%，输入框和滑条聚焦时不会误触。
- 调整更新包规则：补丁包命名使用 `旧版本→新版本` 表达，且以后只为低于新版的最近 4 个版本生成快速补丁。

## v1.0.9

- 修复安装包深色界面中部分文字仍为黑色导致看不清的问题，安装器改为浅色高对比界面。
- 安装包支持用户自由选择安装目录；默认仍优先 `D:\Mineradio`，选择盘根目录时会自动补全 `Mineradio` 文件夹。
- 修复软件可重复打开的问题，重复启动时会聚焦当前已运行的窗口。
- 修复软件每次启动都会自动创建/刷新桌面快捷方式的问题。

## v1.0.8

- 修复 QQ 音乐登录后头像/昵称与播放授权状态不同步的问题，歌单能读但歌曲无法播放时会优先识别真实播放票据缺失。
- Home 左侧大卡片改为施工提示，并支持在 Home 页手动展开播放器控制台。
- 视觉预设顺序调整为 emily、安魂、星河、唱片、星球、滚筒、虚空；安魂十字架选中态保持同款蓝色。
- 视觉控制台新增 4 个槽位的“用户存档”，可保存粒子、颜色、滑条和歌词外观习惯，并支持卡片内直接命名。
- 修复重启后歌词预设/自定义颜色没有立即恢复到舞台歌词的问题。
- 播放与暂停增加音频淡入淡出，降低手动启停时的突兀感。

## v1.0.7

- 反正没什么人看，布想写日志了

## v1.0.6

- 反正没什么人看，布想写日志了

## v1.0.5

- 优化 GitHub 更新下载：默认优先尝试国内加速线路，失败后自动切换下一条线路，最后兜底 GitHub 直连。
- 更新弹窗新增下载速度、已下载大小、预计剩余时间、当前线路和线路尝试次数显示。
- 更新失败时保留具体失败原因和已尝试线路数量，方便用户判断是超时、DNS、HTTP、校验失败还是资源未同步。
- 下载完整安装包和快速补丁都会校验 release digest，避免镜像缓存异常导致坏包被应用。
- 修复旧版本快速补丁匹配过宽的问题，确保 `1.0.0`、`1.0.1`、`1.0.2`、`1.0.3` 只会匹配各自对应的补丁包。

## v1.0.4

- 优化最小化/隐藏窗口时的后台占用：只有真正最小化、不可见或文档隐藏时进入深度低占用；可见但失焦、副屏显示时保持正常帧率和电影镜头。
- 修复桌面全屏模式下 3D 视觉画布尺寸不同步导致的裁切/偏上问题；全屏、退出全屏和窗口 resize 后会连续刷新主渲染视口。
- 优化播放器控制台自动隐藏时的残影：隐藏状态不再保留玻璃背景、滤镜和阴影，同时保留显示时的原有玻璃质感。
- 视觉控制台新增“控制台玻璃色差”滑条，并给视觉控制台悬浮按钮增加贴边自动隐藏按钮。
- 左侧“我的歌单”详情页改为分批加载更多歌曲，放大“加载更多”按钮，详情头部支持滚动置顶和回到顶部。
- 沉浸模式恢复左侧歌单栏、3D 歌单架和默认封面渐变背景的可用性。

## v1.0.3

- 重构视觉预设控制台的信息结构，新增 `预设 / 外观 / 歌词 / 动态 / 高级` 五个分区，减少功能堆叠带来的操作压力。
- 优化色轮和封面取色面板的自适应定位，弹层会贴近触发按钮并限制在当前窗口内，降低不同分辨率下错位或越界的概率。
- 修复背景颜色状态混淆问题：纯黑色现在代表真正的黑色背景，封面渐变改为独立模式，控制台会明确显示“封面渐变”。
- 保留并优化根据专辑封面生成背景渐变的功能，避免点击默认时才触发、左侧色块却显示黑色的误导。

## v1.0.2

- Add collect-to-playlist and play-next actions to artist detail songs.
- Publish quick patches for `1.0.1 -> 1.0.2` and `1.0.0 -> 1.0.2`, plus a full installer for cross-version upgrades.

## v1.0.1

- Smooth Emily visual loading and track-change transitions.
- Remove the forced loading-state jump, shorten the Emily cover color mix, and fade cover depth in gradually.
- Publish a `1.0.0 -> 1.0.1` quick patch so installed users can receive an update prompt.

## v1.0.0

- 调整播放器控制台显隐规则：播放、切歌、天气电台开播不再主动弹出底部控制台；只有底部手柄/热区唤出时显示，鼠标移出热区后快速收起。
- 修复播放器控制台进度条不随播放推进的问题：进度条和时间显示现在会优先使用真实音频时长，并在浏览器暂未返回 duration 时使用歌曲 metadata 兜底。
- 修复网易云 / QQ 扫码成功但登录态不落地的问题：网易云不再因资料接口短暂无 profile 立刻清空 cookie，QQ 登录支持新式 `psrf_*` / `wx*` token。
- 修复播放/暂停按钮手动恢复播放失效：手动点击路径现在会在用户点击同步栈内先调用 `audio.play()`，再恢复音频分析器，避免错过浏览器用户激活窗口。
- 修复播放准备阶段的栈溢出会拖死控制台的问题：歌词预置、封面加载、喜欢状态、Home 状态、listen session 和 beatmap / DJ 视觉预热均改为隔离执行，任何非音频链路异常不再阻断真实切歌。
- `playQueueAt` 增加播放阶段日志；若后续仍出现异常，控制台会标明 `source-url`、`visual-prep`、`audio-start` 等阶段，界面不再直接弹出 `Maximum call stack size exceeded`。
- 单曲循环的 `ended` 回调改为异步再入，避免浏览器在音频结束事件中同步重进 `playQueueAt` 引发递归风险。
- 修复天气电台 / 歌单播放链路的控制台递归风险：不再运行时重写播放、上一首、下一首按钮的 `onclick`，避免 `Maximum call stack size exceeded`。
- 切歌开始时立即刷新队列高亮和迷你队列计数；即使浏览器拦截自动播放，标题、时长、队列当前项也保持同步。
- Home 天气电台主按钮和天气卡片统一到同一启动入口，并增加启动 busy 锁，避免重复点击并发开播。
- 修复右键唤起 3D 歌单架时误唤出播放器控制台：歌单架打开期间会硬隐藏底部控制台，并阻止热区/播放态 reveal。

- 隔离 3D 歌单架刷新/关闭异常：歌单 API 成功后不再因为 shelf 重建或 3D 详情列表绘制失败而误报“歌单加载失败”。
- 天气电台、歌单、播客、每日推荐和 3D 详情播放入口统一使用安全队列刷新；队列写入后播放器控制台会恢复可点击，不再被 UI 渲染异常拖死。
- 恢复歌单 / 天气电台自动开播为非 manual 路径，并将 `playQueueAt` 前置 UI 阶段纳入兜底，避免队列标题已变但实际音频和上下一首按钮停在旧状态。
- 天气电台音乐来源收窄为网易云搜索，并取消入队前批量播放 URL 探测，避免点击入口时请求堆积造成卡死。
- 天气电台前端复用正在进行的天气加载请求，避免 Home 后台预加载和手动启动同时打到后端。
- 自动播放被系统拦截时，播放器控制台保持可点击并提示手动继续；真正加载失败的队列项会自动跳到下一首。
- 手动下一首 / 上一首现在一定切换实际音频；单曲循环只在自然播完时重复当前曲。
- 切歌开始时立即暂停旧音频，避免出现歌词和 UI 已切走但旧歌还在播的错位。
- 修复天气电台城市经纬度缺失时落到 `(0,0)` 的问题，并在 Open-Meteo 超时/失败时返回临时电台队列。
- 歌单曲目加载增加 `playlist_track_all -> playlist_detail` 降级，减少歌单加载失败。
- 播放队列写入后强制恢复底部控制台可交互状态，避免天气电台或歌单开播后控制台残留不可点击。
- 启动页退出后补 Home 恢复安全网，避免首页隐藏在空场背景后。

- 发布 Mineradio 首个正式版本，GitHub 主页和安装包版本统一为 `1.0.0`。
- 首页正式版包含天气电台、每日推荐、私人电台、继续听、听歌画像和我的歌单入口。
- 天气电台接入 Open-Meteo，并优先混入每日推荐和私人推荐曲库，过滤 AI / 白噪音 / 雨声助眠等低质结果。
- 修复窗口模式下主页 6 张主卡片在紧凑尺寸中过早堆叠、挤出首屏的问题。
- 保持启动后 Wallpaper 银河背景干净显示，播放后切换到 Emily / 默认播放态视觉。

## v0.9.13

- 开场动画升级为 WebGL 光流线场，融合 `ShipSwiftAnimatedLoop` 的 RGB 分通道、Warp 流动和高亮线场质感。
- 移除刻意的环形/花瓣式爆点，改为更自然的斜向流线相位变化，让启动过程更帅气但不突兀。
- 开场动画播放完成后不再自动进入主页，会停留在“点击进入”状态；点击任意位置或按 Enter/空格后进入 Home。
- 保留 2D canvas fallback，WebGL 不可用时仍能显示启动页。
- 生成 `0.9.12 -> 0.9.13` 快速补丁，用于已安装用户轻量更新。

## v0.9.9

- 统一当前版本号为 `0.9.9`
- 接入 GitHub Releases 更新检测配置
- 增加更新弹窗与更新下载任务接口
- 增加 QQ 音乐与网易云音乐双平台体验方向
- 优化电影镜头节奏分析与 DJ 视觉模式
- 增加自定义封面、自定义歌词、歌词布局和视觉控制相关能力

## 说明

这是首次公开发布前的整理版本。更早版本属于本地迭代记录，暂不展开。
