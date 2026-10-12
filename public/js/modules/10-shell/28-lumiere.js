/* =========================================================================
   OrangeSea · 绘光（Lumiere · 霓虹光丝歌词）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0): src/components/visualizer/lumiere/
     light/lightFieldShader.ts + motes.ts + starfall.ts（光线场/星尘/星落）/
     VisualizerLumiere.tsx。
   -------------------------------------------------------------------------
   暗场光绘：几条长光丝沿贝塞尔弧线缓慢流动（双层描线近似辉光），光丝
   上缀着成串的光点随相位明灭；细小星尘缓慢上浮，偶有星落划过。副歌
   光丝增亮、星落加密。歌词居中大字柔光，逐字点亮（白→暖金）。主题
   跟随（光色 = accent/primary 变体）。canvas 2D 满帧 + 歌词 220ms 轮询。
   ========================================================================= */

var LUMIERE_STORE_KEY = 'orangesea-lumiere-v1';
var lumiereMode = readBooleanPreference(LUMIERE_STORE_KEY, false);
var lumiereTimer = 0;
var lumiereRafId = 0;
var lumiereCanvas = null;
var lumiereCtx = null;
var lumiereStrands = [];
var lumiereMotes = [];
var lumiereFalls = [];
var lumiereLastThemeKey = '';
var lumiereLastFontKey = '';
var lumiereLastLinesKey = '';
var lumiereLastActiveIdx = -99;
var lumiereLinesCache = [];
var lumiereTheme = { primary: '#f4efe4', accent: '#ffc998', secondary: '#8fb3d9' };

/* ---------- 主题 ---------- */
function lumiereSyncTheme() {
  /* 字体跟随（DOM 降级路径）：fx.lyricFont → --lu-font（Pixi 路径走 28a 桥主题） */
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  if (fontKey !== lumiereLastFontKey) {
    lumiereLastFontKey = fontKey;
    if (fontKey && typeof lyricFontStackForKey === 'function') {
      var fontOverlay = document.getElementById('lumiere-overlay');
      if (fontOverlay) fontOverlay.style.setProperty('--lu-font', lyricFontStackForKey(fontKey));
    }
  }
  if (typeof themeOverlayDarkTheme !== 'function') return;
  var t = null;
  try { t = themeOverlayDarkTheme(); } catch (e) { return; }
  if (!t) return;
  var key = (t.primaryColor || '') + '|' + (t.accentColor || '') + '|' + (t.secondaryColor || '');
  if (key === lumiereLastThemeKey) return;
  lumiereLastThemeKey = key;
  if (t.primaryColor) lumiereTheme.primary = t.primaryColor;
  if (t.accentColor) lumiereTheme.accent = t.accentColor;
  if (t.secondaryColor) lumiereTheme.secondary = t.secondaryColor;
  var overlay = document.getElementById('lumiere-overlay');
  if (overlay) {
    overlay.style.setProperty('--lu-ink', lumiereTheme.primary);
    overlay.style.setProperty('--lu-gold', lumiereTheme.accent);
  }
}

/* ---------- 光丝（lightField 的 canvas 等价：贝塞尔长曲线 + 相位流动） ---------- */

function lumiereBuildStrands() {
  lumiereStrands = [];
  var count = 4;
  for (var i = 0; i < count; i++) {
    lumiereStrands.push({
      y0: 0.18 + i * 0.22 + Math.random() * 0.06,       /* 基线（屏幕比例） */
      amp: 0.05 + Math.random() * 0.07,                 /* 振幅 */
      phase: Math.random() * Math.PI * 2,
      speed: 0.05 + Math.random() * 0.08,               /* 流速 */
      width: 1 + Math.random() * 1.4,
      alpha: 0.16 + Math.random() * 0.16,
      colorIdx: i % 3,
      dots: 6 + Math.floor(Math.random() * 5)           /* 沿丝光点串 */
    });
  }
  lumiereMotes = [];
  for (var m = 0; m < 42; m++) {
    lumiereMotes.push({
      x: Math.random(), y: Math.random(),
      size: 0.6 + Math.random() * 1.6,
      speed: 0.006 + Math.random() * 0.014,
      alpha: 0.1 + Math.random() * 0.25,
      tw: 0.5 + Math.random() * 1.6,
      ph: Math.random() * Math.PI * 2
    });
  }
  lumiereFalls = [];
}

function lumiereStrandY(s, xNorm, tSec) {
  return s.y0
    + Math.sin(xNorm * Math.PI * 2.2 + s.phase + tSec * s.speed) * s.amp
    + Math.sin(xNorm * Math.PI * 5.1 + s.phase * 2.0 - tSec * s.speed * 0.6) * s.amp * 0.3;
}

function lumiereColors() {
  return [lumiereTheme.accent, lumiereTheme.secondary, lumiereTheme.primary];
}

function lumiereSpawnFall(isChorus) {
  if (lumiereFalls.length > (isChorus ? 5 : 3)) return;
  lumiereFalls.push({
    x: 0.15 + Math.random() * 0.7,
    y: -0.05,
    vx: (Math.random() - 0.5) * 0.05,
    vy: 0.1 + Math.random() * 0.12,
    life: 0,
    maxLife: 1.2 + Math.random() * 0.8,
    size: 1 + Math.random() * 1.6
  });
}

function lumiereDraw(tSec, power, isChorus) {
  var cv = lumiereCanvas, ctx = lumiereCtx;
  if (!cv || !ctx) return;
  var w = cv.clientWidth, h = cv.clientHeight;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var cw = Math.round(w * dpr), ch = Math.round(h * dpr);
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  var colors = lumiereColors();
  var boost = 1 + power * 0.5 + (isChorus ? 0.35 : 0);

  /* 光丝：双层描线（外层宽而淡 + 内层细而亮 ≈ glow） */
  for (var si = 0; si < lumiereStrands.length; si++) {
    var s = lumiereStrands[si];
    var color = colors[s.colorIdx];
    var steps = 46;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var k = 0; k <= steps; k++) {
      var xn = k / steps;
      var y = lumiereStrandY(s, xn, tSec);
      var px = xn * w, py = y * h;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = s.alpha * 0.5 * boost;
    ctx.lineWidth = s.width * 5;
    ctx.stroke();
    ctx.globalAlpha = Math.min(1, s.alpha * 1.6 * boost);
    ctx.lineWidth = s.width;
    ctx.stroke();

    /* 沿丝光点串（成串明灭） */
    for (var d = 0; d < s.dots; d++) {
      var dxn = ((d / s.dots) + tSec * s.speed * 0.24) % 1;
      var dy = lumiereStrandY(s, dxn, tSec);
      var tw = 0.35 + 0.65 * Math.abs(Math.sin(tSec * 1.6 + d * 1.7 + s.phase));
      ctx.globalAlpha = Math.min(1, s.alpha * 2.4 * tw * boost);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(dxn * w, dy * h, 1.4 + tw * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* 上浮星尘（motes） */
  var ink = lumiereTheme.primary;
  for (var mi = 0; mi < lumiereMotes.length; mi++) {
    var mo = lumiereMotes[mi];
    mo.y -= mo.speed * 0.016;
    if (mo.y < -0.02) { mo.y = 1.02; mo.x = Math.random(); }
    var mtw = 0.5 + 0.5 * Math.sin(tSec * mo.tw + mo.ph);
    ctx.globalAlpha = mo.alpha * mtw;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(mo.x * w, mo.y * h, mo.size, 0, Math.PI * 2);
    ctx.fill();
  }

  /* 星落（starfall） */
  if (Math.random() < 0.006 + power * 0.01 + (isChorus ? 0.01 : 0)) lumiereSpawnFall(isChorus);
  for (var fi = lumiereFalls.length - 1; fi >= 0; fi--) {
    var f = lumiereFalls[fi];
    f.life += 0.016;
    if (f.life > f.maxLife) { lumiereFalls.splice(fi, 1); continue; }
    f.x += f.vx * 0.016;
    f.y += f.vy * 0.016;
    var fade = 1 - f.life / f.maxLife;
    var fx = f.x * w, fy = f.y * h;
    ctx.globalAlpha = 0.85 * fade;
    ctx.strokeStyle = lumiereTheme.accent;
    ctx.lineWidth = f.size;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx - f.vx * w * 0.55, fy - f.vy * h * 0.55);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ---------- 歌词 ---------- */

function lumiereNowTime() {
  try {
    return getAdjustedLyricPlaybackTime(typeof audio !== 'undefined' && audio ? (audio.currentTime || 0) : 0);
  } catch (e) { return 0; }
}

function lumiereSetRow(id, line, isActive) {
  var el = document.getElementById('lumiere-line-' + id);
  if (!el) return;
  var text = line ? String(line.text || '').trim() : '';
  if (el.dataset.text !== text) {
    el.dataset.text = text;
    el.textContent = text || '·';
  }
  el.classList.toggle('is-active', !!isActive);
}

function lumiereRenderLines() {
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  lumiereLinesCache = lines;
  var key = lines.length + '|' + (lines[0] ? lines[0].t : 0) + '|' + (lines.length ? lines[lines.length - 1].t : 0);
  var t = lumiereNowTime();
  var idx = -1;
  try {
    if (typeof findStageLyricIndexAtTime === 'function') idx = findStageLyricIndexAtTime(t);
  } catch (e) { idx = -1; }
  if (idx === lumiereLastActiveIdx && key === lumiereLastLinesKey) return;
  lumiereLastActiveIdx = idx;
  lumiereLastLinesKey = key;
  lumiereSetRow('prev', lines[idx - 1], false);
  lumiereSetRow('main', lines[idx], true);
  lumiereSetRow('next', lines[idx + 1], false);
  var trEl = document.getElementById('lumiere-line-tr');
  if (trEl) {
    var cur = idx >= 0 ? lines[idx] : null;
    var tr = cur ? String(cur.translation || '').trim() : '';
    if (trEl.textContent !== tr) trEl.textContent = tr;
    trEl.classList.toggle('is-hidden', !tr);
  }
  /* 主行逐字 span */
  var mainEl = document.getElementById('lumiere-line-main');
  var cur2 = idx >= 0 ? lines[idx] : null;
  if (mainEl && cur2 && cur2.words && cur2.words.length) {
    mainEl.textContent = '';
    for (var w = 0; w < cur2.words.length; w++) {
      var sp = document.createElement('span');
      sp.className = 'lumiere-word';
      sp.textContent = cur2.words[w].text;
      mainEl.appendChild(sp);
    }
  } else if (mainEl && mainEl.dataset.text && !mainEl.querySelector('.lumiere-word')) {
    mainEl.textContent = mainEl.dataset.text;
  }
}

function lumiereTickWords() {
  var lines = lumiereLinesCache;
  var idx = lumiereLastActiveIdx;
  if (idx < 0 || idx >= lines.length) return;
  var line = lines[idx];
  if (!line.words || !line.words.length) return;
  var mainEl = document.getElementById('lumiere-line-main');
  if (!mainEl) return;
  var spans = mainEl.querySelectorAll('.lumiere-word');
  var t = lumiereNowTime();
  for (var k = 0; k < spans.length && k < line.words.length; k++) {
    var ws = Number(line.words[k].t) || Number(line.t) || 0;
    spans[k].classList.toggle('is-lit', t >= ws - 0.05);
  }
}

/* ---------- 底部字幕层（pixi 引擎模式：原版 VisualizerSubtitleOverlay 宿主职责接管）
   当前行（或刚完成行）的可读翻译轨道 → 无翻译时显示下一行预览（blur，原版
   upcoming 语义）。可读性判定同原版 hasReadableText（须含字母/数字，过滤
   "//"、"●●●" 等纯占位行）。容器带 pixi-host 豁免类：pixi-on 全局强隐规则
   只豁免 .pixi-host，非 pixi 模式自动隐藏（DOM 行栈版自带 #lumiere-line-tr
   内嵌翻译，不需要此层）。 ---------- */
function lumiereSubtitleReadable(text) {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

function lumiereSubtitleUpdate() {
  var el = document.getElementById('lumiere-subtitle');
  if (!el) return;
  var lines = (lumiereLinesCache && lumiereLinesCache.length) ? lumiereLinesCache
    : ((typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : []);
  var t = lumiereNowTime();
  var idx = -1;
  try {
    if (typeof findStageLyricIndexAtTime === 'function') idx = findStageLyricIndexAtTime(t);
  } catch (e) { idx = -1; }
  var trText = '';
  for (var k = 0; k < 2 && idx - k >= 0; k++) {
    var line = lines[idx - k];
    var tr = line ? String(line.translation || '').trim() : '';
    if (lumiereSubtitleReadable(tr)) { trText = tr; break; }
  }
  var previewText = '';
  if (!trText) {
    for (var j = idx + 1; j <= idx + 3 && j < lines.length; j++) {
      var nl = lines[j];
      var nt = nl ? String(nl.text || '').trim() : '';
      if (lumiereSubtitleReadable(nt)) { previewText = nt; break; }
    }
  }
  var main = el.querySelector('.lumiere-sub-main');
  var up = el.querySelector('.lumiere-sub-up');
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

function lumiereSubtitleClear() {
  var el = document.getElementById('lumiere-subtitle');
  if (!el) return;
  el.classList.remove('has-line');
  var main = el.querySelector('.lumiere-sub-main');
  var up = el.querySelector('.lumiere-sub-up');
  if (main) main.textContent = '';
  if (up) up.textContent = '';
}

/* ---------- 主循环 ---------- */

var lumiereLastPoll = 0;
var lumiereIsChorus = false;
/* DOM 降级版运行时的引擎自愈重试节流（每 8s 一次，桥内另有指数退避判定） */
var LUMIERE_DOM_RETRY_MS = 8000;
var lumiereLastPixiRetry = 0;
function lumiereFrame(now) {
  if (!lumiereMode) return;
  var tSec = now / 1000;
  var power = 0;
  try {
    if (typeof motionSignalGet === 'function') {
      var p = motionSignalGet('audioPower');
      if (typeof p === 'number' && isFinite(p)) power = Math.min(1, p);
    }
  } catch (e) { }
  lumiereDraw(tSec, power, lumiereIsChorus);
  if (now - lumiereLastPoll > 220) {
    lumiereLastPoll = now;
    lumiereSyncTheme();
    lumiereRenderLines();
    lumiereTickWords();
    var lines = lumiereLinesCache;
    lumiereIsChorus = lumiereLastActiveIdx >= 0 && lines[lumiereLastActiveIdx] && !!lines[lumiereLastActiveIdx].isChorus;
    var overlay = document.getElementById('lumiere-overlay');
    if (overlay) overlay.classList.toggle('is-chorus', lumiereIsChorus);
  }
  /* 引擎自愈：DOM 降级不是终点——暂时性创建失败（如 WebGL 上下文被占）退避
     窗口过后重试，成功则停 DOM 循环、切回原版引擎（原版接管是唯一主路径） */
  if (now - lumiereLastPixiRetry > LUMIERE_DOM_RETRY_MS) {
    lumiereLastPixiRetry = now;
    if (typeof lumierePixiStart === 'function') {
      lumierePixiStart().then(function (ok) {
        if (ok && lumiereMode && !lumiereUsePixi) {
          lumiereDomStop();
          lumiereAdoptPixi();
        }
      });
    }
  }
  lumiereRafId = requestAnimationFrame(lumiereFrame);
}

/* ---------- 生命周期 ---------- */

var lumiereUsePixi = false;   /* 原版 Pixi 引擎接管（false = canvas 版降级） */

/* Pixi 引擎接管：pixi-on 打开（DOM 版元素经全局强隐规则让位）、启动轻量同步
   循环——换歌/主题/元数据 swapSong + setSongMetadata（原版热切换语义）+
   暂停跟随 + 底部字幕翻译轨道。 */
function lumiereAdoptPixi() {
  lumiereUsePixi = true;
  var ov = document.getElementById('lumiere-overlay');
  if (ov) ov.classList.add('pixi-on');
  lumiereSubtitleUpdate();
  (function ploop() {
    if (!lumiereMode || !lumiereUsePixi) return;
    lumiereSyncTheme();   /* 字体变量 --lu-font 跟随（Pixi 底部字幕轨道用它） */
    if (typeof lumierePixiSync === 'function') lumierePixiSync();
    lumiereSubtitleUpdate();
    lumierePixiSetPaused(!((typeof playing !== 'undefined') && playing));
    setTimeout(ploop, 700);
  })();
}

/* DOM 降级版循环停止（自愈切换到引擎时用；引擎侧清理由 lumierePixiStop 负责） */
function lumiereDomStop() {
  if (lumiereRafId) { cancelAnimationFrame(lumiereRafId); lumiereRafId = 0; }
}

function startLumiere() {
  /* 字号跟随「歌词大小」设置（--mfs，CSS 主行 clamp 乘算） */
  if (typeof applyOverlayModeFontScale === "function") applyOverlayModeFontScale(document.getElementById("lumiere-overlay"));
  /* 原版 Pixi 引擎优先；失败（退避窗口内）自动降级 canvas 版并周期自愈重试 */
  var boot = (typeof lumierePixiStart === 'function') ? lumierePixiStart() : Promise.resolve(false);
  boot.then(function (ok) {
    if (!lumiereMode) { if (ok) lumierePixiStop(); return; }
    if (ok) { lumiereAdoptPixi(); return; }
    lumiereLastPixiRetry = performance.now();
    lumiereDomStart();
  });
}

function lumiereDomStart() {
  lumiereCanvas = document.getElementById('lumiere-canvas');
  lumiereCtx = lumiereCanvas ? lumiereCanvas.getContext('2d') : null;
  lumiereBuildStrands();
  lumiereLastActiveIdx = -99;
  lumiereLastLinesKey = '';
  lumiereSyncTheme();
  lumiereRenderLines();
  lumiereRafId = requestAnimationFrame(lumiereFrame);
}

function stopLumiere() {
  lumiereDomStop();
  if (lumiereTimer) { clearTimeout(lumiereTimer); lumiereTimer = 0; }
  lumiereUsePixi = false;
  if (typeof lumierePixiStop === 'function') lumierePixiStop();
  lumiereSubtitleClear();
  var ov = document.getElementById('lumiere-overlay');
  if (ov) ov.classList.remove('pixi-on');
}

function applyLumiereMode(on, opts) {
  opts = opts || {};
  lumiereMode = !!on;
  if (lumiereMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('lumiere', { save: true });
  }
  document.body.classList.toggle('lumiere', lumiereMode);
  var overlay = document.getElementById('lumiere-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', lumiereMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(LUMIERE_STORE_KEY, lumiereMode);
  if (lumiereMode) {
    startLumiere();
  } else {
    stopLumiere();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(lumiereMode ? '绘光已开启' : '已切回标准模式');
}

function toggleLumiereMode() {
  applyLumiereMode(!lumiereMode, { save: true, toast: true });
}

scheduleUiWarmTask ? scheduleUiWarmTask(function () {
  applyLumiereMode(lumiereMode, { save: false });
}, 380) : setTimeout(function () {
  applyLumiereMode(lumiereMode, { save: false });
}, 380);
