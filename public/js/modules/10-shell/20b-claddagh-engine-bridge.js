/* =========================================================================
   OrangeSea · 环歌引擎桥（原版渲染核心宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — adapted from folia-major: src/components/visualizer/claddagh/VisualizerCladdagh.tsx
     的宿主职责（数据形状/时间源/频段/主题/字号/生命周期桥接）。
   引擎本体在 10-shell-claddagh-engine/claddagh-engine.js（tsc 转译闭包
   glowBlurQuantize/colorMix/renderHints/graphemeTiming/fontStacks/wordColoring
   + mini-motion + 渲染核心手工落地），由 index.html 静态 <script> 先行加载
   （pretext 全局 bundle 已在其前——引擎测量同 API 消费）。

   桥的内容（DOM 类模式样板接线，与 20b-classic-engine-bridge 同范式）：
   1) 数据形状转换：本项目 lyricsLines（{text, t, duration, words:[{text,t,d}],
      translation, isChorus}）→ Folia Line（{fullText, startTime, endTime,
      words:[{text,startTime,endTime}], translation, isChorus, renderHints}）；
      LRC 行（无 words）→ 单词覆盖整行（引擎 buildLineGraphemeTimeline +
      adjustCladdaghTimeline 均分/借时兜底）。renderHints 每行由引擎注出的
      CM_buildLineRenderHints 现算（claddagh 读 line.renderHints.renderEndTime
      做环持续慢转的 renderEnd 拓展，VisualizerCladdagh.tsx:497-512）。
   2) MotionValue 适配：{get, subscribe, emit} duck-type。时间源
      getAdjustedLyricPlaybackTime(audio.currentTime)（含歌词偏移；
      覆盖层激活时主循环保温门控提前 return，motionSignalSet('currentTime')
      不再刷新，与 20b-classic 桥同范式）。
   3) audioBands MV：{bass, vocal} 自 frequencyData 自算（bin 1-8 低频 /
      9-140 人声主体，对齐 11-main-loop.js 频段口径）——覆盖层激活期间
      isMainSceneCoveredByOverlay 分支不写 bands 信号，桥自算与
      09-aurora-flow 同形态回退；暂停时 0。
   4) 主题桥：夜侧主题 → Folia Theme 形状 + fontFamilyStack 数组 +
      animationIntensity 随强度档 fx.visAnimationIntensity（引擎三档分支，
      normal 档常量 intensityMultiplier 0.25 / maxScale 1.25）+ wordColors
      随主题词色表 orangesea-vis-word-colors-v1（空表 → buildWordColorRanges
      返回空 → charColor 全 null → 高亮回退 accentColor——算法本体随闭包
      落地并被测试覆盖）。不写死 fontWeight：Folia resolveThemeFontWeight
      （fontStacks.ts:14-17）在 theme.fontWeight 缺省时逐调用点回退——
      环字符 700（:387）/壳 400（Shell:132）/翻译行 500（SubtitleOverlay:176）/
      下一句预览 400（:205），写死一个值会把 500/400 的回退全部顶掉
      （MineRadio 双主题对象无 fontWeight 字段，与原版缺省路径一致）。
   4.5) 背景接管：原版 VisualizerShell 默认挂 VisualizerBackgroundRenderer
      （Shell:185-197，缺省 Latent——封面取色 MeshGradient + Dithering，
      audioPower/bands 驱动）。复用模式无关实现 TiltLatentBackground
      （tilt 引擎产物注出，index.html 中 tilt-engine.js 先于本引擎加载），
      挂 #claddagh-bg-layer（z 序在歌词宿主之下）；信号桥/封面/暂停/
      700ms 主题与封面热更同步照 20b-tilt-engine-bridge 范式。
   5) tuning 取 DEFAULT_CLADDAGH_TUNING 原值（types.ts:465-471：聚焦放大
      0.65（面板显示 1.65x）/ 半径 1.0x / 倾斜 45° / 轴线显示 / 字间距
      0px——与原版面板默认一致，见 .tmp-folia-modes/claddagh-panel.png）。
      调参面板在 DIY 控制台「模式调参」（visModeTuningOverrides 覆盖 +
      setTuning live）。
   6) 生命周期：进入模式创建引擎（宿主 #claddagh-engine-host）、换歌/主题/
      字号/暂停轮询 sync（700ms）、退出 destroy。引擎加载失败仅
      console.warn（DOM 引擎无 WebGL 依赖，正常环境不触发；无降级双路径
      ——旧简化实现已被原版渲染核心取代删除）。
   ========================================================================= */

var CLADDAGH_STORE_KEY = 'orangesea-claddagh-v1';
var claddaghMode = readBooleanPreference(CLADDAGH_STORE_KEY, false);
var claddaghEngine = null;
var claddaghTimer = 0;
var claddaghLinesKey = '';
var claddaghThemeKey = '';
var claddaghFontScale = 0;
var claddaghPausedKey = null;
/* 背景层状态（Latent；与 20b-tilt-engine-bridge 同范式） */
var claddaghBg = null;
var claddaghBgLastBandsRef = null;
var claddaghCoverKey = null;

/* ---------- 数据形状：lyricsLines → Folia Line[]（含 renderHints） ---------- */

function claddaghToLines() {
  var src = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var hints = (typeof CM_buildLineRenderHints === 'function') ? CM_buildLineRenderHints : null;
  var out = [];
  for (var i = 0; i < src.length; i++) {
    var l = src[i];
    if (!l || l.fallback) continue;
    var startT = Number(l.t) || 0;
    var dur = (l.duration > 0) ? Number(l.duration)
      : (src[i + 1] && (Number(src[i + 1].t) || 0) > startT ? (Number(src[i + 1].t) - startT) : 4);
    var endT = startT + Math.max(dur, 0.001);
    var words = [];
    var ws = (l.words && l.words.length) ? l.words : null;
    if (ws) {
      for (var w = 0; w < ws.length; w++) {
        var wStart = Number(ws[w].t);
        if (!isFinite(wStart)) continue;
        words.push({
          text: String(ws[w].text || ''),
          startTime: wStart,
          endTime: wStart + Math.max(Number(ws[w].d) || 0, 0)
        });
      }
    }
    if (!words.length) {
      words.push({ text: String(l.text || ''), startTime: startT, endTime: endT });
    }
    var line = {
      words: words,
      startTime: startT,
      endTime: endT,
      fullText: String(l.text || ''),
      translation: l.translation ? String(l.translation) : undefined,
      isChorus: !!l.isChorus
    };
    /* renderHints（Folia 宿主在构建 Line 时携带；renderEndTime 阈值
       0.10/0.18、micro floor 0.067——算法本体在引擎闭包） */
    if (hints) {
      try { line.renderHints = hints(line); } catch (e) { }
    }
    out.push(line);
  }
  return out;
}

/* ---------- MotionValue duck-type：时间源（引擎轮询 get） ---------- */

var claddaghTimeMV = {
  subs: [],
  get: function () {
    try {
      return getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0);
    } catch (e) { return 0; }
  },
  subscribe: function (fn) { this.subs.push(fn); },
  emit: function (v) { for (var i = 0; i < this.subs.length; i++) this.subs[i](v); }
};

/* ---------- audioBands MV：frequencyData 自算 {bass, vocal} ----------
   频段对齐 11-main-loop.js：低频 bin 1-8（kick 主体）、人声 bin 9-140
   （200-3000Hz）。暂停或无分析器时 0（Folia playbackStore 暂停供 0 的
   宿主等价）。 */

function claddaghBinAvg(from, to) {
  var fd = (typeof frequencyData !== 'undefined') ? frequencyData : null;
  if (!fd || !fd.length) return 0;
  var sum = 0, n = 0;
  var hi = Math.min(to, fd.length - 1);
  for (var i = from; i <= hi; i++) { sum += fd[i]; n++; }
  return n ? (sum / n) / 255 : 0;
}

var claddaghBandsMV = {
  get: function () {
    var isPaused = (typeof audio !== 'undefined' && audio && audio.paused);
    if (isPaused) return { bass: 0, vocal: 0 };
    return {
      bass: claddaghBinAvg(1, 8),
      vocal: claddaghBinAvg(9, 140)
    };
  }
};

/* ---------- 主题桥（夜侧 → Folia Theme 形状） ---------- */

function claddaghTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#0e0906', primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6' };
  var fontStack = '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  try {
    var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
    if (fontKey && typeof lyricFontStackForKey === 'function') fontStack = lyricFontStackForKey(fontKey);
  } catch (e) { }
  return {
    name: 'orangesea-claddagh',
    backgroundColor: t.backgroundColor,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor || t.primaryColor,
    accentColor: t.accentColor || t.primaryColor,
    fontStyle: 'sans',
    /* 不带 fontWeight：resolveThemeFontWeight 在缺省时逐调用点回退
       700/400/500/400（见文件头第 4 条）——写死会顶掉翻译行 500 回退 */
    fontFamilyStack: lyricFontStackFamilies(fontStack),
    animationIntensity: (typeof visAnimationIntensityCurrent === 'function') ? visAnimationIntensityCurrent() : 'normal',
    wordColors: (typeof visWordColorsList === 'function') ? visWordColorsList() : []
  };
}

/* ---------- 模式背景层信号（原版 Shell 默认 Latent 背景；Folia 0..255 语义，
   照 20b-tilt-engine-bridge 同范式） ---------- */

function claddaghLatentAudioPower() {
  try {
    return ((typeof motionSignalGet === 'function') ? (motionSignalGet('audioPower') || 0) : 0) * 255;
  } catch (e) { return 0; }
}

/* 覆盖层保温期 bands 引用停更 → 从保活 frequencyData 自算回退
   （bin 划分照抄 92-background-registry.js visualizerBgBandsFallback） */
function claddaghLatentBandsFallback() {
  if (typeof frequencyData === 'undefined' || !frequencyData || !frequencyData.length) return null;
  function avg(from, to) {
    var sum = 0, n = 0;
    var hi = Math.min(to, frequencyData.length - 1);
    for (var i = from; i <= hi; i++) { sum += frequencyData[i]; n++; }
    return n ? (sum / n) / 255 : 0;
  }
  return {
    kick: avg(3, 7),        // 60-150Hz
    vocal: avg(9, 140),     // 200-3000Hz
    mid: avg(140, 280),     // 3-6kHz
    treble: avg(280, Math.min(744, frequencyData.length - 1)), // 6kHz+
    rms: avg(2, 300)        // 频谱均值近似能量
  };
}

function claddaghLatentPaused() {
  try { return !!(typeof audio !== 'undefined' && audio && audio.paused); } catch (e) { return false; }
}

function claddaghLatentBands() {
  var raw = null;
  try { raw = (typeof motionSignalGet === 'function') ? motionSignalGet('bands') : null; } catch (e) { }
  var paused = claddaghLatentPaused();
  if (raw) {
    if (raw === claddaghBgLastBandsRef && !paused) {
      raw = null;   /* 引用未更新且在播：保温期（或主循环音频闸门跳帧）→ 自算 */
    } else {
      claddaghBgLastBandsRef = raw;
    }
  }
  if (!raw && !paused) {
    raw = claddaghLatentBandsFallback();
  }
  if (!raw) return null;
  function to255(v) {
    v = Number(v);
    return isFinite(v) ? Math.max(0, Math.min(1, v)) * 255 : 0;
  }
  /* 频段映射（同 tilt 桥文件头第 5 条）：bass/lowMid←kick，mid/vocal←vocal，treble←treble */
  return {
    bass: to255(raw.kick),
    lowMid: to255(raw.kick),
    mid: to255(raw.vocal),
    vocal: to255(raw.vocal),
    treble: to255(raw.treble)
  };
}

function claddaghLatentCoverUrl() {
  try { return (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null; } catch (e) { return null; }
}

function startCladdaghBg() {
  var bgHost = document.getElementById('claddagh-bg-layer');
  if (!bgHost || typeof TiltLatentBackground !== 'function') return;   /* 无引擎产物/无 WebGL2 → 保底暖夜层 */
  try {
    claddaghBg = TiltLatentBackground({
      host: bgHost,
      theme: claddaghTheme(),
      audioPowerGet: claddaghLatentAudioPower,
      bandsGet: claddaghLatentBands,
      coverUrlGet: claddaghLatentCoverUrl,
      pausedGet: claddaghLatentPaused
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[CladdaghEngine] background create failed', e);
    claddaghBg = null;
  }
  claddaghBgLastBandsRef = null;
  claddaghCoverKey = claddaghLatentCoverUrl();
}

/* ---------- tuning：DEFAULT_CLADDAGH_TUNING 原值（types.ts:465-471，
   与原版面板默认一致）+ 调参覆盖合并（07-fx/11-vis-mode-data-plane） ---------- */

var CLADDAGH_DEFAULT_TUNING_BRIDGE = {
  focusScaleRatio: 0.65,
  radiusScale: 1.0,
  ellipseTiltDeg: 45,
  showAxisLine: true,
  letterSpacingOffset: 0
};

/* 引擎端 claddaghResolveTuning 逐字段空值合并；引擎暴露 setTuning → live 应用 */
function claddaghResolvedTuning() {
  if (typeof visModeTuningOverrides !== 'function') return CLADDAGH_DEFAULT_TUNING_BRIDGE;
  return Object.assign({}, CLADDAGH_DEFAULT_TUNING_BRIDGE, visModeTuningOverrides('claddagh'));
}
if (typeof visModeTuningRegisterLiveApply === 'function') {
  visModeTuningRegisterLiveApply('claddagh', function (tuning) {
    if (claddaghEngine && typeof claddaghEngine.setTuning === 'function') {
      try { claddaghEngine.setTuning(tuning); } catch (e) { }
    }
  });
}

/* ---------- 生命周期 ---------- */

function startCladdagh() {
  if (typeof applyOverlayModeFontScale === 'function') {
    applyOverlayModeFontScale(document.getElementById('claddagh-overlay'));
  }
  startCladdaghBg();   /* 背景层先于歌词引擎：引擎缺失/失败时背景仍独立成立 */
  var host = document.getElementById('claddagh-engine-host');
  if (!host || typeof CladdaghCladdaghEngine !== 'function') {
    if (typeof console !== 'undefined') console.warn('[CladdaghEngine] 引擎产物未加载（claddagh-engine.js）');
    return;
  }
  try {
    claddaghFontScale = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
    claddaghEngine = CladdaghCladdaghEngine({
      host: host,
      lines: claddaghToLines(),
      currentTime: claddaghTimeMV,
      audioBands: claddaghBandsMV,
      theme: claddaghTheme(),
      tuning: claddaghResolvedTuning(),
      lyricsFontScale: claddaghFontScale,
      pretext: (typeof pretext !== 'undefined') ? pretext : {}
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[CladdaghEngine] runtime create failed', e);
    claddaghEngine = null;
    return;
  }
  claddaghLinesKey = '';
  claddaghThemeKey = '';
  claddaghPausedKey = null;
  (function loop() {
    if (!claddaghMode || !claddaghEngine) return;
    claddaghSync();
    claddaghTimer = setTimeout(loop, 700);
  })();
}

/* 换歌 / 主题 / 字号 / 暂停变化 → 引擎热更新（轮询，700ms） */
function claddaghSync() {
  var eng = claddaghEngine;
  if (!eng) return;
  var ls = claddaghToLines();
  var linesKey = ls.length + '|' + (ls.length ? (ls[0].startTime + ':' + ls[ls.length - 1].startTime) : '');
  if (linesKey !== claddaghLinesKey) {
    claddaghLinesKey = linesKey;
    eng.setLines(ls);
  }
  var theme = claddaghTheme();
  var themeKey = JSON.stringify(theme);
  if (themeKey !== claddaghThemeKey) {
    claddaghThemeKey = themeKey;
    eng.setTheme(theme);
    /* 引擎 setTheme 会以新主题重建行池（fontSpec/baseColor/highlightColor
       随新主题——字体跟随热更路径）；背景层同步换色 */
    if (claddaghBg) { try { claddaghBg.setTheme(theme); } catch (e) { } }
  }
  var fs = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
  if (fs !== claddaghFontScale) {
    claddaghFontScale = fs;
    eng.setFontScale(fs);
  }
  /* 背景层：封面变化重取色（LatentBackground.tsx:129-148 coverUrl
     useEffect 的轮询等价） */
  if (claddaghBg) {
    var coverUrl = claddaghLatentCoverUrl();
    if (coverUrl !== claddaghCoverKey) {
      claddaghCoverKey = coverUrl;
      try { claddaghBg.setCoverUrl(); } catch (e) { }
    }
  }
  var pk = (typeof audio !== 'undefined' && audio) ? !!audio.paused : false;
  if (pk !== claddaghPausedKey) {
    claddaghPausedKey = pk;
    eng.setPaused(pk);
  }
}

function stopCladdagh() {
  if (claddaghTimer) { clearTimeout(claddaghTimer); claddaghTimer = 0; }
  if (claddaghEngine) {
    try { claddaghEngine.destroy(); } catch (e) { }
    claddaghEngine = null;
  }
  if (claddaghBg) {
    try { claddaghBg.destroy(); } catch (e) { }
    claddaghBg = null;
  }
  claddaghBgLastBandsRef = null;
  claddaghCoverKey = null;
}

/* ---------- 切换入口（注册表 stateVar=claddaghMode / applyFn=applyCladdaghMode） ---------- */

function applyCladdaghMode(on, opts) {
  opts = opts || {};
  claddaghMode = !!on;
  /* 覆盖层互斥：经视觉模式注册表退出其它模式 */
  if (claddaghMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('claddagh', { save: true });
  }
  document.body.classList.toggle('claddagh', claddaghMode);
  var overlay = document.getElementById('claddagh-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', claddaghMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(CLADDAGH_STORE_KEY, claddaghMode);
  if (claddaghMode) {
    startCladdagh();
  } else {
    stopCladdagh();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(claddaghMode ? '环歌已开启' : '已切回标准模式');
}

function toggleCladdaghMode() {
  applyCladdaghMode(!claddaghMode, { save: true, toast: true });
}

/* ---------- 启动恢复（模块顶层加载时执行，DOM 已就绪） ---------- */

function initCladdaghBridge() {
  applyCladdaghMode(claddaghMode, { save: false });
}

scheduleUiWarmTask ? scheduleUiWarmTask(initCladdaghBridge, 300) : setTimeout(initCladdaghBridge, 300);
