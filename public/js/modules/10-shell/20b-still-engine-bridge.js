/* =========================================================================
   OrangeSea · 静止引擎桥（原版渲染核心宿主化）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors (AGPL-3.0)
   — adapted from folia-major: src/components/visualizer/still/VisualizerStill.tsx
     的宿主职责（数据形状/时间源/主题/字号/生命周期桥接）。
   引擎本体在 10-shell-still-engine/still-engine.js（tsc 转译闭包 +
   渲染核心手工落地），由 index.html 静态 <script> 先行加载。

   桥的内容（DOM 类模式的样板接线，与 20b-classic-engine-bridge 同范式）：
   1) 数据形状转换：本项目 lyricsLines（{text, t, duration, words:[{text,t,d}],
      translation, isChorus}）→ Folia Line（{fullText, startTime, endTime,
      words:[...], translation, isChorus}）；
   2) MotionValue 适配：{get, subscribe, emit} duck-type（引擎每帧轮询 get，
      stillFindLineIndexAtTime 派生 currentLineIndex——useEffect 等价）。
      时间源 getAdjustedLyricPlaybackTime(audio.currentTime)（含歌词偏移）；
   3) 主题桥：夜侧主题 → Folia Theme 形状 + fontFamilyStack 数组 +
      animationIntensity/wordColors 数据面契约字段（07-fx/11-vis-mode-data-plane；
      still 渲染核心不读它们，随 Theme 形状下发保持全模式契约一致）；
   4) 生命周期：进入模式创建引擎（宿主 #still-engine-host）、换歌/主题/字号
      轮询 sync（700ms）、退出 destroy。引擎加载失败仅 console.warn
      （DOM 引擎无 WebGL 依赖，正常环境不触发；无降级双路径——旧简化实现
      已被原版渲染核心取代删除）。
   ========================================================================= */

var STILL_STORE_KEY = 'orangesea-still-lyrics-v1';
var stillMode = readBooleanPreference(STILL_STORE_KEY, false);
var stillEngine = null;
var stillTimer = 0;
var stillLinesKey = '';
var stillThemeKey = '';
var stillFontScale = 0;

/* ---------- 数据形状：lyricsLines → Folia Line[] ---------- */

function stillToLines() {
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

/* ---------- MotionValue duck-type（引擎每帧轮询 get → 派生 currentLineIndex） ---------- */

var stillTimeMV = {
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

function stillTheme() {
  var t = null;
  try { t = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (!t) t = { backgroundColor: '#0e0906', primaryColor: '#f6efe2', accentColor: '#ffcf9e', secondaryColor: '#e6c9a6' };
  var fontStack = '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  try {
    var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
    if (fontKey && typeof lyricFontStackForKey === 'function') fontStack = lyricFontStackForKey(fontKey);
  } catch (e) { }
  return {
    name: 'orangesea-still',
    backgroundColor: t.backgroundColor,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor || t.primaryColor,
    accentColor: t.accentColor || t.primaryColor,
    fontStyle: 'sans',
    /* 字重不写死：对齐 Folia 宿主语义 buildVisualizerTheme.ts:43
       `fontWeight: lyricsFontWeight ?? undefined`——宿主未设置歌词字重时
       不下发，引擎 resolveThemeFontWeight(theme, isCurrent?700:600) 走
       fallback 层次（fontStacks.ts:14-17 + VisualizerStill.tsx:69/:83：
       当前主行 700 / 邻行 600，译文 500 / 400）。本宿主无字重设置项，
       恒等价 Folia 默认（未设置）。 */
    fontWeight: undefined,
    fontFamilyStack: lyricFontStackFamilies(fontStack),
    animationIntensity: (typeof visAnimationIntensityCurrent === 'function') ? visAnimationIntensityCurrent() : 'normal',
    wordColors: (typeof visWordColorsList === 'function') ? visWordColorsList() : []
  };
}

/* ---------- 生命周期 ---------- */

/* 正交背景层（Folia still 语义：VisualizerStill.tsx:43 renderBackground={false}，
   头注释 "leaving the background renderer unmounted"——原版不挂
   VisualizerBackgroundRenderer，壳恒 transparent（VisualizerShell.tsx:130），
   露出 App 根 var(--bg-color)=theme.backgroundColor（buildAppStyle.ts:23/27）。
   故本模式的背景 = 主题纯色底，不接 Latent 渲染器。 */
function stillApplyOverlayBackground() {
  var overlay = document.getElementById('still-overlay');
  if (!overlay) return;
  var st = null;
  try { st = (typeof themeOverlayDarkTheme === 'function') ? themeOverlayDarkTheme() : null; } catch (e) { }
  if (st && st.backgroundColor) overlay.style.background = st.backgroundColor;
}

function startStill() {
  if (typeof applyOverlayModeFontScale === 'function') {
    applyOverlayModeFontScale(document.getElementById('still-overlay'));
  }
  stillApplyOverlayBackground();
  var host = document.getElementById('still-engine-host');
  if (!host || typeof StillStillEngine !== 'function') {
    if (typeof console !== 'undefined') console.warn('[StillEngine] 引擎产物未加载（still-engine.js）');
    return;
  }
  try {
    stillFontScale = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
    stillEngine = StillStillEngine({
      host: host,
      lines: stillToLines(),
      currentTime: stillTimeMV,
      theme: stillTheme(),
      lyricsFontScale: stillFontScale
      /* isDaylight 不传（引擎侧保留原版昼夜分支 VisualizerStill.tsx:47：
         昼 opacity-30+mix-blend-multiply / 夜 opacity-[0.65]）。原版语义
         来自 Folia App 级昼间模式开关（App.tsx:2658/:2729 传参 +
         DAYLIGHT_THEME），本宿主无昼间模式入口（全码仅主题名后缀
         「白昼」96-theme-service.js:300，非昼间取色语义）——分支为
         宿主不可达的原版保留逻辑，接不上如实标注，待宿主有昼间语义再接。 */
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[StillEngine] runtime create failed', e);
    stillEngine = null;
    return;
  }
  stillLinesKey = '';
  stillThemeKey = '';
  (function loop() {
    if (!stillMode || !stillEngine) return;
    stillSync();
    stillTimer = setTimeout(loop, 700);
  })();
}

/* 换歌 / 主题 / 字号变化 → 引擎热更新（行数据与主题 key 轮询，700ms） */
function stillSync() {
  var eng = stillEngine;
  if (!eng) return;
  var ls = stillToLines();
  var linesKey = ls.length + '|' + (ls.length ? (ls[0].startTime + ':' + ls[ls.length - 1].startTime) : '');
  if (linesKey !== stillLinesKey) {
    stillLinesKey = linesKey;
    eng.setLines(ls);
  }
  var theme = stillTheme();
  var themeKey = JSON.stringify(theme);
  if (themeKey !== stillThemeKey) {
    stillThemeKey = themeKey;
    eng.setTheme(theme);
    /* App 根背景随主题即时变化、still 壳 transparent 透出（buildAppStyle.ts:27）——
       主题热更时正交背景层同步跟随 */
    stillApplyOverlayBackground();
  }
  var fs = (typeof overlayModeFontScale === 'function') ? overlayModeFontScale() : 1;
  if (fs !== stillFontScale) {
    stillFontScale = fs;
    eng.setFontScale(fs);
  }
}

function stopStill() {
  if (stillTimer) { clearTimeout(stillTimer); stillTimer = 0; }
  if (stillEngine) {
    try { stillEngine.destroy(); } catch (e) { }
    stillEngine = null;
  }
  /* 退出清理 inline 背景，交还 CSS var(--theme-bg, #171009) 兜底（still.css:23） */
  var overlay = document.getElementById('still-overlay');
  if (overlay) overlay.style.background = '';
}

/* ---------- 切换入口（注册表 stateVar=stillMode / applyFn=applyStillMode） ---------- */

function applyStillMode(on, opts) {
  opts = opts || {};
  stillMode = !!on;
  /* 覆盖层互斥：经视觉模式注册表退出其它覆盖层 */
  if (stillMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('still', { save: true });
  }
  document.body.classList.toggle('still', stillMode);
  var overlay = document.getElementById('still-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', stillMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(STILL_STORE_KEY, stillMode);
  if (stillMode) {
    startStill();
  } else {
    stopStill();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(stillMode ? '静止歌词已开启' : '已切回标准模式');
}

function toggleStillMode() {
  applyStillMode(!stillMode, { save: true, toast: true });
}

/* ---------- 启动恢复（模块顶层加载时执行，DOM 已就绪） ---------- */
function initStill() {
  applyStillMode(stillMode, { save: false });
}

scheduleUiWarmTask ? scheduleUiWarmTask(initStill, 300) : setTimeout(initStill, 300);
