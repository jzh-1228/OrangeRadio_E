// OrangeSea PENDOLO ENGINE (AGPL-3.0, from folia-major) -- no-build bundle
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

// ======== utils/lyrics/alternateText ========
/**
 * Collapses the dual-row mode to the one track a single-track consumer can show.
 * Monet, Pendolo, Lattice and Still lay translation out inside their own lyric animation
 * (a second lyric track rather than the shared bottom subtitle), so they cannot stack two
 * rows yet; under 'both' they keep their existing translation-only behaviour.
 */
const resolveSingleTrackSubtitleMode = (mode) => (mode === 'both' ? 'translation' : mode);
const findAlternateText = (alternateTexts, role) => (alternateTexts?.find(entry => entry.role === role && entry.text.trim())?.text.trim() ?? null);
const resolveTrackText = (source, role) => {
    const directText = role === 'translation' ? source.translation : source.romanization;
    return directText?.trim() || findAlternateText(source.alternateTexts, role);
};
/** Single-track text for a mode; 'both' is treated as translation (see resolveSingleTrackSubtitleMode). */
const resolveLyricAlternateText = (source, mode) => {
    const singleTrackMode = resolveSingleTrackSubtitleMode(mode);
    if (!source || singleTrackMode === 'none') {
        return null;
    }
    return resolveTrackText(source, singleTrackMode);
};
/**
 * Ordered subtitle rows for the shared bottom overlay: romanization first, translation second.
 * Single-source modes return at most one row; 'both' returns whichever of the two exist, so a
 * line with only one of them yields one row and never an empty placeholder. `isReadable` lets
 * the caller drop placeholder strings (e.g. "//") per row before the rows are counted.
 */
const resolveLyricSubtitleTracks = (source, mode, isReadable = () => true) => {
    if (!source || mode === 'none') {
        return [];
    }
    const roles = mode === 'both' ? ['romanization', 'translation'] : [mode];
    const tracks = [];
    for (const role of roles) {
        const text = resolveTrackText(source, role);
        if (!text || !isReadable(text)) {
            continue;
        }
        // Some sources fill both fields with the same string (e.g. already-Latin lyrics); show it once.
        if (tracks.some(track => track.text === text)) {
            continue;
        }
        tracks.push({ role, text });
    }
    return tracks;
};
const resolveSubtitleContentMode = (mode, legacyShowTranslation = true) => mode ?? (legacyShowTranslation ? 'translation' : 'none');
/** Command-palette cycle: translation -> romanization -> both -> translation ('none' re-enters at translation). */
const cycleSubtitleContentMode = (mode) => {
    if (mode === 'translation')
        return 'romanization';
    if (mode === 'romanization')
        return 'both';
    return 'translation';
};

// ======== utils/lyrics/subtitleTrackStyle ========
// src/utils/lyrics/subtitleTrackStyle.ts
// Shared visual step between the rows of a dual subtitle stack (romanization + translation), so the
// shared bottom overlay and the modes that lay subtitles out inside their own lyric animation
// (Monet, Pendolo) read the same way.
// Second row of the 'both' stack is a step quieter than the first, so romanization (what you sing along to)
// leads and the translation reads as its gloss. Both rows keep the user's subtitle font, weight and scale;
// this only trims size and opacity relative to them.
const SECONDARY_TRACK_SIZE_FACTOR = 0.88;
const SECONDARY_TRACK_OPACITY = 0.82;
/** Fallback weight for the second row when the theme sets none; the first row falls back to 500. */
const SECONDARY_TRACK_FONT_WEIGHT_FALLBACK = 400;
/** Gap above the second row, in em of that row's own font size. */
const SECONDARY_TRACK_GAP_EM = 0.25;

// ======== utils/lyrics/graphemeTiming ========
const graphemeSegmenter__1 = typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;
const splitLyricGraphemes = (text) => {
    if (!text) {
        return [];
    }
    if (graphemeSegmenter__1) {
        return Array.from(graphemeSegmenter__1.segment(text), ({ segment }) => segment);
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

// ======== components/visualizer/monet/monetLyricsModel ========
var {  clearCache, layoutWithLines, prepareWithSegments  } = pretext;
var {  measureRichInlineStats, prepareRichInline  } = pretext;
const ROOT_FONT_PX = 16;
const VIEWPORT_WIDTH_FALLBACK_PX = 1280;
// The active lyric is never truncated: its box is content-driven at render time.
// This cap only bounds the vertical track height the rail reserves for positioning,
// so a mis-parsed multi-hundred-character line cannot blow up the whole rail geometry.
// Reserving too few rows makes the active block overlap its neighbours, and large font scales
// on a narrow column reach high row counts legitimately, so keep the guard well clear of them.
const MONET_ACTIVE_TEXT_LINE_LIMIT = 14;
const MONET_INACTIVE_TEXT_LINE_LIMIT = 2;
const MONET_TRANSLATION_LINE_LIMIT = 2;
const MONET_MIN_MEASURE_WIDTH_PX = 180;
const MONET_GRAPHEME_OFFSETS_CACHE_LIMIT = 420;
const MONET_VERTICAL_METRICS_CACHE_LIMIT = 420;
const MONET_GLYPH_VERTICAL_SAFETY_PX = 2;
// Below 2xl nothing scales, so every existing viewport keeps its current layout exactly.
const MONET_LARGE_SCREEN_MIN_PX = 1536;
const MONET_LARGE_SCREEN_FULL_PX = 2200;
const MONET_LARGE_SCREEN_MAX_SCALE = 1.16;
const MONET_RAIL_BASE_MAX_WIDTH_PX = 780;
const MONET_RAIL_BASE_MAX_HEIGHT_PX = 520;
const MONET_ROW_BASE_MAX_WIDTH_PX = 1520;
const MONET_PORTRAIT_BASE_MAX_PX = 430;
const MONET_PORTRAIT_INNER_BASE_MAX_PX = 380;
const monetGraphemeOffsetsCache = new Map();
const monetVerticalMetricsCache = new Map();
let monetVerticalMeasureContext = null;
const graphemeSegmenter__2 = typeof Intl !== 'undefined'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/**
 * Every Monet clamp tops out between a ~1200px and ~1600px viewport, so anything wider leaves the
 * whole composition stranded as a small island in the middle of the screen. Past 2xl the layout
 * scales up as one piece instead of sitting at its cap.
 *
 * Font sizes and the lyric column share this factor, so the column-width to font-size ratio — and
 * therefore how much text fits on a line — stays constant. Scaling up must not change wrapping.
 */
const resolveMonetLargeScreenScale = (containerWidthPx) => {
    // Prefer the renderer's own width: an embedded preview on a large display must not scale itself
    // up as if it owned the screen. Falls back to the viewport before the first measurement lands.
    const referenceWidth = containerWidthPx && containerWidthPx > 0
        ? containerWidthPx
        : typeof window !== 'undefined' ? window.innerWidth : VIEWPORT_WIDTH_FALLBACK_PX;
    if (referenceWidth <= MONET_LARGE_SCREEN_MIN_PX) {
        return 1;
    }
    const progress = Math.min(1, (referenceWidth - MONET_LARGE_SCREEN_MIN_PX) / (MONET_LARGE_SCREEN_FULL_PX - MONET_LARGE_SCREEN_MIN_PX));
    return 1 + (MONET_LARGE_SCREEN_MAX_SCALE - 1) * progress;
};
const resolveClampFontPx = (minRem, preferredVw, maxRem) => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : VIEWPORT_WIDTH_FALLBACK_PX;
    return Math.min(maxRem * ROOT_FONT_PX, Math.max(minRem * ROOT_FONT_PX, viewportWidth * (preferredVw / 100)));
};
const splitMonetGraphemes = (text) => {
    if (!text) {
        return [];
    }
    if (graphemeSegmenter__2) {
        return Array.from(graphemeSegmenter__2.segment(text), ({ segment }) => segment);
    }
    return Array.from(text);
};
/**
 * Measures the wrapped line count and widest line the rail will actually render for a lyric line.
 * Timed words render as `inline-block` spans (see MonetWordSweep), so the browser may only break
 * between tokens, never inside one. Measuring `fullText` as a plain string breaks anywhere and
 * disagrees with the DOM — most visibly on CJK lyrics, whose phrase tokens carry no spaces.
 * `break: 'never'` reproduces those atomic boxes, so the reserved height matches what is painted.
 */
const measureLyricLineStats = (line, fontSpec, maxWidthPx) => {
    const tokens = buildMonetDisplayTokens(line);
    if (tokens.length === 0) {
        return { lineCount: 1, maxLineWidthPx: 0 };
    }
    const items = tokens.map(token => ({
        text: token.text,
        font: fontSpec,
        break: token.timed ? 'never' : 'normal',
    }));
    const { lineCount, maxLineWidth } = measureRichInlineStats(prepareRichInline(items), Math.max(maxWidthPx, MONET_MIN_MEASURE_WIDTH_PX));
    return { lineCount: Math.max(lineCount, 1), maxLineWidthPx: maxLineWidth };
};
const measureTextLineCount = (text, fontSpec, maxWidthPx, lineHeightPx) => {
    const prepared = prepareWithSegments(text || ' ', fontSpec, { whiteSpace: 'pre-wrap' });
    const layout = layoutWithLines(prepared, Math.max(maxWidthPx, MONET_MIN_MEASURE_WIDTH_PX), lineHeightPx);
    return Math.max(layout.lines.length, 1);
};
const getMonetVerticalMeasureContext = () => {
    if (monetVerticalMeasureContext) {
        return monetVerticalMeasureContext;
    }
    if (typeof OffscreenCanvas !== 'undefined') {
        monetVerticalMeasureContext = new OffscreenCanvas(1, 1).getContext('2d');
        return monetVerticalMeasureContext;
    }
    if (typeof document !== 'undefined') {
        monetVerticalMeasureContext = document.createElement('canvas').getContext('2d');
    }
    return monetVerticalMeasureContext;
};
/** Measures the tallest painted glyph bounds so descenders remain inside Monet's clipped line box. */
const measureMonetLineHeight = (text, fontSpec, fontPx, defaultLineHeightPx) => {
    const cacheKey = `${fontSpec}|${text}`;
    const cached = monetVerticalMetricsCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }
    const context = getMonetVerticalMeasureContext();
    if (!context) {
        return defaultLineHeightPx;
    }
    context.font = fontSpec;
    const metrics = context.measureText(text || 'Hg');
    const glyphHeightPx = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const measuredLineHeightPx = glyphHeightPx > 0
        ? Math.max(defaultLineHeightPx, Math.ceil(glyphHeightPx + MONET_GLYPH_VERTICAL_SAFETY_PX))
        : defaultLineHeightPx;
    if (monetVerticalMetricsCache.size >= MONET_VERTICAL_METRICS_CACHE_LIMIT) {
        const oldestKey = monetVerticalMetricsCache.keys().next().value;
        if (oldestKey) {
            monetVerticalMetricsCache.delete(oldestKey);
        }
    }
    monetVerticalMetricsCache.set(cacheKey, measuredLineHeightPx);
    return measuredLineHeightPx;
};
/**
 * Drops every cached text measurement.
 *
 * Metrics measured while a web font was still loading came from a fallback face, and the cache keys
 * (the font shorthand string) are identical before and after the load, so they never expire on their
 * own. Call this when `useFontsEpoch` advances.
 */
const clearMonetMeasurementCaches = () => {
    monetVerticalMetricsCache.clear();
    monetGraphemeOffsetsCache.clear();
    clearCache();
};
const measureTextWidthAtPx = (text, fontPx, fontSpec) => {
    const prepared = prepareWithSegments(text || ' ', fontSpec);
    const layout = layoutWithLines(prepared, 99999, fontPx * 1.2);
    return layout.lines[0]?.width ?? Math.max(text.length, 1) * fontPx * 0.6;
};
const buildGraphemeOffsetsCacheKey = (text, fontPx, fontSpec) => (`${fontPx}|${fontSpec}|${text}`);
const rememberGraphemeOffsets = (key, offsets) => {
    if (monetGraphemeOffsetsCache.size >= MONET_GRAPHEME_OFFSETS_CACHE_LIMIT) {
        const oldestKey = monetGraphemeOffsetsCache.keys().next().value;
        if (oldestKey) {
            monetGraphemeOffsetsCache.delete(oldestKey);
        }
    }
    monetGraphemeOffsetsCache.set(key, offsets);
    return offsets;
};
/** Builds cumulative grapheme offsets so the lyric fill edge can sweep through glyphs instead of stepping whole words. */
const measureMonetGraphemeOffsets = (text, fontPx, fontSpec) => {
    const cacheKey = buildGraphemeOffsetsCacheKey(text, fontPx, fontSpec);
    const cached = monetGraphemeOffsetsCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const graphemes = splitMonetGraphemes(text);
    const offsets = new Array(graphemes.length + 1).fill(0);
    for (let index = 1; index <= graphemes.length; index += 1) {
        offsets[index] = measureTextWidthAtPx(graphemes.slice(0, index).join(''), fontPx, fontSpec);
    }
    return rememberGraphemeOffsets(cacheKey, offsets);
};
/** Keeps the sweep narrow enough for short CJK lyric tokens to hand off continuously. */
const resolveMonetSweepEdgeSoftness = (fontPx) => (Math.max(Math.min(fontPx * 0.45, 16), 6));
/** Extends the mask front so its soft trailing edge has fully cleared the word at its end time. */
const resolveMonetSweepEnd = (filledWidthPx, fullWidthPx, edgeSoftnessPx) => {
    if (fullWidthPx <= 0) {
        return 0;
    }
    const progress = Math.min(1, Math.max(0, filledWidthPx / fullWidthPx));
    return filledWidthPx + edgeSoftnessPx * progress;
};
const resolveMonetLineStatus = (line, index, activeIndex, currentTime) => {
    if (index === activeIndex || (activeIndex < 0 && currentTime >= line.startTime && currentTime <= line.endTime)) {
        return 'active';
    }
    if (currentTime > line.endTime || (activeIndex >= 0 && index < activeIndex)) {
        return 'passed';
    }
    return 'waiting';
};
const resolveMonetWordStatus = (currentTime, startTime, endTime) => {
    if (currentTime < startTime) {
        return 'waiting';
    }
    if (currentTime <= endTime) {
        return 'active';
    }
    return 'passed';
};
/** Builds a stable display-token list so fullText punctuation and spaces survive around timed lyric words. */
const buildMonetDisplayTokens = (line) => {
    if (line.words.length === 0) {
        return [{
                text: line.fullText,
                startTime: line.startTime,
                endTime: getLineRenderEndTime(line),
                key: `${line.startTime}-full`,
                timed: true,
                startOffset: 0,
                endOffset: line.fullText.length,
                graphemeTimings: buildLineGraphemeTimeline(line),
            }];
    }
    const tokens = [];
    let cursor = 0;
    line.words.forEach((word, index) => {
        const matchIndex = line.fullText.indexOf(word.text, cursor);
        if (matchIndex < 0) {
            return;
        }
        if (matchIndex > cursor) {
            tokens.push({
                text: line.fullText.slice(cursor, matchIndex),
                startTime: null,
                endTime: null,
                key: `${line.startTime}-static-${cursor}`,
                timed: false,
                startOffset: cursor,
                endOffset: matchIndex,
                graphemeTimings: [],
            });
        }
        const endOffset = matchIndex + word.text.length;
        tokens.push({
            text: word.text,
            startTime: word.startTime,
            endTime: word.endTime,
            key: `${line.startTime}-${index}-${word.startTime}`,
            timed: true,
            startOffset: matchIndex,
            endOffset,
            graphemeTimings: buildWordGraphemeTimings(word),
        });
        cursor = endOffset;
    });
    if (cursor < line.fullText.length) {
        tokens.push({
            text: line.fullText.slice(cursor),
            startTime: null,
            endTime: null,
            key: `${line.startTime}-tail-${cursor}`,
            timed: false,
            startOffset: cursor,
            endOffset: line.fullText.length,
            graphemeTimings: [],
        });
    }
    return tokens.length > 0
        ? tokens
        : [{
                text: line.fullText,
                startTime: line.startTime,
                endTime: getLineRenderEndTime(line),
                key: `${line.startTime}-fallback-full`,
                timed: true,
                startOffset: 0,
                endOffset: line.fullText.length,
                graphemeTimings: buildLineGraphemeTimeline(line),
            }];
};
const resolveMonetLyricContext = (lines, currentLineIndex, activeLine, recentCompletedLine, nextLine) => {
    if (!activeLine) {
        return {
            previousLine: recentCompletedLine,
            activeLine: null,
            nextLine,
        };
    }
    return {
        previousLine: currentLineIndex > 0 ? lines[currentLineIndex - 1] ?? null : null,
        activeLine,
        nextLine: lines[currentLineIndex + 1] ?? nextLine,
    };
};
const findLineIndex = (lines, target) => {
    if (!target) {
        return -1;
    }
    const directIndex = lines.indexOf(target);
    if (directIndex >= 0) {
        return directIndex;
    }
    return lines.findIndex(line => line.startTime === target.startTime && line.fullText === target.fullText);
};
/** Selects a small lyric window and assigns the explicit waiting/active/passed state for each rail item. */
const buildMonetVisibleLineEntries = ({ lines, currentLineIndex, activeLine, recentCompletedLine, upcomingLine, currentTime, before = 2, after = 2, }) => {
    if (lines.length === 0) {
        return [];
    }
    const activeIndex = activeLine
        ? (currentLineIndex >= 0 ? currentLineIndex : findLineIndex(lines, activeLine))
        : -1;
    const upcomingIndex = findLineIndex(lines, upcomingLine);
    const recentIndex = findLineIndex(lines, recentCompletedLine);
    const anchorIndex = activeIndex >= 0
        ? activeIndex
        : upcomingIndex >= 0
            ? upcomingIndex
            : recentIndex;
    if (anchorIndex < 0) {
        return [];
    }
    const startIndex = Math.max(0, anchorIndex - before);
    const endIndex = Math.min(lines.length - 1, anchorIndex + after);
    const entries = [];
    for (let index = startIndex; index <= endIndex; index += 1) {
        const line = lines[index];
        entries.push({
            key: `${index}-${line.startTime}-${line.fullText}`,
            line,
            index,
            offset: index - anchorIndex,
            status: resolveMonetLineStatus(line, index, activeIndex, currentTime),
        });
    }
    return entries;
};
// Pure marker/separator strings ("//", "●●●", dashes) are timing placeholders, never display text; a row
// is only shown if it holds at least one letter or digit in any script. Mirrors the shared subtitle overlay.
const isReadableSubtitleText = (text) => /[\p{L}\p{N}]/u.test(text);
/** Ordered subtitle rows Monet shows under the active lyric: romanization first, translation second, placeholders dropped. */
const resolveMonetSubtitleTracks = (line, mode) => (resolveLyricSubtitleTracks(line, mode, isReadableSubtitleText));
/**
 * Measures one subtitle row. The first row keeps the single-subtitle look and spacing; the second
 * steps down in size and starts GAP_EM (of its own font size) below the first. Each row is capped
 * at MONET_TRANSLATION_LINE_LIMIT rows and reports whether the cap cut it.
 */
const measureMonetSubtitleTrack = (track, isSecondary, inputs) => {
    const fontPx = isSecondary ? inputs.translationFontPx * SECONDARY_TRACK_SIZE_FACTOR : inputs.translationFontPx;
    const fontWeight = isSecondary ? inputs.secondaryTranslationFontWeight : inputs.translationFontWeight;
    const fontSpec = `${fontWeight} ${fontPx}px ${inputs.translationFontStack}`;
    const lineHeightPx = measureMonetLineHeight(track.text, fontSpec, fontPx, fontPx * 1.28);
    const paddingTopPx = isSecondary ? fontPx * SECONDARY_TRACK_GAP_EM : Math.max(fontPx * 0.45, 7);
    const paddingBottomPx = Math.max(fontPx * 0.18, 5);
    const rawLineCount = measureTextLineCount(track.text, fontSpec, inputs.maxWidthPx, lineHeightPx);
    const lineCount = Math.min(rawLineCount, MONET_TRANSLATION_LINE_LIMIT);
    const contentHeightPx = lineCount * lineHeightPx;
    return {
        role: track.role,
        text: track.text,
        fontPx,
        fontWeight,
        lineCount,
        lineHeightPx,
        contentHeightPx,
        paddingTopPx,
        paddingBottomPx,
        heightPx: contentHeightPx + paddingTopPx + paddingBottomPx,
        isClipped: rawLineCount > lineCount,
    };
};
/**
 * Cache key for a measured line. Besides geometry it carries the subtitle mode and the resolved row
 * texts, so switching romanization / translation / both never reuses a box measured for another mode.
 */
const buildMonetLayoutCacheKey = (entry, inputs) => [
    entry.index,
    entry.line.startTime,
    entry.line.endTime,
    entry.line.fullText,
    inputs.subtitleContentMode,
    // Only an active line measures subtitle rows, so other lines don't churn when the subtitle text changes.
    entry.status === 'active'
        ? resolveMonetSubtitleTracks(entry.line, inputs.subtitleContentMode).map(track => `${track.role}:${track.text}`).join('\u0002')
        : '',
    entry.status,
    inputs.fontPx,
    inputs.translationFontPx,
    inputs.fontStack,
    inputs.translationFontStack,
    inputs.fontWeight,
    inputs.translationFontWeight,
    inputs.secondaryTranslationFontWeight,
    inputs.maxWidthPx,
].join('\u0001');
/** Measures the text box Monet will reserve before animating the rail, keeping layout off the hot path. */
const measureMonetLineLayout = ({ line, status, fontPx, translationFontPx, fontStack, translationFontStack, fontWeight = 600, translationFontWeight = 500, secondaryTranslationFontWeight = SECONDARY_TRACK_FONT_WEIGHT_FALLBACK, maxWidthPx, showSubtitleTranslation = true, subtitleContentMode, }) => {
    const fontSpec = `${fontWeight} ${fontPx}px ${fontStack}`;
    const resolvedTranslationFontStack = translationFontStack ?? fontStack;
    const lineHeightPx = measureMonetLineHeight(line.fullText, fontSpec, fontPx, fontPx * 1.18);
    const textPaddingTopPx = Math.max(fontPx * 0.16, 8);
    const textPaddingBottomPx = Math.max(fontPx * 0.34, 14);
    const { lineCount: textLineCount, maxLineWidthPx } = measureLyricLineStats(line, fontSpec, maxWidthPx);
    const textLimit = status === 'active' ? MONET_ACTIVE_TEXT_LINE_LIMIT : MONET_INACTIVE_TEXT_LINE_LIMIT;
    const visibleTextLineCount = Math.min(textLineCount, textLimit);
    const textContentHeightPx = visibleTextLineCount * lineHeightPx;
    const textHeightPx = textContentHeightPx + textPaddingTopPx + textPaddingBottomPx;
    const trackInputs = {
        fontPx,
        translationFontPx,
        fontStack,
        translationFontStack: resolvedTranslationFontStack,
        fontWeight,
        translationFontWeight,
        secondaryTranslationFontWeight,
        maxWidthPx,
        subtitleContentMode: resolveSubtitleContentMode(subtitleContentMode, showSubtitleTranslation),
    };
    const subtitleTracks = status === 'active'
        ? resolveMonetSubtitleTracks(line, trackInputs.subtitleContentMode)
            .map((track, index) => measureMonetSubtitleTrack(track, index > 0, trackInputs))
        : [];
    const firstTrack = subtitleTracks[0];
    const lastTrack = subtitleTracks[subtitleTracks.length - 1];
    const translationHeightPx = subtitleTracks.reduce((total, track) => total + track.heightPx, 0);
    return {
        textLineCount,
        visibleTextLineCount,
        textHeightPx,
        textContentHeightPx,
        textPaddingTopPx,
        textPaddingBottomPx,
        subtitleTracks,
        translationLineCount: subtitleTracks.reduce((total, track) => total + track.lineCount, 0),
        translationHeightPx,
        translationContentHeightPx: subtitleTracks.reduce((total, track) => total + track.contentHeightPx, 0),
        translationPaddingTopPx: firstTrack?.paddingTopPx ?? Math.max(translationFontPx * 0.45, 7),
        translationPaddingBottomPx: lastTrack?.paddingBottomPx ?? Math.max(translationFontPx * 0.18, 5),
        visualHeightPx: textHeightPx + translationHeightPx,
        lineHeightPx,
        translationLineHeightPx: firstTrack?.lineHeightPx
            ?? measureMonetLineHeight('', `${translationFontWeight} ${translationFontPx}px ${resolvedTranslationFontStack}`, translationFontPx, translationFontPx * 1.28),
        isTextClipped: textLineCount > visibleTextLineCount,
        // A token wider than the column (a long compound word) overruns the text box and would be
        // sliced mid-glyph by `overflow: hidden`. The rail fades that edge out instead.
        isTextOverflowingWidth: maxLineWidthPx > maxWidthPx,
        isTranslationClipped: subtitleTracks.some(track => track.isClipped),
    };
};

// ======== components/visualizer/pendolo/pendoloColorRuns ========

/** Coalesces adjacent graphemes with the same resolved color into one shaping-safe text run. */
const buildPendoloColorRuns = (text, graphemeStart, tokenColors, fallbackColor) => {
    const runs = [];
    splitLyricGraphemes(text).forEach((grapheme, localIndex) => {
        const color = tokenColors.get(String(graphemeStart + localIndex)) ?? fallbackColor;
        const previous = runs[runs.length - 1];
        if (previous?.color === color) {
            previous.text += grapheme;
            return;
        }
        runs.push({ key: `${graphemeStart + localIndex}-${color}`, text: grapheme, color });
    });
    return runs;
};

// ======== components/visualizer/pendolo/pendoloGeometry ========
var {  prepareWithSegments, layoutWithLines  } = pretext;
/**
 * Calculates wheel geometry and placement for lyric lines along the pendulum escapement arc.
 */
function calculatePendoloWheelLayout(lines, targetLineIndex, escapementAngleOffsetRad, viewportWidth, viewportHeight, tuning, radiusOffsetPx = 0, lineBlockHeights) {
    const centerX = viewportWidth * tuning.wheelCenterX;
    const centerY = viewportHeight * tuning.wheelCenterY;
    const baseRadius = Math.min(viewportWidth, viewportHeight) * tuning.arcRadius + radiusOffsetPx;
    // Angle step between adjacent lyric lines along the wheel arc (in radians)
    const totalArcRad = (tuning.arcAngleDeg * Math.PI) / 180;
    const visibleWindowCount = 9; // Number of lines visible across the arc window
    const angleStepRad = totalArcRad / Math.max(1, visibleWindowCount - 1);
    const isIntegerTarget = Number.isInteger(targetLineIndex);
    const activeIndex = isIntegerTarget && targetLineIndex >= 0 && targetLineIndex < lines.length
        ? targetLineIndex
        : -1;
    const hasActive = activeIndex >= 0;
    const items = [];
    // Reference center for rendering window
    const centerRef = Math.max(0, Math.min(lines.length - 1, Math.floor(targetLineIndex >= 0 ? targetLineIndex : 0)));
    // Wide enough index window; actual visibility is angle-gated at ±90° (right semicircle only)
    const windowStart = Math.max(0, centerRef - 8);
    const windowEnd = Math.min(lines.length - 1, centerRef + 8);
    const visualAngles = new Map();
    if (Number.isInteger(targetLineIndex) && targetLineIndex >= windowStart && targetLineIndex <= windowEnd) {
        const activeIndex = targetLineIndex;
        visualAngles.set(activeIndex, 0);
        for (let index = activeIndex + 1; index <= windowEnd; index += 1) {
            const previousHeight = lineBlockHeights?.[index - 1] ?? 0;
            const currentHeight = lineBlockHeights?.[index] ?? 0;
            const spacing = Math.max(angleStepRad, (previousHeight + currentHeight + 24) / (2 * baseRadius));
            visualAngles.set(index, (visualAngles.get(index - 1) ?? 0) + spacing);
        }
        for (let index = activeIndex - 1; index >= windowStart; index -= 1) {
            const nextHeight = lineBlockHeights?.[index + 1] ?? 0;
            const currentHeight = lineBlockHeights?.[index] ?? 0;
            const spacing = Math.max(angleStepRad, (nextHeight + currentHeight + 24) / (2 * baseRadius));
            visualAngles.set(index, (visualAngles.get(index + 1) ?? 0) - spacing);
        }
    }
    for (let i = windowStart; i <= windowEnd; i++) {
        const line = lines[i];
        if (!line)
            continue;
        const distanceIndex = i - targetLineIndex;
        // Base focal angle is 0 (horizontal to right).
        // Upcoming lines curve downward (positive angle), past lines curve upward (negative angle).
        const rawAngleRad = (visualAngles.get(i) ?? distanceIndex * angleStepRad) + escapementAngleOffsetRad;
        // Only render lines on the right semicircle (±90° from focal axis)
        if (Math.abs(rawAngleRad) >= Math.PI / 2)
            continue;
        // Cartesian coordinates on screen relative to center on left edge
        const x = centerX + baseRadius * Math.cos(rawAngleRad);
        const y = centerY + baseRadius * Math.sin(rawAngleRad);
        const isActive = hasActive && i === activeIndex;
        const absDistance = Math.abs(distanceIndex);
        // Alpha decays smoothly as lines move further from the focal position (angle = 0)
        const alpha = Math.max(0.12, Math.pow(Math.cos(rawAngleRad * 0.75), 2.5) * (1 - absDistance * 0.18));
        // Focal line gets activeScale boost, neighboring lines scale down gracefully
        const scale = isActive
            ? tuning.activeScale
            : Math.max(0.7, 1 - absDistance * 0.08);
        items.push({
            line,
            index: i,
            angleRad: rawAngleRad,
            angleDeg: (rawAngleRad * 180) / Math.PI,
            x,
            y,
            isActive,
            distanceFromActive: absDistance,
            alpha,
            scale,
        });
    }
    return items;
}
/**
 * Measures line width using @chenglou/pretext for precise typography alignment.
 */
function measurePendoloLineWidth(text, fontSpec) {
    if (!text)
        return 0;
    try {
        const prepared = prepareWithSegments(text, fontSpec);
        const layout = layoutWithLines(prepared, 2000, 32);
        return layout.lines[0]?.width ?? 0;
    }
    catch {
        return text.length * 16;
    }
}

// ======== components/visualizer/pendolo/pendoloMotionProfile ========
const PENDOLO_MOTION_PROFILES = {
    calm: {
        balanceSpeedMultiplier: 0.72,
        balanceAmplitudeMultiplier: 0.58,
        bassResponseMultiplier: 0.62,
        escapementSpringMultiplier: 0.72,
        escapementDampingMultiplier: 1.2,
        chorusHaloOpacity: 0.22,
        chorusHaloScale: 1.012,
        chorusGlowMultiplier: 0.72,
        chorusTransitionDuration: 0.52,
    },
    normal: {
        balanceSpeedMultiplier: 1,
        balanceAmplitudeMultiplier: 1,
        bassResponseMultiplier: 1,
        escapementSpringMultiplier: 1,
        escapementDampingMultiplier: 1,
        chorusHaloOpacity: 0.34,
        chorusHaloScale: 1.026,
        chorusGlowMultiplier: 1,
        chorusTransitionDuration: 0.42,
    },
    chaotic: {
        balanceSpeedMultiplier: 1.3,
        balanceAmplitudeMultiplier: 1.42,
        bassResponseMultiplier: 1.38,
        escapementSpringMultiplier: 1.3,
        escapementDampingMultiplier: 0.84,
        chorusHaloOpacity: 0.5,
        chorusHaloScale: 1.045,
        chorusGlowMultiplier: 1.42,
        chorusTransitionDuration: 0.3,
    },
};
/** Resolves the stable visual parameters for Pendolo's theme-level animation intensity. */
const resolvePendoloMotionProfile = (intensity) => (intensity === 'calm' || intensity === 'chaotic'
    ? PENDOLO_MOTION_PROFILES[intensity]
    : PENDOLO_MOTION_PROFILES.normal);
/** Keeps chorus emphasis limited to the lyric line currently being sung. */
const resolvePendoloChorusPresentation = (isChorus, isPlaybackActive, profile) => {
    const isActive = Boolean(isChorus && isPlaybackActive);
    return {
        isActive,
        accentMix: isActive ? 0.58 : 0.32,
        haloOpacity: isActive ? profile.chorusHaloOpacity : 0,
        haloScale: isActive ? profile.chorusHaloScale : 1,
        glowMultiplier: isActive ? profile.chorusGlowMultiplier : 0,
        transitionDuration: profile.chorusTransitionDuration,
    };
};

// ======== components/visualizer/pendolo/pendoloSubtitleTracks ========


// src/components/visualizer/pendolo/pendoloSubtitleTracks.ts
// Single source of truth for the subtitle rows under a Pendolo lyric: which rows exist, their size, weight
// fallback and spacing. Both the pre-measured block height (lineBlockHeights) and the rendered rows read
// from here, so the reserved space and the drawn rows cannot disagree and overlap the next line.
/** Subtitle row font size at the focal / non-focal state, before the user's subtitle scale. */
const FOCAL_SUBTITLE_PX = 16;
const IDLE_SUBTITLE_PX = 12;
/** Gap between the lyric and the first subtitle row, in em of that row's own font size. */
const LEAD_TRACK_GAP_EM = 0.25;
/** Fallback weight for the first row when the theme sets none (the second row uses SECONDARY_TRACK_FONT_WEIGHT_FALLBACK). */
const LEAD_TRACK_FONT_WEIGHT_FALLBACK = 500;
// The rows set no line-height of their own and inherit the page's 1.5, so measure with the same ratio, unrounded,
// to reserve exactly what the DOM draws (1.2 under-reserved a few px per wrapped row and let rows touch the next lyric).
const SUBTITLE_LINE_HEIGHT_RATIO = 1.5;
// Placeholder lines ("//", "●●●", dashes) carry no letter or digit and are never shown as subtitle text.
const READABLE_TEXT_PATTERN = /[\p{L}\p{N}]/u;
const isPendoloReadableSubtitle = (text) => READABLE_TEXT_PATTERN.test(text);
/**
 * Resolves the subtitle rows for one wheel line. The first row keeps the original single-row look;
 * the second row (only in 'both' with two distinct readable texts) is smaller, quieter and spaced below it.
 */
const resolvePendoloSubtitleTracks = (line, { mode, hidden, focal, subtitleFontScale }) => {
    if (hidden) {
        return [];
    }
    const basePx = (focal ? FOCAL_SUBTITLE_PX : IDLE_SUBTITLE_PX) * subtitleFontScale;
    return resolveLyricSubtitleTracks(line, mode, isPendoloReadableSubtitle).map((track, index) => {
        const isSecondary = index > 0;
        const fontPx = Math.round(isSecondary ? basePx * SECONDARY_TRACK_SIZE_FACTOR : basePx);
        return {
            role: track.role,
            text: track.text,
            fontPx,
            lineHeightPx: fontPx * SUBTITLE_LINE_HEIGHT_RATIO,
            fontWeightFallback: isSecondary ? SECONDARY_TRACK_FONT_WEIGHT_FALLBACK : LEAD_TRACK_FONT_WEIGHT_FALLBACK,
            gapEm: isSecondary ? SECONDARY_TRACK_GAP_EM : LEAD_TRACK_GAP_EM,
            opacityFactor: isSecondary ? SECONDARY_TRACK_OPACITY : 1,
        };
    });
};
/** pretext font spec for a row; `fontWeight` must be the resolved (theme or fallback) weight the DOM row uses. */
const buildPendoloSubtitleFontSpec = (track, fontWeight, fontFamily) => `${fontWeight} ${track.fontPx}px ${fontFamily}`;
/** Total height of the stacked rows: each row's wrapped text height plus its own top gap. `measureText` returns the text-only height. */
const sumPendoloSubtitleTrackHeights = (tracks, measureText) => {
    let total = 0;
    for (const track of tracks) {
        total += measureText(track) + track.gapEm * track.fontPx;
    }
    return total;
};

// ======== components/visualizer/pendolo/pendoloTextLayout ========
var {  layoutWithLines, prepareWithSegments  } = pretext;
/** Builds stable visual lines so timed fills and vertical spacing share one wrap result. */
const buildPendoloTextLayout = (text, fontSpec, maxWidth, lineHeight) => {
    const prepared = prepareWithSegments(text || ' ', fontSpec, {
        whiteSpace: 'pre-wrap',
    });
    const layout = layoutWithLines(prepared, Math.max(1, maxWidth), lineHeight);
    let graphemeCursor = 0;
    const lines = layout.lines.map(line => {
        const graphemeCount = splitLyricGraphemes(line.text).length;
        const result = {
            text: line.text,
            width: line.width,
            graphemeStart: graphemeCursor,
            graphemeEnd: graphemeCursor + graphemeCount,
        };
        graphemeCursor += graphemeCount;
        return result;
    });
    return {
        lines,
        lineHeight,
        height: Math.max(lines.length, 1) * lineHeight,
    };
};

// ======== components/visualizer/pendolo/pendoloTimeline ========
// src/components/visualizer/pendolo/pendoloTimeline.ts
/** Resolves the wheel anchor when playback is outside an actively timed lyric line. */
const resolvePendoloFallbackAnchorIndex = (lines, currentLineIndex, lastValidLineIndex, hasObservedLine, currentTime) => {
    if (currentLineIndex >= 0 && currentLineIndex < lines.length) {
        return currentLineIndex;
    }
    if (!hasObservedLine) {
        return -1;
    }
    const finalLine = lines.at(-1);
    const finalRenderEndTime = finalLine?.renderHints?.renderEndTime ?? finalLine?.endTime;
    if (finalRenderEndTime !== undefined && currentTime > finalRenderEndTime) {
        return lines.length;
    }
    return lastValidLineIndex + 0.5;
};
const PENDOLO_VISIBLE_ARC_DEG = 110;
const PENDOLO_EDGE_FADE_DEG = 28;
/** Fades a lyric in only when its unwrapped wheel angle reaches the visible right-hand arc. */
const resolvePendoloRotatingLineOpacity = (baseAngleDeg, wheelRotationDeg, baseOpacity) => {
    const visibleAngleDeg = Math.abs(baseAngleDeg + wheelRotationDeg);
    if (visibleAngleDeg >= PENDOLO_VISIBLE_ARC_DEG)
        return 0;
    const edgeProgress = Math.min(1, (PENDOLO_VISIBLE_ARC_DEG - visibleAngleDeg) / PENDOLO_EDGE_FADE_DEG);
    return baseOpacity * edgeProgress;
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

// ======== manual: manual/pendolo-engine-core.js ========
/* =========================================================================
   pendolo 渲染核心 —— Folia pendolo 组件树的无构建 DOM/canvas 忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)，逐文件对应（源码行号标注在每段）：
     src/components/visualizer/pendolo/VisualizerPendolo.tsx
       （宿主组件：视口/手动滚轮/无词机械演示/擒纵弹簧/行块高度/弧形轮布局）
     src/components/visualizer/pendolo/PendoloClockworkCanvas.tsx
       （canvas 钟表机械：drawGearTeeth/drawSpokedWheel/drawHairspring/
        resolveClockworkBox + render 循环全部常量原值）
     src/components/visualizer/pendolo/PendoloRotatingLine.tsx
       （行项根：绝对定位 + 弧外渐隐 opacity = resolvePendoloRotatingLineOpacity）
     src/components/visualizer/pendolo/PendoloActiveLyricSweep.tsx +
       pendoloColorRuns.ts（当前行逐字扫光：grapheme 时序 × canvas 量宽偏移
       → mask linear-gradient 填充沿 + 副歌 drop-shadow 辉光）
     src/components/visualizer/pendolo/PendoloSettingsPanel.tsx
       （只取 DEFAULT_PENDOLO_TUNING；本项目无调参面板）
     src/components/visualizer/VisualizerShell.tsx（:107-134 字体/字重壳）

   结构对应（React/framer → 无构建）：
     useSpring(targetLineIndex,{stiffness,damping,mass:0.8})
                       → pdSpring（半隐式欧拉 + mass，restSpeed/restDelta 0.01，
                          dt 夹 1/30、子步 1/120——mini-motion spring 同构）
     useTransform(MV)  → 引擎 tick 内显式派生（wheelRotationDeg/
                        textRotationCorrectionDeg/gearRotationAngleRad/sweep fill）
     motion.div rotate → inline transform（每帧直写）
     副歌光晕 motion.div animate → mini-motion（tween duration easeOut 同参）
     lucide Star 兜底  → 内联 SVG（lucide ISC；resolveLucideIcon(lyricsIcons[0])
                        宿主无主题图标表 → 恒 Star 兜底路径）
     ResizeObserver    → 同名 API（缺失退化 window.resize）

   纯逻辑闭包（tsc 原文转译，经 CM_* 别名注入）：
     pendoloGeometry/pendoloTimeline/pendoloMotionProfile/pendoloTextLayout/
     pendoloSubtitleTracks/pendoloColorRuns/colorMix/fontStacks/wordColoring/
     graphemeTiming/alternateText/subtitleTrackStyle/
     monetLyricsModel.measureMonetGraphemeOffsets（扫光量宽与 Monet 同源）
   MineRadio 宿主偏差（桥内注明）：无 calm/chaotic 强度档（normal 档原值）；
   无主题词色表（wordColors=[]，resolveTokenColorMap 全 null → colorRuns 回退
   fillColor）；subtitleTheme 缺省 = theme。
   ========================================================================= */

/* ---------- tuning（types.ts:515-527 DEFAULT_PENDOLO_TUNING 原值） ---------- */
var PENDOLO_DEFAULT_TUNING = {
    arcRadius: 0.42,
    arcAngleDeg: 100,
    wheelCenterX: 0.0,
    wheelCenterY: 0.50,
    tickSnappiness: 2.0,
    activeScale: 1.25,
    showGearDecor: 'subtle',
    showCenterGradient: true,
    showCoverOnWatchFace: false,
    enableLineGlow: false
};

/* pendoloTuning 缺省合并（VisualizerPendolo.tsx:57 pendoloTuning = DEFAULT_PENDOLO_TUNING；
   面板滑杆直接写数值，无 clamp 函数——照源保持） */
function pendoloResolveTuning(tuning) {
    var d = PENDOLO_DEFAULT_TUNING;
    if (!tuning) return {
        arcRadius: d.arcRadius, arcAngleDeg: d.arcAngleDeg, wheelCenterX: d.wheelCenterX,
        wheelCenterY: d.wheelCenterY, tickSnappiness: d.tickSnappiness, activeScale: d.activeScale,
        showGearDecor: d.showGearDecor, showCenterGradient: d.showCenterGradient,
        showCoverOnWatchFace: d.showCoverOnWatchFace, enableLineGlow: d.enableLineGlow
    };
    return {
        arcRadius: tuning.arcRadius != null ? tuning.arcRadius : d.arcRadius,
        arcAngleDeg: tuning.arcAngleDeg != null ? tuning.arcAngleDeg : d.arcAngleDeg,
        wheelCenterX: tuning.wheelCenterX != null ? tuning.wheelCenterX : d.wheelCenterX,
        wheelCenterY: tuning.wheelCenterY != null ? tuning.wheelCenterY : d.wheelCenterY,
        tickSnappiness: tuning.tickSnappiness != null ? tuning.tickSnappiness : d.tickSnappiness,
        activeScale: tuning.activeScale != null ? tuning.activeScale : d.activeScale,
        showGearDecor: tuning.showGearDecor != null ? tuning.showGearDecor : d.showGearDecor,
        showCenterGradient: tuning.showCenterGradient != null ? tuning.showCenterGradient : d.showCenterGradient,
        showCoverOnWatchFace: tuning.showCoverOnWatchFace != null ? tuning.showCoverOnWatchFace : d.showCoverOnWatchFace,
        enableLineGlow: tuning.enableLineGlow != null ? tuning.enableLineGlow : d.enableLineGlow
    };
}

/* ---------- useSpring 等价（VisualizerPendolo.tsx:325-329 的持续弹簧） ----------
   framer-motion spring：半隐式欧拉，加速度 = (k·(target−x) − c·v) / mass；
   restSpeed/restDelta 0.01，dt 夹 1/30、固定子步 1/120（mini-motion spring 同构，
   外加 mass 项——classic 行 spring mass=1 未暴露该参，pendolo mass=0.8 需要）。 */
function pdSpring(initialValue) {
    return {
        value: initialValue,
        velocity: 0,
        target: initialValue,
        stiffness: 180,
        damping: 26,
        mass: 0.8,
        life: 0,
        set: function (target) { this.target = target; },
        step: function (dt) {
            var steps = Math.max(1, Math.ceil(dt / (1 / 120)));
            var h = dt / steps;
            for (var s = 0; s < steps; s++) {
                var force = this.stiffness * (this.target - this.value) - this.damping * this.velocity;
                this.velocity += (force / this.mass) * h;
                this.value += this.velocity * h;
            }
            this.life += dt;
            var settled = (Math.abs(this.velocity) < 0.01 && Math.abs(this.target - this.value) < 0.01);
            if (settled && this.target === this.value) { this.value = this.target; this.velocity = 0; }
            return !settled && this.life < 8;
        }
    };
}

/* ---------- PendoloClockworkCanvas.tsx:33-182 绘制原语（全量同构） ---------- */

/* drawGearTeeth（:33-90）：N 齿梯形齿 wireframe 齿轮 */
function pdDrawGearTeeth(ctx, cx, cy, radius, teethCount, toothDepth, rotationRad, strokeColor, lineWidth, fillColor) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotationRad);

    var innerR = radius - toothDepth;
    var outerR = radius;
    var anglePerTooth = (Math.PI * 2) / teethCount;

    ctx.beginPath();
    for (var i = 0; i < teethCount; i++) {
        var baseAngle = i * anglePerTooth;
        var a0 = baseAngle - anglePerTooth * 0.22;
        var a1 = baseAngle - anglePerTooth * 0.12;
        var a2 = baseAngle + anglePerTooth * 0.12;
        var a3 = baseAngle + anglePerTooth * 0.22;

        var x0 = innerR * Math.cos(a0), y0 = innerR * Math.sin(a0);
        var x1 = outerR * Math.cos(a1), y1 = outerR * Math.sin(a1);
        var x2 = outerR * Math.cos(a2), y2 = outerR * Math.sin(a2);
        var x3 = innerR * Math.cos(a3), y3 = innerR * Math.sin(a3);

        if (i === 0) ctx.moveTo(x0, y0);
        else ctx.lineTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
    }
    ctx.closePath();

    if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill();
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    ctx.restore();
}

/* drawSpokedWheel（:95-143）：辐条轮 + 减重孔 */
function pdDrawSpokedWheel(ctx, cx, cy, hubR, rimR, spokeCount, rotationRad, strokeColor, lineWidth) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotationRad);

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.arc(0, 0, hubR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, rimR, 0, Math.PI * 2);
    ctx.stroke();

    var angleStep = (Math.PI * 2) / spokeCount;
    for (var i = 0; i < spokeCount; i++) {
        var a = i * angleStep;
        ctx.beginPath();
        ctx.moveTo(hubR * Math.cos(a), hubR * Math.sin(a));
        ctx.lineTo(rimR * Math.cos(a), rimR * Math.sin(a));
        ctx.stroke();
    }

    var midR = (hubR + rimR) * 0.5;
    var holeR = (rimR - hubR) * 0.22;
    for (var j = 0; j < spokeCount; j++) {
        var ah = j * angleStep + angleStep * 0.5;
        ctx.beginPath();
        ctx.arc(midR * Math.cos(ah), midR * Math.sin(ah), holeR, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
}

/* drawHairspring（:148-182）：游丝螺旋（0.9 次幂半径展开） */
function pdDrawHairspring(ctx, cx, cy, startR, endR, coils, oscillationRad, strokeColor, lineWidth) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(oscillationRad);

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;

    var totalAngle = coils * Math.PI * 2;
    var steps = coils * 60;

    ctx.beginPath();
    for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        var angle = t * totalAngle;
        var r = startR + (endR - startR) * Math.pow(t, 0.9);
        var x = r * Math.cos(angle);
        var y = r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.restore();
}

/* resolveClockworkReach / resolveClockworkBox（:185-212） */
function pdResolveClockworkReach(baseRadius, hasCenterGradient) {
    return baseRadius * (hasCenterGradient ? 1.65 : 1.4) + 16;
}
function pdResolveClockworkBox(centerX, centerY, baseRadius, lyricRingRadius, viewportWidth, viewportHeight, hasCenterGradient) {
    var reach = pdResolveClockworkReach(baseRadius, hasCenterGradient);
    var rightReach = Math.max(reach, lyricRingRadius + 16);
    var left = Math.max(0, Math.floor(centerX - reach));
    var top = Math.max(0, Math.floor(centerY - reach));
    var right = Math.min(viewportWidth, Math.ceil(centerX + rightReach));
    var bottom = Math.min(viewportHeight, Math.ceil(centerY + reach));
    return { left: left, top: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/* ---------- DOM 工具 ---------- */
function pdEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function pdEl(tag, className, styleText) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (styleText) el.style.cssText = styleText;
    return el;
}
/* lucide Star 兜底图标（resolveLucideIcon(theme.lyricsIcons?.[0]) ?? Star ——
   宿主无主题图标表，恒走 Star；lucide ISC 许可，路径为 lucide 官方 polygon） */
var PD_STAR_POLYGON = '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2';

/* ---------- PendoloSweepLine（PendoloActiveLyricSweep.tsx:42-121 同构） ----------
   一条折行视觉行的扫光层。返回 { el, update(t) }；update 即 useTransform 三联
   （fillWidth/maskImage/fillOpacity，:59-83）的每帧求值。 */
function pdMakeSweepLine(spec) {
    var layoutLine = spec.layoutLine;
    var timings = spec.timings;            /* buildLineGraphemeTimeline.slice(graphemeStart, graphemeEnd) */
    var offsets = CM_measureMonetGraphemeOffsets(layoutLine.text, spec.fontPx, spec.fontSpec);
    var lineEndTime = spec.lineEndTime;
    var primaryTextColor = spec.primaryTextColor;
    var colorRuns = spec.colorRuns;
    var glowFilter = spec.glowFilter;
    var glowPaddingPx = spec.glowPaddingPx;
    var lineHeight = spec.lineHeight;

    var outer = pdEl('span');
    outer.style.cssText = 'position:relative;display:block;white-space:pre;overflow:visible;' +
        'width:' + layoutLine.width + 'px;height:' + lineHeight + 'px;';

    /* 底字层（:87-89）：未唱 0.52 透明度主色 + colorRuns（词色分段） */
    var base = pdEl('span');
    base.style.cssText = 'color:' + CM_colorWithAlpha(primaryTextColor, 0.52) + ';';
    var baseHtml = '';
    for (var r = 0; r < colorRuns.length; r++) baseHtml += '<span>' + pdEsc(colorRuns[r].text) + '</span>';
    base.innerHTML = baseHtml;
    outer.appendChild(base);

    /* 辉光覆盖层（:90-118）：absolute inset-0 → inset -padding+filter → mask 填充 */
    var overlay = pdEl('span');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = 'pointer-events:none;position:absolute;inset:0;display:block;white-space:pre;overflow:visible;';
    var filterWrap = pdEl('span');
    filterWrap.style.cssText = 'position:absolute;display:block;white-space:pre;overflow:visible;' +
        'inset:' + (-glowPaddingPx) + 'px;' +
        (glowFilter ? 'filter:' + glowFilter + ';' : '');
    var maskSpan = pdEl('span');
    maskSpan.style.cssText = 'position:absolute;inset:0;display:block;white-space:pre;box-sizing:border-box;' +
        'padding:' + glowPaddingPx + 'px;opacity:0;' +
        '-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;';
    var fillHtml = '';
    for (var f = 0; f < colorRuns.length; f++) {
        fillHtml += '<span style="color:' + colorRuns[f].color + '">' + pdEsc(colorRuns[f].text) + '</span>';
    }
    maskSpan.innerHTML = fillHtml;
    filterWrap.appendChild(maskSpan);
    overlay.appendChild(filterWrap);
    outer.appendChild(overlay);

    /* fillWidth（:59-75）：grapheme 量宽偏移线性插值 */
    function fillWidthAt(latest) {
        var fullWidth = offsets[offsets.length - 1] != null ? offsets[offsets.length - 1] : layoutLine.width;
        if (timings.length === 0) return latest >= lineEndTime ? fullWidth : 0;
        if (latest <= timings[0].startTime) return 0;
        for (var index = 0; index < timings.length; index += 1) {
            var timing = timings[index];
            var startWidth = offsets[index] != null ? offsets[index] : 0;
            var endWidth = offsets[index + 1] != null ? offsets[index + 1] : startWidth;
            if (latest < timing.startTime) return startWidth;
            if (latest <= timing.endTime) {
                return startWidth + (endWidth - startWidth)
                    * ((latest - timing.startTime) / Math.max(0.001, timing.endTime - timing.startTime));
            }
        }
        return fullWidth;
    }

    function update(latest) {
        var width = fillWidthAt(latest);
        /* maskImage（:76-80）：edgeSoftness = clamp(fontPx*0.42, 8, 16) */
        var edgeSoftness = Math.min(Math.max(spec.fontPx * 0.42, 8), 16);
        var paddedFillWidth = glowPaddingPx + width;
        var mask = 'linear-gradient(90deg, #000 0px, #000 ' + Math.max(paddedFillWidth - edgeSoftness, 0) +
            'px, rgba(0, 0, 0, 0.84) ' + paddedFillWidth + 'px, transparent ' + (paddedFillWidth + edgeSoftness) + 'px)';
        maskSpan.style.webkitMaskImage = mask;
        maskSpan.style.maskImage = mask;
        /* fillOpacity（:81-83） */
        var op = latest < ((timings.length ? timings[0].startTime : lineEndTime)) ? 0 : 1;
        if (maskSpan.style.opacity !== String(op)) maskSpan.style.opacity = String(op);
    }

    return { el: outer, update: update };
}

/* ---------- PendoloActiveLyricSweep（:124-212 同构） ----------
   当前行逐字扫光容器：折行布局 + colorRuns + 副歌辉光参数。
   返回 { el, lines: [{el, update}], lineEndTime } */
function pdMakeActiveSweep(line, fontFamily, fontWeight, maxWidth, primaryTextColor, accentTextColor, fontPx, wordColors, isChorus, accentMix, chorusGlowMultiplier) {
    var text = line.fullText;
    var fontSpec = fontWeight + ' ' + fontPx + 'px ' + fontFamily;
    var graphemeTimings = CM_buildLineGraphemeTimeline(line);
    var matchers = CM_prepareWordColorMatchers(wordColors != null ? wordColors : [], true);
    var wordColorRanges = CM_buildWordColorRangesFromMatchers(text, matchers);
    /* charTokens（:146-158）：逐 grapheme token（timed） */
    var charTokens = [];
    var cursor = 0;
    var graphemes = CM_splitLyricGraphemes(text);
    for (var gi = 0; gi < graphemes.length; gi++) {
        var startOffset = cursor;
        cursor += graphemes[gi].length;
        charTokens.push({ key: String(gi), timed: true, startOffset: startOffset, endOffset: cursor });
    }
    var tokenColors = CM_resolveTokenColorMap(charTokens, wordColorRanges);

    var lineHeight = Math.round(fontPx * 1.2);
    var textLayout = CM_buildPendoloTextLayout(text, fontSpec, maxWidth, lineHeight);
    var fillColor = CM_mixColors(primaryTextColor, accentTextColor, accentMix);
    /* glowFilter / glowPaddingPx（:179-185） */
    var glowFilter = isChorus
        ? 'drop-shadow(0 0 ' + Math.round(fontPx * 0.3 * chorusGlowMultiplier) + 'px ' + CM_colorWithAlpha(fillColor, 0.72) +
          ') drop-shadow(0 0 ' + Math.round(fontPx * 0.62 * chorusGlowMultiplier) + 'px ' + CM_colorWithAlpha(accentTextColor, 0.28) + ')'
        : undefined;
    var glowPaddingPx = isChorus ? Math.ceil(fontPx * 0.7 * chorusGlowMultiplier + 10) : 0;

    var container = pdEl('span');
    container.style.cssText = 'display:block;font-size:' + fontPx + 'px;line-height:' + lineHeight + 'px;width:' + maxWidth + 'px;';

    var lines = [];
    for (var li = 0; li < textLayout.lines.length; li++) {
        var layoutLine = textLayout.lines[li];
        var runs = CM_buildPendoloColorRuns(layoutLine.text, layoutLine.graphemeStart, tokenColors, fillColor);
        var sweep = pdMakeSweepLine({
            layoutLine: layoutLine,
            timings: graphemeTimings.slice(layoutLine.graphemeStart, layoutLine.graphemeEnd),
            fontPx: fontPx,
            fontSpec: fontSpec,
            lineHeight: textLayout.lineHeight,
            lineEndTime: line.endTime,
            primaryTextColor: primaryTextColor,
            colorRuns: runs,
            glowFilter: glowFilter,
            glowPaddingPx: glowPaddingPx
        });
        container.appendChild(sweep.el);
        lines.push(sweep);
    }
    return { el: container, lines: lines, lineEndTime: line.endTime };
}

/* ---------- 引擎实例 ---------- */

/**
 * PendoloPendoloEngine(opts) —— pendolo 模式渲染引擎（VisualizerPendolo.tsx 组件树宿主等价）
 * opts: { host, lines, currentTime(MV), theme, audioBands?(MV|fn|number),
 *         tuning?, lyricsFontScale?, seed?, coverUrl?, paused?,
 *         getCurrentLineIndex?(t)→int, onLyricLineSeek?(lineIndex, startTime) }
 * 返回 { destroy, setLines, setTheme, setFontScale, setTuning, setPaused, setSeed, setCoverUrl }
 */
function PendoloPendoloEngine(opts) {
    var host = opts.host;
    var lines = opts.lines || [];
    var theme = opts.theme;
    var tuning = pendoloResolveTuning(opts.tuning);
    var lyricsFontScale = opts.lyricsFontScale != null ? opts.lyricsFontScale : 1;
    var subtitleFontScale = 1;                       /* 宿主无独立字幕缩放（Folia subtitleFontScale ?? 1） */
    var hideTranslationSubtitle = !!opts.hideTranslationSubtitle;
    var showSubtitleTranslation = opts.showSubtitleTranslation !== false;
    var seed = opts.seed != null ? String(opts.seed) : '';
    var paused = !!opts.paused;
    var onLyricLineSeek = typeof opts.onLyricLineSeek === 'function' ? opts.onLyricLineSeek : null;
    var getCurrentLineIndex = typeof opts.getCurrentLineIndex === 'function' ? opts.getCurrentLineIndex : null;
    var canSeek = !!onLyricLineSeek;

    var currentTime = opts.currentTime;
    var audioBandsInput = opts.audioBands;
    var destroyed = false;
    var rafId = 0;
    var lastFrameTs = null;

    /* VisualizerShell 等价（VisualizerShell.tsx:107-118：字体/字重 inline、透明底） */
    var shell = pdEl('div', 'pd-shell');
    shell.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'overflow:hidden;font-family:' + CM_resolveThemeFontStack(theme) + ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) +
        ';user-select:none;pointer-events:none;';

    /* 主容器（:435 relative w-full h-full overflow-hidden select-none pointer-events-none） */
    var main = pdEl('div', 'pd-main');
    main.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';
    shell.appendChild(main);
    host.appendChild(shell);

    /* ---------- 视口（:68-95 useState + ResizeObserver） ---------- */
    var viewportSize = {
        width: (host.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1920)),
        height: (host.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 1080))
    };
    var resizeObserver = null;
    var onHostResize = function () {
        var w = Math.round(host.clientWidth);
        var h = Math.round(host.clientHeight);
        if (w === 0 || h === 0) return;
        if (viewportSize.width === w && viewportSize.height === h) return;
        viewportSize.width = w;
        viewportSize.height = h;
        layoutStamp = null;    /* viewportSize 变化 → 布局 memo 重算（:416 依赖 viewportSize） */
    };
    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(onHostResize);
        resizeObserver.observe(host);
    } else {
        window.addEventListener('resize', onHostResize);
    }

    /* ---------- 布局派生几何（:340-350，确定性公式） ---------- */
    var centerX = 0, centerY = 0, baseRadius = 0, lyricRingRadius = 0;
    var availableTextWidth = 140;
    var angleStepRad = 0;

    function recomputeGeometry() {
        centerX = viewportSize.width * tuning.wheelCenterX;
        centerY = viewportSize.height * tuning.wheelCenterY;
        baseRadius = Math.min(viewportSize.width, viewportSize.height) * tuning.arcRadius;
        var lyricRadiusOffset = Math.min(viewportSize.width, viewportSize.height) * 0.06;
        lyricRingRadius = baseRadius + lyricRadiusOffset;
        var maxItemX = centerX + baseRadius;
        availableTextWidth = Math.max(140, Math.min(viewportSize.width * 0.46, viewportSize.width - maxItemX - 48));
        var totalArcRad = (tuning.arcAngleDeg * Math.PI) / 180;
        var visibleWindowCount = 9;                     /* :354 */
        angleStepRad = totalArcRad / Math.max(1, visibleWindowCount - 1);
    }
    recomputeGeometry();

    /* ---------- motion profile（:321-324，宿主恒 normal 档） ---------- */
    var motionProfile = CM_resolvePendoloMotionProfile(theme.animationIntensity);

    /* ---------- 擒纵弹簧（:325-334 useSpring + set） ---------- */
    var tickSpring = pdSpring(0);
    function applySpringTuning() {
        var snappiness = tuning.tickSnappiness;
        tickSpring.stiffness = 180 * snappiness * motionProfile.escapementSpringMultiplier;
        tickSpring.damping = (18 + 4 / Math.max(0.5, snappiness)) * motionProfile.escapementDampingMultiplier;
        tickSpring.mass = 0.8;
    }
    applySpringTuning();

    /* ---------- 手动滚轮（:20-23 常量 + :104-317 全套状态机） ---------- */
    var PENDOLO_SCROLL_IDLE_RESET_MS = 2500;
    var PENDOLO_SCROLL_STEP_PX = 90;
    var PENDOLO_TOUCH_STEP_PX = 60;
    var manualScrollAnchorIndex = null;
    var manualScrollResetRef = null;
    var wheelAccumulator = 0, wheelDirection = 0;
    var touchLastY = null, touchAccumulator = 0, touchDirection = 0;
    var pendingSeekIndex = null;

    function getScrollDirection(delta) {
        if (Math.abs(delta) < 1) return 0;
        return delta > 0 ? 1 : -1;
    }
    function clampScrollSteps(steps) {
        if (Math.abs(steps) > 5) return steps > 0 ? 5 : -5;
        return steps;
    }
    function scheduleManualScrollReset() {
        if (manualScrollResetRef !== null) window.clearTimeout(manualScrollResetRef);
        manualScrollResetRef = window.setTimeout(function () {
            manualScrollAnchorIndex = null;
            wheelAccumulator = 0; wheelDirection = 0;
            touchAccumulator = 0; touchDirection = 0;
            manualScrollResetRef = null;
        }, PENDOLO_SCROLL_IDLE_RESET_MS);
    }
    function clearManualScrollReset() {
        if (manualScrollResetRef !== null) { window.clearTimeout(manualScrollResetRef); manualScrollResetRef = null; }
    }
    /* getFallbackAnchorIndex（:114-123） */
    function getFallbackAnchorIndex(t) {
        if (manualScrollAnchorIndex !== null) return manualScrollAnchorIndex;
        return CM_resolvePendoloFallbackAnchorIndex(lines, stateCurrentLineIndex, lastValidLineIndex, hasObservedLine, t);
    }
    /* moveManualScrollAnchor（:210-217） */
    function moveManualScrollAnchor(steps, t) {
        if (lines.length === 0) return;
        var baseIndex = manualScrollAnchorIndex !== null ? manualScrollAnchorIndex : getFallbackAnchorIndex(t);
        manualScrollAnchorIndex = Math.max(0, Math.min(lines.length - 1, Math.round(baseIndex + steps)));
        scheduleManualScrollReset();
    }
    /* handleLineSeek（:219-238） */
    function handleLineSeek(lineIndex, startTime, t) {
        if (!onLyricLineSeek) return;
        clearManualScrollReset();
        if (lineIndex === stateCurrentLineIndex) {
            pendingSeekIndex = null;
            manualScrollAnchorIndex = null;
            onLyricLineSeek(lineIndex, startTime);
            return;
        }
        pendingSeekIndex = lineIndex;
        manualScrollAnchorIndex = lineIndex;
        wheelAccumulator = 0; wheelDirection = 0;
        touchAccumulator = 0; touchDirection = 0;
        onLyricLineSeek(lineIndex, startTime);
    }
    /* handleRailWheel（:240-257） */
    function handleRailWheel(event) {
        if (lines.length === 0) return;
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        var direction = getScrollDirection(event.deltaY);
        if (direction !== 0 && wheelDirection !== 0 && direction !== wheelDirection) wheelAccumulator = 0;
        wheelDirection = direction || wheelDirection;
        wheelAccumulator += event.deltaY;
        var steps = clampScrollSteps(Math.trunc(wheelAccumulator / PENDOLO_SCROLL_STEP_PX));
        if (steps !== 0) {
            wheelAccumulator = 0;
            moveManualScrollAnchor(steps, lastTime != null ? lastTime : 0);
        } else {
            scheduleManualScrollReset();
        }
    }
    /* handleRailTouchStart/Move/End（:259-296） */
    function handleRailTouchStart(event) {
        if (lines.length === 0) return;
        event.stopPropagation();
        touchLastY = event.touches && event.touches[0] ? event.touches[0].clientY : null;
        touchAccumulator = 0; touchDirection = 0;
        manualScrollAnchorIndex = getFallbackAnchorIndex(lastTime != null ? lastTime : 0);
        scheduleManualScrollReset();
    }
    function handleRailTouchMove(event) {
        if (lines.length === 0 || touchLastY === null) return;
        event.stopPropagation();
        var nextY = event.touches && event.touches[0] ? event.touches[0].clientY : undefined;
        if (typeof nextY !== 'number') return;
        var deltaY = touchLastY - nextY;
        touchLastY = nextY;
        var direction = getScrollDirection(deltaY);
        if (direction !== 0 && touchDirection !== 0 && direction !== touchDirection) touchAccumulator = 0;
        touchDirection = direction || touchDirection;
        touchAccumulator += deltaY;
        var steps = clampScrollSteps(Math.trunc(touchAccumulator / PENDOLO_TOUCH_STEP_PX));
        if (steps !== 0) {
            touchAccumulator = 0;
            moveManualScrollAnchor(steps, lastTime != null ? lastTime : 0);
        } else {
            scheduleManualScrollReset();
        }
    }
    function handleRailTouchEnd() {
        touchLastY = null;
        touchDirection = 0;
        touchAccumulator = 0;
        scheduleManualScrollReset();
    }

    /* ---------- 无词机械演示（:125-175 isInstrumental + instrumentalIndex） ---------- */
    var READY_GRACE_MS = 3000;
    var INSTRUMENTAL_COMMIT_SECONDS = 2;
    var INSTRUMENTAL_SECONDS_PER_FRAME = 5;
    var lyricsSig = lines.length === 0 ? '' : (lines.length + '|' + (lines[0] && lines[0].fullText != null ? lines[0].fullText : ''));
    var seedRef = seed;
    var isInstrumental = false;
    var instrumentalIndex = 0;
    var instrWatch = null;   /* { startWall, sawReset }（:141-153 watch 闭包状态） */

    function updateInstrumental(t, nowWall) {
        if (lyricsSig !== '') {
            isInstrumental = false;
            seedRef = seed;
            instrWatch = null;
            return;
        }
        if (seed !== seedRef) {
            isInstrumental = false;
            seedRef = seed;
            instrWatch = null;
        }
        if (!isInstrumental) {
            if (!instrWatch) instrWatch = { startWall: nowWall, sawReset: false };
            if (!instrWatch.sawReset && t < 1) instrWatch.sawReset = true;
            if ((instrWatch.sawReset && t >= INSTRUMENTAL_COMMIT_SECONDS) || (nowWall - instrWatch.startWall >= READY_GRACE_MS)) {
                isInstrumental = true;
                instrWatch = null;
            }
        }
        if (isInstrumental) {
            var idx = Math.floor(t / INSTRUMENTAL_SECONDS_PER_FRAME);
            instrumentalIndex = idx;    /* setInstrumentalIndex（:160-175） */
        }
    }

    /* ---------- 运行时行状态（:97-102 lastValidLineIndex / hasObservedLine） ---------- */
    var lastValidLineIndex = 0;
    var hasObservedLine = false;
    var stateCurrentLineIndex = -1;
    var lastTime = null;

    /* targetLineIndex（:177-182） */
    function resolveTargetLineIndex(t) {
        if (lines.length === 0) return isInstrumental ? instrumentalIndex : 0;
        return getFallbackAnchorIndex(t);
    }

    /* ---------- 行块高度（:371-402 lineBlockHeights memo 同构） ---------- */
    var lineBlockHeights = [];
    function resolvedSubtitleMode() {
        /* resolveSubtitleContentMode(subtitleContentMode, showSubtitleTranslation)（:368） */
        return CM_resolveSubtitleContentMode(undefined, showSubtitleTranslation && !hideTranslationSubtitle);
    }
    function recomputeLineBlockHeights(targetLineIndex) {
        var fontFamily = CM_resolveThemeFontStack(theme);
        var fontWeight = CM_resolveThemeFontWeight(theme, 400);
        var subtitleTheme = theme;                        /* subtitleTheme ?? theme */
        var subtitleFontFamily = CM_resolveThemeTranslationFontStack(subtitleTheme);
        var resolvedMode = resolvedSubtitleMode();
        var measureWidth = availableTextWidth / tuning.activeScale;
        var out = [];
        for (var index = 0; index < lines.length; index++) {
            if (Math.abs(index - targetLineIndex) > 10) { out.push(0); continue; }
            var line = lines[index];
            var fontPx = Math.round(28 * lyricsFontScale);
            var mainHeight = CM_buildPendoloTextLayout(
                line.fullText,
                fontWeight + ' ' + fontPx + 'px ' + fontFamily,
                measureWidth,
                Math.round(fontPx * 1.2)
            ).height;
            var subtitleTracks = CM_resolvePendoloSubtitleTracks(line, {
                mode: resolvedMode,
                hidden: hideTranslationSubtitle,
                focal: true,
                subtitleFontScale: subtitleFontScale
            });
            var translationHeight = CM_sumPendoloSubtitleTrackHeights(subtitleTracks, function (track) {
                return CM_buildPendoloTextLayout(
                    track.text,
                    CM_buildPendoloSubtitleFontSpec(track, CM_resolveThemeFontWeight(subtitleTheme, track.fontWeightFallback), subtitleFontFamily),
                    measureWidth,
                    track.lineHeightPx
                ).height;
            });
            out.push((mainHeight + translationHeight) * tuning.activeScale);
        }
        lineBlockHeights = out;
    }

    /* ---------- 齿轮 canvas（PendoloClockworkCanvas.tsx 全量落地） ---------- */
    var canvas = pdEl('canvas');
    canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:1;';
    var canvasCtx = null;
    var phase = 0;                       /* phaseRef（:239） */
    var smoothedBass = 0.15;             /* smoothedBassRef（:240） */
    var secondGearElapsed = 0, secondGearStep = 0, secondGearAngle = 0, secondGearVelocity = 0;
    var coverImage = null;               /* coverImageRef（:247） */
    var coverUrl = opts.coverUrl != null ? opts.coverUrl : null;
    var coverLoadToken = 0;
    var showCover = tuning.showCoverOnWatchFace === true;

    /* cover 加载 effect（:249-268） */
    function loadCoverImage() {
        var token = ++coverLoadToken;
        if (!showCover || !coverUrl) { coverImage = null; return; }
        var img = new Image();
        img.onload = function () { if (token === coverLoadToken) coverImage = img; };
        img.onerror = function () { if (token === coverLoadToken) coverImage = null; };
        img.src = coverUrl;
    }

    main.appendChild(canvas);

    /* BalanceIcon 覆盖图标（:457-474：showGearDecor !== 'none' 时挂载） */
    var balanceIconWrap = pdEl('div');
    balanceIconWrap.style.cssText = 'position:absolute;pointer-events:none;z-index:1;transform:translate(-50%, -50%);display:none;';
    balanceIconWrap.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" ' +
        'style="display:block"><polygon points="' + PD_STAR_POLYGON + '" stroke-linejoin="round"/></svg>';
    main.appendChild(balanceIconWrap);

    function updateBalanceIcon() {
        if (tuning.showGearDecor === 'none') { balanceIconWrap.style.display = 'none'; return; }
        var size = Math.max(14, baseRadius * 0.13);
        var balanceGearX = centerX + baseRadius * 0.2;
        var balanceGearY = centerY - baseRadius * 0.75;
        balanceIconWrap.style.display = 'block';
        balanceIconWrap.style.left = balanceGearX + 'px';
        balanceIconWrap.style.top = balanceGearY + 'px';
        var svg = balanceIconWrap.firstChild;
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.style.color = CM_colorWithAlpha(theme.accentColor || '#3B82F6', 0.62);
    }

    /* ---------- 弧形轮 rail（:478-487 motion.div rotate 等价；pointer-events-auto） ---------- */
    var rail = pdEl('div', 'pd-rail');
    rail.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:auto;will-change:transform;';
    main.appendChild(rail);
    rail.addEventListener('wheel', handleRailWheel, { passive: false });
    rail.addEventListener('touchstart', handleRailTouchStart, { passive: false });
    rail.addEventListener('touchmove', handleRailTouchMove, { passive: false });
    rail.addEventListener('touchend', handleRailTouchEnd, { passive: false });
    rail.addEventListener('touchcancel', handleRailTouchEnd, { passive: false });

    /* ---------- showText 门控（:477） ---------- */
    var showText = opts.showText !== false;

    /* ---------- 行项 DOM（PendoloRotatingLine + 内层嵌套，:488-630 展开） ---------- */
    var lineItems = [];          /* calculatePendoloWheelLayout 输出（保留供 marker 刷新等读取） */
    var itemRecords = new Map(); /* index → record（React key='pendolo-line-'+index 的持久等价） */
    var layoutStamp = null;

    /* 主题内容键：行内容 DOM（sweep 填充色 fillColor/底字色/副字幕色）与
       词色分段（theme.wordColors → colorRuns）都直接消费主题颜色字段；
       React 每次 theme 变化整树重渲染（VisualizerPendolo 以 theme 为 props），
       无构建等价 = 布局 stamp 失效后内容 stamp 也必须随主题颜色/词色变化，
       否则 setTheme 热更后已挂行项停留在旧主题色/旧词色（wordColors 数据面
       断链）。 */
    function pdThemeContentKey(th) {
        var wc = Array.isArray(th.wordColors) ? th.wordColors : [];
        var wcKey = '';
        for (var i = 0; i < wc.length; i++) {
            wcKey += (wc[i] && wc[i].word ? String(wc[i].word) : '') + '>' + (wc[i] && wc[i].color ? String(wc[i].color) : '') + ';';
        }
        return (th.primaryColor || '') + '|' + (th.accentColor || '') + '|' +
            (th.secondaryColor || '') + '|' + wcKey;
    }

    function itemContentStamp(item, chorusPresentation) {
        return [item.index,
            item.line.startTime, item.line.endTime, item.line.fullText,
            item.isActive ? 1 : 0,
            Math.round((item.isActive ? 28 : 22) * lyricsFontScale * 100) / 100,
            CM_resolveThemeFontStack(theme), CM_resolveThemeFontWeight(theme, 400),
            item.scale, (availableTextWidth / item.scale).toFixed(2),
            item.isActive ? (chorusPresentation.isActive ? 'c1' : 'c0') : '-',
            resolvedSubtitleMode(), hideTranslationSubtitle ? 1 : 0, subtitleFontScale,
            pdThemeContentKey(theme)
        ].join('|');
    }

    /* 副歌光晕（:533-552）：haloWrap 持续在位（animate scale），haloEl 条件挂载 */
    var PD_HALO_ENTER = function (chorusPresentation) {
        return {
            opacity: chorusPresentation.haloOpacity, scale: 1,
            transition: { duration: chorusPresentation.transitionDuration, ease: 'easeOut' }
        };
    };
    /* 光晕表面（:548-549）：径向光台 + 模糊，单属性赋值（不碰 cssText，避免清掉 mini-motion 动画中的 opacity）；
       表面键含 accent 色——主题 accentColor 热更后表面随 React 重渲染语义重写 */
    function applyHaloSurface(halo, chorusPresentation) {
        var accentTextColor = theme.accentColor || '#3B82F6';   /* :419 */
        halo.style.background = 'radial-gradient(circle at 42% 50%, ' +
            CM_colorWithAlpha(accentTextColor, 0.14 * chorusPresentation.haloOpacity) + ' 0%, ' +
            CM_colorWithAlpha(accentTextColor, 0.035 * chorusPresentation.haloOpacity) + ' 55%, transparent 82%)';
        halo.style.filter = 'blur(' + Math.round(10 * motionProfile.chorusGlowMultiplier) + 'px)';
        return accentTextColor + '|' + chorusPresentation.haloOpacity + '|' + motionProfile.chorusGlowMultiplier;
    }
    function applyHaloState(rec, chorusPresentation) {
        var wantActive = chorusPresentation.isActive;
        if (wantActive && !rec.haloEl) {
            var halo = pdEl('div');
            halo.setAttribute('aria-hidden', 'true');
            halo.style.cssText = 'position:absolute;pointer-events:none;z-index:-10;border-radius:16px;' +
                'inset:-0.7em -1.1em;';
            rec.haloSurfaceKey = applyHaloSurface(halo, chorusPresentation);
            rec.haloWrap.insertBefore(halo, rec.haloWrap.firstChild);
            rec.haloEl = halo;
            /* initial {opacity:0, scale:0.96} → animate（:543-551） */
            halo.style.opacity = '0';
            var st = mmGetState(halo);
            st.tf.scale = 0.96;
            mmApplyTransform(halo, st);
            mmApplyVariant(halo, { enter: PD_HALO_ENTER(chorusPresentation) }, 'enter', null);
        } else if (wantActive && rec.haloEl) {
            /* 持续期目标变化（profile 切换）：重应用（framer animate 语义） */
            mmApplyVariant(rec.haloEl, { enter: PD_HALO_ENTER(chorusPresentation) }, 'enter', null);
            /* style patch（React 重渲染语义）：表面键（accent 色 + profile）变了才重写表面，动画属性不受影响 */
            var surfaceKey = (theme.accentColor || '#3B82F6') + '|' + chorusPresentation.haloOpacity + '|' + motionProfile.chorusGlowMultiplier;
            if (surfaceKey !== rec.haloSurfaceKey) {
                rec.haloSurfaceKey = applyHaloSurface(rec.haloEl, chorusPresentation);
            }
        } else if (!wantActive && rec.haloEl) {
            if (rec.haloEl.parentNode) rec.haloEl.parentNode.removeChild(rec.haloEl);
            rec.haloEl = null;
            rec.haloSurfaceKey = undefined;
        }
        /* haloWrap animate scale（:535-536：无论 active 与否都写 haloScale 目标） */
        if (rec.haloScaleApplied !== chorusPresentation.haloScale || rec.haloDurApplied !== chorusPresentation.transitionDuration) {
            rec.haloScaleApplied = chorusPresentation.haloScale;
            rec.haloDurApplied = chorusPresentation.transitionDuration;
            mmApplyVariant(rec.haloWrap, {
                chorus: {
                    scale: chorusPresentation.haloScale,
                    transition: { duration: chorusPresentation.transitionDuration, ease: 'easeOut' }
                }
            }, 'chorus', null);
        }
    }

    /* 行项内容构建（:553-624 的 DOM 展开；含 focal sweep / 非焦点纯文本 / 副字幕轨） */
    function buildItemContent(rec, item, chorusPresentation) {
        var isFocal = item.isActive;
        var maxTextWidth = availableTextWidth / item.scale;
        var fontPx = Math.round((isFocal ? 28 : 22) * lyricsFontScale);
        var primaryTextColor = theme.primaryColor || '#FFFFFF';
        var accentTextColor = theme.accentColor || '#3B82F6';
        var secondaryTextColor = theme.secondaryColor || '#9CA3AF';
        var subtitleTheme = theme;
        var subtitleFontFamily = CM_resolveThemeTranslationFontStack(subtitleTheme);
        var resolvedMode = resolvedSubtitleMode();

        var shift = pdEl('div');
        shift.style.cssText = 'transform:translateY(-50%);';   /* :553 */

        /* 副歌圆点标记（:554-567：manualScrollAnchorIndex !== null && line.isChorus） */
        var marker = pdEl('span');
        marker.setAttribute('aria-hidden', 'true');
        marker.style.cssText = 'position:absolute;pointer-events:none;border-radius:9999px;display:none;' +
            'width:0.42em;height:0.42em;left:-0.95em;top:0.52em;background-color:' + accentTextColor +
            ';box-shadow:0 0 7px ' + CM_colorWithAlpha(accentTextColor, 0.58) + ';';
        shift.appendChild(marker);
        rec.marker = marker;

        /* 主歌词（:568-600） */
        var mainWrap = pdEl('div');
        if (isFocal) {
            var sweep = pdMakeActiveSweep(
                item.line, CM_resolveThemeFontStack(theme), CM_resolveThemeFontWeight(theme, 400),
                maxTextWidth, primaryTextColor, accentTextColor, fontPx,
                theme.wordColors, chorusPresentation.isActive, chorusPresentation.accentMix, chorusPresentation.glowMultiplier
            );
            rec.sweepLines = sweep.lines;
            mainWrap.appendChild(sweep.el);
        } else {
            rec.sweepLines = [];
            var plain = pdEl('div');
            /* transition-all duration-200（:586）+ 内联样式（:588-595） */
            plain.style.cssText = 'transition:all 0.2s cubic-bezier(0.4,0,0.2,1);white-space:pre-wrap;' +
                'font-size:' + fontPx + 'px;max-width:' + maxTextWidth + 'px;' +
                'color:' + CM_colorWithAlpha(primaryTextColor, 0.75) + ';letter-spacing:0.01em;' +
                'overflow-wrap:anywhere;word-break:break-word;';
            plain.textContent = item.line.fullText;
            mainWrap.appendChild(plain);
        }
        shift.appendChild(mainWrap);

        /* 副字幕轨（:602-623 romanization/translation 行） */
        var subtitleTracks = CM_resolvePendoloSubtitleTracks(item.line, {
            mode: resolvedMode,
            hidden: hideTranslationSubtitle,
            focal: isFocal,
            subtitleFontScale: subtitleFontScale
        });
        for (var ti = 0; ti < subtitleTracks.length; ti++) {
            var track = subtitleTracks[ti];
            var trackEl = pdEl('div');
            trackEl.setAttribute('data-pendolo-subtitle-track', track.role);
            trackEl.style.cssText = 'white-space:pre-wrap;transition:opacity 0.2s cubic-bezier(0.4,0,0.2,1);' +
                'font-family:' + subtitleFontFamily + ';' +
                'font-weight:' + CM_resolveThemeFontWeight(subtitleTheme, track.fontWeightFallback) + ';' +
                'font-size:' + track.fontPx + 'px;max-width:' + maxTextWidth + 'px;' +
                'color:' + (isFocal ? secondaryTextColor : CM_colorWithAlpha(secondaryTextColor, 0.6)) + ';' +
                (track.opacityFactor === 1 ? '' : 'opacity:' + track.opacityFactor + ';') +
                'letter-spacing:0.01em;overflow-wrap:anywhere;word-break:break-word;' +
                'margin-top:' + track.gapEm + 'em;';
            trackEl.textContent = track.text;
            shift.appendChild(trackEl);
        }

        return shift;
    }

    /* 全量构建一个行项（PendoloRotatingLine 根 + 内层；React 同 key 更新的等价） */
    function buildItemRecord(item, chorusPresentation) {
        var itemEl = pdEl('div');
        /* PendoloRotatingLine :38-48：absolute pointer-events-auto(+cursor) origin left center */
        itemEl.style.cssText = 'position:absolute;pointer-events:auto;' + (canSeek ? 'cursor:pointer;' : '') +
            'transform-origin:left center;' +
            'font-family:' + CM_resolveThemeFontStack(theme) + ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) + ';';
        itemEl.style.left = item.x + 'px';
        itemEl.style.top = item.y + 'px';

        var corrEl = pdEl('div');
        corrEl.style.cssText = 'display:inline-block;transform-origin:left center;';   /* :521-524 */

        var scaledEl = pdEl('div');
        scaledEl.style.cssText = 'position:relative;display:inline-block;transform-origin:left center;isolation:isolate;'; /* :525-532 */

        var haloWrap = pdEl('div');
        haloWrap.style.cssText = 'transform-origin:left center;';   /* :533-537 */

        scaledEl.appendChild(haloWrap);
        corrEl.appendChild(scaledEl);
        itemEl.appendChild(corrEl);
        rail.appendChild(itemEl);

        var rec = {
            el: itemEl, corrEl: corrEl, scaledEl: scaledEl, haloWrap: haloWrap,
            haloEl: null, haloScaleApplied: undefined, haloDurApplied: undefined, haloSurfaceKey: undefined,
            marker: null, sweepLines: [], shiftEl: null,
            item: item, stamp: null
        };
        rec.shiftEl = buildItemContent(rec, item, chorusPresentation);
        haloWrap.appendChild(rec.shiftEl);
        rec.stamp = itemContentStamp(item, chorusPresentation);

        itemEl.addEventListener('click', function (e) {
            e.stopPropagation();
            handleLineSeek(item.index, item.line.startTime, lastTime != null ? lastTime : 0);
        });
        return rec;
    }

    /* 布局重算（:405-416 lineItems memo）+ 行项 diff（keyed 更新等价） */
    function recomputeItems(targetLineIndex) {
        recomputeLineBlockHeights(targetLineIndex);
        lineItems = CM_calculatePendoloWheelLayout(
            lines, targetLineIndex, 0,
            viewportSize.width, viewportSize.height, tuning,
            Math.min(viewportSize.width, viewportSize.height) * 0.06,   /* lyricRadiusOffset（:413→:343） */
            lineBlockHeights
        );
        var seen = new Map();
        for (var i = 0; i < lineItems.length; i++) {
            var item = lineItems[i];
            seen.set(item.index, true);
            var chorusPresentation = CM_resolvePendoloChorusPresentation(
                item.line.isChorus,
                item.isActive && item.index === stateCurrentLineIndex,
                motionProfile
            );
            var rec = itemRecords.get(item.index);
            if (!rec) {
                rec = buildItemRecord(item, chorusPresentation);
                itemRecords.set(item.index, rec);
            } else {
                rec.item = item;
                rec.el.style.left = item.x + 'px';
                rec.el.style.top = item.y + 'px';
                var stamp = itemContentStamp(item, chorusPresentation);
                if (stamp !== rec.stamp) {
                    var fresh = buildItemContent(rec, item, chorusPresentation);
                    if (rec.shiftEl && rec.shiftEl.parentNode) rec.shiftEl.parentNode.removeChild(rec.shiftEl);
                    rec.shiftEl = fresh;
                    rec.haloWrap.appendChild(fresh);
                    rec.stamp = stamp;
                }
            }
            rec.scaledEl.style.transform = 'rotate(' + (item.angleDeg * 0.35) + 'deg) scale(' + item.scale + ') translateZ(0)';
            applyHaloState(rec, chorusPresentation);
            if (rec.marker) {
                var wantMarker = manualScrollAnchorIndex !== null && !!item.line.isChorus;
                rec.marker.style.display = wantMarker ? 'block' : 'none';
            }
        }
        /* 窗口外行卸载（React 列表 diff 移除等价） */
        var stale = [];
        itemRecords.forEach(function (rec2, index) {
            if (!seen.get(index)) stale.push(index);
        });
        for (var s = 0; s < stale.length; s++) {
            var old = itemRecords.get(stale[s]);
            if (old && old.el.parentNode) old.el.parentNode.removeChild(old.el);
            itemRecords.delete(stale[s]);
        }
        updateBalanceIcon();
        positionCanvas();
    }

    /* ---------- canvas 布局盒（:270-281 contentBox memo + :836-850 元素样式） ---------- */
    var contentBox = { left: 0, top: 0, width: 0, height: 0 };
    function positionCanvas() {
        contentBox = pdResolveClockworkBox(centerX, centerY, baseRadius, lyricRingRadius,
            viewportSize.width, viewportSize.height, tuning.showCenterGradient !== false);
        canvas.style.left = contentBox.left + 'px';
        canvas.style.top = contentBox.top + 'px';
        canvas.style.width = contentBox.width + 'px';
        canvas.style.height = contentBox.height + 'px';
        /* enableLineGlow（:846-848） */
        var accentTextColor = theme.accentColor || '#3B82F6';
        canvas.style.filter = tuning.enableLineGlow
            ? 'drop-shadow(0 0 4px ' + CM_colorWithAlpha(accentTextColor, 0.65) + ') drop-shadow(0 0 12px ' + CM_colorWithAlpha(accentTextColor, 0.3) + ')'
            : 'none';
    }

    /* ---------- canvas 渲染帧（:328-821 render 全量同构，常量原值） ---------- */
    function renderCanvas(gearAngleRad, dtSeconds) {
        if (tuning.showGearDecor === 'none' && tuning.showCenterGradient === false && showCover === false) return;
        if (!canvasCtx) canvasCtx = canvas.getContext('2d');
        if (!canvasCtx) return;
        var ctx = canvasCtx;

        /* bass（:338-344）：MotionValue 直读 + 0..255 归一 + 平滑 */
        var bassRaw = 0.18;
        if (audioBandsInput) {
            var v = typeof audioBandsInput.get === 'function' ? audioBandsInput.get() : audioBandsInput;
            if (typeof v === 'number') bassRaw = v;
            else if (v && typeof v.bass === 'number') bassRaw = v.bass;
        }
        var normBass = bassRaw > 1.0 ? bassRaw / 255 : bassRaw;
        var clampedBass = Math.max(0, Math.min(1, normBass));
        smoothedBass += (clampedBass - smoothedBass)
            * Math.min(0.24, 0.12 * motionProfile.bassResponseMultiplier);
        var bass = smoothedBass;

        /* 1. 摆轮相位 & 秒轮棘轮弹簧（:346-362） */
        if (!paused) {
            phase += dtSeconds
                * (2.8 + bass * 3.5 * motionProfile.bassResponseMultiplier)
                * motionProfile.balanceSpeedMultiplier;
            secondGearElapsed += dtSeconds;
            var completedSteps = Math.floor(secondGearElapsed);
            if (completedSteps > 0) {
                secondGearStep += completedSteps;
                secondGearElapsed -= completedSteps;
            }
            var secondGearTarget = secondGearStep * (Math.PI * 2 / 15);
            var displacement = secondGearTarget - secondGearAngle;
            secondGearVelocity += displacement * 92 * motionProfile.escapementSpringMultiplier * dtSeconds;
            secondGearVelocity *= Math.exp(-13 * motionProfile.escapementDampingMultiplier * dtSeconds);
            secondGearAngle += secondGearVelocity * dtSeconds;
        }
        var bassOscillation = Math.sin(phase)
            * (0.15 + bass * 0.70 * motionProfile.bassResponseMultiplier)
            * motionProfile.balanceAmplitudeMultiplier;

        /* 2. 主擒纵轮角 = 行棘轮（:367-369） */
        var currentGearAngle = gearAngleRad;

        var width = contentBox.width, height = contentBox.height;
        if (width <= 0 || height <= 0) return;
        var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        var pixelWidth = Math.round(width * dpr);
        var pixelHeight = Math.round(height * dpr);
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
        }

        var primaryTextColor = theme.primaryColor || '#FFFFFF';
        var accentTextColor = theme.accentColor || '#3B82F6';
        var backgroundColor = theme.backgroundColor;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);
        ctx.translate(-contentBox.left, -contentBox.top);

        /* 0. 中央深色径向渐变（:393-405） */
        if (tuning.showCenterGradient !== false) {
            var gradientR = baseRadius * 1.65;
            var bgCol = backgroundColor || '#000000';
            var grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, gradientR);
            grad.addColorStop(0, CM_colorWithAlpha(bgCol, 0.72));
            grad.addColorStop(0.35, CM_colorWithAlpha(bgCol, 0.52));
            grad.addColorStop(0.7, CM_colorWithAlpha(bgCol, 0.20));
            grad.addColorStop(1, CM_colorWithAlpha(bgCol, 0));
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(centerX, centerY, gradientR, 0, Math.PI * 2);
            ctx.fill();
        }

        /* 0.5 表盘封面（:407-422） */
        if (showCover && coverImage) {
            var coverRadius = baseRadius * 0.88;
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, coverRadius, 0, Math.PI * 2);
            ctx.clip();
            var isFullDecor0 = tuning.showGearDecor === 'full';
            ctx.globalAlpha = 0.42 * (isFullDecor0 ? 1.0 : 0.6);
            var size0 = coverRadius * 2;
            ctx.drawImage(coverImage, centerX - coverRadius, centerY - coverRadius, size0, size0);
            ctx.restore();
        }

        if (tuning.showGearDecor === 'none') {
            ctx.restore();
            return;
        }

        var isFull = tuning.showGearDecor === 'full';
        var decorOpacityMultiplier = isFull ? 1.0 : 0.6;

        var primaryAlpha10 = CM_colorWithAlpha(primaryTextColor, 0.10 * decorOpacityMultiplier);
        var primaryAlpha15 = CM_colorWithAlpha(primaryTextColor, 0.15 * decorOpacityMultiplier);
        var accentAlpha35 = CM_colorWithAlpha(accentTextColor, 0.35 * decorOpacityMultiplier);
        var gearPrimaryAlpha = CM_colorWithAlpha(primaryTextColor, 0.42 * decorOpacityMultiplier);
        var gearPrimarySubtleAlpha = CM_colorWithAlpha(primaryTextColor, 0.32 * decorOpacityMultiplier);
        var gearAccentAlpha = CM_colorWithAlpha(accentTextColor, 0.58 * decorOpacityMultiplier);
        var gearAccentStrongAlpha = CM_colorWithAlpha(accentTextColor, 0.72 * decorOpacityMultiplier);
        var planetGearAlpha = CM_colorWithAlpha(primaryTextColor, 0.24 * decorOpacityMultiplier);
        var jewelFillColor = CM_colorWithAlpha(accentTextColor, 0.28 * decorOpacityMultiplier);
        var jewelStrokeColor = CM_colorWithAlpha(accentTextColor, 0.65 * decorOpacityMultiplier);

        /* 1. 同心导环 & 技术刻度（:449-478） */
        ctx.strokeStyle = primaryAlpha15;
        ctx.lineWidth = 1;
        var ringRadii = [baseRadius * 0.3, baseRadius * 0.6, baseRadius * 0.85, baseRadius * 1.15, baseRadius * 1.4];
        for (var rr = 0; rr < ringRadii.length; rr++) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, ringRadii[rr], 0, Math.PI * 2);
            ctx.stroke();
        }
        var tickCount = 60;
        var outerTickR = baseRadius * 1.15;
        for (var ti2 = 0; ti2 < tickCount; ti2++) {
            var angle = (ti2 * Math.PI * 2) / tickCount + currentGearAngle * 0.2;
            var isMajor = ti2 % 5 === 0;
            var tickLen = isMajor ? 12 : 6;
            var x1 = centerX + outerTickR * Math.cos(angle);
            var y1 = centerY + outerTickR * Math.sin(angle);
            var x2 = centerX + (outerTickR + tickLen) * Math.cos(angle);
            var y2 = centerY + (outerTickR + tickLen) * Math.sin(angle);
            ctx.strokeStyle = isMajor ? accentAlpha35 : primaryAlpha15;
            ctx.lineWidth = isMajor ? 1.5 : 1;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        /* 2. 主擒纵齿轮（:480-505） */
        pdDrawGearTeeth(ctx, centerX, centerY, baseRadius + 8, 36, 10, currentGearAngle,
            gearAccentAlpha, 2.2, CM_colorWithAlpha(accentTextColor, 0.08 * decorOpacityMultiplier));
        pdDrawSpokedWheel(ctx, centerX, centerY, baseRadius * 0.2, baseRadius * 0.85, 6, currentGearAngle,
            gearPrimaryAlpha, 1.8);

        /* 轮缘斜面双环（:507-515） */
        ctx.strokeStyle = CM_colorWithAlpha(primaryTextColor, 0.18 * decorOpacityMultiplier);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * 0.88, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * 0.92, 0, Math.PI * 2);
        ctx.stroke();

        /* 玑镂放射刻线（:517-535） */
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(currentGearAngle);
        var guillocheRayCount = 48;
        var guillocheInnerR = baseRadius * 0.62;
        var guillocheOuterR = baseRadius * 0.83;
        for (var gi2 = 0; gi2 < guillocheRayCount; gi2++) {
            var ga = (gi2 * Math.PI * 2) / guillocheRayCount;
            var innerOffset = gi2 % 2 === 0 ? guillocheInnerR : guillocheInnerR + (guillocheOuterR - guillocheInnerR) * 0.3;
            ctx.strokeStyle = gi2 % 2 === 0 ? primaryAlpha10 : CM_colorWithAlpha(primaryTextColor, 0.07 * decorOpacityMultiplier);
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(innerOffset * Math.cos(ga), innerOffset * Math.sin(ga));
            ctx.lineTo(guillocheOuterR * Math.cos(ga), guillocheOuterR * Math.sin(ga));
            ctx.stroke();
        }
        ctx.restore();

        /* 轮缘铆钉（:537-549） */
        var rivetCount = 12;
        var rivetR = baseRadius * 0.96;
        for (var rv = 0; rv < rivetCount; rv++) {
            var ra = (rv * Math.PI * 2) / rivetCount + currentGearAngle;
            var rx = centerX + rivetR * Math.cos(ra);
            var ry = centerY + rivetR * Math.sin(ra);
            ctx.strokeStyle = CM_colorWithAlpha(primaryTextColor, 0.25 * decorOpacityMultiplier);
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(rx, ry, 2.2, 0, Math.PI * 2);
            ctx.stroke();
        }

        /* 3. 中心轮塔 & 太阳轮小齿轮（:551-574） */
        pdDrawGearTeeth(ctx, centerX, centerY, baseRadius * 0.22, 12, 6, -currentGearAngle * 2.5,
            gearAccentStrongAlpha, 2.1);
        ctx.strokeStyle = jewelStrokeColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 4.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = jewelFillColor;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 2.5, 0, Math.PI * 2);
        ctx.stroke();

        /* 4. 行星齿轮组 ×3（:576-611） */
        var planetCount = 3;
        var orbitR = baseRadius * 0.52;
        var planetR = baseRadius * 0.16;
        var orbitAngleBase = currentGearAngle * 0.4;
        for (var pi = 0; pi < planetCount; pi++) {
            var planetAngle = orbitAngleBase + (pi * Math.PI * 2) / planetCount;
            var px = centerX + orbitR * Math.cos(planetAngle);
            var py = centerY + orbitR * Math.sin(planetAngle);
            pdDrawGearTeeth(ctx, px, py, planetR, 14, 5, -currentGearAngle * 3 + pi * 0.5,
                planetGearAlpha, 1.7);
            ctx.strokeStyle = jewelStrokeColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(px, py, 3.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = jewelFillColor;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.arc(px, py, 1.8, 0, Math.PI * 2);
            ctx.stroke();
        }

        /* 5. 左上摆轮 + 游丝 + 宝石轴（:613-660） */
        var balanceCx = centerX + baseRadius * 0.2;
        var balanceCy = centerY - baseRadius * 0.75;
        var balanceR = baseRadius * 0.28;
        var balanceGearAngle = phase * 0.1;
        pdDrawGearTeeth(ctx, balanceCx, balanceCy, balanceR, 20, 7, balanceGearAngle,
            gearAccentStrongAlpha, 2.1, CM_colorWithAlpha(accentTextColor, 0.10 * decorOpacityMultiplier));
        ctx.strokeStyle = gearPrimarySubtleAlpha;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(balanceCx, balanceCy, balanceR * 0.52, 0, Math.PI * 2);
        ctx.stroke();
        pdDrawHairspring(ctx, balanceCx, balanceCy, balanceR * 0.56, balanceR * 0.88, 3.5,
            bassOscillation * 0.6 + balanceGearAngle * 0.3,
            CM_colorWithAlpha(accentTextColor, 0.30 * decorOpacityMultiplier), 0.8);
        ctx.strokeStyle = jewelStrokeColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(balanceCx, balanceCy, 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = jewelFillColor;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.arc(balanceCx, balanceCy, 1.8, 0, Math.PI * 2);
        ctx.stroke();

        /* 传动轮（左下偏置）+ 辐条 + 日内瓦纹 + 宝石轴（:662-721） */
        var transCx = centerX + baseRadius * 0.32;
        var transCy = centerY + baseRadius * 0.78;
        var transR = baseRadius * 0.34;
        pdDrawGearTeeth(ctx, transCx, transCy, transR, 24, 7, -currentGearAngle * 1.4,
            gearPrimaryAlpha, 1.8);
        pdDrawSpokedWheel(ctx, transCx, transCy, transR * 0.25, transR * 0.85, 5, -currentGearAngle * 1.4,
            gearPrimarySubtleAlpha, 1.5);
        ctx.save();
        ctx.translate(transCx, transCy);
        ctx.rotate(-currentGearAngle * 1.4);
        ctx.beginPath();
        ctx.arc(0, 0, transR * 0.80, 0, Math.PI * 2);
        ctx.clip();
        var genevaStripeCount = 9;
        var genevaSpan = transR * 1.6;
        var genevaStep = genevaSpan / (genevaStripeCount + 1);
        for (var gs = 1; gs <= genevaStripeCount; gs++) {
            var yOff = -genevaSpan * 0.5 + gs * genevaStep;
            ctx.strokeStyle = gs % 2 === 0 ? primaryAlpha10 : CM_colorWithAlpha(primaryTextColor, 0.06 * decorOpacityMultiplier);
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(-transR, yOff);
            ctx.lineTo(transR, yOff);
            ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = jewelStrokeColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(transCx, transCy, 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = jewelFillColor;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.arc(transCx, transCy, 1.8, 0, Math.PI * 2);
        ctx.stroke();

        /* 秒轮（每播放秒进一齿）+ 辐条 + 宝石轴（:723-762） */
        var secondGearTeeth = 15;
        var secondGearCx = centerX + baseRadius * 0.68;
        var secondGearCy = centerY + baseRadius * 0.76;
        var secondGearR = baseRadius * 0.16;
        var secondGearAngle2 = secondGearAngle;
        pdDrawGearTeeth(ctx, secondGearCx, secondGearCy, secondGearR, secondGearTeeth, 5, secondGearAngle2,
            gearAccentAlpha, 1.8, CM_colorWithAlpha(accentTextColor, 0.06 * decorOpacityMultiplier));
        pdDrawSpokedWheel(ctx, secondGearCx, secondGearCy, secondGearR * 0.28, secondGearR * 0.76, 4,
            -secondGearAngle2, gearPrimarySubtleAlpha, 1.3);
        ctx.strokeStyle = jewelStrokeColor;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(secondGearCx, secondGearCy, 2.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = jewelFillColor;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(secondGearCx, secondGearCy, 1.5, 0, Math.PI * 2);
        ctx.stroke();

        /* 惰轮小齿轮（:764-795） */
        var idlerCx = (transCx + secondGearCx) * 0.5 + baseRadius * 0.04;
        var idlerCy = (transCy + secondGearCy) * 0.5 - baseRadius * 0.02;
        var idlerR = baseRadius * 0.08;
        pdDrawGearTeeth(ctx, idlerCx, idlerCy, idlerR, 10, 3.5, currentGearAngle * 2.2,
            CM_colorWithAlpha(primaryTextColor, 0.28 * decorOpacityMultiplier), 1.3);
        ctx.strokeStyle = CM_colorWithAlpha(primaryTextColor, 0.18 * decorOpacityMultiplier);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(idlerCx, idlerCy, idlerR * 0.45, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = jewelStrokeColor;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.arc(idlerCx, idlerCy, 2.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = jewelFillColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(idlerCx, idlerCy, 1.2, 0, Math.PI * 2);
        ctx.stroke();

        /* 6. 焦点轴对齐线 + 箭头（:797-816） */
        var focalAxisEndRadius = lyricRingRadius - Math.max(14, baseRadius * 0.025);
        ctx.strokeStyle = gearAccentStrongAlpha;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX + baseRadius * 0.8, centerY);
        ctx.lineTo(centerX + focalAxisEndRadius, centerY);
        ctx.stroke();
        var arrowX = centerX + focalAxisEndRadius;
        ctx.fillStyle = gearAccentStrongAlpha;
        ctx.beginPath();
        ctx.moveTo(arrowX, centerY - 4);
        ctx.lineTo(arrowX + 8, centerY);
        ctx.lineTo(arrowX, centerY + 4);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    /* ---------- 主循环（组件 useEffect rAF 族的合并等价） ---------- */
    var springTarget = null;

    function tick(now) {
        if (destroyed) return;
        var dt = lastFrameTs === null ? 0.016 : Math.min((now - lastFrameTs) / 1000, 0.05);
        lastFrameTs = now;

        var t = currentTime.get();
        if (t !== lastTime) lastTime = t;

        /* currentLineIndex（Folia playbackStore props 语义；宿主经 getter 供给权威索引） */
        stateCurrentLineIndex = getCurrentLineIndex ? getCurrentLineIndex(t) : -1;
        if (stateCurrentLineIndex >= 0 && stateCurrentLineIndex < lines.length) {
            lastValidLineIndex = stateCurrentLineIndex;
            hasObservedLine = true;
        }

        /* pendingSeek 释放（:204-208 useEffect） */
        if (pendingSeekIndex !== null && pendingSeekIndex === stateCurrentLineIndex) {
            pendingSeekIndex = null;
            manualScrollAnchorIndex = null;
        }

        updateInstrumental(t, now);

        /* targetLineIndex + spring.set（:177-182/:332-334） */
        var target = resolveTargetLineIndex(t);
        if (springTarget === null || target !== springTarget) {
            springTarget = target;
            tickSpring.set(target);
        }
        tickSpring.step(dt);

        /* useTransform 派生（:358-363） */
        var gearRotationAngleRad = tickSpring.value * angleStepRad;
        var wheelRotationDeg = -(tickSpring.value - springTarget) * angleStepRad * (180 / Math.PI);
        var textRotationCorrectionDeg = -wheelRotationDeg * 0.65;

        /* 布局 stamp（lineItems memo 依赖：lines/target/viewport/tuning/theme/font/锚点） */
        var anchorKey = manualScrollAnchorIndex !== null ? 'm' + manualScrollAnchorIndex : 'a';
        var stamp = [lyricsSig, springTarget, viewportSize.width, viewportSize.height,
            tuning.arcRadius, tuning.arcAngleDeg, tuning.wheelCenterX, tuning.wheelCenterY,
            tuning.activeScale, tuning.tickSnappiness, tuning.showGearDecor, tuning.showCenterGradient,
            lyricsFontScale, subtitleFontScale,
            CM_resolveThemeFontStack(theme), CM_resolveThemeFontWeight(theme, 400),
            showText ? 1 : 0, anchorKey
        ].join('|');
        if (stamp !== layoutStamp) {
            layoutStamp = stamp;
            if (showText) {
                recomputeGeometry();
                recomputeItems(springTarget);
            }
        } else {
            /* 锚点变化等只影响渲染期读值的场景（React 每渲染重读 manualScrollAnchorIndex） */
            itemRecords.forEach(function (rec) {
                if (rec.marker && rec.item) {
                    var wantMarker = manualScrollAnchorIndex !== null && !!rec.item.line.isChorus;
                    if (rec.marker.style.display !== (wantMarker ? 'block' : 'none')) {
                        rec.marker.style.display = wantMarker ? 'block' : 'none';
                    }
                }
            });
        }

        if (showText) {
            /* rail 旋转（:479-486 motion.div rotate + transformOrigin） */
            rail.style.display = 'block';
            rail.style.transformOrigin = centerX + 'px ' + centerY + 'px';
            rail.style.transform = 'rotate(' + wheelRotationDeg + 'deg) translateZ(0)';

            /* 行项每帧量：弧外渐隐 opacity（PendoloRotatingLine :33-35）+ 反旋修正（:523） */
            itemRecords.forEach(function (rec) {
                var it = rec.item;
                if (!it) return;
                var opacity = CM_resolvePendoloRotatingLineOpacity(it.angleDeg, wheelRotationDeg, it.alpha);
                rec.el.style.opacity = String(opacity);
                rec.corrEl.style.transform = 'rotate(' + textRotationCorrectionDeg + 'deg) translateZ(0)';
            });

            /* 焦点行扫光 fill（PendoloSweepLine useTransform 每帧求值） */
            itemRecords.forEach(function (rec2) {
                if (!rec2.item || !rec2.item.isActive) return;
                for (var i = 0; i < rec2.sweepLines.length; i++) {
                    rec2.sweepLines[i].update(t);
                }
            });
        } else {
            rail.style.display = 'none';
        }

        /* canvas 帧（:328-821） */
        renderCanvas(gearRotationAngleRad, dt);

        rafId = requestAnimationFrame(tick);
    }

    /* ---------- 重挂载等价（entry.tsx:19 render: props => <VisualizerPendolo
       key={props.seed}/> —— 歌曲作用域 seed / 歌词数据变化 → 组件整体重挂载：
       手动滚轮状态、行观察状态、无词机械演示状态全部回到初挂载；useSpring
       初值 = 初挂载 targetLineIndex（无开场弹跳）；seedRef = 初 props.seed） ---------- */
    function resetForRemount() {
        hasObservedLine = false;
        lastValidLineIndex = 0;
        if (manualScrollResetRef !== null) { window.clearTimeout(manualScrollResetRef); manualScrollResetRef = null; }
        manualScrollAnchorIndex = null;
        pendingSeekIndex = null;
        wheelAccumulator = 0; wheelDirection = 0;
        touchAccumulator = 0; touchDirection = 0;
        isInstrumental = false;
        instrWatch = null;
        instrumentalIndex = 0;
        seedRef = seed;   /* useRef(props.seed) 初挂载等价 */
        /* useSpring(targetLineIndex)：初挂载弹簧停在初始 target 上 */
        var t0;
        try { t0 = currentTime.get(); } catch (e) { t0 = 0; }
        var initialTarget = resolveTargetLineIndex(t0 != null ? t0 : 0);
        tickSpring.value = initialTarget;
        tickSpring.velocity = 0;
        tickSpring.target = initialTarget;
        tickSpring.life = 0;
        springTarget = initialTarget;
        layoutStamp = null;
    }

    /* ---------- 启动（React 初挂载 memo 首算等价） ---------- */
    loadCoverImage();
    var initialTarget = resolveTargetLineIndex(0);
    springTarget = initialTarget;
    /* useSpring(targetLineIndex)：framer 初值 = 初始 target（非 0 弹到 target） */
    tickSpring.value = initialTarget;
    tickSpring.target = initialTarget;
    tickSpring.velocity = 0;
    rafId = requestAnimationFrame(tick);

    return {
        destroy: function () {
            destroyed = true;
            if (rafId) cancelAnimationFrame(rafId);
            clearManualScrollReset();
            if (resizeObserver) { try { resizeObserver.disconnect(); } catch (e) { } resizeObserver = null; }
            else window.removeEventListener('resize', onHostResize);
            if (shell.parentNode) shell.parentNode.removeChild(shell);
            itemRecords.clear();
        },
        setLines: function (next) {
            lines = next || [];
            lyricsSig = lines.length === 0 ? '' : (lines.length + '|' + (lines[0] && lines[0].fullText != null ? lines[0].fullText : ''));
            /* key={props.seed} 重挂载等价（entry.tsx:19）：歌词数据整体替换 =
               新组件实例——行观察/滚轮/机械演示/弹簧全部重置（原版 useEffect
               [props.seed, lyricsSig] 的 isInstrumental 复位是其子集） */
            resetForRemount();
        },
        setTheme: function (next) {
            theme = next;
            motionProfile = CM_resolvePendoloMotionProfile(theme.animationIntensity);
            applySpringTuning();
            shell.style.fontFamily = CM_resolveThemeFontStack(theme);
            shell.style.fontWeight = CM_resolveThemeFontWeight(theme, 400);
            itemRecords.forEach(function (rec) {
                rec.el.style.fontFamily = CM_resolveThemeFontStack(theme);
                rec.el.style.fontWeight = CM_resolveThemeFontWeight(theme, 400);
            });
            layoutStamp = null;
            updateBalanceIcon();
        },
        setFontScale: function (n) {
            lyricsFontScale = n != null ? n : 1;
            layoutStamp = null;
        },
        setTuning: function (next) {
            tuning = pendoloResolveTuning(next);
            applySpringTuning();
            var wasCover = showCover;
            showCover = tuning.showCoverOnWatchFace === true;
            if (wasCover !== showCover) loadCoverImage();
            layoutStamp = null;
        },
        setPaused: function (p) { paused = !!p; },
        setSeed: function (s) {
            seed = s != null ? String(s) : '';
            /* key={props.seed}：seed 变化（换歌/重播）→ 组件整体重挂载（entry.tsx:19），
               行数据未变也重置弹簧/滚轮/机械演示状态（原版整树卸载重建语义） */
            resetForRemount();
        },
        setCoverUrl: function (u) {
            coverUrl = u != null ? u : null;
            loadCoverImage();
        }
    };
}

var CM_colorWithAlpha = colorWithAlpha;
env.CM_colorWithAlpha = CM_colorWithAlpha;
var CM_mixColors = mixColors;
env.CM_mixColors = CM_mixColors;
var CM_splitLyricGraphemes = splitLyricGraphemes;
env.CM_splitLyricGraphemes = CM_splitLyricGraphemes;
var CM_buildLineGraphemeTimeline = buildLineGraphemeTimeline;
env.CM_buildLineGraphemeTimeline = CM_buildLineGraphemeTimeline;
var CM_resolveLyricSubtitleTracks = resolveLyricSubtitleTracks;
env.CM_resolveLyricSubtitleTracks = CM_resolveLyricSubtitleTracks;
var CM_resolveSubtitleContentMode = resolveSubtitleContentMode;
env.CM_resolveSubtitleContentMode = CM_resolveSubtitleContentMode;
var CM_SECONDARY_TRACK_SIZE_FACTOR = SECONDARY_TRACK_SIZE_FACTOR;
env.CM_SECONDARY_TRACK_SIZE_FACTOR = CM_SECONDARY_TRACK_SIZE_FACTOR;
var CM_SECONDARY_TRACK_OPACITY = SECONDARY_TRACK_OPACITY;
env.CM_SECONDARY_TRACK_OPACITY = CM_SECONDARY_TRACK_OPACITY;
var CM_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK = SECONDARY_TRACK_FONT_WEIGHT_FALLBACK;
env.CM_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK = CM_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK;
var CM_SECONDARY_TRACK_GAP_EM = SECONDARY_TRACK_GAP_EM;
env.CM_SECONDARY_TRACK_GAP_EM = CM_SECONDARY_TRACK_GAP_EM;
var CM_resolveThemeFontStack = resolveThemeFontStack;
env.CM_resolveThemeFontStack = CM_resolveThemeFontStack;
var CM_resolveThemeFontWeight = resolveThemeFontWeight;
env.CM_resolveThemeFontWeight = CM_resolveThemeFontWeight;
var CM_resolveThemeTranslationFontStack = resolveThemeTranslationFontStack;
env.CM_resolveThemeTranslationFontStack = CM_resolveThemeTranslationFontStack;
var CM_prepareWordColorMatchers = prepareWordColorMatchers;
env.CM_prepareWordColorMatchers = CM_prepareWordColorMatchers;
var CM_buildWordColorRangesFromMatchers = buildWordColorRangesFromMatchers;
env.CM_buildWordColorRangesFromMatchers = CM_buildWordColorRangesFromMatchers;
var CM_resolveTokenColorMap = resolveTokenColorMap;
env.CM_resolveTokenColorMap = CM_resolveTokenColorMap;
var CM_measureMonetGraphemeOffsets = measureMonetGraphemeOffsets;
env.CM_measureMonetGraphemeOffsets = CM_measureMonetGraphemeOffsets;
var CM_calculatePendoloWheelLayout = calculatePendoloWheelLayout;
env.CM_calculatePendoloWheelLayout = CM_calculatePendoloWheelLayout;
var CM_measurePendoloLineWidth = measurePendoloLineWidth;
env.CM_measurePendoloLineWidth = CM_measurePendoloLineWidth;
var CM_resolvePendoloFallbackAnchorIndex = resolvePendoloFallbackAnchorIndex;
env.CM_resolvePendoloFallbackAnchorIndex = CM_resolvePendoloFallbackAnchorIndex;
var CM_resolvePendoloRotatingLineOpacity = resolvePendoloRotatingLineOpacity;
env.CM_resolvePendoloRotatingLineOpacity = CM_resolvePendoloRotatingLineOpacity;
var CM_resolvePendoloMotionProfile = resolvePendoloMotionProfile;
env.CM_resolvePendoloMotionProfile = CM_resolvePendoloMotionProfile;
var CM_resolvePendoloChorusPresentation = resolvePendoloChorusPresentation;
env.CM_resolvePendoloChorusPresentation = CM_resolvePendoloChorusPresentation;
var CM_buildPendoloTextLayout = buildPendoloTextLayout;
env.CM_buildPendoloTextLayout = CM_buildPendoloTextLayout;
var CM_resolvePendoloSubtitleTracks = resolvePendoloSubtitleTracks;
env.CM_resolvePendoloSubtitleTracks = CM_resolvePendoloSubtitleTracks;
var CM_buildPendoloSubtitleFontSpec = buildPendoloSubtitleFontSpec;
env.CM_buildPendoloSubtitleFontSpec = CM_buildPendoloSubtitleFontSpec;
var CM_sumPendoloSubtitleTrackHeights = sumPendoloSubtitleTrackHeights;
env.CM_sumPendoloSubtitleTrackHeights = CM_sumPendoloSubtitleTrackHeights;
var CM_buildPendoloColorRuns = buildPendoloColorRuns;
env.CM_buildPendoloColorRuns = CM_buildPendoloColorRuns;
var buildMonetWordColorRanges = buildWordColorRanges;
env.buildMonetWordColorRanges = buildMonetWordColorRanges;
var buildMonetWordColorRangesFromMatchers = buildWordColorRangesFromMatchers;
env.buildMonetWordColorRangesFromMatchers = buildMonetWordColorRangesFromMatchers;
var prepareMonetWordColorMatchers = prepareWordColorMatchers;
env.prepareMonetWordColorMatchers = prepareMonetWordColorMatchers;
var resolveMonetTokenColorMap = resolveTokenColorMap;
env.resolveMonetTokenColorMap = resolveMonetTokenColorMap;
env.PendoloPendoloEngine = (typeof PendoloPendoloEngine !== "undefined") ? PendoloPendoloEngine : null;
env.pendoloResolveTuning = (typeof pendoloResolveTuning !== "undefined") ? pendoloResolveTuning : null;
env.PENDOLO_DEFAULT_TUNING = (typeof PENDOLO_DEFAULT_TUNING !== "undefined") ? PENDOLO_DEFAULT_TUNING : null;
})(typeof pretext !== "undefined" ? pretext : {}, typeof window !== "undefined" ? window : this);