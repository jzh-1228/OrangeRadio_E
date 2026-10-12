/* =========================================================================
   fume 渲染核心 —— Folia VisualizerFume / useFumeCanvasStage 的无构建忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     src/components/visualizer/fume/VisualizerFume.tsx（组件树宿主等价）
     src/components/visualizer/fume/useFumeCanvasStage.ts（canvas 舞台）
     src/components/visualizer/runtime.ts（getRecentCompletedLine/getUpcomingLines）
     src/components/visualizer/VisualizerShell.tsx（壳：字体/字重 inline）
     src/components/visualizer/VisualizerSubtitleOverlay.tsx（底部字幕，含
       SECONDARY_TRACK_* 双行栈与 upcoming 预览，逐样式同构）
     src/utils/lyrics/alternateText.ts + subtitleTrackStyle.ts（闭包 CM_*）
     src/types.ts:435-455（FumeTuning / DEFAULT_FUME_TUNING）
     fume 闭包（管线 tsc 转译 + CM_* 别名）：fumeMath/fumeTextStyle/
       fumeTextMeasure/fumeReveal/fumeCamera/fumeCameraStep/fumeBlockFrame/
       fumeCanvasText/fumeLiveRaster/fumeArticleLayout/fumeStage/FumeBackground
       —— 布局/相机/绘制算法与常量与源码逐函数同构，不在本段重写。

   结构对应（React → 无构建 DOM，行号指 VisualizerFume.tsx）：
     VisualizerShell(:126-134)     → fm-shell（fontFamily/fontWeight inline）
     viewport div(:314)            → fm-viewport（relative z-10 w/h-full）
     canvas motion.div(:316-331)   → fm-canvasWrap（article 有内容或无歌词时渲染；
       animate scale hasPrinted?1:0.985 transition .45 easeOut → CSS transition
       cubic-bezier(0,0,0.58,1)（framer tween 数值等价）+ translateX(-50%) 组合）
     pending 卡(:333-375)          → fm-pending（inset-0 居中；Hourglass SVG + 三条
       animate-pulse bar，主题色 inline；AnimatePresence 淡入淡出 0.3 缺省 tween
       → opacity transition；pulse keyframes 由引擎注入 <style>，fume.css 零动画）
     article 构建管线(:150-195)    → fmScheduleArticleBuild（rAF+setTimeout 96ms
       debounce + version guard + lastFumeLayoutCache 模块级缓存）
     runtime memo(:105-118)        → fmRuntime（currentLineIndex/lines 变化重算）
     tuning 合成(:119-148)         → fumeResolveTuning + fmLayoutTheme/fmLayoutTuning
     舞台 useFumeCanvasStage       → FumeStageRun（逐行同构：SNAPSHOT_IDLE_MS 15s、
       静态块快照缓存 Map、CM_FumeLiveRaster、draw 循环、releaseSnapshots）
     subtitle(:378-395 + VisualizerSubtitleOverlay) → fmRenderSubtitle（
       resolveVisualizerSubtitleOverlayContent 语义 + scaleFontSize 正则 + 
       SECONDARY_TRACK_* 双行栈 + upcoming blur 预览，逐样式同构）

   MineRadio 宿主差异（数据源在桥）：
     · currentLineIndex prop → 桥传 findStageLyricIndexAtTime 权威语义 fn；
     · seed prop → 桥传歌 seed（背景几何场景种子）；
     · audioPower/audioBands MV → 桥 duck-type {get}（Folia 0..255 语义，
       bands 3 槽映射 5 band，见桥注释）；
     · usePlayerSubtitleBottomPx → 宿主底栏几何 132px（classic/tilt 同款）；
     · 无调参面板 → DEFAULT_FUME_TUNING 原值（桥可传 opts.tuning 覆盖）；
     · 无 i18n / romanization / alternateTexts → resolveSubtitleContentMode
       走闭包原函数，轨道解析走 CM_ResolveLyricSubtitleTracks 原函数。
   ========================================================================= */

/* ---------- tuning（types.ts:446-455 原值） ---------- */
var FUME_DEFAULT_TUNING = {
  hidePrintSymbols: false,
  disableGeometricBackground: true,
  backgroundObjectOpacity: 0.5,
  textHoldRatio: 1,
  cameraTrackingMode: 'smooth',
  cameraSpeed: 1,
  glowIntensity: 1,
  heroScale: 1
};

/* resolvedFumeTuning（VisualizerFume.tsx:119-134 同构：clamp 边界原值） */
function fumeResolveTuning(tuning) {
  var t = tuning || {};
  var tracking = t.cameraTrackingMode === 'stepped' || t.cameraTrackingMode === 'smooth'
    ? t.cameraTrackingMode
    : FUME_DEFAULT_TUNING.cameraTrackingMode;
  return {
    hidePrintSymbols: t.hidePrintSymbols != null ? t.hidePrintSymbols : FUME_DEFAULT_TUNING.hidePrintSymbols,
    disableGeometricBackground: t.disableGeometricBackground != null ? t.disableGeometricBackground : FUME_DEFAULT_TUNING.disableGeometricBackground,
    backgroundObjectOpacity: CM_FumeClamp(t.backgroundObjectOpacity != null ? t.backgroundObjectOpacity : FUME_DEFAULT_TUNING.backgroundObjectOpacity, 0, 1),
    textHoldRatio: CM_FumeClamp(t.textHoldRatio != null ? t.textHoldRatio : FUME_DEFAULT_TUNING.textHoldRatio, 0, 1),
    cameraTrackingMode: tracking,
    cameraSpeed: CM_FumeClamp(t.cameraSpeed != null ? t.cameraSpeed : FUME_DEFAULT_TUNING.cameraSpeed, 0.55, 1.85),
    glowIntensity: CM_FumeClamp(t.glowIntensity != null ? t.glowIntensity : FUME_DEFAULT_TUNING.glowIntensity, 0, 1.8),
    heroScale: CM_FumeClamp(t.heroScale != null ? t.heroScale : FUME_DEFAULT_TUNING.heroScale, 0.82, 1.32)
  };
}

/* ---------- runtime.ts（getRecentCompletedLine :35-52 / getUpcomingLines :76-86） ---------- */
function fumeGetRecentCompletedLine(lines, currentLineIndex, currentTime, getLineEndTime) {
  if (currentLineIndex !== -1 || !lines || lines.length === 0) return null;
  if (!getLineEndTime) getLineEndTime = function (l) { return l.endTime; };
  for (var i = lines.length - 1; i >= 0; i--) {
    if (currentTime > getLineEndTime(lines[i])) return lines[i];
  }
  return null;
}

function fumeGetUpcomingLines(lines, currentLineIndex, count) {
  if (currentLineIndex < 0) return [];
  return lines.slice(currentLineIndex + 1, currentLineIndex + 1 + count);
}

/* ---------- VisualizerSubtitleOverlay 语义（同构落地） ---------- */

/* hasReadableText（VisualizerSubtitleOverlay.tsx:20） */
function fumeHasReadableText(text) {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

/* resolveVisualizerSubtitleOverlayContent（:48-80 同构）。
   轨道解析走闭包 CM_ResolveLyricSubtitleTracks / CM_ResolveSubtitleContentMode 原函数。 */
function fumeResolveSubtitleOverlayContent(opts) {
  var showText = opts.showText, activeLine = opts.activeLine, recentCompletedLine = opts.recentCompletedLine,
    nextLines = opts.nextLines, hideTranslationSubtitle = opts.hideTranslationSubtitle,
    showSubtitleTranslation = opts.showSubtitleTranslation, subtitleContentMode = opts.subtitleContentMode;
  if (!showText || hideTranslationSubtitle) {
    return { shouldRenderOverlay: false, subtitleTracks: [], upcomingLines: [] };
  }
  var resolvedMode = CM_ResolveSubtitleContentMode(subtitleContentMode, showSubtitleTranslation !== false);
  var candidates = [activeLine, recentCompletedLine];
  var subtitleTracks = [];
  for (var i = 0; i < candidates.length; i++) {
    var tracks = CM_ResolveLyricSubtitleTracks(candidates[i], resolvedMode, fumeHasReadableText);
    if (tracks && tracks.length > 0) { subtitleTracks = tracks; break; }
  }
  var subtitleText = subtitleTracks.length > 0 ? subtitleTracks.map(function (t) { return t.text; }).join(' / ') : null;
  var previewLines = (nextLines || []).filter(function (l) { return fumeHasReadableText(l.fullText); });
  return {
    shouldRenderOverlay: true,
    subtitleTracks: subtitleTracks,
    upcomingLines: subtitleText ? [] : (activeLine ? previewLines : [])
  };
}

/* scaleFontSize（:117 同构：rem/vw/px 数值 × 因子） */
function fumeScaleFontSize(fontSize, factor) {
  return String(fontSize).replace(/(-?\d*\.?\d+)(rem|vw|px)/g, function (m, value, unit) {
    return (Number(value) * (factor != null ? factor : 1)).toFixed(3) + unit;
  });
}

/* getUpcomingLyricsClassName（:22-24 → truncate/max-w/blur 同款 inline） */
function fumeUpcomingLineStyle(blur) {
  return 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:42rem;margin-left:auto;margin-right:auto;' +
    'transition:all .5s ease;' + (blur !== false ? 'filter:blur(1px);' : '');
}

/* ---------- DOM 工具 ---------- */

function fumeEl(tag, className, styleText) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (styleText) el.style.cssText = styleText;
  return el;
}

/* tailwind animate-pulse 等价 keyframes（引擎注入，fume.css 零动画） */
function fumeEnsureStyle() {
  if (document.getElementById('fume-engine-style')) return;
  var s = document.createElement('style');
  s.id = 'fume-engine-style';
  s.textContent =
    '@keyframes fume-pulse{0%,100%{opacity:1}50%{opacity:.5}}' +
    '@keyframes fume-spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}

/* Hourglass（lucide v1.48.0 ISC 图标 path 原数据；VisualizerFume.tsx:348-352
   size 24 + animate-pulse + 主题色 inline） */
function fumeHourglassSvg(color) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', color);
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  var paths = ['M5 22h14', 'M5 2h14',
    'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22',
    'M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2'];
  for (var i = 0; i < paths.length; i++) {
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', paths[i]);
    svg.appendChild(p);
  }
  svg.style.animation = 'fume-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite';
  return svg;
}

/* =========================================================================
   FumeStageRun —— useFumeCanvasStage.ts:25-298 的宿主等价（hook → 显式生命周期）
   每帧一画：背景（视差/音频响应）→ 屏上逐块（waiting/passed 走静态快照、
   打印中走逐字直绘或 FumeLiveRaster）。scene/driver/paused 可热替换，
   cameraState 在 driver 内持有（重挂不丢镜头）。
   ========================================================================= */

/** A snapshot unused this long is released; it is cheap to draw again.（:23） */
var FUME_SNAPSHOT_IDLE_MS = 15000;

/** Releases snapshots idle for longer than SNAPSHOT_IDLE_MS（:290-298 同构） */
function fumeReleaseSnapshots(cache, now) {
  cache.forEach(function (entry, key) {
    if (now - entry.lastUsed <= FUME_SNAPSHOT_IDLE_MS) return;
    entry.snapshot.canvas.width = 0;
    entry.snapshot.canvas.height = 0;
    cache.delete(key);
  });
}

function FumeStageRun(canvas) {
  var context = canvas.getContext('2d');
  var staticBlockSnapshotCache = new Map();   /* :31 useRef(new Map) */
  var liveRaster = null;                      /* :32 useRef(null) */
  var rafId = 0;
  var lastFrameAt = null;
  var stopped = false;

  var scene = null;
  var driver = null;
  var paused = false;

  function restart() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    lastFrameAt = null;
    if (scene && context) draw();
  }

  var draw = function () {
    if (stopped || !scene || !driver || !context) return;
    var now = performance.now();
    var dt = lastFrameAt === null ? 1 / 60 : CM_FumeClamp((now - lastFrameAt) / 1000, 1 / 240, 0.05);
    lastFrameAt = now;

    /* canvas 尺寸自检（:98-109 每帧同构） */
    var width = Math.max(Math.floor(scene.viewport.width), 1);
    var height = Math.max(Math.floor(scene.viewport.height), 1);
    var dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    var article = scene.article;
    var theme = scene.theme;
    var viewport = scene.viewport;
    var backgroundScene = scene.backgroundScene;
    var time = driver.currentTime.get();
    var viewportCenterX = viewport.width * 0.5;
    var viewportCenterY = viewport.height * 0.5;
    var fumeBackgroundAudioLevels = CM_FumeReadAudioLevels(driver);

    /* 无文章时只画背景（:117-137 同构） */
    if (!article) {
      if (!scene.staticMode) {
        context.save();
        context.translate(viewportCenterX, viewportCenterY);
        context.translate(-backgroundScene.width * 0.5, -backgroundScene.height * 0.5);
        CM_FumeDrawBackground({
          context: context,
          scene: backgroundScene,
          theme: theme,
          time: time + now * 0.00018,
          audioLevels: fumeBackgroundAudioLevels,
          objectOpacityMultiplier: scene.backgroundObjectOpacity * 2
        });
        context.restore();
      }
      if (!paused) rafId = requestAnimationFrame(draw);
      return;
    }

    /* One-shot printed detection（:139-143） */
    var hasPrinted = false;
    if (!hasPrinted && time >= article.firstRenderableStartTime) {
      hasPrinted = true;
      driver.onPrintedContent();
    }

    var stepResult = CM_FumeStepCamera(driver.cameraState, {
      article: article,
      time: time,
      now: now,
      dt: dt,
      lineIndex: driver.getLineIndex(),
      viewport: viewport,
      overviewCamera: scene.overviewCamera,
      overviewStartTime: scene.overviewStartTime,
      cameraSpeed: scene.cameraSpeed,
      cameraTrackingMode: scene.cameraTrackingMode,
      staticMode: scene.staticMode,
      animationIntensity: theme.animationIntensity
    });
    var camera = driver.cameraState.camera;
    var screenScale = camera.scale;

    /* 背景（视差）层（:163-192 同构） */
    if (!scene.staticMode) {
      var bgView = CM_FumeResolveBackgroundView(backgroundScene, camera, viewport);
      context.save();
      context.translate(viewportCenterX, viewportCenterY);
      context.scale(bgView.backgroundScale, bgView.backgroundScale);
      context.translate(-bgView.backgroundCameraX, -bgView.backgroundCameraY);
      CM_FumeDrawBackground({
        context: context,
        scene: backgroundScene,
        theme: theme,
        time: time,
        audioLevels: fumeBackgroundAudioLevels,
        objectOpacityMultiplier: scene.backgroundObjectOpacity * 2,
        parallax: {
          cameraX: bgView.backgroundCameraX,
          cameraY: bgView.backgroundCameraY,
          originX: bgView.backgroundCenterX,
          originY: bgView.backgroundCenterY,
          strength: 0.72
        }
      });
      context.restore();
    }

    /* 相机变换（:194-197） */
    context.save();
    context.translate(viewportCenterX, viewportCenterY);
    context.scale(screenScale, screenScale);
    context.translate(-camera.x, -camera.y);

    var glowBases = CM_FumeResolveGlowBases(theme.animationIntensity, scene.glowIntensity);
    var liveParams = {
      time: time, theme: theme, glowIntensity: scene.glowIntensity,
      activeGlowBoost: glowBases.activeGlowBoost, passedGlowBase: glowBases.passedGlowBase,
      showPrintStamp: scene.showPrintStamp
    };
    var staticLayerInput = {
      time: time, theme: theme,
      passedGlowBase: glowBases.passedGlowBase,
      passedFadeDuration: scene.passedFadeDuration,
      overviewTextRestoreProgress: stepResult.overviewTextRestoreProgress,
      snapshotScale: CM_FumeClamp(window.devicePixelRatio || 1, 1, 2)
    };

    var rasterLive = CM_isGlowBlurQuantized();
    var margin = 32 / screenScale;
    var liveFrame = {
      deviceScale: screenScale * (window.devicePixelRatio || 1),
      visible: {
        left: camera.x - viewportCenterX / screenScale - margin,
        top: camera.y - viewportCenterY / screenScale - margin,
        right: camera.x + viewportCenterX / screenScale + margin,
        bottom: camera.y + viewportCenterY / screenScale + margin
      }
    };

    if (scene.showText) {
      var blocks = article.blocks;
      var _loop = function (bi) {
        var block = blocks[bi];
        if (!CM_FumeIsBlockOnScreen(block, camera, viewport)) return 'continue';

        var timing = CM_FumeResolveBlockTiming(
          block, time,
          (scene.lines[block.sourceLineIndex + 1] && scene.lines[block.sourceLineIndex + 1].startTime) || null,
          scene.textHoldRatio
        );
        var layers = CM_FumeResolveStaticLayers(block, timing, staticLayerInput, function (spec) {
          var entry = staticBlockSnapshotCache.get(spec.key);
          if (!entry) {
            var snapshot = CM_FumeCreateStaticBlockSnapshot(block, theme, spec.fill, spec.shadowBlur, spec.shadowColor);
            if (!snapshot) return undefined;
            entry = { snapshot: snapshot, lastUsed: now };
            staticBlockSnapshotCache.set(spec.key, entry);
          }
          entry.lastUsed = now;
          return entry.snapshot;
        });

        if (layers) {
          for (var li = 0; li < layers.length; li++) {
            context.globalAlpha = layers[li].alpha;
            context.drawImage(
              layers[li].snapshot.canvas,
              block.x - layers[li].snapshot.padding,
              block.y - layers[li].snapshot.padding,
              block.width + layers[li].snapshot.padding * 2,
              block.height + layers[li].snapshot.padding * 2
            );
          }
          context.globalAlpha = 1;
          return 'continue';
        }

        if (!rasterLive) {
          CM_FumeDrawLiveBlock(context, block, timing, liveParams);
          return 'continue';
        }
        if (!liveRaster) liveRaster = new CM_FumeLiveRaster();
        var image = liveRaster.draw(block, timing, liveParams, liveFrame, now);
        if (image) {
          context.drawImage(image.canvas, 0, 0, image.width, image.height, image.x, image.y, image.worldWidth, image.worldHeight);
        }
      };
      for (var bi = 0; bi < blocks.length; bi++) {
        var st = _loop(bi);
        if (st === 'continue') continue;
      }
    }
    context.restore();
    if (liveRaster) liveRaster.sweep(now);
    fumeReleaseSnapshots(staticBlockSnapshotCache, now);

    if (!paused) rafId = requestAnimationFrame(draw);
  };

  return {
    /* scene 组装/替换（React useEffect deps 重启等价：重启 rAF 循环 + 
       article/theme 变化 release 快照 :40-51） */
    setScene: function (next) {
      scene = next;
      fumeReleaseSnapshots(staticBlockSnapshotCache, Number.POSITIVE_INFINITY);
      restart();
    },
    setDriver: function (next) { driver = next; },
    setPaused: function (p) {
      var changed = !!p !== paused;
      paused = !!p;
      if (changed) restart();
    },
    stop: function () {
      stopped = true;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (liveRaster) liveRaster.clear();
      fumeReleaseSnapshots(staticBlockSnapshotCache, Number.POSITIVE_INFINITY);
    }
  };
}

/* =========================================================================
   FumeFumeEngine —— VisualizerFume.tsx 组件树的宿主等价
   opts: { host, lines, currentTime(MV), audioPower(MV), audioBands, theme,
           seed?, tuning?, lyricsFontScale?, subtitleFontScale?, showText?,
           staticMode?, paused?, hideTranslationSubtitle?, showSubtitleTranslation?,
           subtitleContentMode?, getLineIndex(fn) }
   返回 { destroy, setLines, setTheme, setFontScale, setSubtitleFontScale,
          setTuning, setSeed, setPaused, setLineIndexFn }
   ========================================================================= */

/* lastFumeLayoutCache（VisualizerFume.tsx:36-39 模块级缓存，跨实例） */
var FUME_lastLayoutCache = null;
var FUME_LAYOUT_REBUILD_DEBOUNCE_MS = 96;   /* :41 */

function FumeFumeEngine(opts) {
  fumeEnsureStyle();
  var host = opts.host;
  var lines = opts.lines || [];
  var theme = opts.theme;
  var tuning = fumeResolveTuning(opts.tuning);
  var lyricsFontScale = opts.lyricsFontScale != null ? opts.lyricsFontScale : 1;
  var subtitleFontScale = opts.subtitleFontScale != null ? opts.subtitleFontScale : 1;
  var showText = opts.showText !== false;
  var staticMode = !!opts.staticMode;
  var paused = !!opts.paused;
  var seed = opts.seed != null ? String(opts.seed) : 'fume';
  var hideTranslationSubtitle = !!opts.hideTranslationSubtitle;
  var showSubtitleTranslation = opts.showSubtitleTranslation !== false;
  var subtitleContentMode = opts.subtitleContentMode;
  var lineIndexFn = typeof opts.getLineIndex === 'function' ? opts.getLineIndex : function () { return -1; };

  var destroyed = false;
  var viewport = { width: 0, height: 0 };                 /* useState(:73) */
  var article = null;                                      /* useState(:74) */
  var isLayoutPending = false;                             /* useState(:75) */
  var hasPrintedContent = false;                           /* useState(:76) */
  var cameraState = CM_FumeCreateCameraState();            /* useRef(:70) */
  var layoutBuildVersion = 0;                              /* useRef(:71) */
  var hasResolvedArticle = false;                          /* useRef(:72) */
  var currentLineIndex = -1;                               /* currentLineIndexRef(:69) */
  var runtime = { activeLine: null, recentCompletedLine: null, nextLines: [] };  /* useMemo(:105-118) */
  var buildRafId = 0;
  var buildTimeoutId = 0;
  var resizeObserver = null;
  var tickRafId = 0;
  var subtitleKey = null;
  var subtitleOpacityKey = null;

  /* ---------- 壳（VisualizerShell :126-134 等价：字体/字重 inline） ---------- */
  var shell = fumeEl('div', 'fm-shell');
  shell.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;' +
    'font-family:' + CM_resolveThemeFontStack(theme) + ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) + ';';

  /* viewport div（:314 relative z-10 h-full w-full pointer-events-none） */
  var viewportEl = fumeEl('div', 'fm-viewport');
  viewportEl.style.cssText = 'position:relative;z-index:10;width:100%;height:100%;pointer-events:none;';
  shell.appendChild(viewportEl);
  host.appendChild(shell);

  /* ResizeObserver（:83-103 同构） */
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(function (entries) {
      var entry = entries && entries[0];
      if (!entry) return;
      var nextWidth = entry.contentRect.width;
      var nextHeight = entry.contentRect.height;
      if (viewport.width === nextWidth && viewport.height === nextHeight) return;
      viewport = { width: nextWidth, height: nextHeight };
      onLayoutInputsChanged();
    });
    resizeObserver.observe(viewportEl);
  }

  /* canvas wrapper（:316-331 motion.div：article 有内容或无歌词时渲染；
     animate opacity 1 / scale hasPrinted?1:0.985，transition .45 easeOut；
     absolute left-1/2 top-0 -translate-x-1/2，尺寸 = viewport） */
  var canvasWrap = fumeEl('div', 'fm-canvasWrap');
  canvasWrap.style.cssText = 'position:absolute;left:50%;top:0;transform:translateX(-50%);' +
    'transition:opacity .45s cubic-bezier(0,0,0.58,1),transform .45s cubic-bezier(0,0,0.58,1);display:none;';
  var canvas = document.createElement('canvas');
  canvas.className = 'fm-canvas';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  canvasWrap.appendChild(canvas);
  viewportEl.appendChild(canvasWrap);

  /* pending 卡（:333-375 同构：inset-0 居中，AnimatePresence 淡入淡出 → opacity transition） */
  var pendingLayer = fumeEl('div', 'fm-pendingLayer');
  pendingLayer.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;opacity:0;transition:opacity .3s cubic-bezier(0,0,0.58,1);z-index:12;';
  var pendingCard = fumeEl('div', 'fm-pending');
  pendingCard.style.cssText = 'display:flex;min-width:160px;flex-direction:column;align-items:center;gap:16px;padding:20px 24px;border-radius:24px;border:1px solid ' +
    CM_colorWithAlpha(theme.secondaryColor, 0.24) + ';background-color:' + theme.backgroundColor + ';' +
    'box-shadow:0 18px 60px ' + CM_colorWithAlpha(theme.backgroundColor, 0.52) + ';';
  pendingCard.appendChild(fumeHourglassSvg(CM_colorWithAlpha(theme.primaryColor, 0.78)));
  var barsWrap = fumeEl('div');
  barsWrap.style.cssText = 'display:flex;width:112px;flex-direction:column;gap:10px;';
  var barSpecs = [
    { w: '100%', color: CM_colorWithAlpha(theme.primaryColor, 0.32) },
    { w: '78%', color: CM_colorWithAlpha(theme.primaryColor, 0.22) },
    { w: '56%', color: CM_colorWithAlpha(theme.secondaryColor, 0.2) }
  ];
  for (var b = 0; b < barSpecs.length; b++) {
    var bar = fumeEl('div');
    bar.style.cssText = 'height:8px;border-radius:9999px;width:' + barSpecs[b].w +
      ';background-color:' + barSpecs[b].color + ';animation:fume-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite;';
    barsWrap.appendChild(bar);
  }
  pendingCard.appendChild(barsWrap);
  pendingLayer.appendChild(pendingCard);
  viewportEl.appendChild(pendingLayer);

  /* 底部字幕（VisualizerSubtitleOverlay 等价；bottom 走宿主底栏几何 132px） */
  var sub = fumeEl('div', 'fm-sub');
  sub.style.cssText = 'position:absolute;left:0;right:0;bottom:132px;text-align:center;padding:0 16px;z-index:20;pointer-events:none;opacity:0;transform:translateY(20px);transition:opacity .24s cubic-bezier(0,0,0.58,1),transform .24s cubic-bezier(0,0,0.58,1);';
  shell.appendChild(sub);

  /* ---------- 舞台（useFumeCanvasStage 等价） ---------- */
  var stage = FumeStageRun(canvas);

  /* ---------- tuning/主题合成（:119-148 同构） ---------- */
  function layoutTheme() {
    return {
      name: theme.name,
      fontStyle: theme.fontStyle,
      fontFamily: theme.fontFamily,
      fontFamilyStack: theme.fontFamilyStack,
      fontWeight: theme.fontWeight
    };
  }
  function layoutFumeTuning() {
    var t = FUME_DEFAULT_TUNING;
    return {
      hidePrintSymbols: t.hidePrintSymbols,
      disableGeometricBackground: t.disableGeometricBackground,
      backgroundObjectOpacity: t.backgroundObjectOpacity,
      textHoldRatio: t.textHoldRatio,
      cameraTrackingMode: t.cameraTrackingMode,
      cameraSpeed: t.cameraSpeed,
      glowIntensity: t.glowIntensity,
      heroScale: tuning.heroScale
    };
  }

  /* ---------- article 构建管线（:150-195 同构：rAF + setTimeout debounce） ---------- */
  function scheduleArticleBuild() {
    if (destroyed) return;
    layoutBuildVersion += 1;
    var requestVersion = layoutBuildVersion;

    if (viewport.width <= 0 || viewport.height <= 0 || lines.length === 0) {
      hasResolvedArticle = false;
      article = null;
      isLayoutPending = false;
      applyLayoutUi();
      scheduleScene();
      return;
    }

    isLayoutPending = true;
    applyLayoutUi();

    var delay = hasResolvedArticle ? FUME_LAYOUT_REBUILD_DEBOUNCE_MS : 0;
    buildRafId = requestAnimationFrame(function () {
      buildTimeoutId = setTimeout(function () {
        if (layoutBuildVersion !== requestVersion) return;
        var lt = layoutTheme();
        var lft = layoutFumeTuning();
        var cacheKey = CM_FumeBuildLayoutCacheKey(lines, viewport, lt, lyricsFontScale, lft);
        var nextArticle = FUME_lastLayoutCache && FUME_lastLayoutCache.key === cacheKey
          ? FUME_lastLayoutCache.article
          : CM_FumeBuildArticleLayout(lines, viewport, lt, lyricsFontScale, lft);
        if (layoutBuildVersion !== requestVersion) return;
        FUME_lastLayoutCache = { key: cacheKey, article: nextArticle };
        hasResolvedArticle = nextArticle !== null;
        article = nextArticle;
        isLayoutPending = false;
        /* hasPrintedContent reset on article（:242-245） */
        hasPrintedContent = false;
        applyLayoutUi();
        scheduleScene();
      }, delay);
    });
  }

  function onLayoutInputsChanged() {
    scheduleArticleBuild();
  }

  /* canvas wrapper / pending 显隐（:315-331 + :333-375 JSX 等价） */
  function applyLayoutUi() {
    var wantCanvas = article !== null || lines.length === 0;
    canvasWrap.style.display = wantCanvas ? 'block' : 'none';
    if (wantCanvas) {
      canvasWrap.style.width = viewport.width + 'px';
      canvasWrap.style.height = viewport.height + 'px';
      /* animate scale：article && showText ? (hasPrinted?1:0.985) : 1 */
      var targetScale = article && showText ? (hasPrintedContent ? 1 : 0.985) : 1;
      canvasWrap.style.transform = 'translateX(-50%) scale(' + targetScale + ')';
    }
    pendingLayer.style.display = isLayoutPending ? 'flex' : 'none';
    pendingLayer.style.opacity = isLayoutPending ? '1' : '0';
  }

  /* ---------- runtime（:105-118 useMemo 语义：currentLineIndex/lines 变化重算，
     currentTime 快照取自 MV.get()） ---------- */
  function recomputeRuntime() {
    var activeLine = lines[currentLineIndex] != null ? lines[currentLineIndex] : null;
    var timeNow = opts.currentTime.get();
    runtime = {
      activeLine: activeLine,
      recentCompletedLine: fumeGetRecentCompletedLine(lines, currentLineIndex, timeNow, CM_getLineRenderEndTime),
      nextLines: fumeGetUpcomingLines(lines, currentLineIndex, 2)
    };
  }

  /* ---------- lastRenderableLine / overviewStartTime（:196-213 同构） ---------- */
  function computeOverviewStartTime() {
    var lastRenderableLine = null;
    for (var i = lines.length - 1; i >= 0; i--) {
      var line = lines[i];
      if (line && String(line.fullText || '').trim().length) { lastRenderableLine = line; break; }
    }
    if (!lastRenderableLine) return Number.POSITIVE_INFINITY;
    var lineStartTime = lastRenderableLine.startTime;
    var lineRenderEndTime = CM_getLineRenderEndTime(lastRenderableLine);
    return lineStartTime + Math.max(lineRenderEndTime - lineStartTime, 0) * 0.5;
  }

  /* ---------- stageScene 组装（:247-281 同构） ---------- */
  function buildScene() {
    var articleWidth = article ? article.width : Math.max(viewport.width * 1.8, viewport.width);
    var articleHeight = article ? article.height : Math.max(viewport.height * 1.8, viewport.height);
    return {
      article: article,
      lines: lines,
      theme: theme,
      viewport: viewport,
      backgroundScene: CM_FumeBuildBackgroundScene({
        viewport: viewport,
        world: { width: articleWidth, height: articleHeight },
        paperBounds: article ? article.paperBounds : undefined,
        seed: seed + ':' + theme.name
      }),
      overviewCamera: article ? CM_FumeResolveArticleOverviewCamera(article, viewport) : null,
      overviewStartTime: computeOverviewStartTime(),
      passedFadeDuration: CM_FumeResolvePassedFadeDuration(lines, tuning.textHoldRatio),
      cameraSpeed: tuning.cameraSpeed,
      cameraTrackingMode: tuning.cameraTrackingMode,
      glowIntensity: tuning.glowIntensity,
      backgroundObjectOpacity: tuning.backgroundObjectOpacity,
      showPrintStamp: !tuning.hidePrintSymbols,
      textHoldRatio: tuning.textHoldRatio,
      showText: showText,
      staticMode: staticMode
    };
  }

  var stageDriver = {
    currentTime: opts.currentTime,
    audioPower: opts.audioPower,
    audioBands: opts.audioBands,
    cameraState: cameraState,
    getLineIndex: function () { return currentLineIndex; },
    onPrintedContent: function () {
      if (hasPrintedContent) return;
      hasPrintedContent = true;
      applyLayoutUi();
    }
  };

  function scheduleScene() {
    if (destroyed) return;
    stage.setScene(buildScene());
  }

  /* ---------- 字幕（VisualizerSubtitleOverlay :82-219 同构） ---------- */
  /* translationFontSize / upcomingFontSize（VisualizerFume.tsx:239-240 原式） */
  function translationFontSize() {
    return 'clamp(' + (1.05 * lyricsFontScale).toFixed(3) + 'rem, ' + (2.2 * lyricsFontScale).toFixed(3) + 'vw, ' + (1.2 * lyricsFontScale).toFixed(3) + 'rem)';
  }
  function upcomingFontSize() {
    return 'clamp(' + (0.875 * lyricsFontScale).toFixed(3) + 'rem, ' + (1.8 * lyricsFontScale).toFixed(3) + 'vw, ' + (1 * lyricsFontScale).toFixed(3) + 'rem)';
  }

  function fmRenderSubtitle() {
    if (destroyed) return;
    var resolvedOpacity = 0.6;                       /* opacity=0.6 缺省 + subtitleOverlayOpacity 未传 */
    var content = fumeResolveSubtitleOverlayContent({
      showText: showText,
      activeLine: runtime.activeLine,
      recentCompletedLine: runtime.recentCompletedLine,
      nextLines: runtime.nextLines,
      hideTranslationSubtitle: hideTranslationSubtitle,
      showSubtitleTranslation: showSubtitleTranslation,
      subtitleContentMode: subtitleContentMode
    });

    var tracksKey = content.subtitleTracks.map(function (t) { return t.role + ':' + t.text; }).join('|');
    var upKey = content.upcomingLines.map(function (l) { return l.startTime; }).join('|');
    var key = content.shouldRenderOverlay
      ? (tracksKey ? 't:' + tracksKey : (upKey ? 'u:' + upKey : null))
      : null;
    var opacityKey = key ? String(resolvedOpacity) : 'off';
    if (key === subtitleKey && opacityKey === subtitleOpacityKey) return;

    if (!key) {
      subtitleKey = null;
      subtitleOpacityKey = opacityKey;
      /* AnimatePresence exit（:138 opacity 0 y 20 .24 easeOut） */
      sub.style.opacity = '0';
      sub.style.transform = 'translateY(20px)';
      return;
    }
    var keyChanged = key !== subtitleKey;
    subtitleKey = key;
    subtitleOpacityKey = opacityKey;
    if (keyChanged) {
      sub.innerHTML = '';
      var outer = fumeEl('div');
      outer.style.cssText = 'position:relative;display:flex;flex-direction:column;gap:8px;';
      if (content.subtitleTracks.length > 0) {
        /* translation 分支（:148-187）：辉光底 + 行栈 */
        var box = fumeEl('div');
        box.style.cssText = 'position:relative;display:inline-block;padding:6px;' +
          'isolation:isolate;margin-left:auto;margin-right:auto;';
        var glowBg = fumeEl('div');
        glowBg.setAttribute('aria-hidden', 'true');
        glowBg.style.cssText = 'position:absolute;left:-40px;right:-40px;top:-24px;bottom:-24px;z-index:0;filter:blur(40px);pointer-events:none;' +
          'background:radial-gradient(ellipse 115% 130% at center, ' + CM_colorWithAlpha(theme.backgroundColor, 0.96) + ' 0%, ' +
          CM_colorWithAlpha(theme.backgroundColor, 0.78) + ' 62%, transparent 100%);' +
          'transform:translateZ(0);-webkit-transform:translateZ(0);-webkit-backface-visibility:hidden;';
        box.appendChild(glowBg);
        var inner = fumeEl('div');
        inner.style.cssText = 'position:relative;z-index:10;max-width:56rem;margin:0 auto;';
        var textShadow = '0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor, 0.24);
        for (var ti = 0; ti < content.subtitleTracks.length; ti++) {
          var track = content.subtitleTracks[ti];
          var isSecondaryRow = ti > 0;
          var row = fumeEl('div');
          row.style.cssText = 'color:' + theme.secondaryColor +
            ';font-size:' + fumeScaleFontSize(translationFontSize(), isSecondaryRow ? CM_SECONDARY_TRACK_SIZE_FACTOR : 1) +
            ';font-family:' + CM_resolveThemeTranslationFontStack(theme) +
            ';font-weight:' + CM_resolveThemeFontWeight(theme, isSecondaryRow ? CM_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK : 500) +
            ';' + (isSecondaryRow ? 'opacity:' + CM_SECONDARY_TRACK_OPACITY + ';margin-top:' + CM_SECONDARY_TRACK_GAP_EM + 'em;' : '') +
            'text-shadow:' + textShadow + ';';
          row.textContent = track.text;
          inner.appendChild(row);
        }
        box.appendChild(inner);
        outer.appendChild(box);
      } else if (content.upcomingLines.length > 0) {
        /* upcoming 预览分支（:188-213） */
        var upWrap = fumeEl('div');
        upWrap.style.cssText = 'position:relative;z-index:10;display:flex;flex-direction:column;gap:8px;align-items:center;';
        for (var ui = 0; ui < content.upcomingLines.length; ui++) {
          var p = fumeEl('p');
          p.style.cssText = fumeUpcomingLineStyle(true) +
            'color:' + theme.secondaryColor +
            ';font-size:' + fumeScaleFontSize(upcomingFontSize(), 1) +
            ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) +
            ';text-shadow:0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor, 0.24) + ';';
          p.textContent = content.upcomingLines[ui].fullText;
          upWrap.appendChild(p);
        }
        outer.appendChild(upWrap);
      } else {
        return;
      }
      sub.appendChild(outer);
      /* animate（:137-138）：先复位 initial 再落 animate（挂载帧语义） */
      sub.style.transition = 'none';
      sub.style.opacity = '0';
      sub.style.transform = 'translateY(20px)';
      void sub.offsetWidth;
      sub.style.transition = 'opacity .24s cubic-bezier(0,0,0.58,1),transform .24s cubic-bezier(0,0,0.58,1)';
    }
    sub.style.opacity = String(resolvedOpacity);
    sub.style.transform = 'translateY(0)';
  }

  /* ---------- 主循环（React currentLineIndex prop 更新等价：轮询行索引，
     变化时同步 ref + runtime + 字幕；:79-81 effect + :105-118 memo） ---------- */
  function tick() {
    if (destroyed) return;
    var idx = lineIndexFn();
    if (idx !== currentLineIndex) {
      currentLineIndex = idx;
      recomputeRuntime();
      fmRenderSubtitle();
    }
    tickRafId = requestAnimationFrame(tick);
  }

  /* ---------- 初始化（useEffect 挂载序：React 版 driver memo 先于 stage effect 就绪，
     这里同序——先注 driver 再进布局/场景调度） ---------- */
  stage.setDriver(stageDriver);
  stage.setPaused(paused);
  recomputeRuntime();
  fmRenderSubtitle();
  scheduleArticleBuild();
  tickRafId = requestAnimationFrame(tick);

  return {
    destroy: function () {
      destroyed = true;
      if (buildRafId) cancelAnimationFrame(buildRafId);
      if (buildTimeoutId) clearTimeout(buildTimeoutId);
      if (tickRafId) cancelAnimationFrame(tickRafId);
      if (resizeObserver) resizeObserver.disconnect();
      stage.stop();
      if (shell.parentNode) shell.parentNode.removeChild(shell);
    },
    setLines: function (next) {
      lines = next || [];
      currentLineIndex = -1;
      recomputeRuntime();
      scheduleArticleBuild();
      fmRenderSubtitle();
    },
    setTheme: function (next) {
      theme = next;
      shell.style.fontFamily = CM_resolveThemeFontStack(theme);
      shell.style.fontWeight = CM_resolveThemeFontWeight(theme, 400);
      pendingCard.style.borderColor = CM_colorWithAlpha(theme.secondaryColor, 0.24);
      pendingCard.style.backgroundColor = theme.backgroundColor;
      pendingCard.style.boxShadow = '0 18px 60px ' + CM_colorWithAlpha(theme.backgroundColor, 0.52);
      pendingCard.firstChild.setAttribute('stroke', CM_colorWithAlpha(theme.primaryColor, 0.78));
      barSpecs = [
        { w: '100%', color: CM_colorWithAlpha(theme.primaryColor, 0.32) },
        { w: '78%', color: CM_colorWithAlpha(theme.primaryColor, 0.22) },
        { w: '56%', color: CM_colorWithAlpha(theme.secondaryColor, 0.2) }
      ];
      for (var i = 0; i < barsWrap.childNodes.length; i++) {
        barsWrap.childNodes[i].style.backgroundColor = barSpecs[i].color;
      }
      scheduleArticleBuild();
      subtitleKey = null;
      fmRenderSubtitle();
    },
    setFontScale: function (n) {
      lyricsFontScale = n != null ? n : 1;
      scheduleArticleBuild();
      subtitleKey = null;
      fmRenderSubtitle();
    },
    setSubtitleFontScale: function (n) {
      subtitleFontScale = n != null ? n : 1;
      subtitleKey = null;
      fmRenderSubtitle();
    },
    setTuning: function (t) {
      tuning = fumeResolveTuning(t);
      scheduleArticleBuild();
    },
    setSeed: function (s) {
      seed = s != null ? String(s) : 'fume';
      scheduleScene();
    },
    setPaused: function (p) { paused = !!p; stage.setPaused(paused); },
    setLineIndexFn: function (fn) { lineIndexFn = typeof fn === 'function' ? fn : lineIndexFn; },
    setShowText: function (v) {
      showText = v !== false;
      scheduleScene();
      subtitleKey = null;
      fmRenderSubtitle();
    }
  };
}
