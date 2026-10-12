/* =========================================================================
   monet 渲染核心 —— Folia monet 组件树的无构建 DOM 忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     src/components/visualizer/monet/VisualizerMonet.tsx（海报构图 :139-539）
     src/components/visualizer/monet/MonetLyricsRail.tsx（竖向逐词轨道 :85-1075）
     src/components/visualizer/monet/MonetPortraitImage.tsx（封面 crossfade 栈）
     src/components/visualizer/monet/MonetFloatingDecor.tsx（漂浮粒子）
     src/components/visualizer/monet/AudioOverlay.tsx（底部音频条 canvas）
     src/components/visualizer/runtime.ts（当前行/最近完成行/预览行 :35-86）
     src/components/visualizer/backgrounds/monet/MonetBackgroundLayer.tsx
       （full-overlay 海报背景层 :21-179 + monetBackgroundDrift 轨道）
     src/utils/appPlaybackHelpers.ts:21（findLatestActiveLineIndex 宿主语义）
     src/types.ts:1003/1066（DEFAULT_MONET_BACKGROUND_TUNING / DEFAULT_MONET_TUNING）

   结构对应（React → 无构建 DOM）：
     VisualizerShell        → mn-shell（fontFamily/fontWeight inline，Shell:128-134）
     MonetBackgroundLayer   → mn-bg（full-overlay：drift wrapper(WAAPI 噪声轨道)
                               + 背景 crossfade(0.8s) + readability 渐变）
     MonetFloatingDecor     → mn-decor（10 粒子，无主题 lyricsIcons → 全樱花瓣，
                               mm Infinity keyframes）
     AnimatePresence(rail)  → 行池 diff（新行 initial→animate spring 入场，
                               移除行 exit 后延时移除，已有行目标变化 spring 续跑）
     MonetWordSweep         → mn-sweep（基底色 span + 逐帧派生的 mask/gradient/
                               glow 三层，currentTime MV 驱动——useTransform 等价）
     字幕轨（行内翻译）     → mn-track（active 行下方按 measured box 渲染，
                               stagger 0.04s）
     AudioOverlay           → mn-audio canvas（独立绘制函数，引擎主循环每帧驱动）
     introKey 重挂          → intro 重放（换歌/回绕 → 各元素 mm initial→animate；
                               相框列按 :322-330 注释刻意不重挂）

   动画全部经 mini-motion（framer 子集）驱动；spring 用 MONET_SCROLL_SPRING
   (142,28,0.82)/MONET_SCALE_SPRING(150,30,0.78) 原值。MineRadio 宿主差异
   （桥注明）：无 calm/chaotic 强度档（按 normal，相框漂浮分支保留但静止）；
   无主题词色表（wordColors=[]，着色回退 accent）；无编辑态拖拽持久化
   （hanger 编辑/拖拽/复位交互保留，offset 不落存储）。
   ========================================================================= */

/* ---------- tuning（types.ts:1003-1017 / :1066-1075 原值） ---------- */
var MONET_DEFAULT_TUNING = {
  keywordColoringEnabled: true,
  showDescription: true,
  showAudioVisualization: true,
  audioStyle: 'bar',
  fontScale: 1.2,
  portraitSource: 'cover',
  portraitOffsetX: 0,
  portraitStyle: 'square',
  showPortraitDragHanger: true
};

var MONET_DEFAULT_BACKGROUND_TUNING = {
  backgroundSource: 'cover-derived',
  backgroundLayout: 'full-overlay',
  backgroundBlurPx: 6,
  backgroundOverlayOpacity: 0.74,
  backgroundGrayscale: 0,
  backgroundSaturation: 1.05,
  backgroundWash: 0.34,
  backgroundHalfPaneOffsetX: 0,
  backgroundWashColorMode: 'theme',
  backgroundWashCustomColor: '#8fb7ff',
  backgroundDriftEnabled: true,
  backgroundDriftStrength: 0.5,
  backgroundStreaksEnabled: true
};

/* monetResolveTuning（entry.tsx:19-27 + MonetSettingsPanel :144-153 的归一化面） */
function monetResolveTuning(tuning, lyricsFontScale) {
  var t = tuning || {};
  var fontScale = (t.fontScale != null && isFinite(t.fontScale)) ? Math.min(1.5, Math.max(0.7, t.fontScale)) : MONET_DEFAULT_TUNING.fontScale;
  return {
    keywordColoringEnabled: (t.keywordColoringEnabled != null) ? !!t.keywordColoringEnabled : MONET_DEFAULT_TUNING.keywordColoringEnabled,
    showDescription: (t.showDescription != null) ? !!t.showDescription : MONET_DEFAULT_TUNING.showDescription,
    showAudioVisualization: (t.showAudioVisualization != null) ? !!t.showAudioVisualization : MONET_DEFAULT_TUNING.showAudioVisualization,
    audioStyle: t.audioStyle === 'line' ? 'line' : MONET_DEFAULT_TUNING.audioStyle,
    /* entry.tsx:26 —— fontScale × lyricsFontScale 在 renderer 边界相乘 */
    fontScale: fontScale * (lyricsFontScale != null ? lyricsFontScale : 1),
    portraitSource: t.portraitSource === 'custom' ? 'custom' : MONET_DEFAULT_TUNING.portraitSource,
    portraitOffsetX: (t.portraitOffsetX != null) ? t.portraitOffsetX : 0,
    portraitStyle: t.portraitStyle === 'rectangular' ? 'rectangular' : MONET_DEFAULT_TUNING.portraitStyle,
    showPortraitDragHanger: (t.showPortraitDragHanger != null) ? !!t.showPortraitDragHanger : MONET_DEFAULT_TUNING.showPortraitDragHanger
  };
}

/* findLatestActiveLineIndex（appPlaybackHelpers.ts:21-31）——Folia 宿主 currentLineIndex 权威语义 */
function monetFindLineIndexAtTime(lines, time) {
  for (var index = (lines ? lines.length : 0) - 1; index >= 0; index--) {
    var line = lines[index];
    if (!line || time < line.startTime) continue;
    if (time <= ((line.renderHints && line.renderHints.renderEndTime != null) ? line.renderHints.renderEndTime : line.endTime)) {
      return index;
    }
  }
  return -1;
}

/* ---------- runtime.ts 纯函数等价（:35-86） ---------- */

/* getRecentCompletedLine（runtime.ts:35-52） */
function monetGetRecentCompletedLine(lines, currentLineIndex, currentTime, getLineEndTime) {
  if (currentLineIndex !== -1 || !lines || lines.length === 0) return null;
  for (var i = lines.length - 1; i >= 0; i--) {
    if (currentTime > getLineEndTime(lines[i])) return lines[i];
  }
  return null;
}

/* getUpcomingLine / getUpcomingLines（runtime.ts:56-86） */
function monetGetUpcomingLine(lines, currentLineIndex, currentTime) {
  var activeLine = lines[currentLineIndex];
  if (activeLine) return lines[currentLineIndex + 1] || null;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].startTime > currentTime) return lines[i];
  }
  return null;
}

/* ---------- MonetLyricsRail 顶层（MonetLyricsRail.tsx:85-114 常量原值） ---------- */
var MONET_RAIL_WIDTH_FALLBACK_PX = 680;
var MONET_RAIL_HEIGHT_FALLBACK_PX = 340;
var MONET_SUBTITLE_TRACK_STAGGER_S = 0.04;
var MONET_ACTIVE_GAP_PX = 18;
var MONET_INACTIVE_GAP_PX = 14;
var MONET_RAIL_MIN_ROWS = 7;
var MONET_ACTIVE_GAP_RATIO = 0.49;
var MONET_INACTIVE_GAP_RATIO = 0.38;
var MONET_SCROLL_IDLE_RESET_MS = 1800;
var MONET_SCROLL_STEP_PX = 72;
var MONET_TOUCH_STEP_PX = 52;
var MONET_SCROLL_BEFORE = 4;
var MONET_SCROLL_AFTER = 4;
var MONET_LAYOUT_CACHE_LIMIT = 240;

/* MONET_SCROLL_TRANSITION（:106-111 原值）——CM_* 别名在闭包段注入晚于本段顶层
   执行（管线拼接顺序），故惰性单例：首次调用时 spring 原值已就绪 */
var MONET_SCROLL_TRANSITION = null;
function monetGetScrollTransition() {
  if (!MONET_SCROLL_TRANSITION) {
    MONET_SCROLL_TRANSITION = {
      y: { type: 'spring', stiffness: CM_MONET_SCROLL_SPRING.stiffness, damping: CM_MONET_SCROLL_SPRING.damping, mass: CM_MONET_SCROLL_SPRING.mass },
      scale: { type: 'spring', stiffness: CM_MONET_SCALE_SPRING.stiffness, damping: CM_MONET_SCALE_SPRING.damping, mass: CM_MONET_SCALE_SPRING.mass },
      opacity: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
      filter: { duration: 0.32, ease: [0.32, 0.72, 0, 1] }
    };
  }
  return MONET_SCROLL_TRANSITION;
}

function monetClamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function monetClampScrollSteps(steps) { return Math.max(-1, Math.min(1, steps)); }
function monetGetScrollDirection(delta) { return delta === 0 ? 0 : (delta > 0 ? 1 : -1); }

/* resolveMonetWordColor（MonetLyricsRail.tsx:116-126） */
function monetResolveWordColor(wordText, theme, fallbackColor, keywordColoringEnabled) {
  return CM_resolveWordColor(wordText, theme.wordColors, fallbackColor, {
    keywordColoringEnabled: keywordColoringEnabled !== false,
    cjkMatchMode: 'exact'
  });
}

/* MonetLineTone → resolveLineTone（:128-160 全量同构） */
function monetResolveLineTone(entry, theme, inactiveScale) {
  if (entry.status === 'active') {
    return {
      opacity: 1,
      scale: 1,
      blurPx: 0,
      baseColor: CM_colorWithAlpha(theme.primaryColor, 0.34),
      fontWeight: 600,
      zIndex: 4
    };
  }

  var distance = Math.max(Math.abs(entry.offset), 1);
  var isWaiting = entry.status === 'waiting';
  var scale = monetClamp(inactiveScale * Math.pow(0.9, distance - 1), 0.68, 0.92);

  return {
    opacity: isWaiting
      ? monetClamp(0.72 - (distance - 1) * 0.18, 0.36, 0.72)
      : monetClamp(0.52 - (distance - 1) * 0.12, 0.28, 0.52),
    scale: scale,
    blurPx: isWaiting
      ? (distance === 1 ? 0.7 : 1.8 + (distance - 2) * 0.8)
      : 1.1 + (distance - 1) * 0.7,
    baseColor: CM_colorWithAlpha(theme.primaryColor, isWaiting ? 0.46 : 0.36),
    fontWeight: 500,
    zIndex: isWaiting ? 3 - distance : 2 - distance
  };
}

/* resolveLineGap（:162-170） */
function monetResolveLineGap(previous, next, lyricFontPx) {
  return (previous.status === 'active' || next.status === 'active')
    ? Math.max(MONET_ACTIVE_GAP_PX, lyricFontPx * MONET_ACTIVE_GAP_RATIO)
    : Math.max(MONET_INACTIVE_GAP_PX, lyricFontPx * MONET_INACTIVE_GAP_RATIO);
}

/* resolveRailLineStatus（:172-180） */
function monetResolveRailLineStatus(lineIndex, activeLineIndex) {
  if (lineIndex === activeLineIndex) return 'active';
  if (activeLineIndex >= 0 && lineIndex < activeLineIndex) return 'passed';
  return 'waiting';
}

/* buildScrollableRailEntries（:182-208）——手动滚动的 ±4 窗口 */
function monetBuildScrollableRailEntries(lines, anchorIndex, activeLineIndex) {
  if (!lines || lines.length === 0) return [];
  var safeAnchorIndex = Math.round(monetClamp(anchorIndex, 0, lines.length - 1));
  var startIndex = Math.max(0, safeAnchorIndex - MONET_SCROLL_BEFORE);
  var endIndex = Math.min(lines.length - 1, safeAnchorIndex + MONET_SCROLL_AFTER);
  var nextEntries = [];
  for (var index = startIndex; index <= endIndex; index++) {
    var line = lines[index];
    nextEntries.push({
      key: index + '-' + line.startTime + '-' + line.fullText,
      line: line,
      index: index,
      offset: index - safeAnchorIndex,
      status: monetResolveRailLineStatus(index, activeLineIndex)
    });
  }
  return nextEntries;
}

/* trimOldestCacheEntry（:210-219） */
function monetTrimOldestCacheEntry(cache, limit) {
  if (cache.size < limit) return;
  var oldestKey = cache.keys().next().value;
  if (oldestKey) cache.delete(oldestKey);
}

/* getOrMeasureMonetLineLayout（:221-240） */
function monetGetOrMeasureLineLayout(cache, entry, inputs) {
  var cacheKey = CM_buildMonetLayoutCacheKey(entry, inputs);
  var cached = cache.get(cacheKey);
  if (cached) return cached;
  var layout = CM_measureMonetLineLayout({
    line: entry.line,
    status: entry.status,
    fontPx: inputs.fontPx,
    translationFontPx: inputs.translationFontPx,
    fontStack: inputs.fontStack,
    translationFontStack: inputs.translationFontStack,
    fontWeight: inputs.fontWeight,
    translationFontWeight: inputs.translationFontWeight,
    secondaryTranslationFontWeight: inputs.secondaryTranslationFontWeight,
    maxWidthPx: inputs.maxWidthPx,
    subtitleContentMode: inputs.subtitleContentMode
  });
  monetTrimOldestCacheEntry(cache, MONET_LAYOUT_CACHE_LIMIT);
  cache.set(cacheKey, layout);
  return layout;
}

/* buildPositionedEntries（:275-332 全量同构） */
function monetBuildPositionedEntries(entries, railSize, theme, lyricFontPx, inactiveFontPx, layoutInputs, glowBufferPx, layoutCache) {
  var railWidth = railSize.width || MONET_RAIL_WIDTH_FALLBACK_PX;
  var railHeight = railSize.height || MONET_RAIL_HEIGHT_FALLBACK_PX;
  var inactiveScale = monetClamp(inactiveFontPx / Math.max(lyricFontPx, 1), 0.72, 0.92);
  var contentWidthPx = Math.max(railWidth - glowBufferPx * 2, 0);
  var measureInputs = {};
  var k;
  for (k in layoutInputs) if (Object.prototype.hasOwnProperty.call(layoutInputs, k)) measureInputs[k] = layoutInputs[k];
  measureInputs.fontPx = lyricFontPx;
  measureInputs.maxWidthPx = contentWidthPx - 8;

  var measuredEntries = entries.map(function (entry) {
    var tone = monetResolveLineTone(entry, theme, inactiveScale);
    tone.fontWeight = layoutInputs.fontWeight;
    var layout = monetGetOrMeasureLineLayout(layoutCache, entry, measureInputs);
    return {
      key: entry.key, line: entry.line, index: entry.index, offset: entry.offset, status: entry.status,
      y: 0,
      tone: tone,
      layout: layout,
      scaledHeight: layout.visualHeightPx * tone.scale
    };
  });

  if (measuredEntries.length === 0) return [];

  var found = -1;
  for (var e = 0; e < measuredEntries.length; e++) {
    if (measuredEntries[e].offset === 0) { found = e; break; }
  }
  var anchorIndex = Math.max(0, found);
  var focusCenterY = railHeight * 0.46;
  measuredEntries[anchorIndex].y = focusCenterY - measuredEntries[anchorIndex].scaledHeight / 2;

  for (var index = anchorIndex + 1; index < measuredEntries.length; index++) {
    var previous = measuredEntries[index - 1];
    var current = measuredEntries[index];
    current.y = previous.y + previous.scaledHeight + monetResolveLineGap(previous, current, lyricFontPx);
  }

  for (var index2 = anchorIndex - 1; index2 >= 0; index2--) {
    var current2 = measuredEntries[index2];
    var next = measuredEntries[index2 + 1];
    current2.y = next.y - current2.scaledHeight - monetResolveLineGap(current2, next, lyricFontPx);
  }

  return measuredEntries;
}

/* getLineMask（:334-338） */
function monetGetLineMask(isClipped, fadePx) {
  return isClipped
    ? 'linear-gradient(180deg, black 0%, black calc(100% - ' + fadePx + 'px), transparent 100%)'
    : undefined;
}

/* getClippedTextMask（:346-357）——截断上下文行按最后可见文本行裁切 */
function monetGetClippedTextMask(isClipped, contentBottomPx, fadePx) {
  if (!isClipped) return undefined;
  var solidEndPx = Math.max(contentBottomPx - fadePx, 0);
  return 'linear-gradient(180deg, black 0px, black ' + solidEndPx + 'px, transparent ' + contentBottomPx + 'px)';
}

/* getEdgeFadeMask（:360-364）——超宽 token 右缘羽化 */
function monetGetEdgeFadeMask(isOverflowing, fadePx) {
  return isOverflowing
    ? 'linear-gradient(90deg, black 0%, black calc(100% - ' + fadePx + 'px), transparent 100%)'
    : undefined;
}

/* composeLineMasks（:367-384）——垂直裁切 fade 与水平边缘 fade 取交 */
function monetComposeLineMasks() {
  var layers = [];
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i]) layers.push(arguments[i]);
  }
  if (layers.length === 0) return undefined;
  var style = {
    WebkitMaskImage: layers.join(', '),
    maskImage: layers.join(', '),
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%'
  };
  if (layers.length > 1) {
    style.WebkitMaskComposite = 'source-in';
    style.maskComposite = 'intersect';
  }
  return style;
}

/* ---------- DOM 工具 ---------- */
function monetEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function monetEl(tag, className, styleText) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (styleText) el.style.cssText = styleText;
  return el;
}
function monetSetMask(el, maskStyle) {
  if (maskStyle) {
    el.style.webkitMaskImage = maskStyle.WebkitMaskImage;
    el.style.maskImage = maskStyle.maskImage;
    el.style.webkitMaskRepeat = 'no-repeat';
    el.style.maskRepeat = 'no-repeat';
    el.style.webkitMaskSize = '100% 100%';
    el.style.maskSize = '100% 100%';
    if (maskStyle.WebkitMaskComposite) {
      el.style.webkitMaskComposite = 'source-in';
      el.style.maskComposite = 'intersect';
    } else {
      el.style.webkitMaskComposite = '';
      el.style.maskComposite = '';
    }
  } else {
    el.style.webkitMaskImage = '';
    el.style.maskImage = '';
    el.style.webkitMaskComposite = '';
    el.style.maskComposite = '';
  }
}

/* ---------- MonetWordSweep（MonetLyricsRail.tsx:460-597 DOM 展开 + 逐帧派生） ----------
   framer 侧 wordStatus/wordProgress/fillWidth/maskImage/fillGradient/resolvedBaseColor/
   glowShadow 七个 useTransform 派生 MV 在此折成一个纯函数 updateSweep(t)——
   currentTime MV 每帧 emit（useMotionValueEvent 等价）后逐词重算并按值变化写 style。 */
function monetBuildSweep(text, startTime, endTime, graphemeTimings, lineRenderEndTime, lineStatus, wordColor, baseColor, fontPx, fontSpec, isChorus, fontsEpoch) {
  var graphemeOffsets = CM_measureMonetGraphemeOffsets(text, fontPx, fontSpec);

  var root = monetEl('span', null, 'position:relative;display:inline-block;white-space:pre-wrap;overflow-wrap:break-word;');

  /* 基底 span（:556-558 motion.span color=resolvedBaseColor textShadow=glowShadow） */
  var baseSpan = monetEl('span');
  baseSpan.textContent = text;
  root.appendChild(baseSpan);

  var sweep = {
    root: root, baseSpan: baseSpan, overlayOuter: null, overlayInner: null,
    text: text, startTime: startTime, endTime: endTime,
    graphemeTimings: graphemeTimings, lineRenderEndTime: lineRenderEndTime,
    lineStatus: lineStatus, lineActive: lineStatus === 'active',
    wordColor: wordColor, baseColor: baseColor,
    fontPx: fontPx, fontSpec: fontSpec, isChorus: !!isChorus,
    offsets: graphemeOffsets,
    lastColor: null, lastShadow: null, lastMask: null, lastGradient: null
  };
  if (sweep.lineActive) monetAttachSweepOverlay(sweep);
  return sweep;
}

/* overlay（:559-594 仅 isLineActive 时挂载；sweepOverflowPx = round(fontPx*0.5) :552）。
   行状态 waiting→active 迁移时按 framer 重渲染语义补挂（MonetWordSweep 条件渲染 :559）。 */
function monetAttachSweepOverlay(sweep) {
  if (sweep.overlayOuter) return;
  var sweepOverflowPx = Math.round(sweep.fontPx * 0.5);
  var overlayOuter = monetEl('span', null, 'pointer-events:none;position:absolute;left:0;right:0;display:block;white-space:pre-wrap;overflow-wrap:break-word;');
  overlayOuter.setAttribute('aria-hidden', 'true');
  overlayOuter.style.top = -sweepOverflowPx + 'px';
  overlayOuter.style.bottom = -sweepOverflowPx + 'px';
  overlayOuter.style.paddingTop = sweepOverflowPx + 'px';
  overlayOuter.style.paddingBottom = sweepOverflowPx + 'px';
  overlayOuter.style.boxSizing = 'border-box';
  overlayOuter.style.textShadow = 'none';
  overlayOuter.style.webkitMaskSize = '100% 100%';
  overlayOuter.style.maskSize = '100% 100%';
  overlayOuter.style.webkitMaskRepeat = 'no-repeat';
  overlayOuter.style.maskRepeat = 'no-repeat';
  var overlayInner = monetEl('span', null, 'display:block;white-space:pre-wrap;overflow-wrap:break-word;');
  overlayInner.style.marginTop = -sweepOverflowPx + 'px';
  overlayInner.style.paddingTop = sweepOverflowPx + 'px';
  overlayInner.style.paddingBottom = sweepOverflowPx + 'px';
  overlayInner.style.color = 'transparent';
  overlayInner.style.webkitTextFillColor = 'transparent';
  overlayInner.style.webkitBackgroundClip = 'text';
  overlayInner.style.backgroundClip = 'text';
  overlayInner.textContent = sweep.text;
  overlayOuter.appendChild(overlayInner);
  sweep.root.appendChild(overlayOuter);
  sweep.overlayOuter = overlayOuter;
  sweep.overlayInner = overlayInner;
  sweep.lastMask = null;
  sweep.lastGradient = null;
}

/* 七个 useTransform 的折叠求值（:500-545 公式原值） */
function monetUpdateSweep(sweep, latest) {
  var isLineActive = sweep.lineActive;
  var canRenderGlow = sweep.lineStatus === 'active' || sweep.lineStatus === 'passed';

  /* wordStatus（:500-502）+ resolvedBaseColor（:529-531） */
  var wordStatus = isLineActive ? CM_resolveMonetWordStatus(latest, sweep.startTime, sweep.endTime) : sweep.lineStatus;
  var color = ((isLineActive && wordStatus === 'passed') || sweep.lineStatus === 'passed')
    ? sweep.wordColor : sweep.baseColor;

  /* glowShadow（:533-545） */
  var shadow = 'none';
  if (canRenderGlow && latest > sweep.startTime) {
    var intensity = CM_resolveMonetGlow(latest, sweep.startTime, sweep.endTime, sweep.lineRenderEndTime);
    if (intensity > 0) {
      var radiusOne = Math.round(sweep.fontPx * (sweep.isChorus ? 0.45 : 0.28));
      var radiusTwo = Math.round(sweep.fontPx * (sweep.isChorus ? 0.90 : 0.65));
      var maxAlpha = sweep.isChorus ? 1.0 : 0.88;
      var glowColor = CM_mixColors(sweep.baseColor, sweep.wordColor, intensity, intensity * maxAlpha);
      shadow = '0 0 ' + radiusOne + 'px ' + glowColor + ', 0 0 ' + radiusTwo + 'px ' + glowColor;
    }
  }
  if (color !== sweep.lastColor) { sweep.baseSpan.style.color = color; sweep.lastColor = color; }
  if (shadow !== sweep.lastShadow) { sweep.baseSpan.style.textShadow = shadow; sweep.lastShadow = shadow; }

  /* overlay：maskImage（:514-522）+ fillGradient（:524-527） */
  if (sweep.overlayOuter) {
    var fillWidth = CM_resolveMonetFillWidth(latest, sweep.startTime, sweep.endTime, sweep.offsets, sweep.graphemeTimings);
    var edgeSoftness = CM_resolveMonetSweepEdgeSoftness(sweep.fontPx);
    var fullWidth = sweep.offsets[sweep.offsets.length - 1] || 0;
    var sweepEnd = CM_resolveMonetSweepEnd(fillWidth, fullWidth, edgeSoftness);
    var solidEnd = Math.max(sweepEnd - edgeSoftness, 0);
    var featherStart = Math.max(sweepEnd - edgeSoftness * 0.55, 0);
    var featherEnd = Math.max(sweepEnd, 0);
    var mask = 'linear-gradient(90deg, rgba(0, 0, 0, 1) 0px, rgba(0, 0, 0, 1) ' + solidEnd + 'px, rgba(0, 0, 0, 0.92) ' + featherStart + 'px, rgba(0, 0, 0, 0) ' + featherEnd + 'px, rgba(0, 0, 0, 0) 100%)';

    var progress;
    if (!isLineActive || latest <= sweep.startTime) progress = 0;
    else if (latest >= sweep.endTime) progress = 1;
    else progress = (latest - sweep.startTime) / Math.max(0.001, sweep.endTime - sweep.startTime);
    var fillColor = CM_mixColors(sweep.baseColor, sweep.wordColor, Math.min(progress, 1));
    var gradient = 'linear-gradient(90deg, ' + fillColor + ' 0%, ' + CM_colorWithAlpha(fillColor, 0.92) + ' 68%, ' + CM_colorWithAlpha(fillColor, 0.72) + ' 100%)';

    if (mask !== sweep.lastMask) {
      sweep.overlayOuter.style.webkitMaskImage = mask;
      sweep.overlayOuter.style.maskImage = mask;
      sweep.lastMask = mask;
    }
    if (gradient !== sweep.lastGradient) {
      sweep.overlayInner.style.backgroundImage = gradient;
      sweep.lastGradient = gradient;
    }
  }
}

/* ---------- MonetTimedTokenSpan（:386-458）——token 列表 → span 序列 ---------- */
function monetRenderTokens(container, entry, opts) {
  /* opts: { currentTime 最新值 t, accentColor, fontPx, fontStack, fontsEpoch,
             wordColorMatchers, isChorus, chorusAccentColor, renderStaticPassed,
             sweeps(收集数组), tone } */
  var tokens = CM_buildMonetDisplayTokens(entry.line);
  var wordColorRanges = CM_buildWordColorRangesFromMatchers(entry.line.fullText, opts.wordColorMatchers);
  var tokenColors = CM_resolveTokenColorMap(tokens, wordColorRanges);
  var resolvedAccentColor = (opts.isChorus && opts.chorusAccentColor)
    ? CM_mixColors(opts.accentColor, opts.chorusAccentColor, 0.48)
    : opts.accentColor;
  var lineRenderEndTime = CM_getLineRenderEndTime(entry.line);

  var wrap = monetEl('span', null, 'display:block;width:100%;min-width:0;max-width:100%;white-space:pre-wrap;overflow-wrap:break-word;');
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];
    if (opts.renderStaticPassed) {
      /* 手动滚动静态渲染（:421-431）：timed 词直接着 wordColor，无 sweep */
      var staticSpan = monetEl('span');
      staticSpan.style.color = token.timed
        ? (tokenColors.get(token.key) || resolvedAccentColor)
        : opts.tone.baseColor;
      staticSpan.textContent = token.text;
      wrap.appendChild(staticSpan);
      continue;
    }
    if (token.timed && token.startTime !== null && token.endTime !== null) {
      var sweep = monetBuildSweep(
        token.text, token.startTime, token.endTime, token.graphemeTimings,
        lineRenderEndTime, entry.status,
        tokenColors.get(token.key) || resolvedAccentColor,
        opts.tone.baseColor, opts.fontPx,
        opts.tone.fontWeight + ' ' + opts.fontPx + 'px ' + opts.fontStack,
        opts.isChorus, opts.fontsEpoch
      );
      wrap.appendChild(sweep.root);
      opts.sweeps.push(sweep);
      monetUpdateSweep(sweep, opts.t);
    } else {
      var plainSpan = monetEl('span');
      plainSpan.style.color = opts.tone.baseColor;
      plainSpan.textContent = token.text;
      wrap.appendChild(plainSpan);
    }
  }
  container.appendChild(wrap);
  return wrap;
}

/* ---------- 引擎实例 ---------- */

/**
 * MonetMonetEngine(opts) —— monet 模式渲染引擎（VisualizerMonet 组件树的宿主等价）
 * opts: { host, lines, currentTime(MV), theme, tuning?, lyricsFontScale?, coverUrl?,
 *         songTitle?, songArtist?, songAlbum?, seed?, audioPower(MV 0..255),
 *         audioBands {bass,lowMid,mid,vocal,treble(MV 0..255), spectrum(MV Uint8Array)} }
 * 返回 { destroy, setLines, setTheme, setCoverUrl, setMeta, setFontScale, setTuning }
 */
function MonetMonetEngine(opts) {
  var host = opts.host;
  var lines = opts.lines || [];
  var theme = opts.theme;
  var audioPower = opts.audioPower || { get: function () { return 0; } };
  var audioBands = opts.audioBands || null;
  var coverUrl = opts.coverUrl || null;
  var songTitle = opts.songTitle || '';
  var songArtist = opts.songArtist || '';
  var songAlbum = opts.songAlbum || '';
  var seed = opts.seed != null ? opts.seed : songTitle;
  var destroyed = false;
  var rafId = 0;
  var exitTimers = [];
  var settleTimer = 0;

  var lyricsFontScale = opts.lyricsFontScale != null ? opts.lyricsFontScale : 1;
  var subtitleFontScale = 1;
  var tuning = monetResolveTuning(opts.tuning, lyricsFontScale);

  var currentTime = opts.currentTime;
  var lastTime = null;
  var wasAtEnd = false;           /* :84-91 回绕检测 */
  var lastSongIdentifier = seed != null ? String(seed) : '';

  /* fontsEpoch（useFontsEpoch 等价：web font 就绪后测量缓存一次性失效） */
  var fontsEpoch = 0;
  var handledFontsEpoch = 0;
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready && document.fonts.ready.then) {
    document.fonts.ready.then(function () { fontsEpoch++; }).catch(function () { });
  }

  /* ---------- 尺寸派生（VisualizerMonet.tsx:139-151 原公式） ---------- */
  var shellWidth = 0;             /* useElementWidth 等价 */
  var largeScreenScale = 1;
  var lyricFontPx = 0, inactiveFontPx = 0, translationFontPx = 0;
  var rowMaxWidthPx = 0, portraitMaxPx = 0, portraitInnerMaxPx = 0;
  var titleMaxRem = '2.800', artistMaxRem = '1.800';
  var railSize = { width: 0, height: 0 };
  var layoutCache = new Map();
  /* 行池字体纪元：setTheme 换字体（fontStack 变）时推进，行池 diff 对
     poolEpoch 过期的 existing 行强制重建（buildLineEl 才写 inline
     font-family，updateLineEl 不重写字体——不重建则歌词行停留在旧字体） */
  var fontPoolEpoch = 0;
  var wordColorMatchers = [];

  function recomputeMetrics() {
    largeScreenScale = CM_resolveMonetLargeScreenScale(shellWidth > 0 ? shellWidth : undefined);
    lyricFontPx = CM_resolveClampFontPx(1.34, 2.75, 2.28) * tuning.fontScale * largeScreenScale;
    inactiveFontPx = CM_resolveClampFontPx(1.08, 2, 1.48) * tuning.fontScale * largeScreenScale;
    translationFontPx = CM_resolveClampFontPx(0.94, 1.28, 1.14) * tuning.fontScale * subtitleFontScale * largeScreenScale;
    rowMaxWidthPx = Math.round(CM_MONET_ROW_BASE_MAX_WIDTH_PX * largeScreenScale);
    portraitMaxPx = Math.round(CM_MONET_PORTRAIT_BASE_MAX_PX * largeScreenScale);
    portraitInnerMaxPx = Math.round(CM_MONET_PORTRAIT_INNER_BASE_MAX_PX * largeScreenScale);
    titleMaxRem = (2.8 * largeScreenScale).toFixed(3);
    artistMaxRem = (1.8 * largeScreenScale).toFixed(3);
    railMaxWidthPx = Math.round(CM_MONET_RAIL_BASE_MAX_WIDTH_PX * largeScreenScale);
    railMaxHeightPx = Math.round(Math.max(
      CM_MONET_RAIL_BASE_MAX_HEIGHT_PX * largeScreenScale,
      lyricFontPx * 1.18 * MONET_RAIL_MIN_ROWS
    ));
  }
  var railMaxWidthPx = 780, railMaxHeightPx = 520;
  recomputeMetrics();

  /* ---------- 壳（VisualizerShell :128-134 等价） ---------- */
  var shell = monetEl('div', 'mn-shell');
  shell.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;position:relative;font-family:' +
    CM_resolveThemeFontStack(theme) + ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) + ';';

  /* ---------- 海报背景层（MonetBackgroundLayer :21-179 full-overlay 分支） ---------- */
  var PIPELINE_DEBOUNCE_MS = 180;
  var bgOuter = monetEl('div', null, 'position:absolute;inset:0;z-index:0;overflow:hidden;');
  var bgDrift = monetEl('div');
  var bgLayers = [];              /* 背景栈（key=url crossfade） */
  var bgPipelineKey = null;
  var bgDebounceTimer = 0;
  var bgDriftAnim = null;
  bgOuter.appendChild(bgDrift);
  var bgReadability = monetEl('div');
  bgOuter.appendChild(bgReadability);
  shell.appendChild(bgOuter);

  function applyBgReadability() {
    /* readabilityGradient（:81-84） */
    bgReadability.style.cssText = 'position:absolute;inset:0;background:linear-gradient(90deg, ' +
      CM_colorWithAlpha(theme.backgroundColor, 0.18) + ' 0%, ' + CM_colorWithAlpha(theme.backgroundColor, 0.32) + ' 34%, ' +
      CM_colorWithAlpha(theme.backgroundColor, 0.66) + ' 70%, ' + CM_colorWithAlpha(theme.backgroundColor, 0.82) + ' 100%);';
  }

  function applyBgDrift() {
    /* useMonetBackgroundDrift（:30-53）：WAAPI 合成层轨道，不逐帧 JS */
    if (bgDriftAnim) { try { bgDriftAnim.cancel(); } catch (e) { } bgDriftAnim = null; }
    var strength = monetClamp(MONET_DEFAULT_BACKGROUND_TUNING.backgroundDriftStrength || 0, 0, 1);
    var enabled = MONET_DEFAULT_BACKGROUND_TUNING.backgroundDriftEnabled && strength > 0;
    bgDrift.style.willChange = enabled ? 'transform' : '';
    if (!enabled || typeof bgDrift.animate !== 'function') return;
    var track = CM_buildMonetDriftTrack(strength);
    bgDriftAnim = bgDrift.animate(track.keyframes, {
      duration: track.durationMs,
      iterations: Infinity,
      easing: 'linear'
    });
  }

  function crossfadeBackground(key, resolvedImage, blurStyle) {
    /* AnimatePresence key=url（:163-176）：新层 opacity 0→1 叠上，完成后移除旧层 */
    for (var i = 0; i < bgLayers.length; i++) {
      if (bgLayers[i].key === key) return;
    }
    var layer = monetEl('div');
    layer.style.cssText = 'position:absolute;inset:0;background-color:' + theme.backgroundColor +
      ';background-image:' + resolvedImage + ';background-size:cover;background-position:center;' + (blurStyle || '');
    layer.style.opacity = '0';
    bgDrift.appendChild(layer);
    bgLayers.push({ key: key, el: layer });
    mmApplyVariant(layer, {
      enter: { opacity: 1, transition: { duration: 0.8, ease: 'easeInOut' } }
    }, 'enter', null);
    while (bgLayers.length > 3) {
      var old = bgLayers.shift();
      if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
    }
  }

  function refreshBackground() {
    /* resolveSourceUrl（:55-63，cover-derived）+ 烘焙管线（MonetBackgroundLayer :95-125） */
    var sourceUrl = coverUrl || null;
    var resolvedImage;
    var fallbackGradient = 'linear-gradient(135deg, ' + CM_colorWithAlpha(theme.accentColor, 0.22) + ', ' +
      CM_colorWithAlpha(theme.backgroundColor, 0.96) + ' 50%, ' + CM_colorWithAlpha(theme.primaryColor, 0.18) + ')';
    var blurStyle = CM_checkCanvasFilterSupport() ? '' : 'filter:blur(' + MONET_DEFAULT_BACKGROUND_TUNING.backgroundBlurPx + 'px);-webkit-filter:blur(' + MONET_DEFAULT_BACKGROUND_TUNING.backgroundBlurPx + 'px);transform:scale(1.1) translateZ(0);';
    if (!sourceUrl) {
      crossfadeBackground('fallback', fallbackGradient, blurStyle);
      return;
    }
    resolvedImage = 'linear-gradient(135deg, ' + CM_colorWithAlpha(theme.accentColor, 0.2) + ', ' + CM_colorWithAlpha(theme.backgroundColor, 0.78) + '), url(' + sourceUrl + ')';
    crossfadeBackground(sourceUrl, resolvedImage, blurStyle);
    /* 烘焙 dataURL 就绪后覆盖（debounce 180ms 同 :21/:106-117） */
    var cacheKey = CM_getMonetBackgroundCacheKey({ coverUrl: coverUrl, monetBackgroundImage: null, theme: theme, tuning: MONET_DEFAULT_BACKGROUND_TUNING });
    if (cacheKey === bgPipelineKey) return;
    bgPipelineKey = cacheKey;
    if (bgDebounceTimer) clearTimeout(bgDebounceTimer);
    bgDebounceTimer = setTimeout(function () {
      CM_resolveMonetBackgroundDataUrl({ coverUrl: coverUrl, monetBackgroundImage: null, theme: theme, tuning: MONET_DEFAULT_BACKGROUND_TUNING })
        .then(function (url) {
          if (destroyed || !url) return;
          if (CM_getMonetBackgroundCacheKey({ coverUrl: coverUrl, monetBackgroundImage: null, theme: theme, tuning: MONET_DEFAULT_BACKGROUND_TUNING }) !== cacheKey) return;
          crossfadeBackground(url, 'url(' + url + ')', blurStyle);
        }).catch(function () { });
    }, PIPELINE_DEBOUNCE_MS);
  }

  /* ---------- 漂浮装饰（MonetFloatingDecor.tsx:45-137） ---------- */
  var decorWrap = null;
  var PARTICLE_COUNT = 10;
  function monetBuildParticles() {
    /* buildParticles（:48-65）：无主题 lyricsIcons → availableIcons=[] → 全樱花瓣 */
    var out = [];
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      out.push({
        id: i,
        x: ((i * 127 + 43) % 80) + 10,
        y: ((i * 211 + 17) % 80) + 5,
        size: 46 + ((i * 53) % 40),
        rotation: (i * 97) % 360,
        duration: 20 + ((i * 71) % 20),
        delay: ((i * 41) % 80) / 10,
        opacity: 0.06 + ((i * 31) % 12) / 100,
        reverse: i % 2 === 0
      });
    }
    return out;
  }
  function monetSakuraPetalSvg(size, color) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    var p1 = document.createElementNS(ns, 'path');
    p1.setAttribute('d', 'M12 3C14.5 5.5 16.8 9 16 14C15.2 19 13.5 21 12 21C10.5 21 8.8 19 8 14C7.2 9 9.5 5.5 12 3Z');
    p1.setAttribute('fill', color);
    var p2 = document.createElementNS(ns, 'path');
    p2.setAttribute('d', 'M12 6C12 6 11.3 10.5 11.3 14.5C11.3 17.5 12 20 12 20');
    p2.setAttribute('stroke', CM_colorWithAlpha(color, 0.35));
    p2.setAttribute('stroke-width', '0.45');
    p2.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p1);
    svg.appendChild(p2);
    return svg;
  }
  function buildDecor() {
    if (decorWrap && decorWrap.parentNode) decorWrap.parentNode.removeChild(decorWrap);
    decorWrap = monetEl('div', null, 'pointer-events:none;position:absolute;inset:0;z-index:5;overflow:hidden;');
    var petalColor = CM_colorWithAlpha(theme.secondaryColor, 0.55);
    var particles = monetBuildParticles();
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var holder = monetEl('div', null, 'position:absolute;');
      holder.style.left = p.x + '%';
      holder.style.top = p.y + '%';
      holder.appendChild(monetSakuraPetalSvg(p.size, petalColor));
      decorWrap.appendChild(holder);
      /* :113-130 keyframes（reverse 分支原值）+ duration/repeat Infinity/easeInOut/delay */
      mmApplyVariant(holder, {
        float: {
          y: p.reverse ? [-40, 60, -20, 40, -40] : [40, -60, 20, -40, 40],
          x: p.reverse ? [15, -25, 10, -20, 15] : [-15, 25, -10, 20, -15],
          rotate: [p.rotation, p.rotation + (p.reverse ? -120 : 120), p.rotation + (p.reverse ? -60 : 60), p.rotation + (p.reverse ? -180 : 180), p.rotation],
          opacity: [p.opacity * 0.6, p.opacity * 1.2, p.opacity, p.opacity * 1.3, p.opacity * 0.7],
          transition: { duration: p.duration, repeat: Infinity, ease: 'easeInOut', delay: p.delay }
        }
      }, 'float', null);
    }
  }

  /* ---------- 主构图（VisualizerMonet :192-536） ---------- */
  var main = monetEl('div');
  main.style.cssText = 'position:relative;z-index:10;display:flex;height:100%;width:100%;align-items:center;justify-content:center;overflow:hidden;';
  var row = monetEl('div');
  row.style.cssText = 'display:flex;height:100%;width:100%;flex-direction:row;align-items:center;overflow:hidden;';
  main.appendChild(row);
  shell.appendChild(main);

  /* 左文本列（:198 flex-1 flex-col justify-center px-5 py-5 sm:px-8 sm:py-6 lg:px-14 lg:py-8 2xl:px-20） */
  var textCol = monetEl('div');
  textCol.style.cssText = 'display:flex;min-height:0;min-width:0;flex:1 1 0%;flex-direction:column;justify-content:center;padding:20px;';

  /* 头部（:199-225） */
  var header = monetEl('div');
  header.style.cssText = 'margin-bottom:12px;';
  header.style.display = 'flex';
  header.style.flexDirection = 'column';
  header.style.rowGap = '6px';
  var artistEl = monetEl('div');
  artistEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:italic;color:' + CM_colorWithAlpha(theme.primaryColor, 0.96) + ';letter-spacing:0;';
  var ruleEl = monetEl('div');
  ruleEl.style.cssText = 'height:56px;width:1px;border-radius:9999px;transform-origin:center top;background:linear-gradient(180deg, ' + CM_colorWithAlpha(theme.primaryColor, 0.72) + ', transparent);';
  header.appendChild(artistEl);
  header.appendChild(ruleEl);
  textCol.appendChild(header);

  /* 标题区（:227-265） */
  var titleWrap = monetEl('div');
  var titleBox = monetEl('div');
  titleBox.style.cssText = 'margin-bottom:24px;display:flex;flex-direction:column;row-gap:4px;';
  var titleEl = monetEl('div');
  titleEl.style.cssText = 'font-weight:600;line-height:1.06;letter-spacing:0;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;padding-block:0.25em;margin-top:-0.25em;margin-bottom:-0.12em;';
  var albumEl = monetEl('div');
  albumEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;text-transform:uppercase;color:' + CM_colorWithAlpha(theme.secondaryColor, 0.84) + ';letter-spacing:0;';
  titleBox.appendChild(titleEl);
  titleBox.appendChild(albumEl);
  titleWrap.appendChild(titleBox);
  textCol.appendChild(titleWrap);

  /* 歌词轨道包裹（:267-294） */
  var railWrap = monetEl('div');
  var railEl = monetEl('div');
  railWrap.appendChild(railEl);
  textCol.appendChild(railWrap);

  /* 主题描述胶囊（:296-316） */
  var capsuleWrap = monetEl('div');
  capsuleWrap.style.cssText = 'margin-top:auto;padding-top:16px;';
  var capsuleInner = monetEl('div');
  capsuleInner.style.cssText = 'display:inline-flex;align-items:center;gap:12px;border-radius:9999px;border:1px solid ' + CM_colorWithAlpha(theme.primaryColor, 0.16) + ';background-color:' + CM_colorWithAlpha(theme.backgroundColor, 0.18) + ';color:' + CM_colorWithAlpha(theme.primaryColor, 0.9) + ';padding:8px 16px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);';
  var capsuleDot = monetEl('span');
  capsuleDot.style.cssText = 'height:10px;width:10px;border-radius:9999px;background-color:' + theme.accentColor + ';';
  var capsuleText = monetEl('span');
  capsuleText.style.cssText = 'font-size:12px;text-transform:uppercase;letter-spacing:0;';
  capsuleInner.appendChild(capsuleDot);
  capsuleInner.appendChild(capsuleText);
  capsuleWrap.appendChild(capsuleInner);
  textCol.appendChild(capsuleWrap);
  row.appendChild(textCol);

  /* ---------- 右侧相框列（:320-512；刻意不随 intro 重挂 :322-330） ---------- */
  var portraitCol = monetEl('div');
  portraitCol.style.cssText = 'display:none;min-width:0;align-items:center;justify-content:center;overflow:visible;padding:0 20px 0 12px;user-select:none;position:relative;';
  var portraitBBox = monetEl('div');
  portraitBBox.style.cssText = 'position:relative;width:100%;';
  portraitCol.appendChild(portraitBBox);

  /* 编辑态虚线框（:341-371） */
  var editBox = monetEl('div');
  editBox.style.cssText = 'position:absolute;border:2px dashed;border-radius:2.5rem;pointer-events:none;display:none;z-index:5;';
  var editReset = monetEl('button');
  editReset.type = 'button';
  editReset.setAttribute('title', '复位');
  editReset.style.cssText = 'position:absolute;top:-40px;right:0;pointer-events:auto;border-radius:9999px;padding:8px;font-size:12px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);transition:all .15s;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:500;border:1px solid;';
  editReset.textContent = '⟲';
  editBox.appendChild(editReset);
  portraitBBox.appendChild(editBox);

  /* 拖拽 motion 包装（:374-392 dragConstraints left -150 right 0 elastic 0） */
  var offsetX = 0;                 /* portraitOffsetX（MotionValue → 数值） */
  var dragWrap = monetEl('div');
  dragWrap.style.cssText = 'width:100%;position:relative;';
  portraitBBox.appendChild(dragWrap);

  /* 漂浮/静止 motion 包装（:393-418；normal → 静止分支） */
  var floatWrap = monetEl('div');
  floatWrap.style.cssText = 'position:relative;will-change:transform;transform:translateZ(0);';
  dragWrap.appendChild(floatWrap);

  /* 挂钉（:421-476 hanger） */
  var hangerEl = monetEl('div');
  hangerEl.style.cssText = 'position:absolute;top:-12px;right:32px;z-index:20;height:56px;width:12px;border-radius:9999px;cursor:pointer;transition:transform .2s;border-width:1.5px;border-style:solid;';
  var hangerHovered = false;
  hangerEl.addEventListener('mouseenter', function () { hangerHovered = true; applyHangerLook(); });
  hangerEl.addEventListener('mouseleave', function () { hangerHovered = false; applyHangerLook(); });
  floatWrap.appendChild(hangerEl);

  function applyHangerLook() {
    if (isEditingPosition) {
      hangerEl.style.animation = 'mnHangerEdit 1.5s ease-in-out infinite';
      hangerEl.style.touchAction = 'none';
    } else {
      hangerEl.style.animation = '';
      hangerEl.style.borderColor = CM_colorWithAlpha(theme.primaryColor, hangerHovered ? 0.36 : 0);
      hangerEl.style.boxShadow = '0 8px 18px ' + CM_colorWithAlpha('#000000', 0.24);
      hangerEl.style.touchAction = 'auto';
    }
  }
  /* :447-467 编辑态呼吸边框（keyframes 注入一次） */
  var hangerStyleEl = document.createElement('style');
  hangerStyleEl.textContent = '@keyframes mnHangerEdit{0%,100%{border-color:A1;box-shadow:B1}50%{border-color:A2;box-shadow:B2}}'
    .replace('A1', CM_colorWithAlpha(theme.accentColor, 0.3)).replace('A2', CM_colorWithAlpha(theme.accentColor, 1.0))
    .replace('B1', '0 0 2px ' + CM_colorWithAlpha(theme.accentColor, 0.2) + ', 0 8px 18px ' + CM_colorWithAlpha('#000000', 0.24))
    .replace('B2', '0 0 10px ' + CM_colorWithAlpha(theme.accentColor, 0.65) + ', 0 8px 18px ' + CM_colorWithAlpha('#000000', 0.24));
  document.head.appendChild(hangerStyleEl);

  /* 相框（:478-507 square / rectangular 两分支） */
  var frameEl = monetEl('div');
  floatWrap.appendChild(frameEl);

  /* MonetPortraitImage（:28-99 crossfade 层栈） */
  var portraitStack = monetEl('div');
  portraitStack.style.cssText = 'position:relative;height:100%;width:100%;';
  var portraitLayers = [];
  var portraitKeyCounter = 0;
  var portraitTargetUrl = null;

  function applyPortraitFrame() {
    frameEl.innerHTML = '';
    frameEl.appendChild(portraitStack);
    if (tuning.portraitStyle === 'square') {
      /* :480-488 aspect-square rounded-[2rem] */
      frameEl.style.cssText = 'position:relative;width:100%;aspect-ratio:1/1;overflow:hidden;border-radius:2rem;background-color:' + CM_colorWithAlpha(theme.primaryColor, 0.08) + ';';
      frameEl.style.boxShadow = '0 36px 80px ' + CM_colorWithAlpha(theme.backgroundColor, 0.45) + ', 0 20px 42px ' + CM_colorWithAlpha(theme.accentColor, 0.22) + ', 0 0 0 1px ' + CM_colorWithAlpha(theme.primaryColor, 0.06);
      floatWrap.style.width = '135.135%';
      floatWrap.style.marginLeft = '-35.135%';
    } else {
      /* :491-506 aspect-[0.74] p-1.5 rounded-[2.15rem] border + inner rounded-[1.85rem] */
      frameEl.style.cssText = 'position:relative;width:100%;aspect-ratio:0.74;padding:6px;border-radius:2.15rem;border:1px solid ' + CM_colorWithAlpha(theme.primaryColor, 0.1) + ';background-color:' + CM_colorWithAlpha(theme.backgroundColor, 0.15) + ';-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);box-shadow:0 24px 60px ' + CM_colorWithAlpha(theme.backgroundColor, 0.35) + ';';
      frameEl.style.boxShadow = '0 24px 60px ' + CM_colorWithAlpha(theme.backgroundColor, 0.35);
      var inner = monetEl('div');
      inner.style.cssText = 'width:100%;height:100%;overflow:hidden;border-radius:1.85rem;background-color:' + CM_colorWithAlpha(theme.primaryColor, 0.08) + ';';
      inner.appendChild(portraitStack);
      frameEl.appendChild(inner);
      floatWrap.style.width = '100%';
      floatWrap.style.marginLeft = '0%';
    }
    applyPortraitFrameGeometry();
  }

  function applyPortraitFrameGeometry() {
    portraitBBox.style.maxWidth = 'clamp(210px, 26vw, ' + portraitInnerMaxPx + 'px)';
    portraitCol.style.flex = '0 0 clamp(220px, 28vw, ' + portraitMaxPx + 'px)';
    /* headerMaxWidth（:158-162 原公式） */
    var bleed = tuning.portraitStyle === 'square'
      ? '0.35135 * clamp(210px, 26vw, ' + portraitInnerMaxPx + 'px) - 3rem'
      : '0px';
    var portraitShiftPx = Math.abs(Math.min(0, tuning.portraitOffsetX || 0));
    header.style.maxWidth = 'max(12rem, calc(100% - max(0px, calc(' + bleed + ')) - ' + portraitShiftPx + 'px))';
    titleWrap.style.maxWidth = header.style.maxWidth;
    applyEditBoxGeometry();
  }

  function applyEditBoxGeometry() {
    if (!isEditingPosition) { editBox.style.display = 'none'; return; }
    editBox.style.display = 'block';
    editBox.style.borderColor = CM_colorWithAlpha(theme.primaryColor, 0.24);
    editBox.style.left = tuning.portraitStyle === 'square' ? 'calc(-35.135% - 150px)' : '-150px';
    editBox.style.right = '0';
    editBox.style.top = '-12px';
    editBox.style.bottom = '-12px';
    editReset.style.backgroundColor = CM_colorWithAlpha(theme.backgroundColor, 0.86);
    editReset.style.color = theme.primaryColor;
    editReset.style.border = '1px solid ' + CM_colorWithAlpha(theme.primaryColor, 0.16);
    editReset.style.boxShadow = '0 4px 12px ' + CM_colorWithAlpha('#000000', 0.12);
  }

  var isEditingPosition = false;
  var isDragging = false;
  hangerEl.addEventListener('click', function (e) {
    e.stopPropagation();
    if (isDragging) return;
    if (!isEditingPosition) {
      isEditingPosition = true;
      applyEditBoxGeometry();
      applyHangerLook();
    } else {
      tuning.portraitOffsetX = Math.round(offsetX);
      isEditingPosition = false;
      applyEditBoxGeometry();
      applyHangerLook();
    }
  });
  editReset.addEventListener('click', function (e) {
    e.stopPropagation();
    offsetX = 0;
    dragWrap.style.transform = '';
  });
  /* drag（:374-391 drag='x' constraints left -150 right 0 elastic 0 momentum false） */
  hangerEl.addEventListener('pointerdown', function (e) {
    if (!isEditingPosition) return;
    e.preventDefault();
    var startX = e.clientX;
    var startOffset = offsetX;
    isDragging = true;
    function onMove(ev) {
      offsetX = monetClamp(startOffset + (ev.clientX - startX), -150, 0);
      dragWrap.style.transform = 'translateX(' + offsetX + 'px)';
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setTimeout(function () { isDragging = false; }, 50);  /* :385-390 延时复位防误触保存 */
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  function setPortraitTarget(url) {
    portraitTargetUrl = url || null;
    /* decode 后入栈（:32-61）：decode 失败静默保持旧封面 */
    if (!portraitTargetUrl) {
      for (var i = 0; i < portraitLayers.length; i++) {
        mmApplyVariant(portraitLayers[i].el, {
          fade: { opacity: 0, transition: { duration: CM_MONET_PORTRAIT_FADE_MS / 1000, ease: 'easeInOut' } }
        }, 'fade', null);
      }
      return;
    }
    var loader = new Image();
    loader.decoding = 'async';
    loader.src = portraitTargetUrl;
    var stackIt = function () {
      if (destroyed) return;
      portraitKeyCounter++;
      var key = 'monet-portrait-' + portraitKeyCounter;
      var currentKeys = portraitLayers.map(function (l) { return { key: l.key, src: l.src }; });
      var nextKeys = CM_pushMonetPortraitLayer(currentKeys, portraitTargetUrl, key);
      if (nextKeys === currentKeys) return;       /* :37-44 顶层重复 → push 原样返回 */
      /* 差异落地：新增层建 img（opacity 0 → fadeMs 动画），settle 定时器按 :66-76 */
      var existing = {};
      for (var e2 = 0; e2 < portraitLayers.length; e2++) existing[portraitLayers[e2].key] = portraitLayers[e2];
      var nextSet = [];
      for (var n = 0; n < nextKeys.length; n++) {
        var nk = nextKeys[n];
        if (existing[nk.key]) { nextSet.push(existing[nk.key]); continue; }
        var img = document.createElement('img');
        img.src = nk.src;
        img.decoding = 'async';
        img.alt = '';
        img.draggable = false;
        img.setAttribute('data-monet-portrait-image', '');
        img.style.cssText = 'position:absolute;inset:0;height:100%;width:100%;object-fit:cover;opacity:0;';
        portraitStack.appendChild(img);
        var rec = { key: nk.key, src: nk.src, el: img };
        nextSet.push(rec);
        mmApplyVariant(img, {
          fade: { opacity: 1, transition: { duration: CM_MONET_PORTRAIT_FADE_MS / 1000, ease: 'easeInOut' } }
        }, 'fade', null);
      }
      portraitLayers = nextSet;
      if (portraitLayers.length > 1) {
        var settlingKey = portraitLayers[portraitLayers.length - 1].key;
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(function () {
          if (destroyed) return;
          var settled = CM_settleMonetPortraitLayers(portraitLayers.map(function (l) { return { key: l.key, src: l.src }; }), settlingKey);
          var keep = {};
          for (var k3 = 0; k3 < settled.length; k3++) keep[settled[k3].key] = true;
          portraitLayers = portraitLayers.filter(function (l) {
            if (keep[l.key]) return true;
            if (l.el.parentNode) l.el.parentNode.removeChild(l.el);
            return false;
          });
        }, CM_MONET_PORTRAIT_FADE_MS);
      }
    };
    if (typeof loader.decode === 'function') loader.decode().then(stackIt, function () { });
    else loader.onload = stackIt;
  }
  row.appendChild(portraitCol);

  /* ---------- 底部音频条容器（:516-535） ---------- */
  var audioWrap = monetEl('div');
  audioWrap.style.cssText = 'position:absolute;bottom:0;left:0;z-index:20;height:40px;overflow:hidden;padding:0 20px;';
  audioWrap.style.width = 'min(450px, 55vw)';
  var audioCanvas = monetEl('canvas');
  audioCanvas.style.cssText = 'height:100%;width:100%;';
  audioWrap.appendChild(audioCanvas);
  shell.appendChild(audioWrap);

  host.appendChild(shell);

  /* ---------- AudioOverlay（AudioOverlay.tsx:16-153 常量 + 绘制原值） ---------- */
  var MONET_AUDIO_BAR_COUNT = 72;
  var MONET_AUDIO_MIN_RAW_BIN = 6;
  var audioCanvasW = 0, audioCanvasH = 0;
  var audioCtx2d = audioCanvas.getContext('2d');

  function monetBuildSpectrumAnchors(bands) {
    var bass = bands[0], lowMid = bands[1], mid = bands[2], vocal = bands[3], treble = bands[4];
    return [
      bass * 1.08,
      bass * 0.96,
      bass * 0.74 + lowMid * 0.26,
      lowMid,
      lowMid * 0.58 + mid * 0.42,
      mid,
      mid * 0.42 + vocal * 0.58,
      vocal,
      vocal * 0.48 + treble * 0.52,
      treble,
      treble * 0.82
    ].map(function (value) { return Math.max(0, Math.min(1, value)); });
  }

  function monetSampleSpectrumProfile(bands, normalizedIndex) {
    var clampedIndex = Math.max(0, Math.min(1, normalizedIndex));
    var anchors = monetBuildSpectrumAnchors(bands);
    var logIndex = Math.log10(1 + clampedIndex * 9);
    var scaledIndex = logIndex * (anchors.length - 1);
    var lowerIndex = Math.floor(scaledIndex);
    var upperIndex = Math.min(lowerIndex + 1, anchors.length - 1);
    var interpolation = scaledIndex - lowerIndex;
    var lowerValue = anchors[lowerIndex] || 0;
    var upperValue = anchors[upperIndex] != null ? anchors[upperIndex] : lowerValue;
    var interpolated = lowerValue + (upperValue - lowerValue) * interpolation;
    var contour = 0.92 +
      Math.sin(clampedIndex * Math.PI * 3.4 - Math.PI * 0.3) * 0.08 +
      Math.sin(clampedIndex * Math.PI * 9.2 + Math.PI * 0.2) * 0.035;
    return Math.max(0, Math.min(1, interpolated * contour));
  }

  function monetSampleRawSpectrumProfile(rawSpectrum, normalizedIndex) {
    if (!rawSpectrum || rawSpectrum.length <= MONET_AUDIO_MIN_RAW_BIN) return 0;
    var clampedIndex = Math.max(0, Math.min(1, normalizedIndex));
    var usableBinCount = Math.max(1, rawSpectrum.length - MONET_AUDIO_MIN_RAW_BIN);
    var mappedIndex = Math.expm1(clampedIndex * Math.log(usableBinCount + 1));
    var centerIndex = MONET_AUDIO_MIN_RAW_BIN + mappedIndex;
    var edgeSoftness = 1 - Math.abs(clampedIndex - 0.5) * 2;
    var windowRadius = Math.max(1, Math.round(5 - edgeSoftness * 3));
    var start = Math.max(MONET_AUDIO_MIN_RAW_BIN, Math.floor(centerIndex - windowRadius));
    var end = Math.min(rawSpectrum.length - 1, Math.ceil(centerIndex + windowRadius));
    var weightedSum = 0, weightTotal = 0;
    for (var index = start; index <= end; index++) {
      var distance = Math.abs(index - centerIndex);
      var weight = Math.max(0.1, 1 - distance / (windowRadius + 1));
      weightedSum += rawSpectrum[index] * weight;
      weightTotal += weight;
    }
    var averaged = weightTotal > 0 ? weightedSum / weightTotal : 0;
    var noiseFloor = 16 + (1 - clampedIndex) * 12;
    var normalized = Math.max(0, Math.min(1, (averaged - noiseFloor) / (255 - noiseFloor)));
    var power = 1.8 + (1 - clampedIndex) * 0.4;
    var processed = Math.pow(normalized, power);
    var lowFrequencyCompensation = 0.52 + clampedIndex * 0.62;
    var presenceLift = 0.92 + Math.sqrt(clampedIndex) * 0.14;
    return Math.max(0, Math.min(1, processed * lowFrequencyCompensation * presenceLift));
  }

  function monetResizeAudioCanvas() {
    if (!audioCtx2d) return;
    var rect = audioCanvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var nextWidth = Math.max(1, Math.floor(rect.width * dpr));
    var nextHeight = Math.max(1, Math.floor(rect.height * dpr));
    audioCanvasW = rect.width;
    audioCanvasH = rect.height;
    if (audioCanvas.width !== nextWidth || audioCanvas.height !== nextHeight) {
      audioCanvas.width = nextWidth;
      audioCanvas.height = nextHeight;
    }
    audioCtx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function monetAudioCurvePath(context, points) {
    if (points.length === 0) return;
    context.moveTo(points[0].x, points[0].y);
    for (var i = 0; i < points.length - 1; i++) {
      var xc = (points[i].x + points[i + 1].x) / 2;
      var yc = (points[i].y + points[i + 1].y) / 2;
      context.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    context.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }

  function drawAudio() {
    if (!audioCtx2d || audioCanvasW <= 0 || audioCanvasH <= 0) return;
    var context = audioCtx2d;
    var width = audioCanvasW, height = audioCanvasH;
    context.clearRect(0, 0, width, height);
    var raw = audioBands && audioBands.spectrum ? audioBands.spectrum.get() : null;
    if (!(raw instanceof Uint8Array)) raw = null;
    var band5 = [
      (audioBands && audioBands.bass ? audioBands.bass.get() : 0) / 255,
      (audioBands && audioBands.lowMid ? audioBands.lowMid.get() : 0) / 255,
      (audioBands && audioBands.mid ? audioBands.mid.get() : 0) / 255,
      (audioBands && audioBands.vocal ? audioBands.vocal.get() : 0) / 255,
      (audioBands && audioBands.treble ? audioBands.treble.get() : 0) / 255
    ];
    var hasRawSpectrum = raw && raw.length > MONET_AUDIO_MIN_RAW_BIN;
    var energy = Math.min(1, Math.max(0.08, (audioPower.get() || 0) / 255));
    var primaryInk = CM_colorWithAlpha(theme.primaryColor, 0.94);
    var softInk = CM_colorWithAlpha(theme.primaryColor, 0.72);
    var gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, softInk);
    gradient.addColorStop(0.5, primaryInk);
    gradient.addColorStop(1, softInk);
    context.fillStyle = gradient;
    context.strokeStyle = gradient;
    context.lineWidth = 1.5;
    context.lineCap = 'round';
    var now = performance.now();

    if (tuning.audioStyle === 'line') {
      /* :223-269 line 模式原值 */
      var points = [];
      for (var index = 0; index < MONET_AUDIO_BAR_COUNT; index++) {
        var x = (index / (MONET_AUDIO_BAR_COUNT - 1)) * width;
        var spectrumIndex = index / (MONET_AUDIO_BAR_COUNT - 1);
        var band = hasRawSpectrum ? monetSampleRawSpectrumProfile(raw, spectrumIndex) : monetSampleSpectrumProfile(band5, spectrumIndex);
        var wave = Math.sin(index * 0.24 + now * 0.004) * 0.08 + Math.sin(index * 0.68 + now * 0.0028) * 0.05;
        var envelope = Math.sin(spectrumIndex * Math.PI);
        var amplitude = energy * 0.04 + band * 0.8 + wave * 0.04;
        var y = height - Math.max(0, height * amplitude * envelope);
        points.push({ x: x, y: y });
      }
      context.beginPath();
      monetAudioCurvePath(context, points);
      context.lineTo(width, height);
      context.lineTo(0, height);
      context.closePath();
      var fillGradient = context.createLinearGradient(0, 0, 0, height);
      fillGradient.addColorStop(0, CM_colorWithAlpha(theme.primaryColor, 0.24));
      fillGradient.addColorStop(1, CM_colorWithAlpha(theme.primaryColor, 0.0));
      context.fillStyle = fillGradient;
      context.fill();
      context.beginPath();
      monetAudioCurvePath(context, points);
      context.strokeStyle = gradient;
      context.lineWidth = 2.0;
      context.stroke();
    } else {
      /* :271-284 bar 模式原值 */
      var gap = width / MONET_AUDIO_BAR_COUNT;
      for (var i2 = 0; i2 < MONET_AUDIO_BAR_COUNT; i2++) {
        var spectrumIndex2 = i2 / (MONET_AUDIO_BAR_COUNT - 1);
        var band2 = hasRawSpectrum ? monetSampleRawSpectrumProfile(raw, spectrumIndex2) : monetSampleSpectrumProfile(band5, spectrumIndex2);
        var pulse = Math.sin(i2 * 0.45 + now * 0.006) * 0.5 + 0.5;
        var envelope2 = Math.sin(spectrumIndex2 * Math.PI);
        var barHeight = height * (0.02 + (energy * 0.04 + band2 * 0.82 + pulse * 0.02) * envelope2);
        var x2 = i2 * gap + gap * 0.14;
        context.fillRect(x2, height - barHeight, Math.max(1.35, gap * 0.34), barHeight);
      }
    }
  }

  /* ---------- 歌词轨道运行时（MonetLyricsRail :782-1075 状态） ---------- */
  var lineRecs = new Map();        /* key → { root, textEl, sweeps, trackWrap, entry, applied } */
  var subtitleContentMode = 'translation';
  var manualScrollAnchorIndex = null;
  var manualScrollResetTimer = 0;
  var wheelAccumulator = 0, wheelDirection = 0;
  var touchLastY = null, touchAccumulator = 0, touchDirection = 0;
  var lastEntriesKey = '';
  var fontStack = CM_resolveThemeFontStack(theme);
  var translationFontStack = CM_resolveThemeTranslationFontStack(theme);
  var lyricFontWeight = CM_resolveThemeFontWeight(theme, 600);
  var translationFontWeight = CM_resolveThemeFontWeight(theme, 500);
  var secondaryTranslationFontWeight = CM_resolveThemeFontWeight(theme, CM_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK);

  function applyRailContainerStyle() {
    var glowBufferPx = Math.round(lyricFontPx * 1.2);
    railEl.style.cssText =
      'position:relative;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:none;' +
      'height:clamp(280px, 52vh, ' + railMaxHeightPx + 'px);' +
      'max-width:' + railMaxWidthPx + 'px;' +
      'margin-left:-' + glowBufferPx + 'px;margin-right:-' + glowBufferPx + 'px;' +
      'padding-left:' + glowBufferPx + 'px;padding-right:' + glowBufferPx + 'px;';
    railEl.style.webkitMaskImage = 'linear-gradient(to bottom, transparent 0%, black 11%, black 88%, transparent 100%)';
    railEl.style.maskImage = 'linear-gradient(to bottom, transparent 0%, black 11%, black 88%, transparent 100%)';
  }

  /* 布局输入包（:836-866 useMemo deps 的运行时等价） */
  function railLayoutInputs() {
    return {
      translationFontPx: translationFontPx,
      fontStack: fontStack,
      translationFontStack: translationFontStack,
      fontWeight: lyricFontWeight,
      translationFontWeight: translationFontWeight,
      secondaryTranslationFontWeight: secondaryTranslationFontWeight,
      subtitleContentMode: subtitleContentMode
    };
  }

  /* 单行 DOM（MonetRailLine :644-783）；noEnter：重建行不重播进场（framer 复用语义） */
  function buildLineEl(pentry, glowBufferPx, vGlowBufferPx, canSeek, disableEntryMotion, renderStaticPassed, nowT, noEnter) {
    var entry = pentry;
    var initialOffset = entry.offset >= 0 ? 34 : -34;
    var exitOffset = entry.status === 'passed' || entry.offset < 0 ? -38 : 38;
    var isActiveLine = entry.status === 'active';

    var root = monetEl('div');
    root.style.cssText = 'position:absolute;top:0;min-width:0;will-change:transform;' +
      'left:' + glowBufferPx + 'px;right:' + glowBufferPx + 'px;' +
      'height:' + entry.layout.visualHeightPx + 'px;transform-origin:left top;z-index:' + entry.tone.zIndex + ';' +
      (canSeek ? 'cursor:pointer;' : '');
    if (canSeek) {
      root.addEventListener('click', function () {
        if (typeof onLyricLineSeek === 'function') onLyricLineSeek(entry.line.startTime);
      });
    }

    /* 副歌光斑（:684-698） */
    var chorusEl = null;
    if (entry.line.isChorus) {
      chorusEl = monetEl('div');
      chorusEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:-10;border-radius:16px;filter:blur(10px);' +
        'background:radial-gradient(circle at 50% 45%, ' + CM_colorWithAlpha(theme.accentColor, 0.14) + ' 0%, ' + CM_colorWithAlpha(theme.accentColor, 0.04) + ' 55%, transparent 82%);';
      chorusEl.style.opacity = '0';
      root.appendChild(chorusEl);
    }

    /* 文本容器（:699-723） */
    var textEl = monetEl('div');
    textEl.style.cssText = 'min-width:0;overflow:hidden;pointer-events:none;box-sizing:border-box;' +
      'margin-left:-' + glowBufferPx + 'px;margin-right:-' + glowBufferPx + 'px;' +
      'padding-left:' + glowBufferPx + 'px;padding-right:' + glowBufferPx + 'px;' +
      'margin-top:-' + vGlowBufferPx + 'px;margin-bottom:-' + vGlowBufferPx + 'px;' +
      'padding-top:' + (entry.layout.textPaddingTopPx + vGlowBufferPx) + 'px;' +
      'padding-bottom:' + (entry.layout.textPaddingBottomPx + vGlowBufferPx) + 'px;' +
      'font-family:' + fontStack + ';font-size:' + lyricFontPx + 'px;font-weight:' + entry.tone.fontWeight + ';' +
      'line-height:' + entry.layout.lineHeightPx + 'px;letter-spacing:0;';
    if (!isActiveLine) {
      textEl.style.height = (entry.layout.textHeightPx + vGlowBufferPx * 2) + 'px';
    } else {
      textEl.style.height = '';
    }
    var fadePx = Math.max(lyricFontPx * 0.55, 12);
    var textMask = isActiveLine ? undefined : monetGetClippedTextMask(
      entry.layout.isTextClipped,
      vGlowBufferPx + entry.layout.textPaddingTopPx + entry.layout.textContentHeightPx,
      fadePx
    );
    var textEdgeMask = monetGetEdgeFadeMask(entry.layout.isTextOverflowingWidth, Math.max(lyricFontPx * 0.9, 24));
    monetSetMask(textEl, monetComposeLineMasks(textMask, textEdgeMask));
    textEl.style.textShadow = entry.status === 'active'
      ? '0 14px 34px ' + CM_colorWithAlpha(theme.backgroundColor, 0.22)
      : 'none';
    root.appendChild(textEl);

    var rec = {
      root: root, textEl: textEl, chorusEl: chorusEl,
      sweeps: [], trackWrap: null, trackSignature: '',
      entry: entry,
      applied: null,       /* 已应用的 animate 目标（避免重复重启动画） */
      staticRendered: !!renderStaticPassed,
      poolEpoch: fontPoolEpoch,   /* 创建时的字体纪元（行池 diff 用） */
      exitOffset: exitOffset
    };

    /* token 渲染（MonetTimedTokenSpan） */
    monetRenderTokens(textEl, entry, {
      t: nowT,
      accentColor: CM_colorWithAlpha(theme.primaryColor, 0.98),
      fontPx: lyricFontPx,
      fontStack: fontStack,
      fontsEpoch: fontsEpoch,
      wordColorMatchers: wordColorMatchers,
      isChorus: !!entry.line.isChorus,
      chorusAccentColor: theme.accentColor,
      renderStaticPassed: renderStaticPassed,
      sweeps: rec.sweeps,
      tone: entry.tone
    });

    /* 字幕轨（:739-777） */
    buildSubtitleTracks(rec, entry, glowBufferPx);

    /* 行进出动画（:656-675 initial/animate/exit + MONET_SCROLL_TRANSITION） */
    if (noEnter) {
      mmSetInitial(root, { opacity: entry.tone.opacity, y: entry.y, scale: entry.tone.scale, filter: 'blur(' + entry.tone.blurPx + 'px)' }, null);
      applyLineAnimate(rec, entry, true);
    } else if (!disableEntryMotion) {
      mmSetInitial(root, {
        opacity: 0,
        y: entry.y + initialOffset,
        scale: entry.tone.scale * 0.98,
        filter: 'blur(5px)'
      }, null);
    } else {
      mmSetInitial(root, { opacity: entry.tone.opacity, y: entry.y, scale: entry.tone.scale, filter: 'blur(' + entry.tone.blurPx + 'px)' }, null);
    }
    applyLineAnimate(rec, entry, false);

    if (chorusEl) {
      mmApplyVariant(chorusEl, {
        st: {
          opacity: entry.status === 'active' ? 1 : 0,
          scale: entry.status === 'active' ? 1.02 : 0.96,
          transition: { duration: 0.45, ease: 'easeOut' }
        }
      }, 'st', null);
    }
    return rec;
  }

  /* 字幕轨（:739-777：每轨 initial {opacity 0,y 8} → animate {1,0}，stagger 0.04s） */
  function buildSubtitleTracks(rec, entry, glowBufferPx) {
    if (rec.trackWrap && rec.trackWrap.parentNode) rec.trackWrap.parentNode.removeChild(rec.trackWrap);
    rec.trackWrap = null;
    rec.trackSignature = '';
    var tracks = entry.layout.subtitleTracks || [];
    if (!tracks.length) return;
    var signature = tracks.map(function (t) { return t.role + ':' + t.text + ':' + t.lineCount; }).join('|');
    rec.trackSignature = signature;
    var wrap = monetEl('div');
    for (var i = 0; i < tracks.length; i++) {
      var track = tracks[i];
      var trackMask = monetGetLineMask(track.isClipped, Math.max(track.fontPx * 0.65, 10));
      var el = monetEl('div');
      el.style.cssText = 'min-width:0;overflow:hidden;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;' +
        'margin-left:-' + glowBufferPx + 'px;margin-right:-' + glowBufferPx + 'px;' +
        'padding-left:' + glowBufferPx + 'px;padding-right:' + glowBufferPx + 'px;' +
        'height:' + track.heightPx + 'px;padding-top:' + track.paddingTopPx + 'px;padding-bottom:' + track.paddingBottomPx + 'px;' +
        'color:' + CM_colorWithAlpha(theme.primaryColor, i > 0 ? 0.68 * CM_SECONDARY_TRACK_OPACITY : 0.68) + ';' +
        'font-family:' + translationFontStack + ';font-size:' + track.fontPx + 'px;font-weight:' + track.fontWeight + ';' +
        'line-height:' + track.lineHeightPx + 'px;letter-spacing:0;';
      monetSetMask(el, trackMask ? { WebkitMaskImage: trackMask, maskImage: trackMask } : undefined);
      el.textContent = track.text;
      /* initial {opacity:0, y:8}（:748）先行，再播 animate（:749-750） */
      el.style.opacity = '0';
      wrap.appendChild(el);
      mmSetInitial(el, { y: 8 }, null);
      mmApplyVariant(el, {
        st: {
          opacity: 1, y: 0,
          transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1], delay: i * MONET_SUBTITLE_TRACK_STAGGER_S }
        }
      }, 'st', null);
    }
    rec.root.appendChild(wrap);
    rec.trackWrap = wrap;
  }

  /* animate 目标应用（y/tone 变化 → spring 续跑；与上次相同则跳过） */
  function applyLineAnimate(rec, pentry, force) {
    var target = {
      opacity: pentry.tone.opacity,
      y: pentry.y,
      scale: pentry.tone.scale,
      filter: 'blur(' + pentry.tone.blurPx + 'px)'
    };
    var sig = [target.opacity, target.y, target.scale, target.filter, pentry.tone.zIndex].join('|');
    if (!force && rec.applied === sig) return;
    rec.applied = sig;
    rec.root.style.zIndex = pentry.tone.zIndex;
    mmApplyVariant(rec.root, { st: Object.assign({}, target, { transition: monetGetScrollTransition() }) }, 'st', null);
  }

  /* 更新已有行（status/几何/subtitle 变化 → 就地更新） */
  function updateLineEl(rec, pentry, glowBufferPx, vGlowBufferPx, nowT) {
    var prevStatus = rec.entry.status;
    var statusChanged = prevStatus !== pentry.status;
    rec.entry = pentry;
    rec.root.style.height = pentry.layout.visualHeightPx + 'px';

    var isActiveLine = pentry.status === 'active';
    var textMask = isActiveLine ? undefined : monetGetClippedTextMask(
      pentry.layout.isTextClipped,
      vGlowBufferPx + pentry.layout.textPaddingTopPx + pentry.layout.textContentHeightPx,
      Math.max(lyricFontPx * 0.55, 12)
    );
    var textEdgeMask = monetGetEdgeFadeMask(pentry.layout.isTextOverflowingWidth, Math.max(lyricFontPx * 0.9, 24));
    monetSetMask(rec.textEl, monetComposeLineMasks(textMask, textEdgeMask));
    rec.textEl.style.textShadow = pentry.status === 'active'
      ? '0 14px 34px ' + CM_colorWithAlpha(theme.backgroundColor, 0.22)
      : 'none';
    if (!isActiveLine) {
      rec.textEl.style.height = (pentry.layout.textHeightPx + vGlowBufferPx * 2) + 'px';
    } else {
      rec.textEl.style.height = '';
    }

    if (statusChanged) {
      /* sweep 词随行状态迁移（framer 重渲染语义：active ↔ 其它时条件挂卸 overlay） */
      var nowActive = pentry.status === 'active';
      for (var i = 0; i < rec.sweeps.length; i++) {
        var sweep = rec.sweeps[i];
        sweep.lineStatus = pentry.status;
        sweep.lineActive = nowActive;
        if (nowActive) {
          monetAttachSweepOverlay(sweep);
        } else if (sweep.overlayOuter && sweep.overlayOuter.parentNode) {
          sweep.overlayOuter.parentNode.removeChild(sweep.overlayOuter);
          sweep.overlayOuter = null;
          sweep.overlayInner = null;
        }
        sweep.lastColor = null;
        sweep.lastShadow = null;
      }
      buildSubtitleTracks(rec, pentry, glowBufferPx);
      if (rec.chorusEl) {
        mmApplyVariant(rec.chorusEl, {
          st: {
            opacity: pentry.status === 'active' ? 1 : 0,
            scale: pentry.status === 'active' ? 1.02 : 0.96,
            transition: { duration: 0.45, ease: 'easeOut' }
          }
        }, 'st', null);
      }
    }
    applyLineAnimate(rec, pentry, false);
    /* 状态迁移帧立即推进一次 sweep（避免新 active 行停一帧） */
    if (statusChanged) {
      for (var s = 0; s < rec.sweeps.length; s++) monetUpdateSweep(rec.sweeps[s], nowT);
    }
  }

  /* 行退出（AnimatePresence exit :668-674 + 延时移除） */
  function exitLine(rec) {
    var entry = rec.entry;
    var exitVariant = {
      opacity: 0,
      y: entry.y + rec.exitOffset,
      scale: entry.tone.scale * 0.98,
      filter: 'blur(6px)',
      transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] }
    };
    mmApplyVariant(rec.root, { exit: exitVariant }, 'exit', null);
    var timer = setTimeout(function () {
      if (rec.root.parentNode) rec.root.parentNode.removeChild(rec.root);
    }, 200 + 90);
    exitTimers.push(timer);
  }

  /* ---------- 手动滚动（:872-1016 状态机同构） ---------- */
  function getFallbackAnchorIndex(entries) {
    if (manualScrollAnchorIndex !== null) return manualScrollAnchorIndex;
    if (lastActiveIndex >= 0) return lastActiveIndex;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].offset === 0) return entries[i].index;
    }
    return 0;
  }
  function scheduleManualScrollReset() {
    if (manualScrollResetTimer) clearTimeout(manualScrollResetTimer);
    manualScrollResetTimer = setTimeout(function () {
      manualScrollAnchorIndex = null;
      wheelAccumulator = 0; wheelDirection = 0;
      touchAccumulator = 0; touchDirection = 0;
      manualScrollResetTimer = 0;
      forceEntriesRebuild = true;
    }, MONET_SCROLL_IDLE_RESET_MS);
  }
  function moveManualScrollAnchor(steps, entries) {
    if (!lines.length) return;
    var baseIndex = getFallbackAnchorIndex(entries);
    manualScrollAnchorIndex = Math.round(monetClamp(baseIndex + steps, 0, lines.length - 1));
    scheduleManualScrollReset();
    forceEntriesRebuild = true;
  }
  function onRailWheel(event) {
    if (!lines.length) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    var direction = monetGetScrollDirection(event.deltaY);
    if (direction !== 0 && wheelDirection !== 0 && direction !== wheelDirection) wheelAccumulator = 0;
    wheelDirection = direction || wheelDirection;
    wheelAccumulator += event.deltaY;
    var steps = monetClampScrollSteps(Math.trunc(wheelAccumulator / MONET_SCROLL_STEP_PX));
    if (steps !== 0) { wheelAccumulator = 0; moveManualScrollAnchor(steps, lastVisibleEntries); }
    else scheduleManualScrollReset();
  }
  function onRailTouchStart(event) {
    if (!lines.length) return;
    event.stopPropagation();
    touchLastY = event.touches[0] ? event.touches[0].clientY : null;
    touchAccumulator = 0; touchDirection = 0;
    manualScrollAnchorIndex = getFallbackAnchorIndex(lastVisibleEntries);
    scheduleManualScrollReset();
  }
  function onRailTouchMove(event) {
    if (!lines.length || touchLastY === null) return;
    event.stopPropagation();
    var nextY = event.touches[0] ? event.touches[0].clientY : null;
    if (typeof nextY !== 'number') return;
    var deltaY = touchLastY - nextY;
    touchLastY = nextY;
    var direction = monetGetScrollDirection(deltaY);
    if (direction !== 0 && touchDirection !== 0 && direction !== touchDirection) touchAccumulator = 0;
    touchDirection = direction || touchDirection;
    touchAccumulator += deltaY;
    var steps = monetClampScrollSteps(Math.trunc(touchAccumulator / MONET_TOUCH_STEP_PX));
    if (steps !== 0) { touchAccumulator = 0; moveManualScrollAnchor(steps, lastVisibleEntries); }
    else scheduleManualScrollReset();
  }
  function onRailTouchEnd() {
    touchLastY = null; touchDirection = 0; touchAccumulator = 0;
    scheduleManualScrollReset();
  }
  var wheelOpts = { passive: false };
  railEl.addEventListener('wheel', onRailWheel, wheelOpts);
  railEl.addEventListener('touchstart', onRailTouchStart, wheelOpts);
  railEl.addEventListener('touchmove', onRailTouchMove, wheelOpts);
  railEl.addEventListener('touchend', onRailTouchEnd, wheelOpts);
  railEl.addEventListener('touchcancel', onRailTouchEnd, wheelOpts);

  var onLyricLineSeek = null;      /* 桥可注入（MineRadio 点击行 seek 未接线 → 不启用 canSeek） */
  var canSeek = false;

  /* ---------- 尺寸观测（useElementWidth / useMonetRailSize :242-273 等价） ---------- */
  var resizeObserver = null;
  function measureShell() {
    var w = Math.round(shell.getBoundingClientRect().width);
    if (w > 0 && w !== shellWidth) {
      shellWidth = w;
      return true;
    }
    return false;
  }
  function measureRail() {
    var w = Math.round(railEl.clientWidth);
    var h = Math.round(railEl.clientHeight);
    if ((w || 0) !== railSize.width || (h || 0) !== railSize.height) {
      railSize = { width: w, height: h };
      return true;
    }
    return false;
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(function () {
      if (destroyed) return;
      var shellChanged = measureShell();
      var railChanged = measureRail();
      if (shellChanged) {
        recomputeMetrics();
        applyPortraitFrameGeometry();
        applyRailContainerStyle();
      }
      if (shellChanged || railChanged) forceEntriesRebuild = true;
    });
    resizeObserver.observe(shell);
    resizeObserver.observe(railEl);
  }

  /* ---------- intro 进场时间表（VisualizerMonet :200-330/:516-535 原值） ---------- */
  var INTRO_EASE = [0.25, 1, 0.5, 1];
  function introPlay() {
    mmSetInitial(decorWrap, { opacity: 0 }, null);
    mmApplyVariant(decorWrap, { enter: { opacity: 1, transition: { duration: 2.2, ease: 'easeOut' } } }, 'enter', null);
    mmSetInitial(artistEl, { opacity: 0, x: -30, y: -10 }, null);
    mmApplyVariant(artistEl, { enter: { opacity: 1, x: 0, y: 0, transition: { duration: 1.2, ease: INTRO_EASE, delay: 0.15 } } }, 'enter', null);
    /* :216-224 scaleY 0→1——mini-motion transform 组装无 scaleY；rule 宽 1px，
       scale 等比缩放与 scaleY 在此视觉等效（宽度变化不可见） */
    mmSetInitial(ruleEl, { scale: 0 }, null);
    mmApplyVariant(ruleEl, { enter: { scale: 1, transition: { duration: 1.5, ease: INTRO_EASE, delay: 0.5 } } }, 'enter', null);
    mmSetInitial(titleWrap, { opacity: 0, x: -40 }, null);
    mmApplyVariant(titleWrap, { enter: { opacity: 1, x: 0, transition: { duration: 1.3, ease: INTRO_EASE, delay: 0.3 } } }, 'enter', null);
    mmSetInitial(railWrap, { opacity: 0, y: 20 }, null);
    mmApplyVariant(railWrap, { enter: { opacity: 1, y: 0, transition: { duration: 1.2, ease: INTRO_EASE, delay: 0.65 } } }, 'enter', null);
    mmSetInitial(capsuleWrap, { opacity: 0, scale: 0.9, y: 10 }, null);
    mmApplyVariant(capsuleWrap, { enter: { opacity: 1, scale: 1, y: 0, transition: { duration: 1.0, ease: INTRO_EASE, delay: 0.95 } } }, 'enter', null);
    mmSetInitial(audioWrap, { opacity: 0, y: 15 }, null);
    mmApplyVariant(audioWrap, { enter: { opacity: 1, y: 0, transition: { duration: 1.2, ease: INTRO_EASE, delay: 0.8 } } }, 'enter', null);
  }
  /* 相框列进场（:328-330 仅一次，不随 intro 重挂） */
  mmSetInitial(portraitCol, { opacity: 0, x: 50, scale: 0.95, rotate: 1 }, null);
  mmApplyVariant(portraitCol, {
    enter: { opacity: 1, x: 0, scale: 1, rotate: 0, transition: { duration: 1.6, ease: INTRO_EASE, delay: 0.25 } }
  }, 'enter', null);

  /* ---------- 元数据/构图应用 ---------- */
  function applyComposition() {
    recomputeMetrics();
    row.style.maxWidth = rowMaxWidthPx + 'px';
    artistEl.style.fontSize = 'clamp(1rem, 1.8vw, ' + artistMaxRem + 'rem)';
    titleEl.style.fontSize = 'clamp(1.45rem, 3.3vw, ' + titleMaxRem + 'rem)';
    titleEl.style.color = theme.primaryColor;
    titleEl.style.textShadow = '0 14px 36px ' + CM_colorWithAlpha(theme.backgroundColor, 0.28);
    albumEl.style.color = CM_colorWithAlpha(theme.secondaryColor, 0.84);
    capsuleInner.style.borderColor = CM_colorWithAlpha(theme.primaryColor, 0.16);
    capsuleInner.style.backgroundColor = CM_colorWithAlpha(theme.backgroundColor, 0.18);
    capsuleInner.style.color = CM_colorWithAlpha(theme.primaryColor, 0.9);
    capsuleDot.style.backgroundColor = theme.accentColor;
    capsuleWrap.style.display = tuning.showDescription ? '' : 'none';
    audioWrap.style.display = (tuning.showAudioVisualization && showText) ? '' : 'none';
    portraitCol.style.display = showText ? 'flex' : 'none';
    applyPortraitFrameGeometry();
    applyRailContainerStyle();
    /* 主标签（:167-169 原语义：artist/album 空回退 'Monet'；胶囊 theme.description|name|'Monet'） */
    artistEl.textContent = (songArtist && songArtist.trim()) ? songArtist.trim() : 'Monet';
    albumEl.textContent = (songAlbum && songAlbum.trim()) ? songAlbum.trim() : 'Monet';
    capsuleText.textContent = ((theme.description && theme.description.trim()) || (theme.name && theme.name.trim()) || 'Monet');
    titleEl.textContent = songTitle || 'Monet';
  }

  /* ---------- 主循环 ---------- */
  var lastActiveIndex = -99;
  var lastVisibleEntries = [];
  var forceEntriesRebuild = true;
  var showText = opts.showText !== false;

  function rebuildEntries(nowT) {
    var activeLine = lines[lastActiveIndex] || null;
    var recentCompletedLine = monetGetRecentCompletedLine(lines, lastActiveIndex, nowT, CM_getLineRenderEndTime);
    var upcomingLine = monetGetUpcomingLine(lines, lastActiveIndex, nowT);

    var entries = CM_buildMonetVisibleLineEntries({
      lines: lines,
      currentLineIndex: lastActiveIndex,
      activeLine: activeLine,
      recentCompletedLine: recentCompletedLine,
      upcomingLine: upcomingLine,
      currentTime: nowT,
      before: 2,
      after: 2
    });

    /* 手动滚动覆盖窗口（:828-833） */
    var isManualScrolling = manualScrollAnchorIndex !== null;
    var visibleEntries = isManualScrolling
      ? monetBuildScrollableRailEntries(lines, manualScrollAnchorIndex, lastActiveIndex)
      : entries;
    lastVisibleEntries = visibleEntries;

    /* fontsEpoch 推进 → 测量缓存一次性失效（:838-845） */
    if (handledFontsEpoch !== fontsEpoch) {
      handledFontsEpoch = fontsEpoch;
      CM_clearMonetMeasurementCaches();
      layoutCache.clear();
    }

    wordColorMatchers = CM_prepareWordColorMatchers(theme.wordColors, tuning.keywordColoringEnabled);

    var glowBufferPx = Math.round(lyricFontPx * 1.2);
    var vGlowBufferPx = Math.round(lyricFontPx * 1.2);
    var positioned = monetBuildPositionedEntries(visibleEntries, railSize, theme, lyricFontPx, inactiveFontPx, railLayoutInputs(), glowBufferPx, layoutCache);

    /* 行池 diff（AnimatePresence initial=false 等价） */
    var present = {};
    for (var i = 0; i < positioned.length; i++) present[positioned[i].key] = true;
    var doomed = [];
    lineRecs.forEach(function (rec, key) {
      if (!present[key]) doomed.push(rec);
    });
    for (var d = 0; d < doomed.length; d++) {
      exitLine(doomed[d]);
      lineRecs.delete(doomed[d].key);
    }

    for (var p = 0; p < positioned.length; p++) {
      var entry = positioned[p];
      var existing = lineRecs.get(entry.key);
      /* 字体纪元过期（setTheme 换字体）或手动滚动的静态行回到正常模式 → 重建
         （framer re-render 等价：inline font-family 只在 buildLineEl 写） */
      var needRebuild = existing && (existing.poolEpoch !== fontPoolEpoch
        || (existing.staticRendered && !isManualScrolling));
      if (existing && !needRebuild) {
        updateLineEl(existing, entry, glowBufferPx, vGlowBufferPx, nowT);
      } else {
        if (existing) {
          if (existing.root.parentNode) existing.root.parentNode.removeChild(existing.root);
          lineRecs.delete(entry.key);
        }
        var rec = buildLineEl(entry, glowBufferPx, vGlowBufferPx, canSeek && !isManualScrolling, isManualScrolling, isManualScrolling && entry.index !== lastActiveIndex, nowT, !!existing);
        railEl.appendChild(rec.root);
        lineRecs.set(entry.key, rec);
      }
    }
  }

  function tick() {
    if (destroyed) return;
    var now = currentTime.get();
    if (now !== lastTime) {
      /* :84-91 回绕检测（>2.0 → <0.1 触发 intro 重放） */
      if (lastTime != null && wasAtEnd && now < 0.1) {
        introPlay();
      }
      wasAtEnd = now > 2.0;
      lastTime = now;
      currentTime.emit(now);
      /* sweep 词逐帧派生（useTransform 链等价） */
      lineRecs.forEach(function (rec) {
        for (var i = 0; i < rec.sweeps.length; i++) monetUpdateSweep(rec.sweeps[i], now);
      });
    }

    /* 换歌（songIdentifier :93-97）→ intro 重放 */
    var songIdentifier = seed != null ? String(seed) : '';
    if (songIdentifier !== lastSongIdentifier) {
      lastSongIdentifier = songIdentifier;
      introPlay();
    }

    var idx = monetFindLineIndexAtTime(lines, now);
    if (idx !== lastActiveIndex || forceEntriesRebuild) {
      lastActiveIndex = idx;
      forceEntriesRebuild = false;
      rebuildEntries(now);
    }

    drawAudio();
    rafId = requestAnimationFrame(tick);
  }

  function onWindowResize() {
    if (destroyed) return;
    if (measureShell()) {
      recomputeMetrics();
      applyPortraitFrameGeometry();
      applyRailContainerStyle();
      forceEntriesRebuild = true;
    }
  }
  window.addEventListener('resize', onWindowResize);

  /* ---------- 初始化 ---------- */
  measureShell();
  measureRail();
  applyBgReadability();
  applyBgDrift();
  buildDecor();
  applyComposition();
  applyPortraitFrame();
  applyHangerLook();
  setPortraitTarget(tuning.portraitSource === 'custom' ? coverUrl : coverUrl);
  refreshBackground();
  monetResizeAudioCanvas();
  introPlay();
  rafId = requestAnimationFrame(tick);

  return {
    destroy: function () {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      for (var i = 0; i < exitTimers.length; i++) clearTimeout(exitTimers[i]);
      exitTimers = [];
      if (manualScrollResetTimer) clearTimeout(manualScrollResetTimer);
      if (bgDebounceTimer) clearTimeout(bgDebounceTimer);
      if (settleTimer) clearTimeout(settleTimer);
      if (bgDriftAnim) { try { bgDriftAnim.cancel(); } catch (e) { } bgDriftAnim = null; }
      if (resizeObserver) { try { resizeObserver.disconnect(); } catch (e) { } }
      if (hangerStyleEl && hangerStyleEl.parentNode) hangerStyleEl.parentNode.removeChild(hangerStyleEl);
      window.removeEventListener('resize', onWindowResize);
      if (shell.parentNode) shell.parentNode.removeChild(shell);
      lineRecs.clear();
      bgLayers = [];
      portraitLayers = [];
    },
    setLines: function (next) {
      lines = next || [];
      forceEntriesRebuild = true;
    },
    setTheme: function (nextTheme) {
      theme = nextTheme;
      fontStack = CM_resolveThemeFontStack(theme);
      translationFontStack = CM_resolveThemeTranslationFontStack(theme);
      lyricFontWeight = CM_resolveThemeFontWeight(theme, 600);
      translationFontWeight = CM_resolveThemeFontWeight(theme, 500);
      secondaryTranslationFontWeight = CM_resolveThemeFontWeight(theme, CM_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK);
      shell.style.fontFamily = fontStack;
      shell.style.fontWeight = CM_resolveThemeFontWeight(theme, 400);
      /* 字体跟随：inline font-family 只在 buildLineEl 写，行池 diff 复用旧行
         不会带新字体——推进纪元让 existing 行在本帧 rebuildEntries 重建 */
      fontPoolEpoch++;
      applyComposition();
      applyBgReadability();
      buildDecor();
      applyPortraitFrame();
      applyHangerLook();
      bgPipelineKey = null;      /* 主题进烘焙 key → 重烘焙 */
      refreshBackground();
      forceEntriesRebuild = true;
    },
    setCoverUrl: function (url) {
      coverUrl = url || null;
      setPortraitTarget(coverUrl);
      bgPipelineKey = null;
      refreshBackground();
    },
    setMeta: function (meta) {
      if (!meta) return;
      if (meta.songTitle != null) songTitle = meta.songTitle;
      if (meta.songArtist != null) songArtist = meta.songArtist;
      if (meta.songAlbum != null) songAlbum = meta.songAlbum;
      if (meta.seed != null) seed = meta.seed;
      applyComposition();
    },
    setFontScale: function (n) {
      lyricsFontScale = n != null ? n : 1;
      tuning = monetResolveTuning(tuning, lyricsFontScale);
      applyComposition();
      forceEntriesRebuild = true;
    },
    setTuning: function (t) {
      var prevStyle = tuning.portraitStyle;
      var prevDesc = tuning.showDescription;
      var prevAudio = tuning.showAudioVisualization + '|' + tuning.audioStyle;
      tuning = monetResolveTuning(t, lyricsFontScale);
      applyComposition();
      if (prevStyle !== tuning.portraitStyle) applyPortraitFrame();
      if (prevAudio !== (tuning.showAudioVisualization + '|' + tuning.audioStyle)) { /* drawAudio 每帧读 tuning */ }
      if (prevDesc !== tuning.showDescription) { /* applyComposition 已切换显示 */ }
      forceEntriesRebuild = true;
    }
  };
}
