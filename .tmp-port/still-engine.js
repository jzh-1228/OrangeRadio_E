// OrangeSea STILL ENGINE (AGPL-3.0, from folia-major) -- no-build bundle
(function (env) {
"use strict";
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
            enterDuration: clamp(rawDuration * 0.45, 0.045, 0.06),
            exitDuration: clamp(rawDuration * 0.22, 0.03, 0.04),
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
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
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

// ======== manual: manual/still-engine-core.js ========
/* =========================================================================
   still 渲染核心 —— Folia still VisualizerStill.tsx 的无构建 DOM 忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     src/components/visualizer/still/VisualizerStill.tsx（渲染核心全量）
     src/components/visualizer/still/entry.tsx（tuningKind:'none'——无调参项）
     src/components/visualizer/VisualizerShell.tsx:125-134（壳字体/字重/透明度）
     src/utils/appPlaybackHelpers.ts:21-31（findLatestActiveLineIndex——
       Folia 宿主写 currentLineIndex 的权威语义）

   结构对应（React → 无构建 DOM）：
     VisualizerShell 根       → st-shell（fontFamily/fontWeight/opacity inline，
                                 同 VisualizerShell.tsx:128-134；:128 transition-
                                 colors duration-1000 主题热更 1s 渐变；setTheme
                                 时 applyShellFont 重建壳级字体栈/字重。fontClassName
                                 是 Tailwind 粗对齐、被 inline font stack 压制，
                                 :117-118 源注释即言 inline 优先，无 Tailwind
                                 环境下不落地）
     暗角遮罩层（:46-48）      → st-vignette（radial-gradient 夜 0.65 /
                                 昼 opacity .3 + mix-blend-multiply）
     歌词舞台（:50-51）        → st-stage（px-12 pb-16 gap-8 flex 居中列）
     [-1,0,1].map 三行（:52-91）→ 三个 st-row（max-w-4xl 行单元 + 主文本 +
                                 翻译），样式由 offset 是否为 0（isCurrent）
                                 决定、静态不变，仅文本随 effectiveIndex 更新
     effectiveIndex state（:22-30）→ tick 每帧派生 currentLineIndex 后同语义更新
     空槽 <div class="h-20"/>（:56）→ row height 5rem + 文本隐藏

   Tailwind 精确值（视觉形态的唯一权威）：
     text-[2.5rem]+leading-tight = 2.5rem / 1.25（当前主行）
     text-3xl   = 1.875rem / 2.25rem·opacity .3（邻主行）
     text-2xl   = 1.5rem / 2rem·opacity .8·mt-3（当前翻译行）
     text-xl    = 1.25rem / 1.75rem·opacity .3·mt-2（邻翻译行）
     drop-shadow-md = drop-shadow(0 4px 3px rgb(0 0 0/.07))
                      drop-shadow(0 2px 2px rgb(0 0 0/.06))
     drop-shadow-sm = drop-shadow(0 1px 1px rgb(0 0 0/.05))
     tracking-[0.02em] / tracking-wide = 0.02em / 0.025em
     h-20 = 5rem；max-w-4xl = 56rem；px-12 pb-16 gap-8 = 3/4/2rem
     scale（:68/:82）= CSS 独立 scale 属性（非 transform），主行 lyricsFontScale、
     翻译行 lyricsFontScale*subtitleFontScale。

   无动画：still 是纯静态渲染（源码无 motion/variants），不引 mini-motion。
   MineRadio 宿主差异（数据源在桥）：subtitleTheme 恒空（resolvedSubtitleTheme
   = theme，:32）；isDaylight 恒 false（覆盖层恒夜侧取色）；showText 恒 true；
   hideTranslationSubtitle 恒 false；visualizerOpacity 恒 1。
   ========================================================================= */

/* stillEl —— 元素助手（classic 引擎 classicEl 同构） */
function stillEl(tag, className) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

/* stillFindLineIndexAtTime —— appPlaybackHelpers.ts:21-31 findLatestActiveLineIndex
   逐行同构：倒序找第一个 time ∈ [startTime, renderEndTime] 的行；
   renderEndTime 由 renderHints 闭包提供（无 hints 的行 buildLineRenderHints 现算）。 */
function stillFindLineIndexAtTime(linesArr, time) {
  for (var i = linesArr.length - 1; i >= 0; i -= 1) {
    var line = linesArr[i];
    if (!line || time < line.startTime) {
      continue;
    }
    if (time <= CM_getLineRenderEndTime(line)) {
      return i;
    }
  }
  return -1;
}

/*
 * StillStillEngine(opts) —— still 模式渲染引擎（VisualizerStill.tsx 组件树的宿主等价）
 * opts: { host, lines, currentTime(MV), theme, subtitleTheme?, lyricsFontScale?,
 *         subtitleFontScale?, showText?, hideTranslationSubtitle?, isDaylight?,
 *         visualizerOpacity? }
 * 返回 { destroy, setLines, setTheme, setFontScale, setSubtitleFontScale }
 */
function StillStillEngine(opts) {
  var host = opts.host;
  var lines = opts.lines || [];
  var theme = opts.theme;
  var subtitleTheme = opts.subtitleTheme || null;                                   // :12（null → resolved = theme :32）
  var lyricsFontScale = opts.lyricsFontScale != null ? opts.lyricsFontScale : 1;    // :13 默认 1
  var subtitleFontScale = opts.subtitleFontScale != null ? opts.subtitleFontScale : 1; // :14 默认 1
  var hideTranslationSubtitle = !!opts.hideTranslationSubtitle;                     // :15 默认 false
  var isDaylight = !!opts.isDaylight;                                               // :16 默认 false
  var showText = opts.showText !== false;                                           // :17 默认 true
  var visualizerOpacity = opts.visualizerOpacity != null ? opts.visualizerOpacity : 1;

  var currentTime = opts.currentTime;
  var destroyed = false;
  var rafId = 0;

  /* effectiveIndex（:22 useState 初始 max(0, currentLineIndex)——宿主创建时
     先按当前播放时刻派生一次，等价 React 首渲） */
  var effectiveIndex = Math.max(0, stillFindLineIndexAtTime(lines, currentTime.get()));

  /* ---------- 壳（VisualizerShell.tsx:128-134 等价） ---------- */
  var shell = stillEl('div', 'visualizer-still');
  shell.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;background-color:transparent;opacity:' + visualizerOpacity +
    ';font-family:' + CM_resolveThemeFontStack(theme) +
    ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) +
    /* :128 transition-colors duration-1000——主题热更时颜色 1s 渐变
       （Tailwind transition-colors 六属性 + 默认缓动 cubic-bezier(0.4,0,0.2,1)） */
    ';transition:color 1s cubic-bezier(0.4, 0, 0.2, 1),background-color 1s cubic-bezier(0.4, 0, 0.2, 1),border-color 1s cubic-bezier(0.4, 0, 0.2, 1),text-decoration-color 1s cubic-bezier(0.4, 0, 0.2, 1),fill 1s cubic-bezier(0.4, 0, 0.2, 1),stroke 1s cubic-bezier(0.4, 0, 0.2, 1)' +
    ';';

  /* 壳级字体栈/字重重算（:128-134 是 React 每渲重算的 inline style；
     DOM 单路径下 setTheme 热更时同步重建——字体跟随约束：引擎 setTheme
     必须真正把新字体应用到壳与文本，行级重算在 applyStyles()） */
  function applyShellFont() {
    shell.style.fontFamily = CM_resolveThemeFontStack(theme);
    shell.style.fontWeight = String(CM_resolveThemeFontWeight(theme, 400));
  }

  /* ---------- L0 暗角遮罩（:46-48 原样） ----------
     夜间：opacity-[0.65]；昼间：opacity-30 + mix-blend-multiply。 */
  var vignette = stillEl('div', 'st-vignette');
  vignette.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;' +
    (isDaylight ? 'opacity:0.3;mix-blend-mode:multiply;' : 'opacity:0.65;') +
    'background:radial-gradient(ellipse at center, transparent 0%, #000 100%);';
  shell.appendChild(vignette);

  /* ---------- L1 歌词舞台（:50-51；showText 时渲染） ----------
     flex 居中列 · px-12 pb-16 gap-8 · z-0 · pointer-events-none。 */
  var stage = null;
  var slots = [];   /* [{root, textEl, trEl}]，下标 0/1/2 = offset -1/0/+1 */
  if (showText) {
    stage = stillEl('div', 'st-stage');
    stage.style.cssText = 'position:absolute;inset:0;z-index:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;padding:0 3rem 4rem;gap:2rem;';
    for (var s = 0; s < 3; s += 1) {
      /* 行单元（:61 flex flex-col items-center w-full max-w-4xl） */
      var row = stillEl('div', 'st-row');
      row.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;max-width:56rem;';
      var textEl = stillEl('div', 'st-text');   /* :62-74 主文本 */
      var trEl = stillEl('div', 'st-tr');       /* :76-88 翻译行 */
      row.appendChild(textEl);
      row.appendChild(trEl);
      stage.appendChild(row);
      slots.push({ root: row, textEl: textEl, trEl: trEl });
    }
    shell.appendChild(stage);
  }
  host.appendChild(shell);

  /* ---------- 样式（:64-70 主文本 / :78-84 翻译行；静态，主题/字号变化时重算） ---------- */
  function stillResolvedSubtitleTheme() { return subtitleTheme || theme; }   /* :32 */

  function applyStyles() {
    var mainStack = CM_resolveThemeFontStack(theme);
    var subTheme = stillResolvedSubtitleTheme();
    var trStack = CM_resolveThemeTranslationFontStack(subTheme);
    for (var i = 0; i < 3; i += 1) {
      var isCurrent = i === 1;   /* isCurrent = offset === 0（:59） */
      var t = slots[i].textEl;
      t.style.textAlign = 'center';                                        /* text-center */
      t.style.letterSpacing = '0.02em';                                    /* tracking-[0.02em] */
      t.style.filter = 'drop-shadow(0 4px 3px rgba(0, 0, 0, 0.07)) drop-shadow(0 2px 2px rgba(0, 0, 0, 0.06))'; /* drop-shadow-md */
      t.style.color = theme.primaryColor;                                  /* :66 */
      t.style.fontFamily = mainStack;                                      /* :67 */
      t.style.scale = String(lyricsFontScale);                             /* :68（CSS scale 属性） */
      t.style.fontWeight = String(CM_resolveThemeFontWeight(theme, isCurrent ? 700 : 600)); /* :69 */
      if (isCurrent) {
        t.style.fontSize = '2.5rem';                                       /* text-[2.5rem] */
        t.style.lineHeight = '1.25';                                       /* leading-tight */
        t.style.opacity = '1';                                             /* opacity-100 */
      } else {
        t.style.fontSize = '1.875rem';                                     /* text-3xl */
        t.style.lineHeight = '2.25rem';                                    /* text-3xl 行高 */
        t.style.opacity = '0.3';                                           /* opacity-30 */
      }
      var r = slots[i].trEl;
      r.style.textAlign = 'center';                                        /* text-center */
      r.style.letterSpacing = '0.025em';                                   /* tracking-wide */
      r.style.filter = 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.05))';       /* drop-shadow-sm */
      r.style.color = subTheme.secondaryColor;                             /* :80 */
      r.style.fontFamily = trStack;                                        /* :81 */
      r.style.scale = String(lyricsFontScale * subtitleFontScale);         /* :82 */
      r.style.fontWeight = String(CM_resolveThemeFontWeight(subTheme, isCurrent ? 500 : 400)); /* :83 */
      if (isCurrent) {
        r.style.fontSize = '1.5rem';                                       /* text-2xl */
        r.style.lineHeight = '2rem';                                       /* text-2xl 行高 */
        r.style.opacity = '0.8';                                           /* opacity-80 */
        r.style.marginTop = '0.75rem';                                     /* mt-3 */
      } else {
        r.style.fontSize = '1.25rem';                                      /* text-xl */
        r.style.lineHeight = '1.75rem';                                    /* text-xl 行高 */
        r.style.opacity = '0.3';                                           /* opacity-30 */
        r.style.marginTop = '0.5rem';                                      /* mt-2 */
      }
    }
  }

  /* ---------- 文本更新（:52-91 三行映射；textContent 赋值天然防注入） ---------- */
  function stillSetText(el, text) {
    if (el.textContent !== text) el.textContent = text;
    /* Folia 条件渲染直译：fullText/translation 为 falsy 即不渲染该元素 */
    el.style.display = text ? '' : 'none';
  }

  function updateLines() {
    if (!stage) return;
    for (var i = 0; i < 3; i += 1) {
      var offset = i - 1;                                   /* [-1, 0, 1] */
      var lineIndex = effectiveIndex + offset;              /* :53 */
      var line = (lineIndex >= 0 && lineIndex < lines.length) ? lines[lineIndex] : null;
      var slot = slots[i];
      if (!line) {
        slot.root.style.height = '5rem';                    /* :56 空槽 h-20 */
        stillSetText(slot.textEl, '');
        stillSetText(slot.trEl, '');
        continue;
      }
      slot.root.style.height = '';
      var fullText = line.fullText;                         /* :62 */
      stillSetText(slot.textEl, (typeof fullText === 'string' && fullText) ? fullText : '');
      var tr = (line.translation && !hideTranslationSubtitle) ? line.translation : '';  /* :76 */
      stillSetText(slot.trEl, (typeof tr === 'string' && tr) ? tr : '');
    }
  }

  /* ---------- effectiveIndex 状态机（:24-30 useEffect 同语义，帧驱动） ---------- */
  function tick() {
    if (destroyed) return;
    var currentIdx = stillFindLineIndexAtTime(lines, currentTime.get());
    var next = effectiveIndex;
    if (currentIdx !== -1) {
      next = currentIdx;                                    /* :25-26 跟随权威索引 */
    } else if (effectiveIndex >= lines.length) {            /* :27-28 越界回退第 0 行 */
      next = 0;
    }
    if (next !== effectiveIndex) {
      effectiveIndex = next;
      updateLines();
    }
    rafId = requestAnimationFrame(tick);
  }

  /* ---------- 热更新接口（桥：换歌/主题/字号轮询 sync） ---------- */
  function setLines(v) {
    lines = v || [];
    updateLines();
  }

  function setTheme(t, st) {
    theme = t;
    subtitleTheme = st || null;
    applyShellFont();   /* 壳级 font-family/font-weight 随主题重建（字体跟随） */
    applyStyles();
  }

  function setFontScale(v) {
    lyricsFontScale = v != null ? v : 1;
    applyStyles();
  }

  function setSubtitleFontScale(v) {
    subtitleFontScale = v != null ? v : 1;
    applyStyles();
  }

  function destroy() {
    destroyed = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (shell.parentNode === host) {
      host.removeChild(shell);
    }
  }

  applyStyles();
  updateLines();
  rafId = requestAnimationFrame(tick);

  return {
    destroy: destroy,
    setLines: setLines,
    setTheme: setTheme,
    setFontScale: setFontScale,
    setSubtitleFontScale: setSubtitleFontScale
  };
}

var CM_normalizeFontWeight = normalizeFontWeight;
env.CM_normalizeFontWeight = CM_normalizeFontWeight;
var CM_resolveThemeFontStack = resolveThemeFontStack;
env.CM_resolveThemeFontStack = CM_resolveThemeFontStack;
var CM_resolveThemeTranslationFontStack = resolveThemeTranslationFontStack;
env.CM_resolveThemeTranslationFontStack = CM_resolveThemeTranslationFontStack;
var CM_resolveThemeFontWeight = resolveThemeFontWeight;
env.CM_resolveThemeFontWeight = CM_resolveThemeFontWeight;
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
env.StillStillEngine = (typeof StillStillEngine !== "undefined") ? StillStillEngine : null;
env.stillFindLineIndexAtTime = (typeof stillFindLineIndexAtTime !== "undefined") ? stillFindLineIndexAtTime : null;
})(typeof window !== "undefined" ? window : this);