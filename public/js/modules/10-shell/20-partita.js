/* =========================================================================
   OrangeSea · 云阶（Partita · 竖列错落歌词）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors —
   adapted from folia-major (AGPL-3.0):
     src/components/visualizer/partita/VisualizerPartita.tsx（布局/变体/预热）
     src/utils/lyrics/cjkSemanticLayout.ts（语义分块 + 标点粘滞，纯函数逐段移植）
     src/utils/lyrics/renderHints.ts（行过渡/词揭示时序）
     src/components/visualizer/runtime.ts（预热窗口）
   宿主替换：React 生命周期 → IIFE 全局 + applyPartitaMode(on,{save}) 显式进出；
   framer-motion MotionValue → motionSignalGet('currentTime'/'bands')；
   useEffect rAF → 自有 30fps rAF 循环；variants 弹簧动画 → CSS 独立变换属性
   transition/animation（spring(200,20) 以近似贝塞尔实现）。

   形态（照 09-aurora-flow.js 范式）：body.partita 全屏覆盖 + DOM 歌词 +
   音频特征自算回退 + eco 质量档由 91-overlay-transition 统一管理 + 互斥经视觉模式注册表。

   分层：L0 日落夜空渐变（CSS）/ L0.5 暖色地平线辉光（--pt-energy 驱动）/
         L1 暗角 / L2 歌词（列/块错落 + 词阶 stagger + 逐字流光）。
   布局算法忠实还原：layoutUnits（CJK 语义 + 标点粘滞）→ 按窗口高度 65% 切
   不均匀 chunk（种子随机）→ 单列竖排 → 词级随机散布 → 词态三态机
   waiting/active/passed。
   每帧零分配纪律：状态机只做数值比较与 class 翻转；逐帧写入仅
   --pt-energy 量化档位变化时一次 setProperty；全部缓动交给 CSS。
   ========================================================================= */

var PARTITA_STORE_KEY = 'orangesea-partita-v1';
var partitaMode = readBooleanPreference(PARTITA_STORE_KEY, false);
var partitaRafId = 0;
/* Folia DEFAULT_PARTITA_TUNING（types.ts）——本项目无 tuning 面板，取默认值固定 */
var partitaTuning = { showGuideLines: true, useSemanticLayout: true, staggerMin: 20, staggerMax: 100 };
/* Folia PARTITA_PREHEAT_WINDOW（VisualizerPartita.tsx） */
var PARTITA_PREHEAT_WINDOW = { minLead: 0.18, maxLead: 1.2 };
var PARTITA_LAYOUT_CACHE_LIMIT = 48;

/* 主题映射：Folia Theme（normal 强度）→ 本项目日落暖色（--home-accent/#ff9c6e 系） */
var PARTITA_ACCENT = '#ff9c6e';
var PARTITA_BASE_COLOR = '#e3d5c2';

/* 主题跟随（Folia: 词激活色 = theme.accentColor、静息色 = theme.primaryColor） */
var partitaLastThemeKey = '';
function partitaSyncTheme() {
  if (typeof themeOverlayDarkTheme !== 'function') return;
  var t = null;
  try { t = themeOverlayDarkTheme(); } catch (e) { return; }
  if (!t) return;
  var key = (t.primaryColor || '') + '|' + (t.accentColor || '');
  if (key === partitaLastThemeKey) return;
  partitaLastThemeKey = key;
  if (t.accentColor) PARTITA_ACCENT = t.accentColor;
  if (t.primaryColor) PARTITA_BASE_COLOR = t.primaryColor;
  var overlay = document.getElementById('partita-overlay');
  if (overlay) {
    overlay.style.setProperty('--pt-accent', PARTITA_ACCENT);
    overlay.style.setProperty('--pt-base', PARTITA_BASE_COLOR);
  }
}

/* spring(stiffness 200, damping 20) 的近似贝塞尔（阻尼比≈0.707，轻度过冲） */
var PARTITA_SPRING_BEZ = '.55s cubic-bezier(.3, 1.32, .42, 1)';

/* 渲染态 */
var partitaLayoutCache = null;      /* Map: key → { rows, totalGraphemes, profile, mode } */
var partitaWindowHeight = 800;
var partitaLastLineIdx = -99;
var partitaLastTime = -1;
var partitaLineEl = null;
var partitaLineMode = 'normal';
var partitaLineProfile = null;
var partitaChunkRecs = [];          /* 当前行 chunk 三态记录 */
var partitaWordRecs = [];           /* 当前行 word 三态记录 */
var partitaLyricsObserverToken = 0;
var partitaResizeTimer = 0;
var partitaLastFontKey = null;

/* 音频特征（motionSignalGet('bands') 优先，frequencyData 自算回退） */
var partitaEnergy = 0;
var partitaChorus = 0;
var partitaLastEnergyQ = -1;

/* =========================================================
   一、纯文本布局层（cjkSemanticLayout.ts 移植，不改写原始词时序）
   ========================================================= */

var PARTITA_CJK_RE = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/;
var PARTITA_WHITESPACE_RE = /^\s+$/;
var PARTITA_APOSTROPHE_ONLY_RE = /^['’]\s*$/;
var PARTITA_CONTRACTION_SUFFIX_RE = /^(s|t|m|d|ll|re|ve|em)\s*$/i;
var PARTITA_DIRECT_CONTRACTION_RE = /^['’](s|t|m|d|ll|re|ve|em)\s*$/i;
var PARTITA_TRAILING_APOSTROPHE_RE = /['’]\s*$/;
var PARTITA_TRAILING_WORD_CHAR_RE = /[\p{L}\p{N}]$/u;
var PARTITA_INLINE_CONTRACTION_RE = /[\p{L}\p{N}]+['’](s|t|m|d|ll|re|ve|em)/iu;
var PARTITA_STICKY_TRAILING_PUNCT_RE = /^[,.;:!?，。！？、：；）】》」』〉〕］)}\]"'’”’]+$/u;

var partitaGraphemeSegmenter = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
var partitaWordSeg = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;

function partitaIsCJK(text) { return PARTITA_CJK_RE.test(text); }

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

/* 一个词在词跨度内均分字时序（graphemeTiming.ts buildEvenGraphemeTimings 移植，
   本项目词无 syllables，恒走均分路径） */
function partitaEvenGraphemeTimings(text, startTime, endTime) {
  var graphemes = partitaSplitGraphemes(text);
  if (!graphemes.length) return [];
  var duration = Math.max(endTime - startTime, 0);
  var unit = duration / graphemes.length;
  var timings = [];
  for (var i = 0; i < graphemes.length; i++) {
    timings.push({
      char: graphemes[i],
      startTime: startTime + unit * i,
      endTime: i === graphemes.length - 1 ? endTime : startTime + unit * (i + 1)
    });
  }
  return timings;
}

/* 词级语义分词段（wordSegmentation → Intl.Segmenter word 粒度；
   本项目无用户保存分词，Folia 的 override 分支不适用） */
function partitaGetWordSegments(text) {
  if (!partitaWordSeg || !text) return null;
  var segments = [];
  var it = partitaWordSeg.segment(text)[Symbol.iterator]();
  for (var s = it.next(); !s.done; s = it.next()) {
    segments.push({ segment: s.value.segment, isWordLike: s.value.isWordLike });
  }
  return segments.length > 0 ? segments : null;
}

function partitaSingleWordUnits(words) {
  var units = [];
  for (var i = 0; i < words.length; i++) {
    units.push({
      text: words[i].text,
      words: [words[i]],
      startTime: words[i].startTime,
      endTime: words[i].endTime,
      isSemantic: false
    });
  }
  return units;
}

/* mapSegmentsToWords 移植：把分词段对齐回原始计时词，任何对不上的地方
   整体回退单词 unit（不猜） */
function partitaMapSegmentsToWords(segments, words) {
  var units = [];
  var wordIndex = 0;
  for (var si = 0; si < segments.length; si++) {
    var segmentText = segments[si].segment;
    if (!segmentText || PARTITA_WHITESPACE_RE.test(segmentText)) continue;
    var startWordIndex = wordIndex;
    var collectedText = '';
    while (wordIndex < words.length && collectedText.length < segmentText.length) {
      collectedText += words[wordIndex].text;
      wordIndex += 1;
      if (segmentText.indexOf(collectedText) !== 0) return null;
    }
    if (collectedText !== segmentText) return null;
    var segmentWords = words.slice(startWordIndex, wordIndex);
    var firstWord = segmentWords[0];
    var lastWord = segmentWords[segmentWords.length - 1];
    if (!firstWord || !lastWord) return null;
    if (!segments[si].isWordLike && units.length > 0) {
      var prev = units[units.length - 1];
      prev.text += segmentText;
      for (var w = 0; w < segmentWords.length; w++) prev.words.push(segmentWords[w]);
      prev.endTime = lastWord.endTime;
      continue;
    }
    units.push({
      text: segmentText,
      words: segmentWords,
      startTime: firstWord.startTime,
      endTime: lastWord.endTime,
      isSemantic: !!(segments[si].isWordLike && partitaIsCJK(segmentText) && segmentWords.length > 1)
    });
  }
  if (wordIndex !== words.length || units.length === 0) return null;
  return units;
}

/* buildCjkSemanticLayoutUnits 移植：CJK 才值得段器加分（无空格文字） */
function partitaCjkSemanticUnits(fullText, words) {
  if (!words.length) return [];
  var fallback = partitaSingleWordUnits(words);
  if (!partitaIsCJK(fullText)) return fallback;
  var segments = partitaGetWordSegments(fullText);
  if (!segments) return fallback;
  var mapped = partitaMapSegmentsToWords(segments, words);
  return mapped || fallback;
}

/* applyStickyPunctuationLayoutUnits 移植：标点/缩写向前粘滞，
   防 It | ’ | s 被拆进不同视觉行 */
function partitaCloneUnit(unit) {
  return {
    text: unit.text,
    words: unit.words.slice(),
    startTime: unit.startTime,
    endTime: unit.endTime,
    isSemantic: unit.isSemantic
  };
}

function partitaAppendSticky(target, unit) {
  target.text += unit.text;
  for (var i = 0; i < unit.words.length; i++) target.words.push(unit.words[i]);
  target.endTime = unit.endTime;
  target.isSticky = true;
}

function partitaIsStickyTrailingPunct(text) { return PARTITA_STICKY_TRAILING_PUNCT_RE.test(text.trim()); }

function partitaHasAttachedTrailingPunct(unit) {
  if (unit.words.length <= 1) return false;
  return partitaIsStickyTrailingPunct(unit.words[unit.words.length - 1].text);
}

function partitaHasInlineContraction(unit) {
  return unit.words.length > 1 && !unit.isSemantic && PARTITA_INLINE_CONTRACTION_RE.test(unit.text);
}

function partitaApplyStickyUnits(units) {
  var merged = [];
  for (var index = 0; index < units.length; index += 1) {
    var current = units[index];
    var previous = merged[merged.length - 1];
    if (!previous) {
      merged.push(partitaCloneUnit(current));
      continue;
    }
    var next = units[index + 1];
    if (PARTITA_APOSTROPHE_ONLY_RE.test(current.text.trim())
      && next
      && PARTITA_TRAILING_WORD_CHAR_RE.test(previous.text.trimEnd())
      && PARTITA_CONTRACTION_SUFFIX_RE.test(next.text.trim())) {
      partitaAppendSticky(previous, current);
      partitaAppendSticky(previous, next);
      index += 1;
      continue;
    }
    if (PARTITA_DIRECT_CONTRACTION_RE.test(current.text.trim())
      && PARTITA_TRAILING_WORD_CHAR_RE.test(previous.text.trimEnd())) {
      partitaAppendSticky(previous, current);
      continue;
    }
    if (PARTITA_CONTRACTION_SUFFIX_RE.test(current.text.trim())
      && PARTITA_TRAILING_APOSTROPHE_RE.test(previous.text.trimEnd())) {
      partitaAppendSticky(previous, current);
      continue;
    }
    if (partitaIsStickyTrailingPunct(current.text)
      && PARTITA_TRAILING_WORD_CHAR_RE.test(previous.text.trimEnd())) {
      partitaAppendSticky(previous, current);
      continue;
    }
    merged.push(partitaCloneUnit(current));
  }
  for (var m = 0; m < merged.length; m++) {
    if (partitaHasAttachedTrailingPunct(merged[m]) || partitaHasInlineContraction(merged[m])) {
      merged[m].isSticky = true;
    }
  }
  return merged;
}

/* buildPostLyricLayoutUnits 移植（Partita 恒传 semantic:tuning, sticky:true） */
function partitaBuildLayoutUnits(fullText, words, semantic) {
  var raw = semantic ? partitaCjkSemanticUnits(fullText, words) : partitaSingleWordUnits(words);
  return partitaApplyStickyUnits(raw);
}

/* buildDisplayWordsFromLayoutUnits 移植：粘滞非语义 unit 合成一个显示词，
   CJK 语义 unit 保留原始词（逐字时序仍可用） */
function partitaBuildDisplayWords(units) {
  var out = [];
  for (var i = 0; i < units.length; i++) {
    var u = units[i];
    if (!u.isSticky || u.isSemantic) {
      for (var w = 0; w < u.words.length; w++) out.push(u.words[w]);
    } else {
      out.push({ text: u.text, startTime: u.startTime, endTime: u.endTime });
    }
  }
  return out;
}

/* =========================================================
   二、renderHints.ts 移植（行过渡/词揭示时序，纯函数）
   ========================================================= */

var PARTITA_MICRO_LINE = 0.10;
var PARTITA_SHORT_LINE = 0.18;
var PARTITA_MICRO_RENDER_FLOOR = 0.067;

function partitaClamp(v, min, max) { return Math.min(Math.max(v, min), max); }

function partitaGetTransitionTiming(rawDuration, lineTransitionMode, wordRevealMode) {
  if (lineTransitionMode === 'none') {
    return { enterDuration: 0, exitDuration: 0, linePassHold: 0 };
  }
  if (lineTransitionMode === 'fast') {
    return {
      enterDuration: partitaClamp(rawDuration * 0.45, 0.045, 0.06),
      exitDuration: partitaClamp(rawDuration * 0.22, 0.03, 0.04),
      linePassHold: wordRevealMode === 'instant' ? 0 : 0.03
    };
  }
  return {
    enterDuration: Math.min(0.42, Math.max(0.22, Math.max(rawDuration, 0.12) * 0.34)),
    exitDuration: Math.min(0.32, Math.max(0.18, Math.max(rawDuration, 0.12) * 0.18)),
    linePassHold: wordRevealMode === 'instant' ? 0 : 0.06
  };
}

function partitaRenderProfile(startTime, endTime, lastWordEndTime) {
  var rawDuration = Math.max(endTime - startTime, 0);
  var timingClass = rawDuration < PARTITA_MICRO_LINE ? 'micro'
    : rawDuration < PARTITA_SHORT_LINE ? 'short' : 'normal';
  var lineTransitionMode = timingClass === 'micro' ? 'none' : timingClass === 'short' ? 'fast' : 'normal';
  var wordRevealMode = timingClass === 'micro' ? 'instant' : timingClass === 'short' ? 'fast' : 'normal';

  var lineRenderEndTime;
  if (lineTransitionMode === 'none') {
    lineRenderEndTime = Math.max(endTime, startTime + PARTITA_MICRO_RENDER_FLOOR);
  } else {
    var tt = partitaGetTransitionTiming(rawDuration, lineTransitionMode, wordRevealMode);
    var linePassStart = Math.max(lastWordEndTime, startTime) + tt.linePassHold;
    var exitStart = lineTransitionMode === 'fast'
      ? Math.max(startTime + tt.enterDuration + 0.01, linePassStart, endTime - tt.exitDuration)
      : Math.max(linePassStart, endTime - tt.exitDuration);
    lineRenderEndTime = Math.max(endTime, exitStart + tt.exitDuration);
  }

  return {
    lineRenderEndTime: lineRenderEndTime,
    lineTransitionMode: lineTransitionMode,
    wordRevealMode: wordRevealMode,
    wordLookahead: wordRevealMode === 'instant' ? 0.03 : wordRevealMode === 'fast' ? 0.08 : 0.15
  };
}

/* getPartitaWordActiveEndTime / getPartitaWordDisplayDuration 移植 */
function partitaWordActiveEnd(word, profile) {
  if (profile.wordRevealMode === 'instant') return profile.lineRenderEndTime;
  if (profile.wordRevealMode === 'fast') {
    return Math.min(profile.lineRenderEndTime, Math.max(word.endTime, word.startTime + 0.12));
  }
  return word.endTime;
}

function partitaWordDisplayDuration(word, profile) {
  var activeEnd = partitaWordActiveEnd(word, profile);
  var minDuration = profile.wordRevealMode === 'instant' ? 0.08
    : profile.wordRevealMode === 'fast' ? 0.12 : 0.1;
  return Math.max(activeEnd - word.startTime, minDuration);
}

/* =========================================================
   三、词时序来源（YRC 真实时序 / LRC 合成）
   ========================================================= */

function partitaBuildTimedWords(line) {
  var src = line && line.words && line.words.length ? line.words : null;
  var out = [];
  if (src) {
    for (var i = 0; i < src.length; i++) {
      var w = src[i];
      if (!w || !w.text) continue;
      out.push({ text: w.text, startTime: w.t, endTime: w.t + Math.max(0.06, w.d || 0) });
    }
    if (out.length) return out;
  }
  /* LRC 无逐词时序：复用涂鸦墙分词，行时长前 70% 均分合成（与
     computeGraffitiReveals 的 LRC 路径同思路），标点并入前一单元 */
  var text = (line && line.text) || '';
  var tokens = (typeof tokenizeGraffitiText === 'function') ? tokenizeGraffitiText(text) : [];
  var unitTexts = [];
  for (var ti = 0; ti < tokens.length; ti++) {
    var tk = tokens[ti];
    if (!tk || !tk.chars || !tk.chars.length) continue;
    if (tk.type === 'space') continue;
    var joined = '';
    for (var ci = 0; ci < tk.chars.length; ci++) joined += tk.chars[ci].c;
    if (tk.type === 'punct' && unitTexts.length) unitTexts[unitTexts.length - 1] += joined;
    else unitTexts.push(joined);
  }
  if (!unitTexts.length) return out;
  var dur = line && line.duration ? Math.min(line.duration, 6) : 2.4;
  var span = dur * 0.7;
  var start = line ? line.t : 0;
  var per = Math.max(0.12, span / unitTexts.length);
  for (var u = 0; u < unitTexts.length; u++) {
    var st = start + (unitTexts.length > 1 ? (u / unitTexts.length) * span : 0);
    out.push({ text: unitTexts[u], startTime: st, endTime: st + per });
  }
  return out;
}

/* =========================================================
   四、Sequential 布局（buildSequentialColumns 移植）
   ========================================================= */

/* 确定性种子随机（Folia：sin(seed++)*10000 取小数），同一行每次布局一致 */
function partitaMakeRandom(seed) {
  var s = seed;
  return function () {
    var x = Math.sin(s++) * 10000;
    return x - Math.floor(x);
  };
}

function partitaBuildLayout(line, words, windowHeight, tuning) {
  var fullText = line.text || '';
  var totalGraphemes = Math.max(
    partitaSplitGraphemes(fullText.replace(/\s+/g, '')).length,
    words.length, 1);

  var layoutUnits = partitaBuildLayoutUnits(fullText, words, tuning.useSemanticLayout);

  /* 行数由可用高度决定（65% 窗高 / 100px 基准行高） */
  var baseRowHeight = 100;
  var availableHeight = windowHeight * 0.65;
  var targetRowCount = Math.max(1, Math.floor(availableHeight / baseRowHeight));
  var actualRowCount = Math.min(layoutUnits.length, targetRowCount);

  var random = partitaMakeRandom(line.t);

  /* 不均匀切 chunk：完全平均太机械，失去手写谱错落感（Folia 原注释） */
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
      var randVal = random();
      chunkLength = Math.max(1, Math.min(max, Math.round(avg + (randVal - 0.5) * avg)));
    }
    chunkLength = Math.max(1, Math.min(chunkLength, remainingUnits - (remainingChunks - 1)));
    chunks.push(layoutUnits.slice(unitIndex, unitIndex + chunkLength));
    unitIndex += chunkLength;
    remainingUnits -= chunkLength;
    remainingChunks--;
  }

  /* 本项目动画强度恒为 Folia 的 normal 档（calm/chaotic 是 Folia 主题选项） */
  var rows = [];
  for (var r = 0; r < chunks.length; r++) {
    var chunkUnits = chunks[r];
    var chunkWords = [];
    for (var cu = 0; cu < chunkUnits.length; cu++) {
      var unitWords = chunkUnits[cu].words;
      for (var uw = 0; uw < unitWords.length; uw++) chunkWords.push(unitWords[uw]);
    }
    if (!chunkWords.length) continue;
    var displayWords = partitaBuildDisplayWords(chunkUnits);

    var mergedText = '';
    for (var mw = 0; mw < chunkWords.length; mw++) mergedText += chunkWords[mw].text.trim();
    var graphemeCount = partitaSplitGraphemes(mergedText.replace(/\s+/g, '')).length;
    var rowIndex = rows.length;
    var rowBias = rowIndex - (actualRowCount - 1) / 2;
    var isStaggeredLeft = rowIndex % 2 === 0;

    /* stagger 是云阶的核心：块位置错落有致但仍读作一行 */
    var staggerMagnitude = tuning.staggerMin + random() * Math.max(tuning.staggerMax - tuning.staggerMin, 0);
    var staggerX = isStaggeredLeft ? -staggerMagnitude : staggerMagnitude;
    var staggerScale = 0.8 + random() * 0.9;

    rows.push({
      rowIndex: rowIndex,
      chunkWords: chunkWords,
      displayWords: displayWords,
      config: {
        id: rowIndex + '-' + chunkWords[0].startTime,
        x: staggerX,
        y: rowBias * 2.5,
        rotate: 0,
        scale: staggerScale,
        marginBottom: '0.6rem',
        passedRotate: (rowIndex % 2 === 0 ? 1 : -1) * 3
      }
    });
  }

  var lastWordEnd = words.length ? words[words.length - 1].endTime : (line.t + (line.duration || 0));
  var profile = partitaRenderProfile(line.t, line.t + (line.duration || 0), lastWordEnd);

  return { rows: rows, totalGraphemes: totalGraphemes, profile: profile };
}

/* 布局缓存（LRU 48）+ 预热：重建列结构每帧做毫无意义且昂贵（Folia 原注释） */
function partitaEnsureLayoutCache() {
  if (!partitaLayoutCache) partitaLayoutCache = new Map();
  return partitaLayoutCache;
}

function partitaLayoutCacheKey(line) {
  var heightBucket = Math.round(partitaWindowHeight / 24);
  return 'partita-v1|' + (line.t || 0) + '|' + (line.text || '') + '|' + heightBucket;
}

function partitaGetOrBuildLayout(line) {
  var cache = partitaEnsureLayoutCache();
  var key = partitaLayoutCacheKey(line);
  var cached = cache.get(key);
  if (cached) return cached;
  var layout = partitaBuildLayout(line, partitaBuildTimedWords(line), partitaWindowHeight, partitaTuning);
  cache.set(key, layout);
  if (cache.size > PARTITA_LAYOUT_CACHE_LIMIT) {
    var oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  return layout;
}

/* =========================================================
   五、DOM 渲染（PartitaWord / PartitaChunk / 行容器的宿主化）
   ========================================================= */

function partitaEscapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* layoutVariants 移植：三态位姿（waiting 含 sin/cos 抛掷偏移） */
function partitaApplyWordPose(el, pose, status) {
  if (status === 'active') {
    el.style.opacity = '1';
    el.style.translate = pose.x + 'px ' + pose.y + 'px';
    el.style.rotate = pose.rotate + 'deg';
    el.style.scale = String(pose.scale * 1.4);
  } else if (status === 'passed') {
    el.style.opacity = '0.82';
    el.style.translate = pose.x + 'px ' + pose.y + 'px';
    el.style.rotate = (pose.rotate + pose.passedRotate) + 'deg';
    el.style.scale = String(pose.scale);
  } else {
    el.style.opacity = '0';
    el.style.translate = (pose.x + Math.sin(pose.y) * 100) + 'px ' + (pose.y + Math.cos(pose.x) * 50) + 'px';
    el.style.rotate = (pose.rotate + 20) + 'deg';
    el.style.scale = '0.5';
  }
}

function partitaApplyChunkPose(el, config, side, status) {
  if (status === 'waiting') {
    el.style.opacity = '0';
    el.style.translate = (config.x + (side === 'left' ? -40 : 40)) + 'px ' + config.y + 'px';
    el.style.rotate = config.rotate + 'deg';
    el.style.scale = '0.85';
  } else {
    el.style.opacity = '1';
    el.style.translate = config.x + 'px ' + config.y + 'px';
    el.style.rotate = config.rotate + 'deg';
    el.style.scale = '1';
  }
}

/* wordGlowVariants 移植为 CSS 动画：
   normal 多字 → 逐字扫光（per-char duration=charDur*6, delay=charDelay）；
   normal 单字 → 整词持亮 [0,1,1]@times[0,.9,1]；
   fast/instant → 整词 [0,1,0] 快闪（时长钳制）。radII 经行级 rv-* 类切换。 */
function partitaBuildGlowSpan(word, displayDuration, profile) {
  var glow = document.createElement('span');
  glow.className = 'pt-glow';
  glow.setAttribute('aria-hidden', 'true');
  var chars = [];
  if (profile.wordRevealMode === 'normal') {
    /* buildWordGraphemeTimings(word)：无 syllables → 词跨度内均分（buildEvenGraphemeTimings） */
    var timings = partitaEvenGraphemeTimings(word.text, word.startTime, word.endTime);
    if (timings.length > 1) {
      for (var i = 0; i < timings.length; i++) {
        var g = document.createElement('span');
        g.className = 'pt-glow-char';
        g.textContent = timings[i].char;
        var charDur = Math.max(timings[i].endTime - timings[i].startTime, 0.001);
        g.style.setProperty('--pt-gd', (charDur * 6).toFixed(3) + 's');
        g.style.setProperty('--pt-gdl', Math.max(0, timings[i].startTime - word.startTime).toFixed(3) + 's');
        glow.appendChild(g);
        chars.push(g);
      }
      return { el: glow, chars: chars };
    }
  }
  var single = document.createElement('span');
  single.className = 'pt-glow-char hold';
  single.textContent = word.text;
  var dur;
  if (profile.wordRevealMode === 'instant') dur = Math.min(displayDuration || 0.08, 0.12);
  else if (profile.wordRevealMode === 'fast') dur = Math.min(Math.max(displayDuration || 0.12, 0.12), 0.2);
  else dur = displayDuration || 0.1;
  single.style.setProperty('--pt-gd', dur.toFixed(3) + 's');
  single.style.setProperty('--pt-gdl', '0s');
  glow.appendChild(single);
  chars.push(single);
  return { el: glow, chars: chars };
}

function partitaSetWordStatus(rec, status) {
  rec.state = status;
  var el = rec.el;
  el.classList.toggle('is-active', status === 'active');
  el.classList.toggle('is-passed', status === 'passed');
  if (status === 'active') {
    /* spring(200,20)：位移/旋转/缩放弹性入场，透明度 0.1s 快速跟上 */
    el.style.transition = 'opacity .1s linear, translate ' + PARTITA_SPRING_BEZ +
      ', rotate ' + PARTITA_SPRING_BEZ + ', scale ' + PARTITA_SPRING_BEZ;
    /* 逐字流光：进入 active 才挂 on（动画从翻转时刻起算，--pt-gdl 为字内延迟） */
    for (var g = 0; g < rec.glowChars.length; g++) rec.glowChars[g].classList.add('on');
    /* 副歌涟漪：Folia isChorus 行内词触发（isChorus 由歌词打标管线提供）；
       无打标数据时以能量慢积分闸门（partitaChorus > 0.5）回退近似 */
    var isChorusRow = rec.lineIsChorus || partitaChorus > 0.5;
    if (isChorusRow) {
      el.classList.add('is-rip');
      var ripEl = el;
      setTimeout(function () { ripEl.classList.remove('is-rip'); }, 560);
    }
  } else if (status === 'passed') {
    /* passed：位姿 0.5s 回落，但 rotate 以 5s 线性慢拧（余韵） */
    el.style.transition = 'opacity .5s ease-out, translate .5s ease-out, scale .5s ease-out, rotate 5s linear';
  } else {
    el.style.transition = 'opacity .4s ease-out, translate .4s ease-out, rotate .4s ease-out, scale .4s ease-out';
  }
  partitaApplyWordPose(el, rec.pose, status);
}

function partitaSetChunkStatus(rec, status) {
  rec.state = status;
  var el = rec.el;
  el.classList.toggle('is-waiting', status === 'waiting');
  el.classList.toggle('is-active', status === 'active');
  el.classList.toggle('is-passed', status === 'passed');
  if (status === 'waiting') {
    el.style.transition = 'opacity .4s ease-out, translate .4s ease-out, rotate .4s ease-out, scale .4s ease-out';
  } else {
    el.style.transition = 'opacity .1s linear, translate ' + PARTITA_SPRING_BEZ +
      ', rotate ' + PARTITA_SPRING_BEZ + ', scale ' + PARTITA_SPRING_BEZ;
  }
  partitaApplyChunkPose(el, rec.config, rec.side, status);
}

function partitaRemoveLineEl(lineEl) {
  if (lineEl && lineEl.parentNode) lineEl.parentNode.removeChild(lineEl);
}

/* 渲染一行：列 > 块（行）> 词（位姿/流光/涟漪），全部记录进三态表 */
function renderPartitaLine(line) {
  var floatEl = document.getElementById('partita-float');
  if (!floatEl) return;
  partitaDetachCurrentLine();

  var layout = partitaGetOrBuildLayout(line);
  var profile = layout.profile;
  partitaLineMode = profile.lineTransitionMode;
  partitaLineProfile = profile;

  var lineEl = document.createElement('div');
  lineEl.className = 'pt-line enter-' + profile.lineTransitionMode
    + (line.isChorus ? ' is-chorus' : '');   /* 副歌行：激活色增强 + 词涟漪（Folia isChorus） */
  if (profile.wordRevealMode === 'fast') lineEl.classList.add('rv-fast');
  else if (profile.wordRevealMode === 'instant') lineEl.classList.add('rv-inst');

  /* densityScale + clamp 主字号（Folia mainFontSize × lyricsFontScale；
     lyricsFontScale 等价本项目 fx.lyricScale 0.35~1.65，随「歌词大小」设置联动） */
  var density = layout.totalGraphemes > 40 ? 0.8 : 1;
  var fontScale = partitaClamp((typeof fx !== 'undefined' && fx && Number(fx.lyricScale)) || 1, 0.35, 1.65);
  lineEl.style.setProperty('--pt-fs',
    'clamp(' + (2.5 * density * fontScale).toFixed(3) + 'rem, ' + (5.5 * density * fontScale).toFixed(3) +
    'vw, ' + (4.5 * density * fontScale).toFixed(3) + 'rem)');

  var column = document.createElement('div');
  column.className = 'pt-column';
  var inner = document.createElement('div');
  inner.className = 'pt-column-inner';

  for (var r = 0; r < layout.rows.length; r++) {
    var row = layout.rows[r];
    var side = row.rowIndex % 2 === 0 ? 'left' : 'right';
    var chunkEl = document.createElement('div');
    chunkEl.className = 'pt-chunk';
    chunkEl.style.marginBottom = row.config.marginBottom;

    /* 引导线（showGuideLines）：竖/横两条 1px 短标，左右交替 */
    if (partitaTuning.showGuideLines) {
      var gv = document.createElement('span');
      gv.className = 'pt-guide pt-guide-v pt-guide-' + side;
      gv.setAttribute('aria-hidden', 'true');
      chunkEl.appendChild(gv);
      var gh = document.createElement('span');
      gh.className = 'pt-guide pt-guide-h pt-guide-' + side;
      gh.setAttribute('aria-hidden', 'true');
      chunkEl.appendChild(gh);
    }

    for (var wi = 0; wi < row.displayWords.length; wi++) {
      var dw = row.displayWords[wi];
      /* 词内随机散布（Folia PartitaChunk：wordSeed = displayWords[0].start + idx*7.13） */
      var wordSeed = row.displayWords[0].startTime + wi * 7.13;
      var pose = {
        x: 0, y: 0, rotate: 0, scale: row.config.scale, passedRotate: 0
      };
      var rx = Math.sin(wordSeed + 1) * 10000; pose.x = ((rx - Math.floor(rx)) - 0.5) * 12;
      var ry = Math.sin(wordSeed + 2) * 10000; pose.y = ((ry - Math.floor(ry)) - 0.5) * 12;
      var rr = Math.sin(wordSeed + 3) * 10000; pose.rotate = ((rr - Math.floor(rr)) - 0.5) * 6;
      var rp = Math.sin(wordSeed + 8) * 10000; pose.passedRotate = ((rp - Math.floor(rp)) - 0.5) * 20;

      var displayDuration = partitaWordDisplayDuration(dw, profile);
      var activeEnd = partitaWordActiveEnd(dw, profile);

      var wordEl = document.createElement('div');
      wordEl.className = 'pt-word';
      wordEl.style.setProperty('--pt-cdur', (displayDuration || 0.2).toFixed(3) + 's');
      /* 涟漪终末 scale = 1.5 + rand*2（Folia useMemo per word） */
      var rs = Math.sin(wordSeed + 4) * 10000;
      wordEl.style.setProperty('--pt-rip', (1.5 + (rs - Math.floor(rs)) * 2).toFixed(3));

      var glow = partitaBuildGlowSpan(dw, displayDuration, profile);
      wordEl.appendChild(glow.el);

      var body = document.createElement('span');
      body.className = 'pt-body';
      body.textContent = dw.text;
      wordEl.appendChild(body);

      var ripple = document.createElement('span');
      ripple.className = 'pt-ripple';
      ripple.setAttribute('aria-hidden', 'true');
      wordEl.appendChild(ripple);

      /* 初始 waiting 位姿（无过渡）——下一帧状态机翻到真实状态，
         与 framer initial="waiting" animate={status} 语义一致 */
      wordEl.style.transition = 'none';
      partitaApplyWordPose(wordEl, pose, 'waiting');
      chunkEl.appendChild(wordEl);

      partitaWordRecs.push({
        el: wordEl,
        glowChars: glow.chars,
        startT: dw.startTime,
        endT: activeEnd,
        state: 'waiting',
        pose: pose,
        lineIsChorus: !!line.isChorus
      });
    }

    chunkEl.style.transition = 'none';
    partitaApplyChunkPose(chunkEl, row.config, side, 'waiting');
    inner.appendChild(chunkEl);

    var chunkStart = row.chunkWords[0].startTime;
    var chunkEnd = partitaWordActiveEnd(row.chunkWords[row.chunkWords.length - 1], profile);
    partitaChunkRecs.push({
      el: chunkEl,
      startT: chunkStart,
      endT: chunkEnd,
      state: 'waiting',
      config: row.config,
      side: side
    });
  }

  column.appendChild(inner);
  lineEl.appendChild(column);
  floatEl.appendChild(lineEl);
  partitaLineEl = lineEl;
}

/* 当前行退场：行容器 exit-* 动画后移除；记录表立即清空（时间已过期） */
function partitaDetachCurrentLine() {
  if (partitaLineEl) {
    var old = partitaLineEl;
    old.classList.remove('enter-' + partitaLineMode);
    old.classList.add('exit-' + partitaLineMode);
    setTimeout(function () { partitaRemoveLineEl(old); }, 380);
    partitaLineEl = null;
  }
  partitaChunkRecs = [];
  partitaWordRecs = [];
  partitaLineProfile = null;
}

function partitaSetEmpty(show) {
  var el = document.getElementById('partita-empty');
  if (el) el.classList.toggle('show', !!show);
}

/* =========================================================
   六、每帧 tick（30fps 节流内执行）
   ========================================================= */

function partitaBinAvg(from, to) {
  if (typeof frequencyData === 'undefined' || !frequencyData || !frequencyData.length) return 0;
  var sum = 0, n = 0;
  var hi = Math.min(to, frequencyData.length - 1);
  for (var i = from; i <= hi; i++) { sum += frequencyData[i]; n++; }
  return n ? (sum / n) / 255 : 0;
}

function partitaTickAudio(dt) {
  var bands = (typeof motionSignalGet === 'function') ? motionSignalGet('bands') : null;
  var rmsRaw;
  if (bands && typeof bands.rms === 'number') {
    rmsRaw = bands.rms;
  } else {
    rmsRaw = partitaBinAvg(2, 160) * 0.7 + partitaBinAvg(161, 300) * 0.3;
  }
  partitaEnergy += (Math.min(1, rmsRaw * 2.4) - partitaEnergy) * Math.min(1, dt * 3.2);
  /* 副歌闸门：能量慢升慢降（与流光 auroraChorus 同思路） */
  var target = Math.max(0, Math.min(1, (partitaEnergy - 0.34) / 0.30));
  var k = target > partitaChorus ? 0.9 : 0.35;
  partitaChorus += (target - partitaChorus) * Math.min(1, dt * k);

  /* 地平线辉光随能量呼吸：量化 24 档，档位不变不写（每帧零分配纪律） */
  var q = Math.round(partitaEnergy * 24);
  if (q !== partitaLastEnergyQ) {
    partitaLastEnergyQ = q;
    var overlay = document.getElementById('partita-overlay');
    if (overlay) overlay.style.setProperty('--pt-energy', (q / 24).toFixed(3));
  }
}

function partitaTickLyrics() {
  partitaSyncTheme();
  var hasReal = lyricsLines && lyricsLines.length &&
    lyricsLines.some(function (l) { return !l.fallback; });
  if (!hasReal) {
    if (partitaLastLineIdx !== -98) {
      partitaLastLineIdx = -98;
      partitaDetachCurrentLine();
      partitaSetEmpty(true);
    }
    return;
  }
  var rawT = (typeof motionSignalGet === 'function') ? motionSignalGet('currentTime') : 0;
  if (!isFinite(rawT)) rawT = 0;
  var t;
  try {
    /* 未播放过任何歌时 audio/motionSignal 可能为 0，按 0 处理以渲染首行 */
    t = getAdjustedLyricPlaybackTime(rawT || (audio ? (audio.currentTime || 0) : 0));
  } catch (e) { return; }
  var idx;
  try {
    idx = findStageLyricIndexAtTime(t);
  } catch (e) { return; }
  if (idx < 0) idx = -1;

  /* 行内大跳（seek）：同 idx 也强制重建，位姿/流光时序才正确 */
  if (idx === partitaLastLineIdx && partitaLineEl && Math.abs(t - partitaLastTime) > 1.5) {
    partitaLastLineIdx = -99;
  }
  partitaLastTime = t;

  if (idx !== partitaLastLineIdx) {
    partitaLastLineIdx = idx;
    var line = (idx >= 0 && idx < lyricsLines.length) ? lyricsLines[idx] : null;
    if (line && line.text && line.text.trim()) {
      partitaSetEmpty(false);
      renderPartitaLine(line);
    } else {
      partitaDetachCurrentLine();
      partitaSetEmpty(true);
    }
    return;    /* 切行帧不推进状态，下一帧开始翻转 */
  }

  if (!partitaLineEl) return;
  var profile = partitaCurrentProfile();
  if (!profile) return;
  var lookahead = profile.wordLookahead;
  var i;

  /* 预热：下一句进入 0.18~1.2s 窗口时提前构建布局（shouldPreheatLine 移植） */
  var next = (idx >= 0 && idx + 1 < lyricsLines.length) ? lyricsLines[idx + 1] : null;
  if (next && next.text && next.text.trim()) {
    var lead = next.t - t;
    if (lead >= PARTITA_PREHEAT_WINDOW.minLead && lead <= PARTITA_PREHEAT_WINDOW.maxLead) {
      partitaGetOrBuildLayout(next);
    }
  }

  /* chunk 三态（active 窗口 = 首词 start ~ 末词 activeEnd） */
  for (i = 0; i < partitaChunkRecs.length; i++) {
    var cr = partitaChunkRecs[i];
    var cst = t >= cr.startT - lookahead
      ? (t <= cr.endT ? 'active' : 'passed')
      : 'waiting';
    if (cst !== cr.state) partitaSetChunkStatus(cr, cst);
  }
  /* word 三态（waiting → active（词前 lookahead 预读）→ passed） */
  for (i = 0; i < partitaWordRecs.length; i++) {
    var wr = partitaWordRecs[i];
    var wst = t >= wr.startT - lookahead
      ? (t <= wr.endT ? 'active' : 'passed')
      : 'waiting';
    if (wst !== wr.state) partitaSetWordStatus(wr, wst);
  }
}

/* 当前行 render profile 随行缓存（状态机的 lookahead / 揭示模式来源） */
function partitaCurrentProfile() {
  return partitaLineProfile;
}

/* =========================================================
   七、主循环（rAF 节流 ~30fps）与歌词数据轮询
   ========================================================= */

function startPartitaLoop() {
  stopPartitaLoop();
  var lastTick = 0;
  var lastFrame = performance.now();
  function frame(now) {
    if (!partitaMode) return;
    var dt = Math.min(0.1, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    if (now - lastTick > 33) {
      lastTick = now;
      partitaTickAudio(dt);
      checkPartitaFontChange();
      partitaTickLyrics();
    }
    partitaRafId = requestAnimationFrame(frame);
  }
  partitaRafId = requestAnimationFrame(frame);
  watchPartitaLyricsChange();
}

function stopPartitaLoop() {
  if (partitaRafId) {
    cancelAnimationFrame(partitaRafId);
    partitaRafId = 0;
  }
  partitaLyricsObserverToken++;
}

function watchPartitaLyricsChange() {
  var token = ++partitaLyricsObserverToken;
  var lastLen = -1;
  function check() {
    if (token !== partitaLyricsObserverToken || !partitaMode) return;
    var len = (lyricsLines && lyricsLines.length) || 0;
    if (len !== lastLen) {
      lastLen = len;
      partitaLastLineIdx = -99;   /* 强制重渲染当前行 */
    }
    setTimeout(check, 600);
  }
  check();
}

/* =========================================================
   八、切换 / 字体 / resize / 绑定（照 09-aurora-flow.js 骨架）
   ========================================================= */

function applyPartitaMode(on, opts) {
  opts = opts || {};
  partitaMode = !!on;
  /* 多向互斥：经视觉模式注册表退出其它覆盖层 */
  if (partitaMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('partita', { save: true });
  }
  document.body.classList.toggle('partita', partitaMode);
  var overlay = document.getElementById('partita-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', partitaMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(PARTITA_STORE_KEY, partitaMode);
  if (partitaMode) {
    startPartita();
  } else {
    stopPartita();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(partitaMode ? '云阶已开启' : '已切回标准模式');
}

function togglePartitaMode() {
  applyPartitaMode(!partitaMode, { save: true, toast: true });
}

/* 内嵌正交背景（活背景）：把用户选中的背景实现（cover-fluid/geometric）挂进
   overlay 内部 L0.25 层——静态渐变之上叠「活的」封面流体/几何律动。
   与 95-background-runtime 的宿主层互不干扰（各自独立实例）。 */
var partitaEmbedBg = { impl: null, host: null, rafId: 0, slowTimer: 0, lastFrame: 0, lastTick: 0 };
function partitaMountEmbedBg() {
  partitaUnmountEmbedBg();
  var overlay = document.getElementById('partita-overlay');
  if (!overlay) return;
  var bgMode = (typeof fx !== 'undefined' && fx && fx.backgroundMode) || '';
  var impl = (typeof VISUALIZER_BG_IMPLS !== 'undefined' && bgMode && VISUALIZER_BG_IMPLS[bgMode]) || null;
  if (!impl) return;   /* ambient 或预留项：保持纯 CSS 渐变 */
  var host = document.createElement('div');
  host.className = 'pt-embed-bg';
  host.setAttribute('aria-hidden', 'true');
  overlay.insertBefore(host, overlay.querySelector('.partita-vignette'));
  partitaEmbedBg.impl = impl;
  partitaEmbedBg.host = host;
  try {
    impl.mount(host, typeof visualizerBackgroundContext === 'function' ? visualizerBackgroundContext() : null);
  } catch (e) { }
  if (impl.needsRaf) {
    partitaEmbedBg.lastFrame = 0;
    partitaEmbedBg.lastTick = 0;
    (function frame(now) {
      if (!partitaEmbedBg.impl) return;
      var dt = partitaEmbedBg.lastFrame ? Math.min(0.1, (now - partitaEmbedBg.lastFrame) / 1000) : 1 / 30;
      partitaEmbedBg.lastFrame = now;
      if (now - partitaEmbedBg.lastTick > 33) {
        partitaEmbedBg.lastTick = now;
        try { partitaEmbedBg.impl.tick(visualizerBackgroundContext(), dt, now); } catch (e) { }
      }
      partitaEmbedBg.rafId = requestAnimationFrame(frame);
    })(performance.now());
  }
  partitaEmbedBg.slowTimer = setInterval(function () {
    if (!partitaEmbedBg.impl) return;
    try { partitaEmbedBg.impl.tickSlow(visualizerBackgroundContext()); } catch (e) { }
  }, 700);
}
function partitaUnmountEmbedBg() {
  var e = partitaEmbedBg;
  if (!e.impl) return;
  if (e.rafId) { cancelAnimationFrame(e.rafId); e.rafId = 0; }
  if (e.slowTimer) { clearInterval(e.slowTimer); e.slowTimer = 0; }
  try { if (typeof e.impl.unmount === 'function') e.impl.unmount(); } catch (err) { }
  if (e.host && e.host.parentElement) e.host.parentElement.removeChild(e.host);
  e.impl = null; e.host = null;
}

function startPartita() {
  partitaFontStack();
  partitaLastLineIdx = -99;       /* 强制首帧渲染当前行 */
  partitaLineProfile = null;
  startPartitaLoop();
  partitaMountEmbedBg();
}

function stopPartita() {
  stopPartitaLoop();
  partitaUnmountEmbedBg();
  partitaDetachCurrentLine();
  partitaSetEmpty(false);
  partitaLastLineIdx = -99;
  partitaLastTime = -1;
  partitaEnergy = 0;
  partitaChorus = 0;
  partitaLastEnergyQ = -1;
  partitaLineProfile = null;
  if (partitaLayoutCache && partitaLayoutCache.size) {
    partitaLayoutCache.clear();   /* 退出清缓存：切歌/离线后不占内存 */
  }
}

/* 字体跟随用户歌词字体选择（fx.lyricFont，与流光/雨窗一致） */
function partitaFontStack() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  var stack = (fontKey && typeof lyricFontStackForKey === 'function')
    ? lyricFontStackForKey(fontKey)
    : '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  var overlay = document.getElementById('partita-overlay');
  if (overlay) overlay.style.setProperty('--pt-font', stack);
  return stack;
}

function checkPartitaFontChange() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  if (partitaLastFontKey !== fontKey) {
    partitaLastFontKey = fontKey;
    partitaFontStack();
  }
}

function onPartitaResize() {
  if (!partitaMode) return;
  partitaWindowHeight = window.innerHeight || 800;
  if (partitaLayoutCache) partitaLayoutCache.clear();   /* 高度分桶变 → 布局重建 */
  partitaLastLineIdx = -99;                             /* 强制按新高度重排当前行 */
}

function initPartita() {
  partitaWindowHeight = window.innerHeight || 800;
  applyPartitaMode(partitaMode, { save: false });
  window.addEventListener('resize', function () {
    clearTimeout(partitaResizeTimer);
    partitaResizeTimer = setTimeout(onPartitaResize, 180);
  });
}

/* 延迟到 DOM 就绪后初始化（本模块在 index-loader 末尾加载，DOM 已就绪） */
scheduleUiWarmTask ? scheduleUiWarmTask(initPartita, 300) : setTimeout(initPartita, 300);
