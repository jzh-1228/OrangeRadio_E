/* =========================================================================
   OrangeSea · 绘光 Pixi 引擎桥（原版运行时宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   引擎本体：10-shell-sonnet-engine/lumiere-engine.js（port-mode.py 产物）。
   ========================================================================= */

var LUMIERE_PIXI_TUNING = {
  lightIntensity: 1,
  audioResponse: 1,
  fogDensity: 1,
  darkField: 0.75,
  moteAmount: 1,
  bloom: 1,
  textBloom: 1,
  unlitOpacity: 0.22,
  windowNeighbors: 2,
  decay: 1,
  echo: 1,
  fogOctaves: 5,
  lineArt: true,
  frontBokeh: true,
  trails: true,
  hideTrails: false,
  seamlessTransitions: true,
  overlayFrame: true,
  textOnly: false,
  keywordColors: true,
  themeIcons: true,
  themeColorMix: 0.3,
  renderQuality: 'full'
};

var lumierePixiRuntime = null;
var lumierePixiFailed = false;

function lumierePixiToLines() {
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

function lumierePixiMV(getter) { return { get: getter }; }

function lumierePixiTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#0d0b10', primaryColor: '#f4efe4', accentColor: '#ffc998', secondaryColor: '#8fb3d9' };
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
    wordColors: [],
    lyricsIcons: [],
    fontStyle: 'sans', fontWeight: 700,
    fontFamilyStack: fontStack
  };
}

function lumierePixiSongKey() {
  try {
    if (typeof lyricCurrentCoverPaletteKey === 'function') return String(lyricCurrentCoverPaletteKey() || currentIdx || 0);
  } catch (e) { }
  return String((typeof currentIdx !== 'undefined' ? currentIdx : 0) || 0);
}

function lumierePixiBand(idx) {
  try {
    var bands = (typeof motionSignalGet === 'function') ? motionSignalGet('bands') : null;
    if (bands && bands.length) {
      var v = Number(bands[idx]);
      return isFinite(v) ? v / 255 : 0;
    }
  } catch (e) { }
  return 0;
}

async function lumierePixiStart() {
  if (lumierePixiRuntime || lumierePixiFailed) return !!lumierePixiRuntime;
  if (typeof LumierePixiRuntime === 'undefined' || typeof compileLumiereProgram === 'undefined') { lumierePixiFailed = true; return false; }
  var host = document.getElementById('lumiere-pixi-host');
  if (!host) { lumierePixiFailed = true; return false; }
  var lines = lumierePixiToLines();
  var seed = lumierePixiSongKey();
  var duration = 0;
  try { if (typeof audio !== 'undefined' && audio && isFinite(audio.duration)) duration = audio.duration || 0; } catch (e) { }
  var program = null;
  try { program = compileLumiereProgram(lines, seed, {}, { duration: duration }); } catch (e) { }
  if (!program) { lumierePixiFailed = true; return false; }
  try {
    lumierePixiRuntime = await LumierePixiRuntime.create({
      host: host,
      song: { seed: seed, program: program, theme: lumierePixiTheme() },
      tuning: LUMIERE_PIXI_TUNING,
      currentTime: lumierePixiMV(function () {
        try { return getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0); }
        catch (e) { return 0; }
      }),
      audioPower: lumierePixiMV(function () {
        try { return (typeof motionSignalGet === 'function') ? (motionSignalGet('audioPower') || 0) : 0; } catch (e) { return 0; }
      }),
      audioBands: {
        bass: lumierePixiMV(function () { return lumierePixiBand(0); }),
        lowMid: lumierePixiMV(function () { return lumierePixiBand(1); }),
        mid: lumierePixiMV(function () { return lumierePixiBand(1); }),
        vocal: lumierePixiMV(function () { return lumierePixiBand(1); }),
        treble: lumierePixiMV(function () { return lumierePixiBand(2); })
      },
      staticMode: false,
      showText: true,
      paused: false,
      metadata: { title: '', artist: '', album: '' }
    });
    return true;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[LumierePixi] create failed → DOM fallback', e, e && e.stack ? e.stack.split(String.fromCharCode(10)).slice(0, 10).join(' | ') : '');
    lumierePixiRuntime = null;
    lumierePixiFailed = true;
    return false;
  }
}

function lumierePixiSetPaused(paused) {
  if (lumierePixiRuntime && typeof lumierePixiRuntime.setPaused === 'function') {
    try { lumierePixiRuntime.setPaused(!!paused); } catch (e) { }
  }
}

function lumierePixiStop() {
  if (lumierePixiRuntime) {
    try { lumierePixiRuntime.destroy(); } catch (e) { }
    lumierePixiRuntime = null;
  }
}
