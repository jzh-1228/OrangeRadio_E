/* =========================================================================
   OrangeSea · 斜排（Tilt · 概率拆行双字模歌词）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0):
     · src/components/visualizer/tilt/VisualizerTilt.tsx（拆行概率/双字模/
       逐行时间序 reveal/逐字脉冲算法）
     · src/utils/lyrics/sentenceLayout.ts（五级语义拆行，整类移植）
   宿主替换：React 生命周期 → IIFE 显式 enter/exit（applyTiltMode）；
   framer-motion MotionValue → motionSignalGet + 自有 30fps rAF 直写
   transform（transition 全部落在 CSS，评估路径 dom）。

   形态（照 09-aurora-flow.js 范本）：body.tilt + localStorage + 覆盖层
   互斥经 90-visualizer-registry；进入临时切 eco 质量档、退出恢复。
   本模式不消费音频特征（Folia Tilt 为纯歌词模式），rAF 只推歌词时间。

   分层：L0 暖夜背景（CSS 渐变，无 canvas）/
         L1 歌词舞台（当前行 1-4 段，双字模交错）。
   ========================================================================= */

var TILT_STORE_KEY = 'orangesea-tilt-mode-v1';
var tiltMode = readBooleanPreference(TILT_STORE_KEY, false);
var tiltRafId = 0;
var tiltPrevQuality = null;
var tiltLyricsObserverToken = 0;
var tiltResizeTimer = 0;
var tiltLastFontKey = null;

/* tuning：Folia DEFAULT_TILT_TUNING（types.ts:496）——拆行概率 0.75 /
   大斜体风格概率 0.35 / 配色 default。 */
var TILT_SPLIT_PROBABILITY = 0.75;
var TILT_STYLE_PROBABILITY = 0.35;

/* 布局常量（VisualizerTilt.tsx:16-52 照搬） */
var TILT_CHAR_REF_LENGTH = 20;
var TILT_LOG_OFFSET = 4;
var TILT_REM_PX = 16;
var TILT_RESPLIT_THRESHOLD = 1.6;
var TILT_SCALE_FLOOR_NORMAL = 0.55;
var TILT_SCALE_FLOOR_TILT = 0.5;

/* 渲染态（行切换时整体重建；tick 只读） */
var tiltLastLineIdx = -99;
var tiltCur = null;          /* { el, segs:[segRender], lineT, lineEnd } */
var tiltVisibleSegIndex = -2;

/* 测量用离屏 canvas（模块级单例，font 每次设置） */
var tiltMeasureCtx = null;

/* grapheme 分簇器（graffiti 同款降级：不可用时退化为逐码点） */
var tiltGraphemeSegmenter = (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function')
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;
var tiltWordSegmenter = (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function')
  ? new Intl.Segmenter(undefined, { granularity: 'word' })
  : null;

/* ---------- 切换 ---------- */
function applyTiltMode(on, opts) {
  opts = opts || {};
  tiltMode = !!on;
  /* 互斥：经视觉模式注册表退出其它覆盖层 */
  if (tiltMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('tilt', { save: true });
  }
  document.body.classList.toggle('tilt', tiltMode);
  var overlay = document.getElementById('tilt-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', tiltMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(TILT_STORE_KEY, tiltMode);
  if (tiltMode) {
    startTilt();
    /* 3D 场景已被覆盖层盖住：临时切 eco 质量档让出帧预算（退出时恢复） */
    if (typeof fx !== 'undefined' && fx && tiltPrevQuality === null) {
      tiltPrevQuality = fx.performanceQuality || 'balanced';
      fx.performanceQuality = 'eco';
    }
  } else {
    stopTilt();
    if (tiltPrevQuality !== null && typeof fx !== 'undefined' && fx) {
      fx.performanceQuality = tiltPrevQuality;
      tiltPrevQuality = null;
    }
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(tiltMode ? '斜排已开启' : '已切回标准模式');
}

function toggleTiltMode() {
  applyTiltMode(!tiltMode, { save: true, toast: true });
}

/* ---------- 启动 / 停止 ---------- */
function startTilt() {
  tiltFontStack();
  tiltLastLineIdx = -99;
  tiltVisibleSegIndex = -2;
  startTiltLoop();
}

function stopTilt() {
  stopTiltLoop();
  tiltCur = null;
  tiltLastLineIdx = -99;
  tiltVisibleSegIndex = -2;
  var stage = document.getElementById('tilt-stage');
  if (stage) stage.innerHTML = '<div class="tilt-idle" id="tilt-idle">♪</div>';
}

/* ---------- 字体跟随用户歌词字体选择（fx.lyricFont，与流光/雨窗一致） ---------- */
function tiltFontStack() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  var stack = (fontKey && typeof lyricFontStackForKey === 'function')
    ? lyricFontStackForKey(fontKey)
    : '"Noto Sans SC", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  var overlay = document.getElementById('tilt-overlay');
  if (overlay) overlay.style.setProperty('--tl-font', stack);
  return stack;
}

function checkTiltFontChange() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  if (tiltLastFontKey !== fontKey) {
    tiltLastFontKey = fontKey;
    tiltFontStack();
    tiltLastLineIdx = -99;   /* 字体变了：测量宽度失效，强制重建当前行布局 */
  }
}

/* =========================================================================
   五级语义拆行（sentenceLayout.ts 整类移植，静态方法 → 模块函数）
   ========================================================================= */
var TILT_CJK_RE = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/;
var tiltCharCountCache = (typeof Map === 'function') ? new Map() : null;

function tiltHasCjk(text) { return TILT_CJK_RE.test(text); }

function tiltGetGlobalCount(text, ch) {
  if (!tiltCharCountCache) return (text.split(ch).length - 1);
  var key = text.length + ':' + ch;
  if (tiltCharCountCache.has(key)) return tiltCharCountCache.get(key);
  var escaped = ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var count = (text.match(new RegExp(escaped, 'g')) || []).length;
  tiltCharCountCache.set(key, count);
  return count;
}

/* level 1：标点断句（标点及尾随空白并入前段） */
function tiltSplitByPunctuation(text) {
  var matches = text.match(/[，。；！？、…·.,;!?]+/g);
  if (!matches) return [text];
  var result = [];
  var lastIndex = 0;
  var re = /[，。；！？、…·.,;!?]+/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var punctStart = m.index;
    var punctEnd = punctStart + m[0].length;
    var trailingSpaces = '';
    var afterPunct = text.slice(punctEnd);
    var sm = /^\s+/.exec(afterPunct);
    if (sm) trailingSpaces = sm[0];
    var beforePunct = text.slice(lastIndex, punctStart);
    var punctWithSpaces = m[0] + trailingSpaces;
    if (beforePunct.length > 0) {
      result.push(beforePunct + punctWithSpaces);
    } else if (result.length > 0) {
      result[result.length - 1] += punctWithSpaces;
    } else {
      result.push(punctWithSpaces);
    }
    lastIndex = punctEnd + trailingSpaces.length;
  }
  if (lastIndex < text.length) result.push(text.slice(lastIndex));
  return result.filter(function (r) { return r.length > 0; });
}

/* level 2：最外层成对符号（引号/括号/书名号整块切出） */
var TILT_PAIRED_SYMBOLS = [
  { open: /「/, close: /」/ },
  { open: /『/, close: /』/ },
  { open: /《/, close: /》/ },
  { open: /【/, close: /】/ },
  { open: /｛/, close: /｝/ },
  { open: /［/, close: /］/ },
  { open: /\[/, close: /\]/ },
  { open: /（/, close: /）/ },
  { open: /\(/, close: /\)/ },
  { openStr: '"', closeStr: '"' },
  { openStr: "'", closeStr: "'" }
];

function tiltFindRegexMatch(regex, text, fromIndex) {
  regex.lastIndex = fromIndex || 0;
  var match = regex.exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

function tiltFindStringMatch(str, text, fromIndex) {
  var idx = text.indexOf(str, fromIndex || 0);
  return idx === -1 ? null : { start: idx, end: idx + str.length };
}

function tiltFindOutermostPair(text, defs) {
  var best = null;
  for (var i = 0; i < defs.length; i++) {
    var def = defs[i];
    var openMatch = def.openStr !== undefined
      ? tiltFindStringMatch(def.openStr, text)
      : tiltFindRegexMatch(def.open, text, 0);
    if (!openMatch) continue;
    var searchFrom = openMatch.end;
    var closeMatch = def.closeStr !== undefined
      ? tiltFindStringMatch(def.closeStr, text, searchFrom)
      : tiltFindRegexMatch(def.close, text, searchFrom);
    if (!closeMatch) continue;
    if (!best || openMatch.start < best.openStart) {
      best = { openStart: openMatch.start, openEnd: openMatch.end, closeStart: closeMatch.start, closeEnd: closeMatch.end };
    } else if (openMatch.start === best.openStart && closeMatch.end > best.closeEnd) {
      best = { openStart: openMatch.start, openEnd: openMatch.end, closeStart: closeMatch.start, closeEnd: closeMatch.end };
    }
  }
  return best;
}

function tiltExtractOutermostPairs(text, defs) {
  var best = tiltFindOutermostPair(text, defs);
  if (!best) return [text];
  var before = text.slice(0, best.openStart);
  var pairedContent = text.slice(best.openStart, best.closeEnd);
  var remainder = text.slice(best.closeEnd);
  var result = [];
  if (before.length > 0) {
    result = result.concat(tiltExtractOutermostPairs(before, defs));
  }
  result.push(pairedContent);
  if (remainder.length > 0) {
    result = result.concat(tiltExtractOutermostPairs(remainder, defs));
  }
  return result.filter(function (p) { return p.length > 0; });
}

/* level 3：CJK 文本中的西文词块切出 */
function tiltShouldSkipBoundary(fullText, beforeBlock) {
  if (beforeBlock.length === 0) return false;
  var sepChar = beforeBlock[beforeBlock.length - 1];
  if (sepChar === '-') return true;
  if (sepChar === ':' || sepChar === '：' || sepChar === '/' || sepChar === '／' || sepChar === '|' || sepChar === '｜') {
    return tiltGetGlobalCount(fullText, sepChar) >= 2;
  }
  return false;
}

function tiltSplitByWesternWords(text) {
  if (!tiltHasCjk(text)) return [text];
  var westernBlockRegex = /[a-zA-Z0-9]+(?:[a-zA-Z0-9'\-]*[a-zA-Z0-9]+)?(?:\s+[a-zA-Z0-9]+(?:[a-zA-Z0-9'\-]*[a-zA-Z0-9]+)?)+[.,;:!?。，；：！？]?\s*/g;
  if (tiltCharCountCache) tiltCharCountCache.clear();
  var hasMultipleWordBlock = false;
  var match;
  while ((match = westernBlockRegex.exec(text)) !== null) {
    var wc = match[0].match(/[a-zA-Z0-9]+/g);
    if (wc && wc.length > 1) { hasMultipleWordBlock = true; break; }
  }
  if (!hasMultipleWordBlock) return [text];
  westernBlockRegex.lastIndex = 0;
  var parts = [];
  var lastIndex = 0;
  while ((match = westernBlockRegex.exec(text)) !== null) {
    var blockStart = match.index;
    var blockEnd = blockStart + match[0].length;
    var beforeBlock = text.slice(lastIndex, blockStart);
    if (tiltShouldSkipBoundary(text, beforeBlock)) {
      parts.push(beforeBlock + match[0]);
    } else if (blockStart > lastIndex) {
      parts.push(beforeBlock);
      parts.push(match[0]);
    } else {
      parts.push(match[0]);
    }
    lastIndex = blockEnd;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 1 ? parts : [text];
}

/* level 4：CJK 文本按空格切（全角空格总切，半角空格在 CJK 后切） */
function tiltSplitCJKBySpace(text) {
  if (!tiltHasCjk(text)) return [text];
  var segments = [];
  var currentSegment = '';
  var inCjkBlock = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    var isCJK = TILT_CJK_RE.test(ch);
    var isWestern = /[a-zA-Z0-9]/.test(ch);
    var isSpace = /\s/.test(ch);
    if (isCJK) {
      currentSegment += ch;
      inCjkBlock = true;
    } else if (isWestern) {
      currentSegment += ch;
    } else if (isSpace) {
      var isFullWidthSpace = ch === '\u3000';
      if (isFullWidthSpace && currentSegment.length > 0) {
        currentSegment += ch;
        segments.push(currentSegment);
        currentSegment = '';
        inCjkBlock = false;
      } else if (inCjkBlock && currentSegment.length > 0) {
        var lastChar = currentSegment[currentSegment.length - 1];
        if (TILT_CJK_RE.test(lastChar)) {
          currentSegment += ch;
          segments.push(currentSegment);
          currentSegment = '';
          inCjkBlock = false;
        } else {
          currentSegment += ch;
        }
      } else if (currentSegment.length === 0 && segments.length > 0) {
        segments[segments.length - 1] += ch;
      } else {
        currentSegment += ch;
      }
    } else {
      if (currentSegment.length === 0 && segments.length > 0) {
        segments[segments.length - 1] += ch;
      } else {
        currentSegment += ch;
      }
    }
  }
  if (currentSegment) {
    if (segments.length > 0 && /^\s+$/.test(currentSegment)) {
      segments[segments.length - 1] += currentSegment;
    } else {
      segments.push(currentSegment);
    }
  }
  return segments.length > 1 ? segments : [text];
}

/* level 5：特殊分隔符（冒号/斜杠/竖线/波浪） */
function tiltSplitBySpecialChars(text) {
  var parts = text.split(/[：:/／\\|｜~～]+/);
  if (parts.filter(function (p) { return p.length > 0; }).length <= 1) return [text];
  var result = [];
  var lastIndex = 0;
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    var index = text.indexOf(part, lastIndex);
    if (index > lastIndex) {
      var specialChar = text.slice(lastIndex, index);
      if (result.length > 0) result[result.length - 1] += specialChar;
      else result.push(specialChar);
    }
    if (part) {
      result.push(part);
      lastIndex = index + part.length;
    } else if (index !== -1) {
      lastIndex = index;
    }
  }
  if (lastIndex < text.length) {
    var tail = text.slice(lastIndex);
    if (tail && result.length > 0) result[result.length - 1] += tail;
    else if (tail) result.push(tail);
  }
  return result.filter(function (r) { return r.length > 0; });
}

function tiltSplitByLevel(text, level) {
  switch (level) {
    case 1: return tiltSplitByPunctuation(text);
    case 2: return tiltExtractOutermostPairs(text, TILT_PAIRED_SYMBOLS);
    case 3: return tiltSplitByWesternWords(text);
    case 4: return tiltSplitCJKBySpace(text);
    case 5: return tiltSplitBySpecialChars(text);
    default: return [text];
  }
}

/* 兜底细拆：优先 Intl.Segmenter 词边界中点最优拆，退化为准随机中点劈 */
function tiltSecondarySplit(sentences, targetCount, timeSeed) {
  while (sentences.length < targetCount) {
    var candidates = sentences.filter(function (s) { return s.length > 2; });
    if (candidates.length === 0) break;

    if (tiltWordSegmenter) {
      var semanticCandidates = [];
      for (var si = 0; si < sentences.length; si++) {
        var s = sentences[si];
        if (s.length <= 2) continue;
        try {
          var segments = tiltWordSegmenter.segment(s);
          var wordPositions = [];
          var offset = 0;
          var iter = segments[Symbol.iterator]();
          var seg;
          while ((seg = iter.next()) && !seg.done) {
            if (seg.value.isWordLike) wordPositions.push(offset);
            offset += seg.value.segment.length;
          }
          if (wordPositions.length >= 2) {
            var midChar = s.length / 2;
            var bestGapIdx = 1;
            var bestDist = Infinity;
            for (var g = 1; g < wordPositions.length; g++) {
              var dist = Math.abs(wordPositions[g] - midChar);
              if (dist < bestDist) { bestDist = dist; bestGapIdx = g; }
            }
            var splitPos = wordPositions[bestGapIdx];
            var balanceScore = 1 - Math.abs(splitPos - midChar) / midChar;
            semanticCandidates.push({ sentence: s, index: si, splitPos: splitPos, score: balanceScore * 10 + wordPositions.length });
          }
        } catch (e) { }
      }
      if (semanticCandidates.length > 0) {
        semanticCandidates.sort(function (a, b) { return b.score - a.score; });
        var best = semanticCandidates[0];
        var firstHalf = best.sentence.slice(0, best.splitPos);
        var secondHalf = best.sentence.slice(best.splitPos);
        sentences.splice(best.index, 1, firstHalf, secondHalf);
        continue;
      }
    }

    var pseudoRandom = function (seed) {
      var x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };
    var textHash = 0;
    for (var h = 0; h < sentences.length; h++) {
      for (var c = 0; c < sentences[h].length; c++) textHash += sentences[h].charCodeAt(c);
    }
    var seed = textHash + sentences.length + (timeSeed || 0);
    var randomIndex = Math.floor(pseudoRandom(seed) * candidates.length);
    var selected = candidates[randomIndex];
    var candidateIndex = sentences.indexOf(selected);
    var midPoint = Math.floor(selected.length / 2);
    sentences.splice(candidateIndex, 1, selected.slice(0, midPoint), selected.slice(midPoint));
  }
  return sentences;
}

/* 过量合并：总长最短的相邻两段优先 */
function tiltMergeSentences(sentences, targetCount) {
  while (sentences.length > targetCount) {
    var bestMergeIndex = 0;
    var shortestCombined = Infinity;
    for (var i = 0; i < sentences.length - 1; i++) {
      var combined = sentences[i].length + sentences[i + 1].length;
      if (combined < shortestCombined) { shortestCombined = combined; bestMergeIndex = i; }
    }
    sentences.splice(bestMergeIndex, 2, sentences[bestMergeIndex] + sentences[bestMergeIndex + 1]);
  }
  return sentences;
}

function tiltSplitIntoSentences(text, targetCount, timeSeed) {
  if (targetCount <= 1 && targetCount >= 0) return [text];
  var sentences = [text];
  for (var level = 1; level <= 5; level++) {
    if (sentences.length >= Math.abs(targetCount) && targetCount > 0) break;
    var newSentences = [];
    for (var i = 0; i < sentences.length; i++) {
      newSentences = newSentences.concat(tiltSplitByLevel(sentences[i], level));
    }
    sentences = newSentences;
  }
  if (targetCount > 0 && sentences.length < targetCount) {
    sentences = tiltSecondarySplit(sentences, targetCount, timeSeed);
  }
  if (sentences.length > 1 && sentences.length > targetCount && targetCount > 0) {
    sentences = tiltMergeSentences(sentences, targetCount);
  }
  return sentences;
}

/* =========================================================================
   布局（buildTiltLayout 照搬；测量 @chenglou/pretext → canvas measureText）
   ========================================================================= */
function tiltSeededRandom(seed, offset) {
  var x = Math.sin(seed * 1000 + offset) * 10000;
  return x - Math.floor(x);
}

function tiltDetermineLineCount(charCount, seed, splitProbability) {
  var normalized = Math.log(charCount + TILT_LOG_OFFSET) / Math.log(TILT_CHAR_REF_LENGTH + TILT_LOG_OFFSET);
  var jitter = tiltSeededRandom(seed, 1) * 0.6 + 0.7;
  var score = normalized * jitter * splitProbability;
  if (score < 0.45) return 1;
  if (score < 1.05) return 2;
  if (score < 1.7) return 3;
  return 4;
}

function tiltAvailableWidth() {
  return Math.max(320, window.innerWidth) * 0.85;
}

/* 单行宽度测量：离屏 canvas（浏览器排版引擎 shaping，与 pretext 的
   layoutWithLines(∞) 单行宽度语义一致；不含 letterSpacing——两边相同） */
function tiltMeasureAtSize(text, pxSize, fontSpec) {
  if (!text) return 0;
  if (!tiltMeasureCtx) {
    var c = document.createElement('canvas');
    c.width = c.height = 8;
    tiltMeasureCtx = c.getContext('2d');
  }
  if (!tiltMeasureCtx) return text.length * pxSize * 0.6;
  tiltMeasureCtx.font = fontSpec.replace('@PX@', String(pxSize));
  var w = tiltMeasureCtx.measureText(text).width;
  return w > 0 ? w : text.length * pxSize * 0.6;
}

function tiltMarkShortLastLine(segs) {
  if (segs.length < 2) return segs;
  var last = segs[segs.length - 1];
  if (last.isTilt || last.text.trim().length > 2) return segs;
  var prev = segs[segs.length - 2];
  if (last.text.trim().length * 2 <= prev.text.length) {
    last.isShortLastLine = true;
  }
  return segs;
}

/* 返回 { segments:[{text,isTilt,isShortLastLine,charOffset}], scaleMultiplier } */
function buildTiltLayout(fullText, lineSeed, fontStack) {
  var vw = window.innerWidth || 1200;
  var measureMaxPx = Math.max(vw * 0.06875, 5.625 * TILT_REM_PX);
  var normalBasePx = measureMaxPx;
  var tiltBasePx = measureMaxPx;
  var normalFontSpec = '400 @PX@px ' + fontStack;
  var tiltFontSpec = 'italic 300 @PX@px ' + fontStack;
  var availableWidth = tiltAvailableWidth();

  var charCount = fullText.trim().length;
  var isEllipsisOnly = /^[\s.…·。]+$/.test(fullText.trim());
  var mergedSegments;

  if (isEllipsisOnly) {
    mergedSegments = [fullText];
  } else {
    var numLines = tiltDetermineLineCount(charCount, lineSeed, TILT_SPLIT_PROBABILITY);
    mergedSegments = tiltSplitIntoSentences(fullText, numLines, lineSeed);
  }

  /* 候选段掷骰 → 单一大斜体段（tiltStyleProbability） */
  var candidates = [];
  for (var ci = 0; ci < mergedSegments.length; ci++) {
    var lineRoll = tiltSeededRandom(lineSeed, 100 + ci);
    if (lineRoll < TILT_STYLE_PROBABILITY) candidates.push(ci);
  }
  var finalTiltIndex = -1;
  if (candidates.length > 0) {
    finalTiltIndex = candidates[Math.floor(tiltSeededRandom(lineSeed, 200) * candidates.length)];
  }

  var offsetAccum = 0;
  var segments = [];
  for (var i = 0; i < mergedSegments.length; i++) {
    var text = mergedSegments[i];
    var trimmed = text.trim();
    var leadingSpaces = text.length - text.replace(/^\s+/, '').length;
    segments.push({
      text: trimmed,
      isTilt: i === finalTiltIndex,
      isShortLastLine: false,
      charOffset: offsetAccum + leadingSpaces
    });
    offsetAccum += text.length;
  }

  var scaleMultiplier = 1;
  var tiltWidth = 0, normalWidth = 0;
  var widestTiltText = '', widestNormalText = '';
  for (var w1 = 0; w1 < segments.length; w1++) {
    var sw = tiltMeasureAtSize(segments[w1].text, segments[w1].isTilt ? tiltBasePx : normalBasePx,
      segments[w1].isTilt ? tiltFontSpec : normalFontSpec);
    if (segments[w1].isTilt) { if (sw > tiltWidth) { tiltWidth = sw; widestTiltText = segments[w1].text; } }
    else { if (sw > normalWidth) { normalWidth = sw; widestNormalText = segments[w1].text; } }
  }

  var tiltOverflow = tiltWidth > 0 ? tiltWidth / availableWidth : 0;
  var normalOverflow = normalWidth > 0 ? normalWidth / availableWidth : 0;
  var maxOverflow = Math.max(tiltOverflow, normalOverflow);

  if (maxOverflow > 1) {
    if (maxOverflow >= TILT_RESPLIT_THRESHOLD) {
      /* 超宽过多 → 重新按宽度估算行数再拆一次 */
      var targetWidth = availableWidth * (TILT_RESPLIT_THRESHOLD - 0.15);
      var totalEstWidth = tiltMeasureAtSize(fullText, normalBasePx, normalFontSpec);
      var extraSplitsNeeded = Math.min(4, Math.max(segments.length + 1, Math.ceil(totalEstWidth / targetWidth)));
      if (extraSplitsNeeded > segments.length) {
        var reSplitUnits = tiltSplitIntoSentences(fullText, extraSplitsNeeded, lineSeed);
        var reSplitOffset = 0;
        var newSegments = [];
        for (var r = 0; r < reSplitUnits.length; r++) {
          var uText = reSplitUnits[r];
          var uTrimmed = uText.trim();
          var uLeading = uText.length - uText.replace(/^\s+/, '').length;
          newSegments.push({ text: uTrimmed, isTilt: false, isShortLastLine: false, charOffset: reSplitOffset + uLeading });
          reSplitOffset += uText.length;
        }
        if (newSegments.length > 0) {
          var resplitTiltRoll = tiltSeededRandom(lineSeed, 300);
          if (resplitTiltRoll < TILT_STYLE_PROBABILITY) {
            var picked = Math.floor(tiltSeededRandom(lineSeed, 301) * newSegments.length);
            newSegments[picked].isTilt = true;
          }
        }
        /* 重拆后再按最宽行决定缩放（照搬） */
        var postTiltText = null, postNormalText = null;
        for (var p1 = 0; p1 < newSegments.length; p1++) {
          if (newSegments[p1].isTilt) postTiltText = newSegments[p1].text;
          else postNormalText = newSegments[p1].text;
        }
        var postScale = 1;
        if (postTiltText != null) {
          var pw = tiltMeasureAtSize(postTiltText, tiltBasePx, tiltFontSpec);
          if (pw > availableWidth) postScale = Math.max(TILT_SCALE_FLOOR_TILT, availableWidth / pw);
        } else if (postNormalText != null) {
          var pw2 = tiltMeasureAtSize(postNormalText, normalBasePx, normalFontSpec);
          if (pw2 > availableWidth) postScale = Math.max(TILT_SCALE_FLOOR_NORMAL, availableWidth / pw2);
        }
        return { segments: tiltMarkShortLastLine(newSegments), scaleMultiplier: postScale };
      }
    }

    if (tiltOverflow >= normalOverflow && widestTiltText) {
      scaleMultiplier = Math.max(TILT_SCALE_FLOOR_TILT, availableWidth / tiltWidth);
    } else if (widestNormalText) {
      scaleMultiplier = Math.max(TILT_SCALE_FLOOR_NORMAL, availableWidth / normalWidth);
    }
  }

  return { segments: tiltMarkShortLastLine(segments), scaleMultiplier: scaleMultiplier };
}

/* =========================================================================
   逐字时序（buildCharTimings 简化移植：本项目 words 无 syllables，只有
   词粒度均分分支 + 段均分兜底；词定位用 c0/c1 码点区间替代 Folia indexOf 搜索）
   ========================================================================= */

/* 段内 grapheme 簇列表：[{ seg, cu, isSpace }]（cu = fullText 的 code unit 起点） */
function tiltSegmentClusters(segText, charOffset) {
  var clusters = [];
  if (tiltGraphemeSegmenter && segText) {
    var iter = tiltGraphemeSegmenter.segment(segText)[Symbol.iterator]();
    var item;
    while ((item = iter.next()) && !item.done) {
      var seg = item.value.segment;
      var cu = charOffset + item.value.index;
      clusters.push({ seg: seg, cu: cu, isSpace: /^\s+$/.test(seg) });
    }
  } else {
    var chars = Array.from(segText);
    var cu2 = charOffset;
    for (var i = 0; i < chars.length; i++) {
      clusters.push({ seg: chars[i], cu: cu2, isSpace: /^\s+$/.test(chars[i]) });
      cu2 += chars[i].length;
    }
  }
  return clusters;
}

/* 词与段 [cu0, cu1) 相交判定 */
function tiltWordIntersects(w, cu0, cu1) {
  var wc0 = (w.c0 != null) ? w.c0 : 0;
  var wc1 = (w.c1 != null) ? w.c1 : wc0;
  if (wc1 <= wc0) wc1 = wc0 + Math.max(1, (w.text || 'x').length);
  return wc1 > cu0 && wc0 < cu1;
}

/* 段落起止时间：相交首词 start → 相交末词 end（Folia segmentTimings 同义） */
function tiltSegmentTiming(line, cu0, cu1, lineEnd) {
  var words = line.words || [];
  var start = Infinity, end = -Infinity;
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (!w || !tiltWordIntersects(w, cu0, cu1)) continue;
    var wt = (w.t != null) ? w.t : line.t;
    var we = wt + Math.max(w.d || 0, 0.05);
    if (wt < start) start = wt;
    if (we > end) end = we;
  }
  if (start === Infinity) return { start: line.t || 0, end: lineEnd };
  return { start: start, end: end };
}

/* 每个非空格簇的 {start,end}（顺序对齐非空格簇）；词内均分 + 段均分兜底 */
function buildTiltCharTimings(line, segText, clusters, segStart, segEnd) {
  var nonSpace = [];
  for (var i = 0; i < clusters.length; i++) {
    if (!clusters[i].isSpace) nonSpace.push(i);
  }
  if (nonSpace.length === 0) return [];
  var timings = new Array(nonSpace.length);
  var filled = 0;
  var words = line.words || [];
  if (words.length) {
    for (var wi = 0; wi < words.length; wi++) {
      var w = words[wi];
      if (!w) continue;
      var wc0 = (w.c0 != null) ? w.c0 : 0;
      var wc1 = (w.c1 != null) ? w.c1 : wc0;
      if (wc1 <= wc0) wc1 = wc0 + Math.max(1, (w.text || 'x').length);
      var cover = [];
      for (var k = 0; k < nonSpace.length; k++) {
        var cu = clusters[nonSpace[k]].cu;
        if (cu >= wc0 && cu < wc1) cover.push(k);
      }
      if (cover.length === 0) continue;
      var wt = (w.t != null) ? w.t : line.t;
      var wd = Math.max(w.d || 0, 0.05);
      var per = wd / cover.length;
      for (var m = 0; m < cover.length; m++) {
        timings[cover[m]] = { start: wt + m * per, end: wt + (m + 1) * per };
        filled++;
      }
    }
  }
  if (filled !== nonSpace.length) {
    /* 兜底：非空格簇在段时长内均分（LRC 无词/词区间未覆盖） */
    var totalDuration = Math.max(segEnd - segStart, 0.3);
    var avg = totalDuration / nonSpace.length;
    for (var f = 0; f < nonSpace.length; f++) {
      timings[f] = { start: segStart + f * avg, end: segStart + (f + 1) * avg };
    }
  }
  return timings;
}

/* 逐字脉冲强度（getCharPulseIntensity 照搬）：正弦升起 + 余辉缓落到 0.25 常亮 */
function tiltCharPulseIntensity(currentTime, start, end) {
  var rawDuration = Math.max(end - start, 0.05);
  var duration = Math.min(Math.max(rawDuration, 0.2), 0.9);
  var elapsed = currentTime - start;
  if (elapsed < 0) return 0;
  if (elapsed <= duration) {
    return Math.sin((elapsed / duration) * Math.PI);
  }
  var afterElapsed = elapsed - duration;
  var afterglowRamp = duration * 1.2;
  if (afterElapsed >= afterglowRamp) return 0.25;
  return 0.25 * (afterElapsed / afterglowRamp);
}

/* =========================================================================
   DOM 渲染（React AnimatePresence → 双缓冲行块；motion.div 动画 → CSS
   transition；MotionValue scale → 内层 span 直写 transform）
   ========================================================================= */
function tiltLineEnd(line) {
  var end = (line.t || 0) + (line.duration > 0 ? line.duration : 4);
  var ws = line.words;
  if (ws && ws.length) {
    var last = ws[ws.length - 1];
    if (last && last.t != null) {
      var wEnd = (last.t || 0) + (last.d || 0);
      if (wEnd > end) end = wEnd;
    }
  }
  return end;
}

function buildTiltSegmentDom(line, seg, scaleMultiplier) {
  var segCu0 = seg.charOffset;
  var segCu1 = seg.charOffset + seg.text.length;
  var clusters = tiltSegmentClusters(seg.text, seg.charOffset);

  var baseFontScale = scaleMultiplier;                  /* fontScale 恒 1 */
  var shortLastBoost = seg.isShortLastLine ? 1.18 : 1;
  var vw = window.innerWidth || 1200;
  var tiltFontPx = Math.min(vw * 0.06875 * baseFontScale, 5.625 * TILT_REM_PX * baseFontScale);
  var yOffset = tiltFontPx / 6;
  var boostScale = baseFontScale * shortLastBoost;
  var fontSize = seg.isTilt
    ? 'clamp(' + (3.125 * baseFontScale).toFixed(3) + 'rem, ' + (6.875 * baseFontScale).toFixed(3) + 'vw, ' + (5.625 * baseFontScale).toFixed(3) + 'rem)'
    : 'clamp(' + (3.125 * boostScale).toFixed(3) + 'rem, ' + (6.875 * boostScale).toFixed(3) + 'vw, ' + (5.625 * boostScale).toFixed(3) + 'rem)';

  var segStart, segEnd, timing;
  timing = tiltSegmentTiming(line, segCu0, segCu1, tiltLineEnd(line));
  segStart = timing.start;
  segEnd = timing.end;
  var charTimings = buildTiltCharTimings(line, seg.text, clusters, segStart, segEnd);

  var el = document.createElement('div');
  el.className = 'tilt-seg' + (seg.isTilt ? ' is-tilt' : '');
  el.style.fontSize = fontSize;

  var chars = [];          /* [{ inner, start, end, lastScale }] 仅非空格 */
  var visualIndex = 0;     /* 非空格视觉序号（reveal delay 用） */
  for (var ti = 0; ti < clusters.length; ti++) {
    var cl = clusters[ti];
    var outer = document.createElement('span');
    outer.className = 'tilt-char' + (cl.isSpace ? ' space' : '');
    outer.setAttribute('aria-hidden', 'true');
    if (seg.isTilt && !cl.isSpace) {
      /* 大斜体段：偶序号上浮、奇序号下沉（Folia yStagger 交错；
         normal 段字符只有 opacity 动画，无 y 位移） */
      var yStagger = (visualIndex % 2 === 0) ? -1 : 1;
      outer.style.setProperty('--ty0', (yStagger * yOffset * 2).toFixed(2) + 'px');
      outer.style.setProperty('--ty1', (yStagger * yOffset).toFixed(2) + 'px');
      outer.style.setProperty('--td', (visualIndex * 0.05).toFixed(3) + 's');
    } else if (!cl.isSpace) {
      outer.style.setProperty('--td', (visualIndex * 0.04).toFixed(3) + 's');
    }
    if (cl.isSpace) {
      outer.textContent = '\u00A0';
    } else {
      var inner = document.createElement('span');
      inner.className = 'tilt-char-in';
      inner.textContent = cl.seg;
      outer.appendChild(inner);
      var ct = charTimings[visualIndex] || { start: segStart, end: segEnd };
      chars.push({ inner: inner, start: ct.start, end: ct.end, lastScale: 0 });
      visualIndex++;
    }
    el.appendChild(outer);
  }

  return {
    el: el,
    isTilt: seg.isTilt,
    start: segStart,
    end: segEnd,
    chars: chars,
    visible: false
  };
}

function buildTiltLineDom(line) {
  var fullText = line.text || '';
  var block = document.createElement('div');
  block.className = 'tilt-block';
  block.setAttribute('role', 'text');
  block.setAttribute('aria-label', fullText);
  var layout = buildTiltLayout(fullText, line.t || 0, tiltFontStack());
  var segs = [];
  for (var si = 0; si < layout.segments.length; si++) {
    var seg = layout.segments[si];
    if (!seg.text) continue;
    var dom = buildTiltSegmentDom(line, seg, layout.scaleMultiplier);
    block.appendChild(dom.el);
    segs.push(dom);
  }
  return { el: block, segs: segs, lineT: line.t || 0, lineEnd: tiltLineEnd(line) };
}

/* 行切换：双缓冲（旧块 .leaving 淡出 0.45s 后自移除，各块自带定时器） */
function swapTiltLine(line) {
  var stage = document.getElementById('tilt-stage');
  if (!stage) return;
  var idle = document.getElementById('tilt-idle');
  if (!line || !line.text || !line.text.trim()) {
    if (tiltCur) {
      var oldEmpty = tiltCur.el;
      oldEmpty.classList.add('leaving');
      setTimeout(function () { if (oldEmpty.parentNode) oldEmpty.parentNode.removeChild(oldEmpty); }, 520);
      tiltCur = null;
    }
    if (idle) idle.classList.add('show');
    return;
  }
  if (idle) idle.classList.remove('show');
  var next = buildTiltLineDom(line);
  stage.appendChild(next.el);
  if (tiltCur) {
    var old = tiltCur.el;
    old.classList.add('leaving');
    setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 520);
  }
  tiltCur = next;
}

/* =========================================================================
   主循环节流 ~30fps：行定位 + 段落时间序 reveal + 逐字脉冲
   ========================================================================= */
function tiltNowLyricTime() {
  /* 优先 motionSignalGet('currentTime')（MotionValue 等价信号）；信号仅在
     播放帧写入，暂停后 seek 需以 audio.currentTime 兜底（与流光同数据源） */
  var raw = (typeof audio !== 'undefined' && audio && audio.currentTime) ? audio.currentTime : motionSignalGet('currentTime') || 0;
  try {
    return getAdjustedLyricPlaybackTime(raw || 0);
  } catch (e) {
    return 0;
  }
}

function tickTiltLyrics() {
  if (!tiltMode) return;
  var hasReal = lyricsLines && lyricsLines.length && lyricsLines.some(function (l) { return !l.fallback; });
  if (!hasReal) {
    if (tiltLastLineIdx !== -98) {
      tiltLastLineIdx = -98;
      swapTiltLine(null);
      tiltVisibleSegIndex = -2;
    }
    return;
  }
  var nowTime = tiltNowLyricTime();
  var idx;
  try {
    idx = findStageLyricIndexAtTime(nowTime);
  } catch (e) { return; }
  if (idx < 0) idx = -1;

  if (idx !== tiltLastLineIdx) {
    tiltLastLineIdx = idx;
    tiltVisibleSegIndex = -2;                 /* 换行后强制刷新段落显隐 */
    var line = (idx >= 0 && idx < lyricsLines.length) ? lyricsLines[idx] : null;
    swapTiltLine(line);
    return;                                   /* 切行帧不推进，下一帧开始 */
  }

  var cur = tiltCur;
  if (!cur) return;

  /* 段落时间序 reveal：start 前 0.25s 点亮，行外窗口整体隐藏 */
  var target = -1;
  if (nowTime >= cur.lineT - 0.1 && nowTime <= cur.lineEnd) {
    for (var i = 0; i < cur.segs.length; i++) {
      if (nowTime >= cur.segs[i].start - 0.25) target = i;
    }
  }
  if (target !== tiltVisibleSegIndex) {
    tiltVisibleSegIndex = target;
    for (var s = 0; s < cur.segs.length; s++) {
      var want = s <= target;
      if (cur.segs[s].visible !== want) {
        cur.segs[s].visible = want;
        cur.segs[s].el.classList.toggle('visible', want);
      }
    }
  }

  /* 逐字脉冲：未显示段 opacity=0 且时序在未来（强度恒 0），跳过省字符串 */
  for (var si = 0; si <= target && si < cur.segs.length; si++) {
    var seg = cur.segs[si];
    var amp = seg.isTilt ? 0.18 : 0.15;
    var chars = seg.chars;
    for (var c = 0; c < chars.length; c++) {
      var ch = chars[c];
      var intensity = tiltCharPulseIntensity(nowTime, ch.start, ch.end);
      var scale = 1 + intensity * amp;
      /* 量化 3 位：稳定后（余辉 0.25 常亮）不再写字符串 */
      var q = Math.round(scale * 1000);
      if (q !== ch.lastScale) {
        ch.lastScale = q;
        ch.inner.style.transform = 'scale(' + (q / 1000).toFixed(3) + ')';
      }
    }
  }
}

/* 歌词数据变化轮询（lyricsLines 是普通数组无事件，流光/涂鸦同款范式） */
function watchTiltLyricsChange() {
  var token = ++tiltLyricsObserverToken;
  var lastLen = -1;
  function check() {
    if (token !== tiltLyricsObserverToken || !tiltMode) return;
    var len = (lyricsLines && lyricsLines.length) || 0;
    if (len !== lastLen) {
      lastLen = len;
      tiltLastLineIdx = -99;   /* 强制重渲染当前行 */
    }
    setTimeout(check, 600);
  }
  check();
}

function startTiltLoop() {
  stopTiltLoop();
  var lastTick = 0;
  function frame(now) {
    if (!tiltMode) return;
    if (now - lastTick > 33) {
      lastTick = now;
      checkTiltFontChange();
      tickTiltLyrics();
    }
    tiltRafId = requestAnimationFrame(frame);
  }
  tiltRafId = requestAnimationFrame(frame);
  watchTiltLyricsChange();
}

function stopTiltLoop() {
  if (tiltRafId) {
    cancelAnimationFrame(tiltRafId);
    tiltRafId = 0;
  }
  tiltLyricsObserverToken++;
}

/* ---------- resize：可用宽度与字号变了 → 强制重建布局 ---------- */
function onTiltResize() {
  if (!tiltMode) return;
  tiltLastLineIdx = -99;
}

/* ---------- 启动绑定 ---------- */
function initTilt() {
  applyTiltMode(tiltMode, { save: false });
  window.addEventListener('resize', function () {
    clearTimeout(tiltResizeTimer);
    tiltResizeTimer = setTimeout(onTiltResize, 180);
  });
}

/* 延迟到 DOM 就绪后初始化（本模块在 index-loader 末尾加载，DOM 已就绪） */
scheduleUiWarmTask ? scheduleUiWarmTask(initTilt, 300) : setTimeout(initTilt, 300);
