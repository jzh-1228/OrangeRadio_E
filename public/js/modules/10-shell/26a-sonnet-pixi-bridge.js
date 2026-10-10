/* =========================================================================
   OrangeSea · 商籁 Pixi 引擎桥（原版运行时宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — adapted from folia-major: src/components/visualizer/sonnet/VisualizerSonnet.tsx
     的宿主职责（运行时创建/换歌/时间源/主题/音频信号桥接）。
   引擎本体在 10-shell-sonnet-engine/sonnet-engine.js（tsc 转译 + 无构建拼接）。

   桥的内容：
   1) 数据形状转换：本项目 lyricsLines（{text, t, duration, words:[{text,t,d}],
      translation, isChorus}）→ Folia Line（{fullText, startTime, endTime,
      words:[{text,startTime,endTime}], translation, isChorus}）
   2) MotionValue 适配：{get: () => value} 的 duck-type（引擎只调 .get()）
   3) 主题桥：夜侧主题 → Folia Theme 形状 + fontFamilyStack
   4) 生命周期：进入模式创建运行时（宿主 #sonnet-pixi-host）、切歌 swapSong、
      退出 destroy；失败（无 WebGL/加载异常）→ 返回 false 走 DOM 版降级。
   ========================================================================= */

var SONNET_PIXI_TUNING = {
  cameraIntensity: 1,
  typographyMotion: 1,
  mgDensity: 1,
  showOnlyText: false,
  showGuide: true,
  showBackgroundMg: true,
  showFixedGeo: true,
  showGiantDecorativeText: true,
  showBackgroundDecor: true,
  enableTransitions: true,
  outerFrameMode: 'full',
  textureResolution: 1.5,
  postProcessEnabled: false,
  postProcessGrain: 0.2,
  postProcessContrast: 0,
  postProcessRgbShift: 0,
  postProcessHalftone: 0,
  postProcessVignette: 0.85,
  postProcessLensDistortion: 0.3,
  postProcessLensDispersion: 0.6
};

var sonnetPixiRuntime = null;      /* SonnetPixiRuntime 实例（null = 未启用/降级） */
var sonnetPixiFailed = false;      /* 创建失败一次后不再尝试（本会话降级 DOM 版） */
var sonnetPixiLinesKey = '';
var sonnetPixiThemeKey = '';

/* ---------- 数据形状 ---------- */

function sonnetPixiToLines() {
  var src = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var out = [];
  for (var i = 0; i < src.length; i++) {
    var l = src[i];
    if (!l || l.fallback) continue;
    var words = [];
    var ws = (l.words && l.words.length) ? l.words : null;
    if (ws) {
      for (var w = 0; w < ws.length; w++) {
        words.push({
          text: String(ws[w].text || ''),
          startTime: Number(ws[w].t) || 0,
          endTime: (Number(ws[w].t) || 0) + (Number(ws[w].d) || 0)
        });
      }
    } else {
      var st = Number(l.t) || 0;
      words.push({ text: String(l.text || ''), startTime: st, endTime: st + (Number(l.duration) || 2) });
    }
    if (!words.length) continue;
    var fullText = '';
    for (var f = 0; f < words.length; f++) fullText += words[f].text;
    out.push({
      words: words,
      startTime: Number(l.t) || 0,
      endTime: (Number(l.t) || 0) + (Number(l.duration) || 2),
      fullText: fullText,
      translation: l.translation ? String(l.translation) : undefined,
      isChorus: !!l.isChorus
    });
  }
  return out;
}

/* ---------- MotionValue duck-type（引擎只调 .get()） ---------- */

function sonnetPixiMV(getter) {
  return { get: getter };
}

/* ---------- 主题桥（夜侧 → Folia Theme） ---------- */

function sonnetPixiTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#0c0907', primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6' };
  var fontStack = '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  try {
    var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
    if (fontKey && typeof lyricFontStackForKey === 'function') fontStack = lyricFontStackForKey(fontKey);
  } catch (e) { }
  return {
    backgroundColor: t.backgroundColor,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor || t.primaryColor,
    accentColor: t.accentColor,
    fontStyle: 'sans',
    fontWeight: 700,
    fontFamilyStack: fontStack,
    lyricsIcons: []
  };
}

/* ---------- 生命周期 ---------- */

function sonnetPixiSongKey() {
  try {
    if (typeof lyricCurrentCoverPaletteKey === 'function') return String(lyricCurrentCoverPaletteKey() || currentIdx || 0);
  } catch (e) { }
  return String((typeof currentIdx !== 'undefined' ? currentIdx : 0) || 0);
}

function sonnetPixiProgram(lines, seed) {
  if (typeof compileSonnetProgram !== 'function') return null;
  try { return compileSonnetProgram(lines, seed); } catch (e) { return null; }
}

function sonnetPixiHost() {
  var host = document.getElementById('sonnet-pixi-host');
  if (!host) return null;
  /* Pixi 画布吃满宿主；宿主常驻 overlay 内（display:none 时不创建） */
  return host;
}

async function sonnetPixiStart() {
  if (sonnetPixiRuntime || sonnetPixiFailed) return !!sonnetPixiRuntime;
  if (typeof SonnetPixiRuntime === 'undefined') { sonnetPixiFailed = true; return false; }
  var host = sonnetPixiHost();
  if (!host) { sonnetPixiFailed = true; return false; }
  var lines = sonnetPixiToLines();
  var seed = sonnetPixiSongKey();
  var program = sonnetPixiProgram(lines, seed);
  if (!program) { sonnetPixiFailed = true; return false; }
  try {
    sonnetPixiRuntime = await SonnetPixiRuntime.create({
      host: host,
      songSeed: seed,
      program: program,
      theme: sonnetPixiTheme(),
      tuning: SONNET_PIXI_TUNING,
      currentTime: sonnetPixiMV(function () {
        try { return getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0); }
        catch (e) { return 0; }
      }),
      audioPower: sonnetPixiMV(function () {
        try { return (typeof motionSignalGet === 'function') ? (motionSignalGet('audioPower') || 0) : 0; } catch (e) { return 0; }
      }),
      audioBands: {
        bass: sonnetPixiMV(function () { try { return sonnetPixiBand(0); } catch (e) { return 0; } }),
        lowMid: sonnetPixiMV(function () { try { return sonnetPixiBand(1); } catch (e) { return 0; } }),
        mid: sonnetPixiMV(function () { try { return sonnetPixiBand(1); } catch (e) { return 0; } }),
        vocal: sonnetPixiMV(function () { try { return sonnetPixiBand(1); } catch (e) { return 0; } }),
        treble: sonnetPixiMV(function () { try { return sonnetPixiBand(2); } catch (e) { return 0; } })
      },
      lyricsFontScale: (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1,
      staticMode: false,
      paused: false,
      songTitle: '',
      songArtist: '',
      songAlbum: '',
      modulation: null
    });
    sonnetPixiLinesKey = lines.length + '|' + seed;
    sonnetPixiThemeKey = JSON.stringify(sonnetPixiTheme());
    return true;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[SonnetPixi] runtime create failed → DOM fallback', e);
    sonnetPixiRuntime = null;
    sonnetPixiFailed = true;
    return false;
  }
}

function sonnetPixiBand(idx) {
  var bands = (typeof motionSignalGet === 'function') ? motionSignalGet('bands') : null;
  if (bands && bands.length) {
    var v = Number(bands[idx]);   /* bands: [bass, vocal, treble] 0..255 */
    return isFinite(v) ? v / 255 : 0;
  }
  return 0;
}

/* 换歌 / 主题变 / 字号变：swapSong（运行时热切换，原版语义） */
function sonnetPixiSync() {
  var rt = sonnetPixiRuntime;
  if (!rt) return;
  var lines = sonnetPixiToLines();
  var seed = sonnetPixiSongKey();
  var key = lines.length + '|' + seed;
  var theme = sonnetPixiTheme();
  var themeKey = JSON.stringify(theme);
  if (key !== sonnetPixiLinesKey) {
    var program = sonnetPixiProgram(lines, seed);
    if (program) {
      sonnetPixiLinesKey = key;
      try { rt.swapSong({ seed: seed, program: program, theme: theme }, undefined); } catch (e) { }
    }
  } else if (themeKey !== sonnetPixiThemeKey) {
    sonnetPixiThemeKey = themeKey;
    try { rt.swapSong({ seed: seed, program: sonnetPixiProgram(lines, seed), theme: theme }, undefined); } catch (e) { }
  }
}

function sonnetPixiSetPaused(paused) {
  if (sonnetPixiRuntime && typeof sonnetPixiRuntime.setPaused === 'function') {
    try { sonnetPixiRuntime.setPaused(!!paused); } catch (e) { }
  }
}

function sonnetPixiStop() {
  if (sonnetPixiRuntime) {
    try { sonnetPixiRuntime.destroy(); } catch (e) { }
    sonnetPixiRuntime = null;
  }
  sonnetPixiLinesKey = '';
  sonnetPixiThemeKey = '';
  /* failed 不复位：会话内降级一次即稳定（避免反复撞 WebGL 失败） */
}
