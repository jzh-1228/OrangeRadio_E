'use strict';
/* 云阶（Partita）：布局纯函数（CJK 语义分块 + 标点粘滞 + chunk 切分 + stagger +
   renderHints 三档）+ DOM/三态状态机 + 预热缓存 + eco 质量档进出。
   被测模块是无模块的全局脚本，用 vm 沙箱加载（同 graffiti-lyrics.test.js 风格）。
   文件末尾有启动绑定 scheduleUiWarmTask(initPartita)，沙箱里剥掉不执行。
   DOM 用可注入的最小桩（className 赋值同步 classList 语义）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.join(__dirname, '..', 'public', 'js', 'modules', '10-shell', '20-partita.js');

/* ---------- 最小 DOM 桩 ---------- */
function makeEl(tag) {
  const el = {
    tagName: tag, children: [], parentNode: null, textContent: '',
    attrs: {}, _classes: new Set(),
    style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
    classList: {
      add(c) { el._classes.add(c); }, remove(c) { el._classes.delete(c); },
      toggle(c, f) { if (f === undefined) f = !el._classes.has(c); f ? el._classes.add(c) : el._classes.delete(c); },
      contains(c) { return el._classes.has(c); }
    },
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    removeChild(child) { const i = el.children.indexOf(child); if (i >= 0) el.children.splice(i, 1); child.parentNode = null; return child; },
    setAttribute(k, v) { el.attrs[k] = v; },
    getAttribute(k) { return el.attrs[k] || null; },
    get firstChild() { return el.children[0] || null; }
  };
  // className 赋值同步进 _classes（模拟真实 DOM 的 class 解析）
  Object.defineProperty(el, 'className', {
    set(v) { el._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get() { return Array.from(el._classes).join(' '); }
  });
  Object.defineProperty(el.style, 'transition', { set(v) { el.style.props.transition = v; }, get() { return el.style.props.transition; } });
  for (const p of ['opacity', 'translate', 'rotate', 'scale', 'marginBottom', 'color', 'filter']) {
    Object.defineProperty(el.style, p, { set(v) { el.style.props[p] = v; }, get() { return el.style.props[p]; } });
  }
  return el;
}

const floatEl = makeEl('div');
const emptyEl = makeEl('div');
const overlayEl = makeEl('div');

/* ---------- 沙箱装配 ---------- */
let mockNow = 0;          // 模拟歌词时间（getAdjustedLyricPlaybackTime 直通）
let bodyClassToggled = null;

const sandbox = {
  console, Intl, isFinite, Math, Number,
  readBooleanPreference: () => false,
  saveBooleanPreference: () => { },
  document: {
    getElementById: (id) => id === 'partita-float' ? floatEl : id === 'partita-empty' ? emptyEl : id === 'partita-overlay' ? overlayEl : null,
    createElement: makeEl,
    body: { classList: { toggle: (c, f) => { bodyClassToggled = f ? c : null; } } }
  },
  window: { innerHeight: 900, addEventListener: () => { } },
  performance: { now: () => 0 },
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => { },
  setTimeout: () => 0, clearTimeout: () => { },
  lyricsLines: [
    {
      t: 10, duration: 4, text: '一 二 三 四 五 六 七 八 九 十 十一 十二', source: 'yrc-word',
      words: Array.from({ length: 12 }, (_, i) => ({ text: String(i + 1), t: 10.2 + i * 0.3, d: 0.28, c0: i * 2, c1: i * 2 + 1 }))
    },
    { t: 15, duration: 3, text: '下一行 歌词 测试', source: 'lrc' }
  ],
  audio: null,
  motionSignalGet: (k) => (k === 'currentTime' ? mockNow : null),
  getAdjustedLyricPlaybackTime: (t) => t,
  findStageLyricIndexAtTime: (t) => {
    let ans = -1;
    for (let i = 0; i < sandbox.lyricsLines.length; i++) if (sandbox.lyricsLines[i].t <= t + 0.05) ans = i;
    return ans;
  },
  // tokenizeGraffitiText 极简桩：按空白切词（LRC 合成路径走通即可）
  tokenizeGraffitiText: (text) => String(text || '').split(/(\s+)/).filter(Boolean).map((t) => (
    /^\s+$/.test(t) ? { type: 'space' } : { type: 'word', chars: [{ c: t, i: 0 }] }
  )),
  exitOtherVisualizerOverlays: () => { },
  refreshPresetGrid: () => { },
  showToast: () => { }
};

const raw = fs.readFileSync(modulePath, 'utf8');
const stripped = raw.replace(/scheduleUiWarmTask \? scheduleUiWarmTask\(initPartita, 300\) : setTimeout\(initPartita, 300\);/, '');
assert.ok(stripped !== raw, '启动绑定行应被剥离');
vm.createContext(sandbox);
vm.runInContext(stripped, sandbox, { filename: path.basename(modulePath) });

/* ---------- 一、布局纯函数（cjkSemanticLayout / renderHints 移植） ---------- */

// CJK 语义 + 标点粘滞：「世|界|。」→ 一个语义粘滞 unit，display 保留 3 个原始词
const cjkWords = [
  { text: '世', startTime: 10.0, endTime: 10.4 },
  { text: '界', startTime: 10.4, endTime: 10.8 },
  { text: '。', startTime: 10.8, endTime: 10.9 }
];
const cjkUnits = sandbox.partitaBuildLayoutUnits('世界。', cjkWords, true);
assert.equal(cjkUnits.length, 1, 'CJK 语义粘滞成 1 unit');
assert.equal(cjkUnits[0].isSemantic, true, 'unit 标记 isSemantic');
assert.equal(cjkUnits[0].isSticky, true, 'unit 标记 isSticky');
assert.equal(cjkUnits[0].words.length, 3, '语义 unit 保留 3 原始词');
assert.equal(sandbox.partitaBuildDisplayWords(cjkUnits).length, 3, '语义 unit display 仍逐词（逐字时序）');

// 英文缩写粘滞：It | ’ | s → It’s 一个 display 词
const enWords = [
  { text: 'It', startTime: 0.0, endTime: 0.2 },
  { text: '’', startTime: 0.2, endTime: 0.25 },
  { text: 's', startTime: 0.25, endTime: 0.35 },
  { text: 'unbelievable', startTime: 0.35, endTime: 1.2 }
];
const enDisplay = sandbox.partitaBuildDisplayWords(sandbox.partitaBuildLayoutUnits('It’s unbelievable', enWords, true));
assert.equal(enDisplay.length, 2, '缩写粘滞后 display = [It’s, unbelievable]');
assert.equal(enDisplay[0].text, 'It’s');

// renderHints 三档（renderHints.ts 阈值 0.10/0.18）
const pMicro = sandbox.partitaRenderProfile(10, 10.08, 10.08);
assert.equal(pMicro.lineTransitionMode, 'none', 'micro 行 → none/instant');
assert.equal(pMicro.wordRevealMode, 'instant');
assert.ok(Math.abs(pMicro.lineRenderEndTime - Math.max(10.08, 10.067)) < 1e-9, 'micro renderEndTime = max(end, start+0.067)');
const pShort = sandbox.partitaRenderProfile(10, 10.15, 10.15);
assert.equal(pShort.lineTransitionMode, 'fast', 'short 行 → fast/fast');
assert.equal(pShort.wordRevealMode, 'fast');
const pNormal = sandbox.partitaRenderProfile(10, 14, 13.5);
assert.equal(pNormal.lineTransitionMode, 'normal', 'normal 行 → normal/normal');
assert.equal(pNormal.wordRevealMode, 'normal');
assert.equal(pNormal.wordLookahead, 0.15, 'normal lookahead 0.15');

// buildSequentialColumns：12 词 → 900px 窗高 → 行数 ≤5、stagger 交替、种子确定
const line = sandbox.lyricsLines[0];
const words = [];
for (let i = 0; i < 12; i++) words.push({ text: String(i + 1), startTime: 30.5 + i * 0.4, endTime: 30.5 + i * 0.4 + 0.38 });
const tuning = { showGuideLines: true, useSemanticLayout: true, staggerMin: 20, staggerMax: 100 };
const layout1 = sandbox.partitaBuildLayout(line, words, 900, tuning);
const layout2 = sandbox.partitaBuildLayout(line, words, 900, tuning);
assert.ok(layout1.rows.length >= 1 && layout1.rows.length <= 5, '行数 ≤ min(units, floor(0.65*900/100))=5');
assert.equal(JSON.stringify(layout1), JSON.stringify(layout2), '种子随机确定（两次布局全等）');
assert.equal(layout1.rows.reduce((n, r) => n + r.chunkWords.length, 0), 12, '全部 12 词都分进 chunk');
assert.ok(layout1.rows.every((r, i) => (i % 2 === 0 ? r.config.x <= 0 : r.config.x >= 0)), 'stagger 左右交替（偶行负/奇行正）');
assert.ok(layout1.rows.every((r) => Math.abs(r.config.x) >= 20 - 1e-6 && Math.abs(r.config.x) <= 100 + 1e-6), 'stagger 幅度在 [20,100]');

// 词时序来源：YRC 真实 w.t/w.d；LRC 合成
const timed = sandbox.partitaBuildTimedWords(sandbox.lyricsLines[0]);
assert.equal(timed.length, 12);
assert.equal(timed[0].startTime, 10.2);
assert.equal(timed[0].endTime, 10.2 + 0.28);
const lrcTimed = sandbox.partitaBuildTimedWords(sandbox.lyricsLines[1]);
assert.equal(lrcTimed.length, 3, 'LRC 合成逐词时序（3 词）');
assert.equal(lrcTimed[0].startTime, 15, '首词起点=行首');

// 布局缓存 + 预热
const l1 = sandbox.partitaGetOrBuildLayout(sandbox.lyricsLines[0]);
assert.equal(l1, sandbox.partitaGetOrBuildLayout(sandbox.lyricsLines[0]), '布局缓存命中（同对象）');

// 均分字时序 + 逐字流光时长
const gTimings = sandbox.partitaEvenGraphemeTimings('abcd', 0.5, 0.9);
assert.equal(gTimings.length, 4);
assert.ok(Math.abs(gTimings[1].startTime - 0.6) < 1e-9, '均分字时序');
assert.ok(Math.abs((gTimings[0].endTime - gTimings[0].startTime) * 6 - 0.6) < 1e-9, '字内流光时长 = charDur*6');

/* ---------- 二、DOM 渲染 + 三态状态机 ---------- */

sandbox.applyPartitaMode(true, { save: false });
assert.equal(bodyClassToggled, 'partita', 'body class = partita');

mockNow = 10.0; sandbox.partitaTickLyrics();
assert.equal(floatEl.children.length, 1, '首行挂载');
const lineEl = floatEl.children[0];
assert.ok(lineEl._classes.has('pt-line') && lineEl._classes.has('enter-normal') && !lineEl._classes.has('rv-fast'), 'normal 行 → enter-normal 无 rv 类');
assert.ok(!!lineEl.style.props['--pt-fs'], '字号密度变量已设');
const colEl = lineEl.children[0];
assert.ok(colEl._classes.has('pt-column'), 'pt-line > pt-column');
const innerEl = colEl.children[0];
assert.ok(innerEl.children.length >= 1 && innerEl.children.length <= 5, '列内块数 1~5');
const chunkEl = innerEl.children[0];
assert.ok(chunkEl.children[0]._classes.has('pt-guide-v') && chunkEl.children[1]._classes.has('pt-guide-h'), '块含引导线（v+h）');
let wordCount = 0, glowCount = 0;
for (const ch of innerEl.children) for (const w of ch.children) {
  if (w._classes.has('pt-word')) { wordCount++; if (w.children[0]._classes.has('pt-glow')) glowCount++; }
}
assert.equal(wordCount, 12, '12 词全部渲染');
assert.equal(glowCount, 12, '每词带流光层');

// 三态：10.1s 首词 active（10.2 - lookahead 0.15）
mockNow = 10.1; sandbox.partitaTickLyrics();
assert.equal(sandbox.partitaWordRecs.filter((r) => r.state === 'active').length, 1, '10.1s 首词已 active');
assert.ok(sandbox.partitaWordRecs[0].glowChars.every((g) => g._classes.has('on')), 'active 词已挂流光 on');
assert.equal(sandbox.partitaChunkRecs[0].state, 'active', 'chunk 同步 active');
assert.ok(Math.abs(parseFloat(sandbox.partitaWordRecs[0].el.style.props.scale) - sandbox.partitaWordRecs[0].pose.scale * 1.4) < 1e-9, 'active 位姿 scale = pose*1.4');

// passed：rotate 慢拧 5s linear
mockNow = 10.9; sandbox.partitaTickLyrics();
assert.equal(sandbox.partitaWordRecs[0].state, 'passed', '10.9s 词 0 已 passed');
assert.ok(Math.abs(parseFloat(sandbox.partitaWordRecs[0].el.style.props.rotate) - (sandbox.partitaWordRecs[0].pose.rotate + sandbox.partitaWordRecs[0].pose.passedRotate)) < 1e-9, 'passed 位姿 rotate 含 passedRotate');
assert.ok((sandbox.partitaWordRecs[0].el.style.props.transition || '').indexOf('rotate 5s linear') >= 0, 'passed transition 含 5s linear rotate');

// 预热：逐步推进到 lead=1.0（不触发 seek 大跳守卫）
mockNow = 12.0; sandbox.partitaTickLyrics();
mockNow = 13.5; sandbox.partitaTickLyrics();
mockNow = 14.0; sandbox.partitaTickLyrics();
let cacheKeys = 0;
for (const k of sandbox.partitaLayoutCache.keys()) cacheKeys++;
assert.ok(cacheKeys >= 2, '下一行（LRC）已进预热缓存');

// 行切换：旧行 exit + 新行挂载（LRC 合成词路径）
mockNow = 15.2; sandbox.partitaTickLyrics();
assert.ok(sandbox.partitaLineEl && sandbox.partitaLineEl._classes.has('pt-line'), '切行后新 pt-line 已挂载');
assert.ok(floatEl.children.some((c) => c._classes.has('exit-normal')), '存在带 exit-normal 的旧行');
assert.ok(sandbox.partitaWordRecs.length >= 3 && sandbox.partitaWordRecs[0].startT >= 15, 'LRC 行成功渲染词');

// 行内 seek 大幅倒退（>1.5s）→ 同 idx 强制重建
const beforeEl = sandbox.partitaLineEl;
mockNow = 13.5; sandbox.partitaTickLyrics();
assert.notEqual(sandbox.partitaLineEl, beforeEl, 'seek 倒退触发行重建');

// 无真实歌词 → 空态
sandbox.lyricsLines = [];
mockNow = 20; sandbox.partitaTickLyrics();
assert.ok(emptyEl._classes.has('show'), '无歌词时显示空态');

// eco 质量档已收编到 91-overlay-transition 统一管理（activeOverlay 边沿驱动），
// 模块自身进出不再读写 performanceQuality——保持调用方档位不变。
sandbox.fx = { performanceQuality: 'balanced' };
sandbox.applyPartitaMode(true, { save: false });
assert.equal(sandbox.fx.performanceQuality, 'balanced', '模块不再自管 eco');
sandbox.applyPartitaMode(false, { save: false });
assert.equal(sandbox.fx.performanceQuality, 'balanced', '模块不再自管恢复');
assert.equal(bodyClassToggled, null, '退出后 body class 移除');

console.log('OK partita');
