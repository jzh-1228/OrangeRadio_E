/* =========================================================================
   OrangeSea · 心象引擎桥（原版渲染核心宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — adapted from folia-major: src/components/visualizer/cadenza/
     VisualizerCadenza.tsx 的宿主职责（数据形状/时间源/能量源/主题/字号/生命周期桥接）。
   引擎本体在 10-shell-cadenza-engine/cadenza-engine.js（tsc 转译闭包 +
   渲染核心手工落地），由 index.html 静态 <script> 先行加载。

   桥的内容（canvas/DOM 类模式的样板接线，与 20b-classic-engine-bridge 同型）：
   1) 数据形状转换：本项目 lyricsLines（{text, t, duration, words:[{text,t,d}],
      translation, isChorus}）→ Folia Line（{fullText, startTime, endTime,
      words:[{text,startTime,endTime}], translation, isChorus}）；
      LRC 行（无 words）→ 单词覆盖整行（引擎 graphemeTiming 均分逐字辉光）。
   2) MotionValue 适配：currentTime 用 {get, subscribe, emit} duck-type
      （引擎 rAF 每帧轮询 get()——Folia currentTime MotionValue.get() 的等价），
      时间源 getAdjustedLyricPlaybackTime(audio.currentTime)（含歌词偏移）。
      audioPower 用 0..255 值域 MV（Folia 值域）：主循环保温门控期间
      motionSignalGet('audioPower') 停更（11-main-loop.js 覆盖层分支在写入前
      早退），但 timeDomainData 仍被覆盖层分支采集（:379-381），桥按主循环
      同公式（:427-437 时域 RMS ×2.4 clamp 1）自算后 ×255，能量驱动忠实。
   3) 主题桥：夜侧主题 → Folia Theme 形状 + fontFamilyStack 数组 +
      animationIntensity 随强度档 fx.visAnimationIntensity、wordColors 随
      主题词色表 orangesea-vis-word-colors-v1（07-fx/11-vis-mode-data-plane）；
      空表回退 accentColor 语义不变。
   4) 生命周期：进入模式创建引擎（宿主 #cadenza-engine-host）、换歌/主题/
      字号轮询 sync（700ms）、退出 destroy。引擎加载失败仅 console.warn
      （DOM+Canvas 引擎无 WebGL 依赖，正常环境不触发；无降级双路径——
      旧简化实现 21-cadenza.js 已被原版渲染核心取代删除）。
   5) 模式背景层（Folia VisualizerShell 默认背景 Latent 的宿主化，20b 桥
      扮演 VisualizerShell 职责，与 20b-tilt-engine-bridge 同范式）：
      - Folia：VisualizerShell.tsx:185-197 renderBackground →
        VisualizerBackgroundRenderer（mode 缺省 'latent'，
        types/visualizerModes.ts:43）→ LatentBackground（封面取色 MeshGradient
        + Dithering 双 shader，audioPower/bands 驱动；落点 z 序在歌词 children
        之下）；
      - 本地：复用模式无关实现 TiltLatentBackground（tilt 引擎产物注出，
        index.html 中 tilt-engine.js 先于本桥消费时机加载；20b-classic/
        claddagh/partita/pendolo 桥同范式），挂 #cadenza-bg-layer
        （cadenza.css z 序：.cadenza-backdrop(auto) → 本层(1) →
        #cadenza-engine-host(2)），WebGL2 不可用时返回 null → 保底
        overlay 暗底 + .cadenza-backdrop 微光；
      - 信号（usePlaybackVisualizerBridge.ts:93-131 逐式同构，0..255 语义，
        照 tilt 桥精确路径）：可闻时（!paused && !ended && analyser 存在）
        直接从主循环保活的 frequencyData（覆盖层保温期仍每帧采集，
        11-main-loop.js:369-372）经 tiltBandsCompute 按 21.5Hz/bin 分箱求均值
        + 每带幂次整形（bass 20-150Hz×1.8 / lowMid 150-400Hz×2 / mid
        400-1200Hz×2 / vocal 1000-3500Hz×1.5 / treble 3500-12000Hz×2），
        audioPower = process((bass+lowMid)/2, 3)；不可闻 → 五带与 audioPower
        取呼吸值 (sin(t)+1)*20（:121-131，LatentBackground 暂停态目标归零等价）；
      - 封面：getControlCoverUrl()（95-background-runtime 同源）→ 引擎内
        50×50 加权中位切取色（LatentBackground.tsx:139 同参 6 色）；
      - 暂停：audio.paused → 驱动循环目标归零 + 速度 base*0.12
        （LatentBackground.tsx:28 PAUSED_SPEED_SCALE）；
      - 700ms sync 内主题/封面热更（setTheme/setCoverUrl，LatentBackground
        coverUrl useEffect 的轮询等价）。
   ========================================================================= */

var CADENZA_STORE_KEY = 'orangesea-cadenza-v1';
var cadenzaMode = (typeof readBooleanPreference === 'function')
  ? readBooleanPreference(CADENZA_STORE_KEY, false) : false;
var cadenzaEngine = null;
var cadenzaTimer = 0;
var cadenzaLinesKey = '';
var cadenzaThemeKey = '';
var cadenzaFontScale = 0;

/* ---------- 数据形状：lyricsLines → Folia Line[] ---------- */

function cadenzaToLines() {
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

/* ---------- currentTime MV duck-type（引擎每帧轮询 get） ---------- */

var cadenzaTimeMV = {
  subs: [],
  get: function () {
    try {
      return getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0);
    } catch (e) { return 0; }
  },
  subscribe: function (fn) { this.subs.push(fn); },
  emit: function (v) { for (var i = 0; i < this.subs.length; i++) this.subs[i](v); }
};

/* ---------- audioPower MV（0..255 值域同 Folia；门控期自算时域 RMS） ---------- */

var cadenzaPowerMV = {
  get: function () {
    /* 主循环保温门控期间 motionSignalGet('audioPower') 停更；timeDomainData
       仍被主循环覆盖层分支采集（11-main-loop.js:379-381），按同公式自算
       （:427-437：时域 RMS，×2.4 clamp 1），再 ×255 对齐 Folia 值域。 */
    try {
      var td = (typeof timeDomainData !== 'undefined') ? timeDomainData : null;
      if (td && td.length) {
        var sum = 0;
        for (var i = 0; i < td.length; i++) {
          var v = (td[i] - 128) / 128;
          sum += v * v;
        }
        var rms = Math.sqrt(sum / td.length);
        return Math.min(1, rms * 2.4) * 255;
      }
    } catch (e) { }
    try {
      return ((typeof motionSignalGet === 'function') ? (motionSignalGet('audioPower') || 0) : 0) * 255;
    } catch (e) { return 0; }
  }
};

/* ---------- 主题桥（夜侧 → Folia Theme 形状） ---------- */

function cadenzaTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#0e0906', primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6' };
  var fontStack = '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  try {
    var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
    if (fontKey && typeof lyricFontStackForKey === 'function') fontStack = lyricFontStackForKey(fontKey);
  } catch (e) { }
  return {
    name: 'orangesea-cadenza',
    backgroundColor: t.backgroundColor,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor || t.primaryColor,
    accentColor: t.accentColor || t.primaryColor,
    fontStyle: 'sans',
    /* 字重随用户歌词字重设置（buildVisualizerTheme.ts:43 语义，lyricFontWeightValue
   含书法体 400/石腕体 900 特例） */
fontWeight: (typeof lyricFontWeightValue === 'function') ? lyricFontWeightValue() : 700,
    fontFamilyStack: lyricFontStackFamilies(fontStack),
    animationIntensity: (typeof visAnimationIntensityCurrent === 'function') ? visAnimationIntensityCurrent() : 'normal',
    wordColors: (typeof visWordColorsList === 'function') ? visWordColorsList() : []
  };
}

/* ---------- tuning：DEFAULT_CADENZA_TUNING 原值（types.ts:405-419）
   + 调参覆盖合并（07-fx/11-vis-mode-data-plane）。引擎端 resolveTuning
   逐字段空值合并；引擎暴露 setTuning，控制台改动 live 应用 ---------- */

var CADENZA_DEFAULT_TUNING_BRIDGE = {
  fontScale: 1.12,
  widthRatio: 0.72,
  motionAmount: 1,
  glowIntensity: 1,
  beamIntensity: 0
};

function cadenzaResolvedTuning() {
  if (typeof visModeTuningOverrides !== 'function') return CADENZA_DEFAULT_TUNING_BRIDGE;
  return Object.assign({}, CADENZA_DEFAULT_TUNING_BRIDGE, visModeTuningOverrides('cadenza'));
}
if (typeof visModeTuningRegisterLiveApply === 'function') {
  visModeTuningRegisterLiveApply('cadenza', function (tuning) {
    if (cadenzaEngine && typeof cadenzaEngine.setTuning === 'function') {
      try { cadenzaEngine.setTuning(tuning); } catch (e) { }
    }
  });
}

/* ---------- 模式背景层信号（Folia usePlaybackVisualizerBridge.ts:93-131 逐式
   同构——原始 FFT 字节直算，见文件头第 5 条；照 20b-tilt-engine-bridge 精确路径） ---------- */

/* 可闻判定（:81-87）：isActuallyPlaying = !paused && !ended；MineRadio 无
   automix 过渡 → hasAudibleSignal = 正在播放；folia 还要求 analyser 存在
   （:87），缺失走呼吸分支（:121-131） */
function cadenzaLatentAudible() {
  try {
    return !!(typeof audio !== 'undefined' && audio && !audio.paused && !audio.ended &&
      typeof analyser !== 'undefined' && analyser);
  } catch (e) { return false; }
}

/* 呼吸值（:122-123）：(sin(Date.now()/2000)+1)*20，0..40（tiltBandsBreath 为
   tilt 引擎产物注出的纯函数，数值级断言在 tests/tilt.test.js） */
function cadenzaLatentBreathValue() {
  if (typeof tiltBandsBreath !== 'function') return (Math.sin(Date.now() / 2000) + 1) * 20;
  return tiltBandsBreath(Date.now());
}

/* audioPower（:115）：process((bass+lowMid)/2, 3)，吃整形前原始能量 */
function cadenzaLatentAudioPower() {
  if (!cadenzaLatentAudible()) return cadenzaLatentBreathValue();
  if (typeof tiltBandsCompute !== 'function') return cadenzaLatentBreathValue();
  return tiltBandsCompute((typeof frequencyData !== 'undefined' && frequencyData) ? frequencyData : null).audioPower;
}

/* 五频带（:116-120）：bass 20-150 / lowMid 150-400 / mid 400-1200 /
   vocal 1000-3500 / treble 3500-12000Hz，boost 1.8/2/2/1.5/2（0..255 语义） */
function cadenzaLatentBands() {
  if (!cadenzaLatentAudible() || typeof tiltBandsCompute !== 'function') {
    var breath = cadenzaLatentBreathValue();
    return { bass: breath, lowMid: breath, mid: breath, vocal: breath, treble: breath };
  }
  var b = tiltBandsCompute((typeof frequencyData !== 'undefined' && frequencyData) ? frequencyData : null);
  return { bass: b.bass, lowMid: b.lowMid, mid: b.mid, vocal: b.vocal, treble: b.treble };
}

function cadenzaLatentCoverUrl() {
  try { return (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null; } catch (e) { return null; }
}

function cadenzaLatentPaused() {
  try { return !!(typeof audio !== 'undefined' && audio && audio.paused); } catch (e) { return false; }
}

var cadenzaBg = null;
var cadenzaCoverKey = null;

function startCadenzaBg() {
  var bgHost = document.getElementById('cadenza-bg-layer');
  if (!bgHost || typeof TiltLatentBackground !== 'function') return;   /* 无 tilt 产物/无 WebGL2 → 保底暗底微光 */
  try {
    cadenzaBg = TiltLatentBackground({
      host: bgHost,
      theme: cadenzaTheme(),
      audioPowerGet: cadenzaLatentAudioPower,
      bandsGet: cadenzaLatentBands,
      coverUrlGet: cadenzaLatentCoverUrl,
      pausedGet: cadenzaLatentPaused
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[CadenzaEngine] background create failed', e);
    cadenzaBg = null;
  }
  cadenzaCoverKey = cadenzaLatentCoverUrl();
}

/* ---------- 生命周期 ---------- */

function startCadenza() {
  if (typeof applyOverlayModeFontScale === 'function') {
    applyOverlayModeFontScale(document.getElementById('cadenza-overlay'));
  }
  startCadenzaBg();   /* 背景层先于歌词引擎：引擎缺失/失败时背景仍独立成立 */
  var host = document.getElementById('cadenza-engine-host');
  if (!host || typeof CadenzaCadenzaEngine !== 'function') {
    if (typeof console !== 'undefined') console.warn('[CadenzaEngine] 引擎产物未加载（cadenza-engine.js）');
    return;
  }
  try {
    cadenzaFontScale = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
    cadenzaEngine = CadenzaCadenzaEngine({
      host: host,
      lines: cadenzaToLines(),
      currentTime: cadenzaTimeMV,
      audioPower: cadenzaPowerMV,
      theme: cadenzaTheme(),
      tuning: cadenzaResolvedTuning(),
      lyricsFontScale: cadenzaFontScale
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[CadenzaEngine] runtime create failed', e);
    cadenzaEngine = null;
    return;
  }
  cadenzaLinesKey = '';
  cadenzaThemeKey = '';
  (function loop() {
    if (!cadenzaMode || !cadenzaEngine) return;
    cadenzaSync();
    cadenzaTimer = setTimeout(loop, 700);
  })();
}

/* 换歌 / 主题 / 字号变化 → 引擎热更新（行数据与主题 key 轮询，700ms） */
function cadenzaSync() {
  var eng = cadenzaEngine;
  if (!eng) return;
  var ls = cadenzaToLines();
  var linesKey = ls.length + '|' + (ls.length ? (ls[0].startTime + ':' + ls[ls.length - 1].startTime) : '');
  if (linesKey !== cadenzaLinesKey) {
    cadenzaLinesKey = linesKey;
    eng.setLines(ls);
  }
  var theme = cadenzaTheme();
  var themeKey = JSON.stringify(theme);
  if (themeKey !== cadenzaThemeKey) {
    cadenzaThemeKey = themeKey;
    eng.setTheme(theme);
    if (cadenzaBg) { try { cadenzaBg.setTheme(theme); } catch (e) { } }
  }
  var fs = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
  if (fs !== cadenzaFontScale) {
    cadenzaFontScale = fs;
    eng.setFontScale(fs);
  }
  /* 背景层：封面变化重取色（LatentBackground.tsx:129-148 coverUrl
     useEffect 的轮询等价） */
  if (cadenzaBg) {
    var coverUrl = cadenzaLatentCoverUrl();
    if (coverUrl !== cadenzaCoverKey) {
      cadenzaCoverKey = coverUrl;
      try { cadenzaBg.setCoverUrl(); } catch (e) { }
    }
  }
}

function stopCadenza() {
  if (cadenzaTimer) { clearTimeout(cadenzaTimer); cadenzaTimer = 0; }
  if (cadenzaEngine) {
    try { cadenzaEngine.destroy(); } catch (e) { }
    cadenzaEngine = null;
  }
  if (cadenzaBg) {
    try { cadenzaBg.destroy(); } catch (e) { }
    cadenzaBg = null;
  }
  cadenzaCoverKey = null;
}

/* ---------- 切换入口（注册表 stateVar=cadenzaMode / applyFn=applyCadenzaMode） ---------- */

function applyCadenzaMode(on, opts) {
  opts = opts || {};
  cadenzaMode = !!on;
  if (cadenzaMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('cadenza', { save: true });
  }
  document.body.classList.toggle('cadenza', cadenzaMode);
  var overlay = document.getElementById('cadenza-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', cadenzaMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(CADENZA_STORE_KEY, cadenzaMode);
  if (cadenzaMode) {
    startCadenza();
  } else {
    stopCadenza();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast && typeof showToast === 'function') {
    showToast(cadenzaMode ? '心象已开启' : '已切回标准模式');
  }
}

function toggleCadenzaMode() {
  applyCadenzaMode(!cadenzaMode, { save: true, toast: true });
}

/* ---------- 启动恢复（模块顶层加载时执行，DOM 已就绪） ---------- */

function initCadenza() {
  applyCadenzaMode(cadenzaMode, { save: false });
}

(typeof scheduleUiWarmTask === 'function')
  ? scheduleUiWarmTask(initCadenza, 320)
  : setTimeout(initCadenza, 320);
