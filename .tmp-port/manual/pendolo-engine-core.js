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
