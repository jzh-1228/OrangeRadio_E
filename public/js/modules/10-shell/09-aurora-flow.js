/* =========================================================================
   OrangeSea · 流光（Aurora Flow · 封面极光氛围）
   日常沉浸模式：专辑封面取色的流体色雾背景 + 大字逐字卡拉OK歌词
   + 底部呼吸波形线。克制原则：全场景只有「色雾 + 歌词 + 呼吸线」三样，
   无频闪、无高频运动、无主体物件（对标 Apple Music 沉浸歌词的"好看不吵"）。
   照抄 film-radio / graffiti 范式：body.aurora + localStorage + 覆盖层互斥。

   分层：L0 色雾 canvas（CSS blur 柔化，低分辨率绘制）/
         L0.5 暗角遮罩 / L1 角标（封面+歌名）/ L2 歌词（逐字点亮）/
         L3 呼吸波形线。
   音频：覆盖层期间主循环只保活 frequencyData/timeDomainData（不更新
   bass 等全局），故本模块自算特征：低频呼吸/节拍脉冲/副歌闸门。
   ========================================================================= */

var AURORA_STORE_KEY = 'orangesea-aurora-flow-v1';
var auroraMode = readBooleanPreference(AURORA_STORE_KEY, false);
var auroraRafId = 0;
var auroraObserver = null;
var auroraLyricsObserverToken = 0;
var auroraLastLineIdx = -99;
var auroraChars = [];            /* [{ el, reveal }] 当前行逐字点亮表 */
var auroraLineStartT = 0;
var auroraResizeTimer = 0;
var auroraLastFontKey = null;    /* 字体变化检测（fx.lyricFont 实时同步，与雨窗一致） */

/* 色雾状态 */
var auroraBgCtx = null;
var auroraWaveCtx = null;
var auroraBlobSprites = [];      /* 每个取色一张离屏径向渐变精灵 */
var auroraPalette = null;        /* { colors:[c1,c2,c3], sung, luma } */
var auroraCoverUrl = '';         /* 当前已取色的封面 URL（去重） */
var auroraPaletteLoading = false;
var auroraPaletteSeq = 0;

/* 音频特征（自算，0~1） */
var auroraBass = 0;
var auroraEnergy = 0;
var auroraChorus = 0;            /* 副歌闸门：能量慢积分，驱动色雾浓度+丝带 */
var auroraBeat = 0;              /* 节拍脉冲：低频突增快衰减 */
var auroraPrevBassRaw = 0;

/* 呼吸线波形平滑缓存 */
var auroraWavePts = null;

/* ---------- 切换 ---------- */
function applyAuroraMode(on, opts) {
  opts = opts || {};
  auroraMode = !!on;
  /* 四方互斥：经视觉模式注册表退出其它覆盖层 */
  if (auroraMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('aurora', { save: true });
  }
  document.body.classList.toggle('aurora', auroraMode);
  var overlay = document.getElementById('aurora-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', auroraMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(AURORA_STORE_KEY, auroraMode);
  if (auroraMode) {
    startAurora();
  } else {
    stopAurora();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  if (opts.toast) showToast(auroraMode ? '流光已开启' : '已切回标准模式');
}

function toggleAuroraMode() {
  applyAuroraMode(!auroraMode, { save: true, toast: true });
}

/* ---------- 启动 / 停止 ---------- */
function startAurora() {
  /* 字号跟随「歌词大小」设置（--mfs，CSS 主行乘算） */
  if (typeof applyOverlayModeFontScale === "function") applyOverlayModeFontScale(document.getElementById("aurora-overlay"));
  ensureAuroraCanvases();
  auroraFontStack();
  syncAuroraBadge();
  syncAuroraCover(true);
  auroraLastLineIdx = -99;       /* 强制首帧渲染当前行 */
  startAuroraObserver();
  startAuroraLoop();
}

/* ---------- 字体跟随用户歌词字体选择（fx.lyricFont，与雨窗/涂鸦一致） ---------- */
function auroraFontStack() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  var stack = (fontKey && typeof lyricFontStackForKey === 'function')
    ? lyricFontStackForKey(fontKey)
    : '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Source Han Sans SC", system-ui, sans-serif';
  var overlay = document.getElementById('aurora-overlay');
  if (overlay) overlay.style.setProperty('--af-font', stack);
  return stack;
}

function checkAuroraFontChange() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  if (auroraLastFontKey !== fontKey) {
    auroraLastFontKey = fontKey;
    auroraFontStack();
  }
}

function stopAurora() {
  stopAuroraLoop();
  stopAuroraObserver();
  auroraLastLineIdx = -99;
  auroraChars = [];
  auroraChorus = 0;
  auroraBeat = 0;
  auroraWavePts = null;
  clearAuroraLyrics();
  var bg = document.getElementById('aurora-bg-canvas');
  if (bg && auroraBgCtx) auroraBgCtx.clearRect(0, 0, bg.width, bg.height);
}

/* ---------- 状态同步（MutationObserver 零侵入） ---------- */
function startAuroraObserver() {
  stopAuroraObserver();
  auroraObserver = new MutationObserver(function () {
    syncAuroraBadge();
    syncAuroraCover(false);
  });
  var cover = document.getElementById('control-cover');
  if (cover) auroraObserver.observe(cover, { attributes: true, attributeFilter: ['style'] });
  ['control-title-text', 'control-artist'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) auroraObserver.observe(el, { characterData: true, childList: true, subtree: true });
  });
}

function stopAuroraObserver() {
  if (auroraObserver) {
    auroraObserver.disconnect();
    auroraObserver = null;
  }
}

/* 角标：小封面 + 歌名/歌手 */
function syncAuroraBadge() {
  var src = document.getElementById('control-cover');
  var cover = document.getElementById('aurora-badge-cover');
  if (cover && src) {
    var bg = src.style.backgroundImage || '';
    if (!bg || bg === 'none') bg = getComputedStyle(src).backgroundImage || '';
    if (bg && bg !== 'none') {
      if (cover.style.backgroundImage !== bg) cover.style.backgroundImage = bg;
      cover.classList.remove('cover-empty');
    } else {
      cover.classList.add('cover-empty');
    }
  }
  var titleEl = document.getElementById('control-title-text');
  var artistEl = document.getElementById('control-artist');
  var bTitle = document.getElementById('aurora-badge-title');
  var bArtist = document.getElementById('aurora-badge-artist');
  if (bTitle && titleEl) bTitle.textContent = titleEl.textContent || '未在播放';
  if (bArtist && artistEl) bArtist.textContent = artistEl.textContent || '';
}

/* ---------- 封面取色（低频：仅封面 URL 变化时执行一次） ----------
   从 #control-cover 的 background-image 解析 URL，32×32 降采样后按
   色相分桶取饱和色 top3；任何失败静默回退默认夜色板，不影响播放。 */
function syncAuroraCover(force) {
  var src = document.getElementById('control-cover');
  if (!src) return;
  var bg = src.style.backgroundImage || '';
  if (!bg || bg === 'none') bg = getComputedStyle(src).backgroundImage || '';
  var url = '';
  var m = /url\((["']?)([^"')]+)\1\)/.exec(bg);
  if (m) url = m[2];
  if (!force && url === auroraCoverUrl) return;
  auroraCoverUrl = url;
  if (!url || typeof Image === 'undefined') return;
  var seq = ++auroraPaletteSeq;
  auroraPaletteLoading = true;
  auroraLoadPaletteImage(url, 0, function (img) {
    if (seq !== auroraPaletteSeq) return;      /* 已切歌，丢弃过期结果 */
    auroraPaletteLoading = false;
    var palette = null;
    if (img) {
      try { palette = auroraExtractPalette(img); } catch (e) { palette = null; }
    }
    if (!palette) palette = auroraDefaultPalette();
    auroraPalette = palette;
    auroraApplyPalette();
  });
}

/* 优先带 crossOrigin 加载（像素可读），失败降级为不带 crossOrigin 再试一次 */
function auroraLoadPaletteImage(url, attempt, done) {
  var img = new Image();
  if (attempt === 0) img.crossOrigin = 'anonymous';
  img.onload = function () {
    /* 无 crossOrigin 加载的远程图 taint canvas，getImageData 会抛错——视作失败 */
    if (attempt !== 0) {
      try {
        var probe = document.createElement('canvas');
        probe.width = probe.height = 2;
        var pctx = probe.getContext('2d');
        pctx.drawImage(img, 0, 0, 2, 2);
        pctx.getImageData(0, 0, 1, 1);
      } catch (e) { done(null); return; }
    }
    done(img);
  };
  img.onerror = function () {
    if (attempt === 0) auroraLoadPaletteImage(url, 1, done);
    else done(null);
  };
  try { img.src = url; } catch (e) { done(null); }
}

/* HSL 色相 24 桶分桶，按 出现率×饱和度 加权取 top3 饱和色 */
function auroraExtractPalette(img) {
  var size = 32;
  var c = document.createElement('canvas');
  c.width = c.height = size;
  var ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  var data = ctx.getImageData(0, 0, size, size).data;
  var buckets = [];
  for (var i = 0; i < 24; i++) buckets.push({ r: 0, g: 0, b: 0, n: 0, s: 0, l: 0 });
  var sumR = 0, sumG = 0, sumB = 0, count = 0;
  for (var p = 0; p < data.length; p += 4) {
    var a = data[p + 3];
    if (a < 125) continue;
    var r = data[p], g = data[p + 1], b = data[p + 2];
    sumR += r; sumG += g; sumB += b; count++;
    var hsl = auroraRgbToHsl(r, g, b);
    var luma = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    if (hsl.s < 0.16 || luma < 0.06 || luma > 0.97) continue;   /* 近灰/近黑/近白不入彩色桶 */
    var bi = Math.min(23, Math.max(0, Math.floor(hsl.h * 24))) % 24;
    var bk = buckets[bi];
    bk.r += r; bk.g += g; bk.b += b; bk.n++;
    bk.s += hsl.s; bk.l += luma;
  }
  var colors = [];
  var sorted = buckets.slice().sort(function (x, y) {
    return (y.n * (0.25 + y.s)) - (x.n * (0.25 + x.s));
  });
  for (var k = 0; k < sorted.length && colors.length < 3; k++) {
    if (sorted[k].n < 6) break;                  /* 占比过小的噪色丢弃 */
    colors.push(auroraRgbCss(
      Math.round(sorted[k].r / sorted[k].n),
      Math.round(sorted[k].g / sorted[k].n),
      Math.round(sorted[k].b / sorted[k].n)));
  }
  var avg = auroraRgbCss(
    Math.round(sumR / Math.max(1, count)),
    Math.round(sumG / Math.max(1, count)),
    Math.round(sumB / Math.max(1, count)));
  if (!colors.length) {
    /* 灰调封面：用平均色的亮/暗变体凑出层次 */
    var rgb = auroraCssToRgb(avg);
    colors = [
      auroraMixRgb(rgb, [255, 255, 255], 0.28),
      auroraMixRgb(rgb, [120, 150, 210], 0.22),
      auroraMixRgb(rgb, [10, 12, 22], 0.30)
    ];
  } else if (colors.length === 1) {
    var rgb1 = auroraCssToRgb(colors[0]);
    colors.push(auroraMixRgb(rgb1, [255, 255, 255], 0.26));
    colors.push(auroraMixRgb(rgb1, [12, 14, 26], 0.34));
  } else if (colors.length === 2) {
    colors.push(auroraMixRgb(auroraCssToRgb(colors[0]), auroraCssToRgb(colors[1]), 0.5));
  }
  /* 点亮字色：取最亮的主色与白 55% 混合，保证暗底可读 */
  var brightest = colors[0];
  var bestLuma = -1;
  colors.forEach(function (cc) {
    var rgb2 = auroraCssToRgb(cc);
    var luma = (rgb2[0] * 0.299 + rgb2[1] * 0.587 + rgb2[2] * 0.114) / 255;
    if (luma > bestLuma) { bestLuma = luma; brightest = cc; }
  });
  var sung = auroraRgbCss.apply(null, auroraMixRgb(auroraCssToRgb(brightest), [255, 255, 255], 0.55));
  var vivid = auroraVividPalette(colors, avgLuma(count, sumR, sumG, sumB));
  return { colors: vivid.colors, sung: sung, luma: bestLuma, avg: avg, gain: vivid.gain };
}

/* 封面平均亮度（提取时顺便累计） */
function avgLuma(count, sumR, sumG, sumB) {
  if (!count) return 0;
  return ((sumR / count) * 0.299 + (sumG / count) * 0.587 + (sumB / count) * 0.114) / 255;
}

/* ---------- 暗色/灰调封面补偿（流光的氛围依赖"可见的色彩"） ----------
   · 封面过暗（平均亮度 <0.30）：主色逐级提亮，否则色雾沉入黑底；
   · 主色过灰（平均饱和 <0.26）：对主色做 ±色相偏移生成辅色，恢复层次；
   · gain 输出给渲染端上调色团 alpha（上限 1.8，lighter 叠加防过曝）。 */
function auroraVividPalette(colors, coverLuma) {
  var out = colors.map(function (cc) { return auroraAdjustColor(cc, 0.16, 0.22); });
  var avgS = 0;
  out.forEach(function (cc) { avgS += auroraRgbToHsl.apply(null, auroraCssToRgb(cc)).s; });
  avgS /= Math.max(1, out.length);
  if (avgS < 0.34 && out.length) {   /* 阈值高于补偿下限 0.22：灰调（补偿后 s≈0.27）仍触发色相扩展 */
    var base = auroraCssToRgb(out[0]);
    var baseHsl = auroraRgbToHsl(base[0], base[1], base[2]);
    var sat = Math.max(0.30, baseHsl.s);
    if (out.length >= 2) out[1] = auroraHslCss(baseHsl.h + 0.085, sat, Math.max(baseHsl.l, 0.34));
    if (out.length >= 3) out[2] = auroraHslCss(baseHsl.h - 0.11, Math.max(0.26, sat - 0.06), Math.max(baseHsl.l * 0.8, 0.20));
  }
  var gain = Math.max(1, Math.min(1.8, 1 + (0.30 - coverLuma) * 2.2));
  return { colors: out, gain: gain };
}

/* 单色补偿：亮度低于 lumaFloor 时拉到下限附近，饱和低于 satFloor 同理 */
function auroraAdjustColor(css, lumaFloor, satFloor) {
  var rgb = auroraCssToRgb(css);
  var hsl = auroraRgbToHsl(rgb[0], rgb[1], rgb[2]);
  var luma = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
  if (luma < lumaFloor) hsl.l = Math.min(0.42, hsl.l + (lumaFloor - luma) * 0.9);
  if (hsl.s < satFloor) hsl.s = satFloor + (satFloor - hsl.s) * 0.4;
  return auroraHslCss(hsl.h, hsl.s, hsl.l);
}

function auroraHslCss(h, s, l) {
  h = ((h % 1) + 1) % 1;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  var r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = auroraHueToRgb(p, q, h + 1 / 3);
    g = auroraHueToRgb(p, q, h);
    b = auroraHueToRgb(p, q, h - 1 / 3);
  }
  return auroraRgbCss(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
}

function auroraHueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function auroraDefaultPalette() {
  return {
    colors: ['#2b3f6b', '#5a3b6e', '#173052'],
    sung: '#dfe8ff',
    luma: 0.22,
    avg: '#1a2030'
  };
}

/* 把取色结果写进 CSS 变量（字色/丝带色）并重建色雾精灵 */
function auroraApplyPalette() {
  var p = auroraPalette;
  if (!p) return;
  var overlay = document.getElementById('aurora-overlay');
  if (overlay) {
    overlay.style.setProperty('--af-c1', p.colors[0]);
    overlay.style.setProperty('--af-c2', p.colors[1]);
    overlay.style.setProperty('--af-c3', p.colors[2]);
    overlay.style.setProperty('--af-sung', p.sung);
    overlay.style.setProperty('--af-ribbon', p.colors[1]);
  }
  auroraBlobSprites = p.colors.map(function (cc) { return auroraBuildBlobSprite(cc); });
}

/* ---------- 色雾精灵（离屏径向渐变，避免每帧 createRadialGradient） ---------- */
function auroraBuildBlobSprite(colorCss) {
  var size = 256;
  var c = document.createElement('canvas');
  c.width = c.height = size;
  var ctx = c.getContext('2d');
  var rgb = auroraCssToRgb(colorCss);
  var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.95)');
  g.addColorStop(0.55, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.38)');
  g.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/* ---------- canvas 尺寸（bg 低分辨率半清晰，波形线全分辨率） ---------- */
function ensureAuroraCanvases() {
  var bg = document.getElementById('aurora-bg-canvas');
  var wave = document.getElementById('aurora-wave-canvas');
  if (bg && !auroraBgCtx) auroraBgCtx = bg.getContext('2d');
  if (wave && !auroraWaveCtx) auroraWaveCtx = wave.getContext('2d');
  resizeAuroraCanvases();
  if (!auroraBlobSprites.length) {
    if (!auroraPalette) auroraPalette = auroraDefaultPalette();
    auroraApplyPalette();
  }
}

function resizeAuroraCanvases() {
  var w = window.innerWidth || 1280;
  var h = window.innerHeight || 800;
  var bg = document.getElementById('aurora-bg-canvas');
  if (bg && auroraBgCtx) {
    /* 低分辨率绘制：反正要 CSS blur，1/3 分辨率足够，GPU 压力最小 */
    bg.width = Math.max(2, Math.floor(w / 3));
    bg.height = Math.max(2, Math.floor(h / 3));
  }
  var wave = document.getElementById('aurora-wave-canvas');
  if (wave && auroraWaveCtx) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    wave.width = Math.max(2, Math.floor(w * dpr));
    wave.height = Math.max(2, Math.floor(140 * dpr));
    auroraWaveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

/* ---------- 音频特征（frequencyData 自算） ---------- */
function auroraBinAvg(from, to) {
  if (typeof frequencyData === 'undefined' || !frequencyData || !frequencyData.length) return 0;
  var sum = 0, n = 0;
  var hi = Math.min(to, frequencyData.length - 1);
  for (var i = from; i <= hi; i++) { sum += frequencyData[i]; n++; }
  return n ? (sum / n) / 255 : 0;
}

function tickAuroraAudio(dtSec) {
  var bassRaw = auroraBinAvg(1, 8);
  auroraBass = auroraBass + (bassRaw - auroraBass) * Math.min(1, dtSec * 9);
  var energyRaw = auroraBinAvg(2, 160) * 0.7 + auroraBinAvg(161, 300) * 0.3;
  auroraEnergy = auroraEnergy + (energyRaw - auroraEnergy) * Math.min(1, dtSec * 3.2);
  /* 节拍脉冲：低频对上帧突增 */
  if (bassRaw - auroraPrevBassRaw > 0.10 && bassRaw > 0.24) auroraBeat = 1;
  auroraPrevBassRaw = bassRaw;
  auroraBeat *= Math.pow(0.045, dtSec);          /* 快衰减 */
  /* 副歌闸门：能量慢升慢降（与主循环 lyricSunEnergy 同思路） */
  var chorusTarget = Math.max(0, Math.min(1, (auroraEnergy - 0.34) / 0.30));
  var k = chorusTarget > auroraChorus ? 0.9 : 0.35;
  auroraChorus += (chorusTarget - auroraChorus) * Math.min(1, dtSec * k);
}

/* ---------- 色雾绘制（30fps 足够：慢速漂移无高频细节） ---------- */
function tickAuroraBg(now) {
  if (!auroraBgCtx) return;
  var ctx = auroraBgCtx;
  var w = ctx.canvas.width, h = ctx.canvas.height;
  var t = now * 0.001;
  var dim = Math.min(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  /* 三个色团：互质角速度慢漂（40~70s 级周期），bass 呼吸半径 */
  var baseR = dim * (0.52 + auroraBass * 0.05);
  var ampX = w * 0.30, ampY = h * 0.26;
  var cx = w / 2, cy = h * 0.46;
  var defs = [
    { s: 0.083, p: 0.0, sy: 0.061, p2: 1.7 },    /* 周期 ≈ 75s */
    { s: 0.059, p: 2.3, sy: 0.083, p2: 4.1 },    /* ≈ 106s */
    { s: 0.101, p: 4.2, sy: 0.047, p2: 2.6 }     /* ≈ 62s */
  ];
  var alphaScale = Math.min(0.9, (0.36 + auroraChorus * 0.22) * (auroraPalette ? (auroraPalette.gain || 1) : 1));
  for (var i = 0; i < defs.length && i < auroraBlobSprites.length; i++) {
    var d = defs[i];
    var sprite = auroraBlobSprites[i];
    if (!sprite) continue;
    var bx = cx + Math.sin(t * d.s + d.p) * ampX;
    var by = cy + Math.cos(t * d.sy + d.p2) * ampY;
    var br = baseR * (1 - i * 0.14);
    ctx.globalAlpha = alphaScale * (1 - i * 0.12);
    ctx.drawImage(sprite, bx - br, by - br, br * 2, br * 2);
  }
  /* 副歌丝带：一条正弦扭动的光带（一条曲线，不是粒子海） */
  if (auroraChorus > 0.18 && auroraPalette) {
    var rgb = auroraCssToRgb(auroraPalette.colors[1]);
    var ribbonAlpha = Math.min(0.5, (auroraChorus - 0.18) * 1.4);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    var steps = 24;
    for (var s = 0; s <= steps; s++) {
      var rx = (s / steps) * w;
      var ry = h * (0.34 + Math.sin(s * 0.55 + t * 0.6) * 0.055 + Math.sin(s * 0.21 - t * 0.33) * 0.04);
      if (s === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
    }
    ctx.strokeStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + ribbonAlpha.toFixed(3) + ')';
    ctx.lineWidth = Math.max(1.5, h * 0.012);
    ctx.stroke();
  }
  /* 节拍心跳：全屏极轻亮度脉冲（克制，≤4%） */
  if (auroraBeat > 0.02) {
    ctx.globalAlpha = Math.min(0.05, auroraBeat * 0.05);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- 呼吸波形线（timeDomainData，低透亮度点缀） ---------- */
function tickAuroraWave() {
  if (!auroraWaveCtx) return;
  var ctx = auroraWaveCtx;
  var w = 0, h = 0;
  try { w = Math.floor(ctx.canvas.width / (ctx.getTransform ? ctx.getTransform().a || 1 : 1)); h = 140; } catch (e) { w = ctx.canvas.width; h = 140; }
  ctx.clearRect(0, 0, w, h);
  var td = (typeof timeDomainData !== 'undefined') ? timeDomainData : null;
  var mid = h * 0.5;
  var amp = h * 0.30;
  var sung = (auroraPalette && auroraPalette.sung) || '#dfe8ff';
  var rgb = auroraCssToRgb(sung);
  var pts = 96;
  if (!auroraWavePts || auroraWavePts.length !== pts) {
    auroraWavePts = [];
    for (var i = 0; i < pts; i++) auroraWavePts.push(mid);
  }
  var glow = 0.16 + auroraEnergy * 0.22 + auroraBeat * 0.12;
  for (var p = 0; p < pts; p++) {
    var target = mid;
    if (td && td.length) {
      var v = td[Math.floor((p / (pts - 1)) * (td.length - 1))] - 128;
      target = mid + (v / 128) * amp * 0.9;
    }
    auroraWavePts[p] += (target - auroraWavePts[p]) * 0.35;   /* 平滑防锯齿抖动 */
  }
  /* 两遍描线模拟柔光（避免慢速 shadowBlur）：宽淡 + 细亮 */
  for (var pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (var q = 0; q < pts; q++) {
      var x = (q / (pts - 1)) * w;
      if (q === 0) ctx.moveTo(x, auroraWavePts[q]); else ctx.lineTo(x, auroraWavePts[q]);
    }
    if (pass === 0) {
      ctx.strokeStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (glow * 0.45).toFixed(3) + ')';
      ctx.lineWidth = 5;
    } else {
      ctx.strokeStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + glow.toFixed(3) + ')';
      ctx.lineWidth = 1.4;
    }
    ctx.stroke();
  }
}

/* ---------- 歌词（三行布局：上淡出 / 当前行逐字点亮 / 下预览） ---------- */
function clearAuroraLyrics() {
  ['aurora-line-prev', 'aurora-line-main', 'aurora-line-next'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.innerHTML = '';
      el.classList.add('empty');
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
    }
  });
  auroraChars = [];
}

function escapeAuroraHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* 构建当前行逐字 span（点亮式卡拉OK；复用涂鸦墙的分词与揭示时间表） */
function renderAuroraMainLine(line, lineIdx) {
  var container = document.getElementById('aurora-line-main');
  if (!container) return;
  var text = (line && line.text) || '';
  if (!text || !text.trim()) {
    container.innerHTML = '<span class="aurora-idle">♪ · ♪</span>';
    container.classList.add('empty');
    auroraChars = [];
    auroraLineStartT = line ? line.t : 0;
    return;
  }
  container.classList.remove('empty');
  var tokens = (typeof tokenizeGraffitiText === 'function') ? tokenizeGraffitiText(text) : Array.from(text).map(function (ch, i) {
    return /\s/.test(ch) ? { type: 'space' } : { type: 'char', chars: [{ c: ch, i: i }] };
  });
  var reveals = (typeof computeGraffitiReveals === 'function')
    ? computeGraffitiReveals(line, text, { lineIdx: lineIdx, tokens: tokens })
    : [];
  var html = '';
  for (var ti = 0; ti < tokens.length; ti++) {
    var tk = tokens[ti];
    if (tk.type === 'space') { html += '<span class="aurora-space" aria-hidden="true"></span>'; continue; }
    if (tk.type === 'word') html += '<span class="aurora-word">';
    for (var ci = 0; ci < tk.chars.length; ci++) {
      html += '<span class="aurora-char" data-i="' + tk.chars[ci].i + '" aria-hidden="true">' +
        escapeAuroraHtml(tk.chars[ci].c) + '</span>';
    }
    if (tk.type === 'word') html += '</span>';
  }
  container.setAttribute('role', 'text');
  container.setAttribute('aria-label', text);
  container.innerHTML = html;
  /* 重新触发入场动画 */
  container.classList.remove('entering');
  void container.offsetWidth;
  container.classList.add('entering');
  /* 登记字符元素与揭示时间 */
  var spans = container.querySelectorAll('.aurora-char');
  auroraChars = [];
  for (var j = 0; j < spans.length; j++) {
    var dataI = parseInt(spans[j].getAttribute('data-i'), 10);
    auroraChars.push({ el: spans[j], reveal: reveals[dataI] != null ? reveals[dataI] : 0 });
  }
  auroraLineStartT = line.t || 0;
}

function setAuroraSideLine(id, line, cls) {
  var el = document.getElementById(id);
  if (!el) return;
  var text = (line && line.text) || '';
  if (text && text.trim()) {
    el.textContent = text;
    el.classList.remove('empty');
    if (cls) el.setAttribute('data-kind', cls);
  } else {
    el.textContent = '';
    el.classList.add('empty');
  }
}

function tickAuroraLyrics() {
  if (!auroraMode) return;
  var hasReal = lyricsLines && lyricsLines.length && lyricsLines.some(function (l) { return !l.fallback; });
  if (!hasReal) {
    if (auroraLastLineIdx !== -98) {
      auroraLastLineIdx = -98;
      var main = document.getElementById('aurora-line-main');
      if (main) {
        main.innerHTML = '<span class="aurora-idle">♪</span>';
        main.classList.add('empty');
      }
      auroraChars = [];
    }
    return;
  }
  var nowTime;
  try {
    /* 未播放过任何歌时 audio 可能为 null，按 0 处理以渲染首行 */
    nowTime = getAdjustedLyricPlaybackTime(audio ? (audio.currentTime || 0) : 0);
  } catch (e) { return; }
  var idx;
  try {
    idx = findStageLyricIndexAtTime(nowTime);
  } catch (e) { return; }
  if (idx < 0) idx = -1;
  if (idx !== auroraLastLineIdx) {
    auroraLastLineIdx = idx;
    var line = (idx >= 0 && idx < lyricsLines.length) ? lyricsLines[idx] : null;
    renderAuroraMainLine(line, idx);
    setAuroraSideLine('aurora-line-prev', idx > 0 ? lyricsLines[idx - 1] : null);
    setAuroraSideLine('aurora-line-next', idx >= 0 && idx + 1 < lyricsLines.length ? lyricsLines[idx + 1] : null);
    return;    /* 切行帧不点亮，下一帧开始推进 */
  }
  /* 逐字点亮推进 */
  if (!auroraChars.length) return;
  var elapsed = nowTime - auroraLineStartT;
  for (var i = 0; i < auroraChars.length; i++) {
    var c = auroraChars[i];
    if (!c.el) continue;
    var sung = c.el.classList.contains('is-sung');
    if (!sung && elapsed >= c.reveal) c.el.classList.add('is-sung');
    else if (sung && elapsed < c.reveal - 0.5) c.el.classList.remove('is-sung');   /* seek 倒退回退点亮 */
  }
}

/* 歌词数据变化轮询（lyricsLines 是普通数组无事件，胶片/涂鸦同款范式） */
function watchAuroraLyricsChange() {
  var token = ++auroraLyricsObserverToken;
  var lastLen = -1;
  function check() {
    if (token !== auroraLyricsObserverToken || !auroraMode) return;
    var len = (lyricsLines && lyricsLines.length) || 0;
    if (len !== lastLen) {
      lastLen = len;
      auroraLastLineIdx = -99;   /* 强制重渲染当前行 */
    }
    setTimeout(check, 600);
  }
  check();
}

/* ---------- 主循环（rAF 节流 ~30fps） ---------- */
function startAuroraLoop() {
  stopAuroraLoop();
  var lastTick = 0;
  var lastFrame = performance.now();
  function frame(now) {
    if (!auroraMode) return;
    var dt = Math.min(0.1, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    if (now - lastTick > 33) {
      lastTick = now;
      tickAuroraAudio(dt);
      tickAuroraBg(now);
      tickAuroraWave();
      checkAuroraFontChange();
      tickAuroraLyrics();
    }
    auroraRafId = requestAnimationFrame(frame);
  }
  auroraRafId = requestAnimationFrame(frame);
  watchAuroraLyricsChange();
}

function stopAuroraLoop() {
  if (auroraRafId) {
    cancelAnimationFrame(auroraRafId);
    auroraRafId = 0;
  }
  auroraLyricsObserverToken++;
}

/* ---------- 颜色小工具 ---------- */
function auroraCssToRgb(css) {
  var m = /^#?([0-9a-f]{6})$/i.exec(String(css || '').trim());
  if (!m) return [90, 110, 160];
  var n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function auroraRgbCss(r, g, b) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function auroraMixRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

function auroraRgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h, s: s, l: l };
}

/* ---------- resize ---------- */
function onAuroraResize() {
  if (!auroraMode) return;
  resizeAuroraCanvases();
}

/* ---------- 启动绑定 ---------- */
function initAurora() {
  applyAuroraMode(auroraMode, { save: false });
  window.addEventListener('resize', function () {
    clearTimeout(auroraResizeTimer);
    auroraResizeTimer = setTimeout(onAuroraResize, 180);
  });
}

/* 延迟到 DOM 就绪后初始化（本模块在 index-loader 末尾加载，DOM 已就绪） */
scheduleUiWarmTask ? scheduleUiWarmTask(initAurora, 300) : setTimeout(initAurora, 300);
