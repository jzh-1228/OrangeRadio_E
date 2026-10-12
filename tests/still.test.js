'use strict';
/* 静止（still）· 原版渲染核心引擎的产物与接线验证
   ----------------------------------------------------------------------------
   覆盖：
   1) 引擎产物可加载：vm 沙箱执行 still-engine.js 的 IIFE，
      env.StillStillEngine / env.stillFindLineIndexAtTime 与全部 CM_* 闭包
      别名注入齐全；
   2) 关键算法（直接调用 env 注出的 Folia 闭包符号，数值级断言）：
      fontStacks 字重归一（clamp 100..900·10 步进）/ 主/翻译字体栈解析 /
      renderHints 行渲染尾（currentLineIndex 权威语义的输入）/
      stillFindLineIndexAtTime（appPlaybackHelpers.ts:21-31 findLatestActiveLineIndex
      逐行同构：倒序 + [startTime, renderEndTime] 区间 + 空返回 -1）；
   3) 桥契约：20b 桥可编译、applyStillMode/stillMode 入口齐全、
      引擎实例创建、时间源走歌词偏移修正、夜侧主题桥；
   4) 注册接线：registry 行、index-loader 清单（旧 20-still.js 移除）、
      index.html 引擎 script 先于 index-loader + #still-engine-host、
      旧静态三行 DOM 已移除、still.css 只持容器壳（不持 .st-* 渲染类）、
      旧简化实现文件已删除。
   算法参照：folia-major src/utils/fontStacks.ts、
   src/utils/lyrics/renderHints.ts、src/utils/appPlaybackHelpers.ts:21-31、
   src/components/visualizer/still/VisualizerStill.tsx（AGPL-3.0，见 NOTICE.md）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'public', 'js', 'modules', '10-shell-still-engine', 'still-engine.js');
const BRIDGE = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20b-still-engine-bridge.js');
const LOADER = path.join(ROOT, 'public', 'js', 'index-loader.js');
const INDEX = path.join(ROOT, 'public', 'index.html');
const REGISTRY = path.join(ROOT, 'public', 'js', 'modules', '02-visual', '90-visualizer-registry.js');
const CSS = path.join(ROOT, 'public', 'css', 'still.css');
const OLD_IMPL = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '20-still.js');

/* ---------- 1) 引擎产物可加载（vm 沙箱执行，env 注出面） ---------- */
const sandbox = { console, Math, JSON, Object, Array, Number, parseInt, parseFloat, isFinite, RegExp, Date, Intl };
sandbox.window = sandbox;
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(ENGINE, 'utf8'), { filename: 'still-engine.js' }).runInContext(sandbox);
const env = sandbox.window;

assert.equal(typeof env.StillStillEngine, 'function', 'env.StillStillEngine 必须由引擎产物注出');
assert.equal(typeof env.stillFindLineIndexAtTime, 'function', 'env.stillFindLineIndexAtTime 必须由引擎产物注出');
for (const alias of [
  'CM_normalizeFontWeight', 'CM_resolveThemeFontStack', 'CM_resolveThemeTranslationFontStack',
  'CM_resolveThemeFontWeight', 'CM_buildLineRenderHints', 'CM_getLineRenderHints',
  'CM_getLineRenderEndTime', 'CM_MICRO_LINE_DURATION_THRESHOLD', 'CM_SHORT_LINE_DURATION_THRESHOLD',
]) {
  assert.ok(env[alias] != null, alias + ' 必须由管线 aliasExports 注出');
}

/* ---------- 2) 关键算法（Folia 闭包原函数，数值级） ---------- */

/* fontStacks.ts:7-17 normalizeFontWeight：clamp 100..900 + 10 步进 + 非数 null */
{
  assert.equal(env.CM_normalizeFontWeight(700), 700);
  assert.equal(env.CM_normalizeFontWeight(664), 660);      // 就近 10 步进
  assert.equal(env.CM_normalizeFontWeight(5000), 900);     // clamp 上限
  assert.equal(env.CM_normalizeFontWeight(-3), 100);       // clamp 下限
  assert.equal(env.CM_normalizeFontWeight('700'), null);   // 非数字 → null
}

/* fontStacks.ts:99-119 字体栈解析：内置兜底 + 自定义栈前置（去重保序） */
{
  const sans = env.CM_resolveThemeFontStack({ fontStyle: 'sans' });
  assert.match(sans, /^"Inter"/, 'sans 内置栈应以 Inter 打头（BUILTIN_FONT_STACKS）');
  assert.match(sans, /sans-serif$/, '内置栈应以 generic 收尾');
  const custom = env.CM_resolveThemeFontStack({
    fontStyle: 'sans',
    fontFamily: 'My Font',
    fontFamilyStack: ['My Font', 'Second One'],
  });
  assert.match(custom, /^"My Font", "Second One", "Inter"/, '自定义栈前置 + 去重 + 内置兜底');
  const tr = env.CM_resolveThemeTranslationFontStack({ fontStyle: 'serif' });
  assert.ok(tr.length > 0 && tr !== sans, '翻译栈与主栈是两套独立表（TRANSLATION_FONT_STACKS）');
}

/* fontStacks.ts:14-17 resolveThemeFontWeight：theme.fontWeight 归一优先，否则 fallback */
{
  assert.equal(env.CM_resolveThemeFontWeight({ fontWeight: 600 }, 700), 600);
  assert.equal(env.CM_resolveThemeFontWeight({}, 700), 700);
  assert.equal(env.CM_resolveThemeFontWeight({ fontWeight: 9999 }, 700), 900);
}

/* renderHints.ts：still 的 currentLineIndex 权威语义依赖 renderEndTime */
{
  // buildLineRenderEndTime（renderHints.ts:114-135）：exitDur=0.32、
  // passStart=1.9+0.06 → renderEnd = max(2, 2.28) = 2.28
  const line = { startTime: 0, endTime: 2, words: [{ endTime: 1.9 }] };
  assert.equal(env.CM_getLineRenderEndTime(line), 2.28);
  const micro = env.CM_buildLineRenderHints(10, 10.05);
  assert.equal(micro.timingClass, 'micro');
  assert.equal(micro.renderEndTime, 10.067);   // MICRO_LINE_RENDER_FLOOR
}

/* stillFindLineIndexAtTime（appPlaybackHelpers.ts:21-31 逐行同构）：
   倒序 + time ∈ [startTime, renderEndTime] + 未命中 -1 */
{
  const lines = [
    { startTime: 0, endTime: 2, words: [{ endTime: 1.9 }] },     // renderEnd 2.28
    { startTime: 3, endTime: 5, words: [{ endTime: 4.5 }] },
    { startTime: 6, endTime: 8, words: [{ endTime: 7.5 }] },
  ];
  assert.equal(env.stillFindLineIndexAtTime(lines, -1), -1, '前奏未命中 -1');
  assert.equal(env.stillFindLineIndexAtTime(lines, 0), 0);
  assert.equal(env.stillFindLineIndexAtTime(lines, 2.1), 0, '行唱完后仍在渲染尾（≤renderEndTime）内');
  assert.equal(env.stillFindLineIndexAtTime(lines, 2.29), -1, '渲染尾外未命中 -1（间奏）');
  assert.equal(env.stillFindLineIndexAtTime(lines, 3), 1);
  assert.equal(env.stillFindLineIndexAtTime(lines, 4.6), 1, '行尾之后仍在渲染尾内');
  assert.equal(env.stillFindLineIndexAtTime(lines, 8), 2, '尾行 renderEnd = max(8, 7.56+0.32) = endTime 8（含边界）');
  assert.equal(env.stillFindLineIndexAtTime(lines, 8.5), -1, '尾行渲染尾外 -1');
  assert.equal(env.stillFindLineIndexAtTime([], 5), -1, '空歌词 -1');
}

/* ---------- 2b) 渲染核心视觉常量（DOM stub 实例驱动，数值级） ----------
   VisualizerStill.tsx:46-91 的 Tailwind 精确值 + resolveThemeFontWeight
   fallback 层次（theme 无 fontWeight 时当前主行 700/邻行 600、译文 500/400，
   VisualizerStill.tsx:69/:83 + fontStacks.ts:14-17 + buildVisualizerTheme.ts:43
   宿主默认不下发字重）；壳 VisualizerShell.tsx:128-134（transparent/字重 400
   fallback/transition-colors duration-1000）。 */
{
  // 最小 DOM stub：className/style(cssText 原串)/appendChild/removeChild/textContent
  function makeEl(tag) {
    const el = {
      tagName: tag,
      className: '',
      style: { cssText: '' },
      children: [],
      parentNode: null,
      textContent: '',
      appendChild(child) { child.parentNode = this; this.children.push(child); },
      removeChild(child) {
        const at = this.children.indexOf(child);
        if (at >= 0) this.children.splice(at, 1);
        if (child.parentNode === this) child.parentNode = null;
      },
    };
    return el;
  }
  const sandbox2 = { console, Math, JSON, Object, Array, Number, parseInt, parseFloat, isFinite, RegExp, Date, Intl };
  sandbox2.window = sandbox2;
  sandbox2.document = { createElement: makeEl };
  sandbox2.requestAnimationFrame = () => 1;      // 不执行回调：still 静态渲染无需帧循环
  sandbox2.cancelAnimationFrame = () => {};
  vm.createContext(sandbox2);
  new vm.Script(fs.readFileSync(ENGINE, 'utf8'), { filename: 'still-engine.js' }).runInContext(sandbox2);

  const themeBase = {   // 故意不设 fontWeight：验证 fallback 层次
    backgroundColor: '#0e0906', primaryColor: '#f6efe2',
    accentColor: '#ffcf9e', secondaryColor: '#e6c9a6', fontStyle: 'sans',
  };
  const mkLine = (start, end, text, translation) => ({
    startTime: start, endTime: end, fullText: text, translation,
    words: [{ text, startTime: start, endTime: end }],
  });
  const host = makeEl('div');
  const eng = sandbox2.window.StillStillEngine({
    host,
    lines: [mkLine(0, 2, '行一', 'line one'), mkLine(3, 5, '行二', 'line two')],
    currentTime: { get: () => 0 },   // t=0 → 行一 current，行二邻行，第三槽越界空
    theme: themeBase,
  });

  // 壳（VisualizerShell.tsx:128-134）：transparent + fallback 字重 400 + 1s 颜色过渡
  const shell = host.children[0];
  assert.match(shell.style.cssText, /background-color:transparent/, '壳背景恒 transparent（:130）');
  assert.match(shell.style.cssText, /opacity:1/, '壳 visualizerOpacity 默认 1');
  assert.match(shell.style.cssText, /font-family:"Inter"/, '壳字体栈来自 theme（resolveThemeFontStack）');
  assert.match(shell.style.cssText, /font-weight:400/, '壳字重 resolveThemeFontWeight(theme,400) fallback（:132）');
  assert.match(shell.style.cssText, /transition:color 1s/, '壳 transition-colors duration-1000（:128）');

  // 暗角遮罩（:46-48，cssText 单赋值）：夜侧 opacity 0.65 + radial-gradient(ellipse…#000) + z-0
  const vignette = shell.children[0];
  assert.match(vignette.style.cssText, /opacity:0\.65/, '夜间暗角 opacity-[0.65]');
  assert.match(vignette.style.cssText, /background:radial-gradient\(ellipse at center, transparent 0%, #000 100%\)/,
    '暗角 radial-gradient 精确值（:47）');
  assert.match(vignette.style.cssText, /z-index:0/, '暗角 z-0');

  // 舞台（:50-51）+ 三行 slot（:52-91）
  const stage = shell.children[1];
  assert.equal(stage.children.length, 3, '[-1,0,1] 三行 slot（:52）');
  const rows = stage.children;
  const rowOf = (i) => rows[i].children[0];   // [textEl, trEl]
  const trOf = (i) => rows[i].children[1];

  for (const row of rows) {
    // 行单元 cssText 单赋值（:61 flex flex-col items-center w-full max-w-4xl）
    assert.match(row.style.cssText, /max-width:56rem/, '行单元 max-w-4xl（:61）');
    assert.match(row.style.cssText, /display:flex;flex-direction:column;align-items:center/, '行单元 flex flex-col items-center（:61）');
  }

  // 当前行（offset 0，slot 1）：text-[2.5rem] leading-tight opacity-100 + 字重 700 fallback
  const cur = rowOf(1);
  assert.equal(cur.style.fontSize, '2.5rem', '当前主行 text-[2.5rem]（:64）');
  assert.equal(cur.style.lineHeight, '1.25', '当前主行 leading-tight（:64）');
  assert.equal(cur.style.opacity, '1', '当前主行 opacity-100（:64）');
  assert.equal(cur.style.fontWeight, '700', '字重 fallback isCurrent?700（:69，theme 无 fontWeight）');
  assert.equal(cur.style.color, '#f6efe2', '当前主行 color=theme.primaryColor（:66）');
  assert.equal(cur.style.letterSpacing, '0.02em', '当前主行 tracking-[0.02em]（:64）');
  assert.match(cur.style.filter, /drop-shadow\(0 4px 3px rgba\(0, 0, 0, 0.07\)\)/, '当前主行 drop-shadow-md（:64）');
  assert.equal(cur.style.scale, '1', '当前主行 scale=lyricsFontScale（:68）');
  assert.equal(cur.textContent, '行一', '当前主行文本=effectiveIndex 行 fullText');

  // 邻行（offset ±1）：text-3xl opacity-30 + 字重 600 fallback
  // （slot 样式无条件应用；t=0 时 slot0 为越界空槽、行二在 slot2，文本见下方断言）
  for (const i of [0, 2]) {
    const side = rowOf(i);
    assert.equal(side.style.fontSize, '1.875rem', '邻行 text-3xl（:64）');
    assert.equal(side.style.lineHeight, '2.25rem', '邻行 text-3xl 行高（:64）');
    assert.equal(side.style.opacity, '0.3', '邻行 opacity-30（:64）');
    assert.equal(side.style.fontWeight, '600', '字重 fallback 非当前 600（:69）');
  }
  assert.equal(rowOf(2).textContent, '行二', 'offset +1 邻行文本（:53 lineIndex=effectiveIndex+1）');

  // 当前行译文（:76-88）：text-2xl opacity-80 mt-3 + 字重 500 fallback + 副主题色
  const curTr = trOf(1);
  assert.equal(curTr.style.fontSize, '1.5rem', '当前译文 text-2xl（:78）');
  assert.equal(curTr.style.lineHeight, '2rem', '当前译文 text-2xl 行高（:78）');
  assert.equal(curTr.style.opacity, '0.8', '当前译文 opacity-80（:78）');
  assert.equal(curTr.style.marginTop, '0.75rem', '当前译文 mt-3（:78）');
  assert.equal(curTr.style.fontWeight, '500', '译文 fallback isCurrent?500（:83）');
  assert.equal(curTr.style.color, '#e6c9a6', '译文 color=resolvedSubtitleTheme.secondaryColor（:80）');
  assert.equal(curTr.style.letterSpacing, '0.025em', '译文 tracking-wide（:78）');
  assert.equal(curTr.style.scale, '1', '译文 scale=lyricsFontScale*subtitleFontScale（:82）');
  assert.equal(curTr.textContent, 'line one', '当前译文文本（effectiveIndex 行 translation）');

  // 邻行译文：text-xl opacity-30 mt-2 + 字重 400 fallback
  const sideTr = trOf(2);
  assert.equal(sideTr.style.fontSize, '1.25rem', '邻译文 text-xl（:78）');
  assert.equal(sideTr.style.lineHeight, '1.75rem', '邻译文 text-xl 行高（:78）');
  assert.equal(sideTr.style.opacity, '0.3', '邻译文 opacity-30（:78）');
  assert.equal(sideTr.style.marginTop, '0.5rem', '邻译文 mt-2（:78）');
  assert.equal(sideTr.style.fontWeight, '400', '译文 fallback 非当前 400（:83）');
  assert.equal(sideTr.textContent, 'line two', '邻行译文文本');

  // 越界空槽（:56）：h-20=5rem + 文本不渲染（display none）
  // t=0 → effectiveIndex=0 → slot0（offset -1）lineIndex=-1 越界
  assert.equal(rows[0].style.height, '5rem', '空槽 h-20（:56）');
  assert.equal(rowOf(0).style.display, 'none', '空槽主文本不渲染（:62 条件渲染）');
  assert.equal(trOf(0).style.display, 'none', '空槽译文不渲染');

  // setTheme 热更：带 fontWeight 的主题统一字重（resolveThemeFontWeight 归一优先，
  // fontStacks.ts:14-17）；壳字体栈重建（字体跟随）
  eng.setTheme({ ...themeBase, fontWeight: 664, primaryColor: '#ff0000' });
  assert.equal(rowOf(1).style.fontWeight, '660', 'theme.fontWeight 有效则归一统一（664→660，10 步进）');
  assert.equal(rowOf(0).style.fontWeight, '660', '邻行同用 theme.fontWeight（不再走 fallback 600）');
  assert.equal(rowOf(1).style.color, '#ff0000', 'setTheme 热更主色');
  assert.match(shell.style.fontFamily, /^"Inter"/, 'setTheme 重建壳字体栈（字体跟随）');

  // setFontScale 热更：scale 乘链（:68/:82）
  eng.setFontScale(1.2);
  eng.setSubtitleFontScale(0.5);
  assert.equal(rowOf(1).style.scale, '1.2', '主行 scale 跟随 lyricsFontScale（:68）');
  assert.equal(trOf(1).style.scale, '0.6', '译文 scale=lyricsFontScale*subtitleFontScale（:82）');

  eng.destroy();
  assert.equal(host.children.length, 0, 'destroy 移除壳');
}

/* ---------- 3) 桥契约 ---------- */
{
  const src = fs.readFileSync(BRIDGE, 'utf8');
  new vm.Script(src, { filename: '20b-still-engine-bridge.js' });   // 可编译
  assert.match(src, /function applyStillMode\(on, opts\)/, '注册表 applyFn 入口名必须保留');
  assert.match(src, /var stillMode\s*=/, '注册表 stateVar 名必须保留');
  assert.match(src, /StillStillEngine\(/, '桥必须创建引擎实例');
  assert.match(src, /getAdjustedLyricPlaybackTime/, '时间源走歌词偏移修正');
  assert.match(src, /themeOverlayDarkTheme/, '夜侧主题桥（覆盖层恒夜侧取色）');
  assert.match(src, /stillToLines/, '歌词数据形状转换（lyricsLines → Folia Line）');
  assert.ok(!/fontWeight:\s*\d/.test(src), '桥不得写死 fontWeight——对齐 buildVisualizerTheme.ts:43 默认不下发，'
    + '引擎走 fallback 层次（VisualizerStill.tsx:69/:83 当前主行 700/邻行 600、译文 500/400）');
  assert.match(src, /function stillApplyOverlayBackground/, '背景语义：still 不挂背景渲染器（VisualizerStill.tsx:43 '
    + 'renderBackground=false），主题纯色底提取为独立函数');
  const syncAt = src.indexOf('function stillSync');
  const stopAt = src.indexOf('function stopStill');
  assert.ok(syncAt > 0 && stopAt > syncAt
    && src.slice(syncAt, stopAt).includes('stillApplyOverlayBackground'),
    '主题热更时正交背景层跟随（stillSync 内同步 overlay 底色）');
  assert.match(src.slice(stopAt), /overlay\.style\.background = ''/, '退出清理 inline 背景（交还 CSS var 兜底）');
}

/* ---------- 4) 注册接线 ---------- */
{
  const loader = fs.readFileSync(LOADER, 'utf8');
  assert.match(loader, /js\/modules\/10-shell\/20b-still-engine-bridge\.js/, 'index-loader 清单挂 20b 桥');
  assert.ok(!loader.includes('20-still.js'), '旧简化实现必须从清单移除');

  const index = fs.readFileSync(INDEX, 'utf8');
  assert.match(index, /js\/modules\/10-shell-still-engine\/still-engine\.js/, 'index.html 静态注入引擎产物');
  const engineAt = index.indexOf('10-shell-still-engine/still-engine.js');
  const loaderAt = index.indexOf('js/index-loader.js');
  assert.ok(engineAt > 0 && loaderAt > engineAt, '引擎产物必须在 index-loader 之前加载');
  assert.match(index, /id="still-engine-host"/, '引擎宿主容器存在');
  assert.ok(index.indexOf('still-slot-prev') === -1 && index.indexOf('still-vignette') === -1,
    '旧静态三行 DOM（still-slot-*/still-vignette/still-stage）必须移除（引擎自建单主路径）');

  const registry = fs.readFileSync(REGISTRY, 'utf8');
  assert.match(registry, /id:\s*'still'[\s\S]*?stateVar:\s*'stillMode'/, '注册表 still 行保留');
  assert.match(registry, /applyFn:\s*'applyStillMode'/, '注册表 applyFn 保留');

  const css = fs.readFileSync(CSS, 'utf8');
  assert.ok(!/\.st-(vignette|stage|row|text|tr)\b/.test(css), 'still.css 不得再持 .st-* 渲染类（引擎 inline style 单主路径）');
  assert.match(css, /#still-engine-host/, 'still.css 提供引擎宿主定位');
  assert.match(css, /#still-overlay/, 'still.css 保留覆盖层容器壳');

  assert.ok(!fs.existsSync(OLD_IMPL), '旧简化实现 20-still.js 已删除（不得两套主路径并存）');
}

console.log('OK tests/still.test.js — 引擎产物加载/关键算法/桥契约/注册接线 全部通过');
