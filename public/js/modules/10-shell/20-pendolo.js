/* =========================================================================
   OrangeSea · 钟摆（Pendolo · 擒纵钟表机械歌词）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0):
     src/components/visualizer/pendolo/VisualizerPendolo.tsx
     src/components/visualizer/pendolo/PendoloClockworkCanvas.tsx
     src/components/visualizer/pendolo/PendoloActiveLyricSweep.tsx
     src/components/visualizer/pendolo/pendoloGeometry.ts / pendoloTextLayout.ts /
     pendoloTimeline.ts / pendoloSubtitleTracks.ts / pendoloMotionProfile.ts /
     pendoloColorRuns.ts（colorRuns 随 wordColors 一并省略，本项目无逐词配色）

   宿主替换（React → 无构建原生 JS，照 09-aurora-flow.js 范式）：
     · React 生命周期/lazy → IIFE 状态 + applyPendoloMode(on,{save}) 显式进出；
     · framer-motion useSpring → 半隐式欧拉弹簧积分器（同参数 stiffness/damping/mass）；
     · useTransform/MotionValue → 每帧显式计算后直写 style / CSS 变量；
     · useEffect rAF → 自有 30fps rAF 循环（覆盖层期间主循环只保活
       frequencyData/timeDomainData，频谱经 motionSignalGet('spectrum') 读取
       —— 引用稳定、内容由主循环保温路径原地刷新）；
     · pretext 精确排版 → 离屏 canvas measureText 贪心折行（显式分行渲染，
       测量与 DOM 同源，预留高度与绘制行不会错位）。

   视觉还原清单：弧形歌词环（±90° 门控 + 110°/28° 边缘渐隐）、行切换
   擒纵棘轮弹簧、齿轮群（主擒纵轮 36 齿/辐条轮/玑镂纹/铆钉/太阳轮/
   行星轮×3/摆轮+游丝/传动轮+日内瓦纹/秒轮每秒一齿棘轮/惰轮/焦点轴
   箭头）、bass 调速摆轮、当前行逐字扫光填充、翻译字幕轨、滚轮/触摸
   手动转轮（2.5s 复位）、点击行 seek、无词纯机械演示（每 5s 步进）。
   配色改为本项目日落暖色（--home-accent #ff7a3d 系）；字体跟随
   fx.lyricFont（lyricFontStackForKey/lyricFontWeightValue）。
   ========================================================================= */

var PENDOLO_STORE_KEY = 'orangesea-pendolo-v1';
var pendoloMode = (typeof readBooleanPreference === 'function') ? readBooleanPreference(PENDOLO_STORE_KEY, false) : false;
var pendoloRafId = 0;
var pendoloResizeTimer = 0;
var pendoloLyricsToken = 0;
var pendoloLastLyricsSig = '';

/* ---------- tuning（DEFAULT_PENDOLO_TUNING 原值） ---------- */
var PENDOLO_TUNING = {
  arcRadius: 0.42,
  arcAngleDeg: 100,
  wheelCenterX: 0.0,
  wheelCenterY: 0.50,
  tickSnappiness: 2.0,
  activeScale: 1.25,
  showGearDecor: 'subtle',
  showCenterGradient: true
};
/* ---------- motion profile（resolvePendoloMotionProfile 'normal' 档原值） ---------- */
var PENDOLO_PROFILE = {
  balanceSpeedMultiplier: 1,
  balanceAmplitudeMultiplier: 1,
  bassResponseMultiplier: 1,
  escapementSpringMultiplier: 1,
  escapementDampingMultiplier: 1,
  chorusHaloOpacity: 0.34,
  chorusGlowMultiplier: 1
};
var PENDOLO_VISIBLE_WINDOW = 9;   /* 弧窗口可见行数（Folia 同值） */
var PENDOLO_SCROLL_IDLE_RESET_MS = 2500;
var PENDOLO_SCROLL_STEP_PX = 90;
var PENDOLO_TOUCH_STEP_PX = 60;
var PENDOLO_INSTRUMENTAL_SECONDS_PER_FRAME = 5;

/* ---------- 日落暖色板（Folia theme 三色 → 本项目协调色） ---------- */
var PENDOLO_BG_COLOR = '#100b07';
var PENDOLO_PRIMARY = '#f6ead8';
var PENDOLO_ACCENT = '#ff7a3d';
var PENDOLO_SECONDARY = '#c9b393';
var pendoloAlphaCache = {};

/* 主题跟随（Folia: 表盘机械配色 = theme.primaryColor/accentColor/backgroundColor） */
var pendoloLastThemeKey = '';
function pendoloSyncTheme() {
  if (typeof themeOverlayDarkTheme !== 'function') return;
  var t = null;
  try { t = themeOverlayDarkTheme(); } catch (e) { return; }
  if (!t) return;
  var key = (t.primaryColor || '') + '|' + (t.accentColor || '') + '|' + (t.backgroundColor || '');
  if (key === pendoloLastThemeKey) return;
  pendoloLastThemeKey = key;
  if (t.backgroundColor) PENDOLO_BG_COLOR = t.backgroundColor;
  if (t.primaryColor) PENDOLO_PRIMARY = t.primaryColor;
  if (t.accentColor) PENDOLO_ACCENT = t.accentColor;
  if (t.secondaryColor) PENDOLO_SECONDARY = t.secondaryColor;
  /* 派生色与齿轮配色组重算；中央渐变缓存失效 */
  PENDOLO_FILL_NORMAL = pendoloMixHex(PENDOLO_PRIMARY, PENDOLO_ACCENT, 0.32);
  PENDOLO_FILL_CHORUS = pendoloMixHex(PENDOLO_PRIMARY, PENDOLO_ACCENT, 0.58);
  pendoloBuildGearColors();
  pendoloCenterGrad = null;
}

/* hex → rgba 字符串（colorMix.colorWithAlpha 等价，进入时预计算后零每帧分配） */
function pendoloAlpha(hex, alpha) {
  var a = Math.max(0, Math.min(1, alpha));
  var key = hex + '|' + a.toFixed(3);
  var hit = pendoloAlphaCache[key];
  if (hit) return hit;
  var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  var r = 255, g = 255, b = 255;
  if (m) {
    var n = parseInt(m[1], 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  }
  var out = 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
  pendoloAlphaCache[key] = out;
  return out;
}
/* mixColors 等价（fill 色静态预计算，非每帧） */
function pendoloMixHex(fromHex, toHex, amount) {
  var t = Math.max(0, Math.min(1, amount));
  function chan(hexStr) {
    var mm = /^#?([0-9a-f]{6})$/i.exec(String(hexStr || '').trim());
    if (!mm) return [255, 255, 255];
    var nn = parseInt(mm[1], 16);
    return [(nn >> 16) & 255, (nn >> 8) & 255, nn & 255];
  }
  var a = chan(fromHex), b = chan(toHex);
  return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
    Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
    Math.round(a[2] + (b[2] - a[2]) * t) + ')';
}
var PENDOLO_FILL_NORMAL = pendoloMixHex(PENDOLO_PRIMARY, PENDOLO_ACCENT, 0.32);
var PENDOLO_FILL_CHORUS = pendoloMixHex(PENDOLO_PRIMARY, PENDOLO_ACCENT, 0.58);

/* 预计算的齿轮配色组（subtle → decorOpacityMultiplier 0.6，进入/换色时算一次） */
var pendoloGearColors = null;
function pendoloBuildGearColors() {
  var mul = PENDOLO_TUNING.showGearDecor === 'full' ? 1.0 : 0.6;
  var P = PENDOLO_PRIMARY, A = PENDOLO_ACCENT;
  pendoloGearColors = {
    mul: mul,
    primaryA10: pendoloAlpha(P, 0.10 * mul),
    primaryA15: pendoloAlpha(P, 0.15 * mul),
    primaryA18: pendoloAlpha(P, 0.18 * mul),
    primaryA25: pendoloAlpha(P, 0.25 * mul),
    primaryA07: pendoloAlpha(P, 0.07 * mul),
    primaryA06: pendoloAlpha(P, 0.06 * mul),
    primaryA28: pendoloAlpha(P, 0.28 * mul),
    accentA12: pendoloAlpha(A, 0.12 * mul),
    accentA35: pendoloAlpha(A, 0.35 * mul),
    mainFill: pendoloAlpha(A, 0.08 * mul),
    gearPrimary: pendoloAlpha(P, 0.42 * mul),
    gearPrimarySubtle: pendoloAlpha(P, 0.32 * mul),
    gearAccent: pendoloAlpha(A, 0.58 * mul),
    gearAccentStrong: pendoloAlpha(A, 0.72 * mul),
    planet: pendoloAlpha(P, 0.24 * mul),
    jewelFill: pendoloAlpha(A, 0.28 * mul),
    jewelStroke: pendoloAlpha(A, 0.65 * mul),
    balanceFill: pendoloAlpha(A, 0.10 * mul),
    hairspring: pendoloAlpha(A, 0.30 * mul),
    secondsFill: pendoloAlpha(A, 0.06 * mul)
  };
}

/* ---------- 状态 ---------- */
var pendoloCanvas = null;
var pendoloCtx = null;
var pendoloBox = { left: 0, top: 0, width: 0, height: 0 };
var pendoloCenterGrad = null;
var pendoloPhase = 0;                 /* 摆轮相位 */
var pendoloSmoothedBass = 0.15;
var pendoloSecElapsed = 0;            /* 秒轮棘轮 */
var pendoloSecStep = 0;
var pendoloSecAngle = 0;
var pendoloSecVel = 0;
var pendoloTickPos = 0;               /* tickSpring：useSpring(targetLineIndex) 等价 */
var pendoloTickVel = 0;
var pendoloTickTarget = 0;
var pendoloBass = 0;
var pendoloEnergy = 0;
var pendoloChorus = 0;                /* 副歌闸门（无行级 isChorus 数据，能量近似） */
var pendoloChorusOn = false;

/* 视口几何缓存（resize / 进入时重算） */
var pendoloView = { w: 0, h: 0, cx: 0, cy: 0, baseR: 0, ringR: 0, textW: 0, angleStep: 0, totalArc: 0 };

/* 行槽（±8 窗口共 17 个，DOM 复用） */
var PENDOLO_SLOT_COUNT = 17;
var pendoloSlots = null;              /* [{root,tilt,body,halo,main,tr, lineIdx,focal,sweep}] */
var pendoloHeightCache = [];
var pendoloLayoutStamp = -1;          /* round(target*2) 变化才重布局 */
var pendoloItems = [];                /* 当前布局的行几何（低频更新） */
var pendoloWheelEl = null;
var pendoloFontKey = '';

/* 手动滚动状态 */
var pendoloManualAnchor = null;       /* number | null */
var pendoloManualResetTimer = 0;
var pendoloWheelAcc = 0;
var pendoloWheelDir = 0;
var pendoloTouchLastY = null;
var pendoloTouchAcc = 0;
var pendoloTouchDir = 0;
var pendoloPendingSeekIdx = null;

/* 歌词锚点状态（resolvePendoloFallbackAnchorIndex 的宿主状态） */
var pendoloLastValidIdx = 0;
var pendoloHasObservedLine = false;

/* 离屏测量 canvas（pretext 的 measureText 等价） */
var pendoloMeasureCanvas = null;
var pendoloMeasureCtx = null;

/* grapheme 分割（splitLyricGraphemes 等价：Intl.Segmenter 优先，降级码点） */
var pendoloSegmenter = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;
function pendoloGraphemes(text) {
  text = String(text == null ? '' : text);
  if (!text) return [];
  if (pendoloSegmenter) {
    var out = [];
    var it = pendoloSegmenter.segment(text)[Symbol.iterator]();
    var cur;
    while (!(cur = it.next()).done) out.push(cur.value.segment);
    return out;
  }
  return Array.from(text);
}

/* ---------- 文本折行（buildPendoloTextLayout 的 measureText 贪心等价） ----------
   断行策略与 CSS overflow-wrap:anywhere 一致：任意 grapheme 处可断，
   行内若有空格则优先在最后一个空格后断（拉丁词不拦腰）。 */
function pendoloMeasureCtxEnsure() {
  if (!pendoloMeasureCtx) {
    pendoloMeasureCanvas = document.createElement('canvas');
    pendoloMeasureCanvas.width = 8; pendoloMeasureCanvas.height = 8;
    pendoloMeasureCtx = pendoloMeasureCanvas.getContext('2d');
  }
  return pendoloMeasureCtx;
}
function pendoloWrapText(text, fontSpec, maxWidth, lineHeight) {
  var ctx = pendoloMeasureCtxEnsure();
  ctx.font = fontSpec;
  var gs = pendoloGraphemes(text || ' ');
  if (!gs.length) gs = [' '];
  maxWidth = Math.max(1, maxWidth);
  var rows = [];
  var cur = '', curW = 0, lastSpaceEnd = -1, cursor = 0;  /* lastSpaceEnd：行内最后空格后的 grapheme 序号 */
  for (var i = 0; i < gs.length; i++) {
    var next = cur + gs[i];
    var w = ctx.measureText(next).width;
    if (w > maxWidth && cur) {
      var cut;
      if (lastSpaceEnd > 0 && i >= lastSpaceEnd && !/^\s$/.test(gs[i])) {
        cut = lastSpaceEnd;                       /* 空格后断，空格留行尾 */
      } else {
        cut = i;                                  /* anywhere 断 */
      }
      var head = gs.slice(cursor, cut).join('');
      rows.push({ text: head, width: ctx.measureText(head).width, gStart: cursor, gEnd: cut });
      cur = gs.slice(cut, i + 1).join('');
      curW = ctx.measureText(cur).width;
      cursor = cut;
      lastSpaceEnd = -1;
      continue;
    }
    cur = next;
    curW = w;
    if (/^\s$/.test(gs[i]) && cur.trim()) lastSpaceEnd = i + 1;
  }
  rows.push({ text: cur, width: curW, gStart: cursor, gEnd: gs.length });
  return { rows: rows, lineHeight: lineHeight, height: Math.max(rows.length, 1) * lineHeight };
}

/* ---------- 逐字时间轴（buildLineGraphemeTimeline 的 YRC 等价） ----------
   MineRadio word：{text, t(绝对秒), d(秒), c0/c1(UTF-16 code unit 区间)}。
   输出每 grapheme 的绝对秒区间 [{s,e}]：词内均分，词外字符贴下一词起点，
   尾部未覆盖字符贴最后已知时刻（Folia lastResolvedTime 语义）。 */
function pendoloBuildTimeline(line, graphemes) {
  var n = graphemes.length;
  var tl = new Array(n);
  if (!n) return tl;
  var text = line && line.text || '';
  if (!line || !line.words || !line.words.length) {
    var t0 = (line && line.t) || 0;
    var dur = Math.max(0, (line && line.duration) || 0);
    var unit = dur / n;
    for (var i = 0; i < n; i++) tl[i] = { s: t0 + unit * i, e: t0 + unit * (i + 1) };
    return tl;
  }
  /* code unit → grapheme 序号映射（computeGraffitiReveals 同款换算） */
  var cuToG = new Array(text.length + 1);
  var cu = 0;
  for (var ci = 0; ci < n; ci++) {
    var cpLen = graphemes[ci].length;
    for (var k = 0; k < cpLen; k++) cuToG[cu + k] = ci;
    cu += cpLen;
  }
  cuToG[text.length] = n;
  var lastResolved = line.t || 0;
  for (var wi = 0; wi < line.words.length; wi++) {
    var w = line.words[wi];
    if (!w) continue;
    var cu0 = Math.max(0, Math.min(text.length, w.c0 != null ? w.c0 : 0));
    var cu1 = Math.max(0, Math.min(text.length, w.c1 != null ? w.c1 : cu0));
    var g0 = cuToG[cu0] || 0;
    var g1 = cuToG[cu1]; if (g1 == null) g1 = n;
    if (g1 <= g0) g1 = g0 + 1;
    var ws = (w.t != null ? w.t : (line.t || 0));
    var we = ws + Math.max(0, w.d || 0);
    var span = Math.max(1, g1 - g0);
    for (var gi = g0; gi < g1 && gi < n; gi++) {
      var frac = (gi - g0) / span;
      tl[gi] = { s: ws + (we - ws) * frac, e: ws + (we - ws) * ((gi - g0 + 1) / span) };
    }
    lastResolved = Math.max(lastResolved, we);
  }
  for (var f = 0; f < n; f++) {
    if (!tl[f]) tl[f] = { s: lastResolved, e: lastResolved };
  }
  return tl;
}

/* ---------- 视口几何（VisualizerPendolo 布局段照搬） ---------- */
function pendoloRecomputeView() {
  var w = Math.round(window.innerWidth || 1280);
  var h = Math.round(window.innerHeight || 800);
  var cx = w * PENDOLO_TUNING.wheelCenterX;
  var cy = h * PENDOLO_TUNING.wheelCenterY;
  var minDim = Math.min(w, h);
  var baseR = minDim * PENDOLO_TUNING.arcRadius;
  var ringR = baseR + minDim * 0.06;
  var maxItemX = cx + baseR;
  var textW = Math.max(140, Math.min(w * 0.46, w - maxItemX - 48));
  var totalArc = (PENDOLO_TUNING.arcAngleDeg * Math.PI) / 180;
  var changed = pendoloView.w !== w || pendoloView.h !== h;
  pendoloView = {
    w: w, h: h, cx: cx, cy: cy, baseR: baseR, ringR: ringR,
    textW: textW, totalArc: totalArc,
    angleStep: totalArc / Math.max(1, PENDOLO_VISIBLE_WINDOW - 1)
  };
  if (changed) pendoloLayoutStamp = -1;   /* 视口变了：布局失效 */
}

/* 字体（跟随 fx.lyricFont；测量与 DOM 同一 spec） */
function pendoloFontSpec(px) {
  var stack = (typeof lyricFontStackForKey === 'function' && typeof fx !== 'undefined' && fx && fx.lyricFont)
    ? lyricFontStackForKey(fx.lyricFont)
    : 'Inter,"Noto Sans SC","PingFang SC","Microsoft YaHei",Arial,sans-serif';
  var weight = (typeof lyricFontWeightValue === 'function') ? lyricFontWeightValue() : 700;
  return weight + ' ' + px + 'px ' + stack;
}
function pendoloCheckFontChange() {
  var key = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  if (key !== pendoloFontKey) {
    pendoloFontKey = key;
    pendoloHeightCache = [];
    pendoloLayoutStamp = -1;
    var overlay = document.getElementById('pendolo-overlay');
    if (overlay) {
      overlay.style.setProperty('--pd-font',
        (typeof lyricFontStackForKey === 'function' && key) ? lyricFontStackForKey(key)
          : 'Inter,"Noto Sans SC","PingFang SC","Microsoft YaHei",Arial,sans-serif');
      /* 测量 fontSpec 用 lyricFontWeightValue()，DOM 必须同字重才不与测量错位 */
      overlay.style.setProperty('--pd-weight', String((typeof lyricFontWeightValue === 'function') ? lyricFontWeightValue() : 700));
    }
  }
}

/* ---------- 行块高度（lineBlockHeights：焦点态预留，±10 窗口外为 0） ---------- */
function pendoloLineBlockHeight(i, targetIdx) {
  var lines = lyricsLines || [];
  var line = lines[i];
  if (!line) return 0;
  if (Math.abs(i - targetIdx) > 10) return 0;
  var fontPx = 28 * ((typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1);
  var measureWidth = pendoloView.textW / PENDOLO_TUNING.activeScale;
  var spec = pendoloFontSpec(fontPx);
  var key = (line.text || '') + '|' + Math.round(measureWidth) + '|' + spec + '|' + !!line.translation;
  var cached = pendoloHeightCache[i];
  if (cached && cached.key === key) return cached.h;
  var mainH = pendoloWrapText(line.text, spec, measureWidth, Math.round(fontPx * 1.2)).height;
  /* 字幕轨：仅翻译单行（本项目无音译数据），focal 16px / 行高 1.5 / gap 0.25em，
     占位按焦点态（最大）预留，避免放大后与邻行重叠（Folia 同策略） */
  var trText = pendoloReadableSubtitle(line.translation && line.translation.text) ? line.translation.text : '';
  var trH = 0;
  if (trText) {
    var trPx = 16;
    trH = pendoloWrapText(trText, '500 ' + trPx + 'px ' + (typeof lyricFontStackForKey === 'function' && pendoloFontKey ? lyricFontStackForKey(pendoloFontKey) : 'Inter,"Noto Sans SC",sans-serif'),
      measureWidth, Math.round(trPx * 1.5)).height + 0.25 * trPx;
  }
  var h = (mainH + trH) * PENDOLO_TUNING.activeScale;
  pendoloHeightCache[i] = { key: key, h: h };
  return h;
}
/* isPendoloReadableSubtitle：占位行（纯符号）不作字幕 */
var PENDOLO_READABLE_RE = /[\p{L}\p{N}]/u;
function pendoloReadableSubtitle(text) {
  return !!(text && PENDOLO_READABLE_RE.test(text));
}

/* ---------- 弧形轮布局（calculatePendoloWheelLayout 照搬） ---------- */
function pendoloCalcLayout(targetLineIndex) {
  var lines = lyricsLines || [];
  var v = pendoloView;
  var centerX = v.cx, centerY = v.cy;
  var baseRadius = v.baseR;
  var angleStepRad = v.angleStep;
  var isIntegerTarget = Math.round(targetLineIndex) === targetLineIndex;
  var activeIndex = (isIntegerTarget && targetLineIndex >= 0 && targetLineIndex < lines.length) ? targetLineIndex : -1;
  var hasActive = activeIndex >= 0;
  var items = [];
  var centerRef = Math.max(0, Math.min(lines.length - 1, Math.floor(targetLineIndex >= 0 ? targetLineIndex : 0)));
  var windowStart = Math.max(0, centerRef - 8);
  var windowEnd = Math.min(lines.length - 1, centerRef + 8);
  var visualAngles = null;
  if (isIntegerTarget && targetLineIndex >= windowStart && targetLineIndex <= windowEnd) {
    visualAngles = [];
    visualAngles[activeIndex] = 0;
    for (var index = activeIndex + 1; index <= windowEnd; index += 1) {
      var prevH = pendoloLineBlockHeight(index - 1, targetLineIndex);
      var curH = pendoloLineBlockHeight(index, targetLineIndex);
      var spacing = Math.max(angleStepRad, (prevH + curH + 24) / (2 * baseRadius));
      visualAngles[index] = (visualAngles[index - 1] || 0) + spacing;
    }
    for (var index2 = activeIndex - 1; index2 >= windowStart; index2 -= 1) {
      var nextH = pendoloLineBlockHeight(index2 + 1, targetLineIndex);
      var curH2 = pendoloLineBlockHeight(index2, targetLineIndex);
      var spacing2 = Math.max(angleStepRad, (nextH + curH2 + 24) / (2 * baseRadius));
      visualAngles[index2] = (visualAngles[index2 + 1] || 0) - spacing2;
    }
  }
  for (var i = windowStart; i <= windowEnd; i++) {
    var line = lines[i];
    if (!line || line.fallback) continue;
    var distanceIndex = i - targetLineIndex;
    var rawAngleRad = (visualAngles ? (visualAngles[i] != null ? visualAngles[i] : distanceIndex * angleStepRad) : distanceIndex * angleStepRad);
    if (Math.abs(rawAngleRad) >= Math.PI / 2) continue;
    var x = centerX + baseRadius * Math.cos(rawAngleRad);
    var y = centerY + baseRadius * Math.sin(rawAngleRad);
    var isActive = hasActive && i === activeIndex;
    var absDistance = Math.abs(distanceIndex);
    var alpha = Math.max(0.12, Math.pow(Math.cos(rawAngleRad * 0.75), 2.5) * (1 - absDistance * 0.18));
    var scale = isActive ? PENDOLO_TUNING.activeScale : Math.max(0.7, 1 - absDistance * 0.08);
    items.push({
      line: line, index: i,
      angleRad: rawAngleRad, angleDeg: (rawAngleRad * 180) / Math.PI,
      x: x, y: y, isActive: isActive, distanceFromActive: absDistance,
      alpha: alpha, scale: scale
    });
  }
  return items;
}

/* ---------- 目标锚点解析（resolvePendoloFallbackAnchorIndex 照搬 + 手动滚动） ---------- */
function pendoloResolveTarget(nowTime) {
  var lines = lyricsLines || [];
  if (pendoloManualAnchor != null) return pendoloManualAnchor;
  var hasReal = false;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i] && !lines[i].fallback && lines[i].text) { hasReal = true; break; }
  }
  if (!hasReal) {
    /* instrumental：无词纯机械演示，每 5s 步进一齿（Folia instrumentalIndex） */
    return Math.floor(nowTime / PENDOLO_INSTRUMENTAL_SECONDS_PER_FRAME);
  }
  var currentLineIndex = (typeof findStageLyricIndexAtTime === 'function') ? findStageLyricIndexAtTime(nowTime) : -1;
  if (currentLineIndex >= 0 && currentLineIndex < lines.length) {
    var cl = lines[currentLineIndex];
    var lineEnd = cl.t + Math.max(0, cl.duration || 0);
    var nextStart = (currentLineIndex + 1 < lines.length) ? lines[currentLineIndex + 1].t : Infinity;
    pendoloLastValidIdx = currentLineIndex;
    pendoloHasObservedLine = true;
    /* 歌尾优先：超过最后一行结束时刻 → lines.length 全部转出（Folia finalRenderEndTime 语义） */
    if (currentLineIndex === lines.length - 1 && nowTime > lineEnd && !cl.fallback) {
      return lines.length;
    }
    /* 行间空隙（间奏）：Folia 语义是 currentLineIndex=-1 → 半步；MineRadio 的
       findStageLyricIndexAtTime 在间隙仍返回上一行，这里按行结束时刻补判定 */
    if (nowTime > lineEnd && nowTime < nextStart && !cl.fallback) {
      return currentLineIndex + 0.5;      /* 半步：轮转两行中间（Folia lastValid+0.5） */
    }
    return currentLineIndex;
  }
  if (!pendoloHasObservedLine) return -1;
  var finalLine = lines[lines.length - 1];
  var finalEnd = finalLine ? finalLine.t + Math.max(0, finalLine.duration || 0) : 0;
  if (nowTime > finalEnd) return lines.length;   /* 歌尾：全部转出 */
  return pendoloLastValidIdx + 0.5;
}

/* ---------- Canvas 钟表机械（PendoloClockworkCanvas 照搬） ---------- */
function pendoloDrawGearTeeth(ctx, cx, cy, radius, teethCount, toothDepth, rotationRad, strokeColor, lineWidth, fillColor) {
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
    if (i === 0) ctx.moveTo(x0, y0); else ctx.lineTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
  }
  ctx.closePath();
  if (fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

function pendoloDrawSpokedWheel(ctx, cx, cy, hubR, rimR, spokeCount, rotationRad, strokeColor, lineWidth) {
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
    var a2 = j * angleStep + angleStep * 0.5;
    ctx.beginPath();
    ctx.arc(midR * Math.cos(a2), midR * Math.sin(a2), holeR, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function pendoloDrawHairspring(ctx, cx, cy, startR, endR, coils, oscillationRad, strokeColor, lineWidth) {
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
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

/* resolveClockworkBox 照搬：canvas 只占机械包围盒，不铺全屏透明像素 */
function pendoloResolveBox() {
  var v = pendoloView;
  var reach = v.baseR * (PENDOLO_TUNING.showCenterGradient ? 1.65 : 1.4) + 16;
  var rightReach = Math.max(reach, v.ringR + 16);
  var left = Math.max(0, Math.floor(v.cx - reach));
  var top = Math.max(0, Math.floor(v.cy - reach));
  var right = Math.min(v.w, Math.ceil(v.cx + rightReach));
  var bottom = Math.min(v.h, Math.ceil(v.cy + reach));
  pendoloBox = {
    left: left, top: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function pendoloEnsureCanvas() {
  if (!pendoloCanvas) pendoloCanvas = document.getElementById('pendolo-canvas');
  if (pendoloCanvas && !pendoloCtx) pendoloCtx = pendoloCanvas.getContext('2d');
  pendoloResolveBox();
  pendoloCenterGrad = null;   /* box/半径变了，中心渐变缓存失效 */
  var wheel = document.getElementById('pendolo-wheel');
  if (wheel) wheel.style.transformOrigin = pendoloView.cx + 'px ' + pendoloView.cy + 'px';
  if (pendoloCanvas) {
    pendoloCanvas.style.left = pendoloBox.left + 'px';
    pendoloCanvas.style.top = pendoloBox.top + 'px';
    pendoloCanvas.style.width = pendoloBox.width + 'px';
    pendoloCanvas.style.height = pendoloBox.height + 'px';
  }
  /* 摆轮装饰图标定位（Folia BalanceIcon：balanceGear 处） */
  var icon = document.getElementById('pendolo-balance-icon');
  if (icon) {
    icon.style.left = (pendoloView.cx + pendoloView.baseR * 0.2) + 'px';
    icon.style.top = (pendoloView.cy - pendoloView.baseR * 0.75) + 'px';
    icon.style.fontSize = Math.max(14, pendoloView.baseR * 0.13) + 'px';
  }
}

/* 一帧机械绘制（Folia render() 帧体照搬，颜色全部预计算零分配） */
function pendoloTickClock(dt, escapementAngle, bassOscillation) {
  if (!pendoloCtx || !pendoloGearColors) return;
  var ctx = pendoloCtx;
  var box = pendoloBox;
  var width = box.width, height = box.height;
  if (width <= 0 || height <= 0) return;
  var dpr = window.devicePixelRatio || 1;
  var pixelWidth = Math.round(width * dpr);
  var pixelHeight = Math.round(height * dpr);
  if (pendoloCanvas.width !== pixelWidth || pendoloCanvas.height !== pixelHeight) {
    pendoloCanvas.width = pixelWidth;
    pendoloCanvas.height = pixelHeight;
  }
  var v = pendoloView;
  var cx = v.cx, cy = v.cy, baseR = v.baseR, ringR = v.ringR;
  var C = pendoloGearColors;
  var currentGearAngle = escapementAngle;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.translate(-box.left, -box.top);

  /* 0. 中央暗径向渐变（缓存：坐标半径固定，仅 resize 重建） */
  if (PENDOLO_TUNING.showCenterGradient) {
    var gradientR = baseR * 1.65;
    if (!pendoloCenterGrad) {
      pendoloCenterGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, gradientR);
      pendoloCenterGrad.addColorStop(0, pendoloAlpha(PENDOLO_BG_COLOR, 0.72));
      pendoloCenterGrad.addColorStop(0.35, pendoloAlpha(PENDOLO_BG_COLOR, 0.52));
      pendoloCenterGrad.addColorStop(0.7, pendoloAlpha(PENDOLO_BG_COLOR, 0.20));
      pendoloCenterGrad.addColorStop(1, pendoloAlpha(PENDOLO_BG_COLOR, 0));
    }
    ctx.fillStyle = pendoloCenterGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, gradientR, 0, Math.PI * 2);
    ctx.fill();
  }

  /* 1. 同心引导环 */
  ctx.strokeStyle = C.primaryA15;
  ctx.lineWidth = 1;
  var ringRadii = [baseR * 0.3, baseR * 0.6, baseR * 0.85, baseR * 1.15, baseR * 1.4];
  for (var ri = 0; ri < ringRadii.length; ri++) {
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadii[ri], 0, Math.PI * 2);
    ctx.stroke();
  }

  /* 外圈径向刻度（每 6°，主刻度每 30°） */
  var tickCount = 60;
  var outerTickR = baseR * 1.15;
  for (var ti = 0; ti < tickCount; ti++) {
    var angle = (ti * Math.PI * 2) / tickCount + currentGearAngle * 0.2;
    var isMajor = ti % 5 === 0;
    var tickLen = isMajor ? 12 : 6;
    var x1 = cx + outerTickR * Math.cos(angle);
    var y1 = cy + outerTickR * Math.sin(angle);
    var x2 = cx + (outerTickR + tickLen) * Math.cos(angle);
    var y2 = cy + (outerTickR + tickLen) * Math.sin(angle);
    ctx.strokeStyle = isMajor ? C.accentA35 : C.primaryA15;
    ctx.lineWidth = isMajor ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /* 2. 主擒纵轮（36 齿）+ 内辐条轮 */
  pendoloDrawGearTeeth(ctx, cx, cy, baseR + 8, 36, 10, currentGearAngle, C.gearAccent, 2.2, C.mainFill);
  pendoloDrawSpokedWheel(ctx, cx, cy, baseR * 0.2, baseR * 0.85, 6, currentGearAngle, C.gearPrimary, 1.8);

  /* 主轮缘双环 */
  ctx.strokeStyle = C.primaryA18;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(cx, cy, baseR * 0.88, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, baseR * 0.92, 0, Math.PI * 2);
  ctx.stroke();

  /* 玑镂放射刻纹（48 根长短交替） */
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(currentGearAngle);
  var guillocheRayCount = 48;
  var guillocheInnerR = baseR * 0.62;
  var guillocheOuterR = baseR * 0.83;
  for (var gi = 0; gi < guillocheRayCount; gi++) {
    var ga = (gi * Math.PI * 2) / guillocheRayCount;
    var innerOffset = gi % 2 === 0 ? guillocheInnerR : guillocheInnerR + (guillocheOuterR - guillocheInnerR) * 0.3;
    ctx.strokeStyle = gi % 2 === 0 ? C.primaryA10 : C.primaryA07;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(innerOffset * Math.cos(ga), innerOffset * Math.sin(ga));
    ctx.lineTo(guillocheOuterR * Math.cos(ga), guillocheOuterR * Math.sin(ga));
    ctx.stroke();
  }
  ctx.restore();

  /* 外缘铆钉圆 */
  var rivetCount = 12;
  var rivetR = baseR * 0.96;
  ctx.strokeStyle = C.primaryA25;
  ctx.lineWidth = 0.8;
  for (var rv = 0; rv < rivetCount; rv++) {
    var ra = (rv * Math.PI * 2) / rivetCount + currentGearAngle;
    ctx.beginPath();
    ctx.arc(cx + rivetR * Math.cos(ra), cy + rivetR * Math.sin(ra), 2.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* 3. 中心毂 + 太阳轮（反向 2.5×）+ 宝石轴承 */
  pendoloDrawGearTeeth(ctx, cx, cy, baseR * 0.22, 12, 6, -currentGearAngle * 2.5, C.gearAccentStrong, 2.1);
  ctx.strokeStyle = C.jewelStroke;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.jewelFill;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.stroke();

  /* 4. 行星轮×3 */
  var planetCount = 3;
  var orbitR = baseR * 0.52;
  var planetR = baseR * 0.16;
  var orbitAngleBase = currentGearAngle * 0.4;
  for (var pi = 0; pi < planetCount; pi++) {
    var planetAngle = orbitAngleBase + (pi * Math.PI * 2) / planetCount;
    var px = cx + orbitR * Math.cos(planetAngle);
    var py = cy + orbitR * Math.sin(planetAngle);
    pendoloDrawGearTeeth(ctx, px, py, planetR, 14, 5, -currentGearAngle * 3 + pi * 0.5, C.planet, 1.7);
    ctx.strokeStyle = C.jewelStroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = C.jewelFill;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(px, py, 1.8, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* 5. 左上摆轮齿轮 + 游丝 + 轴承 */
  var balanceCx = cx + baseR * 0.2;
  var balanceCy = cy - baseR * 0.75;
  var balanceR = baseR * 0.28;
  var balanceGearAngle = pendoloPhase * 0.1;
  pendoloDrawGearTeeth(ctx, balanceCx, balanceCy, balanceR, 20, 7, balanceGearAngle, C.gearAccentStrong, 2.1, C.balanceFill);
  ctx.strokeStyle = C.gearPrimarySubtle;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(balanceCx, balanceCy, balanceR * 0.52, 0, Math.PI * 2);
  ctx.stroke();
  pendoloDrawHairspring(ctx, balanceCx, balanceCy, balanceR * 0.56, balanceR * 0.88, 3.5,
    bassOscillation * 0.6 + balanceGearAngle * 0.3, C.hairspring, 0.8);
  ctx.strokeStyle = C.jewelStroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(balanceCx, balanceCy, 3.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.jewelFill;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(balanceCx, balanceCy, 1.8, 0, Math.PI * 2);
  ctx.stroke();

  /* 左下传动轮 + 日内瓦纹 + 辐条 */
  var transCx = cx + baseR * 0.32;
  var transCy = cy + baseR * 0.78;
  var transR = baseR * 0.34;
  pendoloDrawGearTeeth(ctx, transCx, transCy, transR, 24, 7, -currentGearAngle * 1.4, C.gearPrimary, 1.8);
  pendoloDrawSpokedWheel(ctx, transCx, transCy, transR * 0.25, transR * 0.85, 5, -currentGearAngle * 1.4, C.gearPrimarySubtle, 1.5);
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
    ctx.strokeStyle = gs % 2 === 0 ? C.primaryA10 : C.primaryA06;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-transR, yOff);
    ctx.lineTo(transR, yOff);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = C.jewelStroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(transCx, transCy, 3.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.jewelFill;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(transCx, transCy, 1.8, 0, Math.PI * 2);
  ctx.stroke();

  /* 秒轮：每播放秒一齿棘轮步进（弹簧追步） */
  var secondGearCx = cx + baseR * 0.68;
  var secondGearCy = cy + baseR * 0.76;
  var secondGearR = baseR * 0.16;
  var secondGearAngle = pendoloSecAngle;
  pendoloDrawGearTeeth(ctx, secondGearCx, secondGearCy, secondGearR, 15, 5, secondGearAngle, C.gearAccent, 1.8, C.secondsFill);
  pendoloDrawSpokedWheel(ctx, secondGearCx, secondGearCy, secondGearR * 0.28, secondGearR * 0.76, 4, -secondGearAngle, C.gearPrimarySubtle, 1.3);
  ctx.strokeStyle = C.jewelStroke;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(secondGearCx, secondGearCy, 2.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.jewelFill;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(secondGearCx, secondGearCy, 1.5, 0, Math.PI * 2);
  ctx.stroke();

  /* 惰轮 */
  var idlerCx = (transCx + secondGearCx) * 0.5 + baseR * 0.04;
  var idlerCy = (transCy + secondGearCy) * 0.5 - baseR * 0.02;
  var idlerR = baseR * 0.08;
  pendoloDrawGearTeeth(ctx, idlerCx, idlerCy, idlerR, 10, 3.5, currentGearAngle * 2.2, C.primaryA28, 1.3);
  ctx.strokeStyle = C.primaryA18;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(idlerCx, idlerCy, idlerR * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.jewelStroke;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(idlerCx, idlerCy, 2.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.jewelFill;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(idlerCx, idlerCy, 1.2, 0, Math.PI * 2);
  ctx.stroke();

  /* 6. 焦点轴对准线 + 箭头（0° 水平向右） */
  var focalAxisEndRadius = Math.min(ringR - Math.max(14, baseR * 0.025));
  ctx.strokeStyle = C.gearAccentStrong;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + baseR * 0.8, cy);
  ctx.lineTo(cx + focalAxisEndRadius, cy);
  ctx.stroke();
  var arrowX = cx + focalAxisEndRadius;
  ctx.fillStyle = C.gearAccentStrong;
  ctx.beginPath();
  ctx.moveTo(arrowX, cy - 4);
  ctx.lineTo(arrowX + 8, cy);
  ctx.lineTo(arrowX, cy + 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/* ---------- 音频特征（覆盖层自算，rainy 同款闸门） ---------- */
function pendoloBinAvg(from, to) {
  var spec = (typeof motionSignalGet === 'function') ? motionSignalGet('spectrum') : null;
  if (!spec || !spec.length) spec = (typeof frequencyData !== 'undefined') ? frequencyData : null;
  if (!spec || !spec.length) return 0;
  var sum = 0, n = 0;
  var hi = Math.min(to, spec.length - 1);
  for (var i = from; i <= hi; i++) { sum += spec[i]; n++; }
  return n ? (sum / n) / 255 : 0;
}
function pendoloTickAudio(dt) {
  pendoloSyncTheme();
  var bassRaw = pendoloBinAvg(1, 8);
  pendoloBass = pendoloBass + (bassRaw - pendoloBass) * Math.min(1, dt * 9);
  var energyRaw = pendoloBinAvg(2, 160) * 0.7 + pendoloBinAvg(161, 300) * 0.3;
  pendoloEnergy = pendoloEnergy + (energyRaw - pendoloEnergy) * Math.min(1, dt * 3.2);
  var chorusTarget = Math.max(0, Math.min(1, (pendoloEnergy - 0.34) / 0.30));
  var k = chorusTarget > pendoloChorus ? 0.9 : 0.35;
  pendoloChorus += (chorusTarget - pendoloChorus) * Math.min(1, dt * k);
  /* chorus 类滞回切换（accentMix 0.32→0.58 / glow 开关的 DOM 等价） */
  if (!pendoloChorusOn && pendoloChorus > 0.34) pendoloChorusOn = true;
  else if (pendoloChorusOn && pendoloChorus < 0.20) pendoloChorusOn = false;
}

/* ---------- DOM 行槽 ---------- */
function pendoloEnsureSlots() {
  if (pendoloSlots) return;
  pendoloWheelEl = document.getElementById('pendolo-wheel');
  if (!pendoloWheelEl) return;
  pendoloSlots = [];
  for (var i = 0; i < PENDOLO_SLOT_COUNT; i++) {
    var root = document.createElement('div');
    root.className = 'pd-line';
    var tilt = document.createElement('div');
    tilt.className = 'pd-line-tilt';
    var body = document.createElement('div');
    body.className = 'pd-line-body';
    var halo = document.createElement('div');
    halo.className = 'pd-line-halo';
    var main = document.createElement('div');
    main.className = 'pd-line-main';
    var tr = document.createElement('div');
    tr.className = 'pd-line-tr';
    body.appendChild(halo);
    body.appendChild(main);
    body.appendChild(tr);
    tilt.appendChild(body);
    root.appendChild(tilt);
    pendoloWheelEl.appendChild(root);
    pendoloSlots.push({
      root: root, tilt: tilt, body: body, halo: halo, main: main, tr: tr,
      lineIdx: -1, focal: false, sweep: null
    });
  }
}

function pendoloEscapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* 非焦点行：显式分行渲染（与测量同源，杜绝 CSS 自动断行错位） */
function pendoloRenderIdleContent(slot, item) {
  var fontPx = 22 * ((typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1);
  var spec = pendoloFontSpec(fontPx);
  var maxW = pendoloView.textW / item.scale;
  var layout = pendoloWrapText(item.line.text, spec, maxW, Math.round(fontPx * 1.2));
  var html = '';
  for (var i = 0; i < layout.rows.length; i++) {
    html += '<div class="pd-row" style="width:' + Math.ceil(layout.rows[i].width) + 'px">' +
      pendoloEscapeHtml(layout.rows[i].text) + '</div>';
  }
  slot.main.innerHTML = html;
  slot.main.style.fontSize = fontPx + 'px';
  slot.main.classList.remove('is-focal');
}

/* 焦点行：双层逐字扫光（PendoloActiveLyricSweep 等价）
   底层 = 全文 0.52 透明度；fill 层 = 已唱色 + mask 按 fillWidth 揭示。
   grapheme 前缀宽度在构建时一次算好，每帧只做时间→宽度插值。 */
function pendoloRenderFocalContent(slot, item) {
  var fontPx = 28 * ((typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1);
  var spec = pendoloFontSpec(fontPx);
  var lineHeight = Math.round(fontPx * 1.2);
  var maxW = pendoloView.textW / item.scale;
  var layout = pendoloWrapText(item.line.text, spec, maxW, lineHeight);
  var graphemes = pendoloGraphemes(item.line.text);
  var timeline = pendoloBuildTimeline(item.line, graphemes);
  var ctx = pendoloMeasureCtxEnsure();
  ctx.font = spec;
  var html = '';
  var sweepRows = [];
  for (var i = 0; i < layout.rows.length; i++) {
    var row = layout.rows[i];
    /* 行内 grapheme 前缀宽度（measureMonetGraphemeOffsets 等价） */
    var offsets = [0];
    for (var g = row.gStart + 1; g <= row.gEnd; g++) {
      offsets.push(ctx.measureText(graphemes.slice(row.gStart, g).join('')).width);
    }
    var text = pendoloEscapeHtml(row.text);
    html += '<div class="pd-row pd-sweep-row" style="width:' + Math.ceil(row.width) + 'px;height:' + lineHeight + 'px">' +
      '<div class="pd-row-base">' + text + '</div>' +
      '<div class="pd-row-fill" data-r="' + i + '">' + text + '</div>' +
      '</div>';
    sweepRows.push({
      fill: null,
      offsets: offsets,
      timings: timeline.slice(row.gStart, row.gEnd),
      fullWidth: offsets[offsets.length - 1] || row.width,
      lineEnd: (item.line.t || 0) + Math.max(0, item.line.duration || 0),
      firstStart: timeline.length && timeline[row.gStart] ? timeline[row.gStart].s : null
    });
  }
  slot.main.innerHTML = html;
  slot.main.style.fontSize = fontPx + 'px';
  slot.main.classList.add('is-focal');
  var fills = slot.main.querySelectorAll('.pd-row-fill');
  for (var f = 0; f < fills.length && f < sweepRows.length; f++) sweepRows[f].fill = fills[f];
  slot.sweep = { rows: sweepRows, fontPx: fontPx };
}

function pendoloRenderSlot(slot, item) {
  var line = item.line;
  slot.lineIdx = item.index;
  slot.focal = item.isActive;
  slot.root.style.left = item.x + 'px';
  slot.root.style.top = item.y + 'px';
  slot.root.style.display = '';
  slot.body.classList.toggle('is-focal', item.isActive);
  if (item.isActive) {
    pendoloRenderFocalContent(slot, item);
  } else {
    slot.sweep = null;
    pendoloRenderIdleContent(slot, item);
  }
  /* 翻译字幕轨（resolvePendoloSubtitleTracks 单行等价：focal 16 / idle 12，
     gap 0.25em，行高 1.5；第二行音译本项目无数据源不渲染） */
  var trText = (line.translation && pendoloReadableSubtitle(line.translation.text)) ? line.translation.text : '';
  if (trText) {
    var trPx = item.isActive ? 16 : 12;
    var trSpec = '500 ' + trPx + 'px ' + ((typeof lyricFontStackForKey === 'function' && pendoloFontKey) ? lyricFontStackForKey(pendoloFontKey) : 'Inter,"Noto Sans SC",sans-serif');
    var trLayout = pendoloWrapText(trText, trSpec, pendoloView.textW / item.scale, Math.round(trPx * 1.5));
    var trHtml = '';
    for (var i = 0; i < trLayout.rows.length; i++) {
      trHtml += '<div>' + pendoloEscapeHtml(trLayout.rows[i].text) + '</div>';
    }
    slot.tr.innerHTML = trHtml;
    slot.tr.style.fontSize = trPx + 'px';
    slot.tr.style.display = '';
  } else {
    slot.tr.innerHTML = '';
    slot.tr.style.display = 'none';
  }
}

/* 布局重算（低频：锚点半步粒度或视口/字体变化） */
function pendoloRelayout(force) {
  var stamp = Math.round(pendoloTickTarget * 2);
  if (!force && stamp === pendoloLayoutStamp) return;
  pendoloLayoutStamp = stamp;
  pendoloItems = pendoloCalcLayout(pendoloTickTarget);
  pendoloEnsureSlots();
  if (!pendoloSlots) return;
  var lines = lyricsLines || [];
  var hasReal = false;
  for (var c = 0; c < lines.length; c++) {
    if (lines[c] && !lines[c].fallback && lines[c].text) { hasReal = true; break; }
  }
  for (var i = 0; i < pendoloSlots.length; i++) {
    var slot = pendoloSlots[i];
    var item = hasReal && i < pendoloItems.length ? pendoloItems[i] : null;
    if (!item) {
      slot.root.style.display = 'none';
      slot.lineIdx = -1;
      slot.sweep = null;
      continue;
    }
    pendoloRenderSlot(slot, item);
  }
}

/* ---------- 每帧 DOM 更新（容器旋转 + 行反旋修正/透明度 + 扫光推进） ---------- */
var PENDOLO_VISIBLE_ARC_DEG = 110;
var PENDOLO_EDGE_FADE_DEG = 28;

function pendoloTickDom(wheelRotationDeg, nowTime) {
  if (!pendoloWheelEl || !pendoloSlots) return;
  pendoloWheelEl.style.transform = 'rotate(' + wheelRotationDeg.toFixed(3) + 'deg)';
  for (var i = 0; i < pendoloSlots.length; i++) {
    var slot = pendoloSlots[i];
    if (slot.lineIdx < 0) continue;
    var item = pendoloItems[i];
    if (!item) continue;
    /* 透明度：弧可见门控（resolvePendoloRotatingLineOpacity 照搬） */
    var visibleAngleDeg = Math.abs(item.angleDeg + wheelRotationDeg);
    var opacity = 0;
    if (visibleAngleDeg < PENDOLO_VISIBLE_ARC_DEG) {
      var edgeProgress = Math.min(1, (PENDOLO_VISIBLE_ARC_DEG - visibleAngleDeg) / PENDOLO_EDGE_FADE_DEG);
      opacity = item.alpha * edgeProgress;
    }
    slot.root.style.opacity = opacity.toFixed(3);
    /* 反旋修正 -0.65×轮转 + 行自倾 0.35×角（三层 transform 合并，同 origin 可合成） */
    slot.tilt.style.transform = 'rotate(' + (-wheelRotationDeg * 0.65 + item.angleDeg * 0.35).toFixed(3) +
      'deg) scale(' + item.scale.toFixed(3) + ')';
    /* 焦点行扫光推进 */
    if (slot.focal && slot.sweep) {
      var rows = slot.sweep.rows;
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        if (!row.fill) continue;
        var fillW = 0;
        var tms = row.timings;
        if (!tms || !tms.length) {
          fillW = nowTime >= row.lineEnd ? row.fullWidth : 0;
        } else if (nowTime <= tms[0].s) {
          fillW = 0;
        } else {
          fillW = row.fullWidth;
          for (var ti = 0; ti < tms.length; ti++) {
            var timing = tms[ti];
            if (!timing) continue;
            var startW = row.offsets[ti] || 0;
            var endW = row.offsets[ti + 1] != null ? row.offsets[ti + 1] : startW;
            if (nowTime < timing.s) { fillW = startW; break; }
            if (nowTime <= timing.e) {
              fillW = startW + (endW - startW) * ((nowTime - timing.s) / Math.max(0.001, timing.e - timing.s));
              break;
            }
          }
        }
        row.fill.style.setProperty('--pd-fill', fillW.toFixed(1) + 'px');
        var show = !row.firstStart || nowTime >= row.firstStart;
        if (show) row.fill.style.opacity = '1'; else row.fill.style.opacity = '0';
      }
      /* 副歌呈现（chorus halo / glow）：能量闸门驱动 */
      slot.body.classList.toggle('is-chorus', pendoloChorusOn);
      slot.body.style.setProperty('--pd-halo', (pendoloChorusOn ? PENDOLO_PROFILE.chorusHaloOpacity * Math.min(1, pendoloChorus * 1.6) : 0).toFixed(3));
    }
  }
}

/* ---------- 手动滚动（Folia rail 交互照搬） ---------- */
function pendoloGetScrollDirection(delta) {
  if (Math.abs(delta) < 1) return 0;
  return delta > 0 ? 1 : -1;
}
function pendoloClampScrollSteps(steps) {
  if (Math.abs(steps) > 5) return steps > 0 ? 5 : -5;
  return steps;
}
function pendoloScheduleManualReset() {
  if (pendoloManualResetTimer) clearTimeout(pendoloManualResetTimer);
  pendoloManualResetTimer = setTimeout(function () {
    pendoloManualAnchor = null;
    pendoloWheelAcc = 0;
    pendoloWheelDir = 0;
    pendoloTouchAcc = 0;
    pendoloTouchDir = 0;
    pendoloManualResetTimer = 0;
  }, PENDOLO_SCROLL_IDLE_RESET_MS);
}
function pendoloMoveManualAnchor(steps) {
  var lines = lyricsLines || [];
  var hasReal = false;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i] && !lines[i].fallback && lines[i].text) { hasReal = true; break; }
  }
  if (!hasReal) return;
  var base = pendoloManualAnchor != null ? pendoloManualAnchor : pendoloTickTarget;
  pendoloManualAnchor = Math.max(0, Math.min(lines.length - 1, Math.round(base + steps)));
  pendoloScheduleManualReset();
}
function pendoloOnWheel(e) {
  if (!pendoloMode) return;
  e.preventDefault();
  e.stopPropagation();
  var direction = pendoloGetScrollDirection(e.deltaY);
  if (direction !== 0 && pendoloWheelDir !== 0 && direction !== pendoloWheelDir) pendoloWheelAcc = 0;
  pendoloWheelDir = direction || pendoloWheelDir;
  pendoloWheelAcc += e.deltaY;
  var steps = pendoloClampScrollSteps(Math.trunc(pendoloWheelAcc / PENDOLO_SCROLL_STEP_PX));
  if (steps !== 0) {
    pendoloWheelAcc = 0;
    pendoloMoveManualAnchor(steps);
  } else {
    pendoloScheduleManualReset();
  }
}
function pendoloOnTouchStart(e) {
  if (!pendoloMode) return;
  e.stopPropagation();
  pendoloTouchLastY = e.touches && e.touches[0] ? e.touches[0].clientY : null;
  pendoloTouchAcc = 0;
  pendoloTouchDir = 0;
  pendoloScheduleManualReset();
}
function pendoloOnTouchMove(e) {
  if (!pendoloMode || pendoloTouchLastY == null) return;
  e.stopPropagation();
  var nextY = e.touches && e.touches[0] ? e.touches[0].clientY : null;
  if (typeof nextY !== 'number') return;
  var deltaY = pendoloTouchLastY - nextY;
  pendoloTouchLastY = nextY;
  var direction = pendoloGetScrollDirection(deltaY);
  if (direction !== 0 && pendoloTouchDir !== 0 && direction !== pendoloTouchDir) pendoloTouchAcc = 0;
  pendoloTouchDir = direction || pendoloTouchDir;
  pendoloTouchAcc += deltaY;
  var steps = pendoloClampScrollSteps(Math.trunc(pendoloTouchAcc / PENDOLO_TOUCH_STEP_PX));
  if (steps !== 0) {
    pendoloTouchAcc = 0;
    pendoloMoveManualAnchor(steps);
  } else {
    pendoloScheduleManualReset();
  }
}
function pendoloOnTouchEnd() {
  pendoloTouchLastY = null;
  pendoloTouchDir = 0;
  pendoloTouchAcc = 0;
  pendoloScheduleManualReset();
}

/* 行点击 seek（onLyricLineSeek 等价：seek 到行起点，回退校准偏移） */
function pendoloSeekLine(lineIdx, line) {
  if (!line || typeof audio === 'undefined' || !audio) return;
  if (pendoloManualResetTimer) {
    clearTimeout(pendoloManualResetTimer);
    pendoloManualResetTimer = 0;
  }
  var offset = (typeof getActiveLyricTimingOffsetSeconds === 'function') ? getActiveLyricTimingOffsetSeconds() : 0;
  try {
    audio.currentTime = Math.max(0, (line.t || 0) - offset);
  } catch (e) { }
  pendoloPendingSeekIdx = lineIdx;
  pendoloManualAnchor = lineIdx;
  pendoloWheelAcc = 0; pendoloWheelDir = 0;
  pendoloTouchAcc = 0; pendoloTouchDir = 0;
  /* seek 后 1.2s 释放手动锚点，让播放推进接管 */
  pendoloManualResetTimer = setTimeout(function () {
    pendoloManualAnchor = null;
    pendoloManualResetTimer = 0;
  }, 1200);
}

/* ---------- 歌词数据变化轮询（aurora 同款范式） ---------- */
function pendoloWatchLyricsChange() {
  var token = ++pendoloLyricsToken;
  function check() {
    if (token !== pendoloLyricsToken || !pendoloMode) return;
    var lines = lyricsLines || [];
    var sig = lines.length + '|' + (lines[0] ? (lines[0].text || '') : '');
    if (sig !== pendoloLastLyricsSig) {
      pendoloLastLyricsSig = sig;
      pendoloHeightCache = [];
      pendoloLastValidIdx = 0;
      pendoloHasObservedLine = false;
      pendoloManualAnchor = null;
      pendoloLayoutStamp = -1;
    }
    setTimeout(check, 600);
  }
  check();
}

/* ---------- 主循环（30fps rAF，aurora 同骨架） ---------- */
var pendoloLastTickWall = 0;
var pendoloLastFrameWall = 0;

function pendoloFrame(now) {
  if (!pendoloMode) return;
  var dt = Math.min(0.05, Math.max(0.001, (now - pendoloLastFrameWall) / 1000));
  pendoloLastFrameWall = now;
  if (now - pendoloLastTickWall > 33) {
    pendoloLastTickWall = now;
    pendoloTickAudio(dt);
    pendoloCheckFontChange();

    /* 播放时间（含歌词校准偏移；motionSignal 在覆盖层保温路径不更新，自取） */
    var nowTime = 0;
    try {
      nowTime = (typeof getAdjustedLyricPlaybackTime === 'function' && typeof audio !== 'undefined')
        ? getAdjustedLyricPlaybackTime(audio ? (audio.currentTime || 0) : 0) : 0;
    } catch (e) { nowTime = 0; }
    var paused = !(typeof audio !== 'undefined' && audio && !audio.paused);

    /* 目标锚点 + 棘轮弹簧（useSpring(targetLineIndex) 的显式积分） */
    pendoloTickTarget = pendoloResolveTarget(nowTime);
    if (pendoloPendingSeekIdx != null && Math.round(pendoloTickTarget) === pendoloPendingSeekIdx) {
      pendoloPendingSeekIdx = null;
    }
    var snap = PENDOLO_TUNING.tickSnappiness;
    var stiffness = 180 * snap * PENDOLO_PROFILE.escapementSpringMultiplier;
    var damping = (18 + 4 / Math.max(0.5, snap)) * PENDOLO_PROFILE.escapementDampingMultiplier;
    var mass = 0.8;
    var accel = (-stiffness * (pendoloTickPos - pendoloTickTarget) - damping * pendoloTickVel) / mass;
    pendoloTickVel += accel * dt;
    pendoloTickPos += pendoloTickVel * dt;

    /* 秒轮棘轮（每播放秒一齿，弹簧追步——Folia 逐帧公式照搬） */
    if (!paused) {
      pendoloSecElapsed += dt;
      var completedSteps = Math.floor(pendoloSecElapsed);
      if (completedSteps > 0) {
        pendoloSecStep += completedSteps;
        pendoloSecElapsed -= completedSteps;
      }
    }
    var secTarget = pendoloSecStep * (Math.PI * 2 / 15);
    var displacement = secTarget - pendoloSecAngle;
    pendoloSecVel += displacement * 92 * PENDOLO_PROFILE.escapementSpringMultiplier * dt;
    pendoloSecVel *= Math.exp(-13 * PENDOLO_PROFILE.escapementDampingMultiplier * dt);
    pendoloSecAngle += pendoloSecVel * dt;

    /* 摆轮相位 + bass 摆幅（Folia 公式照搬；smoothedBass 单独低通） */
    pendoloSmoothedBass += (pendoloBass - pendoloSmoothedBass)
      * Math.min(0.24, 0.12 * PENDOLO_PROFILE.bassResponseMultiplier);
    var bass = pendoloSmoothedBass;
    if (!paused) {
      pendoloPhase += dt * (2.8 + bass * 3.5 * PENDOLO_PROFILE.bassResponseMultiplier)
        * PENDOLO_PROFILE.balanceSpeedMultiplier;
    }
    var bassOscillation = Math.sin(pendoloPhase)
      * (0.15 + bass * 0.70 * PENDOLO_PROFILE.bassResponseMultiplier)
      * PENDOLO_PROFILE.balanceAmplitudeMultiplier;

    /* 齿轮角 = 棘轮弹簧值 × 步角（gearRotationAngleRad 照搬） */
    var gearAngle = pendoloTickPos * pendoloView.angleStep;

    /* DOM：布局（低频）→ 旋转/扫光（每帧） */
    pendoloRelayout(false);
    var wheelRotationDeg = -(pendoloTickPos - pendoloTickTarget) * pendoloView.angleStep * (180 / Math.PI);
    pendoloTickDom(wheelRotationDeg, nowTime);

    /* 机械 canvas */
    pendoloTickClock(dt, gearAngle, bassOscillation);
  }
  pendoloRafId = requestAnimationFrame(pendoloFrame);
}

/* ---------- 启动 / 停止 ---------- */
function startPendolo() {
  if (!pendoloGearColors) pendoloBuildGearColors();
  /* 扫光填充色单源写入 CSS 变量（CSS 内仅留兜底值） */
  var overlayEl = document.getElementById('pendolo-overlay');
  if (overlayEl) {
    overlayEl.style.setProperty('--pd-fill-c', PENDOLO_FILL_NORMAL);
    overlayEl.style.setProperty('--pd-fill-chorus', PENDOLO_FILL_CHORUS);
  }
  pendoloEnsureCanvas();
  pendoloEnsureSlots();
  pendoloCheckFontChange();
  pendoloRecomputeView();
  pendoloEnsureCanvas();
  pendoloLastValidIdx = 0;
  pendoloHasObservedLine = false;
  pendoloLayoutStamp = -1;
  pendoloTickPos = pendoloTickTarget;
  pendoloTickVel = 0;
  var overlay = document.getElementById('pendolo-wheel');
  if (overlay) {
    overlay.addEventListener('wheel', pendoloOnWheel, { passive: false });
    overlay.addEventListener('touchstart', pendoloOnTouchStart, { passive: false });
    overlay.addEventListener('touchmove', pendoloOnTouchMove, { passive: false });
    overlay.addEventListener('touchend', pendoloOnTouchEnd);
    overlay.addEventListener('touchcancel', pendoloOnTouchEnd);
  }
  if (pendoloSlots) {
    for (var i = 0; i < pendoloSlots.length; i++) {
      pendoloBindSlotClick(pendoloSlots[i]);
    }
  }
  pendoloLastTickWall = 0;
  pendoloLastFrameWall = performance.now();
  pendoloLastLyricsSig = '';
  pendoloRafId = requestAnimationFrame(pendoloFrame);
  pendoloWatchLyricsChange();
}

/* 行点击（闭包绑一次；槽的 lineIdx 动态变化，点击时读当前值） */
function pendoloBindSlotClick(slot) {
  if (slot.bound) return;
  slot.bound = true;
  slot.root.addEventListener('click', function (e) {
    e.stopPropagation();
    if (slot.lineIdx < 0) return;
    var line = (lyricsLines || [])[slot.lineIdx];
    pendoloSeekLine(slot.lineIdx, line);
  });
}

function stopPendolo() {
  if (pendoloRafId) {
    cancelAnimationFrame(pendoloRafId);
    pendoloRafId = 0;
  }
  pendoloLyricsToken++;
  if (pendoloManualResetTimer) {
    clearTimeout(pendoloManualResetTimer);
    pendoloManualResetTimer = 0;
  }
  var overlay = document.getElementById('pendolo-wheel');
  if (overlay) {
    overlay.removeEventListener('wheel', pendoloOnWheel);
    overlay.removeEventListener('touchstart', pendoloOnTouchStart);
    overlay.removeEventListener('touchmove', pendoloOnTouchMove);
    overlay.removeEventListener('touchend', pendoloOnTouchEnd);
    overlay.removeEventListener('touchcancel', pendoloOnTouchEnd);
  }
  pendoloManualAnchor = null;
  pendoloItems = [];
  if (pendoloSlots) {
    for (var i = 0; i < pendoloSlots.length; i++) {
      pendoloSlots[i].root.style.display = 'none';
      pendoloSlots[i].lineIdx = -1;
      pendoloSlots[i].sweep = null;
    }
  }
  if (pendoloCanvas && pendoloCtx && pendoloBox.width > 0) {
    pendoloCtx.clearRect(0, 0, pendoloCanvas.width, pendoloCanvas.height);
  }
}

/* ---------- 切换 ---------- */
function applyPendoloMode(on, opts) {
  opts = opts || {};
  pendoloMode = !!on;
  /* 覆盖层互斥：经视觉模式注册表退出其它覆盖层 */
  if (pendoloMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('pendolo', { save: true });
  }
  document.body.classList.toggle('pendolo', pendoloMode);
  var overlay = document.getElementById('pendolo-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', pendoloMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(PENDOLO_STORE_KEY, pendoloMode);
  if (pendoloMode) {
    startPendolo();
  } else {
    stopPendolo();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(pendoloMode ? '钟摆已开启' : '已切回标准模式');
}

function togglePendoloMode() {
  applyPendoloMode(!pendoloMode, { save: true, toast: true });
}

/* ---------- resize ---------- */
function onPendoloResize() {
  if (!pendoloMode) return;
  pendoloRecomputeView();
  pendoloEnsureCanvas();
}

/* ---------- 启动绑定 ---------- */
function initPendolo() {
  applyPendoloMode(pendoloMode, { save: false });
  window.addEventListener('resize', function () {
    clearTimeout(pendoloResizeTimer);
    pendoloResizeTimer = setTimeout(onPendoloResize, 180);
  });
}

/* 延迟到 DOM 就绪后初始化（本模块在 index-loader 末段加载，DOM 已就绪） */
scheduleUiWarmTask ? scheduleUiWarmTask(initPendolo, 320) : setTimeout(initPendolo, 320);
