// ============================================================
// 92-background-registry.js — 背景注册表（背景与前景正交的地基）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/components/visualizer/backgrounds/ 协议思想。
//
// 背景契约（与前景完全正交）：背景只接 {theme(封面取色), coverUrl, audioPower,
// bands, seed, staticMode, paused}——不拿歌词行、不拿前景模式的 tuning。
// 选择器 UI 已由 DIY 控制台「背景」区接入（fx-panel #background-mode-seg，
// 95-background-runtime 渲染 listVisualizerBackgrounds()，选中存
// fx.backgroundMode 经 saveLyricLayout 持久化）；实现挂载在
// #visualizer-bg-layer 宿主层（94-background-presets 首批三背景）。
// star-river / album-blur 仅为登记（implReady:false）：它们的 runtime
// 实现与选择器 UI 入口为预留后续，选择时保持氛围底并提示。
// ============================================================

var VISUALIZER_BACKGROUND_MODES = [
  // 既有背景能力登记：body 背景体系（accent-background-controls 管理：纯色/封面/图片/视频）
  { id: 'ambient', label: '氛围底', kind: 'body', order: 10 },
  // 星河背景（wallpaper 粒子，数值预设 5 的一部分；登记供正交化后独立选择——预留未接入）
  { id: 'star-river', label: '星河', kind: 'webgl-layer', host: 'lyricsStarRiver', order: 20, implReady: false },
  // 专辑封面模糊底（#album-bg 双 slot 渐变——预留未接入）
  { id: 'album-blur', label: '封面模糊', kind: 'dom-layer', order: 30, implReady: false }
];

function registerVisualizerBackground(entry) {
  if (!entry || !entry.id) return;
  for (var i = 0; i < VISUALIZER_BACKGROUND_MODES.length; i++) {
    if (VISUALIZER_BACKGROUND_MODES[i].id === entry.id) { VISUALIZER_BACKGROUND_MODES[i] = entry; return; }
  }
  VISUALIZER_BACKGROUND_MODES.push(entry);
}

function listVisualizerBackgrounds() {
  return VISUALIZER_BACKGROUND_MODES.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}

function getVisualizerBackgroundEntry(id) {
  for (var i = 0; i < VISUALIZER_BACKGROUND_MODES.length; i++) {
    if (VISUALIZER_BACKGROUND_MODES[i].id === id) return VISUALIZER_BACKGROUND_MODES[i];
  }
  return null;
}

// bands 信号新鲜度标记：主循环每帧以新对象写入 bands（11-main-loop.js:452），
// 引用恒等说明主循环已进入覆盖层保温分支（只保活 spectrum、不写 bands）。
var VISUALIZER_BG_LAST_BANDS_REF = null;

/* 前景覆盖层保温期间主循环不更新 bands/audioPower，背景（正交、仍在跑）
   从保活的 frequencyData 自算回退——与 aurora/rainy 覆盖层自算特征同思路。 */
function visualizerBgBandsFallback() {
  if (typeof frequencyData === 'undefined' || !frequencyData || !frequencyData.length) return null;
  // bin = sampleRate/fftSize ≈ 21.5Hz，频段划分对齐 11-main-loop.js 的注释
  function avg(from, to) {
    var sum = 0, n = 0;
    var hi = Math.min(to, frequencyData.length - 1);
    for (var i = from; i <= hi; i++) { sum += frequencyData[i]; n++; }
    return n ? (sum / n) / 255 : 0;
  }
  return {
    kick: avg(3, 7),        // 60-150Hz
    vocal: avg(9, 140),     // 200-3000Hz
    mid: avg(140, 280),     // 3-6kHz
    treble: avg(280, Math.min(744, frequencyData.length - 1)), // 6kHz+
    rms: avg(2, 300)        // 频谱均值近似能量
  };
}

// 背景渲染上下文：正交背景的唯一输入形状（前景模式不得反向依赖）。
// 与 Folia definition.ts RenderProps 同形（theme/audioPower/bands/seed/paused）。
function visualizerBackgroundContext() {
  var theme = (typeof buildAccentPalette === 'function' && typeof currentCoverPalette === 'function')
    ? currentCoverPalette() : null;
  var coverUrl = (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null;
  var bands = (typeof motionSignalGet === 'function') ? motionSignalGet('bands') : null;
  var audioPower = (typeof motionSignalGet === 'function') ? motionSignalGet('audioPower') : 0;
  var paused = !!(typeof audio !== 'undefined' && audio && audio.paused);
  if (bands) {
    if (bands === VISUALIZER_BG_LAST_BANDS_REF && !paused) {
      bands = null; // 引用未更新且在播放：覆盖层保温期（或主循环音频闸门偶发跳帧），走自算回退
    } else {
      VISUALIZER_BG_LAST_BANDS_REF = bands;
    }
  }
  if (!bands && !paused) {
    bands = visualizerBgBandsFallback();
    if (bands) audioPower = Math.min(1, bands.rms * 2.4); // audioPower 同步用回退值
  }
  return {
    theme: theme,
    coverUrl: coverUrl,
    audioPower: (typeof audioPower === 'number' && isFinite(audioPower)) ? audioPower : 0,
    bands: bands,
    seed: (typeof currentPlaybackSeed === 'function') ? currentPlaybackSeed() : 0,
    staticMode: false,
    paused: paused
  };
}
