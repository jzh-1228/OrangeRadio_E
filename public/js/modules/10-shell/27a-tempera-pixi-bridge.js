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

/* 调参覆盖合并（07-fx/11-vis-mode-data-plane，orangesea-vis-tuning-v1）：
   引擎暴露 setTuning，控制台改动 live 应用 */
function temperaResolvedTuning() {
  if (typeof visModeTuningOverrides !== 'function') return TEMPERA_PIXI_TUNING;
  return Object.assign({}, TEMPERA_PIXI_TUNING, visModeTuningOverrides('tempera'));
}
if (typeof visModeTuningRegisterLiveApply === 'function') {
  visModeTuningRegisterLiveApply('tempera', function (tuning) {
    if (temperaPixiRuntime && typeof temperaPixiRuntime.setTuning === 'function') {
      try { temperaPixiRuntime.setTuning(tuning); } catch (e) { }
    }
  });
}

var temperaPixiRuntime = null;
var temperaPixiFailed = false;
var temperaPixiSongKeyCache = '';
var temperaPixiThemeKey = '';
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

/* CSS font-stack 字符串 → 字体族名数组（与 26a-sonnet-pixi-bridge 同款）。
   原版 Theme.fontFamilyStack 是 string[]（folia buildVisualizerTheme.ts:45 lyricsFontFallbackFamilies）；
   引擎 buildCustomFontFamilyStack 对它做逐项展开（tempera-engine.js buildCustomFontFamilyStack
   `...(theme.fontFamilyStack ?? [])`）——整串传入会被逐字符拆碎成 "I","n","t"... 垃圾字体栈
   → canvas font 解析失败 → 光栅化回退 12px，全部歌词大字缩成小点（2026-10-11 真机事故根因）。 */
function temperaPixiFontStackToArray(stack) {
  if (Array.isArray(stack)) return stack.slice();
  if (typeof stack !== 'string' || !stack) return [];
  var out = [];
  var cur = '';
  var quote = '';
  for (var i = 0; i < stack.length; i++) {
    var ch = stack.charAt(i);
    if (quote) { if (ch === quote) quote = ''; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === ',') { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out.filter(function (s) { return !!s; });
}

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
    fontStyle: 'sans',
    /* 字重随用户歌词字重设置（buildVisualizerTheme.ts:43 语义，lyricFontWeightValue
   含书法体 400/石腕体 900 特例） */
fontWeight: (typeof lyricFontWeightValue === 'function') ? lyricFontWeightValue() : 700,
    fontFamilyStack: temperaPixiFontStackToArray(fontStack),
    animationIntensity: (typeof visAnimationIntensityCurrent === 'function') ? visAnimationIntensityCurrent() : 'normal',
    wordColors: (typeof visWordColorsList === 'function') ? visWordColorsList() : [],
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
      tuning: temperaResolvedTuning(),
      currentTime: temperaPixiMV(function () {
        try { return getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0); }
        catch (e) { return 0; }
      }),
      lyricsFontScale: (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1,
      staticMode: false,
      paused: false
    });
    temperaPixiSongKeyCache = lines.length + '|' + seed;
    temperaPixiThemeKey = JSON.stringify(temperaPixiTheme());
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

/* 换歌 / 主题变：swapSong（运行时热切换，26a-sonnet-pixi-bridge 同范式）。
   字体跟随约束：fx.lyricFont 改动 → temperaPixiTheme().fontFamilyStack 变 →
   themeKey 变 → swapSong 携新主题；引擎 commitSongContext 换 theme +
   clearScenes，下一帧按新字体重建文字。700ms 由 27-tempera.js ploop 驱动。 */
function temperaPixiCompile(lines, seed) {
  try { return (typeof compileTemperaProgram === 'function') ? compileTemperaProgram(lines, seed) : null; } catch (e) { return null; }
}
function temperaPixiSync() {
  var rt = temperaPixiRuntime;
  if (!rt) return;
  var lines = temperaPixiToLines();
  var seed = temperaPixiSongKey();
  var key = lines.length + '|' + seed;
  var theme = temperaPixiTheme();
  var themeKey = JSON.stringify(theme);
  if (key !== temperaPixiSongKeyCache) {
    var program = temperaPixiCompile(lines, seed);
    if (program) {
      temperaPixiSongKeyCache = key;
      try { rt.swapSong({ seed: seed, program: program, theme: theme }, undefined); } catch (e) { }
    }
    return;
  }
  if (themeKey !== temperaPixiThemeKey) {
    temperaPixiThemeKey = themeKey;
    var p2 = temperaPixiCompile(lines, seed);
    if (p2) {
      try { rt.swapSong({ seed: seed, program: p2, theme: theme }, undefined); } catch (e) { }
    }
  }
}

function temperaPixiStop() {
  if (temperaPixiRuntime) {
    try { temperaPixiRuntime.destroy(); } catch (e) { }
    temperaPixiRuntime = null;
  }
  temperaPixiSongKeyCache = '';
  temperaPixiThemeKey = '';
}
