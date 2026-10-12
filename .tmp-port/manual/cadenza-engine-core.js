/* =========================================================================
   cadenza 渲染核心 —— Folia VisualizerCadenza.tsx 的无构建 DOM+Canvas 忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     src/components/visualizer/cadenza/VisualizerCadenza.tsx（渲染核心全文，
       逐函数同构，函数后括注源码行号）
     src/components/visualizer/runtime.ts（:35-52 / :56-73 / :76-86 / :107-120
       —— 当前行/最近完成行/upcoming 行/预备管线）
     src/components/visualizer/VisualizerSubtitleOverlay.tsx +
       src/utils/lyrics/subtitleTrackStyle.ts（底部字幕/下一句预览）
     src/utils/appPlaybackHelpers.ts:21-31（findLatestActiveLineIndex ——
       Folia 宿主写 playbackStore.currentLineIndex 的权威语义）
     src/types.ts:405-419（CadenzaTuning / DEFAULT_CADENZA_TUNING）
     src/components/visualizer/cadenza/entry.tsx:9-22（fontScale × lyricsFontScale
       的模式内适配）

   结构对应（React → 无构建 DOM+Canvas）：
     VisualizerShell            → cz-shell（fontFamily/fontWeight inline，同 :128-134；
                                  背景/返回按钮等宿主层由 MineRadio 容器壳负责）
     lineLayer（:1689-1702）    → cz-layer（opacity/filter/transform/perspective 每帧直写）
     overlayRef 词池（:1700）   → cz-overlay（createOverlayWordNodes 节点池，:136-201）
     textCanvasRef（:1701）     → cz-canvas（Canvas2D：副歌涟漪描线，:1569-1584）
     AnimatePresence 空态       → cz-empty（opacity 0.3s CSS 过渡，与 framer 缺省 tween 同值）
     useMemo preparedState      → 行 key 缓存 + contextKey 失效（:1326-1420 等价）
     currentTime MotionValue    → 桥 MV duck-type（引擎每帧 get()）
     audioPower MotionValue     → 桥 MV（0..255 值域同 Folia；桥内 ×255 换算）

   动画驱动（与 classic 的 variants 不同）：cadenza 源码不用 framer 变体，
   主循环是 rAF + 指数平滑（:1533-1556，1 - exp(-k·dt)），词几何/透明度/辉光
   全部逐帧直写 DOM inline style + canvas —— 本文件即同构 rAF 循环，不借
   mini-motion（仅底部字幕进出沿用 mm，与 VisualizerSubtitleOverlay 的
   AnimatePresence :134-146/:157-162 等价）。
   MineRadio 宿主差异（数据源在桥）：无 calm/chaotic 强度档（按 normal）；
   无主题词色表（wordColors=[]，resolveWordColor 回退 accentColor）。
   ========================================================================= */

/* ---------- tuning（types.ts:405-419 原值） ---------- */
var CADENZA_DEFAULT_TUNING = {
  fontScale: 1.12,
  widthRatio: 0.72,
  motionAmount: 1,
  glowIntensity: 1,
  beamIntensity: 0
};

/* ---------- 数值工具（VisualizerCadenza.tsx:215-226 原样） ---------- */
function cadenzaClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function cadenzaMix(from, to, amount) { return from + (to - from) * amount; }
function cadenzaEaseOutCubic(value) { return 1 - Math.pow(1 - cadenzaClamp(value, 0, 1), 3); }
function cadenzaEaseInOutQuad(value) {
  var normalized = cadenzaClamp(value, 0, 1);
  return normalized < 0.5
    ? 2 * normalized * normalized
    : 1 - Math.pow(-2 * normalized + 2, 2) / 2;
}
var CADENZA_ACTIVE_PULSE_FREQUENCY = 10;                       /* :224 */
function cadenzaIsCJK(text) { return /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(text); }  /* :226 */

/* ---------- grapheme 拆分（:203-213 原样） ---------- */
var cadenzaGraphemeSegmenter = (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function')
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;
function cadenzaSplitGraphemes(text) {
  if (!text) return [];
  if (cadenzaGraphemeSegmenter) {
    /* segment() 返回可迭代 Segments 对象（非迭代器），走 Array.from 映射（与源码一致） */
    return Array.from(cadenzaGraphemeSegmenter.segment(text), function (s) { return s.segment; });
  }
  return Array.from(text);
}

/* ---------- 词三态（:228-245） ---------- */
function cadenzaGetWordStatus(time, lineTiming, word) {
  var lookahead = lineTiming.wordRevealMode === 'fast'
    ? 0.045
    : lineTiming.wordRevealMode === 'instant'
      ? 0
      : 0.18;
  var activeEndTime = lineTiming.wordRevealMode === 'instant'
    ? lineTiming.lineRenderEndTime
    : word.endTime;

  if (time >= word.startTime - lookahead && time <= activeEndTime) {
    return 'active';
  }
  if (time > activeEndTime) {
    return 'passed';
  }
  return 'waiting';
}

/* ---------- 词进度（:247-255） ---------- */
function cadenzaGetWordProgress(time, wordRevealMode, word) {
  if (wordRevealMode === 'instant') {
    return time < word.startTime ? 0 : 1;
  }

  var minDuration = wordRevealMode === 'fast' ? 0.045 : 0.01;
  var duration = Math.max(word.endTime - word.startTime, minDuration);
  return cadenzaClamp((time - word.startTime) / duration, 0, 1);
}

/* ---------- 关键帧辉光（:257-267） ---------- */
function cadenzaGetKeyframedGlow(progress) {
  if (progress <= 0 || progress >= 1) {
    return 0;
  }

  if (progress < 0.3) {
    return cadenzaEaseOutCubic(progress / 0.3);
  }

  return 1 - cadenzaClamp((progress - 0.3) / 0.7, 0, 1);
}

/* ---------- 词辉光包络（:269-327 三档全量同构） ---------- */
function cadenzaGetGlowEnvelope(time, lineTiming, word) {
  if (lineTiming.wordRevealMode === 'instant') {
    var activeEndTime = lineTiming.lineRenderEndTime;
    if (time < word.startTime || time > activeEndTime) {
      return 0;
    }

    var pulseProgress = cadenzaClamp((time - word.startTime) / 0.067, 0, 1);
    return cadenzaGetKeyframedGlow(pulseProgress);
  }

  if (lineTiming.wordRevealMode === 'fast') {
    var duration = Math.max(word.endTime - word.startTime, 0.045);

    if (time < word.startTime) {
      return 0;
    }

    if (time <= word.endTime) {
      var progress = cadenzaClamp((time - word.startTime) / duration, 0, 1);

      if (progress < 0.14) {
        return cadenzaEaseOutCubic(progress / 0.14);
      }

      if (progress < 0.82) {
        return 1;
      }

      return cadenzaMix(1, 0.92, (progress - 0.82) / 0.18);
    }

    var fadeOut = cadenzaClamp((time - word.endTime) / 0.14, 0, 1);
    return Math.pow(1 - fadeOut, 2);
  }

  var duration = Math.max(word.endTime - word.startTime, 0.1);

  if (time < word.startTime) {
    return 0;
  }

  if (time <= word.endTime) {
    var progress = cadenzaClamp((time - word.startTime) / duration, 0, 1);

    if (progress < 0.18) {
      return cadenzaEaseOutCubic(progress / 0.18);
    }

    if (progress < 0.9) {
      return 1;
    }

    return cadenzaMix(1, 0.9, (progress - 0.9) / 0.1);
  }

  var fadeOut = cadenzaClamp((time - word.endTime) / 0.9, 0, 1);
  return 0.9 * Math.pow(1 - fadeOut, 2);
}

/* ---------- 逐字辉光（:329-351，graphemeTimings 驱动的 char 扫光） ---------- */
function cadenzaGetCharGlow(time, word, glyphIndex, glyphCount, wordGraphemeTimings) {
  if (wordGraphemeTimings === undefined) wordGraphemeTimings = [];
  var duration = Math.max(word.endTime - word.startTime, 0.1);
  var singleDuration = duration / Math.max(glyphCount, 1);
  var timing = wordGraphemeTimings[glyphIndex];
  var charDuration = timing ? Math.max(timing.endTime - timing.startTime, 0.001) : singleDuration;
  var charStartTime = (timing && timing.startTime !== undefined) ? timing.startTime : (word.startTime + singleDuration * glyphIndex);
  var animationDuration = charDuration * 6;
  var elapsed = time - charStartTime;
  var activeGlow = elapsed <= 0 ? 0 : cadenzaGetKeyframedGlow(elapsed / animationDuration);

  if (time <= word.endTime) {
    return activeGlow;
  }

  var fadeOut = Math.pow(1 - cadenzaClamp((time - word.endTime) / 0.9, 0, 1), 2);
  return activeGlow * fadeOut;
}

/* ---------- 词体混色进度（:353-372） ---------- */
function cadenzaGetBodyMix(time, lineTiming, word) {
  if (lineTiming.wordRevealMode === 'instant') {
    if (time < word.startTime) {
      return 0;
    }

    return time <= lineTiming.lineRenderEndTime ? 1 : 0;
  }

  if (time < word.startTime) {
    return 0;
  }

  if (time <= word.endTime) {
    return cadenzaGetWordProgress(time, lineTiming.wordRevealMode, word);
  }

  var fadeOut = cadenzaClamp((time - word.endTime) / (lineTiming.wordRevealMode === 'fast' ? 0.12 : 0.8), 0, 1);
  return 1 - fadeOut;
}

/* ---------- 整行包络（:374-440 三档进出） ---------- */
function cadenzaGetLineEnvelope(time, line, lineTiming) {
  if (!line) {
    return { opacity: 1, scale: 1, blur: 0 };
  }

  var renderHints = lineTiming.renderHints;
  var lineEndTime = lineTiming.lineRenderEndTime;
  var linePassStart = Math.max(lineTiming.lastWordEndTime, line.startTime) + lineTiming.linePassHold;

  if (renderHints && renderHints.lineTransitionMode === 'none') {
    return { opacity: 1, scale: 1, blur: 0 };
  }

  if (renderHints && renderHints.lineTransitionMode === 'fast') {
    var enterDuration = lineTiming.transitionTiming.enterDuration;
    var exitDuration = lineTiming.transitionTiming.exitDuration;
    var exitStart = Math.max(line.startTime + enterDuration + 0.01, linePassStart, lineEndTime - exitDuration);
    var enterProgress = cadenzaEaseOutCubic(cadenzaClamp((time - line.startTime) / enterDuration, 0, 1));
    var opacity = cadenzaMix(0.65, 1, enterProgress);
    var scale = cadenzaMix(0.97, 1, enterProgress);
    var blur = cadenzaMix(4, 0, enterProgress);

    var exitProgress = cadenzaEaseOutCubic(cadenzaClamp((time - exitStart) / exitDuration, 0, 1));
    if (exitProgress > 0) {
      opacity = cadenzaMix(opacity, 0, exitProgress);
      scale = cadenzaMix(scale, 1.03, exitProgress);
      blur = Math.max(blur, cadenzaMix(0, 6, exitProgress));
    }

    return {
      opacity: cadenzaClamp(opacity, 0, 1),
      scale: scale,
      blur: blur
    };
  }

  var enterDuration = lineTiming.transitionTiming.enterDuration;
  var exitDuration = lineTiming.transitionTiming.exitDuration;
  var preEnter = Math.min(0.1, enterDuration * 0.35);

  var enterProgress = cadenzaEaseOutCubic(cadenzaClamp((time - (line.startTime - preEnter)) / (enterDuration + preEnter), 0, 1));
  var opacity = cadenzaMix(0, 1, enterProgress);
  var scale = cadenzaMix(0.9, 1, enterProgress);
  var blur = cadenzaMix(10, 0, enterProgress);

  var exitStart = Math.max(linePassStart, lineEndTime - exitDuration);
  var exitProgress = cadenzaEaseOutCubic(cadenzaClamp((time - exitStart) / exitDuration, 0, 1));
  if (exitProgress > 0) {
    opacity *= 1 - exitProgress;
    scale = cadenzaMix(scale, 1.1, exitProgress);
    blur = Math.max(blur, cadenzaMix(0, 20, exitProgress));
  }

  return {
    opacity: cadenzaClamp(opacity, 0, 1),
    scale: scale,
    blur: blur
  };
}

/* ---------- passed 漂移进度（:442-448） ---------- */
function cadenzaGetPassedDrift(time, word) {
  if (time <= word.endTime) {
    return 0;
  }

  return cadenzaEaseInOutQuad(cadenzaClamp((time - word.endTime) / 5, 0, 1));
}

/* ---------- 行渲染时序解析（:450-471） ---------- */
function cadenzaResolveLineRenderTiming(line) {
  var renderHints = (line && line.renderHints) ? line.renderHints : null;
  var wordRevealMode = (renderHints && renderHints.wordRevealMode) || 'normal';
  var lastWord = line.words[line.words.length - 1];
  var rawDuration = (renderHints && renderHints.rawDuration != null) ? renderHints.rawDuration : Math.max(line.endTime - line.startTime, 0);
  var transitionTiming = CM_getLineTransitionTiming(
    rawDuration,
    (renderHints && renderHints.lineTransitionMode) || 'normal',
    wordRevealMode
  );

  return {
    renderHints: renderHints,
    lineRenderEndTime: (renderHints && renderHints.renderEndTime != null) ? renderHints.renderEndTime : line.endTime,
    wordRevealMode: wordRevealMode,
    lastWordEndTime: (lastWord && lastWord.endTime != null) ? lastWord.endTime : line.endTime,
    linePassHold: transitionTiming.linePassHold,
    transitionTiming: transitionTiming
  };
}

/* ---------- DOM textShadow 辉光（:473-484；blurScale 形参源码体内未消费，照原样保留） ---------- */
function cadenzaBuildDomTextShadow(color, intensity, blurScale) {
  if (blurScale === undefined) blurScale = 1;
  var glow = cadenzaClamp(intensity, 0, 1.6);
  if (glow <= 0.01) {
    return 'none';
  }

  return [
    '0 0 40px ' + CM_colorWithAlpha(color, Math.min(0.98, glow)),
    '0 0 40px ' + CM_colorWithAlpha(color, Math.min(0.92, glow * 0.92)),
    '0 0 40px ' + CM_colorWithAlpha(color, Math.min(0.35, glow * 0.26))
  ].join(', ');
}

/* ---------- 字号（:486-493） ---------- */
function cadenzaChooseFontPx(width, line) {
  var graphemeCount = cadenzaSplitGraphemes(line.fullText).length || 1;
  var wordCount = line.words.length || 1;
  var widthBase = cadenzaClamp(width * 0.086, 34, 94);
  var lengthPenalty = graphemeCount > 12 ? Math.min((graphemeCount - 12) * 1.8, 34) : 0;
  var densityPenalty = wordCount > 7 ? Math.min((wordCount - 7) * 1.5, 18) : 0;
  return cadenzaClamp(widthBase - lengthPenalty - densityPenalty, 28, 104);
}

/* ---------- canvas 字体串（:495） ---------- */
function cadenzaBuildCanvasFont(theme, fontPx) {
  return CM_resolveThemeFontWeight(theme, 700) + ' ' + fontPx + 'px ' + CM_resolveThemeFontStack(theme);
}

/* ---------- 段元数据（:553-572） ---------- */
function cadenzaBuildSegmentMetas(prepared) {
  var segmentMetas = [];
  var graphemes = [];
  var graphemeCursor = 0;

  for (var i = 0; i < prepared.segments.length; i++) {
    var segment = prepared.segments[i];
    var segmentGraphemes = cadenzaSplitGraphemes(segment);
    segmentMetas.push({
      graphemeStart: graphemeCursor,
      graphemeEnd: graphemeCursor + segmentGraphemes.length,
      graphemeCount: segmentGraphemes.length
    });
    for (var g = 0; g < segmentGraphemes.length; g++) graphemes.push(segmentGraphemes[g]);
    graphemeCursor += segmentGraphemes.length;
  }

  return { segmentMetas: segmentMetas, graphemes: graphemes };
}

/* ---------- 词→grapheme 区间映射（:574-618） ---------- */
function cadenzaFindWordRanges(line, graphemes, theme) {
  var ranges = [];
  var cursor = 0;

  for (var wordIndex = 0; wordIndex < line.words.length; wordIndex++) {
    var word = line.words[wordIndex];
    var target = cadenzaSplitGraphemes(word.text);
    var start = -1;

    for (var i = cursor; i <= graphemes.length - target.length; i++) {
      var isMatch = true;
      for (var j = 0; j < target.length; j++) {
        if (graphemes[i + j] !== target[j]) {
          isMatch = false;
          break;
        }
      }
      if (isMatch) {
        start = i;
        break;
      }
    }

    if (start === -1) {
      start = cadenzaClamp(cursor, 0, graphemes.length);
    }

    var end = cadenzaClamp(start + target.length, start, graphemes.length);

    ranges.push({
      wordIndex: wordIndex,
      word: word,
      start: start,
      end: end,
      color: CM_resolveWordColor(word.text, theme.wordColors, theme.accentColor),
      graphemeTimings: CM_buildWordGraphemeTimings(word)
    });

    cursor = end;
  }

  return ranges;
}

/* ---------- cursor→全局偏移（:620-629） ---------- */
function cadenzaCursorToGlobalOffset(cursor, segmentMetas) {
  if (segmentMetas.length === 0) return 0;
  var segment = segmentMetas[cursor.segmentIndex];

  if (!segment) {
    return segmentMetas[segmentMetas.length - 1].graphemeEnd;
  }

  return cadenzaClamp(segment.graphemeStart + cursor.graphemeIndex, segment.graphemeStart, segment.graphemeEnd);
}

/* ---------- 部分段宽（:631-658） ---------- */
function cadenzaGetPartialSegmentWidth(prepared, segmentIndex, segmentMeta, startOffset, endOffset) {
  var localStart = cadenzaClamp(startOffset - segmentMeta.graphemeStart, 0, segmentMeta.graphemeCount);
  var localEnd = cadenzaClamp(endOffset - segmentMeta.graphemeStart, 0, segmentMeta.graphemeCount);

  if (localEnd <= localStart) return 0;
  if (localStart === 0 && localEnd === segmentMeta.graphemeCount) {
    return prepared.widths[segmentIndex] || 0;
  }

  var breakableFitAdvances = prepared.breakableFitAdvances[segmentIndex];
  if (breakableFitAdvances && breakableFitAdvances.length > 0) {
    var width = 0;
    for (var i = localStart; i < localEnd; i++) {
      width += breakableFitAdvances[i] || 0;
    }
    return width;
  }

  var fullWidth = prepared.widths[segmentIndex] || 0;
  if (segmentMeta.graphemeCount === 0) return fullWidth;
  return fullWidth * ((localEnd - localStart) / segmentMeta.graphemeCount);
}

/* ---------- 偏移间宽（:660-681） ---------- */
function cadenzaWidthBetweenOffsets(prepared, segmentMetas, startOffset, endOffset) {
  if (endOffset <= startOffset) return 0;

  var width = 0;

  for (var segmentIndex = 0; segmentIndex < segmentMetas.length; segmentIndex++) {
    var meta = segmentMetas[segmentIndex];
    if (endOffset <= meta.graphemeStart) break;
    if (startOffset >= meta.graphemeEnd) continue;

    var sliceStart = Math.max(startOffset, meta.graphemeStart);
    var sliceEnd = Math.min(endOffset, meta.graphemeEnd);
    width += cadenzaGetPartialSegmentWidth(prepared, segmentIndex, meta, sliceStart, sliceEnd);
  }

  return width;
}

/* ---------- 行碎片（:683-754） ---------- */
function cadenzaBuildLineFragments(prepared, segmentMetas, graphemes, layout, ranges) {
  var lineViews = [];
  for (var li = 0; li < layout.lines.length; li++) {
    var line = layout.lines[li];
    var lineStart = cadenzaCursorToGlobalOffset(line.start, segmentMetas);
    var lineEnd = cadenzaCursorToGlobalOffset(line.end, segmentMetas);

    var fragments = [];
    for (var r = 0; r < ranges.length; r++) {
      var range = ranges[r];
      if (range.end <= lineStart || range.start >= lineEnd) {
        continue;
      }

      var fragmentStart = Math.max(range.start, lineStart);
      var fragmentEnd = Math.min(range.end, lineEnd);
      fragments.push({
        wordIndex: range.wordIndex,
        lineIndex: 0,
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

    lineViews.push({ line: line, lineStart: lineStart, lineEnd: lineEnd, fragments: fragments });
  }

  var fragmentCountByWord = new Map();
  lineViews.forEach(function (lineView) {
    lineView.fragments.forEach(function (fragment) {
      fragmentCountByWord.set(
        fragment.wordIndex,
        (fragmentCountByWord.get(fragment.wordIndex) || 0) + 1
      );
    });
  });

  var seenFragmentsByWord = new Map();

  return lineViews.map(function (lineView, lineIndex) {
    return {
      line: lineView.line,
      lineStart: lineView.lineStart,
      lineEnd: lineView.lineEnd,
      fragments: lineView.fragments.map(function (fragment) {
        var fragmentCountInWord = fragmentCountByWord.get(fragment.wordIndex) || 1;
        var fragmentIndexInWord = seenFragmentsByWord.get(fragment.wordIndex) || 0;
        seenFragmentsByWord.set(fragment.wordIndex, fragmentIndexInWord + 1);

        fragment.lineIndex = lineIndex;
        fragment.fragmentIndexInWord = fragmentIndexInWord;
        fragment.fragmentCountInWord = fragmentCountInWord;
        fragment.isPrimaryFragment = fragmentIndexInWord === 0;
        fragment.isSplitAcrossLines = fragmentCountInWord > 1;
        return fragment;
      })
    };
  });
}

/* ---------- emphasis 图（:756-798） ---------- */
function cadenzaBuildEmphasisMap(lineData, isInterlude) {
  var emphasisMap = new Map();

  if (isInterlude) {
    return emphasisMap;
  }

  var primaryFragments = [];
  lineData.forEach(function (lineView) {
    lineView.fragments.forEach(function (fragment) {
      if (fragment.isPrimaryFragment) primaryFragments.push(fragment);
    });
  });

  /* 换行切断的词碎片不得共享 hero 放置（源注释 :775-777） */
  var candidates = primaryFragments
    .filter(function (fragment) { return !fragment.isSplitAcrossLines && fragment.text.trim().length > 0; })
    .map(function (fragment) {
      var graphemeCount = Math.max(fragment.wordGraphemeCount, cadenzaSplitGraphemes(fragment.word.text).length, 1);
      var semanticWeight = cadenzaIsCJK(fragment.word.text) ? 0.18 : Math.min(graphemeCount * 0.08, 0.36);
      var centerBias = 1 - Math.abs(fragment.wordIndex - (primaryFragments.length - 1) / 2) / Math.max(primaryFragments.length, 1);
      return {
        fragment: fragment,
        score: semanticWeight + centerBias * 0.18
      };
    })
    .sort(function (a, b) { return b.score - a.score; });

  var hero = candidates[0];
  if (hero) {
    var scoreBoost = 1 + cadenzaClamp(hero.score - 0.48, 0, 0.52);
    emphasisMap.set(hero.fragment.wordIndex, 1.46 * scoreBoost);
  }

  return emphasisMap;
}

/* ---------- 词放置（:800-1108 全量同构，含碰撞 band 加速结构） ---------- */
function cadenzaBuildWordPlacements(lineData, fontPx, lineHeight, maxWidth, animationIntensity, seed, isInterlude) {
  var totalHeight = Math.max(lineData.length, 1) * lineHeight;
  var baseMargin = animationIntensity === 'calm' ? 4 : 6;
  var baseScale = animationIntensity === 'chaotic'
    ? 1.02
    : animationIntensity === 'calm'
      ? 1
      : 1.01;
  var emphasisMap = cadenzaBuildEmphasisMap(lineData, isInterlude);
  var heroWordIndex = null;
  var heroEntries = Array.from(emphasisMap.entries()).sort(function (a, b) { return b[1] - a[1]; });
  if (heroEntries.length) heroWordIndex = heroEntries[0][0];

  var placements = [];
  var occupiedRects = [];
  var occupiedBands = new Map();
  var occupiedMarks = [];
  var occupiedQueryStamp = 0;
  var collisionBandSize = Math.max(24, Math.round(lineHeight * 0.9));

  var getBandIndex = function (value) { return Math.floor(value / collisionBandSize); };
  var registerOccupiedRect = function (rect) {
    var rectIndex = occupiedRects.length;
    occupiedRects.push(rect);

    var startBand = getBandIndex(rect.top);
    var endBand = getBandIndex(rect.bottom);
    for (var band = startBand; band <= endBand; band++) {
      var bucket = occupiedBands.get(band);
      if (bucket) {
        bucket.push(rectIndex);
      } else {
        occupiedBands.set(band, [rectIndex]);
      }
    }
  };
  var evaluateCollisionRect = function (left, top, right, bottom) {
    if (occupiedRects.length === 0) {
      return { intersects: false, overlapArea: 0 };
    }

    occupiedQueryStamp += 1;
    var stamp = occupiedQueryStamp;
    var startBand = getBandIndex(top);
    var endBand = getBandIndex(bottom);
    var intersects = false;
    var overlapArea = 0;

    for (var band = startBand; band <= endBand; band++) {
      var bucket = occupiedBands.get(band);
      if (!bucket) continue;

      for (var bucketIndex = 0; bucketIndex < bucket.length; bucketIndex++) {
        var rectIndex = bucket[bucketIndex];
        if (occupiedMarks[rectIndex] === stamp) {
          continue;
        }
        occupiedMarks[rectIndex] = stamp;

        var rect = occupiedRects[rectIndex];
        var overlapWidth = Math.max(0, Math.min(right, rect.right) - Math.max(left, rect.left));
        var overlapHeight = Math.max(0, Math.min(bottom, rect.bottom) - Math.max(top, rect.top));
        if (overlapWidth <= 0 || overlapHeight <= 0) {
          continue;
        }

        intersects = true;
        overlapArea += overlapWidth * overlapHeight;
      }
    }

    return { intersects: intersects, overlapArea: overlapArea };
  };
  var pushPlacementRect = function (left, top, width, height, padding) {
    registerOccupiedRect({
      left: left - padding,
      top: top - height - padding,
      right: left + width + padding,
      bottom: top + padding
    });
  };

  var placementPlans = [];
  lineData.forEach(function (lineView, lineIndex) {
    var lineLeft = -lineView.line.width / 2;
    var baselineY = -totalHeight / 2 + fontPx + lineIndex * lineHeight;

    lineView.fragments.forEach(function (fragment, fragmentIndex) {
      var emphasis = emphasisMap.get(fragment.wordIndex) || 1;
      var width = Math.max(fragment.endX - fragment.startX, fontPx * 0.18);
      var scale = emphasis > 1 ? baseScale * emphasis : baseScale;
      var height = fontPx * scale * 0.95;

      placementPlans.push({
        fragment: fragment,
        lineIndex: lineIndex,
        fragmentIndex: fragmentIndex,
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
    });
  });
  placementPlans.sort(function (a, b) {
    var emphasisDelta = b.emphasis - a.emphasis;
    if (Math.abs(emphasisDelta) > 0.001) {
      return emphasisDelta;
    }
    if (a.lineIndex !== b.lineIndex) {
      return a.lineIndex - b.lineIndex;
    }
    return a.fragment.startX - b.fragment.startX;
  });

  var primaryPlanByWordIndex = new Map();
  placementPlans.forEach(function (plan) {
    if (!primaryPlanByWordIndex.has(plan.fragment.wordIndex)) {
      primaryPlanByWordIndex.set(plan.fragment.wordIndex, plan);
    }
  });
  var heroPlan = heroWordIndex === null ? null : (primaryPlanByWordIndex.get(heroWordIndex) || null);
  var heroMetrics = heroPlan
    ? {
      centerX: (heroPlan.width * heroPlan.scale) / 2,
      centerY: -heroPlan.height * 0.46,
      width: heroPlan.width * heroPlan.scale
    }
    : null;

  placementPlans.forEach(function (plan) {
    var fragment = plan.fragment, lineIndex = plan.lineIndex, fragmentIndex = plan.fragmentIndex;
    var emphasis = plan.emphasis, width = plan.width, height = plan.height, scale = plan.scale;
    var collisionWidth = plan.collisionWidth, collisionHeight = plan.collisionHeight, padding = plan.padding;
    var wordSeed = seed + fragment.wordIndex * 17 + lineIndex * 31 + fragmentIndex * 13;
    var random = function (offset) {
      var x = Math.sin(wordSeed + offset) * 10000;
      return x - Math.floor(x);
    };
    var rotate = 0;
    var passedRotate = (random(3) - 0.5) * (animationIntensity === 'chaotic' ? 20 : 12);
    var entryOffsetX = 0;
    var entryOffsetY = 0;
    var step = Math.max(10, Math.round(fontPx * 0.14));
    var maxRadius = emphasis > 1
      ? Math.max(20, lineHeight * 0.5)
      : Math.max(lineHeight * 2.2, collisionWidth * 0.75, 56);
    var preferredX = emphasis > 1 ? -width / 2 : plan.baseX;
    var preferredY = emphasis > 1 ? 0 : plan.baseY;

    if (!isInterlude && emphasis <= 1 && heroMetrics) {
      var wordCenterX = preferredX + width / 2;
      var wordCenterY = preferredY - height * 0.46;
      var dx = wordCenterX - heroMetrics.centerX;
      var dy = wordCenterY - heroMetrics.centerY;
      var distance = Math.hypot(dx, dy);
      if (distance < 1) {
        dx = preferredX >= 0 ? 1 : -1;
        dy = lineIndex % 2 === 0 ? -0.65 : 0.65;
      }
      var minHeroSeparation = heroMetrics.width * 0.34 + width * 0.52 + padding * 2;
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
    var bestFallback = {
      x: preferredX,
      y: preferredY,
      score: Number.POSITIVE_INFINITY
    };
    var baseAngle = heroMetrics && emphasis <= 1
      ? Math.atan2(preferredY, preferredX + width / 2)
      : 0;

    for (var radius = 0; radius <= maxRadius && !found; radius += step) {
      var sampleCount = radius === 0
        ? 1
        : emphasis > 1
          ? 8
          : Math.max(12, Math.round((Math.PI * 2 * radius) / Math.max(step * 1.1, 10)));
      var candidates = radius === 0
        ? [[0, 0]]
        : (function () {
          var arr = [];
          for (var sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
            var angle = baseAngle + (sampleIndex / sampleCount) * Math.PI * 2;
            var ellipseY = radius * (emphasis > 1 ? 0.8 : 0.92);
            arr.push([Math.cos(angle) * radius, Math.sin(angle) * ellipseY]);
          }
          return arr;
        })();

      for (var ci = 0; ci < candidates.length; ci++) {
        var dx = candidates[ci][0];
        var dy = candidates[ci][1];
        var left = preferredX + dx - padding;
        var top = preferredY + dy - collisionHeight - padding;
        var right = left + collisionWidth + padding * 2;
        var bottom = top + collisionHeight + padding * 2;
        var withinBounds = left >= horizontalMin
          && right <= horizontalMax
          && top >= verticalMin
          && bottom <= verticalMax;
        if (!withinBounds) {
          continue;
        }

        var collision = evaluateCollisionRect(left, top, right, bottom);
        var travel = Math.hypot(dx, dy);
        var score = collision.overlapArea * 2.2 + travel;
        if (score < bestFallback.score) {
          bestFallback = {
            x: preferredX + dx,
            y: preferredY + dy,
            score: score
          };
        }

        if (!collision.intersects) {
          chosenX = preferredX + dx;
          chosenY = preferredY + dy;
          pushPlacementRect(chosenX, chosenY, collisionWidth, collisionHeight, padding);
          found = true;
          break;
        }
      }
    }

    if (!found) {
      chosenX = bestFallback.x;
      chosenY = bestFallback.y;
      pushPlacementRect(chosenX, chosenY, collisionWidth, collisionHeight, padding);
    }

    var outwardX = chosenX + width / 2;
    var outwardY = chosenY - height * 0.46;
    var outwardLength = Math.max(Math.hypot(outwardX, outwardY), 1);
    var outwardUnitX = outwardX / outwardLength;
    var outwardUnitY = outwardY / outwardLength;
    var driftAmount = isInterlude
      ? 3 + random(6) * 3
      : emphasis > 1
        ? 4 + random(6) * 4
        : animationIntensity === 'chaotic'
          ? 8 + random(6) * 9
          : 5 + random(6) * 6;
    var passedDriftX = outwardUnitX * driftAmount + (random(7) - 0.5) * 2.4;
    var passedDriftY = outwardUnitY * driftAmount * 0.72 + (random(8) - 0.5) * 2;

    placements.push({
      id: fragment.word.text + '-' + fragment.wordIndex + '-' + lineIndex + '-' + fragmentIndex + '-' + fragment.fragmentIndexInWord,
      wordIndex: fragment.wordIndex,
      word: fragment.word,
      text: fragment.text,
      color: fragment.color,
      x: chosenX,
      y: chosenY,
      width: width,
      height: height,
      rotate: rotate,
      scale: scale,
      passedRotate: passedRotate,
      passedDriftX: passedDriftX,
      passedDriftY: passedDriftY,
      entryOffsetX: entryOffsetX,
      entryOffsetY: entryOffsetY,
      fragmentStartInWord: fragment.fragmentStartInWord,
      fragmentEndInWord: fragment.fragmentEndInWord,
      wordGraphemeCount: fragment.wordGraphemeCount,
      wordGraphemeTimings: fragment.wordGraphemeTimings,
      emphasis: emphasis,
      isInterlude: isInterlude
    });
  });

  return placements;
}

/* ---------- 预备态构建（:497-547；pretext 测量/换行走全局 bundle） ---------- */
function cadenzaBuildPreparedState(line, context) {
  var showText = context.showText, viewport = context.viewport, theme = context.theme, tuning = context.tuning;

  if (!showText || viewport.width <= 0 || viewport.height <= 0) {
    return null;
  }

  var fontPx = cadenzaClamp(cadenzaChooseFontPx(viewport.width, line) * tuning.fontScale, 24, 132);
  var font = cadenzaBuildCanvasFont(theme, fontPx);
  var prepared = pretext.prepareWithSegments(line.fullText, font);
  var text = prepared.segments.join('');
  var metas = cadenzaBuildSegmentMetas(prepared);
  var segmentMetas = metas.segmentMetas;
  var graphemes = metas.graphemes;
  var lineHeight = Math.round(fontPx * (cadenzaIsCJK(text) ? 1.22 : 1.1));
  var availableWidth = Math.max(viewport.width - 48, 120);
  var minWidth = Math.min(220, availableWidth);
  var wrapCompression = graphemes.length > 12
    ? cadenzaClamp(0.92 - (graphemes.length - 12) * 0.018, 0.62, 0.92)
    : 0.92;
  var compactWidthRatio = tuning.widthRatio * wrapCompression;
  var maxWidth = cadenzaClamp(Math.min(viewport.width * compactWidthRatio, 820), minWidth, availableWidth);
  var layout = pretext.layoutWithLines(prepared, maxWidth, lineHeight);
  var ranges = cadenzaFindWordRanges(line, graphemes, theme);
  var lineFragments = cadenzaBuildLineFragments(prepared, segmentMetas, graphemes, layout, ranges);
  var placements = cadenzaBuildWordPlacements(
    lineFragments,
    fontPx,
    lineHeight,
    maxWidth,
    theme.animationIntensity,
    line.startTime * 1000,
    line.fullText === '......'
  );

  return {
    prepared: prepared,
    text: text,
    font: font,
    fontPx: fontPx,
    lineHeight: lineHeight,
    maxWidth: maxWidth,
    layout: layout,
    segmentMetas: segmentMetas,
    graphemes: graphemes,
    placements: placements
  };
}

/* ---------- Canvas 绘制函数（:1110-1266。
   注：源码定义了 drawRoundedRect/drawActiveBeam/drawShadowGlowText/
   chosenAngleForEntry/drawGlowTrailText 五个绘制函数，当前主循环仅消费
   canvas 涟漪弧（:1569-1584）——其余为源码级未调用（dead in source），
   忠实保留以维持代码结构同构，不参与运行时。 ---------- */
function cadenzaDrawRoundedRect(ctx, x, y, width, height, radius) {
  var r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function cadenzaDrawActiveBeam(ctx, x, y, width, height, color, energy, beamIntensity) {
  if (beamIntensity <= 0.01) {
    return;
  }

  var intensity = cadenzaClamp(beamIntensity, 0, 1.2);
  var beamHeight = Math.max(2, height * (0.05 + energy * 0.03) * Math.max(intensity, 0.12));
  var beamY = y + height * 0.78;
  var gradient = ctx.createLinearGradient(x, beamY, x + width, beamY);
  gradient.addColorStop(0, CM_colorWithAlpha(color, 0));
  gradient.addColorStop(0.2, CM_colorWithAlpha(color, (0.16 + energy * 0.06) * intensity));
  gradient.addColorStop(0.8, CM_colorWithAlpha(color, (0.16 + energy * 0.06) * intensity));
  gradient.addColorStop(1, CM_colorWithAlpha(color, 0));
  ctx.fillStyle = gradient;
  cadenzaDrawRoundedRect(ctx, x, beamY, width, beamHeight, beamHeight / 2);
  ctx.fill();

  if (intensity > 0.42) {
    ctx.fillStyle = CM_colorWithAlpha(color, 0.22 * intensity);
    ctx.beginPath();
    ctx.arc(x + 2, beamY + beamHeight / 2, beamHeight / 1.8, 0, Math.PI * 2);
    ctx.arc(x + width - 2, beamY + beamHeight / 2, beamHeight / 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function cadenzaDrawShadowGlowText(ctx, text, x, y, color, blur, intensity) {
  if (intensity <= 0 || blur <= 0 || !text) {
    return;
  }

  var glowStrength = cadenzaClamp(intensity, 0, 2.6);
  var blurScale = Math.max(blur / 20, 0.85);
  /* 整像素量化（glowBlurQuantize）：blur 随能量逐帧变化会在 Chromium 字形缓存泄漏共享内存 */
  var innerBlur = CM_quantizeShadowBlur(20 * blurScale);
  var outerBlur = CM_quantizeShadowBlur(40 * blurScale);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  ctx.shadowColor = CM_colorWithAlpha(color, Math.min(0.98, 0.76 + glowStrength * 0.1));
  ctx.shadowBlur = innerBlur;
  ctx.fillStyle = CM_colorWithAlpha(color, 0.11 * glowStrength);
  ctx.fillText(text, x, y);

  ctx.shadowColor = CM_colorWithAlpha(color, Math.min(0.88, 0.42 + glowStrength * 0.1));
  ctx.shadowBlur = outerBlur;
  ctx.fillStyle = CM_colorWithAlpha(color, 0.075 * glowStrength);
  ctx.fillText(text, x, y);

  ctx.shadowColor = CM_colorWithAlpha(color, Math.min(0.42, 0.18 + glowStrength * 0.06));
  ctx.shadowBlur = CM_quantizeShadowBlur(outerBlur * 1.45);
  ctx.fillStyle = CM_colorWithAlpha(color, 0.018 * glowStrength);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function cadenzaChosenAngleForEntry(first, second, seed) { return (first * 0.015) + (second * 0.008) + seed * 0.13; }

function cadenzaDrawGlowTrailText(ctx, placement, x, y, progress, color, energy, glowAlpha, glowIntensity) {
  if (glowAlpha <= 0.01 || glowIntensity <= 0.01 || !placement.text) {
    return;
  }

  var graphemes = cadenzaSplitGraphemes(placement.text);
  if (graphemes.length <= 1 || cadenzaIsCJK(placement.text)) {
    var wordGlow = (0.95 + Math.min(progress, 0.4) * 0.35) * glowIntensity;
    cadenzaDrawShadowGlowText(
      ctx,
      placement.text,
      x,
      y,
      color,
      (24 + energy * 16) * Math.max(glowIntensity, 0.45),
      wordGlow
    );
    return;
  }

  var totalGraphemeCount = Math.max(placement.wordGraphemeCount, graphemes.length);
  var head = cadenzaClamp(progress, 0, 1) * (totalGraphemeCount + 0.35);
  var cursorX = x;

  graphemes.forEach(function (grapheme, graphemeIndex) {
    var absoluteIndex = placement.fragmentStartInWord + graphemeIndex;
    var distanceFromHead = head - absoluteIndex;
    var measure = ctx.measureText(grapheme);

    if (distanceFromHead > -0.75 && distanceFromHead < 5.2) {
      var lead = cadenzaClamp(1 - Math.abs(distanceFromHead - 0.2) / 0.9, 0, 1);
      var tail = distanceFromHead >= 0 ? cadenzaClamp(1 - distanceFromHead / 4.4, 0, 1) : 0;
      var shimmer = cadenzaClamp(0.18 + lead * 0.92 + tail * 0.45, 0, 1.35);
      var blur = (18 + energy * 16) * (0.75 + lead * 0.9 + tail * 0.45) * Math.max(glowIntensity, 0.45);

      cadenzaDrawShadowGlowText(
        ctx,
        grapheme,
        cursorX,
        y,
        color,
        blur,
        shimmer * glowIntensity
      );
    }

    cursorX += measure.width;
  });
}

/* ---------- Overlay 词节点池（:136-201 原样；tailwind 类 → inline style 等价） ---------- */
function cadenzaCreateOverlayWordNodes() {
  var outer = document.createElement('div');
  outer.className = 'cz-word';
  /* tailwind 'absolute left-0 top-0' */
  outer.style.position = 'absolute';
  outer.style.left = '0';
  outer.style.top = '0';
  outer.setAttribute('aria-hidden', 'true');

  var inner = document.createElement('div');
  /* tailwind 'whitespace-nowrap' */
  inner.style.whiteSpace = 'nowrap';
  inner.style.lineHeight = '1';
  inner.style.display = 'inline-block';
  inner.style.position = 'relative';

  var body = document.createElement('span');
  body.style.lineHeight = '1';
  body.style.display = 'block';
  body.style.position = 'relative';
  body.style.zIndex = '1';
  body.style.whiteSpace = 'pre';

  var glow = document.createElement('span');
  glow.style.color = 'transparent';
  glow.style.lineHeight = '1';
  glow.style.display = 'block';
  glow.style.position = 'absolute';
  glow.style.inset = '0';
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
    glyphSignature: ''
  };
}

function cadenzaSyncOverlayGlyphSpans(nodes, texts) {
  var glyphSignature = texts.join('\u0001');
  if (nodes.glyphSignature === glyphSignature) {
    return;
  }

  nodes.glow.replaceChildren();
  nodes.glyphSpans = texts.map(function (text) {
    var span = document.createElement('span');
    span.textContent = text;
    span.style.color = 'transparent';
    span.style.lineHeight = '1';
    nodes.glow.appendChild(span);
    return span;
  });
  nodes.glyphSignature = glyphSignature;
}

function cadenzaClearOverlayWordNodes(overlayNodes) {
  overlayNodes.forEach(function (nodes) {
    nodes.outer.remove();
  });
  overlayNodes.clear();
}

/* ---------- runtime.ts 纯函数等价 ---------- */

/* getRecentCompletedLine（runtime.ts:35-52） */
function cadenzaGetRecentCompletedLine(lines, currentLineIndex, currentTime, getLineEndTime) {
  if (currentLineIndex !== -1 || !lines || lines.length === 0) return null;
  for (var i = lines.length - 1; i >= 0; i--) {
    if (currentTime > getLineEndTime(lines[i])) return lines[i];
  }
  return null;
}

/* getUpcomingLine（runtime.ts:56-73） */
function cadenzaGetUpcomingLine(lines, currentLineIndex, currentTime) {
  var activeLine = lines[currentLineIndex];
  if (activeLine) {
    return lines[currentLineIndex + 1] || null;
  }

  for (var i = 0; i < lines.length; i++) {
    if (lines[i].startTime > currentTime) {
      return lines[i];
    }
  }

  return null;
}

/* getUpcomingLines（runtime.ts:76-86） */
function cadenzaGetUpcomingLines(lines, currentLineIndex, count) {
  if (currentLineIndex < 0) return [];
  return lines.slice(currentLineIndex + 1, currentLineIndex + 1 + count);
}

/* prepareActiveAndUpcoming（runtime.ts:107-120） */
function cadenzaPrepareActiveAndUpcoming(activeLine, upcomingLine, prepareLine) {
  if (!activeLine) {
    prepareLine(upcomingLine);
    return null;
  }

  var currentState = prepareLine(activeLine);
  prepareLine(upcomingLine);
  return currentState;
}

/* findLatestActiveLineIndex（appPlaybackHelpers.ts:21-31）——Folia 宿主 currentLineIndex 权威语义 */
function cadenzaFindLineIndexAtTime(lines, time) {
  for (var index = (lines ? lines.length : 0) - 1; index >= 0; index--) {
    var line = lines[index];
    if (!line || time < line.startTime) continue;
    if (time <= ((line.renderHints && line.renderHints.renderEndTime != null) ? line.renderHints.renderEndTime : line.endTime)) {
      return index;
    }
  }
  return -1;
}

/* ---------- 字幕（VisualizerSubtitleOverlay.tsx :20 / :48-80 / :132-215 + subtitleTrackStyle 常量；
   MineRadio 无 romanization/alternateTexts → 单 translation 轨，与 classic 落地同型） ---------- */
function cadenzaHasReadableText(text) {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

var CADENZA_SECONDARY_TRACK_SIZE_FACTOR = 0.88;
var CADENZA_SECONDARY_TRACK_OPACITY = 0.82;
var CADENZA_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK = 400;
var CADENZA_SECONDARY_TRACK_GAP_EM = 0.25;

/* ---------- DOM 工具 ---------- */

function cadenzaEl(tag, className, styleText) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (styleText) el.style.cssText = styleText;
  return el;
}

/**
 * CadenzaCadenzaEngine(opts) —— cadenza 模式渲染引擎（VisualizerCadenza.tsx 组件树的宿主等价）
 * opts: { host, lines, currentTime(MV 秒), audioPower(MV 0..255), theme, tuning?,
 *         lyricsFontScale?, showText?, hideTranslationSubtitle?, showSubtitleTranslation? }
 * 返回 { destroy, setLines, setTheme, setFontScale, setTuning }
 */
function CadenzaCadenzaEngine(opts) {
  var host = opts.host;
  var lines = opts.lines || [];
  var theme = opts.theme;
  /* entry.tsx:17-20 —— fontScale × lyricsFontScale 的模式内适配 */
  var lyricsFontScale = opts.lyricsFontScale != null ? opts.lyricsFontScale : 1;
  var tuning = (function resolveTuning(t) {
    var base = (t && t.fontScale != null) ? t : CADENZA_DEFAULT_TUNING;
    return {
      /* 与 setFontScale/setTuning 同语义：入口 fontScale 必须乘 lyricsFontScale
         （原版 entry.tsx:19 fontScale × lyricsFontScale——漏乘会让自定义字号
         倍率≠1 的初始挂载字号偏离，直到首次热更才被修正） */
      fontScale: ((base.fontScale != null ? base.fontScale : CADENZA_DEFAULT_TUNING.fontScale)) * lyricsFontScale,
      widthRatio: (base.widthRatio != null ? base.widthRatio : CADENZA_DEFAULT_TUNING.widthRatio),
      motionAmount: (base.motionAmount != null ? base.motionAmount : CADENZA_DEFAULT_TUNING.motionAmount),
      glowIntensity: (base.glowIntensity != null ? base.glowIntensity : CADENZA_DEFAULT_TUNING.glowIntensity),
      beamIntensity: (base.beamIntensity != null ? base.beamIntensity : CADENZA_DEFAULT_TUNING.beamIntensity)
    };
  })(opts.tuning);
  var showText = opts.showText !== false;
  var hideTranslationSubtitle = !!opts.hideTranslationSubtitle;
  var showSubtitleTranslation = opts.showSubtitleTranslation !== false;

  var currentTime = opts.currentTime;
  var audioPower = opts.audioPower || { get: function () { return 0; } };

  var destroyed = false;
  var rafId = 0;
  var lastFrameTime = null;

  /* ---------- 壳（VisualizerShell :128-134 等价：字体/字重 inline） ---------- */
  var shell = cadenzaEl('div', 'cz-shell');
  shell.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;font-family:' +
    CM_resolveThemeFontStack(theme) + ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) + ';';

  /* lineLayer（:1689-1702：inline 初始样式 + transformOrigin 50% 42% + perspective 1000px） */
  var lineLayer = cadenzaEl('div', 'cz-layer');
  lineLayer.style.cssText = 'position:absolute;inset:0;z-index:10;pointer-events:none;opacity:0;filter:none;transform:scale(1);transform-origin:50% 42%;perspective:1000px;';

  /* overlay 词池（:1700）+ canvas（:1701） */
  var overlay = cadenzaEl('div', 'cz-overlay');
  overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;user-select:none;';
  var textCanvas = cadenzaEl('canvas', 'cz-canvas');
  textCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  lineLayer.appendChild(overlay);
  lineLayer.appendChild(textCanvas);

  /* 空态容器（:1704 relative z-10 w-full h-[70vh] flex items-center justify-center p-8） */
  var emptyWrap = cadenzaEl('div', 'cz-empty-wrap');
  emptyWrap.style.cssText = 'position:relative;z-index:10;width:100%;height:70vh;display:flex;align-items:center;justify-content:center;padding:32px;pointer-events:none;';
  /* 空态（:1706-1720 AnimatePresence initial{opacity:0} animate{opacity:1} exit{opacity:0}） */
  var emptyEl = cadenzaEl('div', 'cz-empty');
  emptyEl.style.cssText = 'position:absolute;font-size:2rem;opacity:0;transition:opacity 0.3s ease;color:' +
    (theme.secondaryColor || theme.primaryColor) + ';';
  emptyEl.textContent = '等待音乐 · · ·';
  emptyWrap.appendChild(emptyEl);

  /* 底部字幕（VisualizerSubtitleOverlay :132-215 等价） */
  var sub = cadenzaEl('div', 'cz-sub');
  /* bottom：底栏（#bottom-bar bottom:16px + 自身高 ≈96px）上方留 20px——
     Folia 侧由 usePlayerSubtitleBottomPx 按底栏基线换算，此处对齐本项目底栏几何 */
  sub.style.cssText = 'position:absolute;left:0;right:0;bottom:132px;text-align:center;padding:0 16px;z-index:20;pointer-events:none;opacity:0;transform:translateY(20px);';

  shell.appendChild(lineLayer);
  shell.appendChild(emptyWrap);
  shell.appendChild(sub);
  host.appendChild(shell);

  var textContext = textCanvas.getContext('2d');
  var subtitleSizes = CM_resolveSubtitleFontSizes(lyricsFontScale);

  /* ---------- viewport（:1374-1389 ResizeObserver 等价） ---------- */
  var viewport = { width: 0, height: 0 };
  var observer = null;
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(function (entries) {
      var entry = entries[0];
      if (!entry) return;
      viewport.width = entry.contentRect.width;
      viewport.height = entry.contentRect.height;
    });
    observer.observe(shell);
  } else {
    var syncViewportFallback = function () {
      viewport.width = host.clientWidth || 0;
      viewport.height = host.clientHeight || 0;
    };
    syncViewportFallback();
    window.addEventListener('resize', syncViewportFallback);
  }

  /* ---------- preparedState 缓存（:1296-1298/:1326-1420 等价） ---------- */
  var preparedStateCache = new Map();
  var preparedStateCacheContextKey = null;
  var animatedPlacementStates = new Map();
  var overlayNodes = new Map();

  /* contextKey 组成（:1326-1346 同构） */
  function getPreparedStateContextKey() {
    var wordColorSignature = (theme.wordColors || [])
      .map(function (entry) {
        return (entry && typeof entry.word === 'string' ? entry.word : '') + ':' + (entry && typeof entry.color === 'string' ? entry.color : '');
      })
      .join('||');

    return [
      showText ? '1' : '0',
      viewport.width,
      viewport.height,
      theme.fontStyle,
      theme.fontFamily || '',
      (theme.fontFamilyStack || []).join(','),
      theme.fontWeight != null ? theme.fontWeight : 'auto',
      theme.animationIntensity,
      theme.accentColor,
      tuning.fontScale,
      tuning.widthRatio,
      wordColorSignature
    ].join('|');
  }

  /* 行缓存 key（:1367-1372） */
  function getPreparedStateCacheKey(line) {
    return [line.startTime, line.endTime, line.fullText, line.words.length].join('|');
  }

  /* preparedState memo（:1391-1420 等价：缓存命中即返回，未命中 build 后入缓存；
     showText 关闭时仅预热 upcoming 并返回 null） */
  function getOrPrepareState(line) {
    if (!line) return null;
    var cacheKey = getPreparedStateCacheKey(line);
    var cached = preparedStateCache.get(cacheKey);
    if (cached) return cached;

    var nextState = cadenzaBuildPreparedState(line, {
      showText: showText,
      viewport: viewport,
      theme: theme,
      tuning: { fontScale: tuning.fontScale, widthRatio: tuning.widthRatio }
    });
    if (nextState) {
      preparedStateCache.set(cacheKey, nextState);
    }
    return nextState;
  }

  function computePreparedState(activeLine, upcomingLine) {
    var contextKey = getPreparedStateContextKey();
    if (preparedStateCacheContextKey !== contextKey) {
      preparedStateCache.clear();
      preparedStateCacheContextKey = contextKey;
    }

    if (!showText || viewport.width <= 0 || viewport.height <= 0) {
      getOrPrepareState(upcomingLine);
      return null;
    }

    return cadenzaPrepareActiveAndUpcoming(activeLine, upcomingLine, getOrPrepareState);
  }

  /* ---------- 底部字幕（VisualizerSubtitleOverlay :48-80/:132-215 等价） ---------- */
  var subtitleKey = null;
  function renderSubtitle(activeLine, recentCompletedLine, nextLines) {
    var shouldRender = showText && !hideTranslationSubtitle;
    var translation = null;
    if (shouldRender) {
      var candidates = [activeLine, recentCompletedLine];
      for (var i = 0; i < candidates.length; i++) {
        var line = candidates[i];
        var text = line && line.translation ? String(line.translation) : '';
        if (text && cadenzaHasReadableText(text)) { translation = text; break; }
      }
    }
    var upcoming = [];
    if (shouldRender && !translation && activeLine) {
      upcoming = (nextLines || []).filter(function (l) { return cadenzaHasReadableText(l.fullText); });
    }

    var key = translation ? 't:' + translation : (upcoming.length ? 'u:' + upcoming.map(function (l) { return l.startTime; }).join('|') : null);
    if (key === subtitleKey) return;

    /* 容器 AnimatePresence（:134-146）：显隐 opacity/y 0.24s easeOut */
    if (!key) {
      subtitleKey = null;
      mmApplyVariant(sub, {
        exit: { opacity: 0, y: 20, transition: { duration: 0.24, ease: 'easeOut' } }
      }, 'exit', null);
      return;
    }
    subtitleKey = key;
    sub.innerHTML = '';
    var content = cadenzaEl('div');
    content.style.cssText = 'position:relative;display:inline-block;padding:2px 6px;';

    if (translation) {
      var glowBg = cadenzaEl('div');
      glowBg.setAttribute('aria-hidden', 'true');
      glowBg.style.cssText = 'position:absolute;left:-40px;right:-40px;top:-24px;bottom:-24px;z-index:0;filter:blur(24px);' +
        'background:radial-gradient(ellipse 115% 130% at center, ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.96) + ' 0%, ' +
        CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.78) + ' 62%, transparent 100%);';
      content.appendChild(glowBg);
      var transEl = cadenzaEl('div');
      transEl.style.cssText = 'position:relative;z-index:10;max-width:56rem;margin:0 auto;color:' + (theme.secondaryColor || theme.primaryColor) +
        ';font-size:' + subtitleSizes.translationFontSize + ';text-shadow:0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.24) + ';';
      transEl.textContent = translation;
      content.appendChild(transEl);
    } else {
      var upWrap = cadenzaEl('div');
      upWrap.style.cssText = 'position:relative;z-index:10;display:flex;flex-direction:column;gap:8px;align-items:center;';
      for (var u = 0; u < upcoming.length; u++) {
        var p = cadenzaEl('p');
        p.style.cssText = 'margin:0;max-width:42rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:all .5s ease;filter:blur(1px);' +
          'color:' + (theme.secondaryColor || theme.primaryColor) + ';font-size:' + subtitleSizes.upcomingFontSize +
          ';text-shadow:0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.24) + ';';
        p.textContent = upcoming[u].fullText;
        upWrap.appendChild(p);
      }
      content.appendChild(upWrap);
    }
    sub.appendChild(content);
    mmApplyVariant(sub, {
      enter: { opacity: 0.6, y: 0, transition: { opacity: { duration: 0.24, ease: 'easeOut' }, y: { duration: 0.24, ease: 'easeOut' } } }
    }, 'enter', null);
  }

  /* ---------- 主循环（:1422-1679 draw 同构 + 行管理） ---------- */
  var lastCurrentLineKey = null;   /* 空态 AnimatePresence 等价的显隐与字幕行管理 */
  var emptyShown = false;

  function tick() {
    if (destroyed) return;

    var now = performance.now();
    var dt = lastFrameTime === null
      ? 1 / 60
      : cadenzaClamp((now - lastFrameTime) / 1000, 1 / 240, 0.05);
    lastFrameTime = now;
    var width = Math.max(Math.floor(viewport.width), 1);
    var height = Math.max(Math.floor(viewport.height), 1);
    var dpr = window.devicePixelRatio || 1;

    /* 行管理（useVisualizerRuntime :124-157 等价：每帧从时间权威解析当前行） */
    var timeValue = currentTime.get();
    var currentLineIndex = cadenzaFindLineIndexAtTime(lines, timeValue);
    var activeLine = lines[currentLineIndex] || null;
    var upcomingLine = cadenzaGetUpcomingLine(lines, currentLineIndex, timeValue);
    var preparedState = computePreparedState(activeLine, upcomingLine);

    /* 空态显隐（:1705-1721 AnimatePresence 等价） */
    var wantEmpty = showText && !activeLine;
    if (wantEmpty !== emptyShown) {
      emptyShown = wantEmpty;
      emptyEl.style.opacity = wantEmpty ? '0.5' : '0';
    }

    /* 字幕行（recentCompletedLine runtime.ts:35 + 下一句预览） */
    var recentCompleted = cadenzaGetRecentCompletedLine(lines, currentLineIndex, timeValue, CM_getLineRenderEndTime);
    renderSubtitle(activeLine, recentCompleted, cadenzaGetUpcomingLines(lines, currentLineIndex, 2));

    if (!textContext) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    /* canvas 尺寸（:1442-1447） */
    if (textCanvas.width !== Math.floor(width * dpr) || textCanvas.height !== Math.floor(height * dpr)) {
      textCanvas.width = Math.floor(width * dpr);
      textCanvas.height = Math.floor(height * dpr);
      textCanvas.style.width = width + 'px';
      textCanvas.style.height = height + 'px';
    }

    textContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    textContext.clearRect(0, 0, width, height);

    if (!showText || !preparedState || !activeLine) {
      lineLayer.style.opacity = '0';
      lineLayer.style.filter = 'none';
      lineLayer.style.transform = 'scale(1)';
      lineLayer.style.perspective = '1000px';
      cadenzaClearOverlayWordNodes(overlayNodes);
      rafId = requestAnimationFrame(tick);
      return;
    }

    var time = timeValue;
    var lineTiming = cadenzaResolveLineRenderTiming(activeLine);
    var lineEnvelope = cadenzaGetLineEnvelope(time, activeLine, lineTiming);
    var wordRevealMode = lineTiming.wordRevealMode;
    var isInstantWordReveal = wordRevealMode === 'instant';
    var lineSeed = Math.abs(Math.sin(activeLine.startTime * 997.1));
    var linePerspective = theme.animationIntensity === 'chaotic' ? 500 + Math.round(lineSeed * 500) : 1000;
    var energy = cadenzaClamp(audioPower.get() / 255, 0, 1);
    var motionEnergy = energy * tuning.motionAmount;
    var verticalLift = Math.sin(time * 2.3) * (3 + motionEnergy * 8);
    var focusY = height * 0.42 + verticalLift;

    lineLayer.style.opacity = String(lineEnvelope.opacity);
    lineLayer.style.filter = lineEnvelope.blur > 0.05 ? ('blur(' + lineEnvelope.blur.toFixed(2) + 'px)') : 'none';
    lineLayer.style.transform = 'scale(' + lineEnvelope.scale + ')';
    lineLayer.style.perspective = linePerspective + 'px';

    textContext.font = preparedState.font;
    textContext.textBaseline = 'alphabetic';
    textContext.lineJoin = 'round';
    textContext.lineCap = 'round';

    /* 词绘制排序（:1484-1487 waiting 0 / passed 1 / active 2） */
    var placements = preparedState.placements.slice().sort(function (a, b) {
      var order = { waiting: 0, passed: 1, active: 2 };
      return order[cadenzaGetWordStatus(time, lineTiming, a.word)] - order[cadenzaGetWordStatus(time, lineTiming, b.word)];
    });
    var placementIds = new Set(placements.map(function (placement) { return placement.id; }));
    var usedOverlayIds = new Set();

    placements.forEach(function (placement, placementIndex) {
      var status = cadenzaGetWordStatus(time, lineTiming, placement.word);
      var progress = cadenzaGetWordProgress(time, wordRevealMode, placement.word);
      var passedAlpha = isInstantWordReveal
        ? 0
        : theme.animationIntensity === 'chaotic'
          ? 0.9
          : 0.82;
      var pulse = status === 'active' && !isInstantWordReveal
        ? 1 + Math.sin(time * CADENZA_ACTIVE_PULSE_FREQUENCY + placement.word.startTime * 5) * 0.04 * tuning.motionAmount
        : 1;
      var passedDriftProgress = isInstantWordReveal ? 0 : cadenzaGetPassedDrift(time, placement.word);
      var targetScale = status === 'waiting'
        ? (isInstantWordReveal
          ? placement.scale
          : Math.max(placement.scale * 0.5, 0.5))
        : status === 'active'
          ? (isInstantWordReveal
            ? placement.scale
            : placement.scale * 1.3 * pulse)
          : placement.scale;
      var targetRotation = status === 'waiting'
        ? (isInstantWordReveal
          ? placement.rotate
          : placement.rotate + 20)
        : status === 'passed'
          ? (isInstantWordReveal
            ? placement.rotate
            : placement.rotate + placement.passedRotate * passedDriftProgress)
          : placement.rotate;
      var localFloatX = Math.sin(time * 1.2 + placementIndex * 0.6) * motionEnergy * 4;
      var localFloatY = Math.cos(time * 1.5 + placementIndex * 0.4) * motionEnergy * 2.5;
      var passedDriftX = status === 'passed' ? placement.passedDriftX * passedDriftProgress : 0;
      var passedDriftY = status === 'passed' ? placement.passedDriftY * passedDriftProgress : 0;
      var targetX = width / 2 + placement.x + localFloatX + passedDriftX + (status === 'waiting' ? placement.entryOffsetX : 0);
      var targetY = focusY + placement.y + localFloatY + passedDriftY + (status === 'waiting' ? placement.entryOffsetY : 0);
      var targetBodyAlpha = status === 'waiting' ? 0 : status === 'active' ? 1 : passedAlpha;
      var targetBlur = status === 'waiting' && !isInstantWordReveal ? 10 : 0;
      var targetActiveMix = cadenzaGetBodyMix(time, lineTiming, placement.word);
      var targetGlowAlpha = cadenzaGetGlowEnvelope(time, lineTiming, placement.word);
      var transformTransitionAmount = 1 - Math.exp(-11 * dt);
      var visualTransitionAmount = 1 - Math.exp(-14 * dt);
      var existingState = animatedPlacementStates.get(placement.id);
      var shouldInitializeAsActive = isInstantWordReveal && time >= placement.word.startTime;
      var animatedState = existingState || {
        x: width / 2 + placement.x + placement.entryOffsetX,
        y: focusY + placement.y + placement.entryOffsetY,
        rotation: shouldInitializeAsActive ? targetRotation : targetRotation + 16,
        scale: shouldInitializeAsActive ? targetScale : Math.max(placement.scale * 0.5, 0.5),
        bodyAlpha: shouldInitializeAsActive ? targetBodyAlpha : 0,
        blur: shouldInitializeAsActive ? targetBlur : 10,
        activeMix: shouldInitializeAsActive ? targetActiveMix : 0,
        glowAlpha: shouldInitializeAsActive ? targetGlowAlpha : 0
      };

      animatedState.x = cadenzaMix(animatedState.x, targetX, transformTransitionAmount);
      animatedState.y = cadenzaMix(animatedState.y, targetY, transformTransitionAmount);
      animatedState.rotation = cadenzaMix(animatedState.rotation, targetRotation, transformTransitionAmount);
      animatedState.scale = cadenzaMix(animatedState.scale, targetScale, transformTransitionAmount);
      animatedState.bodyAlpha = cadenzaMix(animatedState.bodyAlpha, targetBodyAlpha, visualTransitionAmount);
      animatedState.blur = cadenzaMix(animatedState.blur, targetBlur, visualTransitionAmount);
      animatedState.activeMix = cadenzaMix(animatedState.activeMix, targetActiveMix, visualTransitionAmount);
      animatedState.glowAlpha = cadenzaMix(animatedState.glowAlpha, targetGlowAlpha, 1 - Math.exp(-16 * dt));
      animatedPlacementStates.set(placement.id, animatedState);

      if (animatedState.bodyAlpha < 0.015 && animatedState.glowAlpha < 0.015) {
        return;
      }

      var drawX = animatedState.x;
      var drawBaselineY = animatedState.y;
      var visualWidth = placement.width * animatedState.scale;
      var visualHeight = placement.height * animatedState.scale;
      var highlightHeight = visualHeight * (status === 'active' ? 1.08 : 1);
      var scaledLeft = drawX - (visualWidth - placement.width) / 2;

      /* 副歌涟漪（:1569-1584）——canvas 的唯一活动绘制路径 */
      if (status === 'active' && !placement.isInterlude) {
        if (activeLine.isChorus) {
          var rippleRadius = Math.max(visualWidth, highlightHeight) * (0.55 + progress * 0.45);
          textContext.strokeStyle = CM_colorWithAlpha(placement.color, 0.45 * (1 - progress) * animatedState.bodyAlpha);
          textContext.lineWidth = 1.2;
          textContext.beginPath();
          textContext.arc(
            scaledLeft + visualWidth / 2,
            drawBaselineY - visualHeight * 0.42,
            rippleRadius,
            0,
            Math.PI * 2
          );
          textContext.stroke();
        }
      }

      var textX = -placement.width / 2;
      var textY = placement.height * 0.42;
      var textColor = CM_mixColors(theme.primaryColor, placement.color, animatedState.activeMix);

      var overlayAnchorX = drawX + placement.width / 2;
      var overlayAnchorY = drawBaselineY - placement.height * 0.42;
      var overlayOffsetX = textX;
      var textMetrics = textContext.measureText(placement.text);
      var measuredAscent = textMetrics.actualBoundingBoxAscent || preparedState.fontPx * 0.78;
      var overlayOffsetY = textY - measuredAscent;
      var glyphs = cadenzaSplitGraphemes(placement.text);
      var shouldSplitGlow = wordRevealMode === 'normal' && !cadenzaIsCJK(placement.text) && glyphs.length > 1;
      var blurScale = 1 + energy * 0.22;
      usedOverlayIds.add(placement.id);
      var overlayWord = overlayNodes.get(placement.id);
      if (!overlayWord) {
        overlayWord = cadenzaCreateOverlayWordNodes();
        overlayNodes.set(placement.id, overlayWord);
        overlay.appendChild(overlayWord.outer);
      }

      overlayWord.outer.style.transform = 'translate3d(' + overlayAnchorX + 'px, ' + overlayAnchorY + 'px, 0) rotate(' + animatedState.rotation + 'deg) scale(' + animatedState.scale + ')';
      /* 量化开启时自有合成层（防 Chromium 字形缓存共享内存泄漏，源注释 :1608-1610） */
      var willChange = CM_isGlowBlurQuantized() ? 'transform' : '';
      if (overlayWord.outer.style.willChange !== willChange) overlayWord.outer.style.willChange = willChange;
      overlayWord.outer.style.transformOrigin = '0 0';
      overlayWord.inner.style.font = preparedState.font;
      overlayWord.inner.style.transform = 'translate3d(' + overlayOffsetX + 'px, ' + overlayOffsetY + 'px, 0)';
      overlayWord.body.textContent = placement.text;
      overlayWord.body.style.color = textColor;
      overlayWord.body.style.opacity = String(animatedState.bodyAlpha);
      overlayWord.body.style.filter = animatedState.blur > 0.05 ? ('blur(' + animatedState.blur.toFixed(2) + 'px)') : 'none';

      var glowTexts = shouldSplitGlow ? glyphs : [placement.text];
      cadenzaSyncOverlayGlyphSpans(overlayWord, glowTexts);

      if (shouldSplitGlow) {
        overlayWord.glyphSpans.forEach(function (glyphSpan, glyphIndex) {
          var absoluteIndex = placement.fragmentStartInWord + glyphIndex;
          var intensity = cadenzaGetCharGlow(
            time,
            placement.word,
            absoluteIndex,
            Math.max(placement.wordGraphemeCount, glyphs.length),
            placement.wordGraphemeTimings
          ) * cadenzaClamp(animatedState.glowAlpha, 0, 1) * Math.max(tuning.glowIntensity, 0);

          glyphSpan.style.textShadow = cadenzaBuildDomTextShadow(placement.color, intensity, blurScale);
        });
      } else if (overlayWord.glyphSpans[0]) {
        var intensity = cadenzaGetGlowEnvelope(time, lineTiming, placement.word)
          * cadenzaClamp(animatedState.glowAlpha, 0, 1)
          * Math.max(tuning.glowIntensity, 0);
        overlayWord.glyphSpans[0].style.textShadow = cadenzaBuildDomTextShadow(placement.color, intensity, blurScale);
      }

    });

    /* 状态/节点清扫（:1646-1657） */
    animatedPlacementStates.forEach(function (_value, key) {
      if (!placementIds.has(key)) {
        animatedPlacementStates.delete(key);
      }
    });

    overlayNodes.forEach(function (nodes, key) {
      if (!usedOverlayIds.has(key)) {
        nodes.outer.remove();
        overlayNodes.delete(key);
      }
    });

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);

  return {
    destroy: function () {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      lastFrameTime = null;
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', syncViewportFallback);
      cadenzaClearOverlayWordNodes(overlayNodes);
      animatedPlacementStates.clear();
      preparedStateCache.clear();
      if (shell.parentNode) shell.parentNode.removeChild(shell);
    },
    setLines: function (next) { lines = next || []; },
    setTheme: function (next) {
      theme = next;
      shell.style.fontFamily = CM_resolveThemeFontStack(theme);
      shell.style.fontWeight = CM_resolveThemeFontWeight(theme, 400);
      emptyEl.style.color = theme.secondaryColor || theme.primaryColor;
      /* contextKey 含 theme 组成，下一帧自动失效缓存（:1331-1346） */
    },
    setFontScale: function (n) {
      lyricsFontScale = n != null ? n : 1;
      /* entry.tsx:19 —— fontScale × lyricsFontScale */
      tuning.fontScale = ((opts.tuning && opts.tuning.fontScale != null) ? opts.tuning.fontScale : CADENZA_DEFAULT_TUNING.fontScale) * lyricsFontScale;
      subtitleSizes = CM_resolveSubtitleFontSizes(lyricsFontScale);
    },
    setTuning: function (t) {
      opts.tuning = t;
      var base = (t && t.fontScale != null) ? t : CADENZA_DEFAULT_TUNING;
      tuning.fontScale = (base.fontScale != null ? base.fontScale : CADENZA_DEFAULT_TUNING.fontScale) * lyricsFontScale;
      tuning.widthRatio = (base.widthRatio != null ? base.widthRatio : CADENZA_DEFAULT_TUNING.widthRatio);
      tuning.motionAmount = (base.motionAmount != null ? base.motionAmount : CADENZA_DEFAULT_TUNING.motionAmount);
      tuning.glowIntensity = (base.glowIntensity != null ? base.glowIntensity : CADENZA_DEFAULT_TUNING.glowIntensity);
      tuning.beamIntensity = (base.beamIntensity != null ? base.beamIntensity : CADENZA_DEFAULT_TUNING.beamIntensity);
    }
  };
}
