/* =========================================================================
   OrangeSea · 镜台引擎桥（原版渲染核心宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — adapted from folia-major: src/components/visualizer/diorama/
     VisualizerDiorama.tsx 的宿主职责（数据形状/时间源/主题/字号/生命周期桥接）。
   引擎本体在 10-shell-diorama-engine/diorama-engine.js（tsc 转译闭包 +
   three.js 命令式宿主落地），由 index.html 静态 <script> 先行加载；three 0.185
   ES 模块由 vendor/three-0.185.module.min.js 以 <script type="module"> 挂
   window.THREE185（不影响应用内置 r128 全局 THREE）。

   桥的内容（three/DOM 类模式的样板接线，同 20b-classic-engine-bridge 范式）：
   1) 数据形状转换：本项目 lyricsLines（{text, t, duration, words:[{text,t,d}],
      translation, isChorus}）→ Folia Line（{fullText, startTime, endTime,
      words:[{text,startTime,endTime}], translation, isChorus}）。
      Folia 的 blockIndex/songPart 仅 TTML 源存在（parserCore 不生成），置
      undefined 与 Folia 处理普通 LRC/QRC 歌词的自身行为一致（运镜的段落
      开头加成退化为 false，isChorus 驱动的副歌加成照常生效）。
      引擎侧引用稳定性：内容 key 不变时不重发数组（换行序列机的
      lyricsChanged 判定按引用比较）。
   2) MotionValue 适配：{get} duck-type。时间源
      getAdjustedLyricPlaybackTime(audio.currentTime)（含歌词偏移）。
      音频：Folia 频带为 0..255，本项目 motionSignalGet('bands') 各带 ~0..1
      → ×255；带映射 bass←kick、lowMid/mid←vocal（420-2600Hz 最接近 Folia
      mid 段）、treble←treble；audioPower 0..1 → ×255。
   3) 主题桥：夜侧主题 → Folia Theme 形状 + fontFamilyStack 数组 +
      animationIntensity 随强度档 fx.visAnimationIntensity、wordColors 随
      主题词色表 orangesea-vis-word-colors-v1（07-fx/11-vis-mode-data-plane；
      空 AI 词色表时关键字着色
      matcher 空表 → 场景原样回退纯主色）。
   4) 歌曲标识（seed）：#control-title-text|#control-artist（同 24-monet 桥
      口径），Folia 以 currentSongId 驱动整条走廊的确定性布局，无 id 时回退
      歌词内容签名。换歌由引擎内的提交闸（词就绪/器乐曲 2s/8s 保底）接管。
   5) 生命周期：进入模式创建引擎（宿主 #diorama-engine-host）、换歌/主题/
      字号轮询 sync（700ms）、退出 destroy。引擎或 THREE185 未就绪时轮询
      等待（ES module 异步加载），不落降级双路径——旧简化实现已删除。
   ========================================================================= */

var DIORAMA_STORE_KEY = 'orangesea-diorama-v1';
var dioramaMode = readBooleanPreference(DIORAMA_STORE_KEY, false);
var dioramaEngine = null;
var dioramaTimer = 0;
var dioramaWaitTimer = 0;
var dioramaLinesRef = null;      /* 引用稳定：内容不变时复用同一数组 */
var dioramaLinesKey = '';
var dioramaThemeKey = '';
var dioramaFontScale = 0;
var dioramaSongKey = '';

/* ---------- 数据形状：lyricsLines → Folia Line[]（引用稳定） ---------- */

function dioramaToLines() {
  var src = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var first = src[0], last = src[src.length - 1];
  var key = src.length + '|' + (first ? first.t : 0) + '|' + (last ? last.t : 0) + '|' + (first ? String(first.text || '').slice(0, 24) : '');
  if (key === dioramaLinesKey && dioramaLinesRef) return dioramaLinesRef;
  dioramaLinesKey = key;
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
  dioramaLinesRef = out;
  return out;
}

/* ---------- MotionValue duck-type ---------- */

var dioramaTimeMV = {
  get: function () {
    try {
      return getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0);
    } catch (e) { return 0; }
  }
};

var dioramaPowerMV = {
  get: function () {
    try {
      var p = (typeof motionSignalGet === 'function') ? motionSignalGet('audioPower') : 0;
      return (typeof p === 'number' && isFinite(p) && p > 0) ? Math.min(1, p) * 255 : 0;
    } catch (e) { return 0; }
  }
};

function dioramaBandMV(key) {
  return {
    get: function () {
      try {
        var bands = (typeof motionSignalGet === 'function') ? motionSignalGet('bands') : null;
        var v = bands ? Number(bands[key]) || 0 : 0;
        return Math.min(255, Math.max(0, v * 255));
      } catch (e) { return 0; }
    }
  };
}

/* Folia AudioBands 形状（bass/lowMid/mid/vocal/treble，0..255）；
   带映射见文件头注释 2)。 */
var dioramaBands = {
  bass: dioramaBandMV('kick'),
  lowMid: dioramaBandMV('vocal'),
  mid: dioramaBandMV('vocal'),
  vocal: dioramaBandMV('vocal'),
  treble: dioramaBandMV('treble')
};

/* ---------- 主题桥（夜侧 → Folia Theme 形状） ---------- */

function dioramaTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#0e0906', primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6' };
  var fontStack = '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  try {
    var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
    if (fontKey && typeof lyricFontStackForKey === 'function') fontStack = lyricFontStackForKey(fontKey);
  } catch (e) { }
  return {
    name: 'orangesea-diorama',
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

/* ---------- tuning：DEFAULT_DIORAMA_TUNING 原值（types.ts:883-903，含
   geometryVisibility 完整形状）+ 调参覆盖合并（07-fx/11-vis-mode-data-plane）。
   注意：引擎 create 对 opts.tuning 整体取用（缺省回内部默认），故桥下发完整
   对象；引擎无 setTuning，控制台改动下次进入模式生效 ---------- */

var DIORAMA_DEFAULT_TUNING_BRIDGE = {
  cameraSpeed: 1,
  motionAmount: 1,
  audioReactivity: 1,
  geometryVisibility: {
    enabled: true,
    mode: 'clouds',
    strands: true,
    blobs: true,
    ribbons: true,
    rings: true
  },
  particleDensity: 576,
  particleScale: 1,
  particleGlowEnabled: true,
  particleGlowIntensity: 0.65,
  showParticles: true,
  backgroundParticleCircumference: 28,
  backgroundParticleRadial: 2,
  glowEnabled: true,
  glowIntensity: 1,
  soulEnabled: true,
  soulIntensity: 1,
  soulActiveEnabled: false,
  gradientEnabled: false,
  gradientIntensity: 1,
  keywordColoringEnabled: true
};

function dioramaResolvedTuning() {
  if (typeof visModeTuningOverrides !== 'function') return DIORAMA_DEFAULT_TUNING_BRIDGE;
  return Object.assign({}, DIORAMA_DEFAULT_TUNING_BRIDGE, visModeTuningOverrides('diorama'));
}

/* ---------- 歌曲标识（Folia currentSongId 等价；口径同 24-monet 桥） ---------- */

function dioramaSongSeed() {
  var titleEl = document.getElementById('control-title-text');
  var artistEl = document.getElementById('control-artist');
  var title = titleEl ? String(titleEl.textContent || '').trim() : '';
  var artist = artistEl ? String(artistEl.textContent || '').trim() : '';
  if (title || artist) return title + '|' + artist;
  var lines = dioramaToLines();
  return lines.length ? ('lyrics:' + lines.length + ':' + (lines[0].startTime || 0)) : 'diorama';
}

/* ---------- 生命周期 ---------- */

function dioramaStartWhenReady() {
  if (!dioramaMode) return;
  if (typeof DioramaDioramaEngine !== 'function' || typeof window.THREE185 === 'undefined') {
    /* ES module（three 0.185）异步加载 + 引擎产物就绪轮询；10s 上限告警 */
    if (!dioramaWaitTimer) {
      var waited = 0;
      dioramaWaitTimer = setInterval(function () {
        waited += 100;
        if (!dioramaMode) { clearInterval(dioramaWaitTimer); dioramaWaitTimer = 0; return; }
        if ((typeof DioramaDioramaEngine === 'function' && typeof window.THREE185 !== 'undefined') || waited > 10000) {
          clearInterval(dioramaWaitTimer);
          dioramaWaitTimer = 0;
          if (waited > 10000) {
            if (typeof console !== 'undefined') console.warn('[DioramaEngine] three/引擎产物 10s 未就绪，本 song 不起引擎');
            return;
          }
          dioramaStartEngine();
        }
      }, 100);
    }
    return;
  }
  dioramaStartEngine();
}

function dioramaStartEngine() {
  var host = document.getElementById('diorama-engine-host');
  if (!host || typeof DioramaDioramaEngine !== 'function') {
    if (typeof console !== 'undefined') console.warn('[DioramaEngine] 引擎宿主缺失（#diorama-engine-host）');
    return;
  }
  try {
    dioramaFontScale = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
    dioramaLinesKey = '';
    dioramaSongKey = dioramaSongSeed();
    dioramaEngine = DioramaDioramaEngine({
      host: host,
      lines: dioramaToLines(),
      currentTime: dioramaTimeMV,
      audioPower: dioramaPowerMV,
      audioBands: dioramaBands,
      theme: dioramaTheme(),
      tuning: dioramaResolvedTuning(),
      lyricsFontScale: dioramaFontScale,
      seed: dioramaSongKey
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[DioramaEngine] runtime create failed', e);
    dioramaEngine = null;
    return;
  }
  dioramaThemeKey = '';
  (function loop() {
    if (!dioramaMode || !dioramaEngine) return;
    dioramaSync();
    dioramaTimer = setTimeout(loop, 700);
  })();
}

/* 换歌 / 主题 / 字号变化 → 引擎热更新（700ms 轮询） */
function dioramaSync() {
  var eng = dioramaEngine;
  if (!eng) return;
  var ls = dioramaToLines();
  var songKey = dioramaSongSeed();
  if (songKey !== dioramaSongKey) {
    dioramaSongKey = songKey;
    eng.setSong(songKey, ls);
  }
  var theme = dioramaTheme();
  var themeKey = JSON.stringify(theme);
  if (themeKey !== dioramaThemeKey) {
    dioramaThemeKey = themeKey;
    eng.setTheme(theme);
  }
  var fs = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
  if (fs !== dioramaFontScale) {
    dioramaFontScale = fs;
    eng.setFontScale(fs);
  }
}

function stopDiorama() {
  if (dioramaTimer) { clearTimeout(dioramaTimer); dioramaTimer = 0; }
  if (dioramaWaitTimer) { clearInterval(dioramaWaitTimer); dioramaWaitTimer = 0; }
  if (dioramaEngine) {
    try { dioramaEngine.destroy(); } catch (e) { }
    dioramaEngine = null;
  }
}

/* ---------- 切换入口（注册表 stateVar=dioramaMode / applyFn=applyDioramaMode） ---------- */

function applyDioramaMode(on, opts) {
  opts = opts || {};
  dioramaMode = !!on;
  if (dioramaMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('diorama', { save: true });
  }
  document.body.classList.toggle('diorama', dioramaMode);
  var overlay = document.getElementById('diorama-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', dioramaMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(DIORAMA_STORE_KEY, dioramaMode);
  if (dioramaMode) {
    if (typeof applyOverlayModeFontScale === 'function') {
      applyOverlayModeFontScale(document.getElementById('diorama-overlay'));
    }
    dioramaStartWhenReady();
  } else {
    stopDiorama();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(dioramaMode ? '镜台已开启' : '已切回标准模式');
}

function toggleDioramaMode() {
  applyDioramaMode(!dioramaMode, { save: true, toast: true });
}

/* ---------- 启动恢复（模块顶层加载时执行，DOM 已就绪） ---------- */
function initDiorama() {
  applyDioramaMode(dioramaMode, { save: false });
}

scheduleUiWarmTask ? scheduleUiWarmTask(initDiorama, 350) : setTimeout(initDiorama, 350);
