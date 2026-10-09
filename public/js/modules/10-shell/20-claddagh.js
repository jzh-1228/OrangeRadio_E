/* =========================================================================
   OrangeSea · 环歌（Claddagh Ring · 椭圆环逐字歌词）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0):
   src/components/visualizer/claddagh/VisualizerCladdagh.tsx（布局/缓动/
   深度混合公式全套照搬）+ src/utils/lyrics/graphemeTiming.ts（逐字时间线）
   + src/components/visualizer/colorMix.ts（颜色混合）。

   宿主替换（Folia React → 本项目无构建 IIFE）：
   · React 生命周期 → applyCladdaghMode(on,{save}) 显式进出 + DOM 行池；
   · framer-motion useSpring → 自有半隐式欧拉弹簧（行转角 k55/c14/m0.9，
     bass k150/c25、vocal k120/c24，与 MotionValue 参数一致）；
   · pretext measureNaturalWidth → 离屏 canvas measureText 前缀测量
     （同为 shaping 后宽度；letterSpacing 手动累加，缓存等价）；
   · MotionValue → 信号/自算特征：主循环覆盖层期间只保活 frequencyData
     （11-main-loop.js isMainSceneCoveredByOverlay 分支不写 bands 信号），
     故 bass/vocal 自 frequencyData 自算（与 09-aurora-flow 同形态回退）；
   · 每帧 30fps rAF 节流 + 颜色/阴影字符串档位缓存 + 不可见字符早退。

   配色：项目日落暖色（基底暖橙 / 高亮暖金 / 副歌内核暖白），
   字体跟随 fx.lyricFont（lyricFontStackForKey），与流光/雨窗一致。
   ========================================================================= */

var CLADDAGH_STORE_KEY = 'orangesea-claddagh-v1';

/* ---------- 照搬 Folia claddagh 常量（VisualizerCladdagh.tsx 顶部） ---------- */
var CLADDAGH_MAX_ARC_SPAN = 4.25;
var CLADDAGH_LETTER_SPACING_EM = 0.04;
var CLADDAGH_BASE_TRACKING_EM = 0.18;
var CLADDAGH_BACK_FOLLOW_RATIO = 0.28;
var CLADDAGH_BACK_ORBIT_FOLLOW_RATIO = 0.52;
var CLADDAGH_NEXT_LINE_ENTRY_LEAD_SECONDS = 0.34;
var CLADDAGH_SPACING_CACHE_LIMIT = 240;

/* 默认调参（Folia DEFAULT_CLADDAGH_TUNING，types.ts） */
var CLADDAGH_FOCUS_SCALE_RATIO = 0.65;
var CLADDAGH_ELLIPSE_TILT_DEG = 45;

/* ---------- 日落暖色主题（Folia theme.primaryColor/accent 的本项目对位） ---------- */
var CLADDAGH_PRIMARY = '#f7b98d';      /* baseColor 基底（0.55 alpha 用） */
var CLADDAGH_ACCENT = '#ffdfae';       /* highlightColor 已唱高亮 */
var CLADDAGH_CORE = '#fff6e8';         /* 副歌三层辉光内核 */
var CLADDAGH_AXIS_FROM = '#fff1de';    /* 轴线基色 */
var CLADDAGH_AXIS_TO = '#ff9c6e';      /* 轴线节拍色（项目视觉主色） */

/* 主题跟随（Folia: 环排基底 = theme.primaryColor、已唱高亮 = theme.accentColor） */
var claddaghLastThemeKey = '';
function claddaghSyncTheme() {
  if (typeof themeOverlayDarkTheme !== 'function') return;
  var t = null;
  try { t = themeOverlayDarkTheme(); } catch (e) { return; }
  if (!t) return;
  var key = (t.primaryColor || '') + '|' + (t.accentColor || '');
  if (key === claddaghLastThemeKey) return;
  claddaghLastThemeKey = key;
  if (t.primaryColor) CLADDAGH_PRIMARY = t.primaryColor;
  if (t.accentColor) {
    CLADDAGH_ACCENT = t.accentColor;
    CLADDAGH_AXIS_TO = t.accentColor;
  }
}

/* ---------- 模块状态 ---------- */
var claddaghMode = readBooleanPreference(CLADDAGH_STORE_KEY, false);
var claddaghRafId = 0;
var claddaghResizeTimer = 0;
var claddaghLyricsObserverToken = 0;
var claddaghLastFontKey = null;

var claddaghDims = { w: 0, h: 0 };
var claddaghRx = 360;
var claddaghFontPx = 72;
var claddaghFontSpec = '';
var claddaghFontStackStr = '';

/* 行转角弹簧（framer-motion animate spring k55/c14/m0.9 的半隐式欧拉） */
var claddaghLineOffset = { value: 0, vel: 0, target: 0 };
var claddaghBassSpring = { value: 0, vel: 0 };     /* useSpring(bass, k150/c25) */
var claddaghVocalSpring = { value: 0, vel: 0 };    /* useSpring(vocal, k120/c24) */

/* 行窗口（renderBaseIndex-1 .. +2，Folia lineIndicesToRender） */
var claddaghCenterIdx = -1;      /* focusIndex 对位（当前行） */
var claddaghRenderBaseIdx = -1;
var claddaghLineMap = {};        /* idx → { root, spans:[], spacingInfo, line } */
var claddaghActiveSpacingInfo = [];

/* seek 回跳保持（shouldHoldCladdaghFrameForPlaybackReset） */
var claddaghPrevNowTime = 0;
var claddaghHoldReset = false;

/* 副歌闸门（Folia line.isChorus 由解析器提供；本项目无此数据，
   用能量慢积分近似——与 auroraChorus 同思路） */
var claddaghChorus = 0;
var claddaghEnergy = 0;

/* 轴线辉光强度渐变（Folia glowIntensityRef） */
var claddaghAxisGlow = 0;

/* 前缀测量缓存 + 颜色/阴影档位缓存（每帧零新逻辑分配的档位复用） */
var claddaghSpacingCache = {};
var claddaghSpacingCacheCount = 0;
var claddaghColorCache = {};     /* 量化 progress 档 → { color, alpha } */
var claddaghShadowCache = {};   /* radius|alpha|fade|chorus 档 → 字符串 */
var claddaghShadowCacheCount = 0;
var claddaghMeasureCanvas = null;
var claddaghMeasureCtx = null;

/* ---------------- 基础小工具 ---------------- */
function claddaghClamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/* Folia colorMix.ts：hex/rgb(a) 解析 + rgba 输出（简化到本项目需要的子集） */
function claddaghParseChannels(color) {
  var s = String(color == null ? '' : color).trim();
  if (!s) return null;
  if (s.charAt(0) === '#') {
    var hex = s.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return [
        parseInt(hex.charAt(0) + hex.charAt(0), 16),
        parseInt(hex.charAt(1) + hex.charAt(1), 16),
        parseInt(hex.charAt(2) + hex.charAt(2), 16)
      ];
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
    return null;
  }
  var m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    var parts = m[1].split(',');
    var r = parseFloat(parts[0]);
    var g = parseFloat(parts[1]);
    var b = parseFloat(parts[2]);
    if (isFinite(r) && isFinite(g) && isFinite(b)) return [r, g, b];
  }
  return null;
}

function claddaghFormatRgba(rgb, alpha) {
  return 'rgba(' + Math.round(claddaghClamp(rgb[0], 0, 255)) + ',' +
    Math.round(claddaghClamp(rgb[1], 0, 255)) + ',' +
    Math.round(claddaghClamp(rgb[2], 0, 255)) + ',' +
    claddaghClamp(alpha, 0, 1).toFixed(3) + ')';
}

/* mixColors(from, to, amount, alpha)：amount∈[0,1]，输出 rgba 字符串 */
function claddaghMixColors(from, to, amount, alpha) {
  var a = claddaghClamp(amount, 0, 1);
  var fc = claddaghParseChannels(from);
  var tc = claddaghParseChannels(to);
  if (!fc || !tc) return claddaghFormatRgba([255, 255, 255], alpha);
  return claddaghFormatRgba([
    fc[0] + (tc[0] - fc[0]) * a,
    fc[1] + (tc[1] - fc[1]) * a,
    fc[2] + (tc[2] - fc[2]) * a
  ], alpha == null ? 1 : alpha);
}

/* colorWithAlpha：把 hex 提到指定 alpha 的 rgba */
function claddaghColorWithAlpha(color, alpha) {
  var c = claddaghParseChannels(color);
  return claddaghFormatRgba(c || [255, 255, 255], alpha);
}

/* ---------------- 逐字时间线（graphemeTiming.ts + adjustCladdaghTimeline 照搬） ---------------- */

function claddaghIsCJKChar(ch) {
  return /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(ch);
}

/* 视觉长度：CJK 记 1.0，半角记 0.5（Folia getVisualLength） */
function claddaghGetVisualLength(text) {
  if (!text) return 0;
  var score = 0;
  for (var i = 0; i < text.length; i++) {
    score += claddaghIsCJKChar(text[i]) ? 1.0 : 0.5;
  }
  return score;
}

var claddaghGraphemeSegmenter = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

function claddaghSplitGraphemes(text) {
  if (!text) return [];
  if (claddaghGraphemeSegmenter) {
    return Array.from(claddaghGraphemeSegmenter.segment(text), function (s) { return s.segment; });
  }
  return Array.from(text);
}

/* 词内均分逐字时间（buildEvenGraphemeTimings） */
function claddaghEvenGraphemeTimings(graphemes, startTime, endTime) {
  var n = graphemes.length;
  if (!n) return [];
  var duration = Math.max(endTime - startTime, 0);
  var unit = duration / n;
  var out = new Array(n);
  for (var i = 0; i < n; i++) {
    out[i] = {
      char: graphemes[i],
      startTime: startTime + unit * i,
      endTime: i === n - 1 ? endTime : startTime + unit * (i + 1)
    };
  }
  return out;
}

function claddaghFindGraphemeSequence(source, target, fromIndex) {
  if (!target.length) return fromIndex;
  for (var i = fromIndex; i <= source.length - target.length; i++) {
    var matched = true;
    for (var t = 0; t < target.length; t++) {
      if (source[i + t] !== target[t]) { matched = false; break; }
    }
    if (matched) return i;
  }
  return -1;
}

/* buildLineGraphemeTimeline：词级时序映射回整行逐字（含 gap 字符填充）。
   MineRadio 行 {t,text,duration,words[{text,t,d,c0,c1}]} → Folia Line 语义。 */
function claddaghBuildLineTimeline(line) {
  var fullText = String((line && line.text) || '');
  var lineGraphemes = claddaghSplitGraphemes(fullText);
  if (!lineGraphemes.length) return [];
  var lineStart = (line && line.t) || 0;
  var lineEnd = lineStart + (line && line.duration ? line.duration : 4);

  var words = (line && line.words) || [];
  if (!words.length) {
    return claddaghEvenGraphemeTimings(lineGraphemes, lineStart, lineEnd);
  }

  var timeline = new Array(lineGraphemes.length);
  var cursor = 0;
  var lastResolvedTime = lineStart;

  for (var wi = 0; wi < words.length; wi++) {
    var w = words[wi];
    if (!w) continue;
    var wordText = String(w.text || '');
    var wordGraphemes = claddaghSplitGraphemes(wordText);
    if (!wordGraphemes.length) continue;
    var wStart = (w.t != null ? w.t : lineStart);
    var wEnd = wStart + (w.d != null ? w.d : 0.4);

    var matchedStart = claddaghFindGraphemeSequence(lineGraphemes, wordGraphemes, cursor);
    var start = matchedStart >= 0 ? matchedStart : cursor;
    var end = Math.min(start + wordGraphemes.length, lineGraphemes.length);

    /* 词前 gap 字符（空格/标点）：零时长占位（后面 adjust 再摊开） */
    for (var gi = cursor; gi < start; gi++) {
      timeline[gi] = { char: lineGraphemes[gi], startTime: wStart, endTime: wStart };
    }

    var wordTimings = claddaghEvenGraphemeTimings(wordGraphemes, wStart, wEnd);
    for (var li = 0; li < end - start; li++) {
      var timing = wordTimings[li];
      if (!timing) continue;
      timeline[start + li] = {
        char: lineGraphemes[start + li],
        startTime: timing.startTime,
        endTime: timing.endTime
      };
      if (timing.endTime > lastResolvedTime) lastResolvedTime = timing.endTime;
    }
    if (end > cursor) cursor = end;
  }

  for (var k = 0; k < lineGraphemes.length; k++) {
    if (timeline[k]) continue;
    timeline[k] = { char: lineGraphemes[k], startTime: lastResolvedTime, endTime: lastResolvedTime };
  }
  return timeline;
}

/* adjustCladdaghTimeline 照搬：零时长 gap 字符向邻字借时并均匀摊开 */
function claddaghAdjustTimeline(timeline, lineStart, lineEnd) {
  if (!timeline.length) return timeline;
  var adjusted = timeline.slice();
  var n = adjusted.length;
  var i = 0;

  while (i < n) {
    if (adjusted[i].startTime === adjusted[i].endTime) {
      var j = i;
      while (j < n && adjusted[j].startTime === adjusted[j].endTime) j++;
      var gapCount = j - i;
      var gapStart = i > 0 ? adjusted[i - 1].endTime : lineStart;
      var gapEnd = j < n ? adjusted[j].startTime : lineEnd;

      var minNeeded = gapCount * 0.06;   /* 每字符 60ms */
      var duration = gapEnd - gapStart;

      if (duration < minNeeded) {
        var deficit = minNeeded - duration;
        if (i > 0 && j < n) {
          var half = deficit / 2;
          var prevDuration = adjusted[i - 1].endTime - adjusted[i - 1].startTime;
          var prevSteal = Math.min(half, Math.max(0, prevDuration - 0.04));
          var nextDuration = adjusted[j].endTime - adjusted[j].startTime;
          var nextSteal = Math.min(deficit - prevSteal, Math.max(0, nextDuration - 0.04));
          gapStart -= prevSteal;
          gapEnd += nextSteal;
          adjusted[i - 1].endTime = gapStart;
          adjusted[j].startTime = gapEnd;
        } else if (i > 0) {
          var prevDur2 = adjusted[i - 1].endTime - adjusted[i - 1].startTime;
          var prevSteal2 = Math.min(deficit, Math.max(0, prevDur2 - 0.04));
          gapStart -= prevSteal2;
          adjusted[i - 1].endTime = gapStart;
        } else if (j < n) {
          var nextDur2 = adjusted[j].endTime - adjusted[j].startTime;
          var nextSteal2 = Math.min(deficit, Math.max(0, nextDur2 - 0.04));
          gapEnd += nextSteal2;
          adjusted[j].startTime = gapEnd;
        }
        duration = gapEnd - gapStart;
      }

      var gapUnit = duration > 0 ? duration / gapCount : 0;
      for (var g = i; g < j; g++) {
        var idxInGap = g - i;
        adjusted[g] = {
          char: adjusted[g].char,
          startTime: gapStart + gapUnit * idxInGap,
          endTime: gapStart + gapUnit * (idxInGap + 1)
        };
      }
      i = j;
    } else {
      i++;
    }
  }
  return adjusted;
}

/* ---------------- pretext 的 canvas 对位：前缀宽度测量 ---------------- */

function claddaghGetFallbackGraphemeWidth(ch, fontPx) {
  if (/^\s+$/.test(ch)) return fontPx * 0.36;
  if (claddaghIsCJKChar(ch)) return fontPx;
  return fontPx * 0.62;
}

function claddaghMeasureTextWidth(text) {
  if (!text) return 0;
  if (!claddaghMeasureCtx) {
    claddaghMeasureCanvas = document.createElement('canvas');
    claddaghMeasureCanvas.width = 8;
    claddaghMeasureCanvas.height = 8;
    claddaghMeasureCtx = claddaghMeasureCanvas.getContext('2d');
  }
  var ctx = claddaghMeasureCtx;
  ctx.font = claddaghFontSpec;
  var w = ctx.measureText(text).width;
  return isFinite(w) && w > 0 ? w : -1;
}

/* measureCladdaghGraphemeOffsets：grapheme 前缀累计宽度（缓存）。
   pretext 的 letterSpacing 参数 → 手动按字符数累加 lsPx；
   baseTracking(0.18em) 与额外 letterOffset 每字符间隙累加，同 Folia。 */
function claddaghMeasureGraphemeOffsets(graphemes, fontPx, letterSpacingOffsetPx) {
  var text = graphemes.join('');
  var lsPx = fontPx * CLADDAGH_LETTER_SPACING_EM;
  var trackingPx = fontPx * CLADDAGH_BASE_TRACKING_EM;
  var cacheKey = fontPx + '|' + claddaghFontSpec + '|' + trackingPx + '|' + letterSpacingOffsetPx + '|' + text;
  if (Object.prototype.hasOwnProperty.call(claddaghSpacingCache, cacheKey)) {
    return claddaghSpacingCache[cacheKey];
  }

  var n = graphemes.length;
  var offsets = new Array(n + 1);
  offsets[0] = 0;
  var fallbackWidth = 0;
  for (var i = 1; i <= n; i++) {
    fallbackWidth += claddaghGetFallbackGraphemeWidth(graphemes[i - 1], fontPx);
    var gaps = i - 1;
    var measured = claddaghMeasureTextWidth(graphemes.slice(0, i).join(''));
    if (measured < 0) measured = fallbackWidth;
    else measured += gaps * lsPx;          /* canvas measureText 不含 letterSpacing，手动补 */
    var val = measured + gaps * (trackingPx + Math.max(0, letterSpacingOffsetPx));
    offsets[i] = Math.max(offsets[i - 1], val);
  }

  /* LRU 简化：超限清空（Folia 为逐出最旧，行级重建低频，整清足够） */
  claddaghSpacingCacheCount++;
  if (claddaghSpacingCacheCount > CLADDAGH_SPACING_CACHE_LIMIT) {
    claddaghSpacingCache = {};
    claddaghColorCache = {};
    claddaghShadowCache = {};
    claddaghShadowCacheCount = 0;
    claddaghSpacingCacheCount = 1;
  }
  claddaghSpacingCache[cacheKey] = offsets;
  return offsets;
}

/* buildMeasuredSpacingInfo 照搬：字心角 + 名义角（弧长超限压缩） */
function claddaghBuildSpacingInfo(items, fontPx, radiusPx, spacingScale, letterSpacingOffsetPx) {
  if (!items.length) return [];
  var graphemes = [];
  for (var i = 0; i < items.length; i++) graphemes.push(items[i].char);
  var offsets = claddaghMeasureGraphemeOffsets(graphemes, fontPx, letterSpacingOffsetPx || 0);
  var safeScale = isFinite(spacingScale) ? Math.max(0.1, spacingScale) : 1;
  var totalWidth = (offsets[offsets.length - 1] || 0) * safeScale;
  var safeRadius = Math.max(radiusPx, fontPx * 2, 1);
  var totalSpan = totalWidth / safeRadius;
  var scaleFactor = totalSpan > CLADDAGH_MAX_ARC_SPAN ? CLADDAGH_MAX_ARC_SPAN / totalSpan : 1.0;

  var out = new Array(items.length);
  for (var k = 0; k < items.length; k++) {
    var centerPx = ((offsets[k] || 0) + (offsets[k + 1] != null ? offsets[k + 1] : (offsets[k] || 0))) / 2 * safeScale;
    var startAngle = centerPx / safeRadius;
    out[k] = {
      char: items[k].char,
      startTime: items[k].startTime,
      endTime: items[k].endTime,
      startAngle: startAngle,
      nominalAngle: (startAngle - totalSpan / 2) * scaleFactor,
      scaleFactor: scaleFactor
    };
  }
  return out;
}

/* ---------------- 环上进度（getFractionalActiveIndex 系照搬） ---------------- */

function claddaghGetFractionalActiveIndex(timeline, t, renderEnd) {
  if (!timeline.length) return 0;
  if (timeline.length === 1) {
    var item = timeline[0];
    var targetEnd = (typeof renderEnd === 'number' && isFinite(renderEnd)) ? renderEnd : item.endTime;
    var dur = Math.max(0.2, targetEnd - item.startTime);
    if (t <= item.startTime) return 0;
    return (t - item.startTime) / dur;
  }
  if (t <= timeline[0].startTime) return 0;

  var lastIdx = timeline.length - 1;
  if (t >= timeline[lastIdx].startTime) {
    var lastItem = timeline[lastIdx];
    if (typeof renderEnd === 'number' && isFinite(renderEnd) && renderEnd > lastItem.startTime) {
      var prog = claddaghClamp((t - lastItem.startTime) / (renderEnd - lastItem.startTime), 0, 1);
      return lastIdx + prog * 2.0;
    }
    var prevItem = timeline[lastIdx - 1];
    var itemDur = lastItem.endTime - lastItem.startTime;
    var gapDur = lastItem.startTime - prevItem.startTime;
    var stepDur = itemDur > 0 ? itemDur : (gapDur > 0 ? gapDur : 0.5);
    var progress = (t - lastItem.startTime) / stepDur;
    return lastIdx + Math.min(progress, 1.8);
  }

  for (var i = 0; i < timeline.length - 1; i++) {
    var ts = timeline[i].startTime;
    var te = timeline[i + 1].startTime;
    if (t >= ts && t < te) {
      if (te === ts) return i;
      return i + (t - ts) / (te - ts);
    }
  }
  return timeline.length - 1;
}

function claddaghGetLineWordOffset(spacingInfo, latestTime, renderEnd) {
  if (!spacingInfo.length) return 0;
  var fi = claddaghGetFractionalActiveIndex(spacingInfo, latestTime, renderEnd);
  var lastIdx = spacingInfo.length - 1;
  if (fi <= lastIdx) {
    var intPart = Math.floor(fi);
    var frac = fi - intPart;
    var a = spacingInfo[intPart] ? spacingInfo[intPart].nominalAngle : 0;
    var b = spacingInfo[Math.min(intPart + 1, lastIdx)] ? spacingInfo[Math.min(intPart + 1, lastIdx)].nominalAngle : 0;
    return a + (b - a) * frac;
  }
  var lastA = spacingInfo[lastIdx] ? spacingInfo[lastIdx].nominalAngle : 0;
  var prevA = spacingInfo[Math.max(0, lastIdx - 1)] ? spacingInfo[Math.max(0, lastIdx - 1)].nominalAngle : 0;
  return lastA + (lastA - prevA) * (fi - lastIdx);
}

function claddaghGetLinePlaybackProgress(spacingInfo, latestTime, renderEnd) {
  if (!spacingInfo.length) return 0;
  if (spacingInfo.length === 1) {
    var item = spacingInfo[0];
    var targetEnd = (typeof renderEnd === 'number' && isFinite(renderEnd)) ? renderEnd : item.endTime;
    var duration = Math.max(0.001, targetEnd - item.startTime);
    return claddaghClamp((latestTime - item.startTime) / duration, 0, 1);
  }
  var fi = claddaghGetFractionalActiveIndex(spacingInfo, latestTime, renderEnd);
  return claddaghClamp(fi / Math.max(1, spacingInfo.length - 1), 0, 1);
}

/* 切歌重置保持帧（shouldHoldCladdaghFrameForPlaybackReset 照搬） */
function claddaghShouldHoldResetFrame(prevTime, curTime, centerLineIndex) {
  return centerLineIndex > 0 && curTime <= 0.5 && curTime < prevTime - 0.5;
}

/* 切线旋转角保持可读（normalizeReadableAngle 照搬） */
function claddaghNormalizeReadableAngle(deg) {
  var n = deg;
  while (n > 90) n -= 180;
  while (n < -90) n += 180;
  return n;
}

/* ---------------- 行 DOM 池 ---------------- */

function claddaghEscapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function claddaghBuildLineEntry(idx) {
  var line = lyricsLines[idx];
  if (!line) return null;
  var root = document.createElement('div');
  root.className = 'claddagh-line';
  var spacingInfo = [];
  var spans = [];
  var text = String(line.text || '');

  if (text.trim()) {
    var timeline = claddaghAdjustTimeline(
      claddaghBuildLineTimeline(line),
      line.t || 0,
      (line.t || 0) + (line.duration || 4)
    );
    spacingInfo = claddaghBuildSpacingInfo(timeline, claddaghFontPx, claddaghRx, 1, 0);
    var html = '';
    for (var i = 0; i < spacingInfo.length; i++) {
      html += '<span class="claddagh-char">' + claddaghEscapeHtml(spacingInfo[i].char) + '</span>';
    }
    root.innerHTML = html;
    var spanEls = root.children;
    for (var k = 0; k < spanEls.length; k++) spans.push(spanEls[k]);
  }

  return { root: root, spans: spans, spacingInfo: spacingInfo, line: line, idx: idx };
}

function claddaghSyncLineWindow() {
  var stage = document.getElementById('claddagh-ring-stage');
  if (!stage) return;
  var linesLen = (lyricsLines && lyricsLines.length) || 0;
  if (!linesLen) {
    claddaghClearLines();
    return;
  }
  var base = claddaghRenderBaseIdx;
  if (base < 0 || base >= linesLen) {
    base = claddaghClamp(claddaghCenterIdx, 0, linesLen - 1);
    claddaghRenderBaseIdx = base;
  }
  /* Folia lineIndicesToRender：base-1 .. base+2（过渡对 + 前一行） */
  var wanted = {};
  for (var i = Math.max(0, base - 1); i <= Math.min(linesLen - 1, base + 2); i++) wanted[i] = true;

  for (var key in claddaghLineMap) {
    if (!Object.prototype.hasOwnProperty.call(claddaghLineMap, key)) continue;
    if (!wanted[key]) {
      var dead = claddaghLineMap[key];
      if (dead.root && dead.root.parentNode) dead.root.parentNode.removeChild(dead.root);
      delete claddaghLineMap[key];
    }
  }
  for (var w in wanted) {
    if (!Object.prototype.hasOwnProperty.call(wanted, w)) continue;
    if (claddaghLineMap[w]) continue;
    var entry = claddaghBuildLineEntry(Number(w));
    if (entry) {
      claddaghLineMap[w] = entry;
      stage.appendChild(entry.root);
    }
  }
}

function claddaghClearLines() {
  for (var key in claddaghLineMap) {
    if (!Object.prototype.hasOwnProperty.call(claddaghLineMap, key)) continue;
    var e = claddaghLineMap[key];
    if (e.root && e.root.parentNode) e.root.parentNode.removeChild(e.root);
  }
  claddaghLineMap = {};
}

/* ---------------- 颜色 / 阴影档位缓存 ---------------- */

/* charProgress 的快闪曲线（progressFactor=min(1,p*15)）按 12 档量化缓存 */
function claddaghCachedCharColors(step) {
  var slot = claddaghColorCache[step];
  if (slot) return slot;
  var t = step / 12;
  var alpha = 0.55 + 0.45 * t;
  var color = t <= 0
    ? claddaghColorWithAlpha(CLADDAGH_PRIMARY, alpha)
    : claddaghMixColors(claddaghColorWithAlpha(CLADDAGH_PRIMARY, 0.55), CLADDAGH_ACCENT, t, alpha);
  slot = { color: color, alpha: alpha, step: step };
  claddaghColorCache[step] = slot;
  return slot;
}

/* text-shadow 按量化档位缓存（radius 0.5px 步进 + 颜色 12 档），
   避免每字符每帧重新拼三段长字符串。
   Folia 语义：shadowFade=clamp((r-0.5)/2,0,1)；chorus 三层(0.35/1/1.6)，
   内核向 primary 白混合 0.65 —— 此处 primary 用暖白 CORE。 */
function claddaghCachedShadow(isChorus, radius, step) {
  var rQ = Math.max(0, Math.round(radius * 2) / 2);
  if (rQ <= 0.5) return '';
  var key = (isChorus ? '1' : '0') + '|' + rQ + '|' + step;
  var hit = claddaghShadowCache[key];
  if (hit !== undefined) return hit;

  var shadowFade = claddaghClamp((rQ - 0.5) / 2.0, 0, 1);
  if (shadowFade <= 0.01) {
    claddaghShadowCache[key] = '';
    return '';
  }
  var t = step / 12;
  var currentAlpha = 0.55 + 0.45 * t;
  var targetRgb = claddaghParseChannels(
    claddaghMixColors(claddaghColorWithAlpha(CLADDAGH_PRIMARY, 0.55), CLADDAGH_ACCENT, t, 1)
  ) || [255, 255, 255];
  var faded = claddaghFormatRgba(targetRgb, currentAlpha * shadowFade);
  var out;
  if (isChorus) {
    var inner = claddaghMixColors(claddaghFormatRgba(targetRgb, 1), CLADDAGH_CORE, 0.65, shadowFade);
    out = '0 0 ' + (Math.round(rQ * 0.35 * 2) / 2) + 'px ' + inner +
      ',0 0 ' + rQ + 'px ' + faded +
      ',0 0 ' + (Math.round(rQ * 1.6 * 2) / 2) + 'px ' + faded;
  } else {
    out = '0 0 ' + rQ + 'px ' + faded;
  }
  claddaghShadowCacheCount++;
  if (claddaghShadowCacheCount > 512) {
    claddaghShadowCache = {};
    claddaghShadowCacheCount = 1;
  }
  claddaghShadowCache[key] = out;
  return out;
}

/* ---------------- 音频特征（frequencyData 自算 + 弹簧平滑） ---------------- */

function claddaghBinAvg(from, to) {
  if (typeof frequencyData === 'undefined' || !frequencyData || !frequencyData.length) return 0;
  var sum = 0, n = 0;
  var hi = Math.min(to, frequencyData.length - 1);
  for (var i = from; i <= hi; i++) { sum += frequencyData[i]; n++; }
  return n ? (sum / n) / 255 : 0;
}

/* 半隐式欧拉弹簧积分（framer-motion useSpring 的原生对位，dt 时间校正） */
function claddaghSpringStep(spring, target, k, c, dt, mass) {
  var m = mass || 1;
  var a = (k * (target - spring.value) - c * spring.vel) / m;
  spring.vel += a * dt;
  spring.value += spring.vel * dt;
  if (Math.abs(target - spring.value) < 0.0004 && Math.abs(spring.vel) < 0.0004) {
    spring.value = target;
    spring.vel = 0;
  }
}

function tickCladdaghAudio(dtSec) {
  claddaghSyncTheme();
  var bassRaw = claddaghBinAvg(1, 8);
  var vocalRaw = claddaghBinAvg(9, 140);      /* 对齐主循环 vocal 频段 bin 9-140 */
  var paused = (typeof audio !== 'undefined' && audio && audio.paused) || !claddaghMode;
  claddaghSpringStep(claddaghBassSpring, paused ? 0 : bassRaw, 150, 25, dtSec);
  claddaghSpringStep(claddaghVocalSpring, paused ? 0 : vocalRaw, 120, 24, dtSec);

  /* 副歌闸门：能量慢升慢降（auroraChorus 同思路，替代 Folia isChorus 解析标记） */
  var energyRaw = claddaghBinAvg(2, 160) * 0.7 + claddaghBinAvg(161, 300) * 0.3;
  if (paused) energyRaw = 0;
  claddaghEnergy += (energyRaw - claddaghEnergy) * Math.min(1, dtSec * 3.2);
  var chorusTarget = claddaghClamp((claddaghEnergy - 0.34) / 0.30, 0, 1);
  var kGate = chorusTarget > claddaghChorus ? 0.9 : 0.35;
  claddaghChorus += (chorusTarget - claddaghChorus) * Math.min(1, dtSec * kGate);
}

/* ---------------- 轴线（updateColors rAF 循环照搬，并入主 30fps 循环） ---------------- */

function tickCladdaghAxis() {
  var lineEl = document.getElementById('claddagh-axis');
  if (!lineEl) return;
  var bassPower = claddaghClamp(claddaghBassSpring.value, 0, 1);
  var vocalPower = claddaghClamp(claddaghVocalSpring.value, 0, 1);
  var fromColor = CLADDAGH_AXIS_FROM;
  var toColor = CLADDAGH_AXIS_TO;

  var colorPower = Math.max(bassPower, vocalPower);
  var colorDelta = Math.max(0, colorPower - 0.02);
  var colorRatio = Math.min(1.0, colorDelta / 0.58);
  var mixed = claddaghMixColors(fromColor, toColor, colorRatio, 0.2 + 0.75 * colorRatio);
  var gradient = 'linear-gradient(90deg, transparent, ' + mixed + ' 20%, ' + mixed + ' 80%, transparent)';
  lineEl.style.background = gradient;

  var bassSqr = bassPower * bassPower;
  var scaleX = 1.0 + bassSqr * 1.5;
  var scaleY = 1.0 + bassSqr * 0.5;
  var tilt = 90 - CLADDAGH_ELLIPSE_TILT_DEG;
  lineEl.style.transform = 'translate(-50%, -50%) rotate(' + tilt + 'deg) scale(' + scaleX.toFixed(3) + ', ' + scaleY.toFixed(3) + ')';

  var targetIntensity = claddaghChorus > 0.5 ? 1.0 : 0.0;
  var diff = targetIntensity - claddaghAxisGlow;
  if (Math.abs(diff) > 0.01) {
    claddaghAxisGlow = claddaghClamp(claddaghAxisGlow + (diff > 0 ? 0.05 : -0.05), 0, 1);
  } else {
    claddaghAxisGlow = targetIntensity;
  }
  if (claddaghAxisGlow > 0.001) {
    var glowSize = (4 + bassPower * 12) * claddaghAxisGlow;
    lineEl.style.filter = 'drop-shadow(0 0 ' + glowSize.toFixed(1) + 'px ' + claddaghColorWithAlpha(mixed, claddaghAxisGlow) + ')';
  } else {
    lineEl.style.filter = 'none';
  }
}

/* ---------------- 环上字符逐帧更新（RingLine handler 主体照搬） ---------------- */

/* 预计算固定 -45° 旋转系数（ellipseTiltDeg 固定 45） */
var CLADDAGH_TILT_RAD = -(CLADDAGH_ELLIPSE_TILT_DEG * Math.PI) / 180;
var CLADDAGH_TILT_COS = Math.cos(CLADDAGH_TILT_RAD);
var CLADDAGH_TILT_SIN = Math.sin(CLADDAGH_TILT_RAD);

function claddaghLineRenderEnd(lines, idx) {
  var line = lines[idx];
  if (!line) return undefined;
  var lineStart = line.t || 0;
  var own = lineStart + (line.duration || 4);
  var next = lines[idx + 1];
  return Math.max(own, next ? (next.t || 0) - CLADDAGH_NEXT_LINE_ENTRY_LEAD_SECONDS : own + 10.0);
}

function tickCladdaghRingChars(nowTime, power) {
  var lines = lyricsLines;
  if (!lines || !lines.length) return;
  var centerLineIndex = claddaghCenterIdx;
  var curLineOffset = claddaghLineOffset.value;
  var fontPx = claddaghFontPx;
  var intensityMultiplier = 0.25;
  var maxScale = 1.25;

  var scaleFactor = Math.min(1 + power * intensityMultiplier, maxScale);
  var currentRx = claddaghRx * scaleFactor;
  var R_major = currentRx;
  var R_minor = currentRx * 0.09;            /* 扁长椭圆（Folia 橙色设计） */
  var cosT = CLADDAGH_TILT_COS;
  var sinT = CLADDAGH_TILT_SIN;
  var isChorusLine = claddaghChorus > 0.55;  /* 能量闸门近似副歌 */
  var chorusAmt = claddaghChorus;

  var currentLine = lines[centerLineIndex];
  var currentLen = currentLine ? claddaghGetVisualLength(currentLine.text) : 0;

  var activeRenderEnd = claddaghLineRenderEnd(lines, claddaghRenderBaseIdx);
  var activeWordOffset = claddaghGetLineWordOffset(claddaghActiveSpacingInfo, nowTime, activeRenderEnd);
  var activeLineProgress = claddaghGetLinePlaybackProgress(claddaghActiveSpacingInfo, nowTime, activeRenderEnd);
  var backOrbitFollow = Math.PI * CLADDAGH_BACK_ORBIT_FOLLOW_RATIO *
    (1 - Math.pow(1 - activeLineProgress, 1.35));

  var maxVisibleDist = currentRx * 0.48;

  for (var key in claddaghLineMap) {
    if (!Object.prototype.hasOwnProperty.call(claddaghLineMap, key)) continue;
    var entry = claddaghLineMap[key];
    var lineIndex = entry.idx;
    var spacingInfo = entry.spacingInfo;
    var spans = entry.spans;
    var mvsLength = spacingInfo.length;
    if (!mvsLength) continue;

    var line = entry.line;
    var lineStart = line.t || 0;
    var isUpcomingLine = lineIndex > centerLineIndex;
    var upcomingEntryProgress = isUpcomingLine
      ? claddaghClamp((nowTime - (lineStart - CLADDAGH_NEXT_LINE_ENTRY_LEAD_SECONDS)) / CLADDAGH_NEXT_LINE_ENTRY_LEAD_SECONDS, 0, 1)
      : 0;
    var lineDiffFromCenter = Math.abs(curLineOffset - lineIndex * Math.PI) / Math.PI;

    /* 长短句重叠消减（lengthFade/lengthScale 照搬） */
    var targetLine = lines[lineIndex];
    var targetLen = targetLine ? claddaghGetVisualLength(targetLine.text) : 0;
    var lengthFadeFactor = 1.0;
    var lengthScaleFactor = 1.0;
    if (lineIndex > centerLineIndex && currentLen > 10) {
      var fadeStrength = claddaghClamp((currentLen - 10) / 8, 0, 1);
      var targetStrength = claddaghClamp((targetLen - 5) / 5, 0.4, 1);
      var combinedStrength = fadeStrength * targetStrength;
      var transitionProgress = claddaghClamp((lineDiffFromCenter - 0.4) / 0.5, 0, 1);
      lengthFadeFactor = 1.0 - combinedStrength * transitionProgress;
      lengthScaleFactor = 1.0 - combinedStrength * 0.25 * transitionProgress;
    }

    var ownRenderEnd = claddaghLineRenderEnd(lines, lineIndex);
    var ownWordOffset = claddaghGetLineWordOffset(spacingInfo, nowTime, ownRenderEnd);
    var wordOffset = ownWordOffset;
    if (lineIndex < centerLineIndex) {
      /* 已唱行保留自身完成时的字偏移，避免回跳 */
    } else {
      var backFollowFactor = lineIndex > centerLineIndex ? 1 : claddaghClamp(lineDiffFromCenter, 0, 1);
      wordOffset += (activeWordOffset * CLADDAGH_BACK_FOLLOW_RATIO + backOrbitFollow) * backFollowFactor;
    }

    var activeLineFactor = Math.max(0, 1 - lineDiffFromCenter);
    var lineWindowFade = claddaghClamp(2 - lineDiffFromCenter, 0, 1);
    var pastFade = lineIndex < centerLineIndex ? Math.max(0, 1 - lineDiffFromCenter) : 1;

    for (var i = 0; i < mvsLength; i++) {
      var el = spans[i];
      if (!el) continue;
      var item = spacingInfo[i];

      var theta = lineIndex * Math.PI + item.nominalAngle;
      var psi = theta - curLineOffset - wordOffset;
      var deltaDist = psi * currentRx;
      var thetaCurve = deltaDist / R_major;

      var localCos = Math.cos(thetaCurve);
      var D = (localCos + 1) / 2;
      var spacingFactor = 0.35 + 0.65 * Math.pow(D, 1.2);

      var rawX = Math.sin(thetaCurve) * R_major * spacingFactor;
      var rawY = localCos * R_minor;
      if (isChorusLine) {
        var staggerAmount = fontPx * (0.06 + power * 0.12) * chorusAmt;
        rawY += (i % 2 === 0 ? 1 : -1) * staggerAmount;
      }

      var x = rawX * cosT - rawY * sinT;
      var y = rawX * sinT + rawY * cosT;

      var tangentX = Math.cos(thetaCurve) * R_major;
      var tangentY = -Math.sin(thetaCurve) * R_minor;
      var rotTanX = tangentX * cosT - tangentY * sinT;
      var rotTanY = tangentX * sinT + tangentY * cosT;
      var tangentAngle = claddaghNormalizeReadableAngle(Math.atan2(rotTanY, rotTanX) * 180 / Math.PI);

      var distRatio = Math.min(1, Math.abs(deltaDist) / maxVisibleDist);
      var F = activeLineFactor * Math.pow(1 - distRatio, 1.8);

      var distanceOpacity = 0.68 + 0.32 * Math.pow(D, 1.9);
      var finalOpacity = (0.35 + 0.65 * Math.pow(D, 1.5) * (0.35 + 0.65 * F)) * distanceOpacity;
      finalOpacity *= lineWindowFade * pastFade * lengthFadeFactor;
      if (isUpcomingLine) finalOpacity *= (0.18 + 0.82 * upcomingEntryProgress);

      /* 边界淡出：非聚焦行严格压回椭圆后半 */
      var boundaryFade = 1.0;
      if (lineDiffFromCenter > 0.02) {
        var bp = claddaghClamp((lineDiffFromCenter - 0.3) / 0.6, 0, 1);
        var cosThreshold = 1.0 - 1.2 * bp;
        if (localCos > cosThreshold) {
          boundaryFade = claddaghClamp(1.0 - (localCos - cosThreshold) / 0.15, 0, 1);
        }
      }
      finalOpacity *= boundaryFade;

      /* 不可见早退：淡出后只写一次 visibility，跳过全部样式写入 */
      if (finalOpacity <= 0.004) {
        if (el._clVis !== false) { el.style.visibility = 'hidden'; el._clVis = false; }
        continue;
      }
      if (el._clVis === false) { el.style.visibility = 'visible'; el._clVis = true; }

      var scale = (0.22 + 0.98 * Math.pow(D, 1.5)) * (1.0 + CLADDAGH_FOCUS_SCALE_RATIO * F) * lengthScaleFactor * (item.scaleFactor || 1.0);
      var blur = 8.0 * (1 - D) * (1 - 0.5 * F);
      var tiltAngle = claddaghClamp(tangentAngle * (0.4 + 0.6 * D), -38, 38);

      el.style.transform = 'translate3d(calc(-50% + ' + x.toFixed(1) + 'px), calc(-50% + ' + y.toFixed(1) + 'px), 0px) rotate(' + tiltAngle.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
      el.style.opacity = finalOpacity.toFixed(3);
      el.style.filter = blur < 0.2 ? 'none' : 'blur(' + blur.toFixed(2) + 'px)';

      /* 逐字播放态 → 颜色快闪（camera flash） */
      var charProgress = 0;
      if (nowTime >= item.endTime) charProgress = 1;
      else if (nowTime > item.startTime) {
        var durC = item.endTime - item.startTime;
        charProgress = durC > 0 ? (nowTime - item.startTime) / durC : 1;
      }

      var progressFactor = Math.min(1, charProgress * 15.0);
      var colorStep = Math.round(progressFactor * 12);
      var colorSlot = claddaghCachedCharColors(colorStep);
      if (el._clColorStep !== colorStep) {
        el._clColorStep = colorStep;
        el.style.color = colorSlot.color;
      }

      var baseGlow = isChorusLine
        ? (36 + power * 24) * Math.pow(F, 1.5)
        : 24 * Math.pow(F, 2.0);
      var flashPop = 0;
      if (charProgress > 0 && charProgress < 0.4) {
        flashPop = Math.pow(1 - charProgress / 0.4, 2.0) * 0.65;
      }
      var glowRadius = baseGlow * (1.0 + flashPop);
      var shadowKey = claddaghCachedShadow(isChorusLine, glowRadius, colorStep);
      var nextShadow = shadowKey || 'none';
      if (el._clShadow !== nextShadow) {
        el._clShadow = nextShadow;
        el.style.textShadow = nextShadow;
      }
    }
  }
}

/* ---------------- 行切换（centerLineIndex 弹簧驱动） ---------------- */

function claddaghUpdateCenterIndex(nowTime) {
  var idx;
  try {
    idx = findStageLyricIndexAtTime(nowTime);
  } catch (e) { idx = -1; }
  if (idx < 0) idx = -1;

  /* 无真实歌词（fallback 占位行）不推进 */
  var hasReal = lyricsLines && lyricsLines.length &&
    lyricsLines.some(function (l) { return !l.fallback; });
  if (!hasReal) idx = -1;

  /* 前奏/间奏（首行之前）：保持当前环不拆（Folia recentCompletedLine 语义，
     renderEnd 漂移让环在器乐段慢转）；换歌由 watchCladdaghLyricsChange 兜底重置 */
  if (idx < 0 && claddaghCenterIdx >= 0) return;
  if (idx === claddaghCenterIdx) return;

  var prev = claddaghCenterIdx;
  claddaghCenterIdx = idx;
  if (idx < 0) return;

  /* renderBaseIndex 立即跟随（防 wordOffset 断续），跳多行时直接落位 */
  claddaghRenderBaseIdx = idx;
  claddaghLineOffset.target = idx * Math.PI;
  if (Math.abs(idx - prev) > 1 || prev < 0) {
    claddaghLineOffset.value = idx * Math.PI;
    claddaghLineOffset.vel = 0;
  }

  claddaghSyncLineWindow();
  var activeEntry = claddaghLineMap[idx];
  claddaghActiveSpacingInfo = activeEntry ? activeEntry.spacingInfo : [];
}

/* ---------------- 尺寸 / 字体 ---------------- */

function claddaghFontStack() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  var stack = (fontKey && typeof lyricFontStackForKey === 'function')
    ? lyricFontStackForKey(fontKey)
    : '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  claddaghFontStackStr = stack;
  var overlay = document.getElementById('claddagh-overlay');
  if (overlay) overlay.style.setProperty('--cl-font', stack);
  return stack;
}

function claddaghCheckFontChange() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  if (claddaghLastFontKey !== fontKey) {
    claddaghLastFontKey = fontKey;
    claddaghFontStack();
    claddaghRebuildTypography();
  }
}

/* 尺寸/字号/字体规格统一重算（resize 与字体变化共用；spacing 缓存自动按 key 失效） */
function claddaghRebuildTypography() {
  var w = window.innerWidth || 1280;
  var h = window.innerHeight || 800;
  claddaghDims.w = w;
  claddaghDims.h = h;
  claddaghRx = (w > 0 ? Math.min(w * 0.44, 560) : 360);
  /* Folia baseFontSize=72 固定；小窗下按视口收缩防溢出（本项目浏览器任意窗口） */
  var clFS = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;   /* 字号跟随「歌词大小」 */
  claddaghFontPx = Math.min(72, Math.max(40, Math.round(Math.min(w, h) * 0.085))) * clFS;
  claddaghFontSpec = '700 ' + claddaghFontPx + 'px ' + claddaghFontStackStr;
  var overlay = document.getElementById('claddagh-overlay');
  if (overlay) overlay.style.setProperty('--cl-font-size', claddaghFontPx + 'px');
  /* 行 DOM 全量重建（offsets 依赖 fontSpec）。
     注意不走 claddaghUpdateCenterIndex：行索引未变时它会 early return，
     清池后的行窗口将无人重建 → 直接按当前行索引重建。 */
  claddaghClearLines();
  claddaghRenderBaseIdx = -1;
  claddaghSyncLineWindow();
  var activeEntry2 = claddaghLineMap[claddaghCenterIdx];
  claddaghActiveSpacingInfo = (claddaghCenterIdx >= 0 && activeEntry2) ? activeEntry2.spacingInfo : [];
}

/* ---------------- 主循环（rAF 节流 ~30fps） ---------------- */

function startCladdaghLoop() {
  stopCladdaghLoop();
  var lastTick = 0;
  var lastFrame = performance.now();
  function frame(now) {
    if (!claddaghMode) return;
    var dt = Math.min(0.1, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    if (now - lastTick > 33) {
      lastTick = now;
      tickCladdaghFrame(dt, now);
    }
    claddaghRafId = requestAnimationFrame(frame);
  }
  claddaghRafId = requestAnimationFrame(frame);
  watchCladdaghLyricsChange();
}

function stopCladdaghLoop() {
  if (claddaghRafId) {
    cancelAnimationFrame(claddaghRafId);
    claddaghRafId = 0;
  }
  claddaghLyricsObserverToken++;
}

function tickCladdaghFrame(dtSec, now) {
  tickCladdaghAudio(dtSec);

  /* 行转角弹簧推进（animate spring k55/c14/m0.9） */
  claddaghSpringStep(claddaghLineOffset, claddaghLineOffset.target, 55, 14, dtSec, 0.9);

  var nowTime;
  try {
    nowTime = getAdjustedLyricPlaybackTime(audio ? (audio.currentTime || 0) : 0);
  } catch (e) { return; }

  /* 切歌重置保持帧（照搬 shouldHoldCladdaghFrameForPlaybackReset 语义） */
  if (claddaghShouldHoldResetFrame(claddaghPrevNowTime, nowTime, claddaghCenterIdx)) {
    claddaghHoldReset = true;
  }
  claddaghPrevNowTime = nowTime;

  checkFontChangeSafe();
  claddaghUpdateCenterIndex(nowTime);

  if (claddaghHoldReset && claddaghCenterIdx > 0) {
    tickCladdaghAxis();
    return;               /* 保持已完成的帧，等行索引跟上来 */
  }
  claddaghHoldReset = false;

  tickCladdaghAxis();
  tickCladdaghRingChars(nowTime, claddaghClamp(claddaghBassSpring.value, 0, 1));
}

function checkFontChangeSafe() {
  try { claddaghCheckFontChange(); } catch (e) { }
}

/* 歌词数据变化轮询（lyricsLines 无事件，aurora 同款范式） */
function watchCladdaghLyricsChange() {
  var token = ++claddaghLyricsObserverToken;
  var lastLen = -1;
  function check() {
    if (token !== claddaghLyricsObserverToken || !claddaghMode) return;
    var len = (lyricsLines && lyricsLines.length) || 0;
    if (len !== lastLen) {
      lastLen = len;
      claddaghCenterIdx = -99;      /* 强制重定位 + 重建行窗口 */
      claddaghRenderBaseIdx = -1;
      claddaghClearLines();
      var stage = document.getElementById('claddagh-ring-stage');
      if (stage) stage.setAttribute('data-lines-version', String(len));
    }
    setTimeout(check, 600);
  }
  check();
}

/* ---------------- 切换（照 09-aurora-flow.js 骨架） ---------------- */

function applyCladdaghMode(on, opts) {
  opts = opts || {};
  claddaghMode = !!on;
  /* 覆盖层互斥：经视觉模式注册表退出其它模式 */
  if (claddaghMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('claddagh', { save: true });
  }
  document.body.classList.toggle('claddagh', claddaghMode);
  var overlay = document.getElementById('claddagh-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', claddaghMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(CLADDAGH_STORE_KEY, claddaghMode);
  if (claddaghMode) {
    startCladdagh();
  } else {
    stopCladdagh();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(claddaghMode ? '环歌已开启' : '已切回标准模式');
}

function toggleCladdaghMode() {
  applyCladdaghMode(!claddaghMode, { save: true, toast: true });
}

function startCladdagh() {
  claddaghFontStack();
  claddaghRebuildTypography();
  claddaghPrevNowTime = 0;
  claddaghHoldReset = false;
  claddaghCenterIdx = -99;
  claddaghRenderBaseIdx = -1;
  claddaghLineOffset.value = 0;
  claddaghLineOffset.vel = 0;
  claddaghLineOffset.target = 0;
  claddaghBassSpring.value = 0;
  claddaghBassSpring.vel = 0;
  claddaghVocalSpring.value = 0;
  claddaghVocalSpring.vel = 0;
  claddaghChorus = 0;
  claddaghEnergy = 0;
  claddaghAxisGlow = 0;
  claddaghActiveSpacingInfo = [];
  claddaghClearLines();
  startCladdaghLoop();
}

function stopCladdagh() {
  stopCladdaghLoop();
  claddaghClearLines();
  claddaghActiveSpacingInfo = [];
  claddaghCenterIdx = -99;
  claddaghRenderBaseIdx = -1;
  claddaghChorus = 0;
  claddaghEnergy = 0;
}

/* ---------------- resize ---------------- */

function onCladdaghResize() {
  if (!claddaghMode) return;
  claddaghRebuildTypography();
}

/* ---------------- 启动绑定 ---------------- */

function initCladdagh() {
  applyCladdaghMode(claddaghMode, { save: false });
  window.addEventListener('resize', function () {
    clearTimeout(claddaghResizeTimer);
    claddaghResizeTimer = setTimeout(onCladdaghResize, 180);
  });
}

/* 延迟到 DOM 就绪后初始化（本模块在 index-loader 末尾加载，DOM 已就绪） */
scheduleUiWarmTask ? scheduleUiWarmTask(initCladdagh, 320) : setTimeout(initCladdagh, 320);
