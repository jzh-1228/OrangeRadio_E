/* =========================================================================
   OrangeSea · 钟摆引擎桥（原版渲染核心宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — adapted from folia-major: src/components/visualizer/pendolo/VisualizerPendolo.tsx
     的宿主职责（数据形状/时间源/频段/主题/字号/行索引/seek/生命周期桥接）。
   引擎本体在 10-shell-pendolo-engine/pendolo-engine.js（tsc 转译闭包
   colorMix/fontStacks/wordColoring/graphemeTiming/alternateText/
   subtitleTrackStyle/renderHints/monetLyricsModel + pendolo 纯逻辑六件
   + mini-motion + 渲染核心手工落地），由 index.html 静态 <script> 先行加载
   （pretext 全局 bundle 已在其前——buildPendoloTextLayout/扫光量宽同源消费）。

   桥的内容（DOM/canvas 类模式样板接线，与 20b-claddagh-engine-bridge 同范式）：
   1) 数据形状转换：本项目 lyricsLines（{text, t, duration, words:[{text,t,d}],
      translation, isChorus}）→ Folia Line（{fullText, startTime, endTime,
      words:[{text,startTime,endTime}], translation, isChorus, renderHints}）；
      LRC 行（无 words）→ 单词覆盖整行（引擎 buildLineGraphemeTimeline 均分
      逐字扫光）。renderHints 每行由引擎注出的 CM_buildLineRenderHints 现算
      （resolvePendoloFallbackAnchorIndex 读 renderEndTime 判定「唱完最后一行」
      锚点，pendoloTimeline.ts:21-27）。
   2) MotionValue 适配：{get, subscribe, emit} duck-type。时间源
      getAdjustedLyricPlaybackTime(audio.currentTime)（含歌词偏移；覆盖层激活
      时主循环保温门控提前 return，motionSignalSet('currentTime') 不再刷新，
      与 20b-classic/claddagh 桥同范式）。
   3) audioBands MV：{bass} 自 frequencyData 自算（bin 1-8 低频，对齐
      11-main-loop.js 频段口径）——覆盖层激活期间 bands 信号不更新，桥自算与
      20b-claddagh 桥同形态；暂停时 0。引擎按 0..1 消费（>1 按 0..255 归一，
      PendoloClockworkCanvas.tsx:338-344 原逻辑保留）。
   4) 主题桥：夜侧主题 → Folia Theme 形状 + fontFamilyStack 数组 +
      animationIntensity 随强度档 fx.visAnimationIntensity（引擎三档分支，
      normal 档常量 chorusHaloOpacity 0.34 / chorusHaloScale 1.026）+
      wordColors 随主题词色表 orangesea-vis-word-colors-v1（空表 →
      resolveTokenColorMap 全 null → colorRuns 回退 accentMix 混合填充色
      ——算法本体随闭包落地并被测试覆盖）。
   5) tuning 取 DEFAULT_PENDOLO_TUNING 原值（types.ts:515-527：轮心 x0/y50%、
      轮盘半径 42%、弧度 100°、擒纵咬合 2.0x、聚焦缩放 1.25x、齿轮装饰
      subtle、中央渐变开、表盘封面关、行辉光关——与原版面板默认一致，见
      .tmp-folia-modes/pendolo-panel.png）。调参面板在 DIY 控制台「模式调参」
      （visModeTuningOverrides 覆盖 + setTuning live）。
   6) 权威行索引：getCurrentLineIndex → findStageLyricIndexAtTime(t)（应用
      歌词管线同源；Folia 宿主 playbackStore.currentLineIndex 的等价供给）。
   7) seek：onLyricLineSeek(lineIndex, startTime) → audio.currentTime =
      startTime − getActiveLyricTimingOffsetSeconds()（回退歌词校准偏移，
      与旧实现/08-graffiti 同口径）；行点击由引擎 rail 项透传。
   8) 生命周期：进入模式创建引擎（宿主 #pendolo-engine-host）、换歌（行数据
      + seed）/主题/字号/暂停轮询 sync（700ms）、退出 destroy。引擎加载失败
      仅 console.warn（DOM/canvas 引擎无 WebGL 依赖，正常环境不触发；无降级
      双路径——旧简化实现 20-pendolo.js 已被原版渲染核心取代删除）。
   9) 主题图标：Theme.lyricsIcons 宿主无等价物（themeOverlayDarkTheme 仅五色，
      无主题图标表——sonnet/tempera/lumiere 三桥同传 []）。原版
      resolveLucideIcon(theme.lyricsIcons?.[0]) ?? Star
      （VisualizerPendolo.tsx:421-424）在空表下恒走 ?? Star 兜底 = 引擎内联
      lucide Star SVG（lucide ISC），宿主行为与原版空 lyricsIcons 完全一致，
      如实标注不伪造图标表。
   10) 模式背景层（VisualizerShell 默认背景 Latent 的宿主化，20b 桥扮演
      VisualizerShell 职责，20b-tilt/classic 桥同范式）：
      - Folia：VisualizerShell.tsx:185-197 renderBackground →
        VisualizerBackgroundRenderer（mode 缺省 'latent'，
        types/visualizerModes.ts:42 DEFAULT_VISUALIZER_BACKGROUND_MODE）→
        LatentBackground（封面取色 MeshGradient + Dithering 双 shader +
        音频驱动；落点 z 序在歌词 children 之下）；
      - 本地：tilt 引擎产物注出 TiltLatentBackground（manual/
        tilt-background-core.js，算法/常量与 LatentBackground.tsx:27-326
        同构，模式无关），挂 #pendolo-bg-layer（pendolo.css z 序：
        #pendolo-bg-layer(1) → #pendolo-engine-host(2)），WebGL2 不可用
        返回 null → 保底暖夜基底（#pendolo-overlay 底色）；
      - 信号（usePlaybackVisualizerBridge.ts:93-131 逐式同构，0..255 语义，
        全局 tiltBandsCompute/tiltBandsBreath 由 tilt-engine.js 注出，
        index.html 中先于本桥加载）：可闻时（!paused && !ended && analyser
        存在）直接从主循环保温采集的 frequencyData 按 21.5Hz/bin 分箱求
        均值 + 每带幂次整形：bass 20-150Hz(×1.8) / lowMid 150-400Hz(×2) /
        mid 400-1200Hz(×2) / vocal 1000-3500Hz(×1.5) / treble
        3500-12000Hz(×2)；audioPower = process((bass+lowMid)/2, 3)。
        不可闻 → 呼吸值 (sin(t)+1)*20（:121-131）；
      - 封面：getControlCoverUrl()（95-background-runtime 同源）→ 引擎内
        50×50 加权中位切取色（6 色）；sync 轮询封面变化 → setCoverUrl
        重取色（LatentBackground.tsx:129-148 coverUrl useEffect 轮询等价）；
      - 暂停：audio.paused → 驱动循环目标归零 + 速度 base*0.12
        （LatentBackground.tsx:28 PAUSED_SPEED_SCALE）。
   ========================================================================= */

var PENDOLO_STORE_KEY = 'orangesea-pendolo-v1';
var pendoloMode = readBooleanPreference(PENDOLO_STORE_KEY, false);
var pendoloEngine = null;
var pendoloBg = null;
var pendoloCoverKey = null;
var pendoloTimer = 0;
var pendoloLinesKey = '';
var pendoloThemeKey = '';
var pendoloFontScale = 0;
var pendoloPausedKey = null;
var pendoloSeedKey = null;

/* ---------- tuning：DEFAULT_PENDOLO_TUNING 原值（types.ts:515-527） ---------- */

var PENDOLO_DEFAULT_TUNING_BRIDGE = {
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

/* 调参覆盖合并（07-fx/11-vis-mode-data-plane，orangesea-vis-tuning-v1）：
   引擎端 pendoloResolveTuning 逐字段空值合并，覆盖值只携带用户改过的字段；
   引擎暴露 setTuning → 控制台改动 live 应用 */
function pendoloResolvedTuning() {
  if (typeof visModeTuningOverrides !== 'function') return PENDOLO_DEFAULT_TUNING_BRIDGE;
  return Object.assign({}, PENDOLO_DEFAULT_TUNING_BRIDGE, visModeTuningOverrides('pendolo'));
}
if (typeof visModeTuningRegisterLiveApply === 'function') {
  visModeTuningRegisterLiveApply('pendolo', function (tuning) {
    if (pendoloEngine && typeof pendoloEngine.setTuning === 'function') {
      try { pendoloEngine.setTuning(tuning); } catch (e) { }
    }
  });
}

/* ---------- 数据形状：lyricsLines → Folia Line[]（含 renderHints） ---------- */

function pendoloToLines() {
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
    /* renderHints（Folia 宿主在构建 Line 时携带；resolvePendoloFallbackAnchorIndex
       的「超过最后行渲染尾」分支依赖 renderEndTime） */
    if (hints) {
      try { line.renderHints = hints(line); } catch (e) { }
    }
    out.push(line);
  }
  return out;
}

/* ---------- MotionValue duck-type：时间源（引擎每帧轮询 get） ---------- */

var pendoloTimeMV = {
  subs: [],
  get: function () {
    try {
      return getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0);
    } catch (e) { return 0; }
  },
  subscribe: function (fn) { this.subs.push(fn); },
  emit: function (v) { for (var i = 0; i < this.subs.length; i++) this.subs[i](v); }
};

/* ---------- audioBands MV：frequencyData 自算 {bass} ----------
   频段对齐 11-main-loop.js：低频 bin 1-8（kick 主体）。暂停或无分析器时 0
   （Folia playbackStore 暂停供 0 的宿主等价）。 */

function pendoloBinAvg(from, to) {
  var fd = (typeof frequencyData !== 'undefined') ? frequencyData : null;
  if (!fd || !fd.length) return 0;
  var sum = 0, n = 0;
  var hi = Math.min(to, fd.length - 1);
  for (var i = from; i <= hi; i++) { sum += fd[i]; n++; }
  return n ? (sum / n) / 255 : 0;
}

var pendoloBandsMV = {
  get: function () {
    var isPaused = (typeof audio !== 'undefined' && audio && audio.paused);
    if (isPaused) return { bass: 0 };
    return { bass: pendoloBinAvg(1, 8) };
  }
};

/* ---------- 权威行索引（Folia currentLineIndex props 的宿主供给） ---------- */

function pendoloCurrentLineIndexAt(t) {
  try {
    if (typeof findStageLyricIndexAtTime === 'function') return findStageLyricIndexAtTime(t);
  } catch (e) { }
  return -1;
}

/* ---------- seek（Folia onLyricLineSeek 的宿主落地：回退歌词校准偏移） ---------- */

function pendoloSeekToLine(lineIndex, startTime) {
  if (typeof audio === 'undefined' || !audio) return;
  var offset = (typeof getActiveLyricTimingOffsetSeconds === 'function') ? getActiveLyricTimingOffsetSeconds() : 0;
  try {
    audio.currentTime = Math.max(0, (Number(startTime) || 0) - offset);
  } catch (e) { }
}

/* ---------- 主题桥（夜侧 → Folia Theme 形状） ---------- */

function pendoloTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#0e0906', primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6' };
  var fontStack = '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  try {
    var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
    if (fontKey && typeof lyricFontStackForKey === 'function') fontStack = lyricFontStackForKey(fontKey);
  } catch (e) { }
  return {
    name: 'orangesea-pendolo',
    backgroundColor: t.backgroundColor,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor || t.primaryColor,
    accentColor: t.accentColor || t.primaryColor,
    fontStyle: 'sans',
    /* 字重随用户歌词字重设置（原版 buildVisualizerTheme.ts:43 `lyricsFontWeight ?? undefined`
       的宿主等价——本宿主 fx.lyricWeight 恒有值，故恒下发；引擎布局 stamp 含
       resolveThemeFontWeight(theme,400)（pendolo-engine-core 布局 stamp），字重变化触发热更重建。
       lyricFontWeightValue 内含书法体强制 400 / 石腕体 900 特例（05-lyrics-fonts-texture.js:136） */
    fontWeight: (typeof lyricFontWeightValue === 'function') ? lyricFontWeightValue() : 700,
    fontFamilyStack: lyricFontStackFamilies(fontStack),
    animationIntensity: (typeof visAnimationIntensityCurrent === 'function') ? visAnimationIntensityCurrent() : 'normal',
    wordColors: (typeof visWordColorsList === 'function') ? visWordColorsList() : [],
    /* 主题图标：宿主无主题图标表（见文件头第 9 条）→ 空表，引擎恒走
       原版 `?? Star` 兜底路径（VisualizerPendolo.tsx:421-424 语义） */
    lyricsIcons: []
  };
}

/* ---------- 模式背景层（Latent 宿主化，见文件头第 10 条） ---------- */

/* 可闻判定（usePlaybackVisualizerBridge.ts:81-87）：!paused && !ended && analyser */
function pendoloLatentAudible() {
  try {
    return !!(typeof audio !== 'undefined' && audio && !audio.paused && !audio.ended &&
      typeof analyser !== 'undefined' && analyser);
  } catch (e) { return false; }
}

/* 呼吸值（:122-123）：(sin(Date.now()/2000)+1)*20，0..40 */
function pendoloLatentBreathValue() {
  if (typeof tiltBandsBreath === 'function') return tiltBandsBreath(Date.now());
  return (Math.sin(Date.now() / 2000) + 1) * 20;
}

/* audioPower（:115）：process((bass+lowMid)/2, 3)，吃整形前原始能量 */
function pendoloLatentAudioPower() {
  if (!pendoloLatentAudible()) return pendoloLatentBreathValue();
  if (typeof tiltBandsCompute !== 'function') return pendoloLatentBreathValue();
  return tiltBandsCompute((typeof frequencyData !== 'undefined' && frequencyData) ? frequencyData : null).audioPower;
}

/* 五频带（:116-120）：0..255 语义 */
function pendoloLatentBands() {
  if (!pendoloLatentAudible() || typeof tiltBandsCompute !== 'function') {
    var breath = pendoloLatentBreathValue();
    return { bass: breath, lowMid: breath, mid: breath, vocal: breath, treble: breath };
  }
  var b = tiltBandsCompute((typeof frequencyData !== 'undefined' && frequencyData) ? frequencyData : null);
  return { bass: b.bass, lowMid: b.lowMid, mid: b.mid, vocal: b.vocal, treble: b.treble };
}

function pendoloLatentCoverUrl() {
  try { return (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null; } catch (e) { return null; }
}

function pendoloLatentPaused() {
  try { return !!(typeof audio !== 'undefined' && audio && audio.paused); } catch (e) { return false; }
}

function startPendoloBg() {
  var bgHost = document.getElementById('pendolo-bg-layer');
  if (!bgHost || typeof TiltLatentBackground !== 'function') return;   /* 无 tilt 产物/无 WebGL2 → 保底暖夜基底 */
  try {
    pendoloBg = TiltLatentBackground({
      host: bgHost,
      theme: pendoloTheme(),
      audioPowerGet: pendoloLatentAudioPower,
      bandsGet: pendoloLatentBands,
      coverUrlGet: pendoloLatentCoverUrl,
      pausedGet: pendoloLatentPaused
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[PendoloEngine] background create failed', e);
    pendoloBg = null;
  }
  pendoloCoverKey = pendoloLatentCoverUrl();
}

/* ---------- 生命周期 ---------- */

function startPendolo() {
  if (typeof applyOverlayModeFontScale === 'function') {
    applyOverlayModeFontScale(document.getElementById('pendolo-overlay'));
  }
  startPendoloBg();   /* 背景层先于歌词引擎：引擎缺失/失败时背景仍独立成立（tilt/classic 桥同序） */
  var host = document.getElementById('pendolo-engine-host');
  if (!host || typeof PendoloPendoloEngine !== 'function') {
    if (typeof console !== 'undefined') console.warn('[PendoloEngine] 引擎产物未加载（pendolo-engine.js）');
    return;
  }
  try {
    pendoloFontScale = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
    pendoloEngine = PendoloPendoloEngine({
      host: host,
      lines: pendoloToLines(),
      currentTime: pendoloTimeMV,
      audioBands: pendoloBandsMV,
      theme: pendoloTheme(),
      tuning: pendoloResolvedTuning(),
      lyricsFontScale: pendoloFontScale,
      seed: (typeof audio !== 'undefined' && audio && audio.src) ? String(audio.src) : '',
      paused: (typeof audio !== 'undefined' && audio) ? !!audio.paused : false,
      getCurrentLineIndex: pendoloCurrentLineIndexAt,
      onLyricLineSeek: pendoloSeekToLine
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[PendoloEngine] runtime create failed', e);
    pendoloEngine = null;
    return;
  }
  pendoloLinesKey = '';
  pendoloThemeKey = '';
  pendoloPausedKey = null;
  pendoloSeedKey = null;
  (function loop() {
    if (!pendoloMode || !pendoloEngine) return;
    pendoloSync();
    pendoloTimer = setTimeout(loop, 700);
  })();
}

/* 换歌 / 主题 / 字号 / 暂停 / seed 变化 → 引擎热更新（轮询，700ms） */
function pendoloSync() {
  var eng = pendoloEngine;
  if (!eng) return;
  var ls = pendoloToLines();
  var linesKey = ls.length + '|' + (ls.length ? (ls[0].startTime + ':' + ls[ls.length - 1].startTime) : '');
  if (linesKey !== pendoloLinesKey) {
    pendoloLinesKey = linesKey;
    eng.setLines(ls);
  }
  var theme = pendoloTheme();
  var themeKey = JSON.stringify(theme);
  if (themeKey !== pendoloThemeKey) {
    pendoloThemeKey = themeKey;
    eng.setTheme(theme);
    if (pendoloBg) { try { pendoloBg.setTheme(theme); } catch (e) { } }
  }
  var fs = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
  if (fs !== pendoloFontScale) {
    pendoloFontScale = fs;
    eng.setFontScale(fs);
  }
  var pk = (typeof audio !== 'undefined' && audio) ? !!audio.paused : false;
  if (pk !== pendoloPausedKey) {
    pendoloPausedKey = pk;
    eng.setPaused(pk);
  }
  var sk = (typeof audio !== 'undefined' && audio && audio.src) ? String(audio.src) : '';
  if (sk !== pendoloSeedKey) {
    pendoloSeedKey = sk;
    eng.setSeed(sk);   /* 歌曲作用域 seed：无词机械演示状态随换歌复位（entry.tsx:18-19 注释语义） */
  }
  /* 背景层：封面变化重取色（LatentBackground.tsx:129-148 coverUrl useEffect 的轮询等价） */
  if (pendoloBg) {
    var coverUrl = pendoloLatentCoverUrl();
    if (coverUrl !== pendoloCoverKey) {
      pendoloCoverKey = coverUrl;
      try { pendoloBg.setCoverUrl(); } catch (e) { }
    }
  }
}

function stopPendolo() {
  if (pendoloTimer) { clearTimeout(pendoloTimer); pendoloTimer = 0; }
  if (pendoloEngine) {
    try { pendoloEngine.destroy(); } catch (e) { }
    pendoloEngine = null;
  }
  if (pendoloBg) {
    try { pendoloBg.destroy(); } catch (e) { }
    pendoloBg = null;
  }
  pendoloCoverKey = null;
}

/* ---------- 切换入口（注册表 stateVar=pendoloMode / applyFn=applyPendoloMode） ---------- */

function applyPendoloMode(on, opts) {
  opts = opts || {};
  pendoloMode = !!on;
  /* 覆盖层互斥：经视觉模式注册表退出其它模式 */
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

/* ---------- 启动恢复（模块顶层加载时执行，DOM 已就绪） ---------- */

function initPendoloBridge() {
  applyPendoloMode(pendoloMode, { save: false });
}

scheduleUiWarmTask ? scheduleUiWarmTask(initPendoloBridge, 300) : setTimeout(initPendoloBridge, 300);
