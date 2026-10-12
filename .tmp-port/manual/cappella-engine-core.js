/* =========================================================================
   cappella 渲染核心 —— Folia cappella VisualizerCappella.tsx 的无构建 DOM 忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     src/components/visualizer/cappella/VisualizerCappella.tsx（渲染核心，行号对齐）
     src/components/visualizer/cappella/avatarImages.ts（头像源解析，:43-102）
     src/components/visualizer/cappella/emoImages.ts（表情包清单，import.meta.glob
       的 Vite 专属形态 → MineRadio 静态资源清单等价落地）
     src/components/visualizer/runtime.ts（:35-101 纯函数等价）
     src/components/visualizer/VisualizerSubtitleOverlay.tsx（:20-215 底部字幕）
     src/utils/appPlaybackHelpers.ts:21（findLatestActiveLineIndex —— 宿主
       currentLineIndex 权威语义，与 classic 引擎同款）
     src/utils/lyrics/alternateText.ts（hasReadableText 语义 → 单 translation 轨）

   结构对应（React/framer → 无构建 DOM + mini-motion）：
     VisualizerShell            → cp-shell（fontFamily/fontWeight inline，:128-134）
     主容器 + AnimatePresence    → cp-main/cp-list（:1669-1690）+ popLayout 等价：
                                  exit 行 absolute 化脱离布局流 + 其余行 FLIP 上移
     CappellaMessageRow         → cp-row（row 进出场）> cp-in（opacity/scale/marginTop
                                  spring avatarSpring）> 头像 + AnimatedBubbleFrame
     AnimatedBubbleFrame        → cp-frame（width/height tween 0.2 easeOut）> cp-inner
     ActiveCappellaText         → 逐字符 <span>，CSS cappella-char-fade（:1137-1148）
     CappellaBubbleGlow         → cp-glow（200% 宽流光 translateX 0→-50% linear infinite）
     CappellaTimestamp          → cp-ts（opacity 0→0.62 / y 4→0，0.18s easeOut）
     emo 行                     → cp-emo（尺寸 tween emoSizeTransitionDuration）+
                                  cp-emo-enter（opacity/scale emoEnterScale→1）+
                                  img cappella-emo-wiggle（:1430-1453）
     useMotionValueEvent        → currentTime MV 每帧轮询派发 change
     VisualizerSubtitleOverlay  → cp-sub（翻译行 + 下一句预览，classic 同款范式）

   气泡尺寸主路径 = Folia 原版 pretext 量测：measureBubbleText（:861-897，
   prepareWithSegments + layoutWithLines）逐前缀建 sizes 表（getOrBuildBubbleMetrics
   :930-1003），reveal 驱动逐字浮现、bubbleTargetTimes 驱动气泡提前 0.2s 横向扩展。
   MineRadio 宿主差异（数据源在桥）：animationIntensity 固定 normal（三档配置
   全量同构保留，theme.animationIntensity 驱动）；wordColors/自定义头像表情包
   不引入（DEFAULT_CAPPELLA_TUNING：showEmoMessages=true/builtin/cover 宫格）。
   头像与表情图片来自 Folia 内置资源（AI 生成，上游声明可自由分发，
   见 public/assets/cappella/README.md）。
   ========================================================================= */

/* ---------- 常量（VisualizerCappella.tsx:65-79 原值） ---------- */
var CAPPELLA_SHORT_LINE_CHAR_LIMIT = 12;
var CAPPELLA_MAX_VISIBLE_MESSAGES = 20;
var CAPPELLA_AVATAR_GRID_SIZE = 3;
var CAPPELLA_LEFT_AVATAR_INDICES = [0, 3, 6, 1, 4];
var CAPPELLA_RIGHT_AVATAR_INDEX = 8;
var CAPPELLA_PREHEAT_WINDOW = { minLead: 0.18, maxLead: 1.1 };
var CAPPELLA_LAYOUT_CACHE_LIMIT = 32;
var CAPPELLA_WIDTH_LOOKAHEAD_SECONDS = 0.2;
var CAPPELLA_BUBBLE_FONT_WEIGHT = 400;
var CAPPELLA_INTERLUDE_TEXT = '......';
var CAPPELLA_DEFAULT_CHAR_FADE_MS = 220;
var CAPPELLA_MIN_CHAR_FADE_MS = 40;

/* ---------- 纯工具（:149-172） ---------- */

function cappellaHashString(input) {
  var hash = 2166136261;
  input = String(input);
  for (var index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function cappellaSeededUnit() {
  var parts = [];
  for (var i = 0; i < arguments.length; i++) parts.push(arguments[i]);
  return cappellaHashString(parts.join('|')) / 0xffffffff;
}

function cappellaCountCompactChars(text) {
  return Array.from(String(text == null ? '' : text).replace(/\s/g, '')).length;
}

function cappellaPickStableEmoImage(imagePool, seedParts) {
  if (imagePool.length === 0) return null;
  var index = Math.floor(cappellaSeededUnit.apply(null, seedParts) * imagePool.length) % imagePool.length;
  return imagePool[index] || imagePool[0];
}

function cappellaGetEffectiveRenderEndTime(line, nextLine) {
  return Math.min(CM_getLineRenderEndTime(line), nextLine ? nextLine.startTime : Number.POSITIVE_INFINITY);
}

/* ---------- 三档强度配置（:174-301 全量原值） ---------- */

function cappellaGetIntensityConfig(animationIntensity) {
  if (animationIntensity === 'calm') {
    return {
      sequencing: {
        forceRightEveryLines: 7,
        shortLineCarryChance: 0.92,
        sideSequence: ['left', 'left', 'right', 'left', 'right'],
        sideFlipChance: 0.08,
        randomEmoChance: 0,
        minLinesBetweenRandomEmos: 6,
        maxRandomEmoRatio: 0
      },
      motion: {
        rowEnterY: 14, rowEnterScale: 0.992, rowEnterDuration: 0.28,
        rowExitY: -10, rowExitScale: 0.985, rowExitDuration: 0.22,
        avatarSpring: { stiffness: 280, damping: 30, mass: 0.78 },
        activeScale: 1.07, passedScale: 0.96, passedOpacity: 0.88,
        activeFontMultiplier: 1.22, inactiveFontMultiplier: 0.96,
        activePaddingX: 18, activePaddingY: 14, inactivePaddingX: 16, inactivePaddingY: 12,
        activeMinHeight: 58, inactiveMinHeight: 44,
        glowOpacity: 0.26, glowDuration: 2.2, glowRightAlpha: 0.26, glowLeftAlpha: 0.14,
        activeShadowAlpha: 0.24,
        emoActiveSize: 132, emoInactiveSize: 96, emoEnterScale: 0.74, emoSizeTransitionDuration: 0.22
      }
    };
  }

  if (animationIntensity === 'chaotic') {
    return {
      sequencing: {
        forceRightEveryLines: 3,
        shortLineCarryChance: 0.36,
        sideSequence: ['left', 'right', 'right', 'left', 'right', 'left'],
        sideFlipChance: 0.42,
        randomEmoChance: 0.22,
        minLinesBetweenRandomEmos: 2,
        maxRandomEmoRatio: 1 / 6
      },
      motion: {
        rowEnterY: 30, rowEnterScale: 0.968, rowEnterDuration: 0.38,
        rowExitY: -26, rowExitScale: 0.94, rowExitDuration: 0.28,
        avatarSpring: { stiffness: 360, damping: 24, mass: 0.68 },
        activeScale: 1.18, passedScale: 0.88, passedOpacity: 0.76,
        activeFontMultiplier: 1.4, inactiveFontMultiplier: 0.92,
        activePaddingX: 22, activePaddingY: 17, inactivePaddingX: 15, inactivePaddingY: 11,
        activeMinHeight: 68, inactiveMinHeight: 42,
        glowOpacity: 0.52, glowDuration: 1.35, glowRightAlpha: 0.42, glowLeftAlpha: 0.24,
        activeShadowAlpha: 0.42,
        emoActiveSize: 178, emoInactiveSize: 122, emoEnterScale: 0.54, emoSizeTransitionDuration: 0.28
      }
    };
  }

  return {
    sequencing: {
      forceRightEveryLines: 5,
      shortLineCarryChance: 0.68,
      sideSequence: ['left', 'right', 'left', 'right', 'right'],
      sideFlipChance: 0.18,
      randomEmoChance: 0.1,
      minLinesBetweenRandomEmos: 3,
      maxRandomEmoRatio: 1 / 8
    },
    motion: {
      rowEnterY: 22, rowEnterScale: 0.98, rowEnterDuration: 0.32,
      rowExitY: -18, rowExitScale: 0.965, rowExitDuration: 0.24,
      avatarSpring: { stiffness: 340, damping: 28, mass: 0.72 },
      activeScale: 1.12, passedScale: 0.92, passedOpacity: 0.82,
      activeFontMultiplier: 1.34, inactiveFontMultiplier: 0.94,
      activePaddingX: 20, activePaddingY: 16, inactivePaddingX: 16, inactivePaddingY: 12,
      activeMinHeight: 64, inactiveMinHeight: 44,
      glowOpacity: 0.4, glowDuration: 1.8, glowRightAlpha: 0.34, glowLeftAlpha: 0.18,
      activeShadowAlpha: 0.34,
      emoActiveSize: 160, emoInactiveSize: 110, emoEnterScale: 0.6, emoSizeTransitionDuration: 0.25
    }
  };
}

/* DEFAULT_CAPPELLA_TUNING（types.ts:482-486 原值） */
var CAPPELLA_DEFAULT_TUNING = {
  showEmoMessages: true,
  emojiPackSource: 'builtin',
  avatarSource: 'cover'
};

function cappellaResolveTuning(tuning, customEmojiCount, customAvatarCount) {
  var t = tuning || {};
  return {
    showEmoMessages: (t.showEmoMessages != null) ? t.showEmoMessages : CAPPELLA_DEFAULT_TUNING.showEmoMessages,
    emojiPackSource: (t.emojiPackSource === 'custom' && customEmojiCount > 0) ? 'custom' : CAPPELLA_DEFAULT_TUNING.emojiPackSource,
    avatarSource: (t.avatarSource === 'builtin' || t.avatarSource === 'color' || t.avatarSource === 'cover' || (t.avatarSource === 'custom' && customAvatarCount > 0))
      ? t.avatarSource
      : CAPPELLA_DEFAULT_TUNING.avatarSource
  };
}

/* ---------- 消息序列（:304-496 buildCappellaMessages 全逻辑同构） ---------- */

function cappellaBuildMessages(lines, titleText, config, tuning, emoImagePool, forcePreviewEmo, agentSenderResolver) {
  var messages = [{
    id: 'title',
    kind: 'title',
    text: titleText,
    side: 'right',
    avatarIndex: CAPPELLA_AVATAR_GRID_SIZE * CAPPELLA_AVATAR_GRID_SIZE - 1
  }];

  var showEmoMessages = tuning.showEmoMessages && emoImagePool.length > 0;

  if (lines.length === 0) {
    var fallbackEmo = showEmoMessages
      ? cappellaPickStableEmoImage(emoImagePool, ['no-lyrics', titleText, config.sequencing.forceRightEveryLines])
      : null;
    if (fallbackEmo && showEmoMessages) {
      messages.push({
        id: 'emo-no-lyrics',
        kind: 'emo',
        line: { words: [], startTime: 0, endTime: 0, fullText: CAPPELLA_INTERLUDE_TEXT },
        lineIndex: 0,
        side: 'right',
        avatarIndex: CAPPELLA_AVATAR_GRID_SIZE * CAPPELLA_AVATAR_GRID_SIZE - 1,
        emoImageUrl: fallbackEmo.url,
        activationStartTime: 0,
        activationEndTime: 999999
      });
    }
    return messages;
  }

  var sideSequenceCursor = 0;
  var nextLeftAvatarCursor = 0;
  var lastLyricSender = null;
  var lyricMessagesSinceRandomEmo = Number.POSITIVE_INFINITY;
  var randomEmoCount = 0;
  var randomEmoCap = Math.floor(lines.length * config.sequencing.maxRandomEmoRatio);

  lines.forEach(function (line, lineIndex) {
    var nextLine = lines[lineIndex + 1];
    var isShortLine = cappellaCountCompactChars(line.fullText) <= CAPPELLA_SHORT_LINE_CHAR_LIMIT;
    var agentSender = agentSenderResolver ? agentSenderResolver.resolve(line) : null;
    var shouldForceRight = !agentSender && (lineIndex + 1) % config.sequencing.forceRightEveryLines === 0;
    var shouldCarrySender = Boolean(!agentSender
      && isShortLine
      && lastLyricSender
      && cappellaSeededUnit('carry', line.startTime, lineIndex) <= config.sequencing.shortLineCarryChance);
    var baseSide = config.sequencing.sideSequence[sideSequenceCursor % config.sequencing.sideSequence.length];
    var shouldFlipSide = !shouldForceRight
      && cappellaSeededUnit('flip', line.startTime, lineIndex) < config.sequencing.sideFlipChance;
    var resolvedSide = shouldFlipSide ? (baseSide === 'left' ? 'right' : 'left') : baseSide;
    var sender;
    if (agentSender) {
      sender = agentSender;
    } else if (shouldForceRight) {
      sender = { side: 'right', avatarIndex: CAPPELLA_RIGHT_AVATAR_INDEX };
    } else if (shouldCarrySender && lastLyricSender) {
      sender = lastLyricSender;
    } else {
      sender = {
        side: resolvedSide,
        avatarIndex: resolvedSide === 'left' ? nextLeftAvatarCursor : CAPPELLA_RIGHT_AVATAR_INDEX
      };
    }

    var isInterlude = line.fullText === CAPPELLA_INTERLUDE_TEXT;
    var emoImage = isInterlude && showEmoMessages
      ? cappellaPickStableEmoImage(emoImagePool, ['interlude', line.startTime, lineIndex])
      : null;
    var effectiveRenderEndTime = cappellaGetEffectiveRenderEndTime(line, nextLine);
    if (isInterlude && emoImage && showEmoMessages) {
      messages.push({
        id: 'emo-' + line.startTime + '-' + lineIndex,
        kind: 'emo',
        line: line, lineIndex: lineIndex,
        side: sender.side, avatarIndex: sender.avatarIndex,
        emoImageUrl: emoImage.url,
        activationStartTime: line.startTime,
        activationEndTime: Math.max(line.startTime + 0.12, effectiveRenderEndTime)
      });
    } else {
      messages.push({
        id: 'line-' + line.startTime + '-' + lineIndex,
        kind: 'lyric',
        line: line, lineIndex: lineIndex,
        side: sender.side, avatarIndex: sender.avatarIndex
      });
    }
    lyricMessagesSinceRandomEmo += 1;

    var renderHints = CM_getLineRenderHints(line);
    var canAppendRandomEmo = !isInterlude
      && showEmoMessages
      && config.sequencing.randomEmoChance > 0
      && randomEmoCount < randomEmoCap
      && lyricMessagesSinceRandomEmo >= config.sequencing.minLinesBetweenRandomEmos
      && renderHints && renderHints.timingClass === 'normal';

    if (canAppendRandomEmo) {
      var score = cappellaSeededUnit('random-emo', line.startTime, line.endTime, lineIndex, config.sequencing.randomEmoChance);
      if (score < config.sequencing.randomEmoChance) {
        var reactionImage = cappellaPickStableEmoImage(emoImagePool, ['reaction', line.startTime, line.endTime, lineIndex, sender.side]);
        if (reactionImage) {
          messages.push({
            id: 'emo-reaction-' + line.startTime + '-' + lineIndex,
            kind: 'emo',
            line: line, lineIndex: lineIndex,
            side: sender.side, avatarIndex: sender.avatarIndex,
            emoImageUrl: reactionImage.url,
            activationStartTime: line.endTime,
            activationEndTime: Math.max(line.endTime + 0.08, effectiveRenderEndTime)
          });
          randomEmoCount += 1;
          lyricMessagesSinceRandomEmo = 0;
        }
      }
    }

    if (agentSender) {
      lastLyricSender = sender;
    } else if (shouldForceRight) {
      sideSequenceCursor = 0;
      lastLyricSender = null;
    } else if (!shouldCarrySender) {
      if (sender.side === 'left') nextLeftAvatarCursor += 1;
      sideSequenceCursor += 1;
      lastLyricSender = sender;
    } else {
      lastLyricSender = sender;
    }
  });

  if (forcePreviewEmo && showEmoMessages && !messages.some(function (m) { return m.kind === 'emo'; })) {
    var previewLine = lines[0] || { words: [], startTime: 0, endTime: 0, fullText: CAPPELLA_INTERLUDE_TEXT };
    var previewEmo = cappellaPickStableEmoImage(emoImagePool, ['preview-emo', titleText, lines.length]);
    if (previewEmo) {
      messages.splice(1, 0, {
        id: 'emo-preview',
        kind: 'emo',
        line: previewLine, lineIndex: -1,
        side: 'right', avatarIndex: CAPPELLA_RIGHT_AVATAR_INDEX,
        emoImageUrl: previewEmo.url,
        activationStartTime: 0,
        activationEndTime: Number.POSITIVE_INFINITY
      });
    }
  }

  return messages;
}

/* ---------- 逐字符 reveal 时间轴（:498-665） ---------- */

function cappellaGetLineCharacters(line) {
  return CM_splitLyricGraphemes(line.fullText);
}

/* getWordTextRanges（:500-517） */
function cappellaGetWordTextRanges(line) {
  var ranges = [];
  var searchCursor = 0;
  line.words.forEach(function (word) {
    var start = line.fullText.indexOf(word.text, searchCursor);
    if (start < 0) {
      ranges.push(null);
      return;
    }
    var end = start + word.text.length;
    ranges.push({ start: start, end: end });
    searchCursor = end;
  });
  return ranges;
}

/* buildCharacterRevealTimes（:522-576） */
function cappellaBuildCharacterRevealTimes(line, characters) {
  var revealTimes = characters.map(function () { return Number.POSITIVE_INFINITY; });
  var lineTimeline = CM_buildLineGraphemeTimeline(line);
  if (lineTimeline.length === characters.length) {
    lineTimeline.forEach(function (timing, index) {
      revealTimes[index] = timing.startTime;
    });
    return revealTimes;
  }

  var ranges = cappellaGetWordTextRanges(line);
  var previousWordEndCharacterIndex = 0;
  var lastResolvedRevealTime = line.startTime;
  var hasResolvedRevealTime = false;

  line.words.forEach(function (word, index) {
    var range = ranges[index];
    if (!range) return;

    var startCharacterIndex = CM_splitLyricGraphemes(line.fullText.slice(0, range.start)).length;
    var endCharacterIndex = CM_splitLyricGraphemes(line.fullText.slice(0, range.end)).length;
    var wordTimings = CM_buildWordGraphemeTimings(word);

    /* 两个带时值词之间的字符（空格/粘连标点）随下一个词揭示（:547-551） */
    for (var characterIndex = previousWordEndCharacterIndex; characterIndex < startCharacterIndex; characterIndex += 1) {
      revealTimes[characterIndex] = word.startTime;
    }

    wordTimings.forEach(function (timing, characterIndex) {
      var targetIndex = startCharacterIndex + characterIndex;
      if (targetIndex >= revealTimes.length) return;
      revealTimes[targetIndex] = timing.startTime;
      lastResolvedRevealTime = Math.max(lastResolvedRevealTime, revealTimes[targetIndex]);
      hasResolvedRevealTime = true;
    });

    previousWordEndCharacterIndex = endCharacterIndex;
  });

  /* 尾部未匹配字符归入上一时值字符（:567-573） */
  var trailingRevealTime = hasResolvedRevealTime ? lastResolvedRevealTime : line.endTime;
  for (var ci = previousWordEndCharacterIndex; ci < revealTimes.length; ci += 1) {
    revealTimes[ci] = trailingRevealTime;
  }

  return revealTimes;
}

/* getCharacterCountAtTime（:580-594）——revealTimes 单调 → 二分 */
function cappellaGetCharacterCountAtTime(revealTimes, currentTime) {
  var low = 0;
  var high = revealTimes.length;
  while (low < high) {
    var mid = Math.floor((low + high) / 2);
    if (revealTimes[mid] <= currentTime) low = mid + 1;
    else high = mid;
  }
  return low;
}

function cappellaGetBubbleTargetCharacterCount(metrics, currentTime) {
  return cappellaGetCharacterCountAtTime(metrics.bubbleTargetTimes, currentTime);
}

function cappellaGetTimestampReadyTime(metrics, line) {
  return metrics ? metrics.timestampReadyTime : line.endTime;
}

/* buildCharacterFadeDurationsMs（:604-639） */
function cappellaBuildCharacterFadeDurationsMs(line, characters) {
  var fadeDurationsMs = characters.map(function () { return CAPPELLA_DEFAULT_CHAR_FADE_MS; });
  var lineTimeline = CM_buildLineGraphemeTimeline(line);
  if (lineTimeline.length === characters.length) {
    lineTimeline.forEach(function (timing, index) {
      fadeDurationsMs[index] = Math.max((timing.endTime - timing.startTime) * 1000, CAPPELLA_MIN_CHAR_FADE_MS);
    });
    return fadeDurationsMs;
  }

  var ranges = cappellaGetWordTextRanges(line);
  line.words.forEach(function (word, index) {
    var range = ranges[index];
    if (!range) return;
    var startCharacterIndex = CM_splitLyricGraphemes(line.fullText.slice(0, range.start)).length;
    var wordTimings = CM_buildWordGraphemeTimings(word);
    for (var characterIndex = 0; characterIndex < wordTimings.length; characterIndex += 1) {
      var targetIndex = startCharacterIndex + characterIndex;
      if (targetIndex >= fadeDurationsMs.length) break;
      var timing = wordTimings[characterIndex];
      fadeDurationsMs[targetIndex] = timing
        ? Math.max((timing.endTime - timing.startTime) * 1000, CAPPELLA_MIN_CHAR_FADE_MS)
        : CAPPELLA_DEFAULT_CHAR_FADE_MS;
    }
  });
  return fadeDurationsMs;
}

/* getTimestampReadyTimeFromMetrics（:641-657） */
function cappellaGetTimestampReadyTimeFromMetrics(line, revealTimes, fadeDurationsMs) {
  if (revealTimes.length === 0) return line.endTime;
  return revealTimes.reduce(function (latest, time, index) {
    if (!Number.isFinite(time)) return latest;
    return Math.max(latest, time + (fadeDurationsMs[index] != null ? fadeDurationsMs[index] : CAPPELLA_DEFAULT_CHAR_FADE_MS) / 1000);
  }, line.startTime);
}

/* getCharacterRevealPlan（:660-665） */
function cappellaGetCharacterRevealPlan(line) {
  var characters = Array.from(line.fullText);
  var fadeDurationsMs = cappellaBuildCharacterFadeDurationsMs(line, characters);
  return { characters: characters, fadeDurationsMs: fadeDurationsMs };
}

/* ---------- 头像宫格（:688-697 getAvatarPosition） ---------- */

function cappellaGetAvatarPosition(avatarIndex) {
  var safeIndex = ((avatarIndex % 9) + 9) % 9;
  var col = safeIndex % CAPPELLA_AVATAR_GRID_SIZE;
  var row = Math.floor(safeIndex / CAPPELLA_AVATAR_GRID_SIZE);
  return {
    backgroundPosition: (col * 50) + '% ' + (row * 50) + '%',
    backgroundSize: (CAPPELLA_AVATAR_GRID_SIZE * 100) + '% ' + (CAPPELLA_AVATAR_GRID_SIZE * 100) + '%'
  };
}

/* ---------- 头像源解析（avatarImages.ts:43-102 同构；
   import.meta.glob 的 eager 清单 → 静态文件名列表 localeCompare 排序等价） ---------- */

function cappellaBuiltinAvatarImages() {
  var names = ['avatar10.png', 'avatar11.png', 'avatar12.png', 'avatar13.png', 'avatar14.png',
    'avatar15.png', 'avatar16.png', 'avatar17.png', 'avatar2.png', 'avatar3.png', 'avatar4.png',
    'avatar5.png', 'avatar6.png', 'avatar8.png', 'avatar9.png'];
  return names.map(function (filename) {
    return {
      id: 'builtin-avatar-' + filename.replace(/\.[^.]+$/, ''),
      name: filename.replace(/\.[^.]+$/, ''),
      url: 'assets/cappella/avatar/' + filename
    };
  });
}

function cappellaGetSeededIndex(seed, side, length) {
  return cappellaHashString(seed + '|' + side + '|' + length) % length;
}

/* pickStableBuiltinAvatarImage（avatarImages.ts:55-78） */
function cappellaPickStableBuiltinAvatarImage(avatars, avatarIndex, side, seed) {
  if (avatars.length === 0) return null;
  if (seed == null) seed = 'cappella';
  var rightAvatarIndex = cappellaGetSeededIndex(seed, 'right', avatars.length);
  if (side === 'right') return avatars[rightAvatarIndex] || null;

  var leftAvatarPool = avatars.filter(function (_, index) { return index !== rightAvatarIndex; });
  if (leftAvatarPool.length === 0) return avatars[rightAvatarIndex] || null;
  var leftSeedOffset = cappellaGetSeededIndex(seed, 'left', leftAvatarPool.length);
  var resolvedLeftIndex = Math.abs(Math.trunc(avatarIndex + leftSeedOffset)) % leftAvatarPool.length;
  return leftAvatarPool[resolvedLeftIndex] || null;
}

/* resolveCappellaAvatarUrl（avatarImages.ts:80-102；custom 池宿主不引入，恒空） */
function cappellaResolveAvatarUrl(opts) {
  var avatarSource = opts.avatarSource;
  var coverUrl = opts.coverUrl;
  var avatarIndex = opts.avatarIndex;
  var side = opts.side;
  var seed = opts.seed;
  var avatars = opts.avatars || cappellaBuiltinAvatarImages();
  var customAvatarImages = opts.customAvatarImages || [];

  if (avatarSource === 'color') return null;
  if (avatarSource === 'cover' && coverUrl) return coverUrl;
  if (avatarSource === 'custom' && customAvatarImages.length > 0) {
    var picked = cappellaPickStableBuiltinAvatarImage(customAvatarImages, avatarIndex, side, seed);
    return picked ? picked.url : null;
  }
  var image = cappellaPickStableBuiltinAvatarImage(avatars, avatarIndex, side, seed);
  return image ? image.url : null;
}

/* builtinEmoImages（emoImages.ts:12-22 等价，路径指 MineRadio 拷贝） */
function cappellaBuiltinEmoImages() {
  var names = ['happy1.png', 'love1.png', 'normal1.png', 'sleepy1.png', 'sleepy2.png',
    'sleepy3.png', 'vibe1.png', 'vibe2.png', 'vibe3.png'];
  return names.map(function (filename) {
    return {
      id: 'builtin-' + filename.replace(/\.[^.]+$/, ''),
      url: 'assets/cappella/emo/' + filename,
      name: filename.replace(/\.[^.]+$/, '')
    };
  });
}

/* ---------- 消息状态/配色/时间戳（:816-859） ---------- */

function cappellaGetTimedMessageState(message, currentTime, currentLineIndex) {
  if (message.kind === 'emo') {
    return {
      isActive: currentTime >= message.activationStartTime && currentTime < message.activationEndTime,
      isPassed: currentTime >= message.activationEndTime
    };
  }
  return {
    isActive: message.lineIndex === currentLineIndex,
    isPassed: message.lineIndex < currentLineIndex
  };
}

/* getBubbleColors（:830-847 Folia 原版直译） */
function cappellaGetBubbleColors(message, theme) {
  if (message.side === 'right') {
    return {
      backgroundColor: CM_mixColors(theme.accentColor, theme.primaryColor, 0.18, 0.94),
      borderColor: CM_mixColors(theme.accentColor, theme.primaryColor, 0.34, 0.3),
      textColor: theme.backgroundColor
    };
  }

  var avatarTone = (message.avatarIndex % (CAPPELLA_AVATAR_GRID_SIZE * CAPPELLA_AVATAR_GRID_SIZE)) / (CAPPELLA_AVATAR_GRID_SIZE * CAPPELLA_AVATAR_GRID_SIZE - 1);
  var accentMix = 0.18 + avatarTone * 0.62;

  return {
    backgroundColor: CM_mixColors(theme.secondaryColor, theme.accentColor, accentMix, 1),
    borderColor: CM_mixColors(theme.secondaryColor, theme.accentColor, Math.min(accentMix + 0.18, 1), 0.26),
    textColor: theme.primaryColor
  };
}

/* formatTimestamp（:849-859） */
function cappellaFormatTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  var totalSeconds = Math.max(0, Math.floor(seconds));
  var minutes = Math.floor(totalSeconds / 60);
  var remainingSeconds = totalSeconds % 60;
  return minutes + ':' + String(remainingSeconds).padStart(2, '0');
}

/* ---------- pretext 气泡量测（:861-897 measureBubbleText；
   prepareWithSegments + layoutWithLines 与 Folia 同 API 同参。
   pretext 缺失时的 canvas 量宽仅作兜底（主路径恒为 pretext bundle）。 ---------- */

var cappellaMeasureCtx = null;
function cappellaMeasureTextFallback(text, fontSpec) {
  if (typeof document === 'undefined') return text.length * 16;
  if (!cappellaMeasureCtx) {
    var canvas = document.createElement('canvas');
    cappellaMeasureCtx = canvas.getContext('2d');
  }
  if (!cappellaMeasureCtx) return text.length * 16;
  cappellaMeasureCtx.font = fontSpec;
  return cappellaMeasureCtx.measureText(text).width;
}

function cappellaMeasureBubbleText(opts) {
  var text = opts.text;
  var theme = opts.theme;
  var fontSize = opts.fontSize;
  var lineHeightPx = opts.lineHeightPx;
  var maxTextWidth = opts.maxTextWidth;
  var paddingX = opts.paddingX;
  var paddingY = opts.paddingY;

  var bubbleBorderWidth = 1;
  var safeText = text || ' ';
  var fontSpec = CM_resolveThemeFontWeight(theme, CAPPELLA_BUBBLE_FONT_WEIGHT) + ' ' + fontSize + 'px ' + CM_resolveThemeFontStack(theme);
  var textWidth = fontSize;
  var lineCount = 1;
  if (typeof pretext !== 'undefined' && pretext && typeof pretext.prepareWithSegments === 'function' && typeof pretext.layoutWithLines === 'function') {
    var prepared = pretext.prepareWithSegments(safeText, fontSpec, { whiteSpace: 'pre-wrap' });
    var layout = pretext.layoutWithLines(prepared, Math.max(1, maxTextWidth), Math.round(lineHeightPx));
    for (var i = 0; i < layout.lines.length; i++) {
      if (layout.lines[i].width > textWidth) textWidth = layout.lines[i].width;
    }
    lineCount = layout.lines.length;
  } else {
    /* 兜底：canvas 量单行宽 + 手工贪心换行（与 layoutWithLines 同构的保守近似） */
    var words = safeText.split(/(\s+)/).filter(function (w) { return w.length; });
    var cur = 0, lines = 1;
    for (var w = 0; w < words.length; w++) {
      var ww = cappellaMeasureTextFallback(words[w], fontSpec);
      if (cur + ww > maxTextWidth && cur > 0) { lines += 1; cur = ww; }
      else cur += ww;
    }
    textWidth = Math.min(cur, maxTextWidth);
    lineCount = lines;
  }
  var textHeight = Math.max(lineCount, 1) * lineHeightPx;

  return {
    width: Math.ceil(
      Math.min(textWidth, maxTextWidth)
      + paddingX * 2
      + bubbleBorderWidth * 2
    ),
    height: Math.ceil(textHeight + paddingY * 2 + bubbleBorderWidth * 2)
  };
}

/* ---------- 度量缓存（:899-1003 getBubbleMetricsCacheKey/getOrBuildBubbleMetrics） ---------- */

function cappellaGetBubbleMetricsCacheKey(o) {
  return [
    o.line.startTime,
    o.line.endTime,
    o.line.words.length,
    o.theme.name,
    CM_resolveThemeFontStack(o.theme),
    CM_resolveThemeFontWeight(o.theme, CAPPELLA_BUBBLE_FONT_WEIGHT),
    o.fontSize.toFixed(3),
    o.lineHeightPx.toFixed(3),
    o.maxTextWidth,
    o.paddingX,
    o.paddingY
  ].join('|');
}

/* 每行全部前缀一次性量宽：播放期 O(1) 查表（:929-1003 原注释语义） */
function cappellaGetOrBuildBubbleMetrics(cache, o) {
  var cacheKey = cappellaGetBubbleMetricsCacheKey(o);
  var cached = cache.get(cacheKey);
  if (cached) {
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);
    return cached;
  }

  var line = o.line;
  var characters = cappellaGetLineCharacters(line);
  var revealTimes = cappellaBuildCharacterRevealTimes(line, characters);
  var fadeDurationsMs = cappellaBuildCharacterFadeDurationsMs(line, characters);
  var timestampReadyTime = cappellaGetTimestampReadyTimeFromMetrics(line, revealTimes, fadeDurationsMs);
  var bubbleTargetTimes = revealTimes.map(function (time) { return time - CAPPELLA_WIDTH_LOOKAHEAD_SECONDS; });
  var sizes = [];

  for (var visibleCount = 0; visibleCount <= characters.length; visibleCount += 1) {
    var measuredText = characters.slice(0, visibleCount).join('');
    sizes.push(cappellaMeasureBubbleText({
      text: measuredText,
      theme: o.theme,
      fontSize: o.fontSize,
      lineHeightPx: o.lineHeightPx,
      maxTextWidth: o.maxTextWidth,
      paddingX: o.paddingX,
      paddingY: o.paddingY
    }));
  }

  var prepared = { characters: characters, sizes: sizes, revealTimes: revealTimes, bubbleTargetTimes: bubbleTargetTimes, timestampReadyTime: timestampReadyTime };
  cache.set(cacheKey, prepared);

  if (cache.size > CAPPELLA_LAYOUT_CACHE_LIMIT) {
    var oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  return prepared;
}

/* ---------- 可见窗口估算（:702-814） ---------- */

function cappellaGetEstimatedMessageHeight(message, isActive, motionConfig, theme, baseFontSize, maxTextWidth) {
  if (message.kind === 'emo') {
    var imageSize = isActive ? motionConfig.emoActiveSize : motionConfig.emoInactiveSize;
    var emoScaleOverflow = isActive && motionConfig.activeScale > 1
      ? Math.ceil(imageSize * (motionConfig.activeScale - 1))
      : 0;
    return imageSize + emoScaleOverflow + 48 + 12;   /* 图像高 + 缩放上溢 + pt-12(48) + gap-3(12) */
  }

  var fontSize = message.kind === 'title'
    ? baseFontSize
    : baseFontSize * (isActive ? motionConfig.activeFontMultiplier : motionConfig.inactiveFontMultiplier);
  var paddingX = isActive ? motionConfig.activePaddingX : motionConfig.inactivePaddingX;
  var paddingY = isActive ? motionConfig.activePaddingY : motionConfig.inactivePaddingY;
  var lineHeightPx = fontSize * 1.45;
  var measuredHeight = cappellaMeasureBubbleText({
    text: message.kind === 'title' ? message.text : message.line.fullText,
    theme: theme,
    fontSize: fontSize,
    lineHeightPx: lineHeightPx,
    maxTextWidth: maxTextWidth,
    paddingX: paddingX,
    paddingY: paddingY
  }).height;
  var minHeight = Math.max(
    isActive ? motionConfig.activeMinHeight : motionConfig.inactiveMinHeight,
    lineHeightPx + paddingY * 2
  );
  var renderedHeight = Math.max(measuredHeight, minHeight);
  var scaleOverflow = isActive && motionConfig.activeScale > 1
    ? Math.ceil(renderedHeight * (motionConfig.activeScale - 1))
    : 0;

  return renderedHeight + scaleOverflow + 12;   /* 气泡实际高 + 缩放上溢 + gap-3(12) */
}

function cappellaIsTimedMessage(m) {
  return m.kind === 'lyric' || m.kind === 'emo';
}

/* getVisibleMessages（:748-804）——从最新往回累计高度，防底部溢出 */
function cappellaGetVisibleMessages(messages, visibleLineIndex, viewportHeight, currentLineIndex, currentTime, motionConfig, theme, baseFontSize, maxTextWidth) {
  var visible = messages.filter(function (message) {
    if (message.kind === 'title') return true;
    if (message.kind === 'emo') return currentTime >= message.activationStartTime;
    return message.lineIndex <= visibleLineIndex;
  });

  var usableHeight = Math.max(200, viewportHeight - 240);
  var accumulatedHeight = 0;
  var result = [];

  for (var i = visible.length - 1; i >= 0; i--) {
    var message = visible[i];
    var timedData = cappellaIsTimedMessage(message) ? message : null;
    var isActive = timedData ? cappellaGetTimedMessageState(timedData, currentTime, currentLineIndex).isActive : false;
    var estHeight = cappellaGetEstimatedMessageHeight(message, isActive, motionConfig, theme, baseFontSize, maxTextWidth);

    if (accumulatedHeight + estHeight > usableHeight && result.length >= 2) {
      break;
    }

    accumulatedHeight += estHeight;
    result.unshift(message);

    if (result.length >= CAPPELLA_MAX_VISIBLE_MESSAGES) break;
  }

  return result;
}

/* getVisibleLineIndexAtTime（:806-814） */
function cappellaGetVisibleLineIndexAtTime(lines, currentTime) {
  for (var index = lines.length - 1; index >= 0; index--) {
    if (currentTime >= lines[index].startTime) return index;
  }
  return -1;
}

/* findLatestActiveLineIndex（appPlaybackHelpers.ts:21-31）——Folia 宿主
   currentLineIndex 权威语义（classic 引擎同款） */
function cappellaFindLineIndexAtTime(lines, time) {
  for (var index = (lines ? lines.length : 0) - 1; index >= 0; index--) {
    var line = lines[index];
    if (!line || time < line.startTime) continue;
    if (time <= ((line.renderHints && line.renderHints.renderEndTime != null) ? line.renderHints.renderEndTime : line.endTime)) {
      return index;
    }
  }
  return -1;
}

/* ---------- runtime.ts 纯函数等价（:35-101） ---------- */

function cappellaGetRecentCompletedLine(lines, currentLineIndex, currentTime, getLineEndTime) {
  if (currentLineIndex !== -1 || !lines || lines.length === 0) return null;
  for (var i = lines.length - 1; i >= 0; i--) {
    if (currentTime > getLineEndTime(lines[i])) return lines[i];
  }
  return null;
}

function cappellaGetUpcomingLine(lines, currentLineIndex, currentTime) {
  var activeLine = lines[currentLineIndex];
  if (activeLine) return lines[currentLineIndex + 1] || null;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].startTime > currentTime) return lines[i];
  }
  return null;
}

function cappellaGetUpcomingLines(lines, currentLineIndex, count) {
  if (currentLineIndex < 0) return [];
  return lines.slice(currentLineIndex + 1, currentLineIndex + 1 + count);
}

/* shouldPreheatLine（runtime.ts:90-101） */
function cappellaShouldPreheatLine(line, currentTime, win) {
  if (!line) return false;
  var leadTime = line.startTime - currentTime;
  return leadTime >= win.minLead && leadTime <= win.maxLead;
}

/* hasReadableText（VisualizerSubtitleOverlay.tsx:20）——纯标记行永不进字幕 */
function cappellaHasReadableText(text) {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

/* ---------- DOM 工具 ---------- */

function cappellaEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function cappellaEl(tag, className, styleText) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (styleText) el.style.cssText = styleText;
  return el;
}

/* ---------- 引擎实例 ---------- */

/**
 * CappellaCappellaEngine(opts) —— cappella 模式渲染引擎（VisualizerCappella.tsx 的宿主等价）
 * opts: { host, lines, currentTime(MV), theme, coverUrl?, songTitle?, seed?,
 *         lyricsFontScale?, tuning?, showText?, hideTranslationSubtitle?, showSubtitleTranslation? }
 * 返回 { destroy, setLines, setTheme, setFontScale, setTuning, setCover }
 */
function CappellaCappellaEngine(opts) {
  var host = opts.host;
  var lines = opts.lines || [];
  var theme = opts.theme;
  var tuning = cappellaResolveTuning(opts.tuning, 0, 0);
  var lyricsFontScale = opts.lyricsFontScale != null ? opts.lyricsFontScale : 1;
  var showText = opts.showText !== false;
  var hideTranslationSubtitle = !!opts.hideTranslationSubtitle;
  var showSubtitleTranslation = opts.showSubtitleTranslation !== false;
  var coverUrl = opts.coverUrl || null;
  var songTitle = String(opts.songTitle || '').trim() || '未在播放';
  var avatarSeed = opts.seed != null ? opts.seed : songTitle;

  var currentTime = opts.currentTime;
  var lastTime = null;
  var destroyed = false;
  var rafId = 0;

  /* ---------- 壳（VisualizerShell :128-134 等价） ---------- */
  var shell = cappellaEl('div', 'cp-shell');
  shell.style.cssText = 'position:absolute;inset:0;overflow:hidden;font-family:' +
    CM_resolveThemeFontStack(theme) + ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) + ';';

  /* 主容器 padding（:1669 px-4 pb-36 pt-12 sm:px-8 sm:pb-40 sm:pt-16 lg:px-14 lg:pt-20 三档） */
  function mainPadding() {
    var w = (typeof window !== 'undefined' && window.innerWidth) || 1280;
    if (w >= 1024) return '80px 56px 160px';
    if (w >= 640) return '64px 32px 160px';
    return '48px 16px 144px';
  }

  /* 主容器（:1669 relative z-10 flex h-full w-full items-start justify-center
     overflow-visible）+ 消息列（:1670 max-w-4xl gap-3） */
  var main = cappellaEl('div', 'cp-main');
  main.style.cssText = 'position:relative;z-index:10;display:flex;height:100%;width:100%;align-items:flex-start;justify-content:center;overflow:visible;padding:' + mainPadding() + ';pointer-events:none;';
  var list = cappellaEl('div', 'cp-list');
  list.style.cssText = 'position:relative;display:flex;width:100%;max-width:56rem;flex-direction:column;justify-content:flex-start;gap:12px;overflow:visible;';
  main.appendChild(list);
  shell.appendChild(main);

  /* keyframes（:1694-1709 原值注入一次） */
  var styleEl = document.createElement('style');
  styleEl.textContent = '' +
    '@keyframes cappella-char-fade{from{opacity:0}to{opacity:1}}\n' +
    '@keyframes cappella-bubble-glow-pan{from{transform:translateX(0)}to{transform:translateX(-50%)}}\n' +
    '@keyframes cappella-emo-wiggle{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.6deg)}}\n';
  shell.appendChild(styleEl);

  /* 底部字幕（VisualizerSubtitleOverlay :132-215 等价；classic 同款 bottom 基线） */
  var sub = cappellaEl('div', 'cp-sub');
  sub.style.cssText = 'position:absolute;left:0;right:0;bottom:132px;text-align:center;padding:0 16px;z-index:20;pointer-events:none;opacity:0;transform:translateY(20px);';
  shell.appendChild(sub);
  host.appendChild(shell);

  /* ---------- 运行时状态 ---------- */
  var motionConfig = cappellaGetIntensityConfig(theme.animationIntensity).motion;
  var intensityConfig = cappellaGetIntensityConfig(theme.animationIntensity);
  var emoImagePool = cappellaBuiltinEmoImages();
  var builtinAvatars = cappellaBuiltinAvatarImages();
  var metricsCache = new Map();
  var domByKey = {};            /* message.id → row 记录 */
  var messages = [];
  var visibleMessages = [];
  var lastVisibleLineIndex = -2;
  var lastCurrentLineIndex = -2;
  var lastEmoVisibleCount = -1;
  var lastViewportH = 0;
  var subtitleKey = null;
  var exitTimers = [];

  function rebuildMessages() {
    var resolvedTuning = cappellaResolveTuning(tuning, 0, 0);
    messages = cappellaBuildMessages(lines, songTitle, intensityConfig, resolvedTuning, emoImagePool, false, CM_createCappellaAgentSenderResolver(lines, {
      rightAvatarIndex: CAPPELLA_RIGHT_AVATAR_INDEX,
      leftAvatarCount: CAPPELLA_LEFT_AVATAR_INDICES.length
    }));
  }

  function clearExitTimers() {
    for (var i = 0; i < exitTimers.length; i++) clearTimeout(exitTimers[i]);
    exitTimers = [];
  }

  /* ---------- CappellaAvatar（:1005-1037） ---------- */
  function buildAvatar(message) {
    var useAvatarGridCrop = tuning.avatarSource === 'cover' && !!coverUrl;
    var avatarUrl = cappellaResolveAvatarUrl({
      avatarSource: tuning.avatarSource,
      coverUrl: coverUrl,
      avatarIndex: message.avatarIndex,
      side: message.side,
      seed: avatarSeed,
      avatars: builtinAvatars
    });
    var shouldUseGridCrop = useAvatarGridCrop || !avatarUrl;
    var resolvedIndex = shouldUseGridCrop
      ? (message.side === 'right' ? CAPPELLA_RIGHT_AVATAR_INDEX : CAPPELLA_LEFT_AVATAR_INDICES[message.avatarIndex % CAPPELLA_LEFT_AVATAR_INDICES.length])
      : message.avatarIndex;
    var avatarPosition = cappellaGetAvatarPosition(resolvedIndex);

    var el = cappellaEl('div', 'cp-avatar');
    el.style.cssText = 'flex:0 0 auto;width:40px;height:40px;overflow:hidden;border-radius:9999px;border:1px solid rgba(255,255,255,0.24);background-color:' + theme.secondaryColor + ';' +
      'background-image:' + (avatarUrl ? 'url("' + avatarUrl + '")' : 'linear-gradient(135deg, ' + theme.primaryColor + ', ' + theme.accentColor + ')') + ';' +
      'background-clip:padding-box;background-repeat:no-repeat;' +
      'background-position:' + (shouldUseGridCrop ? avatarPosition.backgroundPosition : 'center') + ';' +
      'background-size:' + (shouldUseGridCrop ? avatarPosition.backgroundSize : 'cover') + ';' +
      'box-shadow:0 10px 15px -3px rgba(0,0,0,0.1),0 4px 6px -4px rgba(0,0,0,0.1);' +
      'opacity:0;';
    mmApplyVariant(el, {
      enter: { opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } }
    }, 'enter', null);
    return el;
  }

  /* ---------- CappellaTimestamp（:1053-1074） ---------- */
  function buildTimestamp(line, color, bottomPx, isRight) {
    var el = cappellaEl('span', 'cp-ts');
    el.style.cssText = 'position:absolute;pointer-events:none;font-size:11px;font-weight:500;font-variant-numeric:tabular-nums;color:' + color + ';' +
      'bottom:' + bottomPx + 'px;' + (isRight ? 'right:calc(100% + 8px);' : 'left:calc(100% + 8px);') +
      'opacity:0;transform:translateY(4px);white-space:nowrap;display:none;';
    el.textContent = cappellaFormatTimestamp(line.endTime);
    return el;
  }

  function showTimestamp(el) {
    if (el.__visible) return;
    el.__visible = true;
    el.style.display = 'block';
    mmApplyVariant(el, {
      enter: { opacity: 0.62, y: 0, transition: { duration: 0.18, ease: 'easeOut' } }
    }, 'enter', null);
  }
  function hideTimestamp(el) {
    if (!el.__visible && el.style.display === 'none') return;
    el.__visible = false;
    el.style.display = 'none';
    el.style.opacity = '0';
  }

  /* ---------- CappellaBubbleGlow（:1153-1178） ---------- */
  function buildBubbleGlow(isRight) {
    var glowAlpha = isRight ? motionConfig.glowRightAlpha : motionConfig.glowLeftAlpha;
    var glowColor = 'rgba(255,255,255,' + glowAlpha + ')';
    var el = cappellaEl('div', 'cp-glow');
    el.style.cssText = 'pointer-events-none;position:absolute;top:0;bottom:0;left:0;width:200%;opacity:' + motionConfig.glowOpacity + ';' +
      'background:linear-gradient(105deg, transparent 0%, ' + glowColor + ' 23%, transparent 34%, transparent 50%, transparent 50%, ' + glowColor + ' 73%, transparent 84%, transparent 100%);' +
      'animation:cappella-bubble-glow-pan ' + motionConfig.glowDuration + 's linear infinite;will-change:transform;display:none;';
    return el;
  }

  /* ---------- 消息行（CappellaMessageRow :1195-1513 的 DOM 展开） ---------- */
  function buildRow(message) {
    var isRight = message.side === 'right';
    var isEmo = message.kind === 'emo';
    var rec = {
      message: message,
      isRight: isRight,
      isEmo: isEmo,
      isActive: false,
      isPassed: false,
      state: 'normal',
      metrics: null,
      visibleCharCount: 0,
      targetCharCount: 0,
      frame: null,
      inner: null,
      textSpan: null,
      charHost: null,
      chars: [],
      fadeDurations: null,
      glow: null,
      ts: null,
      emoWrap: null,
      emoImgWrap: null,
      lastBoxShadowActive: null
    };

    var row = cappellaEl('div', 'cp-row');
    row.style.cssText = 'display:flex;width:100%;align-items:flex-end;gap:12px;' +
      (isRight ? 'justify-content:flex-end;' : 'justify-content:flex-start;') +
      (isEmo ? 'padding-top:48px;' : '');
    var inner = cappellaEl('div', 'cp-in');
    inner.style.cssText = 'display:flex;width:100%;max-width:78%;align-items:flex-end;gap:12px;' +
      (isRight ? 'flex-direction:row-reverse;' : 'flex-direction:row;') +
      'transform-origin:' + (isRight ? '100% 100%' : '0% 100%') + ';';
    rec.inner = inner;

    inner.appendChild(buildAvatar(message));

    if (isEmo) {
      /* emo 贴纸行（:1405-1454）：外层 wrap 只持尺寸（尺寸动画由状态切换驱动），
         opacity/scale 的 enter 在内层 imgWrap（:1430-1433） */
      var emoImageSize = motionConfig.emoInactiveSize;
      var emoWrap = cappellaEl('div', 'cp-emo');
      emoWrap.style.cssText = 'position:relative;flex:0 0 auto;width:' + emoImageSize + 'px;height:' + emoImageSize + 'px;';
      rec.emoWrap = emoWrap;
      var emoTs = buildTimestamp(message.line, theme.secondaryColor, -2, isRight);
      rec.ts = emoTs;
      emoWrap.appendChild(emoTs);

      var emoImgWrap = cappellaEl('div');
      emoImgWrap.style.cssText = 'width:100%;height:100%;display:block;opacity:0;transform:scale(' + motionConfig.emoEnterScale + ');';
      var img = cappellaEl('img');
      img.alt = 'emo';
      img.draggable = false;
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;border-radius:16px;animation:cappella-emo-wiggle 1.9s ease-in-out infinite;will-change:transform;';
      img.src = message.emoImageUrl;
      emoImgWrap.appendChild(img);
      emoWrap.appendChild(emoImgWrap);
      rec.emoImgWrap = emoImgWrap;

      inner.appendChild(emoWrap);
    } else {
      /* 气泡行（AnimatedBubbleFrame :1076-1124 + 气泡体 :1457-1508） */
      var frame = cappellaEl('div', 'cp-frame');
      frame.style.cssText = 'position:relative;flex:0 0 auto;width:fit-content;height:auto;';
      var bubble = cappellaEl('div', 'cp-bubble');
      bubble.style.cssText = 'position:relative;border-radius:24px;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;height:auto;' +
        'box-shadow:0 10px 15px -3px rgba(0,0,0,0.1),0 4px 6px -4px rgba(0,0,0,0.1);' +
        (isRight ? 'border-bottom-right-radius:6px;' : 'border-bottom-left-radius:6px;') +
        'transition:min-height 200ms ease-out, box-shadow 200ms ease-out, background-color 200ms ease-out;';
      frame.appendChild(bubble);
      rec.frame = frame;

      /* 流光层容器（:1493 absolute inset-0 overflow-hidden rounded-inherit） */
      var glowHost = cappellaEl('div');
      glowHost.style.cssText = 'position:absolute;inset:0;overflow:hidden;border-radius:inherit;';
      var glow = buildBubbleGlow(isRight);
      rec.glow = glow;
      glowHost.appendChild(glow);
      bubble.appendChild(glowHost);

      /* 文本层（:1496-1507） */
      var textSpan = cappellaEl('span', 'cp-text');
      textSpan.style.cssText = 'position:relative;z-index:10;';
      bubble.appendChild(textSpan);
      rec.textSpan = textSpan;
      rec.bubble = bubble;

      /* 时间戳只挂 timed 消息（:1460-1470 floatingAdornment={timedData ? … : undefined}） */
      if (cappellaIsTimedMessage(message)) {
        var ts = buildTimestamp(message.line, theme.secondaryColor, 4, isRight);
        rec.ts = ts;
        frame.appendChild(ts);
      }

      inner.appendChild(frame);
    }

    row.appendChild(inner);
    rec.row = row;

    /* 行进出场 variants（:1371-1382 initial/animate/exit 同构） */
    rec.rowInitial = { opacity: 0, y: motionConfig.rowEnterY, scale: motionConfig.rowEnterScale };
    rec.rowEnter = { opacity: 1, y: 0, scale: 1, transition: { duration: motionConfig.rowEnterDuration, ease: 'easeOut' } };
    rec.rowExit = {
      opacity: 0, y: motionConfig.rowExitY, scale: motionConfig.rowExitScale,
      transition: { duration: motionConfig.rowExitDuration, ease: 'easeIn' }
    };
    return rec;
  }

  /* 气泡状态样式（:1216-1221 fontSize/padding、:1472-1491 style 直设——非 animate 属性） */
  function applyBubbleStaticStyles(rec) {
    var message = rec.message;
    var isTitle = message.kind === 'title';
    var bubbleFontSize = rec.isActive
      ? baseFontSizePx() * motionConfig.activeFontMultiplier
      : isTitle ? baseFontSizePx() : baseFontSizePx() * motionConfig.inactiveFontMultiplier;
    var paddingX = rec.isActive ? motionConfig.activePaddingX : motionConfig.inactivePaddingX;
    var paddingY = rec.isActive ? motionConfig.activePaddingY : motionConfig.inactivePaddingY;
    var colors = cappellaGetBubbleColors(message, theme);
    rec.bubbleFontSize = bubbleFontSize;
    rec.paddingX = paddingX;
    rec.paddingY = paddingY;
    rec.lineHeightPx = bubbleFontSize * 1.45;
    rec.bubble.style.backgroundColor = colors.backgroundColor;
    rec.bubble.style.borderColor = colors.borderColor;
    rec.bubble.style.color = colors.textColor;
    rec.bubble.style.fontSize = bubbleFontSize + 'px';
    rec.bubble.style.fontWeight = CM_resolveThemeFontWeight(theme, CAPPELLA_BUBBLE_FONT_WEIGHT);
    rec.bubble.style.lineHeight = '1.45';
    rec.bubble.style.maxWidth = (maxTextWidthPx() + paddingX * 2 + 2) + 'px';
    rec.bubble.style.minHeight = Math.max(
      rec.isActive ? motionConfig.activeMinHeight : motionConfig.inactiveMinHeight,
      bubbleFontSize * 1.45 + paddingY * 2
    ) + 'px';
    rec.bubble.style.minWidth = rec.isActive ? '72px' : '';
    rec.bubble.style.padding = paddingY + 'px ' + paddingX + 'px';
    /* active 阴影（:1486-1488） */
    if (rec.isActive) {
      rec.bubble.style.boxShadow = '0 18px 48px ' + CM_mixColors(theme.backgroundColor, theme.accentColor, 0.2, motionConfig.activeShadowAlpha);
    } else {
      rec.bubble.style.boxShadow = '';
    }
  }

  /* ActiveCappellaText（:1126-1151）与 CappellaText（:1039-1051）：
     mode='reveal'（active）→ 逐字符 span + CSS char-fade 按字符 fade 时长；
     mode='all'（passed 补齐/整行）→ 直接补满剩余字符（等价 CappellaText 的
     fullText 纯文本视觉——已显示字符与 fullText 逐字一致）。 */
  function ensureCharHost(rec) {
    if (!rec.charHost) {
      rec.charHost = cappellaEl('span');
      rec.textSpan.appendChild(rec.charHost);
    }
    return rec.charHost;
  }

  function syncBubbleChars(rec, mode) {
    if (rec.message.kind !== 'lyric') return;
    var host = ensureCharHost(rec);
    var plan = rec.revealPlan || (rec.revealPlan = cappellaGetCharacterRevealPlan(rec.message.line));
    var visible = mode === 'all' ? plan.characters.length : Math.max(0, rec.visibleCharCount);
    while (rec.chars.length < visible) {
      var index = rec.chars.length;
      var span = cappellaEl('span');
      if (mode === 'reveal') {
        span.style.cssText = 'animation-name:cappella-char-fade;animation-duration:' +
          (plan.fadeDurationsMs[index] != null ? plan.fadeDurationsMs[index] : CAPPELLA_DEFAULT_CHAR_FADE_MS) +
          'ms;animation-timing-function:ease-out;';
      }
      span.textContent = plan.characters[index];
      host.appendChild(span);
      rec.chars.push(span);
    }
  }

  /* 气泡目标尺寸（:1265-1314 targetSize memo 等价） */
  function computeTargetSize(rec) {
    var message = rec.message;
    if (rec.isEmo) {
      return { width: rec.isActive ? motionConfig.emoActiveSize : motionConfig.emoInactiveSize, height: rec.isActive ? motionConfig.emoActiveSize : motionConfig.emoInactiveSize };
    }
    if (message.kind !== 'lyric') return null;
    if (rec.isActive) {
      var clampedTargetCount = Math.max(0, Math.min(rec.targetCharCount, rec.metrics.sizes.length - 1));
      return rec.metrics.sizes[clampedTargetCount];
    }
    /* 非 active 也显式量测：active→passed 宽高连续动画（:1289-1299） */
    return cappellaMeasureBubbleText({
      text: message.line.fullText,
      theme: theme,
      fontSize: rec.bubbleFontSize,
      lineHeightPx: rec.lineHeightPx,
      maxTextWidth: maxTextWidthPx(),
      paddingX: rec.paddingX,
      paddingY: rec.paddingY
    });
  }

  /* AnimatedBubbleFrame 尺寸动画（:1084-1108 width/height tween 0.2 easeOut） */
  function applyFrameSize(rec, size) {
    if (!size || !rec.frame || !rec.bubble) return;
    mmApplyVariant(rec.frame, {
      size: {
        width: size.width,
        height: size.height,
        transition: {
          width: { duration: 0.2, ease: 'easeOut' },
          height: { duration: 0.2, ease: 'easeOut' }
        }
      }
    }, 'size', null);
    rec.bubble.style.height = '100%';
  }

  /* scale(origin=bottom) 上溢补偿（:1315-1328 marginTop，完整文本终高计算） */
  function computeScaleOverflow(rec) {
    if (!rec.isActive || motionConfig.activeScale <= 1) return 0;
    var baseHeight;
    if (rec.isEmo) baseHeight = motionConfig.emoActiveSize;
    else if (rec.message.kind === 'lyric' && rec.metrics) {
      var last = rec.metrics.sizes[rec.metrics.sizes.length - 1];
      baseHeight = (last && last.height != null) ? last.height : motionConfig.activeMinHeight;
    } else baseHeight = motionConfig.activeMinHeight;
    return Math.ceil(Math.max(baseHeight, 40) * (motionConfig.activeScale - 1));
  }

  /* 内层 opacity/scale/marginTop spring（:1385-1391，avatarSpring 恒定） */
  function applyInnerVariant(rec) {
    var targets = rec.isActive
      ? { opacity: 1, scale: motionConfig.activeScale, marginTop: computeScaleOverflow(rec) }
      : rec.isPassed
        ? { opacity: motionConfig.passedOpacity, scale: motionConfig.passedScale, marginTop: 0 }
        : { opacity: 1, scale: 1, marginTop: 0 };
    var spring = { type: 'spring', stiffness: motionConfig.avatarSpring.stiffness, damping: motionConfig.avatarSpring.damping, mass: motionConfig.avatarSpring.mass };
    mmApplyVariant(rec.inner, {
      state: {
        opacity: targets.opacity,
        scale: targets.scale,
        marginTop: targets.marginTop,
        transition: spring
      }
    }, 'state', null);
  }

  function applyRowActive(rec, isActive, isPassed) {
    rec.isActive = isActive;
    rec.isPassed = isPassed;
    if (rec.isEmo) {
      /* emo 尺寸动画（:1407-1416 width/height tween emoSizeTransitionDuration） */
      var size = isActive ? motionConfig.emoActiveSize : motionConfig.emoInactiveSize;
      mmApplyVariant(rec.emoWrap, {
        size: {
          width: size, height: size,
          transition: {
            width: { duration: motionConfig.emoSizeTransitionDuration, ease: 'easeOut' },
            height: { duration: motionConfig.emoSizeTransitionDuration, ease: 'easeOut' }
          }
        }
      }, 'size', null);
      /* emo 进入（:1430-1433 initial opacity0/scale emoEnterScale → animate 1/1，
         挂载时播一次，状态切换不重播——React initial/animate 语义） */
      if (!rec.__emoEntered) {
        rec.__emoEntered = true;
        mmApplyVariant(rec.emoImgWrap, {
          enter: { opacity: 1, scale: 1, transition: { duration: motionConfig.rowEnterDuration, ease: 'easeOut' } }
        }, 'enter', null);
      }
      applyInnerVariant(rec);
      return;
    }

    applyBubbleStaticStyles(rec);
    applyInnerVariant(rec);
    /* active 行建度量 + 字符宿主（:1235-1249 preparedMetrics memo） */
    if (rec.isActive && rec.message.kind === 'lyric') {
      rec.metrics = cappellaGetOrBuildBubbleMetrics(metricsCache, {
        line: rec.message.line,
        theme: theme,
        fontSize: rec.bubbleFontSize,
        lineHeightPx: rec.lineHeightPx,
        maxTextWidth: maxTextWidthPx(),
        paddingX: rec.paddingX,
        paddingY: rec.paddingY
      });
      /* 切入 active：从纯文本（CappellaText）切逐字模式（ActiveCappellaText），
         按当前时刻重建 reveal 进度 */
      var host = ensureCharHost(rec);
      host.textContent = '';
      rec.chars = [];
      syncBubbleChars(rec, 'reveal');
    } else if (!rec.isActive && rec.chars.length && rec.chars.length < (rec.revealPlan ? rec.revealPlan.characters.length : 0)) {
      /* passed 补齐（等价 CappellaText 直接渲染 fullText） */
      syncBubbleChars(rec, 'all');
    }
    /* 流光只在 active 显示（:1157-1160） */
    if (rec.glow) rec.glow.style.display = rec.isActive ? 'block' : 'none';
  }

  /* ---------- popLayout 同步（AnimatePresence :1671-1689 等价） ---------- */
  function syncVisibleDom(now) {
    var viewportH = (typeof window !== 'undefined' && window.innerHeight) || 900;
    var visibleLineIndex = cappellaGetVisibleLineIndexAtTime(lines, now);
    var currentLineIndex = cappellaFindLineIndexAtTime(lines, now);
    var emoVisibleCount = 0;
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].kind === 'emo' && now >= messages[i].activationStartTime) emoVisibleCount += 1;
    }

    /* memo 依赖（:1587-1610）：行索引/时刻/视口/主题/字号 —— 变化才重算 */
    var unchanged = visibleLineIndex === lastVisibleLineIndex
      && currentLineIndex === lastCurrentLineIndex
      && emoVisibleCount === lastEmoVisibleCount
      && viewportH === lastViewportH;
    if (unchanged && visibleMessages.length) return;

    lastVisibleLineIndex = visibleLineIndex;
    lastCurrentLineIndex = currentLineIndex;
    lastEmoVisibleCount = emoVisibleCount;
    lastViewportH = viewportH;

    var next = cappellaGetVisibleMessages(messages, visibleLineIndex, viewportH, currentLineIndex, now, motionConfig, theme, baseFontSizePx(), maxTextWidthPx());

    /* FLIP：旧行位置快照（framer layout="position" 的重排补偿） */
    var oldTops = {};
    for (var key in domByKey) {
      if (Object.prototype.hasOwnProperty.call(domByKey, key)) {
        var r0 = domByKey[key];
        if (r0.row && r0.row.parentNode) oldTops[key] = r0.row.offsetTop;
      }
    }

    /* 新增行 enter */
    var nextIds = {};
    for (var n = 0; n < next.length; n++) {
      var message = next[n];
      nextIds[message.id] = true;
      var rec = domByKey[message.id];
      if (!rec) {
        rec = buildRow(message);
        domByKey[message.id] = rec;
        list.appendChild(rec.row);
        mmSetInitial(rec.row, rec.rowInitial, null);
        mmApplyVariant(rec.row, { enter: rec.rowEnter }, 'enter', null);
        /* 初次状态置位（React 挂载即按当前时刻计算状态） */
        var st0 = cappellaGetTimedMessageState(message, now, currentLineIndex);
        applyRowActive(rec, st0.isActive, st0.isPassed);
        if (rec.isEmo) {
          rec.ts && (now >= message.activationEndTime ? showTimestamp(rec.ts) : hideTimestamp(rec.ts));
        } else if (message.kind === 'lyric') {
          if (!rec.isActive) {
            /* 非 active 歌词行 = CappellaText 直接渲染 fullText（:1039-1051） */
            rec.textSpan.textContent = message.line.fullText;
          } else {
            rec.visibleCharCount = rec.metrics ? cappellaGetCharacterCountAtTime(rec.metrics.revealTimes, now) : 0;
            rec.targetCharCount = rec.metrics ? cappellaGetBubbleTargetCharacterCount(rec.metrics, now) : 0;
            syncBubbleChars(rec, 'reveal');
          }
          applyFrameSize(rec, computeTargetSize(rec));
          var tsReady = rec.isPassed || now >= cappellaGetTimestampReadyTime(rec.metrics, message.line);
          tsReady ? showTimestamp(rec.ts) : hideTimestamp(rec.ts);
        } else if (message.kind === 'title') {
          rec.textSpan.textContent = message.text;
          applyFrameSize(rec, computeTargetSize(rec));
        }
      }
    }

    /* 移除行 exit（popLayout：absolute 化脱离布局流 + 原位播退场） */
    for (var key2 in domByKey) {
      if (!Object.prototype.hasOwnProperty.call(domByKey, key2)) continue;
      var r = domByKey[key2];
      if (nextIds[key2]) continue;
      delete domByKey[key2];
      if (!r.row || !r.row.parentNode) continue;
      var top = oldTops[key2] != null ? oldTops[key2] : r.row.offsetTop;
      r.row.style.position = 'absolute';
      r.row.style.top = top + 'px';
      r.row.style.left = '0';
      r.row.style.width = '100%';
      r.row.style.margin = '0';
      mmApplyVariant(r.row, { exit: r.rowExit }, 'exit', null);
      (function (rowEl, dur) {
        var t = setTimeout(function () {
          if (rowEl.parentNode) rowEl.parentNode.removeChild(rowEl);
        }, dur);
        exitTimers.push(t);
      })(r.row, motionConfig.rowExitDuration * 1000 + 90);
    }

    /* layout="position"：保留行重排 FLIP（y 从位移差归零；
       先落旧位再启动归零动画——mmStartProp 从当前 tf 值续跑） */
    for (var n2 = 0; n2 < next.length; n2++) {
      var rec2 = domByKey[next[n2].id];
      if (!rec2 || !rec2.row || !rec2.row.parentNode) continue;
      var oldTop = oldTops[next[n2].id];
      if (oldTop == null) continue;
      rec2.row.style.transform = '';
      var newTop = rec2.row.offsetTop;
      var dy = oldTop - newTop;
      if (Math.abs(dy) > 1) {
        var st2 = mmGetState(rec2.row);
        st2.tf.y = dy;
        mmApplyTransform(rec2.row, st2);
        mmApplyVariant(rec2.row, {
          relayout: { y: 0, transition: { duration: 0.3, ease: 'easeOut' } }
        }, 'relayout', null);
      }
    }
  }

  /* ---------- 行内逐帧 tick（useMotionValueEvent :1350-1368 等价） ---------- */
  function tickRows(now, currentLineIndex) {
    for (var key in domByKey) {
      if (!Object.prototype.hasOwnProperty.call(domByKey, key)) continue;
      var rec = domByKey[key];
      if (!rec.row || !rec.row.parentNode) continue;
      var message = rec.message;
      if (message.kind === 'title') continue;

      var st = cappellaGetTimedMessageState(message, now, currentLineIndex);
      if (st.isActive !== rec.isActive || st.isPassed !== rec.isPassed) {
        applyRowActive(rec, st.isActive, st.isPassed);
      }

      /* 时间戳可见性（:1352-1355） */
      var tsVisible = message.kind === 'emo'
        ? now >= message.activationEndTime
        : rec.isPassed || now >= cappellaGetTimestampReadyTime(rec.metrics, message.line);
      tsVisible ? showTimestamp(rec.ts) : hideTimestamp(rec.ts);

      if (rec.isActive && message.kind === 'lyric' && rec.metrics) {
        /* 字符 reveal + 气泡提前扩展目标（:1358-1367） */
        var nextVisible = cappellaGetCharacterCountAtTime(rec.metrics.revealTimes, now);
        var nextTarget = cappellaGetBubbleTargetCharacterCount(rec.metrics, now);
        if (nextVisible !== rec.visibleCharCount) {
          rec.visibleCharCount = nextVisible;
          syncBubbleChars(rec, 'reveal');
        }
        if (nextTarget !== rec.targetCharCount) {
          rec.targetCharCount = nextTarget;
          applyFrameSize(rec, computeTargetSize(rec));
        }
      } else if (!rec.isEmo && rec.frame && !rec.__sizedOnce) {
        rec.__sizedOnce = true;
        applyFrameSize(rec, computeTargetSize(rec));
      }
    }
  }

  /* ---------- 底部字幕（VisualizerSubtitleOverlay :48-215 等价，classic 同款） ---------- */
  function renderSubtitle(activeLine, recentCompletedLine, nextLines) {
    var shouldRender = showText && !hideTranslationSubtitle;
    var translation = null;
    if (shouldRender) {
      var candidates = [activeLine, recentCompletedLine];
      for (var i = 0; i < candidates.length; i++) {
        var line = candidates[i];
        var text = line && line.translation ? String(line.translation) : '';
        if (text && cappellaHasReadableText(text)) { translation = text; break; }
      }
    }
    var upcoming = [];
    if (shouldRender && !translation && activeLine) {
      upcoming = (nextLines || []).filter(function (l) { return cappellaHasReadableText(l.fullText); });
    }

    var key = translation ? 't:' + translation : (upcoming.length ? 'u:' + upcoming.map(function (l) { return l.startTime; }).join('|') : null);
    if (key === subtitleKey) return;

    if (!key) {
      subtitleKey = null;
      mmApplyVariant(sub, {
        exit: { opacity: 0, y: 20, transition: { duration: 0.24, ease: 'easeOut' } }
      }, 'exit', null);
      return;
    }
    subtitleKey = key;
    sub.innerHTML = '';
    var content = cappellaEl('div');
    content.style.cssText = 'position:relative;display:inline-block;padding:2px 6px;';

    if (translation) {
      var glowBg = cappellaEl('div');
      glowBg.setAttribute('aria-hidden', 'true');
      glowBg.style.cssText = 'position:absolute;left:-40px;right:-40px;top:-24px;bottom:-24px;z-index:0;filter:blur(24px);' +
        'background:radial-gradient(ellipse 115% 130% at center, ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.96) + ' 0%, ' +
        CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.78) + ' 62%, transparent 100%);';
      content.appendChild(glowBg);
      var transEl = cappellaEl('div');
      transEl.style.cssText = 'position:relative;z-index:10;max-width:56rem;margin:0 auto;color:' + (theme.secondaryColor || theme.primaryColor) +
        ';font-size:' + Math.max(14, 16 * lyricsFontScale) + 'px;' +
        'text-shadow:0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.24) + ';';
      transEl.textContent = translation;
      content.appendChild(transEl);
    } else {
      var upWrap = cappellaEl('div');
      upWrap.style.cssText = 'position:relative;z-index:10;display:flex;flex-direction:column;gap:8px;align-items:center;';
      for (var u = 0; u < upcoming.length; u++) {
        var p = cappellaEl('p');
        p.style.cssText = 'margin:0 auto;max-width:42rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:all .5s ease;filter:blur(1px);' +
          'color:' + (theme.secondaryColor || theme.primaryColor) + ';font-size:' + Math.max(12, 14 * lyricsFontScale) + 'px;' +
          'text-shadow:0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.24) + ';';
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

  /* ---------- 布局常量（:1583-1586 原公式） ---------- */
  function baseFontSizePx() {
    return Math.max(15, Math.min(26, 18 * lyricsFontScale));
  }
  function maxTextWidthPx() {
    var w = (typeof window !== 'undefined' && window.innerWidth) || 1280;
    var maxPanelWidth = Math.min(Math.max(w - 32, 1), 896);
    var bubbleGroupRatio = w >= 640 ? 0.68 : 0.78;
    return Math.max(96, Math.floor(maxPanelWidth * bubbleGroupRatio - 56));
  }

  /* ---------- 主循环（App 时钟等价：每帧轮询 MV + 派发 change） ---------- */
  function tick() {
    if (destroyed) return;
    var now = currentTime.get();
    if (now !== lastTime) {
      lastTime = now;
      currentTime.emit(now);
    }

    var currentLineIndex = cappellaFindLineIndexAtTime(lines, now);
    var activeLine = currentLineIndex >= 0 ? lines[currentLineIndex] : null;

    /* 可见窗口同步（条件化：依赖集不变不重算） */
    syncVisibleDom(now);

    /* 行内状态 */
    tickRows(now, currentLineIndex);

    /* preheat（:1646-1659）：upcoming 行进 lead 窗口即预热度量缓存 */
    var upcomingLine = cappellaGetUpcomingLine(lines, currentLineIndex, now);
    if (upcomingLine && cappellaShouldPreheatLine(upcomingLine, now, CAPPELLA_PREHEAT_WINDOW)) {
      cappellaGetOrBuildBubbleMetrics(metricsCache, {
        line: upcomingLine,
        theme: theme,
        fontSize: baseFontSizePx() * motionConfig.activeFontMultiplier,
        lineHeightPx: baseFontSizePx() * motionConfig.activeFontMultiplier * 1.45,
        maxTextWidth: maxTextWidthPx(),
        paddingX: motionConfig.activePaddingX,
        paddingY: motionConfig.activePaddingY
      });
    }

    /* 字幕（useVisualizerRuntime :1611-1616 等价） */
    var recent = cappellaGetRecentCompletedLine(lines, currentLineIndex, now, CM_getLineRenderEndTime);
    renderSubtitle(activeLine, recent, cappellaGetUpcomingLines(lines, currentLineIndex, 2));

    rafId = requestAnimationFrame(tick);
  }

  function onResize() {
    if (destroyed) return;
    lastViewportH = 0;   /* 视口变化 → 可见窗口重算（:1618-1628） */
  }
  window.addEventListener('resize', onResize);

  rebuildMessages();
  rafId = requestAnimationFrame(tick);

  return {
    destroy: function () {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      clearExitTimers();
      window.removeEventListener('resize', onResize);
      if (shell.parentNode) shell.parentNode.removeChild(shell);
      domByKey = {};
      visibleMessages = [];
    },
    setLines: function (next) {
      lines = next || [];
      rebuildMessages();
      clearDom();
    },
    setTheme: function (next) {
      theme = next;
      intensityConfig = cappellaGetIntensityConfig(theme.animationIntensity);
      motionConfig = intensityConfig.motion;
      shell.style.fontFamily = CM_resolveThemeFontStack(theme);
      shell.style.fontWeight = CM_resolveThemeFontWeight(theme, 400);
      clearDom();
      subtitleKey = null;
    },
    setFontScale: function (n) {
      lyricsFontScale = n != null ? n : 1;
      clearDom();
      subtitleKey = null;
    },
    setTuning: function (t) {
      tuning = cappellaResolveTuning(t, 0, 0);
      rebuildMessages();
      clearDom();
    },
    setCover: function (url) {
      coverUrl = url || null;
      clearDom();
    },
    setSongTitle: function (text) {
      songTitle = String(text || '').trim() || '未在播放';
      rebuildMessages();
      clearDom();
    }
  };

  function clearDom() {
    clearExitTimers();
    list.textContent = '';
    domByKey = {};
    visibleMessages = [];
    lastVisibleLineIndex = -2;
    lastCurrentLineIndex = -2;
    lastEmoVisibleCount = -1;
    metricsCache.clear();
  }
}
