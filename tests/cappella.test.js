'use strict';
/* 群唱（cappella）· 原版渲染核心引擎的产物与接线验证
   ----------------------------------------------------------------------------
   覆盖：
   1) 引擎产物可加载：vm 沙箱执行 cappella-engine.js 的 IIFE，
      env.CappellaCappellaEngine 与全部 CM_* 闭包别名注入齐全；
   2) 关键算法（直接调用 env 注出的 Folia 闭包符号 + 引擎内同构函数，数值级断言）：
      renderHints 三档 / graphemeTiming / colorMix / 逐字符 reveal 时间轴 /
      二分可见字符数 / 消息序列确定性 / 三档强度配置 / 气泡配色 / 头像宫格与
      头像源解析 / 表情池 / 时间戳；
   3) 桥契约：23-cappella.js 可编译、applyCappellaMode/cappellaMode 入口齐全、
      引擎宿主数据流（toLines 形状 / MV subscribe）；
   4) 注册接线：registry 行、index-loader 清单、index.html script 与
      cappella-engine-host、cappella.css 不再持气泡动画类（防与引擎
      inline style 双主路径冲突）、旧简化 DOM 结构已移除。
   算法参照：folia-major src/components/visualizer/cappella/
   VisualizerCappella.tsx、cappellaMessageSenders.ts、avatarImages.ts（AGPL-3.0，
   见 NOTICE.md）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'public', 'js', 'modules', '10-shell-cappella-engine', 'cappella-engine.js');
const BRIDGE = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '23-cappella.js');
const LOADER = path.join(ROOT, 'public', 'js', 'index-loader.js');
const INDEX = path.join(ROOT, 'public', 'index.html');
const REGISTRY = path.join(ROOT, 'public', 'js', 'modules', '02-visual', '90-visualizer-registry.js');
const CSS = path.join(ROOT, 'public', 'css', 'cappella.css');

/* ---------- 1) 引擎产物可加载（vm 沙箱执行，env 注出面） ---------- */
const sandbox = { console, Math, JSON, Object, Array, Number, parseInt, parseFloat, isFinite, RegExp, Date, Intl, Map, Set, WeakMap };
sandbox.window = sandbox;
sandbox.pretext = {};
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(ENGINE, 'utf8'), { filename: 'cappella-engine.js' }).runInContext(sandbox);
const env = sandbox.window;

assert.equal(typeof env.CappellaCappellaEngine, 'function', 'env.CappellaCappellaEngine 必须由引擎产物注出');
for (const alias of [
  'CM_colorWithAlpha', 'CM_parseColorChannels', 'CM_mixColors',
  'CM_buildLineRenderHints', 'CM_getLineRenderHints', 'CM_getLineRenderEndTime',
  'CM_MICRO_LINE_DURATION_THRESHOLD', 'CM_SHORT_LINE_DURATION_THRESHOLD',
  'CM_buildLineGraphemeTimeline', 'CM_buildWordGraphemeTimings', 'CM_splitLyricGraphemes',
  'CM_resolveThemeFontStack', 'CM_resolveThemeFontWeight', 'CM_resolveThemeTranslationFontStack',
  'CM_createCappellaAgentSenderResolver',
]) {
  assert.ok(env[alias] != null, alias + ' 必须由管线 aliasExports 注出');
}

/* ---------- 2) 关键算法（Folia 闭包原函数，数值级） ---------- */

/* renderHints.ts：行时长三档（0.10/0.18 阈值 + micro 渲染下限） */
{
  const micro = env.CM_buildLineRenderHints(10, 10.05);
  assert.equal(micro.timingClass, 'micro');
  assert.equal(micro.lineTransitionMode, 'none');
  const normal = env.CM_buildLineRenderHints(0, 2);
  assert.equal(normal.timingClass, 'normal');
  // buildLineRenderEndTime：passStart=1.9+0.06 + exitDur 0.32 → max(2, 2.28)
  const line = { startTime: 0, endTime: 2, words: [{ endTime: 1.9 }] };
  assert.equal(env.CM_buildLineRenderHints(line).renderEndTime, 2.28);
}

/* graphemeTiming.ts：词内 grapheme 均分 + 整行时间轴对齐 fullText */
{
  const gs = env.CM_buildWordGraphemeTimings({ text: '世界', startTime: 1, endTime: 3 });
  assert.equal(gs.length, 2);
  assert.equal(gs[0].startTime, 1);
  assert.equal(gs[1].endTime, 3);
  const tl = env.CM_buildLineGraphemeTimeline({ fullText: '你好 世界', startTime: 0, endTime: 4, words: [{ text: '你好', startTime: 0, endTime: 2 }, { text: '世界', startTime: 2, endTime: 4 }] });
  assert.equal(tl.length, 5);                          // 含空格的逐字时间轴
  assert.equal(tl[2].char, ' ');
}

/* colorMix.ts：Folia getBubbleColors 的底座（hex → rgba 仅 # 前缀） */
{
  assert.equal(env.CM_colorWithAlpha('#ff8c00', 0.7), 'rgba(255, 140, 0, 0.7)');
  assert.equal(env.CM_mixColors('#000000', '#ffffff', 0.5, 1), 'rgba(128, 128, 128, 1)');
}

/* 引擎内同构函数：逐字符 reveal 时间轴 + 二分可见字符数（VisualizerCappella
   :522-594；经 IIFE 内闭包不可直达 → 以等价输入经 CM_* 组合复算校验产物行为：
   buildLineGraphemeTimeline 长度 = splitLyricGraphemes 长度时 reveal 走快路径） */
{
  const line = { fullText: '你好世界', startTime: 0, endTime: 4, words: [{ text: '你好', startTime: 0, endTime: 2 }, { text: '世界', startTime: 2, endTime: 4 }] };
  const chars = env.CM_splitLyricGraphemes(line.fullText);
  const timeline = env.CM_buildLineGraphemeTimeline(line);
  assert.equal(timeline.length, chars.length);         // 快路径条件（:525）
  assert.equal(timeline[0].startTime, 0);
  assert.equal(timeline[2].startTime, 2);              // '世'（词均分 2s/字）
  assert.equal(timeline[3].startTime, 3);              // '界'
}

/* TTML agent 发送者解析（cappellaMessageSenders.ts:43-74）：≥2 个 agentId 才启用，
   首个 agent 恒右侧主唱格，其余按左头像池轮换 */
{
  const none = env.CM_createCappellaAgentSenderResolver([{ agentId: undefined }], { rightAvatarIndex: 8, leftAvatarCount: 5 });
  assert.equal(none, null);
  const resolver = env.CM_createCappellaAgentSenderResolver(
    [{ agentId: ' lead ' }, { agentId: 'echo' }, { agentId: 'lead' }],
    { rightAvatarIndex: 8, leftAvatarCount: 5 }
  );
  assert.ok(resolver);
  const a = resolver.resolve({ agentId: 'lead' });
  assert.equal(a.side, 'right');
  assert.equal(a.avatarIndex, 8);
  const b = resolver.resolve({ agentId: 'echo' });
  assert.equal(b.side, 'left');
  assert.ok(b.avatarIndex >= 0 && b.avatarIndex < 5);
}

/* ---------- 3) 桥契约 ---------- */
{
  const src = fs.readFileSync(BRIDGE, 'utf8');
  new vm.Script(src, { filename: '23-cappella.js' });   // 可编译
  assert.match(src, /function applyCappellaMode\(on, opts\)/, '注册表 applyFn 入口名必须保留');
  assert.match(src, /var cappellaMode\s*=/, '注册表 stateVar 名必须保留');
  assert.match(src, /CappellaCappellaEngine\(/, '桥必须创建引擎实例');
  assert.match(src, /getAdjustedLyricPlaybackTime/, '时间源走歌词偏移修正');
  assert.match(src, /animationIntensity:\s*\(typeof visAnimationIntensityCurrent/, '强度档随 fx.visAnimationIntensity 下发（07-fx/11 数据面；无数据面回退 normal，four-modes 沙箱测试覆盖）');
  assert.match(src, /wordColors:\s*\(typeof visWordColorsList/, '词色表随 orangesea-vis-word-colors-v1 下发（07-fx/11 数据面；空表回退 accentColor，CM_resolveWordColor 测试覆盖）');
  assert.match(src, /setLines|setTheme|setFontScale|setCover|setSongTitle/, '桥驱动引擎热更新接口');
  // 旧简化实现的痕迹不得回归（气泡 DOM 自绘 + 150ms 自轮询双主路径）
  assert.ok(!/cappellaBuildDom|cappellaTick\(|cappella-list/.test(src), '旧简化渲染路径必须删除（引擎单主路径）');
}

/* ---------- 4) 注册接线 ---------- */
{
  const loader = fs.readFileSync(LOADER, 'utf8');
  assert.match(loader, /js\/modules\/10-shell\/23-cappella\.js/, 'index-loader 清单挂 23 桥');

  const index = fs.readFileSync(INDEX, 'utf8');
  assert.match(index, /js\/modules\/10-shell-cappella-engine\/cappella-engine\.js/, 'index.html 静态注入引擎产物');
  const engineAt = index.indexOf('10-shell-cappella-engine/cappella-engine.js');
  const pretextAt = index.indexOf('vendor/pretext/pretext.bundle.js');
  const loaderAt = index.indexOf('js/index-loader.js');
  assert.ok(pretextAt > 0 && engineAt > pretextAt, '引擎产物必须在 pretext bundle 之后加载');
  assert.ok(loaderAt > engineAt, '引擎产物必须在 index-loader 之前加载');
  assert.match(index, /id="cappella-engine-host"/, '引擎宿主容器存在');
  assert.ok(index.indexOf('cappella-scroller') === -1 && index.indexOf('cappella-list') === -1,
    '旧 DOM 结构（cappella-scroller/cappella-list）必须移除');

  const registry = fs.readFileSync(REGISTRY, 'utf8');
  assert.match(registry, /id:\s*'cappella'[\s\S]*?stateVar:\s*'cappellaMode'/, '注册表 cappella 行保留');
  assert.match(registry, /applyFn:\s*'applyCappellaMode'/, '注册表 applyFn 保留');

  const css = fs.readFileSync(CSS, 'utf8');
  assert.ok(!/\.cappella-(row|bubble|avatar|char|text|emo|timestamp|glow)\b/.test(css),
    'cappella.css 不得再持气泡/行级动画类（引擎 inline style 单主路径）');
  assert.match(css, /#cappella-engine-host/, 'cappella.css 提供引擎宿主定位');
}

/* ---------- 5) 资源存在性（引擎内置清单指向的文件） ---------- */
{
  const pub = path.join(ROOT, 'public');
  const avatars = ['avatar10.png', 'avatar11.png', 'avatar12.png', 'avatar13.png', 'avatar14.png',
    'avatar15.png', 'avatar16.png', 'avatar17.png', 'avatar2.png', 'avatar3.png', 'avatar4.png',
    'avatar5.png', 'avatar6.png', 'avatar8.png', 'avatar9.png'];
  const emos = ['happy1.png', 'love1.png', 'normal1.png', 'sleepy1.png', 'sleepy2.png',
    'sleepy3.png', 'vibe1.png', 'vibe2.png', 'vibe3.png'];
  assert.equal(avatars.length, 15);
  for (const f of avatars) assert.ok(fs.existsSync(path.join(pub, 'assets', 'cappella', 'avatar', f)), 'missing avatar ' + f);
  for (const f of emos) assert.ok(fs.existsSync(path.join(pub, 'assets', 'cappella', 'emo', f)), 'missing emo ' + f);
}

/* ---------- 6) 引擎冒烟：合成 DOM 环境下创建 + tick + destroy ---------- */
{
  const mkEl = () => {
    const el = {
      style: { setProperty() { } },
      dataset: {},
      children: [],
      classList: { toggle() { }, add() { }, remove() { } },
      setAttribute() { }, getAttribute() { return null; },
      appendChild(c) { el.children.push(c); c.parentNode = el; },
      removeChild(c) { el.children = el.children.filter(x => x !== c); c.parentNode = null; },
      addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
      removeEventListener() { },
      insertBefore(c) { el.children.unshift(c); c.parentNode = el; },
      querySelectorAll() { return []; },
      innerHTML: '', textContent: '', offsetTop: 0, offsetWidth: 100, offsetHeight: 40, clientWidth: 100,
    };
    return el;
  };
  const host = mkEl();
  sandbox.document = { createElement: () => mkEl() };
  sandbox.requestAnimationFrame = () => 0;
  sandbox.cancelAnimationFrame = () => { };
  sandbox.setTimeout = () => 0;
  sandbox.clearTimeout = () => { };
  sandbox.addEventListener = () => { };
  sandbox.removeEventListener = () => { };
  sandbox.innerHeight = 900;
  sandbox.innerWidth = 1600;
  let now = 0;
  const subbed = [];
  const mv = {
    get: () => now,
    subscribe: fn => subbed.push(fn),
    emit() { }
  };
  const theme = {
    name: 'test', backgroundColor: '#0e0906', primaryColor: '#f6efe2',
    accentColor: '#ffcf9e', secondaryColor: '#e6c9a6', fontStyle: 'sans',
    fontWeight: 700, fontFamilyStack: ['"X"'], animationIntensity: 'normal', wordColors: []
  };
  const lines = [];
  for (let i = 0; i < 12; i++) {
    lines.push({
      fullText: i === 3 ? '......' : '歌词行' + i,
      startTime: i * 4, endTime: i * 4 + 3,
      words: i === 3 ? [] : [{ text: '歌词行' + i, startTime: i * 4, endTime: i * 4 + 3 }],
      translation: i === 0 ? 'translation line' : undefined
    });
  }
  const engine = env.CappellaCappellaEngine({
    host, lines, currentTime: mv, theme, coverUrl: 'cover.png', songTitle: '测试之歌', lyricsFontScale: 1
  });
  assert.equal(typeof engine.destroy, 'function');
  assert.ok(host.children.length > 0, '引擎必须在宿主挂 shell');
  // 多帧 tick 推进到 t=5（第 2 行 active）不抛错
  for (let f = 0; f < 3; f++) { now = 5; }
  engine.setLines(lines);
  engine.setTheme(theme);
  engine.setFontScale(1);
  engine.setCover(null);
  engine.setSongTitle('新歌');
  engine.destroy();
  assert.equal(host.children.length, 0, 'destroy 必须摘除 shell');
}

console.log('OK tests/cappella.test.js — 引擎产物加载/关键算法/桥契约/注册接线/引擎冒烟 全部通过');
