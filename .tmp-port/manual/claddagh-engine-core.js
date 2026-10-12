/* =========================================================================
   claddagh 渲染核心 —— Folia claddagh VisualizerCladdagh.tsx 的无构建 DOM 忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     src/components/visualizer/claddagh/VisualizerCladdagh.tsx（渲染核心全量：
     椭圆环逐字投影 / pretext 测量 / 行转角弹簧 / 轴线 rAF / 深度混合公式）
     src/components/visualizer/runtime.ts:35-86（当前行/最近完成行/下一句）
     src/components/visualizer/VisualizerShell.tsx:126-134（字体 inline 壳）
     src/components/visualizer/VisualizerSubtitleOverlay.tsx +
       src/utils/lyrics/subtitleTrackStyle.ts（底部字幕/下一句预览）
     src/utils/appPlaybackHelpers.ts:21-31（findLatestActiveLineIndex ——
       Folia 宿主写 playbackStore.currentLineIndex 的权威语义）
     src/types.ts:457-469（CladdaghTuning / DEFAULT_CLADDAGH_TUNING）

   结构对应（React → 无构建 DOM）：
     VisualizerShell            → cl-shell（fontFamily/fontWeight inline，同 :128-134）
     主容器 motion.div（:1007-1011）→ cl-main（enter 0.8s ease [0.16,1,0.3,1]，mm 驱动）
     RingLine（:364-773）       → 行池对象 { root, spans, spacingInfo, update }
                                  （useLayoutEffect 订阅 → 引擎主循环每帧
                                   update(now)——依赖快照现取，与 framer
                                   MV change 派发等价）
     useMotionValue(lineOffset) → 数值弹簧（animate spring k55/c14/m0.9，:974-979）
     useSpring(audioBands.bass/vocal)（:817-824）→ 数值弹簧 k150/c25、k120/c24
     useVisualizerRuntime       → claddaghGetRecentCompletedLine / getUpcomingLines
     VisualizerSubtitleOverlay  → cl-sub（translationFontSize/upcomingFontSize 用
                                   claddagh 传入值 clamp(1.1rem,2.2vw,1.45rem) /
                                   clamp(0.95rem,1.8vw,1.2rem)，:1071-1072）
     currentLineIndex prop      → claddaghFindLineIndexAtTime（宿主权威语义每帧算）
   pretext：prepareWithSegments/measureNaturalWidth 直接走全局 bundle
   （wrapper 形参，0.0.9 支持 options.letterSpacing/whiteSpace——测量与
     Folia 同 API 同参，:240-243 原样）。

   动画分派：字符样式（transform/opacity/color/textShadow/filter）由
   RingLine.update 每帧直写（Folia 同款逐帧直写，:640-728）；DOM 属性过渡
   （主容器入场/字幕显隐）经 mini-motion。MineRadio 宿主差异（桥内注明）：
   animationIntensity 固定 normal、wordColors 空表（buildWordColorRanges
   返回空 → charColor 全 null → highlightColor 回退——算法本体已随闭包
   落地并被测试覆盖）、audioBands 由桥自 frequencyData 供（覆盖层激活期
   主循环保温门控不写 bands 信号）。
   ========================================================================= */

/* ---------- tuning（types.ts:457-469 原值） ---------- */
var CLADDAGH_DEFAULT_TUNING = {
  focusScaleRatio: 0.65,
  radiusScale: 1.0,
  ellipseTiltDeg: 45,
  showAxisLine: true,
  letterSpacingOffset: 0
};

/* 面板 clamp（settingsPanels.tsx:20-22/:1140 原值） */
function claddaghClampFocusScaleRatio(val) { return Math.min(1.5, Math.max(0.0, val)); }
function claddaghClampRadiusScale(val) { return Math.min(1.5, Math.max(0.5, val)); }
function claddaghClampEllipseTiltDeg(val) { return Math.min(60, Math.max(0, val)); }
function claddaghClampLetterSpacingOffset(val) { return Math.min(20, Math.max(-5, val)); }

/* resolvedTuning（settingsPanels.tsx:1153-1159 同构） */
function claddaghResolveTuning(tuning) {
  var t = tuning || {};
  return {
    focusScaleRatio: claddaghClampFocusScaleRatio(t.focusScaleRatio != null ? t.focusScaleRatio : CLADDAGH_DEFAULT_TUNING.focusScaleRatio),
    radiusScale: claddaghClampRadiusScale(t.radiusScale != null ? t.radiusScale : CLADDAGH_DEFAULT_TUNING.radiusScale),
    ellipseTiltDeg: claddaghClampEllipseTiltDeg(t.ellipseTiltDeg != null ? t.ellipseTiltDeg : CLADDAGH_DEFAULT_TUNING.ellipseTiltDeg),
    showAxisLine: t.showAxisLine != null ? t.showAxisLine : CLADDAGH_DEFAULT_TUNING.showAxisLine,
    letterSpacingOffset: claddaghClampLetterSpacingOffset(t.letterSpacingOffset != null ? t.letterSpacingOffset : CLADDAGH_DEFAULT_TUNING.letterSpacingOffset)
  };
}

/* ---------- 基础工具（:22-37 / :181） ---------- */

/* isCJKChar（:22-24） */
function claddaghIsCJKChar(ch) {
  return /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(ch);
}

/* getVisualLength（:30-37）：CJK 记 1.0，半角记 0.5 */
function claddaghGetVisualLength(text) {
  if (!text) return 0;
  var score = 0;
  for (var i = 0; i < text.length; i++) {
    score += claddaghIsCJKChar(text[i]) ? 1.0 : 0.5;
  }
  return score;
}

/* clamp（:181） */
function claddaghClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

/* ---------- adjustCladdaghTimeline（:44-109 全同构） ----------
   零时长 gap 字符（空格/标点）向邻字安全借时并均匀摊开（每字符 60ms 下限） */
function claddaghAdjustTimeline(timeline, line) {
  if (timeline.length === 0) return timeline;

  var adjusted = timeline.map(function (item) {
    return { char: item.char, startTime: item.startTime, endTime: item.endTime };
  });
  var n = adjusted.length;
  var i = 0;

  while (i < n) {
    if (adjusted[i].startTime === adjusted[i].endTime) {
      var j = i;
      while (j < n && adjusted[j].startTime === adjusted[j].endTime) {
        j++;
      }
      var gapCount = j - i;
      var gapStart = i > 0 ? adjusted[i - 1].endTime : line.startTime;
      var gapEnd = j < n ? adjusted[j].startTime : line.endTime;

      var minNeeded = gapCount * 0.06; /* 60ms per character */
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
          var prevDuration2 = adjusted[i - 1].endTime - adjusted[i - 1].startTime;
          var prevSteal2 = Math.min(deficit, Math.max(0, prevDuration2 - 0.04));
          gapStart -= prevSteal2;
          adjusted[i - 1].endTime = gapStart;
        } else if (j < n) {
          var nextDuration2 = adjusted[j].endTime - adjusted[j].startTime;
          var nextSteal2 = Math.min(deficit, Math.max(0, nextDuration2 - 0.04));
          gapEnd += nextSteal2;
          adjusted[j].startTime = gapEnd;
        }
        duration = gapEnd - gapStart;
      }

      var gapUnit = duration > 0 ? duration / gapCount : 0;
      for (var k = i; k < j; k++) {
        var idxInGap = k - i;
        adjusted[k].startTime = gapStart + gapUnit * idxInGap;
        adjusted[k].endTime = gapStart + gapUnit * (idxInGap + 1);
      }
      i = j;
    } else {
      i++;
    }
  }

  return adjusted;
}

/* ---------- 环排常量（:112-119 原值） ---------- */
var CLADDAGH_MAX_ARC_SPAN = 4.25;
var CLADDAGH_LETTER_SPACING_EM = 0.04;
var CLADDAGH_BASE_TRACKING_EM = 0.18;
var CLADDAGH_BACK_FOLLOW_RATIO = 0.28;
var CLADDAGH_BACK_ORBIT_FOLLOW_RATIO = 0.52;
var CLADDAGH_NEXT_LINE_ENTRY_LEAD_SECONDS = 0.34;
var CLADDAGH_SPACING_CACHE_LIMIT = 240;
var claddaghSpacingCache = new Map();

/* getFallbackGraphemeWidth（:121-125） */
function claddaghGetFallbackGraphemeWidth(ch, fontPx) {
  if (/^\s+$/.test(ch)) return fontPx * 0.36;
  if (claddaghIsCJKChar(ch)) return fontPx;
  return fontPx * 0.62;
}

/* getFractionalActiveIndex（:131-177 全同构：插值 + renderEnd 外推 + 1.8 字上限） */
function claddaghGetFractionalActiveIndex(timeline, t, renderEnd) {
  if (timeline.length === 0) return 0;
  if (timeline.length === 1) {
    var item = timeline[0];
    var targetEnd = (typeof renderEnd === 'number' && isFinite(renderEnd)) ? renderEnd : item.endTime;
    var dur = Math.max(0.2, targetEnd - item.startTime);
    if (t <= item.startTime) return 0;
    return (t - item.startTime) / dur;
  }

  if (t <= timeline[0].startTime) return 0;

  var lastIdx = timeline.length - 1;
  /* 最后字符起点之后平滑外推/过冲，防止冻结（:148 注释同义） */
  if (t >= timeline[lastIdx].startTime) {
    var lastItem = timeline[lastIdx];

    if (typeof renderEnd === 'number' && isFinite(renderEnd) && renderEnd > lastItem.startTime) {
      var progress = claddaghClamp((t - lastItem.startTime) / (renderEnd - lastItem.startTime), 0, 1);
      return lastIdx + progress * 2.0;
    }

    var prevItem = timeline[lastIdx - 1];
    var itemDur = lastItem.endTime - lastItem.startTime;
    var gapDur = lastItem.startTime - prevItem.startTime;
    var stepDur = itemDur > 0 ? itemDur : (gapDur > 0 ? gapDur : 0.5);

    var progress2 = (t - lastItem.startTime) / stepDur;
    /* 过冲上限 1.8 字符单位（:163-165） */
    var cappedProgress = Math.min(progress2, 1.8);
    return lastIdx + cappedProgress;
  }

  for (var i2 = 0; i2 < timeline.length - 1; i2++) {
    var tStart = timeline[i2].startTime;
    var tEnd = timeline[i2 + 1].startTime;
    if (t >= tStart && t < tEnd) {
      if (tEnd === tStart) return i2;
      return i2 + (t - tStart) / (tEnd - tStart);
    }
  }
  return timeline.length - 1;
}

/* ---------- 辉光 drop-shadow 滤镜（:188-211 原值原式） ----------
   Lab > Fix lyric animation freeze on Linux 的 filter 形态：单层按
   text-shadow 半径一半拟合（text-shadow 半径是两个 sigma、drop-shadow
   一个）；副歌三层 0.4x + 弱中间层（层叠自阴影补偿）。 */
var CLADDAGH_GLOW_DROP_SHADOW_SCALE = 0.5;
var CLADDAGH_CHORUS_DROP_SHADOW_SCALE = 0.4;
var CLADDAGH_CHORUS_MIDDLE_ALPHA = 0.2;

function claddaghBuildGlowFilter(color, coreColor, radius, glyphAlpha, fade, isChorus) {
  var glow = function (alpha) { return CM_mixColors(color, color, 0, alpha); };
  if (!isChorus) {
    return 'drop-shadow(0 0 ' + (radius * CLADDAGH_GLOW_DROP_SHADOW_SCALE).toFixed(2) + 'px ' + glow(fade) + ')';
  }
  var scale = CLADDAGH_CHORUS_DROP_SHADOW_SCALE;
  var core = CM_mixColors(color, coreColor, 0.65, claddaghClamp(fade / Math.max(glyphAlpha, 0.01), 0, 1));
  return 'drop-shadow(0 0 ' + (radius * 0.35 * scale).toFixed(2) + 'px ' + core + ') '
    + 'drop-shadow(0 0 ' + (radius * scale).toFixed(2) + 'px ' + glow(fade * CLADDAGH_CHORUS_MIDDLE_ALPHA) + ') '
    + 'drop-shadow(0 0 ' + (radius * 1.6 * scale).toFixed(2) + 'px ' + glow(fade) + ')';
}

/* shouldHoldCladdaghFrameForPlaybackReset（:213-217）：切歌时间回跳保持帧 */
function claddaghShouldHoldResetFrame(previousTime, currentTime, centerLineIndex) {
  return centerLineIndex > 0 && currentTime <= 0.5 && currentTime < previousTime - 0.5;
}

/* normalizeReadableAngle（:220-225）：切线角折叠到 ±90° 保持可读 */
function claddaghNormalizeReadableAngle(degrees) {
  var normalized = degrees;
  while (normalized > 90) normalized -= 180;
  while (normalized < -90) normalized += 180;
  return normalized;
}

/* ---------- pretext 测量（:227-268 同 API 同参） ---------- */

function claddaghRememberSpacingOffsets(key, offsets) {
  if (claddaghSpacingCache.size >= CLADDAGH_SPACING_CACHE_LIMIT) {
    var oldestKey = claddaghSpacingCache.keys().next().value;
    if (oldestKey) {
      claddaghSpacingCache.delete(oldestKey);
    }
  }
  claddaghSpacingCache.set(key, offsets);
  return offsets;
}

/* measureCladdaghTextWidth（:238-246）：pretext shaping 后宽度（含 letterSpacing） */
function claddaghMeasureTextWidth(text, fontSpec, fontPx, fallbackWidth, pretext) {
  if (!text) return 0;
  var prepared = pretext.prepareWithSegments(text, fontSpec, {
    whiteSpace: 'pre-wrap',
    letterSpacing: fontPx * CLADDAGH_LETTER_SPACING_EM,
  });
  var measuredWidth = pretext.measureNaturalWidth(prepared);
  return isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : fallbackWidth;
}

/* measureCladdaghGraphemeOffsets（:249-268）：前缀累计字心推进位置（缓存） */
function claddaghMeasureGraphemeOffsets(graphemes, fontSpec, fontPx, letterSpacingOffsetPx, pretext) {
  var text = graphemes.join('');
  var cacheKey = fontPx + '|' + fontSpec + '|' + CLADDAGH_BASE_TRACKING_EM + '|' + letterSpacingOffsetPx + '|' + text;
  var cached = claddaghSpacingCache.get(cacheKey);
  if (cached) return cached;

  var offsets = new Array(graphemes.length + 1);
  var i;
  for (i = 0; i <= graphemes.length; i++) offsets[i] = 0;
  var fallbackWidth = 0;
  for (i = 1; i <= graphemes.length; i += 1) {
    fallbackWidth += claddaghGetFallbackGraphemeWidth(graphemes[i - 1], fontPx);
    var baseTracking = Math.max(0, i - 1) * fontPx * CLADDAGH_BASE_TRACKING_EM;
    /* 每个字符间隙累加 letterSpacingOffsetPx，增大字符之间的距离 */
    var extraOffset = Math.max(0, i - 1) * letterSpacingOffsetPx;
    offsets[i] = Math.max(
      offsets[i - 1],
      claddaghMeasureTextWidth(graphemes.slice(0, i).join(''), fontSpec, fontPx, fallbackWidth, pretext) + baseTracking + extraOffset
    );
  }
  return claddaghRememberSpacingOffsets(cacheKey, offsets);
}

/* buildMeasuredSpacingInfo（:270-297）：字心角 + 名义角（弧长超 CLADDAGH_MAX_ARC_SPAN 压缩） */
function claddaghBuildMeasuredSpacingInfo(items, fontSpec, fontPx, radiusPx, spacingScale, letterSpacingOffsetPx, pretext) {
  if (items.length === 0) return [];
  var graphemes = items.map(function (item) { return item.char; });
  var offsets = claddaghMeasureGraphemeOffsets(graphemes, fontSpec, fontPx, letterSpacingOffsetPx, pretext);
  var safeSpacingScale = isFinite(spacingScale) ? Math.max(0.1, spacingScale) : 1;
  var totalWidth = (offsets[offsets.length - 1] != null ? offsets[offsets.length - 1] : 0) * safeSpacingScale;
  var safeRadius = Math.max(radiusPx, fontPx * 2, 1);
  var totalSpan = totalWidth / safeRadius;
  var scaleFactor = totalSpan > CLADDAGH_MAX_ARC_SPAN ? CLADDAGH_MAX_ARC_SPAN / totalSpan : 1.0;

  return items.map(function (item, index) {
    var centerPx = ((offsets[index] != null ? offsets[index] : 0) + (offsets[index + 1] != null ? offsets[index + 1] : (offsets[index] != null ? offsets[index] : 0))) / 2 * safeSpacingScale;
    var startAngle = centerPx / safeRadius;
    return {
      char: item.char,
      startTime: item.startTime,
      endTime: item.endTime,
      charColor: item.charColor,
      startAngle: startAngle,
      nominalAngle: (startAngle - totalSpan / 2) * scaleFactor,
      scaleFactor: scaleFactor
    };
  });
}

/* 字符数据映射（spacingInfo memo :403-424 的 timeline→data 段）：
   逐字时间线 + wordColor 区间重叠检测（startOffset < range.endOffset &&
   range.startOffset < endOffset）。 */
function claddaghBuildCharData(line, wordColors) {
  var timeline = claddaghAdjustTimeline(CM_buildLineGraphemeTimeline(line), line);
  var wordColorRanges = CM_buildWordColorRanges(line.fullText, wordColors);

  var codeUnitCursor = 0;
  return timeline.map(function (t) {
    var charLength = t.char.length;
    var startOffset = codeUnitCursor;
    var endOffset = codeUnitCursor + charLength;
    codeUnitCursor = endOffset;

    var matchedRange = null;
    for (var r = 0; r < wordColorRanges.length; r++) {
      var range = wordColorRanges[r];
      if (startOffset < range.endOffset && range.startOffset < endOffset) { matchedRange = range; break; }
    }
    var charColor = matchedRange ? matchedRange.color : null;

    return {
      char: t.char, startTime: t.startTime, endTime: t.endTime,
      charColor: charColor
    };
  });
}

/* getLineWordOffset（:299-320）：环上字偏移（分数索引插值 + 外推） */
function claddaghGetLineWordOffset(spacingInfo, latestTime, renderEnd) {
  if (spacingInfo.length === 0) return 0;
  var fractionalIndex = claddaghGetFractionalActiveIndex(spacingInfo, latestTime, renderEnd);
  var lastIdx = spacingInfo.length - 1;
  if (fractionalIndex <= lastIdx) {
    var intPart = Math.floor(fractionalIndex);
    var fracPart = fractionalIndex - intPart;
    var angleA = spacingInfo[intPart] ? spacingInfo[intPart].nominalAngle : 0;
    var angleB = spacingInfo[Math.min(intPart + 1, lastIdx)] ? spacingInfo[Math.min(intPart + 1, lastIdx)].nominalAngle : 0;
    return angleA + (angleB - angleA) * fracPart;
  }

  var lastAngle = spacingInfo[lastIdx] ? spacingInfo[lastIdx].nominalAngle : 0;
  var prevAngle = spacingInfo[Math.max(0, lastIdx - 1)] ? spacingInfo[Math.max(0, lastIdx - 1)].nominalAngle : 0;
  var step = lastAngle - prevAngle;
  var overshoot = fractionalIndex - lastIdx;
  return lastAngle + step * overshoot;
}

/* getLinePlaybackProgress（:322-337）：环上播放进度 0..1 */
function claddaghGetLinePlaybackProgress(spacingInfo, latestTime, renderEnd) {
  if (spacingInfo.length === 0) return 0;
  if (spacingInfo.length === 1) {
    var item = spacingInfo[0];
    var targetEnd = (typeof renderEnd === 'number' && isFinite(renderEnd)) ? renderEnd : item.endTime;
    var duration = Math.max(0.001, targetEnd - item.startTime);
    return claddaghClamp((latestTime - item.startTime) / duration, 0, 1);
  }

  var fractionalIndex = claddaghGetFractionalActiveIndex(spacingInfo, latestTime, renderEnd);
  return claddaghClamp(fractionalIndex / Math.max(1, spacingInfo.length - 1), 0, 1);
}

/* ---------- runtime.ts 纯函数等价（:35-86） ---------- */

/* getRecentCompletedLine（runtime.ts:35-52；claddagh 调用处 :809-813 未传
   getLineEndTime → 默认 line.endTime） */
function claddaghGetRecentCompletedLine(lines, currentLineIndex, currentTime) {
  if (currentLineIndex !== -1 || !lines || lines.length === 0) return null;
  for (var i = lines.length - 1; i >= 0; i--) {
    if (currentTime > lines[i].endTime) return lines[i];
  }
  return null;
}

/* getUpcomingLine（runtime.ts:56-73） */
function claddaghGetUpcomingLine(lines, currentLineIndex, currentTime) {
  var activeLine = lines[currentLineIndex];
  if (activeLine) {
    return lines[currentLineIndex + 1] != null ? lines[currentLineIndex + 1] : null;
  }
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].startTime > currentTime) return lines[i];
  }
  return null;
}

/* getUpcomingLines（runtime.ts:76-86） */
function claddaghGetUpcomingLines(lines, currentLineIndex, count) {
  if (currentLineIndex < 0) return [];
  return lines.slice(currentLineIndex + 1, currentLineIndex + 1 + count);
}

/* hasReadableText（VisualizerSubtitleOverlay.tsx:20）——纯标记行永不进字幕 */
function claddaghHasReadableText(text) {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

/* subtitleTrackStyle.ts 常量原值（第二行轨道；MineRadio 无 romanization
   → 单轨恒不触发，保留结构与原值） */
var CLADDAGH_SECONDARY_TRACK_SIZE_FACTOR = 0.88;
var CLADDAGH_SECONDARY_TRACK_OPACITY = 0.82;
var CLADDAGH_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK = 400;
var CLADDAGH_SECONDARY_TRACK_GAP_EM = 0.25;

/* findLatestActiveLineIndex（appPlaybackHelpers.ts:21-31）——Folia 宿主
   写 playbackStore.currentLineIndex 的权威语义（renderEndTime 收尾窗） */
function claddaghFindLineIndexAtTime(lines, time) {
  for (var index = (lines ? lines.length : 0) - 1; index >= 0; index--) {
    var line = lines[index];
    if (!line || time < line.startTime) continue;
    if (time <= ((line.renderHints && line.renderHints.renderEndTime != null) ? line.renderHints.renderEndTime : line.endTime)) {
      return index;
    }
  }
  return -1;
}

/* ---------- DOM 工具 ---------- */

function claddaghEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function claddaghEl(tag, className, styleText) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (styleText) el.style.cssText = styleText;
  return el;
}

/* scaleFontSize（VisualizerSubtitleOverlay.tsx:117）——rem/vw/px 逐段 × factor */
function claddaghScaleFontSize(fontSize, factor) {
  return String(fontSize).replace(/(-?\d*\.?\d+)(rem|vw|px)/g, function (_m, value, unit) {
    return (Number(value) * factor).toFixed(3) + unit;
  });
}

/* ---------- 数值弹簧（framer useSpring/animate spring 同构：
   半隐式欧拉，子步 1/120，restSpeed/restDelta 0.01，寿命上限 8s——
   与 mini-motion spring 分支同积分语义，作用于纯数值 MV） ---------- */

function claddaghMakeSpring(initial) {
  return {
    value: initial || 0, vel: 0, target: initial || 0, animating: false, life: 0,
    k: 200, c: 20, mass: 1
  };
}

function claddaghSpringSetTarget(sp, target, k, c, mass) {
  sp.target = target;
  sp.k = k != null ? k : 200;
  sp.c = c != null ? c : 20;
  sp.mass = mass != null ? mass : 1;
  sp.animating = true;
  sp.life = 0;
}

function claddaghSpringSetValue(sp, value) {
  sp.value = value;
  sp.vel = 0;
  sp.target = value;
  sp.animating = false;
}

function claddaghSpringStep(sp, dt) {
  if (!sp.animating) return;
  var sdt = Math.min(dt, 1 / 30);
  sp.life += sdt;
  var steps = Math.max(1, Math.ceil(sdt / (1 / 120)));
  var h = sdt / steps;
  for (var s = 0; s < steps; s++) {
    var force = sp.k * (sp.target - sp.value) - sp.c * sp.vel;
    sp.vel += force * h / sp.mass;
    sp.value += sp.vel * h;
  }
  if ((Math.abs(sp.vel) < 0.01 && Math.abs(sp.target - sp.value) < 0.01) || sp.life > 8) {
    sp.value = sp.target;
    sp.vel = 0;
    sp.animating = false;
  }
}

/* normalizePower（:394-400 / :801-807 同构）：>1 视为 raw 0-255 档并记忆 */
function claddaghMakeNormalizer() {
  var isRawScale = false;
  return function (power) {
    if (!isFinite(power)) return 0;
    if (power > 1.0) {
      isRawScale = true;
    }
    return Math.max(0, Math.min(1, isRawScale ? power / 255 : power));
  };
}

/* ---------- RingLine（:364-773 的宿主等价） ----------
   claddaghCreateRingLine(env, line, lineIndex)：建字符 span 池 + spacingInfo；
   update(latestTime, ctx) 为 useLayoutEffect handler（:434-730）主体全同构。 */

function claddaghCreateRingLine(eng, line, lineIndex) {
  var theme = eng.theme;
  var fontStack = CM_resolveThemeFontStack(theme);
  var baseFontSize = 72 * eng.lyricsFontScale;
  var fontWeight = CM_resolveThemeFontWeight(theme, 700);
  var fontSpec = fontWeight + ' ' + baseFontSize + 'px ' + fontStack;

  /* baseColor/highlightColor（:390-391） */
  var baseColor = CM_colorWithAlpha(theme.primaryColor, 0.55);
  var highlightColor = theme.accentColor || theme.primaryColor;

  /* spacingInfo memo（:403-427） */
  var data = claddaghBuildCharData(line, theme.wordColors);
  var spacingInfo = claddaghBuildMeasuredSpacingInfo(
    data, fontSpec, baseFontSize, eng.Rx,
    eng.activeTextSpacingScale, eng.tuning.letterSpacingOffset, eng.pretext);

  /* 字符 span 池（:746-771 JSX 展开）：绝对定心 + 初值 opacity 0 / scale 0.2 */
  var root = claddaghEl('div', 'cl-line');
  root.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  var spans = [];
  var html = '';
  for (var i = 0; i < spacingInfo.length; i++) {
    html += '<span class="cl-char">' + claddaghEsc(spacingInfo[i].char) + '</span>';
  }
  root.innerHTML = html;
  var spanEls = root.children;
  for (var k = 0; k < spanEls.length; k++) {
    var sp = spanEls[k];
    sp.style.cssText =
      'position:absolute;left:50%;top:50%;opacity:0;' +
      'transform:translate3d(-50%, -50%, 0px) scale(0.2);' +
      'transform-origin:center center;' +
      'will-change:transform, opacity, filter, color, text-shadow;' +
      'font-family:' + fontStack + ';' +
      'font-size:' + baseFontSize + 'px;' +
      'font-weight:' + fontWeight + ';' +
      'letter-spacing:' + CLADDAGH_LETTER_SPACING_EM + 'em;' +
      'white-space:nowrap;' +
      'color:' + baseColor + ';';
    spans.push(sp);
  }

  var rec = {
    root: root, spans: spans, spacingInfo: spacingInfo,
    line: line, lineIndex: lineIndex,
    baseColor: baseColor, highlightColor: highlightColor,
    normalizePower: claddaghMakeNormalizer()   /* :393-400 per-instance ref */
  };

  /* update —— useLayoutEffect handler（:434-730）全同构。
     React 的订阅在依赖变化时以最新闭包重建；此处每帧以引擎当前快照执行，
     行为等价（framer currentTime MV 每帧 change 派发同一 handler）。 */
  rec.update = function (latestTime, ctx) {
    var centerLineIndex = ctx.centerLineIndex;
    /* MotionValue 时间在 React 提交前行索引前重置：保持已完成帧，
       不在时间零点渲染旧末行（:440-445；flag 保持至 centerLineIndex<=0，
       由主循环同步清除——各 RingLine 序列一致，宿主级单份等价） */
    if (ctx.holdReset && centerLineIndex > 0) {
      return;
    }

    var mvsLength = rec.spacingInfo.length;
    if (mvsLength === 0) return;

    var curLineOffset = ctx.lineOffset;
    var power = rec.normalizePower(ctx.smoothedBass);
    var intensity = ctx.theme.animationIntensity || 'normal';
    var intensityMultiplier = 0.25;
    var maxScale = 1.25;

    if (intensity === 'calm') {
      intensityMultiplier = 0.08;
      maxScale = 1.08;
    } else if (intensity === 'chaotic') {
      intensityMultiplier = 0.95;
      maxScale = 1.95;
    }

    /* 半径缩放（有界，:464-467） */
    var scaleFactor = Math.min(1 + power * intensityMultiplier, maxScale);
    var currentRx = ctx.Rx * scaleFactor;
    var currentRy = ctx.Ry * scaleFactor;
    void currentRy;   /* handler 内仅经 R_major/R_minor 消费 currentRx（:537-539），Ry 形参保留 */

    var isUpcomingLine = rec.lineIndex > centerLineIndex;
    var upcomingEntryProgress = isUpcomingLine
      ? claddaghClamp((latestTime - (rec.line.startTime - CLADDAGH_NEXT_LINE_ENTRY_LEAD_SECONDS)) / CLADDAGH_NEXT_LINE_ENTRY_LEAD_SECONDS, 0, 1)
      : 0;
    var lineDiffFromCenter = Math.abs(curLineOffset - rec.lineIndex * Math.PI) / Math.PI;

    /* 长短句重叠消减（:475-496） */
    var lines = ctx.lines;
    var currentLine = lines[centerLineIndex];
    var currentLen = currentLine ? claddaghGetVisualLength(currentLine.fullText) : 0;
    var targetLine = lines[rec.lineIndex];
    var targetLen = targetLine ? claddaghGetVisualLength(targetLine.fullText) : 0;

    var lengthFadeFactor = 1.0;
    var lengthScaleFactor = 1.0;

    if (rec.lineIndex > centerLineIndex && currentLen > 10) {
      var fadeStrength = claddaghClamp((currentLen - 10) / 8, 0, 1);
      var targetStrength = claddaghClamp((targetLen - 5) / 5, 0.4, 1);
      var combinedStrength = fadeStrength * targetStrength;

      var targetMinOpacity = 1.0 - combinedStrength;
      var targetMinScale = 1.0 - combinedStrength * 0.25;

      var transitionProgress = claddaghClamp((lineDiffFromCenter - 0.4) / 0.5, 0, 1);

      lengthFadeFactor = 1.0 - (1.0 - targetMinOpacity) * transitionProgress;
      lengthScaleFactor = 1.0 - (1.0 - targetMinScale) * transitionProgress;
    }

    /* renderEnd 拓展到下一行起点（减 lead），器乐段环持续慢转（:497-512） */
    var renderBaseIndex = ctx.renderBaseIndex;
    var activeLine = lines[renderBaseIndex];
    var activeNextLine = lines[renderBaseIndex + 1];
    var activeRenderEnd = activeLine
      ? Math.max(
        (activeLine.renderHints && activeLine.renderHints.renderEndTime != null) ? activeLine.renderHints.renderEndTime : activeLine.endTime,
        activeNextLine ? activeNextLine.startTime - CLADDAGH_NEXT_LINE_ENTRY_LEAD_SECONDS : activeLine.endTime + 10.0
      )
      : undefined;

    var nextLine = lines[rec.lineIndex + 1];
    var ownRenderEnd = Math.max(
      (rec.line.renderHints && rec.line.renderHints.renderEndTime != null) ? rec.line.renderHints.renderEndTime : rec.line.endTime,
      nextLine ? nextLine.startTime - CLADDAGH_NEXT_LINE_ENTRY_LEAD_SECONDS : rec.line.endTime + 10.0
    );

    var activeWordOffset = claddaghGetLineWordOffset(ctx.activeSpacingInfo, latestTime, activeRenderEnd);
    var ownWordOffset = claddaghGetLineWordOffset(rec.spacingInfo, latestTime, ownRenderEnd);
    var activeLineProgress = claddaghGetLinePlaybackProgress(ctx.activeSpacingInfo, latestTime, activeRenderEnd);
    var backOrbitFollow = Math.PI
      * CLADDAGH_BACK_ORBIT_FOLLOW_RATIO
      * (1 - Math.pow(1 - activeLineProgress, 1.35));
    var wordOffset = ownWordOffset;
    if (rec.lineIndex < centerLineIndex) {
      /* 已唱行保留自身完成时的字偏移，避免回跳（:521-524） */
    } else {
      /* back-follow 随 lineDiffFromCenter 连续淡出（:525-535） */
      var backFollowFactor = rec.lineIndex > centerLineIndex
        ? 1
        : claddaghClamp(lineDiffFromCenter, 0, 1);
      wordOffset += (
        activeWordOffset * CLADDAGH_BACK_FOLLOW_RATIO
        + backOrbitFollow
      ) * backFollowFactor;
    }

    var R_ref = currentRx;
    var R_major = currentRx;
    var R_minor = currentRx * 0.09;   /* 扁长椭圆小轴（:539） */

    var lineIsChorus = !!rec.line.isChorus;
    var fontPx = 72 * ctx.lyricsFontScale;
    var focusScaleRatio = ctx.tuning.focusScaleRatio;
    var ellipseTiltDeg = ctx.tuning.ellipseTiltDeg;
    var coreColor = ctx.theme.primaryColor || '#ffffff';
    var glowAsFilter = CM_isGlowBlurQuantized();

    for (var i = 0; i < mvsLength; i++) {
      var el = rec.spans[i];
      if (!el) continue;

      var item = rec.spacingInfo[i];
      var nominalAngle = item.nominalAngle;

      var theta = rec.lineIndex * Math.PI + nominalAngle;   /* 行间 180° 间隔（:548） */
      var psi = theta - curLineOffset - wordOffset;

      /* deltaDist：沿弧的线性距离（px） */
      var deltaDist = psi * R_ref;

      /* 长轴上的角 */
      var thetaCurve = deltaDist / R_major;

      /* 深度因子 D（前 1 / 后 0） */
      var localCos = Math.cos(thetaCurve);
      var D = (localCos + 1) / 2;

      /* 背面字距收敛（:561-562） */
      var spacingFactor = 0.35 + 0.65 * Math.pow(D, 1.2);

      /* 椭圆坐标（旋转前，活动字在 (0, R_minor)） */
      var rawX = Math.sin(thetaCurve) * R_major * spacingFactor;

      var rawY = localCos * R_minor;
      if (lineIsChorus) {
        /* 副歌：奇偶上下错峰，随节拍功率脉动（:569-573） */
        var staggerAmount = fontPx * (0.06 + power * 0.12);
        rawY += (i % 2 === 0 ? 1 : -1) * staggerAmount;
      }

      /* 旋转 -ellipseTiltDeg°，长轴对齐屏幕反对角线（:575-585） */
      var thetaRot = -((ellipseTiltDeg != null ? ellipseTiltDeg : 45) * Math.PI) / 180;
      var cosTheta = Math.cos(thetaRot);
      var sinTheta = Math.sin(thetaRot);

      var x = rawX * cosTheta - rawY * sinTheta;
      var y = rawX * sinTheta + rawY * cosTheta;

      var tangentX = Math.cos(thetaCurve) * R_major;
      var tangentY = -Math.sin(thetaCurve) * R_minor;
      var rotatedTangentX = tangentX * cosTheta - tangentY * sinTheta;
      var rotatedTangentY = tangentX * sinTheta + tangentY * cosTheta;
      var tangentAngle = claddaghNormalizeReadableAngle(Math.atan2(rotatedTangentY, rotatedTangentX) * 180 / Math.PI);

      /* 聚焦因子 F（:593-600） */
      var lineDiffNormalized = lineDiffFromCenter;
      var activeLineFactor = Math.max(0, 1 - lineDiffNormalized);

      var maxVisibleDist = currentRx * 0.48;   /* 活动行聚焦宽度 */
      var distRatio = Math.min(1, Math.abs(deltaDist) / maxVisibleDist);
      var F = activeLineFactor * Math.pow(1 - distRatio, 1.8);

      /* 深度 × 聚焦 伪 3D 混合（:602-606） */
      var distanceOpacity = 0.68 + 0.32 * Math.pow(D, 1.9);
      var finalOpacity = (0.35 + 0.65 * Math.pow(D, 1.5) * (0.35 + 0.65 * F)) * distanceOpacity;

      /* 未轮到的新行压暗（:608-610） */
      var lineWindowFade = claddaghClamp(2 - lineDiffNormalized, 0, 1);
      finalOpacity = finalOpacity * lineWindowFade;

      /* 过渡完成的旧行完全隐去（:612-616） */
      if (rec.lineIndex < centerLineIndex) {
        var pastFade = Math.max(0, 1 - lineDiffNormalized);
        finalOpacity = finalOpacity * pastFade;
      }

      /* 长短句重叠消减因子（:618-619） */
      finalOpacity = finalOpacity * lengthFadeFactor;

      if (isUpcomingLine) {
        finalOpacity = finalOpacity * (0.18 + 0.82 * upcomingEntryProgress);
      }

      /* 非聚焦行压回椭圆后半的边界淡出（:625-634） */
      var boundaryFade = 1.0;
      if (lineDiffFromCenter > 0.02) {
        var bp = claddaghClamp((lineDiffFromCenter - 0.3) / 0.6, 0, 1);
        var cosThreshold = 1.0 - 1.2 * bp;
        if (localCos > cosThreshold) {
          boundaryFade = claddaghClamp(1.0 - (localCos - cosThreshold) / 0.15, 0, 1);
        }
      }
      finalOpacity = finalOpacity * boundaryFade;

      var scale = (0.22 + 0.98 * Math.pow(D, 1.5)) * (1.0 + (focusScaleRatio != null ? focusScaleRatio : 0.65) * F) * lengthScaleFactor * (item.scaleFactor != null ? item.scaleFactor : 1.0);
      var blur = 8.0 * (1 - D) * (1 - 0.5 * F);
      var tiltAngle = claddaghClamp(tangentAngle * (0.4 + 0.6 * D), -38, 38);

      el.style.transform = 'translate3d(calc(-50% + ' + x.toFixed(1) + 'px), calc(-50% + ' + y.toFixed(1) + 'px), 0px) rotate(' + tiltAngle.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
      el.style.opacity = finalOpacity.toFixed(3);
      var blurFilter = blur < 0.2 ? '' : 'blur(' + blur.toFixed(2) + 'px)';
      /* 辉光 drop-shadow 排在 blur 前（:643），辉光已知后合并写一次 */
      var glowFilter = '';

      /* 逐字播放态（:646-653） */
      var charProgress = 0;
      if (latestTime >= item.endTime) {
        charProgress = 1;
      } else if (latestTime > item.startTime) {
        var dur = item.endTime - item.startTime;
        charProgress = dur > 0 ? (latestTime - item.startTime) / dur : 1;
      }

      /* 辉光半径（:655-659，原版公式原值） */
      var baseGlow = lineIsChorus
        ? (36 + power * 24) * Math.pow(F, 1.5)
        : 24 * Math.pow(F, 2.0);

      var finalHighlightColor = item.charColor || rec.highlightColor;

      /* 颜色/alpha + camera flash（:663-681） */
      var targetColor = rec.baseColor;
      var currentAlpha = 0.55;
      var flashPop = 0;

      if (charProgress >= 1) {
        targetColor = finalHighlightColor;
        currentAlpha = 1.0;
      } else if (charProgress > 0) {
        /* 近瞬时切换（硬切）色彩吸附 */
        var progressFactor = Math.min(1, charProgress * 15.0);
        currentAlpha = 0.55 + 0.45 * progressFactor;
        targetColor = CM_mixColors(rec.baseColor, finalHighlightColor, progressFactor, currentAlpha);

        /* 半径上的快速衰减 pop 强化闪亮 */
        if (charProgress < 0.4) {
          flashPop = Math.pow(1 - charProgress / 0.4, 2.0) * 0.65;
        }
      }

      var currentGlowRadius = baseGlow * (1.0 + flashPop);

      el.style.color = targetColor;

      /* 辉光 0.5px 阈值下的平滑淡出（:694-696） */
      var shadowFade = claddaghClamp((currentGlowRadius - 0.5) / 2.0, 0, 1);

      if (currentGlowRadius > 0.5 && shadowFade > 0.01) {
        var fadedTargetColor = CM_mixColors(targetColor, targetColor, 0, currentAlpha * shadowFade);

        if (glowAsFilter) {
          /* Linux glyph-cache 兼容路径：辉光走 drop-shadow 滤镜（:702-711） */
          glowFilter = claddaghBuildGlowFilter(
            targetColor,
            coreColor,
            currentGlowRadius,
            currentAlpha,
            shadowFade,
            lineIsChorus
          );
          el.style.textShadow = 'none';
        } else if (lineIsChorus) {
          /* 三层 text-shadow（0.35/1.0/1.6 原版比例，内核向主题字色混 0.65，:712-719） */
          var innerGlowColor = CM_mixColors(targetColor, coreColor, 0.65, shadowFade);
          el.style.textShadow = '0 0 ' + CM_quantizeShadowBlur(currentGlowRadius * 0.35) + 'px ' + innerGlowColor +
            ', 0 0 ' + CM_quantizeShadowBlur(currentGlowRadius) + 'px ' + fadedTargetColor +
            ', 0 0 ' + CM_quantizeShadowBlur(currentGlowRadius * 1.6) + 'px ' + fadedTargetColor;
        } else {
          /* 单层 text-shadow（:720-723） */
          el.style.textShadow = '0 0 ' + CM_quantizeShadowBlur(currentGlowRadius) + 'px ' + fadedTargetColor;
        }
      } else {
        el.style.textShadow = 'none';
      }

      el.style.filter = [glowFilter, blurFilter].filter(Boolean).join(' ') || 'none';
    }
  };

  return rec;
}

/* ---------- 引擎实例（VisualizerCladdagh :775-1084 的宿主等价） ----------
   CladdaghCladdaghEngine(opts)：
   opts: { host, lines, currentTime(MV), theme, audioBands(MV), paused?,
           tuning?, lyricsFontScale?, subtitleFontScale?, showText?,
           hideTranslationSubtitle?, showSubtitleTranslation? }
   返回 { destroy, setLines, setTheme, setFontScale, setTuning, setPaused } */

function CladdaghCladdaghEngine(opts) {
  var host = opts.host;
  var lines = opts.lines || [];
  var theme = opts.theme;
  var tuning = claddaghResolveTuning(opts.tuning);
  var lyricsFontScale = opts.lyricsFontScale != null ? opts.lyricsFontScale : 1;
  var subtitleFontScale = opts.subtitleFontScale != null ? opts.subtitleFontScale : 1;
  var showText = opts.showText !== false;
  var hideTranslationSubtitle = !!opts.hideTranslationSubtitle;
  var showSubtitleTranslation = opts.showSubtitleTranslation !== false;

  var currentTime = opts.currentTime;
  var audioBands = opts.audioBands;
  var paused = !!opts.paused;
  var pretext = opts.pretext || (typeof pretext !== 'undefined' ? pretext : {});

  var destroyed = false;
  var rafId = 0;

  var centerNormalTiltDeg = 90 - tuning.ellipseTiltDeg;   /* :797 */

  /* 数值弹簧：smoothedBass k150/c25、smoothedVocal k120/c24（:817-824）、
     lineOffset animate spring k55/c14/m0.9（:974-979） */
  var smoothedBass = claddaghMakeSpring(0);
  var smoothedVocal = claddaghMakeSpring(0);
  var lineOffset = claddaghMakeSpring(0);

  var fontStack = CM_resolveThemeFontStack(theme);
  var baseFontSize = 72 * lyricsFontScale;
  var fontWeight = CM_resolveThemeFontWeight(theme, 700);
  var fontSpec = fontWeight + ' ' + baseFontSize + 'px ' + fontStack;   /* :825-828 */

  /* ---------- 壳（VisualizerShell :126-134 等价：字体/字重 inline） ---------- */
  var shell = claddaghEl('div', 'cl-shell');
  shell.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;font-family:' +
    CM_resolveThemeFontStack(theme) + ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) + ';';

  /* 主容器 motion.div（:1007-1013）：入场 opacity/scale/blur 0.8s [0.16,1,0.3,1] */
  var main = claddaghEl('div', 'cl-main');
  main.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;overflow:hidden;user-select:none;pointer-events:none;will-change:transform,opacity,filter;';
  shell.appendChild(main);

  /* 背景专用层（:1015-1033）：中心轴线（showAxisLine 条件渲染） */
  var axisLine = null;
  function mountAxisLine() {
    if (axisLine || !tuning.showAxisLine) return;
    axisLine = claddaghEl('div', 'cl-axis');
    axisLine.style.cssText = 'position:absolute;left:50%;top:50%;width:300px;height:4px;' +
      'transform:translate(-50%, -50%) rotate(' + centerNormalTiltDeg + 'deg) scale(1, 1);' +
      'transform-origin:center center;will-change:background, transform, filter;';
    main.appendChild(axisLine);
  }
  function unmountAxisLine() {
    if (!axisLine) return;
    if (axisLine.parentNode) axisLine.parentNode.removeChild(axisLine);
    axisLine = null;
  }
  mountAxisLine();

  /* RingLine 层（:1035） */
  var ringLayer = claddaghEl('div', 'cl-ring');
  ringLayer.style.cssText = 'width:100%;height:100%;position:relative;z-index:10;';
  main.appendChild(ringLayer);

  /* 底部字幕（VisualizerSubtitleOverlay :132-215 等价） */
  var sub = claddaghEl('div', 'cl-sub');
  /* bottom：底栏（#bottom-bar bottom:16px + 自身高 ≈96px）上方留 20px——
     Folia 侧由 usePlayerSubtitleBottomPx 按底栏基线换算，此处对齐本项目底栏几何 */
  sub.style.cssText = 'position:absolute;left:0;right:0;bottom:132px;text-align:center;padding:0 16px;z-index:20;pointer-events:none;opacity:0;';
  shell.appendChild(sub);
  host.appendChild(shell);

  /* 入场动画（:1007-1011 initial → animate） */
  mmSetInitial(main, { opacity: 0, scale: 0.96, filter: 'blur(4px)' }, null);
  mmApplyVariant(main, {
    enter: {
      opacity: 1, scale: 1, filter: 'blur(0px)',
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
      transitionEnd: { filter: 'none' }
    }
  }, 'enter', null);

  /* ---------- 尺寸（:830-927）：初量 + ResizeObserver ---------- */
  var dimensions = { width: 800, height: 600 };
  var resizeObserver = null;

  /* ---------- 焦点行状态（:941-982） ---------- */
  var centerLineIndex = -1;      /* focusIndex 的 max(-1, ·) */
  var renderBaseIndex = -1;

  var activeSpacingInfo = [];
  var lineMap = {};   /* idx → rec（lineIndicesToRender 池） */

  /* 引擎快照（RingLine.update 的 ctx；useLayoutEffect deps 的每帧现取） */
  var engineCtx = {
    get centerLineIndex() { return centerLineIndex; },
    get holdReset() { return holdReset; },
    get lineOffset() { return lineOffset.value; },
    get smoothedBass() { return smoothedBass.value; },
    get Rx() { return Rx; },
    get Ry() { return Ry; },
    get lines() { return lines; },
    get renderBaseIndex() { return renderBaseIndex; },
    get activeSpacingInfo() { return activeSpacingInfo; },
    get tuning() { return tuning; },
    get theme() { return theme; },
    get lyricsFontScale() { return lyricsFontScale; },
    get pretext() { return pretext; },
    get activeTextSpacingScale() { return activeTextSpacingScale; }
  };

  /* 径向配置（:929-933） */
  var Rx = 360, Ry = 254;
  var focusSpacingScale = 1;
  var activeTextSpacingScale = 1;

  function rebuildActiveSpacingInfo() {
    var line = lines[renderBaseIndex];
    if (!line) { activeSpacingInfo = []; return; }
    var tl = claddaghAdjustTimeline(CM_buildLineGraphemeTimeline(line), line);
    activeSpacingInfo = claddaghBuildMeasuredSpacingInfo(
      tl, fontSpec, baseFontSize, Rx, activeTextSpacingScale,
      tuning.letterSpacingOffset, pretext);
  }

  /* spacingInfo 依赖 fontSpec/baseFontSize/Rx/tuning（:427/:955 memo deps）
     → 全行重算（行池 DOM 不动，只换 spacingInfo 引用） */
  function rebuildAllSpacingInfo() {
    for (var key in lineMap) {
      if (!Object.prototype.hasOwnProperty.call(lineMap, key)) continue;
      var rec = lineMap[key];
      var data = claddaghBuildCharData(rec.line, theme.wordColors);
      rec.spacingInfo = claddaghBuildMeasuredSpacingInfo(
        data, fontSpec, baseFontSize, Rx, activeTextSpacingScale,
        tuning.letterSpacingOffset, pretext);
    }
  }

  function rebuildRadialConfig() {
    Rx = (dimensions.width > 0 ? Math.min(dimensions.width * 0.44, 560) : 360) * tuning.radiusScale;
    Ry = Rx > 0 ? Rx * 0.707 : 254;   /* 45° 投影比 */
    focusSpacingScale = (1 + tuning.focusScaleRatio) / (1 + CLADDAGH_DEFAULT_TUNING.focusScaleRatio);
    activeTextSpacingScale = focusSpacingScale;
    /* 调试副作用（:935-939 原样） */
    if (typeof window !== 'undefined') {
      window.visualizerDimensions = dimensions;
      window.visualizerRx = Rx;
      window.visualizerRy = Ry;
    }
    rebuildAllSpacingInfo();
    rebuildActiveSpacingInfo();
  }

  (function initDimensions() {
    var rect = host.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      dimensions.width = rect.width;
      dimensions.height = rect.height;
    }
    rebuildRadialConfig();
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(function (entries) {
        var entry = entries[0];
        if (entry) {
          var cr = entry.contentRect;
          if (cr.width > 0 && cr.height > 0 && (cr.width !== dimensions.width || cr.height !== dimensions.height)) {
            dimensions.width = cr.width;
            dimensions.height = cr.height;
            rebuildRadialConfig();
          }
        }
      });
      resizeObserver.observe(host);
    }
  })();

  /* ---------- RingLine 行池（lineIndicesToRender :986-998） ---------- */

  function clearLinePool() {
    for (var key in lineMap) {
      if (!Object.prototype.hasOwnProperty.call(lineMap, key)) continue;
      if (lineMap[key].root.parentNode) lineMap[key].root.parentNode.removeChild(lineMap[key].root);
    }
    lineMap = {};
  }

  function syncLinePool() {
    var indices = [];
    if (lines.length !== 0) {
      for (var i = renderBaseIndex - 1; i <= renderBaseIndex + 2; i++) {
        if (i >= 0 && i < lines.length) {
          indices.push(i);
        }
      }
      if (indices.length === 0) {
        indices.push(Math.max(0, Math.min(centerLineIndex, lines.length - 1)));
      }
    }

    var wanted = {};
    for (var w = 0; w < indices.length; w++) wanted[indices[w]] = true;

    for (var key in lineMap) {
      if (!Object.prototype.hasOwnProperty.call(lineMap, key)) continue;
      if (!wanted[key]) {
        var dead = lineMap[key];
        if (dead.root.parentNode) dead.root.parentNode.removeChild(dead.root);
        delete lineMap[key];
      }
    }
    for (var k = 0; k < indices.length; k++) {
      var idx = indices[k];
      if (lineMap[idx]) continue;
      var line = lines[idx];
      if (!line) continue;
      var rec = claddaghCreateRingLine(engineCtx, line, idx);
      lineMap[idx] = rec;
      ringLayer.appendChild(rec.root);
    }
  }

  /* ---------- 字幕（VisualizerSubtitleOverlay :48-215 等价；
     MineRadio 无 romanization/alternateTexts → 单 translation 轨） ---------- */
  var translationFontSize = 'clamp(1.1rem, 2.2vw, 1.45rem)';   /* :1071 */
  var upcomingFontSize = 'clamp(0.95rem, 1.8vw, 1.2rem)';      /* :1072 */
  var subtitleOpacity = 0.6;        /* opacity 缺省（:92） */
  var subtitleOverlayBackground = true;   /* :94 缺省 */
  var subtitleUpcomingLyricsBlur = true;  /* :95 缺省 */
  var subtitleKey = null;

  function renderSubtitle(activeLine, recentCompletedLine, nextLines) {
    var shouldRenderOverlay = showText && !hideTranslationSubtitle;   /* :57 */
    var subtitleText = null;
    var upcomingLines = [];
    if (shouldRenderOverlay) {
      var candidates = [activeLine, recentCompletedLine];
      for (var i = 0; i < candidates.length; i++) {
        var line = candidates[i];
        var text = line && line.translation ? String(line.translation) : '';
        if (text && claddaghHasReadableText(text)) { subtitleText = text; break; }
      }
      /* :72-78：有字幕文本时不显示预览；无文本且活动行存在时显示下一句 */
      if (!subtitleText && activeLine) {
        upcomingLines = (nextLines || []).filter(function (l) { return claddaghHasReadableText(l.fullText); });
      }
    }

    var key = subtitleText ? 't:' + subtitleText : (upcomingLines.length ? 'u:' + upcomingLines.map(function (l) { return l.startTime; }).join('|') : null);
    if (key === subtitleKey) return;

    /* AnimatePresence 容器（:133-146）：显隐 opacity/y 0.24s easeOut */
    if (!key) {
      subtitleKey = null;
      mmApplyVariant(sub, {
        exit: { opacity: 0, y: 20, transition: { opacity: { duration: 0.24, ease: 'easeOut' }, y: { duration: 0.24, ease: 'easeOut' } } }
      }, 'exit', null);
      return;
    }
    subtitleKey = key;
    sub.innerHTML = '';
    var content = claddaghEl('div');
    content.style.cssText = subtitleOverlayBackground
      ? 'position:relative;isolation:isolate;display:inline-block;padding:6px 4px;'
      : 'display:inline-block;';

    var textShadow = '0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor, 0.24);   /* :130 */
    if (subtitleOverlayBackground) {
      var glowBg = claddaghEl('div');
      glowBg.setAttribute('aria-hidden', 'true');
      /* :150-155（-inset-x-10 -inset-y-6 blur-2xl + radial 辉光底） */
      glowBg.style.cssText = 'position:absolute;left:-40px;right:-40px;top:-24px;bottom:-24px;z-index:0;filter:blur(24px);' +
        'background:radial-gradient(ellipse 115% 130% at center, ' + CM_colorWithAlpha(theme.backgroundColor, 0.96) + ' 0%, ' +
        CM_colorWithAlpha(theme.backgroundColor, 0.78) + ' 62%, transparent 100%);';
      content.appendChild(glowBg);
    }

    if (subtitleText) {
      /* translation 行（:157-186；单轨 = isSecondaryRow 恒 false，
         SECONDARY_TRACK_* 分支保留结构不触发） */
      var inner = claddaghEl('div');
      inner.style.cssText = 'position:relative;z-index:10;max-width:56rem;margin:0 auto;';
      var trackEl = claddaghEl('div');
      trackEl.style.cssText =
        'color:' + theme.secondaryColor + ';' +
        'font-size:' + claddaghScaleFontSize(translationFontSize, subtitleFontScale) + ';' +
        'font-family:' + CM_resolveThemeTranslationFontStack(theme) + ';' +
        'font-weight:' + CM_resolveThemeFontWeight(theme, 500) + ';' +
        'text-shadow:' + textShadow + ';';
      trackEl.textContent = subtitleText;
      inner.appendChild(trackEl);
      content.appendChild(inner);
    } else {
      /* 下一句预览（:188-213） */
      var upWrap = claddaghEl('div');
      upWrap.style.cssText = 'position:relative;z-index:10;display:flex;flex-direction:column;gap:8px;align-items:center;';
      for (var u = 0; u < upcomingLines.length; u++) {
        var p = claddaghEl('p');
        p.style.cssText = 'margin:0 auto;max-width:42rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:all .5s ease;' +
          (subtitleUpcomingLyricsBlur ? 'filter:blur(1px);' : '') +
          'color:' + theme.secondaryColor + ';' +
          'font-size:' + claddaghScaleFontSize(upcomingFontSize, subtitleFontScale) + ';' +
          'font-weight:' + CM_resolveThemeFontWeight(theme, 400) + ';' +
          'text-shadow:' + textShadow + ';';
        p.textContent = upcomingLines[u].fullText;
        upWrap.appendChild(p);
      }
      content.appendChild(upWrap);
    }
    sub.appendChild(content);
    mmApplyVariant(sub, {
      enter: {
        opacity: subtitleOpacity, y: 0,
        transition: { opacity: { duration: 0.24, ease: 'easeOut' }, y: { duration: 0.24, ease: 'easeOut' } }
      }
    }, 'enter', null);
  }

  /* ---------- 轴线（updateColors rAF 循环 :835-904 全同构，并入主 rAF） ----------
     isChorus 取 activeLine（lines[currentLineIndex]，:815）——非 recent 行。
     normalizePower 为单实例（:842-843 原版复用主组件同一 isRawScaleRef：
     bass 先归一并翻转 raw 记忆，vocal 复用同一记忆） */
  var axisNormalize = claddaghMakeNormalizer();
  var glowIntensity = 0;

  function tickAxis(activeIsChorus) {
    var lineEl = axisLine;
    if (!lineEl) return;

    var bassPower = paused ? 0 : axisNormalize(smoothedBass.value);
    var vocalPower = paused ? 0 : axisNormalize(smoothedVocal.value);
    var fromColor = theme.primaryColor || '#ffffff';
    var toColor = theme.accentColor || '#ffffff';
    /* primary/accent 同色 → 试 secondary；仍同色 → 混白保证节拍变色（:846-853） */
    if (toColor === fromColor && theme.secondaryColor) {
      toColor = theme.secondaryColor;
    }
    if (toColor === fromColor) {
      toColor = '#ffffff';
    }

    /* 颜色响应（bass/vocal 取大，:855-861） */
    var colorPower = Math.max(bassPower, vocalPower);
    var colorDelta = Math.max(0, colorPower - 0.02);
    var colorRatio = Math.min(1.0, colorDelta / 0.58);

    var mixed = CM_mixColors(fromColor, toColor, colorRatio, 0.2 + 0.75 * colorRatio);

    /* 线性渐变在两端点淡出（20%/80%） */
    var gradientString = 'linear-gradient(90deg, transparent, ' + mixed + ' 20%, ' + mixed + ' 80%, transparent)';
    lineEl.style.background = gradientString;
    lineEl.style.backgroundImage = gradientString;

    /* bass 平方拉长（动态范围），厚度微缩放（:869-875） */
    var bassSqr = bassPower * bassPower;
    var scaleX = 1.0 + bassSqr * 1.5;
    var scaleY = 1.0 + bassSqr * 0.5;
    lineEl.style.transform = 'translate(-50%, -50%) rotate(' + centerNormalTiltDeg + 'deg) scale(' + scaleX.toFixed(3) + ', ' + scaleY.toFixed(3) + ')';

    /* 辉光强度平滑过渡（~330ms @60fps，:877-885） */
    var targetIntensity = activeIsChorus ? 1.0 : 0.0;
    var diff = targetIntensity - glowIntensity;
    if (Math.abs(diff) > 0.01) {
      glowIntensity += (diff > 0 ? 1 : -1) * 0.05;
      glowIntensity = Math.max(0, Math.min(1, glowIntensity));
    } else {
      glowIntensity = targetIntensity;
    }

    if (glowIntensity > 0.001) {
      var glowSize = (4 + bassPower * 12) * glowIntensity;
      var glowColor = CM_colorWithAlpha(mixed, glowIntensity);
      lineEl.style.filter = 'drop-shadow(0 0 ' + glowSize.toFixed(1) + 'px ' + glowColor + ')';
    } else {
      lineEl.style.filter = 'none';
    }
  }

  /* ---------- 主循环（currentTime MV 轮询 + 行管理，App 时钟等价） ---------- */
  var holdReset = false;
  var previousTime = currentTime.get();
  var lastFrameTime = 0;

  function tickBody() {
    var now = currentTime.get();

    /* 切歌时间回跳保持帧（:436-445 per-RingLine ref 的宿主级等价：
       各行 previousTime 序列相同；flag 保持至 centerLineIndex<=0） */
    if (claddaghShouldHoldResetFrame(previousTime, now, centerLineIndex)) {
      holdReset = true;
    }
    previousTime = now;

    /* currentLineIndex（宿主权威语义，appPlaybackHelpers.ts:21-31） */
    var idx = claddaghFindLineIndexAtTime(lines, now);

    /* focusIndex/centerLineIndex（:941-947） */
    var focusIndex = idx;
    if (focusIndex === -1) {
      var recent = claddaghGetRecentCompletedLine(lines, idx, now);
      focusIndex = recent ? lines.indexOf(recent) : -1;
    }
    var newCenterLineIndex = Math.max(-1, focusIndex);

    /* 行切换 effect（:961-982）：跳行直接落位，相邻行弹簧旋转 */
    if (newCenterLineIndex !== centerLineIndex) {
      var prev = centerLineIndex;
      centerLineIndex = newCenterLineIndex;
      if (Math.abs(centerLineIndex - prev) > 1) {
        claddaghSpringSetValue(lineOffset, centerLineIndex * Math.PI);
        renderBaseIndex = centerLineIndex;
      } else {
        /* renderBaseIndex 立即跟随（防 wordOffset 断续，:969-973） */
        renderBaseIndex = centerLineIndex;
        if (centerLineIndex >= 0) {
          claddaghSpringSetTarget(lineOffset, centerLineIndex * Math.PI, 55, 14, 0.9);
        }
      }
      syncLinePool();
      rebuildActiveSpacingInfo();
    }

    /* 字幕（useVisualizerRuntime :809-813） */
    var activeLine = lines[idx] != null ? lines[idx] : null;
    var recentCompletedLine = claddaghGetRecentCompletedLine(lines, idx, now);
    renderSubtitle(activeLine, recentCompletedLine, claddaghGetUpcomingLines(lines, idx, 2));

    /* 轴线（isChorus 取 activeLine） */
    tickAxis(!!(activeLine && activeLine.isChorus));

    /* RingLine 全行 update（currentTime/lineOffset MV change 的等价派发） */
    for (var key in lineMap) {
      if (!Object.prototype.hasOwnProperty.call(lineMap, key)) continue;
      lineMap[key].update(now, engineCtx);
    }

    /* hold flag 清除（:442-445 的「不 return 即清除」：centerLineIndex<=0
       时各行 handler 都会走到清除——宿主级单份同步清除，等价） */
    if (holdReset && centerLineIndex <= 0) {
      holdReset = false;
    }
  }

  function frame(nowMs) {
    if (destroyed) return;
    var dt = lastFrameTime ? Math.min(0.1, Math.max(0.001, (nowMs - lastFrameTime) / 1000)) : (1 / 60);
    lastFrameTime = nowMs;

    /* audioBands → 弹簧目标（useSpring 目标即 props 值，:817-824） */
    if (audioBands) {
      var bands = audioBands.get();
      if (bands && isFinite(bands.bass)) {
        claddaghSpringSetTarget(smoothedBass, paused ? 0 : bands.bass, 150, 25, 1);
        if (isFinite(bands.vocal)) {
          claddaghSpringSetTarget(smoothedVocal, paused ? 0 : bands.vocal, 120, 24, 1);
        }
      }
    }
    claddaghSpringStep(smoothedBass, dt);
    claddaghSpringStep(smoothedVocal, dt);
    claddaghSpringStep(lineOffset, dt);

    tickBody();
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  /* ---------- 热更新接口 ---------- */

  return {
    destroy: function () {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeObserver) resizeObserver.disconnect();
      if (shell.parentNode) shell.parentNode.removeChild(shell);
      lineMap = {};
      activeSpacingInfo = [];
    },
    setLines: function (next) {
      lines = next || [];
      centerLineIndex = -1;
      renderBaseIndex = -1;
      clearLinePool();
      activeSpacingInfo = [];
      subtitleKey = null;
    },
    setTheme: function (next) {
      theme = next;
      shell.style.fontFamily = CM_resolveThemeFontStack(theme);
      shell.style.fontWeight = CM_resolveThemeFontWeight(theme, 400);
      /* theme 变化 → fontSpec/baseColor/highlightColor 全变：原版 RingLine 的
         spacingInfo memo deps 含 fontSpec（:427）、useLayoutEffect deps 含
         baseColor/highlightColor/line（:744），React 重渲染 span 的
         fontFamily/fontWeight/color——此处行池以新主题重建等价
         （字体跟随自查：新 lyricFont → 新 fontSpec → 新 span font-family） */
      clearLinePool();
      rebuildAllSpacingInfo();
      rebuildActiveSpacingInfo();
      syncLinePool();
      subtitleKey = null;
    },
    setFontScale: function (n) {
      lyricsFontScale = n != null ? n : 1;
      baseFontSize = 72 * lyricsFontScale;
      fontWeight = CM_resolveThemeFontWeight(theme, 700);
      fontSpec = fontWeight + ' ' + baseFontSize + 'px ' + fontStack;
      /* 字号变化 → 行 DOM/spacingInfo 全量重建（memo deps fontSpec/baseFontSize）；
         清池后立即 syncLinePool 以新字号重建当前窗口行（不等到下次行切换） */
      clearLinePool();
      rebuildAllSpacingInfo();
      rebuildActiveSpacingInfo();
      syncLinePool();
      subtitleKey = null;
    },
    setTuning: function (t) {
      tuning = claddaghResolveTuning(t);
      centerNormalTiltDeg = 90 - tuning.ellipseTiltDeg;
      if (tuning.showAxisLine) {
        mountAxisLine();
        if (axisLine) axisLine.style.transform = 'translate(-50%, -50%) rotate(' + centerNormalTiltDeg + 'deg) scale(1, 1)';
      } else {
        unmountAxisLine();
      }
      rebuildRadialConfig();
    },
    setPaused: function (next) { paused = !!next; }
  };
}
