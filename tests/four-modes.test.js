'use strict';
/* 四新模式（镜台/商籁/凝彩/绘光）：覆盖层范式完整性与纯函数行为。
   vm 沙箱逐个加载模块，断言生命周期函数存在、序列/构图纯函数确定性与范围。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..', 'public', 'js', 'modules', '10-shell');

function loadSandbox(file) {
  const sandbox = {
    console,
    readBooleanPreference() { return false; },
    saveBooleanPreference() { },
    showToast() { },
    scheduleUiWarmTask() { return 0; },
    setTimeout() { return 0; },
    clearTimeout() { },
    cancelAnimationFrame() { },
    requestAnimationFrame() { return 0; },
    performance: { now: () => 0 },
    getAdjustedLyricPlaybackTime(t) { return t; },
    themeServiceActiveTheme() { return null; },
    themeOverlayDarkTheme() { return null; },
    document: {
      getElementById() { return null; },
      createElement() { return { style: {}, dataset: {}, classList: { toggle() { }, add() { }, remove() { } }, querySelectorAll() { return []; } }; },
      body: { classList: { toggle() { } } },
    },
    window: { innerWidth: 1280, innerHeight: 800, addEventListener() { } },
    lyricsLines: [],
  };
  sandbox.window = Object.assign(sandbox.window || {}, { currentIdx: -1 });
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), sandbox, { filename: file });
  return sandbox;
}

/* ---------- 镜台（Diorama）——原版引擎桥（渲染核心在 10-shell-diorama-engine，
   three.js 0.185 命令式宿主；此处验证桥契约与数据形状） ---------- */
{
  const s = loadSandbox('25-diorama.js');
  assert.equal(typeof s.applyDioramaMode, 'function');
  assert.equal(typeof s.toggleDioramaMode, 'function');
  assert.equal(s.dioramaMode, false);
  // 数据形状：lyricsLines → Folia Line（fullText/startTime/endTime/words 时间形状）
  s.lyricsLines = [
    { text: '橘色的光', t: 10, duration: 3, words: [{ text: '橘', t: 10, d: 0.3 }, { text: '色', t: 10.3, d: 0.3 }], translation: 'Orange', isChorus: true },
    { text: '落在窗台', t: 13.5, duration: 0 },
  ];
  const lines1 = s.dioramaToLines();
  assert.equal(lines1.length, 2);
  assert.equal(lines1[0].fullText, '橘色的光');
  assert.equal(lines1[0].startTime, 10);
  assert.equal(lines1[0].endTime, 13);
  assert.equal(lines1[0].isChorus, true);
  assert.equal(lines1[0].words.length, 2);
  assert.equal(lines1[0].words[0].startTime, 10);
  assert.equal(lines1[0].words[0].endTime, 10.3);
  assert.equal(lines1[1].endTime, 13.5 + 4, '无 duration 且无下一行 → 回退 4s');
  // 引用稳定：同内容重复转换 → 同一数组（引擎 lyricsChanged 按引用比较，防 700ms 轮询重建走廊）
  assert.equal(s.dioramaToLines(), lines1);
  // 歌曲标识：无标题/歌手 DOM 时回退歌词内容签名
  assert.equal(s.dioramaSongSeed(), 'lyrics:2:10');
  // 频带 MV：Folia 契约 0..255（缺信号安全回退 0，不产生 NaN）
  assert.equal(s.dioramaBands.bass.get(), 0);
  assert.equal(s.dioramaBands.treble.get(), 0);
  assert.equal(s.dioramaPowerMV.get(), 0);
  // 时间 MV：走 getAdjustedLyricPlaybackTime
  assert.equal(s.dioramaTimeMV.get(), 0);
}

/* ---------- 商籁（Sonnet） ---------- */
{
  const s = loadSandbox('26-sonnet.js');
  assert.equal(typeof s.applySonnetMode, 'function');
  assert.equal(typeof s.toggleSonnetMode, 'function');
  // 手稿堆样式：当前行无位移满字号；距离越远越小越暗，blur 递增
  const active = s.sonnetRowStyle(0, 3);
  assert.ok(active.transform.includes('scale(1.000)'));
  assert.equal(active.opacity, '1.000');
  const d1 = s.sonnetRowStyle(1, 4);
  const d3 = s.sonnetRowStyle(3, 6);
  assert.ok(parseFloat(d1.opacity) > parseFloat(d3.opacity));
  assert.ok(parseFloat(d1.filter.match(/blur\(([\d.]+)px\)/)[1]) < parseFloat(d3.filter.match(/blur\(([\d.]+)px\)/)[1]));
  // 行索引种子确定性
  assert.deepEqual(s.sonnetRowStyle(2, 7), s.sonnetRowStyle(2, 7));
  // 栈深 7
  assert.equal(s.SONNET_STACK_DEPTH, 7);
  // 底部字幕层（pixi 模式接管原版 VisualizerSubtitleOverlay 宿主职责）
  assert.equal(typeof s.sonnetSubtitleUpdate, 'function');
  assert.equal(typeof s.sonnetSubtitleClear, 'function');
  assert.equal(s.sonnetSubtitleReadable('//'), false, '纯占位行不可读（原版 hasReadableText 语义）');
  assert.equal(s.sonnetSubtitleReadable('潮水漫过旧站台'), true);
}

/* ---------- 商籁 Pixi 引擎桥（26a）——Theme/Lines 数据形状契约 ---------- */
{
  const b = loadSandbox('26a-sonnet-pixi-bridge.js');
  // Lines 形状：lyricsLines → Folia Line（fullText/startTime/endTime/words 时间形状）
  b.lyricsLines = [
    { text: '橘色的光', t: 10, duration: 3, words: [{ text: '橘', t: 10, d: 0.3 }, { text: '色', t: 10.3, d: 0.3 }], translation: 'Orange', isChorus: true },
    { text: '落在窗台', t: 13.5, duration: 0 },
  ];
  const sl = b.sonnetPixiToLines();
  assert.equal(sl.length, 2);
  assert.equal(sl[0].fullText, '橘色', 'fullText = 逐词文本拼接（words 覆盖多少拼多少）');
  assert.equal(sl[0].startTime, 10);
  assert.equal(sl[0].endTime, 13);
  assert.equal(sl[0].words.length, 2);
  assert.equal(sl[0].words[0].endTime, 10.3);
  assert.equal(sl[0].translation, 'Orange');
  assert.equal(sl[0].isChorus, true);
  assert.equal(sl[1].endTime, 13.5 + 2, '无 duration 回退 2s');
  assert.equal(sl[1].words.length, 1, '无 words 整行成单 word');
  // 字体栈：CSS stack 字符串 → 字体族名数组。原版 Theme.fontFamilyStack 是
  // string[]（folia types.ts:97）；整串传入会被引擎逐字符展开拆碎成
  // "I","n","t"... → canvas font 无效 → 全部字形回退 10px（大字变小字根因）
  assert.equal(
    JSON.stringify(b.sonnetPixiFontStackToArray('"PingFang SC", "Microsoft YaHei UI", system-ui, sans-serif')),
    JSON.stringify(['PingFang SC', 'Microsoft YaHei UI', 'system-ui', 'sans-serif']),
    '引号族名/裸族名混合栈逐项拆分',
  );
  assert.equal(
    JSON.stringify(b.sonnetPixiFontStackToArray(['Inter', 'Noto Sans CJK SC'])),
    JSON.stringify(['Inter', 'Noto Sans CJK SC']),
    '数组输入原样拷贝',
  );
  // Theme 形状：fontFamilyStack 必须是数组且族名不带引号；回退主题为原版午夜冷黑
  const th = b.sonnetPixiTheme();
  assert.ok(Array.isArray(th.fontFamilyStack), 'fontFamilyStack 必须是数组（引擎逐项展开契约）');
  assert.ok(th.fontFamilyStack.length >= 2, '字体栈至少 2 级回退');
  assert.ok(th.fontFamilyStack.every((f) => !/["']/.test(f)), '族名不得携带引号（引擎 formatFontFamily 会统一加）');
  assert.equal(typeof th.name, 'string');
  assert.ok(th.name.length > 0, 'Theme.name 必填（竖排 THEME 装饰字依赖）');
  assert.equal(th.animationIntensity, 'normal');
  assert.equal(th.backgroundColor, '#09090b', '回退背景 = 原版 Midnight Default 冷黑（baseThemes.ts:11）');
  assert.equal(th.fontStyle, 'sans');
  // MotionValue duck-type 契约
  assert.equal(b.sonnetPixiMV(() => 3).get(), 3);
  // tuning：外框 full（竖排 THEME/desc 元数据依赖）
  assert.equal(b.SONNET_PIXI_TUNING.outerFrameMode, 'full');
}

/* ---------- 商籁引擎产物（10-shell-sonnet-engine/sonnet-engine.js） ---------- */
{
  const engineSrc = fs.readFileSync(path.join(dir, '..', '10-shell-sonnet-engine', 'sonnet-engine.js'), 'utf8');
  // 无构建导出协议：宿主桥经全局符号取运行时/编译器
  assert.ok(engineSrc.includes('env.SonnetPixiRuntime'), 'engine must export SonnetPixiRuntime');
  assert.ok(engineSrc.includes('env.compileSonnetProgram'), 'engine must export compileSonnetProgram');
  // 原版数组契约不被“兼容字符串”式改动偏离（folia utils/fontStacks.ts:83 同构）
  assert.ok(engineSrc.includes('theme.fontFamilyStack ?? []'), 'engine keeps folia array-contract for fontFamilyStack');
}

/* ---------- 凝彩（Tempera） ---------- */
{
  const s = loadSandbox('27-tempera.js');
  assert.equal(typeof s.applyTemperaMode, 'function');
  assert.equal(typeof s.toggleTemperaMode, 'function');
  // 构图库：5 种构图，每种 5~7 块，形状合法
  assert.equal(s.TEMPERA_COMPOSITIONS.length, 5);
  const shapes = new Set();
  for (const comp of s.TEMPERA_COMPOSITIONS) {
    assert.ok(comp.length >= 5 && comp.length <= 7);
    for (const b of comp) {
      assert.ok(['circle', 'rect', 'band', 'ring'].includes(b.shape));
      assert.ok(b.size > 0 && b.size <= 160);
      assert.ok(b.dur > 0);
      shapes.add(b.shape);
    }
  }
  assert.ok(shapes.has('circle') && shapes.has('band'));
  // 色板：主题三色派生 6 色，颜色格式合法
  const palette = s.temperaPalette();
  assert.equal(palette.length, 6);
  for (const c of palette) assert.ok(/^(rgb\(|#)/.test(c), 'bad color ' + c);
  // 种子哈希稳定
  assert.equal(s.temperaHashString('song-a'), s.temperaHashString('song-a'));
  // 底部字幕层（pixi 模式接管原版 VisualizerSubtitleOverlay 宿主职责；此前引擎
  // 模式下翻译层被 pixi-on 强隐且引擎不渲染 → 整体缺失）
  assert.equal(typeof s.temperaSubtitleUpdate, 'function');
  assert.equal(typeof s.temperaSubtitleClear, 'function');
  assert.equal(s.temperaSubtitleReadable('//'), false, '纯占位行不可读（原版 hasReadableText 语义）');
  assert.equal(s.temperaSubtitleReadable('潮水漫过旧站台'), true);
}

/* ---------- 凝彩 Pixi 引擎桥（27a）——Theme/Lines 数据形状契约 ---------- */
{
  const b = loadSandbox('27a-tempera-pixi-bridge.js');
  // Lines 形状：lyricsLines → Folia Line（fullText/startTime/endTime/words 时间形状）
  b.lyricsLines = [
    { text: '橘色的光', t: 10, duration: 3, words: [{ text: '橘', t: 10, d: 0.3 }, { text: '色', t: 10.3, d: 0.3 }], translation: 'Orange', isChorus: true },
    { text: '落在窗台', t: 13.5, duration: 0 },
    { text: '占位', t: 16, duration: 2, fallback: true },
  ];
  const tl = b.temperaPixiToLines();
  assert.equal(tl.length, 2, 'fallback 占位行必须被剔除');
  assert.equal(tl[0].fullText, '橘色', 'fullText = 逐词文本拼接（words 覆盖多少拼多少）');
  assert.equal(tl[0].startTime, 10);
  assert.equal(tl[0].endTime, 13);
  assert.equal(tl[0].words.length, 2);
  assert.equal(tl[0].words[0].startTime, 10);
  assert.equal(tl[0].words[0].endTime, 10.3);
  assert.equal(tl[0].translation, 'Orange');
  assert.equal(tl[0].isChorus, true);
  assert.equal(tl[1].endTime, 13.5 + 2, '无 duration 回退 2s');
  assert.equal(tl[1].words.length, 1, '无 words 整行成单 word');
  // 字体栈：CSS stack 字符串 → 字体族名数组（与 26a 同款契约）
  assert.equal(
    JSON.stringify(b.temperaPixiFontStackToArray('"PingFang SC", "Microsoft YaHei UI", system-ui, sans-serif')),
    JSON.stringify(['PingFang SC', 'Microsoft YaHei UI', 'system-ui', 'sans-serif']),
    '引号族名/裸族名混合栈逐项拆分',
  );
  assert.equal(
    JSON.stringify(b.temperaPixiFontStackToArray(['Inter', 'Noto Sans CJK SC'])),
    JSON.stringify(['Inter', 'Noto Sans CJK SC']),
    '数组输入原样拷贝',
  );
  assert.equal(JSON.stringify(b.temperaPixiFontStackToArray('')), '[]', '空栈 → 空数组');
  // Theme 形状：fontFamilyStack 必须是数组且族名不带引号（引擎 buildCustomFontFamilyStack
  // 对它做 ...(theme.fontFamilyStack ?? []) 逐项展开——整串传入会被逐字符拆碎）
  const th = b.temperaPixiTheme();
  assert.ok(Array.isArray(th.fontFamilyStack), 'fontFamilyStack 必须是数组（引擎逐项展开契约）');
  assert.ok(th.fontFamilyStack.length >= 2, '字体栈至少 2 级回退');
  assert.ok(th.fontFamilyStack.every((f) => !/["']/.test(f)), '族名不得携带引号（引擎 formatFontFamily 会统一加）');
  assert.equal(th.fontStyle, 'sans');
  assert.equal(th.fontWeight, 700);
  // MotionValue duck-type 契约
  assert.equal(b.temperaPixiMV(() => 3).get(), 3);
  // tuning 基线：双色调色 + 色块/装饰开启（凝彩剪纸视觉主体）
  assert.equal(b.TEMPERA_PIXI_TUNING.colorMode, 'duo');
  assert.equal(b.TEMPERA_PIXI_TUNING.showBlocks, true);
  assert.equal(b.TEMPERA_PIXI_TUNING.showDecor, true);
}

/* ---------- 凝彩引擎产物（10-shell-sonnet-engine/tempera-engine.js） ---------- */
{
  const engineSrc = fs.readFileSync(path.join(dir, '..', '10-shell-sonnet-engine', 'tempera-engine.js'), 'utf8');
  // 无构建导出协议：宿主桥经全局符号取运行时/编译器
  assert.ok(engineSrc.includes('env.TemperaPixiRuntime'), 'engine must export TemperaPixiRuntime');
  assert.ok(engineSrc.includes('env.compileTemperaProgram'), 'engine must export compileTemperaProgram');
  // 原版数组契约不被“兼容字符串”式改动偏离（tempera-engine.js:5704 同 26a 防线）
  assert.ok(engineSrc.includes('theme.fontFamilyStack ?? []'), 'engine keeps folia array-contract for fontFamilyStack');
}

/* ---------- 绘光（Lumiere） ---------- */
{
  const s = loadSandbox('28-lumiere.js');
  assert.equal(typeof s.applyLumiereMode, 'function');
  assert.equal(typeof s.toggleLumiereMode, 'function');
  // 光丝场构建：4 丝 + 42 尘
  s.lumiereBuildStrands();
  assert.equal(s.lumiereStrands.length, 4);
  assert.equal(s.lumiereMotes.length, 42);
  for (const st of s.lumiereStrands) {
    assert.ok(st.y0 > 0 && st.y0 < 1);
    assert.ok(st.amp > 0 && st.amp < 0.2);
    assert.ok(st.dots >= 6 && st.dots <= 10);
  }
  // 光丝 y 计算有界（屏幕比例内）
  for (let t = 0; t < 10; t += 0.7) {
    for (const st of s.lumiereStrands) {
      for (let x = 0; x <= 1.0001; x += 0.2) {
        const y = s.lumiereStrandY(st, x, t);
        assert.ok(isFinite(y) && y > -1 && y < 2, 'strand y out of range: ' + y);
      }
    }
  }
  // 主题跟随
  s.themeServiceActiveTheme = () => ({ primaryColor: '#112233', accentColor: '#ffc998', secondaryColor: '#8fb3d9' });
s.themeOverlayDarkTheme = s.themeServiceActiveTheme;
  s.lumiereSyncTheme();
  assert.equal(s.lumiereTheme.primary, '#112233');
}

/* ---------- 绘光引擎产物（10-shell-sonnet-engine/lumiere-engine.js） ---------- */
{
  const engineSrc = fs.readFileSync(path.join(dir, '..', '10-shell-sonnet-engine', 'lumiere-engine.js'), 'utf8');
  // 无构建导出协议：宿主桥经全局符号取运行时/编译器
  assert.ok(engineSrc.includes('env.LumierePixiRuntime'), 'engine must export LumierePixiRuntime');
  assert.ok(engineSrc.includes('env.compileLumiereProgram'), 'engine must export compileLumiereProgram');
  // 原版入口不被剥离（folia createLumierePixiRuntime.ts 同构：swapSong 交叉渐变
  // 换歌、setSongMetadata 驱动片尾卡 credits 重建）
  assert.ok(engineSrc.includes('swapSong(next, signal)'), 'engine keeps folia swapSong hot-swap entry');
  assert.ok(engineSrc.includes('setSongMetadata(metadata)'), 'engine keeps folia setSongMetadata (credits rebuild)');
  // 移植管线回归防线：rich-inline 具名导入必须解构 pretext（曾因 NAMED 垫片模板
  // 丢花括号展开成 var a,b,c = pretext → prepareRichInline undefined，首次建场景
  // 即抛错 → 引擎静默降级 DOM 版，2026-10-11 真机事故）
  assert.ok(/\{[^}]*prepareRichInline[^}]*\}\s*=\s*pretext/.test(engineSrc),
    'rich-inline named imports must destructure pretext (not var-list)');
  // 真加载引擎（stub PIXI/pretext，env=window），真调编译器：program 形状 + 同种子确定性
  const noop = () => { };
  const win = { innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1 };
  const engineSandbox = {
    console,
    performance: { now: () => 0 },
    window: win,
    PIXI: { RendererType: { WEBGL: 1 }, Application: function () { }, Container: function () { }, AlphaFilter: function () { } },
    pretext: {
      measureNaturalWidth: noop, prepareWithSegments: noop,
      measureRichInlineStats: noop, prepareRichInline: (x) => x, walkRichInlineLineRanges: noop,
    },
    document: { createElement: () => ({ style: {}, getContext: () => ({ measureText: () => ({ width: 10 }) }) }) },
    ResizeObserver: function () { return { observe() { }, disconnect() { } }; },
    requestAnimationFrame: () => 0,
  };
  engineSandbox.self = win;
  vm.createContext(engineSandbox);
  vm.runInContext(engineSrc, engineSandbox, { filename: 'lumiere-engine.js' });
  assert.equal(typeof win.LumierePixiRuntime, 'function');
  const compile = win.compileLumiereProgram;
  assert.equal(typeof compile, 'function');
  const fixtureLines = () => [
    { words: [{ text: '晚', startTime: 0, endTime: 1 }, { text: '风', startTime: 1, endTime: 2 }],
      startTime: 0, endTime: 2, fullText: '晚风', translation: 'Wind', isChorus: false },
  ];
  const program = compile(fixtureLines(), 'seed-a', {}, { duration: 90 });
  assert.ok(Array.isArray(program.paragraphs) && program.paragraphs.length >= 1, 'program has paragraphs');
  const p0 = program.paragraphs[0];
  for (const key of ['id', 'index', 'kind', 'startTime', 'endTime', 'lines', 'shots']) {
    assert.ok(key in p0, 'paragraph missing key ' + key);
  }
  assert.ok(program.lyricEndTime >= 2, 'lyricEndTime covers last word end');
  const again = compile(fixtureLines(), 'seed-a', {}, { duration: 90 });
  assert.deepEqual(
    again.paragraphs.map((p) => [p.startTime, p.endTime, p.lines.length]),
    program.paragraphs.map((p) => [p.startTime, p.endTime, p.lines.length]),
    'same seed → same paragraph plan');
}

/* ---------- 绘光桥（28a-lumiere-pixi-bridge.js）：换歌热切换/元数据/失败重试契约 ---------- */
{
  const b = loadSandbox('28a-lumiere-pixi-bridge.js');
  assert.equal(typeof b.lumierePixiStart, 'function');
  // 换歌热切换（原版 useVisualizerSongCommit + swapSong 语义；曾缺失 → 模式开启
  // 状态下切歌，画面停留在旧歌的文字/逐字时间/镜头编排）
  assert.equal(typeof b.lumierePixiSync, 'function');
  const syncSrc = String(b.lumierePixiSync);
  assert.ok(syncSrc.includes('swapSong'), 'lumierePixiSync must hot-swap via swapSong');
  assert.ok(syncSrc.includes('setSongMetadata'), 'lumierePixiSync must push song metadata (credits)');
  // 元数据宿主职责（原版 VisualizerLumiere metadataRef）：playlist[currentIdx] →
  // {title, artist, album}；曾硬编码空串 → 片尾卡无歌曲信息
  assert.equal(typeof b.lumierePixiSongMeta, 'function');
  b.currentIdx = 0;
  b.playlist = [{ name: '海阔天空', artist: 'Beyond', album: '海阔天空' }];
  const meta = b.lumierePixiSongMeta();
  assert.equal(meta.title, '海阔天空');
  assert.equal(meta.artist, 'Beyond');
  assert.equal(meta.album, '海阔天空');
  b.playlist = [{ title: 'Only Title' }];
  assert.equal(b.lumierePixiSongMeta().title, 'Only Title', 'name 缺省回退 title 字段');
  // 失败重试契约（曾一次失败即 lumierePixiFailed=true 永久降级）：有界指数退避，
  // 新会话/未失败时必须允许引擎尝试
  assert.ok(b.LUMIERE_PIXI_FAIL_MAX >= 2, 'bridge must retry engine creation (bounded retries)');
  assert.ok(b.LUMIERE_PIXI_FAIL_BACKOFF_MS > 0, 'retry needs a backoff base');
  assert.equal(typeof b.lumierePixiRetryGate, 'function');
  assert.equal(typeof b.lumierePixiNoteFailure, 'function');
  assert.equal(b.lumierePixiRetryGate(), true, 'fresh state must allow engine attempt');
  // DOM 降级版 shell 的自愈与字幕驱动（28-lumiere.js）
  const shellSrc = fs.readFileSync(path.join(dir, '28-lumiere.js'), 'utf8');
  assert.ok(shellSrc.includes('lumiereAdoptPixi'), 'shell must have engine-adopt path (pixi-on + sync loop)');
  assert.ok(/lumierePixiStart\(\)\.then/.test(shellSrc), 'DOM fallback must retry engine (self-heal)');
  assert.ok(shellSrc.includes('lumiereSubtitleUpdate') && shellSrc.includes('lumiereSubtitleClear'),
    'shell must drive subtitle overlay (pixi-mode translation track)');
}

/* ---------- DOM 接线存在性（index.html 与 registry 与卡片清单） ---------- */
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['diorama-overlay', 'sonnet-overlay', 'tempera-overlay', 'lumiere-overlay']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing overlay ' + id);
  }
  for (const css of ['diorama.css', 'sonnet.css', 'tempera.css', 'lumiere.css']) {
    assert.ok(html.includes(css), 'missing css link ' + css);
  }
  const registry = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '02-visual', '90-visualizer-registry.js'), 'utf8');
  const loader = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'index-loader.js'), 'utf8');
  for (const mod of ['25-diorama.js', '26-sonnet.js', '28-lumiere.js']) {
    assert.ok(loader.includes(mod), 'missing loader entry ' + mod);
  }
  // 凝彩为懒加载试点：不在启动 loader 中，由注册表 entry.lazy 协议按需注入
  assert.ok(!loader.includes('27-tempera.js'), 'tempera should be lazy (not in startup loader)');
  assert.ok(registry.includes("lazy: true, storeKey: 'orangesea-tempera-v1'"), 'tempera entry must be lazy');
  for (const id of ['diorama', 'sonnet', 'tempera', 'lumiere']) {
    assert.ok(registry.includes("id: '" + id + "'"), 'missing registry entry ' + id);
  }
  // 网格卡片已收敛为注册表驱动的通用 builder（per-mode builder 移除）
  const grid = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '07-fx', '04-preset-grid-uniforms.js'), 'utf8');
  assert.ok(grid.includes('buildOverlayPresetCard'), 'grid must use generic overlay card builder');
  assert.ok(!grid.includes('buildTemperaPresetCard'), 'per-mode builders should be gone');
  // 引擎三模式宿主必须带 pixi-host 类：index.css 的全局规则
  // [id$="-overlay"].pixi-on > :not(.pixi-host) { display: none !important }
  // 只豁免 .pixi-host——宿主类名缺它会被强隐成 0×0（2026-10-11 sonnet 空白根因）
  for (const id of ['sonnet', 'tempera', 'lumiere']) {
    const m = html.match(new RegExp('<div class="([^"]*)" id="' + id + '-pixi-host"'));
    assert.ok(m, 'missing engine host div #' + id + '-pixi-host');
    assert.ok(/(^|\s)pixi-host(\s|$)/.test(m[1]), 'host #' + id + '-pixi-host must carry pixi-host class (global pixi-on exemption)');
  }
  // 商籁底部字幕容器：同为 pixi-host 豁免类（pixi-on 才显示），内含主行+预览行
  const sub = html.match(/<div class="([^"]*)" id="sonnet-subtitle">/);
  assert.ok(sub, 'missing #sonnet-subtitle container');
  assert.ok(/(^|\s)pixi-host(\s|$)/.test(sub[1]), '#sonnet-subtitle must carry pixi-host class');
  assert.ok(html.includes('sonnet-sub-main') && html.includes('sonnet-sub-up'), 'subtitle inner rows missing');
  // 绘光底部字幕容器（pixi 模式翻译轨道，原版 VisualizerSubtitleOverlay 宿主接管；
  // 曾缺失 → Pixi 主路径下翻译行无处呈现）
  const lsub = html.match(/<div class="([^"]*)" id="lumiere-subtitle">/);
  assert.ok(lsub, 'missing #lumiere-subtitle container');
  assert.ok(/(^|\s)pixi-host(\s|$)/.test(lsub[1]), '#lumiere-subtitle must carry pixi-host class');
  assert.ok(html.includes('lumiere-sub-main') && html.includes('lumiere-sub-up'), 'lumiere subtitle inner rows missing');
  // 凝彩底部字幕容器（同 sonnet/lumiere 范式；pixi-on 强隐规则的 pixi-host 豁免）
  const tsub = html.match(/<div class="([^"]*)" id="tempera-subtitle">/);
  assert.ok(tsub, 'missing #tempera-subtitle container');
  assert.ok(/(^|\s)pixi-host(\s|$)/.test(tsub[1]), '#tempera-subtitle must carry pixi-host class');
  assert.ok(html.includes('tempera-sub-main') && html.includes('tempera-sub-up'), 'tempera subtitle inner rows missing');
}

/* ---------- Folia 宿主数据面（07-fx/11-vis-mode-data-plane）：强度档/词色表/每模式调参 ---------- */
{
  const dataPlanePath = path.join(__dirname, '..', 'public', 'js', 'modules', '07-fx', '11-vis-mode-data-plane.js');
  const dataPlaneSrc = fs.readFileSync(dataPlanePath, 'utf8');

  // 数据面 + 桥合仓沙箱：桥的 Theme 契约读真实数据面（强度档 + 词色表 + tuning 覆盖）
  const store = {};
  const sandbox = {
    console,
    readBooleanPreference() { return false; },
    saveBooleanPreference() { },
    showToast() { },
    scheduleUiWarmTask() { return 0; },
    setTimeout() { return 0; },
    clearTimeout() { },
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
    },
    document: { getElementById() { return null; } },
    themeOverlayDarkTheme() { return null; },
    lyricsLines: [],
  };
  vm.createContext(sandbox);
  vm.runInContext(dataPlaneSrc, sandbox, { filename: '11-vis-mode-data-plane.js' });
  // 05-lyrics-fonts-texture 先于 10-shell 桥加载（index-loader.js:40 vs :163+）：
  // 桥 Theme 的 fontFamilyStack 经 lyricFontStackFamilies 转族名数组，沙箱须同序加载
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '02-visual', '05-lyrics-fonts-texture.js'), 'utf8'), sandbox, { filename: '05-lyrics-fonts-texture.js' });
  vm.runInContext(fs.readFileSync(path.join(dir, '20b-partita-engine-bridge.js'), 'utf8'), sandbox, { filename: '20b-partita-engine-bridge.js' });

  // ① 强度档：归一化三档 + 桥 Theme 随 fx 下发
  assert.equal(sandbox.visAnimationIntensityNormalize('calm'), 'calm');
  assert.equal(sandbox.visAnimationIntensityNormalize('CHAOTIC'), 'chaotic');
  assert.equal(sandbox.visAnimationIntensityNormalize('nonsense'), 'normal');
  assert.equal(sandbox.visAnimationIntensityNormalize(''), 'normal');
  assert.equal(sandbox.visAnimationIntensityCurrent(), 'normal', '无 fx 时回退 normal');
  const thDefault = sandbox.partitaTheme();
  assert.equal(thDefault.animationIntensity, 'normal');
  assert.equal(JSON.stringify(thDefault.wordColors), '[]', '空词色表 → 空数组（引擎回退 accentColor）');
  sandbox.fx = { visAnimationIntensity: 'chaotic' };
  assert.equal(sandbox.partitaTheme().animationIntensity, 'chaotic', '强度档随 fx 下发');
  delete sandbox.fx;

  // ② 词色表：增删改 + 上限同 Folia WORD_COLOR_LIMIT=40 + 同词改色去重
  assert.equal(sandbox.VIS_WORD_COLORS_LIMIT, 40, '上限必须同 folia themeParkDraft.ts WORD_COLOR_LIMIT');
  assert.equal(sandbox.visWordColorsAdd('潮汐', '#88aaff'), true);
  assert.equal(sandbox.visWordColorsAdd('潮汐', '#ff8866'), true, '已存在同词 → 改色而非新增');
  assert.equal(sandbox.visWordColorsAdd('  ', '#ffffff'), false, '空词拒绝');
  assert.equal(JSON.stringify(sandbox.visWordColorsList()), JSON.stringify([{ word: '潮汐', color: '#ff8866' }]));
  assert.equal(sandbox.visWordColorsList()[0].color, '#ff8866');
  for (let i = 0; i < 45; i++) sandbox.visWordColorsAdd('词' + i, '#ffffff');
  assert.equal(sandbox.visWordColorsList().length, 40, '写入夹取到 40 上限');
  assert.equal(sandbox.visWordColorsAdd('第41个', '#123456'), false, '满表拒绝新增');
  assert.equal(sandbox.visWordColorsRemoveAt(0), true);
  assert.equal(sandbox.visWordColorsRemoveAt(999), false);
  const thWired = sandbox.partitaTheme();
  assert.equal(thWired.wordColors.length, 39, '桥 Theme 注入词色表（40 上限 − 删除 1 条）');
  sandbox.visWordColorsClear();

  // ③ 每模式调参：schema 覆盖六个重点模式 + 覆盖值收敛 + 桥 create 合并 + live 注册
  for (const mode of ['sonnet', 'tempera', 'lumiere', 'pendolo', 'monet', 'fume']) {
    const def = sandbox.visModeTuningDef(mode);
    assert.ok(def, '缺重点模式 schema: ' + mode);
    assert.ok(def.schema.length >= 4, mode + ' schema 过空');
    assert.ok(def.defaults && Object.keys(def.defaults).length >= 4);
  }
  assert.equal(sandbox.visModeTuningDef('sonnet').live, false, 'sonnet 无 setTuning → 下次进入生效');
  assert.equal(sandbox.visModeTuningDef('diorama').live, false, 'diorama 无 setTuning');
  assert.equal(sandbox.visModeTuningDef('tempera').live, true);
  // 覆盖值按 schema 收敛：夹取 / 整数 / 白名单外回默认
  store['orangesea-vis-tuning-v1'] = JSON.stringify({
    pendolo: { arcAngleDeg: 999, showGearDecor: 'bogus', tickSnappiness: '1.5' },
  });
  const ov = sandbox.visModeTuningOverrides('pendolo');
  assert.equal(ov.arcAngleDeg, 160, 'range 越界夹取到 max');
  assert.equal(ov.showGearDecor, 'subtle', 'choice 白名单外回默认');
  assert.equal(ov.tickSnappiness, 1.5, '数字字符串收敛');
  const resolved = sandbox.partitaResolvedTuning();
  assert.equal(resolved.staggerMin, 20, '无覆盖 → 引擎默认原值');
  store['orangesea-vis-tuning-v1'] = JSON.stringify({ partita: { staggerMin: 60 } });
  assert.equal(sandbox.partitaResolvedTuning().staggerMin, 60, '桥 create 合并覆盖');
  assert.equal(sandbox.partitaResolvedTuning().staggerMax, 100, '未覆盖字段保持默认');
  delete store['orangesea-vis-tuning-v1'];
  // live 注册协议：注册后 patch 即回调（引擎 stub 接收 resolved tuning；
  // 数据面对 DEFS 之外的模式保守拒绝——patch 无 schema 可收敛，此为预期）
  let liveSeen = null;
  sandbox.visModeTuningRegisterLiveApply('partita', function (t) { liveSeen = t; });
  sandbox.visModeTuningPatch('partita', 'staggerMin', 55);
  assert.equal(liveSeen && liveSeen.staggerMin, 55, 'patch → live 应用收到 resolved tuning');
  sandbox.visModeTuningReset('partita');
  assert.equal(liveSeen && liveSeen.staggerMin, 20, 'reset → live 应用收到默认');
  sandbox.visModeTuningPatch('nosuchmode', 'x', 1);
  assert.equal(Object.keys(sandbox.visModeTuningOverrides('nosuchmode')).length, 0, '未知模式 patch 保守拒绝（无 schema 不落盘）');

  // 全部 14 个桥 Theme 契约接线：强度档 + 词色表（tilt 桥接线补齐后入册）
  const wiredBridges = ['20b-still-engine-bridge.js', '20b-classic-engine-bridge.js', '20b-partita-engine-bridge.js',
    '20b-cadenza-engine-bridge.js', '20b-pendolo-engine-bridge.js', '20b-claddagh-engine-bridge.js',
    '20b-fume-engine-bridge.js', '20b-tilt-engine-bridge.js', '23-cappella.js', '24-monet.js', '25-diorama.js',
    '26a-sonnet-pixi-bridge.js', '27a-tempera-pixi-bridge.js', '28a-lumiere-pixi-bridge.js'];
  for (const f of wiredBridges) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(src.includes('visAnimationIntensityCurrent()'), f + ' 缺强度档桥接');
    assert.ok(src.includes('visWordColorsList()'), f + ' 缺词色表桥接');
  }
  assert.ok(fs.readFileSync(path.join(dir, '20b-tilt-engine-bridge.js'), 'utf8').includes("visModeTuningOverrides('tilt')"), 'tilt 桥缺调参覆盖接线');

  // 调参 create 合并接线：11 个支持 tuning 的桥（sonnet/tempera/lumiere/pendolo/claddagh
  // 用既有 const，fume/classic/cadenza/cappella/monet/diorama/partita 新增）
  for (const [f, fn] of [
    ['20b-pendolo-engine-bridge.js', 'pendoloResolvedTuning'],
    ['20b-claddagh-engine-bridge.js', 'claddaghResolvedTuning'],
    ['20b-partita-engine-bridge.js', 'partitaResolvedTuning'],
    ['20b-fume-engine-bridge.js', 'fumeResolvedTuning'],
    ['20b-classic-engine-bridge.js', 'classicResolvedTuning'],
    ['20b-cadenza-engine-bridge.js', 'cadenzaResolvedTuning'],
    ['23-cappella.js', 'cappellaResolvedTuning'],
    ['24-monet.js', 'monetResolvedTuning'],
    ['25-diorama.js', 'dioramaResolvedTuning'],
    ['26a-sonnet-pixi-bridge.js', 'sonnetResolvedTuning'],
    ['27a-tempera-pixi-bridge.js', 'temperaResolvedTuning'],
    ['28a-lumiere-pixi-bridge.js', 'lumiereResolvedTuning'],
  ]) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(src.includes('function ' + fn + '()'), f + ' 缺 resolved tuning 助手');
    assert.ok(src.includes('tuning: ' + fn + '()'), f + ' create 未传合并 tuning');
  }
  // live 注册：支持 setTuning 的 9 模式桥注册 live 应用；sonnet/diorama 不注册
  for (const f of ['20b-pendolo-engine-bridge.js', '20b-claddagh-engine-bridge.js', '20b-partita-engine-bridge.js',
    '20b-fume-engine-bridge.js', '20b-classic-engine-bridge.js', '20b-cadenza-engine-bridge.js',
    '23-cappella.js', '24-monet.js', '27a-tempera-pixi-bridge.js', '28a-lumiere-pixi-bridge.js']) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(src.includes('visModeTuningRegisterLiveApply'), f + ' 缺 live 注册（引擎支持 setTuning）');
  }
  for (const f of ['25-diorama.js', '26a-sonnet-pixi-bridge.js']) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!src.includes('visModeTuningRegisterLiveApply'), f + ' 引擎无 setTuning，不应声明 live');
  }

  // ⑦a 持久化：fxDefaults + 读/存双路径 + 控制台布局注册 + loader
  const fxDefaultsSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '00-state', '04-fx-defaults.js'), 'utf8');
  assert.ok(fxDefaultsSrc.includes("visAnimationIntensity: 'normal'"), 'fxDefaults 缺 visAnimationIntensity');
  const persistSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '02-visual', '04-visual-settings-persistence.js'), 'utf8');
  assert.ok(persistSrc.includes('visAnimationIntensity: normalizeVisAnimationIntensity(raw.visAnimationIntensity)'), '读路径缺失');
  assert.ok(persistSrc.includes('visAnimationIntensity: normalizeVisAnimationIntensity(fx.visAnimationIntensity)'), '存路径缺失');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['vis-intensity-seg', 'vis-word-colors', 'vis-mode-tuning']) {
    assert.ok(html.includes('id="' + id + '"'), 'index.html 缺控制台容器 ' + id);
  }
  const consoleSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '07-fx', '09-console-workspace.js'), 'utf8');
  for (const ref of ["'vis-intensity-seg'", "'vis-word-colors'", "'vis-mode-tuning'"]) {
    assert.ok(consoleSrc.includes('fxConsoleItem(' + ref), '控制台布局缺条目 ' + ref);
  }
  const loaderSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'index-loader.js'), 'utf8');
  assert.ok(loaderSrc.includes('07-fx/11-vis-mode-data-plane.js'), 'loader 缺数据面模块');
}

console.log('four-modes.test.js: all assertions passed');
