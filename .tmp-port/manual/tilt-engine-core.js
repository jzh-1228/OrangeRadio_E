/* =========================================================================
   tilt 渲染核心 —— Folia tilt VisualizerTilt.tsx 的无构建 DOM 忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     src/components/visualizer/tilt/VisualizerTilt.tsx（渲染核心全量）
     src/components/visualizer/runtime.ts（当前行/最近完成行/预览行）
     src/components/visualizer/VisualizerShell.tsx（壳字体/字重）
     src/components/visualizer/VisualizerSubtitleOverlay.tsx +
       src/utils/lyrics/subtitleTrackStyle.ts（底部字幕/下一句预览：
       translation 专用字体栈 :193-197 / 主行字重 500 回退 :188 / glow
       blur-2xl=40px :157 / 行入场 y:10 :175-179）
     src/types.ts:488-500（TiltColorScheme / TiltTuning / DEFAULT_TILT_TUNING）
     src/i18n/locales/{en,zh-CN}.ts:628、in.ts:623（waitingForMusic 空串）

   结构对应（React → 无构建 DOM，行号均指 VisualizerTilt.tsx）：
     VisualizerShell            → tl-shell（fontFamily/fontWeight inline）
     主容器 div（:638）          → tl-main（relative z-10 w-full h-70vh p-8）
     AnimatePresence popLayout  → 行槽双槽并存（旧行播 exit 后移除；
                                  叠加定位层，新旧行互不影响布局）
     motion.div 行块（:641-647） → tl-linebox（opacity 0→1，exit 0.45 easeInOut）
     TiltLine 段（:431-537）     → tl-seg（normal/tilt 双字模 variants：
                                  initial/animate/exit + 组件级 transition
                                  {duration:.55/.6, ease:[.25,.46,.45,.94]}）
     逐字 motion.span            → tl-char（opacity reveal 0.5s 逐字 delay
                                  0.04/0.05s；tilt 段 ±yOffset 交错）
     charScaleMvs（:383-386）    → scale 直写 mm state + CSS transition
                                  transform 0.06s ease-out（:527 原样）
     useInsertionEffect（:397-429）→ currentTime MV 订阅逐字脉冲 handler
     visibleSegmentIndex（:604-627）→ currentTime MV 订阅段落时间序 reveal
     useVisualizerRuntime        → tiltFindLineIndexAtTime（appPlaybackHelpers
       权威语义）+ tiltGetRecentCompletedLine/tiltGetUpcomingLines
     measureAtSize（:200-204）   → 全局 pretext.prepareWithSegments/layoutWithLines
       （index.html 已加载 vendor/pretext/pretext.bundle.js；缺失时退
       text.length*pxSize*0.6——与原版 `?? text.length*pxSize*0.6` 同形）
     SentenceLayout.splitIntoSentences → 闭包 CM_SentenceLayout（五级语义拆行）
     VisualizerSubtitleOverlay  → tl-sub（翻译行 + 下一句预览，classic 同构）
     空态 tilt-empty（:664-674） → tl-idle（text-2xl=1.5rem/2rem absolute；
       文案 t('ui.waitingForMusic') 三语言包均为空串 → 忠实渲染空 div）

   动画全部经 mini-motion（framer 子集忠实实现）驱动；framer「组件级
   transition prop 同时作用于 initial→animate 与 exit」语义按原值展开。
   MineRadio 宿主差异（数据源在桥）：无 i18n → 空态文案忠实取 t() 的空串
   （folia 三语言包该键均为 ""，勿自创占位文案）；无调参面板 → tuning 取
   DEFAULT_TILT_TUNING 原值（桥可传 opts.tuning 覆盖）；无歌词字重设置 →
   主题不带 fontWeight，走引擎 resolveThemeFontWeight 的 400/300 回退
   （folia 缺省歌词字重 null，buildVisualizerTheme.ts:43 ?? undefined）。
   ========================================================================= */

/* ---------- tuning（types.ts:488-500 原值） ---------- */
var TILT_DEFAULT_TUNING = {
  splitProbability: 0.75,
  tiltStyleProbability: 0.35,
  colorScheme: 'default'
};

/* resolveTiltTuning（宿主缺省合并：缺字段回 DEFAULT，色方案白名单校验） */
function tiltResolveTuning(tuning) {
  var schemes = ['default', 'swap', 'accentAll', 'primaryAll'];
  var scheme = (tuning && tuning.colorScheme) || TILT_DEFAULT_TUNING.colorScheme;
  return {
    splitProbability: (tuning && tuning.splitProbability != null) ? tuning.splitProbability : TILT_DEFAULT_TUNING.splitProbability,
    tiltStyleProbability: (tuning && tuning.tiltStyleProbability != null) ? tuning.tiltStyleProbability : TILT_DEFAULT_TUNING.tiltStyleProbability,
    colorScheme: schemes.indexOf(scheme) >= 0 ? scheme : 'default'
  };
}

/* ---------- 常量（VisualizerTilt.tsx:16-52 原值） ---------- */
var TILT_CHAR_REF_LENGTH = 20;
var TILT_LOG_OFFSET = 4;
var TILT_LINE_THRESHOLDS = [0.45, 1.05, 1.7];
var TILT_REM_PX = 16;
var TILT_RESPLIT_THRESHOLD = 1.6;
var TILT_SCALE_FLOOR_NORMAL = 0.55;
var TILT_SCALE_FLOOR_TILT = 0.5;

/* determineLineCount（:20-28）——概率拆行 1-4 行 */
function tiltDetermineLineCount(charCount, seed, splitProbability) {
  var normalized = Math.log(charCount + TILT_LOG_OFFSET) / Math.log(TILT_CHAR_REF_LENGTH + TILT_LOG_OFFSET);
  var jitter = tiltSeededRandom(seed, 1) * 0.6 + 0.7;
  var score = normalized * jitter * splitProbability;
  if (score < TILT_LINE_THRESHOLDS[0]) return 1;
  if (score < TILT_LINE_THRESHOLDS[1]) return 2;
  if (score < TILT_LINE_THRESHOLDS[2]) return 3;
  return 4;
}

/* getAvailableWidth（:54-57） */
function tiltGetAvailableWidth() {
  if (typeof window === 'undefined') return 1200 * 0.85;
  return Math.max(320, window.innerWidth) * 0.85;
}

/* GRAPHEME_SEGMENTER（:59） */
var tiltGraphemeSegmenter = (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function')
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

/* seededRandom（:206-209） */
function tiltSeededRandom(seed, offset) {
  var x = Math.sin(seed * 1000 + offset) * 10000;
  return x - Math.floor(x);
}

/* findSegmentWordRange（:67-101）——段文本 → 全文词区间（indexOf 推进定位） */
function tiltFindSegmentWordRange(charOffset, segmentText, fullText, words) {
  var segmentStart = charOffset;
  if (segmentStart < 0 || segmentStart >= fullText.length) return { startWordIndex: 0, endWordIndex: words.length };

  var segmentEnd = segmentStart + segmentText.length;

  var fullTextPos = 0;
  var startWordIndex = 0;
  var endWordIndex = words.length;

  for (var wi = 0; wi < words.length; wi++) {
    var wordText = words[wi].text;
    var wordFullStart = fullText.indexOf(wordText, fullTextPos);

    if (wordFullStart === -1) {
      fullTextPos += wordText.length;
      continue;
    }

    var wordFullEnd = wordFullStart + wordText.length;

    if (wordFullStart <= segmentStart && wordFullEnd > segmentStart) {
      startWordIndex = wi;
    }

    if (wordFullStart < segmentEnd && wordFullEnd >= segmentEnd) {
      endWordIndex = wi + 1;
      break;
    }

    fullTextPos = wordFullEnd;
  }

  return { startWordIndex: startWordIndex, endWordIndex: endWordIndex };
}

/* buildCharTimings（:103-178）——段内逐字时序：
   词 syllables → graphemeTiming 精确逐字；否则词内均分；总量不符 → 段均分兜底 */
function tiltBuildCharTimings(charOffset, segmentText, segmentStartTime, segmentEndTime, activeLine) {
  var graphemes = tiltGraphemeSegmenter
    ? Array.from(tiltGraphemeSegmenter.segment(segmentText))
    : Array.from(segmentText).map(function (ch, i) { return { segment: ch, index: i }; });
  if (!activeLine || graphemes.length === 0) return [];

  var nonSpaceGraphemes = graphemes.filter(function (g) { return !/^\s+$/.test(g.segment); });
  if (nonSpaceGraphemes.length === 0) return [];

  var totalDuration = Math.max(segmentEndTime - segmentStartTime, 0.3);
  var range = tiltFindSegmentWordRange(charOffset, segmentText, activeLine.fullText, activeLine.words);
  var segmentWords = activeLine.words.slice(range.startWordIndex, range.endWordIndex);

  var currentCharIndex = 0;
  var timings = [];

  if (segmentWords.length > 0) {
    for (var sw = 0; sw < segmentWords.length; sw++) {
      var word = segmentWords[sw];
      if (word.syllables && word.syllables.length) {
        var wordTimings = CM_buildWordGraphemeTimings(word).filter(function (timing) { return !/^\s+$/.test(timing.char); });
        for (var wt = 0; wt < wordTimings.length; wt++) {
          if (currentCharIndex >= nonSpaceGraphemes.length) break;
          timings.push({
            charIndex: currentCharIndex,
            startTime: wordTimings[wt].startTime,
            endTime: wordTimings[wt].endTime
          });
          currentCharIndex++;
        }
        continue;
      }

      var wordGraphemes = tiltGraphemeSegmenter
        ? Array.from(tiltGraphemeSegmenter.segment(word.text))
        : Array.from(word.text).map(function (ch, i) { return { segment: ch, index: i }; });
      var wordNonSpaceCount = 0;
      for (var wg = 0; wg < wordGraphemes.length; wg++) {
        if (!/^\s+$/.test(wordGraphemes[wg].segment)) wordNonSpaceCount++;
      }
      if (wordNonSpaceCount === 0) continue;

      var wordDuration = Math.max(word.endTime - word.startTime, 0.05);
      var charDuration = wordDuration / wordNonSpaceCount;
      var nonSpaceCi = 0;

      for (var gi = 0; gi < wordGraphemes.length; gi++) {
        if (currentCharIndex >= nonSpaceGraphemes.length) break;
        if (/^\s+$/.test(wordGraphemes[gi].segment)) continue;

        timings.push({
          charIndex: currentCharIndex,
          startTime: word.startTime + nonSpaceCi * charDuration,
          endTime: word.startTime + (nonSpaceCi + 1) * charDuration
        });

        currentCharIndex++;
        nonSpaceCi++;
      }
    }
  }

  if (timings.length === 0 || timings.length !== nonSpaceGraphemes.length) {
    var avgCharDuration = totalDuration / nonSpaceGraphemes.length;
    timings.length = 0;
    currentCharIndex = 0;

    for (var i = 0; i < graphemes.length; i++) {
      if (/^\s+$/.test(graphemes[i].segment)) continue;

      timings.push({
        charIndex: currentCharIndex,
        startTime: segmentStartTime + currentCharIndex * avgCharDuration,
        endTime: segmentStartTime + (currentCharIndex + 1) * avgCharDuration
      });
      currentCharIndex++;
    }
  }

  return timings;
}

/* getCharPulseIntensity（:180-198）——正弦脉冲 + 余辉缓落 0.25 常亮 */
function tiltCharPulseIntensity(currentTime, charTiming) {
  var startTime = charTiming.startTime, endTime = charTiming.endTime;
  var rawDuration = Math.max(endTime - startTime, 0.05);
  var duration = Math.min(Math.max(rawDuration, 0.2), 0.9);
  var elapsed = currentTime - startTime;

  if (elapsed < 0) return 0;

  if (elapsed <= duration) {
    var progress = elapsed / duration;
    return Math.sin(progress * Math.PI);
  }

  var afterElapsed = elapsed - duration;
  var afterglowRamp = duration * 1.2;
  if (afterElapsed >= afterglowRamp) return 0.25;

  return 0.25 * (afterElapsed / afterglowRamp);
}

/* measureAtSize（:200-204）——pretext 文本测量（pxSize*1.4 行高、99999 宽=单行） */
function tiltMeasureAtSize(text, pxSize, fontSpec) {
  var fallback = text.length * pxSize * 0.6;
  try {
    if (typeof pretext === 'undefined' || !pretext ||
      typeof pretext.prepareWithSegments !== 'function' ||
      typeof pretext.layoutWithLines !== 'function') return fallback;
    var prepared = pretext.prepareWithSegments(text, fontSpec);
    var layout = pretext.layoutWithLines(prepared, 99999, pxSize * 1.4);
    return (layout.lines[0] && layout.lines[0].width != null) ? layout.lines[0].width : fallback;
  } catch (e) {
    return fallback;
  }
}

/* markShortLastLine（:272-281）——短尾行并入判定（boost 1.18） */
function tiltMarkShortLastLine(segs) {
  if (segs.length < 2) return segs;
  var last = segs[segs.length - 1];
  if (last.isTilt || last.text.trim().length > 2) return segs;
  var prev = segs[segs.length - 2];
  if (last.text.trim().length * 2 <= prev.text.length) {
    segs[segs.length - 1] = {
      text: last.text, isTilt: last.isTilt, isShortLastLine: true, charOffset: last.charOffset
    };
  }
  return segs;
}

/* buildTiltLayout（:211-332 全量同构）——概率拆行 + 单一大斜体段 +
   pretext 量宽溢出缩放 + 超宽重拆（RESPLIT_THRESHOLD 1.6） */
function tiltBuildTiltLayout(fullText, lineSeed, tuning, theme, fontScale) {
  var fontStack = CM_resolveThemeFontStack(theme);
  var viewportWidth = (typeof window !== 'undefined' && window.innerWidth) || 1200;
  var measureMaxPx = Math.max(viewportWidth * 0.06875, 5.625 * TILT_REM_PX * fontScale);
  var normalBasePx = measureMaxPx;
  var tiltBasePx = measureMaxPx;
  var normalFontSpec = CM_resolveThemeFontWeight(theme, 400) + ' ' + normalBasePx + 'px ' + fontStack;
  var tiltFontSpec = CM_resolveThemeFontWeight(theme, 300) + ' ' + tiltBasePx + 'px ' + fontStack + ' italic';
  var availableWidth = tiltGetAvailableWidth();

  var charCount = fullText.trim().length;
  var isEllipsisOnly = /^[\s.…·。]+$/.test(fullText.trim());
  var mergedSegments;

  if (isEllipsisOnly) {
    mergedSegments = [fullText];
  } else {
    var numLines = tiltDetermineLineCount(charCount, lineSeed, tuning.splitProbability);
    var layoutUnits = CM_SentenceLayout.splitIntoSentences(fullText, numLines, lineSeed);
    mergedSegments = layoutUnits.map(function (u) { return u.text; });
  }

  var candidates = [];
  mergedSegments.forEach(function (_, i) {
    var lineRoll = tiltSeededRandom(lineSeed, 100 + i);
    if (lineRoll < tuning.tiltStyleProbability) candidates.push(i);
  });

  var finalTiltIndex = -1;
  if (candidates.length > 0) {
    finalTiltIndex = candidates[Math.floor(tiltSeededRandom(lineSeed, 200) * candidates.length)];
  }

  var offsetAccum = 0;
  var segments = mergedSegments.map(function (text, i) {
    var trimmed = text.trimStart().trimEnd();
    var leadingSpaces = text.length - text.trimStart().length;
    var seg = {
      text: trimmed,
      isTilt: i === finalTiltIndex,
      isShortLastLine: false,
      charOffset: offsetAccum + leadingSpaces
    };
    offsetAccum += text.length;
    return seg;
  });

  var scaleMultiplier = 1;
  var tiltWithWidth = segments.filter(function (s) { return s.isTilt; })
    .map(function (s) { return { text: s.text, width: tiltMeasureAtSize(s.text, tiltBasePx, tiltFontSpec) }; });
  var normalWithWidth = segments.filter(function (s) { return !s.isTilt; })
    .map(function (s) { return { text: s.text, width: tiltMeasureAtSize(s.text, normalBasePx, normalFontSpec) }; });

  var widestTiltEntry = tiltWithWidth.sort(function (a, b) { return b.width - a.width; })[0];
  var widestNormalEntry = normalWithWidth.sort(function (a, b) { return b.width - a.width; })[0];

  var tiltWidth = widestTiltEntry ? widestTiltEntry.width : 0;
  var normalWidth = widestNormalEntry ? widestNormalEntry.width : 0;

  var tiltOverflow = tiltWidth > 0 ? tiltWidth / availableWidth : 0;
  var normalOverflow = normalWidth > 0 ? normalWidth / availableWidth : 0;
  var maxOverflow = Math.max(tiltOverflow, normalOverflow);

  if (maxOverflow > 1) {
    if (maxOverflow >= TILT_RESPLIT_THRESHOLD) {
      var targetWidth = availableWidth * (TILT_RESPLIT_THRESHOLD - 0.15);
      var totalEstWidth = tiltMeasureAtSize(fullText, normalBasePx, normalFontSpec);
      var extraSplitsNeeded = Math.min(4, Math.max(segments.length + 1, Math.ceil(totalEstWidth / targetWidth)));
      if (extraSplitsNeeded > segments.length) {
        var reSplitUnits = CM_SentenceLayout.splitIntoSentences(fullText, extraSplitsNeeded, lineSeed);
        var reSplitOffset = 0;
        var newSegments = reSplitUnits.map(function (u) {
          var trimmed = u.text.trimStart().trimEnd();
          var leadingSpaces = u.text.length - u.text.trimStart().length;
          var seg = { text: trimmed, isTilt: false, isShortLastLine: false, charOffset: reSplitOffset + leadingSpaces };
          reSplitOffset += u.text.length;
          return seg;
        });
        if (newSegments.length > 0) {
          var resplitTiltRoll = tiltSeededRandom(lineSeed, 300);
          if (resplitTiltRoll < tuning.tiltStyleProbability) {
            var picked = Math.floor(tiltSeededRandom(lineSeed, 301) * newSegments.length);
            newSegments[picked].isTilt = true;
          }
        }

        var postWidestTilt = newSegments.filter(function (s) { return s.isTilt; })[0];
        var postNormalWithWidth = newSegments.filter(function (s) { return !s.isTilt; })
          .map(function (s) { return { text: s.text, width: tiltMeasureAtSize(s.text, normalBasePx, normalFontSpec) }; });
        var postWidestNormal = postNormalWithWidth.sort(function (a, b) { return b.width - a.width; })[0];

        var postScale = 1;
        if (postWidestTilt) {
          var w = tiltMeasureAtSize(postWidestTilt.text, tiltBasePx, tiltFontSpec);
          if (w > availableWidth) postScale = Math.max(TILT_SCALE_FLOOR_TILT, availableWidth / w);
        } else if (postWidestNormal) {
          var w2 = tiltMeasureAtSize(postWidestNormal.text, normalBasePx, normalFontSpec);
          if (w2 > availableWidth) postScale = Math.max(TILT_SCALE_FLOOR_NORMAL, availableWidth / w2);
        }

        return { segments: tiltMarkShortLastLine(newSegments), scaleMultiplier: postScale };
      }
    }

    if (tiltOverflow >= normalOverflow && widestTiltEntry) {
      scaleMultiplier = Math.max(TILT_SCALE_FLOOR_TILT, availableWidth / tiltWidth);
    } else if (widestNormalEntry) {
      scaleMultiplier = Math.max(TILT_SCALE_FLOOR_NORMAL, availableWidth / normalWidth);
    }
  }

  return { segments: tiltMarkShortLastLine(segments), scaleMultiplier: scaleMultiplier };
}

/* getColors（:357-368）——四套配色方案（面板：双色1/双色2/单色1/单色2） */
function tiltLineColors(colorScheme, theme) {
  switch (colorScheme) {
    case 'swap':
      return { normal: theme.accentColor || theme.primaryColor, tilt: theme.primaryColor };
    case 'accentAll':
      return { normal: theme.accentColor || theme.primaryColor, tilt: theme.accentColor || theme.primaryColor };
    case 'primaryAll':
      return { normal: theme.primaryColor, tilt: theme.primaryColor };
    default:
      return { normal: theme.primaryColor, tilt: theme.accentColor || theme.primaryColor };
  }
}

/* framer 组件级 transition 的 ease 数组（[.25,.46,.45,.94]）→ cubic-bezier 函数
   （mmResolveEase 支持函数 ease；mini-motion 同 IIFE 内 mmCubicBezier） */
function tiltEase3(arr) {
  return (arr && arr.length === 4) ? mmCubicBezier(arr[0], arr[1], arr[2], arr[3]) : null;
}

/* ---------- runtime.ts 纯函数等价（classic 同构；tilt 独立命名） ---------- */

/* findLatestActiveLineIndex（appPlaybackHelpers.ts:21-32）——宿主 currentLineIndex 权威语义 */
function tiltFindLineIndexAtTime(lines, time) {
  for (var index = (lines ? lines.length : 0) - 1; index >= 0; index--) {
    var line = lines[index];
    if (!line || time < line.startTime) continue;
    if (time <= ((line.renderHints && line.renderHints.renderEndTime != null) ? line.renderHints.renderEndTime : line.endTime)) {
      return index;
    }
  }
  return -1;
}

/* getRecentCompletedLine（runtime.ts:35-52） */
function tiltGetRecentCompletedLine(lines, currentLineIndex, currentTime, getLineEndTime) {
  if (currentLineIndex !== -1 || !lines || lines.length === 0) return null;
  for (var i = lines.length - 1; i >= 0; i--) {
    if (currentTime > getLineEndTime(lines[i])) return lines[i];
  }
  return null;
}

/* getUpcomingLines（runtime.ts:76-86） */
function tiltGetUpcomingLines(lines, currentLineIndex, count) {
  if (currentLineIndex < 0) return [];
  return lines.slice(currentLineIndex + 1, currentLineIndex + 1 + count);
}

/* hasReadableText（VisualizerSubtitleOverlay.tsx:20） */
function tiltHasReadableText(text) {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

/* subtitleTrackStyle.ts 常量原值 */
var TILT_SECONDARY_TRACK_SIZE_FACTOR = 0.88;
var TILT_SECONDARY_TRACK_OPACITY = 0.82;
var TILT_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK = 400;
var TILT_SECONDARY_TRACK_GAP_EM = 0.25;

/* ---------- DOM 工具 ---------- */

function tiltEl(tag, className, styleText) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (styleText) el.style.cssText = styleText;
  return el;
}

/* charScale MV 直写（framer motionValue 绑 style.scale + CSS transition
   'transform 0.06s ease-out'（:527/:528）——写 mm state 后组装完整 transform，
   y 动画（mmApplyVariant）与 scale 共存同一 state，与 framer 合成序一致） */
function tiltSetCharScale(rec, v) {
  if (rec.lastScale === v) return;
  rec.lastScale = v;
  var st = mmGetState(rec.el);
  st.tf.scale = v;
  mmApplyTransform(rec.el, st);
}

/* ---------- 段落 variants（TiltLine :431-537 同构） ----------
   framer「组件级 transition prop」语义：initial→animate 与 exit 共用；
   ease 数组 [.25,.46,.45,.94] 原值。 */

/* 段根 variants（:433-437 normal / :484-487 tilt） */
function tiltMakeSegVariants(isTilt, fontSize, color, fontWeight, theme) {
  var ease = tiltEase3([0.25, 0.46, 0.45, 0.94]);
  var common = 'white-space:nowrap;font-family:inherit;font-size:' + fontSize + ';color:' + color + ';' +
    (isTilt ? 'font-style:italic;' : '') +
    'line-height:' + (isTilt ? '1.25' : '1.35') + ';' +
    'font-weight:' + fontWeight + ';' +
    'letter-spacing:' + (isTilt ? '0.15em' : '0.08em') + ';';
  if (!isTilt) {
    return {
      css: common,
      initial: { opacity: 0, y: 20 },
      variants: {
        shown: { opacity: 1, y: 0, transition: { duration: 0.55, ease: ease } },
        hidden: { opacity: 0, y: 20, transition: { duration: 0.55, ease: ease } },
        exit: { opacity: 0, y: -12, transition: { duration: 0.55, ease: ease } }
      }
    };
  }
  return {
    css: common,
    initial: { opacity: 0, y: 24, scale: 0.92 },
    variants: {
      shown: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: ease } },
      hidden: { opacity: 0, y: 24, scale: 0.92, transition: { duration: 0.6, ease: ease } },
      exit: { opacity: 0, y: -16, scale: 0.95, transition: { duration: 0.6, ease: ease } }
    }
  };
}

/* 字符 variants（:454-477 normal / :507-533 tilt；delay 仅进入方向施加——
   framer delay: visible && !isSpace ? ci*0.04/0.05 : 0，隐藏方向 delay 0） */
function tiltMakeCharVariants(isTilt, isSpace, ci, yStagger, yOffset) {
  var ease = tiltEase3([0.25, 0.46, 0.45, 0.94]);
  var delay = (isSpace ? 0 : (isTilt ? ci * 0.05 : ci * 0.04));
  if (!isTilt) {
    return {
      initial: { opacity: 0 },
      variants: {
        shown: { opacity: 1, transition: { duration: 0.5, delay: delay, ease: ease } },
        hidden: { opacity: 0, transition: { duration: 0.5, delay: 0, ease: ease } }
      }
    };
  }
  var yOut = isSpace ? 0 : yStagger * yOffset * 2;
  var yIn = isSpace ? 0 : yStagger * yOffset;
  return {
    initial: { opacity: 0, y: yOut },
    variants: {
      shown: { opacity: 1, y: yIn, transition: { duration: 0.5, delay: delay, ease: ease } },
      hidden: { opacity: 0, y: yOut, transition: { duration: 0.5, delay: 0, ease: ease } }
    }
  };
}

/* ---------- 引擎实例 ---------- */

/**
 * TiltTiltEngine(opts) —— tilt 模式渲染引擎（VisualizerTilt 组件树的宿主等价）
 * opts: { host, lines, currentTime(MV), theme, tuning?, lyricsFontScale?, showText?,
 *         hideTranslationSubtitle?, showSubtitleTranslation? }
 * 返回 { destroy, setLines, setTheme, setFontScale, setTuning }
 */
function TiltTiltEngine(opts) {
  var host = opts.host;
  var lines = opts.lines || [];
  var theme = opts.theme;
  var tuning = tiltResolveTuning(opts.tuning);
  var lyricsFontScale = opts.lyricsFontScale != null ? opts.lyricsFontScale : 1;
  var showText = opts.showText !== false;
  var hideTranslationSubtitle = !!opts.hideTranslationSubtitle;
  var showSubtitleTranslation = opts.showSubtitleTranslation !== false;

  var currentTime = opts.currentTime;
  var lastTime = null;
  var destroyed = false;
  var rafId = 0;

  /* ---------- 壳（VisualizerShell 等价：字体/字重 inline） ---------- */
  var shell = tiltEl('div', 'tl-shell');
  shell.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;font-family:' +
    CM_resolveThemeFontStack(theme) + ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) + ';';

  /* 主容器（:638 relative z-10 w-full h-[70vh] flex items-center justify-center p-8） */
  var main = tiltEl('div', 'tl-main');
  main.style.cssText = 'position:relative;z-index:10;width:100%;height:70vh;display:flex;align-items:center;justify-content:center;padding:32px;pointer-events:none;';

  /* 行槽（AnimatePresence popLayout 等价：叠加定位层，双槽并存互不影响布局） */
  var slots = tiltEl('div', 'tl-slots');
  slots.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';
  main.appendChild(slots);

  /* 空态（:664-674 text-2xl opacity-50 absolute，color secondaryColor）。
     文案 = t('ui.waitingForMusic')——folia 三语言包该键全部为空串
     （i18n/locales/en.ts:628 / zh-CN.ts:628 / in.ts:623，"waitingForMusic": ""），
     i18next 缺省 returnEmptyString:true（dist/cjs/i18next.js:1717）→ 空串
     原样返回：原版空态是带 text-2xl/opacity-50 样式的空 div，视觉无文字。
     宿主无 i18n → 忠实取空串（勿自创「等待音乐」类占位文案）。
     透明度：framer animate={{opacity:1}}（:667）inline 压过 className
     opacity-50 → 显示态 inline opacity 1；显隐过渡 = framer 缺省 tween
     0.3 的 CSS 等价） */
  var idle = tiltEl('div', 'tl-idle');
  idle.style.cssText = 'position:absolute;font-size:1.5rem;line-height:2rem;opacity:0;transition:opacity .3s ease;color:' +
    (theme.secondaryColor || theme.primaryColor) + ';';
  idle.textContent = '';
  main.appendChild(idle);

  /* 底部字幕（VisualizerSubtitleOverlay 等价；bottom 对齐本项目底栏几何，
     classic 同款宿主适配） */
  var sub = tiltEl('div', 'tl-sub');
  sub.style.cssText = 'position:absolute;left:0;right:0;bottom:132px;text-align:center;padding:0 16px;z-index:20;pointer-events:none;opacity:0;transform:translateY(20px);';
  shell.appendChild(main);
  shell.appendChild(sub);
  host.appendChild(shell);

  var subtitleSizes = CM_resolveSubtitleFontSizes(lyricsFontScale);

  /* ---------- 行/段运行时 ---------- */
  var currentLineKey = null;    /* activeLine.startTime（行 key :642） */
  var activeLineEl = null;      /* 当前行行块元素 */
  var exitTimers = [];
  var segs = [];                /* 当前行的段渲染记录（:648-661 map 的宿主等价） */
  var visibleSegIndex = -1;     /* useState(-1)（:563） */
  var activeLineRef = null;     /* useVisualizerRuntime().activeLine */
  var subtitleKey = null;
  var lastSmGap = null;         /* sm:gap-y-4 断点记忆 */

  /* ---------- currentTime MV 订阅（useInsertionEffect :397-429/:604-627 等价） ---------- */
  currentTime.subscribe(function (latest) {
    /* 每段逐字脉冲 handler（:400-428；!visible 不写 scale——原样） */
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      if (!seg.visible) continue;
      if (!seg.charTimings || seg.charTimings.length === 0) {
        for (var c0 = 0; c0 < seg.chars.length; c0++) tiltSetCharScale(seg.chars[c0], 1);
        continue;
      }
      var amp = seg.isTilt ? 0.18 : 0.15;
      for (var c = 0; c < seg.chars.length; c++) {
        var ch = seg.chars[c];
        if (ch.isSpace) { tiltSetCharScale(ch, 1); continue; }
        var timing = seg.charTimings[ch.ci];
        if (!timing) { tiltSetCharScale(ch, 1); continue; }
        var intensity = tiltCharPulseIntensity(latest, timing);
        tiltSetCharScale(ch, 1 + intensity * amp);
      }
    }
    updateVisibleSegIndex(latest);
  });

  /* visibleSegmentIndex handler（:605-627 同构） */
  function computeVisibleTarget(latest, segmentTimings, line) {
    if (!segmentTimings || !line) return -1;
    var target = -1;
    for (var i = 0; i < segmentTimings.length; i++) {
      if (latest >= segmentTimings[i].start - 0.25) {
        target = i;
      }
    }
    if (latest < line.startTime - 0.1 || latest > CM_getLineRenderEndTime(line)) {
      target = -1;
    }
    return target;
  }

  function updateVisibleSegIndex(latest) {
    var timings = segTimingsCache;
    var target = computeVisibleTarget(latest, timings, activeLineRef);
    if (target === visibleSegIndex) return;
    visibleSegIndex = target;
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var want = i <= target;
      if (seg.visible !== want) {
        seg.visible = want;
        mmApplyVariant(seg.el, seg.variants, want ? 'shown' : 'hidden', null);
        for (var c = 0; c < seg.chars.length; c++) {
          var ch = seg.chars[c];
          mmApplyVariant(ch.el, ch.variants, want ? 'shown' : 'hidden', null);
        }
      }
    }
  }

  /* ---------- segmentTimings（:581-602 同构） ---------- */
  var segTimingsCache = null;
  function computeSegmentTimings(line, layout) {
    if (!line || !layout) return null;
    return layout.segments.map(function (seg) {
      var range = tiltFindSegmentWordRange(seg.charOffset, seg.text, line.fullText, line.words);
      var segWords = line.words.slice(range.startWordIndex, range.endWordIndex);
      if (segWords.length > 0) {
        return { start: segWords[0].startTime, end: segWords[segWords.length - 1].endTime };
      }
      return { start: line.startTime, end: CM_getLineRenderEndTime(line) };
    });
  }

  /* ---------- 渲染一行（:640-663 的 DOM 展开 + TiltLine 逐段落地） ---------- */
  function renderLine(line) {
    var layout = tiltBuildTiltLayout(line.fullText, line.startTime, tuning, theme, lyricsFontScale);
    segTimingsCache = computeSegmentTimings(line, layout);

    /* 行块（:641-647 flex flex-col items-center justify-center gap-y-3 sm:gap-y-4） */
    var vw = (typeof window !== 'undefined' && window.innerWidth) || 1200;
    var smGap = vw >= 640 ? 16 : 12;   /* gap-y-3 = 0.75rem, sm:gap-y-4 = 1rem */
    lastSmGap = smGap;
    var lineBox = tiltEl('div', 'tl-linebox');
    lineBox.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:' + smGap + 'px;';

    var colors = tiltLineColors(tuning.colorScheme, theme);
    var fontStack = CM_resolveThemeFontStack(theme);
    var targetIndex = computeVisibleTarget(currentTime.get(), segTimingsCache, line);
    visibleSegIndex = targetIndex;
    segs = [];

    for (var si = 0; si < layout.segments.length; si++) {
      var segment = layout.segments[si];
      var visible = si <= targetIndex;
      var baseFontScale = lyricsFontScale * layout.scaleMultiplier;   /* :346 */
      var shortLastBoost = segment.isShortLastLine ? 1.18 : 1;        /* :347 */
      var tiltFontPx = Math.min(vw * 0.06875 * baseFontScale, 5.625 * TILT_REM_PX * baseFontScale);  /* :349 */
      var yOffset = tiltFontPx / 6;                                   /* :350 */
      var normalFontSize = 'clamp(' + (3.125 * baseFontScale * shortLastBoost).toFixed(3) + 'rem, ' +
        (6.875 * baseFontScale * shortLastBoost).toFixed(3) + 'vw, ' +
        (5.625 * baseFontScale * shortLastBoost).toFixed(3) + 'rem)';  /* :351 */
      var tiltFontSize = 'clamp(' + (3.125 * baseFontScale).toFixed(3) + 'rem, ' +
        (6.875 * baseFontScale).toFixed(3) + 'vw, ' +
        (5.625 * baseFontScale).toFixed(3) + 'rem)';                   /* :352 */

      var isTilt = segment.isTilt;
      var segVariants = tiltMakeSegVariants(isTilt, isTilt ? tiltFontSize : normalFontSize,
        isTilt ? colors.tilt : colors.normal,
        CM_resolveThemeFontWeight(theme, isTilt ? 300 : 400), theme);

      var segEl = tiltEl('div', isTilt ? 'tl-seg tl-seg-tilt' : 'tl-seg', segVariants.css);

      /* graphemes（:372-375）+ charIndexMap（:388-395） */
      var graphemes = tiltGraphemeSegmenter
        ? Array.from(tiltGraphemeSegmenter.segment(segment.text))
        : Array.from(segment.text).map(function (ch, i) { return { segment: ch, index: i }; });
      var charIndexMap = [];
      var idxAcc = 0;
      for (var gm = 0; gm < graphemes.length; gm++) {
        var isSpaceG = /^\s+$/.test(graphemes[gm].segment);
        if (!isSpaceG) idxAcc++;
        charIndexMap.push(idxAcc - 1);
      }

      /* charTimings（:378-381） */
      var charTimings = line
        ? tiltBuildCharTimings(segment.charOffset, segment.text,
          segTimingsCache ? segTimingsCache[si].start : 0,
          segTimingsCache ? segTimingsCache[si].end : 0, line)
        : [];

      /* 逐字 span（:448-477 normal / :499-535 tilt） */
      var chars = [];
      var visualIndex = 0;   /* JSX 渲染体 :448-449/:499-504 的非空格计数 */
      for (var ti = 0; ti < graphemes.length; ti++) {
        var gseg = graphemes[ti].segment;
        var isSpace = /^\s+$/.test(gseg);
        var isEven = visualIndex % 2 === 0;
        var yStagger = isEven ? -1 : 1;
        var ci = visualIndex;
        if (!isSpace) visualIndex++;

        var charVariants = tiltMakeCharVariants(isTilt, isSpace, ci, yStagger, yOffset);
        var span = tiltEl('span', 'tl-char');
        span.style.cssText = 'display:inline-block;transition:transform 0.06s ease-out;' +
          (isSpace ? (isTilt ? 'min-width:0.35em;' : 'min-width:0.25em;') : '');
        span.textContent = isSpace ? '\u00A0' : gseg;

        segEl.appendChild(span);
        chars.push({ el: span, isSpace: isSpace, ci: ci, variants: charVariants, lastScale: null });
      }

      lineBox.appendChild(segEl);
      var segRec = {
        el: segEl, variants: segVariants, isTilt: isTilt,
        chars: chars, charTimings: charTimings, visible: visible
      };
      segs.push(segRec);

      /* initial（:434/:484）+ 当前可见态（React 挂载帧 animate prop 立即生效） */
      mmSetInitial(segEl, segVariants.initial, null);
      mmApplyVariant(segEl, segVariants.variants, visible ? 'shown' : 'hidden', null);
      for (var cs = 0; cs < chars.length; cs++) {
        var chRec = chars[cs];
        mmSetInitial(chRec.el, chRec.variants.initial, null);
        mmApplyVariant(chRec.el, chRec.variants.variants, visible ? 'shown' : 'hidden', null);
      }
    }

    slots.appendChild(lineBox);
    activeLineEl = lineBox;

    /* 行块进出（:643-645 initial/animate/exit；initial/animate 用 framer
       缺省 tween 0.3 easeOut，exit 显式 0.45 easeInOut） */
    var lineMotion = {
      initial: { opacity: 0 },
      variants: {
        enter: { opacity: 1, transition: { duration: 0.3, ease: mmCubicBezier(0, 0, 0.58, 1) } },
        exit: { opacity: 0, transition: { duration: 0.45, ease: MM_EASE.easeInOut } }
      }
    };
    mmSetInitial(lineBox, lineMotion.initial, null);
    mmApplyVariant(lineBox, lineMotion.variants, 'enter', null);
    lineBox.__exitVariant = lineMotion.variants.exit;
  }

  /* 行退出（AnimatePresence exit + popLayout 移除等价；exit 向下传播——
     段级 exit 同步播放，字符无 exit 不动；移除延迟取最长 exit 0.6s + 余量） */
  function exitLine() {
    if (!activeLineEl) return;
    var old = activeLineEl;
    activeLineEl = null;
    mmApplyVariant(old, { exit: old.__exitVariant || { opacity: 0, transition: { duration: 0.45, ease: MM_EASE.easeInOut } } }, 'exit', null);
    for (var i = 0; i < old.childNodes.length; i++) {
      var segEl = old.childNodes[i];
      var segRec = null;
      for (var s = 0; s < segs.length; s++) { if (segs[s].el === segEl) segRec = segs[s]; }
      if (segRec) mmApplyVariant(segEl, segRec.variants, 'exit', null);
    }
    segs = [];
    segTimingsCache = null;
    var timer = setTimeout(function () {
      if (old.parentNode) old.parentNode.removeChild(old);
    }, 690);
    exitTimers.push(timer);
  }

  function clearExitTimers() {
    for (var i = 0; i < exitTimers.length; i++) clearTimeout(exitTimers[i]);
    exitTimers = [];
  }

  /* ---------- 底部字幕（VisualizerSubtitleOverlay :48-215 等价；
     MineRadio 无 romanization/alternateTexts → 单 translation 轨，classic 同构） ---------- */
  function renderSubtitle(activeLine, recentCompletedLine, nextLines) {
    var shouldRender = showText && showSubtitleTranslation && !hideTranslationSubtitle;
    var translation = null;
    if (shouldRender) {
      var candidates = [activeLine, recentCompletedLine];
      for (var i = 0; i < candidates.length; i++) {
        var line = candidates[i];
        var text = line && line.translation ? String(line.translation) : '';
        if (text && tiltHasReadableText(text)) { translation = text; break; }
      }
    }
    var upcoming = [];
    if (shouldRender && !translation && activeLine) {
      upcoming = (nextLines || []).filter(function (l) { return tiltHasReadableText(l.fullText); });
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
    var content = tiltEl('div');
    content.style.cssText = 'position:relative;display:inline-block;padding:2px 6px;';

    if (translation) {
      var glowBg = tiltEl('div');
      glowBg.setAttribute('aria-hidden', 'true');
      /* blur-2xl = 40px（Tailwind 尺阶；原为 24px 是 blur-xl 的值——已对齐原版
         VisualizerSubtitleOverlay.tsx:157 className blur-2xl）；
         translateZ(0) 同原版 ：154-155 合成层 workaround */
      glowBg.style.cssText = 'position:absolute;left:-40px;right:-40px;top:-24px;bottom:-24px;z-index:0;filter:blur(40px);transform:translateZ(0);' +
        'background:radial-gradient(ellipse 115% 130% at center, ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.96) + ' 0%, ' +
        CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.78) + ' 62%, transparent 100%);';
      content.appendChild(glowBg);
      var transEl = tiltEl('div');
      /* 行样式（:184-192）：translation 专用字体栈（resolveThemeTranslationFontStack
         ——TRANSLATION_FONT_STACKS 回退栈，非歌词栈）+ 字重 resolveThemeFontWeight
         (theme, 500)（主行 500 回退；副行 400/×0.88/0.82 为 romanization 多轨，
         MineRadio 无 alternateTexts → 单轨） */
      transEl.style.cssText = 'position:relative;z-index:10;max-width:56rem;margin:0 auto;color:' + (theme.secondaryColor || theme.primaryColor) +
        ';font-size:' + subtitleSizes.translationFontSize +
        ';font-family:' + CM_resolveThemeTranslationFontStack(theme) +
        ';font-weight:' + CM_resolveThemeFontWeight(theme, 500) +
        ';text-shadow:0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.24) + ';';
      transEl.textContent = translation;
      content.appendChild(transEl);
      /* translation 行入场（:175-179 motion.div initial{opacity:0,y:10} →
         animate{opacity:1,y:0}，framer 缺省 tween 0.3 easeOut；key=行起始时间
         ——行切换时重建重播，本引擎 subtitleKey 含行数据等价达成） */
      mmSetInitial(transEl, { opacity: 0, y: 10 }, null);
      mmApplyVariant(transEl, {
        enter: { opacity: 1, y: 0, transition: { duration: 0.3, ease: mmCubicBezier(0, 0, 0.58, 1) } }
      }, 'enter', null);
    } else {
      var upWrap = tiltEl('div');
      upWrap.style.cssText = 'position:relative;z-index:10;display:flex;flex-direction:column;gap:8px;align-items:center;';
      for (var u = 0; u < upcoming.length; u++) {
        var p = tiltEl('p');
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

  /* ---------- 主循环（App 时钟等价：每帧轮询 MV + 行管理） ---------- */
  var lastViewportW = 0;

  function tick() {
    if (destroyed) return;
    var now = currentTime.get();
    if (now !== lastTime) {
      lastTime = now;
      currentTime.emit(now);   /* useInsertionEffect 订阅的 change 派发等价 */
    }

    var idx = tiltFindLineIndexAtTime(lines, now);
    var activeLine = idx >= 0 ? lines[idx] : null;
    var key = activeLine ? String(activeLine.startTime) : null;

    /* 空态显隐（:664-674 AnimatePresence 分支等价；显示态 inline opacity 1，
       压过 className opacity-50——framer inline style 优先级语义） */
    idle.style.opacity = activeLine ? '0' : '1';

    if (key !== currentLineKey) {
      currentLineKey = key;
      activeLineRef = activeLine;
      if (activeLine) {
        exitLine();
        renderLine(activeLine);
        /* recentCompletedLine（runtime.ts:35）+ 下一句预览 */
        var recent = tiltGetRecentCompletedLine(lines, idx, now, CM_getLineRenderEndTime);
        renderSubtitle(activeLine, recent, tiltGetUpcomingLines(lines, idx, 2));
      } else {
        exitLine();
        segs = [];
        segTimingsCache = null;
        var recent2 = tiltGetRecentCompletedLine(lines, idx, now, CM_getLineRenderEndTime);
        renderSubtitle(null, recent2, tiltGetUpcomingLines(lines, idx, 2));
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  function onResize() {
    if (destroyed) return;
    var w = (typeof window !== 'undefined' && window.innerWidth) || 1200;
    if (w !== lastViewportW) {
      /* 视口变化 → layout memo 重算（:576-579 依赖 viewportWidth），强制重建当前行 */
      lastViewportW = w;
      currentLineKey = null;
    }
  }
  window.addEventListener('resize', onResize);

  rafId = requestAnimationFrame(tick);

  return {
    destroy: function () {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      clearExitTimers();
      window.removeEventListener('resize', onResize);
      if (shell.parentNode) shell.parentNode.removeChild(shell);
      segs = [];
      activeLineEl = null;
    },
    setLines: function (next) { lines = next || []; currentLineKey = null; },
    setTheme: function (next) {
      theme = next;
      tuning = tiltResolveTuning(tuning);
      shell.style.fontFamily = CM_resolveThemeFontStack(theme);
      shell.style.fontWeight = CM_resolveThemeFontWeight(theme, 400);
      idle.style.color = theme.secondaryColor || theme.primaryColor;
      currentLineKey = null;
      subtitleKey = null;
    },
    setFontScale: function (n) {
      lyricsFontScale = n != null ? n : 1;
      subtitleSizes = CM_resolveSubtitleFontSizes(lyricsFontScale);
      currentLineKey = null;
    },
    setTuning: function (t) {
      tuning = tiltResolveTuning(t);
      currentLineKey = null;
    }
  };
}
