'use strict';
/* 莫奈（monet）· 原版渲染核心引擎的产物与接线验证
   ----------------------------------------------------------------------------
   覆盖：
   1) 引擎产物可加载：vm 沙箱执行 monet-engine.js 的 IIFE（pretext stub），
      env.MonetMonetEngine 与全部 CM_* 闭包别名注入齐全；
   2) 关键算法（直接调用 env 注出的 Folia 闭包符号，数值级断言）：
      monetLyricMotion 辉光曲线/逐字填充宽度/词三态、monetLyricsModel
      显示令牌切分/±2 窗口/大屏缩放/行布局测量与缓存 key、
      monetPortraitCrossfade 层栈规则、monetBackgroundDrift 轨道、
      monetBackgroundPipeline 水洗色彩/烘焙缓存 key、
      monetLyricMotion spring 原值；
   3) 桥契约：24-monet.js 桥可编译、applyMonetMode/monetMode 入口齐全、
      引擎宿主数据流（toLines 形状 / 时间源 / 五通道音频桥）；
   4) 注册接线：registry 行、index-loader 清单、index.html script（pretext
      先于引擎）与 monet-engine-host、monet.css 只持容器壳（引擎 inline
      style 单主路径）、旧简化实现（monetBuildPoster/monetBuildRail 等）
      已被原版渲染核心取代删除。
   算法参照：folia-major src/components/visualizer/monet/*（AGPL-3.0，见
   NOTICE.md）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'public', 'js', 'modules', '10-shell-monet-engine', 'monet-engine.js');
const BRIDGE = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '24-monet.js');
const LOADER = path.join(ROOT, 'public', 'js', 'index-loader.js');
const INDEX = path.join(ROOT, 'public', 'index.html');
const REGISTRY = path.join(ROOT, 'public', 'js', 'modules', '02-visual', '90-visualizer-registry.js');
const CSS = path.join(ROOT, 'public', 'css', 'monet.css');

/* ---------- 1) 引擎产物可加载（vm 沙箱 + pretext stub，env 注出面） ---------- */
const sandbox = { console, Math, JSON, Object, Array, Number, parseInt, parseFloat, isFinite, RegExp, Date, Intl, Map, Set, Uint8Array, Promise, performance, Image: function () { } };
sandbox.window = sandbox;
sandbox.window.innerWidth = 1280;
/* pretext 测量 stub：行数/宽度确定值，供 measureMonetLineLayout 数值断言 */
sandbox.pretext = {
  prepareWithSegments: function () { return { __stub: true }; },
  layoutWithLines: function () { return { lines: [{ width: 120 }] }; },
  prepareRichInline: function (items) { return items; },
  measureRichInlineStats: function () { return { lineCount: 2, maxLineWidth: 300 }; },
  clearCache: function () { }
};
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(ENGINE, 'utf8'), { filename: 'monet-engine.js' }).runInContext(sandbox);
const env = sandbox.window;

assert.equal(typeof env.MonetMonetEngine, 'function', 'env.MonetMonetEngine 必须由引擎产物注出');
for (const alias of [
  'CM_colorWithAlpha', 'CM_parseColorChannels', 'CM_mixColors',
  'CM_buildLineRenderHints', 'CM_getLineRenderEndTime',
  'CM_buildWordGraphemeTimings', 'CM_buildLineGraphemeTimeline',
  'CM_resolveLyricSubtitleTracks', 'CM_resolveSubtitleContentMode',
  'CM_SECONDARY_TRACK_SIZE_FACTOR', 'CM_SECONDARY_TRACK_OPACITY', 'CM_SECONDARY_TRACK_GAP_EM',
  'CM_resolveThemeFontStack', 'CM_resolveThemeTranslationFontStack', 'CM_resolveThemeFontWeight',
  'CM_resolveWordColor', 'CM_prepareWordColorMatchers', 'CM_buildWordColorRangesFromMatchers', 'CM_resolveTokenColorMap',
  'CM_resolveMonetBackgroundDataUrl', 'CM_getMonetBackgroundCacheKey', 'CM_checkCanvasFilterSupport',
  'CM_resolveWashColor', 'CM_resolveWashEndpoints',
  'CM_MONET_SCROLL_SPRING', 'CM_MONET_SCALE_SPRING', 'CM_clampMonetProgress',
  'CM_resolveMonetGlow', 'CM_resolveMonetFillWidth', 'CM_resolveMonetTone',
  'CM_MONET_RAIL_BASE_MAX_WIDTH_PX', 'CM_MONET_RAIL_BASE_MAX_HEIGHT_PX',
  'CM_MONET_ROW_BASE_MAX_WIDTH_PX', 'CM_MONET_PORTRAIT_BASE_MAX_PX', 'CM_MONET_PORTRAIT_INNER_BASE_MAX_PX',
  'CM_buildMonetDisplayTokens', 'CM_buildMonetVisibleLineEntries', 'CM_buildMonetLayoutCacheKey',
  'CM_measureMonetLineLayout', 'CM_measureMonetGraphemeOffsets', 'CM_clearMonetMeasurementCaches',
  'CM_resolveMonetLineStatus', 'CM_resolveMonetWordStatus',
  'CM_resolveMonetSweepEdgeSoftness', 'CM_resolveMonetSweepEnd',
  'CM_resolveMonetLargeScreenScale', 'CM_resolveClampFontPx',
  'CM_MONET_PORTRAIT_FADE_MS', 'CM_MONET_PORTRAIT_MAX_LAYERS',
  'CM_pushMonetPortraitLayer', 'CM_settleMonetPortraitLayers',
  'CM_buildMonetDriftTrack',
]) {
  assert.ok(env[alias] != null, alias + ' 必须由管线 aliasExports 注出');
}
/* 渲染核心手工段随产物落地（引擎 DOM 展开的可辨认符号） */
const engineSrc = fs.readFileSync(ENGINE, 'utf8');
for (const fn of ['monetUpdateSweep', 'monetBuildSweep', 'monetResolveLineTone', 'monetBuildPositionedEntries',
  'monetGetClippedTextMask', 'monetComposeLineMasks', 'monetBuildScrollableRailEntries', 'monetFindLineIndexAtTime',
  'MONET_SCROLL_TRANSITION', 'monetSampleRawSpectrumProfile', 'monetBuildSpectrumAnchors']) {
  assert.ok(engineSrc.includes(fn), '渲染核心手工段必须包含 ' + fn);
}

/* ---------- 2) 关键算法（Folia 闭包原函数，数值级） ---------- */

/* monetLyricMotion.ts:9-22 resolveMonetGlow：rise=end-start ×1.18，smoothstep 升/衰 */
{
  assert.equal(env.CM_resolveMonetGlow(5, 10, 12, 13), 0);            // 起唱前
  const peak = 10 + (12 - 10) * 1.18;                                  // 12.36
  const tail = Math.max(13, 12 + 1.05);                                // 13.05（end+1.05 胜出）
  assert.ok(Math.abs(env.CM_resolveMonetGlow(peak, 10, 12, 13) - 1) < 1e-9, '峰值处辉光恰为 1');
  assert.ok(Math.abs(env.CM_resolveMonetGlow(11.18, 10, 12, 13) - 0.5) < 1e-9, '上升段中点 smoothstep=0.5');
  assert.equal(env.CM_resolveMonetGlow(tail, 10, 12, 13), 0);          // tail 尽头归零
  const half = peak + (tail - peak) / 2;
  assert.ok(Math.abs(env.CM_resolveMonetGlow(half, 10, 12, 13) - 0.5) < 1e-9, '衰减段中点 0.5（驻留感）');
}

/* monetLyricMotion.ts:25-47 resolveMonetFillWidth：timings 逐字插值 / 均匀回退 */
{
  const offsets = [0, 10, 20];
  const timings = [{ startTime: 0, endTime: 10, char: 'あ' }, { startTime: 10, endTime: 20, char: 'い' }];
  assert.equal(env.CM_resolveMonetFillWidth(5, 0, 20, offsets, timings), 5);
  assert.equal(env.CM_resolveMonetFillWidth(15, 0, 20, offsets, timings), 15);
  assert.equal(env.CM_resolveMonetFillWidth(-1, 0, 20, offsets, timings), 0);
  assert.equal(env.CM_resolveMonetFillWidth(30, 0, 20, offsets, timings), 20);
  assert.equal(env.CM_resolveMonetFillWidth(10, 0, 20, offsets, []), 10);   // 无 timings 均匀：progress .5 → idx .5 → 5+5
}

/* monetLyricMotion.ts:365-377 resolveMonetWordStatus 三态（monetLyricsModel 内） */
{
  assert.equal(env.CM_resolveMonetWordStatus(0.9, 1, 2), 'waiting');
  assert.equal(env.CM_resolveMonetWordStatus(1.0, 1, 2), 'active');
  assert.equal(env.CM_resolveMonetWordStatus(2.0, 1, 2), 'active');
  assert.equal(env.CM_resolveMonetWordStatus(2.1, 1, 2), 'passed');
}

/* monetLyricsModel.ts:380-455 buildMonetDisplayTokens：timed 词间的标点/空格保留为静态 token */
{
  const line = {
    fullText: 'Hello, world',
    startTime: 1, endTime: 3,
    words: [{ text: 'Hello', startTime: 1, endTime: 2 }, { text: 'world', startTime: 2, endTime: 3 }]
  };
  const tokens = env.CM_buildMonetDisplayTokens(line);
  assert.equal(tokens.length, 3);
  assert.equal(tokens[0].text, 'Hello');
  assert.equal(tokens[0].timed, true);
  assert.equal(tokens[1].text, ', ');
  assert.equal(tokens[1].timed, false);
  assert.equal(tokens[2].text, 'world');
  assert.equal(tokens[2].startTime, 2);
  // 无 words 的 LRC 行 → 单 timed token 覆盖整行 + grapheme 均分时间轴
  const lrcLine = { fullText: '晚安', startTime: 0, endTime: 2, words: [] };
  const lrcTokens = env.CM_buildMonetDisplayTokens(lrcLine);
  assert.equal(lrcTokens.length, 1);
  assert.equal(lrcTokens[0].timed, true);
  assert.equal(lrcTokens[0].graphemeTimings.length, 2);
}

/* monetLyricsModel.ts:350-363/491-536 buildMonetVisibleLineEntries：±2 窗口与三态 */
{
  const mk = (t, text) => ({ startTime: t, endTime: t + 2, fullText: text, words: [{ text, startTime: t, endTime: t + 2 }] });
  const lines = [0, 1, 2, 3, 4, 5, 6].map((i) => mk(i * 3, '行' + i));
  const entries = env.CM_buildMonetVisibleLineEntries({
    lines, currentLineIndex: 3,
    activeLine: lines[3], recentCompletedLine: null, upcomingLine: lines[4],
    currentTime: 9, before: 2, after: 2
  });
  assert.equal(entries.length, 5);                    // 行 1..5
  assert.equal(entries[2].offset, 0);
  assert.equal(entries[2].status, 'active');
  assert.equal(entries[0].status, 'passed');
  assert.equal(entries[4].status, 'waiting');
  // 无 active 且无 upcoming/recent → 空窗口
  assert.equal(env.CM_buildMonetVisibleLineEntries({
    lines, currentLineIndex: -1, activeLine: null, recentCompletedLine: null,
    upcomingLine: null, currentTime: -5, before: 2, after: 2
  }).length, 0);
}

/* monetLyricsModel.ts:179-199 大屏缩放与字号 clamp（1280 视口 stub） */
{
  assert.equal(env.CM_resolveMonetLargeScreenScale(1200), 1);
  assert.ok(Math.abs(env.CM_resolveMonetLargeScreenScale(2200) - 1.16) < 1e-9);
  assert.ok(Math.abs(env.CM_resolveMonetLargeScreenScale(1868) - 1.08) < 1e-9);
  // resolveClampFontPx(1.34rem, 2.75vw, 2.28rem) @1280 → min(36.48, max(21.44, 35.2)) = 35.2
  assert.ok(Math.abs(env.CM_resolveClampFontPx(1.34, 2.75, 2.28) - 35.2) < 1e-9);
  assert.ok(Math.abs(env.CM_resolveMonetSweepEdgeSoftness(40) - 16) < 1e-9);   // min(40*.45,16)=16
  assert.equal(env.CM_resolveMonetSweepEdgeSoftness(10), 6);                    // 地板 6
  // resolveMonetSweepEnd：掩膜前端外扩，末端整词清除
  assert.ok(Math.abs(env.CM_resolveMonetSweepEnd(50, 100, 16) - 58) < 1e-9);   // 50 + 16*.5
  assert.equal(env.CM_resolveMonetSweepEnd(0, 100, 16), 0);
}

/* monetLyricsModel.ts:611-678 measureMonetLineLayout（pretext stub 下确定数值） */
{
  const line = { startTime: 0, endTime: 2, fullText: '测试歌词行', words: [{ text: '测试歌词行', startTime: 0, endTime: 2 }], translation: '测试翻译' };
  const active = env.CM_measureMonetLineLayout({
    line, status: 'active',
    fontPx: 36, translationFontPx: 18,
    fontStack: 'serif', translationFontStack: 'serif',
    fontWeight: 600, translationFontWeight: 500, secondaryTranslationFontWeight: 400,
    maxWidthPx: 600, subtitleContentMode: 'translation'
  });
  assert.equal(active.textLineCount, 2);              // stub measureRichInlineStats → 2
  assert.equal(active.visibleTextLineCount, 2);       // active 上限 14
  assert.ok(Math.abs(active.lineHeightPx - 36 * 1.18) < 1e-9);   // 无 canvas → 默认 fontPx*1.18
  assert.ok(Math.abs(active.textPaddingTopPx - Math.max(36 * 0.16, 8)) < 1e-9);
  assert.ok(Math.abs(active.textPaddingBottomPx - Math.max(36 * 0.34, 14)) < 1e-9);
  assert.equal(active.subtitleTracks.length, 1);      // translation 轨
  assert.equal(active.subtitleTracks[0].role, 'translation');
  assert.equal(active.subtitleTracks[0].text, '测试翻译');
  assert.ok(Math.abs(active.subtitleTracks[0].paddingTopPx - Math.max(18 * 0.45, 7)) < 1e-9);
  assert.ok(Math.abs(active.visualHeightPx - (active.textHeightPx + active.translationHeightPx)) < 1e-9);
  assert.equal(active.isTextOverflowingWidth, false); // maxLineWidth 300 ≤ 600

  const waiting = env.CM_measureMonetLineLayout({
    line, status: 'waiting',
    fontPx: 36, translationFontPx: 18,
    fontStack: 'serif', translationFontStack: 'serif',
    fontWeight: 600, translationFontWeight: 500, secondaryTranslationFontWeight: 400,
    maxWidthPx: 600, subtitleContentMode: 'translation'
  });
  assert.equal(waiting.visibleTextLineCount, 2);      // 非 active 上限 2
  assert.equal(waiting.subtitleTracks.length, 0);     // 仅 active 行测字幕轨

  /* buildMonetLayoutCacheKey（:586-608）：同几何不同 status → 不同 key；同 status → 同 key */
  const entry = { index: 1, line, status: 'active' };
  const inputs = {
    fontPx: 36, translationFontPx: 18, fontStack: 'serif', translationFontStack: 'serif',
    fontWeight: 600, translationFontWeight: 500, secondaryTranslationFontWeight: 400,
    maxWidthPx: 600, subtitleContentMode: 'translation'
  };
  const kA = env.CM_buildMonetLayoutCacheKey(entry, inputs);
  const kB = env.CM_buildMonetLayoutCacheKey(entry, inputs);
  assert.equal(kA, kB);
  assert.notEqual(kA, env.CM_buildMonetLayoutCacheKey({ index: 1, line, status: 'waiting' }, inputs));
}

/* monetPortraitCrossfade.ts：层栈 push/settle 全规则（vm realm 对象 → JSON 比较原型无关） */
{
  const L = (key, src) => ({ key, src });
  const J = (v) => JSON.stringify(v);
  let stack = env.CM_pushMonetPortraitLayer([], 'a', 'k1');
  assert.equal(J(stack), J([L('k1', 'a')]));
  const same = env.CM_pushMonetPortraitLayer(stack, 'a', 'k2');
  assert.ok(same === stack, '顶层重复 push 必须原样返回（monetPortraitCrossfade.ts:37-44）');
  stack = env.CM_pushMonetPortraitLayer(stack, 'b', 'k2');
  assert.equal(env.CM_monetPortraitTargetSource(stack), 'b');
  stack = env.CM_pushMonetPortraitLayer(stack, 'c', 'k3');
  stack = env.CM_pushMonetPortraitLayer(stack, 'd', 'k4');
  stack = env.CM_pushMonetPortraitLayer(stack, 'e', 'k5');
  assert.equal(stack.length, env.CM_MONET_PORTRAIT_MAX_LAYERS, '栈深封顶 4');
  assert.equal(stack[0].src, 'b', '底部层被丢弃');
  const settled = env.CM_settleMonetPortraitLayers(stack, 'k4');
  assert.equal(J(settled), J([L('k4', 'd'), L('k5', 'e')]));
  assert.equal(env.CM_settleMonetPortraitLayers(stack, 'k9'), stack, 'settle 键不在栈中 → 原样');
  assert.equal(env.CM_MONET_PORTRAIT_FADE_MS, 900);
}

/* monetBackgroundDrift.ts：240s 循环 / 157 采样 / minScale 公式 */
{
  const track = env.CM_buildMonetDriftTrack(0.5);
  assert.equal(track.keyframes.length, 157);
  assert.equal(track.durationMs, 240000);
  assert.ok(Math.abs(track.maxTravelPercent - 1.7) < 1e-9);            // 3.4*0.5
  assert.ok(Math.abs(track.minScale - (1 + (1.7 / 100) * 2 + 0.01)) < 1e-9);
  assert.match(track.keyframes[0].transform, /translate3d\(/);
  assert.match(track.keyframes[0].transform, /scale\(/);
}

/* monetBackgroundPipeline.ts：水洗端点/亮度折线 + 烘焙缓存 key */
{
  const dark = { r: 10, g: 10, b: 12 };
  const light = { r: 245, g: 245, b: 245 };
  const ep = env.CM_resolveWashEndpoints(dark, light);
  assert.equal(ep.shadow, dark);
  assert.equal(ep.highlight, light);
  assert.ok(Math.abs(env.CM_resolveWashColor(0.55, dark, { r: 200, g: 80, b: 40 }, light).r - 200) < 1e-9);
  assert.equal(env.CM_checkCanvasFilterSupport(), false, 'Node 无 document → 不支持（浏览器路径走真实检测）');

  const theme = { backgroundColor: '#0a0b0c', primaryColor: '#f4f0e8', accentColor: '#ffb98a' };
  const tuning = {
    backgroundSource: 'cover-derived', backgroundBlurPx: 6, backgroundOverlayOpacity: 0.74,
    backgroundGrayscale: 0, backgroundSaturation: 1.05, backgroundWash: 0.34,
    backgroundWashColorMode: 'theme', backgroundWashCustomColor: '#8fb7ff',
    backgroundStreaksEnabled: true
  };
  const key1 = env.CM_getMonetBackgroundCacheKey({ coverUrl: 'c.png', monetBackgroundImage: null, theme, tuning });
  const key2 = env.CM_getMonetBackgroundCacheKey({ coverUrl: 'c.png', monetBackgroundImage: null, theme, tuning });
  assert.equal(key1, key2);
  assert.notEqual(key1, env.CM_getMonetBackgroundCacheKey({
    coverUrl: 'c.png', monetBackgroundImage: null, theme,
    tuning: Object.assign({}, tuning, { backgroundStreaksEnabled: false })
  }), 'streaks 烘焙进位图 → 必须失效缓存（monetBackgroundPipeline.ts:264-266）');
  assert.equal(key1, env.CM_getMonetBackgroundCacheKey({
    coverUrl: 'c.png', monetBackgroundImage: null, theme,
    tuning: Object.assign({}, tuning, { backgroundDriftEnabled: false })
  }), 'drift 是 DOM 侧变换不进位图 → 不失效缓存');
}

/* monetLyricMotion.ts:5-11 spring 原值（MONET_SCROLL_TRANSITION 引用的常量） */
{
  assert.equal(JSON.stringify(env.CM_MONET_SCROLL_SPRING), JSON.stringify({ stiffness: 142, damping: 28, mass: 0.82 }));
  assert.equal(JSON.stringify(env.CM_MONET_SCALE_SPRING), JSON.stringify({ stiffness: 150, damping: 30, mass: 0.78 }));
  assert.equal(env.CM_MONET_ROW_BASE_MAX_WIDTH_PX, 1520);
  assert.equal(env.CM_MONET_PORTRAIT_BASE_MAX_PX, 430);
  assert.equal(env.CM_MONET_PORTRAIT_INNER_BASE_MAX_PX, 380);
}

/* ---------- 3) 桥契约 ---------- */
{
  const src = fs.readFileSync(BRIDGE, 'utf8');
  new vm.Script(src, { filename: '24-monet.js' });   // 可编译
  assert.match(src, /function applyMonetMode\(on, opts\)/, '注册表 applyFn 入口名必须保留');
  assert.match(src, /var monetMode\s*=/, '注册表 stateVar 名必须保留');
  assert.match(src, /MonetMonetEngine\(/, '桥必须创建引擎实例');
  assert.match(src, /getAdjustedLyricPlaybackTime/, '时间源走歌词偏移修正');
  assert.match(src, /animationIntensity:\s*\(typeof visAnimationIntensityCurrent/, '强度档随 fx.visAnimationIntensity 下发（07-fx/11 数据面；无数据面回退 normal，four-modes 沙箱测试覆盖）');
  assert.match(src, /wordColors:\s*\(typeof visWordColorsList/, '词色表随 orangesea-vis-word-colors-v1 下发（07-fx/11 数据面；空表回退 accentColor，CM_resolveWordColor 测试覆盖）');
  assert.match(src, /audioBands/, '五通道音频桥（AudioOverlay 消费）');
  assert.match(src, /getControlCoverUrl/, '封面源接入（海报烘焙 + 相框 crossfade）');
  assert.ok(!/monetBuildPoster|monetBuildRail|monetApplyTone|scrollIntoView/.test(src), '旧简化实现的核心符号不得残留');
}

/* ---------- 4) 注册接线 ---------- */
{
  const loader = fs.readFileSync(LOADER, 'utf8');
  assert.match(loader, /js\/modules\/10-shell\/24-monet\.js/, 'index-loader 清单挂 24-monet 桥');

  const index = fs.readFileSync(INDEX, 'utf8');
  assert.match(index, /js\/modules\/10-shell-monet-engine\/monet-engine\.js/, 'index.html 静态注入引擎产物');
  const engineAt = index.indexOf('10-shell-monet-engine/monet-engine.js');
  const loaderAt = index.indexOf('js/index-loader.js');
  assert.ok(engineAt > 0 && loaderAt > engineAt, '引擎产物必须在 index-loader 之前加载');
  const pretextAt = index.indexOf('vendor/pretext/pretext.bundle.js');
  assert.ok(pretextAt > 0 && pretextAt < engineAt, 'pretext 全局测量必须先于 monet 引擎');
  assert.match(index, /id="monet-engine-host"/, '引擎宿主容器存在');
  for (const legacy of ['monet-poster', 'monet-rail', 'monet-artist', 'monet-title', 'monet-capsule-text', 'monet-portrait-img', 'monet-composition']) {
    assert.ok(!index.includes('id="' + legacy + '"') && !index.includes('class="' + legacy) && !(new RegExp('class="[^"]*\\b' + legacy + '\\b')).test(index),
      '旧 DOM 结构（' + legacy + '）必须移除');
  }

  const registry = fs.readFileSync(REGISTRY, 'utf8');
  assert.match(registry, /id:\s*'monet'[\s\S]*?stateVar:\s*'monetMode'/, '注册表 monet 行保留');
  assert.match(registry, /applyFn:\s*'applyMonetMode'/, '注册表 applyFn 保留');

  const css = fs.readFileSync(CSS, 'utf8');
  assert.ok(!/\.monet-(poster|row|word|composition|text-col|portrait|capsule|decor|header|title|rule|rail)/.test(css),
    'monet.css 不得再持引擎动画类（引擎 inline style 单主路径）');
  assert.match(css, /#monet-engine-host/, 'monet.css 提供引擎宿主定位');
}

console.log('OK tests/monet.test.js — 引擎产物加载/关键算法/桥契约/注册接线 全部通过');
