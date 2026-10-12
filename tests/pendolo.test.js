'use strict';
/* 钟摆（pendolo）· 原版渲染核心引擎的产物与接线验证
   ----------------------------------------------------------------------------
   覆盖：
   1) 引擎产物可加载：vm 沙箱执行 pendolo-engine.js 的 IIFE，
      env.PendoloPendoloEngine 与全部 CM_* 闭包别名注入齐全；
   2) 关键算法（直接调用 env 注出的 Folia 闭包符号，数值级断言）：
      pendoloGeometry 弧形轮布局（±90° 门控 / 行高自适应角距 / alpha 衰减 /
      缩放）· pendoloTimeline 锚点四态与弧外渐隐 · pendoloMotionProfile
      normal 档与副歌表现 · pendoloSubtitleTracks 焦点/闲置双档与占位剔除 ·
      pendoloColorRuns 同色合并 · graphemeTiming 行级逐字时序 · colorMix；
      手工核 DEFAULT_PENDOLO_TUNING 原值 + tuning 合并；
   3) 桥契约：20b 桥可编译、applyPendoloMode/pendoloMode 入口齐全、
      引擎实例创建 / 时间源 / 频段 / 权威行索引 / seek 接线 / tuning 原值 /
      主题词色表 / 主题图标形状 / Latent 背景层接线（宿主/信号/封面/暂停/热更）；
   4) 注册接线：registry 行、index-loader 清单（旧简化实现移除）、
      index.html 引擎 script 与 pendolo-engine-host、pendolo-bg-layer 容器、
      pendolo.css 不再持 .pd-* 动画类（引擎 inline style 单主路径）。
   算法参照：folia-major src/components/visualizer/pendolo/*（AGPL-3.0，
   见 NOTICE.md）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'public', 'js', 'modules', '10-shell-pendolo-engine', 'pendolo-engine.js');
const BRIDGE = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20b-pendolo-engine-bridge.js');
const LOADER = path.join(ROOT, 'public', 'js', 'index-loader.js');
const INDEX = path.join(ROOT, 'public', 'index.html');
const REGISTRY = path.join(ROOT, 'public', 'js', 'modules', '02-visual', '90-visualizer-registry.js');
const CSS = path.join(ROOT, 'public', 'css', 'pendolo.css');
const OLD_IMPL = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20-pendolo.js');

/* ---------- 1) 引擎产物可加载（vm 沙箱执行，env 注出面） ---------- */
const sandbox = { console, Math, JSON, Object, Array, Number, String, parseInt, parseFloat, isFinite, RegExp, Date, Intl, Map, Set, WeakMap, Symbol, Promise };
sandbox.window = sandbox;
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(ENGINE, 'utf8'), { filename: 'pendolo-engine.js' }).runInContext(sandbox);
const env = sandbox.window;

assert.equal(typeof env.PendoloPendoloEngine, 'function', 'env.PendoloPendoloEngine 必须由引擎产物注出');
assert.equal(typeof env.pendoloResolveTuning, 'function', 'env.pendoloResolveTuning 必须由引擎产物注出');
for (const alias of [
  'CM_colorWithAlpha', 'CM_mixColors',
  'CM_splitLyricGraphemes', 'CM_buildLineGraphemeTimeline',
  'CM_resolveLyricSubtitleTracks', 'CM_resolveSubtitleContentMode',
  'CM_SECONDARY_TRACK_SIZE_FACTOR', 'CM_SECONDARY_TRACK_OPACITY',
  'CM_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK', 'CM_SECONDARY_TRACK_GAP_EM',
  'CM_resolveThemeFontStack', 'CM_resolveThemeFontWeight', 'CM_resolveThemeTranslationFontStack',
  'CM_prepareWordColorMatchers', 'CM_buildWordColorRangesFromMatchers', 'CM_resolveTokenColorMap',
  'CM_measureMonetGraphemeOffsets',
  'CM_calculatePendoloWheelLayout', 'CM_measurePendoloLineWidth',
  'CM_resolvePendoloFallbackAnchorIndex', 'CM_resolvePendoloRotatingLineOpacity',
  'CM_resolvePendoloMotionProfile', 'CM_resolvePendoloChorusPresentation',
  'CM_buildPendoloTextLayout', 'CM_resolvePendoloSubtitleTracks',
  'CM_buildPendoloSubtitleFontSpec', 'CM_sumPendoloSubtitleTrackHeights',
  'CM_buildPendoloColorRuns',
]) {
  assert.ok(env[alias] != null, alias + ' 必须由管线 aliasExports 注出');
}

/* ---------- 2) 关键算法（Folia 闭包原函数，数值级） ---------- */

/* pendoloGeometry.ts：弧形轮布局（visibleWindowCount=9 → angleStep=(100°)/8；
   ±90° 右半圆门控；alpha=cos(0.75θ)^2.5·(1-0.18d)；焦点 activeScale/邻行
   max(0.7, 1-0.08d)） */
{
  const tuning = { arcRadius: 0.42, arcAngleDeg: 100, wheelCenterX: 0, wheelCenterY: 0.5, activeScale: 1.25 };
  const mk = (i) => ({ startTime: i * 2, endTime: i * 2 + 2, words: [], fullText: 'line' + i });
  const items = env.CM_calculatePendoloWheelLayout([mk(0), mk(1), mk(2)], 0, 0, 1600, 900, tuning, 0);
  assert.equal(items.length, 3, '第三行角距 2×0.218=0.437 rad < π/2，仍在右半圆窗口内');
  const focal = items[0];
  assert.equal(focal.index, 0);
  assert.equal(focal.isActive, true);
  assert.equal(focal.scale, 1.25);                       // 焦点 = activeScale
  assert.equal(focal.alpha, 1);                          // cos(0)^2.5·(1-0)=1
  assert.equal(Math.round(focal.x), Math.round(1600 * 0 + Math.min(1600, 900) * 0.42));  // centerX+R
  assert.equal(focal.y, 450);                            // centerY
  const next = items[1];
  const step = (100 * Math.PI / 180) / 8;
  assert.ok(Math.abs(next.angleRad - step) < 1e-9, '邻行角距 = angleStepRad（无行高数据时）');
  assert.equal(next.scale, 0.92);                        // max(0.7, 1-0.08)
  assert.ok(Math.abs(next.alpha - Math.pow(Math.cos(step * 0.75), 2.5) * 0.82) < 1e-9);

  /* 行高自适应角距：spacing = max(angleStep, (h_prev+h_cur+24)/(2R))（:58-69） */
  const tall = env.CM_calculatePendoloWheelLayout([mk(0), mk(1)], 0, 0, 1600, 900, tuning, 0, [0, 600]);
  const R = Math.min(1600, 900) * 0.42;
  const spacing = Math.max(step, (0 + 600 + 24) / (2 * R));
  assert.ok(Math.abs(tall[1].angleRad - spacing) < 1e-9, '大行高块按防重叠公式拉开角距');
}

/* pendoloTimeline.ts：锚点四态 + 弧外渐隐（110° 可见 / 28° 边缘） */
{
  const line = { startTime: 0, endTime: 2, words: [], fullText: 'a' };
  assert.equal(env.CM_resolvePendoloFallbackAnchorIndex([line], 0, 0, false, 1), 0, '活跃行内 → 该行');
  assert.equal(env.CM_resolvePendoloFallbackAnchorIndex([line], -1, 0, false, 1), -1, '未见任何行 → -1');
  assert.equal(env.CM_resolvePendoloFallbackAnchorIndex([line], -1, 0, true, 1), 0.5, '行间隙 → lastValid+0.5');
  assert.equal(env.CM_resolvePendoloFallbackAnchorIndex([line], -1, 0, true, 9), 1, '超过最后行渲染尾 → lines.length');
  assert.equal(env.CM_resolvePendoloRotatingLineOpacity(100, 10, 0.8), 0, '可见角 110° ≥ 110 → 全隐');
  assert.ok(Math.abs(env.CM_resolvePendoloRotatingLineOpacity(90, 10, 0.8) - 0.8 * (10 / 28)) < 1e-9, '边缘 28° 线性淡入（110−100=10）');
  assert.equal(env.CM_resolvePendoloRotatingLineOpacity(0, 0, 0.8), 0.8, '焦点轴上不衰减');
}

/* pendoloMotionProfile.ts：normal 档原值 + 副歌表现闸门 */
{
  const profile = env.CM_resolvePendoloMotionProfile('normal');
  assert.equal(profile.escapementSpringMultiplier, 1);
  assert.equal(profile.chorusHaloOpacity, 0.34);
  assert.equal(profile.chorusHaloScale, 1.026);
  assert.equal(profile.chorusTransitionDuration, 0.42);
  const active = env.CM_resolvePendoloChorusPresentation(true, true, profile);
  assert.deepEqual(
    { a: active.accentMix, h: active.haloOpacity, g: active.glowMultiplier },
    { a: 0.58, h: 0.34, g: 1 });
  const idleChorus = env.CM_resolvePendoloChorusPresentation(true, false, profile);
  assert.equal(idleChorus.haloOpacity, 0, '非当前行副歌不发光（isPlaybackActive 闸门）');
  assert.equal(idleChorus.accentMix, 0.32);
}

/* pendoloSubtitleTracks.ts：焦点 16px/闲置 12px、副轨 SECONDARY_TRACK_*、占位剔除 */
{
  const line = { translation: '编织那没有实现的神文', words: [], startTime: 0, endTime: 2, fullText: 'x' };
  const focal = env.CM_resolvePendoloSubtitleTracks(line, { mode: 'translation', hidden: false, focal: true, subtitleFontScale: 1 });
  assert.equal(focal.length, 1);
  assert.equal(focal[0].fontPx, 16);
  assert.equal(focal[0].lineHeightPx, 24);               // 16×1.5
  assert.equal(focal[0].fontWeightFallback, 500);
  assert.equal(focal[0].gapEm, 0.25);
  assert.equal(focal[0].opacityFactor, 1);
  const idle = env.CM_resolvePendoloSubtitleTracks(line, { mode: 'translation', hidden: false, focal: false, subtitleFontScale: 1 });
  assert.equal(idle[0].fontPx, 12);
  assert.equal(env.CM_resolvePendoloSubtitleTracks(line, { mode: 'translation', hidden: true, focal: true, subtitleFontScale: 1 }).length, 0);
  const placeholder = env.CM_resolvePendoloSubtitleTracks(
    { translation: '//', words: [], startTime: 0, endTime: 2, fullText: 'x' },
    { mode: 'translation', hidden: false, focal: true, subtitleFontScale: 1 });
  assert.equal(placeholder.length, 0, '「//」占位行不进副字幕（READABLE_TEXT_PATTERN）');
}

/* pendoloColorRuns.ts：相邻同色 grapheme 合并为一个 shaping 安全 run */
{
  const tokenColors = new Map([['1', '#ff0000']]);
  const runs = env.CM_buildPendoloColorRuns('abc', 0, tokenColors, '#123456');
  assert.equal(runs.length, 3);
  assert.equal(runs[0].color, '#123456');
  assert.equal(runs[1].color, '#ff0000');
  assert.equal(runs[1].text, 'b');
  const merged = env.CM_buildPendoloColorRuns('abcd', 0, new Map([['1', '#ff0000'], ['2', '#ff0000']]), '#123456');
  assert.equal(merged.length, 3);
  assert.equal(merged[1].text, 'bc');
}

/* graphemeTiming.ts：行级逐字时序（词均分 + 空隙/未覆盖回填） */
{
  const timeline = env.CM_buildLineGraphemeTimeline({
    fullText: 'ab c', words: [{ text: 'ab', startTime: 1, endTime: 3 }], startTime: 1, endTime: 3
  });
  assert.equal(timeline.length, 4);
  assert.equal(timeline[0].startTime, 1);
  assert.equal(timeline[1].endTime, 3);
  assert.equal(timeline[2].startTime, 3, '空格 gap 取词起点（word.startTime）');
  assert.equal(timeline[3].startTime, timeline[3].endTime, '未覆盖尾字零宽（lastResolvedTime）');
}

/* colorMix.ts */
{
  assert.equal(env.CM_colorWithAlpha('#ff8c00', 0.7), 'rgba(255, 140, 0, 0.7)');
  assert.equal(env.CM_mixColors('#ffffff', '#000000', 0.5), 'rgba(128, 128, 128, 1)');
}

/* wordColoring 数据链数值级：词色表条目 → matcher → 命中区间 → token 色映射
   （pendolo 焦点行 colorRuns 消费路径，PendoloActiveLyricSweep.tsx:141-162） */
{
  const wordColors = [
    { word: '月光', color: '#ffd700' },
    { word: 'river', color: '#00bfff' },
    { word: '', color: '#ff0000' },          // 空 word 剔除
    { word: 'ghost', color: '' }             // 空 color 剔除
  ];
  const matchers = env.CM_prepareWordColorMatchers(wordColors, true);
  assert.equal(matchers.length, 2, '无效条目（空 word/空 color）剔除');
  const ranges = env.CM_buildWordColorRangesFromMatchers('月光下的 river 河谷', matchers);
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].startOffset, 0);
  assert.equal(ranges[0].endOffset, 2);
  assert.equal(ranges[0].color, '#ffd700', 'CJK 短语整段命中');
  assert.equal(ranges[1].color, '#00bfff', '英文词命中');
  const tokens = [];
  let cursor = 0;
  for (const ch of '月光下的 river 河谷') {
    tokens.push({ key: String(tokens.length), timed: true, startOffset: cursor, endOffset: cursor + ch.length });
    cursor += ch.length;
  }
  const tokenColors = env.CM_resolveTokenColorMap(tokens, ranges);
  assert.equal(tokenColors.get('0'), '#ffd700');
  assert.equal(tokenColors.get('6'), '#00bfff', '词色表真正落到逐字 token（r=iver 首 token）');
  assert.equal(tokenColors.get('2'), undefined, '未命中字不着色 → colorRuns 回退 accentMix 混合填充色');
}

/* 重挂载语义（entry.tsx:19 key={props.seed}）：setLines/setSeed 都走
   resetForRemount（弹簧/滚轮/机械演示/行观察状态回到初挂载，弹簧初值=初始
   targetLineIndex 无开场弹跳）——引擎产物源文本级断言（DOM 依赖无法 vm 直跑） */
{
  const src = fs.readFileSync(ENGINE, 'utf8');
  assert.match(src, /function resetForRemount\(\)/, '引擎产物持重挂载等价函数');
  const setLines = src.match(/setLines:\s*function[\s\S]*?\},/);
  assert.ok(setLines && /resetForRemount\(\)/.test(setLines[0]), 'setLines 走重挂载重置（歌词数据整体替换 = 新组件实例）');
  const setSeed = src.match(/setSeed:\s*function[\s\S]*?\},/);
  assert.ok(setSeed && /resetForRemount\(\)/.test(setSeed[0]), 'setSeed 走重挂载重置（key={props.seed} 换歌重挂载语义）');
  assert.match(src, /z-index:-10/, '副歌光晕 -z-10 同构（VisualizerPendolo.tsx:542）');
  assert.match(src, /pdThemeContentKey/, '行内容 stamp 持主题色/词色键（setTheme 热更重建行内容，词色/主题色断链修复）');
}

/* 手工核：DEFAULT_PENDOLO_TUNING（types.ts:515-527）原值 + 缺省合并 */
{
  const d = env.PENDOLO_DEFAULT_TUNING;
  assert.deepEqual(
    { r: d.arcRadius, a: d.arcAngleDeg, x: d.wheelCenterX, y: d.wheelCenterY, s: d.tickSnappiness, f: d.activeScale, g: d.showGearDecor },
    { r: 0.42, a: 100, x: 0.0, y: 0.50, s: 2.0, f: 1.25, g: 'subtle' });
  assert.equal(d.showCenterGradient, true);
  assert.equal(d.showCoverOnWatchFace, false);
  assert.equal(d.enableLineGlow, false);
  const merged = env.pendoloResolveTuning({ arcRadius: 0.6 });
  assert.equal(merged.arcRadius, 0.6);
  assert.equal(merged.tickSnappiness, 2.0, '未给字段回退默认');
  assert.equal(env.pendoloResolveTuning(null).activeScale, 1.25);
}

/* ---------- 3) 桥契约 ---------- */
{
  const src = fs.readFileSync(BRIDGE, 'utf8');
  new vm.Script(src, { filename: '20b-pendolo-engine-bridge.js' });   // 可编译
  assert.match(src, /function applyPendoloMode\(on, opts\)/, '注册表 applyFn 入口名必须保留');
  assert.match(src, /var pendoloMode\s*=/, '注册表 stateVar 名必须保留');
  assert.match(src, /PendoloPendoloEngine\(/, '桥必须创建引擎实例');
  assert.match(src, /getAdjustedLyricPlaybackTime/, '时间源走歌词偏移修正');
  assert.match(src, /animationIntensity:\s*\(typeof visAnimationIntensityCurrent/, '强度档随 fx.visAnimationIntensity 下发（07-fx/11 数据面；无数据面回退 normal，four-modes 沙箱测试覆盖）');
  assert.match(src, /wordColors:\s*\(typeof visWordColorsList/, '词色表随 orangesea-vis-word-colors-v1 下发（07-fx/11 数据面；空表回退 accentColor，CM_resolveWordColor 测试覆盖）');
  assert.match(src, /lyricsIcons:\s*\[\]/, 'Theme.lyricsIcons 形状字段（宿主无主题图标表 → 空表，引擎走原版 ?? Star 兜底，VisualizerPendolo.tsx:421-424）');
  assert.match(src, /arcRadius:\s*0\.42[\s\S]*?tickSnappiness:\s*2\.0[\s\S]*?activeScale:\s*1\.25/, 'tuning 取 DEFAULT_PENDOLO_TUNING 原值');
  assert.match(src, /findStageLyricIndexAtTime/, '权威行索引经应用歌词管线供给');
  assert.match(src, /onLyricLineSeek:\s*pendoloSeekToLine/, '行点击 seek 接线到引擎');
  assert.match(src, /getActiveLyricTimingOffsetSeconds/, 'seek 回退歌词校准偏移');

  /* Latent 背景层（VisualizerShell 默认背景宿主化，20b-tilt/classic 桥同范式） */
  assert.match(src, /function startPendoloBg\(\)/, '背景层创建入口');
  assert.match(src, /getElementById\('pendolo-bg-layer'\)/, '背景宿主 = #pendolo-bg-layer（z 序在歌词宿主之下）');
  assert.match(src, /typeof TiltLatentBackground !== 'function'/, 'tilt 引擎产物缺失/WebGL2 不可用 → 不挂载，保底暖夜基底');
  assert.match(src, /pendoloLatentAudioPower[\s\S]*?pendoloLatentBands[\s\S]*?pendoloLatentCoverUrl[\s\S]*?pendoloLatentPaused/, '背景信号四联（audioPower/bands/封面/暂停）');
  assert.match(src, /tiltBandsCompute/, '五频带按原版 Hz 分箱（usePlaybackVisualizerBridge.ts:104-120，tilt 引擎注出同源复用）');
  assert.match(src, /tiltBandsBreath/, '不可闻 → 呼吸值分支（:121-131）');
  assert.match(src, /startPendoloBg\(\);/, '进入模式先建背景层（背景先于歌词引擎，引擎失败背景仍独立成立）');
  assert.match(src, /pendoloBg\.setTheme\(theme\)/, '主题热更同步背景层（封面派生色变化跟随）');
  assert.match(src, /pendoloBg\.setCoverUrl\(\)/, '封面变化重取色（LatentBackground.tsx:129-148 轮询等价）');
  assert.match(src, /pendoloBg\.destroy\(\)/, '退出模式销毁背景层');
}

/* ---------- 4) 注册接线 ---------- */
{
  const loader = fs.readFileSync(LOADER, 'utf8');
  assert.match(loader, /js\/modules\/10-shell\/20b-pendolo-engine-bridge\.js/, 'index-loader 清单挂 20b 桥');
  assert.ok(!loader.includes('20-pendolo.js'), '旧简化实现必须从清单移除');

  const index = fs.readFileSync(INDEX, 'utf8');
  assert.match(index, /js\/modules\/10-shell-pendolo-engine\/pendolo-engine\.js/, 'index.html 静态注入引擎产物');
  const engineAt = index.indexOf('10-shell-pendolo-engine/pendolo-engine.js');
  const loaderAt = index.indexOf('js/index-loader.js');
  assert.ok(engineAt > 0 && loaderAt > engineAt, '引擎产物必须在 index-loader 之前加载');
  const pretextAt = index.indexOf('vendor/pretext/pretext.bundle.js');
  assert.ok(pretextAt > 0 && pretextAt < engineAt, 'pretext 全局 bundle 必须在引擎之前（buildPendoloTextLayout 依赖）');
  assert.match(index, /id="pendolo-engine-host"/, '引擎宿主容器存在');
  assert.match(index, /id="pendolo-bg-layer"/, 'Latent 背景宿主容器存在（VisualizerShell 默认背景）');
  const pendoloOverlayAt = index.indexOf('id="pendolo-overlay"');
  const pendoloBgAt = index.indexOf('id="pendolo-bg-layer"');
  const pendoloHostAt = index.indexOf('id="pendolo-engine-host"');
  assert.ok(pendoloOverlayAt > 0 && pendoloOverlayAt < pendoloBgAt && pendoloBgAt < pendoloHostAt,
    'bg-layer 必须先于 engine-host（DOM 后位覆盖，z 序 backdrop → bg → 歌词）');
  /* LatentBackground 由 tilt 引擎产物注出：tilt-engine.js 必须先于 pendolo 引擎/桥加载 */
  const tiltEngineAt = index.indexOf('10-shell-tilt-engine/tilt-engine.js');
  assert.ok(tiltEngineAt > 0 && tiltEngineAt < engineAt, 'tilt 引擎（TiltLatentBackground/tiltBands* 注出方）先于 pendolo 引擎加载');
  assert.ok(index.indexOf('pendolo-canvas') === -1 && index.indexOf('pendolo-wheel') === -1,
    '旧 DOM 结构（pendolo-canvas/pendolo-wheel）必须移除');

  const registry = fs.readFileSync(REGISTRY, 'utf8');
  assert.match(registry, /id:\s*'pendolo'[\s\S]*?stateVar:\s*'pendoloMode'/, '注册表 pendolo 行保留');
  assert.match(registry, /applyFn:\s*'applyPendoloMode'/, '注册表 applyFn 保留');

  const css = fs.readFileSync(CSS, 'utf8');
  assert.ok(!/\.pd-(line|row|sweep|line-body|line-halo|line-tr|line-main)\b/.test(css),
    'pendolo.css 不得再持 .pd-* 行槽/扫光动画类（引擎 inline style 单主路径）');
  assert.match(css, /#pendolo-engine-host/, 'pendolo.css 提供引擎宿主定位');
  assert.match(css, /#pendolo-bg-layer\s*\{[^}]*z-index:\s*1/, 'bg-layer z 序在引擎宿主(z-index:2)之下（Latent 落点在歌词 children 之下）');
  assert.match(css, /#pendolo-bg-layer\s*\{[^}]*pointer-events:\s*none/, 'bg-layer 不拦截交互');
  /* 注释定界符守卫：注释文本内出现成对星号斜杠会提前终止注释并吞掉后随规则
     （2026-10-10 实测：.pd- 加星号斜杠的「弧排」字样令首条规则被解析器丢弃） */
  const open = (css.match(/\/\*/g) || []).length;
  const close = (css.match(/\*\//g) || []).length;
  assert.equal(open, close, `pendolo.css 注释定界符必须成对（/*=${open} vs */=${close}）`);

  assert.ok(!fs.existsSync(OLD_IMPL), '旧简化实现 20-pendolo.js 已删除（不得两套主路径并存）');
}

console.log('OK tests/pendolo.test.js — 引擎产物加载/关键算法/桥契约/注册接线 全部通过');
