/* =========================================================================
   OrangeSea · 莫奈引擎桥（原版渲染核心宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — adapted from folia-major: src/components/visualizer/monet/VisualizerMonet.tsx
     的宿主职责（数据形状/时间源/主题/音频/元数据/生命周期桥接）。
   引擎本体在 10-shell-monet-engine/monet-engine.js（tsc 转译闭包
   monetBackgroundPipeline/monetLyricMotion/monetLyricsModel/monetPortraitCrossfade/
   monetBackgroundDrift + 共享纯逻辑 + 渲染核心手工落地），由 index.html 静态
   <script> 先行加载（pretext 全局测量在其前）。

   桥的内容（DOM 类模式样板接线）：
   1) 数据形状转换：本项目 lyricsLines（{text, t, duration, words:[{text,t,d}],
      translation, isChorus}）→ Folia Line（{fullText, startTime, endTime,
      words:[{text,startTime,endTime}], translation, isChorus}）；
      LRC 行（无 words）→ 单词覆盖整行。
   2) MotionValue 适配：{get, subscribe, emit} duck-type（引擎每帧轮询 get()
      派发 change——useMotionValueEvent 等价）。时间源
      getAdjustedLyricPlaybackTime(audio.currentTime)（含歌词偏移）。
      audioPower 0..1 → ×255（Folia 侧 0..255）；bands {kick,vocal,mid,treble}
      → Folia 五通道 {bass,lowMid,mid,vocal,treble} 0..255；spectrum 直通
      Uint8Array（AudioOverlay sampleRawSpectrumProfile 消费）。
   3) 主题桥：夜侧主题 → Folia Theme 形状 + fontFamilyStack 数组 +
      animationIntensity 随强度档 fx.visAnimationIntensity、wordColors 随主题词色
      表，着色回退 accent——算法本体已随闭包落地并被测试覆盖）。
   4) 元数据：songTitle/songArtist 取 #control-title-text/#control-artist
      （songAlbum 无独立源 → 引擎内回退 'Monet'，同 Folia :168 兜底语义）。
   5) 生命周期：进入模式创建引擎（宿主 #monet-engine-host）、换歌/主题/字号/
      封面轮询 sync（700ms）、退出 destroy。引擎加载失败仅 console.warn
      （DOM 引擎无 WebGL 依赖，正常环境不触发；无降级双路径——旧简化实现
      已被原版渲染核心取代删除）。
   ========================================================================= */

var MONET_STORE_KEY = 'orangesea-monet-v1';
var monetMode = readBooleanPreference(MONET_STORE_KEY, false);
var monetEngine = null;
var monetTimer = 0;
var monetLinesKey = '';
var monetThemeKey = '';
var monetFontScale = 0;
var monetCoverKey = '';
var monetMetaKey = '';

/* ---------- 数据形状：lyricsLines → Folia Line[] ---------- */

function monetToLines() {
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

var monetTimeMV = {
  subs: [],
  get: function () {
    try {
      return getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0);
    } catch (e) { return 0; }
  },
  subscribe: function (fn) { this.subs.push(fn); },
  emit: function (v) { for (var i = 0; i < this.subs.length; i++) this.subs[i](v); }
};

var monetPowerMV = {
  get: function () {
    try {
      var p = (typeof motionSignalGet === 'function') ? motionSignalGet('audioPower') : 0;
      /* Folia audioPower 0..255（AudioOverlay: audioPower.get()/255） */
      return Math.max(0, Math.min(255, (Number(p) || 0) * 255));
    } catch (e) { return 0; }
  },
  subscribe: function () { },
  emit: function () { }
};

function monetBandMV(channel, lowMix) {
  return {
    get: function () {
      try {
        var b = (typeof motionSignalGet === 'function') ? motionSignalGet('bands') : null;
        if (!b) return 0;
        /* MineRadio bands {kick,vocal,mid,treble,rms} 0..1 → Folia 五通道 0..255 */
        var v;
        if (channel === 'bass') v = Number(b.kick) || 0;
        else if (channel === 'treble') v = Number(b.treble) || 0;
        else if (channel === 'vocal') v = Number(b.vocal) || 0;
        else if (channel === 'mid') v = Number(b.vocal) || 0;
        else v = (Number(b.kick) || 0) * lowMix + (Number(b.vocal) || 0) * (1 - lowMix);
        return Math.max(0, Math.min(255, v * 255));
      } catch (e) { return 0; }
    },
    subscribe: function () { },
    emit: function () { }
  };
}

var monetSpectrumMV = {
  get: function () {
    try {
      var s = (typeof motionSignalGet === 'function') ? motionSignalGet('spectrum') : null;
      return (s instanceof Uint8Array) ? s : new Uint8Array(0);
    } catch (e) { return new Uint8Array(0); }
  },
  subscribe: function () { },
  emit: function () { }
};

var monetBands = {
  bass: monetBandMV('bass'),
  lowMid: monetBandMV('lowMid', 0.5),
  mid: monetBandMV('mid'),
  vocal: monetBandMV('vocal'),
  treble: monetBandMV('treble'),
  spectrum: monetSpectrumMV
};

/* ---------- 主题桥（夜侧 → Folia Theme 形状） ---------- */

function monetTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#0e0906', primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6' };
  var fontStack = '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  try {
    var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
    if (fontKey && typeof lyricFontStackForKey === 'function') fontStack = lyricFontStackForKey(fontKey);
  } catch (e) { }
  return {
    name: 'orangesea-monet',
    description: (t && t.description) ? String(t.description) : '',
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

/* ---------- tuning：DEFAULT_MONET_TUNING 原值（types.ts DEFAULT_MONET_TUNING）
   + 调参覆盖合并（07-fx/11-vis-mode-data-plane）。引擎端 monetResolveTuning
   逐字段空值合并；引擎暴露 setTuning，控制台改动 live 应用 ---------- */

var MONET_DEFAULT_TUNING_BRIDGE = {
  keywordColoringEnabled: true,
  showDescription: true,
  showAudioVisualization: true,
  audioStyle: 'bar',
  fontScale: 1.2
};

function monetResolvedTuning() {
  if (typeof visModeTuningOverrides !== 'function') return MONET_DEFAULT_TUNING_BRIDGE;
  return Object.assign({}, MONET_DEFAULT_TUNING_BRIDGE, visModeTuningOverrides('monet'));
}
if (typeof visModeTuningRegisterLiveApply === 'function') {
  visModeTuningRegisterLiveApply('monet', function (tuning) {
    if (monetEngine && typeof monetEngine.setTuning === 'function') {
      try { monetEngine.setTuning(tuning); } catch (e) { }
    }
  });
}

/* ---------- 元数据（#control-title-text / #control-artist 文本） ---------- */

function monetMetaNow() {
  var titleEl = document.getElementById('control-title-text');
  var artistEl = document.getElementById('control-artist');
  return {
    songTitle: titleEl ? String(titleEl.textContent || '') : '',
    songArtist: artistEl ? String(artistEl.textContent || '') : ''
  };
}

/* ---------- 生命周期 ---------- */

function startMonet() {
  if (typeof applyOverlayModeFontScale === 'function') {
    applyOverlayModeFontScale(document.getElementById('monet-overlay'));
  }
  var host = document.getElementById('monet-engine-host');
  if (!host || typeof MonetMonetEngine !== 'function') {
    if (typeof console !== 'undefined') console.warn('[MonetEngine] 引擎产物未加载（monet-engine.js）');
    return;
  }
  var meta = monetMetaNow();
  var cover = (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null;
  try {
    monetFontScale = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
    monetEngine = MonetMonetEngine({
      host: host,
      lines: monetToLines(),
      currentTime: monetTimeMV,
      theme: monetTheme(),
      tuning: monetResolvedTuning(),
      lyricsFontScale: monetFontScale,
      coverUrl: cover,
      songTitle: meta.songTitle,
      songArtist: meta.songArtist,
      songAlbum: '',
      seed: monetLinesKeyNow(),
      audioPower: monetPowerMV,
      audioBands: monetBands
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[MonetEngine] runtime create failed', e);
    monetEngine = null;
    return;
  }
  monetLinesKey = '';
  monetThemeKey = '';
  monetCoverKey = cover || '';
  monetMetaKey = meta.songTitle + '|' + meta.songArtist;
  (function loop() {
    if (!monetMode || !monetEngine) return;
    monetSync();
    monetTimer = setTimeout(loop, 700);
  })();
}

function monetLinesKeyNow() {
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var first = lines[0], last = lines[lines.length - 1];
  return lines.length + '|' + (first ? first.t : 0) + '|' + (last ? last.t : 0);
}

/* 换歌 / 主题 / 字号 / 封面 / 元数据变化 → 引擎热更新（700ms 轮询） */
function monetSync() {
  var eng = monetEngine;
  if (!eng) return;
  var ls = monetToLines();
  var linesKey = monetLinesKeyNow();
  if (linesKey !== monetLinesKey) {
    monetLinesKey = linesKey;
    eng.setLines(ls);
  }
  var theme = monetTheme();
  var themeKey = JSON.stringify(theme);
  if (themeKey !== monetThemeKey) {
    monetThemeKey = themeKey;
    eng.setTheme(theme);
  }
  var fs = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
  if (fs !== monetFontScale) {
    monetFontScale = fs;
    eng.setFontScale(fs);
  }
  var cover = (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null;
  if ((cover || '') !== monetCoverKey) {
    monetCoverKey = cover || '';
    eng.setCoverUrl(cover);
  }
  var meta = monetMetaNow();
  var metaKey = meta.songTitle + '|' + meta.songArtist;
  if (metaKey !== monetMetaKey) {
    monetMetaKey = metaKey;
    eng.setMeta({ songTitle: meta.songTitle, songArtist: meta.songArtist, seed: linesKey });
  } else {
    eng.setMeta({ seed: linesKey });
  }
}

function stopMonet() {
  if (monetTimer) { clearTimeout(monetTimer); monetTimer = 0; }
  if (monetEngine) {
    try { monetEngine.destroy(); } catch (e) { }
    monetEngine = null;
  }
}

/* ---------- 切换入口（注册表 stateVar=monetMode / applyFn=applyMonetMode） ---------- */

function applyMonetMode(on, opts) {
  opts = opts || {};
  monetMode = !!on;
  if (monetMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('monet', { save: true });
  }
  document.body.classList.toggle('monet', monetMode);
  var overlay = document.getElementById('monet-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', monetMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(MONET_STORE_KEY, monetMode);
  if (monetMode) {
    startMonet();
  } else {
    stopMonet();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(monetMode ? '莫奈已开启' : '已切回标准模式');
}

function toggleMonetMode() {
  applyMonetMode(!monetMode, { save: true, toast: true });
}

/* ---------- 启动恢复（模块顶层加载时执行，DOM 已就绪） ---------- */
function initMonet() {
  applyMonetMode(monetMode, { save: false });
}

scheduleUiWarmTask ? scheduleUiWarmTask(initMonet, 360) : setTimeout(initMonet, 360);
