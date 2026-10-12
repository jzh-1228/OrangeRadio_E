/* =========================================================================
   partita 渲染核心 —— Folia partita VisualizerPartita.tsx 的无构建 DOM 忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     src/components/visualizer/partita/VisualizerPartita.tsx（渲染核心全量）
     src/components/visualizer/wordGlow.ts（逐字辉光三态 variants——与 classic
       共用同一 wordGlowVariants 符号，内容逐值同构）
     src/components/visualizer/runtime.ts（当前行/最近完成行/ upcoming / 预热窗口）
     src/components/visualizer/VisualizerSubtitleOverlay.tsx（底部字幕/下一句预览）
     src/utils/appPlaybackHelpers.ts:21（findLatestActiveLineIndex —— currentLineIndex
       权威语义）
     src/types.ts:428-433（DEFAULT_PARTITA_TUNING）

   结构对应（React → 无构建 DOM，行号均为 VisualizerPartita.tsx）：
     VisualizerShell        → pt-shell（fontFamily/fontWeight inline，同 Shell :128-134）
     主容器 motion.div      → pt-main（lyricContainerFloat 呼吸浮动 :835-855，mm 驱动）
     AnimatePresence        → 行槽双槽并存（旧行播 exit 后移除，popLayout 等价：
                               行槽为叠加定位层，新旧行互不影响布局）
     行容器 motion.div      → pt-line（flex-row-reverse + perspective + columnGap :869-881）
     Column/colInner        → pt-column / pt-col-inner（:884-889）
     PartitaChunk           → pt-chunk（chunk 三态 :505-551 + 引导线 :553-640 + 词内随机散布 :642-665）
     PartitaWord            → pt-word（词三态 :394-402 + glow/body 双层 :425-468 + 副歌涟漪 :471-483）
     layoutVariants         → partitaMakeLayoutVariants（:767-803 同构）
     bodyVariants           → PartitaBodyVariants（:805-833 同构）
     wordGlowVariants       → PartitaWordGlowVariants（wordGlow.ts :84-156 同构）
     VisualizerSubtitleOverlay → pt-sub（翻译行 + 下一句预览，AnimatePresence 等价）
     useMotionValueEvent    → currentTime MV 每帧轮询派发 change（词/chunk 三态机订阅）
     useVisualizerRuntime   → partitaGetRecentCompletedLine / partitaGetUpcomingLine /
                               partitaGetUpcomingLines（runtime.ts :35-86 纯函数等价）
     shouldPreheatLine 预热  → partitaShouldPreheatLine（runtime.ts :90-101，窗口 0.18~1.2s）

   动画全部经 mini-motion（framer 子集忠实实现）驱动：variants 三态目标值、
   spring(200,20)、keyframes+times、color/filter 复杂值插值、transitionEnd。
   唯一例外：chunk 引导线的 scaleY/scaleX（:566-572/:585-592 等）是单轴缩放，
   mini-motion 的 transform 模型只持均匀 scale，故用 CSS 独立 transform 属性
   `scale: "1 <sy>"` + 0.4s cubic-bezier(0,0,0.58,1)（framer easeOut 同参）
   过渡承载——该属性不与 mm 的 transform 冲突，插值语义与 framer 一致。

   原版值还原声明（相对本项目旧简化实现 20-partita.js）：
   · staggerScale 回归原式 0.8 + random()*0.9（:276，旧版曾收敛为 0.9+rand*0.45）；
   · chunk marginBottom 回归原值 '0.6rem'（:290，旧版曾加 scale 溢出补偿）；
   · 词内随机散布 baseSpread 6 / baseRotate 3 / passedRotate *20（:653-664 原值）；
   · spring(200,20) / rotate passed 5s linear / 行进出三档 blur —— 全走 mini-motion
     真实弹簧与插值，不再用 CSS 贝塞尔近似。

   MineRadio 宿主差异（数据源在桥）：无 calm/chaotic 强度档（theme.animationIntensity
   恒 'normal'，isCalm/isChaotic 分支保留结构）；无主题词色表（wordColors=[]，
   resolveWordColor 回退 accentColor——算法本体已随闭包落地并被测试覆盖）；
   空态文案走宿主文案（Folia i18n 'ui.waitingForMusic' 值为空串，屏幕本就无字）。
   Folia 源码中 isCJK(:90) 与 getTargetColumnCount(:197) 为未引用的死代码，不落地。
   ========================================================================= */

/* ---------- tuning（types.ts:428-433 原值） ---------- */
var PARTITA_DEFAULT_TUNING = {
  showGuideLines: true,
  useSemanticLayout: true,
  staggerMin: 20,
  staggerMax: 100
};

/* clamp（:101） */
function partitaClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

/* clampPartitaStagger（:102-104） */
function partitaClampStagger(value, fallback) {
  return (typeof Number.isFinite === 'function' && Number.isFinite(value))
    ? partitaClamp(value, 0, 180)
    : fallback;
}

/* resolvePartitaTuning（:106-116） */
function partitaResolveTuning(tuning) {
  var rawMin = partitaClampStagger(
    (tuning && tuning.staggerMin != null) ? tuning.staggerMin : PARTITA_DEFAULT_TUNING.staggerMin,
    PARTITA_DEFAULT_TUNING.staggerMin);
  var rawMax = partitaClampStagger(
    (tuning && tuning.staggerMax != null) ? tuning.staggerMax : PARTITA_DEFAULT_TUNING.staggerMax,
    PARTITA_DEFAULT_TUNING.staggerMax);
  return {
    showGuideLines: (tuning && tuning.showGuideLines != null) ? tuning.showGuideLines : PARTITA_DEFAULT_TUNING.showGuideLines,
    useSemanticLayout: (tuning && tuning.useSemanticLayout != null) ? tuning.useSemanticLayout : PARTITA_DEFAULT_TUNING.useSemanticLayout,
    staggerMin: Math.min(rawMin, rawMax),
    staggerMax: Math.max(rawMin, rawMax)
  };
}

/* splitGraphemes（:91-100） */
var partitaGraphemeSegmenter = (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function')
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;
function partitaSplitGraphemes(text) {
  if (!text) return [];
  if (partitaGraphemeSegmenter) {
    var out = [];
    var it = partitaGraphemeSegmenter.segment(text)[Symbol.iterator]();
    for (var s = it.next(); !s.done; s = it.next()) out.push(s.value.segment);
    return out;
  }
  return Array.from(text);
}

/* EMPTY_PARTITA_LAYOUT（:73-82） */
var PARTITA_EMPTY_LAYOUT = {
  columns: [],
  totalGraphemes: 0,
  lineConfig: {
    perspective: 1000,
    justifyContent: 'justify-center',
    alignItems: 'items-center',
    columnGap: '1.6rem'
  }
};

var PARTITA_LAYOUT_CACHE_LIMIT = 48;              /* :84 */
var PARTITA_PREHEAT_WINDOW = { minLead: 0.18, maxLead: 1.2 };   /* :85-88 */

/* resolvePartitaLineRenderProfile（:118-133）——renderHints 来自歌词管线（闭包） */
function partitaResolveLineRenderProfile(line) {
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

/* getPartitaWordActiveEndTime（:135-145） */
function partitaWordActiveEndTime(word, profile) {
  if (profile.wordRevealMode === 'instant') return profile.lineRenderEndTime;
  if (profile.wordRevealMode === 'fast') {
    return Math.min(profile.lineRenderEndTime, Math.max(word.endTime, word.startTime + 0.12));
  }
  return word.endTime;
}

/* getPartitaWordDisplayDuration（:147-156） */
function partitaWordDisplayDuration(word, profile) {
  var activeEndTime = partitaWordActiveEndTime(word, profile);
  var minDuration = profile.wordRevealMode === 'instant' ? 0.08
    : profile.wordRevealMode === 'fast' ? 0.12 : 0.1;
  return Math.max(activeEndTime - word.startTime, minDuration);
}

/* getPartitaLineContainerMotion（:158-191）——行进出三档 initial/animate/exit */
function partitaLineContainerMotion(profile) {
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

/* getActiveColor（:193-195） */
function partitaGetActiveColor(wordText, theme) {
  return CM_resolveWordColor(wordText, theme.wordColors, theme.accentColor);
}

/* ---------- Sequential 布局（buildSequentialColumns :205-314 全量同构） ---------- */

function partitaBuildSequentialColumns(line, theme, windowHeight, tuning) {
  /* intensity/isChaotic/isCalm（:208-210）：宿主恒 normal，分支保留结构 */
  var intensity = theme.animationIntensity;
  var isChaotic = intensity === 'chaotic';
  var isCalm = intensity === 'calm';
  var totalGraphemes = Math.max(
    partitaSplitGraphemes(String(line.fullText || '').replace(/\s+/g, '')).length,
    line.words.length, 1);
  var layoutUnits = CM_buildPostLyricLayoutUnits(line, {
    semantic: tuning.useSemanticLayout,
    sticky: true
  });

  var columns = [];
  var currentWords = [];

  /* 行数由可用高度决定（:220-223） */
  var baseRowHeight = 100;
  var availableHeight = windowHeight * 0.65;
  var targetRowCount = Math.max(1, Math.floor(availableHeight / baseRowHeight));
  var actualRowCount = Math.min(layoutUnits.length, targetRowCount);

  /* 确定性种子随机（:225-229）：sin(seed++)*10000 取小数 */
  var seed = line.startTime;
  var random = function () {
    var x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  /* 不均匀切 chunk（:231-258）：完全平均太机械，失去手写谱错落感 */
  var chunks = [];
  var remainingUnits = layoutUnits.length;
  var remainingChunks = actualRowCount;
  var unitIndex = 0;

  for (var c = 0; c < actualRowCount; c++) {
    var isLastChunk = c === actualRowCount - 1;
    var avg = remainingUnits / remainingChunks;

    var chunkLength = 1;
    if (isLastChunk) {
      chunkLength = remainingUnits;
    } else {
      var max = Math.ceil(avg * 1.5);
      var min = 1;
      var randVal = random();
      chunkLength = Math.max(min, Math.min(max, Math.round(avg + (randVal - 0.5) * avg)));
    }

    chunkLength = Math.max(1, Math.min(chunkLength, remainingUnits - (remainingChunks - 1)));

    chunks.push(layoutUnits.slice(unitIndex, unitIndex + chunkLength));
    unitIndex += chunkLength;
    remainingUnits -= chunkLength;
    remainingChunks--;
  }

  chunks.forEach(function (chunkUnits, rowIndex) {
    var chunkWords = [];
    for (var i = 0; i < chunkUnits.length; i++) {
      var unitWords = chunkUnits[i].words;
      for (var j = 0; j < unitWords.length; j++) chunkWords.push(unitWords[j]);
    }
    var displayWords = CM_buildDisplayWordsFromLayoutUnits(chunkUnits);
    if (chunkWords.length === 0) return;

    var mergedTextForConfig = '';
    for (var w = 0; w < chunkWords.length; w++) mergedTextForConfig += chunkWords[w].text.trim();
    var graphemeCount = partitaSplitGraphemes(mergedTextForConfig.replace(/\s+/g, '')).length;
    var rowBias = rowIndex - (actualRowCount - 1) / 2;

    var isStaggeredLeft = rowIndex % 2 === 0;

    /* stagger 是云阶的核心（:271-274）：块位置错落有致但仍读作一行 */
    var staggerMagnitude = tuning.staggerMin + random() * Math.max(tuning.staggerMax - tuning.staggerMin, 0);
    var staggerX = isStaggeredLeft ? -staggerMagnitude : staggerMagnitude;

    var staggerScale = isCalm ? 1 : 0.8 + random() * 0.9;   /* :276 原式 */

    currentWords.push({
      chunkUnits: chunkUnits,
      chunkWords: chunkWords,
      displayWords: displayWords,
      order: rowIndex,
      rowIndex: rowIndex,
      config: {
        id: rowIndex + '-' + chunkWords[0].startTime,
        x: staggerX,
        y: isCalm ? 0 : rowBias * 2.5,
        rotate: isChaotic ? (isStaggeredLeft ? -3 : 3) : 0,
        scale: (isChaotic ? 1 + Math.min(graphemeCount * 0.01, 0.05) : 1) * staggerScale,
        marginBottom: isChaotic ? '0.4rem' : '0.6rem',
        alignSelf: 'center',
        passedRotate: (rowIndex % 2 === 0 ? 1 : -1) * (isChaotic ? 6 : 3)
      }
    });
  });

  if (currentWords.length > 0) {
    columns.push({
      id: 'column-' + line.startTime + '-0',
      words: currentWords
    });
  }

  return {
    columns: columns,
    totalGraphemes: totalGraphemes,
    lineConfig: {
      perspective: theme.animationIntensity === 'chaotic' ? 720 : 1000,
      alignItems: 'items-center',
      justifyContent: 'justify-center',
      columnGap: '2rem'
    }
  };
}

/* buildPartitaLayoutCacheKey（:316-341 全字段同构） */
function partitaBuildLayoutCacheKey(line, theme, windowHeight, tuning) {
  var windowHeightBucket = Math.round(windowHeight / 24);
  return [
    'semantic-layout-v1',
    line.startTime,
    line.endTime,
    line.words.length,
    line.fullText,
    /* 保存分词喂给 buildPostLyricLayoutUnits，会改变列结构（:329-331 原注释） */
    CM_getWordSegmentationKey(line),
    theme.animationIntensity,
    theme.fontWeight != null ? theme.fontWeight : 'auto',
    windowHeightBucket,
    tuning.staggerMin,
    tuning.staggerMax,
    tuning.showGuideLines ? 1 : 0,
    tuning.useSemanticLayout ? 1 : 0
  ].join('|');
}

/* getOrBuildPartitaLayout（:343-368）——布局缓存 LRU 48 */
function partitaGetOrBuildLayout(cache, line, theme, windowHeight, tuning) {
  var cacheKey = partitaBuildLayoutCacheKey(line, theme, windowHeight, tuning);
  var cached = cache.get(cacheKey);
  if (cached) return cached;

  var layout = partitaBuildSequentialColumns(line, theme, windowHeight, tuning);
  cache.set(cacheKey, layout);

  if (cache.size > PARTITA_LAYOUT_CACHE_LIMIT) {
    var oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined && oldestKey !== null) cache.delete(oldestKey);
  }
  return layout;
}

/* ---------- runtime.ts 纯函数等价（:35-101） ---------- */

/* getRecentCompletedLine（runtime.ts:35-52） */
function partitaGetRecentCompletedLine(lines, currentLineIndex, t, getLineEndTime) {
  if (currentLineIndex !== -1 || !lines || lines.length === 0) return null;
  for (var i = lines.length - 1; i >= 0; i--) {
    if (t > getLineEndTime(lines[i])) return lines[i];
  }
  return null;
}

/* getUpcomingLine（runtime.ts:56-73） */
function partitaGetUpcomingLine(lines, currentLineIndex, t) {
  var activeLine = lines[currentLineIndex];
  if (activeLine) {
    return lines[currentLineIndex + 1] != null ? lines[currentLineIndex + 1] : null;
  }
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].startTime > t) return lines[i];
  }
  return null;
}

/* getUpcomingLines（runtime.ts:76-86） */
function partitaGetUpcomingLines(lines, currentLineIndex, count) {
  if (currentLineIndex < 0) return [];
  return lines.slice(currentLineIndex + 1, currentLineIndex + 1 + count);
}

/* shouldPreheatLine（runtime.ts:90-101） */
function partitaShouldPreheatLine(line, t, win) {
  if (!line) return false;
  var leadTime = line.startTime - t;
  return leadTime >= win.minLead && leadTime <= win.maxLead;
}

/* findLatestActiveLineIndex（appPlaybackHelpers.ts:21-32）——currentLineIndex 权威语义 */
function partitaFindLineIndexAtTime(lines, time) {
  for (var index = (lines ? lines.length : 0) - 1; index >= 0; index--) {
    var line = lines[index];
    if (!line || time < line.startTime) continue;
    if (time <= ((line.renderHints && line.renderHints.renderEndTime != null) ? line.renderHints.renderEndTime : line.endTime)) {
      return index;
    }
  }
  return -1;
}

/* ---------- wordGlow.ts（:45-156 同构，与 classic 共用同一符号实现） ---------- */
var PARTITA_DROP_SHADOW_RADIUS_SCALE = 0.4;
var PARTITA_DROP_SHADOW_INNER_ALPHA = 0.7;

/* withAlpha（wordGlow.ts:45-47） */
function partitaGlowWithAlpha(color, alpha) {
  return /^\s*(#|rgba?\()/.test(color) ? CM_colorWithAlpha(color, alpha) : color;
}

/* textShadowAt（wordGlow.ts:50-52） */
function partitaTextShadowAt(color, inner, outer) {
  return '0 0 ' + inner + 'px ' + color + ', 0 0 ' + outer + 'px ' + color;
}

/* dropShadowAt（wordGlow.ts:55-58） */
function partitaDropShadowAt(color, inner, outer) {
  return 'drop-shadow(0 0 ' + (inner * PARTITA_DROP_SHADOW_RADIUS_SCALE) + 'px ' + partitaGlowWithAlpha(color, PARTITA_DROP_SHADOW_INNER_ALPHA) + ') ' +
    'drop-shadow(0 0 ' + (outer * PARTITA_DROP_SHADOW_RADIUS_SCALE) + 'px ' + color + ')';
}

/* glowKeyframes（wordGlow.ts:65-77） */
function partitaGlowKeyframes(color, inner, outer, peaks) {
  if (!CM_isGlowBlurQuantized()) {
    return {
      color: 'transparent',
      textShadow: peaks.map(function (peak) { return peak > 0 ? partitaTextShadowAt(color, inner, outer) : 'none'; })
    };
  }
  return {
    color: color,
    opacity: peaks,
    filter: peaks.map(function (peak) { return partitaDropShadowAt(color, inner * peak, outer * peak); })
  };
}

/* wordGlowVariants（wordGlow.ts:84-156 三态全量同构） */
var PartitaWordGlowVariants = {
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
      return merge(partitaGlowKeyframes(c.activeColor, 14, 24, [0, 1, 0]), {
        transition: { duration: Math.min(c.duration || 0.08, 0.12), times: [0, 0.35, 1], ease: 'easeOut' }
      });
    }
    if (c.wordRevealMode === 'fast') {
      return merge(partitaGlowKeyframes(c.activeColor, 18, 32, [0, 1, 0]), {
        transition: { duration: Math.min(Math.max(c.duration || 0.12, 0.12), 0.2), times: [0, 0.4, 1], ease: 'easeInOut' }
      });
    }
    if (c.total !== undefined && c.total > 1) {
      var singleDuration = (c.duration || 0) / c.total;
      var hasCharTiming = typeof c.charStartTime === 'number' && typeof c.charEndTime === 'number' && typeof c.wordStartTime === 'number';
      var charDuration = hasCharTiming ? Math.max(c.charEndTime - c.charStartTime, 0.001) : singleDuration;
      var charDelay = hasCharTiming ? Math.max(0, c.charStartTime - c.wordStartTime) : singleDuration * (c.index || 0);
      return merge(partitaGlowKeyframes(c.activeColor, 20, 40, [0, 1, 0]), {
        transition: { duration: charDuration * 6, times: [0, 0.3, 1], delay: charDelay, ease: 'easeInOut' }
      });
    }
    return merge(partitaGlowKeyframes(c.activeColor, 20, 40, [0, 1, 1]), {
      transition: { duration: (c.duration || 0.1), times: [0, 0.9, 1], ease: 'easeInOut' }
    });
  },
  passed: function (c) {
    var transition = { duration: c.wordRevealMode === 'instant' ? 0.12 : c.wordRevealMode === 'fast' ? 0.22 : 0.9, ease: 'easeOut' };
    if (!CM_isGlowBlurQuantized()) {
      return { color: 'transparent', textShadow: 'none', transition: transition };
    }
    return { color: c.activeColor, opacity: 0, filter: partitaDropShadowAt(c.activeColor, 0, 0), transition: transition };
  }
};

/* ---------- 词三态 variants（:767-803 同构） ---------- */

/* layoutVariants（:767-803）——词容器 waiting/active/passed */
function partitaMakeLayoutVariants(theme) {
  return {
    waiting: function (custom) {
      var config = custom.config;
      return {
        opacity: 0,
        scale: 0.5,
        x: config.x + (Math.sin(config.y) * 100),
        y: config.y + (Math.cos(config.x) * 50),
        rotate: config.rotate + 20,
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

/* bodyVariants（:805-833）——body 层 color/blur 过渡 */
var PartitaBodyVariants = {
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

/* chunk 三态 animate（PartitaChunk :534-551：active 走 spring，其余 0.4 easeOut；
   passed 与 active 同目标值，仅 transition 落回 0.4 easeOut） */
var PartitaChunkVariants = {
  waiting: function (custom) {
    var config = custom.config;
    return {
      opacity: 0,
      scale: 0.85,
      x: config.x + (custom.guidePosition === 'left' ? -40 : 40),
      y: config.y,
      rotate: config.rotate,
      transition: { duration: 0.4, ease: 'easeOut' }
    };
  },
  active: function (custom) {
    var config = custom.config;
    return {
      opacity: 1,
      scale: 1,
      x: config.x,
      y: config.y,
      rotate: config.rotate,
      transition: { type: 'spring', stiffness: 200, damping: 20, opacity: { duration: 0.1 } }
    };
  },
  passed: function (custom) {
    var config = custom.config;
    return {
      opacity: 1,
      scale: 1,
      x: config.x,
      y: config.y,
      rotate: config.rotate,
      transition: { duration: 0.4, ease: 'easeOut' }
    };
  }
};

/* lyricContainerFloat（:835-855）——整行呼吸浮动 */
function partitaLyricContainerFloat(theme) {
  var configByIntensity = {
    calm: { distance: 10, duration: 8.5 },
    normal: { distance: 14, duration: 7 },
    chaotic: { distance: 18, duration: 5.8 }
  };
  var cfg = configByIntensity[theme.animationIntensity] || configByIntensity.normal;
  return {
    animate: {
      y: [0, -cfg.distance, 0, cfg.distance * 0.45, 0],
      scale: [1, 1.01, 1, 0.995, 1]
    },
    transition: { duration: cfg.duration, repeat: Infinity, ease: 'easeInOut' }
  };
}

/* ---------- 字号（:761-765 原公式 × lyricsFontScale） ---------- */

function partitaMainFontSize(densityScale, fontScale) {
  return 'clamp(' + (2.5 * densityScale * fontScale).toFixed(3) + 'rem, ' + (5.5 * densityScale * fontScale).toFixed(3) + 'vw, ' + (4.5 * densityScale * fontScale).toFixed(3) + 'rem)';
}
function partitaEmptyFontSize(fontScale) {
  return 'clamp(' + (1.2 * fontScale).toFixed(3) + 'rem, ' + (2.8 * fontScale).toFixed(3) + 'vw, ' + (1.9 * fontScale).toFixed(3) + 'rem)';
}
function partitaTranslationFontSize(fontScale) {
  return 'clamp(' + (1.05 * fontScale).toFixed(3) + 'rem, ' + (2.2 * fontScale).toFixed(3) + 'vw, ' + (1.2 * fontScale).toFixed(3) + 'rem)';
}
function partitaUpcomingFontSize(fontScale) {
  return 'clamp(' + (0.875 * fontScale).toFixed(3) + 'rem, ' + (1.8 * fontScale).toFixed(3) + 'vw, ' + (1.0 * fontScale).toFixed(3) + 'rem)';
}

/* ---------- subtitleTrackStyle.ts 常量原值（secondary 行仅 romanization 用，
   MineRadio 单翻译轨不触发，保留常量备查） ---------- */
var PARTITA_SECONDARY_TRACK_SIZE_FACTOR = 0.88;
var PARTITA_SECONDARY_TRACK_OPACITY = 0.82;
var PARTITA_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK = 400;
var PARTITA_SECONDARY_TRACK_GAP_EM = 0.25;

/* hasReadableText（VisualizerSubtitleOverlay.tsx:20）——纯标记行永不进字幕 */
function partitaHasReadableText(text) {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

/* ---------- DOM 工具 ---------- */

function partitaEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function partitaEl(tag, className, styleText) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (styleText) el.style.cssText = styleText;
  return el;
}

/* ---------- 引擎实例 ---------- */

/**
 * PartitaPartitaEngine(opts) —— partita 模式渲染引擎（VisualizerPartita.tsx 组件树的宿主等价）
 * opts: { host, lines, currentTime(MV), theme, tuning?, lyricsFontScale?, showText?,
 *         hideTranslationSubtitle?, showSubtitleTranslation? }
 * 返回 { destroy, setLines, setTheme, setFontScale, setTuning }
 */
function PartitaPartitaEngine(opts) {
  var host = opts.host;
  var lines = opts.lines || [];
  var theme = opts.theme;
  var tuning = partitaResolveTuning(opts.tuning);
  var lyricsFontScale = opts.lyricsFontScale != null ? opts.lyricsFontScale : 1;
  var showText = opts.showText !== false;
  var hideTranslationSubtitle = !!opts.hideTranslationSubtitle;
  var showSubtitleTranslation = opts.showSubtitleTranslation !== false;

  var currentTime = opts.currentTime;
  var lastTime = null;
  var destroyed = false;
  var rafId = 0;
  var windowHeight = (typeof window !== 'undefined' && window.innerHeight) || 800;
  var layoutCache = new Map();

  /* ---------- 壳（VisualizerShell :128-134 等价：字体/字重 inline） ---------- */
  var shell = partitaEl('div', 'pt-shell');
  shell.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;font-family:' +
    CM_resolveThemeFontStack(theme) + ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) + ';';

  /* 主容器（:864-868 relative z-10 w-full h-[70vh] flex items-center justify-center p-8） */
  var main = partitaEl('div', 'pt-main');
  main.style.cssText = 'position:relative;z-index:10;width:100%;height:70vh;display:flex;align-items:center;justify-content:center;padding:32px;pointer-events:none;will-change:transform;';

  /* 行槽（AnimatePresence popLayout 等价：叠加定位层，双槽并存互不影响布局） */
  var slots = partitaEl('div', 'pt-slots');
  slots.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';
  main.appendChild(slots);

  /* 空态（:915-929：text-2xl opacity-50 absolute，animate opacity 0↔1；
     文案 = t('ui.waitingForMusic')——Folia 三语言 i18n 均为空串
     （zh-CN.ts:628 / en.ts:628 / in.ts:623），屏幕无字，结构保留） */
  var idle = partitaEl('div', 'pt-idle');
  idle.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
    'font-size:1.5rem;line-height:2rem;opacity:0;transition:opacity .25s ease;color:' + (theme.secondaryColor || theme.primaryColor) + ';' +
    'font-size:' + partitaEmptyFontSize(lyricsFontScale) + ';';
  idle.textContent = '';
  main.appendChild(idle);

  /* 底部字幕（VisualizerSubtitleOverlay :132-215 等价） */
  var sub = partitaEl('div', 'pt-sub');
  /* bottom：底栏（#bottom-bar bottom:16px + 自身高 ≈96px）上方留 20px——
     Folia 侧由 usePlayerSubtitleBottomPx 按底栏基线换算，此处对齐本项目底栏几何；
     initial {opacity:0, y:20}（:136）走 mm 初值（含 transform 状态） */
  sub.style.cssText = 'position:absolute;left:0;right:0;bottom:132px;text-align:center;padding:0 16px;z-index:20;pointer-events:none;';
  mmSetInitial(sub, { opacity: 0, y: 20 }, null);
  shell.appendChild(main);
  shell.appendChild(sub);
  host.appendChild(shell);

  var float = partitaLyricContainerFloat(theme);
  mmApplyVariant(main, { floating: float }, 'floating', null);

  /* ---------- 行/词运行时 ---------- */
  var currentLineKey = null;     /* activeLine.startTime（行 key :872） */
  var activeLineEl = null;       /* 当前行槽元素 */
  var exitTimers = [];
  var words = [];                /* PartitaWord 记录 */
  var chunks = [];               /* PartitaChunk 记录 */
  var activeProfile = null;
  var activeLayout = PARTITA_EMPTY_LAYOUT;
  var layoutVariants = partitaMakeLayoutVariants(theme);
  var subtitleKey = null;

  /* 词三态机（PartitaWord useMotionValueEvent :394-402 等价） */
  function evaluateWordStatus(w, latest) {
    var newStatus;
    if (latest >= w.word.startTime - w.profile.wordLookahead && latest <= w.activeEndTime) {
      newStatus = 'active';
    } else if (latest > w.activeEndTime) {
      newStatus = 'passed';
    } else {
      newStatus = 'waiting';
    }
    if (newStatus !== w.status) setWordStatus(w, newStatus);
  }

  /* chunk 三态机（PartitaChunk useMotionValueEvent :510-518 等价） */
  function evaluateChunkStatus(c, latest) {
    var newStatus;
    if (latest >= c.startTime - c.profile.wordLookahead && latest <= c.endTime) {
      newStatus = 'active';
    } else if (latest > c.endTime) {
      newStatus = 'passed';
    } else {
      newStatus = 'waiting';
    }
    if (newStatus !== c.status) setChunkStatus(c, newStatus);
  }

  currentTime.subscribe(function (latest) {
    for (var i = 0; i < words.length; i++) {
      if (words[i].el) evaluateWordStatus(words[i], latest);
    }
    for (var j = 0; j < chunks.length; j++) {
      if (chunks[j].el) evaluateChunkStatus(chunks[j], latest);
    }
  });

  /* ---------- 引导线（PartitaChunk :553-640）----------
     单轴缩放 scaleY/scaleX 走 CSS 独立 transform 属性 scale + 0.4s easeOut
     （framer easeOut 同参 cubic-bezier(0,0,0.58,1)）；底色/阴影为 style 直写
     （framer 中非 animate 属性 = 重渲染立即切换，不做补间）。 */
  var PARTITA_GUIDE_TRANSITION = 'scale 0.4s cubic-bezier(0,0,0.58,1), opacity 0.4s cubic-bezier(0,0,0.58,1);';

  function buildGuide(chunkEl, side, axis) {
    var isLeft = side === 'left';
    var g;
    if (axis === 'y') {
      /* 竖线（:556-574 左 / :599-618 右）：w-px h-32px bottom-[-16px] origin-bottom */
      g = partitaEl('span');
      g.style.cssText = 'position:absolute;width:1px;height:32px;bottom:-16px;' +
        (isLeft ? 'left:-8px;' : 'right:-8px;') +
        'transform-origin:center bottom;pointer-events-none;user-select:none;';
    } else {
      /* 横线（:575-596 左 / :619-640 右）：h-px bottom-[-8px] 宽 calc(100%+36px) origin-left/right */
      g = partitaEl('span');
      g.style.cssText = 'position:absolute;height:1px;bottom:-8px;width:calc(100% + 36px);' +
        (isLeft ? 'left:-16px;transform-origin:center left;' : 'right:-16px;transform-origin:center right;') +
        'pointer-events-none;user-select:none;';
    }
    g.style.transition = PARTITA_GUIDE_TRANSITION;
    chunkEl.appendChild(g);
    return { el: g, axis: axis };
  }

  function applyGuideStatus(rec) {
    var status = rec.status;
    var color = status === 'active' ? rec.activeColor : status === 'passed' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.14)';
    for (var i = 0; i < rec.guides.length; i++) {
      var g = rec.guides[i];
      g.el.style.backgroundColor = color;
      g.el.style.boxShadow = status === 'active' ? g.shadow : 'none';
      var grown = status === 'waiting' ? 0 : 1;
      g.el.style.scale = g.axis === 'y' ? ('1 ' + grown) : (grown + ' 1');
      g.el.style.opacity = status === 'waiting' ? '0' : '1';
    }
  }

  /* ---------- 词状态应用（setWordStatus :404-485 的变体派发） ---------- */
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
    mmApplyVariant(w.bodyEl, PartitaBodyVariants, status, custom);
    /* glow 层逐字（graphemeTimings.length > 1 时逐字 custom，:430-458） */
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
      mmApplyVariant(ge.el, PartitaWordGlowVariants, status, glowCustom);
    }
    /* Chorus Ripple（:471-483：isChorus && status==='active' 时挂载涟漪） */
    if (w.isChorus && status === 'active') mountRipple(w);
    else unmountRipple(w);
  }

  /* ripple：外层定位（CSS 持有居中），内层 mm 动画 scale/opacity
     （initial {scale:0.2, opacity:0.8} → animate {scale:rippleScale, opacity:0}，
     0.5s easeOut，:477-480；rippleScale = 1.5 + Math.random()*2（:386 词实例一次）） */
  function mountRipple(w) {
    if (w.ripple || w.rippleWrap) return;
    var wrap = partitaEl('span', 'pt-ripple-wrap');
    wrap.style.cssText = 'position:absolute;top:50%;left:50%;width:0;height:0;z-index:0;pointer-events:none;';
    var wh = w.el.offsetHeight * 1.5;   /* h-[150%] aspect-square */
    var el = partitaEl('span', 'pt-ripple');
    el.style.cssText = 'position:absolute;top:0;left:0;width:' + wh + 'px;height:' + wh + 'px;' +
      'margin-top:' + (-wh / 2) + 'px;margin-left:' + (-wh / 2) + 'px;' +
      'border-radius:9999px;border:1px solid ' + w.activeColor + ';filter:blur(1px);pointer-events:none;';
    wrap.appendChild(el);
    w.el.appendChild(wrap);
    w.rippleWrap = wrap; w.ripple = el;
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

  /* ---------- chunk 状态应用（PartitaChunk :534-551 + 引导线状态） ---------- */
  function setChunkStatus(c, status) {
    c.status = status;
    mmApplyVariant(c.el, PartitaChunkVariants, status, {
      config: c.config,
      guidePosition: c.guidePosition
    });
    applyGuideStatus(c);
  }

  /* ---------- 渲染一行（VisualizerPartita :869-913 的 DOM 展开） ---------- */
  function renderLine(line, layout, mainFontSize) {
    var profile = activeProfile;
    var lineBox = partitaEl('div', 'pt-linebox');
    lineBox.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';
    /* 行容器（:869-881）：flex-row-reverse + perspective + columnGap + minHeight 320px */
    var el = partitaEl('div', 'pt-line');
    el.style.cssText =
      'display:flex;flex-direction:row-reverse;align-items:stretch;justify-content:center;width:100%;max-width:64rem;' +
      'perspective:' + layout.lineConfig.perspective + 'px;' +
      'gap:' + layout.lineConfig.columnGap + ';' +
      'min-height:320px;position:relative;';
    lineBox.appendChild(el);

    var fontWeight = CM_resolveThemeFontWeight(theme, 700);

    for (var ci = 0; ci < layout.columns.length; ci++) {
      var column = layout.columns[ci];
      /* Column（:884-887 relative flex min-h-24rem min-w-3.8rem items-center justify-center px-3） */
      var columnEl = partitaEl('div', 'pt-column');
      columnEl.style.cssText = 'position:relative;display:flex;min-height:24rem;min-width:3.8rem;align-items:center;justify-content:center;padding-left:12px;padding-right:12px;';
      /* colInner（:889 relative z-10 flex flex-col items-center justify-start） */
      var colInner = partitaEl('div', 'pt-col-inner');
      colInner.style.cssText = 'position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;';

      for (var wi = 0; wi < column.words.length; wi++) {
        buildChunk(column.words[wi], colInner, line, profile, mainFontSize, fontWeight);
      }
      columnEl.appendChild(colInner);
      el.appendChild(columnEl);
    }

    slots.appendChild(lineBox);
    activeLineEl = lineBox;

    /* 行容器进出动画（:158-191 initial/animate/exit 同构） */
    var motion = partitaLineContainerMotion(profile);
    mmSetInitial(el, motion.initial, null);
    mmApplyVariant(el, { enter: motion.animate }, 'enter', null);
    lineBox.__exitVariant = motion.exit;
    lineBox.__lineEl = el;
  }

  /* PartitaChunk（:490-686）落地 */
  function buildChunk(item, parentEl, line, profile, mainFontSize, fontWeight) {
    var chunkWords = item.chunkWords;
    var displayWords = item.displayWords;
    var config = item.config;
    var guideIndex = item.rowIndex;

    var chunkStartTime = chunkWords[0].startTime;
    var chunkEndTime = partitaWordActiveEndTime(chunkWords[chunkWords.length - 1], profile);

    var chunkText = '';
    for (var i = 0; i < displayWords.length; i++) chunkText += (i ? ' ' : '') + displayWords[i].text;
    var chunkActiveColor = partitaGetActiveColor(chunkText, theme);
    var guidePosition = guideIndex % 2 === 0 ? 'left' : 'right';

    /* chunk 容器（:524-533 inline-flex origin-center whitespace-nowrap + padding 0.2rem 0.5rem） */
    var chunkEl = partitaEl('div', 'pt-chunk');
    chunkEl.style.cssText = 'display:inline-flex;transform-origin:center;position:relative;white-space:nowrap;align-items:center;justify-content:center;flex-direction:row;' +
      'margin-bottom:' + config.marginBottom + ';align-self:center;line-height:1;min-width:auto;min-height:auto;padding:3.2px 8px;';

    /* 引导线（showGuideLines :553-640） */
    var guides = [];
    if (tuning.showGuideLines) {
      var gv = buildGuide(chunkEl, guidePosition, 'y');
      gv.shadow = '0 0 10px ' + chunkActiveColor + '45';
      guides.push(gv);
      var gh = buildGuide(chunkEl, guidePosition, 'h');
      gh.shadow = '0 0 10px ' + chunkActiveColor + '35';
      guides.push(gh);
    }

    parentEl.appendChild(chunkEl);

    /* 词内随机散布（:642-665）：wordSeed = displayWords[0].startTime + idx*7.13 */
    var intensity = theme.animationIntensity;
    var isCalm = intensity === 'calm';
    var isChaotic = intensity === 'chaotic';
    var baseSpread = isChaotic ? 15 : isCalm ? 0 : 6;
    var baseRotate = isChaotic ? 8 : isCalm ? 0 : 3;

    for (var idx = 0; idx < displayWords.length; idx++) {
      var dw = displayWords[idx];
      var wordSeed = displayWords[0].startTime + idx * 7.13;
      var random = function (offset) {
        var x = Math.sin(wordSeed + offset) * 10000;
        return x - Math.floor(x);
      };

      var wordConfig = {
        id: config.id + '-w' + idx,
        x: (random(1) - 0.5) * baseSpread * 2,
        y: (random(2) - 0.5) * baseSpread * 2,
        rotate: (random(3) - 0.5) * baseRotate * 2,
        scale: config.scale,
        marginBottom: '0',
        alignSelf: 'auto',
        passedRotate: (random(8) - 0.5) * 20
      };

      buildWord(dw, wordConfig, chunkEl, line, profile, mainFontSize, fontWeight);
    }

    var rec = {
      el: chunkEl,
      guides: guides,
      startTime: chunkStartTime,
      endTime: chunkEndTime,
      profile: profile,
      config: config,
      guidePosition: guidePosition,
      activeColor: chunkActiveColor,
      status: 'waiting'
    };
    chunks.push(rec);
    applyGuideStatus(rec);
    /* 初值（animate 初始态 waiting，无动画直达；同词 initial="waiting" 语义） */
    mmSetInitial(chunkEl, PartitaChunkVariants.waiting({ config: config, guidePosition: guidePosition }), null);
  }

  /* PartitaWord（:372-486）落地 */
  function buildWord(word, config, parentEl, line, profile, mainFontSize, fontWeight) {
    var duration = partitaWordDisplayDuration(word, profile);
    var activeEndTime = partitaWordActiveEndTime(word, profile);
    var activeColor = partitaGetActiveColor(word.text, theme);
    var rippleScale = 1.5 + Math.random() * 2;   /* :386 useMemo 一次 */

    /* Word 根（:404-424 inline-block origin-center relative + fontSize/fontWeight/lineHeight 1.22/marginRight 0.8rem） */
    var wEl = partitaEl('div', 'pt-word');
    wEl.style.cssText = 'display:inline-block;transform-origin:center;position:relative;will-change:transform;white-space:nowrap;' +
      'font-size:' + mainFontSize + ';font-weight:' + fontWeight + ';line-height:1.22;margin-right:0.8rem;';

    /* Glow 层（:425-459 absolute inset-0，graphemeTimings 逐字/整词） */
    var glowWrap = partitaEl('span');
    glowWrap.style.cssText = 'position:absolute;inset:0;user-select:none;pointer-events:none;display:block;';
    var graphemeTimings = CM_buildWordGraphemeTimings(word);
    var glowEls = [];
    var glowHtml = '';
    if (graphemeTimings.length > 1) {
      for (var gi = 0; gi < graphemeTimings.length; gi++) {
        glowHtml += '<span class="pt-gc">' + partitaEsc(graphemeTimings[gi].char) + '</span>';
      }
    } else {
      glowHtml += '<span class="pt-gc">' + partitaEsc(word.text) + '</span>';
    }
    glowWrap.innerHTML = glowHtml;
    var gcEls = glowWrap.querySelectorAll('.pt-gc');
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

    /* Body 层（:461-468 relative z-10 block） */
    var bodyEl = partitaEl('span', 'pt-body');
    bodyEl.style.cssText = 'position:relative;z-index:10;display:block;';
    bodyEl.textContent = word.text;

    wEl.appendChild(glowWrap);
    wEl.appendChild(bodyEl);
    parentEl.appendChild(wEl);

    var baseColor = theme.primaryColor;
    var wRec = {
      el: wEl, glowEls: glowEls, bodyEl: bodyEl,
      word: word, profile: profile, config: config,
      baseColor: baseColor, activeColor: activeColor,
      duration: duration,
      activeEndTime: activeEndTime,
      isChorus: !!line.isChorus,
      status: 'waiting',
      rippleScale: rippleScale,
      layoutVariants: layoutVariants,
      rippleWrap: null, ripple: null
    };
    words.push(wRec);

    /* initial="waiting"（:415）直达 */
    var custom = { config: config, baseColor: baseColor, activeColor: activeColor, duration: duration, wordRevealMode: profile.wordRevealMode };
    mmSetInitial(wEl, layoutVariants, custom);
    mmSetInitial(bodyEl, PartitaBodyVariants, custom);
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
      mmSetInitial(gc.el, PartitaWordGlowVariants, gcustom);
    }
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
     字号走 partita 组件公式（:764-765），MineRadio 无 romanization → 单翻译轨） ---------- */
  function renderSubtitle(activeLine, recentCompletedLine, nextLines) {
    var shouldRender = showText && !hideTranslationSubtitle;
    var translation = null;
    if (shouldRender) {
      var candidates = [activeLine, recentCompletedLine];
      for (var i = 0; i < candidates.length; i++) {
        var line = candidates[i];
        var text = line && line.translation ? String(line.translation) : '';
        if (text && partitaHasReadableText(text)) { translation = text; break; }
      }
    }
    var upcoming = [];
    if (shouldRender && !translation && activeLine) {
      upcoming = (nextLines || []).filter(function (l) { return partitaHasReadableText(l.fullText); });
    }

    var key = translation ? 't:' + translation : (upcoming.length ? 'u:' + upcoming.map(function (l) { return l.startTime; }).join('|') : null);
    if (key === subtitleKey) return;

    /* 容器 AnimatePresence（:133-146）：显隐 opacity/y 0.24s easeOut */
    if (!key) {
      subtitleKey = null;
      mmApplyVariant(sub, {
        exit: { opacity: 0, y: 20, transition: { duration: 0.24, ease: 'easeOut' } }
      }, 'exit', null);
      return;
    }
    subtitleKey = key;
    sub.innerHTML = '';
    var content = partitaEl('div');
    content.style.cssText = 'position:relative;isolation:isolate;display:inline-block;padding:2px 6px;';

    if (translation) {
      var glowBg = partitaEl('div');
      glowBg.setAttribute('aria-hidden', 'true');
      glowBg.style.cssText = 'position:absolute;left:-40px;right:-40px;top:-24px;bottom:-24px;z-index:0;filter:blur(24px);transform:translateZ(0);' +
        'background:radial-gradient(ellipse 115% 130% at center, ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.96) + ' 0%, ' +
        CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.78) + ' 62%, transparent 100%);';
      content.appendChild(glowBg);
      var transEl = partitaEl('div');
      transEl.style.cssText = 'position:relative;z-index:10;max-width:56rem;margin:0 auto;color:' + (theme.secondaryColor || theme.primaryColor) +
        ';font-size:' + partitaTranslationFontSize(lyricsFontScale) +
        ';font-weight:' + CM_resolveThemeFontWeight(theme, 500) +
        ';text-shadow:0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.24) + ';';
      transEl.textContent = translation;
      content.appendChild(transEl);
    } else {
      var upWrap = partitaEl('div');
      upWrap.style.cssText = 'position:relative;z-index:10;display:flex;flex-direction:column;gap:8px;align-items:center;';
      for (var u = 0; u < upcoming.length; u++) {
        var p = partitaEl('p');
        p.style.cssText = 'margin:0;max-width:42rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:all .5s ease;filter:blur(1px);' +
          'color:' + (theme.secondaryColor || theme.primaryColor) + ';font-size:' + partitaUpcomingFontSize(lyricsFontScale) +
          ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) +
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

  /* ---------- 主循环（App 时钟等价：每帧轮询 MV + 行管理 + 预热） ---------- */
  function tick() {
    if (destroyed) return;
    var now = currentTime.get();
    if (now !== lastTime) {
      lastTime = now;
      currentTime.emit(now);   /* useMotionValueEvent(currentTime,'change') 等价 */
    }

    /* 预热（useMotionValueEvent :748-759：upcomingLine 进入 0.18~1.2s 窗口提前建布局） */
    var upcomingForPreheat = partitaGetUpcomingLine(lines, lastIdx, now);
    if (upcomingForPreheat && partitaShouldPreheatLine(upcomingForPreheat, now, PARTITA_PREHEAT_WINDOW)) {
      partitaGetOrBuildLayout(layoutCache, upcomingForPreheat, theme, windowHeight, tuning);
    }

    var idx = partitaFindLineIndexAtTime(lines, now);
    lastIdx = idx;
    var activeLine = idx >= 0 ? lines[idx] : null;
    var key = activeLine ? String(activeLine.startTime) : null;

    idle.style.opacity = activeLine ? '0' : '1';

    if (key !== currentLineKey) {
      currentLineKey = key;
      if (activeLine) {
        activeProfile = partitaResolveLineRenderProfile(activeLine);
        activeLayout = partitaGetOrBuildLayout(layoutCache, activeLine, theme, windowHeight, tuning);
        var densityScale = activeLayout.totalGraphemes > 40 ? 0.8 : 1;   /* :761 */
        exitLine();
        renderLine(activeLine, activeLayout, partitaMainFontSize(densityScale, lyricsFontScale));
        /* 切行帧即按当前时间推进一次三态（新行不停在 waiting） */
        for (var wi = 0; wi < words.length; wi++) evaluateWordStatus(words[wi], now);
        for (var cj = 0; cj < chunks.length; cj++) evaluateChunkStatus(chunks[cj], now);
      } else {
        exitLine();
        words = [];
        chunks = [];
        activeProfile = null;
        activeLayout = PARTITA_EMPTY_LAYOUT;
      }
      /* recentCompletedLine（runtime.ts:35）+ 下一句预览 */
      var recent = partitaGetRecentCompletedLine(lines, idx, now, CM_getLineRenderEndTime);
      renderSubtitle(activeLine, recent, partitaGetUpcomingLines(lines, idx, 2));
    }

    rafId = requestAnimationFrame(tick);
  }
  var lastIdx = -1;

  function onResize() {
    if (destroyed) return;
    var h = (typeof window !== 'undefined' && window.innerHeight) || 800;
    if (h !== windowHeight) {
      /* 窗口高度变化 → 布局 memo 依赖 windowHeight（:735-741），强制重建当前行 */
      windowHeight = h;
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
      chunks = [];
      activeLineEl = null;
    },
    setLines: function (next) { lines = next || []; currentLineKey = null; },
    setTheme: function (next) {
      theme = next;
      layoutVariants = partitaMakeLayoutVariants(theme);
      float = partitaLyricContainerFloat(theme);
      mmApplyVariant(main, { floating: float }, 'floating', null);
      shell.style.fontFamily = CM_resolveThemeFontStack(theme);
      shell.style.fontWeight = CM_resolveThemeFontWeight(theme, 400);
      idle.style.color = theme.secondaryColor || theme.primaryColor;
      currentLineKey = null;
      subtitleKey = null;
    },
    setFontScale: function (n) {
      lyricsFontScale = n != null ? n : 1;
      currentLineKey = null;
    },
    setTuning: function (t) {
      tuning = partitaResolveTuning(t);
      currentLineKey = null;
    }
  };
}

/* ---------- 测试/诊断注出（引擎内部纯函数，供 tests/partita.test.js 数值断言） ---------- */
env.PartitaCore = {
  DEFAULT_TUNING: PARTITA_DEFAULT_TUNING,
  PREHEAT_WINDOW: PARTITA_PREHEAT_WINDOW,
  LAYOUT_CACHE_LIMIT: PARTITA_LAYOUT_CACHE_LIMIT,
  resolveTuning: partitaResolveTuning,
  splitGraphemes: partitaSplitGraphemes,
  wordActiveEndTime: partitaWordActiveEndTime,
  wordDisplayDuration: partitaWordDisplayDuration,
  lineRenderProfile: partitaResolveLineRenderProfile,
  lineContainerMotion: partitaLineContainerMotion,
  buildSequentialColumns: partitaBuildSequentialColumns,
  buildLayoutCacheKey: partitaBuildLayoutCacheKey,
  makeLayoutVariants: partitaMakeLayoutVariants,
  lyricContainerFloat: partitaLyricContainerFloat,
  mainFontSize: partitaMainFontSize,
  translationFontSize: partitaTranslationFontSize,
  upcomingFontSize: partitaUpcomingFontSize,
  glowVariants: PartitaWordGlowVariants,
  bodyVariants: PartitaBodyVariants,
  chunkVariants: PartitaChunkVariants,
  shouldPreheatLine: partitaShouldPreheatLine,
  findLineIndexAtTime: partitaFindLineIndexAtTime
};
