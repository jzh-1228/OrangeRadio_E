/* =========================================================================
   OrangeSea · 云阶引擎桥（原版渲染核心宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — adapted from folia-major: src/components/visualizer/partita/VisualizerPartita.tsx
     的宿主职责（数据形状/时间源/主题/字号/生命周期桥接）。
   引擎本体在 10-shell-partita-engine/partita-engine.js（tsc 转译闭包 +
   mini-motion + 渲染核心手工落地），由 index.html 静态 <script> 先行加载。

   桥的内容（canvas/DOM 类模式的样板接线，与 20b-classic-engine-bridge 同范式）：
   1) 数据形状转换：本项目 lyricsLines（{text, t, duration, words:[{text,t,d}],
      translation, isChorus}）→ Folia Line（{fullText, startTime, endTime,
      words:[{text,startTime,endTime}], translation, isChorus}）；
      LRC 行（无 words）→ 单词覆盖整行（引擎 graphemeTiming 均分逐字辉光）。
   2) MotionValue 适配：{get, subscribe, emit} duck-type（引擎每帧轮询
      get() 派发 change——useMotionValueEvent 的等价）。时间源
      getAdjustedLyricPlaybackTime(audio.currentTime)（含歌词偏移）。
   3) 主题桥：夜侧主题 → Folia Theme 形状 + fontFamilyStack 数组 +
      animationIntensity 随强度档 fx.visAnimationIntensity、wordColors 随
      主题词色表 orangesea-vis-word-colors-v1（07-fx/11-vis-mode-data-plane）；
      空表回退 accentColor 语义不变。
   4) 生命周期：进入模式创建引擎（宿主 #partita-engine-host）、换歌/主题/
      字号轮询 sync（700ms）、退出 destroy。引擎加载失败仅 console.warn
      （DOM 引擎无 WebGL 依赖，正常环境不触发；无降级双路径——旧简化实现
      20-partita.js 已被原版渲染核心取代删除）。
   5) 背景接管：原版 VisualizerShell 默认挂 VisualizerBackgroundRenderer
      （Shell:185-197，缺省 Latent——封面取色 MeshGradient + Dithering，
      audioPower/bands 驱动）。复用模式无关实现 TiltLatentBackground
      （tilt 引擎产物注出，index.html 中 tilt-engine.js 先于本桥加载），
      挂 #partita-bg-layer（z 序在歌词宿主之下）；信号桥/封面/700ms 主题
      与封面热更同步照 20b-claddagh-engine-bridge 范式。
   6) 字重不写死：theme.fontWeight 缺省，Folia resolveThemeFontWeight
      （fontStacks.ts:14-17）逐调用点回退——词 700（Partita:420）/壳 400
      （Shell:132）/翻译行 500（SubtitleOverlay:176）/下一句预览 400（:205）。
      写死一个值会把其余回退全部顶掉（与 20b-claddagh-engine-bridge 同纪律）。
   ========================================================================= */

var PARTITA_STORE_KEY = 'orangesea-partita-v1';
var partitaMode = readBooleanPreference(PARTITA_STORE_KEY, false);
var partitaEngine = null;
var partitaTimer = 0;
var partitaLinesKey = '';
var partitaThemeKey = '';
var partitaFontScale = 0;
/* 背景层状态（原版 Shell 默认 Latent；与 20b-claddagh-engine-bridge 同范式） */
var partitaBg = null;
var partitaBgLastBandsRef = null;
var partitaCoverKey = null;

/* ---------- 数据形状：lyricsLines → Folia Line[]（含 renderHints） ---------- */

function partitaToLines() {
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
    /* renderHints（Folia 宿主在构建 Line 时携带；getLineRenderHints 语义 =
       line.renderHints ?? buildLineRenderHints(line)，但 partitaFindLineIndexAtTime
       的行保持窗口读 renderEndTime——不携带会回退 line.endTime 提前切行，
       丢掉原版 renderEndTime 的 exit polish 窗口。renderEndTime 阈值 0.10/0.18、
       micro floor 0.067——算法本体在引擎闭包） */
    if (hints) {
      try { line.renderHints = hints(line); } catch (e) { }
    }
    out.push(line);
  }
  return out;
}

/* ---------- MotionValue duck-type（引擎轮询 get，值变派发 change） ---------- */

function makePartitaTimeMV() {
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
var partitaTimeMV = makePartitaTimeMV();

/* ---------- 主题桥（夜侧 → Folia Theme 形状） ---------- */

function partitaTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#0e0906', primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6' };
  /* 缺省回退对齐引擎内建 BUILTIN_FONT_STACKS.sans（partita-engine.js:265）——
     引擎在 fontFamilyStack 为空数组时回退内建栈，两处必须同源 */
  var fontStack = '"Inter", "Noto Sans CJK SC", "Noto Sans JP", "Source Han Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif';
  try {
    var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
    if (fontKey && typeof lyricFontStackForKey === 'function') fontStack = lyricFontStackForKey(fontKey);
  } catch (e) { }
  return {
    name: 'orangesea-partita',
    backgroundColor: t.backgroundColor,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor || t.primaryColor,
    accentColor: t.accentColor || t.primaryColor,
    fontStyle: 'sans',
    /* fontWeight 不写死：MineRadio 主题对象无该字段，Folia
       resolveThemeFontWeight 逐调用点回退 700/400/500/400（见文件头第 6 条） */
    fontFamilyStack: lyricFontStackFamilies(fontStack),
    animationIntensity: (typeof visAnimationIntensityCurrent === 'function') ? visAnimationIntensityCurrent() : 'normal',
    wordColors: (typeof visWordColorsList === 'function') ? visWordColorsList() : []
  };
}

/* ---------- 模式背景层信号（原版 Shell 默认 Latent 背景；Folia 0..255 语义，
   照 20b-claddagh-engine-bridge 同范式） ---------- */

function partitaLatentAudioPower() {
  try {
    return ((typeof motionSignalGet === 'function') ? (motionSignalGet('audioPower') || 0) : 0) * 255;
  } catch (e) { return 0; }
}

/* 覆盖层保温期 bands 引用停更 → 从保活 frequencyData 自算回退
   （bin 划分照抄 92-background-registry.js visualizerBgBandsFallback） */
function partitaLatentBandsFallback() {
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

function partitaLatentPaused() {
  try { return !!(typeof audio !== 'undefined' && audio && audio.paused); } catch (e) { return false; }
}

function partitaLatentBands() {
  var raw = null;
  try { raw = (typeof motionSignalGet === 'function') ? motionSignalGet('bands') : null; } catch (e) { }
  var paused = partitaLatentPaused();
  if (raw) {
    if (raw === partitaBgLastBandsRef && !paused) {
      raw = null;   /* 引用未更新且在播：保温期（或主循环音频闸门跳帧）→ 自算 */
    } else {
      partitaBgLastBandsRef = raw;
    }
  }
  if (!raw && !paused) {
    raw = partitaLatentBandsFallback();
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

function partitaLatentCoverUrl() {
  try { return (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null; } catch (e) { return null; }
}

function startPartitaBg() {
  var bgHost = document.getElementById('partita-bg-layer');
  if (!bgHost || typeof TiltLatentBackground !== 'function') return;   /* 无 tilt 产物/无 WebGL2 → 保底夜空层（partita-sky） */
  try {
    partitaBg = TiltLatentBackground({
      host: bgHost,
      theme: partitaTheme(),
      audioPowerGet: partitaLatentAudioPower,
      bandsGet: partitaLatentBands,
      coverUrlGet: partitaLatentCoverUrl,
      pausedGet: partitaLatentPaused
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[PartitaEngine] background create failed', e);
    partitaBg = null;
  }
  partitaBgLastBandsRef = null;
  partitaCoverKey = partitaLatentCoverUrl();
}

/* ---------- tuning：DEFAULT_PARTITA_TUNING 原值（types.ts:432-437）
   + 调参覆盖合并（07-fx/11-vis-mode-data-plane，orangesea-vis-tuning-v1）。
   引擎端 partitaResolveTuning 逐字段空值合并，覆盖值只携带用户改过的字段；
   引擎暴露 setTuning → 控制台改动 live 应用 ---------- */

var PARTITA_DEFAULT_TUNING_BRIDGE = {
  showGuideLines: true,
  useSemanticLayout: true,
  staggerMin: 20,
  staggerMax: 100
};

function partitaResolvedTuning() {
  if (typeof visModeTuningOverrides !== 'function') return PARTITA_DEFAULT_TUNING_BRIDGE;
  return Object.assign({}, PARTITA_DEFAULT_TUNING_BRIDGE, visModeTuningOverrides('partita'));
}
if (typeof visModeTuningRegisterLiveApply === 'function') {
  visModeTuningRegisterLiveApply('partita', function (tuning) {
    if (partitaEngine && typeof partitaEngine.setTuning === 'function') {
      try { partitaEngine.setTuning(tuning); } catch (e) { }
    }
  });
}

/* ---------- 生命周期 ---------- */

function startPartita() {
  if (typeof applyOverlayModeFontScale === 'function') {
    applyOverlayModeFontScale(document.getElementById('partita-overlay'));
  }
  startPartitaBg();   /* 背景层先于歌词引擎：引擎缺失/失败时背景仍独立成立 */
  var host = document.getElementById('partita-engine-host');
  if (!host || typeof PartitaPartitaEngine !== 'function') {
    if (typeof console !== 'undefined') console.warn('[PartitaEngine] 引擎产物未加载（partita-engine.js）');
    return;
  }
  try {
    partitaFontScale = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
    partitaEngine = PartitaPartitaEngine({
      host: host,
      lines: partitaToLines(),
      currentTime: makePartitaTimeMV(),
      theme: partitaTheme(),
      tuning: partitaResolvedTuning(),
      lyricsFontScale: partitaFontScale
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[PartitaEngine] runtime create failed', e);
    partitaEngine = null;
    return;
  }
  partitaLinesKey = '';
  partitaThemeKey = '';
  (function loop() {
    if (!partitaMode || !partitaEngine) return;
    partitaSync();
    partitaTimer = setTimeout(loop, 700);
  })();
}

/* 换歌 / 主题 / 字号变化 → 引擎热更新（行数据与主题 key 轮询，700ms） */
function partitaSync() {
  var eng = partitaEngine;
  if (!eng) return;
  var ls = partitaToLines();
  var linesKey = ls.length + '|' + (ls.length ? (ls[0].startTime + ':' + ls[ls.length - 1].startTime) : '');
  if (linesKey !== partitaLinesKey) {
    partitaLinesKey = linesKey;
    eng.setLines(ls);
  }
  var theme = partitaTheme();
  var themeKey = JSON.stringify(theme);
  if (themeKey !== partitaThemeKey) {
    partitaThemeKey = themeKey;
    eng.setTheme(theme);
    /* 引擎 setTheme 重建 shell fontFamily/fontWeight（字体跟随热更路径）；
       背景层同步换色（Latent 取色随主题） */
    if (partitaBg) { try { partitaBg.setTheme(theme); } catch (e) { } }
  }
  var fs = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
  if (fs !== partitaFontScale) {
    partitaFontScale = fs;
    eng.setFontScale(fs);
  }
  /* 背景层：封面变化重取色（LatentBackground.tsx:129-148 coverUrl
     useEffect 的轮询等价） */
  if (partitaBg) {
    var coverUrl = partitaLatentCoverUrl();
    if (coverUrl !== partitaCoverKey) {
      partitaCoverKey = coverUrl;
      try { partitaBg.setCoverUrl(); } catch (e) { }
    }
  }
}

function stopPartita() {
  if (partitaTimer) { clearTimeout(partitaTimer); partitaTimer = 0; }
  if (partitaEngine) {
    try { partitaEngine.destroy(); } catch (e) { }
    partitaEngine = null;
  }
  if (partitaBg) {
    try { partitaBg.destroy(); } catch (e) { }
    partitaBg = null;
  }
  partitaBgLastBandsRef = null;
  partitaCoverKey = null;
}

/* ---------- 切换入口（注册表 stateVar=partitaMode / applyFn=applyPartitaMode） ---------- */

function applyPartitaMode(on, opts) {
  opts = opts || {};
  partitaMode = !!on;
  if (partitaMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('partita', { save: true });
  }
  document.body.classList.toggle('partita', partitaMode);
  var overlay = document.getElementById('partita-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', partitaMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(PARTITA_STORE_KEY, partitaMode);
  if (partitaMode) {
    startPartita();
  } else {
    stopPartita();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(partitaMode ? '云阶已开启' : '已切回标准模式');
}

function togglePartitaMode() {
  applyPartitaMode(!partitaMode, { save: true, toast: true });
}

/* ---------- 启动恢复（模块顶层加载时执行，DOM 已就绪） ---------- */
function initPartita() {
  applyPartitaMode(partitaMode, { save: false });
}

scheduleUiWarmTask ? scheduleUiWarmTask(initPartita, 300) : setTimeout(initPartita, 300);
