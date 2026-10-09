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

// entry 字段：
//   id/label    模式标识与显示名（容器 id 约定为 <id>-overlay）
//   stateVar    模式模块顶层 var 的 window 布尔状态名
//   applyFn     模式模块顶层 function 的进出函数名（apply(fn(on, opts))）
//   icon/desc   预设网格卡片图标（SVG 字符串）与描述（04-preset-grid-uniforms 通用 builder 消费）
//   trimCache   可选：退出后延迟释放重缓存的函数名（如凝彩烘焙贴图）
//   order       网格展示顺序（与卡片拼装历史顺序一致）
var VISUALIZER_OVERLAY_MODES = [
  { id: 'film-radio', label: '胶片电台', stateVar: 'filmRadioMode', applyFn: 'applyFilmRadioMode', order: 90,
    desc: '黑胶 · 居中歌词',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.4"/><path d="M14.9 4.6a7.2 7.2 0 0 1 4.5 4.5"/></svg>' },
  { id: 'graffiti', label: '涂鸦墙', stateVar: 'graffitiMode', applyFn: 'applyGraffitiMode', order: 91,
    desc: '满屏歌词 · 暗夜墨光',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c2-6 5-10 9-13"/><path d="M13 7l3 3"/><path d="M16 4l4 4-3 3-4-4z"/><path d="M6 18l2 2"/></svg>' },
  { id: 'aurora', label: '流光', stateVar: 'auroraMode', applyFn: 'applyAuroraMode', order: 92,
    desc: '夜航极光 · 流光逐字',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 14c2.5-4.5 5-7 8-8"/><path d="M8 18c3-6 7-10 13-12"/><path d="M13 18c2-3.5 4.5-6 8-7.5"/><circle cx="19" cy="19" r="1.6"/></svg>' },
  { id: 'rainy', label: '雨夜车窗', stateVar: 'rainyMode', applyFn: 'applyRainyMode', order: 93,
    desc: '窗外霓虹 · 雾玻璃歌词',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2.5"/><path d="M7 8.5c1.2 1.6 1.2 3.4 0 5"/><path d="M12.5 7.5c1.6 2.2 1.6 4.8 0 7"/><path d="M17.5 8.8c1 1.4 1 3 0 4.4"/><path d="M5 21h14"/></svg>' },
  { id: 'still', label: '静止', stateVar: 'stillMode', applyFn: 'applyStillMode', order: 94,
    desc: '静态三行 · 暗角夜色',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 7h9" opacity=".4"/><path d="M4 12h16"/><path d="M7.5 17h9" opacity=".4"/></svg>' },
  { id: 'claddagh', label: '环歌', stateVar: 'claddaghMode', applyFn: 'applyCladdaghMode', order: 95,
    desc: '椭圆环 · 逐字流转',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="14.2" rx="8.4" ry="3.5"/><path d="M12 9.4c.9-1.5 3.2-1.2 3.2.6 0 1.2-1.4 2.2-3.2 3.4-1.8-1.2-3.2-2.2-3.2-3.4 0-1.8 2.3-2.1 3.2-.6z"/><path d="M9.7 6.9l.7-1.2.9.9.7-1.3.7 1.3.9-.9.7 1.2"/></svg>' },
  { id: 'tilt', label: '斜排', stateVar: 'tiltMode', applyFn: 'applyTiltMode', order: 96,
    desc: '概率拆行 · 大字交错',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5.5l14-1.6" opacity=".45"/><path d="M4 12l16-1.8"/><path d="M5 18.5l11-1.2" opacity=".45"/><path d="M18.6 16.9l1.8-1" opacity=".45"/></svg>' },
  { id: 'fume', label: '烟纸', stateVar: 'fumeMode', applyFn: 'applyFumeMode', order: 97,
    desc: '排版歌词 · 相机逐句',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 4h14" opacity=".45"/><path d="M4 8.5h9" opacity=".8"/><path d="M4 12.5h13" opacity=".55"/><path d="M4 16.5h8" opacity=".8"/><path d="M16.5 14.5l3.2 5.5M19.7 14.5l-3.2 5.5"/></svg>' },
  { id: 'classic', label: '流萤辉光', stateVar: 'classicMode', applyFn: 'applyClassicMode', order: 98,
    desc: '词间飞散 · 逐字辉光',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.7 5L19 9.7l-5.3 1.7L12 16.5l-1.7-5.1L5 9.7l5.3-1.7z"/><path d="M18.8 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>' },
  { id: 'pendolo', label: '钟摆', stateVar: 'pendoloMode', applyFn: 'applyPendoloMode', order: 99,
    desc: '钟表机械 · 弧形歌词',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.6" r="2.1"/><path d="M12 6.7v8.2"/><path d="M12 14.9l-3.4 4.6"/><path d="M12 14.9l3.4 4.6"/><circle cx="12" cy="4.6" r="0.4" fill="currentColor"/></svg>' },
  { id: 'partita', label: '云阶', stateVar: 'partitaMode', applyFn: 'applyPartitaMode', order: 100,
    desc: '竖列错落 · 逐字流光',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="15" width="4.4" height="5" rx="1"/><rect x="9.8" y="10" width="4.4" height="10" rx="1"/><rect x="16.1" y="5" width="4.4" height="15" rx="1"/></svg>' },
  { id: 'cadenza', label: '心象', stateVar: 'cadenzaMode', applyFn: 'applyCadenzaMode', order: 101,
    desc: '词云散布 · 三态辉光',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 3.4v2.2"/><path d="M12 18.4v2.2"/><path d="M3.4 12h2.2"/><path d="M18.4 12h2.2"/><path d="M5.9 5.9l1.6 1.6"/><path d="M16.5 16.5l1.6 1.6"/><path d="M18.1 5.9l-1.6 1.6"/><path d="M7.5 16.5l-1.6 1.6"/></svg>' },
  { id: 'lattice', label: '队列拼贴', stateVar: 'latticeMode', applyFn: 'applyLatticeMode', order: 102,
    desc: '封面海报墙 · 正在播放', cardClass: 'lattice-card-icon',
    lazy: true, storeKey: 'orangesea-lattice-mode-v1', src: ['js/modules/10-shell/22a-lattice-blocks.js', 'js/modules/10-shell/22-lattice.js'],
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="7" height="7" rx="1.4"/><rect x="13.5" y="4" width="7" height="7" rx="1.4" opacity=".55"/><rect x="3.5" y="13" width="7" height="7" rx="1.4" opacity=".55"/><rect x="13.5" y="13" width="7" height="7" rx="1.4"/></svg>' },
  { id: 'cappella', label: '群唱', stateVar: 'cappellaMode', applyFn: 'applyCappellaMode', order: 103,
    desc: '聊天歌词 · 表情包',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v9H9l-4 4v-4H4z"/><path d="M8 10.5h8" opacity=".5"/><path d="M8 13h5" opacity=".35"/></svg>' },
  { id: 'monet', label: '莫奈', stateVar: 'monetMode', applyFn: 'applyMonetMode', order: 104,
    desc: '油画海报 · 逐词轨道',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c2.5-3 4.5-4.5 6-4.5s2.6 1.8 4 1.8 2.8-1.5 4.5-4.3"/><path d="M3.5 20.5l1.8-2M8 21l1.4-1.6" opacity=".45"/><circle cx="17.2" cy="7.2" r="2.4" opacity=".7"/></svg>' },
  { id: 'diorama', label: '镜台', stateVar: 'dioramaMode', applyFn: 'applyDioramaMode', order: 105,
    desc: '圆窗景深 · 柔光字',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.4" opacity=".55"/><path d="M8.4 8.4L4.2 4.2M15.6 15.6l4.2 4.2" opacity=".4"/></svg>' },
  { id: 'sonnet', label: '商籁', stateVar: 'sonnetMode', applyFn: 'applySonnetMode', order: 106,
    desc: '聚光灯 · 诗稿层叠',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3.4M5.6 6.2l2 2.4M18.4 6.2l-2 2.4"/><circle cx="12" cy="15" r="5.6" opacity=".55"/><path d="M4 21l3-4.6M20 21l-3-4.6" opacity=".4"/></svg>' },
  { id: 'tempera', label: '凝彩', stateVar: 'temperaMode', applyFn: 'applyTemperaMode', order: 107, trimCache: 'trimTemperaSpriteCache',
    desc: '剪纸色块 · 拼贴构图',
    lazy: true, storeKey: 'orangesea-tempera-v1', src: ['js/modules/10-shell/27-tempera.js'],
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.4" cy="9" r="4.4"/><rect x="11.6" y="9.6" width="8" height="6" rx="1.4" transform="rotate(-8 15.6 12.6)" opacity=".75"/><path d="M4 18.4h10" opacity=".5"/></svg>' },
  { id: 'lumiere', label: '绘光', stateVar: 'lumiereMode', applyFn: 'applyLumiereMode', order: 108,
    desc: '霓虹光丝 · 星尘',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8c4-3 7 3 11 0s5-2 7-1"/><path d="M3 15c4-3 7 3 11 0s5-2 7-1" opacity=".55"/><circle cx="7" cy="6" r="1" fill="currentColor"/><circle cx="17" cy="12" r="1" fill="currentColor"/><circle cx="10" cy="19" r="1" fill="currentColor"/></svg>' }
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

// 覆盖层退出后延迟释放重缓存（entry.trimCache 指向模式模块暴露的清理函数）。
// 延迟 2s 且复查未重新激活：快速 A→B→A 往返不触发重建；缓存缺失时模式进入侧按现有逻辑自然重建。
function scheduleOverlayCacheTrim(entry) {
  if (!entry || !entry.trimCache || typeof window === 'undefined') return;
  setTimeout(function () {
    if (overlayModeIsActive(entry)) return;
    var trim = window[entry.trimCache];
    if (typeof trim === 'function') {
      try { trim(); } catch (e) { console.warn('[VisualizerRegistry] trimCache failed: ' + entry.id, e); }
    }
  }, 2000);
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
      /* 退场交叉淡化（91 协调器）：同步续命，0 延迟无白闪 */
      if (typeof beginOverlayExitTransition === 'function') {
        try { beginOverlayExitTransition(entry); } catch (e) { }
      }
      scheduleOverlayCacheTrim(entry);
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
      /* 退场交叉淡化（91 协调器）：同步续命，0 延迟无白闪 */
      if (typeof beginOverlayExitTransition === 'function') {
        try { beginOverlayExitTransition(entry); } catch (e) { }
      }
      scheduleOverlayCacheTrim(entry);
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

// 懒加载模式模块（entry.lazy 协议）：src 列表 fetch → 内联 script 注入（同步执行，
// 与主 loader 同范式）。模块顶层 var/function 声明挂 window，stateVar 出现即视为已加载。
// inflight 去重防双击竞态双注入；失败静默降级（卡片点击无效并 console 警告，不影响其它模式）。
var overlayModuleInflight = {};
function ensureOverlayModeLoaded(entry, cb) {
  cb = cb || function () {};
  if (!entry || !entry.lazy || typeof window === 'undefined' || typeof document === 'undefined' || typeof fetch === 'undefined') { cb(); return; }
  if (window[entry.stateVar] !== undefined) { cb(); return; }
  if (overlayModuleInflight[entry.id]) {
    overlayModuleInflight[entry.id].then(function () { cb(); }, function () { cb(); });
    return;
  }
  var srcs = entry.src || [];
  if (!srcs.length) { cb(); return; }
  var bust = '?v=' + Math.floor(Date.now() / 60000);   /* 分钟级 cache-bust，与主 loader 同思路 */
  overlayModuleInflight[entry.id] = Promise.all(srcs.map(function (p) {
    return fetch(p + bust).then(function (res) {
      if (!res.ok) throw new Error('lazy overlay module load failed: ' + p + ' (' + res.status + ')');
      return res.text();
    });
  })).then(function (texts) {
    delete overlayModuleInflight[entry.id];
    if (window[entry.stateVar] !== undefined) return;   /* 已被其它路径注入 */
    var s = document.createElement('script');
    s.text = texts.join('\n') + '\n//# sourceURL=overlay-' + entry.id + '.js\n';
    document.head.appendChild(s);   /* 无 src 的内联 script 同步执行 */
  }).catch(function (err) {
    delete overlayModuleInflight[entry.id];
    if (typeof console !== 'undefined') console.warn('[VisualizerRegistry] lazy module load failed: ' + entry.id, err);
  }).then(function () { cb(); });
}

// 通用切换入口：预设网格卡片 onclick 统一走这里（替代 19 个 per-mode toggle 直连）。
// 各模式模块的 toggleXxxMode 保留为转发 wrapper，存量调用点（底栏按钮/快捷键）不动。
// lazy 模式先 ensure 模块加载（首次点击多一次本地 fetch，由 0.7s 入场动画吸收）。
function toggleVisualizerOverlay(id) {
  var entry = getVisualizerOverlayMode(id);
  if (!entry) return;
  ensureOverlayModeLoaded(entry, function () {
    if (typeof window === 'undefined') return;
    var apply = window[entry.applyFn];
    if (typeof apply !== 'function') return;
    apply(!overlayModeIsActive(entry), { save: true, toast: true });
  });
}

// 覆盖层歌词模式统一字号缩放（fx.lyricScale 0.35~1.65，「歌词大小」设置联动）。
// 各模式 CSS 主行字号已乘 var(--mfs, 1)，模式进入/字号变更时调本函数写 overlay 变量。
function overlayModeFontScale() {
  try {
    var v = Number(fx && fx.lyricScale);
    return isFinite(v) ? Math.max(0.35, Math.min(1.65, v)) : 1;
  } catch (e) { return 1; }
}
function applyOverlayModeFontScale(overlayEl) {
  if (!overlayEl) return;
  try { overlayEl.style.setProperty('--mfs', String(overlayModeFontScale())); } catch (e) { }
}

// 懒加载模式启动恢复：上次偏好为激活时，启动后空闲预载模块（模块尾部的
// scheduleUiWarmTask 恢复段会自动 apply(true) 还原现场）。判定读 localStorage
// 原始值（'1'，与 readBooleanPreference 同语义）——模块未加载时 stateVar 尚不存在，
// 只能以存储键为准。setTimeout 延后到拼接脚本整体执行完之后。
function restoreLazyOverlayModes() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  for (var i = 0; i < VISUALIZER_OVERLAY_MODES.length; i++) {
    var entry = VISUALIZER_OVERLAY_MODES[i];
    if (!entry.lazy || !entry.storeKey) continue;
    var on = false;
    try { on = localStorage.getItem(entry.storeKey) === '1'; } catch (e) { }
    if (on && window[entry.stateVar] === undefined) ensureOverlayModeLoaded(entry);
  }
}
if (typeof window !== 'undefined') {
  setTimeout(restoreLazyOverlayModes, 900);
}
