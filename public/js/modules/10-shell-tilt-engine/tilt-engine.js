// OrangeSea TILT ENGINE (AGPL-3.0, from folia-major) -- no-build bundle
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

const CJK_REGEX__1 = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/;
const WHITESPACE_REGEX = /^\s+$/;
const APOSTROPHE_ONLY_REGEX = /^['’]\s*$/;
const CONTRACTION_SUFFIX_REGEX = /^(s|t|m|d|ll|re|ve|em)\s*$/i;
const DIRECT_CONTRACTION_REGEX = /^['’](s|t|m|d|ll|re|ve|em)\s*$/i;
const TRAILING_APOSTROPHE_REGEX = /['’]\s*$/;
const TRAILING_WORD_CHAR_REGEX = /[\p{L}\p{N}]$/u;
const INLINE_CONTRACTION_REGEX = /[\p{L}\p{N}]+['’](s|t|m|d|ll|re|ve|em)/iu;
const STICKY_TRAILING_PUNCTUATION_REGEX = /^[,.;:!?，。！？、：；）】》」』〉〕］)}\]"'’”’]+$/u;
const hasCjkText__1 = (text) => CJK_REGEX__1.test(text);
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
            isSemantic: Boolean(segment.isWordLike && hasCjkText__1(segmentText) && segmentWords.length > 1),
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
    if (!hasCjkText__1(line.fullText) && !hasWordSegmentationOverride(line)) {
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

// ======== utils/lyrics/sentenceLayout ========
const CJK_REGEX__2 = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/;
const WESTERN_WORD_REGEX = /[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*/;
const hasCjkText__2 = (text) => CJK_REGEX__2.test(text);
function findRegexMatch(regex, text, fromIndex = 0) {
    regex.lastIndex = fromIndex;
    const match = regex.exec(text);
    return match ? { start: match.index, end: match.index + match[0].length } : null;
}
function findStringMatch(str, text, fromIndex = 0) {
    const idx = text.indexOf(str, fromIndex);
    return idx === -1 ? null : { start: idx, end: idx + str.length };
}
class SentenceLayout {
    constructor(text) {
        this.words = [];
        this.startTime = 0;
        this.endTime = 0;
        this.isSemantic = true;
        this.text = text;
    }
    static splitIntoSentences(text, targetCount, timeSeed) {
        if (targetCount <= 1 && targetCount >= 0) {
            return [new SentenceLayout(text)];
        }
        const maxLevel = targetCount === -1 ? 1 :
            targetCount === -2 ? 2 :
                targetCount === -3 ? 3 :
                    targetCount === -4 ? 4 :
                        targetCount === -5 ? 5 : 5;
        let sentences = [text];
        for (let level = 1; level <= maxLevel; level++) {
            if (sentences.length >= Math.abs(targetCount) && targetCount > 0) {
                break;
            }
            const newSentences = [];
            for (const sentence of sentences) {
                newSentences.push(...SentenceLayout.splitByLevel(sentence, level));
            }
            sentences = newSentences;
        }
        let result = sentences.map(s => new SentenceLayout(s));
        if (targetCount > 0 && result.length < targetCount) {
            result = SentenceLayout.secondarySplit(result, targetCount, timeSeed);
        }
        if (result.length > 1 && result.length > targetCount && targetCount > 0) {
            result = SentenceLayout.mergeSentences(result, targetCount);
        }
        return result;
    }
    static splitByLevel(text, level) {
        switch (level) {
            case 1:
                return SentenceLayout.splitByPunctuation(text);
            case 2:
                return SentenceLayout.splitByBracketsQuotes(text);
            case 3:
                return SentenceLayout.splitByWesternWords(text);
            case 4:
                return SentenceLayout.splitCJKBySpace(text);
            case 5:
                return SentenceLayout.splitBySpecialChars(text);
            default:
                return [text];
        }
    }
    static splitByPunctuation(text) {
        const allPunctRegex = /[，。；！？、…·\.\,\;\!\?]+/g;
        const matches = [...text.matchAll(allPunctRegex)];
        if (matches.length === 0) {
            return [text];
        }
        const result = [];
        let lastIndex = 0;
        for (const match of matches) {
            const punctStart = match.index;
            const punctEnd = punctStart + match[0].length;
            let trailingSpaces = '';
            const afterPunct = text.slice(punctEnd);
            const spaceMatch = afterPunct.match(/^\s+/);
            if (spaceMatch) {
                trailingSpaces = spaceMatch[0];
            }
            const beforePunct = text.slice(lastIndex, punctStart);
            const punctWithSpaces = match[0] + trailingSpaces;
            if (beforePunct.length > 0) {
                result.push(beforePunct + punctWithSpaces);
            }
            else if (result.length > 0) {
                result[result.length - 1] += punctWithSpaces;
            }
            else {
                result.push(punctWithSpaces);
            }
            lastIndex = punctEnd + trailingSpaces.length;
        }
        if (lastIndex < text.length) {
            result.push(text.slice(lastIndex));
        }
        return result.filter(r => r.length > 0);
    }
    static splitByWesternWords(text) {
        if (!hasCjkText__2(text)) {
            return [text];
        }
        const westernBlockRegex = /[a-zA-Z0-9]+(?:[a-zA-Z0-9'\-]*[a-zA-Z0-9]+)?(?:\s+[a-zA-Z0-9]+(?:[a-zA-Z0-9'\-]*[a-zA-Z0-9]+)?)+[.,;:!?。，；：！？]?\s*/g;
        SentenceLayout.charCountCache.clear();
        let hasMultipleWordBlock = false;
        let match;
        while ((match = westernBlockRegex.exec(text)) !== null) {
            const wordCount = match[0].match(/[a-zA-Z0-9]+/g)?.length || 0;
            if (wordCount > 1) {
                hasMultipleWordBlock = true;
                break;
            }
        }
        if (!hasMultipleWordBlock) {
            return [text];
        }
        westernBlockRegex.lastIndex = 0;
        const parts = [];
        let lastIndex = 0;
        while ((match = westernBlockRegex.exec(text)) !== null) {
            const blockStart = match.index;
            const blockEnd = blockStart + match[0].length;
            const beforeBlock = text.slice(lastIndex, blockStart);
            if (SentenceLayout.shouldSkipBoundary(text, beforeBlock, blockStart)) {
                parts.push(beforeBlock + match[0]);
            }
            else if (blockStart > lastIndex) {
                parts.push(beforeBlock);
                parts.push(match[0]);
            }
            else {
                parts.push(match[0]);
            }
            lastIndex = blockEnd;
        }
        if (lastIndex < text.length) {
            parts.push(text.slice(lastIndex));
        }
        return parts.length > 1 ? parts : [text];
    }
    static getGlobalCount(text, char) {
        const key = `${text.length}:${char}`;
        if (SentenceLayout.charCountCache.has(key)) {
            return SentenceLayout.charCountCache.get(key);
        }
        const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const count = (text.match(new RegExp(escaped, 'g')) || []).length;
        SentenceLayout.charCountCache.set(key, count);
        return count;
    }
    static shouldSkipBoundary(fullText, beforeBlock, _boundaryPos) {
        if (beforeBlock.length === 0)
            return false;
        const sepChar = beforeBlock[beforeBlock.length - 1];
        if (sepChar === '-')
            return true;
        if (sepChar === ':' || sepChar === '：' || sepChar === '/' || sepChar === '／' || sepChar === '|' || sepChar === '｜') {
            return SentenceLayout.getGlobalCount(fullText, sepChar) >= 2;
        }
        return false;
    }
    static splitWesternPhrase(text) {
        if (!hasCjkText__2(text) && text.length > 0) {
            const splitRegex = /(?<=\w[.,;:!?。，；：！？])(?=\s+\w)/;
            const parts = text.split(splitRegex);
            if (parts.length > 1) {
                return parts.filter(p => p.length > 0);
            }
        }
        return [text];
    }
    static splitByBracketsQuotes(text) {
        const allPairedSymbols = [
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
            { openStr: "'", closeStr: "'" },
        ];
        const result = SentenceLayout.extractOutermostPairs(text, allPairedSymbols);
        return result.length > 1 ? result : [text];
    }
    static extractOutermostPairs(text, defs) {
        const best = SentenceLayout.findOutermostPair(text, defs);
        if (!best) {
            return [text];
        }
        const before = text.slice(0, best.openStart);
        const pairedContent = text.slice(best.openStart, best.closeEnd);
        const remainder = text.slice(best.closeEnd);
        const result = [];
        if (before.length > 0) {
            result.push(...SentenceLayout.extractOutermostPairs(before, defs));
        }
        result.push(pairedContent);
        if (remainder.length > 0) {
            result.push(...SentenceLayout.extractOutermostPairs(remainder, defs));
        }
        return result.filter(p => p.length > 0);
    }
    static findOutermostPair(text, defs) {
        let best = null;
        for (const def of defs) {
            const openMatch = def.openStr !== undefined
                ? findStringMatch(def.openStr, text)
                : findRegexMatch(def.open, text);
            if (!openMatch)
                continue;
            const searchFrom = openMatch.end;
            const closeMatch = def.closeStr !== undefined
                ? findStringMatch(def.closeStr, text, searchFrom)
                : findRegexMatch(def.close, text, searchFrom);
            if (!closeMatch)
                continue;
            const candidate = {
                openStart: openMatch.start,
                openEnd: openMatch.end,
                closeStart: closeMatch.start,
                closeEnd: closeMatch.end,
            };
            if (!best || candidate.openStart < best.openStart) {
                best = candidate;
            }
            else if (candidate.openStart === best.openStart && candidate.closeEnd > best.closeEnd) {
                best = candidate;
            }
        }
        return best;
    }
    static splitCJKBySpace(text) {
        if (!hasCjkText__2(text)) {
            return [text];
        }
        const segments = [];
        let currentSegment = '';
        let inCjkBlock = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const isCJK = CJK_REGEX__2.test(char);
            const isWestern = /[a-zA-Z0-9]/.test(char);
            const isSpace = /\s/.test(char);
            if (isCJK) {
                currentSegment += char;
                inCjkBlock = true;
            }
            else if (isWestern) {
                // Western 字符跟随当前块（不做边界分割）
                currentSegment += char;
            }
            else if (isSpace) {
                // 空格处理：
                // - 全角空格 → 总是触发分割，附到前段末尾
                // - 半角空格在 CJK 后 → 分割；其他情况跟随
                const isFullWidthSpace = char === '\u3000';
                if (isFullWidthSpace && currentSegment.length > 0) {
                    // 全角空格：完成当前段
                    currentSegment += char;
                    segments.push(currentSegment);
                    currentSegment = '';
                    inCjkBlock = false;
                }
                else if (inCjkBlock && currentSegment.length > 0) {
                    // 半角空格在 CJK 块中：检查前一个字符
                    const lastChar = currentSegment[currentSegment.length - 1];
                    if (CJK_REGEX__2.test(lastChar)) {
                        currentSegment += char;
                        segments.push(currentSegment);
                        currentSegment = '';
                        inCjkBlock = false;
                    }
                    else {
                        currentSegment += char;
                    }
                }
                else if (currentSegment.length === 0 && segments.length > 0) {
                    segments[segments.length - 1] += char;
                }
                else {
                    // 其他情况的空格，跟随
                    currentSegment += char;
                }
            }
            else {
                if (currentSegment.length === 0 && segments.length > 0) {
                    segments[segments.length - 1] += char;
                }
                else {
                    currentSegment += char;
                }
            }
        }
        if (currentSegment) {
            if (segments.length > 0 && /^\s+$/.test(currentSegment)) {
                segments[segments.length - 1] += currentSegment;
            }
            else {
                segments.push(currentSegment);
            }
        }
        return segments.length > 1 ? segments : [text];
    }
    static splitBySpecialChars(text) {
        const specialCharRegex = /[：:\/／\\|｜~～]+/;
        const parts = text.split(specialCharRegex);
        if (parts.filter(part => part.length > 0).length <= 1) {
            return [text];
        }
        const result = [];
        let lastIndex = 0;
        for (const part of parts) {
            const index = text.indexOf(part, lastIndex);
            if (index > lastIndex) {
                const specialChar = text.slice(lastIndex, index);
                if (result.length > 0) {
                    result[result.length - 1] += specialChar;
                }
                else {
                    result.push(specialChar);
                }
            }
            if (part) {
                result.push(part);
                lastIndex = index + part.length;
            }
            else if (index !== -1) {
                lastIndex = index;
            }
        }
        if (lastIndex < text.length) {
            const tail = text.slice(lastIndex);
            if (tail && result.length > 0) {
                result[result.length - 1] += tail;
            }
            else if (tail) {
                result.push(tail);
            }
        }
        return result.filter(r => r.length > 0);
    }
    // The one word-granularity Segmenter left outside utils/lyrics/wordSegmentation, and so the one
    // place the user's saved segmentation does not reach. It splits a sentence *fragment* rather
    // than a whole line, purely to find a break point, so a per-line boundary list would have to be
    // mapped into fragment coordinates first. Left as is deliberately; see the lyric-segmentation
    // command, which is offered only for the modes that segment whole lines.
    static secondarySplit(sentences, targetCount, timeSeed) {
        const Segmenter = Intl?.Segmenter;
        const segmenter = Segmenter ? new Segmenter(undefined, { granularity: 'word' }) : null;
        while (sentences.length < targetCount) {
            const candidates = sentences.filter(s => s.text.length > 2);
            if (candidates.length === 0)
                break;
            if (segmenter) {
                const semanticCandidates = [];
                for (const s of candidates) {
                    try {
                        const segments = Array.from(segmenter.segment(s.text));
                        const wordPositions = [];
                        let offset = 0;
                        for (const seg of segments) {
                            if (seg.isWordLike) {
                                wordPositions.push({ start: offset, end: offset + seg.segment.length });
                            }
                            offset += seg.segment.length;
                        }
                        if (wordPositions.length >= 2) {
                            const midChar = s.text.length / 2;
                            let bestGapIdx = 1;
                            let bestDist = Infinity;
                            for (let g = 1; g < wordPositions.length; g++) {
                                const dist = Math.abs(wordPositions[g].start - midChar);
                                if (dist < bestDist) {
                                    bestDist = dist;
                                    bestGapIdx = g;
                                }
                            }
                            const splitPos = wordPositions[bestGapIdx].start;
                            const balanceScore = 1 - Math.abs(splitPos - midChar) / midChar;
                            semanticCandidates.push({
                                sentence: s,
                                index: sentences.indexOf(s),
                                splitPos,
                                score: balanceScore * 10 + wordPositions.length,
                            });
                        }
                    }
                    catch { }
                }
                if (semanticCandidates.length > 0) {
                    semanticCandidates.sort((a, b) => b.score - a.score);
                    const best = semanticCandidates[0];
                    const firstHalf = best.sentence.text.slice(0, best.splitPos);
                    const secondHalf = best.sentence.text.slice(best.splitPos);
                    sentences.splice(best.index, 1, new SentenceLayout(firstHalf), new SentenceLayout(secondHalf));
                    continue;
                }
            }
            const pseudoRandom = (seed) => {
                const x = Math.sin(seed) * 10000;
                return x - Math.floor(x);
            };
            const textHash = sentences.reduce((acc, s) => acc + s.text.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0), 0);
            const seed = textHash + sentences.length + (timeSeed ?? 0);
            const randomIndex = Math.floor(pseudoRandom(seed) * candidates.length);
            const selectedCandidate = candidates[randomIndex];
            const candidateIndex = sentences.indexOf(selectedCandidate);
            const midPoint = Math.floor(selectedCandidate.text.length / 2);
            const firstHalf = selectedCandidate.text.slice(0, midPoint);
            const secondHalf = selectedCandidate.text.slice(midPoint);
            sentences.splice(candidateIndex, 1, new SentenceLayout(firstHalf), new SentenceLayout(secondHalf));
        }
        return sentences;
    }
    static mergeSentences(sentences, targetCount) {
        while (sentences.length > targetCount) {
            let bestMergeIndex = 0;
            let shortestCombinedLength = Infinity;
            for (let i = 0; i < sentences.length - 1; i++) {
                const combinedLength = sentences[i].text.length + sentences[i + 1].text.length;
                if (combinedLength < shortestCombinedLength) {
                    shortestCombinedLength = combinedLength;
                    bestMergeIndex = i;
                }
            }
            const merged = new SentenceLayout(sentences[bestMergeIndex].text + sentences[bestMergeIndex + 1].text);
            sentences.splice(bestMergeIndex, 2, merged);
        }
        return sentences;
    }
}
SentenceLayout.charCountCache = new Map();

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

// ======== manual: manual/tilt-engine-core.js ========
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

// ======== manual: manual/tilt-background-core.js ========
/* =========================================================================
   tilt 模式背景层 —— Folia VisualizerShell 默认背景（Latent）的无构建忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     src/components/visualizer/backgrounds/latent/LatentBackground.tsx
       （背景层结构与音频驱动循环全量，行号逐段标注）
     src/hooks/usePlaybackVisualizerBridge.ts:93-131（AudioBands 五频带
       21.5Hz/bin 分箱 + 每带幂次整形 + 暂停呼吸值，逐式同构）
     src/components/visualizer/backgrounds/VisualizerBackgroundRenderer.tsx
       （默认分支：mode 缺省 → DEFAULT_VISUALIZER_BACKGROUND_MODE）
     src/types/visualizerModes.ts:43（DEFAULT_VISUALIZER_BACKGROUND_MODE='latent'）
     src/types.ts:1045-1061（DEFAULT_LATENT_BACKGROUND_TUNING 原值）
     src/utils/colorExtractor.ts（封面取样 50×50 loadImagePixels）
     src/utils/colorPalette.ts（加权中位切取色 extractRepresentativeColorsFromPixels）

   渲染本体（WebGL shader）来自 Folia 的第三方依赖 @paper-design/shaders
   v0.0.80（Apache-2.0，Copyright Paper Design，见 NOTICE.md）：
     dist/shaders/mesh-gradient.js      （MeshGradient 片元，maxColorCount=10 展开）
     dist/shaders/dithering.js          （Dithering 片元；warp=2 / '4x4'=3 已按
       DitheringShapes/DitheringTypes 常量内联）
     dist/vertex-shader.js              （顶点着色器逐字）
     dist/shader-utils.js               （declarePI/rotation2/proceduralHash11/
       proceduralHash21/simplexNoise 内联展开）
     dist/shader-mount.js               （ShaderMount 驱动核心：program/quad/
       u_time=currentFrame*1e-3、currentFrame+=dt*speed、setSpeed 零速停 rAF、
       setUniforms 立即补帧；像素预算 clamp 语义保留）

   与原版的宿主差异（均不改变算法与常量）：
   1) React 组件树 → 显式工厂 TiltLatentBackground(opts)：Uniforms 直设、
     useEffect rAF → 自管 rAF、MotionValue.get() → 注入 getter；
   2) ShaderMount 的 ResizeObserver/IntersectionObserver/Safari 缩放簿记 →
     window resize + visibilitychange 等价（全屏覆盖层恒在视口内；
     handleResize 的 devicePixelContentBoxSize 缺省分支逐式保留：
     targetRenderScale=max(dpr,minPixelRatio)→像素预算 sqrt clamp）；
   3) tuning 固定 DEFAULT_LATENT_BACKGROUND_TUNING（colorSource 'cover-theme'、
     displayMode 'both'、enhancedBeatResponse true——原版缺省路径），
     本项目无调参面板（与歌词核心取 DEFAULT_TILT_TUNING 同约定）；
   4) staticMode 固定 false（宿主无背景冻结设置）。
   ========================================================================= */

/* ---------- tuning（types.ts:1045-1061 DEFAULT_LATENT_BACKGROUND_TUNING 原值） ---------- */
var tiltLatentDefaultTuning = {
  displayMode: 'both',
  colorSource: 'cover-theme',
  dynamicOnlyInPlayer: true,
  enhancedBeatResponse: true,
  ditheringSpeed: 0.1,
  ditheringAudioSpeed: 1.2,
  ditheringSize: 2.5,
  ditheringOpacity: 0.55,
  meshSpeed: 0.3,
  meshAudioSpeed: 2,
  meshDistortion: 0.8,
  meshSwirl: 0.1,
  overlayEnabled: true,
  overlayOpacity: 0.35
};

/* ---------- 纯驱动函数（LatentBackground.tsx:27-107 同构） ---------- */
var TILT_LATENT_MAX_SHADER_PIXELS = 1280 * 720;   /* LatentBackground.tsx:27 */
var TILT_LATENT_PAUSED_SPEED_SCALE = 0.12;        /* LatentBackground.tsx:28 */

/* normalizeAudio（:29） */
function tiltLatentNormalizeAudio(value) { return Math.min(1, Math.max(0, value / 255)); }
/* clampShaderSpeed（:30） */
function tiltLatentClampShaderSpeed(value) { return Math.min(2, Math.max(0, value)); }
/* clampAudioAmount（:31） */
function tiltLatentClampAudioAmount(value) { return Math.min(1, Math.max(0, value)); }
/* easeTowards（:32-34） */
function tiltLatentEaseTowards(current, target, amount) { return current + (target - current) * amount; }

/* resolveLatentBroadbandEnergy（:35-50）：五频带加权 → ^0.55（输入 0..255 语义） */
function tiltLatentBroadbandEnergy(bass, lowMid, mid, vocal, treble) {
  var broadbandEnergy = (
    tiltLatentNormalizeAudio(bass) * 0.22
    + tiltLatentNormalizeAudio(lowMid) * 0.18
    + tiltLatentNormalizeAudio(mid) * 0.22
    + tiltLatentNormalizeAudio(vocal) * 0.28
    + tiltLatentNormalizeAudio(treble) * 0.1
  );
  return Math.pow(broadbandEnergy, 0.55);
}

/* resolveLatentOnsetPulse（:52-59）：起始脉冲，0.84 衰减尾 + 7×能量差上冲 */
function tiltLatentOnsetPulse(currentEnergy, previousEnergy, previousPulse) {
  return Math.max(
    previousPulse * 0.84,
    tiltLatentClampAudioAmount((currentEnergy - previousEnergy) * 7)
  );
}

/* resolveLatentBeatSpeedTarget（:60-63） */
function tiltLatentBeatSpeedTarget(broadbandEnergy, onsetPulse) {
  return tiltLatentClampAudioAmount(broadbandEnergy * 0.42 + onsetPulse * 0.85);
}

/* resolveLatentAudioSpeedTarget（:64-70） */
function tiltLatentAudioSpeedTarget(broadbandEnergy, onsetPulse, enhancedBeatResponse) {
  return enhancedBeatResponse
    ? tiltLatentBeatSpeedTarget(broadbandEnergy, onsetPulse)
    : tiltLatentClampAudioAmount(broadbandEnergy);
}

/* resolveLatentShaderSpeed（:71-80）：暂停 → base*0.12；否则 base↛audio 按 amount 缓动 */
function tiltLatentShaderSpeed(baseSpeed, audioSpeed, audioAmount, paused) {
  return tiltLatentClampShaderSpeed(
    paused
      ? baseSpeed * TILT_LATENT_PAUSED_SPEED_SCALE
      : tiltLatentEaseTowards(baseSpeed, audioSpeed, audioAmount)
  );
}

/* resolveLatentShaderColors（:81-107）：封面色 + 主题兜底（'cover-theme' 分支为
   原版缺省；'cover-only' 分支按原样保留以维持函数同构） */
function tiltLatentShaderColors(coverColors, theme, colorSource) {
  var primary = coverColors[0] || theme.secondaryColor;
  if (colorSource === 'cover-only') {
    var secondaryC = coverColors[1] || primary;
    var tertiaryC = coverColors[2] || secondaryC;
    var quaternaryC = coverColors[3] || primary;
    var quinaryC = coverColors[4] || secondaryC;
    var senaryC = coverColors[5] || tertiaryC;
    return {
      ditheringBack: tertiaryC,
      ditheringFront: primary,
      mesh: [primary, secondaryC, tertiaryC, quaternaryC, quinaryC, senaryC]
    };
  }
  var secondary = coverColors[1] || theme.primaryColor;
  var tertiary = coverColors[2] || primary;
  var quaternary = coverColors[3] || secondary;
  return {
    ditheringBack: theme.backgroundColor,
    ditheringFront: primary,
    mesh: [primary, secondary, tertiary, quaternary, theme.backgroundColor, theme.accentColor]
  };
}

/* ---------- AudioBands 信号原值计算（usePlaybackVisualizerBridge.ts:93-131 逐式同构） ----------
   Folia 每帧从 analyser.getByteFrequencyData 的原始 FFT 字节（Uint8Array，0..255）
   按 21.5Hz/bin 分箱求均值，再做每带幂次整形；LatentBackground 消费的是这些
   MotionValue（0..255 语义）。MineRadio 保活的 frequencyData 同形状（FFT_SIZE=2048
   → 1024 bin，00-core-stores.js:8-9；覆盖层保温期主循环仍每帧采集
   11-main-loop.js:369-372），桥直供该数组。此前桥的 kick/vocal 复合带映射是
   文档化近似，本轮按原版精确计算替换（红线：逐式同构，禁近似）。 */

/* getEnergy（:93-102）：bin = floor(hz/21.5)，区间字节均值（folia 硬编码
   21.5 = 44100/2048，不读实际 sampleRate——宿主差异不引入） */
function tiltBandsGetEnergy(freqData, minHz, maxHz) {
  if (!freqData || !freqData.length) return 0;
  var start = Math.floor(minHz / 21.5);
  var end = Math.floor(maxHz / 21.5);
  var sum = 0;
  for (var index = start; index <= end; index += 1) {
    sum += freqData[index];
  }
  var count = end - start + 1;
  return count > 0 ? sum / count : 0;
}

/* process（:110-113）：pow(v/255, boost)*255 */
function tiltBandsProcess(value, boost) {
  var normalized = value / 255;
  return Math.pow(normalized, boost) * 255;
}

/* 五频带 + audioPower（:104-120）：bass 20-150/lowMid 150-400/mid 400-1200/
   vocal 1000-3500/treble 3500-12000Hz，boost 1.8/2/2/1.5/2；
   audioPower = process((bass+lowMid)/2, 3)——注意吃的是整形前的原始能量 */
function tiltBandsCompute(freqData) {
  var bass = tiltBandsGetEnergy(freqData, 20, 150);        /* :104 */
  var lowMid = tiltBandsGetEnergy(freqData, 150, 400);     /* :105 */
  var mid = tiltBandsGetEnergy(freqData, 400, 1200);       /* :106 */
  var vocal = tiltBandsGetEnergy(freqData, 1000, 3500);    /* :107 */
  var treble = tiltBandsGetEnergy(freqData, 3500, 12000);  /* :108 */
  return {
    audioPower: tiltBandsProcess((bass + lowMid) / 2, 3),  /* :115 */
    bass: tiltBandsProcess(bass, 1.8),                     /* :116 */
    lowMid: tiltBandsProcess(lowMid, 2),                   /* :117 */
    mid: tiltBandsProcess(mid, 2),                         /* :118 */
    vocal: tiltBandsProcess(vocal, 1.5),                   /* :119 */
    treble: tiltBandsProcess(treble, 2)                    /* :120 */
  };
}

/* 不可闻分支（:121-124）：正弦呼吸值 0..40（周期 ≈12.6s），五带与 audioPower
   同值——LatentBackground 暂停态目标归零（:176-189），该值仅保持信号活性 */
function tiltBandsBreath(nowMs) {
  var time = nowMs / 2000;
  return (Math.sin(time) + 1) * 20;
}

/* ---------- 封面取色（colorExtractor.ts + colorPalette.ts 同构） ---------- */

/* loadImagePixels（colorExtractor.ts:9-36）：50×50 下采样 */
function tiltLatentLoadImagePixels(imageUrl) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function () {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      var width = 50;
      var height = 50;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      try { resolve(ctx.getImageData(0, 0, width, height).data); }
      catch (e) { resolve(null); }
    };
    img.onerror = function () { resolve(null); };
    img.src = imageUrl;
  });
}

/* extractRepresentativeColorsFromPixels（colorPalette.ts 全量同构：
   4bit 量化直方图 → 加权中位切桶 → 按桶重降序输出 hex） */
var TILT_LATENT_QUANTIZATION_SHIFT = 4;   /* colorPalette.ts:12 */
var TILT_LATENT_MIN_ALPHA = 128;          /* colorPalette.ts:13 */

function tiltLatentGetChannelRange(colors, channel) {
  var min = 255;
  var max = 0;
  for (var i = 0; i < colors.length; i++) {
    var v = colors[i][channel];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

function tiltLatentSplitBucket(bucket) {
  if (bucket.colors.length < 2) return null;

  var ranges = {
    r: tiltLatentGetChannelRange(bucket.colors, 'r'),
    g: tiltLatentGetChannelRange(bucket.colors, 'g'),
    b: tiltLatentGetChannelRange(bucket.colors, 'b')
  };
  var channel = 'r';
  if (ranges.g > ranges[channel]) channel = 'g';
  if (ranges.b > ranges[channel]) channel = 'b';
  var sorted = bucket.colors.slice().sort(function (a, b) { return a[channel] - b[channel]; });
  var midpoint = bucket.weight / 2;
  var accumulatedWeight = 0;
  var splitIndex = 1;

  for (var index = 0; index < sorted.length - 1; index += 1) {
    accumulatedWeight += sorted[index].weight;
    splitIndex = index + 1;
    if (accumulatedWeight >= midpoint) break;
  }

  var left = sorted.slice(0, splitIndex);
  var right = sorted.slice(splitIndex);
  var lw = 0, rw = 0;
  for (var li = 0; li < left.length; li++) lw += left[li].weight;
  for (var ri = 0; ri < right.length; ri++) rw += right[ri].weight;
  return [
    { colors: left, weight: lw },
    { colors: right, weight: rw }
  ];
}

function tiltLatentAverageBucket(bucket) {
  var r = 0, g = 0, b = 0;
  for (var i = 0; i < bucket.colors.length; i++) {
    var c = bucket.colors[i];
    r += c.r * c.weight;
    g += c.g * c.weight;
    b += c.b * c.weight;
  }
  return {
    r: Math.round(r / bucket.weight),
    g: Math.round(g / bucket.weight),
    b: Math.round(b / bucket.weight),
    weight: bucket.weight
  };
}

function tiltLatentToHex(c) {
  function pad(n) { var s = n.toString(16); return s.length < 2 ? '0' + s : s; }
  return '#' + pad(c.r) + pad(c.g) + pad(c.b);
}

function tiltLatentExtractRepresentativeColorsFromPixels(pixels, count) {
  if (count <= 0) return [];

  var histogram = {};
  var keys = [];
  for (var index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < TILT_LATENT_MIN_ALPHA) continue;
    var r = pixels[index];
    var g = pixels[index + 1];
    var b = pixels[index + 2];
    var key = ((r >> TILT_LATENT_QUANTIZATION_SHIFT) << 8)
      | ((g >> TILT_LATENT_QUANTIZATION_SHIFT) << 4)
      | (b >> TILT_LATENT_QUANTIZATION_SHIFT);
    var existing = histogram[key];
    if (existing) {
      existing.r += r; existing.g += g; existing.b += b; existing.weight += 1;
    } else {
      histogram[key] = { r: r, g: g, b: b, weight: 1 };
      keys.push(key);
    }
  }

  var colors = [];
  for (var ki = 0; ki < keys.length; ki++) {
    var e = histogram[keys[ki]];
    colors.push({
      r: Math.round(e.r / e.weight),
      g: Math.round(e.g / e.weight),
      b: Math.round(e.b / e.weight),
      weight: e.weight
    });
  }
  if (colors.length === 0) return [];

  var totalWeight = 0;
  for (var ci = 0; ci < colors.length; ci++) totalWeight += colors[ci].weight;
  var buckets = [{ colors: colors, weight: totalWeight }];
  var target = Math.min(count, colors.length);
  while (buckets.length < target) {
    var bucketIndex = -1;
    var bestScore = -1;
    for (var bi = 0; bi < buckets.length; bi += 1) {
      var bucket = buckets[bi];
      if (bucket.colors.length < 2) continue;
      var widestRange = Math.max(
        tiltLatentGetChannelRange(bucket.colors, 'r'),
        tiltLatentGetChannelRange(bucket.colors, 'g'),
        tiltLatentGetChannelRange(bucket.colors, 'b')
      );
      var score = widestRange * Math.sqrt(bucket.weight);
      if (score > bestScore) { bestScore = score; bucketIndex = bi; }
    }
    if (bucketIndex < 0) break;
    var split = tiltLatentSplitBucket(buckets[bucketIndex]);
    if (!split) break;
    buckets.splice(bucketIndex, 1, split[0], split[1]);
  }

  var out = [];
  for (var oi = 0; oi < buckets.length; oi++) out.push(tiltLatentAverageBucket(buckets[oi]));
  out.sort(function (a, b) { return b.weight - a.weight; });
  var hexes = [];
  for (var hi = 0; hi < out.length; hi++) hexes.push(tiltLatentToHex(out[hi]));
  return hexes;
}

/* ---------- 颜色解析（@paper-design/shaders get-shader-color-from-string.js
   hex/rgb 分支同构；宿主只用 hex + rgb 两种来源） ---------- */
function tiltLatentShaderColorFromString(colorString) {
  if (Array.isArray(colorString)) {
    if (colorString.length === 4) return colorString;
    if (colorString.length === 3) return colorString.concat([1]);
    return [0.5, 0.5, 0.5, 1];
  }
  if (typeof colorString !== 'string') return [0.5, 0.5, 0.5, 1];
  var r, g, b, a = 1;
  if (colorString.charAt(0) === '#') {
    var hex = colorString.replace(/^#/, '');
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split('').map(function (ch) { return ch + ch; }).join('');
    }
    if (hex.length === 6) hex = hex + 'ff';
    if (!/^[0-9a-fA-F]{8}$/.test(hex)) return [0.5, 0.5, 0.5, 1];
    r = parseInt(hex.slice(0, 2), 16) / 255;
    g = parseInt(hex.slice(2, 4), 16) / 255;
    b = parseInt(hex.slice(4, 6), 16) / 255;
    a = parseInt(hex.slice(6, 8), 16) / 255;
  } else if (colorString.indexOf('rgb') === 0) {
    var m = /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+))?\s*\)$/i.exec(colorString);
    if (!m) return [0.5, 0.5, 0.5, 1];
    r = parseInt(m[1], 10) / 255;
    g = parseInt(m[2], 10) / 255;
    b = parseInt(m[3], 10) / 255;
    a = m[4] === undefined ? 1 : parseFloat(m[4]);
  } else {
    return [0.5, 0.5, 0.5, 1];
  }
  function clamp01(n) { return Math.min(Math.max(n, 0), 1); }
  return [clamp01(r), clamp01(g), clamp01(b), clamp01(a)];
}

/* ---------- GLSL（@paper-design/shaders v0.0.80，Apache-2.0；模板插值已
   按 shader-utils.js / meshGradientMeta 原文展开） ---------- */

var TILT_LATENT_VERTEX_SHADER = [
  '#version 300 es',
  'precision mediump float;',
  '',
  'layout(location = 0) in vec4 a_position;',
  '',
  'uniform vec2 u_resolution;',
  'uniform float u_pixelRatio;',
  'uniform float u_imageAspectRatio;',
  'uniform float u_originX;',
  'uniform float u_originY;',
  'uniform float u_worldWidth;',
  'uniform float u_worldHeight;',
  'uniform float u_fit;',
  'uniform float u_scale;',
  'uniform float u_rotation;',
  'uniform float u_offsetX;',
  'uniform float u_offsetY;',
  '',
  'out vec2 v_objectUV;',
  'out vec2 v_objectBoxSize;',
  'out vec2 v_responsiveUV;',
  'out vec2 v_responsiveBoxGivenSize;',
  'out vec2 v_patternUV;',
  'out vec2 v_patternBoxSize;',
  'out vec2 v_imageUV;',
  '',
  'vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {',
  '  vec2 box = vec2(0.);',
  '  // fit = none',
  '  box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);',
  '  float noFitBoxWidth = box.x;',
  '  if (u_fit == 1.) { // fit = contain',
  '    box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);',
  '  } else if (u_fit == 2.) { // fit = cover',
  '    box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);',
  '  }',
  '  box.y = box.x / boxRatio;',
  '  return vec3(box, noFitBoxWidth);',
  '}',
  '',
  'void main() {',
  '  gl_Position = a_position;',
  '',
  '  vec2 uv = gl_Position.xy * .5;',
  '  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);',
  '  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);',
  '  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;',
  '  float r = u_rotation * 3.14159265358979323846 / 180.;',
  '  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));',
  '  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);',
  '',
  '',
  '  // ===================================================',
  '',
  '  float fixedRatio = 1.;',
  '  vec2 fixedRatioBoxGivenSize = vec2(',
  '  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,',
  '  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y',
  '  );',
  '',
  '  v_objectBoxSize = getBoxSize(fixedRatio, fixedRatioBoxGivenSize).xy;',
  '  vec2 objectWorldScale = u_resolution.xy / v_objectBoxSize;',
  '',
  '  v_objectUV = uv;',
  '  v_objectUV *= objectWorldScale;',
  '  v_objectUV += boxOrigin * (objectWorldScale - 1.);',
  '  v_objectUV += graphicOffset;',
  '  v_objectUV /= u_scale;',
  '  v_objectUV = graphicRotation * v_objectUV;',
  '',
  '  // ===================================================',
  '',
  '  v_responsiveBoxGivenSize = vec2(',
  '  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,',
  '  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y',
  '  );',
  '  float responsiveRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;',
  '  vec2 responsiveBoxSize = getBoxSize(responsiveRatio, v_responsiveBoxGivenSize).xy;',
  '  vec2 responsiveBoxScale = u_resolution.xy / responsiveBoxSize;',
  '',
  '  v_responsiveUV = uv;',
  '  v_responsiveUV *= responsiveBoxScale;',
  '  v_responsiveUV += boxOrigin * (responsiveBoxScale - 1.);',
  '  v_responsiveUV += graphicOffset;',
  '  v_responsiveUV /= u_scale;',
  '  v_responsiveUV.x *= responsiveRatio;',
  '  v_responsiveUV = graphicRotation * v_responsiveUV;',
  '  v_responsiveUV.x /= responsiveRatio;',
  '',
  '  // ===================================================',
  '',
  '  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;',
  '  vec2 patternBoxGivenSize = vec2(',
  '  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,',
  '  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y',
  '  );',
  '  patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;',
  '',
  '  vec3 boxSizeData = getBoxSize(patternBoxRatio, patternBoxGivenSize);',
  '  v_patternBoxSize = boxSizeData.xy;',
  '  float patternBoxNoFitBoxWidth = boxSizeData.z;',
  '  vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;',
  '',
  '  v_patternUV = uv;',
  '  v_patternUV += graphicOffset / patternBoxScale;',
  '  v_patternUV += boxOrigin;',
  '  v_patternUV -= boxOrigin / patternBoxScale;',
  '  v_patternUV *= u_resolution.xy;',
  '  v_patternUV /= u_pixelRatio;',
  '  if (u_fit > 0.) {',
  '    v_patternUV *= (patternBoxNoFitBoxWidth / v_patternBoxSize.x);',
  '  }',
  '  v_patternUV /= u_scale;',
  '  v_patternUV = graphicRotation * v_patternUV;',
  '  v_patternUV += boxOrigin / patternBoxScale;',
  '  v_patternUV -= boxOrigin;',
  '  // x100 is a default multiplier between vertex and fragmant shaders',
  '  // we use it to avoid UV presision issues',
  '  v_patternUV *= .01;',
  '',
  '  // ===================================================',
  '',
  '  vec2 imageBoxSize;',
  '  if (u_fit == 1.) { // contain',
  '    imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;',
  '  } else if (u_fit == 2.) { // cover',
  '    imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;',
  '  } else {',
  '    imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);',
  '  }',
  '  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;',
  '  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;',
  '',
  '  v_imageUV = uv;',
  '  v_imageUV *= imageBoxScale;',
  '  v_imageUV += boxOrigin * (imageBoxScale - 1.);',
  '  v_imageUV += graphicOffset;',
  '  v_imageUV /= u_scale;',
  '  v_imageUV.x *= u_imageAspectRatio;',
  '  v_imageUV = graphicRotation * v_imageUV;',
  '  v_imageUV.x /= u_imageAspectRatio;',
  '',
  '  v_imageUV += .5;',
  '  v_imageUV.y = 1. - v_imageUV.y;',
  '}'
].join('\n');

/* mesh-gradient.js 片元（maxColorCount=10 展开；declarePI/rotation2/hash21 内联） */
var TILT_LATENT_MESH_FRAGMENT_SHADER = [
  '#version 300 es',
  'precision mediump float;',
  '',
  'uniform float u_time;',
  '',
  'uniform vec4 u_colors[10];',
  'uniform float u_colorsCount;',
  '',
  'uniform float u_distortion;',
  'uniform float u_swirl;',
  'uniform float u_grainMixer;',
  'uniform float u_grainOverlay;',
  '',
  'in vec2 v_objectUV;',
  'out vec4 fragColor;',
  '',
  '#define TWO_PI 6.28318530718',
  '#define PI 3.14159265358979323846',
  '',
  'vec2 rotate(vec2 uv, float th) {',
  '  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;',
  '}',
  '',
  'float hash21(vec2 p) {',
  '  p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;',
  '  p += dot(p, p + 19.19);',
  '  return fract(p.x * p.y);',
  '}',
  '',
  'float valueNoise(vec2 st) {',
  '  vec2 i = floor(st);',
  '  vec2 f = fract(st);',
  '  float a = hash21(i);',
  '  float b = hash21(i + vec2(1.0, 0.0));',
  '  float c = hash21(i + vec2(0.0, 1.0));',
  '  float d = hash21(i + vec2(1.0, 1.0));',
  '  vec2 u = f * f * (3.0 - 2.0 * f);',
  '  float x1 = mix(a, b, u.x);',
  '  float x2 = mix(c, d, u.x);',
  '  return mix(x1, x2, u.y);',
  '}',
  '',
  'float noise(vec2 n, vec2 seedOffset) {',
  '  return valueNoise(n + seedOffset);',
  '}',
  '',
  'vec2 getPosition(int i, float t) {',
  '  float a = float(i) * .37;',
  '  float b = .6 + fract(float(i) / 3.) * .9;',
  '  float c = .8 + fract(float(i + 1) / 4.);',
  '',
  '  float x = sin(t * b + a);',
  '  float y = cos(t * c + a * 1.5);',
  '',
  '  return .5 + .5 * vec2(x, y);',
  '}',
  '',
  'void main() {',
  '  vec2 uv = v_objectUV;',
  '  uv += .5;',
  '  vec2 grainUV = uv * 1000.;',
  '',
  '  float grain = noise(grainUV, vec2(0.));',
  '  float mixerGrain = .4 * u_grainMixer * (grain - .5);',
  '',
  '  const float firstFrameOffset = 41.5;',
  '  float t = .5 * (u_time + firstFrameOffset);',
  '',
  '  float radius = smoothstep(0., 1., length(uv - .5));',
  '  float center = 1. - radius;',
  '  for (float i = 1.; i <= 2.; i++) {',
  '    uv.x += u_distortion * center / i * sin(t + i * .4 * smoothstep(.0, 1., uv.y)) * cos(.2 * t + i * 2.4 * smoothstep(.0, 1., uv.y));',
  '    uv.y += u_distortion * center / i * cos(t + i * 2. * smoothstep(.0, 1., uv.x));',
  '  }',
  '',
  '  vec2 uvRotated = uv;',
  '  uvRotated -= vec2(.5);',
  '  float angle = 3. * u_swirl * radius;',
  '  uvRotated = rotate(uvRotated, -angle);',
  '  uvRotated += vec2(.5);',
  '',
  '  vec3 color = vec3(0.);',
  '  float opacity = 0.;',
  '  float totalWeight = 0.;',
  '',
  '  for (int i = 0; i < 10; i++) {',
  '    if (i >= int(u_colorsCount)) break;',
  '',
  '    vec2 pos = getPosition(i, t) + mixerGrain;',
  '    vec3 colorFraction = u_colors[i].rgb * u_colors[i].a;',
  '    float opacityFraction = u_colors[i].a;',
  '',
  '    float dist = length(uvRotated - pos);',
  '',
  '    dist = pow(dist, 3.5);',
  '    float weight = 1. / (dist + 1e-3);',
  '    color += colorFraction * weight;',
  '    opacity += opacityFraction * weight;',
  '    totalWeight += weight;',
  '  }',
  '',
  '  color /= max(1e-4, totalWeight);',
  '  opacity /= max(1e-4, totalWeight);',
  '',
  '  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));',
  '  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);',
  '  grainOverlay = pow(grainOverlay, 1.3);',
  '',
  '  float grainOverlayV = grainOverlay * 2. - 1.;',
  '  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));',
  '  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);',
  '  grainOverlayStrength = pow(grainOverlayStrength, .8);',
  '  color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);',
  '',
  '  opacity += .5 * grainOverlayStrength;',
  '  opacity = clamp(opacity, 0., 1.);',
  '',
  '  fragColor = vec4(color, opacity);',
  '}'
].join('\n');

/* dithering.js 片元（simplexNoise/declarePI/hash11/hash21 内联；
   u_shape/u_type 由 LatentBackground 传入的 shape='warp'(2)/type='4x4'(3) 消费） */
var TILT_LATENT_DITHER_FRAGMENT_SHADER = [
  '#version 300 es',
  'precision mediump float;',
  '',
  'uniform float u_time;',
  '',
  'uniform vec2 u_resolution;',
  'uniform float u_pixelRatio;',
  'uniform float u_originX;',
  'uniform float u_originY;',
  'uniform float u_worldWidth;',
  'uniform float u_worldHeight;',
  'uniform float u_fit;',
  'uniform float u_scale;',
  'uniform float u_rotation;',
  'uniform float u_offsetX;',
  'uniform float u_offsetY;',
  '',
  'uniform float u_pxSize;',
  'uniform vec4 u_colorBack;',
  'uniform vec4 u_colorFront;',
  'uniform float u_shape;',
  'uniform float u_type;',
  '',
  'out vec4 fragColor;',
  '',
  'vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }',
  'float snoise(vec2 v) {',
  '  const vec4 C = vec4(0.211324865405187, 0.366025403784439,',
  '    -0.577350269189626, 0.024390243902439);',
  '  vec2 i = floor(v + dot(v, C.yy));',
  '  vec2 x0 = v - i + dot(i, C.xx);',
  '  vec2 i1;',
  '  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
  '  vec4 x12 = x0.xyxy + C.xxzz;',
  '  x12.xy -= i1;',
  '  i = mod(i, 289.0);',
  '  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))',
  '    + i.x + vec3(0.0, i1.x, 1.0));',
  '  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),',
  '      dot(x12.zw, x12.zw)), 0.0);',
  '  m = m * m;',
  '  m = m * m;',
  '  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
  '  vec3 h = abs(x) - 0.5;',
  '  vec3 ox = floor(x + 0.5);',
  '  vec3 a0 = x - ox;',
  '  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);',
  '  vec3 g;',
  '  g.x = a0.x * x0.x + h.x * x0.y;',
  '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
  '  return 130.0 * dot(m, g);',
  '}',
  '#define TWO_PI 6.28318530718',
  '#define PI 3.14159265358979323846',
  '',
  'float hash11(float p) {',
  '  p = fract(p * 0.3183099) + 0.1;',
  '  p *= p + 19.19;',
  '  return fract(p * p);',
  '}',
  '',
  'float hash21(vec2 p) {',
  '  p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;',
  '  p += dot(p, p + 19.19);',
  '  return fract(p.x * p.y);',
  '}',
  '',
  'float getSimplexNoise(vec2 uv, float t) {',
  '  float noise = .5 * snoise(uv - vec2(0., .3 * t));',
  '  noise += .5 * snoise(2. * uv + vec2(0., .32 * t));',
  '',
  '  return noise;',
  '}',
  '',
  'const int bayer2x2[4] = int[4](0, 2, 3, 1);',
  'const int bayer4x4[16] = int[16](',
  '0, 8, 2, 10,',
  '12, 4, 14, 6,',
  '3, 11, 1, 9,',
  '15, 7, 13, 5',
  ');',
  '',
  'const int bayer8x8[64] = int[64](',
  '0, 32, 8, 40, 2, 34, 10, 42,',
  '48, 16, 56, 24, 50, 18, 58, 26,',
  '12, 44, 4, 36, 14, 46, 6, 38,',
  '60, 28, 52, 20, 62, 30, 54, 22,',
  '3, 35, 11, 43, 1, 33, 9, 41,',
  '51, 19, 59, 27, 49, 17, 57, 25,',
  '15, 47, 7, 39, 13, 45, 5, 37,',
  '63, 31, 55, 23, 61, 29, 53, 21',
  ');',
  '',
  'float getBayerValue(vec2 uv, int size) {',
  '  ivec2 pos = ivec2(fract(uv / float(size)) * float(size));',
  '  int index = pos.y * size + pos.x;',
  '',
  '  if (size == 2) {',
  '    return float(bayer2x2[index]) / 4.0;',
  '  } else if (size == 4) {',
  '    return float(bayer4x4[index]) / 16.0;',
  '  } else if (size == 8) {',
  '    return float(bayer8x8[index]) / 64.0;',
  '  }',
  '  return 0.0;',
  '}',
  '',
  '',
  'void main() {',
  '  float t = .5 * u_time;',
  '',
  '  float pxSize = u_pxSize * u_pixelRatio;',
  '  vec2 pxSizeUV = gl_FragCoord.xy - .5 * u_resolution;',
  '  pxSizeUV /= pxSize;',
  '  vec2 canvasPixelizedUV = (floor(pxSizeUV) + .5) * pxSize;',
  '  vec2 normalizedUV = canvasPixelizedUV / u_resolution;',
  '',
  '  vec2 ditheringNoiseUV = canvasPixelizedUV;',
  '  vec2 shapeUV = normalizedUV;',
  '',
  '  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);',
  '  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);',
  '  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;',
  '  float r = u_rotation * PI / 180.;',
  '  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));',
  '  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);',
  '',
  '  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;',
  '  vec2 boxSize = vec2(',
  '  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,',
  '  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y',
  '  );',
  '  ',
  '  if (u_shape > 3.5) {',
  '    vec2 objectBoxSize = vec2(0.);',
  '    // fit = none',
  '    objectBoxSize.x = min(boxSize.x, boxSize.y);',
  '    if (u_fit == 1.) { // fit = contain',
  '      objectBoxSize.x = min(u_resolution.x, u_resolution.y);',
  '    } else if (u_fit == 2.) { // fit = cover',
  '      objectBoxSize.x = max(u_resolution.x, u_resolution.y);',
  '    }',
  '    objectBoxSize.y = objectBoxSize.x;',
  '    vec2 objectWorldScale = u_resolution.xy / objectBoxSize;',
  '',
  '    shapeUV *= objectWorldScale;',
  '    shapeUV += boxOrigin * (objectWorldScale - 1.);',
  '    shapeUV += vec2(-u_offsetX, u_offsetY);',
  '    shapeUV /= u_scale;',
  '    shapeUV = graphicRotation * shapeUV;',
  '  } else {',
  '    vec2 patternBoxSize = vec2(0.);',
  '    // fit = none',
  '    patternBoxSize.x = patternBoxRatio * min(boxSize.x / patternBoxRatio, boxSize.y);',
  '    float patternWorldNoFitBoxWidth = patternBoxSize.x;',
  '    if (u_fit == 1.) { // fit = contain',
  '      patternBoxSize.x = patternBoxRatio * min(u_resolution.x / patternBoxRatio, u_resolution.y);',
  '    } else if (u_fit == 2.) { // fit = cover',
  '      patternBoxSize.x = patternBoxRatio * max(u_resolution.x / patternBoxRatio, u_resolution.y);',
  '    }',
  '    patternBoxSize.y = patternBoxSize.x / patternBoxRatio;',
  '    vec2 patternWorldScale = u_resolution.xy / patternBoxSize;',
  '',
  '    shapeUV += vec2(-u_offsetX, u_offsetY) / patternWorldScale;',
  '    shapeUV += boxOrigin;',
  '    shapeUV -= boxOrigin / patternWorldScale;',
  '    shapeUV *= u_resolution.xy;',
  '    shapeUV /= u_pixelRatio;',
  '    if (u_fit > 0.) {',
  '      shapeUV *= (patternWorldNoFitBoxWidth / patternBoxSize.x);',
  '    }',
  '    shapeUV /= u_scale;',
  '    shapeUV = graphicRotation * shapeUV;',
  '    shapeUV += boxOrigin / patternWorldScale;',
  '    shapeUV -= boxOrigin;',
  '    shapeUV += .5;',
  '  }',
  '',
  '  float shape = 0.;',
  '  if (u_shape < 1.5) {',
  '    // Simplex noise',
  '    shapeUV *= .001;',
  '',
  '    shape = 0.5 + 0.5 * getSimplexNoise(shapeUV, t);',
  '    shape = smoothstep(0.3, 0.9, shape);',
  '',
  '  } else if (u_shape < 2.5) {',
  '    // Warp',
  '    shapeUV *= .003;',
  '',
  '    for (float i = 1.0; i < 6.0; i++) {',
  '      shapeUV.x += 0.6 / i * cos(i * 2.5 * shapeUV.y + t);',
  '      shapeUV.y += 0.6 / i * cos(i * 1.5 * shapeUV.x + t);',
  '    }',
  '',
  '    shape = .15 / max(0.001, abs(sin(t - shapeUV.y - shapeUV.x)));',
  '    shape = smoothstep(0.02, 1., shape);',
  '',
  '  } else if (u_shape < 3.5) {',
  '    // Dots',
  '    shapeUV *= .05;',
  '',
  '    float stripeIdx = floor(2. * shapeUV.x / TWO_PI);',
  '    float rand = hash11(stripeIdx * 10.);',
  '    rand = sign(rand - .5) * pow(.1 + abs(rand), .4);',
  '    shape = sin(shapeUV.x) * cos(shapeUV.y - 5. * rand * t);',
  '    shape = pow(abs(shape), 6.);',
  '',
  '  } else if (u_shape < 4.5) {',
  '    // Sine wave',
  '    shapeUV *= 4.;',
  '',
  '    float wave = cos(.5 * shapeUV.x - 2. * t) * sin(1.5 * shapeUV.x + t) * (.75 + .25 * cos(3. * t));',
  '    shape = 1. - smoothstep(-1., 1., shapeUV.y + wave);',
  '',
  '  } else if (u_shape < 5.5) {',
  '    // Ripple',
  '',
  '    float dist = length(shapeUV);',
  '    float waves = sin(pow(dist, 1.7) * 7. - 3. * t) * .5 + .5;',
  '    shape = waves;',
  '',
  '  } else if (u_shape < 6.5) {',
  '    // Swirl',
  '',
  '    float l = length(shapeUV);',
  '    float angle = 6. * atan(shapeUV.y, shapeUV.x) + 4. * t;',
  '    float twist = 1.2;',
  '    float offset = 1. / pow(max(l, 1e-6), twist) + angle / TWO_PI;',
  '    float mid = smoothstep(0., 1., pow(l, twist));',
  '    shape = mix(0., fract(offset), mid);',
  '',
  '  } else {',
  '    // Sphere',
  '    shapeUV *= 2.;',
  '',
  '    float d = 1. - pow(length(shapeUV), 2.);',
  '    vec3 pos = vec3(shapeUV, sqrt(max(0., d)));',
  '    vec3 lightPos = normalize(vec3(cos(1.5 * t), .8, sin(1.25 * t)));',
  '    shape = .5 + .5 * dot(lightPos, pos);',
  '    shape *= step(0., d);',
  '  }',
  '',
  '',
  '  int type = int(floor(u_type));',
  '  float dithering = 0.0;',
  '',
  '  switch (type) {',
  '    case 1: {',
  '      dithering = step(hash21(ditheringNoiseUV), shape);',
  '    } break;',
  '    case 2:',
  '    dithering = getBayerValue(pxSizeUV, 2);',
  '    break;',
  '    case 3:',
  '    dithering = getBayerValue(pxSizeUV, 4);',
  '    break;',
  '    default :',
  '    dithering = getBayerValue(pxSizeUV, 8);',
  '    break;',
  '  }',
  '',
  '  dithering -= .5;',
  '  float res = step(.5, shape + dithering);',
  '',
  '  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;',
  '  float fgOpacity = u_colorFront.a;',
  '  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;',
  '  float bgOpacity = u_colorBack.a;',
  '',
  '  vec3 color = fgColor * res;',
  '  float opacity = fgOpacity * res;',
  '',
  '  color += bgColor * (1. - opacity);',
  '  opacity += bgOpacity * (1. - opacity);',
  '',
  '  fragColor = vec4(color, opacity);',
  '}'
].join('\n');

/* ---------- ShaderMount 驱动核心（shader-mount.js 同构：
   全屏 quad / currentFrame+=dt*speed / u_time=currentFrame*1e-3 /
   零速停 rAF / setUniforms 立即补帧 / 像素预算 sqrt clamp） ---------- */
function TiltLatentShaderMount(parentElement, fragmentShader, uniforms, speed) {
  var doc = parentElement.ownerDocument;
  var canvas = doc.createElement('canvas');
  canvas.style.cssText = 'display:block;position:absolute;inset:0;width:100%;height:100%;';
  parentElement.insertBefore(canvas, parentElement.firstChild);

  var gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) { canvas.parentNode.removeChild(canvas); return null; }

  var program = null;
  var uniformLocations = {};
  var uniformCache = {};
  var rafId = null;
  var lastRenderTime = 0;
  var currentFrame = 0;
  var speedValue = 0;
  var currentSpeed = 0;
  var resolutionChanged = true;
  var disposed = false;
  var minPixelRatio = 1;            /* LatentBackground.tsx:280 minPixelRatio={1} */
  var maxPixelCount = TILT_LATENT_MAX_SHADER_PIXELS;  /* LatentBackground.tsx:27 */

  function compileShader(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      if (typeof console !== 'undefined') console.error('TiltLatent shader compile:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
  (function initProgram() {
    var vs = compileShader(gl.VERTEX_SHADER, TILT_LATENT_VERTEX_SHADER);
    var fs = compileShader(gl.FRAGMENT_SHADER, fragmentShader);
    if (!vs || !fs) return;
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      if (typeof console !== 'undefined') console.error('TiltLatent program link:', gl.getProgramInfoLog(program));
      program = null;
      return;
    }
    gl.detachShader(program, vs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  })();
  if (!program) {
    var loseCtx = gl.getExtension('WEBGL_lose_context');
    if (loseCtx) loseCtx.loseContext();
    canvas.parentNode.removeChild(canvas);
    return null;
  }

  /* 全屏双三角（shader-mount.js:90 原值） */
  var positionLocation = gl.getAttribLocation(program, 'a_position');
  var positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  uniformLocations.u_time = gl.getUniformLocation(program, 'u_time');
  uniformLocations.u_pixelRatio = gl.getUniformLocation(program, 'u_pixelRatio');
  uniformLocations.u_resolution = gl.getUniformLocation(program, 'u_resolution');

  var renderScale = 1;

  /* handleResize（shader-mount.js:161-192；devicePixelContentBoxSize 缺省分支，
     Safari 缩放簿记为 Electron Chromium 宿主不需要） */
  function resize() {
    if (disposed || !parentElement.isConnected) return;
    var parentW = parentElement.clientWidth || 1;
    var parentH = parentElement.clientHeight || 1;
    var dpr = Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    var pinchZoom = 1;
    try { pinchZoom = (window.visualViewport && window.visualViewport.scale) || 1; } catch (e) { }
    var targetRenderScale = Math.max(dpr, minPixelRatio) * pinchZoom;
    var targetPixelWidth = Math.round(parentW) * targetRenderScale;
    var targetPixelHeight = Math.round(parentH) * targetRenderScale;
    var headroom = Math.sqrt(maxPixelCount) / Math.sqrt(targetPixelWidth * targetPixelHeight);
    var scaleToMeetMaxPixelCount = Math.min(1, headroom);
    var newWidth = Math.round(targetPixelWidth * scaleToMeetMaxPixelCount);
    var newHeight = Math.round(targetPixelHeight * scaleToMeetMaxPixelCount);
    var newRenderScale = newWidth / Math.round(parentW);
    if (canvas.width !== newWidth || canvas.height !== newHeight || renderScale !== newRenderScale) {
      renderScale = newRenderScale;
      canvas.width = newWidth;
      canvas.height = newHeight;
      resolutionChanged = true;
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      render(now());
    }
  }

  function render(currentTime) {
    if (disposed) return;
    var dt = currentTime - lastRenderTime;
    lastRenderTime = currentTime;
    if (currentSpeed !== 0) currentFrame += dt * currentSpeed;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform1f(uniformLocations.u_time, currentFrame * 1e-3);
    if (resolutionChanged) {
      gl.uniform2f(uniformLocations.u_resolution, gl.canvas.width, gl.canvas.height);
      gl.uniform1f(uniformLocations.u_pixelRatio, renderScale);
      resolutionChanged = false;
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (currentSpeed !== 0) {
      rafId = requestAnimationFrame(render);
    } else {
      rafId = null;
    }
  }

  function now() { return (typeof performance !== 'undefined') ? performance.now() : Date.now(); }

  function areUniformValuesEqual(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      for (var i = 0; i < a.length; i++) { if (!areUniformValuesEqual(a[i], b[i])) return false; }
      return true;
    }
    return false;
  }

  /* setUniformValues（shader-mount.js:276-335 同构：vec4 数组嵌套展平） */
  function setUniformValues(updatedUniforms) {
    if (disposed) return;
    gl.useProgram(program);
    for (var key in updatedUniforms) {
      if (!Object.prototype.hasOwnProperty.call(updatedUniforms, key)) continue;
      var value = updatedUniforms[key];
      if (areUniformValuesEqual(uniformCache[key], value)) continue;
      uniformCache[key] = Array.isArray(value) ? value.slice() : value;
      if (!uniformLocations[key]) uniformLocations[key] = gl.getUniformLocation(program, key);
      var location = uniformLocations[key];
      if (!location) continue;
      if (Array.isArray(value)) {
        var flat = (Array.isArray(value[0])) ? [].concat.apply([], value) : value;
        switch (flat.length) {
          case 2: gl.uniform2fv(location, flat); break;
          case 3: gl.uniform3fv(location, flat); break;
          case 4: gl.uniform4fv(location, flat); break;
          case 40: gl.uniform4fv(location, flat); break;   /* u_colors[10] */
          default: break;
        }
      } else if (typeof value === 'number') {
        gl.uniform1f(location, value);
      }
    }
  }

  function updateCurrentSpeed() {
    var hidden = false;
    try { hidden = document.hidden; } catch (e) { }
    setCurrentSpeed(hidden ? 0 : speedValue);
  }
  function setCurrentSpeed(newSpeed) {
    currentSpeed = newSpeed;
    if (rafId === null && newSpeed !== 0) {
      lastRenderTime = now();
      rafId = requestAnimationFrame(render);
    }
    if (rafId !== null && newSpeed === 0) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }
  function onVisibility() { updateCurrentSpeed(); }

  setUniformValues(uniforms);
  resize();
  setSpeed(speed);

  function setSpeed(newSpeed) {
    speedValue = (newSpeed == null) ? 1 : newSpeed;
    updateCurrentSpeed();
  }
  function setUniforms(newUniforms) {
    setUniformValues(newUniforms);
    for (var k in newUniforms) uniforms[k] = newUniforms[k];
    render(now());
  }
  function dispose() {
    disposed = true;
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    try {
      gl.deleteProgram(program);
      gl.deleteBuffer(positionBuffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.getError();
    } catch (e) { }
    try {
      var ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    } catch (e) { }
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  return {
    setSpeed: setSpeed,
    setUniforms: setUniforms,
    resize: resize,
    dispose: dispose,
    canvas: canvas
  };
}

/* ---------- 工厂（LatentBackground.tsx:109-326 的 DOM 落地 + 驱动循环同构） ---------- */
function TiltLatentBackground(opts) {
  var host = opts.host;
  if (!host || !host.appendChild || (typeof document === 'undefined')) return null;

  var theme = opts.theme;
  var tuning = opts.tuning || tiltLatentDefaultTuning;
  var staticMode = !!opts.staticMode;
  var pausedGet = opts.pausedGet || function () { return false; };
  var audioPowerGet = opts.audioPowerGet || function () { return 0; };
  var bandsGet = opts.bandsGet || function () { return null; };
  var coverUrlGet = opts.coverUrlGet || function () { return null; };

  var showMesh = tuning.displayMode !== 'dithering';      /* LatentBackground.tsx:126 */
  var showDithering = tuning.displayMode !== 'mesh';      /* LatentBackground.tsx:125 */

  /* 容器（:257-261 absolute inset-0 z-0，底色 theme.backgroundColor） */
  var container = document.createElement('div');
  container.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;background-color:' +
    (theme.backgroundColor || '#000000') + ';';

  /* mesh 层（:262-285 inset-0，scale(1.025) origin center） */
  var meshLayer = document.createElement('div');
  meshLayer.style.cssText = 'position:absolute;inset:0;transform:scale(1.025);transform-origin:center;';
  container.appendChild(meshLayer);

  /* dithering 层（:286-313 soft-light + opacity + scale(1.015)） */
  var ditherLayer = document.createElement('div');
  ditherLayer.style.cssText = 'position:absolute;inset:0;mix-blend-mode:' + (showMesh ? 'soft-light' : 'normal') +
    ';opacity:' + (showMesh ? tuning.ditheringOpacity : 1) + ';transform:scale(1.015);transform-origin:center;';
  container.appendChild(ditherLayer);

  /* 主题色压暗层（:315-323 overlayEnabled && overlayOpacity>0） */
  var overlay = null;
  if (tuning.overlayEnabled && tuning.overlayOpacity > 0) {
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background-color:' +
      (theme.backgroundColor || '#000000') + ';opacity:' + tuning.overlayOpacity + ';';
    container.appendChild(overlay);
  }
  host.appendChild(container);

  /* 两个 mount 的 sizing 默认（@paper-design/shaders-react 各组件缺省路径）：
     MeshGradient ← defaultObjectSizing{fit:contain(1),scale:1,origin:.5/.5,world:0/0}；
     Dithering ← defaultPatternSizing{fit:none(0),scale:.6(组件缺省覆盖),origin:.5/.5,world:0/0} */
  var MESH_SIZING = { u_fit: 1, u_scale: 1, u_rotation: 0, u_offsetX: 0, u_offsetY: 0, u_originX: 0.5, u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0 };
  var DITHER_SIZING = { u_fit: 0, u_scale: 0.6, u_rotation: 0, u_offsetX: 0, u_offsetY: 0, u_originX: 0.5, u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0 };

  var coverColors = [];
  var currentTheme = theme;

  function applyThemeColors() {
    var shaderColors = tiltLatentShaderColors(coverColors, currentTheme, tuning.colorSource);
    var meshUniforms = {
      u_colors: shaderColors.mesh.map(tiltLatentShaderColorFromString),
      u_colorsCount: shaderColors.mesh.length,
      u_distortion: tuning.meshDistortion,
      u_swirl: tuning.meshSwirl,
      u_grainMixer: 0,          /* LatentBackground.tsx:275 */
      u_grainOverlay: 0.01      /* LatentBackground.tsx:276 */
    };
    for (var k in MESH_SIZING) meshUniforms[k] = MESH_SIZING[k];
    if (meshMount) meshMount.setUniforms(meshUniforms);
    if (ditherMount) {
      var ditherUniforms = {
        u_colorBack: tiltLatentShaderColorFromString(shaderColors.ditheringBack),
        u_colorFront: tiltLatentShaderColorFromString(shaderColors.ditheringFront),
        u_shape: 2,               /* DitheringShapes.warp（LatentBackground.tsx:303 shape="warp"） */
        u_type: 3,                /* DitheringTypes['4x4']（LatentBackground.tsx:304 type="4x4"） */
        u_pxSize: tuning.ditheringSize
      };
      for (var k2 in DITHER_SIZING) ditherUniforms[k2] = DITHER_SIZING[k2];
      ditherMount.setUniforms(ditherUniforms);
    }
    container.style.backgroundColor = currentTheme.backgroundColor || '#000000';
    if (overlay) overlay.style.backgroundColor = currentTheme.backgroundColor || '#000000';
  }

  /* mount 创建（:268-282 / :297-311 的组件 props 同构：minPixelRatio 1、
     maxPixelCount 1280*720、初始 speed=resolveLatentShaderSpeed(base, audio, 0, paused)） */
  var paused0 = !!pausedGet();
  var meshMount = null;
  var ditherMount = null;
  try {
    meshMount = TiltLatentShaderMount(meshLayer, TILT_LATENT_MESH_FRAGMENT_SHADER, {}, staticMode ? 0 :
      tiltLatentShaderSpeed(tuning.meshSpeed, tuning.meshAudioSpeed, 0, paused0));
  } catch (e) { meshMount = null; }
  try {
    ditherMount = TiltLatentShaderMount(ditherLayer, TILT_LATENT_DITHER_FRAGMENT_SHADER, {}, staticMode ? 0 :
      tiltLatentShaderSpeed(tuning.ditheringSpeed, tuning.ditheringAudioSpeed, 0, paused0));
  } catch (e) { ditherMount = null; }

  if (!meshMount && !ditherMount) {
    if (container.parentNode) container.parentNode.removeChild(container);
    return null;   /* WebGL2 不可用 → 调用方回退宿主暖夜层 */
  }
  applyThemeColors();

  /* 封面取色（:129-148 useEffect 等价；coverUrl 变化重取） */
  var coverToken = 0;
  function refreshCoverColors() {
    var url = coverUrlGet();
    if (!url) { coverColors = []; applyThemeColors(); return; }
    var token = ++coverToken;
    tiltLatentLoadImagePixels(url).then(function (pixels) {
      if (token !== coverToken || disposed) return;
      coverColors = pixels ? tiltLatentExtractRepresentativeColorsFromPixels(pixels, 6) : [];
      applyThemeColors();
    });
  }
  refreshCoverColors();

  /* 驱动循环（:155-255 updateAudioResponse 同构——平滑常数/能量/脉冲/速度/
     uniforms/层样式全量；showMesh/showDithering 按 tuning 'both' 恒真） */
  var animationFrame = 0;
  var smoothedPower = 0;
  var smoothedBass = 0;
  var smoothedMid = 0;
  var smoothedBeatSpeed = 0;
  var previousBeatEnergy = 0;
  var latentOnsetPulse = 0;
  var disposed = false;

  function updateAudioResponse() {
    if (disposed) return;
    var isPaused = staticMode ? true : !!pausedGet();
    var bands = bandsGet() || {};
    var powerRaw = audioPowerGet();
    var bassRaw = (bands.bass != null) ? bands.bass : 0;
    var lowMidRaw = (bands.lowMid != null) ? bands.lowMid : 0;
    var midRaw = (bands.mid != null) ? bands.mid : 0;
    var vocalRaw = (bands.vocal != null) ? bands.vocal : 0;
    var trebleRaw = (bands.treble != null) ? bands.treble : 0;

    var targetPower = isPaused ? 0 : tiltLatentNormalizeAudio(powerRaw);                       /* :176 */
    var targetBass = isPaused ? 0 : tiltLatentNormalizeAudio(bassRaw);                         /* :177 */
    var targetBeatEnergy = isPaused ? 0 : tiltLatentBroadbandEnergy(                           /* :178-186 */
      bassRaw, lowMidRaw, midRaw, vocalRaw, trebleRaw);
    var targetMid = isPaused ? 0 : tiltLatentNormalizeAudio(Math.max(midRaw, vocalRaw));       /* :187-189 */

    smoothedPower = tiltLatentEaseTowards(smoothedPower, targetPower, 0.12);                   /* :190 */
    smoothedBass = tiltLatentEaseTowards(smoothedBass, targetBass, 0.16);                      /* :191 */
    smoothedMid = tiltLatentEaseTowards(smoothedMid, targetMid, 0.13);                         /* :192-196 */

    latentOnsetPulse = tuning.enhancedBeatResponse                                             /* :197-203 */
      ? tiltLatentOnsetPulse(targetBeatEnergy, previousBeatEnergy, latentOnsetPulse)
      : 0;
    previousBeatEnergy = targetBeatEnergy;                                                     /* :204 */

    var beatSpeedTarget = tiltLatentAudioSpeedTarget(                                          /* :205-209 */
      targetBeatEnergy, latentOnsetPulse, tuning.enhancedBeatResponse);
    smoothedBeatSpeed = tiltLatentEaseTowards(                                                 /* :210-214 */
      smoothedBeatSpeed, beatSpeedTarget, beatSpeedTarget > smoothedBeatSpeed ? 0.42 : 0.14);

    if (ditherMount) {
      ditherMount.setSpeed(tiltLatentShaderSpeed(                                              /* :219-224 */
        tuning.ditheringSpeed, tuning.ditheringAudioSpeed, smoothedBeatSpeed, isPaused));
      ditherMount.setUniforms({                                                                /* :225-227 */
        u_pxSize: Math.max(0.5, tuning.ditheringSize - smoothedBass * tuning.ditheringSize * 0.34)
      });
    }
    if (meshMount) {
      meshMount.setSpeed(tiltLatentShaderSpeed(                                                /* :228-233 */
        tuning.meshSpeed, tuning.meshAudioSpeed, smoothedBeatSpeed, isPaused));
      meshMount.setUniforms({                                                                  /* :234-237 */
        u_distortion: tuning.meshDistortion + smoothedPower * 0.62,
        u_swirl: tuning.meshSwirl + smoothedMid * 0.38
      });
    }

    if (ditherLayer) {
      ditherLayer.style.opacity = showMesh                                                     /* :239-244 */
        ? String(Math.min(1, tuning.ditheringOpacity + smoothedBass * 0.25))
        : '1';
      ditherLayer.style.transform = 'scale(' + (1.015 + smoothedBass * 0.025) + ')';
    }
    if (meshLayer) {
      meshLayer.style.filter = 'saturate(' + (1.04 + smoothedMid * 0.34) + ') brightness(' +   /* :245-248 */
        (0.94 + smoothedPower * 0.16) + ')';
      meshLayer.style.transform = 'scale(' + (1.025 + smoothedPower * 0.018) + ')';
    }

    animationFrame = requestAnimationFrame(updateAudioResponse);                                /* :250 */
  }
  animationFrame = requestAnimationFrame(updateAudioResponse);

  function onResize() { if (meshMount) meshMount.resize(); if (ditherMount) ditherMount.resize(); }
  window.addEventListener('resize', onResize);

  return {
    destroy: function () {
      disposed = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', onResize);
      if (meshMount) meshMount.dispose();
      if (ditherMount) ditherMount.dispose();
      if (container.parentNode) container.parentNode.removeChild(container);
    },
    setTheme: function (next) {
      currentTheme = next || currentTheme;
      applyThemeColors();
    },
    setCoverUrl: function () { refreshCoverColors(); },
    layer: container
  };
}

var CM_resolveThemeFontStack = resolveThemeFontStack;
env.CM_resolveThemeFontStack = CM_resolveThemeFontStack;
var CM_resolveThemeFontWeight = resolveThemeFontWeight;
env.CM_resolveThemeFontWeight = CM_resolveThemeFontWeight;
var CM_buildLineRenderHints = buildLineRenderHints;
env.CM_buildLineRenderHints = CM_buildLineRenderHints;
var CM_getLineRenderEndTime = getLineRenderEndTime;
env.CM_getLineRenderEndTime = CM_getLineRenderEndTime;
var CM_MICRO_LINE_DURATION_THRESHOLD = MICRO_LINE_DURATION_THRESHOLD;
env.CM_MICRO_LINE_DURATION_THRESHOLD = CM_MICRO_LINE_DURATION_THRESHOLD;
var CM_SHORT_LINE_DURATION_THRESHOLD = SHORT_LINE_DURATION_THRESHOLD;
env.CM_SHORT_LINE_DURATION_THRESHOLD = CM_SHORT_LINE_DURATION_THRESHOLD;
var CM_buildWordGraphemeTimings = buildWordGraphemeTimings;
env.CM_buildWordGraphemeTimings = CM_buildWordGraphemeTimings;
var CM_buildPostLyricLayoutUnits = buildPostLyricLayoutUnits;
env.CM_buildPostLyricLayoutUnits = CM_buildPostLyricLayoutUnits;
var CM_SentenceLayout = SentenceLayout;
env.CM_SentenceLayout = CM_SentenceLayout;
var CM_colorWithAlpha = colorWithAlpha;
env.CM_colorWithAlpha = CM_colorWithAlpha;
var CM_resolveSubtitleFontSizes = resolveSubtitleFontSizes;
env.CM_resolveSubtitleFontSizes = CM_resolveSubtitleFontSizes;
var CM_resolveThemeTranslationFontStack = resolveThemeTranslationFontStack;
env.CM_resolveThemeTranslationFontStack = CM_resolveThemeTranslationFontStack;
env.TiltTiltEngine = (typeof TiltTiltEngine !== "undefined") ? TiltTiltEngine : null;
env.tiltFindLineIndexAtTime = (typeof tiltFindLineIndexAtTime !== "undefined") ? tiltFindLineIndexAtTime : null;
env.tiltBuildTiltLayout = (typeof tiltBuildTiltLayout !== "undefined") ? tiltBuildTiltLayout : null;
env.tiltBuildCharTimings = (typeof tiltBuildCharTimings !== "undefined") ? tiltBuildCharTimings : null;
env.tiltFindSegmentWordRange = (typeof tiltFindSegmentWordRange !== "undefined") ? tiltFindSegmentWordRange : null;
env.tiltCharPulseIntensity = (typeof tiltCharPulseIntensity !== "undefined") ? tiltCharPulseIntensity : null;
env.tiltDetermineLineCount = (typeof tiltDetermineLineCount !== "undefined") ? tiltDetermineLineCount : null;
env.tiltSeededRandom = (typeof tiltSeededRandom !== "undefined") ? tiltSeededRandom : null;
env.TiltLatentBackground = (typeof TiltLatentBackground !== "undefined") ? TiltLatentBackground : null;
env.tiltLatentDefaultTuning = (typeof tiltLatentDefaultTuning !== "undefined") ? tiltLatentDefaultTuning : null;
env.tiltBandsGetEnergy = (typeof tiltBandsGetEnergy !== "undefined") ? tiltBandsGetEnergy : null;
env.tiltBandsProcess = (typeof tiltBandsProcess !== "undefined") ? tiltBandsProcess : null;
env.tiltBandsCompute = (typeof tiltBandsCompute !== "undefined") ? tiltBandsCompute : null;
env.tiltBandsBreath = (typeof tiltBandsBreath !== "undefined") ? tiltBandsBreath : null;
env.tiltLatentBroadbandEnergy = (typeof tiltLatentBroadbandEnergy !== "undefined") ? tiltLatentBroadbandEnergy : null;
env.tiltLatentOnsetPulse = (typeof tiltLatentOnsetPulse !== "undefined") ? tiltLatentOnsetPulse : null;
env.tiltLatentBeatSpeedTarget = (typeof tiltLatentBeatSpeedTarget !== "undefined") ? tiltLatentBeatSpeedTarget : null;
env.tiltLatentAudioSpeedTarget = (typeof tiltLatentAudioSpeedTarget !== "undefined") ? tiltLatentAudioSpeedTarget : null;
env.tiltLatentShaderSpeed = (typeof tiltLatentShaderSpeed !== "undefined") ? tiltLatentShaderSpeed : null;
env.tiltLatentShaderColors = (typeof tiltLatentShaderColors !== "undefined") ? tiltLatentShaderColors : null;
})(typeof pretext !== "undefined" ? pretext : {}, typeof window !== "undefined" ? window : this);