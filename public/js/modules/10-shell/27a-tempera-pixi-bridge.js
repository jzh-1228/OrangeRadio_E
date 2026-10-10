/* =========================================================================
   OrangeSea · 凝彩 Pixi 引擎桥（原版运行时宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   引擎本体：10-shell-sonnet-engine/tempera-engine.js（port-mode.py 产物）。
   与 26a-sonnet-pixi-bridge 同范式的宿主桥（数据/MotionValue/主题/生命周期）。
   ========================================================================= */

var TEMPERA_PIXI_TUNING = {
  cameraIntensity: 1,
  glyphMotion: 1,
  wholeLineLyrics: false,
  glyphSettleStretch: 0.5,
  colorMode: 'duo',
  showBlocks: true,
  showDecor: true,
  showCornerMarks: true,
  textInversion: true,
  layerImages: [],
  layerImageDepth: 'back',
  layerImageFrequency: 0.6,
  enableTransitions: true,
  textureResolution: 1.5,
  postProcessEnabled: true,
  postProcessTextureCompression: false,
  postProcessGrain: 0.2,
  postProcessContrast: 0,
  postProcessRgbShift: 0,
  postProcessVignette: 0.85,
  postProcessLensDistortion: 0.3
};

var temperaPixiRuntime = null;
var temperaPixiFailed = false;
var temperaPixiSongKeyCache = '';
var temperaPixiProgramCache = null;

/* 数据形状：lyricsLines → Folia Line（同 sonnet 桥） */
function temperaPixiToLines() {
  var src = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var out = [];
  for (var i = 0; i < src.length; i++) {
    var l = src[i];
    if (!l || l.fallback) continue;
    var words = [];
    var ws = (l.words && l.words.length) ? l.words : null;
    if (ws) {
      for (var w = 0; w < ws.length; w++) {
        words.push({ text: String(ws[w].text || ''), startTime: Number(ws[w].t) || 0, endTime: (Number(ws[w].t) || 0) + (Number(ws[w].d) || 0) });
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

function temperaPixiMV(getter) { return { get: getter }; }

function temperaPixiTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#101014', primaryColor: '#f2ede2', accentColor: '#ff9c6e', secondaryColor: '#7a9e9e' };
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
    fontStyle: 'sans', fontWeight: 700,
    fontFamilyStack: fontStack,
    lyricsIcons: []
  };
}

function temperaPixiSongKey() {
  try {
    if (typeof lyricCurrentCoverPaletteKey === 'function') return String(lyricCurrentCoverPaletteKey() || currentIdx || 0);
  } catch (e) { }
  return String((typeof currentIdx !== 'undefined' ? currentIdx : 0) || 0);
}

async function temperaPixiStart() {
  if (temperaPixiRuntime || temperaPixiFailed) return !!temperaPixiRuntime;
  if (typeof TemperaPixiRuntime === 'undefined') { temperaPixiFailed = true; return false; }
  var host = document.getElementById('tempera-pixi-host');
  if (!host) { temperaPixiFailed = true; return false; }
  var lines = temperaPixiToLines();
  var seed = temperaPixiSongKey();
  var program = null;
  try {
    if (typeof compileTemperaProgram === 'function') program = compileTemperaProgram(lines, seed);
  } catch (e) { }
  if (!program) { temperaPixiFailed = true; return false; }
  try {
    temperaPixiRuntime = await TemperaPixiRuntime.create({
      host: host,
      songSeed: seed,
      program: program,
      theme: temperaPixiTheme(),
      tuning: TEMPERA_PIXI_TUNING,
      currentTime: temperaPixiMV(function () {
        try { return getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0); }
        catch (e) { return 0; }
      }),
      lyricsFontScale: (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1,
      staticMode: false,
      paused: false
    });
    temperaPixiSongKeyCache = seed;
    return true;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[TemperaPixi] create failed → DOM fallback', e, e && e.stack ? e.stack.split(String.fromCharCode(10)).slice(0, 10).join(' | ') : '');
    try { window.__temperaErr = e.message; } catch (e2) { }
    temperaPixiRuntime = null;
    temperaPixiFailed = true;
    return false;
  }
}

function temperaPixiSetPaused(paused) {
  if (temperaPixiRuntime && typeof temperaPixiRuntime.setPaused === 'function') {
    try { temperaPixiRuntime.setPaused(!!paused); } catch (e) { }
  }
}

function temperaPixiStop() {
  if (temperaPixiRuntime) {
    try { temperaPixiRuntime.destroy(); } catch (e) { }
    temperaPixiRuntime = null;
  }
}
