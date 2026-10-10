// OrangeSea LUMIERE ENGINE (AGPL-3.0, from folia-major) -- no-build bundle
(function (PIXI, pretext, env) {
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

// ======== components/visualizer/lumiere/lineart/recipes ========
// 曲线细分的采样参考。
const lumiereScaleMask__1 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__1 = ((523 ^ lumiereScaleMask__1) + Math.imul(0xbafc ^ lumiereScaleMask__1, 0x3e03 ^ lumiereScaleMask__1))
    - ((523 ^ lumiereScaleMask__1) + Math.imul(0xbafc ^ lumiereScaleMask__1, 0x3e03 ^ lumiereScaleMask__1));
// src/components/visualizer/lumiere/lineart/recipes.ts
// 线稿配方：几何图元（弧、辐条、刻度、取景框、叶片）→ LineArtSpec。坐标一律高度单位，aspect 为宽高比。
const arcPoints = (cx, cy, r, from, to, steps = 64 + LUMIERE_NEUTRAL_OFFSET__1) => (Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}));
const cubicPoints = (p0, p1, p2, p3, steps = 40) => (Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [
        a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
        a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ];
}));
const line = (a, b) => [a, b];
const mergeSpecs = (...specs) => ({
    paths: specs.flatMap(spec => spec.paths),
    nodes: specs.flatMap(spec => spec.nodes),
});
/**
 * 量角器似的光环：以光源为圆心的下半圆（外弧 + 内弧），辐条，外弧上的细刻度。参考图顶部那一圈。
 */
const protractorHalo = (options) => {
    const { cx, cy, radius } = options;
    const delay = options.delay ?? 0;
    const alpha = options.alpha ?? 0.5;
    const from = Math.PI * 0.04;
    const to = Math.PI * 0.96;
    const inner = radius * 0.62;
    const paths = [
        { points: arcPoints(cx, cy, radius, to, from, 96), width: 0.0016, alpha, delay, span: 0.45 },
        { points: arcPoints(cx, cy, inner, from, to, 72), width: 0.0013, alpha: alpha * 0.8, delay: delay + 0.08, span: 0.4 },
        { points: arcPoints(cx, cy, radius * 1.18, from + 0.1, to - 0.1, 80), width: 0.0011, alpha: alpha * 0.45, delay: delay + 0.2, span: 0.4, dash: [0.004, 0.009] },
    ];
    const step = options.spokeStep ?? Math.PI / 12;
    const nodes = [];
    let index = 0;
    for (let a = Math.PI / 2 - step * 5; a <= Math.PI / 2 + step * 5 + 1e-6; a += step) {
        const long = index % 2 === 0;
        const r0 = inner * 0.2;
        const r1 = radius * (long ? 1.12 : 1.02);
        paths.push({
            points: line([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]),
            width: long ? 0.0013 : 0.0009,
            alpha: alpha * (long ? 0.7 : 0.45),
            delay: delay + 0.12 + Math.abs(a - Math.PI / 2) * 0.12,
            span: 0.3,
        });
        if (long)
            nodes.push({ at: [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius], size: 0.022, delay: delay + 0.45, twinklePhase: index * 1.7 });
        index += 1;
    }
    // 外弧上的细刻度。
    for (let a = from; a <= to; a += Math.PI / 72) {
        paths.push({
            points: line([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius], [cx + Math.cos(a) * radius * 0.975, cy + Math.sin(a) * radius * 0.975]),
            width: 0.0008,
            alpha: alpha * 0.4,
            delay: delay + 0.25 + (a - from) * 0.05,
            span: 0.15,
        });
    }
    return { paths, nodes };
};
/** 取景框：一个大矩形、四角加粗的角标、边上的刻度、两侧竖直的点线。 */
const viewfinderFrame = (options) => {
    const { aspect, top, bottom } = options;
    const left = options.left * aspect;
    const right = options.right * aspect;
    const delay = options.delay ?? 0;
    const alpha = options.alpha ?? 0.3;
    const corner = 0.03;
    const paths = [
        { points: [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]], width: 0.0009, alpha: alpha * 0.55, delay, span: 0.6 },
    ];
    const corners = [
        [[left, top + corner], [left, top], [left + corner, top]],
        [[right - corner, top], [right, top], [right, top + corner]],
        [[right, bottom - corner], [right, bottom], [right - corner, bottom]],
        [[left + corner, bottom], [left, bottom], [left, bottom - corner]],
    ];
    corners.forEach((points, i) => paths.push({ points, width: 0.0018, alpha, delay: delay + 0.1 + i * 0.05, span: 0.2 }));
    const ticks = 12;
    for (let i = 1; i < ticks; i += 1) {
        const x = left + ((right - left) * i) / ticks;
        const y = top + ((bottom - top) * i) / ticks;
        const len = i % 3 === 0 ? 0.014 : 0.007;
        paths.push({ points: line([x, top], [x, top + len]), width: 0.0008, alpha: alpha * 0.6, delay: delay + 0.3 + i * 0.01, span: 0.1 });
        paths.push({ points: line([x, bottom], [x, bottom - len]), width: 0.0008, alpha: alpha * 0.6, delay: delay + 0.3 + i * 0.01, span: 0.1 });
        paths.push({ points: line([left, y], [left + len, y]), width: 0.0008, alpha: alpha * 0.6, delay: delay + 0.3 + i * 0.01, span: 0.1 });
        paths.push({ points: line([right, y], [right - len, y]), width: 0.0008, alpha: alpha * 0.6, delay: delay + 0.3 + i * 0.01, span: 0.1 });
    }
    const guideX = [left + (right - left) * 0.14, right - (right - left) * 0.14];
    guideX.forEach((x, i) => paths.push({
        points: line([x, top + 0.06], [x, bottom - 0.06]), width: 0.001, alpha: alpha * 0.5,
        delay: delay + 0.35 + i * 0.05, span: 0.4, dash: [0.003, 0.012],
    }));
    return { paths, nodes: [] };
};
/**
 * 萌芽：从画面底部升起的茎，顶端两片叶（外轮廓 + 主脉 + 侧脉），叶尖与叶缘有闪点。参考图底部的两片叶。
 * baseY 为茎顶（叶的起点），size 为叶长。
 */
const sprout = (options) => {
    const { cx, baseY, size } = options;
    const delay = options.delay ?? 0;
    const alpha = options.alpha ?? 0.55;
    const open = options.open ?? 1;
    const paths = [
        { points: cubicPoints([cx, 1.04], [cx + 0.01, 0.94], [cx - 0.008, baseY + 0.08], [cx, baseY]), width: 0.0016, alpha, delay, span: 0.3 },
    ];
    const nodes = [];
    const leaf = (side, index) => {
        // 叶子主轴：与竖直方向夹 lean 角，左叶向左上、右叶向右上（y 向下）。
        const lean = (0.2 + 0.2 * open) * Math.PI;
        const d = [Math.sin(lean) * side, -Math.cos(lean)];
        const n = [-d[1], d[0]];
        const base = [cx, baseY];
        const tip = [base[0] + d[0] * size, base[1] + d[1] * size - size * 0.12];
        const bulge = size * 0.34;
        const at = (along, across) => [
            base[0] + d[0] * size * along + n[0] * across,
            base[1] + d[1] * size * along + n[1] * across - size * 0.12 * along * along,
        ];
        const leafDelay = delay + 0.22 + index * 0.08;
        // 叶的外轮廓是这组线稿的主体，比其他线粗一些。
        paths.push({ points: cubicPoints(base, at(0.3, bulge), at(0.78, bulge * 0.9), tip, 48), width: 0.0026, alpha, delay: leafDelay, span: 0.35 });
        paths.push({ points: cubicPoints(base, at(0.3, -bulge * 0.95), at(0.8, -bulge * 0.6), tip, 48), width: 0.0026, alpha, delay: leafDelay + 0.04, span: 0.35 });
        paths.push({ points: cubicPoints(base, at(0.35, bulge * 0.08), at(0.7, bulge * 0.05), tip, 32), width: 0.0011, alpha: alpha * 0.7, delay: leafDelay + 0.12, span: 0.3 });
        for (let v = 1; v <= 4; v += 1) {
            const f = v / 5.2;
            const start = at(f, bulge * 0.04);
            for (const s of [1, -1]) {
                const end = at(f + 0.14, s * bulge * (0.72 - f * 0.35));
                paths.push({ points: cubicPoints(start, at(f + 0.04, s * bulge * 0.25), at(f + 0.1, s * bulge * 0.5), end, 16), width: 0.0008, alpha: alpha * 0.45, delay: leafDelay + 0.2 + v * 0.03, span: 0.18 });
            }
        }
        nodes.push({ at: tip, size: 0.03, delay: leafDelay + 0.3, twinklePhase: index * 2.1 });
        nodes.push({ at: at(0.45, bulge * 0.86), size: 0.014, delay: leafDelay + 0.33, twinklePhase: index * 2.1 + 1 });
        nodes.push({ at: at(0.6, -bulge * 0.8), size: 0.012, delay: leafDelay + 0.36, twinklePhase: index * 2.1 + 2 });
    };
    leaf(-1, 0);
    leaf(1, 1);
    nodes.push({ at: [cx, baseY], size: 0.02, delay: delay + 0.3, twinklePhase: 0.5 });
    return { paths, nodes };
};
/** 散落的小闪点（参考图里画面各处零星的亮点）。 */
const scatteredSparks = (options) => {
    const [x0, y0, x1, y1] = options.region ?? [0.05, 0.08, 0.95, 0.92];
    const nodes = Array.from({ length: options.count }, (_, i) => ({
        at: [(x0 + (x1 - x0) * options.random()) * options.aspect, y0 + (y1 - y0) * options.random()],
        size: 0.006 + options.random() * 0.012,
        delay: (options.delay ?? 0) + options.random() * 0.5,
        twinklePhase: i * 2.399,
    }));
    return { paths: [], nodes };
};
/** 百叶窗：窗框 + 一排横向叶片（窗隙族）。x、y、w、h 为高度单位。 */
const blindsWindow = (options) => {
    const { x, y, w, h, slats } = options;
    const delay = options.delay ?? 0;
    const alpha = options.alpha ?? 0.5;
    const paths = [
        { points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], width: 0.0018, alpha, delay, span: 0.5 },
    ];
    for (let i = 1; i < slats; i += 1) {
        const sy = y + (h * i) / slats;
        paths.push({ points: line([x, sy], [x + w, sy]), width: 0.001, alpha: alpha * 0.6, delay: delay + 0.1 + i * 0.03, span: 0.2 });
    }
    return { paths, nodes: [{ at: [x + w, y + h], size: 0.018, delay: delay + 0.4, twinklePhase: 1 }] };
};
/** 三棱镜：正三角形轮廓（棱镜族），cx、cy 为中心，size 为边长（高度单位）。 */
const prismTriangle = (options) => {
    const { cx, cy, size } = options;
    const h = (size * Math.sqrt(3)) / 2;
    const top = [cx, cy - (h * 2) / 3];
    const left = [cx - size / 2, cy + h / 3];
    const right = [cx + size / 2, cy + h / 3];
    const alpha = options.alpha ?? 0.7;
    const delay = options.delay ?? 0;
    return {
        paths: [
            { points: [top, right, left, top], width: 0.0022, alpha, delay, span: 0.5 },
            { points: [top, [cx, cy + h / 3]], width: 0.0008, alpha: alpha * 0.4, delay: delay + 0.3, span: 0.3, dash: [0.004, 0.008] },
        ],
        nodes: [top, left, right].map((at, i) => ({ at, size: 0.02, delay: delay + 0.4 + i * 0.05, twinklePhase: i * 1.3 })),
    };
};
/** 双缝挡板：一条横线中间开两个缝（衍射族）。y 为挡板高度，gap 为缝宽，separation 为两缝间距（高度单位）。 */
const slitBarrier = (options) => {
    const { cx, y, width, gap, separation } = options;
    const alpha = options.alpha ?? 0.6;
    const delay = options.delay ?? 0;
    const a = cx - separation / 2;
    const b = cx + separation / 2;
    const segments = [[cx - width / 2, a - gap / 2], [a + gap / 2, b - gap / 2], [b + gap / 2, cx + width / 2]];
    return {
        paths: segments.map(([from, to], i) => ({ points: line([from, y], [to, y]), width: 0.0026, alpha, delay: delay + i * 0.08, span: 0.3 })),
        nodes: [a, b].map((x, i) => ({ at: [x, y], size: 0.022, delay: delay + 0.35 + i * 0.05, twinklePhase: i * 2 })),
    };
};

// ======== components/visualizer/lumiere/lineart/diagrams ========

// 图解角度的参考尺度。
const lumiereScaleMask__2 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__2 = ((0x3b7e ^ lumiereScaleMask__2) + Math.imul(0x2939 ^ lumiereScaleMask__2, 0xb9e72008 ^ lumiereScaleMask__2))
    - ((0x3b7e ^ lumiereScaleMask__2) + Math.imul(0x2939 ^ lumiereScaleMask__2, 0xb9e72008 ^ lumiereScaleMask__2));
// src/components/visualizer/lumiere/lineart/diagrams.ts
// L3 各族的线稿图解：窗、棱镜、焦散、光路、干涉、植物、天体、舞台。坐标一律高度单位（x 在 0..aspect），
// 每个函数返回 LineArtSpec，按 delay 错开描线。风格统一：主线 0.0016–0.0024、辅助线 0.0008–0.0012、
// 虚线用于光轴 / 法线 / 虚像。
const TAU = Math.PI * (2 + LUMIERE_NEUTRAL_OFFSET__2);
const path = (points, style = {}) => ({
    points,
    width: style.width ?? 0.0016,
    alpha: style.alpha ?? 0.55,
    delay: style.delay ?? 0,
    span: style.span ?? 0.4,
    ...(style.dash ? { dash: style.dash } : {}),
});
const node = (at, size = 0.018, delay = 0.4, twinklePhase = 0) => ({ at, size, delay, twinklePhase });
const segment = (a, b, style = {}) => path([a, b], style);
/** 圆 / 椭圆（可旋转）。 */
const ellipsePath = (cx, cy, rx, ry, rotation = 0, from = 0, to = TAU, steps = 96) => {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return arcPoints(0, 0, 1, from, to, steps).map(([x, y]) => [cx + x * rx * cos - y * ry * sin, cy + x * rx * sin + y * ry * cos]);
};
const circle = (cx, cy, r, style = {}) => path(ellipsePath(cx, cy, r, r), style);
const merge = (...specs) => ({
    paths: specs.flatMap(spec => spec.paths),
    nodes: specs.flatMap(spec => spec.nodes),
});
/** 放射线：从 r0 到 r1、在 from..to 角度之间均匀 count 条。 */
const rays = (cx, cy, r0, r1, count, from = 0, to = TAU, style = {}) => ({
    paths: Array.from({ length: count }, (_, i) => {
        const a = from + ((to - from) * (i + (to - from >= TAU - 1e-6 ? 0 : 0.5))) / count;
        return segment([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1], {
            width: 0.001, alpha: 0.4, ...style, delay: (style.delay ?? 0) + (i / count) * 0.3, span: style.span ?? 0.2,
        });
    }),
    nodes: [],
});
const concentric = (cx, cy, radii, style = {}) => ({
    paths: radii.map((r, i) => circle(cx, cy, r, { width: 0.0011, alpha: 0.45, ...style, delay: (style.delay ?? 0) + i * 0.06 })),
    nodes: [],
});
// ---------------------------------------------------------------------------------------------
// 窗隙
/** 十字窗：窗框 + 十字窗棂。 */
const crossWindow = (x, y, w, h, style = {}) => ({
    paths: [
        path([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], { width: 0.002, alpha: 0.55, ...style }),
        segment([x + w / 2, y], [x + w / 2, y + h], { width: 0.0014, alpha: 0.45, delay: (style.delay ?? 0) + 0.15 }),
        segment([x, y + h / 2], [x + w, y + h / 2], { width: 0.0014, alpha: 0.45, delay: (style.delay ?? 0) + 0.2 }),
    ],
    nodes: [node([x + w / 2, y + h / 2], 0.02, (style.delay ?? 0) + 0.4)],
});
/** 拱窗：矩形窗身 + 半圆拱顶。 */
const archWindow = (x, y, w, h, style = {}) => {
    const r = w / 2;
    const top = y + r;
    return {
        paths: [
            path([[x, y + h], [x, top], ...arcPoints(x + r, top, r, Math.PI, TAU, 40), [x + w, y + h], [x, y + h]], { width: 0.0018, alpha: 0.55, ...style }),
            segment([x + r, y], [x + r, y + h], { width: 0.001, alpha: 0.35, delay: (style.delay ?? 0) + 0.2 }),
        ],
        nodes: [node([x + r, y + 0.01], 0.018, (style.delay ?? 0) + 0.4)],
    };
};
/** 玫瑰窗：外圈、内圈、辐条与花瓣。 */
const roseWindow = (cx, cy, r, style = {}) => merge(concentric(cx, cy, [r, r * 0.62, r * 0.22], { width: 0.0016, alpha: 0.55, ...style }), rays(cx, cy, r * 0.22, r, 12, 0, TAU, { delay: (style.delay ?? 0) + 0.2 }), {
    paths: Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * TAU;
        return circle(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8, r * 0.14, { width: 0.0009, alpha: 0.35, delay: (style.delay ?? 0) + 0.35 + i * 0.02 });
    }),
    nodes: [node([cx, cy], 0.028, (style.delay ?? 0) + 0.5)],
});
/** 门缝：两扇门的边线，中间一道缝。 */
const doorSlit = (cx, top, bottom, gap, style = {}) => ({
    paths: [
        segment([cx - gap / 2, top], [cx - gap / 2, bottom], { width: 0.0018, alpha: 0.55, ...style }),
        segment([cx + gap / 2, top], [cx + gap / 2, bottom], { width: 0.0018, alpha: 0.55, ...style, delay: (style.delay ?? 0) + 0.05 }),
        segment([cx - gap / 2 - 0.25, bottom], [cx + gap / 2 + 0.25, bottom], { width: 0.001, alpha: 0.35, delay: (style.delay ?? 0) + 0.2 }),
    ],
    nodes: [node([cx, top + 0.02], 0.02, (style.delay ?? 0) + 0.4)],
});
/** 方格：障子、格栅（diagonal 为斜向菱格）。 */
const gridPanel = (x, y, w, h, cols, rows, diagonal = false, style = {}) => {
    const paths = [path([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], { width: 0.0018, alpha: 0.5, ...style })];
    const inner = { width: 0.0009, alpha: 0.32, delay: (style.delay ?? 0) + 0.15, span: 0.25 };
    if (diagonal) {
        const n = cols + rows;
        for (let i = 1; i < n; i += 1) {
            const t = i / n;
            paths.push(segment([x + w * Math.min(1, t * 2), y + h * Math.max(0, t * 2 - 1)], [x + w * Math.max(0, t * 2 - 1), y + h * Math.min(1, t * 2)], inner));
            paths.push(segment([x + w * (1 - Math.min(1, t * 2)), y + h * Math.max(0, t * 2 - 1)], [x + w * (1 - Math.max(0, t * 2 - 1)), y + h * Math.min(1, t * 2)], inner));
        }
    }
    else {
        for (let i = 1; i < cols; i += 1)
            paths.push(segment([x + (w * i) / cols, y], [x + (w * i) / cols, y + h], inner));
        for (let j = 1; j < rows; j += 1)
            paths.push(segment([x, y + (h * j) / rows], [x + w, y + (h * j) / rows], inner));
    }
    return { paths, nodes: [] };
};
/** 殿堂：一排高窗。 */
const tallWindows = (x0, x1, y, h, count, style = {}) => merge(...Array.from({ length: count }, (_, i) => {
    const w = ((x1 - x0) / count) * 0.45;
    const x = x0 + ((x1 - x0) * (i + 0.5)) / count - w / 2;
    return archWindow(x, y, w, h, { alpha: 0.45, ...style, delay: (style.delay ?? 0) + i * 0.07 });
}));
// ---------------------------------------------------------------------------------------------
// 棱镜
/** 碎晶：散落的小三角晶片。 */
const shards = (aspect, random, count, style = {}) => ({
    paths: Array.from({ length: count }, (_, i) => {
        const cx = (0.1 + random() * 0.8) * aspect;
        const cy = 0.12 + random() * 0.76;
        const r = 0.025 + random() * 0.05;
        const a = random() * TAU;
        const points = [0, 1, 2, 0].map(k => [cx + Math.cos(a + (k * TAU) / 3) * r, cy + Math.sin(a + (k * TAU) / 3) * r * (0.7 + random() * 0.6)]);
        return path(points, { width: 0.0014, alpha: 0.5, ...style, delay: (style.delay ?? 0) + i * 0.04, span: 0.25 });
    }),
    nodes: [],
});
/** 发射谱线：一排长短不一的竖线（下面一条刻度基线）。 */
const spectrumLines = (x0, x1, y, h, random, count, style = {}) => ({
    paths: [
        segment([x0, y + h / 2], [x1, y + h / 2], { width: 0.001, alpha: 0.35, ...style }),
        ...Array.from({ length: count }, (_, i) => {
            const x = x0 + (x1 - x0) * (0.05 + 0.9 * random());
            const k = 0.3 + random() * 0.7;
            return segment([x, y + h / 2], [x, y + h / 2 - h * k], { width: 0.0012 + random() * 0.0012, alpha: 0.4 + k * 0.3, delay: (style.delay ?? 0) + 0.1 + i * 0.03, span: 0.2 });
        }),
    ],
    nodes: [],
});
/** 立方分光镜：正方形 + 对角的分光面。 */
const cubeSplitter = (cx, cy, size, style = {}) => ({
    paths: [
        path([[cx - size / 2, cy - size / 2], [cx + size / 2, cy - size / 2], [cx + size / 2, cy + size / 2], [cx - size / 2, cy + size / 2], [cx - size / 2, cy - size / 2]], { width: 0.002, alpha: 0.6, ...style }),
        segment([cx - size / 2, cy + size / 2], [cx + size / 2, cy - size / 2], { width: 0.0012, alpha: 0.45, delay: (style.delay ?? 0) + 0.2 }),
    ],
    nodes: [node([cx, cy], 0.022, (style.delay ?? 0) + 0.35)],
});
/** 虹与霓：两道同心弧。 */
const rainbowArcs = (cx, cy, r, style = {}) => ({
    paths: [
        path(arcPoints(cx, cy, r, Math.PI * 1.08, Math.PI * 1.92, 72), { width: 0.0018, alpha: 0.5, ...style }),
        path(arcPoints(cx, cy, r * 1.18, Math.PI * 1.1, Math.PI * 1.9, 72), { width: 0.001, alpha: 0.3, delay: (style.delay ?? 0) + 0.15, dash: [0.006, 0.01] }),
        circle(cx, cy - r * 0.4, 0.03, { width: 0.0012, alpha: 0.45, delay: (style.delay ?? 0) + 0.3 }),
    ],
    nodes: [],
});
// ---------------------------------------------------------------------------------------------
// 焦散
/** 玻璃杯：杯口椭圆 + 杯身。 */
const glassCup = (cx, top, w, h, style = {}) => ({
    paths: [
        path(ellipsePath(cx, top, w / 2, w * 0.12), { width: 0.0016, alpha: 0.5, ...style }),
        path([[cx - w / 2, top], [cx - w * 0.4, top + h], [cx + w * 0.4, top + h], [cx + w / 2, top]], { width: 0.0016, alpha: 0.5, delay: (style.delay ?? 0) + 0.1 }),
        path(ellipsePath(cx, top + h, w * 0.4, w * 0.09, 0, 0, Math.PI), { width: 0.001, alpha: 0.35, delay: (style.delay ?? 0) + 0.2 }),
    ],
    nodes: [node([cx - w * 0.3, top + h * 0.3], 0.016, (style.delay ?? 0) + 0.35)],
});
/** 涟漪：同心圆（扁）。 */
const ripples = (cx, cy, r, count, style = {}) => ({
    paths: Array.from({ length: count }, (_, i) => path(ellipsePath(cx, cy, r * (i + 1) / count, r * 0.3 * (i + 1) / count), {
        width: 0.0012, alpha: 0.5 - i * 0.07, ...style, delay: (style.delay ?? 0) + i * 0.08,
    })),
    nodes: [node([cx, cy], 0.02, (style.delay ?? 0) + 0.3)],
});
/** 水面：一条起伏的线（从下往上看的水面）。 */
const waterline = (aspect, y, amplitude, waves, style = {}) => ({
    paths: [path(Array.from({ length: 121 }, (_, i) => {
            const x = (i / 120) * aspect;
            return [x, y + Math.sin((i / 120) * waves * TAU) * amplitude];
        }), { width: 0.0014, alpha: 0.45, ...style, span: 0.6 })],
    nodes: [],
});
/** 放大镜：镜片圆 + 手柄。 */
const magnifier = (cx, cy, r, style = {}) => ({
    paths: [
        circle(cx, cy, r, { width: 0.0022, alpha: 0.6, ...style }),
        circle(cx, cy, r * 0.9, { width: 0.0009, alpha: 0.3, delay: (style.delay ?? 0) + 0.1 }),
        segment([cx + r * 0.7, cy + r * 0.7], [cx + r * 1.6, cy + r * 1.6], { width: 0.004, alpha: 0.5, delay: (style.delay ?? 0) + 0.2 }),
    ],
    nodes: [],
});
/** 水晶：六边形晶面与内部的刻面线。 */
const crystal = (cx, cy, r, style = {}) => {
    const outer = Array.from({ length: 7 }, (_, i) => [cx + Math.cos((i * TAU) / 6) * r, cy + Math.sin((i * TAU) / 6) * r * 1.3]);
    return {
        paths: [
            path(outer, { width: 0.002, alpha: 0.55, ...style }),
            ...[0, 1, 2].map(i => segment(outer[i], outer[i + 3], { width: 0.0009, alpha: 0.3, delay: (style.delay ?? 0) + 0.15 + i * 0.05 })),
        ],
        nodes: outer.slice(0, 6).filter((_, i) => i % 2 === 0).map((at, i) => node(at, 0.016, (style.delay ?? 0) + 0.4, i)),
    };
};
// ---------------------------------------------------------------------------------------------
// 光路
/** 透镜：双凸（convex）或双凹（concave）的轮廓 + 贯穿的光轴虚线。 */
const lens = (cx, cy, h, convex, aspect, style = {}) => {
    const bulge = h * 0.18;
    const top = [cx, cy - h / 2];
    const bottom = [cx, cy + h / 2];
    const side = (sign) => cubicPoints(top, [cx + sign * (convex ? bulge : -bulge * 0.2) + (convex ? 0 : sign * bulge * 0.6), cy - h / 4], [cx + sign * (convex ? bulge : -bulge * 0.2) + (convex ? 0 : sign * bulge * 0.6), cy + h / 4], bottom, 32);
    const outline = convex ? [...side(1), ...side(-1).reverse()] : [
        [cx - bulge * 0.7, cy - h / 2], [cx + bulge * 0.7, cy - h / 2],
        ...cubicPoints([cx + bulge * 0.7, cy - h / 2], [cx + bulge * 0.1, cy - h / 4], [cx + bulge * 0.1, cy + h / 4], [cx + bulge * 0.7, cy + h / 2], 24),
        [cx - bulge * 0.7, cy + h / 2],
        ...cubicPoints([cx - bulge * 0.7, cy + h / 2], [cx - bulge * 0.1, cy + h / 4], [cx - bulge * 0.1, cy - h / 4], [cx - bulge * 0.7, cy - h / 2], 24),
    ];
    return {
        paths: [
            path(outline, { width: 0.002, alpha: 0.6, ...style }),
            segment([aspect * 0.05, cy], [aspect * 0.95, cy], { width: 0.0009, alpha: 0.3, delay: (style.delay ?? 0) + 0.1, dash: [0.008, 0.008], span: 0.5 }),
        ],
        nodes: [],
    };
};
/** 一条光线（折线），终点有闪点。 */
const rayPath = (points, style = {}) => ({
    paths: [path(points, { width: 0.0014, alpha: 0.6, span: 0.5, ...style })],
    nodes: [node(points[points.length - 1], 0.016, (style.delay ?? 0) + (style.span ?? 0.5), points.length)],
});
/** 焦点标记：小十字 + 标签位置的短横。 */
const focusMark = (x, y, style = {}) => ({
    paths: [
        segment([x - 0.012, y], [x + 0.012, y], { width: 0.0012, alpha: 0.55, ...style }),
        segment([x, y - 0.012], [x, y + 0.012], { width: 0.0012, alpha: 0.55, ...style }),
    ],
    nodes: [node([x, y], 0.024, (style.delay ?? 0) + 0.3)],
});
/** 平面镜：一条粗线、背面的斜线阴影、法线虚线与入射 / 反射角的小弧。 */
const mirror = (cx, cy, length, angle, style = {}) => {
    const dx = Math.cos(angle) * length / 2;
    const dy = Math.sin(angle) * length / 2;
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const hatches = Array.from({ length: 10 }, (_, i) => {
        const t = -0.45 + (i / 9) * 0.9;
        const bx = cx + dx * 2 * t;
        const by = cy + dy * 2 * t;
        return segment([bx, by], [bx + nx * 0.015 - dx * 0.04, by + ny * 0.015 - dy * 0.04], { width: 0.0008, alpha: 0.3, delay: (style.delay ?? 0) + 0.2 + i * 0.01, span: 0.1 });
    });
    return {
        paths: [
            segment([cx - dx, cy - dy], [cx + dx, cy + dy], { width: 0.003, alpha: 0.6, ...style }),
            ...hatches,
            segment([cx, cy], [cx - nx * length * 0.5, cy - ny * length * 0.5], { width: 0.0009, alpha: 0.35, delay: (style.delay ?? 0) + 0.25, dash: [0.006, 0.006] }),
            path(arcPoints(cx, cy, length * 0.12, Math.atan2(-ny, -nx) - 0.5, Math.atan2(-ny, -nx) + 0.5, 20), { width: 0.0009, alpha: 0.4, delay: (style.delay ?? 0) + 0.35 }),
        ],
        nodes: [],
    };
};
/** 介质界面：一条横线，下半部分用细斜线表示另一种介质。 */
const interfaceLine = (aspect, y, style = {}) => ({
    paths: [
        segment([aspect * 0.06, y], [aspect * 0.94, y], { width: 0.002, alpha: 0.55, ...style, span: 0.5 }),
        ...Array.from({ length: 24 }, (_, i) => {
            const x = aspect * (0.08 + (i / 23) * 0.84);
            return segment([x, y + 0.01], [x - 0.02, y + 0.04], { width: 0.0008, alpha: 0.22, delay: (style.delay ?? 0) + 0.2 + i * 0.01, span: 0.1 });
        }),
    ],
    nodes: [],
});
/** 光具座：一条长刻度尺。 */
const ruler = (x0, x1, y, ticks, style = {}) => ({
    paths: [
        segment([x0, y], [x1, y], { width: 0.0016, alpha: 0.5, ...style, span: 0.5 }),
        ...Array.from({ length: ticks + 1 }, (_, i) => {
            const x = x0 + ((x1 - x0) * i) / ticks;
            const long = i % 5 === 0;
            return segment([x, y], [x, y + (long ? 0.02 : 0.01)], { width: 0.0008, alpha: 0.4, delay: (style.delay ?? 0) + 0.2 + i * 0.005, span: 0.08 });
        }),
    ],
    nodes: [],
});
/** 光纤：一条弯曲的双线管道。 */
const fiber = (points, thickness, style = {}) => {
    const center = cubicPoints(...points, 60);
    const offset = (sign) => center.map(([x, y], i) => {
        const [nx0, ny0] = center[Math.max(0, i - 1)];
        const [nx1, ny1] = center[Math.min(center.length - 1, i + 1)];
        const dx = nx1 - nx0;
        const dy = ny1 - ny0;
        const len = Math.hypot(dx, dy) || 1;
        return [x - (dy / len) * thickness * sign, y + (dx / len) * thickness * sign];
    });
    return {
        paths: [path(offset(1), { width: 0.0014, alpha: 0.5, ...style, span: 0.6 }), path(offset(-1), { width: 0.0014, alpha: 0.5, ...style, delay: (style.delay ?? 0) + 0.05, span: 0.6 })],
        nodes: [node(center[center.length - 1], 0.024, (style.delay ?? 0) + 0.6)],
    };
};
/** 暗箱：一个盒子，正面开小孔，背面有倒立的箭头像。 */
const pinholeBox = (cx, cy, w, h, style = {}) => ({
    paths: [
        path([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2], [cx - w / 2, cy - h / 2]], { width: 0.0018, alpha: 0.5, ...style }),
        segment([cx - w / 2 - 0.25, cy - h * 0.35], [cx - w / 2 - 0.25, cy + h * 0.35], { width: 0.0016, alpha: 0.45, delay: (style.delay ?? 0) + 0.1 }),
        segment([cx + w / 2 - 0.02, cy + h * 0.28], [cx + w / 2 - 0.02, cy - h * 0.28], { width: 0.0014, alpha: 0.4, delay: (style.delay ?? 0) + 0.3, dash: [0.005, 0.005] }),
        segment([cx - w / 2 - 0.25, cy - h * 0.35], [cx + w / 2 - 0.02, cy + h * 0.28], { width: 0.0008, alpha: 0.3, delay: (style.delay ?? 0) + 0.2 }),
        segment([cx - w / 2 - 0.25, cy + h * 0.35], [cx + w / 2 - 0.02, cy - h * 0.28], { width: 0.0008, alpha: 0.3, delay: (style.delay ?? 0) + 0.2 }),
    ],
    nodes: [node([cx - w / 2, cy], 0.02, (style.delay ?? 0) + 0.3)],
});
// ---------------------------------------------------------------------------------------------
// 干涉
const rings = (cx, cy, r, count, style = {}) => concentric(cx, cy, Array.from({ length: count }, (_, i) => r * Math.sqrt((i + 1) / count)), style);
/** 光栅：一条带密集缝的横线。 */
const grating = (cx, y, width, slits, style = {}) => ({
    paths: [
        segment([cx - width / 2, y], [cx + width / 2, y], { width: 0.0022, alpha: 0.55, ...style }),
        ...Array.from({ length: slits }, (_, i) => {
            const x = cx - width * 0.3 + (width * 0.6 * i) / Math.max(1, slits - 1);
            return segment([x, y - 0.01], [x, y + 0.01], { width: 0.0008, alpha: 0.4, delay: (style.delay ?? 0) + 0.15 + i * 0.01, span: 0.1 });
        }),
    ],
    nodes: [],
});
/** 两个点源和各自的一圈圈波前。 */
const twoSources = (cx, cy, separation, r, style = {}) => merge(concentric(cx - separation / 2, cy, [r * 0.25, r * 0.5, r * 0.75, r], { alpha: 0.3, ...style }), concentric(cx + separation / 2, cy, [r * 0.25, r * 0.5, r * 0.75, r], { alpha: 0.3, ...style, delay: (style.delay ?? 0) + 0.1 }), { paths: [], nodes: [node([cx - separation / 2, cy], 0.024, 0.3), node([cx + separation / 2, cy], 0.024, 0.35, 1)] });
/** 莫尔：两组细平行线，第二组略转一个角度。 */
const moire = (cx, cy, size, count, rotation, style = {}) => {
    const set = (angle, delay) => Array.from({ length: count }, (_, i) => {
        const t = -0.5 + i / (count - 1);
        const ox = Math.cos(angle + Math.PI / 2) * t * size;
        const oy = Math.sin(angle + Math.PI / 2) * t * size;
        return segment([cx + ox - Math.cos(angle) * size / 2, cy + oy - Math.sin(angle) * size / 2], [cx + ox + Math.cos(angle) * size / 2, cy + oy + Math.sin(angle) * size / 2], {
            width: 0.0008, alpha: 0.3, ...style, delay: delay + i * 0.008, span: 0.15,
        });
    });
    return { paths: [...set(0, style.delay ?? 0), ...set(rotation, (style.delay ?? 0) + 0.2)], nodes: [] };
};
/** 驻波：几条上下对称的正弦（波腹与波节）。 */
const standingWave = (x0, x1, y, amplitude, loops, style = {}) => ({
    paths: [-1, -0.5, 0.5, 1].map((k, j) => path(Array.from({ length: 121 }, (_, i) => {
        const t = i / 120;
        return [x0 + (x1 - x0) * t, y + Math.sin(t * loops * Math.PI) * amplitude * k];
    }), { width: 0.0012, alpha: 0.35 + Math.abs(k) * 0.2, ...style, delay: (style.delay ?? 0) + j * 0.06, span: 0.5 })),
    nodes: Array.from({ length: loops + 1 }, (_, i) => node([x0 + ((x1 - x0) * i) / loops, y], 0.014, (style.delay ?? 0) + 0.5, i)),
});
/** 偏振片：两个圆，里面各一组平行线（第二组转过一个角度）。 */
const polarizers = (cx, cy, r, gap, rotation, style = {}) => {
    const disc = (x, angle, delay) => [
        circle(x, cy, r, { width: 0.0016, alpha: 0.5, ...style, delay }),
        ...Array.from({ length: 7 }, (_, i) => {
            const t = -0.75 + (i / 6) * 1.5;
            const half = Math.sqrt(Math.max(0, 1 - t * t)) * r;
            const ox = -Math.sin(angle) * t * r;
            const oy = Math.cos(angle) * t * r;
            return segment([x + ox - Math.cos(angle) * half, cy + oy - Math.sin(angle) * half], [x + ox + Math.cos(angle) * half, cy + oy + Math.sin(angle) * half], { width: 0.0008, alpha: 0.3, delay: delay + 0.15 + i * 0.02, span: 0.15 });
        }),
    ];
    return { paths: [...disc(cx - gap / 2, 0, style.delay ?? 0), ...disc(cx + gap / 2, rotation, (style.delay ?? 0) + 0.2)], nodes: [] };
};
// ---------------------------------------------------------------------------------------------
// 叶脉
/** 一片大叶：外轮廓、主脉与多对侧脉。 */
const bigLeaf = (cx, cy, length, angle, style = {}) => {
    const d = [Math.cos(angle), Math.sin(angle)];
    const n = [-d[1], d[0]];
    const at = (along, across) => [cx + d[0] * length * (along - 0.5) + n[0] * across, cy + d[1] * length * (along - 0.5) + n[1] * across];
    const bulge = length * 0.3;
    const paths = [
        path(cubicPoints(at(0, 0), at(0.3, bulge), at(0.75, bulge * 0.8), at(1, 0), 48), { width: 0.002, alpha: 0.6, ...style, span: 0.4 }),
        path(cubicPoints(at(0, 0), at(0.3, -bulge), at(0.75, -bulge * 0.8), at(1, 0), 48), { width: 0.002, alpha: 0.6, ...style, delay: (style.delay ?? 0) + 0.05, span: 0.4 }),
        path([at(-0.12, 0), at(1, 0)], { width: 0.0014, alpha: 0.5, delay: (style.delay ?? 0) + 0.15, span: 0.4 }),
    ];
    for (let v = 1; v <= 6; v += 1) {
        const f = v / 7.5;
        for (const s of [1, -1]) {
            paths.push(path(cubicPoints(at(f, 0), at(f + 0.05, s * bulge * 0.3), at(f + 0.1, s * bulge * 0.55), at(f + 0.15, s * bulge * (0.8 - f * 0.35)), 16), {
                width: 0.0009, alpha: 0.4, delay: (style.delay ?? 0) + 0.25 + v * 0.05, span: 0.18,
            }));
        }
    }
    return { paths, nodes: [node(at(1, 0), 0.026, (style.delay ?? 0) + 0.6)] };
};
/** 林冠：从画面上方垂下的枝条（递归分叉）。 */
const canopy = (aspect, random, style = {}) => {
    const paths = [];
    const grow = (x, y, angle, length, depth, delay) => {
        const x1 = x + Math.cos(angle) * length;
        const y1 = y + Math.sin(angle) * length;
        paths.push(segment([x, y], [x1, y1], { width: 0.0008 + depth * 0.0005, alpha: 0.3 + depth * 0.08, delay, span: 0.2 }));
        if (depth <= 0)
            return;
        grow(x1, y1, angle - 0.35 - random() * 0.3, length * 0.72, depth - 1, delay + 0.08);
        grow(x1, y1, angle + 0.35 + random() * 0.3, length * 0.72, depth - 1, delay + 0.08);
    };
    [0.08, 0.35, 0.65, 0.92].forEach((fx, i) => grow(fx * aspect, -0.02, Math.PI / 2 + (random() - 0.5) * 0.6, 0.14, 4, (style.delay ?? 0) + i * 0.05));
    return { paths, nodes: [] };
};
/** 蕨卷：对数螺线 + 两侧的小叶片。 */
const fernCurl = (cx, cy, r, style = {}) => {
    const spiral = Array.from({ length: 140 }, (_, i) => {
        const t = i / 139;
        const a = t * TAU * 2.2;
        const rr = r * Math.exp(-t * 2.4);
        return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    });
    const stem = [[cx + r, cy], [cx + r, cy + r * 2.2]];
    const leaflets = Array.from({ length: 9 }, (_, i) => {
        const [x, y] = spiral[Math.floor((i / 9) * 90)];
        return circle(x, y, 0.008 + (1 - i / 9) * 0.01, { width: 0.0008, alpha: 0.35, delay: (style.delay ?? 0) + 0.4 + i * 0.03, span: 0.1 });
    });
    return { paths: [path(stem, { width: 0.0016, alpha: 0.5, ...style }), path(spiral, { width: 0.0016, alpha: 0.55, ...style, delay: (style.delay ?? 0) + 0.1, span: 0.5 }), ...leaflets], nodes: [] };
};
/** 种子：椭圆种子 + 向下长的须根。 */
const seedRoots = (cx, cy, random, style = {}) => ({
    paths: [
        path(ellipsePath(cx, cy, 0.025, 0.035, 0.3), { width: 0.002, alpha: 0.6, ...style }),
        ...Array.from({ length: 6 }, (_, i) => {
            const spread = (i - 2.5) * 0.05;
            return path(cubicPoints([cx, cy + 0.03], [cx + spread * 0.4, cy + 0.08], [cx + spread, cy + 0.12], [cx + spread * 1.4 + (random() - 0.5) * 0.04, cy + 0.2 + random() * 0.06], 24), {
                width: 0.0009, alpha: 0.4, delay: (style.delay ?? 0) + 0.2 + i * 0.05, span: 0.35,
            });
        }),
    ],
    nodes: [node([cx, cy - 0.04], 0.03, (style.delay ?? 0) + 0.2)],
});
/** 花：以中心为原点的一圈花瓣（每片一条闭合曲线）。 */
const bloom = (cx, cy, r, petals, style = {}) => ({
    paths: [
        ...Array.from({ length: petals }, (_, i) => {
            const a = (i / petals) * TAU;
            const d = [Math.cos(a), Math.sin(a)];
            const n = [-d[1], d[0]];
            const tip = [cx + d[0] * r, cy + d[1] * r];
            const w = r * 0.35;
            return path([
                ...cubicPoints([cx, cy], [cx + d[0] * r * 0.4 + n[0] * w, cy + d[1] * r * 0.4 + n[1] * w], [cx + d[0] * r * 0.9 + n[0] * w * 0.6, cy + d[1] * r * 0.9 + n[1] * w * 0.6], tip, 20),
                ...cubicPoints(tip, [cx + d[0] * r * 0.9 - n[0] * w * 0.6, cy + d[1] * r * 0.9 - n[1] * w * 0.6], [cx + d[0] * r * 0.4 - n[0] * w, cy + d[1] * r * 0.4 - n[1] * w], [cx, cy], 20),
            ], { width: 0.0016, alpha: 0.5, ...style, delay: (style.delay ?? 0) + i * 0.05, span: 0.3 });
        }),
        circle(cx, cy, r * 0.12, { width: 0.0012, alpha: 0.5, delay: (style.delay ?? 0) + 0.4 }),
    ],
    nodes: [node([cx, cy], 0.03, (style.delay ?? 0) + 0.5)],
});
/** 藤：一条向上攀的螺旋（正弦）+ 卷须。 */
const vine = (x, bottom, top, amplitude, turns, style = {}) => ({
    paths: [
        path(Array.from({ length: 161 }, (_, i) => {
            const t = i / 160;
            return [x + Math.sin(t * turns * TAU) * amplitude * (1 - t * 0.4), bottom + (top - bottom) * t];
        }), { width: 0.0016, alpha: 0.55, ...style, span: 0.7 }),
        segment([x, bottom], [x, top], { width: 0.0008, alpha: 0.25, delay: (style.delay ?? 0) + 0.1, dash: [0.005, 0.008], span: 0.5 }),
    ],
    nodes: [node([x, top], 0.024, (style.delay ?? 0) + 0.7)],
});
/** 显微视野：一个大圆视野 + 里面一群细胞（小椭圆）。 */
const cells = (cx, cy, r, random, count, style = {}) => ({
    paths: [
        circle(cx, cy, r, { width: 0.0022, alpha: 0.5, ...style }),
        ...Array.from({ length: count }, (_, i) => {
            const a = random() * TAU;
            const d = Math.sqrt(random()) * r * 0.8;
            return path(ellipsePath(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.012 + random() * 0.012, 0.008 + random() * 0.008, random() * Math.PI), {
                width: 0.0009, alpha: 0.4, delay: (style.delay ?? 0) + 0.15 + i * 0.02, span: 0.15,
            });
        }),
    ],
    nodes: [],
});
/** 分子：一个苯环（六边形 + 内圆）+ 几根键。 */
const molecule = (cx, cy, r, style = {}) => {
    const hex = Array.from({ length: 7 }, (_, i) => [cx + Math.cos((i * TAU) / 6 + Math.PI / 6) * r, cy + Math.sin((i * TAU) / 6 + Math.PI / 6) * r]);
    return {
        paths: [
            path(hex, { width: 0.0018, alpha: 0.55, ...style }),
            circle(cx, cy, r * 0.55, { width: 0.001, alpha: 0.35, delay: (style.delay ?? 0) + 0.2 }),
            ...[0, 2, 4].map((k, i) => {
                const [x, y] = hex[k];
                return segment([x, y], [x + (x - cx) * 0.8, y + (y - cy) * 0.8], { width: 0.0012, alpha: 0.45, delay: (style.delay ?? 0) + 0.3 + i * 0.05 });
            }),
        ],
        nodes: [0, 2, 4].map((k, i) => {
            const [x, y] = hex[k];
            return node([x + (x - cx) * 0.8, y + (y - cy) * 0.8], 0.02, (style.delay ?? 0) + 0.45, i);
        }),
    };
};
// ---------------------------------------------------------------------------------------------
// 星象
/** 轨道：一组同心椭圆（倾斜），每条上有一颗行星（闪点）。 */
const orbits = (cx, cy, radii, tilt, flatten, random, style = {}) => ({
    paths: radii.map((r, i) => path(ellipsePath(cx, cy, r, r * flatten, tilt), { width: 0.0012, alpha: 0.45, ...style, delay: (style.delay ?? 0) + i * 0.07, span: 0.5 })),
    nodes: [
        node([cx, cy], 0.04, (style.delay ?? 0) + 0.2),
        ...radii.map((r, i) => {
            const a = random() * TAU;
            const [x, y] = ellipsePath(cx, cy, r, r * flatten, tilt, a, a, 1)[0];
            return node([x, y], 0.018 + random() * 0.012, (style.delay ?? 0) + 0.5 + i * 0.05, i);
        }),
    ],
});
/** 星轨：围绕天极的一圈圈弧。 */
const starTrails = (cx, cy, random, count, maxR, style = {}) => ({
    paths: Array.from({ length: count }, (_, i) => {
        const r = maxR * (0.1 + random() * 0.9);
        const a = random() * TAU;
        const span = 0.4 + random() * 0.8;
        return path(arcPoints(cx, cy, r, a, a + span, 24), { width: 0.0008 + random() * 0.0008, alpha: 0.25 + random() * 0.3, ...style, delay: (style.delay ?? 0) + (i / count) * 0.4, span: 0.3 });
    }),
    nodes: [node([cx, cy], 0.03, (style.delay ?? 0) + 0.1)],
});
/** 六分仪：60° 的刻度弧、两条半径与一条视线。 */
const sextant = (cx, cy, r, style = {}) => merge({
    paths: [
        path(arcPoints(cx, cy, r, Math.PI * 0.33, Math.PI * 0.67, 48), { width: 0.002, alpha: 0.6, ...style }),
        segment([cx, cy], [cx + Math.cos(Math.PI * 0.33) * r, cy + Math.sin(Math.PI * 0.33) * r], { width: 0.0014, alpha: 0.5, delay: (style.delay ?? 0) + 0.1 }),
        segment([cx, cy], [cx + Math.cos(Math.PI * 0.67) * r, cy + Math.sin(Math.PI * 0.67) * r], { width: 0.0014, alpha: 0.5, delay: (style.delay ?? 0) + 0.12 }),
        segment([cx, cy], [cx + Math.cos(Math.PI * 0.45) * r * 1.1, cy + Math.sin(Math.PI * 0.45) * r * 1.1], { width: 0.001, alpha: 0.45, delay: (style.delay ?? 0) + 0.3, dash: [0.006, 0.006] }),
        segment([cx - r * 0.9, cy - r * 0.2], [cx + r * 0.2, cy - r * 0.05], { width: 0.0009, alpha: 0.35, delay: (style.delay ?? 0) + 0.35, dash: [0.004, 0.006] }),
    ],
    nodes: [node([cx, cy], 0.022, (style.delay ?? 0) + 0.3)],
}, rays(cx, cy, r * 0.94, r, 30, Math.PI * 0.33, Math.PI * 0.67, { delay: (style.delay ?? 0) + 0.2, alpha: 0.4 }));
/** 星座：几颗星（闪点）连成折线。 */
const constellation = (aspect, random, count, region, style = {}) => {
    const [x0, y0, x1, y1] = region;
    const stars = Array.from({ length: count }, () => [(x0 + random() * (x1 - x0)) * aspect, y0 + random() * (y1 - y0)]);
    stars.sort((a, b) => a[0] - b[0]);
    return {
        paths: stars.slice(1).map((star, i) => segment(stars[i], star, { width: 0.001, alpha: 0.4, ...style, delay: (style.delay ?? 0) + 0.2 + i * 0.06, span: 0.2 })),
        nodes: stars.map((at, i) => node(at, 0.018 + random() * 0.016, (style.delay ?? 0) + i * 0.05, i)),
    };
};
/** 日冕 / 日食：一个圆盘（黑盘的边）+ 一圈长短不一的放射丝。 */
const corona = (cx, cy, r, random, style = {}) => ({
    paths: [
        circle(cx, cy, r, { width: 0.0024, alpha: 0.65, ...style }),
        ...Array.from({ length: 40 }, (_, i) => {
            const a = (i / 40) * TAU + random() * 0.05;
            const len = r * (0.25 + random() * 0.9);
            return segment([cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 1.05], [cx + Math.cos(a) * (r + len), cy + Math.sin(a) * (r + len)], {
                width: 0.0008, alpha: 0.25 + random() * 0.3, delay: (style.delay ?? 0) + 0.2 + (i / 40) * 0.3, span: 0.15,
            });
        }),
    ],
    nodes: [node([cx + r * 0.7, cy - r * 0.7], 0.03, (style.delay ?? 0) + 0.5)],
});
/** 新月：两段弧围成的月牙。 */
const crescent = (cx, cy, r, style = {}) => ({
    paths: [
        path(arcPoints(cx, cy, r, Math.PI * 0.35, Math.PI * 1.65, 60), { width: 0.002, alpha: 0.6, ...style }),
        path(arcPoints(cx + r * 0.45, cy, r * 0.85, Math.PI * 0.58, Math.PI * 1.42, 60), { width: 0.0012, alpha: 0.4, delay: (style.delay ?? 0) + 0.15 }),
    ],
    nodes: [],
});
/** 浑天仪：几个倾斜的环 + 一根轴。 */
const armillary = (cx, cy, r, style = {}) => ({
    paths: [
        circle(cx, cy, r, { width: 0.002, alpha: 0.55, ...style }),
        path(ellipsePath(cx, cy, r, r * 0.3, 0), { width: 0.0014, alpha: 0.45, delay: (style.delay ?? 0) + 0.1 }),
        path(ellipsePath(cx, cy, r, r * 0.3, 0.41), { width: 0.0014, alpha: 0.45, delay: (style.delay ?? 0) + 0.15 }),
        path(ellipsePath(cx, cy, r * 0.3, r, 0), { width: 0.0012, alpha: 0.4, delay: (style.delay ?? 0) + 0.2 }),
        segment([cx - Math.sin(0.41) * r * 1.25, cy - Math.cos(0.41) * r * 1.25], [cx + Math.sin(0.41) * r * 1.25, cy + Math.cos(0.41) * r * 1.25], { width: 0.0012, alpha: 0.45, delay: (style.delay ?? 0) + 0.3 }),
    ],
    nodes: [node([cx, cy], 0.03, (style.delay ?? 0) + 0.3)],
});
/** 流星：几条斜向的光迹（头上有闪点）。 */
const meteors = (aspect, random, count, style = {}) => {
    const paths = [];
    const nodes = [];
    for (let i = 0; i < count; i += 1) {
        const x = (0.2 + random() * 0.8) * aspect;
        const y = random() * 0.5;
        const len = 0.12 + random() * 0.25;
        const head = [x - len * 0.8, y + len * 0.6];
        paths.push(segment([x, y], head, { width: 0.0012 + random() * 0.001, alpha: 0.45, ...style, delay: (style.delay ?? 0) + i * 0.08, span: 0.2 }));
        nodes.push(node(head, 0.02, (style.delay ?? 0) + i * 0.08 + 0.2, i));
    }
    return { paths, nodes };
};
// ---------------------------------------------------------------------------------------------
// 追光
/** 灯头：光源处的小梯形灯罩（朝向光束方向）。 */
const lampHead = (x, y, angle, size, style = {}) => {
    const d = [Math.cos(angle), Math.sin(angle)];
    const n = [-d[1], d[0]];
    const back = [x - d[0] * size, y - d[1] * size];
    const corners = [
        [back[0] + n[0] * size * 0.35, back[1] + n[1] * size * 0.35],
        [x + n[0] * size * 0.6, y + n[1] * size * 0.6],
        [x - n[0] * size * 0.6, y - n[1] * size * 0.6],
        [back[0] - n[0] * size * 0.35, back[1] - n[1] * size * 0.35],
    ];
    return { paths: [path([...corners, corners[0]], { width: 0.0018, alpha: 0.55, span: 0.3, ...style })], nodes: [] };
};
/** 帷幕：两侧各一片带褶皱的幕布（竖向波浪线）。 */
const curtains = (aspect, gap, style = {}) => ({
    paths: [-1, 1].flatMap(side => Array.from({ length: 6 }, (_, i) => {
        const base = aspect / 2 + side * (gap / 2 + i * 0.05);
        return path(Array.from({ length: 41 }, (_, k) => {
            const t = k / 40;
            return [base + Math.sin(t * 5 + i) * 0.008 * side, -0.02 + t * 1.04];
        }), { width: 0.001 + (5 - i) * 0.0002, alpha: 0.2 + (5 - i) * 0.05, ...style, delay: (style.delay ?? 0) + i * 0.05, span: 0.5 });
    })),
    nodes: [],
});
/** 放映机：侧面的机身、两个片盘。 */
const projector = (x, y, size, style = {}) => ({
    paths: [
        path([[x - size, y - size * 0.3], [x, y - size * 0.3], [x, y + size * 0.3], [x - size, y + size * 0.3], [x - size, y - size * 0.3]], { width: 0.0018, alpha: 0.55, ...style }),
        circle(x - size * 0.75, y - size * 0.65, size * 0.33, { width: 0.0014, alpha: 0.5, delay: (style.delay ?? 0) + 0.1 }),
        circle(x - size * 0.25, y - size * 0.65, size * 0.33, { width: 0.0014, alpha: 0.5, delay: (style.delay ?? 0) + 0.15 }),
        path([[x, y - size * 0.12], [x + size * 0.18, y - size * 0.18], [x + size * 0.18, y + size * 0.18], [x, y + size * 0.12]], { width: 0.0014, alpha: 0.5, delay: (style.delay ?? 0) + 0.2 }),
    ],
    nodes: [node([x + size * 0.18, y], 0.024, (style.delay ?? 0) + 0.3)],
});
// ---------------------------------------------------------------------------------------------
// 通用
/** 一条地平线（带短刻度）。 */
const horizon = (aspect, y, style = {}) => ({
    paths: [
        segment([0, y], [aspect, y], { width: 0.0014, alpha: 0.4, ...style, span: 0.6 }),
        ...Array.from({ length: 16 }, (_, i) => segment([aspect * (i + 0.5) / 16, y], [aspect * (i + 0.5) / 16, y + 0.012], { width: 0.0008, alpha: 0.3, delay: (style.delay ?? 0) + 0.3 + i * 0.01, span: 0.08 })),
    ],
    nodes: [],
});

// ======== components/visualizer/lumiere/rigs/base ========

// src/components/visualizer/lumiere/rigs/base.ts
// 各族光位共用的积木：光束预设、烟雾、浮尘、星空、线稿，以及按族填默认值的光位构造器。
const TOP = { x: 0.5, y: -0.04 };
const DOWN = Math.PI / 2;
/** 主光柱：窄、亮、束内有一丝丝的亮纹。 */
const shaft = (overrides = {}) => ({
    ...TOP, angle: DOWN, spread: 0.09, width: 0.05, length: 0.8, softness: 0.6,
    intensity: 0.95, streaks: 0.6, streakFreq: 7, streakSpeed: 0.08, core: 0.75,
    sway: { amplitude: 0.012, period: 13, phase: 0 },
    ...overrides,
});
/** 主光柱外的一圈放射光扇。 */
const fan = (overrides = {}) => ({
    ...TOP, angle: DOWN, spread: 0.3, length: 0.6, softness: 0.9,
    intensity: 0.32, streaks: 0.85, streakFreq: 26, streakSpeed: 0.05, core: 0.4,
    sway: { amplitude: 0.02, period: 17, phase: 0.3 },
    ...overrides,
});
const FOG = { density: 1, tyndallBase: 0.12, scale: 2.4, driftX: 0.008, driftY: -0.04, warp: 0.9, ambient: 0.03 };
const GLARE = { x: 0.5, y: 0.0, radius: 0.12, intensity: 0.9, streak: 0.45 };
const MOTES = {
    count: 260, sizeMin: 0.004, sizeMax: 0.013, driftX: 0.004, driftY: -0.01,
    swirl: 0.02, swirlPeriod: 9, twinkle: 0.5, ambient: 0.015, gain: 1.3,
};
const FRONT = {
    count: 9, sizeMin: 0.05, sizeMax: 0.15, driftX: 0.006, driftY: -0.002,
    swirl: 0.012, swirlPeriod: 14, twinkle: 0.2, ambient: 0.02, gain: 0.3,
};
const STARFALL = { stars: 420, opening: 3.2, rain: 70, rainSpeed: 0.22, rainSpread: 0.35, brightness: 1 };
/** 量角器光环 + 取景框 + 散落闪点（参考图的线稿）。 */
const standardArt = ({ aspect, random }, haloRadius = 0.3) => mergeSpecs(protractorHalo({ cx: aspect * 0.5, cy: 0.03, radius: haloRadius, alpha: 0.55 }), viewfinderFrame({ aspect, left: 0.07, top: 0.21, right: 0.93, bottom: 0.8, delay: 0.1, alpha: 0.32 }), scatteredSparks({ aspect, count: 16, random, delay: 0.3 }));
/** 只有取景框与闪点（光路、干涉这类自己画图解的族用）。 */
const frameArt = ({ aspect, random }) => mergeSpecs(viewfinderFrame({ aspect, left: 0.07, top: 0.21, right: 0.93, bottom: 0.8, delay: 0.1, alpha: 0.28 }), scatteredSparks({ aspect, count: 14, random, delay: 0.3 }));
const ellipse = (cx, cy, rx, ry, steps = 96) => (arcPoints(0, 0, 1, 0, Math.PI * 2, steps).map(([x, y]) => [cx + x * rx, cy + y * ry]));
const rig = (beams, fog = {}, glare = GLARE, modules = {}) => () => ({
    beams,
    fog: { ...FOG, ...fog },
    glare,
    ...modules,
});
/** 按族填默认值的光位构造器：各光位只写不同的地方。 */
const familyOf = (family, defaults = {}) => (profile) => ({
    family,
    motes: MOTES,
    front: FRONT,
    lineArt: context => standardArt(context),
    region: { cx: 0.5, cy: 0.54, w: 0.72, h: 0.5 },
    heroSize: 0.085,
    camera: { push: 0.035, driftX: 0, driftY: -0.006 },
    ...defaults,
    ...profile,
});

// ======== components/visualizer/lumiere/rigs/astral ========
// Copyright (c) 2026 chthollyphile



// src/components/visualizer/lumiere/rigs/astral.ts
// 星象族：日食、日冕、轨道、星轨、星座、月与星云。默认带满天的星（星空点亮的星多、光雨少）。
// 排版 4 横 / 3 竖 / 3 纵横。
const astral = familyOf('astral', {
    starfall: { ...STARFALL, stars: 620, rain: 20, brightness: 1.1 },
    motes: { ...MOTES, count: 160 },
    // 轨道、星轨、星座、浑天仪的线稿是这一族的主角。
    artGain: 2,
});
const sparks__1 = ({ aspect, random }) => scatteredSparks({ aspect, count: 20, random, delay: 0.3 });
/** 从圆盘 (cx, cy, r) 的边缘向外放射的一圈光束（日冕、日食）。 */
const radial = (cx, cy, r, aspect, count, overrides = {}) => (Array.from({ length: count }, (_, k) => {
    const angle = (k / count) * Math.PI * 2 + 0.3;
    return shaft({
        x: cx + (Math.cos(angle) * r) / aspect, y: cy + Math.sin(angle) * r, angle, spread: 0.14, width: 0.04, length: 0.35, softness: 0.8,
        intensity: 0.7, streaks: 0.7, streakFreq: 12, core: 0.3, sway: { amplitude: 0.04, period: 9 + k, phase: k / count },
        ...overrides,
    });
}));
/** 日食（l）：黑盘周围一圈日冕光，边上一颗贝利珠闪光。 */
const astralEclipse = astral({
    kind: 'astral-eclipse',
    label: '日食',
    mood: 'loud',
    light: ({ aspect }) => ({
        beams: radial(0.5, 0.34, 0.13, aspect, 6),
        fog: { density: 0.8, tyndallBase: 0.2, scale: 2.4, driftX: 0.004, driftY: -0.01, warp: 0.9, ambient: 0.02 },
        glare: { x: 0.5 + 0.13 * Math.cos(-0.8) / aspect, y: 0.34 + 0.13 * Math.sin(-0.8), radius: 0.05, intensity: 1.3, streak: 0.9 },
    }),
    lineArt: ({ aspect, random }) => mergeDiagrams(corona(aspect * 0.5, 0.34, 0.13, random), sparks__1({ aspect, random })),
    region: { cx: 0.5, cy: 0.7, w: 0.72, h: 0.4 },
    typography: 'crossed',
    burst: { mode: 'sung', density: 0.35, every: 1, offset: 0, size: 3.6, tint: [1, 0.6, 0.45] },
    decay: { strength: 1.3, delay: 0.7 },
});
/** 轨道（q）：同心的椭圆轨道，行星光点在上面。 */
const astralOrbit = astral({
    kind: 'astral-orbit',
    label: '轨道',
    mood: 'quiet',
    light: rig([shaft({ spread: 0.05, intensity: 0.45, reach: 0.4 })], { density: 0.6, ambient: 0.015 }, { x: 0.5, y: 0.42, radius: 0.05, intensity: 1, streak: 0.5 }),
    lineArt: ({ aspect, random }) => mergeDiagrams(orbits(aspect * 0.5, 0.42, [0.12, 0.2, 0.3, 0.42], -0.18, 0.34, random), sparks__1({ aspect, random })),
    region: { cx: 0.5, cy: 0.74, w: 0.72, h: 0.32 },
    typography: 'horizontal',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 星轨（q）：绕着天极缓慢旋转的一圈圈星轨。 */
const astralTrail = astral({
    kind: 'astral-trail',
    label: '星轨',
    mood: 'quiet',
    light: rig([shaft({ x: 0.72, spread: 0.04, intensity: 0.35 })], { density: 0.5, ambient: 0.01 }, null),
    lineArt: ({ aspect, random }) => mergeDiagrams(starTrails(aspect * 0.72, 0.12, random, 60, 0.9)),
    region: { cx: 0.36, cy: 0.54, w: 0.44, h: 0.6 },
    typography: 'vertical',
    decay: { strength: 0.5, delay: 1.8 },
});
/** 六分仪（n）：刻度弧、两条半径与一条对准太阳的视线。 */
const astralSextant = astral({
    kind: 'astral-sextant',
    label: '六分仪',
    mood: 'neutral',
    light: rig([shaft({ x: 0.85, y: -0.05, angle: 2.2, spread: 0.05, width: 0.03, length: 1.4, intensity: 0.9 })], { density: 0.8 }, { ...GLARE, x: 0.85, y: -0.02 }),
    lineArt: ({ aspect, random }) => mergeDiagrams(sextant(aspect * 0.4, 0.14, 0.32), sparks__1({ aspect, random })),
    region: { cx: 0.52, cy: 0.66, w: 0.72, h: 0.4 },
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 星座（n）：星星连成一个星座，字像是星名。 */
const astralConstellation = astral({
    kind: 'astral-constellation',
    label: '星座',
    mood: 'neutral',
    light: rig([shaft({ spread: 0.06, intensity: 0.4 })], { density: 0.6, ambient: 0.015 }, { ...GLARE, intensity: 0.4 }),
    lineArt: ({ aspect, random }) => mergeDiagrams(constellation(aspect, random, 8, [0.1, 0.1, 0.9, 0.42]), constellation(aspect, random, 5, [0.6, 0.62, 0.95, 0.9], { delay: 0.3 })),
    region: { cx: 0.42, cy: 0.66, w: 0.6, h: 0.4 },
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 日冕（l）：太阳在画面上方，边缘放射出丝丝的冕光。 */
const astralCorona = astral({
    kind: 'astral-corona',
    label: '日冕',
    mood: 'loud',
    light: ({ aspect }) => ({
        beams: radial(0.5, 0.12, 0.1, aspect, 6, { length: 0.6, intensity: 0.9 }),
        fog: { density: 1, tyndallBase: 0.15, scale: 2.4, driftX: 0.004, driftY: -0.02, warp: 0.9, ambient: 0.03 },
        glare: { x: 0.5, y: 0.12, radius: 0.16, intensity: 1.3, streak: 0.7 },
    }),
    lineArt: ({ aspect, random }) => mergeDiagrams(corona(aspect * 0.5, 0.12, 0.1, random), sparks__1({ aspect, random })),
    region: { cx: 0.5, cy: 0.62, w: 0.72, h: 0.46 },
    typography: 'crossed',
    burst: { mode: 'sung', density: 0.3, every: 2, offset: 0, size: 3.4, tint: [1, 0.65, 0.4] },
    decay: { strength: 1.3, delay: 0.7 },
});
/** 月光（q）：右上角一弯新月，冷色的光斜照下来，云雾流动。 */
const astralMoon = astral({
    kind: 'astral-moon',
    label: '月光',
    mood: 'quiet',
    light: rig([shaft({ x: 0.82, y: 0.12, angle: 2.1, spread: 0.12, width: 0.08, length: 1.4, softness: 0.8, intensity: 0.75, tint: [0.72, 0.82, 1] })], { density: 1.2, driftX: -0.01, driftY: 0, ambient: 0.035, warp: 1.3 }, { x: 0.82, y: 0.12, radius: 0.1, intensity: 0.8, streak: 0.2 }),
    lineArt: ({ aspect, random }) => mergeDiagrams(crescent(aspect * 0.82, 0.12, 0.07), sparks__1({ aspect, random })),
    region: { cx: 0.38, cy: 0.54, w: 0.5, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 星云（n）：大片带颜色的烟，光从里面透出来。 */
const astralNebula = astral({
    kind: 'astral-nebula',
    label: '星云',
    mood: 'neutral',
    light: rig([
        shaft({ x: 0.4, y: 0.45, angle: -0.6, spread: 0.6, width: 0.1, length: 0.8, softness: 1, intensity: 0.5, streaks: 0.6, streakFreq: 3, core: 0.2, spectrum: 0.7, sway: { amplitude: 0.2, period: 20, phase: 0 } }),
        shaft({ x: 0.6, y: 0.45, angle: 2.4, spread: 0.6, width: 0.1, length: 0.8, softness: 1, intensity: 0.4, streaks: 0.6, streakFreq: 3, core: 0.2, spectrum: 0.7, sway: { amplitude: 0.2, period: 23, phase: 0.5 } }),
    ], { density: 1.4, ambient: 0.06, warp: 1.6, scale: 1.6, driftX: 0.006, driftY: 0.002 }, { x: 0.5, y: 0.45, radius: 0.08, intensity: 0.7, streak: 0.2 }),
    lineArt: sparks__1,
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 浑天（n）：浑天仪的几个环缓慢转动。 */
const astralArmillary = astral({
    kind: 'astral-armillary',
    label: '浑天',
    mood: 'neutral',
    light: rig([shaft(), fan({ intensity: 0.2 })]),
    lineArt: ({ aspect, random }) => mergeDiagrams(armillary(aspect * 0.5, 0.42, 0.26), sparks__1({ aspect, random })),
    region: { cx: 0.5, cy: 0.5, w: 0.5, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 1, delay: 1 },
});
/** 流星（l）：几道斜着划过的光迹与拖尾。 */
const astralMeteor = astral({
    kind: 'astral-meteor',
    label: '流星',
    mood: 'loud',
    light: rig([0, 1, 2].map(i => shaft({
        x: 0.95 - i * 0.2, y: -0.02 + i * 0.05, angle: 2.5, spread: 0.01, width: 0.006, length: 0.6, intensity: 0.9, streaks: 0.2, core: 0.8, reach: 0.5 + i * 0.1,
        pulse: { amplitude: 0.7, period: 2.2 + i * 0.7, phase: i * 0.3 }, sway: undefined,
    })), { density: 0.7, ambient: 0.015 }, null),
    lineArt: ({ aspect, random }) => mergeDiagrams(meteors(aspect, random, 6), sparks__1({ aspect, random })),
    typography: 'crossed',
    decay: { strength: 1.3, delay: 0.7 },
    starfall: { ...STARFALL, stars: 620, rain: 60, rainSpeed: 0.6, rainSpread: 1.8, brightness: 1.2 },
});
const ASTRAL_PROFILES = [
    astralEclipse, astralOrbit, astralTrail, astralSextant, astralConstellation,
    astralCorona, astralMoon, astralNebula, astralArmillary, astralMeteor,
];

// ======== components/visualizer/lumiere/rigs/botany ========
// Copyright (c) 2026 chthollyphile



// src/components/visualizer/lumiere/rigs/botany.ts
// 叶脉族（光合）：嫩叶、叶脉、林冠、花与藤的线稿在光里生长。「萌芽」是 L0 的第一个光位（参考图底部）。
const botanySprout = {
    kind: 'botany-sprout',
    label: '萌芽',
    family: 'botany',
    mood: 'quiet',
    light: () => ({
        beams: [
            {
                x: 0.5, y: -0.05, angle: Math.PI / 2, spread: 0.075, width: 0.07, length: 1.2, softness: 0.7,
                intensity: 0.95, streaks: 0.5, streakFreq: 6, streakSpeed: 0.06, core: 0.7,
                sway: { amplitude: 0.008, period: 15, phase: 0.2 },
            },
            {
                x: 0.5, y: -0.05, angle: Math.PI / 2, spread: 0.26, length: 0.75, softness: 0.95,
                intensity: 0.42, streaks: 0.85, streakFreq: 30, streakSpeed: 0.04, core: 0.3,
            },
        ],
        fog: {
            density: 0.9, tyndallBase: 0.14, scale: 2, driftX: -0.006, driftY: -0.03, warp: 1.1, ambient: 0.025,
        },
        glare: { x: 0.5, y: -0.01, radius: 0.1, intensity: 0.9, streak: 0.35 },
    }),
    motes: {
        count: 200, sizeMin: 0.004, sizeMax: 0.011, driftX: -0.003, driftY: -0.012,
        swirl: 0.018, swirlPeriod: 11, twinkle: 0.55, ambient: 0.012, gain: 1.2,
    },
    front: {
        count: 6, sizeMin: 0.05, sizeMax: 0.12, driftX: -0.004, driftY: -0.002,
        swirl: 0.01, swirlPeriod: 16, twinkle: 0.2, ambient: 0.015, gain: 0.25,
    },
    lineArt: ({ aspect, random }) => mergeSpecs(sprout({ cx: aspect * 0.5, baseY: 0.78, size: 0.22, alpha: 1 }), protractorHalo({ cx: aspect * 0.5, cy: 0.02, radius: 0.22, alpha: 0.35, delay: 0.2 }), viewfinderFrame({ aspect, left: 0.07, top: 0.22, right: 0.93, bottom: 0.8, delay: 0.25, alpha: 0.22 }), scatteredSparks({ aspect, count: 12, random, delay: 0.35, region: [0.2, 0.3, 0.8, 0.9] })),
    // 竖排为主：当前行竖在光柱里，像茎一样从叶上长出来。
    region: { cx: 0.5, cy: 0.44, w: 0.72, h: 0.6 },
    heroSize: 0.08,
    // 光柱窄，背景碎片小一点。
    echo: { size: 0.28 },
    typography: 'vertical',
    decay: { strength: 0.75, delay: 1.2 },
    starfall: { stars: 300, opening: 3.6, rain: 50, rainSpeed: 0.16, rainSpread: 0.25, brightness: 0.85 },
    camera: { push: 0.03, driftX: 0, driftY: 0.004 },
};
// ---------------------------------------------------------------------------------------------
// 叶脉族其余 9 种。排版（连萌芽）4 横 / 3 竖 / 3 纵横。
const botany = familyOf('botany', {
    motes: { ...MOTES, count: 220, driftY: -0.012 },
    // 叶、蕨、花、藤的线稿是这一族的主角。
    artGain: 1.7,
    starfall: { ...STARFALL, rain: 40 },
});
const sparks__2 = ({ aspect, random }) => scatteredSparks({ aspect, count: 12, random, delay: 0.3 });
/** 叶脉（n）：一片大叶斜在画面上，脉络被斜光一段段点亮。 */
const botanyVeins = botany({
    kind: 'botany-veins',
    label: '叶脉',
    mood: 'neutral',
    light: rig([shaft({ x: 0.15, y: -0.05, angle: 1.1, spread: 0.12, width: 0.12, length: 1.4, intensity: 0.9, streaks: 0.5, streakFreq: 6 })], { density: 0.9 }, { ...GLARE, x: 0.15, y: -0.02, radius: 0.14, intensity: 0.8 }),
    lineArt: context => mergeDiagrams(bigLeaf(context.aspect * 0.52, 0.42, 0.62, -0.45), sparks__2(context)),
    region: { cx: 0.5, cy: 0.72, w: 0.72, h: 0.36 },
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 林冠（l）：仰视树冠，几道光从叶间射下。 */
const botanyCanopy = botany({
    kind: 'botany-canopy',
    label: '林冠',
    mood: 'loud',
    light: rig([0.25, 0.48, 0.7].map((x, i) => shaft({
        x, y: -0.05, angle: 1.45 + i * 0.1, spread: 0.08, width: 0.08, length: 1.3, softness: 0.6, intensity: 0.85, streaks: 0.5, streakFreq: 6,
        gobo: { pattern: 'leaves', frequency: 9, duty: 0.5, drift: 0.14 }, sway: { amplitude: 0.03, period: 6 + i, phase: i * 0.3 },
    })), { density: 1.1, driftX: 0.008 }, null),
    lineArt: ({ aspect, random }) => mergeDiagrams(canopy(aspect, random), scatteredSparks({ aspect, count: 16, random, delay: 0.3 })),
    motes: { ...MOTES, count: 300, driftX: 0.008, driftY: 0.006, swirl: 0.03 },
    typography: 'crossed',
    decay: { strength: 1.2, delay: 0.8 },
    starfall: { ...STARFALL, rain: 90, rainSpread: 1.2 },
});
/** 蕨卷（n）：一枝蕨叶卷曲着，随唱缓缓展开。 */
const botanyFern = botany({
    kind: 'botany-fern',
    label: '蕨卷',
    mood: 'neutral',
    light: rig([shaft({ x: 0.3, spread: 0.08, intensity: 0.85 }), fan({ x: 0.3, intensity: 0.2 })]),
    lineArt: context => mergeDiagrams(fernCurl(context.aspect * 0.28, 0.42, 0.16), sparks__2(context)),
    region: { cx: 0.62, cy: 0.5, w: 0.5, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.8, delay: 1.2 },
});
/** 种子（q）：一道光落在一粒种子上，根须往下长。 */
const botanySeed = botany({
    kind: 'botany-seed',
    label: '种子',
    mood: 'quiet',
    light: rig([shaft({ spread: 0.04, width: 0.02, length: 1.2, intensity: 0.8, core: 0.9 })], { density: 0.7, ambient: 0.02 }, { ...GLARE, intensity: 0.6 }),
    lineArt: ({ aspect, random }) => mergeDiagrams(seedRoots(aspect * 0.5, 0.7, random), scatteredSparks({ aspect, count: 10, random, delay: 0.3 })),
    region: { cx: 0.5, cy: 0.38, w: 0.72, h: 0.4 },
    typography: 'horizontal',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 绽放（l）：以光点为中心，花瓣线稿一片片打开。 */
const botanyBloom = botany({
    kind: 'botany-bloom',
    label: '绽放',
    mood: 'loud',
    light: rig(Array.from({ length: 6 }, (_, k) => shaft({
        x: 0.5, y: 0.42, angle: (k / 6) * Math.PI * 2 + 0.26, spread: 0.12, width: 0.01, length: 0.6, softness: 0.7, intensity: 0.55,
        streaks: 0.5, streakFreq: 7, core: 0.4, reach: 0.45, sway: { amplitude: 0.05, period: 10, phase: k / 6 },
    })), { density: 0.9 }, { x: 0.5, y: 0.42, radius: 0.1, intensity: 1.2, streak: 0.4 }),
    lineArt: context => mergeDiagrams(bloom(context.aspect * 0.5, 0.42, 0.2, 8), sparks__2(context)),
    typography: 'crossed',
    burst: { mode: 'sweep', density: 0.5, every: 3, offset: 1, size: 3, tint: [1, 0.8, 0.7] },
    decay: { strength: 1.2, delay: 0.8 },
});
/** 藤旋（n）：藤蔓螺旋着向光攀升。 */
const botanyVine = botany({
    kind: 'botany-vine',
    label: '藤旋',
    mood: 'neutral',
    light: rig([shaft({ x: 0.72, spread: 0.07, intensity: 0.9 }), fan({ x: 0.72, intensity: 0.2 })], {}, { ...GLARE, x: 0.72 }),
    lineArt: context => mergeDiagrams(vine(context.aspect * 0.72, 1.02, 0.08, 0.05, 4), sparks__2(context)),
    region: { cx: 0.36, cy: 0.5, w: 0.5, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 1, delay: 1 },
});
/** 叶绿（q）：显微镜视野里，叶绿体的小圆点在光里发亮。 */
const botanyChloro = botany({
    kind: 'botany-chloro',
    label: '叶绿',
    mood: 'quiet',
    light: rig([shaft({ spread: 0.2, width: 0.3, softness: 0.9, intensity: 0.6, core: 0.3 })], { density: 0.7 }, null, { caustic: { scale: 6, speed: 0.12, inBeam: 0.3, floor: { cx: 0.5, cy: 0.45, rx: 0.2, ry: 0.36, strength: 0.35 } } }),
    lineArt: ({ aspect, random }) => mergeDiagrams(cells(aspect * 0.5, 0.45, 0.36, random, 22), scatteredSparks({ aspect, count: 8, random, delay: 0.3 })),
    region: { cx: 0.5, cy: 0.5, w: 0.5, h: 0.5 },
    typography: 'crossed',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 光合式（n）：分子结构的线稿与量角器光环，致敬参考图里的化学式。 */
const botanyFormula = botany({
    kind: 'botany-formula',
    label: '光合式',
    mood: 'neutral',
    light: rig([shaft(), fan()]),
    lineArt: context => mergeDiagrams(molecule(context.aspect * 0.24, 0.3, 0.06), molecule(context.aspect * 0.78, 0.74, 0.05, { delay: 0.2 }), protractorHalo({ cx: context.aspect * 0.5, cy: 0.03, radius: 0.28, alpha: 0.5 }), sparks__2(context)),
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 花粉（l）：斜光里漂着大颗的花粉粒子。 */
const botanyPollen = botany({
    kind: 'botany-pollen',
    label: '花粉',
    mood: 'loud',
    light: rig([shaft({ x: 0.2, y: -0.05, angle: 1.15, spread: 0.14, width: 0.16, length: 1.5, intensity: 1, streaks: 0.5 }), fan({ x: 0.2, angle: 1.15, intensity: 0.3 })], { density: 1, driftX: 0.012, driftY: -0.01 }, { ...GLARE, x: 0.2, y: 0.0 }),
    lineArt: sparks__2,
    motes: { count: 360, sizeMin: 0.006, sizeMax: 0.022, driftX: 0.012, driftY: -0.006, swirl: 0.04, swirlPeriod: 10, twinkle: 0.4, ambient: 0.02, gain: 1.6 },
    typography: 'horizontal',
    decay: { strength: 1.2, delay: 0.8 },
});
const BOTANY_PROFILES = [
    botanySprout, botanyVeins, botanyCanopy, botanyFern, botanySeed,
    botanyBloom, botanyVine, botanyChloro, botanyFormula, botanyPollen,
];

// ======== components/visualizer/lumiere/rigs/caustic ========
// Copyright (c) 2026 chthollyphile



// src/components/visualizer/lumiere/rigs/caustic.ts
// 焦散族：水、玻璃、晶体折出的流动光网。焦散模块调制光束，也可以在一块区域（池底、杯底）单独发亮。
// 排版 4 横 / 3 竖 / 3 纵横。
const caustic = familyOf('caustic', {
    motes: { ...MOTES, driftY: -0.004, swirl: 0.03, swirlPeriod: 12 },
    region: { cx: 0.5, cy: 0.46, w: 0.72, h: 0.46 },
});
const sparks__3 = (count = 10) => ({ aspect, random }) => scatteredSparks({ aspect, count, random, delay: 0.3 });
const softTop = (overrides = {}) => shaft({
    spread: 0.22, width: 0.2, length: 1.4, softness: 0.8, intensity: 0.8, streaks: 0.3, core: 0.3, ...overrides,
});
const water = (spec = {}) => ({ caustic: { scale: 2.2, speed: 0.35, inBeam: 0.8, ...spec } });
/** 池底（q）：顶光落进水里，光柱里是流动的焦散网，池底有一片焦散光斑。 */
const causticPool = caustic({
    kind: 'caustic-pool',
    label: '池底',
    mood: 'quiet',
    light: rig([softTop()], { density: 0.8, driftY: -0.015, ambient: 0.02 }, { ...GLARE, intensity: 0.6 }, water({ floor: { cx: 0.5, cy: 0.82, rx: 0.42, ry: 0.14, strength: 0.7 } })),
    lineArt: ({ aspect, random }) => ({
        paths: [{ points: ellipse(aspect * 0.5, 0.82, aspect * 0.42, 0.14), width: 0.0014, alpha: 0.4, delay: 0.1, span: 0.6 }],
        nodes: sparks__3()({ aspect, random }).nodes,
    }),
    typography: 'horizontal',
    decay: { strength: 0.7, delay: 1.4 },
});
/** 杯影（n）：侧光穿过玻璃杯，桌面上投下一片焦散。 */
const causticCup = caustic({
    kind: 'caustic-cup',
    label: '杯影',
    mood: 'neutral',
    light: rig([shaft({ x: -0.05, y: 0.3, angle: 0.35, spread: 0.08, width: 0.18, length: 1.6, softness: 0.5, intensity: 0.9, streaks: 0.3, core: 0.4, sway: undefined })], { density: 0.8 }, null, water({ scale: 3.2, speed: 0.25, inBeam: 0.3, floor: { cx: 0.36, cy: 0.8, rx: 0.14, ry: 0.07, strength: 1.1 } })),
    lineArt: context => mergeDiagrams(glassCup(context.aspect * 0.24, 0.52, 0.1, 0.2), sparks__3()(context)),
    region: { cx: 0.62, cy: 0.48, w: 0.56, h: 0.64 },
    typography: 'vertical',
    decay: { strength: 1, delay: 1 },
});
/** 涟漪（n）：水面荡开一圈圈同心波纹，光里的焦散随之晃动。 */
const causticRipple = caustic({
    kind: 'caustic-ripple',
    label: '涟漪',
    mood: 'neutral',
    light: rig([softTop({ intensity: 0.75 })], { density: 0.8 }, { ...GLARE, intensity: 0.5 }, water({ scale: 3, speed: 0.5, inBeam: 0.6, floor: { cx: 0.5, cy: 0.8, rx: 0.34, ry: 0.1, strength: 0.5 } })),
    lineArt: context => mergeDiagrams(ripples(context.aspect * 0.5, 0.8, 0.34, 5), sparks__3()(context)),
    typography: 'crossed',
    decay: { strength: 1, delay: 1 },
});
/** 水面（l）：从水下仰望，水面的光斑与几道斜射下来的光束。 */
const causticSurface = caustic({
    kind: 'caustic-surface',
    label: '水面',
    mood: 'loud',
    light: rig([0.2, 0.42, 0.6, 0.8].map((x, i) => shaft({
        x, y: 0.1, angle: 1.35 + i * 0.06, spread: 0.04, width: 0.05, length: 1.2, softness: 0.6, intensity: 0.7, streaks: 0.5, streakFreq: 6, core: 0.5,
        sway: { amplitude: 0.05, period: 6 + i, phase: i * 0.2 },
    })), { density: 1.1, driftY: -0.02 }, null, water({ scale: 2.6, speed: 0.6, inBeam: 0.9, floor: { cx: 0.5, cy: 0.06, rx: 0.6, ry: 0.07, strength: 0.9 } })),
    lineArt: context => mergeDiagrams(waterline(context.aspect, 0.1, 0.012, 7), sparks__3(14)(context)),
    motes: { ...MOTES, count: 300, driftY: -0.02, swirl: 0.03 },
    region: { cx: 0.5, cy: 0.58, w: 0.72, h: 0.46 },
    typography: 'horizontal',
    decay: { strength: 1.2, delay: 0.8 },
});
/** 戒光（q）：一个圆环的内壁，焦散曲线落在环里。 */
const causticRing = caustic({
    kind: 'caustic-ring',
    label: '戒光',
    mood: 'quiet',
    light: rig([softTop({ spread: 0.14, width: 0.1, intensity: 0.7 })], { density: 0.7 }, { ...GLARE, intensity: 0.5 }, water({ scale: 4, speed: 0.2, inBeam: 0.2, floor: { cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.36, strength: 0.6 } })),
    lineArt: context => mergeDiagrams({ paths: [circle(context.aspect * 0.5, 0.5, 0.36, { width: 0.0024, alpha: 0.6 }), circle(context.aspect * 0.5, 0.5, 0.32, { width: 0.0009, alpha: 0.3, delay: 0.1 })], nodes: [] }, sparks__3()(context)),
    region: { cx: 0.5, cy: 0.5, w: 0.4, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 聚点（l）：放大镜把光聚成一点，正好落在字上（会聚光束过焦点再散开）。 */
const causticBurn = caustic({
    kind: 'caustic-burn',
    label: '聚点',
    mood: 'loud',
    light: rig([
        shaft({ x: 0.5, y: 0.2, angle: Math.PI / 2, spread: -0.22, width: 0.2, length: 1.4, softness: 0.5, intensity: 1.2, streaks: 0.3, streakFreq: 5, core: 0.6, sway: { amplitude: 0.02, period: 9, phase: 0 } }),
        shaft({ x: 0.5, y: -0.1, angle: Math.PI / 2, spread: 0.03, width: 0.22, length: 1, intensity: 0.4, streaks: 0.4, reach: 0.3, sway: undefined }),
    ], { density: 1 }, { x: 0.5, y: 0.65, radius: 0.05, intensity: 1.1, streak: 0.8 }),
    lineArt: context => mergeDiagrams(magnifier(context.aspect * 0.5, 0.2, 0.1), sparks__3(12)(context)),
    region: { cx: 0.5, cy: 0.66, w: 0.72, h: 0.4 },
    typography: 'crossed',
    burst: { mode: 'sung', density: 0.35, every: 1, offset: 0, size: 3.6, tint: [1, 0.7, 0.45] },
    decay: { strength: 1.3, delay: 0.7 },
});
/** 粼粼（n）：横向的水面反光条纹在字上闪烁。 */
const causticShimmer = caustic({
    kind: 'caustic-shimmer',
    label: '粼粼',
    mood: 'neutral',
    light: rig([shaft({ x: -0.05, y: 0.5, angle: 0.02, spread: 0.06, width: 0.5, length: 2.4, softness: 0.4, intensity: 0.8, streaks: 0.2, core: 0.2,
            gobo: { pattern: 'blinds', frequency: 18, duty: 0.35, drift: 0.3 }, sway: undefined })], { density: 0.8 }, null, water({ scale: 1.4, speed: 0.8, inBeam: 0.6 })),
    lineArt: context => mergeDiagrams(waterline(context.aspect, 0.86, 0.008, 9), sparks__3()(context)),
    region: { cx: 0.5, cy: 0.5, w: 0.72, h: 0.5 },
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 晶影（n）：光穿过水晶，投下放射的光斑与一点彩色。 */
const causticCrystal = caustic({
    kind: 'caustic-crystal',
    label: '晶影',
    mood: 'neutral',
    light: rig([0, 1, 2, 3, 4].map(k => shaft({
        x: 0.5, y: 0.26, angle: Math.PI / 2 + (k - 2) * 0.45, spread: 0.05, width: 0.01, length: 0.8, softness: 0.5, intensity: 0.6,
        streaks: 0.3, core: 0.4, spectrum: 0.7, sway: { amplitude: 0.05, period: 12, phase: k * 0.15 },
    })), { density: 0.9 }, { ...GLARE, x: 0.5, y: 0.26, radius: 0.07, intensity: 1, streak: 0.5 }, water({ scale: 3.4, speed: 0.2, inBeam: 0.4, floor: { cx: 0.5, cy: 0.8, rx: 0.3, ry: 0.09, strength: 0.5 } })),
    lineArt: context => mergeDiagrams(crystal(context.aspect * 0.5, 0.26, 0.05), sparks__3(14)(context)),
    region: { cx: 0.5, cy: 0.58, w: 0.72, h: 0.44 },
    typography: 'crossed',
    decay: { strength: 1, delay: 1 },
});
/** 漂流（q）：大尺度的焦散缓慢漂移，几乎静止。 */
const causticDrift = caustic({
    kind: 'caustic-drift',
    label: '漂流',
    mood: 'quiet',
    light: rig([softTop({ spread: 0.4, width: 0.4, intensity: 1, softness: 0.95 })], { density: 0.8, driftX: 0.004, driftY: 0, ambient: 0.03 }, { ...GLARE, intensity: 0.5 }, water({ scale: 1, speed: 0.08, inBeam: 0.8, floor: { cx: 0.5, cy: 0.5, rx: 0.5, ry: 0.4, strength: 0.4 } })),
    lineArt: sparks__3(8),
    region: { cx: 0.5, cy: 0.5, w: 0.72, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.5, delay: 1.8 },
});
/** 骤光（l）：高频闪烁的焦散随鼓点跳动。 */
const causticStorm = caustic({
    kind: 'caustic-storm',
    label: '骤光',
    mood: 'loud',
    light: rig([softTop({ intensity: 1, pulse: { amplitude: 0.35, period: 0.9, phase: 0 } })], { density: 1.1 }, { ...GLARE, intensity: 0.8 }, water({ scale: 3, speed: 1.3, inBeam: 1, floor: { cx: 0.5, cy: 0.82, rx: 0.5, ry: 0.14, strength: 0.8 } })),
    lineArt: context => mergeDiagrams(ripples(context.aspect * 0.5, 0.82, 0.5, 4), sparks__3(14)(context)),
    typography: 'horizontal',
    decay: { strength: 1.3, delay: 0.7 },
});
const CAUSTIC_PROFILES = [
    causticPool, causticCup, causticRipple, causticSurface, causticRing,
    causticBurn, causticShimmer, causticCrystal, causticDrift, causticStorm,
];

// ======== components/visualizer/lumiere/rigs/lattice ========
// Copyright (c) 2026 chthollyphile



// src/components/visualizer/lumiere/rigs/lattice.ts
// 窗隙族（窗光与窗影）：光从窗、门缝、叶隙斜射进来，窗影把光束切成图样。排版 4 横 / 3 竖 / 3 纵横。
const lattice = familyOf('lattice', {
    region: { cx: 0.56, cy: 0.58, w: 0.66, h: 0.5 },
    motes: { ...MOTES, driftX: 0.008, driftY: -0.006 },
});
/** 从左上的窗斜射进来的宽光（窗光的公共形状）。 */
const windowBeam = (overrides = {}) => shaft({
    x: 0.1, y: 0.06, angle: 0.62, spread: 0.1, width: 0.34, length: 1.3, softness: 0.35,
    intensity: 1, streaks: 0.25, streakFreq: 4, core: 0.3,
    sway: { amplitude: 0.01, period: 17, phase: 0 },
    ...overrides,
});
const sparks__4 = (region) => ({ aspect, random }) => (scatteredSparks({ aspect, count: 14, random, delay: 0.3, region: region ?? [0.3, 0.3, 0.95, 0.9] }));
/** 百叶（n）：左上的窗透进一道宽斜光，百叶把它切成一条条平行的光带。 */
const latticeBlinds = lattice({
    kind: 'lattice-blinds',
    label: '百叶',
    mood: 'neutral',
    light: rig([windowBeam({ gobo: { pattern: 'blinds', frequency: 13, duty: 0.52, drift: 0.02 } })], { driftX: 0.012, driftY: -0.02 }, { ...GLARE, x: 0.1, y: 0.06, radius: 0.16, intensity: 0.8 }),
    lineArt: context => mergeSpecs(blindsWindow({ x: context.aspect * 0.03, y: 0.02, w: context.aspect * 0.16, h: 0.26, slats: 9, alpha: 0.5 }), sparks__4()(context)),
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 十字窗（q）：右上的十字窗投下四块光斑，中间一道窗棂的影子。 */
const latticeCross = lattice({
    kind: 'lattice-cross',
    label: '十字窗',
    mood: 'quiet',
    light: rig([windowBeam({ x: 0.9, angle: Math.PI - 0.7, width: 0.3, intensity: 0.9, gobo: { pattern: 'cross', frequency: 0, duty: 0.16, drift: 0 } })], { driftX: -0.008 }, { ...GLARE, x: 0.9, y: 0.06, radius: 0.14, intensity: 0.7 }),
    lineArt: context => mergeSpecs(crossWindow(context.aspect * 0.8, 0.01, context.aspect * 0.16, 0.26), sparks__4([0.05, 0.3, 0.7, 0.9])(context)),
    region: { cx: 0.4, cy: 0.52, w: 0.6, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.7, delay: 1.4 },
});
/** 拱窗（l）：高高的拱窗斜照下一道长长的丁达尔光束。 */
const latticeArch = lattice({
    kind: 'lattice-arch',
    label: '拱窗',
    mood: 'loud',
    light: rig([
        windowBeam({ x: 0.14, y: -0.02, angle: 0.95, width: 0.14, spread: 0.06, length: 1.6, intensity: 1.3, streaks: 0.55, streakFreq: 8, core: 0.6 }),
        windowBeam({ x: 0.14, y: -0.02, angle: 0.95, width: 0.3, spread: 0.2, length: 0.9, softness: 0.9, intensity: 0.3, streaks: 0.8, streakFreq: 22 }),
    ], { density: 1.1 }, { ...GLARE, x: 0.14, y: 0.0, radius: 0.18, intensity: 1.1, streak: 0.6 }),
    lineArt: context => mergeSpecs(archWindow(context.aspect * 0.08, -0.06, context.aspect * 0.12, 0.32), sparks__4()(context)),
    typography: 'crossed',
    decay: { strength: 1.2, delay: 0.8 },
    starfall: { ...STARFALL, rain: 90, rainSpread: 0.8 },
});
/** 玫瑰窗（l）：顶上一扇圆花窗，放射出一扇细光束。 */
const latticeRose = lattice({
    kind: 'lattice-rose',
    label: '玫瑰窗',
    mood: 'loud',
    light: rig([-2, -1, 0, 1, 2, 3].map(k => shaft({
        y: 0.08, angle: Math.PI / 2 + (k - 0.5) * 0.2, spread: 0.035, width: 0.03, length: 1, intensity: 0.65 - Math.abs(k - 0.5) * 0.06,
        streaks: 0.4, streakFreq: 5, sway: { amplitude: 0.015, period: 13, phase: k * 0.1 },
    })), {}, { ...GLARE, y: 0.08, radius: 0.16, intensity: 1.1, streak: 0.5 }),
    lineArt: ({ aspect, random }) => mergeSpecs(roseWindow(aspect * 0.5, 0.08, 0.12), scatteredSparks({ aspect, count: 16, random, delay: 0.3 })),
    region: { cx: 0.5, cy: 0.6, w: 0.72, h: 0.46 },
    typography: 'horizontal',
    decay: { strength: 1.2, delay: 0.8 },
    starfall: STARFALL,
});
/** 门缝（q）：左边一道门缝，极窄的光横着划过画面。 */
const latticeSlit = lattice({
    kind: 'lattice-slit',
    label: '门缝',
    mood: 'quiet',
    light: rig([shaft({ x: 0.1, y: 0.42, angle: 0.06, spread: 0.02, width: 0.012, length: 2.4, intensity: 1, streaks: 0.3, streakFreq: 3, core: 0.8, sway: { amplitude: 0.01, period: 15, phase: 0 } })], { density: 0.8, ambient: 0.015 }, { ...GLARE, x: 0.1, y: 0.42, radius: 0.08, intensity: 0.8, streak: 0.9 }),
    lineArt: ({ aspect, random }) => mergeSpecs(doorSlit(aspect * 0.1, 0.08, 0.86, 0.012), scatteredSparks({ aspect, count: 10, random, delay: 0.3, region: [0.2, 0.2, 0.95, 0.9] })),
    region: { cx: 0.55, cy: 0.5, w: 0.6, h: 0.64 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 障子（q）：方格纸窗透进柔和的漫射光，窗格的细影子落在光里。 */
const latticeShoji = lattice({
    kind: 'lattice-shoji',
    label: '障子',
    mood: 'quiet',
    light: rig([windowBeam({ x: 0.12, y: 0.1, angle: 0.4, width: 0.5, spread: 0.18, softness: 0.95, intensity: 0.7, streaks: 0.1, core: 0.2,
            gobo: { pattern: 'blinds', frequency: 10, duty: 0.86, drift: 0 } })], { density: 0.7, tyndallBase: 0.25 }, null),
    lineArt: ({ aspect, random }) => mergeSpecs(gridPanel(aspect * 0.02, 0.06, aspect * 0.18, 0.4, 3, 5), scatteredSparks({ aspect, count: 10, random, delay: 0.3 })),
    typography: 'horizontal',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 格栅（n）：菱形格栅的光影在字上流动。 */
const latticeGrille = lattice({
    kind: 'lattice-grille',
    label: '格栅',
    mood: 'neutral',
    light: rig([windowBeam({ width: 0.4, spread: 0.12, intensity: 1, gobo: { pattern: 'lattice', frequency: 9, duty: 0.62, drift: 0.04 } })], { driftX: 0.01 }, { ...GLARE, x: 0.1, y: 0.06, radius: 0.14, intensity: 0.7 }),
    lineArt: context => mergeSpecs(gridPanel(context.aspect * 0.02, 0.02, context.aspect * 0.16, 0.26, 4, 4, true), sparks__4()(context)),
    typography: 'crossed',
    decay: { strength: 1, delay: 1 },
});
/** 扫窗（n）：光源在动，百叶的影子扫过整句。 */
const latticeSweep = lattice({
    kind: 'lattice-sweep',
    label: '扫窗',
    mood: 'neutral',
    light: rig([windowBeam({ angle: 0.75, width: 0.3, intensity: 1, sway: { amplitude: 0.32, period: 10, phase: 0 }, gobo: { pattern: 'blinds', frequency: 11, duty: 0.55, drift: 0.05 } })], { driftX: 0.01 }, { ...GLARE, x: 0.1, y: 0.06, radius: 0.14, intensity: 0.7 }),
    lineArt: context => mergeSpecs(blindsWindow({ x: context.aspect * 0.03, y: 0.02, w: context.aspect * 0.16, h: 0.26, slats: 8, alpha: 0.45 }), sparks__4()(context)),
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
    camera: { push: 0.02, driftX: 0.012, driftY: 0 },
});
/** 叶隙（q）：树叶缝隙里漏下来的斑驳光，随风摇曳。 */
const latticeKomorebi = lattice({
    kind: 'lattice-komorebi',
    label: '叶隙',
    mood: 'quiet',
    light: rig([
        shaft({ x: 0.35, y: -0.05, angle: 1.35, spread: 0.2, width: 0.2, length: 1.3, softness: 0.7, intensity: 1, streaks: 0.2, core: 0.3,
            gobo: { pattern: 'leaves', frequency: 7, duty: 0.52, drift: 0.12 }, sway: { amplitude: 0.03, period: 7, phase: 0 } }),
        shaft({ x: 0.72, y: -0.05, angle: 1.8, spread: 0.14, width: 0.12, length: 1.1, softness: 0.7, intensity: 0.7, streaks: 0.2, core: 0.3,
            gobo: { pattern: 'leaves', frequency: 8, duty: 0.55, drift: 0.1 }, sway: { amplitude: 0.03, period: 8, phase: 0.4 } }),
    ], { density: 0.9, driftX: 0.01 }, null),
    lineArt: ({ aspect, random }) => mergeDiagrams(canopy(aspect, random), scatteredSparks({ aspect, count: 12, random, delay: 0.3 })),
    motes: { ...MOTES, count: 220, driftX: 0.01, driftY: 0.004, swirl: 0.03 },
    region: { cx: 0.5, cy: 0.54, w: 0.72, h: 0.6 },
    typography: 'vertical',
    decay: { strength: 0.8, delay: 1.2 },
});
/** 殿堂（l）：一排高窗照下平行的斜光，层层烟雾。 */
const latticeNave = lattice({
    kind: 'lattice-nave',
    label: '殿堂',
    mood: 'loud',
    light: rig([0.12, 0.34, 0.56, 0.78].map((x, i) => windowBeam({
        x, y: -0.02, angle: 1.1, width: 0.06, spread: 0.05, length: 1.5, softness: 0.5, intensity: 0.75, streaks: 0.5, streakFreq: 6, core: 0.5,
        sway: { amplitude: 0.008, period: 19, phase: i * 0.2 },
    })), { density: 1.2, driftX: 0.006, driftY: -0.03 }, { ...GLARE, x: 0.45, y: 0.0, radius: 0.25, intensity: 0.6, streak: 0.3 }),
    lineArt: ({ aspect, random }) => mergeSpecs(tallWindows(aspect * 0.05, aspect * 0.95, -0.08, 0.26, 4), scatteredSparks({ aspect, count: 18, random, delay: 0.3 })),
    typography: 'crossed',
    decay: { strength: 1.2, delay: 0.8 },
    starfall: { ...STARFALL, rain: 80, rainSpread: 1.2 },
});
const LATTICE_PROFILES = [
    latticeBlinds, latticeCross, latticeArch, latticeRose, latticeSlit,
    latticeShoji, latticeGrille, latticeSweep, latticeKomorebi, latticeNave,
];

// ======== components/visualizer/lumiere/rigs/motes ========
// Copyright (c) 2026 chthollyphile



// src/components/visualizer/lumiere/rigs/motes.ts
// 萤尘族：以烟与粒子为主，光很少——浮尘、萤火、烟缕、飞烬、光雪、散景、晨雾、光群、化尘、极光。
// 也是间奏镜头的主力。排版 4 横 / 3 竖 / 3 纵横。
const motesFamily = familyOf('motes', {
    starfall: { ...STARFALL, rain: 30 },
    lineArt: ({ aspect, random }) => scatteredSparks({ aspect, count: 10, random, delay: 0.3 }),
});
const particles = (overrides) => ({ ...MOTES, ...overrides });
/** 浮尘（q）：暗室里一束斜光，光里的尘埃缓缓旋转。 */
const motesDust = motesFamily({
    kind: 'motes-dust',
    label: '浮尘',
    mood: 'quiet',
    light: rig([shaft({ x: 0.15, y: -0.05, angle: 1.05, spread: 0.1, width: 0.1, length: 1.5, intensity: 0.8, streaks: 0.4 })], { density: 0.8, ambient: 0.015 }, null),
    motes: particles({ count: 420, sizeMin: 0.003, sizeMax: 0.012, driftX: 0.002, driftY: -0.004, swirl: 0.035, swirlPeriod: 14, gain: 1.6 }),
    typography: 'horizontal',
    decay: { strength: 0.7, delay: 1.4 },
});
/** 萤火（q）：没有光束，只有散落的萤光点，自己亮着、忽明忽暗。 */
const motesFirefly = motesFamily({
    kind: 'motes-firefly',
    label: '萤火',
    mood: 'quiet',
    light: rig([shaft({ spread: 0.05, intensity: 0.15 })], { density: 0.6, ambient: 0.02 }, null),
    motes: particles({ count: 90, sizeMin: 0.008, sizeMax: 0.022, driftX: 0.003, driftY: -0.003, swirl: 0.06, swirlPeriod: 11, twinkle: 0.9, ambient: 0.55, gain: 0.8 }),
    front: { ...FRONT, count: 14, ambient: 0.12, twinkle: 0.7 },
    region: { cx: 0.5, cy: 0.5, w: 0.5, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 烟缕（n）：一缕缕上升的烟，被侧光勾出轮廓。 */
const motesSmoke = motesFamily({
    kind: 'motes-smoke',
    label: '烟缕',
    mood: 'neutral',
    light: rig([shaft({ x: -0.05, y: 0.55, angle: -0.08, spread: 0.18, width: 0.3, length: 1.6, softness: 0.7, intensity: 0.42, streaks: 0.2, core: 0.3, sway: undefined })], { density: 1.5, tyndallBase: 0.05, scale: 1.8, warp: 1.8, driftX: 0.004, driftY: -0.06, ambient: 0.05 }, null),
    motes: particles({ count: 140 }),
    typography: 'crossed',
    decay: { strength: 1, delay: 1 },
});
/** 飞烬（l）：暖红的光从下面烧上来，火星往上飘。 */
const motesEmbers = motesFamily({
    kind: 'motes-embers',
    label: '飞烬',
    mood: 'loud',
    light: rig([shaft({ x: 0.5, y: 1.05, angle: -Math.PI / 2, spread: 0.35, width: 0.3, length: 0.6, softness: 0.9, intensity: 0.8, streaks: 0.6, streakFreq: 8, core: 0.3,
            tint: [1, 0.55, 0.3], pulse: { amplitude: 0.2, period: 1.3, phase: 0 }, sway: undefined })], { density: 1.1, driftY: -0.05 }, null),
    motes: particles({ count: 380, sizeMin: 0.003, sizeMax: 0.01, driftX: 0.004, driftY: -0.07, swirl: 0.03, swirlPeriod: 5, twinkle: 0.8, ambient: 0.1, gain: 1.8 }),
    region: { cx: 0.5, cy: 0.44, w: 0.72, h: 0.46 },
    typography: 'horizontal',
    decay: { strength: 1.4, delay: 0.6 },
});
/** 光雪（q）：光点像雪一样缓缓落下。 */
const motesSnow = motesFamily({
    kind: 'motes-snow',
    label: '光雪',
    mood: 'quiet',
    light: rig([shaft({ spread: 0.2, width: 0.2, softness: 0.9, intensity: 0.5, core: 0.3 })], { density: 0.8, driftY: 0.01 }, null),
    motes: particles({ count: 460, sizeMin: 0.003, sizeMax: 0.012, driftX: 0.003, driftY: 0.035, swirl: 0.02, swirlPeriod: 8, twinkle: 0.3, ambient: 0.15, gain: 1 }),
    region: { cx: 0.5, cy: 0.5, w: 0.5, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
    starfall: { ...STARFALL, rain: 60, rainSpeed: 0.12, rainSpread: 1.8, brightness: 0.7 },
});
/** 散景（n）：前景一片片大光斑虚化，焦点在字上。 */
const motesBokeh = motesFamily({
    kind: 'motes-bokeh',
    label: '散景',
    mood: 'neutral',
    light: rig([shaft({ intensity: 0.6 })], { density: 0.8 }, null),
    motes: particles({ count: 120 }),
    front: { ...FRONT, count: 34, sizeMin: 0.06, sizeMax: 0.2, ambient: 0.1, gain: 0.5, twinkle: 0.3, driftX: 0.008 },
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 晨雾（q）：低伏的雾层，光从雾后面透出来。 */
const motesMist = motesFamily({
    kind: 'motes-mist',
    label: '晨雾',
    mood: 'quiet',
    // 雾后的光：光束与眩光都压低，眩光不拉横丝（原来亮得发白，一条横线贯穿画面）。
    light: rig([shaft({ x: 0.7, y: 0.62, angle: -2.8, spread: 0.5, width: 0.3, length: 1.2, softness: 1, intensity: 0.55, streaks: 0.3, core: 0.2, sway: undefined })], { density: 1.5, tyndallBase: 0.1, scale: 1.2, warp: 0.6, driftX: 0.02, driftY: 0, ambient: 0.05 }, { x: 0.7, y: 0.62, radius: 0.16, intensity: 0.5, streak: 0.08 }),
    lineArt: ({ aspect, random }) => mergeDiagrams(horizon(aspect, 0.64), scatteredSparks({ aspect, count: 8, random, delay: 0.3, region: [0.05, 0.05, 0.95, 0.55] })),
    motes: particles({ count: 120, driftX: 0.01 }),
    region: { cx: 0.36, cy: 0.42, w: 0.44, h: 0.5 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 光群（l）：粒子成群地绕着字流动，又散开。 */
const motesSwarm = motesFamily({
    kind: 'motes-swarm',
    label: '光群',
    mood: 'loud',
    light: rig([shaft({ intensity: 0.8 }), shaft({ spread: 0.3, length: 0.6, softness: 0.9, intensity: 0.25, streaks: 0.8, streakFreq: 24 })]),
    motes: particles({ count: 460, sizeMin: 0.003, sizeMax: 0.012, driftX: 0, driftY: 0, swirl: 0.14, swirlPeriod: 6, twinkle: 0.6, ambient: 0.08, gain: 1.6 }),
    typography: 'crossed',
    decay: { strength: 1.3, delay: 0.7 },
});
/** 化尘（n）：字一唱完就碎成光尘飘散（衔接用）。 */
const motesDissolve = motesFamily({
    kind: 'motes-dissolve',
    label: '化尘',
    mood: 'neutral',
    light: rig([shaft({ intensity: 0.7 })]),
    motes: particles({ count: 380, driftY: -0.02, swirl: 0.04, gain: 1.5 }),
    typography: 'crossed',
    decay: { strength: 2.2, delay: 0.3 },
});
/** 极光（l）：画面上方帘子一样流动的光幕。 */
const motesAurora = motesFamily({
    kind: 'motes-aurora',
    label: '极光',
    mood: 'loud',
    light: rig([0.2, 0.4, 0.6, 0.8].map((x, i) => shaft({
        x, y: -0.1, angle: Math.PI / 2 + 0.1, spread: 0.06, width: 0.16, length: 0.7, softness: 0.8, intensity: 0.7, streaks: 0.9, streakFreq: 30, streakSpeed: 0.3,
        core: 0.2, spectrum: 0.5, tint: [0.6, 1, 0.8], sway: { amplitude: 0.12, period: 8 + i * 1.7, phase: i * 0.2 },
    })), { density: 0.9, ambient: 0.03 }, null),
    region: { cx: 0.5, cy: 0.62, w: 0.72, h: 0.4 },
    typography: 'horizontal',
    decay: { strength: 1.2, delay: 0.8 },
    starfall: { ...STARFALL, stars: 560, rain: 20 },
});
const MOTES_PROFILES = [
    motesDust, motesFirefly, motesSmoke, motesEmbers, motesSnow,
    motesBokeh, motesMist, motesSwarm, motesDissolve, motesAurora,
];

// ======== components/visualizer/lumiere/rigs/optics ========
// Copyright (c) 2026 chthollyphile



// src/components/visualizer/lumiere/rigs/optics.ts
// 光路族（光学图解）：光路图里的每一段光线是一条带射程的细光束，线稿画同一条路径与透镜、镜面、焦点。
// 蓝图式，字多排在图解下方。排版 4 横 / 3 竖 / 3 纵横。
const optics = familyOf('optics', {
    region: { cx: 0.5, cy: 0.74, w: 0.72, h: 0.3 },
    heroSize: 0.075,
    motes: { ...MOTES, count: 180 },
});
/** 从 a 到 b（画面比例）的一段光线：细光束，射程正好到 b（b 为 null 时一直延伸）。 */
const ray = (aspect, a, b, overrides = {}, open = false) => {
    const dx = (b[0] - a[0]) * aspect;
    const dy = b[1] - a[1];
    return {
        x: a[0], y: a[1], angle: Math.atan2(dy, dx), spread: 0.004, width: 0.008, length: 3, softness: 0.6,
        intensity: 0.9, streaks: 0.1, streakFreq: 3, streakSpeed: 0.05, core: 0.8,
        ...(open ? {} : { reach: Math.hypot(dx, dy) + 0.02 }),
        ...overrides,
    };
};
/** 同一条路径的线稿（画面比例 → 高度单位）。 */
const rayArt = (aspect, points, delay = 0.2) => rayPath(points.map(([x, y]) => [x * aspect, y]), { delay });
const opticsRig = (beams, glare = null) => ({
    beams,
    fog: { ...FOG, density: 0.9, tyndallBase: 0.2, ambient: 0.02 },
    glare,
});
const sparks__5 = ({ aspect, random }) => scatteredSparks({ aspect, count: 10, random, delay: 0.3, region: [0.05, 0.05, 0.95, 0.6] });
const AXIS = 0.4;
/** 会聚（n）：平行光经凸透镜会聚到焦点。 */
const opticsConvex = optics({
    kind: 'optics-convex',
    label: '会聚',
    mood: 'neutral',
    light: ({ aspect }) => opticsRig([0.3, 0.4, 0.5].flatMap(y => [
        ray(aspect, [-0.02, y], [0.42, y]),
        ray(aspect, [0.42, y], [0.7, AXIS], {}, true),
    ]), { x: 0.7, y: AXIS, radius: 0.05, intensity: 0.9, streak: 0.6 }),
    lineArt: context => mergeDiagrams(lens(context.aspect * 0.42, AXIS, 0.3, true, context.aspect), ...[0.3, 0.4, 0.5].map((y, i) => rayArt(context.aspect, [[0.02, y], [0.42, y], [0.7, AXIS], [0.92, AXIS + (AXIS - y) * 0.8]], 0.2 + i * 0.08)), focusMark(context.aspect * 0.7, AXIS, { delay: 0.5 }), sparks__5(context)),
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 发散（q）：凹透镜把平行光打散，虚焦点在透镜前面（虚线）。 */
const opticsConcave = optics({
    kind: 'optics-concave',
    label: '发散',
    mood: 'quiet',
    light: ({ aspect }) => opticsRig([0.32, 0.4, 0.48].flatMap(y => [
        ray(aspect, [-0.02, y], [0.42, y], { intensity: 0.7 }),
        ray(aspect, [0.42, y], [0.42 + (0.42 - 0.26), y + (y - AXIS) * 1.6], { intensity: 0.7, spread: 0.01 }, true),
    ])),
    lineArt: context => mergeDiagrams(lens(context.aspect * 0.42, AXIS, 0.28, false, context.aspect), ...[0.32, 0.48].map((y, i) => mergeDiagrams(rayArt(context.aspect, [[0.02, y], [0.42, y], [0.62, y + (y - AXIS) * 2.2]], 0.2 + i * 0.1), { paths: [segment([context.aspect * 0.42, y], [context.aspect * 0.26, AXIS], { width: 0.0009, alpha: 0.35, delay: 0.5, dash: [0.005, 0.006] })], nodes: [] })), focusMark(context.aspect * 0.26, AXIS, { delay: 0.6 }), sparks__5(context)),
    region: { cx: 0.72, cy: 0.56, w: 0.4, h: 0.72 },
    typography: 'vertical',
    decay: { strength: 0.7, delay: 1.4 },
});
/** 反射（q）：光线打在平面镜上，入射角等于反射角，法线与角标。 */
const opticsMirror = optics({
    kind: 'optics-mirror',
    label: '反射',
    mood: 'quiet',
    light: ({ aspect }) => opticsRig([
        ray(aspect, [0.12, 0.08], [0.5, 0.6], { width: 0.02, intensity: 1 }),
        ray(aspect, [0.5, 0.6], [0.88, 0.08], { width: 0.02, intensity: 0.8 }, true),
    ], { x: 0.5, y: 0.6, radius: 0.05, intensity: 0.8, streak: 0.7 }),
    lineArt: context => mergeDiagrams(mirror(context.aspect * 0.5, 0.6, 0.6, 0), rayArt(context.aspect, [[0.12, 0.08], [0.5, 0.6], [0.88, 0.08]]), sparks__5(context)),
    region: { cx: 0.5, cy: 0.34, w: 0.5, h: 0.36 },
    heroSize: 0.07,
    typography: 'crossed',
    decay: { strength: 0.7, delay: 1.4 },
});
/** 折射（n）：光线穿过介质界面向法线偏折。 */
const opticsRefract = optics({
    kind: 'optics-refract',
    label: '折射',
    mood: 'neutral',
    light: ({ aspect }) => opticsRig([
        ray(aspect, [0.18, 0.05], [0.46, 0.5], { width: 0.02, intensity: 1 }),
        ray(aspect, [0.46, 0.5], [0.58, 1.05], { width: 0.02, intensity: 0.8 }, true),
        ray(aspect, [0.46, 0.5], [0.74, 0.05], { width: 0.01, intensity: 0.3 }, true),
    ], { x: 0.46, y: 0.5, radius: 0.05, intensity: 0.8, streak: 0.8 }),
    lineArt: context => mergeDiagrams(interfaceLine(context.aspect, 0.5), rayArt(context.aspect, [[0.18, 0.05], [0.46, 0.5], [0.58, 0.98]]), { paths: [segment([context.aspect * 0.46, 0.18], [context.aspect * 0.46, 0.82], { width: 0.0009, alpha: 0.35, delay: 0.4, dash: [0.006, 0.006] })], nodes: [] }, sparks__5(context)),
    region: { cx: 0.72, cy: 0.3, w: 0.44, h: 0.3 },
    heroSize: 0.07,
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 光具座（n）：横向光学台上一串透镜与刻度尺，一束光依次穿过。 */
const opticsBench = optics({
    kind: 'optics-bench',
    label: '光具座',
    mood: 'neutral',
    light: ({ aspect }) => opticsRig([
        ray(aspect, [-0.02, AXIS], [0.3, AXIS], { width: 0.05, spread: 0.01, intensity: 0.8 }),
        { ...ray(aspect, [0.3, AXIS], [0.5, AXIS], { width: 0.05, intensity: 0.9 }), spread: -0.06 },
        { ...ray(aspect, [0.5, AXIS], [0.7, AXIS], { width: 0.02, intensity: 0.9 }), spread: 0.06 },
        ray(aspect, [0.7, AXIS], [1.02, AXIS], { width: 0.05, intensity: 0.7 }, true),
    ], { x: 0.5, y: AXIS, radius: 0.04, intensity: 0.7, streak: 0.6 }),
    lineArt: context => mergeDiagrams(...[0.3, 0.5, 0.7].map((x, i) => lens(context.aspect * x, AXIS, 0.16 + (i % 2) * 0.04, i !== 1, context.aspect, { delay: i * 0.1 })), ruler(context.aspect * 0.06, context.aspect * 0.94, 0.58, 40, { delay: 0.3 }), sparks__5(context)),
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 潜望（n）：光线在两面镜之间折返，从上面拐到下面。 */
const opticsPeriscope = optics({
    kind: 'optics-periscope',
    label: '潜望',
    mood: 'neutral',
    light: ({ aspect }) => opticsRig([
        ray(aspect, [1.02, 0.14], [0.3, 0.14], { width: 0.02 }),
        ray(aspect, [0.3, 0.14], [0.3, 0.84], { width: 0.02 }),
        ray(aspect, [0.3, 0.84], [1.02, 0.84], { width: 0.02, intensity: 0.8 }, true),
    ], { x: 0.3, y: 0.14, radius: 0.04, intensity: 0.7, streak: 0.4 }),
    lineArt: context => mergeDiagrams(mirror(context.aspect * 0.3, 0.14, 0.14, Math.PI / 4), mirror(context.aspect * 0.3, 0.84, 0.14, Math.PI / 4, { delay: 0.1 }), rayArt(context.aspect, [[0.98, 0.14], [0.3, 0.14], [0.3, 0.84], [0.98, 0.84]]), sparks__5(context)),
    region: { cx: 0.62, cy: 0.49, w: 0.4, h: 0.5 },
    typography: 'vertical',
    decay: { strength: 0.8, delay: 1.2 },
});
/** 光纤（l）：光在一条弯曲的光纤里全反射前进，从另一头喷出一锥光。 */
const opticsFiber = optics({
    kind: 'optics-fiber',
    label: '光纤',
    mood: 'loud',
    light: () => opticsRig([
        { x: 0.84, y: 0.2, angle: -0.5, spread: 0.3, width: 0.02, length: 0.9, softness: 0.6, intensity: 1.2, streaks: 0.5, streakFreq: 9, streakSpeed: 0.1, core: 0.6,
            pulse: { amplitude: 0.2, period: 2.3, phase: 0 } },
        { x: 0.84, y: 0.2, angle: -0.5, spread: 0.08, width: 0.02, length: 1.2, softness: 0.5, intensity: 0.9, streaks: 0.2, streakFreq: 3, streakSpeed: 0, core: 0.8 },
    ], { x: 0.84, y: 0.2, radius: 0.07, intensity: 1.2, streak: 0.8 }),
    lineArt: context => mergeDiagrams(fiber([[context.aspect * 0.04, 0.86], [context.aspect * 0.4, 0.95], [context.aspect * 0.5, 0.1], [context.aspect * 0.84, 0.2]], 0.012), sparks__5(context)),
    region: { cx: 0.46, cy: 0.52, w: 0.6, h: 0.5 },
    typography: 'crossed',
    burst: { mode: 'sung', density: 0.3, every: 2, offset: 0, size: 3.2, tint: [0.8, 0.9, 1] },
    decay: { strength: 1.3, delay: 0.7 },
    starfall: { stars: 380, opening: 3, rain: 60, rainSpeed: 0.3, rainSpread: 0.8, brightness: 1 },
});
/** 暗箱（q）：一道光经小孔穿进暗箱（过孔会聚再散开），背面是倒立的像。 */
const opticsPinhole = optics({
    kind: 'optics-pinhole',
    label: '暗箱',
    mood: 'quiet',
    light: ({ aspect }) => {
        const distance = (0.45 + 0.02) * aspect;
        return opticsRig([
            { x: -0.02, y: AXIS, angle: 0, spread: -Math.atan(0.15 / distance), width: 0.3, length: 3, softness: 0.4, intensity: 0.8, streaks: 0.3, streakFreq: 6, streakSpeed: 0.05, core: 0.3, reach: distance + 0.3 },
        ], { x: 0.45, y: AXIS, radius: 0.03, intensity: 1, streak: 0.3 });
    },
    lineArt: context => mergeDiagrams(pinholeBox(context.aspect * 0.45 + 0.15, AXIS, 0.3, 0.3), sparks__5(context)),
    region: { cx: 0.2, cy: 0.52, w: 0.3, h: 0.7 },
    heroSize: 0.07,
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 望远（l）：物镜把平行光聚到焦点，目镜再把它变成更细的平行光。 */
const opticsTelescope = optics({
    kind: 'optics-telescope',
    label: '望远',
    mood: 'loud',
    light: ({ aspect }) => opticsRig([0.3, 0.5].flatMap(y => [
        ray(aspect, [-0.02, y], [0.28, y], { width: 0.02 }),
        ray(aspect, [0.28, y], [0.62, AXIS]),
        ray(aspect, [0.72, AXIS + (y - AXIS) * 0.3], [1.02, AXIS + (y - AXIS) * 0.3], { width: 0.02, intensity: 1.1 }, true),
    ]), { x: 0.62, y: AXIS, radius: 0.05, intensity: 1, streak: 0.8 }),
    lineArt: context => mergeDiagrams(lens(context.aspect * 0.28, AXIS, 0.36, true, context.aspect), lens(context.aspect * 0.72, AXIS, 0.12, true, context.aspect, { delay: 0.1 }), ...[0.3, 0.5].map((y, i) => rayArt(context.aspect, [[0.02, y], [0.28, y], [0.62, AXIS], [0.72, AXIS - (y - AXIS) * 0.3], [0.98, AXIS - (y - AXIS) * 0.3]], 0.2 + i * 0.1)), focusMark(context.aspect * 0.62, AXIS, { delay: 0.5 }), sparks__5(context)),
    typography: 'horizontal',
    burst: { mode: 'sung', density: 0.25, every: 2, offset: 1, size: 3.2, tint: [1, 0.8, 0.55] },
    decay: { strength: 1.2, delay: 0.8 },
});
/** 追迹（l）：几条光线在画面里反复折射，织成一张网。 */
const opticsRaytrace = optics({
    kind: 'optics-raytrace',
    label: '追迹',
    mood: 'loud',
    light: ({ aspect, random }) => {
        const points = Array.from({ length: 7 }, (_, i) => [0.05 + (i / 6) * 0.9, 0.1 + random() * 0.55]);
        return opticsRig(points.slice(0, 6).map((point, i) => ray(aspect, point, points[i + 1], { intensity: 0.8, width: 0.012 })), { x: points[0][0], y: points[0][1], radius: 0.05, intensity: 0.9, streak: 0.6 });
    },
    lineArt: ({ aspect, random }) => {
        const art = [];
        for (let k = 0; k < 4; k += 1) {
            const points = Array.from({ length: 6 }, (_, i) => [0.05 + (i / 5) * 0.9, 0.08 + random() * 0.6]);
            art.push(rayArt(aspect, points, 0.1 + k * 0.1));
        }
        return mergeDiagrams(...art, scatteredSparks({ aspect, count: 16, random, delay: 0.3 }));
    },
    typography: 'crossed',
    decay: { strength: 1.3, delay: 0.7 },
});
const OPTICS_PROFILES = [
    opticsConvex, opticsConcave, opticsMirror, opticsRefract, opticsBench,
    opticsPeriscope, opticsFiber, opticsPinhole, opticsTelescope, opticsRaytrace,
];

// ======== components/visualizer/lumiere/rigs/prism ========
// Copyright (c) 2026 chthollyphile



// src/components/visualizer/lumiere/rigs/prism.ts
// 棱镜族（色散）：白光经棱镜、晶片、水滴分成光谱。光谱色由色散模块按截面位置给出，饱和度受控。
// 排版 4 横 / 3 竖 / 3 纵横。
const prism = familyOf('prism', { starfall: { ...STARFALL, rain: 50 } });
const sparks__6 = ({ aspect, random }) => scatteredSparks({ aspect, count: 16, random, delay: 0.3 });
/** 一道光谱色的细光束（谱线、合光用）。 */
const tinted = (tint, overrides) => shaft({
    spread: 0.012, width: 0.012, length: 1.4, intensity: 0.7, streaks: 0.2, streakFreq: 3, core: 0.7, sway: undefined, tint, ...overrides,
});
/** 分光（l）：一束白光从左边射进三棱镜，出射成一扇光谱，字落在光谱上。 */
const prismSplit = prism({
    kind: 'prism-split',
    label: '分光',
    mood: 'loud',
    light: rig([
        shaft({ x: -0.02, y: 0.36, angle: 0.08, spread: 0.01, width: 0.02, length: 3, intensity: 0.9, streaks: 0.2, sway: undefined, reach: 0.78 }),
        shaft({
            x: 0.42, y: 0.4, angle: 0.3, spread: 0.2, width: 0.02, length: 1.1, softness: 0.4,
            intensity: 1.1, streaks: 0.35, streakFreq: 9, core: 0.2, spectrum: 1,
            sway: { amplitude: 0.03, period: 11, phase: 0 },
        }),
    ], { density: 0.9 }, { ...GLARE, x: 0.42, y: 0.4, radius: 0.06, intensity: 1, streak: 0.3 }),
    lineArt: context => mergeSpecs(prismTriangle({ cx: context.aspect * 0.42, cy: 0.42, size: 0.2, alpha: 0.8 }), sparks__6(context)),
    region: { cx: 0.62, cy: 0.66, w: 0.6, h: 0.44 },
    typography: 'horizontal',
    burst: { mode: 'sung', density: 0.3, every: 2, offset: 1, size: 3.4, tint: [0.8, 0.9, 1] },
    decay: { strength: 1.2, delay: 0.8 },
});
/** 光谱带（n）：一条横贯画面的连续光谱带，字在带上。 */
const prismBand = prism({
    kind: 'prism-band',
    label: '光谱带',
    mood: 'neutral',
    light: rig([shaft({ x: -0.05, y: 0.4, angle: 0.12, spread: 0.05, width: 0.16, length: 2.5, softness: 0.4, intensity: 0.9, streaks: 0.25, streakFreq: 6, core: 0.3, spectrum: 1,
            sway: { amplitude: 0.02, period: 14, phase: 0 } })], { density: 0.8 }, null),
    region: { cx: 0.5, cy: 0.56, w: 0.72, h: 0.46 },
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 虹边（q）：顶光的边缘带一点点色散彩边。 */
const prismFringe = prism({
    kind: 'prism-fringe',
    label: '虹边',
    mood: 'quiet',
    light: rig([
        shaft({ spread: 0.1, softness: 0.3, spectrum: 0.35, intensity: 0.9 }),
        shaft({ spread: 0.3, length: 0.6, softness: 0.9, intensity: 0.25, streaks: 0.8, streakFreq: 24, core: 0.4, spectrum: 0.5 }),
    ]),
    lineArt: context => standardArt(context),
    region: { cx: 0.5, cy: 0.5, w: 0.72, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.7, delay: 1.4 },
});
/** 碎晶（l）：散落的晶片各自折射出一小束光谱。 */
const prismShard = prism({
    kind: 'prism-shard',
    label: '碎晶',
    mood: 'loud',
    light: ({ random }) => ({
        beams: Array.from({ length: 5 }, (_, i) => shaft({
            x: 0.15 + random() * 0.7, y: 0.15 + random() * 0.5, angle: random() * Math.PI * 2, spread: 0.12, width: 0.01, length: 0.5,
            softness: 0.5, intensity: 0.8, streaks: 0.3, streakFreq: 6, core: 0.3, spectrum: 1, reach: 0.5 + random() * 0.3,
            sway: { amplitude: 0.1, period: 9 + i, phase: random() },
        })),
        fog: { density: 0.9, tyndallBase: 0.12, scale: 2.4, driftX: 0.008, driftY: -0.03, warp: 0.9, ambient: 0.03 },
        glare: null,
    }),
    lineArt: ({ aspect, random }) => mergeDiagrams(shards(aspect, random, 8), scatteredSparks({ aspect, count: 18, random, delay: 0.3 })),
    typography: 'crossed',
    burst: { mode: 'sweep', density: 0.4, every: 3, offset: 0, size: 3, tint: [0.85, 0.9, 1] },
    decay: { strength: 1.3, delay: 0.7 },
});
/** 谱线（q）：暗场里一排竖直的发射谱线，字像是谱线的标注。 */
const prismLines = prism({
    kind: 'prism-lines',
    label: '谱线',
    mood: 'quiet',
    light: rig([
        tinted([1, 0.35, 0.3], { x: 0.22, y: -0.05, angle: Math.PI / 2 }),
        tinted([1, 0.8, 0.3], { x: 0.36, y: -0.05, angle: Math.PI / 2, intensity: 0.5 }),
        tinted([0.5, 1, 0.5], { x: 0.47, y: -0.05, angle: Math.PI / 2, intensity: 0.8 }),
        tinted([0.4, 0.8, 1], { x: 0.61, y: -0.05, angle: Math.PI / 2, intensity: 0.6 }),
        tinted([0.6, 0.45, 1], { x: 0.78, y: -0.05, angle: Math.PI / 2, intensity: 0.45 }),
    ], { density: 0.7, ambient: 0.015 }, null),
    lineArt: ({ aspect, random }) => mergeDiagrams(spectrumLines(aspect * 0.12, aspect * 0.88, 0.84, 0.16, random, 18), scatteredSparks({ aspect, count: 10, random, delay: 0.3 })),
    region: { cx: 0.5, cy: 0.48, w: 0.72, h: 0.6 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 合光（n）：红绿蓝三束光汇到一点，合成一束白光往前走。 */
const prismMerge = prism({
    kind: 'prism-merge',
    label: '合光',
    mood: 'neutral',
    light: rig([
        tinted([1, 0.35, 0.3], { x: -0.02, y: 0.18, angle: 0.47, reach: 0.72, intensity: 0.8 }),
        tinted([0.45, 1, 0.45], { x: -0.02, y: 0.4, angle: 0.1, reach: 0.62, intensity: 0.8 }),
        tinted([0.4, 0.6, 1], { x: -0.02, y: 0.66, angle: -0.29, reach: 0.68, intensity: 0.8 }),
        shaft({ x: 0.36, y: 0.46, angle: 0.02, spread: 0.02, width: 0.02, length: 2, intensity: 1.1, streaks: 0.2, streakFreq: 3, core: 0.7, sway: undefined }),
    ], { density: 0.9 }, { ...GLARE, x: 0.36, y: 0.46, radius: 0.06, intensity: 1.1, streak: 0.5 }),
    lineArt: context => mergeSpecs(prismTriangle({ cx: context.aspect * 0.34, cy: 0.46, size: 0.12, alpha: 0.6 }), sparks__6(context)),
    typography: 'crossed',
    decay: { strength: 1, delay: 1 },
});
/** 分束（n）：一束光进入立方分光镜，一路直行、一路向下。 */
const prismCube = prism({
    kind: 'prism-cube',
    label: '分束',
    mood: 'neutral',
    // 射程按高度单位算，光源 x 是画面宽度的比例：入射光要走到分光镜中心，得乘画幅比。
    light: ({ aspect }) => rig([
        shaft({ x: -0.02, y: 0.34, angle: 0, spread: 0.01, width: 0.03, length: 3, intensity: 0.9, streaks: 0.2, sway: undefined, reach: (0.42 + 0.02) * aspect }),
        shaft({ x: 0.42, y: 0.34, angle: 0, spread: 0.01, width: 0.03, length: 3, intensity: 0.7, streaks: 0.2, sway: undefined, spectrum: 0.3 }),
        shaft({ x: 0.42, y: 0.34, angle: Math.PI / 2, spread: 0.01, width: 0.03, length: 3, intensity: 0.6, streaks: 0.2, sway: undefined, spectrum: 0.3 }),
    ], { density: 0.9 }, { ...GLARE, x: 0.42, y: 0.34, radius: 0.05, intensity: 0.9, streak: 0.4 })(),
    lineArt: context => mergeDiagrams(cubeSplitter(context.aspect * 0.42, 0.34, 0.08), scatteredSparks({ aspect: context.aspect, count: 12, random: context.random, delay: 0.3 })),
    region: { cx: 0.6, cy: 0.62, w: 0.6, h: 0.44 },
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 虹扇（l）：色散光扇绕光源缓慢转动。 */
const prismWheel = prism({
    kind: 'prism-wheel',
    label: '虹扇',
    mood: 'loud',
    light: rig([0, 1, 2].map(k => shaft({
        x: 0.5, y: 0.08, angle: Math.PI / 2 + (k - 1) * 0.7, spread: 0.18, width: 0.01, length: 1.1, softness: 0.4, intensity: 0.8,
        streaks: 0.3, streakFreq: 8, core: 0.2, spectrum: 1, sway: { amplitude: 0.5, period: 16, phase: k / 3 },
    })), { density: 0.9 }, { ...GLARE, y: 0.08, radius: 0.1, intensity: 1.1, streak: 0.4 }),
    lineArt: context => mergeSpecs(prismTriangle({ cx: context.aspect * 0.5, cy: 0.1, size: 0.1, alpha: 0.6 }), sparks__6(context)),
    typography: 'crossed',
    decay: { strength: 1.2, delay: 0.8 },
});
/** 虹霓（q）：雨后的光，一道淡淡的虹与霓。 */
const prismDroplet = prism({
    kind: 'prism-droplet',
    label: '虹霓',
    mood: 'quiet',
    light: rig([shaft({ x: 0.5, y: 1.2, angle: -Math.PI / 2, spread: 0.55, width: 0.1, length: 1.1, softness: 0.25, intensity: 0.55, streaks: 0.1, core: 0, spectrum: 1, sway: undefined })], { density: 0.7, driftY: 0.02 }, null),
    lineArt: ({ aspect, random }) => mergeDiagrams(rainbowArcs(aspect * 0.5, 1.02, 0.62), scatteredSparks({ aspect, count: 12, random, delay: 0.3 })),
    starfall: { ...STARFALL, rain: 160, rainSpeed: 0.5, rainSpread: 1.6, brightness: 0.8 },
    region: { cx: 0.5, cy: 0.46, w: 0.72, h: 0.6 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 扫谱（n）：光谱带像扫描一样沿字行扫过。 */
const prismSweep = prism({
    kind: 'prism-sweep',
    label: '扫谱',
    mood: 'neutral',
    light: rig([shaft({ x: 0.5, y: -0.1, angle: Math.PI / 2, spread: 0.08, width: 0.1, length: 1.4, softness: 0.4, intensity: 0.95, streaks: 0.2, core: 0.3, spectrum: 1,
            sway: { amplitude: 0.35, period: 8, phase: 0 } })], { density: 0.9 }, { ...GLARE, y: -0.05, intensity: 0.6 }),
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
const PRISM_PROFILES = [
    prismSplit, prismBand, prismFringe, prismShard, prismLines,
    prismMerge, prismCube, prismWheel, prismDroplet, prismSweep,
];

// ======== components/visualizer/lumiere/rigs/stage ========
// Copyright (c) 2026 chthollyphile



// src/components/visualizer/lumiere/rigs/stage.ts
// 追光族（舞台）：聚光灯、探照、脚光、逆光、频闪、激光、放映机。烟机的烟更浓，光源处画灯头。
// 排版 4 横 / 3 竖 / 3 纵横。
const stage = familyOf('stage', {
    motes: { ...MOTES, count: 200 },
});
const HAZE = { ...FOG, density: 1.25, tyndallBase: 0.08, scale: 2, driftX: 0.01, driftY: -0.015, warp: 1.1, ambient: 0.035 };
/** 从 a 指向 b（画面比例）的一盏灯。 */
const lamp = (aspect, a, b, overrides = {}) => shaft({
    x: a[0], y: a[1], angle: Math.atan2(b[1] - a[1], (b[0] - a[0]) * aspect), spread: 0.08, width: 0.03, length: 1.3, softness: 0.55,
    intensity: 1, streaks: 0.4, streakFreq: 6, core: 0.6, sway: undefined,
    ...overrides,
});
const stageRig = (beams, glare = null, fog = {}) => ({ beams, fog: { ...HAZE, ...fog }, glare });
/** 每盏灯的灯头线稿 + 闪点。 */
const lampsArt = (context, beams) => mergeDiagrams(...beams.map((beam, i) => lampHead(beam.x * context.aspect, beam.y, beam.angle, 0.035, { delay: i * 0.05 })), scatteredSparks({ aspect: context.aspect, count: 10, random: context.random, delay: 0.3 }));
const withLamps = (build) => ({
    light: build,
    lineArt: (context) => lampsArt(context, build(context).beams),
});
const CENTER = [0.5, 0.56];
/** 独光（n）：一束追光从左上斜打在字上。 */
const stageSpot = stage({
    kind: 'stage-spot',
    label: '独光',
    mood: 'neutral',
    ...withLamps(({ aspect }) => stageRig([lamp(aspect, [0.14, 0.02], CENTER, { sway: { amplitude: 0.02, period: 12, phase: 0 } })], { x: 0.14, y: 0.02, radius: 0.08, intensity: 0.9, streak: 0.5 })),
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 交叉（l）：两束光从上方两角打下，交点正是字。 */
const stageCross = stage({
    kind: 'stage-cross',
    label: '交叉',
    mood: 'loud',
    ...withLamps(({ aspect }) => stageRig([
        lamp(aspect, [0.06, 0.02], CENTER, { sway: { amplitude: 0.03, period: 9, phase: 0 } }),
        lamp(aspect, [0.94, 0.02], CENTER, { sway: { amplitude: 0.03, period: 9, phase: 0.5 } }),
    ], { x: 0.5, y: 0.56, radius: 0.06, intensity: 0.6, streak: 0.6 })),
    typography: 'crossed',
    burst: { mode: 'sung', density: 0.3, every: 2, offset: 1, size: 3.4, tint: [1, 0.75, 0.5] },
    decay: { strength: 1.3, delay: 0.7 },
});
/** 探照（l）：底下几盏探照灯在烟里来回扫。 */
const stageSearch = stage({
    kind: 'stage-search',
    label: '探照',
    mood: 'loud',
    ...withLamps(() => stageRig([0.15, 0.38, 0.62, 0.85].map((x, i) => shaft({
        x, y: 1.02, angle: -Math.PI / 2, spread: 0.035, width: 0.03, length: 1.4, softness: 0.5, intensity: 0.8, streaks: 0.3, streakFreq: 5, core: 0.6,
        sway: { amplitude: 0.45, period: 7 + i * 1.3, phase: i * 0.27 },
    })))),
    region: { cx: 0.5, cy: 0.44, w: 0.72, h: 0.46 },
    typography: 'horizontal',
    decay: { strength: 1.3, delay: 0.7 },
});
/** 脚光（q）：台口的一排暖光自下而上。 */
const stageFootlight = stage({
    kind: 'stage-footlight',
    label: '脚光',
    mood: 'quiet',
    ...withLamps(() => stageRig([0.25, 0.5, 0.75].map(x => shaft({
        x, y: 1.03, angle: -Math.PI / 2, spread: 0.22, width: 0.08, length: 0.7, softness: 0.9, intensity: 0.6, streaks: 0.4, streakFreq: 10, core: 0.3,
        tint: [1, 0.8, 0.6], sway: undefined,
    })), null, { driftY: -0.03 })),
    region: { cx: 0.5, cy: 0.46, w: 0.5, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 逆光（n）：字后面一团强光，光束从背后往外放射，字像剪影。 */
const stageBacklight = stage({
    kind: 'stage-backlight',
    label: '逆光',
    mood: 'neutral',
    light: () => stageRig(Array.from({ length: 6 }, (_, k) => shaft({
        x: 0.5, y: 0.5, angle: (k / 6) * Math.PI * 2 + 0.5, spread: 0.12, width: 0.02, length: 0.8, softness: 0.7, intensity: 0.6,
        streaks: 0.6, streakFreq: 10, core: 0.4, sway: { amplitude: 0.05, period: 11, phase: k / 6 },
    })), { x: 0.5, y: 0.5, radius: 0.22, intensity: 1.2, streak: 0.8 }),
    lineArt: ({ aspect, random }) => scatteredSparks({ aspect, count: 18, random, delay: 0.3 }),
    region: { cx: 0.5, cy: 0.5, w: 0.72, h: 0.5 },
    typography: 'crossed',
    decay: { strength: 1, delay: 1 },
});
/** 针光（q）：一道极窄的光锥，只照亮字那一小块。 */
const stagePinspot = stage({
    kind: 'stage-pinspot',
    label: '针光',
    mood: 'quiet',
    ...withLamps(({ aspect }) => stageRig([lamp(aspect, [0.5, 0.02], CENTER, { spread: 0.03, width: 0.01, intensity: 0.9, core: 0.9 })], null, { ambient: 0.015 })),
    typography: 'horizontal',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 频闪（l）：几盏灯随节拍一明一灭地频闪。 */
const stageStrobe = stage({
    kind: 'stage-strobe',
    label: '频闪',
    mood: 'loud',
    ...withLamps(({ aspect }) => stageRig([0.1, 0.36, 0.64, 0.9].map((x, i) => lamp(aspect, [x, 0.02], [0.5, 0.6], {
        spread: 0.08, intensity: 0.55, pulse: { amplitude: 0.95, period: 0.5, phase: i * 0.25 },
    })), { x: 0.5, y: 0.02, radius: 0.2, intensity: 0.6, streak: 0.4 })),
    typography: 'crossed',
    burst: { mode: 'sweep', density: 0.5, every: 2, offset: 0, size: 3, tint: [1, 0.9, 0.8] },
    decay: { strength: 1.4, delay: 0.6 },
});
/** 幕缝（q）：帷幕的缝隙里透出一道竖直的光。 */
const stageCurtain = stage({
    kind: 'stage-curtain',
    label: '幕缝',
    mood: 'quiet',
    light: () => stageRig([shaft({ spread: 0.01, width: 0.04, length: 1.6, softness: 0.5, intensity: 0.9, streaks: 0.3, core: 0.7, sway: undefined })], { x: 0.5, y: -0.02, radius: 0.08, intensity: 0.8, streak: 0.5 }, { ambient: 0.02 }),
    lineArt: ({ aspect, random }) => mergeDiagrams(curtains(aspect, 0.06), scatteredSparks({ aspect, count: 8, random, delay: 0.3, region: [0.3, 0.2, 0.7, 0.9] })),
    region: { cx: 0.5, cy: 0.5, w: 0.3, h: 0.66 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 激光（l）：台底一扇细锐的激光线，在烟里扫动。 */
const stageLaser = stage({
    kind: 'stage-laser',
    label: '激光',
    mood: 'loud',
    ...withLamps(() => stageRig(Array.from({ length: 6 }, (_, k) => shaft({
        x: 0.5, y: 1.02, angle: -Math.PI / 2 + (k - 2.5) * 0.22, spread: 0.002, width: 0.004, length: 2, softness: 0.3, intensity: 1.2,
        streaks: 0, core: 0.9, sway: { amplitude: 0.25, period: 4.5, phase: k * 0.08 },
    })), { x: 0.5, y: 1.0, radius: 0.06, intensity: 1, streak: 0.6 }, { density: 1.4 })),
    region: { cx: 0.5, cy: 0.4, w: 0.72, h: 0.46 },
    typography: 'horizontal',
    decay: { strength: 1.3, delay: 0.7 },
});
/** 放映（n）：左边一台放映机，光锥里满是浮尘，字像投在光里。 */
const stageProjector = stage({
    kind: 'stage-projector',
    label: '放映',
    mood: 'neutral',
    light: () => stageRig([shaft({ x: 0.12, y: 0.4, angle: 0.05, spread: 0.2, width: 0.02, length: 1.8, softness: 0.4, intensity: 1, streaks: 0.5, streakFreq: 9, core: 0.4, sway: undefined,
            pulse: { amplitude: 0.05, period: 0.12, phase: 0 } })], { x: 0.12, y: 0.4, radius: 0.05, intensity: 1, streak: 0.4 }),
    lineArt: ({ aspect, random }) => mergeDiagrams(projector(aspect * 0.12, 0.4, 0.1), scatteredSparks({ aspect, count: 10, random, delay: 0.3 })),
    motes: { ...MOTES, count: 380, driftX: 0.004, swirl: 0.03, gain: 1.8 },
    region: { cx: 0.62, cy: 0.5, w: 0.44, h: 0.58 },
    typography: 'vertical',
    decay: { strength: 1, delay: 1 },
});
const STAGE_PROFILES = [
    stageSpot, stageCross, stageSearch, stageFootlight, stageBacklight,
    stagePinspot, stageStrobe, stageCurtain, stageLaser, stageProjector,
];

// ======== components/visualizer/lumiere/rigs/wave ========
// Copyright (c) 2026 chthollyphile



// src/components/visualizer/lumiere/rigs/wave.ts
// 衍射族（干涉与衍射）：条纹、光环、莫尔、虹彩。干涉模块在一块区域里发光，窗影与色散做光栅、莫尔、薄膜。
// 排版 4 横 / 3 竖 / 3 纵横。
const wave = familyOf('wave', { starfall: { ...STARFALL, rain: 40 } });
const sparks__7 = ({ aspect, random }) => scatteredSparks({ aspect, count: 12, random, delay: 0.3 });
const fringes = (spec) => ({ wave: spec });
/** 双缝（n）：顶光穿过挡板上的两道缝，下方屏上是明暗相间的干涉条纹。 */
const waveSlits = wave({
    kind: 'wave-slits',
    label: '双缝',
    mood: 'neutral',
    light: rig([shaft({ spread: 0.05, width: 0.04, length: 0.6, intensity: 0.9 })], { density: 0.9 }, GLARE, fringes({ mode: 'slits', cx: 0.5, cy: 0.72, radius: 0.3, frequency: 5, speed: 0.4, strength: 0.55 })),
    lineArt: context => mergeSpecs(slitBarrier({ cx: context.aspect * 0.5, y: 0.3, width: context.aspect * 0.5, gap: 0.012, separation: 0.08 }), viewfinderFrame({ aspect: context.aspect, left: 0.2, top: 0.52, right: 0.8, bottom: 0.92, delay: 0.2, alpha: 0.28 }), sparks__7(context)),
    region: { cx: 0.5, cy: 0.5, w: 0.72, h: 0.5 },
    typography: 'crossed',
    decay: { strength: 1, delay: 1 },
});
/** 牛顿环（q）：一圈圈明暗相间的同心环，字在环心。 */
const waveNewton = wave({
    kind: 'wave-newton',
    label: '牛顿环',
    mood: 'quiet',
    light: rig([shaft({ spread: 0.06, width: 0.04, length: 0.6, intensity: 0.6 })], { density: 0.7 }, { ...GLARE, intensity: 0.5 }, fringes({ mode: 'rings', cx: 0.5, cy: 0.5, radius: 0.4, frequency: 5, speed: 0.3, strength: 0.5, shield: 0.75 })),
    lineArt: context => mergeDiagrams(rings(context.aspect * 0.5, 0.5, 0.4, 6), sparks__7(context)),
    region: { cx: 0.5, cy: 0.5, w: 0.4, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 艾里斑（q）：一个点光源的衍射亮斑与一圈圈淡淡的外环。 */
const waveAiry = wave({
    kind: 'wave-airy',
    label: '艾里斑',
    mood: 'quiet',
    light: rig([shaft({ x: 0.5, y: -0.05, spread: 0.02, width: 0.01, length: 0.6, intensity: 0.5, reach: 0.4 })], { density: 0.6 }, { x: 0.5, y: 0.4, radius: 0.04, intensity: 1, streak: 0.4 }, fringes({ mode: 'airy', cx: 0.5, cy: 0.4, radius: 0.3, frequency: 3, speed: 0, strength: 0.7 })),
    lineArt: context => mergeDiagrams(rings(context.aspect * 0.5, 0.4, 0.3, 4, { alpha: 0.3 }), sparks__7(context)),
    region: { cx: 0.5, cy: 0.72, w: 0.72, h: 0.36 },
    typography: 'horizontal',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 光栅（n）：一束光打到光栅上，下面分出几级带彩边的衍射光。 */
const waveGrating = wave({
    kind: 'wave-grating',
    label: '光栅',
    mood: 'neutral',
    light: rig([
        shaft({ spread: 0.01, width: 0.03, length: 2, intensity: 0.9, reach: 0.32, sway: undefined }),
        ...[-2, -1, 0, 1, 2].map(k => shaft({
            y: 0.3, angle: Math.PI / 2 + k * 0.32, spread: 0.02, width: 0.02, length: 1.2, intensity: 0.8 - Math.abs(k) * 0.15,
            streaks: 0.2, core: 0.6, spectrum: k === 0 ? 0 : 0.8, sway: undefined,
        })),
    ], { density: 0.9 }, { ...GLARE, y: 0.3, radius: 0.05, intensity: 0.9, streak: 0.6 }),
    lineArt: context => mergeDiagrams(grating(context.aspect * 0.5, 0.3, context.aspect * 0.4, 16), sparks__7(context)),
    region: { cx: 0.5, cy: 0.7, w: 0.72, h: 0.38 },
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 波叠（l）：两个点源的圆波相互干涉，明暗的双曲线条纹。 */
const waveSources = wave({
    kind: 'wave-sources',
    label: '波叠',
    mood: 'loud',
    light: rig([shaft({ spread: 0.15, intensity: 0.4 })], { density: 0.8 }, { ...GLARE, intensity: 0.5 }, fringes({ mode: 'sources', cx: 0.5, cy: 0.5, radius: 0.46, frequency: 4, speed: 1.2, strength: 0.6, separation: 0.14 })),
    lineArt: context => mergeDiagrams(twoSources(context.aspect * 0.5, 0.5, 0.14, 0.3), sparks__7(context)),
    typography: 'crossed',
    burst: { mode: 'sung', density: 0.3, every: 2, offset: 0, size: 3.2, tint: [0.85, 0.9, 1] },
    decay: { strength: 1.3, delay: 0.7 },
});
/** 莫尔（n）：两层细光栅错开一点角度，叠出缓慢流动的莫尔光纹。 */
const waveMoire = wave({
    kind: 'wave-moire',
    label: '莫尔',
    mood: 'neutral',
    light: rig([
        shaft({ spread: 0.2, width: 0.3, length: 1.3, softness: 0.6, intensity: 0.6, streaks: 0, core: 0.2, gobo: { pattern: 'blinds', frequency: 22, duty: 0.5, drift: 0.02 }, sway: undefined }),
        shaft({ angle: Math.PI / 2 + 0.06, spread: 0.2, width: 0.3, length: 1.3, softness: 0.6, intensity: 0.6, streaks: 0, core: 0.2, gobo: { pattern: 'blinds', frequency: 23, duty: 0.5, drift: -0.02 }, sway: { amplitude: 0.03, period: 14, phase: 0 } }),
    ], { density: 0.8 }, { ...GLARE, intensity: 0.5 }),
    lineArt: context => mergeDiagrams(moire(context.aspect * 0.5, 0.32, 0.4, 24, 0.08), sparks__7(context)),
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 薄膜（q）：肥皂泡一样流动的虹彩。 */
const waveFilm = wave({
    kind: 'wave-film',
    label: '薄膜',
    mood: 'quiet',
    light: rig([shaft({ spread: 0.4, width: 0.3, length: 1.2, softness: 0.95, intensity: 0.45, streaks: 0.6, streakFreq: 3, streakSpeed: 0.2, core: 0.2, spectrum: 1,
            sway: { amplitude: 0.15, period: 13, phase: 0 } })], { density: 0.7 }, null, fringes({ mode: 'rings', cx: 0.5, cy: 0.4, radius: 0.3, frequency: 1.6, speed: 0.6, strength: 0.25 })),
    lineArt: context => mergeDiagrams({ paths: [circle(context.aspect * 0.5, 0.4, 0.3, { width: 0.0016, alpha: 0.45 }), circle(context.aspect * 0.5 - 0.08, 0.3, 0.06, { width: 0.001, alpha: 0.3, delay: 0.2 })], nodes: [] }, sparks__7(context)),
    region: { cx: 0.5, cy: 0.5, w: 0.4, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});
/** 偏振（n）：两片偏振片一转，透过来的光一明一暗地呼吸。 */
const wavePolar = wave({
    kind: 'wave-polar',
    label: '偏振',
    mood: 'neutral',
    // 第一束穿过第一片、走到第二片；第二束从第二片出发，随偏振片转动一明一暗（按画幅比例定位）。
    light: ({ aspect }) => {
        const second = aspect * 0.5 + 0.12;
        return rig([
            shaft({ x: -0.02, y: 0.36, angle: 0, spread: 0.02, width: 0.14, length: 3, intensity: 0.8, streaks: 0.2, core: 0.4, reach: second + 0.02 * aspect, sway: undefined }),
            shaft({ x: second / aspect, y: 0.36, angle: 0, spread: 0.02, width: 0.14, length: 3, intensity: 0.7, streaks: 0.2, core: 0.4, sway: undefined, pulse: { amplitude: 0.9, period: 6, phase: 0 } }),
        ], { density: 0.8 }, null)();
    },
    lineArt: context => mergeDiagrams(polarizers(context.aspect * 0.5, 0.36, 0.1, 0.24, Math.PI / 3), sparks__7(context)),
    region: { cx: 0.5, cy: 0.7, w: 0.72, h: 0.36 },
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});
/** 驻波（l）：字行上方几条驻波一样的光线，随节拍一起振动。 */
const waveStanding = wave({
    kind: 'wave-standing',
    label: '驻波',
    mood: 'loud',
    light: rig([0.26, 0.34, 0.42].map((y, i) => shaft({
        x: -0.02, y, angle: 0, spread: 0.004, width: 0.01, length: 3, intensity: 0.7, streaks: 0.6, streakFreq: 4, core: 0.8, sway: undefined,
        pulse: { amplitude: 0.6, period: 1.2, phase: i / 3 },
    })), { density: 0.9 }, null),
    lineArt: context => mergeDiagrams(standingWave(context.aspect * 0.08, context.aspect * 0.92, 0.34, 0.07, 6), sparks__7(context)),
    typography: 'crossed',
    decay: { strength: 1.3, delay: 0.7 },
});
/** 全息（l）：字像一张全息片，细密的斜纹与流动的虹彩。 */
const waveHolo = wave({
    kind: 'wave-holo',
    label: '全息',
    mood: 'loud',
    light: rig([shaft({ spread: 0.3, width: 0.3, length: 1.3, softness: 0.8, intensity: 0.8, streaks: 0.3, core: 0.3, spectrum: 0.8,
            gobo: { pattern: 'lattice', frequency: 24, duty: 0.7, drift: 0.15 }, sway: { amplitude: 0.1, period: 10, phase: 0 } })], { density: 0.8 }, { ...GLARE, intensity: 0.6 }, fringes({ mode: 'rings', cx: 0.5, cy: 0.5, radius: 0.5, frequency: 8, speed: 1, strength: 0.15 })),
    lineArt: context => mergeDiagrams(gridPanel(context.aspect * 0.3, 0.15, context.aspect * 0.4, 0.7, 6, 8, true, { alpha: 0.3 }), sparks__7(context)),
    region: { cx: 0.5, cy: 0.5, w: 0.4, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 1.3, delay: 0.7 },
});
const WAVE_PROFILES = [
    waveSlits, waveNewton, waveAiry, waveGrating, waveSources,
    waveMoire, waveFilm, wavePolar, waveStanding, waveHolo,
];

// ======== components/visualizer/lumiere/rigs/zenith ========
// Copyright (c) 2026 chthollyphile


// src/components/visualizer/lumiere/rigs/zenith.ts
// 天光族（顶光，参考图的主调）：10 个光位。排版分配 4 横 / 3 竖 / 3 纵横。
const zenith = familyOf('zenith');
/** 天井（n）：顶部单柱光，光内烟雾上升，量角器光环与取景框。参考图。 */
const zenithShaft = zenith({
    kind: 'zenith-shaft',
    label: '天井',
    mood: 'neutral',
    light: rig([shaft(), fan(), fan({ spread: 0.55, length: 0.42, softness: 1, intensity: 0.16, streaks: 0.9, streakFreq: 40, streakSpeed: -0.03, core: 0.2, sway: undefined })]),
    typography: 'crossed',
    decay: { strength: 1, delay: 1 },
    starfall: STARFALL,
});
/** 扇光（l）：顶部光源散出五道扇形放射细光束，缓慢张合。 */
const zenithFan = zenith({
    kind: 'zenith-fan',
    label: '扇光',
    mood: 'loud',
    light: rig([-2, -1, 0, 1, 2].map(k => shaft({
        angle: DOWN + k * 0.24, spread: 0.035, width: 0.012, length: 0.9, intensity: 0.7 - Math.abs(k) * 0.08,
        streaks: 0.4, streakFreq: 5, sway: { amplitude: 0.05, period: 11, phase: k * 0.1 },
    }))),
    typography: 'horizontal',
    decay: { strength: 1.2, delay: 0.8 },
    starfall: { ...STARFALL, rain: 110, rainSpread: 0.6 },
});
/** 圣环（n）：光柱 + 大号量角器光环，光源眩光更大。 */
const zenithHalo = zenith({
    kind: 'zenith-halo',
    label: '圣环',
    mood: 'neutral',
    light: rig([shaft({ spread: 0.07 }), fan({ spread: 0.42, intensity: 0.24 })], {}, { ...GLARE, radius: 0.2, intensity: 1.2, streak: 0.7 }),
    lineArt: context => mergeSpecs(protractorHalo({ cx: context.aspect * 0.5, cy: 0.03, radius: 0.42, alpha: 0.7, spokeStep: Math.PI / 18 }), protractorHalo({ cx: context.aspect * 0.5, cy: 0.03, radius: 0.24, alpha: 0.4, delay: 0.2 }), scatteredSparks({ aspect: context.aspect, count: 20, random: context.random, delay: 0.3 })),
    region: { cx: 0.5, cy: 0.5, w: 0.72, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.8, delay: 1.2 },
    starfall: STARFALL,
});
/** 游光（q）：一道光柱左右大幅摆动，扫过字行。 */
const zenithDrift = zenith({
    kind: 'zenith-drift',
    label: '游光',
    mood: 'quiet',
    light: rig([shaft({ sway: { amplitude: 0.2, period: 9, phase: 0 }, intensity: 0.85 }), fan({ intensity: 0.2, sway: { amplitude: 0.2, period: 9, phase: 0 } })], { density: 0.9 }),
    typography: 'horizontal',
    decay: { strength: 0.7, delay: 1.4 },
    camera: { push: 0.02, driftX: 0.01, driftY: 0 },
});
/** 双柱（n）：两道平行顶光，字在两柱之间，光柱缓慢相向摆动。 */
const zenithTwin = zenith({
    kind: 'zenith-twin',
    label: '双柱',
    mood: 'neutral',
    light: rig([
        shaft({ x: 0.33, spread: 0.06, sway: { amplitude: 0.06, period: 12, phase: 0 } }),
        shaft({ x: 0.67, spread: 0.06, sway: { amplitude: 0.06, period: 12, phase: 0.5 } }),
    ], {}, null),
    lineArt: context => mergeSpecs(viewfinderFrame({ aspect: context.aspect, left: 0.07, top: 0.21, right: 0.93, bottom: 0.8, alpha: 0.32 }), scatteredSparks({ aspect: context.aspect, count: 18, random: context.random, delay: 0.2 })),
    typography: 'crossed',
    decay: { strength: 1, delay: 1 },
});
/** 光雨（l）：细密的竖直光线如雨落下，光雨很密。 */
const zenithRain = zenith({
    kind: 'zenith-rain',
    label: '光雨',
    mood: 'loud',
    light: rig([0.18, 0.34, 0.5, 0.66, 0.82, 0.42].map((x, i) => shaft({
        x, spread: 0.012, width: 0.01, length: 1.1, intensity: 0.45, streaks: 0.7, streakFreq: 3,
        pulse: { amplitude: 0.35, period: 1.7 + i * 0.37, phase: i * 0.21 }, sway: undefined,
    })), { driftY: 0.05 }, { ...GLARE, intensity: 0.5 }),
    typography: 'vertical',
    decay: { strength: 1.3, delay: 0.6 },
    starfall: { ...STARFALL, rain: 220, rainSpeed: 0.45, rainSpread: 1.4, brightness: 1.1 },
});
/** 光井（q）：窄光柱落在字下的一个圆形光斑上，四周全暗。 */
const zenithWell = zenith({
    kind: 'zenith-well',
    label: '光井',
    mood: 'quiet',
    light: rig([shaft({ spread: 0.05, width: 0.02, length: 1.4, intensity: 0.8, core: 0.9 })], { density: 0.7, ambient: 0.015 }, { ...GLARE, intensity: 0.6 }),
    lineArt: context => ({
        paths: [
            { points: ellipse(context.aspect * 0.5, 0.8, 0.26, 0.05), width: 0.0018, alpha: 0.7, delay: 0.1, span: 0.5 },
            { points: ellipse(context.aspect * 0.5, 0.8, 0.17, 0.032), width: 0.0012, alpha: 0.45, delay: 0.2, span: 0.4, dash: [0.004, 0.008] },
        ],
        nodes: [{ at: [context.aspect * 0.5, 0.8], size: 0.03, delay: 0.3, twinklePhase: 0 }],
    }),
    motes: { ...MOTES, count: 160 },
    typography: 'horizontal',
    decay: { strength: 0.6, delay: 1.6 },
});
/**
 * 冠冕（l）：天井的光位加上更大的光源眩光，唱到的字里约四成各冒出一个小十字（EVA 式），
 * 连成一串，光偏橙红。给副歌与高潮用。
 */
const zenithCrown = zenith({
    kind: 'zenith-crown',
    label: '冠冕',
    mood: 'loud',
    light: context => ({ ...zenithShaft.light(context), glare: { x: 0.5, y: 0.0, radius: 0.18, intensity: 1.3, streak: 0.8 } }),
    burst: { mode: 'sung', density: 0.4, every: 1, offset: 0, size: 4, tint: [1, 0.6, 0.4] },
    typography: 'horizontal',
    decay: { strength: 1.25, delay: 0.7 },
    // 更密更快的光雨。
    starfall: { stars: 520, opening: 2.6, rain: 120, rainSpeed: 0.32, rainSpread: 0.5, brightness: 1.1 },
    camera: { push: 0.05, driftX: 0, driftY: -0.01 },
});
/** 垂降（n）：光柱自上而下伸长（每个镜头开头 3 秒），碰到字时点亮。 */
const zenithDescent = zenith({
    kind: 'zenith-descent',
    label: '垂降',
    mood: 'neutral',
    light: rig([shaft({ reveal: 3 }), fan({ reveal: 3.5 })]),
    typography: 'crossed',
    decay: { strength: 1, delay: 1 },
    starfall: { ...STARFALL, rain: 40 },
});
/** 余烬（q）：光柱将熄，只剩烟里的暖色余光与上飘的火星。 */
const zenithEmber = zenith({
    kind: 'zenith-ember',
    label: '余烬',
    mood: 'quiet',
    light: rig([
        shaft({ intensity: 0.45, tint: [1, 0.7, 0.5], pulse: { amplitude: 0.2, period: 5, phase: 0 } }),
        fan({ intensity: 0.12, tint: [1, 0.6, 0.4] }),
    ], { density: 1.2, ambient: 0.04, driftY: -0.05 }, { ...GLARE, intensity: 0.4 }),
    motes: { ...MOTES, count: 320, driftY: -0.035, swirl: 0.03, gain: 1.6, ambient: 0.04 },
    region: { cx: 0.5, cy: 0.5, w: 0.72, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 1.4, delay: 0.8 },
    camera: { push: 0.02, driftX: 0, driftY: -0.012 },
});
const ZENITH_PROFILES = [
    zenithShaft, zenithFan, zenithHalo, zenithDrift, zenithTwin,
    zenithRain, zenithWell, zenithCrown, zenithDescent, zenithEmber,
];

// ======== components/visualizer/lumiere/catalog ========
// Copyright (c) 2026 chthollyphile










// 光位目录的索引基准。
const lumiereScaleMask__3 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__3 = ((4898 ^ lumiereScaleMask__3) + Math.imul(523 ^ lumiereScaleMask__3, 0xbafc ^ lumiereScaleMask__3))
    - ((4898 ^ lumiereScaleMask__3) + Math.imul(523 ^ lumiereScaleMask__3, 0xbafc ^ lumiereScaleMask__3));
// src/components/visualizer/lumiere/catalog.ts
// 绘光的光位目录：10 族 × 10 种（设计见 lumisynth 仓库 docs/LUMIERE.md 第二节），按文档的族序排列。
const LUMIERE_FAMILY_LABELS = {
    zenith: '天光',
    lattice: '窗隙',
    prism: '棱镜',
    caustic: '焦散',
    optics: '光路',
    wave: '衍射',
    botany: '叶脉',
    astral: '星象',
    stage: '追光',
    motes: '萤尘',
};
/** 各族的画面，一句话（设置与调试面板里的族说明）。 */
const LUMIERE_FAMILY_DESCRIPTIONS = {
    zenith: '顶光：一束或数束光柱从正上方落下，最标准的绘光画面，哪段都能用',
    lattice: '光穿过百叶、窗格、门缝、树叶，投下条纹与格子影，室内、日常、回忆感',
    prism: '棱镜分光：白光拆成彩虹色的光束与光谱，色彩最多，适合上扬与副歌',
    caustic: '水、玻璃与晶体折出的流动光网，池底与杯影，温柔、流动',
    optics: '光路图解：透镜、焦点、镜面反射、光纤，理性、精密，像实验记录',
    wave: '干涉与衍射：同心环、双缝条纹、光栅、驻波，抽象、有节奏感',
    botany: '金色的叶脉、藤蔓、种子与花的线稿在光里生长，安静、有生命感',
    astral: '星图：轨道、星轨、星座连线、日冕与浑天仪，辽阔、适合副歌与尾声',
    stage: '舞台追光：聚光灯、探照灯、频闪、激光，浓烟，最有演出感和冲击力',
    motes: '以烟与光尘为主、几乎没有光束：浮尘、萤火、光雪、极光，最安静，适合间奏与换气',
};
const LUMIERE_PROFILES = [
    ...ZENITH_PROFILES,
    ...LATTICE_PROFILES,
    ...PRISM_PROFILES,
    ...CAUSTIC_PROFILES,
    ...OPTICS_PROFILES,
    ...WAVE_PROFILES,
    ...BOTANY_PROFILES,
    ...ASTRAL_PROFILES,
    ...STAGE_PROFILES,
    ...MOTES_PROFILES,
];
const BY_KIND = new Map(LUMIERE_PROFILES.map(profile => [profile.kind, profile]));
const LUMIERE_KINDS = LUMIERE_PROFILES.map(profile => profile.kind);
/** 未知的 kind 退回天井。 */
const profileOf = (kind) => BY_KIND.get(kind) ?? LUMIERE_PROFILES[0 + LUMIERE_NEUTRAL_OFFSET__3];
const hasProfile = (kind) => BY_KIND.has(kind);

// ======== components/visualizer/lumiere/color ========
// Copyright (c) 2026 chthollyphile

// 色板通道的参考采样。
const lumiereScaleMask__4 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__4 = ((0xbafc3e03 ^ lumiereScaleMask__4) + Math.imul(0x3b7e2939 ^ lumiereScaleMask__4, 0x787a43c7 ^ lumiereScaleMask__4))
    - ((0xbafc3e03 ^ lumiereScaleMask__4) + Math.imul(0x3b7e2939 ^ lumiereScaleMask__4, 0x787a43c7 ^ lumiereScaleMask__4));
const rgbOf = (color, fallback = [1, 1, 1]) => {
    const channels = parseColorChannels(color);
    return channels ? [channels.r / 255, channels.g / 255, channels.b / 255] : fallback;
};
const mixRgb = (a, b, amount) => [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
];
const scaleRgb = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const hexOf = (rgb) => {
    const c = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
    return (c(rgb[0]) << 16) | (c(rgb[1]) << 8) | c(rgb[2]);
};
const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
const WHITE = [1, 1, 1];
/** 参考图的香槟金。 */
const CHAMPAGNE = [1, 0.86 + LUMIERE_NEUTRAL_OFFSET__4, 0.62];

// ======== components/visualizer/lumiere/lumiereAudio ========
const ATTACK_SECONDS = 0.06;
const RELEASE_SECONDS = 0.25;
/** 单个值归一化到 0..1；rawScale 为 true 时按 0..255 换算。 */
const normalizeLumiereAudioValue = (value, rawScale) => {
    if (!Number.isFinite(value) || value <= 0)
        return 0;
    return Math.min(1, rawScale ? value / 255 : value);
};
/** 一阶低通，起音与释放各自的时间常数；dt 秒。 */
const smoothLumiereAudioValue = (current, target, dt) => {
    const tau = target > current ? ATTACK_SECONDS : RELEASE_SECONDS;
    const k = 1 - Math.exp(-Math.max(0, dt) / tau);
    return current + (target - current) * k;
};
const createLumiereAudioSampler = (initial) => {
    let sources = initial;
    let rawScale = false;
    let lastMs = 0;
    const frame = { bass: 0, treble: 0, power: 0 };
    const read = (value) => {
        const raw = value?.get() ?? 0;
        if (raw > 1)
            rawScale = true;
        return raw;
    };
    return {
        frame,
        setSources: next => {
            if (next.audioPower === sources.audioPower && next.audioBands === sources.audioBands)
                return;
            sources = next;
            rawScale = false;
        },
        sample: (nowMs, paused) => {
            const dt = lastMs > 0 ? Math.min(0.1, (nowMs - lastMs) / 1000) : 1;
            lastMs = nowMs;
            if (paused) {
                frame.bass = 0;
                frame.treble = 0;
                frame.power = 0;
                return;
            }
            // 三个都先读一遍，量纲判断对三者一致。
            const bass = read(sources.audioBands.bass);
            const treble = read(sources.audioBands.treble);
            const power = read(sources.audioPower);
            frame.bass = smoothLumiereAudioValue(frame.bass, normalizeLumiereAudioValue(bass, rawScale), dt);
            frame.treble = smoothLumiereAudioValue(frame.treble, normalizeLumiereAudioValue(treble, rawScale), dt);
            frame.power = smoothLumiereAudioValue(frame.power, normalizeLumiereAudioValue(power, rawScale), dt);
        },
    };
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

// ======== components/visualizer/lumiere/lumiereStructure ========


const DEFAULT_LUMIERE_STRUCTURE_PARAMS = {
    gapMultiplier: 2.5, gapMin: 1.25, gapMax: 3.5, maxLines: 6, maxDuration: 18, recursiveSplit: true,
};
const clamp__3 = (value, min, max) => Math.min(max, Math.max(min, value));
const median = (values) => {
    if (values.length === 0)
        return 0.5;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? ((sorted[middle - 1] ?? sorted[middle]) + sorted[middle]) / 2
        : sorted[middle];
};
/** 编译用的行：视觉结束时间可以超出 endTime，但不越过下一行开始。 */
const buildStructureLines = (lines) => lines.map((line, sourceIndex) => ({
    sourceIndex,
    line,
    renderEndTime: Math.max(line.startTime, Math.min(getLineRenderEndTime(line), lines[sourceIndex + 1]?.startTime ?? Number.POSITIVE_INFINITY)),
}));
const resolveParagraphGapThreshold = (lines, params = DEFAULT_LUMIERE_STRUCTURE_PARAMS) => {
    const gaps = lines.slice(1).map((line, index) => (line.startTime - Math.min(getLineRenderEndTime(lines[index]), line.startTime))).filter(gap => gap > 0);
    return clamp__3(median(gaps) * params.gapMultiplier, params.gapMin, params.gapMax);
};
const metadataChanged = (previous, next) => ((previous.blockIndex !== undefined && next.blockIndex !== undefined && previous.blockIndex !== next.blockIndex)
    || (previous.songPart !== undefined && next.songPart !== undefined && previous.songPart !== next.songPart));
/** 超过行数或时长的段落在最大空隙处切开；recursiveSplit 时左半部分也继续切。 */
const splitOversizedDraft = (draft, params) => {
    const output = [];
    let remaining = draft.lines;
    let boundary = draft.boundary;
    let loopGuard = 0;
    while (remaining.length > params.maxLines || (remaining.length > 1 && (remaining.at(-1).renderEndTime - remaining[0].line.startTime) > params.maxDuration)) {
        if (loopGuard++ > 1000)
            break;
        const candidates = remaining.slice(2, -1).map((line, offset) => ({
            splitIndex: offset + 2,
            gap: line.line.startTime - remaining[offset + 1].renderEndTime,
        }));
        const validCandidates = candidates.filter(candidate => !Number.isNaN(candidate.gap));
        const rawSplitIndex = validCandidates.sort((a, b) => b.gap - a.gap)[0]?.splitIndex ?? Math.min(4, remaining.length - 1);
        const splitIndex = Math.max(1, rawSplitIndex);
        const head = { lines: remaining.slice(0, splitIndex), boundary };
        output.push(...(params.recursiveSplit ? splitOversizedDraft(head, params) : [head]));
        remaining = remaining.slice(splitIndex);
        boundary = output.at(-1).lines.length >= params.maxLines ? 'line-cap' : 'duration-cap';
    }
    output.push({ lines: remaining, boundary });
    return output;
};
/** 自动分段：元数据变化或空隙超过阈值处切开，再按上限切开超长的段落。 */
const draftParagraphs = (lines, threshold, params = DEFAULT_LUMIERE_STRUCTURE_PARAMS) => {
    const drafts = [];
    let current = { lines: [], boundary: 'song-start' };
    lines.forEach((line, index) => {
        const previous = lines[index - 1];
        const gap = previous ? line.line.startTime - previous.renderEndTime : 0;
        const boundary = previous && metadataChanged(previous.line, line.line)
            ? 'metadata'
            : previous && gap >= threshold
                ? 'time-gap'
                : null;
        if (boundary && current.lines.length > 0) {
            drafts.push(...splitOversizedDraft(current, params));
            current = { lines: [], boundary };
        }
        current.lines.push(line);
    });
    if (current.lines.length > 0)
        drafts.push(...splitOversizedDraft(current, params));
    return drafts;
};
/** 一行里「像词」的片段数。 */
const countWordLike = (line) => segmentLyricWords(line).filter(part => part.isWordLike).length;
/** 段落性质：副歌标记 → 间奏标记 → 最后一段是尾声 → 短或词少是换气 → 标点多或词密是上扬 → 其余是主歌。 */
const classifyParagraph = (lines, index, total) => {
    if (lines.some(item => item.line.isChorus || /chorus|副歌/i.test(item.line.songPart ?? '')))
        return 'chorus';
    if (lines.some(item => /bridge|break|間奏|ブリッジ/i.test(item.line.songPart ?? '')))
        return 'break';
    if (index === total - 1)
        return 'outro';
    const duration = lines.at(-1).renderEndTime - lines[0].line.startTime;
    const segmentCount = lines.reduce((sum, line) => sum + countWordLike(line.line), 0);
    const punctuationCount = lines.reduce((sum, line) => sum + (line.line.fullText.match(/[!?！？…]/g)?.length ?? 0), 0);
    if (duration <= 3.5 || segmentCount <= 3)
        return 'breath';
    if (punctuationCount >= 2 || segmentCount / Math.max(duration, 1) > 2.5)
        return 'lift';
    return 'verse';
};

// ======== components/visualizer/lumiere/lumiereSeamless ========
// src/components/visualizer/lumiere/lumiereSeamless.ts
// 轨迹过渡（tuning.seamlessTransitions）：把按段落编好的程序并成一个覆盖整首歌的场景单元。
// 镜头原样保留（光位仍按段落性质与跨段落的 chain 选，和不开时逐个相同），只去掉段落边界：
// 没有出场转场、没有再次星空开场，段落之间和段内换镜头一样在同一个光场里交接
// （主光束摆到新角度、线稿擦除重描、字沿轨迹飞到新槽位）。
// 原来的段落范围留在 sections 里，运镜按段落往返推拉（lumiereUnitLayout.ts 的 resolveLumiereCameraProgress）。
/** 把首尾相接的段落并成一个单元（少于两段时原样返回）。纯函数。 */
const mergeLumiereParagraphs = (paragraphs) => {
    if (paragraphs.length < 2)
        return [...paragraphs];
    const first = paragraphs[0];
    const last = paragraphs.at(-1);
    const sections = paragraphs.map(paragraph => ({
        startTime: paragraph.startTime,
        endTime: paragraph.endTime,
        kind: paragraph.kind,
    }));
    return [{
            id: 'lumiere-seamless',
            index: 0,
            kind: first.kind,
            boundary: first.boundary,
            startTime: first.startTime,
            endTime: last.endTime,
            lyricEndTime: last.lyricEndTime,
            lineIndices: paragraphs.flatMap(paragraph => paragraph.lineIndices),
            lines: paragraphs.flatMap(paragraph => paragraph.lines),
            shots: paragraphs.flatMap(paragraph => paragraph.shots),
            transitionOut: null,
            opening: first.opening,
            sections,
        }];
};

// ======== components/visualizer/lumiere/lumiereRandom ========
// Copyright (c) 2026 chthollyphile
// src/components/visualizer/lumiere/lumiereRandom.ts
// 绘光的确定性随机数：按 key 播种的 mulberry32 流（key 先经 FNV-1a 散列）。场景构建与编译里的随机量
// 全部从这里取，同一首歌同一个种子永远得到同一帧——seek、重建、预热都不会改变画面。
// folia 已有的 temperaRandom / sonnetRandom 只提供 FNV 散列与逐元素哈希，没有可连续取值的流，所以这里单独保留一份。
const hashKey = (key) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i += 1) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};
/** mulberry32：32 位状态，周期 2^32，对装饰用的随机足够。数字种子直接当状态，字符串种子先散列。 */
const createRng = (seed) => {
    let state = typeof seed === 'number' ? seed >>> 0 : hashKey(seed);
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};
/**
 * 与 createRng(seed) 同一条流，但从第 skip 个值之后开始：mulberry32 每取一次状态加一个常数，跳过是 O(1)。
 * 歌词窗口按需构建某一行时用它直接跳到这一行的起点，拿到的值与从头顺序取完全一样。
 */
const createRngAt = (seed, skip) => {
    const state = typeof seed === 'number' ? seed >>> 0 : hashKey(seed);
    return createRng((state + Math.imul(skip, 0x6d2b79f5)) >>> 0);
};

// ======== components/visualizer/lumiere/program ========


// 编排历史窗口的参考值。
const lumiereScaleMask__5 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__5 = ((0xb9e72008 ^ lumiereScaleMask__5) + Math.imul(0x5efd6ee0 ^ lumiereScaleMask__5, 0x1a8ce47b ^ lumiereScaleMask__5))
    - ((0xb9e72008 ^ lumiereScaleMask__5) + Math.imul(0x5efd6ee0 ^ lumiereScaleMask__5, 0x1a8ce47b ^ lumiereScaleMask__5));
const LUMIERE_TRANSITION_KINDS = ['lights-out', 'flare-cut', 'focus-pull'];
const DEFAULT_LUMIERE_PARAMS = {
    maxShotDuration: 7,
    maxLinesPerShot: 2,
    longLine: 3.6,
    bridgeGap: 4,
};
/** 最近用过的几个光位不马上再用。 */
const RECENT = 3 + LUMIERE_NEUTRAL_OFFSET__5;
/** 间奏镜头偏向的族。 */
const BRIDGE_FAMILIES = ['motes', 'astral', 'zenith'];
const MOODS_BY_KIND = {
    chorus: ['loud', 'neutral'],
    lift: ['loud', 'neutral'],
    verse: ['quiet', 'neutral'],
    breath: ['quiet', 'neutral'],
    outro: ['quiet'],
    break: null,
};
/** 显式 energy：低能量排除喧哗的光位，高能量排除安静的，中段不限。 */
const moodsForEnergy = (energy) => (energy < 0.33 ? ['quiet', 'neutral'] : energy < 0.66 ? null : ['neutral', 'loud']);
/** 切块：短行两两合成一个镜头（不超过时长上限），长行单独成镜头。 */
const groupLines = (lines, params) => {
    const groups = [];
    for (const line of lines) {
        const duration = line.renderEndTime - line.line.startTime;
        const last = groups.at(-1);
        const lastStart = last?.lines[0]?.line.startTime ?? 0;
        const lastLong = last ? last.lines.length === 1 && (last.lines[0].renderEndTime - lastStart) >= params.longLine : true;
        if (last
            && !lastLong
            && duration < params.longLine
            && last.lines.length < params.maxLinesPerShot
            && line.renderEndTime - lastStart <= params.maxShotDuration) {
            last.lines.push(line);
        }
        else {
            groups.push({ lines: [line] });
        }
    }
    return groups;
};
/**
 * 镜头的时间：每个镜头从它的第一行开始（段首镜头从段落开始），到下一个镜头开始为止；
 * 行后的空隙超过 bridgeGap 时，镜头在行唱完后 0.6 秒收住，空隙交给间奏镜头。
 */
const planShots = (lines, paragraphStart, paragraphEnd, params) => {
    const groups = groupLines(lines, params);
    const shots = [];
    groups.forEach((group, index) => {
        const start = index === 0 ? Math.min(paragraphStart, group.lines[0].line.startTime) : group.lines[0].line.startTime;
        const lyricEnd = Math.max(...group.lines.map(line => line.renderEndTime));
        const nextStart = groups[index + 1]?.lines[0]?.line.startTime ?? paragraphEnd;
        if (nextStart - lyricEnd >= params.bridgeGap) {
            const end = lyricEnd + 0.6;
            shots.push({ lines: group.lines, startTime: start, endTime: end, lyricEndTime: lyricEnd, isBridge: false });
            shots.push({ lines: [], startTime: end, endTime: nextStart, lyricEndTime: nextStart, isBridge: true });
        }
        else {
            shots.push({ lines: group.lines, startTime: start, endTime: Math.max(nextStart, lyricEnd), lyricEndTime: Math.min(lyricEnd, nextStart), isBridge: false });
        }
    });
    if (groups.length === 0 && paragraphEnd > paragraphStart) {
        shots.push({ lines: [], startTime: paragraphStart, endTime: paragraphEnd, lyricEndTime: paragraphEnd, isBridge: true });
    }
    return shots;
};
/**
 * 选光位：全部光位 → 间奏限定族 → mood → 避开最近用过的与上一个的族，每一步筛空了就退回上一步。
 * energy 为 null 时按段落性质定 mood（folia 里总是 null）。
 */
const castShot = (options) => {
    const { chain } = options;
    let candidates = LUMIERE_KINDS;
    /** 按条件收窄；收窄后少于 atLeast 个就不收（族还不全时，避开同族会变成两族来回交替）。 */
    const narrow = (keep, atLeast = 1) => {
        const next = candidates.filter(keep);
        if (next.length >= atLeast)
            candidates = next;
    };
    const energy = options.energy ?? null;
    const moods = energy === null ? MOODS_BY_KIND[options.kind] : moodsForEnergy(energy);
    if (options.isBridge)
        narrow(kind => BRIDGE_FAMILIES.includes(profileOf(kind).family) && profileOf(kind).mood !== 'loud');
    if (moods)
        narrow(kind => moods.includes(profileOf(kind).mood));
    narrow(kind => !chain.recent.includes(kind));
    if (chain.family)
        narrow(kind => profileOf(kind).family !== chain.family, 3);
    const random = createRng(`${options.seed}:${options.paragraphIndex}:${options.shotIndex}:cast`);
    return candidates[Math.floor(random() * candidates.length)];
};
/** 选定之后更新 chain（跨段落保留）。 */
const advanceChain = (chain, kind) => {
    chain.recent = [...chain.recent, kind].slice(-RECENT);
    chain.family = profileOf(kind).family;
};

// ======== components/visualizer/lumiere/lumiereTransitions ========

const smooth__1 = (value) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
};
const LABELS = { 'lights-out': '熄灯', 'flare-cut': '闪白', 'focus-pull': '拉焦' };
const LUMIERE_TRANSITIONS = Object.fromEntries(LUMIERE_TRANSITION_KINDS.map(kind => [kind, {
        kind,
        label: LABELS[kind],
        duration: (gap) => (kind === 'focus-pull'
            ? Math.min(0.6, Math.max(0.35, gap > 0 ? gap * 0.5 : 0.45))
            : Math.min(1.1, Math.max(0.5, gap > 0 ? gap * 0.6 : 0.8))),
        enterClamp: kind === 'focus-pull' ? [0.3, 0.6] : [0.4, 0.9],
        resolveFrame: (phase, progress) => {
            // 越靠近边界 near 越大。
            const near = phase === 'exit' ? smooth__1(progress) : 1 - smooth__1(progress);
            if (kind === 'lights-out')
                return { alpha: 1 - near, scale: 1, blur: 0 };
            if (kind === 'flare-cut')
                return { scale: 1 + 0.03 * near, blur: 7 * near * near, alpha: 1 - 0.35 * near * near };
            return { alpha: 1, blur: 12 * near, scale: 1 + 0.015 * near };
        },
    }]));
/** 进入阶段的时长：上一段 transitionOut 窗口（startTime..endTime）的长度钳在转场的 enterClamp 里。 */
const resolveLumiereEnterDuration = (kind, startTime, endTime) => {
    const [min, max] = LUMIERE_TRANSITIONS[kind].enterClamp;
    return Math.max(min, Math.min(max, endTime - startTime));
};
/** 选转场：不与这个模式上一次选的相同，按 (seed, 段落序号) 散列确定。 */
const chooseLumiereTransition = (seed, paragraphIndex, previous) => {
    const choices = LUMIERE_TRANSITION_KINDS.filter(kind => kind !== previous);
    let hash = 0;
    for (const char of `${seed}:${paragraphIndex}:transition`)
        hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return choices[Math.abs(hash) % choices.length];
};

// ======== components/visualizer/lumiere/lumiereProgram ========




/** 与上一段之间空隙超过这么多秒，才重新播放星空点亮的开场。 */
const REOPEN_GAP = 2.5;
/** 纯音乐缺省时长、每段时长与每个间奏镜头的目标时长（秒）。 */
const INSTRUMENTAL_DURATION = 480;
const INSTRUMENTAL_PARAGRAPH = 32;
const BRIDGE_SHOT = 10;
/** 间奏镜头长于这么多秒就切成几个（一个光位挂太久会显得停住）。 */
const BRIDGE_SPLIT = 16;
/** 把过长的间奏镜头等分成约 BRIDGE_SHOT 秒的几段。 */
const splitLongBridges = (shots) => shots.flatMap(shot => {
    const length = shot.endTime - shot.startTime;
    if (!shot.isBridge || length <= BRIDGE_SPLIT)
        return [shot];
    const count = Math.max(2, Math.round(length / BRIDGE_SHOT));
    return Array.from({ length: count }, (_, index) => {
        const startTime = shot.startTime + (length * index) / count;
        const endTime = index === count - 1 ? shot.endTime : shot.startTime + (length * (index + 1)) / count;
        return { lines: [], startTime, endTime, lyricEndTime: endTime, isBridge: true };
    });
});
/** 有歌词时的段落计划：可选的前奏段 + 分段结果，首尾相接铺到 programEnd。 */
const planLyricParagraphs = (lines, params, duration) => {
    const structure = buildStructureLines(lines);
    const paragraphGapThreshold = resolveParagraphGapThreshold(lines);
    const drafts = draftParagraphs(structure, paragraphGapThreshold);
    const lyricEndTime = Math.max(...structure.map(line => line.renderEndTime));
    const programEnd = Math.max(lyricEndTime, duration ?? 0);
    const firstStart = structure[0].line.startTime;
    const plans = [];
    // 前奏够长（≥ bridgeGap）时单独成一个间奏段：星空开场在 0 秒播放，前奏里有光，第一句不再从全黑开始。
    const intro = firstStart >= params.bridgeGap;
    if (intro) {
        plans.push({ lines: [], kind: 'break', boundary: 'intro', startTime: 0, endTime: firstStart, lyricEndTime: firstStart });
    }
    drafts.forEach((draft, index) => {
        const next = drafts[index + 1];
        plans.push({
            lines: draft.lines,
            kind: classifyParagraph(draft.lines, index, drafts.length),
            boundary: draft.boundary,
            startTime: index === 0 && !intro ? Math.min(0, firstStart) : draft.lines[0].line.startTime,
            endTime: next ? next.lines[0].line.startTime : programEnd,
            lyricEndTime: draft.lines.at(-1).renderEndTime,
        });
    });
    return { plans, paragraphGapThreshold, lyricEndTime, programEnd };
};
/** 纯音乐的段落计划：duration 等分成约 INSTRUMENTAL_PARAGRAPH 秒的段落。 */
const planInstrumentalParagraphs = (duration) => {
    const count = Math.max(1, Math.round(duration / INSTRUMENTAL_PARAGRAPH));
    return Array.from({ length: count }, (_, index) => {
        const startTime = (duration * index) / count;
        const endTime = index === count - 1 ? duration : (duration * (index + 1)) / count;
        return { lines: [], kind: 'break', boundary: index === 0 ? 'song-start' : 'instrumental', startTime, endTime, lyricEndTime: endTime };
    });
};
/**
 * 编译整首歌。lines 是统一歌词（按时间排序），seed 缺省为 'lumiere'；params 覆盖切块参数；
 * options.duration 为歌曲总时长（见 LumiereProgramOptions）。纯函数：同样的输入得到逐字段相同的程序。
 */
const compileLumiereProgram = (lines, seed, params = {}, options = {}) => {
    const resolvedParams = { ...DEFAULT_LUMIERE_PARAMS, ...params };
    const resolvedSeed = String(seed ?? 'lumiere');
    const instrumental = lines.length === 0;
    const lyric = instrumental ? null : planLyricParagraphs(lines, resolvedParams, options.duration);
    const instrumentalDuration = Math.max(1, options.duration && options.duration > 0 ? options.duration : INSTRUMENTAL_DURATION);
    const plans = lyric ? lyric.plans : planInstrumentalParagraphs(instrumentalDuration);
    const chain = { recent: [], family: null };
    let previousTransition = null;
    const paragraphs = plans.map((plan, index) => {
        const planned = splitLongBridges(planShots(plan.lines, plan.startTime, plan.endTime, resolvedParams));
        const shots = planned.map((shot, shotIndex) => {
            const kind = castShot({
                seed: resolvedSeed,
                paragraphIndex: index,
                shotIndex,
                kind: plan.kind,
                isBridge: shot.isBridge,
                chain,
            });
            advanceChain(chain, kind);
            return {
                id: `p${index}-lu${shotIndex}`,
                kind,
                lineIndices: shot.lines.map(line => line.sourceIndex),
                startTime: shot.startTime,
                endTime: shot.endTime,
                lyricEndTime: shot.lyricEndTime,
                isBridge: shot.isBridge,
            };
        });
        // 段落转场：结束在下一段开始（= 本段 endTime），时长按与下一段之间的空隙定。
        const next = plans[index + 1];
        let transitionOut = null;
        if (next) {
            const kind = chooseLumiereTransition(resolvedSeed, index, previousTransition);
            previousTransition = kind;
            const gap = next.startTime - plan.lyricEndTime;
            transitionOut = {
                kind,
                startTime: Math.max(plan.startTime, plan.endTime - LUMIERE_TRANSITIONS[kind].duration(gap)),
                endTime: plan.endTime,
            };
        }
        // 星空点亮的开场只在第一段、或与上一段唱完之间有明显空隙时播放；否则每段都从全黑重来，太频繁。
        const previous = plans[index - 1];
        const opening = !previous || plan.startTime - previous.lyricEndTime >= REOPEN_GAP;
        const lineIndices = plan.lines.map(line => line.sourceIndex);
        return {
            id: `lumiere-p${index}`,
            index,
            kind: plan.kind,
            boundary: plan.boundary,
            startTime: plan.startTime,
            endTime: plan.endTime,
            lyricEndTime: plan.lyricEndTime,
            lineIndices,
            lines: lineIndices.map(lineIndex => lines[lineIndex]),
            shots,
            transitionOut,
            opening,
        };
    });
    return {
        version: 1,
        seed: resolvedSeed,
        instrumental,
        paragraphGapThreshold: lyric?.paragraphGapThreshold ?? 0,
        duration: lyric ? lyric.programEnd : instrumentalDuration,
        lyricEndTime: lyric ? lyric.lyricEndTime : null,
        paragraphs: options.seamless ? mergeLumiereParagraphs(paragraphs) : paragraphs,
    };
};
/** 时刻 time 所在的段落序号（第一段之前算第一段，最后一段之后算最后一段）。 */
const findLumiereParagraphIndexAtTime = (program, time) => {
    for (let index = program.paragraphs.length - 1; index >= 0; index -= 1) {
        if (time >= program.paragraphs[index].startTime)
            return index;
    }
    return 0;
};

// ======== components/visualizer/pixiTextureBudget ========
// src/components/visualizer/pixiTextureBudget.ts
// Snaps a renderer resolution down to Pixi's power-of-two texture pool, so a full-viewport
// filter pass stops paying for pixels nothing ever draws into.
//
// `TexturePool.getOptimalTexture` rounds every render target up to a power of two per axis
// (`nextPow2(ceil(frame * resolution - 1e-6))`) and keys the pool on that pair. A pass is
// therefore billed for the *bucket*, not for the frame: at the default `textureResolution` of
// 1.5 an 781x850 viewport rasterises to 1172x1275 and lands in a 2048x2048 texture - 16 MiB
// holding 5.7 MiB of picture, 71% of it waste. Tempera and sonnet each run several such passes
// plus the pooled copies the inversion filter's backdrop needs, so the waste multiplies.
//
// The cost is a step function, which is the part that is easy to get wrong: measured on an
// Intel iGPU, growing the window from 640x640 to 700x700 (+18% area) raised tempera's resident
// GEM from 628 to 822 MiB (+31%), because 1.5x700 crosses 1024 and every pooled target doubles
// on both axes at once. Nothing about the picture changed to justify that.
//
// So instead of lowering the resolution across the board - which costs sharpness everywhere and
// still lands in whatever bucket it lands in - this gives back only the resolution that buys a
// smaller bucket. On that same 781x850 viewport it returns 1.2047 rather than 1.5: 20% softer,
// but the pooled targets go 2048x2048 -> 1024x1024, a quarter of the memory, and the frame now
// fills 92% of its texture instead of 29%. Sharpness per byte goes up, not down.
//
// Deliberately conservative: it only ever considers a *single* step down per axis, and only
// accepts one inside `TEXTURE_POOL_MAX_RESOLUTION_DROP`. A viewport whose nearest boundary is
// far away (2000x1200 at 1.5 would need 1.024, a 32% drop) keeps the resolution it asked for -
// paying for the bucket is the lesser evil there.
/**
 * Pixi's own `nextPow2` (`maths/misc/pow2`), reproduced rather than imported.
 *
 * The pool's bucket maths is what this module has to predict exactly, so it has to be the same
 * function; but importing it from `pixi.js` would make this module - and the tuning resolvers
 * that call it - drag the whole renderer into any bundle and any test that touches them, while
 * everything else about Pixi here is behind `loadPixi`'s dynamic import.
 */
const nextPow2 = (value) => {
    let v = value + (value === 0 ? 1 : 0);
    v -= 1;
    v |= v >>> 1;
    v |= v >>> 2;
    v |= v >>> 4;
    v |= v >>> 8;
    v |= v >>> 16;
    return v + 1;
};
/**
 * The pooled texture size Pixi allocates for one axis of a full-viewport pass, in device pixels.
 * Mirrors `TexturePool.getOptimalTexture`, epsilon included - that `- 1e-6` is what keeps a
 * candidate landing exactly on a boundary from rounding back up over float error.
 */
const texturePoolAxis = (cssSize, resolution) => (nextPow2(Math.ceil((cssSize * resolution) - 1e-6)));
/**
 * How much resolution a snap may give up, as a fraction of what was asked for.
 *
 * A step down always halves one axis of the bucket, so the memory won is 2x or 4x; 25% is the
 * point past which the softening starts to read as a lower-quality render rather than as the
 * same render costing less. The default 1.5 tolerates anything down to 1.125, which covers the
 * common desktop viewports - a 781x850 one needs 1.2047 - without reaching for 1.0.
 */
const TEXTURE_POOL_MAX_RESOLUTION_DROP = 0.25;
/**
 * The highest resolution that puts this axis one pool bucket lower, or null when there is no
 * bucket below (a single-pixel bucket has nothing under it).
 */
const stepDownCandidate = (cssSize, resolution) => {
    const bucket = texturePoolAxis(cssSize, resolution);
    if (bucket < 2)
        return null;
    return (bucket / 2) / cssSize;
};
/**
 * Returns the resolution to actually render at: `resolution` itself, or the highest value within
 * `maxDrop` of it that lands the pooled render targets in a smaller bucket.
 *
 * Both axes are tried because they are not interchangeable - the axis that needs the *larger*
 * cut can be the one that pays for itself twice, by dropping the other axis on the way past. On
 * 1030x520 at 1.0, snapping for width alone (0.994) halves the bucket to 1024x1024, while
 * snapping for height (0.985) reaches 1024x512: another half, for another 0.9% of resolution.
 * So candidates are ranked by the bucket area they produce, not by how little they give up.
 */
const snapResolutionToTexturePool = (cssWidth, cssHeight, resolution, maxDrop = TEXTURE_POOL_MAX_RESOLUTION_DROP) => {
    if (![cssWidth, cssHeight, resolution].every(value => Number.isFinite(value) && value > 0)) {
        return resolution;
    }
    const lowest = resolution * (1 - Math.min(Math.max(maxDrop, 0), 1));
    const candidates = [
        stepDownCandidate(cssWidth, resolution),
        stepDownCandidate(cssHeight, resolution),
    ].filter((candidate) => (candidate !== null && candidate > 0 && candidate < resolution && candidate >= lowest));
    let best = resolution;
    // Bucket area is monotonic in resolution, so the incumbent can only ever be beaten outright.
    let bestArea = texturePoolAxis(cssWidth, resolution) * texturePoolAxis(cssHeight, resolution);
    candidates.forEach(candidate => {
        const area = texturePoolAxis(cssWidth, candidate) * texturePoolAxis(cssHeight, candidate);
        if (area >= bestArea)
            return;
        bestArea = area;
        best = candidate;
    });
    return best;
};

// ======== components/visualizer/lumiere/lumiereRuntimeTuning ========

/**
 * 三档的数值：
 * - full：图形组与屏幕同分辨率，倍频按用户设置（2..6）。
 * - balanced：图形组每轴 0.7（像素约 49%），倍频 ≤ 4。bloom 按对数就近减一级（不减会宽 1.43 倍，
 *   减一级窄到 0.71 倍，后者更近），辉光略收、开销再降一截。
 * - low（省电）：图形组每轴 0.5（像素 25%），倍频 ≤ 3，浮尘 ×0.6。分辨率正好减半，bloom 少降一级，
 *   最小一级与 full 完全同尺寸，辉光宽度不变。
 */
const LUMIERE_QUALITY_PROFILES = {
    full: { graphicsScale: 1, maxFogOctaves: 6, moteScale: 1 },
    balanced: { graphicsScale: 0.7, maxFogOctaves: 4, moteScale: 1 },
    low: { graphicsScale: 0.5, maxFogOctaves: 3, moteScale: 0.6 },
};
/** 渲染分辨率上限：再高的屏幕也按 2 倍画，4K / 高 DPI 下整屏光场的开销是按像素数涨的。 */
const LUMIERE_MAX_RENDER_RESOLUTION = 2;
/** 画布（文字、画框）的渲染分辨率：devicePixelRatio 钳在 1..2。 */
const resolveLumiereRenderResolution = (devicePixelRatio) => {
    const ratio = typeof devicePixelRatio === 'number' && Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
    return Math.min(LUMIERE_MAX_RENDER_RESOLUTION, Math.max(1, ratio));
};
/**
 * 图形组 filter 的分辨率：满画质时就是渲染分辨率；降档时乘上倍率，再按 Pixi 纹理池的 2 的幂分桶往下吸附
 * （pixiTextureBudget.ts：最多再让 25%，换一个小一号的桶）。吸附只对图形组做——它是柔光，软一点看不出来；
 * 文字不吸附，保证清晰。
 */
const resolveLumiereGraphicsResolution = (width, height, renderResolution, quality) => {
    const { graphicsScale } = LUMIERE_QUALITY_PROFILES[quality];
    if (graphicsScale >= 1)
        return renderResolution;
    return snapResolutionToTexturePool(width, height, renderResolution * graphicsScale);
};
/**
 * 图形组分辨率降了多少，bloom 就少降几级：bloom 每级是上一级的一半分辨率，输入已经降了 2^k 倍时去掉 k 级，
 * 最小一级的纹素（决定辉光有多宽）才和满画质一样大。
 */
const resolveLumiereBloomLevelDrop = (renderResolution, graphicsResolution) => (graphicsResolution > 0 && graphicsResolution < renderResolution
    ? Math.max(0, Math.round(Math.log2(renderResolution / graphicsResolution)))
    : 0);
/** 用户 tuning → 场景 tuning。画质档在这里折进倍频与浮尘；「仅显示歌词文字」即场景的 textOnly。 */
const toLumiereSceneTuning = (tuning, context) => {
    const profile = LUMIERE_QUALITY_PROFILES[tuning.renderQuality] ?? LUMIERE_QUALITY_PROFILES.full;
    return {
        lightIntensity: tuning.lightIntensity,
        audioResponse: tuning.audioResponse,
        fogDensity: tuning.fogDensity,
        darkField: tuning.darkField,
        moteAmount: tuning.moteAmount * profile.moteScale,
        bloom: tuning.bloom,
        textBloom: tuning.textBloom,
        unlitOpacity: tuning.unlitOpacity,
        windowNeighbors: tuning.windowNeighbors,
        decay: tuning.decay,
        echo: context.showText ? tuning.echo : 0,
        fogOctaves: Math.min(tuning.fogOctaves, profile.maxFogOctaves),
        lineArt: tuning.lineArt,
        frontBokeh: tuning.frontBokeh,
        trails: tuning.trails,
        hideTrails: tuning.hideTrails,
        overlayFrame: tuning.overlayFrame,
        textOnly: tuning.textOnly,
        keywordColors: tuning.keywordColors,
        themeIcons: tuning.themeIcons,
        themeColorMix: tuning.themeColorMix,
    };
};
/**
 * 每帧才读的字段：直接改运行时持有的那份 tuning 对象就生效，不必重建。
 * （光强、随音乐、烟雾浓度、未唱字透明度、倍频在 scene.update 里现读；暗场强度由运行时的暗场层每帧现读。）
 */
const LUMIERE_LIVE_SCENE_KEYS = [
    'lightIntensity',
    'audioResponse',
    'fogDensity',
    'darkField',
    'unlitOpacity',
    'fogOctaves',
    'hideTrails',
];
/**
 * 改变编译结果的字段：既不是每帧现读，也不是场景重建——程序本身要重新编译（VisualizerLumiere 的 useMemo），
 * 新程序经 swapSong 的同曲替换路径交给运行时（commitSong 清掉场景缓存，下一帧按新程序建），不重建 WebGL 上下文。
 * 轨迹过渡把整首歌编成一个单元，所以它在这里，不在场景 tuning 里。
 */
const LUMIERE_COMPILE_KEYS = ['seamlessTransitions'];
/** 用户 tuning → 编译选项（只取 LUMIERE_COMPILE_KEYS 里的字段）。 */
const resolveLumiereCompileOptions = (tuning) => ({ seamless: tuning.seamlessTransitions });
/** 两个 bloom 倍率：强度直接写进现有 filter 的 options；只有跨过 0（要挂 / 摘 filter）时才重建。 */
const crossesZero = (previous, next) => (previous > 0) !== (next > 0);
/**
 * 场景构建时烘焙进去的字段变了，缓存的场景就得重建（运行时会防抖）。画框只在 overlay 里，不算。
 */
const requiresLumiereSceneRebuild = (previous, next) => (previous.moteAmount !== next.moteAmount
    || previous.windowNeighbors !== next.windowNeighbors
    || previous.decay !== next.decay
    || previous.echo !== next.echo
    || previous.lineArt !== next.lineArt
    || previous.frontBokeh !== next.frontBokeh
    || previous.trails !== next.trails
    || previous.textOnly !== next.textOnly
    || previous.keywordColors !== next.keywordColors
    || previous.themeIcons !== next.themeIcons
    // 调色盘在建场景时算好（光色、字色、线稿与关键字的混色都从它来）。
    || previous.themeColorMix !== next.themeColorMix
    || crossesZero(previous.bloom, next.bloom)
    || crossesZero(previous.textBloom, next.textBloom));

// ======== components/visualizer/lumiere/lumiereSceneFrames ========
// Copyright (c) 2026 chthollyphile


const smooth__2 = (value) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
};
const exitFrameOf = (program, index, time) => {
    const out = program.paragraphs[index]?.transitionOut;
    if (!out || time < out.startTime)
        return { alpha: 1, scale: 1, blur: 0 };
    const progress = (time - out.startTime) / Math.max(out.endTime - out.startTime, 1e-3);
    const frame = LUMIERE_TRANSITIONS[out.kind].resolveFrame('exit', progress);
    return out.kind === 'lights-out' ? { ...frame, alpha: 1 } : frame;
};
/**
 * transitionsEnabled 为 false（静态模式）时段落之间硬切。没有段落时 layers 为空。
 */
const resolveLumiereSceneFrames = (program, time, transitionsEnabled) => {
    if (program.paragraphs.length === 0)
        return { activeIndex: -1, layers: [] };
    const activeIndex = findLumiereParagraphIndexAtTime(program, time);
    if (!transitionsEnabled) {
        return { activeIndex, layers: [{ index: activeIndex, alpha: 1, scale: 1, blur: 0 }] };
    }
    const paragraph = program.paragraphs[activeIndex];
    const current = exitFrameOf(program, activeIndex, time);
    const layers = [];
    const previousOut = activeIndex > 0 ? program.paragraphs[activeIndex - 1].transitionOut : null;
    if (previousOut) {
        const enterDuration = resolveLumiereEnterDuration(previousOut.kind, previousOut.startTime, previousOut.endTime);
        const progress = (time - paragraph.startTime) / enterDuration;
        if (progress >= 0 && progress < 1) {
            const enter = LUMIERE_TRANSITIONS[previousOut.kind].resolveFrame('enter', progress);
            const weight = smooth__2(progress);
            // 上一段停在出场终点那一帧，随进入进度淡掉。
            const peak = exitFrameOf(program, activeIndex - 1, previousOut.endTime);
            if (peak.alpha * (1 - weight) > 0.002) {
                layers.push({ index: activeIndex - 1, alpha: peak.alpha * (1 - weight), scale: peak.scale, blur: peak.blur });
            }
            layers.push({
                index: activeIndex,
                alpha: Math.min(enter.alpha, weight) * current.alpha,
                scale: enter.scale * current.scale,
                blur: Math.max(enter.blur, current.blur),
            });
            return { activeIndex, layers };
        }
    }
    layers.push({ index: activeIndex, ...current });
    return { activeIndex, layers };
};

// ======== components/visualizer/lumiere/lumiereGroupFilters ========
// src/components/visualizer/lumiere/lumiereGroupFilters.ts
// 运行时对场景 / 片尾卡的图形组、文字组 filter 做的就地调整：bloom 强度（滑块拖动时不重建场景）、
// 图形组的画质分辨率与相应减掉的 bloom 级数。bloom filter 由场景自己建、自己销毁，这里只改它的参数。
const isBloomFilter = (filter) => (typeof filter.options?.strength === 'number');
const bloomOf = (group) => (group.filters ?? []).find(isBloomFilter) ?? null;
/** 把画质与 bloom 倍率写到一个组上。重复调用是幂等的。 */
const applyLumiereGroupQuality = (group, quality) => {
    const bloom = bloomOf(group);
    if (bloom) {
        bloom.options.strength = quality.preset.strength * quality.multiplier;
        bloom.options.levels = Math.max(1, quality.preset.levels - quality.levelDrop);
        bloom.resolution = quality.resolution ?? 'inherit';
        return;
    }
    const { passthrough, resolution } = quality;
    if (!passthrough)
        return;
    const attached = (group.filters ?? []).includes(passthrough);
    if (resolution === null) {
        if (attached)
            group.filters = [];
        return;
    }
    passthrough.resolution = resolution;
    if (!attached)
        group.filters = [passthrough];
};
/** 摘掉运行时挂上的直通 filter（场景销毁前调用，免得场景的 destroy 把共享 filter 一起处理掉）。 */
const detachLumierePassthrough = (group, passthrough) => {
    if (passthrough && (group.filters ?? []).includes(passthrough))
        group.filters = [];
};

// ======== components/visualizer/lumiere/lumiereKernel ========
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const fromParams = ({ x, y, pivotX, pivotY, scale, rotation }) => {
    const cos = Math.cos(rotation) * scale;
    const sin = Math.sin(rotation) * scale;
    return { a: cos, b: sin, c: -sin, d: cos, tx: x - (cos * pivotX - sin * pivotY), ty: y - (sin * pivotX + cos * pivotY) };
};
/** m ∘ n：先 n 再 m。 */
const multiply = (m, n) => ({
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    tx: m.a * n.tx + m.c * n.ty + m.tx,
    ty: m.b * n.tx + m.d * n.ty + m.ty,
});
const invert = (m) => {
    const det = m.a * m.d - m.b * m.c || 1e-12;
    return {
        a: m.d / det,
        b: -m.b / det,
        c: -m.c / det,
        d: m.a / det,
        tx: (m.c * m.ty - m.d * m.tx) / det,
        ty: (m.b * m.tx - m.a * m.ty) / det,
    };
};
const applyAffine = (m, x, y) => ({ x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty });
/**
 * 运镜变换：没有运镜的容器变换 rest → 当前的容器变换 current。返回的矩阵把「没有运镜时的画面坐标」映射到
 * 「有运镜时的画面坐标」。想让别的图层（素材、字幕装饰）跟着场景运镜，就把它的 `setFromMatrix` 设成这个矩阵
 * （或先乘上图层自己的变换再设）；场景自己的 view 已经在 update 里套过运镜，不需要再套。
 */
const cameraBetween = (rest, current) => multiply(fromParams(current), invert(fromParams(rest)));

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

// ======== components/visualizer/lumiere/light/bloomFilter ========
// 辉光层级的采样参考。
const lumiereScaleMask__6 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__6 = ((102 ^ lumiereScaleMask__6) + Math.imul(111 ^ lumiereScaleMask__6, 108 ^ lumiereScaleMask__6))
    - ((102 ^ lumiereScaleMask__6) + Math.imul(111 ^ lumiereScaleMask__6, 108 ^ lumiereScaleMask__6));
const vertex__1 = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;
const downFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputPixel;
uniform vec4 uInputClamp;
uniform vec4 uParams; // threshold, knee, prefilter(0/1), 0

vec4 tap(vec2 uv) {
    return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}

void main(void) {
    vec2 uv = vTextureCoord;
    vec2 hp = uInputPixel.zw;
    vec4 sum = tap(uv) * 4.0;
    sum += tap(uv - hp);
    sum += tap(uv + hp);
    sum += tap(uv + vec2(hp.x, -hp.y));
    sum += tap(uv - vec2(hp.x, -hp.y));
    vec4 c = sum / 8.0;
    if (uParams.z > 0.5) {
        float br = max(c.r, max(c.g, c.b));
        float knee = max(uParams.y, 1e-4);
        float soft = clamp(br - uParams.x + knee, 0.0, 2.0 * knee);
        soft = soft * soft / (4.0 * knee);
        float contrib = max(soft, br - uParams.x) / max(br, 1e-4);
        c *= clamp(contrib, 0.0, 1.0);
    }
    finalColor = c;
}
`;
const upFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uAdd;
uniform vec4 uInputPixel;
uniform vec4 uInputClamp;
uniform vec4 uAddMap;   // uv 缩放 xy、同级权重、0
uniform vec4 uAddClamp;

vec4 tap(vec2 uv) {
    return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}

void main(void) {
    vec2 uv = vTextureCoord;
    vec2 hp = uInputPixel.zw;
    vec4 sum = tap(uv + vec2(-hp.x * 2.0, 0.0));
    sum += tap(uv + vec2(-hp.x, hp.y)) * 2.0;
    sum += tap(uv + vec2(0.0, hp.y * 2.0));
    sum += tap(uv + vec2(hp.x, hp.y)) * 2.0;
    sum += tap(uv + vec2(hp.x * 2.0, 0.0));
    sum += tap(uv + vec2(hp.x, -hp.y)) * 2.0;
    sum += tap(uv + vec2(0.0, -hp.y * 2.0));
    sum += tap(uv + vec2(-hp.x, -hp.y)) * 2.0;
    vec4 up = sum / 12.0;
    vec4 same = texture(uAdd, clamp(uv * uAddMap.xy, uAddClamp.xy, uAddClamp.zw));
    finalColor = up + same * uAddMap.z;
}
`;
const combineFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uAdd;
uniform vec4 uInputClamp;
uniform vec4 uAddMap;   // uv 缩放 xy、强度、0
uniform vec4 uAddClamp;
uniform vec4 uTint;     // 乘在 bloom 上的颜色

void main(void) {
    vec4 base = texture(uTexture, clamp(vTextureCoord, uInputClamp.xy, uInputClamp.zw));
    vec4 glow = texture(uAdd, clamp(vTextureCoord * uAddMap.xy, uAddClamp.xy, uAddClamp.zw)) * uAddMap.z;
    vec3 g = glow.rgb * uTint.rgb;
    // 加上去的辉光也是光：预乘、alpha 取最大通道（与光场一致，近似 screen）。
    vec3 rgb = base.rgb + g * (1.0 - base.a * 0.5);
    // 超过 1 时按最大通道整体缩回（保持金色），只让一小部分变白；逐通道截断会把亮字烧成白块。
    float peak = max(max(rgb.r, rgb.g), rgb.b);
    if (peak > 1.0) rgb = mix(rgb / peak, vec3(1.0), 0.2 * (1.0 - 1.0 / peak));
    float a = base.a + max(max(g.r, g.g), g.b) * (1.0 - base.a);
    finalColor = vec4(rgb, min(max(a, max(max(rgb.r, rgb.g), rgb.b)), 1.0));
}
`;
const createBloomFilter = (pixi, initial) => {
    const { Filter, GlProgram, TexturePool, UniformGroup } = pixi;
    const program = (fragment, name) => GlProgram.from({ vertex: vertex__1, fragment, name });
    const downUniforms = new UniformGroup({ uParams: { value: new Float32Array(4), type: 'vec4<f32>' } });
    const down = new Filter({ glProgram: program(downFragment, 'lumiere-bloom-down'), resources: { bloomDown: downUniforms } });
    const upUniforms = new UniformGroup({
        uAddMap: { value: new Float32Array(4), type: 'vec4<f32>' },
        uAddClamp: { value: new Float32Array(4), type: 'vec4<f32>' },
    });
    const up = new Filter({
        glProgram: program(upFragment, 'lumiere-bloom-up'),
        resources: { bloomUp: upUniforms, uAdd: pixi.Texture.EMPTY.source },
    });
    const combineUniforms = new UniformGroup({
        uAddMap: { value: new Float32Array(4), type: 'vec4<f32>' },
        uAddClamp: { value: new Float32Array(4), type: 'vec4<f32>' },
        uTint: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
    });
    const combine = new Filter({
        glProgram: program(combineFragment, 'lumiere-bloom-combine'),
        resources: { bloomCombine: combineUniforms, uAdd: pixi.Texture.EMPTY.source },
    });
    const mapFor = (from, to, target, clamp, weight) => {
        target[0] = from.source.width / to.source.width;
        target[1] = from.source.height / to.source.height;
        target[2] = weight;
        clamp[0] = 0.5 / to.source.pixelWidth;
        clamp[1] = 0.5 / to.source.pixelHeight;
        clamp[2] = to.frame.width / to.source.width - 0.5 / to.source.pixelWidth;
        clamp[3] = to.frame.height / to.source.height - 0.5 / to.source.pixelHeight;
    };
    class LumiereBloomFilter extends Filter {
        constructor(options) {
            super({ resources: {}, compatibleRenderers: pixi.RendererType.BOTH });
            this.options = { ...options };
            this.padding = options.padding;
        }
        apply(filterManager, input, output, clearMode) {
            const { strength, threshold, knee, levels, spread, tint } = this.options;
            if (strength <= 0) {
                mapFor(input, input, combineUniforms.uniforms.uAddMap, combineUniforms.uniforms.uAddClamp, 0);
                combineUniforms.update();
                combine.resources.uAdd = input.source;
                combine.blendMode = this.blendMode;
                filterManager.applyFilter(combine, input, output, clearMode);
                return;
            }
            const width = input.frame.width;
            const height = input.frame.height;
            const baseResolution = input.source.resolution;
            const chain = [];
            let source = input;
            const count = Math.max(1, Math.min(8 + LUMIERE_NEUTRAL_OFFSET__6, Math.round(levels)));
            for (let level = 1; level <= count; level += 1) {
                const resolution = baseResolution / 2 ** level;
                if (Math.min(width, height) * resolution < 2)
                    break;
                // 用位置参数的签名：folia 装的 Pixi 8.20 还没有对象形式（8.21 起对象形式为主、位置参数仍可用）。
                const target = TexturePool.getOptimalTexture(width, height, resolution, false);
                const params = downUniforms.uniforms.uParams;
                params[0] = threshold;
                params[1] = knee;
                params[2] = level === 1 ? 1 : 0;
                downUniforms.update();
                down.blendMode = 'normal';
                filterManager.applyFilter(down, source, target, true);
                chain.push(target);
                source = target;
            }
            // 上采样：从最小一级往上，每一级叠加同级的降采样结果。
            let current = chain[chain.length - 1];
            const scratch = [];
            for (let index = chain.length - 2; index >= 0; index -= 1) {
                const same = chain[index];
                const target = TexturePool.getOptimalTexture(width, height, same.source.resolution, false);
                mapFor(current, same, upUniforms.uniforms.uAddMap, upUniforms.uniforms.uAddClamp, spread);
                upUniforms.update();
                up.resources.uAdd = same.source;
                up.blendMode = 'normal';
                filterManager.applyFilter(up, current, target, true);
                scratch.push(target);
                current = target;
            }
            mapFor(input, current, combineUniforms.uniforms.uAddMap, combineUniforms.uniforms.uAddClamp, strength);
            const tintUniform = combineUniforms.uniforms.uTint;
            tintUniform[0] = tint[0];
            tintUniform[1] = tint[1];
            tintUniform[2] = tint[2];
            combineUniforms.update();
            combine.resources.uAdd = current.source;
            combine.blendMode = this.blendMode;
            filterManager.applyFilter(combine, input, output, clearMode);
            chain.forEach(texture => TexturePool.returnTexture(texture));
            scratch.forEach(texture => TexturePool.returnTexture(texture));
        }
        destroy() {
            down.destroy();
            up.destroy();
            combine.destroy();
            super.destroy();
        }
    }
    return new LumiereBloomFilter(initial);
};

// ======== components/visualizer/lumiere/light/crossBurst ========


// 闪光事件的容量参考。
const lumiereScaleMask__7 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__7 = ((126 ^ lumiereScaleMask__7) + Math.imul(41 ^ lumiereScaleMask__7, 57 ^ lumiereScaleMask__7))
    - ((126 ^ lumiereScaleMask__7) + Math.imul(41 ^ lumiereScaleMask__7, 57 ^ lumiereScaleMask__7));
/** 同时存在的小十字上限。 */
const MAX_BURSTS = 14 + LUMIERE_NEUTRAL_OFFSET__7;
/** 一个小十字持续多久（秒）。 */
const BURST_DURATION = 0.6;
/** 「扫过」方式里相邻两个十字的间隔（秒）。 */
const SWEEP_STEP = 0.07;
/** 按光位的 burst 规则挑出引爆的字与时刻（纯函数，按种子确定）。 */
const planBursts = (spec, lines, seed) => {
    const triggers = [];
    lines.forEach((line, lineIndex) => {
        if (lineIndex < spec.offset || (lineIndex - spec.offset) % Math.max(1, spec.every) !== 0)
            return;
        const rng = createRng(`${seed}:burst:${lineIndex}`);
        const chosen = line.glyphs.filter(() => rng() < spec.density);
        // 至少一个：密度低、行又短时也要有。
        if (chosen.length === 0 && line.glyphs.length > 0)
            chosen.push(line.glyphs[Math.floor(rng() * line.glyphs.length)]);
        const sweepStart = line.glyphs[0]?.start ?? 0;
        chosen.forEach((glyph, order) => triggers.push({
            lineIndex,
            glyphIndex: glyph.glyphIndex,
            time: spec.mode === 'sweep' ? sweepStart + order * SWEEP_STEP : glyph.start,
            size: 0.7 + rng() * 0.6,
            dy: (rng() - 0.5) * 0.9,
        }));
    });
    return triggers.sort((a, b) => a.time - b.time);
};
const clamp01__1 = (value) => Math.min(1, Math.max(0, value));
const easeOutExpo = (value) => {
    const t = clamp01__1(value);
    return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
};
const easeOutCubic__1 = (value) => 1 - (1 - clamp01__1(value)) ** 3;
/** 一个小十字给光场的提亮（多个叠加时由调用方封顶）。 */
const burstLightBoost = (age) => (age < 0 ? 0 : 0.18 * Math.exp(-age / 0.1));
const createCrossBurst = (pixi, options) => {
    const { sprites } = options;
    const view = new pixi.Container();
    const pool = Array.from({ length: MAX_BURSTS }, () => {
        const holder = new pixi.Container();
        const make = (texture) => {
            const sprite = new pixi.Sprite(texture);
            sprite.anchor.set(0.5);
            holder.addChild(sprite);
            return sprite;
        };
        const ring = make(sprites.bokeh);
        const verticalGlow = make(sprites.streak);
        const horizontalGlow = make(sprites.streak);
        const verticalCore = make(sprites.streak);
        const horizontalCore = make(sprites.streak);
        const flash = make(sprites.dot);
        verticalGlow.rotation = Math.PI / 2;
        verticalCore.rotation = Math.PI / 2;
        holder.visible = false;
        view.addChild(holder);
        return { holder, flash, verticalGlow, verticalCore, horizontalGlow, horizontalCore, ring };
    });
    const update = (events) => {
        pool.forEach((burst, index) => {
            const event = events[index];
            if (!event || event.age < 0 || event.age > BURST_DURATION) {
                burst.holder.visible = false;
                return;
            }
            burst.holder.visible = true;
            const { age } = event;
            const L = event.length;
            const glowColor = hexOf(event.color);
            const coreColor = hexOf(mixRgb(event.color, WHITE, 0.75));
            // 30ms 点亮，之后快速衰减（0.16s 常数），0.6s 内基本消失。
            const envelope = clamp01__1(age / 0.03) * Math.exp(-Math.max(0, age - 0.03) / 0.16);
            const spread = 1 + age * 2;
            burst.holder.position.set(event.x, event.y);
            // 竖直光柱：从字脚下 0.3L 到字上方 0.7L（拉丁十字），80ms 内拉满。
            const verticalLength = L * easeOutExpo(age / 0.08);
            for (const [sprite, thickness, alpha, tint] of [
                [burst.verticalGlow, L * 0.1 * spread, 0.6, glowColor],
                [burst.verticalCore, L * 0.02 * spread, 1, coreColor],
            ]) {
                sprite.position.set(0, -L * 0.2);
                sprite.width = Math.max(1, verticalLength);
                sprite.height = thickness;
                sprite.alpha = alpha * envelope;
                sprite.tint = tint;
            }
            // 横条：晚 20ms，100ms 内展开，交点在光柱上段。
            const horizontalLength = L * 0.62 * easeOutExpo((age - 0.02) / 0.1);
            for (const [sprite, thickness, alpha, tint] of [
                [burst.horizontalGlow, L * 0.09 * spread, 0.55, glowColor],
                [burst.horizontalCore, L * 0.018 * spread, 0.95, coreColor],
            ]) {
                sprite.position.set(0, -L * 0.42);
                sprite.width = Math.max(1, horizontalLength);
                sprite.height = thickness;
                sprite.alpha = alpha * envelope * clamp01__1((age - 0.02) / 0.03);
                sprite.tint = tint;
            }
            // 引爆的白闪。
            const flashSize = L * (0.35 + age * 0.8);
            burst.flash.position.set(0, -L * 0.42);
            burst.flash.width = flashSize;
            burst.flash.height = flashSize;
            burst.flash.alpha = Math.exp(-age / 0.07);
            burst.flash.tint = coreColor;
            // 小冲击环。
            const ring = easeOutCubic__1(age / 0.4);
            const ringSize = L * 0.9 * ring;
            burst.ring.position.set(0, -L * 0.42);
            burst.ring.width = ringSize;
            burst.ring.height = ringSize;
            burst.ring.alpha = 0.35 * (1 - ring) * clamp01__1(age / 0.03);
            burst.ring.tint = glowColor;
        });
    };
    return {
        view,
        update,
        destroy: () => view.destroy({ children: true }),
    };
};

// ======== components/visualizer/lumiere/light/rig ========
// Copyright (c) 2026 chthollyphile
// 光束数量的校准参考。
const lumiereScaleMask__8 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__8 = ((979 ^ lumiereScaleMask__8) + Math.imul(1192 ^ lumiereScaleMask__8, 349 ^ lumiereScaleMask__8))
    - ((979 ^ lumiereScaleMask__8) + Math.imul(1192 ^ lumiereScaleMask__8, 349 ^ lumiereScaleMask__8));
// src/components/visualizer/lumiere/light/rig.ts
// 光位（rig）：一个镜头的光束、烟雾、光源眩光的声明式描述，以及光束强度的 CPU 算法。
// 着色器（lightFieldShader.ts）与这里用同一个公式：字与浮尘的亮度按 CPU 这一份算，光场按 GLSL 那一份画，
// 两边一致，光柱扫到哪里，哪里的字就亮。
//
// 坐标：光场内部一律用「以画面高度为 1」的单位（u = 像素 / 高度），y 向下；角度 0 = 向右，π/2 = 向下。
// 声明里的位置用画面比例（x 占宽、y 占高），解析时换算。
const MAX_BEAMS = 6 + LUMIERE_NEUTRAL_OFFSET__8;
const GOBO_PATTERN_ID = { blinds: 1, cross: 2, lattice: 3, leaves: 4 };
const WAVE_MODE_ID = { rings: 1, slits: 2, sources: 3, airy: 4 };
/** 低频把光束抬亮的上限（低频打满时亮 15%）。 */
const AUDIO_GAIN = 0.15;
/** 低频 → 光束亮度倍率：取 1.5 次方，弱的起伏几乎不动，只有重拍才抬起来。 */
const audioLift = (bass) => 1 + AUDIO_GAIN * Math.max(0, bass) ** 1.5;
const oscillate = (osc, time) => (osc ? osc.amplitude * Math.sin((time / Math.max(osc.period, 0.001) + osc.phase) * Math.PI * 2) : 0);
const resolveBeams = (rig, time, aspect, drive) => (rig.beams.slice(0, MAX_BEAMS).map(beam => {
    const angle = beam.angle + oscillate(beam.sway, time);
    const pulse = 1 + oscillate(beam.pulse, time);
    const tint = beam.tint ?? [1, 1, 1];
    const reveal = beam.reveal && drive.local !== undefined
        ? 0.06 + 0.94 * smoothstep(0, 1, drive.local / beam.reveal)
        : 1;
    return {
        ox: beam.x * aspect,
        oy: beam.y,
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        halfWidth: (beam.width ?? 0) / 2,
        tanSpread: Math.tan(beam.spread),
        softness: beam.softness,
        length: beam.length * reveal,
        intensity: beam.intensity * pulse * drive.intensity * audioLift(drive.bass),
        streaks: beam.streaks,
        streakFreq: beam.streakFreq,
        streakPhase: time * beam.streakSpeed,
        core: beam.core ?? 0.5,
        r: tint[0] * drive.color[0],
        g: tint[1] * drive.color[1],
        b: tint[2] * drive.color[2],
        goboPattern: beam.gobo ? GOBO_PATTERN_ID[beam.gobo.pattern] : 0,
        goboFreq: beam.gobo?.frequency ?? 0,
        goboDuty: beam.gobo?.duty ?? 1,
        goboPhase: (beam.gobo?.drift ?? 0) * time,
        spectrum: beam.spectrum ?? 0,
        reach: beam.reach ?? 0,
    };
}));
// ---------------------------------------------------------------------------------------------
// 与 GLSL 一致的噪声（Dave Hoskins 的 hash11，不用 sin，单精度下两边差得不多）
const fract = (value) => value - Math.floor(value);
const hash11 = (input) => {
    let p = fract(input * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
};
const valueNoise1 = (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return hash11(i) * (1 - u) + hash11(i + 1) * u;
};
const smoothstep = (edge0, edge1, x) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
};
/** GLSL 的 hash12（Dave Hoskins）。 */
const hash12 = (x, y) => {
    let a = fract(x * 0.1031);
    let b = fract(y * 0.1031);
    let c = fract(x * 0.1031);
    const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
    a += d;
    b += d;
    c += d;
    return fract((a + b) * c);
};
const valueNoise2 = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash12(ix, iy);
    const b = hash12(ix + 1, iy);
    const c = hash12(ix, iy + 1);
    const d = hash12(ix + 1, iy + 1);
    return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
};
/** 透光条：fract(x) 落在 [0, duty) 里为 1，边缘柔化。 */
const band = (x, duty) => {
    const f = fract(x);
    return 1 - smoothstep(duty - 0.06, duty + 0.06, f) + smoothstep(1 - 0.06, 1, f);
};
/** 窗影的影子里仍透过的散射光（全黑的条纹像条形码）。 */
const GOBO_LEAK = 0.12;
/** 窗影图样在截面坐标 (u, v) 上的透光率（GLSL 里的 goboMask 与此相同）。 */
const goboMask = (pattern, frequency, duty, phase, u, v) => (pattern > 0 ? GOBO_LEAK + (1 - GOBO_LEAK) * goboPattern(pattern, frequency, duty, phase, u, v) : 1);
const goboPattern = (pattern, frequency, duty, phase, u, v) => {
    if (pattern === 1)
        return Math.min(1, band(u * frequency * 0.5 + phase, duty));
    if (pattern === 2)
        return smoothstep(duty * 0.5, duty * 0.5 + 0.08, Math.abs(u));
    if (pattern === 3) {
        return Math.min(1, band(u * frequency * 0.5 + v * frequency * 0.8 + phase, duty))
            * Math.min(1, band(u * frequency * 0.5 - v * frequency * 0.8 - phase, duty));
    }
    if (pattern === 4)
        return smoothstep(duty - 0.12, duty + 0.12, valueNoise2(u * frequency, v * frequency * 0.6 + phase));
    return 1;
};
/** 一束光在点 (x, y)（高度单位）处的强度（不含烟雾与颜色）。GLSL 里的 beamMask 与此相同。 */
const beamMask = (beam, x, y) => {
    const px = x - beam.ox;
    const py = y - beam.oy;
    const along = px * beam.dx + py * beam.dy;
    if (along <= 0)
        return 0;
    const perp = Math.abs(px * -beam.dy + py * beam.dx);
    // 取绝对值：会聚的光束过了焦点再散开。
    const half = Math.abs(beam.halfWidth + along * beam.tanSpread) + 1e-4;
    const s = perp / half;
    const edge = smoothstep(1, 1 - Math.max(beam.softness, 0.02), s);
    if (edge <= 0)
        return 0;
    const signed = s * Math.sign(px * -beam.dy + py * beam.dx);
    const streak = 1 - beam.streaks + beam.streaks * valueNoise1(signed * beam.streakFreq + beam.streakPhase);
    const core = 1 - beam.core + beam.core * (1 - s * s);
    const falloff = Math.exp(-along / Math.max(beam.length, 0.001));
    const gobo = beam.goboPattern > 0 ? goboMask(beam.goboPattern, beam.goboFreq, beam.goboDuty, beam.goboPhase, signed, along) : 1;
    // 射程末端的收尾随光束宽度变长：宽光束一刀切会变成方头。
    const reach = beam.reach > 0 ? 1 - smoothstep(beam.reach - Math.max(0.04, half * 2.5), beam.reach, along) : 1;
    // 从光源处平滑渐起：光源背后没有光，光源处的光束又有宽度，不渐起就会在光源处留一条硬直边。
    const start = smoothstep(0, Math.abs(beam.halfWidth) * 2 + 0.01, along);
    return edge * streak * core * falloff * gobo * reach * start * beam.intensity;
};
/** 所有光束在 (x, y) 处的总强度（高度单位坐标）。 */
const lightAt = (beams, x, y) => {
    let sum = 0;
    for (const beam of beams)
        sum += beamMask(beam, x, y);
    return sum;
};
/** 与着色器相同的柔和压缩（着色器按最大通道压，这里只有标量强度），避免交叠处爆白。 */
const compressLight = (value) => 1 - Math.exp(-value);

// ======== components/visualizer/lumiere/light/lightFieldShader ========

// 光场数据步长的参考值。
const lumiereScaleMask__9 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__9 = ((105 ^ lumiereScaleMask__9) + Math.imul(97 ^ lumiereScaleMask__9, 0xbafc3e03 ^ lumiereScaleMask__9))
    - ((105 ^ lumiereScaleMask__9) + Math.imul(97 ^ lumiereScaleMask__9, 0xbafc3e03 ^ lumiereScaleMask__9));
const vertex__2 = `
in vec2 aPosition;
out vec2 vPos;
out float vAlpha;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;

void main(void) {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
    vPos = aPosition;
    vAlpha = uColor.a * uWorldColorAlpha.a;
}
`;
const fragment = `
precision highp float;
in vec2 vPos;
in float vAlpha;
out vec4 finalColor;

#define MAX_BEAMS ${MAX_BEAMS}

uniform vec4 uBeamA[MAX_BEAMS]; // ox, oy, dx, dy
uniform vec4 uBeamB[MAX_BEAMS]; // halfWidth, tanSpread, softness, length
uniform vec4 uBeamC[MAX_BEAMS]; // intensity, streaks, streakFreq, streakPhase
uniform vec4 uBeamD[MAX_BEAMS]; // r, g, b, core
uniform vec4 uBeamE[MAX_BEAMS]; // 窗影：pattern, frequency, duty, phase
uniform vec4 uBeamF[MAX_BEAMS]; // 色散, 射程, 0, 0
uniform vec4 uFrame;            // width, height, time, beamCount
uniform vec4 uFogA;             // density, tyndallBase, scale, warp
uniform vec4 uFogB;             // driftX, driftY, ambient, octaves
uniform vec3 uFogColor;
uniform vec4 uGlare;            // x, y, radius, intensity
uniform vec4 uGlareB;           // streak, 0, 0, 0
uniform vec3 uGlareColor;
uniform vec4 uDark;             // 暗场底：预乘颜色 rgb、alpha
uniform vec4 uCaustic;          // 焦散：scale, speed, inBeam, enabled
uniform vec4 uCausticFloor;     // 池底：cx, cy, rx, ry（高度单位）
uniform vec4 uCausticB;         // 池底亮度, 0, 0, 0
uniform vec4 uWave;             // 干涉：mode, frequency, speed, strength
uniform vec4 uWaveB;            // cx, cy, radius, separation（高度单位）
uniform vec4 uShield;           // 文字区：cx, cy, rx, ry（高度单位）
uniform vec4 uShieldB;          // x：文字区里条纹压暗多少

float hash11(float x) {
    float p = fract(x * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float valueNoise1(float x) {
    float i = floor(x);
    float f = x - i;
    float u = f * f * (3.0 - 2.0 * f);
    return mix(hash11(i), hash11(i + 1.0), u);
}

float valueNoise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = p - i;
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p, float octaves) {
    float sum = 0.0;
    float amp = 0.5;
    float norm = 0.0;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 6; i++) {
        if (float(i) >= octaves) break;
        sum += amp * valueNoise2(p);
        norm += amp;
        p = rot * p * 2.03 + vec2(17.1, 9.2);
        amp *= 0.5;
    }
    return sum / max(norm, 1e-4);
}

float fog(vec2 p, float t) {
    vec2 drift = uFogB.xy * t;
    vec2 q = (p - drift) * uFogA.z;
    float octaves = uFogB.w;
    vec2 w = vec2(
        fbm(q + vec2(0.0, t * 0.07), 3.0),
        fbm(q + vec2(5.2, 1.3) - vec2(t * 0.05, 0.0), 3.0)
    );
    float n = fbm(q + uFogA.w * (w - 0.5) * 2.0, octaves);
    // 拉开对比：烟是一缕一缕的，不是均匀的灰。
    return smoothstep(0.28, 0.82, n);
}

// 透光条：fract(x) 落在 [0, duty) 里为 1，边缘柔化（与 rig.ts 的 band 相同）。
float band(float x, float duty) {
    float f = fract(x);
    return min(1.0, 1.0 - smoothstep(duty - 0.06, duty + 0.06, f) + smoothstep(0.94, 1.0, f));
}

// 窗影图样：u 为截面横向位置 -1..1，v 为沿光束的距离。
float goboPattern(vec4 E, float u, float v) {
    float pattern = E.x;
    if (pattern < 1.5) return band(u * E.y * 0.5 + E.w, E.z);
    if (pattern < 2.5) return smoothstep(E.z * 0.5, E.z * 0.5 + 0.08, abs(u));
    if (pattern < 3.5) return band(u * E.y * 0.5 + v * E.y * 0.8 + E.w, E.z) * band(u * E.y * 0.5 - v * E.y * 0.8 - E.w, E.z);
    return smoothstep(E.z - 0.12, E.z + 0.12, valueNoise2(vec2(u * E.y, v * E.y * 0.6 + E.w)));
}

// 窗影（与 rig.ts 的 goboMask 相同）：影子里仍透过 12% 的散射光。
float goboMask(vec4 E, float u, float v) {
    if (E.x < 0.5) return 1.0;
    return 0.12 + 0.88 * goboPattern(E, u, v);
}

// 数组下标只能用循环变量（GLSL ES 1.0 的限制），所以按分量传进来。返回 (强度, 截面横向位置 -1..1)。
vec2 beamMask(vec4 A, vec4 B, vec4 C, float coreAmount, vec4 E, float reach, vec2 p) {
    vec2 d = p - A.xy;
    float along = dot(d, A.zw);
    if (along <= 0.0) return vec2(0.0);
    float signedPerp = d.x * -A.w + d.y * A.z;
    // 取绝对值：会聚的光束过了焦点再散开。
    float half_ = abs(B.x + along * B.y) + 1e-4;
    float s = abs(signedPerp) / half_;
    float edge = smoothstep(1.0, 1.0 - max(B.z, 0.02), s);
    if (edge <= 0.0) return vec2(0.0);
    float signedS = s * sign(signedPerp);
    float streak = 1.0 - C.y + C.y * valueNoise1(signedS * C.z + C.w);
    float core = 1.0 - coreAmount + coreAmount * (1.0 - s * s);
    float falloff = exp(-along / max(B.w, 0.001));
    float reachMask = reach > 0.0 ? 1.0 - smoothstep(reach - max(0.04, half_ * 2.5), reach, along) : 1.0;
    float start = smoothstep(0.0, abs(B.x) * 2.0 + 0.01, along);
    return vec2(edge * streak * core * falloff * goboMask(E, signedS, along) * reachMask * start * C.x, signedS);
}

// 色散：截面横向位置 -> 光谱色（红在一侧、紫在另一侧）。
vec3 spectrumColor(float u) {
    float h = clamp(0.5 + 0.5 * u, 0.0, 1.0) * 0.8;
    vec3 k = clamp(abs(fract(vec3(h) + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    return mix(vec3(1.0), k, 0.85);
}

// 焦散（水面焦散的经典迭代，去掉取模，连续不接缝）。
float causticField(vec2 p, float t) {
    vec2 q = p * uCaustic.x * 6.2831853 - 250.0;
    vec2 i = q;
    float c = 1.0;
    float inten = 0.005;
    for (int n = 0; n < 4; n++) {
        float tt = t * (1.0 - (3.5 / float(n + 1)));
        i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1.0 / length(vec2(q.x / (sin(i.x + tt) / inten), q.y / (cos(i.y + tt) / inten)));
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 8.0), 0.0, 3.0);
}

// 干涉与衍射：在一块圆形区域里发光的条纹。
float wavePattern(vec2 p, float t) {
    vec2 d = p - uWaveB.xy;
    float radius = max(uWaveB.z, 1e-3);
    float r = length(d) / radius;
    float mask = smoothstep(1.0, 0.55, r);
    float mode = uWave.x;
    float f = uWave.y;
    float phase = t * uWave.z;
    float v;
    if (mode < 1.5) {
        v = 0.5 + 0.5 * cos(r * r * f * 6.0 - phase);
    } else if (mode < 2.5) {
        // 双缝：条纹离中心越远越弯（双曲线），包络是椭圆，不是矩形。
        float x = d.x / radius;
        float y = d.y / radius;
        float xc = x * (1.0 + 0.35 * y * y);
        v = pow(cos(xc * f * 3.0 - phase * 0.3), 2.0) * exp(-xc * xc * 2.5);
        mask = smoothstep(1.0, 0.25, length(vec2(x * 0.85, y * 1.5)));
    } else if (mode < 3.5) {
        vec2 s1 = vec2(-uWaveB.w * 0.5, 0.0);
        float d1 = length(d - s1);
        float d2 = length(d + s1);
        v = (0.5 + 0.5 * cos((d1 - d2) * f * 20.0)) * (0.5 + 0.5 * cos((d1 + d2) * f * 6.0 - phase));
    } else {
        float x = r * f * 4.0 + 1e-3;
        float sc = sin(x) / x;
        v = min(sc * sc * 4.0, 1.5);
    }
    // 文字区里压暗，字压在条纹上还读得清。
    vec2 q = (p - uShield.xy) / max(uShield.zw, vec2(1e-3));
    float shield = 1.0 - uShieldB.x * smoothstep(1.0, 0.35, length(q));
    return v * mask * shield * uWave.w;
}

void main(void) {
    float H = uFrame.y;
    float t = uFrame.z;
    vec2 p = vPos / H;

    float density = fog(p, t);
    float tyndall = uFogA.y + (1.0 - uFogA.y) * density * uFogA.x;

    float caustic = uCaustic.w > 0.5 ? causticField(p, t * uCaustic.y + 23.0) : 0.0;
    float causticLift = mix(1.0, 0.25 + 1.5 * caustic, uCaustic.w > 0.5 ? uCaustic.z : 0.0);

    vec3 light = vec3(0.0);
    int count = int(uFrame.w + 0.5);
    for (int i = 0; i < MAX_BEAMS; i++) {
        if (i >= count) break;
        vec4 D = uBeamD[i];
        vec2 m = beamMask(uBeamA[i], uBeamB[i], uBeamC[i], D.w, uBeamE[i], uBeamF[i].y, p);
        vec3 color = D.rgb;
        float spectrum = uBeamF[i].x;
        if (spectrum > 0.0) color = mix(color, spectrumColor(m.y) * max(max(color.r, color.g), color.b), spectrum);
        light += color * m.x;
    }
    light *= tyndall * causticLift;

    // 池底的焦散光斑（不靠烟，直接亮）。
    if (uCaustic.w > 0.5 && uCausticB.x > 0.0) {
        vec2 e = (p - uCausticFloor.xy) / max(uCausticFloor.zw, vec2(1e-3));
        light += uFogColor * caustic * uCausticB.x * smoothstep(1.0, 0.6, length(e));
    }
    // 干涉条纹。
    if (uWave.x > 0.5) light += uFogColor * wavePattern(p, t);

    // 光束之外的烟：很淡，只给暗场一点空间感。
    light += uFogColor * density * uFogB.z;

    // 光源眩光：亮核 + 大半径柔光 + 横向拉丝。
    if (uGlare.w > 0.0) {
        vec2 g = p - uGlare.xy;
        float r = max(uGlare.z, 1e-3);
        float dist = length(g);
        float glare = exp(-dist / r) * 0.55 + exp(-(dist * dist) / (r * r * 0.03));
        float streak = exp(-abs(g.y) / (r * 0.035)) * exp(-abs(g.x) / (r * 7.0)) * uGlareB.x;
        light += uGlareColor * (glare + streak) * uGlare.w;
    }

    // 保持色相的压缩：按最大通道压到 0..1，只在极亮处微微发白（逐通道压缩会把金色压成白色）。
    float peak = max(max(light.r, light.g), light.b);
    float mapped = 1.0 - exp(-peak);
    vec3 c = peak > 1e-5 ? light / peak * mapped : vec3(0.0);
    c = mix(c, vec3(mapped), 0.3 * mapped * mapped * mapped);
    // 抖动，免得暗部渐变在 8 位视频里出色带（按像素坐标，确定性）。
    c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
    c = clamp(c, 0.0, 1.0);
    float a = max(max(c.r, c.g), c.b);

    // 叠在暗场底上（预乘的 over）。
    vec3 rgb = c + uDark.rgb * (1.0 - a);
    float alpha = a + uDark.a * (1.0 - a);
    finalColor = vec4(rgb, alpha) * vAlpha;
}
`;
/**
 * margin：四边各外扩多少逻辑像素。场景的运镜（手持浮动、呼吸缩放可以略小于 1、平移）会把画框边缘露出来，
 * 亮色主题下暗场底一露边就是一条亮缝；外扩的部分按同样的像素坐标继续算光场，接缝看不出来。
 */
const createLightField = (pixi, width, height, margin = 0) => {
    const x0 = -margin;
    const y0 = -margin;
    const x1 = width + margin;
    const y1 = height + margin;
    const geometry = new pixi.Geometry({
        attributes: {
            aPosition: [x0, y0, x1, y0, x1, y1, x0, y1],
        },
        indexBuffer: [0, 1, 2, 0, 2, 3],
    });
    const uniforms = new pixi.UniformGroup({
        uBeamA: { value: new Float32Array(MAX_BEAMS * 4), type: 'vec4<f32>', size: MAX_BEAMS },
        uBeamB: { value: new Float32Array(MAX_BEAMS * 4), type: 'vec4<f32>', size: MAX_BEAMS },
        uBeamC: { value: new Float32Array(MAX_BEAMS * 4), type: 'vec4<f32>', size: MAX_BEAMS },
        uBeamD: { value: new Float32Array(MAX_BEAMS * 4), type: 'vec4<f32>', size: MAX_BEAMS },
        uBeamE: { value: new Float32Array(MAX_BEAMS * 4), type: 'vec4<f32>', size: MAX_BEAMS },
        uBeamF: { value: new Float32Array(MAX_BEAMS * 4), type: 'vec4<f32>', size: MAX_BEAMS },
        uFrame: { value: new Float32Array([width, height, 0, 0]), type: 'vec4<f32>' },
        uFogA: { value: new Float32Array(4), type: 'vec4<f32>' },
        uFogB: { value: new Float32Array(4), type: 'vec4<f32>' },
        uFogColor: { value: new Float32Array(3), type: 'vec3<f32>' },
        uGlare: { value: new Float32Array(4), type: 'vec4<f32>' },
        uGlareB: { value: new Float32Array(4), type: 'vec4<f32>' },
        uGlareColor: { value: new Float32Array(3), type: 'vec3<f32>' },
        uDark: { value: new Float32Array(4), type: 'vec4<f32>' },
        uCaustic: { value: new Float32Array(4), type: 'vec4<f32>' },
        uCausticFloor: { value: new Float32Array(4), type: 'vec4<f32>' },
        uCausticB: { value: new Float32Array(4), type: 'vec4<f32>' },
        uWave: { value: new Float32Array(4), type: 'vec4<f32>' },
        uWaveB: { value: new Float32Array(4), type: 'vec4<f32>' },
        uShield: { value: new Float32Array(4), type: 'vec4<f32>' },
        uShieldB: { value: new Float32Array(4), type: 'vec4<f32>' },
    });
    const shader = new pixi.Shader({
        glProgram: pixi.GlProgram.from({ vertex: vertex__2, fragment, name: 'lumiere-light-field' }),
        resources: { lightUniforms: uniforms },
    });
    const mesh = new pixi.Mesh({ geometry, shader });
    const u = uniforms.uniforms;
    const update = (frame) => {
        const { beams, rig, time } = frame;
        const A = u.uBeamA, B = u.uBeamB, C = u.uBeamC, D = u.uBeamD, E = u.uBeamE, F = u.uBeamF;
        A.fill(0);
        B.fill(0);
        C.fill(0);
        D.fill(0);
        E.fill(0);
        F.fill(0);
        beams.forEach((beam, index) => {
            const o = index * (4 + LUMIERE_NEUTRAL_OFFSET__9);
            A[o] = beam.ox;
            A[o + 1] = beam.oy;
            A[o + 2] = beam.dx;
            A[o + 3] = beam.dy;
            B[o] = beam.halfWidth;
            B[o + 1] = beam.tanSpread;
            B[o + 2] = beam.softness;
            B[o + 3] = beam.length;
            C[o] = beam.intensity;
            C[o + 1] = beam.streaks;
            C[o + 2] = beam.streakFreq;
            C[o + 3] = beam.streakPhase;
            D[o] = beam.r;
            D[o + 1] = beam.g;
            D[o + 2] = beam.b;
            D[o + 3] = beam.core;
            E[o] = beam.goboPattern;
            E[o + 1] = beam.goboFreq;
            E[o + 2] = beam.goboDuty;
            E[o + 3] = beam.goboPhase;
            F[o] = beam.spectrum;
            F[o + 1] = beam.reach;
        });
        u.uFrame[0] = width;
        u.uFrame[1] = height;
        u.uFrame[2] = time;
        u.uFrame[3] = beams.length;
        const fog = rig.fog;
        u.uFogA[0] = fog.density * frame.fogScale;
        u.uFogA[1] = fog.tyndallBase;
        u.uFogA[2] = fog.scale;
        u.uFogA[3] = fog.warp;
        u.uFogB[0] = fog.driftX;
        u.uFogB[1] = fog.driftY;
        u.uFogB[2] = fog.ambient * frame.fogScale;
        u.uFogB[3] = frame.octaves;
        u.uFogColor[0] = frame.color[0];
        u.uFogColor[1] = frame.color[1];
        u.uFogColor[2] = frame.color[2];
        const glare = rig.glare;
        const aspect = width / height;
        u.uGlare[0] = glare ? glare.x * aspect : 0;
        u.uGlare[1] = glare ? glare.y : 0;
        u.uGlare[2] = glare ? glare.radius : 0;
        u.uGlare[3] = glare ? glare.intensity * frame.glareScale : 0;
        u.uGlareB[0] = glare ? glare.streak : 0;
        u.uGlareColor[0] = frame.color[0];
        u.uGlareColor[1] = frame.color[1];
        u.uGlareColor[2] = frame.color[2];
        u.uDark.set(frame.dark);
        const caustic = rig.caustic;
        u.uCaustic[0] = caustic?.scale ?? 0;
        u.uCaustic[1] = caustic?.speed ?? 0;
        u.uCaustic[2] = caustic?.inBeam ?? 0;
        u.uCaustic[3] = caustic ? 1 : 0;
        u.uCausticFloor[0] = (caustic?.floor?.cx ?? 0) * aspect;
        u.uCausticFloor[1] = caustic?.floor?.cy ?? 0;
        u.uCausticFloor[2] = (caustic?.floor?.rx ?? 0) * aspect;
        u.uCausticFloor[3] = caustic?.floor?.ry ?? 0;
        u.uCausticB[0] = (caustic?.floor?.strength ?? 0) * frame.glareScale;
        const wave = rig.wave;
        u.uWave[0] = wave ? WAVE_MODE_ID[wave.mode] : 0;
        u.uWave[1] = wave?.frequency ?? 0;
        u.uWave[2] = wave?.speed ?? 0;
        u.uWave[3] = (wave?.strength ?? 0) * frame.glareScale;
        u.uWaveB[0] = (wave?.cx ?? 0) * aspect;
        u.uWaveB[1] = wave?.cy ?? 0;
        u.uWaveB[2] = wave?.radius ?? 0;
        u.uWaveB[3] = wave?.separation ?? 0;
        const region = frame.textRegion;
        u.uShield[0] = region ? region.cx * aspect : 0;
        u.uShield[1] = region ? region.cy : 0;
        u.uShield[2] = region ? (region.w * aspect) / 2 : 1;
        u.uShield[3] = region ? region.h / 2 : 1;
        u.uShieldB[0] = region && wave ? wave.shield ?? 0.45 : 0;
        uniforms.update();
    };
    return {
        view: mesh,
        update,
        destroy: () => {
            mesh.destroy();
            // 传 true 连顶点 / 索引缓冲一起销毁；Geometry.destroy() 默认不动缓冲，要等 Pixi 的 GC 空闲 60 秒才删。
            geometry.destroy(true);
            shader.destroy();
        },
    };
};

// ======== components/visualizer/lumiere/light/motes ========


// 浮尘边界的采样参考。
const lumiereScaleMask__10 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__10 = ((443 ^ lumiereScaleMask__10) + Math.imul(186 ^ lumiereScaleMask__10, 252 ^ lumiereScaleMask__10))
    - ((443 ^ lumiereScaleMask__10) + Math.imul(186 ^ lumiereScaleMask__10, 252 ^ lumiereScaleMask__10));
const wrap = (value, min, max) => {
    const span = max - min;
    return min + ((((value - min) % span) + span) % span);
};
const createMotes = (pixi, options) => {
    const { width, height, spec, texture } = options;
    const aspect = width / height;
    const rng = createRng(options.seed);
    const view = new pixi.Container();
    const margin = 0.08 + LUMIERE_NEUTRAL_OFFSET__10;
    const motes = Array.from({ length: spec.count }, () => {
        const sprite = new pixi.Sprite(texture);
        sprite.anchor.set(0.5);
        view.addChild(sprite);
        const depth = rng();
        return {
            sprite,
            bx: rng() * (aspect + margin * 2) - margin,
            by: rng() * (1 + margin * 2) - margin,
            depth,
            size: spec.sizeMin + (spec.sizeMax - spec.sizeMin) * depth * depth,
            phaseA: rng() * Math.PI * 2,
            phaseB: rng() * Math.PI * 2,
            freqA: 0.6 + rng() * 0.8,
            freqB: 0.5 + rng() * 0.9,
            twinklePhase: rng() * Math.PI * 2,
            twinkleFreq: 0.8 + rng() * 2.2,
        };
    });
    const update = (time, beams, color, intensity) => {
        const omega = (Math.PI * 2) / Math.max(spec.swirlPeriod, 0.1);
        for (const mote of motes) {
            const speed = 0.45 + mote.depth * 0.9;
            const swirl = spec.swirl * (0.5 + mote.depth);
            const x = wrap(mote.bx + spec.driftX * speed * time + swirl * Math.sin(time * omega * mote.freqA + mote.phaseA), -margin, aspect + margin);
            const y = wrap(mote.by + spec.driftY * speed * time + swirl * Math.cos(time * omega * mote.freqB + mote.phaseB), -margin, 1 + margin);
            const lit = compressLight(lightAt(beams, x, y)) * spec.gain;
            const twinkle = 1 - spec.twinkle + spec.twinkle * (0.5 + 0.5 * Math.sin(time * mote.twinkleFreq * Math.PI * 2 + mote.twinklePhase));
            const alpha = Math.min(1, (lit + spec.ambient) * twinkle * intensity);
            const sprite = mote.sprite;
            sprite.visible = alpha > 0.004;
            if (!sprite.visible)
                continue;
            sprite.position.set(x * height, y * height);
            const px = mote.size * height;
            sprite.width = px;
            sprite.height = px;
            sprite.alpha = alpha;
            sprite.tint = color;
        }
    };
    return {
        view,
        update,
        destroy: () => view.destroy({ children: true }),
    };
};

// ======== components/visualizer/lumiere/light/starfall ========


// 星轨起光的时间参考。
const lumiereScaleMask__11 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__11 = ((62 ^ lumiereScaleMask__11) + Math.imul(3 ^ lumiereScaleMask__11, 59 ^ lumiereScaleMask__11))
    - ((62 ^ lumiereScaleMask__11) + Math.imul(3 ^ lumiereScaleMask__11, 59 ^ lumiereScaleMask__11));
/** 主光柱在开场的什么时刻点亮（相对镜头开始，秒）。 */
const starfallIgnition = (spec) => spec.opening * (0.45 + LUMIERE_NEUTRAL_OFFSET__11);
const clamp01__2 = (value) => Math.min(1, Math.max(0, value));
const easeOutCubic__2 = (value) => 1 - (1 - clamp01__2(value)) ** 3;
const createStarfall = (pixi, options) => {
    const { width, height, spec } = options;
    const aspect = width / height;
    const rng = createRng(`${options.seed}:starfall`);
    const view = new pixi.Container();
    const trails = new pixi.Container();
    const points = new pixi.Container();
    view.addChild(trails, points);
    const makeTrail = () => {
        const trail = new pixi.Sprite(options.streak);
        trail.anchor.set(1, 0.5);
        trail.rotation = Math.PI / 2;
        trails.addChild(trail);
        return trail;
    };
    const stars = Array.from({ length: spec.stars }, () => {
        const bright = rng() < 0.08;
        const sprite = new pixi.Sprite(bright ? options.star : options.dot);
        sprite.anchor.set(0.5);
        points.addChild(sprite);
        return {
            sprite,
            trail: makeTrail(),
            x: rng() * aspect,
            // 上密下疏。
            y: 0.02 + rng() ** 1.7 * 0.9,
            fromY: -0.05 - rng() * 0.25,
            // 倾泻：大多数在开场前段落下，少数拖到后段。
            delay: spec.opening * (0.02 + 0.7 * rng() ** 1.4),
            fall: 0.45 + rng() * 0.7,
            size: bright ? 0.018 + rng() * 0.02 : 0.003 + rng() * 0.006,
            bright,
            twinklePhase: rng() * Math.PI * 2,
            twinkleFreq: 0.4 + rng() * 1.8,
        };
    });
    const drops = Array.from({ length: spec.rain }, () => {
        const sprite = new pixi.Sprite(options.dot);
        sprite.anchor.set(0.5);
        points.addChild(sprite);
        // 横向：集中在画面中线（光柱）附近，近似正态。
        const spread = (rng() + rng() + rng() - 1.5) / 1.5;
        return {
            sprite,
            trail: makeTrail(),
            x: aspect * (0.5 + spread * spec.rainSpread * 0.5),
            period: (1.25 / Math.max(spec.rainSpeed, 0.01)) * (0.7 + rng() * 0.6),
            phase: rng(),
            size: 0.003 + rng() * 0.005,
            sway: (rng() - 0.5) * 0.02,
        };
    });
    const place = (sprite, trail, x, y, size, alpha, speed, color) => {
        sprite.visible = alpha > 0.004;
        trail.visible = sprite.visible && speed > 0.05;
        if (!sprite.visible)
            return;
        sprite.position.set(x * height, y * height);
        sprite.width = size * height;
        sprite.height = size * height;
        sprite.alpha = alpha;
        sprite.tint = color;
        if (trail.visible) {
            // 拖尾长度随速度，朝上（锚点在尾端 = 光点处）。
            trail.position.set(x * height, y * height);
            trail.width = Math.min(0.25, speed * 0.09) * height;
            trail.height = Math.max(1.5, size * height * 0.7);
            trail.alpha = alpha * 0.6;
            trail.tint = color;
        }
    };
    const update = (local, time, beams, color, fade) => {
        for (const star of stars) {
            const progress = (local - star.delay) / star.fall;
            if (progress <= 0) {
                star.sprite.visible = false;
                star.trail.visible = false;
                continue;
            }
            const eased = easeOutCubic__2(progress);
            const y = star.fromY + (star.y - star.fromY) * eased;
            // 下落速度（高度单位 / 秒）：easeOutCubic__2 的导数。
            const speed = progress < 1 ? ((star.y - star.fromY) * 3 * (1 - progress) ** 2) / star.fall : 0;
            const landedAt = star.delay + star.fall;
            const flash = local >= landedAt ? Math.exp(-(local - landedAt) / 0.25) : 0;
            const twinkle = 0.55 + 0.45 * Math.sin(time * star.twinkleFreq * Math.PI * 2 + star.twinklePhase);
            const lit = compressLight(lightAt(beams, star.x, y));
            const base = progress < 1 ? 0.9 : (star.bright ? 0.7 : 0.45) * twinkle;
            const alpha = clamp01__2((base + lit * 0.8 + flash) * spec.brightness * fade);
            place(star.sprite, star.trail, star.x, y, star.size * (1 + flash * 1.5), alpha, speed, color);
        }
        // 光雨：开场之后才开始，渐强。
        const rainIn = clamp01__2((local - spec.opening * 0.6) / 1.5);
        for (const drop of drops) {
            const cycle = (time / drop.period + drop.phase) % 1;
            const y = -0.1 + cycle * 1.25;
            const x = drop.x + Math.sin(time * 0.7 + drop.phase * 6) * drop.sway;
            const lit = compressLight(lightAt(beams, x, y));
            const edge = clamp01__2(cycle / 0.08) * clamp01__2((1 - cycle) / 0.15);
            const alpha = clamp01__2((0.18 + lit * 1.1) * edge * rainIn * fade * spec.brightness);
            place(drop.sprite, drop.trail, x, y, drop.size, alpha, 1.25 / drop.period, color);
        }
    };
    return {
        view,
        update,
        destroy: () => view.destroy({ children: true }),
    };
};

// ======== components/visualizer/lumiere/lineart/lineArt ========

// 线稿驻留时间的参考值。
const lumiereScaleMask__12 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__12 = ((0x3b7e2939 ^ lumiereScaleMask__12) + Math.imul(0x787a43c7 ^ lumiereScaleMask__12, 4898 ^ lumiereScaleMask__12))
    - ((0x3b7e2939 ^ lumiereScaleMask__12) + Math.imul(0x787a43c7 ^ lumiereScaleMask__12, 4898 ^ lumiereScaleMask__12));
/** 藏起来多少秒（歌曲时间）之后才放 GPU 数据：刚淡出的线可能被回拖一下又要画。 */
const LINE_ART_UNLOAD_AFTER = 2 + LUMIERE_NEUTRAL_OFFSET__12;
/** 下次出现在这么多秒之内就不放：马上又要画，放了只是白传一遍。 */
const LINE_ART_UNLOAD_LEAD = 4;
/**
 * 藏着的线稿这一帧该不该放掉 GPU 数据（滞回：藏够 LINE_ART_UNLOAD_AFTER 秒，且离下次出现至少 LINE_ART_UNLOAD_LEAD 秒）。
 * 起因：轨迹过渡把整首歌并成一个单元，每个镜头的线稿都活到单元销毁，画过一次的每条线都留着一个 batcher 和两块缓冲。
 */
const shouldUnloadLineArt = (hiddenSince, time, nextUse) => time - hiddenSince >= LINE_ART_UNLOAD_AFTER && nextUse - time >= LINE_ART_UNLOAD_LEAD;
const cumulative = (points) => {
    const lengths = [0];
    for (let i = 1; i < points.length; i += 1) {
        const [ax, ay] = points[i - 1];
        const [bx, by] = points[i];
        lengths.push(lengths[i - 1] + Math.hypot(bx - ax, by - ay));
    }
    return lengths;
};
const clamp01__3 = (value) => Math.min(1, Math.max(0, value));
const createLineArt = (pixi, options) => {
    const { height, spec } = options;
    const view = new pixi.Container();
    const pathsHolder = new pixi.Container();
    const nodesHolder = new pixi.Container();
    view.addChild(pathsHolder, nodesHolder);
    const paths = spec.paths.filter(path => path.points.length > 1).map(path => {
        const graphics = new pixi.Graphics();
        pathsHolder.addChild(graphics);
        const lengths = cumulative(path.points);
        const mid = path.points[Math.floor(path.points.length / 2)];
        return { spec: path, graphics, lengths, total: lengths[lengths.length - 1], drawn: -1, midpoint: mid };
    });
    const nodes = spec.nodes.map(node => {
        const sprite = new pixi.Sprite(options.starTexture);
        sprite.anchor.set(0.5);
        sprite.position.set(node.at[0] * height, node.at[1] * height);
        nodesHolder.addChild(sprite);
        return { spec: node, sprite };
    });
    /** 画出一条线的前 amount 长度（考虑虚线）。 */
    const redraw = (path, amount) => {
        const g = path.graphics;
        g.clear();
        if (amount <= 0)
            return;
        const { points, dash } = path.spec;
        const limit = Math.min(amount, path.total);
        const period = dash ? dash[0] + dash[1] : 0;
        const at = (index, distance) => {
            const [ax, ay] = points[index - 1];
            const [bx, by] = points[index];
            const segment = path.lengths[index] - path.lengths[index - 1];
            const f = segment > 0 ? (distance - path.lengths[index - 1]) / segment : 0;
            return [(ax + (bx - ax) * f) * height, (ay + (by - ay) * f) * height];
        };
        g.moveTo(points[0][0] * height, points[0][1] * height);
        for (let i = 1; i < points.length; i += 1) {
            const start = path.lengths[i - 1];
            const end = Math.min(path.lengths[i], limit);
            if (start >= limit)
                break;
            if (!dash) {
                const [x, y] = at(i, end);
                g.lineTo(x, y);
                continue;
            }
            // 虚线：按周期的整数下标取出落在本段里的每一截实线（不用浮点游标，避免卡在边界上）。
            for (let k = Math.floor(start / period); k * period < end; k += 1) {
                const from = Math.max(start, k * period);
                const to = Math.min(end, k * period + dash[0]);
                if (to <= from)
                    continue;
                const [ax, ay] = at(i, from);
                const [bx, by] = at(i, to);
                g.moveTo(ax, ay);
                g.lineTo(bx, by);
            }
        }
        const px = path.spec.width * height;
        g.stroke({ width: px * 3.2, color: 0xffffff, alpha: 0.12, cap: 'round', join: 'round' });
        g.stroke({ width: px, color: 0xffffff, alpha: 1, cap: 'round', join: 'round' });
    };
    // resident：画过、GPU 数据可能还在；hiddenSince：这次藏起来的时刻（NaN 表示正在画）。
    let resident = false;
    let hiddenSince = Number.NaN;
    const update = (time, draw, fade, beams, color) => {
        resident = true;
        hiddenSince = Number.NaN;
        for (const path of paths) {
            const { delay, span } = path.spec;
            const local = clamp01__3((draw - delay) / Math.max(span, 1e-3));
            const eased = 1 - (1 - local) ** 3;
            const amount = eased * path.total;
            if (Math.abs(amount - path.drawn) > 1e-5) {
                redraw(path, amount);
                path.drawn = amount;
            }
            const lit = compressLight(lightAt(beams, path.midpoint[0], path.midpoint[1]));
            // 光束外的线也要看得见（参考图里取景框、叶片都在暗处），受光的部分再亮一截。
            path.graphics.alpha = Math.min(1, path.spec.alpha * fade * (0.55 + 0.9 * lit));
            path.graphics.tint = color;
        }
        for (const { spec: node, sprite } of nodes) {
            const appear = clamp01__3((draw - node.delay) / 0.08);
            const lit = compressLight(lightAt(beams, node.at[0], node.at[1]));
            const twinkle = 0.55 + 0.45 * Math.sin(time * 2.3 + node.twinklePhase);
            const alpha = appear * fade * (0.25 + 0.75 * lit) * twinkle;
            sprite.visible = alpha > 0.004;
            if (!sprite.visible)
                continue;
            const pop = 1 + (1 - appear) * 1.5;
            const px = node.size * height * pop * (0.8 + 0.2 * twinkle);
            sprite.width = px;
            sprite.height = px;
            sprite.alpha = alpha;
            sprite.tint = color;
        }
    };
    const idle = (time, nextUse) => {
        if (!resident)
            return;
        // 刚藏起来，或回拖到了藏起来之前：从这一刻重新计时。
        if (!(hiddenSince <= time))
            hiddenSince = time;
        if (!shouldUnloadLineArt(hiddenSince, time, nextUse))
            return;
        // 只放 GPU 数据，几何指令留在 context 里；再画到时 Pixi 按指令重建、重传，和描线期间每帧重画走的是同一条路。
        // context 都是各条线自建的，没有别人共用。
        for (const path of paths)
            path.graphics.context.unload();
        resident = false;
    };
    return {
        view,
        update,
        idle,
        // context: true 必须带上：Pixi 8 的 Graphics.destroy 只要收到选项对象、却没写 context: true，就不销毁它自己建的
        // GraphicsContext。那个 context 还挂在渲染器的 GraphicsContextSystem 里，连同它的 GPU 批数据（一个 batcher、
        // 两块顶点 / 索引缓冲）要等 Pixi 的 GC 空闲 60 秒后才回收；单元换得勤时，WebGL 缓冲会一直涨到那个窗口的量。
        destroy: () => view.destroy({ children: true, context: true }),
    };
};

// ======== utils/lucideIconResolver ========
var LucideIcons = (typeof LucideIcons !== "undefined") ? LucideIcons : {};
// src/utils/lucideIconResolver.ts
// Resolves a theme's lyricsIcons entry (a PascalCase lucide name coming from AI output or the
// theme editor) to a renderable component, so callers never index lucide-react by hand.
// lucide icons are forwardRef objects; requiring that shape keeps the module's other exports
// (createLucideIcon, the icons map, ...) from passing as icon names.
const isLucideIcon = (value) => (typeof value === 'object' && value !== null && '$$typeof' in value && 'render' in value);
const resolveLucideIcon = (name) => {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) {
        return null;
    }
    const candidate = LucideIcons[trimmed];
    return isLucideIcon(candidate) ? candidate : null;
};
const isLucideIconName = (name) => resolveLucideIcon(name) !== null;
// Case-insensitive name table over the PascalCase exports (same filter Sonnet has always used).
// Built on first use so the other importers of this module never pay for scanning every export.
let lucideIconNamesByLowercase = null;
const iconNamesByLowercase = () => {
    lucideIconNamesByLowercase ?? (lucideIconNamesByLowercase = new Map(Object.keys(LucideIcons)
        .filter(name => {
        const candidate = LucideIcons[name];
        return /^[A-Z]/.test(name) && (typeof candidate === 'object' || typeof candidate === 'function');
    })
        .map(name => [name.toLowerCase(), name])));
    return lucideIconNamesByLowercase;
};
/**
 * Resolves a theme's lyricsIcons list to canonical lucide export names: case-insensitive, deduplicated,
 * unknown names dropped. No fallback - callers that want a default icon add it themselves.
 */
const resolveLucideIconNames = (names) => [
    ...new Set((names ?? [])
        .map(name => (typeof name === 'string' ? iconNamesByLowercase().get(name.toLowerCase()) : undefined))
        .filter(Boolean)),
];

// ======== components/visualizer/lumiere/lineart/iconPaths ========

// src/components/visualizer/lumiere/lineart/iconPaths.ts
// Lucide 图标 → 折线：取图标的 SVG 节点（path / circle / ellipse / line / rect / polyline / polygon），
// 弧与贝塞尔按角度 / 分段展平成折线，坐标留在图标自己的 24×24 viewBox 里，交给描线引擎再缩放摆放。
// 每个图标名只展平一次（模块级缓存），场景构建时直接取。
/** lucide 的 viewBox 边长。 */
const ICON_VIEWBOX = 24;
/** 曲线展平的精度：整圆 48 段，贝塞尔每段 12 段。 */
const CIRCLE_STEPS = 48;
const CURVE_STEPS = 12;
const num = (value, fallback = 0) => {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : fallback;
};
const ellipsePoints = (cx, cy, rx, ry, steps = CIRCLE_STEPS) => (Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
}));
/** 圆角矩形：四条边 + 四个四分之一圆弧，顺时针闭合。 */
const rectPoints = (x, y, w, h, rxIn, ryIn) => {
    const rx = Math.min(Math.max(0, rxIn), w / 2);
    const ry = Math.min(Math.max(0, ryIn), h / 2);
    if (rx <= 0 || ry <= 0)
        return [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
    const corner = (cx, cy, from) => Array.from({ length: 7 }, (_, i) => {
        const a = from + (i / 6) * (Math.PI / 2);
        return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
    });
    const points = [
        ...corner(x + w - rx, y + ry, -Math.PI / 2),
        ...corner(x + w - rx, y + h - ry, 0),
        ...corner(x + rx, y + h - ry, Math.PI / 2),
        ...corner(x + rx, y + ry, Math.PI),
    ];
    points.push(points[0]);
    return points;
};
const pointList = (value) => {
    const numbers = String(value ?? '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
    const points = [];
    for (let i = 0; i + 1 < numbers.length; i += 2)
        points.push([numbers[i], numbers[i + 1]]);
    return points;
};
/** SVG 椭圆弧（端点参数化）→ 折线（不含起点）。按 SVG 规范换成圆心参数化，半径不够时等比放大。 */
const arcToPoints = (from, rxIn, ryIn, angleDeg, largeArc, sweep, to) => {
    let rx = Math.abs(rxIn);
    let ry = Math.abs(ryIn);
    if (rx === 0 || ry === 0 || (from[0] === to[0] && from[1] === to[1]))
        return [to];
    const phi = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const dx = (from[0] - to[0]) / 2;
    const dy = (from[1] - to[1]) / 2;
    const x1 = cos * dx + sin * dy;
    const y1 = -sin * dx + cos * dy;
    const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lambda > 1) {
        rx *= Math.sqrt(lambda);
        ry *= Math.sqrt(lambda);
    }
    const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / Math.max(denominator, 1e-12)));
    const cx1 = (factor * rx * y1) / ry;
    const cy1 = (-factor * ry * x1) / rx;
    const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2;
    const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2;
    const angleOf = (ux, uy) => Math.atan2(uy, ux);
    const start = angleOf((x1 - cx1) / rx, (y1 - cy1) / ry);
    let delta = angleOf((-x1 - cx1) / rx, (-y1 - cy1) / ry) - start;
    if (sweep && delta < 0)
        delta += Math.PI * 2;
    if (!sweep && delta > 0)
        delta -= Math.PI * 2;
    const steps = Math.max(2, Math.ceil((Math.abs(delta) / (Math.PI * 2)) * CIRCLE_STEPS));
    const points = [];
    for (let i = 1; i <= steps; i += 1) {
        const a = start + (delta * i) / steps;
        const ex = Math.cos(a) * rx;
        const ey = Math.sin(a) * ry;
        points.push(i === steps ? to : [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
    }
    return points;
};
const cubicTo = (p0, p1, p2, p3) => Array.from({ length: CURVE_STEPS }, (_, k) => {
    const t = (k + 1) / CURVE_STEPS;
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
});
const quadTo = (p0, p1, p2) => Array.from({ length: CURVE_STEPS }, (_, k) => {
    const t = (k + 1) / CURVE_STEPS;
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
});
/**
 * SVG path 的 d → 折线（每个子路径一条）。支持全部命令（M L H V C S Q T A Z，大小写）；
 * 弧的两个标志位可以不带分隔符紧挨着写（lucide 的压缩写法「a4.5 4.5 0 1 1 7.5 12」「a2 2 0 012 2」）。
 */
const svgPathToPolylines = (d) => {
    const result = [];
    let index = 0;
    const skip = () => {
        while (index < d.length && /[\s,]/.test(d[index]))
            index += 1;
    };
    const readNumber = () => {
        skip();
        const match = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(d.slice(index));
        if (!match)
            return null;
        index += match[0].length;
        return Number(match[0]);
    };
    const readFlag = () => {
        skip();
        const char = d[index];
        if (char !== '0' && char !== '1')
            return null;
        index += 1;
        return char === '1';
    };
    const hasNumber = () => {
        skip();
        return index < d.length && /[+\-.\d]/.test(d[index]);
    };
    let current = [0, 0];
    let start = [0, 0];
    let points = [];
    let lastControl = null;
    let lastKind = '';
    const flush = (closed) => {
        if (points.length > 1)
            result.push({ points, closed });
        points = [];
    };
    while (index < d.length) {
        skip();
        if (index >= d.length)
            break;
        const command = d[index];
        if (!/[MmLlHhVvCcSsQqTtAaZz]/.test(command))
            break;
        index += 1;
        const relative = command === command.toLowerCase();
        const kind = command.toUpperCase();
        const abs = (x, y) => (relative ? [current[0] + x, current[1] + y] : [x, y]);
        if (kind === 'Z') {
            if (points.length > 0) {
                points.push(start);
                flush(true);
            }
            current = start;
            lastControl = null;
            lastKind = kind;
            continue;
        }
        let first = true;
        do {
            if (kind === 'M') {
                const x = readNumber();
                const y = readNumber();
                if (x === null || y === null)
                    break;
                const target = abs(x, y);
                // M 后面的坐标对按 L 处理。
                if (first) {
                    flush(false);
                    start = target;
                    points = [target];
                }
                else {
                    points.push(target);
                }
                current = target;
                lastControl = null;
            }
            else if (kind === 'L') {
                const x = readNumber();
                const y = readNumber();
                if (x === null || y === null)
                    break;
                current = abs(x, y);
                points.push(current);
                lastControl = null;
            }
            else if (kind === 'H') {
                const x = readNumber();
                if (x === null)
                    break;
                current = [relative ? current[0] + x : x, current[1]];
                points.push(current);
                lastControl = null;
            }
            else if (kind === 'V') {
                const y = readNumber();
                if (y === null)
                    break;
                current = [current[0], relative ? current[1] + y : y];
                points.push(current);
                lastControl = null;
            }
            else if (kind === 'C' || kind === 'S') {
                let c1;
                if (kind === 'C') {
                    const x1 = readNumber();
                    const y1 = readNumber();
                    if (x1 === null || y1 === null)
                        break;
                    c1 = abs(x1, y1);
                }
                else {
                    c1 = lastControl && (lastKind === 'C' || lastKind === 'S')
                        ? [current[0] * 2 - lastControl[0], current[1] * 2 - lastControl[1]]
                        : current;
                }
                const x2 = readNumber();
                const y2 = readNumber();
                const x = readNumber();
                const y = readNumber();
                if (x2 === null || y2 === null || x === null || y === null)
                    break;
                const c2 = abs(x2, y2);
                const end = abs(x, y);
                if (points.length === 0)
                    points = [current];
                points.push(...cubicTo(current, c1, c2, end));
                current = end;
                lastControl = c2;
            }
            else if (kind === 'Q' || kind === 'T') {
                let c;
                if (kind === 'Q') {
                    const x1 = readNumber();
                    const y1 = readNumber();
                    if (x1 === null || y1 === null)
                        break;
                    c = abs(x1, y1);
                }
                else {
                    c = lastControl && (lastKind === 'Q' || lastKind === 'T')
                        ? [current[0] * 2 - lastControl[0], current[1] * 2 - lastControl[1]]
                        : current;
                }
                const x = readNumber();
                const y = readNumber();
                if (x === null || y === null)
                    break;
                const end = abs(x, y);
                if (points.length === 0)
                    points = [current];
                points.push(...quadTo(current, c, end));
                current = end;
                lastControl = c;
            }
            else if (kind === 'A') {
                const rx = readNumber();
                const ry = readNumber();
                const angle = readNumber();
                const large = readFlag();
                const sweep = readFlag();
                const x = readNumber();
                const y = readNumber();
                if (rx === null || ry === null || angle === null || large === null || sweep === null || x === null || y === null)
                    break;
                const end = abs(x, y);
                if (points.length === 0)
                    points = [current];
                points.push(...arcToPoints(current, rx, ry, angle, large, sweep, end));
                current = end;
                lastControl = null;
            }
            // 同一命令后面可以连着多组参数。
            lastKind = kind;
            first = false;
        } while (hasNumber());
    }
    flush(false);
    return result;
};
/** 一个 lucide 节点 → 折线。未知元素忽略。 */
const nodeToPolylines = (tag, attrs) => {
    switch (tag) {
        case 'path':
            return svgPathToPolylines(String(attrs.d ?? ''));
        case 'circle': {
            const r = num(attrs.r);
            return r > 0 ? [{ points: ellipsePoints(num(attrs.cx), num(attrs.cy), r, r), closed: true }] : [];
        }
        case 'ellipse': {
            const rx = num(attrs.rx);
            const ry = num(attrs.ry);
            return rx > 0 && ry > 0 ? [{ points: ellipsePoints(num(attrs.cx), num(attrs.cy), rx, ry), closed: true }] : [];
        }
        case 'line':
            return [{ points: [[num(attrs.x1), num(attrs.y1)], [num(attrs.x2), num(attrs.y2)]], closed: false }];
        case 'rect': {
            const w = num(attrs.width);
            const h = num(attrs.height);
            if (w <= 0 || h <= 0)
                return [];
            // SVG：只给 rx 或 ry 之一时另一个取同值。
            const rx = attrs.rx !== undefined ? num(attrs.rx) : num(attrs.ry);
            const ry = attrs.ry !== undefined ? num(attrs.ry) : rx;
            return [{ points: rectPoints(num(attrs.x), num(attrs.y), w, h, rx, ry), closed: true }];
        }
        case 'polyline':
        case 'polygon': {
            const points = pointList(attrs.points);
            if (tag === 'polygon' && points.length > 2)
                points.push(points[0]);
            return points.length > 1 ? [{ points, closed: tag === 'polygon' }] : [];
        }
        default:
            return [];
    }
};
/** 图标节点（lucide 的 IconNode：[tag, attrs, children?][]）→ 折线，坐标在 24×24 viewBox 里；带子节点的（g）递归展开。 */
const iconNodeToPolylines = (node) => (node.flatMap(entry => {
    const [tag, attrs, children] = entry;
    return [
        ...nodeToPolylines(tag, attrs),
        ...(Array.isArray(children) ? iconNodeToPolylines(children) : []),
    ];
}));
/**
 * 取 lucide-react 图标组件里的 IconNode：组件是 forwardRef，它的 render 只是
 * createElement(Icon, { iconNode, ... })（1.48 起是 { icon: { node, ... } }），不跑 hooks，直接调用即可拿到节点数据，
 * 不必渲染 SVG 再解析。
 */
const readIconNode = (name) => {
    const icon = resolveLucideIcon(name);
    if (!icon || typeof icon.render !== 'function')
        return null;
    try {
        const element = icon.render({}, null);
        const node = element?.props?.iconNode ?? element?.props?.icon?.node;
        return Array.isArray(node) ? node : null;
    }
    catch {
        return null;
    }
};
const cache = new Map();
/** 按图标名（lucide 的 PascalCase 导出名）取折线；未知图标返回 null。结果按名字缓存。 */
const lucideIconPolylines = (name) => {
    if (cache.has(name))
        return cache.get(name);
    const node = readIconNode(name);
    const polylines = node ? iconNodeToPolylines(node).filter(polyline => polyline.points.length > 1) : null;
    const value = polylines && polylines.length > 0 ? polylines : null;
    cache.set(name, value);
    return value;
};

// ======== components/visualizer/lumiere/lineart/themeIcons ========



// 图标留白的测量参考。
const lumiereScaleMask__13 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__13 = ((0x5efd6ee0 ^ lumiereScaleMask__13) + Math.imul(0x1a8ce47b ^ lumiereScaleMask__13, 0x50b8d09c ^ lumiereScaleMask__13))
    - ((0x5efd6ee0 ^ lumiereScaleMask__13) + Math.imul(0x1a8ce47b ^ lumiereScaleMask__13, 0x50b8d09c ^ lumiereScaleMask__13));
/** 图标边长范围、与文字区 / 彼此之间留的空、离画面边缘的距离（高度单位）。 */
const ICON_SIZE = [0.085, 0.13];
const TEXT_PAD = 0.05 + LUMIERE_NEUTRAL_OFFSET__13;
const EDGE = 0.05;
const ATTEMPTS = 48;
const overlapsRegion = (cx, cy, half, region, pad) => (Math.abs(cx - region.cx) < half + region.w / 2 + pad
    && Math.abs(cy - region.cy) < half + region.h / 2 + pad);
/**
 * 按种子给图标找落点：在画面内（留边）随机取位置，拒绝与文字区（外扩 TEXT_PAD）或已放下的图标重叠的候选。
 * 找不到空处的图标就不放（文字区占满画面时可能一枚都没有）。
 */
const placeThemeIcons = (options) => {
    const names = options.names.filter(name => lucideIconPolylines(name) !== null);
    if (names.length === 0)
        return [];
    const { aspect, avoid, random } = options;
    const count = options.count ?? 2 + (random() < 0.5 ? 1 : 0);
    const offset = options.offset ?? 0;
    const placed = [];
    for (let i = 0; i < count; i += 1) {
        const name = names[(offset + i) % names.length];
        const size = ICON_SIZE[0] + random() * (ICON_SIZE[1] - ICON_SIZE[0]);
        const rotation = (random() - 0.5) * 0.3;
        const half = size * 0.72; // 转动后的外接半径（留一点余量）
        for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
            const cx = EDGE + half + random() * Math.max(0, aspect - 2 * (EDGE + half));
            const cy = EDGE + half + random() * Math.max(0, 1 - 2 * (EDGE + half));
            if (overlapsRegion(cx, cy, half, avoid, TEXT_PAD))
                continue;
            if (placed.some(other => Math.hypot(other.cx - cx, other.cy - cy) < (other.size + size) * 0.9))
                continue;
            placed.push({ name, cx, cy, size, rotation });
            break;
        }
    }
    return placed;
};
/** 图标折线（viewBox 坐标）→ 画面折线：以图标中心为原点缩放、转动、平移。 */
const transformPolyline = (polyline, icon) => {
    const scale = icon.size / ICON_VIEWBOX;
    const cos = Math.cos(icon.rotation);
    const sin = Math.sin(icon.rotation);
    const half = ICON_VIEWBOX / 2;
    return polyline.points.map(([x, y]) => {
        const lx = (x - half) * scale;
        const ly = (y - half) * scale;
        return [icon.cx + lx * cos - ly * sin, icon.cy + lx * sin + ly * cos];
    });
};
const polylineLength = (points) => {
    let length = 0;
    for (let i = 1; i < points.length; i += 1)
        length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    return length;
};
/**
 * 摆好的图标 → 线稿：每枚依次开始描（错开 0.12），图标内的笔画再各错开一点；最长那一笔的起点与
 * 另一个按种子挑的端点上各有一个闪点，笔画描到时出现。
 */
const themeIconsArt = (icons, random, delay = 0.18, alpha = 0.5) => {
    const paths = [];
    const nodes = [];
    icons.forEach((icon, iconIndex) => {
        const polylines = lucideIconPolylines(icon.name);
        if (!polylines)
            return;
        const start = delay + iconIndex * 0.12;
        const strokes = polylines.map(polyline => transformPolyline(polyline, icon));
        strokes.forEach((points, strokeIndex) => {
            paths.push({
                points,
                width: 0.0013,
                alpha,
                delay: start + Math.min(strokeIndex, 8) * 0.035,
                span: 0.32,
            });
        });
        const longest = strokes.reduce((best, points, index) => (polylineLength(points) > polylineLength(strokes[best]) ? index : best), 0);
        nodes.push({ at: strokes[longest][0], size: 0.02, delay: start + 0.08, twinklePhase: random() * Math.PI * 2 });
        const other = strokes[Math.floor(random() * strokes.length)];
        if (strokes.length > 1) {
            nodes.push({ at: other[other.length - 1], size: 0.015, delay: start + 0.3, twinklePhase: random() * Math.PI * 2 });
        }
    });
    return { paths, nodes };
};
/** 一个镜头的主题图标线稿：找落点 + 画成线稿。没有可用图标时是空的。 */
const buildThemeIconArt = (options) => {
    const icons = placeThemeIcons(options);
    return themeIconsArt(icons, options.random, options.delay, options.alpha);
};
/**
 * 场景单元里每个镜头的主题图标线稿（与镜头一一对应）。开关关掉、主题没有图标或图标名都无效时返回空数组——
 * 不退回默认图标。每个镜头按 `${seed}:${镜头序号}:${光位}:icons` 播种，并轮到不同的图标。
 */
const buildShotIconArts = (options) => {
    if (!options.enabled)
        return [];
    const names = resolveLucideIconNames(options.icons).filter(name => lucideIconPolylines(name) !== null);
    if (names.length === 0)
        return [];
    return options.shotKinds.map((kind, index) => buildThemeIconArt({
        names,
        aspect: options.aspect,
        avoid: options.avoid,
        random: createRng(`${options.seed}:${index}:${kind}:icons`),
        offset: index * 2,
    }));
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

// ======== components/visualizer/lumiere/text/keywordColors ========




// src/components/visualizer/lumiere/text/keywordColors.ts
// 绘光的关键字着色：关键字与颜色是主题的 wordColors，匹配走 folia 共用的 wordColoring（中日韩按短语包含、
// 英文按词，按字符区间落到字上，所以「花火」不会染到「火车」的「火」）。每行只在构建时匹配一次，得到逐字
// （grapheme）的关键字色；逐帧只做与光色的混合。
//
// 混合：关键字色与光色按比例混合，再把最亮的通道拉回光色的亮度——字仍是「被光照亮」的样子，只是带上了
// 关键字的色相；暗色的关键字（浅色主题常见）不会变成一块灰。未点亮的字保持冷色，不参与。
/** 各处关键字色的占比（其余是光色）：字身、光晕、闪点、十字爆闪、背景碎片。 */
const KEYWORD_MIX = {
    glyph: 0.6,
    halo: 0.75,
    star: 0.55,
    burst: 0.7,
    echo: 0.3,
};
/** 闪点在关键字光色之上再掺多少白（普通字是 0.5）：闪光带色，但仍是一颗亮星。 */
const KEYWORD_STAR_WHITE = 0.35;
/** 关键字的光晕比普通字亮一点，颜色才看得出来。 */
const KEYWORD_HALO_GAIN = 1.25;
const prepareLumiereKeywords = (wordColors, enabled) => prepareWordColorMatchers(wordColors, enabled);
const parseRgb = (color) => {
    const channels = parseColorChannels(color);
    return channels ? [channels.r / 255, channels.g / 255, channels.b / 255] : null;
};
/**
 * 一行文字逐字（splitLyricGraphemes 的切法，与字形条一致）的关键字色；不是关键字的字为 null。
 * 没有匹配器或没有匹配时返回全 null 的数组。
 */
const resolveGlyphKeywordColors = (text, matchers) => {
    const graphemes = splitLyricGraphemes(text);
    const colors = graphemes.map(() => null);
    if (matchers.length === 0 || graphemes.length === 0)
        return colors;
    const ranges = buildWordColorRangesFromMatchers(text, [...matchers]);
    if (ranges.length === 0)
        return colors;
    let offset = 0;
    const tokens = graphemes.map((grapheme, index) => {
        const token = { key: String(index), timed: grapheme.trim().length > 0, startOffset: offset, endOffset: offset + grapheme.length };
        offset += grapheme.length;
        return token;
    });
    // 同一个颜色只解析一次，一行里重复出现的关键字共用同一个数组。
    const parsed = new Map();
    resolveTokenColorMap(tokens, ranges).forEach((hex, key) => {
        if (!parsed.has(hex))
            parsed.set(hex, parseRgb(hex));
        colors[Number(key)] = parsed.get(hex) ?? null;
    });
    return colors;
};
/**
 * 关键字色与光色按 amount 混合，最亮的通道拉回光色的亮度（保持发光观感）。关键字色先提到满亮度再混——
 * 只取它的色相与饱和度，不取明暗：浅色主题里常见的深蓝、深红照样能在光里读出颜色，不会被光色冲成白。
 */
const keywordLight = (light, keyword, amount) => {
    const keywordPeak = Math.max(keyword[0], keyword[1], keyword[2]);
    const hue = keywordPeak > 1e-4 ? scaleRgb(keyword, 1 / keywordPeak) : WHITE;
    const mixed = mixRgb(light, hue, amount);
    const peak = Math.max(mixed[0], mixed[1], mixed[2]);
    const target = Math.max(light[0], light[1], light[2]);
    return peak > 1e-4 ? scaleRgb(mixed, target / peak) : light;
};
const keywordTints = (light, keyword) => ({
    glyph: keywordLight(light, keyword, KEYWORD_MIX.glyph),
    halo: hexOf(keywordLight(light, keyword, KEYWORD_MIX.halo)),
    star: hexOf(mixRgb(keywordLight(light, keyword, KEYWORD_MIX.star), WHITE, KEYWORD_STAR_WHITE)),
});
/** 十字爆闪落在关键字上：以关键字光色为主，保留一点光位的 tint。 */
const keywordBurstColor = (burstColor, light, keyword) => (mixRgb(burstColor, keywordLight(light, keyword, KEYWORD_MIX.burst), 0.8));
/** 背景碎片里的关键字：只带一点色。 */
const keywordEchoColor = (light, keyword) => keywordLight(light, keyword, KEYWORD_MIX.echo);

// ======== components/visualizer/lumiere/text/glyphLine ========

// 字形画布的尺寸参考。
const lumiereScaleMask__14 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__14 = ((0xe562ea44 ^ lumiereScaleMask__14) + Math.imul(523 ^ lumiereScaleMask__14, 979 ^ lumiereScaleMask__14))
    - ((0xe562ea44 ^ lumiereScaleMask__14) + Math.imul(523 ^ lumiereScaleMask__14, 979 ^ lumiereScaleMask__14));
const UPRIGHT = /[ᄀ-ᇿ⺀-⿿　-〿぀-ヿ㄀-ㇿ㈀-鿿가-힯豈-﫿︰-﹏＀-￯]|[\u{20000}-\u{3134f}]/u;
/** Canvas 2D / pretext 的字体串：画字与测量必须用同一个格式。 */
const glyphFont = (weight, px, family) => `${weight} ${px}px ${family}`;
/** 竖排时是否直立。 */
const isUprightGlyph = (char) => UPRIGHT.test(char);
const buildGlyphLine = (pixi, options) => {
    const { text, fontPx } = options;
    const graphemes = splitLyricGraphemes(text);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSpec = glyphFont(options.weight, fontPx, options.font);
    context.font = fontSpec;
    const spacing = (options.letterSpacing ?? 0) * fontPx;
    // 前缀宽度：保留字距调整（kerning），逐字的边界落在前缀宽度上。
    const offsets = [0];
    let prefix = '';
    graphemes.forEach((char, index) => {
        prefix += char;
        offsets.push(context.measureText(prefix).width + spacing * (index + 1));
    });
    const width = Math.max(1, offsets[offsets.length - 1]);
    const height = Math.ceil(fontPx * 1.5);
    const pad = Math.ceil(fontPx * 0.25);
    const limit = options.maxCanvasPx ?? (8192 + LUMIERE_NEUTRAL_OFFSET__14);
    const resolution = Math.min(options.resolution, limit / (width + pad * 2), limit / (height + pad * 2));
    canvas.width = Math.ceil((width + pad * 2) * resolution);
    canvas.height = Math.ceil((height + pad * 2) * resolution);
    context.setTransform(resolution, 0, 0, resolution, 0, 0);
    context.font = fontSpec;
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#ffffff';
    const draw = (char, x) => {
        if (options.outline) {
            // 空心字：细描边 + 很淡的填充。
            context.globalAlpha = 0.14;
            context.fillText(char, x, pad + height / 2);
            context.globalAlpha = 1;
            context.lineWidth = fontPx * options.outline;
            context.strokeText(char, x, pad + height / 2);
        }
        else {
            context.fillText(char, x, pad + height / 2);
        }
    };
    if (spacing === 0) {
        draw(text, pad);
    }
    else {
        graphemes.forEach((char, index) => draw(char, pad + offsets[index]));
    }
    // 交给 Pixi 的纹理 GC：一分钟没画过的行（整首歌一个单元时，早已唱过的行）卸掉显存副本，画布还在，
    // 再出现时重新上传。按段落切单元时行不会闲置这么久，没有影响。
    // 以 resolution 1 构造、之后再设真实倍率（与 latticeLyricRaster 同一个坑）：直接传 resolution 时，CanvasSource
    // 先算 width = canvas.width / resolution，TextureSource 再乘回去，resizeCanvas() 用 !== 拿这个浮点数和整数画布
    // 尺寸比，往返不精确（上面的边长上限把特别长的行压成非整数倍率，或 1.75 这类 DPR）就回写 canvas.width——
    // 给画布赋宽高会清空刚画好的字，整行成了空白纹理。resolution 的 setter 只按像素尺寸重算宽高，不碰画布。
    const source = new pixi.CanvasSource({ resource: canvas, resolution: 1, autoGarbageCollect: true });
    source.resolution = resolution;
    const base = new pixi.Texture({ source });
    const glyphs = graphemes.map((char, index) => {
        const x = offsets[index];
        const w = Math.max(0.5, offsets[index + 1] - x);
        // 第一个与最后一个字把留白也带上，免得字形出头的部分（斜体、标点）被切掉。
        const left = index === 0 ? 0 : pad + x;
        const right = index === graphemes.length - 1 ? width + pad * 2 : pad + x + w;
        const frame = new pixi.Rectangle(left, 0, right - left, height + pad * 2);
        return {
            char,
            x: left - pad,
            width: right - left,
            charX: x,
            charWidth: w,
            anchorX: (pad + x + w / 2 - left) / (right - left),
            anchorY: 0.5,
            texture: new pixi.Texture({ source, frame }),
            blank: char.trim().length === 0,
            upright: isUprightGlyph(char),
        };
    });
    return {
        text,
        fontPx,
        width,
        height,
        glyphs,
        destroy: () => {
            glyphs.forEach(glyph => glyph.texture.destroy(false));
            base.destroy(true);
        },
    };
};
/** 纹理里的纵向留白（逻辑像素），放置字形时减去。 */
const glyphPad = (fontPx) => Math.ceil(fontPx * 0.25);

// ======== components/visualizer/lumiere/text/reveal ========

const buildGlyphTimings = (line) => (buildLineGraphemeTimeline(line).map(timing => ({ start: timing.startTime, end: timing.endTime })));
const clamp01__4 = (value) => Math.min(1, Math.max(0, value));
/** 0 = 还没唱到，1 = 已唱完。字的时长太短时至少给 80ms，点亮不至于一闪而过。 */
const glyphProgress = (timing, time) => (clamp01__4((time - timing.start) / Math.max(timing.end - timing.start, 0.08)));
/** 点亮瞬间的闪点：attack 秒平滑升起，之后按 decay 秒指数衰减。 */
const flashEnvelope = (timing, time, decay = 0.5, attack = 0.15) => {
    const age = time - timing.start;
    if (age <= 0)
        return 0;
    if (age < attack) {
        const t = age / attack;
        return t * t * (3 - 2 * t);
    }
    return Math.exp(-(age - attack) / decay);
};

// ======== components/visualizer/lumiere/text/wordStyle ========



// 词形放大倍率的参考值。
const lumiereScaleMask__15 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__15 = ((0xf0743965 ^ lumiereScaleMask__15) + Math.imul(0x29b19c8a ^ lumiereScaleMask__15, 0x8f259e5f ^ lumiereScaleMask__15))
    - ((0xf0743965 ^ lumiereScaleMask__15) + Math.imul(0x29b19c8a ^ lumiereScaleMask__15, 0x8f259e5f ^ lumiereScaleMask__15));
/** 字号倍率的上限：字形纹理按这个倍率画，放大的词只缩小不放大，不会糊。 */
const MAX_WORD_SCALE = 1.5 + LUMIERE_NEUTRAL_OFFSET__15;
/** 把一行切成词：走 folia 唯一的分词入口（用户保存的精细分词优先，否则 Intl.Segmenter，没有就逐字）。 */
const segmentWords = (line) => {
    const pieces = segmentLyricWords(line);
    const words = [];
    let cursor = 0;
    for (const { segment, isWordLike } of pieces) {
        const length = splitLyricGraphemes(segment).length;
        if (length === 0)
            continue;
        words.push({ text: segment, start: cursor, end: cursor + length, blank: !isWordLike });
        cursor += length;
    }
    return words;
};
/** 常见的虚词、代词与助词：单字时小一号。 */
const FUNCTION_WORDS = new Set(Array.from('的了在把是我你他她它们和与也就都着过吗呢吧啊呀哦被让给从向到这那之而又很'));
const MINOR_LATIN = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'me', 'my', 'with', 'and', 'or', 'is', 'i', 'you', 'it', 'by', 'for']);
/** 每个词的字号倍率（与 segmentWords 的结果一一对应）。按种子确定。 */
const wordScales = (words, seed) => {
    const rng = createRng(`${seed}:words`);
    const lengthOf = (word) => word.end - word.start;
    const minor = (word) => word.blank
        || (lengthOf(word) === 1 && FUNCTION_WORDS.has(word.text))
        || MINOR_LATIN.has(word.text.toLowerCase());
    // 重点词：最长的实词；一样长取靠后的（句尾的词更像落点）。
    let key = -1;
    words.forEach((word, index) => {
        if (minor(word))
            return;
        if (key < 0 || lengthOf(word) >= lengthOf(words[key]))
            key = index;
    });
    return words.map((word, index) => {
        const jitter = rng();
        // 空白保持原宽（缩小会把英文的词挤在一起）；标点与符号才算小字。
        if (word.blank && word.text.trim().length === 0)
            return 1;
        if (index === key && words.length > 1)
            return 1.45;
        if (minor(word))
            return 0.62;
        return 0.85 + jitter * 0.35;
    });
};
/**
 * 错落：每个词在行的垂直方向上的错位（以字号为单位；横排时上下、竖排时左右）。
 * 重点词不动，小字错得多，其余按种子上下跳。
 */
const wordJags = (words, scales, seed) => {
    const rng = createRng(`${seed}:jags`);
    const keyScale = Math.max(...scales);
    return words.map((_, index) => {
        const offset = (rng() - 0.5) * 2;
        const scale = scales[index] ?? 1;
        if (scale === keyScale && words.length > 1)
            return 0;
        return offset * (scale < 0.7 ? 0.32 : 0.2);
    });
};

// ======== components/visualizer/lumiere/text/lyricEcho ========








/** 一个碎片存在多久（秒）、沿光束漂多快（高度单位 / 秒）、从离光源多远的地方出现。 */
const LIFE = 7;
const SPEED = 0.075;
const BIRTH_DISTANCE = 0.08;
/** 碎片出现前多久把这一行的空心字画好（秒）。 */
const PREPARE = 3;
const clamp01__5 = (value) => Math.min(1, Math.max(0, value));
const smooth__3 = (value) => {
    const t = clamp01__5(value);
    return t * t * (3 - 2 * t);
};
const createLyricEcho = (pixi, options) => {
    const { height } = options;
    const rng = createRng(`${options.seed}:echo`);
    const view = new pixi.Container();
    const fontPx = options.size * height;
    // 背景字本来就淡，分辨率不需要高；画布边长也封顶。
    const resolution = Math.min(options.resolution, 1.5);
    const fragments = [];
    const holders = [];
    const echoLines = [];
    // 随机量一次抽完（顺序与一次画完时相同）；字形只按字素数算（与 buildGlyphLine 同一个切分），不画。
    options.lines.forEach(line => {
        const graphemes = splitLyricGraphemes(line.fullText);
        const timings = buildGlyphTimings(line);
        const keywordColors = options.keywords && options.keywords.length > 0
            ? resolveGlyphKeywordColors(line.fullText, options.keywords)
            : null;
        const first = fragments.length;
        segmentWords(line).forEach(word => {
            if (word.blank)
                return;
            const end = Math.min(word.end, graphemes.length);
            if (end <= word.start)
                return;
            const holder = new pixi.Container();
            view.addChild(holder);
            holders.push(holder);
            fragments.push({
                birth: timings[word.start]?.start ?? line.startTime,
                across: (rng() - 0.5) * 2.8,
                speed: 0.7 + rng() * 0.7,
                scale: 0.4 + rng() * 0.6,
                rotation: (rng() - 0.5) * 0.9,
                stretch: 0.75 + rng() * 0.7,
                shear: (rng() - 0.5) * 0.12,
                spin: (rng() - 0.5) * 0.08,
                start: word.start,
                end,
                glyphs: graphemes.slice(word.start, end).map((char, offsetInWord) => {
                    const angle = rng() * Math.PI * 2;
                    return {
                        sprite: null,
                        blank: char.trim().length === 0,
                        offset: 0,
                        dx: Math.cos(angle),
                        dy: Math.sin(angle),
                        speed: 0.3 + rng() * 0.9,
                        spin: (rng() - 0.5) * 0.5,
                        keyword: keywordColors?.[word.start + offsetInWord] ?? null,
                    };
                }),
            });
        });
        const births = fragments.slice(first).map(fragment => fragment.birth);
        if (births.length === 0)
            return;
        echoLines.push({
            text: line.fullText,
            first,
            last: fragments.length,
            from: Math.min(...births),
            to: Math.max(...births),
            layout: null,
        });
    });
    /** 画这一行的空心字，把字形挂到它的碎片上。 */
    const rasterize = (echoLine) => {
        const layout = buildGlyphLine(pixi, {
            text: echoLine.text,
            fontPx,
            font: options.font,
            weight: options.weight,
            resolution,
            letterSpacing: 0.04,
            outline: 0.012,
            maxCanvasPx: 4096,
        });
        echoLine.layout = layout;
        for (let index = echoLine.first; index < echoLine.last; index += 1) {
            const fragment = fragments[index];
            const slices = layout.glyphs.slice(fragment.start, fragment.end);
            const left = slices[0].charX;
            const right = slices[slices.length - 1].charX + slices[slices.length - 1].charWidth;
            const middle = (left + right) / 2;
            fragment.glyphs.forEach((glyph, offsetInWord) => {
                const slice = slices[offsetInWord];
                const sprite = new pixi.Sprite(slice.texture);
                sprite.anchor.set(slice.anchorX, slice.anchorY);
                sprite.visible = !glyph.blank;
                holders[index].addChild(sprite);
                glyph.sprite = sprite;
                glyph.offset = slice.charX + slice.charWidth / 2 - middle;
            });
        }
    };
    /** 释放这一行的空心字（精灵与画布纹理）。 */
    const release = (echoLine) => {
        for (let index = echoLine.first; index < echoLine.last; index += 1) {
            holders[index].removeChildren().forEach(child => child.destroy());
            fragments[index].glyphs.forEach(glyph => { glyph.sprite = null; });
        }
        echoLine.layout?.destroy();
        echoLine.layout = null;
    };
    /**
     * 按时间画 / 释放：碎片已经出现的行立刻画；快出现的行一帧最多提前画一行（把画字的开销摊开）；
     * 碎片全部消失、或时间退回到出现之前的行释放。
     */
    const prepare = (time) => {
        let budget = 1;
        for (const echoLine of echoLines) {
            if (time < echoLine.from - PREPARE || time > echoLine.to + LIFE) {
                if (echoLine.layout)
                    release(echoLine);
            }
            else if (!echoLine.layout && (time >= echoLine.from || budget-- > 0)) {
                rasterize(echoLine);
            }
        }
    };
    // 关键字碎片的颜色按光色缓存（光色通常整个单元不变）。
    const hasKeywords = fragments.some(fragment => fragment.glyphs.some(glyph => glyph.keyword));
    const keywordHex = new Map();
    let keywordFor = -1;
    const keywordTint = (color, keyword) => {
        if (color !== keywordFor) {
            keywordHex.clear();
            keywordFor = color;
        }
        let hex = keywordHex.get(keyword);
        if (hex === undefined) {
            const light = [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
            hex = hexOf(keywordEchoColor(light, keyword));
            keywordHex.set(keyword, hex);
        }
        return hex;
    };
    const update = ({ time, beams, color, intensity }) => {
        prepare(time);
        // 主光束（第一束）的几何：原点、方向、半宽；没有光束时退回画面顶部中央竖直向下。
        const beam = beams[0];
        const ox = beam?.ox ?? (options.width / height) / 2;
        const oy = beam?.oy ?? 0;
        const bx = beam?.dx ?? 0;
        const by = beam?.dy ?? 1;
        const halfAt = (distance) => (beam ? beam.halfWidth + distance * beam.tanSpread : 0.08) + 0.04;
        fragments.forEach((fragment, index) => {
            const holder = holders[index];
            const age = time - fragment.birth;
            const presence = smooth__3(age / 0.9) * (1 - smooth__3((age - (LIFE - 2.5)) / 2.5));
            const alpha = presence * intensity * options.opacity;
            holder.visible = age >= 0 && age <= LIFE && alpha > 0.003;
            if (!holder.visible)
                return;
            // 沿光束漂：离光源的距离随时间增长，横向位置按光束在那里的半宽换算（光束摆动时跟着走）。
            const distance = BIRTH_DISTANCE + SPEED * fragment.speed * age;
            const across = fragment.across * halfAt(distance);
            const x = (ox + bx * distance - by * across) * height;
            const y = (oy + by * distance + bx * across) * height;
            holder.position.set(x, y);
            holder.rotation = fragment.rotation + fragment.spin * age;
            holder.scale.set(fragment.scale * fragment.stretch, fragment.scale);
            holder.skew.set(fragment.shear * age, 0);
            // 拆开：字彼此散开（按 age^1.3 加速）、各自转动。
            const split = 0.05 * age ** 1.3;
            const lit = compressLight(lightAt(beams, x / height, y / height));
            const glyphAlpha = alpha * (0.05 + 0.4 * lit);
            for (const glyph of fragment.glyphs) {
                if (!glyph.sprite)
                    continue;
                glyph.sprite.position.set(glyph.offset + glyph.dx * fontPx * split * glyph.speed, glyph.dy * fontPx * split * glyph.speed);
                glyph.sprite.rotation = glyph.spin * split * 4;
                glyph.sprite.alpha = glyphAlpha;
                glyph.sprite.tint = hasKeywords && glyph.keyword ? keywordTint(color, glyph.keyword) : color;
            }
        });
    };
    return {
        view,
        update,
        destroy: () => {
            view.destroy({ children: true });
            echoLines.forEach(echoLine => echoLine.layout?.destroy());
        },
    };
};

// ======== components/visualizer/lumiere/text/lineWrap ========
// Copyright (c) 2026 chthollyphile
var  measureNaturalWidth, prepareWithSegments  = pretext;
var  measureRichInlineStats, prepareRichInline, walkRichInlineLineRanges  = pretext;
/** 画框四角括号的边距（逻辑像素）：边缘可能被运镜推近、后处理的镜头畸变往外推，留足。overlay 也用它。 */
const frameInsets = (width, height) => ({
    padX: Math.max(30, width * 0.065),
    padY: Math.max(30, height * 0.085),
});
/** 字离左右对位十字、上沿对焦虚线再留的距离（高度单位）。 */
const FRAME_CLEARANCE_X = 0.04;
const FRAME_CLEARANCE_TOP = 0.035;
/**
 * 底部给共享字幕（翻译 / 下一句）让出的高度（高度单位）：folia 的字幕层 bottom 约 112px（基线 32 + 净空 80），
 * 再加一行字高，900px 高的窗口里字幕上沿约在 0.83；再留 0.03 给行的漂移、绕行与运镜推近。
 */
const SUBTITLE_CLEARANCE = 0.2;
const frameBand = (width, height) => {
    const { padX, padY } = frameInsets(width, height);
    const left = padX / height + FRAME_CLEARANCE_X;
    return {
        left,
        right: width / height - left,
        top: padY / height + FRAME_CLEARANCE_TOP,
        bottom: Math.max(padY / height + FRAME_CLEARANCE_TOP + 0.2, 1 - SUBTITLE_CLEARANCE),
    };
};
/** 单行（单列）最多整体缩小到这个比例；再小就折成两行（两列）。 */
const SINGLE_MIN_FIT = 0.8;
/** 最多折成几行 / 几列。 */
const MAX_LINES = 2;
/** 行距（横排两行的行心距）与列距（竖排两列的列心距），以字号为单位。 */
const ROW_PITCH = 1.6;
const COLUMN_PITCH = 1.6;
const createTextMeasurer = (family, weight, letterSpacing) => {
    const cache = new Map();
    const font = (px) => glyphFont(weight, px, family);
    const spacing = (px) => letterSpacing * px;
    return {
        font,
        spacing,
        natural: (text, px) => {
            const key = `${px}|${text}`;
            let width = cache.get(key);
            if (width === undefined) {
                const ls = spacing(px);
                width = measureNaturalWidth(prepareWithSegments(text, font(px), ls === 0 ? undefined : { letterSpacing: ls }));
                cache.set(key, width);
            }
            return width;
        },
    };
};
/** 前置标点黏后一个词，其余标点黏前一个词。 */
const OPENING = /^[([{（【《「『〈〔［“‘]+$/u;
/** 把分词切成段：词两端的空白单独成段（rich-inline 会把它们收成词间距），没被分词覆盖的字各成一段。 */
const spansOf = (glyphs, words) => {
    const isSpace = (index) => glyphs[index].char.trim().length === 0;
    const ranges = [];
    let cursor = 0;
    for (const word of words) {
        const start = Math.max(cursor, Math.min(glyphs.length, word.start));
        const end = Math.min(glyphs.length, word.end);
        for (let index = cursor; index < start; index += 1)
            ranges.push({ start: index, end: index + 1, word: false });
        if (end > start)
            ranges.push({ start, end, word: !word.blank });
        cursor = Math.max(cursor, end);
    }
    for (let index = cursor; index < glyphs.length; index += 1)
        ranges.push({ start: index, end: index + 1, word: false });
    const spans = [];
    for (const range of ranges) {
        let { start, end } = range;
        const lead = [];
        const tail = [];
        while (start < end && isSpace(start))
            lead.push({ start, end: ++start, kind: 'space' });
        while (end > start && isSpace(end - 1))
            tail.unshift({ start: end - 1, end: end--, kind: 'space' });
        spans.push(...lead);
        if (end > start)
            spans.push({ start, end, kind: range.word ? 'word' : 'punct' });
        spans.push(...tail);
    }
    return spans;
};
const textOf = (glyphs, start, end) => glyphs.slice(start, end).map(glyph => glyph.char).join('');
/**
 * 断行单位：词黏上紧挨着的标点（中间没有空白），标点不会落到行首或与它的词分开。
 * 返回单位与夹在中间的空白段（给 rich-inline 当词间距）。
 */
const unitsOf = (glyphs, spans, heroPx) => {
    const pieces = [];
    const pxOf = (index) => heroPx * glyphs[index].scale;
    let pendingOpen = null;
    spans.forEach((span, index) => {
        if (span.kind === 'space') {
            if (pendingOpen)
                pieces.push({ kind: 'unit', unit: { start: pendingOpen.start, end: pendingOpen.end, text: textOf(glyphs, pendingOpen.start, pendingOpen.end), px: pxOf(pendingOpen.start) } });
            pendingOpen = null;
            pieces.push({ kind: 'space', span });
            return;
        }
        const previous = pieces[pieces.length - 1];
        const next = spans[index + 1];
        if (span.kind === 'punct') {
            const text = textOf(glyphs, span.start, span.end);
            if (OPENING.test(text) && next && next.kind !== 'space') {
                pendingOpen = pendingOpen ? { ...pendingOpen, end: span.end } : span;
                return;
            }
            if (!pendingOpen && previous?.kind === 'unit' && previous.unit.end === span.start) {
                previous.unit.end = span.end;
                return;
            }
        }
        const start = pendingOpen ? pendingOpen.start : span.start;
        pendingOpen = null;
        pieces.push({ kind: 'unit', unit: { start, end: span.end, text: textOf(glyphs, span.start, span.end), px: pxOf(span.start) } });
    });
    const open = pendingOpen;
    if (open)
        pieces.push({ kind: 'unit', unit: { start: open.start, end: open.end, text: textOf(glyphs, open.start, open.end), px: pxOf(open.start) } });
    return pieces;
};
/**
 * 按行（列）排一行：units 的沿行长度来自 advances（逐字），rich-inline 断行（extraWidth 把 pretext 自己量的
 * 宽度补成这里的长度），maxWidth 为 Infinity 时不折行。返回每个字所在的行、在行内的起点偏移与每行长度。
 */
const breakLines = (measurer, glyphs, pieces, advances, heroPx, lines) => {
    const extentOf = (unit) => advances.slice(unit.start, unit.end).reduce((sum, advance) => sum + advance, 0);
    const items = [];
    const unitOfItem = [];
    let widest = 0;
    let widestGap = 0;
    for (const piece of pieces) {
        if (piece.kind === 'space') {
            const px = heroPx * glyphs[piece.span.start].scale;
            items.push({ text: textOf(glyphs, piece.span.start, piece.span.end), font: measurer.font(px), letterSpacing: measurer.spacing(px) });
            unitOfItem.push(null);
            // 词间距（收拢后的一个空格）：pretext 单独量空白是 0，用「a a」与「aa」之差。
            widestGap = Math.max(widestGap, measurer.natural('a a', px) - measurer.natural('aa', px));
            continue;
        }
        const { unit } = piece;
        const extent = extentOf(unit);
        items.push({
            text: unit.text,
            font: measurer.font(unit.px),
            letterSpacing: measurer.spacing(unit.px),
            break: 'never',
            extraWidth: extent - measurer.natural(unit.text, unit.px),
        });
        unitOfItem.push(unit);
        widest = Math.max(widest, extent);
    }
    const prepared = prepareRichInline(items);
    const walk = (maxWidth) => {
        const rows = [];
        walkRichInlineLineRanges(prepared, maxWidth, line => { rows.push(line); });
        return rows;
    };
    let rows = walk(Number.POSITIVE_INFINITY);
    if (lines > 1 && rows.length === 1 && rows[0].fragments.length > 1) {
        // 两行均衡：目标行宽 = (总宽 + 最宽的词) / 2 + 一个词间距——贪心填第一行时它不会比第二行长出一个词以上，
        // 剩下的也一定放得进第二行；pretext 确认只有两行，否则放宽一次（词间距的算法差异）。
        const total = rows[0].width;
        let target = (total + widest) / 2 + widestGap;
        if (measureRichInlineStats(prepared, target).lineCount > lines)
            target = total / 2 + widest + widestGap;
        rows = walk(target);
        if (rows.length > lines) {
            // 兜底：多出来的行并进最后一行（不会发生在正常的词宽上）。
            const kept = rows.slice(0, lines - 1);
            const rest = rows.slice(lines - 1);
            const fragments = rest.flatMap((row, index) => row.fragments.map((fragment, k) => (index > 0 && k === 0 ? { ...fragment, gapBefore: widestGap } : fragment)));
            rows = [...kept, { fragments, width: fragments.reduce((sum, f) => sum + f.gapBefore + f.occupiedWidth, 0), end: rest[rest.length - 1].end }];
        }
    }
    const row = new Array(glyphs.length).fill(-1);
    const offset = new Array(glyphs.length).fill(0);
    const lengths = rows.map(line => line.width);
    rows.forEach((line, r) => {
        let cursor = 0;
        for (const fragment of line.fragments) {
            const unit = unitOfItem[fragment.itemIndex];
            const gapStart = cursor;
            cursor += fragment.gapBefore;
            if (!unit)
                continue;
            // 词前面的空白字：落在词间距中间（行首则落在行首）。
            for (let index = unit.start - 1; index >= 0 && row[index] === -1 && glyphs[index].char.trim().length === 0; index -= 1) {
                row[index] = r;
                offset[index] = gapStart + fragment.gapBefore / 2;
            }
            // 词宽按逐字宽度分摊，字心落在各自那一份的中间。
            const extent = extentOf(unit);
            const ratio = extent > 0 ? fragment.occupiedWidth / extent : 0;
            let inner = cursor;
            for (let index = unit.start; index < unit.end; index += 1) {
                const advance = advances[index] * ratio;
                row[index] = r;
                offset[index] = inner + advance / 2;
                inner += advance;
            }
            cursor += fragment.occupiedWidth;
        }
    });
    // 行尾、行首剩下的空白：跟着前一个字（没有就后一个）。
    for (let index = 0; index < glyphs.length; index += 1) {
        if (row[index] !== -1)
            continue;
        const previous = index > 0 ? index - 1 : -1;
        if (previous >= 0 && row[previous] !== -1) {
            row[index] = row[previous];
            offset[index] = offset[previous] + (advances[previous] / 2);
        }
    }
    for (let index = glyphs.length - 1; index >= 0; index -= 1) {
        if (row[index] !== -1)
            continue;
        row[index] = index + 1 < glyphs.length && row[index + 1] !== -1 ? row[index + 1] : 0;
        offset[index] = index + 1 < glyphs.length ? Math.max(0, offset[index + 1] - advances[index + 1] / 2) : 0;
    }
    return { row, offset, lengths: lengths.length ? lengths : [0] };
};
/** 太长的单位（一个词就超过行长上限）拆成单字，标点仍黏在前一个字上。 */
const splitLongUnits = (glyphs, pieces, advances, limit, heroPx) => pieces.flatMap(piece => {
    if (piece.kind === 'space')
        return [piece];
    const { unit } = piece;
    const extent = advances.slice(unit.start, unit.end).reduce((sum, advance) => sum + advance, 0);
    if (extent <= limit || unit.end - unit.start < 2)
        return [piece];
    const out = [];
    for (let index = unit.start; index < unit.end; index += 1) {
        const char = glyphs[index].char;
        const last = out[out.length - 1];
        if (last && last.kind === 'unit' && !/[\p{L}\p{N}]/u.test(char)) {
            last.unit.end = index + 1;
            continue;
        }
        out.push({ kind: 'unit', unit: { start: index, end: index + 1, text: char, px: heroPx * glyphs[index].scale } });
    }
    return out;
});
/**
 * 一行的四种排版（横 / 竖 × 单行 / 两行）。limits 为横排行长、竖排列长的上限（逻辑像素）：只用来决定哪些词
 * 长到必须拆字；要不要折行由歌词窗口按槽位的缩放判断（shouldWrap）。
 * 横排：每行居中，行从上往下；竖排：列从右往左，各列居中对齐（列心在同一条横线上，单列时就是原来的居中竖排）。
 */
const flowLine = (measurer, glyphs, words, options) => {
    const { heroPx } = options;
    const spans = spansOf(glyphs, words);
    const basePieces = unitsOf(glyphs, spans, heroPx);
    // 横排逐字宽度：每段（词 / 标点 / 空白）的 pretext 宽度按画布宽度分摊到字上。
    const horizontal = new Array(glyphs.length).fill(0);
    for (const span of spans) {
        const px = heroPx * glyphs[span.start].scale;
        const text = textOf(glyphs, span.start, span.end);
        const width = measurer.natural(text, px);
        const canvas = glyphs.slice(span.start, span.end).reduce((sum, glyph) => sum + glyph.advance, 0);
        for (let index = span.start; index < span.end; index += 1) {
            horizontal[index] = canvas > 0 ? (width * glyphs[index].advance) / canvas : width / (span.end - span.start);
        }
    }
    // 竖排逐字长度：直立的字占一个字号（加字距），侧转的拉丁字母、数字占它的横排宽度。
    const vertical = glyphs.map((glyph, index) => (glyph.upright ? heroPx * glyph.scale * (1 + measurer.spacing(1)) : horizontal[index]));
    const variant = (orient, lines) => {
        const advances = orient === 0 ? horizontal : vertical;
        const pieces = splitLongUnits(glyphs, basePieces, advances, orient === 0 ? options.limits.horizontal : options.limits.vertical, heroPx);
        const { row, offset, lengths } = breakLines(measurer, glyphs, pieces, advances, heroPx, lines);
        const count = lengths.length;
        const along = Math.max(...lengths);
        const pitch = (orient === 0 ? ROW_PITCH : COLUMN_PITCH) * heroPx;
        const points = [];
        const spots = [];
        let inkX = 0;
        let inkY = 0;
        glyphs.forEach((glyph, index) => {
            const r = row[index];
            // 字面：横排宽 = 逐字宽度、高 = 字号；竖排宽 = 字号（侧转的字也是）、高 = 逐字长度。
            const size = heroPx * glyph.scale;
            let point;
            if (orient === 0) {
                const x = offset[index] - lengths[r] / 2;
                const rowY = (r - (count - 1) / 2) * pitch;
                point = { x, y: rowY + (1 - glyph.scale) * heroPx * 0.32 + glyph.jag };
                spots.push({ x, y: rowY });
                if (glyph.char.trim()) {
                    inkX = Math.max(inkX, Math.abs(point.x) + advances[index] / 2);
                    inkY = Math.max(inkY, Math.abs(point.y) + size / 2);
                }
            }
            else {
                const columnX = ((count - 1) / 2 - r) * pitch;
                // 各列按自己的长度居中：列心都落在同一条横线上（短的那列不贴顶）。
                const y = offset[index] - lengths[r] / 2;
                point = { x: columnX + glyph.jag * 0.8, y };
                spots.push({ x: columnX, y });
                if (glyph.char.trim()) {
                    inkX = Math.max(inkX, Math.abs(point.x) + size / 2);
                    inkY = Math.max(inkY, Math.abs(point.y) + advances[index] / 2);
                }
            }
            points.push(point);
        });
        return { points, spots, along, across: (count - 1) * pitch + heroPx, lines: count, inkWidth: inkX * 2, inkHeight: inkY * 2 };
    };
    return [
        [variant(0, 1), variant(0, MAX_LINES)],
        [variant(1, 1), variant(1, MAX_LINES)],
    ];
};
/** 在缩放 scale 下，沿行长度 along 放进 budget 要再缩多少（不放大）。 */
const fitScale = (along, budget, scale = 1) => Math.min(1, budget / Math.max(scale * along, 1e-6));
/** 这一行在缩放 scale 下要不要折：单行缩到 SINGLE_MIN_FIT 仍放不下，且折得开。 */
const shouldWrap = (flow, budget, scale) => (flow[1].lines > 1 && scale * flow[0].along * SINGLE_MIN_FIT > budget);
/** 把中心 center 放进 [lo, hi]：整块长 extent，放不下时居中。 */
const clampInto = (center, extent, lo, hi) => {
    if (extent >= hi - lo)
        return (lo + hi) / 2;
    return Math.min(hi - extent / 2, Math.max(lo + extent / 2, center));
};

// ======== components/visualizer/lumiere/text/lineClearance ========
// Copyright (c) 2026 chthollyphile
// src/components/visualizer/lumiere/text/lineClearance.ts
// 当前行与邻行之间的间隙：两件事，都是 t 的纯函数、不存历史。
//
// 1. 漂移让开当前行（源头）：每行永不停止的漂移（匀速 + 绕行）沿「堆叠轴」（横排与纵横交错是上下、竖排是左右）
//    拆开看，邻行朝当前行的那一份平滑地翻成背离（速度不变，字仍在动，只是不往当前行里钻）。当前行自己不再
//    越漂越远：沿自己的方向起步，随即绕一个半径 HOLD 的小圆，速度不变、永不停。邻行 / 当前行的身份与堆叠
//    方向都按槽位滑动的进度混合，换行时不跳。
// 2. 当前行的保护框（兜底）：当前行按它自己的位置、缩放、转角取墨迹框（外扩一个邻字的半个字号，再留一段
//    渐变的边），非当前行的字落进框里时透明度（连同光晕、闪点、径迹）压到 PROTECT_FLOOR，边上平滑过渡。
//    换行时新旧当前行的框按滑动进度交接（权重 = 两次换行的缓动进度之差，求和恒为 1，连续）。
/** 软绝对值的圆角（高度单位）：邻行的漂移在「朝向 / 背离」当前行之间换向时速度也连续。 */
const AWAY_SOFTNESS = 0.005;
/** 当前行漂移绕的小圆半径（高度单位）：最多离槽位 2 × HOLD，比邻行与当前行之间的空隙小得多。 */
const HOLD = 0.018;
/** 平滑的 |a|（a = 0 时为 0，远处比 |a| 小 AWAY_SOFTNESS）。 */
const softAbs = (a) => Math.sqrt(a * a + AWAY_SOFTNESS * AWAY_SOFTNESS) - AWAY_SOFTNESS;
/**
 * 邻行一条轴上的漂移（高度单位）：away 为这一行背离当前行的方向（±1）× 它作为邻行的权重（0..1）。
 * 朝当前行的那一份平滑地翻成背离（|a| 的软版本），背离的那一份不变；away = 0 时原样返回。
 */
const awayDrift = (drift, away) => {
    if (away === 0)
        return drift;
    const sign = away > 0 ? 1 : -1;
    const along = drift * sign;
    return drift + Math.abs(away) * (softAbs(along) - along) * sign;
};
/**
 * 当前行的匀速漂移（不含绕行）在 axis（0 = x，1 = y）上的分量：速度 (vx, vy)、从开始唱起 age 秒。
 * 起步时与匀速漂移一样（沿自己的方向），随即向左拐进半径 HOLD 的圆，速度大小不变。
 */
const heldDrift = (vx, vy, age, axis) => {
    const speed = Math.hypot(vx, vy);
    if (speed < 1e-9)
        return 0;
    const phi = (speed * age) / HOLD;
    const along = HOLD * Math.sin(phi);
    const turn = HOLD * (1 - Math.cos(phi));
    const ux = vx / speed;
    const uy = vy / speed;
    return axis === 0 ? along * ux - turn * uy : along * uy + turn * ux;
};
/** 保护框里非当前行的字最暗压到原来的多少。 */
const PROTECT_FLOOR = 0.4;
/** 保护框外扩的渐变边宽（以当前行的字号为单位）。 */
const PROTECT_MARGIN = 0.5;
const createProtectBox = () => ({ line: -1, x: 0, y: 0, cos: 1, sin: 0, halfW: 0, halfH: 0, margin: 1, weight: 0 });
const smooth__4 = (value) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
};
/**
 * 第 line 行一个字（字心 x, y，半个字号 half）被保护的程度 0..1：在别的行的框里（转到那一行自己的方向上看，
 * 字的方块碰到墨迹框就算在里面）为 1，出了框按渐变边平滑降到 0；多个框按交接权重相加。自己那一行的框不算。
 */
const protectionAt = (boxes, count, line, x, y, half) => {
    let protect = 0;
    for (let i = 0; i < count; i += 1) {
        const box = boxes[i];
        if (box.line === line || box.weight <= 0)
            continue;
        const dx = x - box.x;
        const dy = y - box.y;
        const u = Math.abs(dx * box.cos + dy * box.sin) - box.halfW - half;
        const v = Math.abs(dy * box.cos - dx * box.sin) - box.halfH - half;
        const outside = u > 0 && v > 0 ? Math.hypot(u, v) : Math.max(u, v, 0);
        protect += box.weight * (1 - smooth__4(outside / box.margin));
    }
    return Math.min(1, protect);
};
/** 被保护程度 → 透明度倍率。 */
const protectedAlpha = (protect) => 1 - (1 - PROTECT_FLOOR) * protect;

// ======== components/visualizer/lumiere/text/windowLines ========






/** 每个字、每行（字之后）从窗口随机流里取几个值：改了 buildLineView 里的取值就要同步改这里（单测会查）。 */
const GLYPH_RANDOM_DRAWS = 19;
const LINE_RANDOM_DRAWS = 4;
const buildLineMetas = (lines) => {
    let offset = 0;
    return lines.map(line => {
        const graphemes = splitLyricGraphemes(line.fullText);
        const meta = { line, graphemes, randomOffset: offset, timing: undefined, keywordColors: undefined };
        offset += graphemes.length * GLYPH_RANDOM_DRAWS + LINE_RANDOM_DRAWS;
        return meta;
    });
};
/** 某行的逐字时刻（第一次用到时算，之后缓存）。 */
const lineTimingOf = (meta) => {
    if (!meta.timing) {
        const { line, graphemes } = meta;
        const timings = buildGlyphTimings(line);
        const sung = graphemes.flatMap((char, index) => (char.trim().length === 0 ? [] : [timings[index] ?? { start: line.startTime, end: line.endTime }]));
        meta.timing = {
            timings,
            singStart: sung.length ? Math.min(...sung.map(timing => timing.start)) : line.startTime,
            singEnd: sung.length ? Math.max(...sung.map(timing => timing.end)) : line.endTime,
        };
    }
    return meta.timing;
};
/** 某行的关键字色（第一次用到时匹配，之后缓存）。 */
const keywordColorsOf = (meta, keywords) => {
    if (meta.keywordColors === undefined) {
        meta.keywordColors = keywords && keywords.length > 0 ? resolveGlyphKeywordColors(meta.line.fullText, keywords) : null;
    }
    return meta.keywordColors;
};
/**
 * 构建第 lineIndex 行（不挂到任何层上，由窗口按行号插进去）。rng 必须已经跳到这一行的起点（meta.randomOffset），
 * 取值的个数固定为 GLYPH_RANDOM_DRAWS × 字数 + LINE_RANDOM_DRAWS。
 */
const buildLineView = (context, lineIndex, meta, rng) => {
    const { pixi, heroPx, sprites } = context;
    const { line } = meta;
    const { timings, singStart, singEnd } = lineTimingOf(meta);
    // 字形纹理按最大的词字号画，放大的词只缩小不放大。
    const layout = buildGlyphLine(pixi, {
        text: line.fullText,
        fontPx: heroPx * MAX_WORD_SCALE,
        font: context.font,
        weight: context.weight,
        resolution: context.resolution,
        letterSpacing: context.spacing,
    });
    const keywordColors = keywordColorsOf(meta, context.keywords);
    // 分词与字号：每个字归到一个词，带上那个词的字号倍率与错落。
    const words = segmentWords(line);
    const wordSeed = `${context.seed}:${lineIndex}:${line.fullText}`;
    const scales = wordScales(words, wordSeed);
    const jags = wordJags(words, scales, wordSeed);
    const wordOf = layout.glyphs.map((_, index) => Math.max(0, words.findIndex(word => index >= word.start && index < word.end)));
    const glyphScale = (index) => scales[wordOf[index]] ?? 1;
    const glyphJag = (index) => (jags[wordOf[index]] ?? 0) * heroPx;
    // 横排：按词字号推进，基线对齐（小字往下沉一点），每个词再上下错开；竖排：按列推进，居中对齐，每个词左右错开。
    // 词宽用 pretext 量，太长时折成两行 / 两列（lineWrap），四种排版一次算好。
    const flow = flowLine(context.measurer, layout.glyphs.map((slice, index) => ({
        char: slice.char,
        scale: glyphScale(index),
        advance: (slice.charWidth / MAX_WORD_SCALE) * glyphScale(index),
        upright: slice.upright,
        jag: glyphJag(index),
    })), words, { heroPx, limits: context.limits });
    const holder = new pixi.Container();
    const haloLayer = new pixi.Container();
    const starLayer = new pixi.Container();
    holder.label = `line-${lineIndex}`;
    const glyphs = layout.glyphs.map((slice, index) => {
        const glyph = new pixi.Sprite(slice.texture);
        glyph.anchor.set(slice.anchorX, slice.anchorY);
        holder.addChild(glyph);
        // 飞行曲线：第一个控制点朝随机方向甩出去，第二个在它的基础上转过半圈左右（弧线或 S 形、打卷）。
        const a1 = rng() * Math.PI * 2;
        const a2 = a1 + Math.PI * (rng() < 0.5 ? 0.5 : 1.5) + (rng() - 0.5) * 0.8;
        const m1 = heroPx * (1.6 + rng() * 3.2);
        const m2 = heroPx * (1 + rng() * 2.6);
        // 起飞时刻与飞行时长在整段滑动里铺开（delay + duration ≤ 1，滑动结束时一定到位）。
        const duration = 0.45 + rng() * 0.4;
        const flight = {
            c1: { x: Math.cos(a1) * m1, y: Math.sin(a1) * m1 },
            c2: { x: Math.cos(a2) * m2, y: Math.sin(a2) * m2 },
            delay: rng() * (1 - duration),
            duration,
            spin: (rng() - 0.5) * 2.4,
            wobble: rng() * Math.PI * 2,
        };
        const halo = new pixi.Sprite(sprites.dot);
        halo.anchor.set(0.5);
        haloLayer.addChild(halo);
        const star = new pixi.Sprite(sprites.star);
        star.anchor.set(0.5);
        starLayer.addChild(star);
        if (slice.blank) {
            glyph.visible = false;
            halo.visible = false;
            star.visible = false;
        }
        // 漂离方向：多数向上（烟往上走），左右散开。
        const angle = -Math.PI / 2 + (rng() - 0.5) * 2.2;
        const scatterAngle = rng() * Math.PI * 2;
        const scatterDistance = 0.6 + rng() * 1.4;
        return {
            glyph,
            halo,
            star,
            timing: timings[index] ?? { start: line.startTime, end: line.endTime },
            blank: slice.blank,
            index,
            vRotation: slice.upright ? 0 : Math.PI / 2,
            flight,
            scale: glyphScale(index),
            starShape: {
                dx: -0.15 + rng() * 0.5,
                // 上下随机：多数落在字的上半，少数压到字脚下。
                dy: -0.62 + rng() ** 1.4 * 0.9,
                rotation: (rng() - 0.5) * 0.5,
                size: 0.65 + rng() * 0.7,
            },
            drift: { dx: Math.cos(angle), dy: Math.sin(angle), speed: 0.6 + rng() * 0.9, spin: (rng() - 0.5) * 2 },
            scatter: { x: Math.cos(scatterAngle) * scatterDistance, y: Math.sin(scatterAngle) * scatterDistance },
            phase: rng() * Math.PI * 2,
            keyword: slice.blank ? null : keywordColors?.[index] ?? null,
            tints: null,
        };
    });
    const spot = new pixi.Sprite(sprites.dot);
    spot.anchor.set(0.5);
    const [slow, fast] = context.driftSpeed;
    return {
        index: lineIndex,
        line,
        layout,
        holder,
        haloLayer,
        starLayer,
        glyphs,
        keywordGlyphs: glyphs.filter(glyph => glyph.keyword !== null),
        flow,
        // 落点用单独的随机流：排版换来换去时，别的随机量不受影响。
        placements: context.placementsOf(lineIndex),
        spot,
        singStart,
        singEnd,
        jitter: (rng() - 0.5) * 0.16,
        velocity: (() => {
            const angle = rng() * Math.PI * 2;
            const speed = slow + rng() * (fast - slow);
            return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
        })(),
        motionPhase: rng() * Math.PI * 2,
    };
};

// ======== components/visualizer/lumiere/text/lyricWindow ========









// 歌词镜头跟随的时间参考。
const lumiereScaleMask__16 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__16 = ((1192 ^ lumiereScaleMask__16) + Math.imul(349 ^ lumiereScaleMask__16, 306 ^ lumiereScaleMask__16))
    - ((1192 ^ lumiereScaleMask__16) + Math.imul(349 ^ lumiereScaleMask__16, 306 ^ lumiereScaleMask__16));
/** 滑动进度 phase（0..1）下这个字在曲线上的位置参数 0..1。 */
const flightProgress = (flight, phase, lag = 0) => {
    const t = Math.min(1, Math.max(0, (phase - flight.delay - lag) / flight.duration));
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
/** 起点 from → 终点 to 的贝塞尔曲线上参数 s 处的点。 */
const flightPoint = (flight, from, to, s) => {
    const u = 1 - s;
    const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
    return {
        x: a * from.x + b * (from.x + flight.c1.x) + c * (to.x + flight.c2.x) + d * to.x,
        y: a * from.y + b * (from.y + flight.c1.y) + c * (to.y + flight.c2.y) + d * to.y,
    };
};
/** 径迹记录过去多久走过的路（秒）；字到位后尾端再过这么久追上，径迹收拢消失。 */
const TRACK_TIME = 0.45 + LUMIERE_NEUTRAL_OFFSET__16;
const TRACK_SAMPLES = 20;
/**
 * 换行：从新一行开始前 LEAD 秒起，各行依次（按落到的新位置错开 SLIDE_LAG 秒）用 SLIDE 秒滑到新位置——
 * 要离场的行先走，新的当前行随后，新进来的行最后。滑动叠加在每行永不停止的漂移上，画面没有静止的时刻。
 */
const LEAD = 1.2;
const SLIDE = 1.5;
const SLIDE_LAG = { [-2]: 0, [-1]: 0.15, 0: 0.3, 1: 0.5, 2: 0.6 };
const MAX_LAG = 0.6;
/** 每行的持续漂移：恒定速度（高度单位 / 秒）范围、绕行幅度（高度单位）。 */
const DRIFT_SPEED = [0.013, 0.022];
const ORBIT = 0.03;
/** 逐字点亮的最短渐变时长（字本身很短时也不会一下跳亮）。 */
const LIGHT_UP = 0.3;
/** 追字光斑的时间平滑：对过去这段时间里的位置取平均。 */
const SPOT_WINDOW = 0.3;
const SPOT_SAMPLES = 8;
/** 未唱的行从开始滑动前多久开始聚拢、聚拢多久。 */
const GATHER_LEAD = 1.6;
const GATHER = 1.8;
const smooth__5 = (value) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
};
const easeInOutCubic__1 = (value) => {
    const t = Math.min(1, Math.max(0, value));
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
/** 换位用更柔的正弦缓动：两端的减速比三次曲线平缓，叠在漂移上不会有「停住」的感觉。 */
const easeInOutSine = (value) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, value)))) / 2;
const clamp01__6 = (value) => Math.min(1, Math.max(0, value));
const lerp__1 = (a, b, k) => a + (b - a) * k;
const lerpPoint = (a, b, k) => ({ x: lerp__1(a.x, b.x, k), y: lerp__1(a.y, b.y, k) });
/** 时刻 t 的当前行序号（-1 = 第一行之前）、滑动的线性进度 phase 与缓动后的 slide。 */
const resolveWindowCursor = (lines, time) => {
    let current = -1;
    for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].startTime - LEAD <= time)
            current = i;
        else
            break;
    }
    const phase = current < 0 ? 1 : clamp01__6((time - (lines[current].startTime - LEAD)) / SLIDE);
    return { current, phase, slide: easeInOutSine(phase) };
};
/** 某一行在这次换行里的滑动进度：按它落到的新位置（relative）错开起步。 */
const resolveLinePhase = (lines, current, relative, time) => {
    if (current < 0)
        return { phase: 1, start: Number.NEGATIVE_INFINITY };
    const start = lines[current].startTime - LEAD + (SLIDE_LAG[Math.max(-2, Math.min(2, relative))] ?? 0);
    return { phase: clamp01__6((time - start) / SLIDE), start };
};
/** 行内的演唱位置（以字为单位的连续值，0 = 第一个字之前，n = 唱完）。 */
const singingPosition = (glyphs, time) => {
    let position = 0;
    for (const glyph of glyphs)
        position += glyphProgress(glyph.timing, time);
    return position;
};
/** 连续位置 → 行内坐标：在相邻字心之间线性插值。 */
const positionToX = (glyphs, position) => {
    const n = glyphs.length;
    if (n === 0)
        return 0;
    const index = Math.min(n - 1, Math.max(0, position - 0.5));
    const lower = Math.floor(index);
    const upper = Math.min(n - 1, lower + 1);
    return glyphs[lower].center + (glyphs[upper].center - glyphs[lower].center) * (index - lower);
};
/**
 * 追字光斑在行内的坐标（沿行的方向）：对过去 window 秒里的位置取平均（仍只由 t 决定）。
 * window = 0 时就是不平滑的逐字位置。
 */
const resolveSpotX = (glyphs, time, window = SPOT_WINDOW) => {
    if (window <= 0)
        return positionToX(glyphs, singingPosition(glyphs, time));
    let x = 0;
    for (let s = 0; s < SPOT_SAMPLES; s += 1) {
        x += positionToX(glyphs, singingPosition(glyphs, time - (window * s) / (SPOT_SAMPLES - 1)));
    }
    return x / SPOT_SAMPLES;
};
/**
 * 崩解的漂离量（以字号为单位）：字点亮 delay 秒之后开始，按 age^1.5 缓慢加速。
 * 3 秒后约 0.4、5 秒约 0.9、8 秒约 1.8 个字号（× strength）：唱的时候只是开始松动，
 * 退到邻行时明显错位，淡出前才散开。
 */
const decayAmount = (decay, litAt, time) => {
    const age = time - litAt - decay.delay;
    return age > 0 ? decay.strength * 0.08 * age ** 1.5 : 0;
};
/** 崩解到多远开始淡出、多远完全看不见（以字号为单位）。 */
const DISSOLVE_FROM = 1;
const DISSOLVE_SPAN = 2;
/**
 * 纵横交错时一行的自由落点：上一行（−1）在上半圈、下一行（+1）在下半圈，角度与远近按种子；
 * 横竖都可能，横排的行倾斜得多一些。更远的位置（±2）沿同一方向再推出去、透明。
 */
const freePlacements = (random, region, nextAlpha) => {
    const placement = (upper, alpha) => {
        const angle = upper ? Math.PI * (1.12 + random() * 0.76) : Math.PI * (0.12 + random() * 0.76);
        const rx = region.w * (0.24 + random() * 0.22);
        const ry = region.h * (0.3 + random() * 0.18);
        const vertical = random() < 0.5;
        return {
            dx: Math.cos(angle) * rx,
            dy: Math.sin(angle) * ry,
            scale: 0.5 + random() * 0.2,
            alpha,
            orient: vertical ? 1 : 0,
            rotation: (random() - 0.5) * (vertical ? 0.3 : 0.7),
            wrap: 0,
        };
    };
    const farther = (slot) => ({ ...slot, dx: slot.dx * 1.45, dy: slot.dy * 1.45, scale: slot.scale * 0.85, alpha: 0 });
    const previous = placement(true, 0.9);
    const next = placement(false, nextAlpha);
    return new Map([[-1, previous], [1, next], [-2, farther(previous)], [2, farther(next)]]);
};
/**
 * 固定槽位里邻行与当前行之间的空隙（以字号为单位）：near 是 ±1 与当前行之间，far 是 ±2 与 ±1 之间。
 * 按单行单列（厚度一个字号）反推，单行时与原来的固定偏移完全一样。
 */
const STACK_GAP = {
    vertical: { previous: 0.95, next: 0.88, farPrevious: 0.78, farNext: 0.7 },
    horizontal: { previous: 0.93, next: 0.735, farPrevious: 0.56, farNext: 0.56 },
};
/**
 * 横排、竖排两种排版的固定槽位（相对文字区中心，高度单位）。relative = 行号 − 当前行号。
 * 邻行按实际厚度排开（竖排看宽度、横排看高度），折成两列 / 两行的行不会压到旁边的行：
 * across(offset, scale) 是「当前行 + offset」那一行在这个槽位缩放下垂直于行方向的厚度（高度单位）。
 */
const fixedSlot = (typography, relative, region, fontH, nextAlpha, across) => {
    const slot = (dx, dy, scale, alpha, orient) => ({ dx, dy, scale, alpha, orient, rotation: 0, wrap: 0 });
    const vertical = typography === 'vertical';
    const orient = vertical ? 1 : 0;
    if (relative === 0)
        return slot(0, 0, 1, 1, orient);
    const previous = relative < 0;
    const far = Math.abs(relative) > 1;
    const nearScale = vertical ? 0.58 : 0.52;
    const scale = far ? (vertical ? 0.48 : 0.44) : nearScale;
    const gap = STACK_GAP[vertical ? 'vertical' : 'horizontal'];
    const sign = previous ? -1 : 1;
    let offset = across(0, 1) / 2 + (previous ? gap.previous : gap.next) * fontH;
    if (far)
        offset += across(sign, nearScale) + (previous ? gap.farPrevious : gap.farNext) * fontH;
    offset += across(relative, scale) / 2;
    const alpha = previous ? (far ? 0 : 0.9) : (far ? 0 : nextAlpha);
    if (vertical) {
        // 竖排从右往左读：上一行在右、下一行在左。
        return slot(-sign * offset, sign * (far ? 0.07 : 0.03), scale, alpha, orient);
    }
    return slot(sign * region.w * (far ? 0.24 : 0.16), sign * offset, scale, alpha, orient);
};
/** 按需构建：当前行前后各画几行、往后预先建几行、离开窗口多远才释放。 */
const WINDOW_REACH = 3;
const PREBUILD = 2;
const KEEP_MARGIN = 2;
/** 纵横交错时邻行与当前行之间至少留的空隙（以字号为单位）。 */
const CROSSED_CLEARANCE = 0.5;
/** 堆叠轴：横排与纵横交错时各行上下排开（y），竖排时左右排开（x）。 */
const stackX = (kind) => (kind === 'vertical' ? 1 : 0);
/**
 * 当前行为 c、排版为 kind 时第 index 行背离当前行的方向（堆叠轴上的 ±1，当前行为 0）：横排与纵横交错时
 * 上一行在上、下一行在下；竖排右起，上一行在右、下一行在左。
 */
const awayOf = (index, c, kind) => ((index === c ? 0 : index < c ? -1 : 1) * (kind === 'vertical' ? -1 : 1));
const sameSlot = (a, b) => a.dx === b.dx && a.dy === b.dy && a.scale === b.scale
    && a.alpha === b.alpha && a.orient === b.orient && a.rotation === b.rotation && a.wrap === b.wrap;
const createLyricWindow = (pixi, options) => {
    const { height, region, heroPx, sprites, typography, decay } = options;
    const view = new pixi.Container();
    const trackLayer = new pixi.Graphics();
    const halos = new pixi.Container();
    const glyphLayer = new pixi.Container();
    const stars = new pixi.Container();
    const spots = new pixi.Container();
    view.addChild(spots, trackLayer, halos, glyphLayer, stars);
    const spacing = options.letterSpacing ?? 0;
    const nextAlpha = options.neighbors >= 2 ? 0.95 : 0;
    // 长度上限：横排用画框内的整个宽度（纵横交错留一成给四周的行），竖排用画框内的整个高度（避开底部字幕）。
    // 文字区只决定中心，不再限制行长。
    const band = frameBand(options.width, height);
    const columnCap = (band.bottom - band.top) * height;
    const maxWidthOf = (kind) => (band.right - band.left) * height * (kind === 'crossed' ? 0.9 : 1);
    const measurer = createTextMeasurer(options.font, options.weight, spacing);
    const KEYWORDS = options.keywords && options.keywords.length > 0 ? options.keywords : undefined;
    const metas = buildLineMetas(options.lines);
    const lineCount = options.lines.length;
    /** 已构建的行（没建的是 null）与它们的行号（升序）：各层里的子节点按行号排，画的先后与构建顺序无关。 */
    const views = new Array(lineCount).fill(null);
    const built = [];
    const buildContext = {
        pixi,
        font: options.font,
        weight: options.weight,
        resolution: options.resolution,
        heroPx,
        spacing,
        seed: options.seed,
        sprites,
        measurer,
        limits: { horizontal: maxWidthOf('horizontal'), vertical: columnCap },
        keywords: KEYWORDS,
        driftSpeed: DRIFT_SPEED,
        placementsOf: (lineIndex) => freePlacements(createRng(`${options.seed}:placements:${lineIndex}`), region, nextAlpha),
    };
    let tintedFor = null;
    /** 把 child 插到 parent 里行号 lineIndex 该在的位置（parent 里每个已构建的行各有一个子节点）。 */
    const insertByLine = (parent, child, position) => {
        if (position >= parent.children.length)
            parent.addChild(child);
        else
            parent.addChildAt(child, position);
    };
    /** 构建第 index 行：随机流跳到这一行的起点，结果与从第一行起顺序构建时一样。 */
    const buildLine = (index) => {
        const meta = metas[index];
        const lineView = buildLineView(buildContext, index, meta, createRngAt(`${options.seed}:window`, meta.randomOffset));
        let position = 0;
        while (position < built.length && built[position] < index)
            position += 1;
        built.splice(position, 0, index);
        insertByLine(glyphLayer, lineView.holder, position);
        insertByLine(halos, lineView.haloLayer, position);
        insertByLine(stars, lineView.starLayer, position);
        insertByLine(spots, lineView.spot, position);
        if (tintedFor)
            for (const glyph of lineView.keywordGlyphs)
                glyph.tints = keywordTints(tintedFor, glyph.keyword);
        views[index] = lineView;
        return lineView;
    };
    const releaseLine = (index) => {
        const lineView = views[index];
        if (!lineView)
            return;
        views[index] = null;
        built.splice(built.indexOf(index), 1);
        for (const item of [lineView.holder, lineView.haloLayer, lineView.starLayer, lineView.spot]) {
            item.parent?.removeChild(item);
            item.destroy({ children: true });
        }
        lineView.layout.destroy();
    };
    const lineOf = (index) => views[index] ?? buildLine(index);
    const fontH = heroPx / height;
    const driftScale = options.drift ?? 1;
    /** 第 c 行成为当前行时的排版（c = −1 即第一行之前，按第一行的排版）。 */
    const typographyAt = (c) => (options.typographyOf ? options.typographyOf(Math.max(0, Math.min(lineCount - 1, c))) : typography);
    /**
     * 第 index 行在槽位缩放 scale、朝向 orient 下落定的样子：单行缩到 SINGLE_MIN_FIT 还放不下才折，
     * 折了还放不下再整体缩小（邻行本身已经小，很少需要折）。
     */
    const settle = (index, kind, orient, scale) => {
        const flow = lineOf(index).flow[orient];
        const budget = orient === 1 ? columnCap : maxWidthOf(kind);
        const wrap = shouldWrap(flow, budget, scale) ? 1 : 0;
        const variant = flow[wrap];
        return { wrap, variant, scale: scale * fitScale(variant.along, budget, scale) };
    };
    /** 第 index 行垂直于行方向的厚度（高度单位，已缩放）；不存在的行（第一行之前）按一个字号。 */
    const acrossOf = (index, kind, orient, scale) => {
        if (index < 0 || index >= lineCount)
            return fontH * scale;
        const settled = settle(index, kind, orient, scale);
        return (settled.variant.across / height) * settled.scale;
    };
    /** 把当前行整块放进画框的偏移（高度单位）：整个窗口一起挪，行距不变。文字区的中心仍是锚点。 */
    const windowShift = (current, kind) => {
        if (current < 0 || current >= lineCount)
            return { x: 0, y: 0 };
        const orient = kind === 'vertical' ? 1 : 0;
        const { variant, scale } = settle(current, kind, orient, 1);
        const w = (variant.inkWidth / height) * scale;
        const h = (variant.inkHeight / height) * scale;
        return {
            x: clampInto(region.cx, w, band.left, band.right) - region.cx,
            y: clampInto(region.cy, h, band.top, band.bottom) - region.cy,
        };
    };
    // 槽位是（行、当前行、排版）的纯函数，每帧会反复查（径迹还要回溯几十个时刻），缓存起来。
    const slotCache = new Map();
    /** 当前行为 current、排版为 kind 时第 index 行的槽位（含把当前行放进画框的整体偏移与这一行的折行）。 */
    const slotOf = (index, current, kind) => {
        const key = `${index}|${current}|${kind}`;
        const cached = slotCache.get(key);
        if (cached)
            return cached;
        const view = lineOf(index);
        const clamped = Math.max(-2, Math.min(2, index - current));
        const shift = windowShift(current, kind);
        let slot;
        let wrap = null;
        if (kind === 'crossed' && clamped !== 0) {
            // 纵横交错：自由落点在当前行的上半圈 / 下半圈，但要让开当前行（折成两行时更高）：邻行整块的上下边
            // 与当前行之间至少留一段空隙。竖着的邻行很长，当前行与画框之间放不下时先折成两列，还放不下再缩小。
            const base = view.placements.get(clamped);
            const baseOrient = base.orient >= 0.5 ? 1 : 0;
            const sign = base.dy < 0 ? -1 : 1;
            const currentHalf = current >= 0 && current < lineCount
                ? (() => {
                    const settled = settle(current, kind, 0, 1);
                    return (settled.variant.inkHeight / height) * settled.scale / 2;
                })()
                : fontH / 2;
            const gap = fontH * CROSSED_CLEARANCE;
            const centerY = region.cy + shift.y;
            const room = sign < 0 ? centerY - currentHalf - gap - band.top : band.bottom - (centerY + currentHalf + gap);
            const flow = view.flow[baseOrient];
            const budget = baseOrient === 1 ? columnCap : maxWidthOf(kind);
            /** 在缩放 s、折法 w 下这一行整块（含落点的倾斜）的高度（高度单位）。 */
            const tilt = Math.abs(base.rotation) + 0.03;
            const heightOf = (w, s) => (((flow[w].inkHeight * Math.cos(tilt) + flow[w].inkWidth * Math.sin(tilt)) / height) * s * fitScale(flow[w].along, budget, s));
            let scale = base.scale;
            let w = settle(index, kind, baseOrient, scale).wrap ? 1 : 0;
            if (baseOrient === 1 && room > 0) {
                if (w === 0 && flow[1].lines > 1 && heightOf(0, scale) > room)
                    w = 1;
                const tall = heightOf(w, scale);
                if (tall > room)
                    scale = Math.max(base.scale * 0.5, scale * (room / tall));
            }
            wrap = w;
            const clearance = currentHalf + gap + heightOf(w, scale) / 2;
            const dy = sign * Math.max(Math.abs(base.dy), clearance);
            // 竖着的邻行折成两列时更宽，沿原来的方向再推开多出来的那一半。
            const wider = baseOrient === 1 ? Math.max(0, acrossOf(index, kind, 1, scale) - fontH * scale) / 2 : 0;
            slot = { ...base, scale, dy, dx: base.dx + Math.sign(base.dx) * wider };
        }
        else {
            const orient = kind === 'vertical' ? 1 : 0;
            slot = fixedSlot(kind === 'crossed' ? 'horizontal' : kind, clamped, region, fontH, nextAlpha, (offset, scale) => (acrossOf(offset === clamped ? index : current + offset, kind, orient, scale)));
        }
        const result = {
            ...slot,
            dx: slot.dx + shift.x,
            dy: slot.dy + shift.y,
            wrap: wrap ?? settle(index, kind, slot.orient >= 0.5 ? 1 : 0, slot.scale).wrap,
        };
        slotCache.set(key, result);
        return result;
    };
    /**
     * 时刻 time 起还没「走完多时」的第一次换行（current + 1 = 全都走完了）：更早的换行对每一行都已滑完、径迹也已收拢
     * （按最晚的起步 SLIDE_LAG 估，保守）。行的开始时刻是升序的，从当前行往回找几步就到。
     */
    const firstLiveChange = (time, current) => {
        let c = current;
        while (c >= 0 && options.lines[c].startTime - LEAD + MAX_LAG + SLIDE + TRACK_TIME > time)
            c -= 1;
        return c + 1;
    };
    /**
     * 第 index 行在时刻 time 的位置（逻辑像素）、缩放、转角、透明度与槽位切换信息。纯函数，径迹与爆闪也用它。
     *
     * 叠加式：位置 = 第一行开始前的槽位 + Σ 每次换行带来的槽位差 × 这次换行对这一行的缓动进度。
     * 每次换行对各行错开起步（离场的先走），两行间隔很短、上一次还没走完时也连续，不会跳。
     * 已经走完多时的换行进度都是 1，前后相消（槽位差首尾相接），所以直接从它们之后的槽位起叠：
     * 与从头叠加结果相同，只用到当前行附近几行的排版（整首歌一个单元时不用构建前面所有的行）。
     */
    const lineTransform = (index, time) => {
        const view = lineOf(index);
        const { current } = resolveWindowCursor(options.lines, time);
        const first = firstLiveChange(time, current);
        const base = first - 1;
        const initialKind = typographyAt(base);
        const initial = slotOf(index, base, initialKind);
        let dx = initial.dx, dy = initial.dy, scale = initial.scale, rotation = initial.rotation;
        let alpha = initial.alpha, orient = initial.orient, wrap = initial.wrap;
        // 最近一次正在（或刚刚）作用于这一行的换行：给字的飞行曲线与径迹用。
        let latest = null;
        let restOrient = initial.orient;
        let restWrap = initial.wrap;
        const moves = [];
        // 随排版变化的量（宽度上限、错落）也跟着换行叠加，排版切换时不跳。
        let widthCap = maxWidthOf(initialKind);
        let jitterOn = initialKind === 'crossed' ? 0 : 1;
        // 间隙：背离当前行的方向（x、y 各一份，堆叠轴上的 ±1 × 作为邻行的权重）与作为当前行的权重，
        // 同样按换行叠加，换行与排版切换时连续。
        let awayX = stackX(initialKind) * awayOf(index, base, initialKind);
        let awayY = (1 - stackX(initialKind)) * awayOf(index, base, initialKind);
        let hero = index === base ? 1 : 0;
        // 槽位差为 0 的换行直接跳过。
        const last = Math.min(lineCount - 1, current);
        for (let c = first; c <= last; c += 1) {
            const beforeKind = typographyAt(c - 1);
            const afterKind = typographyAt(c);
            const before = slotOf(index, c - 1, beforeKind);
            const after = slotOf(index, c, afterKind);
            const kindChanged = beforeKind !== afterKind;
            if (sameSlot(before, after) && !kindChanged)
                continue;
            const { phase, start } = resolveLinePhase(options.lines, c, index - c, time);
            const k = easeInOutSine(phase);
            if (kindChanged) {
                widthCap += (maxWidthOf(afterKind) - maxWidthOf(beforeKind)) * k;
                jitterOn += ((afterKind === 'crossed' ? 0 : 1) - (beforeKind === 'crossed' ? 0 : 1)) * k;
            }
            const awayBefore = awayOf(index, c - 1, beforeKind);
            const awayAfter = awayOf(index, c, afterKind);
            awayX += (stackX(afterKind) * awayAfter - stackX(beforeKind) * awayBefore) * k;
            awayY += ((1 - stackX(afterKind)) * awayAfter - (1 - stackX(beforeKind)) * awayBefore) * k;
            hero += ((index === c ? 1 : 0) - (index === c - 1 ? 1 : 0)) * k;
            // 透明度不跟位移同一条曲线：要淡出的先走（前 60%），要淡入的后到（后 60%）。
            const fade = after.alpha < before.alpha
                ? easeInOutCubic__1(phase / 0.6)
                : after.alpha > before.alpha ? easeInOutCubic__1((phase - 0.4) / 0.6) : k;
            dx += (after.dx - before.dx) * k;
            dy += (after.dy - before.dy) * k;
            scale += (after.scale - before.scale) * k;
            rotation += (after.rotation - before.rotation) * k;
            alpha += (after.alpha - before.alpha) * fade;
            orient += (after.orient - before.orient) * phase;
            wrap += (after.wrap - before.wrap) * k;
            if (phase > 0)
                latest = { before, after, phase, start, kind: afterKind };
            if (phase >= 1) {
                restOrient = after.orient;
                restWrap = after.wrap;
                moves.length = 0;
            }
            else if (phase > 0) {
                moves.push({
                    toOrient: after.orient,
                    toWrap: after.wrap,
                    phase,
                    fly: options.alwaysFly === true || afterKind === 'crossed' || before.orient !== after.orient,
                });
            }
        }
        // 太长时整体缩小，不出画框（横排看宽度、竖排看长度；单行 / 折行按折行程度混合）。
        const o = clamp01__6(orient);
        const w = clamp01__6(wrap);
        const [hSingle, hWrapped] = view.flow[0];
        const [vSingle, vWrapped] = view.flow[1];
        const fitH = lerp__1(fitScale(hSingle.along, widthCap, scale), fitScale(hWrapped.along, widthCap, scale), w);
        const fitV = lerp__1(fitScale(vSingle.along, columnCap, scale), fitScale(vWrapped.along, columnCap, scale), w);
        const fitted = scale * lerp__1(fitH, fitV, o);
        // 错落只作用在固定槽位的邻行上（横排时横向、竖排时纵向），当前行居中。
        const jitter = jitterOn * view.jitter * region.w * clamp01__6((1 - scale) / 0.5);
        // 固定槽位里每一行沿自己的方向不出画框（横排左右、竖排上下）：邻行排在垂直于行的方向上，挪了也压不到
        // 当前行。纵横交错的邻行是自由落点，沿行挪可能挪进当前行里，保持原样（和错落一样只作用在固定槽位上）。
        // 漂移不算在里面，照常漂。
        const baseX = region.cx + dx + jitter * (1 - orient);
        const baseY = region.cy + dy + jitter * 0.5 * orient;
        const alongH = (lerp__1(hSingle.inkWidth, hWrapped.inkWidth, w) / height) * fitted;
        const alongV = (lerp__1(vSingle.inkHeight, vWrapped.inkHeight, w) / height) * fitted;
        const x = baseX + (clampInto(baseX, alongH, band.left, band.right) - baseX) * (1 - o) * jitterOn;
        const y = baseY + (clampInto(baseY, alongV, band.top, band.bottom) - baseY) * o * jitterOn;
        // 永不停止的漂移：以这一行开始唱的时刻为零点匀速漂（唱的时候正好在槽位上），再叠一点绕行、摆动与呼吸。
        // 让开当前行（lineClearance）：邻行朝当前行的那一份翻成背离；当前行不越漂越远，绕一个小圆，速度不变。
        const age = time - view.line.startTime;
        const m = view.motionPhase;
        const { x: vx, y: vy } = view.velocity;
        const orbitX = Math.sin(time * 0.52 + m) * ORBIT;
        const orbitY = Math.cos(time * 0.41 + m * 1.3) * ORBIT * 0.7;
        const held = clamp01__6(hero);
        const driftX = lerp__1(awayDrift((vx * age + orbitX) * driftScale, awayX), (heldDrift(vx, vy, age, 0) + orbitX) * driftScale, held);
        const driftY = lerp__1(awayDrift((vy * age + orbitY) * driftScale, awayY), (heldDrift(vx, vy, age, 1) + orbitY) * driftScale, held);
        const settledOrient = latest ? latest.after.orient : initial.orient;
        const settledWrap = latest ? latest.after.wrap : initial.wrap;
        return {
            current,
            x: (x + driftX) * height,
            y: (y + driftY) * height,
            scale: fitted * (1 + 0.025 * Math.sin(time * 0.43 + m)),
            rotation: rotation + 0.03 * Math.sin(time * 0.23 + m * 0.7),
            alpha: clamp01__6(alpha),
            fromOrient: latest ? latest.before.orient : settledOrient,
            toOrient: settledOrient,
            fromWrap: latest ? latest.before.wrap : settledWrap,
            toWrap: settledWrap,
            wrap: w,
            orient: o,
            phase: latest ? latest.phase : 1,
            // 纵横交错时每次换槽位都飞；另两种排版只在朝向变化时飞。
            fly: latest !== null && latest.phase < 1
                && (options.alwaysFly === true || latest.kind === 'crossed' || latest.before.orient !== latest.after.orient),
            slideStart: latest ? latest.start : Number.NEGATIVE_INFINITY,
            restOrient,
            restWrap,
            moves,
        };
    };
    /**
     * 字在行内的位置（未缩放）、转角与缩放：换槽位时沿自己的贝塞尔曲线飞过去，途中缩小、转动、发亮
     * （flying 为飞行强度 0..1）。再加上聚合、崩解与呼吸。
     */
    const glyphLocal = (view, glyph, time, transform) => {
        const at = (orient, wrap) => view.flow[orient >= 0.5 ? 1 : 0][wrap >= 0.5 ? 1 : 0].points[glyph.index];
        // 从上一次走完的换位的终点出发，依次叠上还在进行的换位：每一次都从上一次此刻的位置起飞（或滑过去），
        // 前一次还没飞完就换行时，字接着从它在曲线上的位置出发，不会跳回起点。
        let point = at(transform.restOrient, transform.restWrap);
        let orientation = transform.restOrient;
        let flying = 0;
        for (const move of transform.moves) {
            const target = at(move.toOrient, move.toWrap);
            if (move.fly) {
                const s = flightProgress(glyph.flight, move.phase);
                point = flightPoint(glyph.flight, point, target, s);
                orientation = lerp__1(orientation, move.toOrient, s);
                flying = Math.max(flying, Math.sin(Math.PI * s));
            }
            else {
                // 不飞的时候，单行与折行之间（邻行变成当前行、需要折开时）字随滑动缓动过去。
                const k = easeInOutSine(move.phase);
                point = lerpPoint(point, target, k);
                orientation = lerp__1(orientation, move.toOrient, k);
            }
        }
        let x = point.x;
        let y = point.y;
        let rotation = glyph.vRotation * orientation + glyph.flight.spin * flying;
        const pulse = 1 - 0.28 * flying;
        // 聚合：未唱的行从散开的位置逐渐收拢。
        const gather = smooth__5((time - (view.line.startTime - LEAD - GATHER_LEAD)) / GATHER);
        const scatter = (1 - gather) ** 2 * decay.strength;
        x += glyph.scatter.x * heroPx * scatter;
        y += glyph.scatter.y * heroPx * scatter;
        // 崩解：点亮一会儿之后沿各自的方向漂离、转动。
        const amount = decayAmount(decay, glyph.timing.start, time) * glyph.drift.speed;
        x += glyph.drift.dx * heroPx * amount;
        y += glyph.drift.dy * heroPx * amount;
        rotation += glyph.drift.spin * amount * 0.18;
        // 呼吸：一直有一点轻微晃动。
        const breath = heroPx * 0.022 * Math.min(1, decay.strength + 0.3);
        x += Math.sin(time * 0.9 + glyph.phase) * breath;
        y += Math.cos(time * 1.13 + glyph.phase * 1.7) * breath;
        return { x, y, rotation, gather, flying, scale: glyph.scale * pulse };
    };
    /** 行内坐标 → 画面坐标（行的转角、缩放、位置）。 */
    const toWorld = (transform, point) => {
        const cos = Math.cos(transform.rotation);
        const sin = Math.sin(transform.rotation);
        return {
            x: transform.x + (point.x * cos - point.y * sin) * transform.scale,
            y: transform.y + (point.x * sin + point.y * cos) * transform.scale,
        };
    };
    /**
     * 径迹：字在画面上过去 TRACK_TIME 秒里真正走过的路（叠加了行本身的移动、转动与缩放），加一点
     * 垂直方向的抖动，像云室里的粒子径迹；字到位后尾端追上来，径迹收拢消失。只画这一次滑动开始之后的部分。
     */
    const drawTracks = (index, view, time, transform, alpha, color) => {
        if (alpha <= 0.003 || !Number.isFinite(transform.slideStart))
            return;
        if (time > transform.slideStart + SLIDE + TRACK_TIME)
            return;
        const from = Math.max(transform.slideStart, time - TRACK_TIME);
        if (time - from < 1e-3)
            return;
        const samples = Array.from({ length: TRACK_SAMPLES + 1 }, (_, i) => from + ((time - from) * i) / TRACK_SAMPLES);
        const transforms = samples.map(sample => lineTransform(index, sample));
        if (!transforms.some(sample => sample.fly))
            return;
        const width = 1.2;
        view.glyphs.forEach(glyph => {
            if (glyph.blank)
                return;
            let length = 0;
            let previous = null;
            let fontPx = heroPx;
            let flying = 0;
            samples.forEach((sample, i) => {
                const local = glyphLocal(view, glyph, sample, transforms[i]);
                const world = toWorld(transforms[i], local);
                fontPx = heroPx * transforms[i].scale * local.scale;
                flying = local.flying;
                const wobble = Math.sin(i * 0.9 + glyph.flight.wobble + sample * 6) * heroPx * 0.02;
                const x = world.x + wobble;
                const y = world.y - wobble * 0.6;
                if (previous) {
                    length += Math.hypot(x - previous.x, y - previous.y);
                    trackLayer.lineTo(x, y);
                }
                else {
                    trackLayer.moveTo(x, y);
                }
                previous = { x, y };
            });
            // 径迹越长（字飞得越快）越亮；几乎不动的字不留径迹。字头落在当前行的保护框里时，整条径迹跟字一起压暗
            // （与字身同一条规则，飞行途中不压）。
            const strength = Math.min(1, length / (heroPx * 3));
            const head = previous;
            const shield = head && protectCount > 0
                ? protectedAlpha(protectionAt(protectBoxes, protectCount, index, head.x, head.y, fontPx / 2) * (1 - flying))
                : 1;
            trackLayer.stroke({ width, color, alpha: strength > 0.05 ? alpha * 0.55 * strength * shield : 0, cap: 'round', join: 'round' });
        });
    };
    /** 关键字在当前光色下的颜色：光色不变时（通常整个单元都不变）只算一次；之后新建的行在构建时按它上色。 */
    const refreshKeywordTints = (litColor) => {
        if (tintedFor && tintedFor[0] === litColor[0] && tintedFor[1] === litColor[1] && tintedFor[2] === litColor[2])
            return;
        tintedFor = [litColor[0], litColor[1], litColor[2]];
        for (const index of built) {
            for (const glyph of views[index].keywordGlyphs)
                glyph.tints = keywordTints(litColor, glyph.keyword);
        }
    };
    // 当前行的保护框：每帧最多几个（换行交接时新旧当前行各一个，两次换行挨得很近时再多一两个），预先建好反复用。
    const protectBoxes = [createProtectBox(), createProtectBox(), createProtectBox(), createProtectBox()];
    let protectCount = 0;
    const frameTransforms = new Array(lineCount);
    /**
     * 这一帧的保护框：第 j 行作为当前行的权重 = 它这次换行的缓动进度 − 下一次换行的缓动进度（换行进度都是 t 的
     * 连续函数，所以权重也连续，求和为 1）。框是第 j 行此刻的墨迹框（横竖 × 单行 / 折行按当前的朝向与折行程度混合），
     * 跟着它的位置、缩放与转角。横竖转到一半时（字在飞、混合出来的框又宽又高，框边扫得很快）框渐隐，转完再回来。
     * 要先算好这一帧所有行的变换（frameTransforms）。
     */
    const buildProtectBoxes = (time, current, low) => {
        protectCount = 0;
        let later = 0;
        for (let j = current; j >= low && protectCount < protectBoxes.length; j -= 1) {
            const eased = easeInOutSine((time - (options.lines[j].startTime - LEAD)) / SLIDE);
            const transform = frameTransforms[j];
            const o = clamp01__6(transform.orient);
            const weight = (eased - later) * clamp01__6(transform.alpha) * (1 - 4 * o * (1 - o));
            later = eased;
            if (weight > 1e-4) {
                const [hSingle, hWrapped] = lineOf(j).flow[0];
                const [vSingle, vWrapped] = lineOf(j).flow[1];
                const w = transform.wrap;
                const inkW = lerp__1(lerp__1(hSingle.inkWidth, hWrapped.inkWidth, w), lerp__1(vSingle.inkWidth, vWrapped.inkWidth, w), transform.orient);
                const inkH = lerp__1(lerp__1(hSingle.inkHeight, hWrapped.inkHeight, w), lerp__1(vSingle.inkHeight, vWrapped.inkHeight, w), transform.orient);
                const box = protectBoxes[protectCount];
                box.line = j;
                box.x = transform.x;
                box.y = transform.y;
                box.cos = Math.cos(transform.rotation);
                box.sin = Math.sin(transform.rotation);
                box.halfW = (inkW / 2) * transform.scale;
                box.halfH = (inkH / 2) * transform.scale;
                box.margin = PROTECT_MARGIN * heroPx * transform.scale;
                box.weight = weight;
                protectCount += 1;
            }
            if (eased >= 1)
                break;
        }
    };
    /**
     * 这一帧要画的行：当前行前后各 WINDOW_REACH 行，还在滑动（或径迹还没收拢）的换行再往前 WINDOW_REACH 行——
     * 槽位要看当前行 ±2 行的排版，更远的行透明度都是 0。只由时刻决定。
     */
    const activeRange = (time) => {
        const { current } = resolveWindowCursor(options.lines, time);
        const first = firstLiveChange(time, current);
        return {
            current,
            low: Math.max(0, Math.min(current, first) - WINDOW_REACH),
            high: Math.min(lineCount - 1, Math.max(current, 0) + WINDOW_REACH),
        };
    };
    /** 窗口外的行藏起来，离得更远的释放（留一点余量，来回拖动进度时不反复重建）。 */
    const syncBuilt = (low, high) => {
        for (let k = built.length - 1; k >= 0; k -= 1) {
            const index = built[k];
            if (index >= low && index <= high)
                continue;
            if (index < low - KEEP_MARGIN || index > high + KEEP_MARGIN) {
                releaseLine(index);
                continue;
            }
            const lineView = views[index];
            lineView.holder.visible = false;
            lineView.haloLayer.visible = false;
            lineView.starLayer.visible = false;
            lineView.spot.visible = false;
        }
    };
    /** 往后预先建几行（每帧最多一行），当前行换过去时不用当场构建。 */
    const prebuild = (high) => {
        for (let index = high + 1; index <= Math.min(lineCount - 1, high + PREBUILD); index += 1) {
            if (views[index])
                continue;
            buildLine(index);
            const lineView = views[index];
            lineView.holder.visible = false;
            lineView.haloLayer.visible = false;
            lineView.starLayer.visible = false;
            lineView.spot.visible = false;
            return;
        }
    };
    const update = (frame) => {
        const { time, beams, litColor, unlitColor, unlitAlpha, intensity } = frame;
        trackLayer.visible = frame.hideTrails !== true;
        trackLayer.clear();
        if (KEYWORDS)
            refreshKeywordTints(litColor);
        const litHex = hexOf(litColor);
        const starHex = hexOf(mixRgb(litColor, WHITE, 0.5));
        const { low, high, current: cursor } = activeRange(time);
        syncBuilt(low, high);
        for (let index = low; index <= high; index += 1)
            frameTransforms[index] = lineTransform(index, time);
        buildProtectBoxes(time, cursor, low);
        for (let index = low; index <= high; index += 1) {
            const view = views[index];
            const transform = frameTransforms[index];
            const { current, scale } = transform;
            const lineAlpha = transform.alpha * intensity;
            const visible = lineAlpha > 0.003;
            view.holder.visible = visible;
            view.haloLayer.visible = visible;
            view.starLayer.visible = visible;
            view.holder.position.set(transform.x, transform.y);
            view.holder.scale.set(scale);
            view.holder.rotation = transform.rotation;
            const passed = index < current || (index === current && time > view.line.endTime);
            const passedAge = passed ? time - view.line.endTime : 0;
            const passedDim = passed ? lerp__1(1, 0.75, clamp01__6(passedAge / 2.5)) : 1;
            const lineFontPx = heroPx * scale;
            if (trackLayer.visible)
                drawTracks(index, view, time, transform, lineAlpha * passedDim, litHex);
            for (const glyph of view.glyphs) {
                if (glyph.blank)
                    continue;
                if (!visible) {
                    glyph.glyph.visible = false;
                    glyph.halo.visible = false;
                    glyph.star.visible = false;
                    continue;
                }
                const local = glyphLocal(view, glyph, time, transform);
                glyph.glyph.position.set(local.x, local.y);
                glyph.glyph.rotation = local.rotation;
                glyph.glyph.scale.set(local.scale / MAX_WORD_SCALE);
                // 这个字实际的字号（光晕、闪点按它定大小）。
                const fontPx = lineFontPx * local.scale;
                const { x: gx, y: gy } = toWorld(transform, local);
                const lit = smooth__5((time - glyph.timing.start) / Math.max(glyph.timing.end - glyph.timing.start, LIGHT_UP));
                const flash = flashEnvelope(glyph.timing, time, 0.45);
                const illumination = compressLight(lightAt(beams, gx / height, gy / height));
                // 闪点主要由星形小亮点表现，字身只略微提亮：字身一旦接近白色，文字组的强 bloom 会把笔画糊在一起。
                const heat = clamp01__6(illumination * 1.3 + flash * 0.2);
                // 崩解得越远越淡，像散进烟里。
                const dissolve = 1 - clamp01__6((decayAmount(decay, glyph.timing.start, time) * glyph.drift.speed - DISSOLVE_FROM) / DISSOLVE_SPAN);
                // 落进当前行的保护框就压暗（字身、光晕、闪点一起），当前行始终清楚。飞行途中的字一闪而过、本来就在发亮，
                // 不压（按飞行强度渐变）：否则它们高速穿过框边时透明度会一帧一帧地陡变。
                const shield = protectCount > 0
                    ? protectedAlpha(protectionAt(protectBoxes, protectCount, index, gx, gy, fontPx / 2) * (1 - local.flying))
                    : 1;
                const glyphAlpha = lineAlpha * passedDim * dissolve * (0.35 + 0.65 * local.gather) * shield;
                glyph.glyph.visible = true;
                // 没唱到的字也会被光柱照出来（冷色、半亮），唱到之后才是暖金色并带辉光；飞行中的字像带电粒子一样发亮。
                const revealed = Math.min(1, unlitAlpha + illumination * 0.45 + local.flying * 0.4);
                glyph.glyph.alpha = glyphAlpha * (revealed * (1 - lit) + lit * Math.min(1, 0.55 + 0.4 * heat + 0.3 * local.flying));
                // 关键字：点亮后的字身、光晕、闪点换成关键字光色（未唱时仍是冷色）。
                const tints = glyph.tints;
                const hot = mixRgb(tints ? tints.glyph : litColor, WHITE, clamp01__6(0.08 * illumination + 0.1 * flash + 0.25 * local.flying));
                const cold = mixRgb(unlitColor, litColor, illumination * 0.35);
                glyph.glyph.tint = hexOf(mixRgb(cold, hot, lit));
                // bloom 已经很强，光晕与闪点只做「局部更亮」的那一点，不能叠成一团白。
                const haloAlpha = glyphAlpha * lit * (0.03 + 0.14 * illumination + 0.08 * flash) * (tints ? KEYWORD_HALO_GAIN : 1);
                glyph.halo.visible = haloAlpha > 0.003;
                if (glyph.halo.visible) {
                    glyph.halo.position.set(gx, gy);
                    const size = fontPx * (2.2 + 0.8 * illumination);
                    glyph.halo.width = size;
                    glyph.halo.height = size * 0.9;
                    glyph.halo.alpha = haloAlpha;
                    glyph.halo.tint = tints ? tints.halo : litHex;
                }
                const starAlpha = lineAlpha * flash * 0.55 * shield;
                glyph.star.visible = starAlpha > 0.003;
                if (glyph.star.visible) {
                    // 亮点避开笔画中心，按种子上下错落；闪的过程中略微转动。
                    const star = glyph.starShape;
                    glyph.star.position.set(gx + fontPx * star.dx, gy + fontPx * star.dy);
                    glyph.star.rotation = star.rotation * (1 + (1 - flash) * 0.6);
                    const size = fontPx * star.size * (0.8 + 0.5 * flash);
                    glyph.star.width = size;
                    glyph.star.height = size;
                    glyph.star.alpha = starAlpha;
                    glyph.star.tint = tints ? tints.star : starHex;
                }
            }
            // 追字光斑：沿行内连续移动，并对过去 SPOT_WINDOW 秒的位置取平均（仍只由 t 决定），
            // 字与字之间的停顿、快慢变化都被抹平；唱前 0.3s 淡入，唱完 0.6s 淡出。
            const spotAlpha = visible
                ? lineAlpha * smooth__5((time - view.singStart + 0.3) / 0.3) * (1 - smooth__5((time - view.singEnd) / 0.6))
                : 0;
            view.spot.visible = spotAlpha > 0.003;
            if (view.spot.visible) {
                // 光斑沿行心线（横排）或列心线（竖排）按阅读顺序走：折行时走完一行（一列）跳到下一行（下一列）的开头，
                // 两个坐标用同一套插值，跳的那一下也被时间平均抹平。
                const vertical = transform.toOrient >= 0.5;
                const spotOf = (wrap) => {
                    const path = view.flow[vertical ? 1 : 0][wrap].spots;
                    return {
                        x: resolveSpotX(view.glyphs.map(glyph => ({ timing: glyph.timing, center: path[glyph.index].x })), time),
                        y: resolveSpotX(view.glyphs.map(glyph => ({ timing: glyph.timing, center: path[glyph.index].y })), time),
                    };
                };
                const local = transform.wrap <= 0 ? spotOf(0) : transform.wrap >= 1 ? spotOf(1) : lerpPoint(spotOf(0), spotOf(1), transform.wrap);
                const position = toWorld(transform, local);
                const size = lineFontPx * 5;
                view.spot.position.set(position.x, position.y);
                view.spot.rotation = transform.rotation;
                view.spot.width = size * (vertical ? 1 : 1.6);
                view.spot.height = size * (vertical ? 1.6 : 1);
                view.spot.alpha = 0.07 * spotAlpha;
                view.spot.tint = litHex;
            }
        }
        prebuild(high);
    };
    return {
        view,
        update,
        glyphTimes: lineIndex => {
            const meta = metas[lineIndex];
            if (!meta)
                return [];
            return meta.graphemes.flatMap((char, glyphIndex) => (char.trim().length === 0 ? [] : [{ glyphIndex, start: (lineTimingOf(meta).timings[glyphIndex] ?? { start: meta.line.startTime }).start }]));
        },
        glyphAnchor: (lineIndex, glyphIndex, time) => {
            const transform = lineTransform(lineIndex, time);
            const view = lineOf(lineIndex);
            const local = glyphLocal(view, view.glyphs[glyphIndex], time, transform);
            const world = toWorld(transform, local);
            return { x: world.x, y: world.y, fontPx: heroPx * transform.scale * local.scale };
        },
        lineAnchor: (lineIndex, time) => {
            const transform = lineTransform(lineIndex, time);
            return { x: transform.x, y: transform.y, scale: transform.scale, alpha: transform.alpha };
        },
        glyphKeyword: (lineIndex, glyphIndex) => {
            const meta = metas[lineIndex];
            if (!meta || (meta.graphemes[glyphIndex] ?? '').trim().length === 0)
                return null;
            return keywordColorsOf(meta, KEYWORDS)?.[glyphIndex] ?? null;
        },
        destroy: () => {
            for (let k = built.length - 1; k >= 0; k -= 1)
                releaseLine(built[k]);
            // trackLayer 是自建 context 的 Graphics，带 context: true 才会连 GPU 批数据一起放掉（见 lineArt 的 destroy）。
            view.destroy({ children: true, context: true });
        },
    };
};

// ======== components/visualizer/lumiere/lumiereUnitLayout ========
/**
 * 领头光位（文字区、字号、运镜、浮尘、星空按它）：第一个有歌词的镜头。按段落切单元时就是第一个镜头；
 * 整首歌一个单元时跳过前奏的间奏镜头，免得整首歌的字都排在间奏光位的文字区里。
 */
const resolveLumiereLeadShot = (shots) => (shots[Math.max(0, shots.findIndex(shot => shot.lines.length > 0))]);
/** 第 i 行成为当前行时用它所在镜头的排版（不在任何镜头里的行跟随前一个有歌词的镜头）。 */
const lumiereTypographyOfLine = (shots) => (lineIndex) => {
    let found = shots[0];
    for (const shot of shots) {
        if (shot.lines.includes(lineIndex))
            return shot.profile.typography;
        if (shot.lines.length > 0 && shot.lines[0] < lineIndex)
            found = shot;
    }
    return found.profile.typography;
};
/**
 * 运镜的推近进度（0..1，已缓入缓出）：没有 sections 时整个单元推一次（原来的行为）；
 * 有 sections 时每个段落推一次、下一段拉回来，往返交替——段落边界处速度为 0 且位置连续，
 * 整首歌一个单元时运镜也保持段落的节奏，而不是用 5 分钟推完一次。
 */
const resolveLumiereCameraProgress = (time, span, sections) => {
    const eased = (start, end) => {
        const linear = Math.min(1, Math.max(0, (time - start) / Math.max(end - start, 0.001)));
        return (1 - Math.cos(linear * Math.PI)) / 2;
    };
    if (!sections || sections.length === 0)
        return eased(span.startTime, span.endTime);
    let index = 0;
    for (let i = 0; i < sections.length; i += 1)
        if (sections[i].startTime <= time)
            index = i;
    const section = sections[index];
    const progress = eased(section.startTime, section.endTime);
    return index % 2 === 0 ? progress : 1 - progress;
};
/** 运镜：缓慢推近 + 平移（两端缓入缓出，见 resolveLumiereCameraProgress），再叠持续的手持感浮动。只由 time 决定。 */
const createLumiereCamera = (options) => {
    const { width, height, camera } = options;
    const motion = options.animationIntensity === 'calm' ? 0.6 : options.animationIntensity === 'chaotic' ? 1.4 : 1;
    const span = { startTime: options.startTime, endTime: options.endTime };
    return (time) => {
        const progress = resolveLumiereCameraProgress(time, span, options.sections);
        const floatX = (Math.sin(time * 0.21 + 0.4) * 0.6 + Math.sin(time * 0.53 + 1.9) * 0.4) * 0.006 * motion;
        const floatY = (Math.cos(time * 0.17 + 1.1) * 0.6 + Math.sin(time * 0.47 + 0.3) * 0.4) * 0.006 * motion;
        return {
            x: width / 2 + (camera.driftX * progress + floatX) * width,
            y: height / 2 + (camera.driftY * progress + floatY) * height,
            pivotX: width / 2,
            pivotY: height / 2,
            scale: (1 + camera.push * progress) * (1 + 0.008 * motion * Math.sin(time * 0.31 + 0.7)),
            rotation: 0.004 * motion * Math.sin(time * 0.13 + 2.1),
        };
    };
};
/** 舞台坐标（没有运镜时的画面坐标）经运镜变换后的画面坐标（与 Pixi 容器 pivot / position / scale / rotation 相同）。 */
const applyLumiereCamera = (transform, x, y) => {
    const cos = Math.cos(transform.rotation);
    const sin = Math.sin(transform.rotation);
    const dx = (x - transform.pivotX) * transform.scale;
    const dy = (y - transform.pivotY) * transform.scale;
    return { x: transform.x + dx * cos - dy * sin, y: transform.y + dx * sin + dy * cos };
};

// ======== components/visualizer/lumiere/types ========
const DEFAULT_LUMIERE_SCENE_TUNING = {
    lightIntensity: 1,
    audioResponse: 1,
    fogDensity: 1,
    darkField: 0.75,
    moteAmount: 1,
    bloom: 1,
    textBloom: 1,
    unlitOpacity: 0.22,
    windowNeighbors: 2,
    decay: 1,
    echo: 1,
    fogOctaves: 5,
    lineArt: true,
    frontBokeh: true,
    overlayFrame: true,
    trails: false,
    hideTrails: false,
    textOnly: false,
    keywordColors: true,
    themeIcons: true,
    themeColorMix: 0.3,
};
const LUMIERE_BLOOM = {
    // 图形组阈值高一些：只让光源与光柱芯发晕，光柱本身不再被抬亮，文字在光里才压得住。
    graphics: { strength: 1.5, threshold: 0.42, knee: 0.3, levels: 6, spread: 0.9 },
    // 文字组：原来的 1.9 × 调试时试出的 0.6（可读性最好）。
    text: { strength: 1.15, threshold: 0.12, knee: 0.2, levels: 5, spread: 0.95 },
};

// ======== components/visualizer/lumiere/scene ========
















// 场景交接的测量基准。
const lumiereScaleMask__17 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__17 = ((0x50b8d09c ^ lumiereScaleMask__17) + Math.imul(0xf0743965 ^ lumiereScaleMask__17, 0x29b19c8a ^ lumiereScaleMask__17))
    - ((0x50b8d09c ^ lumiereScaleMask__17) + Math.imul(0xf0743965 ^ lumiereScaleMask__17, 0x29b19c8a ^ lumiereScaleMask__17));
/** 镜头边界处光位交叉渐变多久（秒）。 */
const HANDOFF = 0.9 + LUMIERE_NEUTRAL_OFFSET__17;
/** 光源（眩光）从上一个光位的位置移到新位置用多久（秒）：比光束的交叉渐变长，走三次缓入缓出。 */
const GLARE_MOVE = 1.6;
const easeInOutCubic__2 = (value) => {
    const t = Math.min(1, Math.max(0, value));
    return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
};
const smooth__6 = (value) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
};
const lerp__2 = (a, b, k) => a + (b - a) * k;
/**
 * 光场着色器的暗场底（预乘）：folia 里恒为 0。暗场底由运行时画在所有场景之下（见 lumiereDarkField.ts），
 * 着色器的 uDark 通路保留给 lumisynth 那样由场景自己铺底的宿主。
 */
const LUMIERE_SHADER_NO_DARK = [0, 0, 0, 0];
/** 未唱字偏向的冷灰蓝。 */
const UNLIT_COOL = [0.62, 0.68, 0.8];
/** 按最亮通道拉到 1：保留色相、去掉暗度，深色的主题色（浅色主题的字色）也能当发光色用；近黑时退回 fallback。 */
const glowOf = (rgb, fallback) => {
    const peak = Math.max(...rgb);
    return peak < 0.04 ? fallback : scaleRgb(rgb, 1 / peak);
};
/**
 * 光色与字色。themeMix（「主题色占比」，0..1）为 0 时是原来的香槟金光（里面掺 18% 强调色）；
 * 越高越跟随主题：光色（光束、烟雾、辉光、线稿、画框）→ 强调色，点亮的字 → 主色，未唱的字 → 次色（没有就用主色）。
 * 主题色都先按最亮通道拉满再混，所以占比再高画面也还是「发光」的，不会画成暗块。
 */
const resolveLumierePalette = (theme, themeMix = 0) => {
    const mix = Math.min(1, Math.max(0, themeMix));
    const accent = rgbOf(theme.accentColor, CHAMPAGNE);
    let light = mixRgb(mixRgb(CHAMPAGNE, accent, 0.18), glowOf(accent, CHAMPAGNE), mix);
    const peak = Math.max(...light, 1e-3);
    light = scaleRgb(light, 1 / peak);
    const warmLit = mixRgb(light, WHITE, 0.2);
    const primary = glowOf(rgbOf(theme.primaryColor, warmLit), warmLit);
    const secondary = theme.secondaryColor ? glowOf(rgbOf(theme.secondaryColor, primary), primary) : primary;
    return {
        light,
        lit: mixRgb(warmLit, mixRgb(primary, WHITE, 0.2), mix),
        unlit: mixRgb(mixRgb(light, UNLIT_COOL, 0.55), mixRgb(secondary, UNLIT_COOL, 0.35), mix),
    };
};
/** 两套光位之间的烟雾与眩光（光束另算：两套都进光场，按强度交叉渐变）。 */
const blendRig = (from, to, k, glareK) => ({
    beams: [],
    fog: {
        density: lerp__2(from.fog.density, to.fog.density, k),
        tyndallBase: lerp__2(from.fog.tyndallBase, to.fog.tyndallBase, k),
        scale: lerp__2(from.fog.scale, to.fog.scale, k),
        driftX: lerp__2(from.fog.driftX, to.fog.driftX, k),
        driftY: lerp__2(from.fog.driftY, to.fog.driftY, k),
        warp: lerp__2(from.fog.warp, to.fog.warp, k),
        ambient: lerp__2(from.fog.ambient, to.fog.ambient, k),
    },
    // 光源移动走自己的缓动曲线（glareK），起步与到位都慢，不是匀速滑过去。
    glare: from.glare && to.glare
        ? {
            x: lerp__2(from.glare.x, to.glare.x, glareK),
            y: lerp__2(from.glare.y, to.glare.y, glareK),
            radius: lerp__2(from.glare.radius, to.glare.radius, glareK),
            intensity: lerp__2(from.glare.intensity, to.glare.intensity, glareK),
            streak: lerp__2(from.glare.streak, to.glare.streak, glareK),
        }
        : (k < 0.5 ? from.glare && { ...from.glare, intensity: from.glare.intensity * (1 - k * 2) } : to.glare && { ...to.glare, intensity: to.glare.intensity * (k * 2 - 1) }),
    // 焦散与干涉：前半段是上一个光位的（渐弱），后半段是新光位的（渐强）。
    caustic: fadeCaustic(k < 0.5 ? from.caustic : to.caustic, k < 0.5 ? 1 - k * 2 : k * 2 - 1),
    wave: k < 0.5
        ? from.wave && { ...from.wave, strength: from.wave.strength * (1 - k * 2) }
        : to.wave && { ...to.wave, strength: to.wave.strength * (k * 2 - 1) },
});
const fadeCaustic = (caustic, k) => caustic && {
    ...caustic,
    inBeam: caustic.inBeam * k,
    floor: caustic.floor && { ...caustic.floor, strength: caustic.floor.strength * k },
};
const createLumiereScene = (pixi, options) => {
    const { width, height, tuning, sprites } = options;
    const aspect = width / height;
    const palette = resolveLumierePalette(options.theme, tuning.themeColorMix);
    const shots = options.shots.length > 0 ? options.shots : [];
    // 领头光位（文字区、字号、运镜、浮尘、星空按它）：第一个有歌词的镜头（lumiereUnitLayout.ts）。
    const lead = resolveLumiereLeadShot(shots).profile;
    // 每个镜头的光位（按单元与镜头播种）。
    const rigs = shots.map((shot, index) => shot.profile.light({ aspect, random: createRng(`${options.seed}:${index}:${shot.profile.kind}:light`) }));
    const view = new pixi.Container();
    const stage = new pixi.Container();
    view.addChild(stage);
    // 图形组
    const graphics = new pixi.Container();
    // 运镜最多把边缘露出约 1.4%（手持浮动 0.6% + 呼吸缩放 0.4% + 平移超出推近的部分 + 旋转），外扩 2% 盖住。
    const overscan = Math.ceil(Math.max(width, height) * 0.02);
    const field = createLightField(pixi, width, height, overscan);
    const lineArts = shots.map((shot, index) => createLineArt(pixi, {
        height,
        spec: shot.profile.lineArt({ aspect, random: createRng(`${options.seed}:${index}:${shot.profile.kind}:art`) }),
        starTexture: sprites.star,
    }));
    const lineArtHolder = new pixi.Container();
    lineArts.forEach(layer => lineArtHolder.addChild(layer.view));
    lineArtHolder.visible = tuning.lineArt;
    // 文字区（高度单位）：整个单元按领头光位排字，图标避开它。
    const textRegion = { cx: lead.region.cx * aspect, cy: lead.region.cy, w: lead.region.w * aspect, h: lead.region.h };
    // 主题图标：每个镜头一组（没有图标或开关关掉时一组都没有，不退回默认图标），独立于线稿开关。
    const iconArts = buildShotIconArts({
        icons: options.theme.lyricsIcons,
        enabled: tuning.themeIcons && !tuning.textOnly,
        shotKinds: shots.map(shot => shot.profile.kind),
        seed: options.seed,
        aspect,
        avoid: textRegion,
    }).map(spec => createLineArt(pixi, { height, spec, starTexture: sprites.star }));
    const iconHolder = new pixi.Container();
    iconArts.forEach(layer => iconHolder.addChild(layer.view));
    const motes = createMotes(pixi, {
        width, height, seed: `${options.seed}:motes`, texture: sprites.dot,
        spec: { ...lead.motes, count: Math.round(lead.motes.count * tuning.moteAmount) },
    });
    const baseStarfall = lead.starfall ?? null;
    // 开场最多占单元的 40%；单元太短（< 2 秒）就不播开场，直接从星空已亮开始。
    const unitDuration = options.endTime - options.startTime;
    // 只画字（textOnly）时没有开场（光一开始就是满的，字按满光算明暗）。
    const canOpen = options.opening && unitDuration >= 2 && !tuning.textOnly;
    const starfallSpec = baseStarfall && canOpen
        ? { ...baseStarfall, opening: Math.min(baseStarfall.opening, Math.max(0.8, unitDuration * 0.4)) }
        : baseStarfall;
    const starfall = starfallSpec
        ? createStarfall(pixi, {
            width, height, seed: options.seed, spec: starfallSpec,
            dot: sprites.dot, star: sprites.star, streak: sprites.streak,
        })
        : null;
    // 开场：主光柱在倾泻到一半左右才点亮（光源处闪一下）。段内后续单元没有开场，星空一开始就是落定的。
    const opening = canOpen && starfallSpec !== null;
    const ignition = opening ? starfallIgnition(starfallSpec) : 0;
    const starOffset = starfallSpec && !opening ? starfallSpec.opening + 20 : 0;
    // 背景歌词：唱到的词被采集成巨大的空心字碎片，沿主光束漂下去；在光场之上、星空与线稿之下。
    const echoSpec = lead.echo ?? { size: 0.34 };
    // 关键字：匹配器整个单元一份，每行在构建时匹配一次。
    const keywords = prepareLumiereKeywords(options.theme.wordColors, tuning.keywordColors);
    const echo = tuning.echo > 0 && !tuning.textOnly
        ? createLyricEcho(pixi, {
            width,
            height,
            lines: options.lines,
            font: resolveThemeFontStack(options.theme),
            weight: resolveThemeFontWeight(options.theme, 500),
            resolution: options.resolution,
            seed: options.seed,
            size: echoSpec.size,
            opacity: tuning.echo,
            keywords,
        })
        : null;
    graphics.addChild(field.view, ...(echo ? [echo.view] : []), ...(starfall ? [starfall.view] : []), lineArtHolder, iconHolder, motes.view);
    graphics.filterArea = new pixi.Rectangle(-overscan, -overscan, width + overscan * 2, height + overscan * 2);
    // 素材插入层
    const mid = new pixi.Container();
    // 文字组。第 i 行成为当前行时，用它所在镜头的排版（不在任何镜头里的行跟随前一个镜头）。
    const typographyOfLine = lumiereTypographyOfLine(shots);
    const window = createLyricWindow(pixi, {
        width,
        height,
        lines: options.lines,
        font: resolveThemeFontStack(options.theme),
        weight: resolveThemeFontWeight(options.theme, 500),
        resolution: options.resolution,
        region: {
            cx: lead.region.cx * aspect,
            cy: lead.region.cy,
            w: lead.region.w * aspect,
            h: lead.region.h,
        },
        heroPx: lead.heroSize * height,
        neighbors: tuning.windowNeighbors,
        typography: options.typography ?? lead.typography,
        typographyOf: options.typography ? undefined : typographyOfLine,
        decay: { ...lead.decay, strength: lead.decay.strength * tuning.decay },
        alwaysFly: tuning.trails,
        seed: options.seed,
        sprites,
        letterSpacing: 0.04,
        keywords,
    });
    // 十字爆闪在字的下面（字压在光上才读得清），与字共用文字组的 bloom。只在声明了 burst 的镜头覆盖的行里引爆。
    const burstTriggers = shots.flatMap((shot, shotIndex) => {
        const spec = shot.profile.burst ?? null;
        if (!spec)
            return [];
        const covered = new Set(shot.lines);
        const color = mixRgb(palette.light, spec.tint, 0.85);
        return planBursts(spec, options.lines.map((_, lineIndex) => ({ glyphs: covered.has(lineIndex) ? window.glyphTimes(lineIndex) : [] })), `${options.seed}:${shotIndex}`).map(trigger => {
            // 落在关键字上的十字用关键字的颜色。
            const keyword = window.glyphKeyword(trigger.lineIndex, trigger.glyphIndex);
            return { ...trigger, size: trigger.size * spec.size, color: keyword ? keywordBurstColor(color, palette.light, keyword) : color };
        });
    }).sort((a, b) => a.time - b.time);
    const burst = burstTriggers.length > 0 ? createCrossBurst(pixi, { sprites }) : null;
    const text = new pixi.Container();
    if (burst)
        text.addChild(burst.view);
    text.addChild(window.view);
    // 前景
    const front = new pixi.Container();
    let frontMotes = null;
    if (lead.front && tuning.frontBokeh && !tuning.textOnly) {
        frontMotes = createMotes(pixi, {
            width, height, seed: `${options.seed}:front`, texture: sprites.bokeh, spec: lead.front,
        });
        front.addChild(frontMotes.view);
    }
    stage.addChild(graphics, mid, text, front);
    // 仅显示歌词文字：图形组整个不画（光束只在 CPU 上算，给字定明暗）。
    graphics.renderable = !tuning.textOnly;
    const bloomOf = (preset, multiplier, padding) => createBloomFilter(pixi, {
        ...preset,
        strength: preset.strength * multiplier,
        padding,
        tint: [1, 1, 1],
    });
    const graphicsBloom = bloomOf(LUMIERE_BLOOM.graphics, tuning.bloom, 0);
    const textBloom = bloomOf(LUMIERE_BLOOM.text, tuning.textBloom, 0);
    // 文字组的 bloom 区域必须固定在画面上：不给 filterArea 时 Pixi 每帧按内容包围盒取区域（取整到像素），
    // 字一动，降采样金字塔的网格原点与纹理尺寸就跟着跳，1/32 级的光晕相对字来回错位，看起来一直在抖。
    // 给一块远大于画面的区域，经运镜变换后被视口裁剪，结果每帧都正好是整个视口。区域已覆盖全画面，所以不再加 padding。
    text.filterArea = new pixi.Rectangle(-width, -height, width * 3, height * 3);
    graphics.filters = tuning.bloom > 0 ? [graphicsBloom] : [];
    text.filters = tuning.textBloom > 0 ? [textBloom] : [];
    const lightHex = hexOf(palette.light);
    const rest = { x: width / 2, y: height / 2, pivotX: width / 2, pivotY: height / 2, scale: 1, rotation: 0 };
    /** 运镜：整个单元（轨迹过渡时按原段落往返）缓慢推近 + 平移，再叠持续的手持感浮动。只由 time 决定。 */
    const camera = createLumiereCamera({
        width,
        height,
        camera: lead.camera,
        startTime: options.startTime,
        endTime: options.endTime,
        sections: options.sections,
        animationIntensity: options.theme.animationIntensity,
    });
    const activeShot = (time) => {
        let index = 0;
        for (let i = 0; i < shots.length; i += 1)
            if (shots[i].startTime <= time)
                index = i;
        return index;
    };
    const update = (time) => {
        const local = time - options.startTime;
        // 开场各段交叠：光柱在点亮前 0.4 秒就开始慢慢升起、1.6 秒才到满，不是「星落完 → 光亮 → 线稿」一段段来。
        // 没有开场的单元一开始就是满光（衔接交给运行时的转场），不从暗处升起。
        const enter = opening ? smooth__6((local - ignition + 0.4) / 1.6) : 1;
        // 点亮的一瞬光源处闪一下。
        const ignite = opening && local >= ignition ? 1.8 * Math.exp(-(local - ignition) / 0.35) : 0;
        const fadeOut = options.fadeOut;
        const exit = fadeOut ? 1 - smooth__6((time - fadeOut.start) / Math.max(fadeOut.end - fadeOut.start, 0.05)) : 1;
        const intensity = enter * exit;
        const transform = camera(time);
        stage.pivot.set(transform.pivotX, transform.pivotY);
        stage.position.set(transform.x, transform.y);
        stage.scale.set(transform.scale);
        stage.rotation = transform.rotation;
        // 正在进行的爆闪（最多 MAX_BURSTS 个），以及它们给整个光场的一下提亮。
        const events = [];
        let boost = 0;
        for (const trigger of burstTriggers) {
            const age = time - trigger.time;
            if (age < 0 || age > BURST_DURATION)
                continue;
            boost += burstLightBoost(age);
            if (events.length < MAX_BURSTS) {
                const anchor = window.glyphAnchor(trigger.lineIndex, trigger.glyphIndex, time);
                events.push({
                    age,
                    x: anchor.x,
                    y: anchor.y + anchor.fontPx * trigger.dy,
                    length: anchor.fontPx * trigger.size,
                    color: trigger.color,
                });
            }
        }
        // 一串小十字连着炸时提亮会叠加，封个顶。
        boost = Math.min(boost, 0.45);
        burst?.update(events);
        // 光位：当前镜头的光束渐强、上一个镜头的渐弱，两套都进光场（超过上限时留最亮的）。
        const audio = options.audioAt?.(time) ?? { bass: 0, treble: 0, power: 0 };
        const response = tuning.audioResponse;
        const index = activeShot(time);
        const sinceShot = time - shots[index].startTime;
        const handoff = index > 0 ? smooth__6(sinceShot / HANDOFF) : 1;
        const glareK = index > 0 ? easeInOutCubic__2(sinceShot / GLARE_MOVE) : 1;
        const drive = (shotIndex, weight) => ({
            intensity: intensity * tuning.lightIntensity * (1 + boost) * weight,
            bass: Math.min(1, audio.bass) * response,
            color: palette.light,
            local: time - shots[shotIndex].startTime,
        });
        let beams = resolveBeams(rigs[index], time, aspect, drive(index, handoff));
        let rig = rigs[index];
        if (handoff < 1) {
            const previous = resolveBeams(rigs[index - 1], time, aspect, drive(index - 1, 1 - handoff));
            beams = [...beams, ...previous].sort((a, b) => b.intensity - a.intensity).slice(0, MAX_BEAMS);
        }
        if (handoff < 1 || glareK < 1)
            rig = blendRig(rigs[index - 1], rigs[index], handoff, glareK);
        // 仅显示歌词文字（textOnly）：图形组整个不画，这些层也不必每帧更新；光束照常算（上面），字的明暗靠它。
        if (!tuning.textOnly) {
            field.update({
                beams,
                rig,
                time,
                // 整体响度让烟雾浓一点（最多 +20%）。
                fogScale: tuning.fogDensity * (1 + boost * 0.5) * (1 + 0.2 * Math.min(1, audio.power) * response),
                color: palette.light,
                glareScale: intensity * tuning.lightIntensity * (1 + boost * 1.5 + ignite),
                dark: LUMIERE_SHADER_NO_DARK,
                octaves: tuning.fogOctaves,
                // 字排在领头光位的文字区里（整个单元一份）。
                textRegion: lead.region,
            });
            echo?.update({ time, beams, color: lightHex, intensity: smooth__6(local / 1.2) * exit });
            starfall?.update(local + starOffset, time, beams, lightHex, exit);
            // 线稿：每个镜头提前 0.6 秒开始描（第一个镜头在开场时与星落、光起交叠），镜头结束后 0.8 秒淡出——
            // 上一个的淡出与下一个的描出交叠。主题图标跟着同一个镜头的节奏（不乘线稿的亮度倍率）。
            lineArts.forEach((layer, shotIndex) => {
                const shot = shots[shotIndex];
                const begin = shotIndex === 0 ? options.startTime + ignition - 0.6 : shot.startTime - 0.6;
                const out = shotIndex === shots.length - 1 ? 1 : 1 - smooth__6((time - shot.endTime) / 0.8);
                const base = smooth__6((time - begin) / 1.2) * out * exit;
                const draw = (time - begin) / 3.6;
                const fade = base * (shot.profile.artGain ?? 1);
                // 下次出现：还没开始描就是 begin，窗口里就是现在；淡出之后顺放不会再出现（回拖回来会重新 update）。
                // 藏着的线稿交给 idle 按滞回放掉 GPU 数据——轨迹过渡整首一个单元时，画过的镜头线稿不然会一直占着缓冲。
                const nextUse = time < begin ? begin : time <= shot.endTime + 0.8 ? time : Number.POSITIVE_INFINITY;
                layer.view.visible = fade > 0.003;
                if (layer.view.visible)
                    layer.update(time, draw, fade, beams, lightHex);
                else
                    layer.idle(time, nextUse);
                const icons = iconArts[shotIndex];
                if (icons) {
                    icons.view.visible = base > 0.003;
                    if (icons.view.visible)
                        icons.update(time, draw, base, beams, lightHex);
                    else
                        icons.idle(time, nextUse);
                }
            });
            // 高频让浮尘闪得更亮（最多 +50%）。
            motes.update(time, beams, lightHex, exit * (1 + 0.5 * Math.min(1, audio.treble) * response));
            frontMotes?.update(time, beams, lightHex, exit);
        }
        window.update({
            time,
            beams,
            litColor: palette.lit,
            unlitColor: palette.unlit,
            unlitAlpha: tuning.unlitOpacity,
            intensity: smooth__6(local / 0.6) * exit,
            hideTrails: tuning.hideTrails,
        });
    };
    return {
        view,
        graphics,
        mid,
        text,
        front,
        burstTimes: burstTriggers.map(trigger => trigger.time),
        lineAnchor: window.lineAnchor,
        camera,
        rest,
        update,
        destroy: () => {
            graphics.filters = [];
            text.filters = [];
            graphicsBloom.destroy();
            textBloom.destroy();
            field.destroy();
            lineArts.forEach(layer => layer.destroy());
            iconArts.forEach(layer => layer.destroy());
            motes.destroy();
            frontMotes?.destroy();
            burst?.destroy();
            starfall?.destroy();
            echo?.destroy();
            window.destroy();
            view.destroy({ children: true });
        },
    };
};

// ======== components/visualizer/lumiere/lumiereUnit ========



/** 段落的镜头 → 场景镜头：行号换成单元内的下标（options.lines = paragraph.lines）。 */
const buildLumiereSceneShots = (paragraph) => {
    const localLine = new Map(paragraph.lineIndices.map((lineIndex, index) => [lineIndex, index]));
    const shots = paragraph.shots.map(shot => ({
        profile: profileOf(shot.kind),
        startTime: shot.startTime,
        endTime: shot.endTime,
        lines: shot.lineIndices.map(index => localLine.get(index)).filter((index) => index !== undefined),
    }));
    if (shots.length === 0) {
        // 编译器保证每段至少一个镜头；防御：给一个覆盖整段的天井。
        shots.push({ profile: profileOf(''), startTime: paragraph.startTime, endTime: paragraph.endTime, lines: [] });
    }
    return shots;
};
const createLumiereUnit = (pixi, options) => {
    const { paragraph } = options;
    const scene = createLumiereScene(pixi, {
        width: options.width,
        height: options.height,
        resolution: options.resolution,
        seed: `${options.programSeed}:${paragraph.id}`,
        theme: options.theme,
        tuning: options.tuning,
        lines: paragraph.lines,
        shots: buildLumiereSceneShots(paragraph),
        startTime: paragraph.startTime,
        endTime: paragraph.endTime,
        sprites: options.sprites,
        opening: paragraph.opening,
        fadeOut: paragraph.transitionOut?.kind === 'lights-out'
            ? { start: paragraph.transitionOut.startTime, end: paragraph.transitionOut.endTime }
            : null,
        audioAt: options.audioAt,
        typography: options.typography,
        sections: paragraph.sections,
    });
    const shotAt = (time) => {
        let found = paragraph.shots[0];
        for (const shot of paragraph.shots)
            if (shot.startTime <= time)
                found = shot;
        return found;
    };
    return {
        paragraph,
        scene,
        update: time => scene.update(time),
        cameraMatrix: time => cameraBetween(scene.rest, scene.camera(time)),
        shotAt,
        destroy: () => scene.destroy(),
    };
};

// ======== components/visualizer/lumiere/lumiereSceneEntry ========



/** 模糊低于这个强度就摘掉 filter：一个挂着不用的 filter 也要多一次整屏离屏渲染。 */
const BLUR_EPSILON = 0.3;
const applyLumiereSceneQuality = (groups, quality) => {
    applyLumiereGroupQuality(groups.graphics, {
        preset: LUMIERE_BLOOM.graphics,
        multiplier: quality.bloom,
        resolution: quality.graphicsResolution,
        levelDrop: quality.bloomLevelDrop,
        passthrough: quality.passthrough,
    });
    applyLumiereGroupQuality(groups.text, {
        preset: LUMIERE_BLOOM.text,
        multiplier: quality.textBloom,
        resolution: null,
        levelDrop: 0,
        passthrough: null,
    });
};
/** 建一个段落场景（整个运行时里最贵的调用：光栅化这一段的全部歌词）。 */
const buildLumiereSceneEntry = (pixi, context, index) => {
    const { width, height } = context;
    const unit = createLumiereUnit(pixi, {
        paragraph: context.program.paragraphs[index],
        width,
        height,
        resolution: context.resolution,
        programSeed: context.program.seed,
        theme: context.theme,
        tuning: context.tuning,
        sprites: context.sprites,
        audioAt: context.audioAt,
    });
    unit.scene.text.visible = context.showText;
    applyLumiereSceneQuality(unit.scene, context.quality);
    const holder = new pixi.Container();
    holder.addChild(unit.scene.view);
    holder.pivot.set(width / 2, height / 2);
    holder.position.set(width / 2, height / 2);
    holder.zIndex = index;
    return { index, unit, holder, blur: null };
};
/** 套转场帧：透明度、以画面中心为原点的缩放、模糊（按需挂 / 摘）。 */
const applyLumiereLayerFrame = (pixi, entry, frame, blurResolution) => {
    entry.holder.alpha = frame.alpha;
    entry.holder.scale.set(frame.scale);
    if (frame.blur > BLUR_EPSILON) {
        if (!entry.blur) {
            // 模糊的内容不需要满分辨率：半分辨率跑模糊，开销是整屏的四分之一。
            entry.blur = new pixi.BlurFilter({ strength: frame.blur, quality: 3, resolution: blurResolution });
        }
        entry.blur.strength = frame.blur;
        if (!entry.holder.filters?.includes(entry.blur))
            entry.holder.filters = [entry.blur];
    }
    else if (entry.holder.filters?.length) {
        entry.holder.filters = [];
    }
};
const destroyLumiereSceneEntry = (entry, passthrough) => {
    entry.holder.parent?.removeChild(entry.holder);
    entry.holder.filters = [];
    entry.blur?.destroy();
    entry.blur = null;
    // 共享的直通 filter 先摘下来，场景的 destroy 只处理它自己建的 bloom。
    detachLumierePassthrough(entry.unit.scene.graphics, passthrough);
    entry.holder.removeChild(entry.unit.scene.view);
    entry.unit.destroy();
    entry.holder.destroy();
};

// ======== components/visualizer/lumiere/credits ========













// 片尾节奏的时间参考。
const lumiereScaleMask__18 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__18 = ((0x3e03 ^ lumiereScaleMask__18) + Math.imul(0x3b7e ^ lumiereScaleMask__18, 0x2939 ^ lumiereScaleMask__18))
    - ((0x3e03 ^ lumiereScaleMask__18) + Math.imul(0x3b7e ^ lumiereScaleMask__18, 0x2939 ^ lumiereScaleMask__18));
const smooth__7 = (value) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
};
/** 曲名开始点亮的时刻（片尾卡内的时间），以及每个字的时长上限。 */
const TITLE_START = 1.5 + LUMIERE_NEUTRAL_OFFSET__18;
const TITLE_SPAN = 2.4;
const TITLE_STEP = 0.14;
/**
 * 片尾的时间线：歌词 1.6 秒内失焦熄去（像熄灯）；片尾卡从 0.5 秒起 1.4 秒淡入、略微放大到位。
 * 卡里的光与字自己再慢慢点亮（见 update）。
 */
const resolveLumiereCreditsFrame = (time, finalEndTime) => {
    const elapsed = time - finalEndTime;
    if (elapsed <= 0)
        return { active: false, lyricAlpha: 1, lyricBlur: 0, posterAlpha: 0, posterOffsetY: 0, posterScale: 0.985 };
    const exit = smooth__7(elapsed / 1.6);
    const enter = smooth__7((elapsed - 0.5) / 1.4);
    return {
        active: true,
        lyricAlpha: 1 - exit,
        lyricBlur: exit * 10,
        posterAlpha: enter,
        posterOffsetY: 0,
        posterScale: 0.985 + 0.015 * enter,
    };
};
const clean = (value) => value?.trim() ?? '';
const hasLumiereCredits = (metadata) => Boolean(clean(metadata.title) || clean(metadata.artist) || clean(metadata.album));
/** 把曲名做成一行「歌词」：每个字依次点亮。 */
const titleLine = (title) => {
    const chars = Array.from(title);
    const step = Math.min(TITLE_STEP, TITLE_SPAN / Math.max(chars.length, 1));
    return {
        fullText: title,
        startTime: TITLE_START,
        endTime: TITLE_START + step * chars.length + 0.6,
        words: chars.map((text, i) => ({ text, startTime: TITLE_START + i * step, endTime: TITLE_START + (i + 1) * step })),
    };
};
const createLumiereCredits = (pixi, options) => {
    const { width, height, tuning, sprites, theme } = options;
    const aspect = width / height;
    const palette = resolveLumierePalette(theme, tuning.themeColorMix);
    const lightHex = hexOf(palette.light);
    const title = clean(options.metadata.title);
    const artist = clean(options.metadata.artist);
    const album = clean(options.metadata.album);
    const random = createRng('lumiere:credits');
    // 光：一束落在曲名上的天井光，外面一圈淡淡的光扇。
    const rig = {
        beams: [
            shaft({ spread: 0.1, width: 0.06, length: 0.9, intensity: 0.85 }),
            shaft({ spread: 0.3, width: 0.1, length: 0.6, softness: 0.9, intensity: 0.22, streaks: 0.85, streakFreq: 26, core: 0.3 }),
        ],
        fog: { ...FOG, density: 0.9 },
        glare: { ...GLARE, intensity: 0.8 },
    };
    const view = new pixi.Container();
    const graphics = new pixi.Container();
    const field = createLightField(pixi, width, height);
    const art = createLineArt(pixi, {
        height,
        spec: mergeSpecs(protractorHalo({ cx: aspect * 0.5, cy: 0.03, radius: 0.3, alpha: 0.55 }), viewfinderFrame({ aspect, left: 0.16, top: 0.27, right: 0.84, bottom: 0.7, delay: 0.1, alpha: 0.32 }), scatteredSparks({ aspect, count: 14, random, delay: 0.3 })),
        starTexture: sprites.star,
    });
    art.view.visible = tuning.lineArt;
    const motes = createMotes(pixi, {
        width, height, seed: 'lumiere:credits:motes', texture: sprites.dot,
        spec: { ...MOTES, count: Math.round(MOTES.count * tuning.moteAmount) },
    });
    graphics.addChild(field.view, art.view, motes.view);
    graphics.filterArea = new pixi.Rectangle(0, 0, width, height);
    const text = new pixi.Container();
    const font = resolveThemeFontStack(theme);
    const window = title
        ? createLyricWindow(pixi, {
            width,
            height,
            lines: [titleLine(title)],
            font,
            weight: resolveThemeFontWeight(theme, 600),
            resolution: options.resolution,
            region: { cx: 0.5 * aspect, cy: 0.49, w: 0.6 * aspect, h: 0.2 },
            heroPx: 0.1 * height,
            neighbors: 1,
            typography: 'horizontal',
            decay: { strength: 0, delay: 1 },
            drift: 0,
            seed: 'lumiere:credits:title',
            sprites,
            letterSpacing: 0.06,
        })
        : null;
    if (window)
        text.addChild(window.view);
    const detailStyle = (size, color, spacing) => new pixi.TextStyle({
        fontFamily: font,
        fontWeight: String(resolveThemeFontWeight(theme, 500)),
        fontSize: size,
        fill: hexOf(color),
        letterSpacing: size * spacing,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: width * 0.6,
    });
    const detailSize = Math.max(13, height * 0.028);
    const details = [
        artist ? { text: artist.toLocaleUpperCase(), y: 0.35, size: detailSize, spacing: 0.32, color: palette.lit, delay: 0.9 } : null,
        album ? { text: album, y: 0.65, size: detailSize * 0.85, spacing: 0.16, color: palette.unlit, delay: 1.2 } : null,
    ].filter(item => item !== null).map(item => {
        const label = new pixi.Text({ text: item.text, style: detailStyle(item.size, item.color, item.spacing), resolution: options.resolution });
        label.anchor.set(0.5);
        label.position.set(width / 2, item.y * height);
        label.alpha = 0;
        text.addChild(label);
        return { label, delay: item.delay + (title ? TITLE_START + Math.min(TITLE_SPAN, TITLE_STEP * Array.from(title).length) - 0.6 : 0) };
    });
    view.addChild(graphics, text);
    const graphicsBloom = createBloomFilter(pixi, { ...LUMIERE_BLOOM.graphics, strength: LUMIERE_BLOOM.graphics.strength * tuning.bloom, padding: 0, tint: [1, 1, 1] });
    const textBloom = createBloomFilter(pixi, { ...LUMIERE_BLOOM.text, strength: LUMIERE_BLOOM.text.strength * tuning.textBloom, padding: 0, tint: [1, 1, 1] });
    // 与场景的文字组相同：固定的 bloom 区域（被视口裁剪成整个画面），光晕才不会随字的运动抖动。
    text.filterArea = new pixi.Rectangle(-width, -height, width * 3, height * 3);
    graphics.filters = tuning.bloom > 0 ? [graphicsBloom] : [];
    text.filters = tuning.textBloom > 0 ? [textBloom] : [];
    // 仅显示歌词文字：片尾卡只留曲名与艺人 / 专辑，光、烟、线稿、浮尘不画。
    graphics.renderable = !tuning.textOnly;
    const update = (elapsed) => {
        const time = Math.max(0, elapsed);
        // 光从 0.6 秒起 1.6 秒升满，点亮的一瞬光源处闪一下。
        const rise = smooth__7((time - 0.6) / 1.6);
        const ignite = time >= 0.9 ? 1.2 * Math.exp(-(time - 0.9) / 0.4) : 0;
        const beams = resolveBeams(rig, time, aspect, { intensity: rise * tuning.lightIntensity, bass: 0, color: palette.light, local: time });
        if (!tuning.textOnly) {
            field.update({
                beams,
                rig,
                time,
                fogScale: tuning.fogDensity,
                color: palette.light,
                glareScale: rise * tuning.lightIntensity * (1 + ignite),
                dark: LUMIERE_SHADER_NO_DARK,
                octaves: tuning.fogOctaves,
            });
            const draw = (time - 0.8) / 3.6;
            art.view.visible = tuning.lineArt && draw > 0;
            if (art.view.visible)
                art.update(time, draw, smooth__7((time - 0.8) / 1.2), beams, lightHex);
            motes.update(time, beams, lightHex, rise);
        }
        window?.update({
            time,
            beams,
            litColor: palette.lit,
            unlitColor: palette.unlit,
            unlitAlpha: tuning.unlitOpacity,
            hideTrails: tuning.hideTrails,
            intensity: smooth__7((time - 0.4) / 0.8),
        });
        details.forEach(({ label, delay }) => {
            label.alpha = smooth__7((time - delay) / 1.4) * 0.9;
        });
    };
    update(0);
    return {
        view,
        graphics,
        text,
        update,
        destroy: () => {
            graphics.filters = [];
            text.filters = [];
            graphicsBloom.destroy();
            textBloom.destroy();
            field.destroy();
            art.destroy();
            motes.destroy();
            window?.destroy();
            view.destroy({ children: true });
        },
    };
};

// ======== components/visualizer/lumiere/lumiereCreditsLayer ========


/** 最后一句唱完前多少秒开始预建。 */
const PREBUILD_SECONDS = 4;
const INACTIVE = { active: false, lyricAlpha: 1, lyricBlur: 0, posterAlpha: 0, posterOffsetY: 0, posterScale: 1 };
const toSongMetadata = (metadata) => ({
    title: metadata.title ?? null,
    artist: metadata.artist ?? null,
    album: metadata.album ?? null,
});
class LumiereCreditsLayer {
    constructor(pixi, sprites) {
        this.pixi = pixi;
        this.sprites = sprites;
        this.credits = null;
        this.lyricEndTime = 0;
        this.holder = new pixi.Container();
        this.holder.visible = false;
    }
    get built() {
        return this.credits !== null;
    }
    hasMetadata(metadata) {
        return hasLumiereCredits(toSongMetadata(metadata));
    }
    /** 片尾时间线帧；没有片尾卡时恒为 inactive（歌词不淡出）。 */
    resolveFrame(time, program, metadata) {
        if (program.lyricEndTime === null || !this.hasMetadata(metadata))
            return INACTIVE;
        this.lyricEndTime = program.lyricEndTime;
        return resolveLumiereCreditsFrame(time, program.lyricEndTime);
    }
    needsBuild(time, program, metadata) {
        return !this.credits
            && program.lyricEndTime !== null
            && time >= program.lyricEndTime - PREBUILD_SECONDS
            && this.hasMetadata(metadata);
    }
    build(context) {
        this.invalidate();
        this.credits = createLumiereCredits(this.pixi, {
            width: context.width,
            height: context.height,
            resolution: context.resolution,
            theme: context.theme,
            metadata: toSongMetadata(context.metadata),
            tuning: context.tuning,
            sprites: this.sprites,
        });
        applyLumiereSceneQuality(this.credits, context.quality);
        this.holder.addChild(this.credits.view);
        this.holder.pivot.set(context.width / 2, context.height / 2);
    }
    applyQuality(quality) {
        if (this.credits)
            applyLumiereSceneQuality(this.credits, quality);
    }
    /** 片尾卡以画面中心缩放、上下偏移；没激活时整层不画。 */
    update(time, frame, width, height) {
        const credits = this.credits;
        this.holder.visible = Boolean(credits) && frame.active && frame.posterAlpha > 0.002;
        if (!credits || !this.holder.visible)
            return;
        this.holder.alpha = frame.posterAlpha;
        this.holder.position.set(width / 2, height / 2 + frame.posterOffsetY * height);
        this.holder.scale.set(frame.posterScale);
        credits.update(time - this.lyricEndTime);
    }
    /** 作废当前片尾卡（下次需要时重建）。 */
    invalidate() {
        if (!this.credits)
            return;
        const credits = this.credits;
        this.credits = null;
        this.holder.removeChild(credits.view);
        // 运行时挂的共享直通 filter 不归片尾卡销毁。
        credits.graphics.filters = [];
        credits.destroy();
        this.holder.visible = false;
    }
    destroy() {
        this.invalidate();
        this.holder.destroy({ children: true });
    }
}

// ======== components/visualizer/lumiere/lumiereDarkField ========

/** 主题背景亮度超过它就算浅色主题。 */
const BRIGHT_BACKGROUND_LUMINANCE = 0.18;
/** 浅色主题的暗场保底（lumisynth 定的「绘光始终在暗场里」）：亮背景透出来光就不成立了。 */
const LUMIERE_BRIGHT_DARK_FIELD_FLOOR = 0.94;
/** 暗场颜色 = 主题背景色 × 这个系数。 */
const DARK_FIELD_SHADE = 0.06;
/** 生效的暗场：深色主题 alpha = darkField；浅色主题取 max(darkField, 0.94)。颜色是主题背景色压暗。 */
const resolveLumiereDarkField = (theme, darkField) => {
    const background = rgbOf(theme.backgroundColor, [0, 0, 0]);
    const strength = Number.isFinite(darkField) ? Math.min(1, Math.max(0, darkField)) : 0;
    const bright = luminance(background) > BRIGHT_BACKGROUND_LUMINANCE;
    return {
        color: scaleRgb(background, DARK_FIELD_SHADE),
        alpha: bright ? Math.max(strength, LUMIERE_BRIGHT_DARK_FIELD_FLOOR) : strength,
    };
};
/** 运行时的暗场层：一块整屏的纯色 sprite，每帧按当前主题、尺寸和 tuning 现算（只在变化时写属性）。 */
class LumiereDarkFieldLayer {
    constructor(pixi) {
        this.theme = null;
        this.darkField = Number.NaN;
        this.width = 0;
        this.height = 0;
        this.sprite = new pixi.Sprite(pixi.Texture.WHITE);
        this.sprite.visible = false;
        this.view = this.sprite;
    }
    update(theme, darkField, width, height) {
        if (theme !== this.theme || darkField !== this.darkField) {
            this.theme = theme;
            this.darkField = darkField;
            const field = resolveLumiereDarkField(theme, darkField);
            this.sprite.tint = hexOf(field.color);
            this.sprite.alpha = field.alpha;
            this.sprite.visible = field.alpha > 0.002;
        }
        if (width !== this.width || height !== this.height) {
            this.width = width;
            this.height = height;
            this.sprite.setSize(width, height);
        }
    }
    destroy() {
        this.sprite.destroy();
    }
}

// ======== components/visualizer/lumiere/lumiereSongSwap ========
// Copyright (c) 2026 chthollyphile
// src/components/visualizer/lumiere/lumiereSongSwap.ts
// 换歌交接的两帧状态机（同 tempera 的 songSwap）：第一帧在旧歌还在画的时候把新歌当前段落的场景建好
// （stage），第二帧切过去（commit）。切的那一帧不做任何重活；中途被取消（abort）或运行时销毁时立即了结，
// 等交接的 promise 一定会 settle，pixiRuntimeHost 的 drain 循环不会挂住。
class LumiereSongSwap {
    constructor(hooks) {
        this.hooks = hooks;
        this.pending = null;
    }
    get active() {
        return this.pending !== null;
    }
    /** 已经建好、还没切过去的场景（tuning / 尺寸变化时需要一起更新或丢弃）。 */
    get staged() {
        return this.pending?.staged ?? null;
    }
    /** 丢掉已建好的 staged（它是按旧的尺寸 / tuning 建的）；交接照常在下一帧切，切的时候重建。 */
    dropStaged() {
        const pending = this.pending;
        if (!pending?.staged)
            return;
        this.hooks.discard(pending.staged);
        pending.staged = null;
    }
    /** 开始一次交接，两帧之后 resolve。 */
    begin(song, signal) {
        return new Promise(resolve => {
            const onAbort = () => this.settle(true);
            this.pending = {
                song,
                staged: null,
                prepared: false,
                settle: resolve,
                detachAbort: () => signal?.removeEventListener('abort', onAbort),
            };
            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }
    /** 每帧开头调用：第一帧 stage，第二帧 commit。 */
    advance() {
        const pending = this.pending;
        if (!pending)
            return;
        if (!pending.prepared) {
            pending.prepared = true;
            pending.staged = this.hooks.stage(pending.song);
            return;
        }
        this.settle(true);
    }
    /** 立即了结：commit 为 false（运行时正在销毁）时只丢弃 staged。 */
    settle(commit) {
        const pending = this.pending;
        if (!pending)
            return;
        this.pending = null;
        pending.detachAbort();
        if (commit)
            this.hooks.commit(pending.song, pending.staged);
        else if (pending.staged)
            this.hooks.discard(pending.staged);
        pending.settle();
    }
}

// ======== components/visualizer/lumiere/overlay ========



// 画框线段的尺度参考。
const lumiereScaleMask__19 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__19 = ((0x8f259e5f ^ lumiereScaleMask__19) + Math.imul(0xe562ea44 ^ lumiereScaleMask__19, 523 ^ lumiereScaleMask__19))
    - ((0x8f259e5f ^ lumiereScaleMask__19) + Math.imul(0xe562ea44 ^ lumiereScaleMask__19, 523 ^ lumiereScaleMask__19));
/** 画框容器（静态，只建一次；尺寸或主题变了就重建）。 */
const buildLumiereOverlay = (pixi, options) => {
    const { width, height, theme } = options;
    const container = new pixi.Container();
    const g = new pixi.Graphics();
    const color = hexOf(resolveLumierePalette(theme, options.themeColorMix ?? 0).light);
    const unit = Math.min(width, height);
    // 边距留足：画面边缘可能被运镜推近、后处理的镜头畸变往外推（歌词窗口按同一个边距避开画框）。
    const { padX, padY } = frameInsets(width, height);
    const arm = unit * (0.045 + LUMIERE_NEUTRAL_OFFSET__19);
    const line = Math.max(1.2, unit / 600);
    const alpha = 0.5;
    // 四角括号。
    for (const [x, y, sx, sy] of [[padX, padY, 1, 1], [width - padX, padY, -1, 1], [width - padX, height - padY, -1, -1], [padX, height - padY, 1, -1]]) {
        g.moveTo(x, y + sy * arm).lineTo(x, y).lineTo(x + sx * arm, y).stroke({ color, width: line, alpha });
    }
    // 左右边中点的对位十字（圆 + 十字）。
    const mark = unit * 0.012;
    for (const x of [padX, width - padX]) {
        const y = height / 2;
        g.circle(x, y, mark * 0.6).stroke({ color, width: line, alpha: alpha * 0.8 });
        g.moveTo(x - mark, y).lineTo(x + mark, y).stroke({ color, width: line, alpha: alpha * 0.8 });
        g.moveTo(x, y - mark).lineTo(x, y + mark).stroke({ color, width: line, alpha: alpha * 0.8 });
    }
    // 顶边两小段虚线（像取景器上沿的对焦点）。
    const dashY = padY;
    for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k += 1) {
            const x = width / 2 + side * (unit * 0.1 + k * unit * 0.018);
            g.moveTo(x, dashY).lineTo(x + side * unit * 0.009, dashY).stroke({ color, width: line, alpha: alpha * 0.55 });
        }
    }
    container.addChild(g);
    return container;
};

// ======== components/visualizer/lumiere/light/sprites ========
// 光点贴图的尺寸参考。
const lumiereScaleMask__20 = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET__20 = ((306 ^ lumiereScaleMask__20) + Math.imul(337 ^ lumiereScaleMask__20, 454 ^ lumiereScaleMask__20))
    - ((306 ^ lumiereScaleMask__20) + Math.imul(337 ^ lumiereScaleMask__20, 454 ^ lumiereScaleMask__20));
const canvasOf = (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return { canvas, context: canvas.getContext('2d') };
};
const drawDot = (size) => {
    const { canvas, context } = canvasOf(size, size);
    const r = size / (2 + LUMIERE_NEUTRAL_OFFSET__20);
    const gradient = context.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.18, 'rgba(255,255,255,0.72)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return canvas;
};
const drawStar = (size) => {
    const { canvas, context } = canvasOf(size, size);
    const r = size / 2;
    const halo = context.createRadialGradient(r, r, 0, r, r, r * 0.5);
    halo.addColorStop(0, 'rgba(255,255,255,1)');
    halo.addColorStop(0.12, 'rgba(255,255,255,0.8)');
    halo.addColorStop(0.4, 'rgba(255,255,255,0.14)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = halo;
    context.fillRect(0, 0, size, size);
    // 四条芒：细长的菱形，中间亮两端尖。
    context.globalCompositeOperation = 'lighter';
    const ray = (angle, length, thickness, alpha) => {
        context.save();
        context.translate(r, r);
        context.rotate(angle);
        const gradient = context.createLinearGradient(0, 0, length, 0);
        gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.moveTo(0, -thickness);
        context.lineTo(length, 0);
        context.lineTo(0, thickness);
        context.closePath();
        context.fill();
        context.restore();
    };
    for (let i = 0; i < 4; i += 1)
        ray((Math.PI / 2) * i, r * 0.98, size * 0.018, 0.95);
    for (let i = 0; i < 4; i += 1)
        ray((Math.PI / 2) * i + Math.PI / 4, r * 0.42, size * 0.01, 0.45);
    return canvas;
};
const drawBokeh = (size) => {
    const { canvas, context } = canvasOf(size, size);
    const r = size / 2;
    const gradient = context.createRadialGradient(r, r, 0, r, r, r * 0.96);
    gradient.addColorStop(0, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(0.78, 'rgba(255,255,255,0.42)');
    gradient.addColorStop(0.9, 'rgba(255,255,255,0.75)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(r, r, r * 0.96, 0, Math.PI * 2);
    context.fill();
    return canvas;
};
const drawStreak = (width, height) => {
    const { canvas, context } = canvasOf(width, height);
    const horizontal = context.createLinearGradient(0, 0, width, 0);
    horizontal.addColorStop(0, 'rgba(255,255,255,0)');
    horizontal.addColorStop(0.5, 'rgba(255,255,255,1)');
    horizontal.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = horizontal;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'destination-in';
    const vertical = context.createLinearGradient(0, 0, 0, height);
    vertical.addColorStop(0, 'rgba(255,255,255,0)');
    vertical.addColorStop(0.5, 'rgba(255,255,255,1)');
    vertical.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = vertical;
    context.fillRect(0, 0, width, height);
    return canvas;
};
const createLightSprites = (pixi) => {
    const textures = {
        dot: pixi.Texture.from(drawDot(128)),
        star: pixi.Texture.from(drawStar(256)),
        bokeh: pixi.Texture.from(drawBokeh(128)),
        streak: pixi.Texture.from(drawStreak(512, 32)),
    };
    return {
        ...textures,
        destroy: () => Object.values(textures).forEach(texture => texture.destroy(true)),
    };
};

// ======== components/visualizer/lumiere/createLumierePixiRuntime ========











/** 场景要重建时等多久（滑块拖动、窗口拖拽缩放时不每帧重建）。 */
const REBUILD_DEBOUNCE_MS = 220;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;
class LumierePixiRuntime {
    constructor(pixi, options, app) {
        this.pixi = pixi;
        this.options = options;
        this.app = app;
        this.sceneCache = new Map();
        /** 换歌时换下来的场景，之后一帧销毁一个，免得交接那一帧卡住。 */
        this.retired = [];
        this.activeIndex = -1;
        this.destroyed = false;
        this.resizeObserver = null;
        this.width = 0;
        this.height = 0;
        this.renderResolution = 1;
        this.quality = {
            bloom: 1, textBloom: 1, graphicsResolution: null, bloomLevelDrop: 0, passthrough: null,
        };
        this.rebuildTimer = null;
        this.rebuildDue = false;
        this.songSwap = new LumiereSongSwap({
            stage: song => this.stageSong(song),
            commit: (song, staged) => this.commitSong(song, staged),
            discard: entry => this.destroyEntry(entry),
        });
        this.audioAt = () => this.audio.frame;
        this.renderFrame = () => {
            if (this.destroyed)
                return;
            const time = this.options.currentTime.get();
            this.audio.sample(performance.now(), this.options.paused);
            this.songSwap.advance();
            if (this.rebuildDue) {
                this.rebuildDue = false;
                this.songSwap.dropStaged();
                this.clearScenes();
                this.credits.invalidate();
            }
            const { program, theme } = this.options.song;
            // 暗场强度每帧从共享 tuning 现读：拖滑块不重建场景；场景还没建好的第一帧也已经铺上。
            this.darkField.update(theme, this.sceneTuning.darkField, this.width, this.height);
            const frames = resolveLumiereSceneFrames(program, time, !this.options.staticMode);
            const visible = new Set(frames.layers.map(layer => layer.index));
            let builtThisFrame = false;
            if (frames.activeIndex !== this.activeIndex) {
                this.activeIndex = frames.activeIndex;
                this.pruneScenes(frames.activeIndex, visible);
            }
            frames.layers.forEach(layer => {
                if (!this.sceneCache.has(layer.index)) {
                    this.ensureScene(layer.index);
                    builtThisFrame = true;
                }
            });
            const creditsFrame = this.credits.resolveFrame(time, program, this.options.metadata);
            if (!builtThisFrame && !this.songSwap.active) {
                // 一帧只做一件贵的事，按优先级：释放换下的场景 → 预建下一段 → 片尾卡 → 预建上一段。
                const next = frames.activeIndex + 1;
                const previous = frames.activeIndex - 1;
                if (this.retired.length > 0) {
                    this.destroyEntry(this.retired.shift());
                }
                else if (next < program.paragraphs.length && !this.sceneCache.has(next)) {
                    this.ensureScene(next);
                }
                else if (this.credits.needsBuild(time, program, this.options.metadata)) {
                    this.credits.build(this.creditBuildContext(theme));
                }
                else if (previous >= 0 && !this.sceneCache.has(previous)) {
                    this.ensureScene(previous);
                }
            }
            if (creditsFrame.active && !this.credits.built && this.credits.hasMetadata(this.options.metadata)) {
                this.credits.build(this.creditBuildContext(theme));
            }
            const layerByIndex = new Map(frames.layers.map(layer => [layer.index, layer]));
            const lyricAlpha = creditsFrame.active ? creditsFrame.lyricAlpha : 1;
            const lyricBlur = creditsFrame.active ? creditsFrame.lyricBlur : 0;
            const blurResolution = this.renderResolution * 0.5;
            this.sceneCache.forEach((entry, index) => {
                const layer = layerByIndex.get(index);
                const alpha = (layer?.alpha ?? 0) * lyricAlpha;
                entry.holder.visible = alpha > 0.002;
                if (!entry.holder.visible || !layer)
                    return;
                entry.unit.update(time);
                applyLumiereLayerFrame(this.pixi, entry, {
                    alpha,
                    scale: layer.scale,
                    blur: Math.max(layer.blur, lyricBlur),
                }, blurResolution);
            });
            this.credits.update(time, creditsFrame, this.width, this.height);
        };
        this.sceneTuning = toLumiereSceneTuning(options.tuning, { showText: options.showText });
        this.audio = createLumiereAudioSampler({ audioPower: options.audioPower, audioBands: options.audioBands });
    }
    static async create(options) {
        const pixi = await Promise.resolve(PIXI);
        const app = new pixi.Application();
        const width = Math.max(options.host.clientWidth, MIN_WIDTH);
        const height = Math.max(options.host.clientHeight, MIN_HEIGHT);
        const resolution = resolveLumiereRenderResolution(window.devicePixelRatio);
        await app.init({
            width,
            height,
            // 画布透明：folia 的共享背景层要透出来，由运行时的暗场层按暗场强度压暗。
            backgroundAlpha: 0,
            // 大头（图形组）画进 filter 纹理，MSAA 管不到；只剩画框细线，不值得整屏多重采样的解析开销。
            antialias: false,
            autoDensity: true,
            resolution,
            autoStart: false,
            sharedTicker: false,
            preference: 'webgl',
            powerPreference: 'high-performance',
        });
        if (app.renderer.type !== pixi.RendererType.WEBGL) {
            app.destroy({ removeView: true });
            throw new Error('Lumiere requires WebGL');
        }
        const runtime = new LumierePixiRuntime(pixi, options, app);
        runtime.renderResolution = resolution;
        runtime.sprites = createLightSprites(pixi);
        runtime.passthrough = new pixi.AlphaFilter({ alpha: 1 });
        runtime.quality.passthrough = runtime.passthrough;
        runtime.darkField = new LumiereDarkFieldLayer(pixi);
        runtime.sceneLayer = new pixi.Container();
        // 交叉渐变时两个段落场景叠放，按段落顺序排。
        runtime.sceneLayer.sortableChildren = true;
        runtime.overlayLayer = new pixi.Container();
        runtime.credits = new LumiereCreditsLayer(pixi, runtime.sprites);
        app.stage.addChild(runtime.darkField.view, runtime.sceneLayer, runtime.credits.holder, runtime.overlayLayer);
        if (options.signal?.aborted) {
            runtime.destroy();
            throw new DOMException('Lumiere runtime creation was cancelled', 'AbortError');
        }
        options.host.appendChild(app.canvas);
        app.canvas.style.cssText = 'width:100%;height:100%;display:block';
        runtime.install();
        return runtime;
    }
    install() {
        this.resizeToHost(true);
        this.app.ticker.add(this.renderFrame);
        this.resizeObserver = new ResizeObserver(() => {
            if (this.destroyed || !this.resizeToHost(false))
                return;
            if (this.options.paused)
                this.renderOnce();
        });
        this.resizeObserver.observe(this.options.host);
        this.renderOnce();
        if (!this.options.paused)
            this.app.start();
    }
    /** 尺寸没变返回 false。渲染器立刻跟上，场景（尺寸烘焙在里面）防抖重建。 */
    resizeToHost(immediate) {
        if (this.destroyed)
            return false;
        const width = Math.max(this.options.host.clientWidth, MIN_WIDTH);
        const height = Math.max(this.options.host.clientHeight, MIN_HEIGHT);
        const resolution = resolveLumiereRenderResolution(window.devicePixelRatio);
        if (width === this.width && height === this.height && resolution === this.renderResolution)
            return false;
        this.width = width;
        this.height = height;
        this.renderResolution = resolution;
        this.app.renderer.resize(width, height, resolution);
        this.refreshQuality();
        this.drawOverlay();
        if (immediate)
            this.rebuildDue = true;
        else
            this.scheduleRebuild();
        return true;
    }
    /** 画质档 + 视口 → 图形组分辨率与 bloom 减级，写到所有现存场景与片尾卡上。 */
    refreshQuality() {
        const graphicsResolution = resolveLumiereGraphicsResolution(this.width, this.height, this.renderResolution, this.options.tuning.renderQuality);
        this.quality.bloom = this.sceneTuning.bloom;
        this.quality.textBloom = this.sceneTuning.textBloom;
        this.quality.graphicsResolution = graphicsResolution < this.renderResolution ? graphicsResolution : null;
        this.quality.bloomLevelDrop = resolveLumiereBloomLevelDrop(this.renderResolution, graphicsResolution);
        this.sceneCache.forEach(entry => applyLumiereSceneQuality(entry.unit.scene, this.quality));
        if (this.songSwap.staged)
            applyLumiereSceneQuality(this.songSwap.staged.unit.scene, this.quality);
        this.credits.applyQuality(this.quality);
    }
    scheduleRebuild() {
        if (this.rebuildTimer !== null)
            clearTimeout(this.rebuildTimer);
        this.rebuildTimer = setTimeout(() => {
            this.rebuildTimer = null;
            if (this.destroyed)
                return;
            this.rebuildDue = true;
            if (this.options.paused)
                this.renderOnce();
        }, REBUILD_DEBOUNCE_MS);
    }
    drawOverlay() {
        // 画框是自建 context 的 Graphics，带 context: true 才会连 GPU 批数据一起放掉（见 lineArt 的 destroy）。
        this.overlayLayer.removeChildren().forEach(child => child.destroy({ children: true, context: true }));
        // 仅显示歌词文字时画框也是装饰，不画。
        if (!this.options.tuning.overlayFrame || this.options.tuning.textOnly || this.width === 0)
            return;
        this.overlayLayer.addChild(buildLumiereOverlay(this.pixi, {
            width: this.width,
            height: this.height,
            theme: this.options.song.theme,
            themeColorMix: this.options.tuning.themeColorMix,
        }));
    }
    buildEntry(song, index) {
        return buildLumiereSceneEntry(this.pixi, {
            width: this.width,
            height: this.height,
            resolution: this.renderResolution,
            program: song.program,
            theme: song.theme,
            tuning: this.sceneTuning,
            sprites: this.sprites,
            audioAt: this.audioAt,
            showText: this.options.showText,
            quality: this.quality,
        }, index);
    }
    ensureScene(index) {
        if (index < 0 || index >= this.options.song.program.paragraphs.length)
            return null;
        const cached = this.sceneCache.get(index);
        if (cached)
            return cached;
        const entry = this.buildEntry(this.options.song, index);
        this.sceneCache.set(index, entry);
        this.sceneLayer.addChild(entry.holder);
        return entry;
    }
    destroyEntry(entry) {
        destroyLumiereSceneEntry(entry, this.passthrough);
    }
    clearScenes() {
        this.sceneCache.forEach(entry => this.destroyEntry(entry));
        this.sceneCache.clear();
        this.activeIndex = -1;
    }
    pruneScenes(index, keep) {
        this.sceneCache.forEach((entry, sceneIndex) => {
            if (Math.abs(sceneIndex - index) <= 1 || keep.has(sceneIndex))
                return;
            this.destroyEntry(entry);
            this.sceneCache.delete(sceneIndex);
        });
    }
    creditBuildContext(theme) {
        return {
            width: this.width,
            height: this.height,
            resolution: this.renderResolution,
            theme,
            metadata: this.options.metadata,
            tuning: this.sceneTuning,
            quality: this.quality,
        };
    }
    renderOnce() {
        if (this.destroyed || !this.app.canvas.isConnected)
            return;
        this.renderFrame();
        if (this.destroyed)
            return;
        this.app.renderer.render(this.app.stage);
    }
    /**
     * 换歌：新歌当前段落的场景在第一帧建好（旧歌还在画），第二帧切过去；换下的场景之后一帧销毁一个。
     * 不是真正的换歌（同一个 seed：主题改了、歌词晚到）、暂停中、还没有画面时直接替换。
     */
    swapSong(next, signal) {
        if (this.destroyed)
            return Promise.resolve();
        if (next.seed === this.options.song.seed
            || this.songSwap.active
            || this.width === 0
            || this.sceneCache.size === 0
            || this.options.paused
            || signal?.aborted) {
            this.commitSong(next, null);
            if (this.options.paused)
                this.renderOnce();
            return Promise.resolve();
        }
        return this.songSwap.begin(next, signal);
    }
    /** 交接的第一帧：离屏建好新歌当前段落的场景（不进缓存，旧歌的场景被换下时它不受影响）。 */
    stageSong(song) {
        const index = findLumiereParagraphIndexAtTime(song.program, this.options.currentTime.get());
        if (index < 0 || index >= song.program.paragraphs.length)
            return null;
        const entry = this.buildEntry(song, index);
        entry.holder.visible = false;
        this.sceneLayer.addChild(entry.holder);
        return entry;
    }
    commitSong(next, staged) {
        const themeChanged = next.theme !== this.options.song.theme;
        this.options.song = next;
        if (staged) {
            this.sceneCache.forEach(entry => {
                entry.holder.parent?.removeChild(entry.holder);
                this.retired.push(entry);
            });
            this.sceneCache.clear();
            this.sceneCache.set(staged.index, staged);
            this.activeIndex = staged.index;
        }
        else {
            this.clearScenes();
        }
        this.credits.invalidate();
        if (themeChanged)
            this.drawOverlay();
    }
    /** 就地应用 tuning：每帧现读的字段直接改，bloom 强度写进 filter，烘焙进场景的字段防抖重建。 */
    setTuning(tuning) {
        if (this.destroyed || tuning === this.options.tuning)
            return;
        const previousTuning = this.options.tuning;
        this.options.tuning = tuning;
        this.applySceneTuning();
        if (previousTuning.overlayFrame !== tuning.overlayFrame
            || previousTuning.textOnly !== tuning.textOnly
            || previousTuning.themeColorMix !== tuning.themeColorMix)
            this.drawOverlay();
        if (this.options.paused)
            this.renderOnce();
    }
    setShowText(showText) {
        if (this.destroyed || showText === this.options.showText)
            return;
        this.options.showText = showText;
        this.sceneCache.forEach(entry => {
            entry.unit.scene.text.visible = showText;
        });
        if (this.songSwap.staged)
            this.songSwap.staged.unit.scene.text.visible = showText;
        this.applySceneTuning();
        if (this.options.paused)
            this.renderOnce();
    }
    applySceneTuning() {
        const previous = { ...this.sceneTuning };
        const next = toLumiereSceneTuning(this.options.tuning, { showText: this.options.showText });
        Object.assign(this.sceneTuning, next);
        this.refreshQuality();
        if (requiresLumiereSceneRebuild(previous, next))
            this.scheduleRebuild();
    }
    setStaticMode(staticMode) {
        if (this.destroyed || staticMode === this.options.staticMode)
            return;
        this.options.staticMode = staticMode;
        if (this.options.paused)
            this.renderOnce();
    }
    setAudioSources(audioPower, audioBands) {
        this.audio.setSources({ audioPower, audioBands });
    }
    setSongMetadata(metadata) {
        if (this.destroyed)
            return;
        const current = this.options.metadata;
        if (current.title === metadata.title && current.artist === metadata.artist && current.album === metadata.album)
            return;
        this.options.metadata = { ...metadata };
        this.credits.invalidate();
        if (this.options.paused)
            this.renderOnce();
    }
    setPaused(paused) {
        if (this.destroyed)
            return;
        this.options.paused = paused;
        if (paused) {
            this.app.stop();
            this.renderOnce();
        }
        else {
            this.app.start();
        }
    }
    destroy() {
        if (this.destroyed)
            return;
        this.destroyed = true;
        // 先放掉等交接的人，否则 pixiRuntimeHost 的 drain 循环会一直停在这个 promise 上。
        this.songSwap.settle(false);
        if (this.rebuildTimer !== null)
            clearTimeout(this.rebuildTimer);
        this.rebuildTimer = null;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.app.stop();
        this.app.ticker.remove(this.renderFrame);
        this.clearScenes();
        this.retired.forEach(entry => this.destroyEntry(entry));
        this.retired.length = 0;
        this.credits?.destroy();
        this.darkField?.destroy();
        this.overlayLayer?.removeChildren().forEach(child => child.destroy({ children: true, context: true }));
        // 光点纹理与直通 filter 由运行时持有，场景与片尾卡都已销毁，这里最后释放。
        this.sprites?.destroy();
        this.passthrough?.destroy();
        this.app.destroy({ removeView: true }, { children: true });
    }
}


// 跨模式符号：tempera 复用 sonnet 的滤镜（引擎 bundle 全局先行加载）
var TemperaLensFilterMixin = null;   // 占位：actual classes injected via window.__sonnetFilters if present

var mergeDiagrams = merge;
env.LumierePixiRuntime = (typeof LumierePixiRuntime !== "undefined") ? LumierePixiRuntime : null;
env.compileLumiereProgram = (typeof compileLumiereProgram !== "undefined") ? compileLumiereProgram : null;
})(typeof PIXI !== "undefined" ? PIXI : null, typeof pretext !== "undefined" ? pretext : null, typeof window !== "undefined" ? window : this);