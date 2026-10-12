// OrangeSea CADENZA ENGINE (AGPL-3.0, from folia-major) -- no-build bundle
(function (pretext, env) {
"use strict";
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

// ======== components/visualizer/subtitleFontSizes ========
// src/components/visualizer/subtitleFontSizes.ts
// 底部字幕（译文 / 下一句预览）那两组 clamp 字号的**唯一来源**，此前在每个模式里各抄一份
// （classic / cadenza / diorama / tilt / 模组宿主），改一次字号要动五个文件。
//
// 两组都是 `clamp(min, preferred, max)`：下限防止窄屏上字被压到读不出，上限防止宽屏上
// 顶到屏沿。`vw` 中间值让它在常见比例下跟着画面缩放——写死 rem 会在大屏上偏小、
// 在小窗口里偏大。
const clampSize = (min, preferred, max, scale) => (`clamp(${(min * scale).toFixed(3)}rem, ${(preferred * scale).toFixed(3)}vw, ${(max * scale).toFixed(3)}rem)`);
/**
 * 译文 / 下一句预览的字号。`lyricsFontScale` 是宿主的歌词字号倍率，缺省 1。
 * 各模式之间这两个数必须完全一致，否则字幕会在换模式的那一下跳一下大小。
 */
const resolveSubtitleFontSizes = (lyricsFontScale = 1) => {
    const scale = Number.isFinite(lyricsFontScale) && lyricsFontScale > 0 ? lyricsFontScale : 1;
    return {
        translationFontSize: clampSize(1.125, 2.6, 1.25, scale),
        upcomingFontSize: clampSize(0.875, 2, 1, scale),
    };
};

// ======== components/visualizer/wordColoring ========
const CJK_REGEX = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/;
const isCJK = (text) => CJK_REGEX.test(text);
const normalizeWordColorToken = (text) => text.toLowerCase().replace(/[^\w]/g, '');
const resolveWordColorEntryText = (entry) => {
    if (!entry || typeof entry !== 'object' || !('word' in entry)) {
        return '';
    }
    const word = entry.word;
    return typeof word === 'string' ? word.trim() : '';
};
const resolveWordColorEntryColor = (entry) => {
    if (!entry || typeof entry !== 'object' || !('color' in entry)) {
        return '';
    }
    const color = entry.color;
    return typeof color === 'string' ? color : '';
};
const rangesOverlap = (a, b) => (a.startOffset < b.endOffset && b.startOffset < a.endOffset);
const selectNonOverlappingRanges = (ranges) => {
    const selected = [];
    const prioritySorted = [...ranges].sort((a, b) => (b.priority - a.priority
        || a.startOffset - b.startOffset
        || a.endOffset - b.endOffset));
    prioritySorted.forEach(range => {
        if (!selected.some(current => rangesOverlap(current, range))) {
            selected.push(range);
        }
    });
    return selected.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
};
const prepareWordColorMatchers = (wordColors, keywordColoringEnabled = true) => {
    if (!keywordColoringEnabled || !wordColors || wordColors.length === 0) {
        return [];
    }
    return wordColors.flatMap(entry => {
        const target = resolveWordColorEntryText(entry);
        if (!target) {
            return [];
        }
        const color = resolveWordColorEntryColor(entry);
        if (!color) {
            return [];
        }
        if (isCJK(target)) {
            return [{
                    color,
                    cjkPhrases: [target],
                    englishWords: [],
                    priority: target.length,
                }];
        }
        const englishWords = target
            .split(/\s+/)
            .map(normalizeWordColorToken)
            .filter(Boolean);
        if (englishWords.length === 0) {
            return [];
        }
        return [{
                color,
                cjkPhrases: [],
                englishWords,
                priority: Math.max(...englishWords.map(word => word.length)),
            }];
    });
};
/** Builds phrase color ranges once per line so token renderers can resolve colors with a single ordered pass. */
const buildWordColorRangesFromMatchers = (lineText, matchers) => {
    if (!lineText || matchers.length === 0) {
        return [];
    }
    const ranges = [];
    const englishColorByWord = new Map();
    matchers.forEach(matcher => {
        matcher.cjkPhrases.forEach(target => {
            let cursor = 0;
            while (cursor < lineText.length) {
                const startOffset = lineText.indexOf(target, cursor);
                if (startOffset < 0) {
                    break;
                }
                ranges.push({
                    startOffset,
                    endOffset: startOffset + target.length,
                    color: matcher.color,
                    priority: matcher.priority,
                });
                cursor = startOffset + Math.max(target.length, 1);
            }
        });
        matcher.englishWords.forEach(word => {
            const current = englishColorByWord.get(word);
            if (!current || matcher.priority > current.priority) {
                englishColorByWord.set(word, { color: matcher.color, priority: matcher.priority });
            }
        });
    });
    if (englishColorByWord.size > 0) {
        const wordRegex = /\w+/g;
        let match;
        while ((match = wordRegex.exec(lineText)) !== null) {
            const wordColor = englishColorByWord.get(normalizeWordColorToken(match[0]));
            if (wordColor) {
                ranges.push({
                    startOffset: match.index,
                    endOffset: match.index + match[0].length,
                    color: wordColor.color,
                    priority: wordColor.priority,
                });
            }
        }
    }
    return selectNonOverlappingRanges(ranges);
};
const buildWordColorRanges = (lineText, wordColors, keywordColoringEnabled = true) => (buildWordColorRangesFromMatchers(lineText, prepareWordColorMatchers(wordColors, keywordColoringEnabled)));
const resolveWordColor = (wordText, wordColors, fallbackColor, { keywordColoringEnabled = true, cjkMatchMode = 'target-contains-token', } = {}) => {
    if (!keywordColoringEnabled || !wordColors || wordColors.length === 0) {
        return fallbackColor;
    }
    const cleanCurrent = wordText.trim();
    if (!cleanCurrent) {
        return fallbackColor;
    }
    const matched = wordColors.find(entry => {
        const target = resolveWordColorEntryText(entry);
        if (!target) {
            return false;
        }
        if (isCJK(cleanCurrent)) {
            if (cjkMatchMode === 'exact') {
                return target === cleanCurrent;
            }
            if (cjkMatchMode === 'bidirectional-contains') {
                return target.includes(cleanCurrent) || cleanCurrent.includes(target);
            }
            return target.includes(cleanCurrent);
        }
        const targetWords = target
            .split(/\s+/)
            .map(normalizeWordColorToken)
            .filter(Boolean);
        const normalizedCurrent = normalizeWordColorToken(cleanCurrent);
        return Boolean(normalizedCurrent) && targetWords.includes(normalizedCurrent);
    });
    return resolveWordColorEntryColor(matched) || fallbackColor;
};
const resolveTokenColorMap = (tokens, ranges) => {
    const colors = new Map();
    let rangeIndex = 0;
    tokens.forEach(token => {
        if (!token.timed) {
            return;
        }
        while (rangeIndex < ranges.length && ranges[rangeIndex].endOffset <= token.startOffset) {
            rangeIndex += 1;
        }
        const range = ranges[rangeIndex];
        if (range && rangesOverlap(range, token)) {
            colors.set(token.key, range.color);
        }
    });
    return colors;
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

// ======== utils/glowBlurQuantize ========
// src/utils/glowBlurQuantize.ts
// Lab > "Fix lyric animation freeze on Linux": whether the visualizers avoid asking Chromium's glyph
// cache for an unbounded set of glyph sizes and shadow radii. While it is on:
// - glows are drawn as `drop-shadow()` filters instead of text-shadows or canvas shadows (classic and
//   partita in wordGlow.ts, claddagh, fume's live line via `setCanvasTextGlow`);
// - canvas blur radii are whole pixels (`quantizeShadowBlur`);
// - text scaled by a style transform every frame gets its own compositing layer (cadenza's overlay);
// - text drawn under a zooming camera is rasterized at a bounded set of scales and placed under the
//   camera afterwards (fume's live line, fume/fumeLiveRaster.ts).
//
// A blur radius that changes every frame makes Chromium mint a new glyph strike per frame, each
// costing a 4 KiB shared-memory chunk that is never returned; on Linux that is an fd in the renderer
// and GPU process, and the renderer's soft limit of 1024 runs out after ~35 minutes of playback. The
// full story is in docs/linux-glyph-cache-fd-leak.md.
//
// On by default on Linux only: the drop-shadow glow looks nearly, but not exactly, the same, and
// elsewhere the leak costs a few MB a day - too little to be worth any visual difference.
const GLOW_BLUR_QUANTIZE_STORAGE_KEY = 'visualizer_glow_blur_quantize';
/** Linux, desktop or browser - the one platform where the leak ends in a frozen compositor. */
const isLinuxRuntime = () => {
    if (typeof window === 'undefined')
        return false;
    const electronPlatform = window.electron?.platform;
    if (electronPlatform)
        return electronPlatform === 'linux';
    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return /Linux/.test(userAgent) && !/Android/.test(userAgent);
};
/** The stored choice, or the platform default when the user never touched the switch. */
const readStoredGlowBlurQuantize = () => {
    try {
        const stored = localStorage.getItem(GLOW_BLUR_QUANTIZE_STORAGE_KEY);
        if (stored === 'true' || stored === 'false')
            return stored === 'true';
    }
    catch {
        // Storage blocked: fall through to the default.
    }
    return isLinuxRuntime();
};
// Module-level on purpose, like the frame-rate limiter: the canvas renderers read it every frame and
// have no business subscribing to a store for it.
let glowBlurQuantized = readStoredGlowBlurQuantize();
const isGlowBlurQuantized = () => glowBlurQuantized;
const setGlowBlurQuantized = (enabled) => {
    glowBlurQuantized = enabled;
};
/**
 * A shadow blur radius as it should be drawn: rounded to whole pixels while the switch is on, so a
 * sweep only ever produces a bounded set of radii; untouched when it is off.
 */
const quantizeShadowBlur = (px) => {
    if (!Number.isFinite(px))
        return 0;
    return glowBlurQuantized ? Math.max(0, Math.round(px)) : px;
};
/**
 * Sets the glow for the text drawn next on `context`: a canvas shadow when the switch is off; while it is
 * on, the same glow as a `drop-shadow()` filter (sigma = shadowBlur / 2, and neither follows the CTM, so
 * they match to under 1/255). A shadowed glyph is cached per device size, and a text canvas under a moving
 * camera keeps asking for new ones; a filter is applied to the drawn layer and never reaches the glyph
 * cache. Undo with `clearCanvasTextGlow`, which also resets `context.filter`.
 */
const setCanvasTextGlow = (context, blur, color) => {
    if (!glowBlurQuantized) {
        context.shadowBlur = blur;
        context.shadowColor = color;
        return;
    }
    context.shadowBlur = 0;
    context.shadowColor = 'transparent';
    context.filter = blur > 0 ? `drop-shadow(0 0 ${blur / 2}px ${color})` : 'none';
};
const clearCanvasTextGlow = (context) => {
    context.shadowBlur = 0;
    context.shadowColor = 'transparent';
    if (glowBlurQuantized)
        context.filter = 'none';
};
const GLOW_FILTER_SIGMA = /^drop-shadow\(0 0 ([\d.]+)px /;
/**
 * `fillText` for text drawn with `setCanvasTextGlow`. While the glow is a filter, the draw is clipped to
 * the text and its glow: Chromium renders a canvas filter into a layer the size of the clip, which is the
 * whole canvas unless something narrows it, and that took fume from 120 to ~90 fps. Callers that already
 * clip each draw tightly can keep calling `fillText`.
 */
const fillGlowText = (context, text, x, y) => {
    const sigma = Number(GLOW_FILTER_SIGMA.exec(context.filter)?.[1] ?? 0);
    if (!sigma) {
        context.fillText(text, x, y);
        return;
    }
    const metrics = context.measureText(text);
    // Four sigmas: three for the blur, the rest for a camera scale down to 0.75 (the filter ignores the CTM).
    const pad = sigma * 4 + 4;
    const left = x - metrics.actualBoundingBoxLeft - pad;
    const top = y - metrics.actualBoundingBoxAscent - pad;
    context.save();
    context.beginPath();
    context.rect(left, top, metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight + pad * 2, metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + pad * 2);
    context.clip();
    context.fillText(text, x, y);
    context.restore();
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

// ======== manual: manual/cadenza-engine-core.js ========
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

var CM_isGlowBlurQuantized = isGlowBlurQuantized;
env.CM_isGlowBlurQuantized = CM_isGlowBlurQuantized;
var CM_quantizeShadowBlur = quantizeShadowBlur;
env.CM_quantizeShadowBlur = CM_quantizeShadowBlur;
var CM_GLOW_BLUR_QUANTIZE_STORAGE_KEY = GLOW_BLUR_QUANTIZE_STORAGE_KEY;
env.CM_GLOW_BLUR_QUANTIZE_STORAGE_KEY = CM_GLOW_BLUR_QUANTIZE_STORAGE_KEY;
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
var CM_getLineTransitionTiming = getLineTransitionTiming;
env.CM_getLineTransitionTiming = CM_getLineTransitionTiming;
var CM_MICRO_LINE_DURATION_THRESHOLD = MICRO_LINE_DURATION_THRESHOLD;
env.CM_MICRO_LINE_DURATION_THRESHOLD = CM_MICRO_LINE_DURATION_THRESHOLD;
var CM_SHORT_LINE_DURATION_THRESHOLD = SHORT_LINE_DURATION_THRESHOLD;
env.CM_SHORT_LINE_DURATION_THRESHOLD = CM_SHORT_LINE_DURATION_THRESHOLD;
var CM_buildWordGraphemeTimings = buildWordGraphemeTimings;
env.CM_buildWordGraphemeTimings = CM_buildWordGraphemeTimings;
var CM_splitLyricGraphemes = splitLyricGraphemes;
env.CM_splitLyricGraphemes = CM_splitLyricGraphemes;
var CM_resolveThemeFontStack = resolveThemeFontStack;
env.CM_resolveThemeFontStack = CM_resolveThemeFontStack;
var CM_resolveThemeFontWeight = resolveThemeFontWeight;
env.CM_resolveThemeFontWeight = CM_resolveThemeFontWeight;
var CM_resolveWordColor = resolveWordColor;
env.CM_resolveWordColor = CM_resolveWordColor;
var CM_buildWordColorRanges = buildWordColorRanges;
env.CM_buildWordColorRanges = CM_buildWordColorRanges;
var CM_prepareWordColorMatchers = prepareWordColorMatchers;
env.CM_prepareWordColorMatchers = CM_prepareWordColorMatchers;
var CM_resolveSubtitleFontSizes = resolveSubtitleFontSizes;
env.CM_resolveSubtitleFontSizes = CM_resolveSubtitleFontSizes;
env.CadenzaCadenzaEngine = (typeof CadenzaCadenzaEngine !== "undefined") ? CadenzaCadenzaEngine : null;
env.cadenzaGetWordStatus = (typeof cadenzaGetWordStatus !== "undefined") ? cadenzaGetWordStatus : null;
env.cadenzaGetWordProgress = (typeof cadenzaGetWordProgress !== "undefined") ? cadenzaGetWordProgress : null;
env.cadenzaGetGlowEnvelope = (typeof cadenzaGetGlowEnvelope !== "undefined") ? cadenzaGetGlowEnvelope : null;
env.cadenzaGetCharGlow = (typeof cadenzaGetCharGlow !== "undefined") ? cadenzaGetCharGlow : null;
env.cadenzaGetBodyMix = (typeof cadenzaGetBodyMix !== "undefined") ? cadenzaGetBodyMix : null;
env.cadenzaGetLineEnvelope = (typeof cadenzaGetLineEnvelope !== "undefined") ? cadenzaGetLineEnvelope : null;
env.cadenzaChooseFontPx = (typeof cadenzaChooseFontPx !== "undefined") ? cadenzaChooseFontPx : null;
env.cadenzaResolveLineRenderTiming = (typeof cadenzaResolveLineRenderTiming !== "undefined") ? cadenzaResolveLineRenderTiming : null;
env.cadenzaBuildWordPlacements = (typeof cadenzaBuildWordPlacements !== "undefined") ? cadenzaBuildWordPlacements : null;
env.cadenzaFindLineIndexAtTime = (typeof cadenzaFindLineIndexAtTime !== "undefined") ? cadenzaFindLineIndexAtTime : null;
env.cadenzaGetUpcomingLine = (typeof cadenzaGetUpcomingLine !== "undefined") ? cadenzaGetUpcomingLine : null;
env.cadenzaBuildDomTextShadow = (typeof cadenzaBuildDomTextShadow !== "undefined") ? cadenzaBuildDomTextShadow : null;
})(typeof pretext !== "undefined" ? pretext : {}, typeof window !== "undefined" ? window : this);