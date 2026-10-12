/* =========================================================================
   OrangeSea · 烟纸引擎桥（原版渲染核心宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — adapted from folia-major: src/components/visualizer/fume/VisualizerFume.tsx
     的宿主职责（数据形状/时间源/主题/字号/生命周期桥接）。
   引擎本体在 10-shell-fume-engine/fume-engine.js（tsc 转译闭包：fume 全部
   16 模块 + FumeBackground + colorMix/renderHints/graphemeTiming/fontStacks/
   wordColoring/subtitleFontSizes/alternateText/subtitleTrackStyle/
   glowBlurQuantize + 渲染核心手工落地），由 index.html 静态 <script> 先行
   加载（pretext 全局 bundle 已在其前）。

   桥的内容（DOM/canvas 类模式样板接线，与 20b-tilt-engine-bridge 同范式）：
   1) 数据形状转换：本项目 lyricsLines（{text, t, duration, words:[{text,t,d}],
      translation, isChorus}）→ Folia Line（{fullText, startTime, endTime,
      words:[{text,startTime,endTime}], translation, isChorus}）；
      LRC 行（无 words）→ 单词覆盖整行（引擎词区间兜底）。
   2) MotionValue 适配：{get} duck-type（引擎每帧轮询 get()——fume stage 的
      draw 循环直接 currentTime.get()，无需订阅派发）。时间源
      getAdjustedLyricPlaybackTime(audio.currentTime)（含歌词偏移；
      覆盖层激活时主循环保温门控提前 return，motionSignalSet('currentTime')
      不再刷新，与 20b-classic/tilt 桥同范式）。
      audioPower → motionSignalGet('audioPower') 0..1（Folia 0..255 语义；
      fume 的 drawFumeBackground 不消费 power，仅接口形状）。
      audioBands → motionSignalGet('bands') [bass,vocal,treble] 0..255 原值
      （Folia bands 即 0..255——usePlaybackVisualizerBridge.ts:112-121；
      drawFumeBackground 的 (v-10)/190 输入域即 0..200+）。宿主仅 3 槽，
      lowMid/mid/vocal 取 vocal 槽（与 26a-sonnet 桥同映射）。
   3) 主题桥：夜侧主题 → Folia Theme 形状 + fontFamilyStack 数组 +
      animationIntensity 随强度档 fx.visAnimationIntensity（calm/normal/
      chaotic，07-fx/11-vis-mode-data-plane）、wordColors 随主题词色表
      orangesea-vis-word-colors-v1；fume 消费 animationIntensity（相机浮动/
      辉光基准三档），wordColors 空 → getActiveColor 回退 accentColor
      （算法本体已随闭包落地）。字体跟随（buildVisualizerTheme.ts:46-51
      语义）：fontFamilyStack = lyricFontStackForKey(fx.lyricFont)、
      fontStyle = 歌词字体档映射（衬线/书法档→serif、mono→mono、余→sans，
      决定 resolveThemeFontStack 尾接内置栈）、fontWeight =
      lyricFontWeightValue()（fx.lyricWeight；缺省 undefined → 引擎原回退
      hero 780 / body 640，fumeTextMeasure.ts:178——写死会抹掉粗细对比）。
   3.5) 背景接管（原版 Shell 默认 Latent 的宿主化，见下方信号桥段详注）：
      VisualizerShell.tsx:185-197 → VisualizerBackgroundRenderer（mode 缺省
      'latent'，visualizerModes.ts:42）→ 封面取色 MeshGradient + Dithering。
      复用模式无关实现 TiltLatentBackground（tilt 引擎产物注出，index.html
      中 tilt-engine.js 先于本引擎加载），挂 #fume-bg-layer（z 序在歌词
      canvas 之下）；信号桥/封面/暂停/700ms 主题与封面热更照
      20b-claddagh-engine-bridge 同范式（保温期 bands 引用检测 + 保活
      frequencyData 自算回退 + 五带 0..255）。fume canvas 自带几何线稿
      （FumeBackground.ts buildFumeBackgroundScene/drawFumeBackground）为
      第二层，已在引擎核心跑通——两层背景与原版一致。
   4) 生命周期：进入模式创建引擎（宿主 #fume-engine-host）、换歌/主题/字号
      轮询 sync（700ms，歌 seed 同步背景几何场景）、退出 destroy。
      currentLineIndex 权威语义 findStageLyricIndexAtTime（Folia 宿主写
      playbackStore 的同语义）。tuning 取 DEFAULT_FUME_TUNING 原值
      （types.ts:446：落章打印=显示/几何背景=关/物体透明度 0.5/文字停留 1/
      smooth 相机/速度 1/辉光 1/heroScale 1——与原版面板默认一致）。
      调参面板在 DIY 控制台「模式调参」（visModeTuningOverrides 覆盖 + setTuning live）。引擎加载失败仅 console.warn（canvas 引擎无 WebGL
      依赖，正常环境不触发；无降级双路径——旧简化实现已被原版渲染核心取代删除）。
   ========================================================================= */

var FUME_STORE_KEY = 'orangesea-fume-v1';
var fumeMode = readBooleanPreference(FUME_STORE_KEY, false);
var fumeEngine = null;
var fumeBg = null;
var fumeBgLastBandsRef = null;
var fumeCoverKey = null;
var fumeEngineTimer = 0;
var fumeEngineLinesKey = '';
var fumeEngineThemeKey = '';
var fumeEngineFontScale = 0;
var fumeEngineSeed = '';

/* ---------- 数据形状：lyricsLines → Folia Line[] ---------- */

function fumeEngineToLines() {
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

/* ---------- MotionValue duck-type（引擎每帧轮询 get） ---------- */

var fumeEngineTimeMV = {
  get: function () {
    try {
      return getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0);
    } catch (e) { return 0; }
  }
};

var fumeEnginePowerMV = {
  get: function () {
    try { return (typeof motionSignalGet === 'function') ? (motionSignalGet('audioPower') || 0) : 0; } catch (e) { return 0; }
  }
};

function fumeEngineBand(idx) {
  var bands = (typeof motionSignalGet === 'function') ? motionSignalGet('bands') : null;
  if (bands && bands.length) {
    var v = Number(bands[idx]);   /* bands: [bass, vocal, treble] 0..255 */
    return isFinite(v) ? v : 0;
  }
  return 0;
}

function fumeEngineBandMV(idx) {
  return { get: function () { return fumeEngineBand(idx); } };
}

var fumeEngineBands = {
  bass: fumeEngineBandMV(0),
  lowMid: fumeEngineBandMV(1),
  mid: fumeEngineBandMV(1),
  vocal: fumeEngineBandMV(1),
  treble: fumeEngineBandMV(2)
};

/* ---------- 主题桥（夜侧 → Folia Theme 形状） ---------- */

/* 歌词字体档 → Folia fontStyle 类别（buildVisualizerTheme.ts:47 lyricsFontStyle
   语义：决定 resolveThemeFontStack 尾接的内置栈，fontStacks.ts BUILTIN_FONT_STACKS
   serif/mono/sans 三档）。衬线/书法档 → serif；mono → mono；其余（sans/hei/
   humanist/round/display/custom）→ sans。 */
function fumeLyricFontStyle() {
  var key = 'sans';
  try { key = (typeof fx !== 'undefined' && fx) ? String(fx.lyricFont || 'sans') : 'sans'; } catch (e) { }
  if (key === 'mono') return 'mono';
  if (/^(song|bold-song|stone-song|kai-song|serif-en|gothic|editorial|xiaowei|mashan|longcang|liucao)$/.test(key)) return 'serif';
  return 'sans';
}

/* 歌词字重（buildVisualizerTheme.ts:48 lyricsFontWeight ?? undefined 语义；
   本项目对应 05-lyrics-fonts-texture lyricFontWeightValue：fx.lyricWeight
   clamp 500..900 round50 / stone-song 900 / 书法与小尾 400）。原版消费点
   fumeTextMeasure.ts:178 resolveThemeFontWeight(theme, hero?780:640)——写死
   700 会抹掉 hero/body 粗细对比、顶掉字幕翻译行 500 回退，并污染布局缓存
   key 的字重位（fumeArticleLayout.ts:160）。缺省 undefined → 引擎原回退。 */
function fumeLyricFontWeight() {
  try {
    if (typeof lyricFontWeightValue === 'function') {
      var w = Number(lyricFontWeightValue());
      if (isFinite(w) && w > 0) return w;
    }
  } catch (e) { }
  return undefined;
}

function fumeEngineTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#0e0906', primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6' };
  var fontStack = '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  try {
    var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
    if (fontKey && typeof lyricFontStackForKey === 'function') fontStack = lyricFontStackForKey(fontKey);
  } catch (e) { }
  return {
    name: 'orangesea-fume',
    backgroundColor: t.backgroundColor,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor || t.primaryColor,
    accentColor: t.accentColor || t.primaryColor,
    fontStyle: fumeLyricFontStyle(),
    fontWeight: fumeLyricFontWeight(),
    fontFamilyStack: lyricFontStackFamilies(fontStack),
    animationIntensity: (typeof visAnimationIntensityCurrent === 'function') ? visAnimationIntensityCurrent() : 'normal',
    wordColors: (typeof visWordColorsList === 'function') ? visWordColorsList() : []
  };
}

/* ---------- tuning：DEFAULT_FUME_TUNING 原值（types.ts:443-452）
   + 调参覆盖合并（07-fx/11-vis-mode-data-plane，orangesea-vis-tuning-v1）。
   引擎端 fumeResolveTuning 逐字段空值合并，覆盖值只携带用户改过的字段；
   引擎暴露 setTuning，控制台改动 live 应用 ---------- */

var FUME_DEFAULT_TUNING_BRIDGE = {
  hidePrintSymbols: false,
  disableGeometricBackground: true,
  backgroundObjectOpacity: 0.5,
  textHoldRatio: 1,
  cameraTrackingMode: 'smooth',
  cameraSpeed: 1,
  glowIntensity: 1,
  heroScale: 1
};

function fumeResolvedTuning() {
  if (typeof visModeTuningOverrides !== 'function') return FUME_DEFAULT_TUNING_BRIDGE;
  return Object.assign({}, FUME_DEFAULT_TUNING_BRIDGE, visModeTuningOverrides('fume'));
}
if (typeof visModeTuningRegisterLiveApply === 'function') {
  visModeTuningRegisterLiveApply('fume', function (tuning) {
    if (fumeEngine && typeof fumeEngine.setTuning === 'function') {
      try { fumeEngine.setTuning(tuning); } catch (e) { }
    }
  });
}

/* ---------- 行索引权威语义（findStageLyricIndexAtTime，Folia 宿主同语义） ---------- */

function fumeEngineFindLineIndex(t) {
  if (typeof findStageLyricIndexAtTime === 'function') {
    try { return findStageLyricIndexAtTime(t); } catch (e) { }
  }
  var ls = fumeEngineToLines();
  for (var i = ls.length - 1; i >= 0; i--) {
    if (t >= ls[i].startTime) return i;
  }
  return -1;
}

/* ---------- 模式背景层（原版 Shell 默认背景 Latent 的宿主化） ----------
   原版链路：VisualizerFume.tsx:298-312 挂 VisualizerShell（renderBackground
   缺省 true，Shell:185-197）→ VisualizerBackgroundRenderer（mode 缺省
   'latent'，visualizerModes.ts:42）→ 封面取色 MeshGradient + Dithering，
   audioPower/bands 驱动。fume tuning 的 disableGeometricBackground（types.ts
   默认 true）只关 common 几何层，不禁 Latent；fume canvas 自带的几何线稿
   （FumeBackground.ts）是第二层，已在引擎核心跑通。真机全暗的根因是缺这层
   Latent——照 20b-claddagh-engine-bridge 先例复用模式无关实现
   TiltLatentBackground（tilt 引擎产物注出，index.html 中 tilt-engine.js
   先于本桥加载），信号桥/封面/暂停照 20b-tilt-engine-bridge 范式。 */

function fumeLatentAudioPower() {
  try {
    return ((typeof motionSignalGet === 'function') ? (motionSignalGet('audioPower') || 0) : 0) * 255;
  } catch (e) { return 0; }
}

/* 覆盖层保温期 bands 引用停更 → 从保活 frequencyData 自算回退
   （bin 划分照抄 92-background-registry.js visualizerBgBandsFallback） */
function fumeLatentBandsFallback() {
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

function fumeLatentPaused() {
  try { return !!(typeof audio !== 'undefined' && audio && audio.paused); } catch (e) { return false; }
}

function fumeLatentBands() {
  var raw = null;
  try { raw = (typeof motionSignalGet === 'function') ? motionSignalGet('bands') : null; } catch (e) { }
  var paused = fumeLatentPaused();
  if (raw) {
    if (raw === fumeBgLastBandsRef && !paused) {
      raw = null;   /* 引用未更新且在播：保温期（或主循环音频闸门跳帧）→ 自算 */
    } else {
      fumeBgLastBandsRef = raw;
    }
  }
  if (!raw && !paused) {
    raw = fumeLatentBandsFallback();
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

function fumeLatentCoverUrl() {
  try { return (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null; } catch (e) { return null; }
}

function startFumeBg() {
  var bgHost = document.getElementById('fume-bg-layer');
  if (!bgHost || typeof TiltLatentBackground !== 'function') return;   /* 无引擎产物/无 WebGL2 → 保底暗底层（fume.css） */
  try {
    fumeBg = TiltLatentBackground({
      host: bgHost,
      theme: fumeEngineTheme(),
      audioPowerGet: fumeLatentAudioPower,
      bandsGet: fumeLatentBands,
      coverUrlGet: fumeLatentCoverUrl,
      pausedGet: fumeLatentPaused
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[FumeEngine] background create failed', e);
    fumeBg = null;
  }
  fumeBgLastBandsRef = null;
  fumeCoverKey = fumeLatentCoverUrl();
}

/* ---------- 生命周期 ---------- */

function fumeEngineStart() {
  if (typeof applyOverlayModeFontScale === 'function') {
    applyOverlayModeFontScale(document.getElementById('fume-overlay'));
  }
  var host = document.getElementById('fume-engine-host');
  if (!host || typeof FumeFumeEngine !== 'function') {
    if (typeof console !== 'undefined') console.warn('[FumeEngine] 引擎产物未加载（fume-engine.js）');
    return;
  }
  try {
    fumeEngineFontScale = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
    fumeEngineSeed = fumeEngineSongSeed();
    fumeEngine = FumeFumeEngine({
      host: host,
      lines: fumeEngineToLines(),
      currentTime: fumeEngineTimeMV,
      audioPower: fumeEnginePowerMV,
      audioBands: fumeEngineBands,
      theme: fumeEngineTheme(),
      tuning: fumeResolvedTuning(),
      seed: fumeEngineSeed,
      lyricsFontScale: fumeEngineFontScale,
      getLineIndex: function () { return fumeEngineFindLineIndex(fumeEngineTimeMV.get()); }
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[FumeEngine] runtime create failed', e);
    fumeEngine = null;
    return;
  }
  fumeEngineLinesKey = '';
  fumeEngineThemeKey = '';
  (function loop() {
    if (!fumeMode || !fumeEngine) return;
    fumeEngineSync();
    fumeEngineTimer = setTimeout(loop, 700);
  })();
}

/* 换歌 seed（歌名+歌手，背景几何场景与 Folia seed prop 同角色） */
function fumeEngineSongSeed() {
  try {
    var meta = (typeof currentTrack !== 'undefined' && currentTrack) ? currentTrack : null;
    var title = meta && (meta.title || meta.name) ? String(meta.title || meta.name) : '';
    var artist = meta && meta.artist ? String(meta.artist) : '';
    if (title || artist) return 'fume:' + title + ':' + artist;
  } catch (e) { }
  return 'fume';
}

/* 换歌 / 主题 / 字号变化 → 引擎热更新（行数据与主题 key 轮询，700ms） */
function fumeEngineSync() {
  var eng = fumeEngine;
  if (!eng) return;
  var ls = fumeEngineToLines();
  var linesKey = ls.length + '|' + (ls.length ? (ls[0].startTime + ':' + ls[ls.length - 1].startTime) : '');
  if (linesKey !== fumeEngineLinesKey) {
    fumeEngineLinesKey = linesKey;
    eng.setLines(ls);
  }
  var theme = fumeEngineTheme();
  var themeKey = JSON.stringify(theme);
  if (themeKey !== fumeEngineThemeKey) {
    fumeEngineThemeKey = themeKey;
    eng.setTheme(theme);
    if (fumeBg) { try { fumeBg.setTheme(theme); } catch (e) { } }
  }
  var fs = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
  if (fs !== fumeEngineFontScale) {
    fumeEngineFontScale = fs;
    eng.setFontScale(fs);
  }
  var seed = fumeEngineSongSeed();
  if (seed !== fumeEngineSeed) {
    fumeEngineSeed = seed;
    eng.setSeed(seed);
  }
  /* 背景层：封面变化重取色（LatentBackground.tsx:129-148 coverUrl
     useEffect 的轮询等价） */
  if (fumeBg) {
    var coverUrl = fumeLatentCoverUrl();
    if (coverUrl !== fumeCoverKey) {
      fumeCoverKey = coverUrl;
      try { fumeBg.setCoverUrl(); } catch (e) { }
    }
  }
}

function fumeEngineStop() {
  if (fumeEngineTimer) { clearTimeout(fumeEngineTimer); fumeEngineTimer = 0; }
  if (fumeEngine) {
    try { fumeEngine.destroy(); } catch (e) { }
    fumeEngine = null;
  }
  if (fumeBg) {
    try { fumeBg.destroy(); } catch (e) { }
    fumeBg = null;
  }
  fumeBgLastBandsRef = null;
  fumeCoverKey = null;
}

/* ---------- 切换入口（注册表 stateVar=fumeMode / applyFn=applyFumeMode） ---------- */

function applyFumeMode(on, opts) {
  opts = opts || {};
  fumeMode = !!on;
  /* 互斥：经视觉模式注册表退出其它覆盖层 */
  if (fumeMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('fume', { save: true });
  }
  document.body.classList.toggle('fume', fumeMode);
  var overlay = document.getElementById('fume-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', fumeMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(FUME_STORE_KEY, fumeMode);
  if (fumeMode) {
    startFumeBg();   /* 背景层先于歌词引擎：引擎缺失/失败时背景仍独立成立 */
    fumeEngineStart();
  } else {
    fumeEngineStop();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(fumeMode ? '烟纸已开启' : '已切回标准模式');
}

function toggleFumeMode() {
  applyFumeMode(!fumeMode, { save: true, toast: true });
}

/* ---------- 启动恢复（模块顶层加载时执行，DOM 已就绪） ---------- */

function initFumeEngineBridge() {
  applyFumeMode(fumeMode, { save: false });
}

scheduleUiWarmTask ? scheduleUiWarmTask(initFumeEngineBridge, 300) : setTimeout(initFumeEngineBridge, 300);
