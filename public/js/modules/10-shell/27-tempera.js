/* =========================================================================
   OrangeSea · 凝彩（Tempera · 剪纸色块歌词）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0): src/components/visualizer/tempera/
     compositions/*（马蒂斯剪纸式构图库）/ VisualizerTempera.tsx。
   -------------------------------------------------------------------------
   马蒂斯剪纸式的抽象色块拼贴：按歌曲 seed 从构图库选一种（圆/矩形/
   条带的组合），5~7 个大色块以主题色系 + 撞色铺开，柔边（blur）+ 大
   旋转 + 各自周期的缓慢漂移呼吸；音频能量驱动整体饱和度（副歌更实更
   亮）。歌词居中大字逐字点亮，上下行暗淡。主题跟随。
   ========================================================================= */

var temperaUsePixi = false;   /* 原版 Pixi 引擎接管（false = DOM 版降级） */
var TEMPERA_STORE_KEY = 'orangesea-tempera-v1';
var temperaMode = readBooleanPreference(TEMPERA_STORE_KEY, false);
var temperaTimer = 0;
var temperaBlocksDom = [];
var temperaLastSeed = '';
var temperaLastThemeKey = '';
var temperaLastFontKey = '';
var temperaLastLinesKey = '';
var temperaLastActiveIdx = -99;
var temperaLinesCache = [];
var temperaLastEnergyKey = '';

/* ---------- 主题 ---------- */
var temperaTheme = { primary: '#f2ede2', accent: '#ff9c6e', secondary: '#7a9e9e', bg: '#101014' };

function temperaSyncTheme() {
  /* 字体跟随（DOM 降级路径）：fx.lyricFont → --tp-font（Pixi 路径走 27a 桥主题） */
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  if (fontKey !== temperaLastFontKey) {
    temperaLastFontKey = fontKey;
    if (fontKey && typeof lyricFontStackForKey === 'function') {
      var fontOverlay = document.getElementById('tempera-overlay');
      if (fontOverlay) fontOverlay.style.setProperty('--tp-font', lyricFontStackForKey(fontKey));
    }
  }
  if (typeof themeOverlayDarkTheme !== 'function') return false;
  var t = null;
  try { t = themeOverlayDarkTheme(); } catch (e) { return false; }
  if (!t) return false;
  var key = (t.primaryColor || '') + '|' + (t.accentColor || '') + '|' + (t.secondaryColor || '') + '|' + (t.backgroundColor || '');
  if (key === temperaLastThemeKey) return false;
  temperaLastThemeKey = key;
  if (t.primaryColor) temperaTheme.primary = t.primaryColor;
  if (t.accentColor) temperaTheme.accent = t.accentColor;
  if (t.secondaryColor) temperaTheme.secondary = t.secondaryColor;
  if (t.backgroundColor) temperaTheme.bg = t.backgroundColor;
  var overlay = document.getElementById('tempera-overlay');
  if (overlay) overlay.style.setProperty('--tp-ink', temperaTheme.primary);
  temperaLastSeed = '';    /* 主题变了重铺色块 */
  return true;
}

/* ---------- 构图库（temperaXxxCompositions 的纯 DOM 等价：5 种构图模板） ---------- */

function temperaHashString(input) {
  var hash = 2166136261;
  input = String(input);
  for (var i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/* 撞色：从主题三色派生的互补/邻近色变体（temperaCutout 的色板等价） */
function temperaPalette() {
  var t = temperaTheme;
  function hueShift(hex, deg) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var h = 0, s = 0, l = (mx + mn) / 510;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (510 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (mx === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    h = (h + deg / 360 + 1) % 1;
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    function ch(k) {
      k = (k + 1) % 1;
      if (k < 1 / 6) return p + (q - p) * 6 * k;
      if (k < 0.5) return q;
      if (k < 2 / 3) return p + (q - p) * (2 / 3 - k) * 6;
      return p;
    }
    function to255(v) { return Math.round(Math.max(0, Math.min(1, v)) * 255); }
    return 'rgb(' + to255(ch(h + 1 / 3)) + ',' + to255(ch(h)) + ',' + to255(ch(h - 1 / 3)) + ')';
  }
  return [
    t.accent,
    hueShift(t.accent, 28),       /* 邻近暖 */
    t.secondary,                  /* 沉静补 */
    hueShift(t.accent, -172),     /* 撞色（近互补） */
    hueShift(t.secondary, 40),
    hueShift(t.accent, -40)
  ];
}

/* 每种构图 = 色块形状表（shape/size/pos/rotate/duration） */
var TEMPERA_COMPOSITIONS = [
  /* 圆窗构图（aperture）：大圆 + 卫星小圆 + 横带 */
  [
    { shape: 'circle', size: 58, x: 62, y: 38, rot: 0, dur: 26 },
    { shape: 'circle', size: 26, x: 22, y: 66, rot: 0, dur: 32 },
    { shape: 'band', size: 120, x: 30, y: 82, rot: -14, dur: 38 },
    { shape: 'circle', size: 16, x: 82, y: 74, rot: 0, dur: 30 },
    { shape: 'rect', size: 30, x: 14, y: 22, rot: 18, dur: 34 },
    { shape: 'band', size: 70, x: 78, y: 14, rot: 24, dur: 29 }
  ],
  /* 条带构图（band）：三条大斜带 */
  [
    { shape: 'band', size: 150, x: 20, y: 30, rot: -22, dur: 30 },
    { shape: 'band', size: 110, x: 72, y: 58, rot: 14, dur: 36 },
    { shape: 'band', size: 80, x: 46, y: 84, rot: -8, dur: 42 },
    { shape: 'circle', size: 20, x: 84, y: 22, rot: 0, dur: 28 },
    { shape: 'rect', size: 24, x: 12, y: 62, rot: -30, dur: 33 }
  ],
  /* 巨石构图（monolith）：竖长矩形群 */
  [
    { shape: 'rect', size: 34, x: 24, y: 44, rot: -6, dur: 34 },
    { shape: 'rect', size: 28, x: 52, y: 60, rot: 8, dur: 30 },
    { shape: 'rect', size: 40, x: 78, y: 34, rot: -12, dur: 38 },
    { shape: 'circle', size: 44, x: 44, y: 24, rot: 0, dur: 26 },
    { shape: 'band', size: 90, x: 60, y: 88, rot: 10, dur: 44 }
  ],
  /* 框构图（frame）：大环 + 内块 */
  [
    { shape: 'ring', size: 66, x: 52, y: 42, rot: 0, dur: 40 },
    { shape: 'rect', size: 26, x: 50, y: 42, rot: 12, dur: 30 },
    { shape: 'circle', size: 22, x: 18, y: 30, rot: 0, dur: 27 },
    { shape: 'band', size: 100, x: 34, y: 78, rot: -18, dur: 35 },
    { shape: 'circle', size: 30, x: 84, y: 68, rot: 0, dur: 31 }
  ],
  /* 魅饰构图（charm）：散点小形群 */
  [
    { shape: 'circle', size: 34, x: 30, y: 30, rot: 0, dur: 28 },
    { shape: 'circle', size: 22, x: 70, y: 44, rot: 0, dur: 33 },
    { shape: 'circle', size: 16, x: 48, y: 70, rot: 0, dur: 25 },
    { shape: 'rect', size: 20, x: 80, y: 76, rot: 26, dur: 36 },
    { shape: 'rect', size: 26, x: 14, y: 66, rot: -16, dur: 31 },
    { shape: 'band', size: 80, x: 56, y: 16, rot: 20, dur: 39 },
    { shape: 'circle', size: 12, x: 88, y: 20, rot: 0, dur: 24 }
  ]
];

function temperaSeedNow() {
  try {
    if (typeof lyricCurrentCoverPaletteKey === 'function') {
      var k = lyricCurrentCoverPaletteKey();
      if (k) return String(k);
    }
  } catch (e) { }
  var title = document.getElementById('control-title-text');
  return 't:' + ((title && title.textContent) || '');
}

function temperaRebuildBlocks() {
  var field = document.getElementById('tempera-field');
  if (!field) return;
  var seed = temperaSeedNow();
  if (seed === temperaLastSeed && field.childElementCount) return;
  temperaLastSeed = seed;
  field.textContent = '';
  temperaBlocksDom = [];
  var compIdx = temperaHashString(seed) % TEMPERA_COMPOSITIONS.length;
  var comp = TEMPERA_COMPOSITIONS[compIdx];
  var palette = temperaPalette();
  /* 每色块离线渲染成一张柔边贴图（PBR 前·temperaCutout 思路）：模糊只发生一次
     （低分辨率画布 + canvas 放大），运行时零 GPU 模糊滤镜合成 */
  var frag = document.createDocumentFragment();
  for (var i = 0; i < comp.length; i++) {
    var spec = comp[i];
    var el = document.createElement('div');
    el.className = 'tempera-block is-' + spec.shape;
    var color = palette[i % palette.length];
    var sizeUnit = Math.max(window.innerWidth, window.innerHeight);
    var w = Math.max(40, spec.size / 100 * sizeUnit);
    var h = spec.shape === 'band' ? w * 0.3 : w;
    el.style.backgroundImage = 'url("' + temperaBlockSprite(spec.shape, color, w, h) + '")';
    el.style.backgroundSize = '100% 100%';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.left = spec.x + '%';
    el.style.top = spec.y + '%';
    el.style.transform = 'translate(-50%, -50%) rotate(' + spec.rot + 'deg)';
    el.style.animationDuration = spec.dur + 's';
    el.style.animationDelay = -(temperaHashString(seed + i) % 100) / 10 + 's';
    frag.appendChild(el);
    temperaBlocksDom.push(el);
  }
  field.appendChild(frag);
}

/* 离线烘焙柔边色块贴图：低分辨率（缩放 1/3.2）画纯色形 + 大高斯模糊（canvas filter），
   再以 dataURL 供 CSS 平铺——合成端只做一张纹理的缩放，零每帧模糊计算 */
var temperaSpriteCache = {};
function temperaBlockSprite(shape, color, w, h) {
  var key = shape + '|' + color + '|' + Math.round(w / 8) + '|' + Math.round(h / 8);
  var cached = temperaSpriteCache[key];
  if (cached) return cached;
  var scale = 1 / 3.2;
  var cw = Math.max(24, Math.round(w * scale));
  var ch = Math.max(24, Math.round(h * scale));
  var cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  var ctx = cv.getContext('2d');
  if (!ctx) return 'none';
  ctx.filter = 'blur(' + Math.max(6, Math.round(Math.min(cw, ch) * 0.4)) + 'px)';
  ctx.fillStyle = color;
  var pad = Math.min(cw, ch) * 0.26;
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(cw / 2, ch / 2, Math.min(cw, ch) / 2 - pad * 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'ring') {
    ctx.lineWidth = Math.max(4, Math.min(cw, ch) * 0.2);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cw / 2, ch / 2, Math.min(cw, ch) / 2 - ctx.lineWidth, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape === 'rect') {
    var rw = cw - pad * 2, rh = ch - pad * 2;
    ctx.fillRect(pad, pad, rw, rh);
  } else { /* band */
    ctx.fillRect(pad * 0.6, ch * 0.22, cw - pad * 1.2, ch * 0.56);
  }
  try {
    var url = cv.toDataURL('image/png');
    temperaSpriteCache[key] = url;
    return url;
  } catch (e) { return 'none'; }
}

/* 注册表 trimCache 钩子：退出凝彩后延迟调用，释放烘焙贴图 dataURL 常驻内存。
   重新进入时缓存缺失按 key 自然重建，无行为差异。 */
function trimTemperaSpriteCache() {
  temperaSpriteCache = {};
}

/* ---------- 能量驱动（副歌更实更亮） ---------- */

function temperaTickEnergy() {
  var energy = 0;
  try {
    if (typeof motionSignalGet === 'function') {
      var p = motionSignalGet('audioPower');
      if (typeof p === 'number' && isFinite(p)) energy = Math.min(1, p);
    }
  } catch (e) { }
  var lines = temperaLinesCache;
  var isChorus = temperaLastActiveIdx >= 0 && lines[temperaLastActiveIdx] && !!lines[temperaLastActiveIdx].isChorus;
  var key = energy.toFixed(2) + '|' + (isChorus ? 1 : 0);
  if (key === temperaLastEnergyKey) return;
  temperaLastEnergyKey = key;
  var overlay = document.getElementById('tempera-overlay');
  if (overlay) {
    overlay.style.setProperty('--tp-energy', (0.45 + energy * 0.4 + (isChorus ? 0.15 : 0)).toFixed(3));
  }
}

/* ---------- 歌词 ---------- */

function temperaNowTime() {
  try {
    return getAdjustedLyricPlaybackTime(typeof audio !== 'undefined' && audio ? (audio.currentTime || 0) : 0);
  } catch (e) { return 0; }
}

function temperaSetRow(id, line, isActive) {
  var el = document.getElementById('tempera-line-' + id);
  if (!el) return;
  var text = line ? String(line.text || '').trim() : '';
  if (el.dataset.text !== text) {
    el.dataset.text = text;
    el.textContent = text || '·';
  }
  el.classList.toggle('is-active', !!isActive);
}

function temperaRenderLines() {
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  temperaLinesCache = lines;
  var key = lines.length + '|' + (lines[0] ? lines[0].t : 0) + '|' + (lines.length ? lines[lines.length - 1].t : 0);
  var t = temperaNowTime();
  var idx = -1;
  try {
    if (typeof findStageLyricIndexAtTime === 'function') idx = findStageLyricIndexAtTime(t);
  } catch (e) { idx = -1; }
  if (idx === temperaLastActiveIdx && key === temperaLastLinesKey) return;
  temperaLastActiveIdx = idx;
  temperaLastLinesKey = key;
  temperaSetRow('prev', lines[idx - 1], false);
  temperaSetRow('main', lines[idx], true);
  temperaSetRow('next', lines[idx + 1], false);
  var trEl = document.getElementById('tempera-line-tr');
  if (trEl) {
    var cur = idx >= 0 ? lines[idx] : null;
    var tr = cur ? String(cur.translation || '').trim() : '';
    if (trEl.textContent !== tr) trEl.textContent = tr;
    trEl.classList.toggle('is-hidden', !tr);
  }
  /* 主行逐字 span（有 words 时） */
  var mainEl = document.getElementById('tempera-line-main');
  var cur = idx >= 0 ? lines[idx] : null;
  if (mainEl && cur && cur.words && cur.words.length) {
    mainEl.textContent = '';
    for (var w = 0; w < cur.words.length; w++) {
      var sp = document.createElement('span');
      sp.className = 'tempera-word';
      sp.textContent = cur.words[w].text;
      mainEl.appendChild(sp);
    }
  } else if (mainEl && mainEl.dataset.text && !mainEl.querySelector('.tempera-word')) {
    mainEl.textContent = mainEl.dataset.text;
  }
}

function temperaTickWords() {
  var lines = temperaLinesCache;
  var idx = temperaLastActiveIdx;
  if (idx < 0 || idx >= lines.length) return;
  var line = lines[idx];
  if (!line.words || !line.words.length) return;
  var mainEl = document.getElementById('tempera-line-main');
  if (!mainEl) return;
  var spans = mainEl.querySelectorAll('.tempera-word');
  var t = temperaNowTime();
  for (var k = 0; k < spans.length && k < line.words.length; k++) {
    var ws = Number(line.words[k].t) || Number(line.t) || 0;
    spans[k].classList.toggle('is-lit', t >= ws - 0.05);
  }
}

/* ---------- 底部字幕层（pixi 引擎模式：原版 VisualizerSubtitleOverlay 宿主职责接管）
   当前行（或刚完成行）的可读翻译轨道 → 无翻译时显示下一行预览（blur，原版
   upcoming 语义）。可读性判定同原版 hasReadableText（须含字母/数字，过滤
   "//"、"●●●" 等纯占位行）。容器带 pixi-host 豁免类：pixi-on 全局强隐规则
   只豁免 .pixi-host，非 pixi 模式自动隐藏（DOM 行栈版自带 #tempera-line-tr
   内嵌翻译，不需要此层）。 ---------- */
function temperaSubtitleReadable(text) {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

function temperaSubtitleUpdate() {
  var el = document.getElementById('tempera-subtitle');
  if (!el) return;
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var t = temperaNowTime();
  var idx = -1;
  try {
    if (typeof findStageLyricIndexAtTime === 'function') idx = findStageLyricIndexAtTime(t);
  } catch (e) { idx = -1; }
  var trText = '';
  for (var k = 0; k < 2 && idx - k >= 0; k++) {
    var line = lines[idx - k];
    var tr = line ? String(line.translation || '').trim() : '';
    if (temperaSubtitleReadable(tr)) { trText = tr; break; }
  }
  var previewText = '';
  if (!trText) {
    for (var j = idx + 1; j <= idx + 3 && j < lines.length; j++) {
      var nl = lines[j];
      var nt = nl ? String(nl.text || '').trim() : '';
      if (temperaSubtitleReadable(nt)) { previewText = nt; break; }
    }
  }
  var main = el.querySelector('.tempera-sub-main');
  var up = el.querySelector('.tempera-sub-up');
  if (!main || !up) return;
  if (trText) {
    main.textContent = trText;
    main.style.display = '';
    up.style.display = 'none';
    el.classList.add('has-line');
  } else if (previewText) {
    main.style.display = 'none';
    up.textContent = previewText;
    up.style.display = '';
    el.classList.add('has-line');
  } else {
    main.style.display = '';
    main.textContent = '';
    up.style.display = '';
    up.textContent = '';
    el.classList.remove('has-line');
  }
}

function temperaSubtitleClear() {
  var el = document.getElementById('tempera-subtitle');
  if (!el) return;
  el.classList.remove('has-line');
  var main = el.querySelector('.tempera-sub-main');
  var up = el.querySelector('.tempera-sub-up');
  if (main) main.textContent = '';
  if (up) up.textContent = '';
}

/* ---------- 生命周期 ---------- */

function startTempera() {
  /* 字号跟随「歌词大小」设置（--mfs，CSS 主行 clamp 乘算） */
  if (typeof applyOverlayModeFontScale === "function") applyOverlayModeFontScale(document.getElementById("tempera-overlay"));
  temperaLastSeed = '';
  temperaLastActiveIdx = -99;
  temperaLastLinesKey = '';
  temperaSyncTheme();
  /* 原版 Pixi 引擎优先；失败自动降级 DOM 版（原链路） */
  var boot = (typeof temperaPixiStart === 'function') ? temperaPixiStart() : Promise.resolve(false);
  boot.then(function (ok) {
    if (!temperaMode) { if (ok) temperaPixiStop(); return; }
    temperaUsePixi = !!ok;
    var ov = document.getElementById('tempera-overlay');
    if (ov) ov.classList.toggle('pixi-on', temperaUsePixi);
    if (temperaUsePixi) {
      (function ploop() {
        if (!temperaMode || !temperaUsePixi) return;
        temperaSyncTheme();   /* 字体变量 --tp-font 跟随（Pixi 底部字幕轨道用它） */
        var paused = !((typeof playing !== 'undefined') && playing);
        temperaSubtitleUpdate();
        /* 换歌/主题（含 fx.lyricFont 字体）/字号变化 → swapSong 热切换
           （字体跟随链路：27a temperaPixiSync 比对 themeKey） */
        if (typeof temperaPixiSync === 'function') temperaPixiSync();
        temperaPixiSetPaused(paused);
        temperaTimer = setTimeout(ploop, 700);
      })();
      return;
    }
    temperaRebuildBlocks();
    temperaRenderLines();
    temperaDomLoop();
  });
}

function temperaDomLoop() {
  (function loop() {
    if (!temperaMode || temperaUsePixi) return;
    if (temperaSyncTheme()) temperaRebuildBlocks();
    temperaRebuildBlocks();
    temperaRenderLines();
    temperaTickWords();
    temperaTickEnergy();
    temperaTimer = setTimeout(loop, 220);
  })();
}

function stopTempera() {
  if (temperaTimer) { clearTimeout(temperaTimer); temperaTimer = 0; }
  temperaUsePixi = false;
  if (typeof temperaPixiStop === 'function') temperaPixiStop();
  temperaSubtitleClear();
  var ov = document.getElementById('tempera-overlay');
  if (ov) ov.classList.remove('pixi-on');
}

function applyTemperaMode(on, opts) {
  opts = opts || {};
  temperaMode = !!on;
  if (temperaMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('tempera', { save: true });
  }
  document.body.classList.toggle('tempera', temperaMode);
  var overlay = document.getElementById('tempera-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', temperaMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(TEMPERA_STORE_KEY, temperaMode);
  if (temperaMode) {
    startTempera();
  } else {
    stopTempera();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(temperaMode ? '凝彩已开启' : '已切回标准模式');
}

function toggleTemperaMode() {
  applyTemperaMode(!temperaMode, { save: true, toast: true });
}

scheduleUiWarmTask ? scheduleUiWarmTask(function () {
  applyTemperaMode(temperaMode, { save: false });
}, 370) : setTimeout(function () {
  applyTemperaMode(temperaMode, { save: false });
}, 370);
