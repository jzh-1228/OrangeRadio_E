'use strict';
/* 环歌（claddagh）· 原版渲染核心引擎的产物与接线验证
   ----------------------------------------------------------------------------
   覆盖：
   1) 引擎产物可加载：vm 沙箱执行 claddagh-engine.js 的 IIFE，
      env.CladdaghCladdaghEngine 与全部 CM_* 闭包别名注入齐全；
   2) 关键算法（直接调用 env 注出的 Folia 闭包符号，数值级断言）：
      graphemeTiming 行级逐字时间线 / renderHints 三档分档与 renderEndTime /
      wordColoring 关键词区间着色 / colorMix 颜色混合（claddagh 辉光内核
      0.65 混合的基元）/ glowBlurQuantize 半径量化；
   3) 手工段常量与公式（源文本级）：环排常量（MAX_ARC_SPAN 4.25 /
      LETTER_SPACING_EM 0.04 / BASE_TRACKING_EM 0.18 / BACK_FOLLOW 0.28 /
      BACK_ORBIT 0.52 / ENTRY_LEAD 0.34）、辉光 drop-shadow 拟合比
      （0.5 / 0.4 / 0.2）、DEFAULT_CLADDAGH_TUNING 原值（types.ts:465-471）；
   4) 桥契约：20b 桥可编译、applyCladdaghMode/claddaghMode 入口齐全、
      引擎宿主数据流（toLines 挂 renderHints / MV subscribe / audioBands
      自算 / tuning 原值）；
   5) 注册接线：registry 行、index-loader 清单、index.html script 与
      claddagh-engine-host、claddagh.css 不再持环排动画类（防与
      引擎 inline style 双主路径冲突）、旧简化实现已删除。
   算法参照：folia-major src/utils/lyrics/graphemeTiming.ts、
   src/utils/lyrics/renderHints.ts、src/components/visualizer/wordColoring.ts、
   src/components/visualizer/claddagh/VisualizerCladdagh.tsx（AGPL-3.0，见
   NOTICE.md）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'public', 'js', 'modules', '10-shell-claddagh-engine', 'claddagh-engine.js');
const BRIDGE = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20b-claddagh-engine-bridge.js');
const LOADER = path.join(ROOT, 'public', 'js', 'index-loader.js');
const INDEX = path.join(ROOT, 'public', 'index.html');
const REGISTRY = path.join(ROOT, 'public', 'js', 'modules', '02-visual', '90-visualizer-registry.js');
const CSS = path.join(ROOT, 'public', 'css', 'claddagh.css');
const OLD_IMPL = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20-claddagh.js');

/* ---------- 1) 引擎产物可加载（vm 沙箱执行，env 注出面） ---------- */
const sandbox = { console, Math, JSON, Object, Array, Number, parseInt, parseFloat, isFinite, RegExp, Date, Intl, Map, WeakMap };
sandbox.window = sandbox;
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(ENGINE, 'utf8'), { filename: 'claddagh-engine.js' }).runInContext(sandbox);
const env = sandbox.window;

assert.equal(typeof env.CladdaghCladdaghEngine, 'function', 'env.CladdaghCladdaghEngine 必须由引擎产物注出');
for (const alias of [
  'CM_isGlowBlurQuantized', 'CM_quantizeShadowBlur',
  'CM_colorWithAlpha', 'CM_parseColorChannels', 'CM_mixColors',
  'CM_buildLineRenderHints', 'CM_getLineRenderEndTime',
  'CM_buildLineGraphemeTimeline', 'CM_buildWordGraphemeTimings', 'CM_splitLyricGraphemes',
  'CM_resolveThemeFontStack', 'CM_resolveThemeTranslationFontStack', 'CM_resolveThemeFontWeight',
  'CM_resolveWordColor', 'CM_buildWordColorRanges', 'CM_prepareWordColorMatchers',
  'CM_resolveSubtitleFontSizes',
]) {
  assert.ok(env[alias] != null, alias + ' 必须由管线 aliasExports 注出');
}

/* ---------- 2) 关键算法（Folia 闭包原函数，数值级） ---------- */

/* graphemeTiming.ts：buildLineGraphemeTimeline——词级时序映射回整行逐字，
   行词均分（'世界' 两字词 1→3s：世 [1,2) / 界 [2,3]），行词间 gap 字符
   零时长占位（由 adjustCladdaghTimeline 借时，引擎手工段） */
{
  const line = { fullText: '世界', startTime: 1, endTime: 3, words: [{ text: '世界', startTime: 1, endTime: 3 }] };
  const tl = env.CM_buildLineGraphemeTimeline(line);
  assert.equal(tl.length, 2);
  assert.equal(tl[0].char, '世');
  assert.equal(tl[0].startTime, 1);
  assert.equal(tl[1].char, '界');
  assert.equal(tl[1].endTime, 3);

  /* 无词行：整行均分 */
  const tl2 = env.CM_buildLineGraphemeTimeline({ fullText: 'ab', startTime: 0, endTime: 2, words: [] });
  assert.equal(tl2.length, 2);
  assert.equal(tl2[0].endTime, 1);
}

/* renderHints.ts：行时长三档（0.10/0.18 阈值 + micro 渲染下限 0.067）与
   renderEndTime（claddagh :497-512 renderEnd 拓展的来源） */
{
  const micro = env.CM_buildLineRenderHints(10, 10.05);
  assert.equal(micro.timingClass, 'micro');
  assert.equal(micro.renderEndTime, 10.067);          // MICRO_LINE_RENDER_FLOOR

  const short = env.CM_buildLineRenderHints(0, 0.15);
  assert.equal(short.timingClass, 'short');
  assert.equal(short.wordRevealMode, 'fast');

  // buildLineRenderEndTime：exitDur=0.32、passStart=1.9+0.06、renderEnd = max(2, 2.28)
  const h = env.CM_buildLineRenderHints({ startTime: 0, endTime: 2, words: [{ endTime: 1.9 }] });
  assert.equal(h.renderEndTime, 2.28);
}

/* wordColoring.ts：关键词区间着色（claddagh :405-418 的 charColor 区间
   重叠检测数据源；宿主 wordColors=[] 时返回空 → 高亮回退 accentColor） */
{
  const wordColors = [{ word: '潮水', color: '#3366ff' }];
  const ranges = env.CM_buildWordColorRanges('潮水漫过', wordColors);
  assert.equal(ranges.length, 1);
  assert.deepEqual([ranges[0].startOffset, ranges[0].endOffset], [0, 2]);
  assert.equal(ranges[0].color, '#3366ff');
  assert.equal(env.CM_buildWordColorRanges('潮水漫过', []).length, 0);   // 宿主 wordColors=[] 形态
}

/* colorMix.ts：claddagh 辉光的基元——fadedTargetColor =
   mixColors(target, target, 0, alpha*fade)（:700）与内核
   mixColors(target, core, 0.65, fade)（:716） */
{
  assert.equal(env.CM_mixColors('#ff0000', '#ff0000', 0, 0.5), 'rgba(255, 0, 0, 0.5)');
  assert.equal(env.CM_mixColors('#000000', '#ffffff', 0.65, 1), 'rgba(166, 166, 166, 1)');
  assert.equal(env.CM_colorWithAlpha('#f7b98d', 0.55), 'rgba(247, 185, 141, 0.55)');
}

/* glowBlurQuantize.ts：text-shadow 半径量化（Web 默认 off → 原值直返；
   claddagh :719-722 三层/单层半径均经 quantizeShadowBlur） */
{
  assert.equal(env.CM_quantizeShadowBlur(23.45), 23.45);
  assert.equal(env.CM_quantizeShadowBlur(NaN), 0);
}

/* ---------- 3) 手工段常量与公式（源文本级，数值原值对照
   VisualizerCladdagh.tsx:112-119/:188-190 + types.ts:465-471） ---------- */
{
  const src = fs.readFileSync(ENGINE, 'utf8');
  const need = [
    ['CLADDAGH_MAX_ARC_SPAN = 4.25', /var CLADDAGH_MAX_ARC_SPAN = 4\.25;/],
    ['CLADDAGH_LETTER_SPACING_EM = 0.04', /var CLADDAGH_LETTER_SPACING_EM = 0\.04;/],
    ['CLADDAGH_BASE_TRACKING_EM = 0.18', /var CLADDAGH_BASE_TRACKING_EM = 0\.18;/],
    ['CLADDAGH_BACK_FOLLOW_RATIO = 0.28', /var CLADDAGH_BACK_FOLLOW_RATIO = 0\.28;/],
    ['CLADDAGH_BACK_ORBIT_FOLLOW_RATIO = 0.52', /var CLADDAGH_BACK_ORBIT_FOLLOW_RATIO = 0\.52;/],
    ['CLADDAGH_NEXT_LINE_ENTRY_LEAD_SECONDS = 0.34', /var CLADDAGH_NEXT_LINE_ENTRY_LEAD_SECONDS = 0\.34;/],
    ['CLADDAGH_GLOW_DROP_SHADOW_SCALE = 0.5', /CLADDAGH_GLOW_DROP_SHADOW_SCALE = 0\.5;/],
    ['CLADDAGH_CHORUS_DROP_SHADOW_SCALE = 0.4', /CLADDAGH_CHORUS_DROP_SHADOW_SCALE = 0\.4;/],
    ['CLADDAGH_CHORUS_MIDDLE_ALPHA = 0.2', /CLADDAGH_CHORUS_MIDDLE_ALPHA = 0\.2;/],
    ['DEFAULT_TUNING.focusScaleRatio 0.65（面板 1.65x）', /focusScaleRatio: 0\.65,/],
    ['DEFAULT_TUNING.radiusScale 1.0', /radiusScale: 1\.0,/],
    ['DEFAULT_TUNING.ellipseTiltDeg 45', /ellipseTiltDeg: 45,/],
    ['DEFAULT_TUNING.showAxisLine true', /showAxisLine: true,/],
    ['深度混合 distanceOpacity 0.68+0.32·D^1.9（:605）', /0\.68 \+ 0\.32 \* Math\.pow\(D, 1\.9\)/],
    ['focus 公式 (1-distRatio)^1.8（:600）', /Math\.pow\(1 - distRatio, 1\.8\)/],
    ['背面字距收敛 0.35+0.65·D^1.2（:562）', /0\.35 \+ 0\.65 \* Math\.pow\(D, 1\.2\)/],
    ['副歌错峰 0.06+power·0.12（:571）', /0\.06 \+ power \* 0\.12/],
    ['辉光半径 副歌 (36+power·24)·F^1.5（:657-658）', /\(36 \+ power \* 24\) \* Math\.pow\(F, 1\.5\)/],
    ['辉光半径 常规 24·F²（:659）', /24 \* Math\.pow\(F, 2\.0\)/],
    ['camera flash progressFactor·15（:673）', /charProgress \* 15\.0/],
    ['flashPop (1-p/0.4)²·0.65（:679）', /1 - charProgress \/ 0\.4, 2\.0\) \* 0\.65/],
    ['轴线 scaleX 1+bass²·1.5 / scaleY ·0.5（:873-874）', /1\.0 \+ bassSqr \* 1\.5/],
    ['行转角弹簧 k55/c14/m0.9（:974-979）', /claddaghSpringSetTarget\(lineOffset, centerLineIndex \* Math\.PI, 55, 14, 0\.9\)/],
    ['bass/vocal 弹簧 k150/c25、k120/c24（:817-824）', /claddaghSpringSetTarget\(smoothedBass, paused \? 0 : bands\.bass, 150, 25, 1\)/],
    ['pretext letterSpacing 测量同参（:240-243）', /letterSpacing: fontPx \* CLADDAGH_LETTER_SPACING_EM/],
  ];
  for (const [label, re] of need) {
    assert.ok(re.test(src), '引擎产物须含原版常量/公式：' + label);
  }

  /* 轴线 normalizePower 单实例（VisualizerCladdagh.tsx:842-843：updateColors
     里 bass/vocal 复用主组件同一 isRawScaleRef——bass 先归一并翻转 raw 记忆、
     vocal 复用同一记忆；不得拆成两个独立 normalizer 实例） */
  assert.ok(
    /axisNormalize\(smoothedBass\.value\)[\s\S]*?axisNormalize\(smoothedVocal\.value\)/.test(src)
      && !/axisNormalizeBass|axisNormalizeVocal/.test(src),
    '轴线 bass/vocal 须共用单一 normalize 实例（原版 :842-843 单 isRawScaleRef 语义）',
  );

  /* 字体跟随热更：setTheme 必须重建行池——原版 theme → fontSpec memo 重建
     （:427）+ RingLine useLayoutEffect deps 含 baseColor/highlightColor/line
     （:744）→ span fontFamily/color 随新主题；清池后立即 syncLinePool
     （setFontScale 同理，不等到下次行切换才重建） */
  const setThemeSeg = src.slice(src.indexOf('setTheme: function'), src.indexOf('setFontScale: function'));
  assert.ok(setThemeSeg.includes('clearLinePool()') && setThemeSeg.includes('rebuildAllSpacingInfo()')
    && setThemeSeg.includes('syncLinePool()'), 'setTheme 须重建行池（新字体栈/新主题色落到 span font-family/color）');
  const setFontSeg = src.slice(src.indexOf('setFontScale: function'), src.indexOf('setTuning: function'));
  assert.ok(setFontSeg.includes('clearLinePool()') && setFontSeg.includes('syncLinePool()'),
    'setFontScale 清池后须立即重建当前窗口行');
}

/* ---------- 4) 桥契约 ---------- */
{
  const src = fs.readFileSync(BRIDGE, 'utf8');
  new vm.Script(src, { filename: '20b-claddagh-engine-bridge.js' });   // 可编译
  assert.match(src, /function applyCladdaghMode\(on, opts\)/, '注册表 applyFn 入口名必须保留');
  assert.match(src, /var claddaghMode\s*=/, '注册表 stateVar 名必须保留');
  assert.match(src, /CladdaghCladdaghEngine\(/, '桥必须创建引擎实例');
  assert.match(src, /getAdjustedLyricPlaybackTime/, '时间源走歌词偏移修正');
  assert.match(src, /animationIntensity:\s*\(typeof visAnimationIntensityCurrent/, '强度档随 fx.visAnimationIntensity 下发（07-fx/11 数据面；无数据面回退 normal，four-modes 沙箱测试覆盖）');
  assert.match(src, /wordColors:\s*\(typeof visWordColorsList/, '词色表随 orangesea-vis-word-colors-v1 下发（07-fx/11 数据面；空表回退 accentColor，CM_resolveWordColor 测试覆盖）');
  assert.match(src, /line\.renderHints = hints\(line\)/, '行数据必须挂 renderHints（环 renderEnd 拓展依赖）');
  assert.match(src, /claddaghBinAvg\(1, 8\)/, 'bass 频段自算（bin 1-8，覆盖层期主循环不写 bands）');
  assert.match(src, /claddaghBinAvg\(9, 140\)/, 'vocal 频段自算（bin 9-140）');
  assert.match(src, /focusScaleRatio: 0\.65/, 'tuning 取 DEFAULT_CLADDAGH_TUNING 原值');
  assert.match(src, /showAxisLine: true/, 'tuning 轴线显示原值');

  /* ---- 本轮保真度新增：字体/字重/背景三处对齐 ---- */

  /* 差距④根源修复：主题桥不得写死 fontWeight——Folia resolveThemeFontWeight
     （fontStacks.ts:14-17）在 theme.fontWeight 缺省时逐调用点回退
     环字符 700（VisualizerCladdagh.tsx:387）/壳 400（Shell:132）/
     翻译行 500（SubtitleOverlay:176）/下一句 400（:205）；
     桥写死 700 会把翻译行的 500 回退顶成 700 */
  assert.ok(!/fontWeight:\s*\d/.test(src), '主题桥不得写死 fontWeight（回退分层必须走引擎 resolveThemeFontWeight 缺省路径）');

  /* 差距①：背景接管——原版 Shell 默认挂 VisualizerBackgroundRenderer
     （VisualizerShell.tsx:185-197，缺省 Latent），复用模式无关
     TiltLatentBackground 挂 #claddagh-bg-layer，随主题/封面热更 */
  assert.match(src, /TiltLatentBackground\(/, '背景层必须由 TiltLatentBackground 挂载（原版 Latent 语义）');
  assert.match(src, /claddagh-bg-layer/, '背景层宿主必须是 #claddagh-bg-layer');
  assert.match(src, /claddaghLatentAudioPower/, 'audioPower 信号桥（0..1×255 → Folia 0..255 语义）');
  assert.match(src, /claddaghLatentBands\b/, 'bands 信号桥（保温期 frequencyData 自算回退）');
  assert.match(src, /claddaghBg\.setTheme\(theme\)/, '主题变化转发背景层换色');
  assert.match(src, /claddaghBg\.setCoverUrl\(\)/, '封面变化转发背景层重取色（LatentBackground.tsx:129-148 轮询等价）');
  assert.match(src, /claddaghBg\.destroy\(\)/, '退出模式销毁背景层');
  assert.match(src, /startCladdaghBg\(\)/, '进入模式先挂背景层（引擎失败时背景独立成立）');
}

/* ---------- 5) 注册接线 ---------- */
{
  const loader = fs.readFileSync(LOADER, 'utf8');
  assert.match(loader, /js\/modules\/10-shell\/20b-claddagh-engine-bridge\.js/, 'index-loader 清单挂 20b 桥');
  assert.ok(!loader.includes('20-claddagh.js'), '旧简化实现必须从清单移除');

  const index = fs.readFileSync(INDEX, 'utf8');
  assert.match(index, /js\/modules\/10-shell-claddagh-engine\/claddagh-engine\.js/, 'index.html 静态注入引擎产物');
  const engineAt = index.indexOf('10-shell-claddagh-engine/claddagh-engine.js');
  const loaderAt = index.indexOf('js/index-loader.js');
  assert.ok(engineAt > 0 && loaderAt > engineAt, '引擎产物必须在 index-loader 之前加载');
  const pretextAt = index.indexOf('vendor/pretext/pretext.bundle.js');
  assert.ok(pretextAt > 0 && pretextAt < engineAt, 'pretext 全局 bundle 必须在引擎产物之前（测量依赖）');
  assert.match(index, /id="claddagh-engine-host"/, '引擎宿主容器存在');
  /* 背景层容器：位于暗角 backdrop 之后（DOM 后位覆盖）、引擎宿主之前（歌词在其上） */
  assert.match(index, /id="claddagh-bg-layer"/, 'Latent 背景层容器存在');
  const backAt = index.indexOf('class="claddagh-backdrop"');
  const bgAt = index.indexOf('id="claddagh-bg-layer"');
  const hostAt = index.indexOf('id="claddagh-engine-host"');
  assert.ok(backAt > 0 && bgAt > backAt && hostAt > bgAt, 'bg-layer 须在 backdrop 之后、engine-host 之前（z 序与原版 Shell 层序一致）');
  /* 背景工厂时序：TiltLatentBackground 由 tilt 引擎产物注出，须先于本引擎加载 */
  const tiltEngineAt = index.indexOf('10-shell-tilt-engine/tilt-engine.js');
  assert.ok(tiltEngineAt > 0 && tiltEngineAt < engineAt, 'tilt-engine.js 须先于 claddagh-engine.js（TiltLatentBackground 全局可用）');
  assert.ok(index.indexOf('claddagh-ring-stage') === -1 && index.indexOf('id="claddagh-axis"') === -1,
    '旧 DOM 结构（claddagh-ring-stage/claddagh-axis）必须移除');

  const registry = fs.readFileSync(REGISTRY, 'utf8');
  assert.match(registry, /id:\s*'claddagh'[\s\S]*?stateVar:\s*'claddaghMode'/, '注册表 claddagh 行保留');
  assert.match(registry, /applyFn:\s*'applyCladdaghMode'/, '注册表 applyFn 保留');

  const css = fs.readFileSync(CSS, 'utf8');
  assert.ok(!/\.claddagh-(char|line|axis|ring-stage)\b/.test(css), 'claddagh.css 不得再持环排动画类（引擎 inline style 单主路径）');
  assert.match(css, /#claddagh-engine-host/, 'claddagh.css 提供引擎宿主定位');
  assert.match(css, /#claddagh-bg-layer\s*\{[^}]*z-index:\s*1/, 'claddagh.css 提供背景层容器壳定位（z 序：backdrop → bg-layer → engine-host）');

  assert.ok(!fs.existsSync(OLD_IMPL), '旧简化实现 20-claddagh.js 已删除（不得两套主路径并存）');
}

console.log('OK tests/claddagh.test.js — 引擎产物加载/关键算法/手工段常量/桥契约/注册接线 全部通过');
