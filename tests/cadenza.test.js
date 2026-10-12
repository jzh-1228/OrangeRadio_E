'use strict';
/* 心象（cadenza）· 原版渲染核心引擎的产物与接线验证
   ----------------------------------------------------------------------------
   覆盖：
   1) 引擎产物可加载：vm 沙箱执行 cadenza-engine.js 的 IIFE，
      env.CadenzaCadenzaEngine、全部 CM_* 闭包别名与手工段算法注出齐全；
   2) 关键算法（Folia 闭包原函数 + 手工段同构函数，数值级断言）：
      renderHints 三档 / getLineTransitionTiming 三档时序 / graphemeTiming /
      wordColoring / colorMix / 字幕字号 / 词三态（lookahead 0.18）/
      辉光包络三档（sustain 0.9 / fast 0.92 / instant 脉冲）/ 逐字扫光
      charDuration*6 / 字号公式 / 行渲染时序 / currentLineIndex 权威语义 /
      词云放置确定性 + 无碰撞 / 三层 40px textShadow；
   3) 桥契约：20b 桥可编译、applyCadenzaMode/cadenzaMode 入口齐全、
      引擎创建、时间源、audioPower 0..255 值域换算、Latent 背景层挂载
      （TiltLatentBackground → #cadenza-bg-layer，VisualizerShell:185-197
      宿主化；信号桥 usePlaybackVisualizerBridge.ts:93-131 同构：可闻判定/
      呼吸值/五频带/audioPower）与 700ms sync 主题/封面热更；
   4) 注册接线：registry 行、index-loader 清单、index.html script 与
      cadenza-engine-host、cadenza-bg-layer 容器与 CSS 层序
      （backdrop(auto) → bg-layer(1) → engine-host(2)，同 tilt 范式）、
      cadenza.css 不再持引擎动画类（防与引擎 inline style 双主路径冲突）、
      旧简化实现 21-cadenza.js 已删除。
   算法参照：folia-major src/components/visualizer/cadenza/VisualizerCadenza.tsx、
   src/utils/lyrics/renderHints.ts、src/components/visualizer/runtime.ts
   （AGPL-3.0，见 NOTICE.md）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'public', 'js', 'modules', '10-shell-cadenza-engine', 'cadenza-engine.js');
const BRIDGE = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20b-cadenza-engine-bridge.js');
const LOADER = path.join(ROOT, 'public', 'js', 'index-loader.js');
const INDEX = path.join(ROOT, 'public', 'index.html');
const REGISTRY = path.join(ROOT, 'public', 'js', 'modules', '02-visual', '90-visualizer-registry.js');
const CSS = path.join(ROOT, 'public', 'css', 'cadenza.css');
const OLD_IMPL = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '21-cadenza.js');

/* ---------- 1) 引擎产物可加载（vm 沙箱执行，env 注出面） ---------- */
const sandbox = { console, Math, JSON, Object, Array, Number, parseInt, parseFloat, isFinite, RegExp, Date, Intl };
sandbox.window = sandbox;
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(ENGINE, 'utf8'), { filename: 'cadenza-engine.js' }).runInContext(sandbox);
const env = sandbox.window;

assert.equal(typeof env.CadenzaCadenzaEngine, 'function', 'env.CadenzaCadenzaEngine 必须由引擎产物注出');
for (const alias of [
  'CM_isGlowBlurQuantized', 'CM_quantizeShadowBlur', 'CM_GLOW_BLUR_QUANTIZE_STORAGE_KEY',
  'CM_colorWithAlpha', 'CM_parseColorChannels', 'CM_mixColors',
  'CM_buildLineRenderHints', 'CM_getLineRenderHints', 'CM_getLineRenderEndTime',
  'CM_getLineTransitionTiming', 'CM_MICRO_LINE_DURATION_THRESHOLD', 'CM_SHORT_LINE_DURATION_THRESHOLD',
  'CM_buildWordGraphemeTimings', 'CM_splitLyricGraphemes',
  'CM_resolveThemeFontStack', 'CM_resolveThemeFontWeight',
  'CM_resolveWordColor', 'CM_buildWordColorRanges', 'CM_prepareWordColorMatchers',
  'CM_resolveSubtitleFontSizes',
]) {
  assert.ok(env[alias] != null, alias + ' 必须由管线 aliasExports 注出');
}
for (const fn of [
  'cadenzaGetWordStatus', 'cadenzaGetWordProgress', 'cadenzaGetGlowEnvelope', 'cadenzaGetCharGlow',
  'cadenzaGetBodyMix', 'cadenzaGetLineEnvelope', 'cadenzaChooseFontPx', 'cadenzaResolveLineRenderTiming',
  'cadenzaBuildWordPlacements', 'cadenzaFindLineIndexAtTime', 'cadenzaGetUpcomingLine',
  'cadenzaBuildDomTextShadow',
]) {
  assert.equal(typeof env[fn], 'function', '手工段 ' + fn + ' 必须由引擎产物注出');
}

/* ---------- 2) 关键算法（数值级） ---------- */

/* renderHints.ts：行时长三档（0.10/0.18 阈值 + micro 渲染下限 0.067） */
{
  const micro = env.CM_buildLineRenderHints(10, 10.05);
  assert.equal(micro.timingClass, 'micro');
  assert.equal(micro.lineTransitionMode, 'none');
  assert.equal(micro.wordRevealMode, 'instant');
  assert.equal(micro.renderEndTime, 10.067);

  const short = env.CM_buildLineRenderHints(0, 0.15);
  assert.equal(short.timingClass, 'short');
  assert.equal(short.lineTransitionMode, 'fast');
  assert.equal(short.wordRevealMode, 'fast');

  const normal = env.CM_buildLineRenderHints(0, 2);
  assert.equal(normal.timingClass, 'normal');
  assert.equal(normal.wordRevealMode, 'normal');

  const line = { startTime: 0, endTime: 2, words: [{ endTime: 1.9 }] };
  assert.equal(env.CM_buildLineRenderHints(line).renderEndTime, 2.28);
}

/* getLineTransitionTiming（renderHints.ts:48-74；cadenza 行包络/涟漪时序来源） */
{
  const none = env.CM_getLineTransitionTiming(2, 'none', 'normal');
  assert.equal(none.enterDuration, 0);
  assert.equal(none.exitDuration, 0);
  assert.equal(none.linePassHold, 0);

  const fast = env.CM_getLineTransitionTiming(0.2, 'fast', 'fast');
  assert.equal(fast.enterDuration, Math.min(0.06, Math.max(0.045, 0.2 * 0.45)));
  assert.equal(fast.exitDuration, Math.min(0.04, Math.max(0.03, 0.2 * 0.22)));
  assert.equal(fast.linePassHold, 0.03);

  const normal = env.CM_getLineTransitionTiming(2, 'normal', 'normal');
  assert.equal(normal.enterDuration, Math.min(0.42, Math.max(0.22, 2 * 0.34)));
  assert.equal(normal.exitDuration, Math.min(0.32, Math.max(0.18, 2 * 0.18)));
  assert.equal(normal.linePassHold, 0.06);
}

/* graphemeTiming.ts：词内 grapheme 均分 */
{
  const gs = env.CM_buildWordGraphemeTimings({ text: '世界', startTime: 1, endTime: 3 });
  assert.equal(gs.length, 2);
  assert.equal(gs[0].char, '世');
  assert.equal(gs[0].startTime, 1);
  assert.equal(gs[0].endTime, 2);
  assert.equal(gs[1].endTime, 3);
}

/* wordColoring.ts / colorMix.ts / subtitleFontSizes.ts（与 classic 共享闭包） */
{
  const wordColors = [{ word: 'my love', color: '#ff0000' }, { word: '潮水', color: '#3366ff' }];
  assert.equal(env.CM_resolveWordColor('Love', wordColors, '#ffffff'), '#ff0000');
  assert.equal(env.CM_resolveWordColor('潮', wordColors, '#ffffff'), '#3366ff');
  assert.equal(env.CM_resolveWordColor('none', wordColors, '#123456'), '#123456');
  assert.equal(env.CM_colorWithAlpha('#ff8c00', 0.7), 'rgba(255, 140, 0, 0.7)');
  const s = env.CM_resolveSubtitleFontSizes(1);
  assert.equal(s.translationFontSize, 'clamp(1.125rem, 2.600vw, 1.250rem)');
}

/* 手工段：词三态（VisualizerCadenza.tsx:228-245；normal lookahead 0.18） */
{
  const timing = env.cadenzaResolveLineRenderTiming({ startTime: 0, endTime: 2, words: [{ text: 'a', startTime: 0, endTime: 1 }] });
  const word = { text: 'a', startTime: 1, endTime: 2 };
  assert.equal(env.cadenzaGetWordStatus(0.5, timing, word), 'waiting');   // 1 - 0.18 之前
  assert.equal(env.cadenzaGetWordStatus(0.83, timing, word), 'active');   // 进入 lookahead
  assert.equal(env.cadenzaGetWordStatus(2.0, timing, word), 'active');
  assert.equal(env.cadenzaGetWordStatus(2.01, timing, word), 'passed');
  assert.equal(env.cadenzaGetWordProgress(1.5, 'normal', word), 0.5);
  assert.equal(env.cadenzaGetWordProgress(1.5, 'instant', word), 1);
}

/* 手工段：辉光包络三档（:269-327 关键原值） */
{
  const word = { text: 'a', startTime: 1, endTime: 2 };
  const normal = env.cadenzaResolveLineRenderTiming({ startTime: 0, endTime: 3, words: [word] });
  assert.equal(env.cadenzaGetGlowEnvelope(0.5, normal, word), 0);                 // 未入场
  assert.equal(env.cadenzaGetGlowEnvelope(1.5, normal, word), 1);                 // sustain 平台
  const tailAt = 2 + 0.45;                                                        // 词尾后 0.45/0.9
  assert.ok(Math.abs(env.cadenzaGetGlowEnvelope(tailAt, normal, word) - 0.9 * Math.pow(0.5, 2)) < 1e-9, '词尾后包络 = 0.9*(1-fadeOut)^2');

  const fast = env.cadenzaResolveLineRenderTiming({
    startTime: 0, endTime: 0.15,
    renderHints: { rawDuration: 0.15, timingClass: 'short', lineTransitionMode: 'fast', wordRevealMode: 'fast', renderEndTime: 0.15 },
    words: [word]
  });
  const wFast = { text: 'a', startTime: 1, endTime: 1.1 };
  assert.equal(env.cadenzaGetGlowEnvelope(0.5, fast, wFast), 0);                  // fast 档词开始前为 0
  assert.equal(env.cadenzaGetGlowEnvelope(1.06, fast, wFast), 1);                 // 0.14<p<0.82 平台
  const fade = env.cadenzaGetGlowEnvelope(1.15, fast, wFast);                     // 词尾后 0.05/0.14
  assert.ok(Math.abs(fade - Math.pow(1 - 0.05 / 0.14, 2)) < 1e-9, 'fast 档词尾后 (1-fadeOut)^2');
}

/* 手工段：逐字扫光（:329-351 charDuration*6 关键帧） */
{
  const word = { text: 'ab', startTime: 1, endTime: 3 };
  const t0 = env.cadenzaGetCharGlow(1.0, word, 0, 2, []);                         // elapsed 0 → 0
  assert.equal(t0, 0);
  const timings = [{ char: 'a', startTime: 1, endTime: 2 }, { char: 'b', startTime: 2, endTime: 3 }];
  const mid = env.cadenzaGetCharGlow(1.5, word, 0, 2, timings);                   // elapsed 0.5 / anim 6 → 0.3 关键帧段
  assert.equal(mid, env.Math === Math ? (1 - Math.pow(1 - (0.5 / 6) / 0.3, 3)) : mid); // easeOutCubic 段
  assert.ok(mid > 0 && mid < 1);
}

/* 手工段：字号公式（:486-493 widthBase clamp 34..94，惩罚后 28..104） */
{
  assert.equal(env.cadenzaChooseFontPx(1000, { fullText: 'ok', words: [{ text: 'ok' }] }), 86); // 1000*0.086
  assert.equal(env.cadenzaChooseFontPx(1200, { fullText: 'ok', words: [{ text: 'ok' }] }), 94); // widthBase 上夹
  assert.equal(env.cadenzaChooseFontPx(300, { fullText: 'ok', words: [{ text: 'ok' }] }), 34);  // widthBase 下夹
}

/* 手工段：行渲染时序（:450-471 renderHints 缺省回退 endTime/linePassHold） */
{
  const t = env.cadenzaResolveLineRenderTiming({ startTime: 0, endTime: 2, words: [{ text: 'a', startTime: 0, endTime: 1.9 }] });
  assert.equal(t.lineRenderEndTime, 2);
  assert.equal(t.linePassHold, 0.06);
  assert.equal(t.transitionTiming.enterDuration, 0.42);   // min(0.42, max(0.22, 2*0.34))
  const t2 = env.cadenzaResolveLineRenderTiming({
    startTime: 0, endTime: 2, words: [{ text: 'a', startTime: 0, endTime: 1.9 }],
    renderHints: { rawDuration: 2, timingClass: 'normal', lineTransitionMode: 'normal', wordRevealMode: 'normal', renderEndTime: 2.28 }
  });
  assert.equal(t2.lineRenderEndTime, 2.28);
}

/* 手工段：currentLineIndex 权威语义（appPlaybackHelpers.ts:21-31，renderEndTime 收尾窗） */
{
  const lines = [
    { startTime: 0, endTime: 1, renderHints: { renderEndTime: 1.5 } },
    { startTime: 2, endTime: 3 }
  ];
  assert.equal(env.cadenzaFindLineIndexAtTime(lines, 1.2), 0);   // renderEndTime 收尾窗内仍是当前行
  assert.equal(env.cadenzaFindLineIndexAtTime(lines, 1.6), -1);
  assert.equal(env.cadenzaFindLineIndexAtTime(lines, 2.5), 1);
  assert.equal(env.cadenzaFindLineIndexAtTime(lines, 0.5), 0);
}

/* 手工段：词云放置（:800-1108 同 seed 确定性 + 碎片数守恒 + 零碰撞） */
{
  const mkFragment = (i, text) => ({
    wordIndex: i, word: { text, startTime: 0, endTime: 1 }, text,
    color: '#ffffff', startX: i * 120, endX: i * 120 + 100,
    fragmentStartInWord: 0, fragmentEndInWord: 1, wordGraphemeCount: 1,
    wordGraphemeTimings: [], fragmentIndexInWord: 0, fragmentCountInWord: 1,
    isPrimaryFragment: true, isSplitAcrossLines: false
  });
  const lineData = [{ line: { width: 600 }, lineStart: 0, lineEnd: 6, fragments: [mkFragment(0, 'no'), mkFragment(1, 'no'), mkFragment(2, 'way')] }];
  const a = env.cadenzaBuildWordPlacements(lineData, 80, 88, 800, 'normal', 0, false);
  const b = env.cadenzaBuildWordPlacements(lineData, 80, 88, 800, 'normal', 0, false);
  assert.equal(a.length, 3);
  assert.equal(JSON.stringify(a.map(p => [p.x, p.y])), JSON.stringify(b.map(p => [p.x, p.y])), '同 seed 放置必须确定性');
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      const pa = a[i], pb = a[j];
      const sepX = Math.abs(pa.x - pb.x) >= (pa.width + pb.width) / 2;
      const sepY = Math.abs(pa.y - pb.y) >= (pa.height + pb.height) / 2;
      assert.ok(sepX || sepY, '放置矩形不得重叠（避碰布局）');
    }
  }
  // passed 旋转限制在档位幅度内（:962 normal ±6）
  assert.ok(a.every(p => Math.abs(p.passedRotate) <= 6), 'passedRotate 必须在 normal 档 ±6 内');
  // hero 词强调（:791-795 emphasis 1.46*scoreBoost、:911-912 scale=baseScale*emphasis）
  // hero preferred 落中心（:969-970），但受 withinBounds 约束（:1031-1037 对 hero
  // 同样生效——单行夹具 lineHeight=88 时 hero collisionHeight≈153 越垂直下界被
  // 邻域采样推回界内，与原版行为一致）→ 断言落点在原版 bounds 语义内。
  const hero = a.find(p => p.emphasis > 1);
  assert.ok(hero, 'emphasis 图必须产生一个 hero 词');
  assert.ok(hero.scale > 1, 'hero 词 scale 必须放大（baseScale×emphasis>1）');
  assert.ok(Math.abs(hero.x) <= 800 / 2 + 72 && Math.abs(hero.y) <= Math.max(88 * 0.9, 88 * 1.45) + 0.001,
    'hero 落点必须在原版 placement bounds 内（:993-996）');
}

/* 手工段：DOM textShadow 三层 40px（:473-484） */
{
  const shadow = env.cadenzaBuildDomTextShadow('#ff0000', 1);
  const hits = shadow.match(/0 0 40px rgba\(255, 0, 0,/g) || [];
  assert.equal(hits.length, 3, '三层全 40px 半径');
  assert.equal(env.cadenzaBuildDomTextShadow('#ff0000', 0), 'none');
}

/* ---------- 3) 桥契约 ---------- */
{
  const src = fs.readFileSync(BRIDGE, 'utf8');
  new vm.Script(src, { filename: '20b-cadenza-engine-bridge.js' });   // 可编译
  assert.match(src, /function applyCadenzaMode\(on, opts\)/, '注册表 applyFn 入口名必须保留');
  assert.match(src, /var cadenzaMode\s*=/, '注册表 stateVar 名必须保留');
  assert.match(src, /CadenzaCadenzaEngine\(/, '桥必须创建引擎实例');
  assert.match(src, /getAdjustedLyricPlaybackTime/, '时间源走歌词偏移修正');
  assert.match(src, /animationIntensity:\s*\(typeof visAnimationIntensityCurrent/, '强度档随 fx.visAnimationIntensity 下发（07-fx/11 数据面；无数据面回退 normal，four-modes 沙箱测试覆盖）');
  assert.match(src, /wordColors:\s*\(typeof visWordColorsList/, '词色表随 orangesea-vis-word-colors-v1 下发（07-fx/11 数据面；空表回退 accentColor，CM_resolveWordColor 测试覆盖）');
  assert.match(src, /audioPower/, '桥必须提供 audioPower MV（cadenza 能量驱动）');
  assert.match(src, /\*\s*255/, 'audioPower 必须 ×255 对齐 Folia 0..255 值域');
}

/* ---------- 3.5) Latent 背景层桥契约（Folia VisualizerShell:185-197 宿主化，
   照 20b-tilt-engine-bridge 精确信号路径；原版默认背景 mode='latent'，
   types/visualizerModes.ts:42-43） ---------- */
{
  const src = fs.readFileSync(BRIDGE, 'utf8');
  assert.match(src, /function startCadenzaBg\(\)/, '背景层必须有独立启动函数');
  assert.match(src, /document\.getElementById\('cadenza-bg-layer'\)/, '背景层必须挂 #cadenza-bg-layer');
  assert.match(src, /typeof TiltLatentBackground !== 'function'/, '背景复用 tilt 引擎注出的 TiltLatentBackground（缺失静默退保底暗底）');
  assert.match(src, /TiltLatentBackground\(\{[\s\S]*?audioPowerGet:\s*cadenzaLatentAudioPower[\s\S]*?bandsGet:\s*cadenzaLatentBands[\s\S]*?coverUrlGet:\s*cadenzaLatentCoverUrl[\s\S]*?pausedGet:\s*cadenzaLatentPaused/,
    'TiltLatentBackground 必须注入完整信号桥（audioPower/bands/coverUrl/paused，usePlaybackVisualizerBridge.ts:93-131 同构）');
  assert.match(src, /function cadenzaLatentAudible\(\)/, '可闻判定（!paused && !ended && analyser）');
  assert.match(src, /function cadenzaLatentBands\(\)/, '五频带信号桥');
  assert.match(src, /tiltBandsCompute/, '频带走 tilt 产物注出的精确分箱（21.5Hz/bin + 幂次整形）');
  assert.match(src, /tiltBandsBreath/, '不可闻走呼吸值 (sin(t)+1)*20（:121-131）');
  assert.match(src, /startCadenzaBg\(\);\s*\/\* 背景层先于歌词引擎/, 'startCadenza 必须先起背景层（引擎缺失时背景独立成立）');
  assert.match(src, /cadenzaBg\.setTheme\(theme\)/, '700ms sync 主题热更下发背景（与 eng.setTheme 同拍）');
  assert.match(src, /cadenzaBg\.setCoverUrl\(\)/, '700ms sync 封面变化重取色（LatentBackground.tsx:129-148 轮询等价）');
  assert.match(src, /cadenzaBg\.destroy\(\)/, 'stopCadenza 必须销毁背景层');
  /* 引擎词渲染与桥主题的词色表链路：桥下发 wordColors → 引擎
     cadenzaFindWordRanges 消费 CM_resolveWordColor（词色表生效的静态证据） */
  assert.match(src, /wordColors:\s*\(typeof visWordColorsList === 'function'\) \? visWordColorsList\(\) : \[\]/,
    '主题桥下发词色表 orangesea-vis-word-colors-v1（空表回退 accentColor）');
}

/* ---------- 4) 注册接线 ---------- */
{
  const loader = fs.readFileSync(LOADER, 'utf8');
  assert.match(loader, /js\/modules\/10-shell\/20b-cadenza-engine-bridge\.js/, 'index-loader 清单挂 20b 桥');
  assert.ok(!loader.includes('21-cadenza.js'), '旧简化实现必须从清单移除');

  const index = fs.readFileSync(INDEX, 'utf8');
  assert.match(index, /js\/modules\/10-shell-cadenza-engine\/cadenza-engine\.js/, 'index.html 静态注入引擎产物');
  const engineAt = index.indexOf('10-shell-cadenza-engine/cadenza-engine.js');
  const loaderAt = index.indexOf('js/index-loader.js');
  const pretextAt = index.indexOf('vendor/pretext/pretext.bundle.js');
  assert.ok(engineAt > 0 && loaderAt > engineAt, '引擎产物必须在 index-loader 之前加载');
  assert.ok(pretextAt > 0 && pretextAt < engineAt, 'pretext 全局 bundle 必须在引擎产物之前加载');
  assert.match(index, /id="cadenza-engine-host"/, '引擎宿主容器存在');
  assert.match(index, /id="cadenza-bg-layer"/, 'Latent 背景层容器存在（VisualizerShell:185-197 宿主化）');
  const czBgAt = index.indexOf('cadenza-bg-layer');
  const czHostAt = index.indexOf('cadenza-engine-host');
  assert.ok(czBgAt > 0 && czHostAt > czBgAt, '背景层容器必须先于引擎宿主（DOM 后位叠上层序）');
  assert.ok(index.indexOf('cadenza-words') === -1 && index.indexOf('cadenza-empty') === -1,
    '旧 DOM 结构（cadenza-words/cadenza-empty）必须移除');

  const registry = fs.readFileSync(REGISTRY, 'utf8');
  assert.match(registry, /id:\s*'cadenza'[\s\S]*?stateVar:\s*'cadenzaMode'/, '注册表 cadenza 行保留');
  assert.match(registry, /applyFn:\s*'applyCadenzaMode'/, '注册表 applyFn 保留');

  const css = fs.readFileSync(CSS, 'utf8');
  assert.ok(!/\.cadenza-(word|words|layer|canvas|empty|stage)\b/.test(css), 'cadenza.css 不得再持引擎动画类（引擎 inline style 单主路径）');
  assert.match(css, /#cadenza-engine-host/, 'cadenza.css 提供引擎宿主定位');
  assert.match(css, /#cadenza-bg-layer[\s\S]{0,200}z-index:\s*1/, 'cadenza.css 提供背景层壳（z-index:1）');
  const hostCss = css.match(/#cadenza-engine-host\s*\{[\s\S]*?\}/);
  assert.ok(hostCss && /z-index:\s*2/.test(hostCss[0]), '引擎宿主 z-index:2（压过背景层，同 tilt.css:65-69 层序）');
  /* overlay 自身必须保持不透明暗底（Latent 不可用时的兜底，约束 6） */
  const ovCss = css.match(/#cadenza-overlay\s*\{[\s\S]*?\}/);
  assert.ok(ovCss && /background:[^;]*#/.test(ovCss[0]), 'overlay 保持不透明暗底兜底');

  assert.ok(!fs.existsSync(OLD_IMPL), '旧简化实现 21-cadenza.js 已删除（不得两套主路径并存）');
}

console.log('OK tests/cadenza.test.js — 引擎产物加载/关键算法/桥契约/注册接线 全部通过');
