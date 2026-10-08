// ============================================================
// 90-visualizer-registry.js — 视觉模式注册表（前景平台化）
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0): src/components/visualizer/registry.tsx 协议思想
// （import.meta.glob 自动发现 → 本项目无构建体系，改为声明式清单 + window 全局延迟解析）。
//
// 单一 owner 收敛三件事：
//   1) 覆盖层互斥（此前在 6 处复制的四方 if/else）
//   2) 主循环保温门控（isMainSceneCoveredByOverlay → activeVisualizerOverlay()）
//   3) 预设网格特殊卡片激活态
// 新增覆盖层模式 = 本清单加一行 + 模块自实现 apply/状态变量；
// stateVar/applyFn 用字符串名经 window 解析（模块顶层 var 挂 window），
// 加载顺序无关（全部为调用时求值）。
// ============================================================

var VISUALIZER_OVERLAY_MODES = [
  { id: 'film-radio', label: '胶片电台', stateVar: 'filmRadioMode', applyFn: 'applyFilmRadioMode', order: 90 },
  { id: 'graffiti', label: '涂鸦墙', stateVar: 'graffitiMode', applyFn: 'applyGraffitiMode', order: 91 },
  { id: 'aurora', label: '流光', stateVar: 'auroraMode', applyFn: 'applyAuroraMode', order: 92 },
  { id: 'rainy', label: '雨夜车窗', stateVar: 'rainyMode', applyFn: 'applyRainyMode', order: 93 },
  { id: 'still', label: '静止', stateVar: 'stillMode', applyFn: 'applyStillMode', order: 95 },
  { id: 'claddagh', label: '环歌', stateVar: 'claddaghMode', applyFn: 'applyCladdaghMode', order: 96 },
  { id: 'tilt', label: '斜排', stateVar: 'tiltMode', applyFn: 'applyTiltMode', order: 97 },
  { id: 'fume', label: '烟纸', stateVar: 'fumeMode', applyFn: 'applyFumeMode', order: 98 },
  { id: 'classic', label: '流萤辉光', stateVar: 'classicMode', applyFn: 'applyClassicMode', order: 94 },
  { id: 'pendolo', label: '钟摆', stateVar: 'pendoloMode', applyFn: 'applyPendoloMode', order: 99 },
  { id: 'partita', label: '云阶', stateVar: 'partitaMode', applyFn: 'applyPartitaMode', order: 100 },
  { id: 'cadenza', label: '心象', stateVar: 'cadenzaMode', applyFn: 'applyCadenzaMode', order: 101 },
  { id: 'lattice', label: '队列拼贴', stateVar: 'latticeMode', applyFn: 'applyLatticeMode', order: 102 },
  { id: 'cappella', label: '群唱', stateVar: 'cappellaMode', applyFn: 'applyCappellaMode', order: 103 },
  { id: 'monet', label: '莫奈', stateVar: 'monetMode', applyFn: 'applyMonetMode', order: 104 }
];

function registerVisualizerOverlayMode(entry) {
  if (!entry || !entry.id) return;
  for (var i = 0; i < VISUALIZER_OVERLAY_MODES.length; i++) {
    if (VISUALIZER_OVERLAY_MODES[i].id === entry.id) { VISUALIZER_OVERLAY_MODES[i] = entry; return; }
  }
  VISUALIZER_OVERLAY_MODES.push(entry);
}

function listVisualizerOverlayModes() {
  return VISUALIZER_OVERLAY_MODES.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}

function getVisualizerOverlayMode(id) {
  for (var i = 0; i < VISUALIZER_OVERLAY_MODES.length; i++) {
    if (VISUALIZER_OVERLAY_MODES[i].id === id) return VISUALIZER_OVERLAY_MODES[i];
  }
  return null;
}

function overlayModeIsActive(entry) {
  if (!entry || typeof window === 'undefined') return false;
  return !!window[entry.stateVar];
}

// 当前激活中的覆盖层 entry（无则 null）。主循环保温门控、预设网格激活态的唯一事实源。
function activeVisualizerOverlay() {
  for (var i = 0; i < VISUALIZER_OVERLAY_MODES.length; i++) {
    if (overlayModeIsActive(VISUALIZER_OVERLAY_MODES[i])) return VISUALIZER_OVERLAY_MODES[i];
  }
  return null;
}

// 退出全部覆盖层（互斥进入 / 用户点常规预设时调用）。
function exitAllVisualizerOverlays(opts) {
  opts = opts || {};
  var save = opts.save !== false;
  for (var i = 0; i < VISUALIZER_OVERLAY_MODES.length; i++) {
    var entry = VISUALIZER_OVERLAY_MODES[i];
    if (!overlayModeIsActive(entry)) continue;
    var apply = typeof window !== 'undefined' ? window[entry.applyFn] : null;
    if (typeof apply === 'function') {
      try { apply(false, { save: save }); } catch (e) { console.warn('[VisualizerRegistry] exit failed: ' + entry.id, e); }
    }
  }
}

// 退出除 selfId 外的覆盖层（某模式进入时调用，替代各自复制三份的互斥分支）。
function exitOtherVisualizerOverlays(selfId, opts) {
  opts = opts || {};
  var save = opts.save !== false;
  for (var i = 0; i < VISUALIZER_OVERLAY_MODES.length; i++) {
    var entry = VISUALIZER_OVERLAY_MODES[i];
    if (entry.id === selfId || !overlayModeIsActive(entry)) continue;
    var apply = typeof window !== 'undefined' ? window[entry.applyFn] : null;
    if (typeof apply === 'function') {
      try { apply(false, { save: save }); } catch (e) { console.warn('[VisualizerRegistry] exit failed: ' + entry.id, e); }
    }
  }
}

// 数值 WebGL 预设（0-8）与外挂（sonic）登记——前景平台清单的另一半。
// 数值预设仍由 uniforms.uPreset 分支渲染（一套场景多形态），外挂为 IIFE 全局对象。
var VISUALIZER_PLUGIN_MODES = [
  { id: 'sonic-topography', label: '音域回响（外挂）', host: 'OrangeseaSonicTopography', order: 80 }
];

function activeVisualizerPlugin() {
  for (var i = 0; i < VISUALIZER_PLUGIN_MODES.length; i++) {
    var host = typeof window !== 'undefined' ? window[VISUALIZER_PLUGIN_MODES[i].host] : null;
    if (host && typeof host.isActive === 'function' && host.isActive()) return VISUALIZER_PLUGIN_MODES[i];
  }
  return null;
}
