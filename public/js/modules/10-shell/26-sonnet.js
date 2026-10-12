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
var sonnetLastFontKey = '';
var sonnetLinesCache = [];
var SONNET_STACK_DEPTH = 7;
var sonnetUsePixi = false;   /* 原版 Pixi 引擎接管渲染（false = DOM 版降级） */
var sonnetLastChorus = false;

/* ---------- 主题 ---------- */
var sonnetTheme = { primary: '#f6efe2', accent: '#ffcf9e', bg: '#0c0907' };

function sonnetSyncTheme() {
  /* 字体跟随（DOM 降级路径）：fx.lyricFont → --sn-font（Pixi 路径走 26a 桥主题） */
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  if (fontKey !== sonnetLastFontKey) {
    sonnetLastFontKey = fontKey;
    if (fontKey && typeof lyricFontStackForKey === 'function') {
      var fontOverlay = document.getElementById('sonnet-overlay');
      if (fontOverlay) fontOverlay.style.setProperty('--sn-font', lyricFontStackForKey(fontKey));
    }
  }
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

/* ---------- 底部字幕层（pixi 引擎模式：原版 VisualizerSubtitleOverlay 宿主职责接管）
   当前行（或刚完成行）的可读翻译轨道 → 无翻译时显示下一行预览（blur，原版
   upcoming 语义）。可读性判定同原版 hasReadableText（须含字母/数字，过滤
   "//"、"●●●" 等纯占位行）。容器带 pixi-host 豁免类：pixi-on 全局强隐规则
   （index.css 10579）只豁免 .pixi-host，非 pixi 模式自动隐藏（DOM 行栈版自带
   内嵌翻译，不需要此层）。 ---------- */
function sonnetSubtitleReadable(text) {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

function sonnetSubtitleUpdate() {
  var el = document.getElementById('sonnet-subtitle');
  if (!el) return;
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var t = sonnetNowTime();
  var idx = -1;
  try {
    if (typeof findStageLyricIndexAtTime === 'function') idx = findStageLyricIndexAtTime(t);
  } catch (e) { idx = -1; }
  var trText = '';
  for (var k = 0; k < 2 && idx - k >= 0; k++) {
    var line = lines[idx - k];
    var tr = line ? String(line.translation || '').trim() : '';
    if (sonnetSubtitleReadable(tr)) { trText = tr; break; }
  }
  var previewText = '';
  if (!trText) {
    for (var j = idx + 1; j <= idx + 3 && j < lines.length; j++) {
      var nl = lines[j];
      var nt = nl ? String(nl.text || '').trim() : '';
      if (sonnetSubtitleReadable(nt)) { previewText = nt; break; }
    }
  }
  var main = el.querySelector('.sonnet-sub-main');
  var up = el.querySelector('.sonnet-sub-up');
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

function sonnetSubtitleClear() {
  var el = document.getElementById('sonnet-subtitle');
  if (!el) return;
  el.classList.remove('has-line');
  var main = el.querySelector('.sonnet-sub-main');
  var up = el.querySelector('.sonnet-sub-up');
  if (main) main.textContent = '';
  if (up) up.textContent = '';
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
    /* 原版 resolveSonnetFlowGaps：stackGap = max(24, fontPx×0.35×1.35) */
    var gap = stackOffsets.gap || 24;
    var step = 0;
    for (var s2 = 1; s2 <= d; s2++) {
      var idxSide = depth > 0 ? (center - s2) : (center + s2);
      var prevSide = depth > 0 ? (center - s2 + 1) : (center + s2 - 1);
      var halfA = stackOffsets.half[idxSide] || 0;
      var halfB = stackOffsets.half[prevSide] || 0;
      step += halfA + halfB + gap;
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

  /* 副歌光台（原版 chorus 光强调升档）：当前行 isChorus → 聚光灯转暖转亮、
     光束增强；主歌回落。CSS 侧经 --sn-chorus（0/1 渐变过渡）消费。 */
  var curLine = (idx >= 0 && idx < sonnetLinesCache.length) ? sonnetLinesCache[idx] : null;
  var chorus = !!(curLine && curLine.isChorus);
  if (chorus !== sonnetLastChorus) {
    sonnetLastChorus = chorus;
    var snOv = document.getElementById('sonnet-overlay');
    if (snOv) {
      snOv.style.setProperty('--sn-chorus', chorus ? '1' : '0');
      snOv.classList.toggle('is-chorus-show', chorus);
    }
  }

  /* 两遍布局：内容就位后实测各行高 → 累计占高模型定位
     （主行换行 ×2 高度、内嵌翻译再加高，固定栅格会压住邻句——用户实测 bug） */
  var half = Math.floor(SONNET_STACK_DEPTH / 2);
  /* 原版 stackGap 公式：按当前主行实际字号（--mfs 联动后）计算 */
  var fontPx = parseFloat(getComputedStyle(sonnetRows[half] || document.body).fontSize) || 42;
  var stackGap = Math.max(24, fontPx * 0.35 * 1.35);
  var offsets = { center: half, half: [], gap: stackGap };
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
  /* 唱词进度（镜头 zoom 数据源）：当前行时间跨度内 0→1 */
  var spanT = Math.max(0.4, (Number(line.duration) || 0) || 3);
  sonnetCamera.lineProgress = Math.max(0, Math.min(1, (t - (Number(line.t) || 0)) / spanT));
}

/* ---------- 镜边装饰线稿（原版 9 族 ShotMg 简化：4 族 CSS 线稿）----------
   歌曲种子选族与摆位；SVG 描边生长（dashoffset），只在进歌时重绘一次。 */
var sonnetDecorSongKey = null;
function sonnetRenderDecor() {
  var host = document.getElementById('sonnet-decor');
  if (!host) return;
  var songKey = '';
  try { songKey = String(lyricCurrentCoverPaletteKey ? lyricCurrentCoverPaletteKey() : currentIdx || 0); } catch (e) { songKey = '0'; }
  if (songKey === sonnetDecorSongKey) return;
  sonnetDecorSongKey = songKey;
  var seedU = sonnetSeededUnit('decor' + songKey);
  var seedU2 = sonnetSeededUnit('decor2' + songKey);
  var family = ['star', 'flora', 'wave', 'staff'][Math.floor(seedU * 4) % 4];
  var W = window.innerWidth || 1440, H = window.innerHeight || 810;
  var ink = 'rgba(246, 239, 226, 0.34)';
  var accent = 'rgba(255, 207, 158, 0.4)';
  var svgs = [];
  var S = function (inner, x, y, w, h, dly) {
    svgs.push('<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="left:' + x + 'px;top:' + y + 'px" fill="none" stroke-linecap="round">' + inner + '</svg>');
  };
  var st = function (d, color, w2, dly) {
    return '<path data-stroke d="' + d + '" stroke="' + color + '" stroke-width="' + w2 + '" style="--ln:1200;--dly:' + dly + 's"/>';
  };
  if (family === 'star') {
    /* 星轨：右上角两段弧 + 三颗星点 */
    var x0 = W * (0.68 + seedU2 * 0.18), y0 = H * (0.08 + seedU * 0.1);
    S(st('M0 60 Q 90 -10 180 44 Q 240 78 300 30', ink, 1.2, 0.2) + st('M40 110 Q 140 70 230 96', accent, 1, 0.7), x0, y0, 320, 130, 0);
  } else if (family === 'flora') {
    /* 植物枝：左下角主茎 + 三叶 */
    var x0 = W * (0.04 + seedU2 * 0.08), y0 = H * (0.58 + seedU * 0.2);
    S(st('M20 160 C 34 110 30 60 52 10', ink, 1.4, 0.2) + st('M33 96 C 10 84 6 62 20 48 C 36 60 40 82 33 96Z', accent, 1, 0.8) + st('M40 56 C 58 44 60 24 48 12 C 32 24 32 44 40 56Z', accent, 1, 1.2), x0, y0, 90, 180, 0);
  } else if (family === 'wave') {
    /* 波纹：底部三重浪 */
    var x0 = W * (0.06 + seedU2 * 0.1), y0 = H * (0.86 - seedU * 0.05);
    S(st('M0 24 Q 45 0 90 24 T 180 24 T 270 24 T 360 24', ink, 1.2, 0.2) + st('M0 44 Q 45 22 90 44 T 180 44 T 270 44 T 360 44', ink, 1, 0.55) + st('M0 64 Q 45 44 90 64 T 180 64 T 270 64 T 360 64', accent, 1, 0.9), x0, y0, 380, 80, 0);
  } else {
    /* 谱线：右上角五线谱短句 + 符头 */
    var x0 = W * (0.7 - seedU2 * 0.1), y0 = H * (0.1 + seedU * 0.12);
    var lines = '';
    for (var li = 0; li < 5; li++) lines += st('M0 ' + (li * 9 + 8) + ' H 200', ink, 0.9, 0.15 + li * 0.08);
    lines += '<circle cx="64" cy="30" r="5" fill="' + accent + '"/><circle cx="128" cy="21" r="5" fill="' + ink + '"/>';
    S(lines, x0, y0, 220, 52, 0);
  }
  host.innerHTML = svgs.join('');
}

/* ---------- 镜头系统（原版 sonnetCameraTracking + 防冻结 pan 思想） ----------
   zoom：当前行随唱词进度 1.0 → 1.07 缓推（原版 zoomBase 1.22 的温和版）；
   pan：8.5s 周期的慢漂移（原版「镜头间隙缓慢平移防冻结」），舞台整体微动。
   30fps rAF 独立于歌词 220ms 轮询；退出模式即停。 */
var sonnetCamera = { rafId: 0, last: 0, zoom: 1, panX: 0, panY: 0, lineT0: 0, lineT1: 0, lineProgress: 0 };
function sonnetCameraStart() {
  sonnetCameraStop();
  sonnetCamera.last = 0;
  var stage = document.getElementById('sonnet-stack');
  var spot = document.getElementById('sonnet-spot') || document.querySelector('.sonnet-spot');
  function frame(now) {
    if (!sonnetMode) return;
    var c = sonnetCamera;
    if (!c.last) c.last = now;
    var dt = Math.min(0.1, (now - c.last) / 1000);
    c.last = now;
    /* zoom：唱词进度驱动（lineProgress 由 sonnetTickWords 更新），缓入缓出 */
    var targetZoom = 1 + c.lineProgress * 0.07;
    c.zoom += (targetZoom - c.zoom) * Math.min(1, dt * 2.2);
    /* pan：双频正弦慢漂移（±10px / ±6px），原版 driftSpeed 思想 */
    var tSec = now / 1000;
    c.panX = Math.sin(tSec * 0.42) * 10 + Math.sin(tSec * 0.17) * 4;
    c.panY = Math.cos(tSec * 0.31) * 6 + Math.sin(tSec * 0.11) * 3;
    if (stage) stage.style.transform = 'translate(calc(-50% + ' + c.panX.toFixed(2) + 'px), ' + c.panY.toFixed(2) + 'px)';
    if (spot) spot.style.setProperty('--sn-cam-zoom', (c.zoom * 1.012).toFixed(4));
    /* 能量微漂移（原版 audioBands 驱动的手稿纸页浮动）：非激活行按 audioPower
       正弦浮动 ±3px，行种子错相——纸页在气流里轻轻颤，激活行不动（焦点稳定） */
    var power = 0;
    try { power = (typeof motionSignalGet === 'function') ? (motionSignalGet('audioPower') || 0) : 0; } catch (e) { }
    var amp = Math.min(3.2, power * 6);   /* audioPower 0~1 → 0~3.2px */
    if (amp > 0.15) {
      var tS = tSec * 1.9;
      for (var r2 = 0; r2 < sonnetRows.length; r2++) {
        var rowEl = sonnetRows[r2];
        if (rowEl.classList.contains('is-active')) { rowEl.style.marginTop = ''; continue; }
        var ph = sonnetSeededUnit('drift' + rowEl.dataset.lineIndex) * Math.PI * 2;
        rowEl.style.marginTop = (Math.sin(tS + ph) * amp).toFixed(2) + 'px';
      }
    } else if (c.driftOn) {
      for (var r3 = 0; r3 < sonnetRows.length; r3++) sonnetRows[r3].style.marginTop = '';
    }
    c.driftOn = amp > 0.15;
    c.rafId = requestAnimationFrame(frame);
  }
  sonnetCamera.rafId = requestAnimationFrame(frame);   /* 首帧启动 */
}
function sonnetCameraStop() {
  if (sonnetCamera.rafId) { cancelAnimationFrame(sonnetCamera.rafId); sonnetCamera.rafId = 0; }
  sonnetCamera.last = 0;
  var stage = document.getElementById('sonnet-stack');
  var spot = document.querySelector('.sonnet-spot');
  if (stage) stage.style.transform = '';
  if (spot) spot.style.transform = '';
}

/* ---------- 生命周期 ---------- */

function startSonnet() {
  /* 字号跟随「歌词大小」设置（--mfs，CSS 主行 clamp 乘算） */
  if (typeof applyOverlayModeFontScale === "function") applyOverlayModeFontScale(document.getElementById("sonnet-overlay"));
  sonnetLastActiveIdx = -99;
  sonnetLastLinesKey = '';
  sonnetSyncTheme();
  /* 原版 Pixi 引擎优先（镜头/排版/MG 图形/后期全量）；
     创建失败（无 WebGL 等）自动降级 DOM 版并保底可用 */
  var boot = (typeof sonnetPixiStart === 'function') ? sonnetPixiStart() : Promise.resolve(false);
  boot.then(function (ok) {
    if (!sonnetMode) { if (ok) sonnetPixiStop(); return; }
    sonnetUsePixi = !!ok;
    var ov = document.getElementById('sonnet-overlay');
    if (ov) ov.classList.toggle('pixi-on', sonnetUsePixi);
    if (!sonnetUsePixi) {
      /* DOM 降级版全链路（原实现） */
      sonnetRenderLines();
      sonnetRenderDecor();
      sonnetCameraStart();
      (function loop() {
        if (!sonnetMode || sonnetUsePixi) return;
        sonnetSyncTheme();
        sonnetRenderLines();
        sonnetRenderDecor();
        sonnetTickWords();
        sonnetTimer = setTimeout(loop, 220);
      })();
    } else {
      /* Pixi 版：轻量同步循环（换歌/主题/字号 swapSong + 暂停跟随 + 底部字幕） */
      (function loop() {
        if (!sonnetMode || !sonnetUsePixi) return;
        sonnetSyncTheme();   /* 字体变量 --sn-font 跟随（Pixi 底部字幕轨道用它） */
        if (typeof sonnetPixiSync === 'function') sonnetPixiSync();
        sonnetSubtitleUpdate();
        var paused = !((typeof playing !== 'undefined') && playing);
        if (typeof sonnetPixiSetPaused === 'function') sonnetPixiSetPaused(paused);
        sonnetTimer = setTimeout(loop, 700);
      })();
    }
  });
}

function stopSonnet() {
  if (sonnetTimer) { clearTimeout(sonnetTimer); sonnetTimer = 0; }
  sonnetUsePixi = false;
  if (typeof sonnetPixiStop === 'function') sonnetPixiStop();
  sonnetSubtitleClear();
  var ov0 = document.getElementById('sonnet-overlay');
  if (ov0) ov0.classList.remove('pixi-on');
  sonnetCameraStop();
  sonnetLastChorus = false;
  var snOv = document.getElementById('sonnet-overlay');
  if (snOv) { snOv.style.setProperty('--sn-chorus', '0'); snOv.classList.remove('is-chorus-show'); }
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
