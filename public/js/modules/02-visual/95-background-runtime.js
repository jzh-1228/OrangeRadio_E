// ============================================================
// 95-background-runtime.js — 正交背景宿主层 + DIY 控制台「背景」选择组
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/components/visualizer/
// VisualizerBackgroundRenderer.tsx 的宿主思想（挂载/卸载/上下文分发）。
//
// 职责：
//   1) context 生产端：实现 92-background-registry 预埋的
//      buildAccentPalette / currentCoverPalette / getControlCoverUrl /
//      currentPlaybackSeed（此前全部 undefined，context 恒 null）。
//   2) #visualizer-bg-layer 宿主：按 fx.backgroundMode 挂载/卸载
//      VISUALIZER_BG_IMPLS 实现（94-background-presets），z 序在 body
//      背景体系(#custom-bg/#album-bg z-index:0)之上、WebGL 主场景
//      (#canvas-container z-index:1，DOM 靠后)之下——垫底不盖前景。
//   3) fx-panel「背景」fx-section 的 seg 按钮组（渲染
//      listVisualizerBackgrounds()，仿 close-behavior-seg 模式），
//      选中写 fx.backgroundMode 并经 saveLyricLayout 持久化。
//
// 与前景正交：不进 VISUALIZER_OVERLAY_MODES（互斥/保温门控不涉及），
// 不动歌词模式/覆盖层/数值预设；也不做覆盖层式的「进入切 eco」——
// 背景垫底、主场景仍在正常渲染，没有帧预算可让。
// star-river / album-blur 实现已接入（94a-background-star-river.js /
// 94b-background-album-blur.js，加载时覆盖 92 的预登记为 implReady:true）。
// 下方对 implReady:false 的拦截是纯防御：只有实现文件未加载（脚本
// 缺失/被拦）才会命中——保持预留提示而不是"点了没反应"。
// ============================================================

var VISUALIZER_BG_LAYER_ID = 'visualizer-bg-layer';
var visualizerBgActiveId = '';
var visualizerBgActiveImpl = null;
var visualizerBgRafId = 0;
var visualizerBgSlowTimer = 0;
var visualizerBgLastFrame = 0;
var visualizerBgLastTick = 0;
var visualizerBgResizeTimer = 0;

/* ---------- context 生产端（92 预埋协议的实现） ---------- */

/* 从 stageLyrics.coverPalette（歌词取色管线产物）+ fx.visualTint 合成
   accent 调色板；无取色时回退用户视觉主色/默认暖色。 */
function buildAccentPalette() {
  var pal = (typeof stageLyrics !== 'undefined' && stageLyrics && (stageLyrics.coverPalette || stageLyrics.palette)) || null;
  var tint = null;
  if (typeof fx !== 'undefined' && fx && fx.visualTintMode === 'custom' && fx.visualTintColor) tint = fx.visualTintColor;
  return {
    primary: (pal && (pal.primary || pal.secondary)) || tint || '#ff7a3d',
    secondary: (pal && (pal.secondary || pal.primary)) || '#ffb38a',
    accent: (pal && (pal.highlight || pal.accent)) || '#ffd070',
    base: (pal && pal.base) || '#14100d'
  };
}

/* Folia Theme 形状（backgroundColor/primaryColor/secondaryColor/accentColor）。
   优先走 96-theme-service 的封面派生双主题（昼/夜）；未生成时回退取色直通。 */
var VBG_PALETTE_CACHE = { pal: null, tintKey: '', out: null };
function currentCoverPalette() {
  var themed = (typeof themeServiceActiveTheme === 'function') ? themeServiceActiveTheme() : null;
  if (themed) return themed;
  var pal = (typeof stageLyrics !== 'undefined' && stageLyrics) ? (stageLyrics.coverPalette || stageLyrics.palette) : null;
  var tint = (typeof fx !== 'undefined' && fx && fx.visualTintMode === 'custom' && fx.visualTintColor) ? fx.visualTintColor : '';
  if (pal === VBG_PALETTE_CACHE.pal && tint === VBG_PALETTE_CACHE.tintKey && VBG_PALETTE_CACHE.out) {
    return VBG_PALETTE_CACHE.out;
  }
  VBG_PALETTE_CACHE.pal = pal;
  VBG_PALETTE_CACHE.tintKey = tint;
  var p = buildAccentPalette();
  VBG_PALETTE_CACHE.out = {
    backgroundColor: p.base,
    primaryColor: p.primary,
    secondaryColor: p.secondary,
    accentColor: p.accent
  };
  return VBG_PALETTE_CACHE.out;
}

/* 当前播放封面 URL：从 #control-cover 的 background-image 解析。
   按背景图字符串缓存解析结果，避免 30fps tick 重复走 getComputedStyle/正则。 */
var VBG_COVER_URL_CACHE = { bg: null, url: null };
function getControlCoverUrl() {
  var src = document.getElementById('control-cover');
  if (!src) return null;
  var bg = src.style.backgroundImage || '';
  if (!bg || bg === 'none') bg = getComputedStyle(src).backgroundImage || '';
  if (bg === VBG_COVER_URL_CACHE.bg) return VBG_COVER_URL_CACHE.url;
  var m = /url\((["']?)([^"')]+)\1\)/.exec(bg);
  VBG_COVER_URL_CACHE.bg = bg;
  VBG_COVER_URL_CACHE.url = m ? m[2] : null;
  return VBG_COVER_URL_CACHE.url;
}

/* 播放种子：切歌变化（geometric 重排构图用），复用歌词取色的歌曲 key */
function currentPlaybackSeed() {
  try {
    if (typeof lyricCurrentCoverPaletteKey === 'function') {
      var key = lyricCurrentCoverPaletteKey();
      if (key) return key;
    }
  } catch (e) { }
  return (typeof currentIdx !== 'undefined' && currentIdx >= 0) ? currentIdx : 0;
}

/* ---------- 宿主层切换 ---------- */

function visualizerBgHost() {
  return document.getElementById(VISUALIZER_BG_LAYER_ID);
}

function normalizeVisualizerBackgroundMode(value) {
  var id = String(value || '').trim();
  if (id === 'ambient') return 'ambient';
  if (id && VISUALIZER_BG_IMPLS[id]) return id;
  return 'ambient';
}

function stopVisualizerBgLoops() {
  if (visualizerBgRafId) {
    cancelAnimationFrame(visualizerBgRafId);
    visualizerBgRafId = 0;
  }
  if (visualizerBgSlowTimer) {
    clearInterval(visualizerBgSlowTimer);
    visualizerBgSlowTimer = 0;
  }
}

/* 覆盖层（歌词模式）激活期间背景层被 z-index:5 不透明容器完全盖住：
   tick/tickSlow 整段跳过，rAF 空转保留（每帧一次函数调用，成本可忽略），
   退出覆盖层后下一帧自然续跑（dt 有 0.1s clamp，不会跳变）。 */
function visualizerBgCoveredByOverlay() {
  return typeof activeVisualizerOverlay === 'function' && !!activeVisualizerOverlay();
}

function startVisualizerBgLoops(impl) {
  var host = visualizerBgHost();
  if (!host || !impl) return;
  visualizerBgLastFrame = 0;
  visualizerBgLastTick = 0;
  // 低速上下文轮询：封面/取色/seed 变化（全部实现共享，~1.4Hz）
  visualizerBgSlowTimer = setInterval(function () {
    if (!visualizerBgActiveImpl) return;
    if (visualizerBgCoveredByOverlay()) return;
    try {
      visualizerBgActiveImpl.tickSlow(visualizerBackgroundContext());
    } catch (e) {
      console.warn('[VisualizerBg] tickSlow failed', e);
    }
  }, 700);
  if (!impl.needsRaf) return;
  // 绘制循环 ~30fps（低速漂浮场景足够，与 aurora/rainy 同档）
  function frame(now) {
    if (!visualizerBgActiveImpl) return;
    if (visualizerBgCoveredByOverlay()) {
      visualizerBgLastFrame = 0;
      visualizerBgRafId = requestAnimationFrame(frame);
      return;
    }
    var dt = visualizerBgLastFrame ? Math.min(0.1, (now - visualizerBgLastFrame) / 1000) : 1 / 30;
    visualizerBgLastFrame = now;
    if (now - visualizerBgLastTick > 33) {
      visualizerBgLastTick = now;
      try {
        visualizerBgActiveImpl.tick(visualizerBackgroundContext(), dt, now);
      } catch (e) {
        console.warn('[VisualizerBg] tick failed', e);
      }
    }
    visualizerBgRafId = requestAnimationFrame(frame);
  }
  visualizerBgRafId = requestAnimationFrame(frame);
}

/* 背景切换主入口（ambient = 撤下背景层，body 背景体系照旧） */
function applyVisualizerBackgroundMode(id, opts) {
  opts = opts || {};
  var rawId = String(id || '').trim();
  // 防御：实现文件未加载的登记项（implReady:false）在 normalize 之前
  // 拦下（normalize 会把无实现的 id 静默吞成 ambient），提示但不切换。
  var rawEntry = (typeof getVisualizerBackgroundEntry === 'function') ? getVisualizerBackgroundEntry(rawId) : null;
  if (rawEntry && rawEntry.implReady === false) {
    if (opts.toast !== false && typeof showToast === 'function') showToast('「' + rawEntry.label + '」背景为预留登记，后续版本接入');
    return false;
  }
  var next = normalizeVisualizerBackgroundMode(rawId);
  var host = visualizerBgHost();
  if (next !== 'ambient' && !host) return false;
  if (next === visualizerBgActiveId && (next === 'ambient' ? !visualizerBgActiveImpl : visualizerBgActiveImpl)) {
    syncVisualizerBackgroundSeg();
    return true;
  }
  // 卸载旧实现
  stopVisualizerBgLoops();
  if (visualizerBgActiveImpl && typeof visualizerBgActiveImpl.unmount === 'function') {
    try { visualizerBgActiveImpl.unmount(); } catch (e) { console.warn('[VisualizerBg] unmount failed', e); }
  }
  if (host) {
    host.className = '';
    host.innerHTML = '';
  }
  visualizerBgActiveImpl = null;
  visualizerBgActiveId = next;
  if (next === 'ambient') {
    document.body.classList.remove('visualizer-bg-active');
  } else {
    visualizerBgActiveImpl = VISUALIZER_BG_IMPLS[next];
    document.body.classList.add('visualizer-bg-active');
    host.className = 'mode-' + next;
    try {
      visualizerBgActiveImpl.mount(host, visualizerBackgroundContext());
    } catch (e) {
      console.warn('[VisualizerBg] mount failed', e);
    }
    startVisualizerBgLoops(visualizerBgActiveImpl);
  }
  if (typeof fx !== 'undefined' && fx) fx.backgroundMode = next;
  syncVisualizerBackgroundSeg();
  if (opts.save && typeof saveLyricLayout === 'function') {
    saveLyricLayout({ user: true, reason: 'visualizerBackgroundMode' });
  }
  if (opts.toast && typeof showToast === 'function') {
    showToast(next === 'ambient' ? '已切回氛围底背景' : '背景已切换');
  }
  return true;
}

function setVisualizerBackgroundMode(id) {
  applyVisualizerBackgroundMode(id, { save: true, toast: false });
}

/* ---------- DIY 控制台「背景」seg 选择组（仿 close-behavior-seg） ---------- */

function renderVisualizerBackgroundSeg() {
  var seg = document.getElementById('background-mode-seg');
  if (!seg || seg._vbgBound) return;
  seg._vbgBound = true;
  var html = '';
  var list = (typeof listVisualizerBackgrounds === 'function') ? listVisualizerBackgrounds() : [];
  for (var i = 0; i < list.length; i++) {
    var entry = list[i];
    var reserved = entry.implReady === false;
    html += '<button type="button" data-bg-mode="' + entry.id + '"' +
      (reserved ? ' title="预留登记，后续版本接入"' : '') +
      (reserved ? ' class="reserved"' : '') + '>' + entry.label + '</button>';
  }
  seg.innerHTML = html;
  seg.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-bg-mode]') : null;
    if (!btn) return;
    setVisualizerBackgroundMode(btn.getAttribute('data-bg-mode'));
  });
  syncVisualizerBackgroundSeg();
}

function syncVisualizerBackgroundSeg() {
  var seg = document.getElementById('background-mode-seg');
  if (!seg) return;
  var current = visualizerBgActiveId || normalizeVisualizerBackgroundMode(typeof fx !== 'undefined' && fx && fx.backgroundMode);
  var buttons = seg.querySelectorAll('[data-bg-mode]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-bg-mode') === current);
  }
}

/* ---------- 启动 ---------- */

function initVisualizerBackgroundRuntime() {
  renderVisualizerBackgroundSeg();
  var saved = (typeof fx !== 'undefined' && fx && fx.backgroundMode) || 'ambient';
  applyVisualizerBackgroundMode(saved, { save: false });
  window.addEventListener('resize', function () {
    clearTimeout(visualizerBgResizeTimer);
    visualizerBgResizeTimer = setTimeout(function () {
      if (visualizerBgActiveImpl && typeof visualizerBgActiveImpl.onResize === 'function') {
        try { visualizerBgActiveImpl.onResize(); } catch (e) { }
      }
    }, 180);
  });
}

/* 延迟到 DOM 就绪后初始化（与 aurora/rainy 同款范式） */
if (typeof scheduleUiWarmTask === 'function') scheduleUiWarmTask(initVisualizerBackgroundRuntime, 350);
else setTimeout(initVisualizerBackgroundRuntime, 350);

window.applyVisualizerBackgroundMode = applyVisualizerBackgroundMode;
