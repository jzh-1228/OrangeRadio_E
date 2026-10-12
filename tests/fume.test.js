'use strict';
/* 烟纸（fume）· 原版渲染核心引擎的产物与接线验证
   ----------------------------------------------------------------------------
   覆盖：
   1) 引擎产物可加载：vm 沙箱执行 fume-engine.js 的 IIFE，
      env.FumeFumeEngine 与全部 CM_* 闭包别名注入齐全（fume 16 模块 +
      FumeBackground + 共享歌词工具闭包）；
   2) 关键算法（直接调用 env 注出的 Folia 闭包符号，数值级断言）：
      fumeReveal 词区间/打印数 / fumeTextStyle passed 三态与淡出下限 /
      fumeBlockFrame 辉光基准 / fumeCamera 常量与总览相机 / FumeBackground
      场景规模 / renderHints 行时长；
   3) 桥契约：20b 桥可编译、applyFumeMode/fumeMode 入口齐全、
      引擎宿主数据流（toLines 形状 / MV get 轮询 / bands 0..255 原值）；
   4) 注册接线：registry 行、index-loader 清单、index.html script 与
      fume-engine-host、fume.css 不再持旧简化版 DOM 类（防与引擎
      inline style 双主路径冲突）、旧简化实现已删除。
   算法参照：folia-major src/components/visualizer/fume/*、
   src/components/visualizer/FumeBackground.ts（AGPL-3.0，见 NOTICE.md）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'public', 'js', 'modules', '10-shell-fume-engine', 'fume-engine.js');
const BRIDGE = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20b-fume-engine-bridge.js');
const LOADER = path.join(ROOT, 'public', 'js', 'index-loader.js');
const INDEX = path.join(ROOT, 'public', 'index.html');
const REGISTRY = path.join(ROOT, 'public', 'js', 'modules', '02-visual', '90-visualizer-registry.js');
const CSS = path.join(ROOT, 'public', 'css', 'fume.css');
const OLD_IMPL = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20-fume.js');

/* ---------- 1) 引擎产物可加载（vm 沙箱执行，env 注出面） ---------- */
const sandbox = { console, Math, JSON, Object, Array, Number, parseInt, parseFloat, isFinite, RegExp, Date, Intl, Map, Set, WeakMap, Symbol, Promise };
sandbox.window = sandbox;
sandbox.pretext = {
  prepareWithSegments: () => ({ segments: [], widths: [], breakableFitAdvances: [] }),
  layoutWithLines: () => ({ lineCount: 1, lines: [] })
};
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(ENGINE, 'utf8'), { filename: 'fume-engine.js' }).runInContext(sandbox);
const env = sandbox.window;

assert.equal(typeof env.FumeFumeEngine, 'function', 'env.FumeFumeEngine 必须由引擎产物注出');
for (const alias of [
  // fume 核心 16 模块
  'CM_FumeSplitGraphemes', 'CM_FumeClamp', 'CM_FumeMix', 'CM_FumeQuadraticBezier',
  'CM_FumeEaseOutCubic', 'CM_FumeEaseInCubic', 'CM_FumeEaseInOutCubic',
  'CM_FumeResolveDelayedGlowEnvelope', 'CM_FumeIsCJK', 'CM_FumeHashString', 'CM_FumeSeeded',
  'CM_FumeResolvePassedTextStyle', 'CM_FumeResolvePassedDimAmount', 'CM_FumeResolvePassedFadeDuration', 'CM_FumeGetActiveColor',
  'CM_FumeBuildSegmentMetas', 'CM_FumeWidthBetweenOffsets', 'CM_FumeBuildGlyphOffsets', 'CM_FumeBuildRenderSegments',
  'CM_FumeBuildFontSpec', 'CM_FumeBuildWordRangeIndexByOffset', 'CM_FumeCountRenderableGraphemes', 'CM_FumeBuildPreparedSingleLine',
  'CM_FumeBuildWordRangesFromWords', 'CM_FumeResolveLinePassCutoffTime', 'CM_FumeResolveVisualProgressWithCutoff',
  'CM_FumeResolvePrintedGraphemeCount', 'CM_FumeResolvePrintedGraphemeProgress',
  'CM_FumeCameraScaleMin', 'CM_FumeCameraScaleMax', 'CM_FumeOverviewCameraSource',
  'CM_FumeResolveArticleOverviewCamera', 'CM_FumeResolveFocusBlock',
  'CM_FumeCreateCameraState', 'CM_FumeSyncCameraToArticle', 'CM_FumeStepCamera', 'CM_FumeResolveBackgroundView',
  'CM_FumeResolveGlowBases', 'CM_FumeIsBlockOnScreen', 'CM_FumeResolveBlockTiming', 'CM_FumeResolveStaticLayers',
  'CM_FumeCreateStaticBlockSnapshot', 'CM_FumeDrawLiveBlock',
  'CM_FumeLiveRaster', 'CM_FumeResolveLiveRasterScale',
  'CM_FumeBuildLayoutCacheKey', 'CM_FumeBuildArticleLayout',
  'CM_FumeChooseFontPx',
  'CM_FumeReadAudioLevels',
  'CM_FumeBuildBackgroundScene', 'CM_FumeDrawBackground',
  // 共享歌词工具闭包
  'CM_colorWithAlpha', 'CM_mixColors', 'CM_buildLineRenderHints', 'CM_getLineRenderEndTime',
  'CM_buildWordGraphemeTimings', 'CM_resolveThemeFontStack', 'CM_resolveThemeFontWeight',
  'CM_resolveThemeTranslationFontStack', 'CM_resolveWordColor',
  'CM_isGlowBlurQuantized', 'CM_quantizeShadowBlur', 'CM_setCanvasTextGlow', 'CM_clearCanvasTextGlow', 'CM_fillGlowText',
  'CM_ResolveLyricSubtitleTracks', 'CM_ResolveSubtitleContentMode',
  'CM_SECONDARY_TRACK_SIZE_FACTOR', 'CM_SECONDARY_TRACK_OPACITY', 'CM_SECONDARY_TRACK_GAP_EM',
]) {
  assert.ok(env[alias] != null, alias + ' 必须由管线 aliasExports 注出');
}

/* ---------- 2) 关键算法（Folia 闭包原函数，数值级） ---------- */

/* DEFAULT_FUME_TUNING 常量面（types.ts:446-455 相机边界/总览源） */
{
  assert.equal(env.CM_FumeCameraScaleMin, 0.22);
  assert.equal(env.CM_FumeCameraScaleMax, 2.24);
  assert.equal(env.CM_FumeOverviewCameraSource, -2);
}

/* fumeReveal.ts：词区间（词后空格附加进当前词域）与打印进度 */
{
  const line = {
    fullText: 'hello world this is a line',
    startTime: 10, endTime: 14, isChorus: false,
    words: [
      { text: 'hello', startTime: 10, endTime: 11 },
      { text: 'world', startTime: 11, endTime: 12 },
      { text: 'this', startTime: 12, endTime: 12.5 },
      { text: 'is', startTime: 12.5, endTime: 13 },
      { text: 'a line', startTime: 13, endTime: 14 }
    ]
  };
  const gs = env.CM_FumeSplitGraphemes(line.fullText);
  assert.equal(gs.length, 26);
  const ranges = env.CM_FumeBuildWordRangesFromWords(line, gs);
  assert.equal(ranges.length, 5);
  assert.equal(JSON.stringify(ranges.map((r) => [r.start, r.end])),
    '[[0,6],[6,12],[12,17],[17,20],[20,26]]', '词域右端吃掉后续空格（fumeReveal.ts:31-33）');
  // hello 唱完（11.0）→ 5 字 + 1 空格 = 6 个 grapheme 已打印
  assert.equal(env.CM_FumeResolvePrintedGraphemeCount(line, ranges, gs.length, 11.0), 6);
  // 行尾后（14.5）→ 全部完成
  assert.equal(env.CM_FumeResolvePrintedGraphemeCount(line, ranges, gs.length, 14.5), 26);
  // 行开始前 → 0
  assert.equal(env.CM_FumeResolvePrintedGraphemeCount(line, ranges, gs.length, 9.5), 0);
  // 连续进度版（相机 smooth 焦点用）
  assert.equal(env.CM_FumeResolvePrintedGraphemeProgress(line, ranges, gs.length, 14.5), 26);
}

/* renderHints：行渲染终点（相机 retarget 时长与 pass 判定的输入；
   buildLineRenderEndTime：passStart = lastWordEnd + 0.06，renderEnd = max(endTime, passStart + 0.32)） */
{
  const line = { startTime: 10, endTime: 14, words: [{ endTime: 13.9 }] };
  assert.equal(env.CM_buildLineRenderHints(line).renderEndTime, 13.9 + 0.06 + 0.32); // max(14, 14.28)
  const full = { startTime: 10, endTime: 14, words: [{ endTime: 14 }] };
  assert.equal(env.CM_buildLineRenderHints(full).renderEndTime, 14.38); // max(14, 14.06+0.32)
}

/* fumeTextStyle.ts：passed 三态（standard hero 0.74 / dimmed body 0.075）
   与淡出时长（textHoldRatio=1 → Infinity；下限 2.4） */
{
  assert.equal(env.CM_FumeResolvePassedTextStyle('hero', 'standard').opacity, 0.74);
  assert.equal(env.CM_FumeResolvePassedTextStyle('body', 'dimmed').opacity, 0.075);
  const line = { startTime: 10, endTime: 14, words: [{ endTime: 13.9 }] };
  assert.equal(env.CM_FumeResolvePassedFadeDuration([line], 1), Number.POSITIVE_INFINITY);
  assert.equal(env.CM_FumeResolvePassedFadeDuration([line], 0.3), 2.4); // clamp(4×0.3, 2.4, 130)
  // easeInCubic(clamp(age/fade,0,1))：0.4 后 = 0.064
  assert.ok(Math.abs(env.CM_FumeResolvePassedDimAmount(10.4, 10, 1) - 0.064) < 1e-12);
}

/* fumeBlockFrame.ts：辉光基准（normal × glowIntensity 1） */
{
  assert.equal(JSON.stringify(env.CM_FumeResolveGlowBases('normal', 1)), '{"activeGlowBoost":0.92,"passedGlowBase":0.62}');
  assert.equal(JSON.stringify(env.CM_FumeResolveGlowBases('calm', 1)), '{"activeGlowBoost":0.72,"passedGlowBase":0.35}');
  assert.equal(JSON.stringify(env.CM_FumeResolveGlowBases('chaotic', 1)), '{"activeGlowBoost":1.15,"passedGlowBase":0.95}');
}

/* fumeCamera.ts：块级相机缩放（minSide×0.115 → clamp 64..124 / lineHeight，clamp 0.88..2.2） */
{
  const block = { lineHeight: 40 };
  const scale = env.CM_FumeResolveCameraScaleForBlock(block, { width: 1280, height: 720 });
  assert.equal(scale, Math.min(Math.max((720 * 0.115) / 40, 0.88), 2.2));
}

/* fumeCameraStep.ts：相机状态初始值（retarget duration 0.18 / waypointPhase 0.36） */
{
  const state = env.CM_FumeCreateCameraState();
  assert.equal(state.retarget.duration, 0.18);
  assert.equal(state.retarget.bridgeWaypointPhase, 0.36);
  assert.equal(state.retarget.sourceLineIndex, -1);
  assert.equal(state.initialized, false);
  // sync 到空 article → 未初始化；sync 到新 article → 居中 1.18（:48-61）
  env.CM_FumeSyncCameraToArticle(state, null);
  assert.equal(state.initialized, false);
  env.CM_FumeSyncCameraToArticle(state, { width: 2400, height: 1800 });
  assert.equal(state.initialized, true);
  assert.equal(state.camera.x, 1200);
  assert.equal(state.camera.scale, 1.18);
}

/* FumeBackground.ts：宽世界 8 基础形 + 12 spark = 20（:277-279），seeded 确定性 */
{
  const build = () => env.CM_FumeBuildBackgroundScene({
    viewport: { width: 1280, height: 720 },
    world: { width: 2400, height: 1800 },
    seed: 'fume:test'
  });
  const a = build();
  const b = build();
  assert.equal(a.shapes.length, 20);
  assert.equal(a.shapes.length, b.shapes.length);
  assert.deepEqual(a.shapes.map((s) => s.id), b.shapes.map((s) => s.id));
  assert.equal(JSON.stringify(a.shapes), JSON.stringify(b.shapes), 'seeded 背景必须确定性');
  // 深度排序（:354）
  const depths = a.shapes.map((s) => s.depth);
  assert.deepEqual(depths, depths.slice().sort((x, y) => x - y));
}

/* 相机步进：等待/平滑跟随/总览三态都返回 {shouldShowOverview, overviewTextRestoreProgress} */
{
  const state = env.CM_FumeCreateCameraState();
  const article = {
    width: 2400, height: 1800, viewportHeight: 720, columns: 2, gap: 8,
    paperBounds: { left: 200, top: 180, right: 2200, bottom: 1620 },
    blocks: [], blockBySourceLineIndex: new Map(), chronologicalBlocks: [],
    firstRenderableStartTime: 0, lastChronologicalRenderEndTime: 100
  };
  const result = env.CM_FumeStepCamera(state, {
    article, time: 0, now: 0, dt: 1 / 60, lineIndex: -1,
    viewport: { width: 1280, height: 720 },
    overviewCamera: { x: 1200, y: 900, scale: 0.5 },
    overviewStartTime: 50, cameraSpeed: 1, cameraTrackingMode: 'smooth',
    staticMode: false, animationIntensity: 'normal'
  });
  assert.equal(typeof result.shouldShowOverview, 'boolean');
  assert.equal(result.shouldShowOverview, false, 'time < overviewStartTime 不进总览');
  assert.equal(result.overviewTextRestoreProgress, 0);
}

/* ---------- 2b) 布局管线数值级（fumeArticleLayout / fumeTextMeasure） ---------- */

/* buildFontSpec（fumeTextMeasure.ts:175-180）：theme.fontWeight 有值直用，
   缺省回退 hero 780 / body 640——桥不写死 fontWeight 后此原版路径可达 */
{
  assert.equal(env.CM_FumeBuildFontSpec(30, 'hero', 'Georgia', { fontWeight: 500 }), '500 30px Georgia');
  assert.equal(env.CM_FumeBuildFontSpec(30, 'hero', 'Georgia', {}), '780 30px Georgia');
  assert.equal(env.CM_FumeBuildFontSpec(30, 'body', 'Georgia', {}), '640 30px Georgia');
}

/* chooseFontPx（fumeArticleLayout.ts:119-136 公式）：
   density = graphemeCount + words.length×1.4；hero base = w/max(√d×1.5,4.5)
   clamp(24,54)；body base = w/max(√d×2.25,7) clamp(14,28)；乘 scale×densityScale */
{
  const f = env.CM_FumeChooseFontPx;
  const mk = (text, words) => ({ fullText: text, words: (words || []).map((w) => ({ text: w })) });
  const hello = mk('hello world', ['hello', 'world']);   // 10 渲染 grapheme
  const d = 10 + 2 * 1.4;                                // density = 12.8
  assert.equal(f(hello, 'hero', 100, 1, 1), 24, 'hero 下界 clamp');
  assert.ok(Math.abs(f(hello, 'hero', 160, 1, 1) - 160 / (Math.sqrt(d) * 1.5)) < 1e-9, 'hero 区间内精确值');
  assert.ok(Math.abs(f(hello, 'body', 160, 1, 1) - 160 / (Math.sqrt(d) * 2.25)) < 1e-9, 'body 区间内精确值');
  assert.equal(f(hello, 'hero', 1000, 1, 1), 54, 'hero 上界 clamp');
  assert.equal(f(hello, 'body', 1000, 1, 1), 28, 'body 上界 clamp');
  assert.equal(f(mk('  '), 'hero', 100, 1, 1), 24, '空白行 graphemeCount 取 1（:126 max）');
  assert.equal(f(hello, 'hero', 160, 0.5, 1), 24, '字号缩放后触下界');
  assert.ok(Math.abs(f(hello, 'hero', 160, 1.5, 1) - (160 / (Math.sqrt(d) * 1.5)) * 1.5) < 1e-9, '字号缩放相乘（:132）');
}

/* buildPreparedSingleLine（fumeTextMeasure.ts:245-293）：8 轮二分；沙箱
   pretext mock lineCount 恒 1 → 每轮采纳（low 推进），收敛值由二分序列精确
   决定：hero 18..58 → 57.84375，body 10..30 → 29.921875（×scale/heroScale） */
{
  const b = env.CM_FumeBuildPreparedSingleLine;
  assert.equal(b('hello world', 'Georgia', 800, 'hero', 1, 1, 1, {}).fontPx, 57.84375);
  assert.equal(b('hello world', 'Georgia', 800, 'body', 1, 1, 1, {}).fontPx, 29.921875);
  assert.ok(Math.abs(b('x', 'Georgia', 800, 'hero', 1, 1, 1.2, {}).fontPx - 57.84375 * 1.2) < 1e-9, 'heroScale 相乘');
  assert.ok(Math.abs(b('x', 'Georgia', 800, 'body', 0.5, 1, 1, {}).fontPx - 29.921875 * 0.5) < 1e-9, '字号缩放相乘');
  const hero = b('hello world', 'Georgia', 800, 'hero', 1, 1, 1, {});
  assert.ok(hero.prepared && hero.layout && hero.layout.lineCount === 1, '返回 prepared/layout 形状');
}

/* buildLayoutCacheKey（fumeArticleLayout.ts:138-167）：同输入同 key；
   fontWeight/viewport/字号缩放变化换 key——字重热更触发整篇重建的输入位 */
{
  const k = env.CM_FumeBuildLayoutCacheKey;
  const ls = [{ fullText: 'x', startTime: 1, endTime: 2, isChorus: false, words: [] }];
  const theme = { name: 't', fontStyle: 'serif', fontWeight: 640 };
  const tuning = { heroScale: 1 };
  assert.equal(k(ls, { width: 1280, height: 720 }, theme, 1, tuning),
    k(ls, { width: 1280, height: 720 }, theme, 1, tuning), '同输入同 key');
  assert.notEqual(k(ls, { width: 1280, height: 720 }, theme, 1, tuning),
    k(ls, { width: 1280, height: 720 }, Object.assign({}, theme, { fontWeight: 780 }), 1, tuning),
    '字重变化必须换 key（:160）');
  assert.notEqual(k(ls, { width: 1280, height: 720 }, theme, 1, tuning),
    k(ls, { width: 1000, height: 720 }, theme, 1, tuning), 'viewport 变化换 key');
  assert.notEqual(k(ls, { width: 1280, height: 720 }, theme, 1, tuning),
    k(ls, { width: 1280, height: 720 }, theme, 1.2, tuning), '字号缩放换 key');
}

/* buildArticleLayout（fumeArticleLayout.ts:449-581）：变体归属/几何常量/
   首行时间/边界 null。pretext mock 空度量 → renderLines 空（结构仍成立） */
{
  const lines = [
    { fullText: 'a'.repeat(35), startTime: 10, endTime: 14, isChorus: false,
      words: [{ text: 'a'.repeat(35), startTime: 10, endTime: 14 }] },
    { fullText: '春眠不觉晓', startTime: 14, endTime: 18, isChorus: true,
      words: [
        { text: '春眠', startTime: 14, endTime: 15 },
        { text: '不觉', startTime: 15, endTime: 16 },
        { text: '晓', startTime: 16, endTime: 18 }] }
  ];
  const theme = { name: 't', fontStyle: 'serif', fontWeight: 640 };
  const tuning = { heroScale: 1 };
  const a = env.CM_FumeBuildArticleLayout(lines, { width: 1280, height: 720 }, theme, 1, tuning);
  assert.ok(a, '正常输入必须产出文章布局');
  assert.equal(a.blocks.length, 2);
  assert.equal(a.blockBySourceLineIndex.get(0).variant, 'body', '35 字长行必然 body（shortEnough=false）');
  assert.equal(a.blockBySourceLineIndex.get(1).variant, 'hero', '合唱 ≤22 grapheme 必然 hero（:33-35）');
  assert.ok(a.blockBySourceLineIndex.get(1).fontPx > a.blockBySourceLineIndex.get(0).fontPx, 'hero 字号大于 body');
  assert.equal(a.firstRenderableStartTime, 10, '首可渲染行时间');
  const margin = Math.max(1280 * 0.86, 280);
  assert.equal(a.paperBounds.left, margin, 'paperBounds.left = horizontalMargin（:418）');
  assert.equal(a.width, 2400 + margin * 2, 'paperWidth clamp(2496,920,2400)=2400 + 双边距（:412/:460）');
  assert.equal(a.blockBySourceLineIndex.get(1).renderLines.length, 0, '沙箱 mock 空度量 → 空渲染行');
  assert.equal(env.CM_FumeBuildArticleLayout(lines, { width: 0, height: 720 }, theme, 1, tuning), null, '零宽 viewport → null');
  assert.equal(env.CM_FumeBuildArticleLayout([], { width: 1280, height: 720 }, theme, 1, tuning), null, '空歌词 → null');
}

/* ---------- 3) 桥契约 ---------- */
{
  const src = fs.readFileSync(BRIDGE, 'utf8');
  new vm.Script(src, { filename: '20b-fume-engine-bridge.js' });   // 可编译
  assert.match(src, /function applyFumeMode\(on, opts\)/, '注册表 applyFn 入口名必须保留');
  assert.match(src, /var fumeMode\s*=/, '注册表 stateVar 名必须保留');
  assert.match(src, /FumeFumeEngine\(/, '桥必须创建引擎实例');
  assert.match(src, /getAdjustedLyricPlaybackTime/, '时间源走歌词偏移修正');
  assert.match(src, /animationIntensity:\s*\(typeof visAnimationIntensityCurrent/, '强度档随 fx.visAnimationIntensity 下发（07-fx/11 数据面；无数据面回退 normal，four-modes 沙箱测试覆盖）');
  assert.match(src, /wordColors:\s*\(typeof visWordColorsList/, '词色表随 orangesea-vis-word-colors-v1 下发（07-fx/11 数据面；空表回退 accentColor，CM_resolveWordColor 测试覆盖）');
  assert.match(src, /findStageLyricIndexAtTime/, '行索引走权威语义');
  /* 字体跟随（buildVisualizerTheme.ts:46-51 语义；原版消费点
     fumeTextMeasure.ts:178 hero 780/body 640 回退——写死 700 抹掉粗细对比） */
  assert.match(src, /fontStyle:\s*fumeLyricFontStyle\(\)/, 'fontStyle 随歌词字体档（衬线/书法→serif、mono→mono、余→sans）');
  assert.match(src, /fontWeight:\s*fumeLyricFontWeight\(\)/, 'fontWeight 随 lyricFontWeightValue（fx.lyricWeight），不得写死');
  assert.match(src, /lyricFontStackForKey/, 'fontFamilyStack 随 fx.lyricFont');
  assert.ok(!/fontWeight:\s*700/.test(src), '桥不得写死 fontWeight（会抹掉 hero/body 对比与翻译行 500 回退）');
  /* Shell Latent 背景层（VisualizerShell.tsx:185-197 → mode 缺省 'latent'） */
  assert.match(src, /startFumeBg\(\)/, '进入模式先建 Latent 背景层');
  assert.match(src, /TiltLatentBackground\(/, '背景复用模式无关 Latent 实现');
  assert.match(src, /fumeBg\.setTheme/, '背景随主题热更');
  assert.match(src, /fumeBg\.setCoverUrl/, '背景随封面热更');
  assert.match(src, /fumeBg\.destroy/, '退出销毁背景层');
}

/* ---------- 4) 注册接线 ---------- */
{
  const loader = fs.readFileSync(LOADER, 'utf8');
  assert.match(loader, /js\/modules\/10-shell\/20b-fume-engine-bridge\.js/, 'index-loader 清单挂 20b 桥');
  assert.ok(!loader.includes('20-fume.js'), '旧简化实现必须从清单移除');

  const index = fs.readFileSync(INDEX, 'utf8');
  assert.match(index, /js\/modules\/10-shell-fume-engine\/fume-engine\.js/, 'index.html 静态注入引擎产物');
  const engineAt = index.indexOf('10-shell-fume-engine/fume-engine.js');
  const loaderAt = index.indexOf('js/index-loader.js');
  assert.ok(engineAt > 0 && loaderAt > engineAt, '引擎产物必须在 index-loader 之前加载');
  const pretextAt = index.indexOf('vendor/pretext/pretext.bundle.js');
  assert.ok(pretextAt > 0 && engineAt > pretextAt, 'pretext 全局 bundle 必须在 fume 引擎之前');
  assert.match(index, /id="fume-engine-host"/, '引擎宿主容器存在');
  assert.match(index, /id="fume-bg-layer"/, 'Shell Latent 背景宿主容器存在');
  const fumeBgAt = index.indexOf('id="fume-bg-layer"');
  const fumeHostAt = index.indexOf('id="fume-engine-host"');
  assert.ok(fumeBgAt > 0 && fumeHostAt > fumeBgAt, '背景层 DOM 序在引擎宿主之前（z 序兜底）');
  assert.ok(index.indexOf('fume-badge') === -1 && index.indexOf('fume-pending') === -1,
    '旧简化版 DOM（badge/pending）必须移除（引擎自建指示卡）');

  const registry = fs.readFileSync(REGISTRY, 'utf8');
  assert.match(registry, /id:\s*'fume'[\s\S]*?stateVar:\s*'fumeMode'/, '注册表 fume 行保留');
  assert.match(registry, /applyFn:\s*'applyFumeMode'/, '注册表 applyFn 保留');

  const css = fs.readFileSync(CSS, 'utf8');
  assert.ok(!/\.fume-(paper|canvas|badge|pending)/.test(css), 'fume.css 不得再持旧简化版结构类（引擎 inline style 单主路径）');
  assert.match(css, /#fume-engine-host/, 'fume.css 提供引擎宿主定位');
  assert.match(css, /#fume-bg-layer/, 'fume.css 提供 Latent 背景层定位');

  assert.ok(!fs.existsSync(OLD_IMPL), '旧简化实现 20-fume.js 已删除（不得两套主路径并存）');
}

console.log('OK tests/fume.test.js — 引擎产物加载/关键算法/桥契约/注册接线 全部通过');
