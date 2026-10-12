/* =========================================================================
   OrangeSea · 流萤辉光引擎桥（原版渲染核心宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — adapted from folia-major: src/components/visualizer/classic/Visualizer.tsx
     的宿主职责（数据形状/时间源/主题/字号/生命周期桥接）。
   引擎本体在 10-shell-classic-engine/classic-engine.js（tsc 转译闭包 +
   mini-motion + 渲染核心手工落地），由 index.html 静态 <script> 先行加载。

   桥的内容（canvas/DOM 类模式的样板接线）：
   1) 数据形状转换：本项目 lyricsLines（{text, t, duration, words:[{text,t,d}],
      translation, isChorus}）→ Folia Line（{fullText, startTime, endTime,
      words:[{text,startTime,endTime}], translation, isChorus}）；
      LRC 行（无 words）→ 单词覆盖整行（引擎 graphemeTiming 均分逐字辉光）。
   2) MotionValue 适配：{get, subscribe, emit} duck-type（引擎每帧轮询
      get() 派发 change——useMotionValueEvent 的等价）。时间源
      getAdjustedLyricPlaybackTime(audio.currentTime)（含歌词偏移；
      覆盖层激活时主循环保温门控提前 return，motionSignalSet('currentTime')
      不再刷新，与 09-aurora-flow 同范式）。
   3) 主题桥：夜侧主题 → Folia Theme 形状 + fontFamilyStack 数组 +
      animationIntensity 随强度档 fx.visAnimationIntensity、wordColors 随
      主题词色表 orangesea-vis-word-colors-v1（07-fx/11-vis-mode-data-plane）；
      空表回退 accentColor 语义不变。fontWeight 不设（Folia = 用户歌词字重 ??
      undefined，壳 400 / 词 700 / 翻译行 500 / 下一句预览 400 逐调用点回退，
      见 classicTheme 注释）。
   3.5) 背景接管：原版 VisualizerShell 默认挂 VisualizerBackgroundRenderer
      （Shell:185-197，缺省 Latent——封面取色 MeshGradient + Dithering，
      audioPower/bands 驱动）。复用模式无关实现 TiltLatentBackground（tilt
      引擎产物注出），挂 #classic-bg-layer（z 序在歌词宿主之下）；信号桥/
      封面/暂停/700ms 主题与封面热更同步照 20b-tilt-engine-bridge 范式；
      无 tilt 产物 / WebGL2 不可用 → 保底 .classic-bg 暗角层。
   4) 生命周期：进入模式创建引擎（宿主 #classic-engine-host）、换歌/主题/
      字号轮询 sync（700ms）、退出 destroy。引擎加载失败仅 console.warn
      （DOM 引擎无 WebGL 依赖，正常环境不触发；无降级双路径——旧简化实现
      已被原版渲染核心取代删除）。
   ========================================================================= */

var CLASSIC_STORE_KEY = 'orangesea-classic-luminous-v1';
var classicMode = readBooleanPreference(CLASSIC_STORE_KEY, false);
var classicEngine = null;
var classicTimer = 0;
var classicLinesKey = '';
var classicThemeKey = '';
var classicFontScale = 0;

/* ---------- 数据形状：lyricsLines → Folia Line[] ---------- */

function classicToLines() {
  var src = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
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
    out.push({
      words: words,
      startTime: startT,
      endTime: endT,
      fullText: String(l.text || ''),
      translation: l.translation ? String(l.translation) : undefined,
      isChorus: !!l.isChorus
    });
  }
  return out;
}

/* ---------- MotionValue duck-type（引擎轮询 get，值变派发 change） ---------- */

function makeClassicTimeMV() {
  /* 每次引擎创建都发全新实例：引擎 create 时 subscribe 的回调捕获当次引擎
     全部内部状态，单例 MV 的 subs 只增不减会跨会话累积旧引擎闭包
     （订阅泄漏）；工厂化后旧 MV 随 stopXxx 一起丢弃。 */
  return {
    subs: [],
    get: function () {
    try {
      return getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0);
    } catch (e) { return 0; }
    },
    subscribe: function (fn) { this.subs.push(fn); },
    emit: function (v) { for (var i = 0; i < this.subs.length; i++) this.subs[i](v); }
  };
}
var classicTimeMV = makeClassicTimeMV();

/* ---------- 主题桥（夜侧 → Folia Theme 形状） ---------- */

function classicTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#0e0906', primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6' };
  var fontStack = '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  try {
    var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
    if (fontKey && typeof lyricFontStackForKey === 'function') fontStack = lyricFontStackForKey(fontKey);
  } catch (e) { }
  return {
    name: 'orangesea-classic',
    backgroundColor: t.backgroundColor,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor || t.primaryColor,
    accentColor: t.accentColor || t.primaryColor,
    fontStyle: 'sans',
    /* fontWeight 不设：Folia buildVisualizerTheme = 用户歌词字重 ?? undefined
       （缺省 null），resolveThemeFontWeight（fontStacks.ts:14-17）逐调用点
       回退——壳 400（Shell:132）/ 词 700（Visualizer:218）/ 翻译主行 500
       （SubtitleOverlay:176）/ 下一句预览 400（:205）。写死 700 会把
       400/500 的回退全部顶掉（同 20b-tilt / 20b-claddagh 桥约定） */
    fontFamilyStack: lyricFontStackFamilies(fontStack),
    animationIntensity: (typeof visAnimationIntensityCurrent === 'function') ? visAnimationIntensityCurrent() : 'normal',
    wordColors: (typeof visWordColorsList === 'function') ? visWordColorsList() : []
  };
}

/* ---------- tuning：DEFAULT_CLASSIC_TUNING 原值（types.ts:395-401）
   + 调参覆盖合并（07-fx/11-vis-mode-data-plane）。引擎端 classicResolveTuning
   逐字段空值合并；引擎暴露 setTuning，控制台改动 live 应用 ---------- */

var CLASSIC_DEFAULT_TUNING_BRIDGE = {
  enableWordRotation: true,
  breathingFloatMultiplier: 1,
  useLegacyLayout: false,
  wordSpacing: 0.7
};

function classicResolvedTuning() {
  if (typeof visModeTuningOverrides !== 'function') return CLASSIC_DEFAULT_TUNING_BRIDGE;
  return Object.assign({}, CLASSIC_DEFAULT_TUNING_BRIDGE, visModeTuningOverrides('classic'));
}
if (typeof visModeTuningRegisterLiveApply === 'function') {
  visModeTuningRegisterLiveApply('classic', function (tuning) {
    if (classicEngine && typeof classicEngine.setTuning === 'function') {
      try { classicEngine.setTuning(tuning); } catch (e) { }
    }
  });
}

/* ---------- 模式背景层（Folia VisualizerShell 默认背景 Latent 的宿主化） ----------
   原版：VisualizerShell.tsx:185-197 renderBackground →
   VisualizerBackgroundRenderer（mode 缺省 'latent'，types/visualizerModes.ts:42）
   → LatentBackground（封面取色 MeshGradient + Dithering，audioPower/bands 驱动；
   落点 z 序在歌词 children 之下）。
   本地：复用模式无关实现 TiltLatentBackground（tilt 引擎产物注出，index.html
   中 tilt-engine.js 先于本桥消费时机加载；20b-claddagh 桥同范式），挂
   #classic-bg-layer（z 序在歌词宿主 #classic-engine-host 之下）；无 tilt 产物 /
   WebGL2 不可用 → 返回 null，保底 .classic-bg 暗角层（classic.css）。
   信号桥/封面/暂停/700ms 主题与封面热更同步照 20b-tilt-engine-bridge 范式。 */

var classicBg = null;
var classicBgLastBandsRef = null;
var classicCoverKey = null;

function classicLatentAudioPower() {
  try {
    return ((typeof motionSignalGet === 'function') ? (motionSignalGet('audioPower') || 0) : 0) * 255;
  } catch (e) { return 0; }
}

/* 覆盖层保温期 bands 引用停更 → 从保活 frequencyData 自算回退
   （bin 划分照抄 92-background-registry.js visualizerBgBandsFallback） */
function classicLatentBandsFallback() {
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

function classicLatentPaused() {
  try { return !!(typeof audio !== 'undefined' && audio && audio.paused); } catch (e) { return false; }
}

function classicLatentBands() {
  var raw = null;
  try { raw = (typeof motionSignalGet === 'function') ? motionSignalGet('bands') : null; } catch (e) { }
  var paused = classicLatentPaused();
  if (raw) {
    if (raw === classicBgLastBandsRef && !paused) {
      raw = null;   /* 引用未更新且在播：保温期（或主循环音频闸门跳帧）→ 自算 */
    } else {
      classicBgLastBandsRef = raw;
    }
  }
  if (!raw && !paused) {
    raw = classicLatentBandsFallback();
  }
  if (!raw) return null;
  function to255(v) {
    v = Number(v);
    return isFinite(v) ? Math.max(0, Math.min(1, v)) * 255 : 0;
  }
  /* 频段映射（同 tilt/claddagh 桥）：bass/lowMid←kick，mid/vocal←vocal，treble←treble */
  return {
    bass: to255(raw.kick),
    lowMid: to255(raw.kick),
    mid: to255(raw.vocal),
    vocal: to255(raw.vocal),
    treble: to255(raw.treble)
  };
}

function classicLatentCoverUrl() {
  try { return (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null; } catch (e) { return null; }
}

function startClassicBg() {
  var bgHost = document.getElementById('classic-bg-layer');
  if (!bgHost || typeof TiltLatentBackground !== 'function') return;   /* 无引擎产物/无 WebGL2 → 保底暗角层 */
  try {
    classicBg = TiltLatentBackground({
      host: bgHost,
      theme: classicTheme(),
      audioPowerGet: classicLatentAudioPower,
      bandsGet: classicLatentBands,
      coverUrlGet: classicLatentCoverUrl,
      pausedGet: classicLatentPaused
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[ClassicEngine] background create failed', e);
    classicBg = null;
  }
  classicBgLastBandsRef = null;
  classicCoverKey = classicLatentCoverUrl();
}

/* ---------- 生命周期 ---------- */

function startClassic() {
  if (typeof applyOverlayModeFontScale === 'function') {
    applyOverlayModeFontScale(document.getElementById('classic-overlay'));
  }
  startClassicBg();   /* 背景层先于歌词引擎：引擎缺失/失败时背景仍独立成立 */
  var host = document.getElementById('classic-engine-host');
  if (!host || typeof ClassicClassicEngine !== 'function') {
    if (typeof console !== 'undefined') console.warn('[ClassicEngine] 引擎产物未加载（classic-engine.js）');
    return;
  }
  try {
    classicFontScale = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
    classicEngine = ClassicClassicEngine({
      host: host,
      lines: classicToLines(),
      currentTime: makeClassicTimeMV(),
      theme: classicTheme(),
      tuning: classicResolvedTuning(),
      lyricsFontScale: classicFontScale
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[ClassicEngine] runtime create failed', e);
    classicEngine = null;
    return;
  }
  classicLinesKey = '';
  classicThemeKey = '';
  (function loop() {
    if (!classicMode || !classicEngine) return;
    classicSync();
    classicTimer = setTimeout(loop, 700);
  })();
}

/* 换歌 / 主题 / 字号变化 → 引擎热更新（行数据与主题 key 轮询，700ms） */
function classicSync() {
  var eng = classicEngine;
  if (!eng) return;
  var ls = classicToLines();
  var linesKey = ls.length + '|' + (ls.length ? (ls[0].startTime + ':' + ls[ls.length - 1].startTime) : '');
  if (linesKey !== classicLinesKey) {
    classicLinesKey = linesKey;
    eng.setLines(ls);
  }
  var theme = classicTheme();
  var themeKey = JSON.stringify(theme);
  if (themeKey !== classicThemeKey) {
    classicThemeKey = themeKey;
    eng.setTheme(theme);
    if (classicBg) { try { classicBg.setTheme(theme); } catch (e) { } }
  }
  var fs = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
  if (fs !== classicFontScale) {
    classicFontScale = fs;
    eng.setFontScale(fs);
  }
  /* 背景层：封面变化重取色（LatentBackground.tsx:129-148 coverUrl
     useEffect 的轮询等价） */
  if (classicBg) {
    var coverUrl = classicLatentCoverUrl();
    if (coverUrl !== classicCoverKey) {
      classicCoverKey = coverUrl;
      try { classicBg.setCoverUrl(); } catch (e) { }
    }
  }
}

function stopClassic() {
  if (classicTimer) { clearTimeout(classicTimer); classicTimer = 0; }
  if (classicEngine) {
    try { classicEngine.destroy(); } catch (e) { }
    classicEngine = null;
  }
  if (classicBg) {
    try { classicBg.destroy(); } catch (e) { }
    classicBg = null;
  }
  classicBgLastBandsRef = null;
  classicCoverKey = null;
}

/* ---------- 切换入口（注册表 stateVar=classicMode / applyFn=applyClassicMode） ---------- */

function applyClassicMode(on, opts) {
  opts = opts || {};
  classicMode = !!on;
  if (classicMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('classic', { save: true });
  }
  document.body.classList.toggle('classic', classicMode);
  var overlay = document.getElementById('classic-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', classicMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(CLASSIC_STORE_KEY, classicMode);
  if (classicMode) {
    startClassic();
  } else {
    stopClassic();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(classicMode ? '流萤辉光已开启' : '已切回标准模式');
}

function toggleClassicMode() {
  applyClassicMode(!classicMode, { save: true, toast: true });
}

/* ---------- 启动恢复（模块顶层加载时执行，DOM 已就绪） ---------- */
function initClassic() {
  applyClassicMode(classicMode, { save: false });
}

scheduleUiWarmTask ? scheduleUiWarmTask(initClassic, 300) : setTimeout(initClassic, 300);
