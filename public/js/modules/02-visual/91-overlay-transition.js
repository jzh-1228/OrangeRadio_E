// ============================================================
// 91-overlay-transition.js — 覆盖层转场协调器（交叉淡化 + eco 统一管理）
//
// 单一 owner 收敛三件事（替代此前 19 份模式自管样板）：
//   1) 退场交叉淡化：覆盖层退出时容器「续命」OVERLAY_EXIT_MS 做透明度淡出
//      并内联压到 z-index:4，与新模式的 0.7s 入场淡入（z-index:5）重叠成
//      交叉淡化——中间不再闪出底下保温中的主 WebGL 场景。各模式 CSS 不动，
//      续命全部走内联样式，结束逐属性清除（不碰模式自设的 --xxx-font 等变量）。
//   2) eco 质量档统一管理：activeOverlay null↔非null 边沿统一压/恢复
//      fx.performanceQuality（此前 19 个模式各存一份 xxxPrevQuality 样板）。
//   3) 退出补帧：覆盖层全部退出后置主循环 overlayCoverRenderLast = 0，
//      下一帧立即全量渲染主场景，消除切回黑窗（配合退场淡出遮丑）。
//
// 退场续命的同步路径：注册表 exitAll/exitOther 在 apply(false) 后调用
// beginOverlayExitTransition（互斥切换 0 延迟）；150ms 轮询边沿检测兜底
// 「模式自 toggle 直退」这类不经注册表 exit 的路径。reduced-motion 或
// 容器缺失时退化为原瞬时切换，任何异常不影响逻辑退出（调用方 try/catch）。
// ============================================================

var OVERLAY_EXIT_MS = 320;
var OVERLAY_EXIT_PROPS = ['display', 'z-index', 'opacity', 'transition'];
var overlayExitPending = {};   /* 模式 id → 续命清理定时器 */
var overlayEcoPrev = null;     /* 覆盖期前的质量档（null = 未压 eco） */
var overlayEdgeLastId = '';    /* 上一轮轮询的激活模式 id */

function overlayMotionReduced() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { return false; }
}

function overlayContainerFor(entry) {
  try { return document.getElementById(entry.id + '-overlay'); } catch (e) { return null; }
}

/* 清掉某模式的退场续命（重新进入同模式时调用，否则残留的内联 opacity:0
   会在入场动画结束后把容器压隐）。只移除续命写入的属性。 */
function cancelOverlayExit(entry) {
  if (!entry || !entry.id) return;
  if (overlayExitPending[entry.id]) {
    clearTimeout(overlayExitPending[entry.id]);
    delete overlayExitPending[entry.id];
  }
  var el = overlayContainerFor(entry);
  if (el && el.hasAttribute('data-leaving')) {
    el.removeAttribute('data-leaving');
    for (var i = 0; i < OVERLAY_EXIT_PROPS.length; i++) {
      try { el.style.removeProperty(OVERLAY_EXIT_PROPS[i]); } catch (e) { }
    }
  }
}

/* 退场续命：容器淡出 OVERLAY_EXIT_MS 后回归各模式 CSS 的 display:none */
function beginOverlayExitTransition(entry) {
  if (!entry || !entry.id || overlayMotionReduced()) return;
  var el = overlayContainerFor(entry);
  if (!el || el.hasAttribute('data-leaving')) return;
  el.setAttribute('data-leaving', '1');
  try {
    el.style.display = 'block';               /* body class 已撤，内联接管显示 */
    el.style.zIndex = '4';                    /* 压到入场模式（z5）之下，交叉顺序正确 */
    el.style.opacity = '1';
    el.style.transition = 'none';
    void el.offsetWidth;                      /* 落定起点后再开过渡，避免过渡被吞 */
    el.style.transition = 'opacity ' + (OVERLAY_EXIT_MS / 1000) + 's ease';
    el.style.opacity = '0';
  } catch (e) {
    el.removeAttribute('data-leaving');
    return;
  }
  overlayExitPending[entry.id] = setTimeout(function () {
    delete overlayExitPending[entry.id];
    if (el.hasAttribute('data-leaving')) {
      el.removeAttribute('data-leaving');
      for (var i = 0; i < OVERLAY_EXIT_PROPS.length; i++) {
        try { el.style.removeProperty(OVERLAY_EXIT_PROPS[i]); } catch (e) { }
      }
    }
  }, OVERLAY_EXIT_MS + 40);
}

/* eco 质量档边沿（幂等）：进入压 eco，退出恢复原档 */
function applyOverlayEco(active) {
  if (typeof fx === 'undefined' || !fx) return;
  if (active) {
    if (overlayEcoPrev === null) {
      overlayEcoPrev = fx.performanceQuality || 'balanced';
      fx.performanceQuality = 'eco';
    }
  } else if (overlayEcoPrev !== null) {
    fx.performanceQuality = overlayEcoPrev;
    overlayEcoPrev = null;
  }
}

/* 覆盖层激活/退出边沿：宿主 3D 歌词舞台整体让位与恢复。
   Folia 语义：歌词呈现归模式自己（Shell 承载）；宿主播放态视觉（含无歌词时的
   「歌名大字」兜底行）不得透过模式背景外泄。主循环在覆盖层激活期间走保温分支
   提前 return，帧内检查不可达——所以挂在这里（边沿一次，保温帧按当前状态渲染）。 */
function syncStageLyricsYield(active) {
  try {
    if (typeof stageLyrics === 'undefined' || !stageLyrics || !stageLyrics.group) return;
    stageLyrics.group.visible = !active;
  } catch (e) { }
}

/* 轮询边沿检测：激活模式 id 变化时处理 eco/续命兜底/退出补帧 */
function overlayEdgeTick() {
  var active = (typeof activeVisualizerOverlay === 'function') ? activeVisualizerOverlay() : null;
  var activeId = active ? active.id : '';
  if (activeId === overlayEdgeLastId) return;
  var prevId = overlayEdgeLastId;
  overlayEdgeLastId = activeId;
  /* 通用「覆盖层激活中」body class：主页浮层等跨模式层级规则只认这个 class，
     新增注册模式自动被覆盖（此前只有 film-radio/graffiti 两条硬编码规则）。 */
  try { document.body.classList.toggle('overlay-mode-active', !!active); } catch (e) { }
  syncStageLyricsYield(!!active);
  if (active) {
    cancelOverlayExit(active);   /* 重新进入：清掉可能挂着的退场续命 */
    applyOverlayEco(true);
  } else {
    applyOverlayEco(false);
    /* 直退后主循环下一帧立即全量补帧（overlayCoverRenderLast 定义于 11-main-loop，
       加载顺序在其之前时 typeof 守卫跳过，拼接执行后自然生效） */
    if (typeof overlayCoverRenderLast === 'number') overlayCoverRenderLast = 0;
  }
  if (prevId && typeof getVisualizerOverlayMode === 'function') {
    var prevEntry = getVisualizerOverlayMode(prevId);
    /* 兜底：互斥路径已在注册表 exit 内同步续命，这里补直退（自 toggle 关闭）路径 */
    if (prevEntry && typeof overlayModeIsActive === 'function' && !overlayModeIsActive(prevEntry)) {
      beginOverlayExitTransition(prevEntry);
    }
  }
}

if (typeof window !== 'undefined') {
  window.beginOverlayExitTransition = beginOverlayExitTransition;
  window.cancelOverlayExit = cancelOverlayExit;
  setInterval(overlayEdgeTick, 150);
}
