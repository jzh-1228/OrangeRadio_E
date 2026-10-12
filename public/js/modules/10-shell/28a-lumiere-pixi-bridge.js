/* =========================================================================
   OrangeSea · 绘光 Pixi 引擎桥（原版运行时宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — adapted from folia-major: src/components/visualizer/lumiere/VisualizerLumiere.tsx
     的宿主职责（运行时创建/换歌 swapSong/歌曲元数据 setSongMetadata/时间源/
     主题/音频信号桥接）。
   引擎本体：10-shell-sonnet-engine/lumiere-engine.js（port-mode.py 产物）。

   桥的内容：
   1) 数据形状转换：本项目 lyricsLines → Folia Line
   2) MotionValue 适配：{get: () => value} 的 duck-type（引擎只调 .get()）
   3) 主题桥：夜侧主题 → Folia Theme 形状 + fontFamilyStack
   4) 生命周期：进入模式创建运行时（宿主 #lumiere-pixi-host）、切歌
      lumierePixiSync → swapSong（原版热切换语义：新场景第一帧离屏建好，
      第二帧交叉渐变切过去，不重建 WebGL）、歌曲元数据 setSongMetadata
      （片尾卡 credits 用）、退出 destroy
   5) 失败策略：创建失败按指数退避重试（会话内上限），退避窗口内宿主走
      DOM 版；窗口过后由 DOM 版帧循环自愈重试，成功则切回引擎
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

/* 调参覆盖合并（07-fx/11-vis-mode-data-plane，orangesea-vis-tuning-v1）：
   引擎暴露 setTuning，控制台改动 live 应用 */
function lumiereResolvedTuning() {
  if (typeof visModeTuningOverrides !== 'function') return LUMIERE_PIXI_TUNING;
  return Object.assign({}, LUMIERE_PIXI_TUNING, visModeTuningOverrides('lumiere'));
}
if (typeof visModeTuningRegisterLiveApply === 'function') {
  visModeTuningRegisterLiveApply('lumiere', function (tuning) {
    if (lumierePixiRuntime && typeof lumierePixiRuntime.setTuning === 'function') {
      try { lumierePixiRuntime.setTuning(tuning); } catch (e) { }
    }
  });
}

var lumierePixiRuntime = null;
/* 失败重试状态：指数退避，会话内最多 LUMIERE_PIXI_FAIL_MAX 次；
   超限后本会话稳定走 DOM 版（避免反复撞持续性故障），未超限则退避窗口
   过后允许自愈重试（暂时性失败——如首帧 WebGL 上下文被占——可恢复） */
var LUMIERE_PIXI_FAIL_MAX = 4;
var LUMIERE_PIXI_FAIL_BACKOFF_MS = 6000;
var LUMIERE_PIXI_FAIL_BACKOFF_CAP_MS = 60000;
var lumierePixiFailCount = 0;
var lumierePixiLastFailAt = 0;
/* 热切换指纹：换歌（歌词形状|seed）/主题/元数据 变化时驱动 swapSong/setSongMetadata */
var lumierePixiLinesKey = '';
var lumierePixiThemeKey = '';
var lumierePixiMetaKey = '';

/* ---------- 数据形状（lyricsLines → Folia Line） ---------- */

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

/* ---------- 歌曲元数据（片尾卡 credits：原版 VisualizerLumiere metadataRef 宿主职责） ---------- */

function lumierePixiSongMeta() {
  var meta = { title: '', artist: '', album: '' };
  try {
    var song = (typeof playlist !== 'undefined' && playlist && typeof currentIdx !== 'undefined' && currentIdx >= 0)
      ? playlist[currentIdx] : null;
    if (song) {
      var t = String(song.name || song.title || '').trim();
      if (t) meta.title = t;
      var a = String(song.artist || '').trim();
      if (a) meta.artist = a;
      var al = String(song.album || '').trim();
      if (al) meta.album = al;
    }
  } catch (e) { }
  return meta;
}

function lumierePixiSongMetaKey() {
  var m = lumierePixiSongMeta();
  return m.title + '|' + m.artist + '|' + m.album;
}

/* ---------- 主题桥 ---------- */

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
    animationIntensity: (typeof visAnimationIntensityCurrent === 'function') ? visAnimationIntensityCurrent() : 'normal',
    wordColors: (typeof visWordColorsList === 'function') ? visWordColorsList() : [],
    lyricsIcons: [],
    fontStyle: 'sans', /* 字重随用户歌词字重设置（buildVisualizerTheme.ts:43 语义，lyricFontWeightValue
   含书法体 400/石腕体 900 特例） */
fontWeight: (typeof lyricFontWeightValue === 'function') ? lyricFontWeightValue() : 700,
    /* 字体族名数组（Theme.fontFamilyStack 原版语义 string[]）：裸字符串会被
       引擎 buildCustomFontFamilyStack 逐字符展开成 "I","n","t"... 垃圾栈 →
       永远回退内建 sans（字体跟随断链）；与 26a/27a 桥同款转换 */
    fontFamilyStack: lyricFontStackFamilies(fontStack)
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

/* ---------- 编译（换歌/主题变化共用；主题色混入编译常量的字段须重编译） ---------- */

function lumierePixiCompile(lines, seed) {
  if (typeof compileLumiereProgram !== 'function') return null;
  var duration = 0;
  try { if (typeof audio !== 'undefined' && audio && isFinite(audio.duration)) duration = audio.duration || 0; } catch (e) { }
  try { return compileLumiereProgram(lines, seed, {}, { duration: duration }); } catch (e) { return null; }
}

/* ---------- 失败退避 ---------- */

function lumierePixiRetryGate() {
  if (lumierePixiFailCount >= LUMIERE_PIXI_FAIL_MAX) return false;
  if (!lumierePixiLastFailAt) return true;
  var backoff = Math.min(LUMIERE_PIXI_FAIL_BACKOFF_MS * Math.pow(2, lumierePixiFailCount - 1), LUMIERE_PIXI_FAIL_BACKOFF_CAP_MS);
  return (Date.now() - lumierePixiLastFailAt) >= backoff;
}

function lumierePixiNoteFailure() {
  lumierePixiFailCount++;
  lumierePixiLastFailAt = Date.now();
}

/* ---------- 生命周期 ---------- */

async function lumierePixiStart() {
  if (lumierePixiRuntime) return true;
  /* 退避窗口内 / 会话内超限：不再撞引擎，宿主走 DOM 版（由调用方决定） */
  if (!lumierePixiRetryGate()) return false;
  if (typeof LumierePixiRuntime === 'undefined' || typeof compileLumiereProgram === 'undefined') { lumierePixiNoteFailure(); return false; }
  var host = document.getElementById('lumiere-pixi-host');
  if (!host) { lumierePixiNoteFailure(); return false; }
  var lines = lumierePixiToLines();
  var seed = lumierePixiSongKey();
  var program = lumierePixiCompile(lines, seed);
  if (!program) { lumierePixiNoteFailure(); return false; }
  try {
    var theme = lumierePixiTheme();
    lumierePixiRuntime = await LumierePixiRuntime.create({
      host: host,
      song: { seed: seed, program: program, theme: theme },
      tuning: lumiereResolvedTuning(),
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
      metadata: lumierePixiSongMeta()   /* 原版 metadataRef 宿主职责：歌名/歌手/专辑 → 片尾卡 */
    });
    /* 创建成功：失败计数清零；同步指纹落在本次的输入上（700ms 轮询的 sync 以此判变化） */
    lumierePixiFailCount = 0;
    lumierePixiLastFailAt = 0;
    lumierePixiLinesKey = lines.length + '|' + seed;
    lumierePixiThemeKey = JSON.stringify(theme);
    lumierePixiMetaKey = lumierePixiSongMetaKey();
    return true;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[LumierePixi] create failed → 指数退避后重试，期间走 DOM fallback', e, e && e.stack ? e.stack.split(String.fromCharCode(10)).slice(0, 10).join(' | ') : '');
    lumierePixiRuntime = null;
    lumierePixiNoteFailure();
    return false;
  }
}

/* ---------- 换歌 / 主题变 / 元数据变：swapSong + setSongMetadata（原版热切换语义） ----------
   原版 VisualizerLumiere.tsx:62-78 useVisualizerSongCommit + swapSong：切歌不重建
   WebGL，新歌当前段落场景第一帧离屏建好、第二帧交叉渐变切入（引擎 songSwap）；
   同 seed 的主题变化走 swapSong → commitSong 的 themeChanged → drawOverlay；
   元数据（歌名/歌手/专辑）变化走 setSongMetadata → credits.invalidate 重建片尾卡。 */
function lumierePixiSync() {
  var rt = lumierePixiRuntime;
  if (!rt) return;
  var lines = lumierePixiToLines();
  var seed = lumierePixiSongKey();
  var key = lines.length + '|' + seed;
  var metaKey = lumierePixiSongMetaKey();
  if (key !== lumierePixiLinesKey) {
    var program = lumierePixiCompile(lines, seed);
    if (program) {
      lumierePixiLinesKey = key;
      try { rt.swapSong({ seed: seed, program: program, theme: lumierePixiTheme() }, undefined); } catch (e) { }
      /* swapSong 只换 song（seed/program/theme）；元数据是运行时独立字段，
         换歌分支须一并推送，否则片尾卡停留旧歌信息且 metaKey 已被记新不再触发 */
      if (metaKey !== lumierePixiMetaKey && typeof rt.setSongMetadata === 'function') {
        lumierePixiMetaKey = metaKey;
        try { rt.setSongMetadata(lumierePixiSongMeta()); } catch (e) { }
      }
    }
    return;
  }
  var theme = lumierePixiTheme();
  var themeKey = JSON.stringify(theme);
  if (themeKey !== lumierePixiThemeKey) {
    lumierePixiThemeKey = themeKey;
    var p2 = lumierePixiCompile(lines, seed);
    if (p2) {
      try { rt.swapSong({ seed: seed, program: p2, theme: theme }, undefined); } catch (e) { }
    }
    return;   /* swapSong 内部 commitSong 会处理 metadata 之外的失效，下一轮再对 metaKey */
  }
  if (metaKey !== lumierePixiMetaKey) {
    lumierePixiMetaKey = metaKey;
    if (typeof rt.setSongMetadata === 'function') {
      try { rt.setSongMetadata(lumierePixiSongMeta()); } catch (e) { }
    }
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
  lumierePixiLinesKey = '';
  lumierePixiThemeKey = '';
  lumierePixiMetaKey = '';
  /* 失败计数保留：退避窗口过后允许自愈重试；超限则会话内稳定降级 DOM 版 */
}
