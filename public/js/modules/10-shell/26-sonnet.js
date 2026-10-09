/* =========================================================================
   OrangeSea · 商籁（Sonnet · 聚光灯诗稿歌词）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0): src/components/visualizer/sonnet/
     VisualizerSonnet.tsx（剧场概念）/ sonnetCredits.ts（诗稿层叠随机错位）/
     sonnetCameraTracking.ts（聚光呼吸）。
   -------------------------------------------------------------------------
   一座剧场聚光灯：中央圆形光台（accent 暖光 + 幕布放射）+ 底部光束。
   歌词是层叠的诗稿——当前行大字居中逐字点亮（白→accent 金），已唱行
   按行索引种子随机旋转/错位缩小沉入手稿堆，未唱行淡入浮现。行栈固定
   深（最多 7 层可见），像一叠翻动的手写诗稿。主题跟随。
   ========================================================================= */

var SONNET_STORE_KEY = 'orangesea-sonnet-v1';
var sonnetMode = readBooleanPreference(SONNET_STORE_KEY, false);
var sonnetPrevQuality = null;
var sonnetTimer = 0;
var sonnetRows = [];                 /* DOM 行栈（复用，最多 7） */
var sonnetLastLinesKey = '';
var sonnetLastActiveIdx = -99;
var sonnetLastThemeKey = '';
var sonnetLinesCache = [];
var SONNET_STACK_DEPTH = 7;

/* ---------- 主题 ---------- */
var sonnetTheme = { primary: '#f6efe2', accent: '#ffcf9e', bg: '#0c0907' };

function sonnetSyncTheme() {
  if (typeof themeServiceActiveTheme !== 'function') return;
  var t = null;
  try { t = themeServiceActiveTheme(); } catch (e) { return; }
  if (!t) return;
  var key = (t.primaryColor || '') + '|' + (t.accentColor || '') + '|' + (t.backgroundColor || '');
  if (key === sonnetLastThemeKey) return;
  sonnetLastThemeKey = key;
  if (t.primaryColor) sonnetTheme.primary = t.primaryColor;
  if (t.accentColor) sonnetTheme.accent = t.accentColor;
  if (t.backgroundColor) sonnetTheme.bg = t.backgroundColor;
  var overlay = document.getElementById('sonnet-overlay');
  if (overlay) {
    overlay.style.setProperty('--sn-ink', sonnetTheme.primary);
    overlay.style.setProperty('--sn-gold', sonnetTheme.accent);
  }
}

/* ---------- 行栈几何（手稿堆：随机旋转/错位按行种子） ---------- */

function sonnetHashString(input) {
  var hash = 2166136261;
  input = String(input);
  for (var i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sonnetSeededUnit(seed) {
  return sonnetHashString(String(seed)) / 0xffffffff;
}

/* depth：0=当前行，负=已唱（向下沉），正=未唱（上方浮现） */
function sonnetRowStyle(depth, lineIndex) {
  var u = sonnetSeededUnit('row' + lineIndex);
  var u2 = sonnetSeededUnit('col' + lineIndex);
  var rotate = (u - 0.5) * 3.4;                 /* ±1.7° 手稿错位 */
  var shiftX = (u2 - 0.5) * 34;
  var d = Math.abs(depth);
  var scale = depth === 0 ? 1 : Math.max(0.52, 0.86 - (d - 1) * 0.09);
  var opacity = depth === 0 ? 1 : Math.max(0.1, 0.5 - (d - 1) * 0.075);
  var offsetY = depth * 44 - d * d * 3.2;
  var blur = depth === 0 ? 0 : Math.min(3.2, 0.6 + (d - 1) * 0.55);
  return {
    transform: 'translate(-50%,0) translateX(' + (shiftX * (depth === 0 ? 0.2 : 1)).toFixed(1) + 'px) translateY(' + offsetY.toFixed(1) + 'px) rotate(' + rotate.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')',
    opacity: opacity.toFixed(3),
    filter: blur > 0.05 ? 'blur(' + blur.toFixed(2) + 'px)' : 'none'
  };
}

/* ---------- 歌词渲染 ---------- */

function sonnetNowTime() {
  try {
    return getAdjustedLyricPlaybackTime(typeof audio !== 'undefined' && audio ? (audio.currentTime || 0) : 0);
  } catch (e) { return 0; }
}

function sonnetEnsureStack() {
  var host = document.getElementById('sonnet-stack');
  if (!host) return false;
  if (sonnetRows.length === SONNET_STACK_DEPTH) return true;
  sonnetRows = [];
  for (var i = 0; i < SONNET_STACK_DEPTH; i++) {
    var row = document.createElement('div');
    row.className = 'sonnet-line';
    host.appendChild(row);
    sonnetRows.push(row);
  }
  return true;
}

function sonnetRenderLines() {
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  sonnetLinesCache = lines;
  var key = lines.length + '|' + (lines[0] ? lines[0].t : 0) + '|' + (lines.length ? lines[lines.length - 1].t : 0);
  if (!sonnetEnsureStack()) return;
  var t = sonnetNowTime();
  var idx = -1;
  try {
    if (typeof findStageLyricIndexAtTime === 'function') idx = findStageLyricIndexAtTime(t);
  } catch (e) { idx = -1; }
  if (idx === sonnetLastActiveIdx && key === sonnetLastLinesKey) return;
  var prevIdx = sonnetLastActiveIdx;
  sonnetLastActiveIdx = idx;
  sonnetLastLinesKey = key;

  /* 行栈中点对当前行：上半未唱（depth 正），下半已唱（depth 负） */
  var half = Math.floor(SONNET_STACK_DEPTH / 2);
  for (var s = 0; s < SONNET_STACK_DEPTH; s++) {
    var depth = half - s;                        /* 栈顶（s=0）是未来最远行 */
    var lineIdx = idx + depth;
    var row = sonnetRows[s];
    var line = (lineIdx >= 0 && lineIdx < lines.length) ? lines[lineIdx] : null;
    var text = line ? String(line.text || '').trim() : '';
    row.textContent = text || '·';
    row.dataset.lineIndex = String(lineIdx);
    /* 换行时（唱过的新行入栈）加一次入场动画 */
    if (prevIdx !== -99 && idx !== prevIdx && depth === 0) {
      row.classList.remove('is-arriving');
      void row.offsetWidth;
      row.classList.add('is-arriving');
    }
    var st = sonnetRowStyle(depth, lineIdx >= 0 ? lineIdx : s - 99);
    row.style.transform = st.transform;
    row.style.opacity = st.opacity;
    row.style.filter = st.filter;
    row.classList.toggle('is-active', depth === 0 && !!text);
    row.classList.toggle('is-chorus', depth === 0 && !!(line && line.isChorus));
  }
  /* 翻译行 */
  var trEl = document.getElementById('sonnet-line-tr');
  if (trEl) {
    var cur = idx >= 0 ? lines[idx] : null;
    var tr = cur ? String(cur.translation || '').trim() : '';
    if (trEl.textContent !== tr) trEl.textContent = tr;
    trEl.classList.toggle('is-hidden', !tr);
  }
}

/* ---------- 逐字点亮（当前行内 words 时间轴 → span） ---------- */

function sonnetTickWords() {
  var lines = sonnetLinesCache;
  var idx = sonnetLastActiveIdx;
  if (idx < 0 || idx >= lines.length) return;
  var line = lines[idx];
  var row = null;
  for (var s = 0; s < sonnetRows.length; s++) {
    if (Number(sonnetRows[s].dataset.lineIndex) === idx) { row = sonnetRows[s]; break; }
  }
  if (!row || !row.classList.contains('is-active')) return;
  var words = line.words && line.words.length ? line.words : null;
  var text = String(line.text || '');
  if (!words && row.dataset.plain !== text) {
    /* 无逐词数据：整行两态（唱到即亮） */
    row.dataset.plain = text;
    row.textContent = '';
    var span = document.createElement('span');
    span.className = 'sonnet-word';
    span.textContent = text;
    row.appendChild(span);
  }
  var spans = row.querySelectorAll('.sonnet-word');
  var t = sonnetNowTime();
  if (words && row.dataset.wordsKey !== String(idx)) {
    row.dataset.wordsKey = String(idx);
    row.textContent = '';
    for (var w = 0; w < words.length; w++) {
      var sp = document.createElement('span');
      sp.className = 'sonnet-word';
      sp.textContent = words[w].text;
      row.appendChild(sp);
    }
    spans = row.querySelectorAll('.sonnet-word');
  }
  for (var k = 0; k < spans.length && words; k++) {
    var ws = Number(words[k].t) || Number(line.t) || 0;
    spans[k].classList.toggle('is-lit', t >= ws - 0.05);
  }
  if (!words && spans.length === 1) {
    spans[0].classList.toggle('is-lit', t >= (Number(line.t) || 0) - 0.05);
  }
}

/* ---------- 生命周期 ---------- */

function startSonnet() {
  sonnetLastActiveIdx = -99;
  sonnetLastLinesKey = '';
  sonnetSyncTheme();
  sonnetRenderLines();
  (function loop() {
    if (!sonnetMode) return;
    sonnetSyncTheme();
    sonnetRenderLines();
    sonnetTickWords();
    sonnetTimer = setTimeout(loop, 220);
  })();
}

function stopSonnet() {
  if (sonnetTimer) { clearTimeout(sonnetTimer); sonnetTimer = 0; }
  var host = document.getElementById('sonnet-stack');
  if (host) host.textContent = '';
  sonnetRows = [];
}

function applySonnetMode(on, opts) {
  opts = opts || {};
  sonnetMode = !!on;
  if (sonnetMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('sonnet', { save: true });
  }
  document.body.classList.toggle('sonnet', sonnetMode);
  var overlay = document.getElementById('sonnet-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', sonnetMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(SONNET_STORE_KEY, sonnetMode);
  if (sonnetMode) {
    if (typeof fx !== 'undefined' && fx && sonnetPrevQuality === null) {
      sonnetPrevQuality = fx.performanceQuality || 'balanced';
      fx.performanceQuality = 'eco';
    }
    startSonnet();
  } else {
    if (sonnetPrevQuality !== null && typeof fx !== 'undefined' && fx) {
      fx.performanceQuality = sonnetPrevQuality;
      sonnetPrevQuality = null;
    }
    stopSonnet();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(sonnetMode ? '商籁已开启' : '已切回标准模式');
}

function toggleSonnetMode() {
  applySonnetMode(!sonnetMode, { save: true, toast: true });
}

scheduleUiWarmTask ? scheduleUiWarmTask(function () {
  applySonnetMode(sonnetMode, { save: false });
}, 360) : setTimeout(function () {
  applySonnetMode(sonnetMode, { save: false });
}, 360);
