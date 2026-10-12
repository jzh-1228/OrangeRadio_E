// OrangeSea CAPPELLA ENGINE (AGPL-3.0, from folia-major) -- no-build bundle
(function (pretext, env) {
"use strict";
// ======== components/visualizer/cappella/cappellaMessageSenders ========
const normalizeAgentId = (agentId) => {
    const trimmed = agentId?.trim();
    return trimmed ? trimmed : null;
};
const collectDistinctAgentIds = (lines) => {
    const ids = [];
    const seen = new Set();
    lines.forEach(line => {
        const agentId = normalizeAgentId(line.agentId);
        if (!agentId || seen.has(agentId)) {
            return;
        }
        seen.add(agentId);
        ids.push(agentId);
    });
    return ids;
};
const createCappellaAgentSenderResolver = (lines, options) => {
    const agentIds = collectDistinctAgentIds(lines);
    if (agentIds.length < 2) {
        return null;
    }
    const rightAgentId = agentIds[0];
    const leftAvatarCount = Math.max(1, options.leftAvatarCount);
    const senderByAgentId = new Map();
    agentIds.forEach((agentId, index) => {
        senderByAgentId.set(agentId, agentId === rightAgentId
            ? {
                side: 'right',
                avatarIndex: options.rightAvatarIndex,
            }
            : {
                side: 'left',
                avatarIndex: (index - 1) % leftAvatarCount,
            });
    });
    return {
        resolve: line => {
            const agentId = normalizeAgentId(line.agentId);
            return agentId ? senderByAgentId.get(agentId) ?? null : null;
        },
    };
};

// ======== components/visualizer/colorMix ========
// src/components/visualizer/colorMix.ts
// Shared color helpers for visualizer renderers.
const clamp__1 = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (from, to, amount) => from + (to - from) * amount;
const FALLBACK_RGB = { r: 255, g: 255, b: 255 };
const isFiniteChannel = (value) => Number.isFinite(value);
const formatRgba = (channels, alpha) => (`rgba(${Math.round(clamp__1(channels.r, 0, 255))}, ${Math.round(clamp__1(channels.g, 0, 255))}, ${Math.round(clamp__1(channels.b, 0, 255))}, ${alpha})`);
const colorWithAlpha = (color, alpha) => {
    const normalizedAlpha = clamp__1(alpha, 0, 1);
    const normalizedColor = typeof color === 'string' ? color.trim() : '';
    if (!normalizedColor) {
        return formatRgba(FALLBACK_RGB, normalizedAlpha);
    }
    if (normalizedColor.startsWith('#')) {
        const hex = normalizedColor.slice(1);
        const parse = (value) => Number.parseInt(value, 16);
        if (/^[0-9a-fA-F]{3}$/.test(hex)) {
            const r = parse(hex[0] + hex[0]);
            const g = parse(hex[1] + hex[1]);
            const b = parse(hex[2] + hex[2]);
            return formatRgba({ r, g, b }, normalizedAlpha);
        }
        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
            const r = parse(hex.slice(0, 2));
            const g = parse(hex.slice(2, 4));
            const b = parse(hex.slice(4, 6));
            return formatRgba({ r, g, b }, normalizedAlpha);
        }
        return formatRgba(FALLBACK_RGB, normalizedAlpha);
    }
    const rgbMatch = normalizedColor.match(/^rgba?\(([^)]+)\)$/);
    if (rgbMatch) {
        const [r, g, b] = rgbMatch[1].split(',').slice(0, 3).map(part => Number.parseFloat(part.trim()));
        if ([r, g, b].every(isFiniteChannel)) {
            return formatRgba({ r, g, b }, normalizedAlpha);
        }
        return formatRgba(FALLBACK_RGB, normalizedAlpha);
    }
    return normalizedColor;
};
const parseColorChannels = (color) => {
    const normalizedColor = typeof color === 'string' ? color.trim() : '';
    if (!normalizedColor) {
        return null;
    }
    if (normalizedColor.startsWith('#')) {
        const hex = normalizedColor.slice(1);
        const parse = (value) => Number.parseInt(value, 16);
        if (/^[0-9a-fA-F]{3}$/.test(hex)) {
            return {
                r: parse(hex[0] + hex[0]),
                g: parse(hex[1] + hex[1]),
                b: parse(hex[2] + hex[2]),
            };
        }
        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
            return {
                r: parse(hex.slice(0, 2)),
                g: parse(hex.slice(2, 4)),
                b: parse(hex.slice(4, 6)),
            };
        }
    }
    const rgbMatch = normalizedColor.match(/^rgba?\(([^)]+)\)$/);
    if (rgbMatch) {
        const [r, g, b] = rgbMatch[1].split(',').slice(0, 3).map(part => Number.parseFloat(part.trim()));
        if ([r, g, b].every(isFiniteChannel)) {
            return { r, g, b };
        }
    }
    return null;
};
const mixColors = (from, to, amount, alpha = 1) => {
    const normalizedAmount = clamp__1(amount, 0, 1);
    const fromChannels = parseColorChannels(from);
    const toChannels = parseColorChannels(to);
    if (!fromChannels || !toChannels) {
        return colorWithAlpha(normalizedAmount >= 0.5 ? to : from, alpha);
    }
    return `rgba(${Math.round(mix(fromChannels.r, toChannels.r, normalizedAmount))}, ${Math.round(mix(fromChannels.g, toChannels.g, normalizedAmount))}, ${Math.round(mix(fromChannels.b, toChannels.b, normalizedAmount))}, ${clamp__1(alpha, 0, 1)})`;
};

// ======== utils/fontStacks ========
const MIN_FONT_WEIGHT = 100;
const MAX_FONT_WEIGHT = 900;
const FONT_WEIGHT_STEP = 10;
const normalizeFontWeight = (fontWeight) => {
    if (typeof fontWeight !== 'number' || !Number.isFinite(fontWeight))
        return null;
    const clamped = Math.min(MAX_FONT_WEIGHT, Math.max(MIN_FONT_WEIGHT, fontWeight));
    return Math.round(clamped / FONT_WEIGHT_STEP) * FONT_WEIGHT_STEP;
};
const resolveThemeFontWeight = (theme, fallback) => normalizeFontWeight(theme?.fontWeight) ?? fallback;
const SUGAR_SERIF_FAMILY = '"獅尾四季春加糖SC"';
const BUILTIN_FONT_STACKS = {
    sans: '"Inter", "Noto Sans CJK SC", "Noto Sans JP", "Source Han Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    serif: `${SUGAR_SERIF_FAMILY}, "Iowan Old Style", "Noto Serif CJK SC", "Noto Serif JP", "Source Han Serif SC", "Songti SC", "STSong", "Georgia", serif`,
    mono: '"IBM Plex Mono", "Sarasa Mono SC", "Noto Sans Mono CJK SC", "Noto Sans Mono", "SFMono-Regular", Consolas, monospace',
};
const TRANSLATION_FONT_STACKS = {
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "Helvetica Neue", Arial, "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans JP", "Source Han Sans JP", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif',
    serif: `${SUGAR_SERIF_FAMILY}, "Folia Noto Serif SC", "Iowan Old Style", Georgia, "Times New Roman", "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", "STSong", "SimSun", "Noto Serif JP", "Source Han Serif JP", "Yu Mincho", "MS PMincho", serif`,
    mono: 'Consolas, "IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, "Sarasa Mono SC", "Noto Sans Mono CJK SC", "SimHei", "DengXian", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans Mono CJK JP", "MS Gothic", monospace',
};
const CSS_GENERIC_FONT_FAMILIES = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
    'ui-rounded',
    'emoji',
    'math',
    'fangsong',
]);
const quoteFontFamily = (fontFamily) => `"${fontFamily.replace(/["\\]/g, '\\$&')}"`;
const normalizeFontFamilyName = (fontFamily) => fontFamily.trim().replace(/^['"]|['"]$/g, '').trim();
const formatFontFamily = (fontFamily) => {
    const normalized = normalizeFontFamilyName(fontFamily);
    if (!normalized)
        return null;
    return CSS_GENERIC_FONT_FAMILIES.has(normalized.toLowerCase())
        ? normalized
        : quoteFontFamily(normalized);
};
const normalizeFontFamilyStack = (fontFamilies) => {
    const seen = new Set();
    const stack = [];
    fontFamilies?.forEach(fontFamily => {
        const normalized = normalizeFontFamilyName(fontFamily ?? '');
        if (!normalized)
            return;
        const key = normalized.toLocaleLowerCase();
        if (seen.has(key))
            return;
        seen.add(key);
        stack.push(normalized);
    });
    return stack;
};
const buildCustomFontFamilyStack = (theme) => {
    const familiesToNormalize = [
        ...(theme.fontFamily ? [theme.fontFamily] : []),
        ...(theme.fontFamilyStack ?? []),
    ];
    if (familiesToNormalize.length === 0) {
        return [];
    }
    return normalizeFontFamilyStack(familiesToNormalize)
        .map(formatFontFamily)
        .filter((fontFamily) => Boolean(fontFamily));
};
const getBuiltinThemeFontStack = (fontStyle) => {
    return BUILTIN_FONT_STACKS[fontStyle] ?? BUILTIN_FONT_STACKS.sans;
};
const resolveThemeFontStack = (theme) => {
    const fallbackStack = getBuiltinThemeFontStack(theme.fontStyle);
    const customFontStack = buildCustomFontFamilyStack(theme);
    if (customFontStack.length === 0) {
        return fallbackStack;
    }
    return `${customFontStack.join(', ')}, ${fallbackStack}`;
};
const resolveThemeTranslationFontStack = (theme) => {
    const fallbackStack = TRANSLATION_FONT_STACKS[theme.fontStyle] ?? TRANSLATION_FONT_STACKS.sans;
    const customFontStack = buildCustomFontFamilyStack(theme);
    if (customFontStack.length === 0) {
        return fallbackStack;
    }
    return `${customFontStack.join(', ')}, ${fallbackStack}`;
};

// ======== utils/lyrics/graphemeTiming ========
const graphemeSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;
const splitLyricGraphemes = (text) => {
    if (!text) {
        return [];
    }
    if (graphemeSegmenter) {
        return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
    }
    return Array.from(text);
};
const buildEvenGraphemeTimings = (text, startTime, endTime, wordIndex) => {
    const graphemes = splitLyricGraphemes(text);
    if (graphemes.length === 0) {
        return [];
    }
    const duration = Math.max(endTime - startTime, 0);
    const unitDuration = duration / graphemes.length;
    return graphemes.map((char, index) => ({
        char,
        startTime: startTime + unitDuration * index,
        endTime: index === graphemes.length - 1 ? endTime : startTime + unitDuration * (index + 1),
        ...(typeof wordIndex === 'number' ? { wordIndex } : {}),
    }));
};
const buildWordGraphemeTimings = (word, wordIndex) => {
    if (!word.syllables?.length) {
        return buildEvenGraphemeTimings(word.text, word.startTime, word.endTime, wordIndex);
    }
    return word.syllables.flatMap(syllable => buildEvenGraphemeTimings(syllable.text, syllable.startTime, syllable.endTime, wordIndex));
};
const findGraphemeSequence = (source, target, fromIndex) => {
    if (target.length === 0) {
        return fromIndex;
    }
    for (let index = fromIndex; index <= source.length - target.length; index += 1) {
        let matched = true;
        for (let targetIndex = 0; targetIndex < target.length; targetIndex += 1) {
            if (source[index + targetIndex] !== target[targetIndex]) {
                matched = false;
                break;
            }
        }
        if (matched) {
            return index;
        }
    }
    return -1;
};
// Maps word-level timing back to the full displayed line, including spaces and
// punctuation that may not be present in parser words.
const buildLineGraphemeTimeline = (line) => {
    const lineGraphemes = splitLyricGraphemes(line.fullText);
    if (lineGraphemes.length === 0) {
        return [];
    }
    if (line.words.length === 0) {
        return buildEvenGraphemeTimings(line.fullText, line.startTime, line.endTime);
    }
    const timeline = [];
    let cursor = 0;
    let lastResolvedTime = line.startTime;
    line.words.forEach((word, wordIndex) => {
        const wordGraphemes = splitLyricGraphemes(word.text);
        if (wordGraphemes.length === 0) {
            return;
        }
        const matchedStart = findGraphemeSequence(lineGraphemes, wordGraphemes, cursor);
        const start = matchedStart >= 0 ? matchedStart : cursor;
        const end = Math.min(start + wordGraphemes.length, lineGraphemes.length);
        for (let gapIndex = cursor; gapIndex < start; gapIndex += 1) {
            timeline[gapIndex] = {
                char: lineGraphemes[gapIndex],
                startTime: word.startTime,
                endTime: word.startTime,
            };
        }
        const wordTimings = buildWordGraphemeTimings(word, wordIndex);
        for (let localIndex = 0; localIndex < end - start; localIndex += 1) {
            const timing = wordTimings[localIndex]
                ?? buildEvenGraphemeTimings(wordGraphemes[localIndex] ?? '', word.startTime, word.endTime, wordIndex)[0];
            if (!timing) {
                continue;
            }
            timeline[start + localIndex] = {
                ...timing,
                char: lineGraphemes[start + localIndex],
            };
            lastResolvedTime = Math.max(lastResolvedTime, timing.endTime);
        }
        cursor = Math.max(cursor, end);
    });
    for (let index = 0; index < lineGraphemes.length; index += 1) {
        if (timeline[index]) {
            continue;
        }
        timeline[index] = {
            char: lineGraphemes[index],
            startTime: lastResolvedTime,
            endTime: lastResolvedTime,
        };
    }
    return timeline;
};

// ======== utils/lyrics/renderHints ========
const MICRO_LINE_DURATION_THRESHOLD = 0.10;
const SHORT_LINE_DURATION_THRESHOLD = 0.18;
const MICRO_LINE_RENDER_FLOOR = 0.067;
const getLastWordEndTime = (line) => {
    const lastWord = line.words?.[line.words.length - 1];
    return lastWord?.endTime ?? line.endTime;
};
const getLineTransitionTiming = (rawDuration, lineTransitionMode, wordRevealMode) => {
    if (lineTransitionMode === 'none') {
        return {
            enterDuration: 0,
            exitDuration: 0,
            linePassHold: 0,
        };
    }
    if (lineTransitionMode === 'fast') {
        return {
            enterDuration: clamp__2(rawDuration * 0.45, 0.045, 0.06),
            exitDuration: clamp__2(rawDuration * 0.22, 0.03, 0.04),
            linePassHold: wordRevealMode === 'instant' ? 0 : 0.03,
        };
    }
    return {
        enterDuration: Math.min(0.42, Math.max(0.22, Math.max(rawDuration, 0.12) * 0.34)),
        exitDuration: Math.min(0.32, Math.max(0.18, Math.max(rawDuration, 0.12) * 0.18)),
        linePassHold: wordRevealMode === 'instant' ? 0 : 0.06,
    };
};
const getTimingClass = (rawDuration) => {
    if (rawDuration < MICRO_LINE_DURATION_THRESHOLD) {
        return 'micro';
    }
    if (rawDuration < SHORT_LINE_DURATION_THRESHOLD) {
        return 'short';
    }
    return 'normal';
};
const getLineTransitionMode = (timingClass) => {
    if (timingClass === 'micro') {
        return 'none';
    }
    if (timingClass === 'short') {
        return 'fast';
    }
    return 'normal';
};
const getWordRevealMode = (timingClass) => {
    if (timingClass === 'micro') {
        return 'instant';
    }
    if (timingClass === 'short') {
        return 'fast';
    }
    return 'normal';
};
const clamp__2 = (value, min, max) => Math.min(Math.max(value, min), max);
const buildLineRenderEndTime = (line, rawDuration, lineTransitionMode, wordRevealMode) => {
    // renderEndTime is the latest point a visualizer may keep this line on screen for
    // active/pass/exit polish after reveal has finished. It is not a guaranteed standalone
    // timeline: a later line may start earlier and force the current renderer to cut that
    // extra window short.
    if (lineTransitionMode === 'none') {
        return Math.max(line.endTime, line.startTime + MICRO_LINE_RENDER_FLOOR);
    }
    const transitionTiming = getLineTransitionTiming(rawDuration, lineTransitionMode, wordRevealMode);
    const linePassStart = Math.max(getLastWordEndTime(line), line.startTime) + transitionTiming.linePassHold;
    const exitStart = lineTransitionMode === 'fast'
        ? Math.max(line.startTime + transitionTiming.enterDuration + 0.01, linePassStart, line.endTime - transitionTiming.exitDuration)
        : Math.max(linePassStart, line.endTime - transitionTiming.exitDuration);
    return Math.max(line.endTime, exitStart + transitionTiming.exitDuration);
};
function buildLineRenderHints(lineOrStart, endTime) {
    const line = typeof lineOrStart === 'number'
        ? { startTime: lineOrStart, endTime: endTime ?? lineOrStart }
        : lineOrStart;
    const rawDuration = Math.max(line.endTime - line.startTime, 0);
    const timingClass = getTimingClass(rawDuration);
    const lineTransitionMode = getLineTransitionMode(timingClass);
    const wordRevealMode = getWordRevealMode(timingClass);
    return {
        rawDuration,
        timingClass,
        renderEndTime: buildLineRenderEndTime(line, rawDuration, lineTransitionMode, wordRevealMode),
        lineTransitionMode,
        wordRevealMode,
    };
}
const getLineRenderHints = (line) => {
    if (!line) {
        return null;
    }
    return line.renderHints ?? buildLineRenderHints(line);
};
const getLineRenderEndTime = (line) => {
    if (!line) {
        return Number.NEGATIVE_INFINITY;
    }
    return getLineRenderHints(line)?.renderEndTime ?? line.endTime;
};
const hasExpectedRenderHints = (line, expected) => {
    const current = line.renderHints;
    return Boolean(current
        && current.rawDuration === expected.rawDuration
        && current.timingClass === expected.timingClass
        && current.renderEndTime === expected.renderEndTime
        && current.lineTransitionMode === expected.lineTransitionMode
        && current.wordRevealMode === expected.wordRevealMode);
};
const migrateLyricLinesRenderHints = (lines) => {
    let changed = false;
    const nextLines = lines.map(line => {
        const renderHints = buildLineRenderHints(line);
        if (hasExpectedRenderHints(line, renderHints)) {
            return line;
        }
        changed = true;
        return {
            ...line,
            renderHints,
        };
    });
    return {
        value: changed ? nextLines : lines,
        changed,
    };
};
const annotateLyricLines = (lines) => {
    return migrateLyricLinesRenderHints(lines).value;
};
const ensureLyricLinesRenderHints = (lines) => {
    return migrateLyricLinesRenderHints(lines).value;
};
function migrateLyricDataRenderHints(lyrics) {
    if (!lyrics) {
        return { value: null, changed: false };
    }
    const migration = migrateLyricLinesRenderHints(lyrics.lines);
    if (!migration.changed) {
        return { value: lyrics, changed: false };
    }
    return {
        value: {
            ...lyrics,
            lines: migration.value,
        },
        changed: true,
    };
}
const ensureLyricDataRenderHints = (lyrics) => {
    return migrateLyricDataRenderHints(lyrics).value;
};

// ======== manual: manual/mini-motion.js ========
/* =========================================================================
   mini-motion —— framer-motion 动画子集的忠实实现（无构建环境用）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：为 classic 等 React/framer-motion DOM 模式的
   渲染核心落地提供运动时。只实现 Folia 模式实际用到的 API 面：

     · mmApplyVariant(el, variants, name, custom)  —— variants 三态切换
       （variant 可为函数，收 custom；打断旧动画，从当前值续跑——framer 语义）
     · transition 支持：{duration, ease, delay, times, repeat: Infinity,
       type: 'spring', stiffness, damping, transitionEnd, <prop>: {...覆盖}}
       （per-prop 覆盖该 prop 的同名字段，其余继承顶层——framer 合并语义）
       ease 可为 easing 名 / 函数 / cubic-bezier 参数数组（framer 同接受）
     · 插值器：number / color(hex|rgb|rgba|transparent → rgba 串) / filter
       等复杂值（同名函数序列逐数值插值）/ 复合值 token 通道（box-shadow/
       text-shadow/drop-shadow 类「颜色+长度」多段值：文本骨架与值类型序列
       对齐时逐段插值；形状不对齐回退函数序列通道；再不行离散关键帧）
     · 'none' 零形态（framer 渐变语义）：关键帧序列中的 'none'/'auto'/'0'
       位按第一个含复杂数值的关键帧作模板推导零形态（长度全 0 保留单位、
       颜色保留 RGB 置 alpha=0）后整体渐变插值——motion-dom
       make-none-animatable + complex.getAnimatableNone 同构；仅形状无法
       对齐的值才离散跳变
     · spring：半隐式欧拉（v += (k*(t-x)-c*v)*dt，restSpeed/restDelta 0.01，
       dt 夹 1/30）——framer-motion spring 同构
     · ease：cubicBezier 求解；tween 缺省 easeOut（framer 默认），
       easeOut=(0,0,.58,1) / easeInOut=(.42,0,.58,1) / linear——与 framer
       easing 定义同参
     · transform 组装顺序 translateX translateY scale rotate（framer 默认序）
     · mmMotionValue(get)：{get, subscribe, emit}——useMotionValueEvent 的
       等价，由引擎核心每帧轮询 get() 派发 change

   设计取舍：独立 rAF 引擎，无活动动画即停（不空转）；classic 的全部
   transition 的关键参数均为显式（Folia 源码仅依赖「tween 缺省 easeOut」
   一处缺省），故行为可精确复刻。
   ========================================================================= */

var MM_EASE_LINEAR = function (t) { return t; };

/* cubic-bezier 求值（牛顿迭代 + 二分兜底），framer-motion easing 同参 */
function mmCubicBezier(x1, y1, x2, y2) {
  var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  function sampleX(t) { return ((ax * t + bx) * t + cx) * t; }
  function sampleY(t) { return ((ay * t + by) * t + cy) * t; }
  function sampleDX(t) { return (3 * ax * t + 2 * bx) * t + cx; }
  return function (progress) {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    var t = progress;
    for (var i = 0; i < 8; i++) {
      var x = sampleX(t) - progress;
      if (Math.abs(x) < 1e-6) return sampleY(t);
      var d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= x / d;
    }
    var lo = 0, hi = 1; t = progress;
    for (var j = 0; j < 20; j++) {
      var xv = sampleX(t);
      if (Math.abs(xv - progress) < 1e-6) break;
      if (xv < progress) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

var MM_EASE = {
  linear: MM_EASE_LINEAR,
  ease: mmCubicBezier(0.25, 0.1, 0.25, 1),
  easeIn: mmCubicBezier(0.42, 0, 1, 1),
  easeOut: mmCubicBezier(0, 0, 0.58, 1),
  easeInOut: mmCubicBezier(0.42, 0, 0.58, 1)
};

function mmResolveEase(ease) {
  if (!ease) return MM_EASE.easeOut;   /* framer tween 缺省 easeOut */
  if (typeof ease === 'function') return ease;
  /* framer 也接受 cubic-bezier 参数数组（如 claddagh 主容器 [0.16,1,0.3,1]） */
  if (Array.isArray(ease) && ease.length === 4) {
    return mmCubicBezier(ease[0], ease[1], ease[2], ease[3]);
  }
  return MM_EASE[ease] || MM_EASE_LINEAR;
}

/* ---------- 颜色解析/插值（hex|rgb|rgba|transparent → [r,g,b,a]） ---------- */

var MM_COLOR_CACHE = {};
function mmParseColor(css) {
  if (MM_COLOR_CACHE[css] !== undefined) return MM_COLOR_CACHE[css];
  var out = null, s = String(css == null ? '' : css).trim();
  if (s === 'transparent') out = [0, 0, 0, 0];
  else if (s.charAt(0) === '#') {
    var hex = s.slice(1);
    var p = function (v) { return parseInt(v, 16); };
    if (/^[0-9a-fA-F]{3}$/.test(hex)) out = [p(hex[0] + hex[0]), p(hex[1] + hex[1]), p(hex[2] + hex[2]), 1];
    else if (/^[0-9a-fA-F]{6}$/.test(hex)) out = [p(hex.slice(0, 2)), p(hex.slice(2, 4)), p(hex.slice(4, 6)), 1];
    else if (/^[0-9a-fA-F]{8}$/.test(hex)) out = [p(hex.slice(0, 2)), p(hex.slice(2, 4)), p(hex.slice(4, 6)), p(hex.slice(6, 8)) / 255];
  } else {
    var m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (m) {
      var parts = m[1].split(/[,\/\s]+/).filter(function (x) { return x.length; });
      if (parts.length >= 3) {
        out = [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]),
          parts.length > 3 && parts[3] != null ? (String(parts[3]).indexOf('%') >= 0 ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1];
        if (out.some(function (v) { return !isFinite(v); })) out = null;
      }
    }
  }
  MM_COLOR_CACHE[css] = out;
  return out;
}

function mmMixColor(a, b, k) {
  var ca = mmParseColor(a), cb = mmParseColor(b);
  if (!ca || !cb) return k >= 0.5 ? b : a;
  var r = Math.round(ca[0] + (cb[0] - ca[0]) * k);
  var g = Math.round(ca[1] + (cb[1] - ca[1]) * k);
  var bl = Math.round(ca[2] + (cb[2] - ca[2]) * k);
  var al = ca[3] + (cb[3] - ca[3]) * k;
  return 'rgba(' + r + ', ' + g + ', ' + bl + ', ' + Number(al.toFixed(3)) + ')';
}

function mmIsColor(v) { return typeof v === 'string' && mmParseColor(v) != null; }

/* ---------- filter 等复杂值：同名函数序列 + 数值列表 ---------- */

var MM_FUNC_RE = /([a-zA-Z-]+)\(([^)]*)\)/g;
function mmParseComplex(css) {
  var funcs = [], nums = [], m;
  MM_FUNC_RE.lastIndex = 0;
  while ((m = MM_FUNC_RE.exec(css)) != null) {
    funcs.push(m[1]);
    m[2].split(',').forEach(function (tok) {
      var n = parseFloat(tok);
      if (isFinite(n)) nums.push(n);
    });
  }
  return funcs.length ? { funcs: funcs, nums: nums } : null;
}

/* ---------- 复合值 token 通道：shadow 类「颜色+长度」逐段插值与 'none' 零形态 ----------
   原版依据（folia-major node_modules/motion-dom，AGPL-3.0 同仓）：
   · value/types/complex/index.mjs —— analyseComplexValue 用 complexRegex 把
     CSS 值拆成（颜色|数字）值序列 + 文本模板 split[]；getAnimatableNone 把
     数字→0、颜色→color.getAnimatableNone 后按模板重拼。
   · value/types/color/index.mjs —— color.getAnimatableNone：解析后 alpha=0
     再 transform 回串（RGB 通道保留，插值时颜色通道连续渐变）。
   · animation/keyframes/utils/make-none-animatable.mjs —— 关键帧序列里
     'none'/'auto'/'0'（invalidTemplates）位用第一个「含复杂数值」的关键帧
     作模板推导零形态替换（含末帧——终态写零形态而非 'none'，视觉等价）。
   覆盖范围按管线实际色域裁剪：颜色复用 mmParseColor（hex|rgb|rgba|
   transparent，不含 hsl）、不覆盖 CSS var()/calc 除数（管线无此用法）。 */

var MM_TOKEN_RE = /#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|-?(?:\d+(?:\.\d+)?|\.\d+)/gi;

/* 'none' 等不可作模板的字面量（make-none-animatable invalidTemplates 同集） */
var MM_INVALID_TEMPLATES = { none: 1, auto: 1, '0': 1 };

/* token 化（analyseComplexValue 简化版，纯函数）：
   返回 { splits:[文本模板], vals:[颜色原文|数字], types:['num'|'color'],
          units:[num 的单位或 ''] }；无可插值值（无数字无颜色）返回 null。
   rgba(...) 整体先于裸数字被吃掉（正则分支序），嵌套括号不误切。 */
function mmParseTokens(css) {
  var s = String(css == null ? '' : css);
  var re = MM_TOKEN_RE; re.lastIndex = 0;
  var splits = [], vals = [], types = [], units = [], last = 0, m, found = false;
  while ((m = re.exec(s)) != null) {
    var tok = m[0], type = null, val = null, unit = '';
    if (tok.charAt(0) === '#' || /^rgba?\(/i.test(tok)) {
      if (!mmParseColor(tok)) continue;   /* 形似色但解析失败（越界 hex 等）→ 当文本 */
      type = 'color'; val = tok;
    } else {
      var n = parseFloat(tok);
      if (!isFinite(n)) continue;
      type = 'num'; val = n;
      var um = tok.match(/[a-z%]+/i);
      unit = um ? um[0] : '';
    }
    splits.push(s.slice(last, m.index));
    vals.push(val); types.push(type); units.push(unit);
    last = m.index + tok.length;
    found = true;
  }
  if (!found) return null;
  splits.push(s.slice(last));
  return { splits: splits, vals: vals, types: types, units: units };
}

/* 逐段插值（纯函数）：文本骨架/值类型/单位完全对齐才插值（安全方向——
   不对齐返回 null 走离散），对齐时数字逐位、颜色走既有颜色通道。 */
function mmMixTokens(a, b, k) {
  var ta = mmParseTokens(a), tb = mmParseTokens(b);
  if (!ta || !tb || ta.vals.length !== tb.vals.length) return null;
  var n = ta.vals.length, i;
  for (i = 0; i < n; i++) {
    if (ta.types[i] !== tb.types[i] || ta.splits[i] !== tb.splits[i]) return null;
    if (ta.types[i] === 'num' && ta.units[i] !== tb.units[i]) return null;
  }
  if (ta.splits[n] !== tb.splits[n]) return null;
  var out = '';
  for (i = 0; i < n; i++) {
    out += ta.splits[i];
    if (ta.types[i] === 'num') {
      var v = ta.vals[i] + (tb.vals[i] - ta.vals[i]) * k;
      out += String(Number(v.toFixed(3))) + ta.units[i];
    } else {
      out += mmMixColor(ta.vals[i], tb.vals[i], k);
    }
  }
  out += ta.splits[n];
  return out;
}

/* 零形态推导（complex.getAnimatableNone 同构，纯函数）：
   数字→0（保留单位）、颜色→保留 RGB 置 alpha=0、其余文本原样。 */
function mmZeroFormOf(template) {
  var t = mmParseTokens(template);
  if (!t) return null;
  var out = '';
  for (var i = 0; i < t.vals.length; i++) {
    out += t.splits[i];
    if (t.types[i] === 'color') {
      var c = mmParseColor(t.vals[i]);
      out += 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', 0)';
    } else {
      out += '0' + t.units[i];
    }
  }
  out += t.splits[t.vals.length];
  return out;
}

/* 关键帧 'none' 归一化（makeNoneKeyframesAnimatable 同构，纯函数）：
   找第一个非 'none'/'auto'/'0' 且可 token 化的字符串关键帧作模板，把所有
   invalid 字面量位替换为其零形态；无可作模板的返回原数组。返回拷贝，
   不改传入数组（variant 字面量可能被同变体多次复用）。 */
function mmMakeNoneKeyframesAnimatable(keyframes) {
  var template = null, i;
  for (i = 0; i < keyframes.length; i++) {
    var kf = keyframes[i];
    if (typeof kf === 'string' && !MM_INVALID_TEMPLATES[kf] && mmParseTokens(kf)) {
      template = kf; break;
    }
  }
  if (template == null) return keyframes;
  var out = null;
  for (i = 0; i < keyframes.length; i++) {
    var kf2 = keyframes[i];
    if (typeof kf2 === 'string' && kf2 !== template && MM_INVALID_TEMPLATES[kf2]) {
      var zf = mmZeroFormOf(template);
      if (zf != null) {
        if (!out) out = keyframes.slice();
        out[i] = zf;
      }
    }
  }
  return out || keyframes;
}

/* 单值对 'none' 规范化：任一端是 invalid 字面量时换成另一端的零形态 */
function mmNormalizePair(from, to) {
  if (from === to) return [from, to];
  if (MM_INVALID_TEMPLATES[from]) {
    var zf1 = mmZeroFormOf(to);
    if (zf1 != null) return [zf1, to];
  } else if (MM_INVALID_TEMPLATES[to]) {
    var zf2 = mmZeroFormOf(from);
    if (zf2 != null) return [from, zf2];
  }
  return [from, to];
}

function mmMixComplex(a, b, k) {
  var pa = mmParseComplex(a), pb = mmParseComplex(b);
  if (!pa || !pb || pa.funcs.length !== pb.funcs.length) return k >= 0.5 ? b : a;
  for (var i = 0; i < pa.funcs.length; i++) {
    if (pa.funcs[i] !== pb.funcs[i]) return k >= 0.5 ? b : a;
  }
  /* 数值按序插值，重新拼串（保留每段的原始单位与非数值 token） */
  var out = '', idx = 0, m, last = 0, re = /([a-zA-Z-]+)\(([^)]*)\)/g;
  while ((m = re.exec(a)) != null) {
    out += a.slice(last, m.index);
    var inner = '', toks = m[2].split(',');
    for (var t = 0; t < toks.length; t++) {
      var tok = toks[t], n = parseFloat(tok);
      if (isFinite(n) && idx < pb.nums.length) {
        var v = n + (pb.nums[idx] - n) * k;
        var unit = (String(tok).match(/px|deg|%| /) || [''])[0];
        inner += (t ? ',' : '') + String(Number(v.toFixed(3))) + unit;
        idx++;
      } else {
        inner += (t ? ',' : '') + tok;
      }
    }
    out += m[1] + '(' + inner + ')';
    last = m.index + m[0].length;
  }
  out += a.slice(last);
  return out;
}

/* ---------- 值插值分派（null = 不可插值 → 离散） ---------- */

function mmMixValue(from, to, k) {
  if (typeof from === 'number' && typeof to === 'number') return from + (to - from) * k;
  if (mmIsColor(from) && mmIsColor(to)) return mmMixColor(from, to, k);
  /* token 通道优先于函数序列通道：shadow 类复合值的 offset/blur 在
     func 外（mmParseComplex 提取不到，嵌套括号重拼也会误切），须逐段
     插值；对齐失败再回退 mmMixComplex（blur 等简单函数序列旧行为不变） */
  var mixed = mmMixTokens(from, to, k);
  if (mixed !== null) return mixed;
  if (mmParseComplex(from) && mmParseComplex(to)) return mmMixComplex(from, to, k);
  return null;
}

/* ---------- 元素动画状态 ---------- */

var MM_STATE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
var MM_LIVE = [];          /* 活动动画列表 */
var MM_RAF = 0;

function mmGetState(el) {
  var st = MM_STATE.get(el);
  if (!st) {
    st = { anim: {}, tf: { x: 0, y: 0, scale: 1, rotate: 0 } };
    MM_STATE.set(el, st);
  }
  return st;
}

function mmApplyTransform(el, st) {
  var tf = st.tf;
  el.style.transform = 'translateX(' + tf.x + 'px) translateY(' + tf.y + 'px) scale(' + tf.scale + ') rotate(' + tf.rotate + 'deg)';
}

/* 当前值读取（动画中取活动值，否则取内联样式/变换状态） */
function mmCurrent(el, st, prop) {
  var a = st.anim[prop];
  if (a && !a.dead) {
    if (a.cur != null && typeof a.cur === 'number') return a.cur;
  }
  if (prop === 'x' || prop === 'y' || prop === 'scale' || prop === 'rotate') return st.tf[prop];
  if (prop === 'opacity') return parseFloat(el.style.opacity || '1');
  if (prop === 'color' || prop === 'filter' || prop === 'textShadow') return el.style[prop] || '';
  return el.style[prop] || '';
}

/* ---------- 动画实例 ---------- */

function mmStartProp(el, st, prop, from, to, trans, onDone) {
  var old = st.anim[prop];
  if (old) old.dead = true;   /* 打断：新动画从各自当前值续跑（framer 语义） */

  var anim = {
    el: el, st: st, prop: prop, to: to,
    keyframes: Array.isArray(to) ? to : null,
    delay: ((trans.delay || 0) * 1000) || 0,
    duration: 0, ease: null, spring: false,
    repeat: trans.repeat || 0,
    t: 0, dead: false, cur: null,
    onDone: onDone || null, done: false
  };
  var cfg = trans[prop] || trans;   /* per-prop 覆盖，其余继承顶层 */

  if (anim.keyframes) {
    /* 'none' 关键帧先按模板归一为可插值零形态（framer makeNoneKeyframesAnimatable
       语义）——归一失败（无模板或形状不对齐）才落离散跳变 */
    anim.keyframes = mmMakeNoneKeyframesAnimatable(anim.keyframes);
    var n = anim.keyframes.length;
    var times = cfg.times || trans.times;
    if (times && times.length === n) anim.times = times.slice();
    else {
      anim.times = [];
      for (var i = 0; i < n; i++) anim.times.push(n === 1 ? 1 : i / (n - 1));
    }
    anim.duration = Math.max(((cfg.duration != null ? cfg.duration : trans.duration) || 0.3) * 1000, 1);
    anim.ease = mmResolveEase(cfg.ease != null ? cfg.ease : trans.ease);
    /* 不可插值属性（形状无法对齐的 textShadow 等）→ 离散关键帧 */
    anim.discrete = mmMixValue(anim.keyframes[0], anim.keyframes[Math.min(1, n - 1)], 0.5) === null;
  } else if (cfg.type === 'spring') {
    anim.spring = true;
    anim.from = typeof from === 'number' ? from : parseFloat(from) || 0;
    anim.stiffness = cfg.stiffness != null ? cfg.stiffness : (trans.stiffness != null ? trans.stiffness : 200);
    anim.damping = cfg.damping != null ? cfg.damping : (trans.damping != null ? trans.damping : 20);
  } else {
    var pair = mmNormalizePair(String(from), String(to));
    anim.from = typeof from === 'number' ? from : pair[0];
    anim.to = typeof to === 'number' ? to : pair[1];
    anim.duration = Math.max(((cfg.duration != null ? cfg.duration : trans.duration) || 0.3) * 1000, 1);
    anim.ease = mmResolveEase(cfg.ease != null ? cfg.ease : trans.ease);
    anim.discrete = mmMixValue(anim.from, anim.to, 0.5) === null;
  }

  st.anim[prop] = anim;
  MM_LIVE.push(anim);
  mmKick();
  return anim;
}

function mmSampleProp(anim, progress) {
  if (anim.spring) return anim.cur != null ? anim.cur : anim.from;
  if (anim.discrete) {
    var kf = anim.keyframes || [anim.from, anim.to];
    var tm = anim.times || [0, 1];
    if (progress >= 1) return kf[kf.length - 1];
    for (var i = tm.length - 1; i >= 0; i--) {
      if (progress >= tm[i]) return kf[Math.min(i, kf.length - 1)];
    }
    return kf[0];
  }
  if (anim.keyframes) {
    var kfs = anim.keyframes, times = anim.times;
    if (progress >= 1) return kfs[kfs.length - 1];
    var seg = 0;
    while (seg < times.length - 1 && progress >= times[seg + 1]) seg++;
    var t0 = times[seg], t1 = times[Math.min(seg + 1, times.length - 1)];
    var local = t1 > t0 ? (progress - t0) / (t1 - t0) : 1;
    return mmMixValue(kfs[seg], kfs[seg + 1], anim.ease(local));
  }
  return mmMixValue(anim.from, anim.to, anim.ease(progress));
}

function mmWriteProp(el, st, prop, value) {
  if (prop === 'x' || prop === 'y' || prop === 'scale' || prop === 'rotate') {
    st.tf[prop] = typeof value === 'number' ? value : (parseFloat(value) || 0);
    mmApplyTransform(el, st);
  } else if (prop === 'textShadow' || prop === 'filter' || prop === 'color' || prop === 'opacity' || prop === 'backgroundColor') {
    el.style[prop] = value;
  } else {
    try { el.style[prop] = value; } catch (e) { }
  }
}

function mmFinishAnim(anim) {
  var final = anim.keyframes ? anim.keyframes[anim.keyframes.length - 1] : anim.to;
  mmWriteProp(anim.el, anim.st, anim.prop, final);
  if (anim.st.anim[anim.prop] === anim) delete anim.st.anim[anim.prop];
  anim.dead = true;
  if (!anim.done) { anim.done = true; if (anim.onDone) anim.onDone(); }
}

/* ---------- 引擎循环 ---------- */

function mmKick() {
  if (!MM_RAF && typeof requestAnimationFrame === 'function') {
    MM_RAF = requestAnimationFrame(mmStep);
  }
}

function mmStep(now) {
  MM_RAF = 0;
  var dt = Math.min(now - (mmStep.last || now), 33);
  mmStep.last = now;
  var sdt = dt / 1000;

  for (var i = MM_LIVE.length - 1; i >= 0; i--) {
    var anim = MM_LIVE[i];
    if (anim.dead) { MM_LIVE.splice(i, 1); continue; }
    anim.t += dt;
    var elapsed = anim.t - anim.delay;
    if (elapsed < 0) continue;

    if (anim.spring) {
      if (anim.cur == null) { anim.cur = anim.from; anim.vel = 0; anim.life = 0; }
      anim.life += sdt;
      var steps = Math.max(1, Math.ceil(sdt / (1 / 120)));
      var h = sdt / steps;
      for (var s = 0; s < steps; s++) {
        var force = anim.stiffness * (anim.to - anim.cur) - anim.damping * anim.vel;
        anim.vel += force * h;
        anim.cur += anim.vel * h;
      }
      if ((Math.abs(anim.vel) < 0.01 && Math.abs(anim.to - anim.cur) < 0.01) || anim.life > 8) {
        mmFinishAnim(anim);
        MM_LIVE.splice(i, 1);
        continue;
      }
      mmWriteProp(anim.el, anim.st, anim.prop, anim.cur);
      continue;
    }

    var progress = elapsed / anim.duration;
    if (anim.repeat && anim.duration > 0) {
      progress = progress % 1;
    } else if (progress >= 1) {
      mmFinishAnim(anim);
      MM_LIVE.splice(i, 1);
      continue;
    }
    mmWriteProp(anim.el, anim.st, anim.prop, mmSampleProp(anim, progress));
  }

  if (MM_LIVE.length) mmKick();
  else mmStep.last = 0;
}

/* ---------- variants 应用（framer animate 变体切换语义） ---------- */

function mmResolveVariant(variant, custom) {
  if (typeof variant === 'function') return variant(custom);
  return variant;
}

/**
 * 把 variant 目标应用到元素：对每个目标属性建立/替换动画；
 * transitionEnd 在该变体的全部有限动画完成后写入（framer 语义：收尾状态）。
 * 缺席键不动（保持当前值）——wordGlow passed 分支注释所述「新 variant 缺席
 * 键回退 initial」的行为，classic 各变体均已显式补键，不依赖该语义。
 */
function mmApplyVariant(el, variants, name, custom) {
  var st = mmGetState(el);
  var variant = mmResolveVariant(variants && variants[name], custom);
  if (!variant) return null;

  var end = variant.transitionEnd || null;
  var trans = variant.transition || {};
  var pending = 0;
  var endApplied = false;

  var onPropDone = function () {
    pending--;
    if (pending <= 0 && end && !endApplied) {
      endApplied = true;
      for (var k in end) {
        if (Object.prototype.hasOwnProperty.call(end, k)) {
          var a = st.anim[k];
          if (a) { a.dead = true; delete st.anim[k]; }
          mmWriteProp(el, st, k, end[k]);
        }
      }
    }
  };

  for (var prop in variant) {
    if (!Object.prototype.hasOwnProperty.call(variant, prop)) continue;
    if (prop === 'transition' || prop === 'transitionEnd') continue;
    var to = variant[prop];
    var cfg = trans[prop] || trans;
    var infinite = (trans.repeat === Infinity) || (cfg.repeat === Infinity);
    var spring = cfg.type === 'spring';

    if (infinite || spring) {
      /* 无限循环/spring 不参与 transitionEnd 计数 */
    } else {
      pending++;
    }
    if (Array.isArray(to)) {
      mmStartProp(el, st, prop, null, to, trans, (!infinite && !spring) ? onPropDone : null);
    } else {
      mmStartProp(el, st, prop, mmCurrent(el, st, prop), to, trans, (!infinite && !spring) ? onPropDone : null);
    }
  }
  if (pending <= 0 && end && !endApplied) {
    endApplied = true;
    for (var k2 in end) {
      if (Object.prototype.hasOwnProperty.call(end, k2)) {
        var a2 = st.anim[k2];
        if (a2) { a2.dead = true; delete st.anim[k2]; }
        mmWriteProp(el, st, k2, end[k2]);
      }
    }
  }
  return variant;
}

/* 初值直达（initial，无动画；数组关键帧取首值） */
function mmSetInitial(el, variant, custom) {
  var st = mmGetState(el);
  var v = mmResolveVariant(variant, custom);
  if (!v) return;
  for (var prop in v) {
    if (!Object.prototype.hasOwnProperty.call(v, prop)) continue;
    if (prop === 'transition' || prop === 'transitionEnd') continue;
    var val = v[prop];
    if (Array.isArray(val)) val = val[0];
    if (typeof val === 'object' && !(typeof val === 'string')) continue;
    mmWriteProp(el, st, prop, val);
  }
}

/* ---------- MotionValue 等价（引擎核心每帧轮询 get 派发 change） ---------- */

function mmMotionValue(getter) {
  return {
    get: getter,
    subs: [],
    subscribe: function (fn) { this.subs.push(fn); },
    emit: function (v) { for (var i = 0; i < this.subs.length; i++) this.subs[i](v); }
  };
}

// ======== manual: manual/cappella-engine-core.js ========
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

var CM_colorWithAlpha = colorWithAlpha;
env.CM_colorWithAlpha = CM_colorWithAlpha;
var CM_parseColorChannels = parseColorChannels;
env.CM_parseColorChannels = CM_parseColorChannels;
var CM_mixColors = mixColors;
env.CM_mixColors = CM_mixColors;
var CM_buildLineRenderHints = buildLineRenderHints;
env.CM_buildLineRenderHints = CM_buildLineRenderHints;
var CM_getLineRenderHints = getLineRenderHints;
env.CM_getLineRenderHints = CM_getLineRenderHints;
var CM_getLineRenderEndTime = getLineRenderEndTime;
env.CM_getLineRenderEndTime = CM_getLineRenderEndTime;
var CM_MICRO_LINE_DURATION_THRESHOLD = MICRO_LINE_DURATION_THRESHOLD;
env.CM_MICRO_LINE_DURATION_THRESHOLD = CM_MICRO_LINE_DURATION_THRESHOLD;
var CM_SHORT_LINE_DURATION_THRESHOLD = SHORT_LINE_DURATION_THRESHOLD;
env.CM_SHORT_LINE_DURATION_THRESHOLD = CM_SHORT_LINE_DURATION_THRESHOLD;
var CM_buildLineGraphemeTimeline = buildLineGraphemeTimeline;
env.CM_buildLineGraphemeTimeline = CM_buildLineGraphemeTimeline;
var CM_buildWordGraphemeTimings = buildWordGraphemeTimings;
env.CM_buildWordGraphemeTimings = CM_buildWordGraphemeTimings;
var CM_splitLyricGraphemes = splitLyricGraphemes;
env.CM_splitLyricGraphemes = CM_splitLyricGraphemes;
var CM_resolveThemeFontStack = resolveThemeFontStack;
env.CM_resolveThemeFontStack = CM_resolveThemeFontStack;
var CM_resolveThemeTranslationFontStack = resolveThemeTranslationFontStack;
env.CM_resolveThemeTranslationFontStack = CM_resolveThemeTranslationFontStack;
var CM_resolveThemeFontWeight = resolveThemeFontWeight;
env.CM_resolveThemeFontWeight = CM_resolveThemeFontWeight;
var CM_createCappellaAgentSenderResolver = createCappellaAgentSenderResolver;
env.CM_createCappellaAgentSenderResolver = CM_createCappellaAgentSenderResolver;
env.CappellaCappellaEngine = (typeof CappellaCappellaEngine !== "undefined") ? CappellaCappellaEngine : null;
})(typeof pretext !== "undefined" ? pretext : {}, typeof window !== "undefined" ? window : this);