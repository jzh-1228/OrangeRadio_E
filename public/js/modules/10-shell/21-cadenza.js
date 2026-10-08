/* =========================================================================
   OrangeSea · 心象（Cadenza · Mindscape）— 词云散布歌词模式
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0):
     src/components/visualizer/cadenza/VisualizerCadenza.tsx（排版/状态机/渲染核心）
     src/components/visualizer/cadenza/entry.tsx、tuning.ts（注册与调参）
     src/utils/lyrics/renderHints.ts、graphemeTiming.ts
     src/components/visualizer/colorMix.ts、runtime.ts、wordColoring.ts
   并含 @chenglou/pretext 0.0.9（MIT）prepareWithSegments/layoutWithLines
   的歌词场景语义子集复刻（CJK 逐字 / 拉丁词聚段 / 空格悬挂断行 /
   超宽词 grapheme 拆断；soft-hyphen / tab / hard-break / 连字符首选断点
   / keep-all / bidi 不在歌词场景，未复刻）。

   概念（照 Folia 注释）：重排版模式——活动/upcoming 行先经测量分段、
   换行、碎片化，再镜像成 DOM 词层（直写 transform/textShadow 的节点池）
   + Canvas2D 副歌涟漪。单行状态流：
     waiting（暗、未入场）→ active（辉光/emphasis/主色）→
     passed（漂移余晖淡出，绝不瞬移消失）。

   宿主替换：
     · React 生命周期 → IIFE 全局 + applyCadenzaMode(on,{save}) 显式进出
       （09-aurora-flow.js 同形态；互斥经 90-visualizer-registry.js）；
     · framer-motion MotionValue → 自算音频特征（覆盖层期间主循环早退，
       currentTime/audioPower 信号不写，与流光同理）；
     · useEffect rAF → 自有 30fps rAF 循环；
     · AnimatePresence → CSS 过渡（空态文字淡入淡出）。
   每帧零分配纪律：颜色/阴影/涟漪样式按档位惰性缓存、ascent 与字形宽度
   prepare 时一次测好、行适配与「有真实歌词」标记缓存、清扫用帧号标记
   而非临时 Set（transform 等数值字符串为 DOM 模式固有直写，同流光）。
   ========================================================================= */

/* ---------- 0. 模式状态 ---------- */
var CADENZA_STORE_KEY = 'orangesea-cadenza-v1';
var cadenzaMode = (typeof readBooleanPreference === 'function')
  ? readBooleanPreference(CADENZA_STORE_KEY, false) : false;
var cadenzaRafId = 0;
var cadenzaPrevQuality = null;
var cadenzaResizeTimer = 0;
var cadenzaLyricsWatchToken = 0;
var cadenzaFrameNo = 0;

/* Folia DEFAULT_CADENZA_TUNING 原值（folia src/types.ts:413） */
var CADENZA_TUNING = { fontScale: 1.12, widthRatio: 0.72, motionAmount: 1, glowIntensity: 1, beamIntensity: 0 };

/* Folia theme 对应配色 → MineRadio 日落暖色（--visual-tint/--champagne 协调） */
var CADENZA_PRIMARY = '#f3e7d6';   /* theme.primaryColor：未唱基底（暖沙白） */
var CADENZA_ACCENT = '#ff9c6e';    /* theme.accentColor：词色（日落橙） */
var CADENZA_ACTIVE_PULSE_FREQUENCY = 10;
var CADENZA_MAX_PREPARED_CACHE = 24;

/* 运行时缓存与宿主元素 */
var cadenzaPreparedCache = null;        /* Map<lineKey, preparedState> */
var cadenzaPreparedContextKey = '';
var cadenzaActiveIdx = -99;             /* 当前行下标（-99 强制首帧接管） */
var cadenzaActiveLine = null;           /* 适配后的 Folia Line 形状 */
var cadenzaUpcomingCacheIdx = -1;       /* upcoming 预热的行适配缓存（免每帧分配） */
var cadenzaUpcomingCacheLine = null;
var cadenzaOverlayNodes = null;         /* Map<id, wordNodes> */
var cadenzaAnimatedStates = null;       /* Map<id, animatedState> */
var cadenzaCanvasCtx = null;
var cadenzaLayerEl = null;
var cadenzaWordsEl = null;
var cadenzaCanvasEl = null;
var cadenzaEmptyEl = null;
var cadenzaEmptyShown = false;
var cadenzaEmptyText = '';
var cadenzaLastFontKey = null;
var cadenzaOverlayCleared = false;
var cadenzaViewportW = 0;
var cadenzaViewportH = 0;
var cadenzaHasRealLyrics = false;
var cadenzaFontTemplate = '';
var cadenzaFontTemplateKey = '\u0000';

/* 音频特征（自算；energy ≡ Folia clamp(audioPower.get()/255)） */
var cadenzaEnergy = 0;
var cadenzaChorusGate = 0;              /* 副歌闸门：energy 慢积分（isChorus 近似） */

/* ---------- 1. 数值工具（VisualizerCadenza.tsx:215-226 原样） ---------- */
function cadenzaClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function cadenzaMix(from, to, amount) { return from + (to - from) * amount; }
function cadenzaEaseOutCubic(value) { return 1 - Math.pow(1 - cadenzaClamp(value, 0, 1), 3); }
function cadenzaEaseInOutQuad(value) {
  var n = cadenzaClamp(value, 0, 1);
  return n < 0.5 ? 2 * n * n : 1 - Math.pow(-2 * n + 2, 2) / 2;
}
function cadenzaIsCJK(text) { return /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(text); }
function cadenzaSeededRandom(seed, offset) {
  var x = Math.sin(seed + offset) * 10000;
  return x - Math.floor(x);
}

/* ---------- 2. grapheme 拆分（Intl.Segmenter，退化 Array.from） ---------- */
var cadenzaGraphemeSegmenter = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
function cadenzaSplitGraphemes(text) {
  if (!text) return [];
  if (cadenzaGraphemeSegmenter) {
    /* segment() 返回可迭代 Segments 对象（非迭代器），须走 Array.from 映射（与 Folia 一致） */
    return Array.from(cadenzaGraphemeSegmenter.segment(text), function (s) { return s.segment; });
  }
  return Array.from(text);
}

/* ---------- 3. pretext 子集：prepareWithSegments ----------
   分段规则（对齐 pretext 歌词场景行为，layout.js/analysis.js）：
   · 空白折叠为单个 space 段（CSS white-space: normal，fit 宽 0 可悬挂）；
   · CJK 每字一段（pretext getCjkTextUnits 逐字断）；
   · 其余（拉丁字母/数字/标点/符号/emoji）聚为词段，尾随标点随词
     （pretext "Merge punctuation into preceding word"）；
   · 词段(>1 grapheme)另测每 grapheme advance（breakableFitAdvances，
     Chromium 引擎的 'sum-graphemes' 模式）供部分宽度与超宽拆断。 */
var CADENZA_CJK_SEG_RE = /[\u4e00-\u9fa5\u3400-\u4dbf\u3040-\u30ff\u31f0-\u31ff\uf900-\ufaff\uac00-\ud7af]/;
var cadenzaMeasureCanvas = null;
var cadenzaMeasureCtx = null;
var cadenzaWidthCache = new Map();   /* Map<font, Map<seg, width>> */
var cadenzaMetricsCache = new Map(); /* Map<font, Map<text, {ascent}>> */

function cadenzaEnsureMeasureCtx() {
  if (!cadenzaMeasureCtx) {
    cadenzaMeasureCanvas = document.createElement('canvas');
    cadenzaMeasureCanvas.width = 8;
    cadenzaMeasureCanvas.height = 8;
    cadenzaMeasureCtx = cadenzaMeasureCanvas.getContext('2d');
  }
  return cadenzaMeasureCtx;
}

function cadenzaMeasureWidth(text, font) {
  var byFont = cadenzaWidthCache.get(font);
  if (!byFont) { byFont = new Map(); cadenzaWidthCache.set(font, byFont); }
  var cached = byFont.get(text);
  if (cached !== undefined) return cached;
  var ctx = cadenzaEnsureMeasureCtx();
  ctx.font = font;
  var w = ctx.measureText(text).width;
  byFont.set(text, w);
  return w;
}

/* measureText metrics 缓存（ascent 用于 DOM overlay 基线对齐；Folia 每帧
   measureText，此处提前到 prepare，零每帧测量） */
function cadenzaMeasureText(text, font) {
  var byFont = cadenzaMetricsCache.get(font);
  if (!byFont) { byFont = new Map(); cadenzaMetricsCache.set(font, byFont); }
  var hit = byFont.get(text);
  if (hit) return hit;
  var ctx = cadenzaEnsureMeasureCtx();
  ctx.font = font;
  var m = ctx.measureText(text);
  var metrics = { ascent: m.actualBoundingBoxAscent || 0 };
  byFont.set(text, metrics);
  return metrics;
}

function cadenzaPrepareWithSegments(text, font) {
  var normalized = String(text || '').replace(/\s+/g, ' ').trim();
  var prepared = { segments: [], widths: [], breakableFitAdvances: [], kinds: [] };
  if (!normalized) return prepared;
  var graphemes = cadenzaSplitGraphemes(normalized);
  var run = '';
  var runGraphemes = [];
  function flushRun() {
    if (!run) return;
    var width = cadenzaMeasureWidth(run, font);
    var advances = null;
    if (runGraphemes.length > 1) {
      advances = [];
      for (var i = 0; i < runGraphemes.length; i++) {
        advances.push(cadenzaMeasureWidth(runGraphemes[i], font));
      }
    }
    prepared.segments.push(run);
    prepared.widths.push(width);
    prepared.breakableFitAdvances.push(advances);
    prepared.kinds.push('text');
    run = '';
    runGraphemes = [];
  }
  for (var g = 0; g < graphemes.length; g++) {
    var grapheme = graphemes[g];
    if (grapheme === ' ') {
      flushRun();
      prepared.segments.push(' ');
      prepared.widths.push(cadenzaMeasureWidth(' ', font));
      prepared.breakableFitAdvances.push(null);
      prepared.kinds.push('space');
      continue;
    }
    if (CADENZA_CJK_SEG_RE.test(grapheme)) {
      flushRun();
      prepared.segments.push(grapheme);
      prepared.widths.push(cadenzaMeasureWidth(grapheme, font));
      prepared.breakableFitAdvances.push(null);
      prepared.kinds.push('text');
      continue;
    }
    run += grapheme;
    runGraphemes.push(grapheme);
  }
  flushRun();
  return prepared;
}

/* ---------- 4. pretext 子集：layoutWithLines ----------
   复刻 pretext walkPreparedLinesSimple 断行语义（line-break.js:186-341）：
   · 行首消耗 space 段；行尾空格悬挂（计入 cursor 消耗、不计入行宽）；
   · 溢出优先回退到最近一次空格后的断点（pendingBreak）；
   · 单段宽于 maxWidth 且有 fitAdvances 时按 grapheme 边界拆。
   lines[].{width,start,end} 与 pretext LayoutLine 同义
   （text 字段本模式不消费，省略）。 */
function cadenzaLayoutWithLines(prepared, maxWidth) {
  var lines = [];
  var segments = prepared.segments;
  var n = segments.length;
  if (!n) return { lines: lines, lineCount: 0 };
  var widths = prepared.widths;
  var kinds = prepared.kinds;
  var fitAdvances = prepared.breakableFitAdvances;
  var fitLimit = maxWidth + 0.005;   /* pretext 非 Safari lineFitEpsilon */
  var i = 0;
  var hasContent = false;
  var lineW = 0;
  var lineStartSeg = 0, lineStartG = 0, lineEndSeg = 0, lineEndG = 0;
  var pendingIdx = -1, pendingW = 0;

  function emitLine(endSeg, endG, width) {
    lines.push({
      width: width,
      start: { segmentIndex: lineStartSeg, graphemeIndex: lineStartG },
      end: { segmentIndex: endSeg, graphemeIndex: endG }
    });
    lineW = 0; hasContent = false; pendingIdx = -1; pendingW = 0;
  }
  function startLineAt(seg, g, width) {
    hasContent = true;
    lineStartSeg = seg; lineStartG = g;
    lineEndSeg = (g === 0) ? seg + 1 : seg;
    lineEndG = (g === 0) ? 0 : g + 1;
    lineW = width;
  }
  function appendBreakableFrom(seg, startG) {
    var advances = fitAdvances[seg];
    var g = startG;
    while (g < advances.length) {
      var gw = advances[g];
      if (!hasContent) {
        startLineAt(seg, g, gw);
      } else if (lineW + gw > fitLimit) {
        emitLine(lineEndSeg, lineEndG, lineW);
        startLineAt(seg, g, gw);
      } else {
        lineW += gw;
        lineEndSeg = seg; lineEndG = g + 1;
      }
      g++;
    }
    if (hasContent && lineEndSeg === seg && lineEndG === advances.length) {
      lineEndSeg = seg + 1; lineEndG = 0;
    }
  }
  while (i < n) {
    if (!hasContent) {
      /* 行首消耗 space（pretext consumesAtLineStart） */
      while (i < n && kinds[i] === 'space') i++;
      if (i >= n) break;
    }
    var w = widths[i];
    var isSpace = kinds[i] === 'space';
    if (!hasContent) {
      if (w > fitLimit && fitAdvances[i]) {
        appendBreakableFrom(i, 0);
      } else {
        startLineAt(i, 0, w);
        if (isSpace) { pendingIdx = i + 1; pendingW = lineW - w; }
      }
      i++;
      continue;
    }
    var newW = lineW + w;
    if (newW > fitLimit) {
      if (isSpace) {
        /* 悬挂：空格消耗掉但行宽回退（pretext line-break.js:296-300） */
        lineW = newW;
        emitLine(i + 1, 0, lineW - w);
        i++;
        continue;
      }
      if (pendingIdx >= 0) {
        if (lineEndSeg > pendingIdx || (lineEndSeg === pendingIdx && lineEndG > 0)) {
          emitLine(lineEndSeg, lineEndG, lineW);
        } else {
          emitLine(pendingIdx, 0, pendingW);
        }
        continue;   /* 当前段留给下一行重新装 */
      }
      if (w > fitLimit && fitAdvances[i]) {
        emitLine(lineEndSeg, lineEndG, lineW);
        appendBreakableFrom(i, 0);
        i++;
        continue;
      }
      emitLine(lineEndSeg, lineEndG, lineW);
      continue;
    }
    lineW = newW;
    lineEndSeg = i + 1; lineEndG = 0;
    if (isSpace) { pendingIdx = i + 1; pendingW = lineW - w; }
    i++;
  }
  if (hasContent) emitLine(lineEndSeg, lineEndG, lineW);
  return { lines: lines, lineCount: lines.length };
}

/* ---------- 5. 行渲染提示（renderHints.ts 全量复刻） ---------- */
function cadenzaGetLineTransitionTiming(rawDuration, lineTransitionMode, wordRevealMode) {
  if (lineTransitionMode === 'none') {
    return { enterDuration: 0, exitDuration: 0, linePassHold: 0 };
  }
  if (lineTransitionMode === 'fast') {
    return {
      enterDuration: cadenzaClamp(rawDuration * 0.45, 0.045, 0.06),
      exitDuration: cadenzaClamp(rawDuration * 0.22, 0.03, 0.04),
      linePassHold: wordRevealMode === 'instant' ? 0 : 0.03
    };
  }
  return {
    enterDuration: Math.min(0.42, Math.max(0.22, Math.max(rawDuration, 0.12) * 0.34)),
    exitDuration: Math.min(0.32, Math.max(0.18, Math.max(rawDuration, 0.12) * 0.18)),
    linePassHold: wordRevealMode === 'instant' ? 0 : 0.06
  };
}

function cadenzaResolveLineRenderTiming(line) {
  var rawDuration = Math.max(line.endTime - line.startTime, 0);
  var timingClass = rawDuration < 0.10 ? 'micro' : (rawDuration < 0.18 ? 'short' : 'normal');
  var lineTransitionMode = timingClass === 'micro' ? 'none' : (timingClass === 'short' ? 'fast' : 'normal');
  var wordRevealMode = timingClass === 'micro' ? 'instant' : (timingClass === 'short' ? 'fast' : 'normal');
  var lastWord = line.words[line.words.length - 1];
  var lastWordEndTime = lastWord ? lastWord.endTime : line.endTime;
  var tt = cadenzaGetLineTransitionTiming(rawDuration, lineTransitionMode, wordRevealMode);
  var renderEndTime;
  if (lineTransitionMode === 'none') {
    renderEndTime = Math.max(line.endTime, line.startTime + 0.067);
  } else {
    var linePassStart = Math.max(lastWordEndTime, line.startTime) + tt.linePassHold;
    var exitStart = lineTransitionMode === 'fast'
      ? Math.max(line.startTime + tt.enterDuration + 0.01, linePassStart, line.endTime - tt.exitDuration)
      : Math.max(linePassStart, line.endTime - tt.exitDuration);
    renderEndTime = Math.max(line.endTime, exitStart + tt.exitDuration);
  }
  return {
    lineTransitionMode: lineTransitionMode,
    wordRevealMode: wordRevealMode,
    renderEndTime: renderEndTime,
    lastWordEndTime: lastWordEndTime,
    enterDuration: tt.enterDuration,
    exitDuration: tt.exitDuration,
    linePassHold: tt.linePassHold
  };
}

/* ---------- 6. 词图元时序（graphemeTiming.ts buildEvenGraphemeTimings；无音节表 → 均分） ---------- */
function cadenzaBuildWordGraphemeTimings(word) {
  var graphemes = cadenzaSplitGraphemes(word.text);
  if (!graphemes.length) return [];
  var duration = Math.max(word.endTime - word.startTime, 0);
  var unit = duration / graphemes.length;
  var timings = [];
  for (var i = 0; i < graphemes.length; i++) {
    timings.push({
      startTime: word.startTime + unit * i,
      endTime: i === graphemes.length - 1 ? word.endTime : word.startTime + unit * (i + 1)
    });
  }
  return timings;
}

/* ---------- 7. 颜色工具（colorMix.ts 子集复刻 + 档位缓存） ---------- */
var CADENZA_FALLBACK_RGB = { r: 255, g: 255, b: 255 };
function cadenzaParseChannels(color) {
  var c = typeof color === 'string' ? color.trim() : '';
  if (!c) return null;
  if (c.charAt(0) === '#') {
    var hex = c.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16) };
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
    }
    return null;
  }
  var m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) {
    var parts = m[1].split(',');
    var r = parseFloat(parts[0]), g = parseFloat(parts[1]), b = parseFloat(parts[2]);
    if (isFinite(r) && isFinite(g) && isFinite(b)) return { r: r, g: g, b: b };
  }
  return null;
}
function cadenzaFormatRgba(ch, alpha) {
  return 'rgba(' + Math.round(cadenzaClamp(ch.r, 0, 255)) + ',' +
    Math.round(cadenzaClamp(ch.g, 0, 255)) + ',' +
    Math.round(cadenzaClamp(ch.b, 0, 255)) + ',' + alpha + ')';
}
function cadenzaColorWithAlpha(color, alpha) {
  var a = cadenzaClamp(alpha, 0, 1);
  var ch = cadenzaParseChannels(color);
  if (!ch) return a >= 1 ? color : cadenzaFormatRgba(CADENZA_FALLBACK_RGB, a);
  return cadenzaFormatRgba(ch, a);
}
var CADENZA_PRIMARY_CH = cadenzaParseChannels(CADENZA_PRIMARY);
var CADENZA_ACCENT_CH = cadenzaParseChannels(CADENZA_ACCENT);

/* 量化混色缓存（每词 32 档；避免每帧拼 rgba 字符串） */
var CADENZA_MIX_LEVELS = 32;
function cadenzaBodyColorAt(placement, level) {
  var cache = placement.bodyColors;
  if (!cache) { cache = new Array(CADENZA_MIX_LEVELS); placement.bodyColors = cache; }
  var hit = cache[level];
  if (hit !== undefined) return hit;
  var amount = level / (CADENZA_MIX_LEVELS - 1);
  var ch = {
    r: CADENZA_PRIMARY_CH.r + (CADENZA_ACCENT_CH.r - CADENZA_PRIMARY_CH.r) * amount,
    g: CADENZA_PRIMARY_CH.g + (CADENZA_ACCENT_CH.g - CADENZA_PRIMARY_CH.g) * amount,
    b: CADENZA_PRIMARY_CH.b + (CADENZA_ACCENT_CH.b - CADENZA_PRIMARY_CH.b) * amount
  };
  var str = cadenzaFormatRgba(ch, 1);
  cache[level] = str;
  return str;
}

/* DOM 文本辉光（VisualizerCadenza.tsx:473-484 原样；blurScale 参数保留签名） */
function cadenzaBuildDomTextShadowRaw(color, intensity, blurScale) {
  var glow = cadenzaClamp(intensity, 0, 1.6);
  if (glow <= 0.01) return 'none';
  return [
    '0 0 40px ' + cadenzaColorWithAlpha(color, Math.min(0.98, glow)),
    '0 0 40px ' + cadenzaColorWithAlpha(color, Math.min(0.92, glow * 0.92)),
    '0 0 40px ' + cadenzaColorWithAlpha(color, Math.min(0.35, glow * 0.26))
  ].join(', ');
}
var CADENZA_SHADOW_LEVELS = 26;
function cadenzaShadowAt(placement, intensity) {
  var cache = placement.shadowCache;
  if (!cache) { cache = new Array(CADENZA_SHADOW_LEVELS); placement.shadowCache = cache; }
  var level = Math.min(CADENZA_SHADOW_LEVELS - 1,
    Math.max(0, Math.round(intensity / 1.6 * (CADENZA_SHADOW_LEVELS - 1))));
  var hit = cache[level];
  if (hit !== undefined) return hit;
  var str = cadenzaBuildDomTextShadowRaw(placement.color, level / (CADENZA_SHADOW_LEVELS - 1) * 1.6, 1);
  cache[level] = str;
  return str;
}
/* 涟漪描边色缓存（16 alpha 档 × 基准 0.45） */
var CADENZA_RIPPLE_LEVELS = 16;
function cadenzaRippleStyleAt(placement, alpha01) {
  var cache = placement.rippleStyles;
  if (!cache) { cache = new Array(CADENZA_RIPPLE_LEVELS + 1); placement.rippleStyles = cache; }
  var level = Math.min(CADENZA_RIPPLE_LEVELS, Math.max(0, Math.round(alpha01 * CADENZA_RIPPLE_LEVELS)));
  var hit = cache[level];
  if (hit !== undefined) return hit;
  var str = cadenzaColorWithAlpha(placement.color, level / CADENZA_RIPPLE_LEVELS * 0.45);
  cache[level] = str;
  return str;
}

/* ---------- 8. 歌词行适配（lyricsLines → Folia Line 形状） ----------
   YRC：word.t/d 绝对秒 → startTime/endTime；
   LRC：tokenizeGraffitiText 合成词（word/char 各成词，punct 并入前词），
   行时长前 80% 按字数加权分配（对齐 08-graffiti 的 LRC 均分思路）。 */
function cadenzaAdaptLine(line) {
  if (!line) return null;
  var startTime = Number(line.t) || 0;
  var duration = Math.max(0.45, Number(line.duration) || 4.8);
  var endTime = startTime + duration;
  var fullText = String(line.text || '');
  var words = [];
  if (line.words && line.words.length) {
    for (var i = 0; i < line.words.length; i++) {
      var w = line.words[i];
      if (!w || !w.text) continue;
      words.push({
        text: w.text,
        startTime: Number(w.t) || startTime,
        endTime: (Number(w.t) || startTime) + Math.max(0.06, Number(w.d) || 0.2)
      });
    }
  }
  if (!words.length && fullText.trim() && typeof tokenizeGraffitiText === 'function') {
    var tokens = tokenizeGraffitiText(fullText);
    var units = [];
    for (var t = 0; t < tokens.length; t++) {
      var tk = tokens[t];
      if (tk.type === 'space' || !tk.chars || !tk.chars.length) continue;
      if (tk.type === 'punct' && units.length) {
        for (var p = 0; p < tk.chars.length; p++) units[units.length - 1].text += tk.chars[p].c;
      } else {
        var text = '';
        for (var c = 0; c < tk.chars.length; c++) text += tk.chars[c].c;
        units.push({ text: text });
      }
    }
    if (units.length) {
      var total = 0;
      for (var u = 0; u < units.length; u++) total += units[u].text.length;
      var span = duration * 0.8;
      var cum = 0;
      for (var v = 0; v < units.length; v++) {
        var share = span * (units[v].text.length / Math.max(1, total));
        words.push({ text: units[v].text, startTime: startTime + cum, endTime: startTime + cum + share });
        cum += share;
      }
    }
  }
  if (!words.length) {
    words = [{ text: fullText, startTime: startTime, endTime: endTime }];
  }
  return {
    startTime: startTime,
    endTime: endTime,
    fullText: fullText,
    words: words,
    isInterlude: fullText === '......'
  };
}

/* ---------- 9. prepare 管线（buildPreparedState 全链复刻） ---------- */
function cadenzaChooseFontPx(width, line) {
  var graphemeCount = cadenzaSplitGraphemes(line.fullText).length || 1;
  var wordCount = line.words.length || 1;
  var widthBase = cadenzaClamp(width * 0.086, 34, 94);
  var lengthPenalty = graphemeCount > 12 ? Math.min((graphemeCount - 12) * 1.8, 34) : 0;
  var densityPenalty = wordCount > 7 ? Math.min((wordCount - 7) * 1.5, 18) : 0;
  return cadenzaClamp(widthBase - lengthPenalty - densityPenalty, 28, 104);
}

function cadenzaBuildSegmentMetas(prepared) {
  var segmentMetas = [];
  var graphemes = [];
  var cursor = 0;
  for (var i = 0; i < prepared.segments.length; i++) {
    var segGraphemes = cadenzaSplitGraphemes(prepared.segments[i]);
    segmentMetas.push({
      graphemeStart: cursor,
      graphemeEnd: cursor + segGraphemes.length,
      graphemeCount: segGraphemes.length
    });
    for (var j = 0; j < segGraphemes.length; j++) graphemes.push(segGraphemes[j]);
    cursor += segGraphemes.length;
  }
  return { segmentMetas: segmentMetas, graphemes: graphemes };
}

function cadenzaFindWordRanges(line, graphemes) {
  var ranges = [];
  var cursor = 0;
  for (var wordIndex = 0; wordIndex < line.words.length; wordIndex++) {
    var word = line.words[wordIndex];
    var target = cadenzaSplitGraphemes(word.text);
    var start = -1;
    for (var i = cursor; i <= graphemes.length - target.length; i++) {
      var isMatch = true;
      for (var j = 0; j < target.length; j++) {
        if (graphemes[i + j] !== target[j]) { isMatch = false; break; }
      }
      if (isMatch) { start = i; break; }
    }
    if (start === -1) start = cadenzaClamp(cursor, 0, graphemes.length);
    var end = cadenzaClamp(start + target.length, start, graphemes.length);
    ranges.push({
      wordIndex: wordIndex,
      word: word,
      start: start,
      end: end,
      /* wordColoring.resolveWordColor：MineRadio 无关键词色表 → 全部 accent（空表路径） */
      color: CADENZA_ACCENT,
      graphemeTimings: cadenzaBuildWordGraphemeTimings(word)
    });
    cursor = end;
  }
  return ranges;
}

function cadenzaCursorToGlobalOffset(cursor, segmentMetas) {
  if (!segmentMetas.length) return 0;
  var segment = segmentMetas[cursor.segmentIndex];
  if (!segment) return segmentMetas[segmentMetas.length - 1].graphemeEnd;
  return cadenzaClamp(segment.graphemeStart + cursor.graphemeIndex, segment.graphemeStart, segment.graphemeEnd);
}

function cadenzaGetPartialSegmentWidth(prepared, segmentIndex, meta, startOffset, endOffset) {
  var localStart = cadenzaClamp(startOffset - meta.graphemeStart, 0, meta.graphemeCount);
  var localEnd = cadenzaClamp(endOffset - meta.graphemeStart, 0, meta.graphemeCount);
  if (localEnd <= localStart) return 0;
  if (localStart === 0 && localEnd === meta.graphemeCount) {
    return prepared.widths[segmentIndex] || 0;
  }
  var advances = prepared.breakableFitAdvances[segmentIndex];
  if (advances && advances.length > 0) {
    var width = 0;
    for (var i = localStart; i < localEnd; i++) width += advances[i] || 0;
    return width;
  }
  var fullWidth = prepared.widths[segmentIndex] || 0;
  if (meta.graphemeCount === 0) return fullWidth;
  return fullWidth * ((localEnd - localStart) / meta.graphemeCount);
}

function cadenzaWidthBetweenOffsets(prepared, segmentMetas, startOffset, endOffset) {
  if (endOffset <= startOffset) return 0;
  var width = 0;
  for (var i = 0; i < segmentMetas.length; i++) {
    var meta = segmentMetas[i];
    if (endOffset <= meta.graphemeStart) break;
    if (startOffset >= meta.graphemeEnd) continue;
    width += cadenzaGetPartialSegmentWidth(
      prepared, i, meta,
      Math.max(startOffset, meta.graphemeStart),
      Math.min(endOffset, meta.graphemeEnd)
    );
  }
  return width;
}

function cadenzaBuildLineFragments(prepared, segmentMetas, graphemes, layout, ranges) {
  var lineViews = [];
  for (var li = 0; li < layout.lines.length; li++) {
    var layoutLine = layout.lines[li];
    var lineStart = cadenzaCursorToGlobalOffset(layoutLine.start, segmentMetas);
    var lineEnd = cadenzaCursorToGlobalOffset(layoutLine.end, segmentMetas);
    var fragments = [];
    for (var r = 0; r < ranges.length; r++) {
      var range = ranges[r];
      if (range.end <= lineStart || range.start >= lineEnd) continue;
      var fragmentStart = Math.max(range.start, lineStart);
      var fragmentEnd = Math.min(range.end, lineEnd);
      fragments.push({
        wordIndex: range.wordIndex,
        word: range.word,
        text: graphemes.slice(fragmentStart, fragmentEnd).join(''),
        color: range.color,
        startX: cadenzaWidthBetweenOffsets(prepared, segmentMetas, lineStart, fragmentStart),
        endX: cadenzaWidthBetweenOffsets(prepared, segmentMetas, lineStart, fragmentEnd),
        fragmentStartInWord: fragmentStart - range.start,
        fragmentEndInWord: fragmentEnd - range.start,
        wordGraphemeCount: Math.max(range.end - range.start, 1),
        wordGraphemeTimings: range.graphemeTimings,
        fragmentIndexInWord: 0,
        fragmentCountInWord: 1,
        isPrimaryFragment: true,
        isSplitAcrossLines: false
      });
    }
    lineViews.push({ line: layoutLine, lineStart: lineStart, lineEnd: lineEnd, fragments: fragments });
  }
  var fragmentCountByWord = {};
  for (var v = 0; v < lineViews.length; v++) {
    var frags = lineViews[v].fragments;
    for (var f = 0; f < frags.length; f++) {
      var wi = frags[f].wordIndex;
      fragmentCountByWord[wi] = (fragmentCountByWord[wi] || 0) + 1;
    }
  }
  var seenFragmentsByWord = {};
  for (var v2 = 0; v2 < lineViews.length; v2++) {
    var frags2 = lineViews[v2].fragments;
    for (var f2 = 0; f2 < frags2.length; f2++) {
      var frag = frags2[f2];
      frag.lineIndex = v2;
      frag.fragmentCountInWord = fragmentCountByWord[frag.wordIndex] || 1;
      frag.fragmentIndexInWord = seenFragmentsByWord[frag.wordIndex] || 0;
      seenFragmentsByWord[frag.wordIndex] = frag.fragmentIndexInWord + 1;
      frag.isPrimaryFragment = frag.fragmentIndexInWord === 0;
      frag.isSplitAcrossLines = frag.fragmentCountInWord > 1;
    }
  }
  return lineViews;
}

function cadenzaBuildEmphasisMap(lineData, isInterlude) {
  var emphasisMap = {};
  if (isInterlude) return emphasisMap;
  var primaryFragments = [];
  for (var i = 0; i < lineData.length; i++) {
    var frags = lineData[i].fragments;
    for (var j = 0; j < frags.length; j++) {
      if (frags[j].isPrimaryFragment) primaryFragments.push(frags[j]);
    }
  }
  var candidates = [];
  for (var k = 0; k < primaryFragments.length; k++) {
    var fragment = primaryFragments[k];
    if (fragment.isSplitAcrossLines || !fragment.text.trim().length) continue;
    var graphemeCount = Math.max(fragment.wordGraphemeCount, cadenzaSplitGraphemes(fragment.word.text).length, 1);
    var semanticWeight = cadenzaIsCJK(fragment.word.text) ? 0.18 : Math.min(graphemeCount * 0.08, 0.36);
    var centerBias = 1 - Math.abs(fragment.wordIndex - (primaryFragments.length - 1) / 2) / Math.max(primaryFragments.length, 1);
    candidates.push({ fragment: fragment, score: semanticWeight + centerBias * 0.18 });
  }
  candidates.sort(function (a, b) { return b.score - a.score; });
  var hero = candidates[0];
  if (hero) {
    var scoreBoost = 1 + cadenzaClamp(hero.score - 0.48, 0, 0.52);
    emphasisMap['w' + hero.fragment.wordIndex] = 1.46 * scoreBoost;
  }
  return emphasisMap;
}

/* buildWordPlacements：碎片 → 动画视觉对象（含带状加速避碰/英雄分离/径向搜索） */
function cadenzaBuildWordPlacements(lineData, fontPx, lineHeight, maxWidth, seed, isInterlude, font) {
  var totalHeight = Math.max(lineData.length, 1) * lineHeight;
  var baseMargin = 6;        /* Folia animationIntensity 'normal' → margin 6 */
  var baseScale = 1.01;      /* 同上 → baseScale 1.01 */
  var emphasisMap = cadenzaBuildEmphasisMap(lineData, isInterlude);
  var heroWordIndex = null;
  var heroValue = -1;
  for (var hk in emphasisMap) {
    if (emphasisMap[hk] > heroValue) { heroValue = emphasisMap[hk]; heroWordIndex = parseInt(hk.slice(1), 10); }
  }

  var placements = [];
  var occupiedRects = [];
  var occupiedBands = {};
  var occupiedMarks = [];
  var occupiedQueryStamp = 0;
  var collisionBandSize = Math.max(24, Math.round(lineHeight * 0.9));
  function getBandIndex(value) { return Math.floor(value / collisionBandSize); }
  function registerOccupiedRect(rect) {
    var rectIndex = occupiedRects.length;
    occupiedRects.push(rect);
    var startBand = getBandIndex(rect.top);
    var endBand = getBandIndex(rect.bottom);
    for (var band = startBand; band <= endBand; band++) {
      if (!occupiedBands[band]) occupiedBands[band] = [];
      occupiedBands[band].push(rectIndex);
    }
  }
  var scratchCollision = { intersects: false, overlapArea: 0 };
  function evaluateCollisionRect(left, top, right, bottom) {
    scratchCollision.intersects = false;
    scratchCollision.overlapArea = 0;
    if (!occupiedRects.length) return scratchCollision;
    occupiedQueryStamp += 1;
    var stamp = occupiedQueryStamp;
    var startBand = getBandIndex(top);
    var endBand = getBandIndex(bottom);
    for (var band = startBand; band <= endBand; band++) {
      var bucket = occupiedBands[band];
      if (!bucket) continue;
      for (var bi = 0; bi < bucket.length; bi++) {
        var rectIndex = bucket[bi];
        if (occupiedMarks[rectIndex] === stamp) continue;
        occupiedMarks[rectIndex] = stamp;
        var rect = occupiedRects[rectIndex];
        var overlapW = Math.max(0, Math.min(right, rect.right) - Math.max(left, rect.left));
        var overlapH = Math.max(0, Math.min(bottom, rect.bottom) - Math.max(top, rect.top));
        if (overlapW <= 0 || overlapH <= 0) continue;
        scratchCollision.intersects = true;
        scratchCollision.overlapArea += overlapW * overlapH;
      }
    }
    return scratchCollision;
  }
  function pushPlacementRect(left, top, width, height, padding) {
    registerOccupiedRect({
      left: left - padding,
      top: top - height - padding,
      right: left + width + padding,
      bottom: top + padding
    });
  }

  /* placementPlans（emphasis 降序 → lineIndex → startX；VisualizerCadenza.tsx:904-938） */
  var placementPlans = [];
  for (var lv = 0; lv < lineData.length; lv++) {
    var lineView = lineData[lv];
    var lineLeft = -lineView.line.width / 2;
    var baselineY = -totalHeight / 2 + fontPx + lv * lineHeight;
    for (var fi = 0; fi < lineView.fragments.length; fi++) {
      var fragment = lineView.fragments[fi];
      var emphasis = emphasisMap['w' + fragment.wordIndex] != null ? emphasisMap['w' + fragment.wordIndex] : 1;
      var width = Math.max(fragment.endX - fragment.startX, fontPx * 0.18);
      var scale = emphasis > 1 ? baseScale * emphasis : baseScale;
      var height = fontPx * scale * 0.95;
      placementPlans.push({
        fragment: fragment,
        lineIndex: lv,
        fragmentIndex: fi,
        baseX: lineLeft + fragment.startX,
        baseY: baselineY,
        emphasis: emphasis,
        width: width,
        height: height,
        scale: scale,
        collisionWidth: width * scale * (emphasis > 1 ? 1.48 : 1.26),
        collisionHeight: height * (emphasis > 1 ? 1.36 : 1.24),
        padding: baseMargin + (emphasis > 1 ? 10 : 2)
      });
    }
  }
  placementPlans.sort(function (a, b) {
    var e = b.emphasis - a.emphasis;
    if (Math.abs(e) > 0.001) return e;
    if (a.lineIndex !== b.lineIndex) return a.lineIndex - b.lineIndex;
    return a.fragment.startX - b.fragment.startX;
  });
  var primaryPlanByWordIndex = {};
  for (var pp = 0; pp < placementPlans.length; pp++) {
    var widx = 'w' + placementPlans[pp].fragment.wordIndex;
    if (primaryPlanByWordIndex[widx] === undefined) primaryPlanByWordIndex[widx] = placementPlans[pp];
  }
  var heroPlan = heroWordIndex === null ? null : (primaryPlanByWordIndex['w' + heroWordIndex] || null);
  var heroMetrics = heroPlan ? {
    centerX: (heroPlan.width * heroPlan.scale) / 2,
    centerY: -heroPlan.height * 0.46,
    width: heroPlan.width * heroPlan.scale
  } : null;

  for (var pi = 0; pi < placementPlans.length; pi++) {
    var plan = placementPlans[pi];
    var frag2 = plan.fragment;
    var wordSeed = seed + frag2.wordIndex * 17 + plan.lineIndex * 31 + plan.fragmentIndex * 13;
    var rotate = 0;
    var passedRotate = (cadenzaSeededRandom(wordSeed, 3) - 0.5) * 12;   /* 'normal' → ±12° */
    var entryOffsetX = 0;
    var entryOffsetY = 0;
    var step = Math.max(10, Math.round(fontPx * 0.14));
    var maxRadius = plan.emphasis > 1
      ? Math.max(20, lineHeight * 0.5)
      : Math.max(lineHeight * 2.2, plan.collisionWidth * 0.75, 56);
    var preferredX = plan.emphasis > 1 ? -plan.width / 2 : plan.baseX;
    var preferredY = plan.emphasis > 1 ? 0 : plan.baseY;

    if (!isInterlude && plan.emphasis <= 1 && heroMetrics) {
      var wordCenterX = preferredX + plan.width / 2;
      var wordCenterY = preferredY - plan.height * 0.46;
      var dx = wordCenterX - heroMetrics.centerX;
      var dy = wordCenterY - heroMetrics.centerY;
      var distance = Math.hypot(dx, dy);
      if (distance < 1) {
        dx = preferredX >= 0 ? 1 : -1;
        dy = plan.lineIndex % 2 === 0 ? -0.65 : 0.65;
      }
      var minHeroSeparation = heroMetrics.width * 0.34 + plan.width * 0.52 + plan.padding * 2;
      if (distance < minHeroSeparation) {
        var normalizedDistance = Math.max(Math.hypot(dx, dy), 1);
        var ux = dx / normalizedDistance;
        var uy = dy / normalizedDistance;
        var push = minHeroSeparation - distance;
        preferredX += ux * push;
        preferredY += uy * push * 0.92;
      }
    }

    var horizontalMin = (-maxWidth / 2) - 72;
    var horizontalMax = (maxWidth / 2) + 72;
    var verticalMin = -Math.max(totalHeight * 0.9, lineHeight * 1.6);
    var verticalMax = Math.max(totalHeight * 0.9, lineHeight * 1.45);
    var chosenX = preferredX;
    var chosenY = preferredY;
    var found = false;
    var bestFallbackX = preferredX;
    var bestFallbackY = preferredY;
    var bestFallbackScore = Number.POSITIVE_INFINITY;
    var baseAngle = heroMetrics && plan.emphasis <= 1
      ? Math.atan2(preferredY, preferredX + plan.width / 2)
      : 0;

    for (var radius = 0; radius <= maxRadius && !found; radius += step) {
      var sampleCount = radius === 0
        ? 1
        : (plan.emphasis > 1 ? 8 : Math.max(12, Math.round((Math.PI * 2 * radius) / Math.max(step * 1.1, 10))));
      for (var s = 0; s < sampleCount && !found; s++) {
        var dxc = 0, dyc = 0;
        if (radius !== 0) {
          var angle = baseAngle + (s / sampleCount) * Math.PI * 2;
          var ellipseY = radius * (plan.emphasis > 1 ? 0.8 : 0.92);
          dxc = Math.cos(angle) * radius;
          dyc = Math.sin(angle) * ellipseY;
        }
        var left = preferredX + dxc - plan.padding;
        var top = preferredY + dyc - plan.collisionHeight - plan.padding;
        var right = left + plan.collisionWidth + plan.padding * 2;
        var bottom = top + plan.collisionHeight + plan.padding * 2;
        var withinBounds = left >= horizontalMin && right <= horizontalMax && top >= verticalMin && bottom <= verticalMax;
        if (!withinBounds) continue;
        var collision = evaluateCollisionRect(left, top, right, bottom);
        var travel = Math.hypot(dxc, dyc);
        var score = collision.overlapArea * 2.2 + travel;
        if (score < bestFallbackScore) {
          bestFallbackScore = score;
          bestFallbackX = preferredX + dxc;
          bestFallbackY = preferredY + dyc;
        }
        if (!collision.intersects) {
          chosenX = preferredX + dxc;
          chosenY = preferredY + dyc;
          pushPlacementRect(chosenX, chosenY, plan.collisionWidth, plan.collisionHeight, plan.padding);
          found = true;
          break;
        }
      }
    }
    if (!found) {
      chosenX = bestFallbackX;
      chosenY = bestFallbackY;
      pushPlacementRect(chosenX, chosenY, plan.collisionWidth, plan.collisionHeight, plan.padding);
    }

    var outwardX = chosenX + plan.width / 2;
    var outwardY = chosenY - plan.height * 0.46;
    var outwardLength = Math.max(Math.hypot(outwardX, outwardY), 1);
    var outwardUnitX = outwardX / outwardLength;
    var outwardUnitY = outwardY / outwardLength;
    var driftAmount = isInterlude
      ? 3 + cadenzaSeededRandom(wordSeed, 6) * 3
      : plan.emphasis > 1
        ? 4 + cadenzaSeededRandom(wordSeed, 6) * 4
        : 5 + cadenzaSeededRandom(wordSeed, 6) * 6;   /* 'normal' */

    var textMetrics = cadenzaMeasureText(frag2.text, font);
    /* Folia：actualBoundingBoxAscent || fontPx*0.78 兜底 */
    var ascent = textMetrics.ascent || fontPx * 0.78;

    placements.push({
      id: frag2.word.text + '-' + frag2.wordIndex + '-' + plan.lineIndex + '-' + plan.fragmentIndex + '-' + frag2.fragmentIndexInWord,
      wordIndex: frag2.wordIndex,
      word: frag2.word,
      text: frag2.text,
      color: frag2.color,
      x: chosenX,
      y: chosenY,
      width: plan.width,
      height: plan.height,
      rotate: rotate,
      scale: plan.scale,
      passedRotate: passedRotate,
      passedDriftX: outwardUnitX * driftAmount + (cadenzaSeededRandom(wordSeed, 7) - 0.5) * 2.4,
      passedDriftY: outwardUnitY * driftAmount * 0.72 + (cadenzaSeededRandom(wordSeed, 8) - 0.5) * 2,
      entryOffsetX: entryOffsetX,
      entryOffsetY: entryOffsetY,
      fragmentStartInWord: frag2.fragmentStartInWord,
      fragmentEndInWord: frag2.fragmentEndInWord,
      wordGraphemeCount: frag2.wordGraphemeCount,
      wordGraphemeTimings: frag2.wordGraphemeTimings,
      emphasis: plan.emphasis,
      isInterlude: isInterlude,
      ascent: ascent,
      glyphs: null,           /* 惰性：splitGraphemes(text) 首次用到时缓存 */
      wholeTextPool: null,    /* 惰性：整词辉光的单元素数组（syncGlyphSpans 签名用） */
      bodyColors: null,
      shadowCache: null,
      rippleStyles: null
    });
  }
  return placements;
}

/* buildPreparedState（VisualizerCadenza.tsx:497-547） */
function cadenzaBuildPreparedState(line) {
  if (cadenzaViewportW <= 0 || cadenzaViewportH <= 0) return null;
  var fontPx = cadenzaClamp(cadenzaChooseFontPx(cadenzaViewportW, line) * CADENZA_TUNING.fontScale, 24, 132);
  var font = cadenzaFontAtPx(cadenzaResolveFont(), fontPx);
  var prepared = cadenzaPrepareWithSegments(line.fullText, font);
  var metas = cadenzaBuildSegmentMetas(prepared);
  var segmentMetas = metas.segmentMetas;
  var graphemes = metas.graphemes;
  var lineHeight = Math.round(fontPx * (cadenzaIsCJK(prepared.segments.join('')) ? 1.22 : 1.1));
  var availableWidth = Math.max(cadenzaViewportW - 48, 120);
  var minWidth = Math.min(220, availableWidth);
  var wrapCompression = graphemes.length > 12
    ? cadenzaClamp(0.92 - (graphemes.length - 12) * 0.018, 0.62, 0.92)
    : 0.92;
  var compactWidthRatio = CADENZA_TUNING.widthRatio * wrapCompression;
  var maxWidth = cadenzaClamp(Math.min(cadenzaViewportW * compactWidthRatio, 820), minWidth, availableWidth);
  var layout = cadenzaLayoutWithLines(prepared, maxWidth);
  var ranges = cadenzaFindWordRanges(line, graphemes);
  var lineFragments = cadenzaBuildLineFragments(prepared, segmentMetas, graphemes, layout, ranges);
  var placements = cadenzaBuildWordPlacements(
    lineFragments, fontPx, lineHeight, maxWidth,
    line.startTime * 1000, line.isInterlude, font
  );
  return {
    font: font,
    fontPx: fontPx,
    lineHeight: lineHeight,
    maxWidth: maxWidth,
    placements: placements
  };
}

/* prepare 缓存（Folia preparedStateCacheRef：lineKey 寻址 + contextKey 失效） */
function cadenzaGetPreparedState(line) {
  if (!line || !cadenzaPreparedCache) return null;
  var key = [line.startTime, line.endTime, line.fullText, line.words.length].join('|');
  var cached = cadenzaPreparedCache.get(key);
  if (cached) return cached;
  var state = cadenzaBuildPreparedState(line);
  if (state) {
    if (cadenzaPreparedCache.size >= CADENZA_MAX_PREPARED_CACHE) {
      /* FIFO 淘汰最老（Map 保插入序；Folia 靠 contextKey 整体清空，此处加保险上限） */
      var oldest = cadenzaPreparedCache.keys().next().value;
      if (oldest !== undefined) cadenzaPreparedCache.delete(oldest);
    }
    cadenzaPreparedCache.set(key, state);
  }
  return state;
}

/* font 字符串组装（字重/字族跟随用户歌词字体，缓存模板；px 渲染时替换） */
function cadenzaResolveFont() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  var weight = (typeof lyricFontWeightValue === 'function')
    ? lyricFontWeightValue()
    : 700;
  var cacheKey = weight + '|' + fontKey;
  if (cacheKey === cadenzaFontTemplateKey && cadenzaFontTemplate) return cadenzaFontTemplate;
  var stack = (fontKey && typeof lyricFontStackForKey === 'function')
    ? lyricFontStackForKey(fontKey)
    : '"Noto Sans SC","Microsoft YaHei","PingFang SC",system-ui,sans-serif';
  cadenzaFontTemplateKey = cacheKey;
  cadenzaFontTemplate = weight + ' 0px ' + stack;
  return cadenzaFontTemplate;
}
function cadenzaFontAtPx(fontTemplate, fontPx) {
  return fontTemplate.replace(' 0px ', ' ' + (Math.round(fontPx * 100) / 100) + 'px ');
}

/* ---------- 10. 词状态机（VisualizerCadenza.tsx:228-448 纯函数照搬） ---------- */
/* status 数值化：0=waiting 1=passed 2=active（Folia 字符串枚举） */
function cadenzaGetWordStatus(time, lineTiming, word) {
  var lookahead = lineTiming.wordRevealMode === 'fast' ? 0.045
    : lineTiming.wordRevealMode === 'instant' ? 0 : 0.18;
  var activeEndTime = lineTiming.wordRevealMode === 'instant'
    ? lineTiming.renderEndTime
    : word.endTime;
  if (time >= word.startTime - lookahead && time <= activeEndTime) return 2;
  if (time > activeEndTime) return 1;
  return 0;
}

function cadenzaGetWordProgress(time, wordRevealMode, word) {
  if (wordRevealMode === 'instant') return time < word.startTime ? 0 : 1;
  var minDuration = wordRevealMode === 'fast' ? 0.045 : 0.01;
  var duration = Math.max(word.endTime - word.startTime, minDuration);
  return cadenzaClamp((time - word.startTime) / duration, 0, 1);
}

function cadenzaGetKeyframedGlow(progress) {
  if (progress <= 0 || progress >= 1) return 0;
  if (progress < 0.3) return cadenzaEaseOutCubic(progress / 0.3);
  return 1 - cadenzaClamp((progress - 0.3) / 0.7, 0, 1);
}

function cadenzaGetGlowEnvelope(time, lineTiming, word) {
  if (lineTiming.wordRevealMode === 'instant') {
    if (time < word.startTime || time > lineTiming.renderEndTime) return 0;
    return cadenzaGetKeyframedGlow(cadenzaClamp((time - word.startTime) / 0.067, 0, 1));
  }
  if (lineTiming.wordRevealMode === 'fast') {
    var durationF = Math.max(word.endTime - word.startTime, 0.045);
    if (time < word.startTime) return 0;
    if (time <= word.endTime) {
      var progressF = cadenzaClamp((time - word.startTime) / durationF, 0, 1);
      if (progressF < 0.14) return cadenzaEaseOutCubic(progressF / 0.14);
      if (progressF < 0.82) return 1;
      return cadenzaMix(1, 0.92, (progressF - 0.82) / 0.18);
    }
    var fadeOutF = cadenzaClamp((time - word.endTime) / 0.14, 0, 1);
    return Math.pow(1 - fadeOutF, 2);
  }
  var duration = Math.max(word.endTime - word.startTime, 0.1);
  if (time < word.startTime) return 0;
  if (time <= word.endTime) {
    var progress = cadenzaClamp((time - word.startTime) / duration, 0, 1);
    if (progress < 0.18) return cadenzaEaseOutCubic(progress / 0.18);
    if (progress < 0.9) return 1;
    return cadenzaMix(1, 0.9, (progress - 0.9) / 0.1);
  }
  var fadeOut = cadenzaClamp((time - word.endTime) / 0.9, 0, 1);
  return 0.9 * Math.pow(1 - fadeOut, 2);
}

function cadenzaGetCharGlow(time, word, glyphIndex, glyphCount, wordGraphemeTimings) {
  var duration = Math.max(word.endTime - word.startTime, 0.1);
  var singleDuration = duration / Math.max(glyphCount, 1);
  var timing = wordGraphemeTimings ? wordGraphemeTimings[glyphIndex] : null;
  var charDuration = timing ? Math.max(timing.endTime - timing.startTime, 0.001) : singleDuration;
  var charStartTime = timing ? timing.startTime : (word.startTime + singleDuration * glyphIndex);
  var animationDuration = charDuration * 6;
  var elapsed = time - charStartTime;
  var activeGlow = elapsed <= 0 ? 0 : cadenzaGetKeyframedGlow(elapsed / animationDuration);
  if (time <= word.endTime) return activeGlow;
  var fadeOut = Math.pow(1 - cadenzaClamp((time - word.endTime) / 0.9, 0, 1), 2);
  return activeGlow * fadeOut;
}

function cadenzaGetBodyMix(time, lineTiming, word) {
  if (lineTiming.wordRevealMode === 'instant') {
    if (time < word.startTime) return 0;
    return time <= lineTiming.renderEndTime ? 1 : 0;
  }
  if (time < word.startTime) return 0;
  if (time <= word.endTime) return cadenzaGetWordProgress(time, lineTiming.wordRevealMode, word);
  var fadeOut = cadenzaClamp((time - word.endTime) / (lineTiming.wordRevealMode === 'fast' ? 0.12 : 0.8), 0, 1);
  return 1 - fadeOut;
}

function cadenzaGetLineEnvelope(time, line, lineTiming) {
  if (!line) return { opacity: 1, scale: 1, blur: 0 };
  if (lineTiming.lineTransitionMode === 'none') {
    return { opacity: 1, scale: 1, blur: 0 };
  }
  if (lineTiming.lineTransitionMode === 'fast') {
    var enterDurationF = lineTiming.enterDuration;
    var exitDurationF = lineTiming.exitDuration;
    var linePassStartF = Math.max(lineTiming.lastWordEndTime, line.startTime) + lineTiming.linePassHold;
    var exitStartF = Math.max(line.startTime + enterDurationF + 0.01, linePassStartF, lineTiming.renderEndTime - exitDurationF);
    var enterProgressF = cadenzaEaseOutCubic(cadenzaClamp((time - line.startTime) / enterDurationF, 0, 1));
    var opacityF = cadenzaMix(0.65, 1, enterProgressF);
    var scaleF = cadenzaMix(0.97, 1, enterProgressF);
    var blurF = cadenzaMix(4, 0, enterProgressF);
    var exitProgressF = cadenzaEaseOutCubic(cadenzaClamp((time - exitStartF) / exitDurationF, 0, 1));
    if (exitProgressF > 0) {
      opacityF = cadenzaMix(opacityF, 0, exitProgressF);
      scaleF = cadenzaMix(scaleF, 1.03, exitProgressF);
      blurF = Math.max(blurF, cadenzaMix(0, 6, exitProgressF));
    }
    return { opacity: cadenzaClamp(opacityF, 0, 1), scale: scaleF, blur: blurF };
  }
  var enterDuration = lineTiming.enterDuration;
  var exitDuration = lineTiming.exitDuration;
  var preEnter = Math.min(0.1, enterDuration * 0.35);
  var enterProgress = cadenzaEaseOutCubic(cadenzaClamp((time - (line.startTime - preEnter)) / (enterDuration + preEnter), 0, 1));
  var opacity = cadenzaMix(0, 1, enterProgress);
  var scale = cadenzaMix(0.9, 1, enterProgress);
  var blur = cadenzaMix(10, 0, enterProgress);
  var linePassStart = Math.max(lineTiming.lastWordEndTime, line.startTime) + lineTiming.linePassHold;
  var exitStart = Math.max(linePassStart, lineTiming.renderEndTime - exitDuration);
  var exitProgress = cadenzaEaseOutCubic(cadenzaClamp((time - exitStart) / exitDuration, 0, 1));
  if (exitProgress > 0) {
    opacity *= 1 - exitProgress;
    scale = cadenzaMix(scale, 1.1, exitProgress);
    blur = Math.max(blur, cadenzaMix(0, 20, exitProgress));
  }
  return { opacity: cadenzaClamp(opacity, 0, 1), scale: scale, blur: blur };
}

function cadenzaGetPassedDrift(time, word) {
  if (time <= word.endTime) return 0;
  return cadenzaEaseInOutQuad(cadenzaClamp((time - word.endTime) / 5, 0, 1));
}

/* ---------- 11. DOM 词池（createOverlayWordNodes / syncOverlayGlyphSpans 复刻） ---------- */
function cadenzaCreateWordNodes() {
  var outer = document.createElement('div');
  outer.className = 'cadenza-word';
  outer.setAttribute('aria-hidden', 'true');
  var inner = document.createElement('div');
  inner.className = 'cadenza-word-inner';
  inner.style.lineHeight = '1';
  inner.style.display = 'inline-block';
  inner.style.position = 'relative';
  var body = document.createElement('span');
  body.className = 'cadenza-word-body';
  body.style.lineHeight = '1';
  body.style.display = 'block';
  body.style.position = 'relative';
  body.style.zIndex = '1';
  body.style.whiteSpace = 'pre';
  var glow = document.createElement('span');
  glow.className = 'cadenza-word-glow';
  glow.style.color = 'transparent';
  glow.style.lineHeight = '1';
  glow.style.display = 'block';
  glow.style.position = 'absolute';
  glow.style.left = '0';
  glow.style.top = '0';
  glow.style.zIndex = '0';
  glow.style.pointerEvents = 'none';
  glow.style.whiteSpace = 'pre';
  inner.appendChild(body);
  inner.appendChild(glow);
  outer.appendChild(inner);
  return {
    outer: outer,
    inner: inner,
    body: body,
    glow: glow,
    glyphSpans: [],
    glyphSignature: '',
    lastFrame: 0
  };
}

function cadenzaSyncGlyphSpans(nodes, texts) {
  var signature = texts.join('\u0001');
  if (nodes.glyphSignature === signature) return;
  while (nodes.glow.firstChild) nodes.glow.removeChild(nodes.glow.firstChild);
  var spans = [];
  for (var i = 0; i < texts.length; i++) {
    var span = document.createElement('span');
    span.textContent = texts[i];
    span.style.color = 'transparent';
    span.style.lineHeight = '1';
    nodes.glow.appendChild(span);
    spans.push(span);
  }
  nodes.glyphSpans = spans;
  nodes.glyphSignature = signature;
}

function cadenzaRemoveNodeValue(nodes) { if (nodes && nodes.outer) nodes.outer.remove(); }
function cadenzaClearOverlayNodes() {
  if (!cadenzaOverlayNodes) return;
  cadenzaOverlayNodes.forEach(cadenzaRemoveNodeValue);
  cadenzaOverlayNodes.clear();
}

/* ---------- 12. 音频特征（自算；energy ≡ Folia clamp(audioPower/255)） ---------- */
function cadenzaBinAvg(from, to) {
  if (typeof frequencyData === 'undefined' || !frequencyData || !frequencyData.length) return 0;
  var sum = 0, n = 0;
  var hi = Math.min(to, frequencyData.length - 1);
  for (var i = from; i <= hi; i++) { sum += frequencyData[i]; n++; }
  return n ? (sum / n) / 255 : 0;
}
function cadenzaTickAudio(dt) {
  var raw = cadenzaBinAvg(1, 320) * 0.75 + cadenzaBinAvg(321, 500) * 0.25;
  cadenzaEnergy += (raw - cadenzaEnergy) * Math.min(1, dt * 8);
  /* 副歌闸门（isChorus 近似）：慢升慢降能量积分 */
  var target = cadenzaClamp((cadenzaEnergy - 0.30) / 0.26, 0, 1);
  var k = target > cadenzaChorusGate ? 0.55 : 0.25;
  cadenzaChorusGate += (target - cadenzaChorusGate) * Math.min(1, dt * k);
}

/* ---------- 13. 渲染帧（VisualizerCadenza.tsx:1432-1659 draw() 复刻，30fps） ---------- */
function cadenzaSetEmpty(show, text) {
  if (!cadenzaEmptyEl) return;
  if (show !== cadenzaEmptyShown) {
    cadenzaEmptyShown = show;
    if (show) cadenzaEmptyEl.classList.add('show');
    else cadenzaEmptyEl.classList.remove('show');
  }
  if (show && text !== cadenzaEmptyText) {
    cadenzaEmptyText = text;
    cadenzaEmptyEl.textContent = text;
  }
}

function cadenzaTickFrame(dt) {
  cadenzaFrameNo++;
  if (!cadenzaLayerEl || !cadenzaWordsEl || !cadenzaCanvasEl) return;
  if (!cadenzaCanvasCtx) cadenzaCanvasCtx = cadenzaCanvasEl.getContext('2d');
  var ctx = cadenzaCanvasCtx;
  if (!ctx) return;

  var width = cadenzaViewportW;
  var height = cadenzaViewportH;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var cw = Math.max(1, Math.floor(width * dpr));
  var ch = Math.max(1, Math.floor(height * dpr));
  if (cadenzaCanvasEl.width !== cw || cadenzaCanvasEl.height !== ch) {
    cadenzaCanvasEl.width = cw;
    cadenzaCanvasEl.height = ch;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  var nowTime = 0;
  try {
    nowTime = getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0);
  } catch (e) { return; }
  var idx = -1;
  try {
    idx = findStageLyricIndexAtTime(nowTime);
  } catch (e) { idx = -1; }

  var activeLine = null;
  if (cadenzaHasRealLyrics && idx >= 0 && idx < lyricsLines.length) {
    if (idx !== cadenzaActiveIdx) {
      cadenzaActiveIdx = idx;
      cadenzaActiveLine = cadenzaAdaptLine(lyricsLines[idx]);
    }
    activeLine = cadenzaActiveLine;
  } else {
    cadenzaActiveIdx = -99;
    cadenzaActiveLine = null;
  }

  /* 空态（无词/前奏/间奏外无行）：层归零 + 清词池 + 空态文字浮现 */
  if (!activeLine) {
    cadenzaLayerEl.style.opacity = '0';
    cadenzaLayerEl.style.filter = 'none';
    cadenzaLayerEl.style.transform = 'scale(1)';
    if (!cadenzaOverlayCleared) {
      cadenzaClearOverlayNodes();
      cadenzaOverlayCleared = true;
    }
    cadenzaSetEmpty(true, cadenzaHasRealLyrics ? '间 奏' : '等待音乐…');
    return;
  }
  cadenzaSetEmpty(false, '');
  cadenzaOverlayCleared = false;

  /* prepare（active + upcoming 预热；Folia prepareActiveAndUpcoming） */
  var preparedState = cadenzaGetPreparedState(activeLine);
  if (idx + 1 < lyricsLines.length) {
    if (idx + 1 !== cadenzaUpcomingCacheIdx) {
      cadenzaUpcomingCacheIdx = idx + 1;
      cadenzaUpcomingCacheLine = cadenzaAdaptLine(lyricsLines[idx + 1]);
    }
    if (cadenzaUpcomingCacheLine) cadenzaGetPreparedState(cadenzaUpcomingCacheLine);
  }
  if (!preparedState) return;

  var time = nowTime;
  var lineTiming = cadenzaResolveLineRenderTiming(activeLine);
  var lineEnvelope = cadenzaGetLineEnvelope(time, activeLine, lineTiming);
  var wordRevealMode = lineTiming.wordRevealMode;
  var isInstantWordReveal = wordRevealMode === 'instant';
  var energy = cadenzaClamp(cadenzaEnergy, 0, 1);
  var motionEnergy = energy * CADENZA_TUNING.motionAmount;
  var verticalLift = Math.sin(time * 2.3) * (3 + motionEnergy * 8);
  var focusY = height * 0.42 + verticalLift;
  var isChorusNow = cadenzaChorusGate > 0.55;

  cadenzaLayerEl.style.opacity = String(lineEnvelope.opacity);
  cadenzaLayerEl.style.filter = lineEnvelope.blur > 0.05 ? 'blur(' + lineEnvelope.blur.toFixed(2) + 'px)' : 'none';
  cadenzaLayerEl.style.transform = 'scale(' + lineEnvelope.scale + ')';

  ctx.font = preparedState.font;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  var placements = preparedState.placements;
  var stateMap = cadenzaAnimatedStates;
  var nodesMap = cadenzaOverlayNodes;
  var transformTransitionAmount = 1 - Math.exp(-11 * dt);
  var visualTransitionAmount = 1 - Math.exp(-14 * dt);
  var glowTransitionAmount = 1 - Math.exp(-16 * dt);

  for (var pi = 0; pi < placements.length; pi++) {
    var placement = placements[pi];
    var status = cadenzaGetWordStatus(time, lineTiming, placement.word);
    var progress = cadenzaGetWordProgress(time, wordRevealMode, placement.word);
    var passedAlpha = isInstantWordReveal ? 0 : 0.82;   /* 'normal' 0.82 */
    var pulse = (status === 2 && !isInstantWordReveal)
      ? 1 + Math.sin(time * CADENZA_ACTIVE_PULSE_FREQUENCY + placement.word.startTime * 5) * 0.04 * CADENZA_TUNING.motionAmount
      : 1;
    var passedDriftProgress = isInstantWordReveal ? 0 : cadenzaGetPassedDrift(time, placement.word);
    var targetScale = status === 0
      ? (isInstantWordReveal ? placement.scale : Math.max(placement.scale * 0.5, 0.5))
      : status === 2
        ? (isInstantWordReveal ? placement.scale : placement.scale * 1.3 * pulse)
        : placement.scale;
    var targetRotation = status === 0
      ? (isInstantWordReveal ? placement.rotate : placement.rotate + 20)
      : status === 1
        ? (isInstantWordReveal ? placement.rotate : placement.rotate + placement.passedRotate * passedDriftProgress)
        : placement.rotate;
    var localFloatX = Math.sin(time * 1.2 + pi * 0.6) * motionEnergy * 4;
    var localFloatY = Math.cos(time * 1.5 + pi * 0.4) * motionEnergy * 2.5;
    var passedDriftX = status === 1 ? placement.passedDriftX * passedDriftProgress : 0;
    var passedDriftY = status === 1 ? placement.passedDriftY * passedDriftProgress : 0;
    var targetX = width / 2 + placement.x + localFloatX + passedDriftX + (status === 0 ? placement.entryOffsetX : 0);
    var targetY = focusY + placement.y + localFloatY + passedDriftY + (status === 0 ? placement.entryOffsetY : 0);
    var targetBodyAlpha = status === 0 ? 0 : (status === 2 ? 1 : passedAlpha);
    var targetBlur = (status === 0 && !isInstantWordReveal) ? 10 : 0;
    var targetActiveMix = cadenzaGetBodyMix(time, lineTiming, placement.word);
    var targetGlowAlpha = cadenzaGetGlowEnvelope(time, lineTiming, placement.word);
    var animatedState = stateMap.get(placement.id);
    if (!animatedState) {
      var shouldInitializeAsActive = isInstantWordReveal && time >= placement.word.startTime;
      animatedState = {
        x: width / 2 + placement.x + placement.entryOffsetX,
        y: focusY + placement.y + placement.entryOffsetY,
        rotation: shouldInitializeAsActive ? targetRotation : targetRotation + 16,
        scale: shouldInitializeAsActive ? targetScale : Math.max(placement.scale * 0.5, 0.5),
        bodyAlpha: shouldInitializeAsActive ? targetBodyAlpha : 0,
        blur: shouldInitializeAsActive ? targetBlur : 10,
        activeMix: shouldInitializeAsActive ? targetActiveMix : 0,
        glowAlpha: shouldInitializeAsActive ? targetGlowAlpha : 0,
        lastFrame: 0
      };
      stateMap.set(placement.id, animatedState);
    }
    animatedState.x = cadenzaMix(animatedState.x, targetX, transformTransitionAmount);
    animatedState.y = cadenzaMix(animatedState.y, targetY, transformTransitionAmount);
    animatedState.rotation = cadenzaMix(animatedState.rotation, targetRotation, transformTransitionAmount);
    animatedState.scale = cadenzaMix(animatedState.scale, targetScale, transformTransitionAmount);
    animatedState.bodyAlpha = cadenzaMix(animatedState.bodyAlpha, targetBodyAlpha, visualTransitionAmount);
    animatedState.blur = cadenzaMix(animatedState.blur, targetBlur, visualTransitionAmount);
    animatedState.activeMix = cadenzaMix(animatedState.activeMix, targetActiveMix, visualTransitionAmount);
    animatedState.glowAlpha = cadenzaMix(animatedState.glowAlpha, targetGlowAlpha, glowTransitionAmount);
    animatedState.lastFrame = cadenzaFrameNo;

    if (animatedState.bodyAlpha < 0.015 && animatedState.glowAlpha < 0.015) continue;

    var drawX = animatedState.x;
    var drawBaselineY = animatedState.y;
    var visualWidth = placement.width * animatedState.scale;
    var visualHeight = placement.height * animatedState.scale;
    var highlightHeight = visualHeight * (status === 2 ? 1.08 : 1);
    var scaledLeft = drawX - (visualWidth - placement.width) / 2;

    /* 副歌涟漪（Canvas2D 唯一职责；Folia activeLine.isChorus → 能量闸门近似） */
    if (status === 2 && !placement.isInterlude && isChorusNow) {
      var rippleRadius = Math.max(visualWidth, highlightHeight) * (0.55 + progress * 0.45);
      ctx.strokeStyle = cadenzaRippleStyleAt(placement, (1 - progress) * animatedState.bodyAlpha);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(scaledLeft + visualWidth / 2, drawBaselineY - visualHeight * 0.42, rippleRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    var textX = -placement.width / 2;
    var textY = placement.height * 0.42;
    var overlayAnchorX = drawX + placement.width / 2;
    var overlayAnchorY = drawBaselineY - placement.height * 0.42;
    var overlayOffsetX = textX;
    var overlayOffsetY = textY - placement.ascent;
    if (!placement.glyphs) placement.glyphs = cadenzaSplitGraphemes(placement.text);
    var glyphs = placement.glyphs;
    var shouldSplitGlow = wordRevealMode === 'normal' && !cadenzaIsCJK(placement.text) && glyphs.length > 1;

    var overlayWord = nodesMap.get(placement.id);
    if (!overlayWord) {
      overlayWord = cadenzaCreateWordNodes();
      nodesMap.set(placement.id, overlayWord);
      cadenzaWordsEl.appendChild(overlayWord.outer);
    }
    overlayWord.lastFrame = cadenzaFrameNo;

    overlayWord.outer.style.transform = 'translate3d(' + overlayAnchorX + 'px,' + overlayAnchorY + 'px,0) rotate(' + animatedState.rotation + 'deg) scale(' + animatedState.scale + ')';
    /* 独立合成层恒开（Folia 的 Linux glyph-cache 防泄漏开关在本项目桌面端直接采用） */
    if (overlayWord.outer.style.willChange !== 'transform') overlayWord.outer.style.willChange = 'transform';
    overlayWord.outer.style.transformOrigin = '0 0';
    if (overlayWord.inner.style.font !== preparedState.font) overlayWord.inner.style.font = preparedState.font;
    overlayWord.inner.style.transform = 'translate3d(' + overlayOffsetX + 'px,' + overlayOffsetY + 'px,0)';
    if (overlayWord.body.textContent !== placement.text) overlayWord.body.textContent = placement.text;
    var bodyColor = cadenzaBodyColorAt(placement,
      Math.round(cadenzaClamp(animatedState.activeMix, 0, 1) * (CADENZA_MIX_LEVELS - 1)));
    if (overlayWord.body._czColor !== bodyColor) {
      overlayWord.body.style.color = bodyColor;
      overlayWord.body._czColor = bodyColor;
    }
    overlayWord.body.style.opacity = String(animatedState.bodyAlpha);
    var bodyFilter = animatedState.blur > 0.05 ? 'blur(' + animatedState.blur.toFixed(2) + 'px)' : 'none';
    if (overlayWord.body._czFilter !== bodyFilter) {
      overlayWord.body.style.filter = bodyFilter;
      overlayWord.body._czFilter = bodyFilter;
    }

    if (shouldSplitGlow) {
      cadenzaSyncGlyphSpans(overlayWord, glyphs);
      var spans = overlayWord.glyphSpans;
      for (var gi = 0; gi < spans.length; gi++) {
        var absoluteIndex = placement.fragmentStartInWord + gi;
        var intensity = cadenzaGetCharGlow(
          time, placement.word, absoluteIndex,
          Math.max(placement.wordGraphemeCount, glyphs.length),
          placement.wordGraphemeTimings
        ) * cadenzaClamp(animatedState.glowAlpha, 0, 1) * Math.max(CADENZA_TUNING.glowIntensity, 0);
        var shadow = cadenzaShadowAt(placement, intensity);
        var span = spans[gi];
        if (span._czShadow !== shadow) {
          span.style.textShadow = shadow;
          span._czShadow = shadow;
        }
      }
    } else {
      if (!placement.wholeTextPool) placement.wholeTextPool = [placement.text];
      cadenzaSyncGlyphSpans(overlayWord, placement.wholeTextPool);
      var wholeIntensity = cadenzaGetGlowEnvelope(time, lineTiming, placement.word)
        * cadenzaClamp(animatedState.glowAlpha, 0, 1)
        * Math.max(CADENZA_TUNING.glowIntensity, 0);
      var wholeShadow = cadenzaShadowAt(placement, wholeIntensity);
      var wholeSpan = overlayWord.glyphSpans[0];
      if (wholeSpan && wholeSpan._czShadow !== wholeShadow) {
        wholeSpan.style.textShadow = wholeShadow;
        wholeSpan._czShadow = wholeShadow;
      }
    }
  }

  /* 清扫（帧号标记替代 Folia 每帧 Set；Map.forEach 无迭代器分配） */
  stateMap.forEach(cadenzaSweepState);
  nodesMap.forEach(cadenzaSweepNode);
}
function cadenzaSweepState(state, key) {
  if (state.lastFrame < cadenzaFrameNo - 1) cadenzaAnimatedStates.delete(key);
}
function cadenzaSweepNode(node, key) {
  if (node.lastFrame < cadenzaFrameNo - 1) {
    node.outer.remove();
    cadenzaOverlayNodes.delete(key);
  }
}

/* ---------- 14. 主循环（30fps 节流，09-aurora-flow 同形态） ---------- */
function startCadenzaLoop() {
  stopCadenzaLoop();
  var lastTick = 0;
  var lastFrame = performance.now();
  function frame(now) {
    if (!cadenzaMode) return;
    var dt = Math.min(0.1, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    if (now - lastTick > 33) {
      lastTick = now;
      /* dt clamp 对齐 Folia [1/240, 0.05]（指数逼近的时间常数） */
      var smoothDt = Math.max(1 / 240, Math.min(0.05, dt));
      cadenzaTickAudio(dt);
      cadenzaCheckFontChange();
      cadenzaTickFrame(smoothDt);
    }
    cadenzaRafId = requestAnimationFrame(frame);
  }
  cadenzaRafId = requestAnimationFrame(frame);
  cadenzaWatchLyricsChange();
}
function stopCadenzaLoop() {
  if (cadenzaRafId) {
    cancelAnimationFrame(cadenzaRafId);
    cadenzaRafId = 0;
  }
  cadenzaLyricsWatchToken++;
}

function cadenzaCheckFontChange() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  if (fontKey !== cadenzaLastFontKey) {
    cadenzaLastFontKey = fontKey;
    cadenzaInvalidatePrepared();
  }
}

/* 歌词数据变化轮询（lyricsLines 无事件；aurora 同款范式，600ms） */
function cadenzaWatchLyricsChange() {
  var token = ++cadenzaLyricsWatchToken;
  var lastLen = -1;
  function check() {
    if (token !== cadenzaLyricsWatchToken || !cadenzaMode) return;
    var lines = (typeof lyricsLines !== 'undefined') ? lyricsLines : null;
    var len = (lines && lines.length) || 0;
    if (len !== lastLen) {
      lastLen = len;
      /* hasReal 每帧消费，轮询时一次算好（免每帧 some+闭包分配） */
      cadenzaHasRealLyrics = !!(lines && lines.length &&
        lines.some(function (l) { return l && !l.fallback; }));
      cadenzaInvalidatePrepared();
      cadenzaActiveIdx = -99;
      cadenzaActiveLine = null;
      cadenzaUpcomingCacheIdx = -1;
      cadenzaUpcomingCacheLine = null;
    }
    setTimeout(check, 600);
  }
  check();
}

function cadenzaInvalidatePrepared() {
  if (cadenzaPreparedCache) cadenzaPreparedCache.clear();
  cadenzaPreparedContextKey = '';
}

/* prepared 缓存 context（viewport/字体变化 → 全量失效；Folia contextKey 同义） */
function cadenzaRefreshContext() {
  cadenzaViewportW = window.innerWidth || 1280;
  cadenzaViewportH = window.innerHeight || 800;
  var contextKey = [
    cadenzaViewportW, cadenzaViewportH,
    cadenzaLastFontKey,
    CADENZA_TUNING.fontScale, CADENZA_TUNING.widthRatio
  ].join('|');
  if (contextKey !== cadenzaPreparedContextKey) {
    cadenzaPreparedContextKey = contextKey;
    if (cadenzaPreparedCache) cadenzaPreparedCache.clear();
  }
}

/* ---------- 15. 模式进出（09-aurora-flow 同形态） ---------- */
function applyCadenzaMode(on, opts) {
  opts = opts || {};
  cadenzaMode = !!on;
  /* 覆盖层互斥：经视觉模式注册表退出其它覆盖层 */
  if (cadenzaMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('cadenza', { save: true });
  }
  document.body.classList.toggle('cadenza', cadenzaMode);
  var overlay = document.getElementById('cadenza-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', cadenzaMode ? 'false' : 'true');
  if (opts.save && typeof saveBooleanPreference === 'function') {
    saveBooleanPreference(CADENZA_STORE_KEY, cadenzaMode);
  }
  if (cadenzaMode) {
    startCadenza();
    /* 3D 场景已被覆盖层盖住：临时切 eco 质量档让出帧预算（退出时恢复） */
    if (typeof fx !== 'undefined' && fx && cadenzaPrevQuality === null) {
      cadenzaPrevQuality = fx.performanceQuality || 'balanced';
      fx.performanceQuality = 'eco';
    }
  } else {
    stopCadenza();
    if (cadenzaPrevQuality !== null && typeof fx !== 'undefined' && fx) {
      fx.performanceQuality = cadenzaPrevQuality;
      cadenzaPrevQuality = null;
    }
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast && typeof showToast === 'function') {
    showToast(cadenzaMode ? '心象已开启' : '已切回标准模式');
  }
}

function toggleCadenzaMode() {
  applyCadenzaMode(!cadenzaMode, { save: true, toast: true });
}

function startCadenza() {
  if (!cadenzaPreparedCache) cadenzaPreparedCache = new Map();
  if (!cadenzaOverlayNodes) cadenzaOverlayNodes = new Map();
  if (!cadenzaAnimatedStates) cadenzaAnimatedStates = new Map();
  if (!cadenzaWidthCache) cadenzaWidthCache = new Map();
  if (!cadenzaMetricsCache) cadenzaMetricsCache = new Map();
  cadenzaLayerEl = document.getElementById('cadenza-layer');
  cadenzaWordsEl = document.getElementById('cadenza-words');
  cadenzaCanvasEl = document.getElementById('cadenza-canvas');
  cadenzaEmptyEl = document.getElementById('cadenza-empty');
  cadenzaCanvasCtx = null;
  cadenzaEmptyShown = false;
  cadenzaEmptyText = '';
  cadenzaLastFontKey = null;      /* 强制首帧解析字体 */
  cadenzaRefreshContext();
  cadenzaActiveIdx = -99;
  cadenzaActiveLine = null;
  cadenzaUpcomingCacheIdx = -1;
  cadenzaUpcomingCacheLine = null;
  startCadenzaLoop();
}

function stopCadenza() {
  stopCadenzaLoop();
  cadenzaClearOverlayNodes();
  if (cadenzaAnimatedStates) cadenzaAnimatedStates.clear();
  cadenzaInvalidatePrepared();
  cadenzaActiveIdx = -99;
  cadenzaActiveLine = null;
  cadenzaUpcomingCacheIdx = -1;
  cadenzaUpcomingCacheLine = null;
  cadenzaEnergy = 0;
  cadenzaChorusGate = 0;
  cadenzaOverlayCleared = true;
  if (cadenzaCanvasCtx && cadenzaCanvasEl && cadenzaCanvasEl.width) {
    cadenzaCanvasCtx.setTransform(1, 0, 0, 1, 0, 0);
    cadenzaCanvasCtx.clearRect(0, 0, cadenzaCanvasEl.width, cadenzaCanvasEl.height);
  }
  if (cadenzaLayerEl) {
    cadenzaLayerEl.style.opacity = '0';
    cadenzaLayerEl.style.filter = 'none';
    cadenzaLayerEl.style.transform = 'scale(1)';
  }
  cadenzaSetEmpty(false, '');
}

/* ---------- 16. resize ---------- */
function onCadenzaResize() {
  if (!cadenzaMode) return;
  cadenzaRefreshContext();
}

/* ---------- 17. 启动绑定 ---------- */
function initCadenza() {
  applyCadenzaMode(cadenzaMode, { save: false });
  window.addEventListener('resize', function () {
    clearTimeout(cadenzaResizeTimer);
    cadenzaResizeTimer = setTimeout(onCadenzaResize, 180);
  });
}

/* 延迟到 DOM 就绪后初始化（本模块在 index-loader 末段加载，DOM 已就绪） */
(typeof scheduleUiWarmTask === 'function')
  ? scheduleUiWarmTask(initCadenza, 320)
  : setTimeout(initCadenza, 320);
