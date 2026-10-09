/* =========================================================================
   OrangeSea · 镜台（Diorama · 圆窗景深歌词）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0): src/components/visualizer/diorama/
     VisualizerDiorama.tsx（镜台概念）/ dioramaTextRaster.ts（glow 三层模糊
     叠加的字符辉光）/ dioramaMoteField.ts（尘埃粒子场）。
   -------------------------------------------------------------------------
   一面圆形镜台：圆窗内是模糊封面的景深世界（双环描边 + 径向光），窗外
   层叠错位的封面卡堆增强立体感。歌词是窗前的光字——当前行大字带三层
     柔光（dioramaTextRaster 的 drawShadowGlowText 配方：三层模糊叠加），
   上下行暗淡。尘埃粒子在窗内缓动漂浮（canvas 2D，bass 微驱）。副歌时
   窗内光晕增强（光台打亮）。主题跟随（窗环/光色/字色）。
   ========================================================================= */

var DIORAMA_STORE_KEY = 'orangesea-diorama-v1';
var dioramaMode = readBooleanPreference(DIORAMA_STORE_KEY, false);
var dioramaPrevQuality = null;
var dioramaTimer = 0;
var dioramaRafId = 0;
var dioramaCanvas = null;
var dioramaCtx = null;
var dioramaMotes = [];
var dioramaLastLinesKey = '';
var dioramaLastActiveIdx = -99;
var dioramaLastCover = null;
var dioramaLastThemeKey = '';
var dioramaLinesCache = [];

/* ---------- 主题（Folia theme 三色） ---------- */
var dioramaTheme = { primary: '#f4f0e8', accent: '#ffb98a', bg: '#0d0a08' };

function dioramaSyncTheme() {
  if (typeof themeServiceActiveTheme !== 'function') return false;
  var t = null;
  try { t = themeServiceActiveTheme(); } catch (e) { return false; }
  if (!t) return false;
  var key = (t.primaryColor || '') + '|' + (t.accentColor || '') + '|' + (t.backgroundColor || '');
  if (key === dioramaLastThemeKey) return false;
  dioramaLastThemeKey = key;
  if (t.primaryColor) dioramaTheme.primary = t.primaryColor;
  if (t.accentColor) dioramaTheme.accent = t.accentColor;
  if (t.backgroundColor) dioramaTheme.bg = t.backgroundColor;
  var overlay = document.getElementById('diorama-overlay');
  if (overlay) {
    overlay.style.setProperty('--dr-ink', dioramaTheme.primary);
    overlay.style.setProperty('--dr-accent', dioramaTheme.accent);
    overlay.style.setProperty('--dr-glow', dioramaTheme.accent);
  }
  return true;
}

/* ---------- 尘埃粒子场（dioramaMoteField 的 canvas 等价） ---------- */

function dioramaBuildMotes(w, h) {
  dioramaMotes = [];
  var count = 46;
  for (var i = 0; i < count; i++) {
    dioramaMotes.push({
      a: Math.random() * Math.PI * 2,          /* 轨道角 */
      r: 0.18 + Math.random() * 0.62,          /* 半径比例（圆窗内） */
      size: 0.8 + Math.random() * 2.2,
      speed: (0.02 + Math.random() * 0.05) * (Math.random() < 0.5 ? 1 : -1),
      drift: Math.random() * Math.PI * 2,
      alpha: 0.12 + Math.random() * 0.3,
      twinkle: 0.6 + Math.random() * 1.8
    });
  }
}

function dioramaDrawMotes(nowSec, bass) {
  var cv = dioramaCanvas, ctx = dioramaCtx;
  if (!cv || !ctx) return;
  var w = cv.clientWidth, h = cv.clientHeight;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var cw = Math.round(w * dpr), ch = Math.round(h * dpr);
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  var cx = w / 2, cy = h / 2;
  var R = Math.min(w, h) * 0.31;
  var ink = dioramaTheme.primary;
  for (var i = 0; i < dioramaMotes.length; i++) {
    var m = dioramaMotes[i];
    m.a += m.speed * 0.016;
    var wobble = Math.sin(nowSec * 0.5 + m.drift) * 0.045;
    var rr = R * (m.r + wobble + bass * 0.05);
    var x = cx + Math.cos(m.a) * rr;
    var y = cy + Math.sin(m.a) * rr * 0.86;    /* 轻微椭圆轨道 */
    var tw = 0.55 + 0.45 * Math.sin(nowSec * m.twinkle + m.drift);
    ctx.globalAlpha = m.alpha * tw;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(x, y, m.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---------- 歌词行（±1 窗口，三层柔光大字） ---------- */

function dioramaNowTime() {
  try {
    return getAdjustedLyricPlaybackTime(typeof audio !== 'undefined' && audio ? (audio.currentTime || 0) : 0);
  } catch (e) { return 0; }
}

function dioramaLinesKeyNow() {
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var first = lines[0], last = lines[lines.length - 1];
  return lines.length + '|' + (first ? first.t : 0) + '|' + (last ? last.t : 0);
}

function dioramaEnsureRow(id) {
  var host = document.getElementById('diorama-lyrics');
  if (!host) return null;
  var el = document.getElementById('diorama-line-' + id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'diorama-line';
    el.id = 'diorama-line-' + id;
    host.appendChild(el);
  }
  return el;
}

function dioramaSetRow(id, line, isActive, isChorus) {
  var el = dioramaEnsureRow(id);
  if (!el) return;
  var text = line ? String(line.text || '').trim() : '';
  if (el.dataset.text !== text) {
    el.dataset.text = text;
    el.textContent = text || '·';
  }
  el.classList.toggle('is-active', !!isActive);
  el.classList.toggle('is-chorus', !!isChorus && !!isActive);
  var tr = line ? String(line.translation || '').trim() : '';
  if (isActive) {
    var trEl = document.getElementById('diorama-line-tr');
    if (trEl) {
      if (trEl.textContent !== tr) trEl.textContent = tr;
      trEl.classList.toggle('is-hidden', !tr);
    }
  }
}

function dioramaRenderLines() {
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  dioramaLinesCache = lines;
  var t = dioramaNowTime();
  var idx = -1;
  try {
    if (typeof findStageLyricIndexAtTime === 'function') idx = findStageLyricIndexAtTime(t);
  } catch (e) { idx = -1; }
  if (idx === dioramaLastActiveIdx && dioramaLastLinesKey === dioramaLinesKeyNow()) return;
  dioramaLastActiveIdx = idx;
  dioramaLastLinesKey = dioramaLinesKeyNow();
  dioramaSetRow('prev', lines[idx - 1], false);
  dioramaSetRow('main', lines[idx], true, lines[idx] && lines[idx].isChorus);
  dioramaSetRow('next', lines[idx + 1], false);
}

/* ---------- 封面/副歌光台 ---------- */

function dioramaCoverNow() {
  if (typeof getControlCoverUrl === 'function') return getControlCoverUrl();
  return null;
}

function dioramaRefreshScene() {
  var cover = dioramaCoverNow();
  if (cover !== dioramaLastCover) {
    dioramaLastCover = cover;
    var win = document.getElementById('diorama-window-img');
    if (win) win.style.backgroundImage = cover ? 'url("' + cover + '")' : 'none';
    /* 层叠卡片：封面卡堆（无封面时隐藏） */
    var stack = document.getElementById('diorama-stack');
    if (stack) {
      var cards = stack.children;
      for (var i = 0; i < cards.length; i++) {
        cards[i].style.backgroundImage = cover ? 'url("' + cover + '")' : 'none';
      }
      stack.style.opacity = cover ? '' : '0';
    }
  }
}

function dioramaTickChorus() {
  var lines = dioramaLinesCache;
  var t = dioramaNowTime();
  var idx = dioramaLastActiveIdx;
  var isChorus = idx >= 0 && lines[idx] && !!lines[idx].isChorus;
  var overlay = document.getElementById('diorama-overlay');
  if (overlay) overlay.classList.toggle('is-chorus-glow', isChorus);
}

/* ---------- 主循环（rAF 满帧粒子 + 250ms 轮询歌词） ---------- */

var dioramaLastPoll = 0;
function dioramaFrame(now) {
  if (!dioramaMode) return;
  var nowSec = now / 1000;
  var bass = 0;
  try {
    if (typeof motionSignalGet === 'function') {
      var p = motionSignalGet('audioPower');
      if (typeof p === 'number' && isFinite(p)) bass = Math.min(1, p);
    }
  } catch (e) { }
  dioramaDrawMotes(nowSec, bass);
  if (now - dioramaLastPoll > 250) {
    dioramaLastPoll = now;
    dioramaSyncTheme();
    dioramaRefreshScene();
    dioramaRenderLines();
    dioramaTickChorus();
  }
  dioramaRafId = requestAnimationFrame(dioramaFrame);
}

/* ---------- 生命周期 ---------- */

function startDiorama() {
  dioramaCanvas = document.getElementById('diorama-motes');
  dioramaCtx = dioramaCanvas ? dioramaCanvas.getContext('2d') : null;
  dioramaBuildMotes(window.innerWidth, window.innerHeight);
  dioramaLastCover = null;
  dioramaLastActiveIdx = -99;
  dioramaLastLinesKey = '';
  dioramaSyncTheme();
  dioramaRefreshScene();
  dioramaRenderLines();
  dioramaRafId = requestAnimationFrame(dioramaFrame);
}

function stopDiorama() {
  if (dioramaRafId) { cancelAnimationFrame(dioramaRafId); dioramaRafId = 0; }
  if (dioramaTimer) { clearTimeout(dioramaTimer); dioramaTimer = 0; }
}

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
    if (typeof fx !== 'undefined' && fx && dioramaPrevQuality === null) {
      dioramaPrevQuality = fx.performanceQuality || 'balanced';
      fx.performanceQuality = 'eco';
    }
    startDiorama();
  } else {
    if (dioramaPrevQuality !== null && typeof fx !== 'undefined' && fx) {
      fx.performanceQuality = dioramaPrevQuality;
      dioramaPrevQuality = null;
    }
    stopDiorama();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(dioramaMode ? '镜台已开启' : '已切回标准模式');
}

function toggleDioramaMode() {
  applyDioramaMode(!dioramaMode, { save: true, toast: true });
}

scheduleUiWarmTask ? scheduleUiWarmTask(function () {
  applyDioramaMode(dioramaMode, { save: false });
}, 350) : setTimeout(function () {
  applyDioramaMode(dioramaMode, { save: false });
}, 350);
