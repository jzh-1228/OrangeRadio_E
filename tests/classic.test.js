'use strict';
/* 流萤辉光（classic）· 原版渲染核心引擎的产物与接线验证
   ----------------------------------------------------------------------------
   覆盖：
   1) 引擎产物可加载：vm 沙箱执行 classic-engine.js 的 IIFE，
      env.ClassicClassicEngine 与全部 CM_* 闭包别名注入齐全；
   2) 关键算法（直接调用 env 注出的 Folia 闭包符号，数值级断言）：
      renderHints 三档分档 / graphemeTiming 均分时序 / wordColoring
      关键词着色 / colorMix 透明度 / 字幕字号；
   2.5) 手工渲染核心（Visualizer.tsx 同构段，管线 aliasExports 注出）：
      classicComputeLayouts 布局（确定性 RNG / 防重叠 margin / interlude /
      legacy）/ 词三态机边界（lookahead 与 activeEndTime 闭区间，三档
      revealMode）/ wordGlow 三态转换（text-shadow 与 drop-shadow 双形态
      全分支）/ 词容器与词身 variants / 行容器三档进出 / 呼吸浮动；
   3) 桥契约：20b 桥可编译、applyClassicMode/classicMode 入口齐全、
      引擎宿主数据流（toLines 形状 / MV subscribe）、主题不写死 fontWeight
      （壳 400 / 词 700 / 翻译 500 / 预览 400 逐调用点回退）、Latent 背景
      接线（TiltLatentBackground + 信号桥 + 主题/封面热更）、空态 i18n
      空串语义与翻译行字重/字体栈落点；
   4) 注册接线：registry 行、index-loader 清单、index.html script 与
      classic-engine-host、classic.css 不再持 .cl-* 动画类（防与引擎
      inline style 双主路径冲突）、旧简化实现已删除。
   算法参照：folia-major src/utils/lyrics/renderHints.ts、
   src/utils/lyrics/graphemeTiming.ts、src/components/visualizer/wordColoring.ts
   （AGPL-3.0，见 NOTICE.md）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'public', 'js', 'modules', '10-shell-classic-engine', 'classic-engine.js');
const BRIDGE = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20b-classic-engine-bridge.js');
const LOADER = path.join(ROOT, 'public', 'js', 'index-loader.js');
const INDEX = path.join(ROOT, 'public', 'index.html');
const REGISTRY = path.join(ROOT, 'public', 'js', 'modules', '02-visual', '90-visualizer-registry.js');
const CSS = path.join(ROOT, 'public', 'css', 'classic.css');
const OLD_IMPL = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20-classic.js');

/* ---------- 1) 引擎产物可加载（vm 沙箱执行，env 注出面） ---------- */
const sandbox = { console, Math, JSON, Object, Array, Number, parseInt, parseFloat, isFinite, RegExp, Date, Intl };
sandbox.window = sandbox;
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(ENGINE, 'utf8'), { filename: 'classic-engine.js' }).runInContext(sandbox);
const env = sandbox.window;
const ENGINE_SRC = fs.readFileSync(ENGINE, 'utf8');
/* vm 沙箱 realm 的对象与主 realm 字面量 deepStrictEqual 会因 prototype 不同而误报——
   JSON 归一后再比较（仅用于手工核心 variants 返回值断言） */
const vmJson = (o) => JSON.parse(JSON.stringify(o));

assert.equal(typeof env.ClassicClassicEngine, 'function', 'env.ClassicClassicEngine 必须由引擎产物注出');
for (const alias of [
  'CM_isGlowBlurQuantized', 'CM_colorWithAlpha', 'CM_parseColorChannels', 'CM_mixColors',
  'CM_buildLineRenderHints', 'CM_getLineRenderHints', 'CM_getLineRenderEndTime',
  'CM_buildWordGraphemeTimings', 'CM_splitLyricGraphemes',
  'CM_buildPostLyricLayoutUnits', 'CM_buildDisplayWordsFromLayoutUnits',
  'CM_resolveThemeFontStack', 'CM_resolveThemeFontWeight', 'CM_resolveThemeTranslationFontStack',
  'CM_resolveWordColor', 'CM_buildWordColorRanges', 'CM_prepareWordColorMatchers',
  'CM_resolveSubtitleFontSizes', 'CM_setGlowBlurQuantized',
  /* 手工渲染核心（Visualizer.tsx 同构段）注出——布局/三态/variants 可测 */
  'classicWordStatusAt', 'classicComputeLayouts', 'ClassicWordGlowVariants', 'ClassicBodyVariants',
  'classicMakeLayoutVariants', 'classicWordActiveEndTime', 'classicWordDisplayDuration',
  'classicResolveLineRenderProfile', 'classicBuildDisplayWords',
  'classicLineContainerMotion', 'classicLyricContainerFloat',
]) {
  assert.ok(env[alias] != null, alias + ' 必须由管线 aliasExports 注出');
}

/* ---------- 2) 关键算法（Folia 闭包原函数，数值级） ---------- */

/* renderHints.ts：行时长三档（0.10/0.18 阈值 + micro 渲染下限 0.067） */
{
  const micro = env.CM_buildLineRenderHints(10, 10.05);
  assert.equal(micro.timingClass, 'micro');
  assert.equal(micro.lineTransitionMode, 'none');
  assert.equal(micro.wordRevealMode, 'instant');
  assert.equal(micro.renderEndTime, 10.067);          // MICRO_LINE_RENDER_FLOOR

  const short = env.CM_buildLineRenderHints(0, 0.15);
  assert.equal(short.timingClass, 'short');
  assert.equal(short.lineTransitionMode, 'fast');
  assert.equal(short.wordRevealMode, 'fast');

  const normal = env.CM_buildLineRenderHints(0, 2);
  assert.equal(normal.timingClass, 'normal');
  assert.equal(normal.lineTransitionMode, 'normal');
  assert.equal(normal.wordRevealMode, 'normal');
  // buildLineRenderEndTime（renderHints.ts:114-135）：exitDur=0.32、passStart=1.9+0.06、
  // renderEnd = max(endTime, passStart + exitDur) = max(2, 2.28)
  const line = { startTime: 0, endTime: 2, words: [{ endTime: 1.9 }] };
  const h = env.CM_buildLineRenderHints(line);
  assert.equal(h.renderEndTime, 2.28);
}

/* graphemeTiming.ts：词内 grapheme 均分 */
{
  const gs = env.CM_buildWordGraphemeTimings({ text: '世界', startTime: 1, endTime: 3 });
  assert.equal(gs.length, 2);
  assert.equal(gs[0].char, '世');
  assert.equal(gs[0].startTime, 1);
  assert.equal(gs[0].endTime, 2);
  assert.equal(gs[1].char, '界');
  assert.equal(gs[1].endTime, 3);
}

/* wordColoring.ts：resolveWordColor（英文整词归一 + CJK 包含） */
{
  const wordColors = [{ word: 'my love', color: '#ff0000' }, { word: '潮水', color: '#3366ff' }];
  assert.equal(env.CM_resolveWordColor('Love', wordColors, '#ffffff'), '#ff0000');
  assert.equal(env.CM_resolveWordColor('潮', wordColors, '#ffffff'), '#3366ff');
  assert.equal(env.CM_resolveWordColor('none', wordColors, '#123456'), '#123456');
  // 关键词区间：buildWordColorRanges(lineText, wordColors) 自带 matcher 构建（wordColoring.ts:178-187）
  const ranges = env.CM_buildWordColorRanges('my love my', wordColors);
  assert.equal(ranges.length, 3);                      // my / love / my 全命中
  assert.equal(ranges[0].color, '#ff0000');
  assert.deepEqual(env.CM_prepareWordColorMatchers(wordColors, true).length, 2);
}

/* colorMix.ts：hex → rgba（仅 # 前缀，非色值原样返回——Folia 原行为） */
{
  assert.equal(env.CM_colorWithAlpha('#ff8c00', 0.7), 'rgba(255, 140, 0, 0.7)');
  assert.equal(env.CM_colorWithAlpha('#f0f', 1), 'rgba(255, 0, 255, 1)');
  assert.equal(env.CM_colorWithAlpha('f0f', 1), 'f0f');
}

/* cjkSemanticLayout.ts：sticky 标点粘连（It'+s → It's 单显示词） */
{
  const mkWord = (text, s, e) => ({ text, startTime: s, endTime: e });
  const line = {
    fullText: "It's ok",
    wordSegments: undefined,
    words: [mkWord('It', 0, 0.3), mkWord('’', 0.3, 0.35), mkWord('s', 0.35, 0.5), mkWord('ok', 0.5, 1)]
  };
  const units = env.CM_buildPostLyricLayoutUnits(line, { semantic: true, sticky: true });
  const display = env.CM_buildDisplayWordsFromLayoutUnits(units);
  const texts = display.map((w) => w.text).join('|');
  assert.equal(texts, 'It\u2019s|ok', 'sticky 应把 It+\u2019+s 粘成单显示词（原词为弯引号 U+2019）');
}

/* subtitleFontSizes.ts：两组 clamp 唯一来源 */
{
  const s = env.CM_resolveSubtitleFontSizes(1);
  assert.equal(s.translationFontSize, 'clamp(1.125rem, 2.600vw, 1.250rem)');
  assert.equal(s.upcomingFontSize, 'clamp(0.875rem, 2.000vw, 1.000rem)');
}

/* mini-motion 插值纯函数（'none' 零形态 + shadow 类复合值逐段渐变）：
   语义依据 framer-motion motion-dom —— make-none-animatable.mjs（关键帧
   'none' 位按第一个含复杂数值的关键帧作模板推导零形态）、complex/index.mjs
   getAnimatableNone（数字→0 保留单位、颜色保留 RGB 置 alpha=0）。 */
{
  const halo = '0 0 20px rgba(255, 140, 0, 0.7), 0 0 40px rgba(255, 140, 0, 0.7)';

  // 零形态推导：长度全 0 保留单位、颜色保留 RGB 置 alpha=0（多段逐一对应）
  assert.equal(env.CM_mmZeroFormOf(halo),
    '0 0 0px rgba(255, 140, 0, 0), 0 0 0px rgba(255, 140, 0, 0)');

  // 关键帧归一化：['none', halo, 'none'] 首末 'none' 位替换为零形态、中帧与原数组不动
  const kfs = env.CM_mmMakeNoneKeyframesAnimatable(['none', halo, 'none']);
  assert.deepEqual(kfs, [env.CM_mmZeroFormOf(halo), halo, env.CM_mmZeroFormOf(halo)]);

  // 逐段插值：零形态 → halo 的 k=0.25 中间值（blur 5/10px、alpha 0.175 连续渐变）
  const quarter = env.CM_mmMixTokens(env.CM_mmZeroFormOf(halo), halo, 0.25);
  assert.equal(quarter, '0 0 5px rgba(255, 140, 0, 0.175), 0 0 10px rgba(255, 140, 0, 0.175)');

  // 单值对归一化：textShadow 'none' → halo 走零形态（wordGlow passed 收敛路径）
  const norm = env.CM_mmMixTokens('0 0 0px rgba(255, 140, 0, 0)', '0 0 20px rgba(255, 140, 0, 0.7)', 0.5);
  assert.equal(norm, '0 0 10px rgba(255, 140, 0, 0.35)');
}

/* classicComputeLayouts —— 布局确定性 RNG / 防重叠 margin / interlude / legacy
   （Visualizer.tsx:351-471 公式逐项交叉验证；node 无 canvas → measureWordWidth
   走 text.length*pxSize*0.65 回退分支，classic-engine-core.js:118） */
{
  const tuning = { enableWordRotation: true, breathingFloatMultiplier: 1, useLegacyLayout: false, wordSpacing: 0.7 };
  const theme = { animationIntensity: 'normal', fontStyle: 'sans' };
  const line = {
    fullText: 'hello world', startTime: 100, endTime: 104,
    words: [{ text: 'hello', startTime: 100, endTime: 102 }, { text: 'world', startTime: 102, endTime: 104 }]
  };
  const layout1 = env.classicComputeLayouts(line, line.words, tuning, theme, 1, 1200);
  const layout2 = env.classicComputeLayouts(line, line.words, tuning, theme, 1, 1200);
  assert.deepEqual(layout1, layout2, '同参布局必须确定（seed=startTime，:350-354）');

  /* 确定性 RNG（:398-401）：random(offset)=frac(sin(wordSeed+offset)*10000)，
     wordSeed=seed+i；normal 档 baseSpread=20、baseRotate=5（:391-392） */
  const seed = 100;
  const frac = (v) => v - Math.floor(v);
  const rnd = (wordSeed, off) => frac(Math.sin(wordSeed + off) * 10000);
  const w0 = layout1.wordConfigs[0];
  assert.equal(w0.x, (rnd(seed, 1) - 0.5) * 40);
  assert.equal(w0.y, (rnd(seed, 2) - 0.5) * 40);
  assert.equal(w0.rotate, (rnd(seed, 3) - 0.5) * 10);            // baseRotate*2（:462）
  assert.equal(w0.passedRotate, (rnd(seed, 8) - 0.5) * 45);      // （:466）
  assert.equal(w0.scale, 1.1 + rnd(seed, 4) * 0.2);              // normal 档（:419）

  /* 行容器配置（:371-375）：justify=Math.floor(seed%5)、align=Math.floor(seed*2%3) */
  assert.equal(layout1.lineConfig.justifyContent, 'justify-start');  // 100%5=0
  assert.equal(layout1.lineConfig.alignItems, 'items-end');          // 200%3=2
  assert.equal(layout1.lineConfig.perspective, 1000);                // 非 chaotic（:374）

  /* 防重叠 margin（:425-456 原公式）：pxFontSize=clamp(36,72,72)=72（:381-387） */
  const pxFontSize = 72;
  const widthOf = (t) => t.length * pxFontSize * 0.65;
  const s0 = (1.1 + rnd(seed, 4) * 0.2) * 1.4;
  const s1 = (1.1 + rnd(seed + 1, 4) * 0.2) * 1.4;
  const gap = 0.05 * pxFontSize;
  const halfOverflow = (w, s) => w * (s - 1) / 2;
  const x0 = (rnd(seed, 1) - 0.5) * 40;
  const x1 = (rnd(seed + 1, 1) - 0.5) * 40;
  const minMargin = 0.12 * pxFontSize * 0.7;                      //（:453）
  const marginOf = (wI, sI, wN, sN, xI, xN) =>
    (Math.max(minMargin, (halfOverflow(wI, sI) + halfOverflow(wN, sN) + (xI - xN) + gap) * 0.7)).toFixed(1) + 'px';
  assert.equal(w0.marginRight, marginOf(widthOf('hello'), s0, widthOf('world'), s1, x0, x1));
  /* 末词（i=1）无下一词：w_next=0、s_next=1、x_next=0（:430-444） */
  const w1 = layout1.wordConfigs[1];
  assert.equal(w1.marginRight, marginOf(widthOf('world'), s1, 0, 1.0, x1, 0));

  /* interlude（fullText='......'，:406-417）：固定几何 + 行居中 */
  const itune = { enableWordRotation: true, breathingFloatMultiplier: 1, useLegacyLayout: true, wordSpacing: 0.7 };
  const iline = { fullText: '......', startTime: 50, endTime: 52, words: [{ text: '......', startTime: 50, endTime: 52 }] };
  const ilayout = env.classicComputeLayouts(iline, iline.words, itune, theme, 1, 1200);
  assert.equal(ilayout.lineConfig.justifyContent, 'justify-center');  //（:372）
  const iw = ilayout.wordConfigs[0];
  assert.equal(iw.x, 0);
  assert.equal(iw.rotate, 0);
  assert.equal(iw.scale, 1.5);
  assert.equal(iw.marginRight, '3rem');
  assert.equal(iw.alignSelf, 'center');
  assert.equal(iw.passedRotate, 0);
  assert.equal(iw.y, (rnd(50, 2) - 0.5) * 15);

  /* legacy 布局（useLegacyLayout）：margin 固定 0.8rem（:423）+ 关旋转 */
  const ltune = { enableWordRotation: false, breathingFloatMultiplier: 1, useLegacyLayout: true, wordSpacing: 0.7 };
  const llayout = env.classicComputeLayouts(line, line.words, ltune, theme, 1, 1200);
  assert.equal(llayout.wordConfigs[0].marginRight, '0.8rem');
  assert.equal(llayout.wordConfigs[0].rotate, 0);
  assert.equal(llayout.wordConfigs[0].passedRotate, 0);
}

/* 词三态机 classicWordStatusAt（useMotionValueEvent :186-194 边界逐条） */
{
  const nline = {
    fullText: 'ab cd', startTime: 10, endTime: 14,
    words: [{ text: 'ab', startTime: 10, endTime: 11 }, { text: 'cd', startTime: 11.5, endTime: 13 }]
  };
  const nprof = env.classicResolveLineRenderProfile(nline);
  assert.equal(nprof.wordRevealMode, 'normal');
  assert.equal(nprof.wordLookahead, 0.15);                        //（:83）
  assert.equal(env.classicWordStatusAt(9.849, nline.words[0], nprof), 'waiting');
  assert.equal(env.classicWordStatusAt(9.85, nline.words[0], nprof), 'active', 'startTime-lookahead 等号进 active');
  assert.equal(env.classicWordStatusAt(11, nline.words[0], nprof), 'active', 'activeEndTime 闭区间');
  assert.equal(env.classicWordStatusAt(11.001, nline.words[0], nprof), 'passed');
  assert.equal(env.classicWordStatusAt(13, nline.words[1], nprof), 'active');
  assert.equal(env.classicWordStatusAt(13.001, nline.words[1], nprof), 'passed');

  /* instant 行（micro 时长 <0.1s）：lookahead 0.03、activeEnd=lineRenderEndTime（:87-89） */
  const iline = { fullText: 'ab', startTime: 20, endTime: 20.04, words: [{ text: 'ab', startTime: 20, endTime: 20.04 }] };
  const iprof = env.classicResolveLineRenderProfile(iline);
  assert.equal(iprof.wordRevealMode, 'instant');
  assert.equal(iprof.wordLookahead, 0.03);
  assert.equal(env.classicWordActiveEndTime(iline.words[0], iprof), iprof.lineRenderEndTime);

  /* fast 行（时长 0.10-0.18s）：activeEnd=min(renderEnd, max(wordEnd, start+0.12))（:92-94） */
  const fline = { fullText: 'ab', startTime: 30, endTime: 30.15, words: [{ text: 'ab', startTime: 30, endTime: 30.05 }] };
  const fprof = env.classicResolveLineRenderProfile(fline);
  assert.equal(fprof.wordRevealMode, 'fast');
  assert.equal(env.classicWordActiveEndTime(fline.words[0], fprof), 30.12);

  /* displayDuration 最短时长（:99-108）：instant 0.08 / fast 0.12 / normal 0.1 */
  assert.equal(env.classicWordDisplayDuration({ startTime: 0, endTime: 0.01 }, { wordRevealMode: 'instant', lineRenderEndTime: 0.05 }), 0.08);
  assert.equal(env.classicWordDisplayDuration({ startTime: 0, endTime: 0.05 }, { wordRevealMode: 'fast', lineRenderEndTime: 0.2 }), 0.12);
  assert.equal(env.classicWordDisplayDuration({ startTime: 0, endTime: 0.05 }, { wordRevealMode: 'normal', lineRenderEndTime: 0.2 }), 0.1);
}

/* wordGlow 三态转换（wordGlow.ts:84-156 全分支：text-shadow 与 drop-shadow 双形态） */
{
  const AC = '#ff8c00';
  const halo = (inner, outer) => '0 0 ' + inner + 'px ' + AC + ', 0 0 ' + outer + 'px ' + AC;
  const ds = (inner, outer) => 'drop-shadow(0 0 ' + (inner * 0.4) + 'px rgba(255, 140, 0, 0.7)) drop-shadow(0 0 ' + (outer * 0.4) + 'px ' + AC + ')';

  /* ---- 形态一：text-shadow（Linux 之外缺省，CM_setGlowBlurQuantized(false)） ---- */
  env.CM_setGlowBlurQuantized(false);
  assert.deepEqual(vmJson(env.ClassicWordGlowVariants.waiting()),
    { color: 'transparent', textShadow: 'none', opacity: 1, filter: 'none' });
  // 单字/CJK sustained：20/40 光晕、[0,1,1] 峰位、times [0,.9,1]（:136-143）
  assert.deepEqual(vmJson(env.ClassicWordGlowVariants.active({ activeColor: AC, duration: 0.5 })),
    { color: 'transparent', textShadow: ['none', halo(20, 40), halo(20, 40)], transition: { duration: 0.5, times: [0, 0.9, 1], ease: 'easeInOut' } });
  // 逐字扫光：charDuration*6 拉伸、times [0,.3,1]、delay=charStartTime-wordStartTime（:113-133）
  {
    const sweep = vmJson(env.ClassicWordGlowVariants.active({ activeColor: AC, duration: 0.9, index: 1, total: 3, charStartTime: 10.2, charEndTime: 10.5, wordStartTime: 10 }));
    assert.deepEqual(sweep.color, 'transparent');
    assert.deepEqual(sweep.textShadow, ['none', halo(20, 40), 'none'], 'letter 峰位 [0,1,0]——峰值后淡出');
    assert.deepEqual(sweep.transition.times, [0, 0.3, 1]);
    assert.deepEqual(sweep.transition.ease, 'easeInOut');
    assert.ok(Math.abs(sweep.transition.duration - 1.8) < 1e-9, 'charDuration*6');
    assert.ok(Math.abs(sweep.transition.delay - 0.2) < 1e-9, 'charDelay=charStartTime-wordStartTime');
  }
  // 逐字无 charTiming 兜底：singleDuration=duration/total、delay=singleDuration*index（:114-123）
  {
    const t2 = vmJson(env.ClassicWordGlowVariants.active({ activeColor: AC, duration: 0.9, index: 2, total: 3 }).transition);
    assert.ok(Math.abs(t2.duration - 1.8) < 1e-9);
    assert.ok(Math.abs(t2.delay - 0.6) < 1e-9);
    assert.deepEqual(t2.times, [0, 0.3, 1]);
  }
  // instant：14/24、duration min(d,0.12)、times [0,.35,1] easeOut（:91-99）
  assert.deepEqual(vmJson(env.ClassicWordGlowVariants.active({ activeColor: AC, duration: 0.5, wordRevealMode: 'instant' })),
    { color: 'transparent', textShadow: ['none', halo(14, 24), 'none'], transition: { duration: 0.12, times: [0, 0.35, 1], ease: 'easeOut' } });
  // fast：18/32、duration clamp(d,0.12,0.2)、times [0,.4,1] easeInOut（:102-110）
  assert.deepEqual(vmJson(env.ClassicWordGlowVariants.active({ activeColor: AC, duration: 0.5, wordRevealMode: 'fast' })),
    { color: 'transparent', textShadow: ['none', halo(18, 32), 'none'], transition: { duration: 0.2, times: [0, 0.4, 1], ease: 'easeInOut' } });
  // passed：textShadow 归 none、时长按 revealMode 0.12/0.22/0.9（:146-148）
  assert.deepEqual(vmJson(env.ClassicWordGlowVariants.passed({ activeColor: AC, wordRevealMode: 'normal' })),
    { color: 'transparent', textShadow: 'none', transition: { duration: 0.9, ease: 'easeOut' } });
  assert.equal(env.ClassicWordGlowVariants.passed({ activeColor: AC, wordRevealMode: 'fast' }).transition.duration, 0.22);

  /* ---- 形态二：drop-shadow 滤镜（Linux 防字形缓存 fd 泄漏，isGlowBlurQuantized()=true） ---- */
  env.CM_setGlowBlurQuantized(true);
  assert.deepEqual(vmJson(env.ClassicWordGlowVariants.waiting()),
    { color: 'transparent', opacity: 0, filter: 'none', transition: { duration: 0 } });
  // sustained：glyph 持色 + opacity 承载 alpha 坡 + filter 半径坡（glowKeyframes :72-77）
  assert.deepEqual(vmJson(env.ClassicWordGlowVariants.active({ activeColor: AC, duration: 0.5 })),
    { color: AC, opacity: [0, 1, 1], filter: [ds(0, 0), ds(20, 40), ds(20, 40)], transition: { duration: 0.5, times: [0, 0.9, 1], ease: 'easeInOut' } });
  // instant（quantized）：峰位 [0,1,0] → 末帧收敛零形态滤镜（:91-98）
  assert.deepEqual(vmJson(env.ClassicWordGlowVariants.active({ activeColor: AC, duration: 0.5, wordRevealMode: 'instant' })),
    { color: AC, opacity: [0, 1, 0], filter: [ds(0, 0), ds(14, 24), ds(0, 0)], transition: { duration: 0.12, times: [0, 0.35, 1], ease: 'easeOut' } });
  // passed（quantized）：颜色必须重申（否则字形透明不投影，光晕瞬灭）+ 收敛到 0/0 滤镜（:150-155）
  assert.deepEqual(vmJson(env.ClassicWordGlowVariants.passed({ activeColor: AC, wordRevealMode: 'instant' })),
    { color: AC, opacity: 0, filter: ds(0, 0), transition: { duration: 0.12, ease: 'easeOut' } });
  env.CM_setGlowBlurQuantized(false);   // 还原缺省形态
}

/* 词容器/词身三态 variants（Visualizer.tsx:475-543） */
{
  const lv = env.classicMakeLayoutVariants({ enableWordRotation: true }, { animationIntensity: 'normal' });
  const cfg = { x: 5, y: -3, rotate: 4, scale: 1.2, passedRotate: -10 };
  assert.deepEqual(vmJson(lv.waiting({ config: cfg })),
    { opacity: 0, scale: 0.5, x: 5 + Math.sin(-3) * 100, y: -3 + Math.cos(5) * 50, rotate: 24, transition: { duration: 0.4 } });
  const act = lv.active({ config: cfg });
  assert.equal(act.opacity, 1);
  assert.equal(act.scale, 1.2 * 1.4);
  assert.deepEqual(vmJson(act.transition), { type: 'spring', stiffness: 200, damping: 20, opacity: { duration: 0.1 } });
  assert.equal(lv.active({ config: Object.assign({}, cfg, { scale: NaN }) }).scale, 1.5, 'NaN scale 回退 1.5（:486）');
  const pas = lv.passed({ config: cfg });
  assert.equal(pas.opacity, 0.82, 'normal 档 passed 透明度（:498）');
  assert.equal(pas.rotate, -6);
  assert.deepEqual(vmJson(pas.transition), { duration: 0.5, rotate: { duration: 5, ease: 'linear' } });

  assert.deepEqual(vmJson(env.ClassicBodyVariants.waiting({ baseColor: '#fff' })),
    { color: '#fff', filter: 'blur(10px)', transition: { duration: 0.4 } });
  assert.deepEqual(vmJson(env.ClassicBodyVariants.active({ activeColor: '#ff8c00', duration: 0.4, wordRevealMode: 'normal' })),
    { color: '#ff8c00', filter: 'none', transition: { color: { duration: 0.4, ease: 'linear' }, filter: { type: 'tween', duration: 0.2 } }, transitionEnd: { filter: 'none' } });
  assert.deepEqual(vmJson(env.ClassicBodyVariants.active({ activeColor: '#fff', duration: 0.4, wordRevealMode: 'instant' }).transition.filter),
    { type: 'tween', duration: 0.08 });
  assert.deepEqual(vmJson(env.ClassicBodyVariants.passed({ baseColor: '#fff', wordRevealMode: 'normal' })),
    { color: '#fff', filter: 'blur(0px)', transition: { color: { duration: 0.8, ease: 'easeInOut' }, filter: { duration: 0.5 } }, transitionEnd: { filter: 'none' } });
}

/* 行容器进出三档 + 呼吸浮动（Visualizer.tsx:110-143 / :545-572） */
{
  const mNone = env.classicLineContainerMotion({ lineTransitionMode: 'none' });
  assert.equal(mNone.initial.opacity, 1);
  assert.equal(mNone.exit.scale, 1.02);
  assert.equal(mNone.exit.transition.duration, 0.12);
  const mFast = env.classicLineContainerMotion({ lineTransitionMode: 'fast' });
  assert.equal(mFast.initial.opacity, 0.35);
  assert.equal(mFast.animate.transition.duration, 0.16);
  const mNormal = env.classicLineContainerMotion(null);
  assert.equal(mNormal.initial.scale, 0.9);
  assert.equal(mNormal.exit.scale, 1.1);
  assert.equal(mNormal.exit.transition.duration, 0.3);

  assert.equal(env.classicLyricContainerFloat({ breathingFloatMultiplier: 0 }, { animationIntensity: 'normal' }), null, 'multiplier<=0 不浮动（:548-549）');
  const fl = env.classicLyricContainerFloat({ breathingFloatMultiplier: 1 }, { animationIntensity: 'normal' });
  assert.deepEqual(vmJson(fl.animate.y), [0, -14, 0, 6.3, 0]);           // distance 14（:554）
  assert.deepEqual(vmJson(fl.animate.scale), [1, 1.01, 1, 0.995, 1]);
  assert.equal(fl.transition.duration, 7);
  assert.equal(fl.transition.repeat, Infinity);   // repeat: Infinity——JSON 归一会变 null，直断
  assert.equal(fl.transition.ease, 'easeInOut');
}

/* 翻译行字体栈（fontStacks.ts:110-119）：自定义栈前缀 + TRANSLATION sans 兜底 */
{
  const stack = env.CM_resolveThemeTranslationFontStack({ fontStyle: 'sans', fontFamilyStack: ['MiSans'] });
  assert.match(stack, /"MiSans"/);
  assert.match(stack, /system-ui/);
}

/* ---------- 3) 桥契约 ---------- */
{
  const src = fs.readFileSync(BRIDGE, 'utf8');
  new vm.Script(src, { filename: '20b-classic-engine-bridge.js' });   // 可编译
  assert.match(src, /function applyClassicMode\(on, opts\)/, '注册表 applyFn 入口名必须保留');
  assert.match(src, /var classicMode\s*=/, '注册表 stateVar 名必须保留');
  assert.match(src, /ClassicClassicEngine\(/, '桥必须创建引擎实例');
  assert.match(src, /getAdjustedLyricPlaybackTime/, '时间源走歌词偏移修正');
  assert.match(src, /animationIntensity:\s*\(typeof visAnimationIntensityCurrent/, '强度档随 fx.visAnimationIntensity 下发（07-fx/11 数据面；无数据面回退 normal，four-modes 沙箱测试覆盖）');
  assert.match(src, /wordColors:\s*\(typeof visWordColorsList/, '词色表随 orangesea-vis-word-colors-v1 下发（07-fx/11 数据面；空表回退 accentColor，CM_resolveWordColor 测试覆盖）');
  assert.doesNotMatch(src, /fontWeight:\s*\d/, '桥主题不得写死 fontWeight——Folia 为用户歌词字重 ?? undefined，壳 400（Shell:132）/ 词 700（Visualizer:218）/ 翻译行 500（SubtitleOverlay:176）/ 下一句预览 400（:205）逐调用点回退，写死任一值都会顶掉其余回退');

  /* Latent 背景接管（VisualizerShell:185-197 缺省 latent，visualizerModes.ts:42） */
  assert.match(src, /startClassicBg/, '桥必须挂 Latent 背景（startClassicBg，先于歌词引擎）');
  assert.match(src, /typeof TiltLatentBackground !== 'function'/, '背景复用模式无关 TiltLatentBackground（tilt 产物注出），缺失时保底暗角层');
  assert.match(src, /classicLatentBands/, '背景信号桥 bands（0..1 → 0..255）');
  assert.match(src, /classicBg\.setTheme/, '主题热更同步背景层');
  assert.match(src, /classicBg\.setCoverUrl/, '封面热更同步背景层重取色');

  /* 引擎产物：空态 i18n 空串语义 + 翻译行字重/字体栈（本轮保真修复落点） */
  assert.ok(!/等待音乐/.test(ENGINE_SRC), '空态文案不得硬编码——Folia ui.waitingForMusic 三语言均为空串（en.ts:628/zh-CN.ts:628/in.ts:623），原版空态不渲染文案');
  assert.match(ENGINE_SRC, /CM_resolveThemeFontWeight\(theme, 500\)/, '翻译主行字重回退 500（SubtitleOverlay:176）');
  assert.match(ENGINE_SRC, /CM_resolveThemeFontWeight\(theme, 400\)/, '下一句预览字重回退 400（SubtitleOverlay:205）');
  assert.match(ENGINE_SRC, /CM_resolveThemeTranslationFontStack\(theme\)/, '翻译行走翻译字体栈（SubtitleOverlay:175/fontStacks.ts:110）');
  const index = fs.readFileSync(INDEX, 'utf8');
  assert.match(index, /id="classic-bg-layer"/, 'index.html 提供背景层容器');
  const css = fs.readFileSync(CSS, 'utf8');
  assert.match(css, /#classic-bg-layer/, 'classic.css 提供背景层容器壳（z 序在歌词宿主之下）');
}

/* ---------- 4) 注册接线 ---------- */
{
  const loader = fs.readFileSync(LOADER, 'utf8');
  assert.match(loader, /js\/modules\/10-shell\/20b-classic-engine-bridge\.js/, 'index-loader 清单挂 20b 桥');
  assert.ok(!loader.includes('20-classic.js'), '旧简化实现必须从清单移除');

  const index = fs.readFileSync(INDEX, 'utf8');
  assert.match(index, /js\/modules\/10-shell-classic-engine\/classic-engine\.js/, 'index.html 静态注入引擎产物');
  const engineAt = index.indexOf('10-shell-classic-engine/classic-engine.js');
  const loaderAt = index.indexOf('js/index-loader.js');
  assert.ok(engineAt > 0 && loaderAt > engineAt, '引擎产物必须在 index-loader 之前加载');
  assert.match(index, /id="classic-engine-host"/, '引擎宿主容器存在');
  assert.ok(index.indexOf('classic-lines') === -1 && index.indexOf('classic-idle') === -1,
    '旧 DOM 结构（classic-lines/classic-idle）必须移除');

  const registry = fs.readFileSync(REGISTRY, 'utf8');
  assert.match(registry, /id:\s*'classic'[\s\S]*?stateVar:\s*'classicMode'/, '注册表 classic 行保留');
  assert.match(registry, /applyFn:\s*'applyClassicMode'/, '注册表 applyFn 保留');

  const css = fs.readFileSync(CSS, 'utf8');
  assert.ok(!/\.cl-(word|line|glow|body|gc|ripple)\b/.test(css), 'classic.css 不得再持 .cl-* 动画类（引擎 inline style 单主路径）');
  assert.match(css, /#classic-engine-host/, 'classic.css 提供引擎宿主定位');

  assert.ok(!fs.existsSync(OLD_IMPL), '旧简化实现 20-classic.js 已删除（不得两套主路径并存）');
}

console.log('OK tests/classic.test.js — 引擎产物加载/关键算法/桥契约/注册接线 全部通过');
