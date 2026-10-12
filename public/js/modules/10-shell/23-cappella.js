/* =========================================================================
   OrangeSea · 群唱引擎桥（原版渲染核心宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — adapted from folia-major: src/components/visualizer/cappella/
     VisualizerCappella.tsx 的宿主职责（数据形状/时间源/主题/字号/生命周期桥接）。
   引擎本体在 10-shell-cappella-engine/cappella-engine.js（tsc 转译闭包 +
   mini-motion + 渲染核心手工落地），由 index.html 静态 <script> 先行加载。

   桥的内容（DOM 类模式的样板接线，20b-classic-engine-bridge 同范式）：
   1) 数据形状转换：本项目 lyricsLines（{text, t, duration, words:[{text,t,d}],
      translation, isChorus}）→ Folia Line（{fullText, startTime, endTime,
      words:[{text,startTime,endTime}], translation, isChorus}）；
      LRC 行（无 words）→ 单词覆盖整行（引擎 graphemeTiming 均分逐字 reveal）。
   2) MotionValue 适配：{get, subscribe, emit} duck-type（引擎每帧轮询
      get() 派发 change——useMotionValueEvent 的等价）。时间源
      getAdjustedLyricPlaybackTime(audio.currentTime)（含歌词偏移；
      覆盖层激活时主循环保温门控提前 return，motionSignalSet('currentTime')
      不再刷新，与 09-aurora-flow 同范式）。
   3) 主题桥：夜侧主题 → Folia Theme 形状 + fontFamilyStack 数组 +
      animationIntensity 随强度档 fx.visAnimationIntensity、wordColors 随
      主题词色表 orangesea-vis-word-colors-v1（07-fx/11-vis-mode-data-plane；
      引擎三档配置保留由 theme.animationIntensity 驱动）。
   4) 生命周期：进入模式创建引擎（宿主 #cappella-engine-host）、换歌/主题/
      字号/封面/标题轮询 sync（700ms）、退出 destroy。引擎加载失败仅
      console.warn（DOM 引擎无 WebGL 依赖，正常环境不触发；无降级双路径
      ——旧简化实现已被原版渲染核心取代删除）。
   头像与表情图片来自 Folia 内置资源（AI 生成，上游声明可自由分发，
   见 public/assets/cappella/README.md）。
   ========================================================================= */

var CAPPELLA_STORE_KEY = 'orangesea-cappella-v1';
var cappellaMode = readBooleanPreference(CAPPELLA_STORE_KEY, false);
var cappellaEngine = null;
var cappellaTimer = 0;
var cappellaLinesKey = '';
var cappellaThemeKey = '';
var cappellaFontScale = 0;
var cappellaCoverKey = '';
var cappellaTitleKey = '';

/* ---------- 数据形状：lyricsLines → Folia Line[] ---------- */

function cappellaToLines() {
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

var cappellaTimeMV = {
  subs: [],
  get: function () {
    try {
      return getAdjustedLyricPlaybackTime((typeof audio !== 'undefined' && audio) ? (audio.currentTime || 0) : 0);
    } catch (e) { return 0; }
  },
  subscribe: function (fn) { this.subs.push(fn); },
  emit: function (v) { for (var i = 0; i < this.subs.length; i++) this.subs[i](v); }
};

/* ---------- 主题桥（夜侧 → Folia Theme 形状） ---------- */

function cappellaTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#0e0906', primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6' };
  var fontStack = '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  try {
    var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
    if (fontKey && typeof lyricFontStackForKey === 'function') fontStack = lyricFontStackForKey(fontKey);
  } catch (e) { }
  return {
    name: 'orangesea-cappella',
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

/* ---------- tuning：DEFAULT_CAPPELLA_TUNING 原值（types.ts:482-486）
   + 调参覆盖合并（07-fx/11-vis-mode-data-plane）。引擎端 cappellaResolveTuning
   逐字段空值合并；引擎暴露 setTuning，控制台改动 live 应用 ---------- */

var CAPPELLA_DEFAULT_TUNING_BRIDGE = {
  showEmoMessages: true,
  emojiPackSource: 'builtin',
  avatarSource: 'cover'
};

function cappellaResolvedTuning() {
  if (typeof visModeTuningOverrides !== 'function') return CAPPELLA_DEFAULT_TUNING_BRIDGE;
  return Object.assign({}, CAPPELLA_DEFAULT_TUNING_BRIDGE, visModeTuningOverrides('cappella'));
}
if (typeof visModeTuningRegisterLiveApply === 'function') {
  visModeTuningRegisterLiveApply('cappella', function (tuning) {
    if (cappellaEngine && typeof cappellaEngine.setTuning === 'function') {
      try { cappellaEngine.setTuning(tuning); } catch (e) { }
    }
  });
}

/* 宿主标题（Folia songTitle：msg[0] 标题卡文本 + avatarSeed 缺省） */
function cappellaCurrentTitle() {
  var el = document.getElementById('control-title-text');
  return (el && el.textContent) ? el.textContent : '';
}

/* ---------- 封面模糊氛围底（宿主夜景层，非 Folia 渲染核心职责；
   Folia 侧为 VisualizerShell 的可配置背景系统，本项目按覆盖层惯例
   用封面衍生夜色底） ---------- */

var cappellaBgPhoto = null;
function cappellaEnsureBackground() {
  var overlay = document.getElementById('cappella-overlay');
  if (!overlay) return;
  if (!cappellaBgPhoto) {
    cappellaBgPhoto = document.createElement('div');
    cappellaBgPhoto.className = 'cappella-bg-photo';
    cappellaBgPhoto.setAttribute('aria-hidden', 'true');
    overlay.insertBefore(cappellaBgPhoto, overlay.firstChild);
  }
  var url = (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null;
  if (url && cappellaBgPhoto.dataset.url !== url) {
    cappellaBgPhoto.dataset.url = url;
    cappellaBgPhoto.style.backgroundImage = 'url("' + url + '")';
  }
}

/* ---------- 生命周期 ---------- */

function startCappella() {
  cappellaEnsureBackground();
  if (typeof applyOverlayModeFontScale === 'function') {
    applyOverlayModeFontScale(document.getElementById('cappella-overlay'));
  }
  var host = document.getElementById('cappella-engine-host');
  if (!host || typeof CappellaCappellaEngine !== 'function') {
    if (typeof console !== 'undefined') console.warn('[CappellaEngine] 引擎产物未加载（cappella-engine.js）');
    return;
  }
  try {
    cappellaFontScale = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
    var coverUrl = (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null;
    cappellaEngine = CappellaCappellaEngine({
      host: host,
      lines: cappellaToLines(),
      currentTime: cappellaTimeMV,
      theme: cappellaTheme(),
      tuning: cappellaResolvedTuning(),
      coverUrl: coverUrl,
      songTitle: cappellaCurrentTitle(),
      lyricsFontScale: cappellaFontScale
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[CappellaEngine] runtime create failed', e);
    cappellaEngine = null;
    return;
  }
  cappellaLinesKey = '';
  cappellaThemeKey = '';
  cappellaCoverKey = '';
  cappellaTitleKey = '';
  (function loop() {
    if (!cappellaMode || !cappellaEngine) return;
    cappellaSync();
    cappellaTimer = setTimeout(loop, 700);
  })();
}

/* 换歌 / 主题 / 字号 / 封面 / 标题变化 → 引擎热更新（700ms 轮询） */
function cappellaSync() {
  var eng = cappellaEngine;
  if (!eng) return;
  var ls = cappellaToLines();
  var linesKey = ls.length + '|' + (ls.length ? (ls[0].startTime + ':' + ls[ls.length - 1].startTime) : '');
  if (linesKey !== cappellaLinesKey) {
    cappellaLinesKey = linesKey;
    eng.setLines(ls);
  }
  var theme = cappellaTheme();
  var themeKey = JSON.stringify(theme);
  if (themeKey !== cappellaThemeKey) {
    cappellaThemeKey = themeKey;
    eng.setTheme(theme);
  }
  var fs = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
  if (fs !== cappellaFontScale) {
    cappellaFontScale = fs;
    eng.setFontScale(fs);
  }
  var coverUrl = (typeof getControlCoverUrl === 'function') ? getControlCoverUrl() : null;
  var coverKey = coverUrl || '';
  if (coverKey !== cappellaCoverKey) {
    cappellaCoverKey = coverKey;
    eng.setCover(coverUrl);
    cappellaEnsureBackground();
  }
  var title = cappellaCurrentTitle();
  if (title !== cappellaTitleKey) {
    cappellaTitleKey = title;
    eng.setSongTitle(title);
  }
}

function stopCappella() {
  if (cappellaTimer) { clearTimeout(cappellaTimer); cappellaTimer = 0; }
  if (cappellaEngine) {
    try { cappellaEngine.destroy(); } catch (e) { }
    cappellaEngine = null;
  }
}

/* ---------- 切换入口（注册表 stateVar=cappellaMode / applyFn=applyCappellaMode） ---------- */

function applyCappellaMode(on, opts) {
  opts = opts || {};
  cappellaMode = !!on;
  if (cappellaMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('cappella', { save: true });
  }
  document.body.classList.toggle('cappella', cappellaMode);
  var overlay = document.getElementById('cappella-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', cappellaMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(CAPPELLA_STORE_KEY, cappellaMode);
  if (cappellaMode) {
    startCappella();
  } else {
    stopCappella();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(cappellaMode ? '群唱已开启' : '已切回标准模式');
}

function toggleCappellaMode() {
  applyCappellaMode(!cappellaMode, { save: true, toast: true });
}

/* ---------- 启动恢复（模块顶层加载时执行，DOM 已就绪） ---------- */

function initCappella() {
  applyCappellaMode(cappellaMode, { save: false });
}

scheduleUiWarmTask ? scheduleUiWarmTask(initCappella, 340) : setTimeout(initCappella, 340);
