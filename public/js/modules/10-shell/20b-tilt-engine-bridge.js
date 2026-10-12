/* =========================================================================
   OrangeSea · 斜排引擎桥（原版渲染核心宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — adapted from folia-major: src/components/visualizer/tilt/VisualizerTilt.tsx
     的宿主职责（数据形状/时间源/主题/字号/生命周期桥接）。
   引擎本体在 10-shell-tilt-engine/tilt-engine.js（tsc 转译闭包
   sentenceLayout/renderHints/graphemeTiming/fontStacks/colorMix/
   subtitleFontSizes + mini-motion + 渲染核心手工落地），由 index.html
   静态 <script> 先行加载（pretext 全局 bundle 已在其前加载）。

   桥的内容（DOM 类模式样板接线，与 20b-classic-engine-bridge 同范式）：
   1) 数据形状转换：本项目 lyricsLines（{text, t, duration, words:[{text,t,d}],
      translation, isChorus}）→ Folia Line（{fullText, startTime, endTime,
      words:[{text,startTime,endTime}], translation, isChorus}）；
      LRC 行（无 words）→ 单词覆盖整行（引擎 buildCharTimings 段均分兜底）。
   2) MotionValue 适配：{get, subscribe, emit} duck-type（引擎每帧轮询
      get() 派发 change——useInsertionEffect 订阅的等价）。时间源
      getAdjustedLyricPlaybackTime(audio.currentTime)（含歌词偏移；
      覆盖层激活时主循环保温门控提前 return，motionSignalSet('currentTime')
      不再刷新，与 20b-classic 桥同范式）。
   3) 主题桥：夜侧主题 → Folia Theme 形状 + fontFamilyStack 数组 +
      animationIntensity 'normal' + wordColors []。tilt 不消费
      animationIntensity/wordColors（VisualizerTilt 无此依赖），按样板统一。
      字重：不设 fontWeight——folia 语义为用户歌词字重设置 ?? undefined
      （buildVisualizerTheme.ts:43），缺省 null → 引擎 resolveThemeFontWeight
      走 400（正常段）/ 300（大斜体段）回退（fontStacks.ts:25-27，
      VisualizerTilt.tsx:217-218/444/495 的模式签名对比字重）；写死 700 会
      把两段都抬到 700 抹掉斜体细字重对比，已移除。
   4) 生命周期：进入模式创建引擎（宿主 #tilt-engine-host）、换歌/主题/
      字号轮询 sync（700ms）、退出 destroy。tuning 取引擎内
      DEFAULT_TILT_TUNING 原值（types.ts:496：拆行概率 0.75 / 斜体概率
      0.35 / 配色 default——与原版面板默认一致，本项目无调参面板）。
      引擎加载失败仅 console.warn（DOM 引擎无 WebGL 依赖，正常环境不触发；
      无降级双路径——旧简化实现已被原版渲染核心取代删除）。

   5) 模式背景层（VisualizerShell 默认背景 Latent 的宿主化，20b 桥扮演
      VisualizerShell 职责）：
      - Folia：VisualizerShell.tsx:185-197 renderBackground →
        VisualizerBackgroundRenderer（mode 缺省 'latent'，
        types/visualizerModes.ts:43）→ LatentBackground（封面取色 + 双
        Paper shader + 音频驱动；落点 z 序在歌词 children 之下）；
      - 本地：引擎产物注出 TiltLatentBackground（manual/tilt-background-core.js，
        算法/常量与 LatentBackground.tsx:27-326 同构），挂 #tilt-bg-layer
        （tilt.css z 序：.tilt-backdrop(1) → #tilt-bg-layer(1,DOM 后位) →
        #tilt-engine-host(2)），WebGL2 不可用时返回 null → 保底暖夜层；
      - 信号（usePlaybackVisualizerBridge.ts:93-131 逐式同构，0..255 语义）：
        可闻时（!paused && !ended && analyser 存在）直接从主循环保活的
        frequencyData（覆盖层保温期仍每帧采集，11-main-loop.js:369-372）
        按 21.5Hz/bin 分箱求均值 + 每带幂次整形：bass 20-150Hz(×1.8) /
        lowMid 150-400Hz(×2) / mid 400-1200Hz(×2) / vocal 1000-3500Hz(×1.5) /
        treble 3500-12000Hz(×2)；audioPower = process((bass+lowMid)/2, 3)。
        纯函数在引擎产物（tiltBandsGetEnergy/Process/Compute/Breath，
        数值级可测）；不可闻 → 五带与 audioPower 取呼吸值
        (sin(t)+1)*20（:121-131，LatentBackground 暂停态目标归零等价）；
      - 封面：getControlCoverUrl()（95-background-runtime 同源）→ 引擎内
        50×50 加权中位切取色（LatentBackground.tsx:139 同参 6 色）；
      - 暂停：audio.paused → 驱动循环目标归零 + 速度 base*0.12
        （LatentBackground.tsx:28 PAUSED_SPEED_SCALE）。
   ========================================================================= */

var TILT_STORE_KEY = 'orangesea-tilt-mode-v1';
var tiltMode = readBooleanPreference(TILT_STORE_KEY, false);
var tiltEngine = null;
var tiltBg = null;
var tiltTimer = 0;
var tiltLinesKey = '';
var tiltThemeKey = '';
var tiltFontScale = 0;
var tiltCoverKey = null;

/* ---------- 数据形状：lyricsLines → Folia Line[] ---------- */

function tiltToLines() {
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

function makeTiltTimeMV() {
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
var tiltTimeMV = makeTiltTimeMV();

/* ---------- 主题桥（夜侧 → Folia Theme 形状） ---------- */

function tiltTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#0e0906', primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6' };
  var fontStack = '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  try {
    var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
    if (fontKey && typeof lyricFontStackForKey === 'function') fontStack = lyricFontStackForKey(fontKey);
  } catch (e) { }
  return {
    name: 'orangesea-tilt',
    backgroundColor: t.backgroundColor,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor || t.primaryColor,
    accentColor: t.accentColor || t.primaryColor,
    fontStyle: 'sans',
    /* fontWeight 不设：folia = 用户歌词字重 ?? undefined（buildVisualizerTheme.ts:43），
       引擎回退 400/300（见文件头第 3 条） */
    fontFamilyStack: lyricFontStackFamilies(fontStack),
    animationIntensity: (typeof visAnimationIntensityCurrent === 'function') ? visAnimationIntensityCurrent() : 'normal',
    wordColors: (typeof visWordColorsList === 'function') ? visWordColorsList() : []
  };
}

/* ---------- 模式背景层信号（Folia usePlaybackVisualizerBridge.ts:93-131 逐式
   同构——原始 FFT 字节直算，见文件头第 5 条） ---------- */

/* 可闻判定（:81-87）：isActuallyPlaying = !paused && !ended；MineRadio 无
   automix 过渡 → hasAudibleSignal = 正在播放；folia 还要求 analyser 存在
   （:87），缺失走呼吸分支（:121-131） */
function tiltLatentAudible() {
  try {
    return !!(typeof audio !== 'undefined' && audio && !audio.paused && !audio.ended &&
      typeof analyser !== 'undefined' && analyser);
  } catch (e) { return false; }
}

/* 呼吸值（:122-123）：(sin(Date.now()/2000)+1)*20，0..40 */
function tiltLatentBreathValue() {
  return tiltBandsBreath(Date.now());
}

/* audioPower（:115）：process((bass+lowMid)/2, 3)，吃整形前原始能量 */
function tiltLatentAudioPower() {
  if (!tiltLatentAudible()) return tiltLatentBreathValue();
  return tiltBandsCompute((typeof frequencyData !== 'undefined' && frequencyData) ? frequencyData : null).audioPower;
}

/* 五频带（:116-120）：bass 20-150 / lowMid 150-400 / mid 400-1200 /
   vocal 1000-3500 / treble 3500-12000Hz，boost 1.8/2/2/1.5/2（0..255 语义） */
function tiltLatentBands() {
  if (!tiltLatentAudible()) {
    var breath = tiltLatentBreathValue();
    return { bass: breath, lowMid: breath, mid: breath, vocal: breath, treble: breath };
  }
  var b = tiltBandsCompute((typeof frequencyData !== 'undefined' && frequencyData) ? frequencyData : null);
  return { bass: b.bass, lowMid: b.lowMid, mid: b.mid, vocal: b.vocal, treble: b.treble };
}

function tiltLatentCoverUrl() {
  try { return (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null; } catch (e) { return null; }
}

function tiltLatentPaused() {
  try { return !!(typeof audio !== 'undefined' && audio && audio.paused); } catch (e) { return false; }
}

function startTiltBg() {
  var bgHost = document.getElementById('tilt-bg-layer');
  if (!bgHost || typeof TiltLatentBackground !== 'function') return;   /* 无引擎产物/无 WebGL2 → 保底暖夜层 */
  try {
    tiltBg = TiltLatentBackground({
      host: bgHost,
      theme: tiltTheme(),
      audioPowerGet: tiltLatentAudioPower,
      bandsGet: tiltLatentBands,
      coverUrlGet: tiltLatentCoverUrl,
      pausedGet: tiltLatentPaused
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[TiltEngine] background create failed', e);
    tiltBg = null;
  }
  tiltCoverKey = tiltLatentCoverUrl();
}

/* ---------- 生命周期 ---------- */

/* 调参覆盖 live 应用（07-fx/11-vis-mode-data-plane，orangesea-vis-tuning-v1）：
   引擎端 tiltResolveTuning 逐字段空值合并，控制台改动经 setTuning live 生效 */
if (typeof visModeTuningRegisterLiveApply === 'function') {
  visModeTuningRegisterLiveApply('tilt', function (tuning) {
    if (tiltEngine && typeof tiltEngine.setTuning === 'function') {
      try { tiltEngine.setTuning(tuning); } catch (e) { }
    }
  });
}

function startTilt() {
  if (typeof applyOverlayModeFontScale === 'function') {
    applyOverlayModeFontScale(document.getElementById('tilt-overlay'));
  }
  startTiltBg();   /* 背景层先于歌词引擎：引擎缺失/失败时背景仍独立成立 */
  var host = document.getElementById('tilt-engine-host');
  if (!host || typeof TiltTiltEngine !== 'function') {
    if (typeof console !== 'undefined') console.warn('[TiltEngine] 引擎产物未加载（tilt-engine.js）');
    return;
  }
  try {
    tiltFontScale = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
    tiltEngine = TiltTiltEngine({
      host: host,
      lines: tiltToLines(),
      currentTime: makeTiltTimeMV(),
      theme: tiltTheme(),
      lyricsFontScale: tiltFontScale,
      tuning: (typeof visModeTuningOverrides === 'function') ? visModeTuningOverrides('tilt') : undefined
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[TiltEngine] runtime create failed', e);
    tiltEngine = null;
    return;
  }
  tiltLinesKey = '';
  tiltThemeKey = '';
  (function loop() {
    if (!tiltMode || !tiltEngine) return;
    tiltSync();
    tiltTimer = setTimeout(loop, 700);
  })();
}

/* 换歌 / 主题 / 字号变化 → 引擎热更新（行数据与主题 key 轮询，700ms） */
function tiltSync() {
  var eng = tiltEngine;
  if (!eng) return;
  var ls = tiltToLines();
  var linesKey = ls.length + '|' + (ls.length ? (ls[0].startTime + ':' + ls[ls.length - 1].startTime) : '');
  if (linesKey !== tiltLinesKey) {
    tiltLinesKey = linesKey;
    eng.setLines(ls);
  }
  var theme = tiltTheme();
  var themeKey = JSON.stringify(theme);
  if (themeKey !== tiltThemeKey) {
    tiltThemeKey = themeKey;
    eng.setTheme(theme);
    if (tiltBg) { try { tiltBg.setTheme(theme); } catch (e) { } }
  }
  var fs = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
  if (fs !== tiltFontScale) {
    tiltFontScale = fs;
    eng.setFontScale(fs);
  }
  /* 背景层：封面变化重取色（LatentBackground.tsx:129-148 coverUrl
     useEffect 的轮询等价） */
  if (tiltBg) {
    var coverUrl = tiltLatentCoverUrl();
    if (coverUrl !== tiltCoverKey) {
      tiltCoverKey = coverUrl;
      try { tiltBg.setCoverUrl(); } catch (e) { }
    }
  }
}

function stopTilt() {
  if (tiltTimer) { clearTimeout(tiltTimer); tiltTimer = 0; }
  if (tiltEngine) {
    try { tiltEngine.destroy(); } catch (e) { }
    tiltEngine = null;
  }
  if (tiltBg) {
    try { tiltBg.destroy(); } catch (e) { }
    tiltBg = null;
  }
  tiltCoverKey = null;
}

/* ---------- 切换入口（注册表 stateVar=tiltMode / applyFn=applyTiltMode） ---------- */

function applyTiltMode(on, opts) {
  opts = opts || {};
  tiltMode = !!on;
  /* 互斥：经视觉模式注册表退出其它覆盖层 */
  if (tiltMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('tilt', { save: true });
  }
  document.body.classList.toggle('tilt', tiltMode);
  var overlay = document.getElementById('tilt-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', tiltMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(TILT_STORE_KEY, tiltMode);
  if (tiltMode) {
    startTilt();
  } else {
    stopTilt();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(tiltMode ? '斜排已开启' : '已切回标准模式');
}

function toggleTiltMode() {
  applyTiltMode(!tiltMode, { save: true, toast: true });
}

/* ---------- 启动恢复（模块顶层加载时执行，DOM 已就绪） ---------- */
function initTilt() {
  applyTiltMode(tiltMode, { save: false });
}

scheduleUiWarmTask ? scheduleUiWarmTask(initTilt, 300) : setTimeout(initTilt, 300);
