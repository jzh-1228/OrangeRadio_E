// ============================================================
// 92-background-registry.js — 背景注册表（背景与前景正交的地基）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/components/visualizer/backgrounds/ 协议思想。
//
// 背景契约（与前景完全正交）：背景只接 {theme(封面取色), coverUrl, audioPower,
// bands, seed, staticMode, paused}——不拿歌词行、不拿前景模式的 tuning。
// 本阶段交付协议与既有背景能力的登记；「背景 × 前景自由组合」的选择器 UI
// 与覆盖层背景拆出为后续版本（当前各覆盖层仍自带背景）。
// ============================================================

var VISUALIZER_BACKGROUND_MODES = [
  // 既有背景能力登记：body 背景体系（accent-background-controls 管理：纯色/封面/图片/视频）
  { id: 'ambient', label: '氛围底（现状默认）', kind: 'body', order: 10 },
  // 星河背景（wallpaper 粒子，数值预设 5 的一部分；登记供正交化后独立选择）
  { id: 'star-river', label: '星河', kind: 'webgl-layer', host: 'lyricsStarRiver', order: 20 },
  // 专辑封面模糊底（#album-bg 双 slot 渐变）
  { id: 'album-blur', label: '封面模糊', kind: 'dom-layer', order: 30 }
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

// 背景渲染上下文：正交背景的唯一输入形状（前景模式不得反向依赖）。
function visualizerBackgroundContext() {
  return {
    theme: (typeof buildAccentPalette === 'function' && typeof currentCoverPalette === 'function') ? currentCoverPalette() : null,
    coverUrl: (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null,
    audioPower: (typeof motionSignalGet === 'function') ? motionSignalGet('audioPower') : 0,
    bands: (typeof motionSignalGet === 'function') ? motionSignalGet('bands') : null,
    seed: (typeof currentPlaybackSeed === 'function') ? currentPlaybackSeed() : 0,
    staticMode: false,
    paused: !!(typeof audio !== 'undefined' && audio && audio.paused)
  };
}
