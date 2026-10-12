/* =========================================================================
   classic 渲染核心 —— Folia classic Visualizer.tsx 的无构建 DOM 忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     src/components/visualizer/classic/Visualizer.tsx（渲染核心）
     src/components/visualizer/wordGlow.ts（逐字辉光三态 variants）
     src/components/visualizer/runtime.ts（当前行/最近完成行/预览行）
     src/utils/appPlaybackHelpers.ts:21（findLatestActiveLineIndex ——
       Folia 宿主写 playbackStore.currentLineIndex 的权威语义）
     src/components/visualizer/VisualizerSubtitleOverlay.tsx +
       src/utils/lyrics/subtitleTrackStyle.ts（底部字幕/下一句预览：
       主行字重回退 500（SubtitleOverlay:176）、下一句预览 400（:205）、
       翻译行字体栈 resolveThemeTranslationFontStack（:175）、
       内层换行容器 motion.div key=trans-<startTime> initial{opacity:0,y:10}
       →animate{opacity:1,y:0} 无显式 transition → framer 缺省 0.3s easeOut
       （:157-162）；空态 i18n key ui.waitingForMusic 三语言均为空串
       —— i18n/locales/en.ts:628 / zh-CN.ts:628 / in.ts:623，原版空态
       不渲染文案，仅保留结构与淡入淡出）
     src/types.ts:398（DEFAULT_CLASSIC_TUNING）

   结构对应（React → 无构建 DOM）：
     VisualizerShell        → cl-shell（fontFamily/fontWeight inline，同 :128-134）
     主容器 motion.div      → cl-main（lyricContainerFloat 呼吸浮动，mm 驱动）
     AnimatePresence        → 行槽双槽并存（旧行播 exit 后移除，popLayout 等价：
                               行槽为叠加定位层，新旧行互不影响布局）
     Word / glow / body     → cl-word / cl-glow / cl-body（span 三层同构）
     useMotionValueEvent    → currentTime MV 每帧轮询派发 change（词三态机订阅）
     VisualizerSubtitleOverlay → cl-sub（翻译行 + 下一句预览，AnimatePresence 等价）

   动画全部经 mini-motion（framer 子集忠实实现）驱动：variants 三态目标值、
   spring(200,20)、keyframes+times、color/filter 复杂值插值、transitionEnd。
   MineRadio 宿主差异（数据源在桥）：强度档随 fx.visAnimationIntensity 下发
   （calm/normal/chaotic，桥 20b-classic-engine-bridge）；主题词色表随控制台
   词色表编辑器下发（wordColors，空表时 resolveWordColor 回退 accentColor——
   算法本体已随闭包落地并被测试覆盖）。
   ========================================================================= */

/* ---------- tuning（types.ts:391-403 原值） ---------- */
var CLASSIC_DEFAULT_TUNING = {
  enableWordRotation: true,
  breathingFloatMultiplier: 1,
  useLegacyLayout: false,
  wordSpacing: 0.7
};

/* clampClassicBreathingFloatMultiplier / clampClassicWordSpacing（Visualizer.tsx:53-54） */
function classicClampBreathingFloatMultiplier(value) { return Math.min(2, Math.max(0, value)); }
function classicClampWordSpacing(value) { return Math.min(2, Math.max(0, value)); }

/* resolveClassicTuning（Visualizer.tsx:56-63） */
function classicResolveTuning(tuning) {
  return {
    enableWordRotation: (tuning && tuning.enableWordRotation != null) ? tuning.enableWordRotation : CLASSIC_DEFAULT_TUNING.enableWordRotation,
    breathingFloatMultiplier: classicClampBreathingFloatMultiplier(
      (tuning && tuning.breathingFloatMultiplier != null) ? tuning.breathingFloatMultiplier : CLASSIC_DEFAULT_TUNING.breathingFloatMultiplier),
    useLegacyLayout: (tuning && tuning.useLegacyLayout != null) ? tuning.useLegacyLayout : CLASSIC_DEFAULT_TUNING.useLegacyLayout,
    wordSpacing: classicClampWordSpacing(
      (tuning && tuning.wordSpacing != null) ? tuning.wordSpacing : (CLASSIC_DEFAULT_TUNING.wordSpacing != null ? CLASSIC_DEFAULT_TUNING.wordSpacing : 0.7))
  };
}

/* isCJK（Visualizer.tsx:66） */
function classicIsCJK(text) { return /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(text); }

/* resolveClassicLineRenderProfile（Visualizer.tsx:68-85）——renderHints 来自歌词管线（闭包） */
function classicResolveLineRenderProfile(line) {
  if (!line) return null;
  var renderHints = CM_getLineRenderHints(line);
  var wordRevealMode = (renderHints && renderHints.wordRevealMode) || 'normal';
  return {
    renderHints: renderHints,
    lineRenderEndTime: CM_getLineRenderEndTime(line),
    lineTransitionMode: (renderHints && renderHints.lineTransitionMode) || 'normal',
    wordRevealMode: wordRevealMode,
    wordLookahead: wordRevealMode === 'instant' ? 0.03 : wordRevealMode === 'fast' ? 0.08 : 0.15
  };
}

/* getClassicWordActiveEndTime（Visualizer.tsx:87-97） */
function classicWordActiveEndTime(word, profile) {
  if (profile.wordRevealMode === 'instant') return profile.lineRenderEndTime;
  if (profile.wordRevealMode === 'fast') {
    return Math.min(profile.lineRenderEndTime, Math.max(word.endTime, word.startTime + 0.12));
  }
  return word.endTime;
}

/* getClassicWordDisplayDuration（Visualizer.tsx:99-108） */
function classicWordDisplayDuration(word, profile) {
  var activeEndTime = classicWordActiveEndTime(word, profile);
  var minDuration = profile.wordRevealMode === 'instant' ? 0.08
    : profile.wordRevealMode === 'fast' ? 0.12 : 0.1;
  return Math.max(activeEndTime - word.startTime, minDuration);
}

/* Word 三态判定（useMotionValueEvent :186-194 逐式同构，提纯为纯函数供
   沙箱测试与 subscribe 共用——语义逐字保留：lookahead 前等待、闭区间
   [startTime-lookahead, activeEndTime] 内 active、其后 passed） */
function classicWordStatusAt(latest, word, profile) {
  var activeEndTime = classicWordActiveEndTime(word, profile);
  if (latest >= word.startTime - profile.wordLookahead && latest <= activeEndTime) {
    return 'active';
  }
  if (latest > activeEndTime) return 'passed';
  return 'waiting';
}

/* getClassicLineContainerMotion（Visualizer.tsx:110-143）——行进出三档 initial/animate/exit */
function classicLineContainerMotion(profile) {
  if (profile && profile.lineTransitionMode === 'none') {
    return {
      initial: { opacity: 1, scale: 1, filter: 'blur(0px)' },
      animate: { opacity: 1, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
      exit: { opacity: 0, scale: 1.02, filter: 'blur(6px)', transition: { duration: 0.12, ease: 'easeOut' } }
    };
  }
  if (profile && profile.lineTransitionMode === 'fast') {
    return {
      initial: { opacity: 0.35, scale: 0.96, filter: 'blur(4px)' },
      animate: {
        opacity: 1, scale: 1, filter: 'blur(0px)',
        transition: { duration: 0.16, ease: 'easeOut' },
        transitionEnd: { filter: 'none' }
      },
      exit: { opacity: 0, scale: 1.04, filter: 'blur(10px)', transition: { duration: 0.16, ease: 'easeInOut' } }
    };
  }
  return {
    initial: { opacity: 0, scale: 0.9, filter: 'blur(10px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
    exit: { opacity: 0, scale: 1.1, filter: 'blur(20px)', transition: { duration: 0.3 } }
  };
}

/* measureWordWidth（Visualizer.tsx:145-163）——canvas 量宽 */
var classicMeasureCanvas = null;
function classicMeasureWordWidth(text, pxSize, fontStack, fontWeight) {
  if (typeof document === 'undefined') return text.length * pxSize * 0.65;
  if (!classicMeasureCanvas) classicMeasureCanvas = document.createElement('canvas');
  var context = classicMeasureCanvas.getContext('2d');
  if (!context) return text.length * pxSize * 0.65;
  context.font = fontWeight + ' ' + pxSize + 'px ' + fontStack;
  return context.measureText(text).width;
}

/* findLatestActiveLineIndex（appPlaybackHelpers.ts:21-32）——Folia 宿主 currentLineIndex 权威语义 */
function classicFindLineIndexAtTime(lines, time) {
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
function classicGetRecentCompletedLine(lines, currentLineIndex, currentTime, getLineEndTime) {
  if (currentLineIndex !== -1 || !lines || lines.length === 0) return null;
  for (var i = lines.length - 1; i >= 0; i--) {
    if (currentTime > getLineEndTime(lines[i])) return lines[i];
  }
  return null;
}

/* getUpcomingLine / getUpcomingLines（runtime.ts:56-86） */
function classicGetUpcomingLines(lines, currentLineIndex, count) {
  if (currentLineIndex < 0) return [];
  return lines.slice(currentLineIndex + 1, currentLineIndex + 1 + count);
}

/* hasReadableText（VisualizerSubtitleOverlay.tsx:20）——纯标记行永不进字幕 */
function classicHasReadableText(text) {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

/* subtitleTrackStyle.ts 常量原值 */
var CLASSIC_SECONDARY_TRACK_SIZE_FACTOR = 0.88;
var CLASSIC_SECONDARY_TRACK_OPACITY = 0.82;
var CLASSIC_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK = 400;
var CLASSIC_SECONDARY_TRACK_GAP_EM = 0.25;

/* ---------- wordGlow.ts（:28-156 全量同构） ---------- */
var CLASSIC_DROP_SHADOW_RADIUS_SCALE = 0.4;
var CLASSIC_DROP_SHADOW_INNER_ALPHA = 0.7;

/* withAlpha（wordGlow.ts:45-47） */
function classicGlowWithAlpha(color, alpha) {
  return /^\s*(#|rgba?\()/.test(color) ? CM_colorWithAlpha(color, alpha) : color;
}

/* textShadowAt（wordGlow.ts:50-52） */
function classicTextShadowAt(color, inner, outer) {
  return '0 0 ' + inner + 'px ' + color + ', 0 0 ' + outer + 'px ' + color;
}

/* dropShadowAt（wordGlow.ts:55-58） */
function classicDropShadowAt(color, inner, outer) {
  return 'drop-shadow(0 0 ' + (inner * CLASSIC_DROP_SHADOW_RADIUS_SCALE) + 'px ' + classicGlowWithAlpha(color, CLASSIC_DROP_SHADOW_INNER_ALPHA) + ') ' +
    'drop-shadow(0 0 ' + (outer * CLASSIC_DROP_SHADOW_RADIUS_SCALE) + 'px ' + color + ')';
}

/* glowKeyframes（wordGlow.ts:65-77） */
function classicGlowKeyframes(color, inner, outer, peaks) {
  if (!CM_isGlowBlurQuantized()) {
    return {
      color: 'transparent',
      textShadow: peaks.map(function (peak) { return peak > 0 ? classicTextShadowAt(color, inner, outer) : 'none'; })
    };
  }
  return {
    color: color,
    opacity: peaks,
    filter: peaks.map(function (peak) { return classicDropShadowAt(color, inner * peak, outer * peak); })
  };
}

/* wordGlowVariants（wordGlow.ts:84-156 三态全量同构） */
var ClassicWordGlowVariants = {
  waiting: function () {
    if (CM_isGlowBlurQuantized()) {
      return { color: 'transparent', opacity: 0, filter: 'none', transition: { duration: 0 } };
    }
    return { color: 'transparent', textShadow: 'none', opacity: 1, filter: 'none' };
  },
  active: function (c) {
    var merge = function (base, extra) {
      var out = {}; var k;
      for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
      for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
      return out;
    };
    if (c.wordRevealMode === 'instant') {
      return merge(classicGlowKeyframes(c.activeColor, 14, 24, [0, 1, 0]), {
        transition: { duration: Math.min(c.duration || 0.08, 0.12), times: [0, 0.35, 1], ease: 'easeOut' }
      });
    }
    if (c.wordRevealMode === 'fast') {
      return merge(classicGlowKeyframes(c.activeColor, 18, 32, [0, 1, 0]), {
        transition: { duration: Math.min(Math.max(c.duration || 0.12, 0.12), 0.2), times: [0, 0.4, 1], ease: 'easeInOut' }
      });
    }
    if (c.total !== undefined && c.total > 1) {
      var singleDuration = (c.duration || 0) / c.total;
      var hasCharTiming = typeof c.charStartTime === 'number' && typeof c.charEndTime === 'number' && typeof c.wordStartTime === 'number';
      var charDuration = hasCharTiming ? Math.max(c.charEndTime - c.charStartTime, 0.001) : singleDuration;
      var charDelay = hasCharTiming ? Math.max(0, c.charStartTime - c.wordStartTime) : singleDuration * (c.index || 0);
      return merge(classicGlowKeyframes(c.activeColor, 20, 40, [0, 1, 0]), {
        transition: { duration: charDuration * 6, times: [0, 0.3, 1], delay: charDelay, ease: 'easeInOut' }
      });
    }
    return merge(classicGlowKeyframes(c.activeColor, 20, 40, [0, 1, 1]), {
      transition: { duration: (c.duration || 0.1), times: [0, 0.9, 1], ease: 'easeInOut' }
    });
  },
  passed: function (c) {
    var transition = { duration: c.wordRevealMode === 'instant' ? 0.12 : c.wordRevealMode === 'fast' ? 0.22 : 0.9, ease: 'easeOut' };
    if (!CM_isGlowBlurQuantized()) {
      return { color: 'transparent', textShadow: 'none', transition: transition };
    }
    return { color: c.activeColor, opacity: 0, filter: classicDropShadowAt(c.activeColor, 0, 0), transition: transition };
  }
};

/* ---------- Word 三态 variants（Visualizer.tsx:475-543 同构） ---------- */

/* layoutVariants（:475-511）——词容器 waiting/active/passed */
function classicMakeLayoutVariants(tuning, theme) {
  return {
    waiting: function (custom) {
      var config = custom.config;
      return {
        opacity: 0,
        scale: 0.5,
        x: config.x + (Math.sin(config.y) * 100),
        y: config.y + (Math.cos(config.x) * 50),
        rotate: tuning.enableWordRotation ? config.rotate + 20 : 0,
        transition: { duration: 0.4 }
      };
    },
    active: function (custom) {
      var config = custom.config;
      return {
        opacity: 1,
        scale: isNaN(config.scale) ? 1.5 : config.scale * 1.4,
        x: config.x,
        y: config.y,
        rotate: config.rotate,
        transition: {
          type: 'spring',
          stiffness: 200,
          damping: 20,
          opacity: { duration: 0.1 }
        }
      };
    },
    passed: function (custom) {
      var config = custom.config;
      return {
        opacity: theme.animationIntensity === 'chaotic' ? 0.9 : 0.82,
        scale: config.scale || 1,
        x: config.x,
        y: config.y,
        rotate: config.rotate + config.passedRotate,
        transition: {
          duration: 0.5,
          rotate: { duration: 5, ease: 'linear' }
        }
      };
    }
  };
}

/* bodyVariants（:515-543）——body 层 color/blur 过渡 */
var ClassicBodyVariants = {
  waiting: function (custom) {
    return {
      color: custom.baseColor,
      filter: 'blur(10px)',
      transition: { duration: 0.4 }
    };
  },
  active: function (custom) {
    return {
      color: custom.activeColor,
      filter: 'none',
      transition: {
        color: { duration: custom.duration || 0.2, ease: 'linear' },
        filter: { type: 'tween', duration: custom.wordRevealMode === 'instant' ? 0.08 : custom.wordRevealMode === 'fast' ? 0.12 : 0.2 }
      },
      transitionEnd: { filter: 'none' }
    };
  },
  passed: function (custom) {
    return {
      color: custom.baseColor,
      filter: 'blur(0px)',
      transition: {
        color: { duration: custom.wordRevealMode === 'instant' ? 0.12 : custom.wordRevealMode === 'fast' ? 0.24 : 0.8, ease: 'easeInOut' },
        filter: { duration: custom.wordRevealMode === 'instant' ? 0.12 : custom.wordRevealMode === 'fast' ? 0.2 : 0.5 }
      },
      transitionEnd: { filter: 'none' }
    };
  }
};

/* lyricContainerFloat（:545-572）——整行呼吸浮动（multiplier<=0 时 null 不动） */
function classicLyricContainerFloat(tuning, theme) {
  var multiplier = tuning.breathingFloatMultiplier;
  if (multiplier <= 0) return null;
  var configByIntensity = {
    calm: { distance: 10, duration: 8.5 },
    normal: { distance: 14, duration: 7 },
    chaotic: { distance: 18, duration: 5.8 }
  };
  var cfg = configByIntensity[theme.animationIntensity] || configByIntensity.normal;
  var scaledDistance = cfg.distance * multiplier;
  return {
    animate: {
      y: [0, -scaledDistance, 0, scaledDistance * 0.45, 0],
      scale: [1, 1 + 0.01 * multiplier, 1, 1 - 0.005 * multiplier, 1]
    },
    transition: { duration: cfg.duration, repeat: Infinity, ease: 'easeInOut' }
  };
}

/* ---------- 布局（Visualizer.tsx:351-471 的确定性公式全量同构） ---------- */

/* displayWords（:336-343） */
function classicBuildDisplayWords(line, tuning) {
  if (!line) return [];
  if (tuning.useLegacyLayout) return line.words;
  var layoutUnits = CM_buildPostLyricLayoutUnits(line, { semantic: true, sticky: true });
  return CM_buildDisplayWordsFromLayoutUnits(layoutUnits);
}

/* 主字号/空态字号（:345-346） */
function classicMainFontSize(fontScale) {
  return 'clamp(' + (2.25 * fontScale).toFixed(3) + 'rem, ' + (6 * fontScale).toFixed(3) + 'vw, ' + (4.5 * fontScale).toFixed(3) + 'rem)';
}
function classicEmptyFontSize(fontScale) {
  return 'clamp(' + (1.5 * fontScale).toFixed(3) + 'rem, ' + (3.5 * fontScale).toFixed(3) + 'vw, ' + (2.25 * fontScale).toFixed(3) + 'rem)';
}

/* getPixelFontSize（:381-387） */
function classicPixelFontSize(fontScale, width) {
  var rem = 16;
  var minPx = 2.25 * fontScale * rem;
  var valPx = (6 * fontScale * width) / 100;
  var maxPx = 4.5 * fontScale * rem;
  return Math.max(minPx, Math.min(valPx, maxPx));
}

var CLASSIC_JUSTIFY_CSS = { 'justify-start': 'flex-start', 'justify-center': 'center', 'justify-end': 'flex-end', 'justify-around': 'space-around', 'justify-between': 'space-between' };
var CLASSIC_ALIGN_CSS = { 'items-start': 'flex-start', 'items-center': 'center', 'items-end': 'flex-end' };

/* wordConfigs/lineConfig memo（:351-471）——normal 档公式（isCalm 分支保留结构） */
function classicComputeLayouts(activeLine, displayWords, tuning, theme, lyricsFontScale, viewportWidth) {
  if (!activeLine) {
    return { wordConfigs: [], lineConfig: { justifyContent: 'center', alignItems: 'center', perspective: 1000 } };
  }

  var seed = activeLine.startTime;
  var intensity = theme.animationIntensity;
  var isChaotic = intensity === 'chaotic';
  var isCalm = intensity === 'calm';

  var justifyOptions = isCalm
    ? ['justify-center']
    : ['justify-start', 'justify-center', 'justify-end', 'justify-around', 'justify-between'];
  var alignOptions = isCalm
    ? ['items-center']
    : ['items-start', 'items-center', 'items-end'];

  var isInterlude = activeLine.fullText === '......';

  var lineConfig = {
    justifyContent: isInterlude ? 'justify-center' : justifyOptions[Math.floor(seed % justifyOptions.length)],
    alignItems: alignOptions[Math.floor((seed * 2) % alignOptions.length)],
    perspective: isChaotic ? 500 + (seed % 500) : 1000
  };

  var fontStack = CM_resolveThemeFontStack(theme);
  var fontWeight = CM_resolveThemeFontWeight(theme, 700);
  var pxFontSize = classicPixelFontSize(lyricsFontScale, viewportWidth);
  var wordWidths = displayWords.map(function (w) { return classicMeasureWordWidth(w.text, pxFontSize, fontStack, fontWeight); });

  var baseSpread = isChaotic ? 60 : isCalm ? 0 : 20;
  var baseRotate = isChaotic ? 30 : isCalm ? 0 : 5;

  var wordConfigs = displayWords.map(function (w, i) {
    var wordSeed = seed + i;
    /* 确定性 RNG（:398-401）：时间改动画状态，不改基础几何 */
    var random = function (offset) {
      var x = Math.sin(wordSeed + offset) * 10000;
      return x - Math.floor(x);
    };

    if (isInterlude) {
      return {
        id: w.text + '-' + i + '-' + seed,
        x: 0,
        y: (random(2) - 0.5) * 15,
        rotate: 0,
        scale: 1.5,
        marginRight: '3rem',
        alignSelf: 'center',
        passedRotate: 0
      };
    }

    var wordConfigScale = isChaotic ? 0.8 + random(4) * 0.6 : 1.1 + random(4) * 0.2;
    var xVal = (random(1) - 0.5) * baseSpread * 2;
    var yVal = (random(2) - 0.5) * baseSpread * 2;

    var marginRight = isChaotic ? (random(5) * 1.5) + 'rem' : '0.8rem';

    if (!tuning.useLegacyLayout) {
      /* 防重叠词距（:425-456 原公式） */
      var w_i = wordWidths[i] || 0;
      var s_i = wordConfigScale * 1.4;

      var w_next = 0, s_next = 1.0, x_next = 0;

      if (i + 1 < displayWords.length) {
        var nextSeed = seed + (i + 1);
        var nextRandom = function (offset) {
          var x = Math.sin(nextSeed + offset) * 10000;
          return x - Math.floor(x);
        };
        var nextConfigScale = isChaotic ? 0.8 + nextRandom(4) * 0.6 : 1.1 + nextRandom(4) * 0.2;
        s_next = nextConfigScale * 1.4;
        x_next = (nextRandom(1) - 0.5) * baseSpread * 2;
        w_next = wordWidths[i + 1] || 0;
      }

      var spacingMultiplier = tuning.wordSpacing || 0.7;
      var gap = 0.05 * pxFontSize;
      var halfOverflow_i = w_i * (s_i - 1) / 2;
      var halfOverflow_next = w_next * (s_next - 1) / 2;
      var xOffsetDiff = xVal - x_next;

      var calculatedMargin = (halfOverflow_i + halfOverflow_next + xOffsetDiff + gap) * spacingMultiplier;
      var minMargin = (isChaotic ? 0.08 * pxFontSize : 0.12 * pxFontSize) * spacingMultiplier;
      var finalMargin = Math.max(minMargin, calculatedMargin);
      marginRight = finalMargin.toFixed(1) + 'px';
    }

    return {
      id: w.text + '-' + i + '-' + seed,
      x: xVal,
      y: yVal,
      rotate: tuning.enableWordRotation ? (random(3) - 0.5) * baseRotate * 2 : 0,
      scale: wordConfigScale,
      marginRight: marginRight,
      alignSelf: isChaotic && random(6) > 0.7 ? (random(7) > 0.5 ? 'flex-start' : 'flex-end') : 'auto',
      passedRotate: tuning.enableWordRotation ? (random(8) - 0.5) * 45 : 0
    };
  });

  return { wordConfigs: wordConfigs, lineConfig: lineConfig };
}

/* ---------- DOM 工具 ---------- */

function classicEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function classicEl(tag, className, styleText) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (styleText) el.style.cssText = styleText;
  return el;
}

/* ---------- 引擎实例 ---------- */

/**
 * ClassicClassicEngine(opts) —— classic 模式渲染引擎（Visualizer.tsx 组件树的宿主等价）
 * opts: { host, lines, currentTime(MV), theme, tuning?, lyricsFontScale?, showText?,
 *         hideTranslationSubtitle?, showSubtitleTranslation? }
 * 返回 { destroy, setLines, setTheme, setFontScale, setTuning, setPaused?无 }
 */
function ClassicClassicEngine(opts) {
  var host = opts.host;
  var lines = opts.lines || [];
  var theme = opts.theme;
  var tuning = classicResolveTuning(opts.tuning);
  var lyricsFontScale = opts.lyricsFontScale != null ? opts.lyricsFontScale : 1;
  var showText = opts.showText !== false;
  var hideTranslationSubtitle = !!opts.hideTranslationSubtitle;
  var showSubtitleTranslation = opts.showSubtitleTranslation !== false;

  var currentTime = opts.currentTime;
  var lastTime = null;
  var destroyed = false;
  var rafId = 0;

  /* ---------- 壳（VisualizerShell :128-134 等价：字体/字重 inline） ---------- */
  var shell = classicEl('div', 'cl-shell');
  shell.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;font-family:' +
    CM_resolveThemeFontStack(theme) + ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) + ';';

  /* 主容器（:582-585 relative z-10 w-full h-[70vh] flex items-center justify-center p-8） */
  var main = classicEl('div', 'cl-main');
  main.style.cssText = 'position:relative;z-index:10;width:100%;height:70vh;display:flex;align-items:center;justify-content:center;padding:32px;pointer-events:none;will-change:transform;';

  /* 行槽（AnimatePresence popLayout 等价：叠加定位层，双槽并存互不影响布局） */
  var slots = classicEl('div', 'cl-slots');
  slots.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';
  main.appendChild(slots);

  /* 空态（:623-637）：i18n key ui.waitingForMusic 三语言均为空串（en.ts:628 /
     zh-CN.ts:628 / in.ts:623）——原版空态不渲染文案，仅保留结构与淡入淡出
     （AnimatePresence initial{opacity:0}→animate{opacity:1}→exit{0}，无显式
     transition → framer 缺省 0.3s easeOut；class opacity-50 被 inline 动画
     终值 1 覆盖，故可见态 opacity=1）；常驻 DOM 仅 opacity 切换 */
  var idle = classicEl('div', 'cl-idle');
  idle.style.cssText = 'position:absolute;font-size:' + classicEmptyFontSize(lyricsFontScale) +
    ';opacity:0;transition:opacity .3s ease-out;color:' + (theme.secondaryColor || theme.primaryColor) +
    ';pointer-events:none;';
  idle.textContent = '';
  main.appendChild(idle);

  /* 底部字幕（VisualizerSubtitleOverlay :132-215 等价） */
  var sub = classicEl('div', 'cl-sub');
  /* bottom：底栏（#bottom-bar bottom:16px + 自身高 ≈96px）上方留 20px——
     Folia 侧由 usePlayerSubtitleBottomPx 按底栏基线换算，此处对齐本项目底栏几何 */
  sub.style.cssText = 'position:absolute;left:0;right:0;bottom:132px;text-align:center;padding:0 16px;z-index:20;pointer-events:none;opacity:0;transform:translateY(20px);';
  shell.appendChild(main);
  shell.appendChild(sub);
  host.appendChild(shell);

  var subtitleSizes = CM_resolveSubtitleFontSizes(lyricsFontScale);
  var float = classicLyricContainerFloat(tuning, theme);
  if (float) {
    mmApplyVariant(main, { floating: float }, 'floating', null);
  }

  /* ---------- 行/词运行时 ---------- */
  var currentLineKey = null;     /* activeLine.startTime（行 key :589） */
  var activeLineEl = null;       /* 当前行元素 */
  var exitTimers = [];
  var words = [];                /* {el, glowEls, bodyEl, rippleWrap, word, profile, status} */
  var activeProfile = null;
  var layoutVariants = classicMakeLayoutVariants(tuning, theme);
  var subtitleKey = null;

  /* 词三态机（useMotionValueEvent :185-199 等价：currentTime change 驱动；
     判定提纯为 classicWordStatusAt——:186-194 同构） */
  currentTime.subscribe(function (latest) {
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w.el) continue;
      var newStatus = classicWordStatusAt(latest, w.word, w.profile);
      if (newStatus !== w.status) setWordStatus(w, newStatus);
    }
  });

  function setWordStatus(w, status) {
    w.status = status;
    var custom = {
      config: w.config,
      activeColor: w.activeColor,
      baseColor: w.baseColor,
      duration: w.duration,
      wordRevealMode: w.profile.wordRevealMode
    };
    /* 词容器（layoutVariants）+ body 层（bodyVariants） */
    mmApplyVariant(w.el, w.layoutVariants, status, custom);
    mmApplyVariant(w.bodyEl, ClassicBodyVariants, status, custom);
    /* glow 层逐字（graphemeTimings.length > 1 时逐字 custom，:229-257） */
    for (var g = 0; g < w.glowEls.length; g++) {
      var ge = w.glowEls[g];
      var glowCustom = ge.total > 1 ? {
        config: w.config, activeColor: w.activeColor, baseColor: w.baseColor,
        duration: w.duration, index: ge.index, total: ge.total,
        charStartTime: ge.charStartTime, charEndTime: ge.charEndTime,
        wordStartTime: w.word.startTime, wordRevealMode: w.profile.wordRevealMode
      } : {
        config: w.config, activeColor: w.activeColor, baseColor: w.baseColor,
        duration: w.duration, wordRevealMode: w.profile.wordRevealMode
      };
      mmApplyVariant(ge.el, ClassicWordGlowVariants, status, glowCustom);
    }
    /* Chorus Ripple（:269-282：isChorus && status==='active' 时挂载涟漪） */
    if (w.isChorus && status === 'active') mountRipple(w);
    else unmountRipple(w);
  }

  /* ripple：外层定位（-translate 居中，CSS 持有），内层 mm 动画 scale/opacity（0.5s easeOut，:276-280） */
  function mountRipple(w) {
    if (w.ripple || w.rippleWrap) return;
    var wrap = classicEl('span', 'cl-ripple-wrap');
    wrap.style.cssText = 'position:absolute;top:50%;left:50%;width:0;height:0;z-index:0;pointer-events:none;';
    var el = classicEl('span', 'cl-ripple');
    el.style.cssText = 'position:absolute;top:0;left:0;width:' + (w.el.offsetHeight * 1.5) + 'px;height:' + (w.el.offsetHeight * 1.5) +
      'px;margin-top:' + (-(w.el.offsetHeight * 1.5) / 2) + 'px;margin-left:' + (-(w.el.offsetHeight * 1.5) / 2) +
      'px;border-radius:9999px;border:1px solid ' + w.activeColor + ';filter:blur(1px);pointer-events:none;';
    wrap.appendChild(el);
    w.el.appendChild(wrap);
    w.rippleWrap = wrap; w.ripple = el;
    /* initial {scale:0.2, opacity:0.8} → animate {scale:rippleScale, opacity:0}
       rippleScale = 1.5 + Math.random()*2（:180，词实例 memo 一次） */
    var st = mmGetState(el);
    mmWriteProp(el, st, 'scale', 0.2);
    el.style.opacity = '0.8';
    mmApplyVariant(el, {
      ripple: {
        scale: w.rippleScale, opacity: 0,
        transition: { duration: 0.5, ease: 'easeOut' },
        transitionEnd: { opacity: 0 }
      }
    }, 'ripple', null);
  }

  function unmountRipple(w) {
    if (!w.rippleWrap) return;
    var wrap = w.rippleWrap;
    w.rippleWrap = null; w.ripple = null;
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
  }

  /* ---------- 渲染一行（Visualizer 主体 :587-620 的 DOM 展开） ---------- */
  function renderLine(line, wordConfigs, lineConfig) {
    var profile = activeProfile;
    var lineBox = classicEl('div', 'cl-linebox');
    lineBox.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';
    var el = classicEl('div', 'cl-line');
    el.style.cssText =
      'display:flex;flex-wrap:wrap;width:100%;max-width:72rem;align-content:center;' +
      'justify-content:' + (CLASSIC_JUSTIFY_CSS[lineConfig.justifyContent] || 'center') + ';' +
      'align-items:' + (CLASSIC_ALIGN_CSS[lineConfig.alignItems] || 'center') + ';' +
      'perspective:' + lineConfig.perspective + 'px;min-height:300px;position:relative;';
    lineBox.appendChild(el);

    var mainFontSize = classicMainFontSize(lyricsFontScale);
    var fontStack = CM_resolveThemeFontStack(theme);
    var fontWeight = CM_resolveThemeFontWeight(theme, 700);

    words = [];
    for (var idx = 0; idx < displayWordsCache.length; idx++) {
      var word = displayWordsCache[idx];
      var config = wordConfigs[idx] || { id: 'fallback-' + idx, x: 0, y: 0, rotate: 0, scale: 1, marginRight: '0.5rem', alignSelf: 'auto', passedRotate: 0 };
      var activeColor = CM_resolveWordColor(word.text, theme.wordColors, theme.accentColor);

      /* Word 根（:202-223） */
      var wEl = classicEl('div', 'cl-word');
      wEl.style.cssText = 'display:inline-block;transform-origin:center;position:relative;will-change:transform;white-space:nowrap;' +
        'font-size:' + mainFontSize + ';font-weight:' + fontWeight + ';margin-right:' + config.marginRight + ';' +
        (config.alignSelf && config.alignSelf !== 'auto' ? 'align-self:' + config.alignSelf + ';' : '') +
        'line-height:1.22;';

      /* Glow 层（:224-258 absolute inset-0，graphemeTimings 逐字/整词） */
      var glowWrap = classicEl('span');
      glowWrap.style.cssText = 'position:absolute;inset:0;user-select:none;pointer-events:none;display:block;';
      var graphemeTimings = CM_buildWordGraphemeTimings(word);
      var glowEls = [];
      var glowHtml = '';
      if (graphemeTimings.length > 1) {
        for (var gi = 0; gi < graphemeTimings.length; gi++) {
          glowHtml += '<span class="cl-gc">' + classicEsc(graphemeTimings[gi].char) + '</span>';
        }
      } else {
        glowHtml += '<span class="cl-gc">' + classicEsc(word.text) + '</span>';
      }
      glowWrap.innerHTML = glowHtml;
      var gcEls = glowWrap.querySelectorAll('.cl-gc');
      for (var gj = 0; gj < gcEls.length; gj++) {
        var gEl = gcEls[gj];
        gEl.style.cssText = 'display:inline-block;';
        glowEls.push({
          el: gEl,
          index: gj,
          total: graphemeTimings.length,
          charStartTime: graphemeTimings.length ? graphemeTimings[Math.min(gj, graphemeTimings.length - 1)].startTime : 0,
          charEndTime: graphemeTimings.length ? graphemeTimings[Math.min(gj, graphemeTimings.length - 1)].endTime : 0
        });
      }

      /* Body 层（:260-267 relative z-10 block） */
      var bodyEl = classicEl('span', 'cl-body');
      bodyEl.style.cssText = 'position:relative;z-index:10;display:block;';
      bodyEl.textContent = word.text;

      wEl.appendChild(glowWrap);
      wEl.appendChild(bodyEl);
      el.appendChild(wEl);

      /* 初值（initial="waiting"，:212） */
      var baseColor = theme.primaryColor;
      var duration = classicWordDisplayDuration(word, profile);
      var wRec = {
        el: wEl, glowEls: glowEls, bodyEl: bodyEl,
        word: word, profile: profile, config: config,
        baseColor: baseColor, activeColor: activeColor,
        duration: duration,
        isChorus: !!line.isChorus,
        status: 'waiting',
        rippleScale: 1.5 + Math.random() * 2,
        layoutVariants: layoutVariants,
        rippleWrap: null, ripple: null
      };
      words.push(wRec);
      /* initial="waiting"（Visualizer.tsx:212）——initial 取 waiting 变体在 custom
         下的目标值做初值（framer 语义）。mmSetInitial 只接受已 resolve 的标值
         对象（不调变体函数），须传 variants.waiting(custom) 的返回值；错传整包
         variants 或 {waiting: fn} 都一个属性写不上，后续 active/passed 动画
         from 为空串，textShadow/color 不可插值退化成离散跳变（辉光渐变丢失） */
      mmSetInitial(wEl, layoutVariants.waiting({ config: config, baseColor: baseColor, activeColor: activeColor, duration: duration, wordRevealMode: profile.wordRevealMode }), null);
      mmSetInitial(bodyEl, ClassicBodyVariants.waiting({ baseColor: baseColor, activeColor: activeColor, duration: duration, wordRevealMode: profile.wordRevealMode }), null);
      for (var si = 0; si < glowEls.length; si++) {
        var gc = glowEls[si];
        var gcustom = gc.total > 1 ? {
          config: config, activeColor: activeColor, baseColor: baseColor, duration: duration,
          index: gc.index, total: gc.total, charStartTime: gc.charStartTime, charEndTime: gc.charEndTime,
          wordStartTime: word.startTime, wordRevealMode: profile.wordRevealMode
        } : {
          config: config, activeColor: activeColor, baseColor: baseColor, duration: duration,
          wordRevealMode: profile.wordRevealMode
        };
        mmSetInitial(gEl, ClassicWordGlowVariants.waiting(gcustom), null);
      }
    }

    slots.appendChild(lineBox);
    activeLineEl = lineBox;

    /* 行容器进出动画（:589-594 initial/animate/exit 同构） */
    var motion = classicLineContainerMotion(profile);
    var mst = mmGetState(el);
    mmSetInitial(el, motion.initial, null);
    mmApplyVariant(el, { enter: motion.animate }, 'enter', null);
    lineBox.__exitVariant = motion.exit;
    lineBox.__lineEl = el;
  }

  /* 行退出（AnimatePresence exit + popLayout 移除等价） */
  function exitLine() {
    if (!activeLineEl) return;
    var old = activeLineEl;
    activeLineEl = null;
    var inner = old.__lineEl;
    var exitVariant = old.__exitVariant || { opacity: 0, transition: { duration: 0.3 } };
    mmApplyVariant(inner, { exit: exitVariant }, 'exit', null);
    var exitDur = ((exitVariant.transition && exitVariant.transition.duration) || 0.3) * 1000 + 90;
    var timer = setTimeout(function () {
      if (old.parentNode) old.parentNode.removeChild(old);
    }, exitDur);
    exitTimers.push(timer);
  }

  function clearExitTimers() {
    for (var i = 0; i < exitTimers.length; i++) clearTimeout(exitTimers[i]);
    exitTimers = [];
  }

  /* ---------- 底部字幕（VisualizerSubtitleOverlay :48-215 等价；
     MineRadio 无 romanization/alternateTexts → 单 translation 轨） ---------- */
  function renderSubtitle(activeLine, recentCompletedLine, nextLines) {
    var shouldRender = showText && !hideTranslationSubtitle;
    var translation = null;
    if (shouldRender) {
      var candidates = [activeLine, recentCompletedLine];
      for (var i = 0; i < candidates.length; i++) {
        var line = candidates[i];
        var text = line && line.translation ? String(line.translation) : '';
        if (text && classicHasReadableText(text)) { translation = text; break; }
      }
    }
    var upcoming = [];
    if (shouldRender && !translation && activeLine) {
      upcoming = (nextLines || []).filter(function (l) { return classicHasReadableText(l.fullText); });
    }

    var key = translation ? 't:' + translation : (upcoming.length ? 'u:' + upcoming.map(function (l) { return l.startTime; }).join('|') : null);
    if (key === subtitleKey) return;

    /* 外层容器 AnimatePresence（:134-146）：显隐 opacity(0.6)/y 0.24s easeOut */
    if (!key) {
      subtitleKey = null;
      mmApplyVariant(sub, {
        exit: { opacity: 0, y: 20, transition: { duration: 0.24, ease: 'easeOut' } }
      }, 'exit', null);
      return;
    }
    subtitleKey = key;
    sub.innerHTML = '';
    var content = classicEl('div');
    content.style.cssText = 'position:relative;display:inline-block;padding:2px 6px;';

    /* 内层换行容器（:157-162 motion.div key=trans-<startTime>：行切换即重挂载，
       initial{opacity:0,y:10}→animate{opacity:1,y:0}，无显式 transition →
       framer 缺省 0.3s easeOut——mm 缺省同参（mini-motion.js:376/389/76）；
       原版该层不在独立 AnimatePresence 内，行切换为直接替换后入场 */
    var transBox = classicEl('div');
    transBox.style.cssText = 'position:relative;z-index:10;max-width:56rem;margin:0 auto;';
    content.appendChild(transBox);

    if (translation) {
      var glowBg = classicEl('div');
      glowBg.setAttribute('aria-hidden', 'true');
      glowBg.style.cssText = 'position:absolute;left:-40px;right:-40px;top:-24px;bottom:-24px;z-index:0;filter:blur(24px);' +
        'background:radial-gradient(ellipse 115% 130% at center, ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.96) + ' 0%, ' +
        CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.78) + ' 62%, transparent 100%);';
      content.appendChild(glowBg);
      var transEl = classicEl('div');
      /* 主行（非 secondary）字重回退 500 / 翻译字体栈（:175-176；
         MineRadio 单轨 → 恒为主行参数） */
      transEl.style.cssText = 'color:' + (theme.secondaryColor || theme.primaryColor) +
        ';font-size:' + subtitleSizes.translationFontSize +
        ';font-family:' + CM_resolveThemeTranslationFontStack(theme) +
        ';font-weight:' + CM_resolveThemeFontWeight(theme, 500) +
        ';text-shadow:0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.24) + ';';
      transEl.textContent = translation;
      transBox.appendChild(transEl);
    } else {
      var upWrap = classicEl('div');
      upWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:center;';
      for (var u = 0; u < upcoming.length; u++) {
        var p = classicEl('p');
        /* 下一句预览字重回退 400（:205） */
        p.style.cssText = 'margin:0;max-width:42rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:all .5s ease;filter:blur(1px);' +
          'color:' + (theme.secondaryColor || theme.primaryColor) + ';font-size:' + subtitleSizes.upcomingFontSize +
          ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) +
          ';text-shadow:0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.24) + ';';
        p.textContent = upcoming[u].fullText;
        upWrap.appendChild(p);
      }
      transBox.appendChild(upWrap);
    }
    sub.appendChild(content);
    /* 内层重挂载入场（framer 缺省 0.3s easeOut，见上） */
    mmSetInitial(transBox, { opacity: 0, y: 10 }, null);
    mmApplyVariant(transBox, { enter: { opacity: 1, y: 0 } }, 'enter', null);
    /* 外层 AnimatePresence（:136-141 resolvedOpacity=0.6，0.24s easeOut） */
    mmApplyVariant(sub, {
      enter: { opacity: 0.6, y: 0, transition: { opacity: { duration: 0.24, ease: 'easeOut' }, y: { duration: 0.24, ease: 'easeOut' } } }
    }, 'enter', null);
  }

  /* ---------- 主循环（:200 App 时钟等价：每帧轮询 MV + 行管理） ---------- */
  var displayWordsCache = [];
  var lastViewportW = 0;

  function tick() {
    if (destroyed) return;
    var now = currentTime.get();
    if (now !== lastTime) {
      lastTime = now;
      currentTime.emit(now);   /* useMotionValueEvent(currentTime,'change') 等价 */
    }

    var idx = classicFindLineIndexAtTime(lines, now);
    var activeLine = idx >= 0 ? lines[idx] : null;
    var key = activeLine ? String(activeLine.startTime) : null;

    /* 空态显隐（:623-637 条件渲染等价：showText && !activeLine 时可见，
       AnimatePresence 淡入淡出 → CSS opacity 过渡；showText=false 原版
       连空态也不渲染） */
    idle.style.opacity = (showText && !activeLine) ? '1' : '0';

    if (key !== currentLineKey) {
      currentLineKey = key;
      if (activeLine) {
        activeProfile = classicResolveLineRenderProfile(activeLine);
        displayWordsCache = classicBuildDisplayWords(activeLine, tuning);
        var viewportW = (typeof window !== 'undefined' && window.innerWidth) || 1200;
        lastViewportW = viewportW;
        var layouts = classicComputeLayouts(activeLine, displayWordsCache, tuning, theme, lyricsFontScale, viewportW);
        exitLine();
        renderLine(activeLine, layouts.wordConfigs, layouts.lineConfig);
        /* 切行帧即推进一次三态（避免新行停在 waiting 一帧以上） */
        for (var wi = 0; wi < words.length; wi++) setWordStatus(words[wi], 'waiting');
      } else {
        exitLine();
        words = [];
        activeProfile = null;
      }
      /* recentCompletedLine（runtime.ts:35）+ 下一句预览 */
      var recent = classicGetRecentCompletedLine(lines, idx, now, CM_getLineRenderEndTime);
      renderSubtitle(activeLine, recent, classicGetUpcomingLines(lines, idx, 2));
    }

    rafId = requestAnimationFrame(tick);
  }

  function onResize() {
    if (destroyed) return;
    var w = (typeof window !== 'undefined' && window.innerWidth) || 1200;
    if (w !== lastViewportW) {
      /* 视口变化 → 布局 memo 重算（:471 依赖 viewportWidth），强制重建当前行 */
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
      words = [];
      activeLineEl = null;
    },
    setLines: function (next) { lines = next || []; currentLineKey = null; },
    setTheme: function (next) {
      theme = next;
      tuning = classicResolveTuning(tuning);
      layoutVariants = classicMakeLayoutVariants(tuning, theme);
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
      tuning = classicResolveTuning(t);
      layoutVariants = classicMakeLayoutVariants(tuning, theme);
      float = classicLyricContainerFloat(tuning, theme);
      if (float) mmApplyVariant(main, { floating: float }, 'floating', null);
      currentLineKey = null;
    }
  };
}
