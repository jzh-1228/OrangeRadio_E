/* =========================================================================
   OrangeSea · 莫奈（Monet · 油画海报歌词）
   Portions Copyright (c) 2025 chthollyphile and Folia contributors
   — adapted from folia-major (AGPL-3.0): src/components/visualizer/monet/
   monetBackgroundPipeline.ts（封面→模糊→灰度/饱和/水洗后处理→对角渐变
   + 左侧 bloom + 右侧 veil + 18 条竖笔触的静态海报，缓存 dataURL）与
   monetLyricsModel.ts（逐词显示令牌 + 词内逐字时间轴）。
   -------------------------------------------------------------------------
   整首歌是一张印象派海报：封面被水洗成油画底色（按亮度向主题三色混色），
   歌词是右侧的竖向轨道——当前行大字逐词点亮，唱过的行缩小沉入画里。
   海报只在封面/主题变化时重算一次（1920×1080 离屏 canvas）。
   ========================================================================= */

var MONET_STORE_KEY = 'orangesea-monet-v1';
var monetMode = readBooleanPreference(MONET_STORE_KEY, false);
var monetPrevQuality = null;
var monetTimer = 0;
var monetLinesKey = '';
var monetRowsDom = [];
var monetLastActiveIdx = -99;
var monetBgCache = { key: '', url: '' };

/* ---------- 色彩数学（monetBackgroundPipeline 同款） ---------- */

function monetClamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function monetMix(from, to, amount) { return from + (to - from) * amount; }
function monetLuminanceOf(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

function monetParseChannels(color, fallback) {
  var m = /^#([0-9a-f]{6})$/i.exec(String(color || '').trim());
  if (m) {
    return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  }
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(String(color || ''));
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return fallback;
}

/* 水洗端点：暗端/亮端由背景与主文本互定 */
function monetResolveWashEndpoints(background, primary) {
  return monetLuminanceOf(background.r, background.g, background.b) <= monetLuminanceOf(primary.r, primary.g, primary.b)
    ? { shadow: background, highlight: primary }
    : { shadow: primary, highlight: background };
}

/* 亮度归一 → shadow→accent→highlight 两段折线混色（油画水洗） */
function monetResolveWashColor(normLum, background, accent, primary) {
  var ep = monetResolveWashEndpoints(background, primary);
  if (normLum <= 0.55) {
    var a1 = normLum / 0.55;
    return {
      r: monetMix(ep.shadow.r, accent.r, a1),
      g: monetMix(ep.shadow.g, accent.g, a1),
      b: monetMix(ep.shadow.b, accent.b, a1)
    };
  }
  var a2 = (normLum - 0.55) / 0.45;
  return {
    r: monetMix(accent.r, ep.highlight.r, a2),
    g: monetMix(accent.g, ep.highlight.g, a2),
    b: monetMix(accent.b, ep.highlight.b, a2)
  };
}

function monetCssRgba(channels, alpha) {
  return 'rgba(' + Math.round(monetClamp(channels.r, 0, 255)) + ','
    + Math.round(monetClamp(channels.g, 0, 255)) + ','
    + Math.round(monetClamp(channels.b, 0, 255)) + ',' + alpha + ')';
}

/* ---------- 海报构建（低频路径：封面/主题变化才重算） ---------- */

var MONET_BG_W = 1920;
var MONET_BG_H = 1080;
/* 默认调参（DEFAULT_MONET_TUNING 的背景子集） */
var MONET_TUNING = {
  blurPx: 26,
  overlayOpacity: 0.3,
  grayscale: 0.18,
  saturation: 1.22,
  wash: 0.34
};

function monetLoadImage(src) {
  return new Promise(function (resolve) {
    var img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = function () { resolve(img); };
    img.onerror = function () { resolve(null); };
    img.src = src;
  });
}

function monetDrawCoverCropped(ctx, img, w, h) {
  var iw = img.naturalWidth || img.width || w;
  var ih = img.naturalHeight || img.height || h;
  if (!iw || !ih) return;
  var scale = Math.max(w / iw, h / ih);
  var dw = iw * scale;
  var dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function monetBuildPoster(img, theme) {
  var canvas = document.createElement('canvas');
  canvas.width = MONET_BG_W;
  canvas.height = MONET_BG_H;
  var ctx = canvas.getContext('2d');
  if (!ctx) return null;

  var background = monetParseChannels(theme.backgroundColor, { r: 10, g: 10, b: 12 });
  var accent = monetParseChannels(theme.accentColor, background);
  var primary = monetParseChannels(theme.primaryColor, { r: 245, g: 245, b: 245 });

  /* 1) 封面（无封面 → 主题色底） */
  if (img) {
    if (typeof ctx.filter === 'string') {
      ctx.filter = 'blur(' + MONET_TUNING.blurPx + 'px)';
      ctx.drawImage(canvas, 0, 0);           /* 占位避免部分实现跳过 */
      ctx.clearRect(0, 0, MONET_BG_W, MONET_BG_H);
      monetDrawCoverCropped(ctx, img, MONET_BG_W, MONET_BG_H);
      ctx.filter = 'none';
    } else {
      /* 兜底：降采样两次近似模糊 */
      var small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(MONET_BG_W / 10));
      small.height = Math.max(1, Math.round(MONET_BG_H / 10));
      var sctx = small.getContext('2d');
      if (sctx) {
        monetDrawCoverCropped(sctx, img, small.width, small.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(small, 0, 0, MONET_BG_W, MONET_BG_H);
      }
    }
  } else {
    ctx.fillStyle = monetCssRgba(background, 1);
    ctx.fillRect(0, 0, MONET_BG_W, MONET_BG_H);
  }

  /* 2) 像素后处理：灰度 → 饱和 → 水洗 */
  try {
    var imageData = ctx.getImageData(0, 0, MONET_BG_W, MONET_BG_H);
    var data = imageData.data;
    var gray = monetClamp(MONET_TUNING.grayscale, 0, 1);
    var sat = monetClamp(MONET_TUNING.saturation, 0, 2);
    var wash = monetClamp(MONET_TUNING.wash, 0, 1);
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var lum = monetLuminanceOf(r, g, b);
      if (gray > 0) {
        r = monetMix(r, lum, gray); g = monetMix(g, lum, gray); b = monetMix(b, lum, gray);
      }
      if (Math.abs(sat - 1) >= 0.001) {
        var sl = monetLuminanceOf(r, g, b);
        r = sl + (r - sl) * sat; g = sl + (g - sl) * sat; b = sl + (b - sl) * sat;
      }
      if (wash > 0) {
        var wc = monetResolveWashColor(monetClamp(lum / 255, 0, 1), background, accent, primary);
        r = monetMix(r, wc.r, wash); g = monetMix(g, wc.g, wash); b = monetMix(b, wc.b, wash);
      }
      data[i] = Math.round(monetClamp(r, 0, 255));
      data[i + 1] = Math.round(monetClamp(g, 0, 255));
      data[i + 2] = Math.round(monetClamp(b, 0, 255));
    }
    ctx.putImageData(imageData, 0, 0);
  } catch (e) { /* 跨域画布读不出像素：保留未水洗的模糊底 */ }

  /* 3) 覆盖层：对角渐变 + 左 bloom + 右 veil + 竖笔触 */
  var overlay = monetClamp(MONET_TUNING.overlayOpacity, 0, 1);
  var diag = ctx.createLinearGradient(0, 0, MONET_BG_W, MONET_BG_H);
  diag.addColorStop(0, monetCssRgba(accent, 0.08 + overlay * 0.62));
  diag.addColorStop(0.44, monetCssRgba(background, 0.16 + overlay * 0.58));
  diag.addColorStop(1, monetCssRgba(primary, 0.06 + overlay * 0.36));
  ctx.fillStyle = diag;
  ctx.fillRect(0, 0, MONET_BG_W, MONET_BG_H);

  var bloom = ctx.createRadialGradient(MONET_BG_W * 0.18, MONET_BG_H * 0.34, 0, MONET_BG_W * 0.18, MONET_BG_H * 0.34, MONET_BG_W * 0.55);
  bloom.addColorStop(0, monetCssRgba(accent, overlay * 0.42));
  bloom.addColorStop(1, monetCssRgba(background, 0));
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, MONET_BG_W, MONET_BG_H);

  var veil = ctx.createLinearGradient(MONET_BG_W * 0.45, 0, MONET_BG_W, 0);
  veil.addColorStop(0, monetCssRgba(background, 0));
  veil.addColorStop(1, monetCssRgba(background, 0.18 + overlay * 0.38));
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, MONET_BG_W, MONET_BG_H);

  ctx.fillStyle = monetCssRgba(background, 0.1 + overlay * 0.08);
  for (var s = 0; s < 18; s++) {
    ctx.fillRect((s * 127) % MONET_BG_W, ((s * 211) % MONET_BG_H) - 40, 1, MONET_BG_H * 0.28);
  }

  return canvas.toDataURL('image/jpeg', 0.86);
}

function monetCoverUrlNow() {
  if (typeof getControlCoverUrl === 'function') return getControlCoverUrl();
  return null;
}

function monetRefreshBackground() {
  var holder = document.getElementById('monet-poster');
  if (!holder) return;
  var titleEl = document.getElementById('monet-title');
  var artistEl = document.getElementById('monet-artist');
  if (titleEl || artistEl) {
    var srcTitle = document.getElementById('control-title-text');
    var srcArtist = document.getElementById('control-artist');
    var nextTitle = srcTitle ? (srcTitle.textContent || '') : '';
    var nextArtist = srcArtist ? (srcArtist.textContent || '') : '';
    if (titleEl && titleEl.textContent !== nextTitle) titleEl.textContent = nextTitle;
    if (artistEl && artistEl.textContent !== nextArtist) artistEl.textContent = nextArtist;
  }
  var active = (typeof themeServiceActiveTheme === 'function') ? themeServiceActiveTheme() : null;
  var theme = active || { backgroundColor: '#171009', primaryColor: '#f2e6d4', accentColor: '#ff9c6e' };
  var cover = monetCoverUrlNow();

  /* 主题描述胶囊（Folia: theme.description → 胶囊文案） */
  var capsuleEl = document.getElementById('monet-capsule-text');
  if (capsuleEl) {
    var label = (theme.description || theme.name || 'Monet').trim();
    if (capsuleEl.textContent !== label) capsuleEl.textContent = label;
  }
  /* 封面相框（清晰原图，非水洗） */
  var portraitEl = document.getElementById('monet-portrait-img');
  if (portraitEl) {
    var nextBg = cover ? 'url("' + cover + '")' : 'none';
    if (portraitEl.dataset.bg !== nextBg) {
      portraitEl.dataset.bg = nextBg;
      portraitEl.style.backgroundImage = nextBg;
    }
  }

  var key = (cover || '') + '|' + theme.backgroundColor + '|' + theme.accentColor + '|' + theme.primaryColor;
  if (key === monetBgCache.key) return;
  monetBgCache.key = key;
  if (!cover) {
    var poster = monetBuildPoster(null, theme);
    if (poster) holder.style.backgroundImage = 'url("' + poster + '")';
    return;
  }
  monetLoadImage(cover).then(function (img) {
    if (!img || key !== monetBgCache.key) return;   /* 晚到丢弃 */
    var url = monetBuildPoster(img, theme);
    if (url) holder.style.backgroundImage = 'url("' + url + '")';
  });
}

/* ---------- 歌词轨道（Folia MonetLyricsRail 直译：±4 窗口 / tone 曲线 / 逐词扫过） ---------- */

/* 窗口大小（MONET_SCROLL_BEFORE/AFTER = 4） */
var MONET_WINDOW = 4;
/* inactive 基准缩放 = inactiveFontPx / lyricFontPx（clamp 0.72~0.92 的中值，CSS 变量换算） */
var MONET_INACTIVE_SCALE = 0.72;

function monetNowTime() {
  try {
    return getAdjustedLyricPlaybackTime(typeof audio !== 'undefined' && audio ? (audio.currentTime || 0) : 0);
  } catch (e) { return 0; }
}

function monetActiveLineIndex(t) {
  if (typeof findStageLyricIndexAtTime !== 'function') return -1;
  return findStageLyricIndexAtTime(t);
}

function monetLinesKeyNow() {
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  var first = lines[0], last = lines[lines.length - 1];
  return lines.length + '|' + (first ? first.t : 0) + '|' + (last ? last.t : 0);
}

function monetBuildRail() {
  var rail = document.getElementById('monet-rail');
  if (!rail) return;
  var key = monetLinesKeyNow();
  if (key === monetLinesKey && rail.childElementCount) return;
  monetLinesKey = key;
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  rail.textContent = '';
  monetRowsDom = [];
  var frag = document.createDocumentFragment();
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i] || {};
    var text = String(line.text || '').trim();
    var row = document.createElement('div');
    row.className = 'monet-row';
    row.dataset.lineIndex = String(i);
    if (line.isChorus) {
      row.classList.add('is-chorus');
      var glow = document.createElement('span');
      glow.className = 'monet-chorus-glow';
      row.appendChild(glow);
    }
    if (!text) {
      row.classList.add('is-empty');
      frag.appendChild(row);
      monetRowsDom.push({ row: row, words: [] });
      continue;
    }
    var words = (line.words && line.words.length) ? line.words : null;
    if (words) {
      for (var w = 0; w < words.length; w++) {
        var span = document.createElement('span');
        span.className = 'monet-word is-pending';
        span.textContent = words[w].text;
        row.appendChild(span);
      }
    } else {
      var span0 = document.createElement('span');
      span0.className = 'monet-word is-pending';
      span0.textContent = text;
      row.appendChild(span0);
    }
    /* 翻译子行（Folia: rail 行内 subtitle） */
    var tr = String(line.translation || '').trim();
    if (tr) {
      var trEl = document.createElement('span');
      trEl.className = 'monet-row-tr';
      trEl.textContent = tr;
      row.appendChild(trEl);
    }
    frag.appendChild(row);
    monetRowsDom.push({ row: row, words: words, plain: !words ? text : null });
  }
  rail.appendChild(frag);
  monetLastActiveIdx = -99;
}

/* Folia resolveLineTone 直译：distance/状态 → opacity·scale·blur（写 CSS 变量） */
function monetApplyTone(row, distance, isWaiting) {
  var d = Math.max(Math.abs(distance), 1);
  var scale = Math.min(0.92, Math.max(0.68, MONET_INACTIVE_SCALE * Math.pow(0.9, d - 1)));
  var opacity, blur;
  if (isWaiting) {
    opacity = Math.min(0.72, Math.max(0.36, 0.72 - (d - 1) * 0.18));
    blur = d === 1 ? 0.7 : 1.8 + (d - 2) * 0.8;
  } else {
    opacity = Math.min(0.52, Math.max(0.28, 0.52 - (d - 1) * 0.12));
    blur = 1.1 + (d - 1) * 0.7;
  }
  row.style.setProperty('--mn-tone-opacity', opacity.toFixed(3));
  row.style.setProperty('--mn-tone-scale', scale.toFixed(3));
  row.style.setProperty('--mn-tone-blur', blur.toFixed(2) + 'px');
}

function monetTick() {
  var t = monetNowTime();
  var idx = monetActiveLineIndex(t);
  var lines = (typeof lyricsLines !== 'undefined' && lyricsLines) ? lyricsLines : [];
  for (var i = 0; i < monetRowsDom.length; i++) {
    var entry = monetRowsDom[i];
    var isActive = i === idx;
    var line = lines[i] || {};
    /* ±4 窗口外的行直接隐藏（Folia: buildScrollableRailEntries before/after 4） */
    var off = !isActive && (idx < 0 ? Math.abs(i) > MONET_WINDOW : Math.abs(i - idx) > MONET_WINDOW);
    if (entry.row.classList.contains('is-off') !== off) entry.row.classList.toggle('is-off', off);
    if (off) continue;
    entry.row.classList.toggle('is-active', isActive);
    var distance = isActive ? 0 : (i < idx ? idx - i : i - idx);
    var isWaiting = !isActive && i > idx;
    if (!isActive) monetApplyTone(entry.row, distance, isWaiting);
    if (isActive && (entry.words || entry.plain)) {
      var spans = entry.row.querySelectorAll('.monet-word');
      var wsBase = Number(line.t) || 0;
      if (entry.words) {
        for (var w = 0; w < entry.words.length && w < spans.length; w++) {
          var word = entry.words[w];
          var ws = Number(word.t) || wsBase;
          var we = ws + Math.max(Number(word.d) || 0, 0.05);
          var sung = t >= ws - 0.05;
          var singing = sung && t < we;
          spans[w].classList.toggle('is-pending', !sung);
          spans[w].classList.toggle('is-singing', singing);
        }
      } else if (spans.length) {
        spans[0].classList.toggle('is-pending', t < wsBase - 0.05);
        spans[0].classList.toggle('is-singing', false);
      }
    }
  }
  if (idx !== monetLastActiveIdx) {
    monetLastActiveIdx = idx;
    var target = monetRowsDom[idx];
    if (target && target.row.scrollIntoView) {
      try { target.row.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { }
    }
  }
}

/* ---------- 生命周期 ---------- */

function startMonet() {
  monetLinesKey = '';
  monetBgCache.key = '';
  monetRefreshBackground();
  monetBuildRail();
  monetTick();
  (function loop() {
    if (!monetMode) return;
    monetRefreshBackground();
    monetBuildRail();
    monetTick();
    monetTimer = setTimeout(loop, 250);
  })();
}

function stopMonet() {
  if (monetTimer) { clearTimeout(monetTimer); monetTimer = 0; }
  monetLinesKey = '';
  monetBgCache.key = '';
  monetRowsDom = [];
  monetLastActiveIdx = -99;
}

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
    if (typeof fx !== 'undefined' && fx && monetPrevQuality === null) {
      monetPrevQuality = fx.performanceQuality || 'balanced';
      fx.performanceQuality = 'eco';
    }
    startMonet();
  } else {
    if (monetPrevQuality !== null && typeof fx !== 'undefined' && fx) {
      fx.performanceQuality = monetPrevQuality;
      monetPrevQuality = null;
    }
    stopMonet();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(monetMode ? '莫奈已开启' : '已切回标准模式');
}

function toggleMonetMode() {
  applyMonetMode(!monetMode, { save: true, toast: true });
}

scheduleUiWarmTask ? scheduleUiWarmTask(function () {
  applyMonetMode(monetMode, { save: false });
}, 360) : setTimeout(function () {
  applyMonetMode(monetMode, { save: false });
}, 360);
