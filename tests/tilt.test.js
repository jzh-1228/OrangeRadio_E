'use strict';
/* 斜排（tilt）· 原版渲染核心引擎的产物与接线验证
   ----------------------------------------------------------------------------
   覆盖：
   1) 引擎产物可加载：vm 沙箱执行 tilt-engine.js 的 IIFE，
      env.TiltTiltEngine 与全部 CM_* 闭包别名、手工段纯函数注出齐全；
   2) 关键算法（数值级断言，直接调 env 注出符号）：
      SentenceLayout 五级语义拆行 / renderHints 行渲染终点 /
      graphemeTiming 均分时序 / buildTiltLayout 概率拆行结构不变量 /
      findSegmentWordRange 词区间定位 / buildCharTimings 逐字时序 /
      getCharPulseIntensity 脉冲-余辉曲线 / determineLineCount 行数阈值；
   3) 桥契约：20b 桥可编译、applyTiltMode/tiltMode 入口齐全、
      引擎实例创建、时间源、宿主主题桥约定；
   4) 注册接线：registry 行、index-loader 清单、index.html 引擎注入顺序与
      tilt-engine-host、tilt.css 不再持 .tilt-* 动画类（防与引擎 inline
      style 双主路径冲突）、旧简化实现已删除。
   算法参照：folia-major src/components/visualizer/tilt/VisualizerTilt.tsx、
   src/utils/lyrics/sentenceLayout.ts、src/types.ts:488-500、
   src/hooks/usePlaybackVisualizerBridge.ts:93-131（AudioBands 精确信号）、
   src/i18n/locales/*.ts（waitingForMusic 空串）（AGPL-3.0，见 NOTICE.md）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'public', 'js', 'modules', '10-shell-tilt-engine', 'tilt-engine.js');
const BRIDGE = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20b-tilt-engine-bridge.js');
const LOADER = path.join(ROOT, 'public', 'js', 'index-loader.js');
const INDEX = path.join(ROOT, 'public', 'index.html');
const REGISTRY = path.join(ROOT, 'public', 'js', 'modules', '02-visual', '90-visualizer-registry.js');
const CSS = path.join(ROOT, 'public', 'css', 'tilt.css');
const OLD_IMPL = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20-tilt.js');

/* ---------- 1) 引擎产物可加载（vm 沙箱执行，env 注出面） ---------- */
const sandbox = { console, Math, JSON, Object, Array, Number, parseInt, parseFloat, isFinite, RegExp, Date, Intl, Map, Set, Symbol, Promise, TypeError };
sandbox.innerWidth = 1600;
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(ENGINE, 'utf8'), { filename: 'tilt-engine.js' }).runInContext(sandbox);
const env = sandbox.window;

assert.equal(typeof env.TiltTiltEngine, 'function', 'env.TiltTiltEngine 必须由引擎产物注出');
assert.equal(typeof env.tiltFindLineIndexAtTime, 'function', 'env.tiltFindLineIndexAtTime 必须注出');
for (const alias of [
  'CM_resolveThemeFontStack', 'CM_resolveThemeFontWeight',
  'CM_buildLineRenderHints', 'CM_getLineRenderEndTime',
  'CM_MICRO_LINE_DURATION_THRESHOLD', 'CM_SHORT_LINE_DURATION_THRESHOLD',
  'CM_buildWordGraphemeTimings', 'CM_buildPostLyricLayoutUnits',
  'CM_SentenceLayout', 'CM_colorWithAlpha', 'CM_resolveSubtitleFontSizes',
]) {
  assert.ok(env[alias] != null, alias + ' 必须由管线 aliasExports 注出');
}
for (const fn of ['tiltBuildTiltLayout', 'tiltBuildCharTimings', 'tiltFindSegmentWordRange', 'tiltCharPulseIntensity', 'tiltDetermineLineCount', 'tiltSeededRandom']) {
  assert.equal(typeof env[fn], 'function', 'env.' + fn + ' 必须由引擎注出（手工段纯函数）');
}

/* ---------- 2) 关键算法（Folia 原函数，数值级） ---------- */

/* seededRandom（VisualizerTilt.tsx:206-209）：sin(seed*1000+offset) 分形 */
{
  const expected = Math.sin(1) * 10000;
  const frac = expected - Math.floor(expected);
  assert.equal(env.tiltSeededRandom(0, 1), frac, 'seed=0 offset=1 → sin(1)*10000 的小数部');
  assert.equal(env.tiltSeededRandom(0, 1), env.tiltSeededRandom(0, 1), '同 seed 确定性（行布局可复现）');
}

/* determineLineCount（:20-28）：log 归一 × jitter × 概率 → 1-4 行三阈值 */
{
  for (let seed = 0; seed < 20; seed++) {
    const n = env.tiltDetermineLineCount(20, seed, 0.75);
    assert.ok(Number.isInteger(n) && n >= 1 && n <= 4, '行数恒在 1-4（seed=' + seed + '）');
  }
}

/* sentenceLayout.ts：五级语义拆行（level1 标点断句 + secondarySplit 词边界）
   注意：引擎产物在 vm 沙箱 realm 执行，返回数组用 Array.from 拷入 host realm 再断言 */
{
  const two = env.CM_SentenceLayout.splitIntoSentences('编织那没有诗意，却能将你带到现实的神文之诗。', 2, 12.5);
  assert.deepEqual(Array.from(two, (u) => u.text), ['编织那没有诗意，', '却能将你带到现实的神文之诗。'],
    'level1 标点断句（标点并入前段）');
  assert.equal(env.CM_SentenceLayout.splitIntoSentences('整行文本', 1, 0).length, 1, 'targetCount<=1 → 原文单段');
  const merged = env.CM_SentenceLayout.splitIntoSentences('一。二。三。', 2, 7);
  assert.equal(merged.length, 2, '过量段落 mergeSentences 合并回目标数');
}

/* renderHints.ts：行渲染终点（tilt 段落 reveal 窗口与行切换都吃它） */
{
  assert.equal(env.CM_buildLineRenderHints(10, 10.05).renderEndTime, 10.067);   // MICRO_LINE_RENDER_FLOOR
  const h = env.CM_buildLineRenderHints({ startTime: 0, endTime: 2, words: [{ endTime: 1.9 }] });
  assert.equal(h.renderEndTime, 2.28);   // passStart=1.9+0.06、renderEnd=max(2, 1.96+0.32)
}

/* graphemeTiming.ts：词内 grapheme 均分（syllables 路径的底层） */
{
  const gs = env.CM_buildWordGraphemeTimings({ text: '世界', startTime: 1, endTime: 3 });
  assert.equal(gs.length, 2);
  assert.equal(gs[0].char, '世');
  assert.equal(gs[0].startTime, 1);
  assert.equal(gs[1].endTime, 3);
}

/* findSegmentWordRange（:67-101）：段 → 全文词区间（indexOf 推进） */
{
  const line = { fullText: '晚风把云', words: [
    { text: '晚', startTime: 0, endTime: 1 },
    { text: '风', startTime: 1, endTime: 2 },
    { text: '把', startTime: 2, endTime: 3 },
    { text: '云', startTime: 3, endTime: 4 },
  ] };
  const r1 = env.tiltFindSegmentWordRange(2, '把云', line.fullText, line.words);
  const r2 = env.tiltFindSegmentWordRange(0, '晚风', line.fullText, line.words);
  assert.equal(r1.startWordIndex, 2, '段「把云」起于词 2');
  assert.equal(r1.endWordIndex, 4, '段「把云」止于词 4（不含）');
  assert.equal(r2.startWordIndex, 0);
  assert.equal(r2.endWordIndex, 2);
}

/* buildCharTimings（:103-178）：词内均分逐字 + 段均分兜底（words 空） */
{
  const line = { fullText: '晚风', words: [{ text: '晚风', startTime: 10, endTime: 12 }] };
  const t1 = env.tiltBuildCharTimings(0, '晚风', 10, 12, line);
  assert.deepEqual(Array.from(t1, (t) => ({ charIndex: t.charIndex, startTime: t.startTime, endTime: t.endTime })), [
    { charIndex: 0, startTime: 10, endTime: 11 },
    { charIndex: 1, startTime: 11, endTime: 12 },
  ], '词内 grapheme 均分');

  const noWords = { fullText: '潮水', words: [] };
  const t2 = env.tiltBuildCharTimings(0, '潮水', 5, 9, noWords);
  assert.deepEqual(Array.from(t2, (t) => ({ charIndex: t.charIndex, startTime: t.startTime, endTime: t.endTime })), [
    { charIndex: 0, startTime: 5, endTime: 7 },
    { charIndex: 1, startTime: 7, endTime: 9 },
  ], '无词数据 → 段时长均分兜底');
}

/* getCharPulseIntensity（:180-198）：正弦脉冲 → 余辉缓落 0.25 常亮 */
{
  const timing = { startTime: 0, endTime: 1 };
  assert.equal(env.tiltCharPulseIntensity(-1, timing), 0, '未开始 → 0');
  assert.equal(env.tiltCharPulseIntensity(0.45, timing), 1, 'duration 夹紧 0.9 → 中点 sin(π/2)=1');
  assert.equal(env.tiltCharPulseIntensity(3, timing), 0.25, '余辉满 → 0.25 常亮');
  assert.ok(Math.abs(env.tiltCharPulseIntensity(1.045, timing) - 0.25 * (0.145 / 1.08)) < 1e-9, '余辉线性爬升（afterElapsed=elapsed-duration）');
}

/* buildTiltLayout（:211-332）：结构不变量 + 省略号单段 + 超宽重拆缩放 */
{
  const theme = { primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6', backgroundColor: '#0e0906', animationIntensity: 'normal', wordColors: [] };
  const tuning = { splitProbability: 0.75, tiltStyleProbability: 0.35, colorScheme: 'default' };

  const ell = env.tiltBuildTiltLayout('……', 42, tuning, theme, 1);
  assert.equal(ell.segments.length, 1, 'isEllipsisOnly → 单段不拆');

  const lay = env.tiltBuildTiltLayout('编织那没有诗意，却能将你带到现实的神文之诗。', 12.5, tuning, theme, 1);
  assert.ok(lay.segments.length >= 1 && lay.segments.length <= 4, '段数 1-4');
  let isTiltCount = 0, prevEnd = 0;
  for (const seg of lay.segments) {
    assert.equal(typeof seg.text, 'string');
    assert.ok(seg.charOffset >= prevEnd, 'charOffset 单调不减（原文坐标累计）');
    prevEnd = seg.charOffset + seg.text.length;
    if (seg.isTilt) isTiltCount++;
  }
  assert.ok(isTiltCount <= 1, '大斜体段至多一个');
  assert.ok(lay.scaleMultiplier >= 0.5 && lay.scaleMultiplier <= 1, '缩放乘数落在双下限 [0.5,1]');

  /* 42 字无标点长行：fallback 量宽必触溢出 → 多段拆行（重拆/缩放路径） */
  const long = env.tiltBuildTiltLayout('潮'.repeat(42), 3, tuning, theme, 1);
  assert.ok(long.segments.length >= 2, '超宽行必须拆为多段');
  assert.ok(long.scaleMultiplier <= 1, '溢出路径缩放乘数 ≤1');
}

/* colorMix.ts / subtitleFontSizes.ts（底部字幕路径依赖） */
{
  assert.equal(env.CM_colorWithAlpha('#0e0906', 0.96), 'rgba(14, 9, 6, 0.96)');
  assert.equal(env.CM_resolveSubtitleFontSizes(1).translationFontSize, 'clamp(1.125rem, 2.600vw, 1.250rem)');
}

/* ---------- 3) 桥契约 ---------- */
{
  const src = fs.readFileSync(BRIDGE, 'utf8');
  new vm.Script(src, { filename: '20b-tilt-engine-bridge.js' });   // 可编译
  assert.match(src, /function applyTiltMode\(on, opts\)/, '注册表 applyFn 入口名必须保留');
  assert.match(src, /var tiltMode\s*=/, '注册表 stateVar 名必须保留');
  assert.match(src, /TiltTiltEngine\(/, '桥必须创建引擎实例');
  assert.match(src, /getAdjustedLyricPlaybackTime/, '时间源走歌词偏移修正');
  assert.match(src, /animationIntensity:\s*\(typeof visAnimationIntensityCurrent === 'function'\) \? visAnimationIntensityCurrent\(\) : 'normal'/, '强度档随 fx.visAnimationIntensity 下发');
  assert.match(src, /wordColors:\s*\(typeof visWordColorsList === 'function'\) \? visWordColorsList\(\) : \[\]/, '词色表随 orangesea-vis-word-colors-v1 下发');
  assert.match(src, /visModeTuningOverrides\('tilt'\)/, '调参覆盖随 create 下发（ orangesea-vis-tuning-v1）');
  assert.match(src, /visModeTuningRegisterLiveApply\('tilt'/, '引擎 setTuning → live 注册');
  assert.match(src, /tilt-engine-host/, '桥挂引擎宿主容器');
}

/* ---------- 4) 注册接线 ---------- */
{
  const loader = fs.readFileSync(LOADER, 'utf8');
  assert.match(loader, /js\/modules\/10-shell\/20b-tilt-engine-bridge\.js/, 'index-loader 清单挂 20b 桥');
  assert.ok(!loader.includes('20-tilt.js'), '旧简化实现必须从清单移除');

  const index = fs.readFileSync(INDEX, 'utf8');
  assert.match(index, /js\/modules\/10-shell-tilt-engine\/tilt-engine\.js/, 'index.html 静态注入引擎产物');
  const engineAt = index.indexOf('10-shell-tilt-engine/tilt-engine.js');
  const loaderAt = index.indexOf('js/index-loader.js');
  const pretextAt = index.indexOf('vendor/pretext/pretext.bundle.js');
  assert.ok(engineAt > 0 && loaderAt > engineAt, '引擎产物必须在 index-loader 之前加载');
  assert.ok(pretextAt > 0 && pretextAt < engineAt, 'pretext 全局 bundle 必须在引擎之前加载（measureAtSize）');
  assert.match(index, /id="tilt-engine-host"/, '引擎宿主容器存在');
  assert.ok(index.indexOf('tilt-stage') === -1 && index.indexOf('tilt-idle') === -1,
    '旧 DOM 结构（tilt-stage/tilt-idle）必须移除');

  const registry = fs.readFileSync(REGISTRY, 'utf8');
  assert.match(registry, /id:\s*'tilt'[\s\S]*?stateVar:\s*'tiltMode'/, '注册表 tilt 行保留');
  assert.match(registry, /applyFn:\s*'applyTiltMode'/, '注册表 applyFn 保留');

  const css = fs.readFileSync(CSS, 'utf8');
  assert.ok(!/\.tilt-(block|seg|char|stage|idle)\b/.test(css), 'tilt.css 不得再持 .tilt-* 动画类（引擎 inline style 单主路径）');
  assert.match(css, /#tilt-engine-host/, 'tilt.css 提供引擎宿主定位');

  assert.ok(!fs.existsSync(OLD_IMPL), '旧简化实现 20-tilt.js 已删除（不得两套主路径并存）');
}

/* ---------- 5) 模式背景层（VisualizerShell 默认背景 Latent 的引擎落地） ---------- */
{
  /* env 注出面（manual/tilt-background-core.js 经 exports 注出） */
  assert.equal(typeof env.TiltLatentBackground, 'function', 'env.TiltLatentBackground 必须由引擎注出');
  for (const fn of ['tiltLatentDefaultTuning', 'tiltLatentBroadbandEnergy', 'tiltLatentOnsetPulse',
    'tiltLatentBeatSpeedTarget', 'tiltLatentAudioSpeedTarget', 'tiltLatentShaderSpeed', 'tiltLatentShaderColors']) {
    assert.ok(env[fn] != null, 'env.' + fn + ' 必须由引擎注出（背景层纯函数）');
  }

  /* DEFAULT_LATENT_BACKGROUND_TUNING（types.ts:1045-1061 原值全 14 字段） */
  const tuning = env.tiltLatentDefaultTuning;
  assert.equal(tuning.displayMode, 'both');
  assert.equal(tuning.colorSource, 'cover-theme');
  assert.equal(tuning.dynamicOnlyInPlayer, true);
  assert.ok(tuning.enhancedBeatResponse === true);
  assert.equal(tuning.ditheringSpeed, 0.1);
  assert.equal(tuning.ditheringAudioSpeed, 1.2);
  assert.equal(tuning.ditheringSize, 2.5);
  assert.equal(tuning.ditheringOpacity, 0.55);
  assert.equal(tuning.meshSpeed, 0.3);
  assert.equal(tuning.meshAudioSpeed, 2);
  assert.equal(tuning.meshDistortion, 0.8);
  assert.equal(tuning.meshSwirl, 0.1);
  assert.ok(tuning.overlayEnabled === true);
  assert.equal(tuning.overlayOpacity, 0.35);

  /* resolveLatentBroadbandEnergy（LatentBackground.tsx:35-50）：0..255 语义、
     权重 0.22/0.18/0.22/0.28/0.10 → ^0.55 */
  assert.equal(env.tiltLatentBroadbandEnergy(255, 255, 255, 255, 255), 1, '满带 → 1^0.55=1');
  assert.ok(Math.abs(env.tiltLatentBroadbandEnergy(127.5, 127.5, 127.5, 127.5, 127.5) - Math.pow(0.5, 0.55)) < 1e-12,
    '半带 → 0.5^0.55');
  assert.ok(Math.abs(env.tiltLatentBroadbandEnergy(255, 0, 0, 0, 0) - Math.pow(0.22, 0.55)) < 1e-12,
    '仅 bass → 0.22^0.55');
  assert.equal(env.tiltLatentBroadbandEnergy(-255, 0, 0, 0, 0), 0, '负值夹紧 0');

  /* resolveLatentOnsetPulse（:52-59）：上冲 clamp((ΔE)*7)、衰减尾 0.84 */
  assert.equal(env.tiltLatentOnsetPulse(0.2, 0, 0), 1, 'ΔE=0.2 → (0.2*7) 夹紧 1');
  assert.equal(env.tiltLatentOnsetPulse(0.1, 0.1, 1), 0.84, '能量持平 → 脉冲衰减尾 0.84');
  assert.equal(env.tiltLatentOnsetPulse(0.05, 0.1, 0), 0, '能量回落且无尾 → 0');

  /* resolveLatentBeatSpeedTarget（:60-63）：E*0.42 + pulse*0.85 夹紧 1 */
  assert.equal(env.tiltLatentBeatSpeedTarget(1, 1), 1, '1.27 夹紧 1');
  assert.ok(Math.abs(env.tiltLatentBeatSpeedTarget(0.5, 0) - 0.21) < 1e-12, 'E=0.5 pulse=0 → 0.21');

  /* resolveLatentAudioSpeedTarget（:64-70）：enhanced=true 走节拍合成，false 走 E */
  assert.equal(env.tiltLatentAudioSpeedTarget(0.5, 1, true), env.tiltLatentBeatSpeedTarget(0.5, 1));
  assert.equal(env.tiltLatentAudioSpeedTarget(0.5, 1, false), 0.5);

  /* resolveLatentShaderSpeed（:71-80）：base↔audio 缓动；暂停 → base*0.12；夹紧 0..2 */
  assert.equal(env.tiltLatentShaderSpeed(0.1, 1.2, 0, false), 0.1, 'amount=0 → base');
  assert.equal(env.tiltLatentShaderSpeed(0.1, 1.2, 1, false), 1.2, 'amount=1 → audio');
  assert.ok(Math.abs(env.tiltLatentShaderSpeed(0.1, 1.2, 0.5, false) - 0.65) < 1e-12, 'amount=0.5 → 中点');
  assert.ok(Math.abs(env.tiltLatentShaderSpeed(0.1, 1.2, 1, true) - 0.1 * 0.12) < 1e-12, '暂停 → base*0.12');
  assert.equal(env.tiltLatentShaderSpeed(2, 4, 1, false), 2, '超上限夹紧 2');
  assert.equal(env.tiltLatentShaderSpeed(0, 1, 0.5, false), 0.5, '下限 0');

  /* resolveLatentShaderColors（:81-107）：cover-theme 缺省分支的主题兜底链 */
  const theme = { backgroundColor: '#0e0906', primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6' };
  const fallback = env.tiltLatentShaderColors([], theme, 'cover-theme');
  assert.deepEqual(Array.from(fallback.mesh), ['#e6c9a6', '#f6efe2', '#e6c9a6', '#f6efe2', '#0e0906', '#ffcf9e'],
    '无封面色：primary←secondary，secondary←primary，tertiary/quaternary 沿兜底链');
  assert.equal(fallback.ditheringBack, '#0e0906', 'ditheringBack ← 主题底色');
  assert.equal(fallback.ditheringFront, '#e6c9a6', 'ditheringFront ← primary');
  const withCover = env.tiltLatentShaderColors(['#ff0000', '#00ff00', '#0000ff', '#ffff00'], theme, 'cover-theme');
  assert.deepEqual(Array.from(withCover.mesh), ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#0e0906', '#ffcf9e'],
    '封面 4 色 + 主题底色 + 主题强调色（6 槽）');

  /* 桥契约新增：背景层创建/销毁/信号映射 */
  const bridgeSrc = fs.readFileSync(BRIDGE, 'utf8');
  assert.match(bridgeSrc, /TiltLatentBackground\(\{/, '桥必须创建背景层实例');
  assert.match(bridgeSrc, /startTiltBg\(\)/, 'startTilt 必须先建背景层');
  assert.match(bridgeSrc, /tiltBg\.destroy\(\)/, 'stopTilt 必须销毁背景层');
  assert.match(bridgeSrc, /tiltLatentBands\b/, '桥必须提供 bands 信号');
  assert.match(bridgeSrc, /getControlCoverUrl/, '封面源走 getControlCoverUrl');

  /* AudioBands 原版精确信号路径（usePlaybackVisualizerBridge.ts:93-131 同构，
     取代旧 kick/vocal 复合带近似——旧断言随近似路径一并移除） */
  assert.match(bridgeSrc, /function tiltLatentAudible\(\)/, '可闻判定（!paused && !ended && analyser，:81-87）');
  assert.match(bridgeSrc, /tiltBandsCompute\(\(typeof frequencyData/, 'bands/audioPower 走保活 frequencyData 的原版精确计算');
  assert.match(bridgeSrc, /tiltBandsBreath\(Date\.now\(\)\)/, '不可闻 → 呼吸值（:121-131）');
  assert.ok(!/motionSignalGet\('bands'\)/.test(bridgeSrc), '已废除 kick/vocal 复合带近似映射');
  assert.ok(!/tiltLatentBandsFallback/.test(bridgeSrc), '已废除近似自算回退（原版是精确分箱，不存在近似回退）');
  assert.ok(!/fontWeight:\s*\d/.test(bridgeSrc), '主题不写死字重——folia 用户字重 ?? undefined（buildVisualizerTheme.ts:43），引擎回退 400/300（VisualizerTilt.tsx:444/495）');

  /* AudioBands 数值级（env 注出纯函数；bin = floor(hz/21.5) 硬编码同原版） */
  assert.equal(typeof env.tiltBandsGetEnergy, 'function', 'env.tiltBandsGetEnergy 必须注出');
  assert.equal(env.tiltBandsGetEnergy(null, 20, 150), 0, '无频谱数据 → 0');
  {
    const flat = new Uint8Array(1024).fill(100);
    assert.equal(env.tiltBandsGetEnergy(flat, 20, 150), 100, '全平频谱 → 区间均值 100');
    const bassOnly = new Uint8Array(1024);
    for (let i = 0; i <= 6; i++) bassOnly[i] = 255;   // bins 0-6 = 20-150Hz（floor(150/21.5)=6）
    assert.equal(env.tiltBandsGetEnergy(bassOnly, 20, 150), 255, 'bass 区间满幅');
    assert.ok(Math.abs(env.tiltBandsGetEnergy(bassOnly, 150, 400) - 255 / 13) < 1e-9,
      'lowMid 区间 floor(150/21.5)=6..floor(400/21.5)=18 共 13 bin，仅 bin6 满幅 → 255/13');

    const c = env.tiltBandsCompute(bassOnly);
    assert.equal(c.bass, 255, 'bass = process(255, 1.8) = 255');
    const lowMidRaw = 255 / 13;
    assert.ok(Math.abs(c.lowMid - Math.pow(lowMidRaw / 255, 2) * 255) < 1e-9, 'lowMid boost=2');
    assert.ok(Math.abs(c.audioPower - Math.pow(((255 + lowMidRaw) / 2) / 255, 3) * 255) < 1e-9,
      'audioPower = process((bass+lowMid)/2, 3)——吃整形前原始能量（:115）');
    const z = env.tiltBandsCompute(new Uint8Array(1024));
    assert.equal(z.audioPower, 0); assert.equal(z.bass, 0); assert.equal(z.treble, 0, '全零频谱 → 全零带');
    const f = env.tiltBandsCompute(new Uint8Array(1024).fill(255));
    assert.equal(f.bass, 255); assert.equal(f.lowMid, 255); assert.equal(f.mid, 255);
    assert.equal(f.vocal, 255); assert.equal(f.treble, 255); assert.equal(f.audioPower, 255, '满幅频谱 → 全 255');
  }
  assert.equal(env.tiltBandsBreath(0), 20, '呼吸值 t=0 → 20');
  assert.ok(Math.abs(env.tiltBandsBreath(Math.PI * 1000) - 40) < 1e-9, '呼吸值 t=π/2 峰值 40（0..40 正弦）');

  /* 空态/字幕/字重（渲染核心源码级——本轮原版对齐点） */
  const engineSrc = fs.readFileSync(ENGINE, 'utf8');
  assert.match(engineSrc, /idle\.textContent = '';/, '空态文案忠实取 t() 空串（folia en/zh-CN.ts:628、in.ts:623 该键均为 ""）');
  assert.match(engineSrc, /idle\.style\.opacity = activeLine \? '0' : '1';/, '空态显示态 inline opacity 1（framer inline 压过 className opacity-50）');
  assert.match(engineSrc, /filter:blur\(40px\)/, '字幕 glow blur-2xl=40px（VisualizerSubtitleOverlay.tsx:157）');
  assert.match(engineSrc, /CM_resolveThemeTranslationFontStack\(theme\)/, 'translation 专用字体栈（fontStacks.ts:193-197 回退 TRANSLATION_FONT_STACKS）');
  assert.match(engineSrc, /CM_resolveThemeFontWeight\(theme, 500\)/, 'translation 主行字重 500 回退（VisualizerSubtitleOverlay.tsx:188）');
  assert.match(engineSrc, /mmSetInitial\(transEl, \{ opacity: 0, y: 10 \}, null\)/, 'translation 行入场 initial{0,y:10}（:175-179）');
  {
    const tstack = env.CM_resolveThemeTranslationFontStack({ fontStyle: 'sans', fontFamilyStack: ['"TestFont"'] });
    assert.ok(tstack.indexOf('"TestFont"') === 0 && tstack.indexOf('system-ui') > 0,
      'translation 栈 = 自定义栈 + TRANSLATION_FONT_STACKS.sans（system-ui 起头）');
  }

  const indexSrc = fs.readFileSync(INDEX, 'utf8');
  assert.match(indexSrc, /id="tilt-bg-layer"/, 'index.html tilt 区块持背景层容器');
  assert.match(indexSrc, /10-shell-tilt-engine\/tilt-engine\.js\?v=4/, '引擎产物带 ?v=4 缓存版本（精确频段信号/空态/字幕/字重对齐重生成）');

  const cssSrc = fs.readFileSync(CSS, 'utf8');
  assert.match(cssSrc, /#tilt-bg-layer/, 'tilt.css 提供背景层容器壳定位');
}

console.log('OK tests/tilt.test.js — 引擎产物加载/关键算法/桥契约/注册接线 全部通过');