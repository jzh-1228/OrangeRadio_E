// OrangeSea PARTITA ENGINE (AGPL-3.0, from folia-major) -- no-build bundle
(function (env) {
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

// ======== components/visualizer/wordColoring ========
const CJK_REGEX__1 = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/;
const isCJK = (text) => CJK_REGEX__1.test(text);
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

// ======== utils/lyrics/wordSegmentation ========

const PUNCTUATION_ONLY = /^[\s\p{P}\p{S}]+$/u;
const isWordLikeText = (text) => !PUNCTUATION_ONLY.test(text);
/**
 * Rebuilds full segment records from a bare boundary list. Used both for the user's saved
 * segmentation and for anything that stores boundaries as plain strings.
 */
const segmentsFromBoundaries = (boundaries) => {
    let cursor = 0;
    return boundaries.map(segment => {
        const part = { segment, index: cursor, isWordLike: isWordLikeText(segment) };
        cursor += segment.length;
        return part;
    });
};
/**
 * Intl.Segmenter word split, falling back to graphemes when the runtime has no Segmenter. The
 * fallback preserves every code unit, so offsets stay valid and line timing is never lost.
 */
const segmentTextWords = (text) => {
    if (!text) {
        return [];
    }
    const Segmenter = typeof Intl !== 'undefined' ? Intl.Segmenter : undefined;
    if (Segmenter) {
        try {
            return Array.from(new Segmenter(undefined, { granularity: 'word' }).segment(text), part => ({
                segment: part.segment,
                index: part.index,
                isWordLike: part.isWordLike ?? isWordLikeText(part.segment),
            }));
        }
        catch {
            // The grapheme fallback below preserves every code unit and the line timing.
        }
    }
    return segmentsFromBoundaries(splitLyricGraphemes(text));
};
/**
 * True when the boundaries reconstruct the text exactly. A saved segmentation that fails this is
 * stale (the lyric source changed under it) and must be ignored rather than applied at an offset.
 */
const isValidWordSegmentation = (text, boundaries) => (Array.isArray(boundaries)
    && boundaries.length > 0
    && boundaries.every(segment => typeof segment === 'string')
    && boundaries.join('') === text);
const EDGE_WHITESPACE = /^(\s*)(.*?)(\s*)$/su;
/**
 * Lifts the whitespace at a saved boundary's edges out into segments of its own, so a saved split
 * reaches the consumers in the same shape Intl.Segmenter would have produced.
 *
 * Intl.Segmenter always emits a whitespace run as a segment in its own right, and every consumer is
 * written against that. tempera tells a real word gap from a bare CJK word boundary by the hole a
 * dropped whitespace segment leaves in the offsets, and cjkSemanticLayout skips whitespace segments
 * when aligning to parser words, which never contain any. The saved format is the other way round:
 * the prompt tells the model that a space belongs to the segment before it, and
 * realignSegmentsToText attaches the line's real whitespace to whichever slice sits next to it. So
 * an unsplit boundary arrives downstream as a word with a space glued on — which read as "no space
 * here" in tempera, and failed to align at all in cjkSemanticLayout.
 *
 * Whitespace INSIDE a segment is deliberately left alone. It is the one thing this format can say
 * that Intl.Segmenter cannot — a multi-word phrase the user kept together on purpose — and the
 * consumers already handle it (or already fall back) exactly as they do today. Punctuation is left
 * attached for the same reason: the sticky passes in tempera and sonnet would re-attach it anyway.
 */
const splitEdgeWhitespace = (boundaries) => boundaries.flatMap(boundary => {
    const [, lead, core, trail] = EDGE_WHITESPACE.exec(boundary) ?? [];
    // No core means the boundary is whitespace only, which is already the shape we want.
    return core ? [lead, core, trail].filter(Boolean) : [boundary].filter(Boolean);
});
/** Word segments for a line: the user's saved split when it is valid, else Intl.Segmenter. */
const segmentLyricWords = (line) => {
    if (isValidWordSegmentation(line.fullText, line.wordSegments)) {
        return segmentsFromBoundaries(splitEdgeWhitespace(line.wordSegments));
    }
    return segmentTextWords(line.fullText);
};
/**
 * Fingerprint of a line's saved split, for layout cache keys and memo dependencies.
 *
 * Boundary LENGTHS rather than the segment text: the boundaries always join back to the line's own
 * `fullText`, which every caller of this already keys on, so the lengths alone pin the split down
 * exactly — and no second copy of the lyric is built on paths that run per frame. Empty string when
 * the line is on the default split, so adding it to a key changes nothing for lyrics without one.
 */
const getWordSegmentationKey = (line) => (line.wordSegments ? line.wordSegments.map(segment => segment.length).join(',') : '');
/** Whether this line will render with a user-supplied split rather than the default one. */
const hasWordSegmentationOverride = (line) => (isValidWordSegmentation(line.fullText, line.wordSegments));

// ======== utils/lyrics/cjkSemanticLayout ========

const CJK_REGEX__2 = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/;
const WHITESPACE_REGEX = /^\s+$/;
const APOSTROPHE_ONLY_REGEX = /^['’]\s*$/;
const CONTRACTION_SUFFIX_REGEX = /^(s|t|m|d|ll|re|ve|em)\s*$/i;
const DIRECT_CONTRACTION_REGEX = /^['’](s|t|m|d|ll|re|ve|em)\s*$/i;
const TRAILING_APOSTROPHE_REGEX = /['’]\s*$/;
const TRAILING_WORD_CHAR_REGEX = /[\p{L}\p{N}]$/u;
const INLINE_CONTRACTION_REGEX = /[\p{L}\p{N}]+['’](s|t|m|d|ll|re|ve|em)/iu;
const STICKY_TRAILING_PUNCTUATION_REGEX = /^[,.;:!?，。！？、：；）】》」』〉〕］)}\]"'’”’]+$/u;
const hasCjkText = (text) => CJK_REGEX__2.test(text);
const createSingleWordLayoutUnits = (words) => words.map(word => ({
    text: word.text,
    words: [word],
    startTime: word.startTime,
    endTime: word.endTime,
    isSemantic: false,
}));
// Delegates to the one word segmenter in the codebase, which also honours the user's saved
// segmentation for this line. Only the two fields this file aligns on are kept.
const getWordSegments = (line) => {
    const segments = segmentLyricWords(line);
    return segments.length > 0
        ? segments.map(({ segment, isWordLike }) => ({ segment, isWordLike }))
        : null;
};
const appendWordsToUnit = (unit, text, words) => {
    unit.text += text;
    unit.words.push(...words);
    unit.endTime = words[words.length - 1]?.endTime ?? unit.endTime;
};
const cloneUnit = (unit) => ({
    ...unit,
    words: [...unit.words],
});
const appendUnitToStickyUnit = (target, unit) => {
    target.text += unit.text;
    target.words.push(...unit.words);
    target.endTime = unit.endTime;
    target.isSticky = true;
};
const canAttachToPrevious = (text) => TRAILING_WORD_CHAR_REGEX.test(text.trimEnd());
const endsWithApostrophe = (text) => TRAILING_APOSTROPHE_REGEX.test(text.trimEnd());
const isApostropheOnlyUnit = (unit) => APOSTROPHE_ONLY_REGEX.test(unit.text.trim());
const isContractionSuffixUnit = (unit) => CONTRACTION_SUFFIX_REGEX.test(unit.text.trim());
const isDirectContractionUnit = (unit) => DIRECT_CONTRACTION_REGEX.test(unit.text.trim());
const isStickyTrailingPunctuationUnit = (unit) => STICKY_TRAILING_PUNCTUATION_REGEX.test(unit.text.trim());
const hasAttachedTrailingPunctuation = (unit) => {
    if (unit.words.length <= 1) {
        return false;
    }
    const lastWord = unit.words[unit.words.length - 1];
    return Boolean(lastWord && isStickyTrailingPunctuationUnit({
        text: lastWord.text,
        words: [lastWord],
        startTime: lastWord.startTime,
        endTime: lastWord.endTime,
        isSemantic: false,
    }));
};
const hasInlineContraction = (unit) => (unit.words.length > 1
    && !unit.isSemantic
    && INLINE_CONTRACTION_REGEX.test(unit.text));
// Maps Intl.Segmenter output back onto parser words.
// If any segment cannot be aligned exactly, callers fall back to one-word units instead of guessing.
const mapSegmentsToWords = (segments, words) => {
    const units = [];
    let wordIndex = 0;
    for (const segment of segments) {
        const segmentText = segment.segment;
        if (!segmentText || WHITESPACE_REGEX.test(segmentText)) {
            continue;
        }
        const startWordIndex = wordIndex;
        let collectedText = '';
        while (wordIndex < words.length && collectedText.length < segmentText.length) {
            collectedText += words[wordIndex].text;
            wordIndex += 1;
            if (!segmentText.startsWith(collectedText)) {
                return null;
            }
        }
        if (collectedText !== segmentText) {
            return null;
        }
        const segmentWords = words.slice(startWordIndex, wordIndex);
        const firstWord = segmentWords[0];
        const lastWord = segmentWords[segmentWords.length - 1];
        if (!firstWord || !lastWord) {
            return null;
        }
        if (!segment.isWordLike && units.length > 0) {
            appendWordsToUnit(units[units.length - 1], segmentText, segmentWords);
            continue;
        }
        units.push({
            text: segmentText,
            words: segmentWords,
            startTime: firstWord.startTime,
            endTime: lastWord.endTime,
            isSemantic: Boolean(segment.isWordLike && hasCjkText(segmentText) && segmentWords.length > 1),
        });
    }
    if (wordIndex !== words.length || units.length === 0) {
        return null;
    }
    return units;
};
// Legacy-compatible helper: only performs CJK semantic grouping.
// It does not apply sticky punctuation, so existing callers can keep the old behavior.
const buildCjkSemanticLayoutUnits = (line) => {
    if (line.words.length === 0) {
        return [];
    }
    const fallbackUnits = createSingleWordLayoutUnits(line.words);
    // The CJK gate exists because Intl.Segmenter only adds information over parser words for
    // scripts without spaces. A user-supplied split is deliberate in any script, so it skips it.
    if (!hasCjkText(line.fullText) && !hasWordSegmentationOverride(line)) {
        return fallbackUnits;
    }
    const segments = getWordSegments(line);
    if (!segments) {
        return fallbackUnits;
    }
    return mapSegmentsToWords(segments, line.words) ?? fallbackUnits;
};
// Attaches punctuation-like layout units to the previous unit before a visualizer splits rows/chunks.
// This prevents source fragments such as `It`, `’`, `s` from being placed in separate visual layers.
const applyStickyPunctuationLayoutUnits = (units) => {
    const merged = [];
    for (let index = 0; index < units.length; index += 1) {
        const current = units[index];
        const previous = merged[merged.length - 1];
        if (!previous) {
            merged.push(cloneUnit(current));
            continue;
        }
        const next = units[index + 1];
        if (isApostropheOnlyUnit(current)
            && next
            && canAttachToPrevious(previous.text)
            && isContractionSuffixUnit(next)) {
            appendUnitToStickyUnit(previous, current);
            appendUnitToStickyUnit(previous, next);
            index += 1;
            continue;
        }
        if (isDirectContractionUnit(current) && canAttachToPrevious(previous.text)) {
            appendUnitToStickyUnit(previous, current);
            continue;
        }
        if (isContractionSuffixUnit(current) && endsWithApostrophe(previous.text)) {
            appendUnitToStickyUnit(previous, current);
            continue;
        }
        if (isStickyTrailingPunctuationUnit(current) && canAttachToPrevious(previous.text)) {
            appendUnitToStickyUnit(previous, current);
            continue;
        }
        merged.push(cloneUnit(current));
    }
    return merged.map(unit => (hasAttachedTrailingPunctuation(unit) || hasInlineContraction(unit)
        ? { ...unit, isSticky: true }
        : unit));
};
// Main post-parser entry point for visualizer layout preparation.
// Order is intentional: semantic grouping first, sticky punctuation second.
//
// Examples:
//
//   buildPostLyricLayoutUnits(line, { semantic: false, sticky: false })
//   -> one layout unit per parser word
//
//   buildPostLyricLayoutUnits(line, { semantic: true, sticky: false })
//   -> CJK semantic units only
//
//   buildPostLyricLayoutUnits(line, { semantic: true, sticky: true })
//   -> CJK semantic units, then punctuation/contraction attachment
const buildPostLyricLayoutUnits = (line, options = {}) => {
    const rawUnits = options.semantic
        ? buildCjkSemanticLayoutUnits(line)
        : createSingleWordLayoutUnits(line.words);
    return options.sticky
        ? applyStickyPunctuationLayoutUnits(rawUnits)
        : rawUnits;
};
// Converts layout units into the words a renderer should actually draw.
// Sticky non-semantic units become one rendered Word, e.g. It + ’ + s -> It’s.
// Semantic CJK units return their original words so per-character timing remains available.
const buildDisplayWordsFromLayoutUnits = (units) => units.flatMap(unit => {
    if (!unit.isSticky || unit.isSemantic) {
        return unit.words;
    }
    return [{
            text: unit.text,
            startTime: unit.startTime,
            endTime: unit.endTime,
        }];
});

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

// ======== manual: manual/partita-engine-core.js ========
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

var CM_isGlowBlurQuantized = isGlowBlurQuantized;
env.CM_isGlowBlurQuantized = CM_isGlowBlurQuantized;
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
var CM_MICRO_LINE_DURATION_THRESHOLD = MICRO_LINE_DURATION_THRESHOLD;
env.CM_MICRO_LINE_DURATION_THRESHOLD = CM_MICRO_LINE_DURATION_THRESHOLD;
var CM_SHORT_LINE_DURATION_THRESHOLD = SHORT_LINE_DURATION_THRESHOLD;
env.CM_SHORT_LINE_DURATION_THRESHOLD = CM_SHORT_LINE_DURATION_THRESHOLD;
var CM_buildWordGraphemeTimings = buildWordGraphemeTimings;
env.CM_buildWordGraphemeTimings = CM_buildWordGraphemeTimings;
var CM_splitLyricGraphemes = splitLyricGraphemes;
env.CM_splitLyricGraphemes = CM_splitLyricGraphemes;
var CM_getWordSegmentationKey = getWordSegmentationKey;
env.CM_getWordSegmentationKey = CM_getWordSegmentationKey;
var CM_buildPostLyricLayoutUnits = buildPostLyricLayoutUnits;
env.CM_buildPostLyricLayoutUnits = CM_buildPostLyricLayoutUnits;
var CM_buildDisplayWordsFromLayoutUnits = buildDisplayWordsFromLayoutUnits;
env.CM_buildDisplayWordsFromLayoutUnits = CM_buildDisplayWordsFromLayoutUnits;
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
env.PartitaPartitaEngine = (typeof PartitaPartitaEngine !== "undefined") ? PartitaPartitaEngine : null;
})(typeof window !== "undefined" ? window : this);