/* =========================================================================
   OrangeSea · 烟纸（Fume · 排版相机歌词）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0)
   源映射（公式/算法逐行照搬，宿主全部换掉）：
     fumeMath.ts / colorMix.ts            → §1 §2 数值与颜色工具
     @chthenglou/pretext                  → §3 原生 Canvas measureText 等价测量层
     utils/lyrics/{renderHints,graphemeTiming}.ts → §4 §5 行渲染提示与逐字时序
     fumeTextMeasure.ts / fumeReveal.ts   → §6 §7 文本测量与揭示进度
     fumeTextStyle.ts / fumeBlockFrame.ts → §8 §9 块时机与静态快照决策
     fumeArticleLayout.ts                 → §10 文章排版（列数/密度二分）
     fumeCamera.ts / fumeCameraStep.ts    → §11 §12 相机焦点/重定向/弹簧步进
     FumeBackground.ts                    → §13 几何纸面背景
     fumeCanvasText.ts / fumeLiveRaster.ts→ §14 §15 逐字光栅与限尺度活动光栅
     useFumeCanvasStage.ts / fumeStage.ts → §16 30fps 舞台（MotionValue→motionSignalGet）
     VisualizerFume.tsx                   → §17 applyFumeMode 壳（React 生命周期→显式 enter/exit）

   概念：把整首歌词排成一张多栏「报纸」，相机沿演唱进度逐句飞近——
   未唱的字淡淡的（waiting），演唱中的字逐字打印并有落章光斑（active），
   唱过的字退成铅灰余温（passed）。歌放完后相机拉远看整张纸（overview）。

   宿主改造纪律（照 09-aurora-flow.js 范本）：
     · React useEffect/rAF → 自有 30fps rAF 循环 + 进出显式 applyFumeMode(on,{save})
     · framer-motion MotionValue → motionSignalGet('audioPower'/'bands')，
       覆盖层期间主循环被保温门控暂停信号写入 → frequencyData 自算回退
     · 歌词时间 = getAdjustedLyricPlaybackTime(audio.currentTime)（歌词坐标系）
     · 覆盖层互斥经视觉模式注册表；进入临时切 eco 质量档，退出恢复
   ========================================================================= */

var FUME_STORE_KEY = 'orangesea-fume-v1';
var fumeMode = readBooleanPreference(FUME_STORE_KEY, false);
var fumeRafId = 0;
var fumePrevQuality = null;
var fumeObserver = null;
var fumeResizeTimer = 0;
var fumeLastLineIdx = -99;
var fumeLastFontKey = null;
var fumeTrackTitle = '';
var fumeTrackArtist = '';

/* Folia DEFAULT_FUME_TUNING（无设置面板，取默认；textHoldRatio=1 → passed 恒标准亮度；
   disableGeometricBackground 原版默认 true——几何纸面装饰默认关，观感与开销都对齐原版） */
var fumeTuning = {
  hidePrintSymbols: false,
  disableGeometricBackground: true,
  backgroundObjectOpacity: 0.5,
  textHoldRatio: 1,
  cameraTrackingMode: 'smooth',
  cameraSpeed: 1,
  glowIntensity: 1,
  heroScale: 1
};

/* ============================ §1 数值工具（fumeMath.ts） ============================ */

var fumeGraphemeSegmenter = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

function fumeSplitGraphemes(text) {
  if (!text) return [];
  if (fumeGraphemeSegmenter) {
    var out = [];
    var iter = fumeGraphemeSegmenter.segment(String(text))[Symbol.iterator]();
    var step;
    while ((step = iter.next()) && !step.done) out.push(step.value.segment);
    return out;
  }
  return Array.from(String(text));
}

function fumeClamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function fumeMix(from, to, amount) { return from + (to - from) * amount; }
function fumeQuadraticBezier(from, control, to, amount) {
  var normalized = fumeClamp(amount, 0, 1);
  var inverse = 1 - normalized;
  return inverse * inverse * from + 2 * inverse * normalized * control + normalized * normalized * to;
}
function fumeEaseOutCubic(v) { return 1 - Math.pow(1 - fumeClamp(v, 0, 1), 3); }
function fumeEaseInCubic(v) { return Math.pow(fumeClamp(v, 0, 1), 3); }
function fumeEaseInOutCubic(v) {
  var n = fumeClamp(v, 0, 1);
  return n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2;
}
function fumeResolveDelayedGlowEnvelope(progress, peakProgress) {
  var normalized = fumeClamp(progress, 0, 1);
  var clampedPeak = fumeClamp(peakProgress == null ? 0.8 : peakProgress, 0.05, 0.95);
  if (normalized <= clampedPeak) return fumeEaseOutCubic(normalized / clampedPeak);
  return 1 - fumeEaseInCubic((normalized - clampedPeak) / (1 - clampedPeak));
}
function fumeIsCJK(text) { return /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text); }
function fumeHashString(input) {
  var hash = 2166136261;
  var s = String(input);
  for (var i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function fumeSeeded(seed) { return (fumeHashString(seed) % 10000) / 10000; }

/* ============================ §2 颜色工具（colorMix.ts） ============================ */

var FUME_FALLBACK_RGB = { r: 255, g: 255, b: 255 };

function fumeFormatRgba(r, g, b, alpha) {
  return 'rgba(' + Math.round(fumeClamp(r, 0, 255)) + ', ' +
    Math.round(fumeClamp(g, 0, 255)) + ', ' +
    Math.round(fumeClamp(b, 0, 255)) + ', ' + alpha + ')';
}

function fumeParseColorChannels(color) {
  var c = typeof color === 'string' ? color.trim() : '';
  if (!c) return null;
  if (c.charAt(0) === '#') {
    var hex = c.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16)
      };
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
    }
    return null;
  }
  var m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) {
    var parts = m[1].split(',').slice(0, 3);
    var r = parseFloat(parts[0]), g = parseFloat(parts[1]), b = parseFloat(parts[2]);
    if (isFinite(r) && isFinite(g) && isFinite(b)) return { r: r, g: g, b: b };
  }
  return null;
}

function fumeColorWithAlpha(color, alpha) {
  var a = fumeClamp(alpha, 0, 1);
  var ch = fumeParseColorChannels(color);
  if (!ch) ch = FUME_FALLBACK_RGB;
  return fumeFormatRgba(ch.r, ch.g, ch.b, a);
}

function fumeMixColors(from, to, amount, alpha) {
  var amt = fumeClamp(amount, 0, 1);
  var a = fumeClamp(alpha == null ? 1 : alpha, 0, 1);
  var f = fumeParseColorChannels(from);
  var t = fumeParseColorChannels(to);
  if (!f || !t) return fumeColorWithAlpha(amt >= 0.5 ? to : from, a);
  return fumeFormatRgba(
    fumeMix(f.r, t.r, amt), fumeMix(f.g, t.g, amt), fumeMix(f.b, t.b, amt), a);
}

/* ============================ §3 原生测量层（@chthenglou/pretext 等价） ============================
   pretext 的 prepareWithSegments/layoutWithLines 用 measureText 做段（不可断单元）
   测量与贪心换行。这里用同一结构原生实现：
     · 段切分 CJK 感知：拉丁词/空白各成段、CJK 每字一段（可在任意汉字间断行）、
       标点每字一段——保证中文长句能正常折行；
     · prepared.segments[] / widths[] / breakableFitAdvances[][] 与 Folia 消费端
       （getPartialSegmentWidth / widthBetweenOffsets）语义一致；
     · 全部测量走缓存（布局是低频路径：切歌/resize/字体变化才重建）。 */

var fumeMeasureCanvas = null;
var fumeMeasureWidthCache = new Map();

function fumeMeasureTextWidth(fontSpec, text) {
  var key = fontSpec + '\u0000' + text;
  var cached = fumeMeasureWidthCache.get(key);
  if (cached != null) return cached;
  if (!fumeMeasureCanvas) fumeMeasureCanvas = document.createElement('canvas');
  var ctx = fumeMeasureCanvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = fontSpec;
  var w = ctx.measureText(text).width;
  if (fumeMeasureWidthCache.size > 8000) fumeMeasureWidthCache.clear();
  fumeMeasureWidthCache.set(key, w);
  return w;
}

function fumeSplitLayoutSegments(text) {
  var graphemes = fumeSplitGraphemes(text);
  var segs = [];
  var cur = '';
  var curType = 0;          /* 1=词 2=空白 3=CJK 4=其它 */
  for (var i = 0; i < graphemes.length; i++) {
    var g = graphemes[i];
    var t = /\s/.test(g) ? 2 : (/[A-Za-z0-9'’\-_]/.test(g) ? 1 : (fumeIsCJK(g) ? 3 : 4));
    if (cur) {
      if (t === 3 || t === 4) { segs.push(cur); cur = ''; curType = 0; }
      else if (t !== curType) { segs.push(cur); cur = ''; curType = 0; }
    }
    cur += g;
    curType = t;
  }
  if (cur) segs.push(cur);
  return segs;
}

/* prepareWithSegments：pretext 语义（prepare 一次测量、layout 纯算术）+ 尺寸线性缩放。
   排版搜索会对每行做 4 列数 × 8 密度 × 8 字号 ≈ 256 次 prepare——段测量只在 100px
   归一化字号做一次（canvas 文本宽度与字号成线性），其余字号的宽度/前进量全部乘
   scale 得到，缓存跨全部排版尝试与重建复用（36 行歌从 9.7s 测量风暴降到毫秒级）。 */
var FUME_MEASURE_REF_PX = 100;
var fumePreparedRefCache = new Map();

function fumePrepareRef(text, variant, fontFamily) {
  var key = variant + '\u0000' + fontFamily + '\u0000' + text;
  var cached = fumePreparedRefCache.get(key);
  if (cached) return cached;
  var refSpec = fumeBuildFontSpec(FUME_MEASURE_REF_PX, variant, fontFamily);
  var segments = fumeSplitLayoutSegments(text);
  var widths = new Array(segments.length);
  var advances = new Array(segments.length);
  for (var si = 0; si < segments.length; si++) {
    var seg = segments[si];
    var total = fumeMeasureTextWidth(refSpec, seg);
    widths[si] = total;
    var gs = fumeSplitGraphemes(seg);
    var adv = new Array(gs.length);
    var acc = 0;
    for (var gi = 0; gi < gs.length; gi++) {
      var prefixW = gs.length === 1 ? total : fumeMeasureTextWidth(refSpec, gs.slice(0, gi + 1).join(''));
      adv[gi] = Math.max(prefixW - acc, 0);
      acc = prefixW;
    }
    advances[si] = adv;
  }
  var prepared = { segments: segments, widths: widths, breakableFitAdvances: advances };
  if (fumePreparedRefCache.size > 2000) fumePreparedRefCache.clear();
  fumePreparedRefCache.set(key, prepared);
  return prepared;
}

function fumePrepareWithSegments(text, fontPx, variant, fontFamily) {
  var ref = fumePrepareRef(text, variant, fontFamily);
  var scale = fontPx / FUME_MEASURE_REF_PX;
  var widths = new Array(ref.widths.length);
  for (var i = 0; i < widths.length; i++) widths[i] = ref.widths[i] * scale;
  var advances = new Array(ref.breakableFitAdvances.length);
  for (var s = 0; s < advances.length; s++) {
    var src = ref.breakableFitAdvances[s];
    var dst = new Array(src.length);
    for (var g = 0; g < src.length; g++) dst[g] = src[g] * scale;
    advances[s] = dst;
  }
  return { segments: ref.segments, widths: widths, breakableFitAdvances: advances };
}

/* layoutWithLines(prepared, width)：贪心换行，行游标 { segmentIndex, graphemeIndex } 与
   cursorToGlobalOffset 消费端一致（行边界永远落在段边界上） */
function fumeLayoutWithLines(prepared, maxWidth) {
  var rawLines = [];
  var curIdx = [];
  var curWidth = 0;
  var lineStartSi = 0;
  var si = 0;
  while (si < prepared.segments.length) {
    var seg = prepared.segments[si];
    var w = prepared.widths[si];
    var isSpace = /^\s+$/.test(seg);
    if (curWidth > 0 && !isSpace && curWidth + w > maxWidth && curIdx.length > 0) {
      rawLines.push({ idx: curIdx, width: curWidth, startSi: lineStartSi, endSi: si });
      curIdx = [];
      curWidth = 0;
      lineStartSi = si;
      continue;               /* 重试当前段（成为新行首） */
    }
    curIdx.push(si);
    curWidth += w;
    si++;
  }
  if (curIdx.length || rawLines.length === 0) {
    rawLines.push({ idx: curIdx, width: curWidth, startSi: lineStartSi, endSi: prepared.segments.length });
  }
  var lines = [];
  for (var li = 0; li < rawLines.length; li++) {
    var rl = rawLines[li];
    var text = '';
    for (var k = 0; k < rl.idx.length; k++) text += prepared.segments[rl.idx[k]];
    text = text.replace(/\s+$/, '');       /* pre-wrap：行尾空白不占版面 */
    lines.push({
      text: text,
      start: { segmentIndex: rl.startSi, graphemeIndex: 0 },
      end: { segmentIndex: rl.endSi, graphemeIndex: 0 },
      width: rl.width
    });
  }
  return { lines: lines, lineCount: lines.length };
}

/* ============================ §4 行渲染提示（utils/lyrics/renderHints.ts） ============================ */

var FUME_MICRO_LINE_DURATION_THRESHOLD = 0.10;
var FUME_SHORT_LINE_DURATION_THRESHOLD = 0.18;
var FUME_MICRO_LINE_RENDER_FLOOR = 0.067;

function fumeGetLineTransitionTiming(rawDuration, lineTransitionMode, wordRevealMode) {
  if (lineTransitionMode === 'none') return { enterDuration: 0, exitDuration: 0, linePassHold: 0 };
  if (lineTransitionMode === 'fast') {
    return {
      enterDuration: fumeClamp(rawDuration * 0.45, 0.045, 0.06),
      exitDuration: fumeClamp(rawDuration * 0.22, 0.03, 0.04),
      linePassHold: wordRevealMode === 'instant' ? 0 : 0.03
    };
  }
  return {
    enterDuration: Math.min(0.42, Math.max(0.22, Math.max(rawDuration, 0.12) * 0.34)),
    exitDuration: Math.min(0.32, Math.max(0.18, Math.max(rawDuration, 0.12) * 0.18)),
    linePassHold: wordRevealMode === 'instant' ? 0 : 0.06
  };
}

function fumeBuildLineRenderHints(line) {
  var rawDuration = Math.max(line.endTime - line.startTime, 0);
  var timingClass = rawDuration < FUME_MICRO_LINE_DURATION_THRESHOLD ? 'micro'
    : rawDuration < FUME_SHORT_LINE_DURATION_THRESHOLD ? 'short' : 'normal';
  var lineTransitionMode = timingClass === 'micro' ? 'none' : timingClass === 'short' ? 'fast' : 'normal';
  var wordRevealMode = timingClass === 'micro' ? 'instant' : timingClass === 'short' ? 'fast' : 'normal';

  var renderEndTime;
  if (lineTransitionMode === 'none') {
    renderEndTime = Math.max(line.endTime, line.startTime + FUME_MICRO_LINE_RENDER_FLOOR);
  } else {
    var tt = fumeGetLineTransitionTiming(rawDuration, lineTransitionMode, wordRevealMode);
    var lastWord = line.words && line.words.length ? line.words[line.words.length - 1] : null;
    var lastWordEnd = lastWord ? lastWord.endTime : line.endTime;
    var linePassStart = Math.max(lastWordEnd, line.startTime) + tt.linePassHold;
    var exitStart = lineTransitionMode === 'fast'
      ? Math.max(line.startTime + tt.enterDuration + 0.01, linePassStart, line.endTime - tt.exitDuration)
      : Math.max(linePassStart, line.endTime - tt.exitDuration);
    renderEndTime = Math.max(line.endTime, exitStart + tt.exitDuration);
  }
  return {
    rawDuration: rawDuration,
    timingClass: timingClass,
    renderEndTime: renderEndTime,
    lineTransitionMode: lineTransitionMode,
    wordRevealMode: wordRevealMode
  };
}

function fumeGetLineRenderEndTime(line) {
  if (!line) return Number.NEGATIVE_INFINITY;
  return line.renderHints ? line.renderHints.renderEndTime : line.endTime;
}

/* ============================ §5 逐字时序（utils/lyrics/graphemeTiming.ts） ============================ */

function fumeBuildWordGraphemeTimings(word) {
  /* MineRadio 无音节数据（syllables 恒缺）→ even 分割路径照搬 */
  var graphemes = fumeSplitGraphemes(word.text);
  if (!graphemes.length) return [];
  var duration = Math.max(word.endTime - word.startTime, 0);
  var unit = duration / graphemes.length;
  var out = new Array(graphemes.length);
  for (var i = 0; i < graphemes.length; i++) {
    out[i] = {
      char: graphemes[i],
      startTime: word.startTime + unit * i,
      endTime: i === graphemes.length - 1 ? word.endTime : word.startTime + unit * (i + 1)
    };
  }
  return out;
}

/* ============================ §6 文本测量（fumeTextMeasure.ts） ============================ */

function fumeBuildSegmentMetas(prepared) {
  var segmentMetas = [];
  var graphemes = [];
  var graphemeCursor = 0;
  for (var i = 0; i < prepared.segments.length; i++) {
    var sg = fumeSplitGraphemes(prepared.segments[i]);
    segmentMetas.push({
      graphemeStart: graphemeCursor,
      graphemeEnd: graphemeCursor + sg.length,
      graphemeCount: sg.length
    });
    for (var k = 0; k < sg.length; k++) graphemes.push(sg[k]);
    graphemeCursor += sg.length;
  }
  return { graphemes: graphemes, segmentMetas: segmentMetas };
}

function fumeCursorToGlobalOffset(cursor, segmentMetas) {
  if (!segmentMetas.length) return 0;
  var segment = segmentMetas[cursor.segmentIndex];
  if (!segment) return segmentMetas[segmentMetas.length - 1].graphemeEnd;
  return fumeClamp(segment.graphemeStart + cursor.graphemeIndex, segment.graphemeStart, segment.graphemeEnd);
}

function fumeGetPartialSegmentWidth(prepared, segmentIndex, segmentMeta, startOffset, endOffset) {
  var localStart = fumeClamp(startOffset - segmentMeta.graphemeStart, 0, segmentMeta.graphemeCount);
  var localEnd = fumeClamp(endOffset - segmentMeta.graphemeStart, 0, segmentMeta.graphemeCount);
  if (localEnd <= localStart) return 0;
  if (localStart === 0 && localEnd === segmentMeta.graphemeCount) {
    return prepared.widths[segmentIndex] || 0;
  }
  var advances = prepared.breakableFitAdvances[segmentIndex];
  if (advances && advances.length > 0) {
    var width = 0;
    for (var i = localStart; i < localEnd; i++) width += advances[i] || 0;
    return width;
  }
  var fullWidth = prepared.widths[segmentIndex] || 0;
  if (segmentMeta.graphemeCount === 0) return fullWidth;
  return fullWidth * ((localEnd - localStart) / segmentMeta.graphemeCount);
}

function fumeWidthBetweenOffsets(prepared, segmentMetas, startOffset, endOffset) {
  if (endOffset <= startOffset) return 0;
  var width = 0;
  for (var i = 0; i < segmentMetas.length; i++) {
    var meta = segmentMetas[i];
    if (endOffset <= meta.graphemeStart) break;
    if (startOffset >= meta.graphemeEnd) continue;
    width += fumeGetPartialSegmentWidth(prepared, i, meta,
      Math.max(startOffset, meta.graphemeStart), Math.min(endOffset, meta.graphemeEnd));
  }
  return width;
}

function fumeBuildGlyphOffsets(prepared, segmentMetas, startOffset, graphemeCount) {
  var offsets = new Array(graphemeCount);
  for (var i = 0; i < graphemeCount; i++) {
    offsets[i] = fumeWidthBetweenOffsets(prepared, segmentMetas, startOffset, startOffset + i);
  }
  return offsets;
}

function fumeResolveGlyphAdvance(renderLine, graphemeIndex) {
  var currentOffset = renderLine.glyphOffsets[graphemeIndex] || 0;
  var nextOffset = graphemeIndex < renderLine.graphemes.length - 1
    ? (renderLine.glyphOffsets[graphemeIndex + 1] || renderLine.width)
    : renderLine.width;
  return Math.max(nextOffset - currentOffset, 0);
}

var fumeSegmentOffsetCache = new Map();

function fumeMeasureSegmentGlyphOffsets(text, fontSpec) {
  var cacheKey = fontSpec + '\u0000' + text;
  var cached = fumeSegmentOffsetCache.get(cacheKey);
  if (cached) return cached;
  var graphemes = fumeSplitGraphemes(text);
  var offsets = new Array(graphemes.length + 1).fill(0);
  if (typeof document !== 'undefined') {
    if (!fumeMeasureCanvas) fumeMeasureCanvas = document.createElement('canvas');
    var ctx = fumeMeasureCanvas.getContext('2d');
    if (ctx) {
      ctx.font = fontSpec;
      for (var i = 1; i <= graphemes.length; i++) {
        offsets[i] = ctx.measureText(graphemes.slice(0, i).join('')).width;
      }
    }
  }
  if (fumeSegmentOffsetCache.size > 8000) fumeSegmentOffsetCache.clear();
  fumeSegmentOffsetCache.set(cacheKey, offsets);
  return offsets;
}

function fumeBuildFontSpec(fontPx, variant, fontFamily) {
  /* resolveThemeFontWeight(theme, hero?780:640)：无用户字重配置，取默认 */
  var fontWeight = variant === 'hero' ? 780 : 640;
  return fontWeight + ' ' + fontPx + 'px ' + fontFamily;
}

function fumeBuildRenderSegments(prepared, segmentMetas, lineStart, lineEnd, fontSpec) {
  var segments = [];
  for (var si = 0; si < segmentMetas.length; si++) {
    var meta = segmentMetas[si];
    if (lineEnd <= meta.graphemeStart) break;
    if (lineStart >= meta.graphemeEnd) continue;
    var start = Math.max(lineStart, meta.graphemeStart);
    var end = Math.min(lineEnd, meta.graphemeEnd);
    if (end <= start) continue;
    var localStart = start - lineStart;
    var localEnd = end - lineStart;
    var segmentText = prepared.segments[si] || '';
    var segmentGraphemes = fumeSplitGraphemes(segmentText);
    var text = (start === meta.graphemeStart && end === meta.graphemeEnd)
      ? segmentText
      : segmentGraphemes.slice(start - meta.graphemeStart, end - meta.graphemeStart).join('');
    segments.push({
      text: text,
      start: start,
      end: end,
      localStart: localStart,
      localEnd: localEnd,
      x: fumeWidthBetweenOffsets(prepared, segmentMetas, lineStart, start),
      width: fumeWidthBetweenOffsets(prepared, segmentMetas, start, end),
      isFullSegment: start === meta.graphemeStart && end === meta.graphemeEnd,
      measuredGlyphOffsets: fumeMeasureSegmentGlyphOffsets(text, fontSpec)
    });
  }
  return segments;
}

function fumeBuildWordRangeIndexByOffset(graphemeCount, wordRanges, rangeKind) {
  var indices = new Array(graphemeCount).fill(-1);
  for (var r = 0; r < wordRanges.length; r++) {
    var range = wordRanges[r];
    var start = rangeKind === 'color' ? range.colorStart : range.start;
    var end = rangeKind === 'color' ? range.colorEnd : range.end;
    for (var off = start; off < end && off < graphemeCount; off++) indices[off] = r;
  }
  return indices;
}

function fumeCountRenderableGraphemes(text) {
  var gs = fumeSplitGraphemes(text);
  var n = 0;
  for (var i = 0; i < gs.length; i++) {
    if (gs[i].trim().length > 0) n++;
  }
  return n;
}

function fumeBuildPreparedSingleLine(text, fontFamily, width, variant, lyricsFontScale, densityScale, heroScale) {
  var low = variant === 'hero' ? 18 : 10;
  var high = variant === 'hero' ? 58 : 30;
  var best = null;
  /* 尽量让大多数块保持单行：对字号做小二分，放不下再回退 */
  for (var iter = 0; iter < 8; iter++) {
    var candidateFontPx = ((low + high) / 2) * lyricsFontScale * densityScale * (variant === 'hero' ? heroScale : 1);
    var prepared = fumePrepareWithSegments(text, candidateFontPx, variant, fontFamily);
    var layout = fumeLayoutWithLines(prepared, width);
    if (layout.lineCount <= 1) {
      best = { fontPx: candidateFontPx, prepared: prepared, layout: layout };
      low = (low + high) / 2;
    } else {
      high = (low + high) / 2;
    }
  }
  if (best) return best;
  var fallbackFontPx = (variant === 'hero' ? 18 : 10) * lyricsFontScale * densityScale * (variant === 'hero' ? heroScale : 1);
  var preparedFallback = fumePrepareWithSegments(text, fallbackFontPx, variant, fontFamily);
  return {
    fontPx: fallbackFontPx,
    prepared: preparedFallback,
    layout: fumeLayoutWithLines(preparedFallback, width)
  };
}

function fumeResolveRenderLineOffset(renderLine, localOffset) {
  if (localOffset <= 0) return 0;
  if (localOffset >= renderLine.graphemes.length) return renderLine.width;
  return renderLine.glyphOffsets[localOffset] != null ? renderLine.glyphOffsets[localOffset] : renderLine.width;
}

function fumeResolveSegmentGlyphOffset(segment, globalOffset) {
  var localOffset = fumeClamp(globalOffset - segment.start, 0, segment.measuredGlyphOffsets.length - 1);
  return segment.measuredGlyphOffsets[localOffset] || 0;
}

function fumeResolveSegmentGlyphAdvance(segment, globalOffset) {
  var localOffset = fumeClamp(globalOffset - segment.start, 0, segment.measuredGlyphOffsets.length - 2);
  var current = segment.measuredGlyphOffsets[localOffset] || 0;
  var next = segment.measuredGlyphOffsets[localOffset + 1] != null ? segment.measuredGlyphOffsets[localOffset + 1] : current;
  return Math.max(next - current, 0);
}

/* ============================ §7 揭示进度（fumeReveal.ts） ============================ */

function fumeBuildWordRangesFromWords(line, graphemes) {
  if (!line.words.length || !graphemes.length) return [];
  var rangedWords = [];
  for (var i = 0; i < line.words.length; i++) {
    if (fumeSplitGraphemes(line.words[i].text).length > 0) rangedWords.push(line.words[i]);
  }
  if (!rangedWords.length) return [];
  var ranges = [];
  var cursor = 0;
  for (var wi = 0; wi < rangedWords.length; wi++) {
    var word = rangedWords[wi];
    var wordGraphemes = fumeSplitGraphemes(word.text);
    var start = fumeClamp(cursor, 0, graphemes.length);
    var end = fumeClamp(start + wordGraphemes.length, start, graphemes.length);
    /* 词文本缺词间空格时，把紧随的空白并入当前词区间，保持视觉流连续 */
    while (end < graphemes.length && /\s/.test(graphemes[end])) end++;
    ranges.push({
      wordIndex: wi,
      word: word,
      start: start,
      end: end,
      colorStart: start,
      colorEnd: end,
      graphemeTimings: fumeBuildWordGraphemeTimings(word)
    });
    cursor = end;
  }
  return ranges;
}

function fumeResolveWordRevealProgress(range, currentTimeValue) {
  if (range.word.endTime <= range.word.startTime) {
    return currentTimeValue >= range.word.endTime ? 1 : 0;
  }
  var duration = Math.max(range.word.endTime - range.word.startTime, 0.08);
  return fumeClamp((currentTimeValue - range.word.startTime) / duration, 0, 1);
}

function fumeResolvePrintedGlyphsInRange(range, currentTimeValue) {
  var length = Math.max(range.end - range.start, 0);
  if (length === 0) return 0;
  if (currentTimeValue < range.word.startTime) return 0;
  /* 无音节数据 → 词内均分路径 */
  var progress = fumeResolveWordRevealProgress(range, currentTimeValue);
  if (progress >= 1) return length;
  return fumeClamp(
    Math.floor(progress * length + 0.2),
    progress > 0 ? 1 : 0,
    length);
}

function fumeResolveLinePassCutoffTime(line, nextLineStartTime) {
  var renderEndTime = fumeGetLineRenderEndTime(line);
  if (typeof nextLineStartTime !== 'number' || !isFinite(nextLineStartTime)) return renderEndTime;
  return Math.min(renderEndTime, nextLineStartTime);
}

function fumeResolveVisualProgressWithCutoff(startedAt, duration, currentTimeValue, cutoffTime) {
  var nominalEndTime = startedAt + Math.max(duration, 0.001);
  var effectiveEndTime = Math.max(startedAt + 0.001, Math.min(nominalEndTime, cutoffTime));
  return fumeClamp(
    (currentTimeValue - startedAt) / Math.max(effectiveEndTime - startedAt, 0.001), 0, 1);
}

function fumeResolvePrintedGraphemeCount(line, wordRanges, graphemeCount, currentTimeValue) {
  if (graphemeCount === 0) return 0;
  if (currentTimeValue < line.startTime) return 0;
  if (currentTimeValue >= line.endTime) return graphemeCount;
  if (wordRanges.length === 0) {
    var duration = Math.max(line.endTime - line.startTime, 0.12);
    var progress = fumeClamp((currentTimeValue - line.startTime) / duration, 0, 1);
    return fumeClamp(Math.floor(progress * graphemeCount + (progress > 0 ? 1 : 0)), 0, graphemeCount);
  }
  var printed = 0;
  for (var i = 0; i < wordRanges.length; i++) {
    var range = wordRanges[i];
    var partial = fumeResolvePrintedGlyphsInRange(range, currentTimeValue);
    printed = range.start + partial;
    if (partial < range.end - range.start) return fumeClamp(printed, 0, graphemeCount);
  }
  return fumeClamp(printed, 0, graphemeCount);
}

function fumeResolvePrintedGraphemeProgress(line, wordRanges, graphemeCount, currentTimeValue) {
  if (graphemeCount === 0) return 0;
  if (currentTimeValue < line.startTime) return 0;
  if (currentTimeValue >= line.endTime) return graphemeCount;
  if (wordRanges.length === 0) {
    var duration = Math.max(line.endTime - line.startTime, 0.12);
    var progress = fumeClamp((currentTimeValue - line.startTime) / duration, 0, 1);
    return fumeClamp(progress * graphemeCount, 0, graphemeCount);
  }
  var printed = 0;
  for (var i = 0; i < wordRanges.length; i++) {
    var range = wordRanges[i];
    if (currentTimeValue < range.word.startTime) return fumeClamp(printed, 0, graphemeCount);
    var progress = fumeResolveWordRevealProgress(range, currentTimeValue);
    var length = Math.max(range.end - range.start, 0);
    printed = range.start + progress * length;
    if (progress < 1) return fumeClamp(printed, 0, graphemeCount);
  }
  return fumeClamp(printed, 0, graphemeCount);
}

/* ============================ §8 文字样式（fumeTextStyle.ts，wordColoring 简化） ============================ */

function fumeResolvePassedTextStyle(variant, textHoldStyle) {
  return textHoldStyle === 'dimmed'
    ? {
      opacity: variant === 'hero' ? 0.11 : 0.075,
      glowMultiplier: 0,
      shadowAlphaBase: 0,
      shadowAlphaTrail: 0
    }
    : {
      opacity: variant === 'hero' ? 0.74 : 0.58,
      glowMultiplier: 1,
      shadowAlphaBase: 0.1,
      shadowAlphaTrail: 0.16
    };
}

function fumeResolvePassedDimAmount(currentTimeValue, passedAt, fadeDuration) {
  if (!isFinite(currentTimeValue) || !isFinite(passedAt) || !isFinite(fadeDuration) || fadeDuration <= 0) return 1;
  var passedAge = Math.max(currentTimeValue - passedAt, 0);
  return fumeEaseInCubic(fumeClamp(passedAge / fadeDuration, 0, 1));
}

function fumeResolvePassedFadeDuration(lines, textHoldRatio) {
  if (textHoldRatio >= 1) return Number.POSITIVE_INFINITY;
  var timed = [];
  for (var i = 0; i < lines.length; i++) {
    var st = lines[i].startTime, et = fumeGetLineRenderEndTime(lines[i]);
    if (isFinite(st) && isFinite(et) && et >= st) timed.push({ startTime: st, endTime: et });
  }
  timed.sort(function (a, b) { return a.startTime - b.startTime; });
  if (timed.length <= 1) return fumeClamp(8 * textHoldRatio, 2.4, 130);
  var first = timed[0], last = timed[timed.length - 1];
  var totalDuration = Math.max(last.endTime - first.startTime, 0);
  return fumeClamp(totalDuration * textHoldRatio, 2.4, 130);
}

/* MineRadio 无关键词调色板（Folia wordColors）→ 激活字恒用主题强调色 */
function fumeGetActiveColor() { return fumeTheme.accentColor; }

/* ============================ §9 块时机与静态快照决策（fumeBlockFrame.ts） ============================ */

function fumeResolveGlowBases(animationIntensity, glowIntensity) {
  return {
    activeGlowBoost: (animationIntensity === 'chaotic' ? 1.15 : animationIntensity === 'calm' ? 0.72 : 0.92) * glowIntensity,
    passedGlowBase: (animationIntensity === 'chaotic' ? 0.95 : animationIntensity === 'calm' ? 0.35 : 0.62) * glowIntensity
  };
}

function fumeIsBlockOnScreen(block, camera, viewport, overscan) {
  var os = overscan == null ? 180 : overscan;
  var screenScale = camera.scale;
  var screenLeft = viewport.width * 0.5 + (block.x - camera.x) * screenScale;
  var screenTop = viewport.height * 0.5 + (block.y - camera.y) * screenScale;
  var screenRight = screenLeft + block.width * screenScale;
  var screenBottom = screenTop + block.height * screenScale;
  return !(screenRight < -os || screenLeft > viewport.width + os || screenBottom < -os || screenTop > viewport.height + os);
}

function fumeResolveBlockTiming(block, time, nextLineStartTime, textHoldRatio) {
  var waitingOpacity = block.variant === 'hero' ? 0.06 : 0.035;
  var activeOpacity = block.variant === 'hero' ? 0.985 : 0.92;
  var effectiveTextHoldStyle = textHoldRatio >= 1 ? 'standard' : 'dimmed';
  var passedStyle = fumeResolvePassedTextStyle(block.variant, effectiveTextHoldStyle);
  var transitionPassedStyle = fumeResolvePassedTextStyle(block.variant, 'standard');
  var baselineOffset = block.lineHeight * (fumeIsCJK(block.line.fullText) ? 0.52 : 0.5);
  var lineEndTime = fumeGetLineRenderEndTime(block.line);
  var linePassCutoffTime = fumeResolveLinePassCutoffTime(block.line, nextLineStartTime);
  var hasRevealCompleted = time >= block.line.endTime;
  var hasPassCutoffReached = time >= linePassCutoffTime;
  var lineDuration = Math.max(lineEndTime - block.line.startTime, 0.18);
  var colorTrailDuration = fumeClamp(
    lineDuration * (block.variant === 'hero' ? 0.42 : 0.52), 0.45, 1.45);
  var staticState = time < block.line.startTime
    ? 'waiting'
    : time >= lineEndTime + colorTrailDuration ? 'passed' : null;
  return {
    waitingOpacity: waitingOpacity,
    activeOpacity: activeOpacity,
    effectiveTextHoldStyle: effectiveTextHoldStyle,
    passedStyle: passedStyle,
    transitionPassedStyle: transitionPassedStyle,
    baselineOffset: baselineOffset,
    lineEndTime: lineEndTime,
    linePassCutoffTime: linePassCutoffTime,
    hasRevealCompleted: hasRevealCompleted,
    hasPassCutoffReached: hasPassCutoffReached,
    lineDuration: lineDuration,
    colorTrailDuration: colorTrailDuration,
    staticState: staticState
  };
}

/* 返回要画的快照层（自底向上 + alpha），主快照不可得时返回 null → 活画 */
function fumeResolveStaticLayers(block, timing, input, getSnapshot, layersOut) {
  layersOut.length = 0;
  var staticState = timing.staticState;
  if (!staticState) return false;
  var theme = input.theme;
  var passedGlowBase = input.passedGlowBase;
  var snapshotScale = input.snapshotScale;

  var cacheStyleKey = staticState === 'passed' ? timing.effectiveTextHoldStyle : 'base';
  var snapshot = getSnapshot({
    key: block.id + ':' + staticState + ':' + cacheStyleKey + ':' + snapshotScale,
    fill: staticState === 'waiting'
      ? fumeColorWithAlpha(theme.primaryColor, timing.waitingOpacity)
      : fumeColorWithAlpha(theme.primaryColor, timing.passedStyle.opacity),
    shadowBlur: staticState === 'waiting'
      ? 0
      : (2 + block.fontPx * 0.1) * 0.65 * passedGlowBase * timing.passedStyle.glowMultiplier,
    shadowColor: staticState === 'waiting'
      ? 'transparent'
      : fumeColorWithAlpha(theme.primaryColor, timing.passedStyle.shadowAlphaBase)
  });
  if (!snapshot) return false;

  if (staticState === 'passed' && timing.effectiveTextHoldStyle === 'dimmed') {
    var passedAt = timing.lineEndTime + timing.colorTrailDuration;
    var baseDimAmount = fumeResolvePassedDimAmount(input.time, passedAt, input.passedFadeDuration);
    var dimAmount = baseDimAmount * (1 - input.overviewTextRestoreProgress);
    var standardStyle = fumeResolvePassedTextStyle(block.variant, 'standard');
    var standardSnapshot = getSnapshot({
      key: block.id + ':passed:standard:' + snapshotScale,
      fill: fumeColorWithAlpha(theme.primaryColor, standardStyle.opacity),
      shadowBlur: (2 + block.fontPx * 0.1) * 0.65 * passedGlowBase * standardStyle.glowMultiplier,
      shadowColor: fumeColorWithAlpha(theme.primaryColor, standardStyle.shadowAlphaBase)
    });
    if (standardSnapshot) {
      if (dimAmount <= 0) { layersOut.push({ snapshot: standardSnapshot, alpha: 1 }); return true; }
      if (dimAmount < 1) {
        layersOut.push({ snapshot: standardSnapshot, alpha: 1 - dimAmount });
        layersOut.push({ snapshot: snapshot, alpha: dimAmount });
        return true;
      }
    }
  }
  layersOut.push({ snapshot: snapshot, alpha: 1 });
  return true;
}

/* ============================ §10 文章排版（fumeArticleLayout.ts） ============================ */

function fumeChooseNaturalBlockVariant(line, index, total) {
  var graphemeCount = fumeCountRenderableGraphemes(line.fullText);
  if (graphemeCount === 0) return 'body';
  if (line.isChorus && graphemeCount <= 22) return 'hero';
  var shortEnough = graphemeCount >= 4 && graphemeCount <= 28;
  var centered = Math.abs(index - total / 2) / Math.max(total, 1);
  var random = fumeSeeded(line.fullText + ':' + index);
  return shortEnough && centered < 0.72 && ((index + 1) % 6 === 0 || random > 0.965)
    ? 'hero' : 'body';
}

function fumeChooseFallbackHeroBlockIndex(entries) {
  if (!entries.length) return -1;
  var hasNaturalHero = false;
  for (var i = 0; i < entries.length; i++) {
    if (fumeChooseNaturalBlockVariant(entries[i].line, i, entries.length) === 'hero') { hasNaturalHero = true; break; }
  }
  if (hasNaturalHero) return -1;
  var bestIndex = -1;
  var bestScore = Number.NEGATIVE_INFINITY;
  for (var b = 0; b < entries.length; b++) {
    var line = entries[b].line;
    var graphemeCount = fumeCountRenderableGraphemes(line.fullText);
    if (graphemeCount === 0) continue;
    var isComfortableHeroLength = graphemeCount >= 4 && graphemeCount <= 28;
    var isAcceptableFallbackLength = graphemeCount <= 36;
    if (!isComfortableHeroLength && !isAcceptableFallbackLength) continue;
    var centered = Math.abs(b - entries.length / 2) / Math.max(entries.length, 1);
    var centerScore = 1 - centered;
    var lengthScore = graphemeCount >= 6 && graphemeCount <= 22 ? 1 : graphemeCount <= 28 ? 0.72 : 0.36;
    var chorusScore = line.isChorus ? 0.28 : 0;
    var stableJitter = fumeSeeded(line.fullText + ':' + b + ':fallback-hero') * 0.04;
    var score = centerScore * 0.62 + lengthScore * 0.34 + chorusScore + stableJitter;
    if (score > bestScore) { bestScore = score; bestIndex = b; }
  }
  if (bestIndex >= 0) return bestIndex;
  var shortestIndex = -1;
  var shortestCount = Number.POSITIVE_INFINITY;
  for (var s = 0; s < entries.length; s++) {
    var gc = fumeCountRenderableGraphemes(entries[s].line.fullText);
    if (gc > 0 && gc < shortestCount) { shortestCount = gc; shortestIndex = s; }
  }
  return shortestIndex;
}

function fumeBuildLayoutCacheKey(lines, viewport, theme, lyricsFontScale, fumeTune) {
  var linesHash = 2166136261;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var lineKey = line.startTime + ':' + line.endTime + ':' + line.fullText + ':' +
      line.words.length + ':' + (line.isChorus ? 1 : 0);
    linesHash ^= fumeHashString(lineKey);
    linesHash = Math.imul(linesHash, 16777619);
  }
  return [
    Math.round(viewport.width), Math.round(viewport.height),
    theme.fontFamilyStack || '', theme.name,
    lyricsFontScale.toFixed(4), fumeTune.heroScale.toFixed(4),
    lines.length, linesHash >>> 0
  ].join('|');
}

function fumeBuildArticleLayoutAttempt(lines, viewport, theme, lyricsFontScale, fumeTune, options) {
  if (viewport.width <= 0 || viewport.height <= 0 || !lines.length) return null;
  var shouldBuildRenderDetails = options.mode === 'render';
  var horizontalMargin = Math.max(viewport.width * 0.86, 280);
  var verticalMargin = Math.max(viewport.height * 0.82, 220);
  var columns = options.columns;
  var gap = options.gap;
  var paperWidth = options.paperWidth;
  var columnWidth = (paperWidth - gap * (columns - 1)) / columns;
  var fontFamily = theme.fontFamilyStack;
  /* 过滤空行 + 按稳定随机洗牌放置顺序（纸面有构图感而非严格编年） */
  var filteredLines = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].fullText.trim().length > 0) filteredLines.push({ line: lines[i], index: i });
  }
  filteredLines.sort(function (left, right) {
    var ls = fumeSeeded(options.seedKey + ':' + left.index + ':' + left.line.fullText);
    var rs = fumeSeeded(options.seedKey + ':' + right.index + ':' + right.line.fullText);
    return ls - rs;
  });

  var blocks = [];
  var columnHeights = new Array(columns);
  for (var c = 0; c < columns; c++) columnHeights[c] = verticalMargin;
  var bodyColumnTieCursor = 0;
  var heroPlacementTieCursor = 0;
  var forcedHeroIndex = fumeChooseFallbackHeroBlockIndex(filteredLines);

  for (var bi = 0; bi < filteredLines.length; bi++) {
    var entry = filteredLines[bi];
    var line = entry.line;
    var index = entry.index;
    /* Folia 语义：forcedHeroIndex 是 filteredLines 内的位置（blockIndex） */
    var variant = bi === forcedHeroIndex ? 'hero'
      : fumeChooseNaturalBlockVariant(line, bi, filteredLines.length);
    var heroSpanColumns = variant === 'hero' ? Math.min(columns, columns <= 1 ? 1 : 2) : 1;
    var heroSpanWidth = heroSpanColumns > 1 ? columnWidth * heroSpanColumns + gap * (heroSpanColumns - 1) : paperWidth;
    var blockWidth = variant === 'hero'
      ? (heroSpanColumns === 1 ? paperWidth
        : columns === 2 ? columnWidth * 1.5 + gap * 0.5 : heroSpanWidth)
      : columnWidth;
    var innerWidth = Math.max(blockWidth, 120);
    var preparedSingleLine = fumeBuildPreparedSingleLine(
      line.fullText, fontFamily, innerWidth, variant, lyricsFontScale,
      options.densityScale, fumeTune.heroScale);
    var fontPx = preparedSingleLine.fontPx;
    var lineHeight = Math.round(fontPx * (variant === 'hero' ? 1.02 : 1.06));
    var layout = preparedSingleLine.layout;
    var blockGap = variant === 'hero'
      ? Math.max(Math.round(lineHeight * 0.2), 6)
      : Math.max(Math.round(lineHeight * 0.08), 2);
    var blockHeight = layout.lines.length * lineHeight;
    var x = 0, y = 0;

    if (variant === 'hero') {
      if (heroSpanColumns === 1) {
        var maxY = columnHeights[0];
        for (var ch = 1; ch < columns; ch++) { if (columnHeights[ch] > maxY) maxY = columnHeights[ch]; }
        y = maxY;
        x = horizontalMargin;
        columnHeights[0] = y + blockHeight + blockGap;
      } else {
        var bestHeight = Number.POSITIVE_INFINITY;
        var candidateStarts = [];
        for (var sc = 0; sc <= columns - heroSpanColumns; sc++) {
          var coveredHeight = 0;
          for (var cc = sc; cc < sc + heroSpanColumns; cc++) {
            coveredHeight = Math.max(coveredHeight, columnHeights[cc] || 0);
          }
          if (coveredHeight < bestHeight) { bestHeight = coveredHeight; candidateStarts = [sc]; }
          else if (coveredHeight === bestHeight) candidateStarts.push(sc);
        }
        var targetStart = candidateStarts.length > 0
          ? candidateStarts[heroPlacementTieCursor % candidateStarts.length]
          : 0;
        heroPlacementTieCursor++;
        y = bestHeight;
        x = horizontalMargin + targetStart * (columnWidth + gap) +
          Math.max((heroSpanWidth - blockWidth) * 0.5, 0);
        for (var cu = targetStart; cu < targetStart + heroSpanColumns; cu++) {
          columnHeights[cu] = y + blockHeight + blockGap;
        }
      }
    } else {
      var targetColumn = 0;
      var minHeight = columnHeights[0] || 0;
      var candidateColumns = [0];
      for (var col = 1; col < columns; col++) {
        var h = columnHeights[col] || 0;
        if (h < minHeight) { minHeight = h; candidateColumns = [col]; }
        else if (h === minHeight) candidateColumns.push(col);
      }
      targetColumn = candidateColumns[bodyColumnTieCursor % candidateColumns.length] || 0;
      bodyColumnTieCursor++;
      x = horizontalMargin + targetColumn * (columnWidth + gap);
      y = columnHeights[targetColumn];
      columnHeights[targetColumn] = y + blockHeight + blockGap;
    }

    if (shouldBuildRenderDetails) {
      var prepared = preparedSingleLine.prepared;
      var fontSpec = fumeBuildFontSpec(fontPx, variant, fontFamily);
      var metas = fumeBuildSegmentMetas(prepared);
      var graphemes = metas.graphemes;
      var segmentMetas = metas.segmentMetas;
      var wordRanges = fumeBuildWordRangesFromWords(line, graphemes);
      var wordRangeIndexByOffset = fumeBuildWordRangeIndexByOffset(graphemes.length, wordRanges, 'timing');
      var colorRangeIndexByOffset = fumeBuildWordRangeIndexByOffset(graphemes.length, wordRanges, 'color');
      var renderLines = [];
      for (var li = 0; li < layout.lines.length; li++) {
        var layoutLine = layout.lines[li];
        var start = fumeCursorToGlobalOffset(layoutLine.start, segmentMetas);
        var end = fumeCursorToGlobalOffset(layoutLine.end, segmentMetas);
        var lineGraphemes = fumeSplitGraphemes(layoutLine.text);
        renderLines.push({
          id: line.startTime + '-' + li,
          text: layoutLine.text,
          start: start,
          end: end,
          graphemes: lineGraphemes,
          glyphOffsets: fumeBuildGlyphOffsets(prepared, segmentMetas, start, lineGraphemes.length),
          segments: fumeBuildRenderSegments(prepared, segmentMetas, start, end, fontSpec),
          left: variant === 'hero' ? Math.max((blockWidth - layoutLine.width) * 0.08, 0) : 0,
          top: li * lineHeight,
          width: layoutLine.width
        });
      }
      blocks.push({
        id: 'fume-' + line.startTime + '-' + index,
        sourceLineIndex: index,
        line: line,
        variant: variant,
        x: x, y: y, width: blockWidth, height: blockHeight,
        innerWidth: innerWidth,
        fontPx: fontPx,
        lineHeight: lineHeight,
        prepared: prepared,
        layout: layout,
        graphemes: graphemes,
        segmentMetas: segmentMetas,
        wordRanges: wordRanges,
        wordRangeIndexByOffset: wordRangeIndexByOffset,
        colorRangeIndexByOffset: colorRangeIndexByOffset,
        renderLines: renderLines
      });
    }
  }

  var maxH = 0;
  for (var mh = 0; mh < columnHeights.length; mh++) {
    if (columnHeights[mh] > maxH) maxH = columnHeights[mh];
  }
  var articleHeight = maxH + verticalMargin;
  var metrics = {
    width: paperWidth + horizontalMargin * 2,
    height: articleHeight,
    viewportHeight: options.viewportHeight,
    columns: columns,
    gap: gap,
    paperBounds: {
      left: horizontalMargin,
      top: verticalMargin,
      right: horizontalMargin + paperWidth,
      bottom: Math.max(articleHeight - verticalMargin, verticalMargin)
    }
  };
  if (!shouldBuildRenderDetails) return metrics;

  var chronologicalBlocks = blocks.slice().sort(function (a, b) { return a.sourceLineIndex - b.sourceLineIndex; });
  var blockBySourceLineIndex = {};
  for (var bb = 0; bb < chronologicalBlocks.length; bb++) {
    blockBySourceLineIndex[chronologicalBlocks[bb].sourceLineIndex] = chronologicalBlocks[bb];
  }
  var firstRenderableStartTime = chronologicalBlocks.length
    ? chronologicalBlocks[0].line.startTime : Number.POSITIVE_INFINITY;
  var lastChronologicalRenderEndTime = chronologicalBlocks.length
    ? fumeGetLineRenderEndTime(chronologicalBlocks[chronologicalBlocks.length - 1].line)
    : Number.NEGATIVE_INFINITY;
  metrics.blocks = blocks;
  metrics.blockBySourceLineIndex = blockBySourceLineIndex;
  metrics.chronologicalBlocks = chronologicalBlocks;
  metrics.firstRenderableStartTime = firstRenderableStartTime;
  metrics.lastChronologicalRenderEndTime = lastChronologicalRenderEndTime;
  return metrics;
}

function fumeBuildArticleLayout(lines, viewport, theme, lyricsFontScale, fumeTune) {
  if (viewport.width <= 0 || viewport.height <= 0 || !lines.length) return null;
  var paperWidth = fumeClamp(Math.max(viewport.width * 1.95, viewport.width + 520), 920, 2400);
  var viewportHeight = Math.max(viewport.height, 240);
  var maxColumns = paperWidth >= 1120 ? 4 : paperWidth >= 760 ? 3 : paperWidth >= 500 ? 2 : 1;
  var targetHeight = viewportHeight * 2.45;
  var layoutSeedKey = theme.name;

  var bestOptions = null;
  var bestScore = Number.POSITIVE_INFINITY;

  /* 试几种列数与密度，保留最接近目标高度的构图 */
  for (var columns = maxColumns; columns >= 1; columns--) {
    var low = 0.82, high = 1.42;
    var gap = fumeClamp(Math.round(paperWidth * (columns >= 4 ? 0.0065 : columns === 3 ? 0.0085 : 0.0115)), 6, 14);
    for (var iter = 0; iter < 8; iter++) {
      var densityScale = (low + high) / 2;
      var layout = fumeBuildArticleLayoutAttempt(lines, viewport, theme, lyricsFontScale, fumeTune, {
        paperWidth: paperWidth,
        viewportHeight: viewportHeight,
        columns: columns,
        gap: gap,
        densityScale: densityScale,
        seedKey: layoutSeedKey + ':' + columns + ':' + paperWidth,
        mode: 'measure'
      });
      if (layout) {
        var coveragePenalty = Math.abs(layout.height - targetHeight);
        var overflowPenalty = layout.height < targetHeight ? 0 : (layout.height - targetHeight) * 0.14;
        var score = coveragePenalty + overflowPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestOptions = {
            paperWidth: paperWidth, viewportHeight: viewportHeight, columns: columns, gap: gap,
            densityScale: densityScale,
            seedKey: layoutSeedKey + ':' + columns + ':' + paperWidth,
            mode: 'render'
          };
        }
        if (layout.height < targetHeight) low = densityScale;
        else high = densityScale;
      }
    }
  }
  return bestOptions
    ? fumeBuildArticleLayoutAttempt(lines, viewport, theme, lyricsFontScale, fumeTune, bestOptions)
    : null;
}

/* ============================ §11 相机目标（fumeCamera.ts） ============================ */

var FUME_CAMERA_SCALE_MIN = 0.22;
var FUME_CAMERA_SCALE_MAX = 2.24;
var FUME_OVERVIEW_CAMERA_SOURCE = -2;
var FUME_CAMERA_TELEPORT_TRIGGER_SCREENS = 2.75;

function fumeResolveSteppedBlockFocusPoint(block, printedCount) {
  if (!block.renderLines.length) {
    return { x: block.x + block.width * 0.5, y: block.y + block.height * 0.5 };
  }
  var effectiveOffset = fumeClamp(printedCount, 0, block.graphemes.length);
  var targetLine = null;
  for (var i = 0; i < block.renderLines.length; i++) {
    if (effectiveOffset <= block.renderLines[i].end) { targetLine = block.renderLines[i]; break; }
  }
  if (!targetLine) targetLine = block.renderLines[block.renderLines.length - 1];
  var localOffset = fumeClamp(effectiveOffset, targetLine.start, targetLine.end);
  var progressWidth = fumeWidthBetweenOffsets(block.prepared, block.segmentMetas, targetLine.start, localOffset);
  var minX = block.x + targetLine.left;
  var maxX = minX + targetLine.width;
  return {
    x: fumeClamp(minX + progressWidth, minX, maxX),
    y: block.y + targetLine.top + block.lineHeight * 0.5
  };
}

function fumeResolveSmoothBlockFocusPoint(block, printedProgress) {
  if (!block.renderLines.length) {
    return { x: block.x + block.width * 0.5, y: block.y + block.height * 0.5 };
  }
  var effectiveOffset = fumeClamp(printedProgress, 0, block.graphemes.length);
  var exactIndex = -1;
  for (var i = 0; i < block.renderLines.length; i++) {
    if (effectiveOffset <= block.renderLines[i].end) { exactIndex = i; break; }
  }
  var targetLineIndex = exactIndex >= 0 ? exactIndex : block.renderLines.length - 1;

  function resolvePointOnRenderLine(lineIndex, offset) {
    var targetLine = block.renderLines[lineIndex] || block.renderLines[block.renderLines.length - 1];
    var clampedOffset = fumeClamp(offset, targetLine.start, targetLine.end);
    var baseOffset = Math.floor(clampedOffset);
    var fractionalOffset = clampedOffset - baseOffset;
    var baseWidth = fumeWidthBetweenOffsets(block.prepared, block.segmentMetas, targetLine.start, baseOffset);
    var localGlyphIndex = baseOffset - targetLine.start;
    var glyphAdvance = (localGlyphIndex >= 0 && localGlyphIndex < targetLine.graphemes.length)
      ? fumeResolveGlyphAdvance(targetLine, localGlyphIndex)
      : 0;
    var minX = block.x + targetLine.left;
    var maxX = minX + targetLine.width;
    return {
      x: fumeClamp(minX + baseWidth + glyphAdvance * fractionalOffset, minX, maxX),
      y: block.y + targetLine.top + block.lineHeight * 0.5
    };
  }

  var point = resolvePointOnRenderLine(targetLineIndex, effectiveOffset);
  var currentLine = block.renderLines[targetLineIndex];
  var crossLineBlendWindow = 0.7;

  if (targetLineIndex > 0 && effectiveOffset < currentLine.start + crossLineBlendWindow) {
    var previousLine = block.renderLines[targetLineIndex - 1];
    var blend = fumeEaseInOutCubic(fumeClamp(
      1 - ((effectiveOffset - previousLine.end) / crossLineBlendWindow), 0, 1));
    var previousPoint = resolvePointOnRenderLine(targetLineIndex - 1, previousLine.end);
    point = {
      x: fumeMix(point.x, previousPoint.x, blend),
      y: fumeMix(point.y, previousPoint.y, blend)
    };
  } else if (targetLineIndex < block.renderLines.length - 1 && effectiveOffset > currentLine.end - crossLineBlendWindow) {
    var nextLine = block.renderLines[targetLineIndex + 1];
    var blend2 = fumeEaseInOutCubic(fumeClamp(
      (effectiveOffset - (currentLine.end - crossLineBlendWindow)) / crossLineBlendWindow, 0, 1));
    var nextPoint = resolvePointOnRenderLine(targetLineIndex + 1, nextLine.start);
    point = {
      x: fumeMix(point.x, nextPoint.x, blend2),
      y: fumeMix(point.y, nextPoint.y, blend2)
    };
  }
  return point;
}

function fumeResolveBlockEntryFocusPoint(block) {
  var firstRenderLine = block.renderLines[0];
  if (!firstRenderLine) {
    return { x: block.x + block.width * 0.5, y: block.y + block.height * 0.5 };
  }
  return {
    x: block.x + firstRenderLine.left,
    y: block.y + firstRenderLine.top + block.lineHeight * 0.5
  };
}

function fumeResolveCameraScaleForBlock(block, viewport) {
  var minViewportSide = Math.max(Math.min(viewport.width, viewport.height), 1);
  var targetLineHeight = fumeClamp(minViewportSide * 0.115, 64, 124);
  return fumeClamp(targetLineHeight / Math.max(block.lineHeight, 1), 0.88, 2.2);
}

function fumeResolveCameraRetargetDuration(line) {
  var hints = line.renderHints;
  if (!hints) return 0.09;
  var transitionTiming = fumeGetLineTransitionTiming(
    hints.rawDuration, hints.lineTransitionMode, hints.wordRevealMode);
  if (hints.lineTransitionMode === 'none') {
    return fumeClamp(Math.max(hints.rawDuration, 0.08) * 0.34, 0.04, 0.075);
  }
  if (hints.lineTransitionMode === 'fast') {
    return fumeClamp(
      transitionTiming.enterDuration * 0.5 + transitionTiming.exitDuration * 0.12, 0.055, 0.095);
  }
  return fumeClamp(
    transitionTiming.enterDuration * 0.44 + transitionTiming.linePassHold * 0.22, 0.075, 0.13);
}

function fumeResolveOverviewRetargetDuration(viewport) {
  return fumeClamp(Math.min(viewport.width, viewport.height) / 1500, 0.38, 0.58);
}

function fumeResolveOverviewFlightBridge(fromX, fromY, fromScale, targetX, targetY, targetScale, overviewCamera, viewport) {
  if (!overviewCamera) return null;
  var safeScale = Math.max(fromScale, targetScale, overviewCamera.scale, 0.001);
  var minViewportSide = Math.max(Math.min(viewport.width, viewport.height), 1);
  var deltaX = fromX - targetX;
  var deltaY = fromY - targetY;
  var worldDistance = Math.hypot(deltaX, deltaY);
  var screenDistance = worldDistance * safeScale;
  if (worldDistance <= 0 || screenDistance < minViewportSide * FUME_CAMERA_TELEPORT_TRIGGER_SCREENS) return null;

  var loftStrength = fumeClamp(
    (screenDistance / minViewportSide - FUME_CAMERA_TELEPORT_TRIGGER_SCREENS) / 3.4, 0, 1);
  var midpointX = fumeMix(fromX, targetX, 0.5);
  var midpointY = fumeMix(fromY, targetY, 0.5);
  var waypointCenterBias = fumeMix(0.18, 0.42, loftStrength);
  var waypointX = fumeMix(midpointX, overviewCamera.x, waypointCenterBias);
  var waypointY = fumeMix(midpointY, overviewCamera.y, waypointCenterBias);
  var endpointScale = Math.max(fromScale, targetScale, 0.001);
  var loftedScale = endpointScale * fumeMix(0.62, 0.4, loftStrength);
  var overviewLimitedScale = overviewCamera.scale * fumeMix(1.85, 1.55, loftStrength);
  var waypointScale = fumeClamp(
    Math.max(loftedScale, overviewLimitedScale),
    FUME_CAMERA_SCALE_MIN,
    Math.max(endpointScale * 0.92, FUME_CAMERA_SCALE_MIN));
  var overviewDistanceFromStart = Math.hypot(waypointX - fromX, waypointY - fromY)
    * Math.max(fromScale, waypointScale, 0.001);
  var overviewDistanceToTarget = Math.hypot(targetX - waypointX, targetY - waypointY)
    * Math.max(targetScale, waypointScale, 0.001);
  var totalLegDistance = overviewDistanceFromStart + overviewDistanceToTarget;
  var waypointPhase = totalLegDistance <= 0
    ? 0.36
    : fumeClamp(overviewDistanceFromStart / totalLegDistance, 0.26, 0.44);
  var duration = fumeClamp(0.26 + (screenDistance / (minViewportSide * 5.5)) * 0.28, 0.3, 0.68);
  return {
    waypointX: waypointX, waypointY: waypointY, waypointScale: waypointScale,
    waypointPhase: waypointPhase, duration: duration
  };
}

function fumeResolveArticleOverviewCamera(article, viewport) {
  if (!article.blocks.length) {
    var fitScale0 = Math.min(
      viewport.width / Math.max(article.width, 1),
      viewport.height / Math.max(article.height, 1));
    return {
      x: article.width * 0.5, y: article.height * 0.5,
      scale: fumeClamp(fitScale0 * 0.92, FUME_CAMERA_SCALE_MIN, 0.72)
    };
  }
  var minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
  var maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  for (var i = 0; i < article.blocks.length; i++) {
    var block = article.blocks[i];
    minX = Math.min(minX, block.x);
    minY = Math.min(minY, block.y);
    maxX = Math.max(maxX, block.x + block.width);
    maxY = Math.max(maxY, block.y + block.height);
  }
  var paddingX = fumeClamp(viewport.width * 0.2, 120, 280);
  var paddingY = fumeClamp(viewport.height * 0.2, 96, 220);
  var framedWidth = Math.max(maxX - minX + paddingX * 2, 1);
  var framedHeight = Math.max(maxY - minY + paddingY * 2, 1);
  var fitScale = Math.min(viewport.width / framedWidth, viewport.height / framedHeight);
  return {
    x: (minX + maxX) * 0.5,
    y: (minY + maxY) * 0.5,
    scale: fumeClamp(fitScale, FUME_CAMERA_SCALE_MIN, 0.72)
  };
}

function fumeResolveFocusBlock(article, currentLineIndex, currentTimeValue) {
  if (currentLineIndex >= 0) {
    var active = article.blockBySourceLineIndex[currentLineIndex];
    if (active) return active;
  }
  var chronologicalLastBlock = article.chronologicalBlocks[article.chronologicalBlocks.length - 1] || null;
  if (chronologicalLastBlock && currentTimeValue >= article.lastChronologicalRenderEndTime) {
    return chronologicalLastBlock;
  }
  for (var i = article.chronologicalBlocks.length - 1; i >= 0; i--) {
    var block = article.chronologicalBlocks[i];
    var printedCount = fumeResolvePrintedGraphemeCount(
      block.line, block.wordRanges, block.graphemes.length, currentTimeValue);
    if (printedCount > 0) return block;
  }
  return article.chronologicalBlocks[0] || null;
}

/* ============================ §12 相机步进（fumeCameraStep.ts） ============================ */

function fumeCreateCameraState() {
  return {
    initialized: false,
    retarget: {
      sourceLineIndex: -1, startedAt: 0, duration: 0.18,
      fromX: 0, fromY: 0, fromScale: 1,
      bridgeMode: 'none',
      bridgeWaypointX: 0, bridgeWaypointY: 0, bridgeWaypointScale: 1, bridgeWaypointPhase: 0.36
    },
    camera: {
      x: 0, y: 0, velocityX: 0, velocityY: 0,
      focusX: 0, focusY: 0,
      scale: 1, velocityScale: 0, focusScale: 1
    },
    stepResult: { shouldShowOverview: false, overviewTextRestoreProgress: 0 }
  };
}

var fumeCameraState = fumeCreateCameraState();

function fumeSyncCameraToArticle(state, article) {
  if (article && !state.initialized) {
    state.camera = {
      x: article.width * 0.5, y: article.height * 0.5, velocityX: 0, velocityY: 0,
      focusX: article.width * 0.5, focusY: article.height * 0.5,
      scale: 1.18, velocityScale: 0, focusScale: 1.18
    };
    state.initialized = true;
  } else if (article) {
    state.camera.x = fumeClamp(state.camera.x, 0, article.width);
    state.camera.y = fumeClamp(state.camera.y, 0, article.height);
    state.camera.focusX = fumeClamp(state.camera.focusX, 0, article.width);
    state.camera.focusY = fumeClamp(state.camera.focusY, 0, article.height);
    state.camera.scale = fumeClamp(state.camera.scale, FUME_CAMERA_SCALE_MIN, FUME_CAMERA_SCALE_MAX);
    state.camera.focusScale = fumeClamp(state.camera.focusScale, FUME_CAMERA_SCALE_MIN, FUME_CAMERA_SCALE_MAX);
  } else {
    state.initialized = false;
  }
}

function fumeStepCamera(state, input) {
  var article = input.article, time = input.time, now = input.now, dt = input.dt;
  var viewport = input.viewport, overviewCamera = input.overviewCamera, overviewStartTime = input.overviewStartTime;
  var cameraSpeed = input.cameraSpeed, cameraTrackingMode = input.cameraTrackingMode;
  var staticMode = input.staticMode, animationIntensity = input.animationIntensity;
  var focusBlock = fumeResolveFocusBlock(article, input.lineIndex, time);
  var shouldShowOverview = overviewCamera !== null && time >= overviewStartTime;
  var targetCameraX = article.width * 0.5;
  var targetCameraY = article.height * 0.5;
  var targetCameraScale = 1.18;
  var entryFocusPoint = null;
  var didRetargetThisFrame = false;

  if (shouldShowOverview && overviewCamera) {
    targetCameraX = overviewCamera.x;
    targetCameraY = overviewCamera.y;
    targetCameraScale = overviewCamera.scale;
    if (state.retarget.sourceLineIndex !== FUME_OVERVIEW_CAMERA_SOURCE) {
      state.retarget = {
        sourceLineIndex: FUME_OVERVIEW_CAMERA_SOURCE,
        startedAt: time,
        duration: fumeClamp(fumeResolveOverviewRetargetDuration(viewport) / cameraSpeed, 0.12, 1.2),
        fromX: state.camera.x, fromY: state.camera.y, fromScale: state.camera.scale,
        bridgeMode: 'none', bridgeWaypointX: 0, bridgeWaypointY: 0, bridgeWaypointScale: 1, bridgeWaypointPhase: 0.36
      };
      didRetargetThisFrame = true;
    }
  } else if (focusBlock) {
    var focusPoint = cameraTrackingMode === 'stepped'
      ? fumeResolveSteppedBlockFocusPoint(focusBlock, fumeResolvePrintedGraphemeCount(
        focusBlock.line, focusBlock.wordRanges, focusBlock.graphemes.length, time))
      : fumeResolveSmoothBlockFocusPoint(focusBlock, fumeResolvePrintedGraphemeProgress(
        focusBlock.line, focusBlock.wordRanges, focusBlock.graphemes.length, time));
    entryFocusPoint = fumeResolveBlockEntryFocusPoint(focusBlock);
    targetCameraX = focusPoint.x;
    targetCameraY = focusPoint.y;
    targetCameraScale = fumeResolveCameraScaleForBlock(focusBlock, viewport);
    if (state.retarget.sourceLineIndex !== focusBlock.sourceLineIndex) {
      state.retarget = {
        sourceLineIndex: focusBlock.sourceLineIndex,
        startedAt: time,
        duration: fumeClamp(fumeResolveCameraRetargetDuration(focusBlock.line) / cameraSpeed, 0.03, 0.3),
        fromX: state.camera.x, fromY: state.camera.y, fromScale: state.camera.scale,
        bridgeMode: 'none', bridgeWaypointX: 0, bridgeWaypointY: 0, bridgeWaypointScale: 1, bridgeWaypointPhase: 0.36
      };
      didRetargetThisFrame = true;
    }
  } else if (state.retarget.sourceLineIndex !== -1) {
    state.retarget = {
      sourceLineIndex: -1,
      startedAt: time,
      duration: fumeClamp(0.18 / cameraSpeed, 0.05, 0.4),
      fromX: state.camera.x, fromY: state.camera.y, fromScale: state.camera.scale,
      bridgeMode: 'none', bridgeWaypointX: 0, bridgeWaypointY: 0, bridgeWaypointScale: 1, bridgeWaypointPhase: 0.36
    };
    didRetargetThisFrame = true;
  }

  var retargetElapsed = Math.max(time - state.retarget.startedAt, 0);
  var overviewTextRestoreProgress = shouldShowOverview && state.retarget.sourceLineIndex === FUME_OVERVIEW_CAMERA_SOURCE
    ? fumeEaseInOutCubic(fumeClamp(retargetElapsed / Math.max(state.retarget.duration, 0.001), 0, 1))
    : 0;
  var retargetPhase = fumeClamp(retargetElapsed / Math.max(state.retarget.duration, 0.001), 0, 1);
  var retargetBoost = 1 - fumeEaseOutCubic(retargetPhase);
  var entryFocusBias = Math.pow(retargetBoost, 0.58);

  if (entryFocusPoint) {
    targetCameraX = fumeMix(targetCameraX, entryFocusPoint.x, entryFocusBias);
    targetCameraY = fumeMix(targetCameraY, entryFocusPoint.y, entryFocusBias);
  }

  if (!staticMode) {
    var floatConfig = animationIntensity === 'chaotic'
      ? { distance: 24, duration: 5.8, scaleAmplitude: 0.014 }
      : animationIntensity === 'calm'
        ? { distance: 14, duration: 8.5, scaleAmplitude: 0.008 }
        : { distance: 18, duration: 7, scaleAmplitude: 0.011 };
    var floatPhase = (now / 1000 / floatConfig.duration) * Math.PI * 2;
    var overviewAttenuation = shouldShowOverview ? 0.36 : 1;
    var screenFloatX = Math.sin(floatPhase * 0.74 + 0.8) * floatConfig.distance * 0.34;
    var screenFloatY = (
      Math.sin(floatPhase) * floatConfig.distance
      + Math.sin(floatPhase * 0.5 + 1.1) * floatConfig.distance * 0.22
    ) * overviewAttenuation;
    var worldFloatDivisor = Math.max(targetCameraScale, 0.001);
    targetCameraX -= screenFloatX / worldFloatDivisor;
    targetCameraY -= screenFloatY / worldFloatDivisor;
    targetCameraScale = fumeClamp(
      targetCameraScale * (1 + Math.sin(floatPhase + 0.9) * floatConfig.scaleAmplitude * overviewAttenuation),
      FUME_CAMERA_SCALE_MIN, FUME_CAMERA_SCALE_MAX);
  }

  if (didRetargetThisFrame) {
    var bridgeScale = Math.max(state.camera.scale, targetCameraScale, 0.001);
    var screenDeltaX = Math.abs(targetCameraX - state.retarget.fromX) * bridgeScale;
    var screenDeltaY = Math.abs(targetCameraY - state.retarget.fromY) * bridgeScale;
    var screenDistance = Math.hypot(screenDeltaX, screenDeltaY);
    state.retarget.bridgeMode = screenDistance >= Math.min(viewport.width, viewport.height) * 0.42
      ? 'direct' : 'none';
    state.retarget.bridgeWaypointX = targetCameraX;
    state.retarget.bridgeWaypointY = targetCameraY;
    state.retarget.bridgeWaypointScale = targetCameraScale;
    state.retarget.bridgeWaypointPhase = 0.5;

    if (state.retarget.sourceLineIndex >= 0) {
      var overviewFlightBridge = fumeResolveOverviewFlightBridge(
        state.retarget.fromX, state.retarget.fromY, state.retarget.fromScale,
        targetCameraX, targetCameraY, targetCameraScale,
        overviewCamera, viewport);
      if (overviewFlightBridge) {
        state.retarget.bridgeMode = 'overview';
        state.retarget.bridgeWaypointX = overviewFlightBridge.waypointX;
        state.retarget.bridgeWaypointY = overviewFlightBridge.waypointY;
        state.retarget.bridgeWaypointScale = overviewFlightBridge.waypointScale;
        state.retarget.bridgeWaypointPhase = overviewFlightBridge.waypointPhase;
        state.retarget.duration = Math.max(
          state.retarget.duration,
          fumeClamp(overviewFlightBridge.duration / cameraSpeed, 0.16, 0.9));
      }
    }
  }

  var cameraDistance = Math.hypot(targetCameraX - state.camera.x, targetCameraY - state.camera.y);
  var shouldUseBridge = state.retarget.bridgeMode !== 'none' && retargetPhase < 1;

  if (shouldUseBridge) {
    var bridgedCameraX = targetCameraX, bridgedCameraY = targetCameraY, bridgedCameraScale = targetCameraScale;
    if (state.retarget.bridgeMode === 'overview') {
      var bridgePhase = fumeEaseOutCubic(retargetPhase);
      bridgedCameraX = fumeQuadraticBezier(state.retarget.fromX, state.retarget.bridgeWaypointX, targetCameraX, bridgePhase);
      bridgedCameraY = fumeQuadraticBezier(state.retarget.fromY, state.retarget.bridgeWaypointY, targetCameraY, bridgePhase);
      bridgedCameraScale = fumeQuadraticBezier(state.retarget.fromScale, state.retarget.bridgeWaypointScale, targetCameraScale, bridgePhase);
    } else {
      var bridgePhase2 = fumeEaseInOutCubic(retargetPhase);
      bridgedCameraX = fumeMix(state.retarget.fromX, targetCameraX, bridgePhase2);
      bridgedCameraY = fumeMix(state.retarget.fromY, targetCameraY, bridgePhase2);
      bridgedCameraScale = fumeMix(state.retarget.fromScale, targetCameraScale, bridgePhase2);
    }
    var bridgeCatchUp = 1 - Math.exp(-dt * (
      state.retarget.bridgeMode === 'overview'
        ? fumeMix(12.5, 22, 1 - retargetPhase)
        : fumeMix(10.5, 17.5, 1 - retargetPhase)));
    state.camera.focusX = bridgedCameraX;
    state.camera.focusY = bridgedCameraY;
    state.camera.focusScale = bridgedCameraScale;
    state.camera.x += (bridgedCameraX - state.camera.x) * bridgeCatchUp;
    state.camera.y += (bridgedCameraY - state.camera.y) * bridgeCatchUp;
    state.camera.scale += (bridgedCameraScale - state.camera.scale) * bridgeCatchUp;
    state.camera.scale = fumeClamp(state.camera.scale, FUME_CAMERA_SCALE_MIN, FUME_CAMERA_SCALE_MAX);
    state.camera.velocityX *= 0.72;
    state.camera.velocityY *= 0.72;
    state.camera.velocityScale *= 0.68;
  } else {
    var boostedCatchUpRate = fumeClamp(4.8 / Math.max(state.retarget.duration, 0.05), 20, 54);
    var targetCatchUp = 1 - Math.exp(-dt * fumeMix(11.2, boostedCatchUpRate, retargetBoost));
    state.camera.focusX += (targetCameraX - state.camera.focusX) * targetCatchUp;
    state.camera.focusY += (targetCameraY - state.camera.focusY) * targetCatchUp;
    state.camera.focusScale += (targetCameraScale - state.camera.focusScale)
      * (1 - Math.exp(-dt * fumeMix(5.4, 12.8, retargetBoost)));

    var springStrength = fumeMix(
      208,
      fumeClamp(15.8 / Math.max(state.retarget.duration * state.retarget.duration, 0.0064), 260, 780),
      retargetBoost);
    var damping = fumeMix(24, fumeClamp(Math.sqrt(springStrength) * 1.36, 24, 40), retargetBoost);
    var accelX = (state.camera.focusX - state.camera.x) * springStrength - state.camera.velocityX * damping;
    var accelY = (state.camera.focusY - state.camera.y) * springStrength - state.camera.velocityY * damping;
    state.camera.velocityX += accelX * dt;
    state.camera.velocityY += accelY * dt;
    var maxVelocity = fumeMix(
      1320,
      fumeClamp(cameraDistance / Math.max(state.retarget.duration * 0.28, 0.028), 2600, 8800),
      retargetBoost);
    state.camera.velocityX = fumeClamp(state.camera.velocityX, -maxVelocity, maxVelocity);
    state.camera.velocityY = fumeClamp(state.camera.velocityY, -maxVelocity, maxVelocity);
    state.camera.x += state.camera.velocityX * dt;
    state.camera.y += state.camera.velocityY * dt;

    var scaleSpringStrength = fumeMix(54, 108, retargetBoost);
    var scaleDamping = fumeMix(13.5, 21, retargetBoost);
    var accelScale = (state.camera.focusScale - state.camera.scale) * scaleSpringStrength
      - state.camera.velocityScale * scaleDamping;
    state.camera.velocityScale += accelScale * dt;
    state.camera.velocityScale = fumeClamp(state.camera.velocityScale, -1.6, 1.6);
    state.camera.scale += state.camera.velocityScale * dt;
    state.camera.scale = fumeClamp(state.camera.scale, FUME_CAMERA_SCALE_MIN, FUME_CAMERA_SCALE_MAX);
  }

  state.stepResult.shouldShowOverview = shouldShowOverview;
  state.stepResult.overviewTextRestoreProgress = overviewTextRestoreProgress;
  return state.stepResult;
}

/* 背景层视图：拖尾视差 + 略低 + 缩放更少 */
var FUME_BACKGROUND_PARALLAX_X = 0.9;
var FUME_BACKGROUND_PARALLAX_Y = 0.74;
var FUME_BACKGROUND_SCALE_FACTOR = 0.94;
var FUME_BACKGROUND_VERTICAL_OFFSET_RATIO = 0.22;

function fumeResolveBackgroundView(backgroundScene, camera, viewport) {
  var screenScale = camera.scale;
  var backgroundCenterX = backgroundScene.width * 0.5;
  var backgroundCenterY = backgroundScene.height * 0.5;
  var backgroundVerticalOffset = fumeClamp(
    viewport.height * FUME_BACKGROUND_VERTICAL_OFFSET_RATIO / Math.max(screenScale, 0.001), 48, 180);
  var backgroundCameraX = fumeMix(backgroundCenterX, camera.x, FUME_BACKGROUND_PARALLAX_X);
  var backgroundCameraY = fumeMix(backgroundCenterY, camera.y, FUME_BACKGROUND_PARALLAX_Y) - backgroundVerticalOffset;
  var backgroundScale = fumeClamp(screenScale * FUME_BACKGROUND_SCALE_FACTOR, FUME_CAMERA_SCALE_MIN, FUME_CAMERA_SCALE_MAX);
  return {
    backgroundCenterX: backgroundCenterX, backgroundCenterY: backgroundCenterY,
    backgroundCameraX: backgroundCameraX, backgroundCameraY: backgroundCameraY,
    backgroundScale: backgroundScale
  };
}

/* ============================ §13 几何纸面背景（FumeBackground.ts） ============================ */

function fumeNormalizeBounds(bounds, worldWidth, worldHeight) {
  return {
    left: fumeClamp(Math.min(bounds.left, bounds.right), 0, worldWidth),
    top: fumeClamp(Math.min(bounds.top, bounds.bottom), 0, worldHeight),
    right: fumeClamp(Math.max(bounds.left, bounds.right), 0, worldWidth),
    bottom: fumeClamp(Math.max(bounds.top, bounds.bottom), 0, worldHeight)
  };
}

function fumeChoosePaperHaloAnchor(paperBounds, worldWidth, worldHeight, width, height, seedKey) {
  var insideChance = fumeSeeded(seedKey + ':inside-chance');
  if (insideChance < 0.22) {
    return {
      x: fumeClamp(fumeMix(paperBounds.left + width * 0.12, paperBounds.right - width * 0.12,
        fumeSeeded(seedKey + ':inside-x')), 0, worldWidth),
      y: fumeClamp(fumeMix(paperBounds.top + height * 0.12, paperBounds.bottom - height * 0.12,
        fumeSeeded(seedKey + ':inside-y')), 0, worldHeight)
    };
  }
  var side = Math.floor(fumeSeeded(seedKey + ':side') * 4) % 4;
  var overflowX = width * fumeMix(0.16, 0.24, fumeSeeded(seedKey + ':overflow-x'));
  var overflowY = height * fumeMix(0.16, 0.24, fumeSeeded(seedKey + ':overflow-y'));
  var spanJitterX = width * fumeMix(-0.18, 0.18, fumeSeeded(seedKey + ':span-jitter-x'));
  var spanJitterY = height * fumeMix(-0.18, 0.18, fumeSeeded(seedKey + ':span-jitter-y'));
  if (side === 0) {
    return {
      x: fumeClamp(paperBounds.left - overflowX, 0, worldWidth),
      y: fumeClamp(fumeMix(paperBounds.top - height * 0.12, paperBounds.bottom + height * 0.12,
        fumeSeeded(seedKey + ':y')) + spanJitterY, 0, worldHeight)
    };
  }
  if (side === 1) {
    return {
      x: fumeClamp(paperBounds.right + overflowX, 0, worldWidth),
      y: fumeClamp(fumeMix(paperBounds.top - height * 0.12, paperBounds.bottom + height * 0.12,
        fumeSeeded(seedKey + ':y')) + spanJitterY, 0, worldHeight)
    };
  }
  if (side === 2) {
    return {
      x: fumeClamp(fumeMix(paperBounds.left - width * 0.12, paperBounds.right + width * 0.12,
        fumeSeeded(seedKey + ':x')) + spanJitterX, 0, worldWidth),
      y: fumeClamp(paperBounds.top - overflowY, 0, worldHeight)
    };
  }
  return {
    x: fumeClamp(fumeMix(paperBounds.left - width * 0.12, paperBounds.right + width * 0.12,
      fumeSeeded(seedKey + ':x')) + spanJitterX, 0, worldWidth),
    y: fumeClamp(paperBounds.bottom + overflowY, 0, worldHeight)
  };
}

function fumeBuildBackgroundScene(viewport, world, paperBounds, seed) {
  if (viewport.width <= 0 || viewport.height <= 0 || world.width <= 0 || world.height <= 0) {
    return {
      width: Math.max(world.width, viewport.width, 1),
      height: Math.max(world.height, viewport.height, 1),
      shapes: []
    };
  }
  var worldWidth = Math.max(world.width, viewport.width * 1.2);
  var worldHeight = Math.max(world.height, viewport.height * 1.2);
  var baseUnit = fumeClamp(Math.min(viewport.width, viewport.height) * 0.72, 320, 760);
  var resolvedPaperBounds = fumeNormalizeBounds(paperBounds || {
    left: worldWidth * 0.24, top: worldHeight * 0.18,
    right: worldWidth * 0.76, bottom: worldHeight * 0.82
  }, worldWidth, worldHeight);
  var shapeKinds = ['ring', 'square', 'cross', 'ring', 'square', 'cross'];
  var shapeCount = worldWidth > worldHeight ? 8 : 7;
  var sparkBands = ['treble', 'vocal', 'mid', 'treble', 'lowMid'];
  var sparkCount = worldWidth > worldHeight ? 12 : 9;
  var sparkAreaLeft = worldWidth * 0.2;
  var sparkAreaRight = worldWidth * 0.8;
  var sparkAreaTop = worldHeight * 0.18;
  var sparkAreaBottom = worldHeight * 0.82;
  var sparkAreaWidth = sparkAreaRight - sparkAreaLeft;
  var sparkAreaHeight = sparkAreaBottom - sparkAreaTop;
  var sparkColumns = Math.ceil(Math.sqrt(sparkCount * (worldWidth / Math.max(worldHeight, 1))));
  var sparkRows = Math.ceil(sparkCount / sparkColumns);
  var sparkCellWidth = sparkAreaWidth / sparkColumns;
  var sparkCellHeight = sparkAreaHeight / sparkRows;

  var shapes = [];
  for (var i = 0; i < shapeCount; i++) {
    var localSeed = (seed || 'fume') + ':' + worldWidth + ':' + worldHeight + ':' + i;
    var kind = shapeKinds[i % shapeKinds.length];
    var width = baseUnit * fumeMix(0.82, 1.36, fumeSeeded(localSeed + ':size'));
    var anchor = fumeChoosePaperHaloAnchor(resolvedPaperBounds, worldWidth, worldHeight, width, width, localSeed);
    shapes.push({
      id: 'fume-bg-' + i,
      kind: kind,
      x: anchor.x, y: anchor.y,
      width: width, height: width,
      rotation: fumeMix(-Math.PI * 0.2, Math.PI * 0.2, fumeSeeded(localSeed + ':rotation')),
      rotationSpeed: fumeMix(-0.045, 0.045, fumeSeeded(localSeed + ':rotation-speed')),
      strokeWidth: fumeMix(0.25, 2.1, fumeSeeded(localSeed + ':stroke-width')),
      opacity: fumeMix(0.01, 0.16, fumeSeeded(localSeed + ':opacity')),
      color: fumeSeeded(localSeed + ':color') > 0.5 ? 'accent' : 'secondary',
      depth: fumeSeeded(localSeed + ':depth'),
      audioBand: null,
      ringGapStart: kind === 'ring' ? fumeMix(-Math.PI, Math.PI, fumeSeeded(localSeed + ':gap-start')) : null,
      ringGapSize: kind === 'ring' ? fumeMix(Math.PI * 0.12, Math.PI * 0.24, fumeSeeded(localSeed + ':gap-size')) : null
    });
  }
  for (var sp = 0; sp < sparkCount; sp++) {
    var sSeed = (seed || 'fume') + ':' + worldWidth + ':' + worldHeight + ':spark:' + sp;
    var sWidth = baseUnit * fumeMix(0.1, 0.24, fumeSeeded(sSeed + ':size'));
    var column = sp % sparkColumns;
    var row = Math.floor(sp / sparkColumns);
    var jitterX = fumeMix(-0.32, 0.32, fumeSeeded(sSeed + ':jitter-x')) * sparkCellWidth;
    var jitterY = fumeMix(-0.32, 0.32, fumeSeeded(sSeed + ':jitter-y')) * sparkCellHeight;
    shapes.push({
      id: 'fume-spark-' + sp,
      kind: 'spark',
      x: fumeClamp(sparkAreaLeft + (column + 0.5) * sparkCellWidth + jitterX, sparkAreaLeft, sparkAreaRight),
      y: fumeClamp(sparkAreaTop + (row + 0.5) * sparkCellHeight + jitterY, sparkAreaTop, sparkAreaBottom),
      width: sWidth, height: sWidth,
      rotation: fumeMix(-Math.PI, Math.PI, fumeSeeded(sSeed + ':rotation')),
      rotationSpeed: fumeMix(-0.18, 0.18, fumeSeeded(sSeed + ':rotation-speed')),
      strokeWidth: fumeMix(0.75, 1.7, fumeSeeded(sSeed + ':stroke-width')),
      opacity: fumeMix(0.08, 0.22, fumeSeeded(sSeed + ':opacity')),
      color: fumeSeeded(sSeed + ':color') > 0.5 ? 'accent' : 'secondary',
      depth: fumeSeeded(sSeed + ':depth'),
      audioBand: sparkBands[sp % sparkBands.length],
      ringGapStart: null, ringGapSize: null
    });
  }
  shapes.sort(function (a, b) { return a.depth - b.depth; });
  return { width: worldWidth, height: worldHeight, shapes: shapes };
}

function fumeBuildShapePath(context, shape) {
  context.beginPath();
  if (shape.kind === 'ring') {
    var gapStart = shape.ringGapStart != null ? shape.ringGapStart : -Math.PI * 0.18;
    var gapSize = fumeClamp(shape.ringGapSize != null ? shape.ringGapSize : Math.PI * 0.2, 0.18, Math.PI * 0.6);
    context.lineCap = 'round';
    context.ellipse(0, 0, shape.width * 0.5, shape.width * 0.5, 0, gapStart + gapSize, gapStart + Math.PI * 2);
  } else {
    var size = shape.width;
    if (shape.kind === 'square') {
      context.rect(-size * 0.5, -size * 0.5, size, size);
    } else if (shape.kind === 'cross') {
      var arm = size * 0.3;
      context.moveTo(-arm, -size * 0.5);
      context.lineTo(arm, -size * 0.5);
      context.lineTo(arm, -arm);
      context.lineTo(size * 0.5, -arm);
      context.lineTo(size * 0.5, arm);
      context.lineTo(arm, arm);
      context.lineTo(arm, size * 0.5);
      context.lineTo(-arm, size * 0.5);
      context.lineTo(-arm, arm);
      context.lineTo(-size * 0.5, arm);
      context.lineTo(-size * 0.5, -arm);
      context.lineTo(-arm, -arm);
      context.closePath();
    } else {
      var outer = size * 0.5;
      var inner = size * 0.13;
      context.moveTo(0, -outer);
      context.lineTo(inner, -inner);
      context.lineTo(outer, 0);
      context.lineTo(inner, inner);
      context.lineTo(0, outer);
      context.lineTo(-inner, inner);
      context.lineTo(-outer, 0);
      context.lineTo(-inner, -inner);
      context.closePath();
    }
  }
}

/* 背景描边渐变缓存：同 shape × 量化透明度复用（参照雨窗精灵预渲染纪律） */
var fumeBgGradientCache = new Map();
var fumeBgShapeDraw = { kind: 'ring', width: 0, height: 0, ringGapStart: null, ringGapSize: null };

function fumeBgLineGradient(context, theme, shape, opacity) {
  var key = shape.id + '|' + theme.name + '|' + opacity.toFixed(2);
  var gradient = fumeBgGradientCache.get(key);
  if (gradient) return gradient;
  gradient = context.createLinearGradient(
    -shape.width * 0.55, -shape.height * 0.28, shape.width * 0.55, shape.height * 0.28);
  gradient.addColorStop(0, fumeColorWithAlpha(theme.secondaryColor, opacity * 0.18));
  gradient.addColorStop(0.28, fumeColorWithAlpha(fumeMixColors(theme.secondaryColor, theme.accentColor, 0.24), opacity * 0.58));
  gradient.addColorStop(0.54, fumeColorWithAlpha(fumeMixColors(theme.secondaryColor, theme.accentColor, 0.62), opacity * 0.92));
  gradient.addColorStop(1, fumeColorWithAlpha(theme.accentColor, opacity * 0.7));
  if (fumeBgGradientCache.size > 512) fumeBgGradientCache.clear();
  fumeBgGradientCache.set(key, gradient);
  return gradient;
}

function fumeDrawBackground(context, scene, theme, time, audioLevels, parallax, objectOpacityMultiplier) {
  var resolvedMultiplier = fumeClamp(objectOpacityMultiplier == null ? 1 : objectOpacityMultiplier, 0, 2);
  var parallaxStrength = parallax ? (parallax.strength == null ? 1 : parallax.strength) : 1;
  for (var i = 0; i < scene.shapes.length; i++) {
    var shape = scene.shapes[i];
    var bandValue = shape.audioBand ? audioLevels[shape.audioBand] : undefined;
    var audioScale = bandValue === undefined ? 1
      : fumeMix(0.95, 1.45, fumeClamp((bandValue - 10) / 190, 0, 1));
    var audioOpacityBoost = bandValue === undefined ? 1
      : fumeMix(0.85, 1.55, fumeClamp((bandValue - 10) / 190, 0, 1));
    var layerResponse = fumeMix(0.58, 1.16, shape.depth);
    var parallaxOffsetX = parallax ? (parallax.cameraX - parallax.originX) * (1 - layerResponse) * parallaxStrength : 0;
    var parallaxOffsetY = parallax ? (parallax.cameraY - parallax.originY) * (1 - layerResponse) * parallaxStrength : 0;
    var rx = shape.x + parallaxOffsetX;
    var ry = shape.y + parallaxOffsetY;
    var rWidth = shape.width * audioScale;
    var rHeight = shape.height * audioScale;
    var rRotation = shape.rotation + time * shape.rotationSpeed;

    context.save();
    context.lineWidth = shape.strokeWidth;
    var shapeColor = shape.color === 'accent' ? theme.accentColor : theme.secondaryColor;
    var drawOpacity = fumeClamp(shape.opacity * audioOpacityBoost * resolvedMultiplier, 0, 0.42);
    if (shape.kind === 'spark') {
      context.translate(rx, ry);
      context.rotate(rRotation);
      context.strokeStyle = fumeColorWithAlpha(shapeColor, drawOpacity);
      context.shadowBlur = 10 * audioScale;
      context.shadowColor = fumeColorWithAlpha(
        shapeColor, shape.opacity * audioOpacityBoost * 0.75 * resolvedMultiplier);
      fumeBgShapeDraw.kind = 'spark';
      fumeBgShapeDraw.width = rWidth;
      fumeBgShapeDraw.height = rHeight;
      fumeBuildShapePath(context, fumeBgShapeDraw);
      context.stroke();
    } else {
      context.translate(rx, ry);
      context.rotate(rRotation);
      /* 两层描边：细淡底 + 渐变亮面 */
      fumeBgShapeDraw.kind = shape.kind;
      fumeBgShapeDraw.width = rWidth;
      fumeBgShapeDraw.height = rHeight;
      fumeBgShapeDraw.ringGapStart = shape.ringGapStart;
      fumeBgShapeDraw.ringGapSize = shape.ringGapSize;
      fumeBuildShapePath(context, fumeBgShapeDraw);
      context.strokeStyle = fumeBgLineGradient(context, theme, shape, drawOpacity * 0.56);
      context.lineWidth = Math.max(shape.strokeWidth * 0.28, 0.14);
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      context.stroke();
      fumeBuildShapePath(context, fumeBgShapeDraw);
      context.strokeStyle = fumeBgLineGradient(context, theme, shape, drawOpacity);
      context.lineWidth = Math.max(shape.strokeWidth * 0.92, 0.78);
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      context.stroke();
    }
    context.restore();
  }
}

/* ============================ §14 文本绘制与静态快照（fumeCanvasText.ts） ============================ */

function fumeBuildCanvasFont(block) {
  return fumeBuildFontSpec(block.fontPx, block.variant, fumeTheme.fontFamilyStack);
}

function fumeQuantizeShadowBlur(px) {
  /* 量化为整像素：连续变化的模糊半径会让 Chromium 每帧铸造新 glyph strike（见 Folia glowBlurQuantize） */
  if (!isFinite(px)) return 0;
  return Math.max(0, Math.round(px));
}

function fumeDrawRenderTextRun(context, renderLine, segment, runStart, runEnd, baseX, baseY) {
  if (!segment.text || runEnd <= runStart) return;
  var segmentRunStart = Math.max(runStart - segment.localStart, 0);
  var segmentRunEnd = Math.min(runEnd - segment.localStart, segment.measuredGlyphOffsets.length - 1);
  var clipLeft = segment.measuredGlyphOffsets[segmentRunStart] != null
    ? segment.measuredGlyphOffsets[segmentRunStart]
    : (fumeResolveRenderLineOffset(renderLine, runStart) - segment.x);
  var clipRight = segment.measuredGlyphOffsets[segmentRunEnd] != null
    ? segment.measuredGlyphOffsets[segmentRunEnd]
    : (fumeResolveRenderLineOffset(renderLine, runEnd) - segment.x);
  var clipWidth = Math.max(clipRight - clipLeft, 0);
  if (clipWidth <= 0) return;
  context.save();
  context.beginPath();
  context.rect(
    baseX + segment.x + clipLeft,
    baseY - Math.max(clipWidth, 1) - 64,
    clipWidth,
    Math.max(128 + clipWidth * 2, 256));
  context.clip();
  context.fillText(segment.text, baseX + segment.x, baseY);
  context.restore();
}

function fumeCreateStaticBlockSnapshot(block, fillStyle, shadowBlur, shadowColor) {
  if (typeof document === 'undefined') return null;
  var rasterScale = fumeClamp(window.devicePixelRatio || 1, 1, 2);
  var padding = Math.ceil(Math.max(block.fontPx * 0.32, shadowBlur + block.fontPx * 0.08, 4));
  var canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil((block.width + padding * 2) * rasterScale));
  canvas.height = Math.max(1, Math.ceil((block.height + padding * 2) * rasterScale));
  var context = canvas.getContext('2d');
  if (!context) return null;
  var baselineOffset = block.lineHeight * (fumeIsCJK(block.line.fullText) ? 0.52 : 0.5);
  context.setTransform(rasterScale, 0, 0, rasterScale, 0, 0);
  context.font = fumeBuildCanvasFont(block);
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = fillStyle;
  context.shadowBlur = shadowBlur;
  context.shadowColor = shadowColor;
  for (var i = 0; i < block.renderLines.length; i++) {
    var renderLine = block.renderLines[i];
    context.fillText(renderLine.text, renderLine.left + padding, renderLine.top + baselineOffset + padding);
  }
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  return { canvas: canvas, padding: padding };
}

/* 打印中块：逐字风格 + 行光晕 + 落章光斑（世界坐标，画在当前变换下） */
function fumeDrawLiveBlock(context, block, timing, params) {
  var time = params.time, theme = params.theme;
  var glowIntensity = params.glowIntensity, activeGlowBoost = params.activeGlowBoost;
  var passedGlowBase = params.passedGlowBase, showPrintStamp = params.showPrintStamp;
  var waitingOpacity = timing.waitingOpacity, activeOpacity = timing.activeOpacity;
  var transitionPassedStyle = timing.transitionPassedStyle, baselineOffset = timing.baselineOffset;
  var linePassCutoffTime = timing.linePassCutoffTime;
  var hasRevealCompleted = timing.hasRevealCompleted, hasPassCutoffReached = timing.hasPassCutoffReached;
  var lineDuration = timing.lineDuration, colorTrailDuration = timing.colorTrailDuration;
  var printedCount = fumeResolvePrintedGraphemeCount(
    block.line, block.wordRanges, block.graphemes.length, time);
  var totalGraphemeCount = block.graphemes.length;

  context.save();
  context.font = fumeBuildCanvasFont(block);
  context.textAlign = 'left';
  context.textBaseline = 'middle';

  var isLineActive = time >= block.line.startTime && time <= linePassCutoffTime;
  if (isLineActive) {
    var lineProgress = fumeResolveVisualProgressWithCutoff(
      block.line.startTime, lineDuration, time, linePassCutoffTime);
    var lineGlowEnvelope = fumeResolveDelayedGlowEnvelope(lineProgress, 0.8);
    var lineGlowAlpha = (
      (block.variant === 'hero' ? 0.16 : 0.12)
      + lineGlowEnvelope * (block.variant === 'hero' ? 0.26 : 0.2)
    ) * glowIntensity;
    var lineGlowBlur = (
      (block.variant === 'hero' ? 12 : 8)
      + lineGlowEnvelope * (block.fontPx * (block.variant === 'hero' ? 0.7 : 0.52))
    ) * glowIntensity;
    var lineGlowColor = fumeColorWithAlpha(theme.accentColor, lineGlowAlpha);
    context.save();
    context.fillStyle = lineGlowColor;
    context.shadowBlur = fumeQuantizeShadowBlur(lineGlowBlur);
    context.shadowColor = fumeColorWithAlpha(theme.accentColor, lineGlowAlpha * 1.35);
    for (var gl = 0; gl < block.renderLines.length; gl++) {
      var glowLine = block.renderLines[gl];
      var glowBaseX = block.x + glowLine.left;
      var glowBaseY = block.y + glowLine.top + baselineOffset;
      for (var gs = 0; gs < glowLine.segments.length; gs++) {
        var glowSeg = glowLine.segments[gs];
        if (!glowSeg.text.trim().length) continue;
        context.fillText(glowSeg.text, glowBaseX + glowSeg.x, glowBaseY);
      }
    }
    context.restore();
  }

  for (var rl = 0; rl < block.renderLines.length; rl++) {
    var renderLine = block.renderLines[rl];
    var baseX = block.x + renderLine.left;
    var baseY = block.y + renderLine.top + baselineOffset;
    for (var sg = 0; sg < renderLine.segments.length; sg++) {
      var segment = renderLine.segments[sg];
      var runStart = -1;
      var runFillStyle = '';
      var runShadowBlur = 0;
      var runShadowColor = 'transparent';
      var runStyleKey = '';

      function flushRun(segmentEnd) {
        if (runStart < 0 || !runStyleKey || segmentEnd <= runStart) return;
        var localStart = runStart - renderLine.start;
        var localEnd = segmentEnd - renderLine.start;
        var runText = renderLine.graphemes.slice(localStart, localEnd).join('');
        if (!runText || (!runText.trim().length && runFillStyle === '')) {
          runStart = -1;
          runStyleKey = '';
          return;
        }
        context.fillStyle = runFillStyle;
        context.shadowBlur = runShadowBlur;
        context.shadowColor = runShadowColor;
        fumeDrawRenderTextRun(context, renderLine, segment, localStart, localEnd, baseX, baseY);
        context.shadowBlur = 0;
        context.shadowColor = 'transparent';
        runStart = -1;
        runStyleKey = '';
      }

      for (var go = segment.start; go < segment.end; go++) {
        var graphemeIndex = go - renderLine.start;
        var grapheme = renderLine.graphemes[graphemeIndex];
        var rangeIndex = block.wordRangeIndexByOffset[go] != null ? block.wordRangeIndexByOffset[go] : -1;
        var range = rangeIndex >= 0 ? block.wordRanges[rangeIndex] : null;
        var colorRangeIndex = block.colorRangeIndexByOffset[go] != null ? block.colorRangeIndexByOffset[go] : -1;
        var colorRange = colorRangeIndex >= 0 ? block.wordRanges[colorRangeIndex] : range;
        var isPrinted = hasRevealCompleted || go < printedCount;
        var isFrontier = printedCount > 0
          && go === printedCount
          && printedCount < totalGraphemeCount
          && !hasRevealCompleted
          && !hasPassCutoffReached;

        var alpha = isPrinted ? activeOpacity : isFrontier ? 0.82 : waitingOpacity;
        var shadowBlur = 0;
        var shadowColor = 'transparent';
        var fillStyle = fumeColorWithAlpha(theme.primaryColor, alpha);

        if (range) {
          var wordDuration = Math.max(range.word.endTime - range.word.startTime, 0.08);
          var wordProgress = fumeClamp((time - range.word.startTime) / wordDuration, 0, 1);
          var glyphCount = Math.max(range.end - range.start, 1);
          var glyphIndexInRange = go - range.start;
          /* 无音节数据：词内均匀推进 */
          var glyphStartTime = range.word.startTime + (glyphIndexInRange / glyphCount) * wordDuration;
          var glyphEndTime = range.word.startTime + ((glyphIndexInRange + 1) / glyphCount) * wordDuration;
          var glyphDuration = Math.max(glyphEndTime - glyphStartTime, 0.001);
          var glyphProgress = fumeClamp(wordProgress * glyphCount - glyphIndexInRange + 0.16, 0, 1);
          var easedGlyphProgress = fumeEaseOutCubic(glyphProgress);
          var activeColor = fumeGetActiveColor();
          var glyphTrailStart = glyphStartTime + glyphDuration * 0.18;
          var colorTrailPhase = fumeResolveVisualProgressWithCutoff(
            glyphTrailStart, colorTrailDuration, time, linePassCutoffTime);
          var colorTrailProgress = Math.pow(colorTrailPhase, 1.35);

          if (hasPassCutoffReached) {
            alpha = fumeMix(activeOpacity, transitionPassedStyle.opacity, colorTrailProgress);
            fillStyle = fumeMixColors(activeColor, theme.primaryColor, 0.18 + colorTrailProgress * 0.82, alpha);
            shadowBlur = (2 + block.fontPx * 0.1) * (1 - colorTrailProgress * 0.35) * passedGlowBase * transitionPassedStyle.glowMultiplier;
            shadowColor = fumeColorWithAlpha(
              fumeMixColors(activeColor, theme.primaryColor, 0.55 + colorTrailProgress * 0.45),
              transitionPassedStyle.shadowAlphaBase + (1 - colorTrailProgress) * transitionPassedStyle.shadowAlphaTrail);
          } else if (time < range.word.startTime) {
            alpha = waitingOpacity;
            fillStyle = fumeColorWithAlpha(theme.primaryColor, alpha);
          } else if (time <= glyphTrailStart) {
            alpha = fumeMix(waitingOpacity, activeOpacity, easedGlyphProgress);
            fillStyle = fumeMixColors(theme.primaryColor, activeColor, 0.22 + easedGlyphProgress * 0.78, alpha);
            shadowBlur = (4 + block.fontPx * 0.22) * easedGlyphProgress * activeGlowBoost;
            shadowColor = fumeColorWithAlpha(activeColor, 0.4 + easedGlyphProgress * 0.44);
          } else {
            alpha = fumeMix(activeOpacity, transitionPassedStyle.opacity, colorTrailProgress);
            fillStyle = fumeMixColors(activeColor, theme.primaryColor, 0.18 + colorTrailProgress * 0.82, alpha);
            shadowBlur = (2 + block.fontPx * 0.1) * (1 - colorTrailProgress * 0.35) * passedGlowBase * transitionPassedStyle.glowMultiplier;
            shadowColor = fumeColorWithAlpha(
              fumeMixColors(activeColor, theme.primaryColor, 0.55 + colorTrailProgress * 0.45),
              transitionPassedStyle.shadowAlphaBase + (1 - colorTrailProgress) * transitionPassedStyle.shadowAlphaTrail);
          }

          if (showPrintStamp && grapheme.trim().length > 0) {
            var glyphWindowDuration = Math.max(wordDuration / glyphCount, 0.04);
            var activationLeadDuration = fumeClamp(
              Math.min(glyphWindowDuration * 0.86, lineDuration * 0.16),
              0.055,
              block.variant === 'hero' ? 0.2 : 0.16);
            var activationReleaseDuration = activationLeadDuration * 0.42;
            var activationWindowStart = glyphTrailStart - activationLeadDuration;
            var activationWindowEnd = glyphTrailStart + activationReleaseDuration;
            var glyphAdvance = fumeResolveSegmentGlyphAdvance(segment, go);
            var stampProgress = fumeResolveVisualProgressWithCutoff(
              activationWindowStart, activationWindowEnd - activationWindowStart, time, linePassCutoffTime);
            if (stampProgress > 0 && stampProgress < 1) {
              var glyphTrailPhase = fumeResolveVisualProgressWithCutoff(
                glyphTrailStart, Math.max(activationWindowEnd - glyphTrailStart, 0.001), time, linePassCutoffTime);
              var isDropping = glyphTrailPhase <= 0;
              var dropProgress = isDropping
                ? fumeEaseOutCubic(fumeResolveVisualProgressWithCutoff(
                  activationWindowStart, Math.max(glyphTrailStart - activationWindowStart, 0.001), time, linePassCutoffTime))
                : 1;
              var fadeProgress = isDropping ? 0 : fumeEaseInOutCubic(glyphTrailPhase);
              var blockPulse = isDropping
                ? fumeMix(0.18, 1, Math.pow(dropProgress, 0.78))
                : Math.pow(1 - fadeProgress, 1.2);
              var glyphVisualWidth = Math.max(
                glyphAdvance * 0.88,
                fumeIsCJK(grapheme) ? block.fontPx * 0.56 : block.fontPx * 0.38);
              var blockCenterX = baseX + segment.x + fumeResolveSegmentGlyphOffset(segment, go) + glyphAdvance * 0.5;
              var dropDistance = block.lineHeight * (block.variant === 'hero' ? 0.24 : 0.2);
              var activationBlockAlpha = blockPulse * (block.variant === 'hero' ? 0.82 : 0.72);
              var activationBlockWidth = glyphVisualWidth + block.fontPx * (block.variant === 'hero' ? 0.18 : 0.12);
              var activationBlockHeight = block.fontPx * (block.variant === 'hero' ? 0.72 : 0.62);
              var activationBlockY = baseY - block.fontPx * 0.38 - fumeMix(dropDistance, 0, dropProgress);
              var activationBlockBlur = fumeQuantizeShadowBlur((8 + block.fontPx * 0.24) * blockPulse * activeGlowBoost);
              if (activationBlockWidth > 0) {
                var blockLeft = blockCenterX - activationBlockWidth * 0.5;
                context.save();
                context.fillStyle = fumeColorWithAlpha(activeColor, activationBlockAlpha);
                context.shadowBlur = activationBlockBlur;
                context.shadowColor = fumeColorWithAlpha(activeColor, 0.56 * blockPulse);
                context.fillRect(
                  blockLeft,
                  activationBlockY - activationBlockHeight * 0.5,
                  activationBlockWidth,
                  activationBlockHeight);
                context.restore();
              }
            }
          }
        }

        if (alpha <= 0.002) {
          flushRun(go);
          continue;
        }
        shadowBlur = fumeQuantizeShadowBlur(shadowBlur);
        var styleKey = fillStyle + '|' + shadowColor + '|' + shadowBlur.toFixed(3);
        if (runStart < 0) {
          runStart = go;
          runFillStyle = fillStyle;
          runShadowBlur = shadowBlur;
          runShadowColor = shadowColor;
          runStyleKey = styleKey;
          continue;
        }
        if (styleKey !== runStyleKey) {
          flushRun(go);
          runStart = go;
          runFillStyle = fillStyle;
          runShadowBlur = shadowBlur;
          runShadowColor = shadowColor;
          runStyleKey = styleKey;
        }
      }
      flushRun(segment.end);
    }
  }
  context.restore();
}

/* ============================ §15 限尺度活动光栅（fumeLiveRaster.ts） ============================
   打印中的文本直接画在不断缩放的相机变换下，每帧都会向 Chromium 的字形缓存
   请求一个新尺寸。这里把活动块画到自己的画布上，光栅尺度取当前设备尺度之上
   的离散档（每倍频程 48 档，最大缩小 1.5%），再把画布贴回相机变换下。 */

var FUME_LIVE_IDLE_MS = 5000;
var FUME_LIVE_CANVAS_GRANULE = 256;
var FUME_LIVE_RASTER_LEVELS_PER_OCTAVE = 48;

function fumeResolveLiveRasterScale(scale) {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(scale, 1e-3)) * FUME_LIVE_RASTER_LEVELS_PER_OCTAVE - 1e-9) / FUME_LIVE_RASTER_LEVELS_PER_OCTAVE);
}

var fumeLiveCanvases = new Map();   /* blockId → {canvas, context, lastUsed, usedWidth, usedHeight} */
var fumeLiveImage = { canvas: null, width: 0, height: 0, x: 0, y: 0, worldWidth: 0, worldHeight: 0 };

function fumeLiveEnsure(id, width, height) {
  var current = fumeLiveCanvases.get(id);
  if (current && current.canvas.width >= width && current.canvas.height >= height) return current;
  var canvas = current ? current.canvas : document.createElement('canvas');
  canvas.width = Math.ceil(Math.max(width, current ? current.canvas.width : 0) / FUME_LIVE_CANVAS_GRANULE) * FUME_LIVE_CANVAS_GRANULE;
  canvas.height = Math.ceil(Math.max(height, current ? current.canvas.height : 0) / FUME_LIVE_CANVAS_GRANULE) * FUME_LIVE_CANVAS_GRANULE;
  var context = canvas.getContext('2d');
  if (!context) return null;
  var live = { canvas: canvas, context: context, lastUsed: 0, usedWidth: 0, usedHeight: 0 };
  fumeLiveCanvases.set(id, live);
  return live;
}

function fumeLiveRasterDraw(block, timing, params, deviceScale, visible, now) {
  var scale = fumeResolveLiveRasterScale(deviceScale);
  var glowReach = (12 + block.fontPx * 0.7) * Math.max(params.glowIntensity, 1) * 1.5;
  var pad = Math.ceil(block.lineHeight * 0.5 + glowReach / Math.max(scale, 0.01));
  var left = Math.max(block.x - pad, visible.left);
  var top = Math.max(block.y - pad, visible.top);
  var right = Math.min(block.x + block.width + pad, visible.right);
  var bottom = Math.min(block.y + block.height + pad, visible.bottom);
  if (right <= left || bottom <= top) return null;
  var width = Math.max(1, Math.ceil((right - left) * scale));
  var height = Math.max(1, Math.ceil((bottom - top) * scale));
  var live = fumeLiveEnsure(block.id, width, height);
  if (!live) return null;
  var context = live.context;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, Math.max(live.usedWidth, width), Math.max(live.usedHeight, height));
  context.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
  fumeDrawLiveBlock(context, block, timing, params);
  live.usedWidth = width;
  live.usedHeight = height;
  live.lastUsed = now;
  fumeLiveImage.canvas = live.canvas;
  fumeLiveImage.width = width;
  fumeLiveImage.height = height;
  fumeLiveImage.x = left;
  fumeLiveImage.y = top;
  fumeLiveImage.worldWidth = width / scale;
  fumeLiveImage.worldHeight = height / scale;
  return fumeLiveImage;
}

function fumeLiveRasterSweep(now) {
  fumeLiveCanvases.forEach(function (live, id) {
    if (now - live.lastUsed <= FUME_LIVE_IDLE_MS) return;
    live.canvas.width = 0;
    live.canvas.height = 0;
    fumeLiveCanvases.delete(id);
  });
}

function fumeLiveRasterClear() {
  fumeLiveRasterSweep(Number.POSITIVE_INFINITY);
}

/* ============================ §16 舞台（useFumeCanvasStage.ts / fumeStage.ts → 30fps） ============================ */

var FUME_SNAPSHOT_IDLE_MS = 15000;
var fumeSnapshotCache = new Map();  /* key → {snapshot, lastUsed} */

function fumeReleaseSnapshots(now) {
  fumeSnapshotCache.forEach(function (entry, key) {
    if (now - entry.lastUsed <= FUME_SNAPSHOT_IDLE_MS) return;
    entry.snapshot.canvas.width = 0;
    entry.snapshot.canvas.height = 0;
    fumeSnapshotCache.delete(key);
  });
}

function fumeReleaseAllSnapshots() {
  fumeReleaseSnapshots(Number.POSITIVE_INFINITY);
}

/* 每帧复用的暂存对象（渲染帧零持久分配纪律） */
var fumeAudioLevels = { power: 0, bass: 0, lowMid: 0, mid: 0, vocal: 0, treble: 0 };
var fumeStaticLayersOut = [];
var fumeStaticLayerInput = {
  time: 0, theme: null, passedGlowBase: 0, passedFadeDuration: 0,
  overviewTextRestoreProgress: 0, snapshotScale: 1
};
var fumeLiveParams = { time: 0, theme: null, glowIntensity: 1, activeGlowBoost: 0, passedGlowBase: 0, showPrintStamp: true };
var fumeLiveFrame = { deviceScale: 1, visible: { left: 0, top: 0, right: 0, bottom: 0 } };
var fumeCameraInput = {
  article: null, time: 0, now: 0, dt: 0, lineIndex: -1,
  viewport: null, overviewCamera: null, overviewStartTime: 0,
  cameraSpeed: 1, cameraTrackingMode: 'smooth', staticMode: false, animationIntensity: 'normal'
};
var fumeBgParallax = { cameraX: 0, cameraY: 0, originX: 0, originY: 0, strength: 0.72 };

/* MotionValue → motionSignalGet；覆盖层期间主循环信号停更 → frequencyData 自算回退。
   Folia band 值域 ≈10..200（FumeBackground 按 (v-10)/190 归一），此处统一 ×200。 */
function fumeReadAudioLevels() {
  var bands = (typeof motionSignalGet === 'function') ? motionSignalGet('bands') : null;
  var power = (typeof motionSignalGet === 'function') ? motionSignalGet('audioPower') : 0;
  if (bands && typeof bands === 'object') {
    fumeAudioLevels.power = (power || 0) * 200;
    fumeAudioLevels.bass = (bands.kick || 0) * 200;
    fumeAudioLevels.lowMid = (bands.mid || 0) * 200;
    fumeAudioLevels.mid = (bands.mid || 0) * 200;
    fumeAudioLevels.vocal = (bands.vocal || 0) * 200;
    fumeAudioLevels.treble = (bands.treble || 0) * 200;
    return fumeAudioLevels;
  }
  var fd = (typeof frequencyData !== 'undefined') ? frequencyData : null;
  if (fd && fd.length) {
    function avg(from, to) {
      var sum = 0, n = 0;
      var hi = Math.min(to, fd.length - 1);
      for (var i = from; i <= hi; i++) { sum += fd[i]; n++; }
      return n ? (sum / n) : 0;
    }
    fumeAudioLevels.power = avg(1, 140);
    fumeAudioLevels.bass = avg(1, 7);
    fumeAudioLevels.lowMid = avg(8, 40);
    fumeAudioLevels.mid = avg(41, 140);
    fumeAudioLevels.vocal = avg(9, 140);
    fumeAudioLevels.treble = avg(280, fd.length - 1);
  } else {
    fumeAudioLevels.power = 0;
    fumeAudioLevels.bass = 0;
    fumeAudioLevels.lowMid = 0;
    fumeAudioLevels.mid = 0;
    fumeAudioLevels.vocal = 0;
    fumeAudioLevels.treble = 0;
  }
  return fumeAudioLevels;
}

/* 主题：MineRadio 日落暖色协调版（Folia Theme 结构）。
   96-theme-service 的封面派生双主题就绪后由 fumeSyncTheme 覆写颜色与名字
   （排版缓存键含 theme.name → 主题变化自动整版重排）；字体栈保持用户设置。 */
var fumeTheme = {
  name: 'mineradio-sunset',
  backgroundColor: '#171009',
  primaryColor: '#f2e6d4',
  accentColor: '#ff9c6e',
  secondaryColor: '#d98e6a',
  animationIntensity: 'normal',
  fontFamilyStack: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", "SimSun", Georgia, "Iowan Old Style", "Times New Roman", serif'
};

function fumeSyncTheme() {
  if (typeof themeServiceActiveTheme !== 'function') return;
  var active = null;
  try { active = themeServiceActiveTheme(); } catch (e) { return; }
  if (!active || active.name === fumeTheme.name) return;
  var keepFont = fumeTheme.fontFamilyStack;
  fumeTheme.name = active.name;
  fumeTheme.backgroundColor = active.backgroundColor;
  fumeTheme.primaryColor = active.primaryColor;
  fumeTheme.accentColor = active.accentColor;
  fumeTheme.secondaryColor = active.secondaryColor;
  fumeTheme.animationIntensity = active.animationIntensity || 'normal';
  fumeTheme.fontFamilyStack = keepFont;
  fumeRequestLayout();   /* 主题色变了 → 纸面重排重绘 */
}

/* 报纸的排版语言是衬线（Folia serif 栈：思源宋/Songti/Georgia；
   试验场与 README 参照均衬线观感），用户在 DIY 控制台选了歌词字体则用用户的 */
var FUME_SERIF_STACK = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", "SimSun", Georgia, "Iowan Old Style", "Times New Roman", serif';

function fumeFontStack() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  var stack = (fontKey && typeof lyricFontStackForKey === 'function')
    ? lyricFontStackForKey(fontKey)
    : FUME_SERIF_STACK;
  fumeTheme.fontFamilyStack = stack;
  return stack;
}

var fumeLastThemeSync = 0;
function fumeCheckFontChange() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  if (fumeLastFontKey !== fontKey) {
    fumeLastFontKey = fontKey;
    fumeFontStack();
    fumeRequestLayout();     /* 字体几何变化 → 整版重排 */
  }
  /* 主题服务轮询的低频影子检查（封面派生主题就位/昼夜切换时换色重排） */
  var nowMs = performance.now();
  if (nowMs - fumeLastThemeSync > 1500) {
    fumeLastThemeSync = nowMs;
    fumeSyncTheme();
  }
}

/* ---- 运行状态 ---- */
var fumeState = {
  ctx: null,
  viewport: { width: 0, height: 0 },
  article: null,
  backgroundScene: null,
  overviewCamera: null,
  overviewStartTime: Number.POSITIVE_INFINITY,
  passedFadeDuration: Number.POSITIVE_INFINITY,
  lines: [],
  lineIndex: -1
};
var fumeLastLayoutCache = null;       /* { key, article }——布局缓存键比对复用 */
var fumeHasResolvedArticle = false;
var fumeLayoutPending = false;
var fumeLayoutVersion = 0;
var fumeLayoutRaf = 0;
var fumeLayoutTimer = 0;
var fumeLinesKey = '';
var fumeLyricsPollToken = 0;
var fumeLastFrameAt = null;

/* 歌词数据适配：lyricsLines（{t,text,duration,words[{text,t,d,c0,c1}]}）→ Folia Line 结构 */
function fumeBuildAdapterLines() {
  var out = [];
  if (typeof lyricsLines === 'undefined' || !lyricsLines || !lyricsLines.length) return out;
  for (var i = 0; i < lyricsLines.length; i++) {
    var raw = lyricsLines[i];
    if (!raw) continue;
    var startTime = Number(raw.t) || 0;
    var endTime = startTime;
    var words = [];
    if (raw.words && raw.words.length) {
      for (var w = 0; w < raw.words.length; w++) {
        var rw = raw.words[w];
        if (!rw) continue;
        var ws = Number(rw.t) || startTime;
        var we = ws + Math.max(Number(rw.d) || 0, 0);
        words.push({ text: String(rw.text || ''), startTime: ws, endTime: we });
        if (we > endTime) endTime = we;
      }
    }
    if (raw.duration > 0) {
      endTime = Math.max(startTime + raw.duration, endTime);
    } else {
      endTime = endTime > startTime ? endTime : startTime + 2.4;
    }
    var line = {
      startTime: startTime,
      endTime: endTime,
      fullText: String(raw.text || ''),
      words: words,
      isChorus: !!raw.isChorus,
      renderHints: null
    };
    line.renderHints = fumeBuildLineRenderHints(line);
    out.push(line);
  }
  /* 无时长行：用下一行开始时间收口（保持 cutoff 语义），保留最少可读窗口 */
  for (var k = 0; k < out.length; k++) {
    var prevRaw = lyricsLines[k];
    if (!(prevRaw && prevRaw.duration > 0) && k + 1 < out.length) {
      var nextStart = out[k + 1].startTime;
      if (nextStart > out[k].startTime) {
        out[k].endTime = Math.min(out[k].endTime, nextStart);
        out[k].renderHints = fumeBuildLineRenderHints(out[k]);
      }
    }
  }
  return out;
}

function fumeComputeLinesKey() {
  var len = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines.length : 0;
  var first = len ? Number(lyricsLines[0] && lyricsLines[0].t) || 0 : 0;
  var last = len ? Number(lyricsLines[len - 1] && lyricsLines[len - 1].t) || 0 : 0;
  /* lyricsMetaVersion：副歌打标等歌词元数据异步就位后递增，驱动纸面重排 */
  var meta = (typeof lyricsMetaVersion !== 'undefined') ? lyricsMetaVersion : 0;
  return len + '|' + first + '|' + last + '|' + meta;
}

function fumeResolveOverviewStartTime(lines) {
  var lastRenderableLine = null;
  for (var i = lines.length - 1; i >= 0; i--) {
    if (lines[i].fullText.trim().length) { lastRenderableLine = lines[i]; break; }
  }
  if (!lastRenderableLine) return Number.POSITIVE_INFINITY;
  var lineStartTime = lastRenderableLine.startTime;
  var lineRenderEndTime = fumeGetLineRenderEndTime(lastRenderableLine);
  return lineStartTime + Math.max(lineRenderEndTime - lineStartTime, 0) * 0.5;
}

function fumeUpdatePending() {
  var el = document.getElementById('fume-pending');
  if (el) el.classList.toggle('on', fumeLayoutPending);
}

function fumeRebuildLayout() {
  var vp = { width: window.innerWidth || 0, height: window.innerHeight || 0 };
  fumeState.viewport = vp;
  var lines = fumeState.lines;
  if (vp.width <= 0 || vp.height <= 0 || !lines.length) {
    fumeState.article = null;
    fumeHasResolvedArticle = false;
    fumeLayoutPending = false;
    fumeUpdatePending();
    return;
  }
  fumeLayoutPending = true;
  fumeUpdatePending();
  /* 同步构建（低频路径：切歌/resize/字体变化才走到这里；Folia 亦在防抖回调内同步构建） */
  var cacheKey = fumeBuildLayoutCacheKey(lines, vp, fumeTheme, 1, fumeTuning);
  var article = (fumeLastLayoutCache && fumeLastLayoutCache.key === cacheKey)
    ? fumeLastLayoutCache.article
    : fumeBuildArticleLayout(lines, vp, fumeTheme, 1, fumeTuning);
  fumeLastLayoutCache = { key: cacheKey, article: article };
  fumeHasResolvedArticle = article !== null;
  fumeState.article = article;
  fumeState.backgroundScene = fumeTuning.disableGeometricBackground ? null : fumeBuildBackgroundScene(
    vp,
    {
      width: article ? article.width : Math.max(vp.width * 1.8, vp.width),
      height: article ? article.height : Math.max(vp.height * 1.8, vp.height)
    },
    article ? article.paperBounds : null,
    'fume:' + fumeTheme.name);
  fumeState.overviewCamera = article ? fumeResolveArticleOverviewCamera(article, vp) : null;
  fumeState.overviewStartTime = fumeResolveOverviewStartTime(lines);
  fumeState.passedFadeDuration = fumeResolvePassedFadeDuration(lines, fumeTuning.textHoldRatio);
  fumeReleaseAllSnapshots();
  fumeBgGradientCache.clear();
  fumeLayoutPending = false;
  fumeUpdatePending();
}

function fumeRequestLayout() {
  if (!fumeMode) return;
  fumeLayoutVersion++;
  var ver = fumeLayoutVersion;
  if (fumeLayoutRaf) cancelAnimationFrame(fumeLayoutRaf);
  if (fumeLayoutTimer) clearTimeout(fumeLayoutTimer);
  fumeLayoutRaf = requestAnimationFrame(function () {
    fumeLayoutRaf = 0;
    var delay = fumeHasResolvedArticle ? 96 : 0;
    fumeLayoutTimer = setTimeout(function () {
      fumeLayoutTimer = 0;
      if (ver !== fumeLayoutVersion || !fumeMode) return;
      fumeSyncLines();
      fumeRebuildLayout();
    }, delay);
  });
}

/* 歌词数据轮询（lyricsLines 是普通数组无事件，胶片/涂鸦/流光同款范式） */
function fumeWatchLyricsChange() {
  var token = ++fumeLyricsPollToken;
  function check() {
    if (token !== fumeLyricsPollToken || !fumeMode) return;
    var key = fumeComputeLinesKey();
    if (key !== fumeLinesKey) {
      fumeLinesKey = key;
      fumeRequestLayout();
    }
    setTimeout(check, 600);
  }
  check();
}

function fumeSyncLines() {
  fumeState.lines = fumeBuildAdapterLines();
}

function fumeNowTime() {
  try {
    return getAdjustedLyricPlaybackTime(typeof audio !== 'undefined' && audio ? (audio.currentTime || 0) : 0);
  } catch (e) { return 0; }
}

function fumeEnsureCanvas() {
  var canvas = document.getElementById('fume-canvas');
  if (!canvas) { fumeState.ctx = null; return null; }
  if (!fumeState.ctx) fumeState.ctx = canvas.getContext('2d');
  return canvas;
}

function fumeDrawNoLyricsPlaceholder(context, viewport, theme, now) {
  var cx = viewport.width * 0.5;
  var cy = viewport.height * 0.46;
  var title = fumeTrackTitle || '烟纸';
  var sub = fumeTrackArtist
    ? (fumeState.lines.length ? fumeTrackArtist : fumeTrackArtist + ' · 暂无歌词')
    : '暂无歌词';
  var pulse = 0.55 + 0.45 * Math.sin(now * 0.0012);
  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  /* 主行：歌名大字（过长按 64px 上限截断显示宽度） */
  var fontSize = Math.min(56, Math.max(30, viewport.width / 18));
  context.font = '600 ' + fontSize + 'px ' + fumeFontStack();
  var maxW = viewport.width * 0.72;
  while (context.measureText(title).width > maxW && fontSize > 20) {
    fontSize -= 2;
    context.font = '600 ' + fontSize + 'px ' + fumeFontStack();
  }
  if (context.measureText(title).width > maxW) {
    while (title.length > 4 && context.measureText(title + '…').width > maxW) title = title.slice(0, -1);
    title += '…';
  }
  context.shadowColor = fumeColorWithAlpha(theme.accentColor, 0.32 * pulse);
  context.shadowBlur = 24;
  context.fillStyle = fumeColorWithAlpha(theme.primaryColor, 0.92);
  context.fillText(title, cx, cy);
  /* 副行：歌手 · 暂无歌词 */
  context.shadowBlur = 0;
  context.font = '400 ' + Math.round(fontSize * 0.42) + 'px ' + fumeFontStack();
  context.fillStyle = fumeColorWithAlpha(theme.secondaryColor, 0.62);
  context.fillText(sub, cx, cy + fontSize * 0.92);
  /* 底部提示（呼吸） */
  context.font = '400 ' + Math.round(fontSize * 0.3) + 'px ' + fumeFontStack();
  context.fillStyle = fumeColorWithAlpha(theme.secondaryColor, 0.3 + 0.18 * pulse);
  context.fillText('等待歌词抵达 · 纸面会自动排版', cx, viewport.height * 0.82);
  context.restore();
}

function fumeTick(now) {
  var canvas = fumeEnsureCanvas();
  var context = fumeState.ctx;
  if (!canvas || !context) return;
  var viewport = fumeState.viewport;
  if (viewport.width <= 0) {
    viewport.width = window.innerWidth || 0;
    viewport.height = window.innerHeight || 0;
  }
  var dt = fumeLastFrameAt === null
    ? 1 / 60
    : fumeClamp((now - fumeLastFrameAt) / 1000, 1 / 240, 0.05);
  fumeLastFrameAt = now;

  var width = Math.max(Math.floor(viewport.width), 1);
  var height = Math.max(Math.floor(viewport.height), 1);
  var dpr = fumeClamp(window.devicePixelRatio || 1, 1, 2);
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  var time = fumeNowTime();
  var viewportCenterX = viewport.width * 0.5;
  var viewportCenterY = viewport.height * 0.5;
  var audioLevels = fumeReadAudioLevels();
  var article = fumeState.article;
  var theme = fumeTheme;
  var backgroundScene = fumeState.backgroundScene;

  if (!article) {
    if (backgroundScene) {
      context.save();
      context.translate(viewportCenterX, viewportCenterY);
      context.translate(-backgroundScene.width * 0.5, -backgroundScene.height * 0.5);
      fumeDrawBackground(context, backgroundScene, theme, time + now * 0.00018, audioLevels,
        null, fumeTuning.backgroundObjectOpacity * 2);
      context.restore();
    }
    /* 无歌词占位：纯音乐/取词失败时纸面中央画歌名，不留给用户一块黑屏 */
    fumeDrawNoLyricsPlaceholder(context, viewport, theme, now);
    return;
  }

  try {
    fumeState.lineIndex = (typeof findStageLyricIndexAtTime === 'function')
      ? findStageLyricIndexAtTime(time) : -1;
  } catch (e) { fumeState.lineIndex = -1; }
  if (fumeState.lineIndex < 0) fumeState.lineIndex = -1;
  fumeUpdateAriaLine();

  fumeSyncCameraToArticle(fumeCameraState, article);
  fumeCameraInput.article = article;
  fumeCameraInput.time = time;
  fumeCameraInput.now = now;
  fumeCameraInput.dt = dt;
  fumeCameraInput.lineIndex = fumeState.lineIndex;
  fumeCameraInput.viewport = viewport;
  fumeCameraInput.overviewCamera = fumeState.overviewCamera;
  fumeCameraInput.overviewStartTime = fumeState.overviewStartTime;
  fumeCameraInput.cameraSpeed = fumeTuning.cameraSpeed;
  fumeCameraInput.cameraTrackingMode = fumeTuning.cameraTrackingMode;
  fumeCameraInput.staticMode = false;
  fumeCameraInput.animationIntensity = theme.animationIntensity;
  var stepResult = fumeStepCamera(fumeCameraState, fumeCameraInput);
  var camera = fumeCameraState.camera;
  var screenScale = camera.scale;

  if (backgroundScene) {
    var bgView = fumeResolveBackgroundView(backgroundScene, camera, viewport);
    context.save();
    context.translate(viewportCenterX, viewportCenterY);
    context.scale(bgView.backgroundScale, bgView.backgroundScale);
    context.translate(-bgView.backgroundCameraX, -bgView.backgroundCameraY);
    fumeBgParallax.cameraX = bgView.backgroundCameraX;
    fumeBgParallax.cameraY = bgView.backgroundCameraY;
    fumeBgParallax.originX = bgView.backgroundCenterX;
    fumeBgParallax.originY = bgView.backgroundCenterY;
    fumeDrawBackground(context, backgroundScene, theme, time, audioLevels,
      fumeBgParallax, fumeTuning.backgroundObjectOpacity * 2);
    context.restore();
  }

  context.save();
  context.translate(viewportCenterX, viewportCenterY);
  context.scale(screenScale, screenScale);
  context.translate(-camera.x, -camera.y);

  var glowBases = fumeResolveGlowBases(theme.animationIntensity, fumeTuning.glowIntensity);
  fumeLiveParams.time = time;
  fumeLiveParams.theme = theme;
  fumeLiveParams.glowIntensity = fumeTuning.glowIntensity;
  fumeLiveParams.activeGlowBoost = glowBases.activeGlowBoost;
  fumeLiveParams.passedGlowBase = glowBases.passedGlowBase;
  fumeLiveParams.showPrintStamp = !fumeTuning.hidePrintSymbols;

  fumeStaticLayerInput.time = time;
  fumeStaticLayerInput.theme = theme;
  fumeStaticLayerInput.passedGlowBase = glowBases.passedGlowBase;
  fumeStaticLayerInput.passedFadeDuration = fumeState.passedFadeDuration;
  fumeStaticLayerInput.overviewTextRestoreProgress = stepResult.overviewTextRestoreProgress;
  fumeStaticLayerInput.snapshotScale = fumeClamp(window.devicePixelRatio || 1, 1, 2);

  var margin = 32 / screenScale;
  fumeLiveFrame.deviceScale = screenScale * dpr;
  fumeLiveFrame.visible.left = camera.x - viewportCenterX / screenScale - margin;
  fumeLiveFrame.visible.top = camera.y - viewportCenterY / screenScale - margin;
  fumeLiveFrame.visible.right = camera.x + viewportCenterX / screenScale + margin;
  fumeLiveFrame.visible.bottom = camera.y + viewportCenterY / screenScale + margin;

  var blocks = article.blocks;
  var lines = fumeState.lines;
  for (var bi = 0; bi < blocks.length; bi++) {
    var block = blocks[bi];
    if (!fumeIsBlockOnScreen(block, camera, viewport)) continue;

    var nextLine = lines[block.sourceLineIndex + 1];
    var timing = fumeResolveBlockTiming(
      block, time, nextLine ? nextLine.startTime : null, fumeTuning.textHoldRatio);

    var hasLayers = fumeResolveStaticLayers(block, timing, fumeStaticLayerInput, function (spec) {
      var entry = fumeSnapshotCache.get(spec.key);
      if (!entry) {
        var snapshot = fumeCreateStaticBlockSnapshot(block, spec.fill, spec.shadowBlur, spec.shadowColor);
        if (!snapshot) return null;
        entry = { snapshot: snapshot, lastUsed: now };
        fumeSnapshotCache.set(spec.key, entry);
      }
      entry.lastUsed = now;
      return entry.snapshot;
    }, fumeStaticLayersOut);

    if (hasLayers) {
      for (var ly = 0; ly < fumeStaticLayersOut.length; ly++) {
        var layer = fumeStaticLayersOut[ly];
        context.globalAlpha = layer.alpha;
        context.drawImage(
          layer.snapshot.canvas,
          block.x - layer.snapshot.padding,
          block.y - layer.snapshot.padding,
          block.width + layer.snapshot.padding * 2,
          block.height + layer.snapshot.padding * 2);
      }
      context.globalAlpha = 1;
      continue;
    }

    /* 打印中/颜色余迹：走限尺度活动光栅 */
    var image = fumeLiveRasterDraw(block, timing, fumeLiveParams,
      fumeLiveFrame.deviceScale, fumeLiveFrame.visible, now);
    if (image) {
      context.drawImage(image.canvas, 0, 0, image.width, image.height,
        image.x, image.y, image.worldWidth, image.worldHeight);
    }
  }
  context.restore();
  fumeLiveRasterSweep(now);
  fumeReleaseSnapshots(now);
}

/* 无障碍：当前行文本进 aria-live（fume 的歌词本体画在 canvas 上） */
function fumeUpdateAriaLine() {
  var idx = fumeState.lineIndex;
  if (idx === fumeLastLineIdx) return;
  fumeLastLineIdx = idx;
  var el = document.getElementById('fume-aria-line');
  if (!el) return;
  var line = (idx >= 0 && typeof lyricsLines !== 'undefined' && lyricsLines)
    ? lyricsLines[idx] : null;
  var text = (line && line.text && line.text.trim()) ? line.text.trim() : '♪';
  if (el.textContent !== text) el.textContent = text;
}

/* 满帧主循环（Folia 原版即全速 rAF；相机弹簧的飞行手感依赖 60fps，30fps 门控会顿一半） */
function startFumeLoop() {
  stopFumeLoop();
  fumeLastFrameAt = null;
  function frame(now) {
    if (!fumeMode) return;
    try {
      fumeCheckFontChange();
      fumeTick(now);
    } catch (e) {
      /* 单帧异常只丢帧不丢循环：首帧抛错会让模式永久黑屏 */
      console.warn('[Fume] tick error:', e && e.message);
    }
    fumeRafId = requestAnimationFrame(frame);
  }
  fumeRafId = requestAnimationFrame(frame);
  fumeWatchLyricsChange();
}

function stopFumeLoop() {
  if (fumeRafId) {
    cancelAnimationFrame(fumeRafId);
    fumeRafId = 0;
  }
  fumeLyricsPollToken++;
  if (fumeLayoutRaf) { cancelAnimationFrame(fumeLayoutRaf); fumeLayoutRaf = 0; }
  if (fumeLayoutTimer) { clearTimeout(fumeLayoutTimer); fumeLayoutTimer = 0; }
}

/* ============================ §17 壳层（VisualizerFume.tsx → applyFumeMode） ============================ */

function applyFumeMode(on, opts) {
  opts = opts || {};
  fumeMode = !!on;
  /* 互斥：经视觉模式注册表退出其它覆盖层 */
  if (fumeMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('fume', { save: true });
  }
  document.body.classList.toggle('fume', fumeMode);
  var overlay = document.getElementById('fume-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', fumeMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(FUME_STORE_KEY, fumeMode);
  if (fumeMode) {
    startFume();
    /* 3D 场景已被覆盖层盖住：临时切 eco 质量档让出帧预算（退出时恢复） */
    if (typeof fx !== 'undefined' && fx && fumePrevQuality === null) {
      fumePrevQuality = fx.performanceQuality || 'balanced';
      fx.performanceQuality = 'eco';
    }
  } else {
    stopFume();
    if (fumePrevQuality !== null && typeof fx !== 'undefined' && fx) {
      fx.performanceQuality = fumePrevQuality;
      fumePrevQuality = null;
    }
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(fumeMode ? '烟纸已开启' : '已切回标准模式');
}

function toggleFumeMode() {
  applyFumeMode(!fumeMode, { save: true, toast: true });
}

function startFume() {
  fumeEnsureCanvas();
  fumeFontStack();
  fumeSyncTheme();
  fumeLastFontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  syncFumeBadge();
  syncFumeCover();
  startFumeObserver();
  fumeLinesKey = fumeComputeLinesKey();
  fumeSyncLines();
  fumeCameraState = fumeCreateCameraState();   /* 新会话重置相机 */
  fumeLastLayoutCache = null;
  fumeHasResolvedArticle = false;
  fumeLastLineIdx = -99;
  fumeRebuildLayout();
  startFumeLoop();
}

function stopFume() {
  stopFumeLoop();
  stopFumeObserver();
  fumeLiveRasterClear();
  fumeReleaseAllSnapshots();
  fumeState.article = null;
  fumeState.lines = [];
  fumeHasResolvedArticle = false;
  fumeLayoutPending = false;
  fumeUpdatePending();
  fumeLastLineIdx = -99;
  var canvas = document.getElementById('fume-canvas');
  if (canvas && fumeState.ctx) fumeState.ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/* ---------- 状态同步（MutationObserver 零侵入，流光同款） ---------- */
function startFumeObserver() {
  stopFumeObserver();
  fumeObserver = new MutationObserver(function () {
    syncFumeBadge();
    syncFumeCover();
  });
  var cover = document.getElementById('control-cover');
  if (cover) fumeObserver.observe(cover, { attributes: true, attributeFilter: ['style'] });
  ['control-title-text', 'control-artist'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) fumeObserver.observe(el, { characterData: true, childList: true, subtree: true });
  });
}

function stopFumeObserver() {
  if (fumeObserver) {
    fumeObserver.disconnect();
    fumeObserver = null;
  }
}

function syncFumeBadge() {
  var src = document.getElementById('control-cover');
  var cover = document.getElementById('fume-badge-cover');
  if (cover && src) {
    var bg = src.style.backgroundImage || '';
    if (!bg || bg === 'none') bg = getComputedStyle(src).backgroundImage || '';
    if (bg && bg !== 'none') {
      if (cover.style.backgroundImage !== bg) cover.style.backgroundImage = bg;
      cover.classList.remove('cover-empty');
    } else {
      cover.classList.add('cover-empty');
    }
  }
  var titleEl = document.getElementById('control-title-text');
  var artistEl = document.getElementById('control-artist');
  var bTitle = document.getElementById('fume-badge-title');
  var bArtist = document.getElementById('fume-badge-artist');
  fumeTrackTitle = (titleEl && titleEl.textContent) ? titleEl.textContent : '';
  fumeTrackArtist = (artistEl && artistEl.textContent) ? artistEl.textContent : '';
  if (bTitle && titleEl) bTitle.textContent = titleEl.textContent || '未在播放';
  if (bArtist && artistEl) bArtist.textContent = artistEl.textContent || '';
}

function syncFumeCover() { syncFumeBadge(); }

/* ---------- resize ---------- */
function onFumeResize() {
  if (!fumeMode) return;
  fumeRequestLayout();
}

function initFume() {
  applyFumeMode(fumeMode, { save: false });
  window.addEventListener('resize', function () {
    clearTimeout(fumeResizeTimer);
    fumeResizeTimer = setTimeout(onFumeResize, 180);
  });
}

/* 延迟到 DOM 就绪后初始化（本模块在 index-loader 末段加载，DOM 已就绪） */
scheduleUiWarmTask ? scheduleUiWarmTask(initFume, 300) : setTimeout(initFume, 300);
