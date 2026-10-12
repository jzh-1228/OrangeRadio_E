// OrangeSea MONET ENGINE (AGPL-3.0, from folia-major) -- no-build bundle
(function (pretext, env) {
"use strict";
// ======== components/visualizer/backgrounds/monet/monetBackgroundDrift ========
// src/components/visualizer/backgrounds/monet/monetBackgroundDrift.ts
// AE-wiggle-style drift for the Monet background: fractal value noise sampled into a long,
// seamlessly looping keyframe track that the compositor plays without any per-frame JS.
// One full lap of the noise lattice. Long enough that the loop never reads as a loop.
const DRIFT_LOOP_SECONDS = 240;
// Lattice cells per lap. Spacing works out to ~4.6s, i.e. a wiggle every ~9s.
const DRIFT_LATTICE_POINTS = 76;
// Samples emitted per lap. Three per cell keeps the piecewise-linear playback free of visible kinks.
const DRIFT_SAMPLE_COUNT = 156;
// Travel and breathing at strength 1.
const DRIFT_MAX_TRAVEL_PERCENT = 3.4;
const DRIFT_BREATH_AMPLITUDE = 0.035;
// Headroom on top of the geometric minimum, so rounding can never uncover an edge.
const DRIFT_OVERSCAN_MARGIN = 0.01;
// Distinct lattices per channel; the offsets keep x, y and scale from moving in lockstep.
const DRIFT_SEED_X = 12.9898;
const DRIFT_SEED_Y = 78.233;
const DRIFT_SEED_SCALE = 39.425;
const wrap = (value, modulus) => ((value % modulus) + modulus) % modulus;
const hash = (lattice, seed) => {
    const value = Math.sin(lattice * 127.1 + seed * 311.7) * 43758.5453;
    return value - Math.floor(value);
};
const smoothstep = (t) => t * t * (3 - 2 * t);
/** Value noise that repeats exactly every `points` lattice cells, so the track loops seamlessly. */
const periodicNoise = (t, points, seed) => {
    const cell = Math.floor(t);
    const from = hash(wrap(cell, points), seed);
    const to = hash(wrap(cell + 1, points), seed);
    return from + (to - from) * smoothstep(t - cell);
};
/** Two octaves of periodic noise, centred on 0. The second octave supplies the finer AE-ish jitter. */
const periodicFbm = (t, seed) => {
    const base = periodicNoise(t, DRIFT_LATTICE_POINTS, seed);
    const detail = periodicNoise(t * 2, DRIFT_LATTICE_POINTS * 2, seed + 17.31);
    return (base * 0.68 + detail * 0.32) * 2 - 1;
};
/** Scales a channel so its extreme sample sits exactly at ±1, making the travel budget exact. */
const normalize = (samples) => {
    const peak = samples.reduce((acc, value) => Math.max(acc, Math.abs(value)), 0);
    return peak > 0 ? samples.map(value => value / peak) : samples;
};
/**
 * Builds the drift animation for one strength (0..1). The element is pre-scaled past twice the
 * largest translate, which is what keeps the pan from ever dragging an image edge into frame.
 */
const buildMonetDriftTrack = (strength) => {
    const clamped = Math.min(1, Math.max(0, strength));
    const travelPercent = DRIFT_MAX_TRAVEL_PERCENT * clamped;
    const minScale = 1 + (travelPercent / 100) * 2 + DRIFT_OVERSCAN_MARGIN;
    const breath = DRIFT_BREATH_AMPLITUDE * clamped;
    const rawX = [];
    const rawY = [];
    const rawScale = [];
    for (let index = 0; index <= DRIFT_SAMPLE_COUNT; index += 1) {
        const t = (DRIFT_LATTICE_POINTS * index) / DRIFT_SAMPLE_COUNT;
        rawX.push(periodicFbm(t, DRIFT_SEED_X));
        rawY.push(periodicFbm(t, DRIFT_SEED_Y));
        rawScale.push(periodicFbm(t, DRIFT_SEED_SCALE));
    }
    const x = normalize(rawX);
    const y = normalize(rawY);
    const scale = normalize(rawScale);
    const keyframes = x.map((offsetX, index) => ({
        transform: `translate3d(${(offsetX * travelPercent).toFixed(4)}%, ${(y[index] * travelPercent).toFixed(4)}%, 0) `
            + `scale(${(minScale + breath * ((scale[index] + 1) / 2)).toFixed(5)})`,
    }));
    return {
        keyframes,
        durationMs: DRIFT_LOOP_SECONDS * 1000,
        maxTravelPercent: travelPercent,
        minScale,
    };
};

// ======== components/visualizer/colorMix ========
// src/components/visualizer/colorMix.ts
// Shared color helpers for visualizer renderers.
const clamp__1 = (value, min, max) => Math.max(min, Math.min(max, value));
const mix__1 = (from, to, amount) => from + (to - from) * amount;
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
    return `rgba(${Math.round(mix__1(fromChannels.r, toChannels.r, normalizedAmount))}, ${Math.round(mix__1(fromChannels.g, toChannels.g, normalizedAmount))}, ${Math.round(mix__1(fromChannels.b, toChannels.b, normalizedAmount))}, ${clamp__1(alpha, 0, 1)})`;
};

// ======== components/visualizer/monet/monetBackgroundPipeline ========

// src/components/visualizer/monet/monetBackgroundPipeline.ts
// Builds and caches the static Monet poster background so the visualizer only recomputes when inputs change.
const MONET_BACKGROUND_WIDTH = 1920;
const MONET_BACKGROUND_HEIGHT = 1080;
const monetBackgroundCache = new Map();
const FALLBACK_DARK = { r: 10, g: 10, b: 12 };
const FALLBACK_LIGHT = { r: 245, g: 245, b: 245 };
const clamp__2 = (value, min, max) => Math.min(max, Math.max(min, value));
const mix__2 = (from, to, amount) => from + (to - from) * amount;
const luminanceOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const resolveWashEndpoints = (background, primary) => {
    const backgroundLuminance = luminanceOf(background.r, background.g, background.b);
    const primaryLuminance = luminanceOf(primary.r, primary.g, primary.b);
    return backgroundLuminance <= primaryLuminance
        ? { shadow: background, highlight: primary }
        : { shadow: primary, highlight: background };
};
const resolveSourceUrl = ({ coverUrl, monetBackgroundImage, tuning, }) => (tuning.backgroundSource === 'uploaded-global'
    ? monetBackgroundImage?.url ?? coverUrl ?? null
    : coverUrl ?? monetBackgroundImage?.url ?? null);
const loadImage = async (src) => {
    const image = new Image();
    if (src.startsWith('http://') || src.startsWith('https://')) {
        image.crossOrigin = 'anonymous';
    }
    image.decoding = 'async';
    // Create a promise for the fallback load event
    const loadPromise = new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    });
    image.src = src;
    try {
        await image.decode();
    }
    catch (e) {
        // Fallback to waiting for onload if decode() fails or is unsupported
        await loadPromise;
    }
    return image;
};
const resolveCanvasImageDimension = (image, dimension, fallback) => {
    const dimensions = image;
    const value = dimensions[dimension];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};
const drawCoverCropped = (context, image, width, height) => {
    const imageWidth = resolveCanvasImageDimension(image, 'width', width);
    const imageHeight = resolveCanvasImageDimension(image, 'height', height);
    if (!imageWidth || !imageHeight) {
        return;
    }
    const scale = Math.max(width / imageWidth, height / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;
    context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
};
const resolveThemeChannel = (color, fallback) => {
    const parsed = parseColorChannels(color);
    return parsed
        ? {
            r: clamp__2(parsed.r, 0, 255),
            g: clamp__2(parsed.g, 0, 255),
            b: clamp__2(parsed.b, 0, 255),
        }
        : fallback;
};
const resolveWashColor = (normalizedLuminance, background, accent, primary) => {
    const { shadow, highlight } = resolveWashEndpoints(background, primary);
    if (normalizedLuminance <= 0.55) {
        const amount = normalizedLuminance / 0.55;
        return {
            r: mix__2(shadow.r, accent.r, amount),
            g: mix__2(shadow.g, accent.g, amount),
            b: mix__2(shadow.b, accent.b, amount),
        };
    }
    const amount = (normalizedLuminance - 0.55) / 0.45;
    return {
        r: mix__2(accent.r, highlight.r, amount),
        g: mix__2(accent.g, highlight.g, amount),
        b: mix__2(accent.b, highlight.b, amount),
    };
};
// Applies the stable canvas-only color treatment so Safari never needs CSS filters for Monet backgrounds.
const applyBackgroundPostProcessing = (context, width, height, theme, tuning) => {
    const grayscale = clamp__2(tuning.backgroundGrayscale, 0, 1);
    const saturation = clamp__2(tuning.backgroundSaturation, 0, 2);
    const wash = clamp__2(tuning.backgroundWash, 0, 1);
    if (grayscale <= 0 && Math.abs(saturation - 1) < 0.001 && wash <= 0) {
        return;
    }
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    const background = resolveThemeChannel(theme.backgroundColor, FALLBACK_DARK);
    const accent = resolveThemeChannel(theme.accentColor, background);
    const primary = resolveThemeChannel(theme.primaryColor, FALLBACK_LIGHT);
    const customWash = resolveThemeChannel(tuning.backgroundWashCustomColor, accent);
    const washAccent = tuning.backgroundWashColorMode === 'custom' ? customWash : accent;
    for (let index = 0; index < data.length; index += 4) {
        let r = data[index];
        let g = data[index + 1];
        let b = data[index + 2];
        const alpha = data[index + 3];
        if (alpha === 0) {
            continue;
        }
        const luminance = luminanceOf(r, g, b);
        if (grayscale > 0) {
            r = mix__2(r, luminance, grayscale);
            g = mix__2(g, luminance, grayscale);
            b = mix__2(b, luminance, grayscale);
        }
        if (Math.abs(saturation - 1) >= 0.001) {
            const saturatedLuminance = luminanceOf(r, g, b);
            r = saturatedLuminance + (r - saturatedLuminance) * saturation;
            g = saturatedLuminance + (g - saturatedLuminance) * saturation;
            b = saturatedLuminance + (b - saturatedLuminance) * saturation;
        }
        if (wash > 0) {
            const washColor = resolveWashColor(clamp__2(luminance / 255, 0, 1), background, washAccent, primary);
            r = mix__2(r, washColor.r, wash);
            g = mix__2(g, washColor.g, wash);
            b = mix__2(b, washColor.b, wash);
        }
        data[index] = Math.round(clamp__2(r, 0, 255));
        data[index + 1] = Math.round(clamp__2(g, 0, 255));
        data[index + 2] = Math.round(clamp__2(b, 0, 255));
    }
    context.putImageData(imageData, 0, 0);
};
const paintMonetOverlay = (context, width, height, theme, tuning) => {
    const overlay = clamp__2(tuning.backgroundOverlayOpacity, 0, 1);
    const overlayGradient = context.createLinearGradient(0, 0, width, height);
    overlayGradient.addColorStop(0, colorWithAlpha(theme.accentColor, 0.08 + overlay * 0.62));
    overlayGradient.addColorStop(0.44, colorWithAlpha(theme.backgroundColor, 0.16 + overlay * 0.58));
    overlayGradient.addColorStop(1, colorWithAlpha(theme.primaryColor, 0.06 + overlay * 0.36));
    context.fillStyle = overlayGradient;
    context.fillRect(0, 0, width, height);
    const leftBloom = context.createRadialGradient(width * 0.18, height * 0.34, 0, width * 0.18, height * 0.34, width * 0.55);
    leftBloom.addColorStop(0, colorWithAlpha(theme.accentColor, overlay * 0.42));
    leftBloom.addColorStop(1, colorWithAlpha(theme.backgroundColor, 0));
    context.fillStyle = leftBloom;
    context.fillRect(0, 0, width, height);
    const rightVeil = context.createLinearGradient(width * 0.45, 0, width, 0);
    rightVeil.addColorStop(0, colorWithAlpha(theme.backgroundColor, 0));
    rightVeil.addColorStop(1, colorWithAlpha(theme.backgroundColor, 0.18 + overlay * 0.38));
    context.fillStyle = rightVeil;
    context.fillRect(0, 0, width, height);
    if (tuning.backgroundStreaksEnabled === false) {
        return;
    }
    context.fillStyle = colorWithAlpha(theme.backgroundColor, 0.1 + overlay * 0.08);
    for (let index = 0; index < 18; index += 1) {
        const x = (index * 127) % width;
        const y = ((index * 211) % height) - 40;
        context.fillRect(x, y, 1, height * 0.28);
    }
};
const getMonetBackgroundCacheKey = ({ coverUrl, monetBackgroundImage, theme, tuning, }) => JSON.stringify({
    sourceUrl: resolveSourceUrl({ coverUrl, monetBackgroundImage, tuning }),
    uploadedId: tuning.backgroundSource === 'uploaded-global' ? monetBackgroundImage?.id ?? null : null,
    theme: {
        backgroundColor: theme.backgroundColor,
        primaryColor: theme.primaryColor,
        accentColor: theme.accentColor,
    },
    tuning: {
        backgroundSource: tuning.backgroundSource,
        backgroundBlurPx: tuning.backgroundBlurPx,
        backgroundOverlayOpacity: tuning.backgroundOverlayOpacity,
        backgroundGrayscale: tuning.backgroundGrayscale,
        backgroundSaturation: tuning.backgroundSaturation,
        backgroundWash: tuning.backgroundWash,
        backgroundWashColorMode: tuning.backgroundWashColorMode,
        backgroundWashCustomColor: tuning.backgroundWashCustomColor,
        // Drift is a DOM-side transform and never reaches the bitmap, so it stays out of the key
        // the same way backgroundLayout does; streaks are baked in and must invalidate it.
        backgroundStreaksEnabled: tuning.backgroundStreaksEnabled,
    },
});
let isCanvasFilterSupportedCached = null;
/**
 * Checks if the browser's Canvas 2D context actually supports and applies the filter property.
 * This handles cases like iOS Safari where ctx.filter is defined but silently does nothing.
 */
const checkCanvasFilterSupport = () => {
    if (isCanvasFilterSupportedCached !== null) {
        return isCanvasFilterSupportedCached;
    }
    if (typeof document === 'undefined') {
        return false;
    }
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const ctx = canvas.getContext('2d');
        if (!ctx || typeof ctx.filter !== 'string') {
            isCanvasFilterSupportedCached = false;
            if (false) {
                console.log('[MonetBackground] Canvas filter support detection: Unsupported (ctx.filter is missing)');
            }
            return false;
        }
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 2, 2);
        ctx.filter = 'blur(1px)';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1, 1);
        const imgData = ctx.getImageData(1, 1, 1, 1);
        isCanvasFilterSupportedCached = imgData.data[0] > 0;
        if (false) {
            console.log(`[MonetBackground] Canvas filter support detection: ${isCanvasFilterSupportedCached ? 'Supported (native)' : 'Unsupported (CSS blur fallback will be used)'}`);
        }
        return isCanvasFilterSupportedCached;
    }
    catch (e) {
        isCanvasFilterSupportedCached = false;
        if (false) {
            console.log('[MonetBackground] Canvas filter support detection failed:', e);
        }
        return false;
    }
};
const buildMonetBackgroundDataUrl = async ({ coverUrl, monetBackgroundImage, theme, tuning, }) => {
    const sourceUrl = resolveSourceUrl({ coverUrl, monetBackgroundImage, tuning });
    if (!sourceUrl) {
        return null;
    }
    const image = await loadImage(sourceUrl);
    const canvas = document.createElement('canvas');
    canvas.width = MONET_BACKGROUND_WIDTH;
    canvas.height = MONET_BACKGROUND_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) {
        return null;
    }
    context.fillStyle = theme.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    if (checkCanvasFilterSupport()) {
        context.filter = `blur(${clamp__2(tuning.backgroundBlurPx, 0, 60)}px)`;
    }
    drawCoverCropped(context, image, canvas.width, canvas.height);
    context.restore();
    applyBackgroundPostProcessing(context, canvas.width, canvas.height, theme, tuning);
    paintMonetOverlay(context, canvas.width, canvas.height, theme, tuning);
    return canvas.toDataURL('image/jpeg', 0.92);
};
const resolveMonetBackgroundDataUrl = (options) => {
    const cacheKey = getMonetBackgroundCacheKey(options);
    const cached = monetBackgroundCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const next = buildMonetBackgroundDataUrl(options).catch(() => null);
    monetBackgroundCache.set(cacheKey, next);
    return next;
};

// ======== components/visualizer/monet/monetLyricMotion ========
// src/components/visualizer/monet/monetLyricMotion.ts
// Absolute-time envelopes shared by the DOM rail and embedded GPU lyrics.
const MONET_SCROLL_SPRING = { stiffness: 142, damping: 28, mass: 0.82 };
const MONET_SCALE_SPRING = { stiffness: 150, damping: 30, mass: 0.78 };
const clampMonetProgress = (value) => Math.min(1, Math.max(0, value));
function resolveMonetGlow(time, start, end, lineEnd) {
    if (time <= start)
        return 0;
    const rise = Math.max(0.001, end - start) * 1.18;
    const peak = start + rise;
    const tail = Math.max(lineEnd, end + 1.05);
    if (time <= peak) {
        const progress = clampMonetProgress((time - start) / rise);
        // 使用 Smoothstep (ease-in-out) 曲线，让发光开始和到达峰值时都平滑过渡
        return progress * progress * (3 - 2 * progress);
    }
    const remaining = 1 - clampMonetProgress((time - peak) / Math.max(0.18, tail - peak));
    // 使用 Smoothstep (ease-in-out)，让衰退初期缓慢（有“驻留”感），然后再平滑消失
    return remaining * remaining * (3 - 2 * remaining);
}
/** Interpolates measured glyph positions, including a proportional fallback for untimed graphemes. */
function resolveMonetFillWidth(time, start, end, offsets, timings) {
    const width = offsets.at(-1) ?? 0;
    if (time <= start)
        return 0;
    if (time >= end)
        return width;
    const count = Math.min(timings.length, offsets.length - 1);
    if (count > 0) {
        for (let i = 0; i < count; i++) {
            const timing = timings[i];
            const timingStart = Math.max(start, timing.startTime);
            const timingEnd = Math.max(timingStart, timing.endTime);
            if (time < timingStart)
                return offsets[i];
            if (time <= timingEnd) {
                const progress = (time - timingStart) / Math.max(0.001, timingEnd - timingStart);
                return offsets[i] + (offsets[i + 1] - offsets[i]) * progress;
            }
        }
        return offsets[count] ?? width;
    }
    const index = clampMonetProgress((time - start) / Math.max(0.001, end - start)) * (offsets.length - 1);
    const whole = Math.floor(index);
    return (offsets[whole] ?? width) + ((offsets[whole + 1] ?? width) - (offsets[whole] ?? width)) * (index - whole);
}
function resolveMonetTone(status, offset) {
    if (status === 'active')
        return { alpha: 1, scale: 1, blur: 0, baseAlpha: 0.34 };
    const distance = Math.max(Math.abs(offset), 1);
    const waiting = status === 'waiting';
    return {
        alpha: waiting ? Math.max(0.36, 0.72 - (distance - 1) * 0.18) : Math.max(0.28, 0.52 - (distance - 1) * 0.12),
        scale: Math.max(0.68, 0.72 * Math.pow(0.9, distance - 1)),
        blur: waiting ? distance === 1 ? 0.7 : 1.8 + (distance - 2) * 0.8 : 1.1 + (distance - 1) * 0.7,
        baseAlpha: waiting ? 0.46 : 0.36,
    };
}

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
            enterDuration: clamp__3(rawDuration * 0.45, 0.045, 0.06),
            exitDuration: clamp__3(rawDuration * 0.22, 0.03, 0.04),
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
const clamp__3 = (value, min, max) => Math.min(Math.max(value, min), max);
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

// ======== components/visualizer/monet/monetPortraitCrossfade ========
// src/components/visualizer/monet/monetPortraitCrossfade.ts
// The layer stack a Monet cover crossfade renders, kept pure so the ordering rules can be tested
// without a DOM.
//
// A cover swap is a stack rather than a pair because skipping tracks faster than one fade can
// finish is ordinary: with a pair the half-faded cover would have to be thrown away to make room,
// which shows the one underneath for a moment - the flash the crossfade exists to remove. Stacked,
// every new cover simply fades in over whatever is already there, and nothing is removed until the
// top one is fully opaque and hiding all of them.
/** Default crossfade length. Matches the Monet background layer's own image swap. */
const MONET_PORTRAIT_FADE_MS = 900;
/**
 * How deep the stack may get before the bottom is dropped.
 *
 * Only reached by holding skip down, and by then the bottom layers are completely covered by the
 * ones above; the cap is there so a stuck fade cannot grow the stack without bound.
 */
const MONET_PORTRAIT_MAX_LAYERS = 4;
/** The cover the stack is heading towards - the top layer, which is the one still fading in. */
const monetPortraitTargetSource = (layers) => (layers.length === 0 ? null : layers[layers.length - 1].src);
/**
 * Stacks a decoded cover on top. A repeat of the cover already on top is dropped: the effect that
 * decodes re-runs whenever the URL changes, and a URL that changes to itself is not a new cover.
 */
const pushMonetPortraitLayer = (layers, src, key) => {
    if (monetPortraitTargetSource(layers) === src) {
        return layers;
    }
    const next = [...layers, { key, src }];
    return next.length > MONET_PORTRAIT_MAX_LAYERS
        ? next.slice(next.length - MONET_PORTRAIT_MAX_LAYERS)
        : next;
};
/**
 * Drops everything below `key` once that layer has finished fading in.
 *
 * Keyed rather than "keep the last one" because the timer that calls this is armed against a
 * particular layer, and a cover that arrived while it was running has its own timer behind it.
 * A key no longer in the stack has already been settled past, so the stack is left alone.
 */
const settleMonetPortraitLayers = (layers, key) => {
    const index = layers.findIndex(layer => layer.key === key);
    return index <= 0 ? layers : layers.slice(index);
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

// ======== manual: manual/monet-engine-core.js ========
/* =========================================================================
   monet 渲染核心 —— Folia monet 组件树的无构建 DOM 忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     src/components/visualizer/monet/VisualizerMonet.tsx（海报构图 :139-539）
     src/components/visualizer/monet/MonetLyricsRail.tsx（竖向逐词轨道 :85-1075）
     src/components/visualizer/monet/MonetPortraitImage.tsx（封面 crossfade 栈）
     src/components/visualizer/monet/MonetFloatingDecor.tsx（漂浮粒子）
     src/components/visualizer/monet/AudioOverlay.tsx（底部音频条 canvas）
     src/components/visualizer/runtime.ts（当前行/最近完成行/预览行 :35-86）
     src/components/visualizer/backgrounds/monet/MonetBackgroundLayer.tsx
       （full-overlay 海报背景层 :21-179 + monetBackgroundDrift 轨道）
     src/utils/appPlaybackHelpers.ts:21（findLatestActiveLineIndex 宿主语义）
     src/types.ts:1003/1066（DEFAULT_MONET_BACKGROUND_TUNING / DEFAULT_MONET_TUNING）

   结构对应（React → 无构建 DOM）：
     VisualizerShell        → mn-shell（fontFamily/fontWeight inline，Shell:128-134）
     MonetBackgroundLayer   → mn-bg（full-overlay：drift wrapper(WAAPI 噪声轨道)
                               + 背景 crossfade(0.8s) + readability 渐变）
     MonetFloatingDecor     → mn-decor（10 粒子，无主题 lyricsIcons → 全樱花瓣，
                               mm Infinity keyframes）
     AnimatePresence(rail)  → 行池 diff（新行 initial→animate spring 入场，
                               移除行 exit 后延时移除，已有行目标变化 spring 续跑）
     MonetWordSweep         → mn-sweep（基底色 span + 逐帧派生的 mask/gradient/
                               glow 三层，currentTime MV 驱动——useTransform 等价）
     字幕轨（行内翻译）     → mn-track（active 行下方按 measured box 渲染，
                               stagger 0.04s）
     AudioOverlay           → mn-audio canvas（独立绘制函数，引擎主循环每帧驱动）
     introKey 重挂          → intro 重放（换歌/回绕 → 各元素 mm initial→animate；
                               相框列按 :322-330 注释刻意不重挂）

   动画全部经 mini-motion（framer 子集）驱动；spring 用 MONET_SCROLL_SPRING
   (142,28,0.82)/MONET_SCALE_SPRING(150,30,0.78) 原值。MineRadio 宿主差异
   （桥注明）：无 calm/chaotic 强度档（按 normal，相框漂浮分支保留但静止）；
   无主题词色表（wordColors=[]，着色回退 accent）；无编辑态拖拽持久化
   （hanger 编辑/拖拽/复位交互保留，offset 不落存储）。
   ========================================================================= */

/* ---------- tuning（types.ts:1003-1017 / :1066-1075 原值） ---------- */
var MONET_DEFAULT_TUNING = {
  keywordColoringEnabled: true,
  showDescription: true,
  showAudioVisualization: true,
  audioStyle: 'bar',
  fontScale: 1.2,
  portraitSource: 'cover',
  portraitOffsetX: 0,
  portraitStyle: 'square',
  showPortraitDragHanger: true
};

var MONET_DEFAULT_BACKGROUND_TUNING = {
  backgroundSource: 'cover-derived',
  backgroundLayout: 'full-overlay',
  backgroundBlurPx: 6,
  backgroundOverlayOpacity: 0.74,
  backgroundGrayscale: 0,
  backgroundSaturation: 1.05,
  backgroundWash: 0.34,
  backgroundHalfPaneOffsetX: 0,
  backgroundWashColorMode: 'theme',
  backgroundWashCustomColor: '#8fb7ff',
  backgroundDriftEnabled: true,
  backgroundDriftStrength: 0.5,
  backgroundStreaksEnabled: true
};

/* monetResolveTuning（entry.tsx:19-27 + MonetSettingsPanel :144-153 的归一化面） */
function monetResolveTuning(tuning, lyricsFontScale) {
  var t = tuning || {};
  var fontScale = (t.fontScale != null && isFinite(t.fontScale)) ? Math.min(1.5, Math.max(0.7, t.fontScale)) : MONET_DEFAULT_TUNING.fontScale;
  return {
    keywordColoringEnabled: (t.keywordColoringEnabled != null) ? !!t.keywordColoringEnabled : MONET_DEFAULT_TUNING.keywordColoringEnabled,
    showDescription: (t.showDescription != null) ? !!t.showDescription : MONET_DEFAULT_TUNING.showDescription,
    showAudioVisualization: (t.showAudioVisualization != null) ? !!t.showAudioVisualization : MONET_DEFAULT_TUNING.showAudioVisualization,
    audioStyle: t.audioStyle === 'line' ? 'line' : MONET_DEFAULT_TUNING.audioStyle,
    /* entry.tsx:26 —— fontScale × lyricsFontScale 在 renderer 边界相乘 */
    fontScale: fontScale * (lyricsFontScale != null ? lyricsFontScale : 1),
    portraitSource: t.portraitSource === 'custom' ? 'custom' : MONET_DEFAULT_TUNING.portraitSource,
    portraitOffsetX: (t.portraitOffsetX != null) ? t.portraitOffsetX : 0,
    portraitStyle: t.portraitStyle === 'rectangular' ? 'rectangular' : MONET_DEFAULT_TUNING.portraitStyle,
    showPortraitDragHanger: (t.showPortraitDragHanger != null) ? !!t.showPortraitDragHanger : MONET_DEFAULT_TUNING.showPortraitDragHanger
  };
}

/* findLatestActiveLineIndex（appPlaybackHelpers.ts:21-31）——Folia 宿主 currentLineIndex 权威语义 */
function monetFindLineIndexAtTime(lines, time) {
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
function monetGetRecentCompletedLine(lines, currentLineIndex, currentTime, getLineEndTime) {
  if (currentLineIndex !== -1 || !lines || lines.length === 0) return null;
  for (var i = lines.length - 1; i >= 0; i--) {
    if (currentTime > getLineEndTime(lines[i])) return lines[i];
  }
  return null;
}

/* getUpcomingLine / getUpcomingLines（runtime.ts:56-86） */
function monetGetUpcomingLine(lines, currentLineIndex, currentTime) {
  var activeLine = lines[currentLineIndex];
  if (activeLine) return lines[currentLineIndex + 1] || null;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].startTime > currentTime) return lines[i];
  }
  return null;
}

/* ---------- MonetLyricsRail 顶层（MonetLyricsRail.tsx:85-114 常量原值） ---------- */
var MONET_RAIL_WIDTH_FALLBACK_PX = 680;
var MONET_RAIL_HEIGHT_FALLBACK_PX = 340;
var MONET_SUBTITLE_TRACK_STAGGER_S = 0.04;
var MONET_ACTIVE_GAP_PX = 18;
var MONET_INACTIVE_GAP_PX = 14;
var MONET_RAIL_MIN_ROWS = 7;
var MONET_ACTIVE_GAP_RATIO = 0.49;
var MONET_INACTIVE_GAP_RATIO = 0.38;
var MONET_SCROLL_IDLE_RESET_MS = 1800;
var MONET_SCROLL_STEP_PX = 72;
var MONET_TOUCH_STEP_PX = 52;
var MONET_SCROLL_BEFORE = 4;
var MONET_SCROLL_AFTER = 4;
var MONET_LAYOUT_CACHE_LIMIT = 240;

/* MONET_SCROLL_TRANSITION（:106-111 原值）——CM_* 别名在闭包段注入晚于本段顶层
   执行（管线拼接顺序），故惰性单例：首次调用时 spring 原值已就绪 */
var MONET_SCROLL_TRANSITION = null;
function monetGetScrollTransition() {
  if (!MONET_SCROLL_TRANSITION) {
    MONET_SCROLL_TRANSITION = {
      y: { type: 'spring', stiffness: CM_MONET_SCROLL_SPRING.stiffness, damping: CM_MONET_SCROLL_SPRING.damping, mass: CM_MONET_SCROLL_SPRING.mass },
      scale: { type: 'spring', stiffness: CM_MONET_SCALE_SPRING.stiffness, damping: CM_MONET_SCALE_SPRING.damping, mass: CM_MONET_SCALE_SPRING.mass },
      opacity: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
      filter: { duration: 0.32, ease: [0.32, 0.72, 0, 1] }
    };
  }
  return MONET_SCROLL_TRANSITION;
}

function monetClamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function monetClampScrollSteps(steps) { return Math.max(-1, Math.min(1, steps)); }
function monetGetScrollDirection(delta) { return delta === 0 ? 0 : (delta > 0 ? 1 : -1); }

/* resolveMonetWordColor（MonetLyricsRail.tsx:116-126） */
function monetResolveWordColor(wordText, theme, fallbackColor, keywordColoringEnabled) {
  return CM_resolveWordColor(wordText, theme.wordColors, fallbackColor, {
    keywordColoringEnabled: keywordColoringEnabled !== false,
    cjkMatchMode: 'exact'
  });
}

/* MonetLineTone → resolveLineTone（:128-160 全量同构） */
function monetResolveLineTone(entry, theme, inactiveScale) {
  if (entry.status === 'active') {
    return {
      opacity: 1,
      scale: 1,
      blurPx: 0,
      baseColor: CM_colorWithAlpha(theme.primaryColor, 0.34),
      fontWeight: 600,
      zIndex: 4
    };
  }

  var distance = Math.max(Math.abs(entry.offset), 1);
  var isWaiting = entry.status === 'waiting';
  var scale = monetClamp(inactiveScale * Math.pow(0.9, distance - 1), 0.68, 0.92);

  return {
    opacity: isWaiting
      ? monetClamp(0.72 - (distance - 1) * 0.18, 0.36, 0.72)
      : monetClamp(0.52 - (distance - 1) * 0.12, 0.28, 0.52),
    scale: scale,
    blurPx: isWaiting
      ? (distance === 1 ? 0.7 : 1.8 + (distance - 2) * 0.8)
      : 1.1 + (distance - 1) * 0.7,
    baseColor: CM_colorWithAlpha(theme.primaryColor, isWaiting ? 0.46 : 0.36),
    fontWeight: 500,
    zIndex: isWaiting ? 3 - distance : 2 - distance
  };
}

/* resolveLineGap（:162-170） */
function monetResolveLineGap(previous, next, lyricFontPx) {
  return (previous.status === 'active' || next.status === 'active')
    ? Math.max(MONET_ACTIVE_GAP_PX, lyricFontPx * MONET_ACTIVE_GAP_RATIO)
    : Math.max(MONET_INACTIVE_GAP_PX, lyricFontPx * MONET_INACTIVE_GAP_RATIO);
}

/* resolveRailLineStatus（:172-180） */
function monetResolveRailLineStatus(lineIndex, activeLineIndex) {
  if (lineIndex === activeLineIndex) return 'active';
  if (activeLineIndex >= 0 && lineIndex < activeLineIndex) return 'passed';
  return 'waiting';
}

/* buildScrollableRailEntries（:182-208）——手动滚动的 ±4 窗口 */
function monetBuildScrollableRailEntries(lines, anchorIndex, activeLineIndex) {
  if (!lines || lines.length === 0) return [];
  var safeAnchorIndex = Math.round(monetClamp(anchorIndex, 0, lines.length - 1));
  var startIndex = Math.max(0, safeAnchorIndex - MONET_SCROLL_BEFORE);
  var endIndex = Math.min(lines.length - 1, safeAnchorIndex + MONET_SCROLL_AFTER);
  var nextEntries = [];
  for (var index = startIndex; index <= endIndex; index++) {
    var line = lines[index];
    nextEntries.push({
      key: index + '-' + line.startTime + '-' + line.fullText,
      line: line,
      index: index,
      offset: index - safeAnchorIndex,
      status: monetResolveRailLineStatus(index, activeLineIndex)
    });
  }
  return nextEntries;
}

/* trimOldestCacheEntry（:210-219） */
function monetTrimOldestCacheEntry(cache, limit) {
  if (cache.size < limit) return;
  var oldestKey = cache.keys().next().value;
  if (oldestKey) cache.delete(oldestKey);
}

/* getOrMeasureMonetLineLayout（:221-240） */
function monetGetOrMeasureLineLayout(cache, entry, inputs) {
  var cacheKey = CM_buildMonetLayoutCacheKey(entry, inputs);
  var cached = cache.get(cacheKey);
  if (cached) return cached;
  var layout = CM_measureMonetLineLayout({
    line: entry.line,
    status: entry.status,
    fontPx: inputs.fontPx,
    translationFontPx: inputs.translationFontPx,
    fontStack: inputs.fontStack,
    translationFontStack: inputs.translationFontStack,
    fontWeight: inputs.fontWeight,
    translationFontWeight: inputs.translationFontWeight,
    secondaryTranslationFontWeight: inputs.secondaryTranslationFontWeight,
    maxWidthPx: inputs.maxWidthPx,
    subtitleContentMode: inputs.subtitleContentMode
  });
  monetTrimOldestCacheEntry(cache, MONET_LAYOUT_CACHE_LIMIT);
  cache.set(cacheKey, layout);
  return layout;
}

/* buildPositionedEntries（:275-332 全量同构） */
function monetBuildPositionedEntries(entries, railSize, theme, lyricFontPx, inactiveFontPx, layoutInputs, glowBufferPx, layoutCache) {
  var railWidth = railSize.width || MONET_RAIL_WIDTH_FALLBACK_PX;
  var railHeight = railSize.height || MONET_RAIL_HEIGHT_FALLBACK_PX;
  var inactiveScale = monetClamp(inactiveFontPx / Math.max(lyricFontPx, 1), 0.72, 0.92);
  var contentWidthPx = Math.max(railWidth - glowBufferPx * 2, 0);
  var measureInputs = {};
  var k;
  for (k in layoutInputs) if (Object.prototype.hasOwnProperty.call(layoutInputs, k)) measureInputs[k] = layoutInputs[k];
  measureInputs.fontPx = lyricFontPx;
  measureInputs.maxWidthPx = contentWidthPx - 8;

  var measuredEntries = entries.map(function (entry) {
    var tone = monetResolveLineTone(entry, theme, inactiveScale);
    tone.fontWeight = layoutInputs.fontWeight;
    var layout = monetGetOrMeasureLineLayout(layoutCache, entry, measureInputs);
    return {
      key: entry.key, line: entry.line, index: entry.index, offset: entry.offset, status: entry.status,
      y: 0,
      tone: tone,
      layout: layout,
      scaledHeight: layout.visualHeightPx * tone.scale
    };
  });

  if (measuredEntries.length === 0) return [];

  var found = -1;
  for (var e = 0; e < measuredEntries.length; e++) {
    if (measuredEntries[e].offset === 0) { found = e; break; }
  }
  var anchorIndex = Math.max(0, found);
  var focusCenterY = railHeight * 0.46;
  measuredEntries[anchorIndex].y = focusCenterY - measuredEntries[anchorIndex].scaledHeight / 2;

  for (var index = anchorIndex + 1; index < measuredEntries.length; index++) {
    var previous = measuredEntries[index - 1];
    var current = measuredEntries[index];
    current.y = previous.y + previous.scaledHeight + monetResolveLineGap(previous, current, lyricFontPx);
  }

  for (var index2 = anchorIndex - 1; index2 >= 0; index2--) {
    var current2 = measuredEntries[index2];
    var next = measuredEntries[index2 + 1];
    current2.y = next.y - current2.scaledHeight - monetResolveLineGap(current2, next, lyricFontPx);
  }

  return measuredEntries;
}

/* getLineMask（:334-338） */
function monetGetLineMask(isClipped, fadePx) {
  return isClipped
    ? 'linear-gradient(180deg, black 0%, black calc(100% - ' + fadePx + 'px), transparent 100%)'
    : undefined;
}

/* getClippedTextMask（:346-357）——截断上下文行按最后可见文本行裁切 */
function monetGetClippedTextMask(isClipped, contentBottomPx, fadePx) {
  if (!isClipped) return undefined;
  var solidEndPx = Math.max(contentBottomPx - fadePx, 0);
  return 'linear-gradient(180deg, black 0px, black ' + solidEndPx + 'px, transparent ' + contentBottomPx + 'px)';
}

/* getEdgeFadeMask（:360-364）——超宽 token 右缘羽化 */
function monetGetEdgeFadeMask(isOverflowing, fadePx) {
  return isOverflowing
    ? 'linear-gradient(90deg, black 0%, black calc(100% - ' + fadePx + 'px), transparent 100%)'
    : undefined;
}

/* composeLineMasks（:367-384）——垂直裁切 fade 与水平边缘 fade 取交 */
function monetComposeLineMasks() {
  var layers = [];
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i]) layers.push(arguments[i]);
  }
  if (layers.length === 0) return undefined;
  var style = {
    WebkitMaskImage: layers.join(', '),
    maskImage: layers.join(', '),
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%'
  };
  if (layers.length > 1) {
    style.WebkitMaskComposite = 'source-in';
    style.maskComposite = 'intersect';
  }
  return style;
}

/* ---------- DOM 工具 ---------- */
function monetEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function monetEl(tag, className, styleText) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (styleText) el.style.cssText = styleText;
  return el;
}
function monetSetMask(el, maskStyle) {
  if (maskStyle) {
    el.style.webkitMaskImage = maskStyle.WebkitMaskImage;
    el.style.maskImage = maskStyle.maskImage;
    el.style.webkitMaskRepeat = 'no-repeat';
    el.style.maskRepeat = 'no-repeat';
    el.style.webkitMaskSize = '100% 100%';
    el.style.maskSize = '100% 100%';
    if (maskStyle.WebkitMaskComposite) {
      el.style.webkitMaskComposite = 'source-in';
      el.style.maskComposite = 'intersect';
    } else {
      el.style.webkitMaskComposite = '';
      el.style.maskComposite = '';
    }
  } else {
    el.style.webkitMaskImage = '';
    el.style.maskImage = '';
    el.style.webkitMaskComposite = '';
    el.style.maskComposite = '';
  }
}

/* ---------- MonetWordSweep（MonetLyricsRail.tsx:460-597 DOM 展开 + 逐帧派生） ----------
   framer 侧 wordStatus/wordProgress/fillWidth/maskImage/fillGradient/resolvedBaseColor/
   glowShadow 七个 useTransform 派生 MV 在此折成一个纯函数 updateSweep(t)——
   currentTime MV 每帧 emit（useMotionValueEvent 等价）后逐词重算并按值变化写 style。 */
function monetBuildSweep(text, startTime, endTime, graphemeTimings, lineRenderEndTime, lineStatus, wordColor, baseColor, fontPx, fontSpec, isChorus, fontsEpoch) {
  var graphemeOffsets = CM_measureMonetGraphemeOffsets(text, fontPx, fontSpec);

  var root = monetEl('span', null, 'position:relative;display:inline-block;white-space:pre-wrap;overflow-wrap:break-word;');

  /* 基底 span（:556-558 motion.span color=resolvedBaseColor textShadow=glowShadow） */
  var baseSpan = monetEl('span');
  baseSpan.textContent = text;
  root.appendChild(baseSpan);

  var sweep = {
    root: root, baseSpan: baseSpan, overlayOuter: null, overlayInner: null,
    text: text, startTime: startTime, endTime: endTime,
    graphemeTimings: graphemeTimings, lineRenderEndTime: lineRenderEndTime,
    lineStatus: lineStatus, lineActive: lineStatus === 'active',
    wordColor: wordColor, baseColor: baseColor,
    fontPx: fontPx, fontSpec: fontSpec, isChorus: !!isChorus,
    offsets: graphemeOffsets,
    lastColor: null, lastShadow: null, lastMask: null, lastGradient: null
  };
  if (sweep.lineActive) monetAttachSweepOverlay(sweep);
  return sweep;
}

/* overlay（:559-594 仅 isLineActive 时挂载；sweepOverflowPx = round(fontPx*0.5) :552）。
   行状态 waiting→active 迁移时按 framer 重渲染语义补挂（MonetWordSweep 条件渲染 :559）。 */
function monetAttachSweepOverlay(sweep) {
  if (sweep.overlayOuter) return;
  var sweepOverflowPx = Math.round(sweep.fontPx * 0.5);
  var overlayOuter = monetEl('span', null, 'pointer-events:none;position:absolute;left:0;right:0;display:block;white-space:pre-wrap;overflow-wrap:break-word;');
  overlayOuter.setAttribute('aria-hidden', 'true');
  overlayOuter.style.top = -sweepOverflowPx + 'px';
  overlayOuter.style.bottom = -sweepOverflowPx + 'px';
  overlayOuter.style.paddingTop = sweepOverflowPx + 'px';
  overlayOuter.style.paddingBottom = sweepOverflowPx + 'px';
  overlayOuter.style.boxSizing = 'border-box';
  overlayOuter.style.textShadow = 'none';
  overlayOuter.style.webkitMaskSize = '100% 100%';
  overlayOuter.style.maskSize = '100% 100%';
  overlayOuter.style.webkitMaskRepeat = 'no-repeat';
  overlayOuter.style.maskRepeat = 'no-repeat';
  var overlayInner = monetEl('span', null, 'display:block;white-space:pre-wrap;overflow-wrap:break-word;');
  overlayInner.style.marginTop = -sweepOverflowPx + 'px';
  overlayInner.style.paddingTop = sweepOverflowPx + 'px';
  overlayInner.style.paddingBottom = sweepOverflowPx + 'px';
  overlayInner.style.color = 'transparent';
  overlayInner.style.webkitTextFillColor = 'transparent';
  overlayInner.style.webkitBackgroundClip = 'text';
  overlayInner.style.backgroundClip = 'text';
  overlayInner.textContent = sweep.text;
  overlayOuter.appendChild(overlayInner);
  sweep.root.appendChild(overlayOuter);
  sweep.overlayOuter = overlayOuter;
  sweep.overlayInner = overlayInner;
  sweep.lastMask = null;
  sweep.lastGradient = null;
}

/* 七个 useTransform 的折叠求值（:500-545 公式原值） */
function monetUpdateSweep(sweep, latest) {
  var isLineActive = sweep.lineActive;
  var canRenderGlow = sweep.lineStatus === 'active' || sweep.lineStatus === 'passed';

  /* wordStatus（:500-502）+ resolvedBaseColor（:529-531） */
  var wordStatus = isLineActive ? CM_resolveMonetWordStatus(latest, sweep.startTime, sweep.endTime) : sweep.lineStatus;
  var color = ((isLineActive && wordStatus === 'passed') || sweep.lineStatus === 'passed')
    ? sweep.wordColor : sweep.baseColor;

  /* glowShadow（:533-545） */
  var shadow = 'none';
  if (canRenderGlow && latest > sweep.startTime) {
    var intensity = CM_resolveMonetGlow(latest, sweep.startTime, sweep.endTime, sweep.lineRenderEndTime);
    if (intensity > 0) {
      var radiusOne = Math.round(sweep.fontPx * (sweep.isChorus ? 0.45 : 0.28));
      var radiusTwo = Math.round(sweep.fontPx * (sweep.isChorus ? 0.90 : 0.65));
      var maxAlpha = sweep.isChorus ? 1.0 : 0.88;
      var glowColor = CM_mixColors(sweep.baseColor, sweep.wordColor, intensity, intensity * maxAlpha);
      shadow = '0 0 ' + radiusOne + 'px ' + glowColor + ', 0 0 ' + radiusTwo + 'px ' + glowColor;
    }
  }
  if (color !== sweep.lastColor) { sweep.baseSpan.style.color = color; sweep.lastColor = color; }
  if (shadow !== sweep.lastShadow) { sweep.baseSpan.style.textShadow = shadow; sweep.lastShadow = shadow; }

  /* overlay：maskImage（:514-522）+ fillGradient（:524-527） */
  if (sweep.overlayOuter) {
    var fillWidth = CM_resolveMonetFillWidth(latest, sweep.startTime, sweep.endTime, sweep.offsets, sweep.graphemeTimings);
    var edgeSoftness = CM_resolveMonetSweepEdgeSoftness(sweep.fontPx);
    var fullWidth = sweep.offsets[sweep.offsets.length - 1] || 0;
    var sweepEnd = CM_resolveMonetSweepEnd(fillWidth, fullWidth, edgeSoftness);
    var solidEnd = Math.max(sweepEnd - edgeSoftness, 0);
    var featherStart = Math.max(sweepEnd - edgeSoftness * 0.55, 0);
    var featherEnd = Math.max(sweepEnd, 0);
    var mask = 'linear-gradient(90deg, rgba(0, 0, 0, 1) 0px, rgba(0, 0, 0, 1) ' + solidEnd + 'px, rgba(0, 0, 0, 0.92) ' + featherStart + 'px, rgba(0, 0, 0, 0) ' + featherEnd + 'px, rgba(0, 0, 0, 0) 100%)';

    var progress;
    if (!isLineActive || latest <= sweep.startTime) progress = 0;
    else if (latest >= sweep.endTime) progress = 1;
    else progress = (latest - sweep.startTime) / Math.max(0.001, sweep.endTime - sweep.startTime);
    var fillColor = CM_mixColors(sweep.baseColor, sweep.wordColor, Math.min(progress, 1));
    var gradient = 'linear-gradient(90deg, ' + fillColor + ' 0%, ' + CM_colorWithAlpha(fillColor, 0.92) + ' 68%, ' + CM_colorWithAlpha(fillColor, 0.72) + ' 100%)';

    if (mask !== sweep.lastMask) {
      sweep.overlayOuter.style.webkitMaskImage = mask;
      sweep.overlayOuter.style.maskImage = mask;
      sweep.lastMask = mask;
    }
    if (gradient !== sweep.lastGradient) {
      sweep.overlayInner.style.backgroundImage = gradient;
      sweep.lastGradient = gradient;
    }
  }
}

/* ---------- MonetTimedTokenSpan（:386-458）——token 列表 → span 序列 ---------- */
function monetRenderTokens(container, entry, opts) {
  /* opts: { currentTime 最新值 t, accentColor, fontPx, fontStack, fontsEpoch,
             wordColorMatchers, isChorus, chorusAccentColor, renderStaticPassed,
             sweeps(收集数组), tone } */
  var tokens = CM_buildMonetDisplayTokens(entry.line);
  var wordColorRanges = CM_buildWordColorRangesFromMatchers(entry.line.fullText, opts.wordColorMatchers);
  var tokenColors = CM_resolveTokenColorMap(tokens, wordColorRanges);
  var resolvedAccentColor = (opts.isChorus && opts.chorusAccentColor)
    ? CM_mixColors(opts.accentColor, opts.chorusAccentColor, 0.48)
    : opts.accentColor;
  var lineRenderEndTime = CM_getLineRenderEndTime(entry.line);

  var wrap = monetEl('span', null, 'display:block;width:100%;min-width:0;max-width:100%;white-space:pre-wrap;overflow-wrap:break-word;');
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];
    if (opts.renderStaticPassed) {
      /* 手动滚动静态渲染（:421-431）：timed 词直接着 wordColor，无 sweep */
      var staticSpan = monetEl('span');
      staticSpan.style.color = token.timed
        ? (tokenColors.get(token.key) || resolvedAccentColor)
        : opts.tone.baseColor;
      staticSpan.textContent = token.text;
      wrap.appendChild(staticSpan);
      continue;
    }
    if (token.timed && token.startTime !== null && token.endTime !== null) {
      var sweep = monetBuildSweep(
        token.text, token.startTime, token.endTime, token.graphemeTimings,
        lineRenderEndTime, entry.status,
        tokenColors.get(token.key) || resolvedAccentColor,
        opts.tone.baseColor, opts.fontPx,
        opts.tone.fontWeight + ' ' + opts.fontPx + 'px ' + opts.fontStack,
        opts.isChorus, opts.fontsEpoch
      );
      wrap.appendChild(sweep.root);
      opts.sweeps.push(sweep);
      monetUpdateSweep(sweep, opts.t);
    } else {
      var plainSpan = monetEl('span');
      plainSpan.style.color = opts.tone.baseColor;
      plainSpan.textContent = token.text;
      wrap.appendChild(plainSpan);
    }
  }
  container.appendChild(wrap);
  return wrap;
}

/* ---------- 引擎实例 ---------- */

/**
 * MonetMonetEngine(opts) —— monet 模式渲染引擎（VisualizerMonet 组件树的宿主等价）
 * opts: { host, lines, currentTime(MV), theme, tuning?, lyricsFontScale?, coverUrl?,
 *         songTitle?, songArtist?, songAlbum?, seed?, audioPower(MV 0..255),
 *         audioBands {bass,lowMid,mid,vocal,treble(MV 0..255), spectrum(MV Uint8Array)} }
 * 返回 { destroy, setLines, setTheme, setCoverUrl, setMeta, setFontScale, setTuning }
 */
function MonetMonetEngine(opts) {
  var host = opts.host;
  var lines = opts.lines || [];
  var theme = opts.theme;
  var audioPower = opts.audioPower || { get: function () { return 0; } };
  var audioBands = opts.audioBands || null;
  var coverUrl = opts.coverUrl || null;
  var songTitle = opts.songTitle || '';
  var songArtist = opts.songArtist || '';
  var songAlbum = opts.songAlbum || '';
  var seed = opts.seed != null ? opts.seed : songTitle;
  var destroyed = false;
  var rafId = 0;
  var exitTimers = [];
  var settleTimer = 0;

  var lyricsFontScale = opts.lyricsFontScale != null ? opts.lyricsFontScale : 1;
  var subtitleFontScale = 1;
  var tuning = monetResolveTuning(opts.tuning, lyricsFontScale);

  var currentTime = opts.currentTime;
  var lastTime = null;
  var wasAtEnd = false;           /* :84-91 回绕检测 */
  var lastSongIdentifier = seed != null ? String(seed) : '';

  /* fontsEpoch（useFontsEpoch 等价：web font 就绪后测量缓存一次性失效） */
  var fontsEpoch = 0;
  var handledFontsEpoch = 0;
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready && document.fonts.ready.then) {
    document.fonts.ready.then(function () { fontsEpoch++; }).catch(function () { });
  }

  /* ---------- 尺寸派生（VisualizerMonet.tsx:139-151 原公式） ---------- */
  var shellWidth = 0;             /* useElementWidth 等价 */
  var largeScreenScale = 1;
  var lyricFontPx = 0, inactiveFontPx = 0, translationFontPx = 0;
  var rowMaxWidthPx = 0, portraitMaxPx = 0, portraitInnerMaxPx = 0;
  var titleMaxRem = '2.800', artistMaxRem = '1.800';
  var railSize = { width: 0, height: 0 };
  var layoutCache = new Map();
  /* 行池字体纪元：setTheme 换字体（fontStack 变）时推进，行池 diff 对
     poolEpoch 过期的 existing 行强制重建（buildLineEl 才写 inline
     font-family，updateLineEl 不重写字体——不重建则歌词行停留在旧字体） */
  var fontPoolEpoch = 0;
  var wordColorMatchers = [];

  function recomputeMetrics() {
    largeScreenScale = CM_resolveMonetLargeScreenScale(shellWidth > 0 ? shellWidth : undefined);
    lyricFontPx = CM_resolveClampFontPx(1.34, 2.75, 2.28) * tuning.fontScale * largeScreenScale;
    inactiveFontPx = CM_resolveClampFontPx(1.08, 2, 1.48) * tuning.fontScale * largeScreenScale;
    translationFontPx = CM_resolveClampFontPx(0.94, 1.28, 1.14) * tuning.fontScale * subtitleFontScale * largeScreenScale;
    rowMaxWidthPx = Math.round(CM_MONET_ROW_BASE_MAX_WIDTH_PX * largeScreenScale);
    portraitMaxPx = Math.round(CM_MONET_PORTRAIT_BASE_MAX_PX * largeScreenScale);
    portraitInnerMaxPx = Math.round(CM_MONET_PORTRAIT_INNER_BASE_MAX_PX * largeScreenScale);
    titleMaxRem = (2.8 * largeScreenScale).toFixed(3);
    artistMaxRem = (1.8 * largeScreenScale).toFixed(3);
    railMaxWidthPx = Math.round(CM_MONET_RAIL_BASE_MAX_WIDTH_PX * largeScreenScale);
    railMaxHeightPx = Math.round(Math.max(
      CM_MONET_RAIL_BASE_MAX_HEIGHT_PX * largeScreenScale,
      lyricFontPx * 1.18 * MONET_RAIL_MIN_ROWS
    ));
  }
  var railMaxWidthPx = 780, railMaxHeightPx = 520;
  recomputeMetrics();

  /* ---------- 壳（VisualizerShell :128-134 等价） ---------- */
  var shell = monetEl('div', 'mn-shell');
  shell.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;position:relative;font-family:' +
    CM_resolveThemeFontStack(theme) + ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) + ';';

  /* ---------- 海报背景层（MonetBackgroundLayer :21-179 full-overlay 分支） ---------- */
  var PIPELINE_DEBOUNCE_MS = 180;
  var bgOuter = monetEl('div', null, 'position:absolute;inset:0;z-index:0;overflow:hidden;');
  var bgDrift = monetEl('div');
  var bgLayers = [];              /* 背景栈（key=url crossfade） */
  var bgPipelineKey = null;
  var bgDebounceTimer = 0;
  var bgDriftAnim = null;
  bgOuter.appendChild(bgDrift);
  var bgReadability = monetEl('div');
  bgOuter.appendChild(bgReadability);
  shell.appendChild(bgOuter);

  function applyBgReadability() {
    /* readabilityGradient（:81-84） */
    bgReadability.style.cssText = 'position:absolute;inset:0;background:linear-gradient(90deg, ' +
      CM_colorWithAlpha(theme.backgroundColor, 0.18) + ' 0%, ' + CM_colorWithAlpha(theme.backgroundColor, 0.32) + ' 34%, ' +
      CM_colorWithAlpha(theme.backgroundColor, 0.66) + ' 70%, ' + CM_colorWithAlpha(theme.backgroundColor, 0.82) + ' 100%);';
  }

  function applyBgDrift() {
    /* useMonetBackgroundDrift（:30-53）：WAAPI 合成层轨道，不逐帧 JS */
    if (bgDriftAnim) { try { bgDriftAnim.cancel(); } catch (e) { } bgDriftAnim = null; }
    var strength = monetClamp(MONET_DEFAULT_BACKGROUND_TUNING.backgroundDriftStrength || 0, 0, 1);
    var enabled = MONET_DEFAULT_BACKGROUND_TUNING.backgroundDriftEnabled && strength > 0;
    bgDrift.style.willChange = enabled ? 'transform' : '';
    if (!enabled || typeof bgDrift.animate !== 'function') return;
    var track = CM_buildMonetDriftTrack(strength);
    bgDriftAnim = bgDrift.animate(track.keyframes, {
      duration: track.durationMs,
      iterations: Infinity,
      easing: 'linear'
    });
  }

  function crossfadeBackground(key, resolvedImage, blurStyle) {
    /* AnimatePresence key=url（:163-176）：新层 opacity 0→1 叠上，完成后移除旧层 */
    for (var i = 0; i < bgLayers.length; i++) {
      if (bgLayers[i].key === key) return;
    }
    var layer = monetEl('div');
    layer.style.cssText = 'position:absolute;inset:0;background-color:' + theme.backgroundColor +
      ';background-image:' + resolvedImage + ';background-size:cover;background-position:center;' + (blurStyle || '');
    layer.style.opacity = '0';
    bgDrift.appendChild(layer);
    bgLayers.push({ key: key, el: layer });
    mmApplyVariant(layer, {
      enter: { opacity: 1, transition: { duration: 0.8, ease: 'easeInOut' } }
    }, 'enter', null);
    while (bgLayers.length > 3) {
      var old = bgLayers.shift();
      if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
    }
  }

  function refreshBackground() {
    /* resolveSourceUrl（:55-63，cover-derived）+ 烘焙管线（MonetBackgroundLayer :95-125） */
    var sourceUrl = coverUrl || null;
    var resolvedImage;
    var fallbackGradient = 'linear-gradient(135deg, ' + CM_colorWithAlpha(theme.accentColor, 0.22) + ', ' +
      CM_colorWithAlpha(theme.backgroundColor, 0.96) + ' 50%, ' + CM_colorWithAlpha(theme.primaryColor, 0.18) + ')';
    var blurStyle = CM_checkCanvasFilterSupport() ? '' : 'filter:blur(' + MONET_DEFAULT_BACKGROUND_TUNING.backgroundBlurPx + 'px);-webkit-filter:blur(' + MONET_DEFAULT_BACKGROUND_TUNING.backgroundBlurPx + 'px);transform:scale(1.1) translateZ(0);';
    if (!sourceUrl) {
      crossfadeBackground('fallback', fallbackGradient, blurStyle);
      return;
    }
    resolvedImage = 'linear-gradient(135deg, ' + CM_colorWithAlpha(theme.accentColor, 0.2) + ', ' + CM_colorWithAlpha(theme.backgroundColor, 0.78) + '), url(' + sourceUrl + ')';
    crossfadeBackground(sourceUrl, resolvedImage, blurStyle);
    /* 烘焙 dataURL 就绪后覆盖（debounce 180ms 同 :21/:106-117） */
    var cacheKey = CM_getMonetBackgroundCacheKey({ coverUrl: coverUrl, monetBackgroundImage: null, theme: theme, tuning: MONET_DEFAULT_BACKGROUND_TUNING });
    if (cacheKey === bgPipelineKey) return;
    bgPipelineKey = cacheKey;
    if (bgDebounceTimer) clearTimeout(bgDebounceTimer);
    bgDebounceTimer = setTimeout(function () {
      CM_resolveMonetBackgroundDataUrl({ coverUrl: coverUrl, monetBackgroundImage: null, theme: theme, tuning: MONET_DEFAULT_BACKGROUND_TUNING })
        .then(function (url) {
          if (destroyed || !url) return;
          if (CM_getMonetBackgroundCacheKey({ coverUrl: coverUrl, monetBackgroundImage: null, theme: theme, tuning: MONET_DEFAULT_BACKGROUND_TUNING }) !== cacheKey) return;
          crossfadeBackground(url, 'url(' + url + ')', blurStyle);
        }).catch(function () { });
    }, PIPELINE_DEBOUNCE_MS);
  }

  /* ---------- 漂浮装饰（MonetFloatingDecor.tsx:45-137） ---------- */
  var decorWrap = null;
  var PARTICLE_COUNT = 10;
  function monetBuildParticles() {
    /* buildParticles（:48-65）：无主题 lyricsIcons → availableIcons=[] → 全樱花瓣 */
    var out = [];
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      out.push({
        id: i,
        x: ((i * 127 + 43) % 80) + 10,
        y: ((i * 211 + 17) % 80) + 5,
        size: 46 + ((i * 53) % 40),
        rotation: (i * 97) % 360,
        duration: 20 + ((i * 71) % 20),
        delay: ((i * 41) % 80) / 10,
        opacity: 0.06 + ((i * 31) % 12) / 100,
        reverse: i % 2 === 0
      });
    }
    return out;
  }
  function monetSakuraPetalSvg(size, color) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    var p1 = document.createElementNS(ns, 'path');
    p1.setAttribute('d', 'M12 3C14.5 5.5 16.8 9 16 14C15.2 19 13.5 21 12 21C10.5 21 8.8 19 8 14C7.2 9 9.5 5.5 12 3Z');
    p1.setAttribute('fill', color);
    var p2 = document.createElementNS(ns, 'path');
    p2.setAttribute('d', 'M12 6C12 6 11.3 10.5 11.3 14.5C11.3 17.5 12 20 12 20');
    p2.setAttribute('stroke', CM_colorWithAlpha(color, 0.35));
    p2.setAttribute('stroke-width', '0.45');
    p2.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p1);
    svg.appendChild(p2);
    return svg;
  }
  function buildDecor() {
    if (decorWrap && decorWrap.parentNode) decorWrap.parentNode.removeChild(decorWrap);
    decorWrap = monetEl('div', null, 'pointer-events:none;position:absolute;inset:0;z-index:5;overflow:hidden;');
    var petalColor = CM_colorWithAlpha(theme.secondaryColor, 0.55);
    var particles = monetBuildParticles();
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var holder = monetEl('div', null, 'position:absolute;');
      holder.style.left = p.x + '%';
      holder.style.top = p.y + '%';
      holder.appendChild(monetSakuraPetalSvg(p.size, petalColor));
      decorWrap.appendChild(holder);
      /* :113-130 keyframes（reverse 分支原值）+ duration/repeat Infinity/easeInOut/delay */
      mmApplyVariant(holder, {
        float: {
          y: p.reverse ? [-40, 60, -20, 40, -40] : [40, -60, 20, -40, 40],
          x: p.reverse ? [15, -25, 10, -20, 15] : [-15, 25, -10, 20, -15],
          rotate: [p.rotation, p.rotation + (p.reverse ? -120 : 120), p.rotation + (p.reverse ? -60 : 60), p.rotation + (p.reverse ? -180 : 180), p.rotation],
          opacity: [p.opacity * 0.6, p.opacity * 1.2, p.opacity, p.opacity * 1.3, p.opacity * 0.7],
          transition: { duration: p.duration, repeat: Infinity, ease: 'easeInOut', delay: p.delay }
        }
      }, 'float', null);
    }
  }

  /* ---------- 主构图（VisualizerMonet :192-536） ---------- */
  var main = monetEl('div');
  main.style.cssText = 'position:relative;z-index:10;display:flex;height:100%;width:100%;align-items:center;justify-content:center;overflow:hidden;';
  var row = monetEl('div');
  row.style.cssText = 'display:flex;height:100%;width:100%;flex-direction:row;align-items:center;overflow:hidden;';
  main.appendChild(row);
  shell.appendChild(main);

  /* 左文本列（:198 flex-1 flex-col justify-center px-5 py-5 sm:px-8 sm:py-6 lg:px-14 lg:py-8 2xl:px-20） */
  var textCol = monetEl('div');
  textCol.style.cssText = 'display:flex;min-height:0;min-width:0;flex:1 1 0%;flex-direction:column;justify-content:center;padding:20px;';

  /* 头部（:199-225） */
  var header = monetEl('div');
  header.style.cssText = 'margin-bottom:12px;';
  header.style.display = 'flex';
  header.style.flexDirection = 'column';
  header.style.rowGap = '6px';
  var artistEl = monetEl('div');
  artistEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:italic;color:' + CM_colorWithAlpha(theme.primaryColor, 0.96) + ';letter-spacing:0;';
  var ruleEl = monetEl('div');
  ruleEl.style.cssText = 'height:56px;width:1px;border-radius:9999px;transform-origin:center top;background:linear-gradient(180deg, ' + CM_colorWithAlpha(theme.primaryColor, 0.72) + ', transparent);';
  header.appendChild(artistEl);
  header.appendChild(ruleEl);
  textCol.appendChild(header);

  /* 标题区（:227-265） */
  var titleWrap = monetEl('div');
  var titleBox = monetEl('div');
  titleBox.style.cssText = 'margin-bottom:24px;display:flex;flex-direction:column;row-gap:4px;';
  var titleEl = monetEl('div');
  titleEl.style.cssText = 'font-weight:600;line-height:1.06;letter-spacing:0;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;padding-block:0.25em;margin-top:-0.25em;margin-bottom:-0.12em;';
  var albumEl = monetEl('div');
  albumEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;text-transform:uppercase;color:' + CM_colorWithAlpha(theme.secondaryColor, 0.84) + ';letter-spacing:0;';
  titleBox.appendChild(titleEl);
  titleBox.appendChild(albumEl);
  titleWrap.appendChild(titleBox);
  textCol.appendChild(titleWrap);

  /* 歌词轨道包裹（:267-294） */
  var railWrap = monetEl('div');
  var railEl = monetEl('div');
  railWrap.appendChild(railEl);
  textCol.appendChild(railWrap);

  /* 主题描述胶囊（:296-316） */
  var capsuleWrap = monetEl('div');
  capsuleWrap.style.cssText = 'margin-top:auto;padding-top:16px;';
  var capsuleInner = monetEl('div');
  capsuleInner.style.cssText = 'display:inline-flex;align-items:center;gap:12px;border-radius:9999px;border:1px solid ' + CM_colorWithAlpha(theme.primaryColor, 0.16) + ';background-color:' + CM_colorWithAlpha(theme.backgroundColor, 0.18) + ';color:' + CM_colorWithAlpha(theme.primaryColor, 0.9) + ';padding:8px 16px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);';
  var capsuleDot = monetEl('span');
  capsuleDot.style.cssText = 'height:10px;width:10px;border-radius:9999px;background-color:' + theme.accentColor + ';';
  var capsuleText = monetEl('span');
  capsuleText.style.cssText = 'font-size:12px;text-transform:uppercase;letter-spacing:0;';
  capsuleInner.appendChild(capsuleDot);
  capsuleInner.appendChild(capsuleText);
  capsuleWrap.appendChild(capsuleInner);
  textCol.appendChild(capsuleWrap);
  row.appendChild(textCol);

  /* ---------- 右侧相框列（:320-512；刻意不随 intro 重挂 :322-330） ---------- */
  var portraitCol = monetEl('div');
  portraitCol.style.cssText = 'display:none;min-width:0;align-items:center;justify-content:center;overflow:visible;padding:0 20px 0 12px;user-select:none;position:relative;';
  var portraitBBox = monetEl('div');
  portraitBBox.style.cssText = 'position:relative;width:100%;';
  portraitCol.appendChild(portraitBBox);

  /* 编辑态虚线框（:341-371） */
  var editBox = monetEl('div');
  editBox.style.cssText = 'position:absolute;border:2px dashed;border-radius:2.5rem;pointer-events:none;display:none;z-index:5;';
  var editReset = monetEl('button');
  editReset.type = 'button';
  editReset.setAttribute('title', '复位');
  editReset.style.cssText = 'position:absolute;top:-40px;right:0;pointer-events:auto;border-radius:9999px;padding:8px;font-size:12px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);transition:all .15s;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:500;border:1px solid;';
  editReset.textContent = '⟲';
  editBox.appendChild(editReset);
  portraitBBox.appendChild(editBox);

  /* 拖拽 motion 包装（:374-392 dragConstraints left -150 right 0 elastic 0） */
  var offsetX = 0;                 /* portraitOffsetX（MotionValue → 数值） */
  var dragWrap = monetEl('div');
  dragWrap.style.cssText = 'width:100%;position:relative;';
  portraitBBox.appendChild(dragWrap);

  /* 漂浮/静止 motion 包装（:393-418；normal → 静止分支） */
  var floatWrap = monetEl('div');
  floatWrap.style.cssText = 'position:relative;will-change:transform;transform:translateZ(0);';
  dragWrap.appendChild(floatWrap);

  /* 挂钉（:421-476 hanger） */
  var hangerEl = monetEl('div');
  hangerEl.style.cssText = 'position:absolute;top:-12px;right:32px;z-index:20;height:56px;width:12px;border-radius:9999px;cursor:pointer;transition:transform .2s;border-width:1.5px;border-style:solid;';
  var hangerHovered = false;
  hangerEl.addEventListener('mouseenter', function () { hangerHovered = true; applyHangerLook(); });
  hangerEl.addEventListener('mouseleave', function () { hangerHovered = false; applyHangerLook(); });
  floatWrap.appendChild(hangerEl);

  function applyHangerLook() {
    if (isEditingPosition) {
      hangerEl.style.animation = 'mnHangerEdit 1.5s ease-in-out infinite';
      hangerEl.style.touchAction = 'none';
    } else {
      hangerEl.style.animation = '';
      hangerEl.style.borderColor = CM_colorWithAlpha(theme.primaryColor, hangerHovered ? 0.36 : 0);
      hangerEl.style.boxShadow = '0 8px 18px ' + CM_colorWithAlpha('#000000', 0.24);
      hangerEl.style.touchAction = 'auto';
    }
  }
  /* :447-467 编辑态呼吸边框（keyframes 注入一次） */
  var hangerStyleEl = document.createElement('style');
  hangerStyleEl.textContent = '@keyframes mnHangerEdit{0%,100%{border-color:A1;box-shadow:B1}50%{border-color:A2;box-shadow:B2}}'
    .replace('A1', CM_colorWithAlpha(theme.accentColor, 0.3)).replace('A2', CM_colorWithAlpha(theme.accentColor, 1.0))
    .replace('B1', '0 0 2px ' + CM_colorWithAlpha(theme.accentColor, 0.2) + ', 0 8px 18px ' + CM_colorWithAlpha('#000000', 0.24))
    .replace('B2', '0 0 10px ' + CM_colorWithAlpha(theme.accentColor, 0.65) + ', 0 8px 18px ' + CM_colorWithAlpha('#000000', 0.24));
  document.head.appendChild(hangerStyleEl);

  /* 相框（:478-507 square / rectangular 两分支） */
  var frameEl = monetEl('div');
  floatWrap.appendChild(frameEl);

  /* MonetPortraitImage（:28-99 crossfade 层栈） */
  var portraitStack = monetEl('div');
  portraitStack.style.cssText = 'position:relative;height:100%;width:100%;';
  var portraitLayers = [];
  var portraitKeyCounter = 0;
  var portraitTargetUrl = null;

  function applyPortraitFrame() {
    frameEl.innerHTML = '';
    frameEl.appendChild(portraitStack);
    if (tuning.portraitStyle === 'square') {
      /* :480-488 aspect-square rounded-[2rem] */
      frameEl.style.cssText = 'position:relative;width:100%;aspect-ratio:1/1;overflow:hidden;border-radius:2rem;background-color:' + CM_colorWithAlpha(theme.primaryColor, 0.08) + ';';
      frameEl.style.boxShadow = '0 36px 80px ' + CM_colorWithAlpha(theme.backgroundColor, 0.45) + ', 0 20px 42px ' + CM_colorWithAlpha(theme.accentColor, 0.22) + ', 0 0 0 1px ' + CM_colorWithAlpha(theme.primaryColor, 0.06);
      floatWrap.style.width = '135.135%';
      floatWrap.style.marginLeft = '-35.135%';
    } else {
      /* :491-506 aspect-[0.74] p-1.5 rounded-[2.15rem] border + inner rounded-[1.85rem] */
      frameEl.style.cssText = 'position:relative;width:100%;aspect-ratio:0.74;padding:6px;border-radius:2.15rem;border:1px solid ' + CM_colorWithAlpha(theme.primaryColor, 0.1) + ';background-color:' + CM_colorWithAlpha(theme.backgroundColor, 0.15) + ';-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);box-shadow:0 24px 60px ' + CM_colorWithAlpha(theme.backgroundColor, 0.35) + ';';
      frameEl.style.boxShadow = '0 24px 60px ' + CM_colorWithAlpha(theme.backgroundColor, 0.35);
      var inner = monetEl('div');
      inner.style.cssText = 'width:100%;height:100%;overflow:hidden;border-radius:1.85rem;background-color:' + CM_colorWithAlpha(theme.primaryColor, 0.08) + ';';
      inner.appendChild(portraitStack);
      frameEl.appendChild(inner);
      floatWrap.style.width = '100%';
      floatWrap.style.marginLeft = '0%';
    }
    applyPortraitFrameGeometry();
  }

  function applyPortraitFrameGeometry() {
    portraitBBox.style.maxWidth = 'clamp(210px, 26vw, ' + portraitInnerMaxPx + 'px)';
    portraitCol.style.flex = '0 0 clamp(220px, 28vw, ' + portraitMaxPx + 'px)';
    /* headerMaxWidth（:158-162 原公式） */
    var bleed = tuning.portraitStyle === 'square'
      ? '0.35135 * clamp(210px, 26vw, ' + portraitInnerMaxPx + 'px) - 3rem'
      : '0px';
    var portraitShiftPx = Math.abs(Math.min(0, tuning.portraitOffsetX || 0));
    header.style.maxWidth = 'max(12rem, calc(100% - max(0px, calc(' + bleed + ')) - ' + portraitShiftPx + 'px))';
    titleWrap.style.maxWidth = header.style.maxWidth;
    applyEditBoxGeometry();
  }

  function applyEditBoxGeometry() {
    if (!isEditingPosition) { editBox.style.display = 'none'; return; }
    editBox.style.display = 'block';
    editBox.style.borderColor = CM_colorWithAlpha(theme.primaryColor, 0.24);
    editBox.style.left = tuning.portraitStyle === 'square' ? 'calc(-35.135% - 150px)' : '-150px';
    editBox.style.right = '0';
    editBox.style.top = '-12px';
    editBox.style.bottom = '-12px';
    editReset.style.backgroundColor = CM_colorWithAlpha(theme.backgroundColor, 0.86);
    editReset.style.color = theme.primaryColor;
    editReset.style.border = '1px solid ' + CM_colorWithAlpha(theme.primaryColor, 0.16);
    editReset.style.boxShadow = '0 4px 12px ' + CM_colorWithAlpha('#000000', 0.12);
  }

  var isEditingPosition = false;
  var isDragging = false;
  hangerEl.addEventListener('click', function (e) {
    e.stopPropagation();
    if (isDragging) return;
    if (!isEditingPosition) {
      isEditingPosition = true;
      applyEditBoxGeometry();
      applyHangerLook();
    } else {
      tuning.portraitOffsetX = Math.round(offsetX);
      isEditingPosition = false;
      applyEditBoxGeometry();
      applyHangerLook();
    }
  });
  editReset.addEventListener('click', function (e) {
    e.stopPropagation();
    offsetX = 0;
    dragWrap.style.transform = '';
  });
  /* drag（:374-391 drag='x' constraints left -150 right 0 elastic 0 momentum false） */
  hangerEl.addEventListener('pointerdown', function (e) {
    if (!isEditingPosition) return;
    e.preventDefault();
    var startX = e.clientX;
    var startOffset = offsetX;
    isDragging = true;
    function onMove(ev) {
      offsetX = monetClamp(startOffset + (ev.clientX - startX), -150, 0);
      dragWrap.style.transform = 'translateX(' + offsetX + 'px)';
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setTimeout(function () { isDragging = false; }, 50);  /* :385-390 延时复位防误触保存 */
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  function setPortraitTarget(url) {
    portraitTargetUrl = url || null;
    /* decode 后入栈（:32-61）：decode 失败静默保持旧封面 */
    if (!portraitTargetUrl) {
      for (var i = 0; i < portraitLayers.length; i++) {
        mmApplyVariant(portraitLayers[i].el, {
          fade: { opacity: 0, transition: { duration: CM_MONET_PORTRAIT_FADE_MS / 1000, ease: 'easeInOut' } }
        }, 'fade', null);
      }
      return;
    }
    var loader = new Image();
    loader.decoding = 'async';
    loader.src = portraitTargetUrl;
    var stackIt = function () {
      if (destroyed) return;
      portraitKeyCounter++;
      var key = 'monet-portrait-' + portraitKeyCounter;
      var currentKeys = portraitLayers.map(function (l) { return { key: l.key, src: l.src }; });
      var nextKeys = CM_pushMonetPortraitLayer(currentKeys, portraitTargetUrl, key);
      if (nextKeys === currentKeys) return;       /* :37-44 顶层重复 → push 原样返回 */
      /* 差异落地：新增层建 img（opacity 0 → fadeMs 动画），settle 定时器按 :66-76 */
      var existing = {};
      for (var e2 = 0; e2 < portraitLayers.length; e2++) existing[portraitLayers[e2].key] = portraitLayers[e2];
      var nextSet = [];
      for (var n = 0; n < nextKeys.length; n++) {
        var nk = nextKeys[n];
        if (existing[nk.key]) { nextSet.push(existing[nk.key]); continue; }
        var img = document.createElement('img');
        img.src = nk.src;
        img.decoding = 'async';
        img.alt = '';
        img.draggable = false;
        img.setAttribute('data-monet-portrait-image', '');
        img.style.cssText = 'position:absolute;inset:0;height:100%;width:100%;object-fit:cover;opacity:0;';
        portraitStack.appendChild(img);
        var rec = { key: nk.key, src: nk.src, el: img };
        nextSet.push(rec);
        mmApplyVariant(img, {
          fade: { opacity: 1, transition: { duration: CM_MONET_PORTRAIT_FADE_MS / 1000, ease: 'easeInOut' } }
        }, 'fade', null);
      }
      portraitLayers = nextSet;
      if (portraitLayers.length > 1) {
        var settlingKey = portraitLayers[portraitLayers.length - 1].key;
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(function () {
          if (destroyed) return;
          var settled = CM_settleMonetPortraitLayers(portraitLayers.map(function (l) { return { key: l.key, src: l.src }; }), settlingKey);
          var keep = {};
          for (var k3 = 0; k3 < settled.length; k3++) keep[settled[k3].key] = true;
          portraitLayers = portraitLayers.filter(function (l) {
            if (keep[l.key]) return true;
            if (l.el.parentNode) l.el.parentNode.removeChild(l.el);
            return false;
          });
        }, CM_MONET_PORTRAIT_FADE_MS);
      }
    };
    if (typeof loader.decode === 'function') loader.decode().then(stackIt, function () { });
    else loader.onload = stackIt;
  }
  row.appendChild(portraitCol);

  /* ---------- 底部音频条容器（:516-535） ---------- */
  var audioWrap = monetEl('div');
  audioWrap.style.cssText = 'position:absolute;bottom:0;left:0;z-index:20;height:40px;overflow:hidden;padding:0 20px;';
  audioWrap.style.width = 'min(450px, 55vw)';
  var audioCanvas = monetEl('canvas');
  audioCanvas.style.cssText = 'height:100%;width:100%;';
  audioWrap.appendChild(audioCanvas);
  shell.appendChild(audioWrap);

  host.appendChild(shell);

  /* ---------- AudioOverlay（AudioOverlay.tsx:16-153 常量 + 绘制原值） ---------- */
  var MONET_AUDIO_BAR_COUNT = 72;
  var MONET_AUDIO_MIN_RAW_BIN = 6;
  var audioCanvasW = 0, audioCanvasH = 0;
  var audioCtx2d = audioCanvas.getContext('2d');

  function monetBuildSpectrumAnchors(bands) {
    var bass = bands[0], lowMid = bands[1], mid = bands[2], vocal = bands[3], treble = bands[4];
    return [
      bass * 1.08,
      bass * 0.96,
      bass * 0.74 + lowMid * 0.26,
      lowMid,
      lowMid * 0.58 + mid * 0.42,
      mid,
      mid * 0.42 + vocal * 0.58,
      vocal,
      vocal * 0.48 + treble * 0.52,
      treble,
      treble * 0.82
    ].map(function (value) { return Math.max(0, Math.min(1, value)); });
  }

  function monetSampleSpectrumProfile(bands, normalizedIndex) {
    var clampedIndex = Math.max(0, Math.min(1, normalizedIndex));
    var anchors = monetBuildSpectrumAnchors(bands);
    var logIndex = Math.log10(1 + clampedIndex * 9);
    var scaledIndex = logIndex * (anchors.length - 1);
    var lowerIndex = Math.floor(scaledIndex);
    var upperIndex = Math.min(lowerIndex + 1, anchors.length - 1);
    var interpolation = scaledIndex - lowerIndex;
    var lowerValue = anchors[lowerIndex] || 0;
    var upperValue = anchors[upperIndex] != null ? anchors[upperIndex] : lowerValue;
    var interpolated = lowerValue + (upperValue - lowerValue) * interpolation;
    var contour = 0.92 +
      Math.sin(clampedIndex * Math.PI * 3.4 - Math.PI * 0.3) * 0.08 +
      Math.sin(clampedIndex * Math.PI * 9.2 + Math.PI * 0.2) * 0.035;
    return Math.max(0, Math.min(1, interpolated * contour));
  }

  function monetSampleRawSpectrumProfile(rawSpectrum, normalizedIndex) {
    if (!rawSpectrum || rawSpectrum.length <= MONET_AUDIO_MIN_RAW_BIN) return 0;
    var clampedIndex = Math.max(0, Math.min(1, normalizedIndex));
    var usableBinCount = Math.max(1, rawSpectrum.length - MONET_AUDIO_MIN_RAW_BIN);
    var mappedIndex = Math.expm1(clampedIndex * Math.log(usableBinCount + 1));
    var centerIndex = MONET_AUDIO_MIN_RAW_BIN + mappedIndex;
    var edgeSoftness = 1 - Math.abs(clampedIndex - 0.5) * 2;
    var windowRadius = Math.max(1, Math.round(5 - edgeSoftness * 3));
    var start = Math.max(MONET_AUDIO_MIN_RAW_BIN, Math.floor(centerIndex - windowRadius));
    var end = Math.min(rawSpectrum.length - 1, Math.ceil(centerIndex + windowRadius));
    var weightedSum = 0, weightTotal = 0;
    for (var index = start; index <= end; index++) {
      var distance = Math.abs(index - centerIndex);
      var weight = Math.max(0.1, 1 - distance / (windowRadius + 1));
      weightedSum += rawSpectrum[index] * weight;
      weightTotal += weight;
    }
    var averaged = weightTotal > 0 ? weightedSum / weightTotal : 0;
    var noiseFloor = 16 + (1 - clampedIndex) * 12;
    var normalized = Math.max(0, Math.min(1, (averaged - noiseFloor) / (255 - noiseFloor)));
    var power = 1.8 + (1 - clampedIndex) * 0.4;
    var processed = Math.pow(normalized, power);
    var lowFrequencyCompensation = 0.52 + clampedIndex * 0.62;
    var presenceLift = 0.92 + Math.sqrt(clampedIndex) * 0.14;
    return Math.max(0, Math.min(1, processed * lowFrequencyCompensation * presenceLift));
  }

  function monetResizeAudioCanvas() {
    if (!audioCtx2d) return;
    var rect = audioCanvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var nextWidth = Math.max(1, Math.floor(rect.width * dpr));
    var nextHeight = Math.max(1, Math.floor(rect.height * dpr));
    audioCanvasW = rect.width;
    audioCanvasH = rect.height;
    if (audioCanvas.width !== nextWidth || audioCanvas.height !== nextHeight) {
      audioCanvas.width = nextWidth;
      audioCanvas.height = nextHeight;
    }
    audioCtx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function monetAudioCurvePath(context, points) {
    if (points.length === 0) return;
    context.moveTo(points[0].x, points[0].y);
    for (var i = 0; i < points.length - 1; i++) {
      var xc = (points[i].x + points[i + 1].x) / 2;
      var yc = (points[i].y + points[i + 1].y) / 2;
      context.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    context.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }

  function drawAudio() {
    if (!audioCtx2d || audioCanvasW <= 0 || audioCanvasH <= 0) return;
    var context = audioCtx2d;
    var width = audioCanvasW, height = audioCanvasH;
    context.clearRect(0, 0, width, height);
    var raw = audioBands && audioBands.spectrum ? audioBands.spectrum.get() : null;
    if (!(raw instanceof Uint8Array)) raw = null;
    var band5 = [
      (audioBands && audioBands.bass ? audioBands.bass.get() : 0) / 255,
      (audioBands && audioBands.lowMid ? audioBands.lowMid.get() : 0) / 255,
      (audioBands && audioBands.mid ? audioBands.mid.get() : 0) / 255,
      (audioBands && audioBands.vocal ? audioBands.vocal.get() : 0) / 255,
      (audioBands && audioBands.treble ? audioBands.treble.get() : 0) / 255
    ];
    var hasRawSpectrum = raw && raw.length > MONET_AUDIO_MIN_RAW_BIN;
    var energy = Math.min(1, Math.max(0.08, (audioPower.get() || 0) / 255));
    var primaryInk = CM_colorWithAlpha(theme.primaryColor, 0.94);
    var softInk = CM_colorWithAlpha(theme.primaryColor, 0.72);
    var gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, softInk);
    gradient.addColorStop(0.5, primaryInk);
    gradient.addColorStop(1, softInk);
    context.fillStyle = gradient;
    context.strokeStyle = gradient;
    context.lineWidth = 1.5;
    context.lineCap = 'round';
    var now = performance.now();

    if (tuning.audioStyle === 'line') {
      /* :223-269 line 模式原值 */
      var points = [];
      for (var index = 0; index < MONET_AUDIO_BAR_COUNT; index++) {
        var x = (index / (MONET_AUDIO_BAR_COUNT - 1)) * width;
        var spectrumIndex = index / (MONET_AUDIO_BAR_COUNT - 1);
        var band = hasRawSpectrum ? monetSampleRawSpectrumProfile(raw, spectrumIndex) : monetSampleSpectrumProfile(band5, spectrumIndex);
        var wave = Math.sin(index * 0.24 + now * 0.004) * 0.08 + Math.sin(index * 0.68 + now * 0.0028) * 0.05;
        var envelope = Math.sin(spectrumIndex * Math.PI);
        var amplitude = energy * 0.04 + band * 0.8 + wave * 0.04;
        var y = height - Math.max(0, height * amplitude * envelope);
        points.push({ x: x, y: y });
      }
      context.beginPath();
      monetAudioCurvePath(context, points);
      context.lineTo(width, height);
      context.lineTo(0, height);
      context.closePath();
      var fillGradient = context.createLinearGradient(0, 0, 0, height);
      fillGradient.addColorStop(0, CM_colorWithAlpha(theme.primaryColor, 0.24));
      fillGradient.addColorStop(1, CM_colorWithAlpha(theme.primaryColor, 0.0));
      context.fillStyle = fillGradient;
      context.fill();
      context.beginPath();
      monetAudioCurvePath(context, points);
      context.strokeStyle = gradient;
      context.lineWidth = 2.0;
      context.stroke();
    } else {
      /* :271-284 bar 模式原值 */
      var gap = width / MONET_AUDIO_BAR_COUNT;
      for (var i2 = 0; i2 < MONET_AUDIO_BAR_COUNT; i2++) {
        var spectrumIndex2 = i2 / (MONET_AUDIO_BAR_COUNT - 1);
        var band2 = hasRawSpectrum ? monetSampleRawSpectrumProfile(raw, spectrumIndex2) : monetSampleSpectrumProfile(band5, spectrumIndex2);
        var pulse = Math.sin(i2 * 0.45 + now * 0.006) * 0.5 + 0.5;
        var envelope2 = Math.sin(spectrumIndex2 * Math.PI);
        var barHeight = height * (0.02 + (energy * 0.04 + band2 * 0.82 + pulse * 0.02) * envelope2);
        var x2 = i2 * gap + gap * 0.14;
        context.fillRect(x2, height - barHeight, Math.max(1.35, gap * 0.34), barHeight);
      }
    }
  }

  /* ---------- 歌词轨道运行时（MonetLyricsRail :782-1075 状态） ---------- */
  var lineRecs = new Map();        /* key → { root, textEl, sweeps, trackWrap, entry, applied } */
  var subtitleContentMode = 'translation';
  var manualScrollAnchorIndex = null;
  var manualScrollResetTimer = 0;
  var wheelAccumulator = 0, wheelDirection = 0;
  var touchLastY = null, touchAccumulator = 0, touchDirection = 0;
  var lastEntriesKey = '';
  var fontStack = CM_resolveThemeFontStack(theme);
  var translationFontStack = CM_resolveThemeTranslationFontStack(theme);
  var lyricFontWeight = CM_resolveThemeFontWeight(theme, 600);
  var translationFontWeight = CM_resolveThemeFontWeight(theme, 500);
  var secondaryTranslationFontWeight = CM_resolveThemeFontWeight(theme, CM_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK);

  function applyRailContainerStyle() {
    var glowBufferPx = Math.round(lyricFontPx * 1.2);
    railEl.style.cssText =
      'position:relative;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:none;' +
      'height:clamp(280px, 52vh, ' + railMaxHeightPx + 'px);' +
      'max-width:' + railMaxWidthPx + 'px;' +
      'margin-left:-' + glowBufferPx + 'px;margin-right:-' + glowBufferPx + 'px;' +
      'padding-left:' + glowBufferPx + 'px;padding-right:' + glowBufferPx + 'px;';
    railEl.style.webkitMaskImage = 'linear-gradient(to bottom, transparent 0%, black 11%, black 88%, transparent 100%)';
    railEl.style.maskImage = 'linear-gradient(to bottom, transparent 0%, black 11%, black 88%, transparent 100%)';
  }

  /* 布局输入包（:836-866 useMemo deps 的运行时等价） */
  function railLayoutInputs() {
    return {
      translationFontPx: translationFontPx,
      fontStack: fontStack,
      translationFontStack: translationFontStack,
      fontWeight: lyricFontWeight,
      translationFontWeight: translationFontWeight,
      secondaryTranslationFontWeight: secondaryTranslationFontWeight,
      subtitleContentMode: subtitleContentMode
    };
  }

  /* 单行 DOM（MonetRailLine :644-783）；noEnter：重建行不重播进场（framer 复用语义） */
  function buildLineEl(pentry, glowBufferPx, vGlowBufferPx, canSeek, disableEntryMotion, renderStaticPassed, nowT, noEnter) {
    var entry = pentry;
    var initialOffset = entry.offset >= 0 ? 34 : -34;
    var exitOffset = entry.status === 'passed' || entry.offset < 0 ? -38 : 38;
    var isActiveLine = entry.status === 'active';

    var root = monetEl('div');
    root.style.cssText = 'position:absolute;top:0;min-width:0;will-change:transform;' +
      'left:' + glowBufferPx + 'px;right:' + glowBufferPx + 'px;' +
      'height:' + entry.layout.visualHeightPx + 'px;transform-origin:left top;z-index:' + entry.tone.zIndex + ';' +
      (canSeek ? 'cursor:pointer;' : '');
    if (canSeek) {
      root.addEventListener('click', function () {
        if (typeof onLyricLineSeek === 'function') onLyricLineSeek(entry.line.startTime);
      });
    }

    /* 副歌光斑（:684-698） */
    var chorusEl = null;
    if (entry.line.isChorus) {
      chorusEl = monetEl('div');
      chorusEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:-10;border-radius:16px;filter:blur(10px);' +
        'background:radial-gradient(circle at 50% 45%, ' + CM_colorWithAlpha(theme.accentColor, 0.14) + ' 0%, ' + CM_colorWithAlpha(theme.accentColor, 0.04) + ' 55%, transparent 82%);';
      chorusEl.style.opacity = '0';
      root.appendChild(chorusEl);
    }

    /* 文本容器（:699-723） */
    var textEl = monetEl('div');
    textEl.style.cssText = 'min-width:0;overflow:hidden;pointer-events:none;box-sizing:border-box;' +
      'margin-left:-' + glowBufferPx + 'px;margin-right:-' + glowBufferPx + 'px;' +
      'padding-left:' + glowBufferPx + 'px;padding-right:' + glowBufferPx + 'px;' +
      'margin-top:-' + vGlowBufferPx + 'px;margin-bottom:-' + vGlowBufferPx + 'px;' +
      'padding-top:' + (entry.layout.textPaddingTopPx + vGlowBufferPx) + 'px;' +
      'padding-bottom:' + (entry.layout.textPaddingBottomPx + vGlowBufferPx) + 'px;' +
      'font-family:' + fontStack + ';font-size:' + lyricFontPx + 'px;font-weight:' + entry.tone.fontWeight + ';' +
      'line-height:' + entry.layout.lineHeightPx + 'px;letter-spacing:0;';
    if (!isActiveLine) {
      textEl.style.height = (entry.layout.textHeightPx + vGlowBufferPx * 2) + 'px';
    } else {
      textEl.style.height = '';
    }
    var fadePx = Math.max(lyricFontPx * 0.55, 12);
    var textMask = isActiveLine ? undefined : monetGetClippedTextMask(
      entry.layout.isTextClipped,
      vGlowBufferPx + entry.layout.textPaddingTopPx + entry.layout.textContentHeightPx,
      fadePx
    );
    var textEdgeMask = monetGetEdgeFadeMask(entry.layout.isTextOverflowingWidth, Math.max(lyricFontPx * 0.9, 24));
    monetSetMask(textEl, monetComposeLineMasks(textMask, textEdgeMask));
    textEl.style.textShadow = entry.status === 'active'
      ? '0 14px 34px ' + CM_colorWithAlpha(theme.backgroundColor, 0.22)
      : 'none';
    root.appendChild(textEl);

    var rec = {
      root: root, textEl: textEl, chorusEl: chorusEl,
      sweeps: [], trackWrap: null, trackSignature: '',
      entry: entry,
      applied: null,       /* 已应用的 animate 目标（避免重复重启动画） */
      staticRendered: !!renderStaticPassed,
      poolEpoch: fontPoolEpoch,   /* 创建时的字体纪元（行池 diff 用） */
      exitOffset: exitOffset
    };

    /* token 渲染（MonetTimedTokenSpan） */
    monetRenderTokens(textEl, entry, {
      t: nowT,
      accentColor: CM_colorWithAlpha(theme.primaryColor, 0.98),
      fontPx: lyricFontPx,
      fontStack: fontStack,
      fontsEpoch: fontsEpoch,
      wordColorMatchers: wordColorMatchers,
      isChorus: !!entry.line.isChorus,
      chorusAccentColor: theme.accentColor,
      renderStaticPassed: renderStaticPassed,
      sweeps: rec.sweeps,
      tone: entry.tone
    });

    /* 字幕轨（:739-777） */
    buildSubtitleTracks(rec, entry, glowBufferPx);

    /* 行进出动画（:656-675 initial/animate/exit + MONET_SCROLL_TRANSITION） */
    if (noEnter) {
      mmSetInitial(root, { opacity: entry.tone.opacity, y: entry.y, scale: entry.tone.scale, filter: 'blur(' + entry.tone.blurPx + 'px)' }, null);
      applyLineAnimate(rec, entry, true);
    } else if (!disableEntryMotion) {
      mmSetInitial(root, {
        opacity: 0,
        y: entry.y + initialOffset,
        scale: entry.tone.scale * 0.98,
        filter: 'blur(5px)'
      }, null);
    } else {
      mmSetInitial(root, { opacity: entry.tone.opacity, y: entry.y, scale: entry.tone.scale, filter: 'blur(' + entry.tone.blurPx + 'px)' }, null);
    }
    applyLineAnimate(rec, entry, false);

    if (chorusEl) {
      mmApplyVariant(chorusEl, {
        st: {
          opacity: entry.status === 'active' ? 1 : 0,
          scale: entry.status === 'active' ? 1.02 : 0.96,
          transition: { duration: 0.45, ease: 'easeOut' }
        }
      }, 'st', null);
    }
    return rec;
  }

  /* 字幕轨（:739-777：每轨 initial {opacity 0,y 8} → animate {1,0}，stagger 0.04s） */
  function buildSubtitleTracks(rec, entry, glowBufferPx) {
    if (rec.trackWrap && rec.trackWrap.parentNode) rec.trackWrap.parentNode.removeChild(rec.trackWrap);
    rec.trackWrap = null;
    rec.trackSignature = '';
    var tracks = entry.layout.subtitleTracks || [];
    if (!tracks.length) return;
    var signature = tracks.map(function (t) { return t.role + ':' + t.text + ':' + t.lineCount; }).join('|');
    rec.trackSignature = signature;
    var wrap = monetEl('div');
    for (var i = 0; i < tracks.length; i++) {
      var track = tracks[i];
      var trackMask = monetGetLineMask(track.isClipped, Math.max(track.fontPx * 0.65, 10));
      var el = monetEl('div');
      el.style.cssText = 'min-width:0;overflow:hidden;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;' +
        'margin-left:-' + glowBufferPx + 'px;margin-right:-' + glowBufferPx + 'px;' +
        'padding-left:' + glowBufferPx + 'px;padding-right:' + glowBufferPx + 'px;' +
        'height:' + track.heightPx + 'px;padding-top:' + track.paddingTopPx + 'px;padding-bottom:' + track.paddingBottomPx + 'px;' +
        'color:' + CM_colorWithAlpha(theme.primaryColor, i > 0 ? 0.68 * CM_SECONDARY_TRACK_OPACITY : 0.68) + ';' +
        'font-family:' + translationFontStack + ';font-size:' + track.fontPx + 'px;font-weight:' + track.fontWeight + ';' +
        'line-height:' + track.lineHeightPx + 'px;letter-spacing:0;';
      monetSetMask(el, trackMask ? { WebkitMaskImage: trackMask, maskImage: trackMask } : undefined);
      el.textContent = track.text;
      /* initial {opacity:0, y:8}（:748）先行，再播 animate（:749-750） */
      el.style.opacity = '0';
      wrap.appendChild(el);
      mmSetInitial(el, { y: 8 }, null);
      mmApplyVariant(el, {
        st: {
          opacity: 1, y: 0,
          transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1], delay: i * MONET_SUBTITLE_TRACK_STAGGER_S }
        }
      }, 'st', null);
    }
    rec.root.appendChild(wrap);
    rec.trackWrap = wrap;
  }

  /* animate 目标应用（y/tone 变化 → spring 续跑；与上次相同则跳过） */
  function applyLineAnimate(rec, pentry, force) {
    var target = {
      opacity: pentry.tone.opacity,
      y: pentry.y,
      scale: pentry.tone.scale,
      filter: 'blur(' + pentry.tone.blurPx + 'px)'
    };
    var sig = [target.opacity, target.y, target.scale, target.filter, pentry.tone.zIndex].join('|');
    if (!force && rec.applied === sig) return;
    rec.applied = sig;
    rec.root.style.zIndex = pentry.tone.zIndex;
    mmApplyVariant(rec.root, { st: Object.assign({}, target, { transition: monetGetScrollTransition() }) }, 'st', null);
  }

  /* 更新已有行（status/几何/subtitle 变化 → 就地更新） */
  function updateLineEl(rec, pentry, glowBufferPx, vGlowBufferPx, nowT) {
    var prevStatus = rec.entry.status;
    var statusChanged = prevStatus !== pentry.status;
    rec.entry = pentry;
    rec.root.style.height = pentry.layout.visualHeightPx + 'px';

    var isActiveLine = pentry.status === 'active';
    var textMask = isActiveLine ? undefined : monetGetClippedTextMask(
      pentry.layout.isTextClipped,
      vGlowBufferPx + pentry.layout.textPaddingTopPx + pentry.layout.textContentHeightPx,
      Math.max(lyricFontPx * 0.55, 12)
    );
    var textEdgeMask = monetGetEdgeFadeMask(pentry.layout.isTextOverflowingWidth, Math.max(lyricFontPx * 0.9, 24));
    monetSetMask(rec.textEl, monetComposeLineMasks(textMask, textEdgeMask));
    rec.textEl.style.textShadow = pentry.status === 'active'
      ? '0 14px 34px ' + CM_colorWithAlpha(theme.backgroundColor, 0.22)
      : 'none';
    if (!isActiveLine) {
      rec.textEl.style.height = (pentry.layout.textHeightPx + vGlowBufferPx * 2) + 'px';
    } else {
      rec.textEl.style.height = '';
    }

    if (statusChanged) {
      /* sweep 词随行状态迁移（framer 重渲染语义：active ↔ 其它时条件挂卸 overlay） */
      var nowActive = pentry.status === 'active';
      for (var i = 0; i < rec.sweeps.length; i++) {
        var sweep = rec.sweeps[i];
        sweep.lineStatus = pentry.status;
        sweep.lineActive = nowActive;
        if (nowActive) {
          monetAttachSweepOverlay(sweep);
        } else if (sweep.overlayOuter && sweep.overlayOuter.parentNode) {
          sweep.overlayOuter.parentNode.removeChild(sweep.overlayOuter);
          sweep.overlayOuter = null;
          sweep.overlayInner = null;
        }
        sweep.lastColor = null;
        sweep.lastShadow = null;
      }
      buildSubtitleTracks(rec, pentry, glowBufferPx);
      if (rec.chorusEl) {
        mmApplyVariant(rec.chorusEl, {
          st: {
            opacity: pentry.status === 'active' ? 1 : 0,
            scale: pentry.status === 'active' ? 1.02 : 0.96,
            transition: { duration: 0.45, ease: 'easeOut' }
          }
        }, 'st', null);
      }
    }
    applyLineAnimate(rec, pentry, false);
    /* 状态迁移帧立即推进一次 sweep（避免新 active 行停一帧） */
    if (statusChanged) {
      for (var s = 0; s < rec.sweeps.length; s++) monetUpdateSweep(rec.sweeps[s], nowT);
    }
  }

  /* 行退出（AnimatePresence exit :668-674 + 延时移除） */
  function exitLine(rec) {
    var entry = rec.entry;
    var exitVariant = {
      opacity: 0,
      y: entry.y + rec.exitOffset,
      scale: entry.tone.scale * 0.98,
      filter: 'blur(6px)',
      transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] }
    };
    mmApplyVariant(rec.root, { exit: exitVariant }, 'exit', null);
    var timer = setTimeout(function () {
      if (rec.root.parentNode) rec.root.parentNode.removeChild(rec.root);
    }, 200 + 90);
    exitTimers.push(timer);
  }

  /* ---------- 手动滚动（:872-1016 状态机同构） ---------- */
  function getFallbackAnchorIndex(entries) {
    if (manualScrollAnchorIndex !== null) return manualScrollAnchorIndex;
    if (lastActiveIndex >= 0) return lastActiveIndex;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].offset === 0) return entries[i].index;
    }
    return 0;
  }
  function scheduleManualScrollReset() {
    if (manualScrollResetTimer) clearTimeout(manualScrollResetTimer);
    manualScrollResetTimer = setTimeout(function () {
      manualScrollAnchorIndex = null;
      wheelAccumulator = 0; wheelDirection = 0;
      touchAccumulator = 0; touchDirection = 0;
      manualScrollResetTimer = 0;
      forceEntriesRebuild = true;
    }, MONET_SCROLL_IDLE_RESET_MS);
  }
  function moveManualScrollAnchor(steps, entries) {
    if (!lines.length) return;
    var baseIndex = getFallbackAnchorIndex(entries);
    manualScrollAnchorIndex = Math.round(monetClamp(baseIndex + steps, 0, lines.length - 1));
    scheduleManualScrollReset();
    forceEntriesRebuild = true;
  }
  function onRailWheel(event) {
    if (!lines.length) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    var direction = monetGetScrollDirection(event.deltaY);
    if (direction !== 0 && wheelDirection !== 0 && direction !== wheelDirection) wheelAccumulator = 0;
    wheelDirection = direction || wheelDirection;
    wheelAccumulator += event.deltaY;
    var steps = monetClampScrollSteps(Math.trunc(wheelAccumulator / MONET_SCROLL_STEP_PX));
    if (steps !== 0) { wheelAccumulator = 0; moveManualScrollAnchor(steps, lastVisibleEntries); }
    else scheduleManualScrollReset();
  }
  function onRailTouchStart(event) {
    if (!lines.length) return;
    event.stopPropagation();
    touchLastY = event.touches[0] ? event.touches[0].clientY : null;
    touchAccumulator = 0; touchDirection = 0;
    manualScrollAnchorIndex = getFallbackAnchorIndex(lastVisibleEntries);
    scheduleManualScrollReset();
  }
  function onRailTouchMove(event) {
    if (!lines.length || touchLastY === null) return;
    event.stopPropagation();
    var nextY = event.touches[0] ? event.touches[0].clientY : null;
    if (typeof nextY !== 'number') return;
    var deltaY = touchLastY - nextY;
    touchLastY = nextY;
    var direction = monetGetScrollDirection(deltaY);
    if (direction !== 0 && touchDirection !== 0 && direction !== touchDirection) touchAccumulator = 0;
    touchDirection = direction || touchDirection;
    touchAccumulator += deltaY;
    var steps = monetClampScrollSteps(Math.trunc(touchAccumulator / MONET_TOUCH_STEP_PX));
    if (steps !== 0) { touchAccumulator = 0; moveManualScrollAnchor(steps, lastVisibleEntries); }
    else scheduleManualScrollReset();
  }
  function onRailTouchEnd() {
    touchLastY = null; touchDirection = 0; touchAccumulator = 0;
    scheduleManualScrollReset();
  }
  var wheelOpts = { passive: false };
  railEl.addEventListener('wheel', onRailWheel, wheelOpts);
  railEl.addEventListener('touchstart', onRailTouchStart, wheelOpts);
  railEl.addEventListener('touchmove', onRailTouchMove, wheelOpts);
  railEl.addEventListener('touchend', onRailTouchEnd, wheelOpts);
  railEl.addEventListener('touchcancel', onRailTouchEnd, wheelOpts);

  var onLyricLineSeek = null;      /* 桥可注入（MineRadio 点击行 seek 未接线 → 不启用 canSeek） */
  var canSeek = false;

  /* ---------- 尺寸观测（useElementWidth / useMonetRailSize :242-273 等价） ---------- */
  var resizeObserver = null;
  function measureShell() {
    var w = Math.round(shell.getBoundingClientRect().width);
    if (w > 0 && w !== shellWidth) {
      shellWidth = w;
      return true;
    }
    return false;
  }
  function measureRail() {
    var w = Math.round(railEl.clientWidth);
    var h = Math.round(railEl.clientHeight);
    if ((w || 0) !== railSize.width || (h || 0) !== railSize.height) {
      railSize = { width: w, height: h };
      return true;
    }
    return false;
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(function () {
      if (destroyed) return;
      var shellChanged = measureShell();
      var railChanged = measureRail();
      if (shellChanged) {
        recomputeMetrics();
        applyPortraitFrameGeometry();
        applyRailContainerStyle();
      }
      if (shellChanged || railChanged) forceEntriesRebuild = true;
    });
    resizeObserver.observe(shell);
    resizeObserver.observe(railEl);
  }

  /* ---------- intro 进场时间表（VisualizerMonet :200-330/:516-535 原值） ---------- */
  var INTRO_EASE = [0.25, 1, 0.5, 1];
  function introPlay() {
    mmSetInitial(decorWrap, { opacity: 0 }, null);
    mmApplyVariant(decorWrap, { enter: { opacity: 1, transition: { duration: 2.2, ease: 'easeOut' } } }, 'enter', null);
    mmSetInitial(artistEl, { opacity: 0, x: -30, y: -10 }, null);
    mmApplyVariant(artistEl, { enter: { opacity: 1, x: 0, y: 0, transition: { duration: 1.2, ease: INTRO_EASE, delay: 0.15 } } }, 'enter', null);
    /* :216-224 scaleY 0→1——mini-motion transform 组装无 scaleY；rule 宽 1px，
       scale 等比缩放与 scaleY 在此视觉等效（宽度变化不可见） */
    mmSetInitial(ruleEl, { scale: 0 }, null);
    mmApplyVariant(ruleEl, { enter: { scale: 1, transition: { duration: 1.5, ease: INTRO_EASE, delay: 0.5 } } }, 'enter', null);
    mmSetInitial(titleWrap, { opacity: 0, x: -40 }, null);
    mmApplyVariant(titleWrap, { enter: { opacity: 1, x: 0, transition: { duration: 1.3, ease: INTRO_EASE, delay: 0.3 } } }, 'enter', null);
    mmSetInitial(railWrap, { opacity: 0, y: 20 }, null);
    mmApplyVariant(railWrap, { enter: { opacity: 1, y: 0, transition: { duration: 1.2, ease: INTRO_EASE, delay: 0.65 } } }, 'enter', null);
    mmSetInitial(capsuleWrap, { opacity: 0, scale: 0.9, y: 10 }, null);
    mmApplyVariant(capsuleWrap, { enter: { opacity: 1, scale: 1, y: 0, transition: { duration: 1.0, ease: INTRO_EASE, delay: 0.95 } } }, 'enter', null);
    mmSetInitial(audioWrap, { opacity: 0, y: 15 }, null);
    mmApplyVariant(audioWrap, { enter: { opacity: 1, y: 0, transition: { duration: 1.2, ease: INTRO_EASE, delay: 0.8 } } }, 'enter', null);
  }
  /* 相框列进场（:328-330 仅一次，不随 intro 重挂） */
  mmSetInitial(portraitCol, { opacity: 0, x: 50, scale: 0.95, rotate: 1 }, null);
  mmApplyVariant(portraitCol, {
    enter: { opacity: 1, x: 0, scale: 1, rotate: 0, transition: { duration: 1.6, ease: INTRO_EASE, delay: 0.25 } }
  }, 'enter', null);

  /* ---------- 元数据/构图应用 ---------- */
  function applyComposition() {
    recomputeMetrics();
    row.style.maxWidth = rowMaxWidthPx + 'px';
    artistEl.style.fontSize = 'clamp(1rem, 1.8vw, ' + artistMaxRem + 'rem)';
    titleEl.style.fontSize = 'clamp(1.45rem, 3.3vw, ' + titleMaxRem + 'rem)';
    titleEl.style.color = theme.primaryColor;
    titleEl.style.textShadow = '0 14px 36px ' + CM_colorWithAlpha(theme.backgroundColor, 0.28);
    albumEl.style.color = CM_colorWithAlpha(theme.secondaryColor, 0.84);
    capsuleInner.style.borderColor = CM_colorWithAlpha(theme.primaryColor, 0.16);
    capsuleInner.style.backgroundColor = CM_colorWithAlpha(theme.backgroundColor, 0.18);
    capsuleInner.style.color = CM_colorWithAlpha(theme.primaryColor, 0.9);
    capsuleDot.style.backgroundColor = theme.accentColor;
    capsuleWrap.style.display = tuning.showDescription ? '' : 'none';
    audioWrap.style.display = (tuning.showAudioVisualization && showText) ? '' : 'none';
    portraitCol.style.display = showText ? 'flex' : 'none';
    applyPortraitFrameGeometry();
    applyRailContainerStyle();
    /* 主标签（:167-169 原语义：artist/album 空回退 'Monet'；胶囊 theme.description|name|'Monet'） */
    artistEl.textContent = (songArtist && songArtist.trim()) ? songArtist.trim() : 'Monet';
    albumEl.textContent = (songAlbum && songAlbum.trim()) ? songAlbum.trim() : 'Monet';
    capsuleText.textContent = ((theme.description && theme.description.trim()) || (theme.name && theme.name.trim()) || 'Monet');
    titleEl.textContent = songTitle || 'Monet';
  }

  /* ---------- 主循环 ---------- */
  var lastActiveIndex = -99;
  var lastVisibleEntries = [];
  var forceEntriesRebuild = true;
  var showText = opts.showText !== false;

  function rebuildEntries(nowT) {
    var activeLine = lines[lastActiveIndex] || null;
    var recentCompletedLine = monetGetRecentCompletedLine(lines, lastActiveIndex, nowT, CM_getLineRenderEndTime);
    var upcomingLine = monetGetUpcomingLine(lines, lastActiveIndex, nowT);

    var entries = CM_buildMonetVisibleLineEntries({
      lines: lines,
      currentLineIndex: lastActiveIndex,
      activeLine: activeLine,
      recentCompletedLine: recentCompletedLine,
      upcomingLine: upcomingLine,
      currentTime: nowT,
      before: 2,
      after: 2
    });

    /* 手动滚动覆盖窗口（:828-833） */
    var isManualScrolling = manualScrollAnchorIndex !== null;
    var visibleEntries = isManualScrolling
      ? monetBuildScrollableRailEntries(lines, manualScrollAnchorIndex, lastActiveIndex)
      : entries;
    lastVisibleEntries = visibleEntries;

    /* fontsEpoch 推进 → 测量缓存一次性失效（:838-845） */
    if (handledFontsEpoch !== fontsEpoch) {
      handledFontsEpoch = fontsEpoch;
      CM_clearMonetMeasurementCaches();
      layoutCache.clear();
    }

    wordColorMatchers = CM_prepareWordColorMatchers(theme.wordColors, tuning.keywordColoringEnabled);

    var glowBufferPx = Math.round(lyricFontPx * 1.2);
    var vGlowBufferPx = Math.round(lyricFontPx * 1.2);
    var positioned = monetBuildPositionedEntries(visibleEntries, railSize, theme, lyricFontPx, inactiveFontPx, railLayoutInputs(), glowBufferPx, layoutCache);

    /* 行池 diff（AnimatePresence initial=false 等价） */
    var present = {};
    for (var i = 0; i < positioned.length; i++) present[positioned[i].key] = true;
    var doomed = [];
    lineRecs.forEach(function (rec, key) {
      if (!present[key]) doomed.push(rec);
    });
    for (var d = 0; d < doomed.length; d++) {
      exitLine(doomed[d]);
      lineRecs.delete(doomed[d].key);
    }

    for (var p = 0; p < positioned.length; p++) {
      var entry = positioned[p];
      var existing = lineRecs.get(entry.key);
      /* 字体纪元过期（setTheme 换字体）或手动滚动的静态行回到正常模式 → 重建
         （framer re-render 等价：inline font-family 只在 buildLineEl 写） */
      var needRebuild = existing && (existing.poolEpoch !== fontPoolEpoch
        || (existing.staticRendered && !isManualScrolling));
      if (existing && !needRebuild) {
        updateLineEl(existing, entry, glowBufferPx, vGlowBufferPx, nowT);
      } else {
        if (existing) {
          if (existing.root.parentNode) existing.root.parentNode.removeChild(existing.root);
          lineRecs.delete(entry.key);
        }
        var rec = buildLineEl(entry, glowBufferPx, vGlowBufferPx, canSeek && !isManualScrolling, isManualScrolling, isManualScrolling && entry.index !== lastActiveIndex, nowT, !!existing);
        railEl.appendChild(rec.root);
        lineRecs.set(entry.key, rec);
      }
    }
  }

  function tick() {
    if (destroyed) return;
    var now = currentTime.get();
    if (now !== lastTime) {
      /* :84-91 回绕检测（>2.0 → <0.1 触发 intro 重放） */
      if (lastTime != null && wasAtEnd && now < 0.1) {
        introPlay();
      }
      wasAtEnd = now > 2.0;
      lastTime = now;
      currentTime.emit(now);
      /* sweep 词逐帧派生（useTransform 链等价） */
      lineRecs.forEach(function (rec) {
        for (var i = 0; i < rec.sweeps.length; i++) monetUpdateSweep(rec.sweeps[i], now);
      });
    }

    /* 换歌（songIdentifier :93-97）→ intro 重放 */
    var songIdentifier = seed != null ? String(seed) : '';
    if (songIdentifier !== lastSongIdentifier) {
      lastSongIdentifier = songIdentifier;
      introPlay();
    }

    var idx = monetFindLineIndexAtTime(lines, now);
    if (idx !== lastActiveIndex || forceEntriesRebuild) {
      lastActiveIndex = idx;
      forceEntriesRebuild = false;
      rebuildEntries(now);
    }

    drawAudio();
    rafId = requestAnimationFrame(tick);
  }

  function onWindowResize() {
    if (destroyed) return;
    if (measureShell()) {
      recomputeMetrics();
      applyPortraitFrameGeometry();
      applyRailContainerStyle();
      forceEntriesRebuild = true;
    }
  }
  window.addEventListener('resize', onWindowResize);

  /* ---------- 初始化 ---------- */
  measureShell();
  measureRail();
  applyBgReadability();
  applyBgDrift();
  buildDecor();
  applyComposition();
  applyPortraitFrame();
  applyHangerLook();
  setPortraitTarget(tuning.portraitSource === 'custom' ? coverUrl : coverUrl);
  refreshBackground();
  monetResizeAudioCanvas();
  introPlay();
  rafId = requestAnimationFrame(tick);

  return {
    destroy: function () {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      for (var i = 0; i < exitTimers.length; i++) clearTimeout(exitTimers[i]);
      exitTimers = [];
      if (manualScrollResetTimer) clearTimeout(manualScrollResetTimer);
      if (bgDebounceTimer) clearTimeout(bgDebounceTimer);
      if (settleTimer) clearTimeout(settleTimer);
      if (bgDriftAnim) { try { bgDriftAnim.cancel(); } catch (e) { } bgDriftAnim = null; }
      if (resizeObserver) { try { resizeObserver.disconnect(); } catch (e) { } }
      if (hangerStyleEl && hangerStyleEl.parentNode) hangerStyleEl.parentNode.removeChild(hangerStyleEl);
      window.removeEventListener('resize', onWindowResize);
      if (shell.parentNode) shell.parentNode.removeChild(shell);
      lineRecs.clear();
      bgLayers = [];
      portraitLayers = [];
    },
    setLines: function (next) {
      lines = next || [];
      forceEntriesRebuild = true;
    },
    setTheme: function (nextTheme) {
      theme = nextTheme;
      fontStack = CM_resolveThemeFontStack(theme);
      translationFontStack = CM_resolveThemeTranslationFontStack(theme);
      lyricFontWeight = CM_resolveThemeFontWeight(theme, 600);
      translationFontWeight = CM_resolveThemeFontWeight(theme, 500);
      secondaryTranslationFontWeight = CM_resolveThemeFontWeight(theme, CM_SECONDARY_TRACK_FONT_WEIGHT_FALLBACK);
      shell.style.fontFamily = fontStack;
      shell.style.fontWeight = CM_resolveThemeFontWeight(theme, 400);
      /* 字体跟随：inline font-family 只在 buildLineEl 写，行池 diff 复用旧行
         不会带新字体——推进纪元让 existing 行在本帧 rebuildEntries 重建 */
      fontPoolEpoch++;
      applyComposition();
      applyBgReadability();
      buildDecor();
      applyPortraitFrame();
      applyHangerLook();
      bgPipelineKey = null;      /* 主题进烘焙 key → 重烘焙 */
      refreshBackground();
      forceEntriesRebuild = true;
    },
    setCoverUrl: function (url) {
      coverUrl = url || null;
      setPortraitTarget(coverUrl);
      bgPipelineKey = null;
      refreshBackground();
    },
    setMeta: function (meta) {
      if (!meta) return;
      if (meta.songTitle != null) songTitle = meta.songTitle;
      if (meta.songArtist != null) songArtist = meta.songArtist;
      if (meta.songAlbum != null) songAlbum = meta.songAlbum;
      if (meta.seed != null) seed = meta.seed;
      applyComposition();
    },
    setFontScale: function (n) {
      lyricsFontScale = n != null ? n : 1;
      tuning = monetResolveTuning(tuning, lyricsFontScale);
      applyComposition();
      forceEntriesRebuild = true;
    },
    setTuning: function (t) {
      var prevStyle = tuning.portraitStyle;
      var prevDesc = tuning.showDescription;
      var prevAudio = tuning.showAudioVisualization + '|' + tuning.audioStyle;
      tuning = monetResolveTuning(t, lyricsFontScale);
      applyComposition();
      if (prevStyle !== tuning.portraitStyle) applyPortraitFrame();
      if (prevAudio !== (tuning.showAudioVisualization + '|' + tuning.audioStyle)) { /* drawAudio 每帧读 tuning */ }
      if (prevDesc !== tuning.showDescription) { /* applyComposition 已切换显示 */ }
      forceEntriesRebuild = true;
    }
  };
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
var CM_buildWordGraphemeTimings = buildWordGraphemeTimings;
env.CM_buildWordGraphemeTimings = CM_buildWordGraphemeTimings;
var CM_buildLineGraphemeTimeline = buildLineGraphemeTimeline;
env.CM_buildLineGraphemeTimeline = CM_buildLineGraphemeTimeline;
var CM_splitLyricGraphemes = splitLyricGraphemes;
env.CM_splitLyricGraphemes = CM_splitLyricGraphemes;
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
var CM_resolveThemeTranslationFontStack = resolveThemeTranslationFontStack;
env.CM_resolveThemeTranslationFontStack = CM_resolveThemeTranslationFontStack;
var CM_resolveThemeFontWeight = resolveThemeFontWeight;
env.CM_resolveThemeFontWeight = CM_resolveThemeFontWeight;
var CM_resolveWordColor = resolveWordColor;
env.CM_resolveWordColor = CM_resolveWordColor;
var CM_prepareWordColorMatchers = prepareWordColorMatchers;
env.CM_prepareWordColorMatchers = CM_prepareWordColorMatchers;
var CM_buildWordColorRangesFromMatchers = buildWordColorRangesFromMatchers;
env.CM_buildWordColorRangesFromMatchers = CM_buildWordColorRangesFromMatchers;
var CM_resolveTokenColorMap = resolveTokenColorMap;
env.CM_resolveTokenColorMap = CM_resolveTokenColorMap;
var CM_resolveMonetBackgroundDataUrl = resolveMonetBackgroundDataUrl;
env.CM_resolveMonetBackgroundDataUrl = CM_resolveMonetBackgroundDataUrl;
var CM_getMonetBackgroundCacheKey = getMonetBackgroundCacheKey;
env.CM_getMonetBackgroundCacheKey = CM_getMonetBackgroundCacheKey;
var CM_buildMonetBackgroundDataUrl = buildMonetBackgroundDataUrl;
env.CM_buildMonetBackgroundDataUrl = CM_buildMonetBackgroundDataUrl;
var CM_checkCanvasFilterSupport = checkCanvasFilterSupport;
env.CM_checkCanvasFilterSupport = CM_checkCanvasFilterSupport;
var CM_resolveWashColor = resolveWashColor;
env.CM_resolveWashColor = CM_resolveWashColor;
var CM_resolveWashEndpoints = resolveWashEndpoints;
env.CM_resolveWashEndpoints = CM_resolveWashEndpoints;
var CM_MONET_SCROLL_SPRING = MONET_SCROLL_SPRING;
env.CM_MONET_SCROLL_SPRING = CM_MONET_SCROLL_SPRING;
var CM_MONET_SCALE_SPRING = MONET_SCALE_SPRING;
env.CM_MONET_SCALE_SPRING = CM_MONET_SCALE_SPRING;
var CM_clampMonetProgress = clampMonetProgress;
env.CM_clampMonetProgress = CM_clampMonetProgress;
var CM_resolveMonetGlow = resolveMonetGlow;
env.CM_resolveMonetGlow = CM_resolveMonetGlow;
var CM_resolveMonetFillWidth = resolveMonetFillWidth;
env.CM_resolveMonetFillWidth = CM_resolveMonetFillWidth;
var CM_resolveMonetTone = resolveMonetTone;
env.CM_resolveMonetTone = CM_resolveMonetTone;
var CM_MONET_RAIL_BASE_MAX_WIDTH_PX = MONET_RAIL_BASE_MAX_WIDTH_PX;
env.CM_MONET_RAIL_BASE_MAX_WIDTH_PX = CM_MONET_RAIL_BASE_MAX_WIDTH_PX;
var CM_MONET_RAIL_BASE_MAX_HEIGHT_PX = MONET_RAIL_BASE_MAX_HEIGHT_PX;
env.CM_MONET_RAIL_BASE_MAX_HEIGHT_PX = CM_MONET_RAIL_BASE_MAX_HEIGHT_PX;
var CM_MONET_ROW_BASE_MAX_WIDTH_PX = MONET_ROW_BASE_MAX_WIDTH_PX;
env.CM_MONET_ROW_BASE_MAX_WIDTH_PX = CM_MONET_ROW_BASE_MAX_WIDTH_PX;
var CM_MONET_PORTRAIT_BASE_MAX_PX = MONET_PORTRAIT_BASE_MAX_PX;
env.CM_MONET_PORTRAIT_BASE_MAX_PX = CM_MONET_PORTRAIT_BASE_MAX_PX;
var CM_MONET_PORTRAIT_INNER_BASE_MAX_PX = MONET_PORTRAIT_INNER_BASE_MAX_PX;
env.CM_MONET_PORTRAIT_INNER_BASE_MAX_PX = CM_MONET_PORTRAIT_INNER_BASE_MAX_PX;
var CM_buildMonetDisplayTokens = buildMonetDisplayTokens;
env.CM_buildMonetDisplayTokens = CM_buildMonetDisplayTokens;
var CM_buildMonetVisibleLineEntries = buildMonetVisibleLineEntries;
env.CM_buildMonetVisibleLineEntries = CM_buildMonetVisibleLineEntries;
var CM_buildMonetLayoutCacheKey = buildMonetLayoutCacheKey;
env.CM_buildMonetLayoutCacheKey = CM_buildMonetLayoutCacheKey;
var CM_measureMonetLineLayout = measureMonetLineLayout;
env.CM_measureMonetLineLayout = CM_measureMonetLineLayout;
var CM_measureMonetGraphemeOffsets = measureMonetGraphemeOffsets;
env.CM_measureMonetGraphemeOffsets = CM_measureMonetGraphemeOffsets;
var CM_clearMonetMeasurementCaches = clearMonetMeasurementCaches;
env.CM_clearMonetMeasurementCaches = CM_clearMonetMeasurementCaches;
var CM_resolveMonetLineStatus = resolveMonetLineStatus;
env.CM_resolveMonetLineStatus = CM_resolveMonetLineStatus;
var CM_resolveMonetWordStatus = resolveMonetWordStatus;
env.CM_resolveMonetWordStatus = CM_resolveMonetWordStatus;
var CM_resolveMonetSweepEdgeSoftness = resolveMonetSweepEdgeSoftness;
env.CM_resolveMonetSweepEdgeSoftness = CM_resolveMonetSweepEdgeSoftness;
var CM_resolveMonetSweepEnd = resolveMonetSweepEnd;
env.CM_resolveMonetSweepEnd = CM_resolveMonetSweepEnd;
var CM_resolveMonetLargeScreenScale = resolveMonetLargeScreenScale;
env.CM_resolveMonetLargeScreenScale = CM_resolveMonetLargeScreenScale;
var CM_resolveClampFontPx = resolveClampFontPx;
env.CM_resolveClampFontPx = CM_resolveClampFontPx;
var CM_MONET_PORTRAIT_FADE_MS = MONET_PORTRAIT_FADE_MS;
env.CM_MONET_PORTRAIT_FADE_MS = CM_MONET_PORTRAIT_FADE_MS;
var CM_MONET_PORTRAIT_MAX_LAYERS = MONET_PORTRAIT_MAX_LAYERS;
env.CM_MONET_PORTRAIT_MAX_LAYERS = CM_MONET_PORTRAIT_MAX_LAYERS;
var CM_monetPortraitTargetSource = monetPortraitTargetSource;
env.CM_monetPortraitTargetSource = CM_monetPortraitTargetSource;
var CM_pushMonetPortraitLayer = pushMonetPortraitLayer;
env.CM_pushMonetPortraitLayer = CM_pushMonetPortraitLayer;
var CM_settleMonetPortraitLayers = settleMonetPortraitLayers;
env.CM_settleMonetPortraitLayers = CM_settleMonetPortraitLayers;
var CM_buildMonetDriftTrack = buildMonetDriftTrack;
env.CM_buildMonetDriftTrack = CM_buildMonetDriftTrack;
var buildMonetWordColorRanges = buildWordColorRanges;
env.buildMonetWordColorRanges = buildMonetWordColorRanges;
var buildMonetWordColorRangesFromMatchers = buildWordColorRangesFromMatchers;
env.buildMonetWordColorRangesFromMatchers = buildMonetWordColorRangesFromMatchers;
var prepareMonetWordColorMatchers = prepareWordColorMatchers;
env.prepareMonetWordColorMatchers = prepareMonetWordColorMatchers;
var resolveMonetTokenColorMap = resolveTokenColorMap;
env.resolveMonetTokenColorMap = resolveMonetTokenColorMap;
env.MonetMonetEngine = (typeof MonetMonetEngine !== "undefined") ? MonetMonetEngine : null;
})((typeof pretext !== "undefined") ? pretext : {}, typeof window !== "undefined" ? window : this);