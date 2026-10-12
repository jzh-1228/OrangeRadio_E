'use strict';
/* 云阶（partita）· 原版渲染核心引擎的产物与接线验证
   ----------------------------------------------------------------------------
   覆盖：
   1) 引擎产物可加载：vm 沙箱执行 partita-engine.js 的 IIFE，
      env.PartitaPartitaEngine / env.PartitaCore 与全部 CM_* 闭包别名注入齐全；
   2) 关键算法（数值级断言，参照 folia-major 源码）：
      · DEFAULT_PARTITA_TUNING（types.ts:428-433 原值）+ resolvePartitaTuning
        错位钳制（0~180、min/max 交换，VisualizerPartita.tsx:102-116）；
      · buildSequentialColumns（VisualizerPartita.tsx:205-314）：确定性种子、
        行数=可用高 65%/100 基准、stagger ∈ [20,100]、staggerScale 原式
        0.8+rand*0.9、marginBottom '0.6rem'、lineConfig perspective 1000
        （normal）/ columnGap '2rem'、单列结构、passedRotate ±3；
      · renderProfile/wordActiveEndTime/wordDisplayDuration（:118-156）；
      · 行容器三档 motion（:158-191）、词 layoutVariants 三态（:767-803）、
        bodyVariants（:805-833）、wordGlowVariants 量化/非量化两路（wordGlow.ts）；
      · lyricContainerFloat normal 档 {distance 14, duration 7}（:835-855）；
      · 字号公式（:761-765）；预热窗口 0.18~1.2（:85-88 + runtime.ts:90-101）；
      · findLineIndexAtTime（appPlaybackHelpers.ts:21-32 renderEndTime 权威）；
      · 闭包：renderHints 三档 / sticky 粘连 / wordColoring 回退 / 布局缓存键。
   3) 桥契约：20b 桥可编译、applyPartitaMode/partitaMode 入口齐全、
      引擎宿主数据流（toLines 形状 / MV subscribe）。
   4) 注册接线：registry 行、index-loader 清单、index.html script 与
      partita-engine-host、partita.css 不再持 .pt-* 动画类（防与引擎
      inline style 双主路径冲突）、旧简化实现 20-partita.js 已删除。
   算法参照：folia-major src/components/visualizer/partita/VisualizerPartita.tsx、
   src/utils/lyrics/renderHints.ts、src/utils/lyrics/cjkSemanticLayout.ts
   （AGPL-3.0，见 NOTICE.md）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'public', 'js', 'modules', '10-shell-partita-engine', 'partita-engine.js');
const BRIDGE = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20b-partita-engine-bridge.js');
const LOADER = path.join(ROOT, 'public', 'js', 'index-loader.js');
const INDEX = path.join(ROOT, 'public', 'index.html');
const REGISTRY = path.join(ROOT, 'public', 'js', 'modules', '02-visual', '90-visualizer-registry.js');
const CSS = path.join(ROOT, 'public', 'css', 'partita.css');
const OLD_IMPL = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20-partita.js');

/* ---------- 1) 引擎产物可加载（vm 沙箱执行，env 注出面） ---------- */
const sandbox = { console, Math, JSON, Object, Array, Number, parseInt, parseFloat, isFinite, RegExp, Date, Intl, Symbol, Map, Set, WeakMap, String, isNaN };
sandbox.window = sandbox;
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(ENGINE, 'utf8'), { filename: 'partita-engine.js' }).runInContext(sandbox);
const env = sandbox.window;

assert.equal(typeof env.PartitaPartitaEngine, 'function', 'env.PartitaPartitaEngine 必须由引擎产物注出');
assert.ok(env.PartitaCore && typeof env.PartitaCore.buildSequentialColumns === 'function', 'env.PartitaCore 诊断注出必须存在');
for (const alias of [
  'CM_isGlowBlurQuantized', 'CM_colorWithAlpha', 'CM_parseColorChannels', 'CM_mixColors',
  'CM_buildLineRenderHints', 'CM_getLineRenderHints', 'CM_getLineRenderEndTime',
  'CM_buildWordGraphemeTimings', 'CM_splitLyricGraphemes', 'CM_getWordSegmentationKey',
  'CM_buildPostLyricLayoutUnits', 'CM_buildDisplayWordsFromLayoutUnits',
  'CM_resolveThemeFontStack', 'CM_resolveThemeFontWeight',
  'CM_resolveWordColor', 'CM_buildWordColorRanges', 'CM_prepareWordColorMatchers',
]) {
  assert.ok(env[alias] != null, alias + ' 必须由管线 aliasExports 注出');
}

/* 空态文案照原版：Folia i18n 'ui.waitingForMusic' 三语言均为空串
   （zh-CN.ts:628 / en.ts:628 / in.ts:623），屏幕无字（不得回填自创文案） */
{
  const src = fs.readFileSync(ENGINE, 'utf8');
  assert.match(src, /idle\.textContent\s*=\s*''/, '空态文案必须为空串（t(ui.waitingForMusic) 原值）');
  assert.ok(!src.includes('等待音乐'), '不得出现自创空态文案');
}

/* ---------- 2) 关键算法（数值级） ---------- */

/* DEFAULT_PARTITA_TUNING（types.ts:428-433 原值）+ 预热窗口（VisualizerPartita.tsx:85-88）
   （vm 沙箱对象原型与宿主不同，逐字段断言） */
{
  const t = env.PartitaCore.DEFAULT_TUNING;
  assert.equal(t.showGuideLines, true, 'DEFAULT_PARTITA_TUNING 必须与 types.ts:428-433 同值');
  assert.equal(t.useSemanticLayout, true);
  assert.equal(t.staggerMin, 20);
  assert.equal(t.staggerMax, 100);
  assert.equal(env.PartitaCore.PREHEAT_WINDOW.minLead, 0.18);
  assert.equal(env.PartitaCore.PREHEAT_WINDOW.maxLead, 1.2);
  assert.equal(env.PartitaCore.LAYOUT_CACHE_LIMIT, 48);
}

/* resolvePartitaTuning（:102-116）：0~180 钳制 + min/max 交换 */
{
  const t = env.PartitaCore.resolveTuning({ staggerMin: 250, staggerMax: -5 });
  assert.equal(t.staggerMin, 0);
  assert.equal(t.staggerMax, 180);
  const swapped = env.PartitaCore.resolveTuning({ staggerMin: 90, staggerMax: 30 });
  assert.equal(swapped.staggerMin, 30);
  assert.equal(swapped.staggerMax, 90);
  const fallback = env.PartitaCore.resolveTuning(null);
  assert.deepEqual(fallback, env.PartitaCore.DEFAULT_TUNING);
}

/* buildSequentialColumns（:205-314 全量同构的数值验收） */
{
  const theme = {
    animationIntensity: 'normal', fontWeight: 700, wordColors: [],
    accentColor: '#ffcf9e', primaryColor: '#f6efe2', secondaryColor: '#e6c9a6',
    backgroundColor: '#0e0906', fontStyle: 'sans', fontFamilyStack: ['sans-serif']
  };
  const tuning = env.PartitaCore.resolveTuning(null);
  const line = {
    startTime: 10, endTime: 14,
    fullText: '天边的云 阶梯一样落下',
    words: [
      { text: '天边', startTime: 10, endTime: 10.8 }, { text: '的', startTime: 10.8, endTime: 11.0 },
      { text: '云', startTime: 11.0, endTime: 11.6 }, { text: '阶梯', startTime: 11.6, endTime: 12.4 },
      { text: '一样', startTime: 12.4, endTime: 13.0 }, { text: '落下', startTime: 13.0, endTime: 13.8 }
    ]
  };

  const l1 = env.PartitaCore.buildSequentialColumns(line, theme, 900, tuning);
  const l2 = env.PartitaCore.buildSequentialColumns(line, theme, 900, tuning);
  assert.deepEqual(l1, l2, '同一种子必须确定性产出同一布局（sin(seed++) RNG）');

  /* 单列结构（columns 恒 1 个，:297-302）；行数 = min(layoutUnits, floor(h*0.65/100)) */
  assert.equal(l1.columns.length, 1);
  assert.equal(l1.columns[0].id, 'column-10-0');
  assert.equal(l1.columns[0].words.length, 5, '900px 高 → floor(585/100)=5 行');
  assert.equal(l1.totalGraphemes, 10, 'fullText 去空白后 grapheme 数');

  /* lineConfig（:304-313）：normal 档 perspective 1000 / columnGap 2rem */
  assert.equal(l1.lineConfig.perspective, 1000);
  assert.equal(l1.lineConfig.alignItems, 'items-center');
  assert.equal(l1.lineConfig.justifyContent, 'justify-center');
  assert.equal(l1.lineConfig.columnGap, '2rem');

  /* 每行 config（:278-294 原式）：stagger ∈ [20,100] 交替、y=rowBias*2.5、
     scale=0.8+rand*0.9（normal 档）、marginBottom '0.6rem'、passedRotate ±3 */
  for (let r = 0; r < l1.columns[0].words.length; r++) {
    const row = l1.columns[0].words[r];
    assert.equal(row.rowIndex, r);
    assert.equal(row.order, r);
    const c = row.config;
    assert.ok(Math.abs(c.x) >= tuning.staggerMin - 1e-9 && Math.abs(c.x) <= tuning.staggerMax + 1e-9,
      'stagger 绝对值必须落在 [' + tuning.staggerMin + ',' + tuning.staggerMax + ']，got ' + c.x);
    if (r % 2 === 0) assert.ok(c.x < 0, '偶数行向左错落（isStaggeredLeft）');
    else assert.ok(c.x > 0, '奇数行向右错落');
    assert.ok(Math.abs(c.y - (r - 2) * 2.5) < 1e-9, 'y = rowBias*2.5（:287）');
    assert.ok(c.scale >= 0.8 - 1e-9 && c.scale <= 0.8 + 0.9 + 1e-9,
      'staggerScale 必须是原式 0.8+rand*0.9 ∈ [0.8,1.7]，got ' + c.scale);
    assert.equal(c.marginBottom, '0.6rem', 'normal 档 marginBottom 原值（:290）');
    assert.equal(c.rotate, 0, 'normal 档 rotate 0（:288）');
    assert.equal(c.passedRotate, (r % 2 === 0 ? 1 : -1) * 3, 'passedRotate ±3（:292）');
    assert.equal(c.alignSelf, 'center');
  }

  /* 行高变化 → 行数变化（缓存键含高度桶 :322） */
  const short = env.PartitaCore.buildSequentialColumns(line, theme, 300, tuning);
  assert.equal(short.columns[0].words.length, 1, '300px 高 → floor(195/100)=1 行');

  const allDisplay = l1.columns[0].words.flatMap((r) => r.displayWords.map((w) => w.text));
  assert.ok(allDisplay.join('|').includes('天边'), '语义分词保留词组');
}

/* 布局缓存键（:316-341）：全字段拼串 + 保存分词指纹参与 */
{
  const theme = { animationIntensity: 'normal', fontWeight: 700 };
  const tuning = env.PartitaCore.resolveTuning(null);
  const line = { startTime: 1, endTime: 2, fullText: 'ab', words: [{ text: 'ab', startTime: 1, endTime: 2 }] };
  const k1 = env.PartitaCore.buildLayoutCacheKey(line, theme, 900, tuning);
  const k2 = env.PartitaCore.buildLayoutCacheKey(line, theme, 900, tuning);
  const k3 = env.PartitaCore.buildLayoutCacheKey(line, theme, 960, tuning);
  assert.equal(k1, k2, '同参数同键');
  assert.equal(k1.split('|')[0], 'semantic-layout-v1', '键首段（:324）');
  assert.notEqual(k1, k3, '高度桶（/24）变 → 键变');
  assert.ok(k1.startsWith('semantic-layout-v1|1|2|1|ab|'), '键含 start/end/词数/fullText');
  const withSeg = env.PartitaCore.buildLayoutCacheKey(Object.assign({ wordSegments: ['a', 'b'] }, line), theme, 900, tuning);
  assert.notEqual(k1, withSeg, '保存分词指纹（getWordSegmentationKey）参与键（:329-331）');
}

/* renderProfile + 词 active end / display duration（:118-156 + renderHints 闭包） */
{
  const normalLine = { startTime: 0, endTime: 2, fullText: 'x', words: [{ text: 'x', startTime: 0, endTime: 1.9 }] };
  const p1 = env.PartitaCore.lineRenderProfile(normalLine);
  assert.equal(p1.lineTransitionMode, 'normal');
  assert.equal(p1.wordRevealMode, 'normal');
  assert.equal(p1.wordLookahead, 0.15);
  assert.equal(p1.lineRenderEndTime, 2.28, 'normal 档 renderEndTime = passStart+exitDur（renderHints）');

  /* fast 档：word.endTime 与 start+0.12 取大、再与 renderEnd 取小（:140-142） */
  const fastLine = { startTime: 0, endTime: 0.15, fullText: 'go', words: [{ text: 'go', startTime: 0, endTime: 0.1 }] };
  const p2 = env.PartitaCore.lineRenderProfile(fastLine);
  assert.equal(p2.wordRevealMode, 'fast');
  assert.equal(p2.wordLookahead, 0.08);
  const w = fastLine.words[0];
  assert.equal(env.PartitaCore.wordActiveEndTime(w, p2),
    Math.min(p2.lineRenderEndTime, Math.max(0.1, 0 + 0.12)), 'fast 档 active end 公式（:141）');
  assert.ok(env.PartitaCore.wordDisplayDuration(w, p2) >= 0.12, 'fast 档最小显示时长 0.12（:151-153）');

  /* instant 档：active end = lineRenderEndTime（:136-138） */
  const microLine = { startTime: 0, endTime: 0.05, fullText: '!', words: [{ text: '!', startTime: 0, endTime: 0.04 }] };
  const p3 = env.PartitaCore.lineRenderProfile(microLine);
  assert.equal(p3.wordRevealMode, 'instant');
  assert.equal(env.PartitaCore.wordActiveEndTime(microLine.words[0], p3), p3.lineRenderEndTime);
  assert.equal(env.PartitaCore.wordDisplayDuration(microLine.words[0], p3), Math.max(p3.lineRenderEndTime, 0.08));
}

/* 行容器三档 motion（:158-191 原值） */
{
  const none = env.PartitaCore.lineContainerMotion({ lineTransitionMode: 'none' });
  assert.equal(none.initial.opacity, 1);
  assert.equal(none.exit.scale, 1.02);
  assert.equal(none.exit.transition.duration, 0.12);
  const fast = env.PartitaCore.lineContainerMotion({ lineTransitionMode: 'fast' });
  assert.equal(fast.initial.opacity, 0.35);
  assert.equal(fast.initial.scale, 0.96);
  assert.equal(fast.exit.filter, 'blur(10px)');
  assert.equal(fast.exit.transition.ease, 'easeInOut');
  const normal = env.PartitaCore.lineContainerMotion(null);
  assert.equal(normal.initial.scale, 0.9);
  assert.equal(normal.exit.scale, 1.1);
  assert.equal(normal.exit.filter, 'blur(20px)');
  assert.equal(normal.exit.transition.duration, 0.3);
  assert.equal(normal.animate.transitionEnd.filter, 'none');
}

/* 词 layoutVariants 三态（:767-803 原式） */
{
  const theme = { animationIntensity: 'normal' };
  const v = env.PartitaCore.makeLayoutVariants(theme);
  const custom = { config: { x: 10, y: -4, rotate: 2, scale: 1.5, passedRotate: -9 }, baseColor: '#fff', activeColor: '#f00', duration: 0.3 };

  const waiting = v.waiting(custom);
  assert.equal(waiting.opacity, 0);
  assert.equal(waiting.scale, 0.5);
  assert.equal(waiting.x, 10 + Math.sin(-4) * 100, 'waiting x = x + sin(y)*100（:771）');
  assert.equal(waiting.y, -4 + Math.cos(10) * 50, 'waiting y = y + cos(x)*50（:772）');
  assert.equal(waiting.rotate, 22);
  assert.equal(waiting.transition.duration, 0.4);

  const active = v.active(custom);
  assert.equal(active.scale, 1.5 * 1.4, 'active scale = scale*1.4（:778）');
  assert.equal(active.transition.type, 'spring');
  assert.equal(active.transition.stiffness, 200);
  assert.equal(active.transition.damping, 20);
  assert.equal(active.transition.opacity.duration, 0.1, 'active spring(200,20)+opacity 0.1（:782-787）');
  assert.equal(v.active({ config: { scale: NaN } }).scale, 1.5, 'isNaN(scale) → 1.5（:778）');

  const passed = v.passed(custom);
  assert.equal(passed.opacity, 0.82, 'normal 档 passed opacity 0.82（:790）');
  assert.equal(passed.rotate, 2 + -9, 'passed rotate = rotate+passedRotate（:794）');
  assert.equal(passed.transition.duration, 0.5);
  assert.equal(passed.transition.rotate.duration, 5);
  assert.equal(passed.transition.rotate.ease, 'linear', 'passed 0.5s + rotate 5s linear（:795-801）');
}

/* bodyVariants（:805-833） */
{
  const b = env.PartitaCore.bodyVariants;
  const bw = b.waiting({ baseColor: '#fff' });
  assert.equal(bw.color, '#fff');
  assert.equal(bw.filter, 'blur(10px)');
  assert.equal(bw.transition.duration, 0.4);
  const a = b.active({ activeColor: '#f00', duration: 0.3, wordRevealMode: 'normal' });
  assert.equal(a.color, '#f00');
  assert.equal(a.filter, 'none');
  assert.equal(a.transition.filter.duration, 0.2);
  assert.equal(a.transitionEnd.filter, 'none');
  const p = b.passed({ baseColor: '#fff', wordRevealMode: 'normal' });
  assert.equal(p.transition.color.duration, 0.8, 'normal 档 passed color 0.8s（:826）');
  assert.equal(b.passed({ baseColor: '#fff', wordRevealMode: 'fast' }).transition.color.duration, 0.24);
}

/* wordGlowVariants：量化路径（color+opacity+drop-shadow 关键帧）/非量化（textShadow） */
{
  const g = env.PartitaCore.glowVariants;
  const base = { activeColor: '#ff0000', duration: 0.3, wordRevealMode: 'normal' };
  const qActive = g.active(Object.assign({ total: 1 }, base));
  if (env.CM_isGlowBlurQuantized()) {
    assert.equal(qActive.color, '#ff0000');
    assert.deepEqual([...qActive.opacity], [0, 1, 1]);
    assert.equal(qActive.transition.times[1], 0.9, 'sustain times[0,0.9,1]（wordGlow.ts:150）');
  } else {
    assert.equal(qActive.color, 'transparent');
    /* sustain peaks [0,1,1] → textShadow 首项 'none'，峰值项 inner 20px/outer 40px */
    assert.equal(qActive.textShadow[0], 'none');
    assert.ok(qActive.textShadow[1].includes('20px') && qActive.textShadow[1].includes('40px'),
      'textShadow 路径 inner 20px/outer 40px（wordGlow.ts sustain 分支）');
  }
  const inst = g.active(Object.assign({ total: 1 }, base, { wordRevealMode: 'instant' }));
  assert.equal(inst.transition.times[1], 0.35, 'instant times[0,0.35,1]');
  const perChar = g.active(Object.assign({}, base, {
    total: 4, index: 2, charStartTime: 0.5, charEndTime: 0.75, wordStartTime: 0
  }));
  assert.ok(perChar.transition.delay >= 0.5 - 1e-9, '逐字 delay = charStart - wordStart');
  assert.ok(perChar.transition.duration >= (0.25 * 6) - 1e-9, '逐字 duration = charDur*6');
}

/* lyricContainerFloat（:835-855）normal 档 */
{
  const f = env.PartitaCore.lyricContainerFloat({ animationIntensity: 'normal' });
  assert.deepEqual([...f.animate.y], [0, -14, 0, 6.3, 0]);
  assert.deepEqual([...f.animate.scale], [1, 1.01, 1, 0.995, 1]);
  assert.equal(f.transition.duration, 7);
  assert.equal(f.transition.repeat, Infinity);
  assert.equal(f.transition.ease, 'easeInOut');
}

/* 字号公式（:761-765 原式 × lyricsFontScale） */
{
  assert.equal(env.PartitaCore.mainFontSize(1, 1), 'clamp(2.500rem, 5.500vw, 4.500rem)');
  assert.equal(env.PartitaCore.mainFontSize(0.8, 1), 'clamp(2.000rem, 4.400vw, 3.600rem)', 'totalGraphemes>40 → densityScale 0.8');
  assert.equal(env.PartitaCore.translationFontSize(1), 'clamp(1.050rem, 2.200vw, 1.200rem)');
  assert.equal(env.PartitaCore.upcomingFontSize(1), 'clamp(0.875rem, 1.800vw, 1.000rem)');
}

/* 预热窗口判定（runtime.ts:90-101：leadTime ∈ [minLead, maxLead] 双闭区间，
   边界比较为 >=/<=；浮点精确边界依赖具体时间对，故用稳健内/外点） */
{
  const line = { startTime: 10 };
  assert.equal(env.PartitaCore.shouldPreheatLine(line, 10 - 0.2, env.PartitaCore.PREHEAT_WINDOW), true, '窗口内（近 minLead）');
  assert.equal(env.PartitaCore.shouldPreheatLine(line, 10 - 1.0, env.PartitaCore.PREHEAT_WINDOW), true, '窗口内（近 maxLead）');
  assert.equal(env.PartitaCore.shouldPreheatLine(line, 10 - 0.1, env.PartitaCore.PREHEAT_WINDOW), false, '早于窗口');
  assert.equal(env.PartitaCore.shouldPreheatLine(line, 10 - 1.5, env.PartitaCore.PREHEAT_WINDOW), false, '晚于窗口');
  assert.equal(env.PartitaCore.shouldPreheatLine(null, 0, env.PartitaCore.PREHEAT_WINDOW), false, '空行不预热');
}

/* findLineIndexAtTime（appPlaybackHelpers.ts:21-32）：倒序扫描取「包含 t 的最新行」，
   无后继行时 renderEndTime 延续上一行权威窗口 */
{
  const lines = [
    { startTime: 0, endTime: 1, renderHints: { renderEndTime: 1.3 } },
    { startTime: 1.4, endTime: 2 }
  ];
  assert.equal(env.PartitaCore.findLineIndexAtTime(lines, 0.5), 0);
  assert.equal(env.PartitaCore.findLineIndexAtTime(lines, 1.1), 0, 'endTime 后、renderEndTime 内仍归上一行');
  assert.equal(env.PartitaCore.findLineIndexAtTime(lines, 1.3), 0, '<=renderEndTime 含边界');
  assert.equal(env.PartitaCore.findLineIndexAtTime(lines, 1.31), -1, 'renderEnd 后、下一行前 = 无激活行');
  assert.equal(env.PartitaCore.findLineIndexAtTime(lines, 1.4), 1);
  assert.equal(env.PartitaCore.findLineIndexAtTime(lines, 5), -1, '越过全部行窗口 → -1（不钳制到末行）');
  assert.equal(env.PartitaCore.findLineIndexAtTime(lines, -1), -1);
}

/* 闭包算法抽查（同 classic 管线共享闭包）：sticky 粘连 + 着色回退 */
{
  const mkWord = (text, s, e) => ({ text, startTime: s, endTime: e });
  const line = {
    fullText: "It's ok",
    words: [mkWord('It', 0, 0.3), mkWord('’', 0.3, 0.35), mkWord('s', 0.35, 0.5), mkWord('ok', 0.5, 1)]
  };
  const units = env.CM_buildPostLyricLayoutUnits(line, { semantic: true, sticky: true });
  const display = env.CM_buildDisplayWordsFromLayoutUnits(units);
  assert.equal(display.map((w) => w.text).join('|'), 'It\u2019s|ok', 'sticky 应把 It+’+s 粘成单显示词（partita 分行不拆缩写）');

  assert.equal(env.CM_resolveWordColor('none', [], '#123456'), '#123456', 'wordColors 空 → 回退 accentColor（宿主桥路径）');
}

/* ---------- 3) 桥契约 ---------- */
{
  const src = fs.readFileSync(BRIDGE, 'utf8');
  new vm.Script(src, { filename: '20b-partita-engine-bridge.js' });   // 可编译
  assert.match(src, /function applyPartitaMode\(on, opts\)/, '注册表 applyFn 入口名必须保留');
  assert.match(src, /var partitaMode\s*=/, '注册表 stateVar 名必须保留');
  assert.match(src, /PartitaPartitaEngine\(/, '桥必须创建引擎实例');
  assert.match(src, /getAdjustedLyricPlaybackTime/, '时间源走歌词偏移修正');
  assert.match(src, /animationIntensity:\s*\(typeof visAnimationIntensityCurrent/, '强度档随 fx.visAnimationIntensity 下发（07-fx/11 数据面；无数据面回退 normal，four-modes 沙箱测试覆盖）');
  assert.match(src, /wordColors:\s*\(typeof visWordColorsList/, '词色表随 orangesea-vis-word-colors-v1 下发（07-fx/11 数据面；空表回退 accentColor，CM_resolveWordColor 测试覆盖）');
  assert.match(src, /partita-engine-host/, '桥挂载到引擎宿主');
  /* 数据形状：lyricsLines → Folia Line */
  assert.match(src, /fullText:\s*String\(l\.text \|\| ''\)/, 'fullText 字段映射');
  assert.match(src, /startTime:\s*wStart/, '词级 startTime 映射');
  /* renderHints 携带（Folia 宿主在 Line 构建时携带；缺失会使
     partitaFindLineIndexAtTime 回退 line.endTime 提前切行，丢 renderEndTime
     的 exit polish 窗口——renderHints.ts:157-162 getLineRenderHints 语义） */
  assert.match(src, /CM_buildLineRenderHints/, '桥必须经闭包注出构建 renderHints');
  assert.match(src, /line\.renderHints\s*=\s*hints\(line\)/, '每行携带 renderHints');
  /* 字重不写死（fontStacks.ts:14-17 逐调用点回退 700/400/500/400；
     写死会顶掉壳 400/翻译行 500/下一句预览 400——claddagh 桥同纪律） */
  assert.ok(!/fontWeight:\s*\d/.test(src), '主题桥不得写死 fontWeight（resolveThemeFontWeight 回退权威）');
  /* 背景接管（VisualizerShell:185-197 默认 Latent；claddagh 桥同范式） */
  assert.match(src, /TiltLatentBackground\(/, '桥必须复用 TiltLatentBackground 挂原版 Latent 背景');
  assert.match(src, /#partita-bg-layer/, '背景挂 #partita-bg-layer 容器');
  assert.match(src, /function startPartitaBg\(\)/, '背景启动入口');
  assert.match(src, /startPartitaBg\(\);/, 'startPartita 先启背景（引擎缺失时背景独立成立）');
  assert.match(src, /partitaBg\.setTheme\(theme\)/, '主题热更同步背景换色');
  assert.match(src, /partitaBg\.setCoverUrl\(\)/, '封面热更同步背景重取色');
  assert.match(src, /partitaBg\.destroy\(\)/, 'stopPartita 销毁背景层');
}

/* ---------- 4) 注册接线 ---------- */
{
  const loader = fs.readFileSync(LOADER, 'utf8');
  assert.match(loader, /js\/modules\/10-shell\/20b-partita-engine-bridge\.js/, 'index-loader 清单挂 20b 桥');
  assert.ok(!loader.includes('20-partita.js'), '旧简化实现必须从清单移除');

  const index = fs.readFileSync(INDEX, 'utf8');
  assert.match(index, /js\/modules\/10-shell-partita-engine\/partita-engine\.js/, 'index.html 静态注入引擎产物');
  const engineAt = index.indexOf('10-shell-partita-engine/partita-engine.js');
  const loaderAt = index.indexOf('js/index-loader.js');
  assert.ok(engineAt > 0 && loaderAt > engineAt, '引擎产物必须在 index-loader 之前加载');
  assert.match(index, /id="partita-engine-host"/, '引擎宿主容器存在');
  /* 背景层容器（原版 Latent；z 序在歌词宿主之下） */
  assert.match(index, /id="partita-bg-layer"/, 'index.html 持 #partita-bg-layer 背景容器');
  assert.ok(index.indexOf('id="partita-bg-layer"') < index.indexOf('id="partita-engine-host"'),
    '背景层必须先于歌词宿主（DOM 后位覆盖同 z 层的暗角）');
  assert.ok(index.indexOf('partita-float') === -1 && index.indexOf('pt-empty') === -1,
    '旧 DOM 结构（pt-float/pt-empty）必须移除');

  const registry = fs.readFileSync(REGISTRY, 'utf8');
  assert.match(registry, /id:\s*'partita'[\s\S]*?stateVar:\s*'partitaMode'/, '注册表 partita 行保留');
  assert.match(registry, /applyFn:\s*'applyPartitaMode'/, '注册表 applyFn 保留');

  const css = fs.readFileSync(CSS, 'utf8');
  assert.ok(!/\.pt-(word|line|chunk|glow|body|gc|ripple|guide|float|empty|column)\b/.test(css),
    'partita.css 不得再持 .pt-* 动画类（引擎 inline style 单主路径）');
  assert.match(css, /#partita-engine-host/, 'partita.css 提供引擎宿主定位');
  assert.match(css, /#partita-bg-layer/, 'partita.css 提供 Latent 背景层容器定位');
  assert.ok(!fs.existsSync(OLD_IMPL), '旧简化实现 20-partita.js 已删除（不得两套主路径并存）');
}

console.log('OK tests/partita.test.js — 引擎产物加载/关键算法/桥契约/注册接线 全部通过');
