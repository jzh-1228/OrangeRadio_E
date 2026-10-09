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
  if (typeof themeOverlayDarkTheme !== 'function') return;
  var t = null;
  try { t = themeOverlayDarkTheme(); } catch (e) { return; }
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

/* depth：0=当前行，负=已唱（向下沉），正=未唱（上方浮现）。
   stackOffsets：各行累计占高表（主行换行/内嵌翻译会加高），offsetY 按
   「到当前行的累计距离」排布而非固定 78px 栅格——换行长句不再压住邻句。 */
function sonnetRowStyle(depth, lineIndex, stackOffsets) {
  var u = sonnetSeededUnit('row' + lineIndex);
  var u2 = sonnetSeededUnit('col' + lineIndex);
  var rotate = (u - 0.5) * 3.4;                 /* ±1.7° 手稿错位 */
  var shiftX = (u2 - 0.5) * 34;
  var d = Math.abs(depth);
  var scale = depth === 0 ? 1 : Math.max(0.52, 0.86 - (d - 1) * 0.09);
  var opacity = depth === 0 ? 1 : Math.max(0.1, 0.5 - (d - 1) * 0.075);
  var offsetY;
  if (stackOffsets) {
    /* 累计模型：offsets[i] 为行 i 的半高（中心到边缘），相邻行间距 =
       自身半高 + 邻行半高 + 呼吸 18px；从 depth 0 向两侧累加 */
    var center = stackOffsets.center;
    var step = 0;
    for (var s2 = 1; s2 <= d; s2++) {
      var idxSide = depth > 0 ? (center - s2) : (center + s2);
      var prevSide = depth > 0 ? (center - s2 + 1) : (center + s2 - 1);
      var halfA = stackOffsets.half[idxSide] || 0;
      var halfB = stackOffsets.half[prevSide] || 0;
      step += halfA + halfB + 18;
    }
    offsetY = (depth > 0 ? -step : step) - d * d * 3.2;
  } else {
    offsetY = depth * 78 - d * d * 3.2;
  }
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
    row.dataset.lineIndex = String(lineIdx);
    row.dataset.plain = '';
    row.dataset.wordsKey = '';
    if (depth === 0) {
      /* 主行容器 + 翻译行内嵌（随主行移动，不再与行栈争位） */
      row.textContent = '';
      var main = document.createElement('span');
      main.className = 'sonnet-main';
      main.textContent = text || '·';
      row.appendChild(main);
      var trText = line ? String(line.translation || '').trim() : '';
      if (trText) {
        var trSpan = document.createElement('span');
        trSpan.className = 'sonnet-tr-inline';
        trSpan.textContent = trText;
        row.appendChild(trSpan);
      }
    } else {
      row.textContent = text || '·';
    }
    /* 换行时（唱过的新行入栈）加一次入场动画 */
    if (prevIdx !== -99 && idx !== prevIdx && depth === 0) {
      row.classList.remove('is-arriving');
      void row.offsetWidth;
      row.classList.add('is-arriving');
    }
    row.style.opacity = depth === 0 ? '1' : row.style.opacity;
    row.classList.toggle('is-active', depth === 0 && !!text);
    row.classList.toggle('is-chorus', depth === 0 && !!(line && line.isChorus));
  }

  /* 两遍布局：内容就位后实测各行高 → 累计占高模型定位
     （主行换行 ×2 高度、内嵌翻译再加高，固定栅格会压住邻句——用户实测 bug） */
  var half = Math.floor(SONNET_STACK_DEPTH / 2);
  var offsets = { center: half, half: [] };
  for (var m2 = 0; m2 < sonnetRows.length; m2++) {
    var rowH = sonnetRows[m2].getBoundingClientRect().height || 78;
    /* scale 缩小会等比缩视觉高度：栅格用「布局高度×scale」防缩放行间距过大 */
    var st0 = sonnetRowStyle(m2 - half, -1000 + m2, null);
    var scMatch = /scale\(([\d.]+)\)/.exec(st0.transform);
    var sc = scMatch ? parseFloat(scMatch[1]) : 1;
    offsets.half[m2] = (rowH * sc) / 2;
  }
  for (var s3 = 0; s3 < SONNET_STACK_DEPTH; s3++) {
    var depth2 = half - s3;
    var lineIdx2 = idx + depth2;
    var st = sonnetRowStyle(depth2, lineIdx2 >= 0 ? lineIdx2 : s3 - 99, offsets);
    sonnetRows[s3].style.transform = st.transform;
    sonnetRows[s3].style.opacity = st.opacity;
    sonnetRows[s3].style.filter = st.filter;
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
  var main = row.querySelector('.sonnet-main');
  if (!main) return;
  if (!words && row.dataset.plain !== text) {
    /* 无逐词数据：整行两态（唱到即亮） */
    row.dataset.plain = text;
    main.textContent = '';
    var span = document.createElement('span');
    span.className = 'sonnet-word';
    span.textContent = text;
    main.appendChild(span);
  }
  var spans = main.querySelectorAll('.sonnet-word');
  var t = sonnetNowTime();
  if (words && row.dataset.wordsKey !== String(idx)) {
    row.dataset.wordsKey = String(idx);
    main.textContent = '';
    for (var w = 0; w < words.length; w++) {
      var sp = document.createElement('span');
      sp.className = 'sonnet-word';
      sp.textContent = words[w].text;
      main.appendChild(sp);
    }
    spans = main.querySelectorAll('.sonnet-word');
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
  /* 字号跟随「歌词大小」设置（--mfs，CSS 主行 clamp 乘算） */
  if (typeof applyOverlayModeFontScale === "function") applyOverlayModeFontScale(document.getElementById("sonnet-overlay"));
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
    startSonnet();
  } else {
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
