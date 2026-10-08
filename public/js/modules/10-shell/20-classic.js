/* =========================================================================
   OrangeSea · 流萤辉光（Classic Luminous · 词级三态随机布局歌词）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0):
     src/components/visualizer/classic/Visualizer.tsx（随机布局/词级三态/
       行进出过渡/整行呼吸浮动/canvas 量宽防重叠词距）
     src/components/visualizer/wordGlow.ts（逐字辉光；恒走 drop-shadow 滤镜
       路径——免 Chromium 字形缓存逐帧增strike的泄漏，半径按 0.4 拟合）
     src/utils/lyrics/renderHints.ts（行时长分档 micro/short/normal →
       lineTransitionMode/wordRevealMode/renderEndTime）
     src/utils/lyrics/graphemeTiming.ts（词内 grapheme 均分时序）
     src/components/visualizer/runtime.ts（"当前该看哪一行"思想）

   宿主替换（无构建原生 JS，与 09-aurora-flow 同形态）：
     React 生命周期 → IIFE 顶层 var + applyClassicMode(on,{save}) 显式进出；
     framer-motion variants/spring/AnimatePresence → CSS 独立变换属性
       translate/scale/rotate（Chromium 104+，涂鸦墙同款先例）+ 状态类驱动
       过渡 + 双槽并存行退场（.is-exit 播完即移除）；
     MotionValue(currentTime) 的 useMotionValueEvent → 30fps rAF 内每帧
       轮询词状态。注：覆盖层激活时主循环走保温门控提前 return
       （11-main-loop.js:368-389），motionSignalSet('currentTime') 不再刷新，
       故照 09-aurora-flow.js 范式直读 getAdjustedLyricPlaybackTime(
       audio.currentTime)——这是与"MotionValue 全换 motionSignalGet"纪律
       的已知偏差，原因见上。
   本项目无 calm/chaotic 动画强度档与主题词色表：强度按 normal 固定
   （spread 20 / rotate 5 / 透明度 0.82），activeColor 单色（日落暖调）。
   ========================================================================= */

var CLASSIC_STORE_KEY = 'orangesea-classic-luminous-v1';
var classicMode = readBooleanPreference(CLASSIC_STORE_KEY, false);
var classicRafId = 0;
var classicPrevQuality = null;
var classicLyricsWatchToken = 0;
var classicLineKey = '';          /* idx:lineT —— 行身份，变化即重建 */
var classicLineEl = null;         /* 当前行元素（双槽退场的"新槽"） */
var classicWords = [];            /* 当前行词运行时记录（每帧只读+按需切类） */
var classicLookahead = 0.15;      /* 当前行 wordLookahead（随 reveal 档变化） */
var classicResizeTimer = 0;
var classicLastFontKey = null;
var classicMeasureCanvas = null;  /* 量宽 canvas 复用（Folia classicMeasureCanvas） */

/* Folia DEFAULT_CLASSIC_TUNING（types.ts:398）原值；本项目无设置面板，取默认 */
var CLASSIC_TUNING = {
  enableWordRotation: true,
  breathingFloatMultiplier: 1,
  useLegacyLayout: false,
  wordSpacing: 0.7
};

/* renderHints.ts 阈值原值 */
var CLASSIC_MICRO_DUR = 0.10;
var CLASSIC_SHORT_DUR = 0.18;
var CLASSIC_MICRO_FLOOR = 0.067;

/* ---------- 切换（照 09-aurora-flow 范式） ---------- */
function applyClassicMode(on, opts) {
  opts = opts || {};
  classicMode = !!on;
  /* 覆盖层互斥：经视觉模式注册表退出其它覆盖层 */
  if (classicMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('classic', { save: true });
  }
  document.body.classList.toggle('classic', classicMode);
  var overlay = document.getElementById('classic-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', classicMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(CLASSIC_STORE_KEY, classicMode);
  if (classicMode) {
    startClassic();
    /* 3D 场景已被覆盖层盖住：临时切 eco 质量档让出帧预算（退出时恢复） */
    if (typeof fx !== 'undefined' && fx && classicPrevQuality === null) {
      classicPrevQuality = fx.performanceQuality || 'balanced';
      fx.performanceQuality = 'eco';
    }
  } else {
    stopClassic();
    if (classicPrevQuality !== null && typeof fx !== 'undefined' && fx) {
      fx.performanceQuality = classicPrevQuality;
      classicPrevQuality = null;
    }
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(classicMode ? '流萤辉光已开启' : '已切回标准模式');
}

function toggleClassicMode() {
  applyClassicMode(!classicMode, { save: true, toast: true });
}

/* ---------- 启动 / 停止 ---------- */
function startClassic() {
  classicFontStack();
  classicApplyTheme();
  classicLineKey = '';
  classicLineEl = null;
  startClassicLoop();
}

function stopClassic() {
  stopClassicLoop();
  var host = document.getElementById('classic-lines');
  if (host) host.innerHTML = '';
  classicLineEl = null;
  classicWords = [];
  classicLineKey = '';
}

/* ---------- 字体跟随用户歌词字体选择（fx.lyricFont，与流光/雨窗一致） ---------- */
function classicFontStack() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  var stack = (fontKey && typeof lyricFontStackForKey === 'function')
    ? lyricFontStackForKey(fontKey)
    : '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  var overlay = document.getElementById('classic-overlay');
  if (overlay) overlay.style.setProperty('--cl-font', stack);
  return stack;
}

function classicCheckFontChange() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  if (classicLastFontKey !== fontKey) {
    classicLastFontKey = fontKey;
    classicFontStack();
    classicLineKey = '';   /* 字体变了：量宽与词距重算，强制重建当前行 */
  }
}

/* ---------- 主题色（日落暖调；activeColor 单色 = Folia 无词色表时的 accent 回退） ---------- */
function classicHexRgba(css, alpha) {
  var m = /^#?([0-9a-f]{6})$/i.exec(String(css || '').trim());
  if (!m) return css;
  var n = parseInt(m[1], 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

function classicApplyTheme() {
  var active = '#ffb27a';   /* 日落暖琥珀（与默认视觉染色 #ff9c6e 同族但更亮） */
  try {
    if (typeof fx !== 'undefined' && fx && fx.visualTintMode === 'custom' && fx.visualTintColor) {
      active = fx.visualTintColor;
    }
  } catch (e) { }
  var overlay = document.getElementById('classic-overlay');
  if (!overlay) return;
  overlay.style.setProperty('--cl-active', active);
  /* wordGlow.ts 内层光 alpha 0.7（DROP_SHADOW_INNER_ALPHA） */
  overlay.style.setProperty('--cl-active-inner', classicHexRgba(active, 0.7));
}

/* ---------- 当前播放时间（秒，含歌词偏移；见文件头说明） ---------- */
function classicNowTime() {
  try {
    return getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0);
  } catch (e) { return 0; }
}

function escapeClassicHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ---------- 行渲染档位（renderHints.ts 全量移植，时间全为绝对秒） ---------- */
function classicLineProfile(line, idx) {
  var startT = (line && line.t) || 0;
  var nextT = (lyricsLines && idx + 1 < lyricsLines.length && lyricsLines[idx + 1])
    ? (lyricsLines[idx + 1].t || 0) : 0;
  /* LRC 行无 duration：用下一行起点估时长（graffiti 同思路），末行兜底 4s */
  var dur = (line && line.duration > 0) ? line.duration : (nextT > startT ? nextT - startT : 4);
  var endT = startT + Math.max(dur, 0.001);
  var raw = Math.max(endT - startT, 0);
  var timingClass = raw < CLASSIC_MICRO_DUR ? 'micro' : (raw < CLASSIC_SHORT_DUR ? 'short' : 'normal');
  var lineTransitionMode = timingClass === 'micro' ? 'none' : (timingClass === 'short' ? 'fast' : 'normal');
  var wordRevealMode = timingClass === 'micro' ? 'instant' : (timingClass === 'short' ? 'fast' : 'normal');

  /* 最后一个 YRC 词的结束时间（getLastWordEndTime） */
  var lastWordEnd = endT;
  if (line && line.words && line.words.length) {
    var lw = line.words[line.words.length - 1];
    if (lw && lw.t != null) lastWordEnd = lw.t + (lw.d || 0);
  }

  /* buildLineRenderEndTime */
  var renderEnd;
  if (lineTransitionMode === 'none') {
    renderEnd = Math.max(endT, startT + CLASSIC_MICRO_FLOOR);
  } else {
    var enterDur, exitDur, hold;
    if (lineTransitionMode === 'fast') {
      enterDur = Math.min(0.06, Math.max(0.045, raw * 0.45));
      exitDur = Math.min(0.04, Math.max(0.03, raw * 0.22));
      hold = wordRevealMode === 'instant' ? 0 : 0.03;
    } else {
      enterDur = Math.min(0.42, Math.max(0.22, Math.max(raw, 0.12) * 0.34));
      exitDur = Math.min(0.32, Math.max(0.18, Math.max(raw, 0.12) * 0.18));
      hold = wordRevealMode === 'instant' ? 0 : 0.06;
    }
    var passStart = Math.max(lastWordEnd, startT) + hold;
    var exitStart = lineTransitionMode === 'fast'
      ? Math.max(startT + enterDur + 0.01, passStart, endT - exitDur)
      : Math.max(passStart, endT - exitDur);
    renderEnd = Math.max(endT, exitStart + exitDur);
  }

  return {
    startT: startT,
    endT: endT,
    rawDuration: raw,
    lineTransitionMode: lineTransitionMode,
    wordRevealMode: wordRevealMode,
    renderEndTime: renderEnd,
    /* wordLookahead（Visualizer.tsx:83） */
    wordLookahead: wordRevealMode === 'instant' ? 0.03 : (wordRevealMode === 'fast' ? 0.08 : 0.15),
    perspective: 1000   /* normal 强度档恒 1000（chaotic 才随机 500+） */
  };
}

/* getClassicWordActiveEndTime（Visualizer.tsx:87） */
function classicWordActiveEnd(unit, profile) {
  if (profile.wordRevealMode === 'instant') return profile.renderEndTime;
  if (profile.wordRevealMode === 'fast') {
    return Math.min(profile.renderEndTime, Math.max(unit.endT, unit.startT + 0.12));
  }
  return unit.endT;
}

/* getClassicWordDisplayDuration（Visualizer.tsx:99） */
function classicWordDisplayDuration(unit, profile, activeEnd) {
  var minDuration = profile.wordRevealMode === 'instant'
    ? 0.08
    : profile.wordRevealMode === 'fast' ? 0.12 : 0.1;
  return Math.max(activeEnd - unit.startT, minDuration);
}

/* ---------- 间奏行（Folia fullText === "......"；放宽为纯点符行） ---------- */
function classicIsInterlude(text) {
  var t = String(text || '').trim();
  return t === '......' || /^[.·･．。…]{3,}$/.test(t);
}

/* ---------- 展示词（布局单元）：tokenizeGraffitiText 分词 + YRC/LRC 时序指派 ---------- */
function classicBuildDisplayWords(line, profile) {
  var text = (line && line.text) || '';
  var tokens = (typeof tokenizeGraffitiText === 'function')
    ? tokenizeGraffitiText(text)
    : Array.from(text).map(function (ch, i) {
      return /\s/.test(ch) ? { type: 'space' } : { type: 'char', chars: [{ c: ch, i: i }] };
    });

  /* 词聚合：word 整词一单元；裸 char 一单元；标点贴前一单元（graffiti groupByWord 同款） */
  var units = [];
  for (var ti = 0; ti < tokens.length; ti++) {
    var tk = tokens[ti];
    if (!tk || tk.type === 'space') continue;
    if (tk.type === 'punct' && units.length) {
      var lastUnit = units[units.length - 1];
      for (var pi = 0; pi < tk.chars.length; pi++) {
        lastUnit.idxs.push(tk.chars[pi].i);
        lastUnit.text += tk.chars[pi].c;
      }
      continue;
    }
    var u = { text: '', idxs: [] };
    for (var ci = 0; ci < tk.chars.length; ci++) {
      u.idxs.push(tk.chars[ci].i);
      u.text += tk.chars[ci].c;
    }
    if (u.idxs.length) units.push(u);
  }

  /* 时序指派（绝对秒） */
  if (line && line.words && line.words.length) {
    /* YRC：code unit 偏移 → 码点索引映射（computeGraffitiReveals 同款换算） */
    var chars = Array.from(text);
    var n = chars.length;
    var cuToChar = new Array(text.length + 1);
    var cu = 0;
    for (var k = 0; k < n; k++) {
      var cpLen = chars[k].length;
      for (var k2 = 0; k2 < cpLen; k2++) cuToChar[cu + k2] = k;
      cu += cpLen;
    }
    cuToChar[text.length] = n;
    var cpStart = new Array(n);
    var cpEnd = new Array(n);
    for (var wi = 0; wi < line.words.length; wi++) {
      var w = line.words[wi];
      if (!w) continue;
      var cu0 = Math.max(0, Math.min(text.length, (w.c0 != null) ? w.c0 : 0));
      var cu1 = Math.max(0, Math.min(text.length, (w.c1 != null) ? w.c1 : cu0));
      var c0 = cuToChar[cu0] || 0;
      var c1 = cuToChar[cu1];
      if (c1 == null) c1 = n;
      if (c1 <= c0) c1 = c0 + 1;
      var wStart = w.t != null ? w.t : profile.startT;
      var wEnd = wStart + Math.max(w.d || 0, 0.06);
      for (var cp = c0; cp < c1 && cp < n; cp++) {
        cpStart[cp] = wStart;
        cpEnd[cp] = wEnd;
      }
    }
    /* 未覆盖字符（空格/标点未入 YRC 区间）：承前词结束时刻 */
    var carry = profile.startT;
    for (var f = 0; f < n; f++) {
      if (cpStart[f] == null) { cpStart[f] = carry; cpEnd[f] = carry; }
      else carry = cpEnd[f];
    }
    for (var ui = 0; ui < units.length; ui++) {
      var unit = units[ui];
      unit.startT = cpStart[unit.idxs[0]];
      unit.endT = cpEnd[unit.idxs[unit.idxs.length - 1]];
      if (!(unit.endT > unit.startT)) unit.endT = unit.startT + 0.06;
    }
  } else {
    /* LRC：duration 前 70% 内按单元均分起唱（graffiti LRC 约定），
       每单元唱段 = 步长（末段夹到行尾）——Folia 解析器恒产定时词，此为宿主适配 */
    var durL = (line && line.duration > 0) ? Math.min(line.duration, 6) : 2.4;
    var span = durL * 0.7;
    var nU = units.length;
    for (var lj = 0; lj < nU; lj++) {
      var start = nU > 1 ? (lj / (nU - 1)) * span : 0;
      var step = nU > 1 ? span / (nU - 1) : Math.min(durL, 1.2);
      units[lj].startT = profile.startT + start;
      units[lj].endT = profile.startT + Math.min(start + step, durL);
    }
  }
  return units;
}

/* ---------- grapheme 拆分与词内均分时序（graphemeTiming.ts） ---------- */
function classicSplitGraphemes(text) {
  if (!text) return [];
  if (typeof graffitiGraphemeSegmenter !== 'undefined' && graffitiGraphemeSegmenter) {
    return Array.from(graffitiGraphemeSegmenter.segment(text), function (s) { return s.segment; });
  }
  return Array.from(text);
}

function classicBuildGraphemes(unit) {
  var graphemes = classicSplitGraphemes(unit.text);
  if (!graphemes.length) return [];
  var duration = Math.max(unit.endT - unit.startT, 0);
  var unitDuration = duration / graphemes.length;
  var out = [];
  for (var i = 0; i < graphemes.length; i++) {
    out.push({
      ch: graphemes[i],
      s: unit.startT + unitDuration * i,
      e: i === graphemes.length - 1 ? unit.endT : unit.startT + unitDuration * (i + 1)
    });
  }
  return out;
}

/* ---------- 量宽（Visualizer.tsx measureWordWidth：canvas measureText） ---------- */
function classicMeasureWidth(text, pxSize, fontStack, fontWeight) {
  if (typeof document === 'undefined') return text.length * pxSize * 0.65;
  if (!classicMeasureCanvas) classicMeasureCanvas = document.createElement('canvas');
  var context = classicMeasureCanvas.getContext('2d');
  if (!context) return text.length * pxSize * 0.65;
  context.font = fontWeight + ' ' + pxSize + 'px ' + fontStack;
  return context.measureText(text).width;
}

/* ---------- 随机布局（Visualizer.tsx wordConfigs/lineConfig memo 全量移植，normal 档） ---------- */
function classicBuildLayout(line, units, fontStack) {
  var seed = line.t || 0;
  /* 本项目无强度档：normal —— spread 20 / baseRotate 5（isChaotic/isCalm 分支不触发） */
  var baseSpread = 20;
  var baseRotate = 5;
  var isInterlude = classicIsInterlude(line.text);

  /* 视口 → 主字号像素值（Visualizer.tsx getPixelFontSize：clamp(2.25rem, 6vw, 4.5rem)） */
  var vw = window.innerWidth || 1200;
  var pxFontSize = Math.max(2.25 * 16, Math.min((6 * vw) / 100, 4.5 * 16));

  var widths = [];
  var i;
  for (i = 0; i < units.length; i++) {
    widths[i] = classicMeasureWidth(units[i].text, pxFontSize, fontStack, 700);
  }

  /* 行容器：justify/align 按行起点播种确定性挑选（Folia tailwind 数组同序） */
  var justifyOptions = ['start', 'center', 'end', 'around', 'between'];
  var alignOptions = ['start', 'center', 'end'];
  var justify = isInterlude ? 'center' : justifyOptions[Math.floor(seed % justifyOptions.length)];
  var align = alignOptions[Math.floor((seed * 2) % alignOptions.length)];

  var configs = [];
  for (i = 0; i < units.length; i++) {
    var wordSeed = seed + i;
    /* 确定性 RNG：时间改动画状态，不改基础几何（Folia 原注释原则） */
    var random = function (offset) {
      var x = Math.sin(wordSeed + offset) * 10000;
      return x - Math.floor(x);
    };

    var x = 0, y = 0, rotate = 0, scale = 1, passedRotate = 0, marginRight = '0.8rem';
    if (isInterlude) {
      x = 0;
      y = (random(2) - 0.5) * 15;
      rotate = 0;
      scale = 1.5;
      marginRight = '3rem';
    } else {
      scale = 1.1 + random(4) * 0.2;
      x = (random(1) - 0.5) * baseSpread * 2;
      y = (random(2) - 0.5) * baseSpread * 2;
      rotate = CLASSIC_TUNING.enableWordRotation ? (random(3) - 0.5) * baseRotate * 2 : 0;
      passedRotate = CLASSIC_TUNING.enableWordRotation ? (random(8) - 0.5) * 45 : 0;

      if (!CLASSIC_TUNING.useLegacyLayout) {
        /* 防重叠词距：按相邻两词放大溢出半宽 + x 偏移差 + 间隙计算（原公式） */
        var sI = scale * 1.4;                       /* active 态最大放大倍数 */
        var wNext = 0, sNext = 1.0, xNext = 0;
        if (i + 1 < units.length) {
          var nextSeed = seed + (i + 1);
          var nextRandom = function (offset) {
            var x2 = Math.sin(nextSeed + offset) * 10000;
            return x2 - Math.floor(x2);
          };
          sNext = (1.1 + nextRandom(4) * 0.2) * 1.4;
          xNext = (nextRandom(1) - 0.5) * baseSpread * 2;
          wNext = widths[i + 1] || 0;
        }
        var spacingMultiplier = CLASSIC_TUNING.wordSpacing;
        var gap = 0.05 * pxFontSize;
        var halfOverflowI = (widths[i] || 0) * (sI - 1) / 2;
        var halfOverflowNext = wNext * (sNext - 1) / 2;
        var xOffsetDiff = x - xNext;
        var calculatedMargin = (halfOverflowI + halfOverflowNext + xOffsetDiff + gap) * spacingMultiplier;
        var minMargin = 0.12 * pxFontSize * spacingMultiplier;   /* normal 档 0.12（chaotic 才 0.08） */
        marginRight = Math.max(minMargin, calculatedMargin).toFixed(1) + 'px';
      }
    }

    /* waiting 预备位（layoutVariants.waiting 的 sin/cos 偏移，确定性预计算） */
    var waitX = x + Math.sin(y) * 100;
    var waitY = y + Math.cos(x) * 50;
    var waitRotate = CLASSIC_TUNING.enableWordRotation ? rotate + 20 : 0;

    configs.push({
      cssText:
        '--cl-mr:' + marginRight + ';' +
        '--cl-tx:' + x.toFixed(1) + 'px;' +
        '--cl-ty:' + y.toFixed(1) + 'px;' +
        '--cl-rot:' + rotate.toFixed(2) + 'deg;' +
        '--cl-scale:' + scale.toFixed(3) + ';' +
        '--cl-prot:' + passedRotate.toFixed(2) + 'deg;' +
        '--cl-wx:' + waitX.toFixed(1) + 'px;' +
        '--cl-wy:' + waitY.toFixed(1) + 'px;' +
        '--cl-wrot:' + waitRotate.toFixed(2) + 'deg;',
      interlude: isInterlude
    });
  }
  return { configs: configs, justify: justify, align: align };
}

/* ---------- 辉光层逐字 span（wordGlow.ts active 分支的 CSS 动画参数化） ---------- */
function classicBuildGlowHtml(unit, graphemes, profile) {
  var html = '';
  for (var j = 0; j < graphemes.length; j++) {
    var mode, dur, delay;
    if (profile.wordRevealMode === 'instant') {
      mode = 'instant';
      dur = Math.min(unit.displayDuration || 0.08, 0.12);
      delay = 0;
    } else if (profile.wordRevealMode === 'fast') {
      mode = 'fast';
      dur = Math.min(Math.max(unit.displayDuration || 0.12, 0.12), 0.2);
      delay = 0;
    } else if (graphemes.length > 1) {
      /* 逐字扫光：时长 = 字段×6 跨多字衰减，延迟 = 字起唱相对词首偏移 */
      mode = 'sweep';
      dur = Math.max(graphemes[j].e - graphemes[j].s, 0.001) * 6;
      delay = Math.max(0, graphemes[j].s - unit.startT);
    } else {
      /* 单字/CJK：整词持续辉光 */
      mode = 'sustain';
      dur = unit.displayDuration || 0.1;
      delay = 0;
    }
    html += '<span class="cl-gc cl-gc--' + mode + '" style="--cl-char-dur:' + dur.toFixed(3) +
      's;--cl-char-delay:' + delay.toFixed(3) + 's">' + escapeClassicHtml(graphemes[j].ch) + '</span>';
  }
  return html;
}

/* ---------- 渲染一行（行切换时一次性构建；主循环零分配） ---------- */
function classicExitCurrentLine() {
  if (!classicLineEl) return;
  var old = classicLineEl;
  var host = old.parentNode;
  if (!host) { classicLineEl = null; return; }
  old.classList.add('is-exit');
  var lmode = old.getAttribute('data-lmode') || 'normal';
  /* getClassicLineContainerMotion.exit 时长：none 0.12 / fast 0.16 / normal 0.3 */
  var exitDur = lmode === 'none' ? 0.12 : (lmode === 'fast' ? 0.16 : 0.3);
  setTimeout(function () {
    if (old.parentNode) old.parentNode.removeChild(old);
  }, exitDur * 1000 + 90);
  classicLineEl = null;
}

function classicRenderLine(line, idx) {
  var host = document.getElementById('classic-lines');
  if (!host) return;
  classicExitCurrentLine();

  var profile = classicLineProfile(line, idx);
  var units = classicBuildDisplayWords(line, profile);
  var layout = classicBuildLayout(line, units, classicFontStack());

  var html = '';
  for (var i = 0; i < units.length; i++) {
    var unit = units[i];
    var cfg = layout.configs[i];
    if (!cfg) continue;
    var activeEnd = classicWordActiveEnd(unit, profile);
    unit.displayDuration = classicWordDisplayDuration(unit, profile, activeEnd);
    unit.activeEndT = activeEnd;
    var graphemes = classicBuildGraphemes(unit);
    html += '<div class="cl-word is-waiting" style="' + cfg.cssText + '--cl-wdur:' +
      unit.displayDuration.toFixed(3) + 's;">' +
      '<span class="cl-glow" aria-hidden="true">' + classicBuildGlowHtml(unit, graphemes, profile) + '</span>' +
      '<span class="cl-body">' + escapeClassicHtml(unit.text) + '</span>' +
      '</div>';
  }

  var el = document.createElement('div');
  el.className = 'cl-line';
  el.setAttribute('data-lmode', profile.lineTransitionMode);
  el.setAttribute('data-reveal', profile.wordRevealMode);
  el.setAttribute('data-justify', layout.justify);
  el.setAttribute('data-align', layout.align);
  el.style.perspective = profile.perspective + 'px';
  el.innerHTML = html;
  host.appendChild(el);
  classicLineEl = el;
  classicLookahead = profile.wordLookahead;

  /* 词运行时记录（与 units 同序） */
  classicWords = [];
  var els = el.querySelectorAll('.cl-word');
  for (var j = 0; j < els.length && j < units.length; j++) {
    classicWords.push({
      el: els[j],
      startT: units[j].startT,
      activeEndT: units[j].activeEndT,
      status: 'waiting'
    });
  }
}

/* ---------- 词级三态推进（useMotionValueEvent(currentTime) 的轮询等价） ----------
   waiting：未唱——预入场位（低透明+偏移+模糊）
   active：演唱中——弹簧放大+点亮+逐字辉光
   passed：已唱——余晖 + 5s 线性缓慢旋转漂移 */
function classicTickWords(nowT) {
  for (var i = 0; i < classicWords.length; i++) {
    var w = classicWords[i];
    if (!w.el) continue;
    var status;
    if (nowT >= w.startT - classicLookahead && nowT <= w.activeEndT) {
      status = 'active';
    } else if (nowT > w.activeEndT) {
      status = 'passed';
    } else {
      status = 'waiting';
    }
    if (status === w.status) continue;
    w.status = status;
    w.el.classList.remove('is-waiting', 'is-active', 'is-passed');
    w.el.classList.add('is-' + status);
  }
}

/* ---------- 歌词主 tick ---------- */
function classicSetIdle(show) {
  var idle = document.getElementById('classic-idle');
  if (idle) idle.classList.toggle('show', !!show);
}

function classicTickLyrics() {
  if (!classicMode) return;
  var hasReal = lyricsLines && lyricsLines.length &&
    lyricsLines.some(function (l) { return !l.fallback; });
  if (!hasReal) {
    if (classicLineKey !== 'none') {
      classicLineKey = 'none';
      classicExitCurrentLine();
      classicWords = [];
    }
    classicSetIdle(true);
    return;
  }
  var nowT = classicNowTime();
  var idx = -1;
  try { idx = findStageLyricIndexAtTime(nowT); } catch (e) { idx = -1; }
  if (idx < 0 || idx >= lyricsLines.length) {
    if (classicLineKey !== 'none') {
      classicLineKey = 'none';
      classicExitCurrentLine();
      classicWords = [];
    }
    classicSetIdle(true);
    return;
  }
  classicSetIdle(false);
  var key = idx + ':' + (lyricsLines[idx].t || 0);
  if (key !== classicLineKey) {
    classicLineKey = key;
    classicRenderLine(lyricsLines[idx], idx);
    return;   /* 切行帧不推进三态，下一帧开始 */
  }
  if (classicWords.length) classicTickWords(nowT);
}

/* 歌词数据变化轮询（lyricsLines 是普通数组无事件，胶片/涂鸦/流光同款范式） */
function watchClassicLyricsChange() {
  var token = ++classicLyricsWatchToken;
  var lastLen = -1;
  function check() {
    if (token !== classicLyricsWatchToken || !classicMode) return;
    var len = (lyricsLines && lyricsLines.length) || 0;
    if (len !== lastLen) {
      lastLen = len;
      classicLineKey = '';   /* 强制重渲染当前行 */
    }
    setTimeout(check, 600);
  }
  check();
}

/* ---------- 主循环（rAF 节流 ~30fps；每帧零分配） ---------- */
function startClassicLoop() {
  stopClassicLoop();
  var lastTick = 0;
  function frame(now) {
    if (!classicMode) return;
    if (now - lastTick > 33) {
      lastTick = now;
      classicCheckFontChange();
      classicTickLyrics();
    }
    classicRafId = requestAnimationFrame(frame);
  }
  classicRafId = requestAnimationFrame(frame);
  watchClassicLyricsChange();
}

function stopClassicLoop() {
  if (classicRafId) {
    cancelAnimationFrame(classicRafId);
    classicRafId = 0;
  }
  classicLyricsWatchToken++;
}

/* ---------- resize（词距依赖视口宽度，防抖后强制重建） ---------- */
function onClassicResize() {
  if (!classicMode) return;
  classicLineKey = '';
}

/* ---------- 启动绑定 ---------- */
function initClassic() {
  applyClassicMode(classicMode, { save: false });
  window.addEventListener('resize', function () {
    clearTimeout(classicResizeTimer);
    classicResizeTimer = setTimeout(onClassicResize, 180);
  });
}

/* 延迟到 DOM 就绪后初始化（本模块在 index-loader 末尾加载，DOM 已就绪） */
scheduleUiWarmTask ? scheduleUiWarmTask(initClassic, 300) : setTimeout(initClassic, 300);
