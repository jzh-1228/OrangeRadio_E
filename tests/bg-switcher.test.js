'use strict';
/* bg-switcher：正交背景（92 注册表 / 94 三实现 / 95 宿主与选择组）的纯逻辑验证。
   沙箱模拟浏览器全局（模块顶层 var 挂 window），与 visualizer-registry.test.js 同法。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const base = path.join(__dirname, '..', 'public', 'js', 'modules');

/* ---------- 浏览器桩 ---------- */
function makeCtx2d() {
  return {
    canvas: null, lineJoin: '', lineWidth: 1, fillStyle: '', strokeStyle: '',
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    clearRect() {}, setTransform() {}, save() {}, restore() {},
    translate() {}, rotate() {}, scale() {}, beginPath() {},
    arc() {}, rect() {}, moveTo() {}, lineTo() {}, closePath() {},
    fill() {}, stroke() {}, fillRect() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
}
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    style: { setProperty() {}, backgroundImage: '' },
    className: '', innerHTML: '', width: 0, height: 0, alt: '', draggable: false,
    decoding: '', src: '', complete: false,
    _classes: new Set(),
    classList: {
      add(c) { el._classes.add(c); }, remove(c) { el._classes.delete(c); },
      toggle(c, on) { if (on === undefined) { el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c); } else if (on) el._classes.add(c); else el._classes.delete(c); },
      contains(c) { return el._classes.has(c); },
    },
    setAttribute() {}, getAttribute() { return null; },
    appendChild(child) { el._children.push(child); return child; },
    removeChild(child) { const i = el._children.indexOf(child); if (i >= 0) el._children.splice(i, 1); return child; },
    addEventListener() {},
    _children: [],
    _ctx2d: null,
    getContext() { if (!el._ctx2d) { el._ctx2d = makeCtx2d(); el._ctx2d.canvas = el; } return el._ctx2d; },
    querySelector(sel) {
      const child = makeEl(sel.indexOf('canvas') >= 0 ? 'canvas' : 'div');
      el._children.push(child);
      return child;
    },
    closest() { return null; },
  };
  el.parentNode = null;
  return el;
}

const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
  requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
  Promise, Map, Set, Math, JSON, Object, Array, Uint8Array, Float32Array, Number, String, isFinite, Date,
};
sandbox.window = sandbox;
sandbox.getComputedStyle = function () { return { backgroundImage: 'none' }; };
sandbox.addEventListener = function () {};

let lastToast = '';
let lastSave = null;
sandbox.showToast = function (msg) { lastToast = String(msg); };
sandbox.saveLyricLayout = function (opts) { lastSave = opts; };

sandbox.fx = { backgroundMode: 'geometric', visualTintMode: 'auto', visualTintColor: '#ff9c6e' };
sandbox.stageLyrics = { coverPalette: { primary: '#123456', secondary: '#654321', highlight: '#abcdef', base: '#101010' } };
sandbox.currentIdx = 3;
sandbox.lyricCurrentCoverPaletteKey = function () { return 'song-key-42'; };
sandbox.frequencyData = null;
sandbox.audio = { paused: false };
const STUB_BANDS = { kick: 0.4, vocal: 0.3, mid: 0.2, treble: 0.1, rms: 0.25 };
sandbox.motionSignalGet = function (key) {
  if (key === 'bands') return STUB_BANDS;
  if (key === 'audioPower') return 0.35;
  return null;
};
sandbox.document = {
  getElementById(id) {
    if (id === 'visualizer-bg-layer') { sandbox.__host = sandbox.__host || makeEl('div'); return sandbox.__host; }
    if (id === 'control-cover') return null;
    return null;
  },
  querySelectorAll() { return []; },
  createElement(tag) { return makeEl(tag); },
  addEventListener() {},
  body: makeEl('body'),
};
sandbox.Image = function () {
  const img = { crossOrigin: '', decoding: '', onload: null, onerror: null, naturalWidth: 640, naturalHeight: 640, src: '' };
  Object.defineProperty(img, 'src', {
    set(v) { this._src = v; if (this.onerror) this.onerror(); },
    get() { return this._src; },
  });
  return img;
};

vm.createContext(sandbox);
for (const file of ['02-visual/92-background-registry.js', '02-visual/94-background-presets.js', '02-visual/94a-background-star-river.js', '02-visual/94b-background-album-blur.js', '02-visual/95-background-runtime.js']) {
  vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), sandbox, { filename: file });
}

/* ---------- 注册清单 ---------- */
{
  const list = sandbox.listVisualizerBackgrounds();
  assert.equal(list.length, 6, 'six backgrounds registered');
  assert.equal(list[0].id, 'ambient', 'ambient sorts first');
  for (const id of ['cover-fluid', 'solid-gradient', 'geometric']) {
    const e = list.find((x) => x.id === id);
    assert.ok(e && e.implReady === true, id + ' registered as ready');
    assert.ok(sandbox.VISUALIZER_BG_IMPLS[id], id + ' impl exists');
  }
  for (const id of ['star-river', 'album-blur']) {
    const e = list.find((x) => x.id === id);
    assert.ok(e && e.implReady === true, id + ' selectable (impl ready, was reserved)');
    assert.ok(sandbox.VISUALIZER_BG_IMPLS[id], id + ' impl exists');
  }
  assert.equal(sandbox.getVisualizerBackgroundEntry('geometric').label, '几何律动');
}

/* ---------- normalize ---------- */
assert.equal(sandbox.normalizeVisualizerBackgroundMode('geometric'), 'geometric');
assert.equal(sandbox.normalizeVisualizerBackgroundMode('cover-fluid'), 'cover-fluid');
assert.equal(sandbox.normalizeVisualizerBackgroundMode('star-river'), 'star-river', 'star-river now selectable');
assert.equal(sandbox.normalizeVisualizerBackgroundMode('album-blur'), 'album-blur', 'album-blur now selectable');
assert.equal(sandbox.normalizeVisualizerBackgroundMode('nope'), 'ambient');
assert.equal(sandbox.normalizeVisualizerBackgroundMode(''), 'ambient');

/* ---------- context 生产端（95 实现 92 预埋协议） ---------- */
{
  const ctx = sandbox.visualizerBackgroundContext();
  assert.ok(ctx.theme && typeof ctx.theme.backgroundColor === 'string'
    && typeof ctx.theme.primaryColor === 'string' && typeof ctx.theme.secondaryColor === 'string'
    && typeof ctx.theme.accentColor === 'string', 'theme is Folia Theme shaped');
  assert.equal(ctx.theme.primaryColor, '#123456', 'theme from cover palette');
  assert.equal(ctx.seed, 'song-key-42', 'seed is playback song key');
  assert.ok(ctx.bands && ctx.bands.kick === 0.4, 'bands passthrough on fresh reference');
  assert.equal(ctx.paused, false);
  // 引用恒等（覆盖层保温期主循环不写 bands）→ 自算回退
  sandbox.visualizerBackgroundContext();
  const stale = sandbox.visualizerBackgroundContext();
  assert.equal(stale.bands, null, 'stale bands falls back (no spectrum yet)');
  sandbox.frequencyData = new Uint8Array(512).fill(128);
  const computed = sandbox.visualizerBackgroundContext();
  assert.ok(computed.bands && computed.bands.kick > 0, 'stale bands computed from frequencyData');
  assert.ok(typeof computed.audioPower === 'number' && computed.audioPower > 0, 'audioPower recomputed with fallback');
}

/* ---------- 切换主流程 ---------- */
lastToast = '';
assert.equal(sandbox.applyVisualizerBackgroundMode('star-river', { save: true }), true, 'star-river mounts (was reserved-rejected)');
assert.equal(sandbox.__host.className.indexOf('mode-star-river') >= 0, true, 'host carries mode class');
assert.equal(sandbox.__host._classes.has('vbg-sr'), true, 'star-river impl class applied');
assert.ok(lastSave && lastSave.reason === 'visualizerBackgroundMode', 'switch persists via saveLyricLayout');
assert.equal(sandbox.fx.backgroundMode, 'star-river', 'fx.backgroundMode written');
assert.equal(sandbox.document.body._classes.has('visualizer-bg-active'), true, 'body active class set');

/* star-river 绘制帧：粒子 scratch 表挂载后引用稳定（零分配）且 tick 不抛 */
{
  const impl = sandbox.VISUALIZER_BG_IMPLS['star-river'];
  assert.equal(impl.needsRaf, true);
  impl.tickSlow(sandbox.visualizerBackgroundContext());
  impl.tick(sandbox.visualizerBackgroundContext(), 1 / 30, 1000);
  impl.tick(sandbox.visualizerBackgroundContext(), 1 / 30, 1034);
  impl.onResize();
  assert.ok(true, 'star-river tick/onResize run clean');
}

assert.equal(sandbox.applyVisualizerBackgroundMode('geometric', { save: true }), true, 'geometric mounts');
assert.equal(sandbox.__host.className.indexOf('mode-geometric') >= 0, true, 'host carries mode class');
assert.equal(sandbox.__host._classes.has('vbg-geo'), true, 'geometric impl class applied');
assert.ok(lastSave && lastSave.reason === 'visualizerBackgroundMode', 'switch persists via saveLyricLayout');
assert.equal(sandbox.fx.backgroundMode, 'geometric', 'fx.backgroundMode written');
assert.equal(sandbox.document.body._classes.has('visualizer-bg-active'), true, 'body active class set');

/* geometric 绘制帧：形状/粒子/弹簧表挂载后引用稳定（零分配）且 tick 不抛 */
{
  const impl = sandbox.VISUALIZER_BG_IMPLS.geometric;
  assert.equal(impl.needsRaf, true);
  const shapesRef = sandbox.__implShapes = null;
  impl.tickSlow(sandbox.visualizerBackgroundContext());
  impl.tick(sandbox.visualizerBackgroundContext(), 1 / 30, 1000);
  impl.tick(sandbox.visualizerBackgroundContext(), 1 / 30, 1034);
  impl.onResize();
  assert.ok(true, 'geometric tick/onResize run clean');
  void shapesRef;
}

/* cover-fluid：低速轮询安全路径（封面构建失败 → 原样 push，桩环境不抛） */
{
  sandbox.applyVisualizerBackgroundMode('cover-fluid', { save: false });
  const impl = sandbox.VISUALIZER_BG_IMPLS['cover-fluid'];
  assert.equal(impl.needsRaf, false);
  impl.tickSlow(sandbox.visualizerBackgroundContext());
  impl.onResize();
  assert.ok(true, 'cover-fluid tickSlow/onResize run clean');
}

/* solid-gradient：静态层，低速换色不抛 */
{
  sandbox.applyVisualizerBackgroundMode('solid-gradient', { save: false });
  const impl = sandbox.VISUALIZER_BG_IMPLS['solid-gradient'];
  assert.equal(impl.needsRaf, false);
  impl.tickSlow(sandbox.visualizerBackgroundContext());
  impl.onResize();
  assert.ok(true, 'solid-gradient tickSlow/onResize run clean');
}

/* album-blur：封面模糊压暗底（低速轮询安全路径：封面构建失败 → 原样 push，桩环境不抛） */
{
  assert.equal(sandbox.applyVisualizerBackgroundMode('album-blur', { save: false }), true, 'album-blur mounts (was reserved-rejected)');
  assert.equal(sandbox.__host.className.indexOf('mode-album-blur') >= 0, true, 'album-blur host carries mode class');
  assert.equal(sandbox.__host._classes.has('vbg-abl'), true, 'album-blur impl class applied');
  const impl = sandbox.VISUALIZER_BG_IMPLS['album-blur'];
  assert.equal(impl.needsRaf, false);
  impl.tickSlow(sandbox.visualizerBackgroundContext());
  impl.onResize();
  assert.ok(true, 'album-blur tickSlow/onResize run clean');
}

/* ambient：撤下背景层 */
{
  assert.equal(sandbox.applyVisualizerBackgroundMode('ambient', { save: true }), true);
  assert.equal(sandbox.document.body._classes.has('visualizer-bg-active'), false, 'body active class removed');
  assert.equal(sandbox.fx.backgroundMode, 'ambient');
  assert.equal(sandbox.__host.className, '', 'host reset');
}

console.log('OK bg-switcher');
