/* =========================================================================
   OrangeSea · 雨夜车窗（Rainy Cab · 深夜行车）
   情绪沉浸模式：你坐在深夜行车的后排看侧窗——玻璃上雨滴滑行，
   窗外是专辑封面同色的虚化霓虹 bokeh，歌词像写在雾玻璃上，
   旧句留成水痕字被缓缓冲淡。对标 lofi 视觉的"陪伴感"。

   克制原则：全场景只有「一块玻璃 + 一片光斑 + 一场雨」三样东西，
   光斑是散景圆而非建模城市（抽象化防廉价），色彩全部取自专辑封面。
   照抄 film-radio / graffiti 范式：body.rainy + localStorage + 覆盖层互斥。

   分层：L0 窗外光斑 canvas（低分辨率 + CSS blur）/ L1 玻璃雾气遮罩(纯CSS) /
         L2 雨滴 canvas（全分辨率对象池）/ L3 雾玻璃歌词 + 水痕 /
         L4 仪表台剪影(纯CSS)。
   物理细节：bass 让"车"微颤时只抖窗外光斑（玻璃与雨滴相对不动）；
   歌词间隙(间奏)雨渐渐变大；副歌天际线泛暖光。
   ========================================================================= */

var RAINY_STORE_KEY = 'orangesea-rainy-cab-v1';
var rainyMode = readBooleanPreference(RAINY_STORE_KEY, false);
var rainyRafId = 0;
var rainyObserver = null;
var rainyLyricsObserverToken = 0;
var rainyLastLineIdx = -99;
var rainyChars = [];
var rainyLineStartT = 0;
var rainyResizeTimer = 0;

/* 画布 */
var rainyFarCtx = null;
var rainyGlassCtx = null;
var rainyFarW = 0, rainyFarH = 0;      /* 逻辑尺寸（CSS 像素） */
var rainyGlassW = 0, rainyGlassH = 0;

/* 取色 */
var rainyPalette = null;               /* { colors:[...], sung, luma } */
var rainyCoverUrl = '';
var rainyPaletteSeq = 0;
var rainyNeonSprites = [];             /* 每色一张 bokeh 精灵 */

/* 光斑群（两层视差） */
var rainyBokeh = [];
var rainySkyGrad = null;             /* 夜空渐变缓存（副歌暖度量化 4 档） */
var rainySkyGradQ = -1;
var rainySkyGradH = 0;

/* 雨滴渲染状态（GL 方案，详见下方「雨滴系统」注释块） */

/* 车身微颤（弹簧） */
var rainyShakeX = 0, rainyShakeY = 0, rainyShakeVX = 0, rainyShakeVY = 0;

/* 氛围状态 */
var rainyEnergy = 0;
var rainyBassRaw = 0;
var rainyPrevBassRaw = 0;
var rainyChorus = 0;
var rainyInterlude = 0;               /* 间奏雨势增强 0~1 */
var rainyInterludeTimer = 0;          /* 连续无行累计秒数 */
var rainyLastFrame = 0;
var rainyLastFontKey = null;          /* 字体变化检测（fx.lyricFont 实时同步） */

/* ---------- 切换 ---------- */
function applyRainyMode(on, opts) {
  opts = opts || {};
  rainyMode = !!on;
  /* 四方互斥：经视觉模式注册表退出其它覆盖层模式 */
  if (rainyMode && typeof exitOtherVisualizerOverlays === 'function') {
    exitOtherVisualizerOverlays('rainy', { save: true });
  }
  document.body.classList.toggle('rainy', rainyMode);
  var overlay = document.getElementById('rainy-overlay');
  if (overlay) overlay.setAttribute('aria-hidden', rainyMode ? 'false' : 'true');
  if (opts.save) saveBooleanPreference(RAINY_STORE_KEY, rainyMode);
  if (rainyMode) {
    startRainy();
  } else {
    stopRainy();
  }
  if (typeof refreshPresetGrid === 'function') refreshPresetGrid();
  /* 控制台「雨夜车窗」设置组随模式显隐 */
  if (typeof updateRainyControlVisibility === 'function') updateRainyControlVisibility();
  if (opts.toast) showToast(rainyMode ? '雨夜车窗已开启' : '已切回标准模式');
}

function toggleRainyMode() {
  applyRainyMode(!rainyMode, { save: true, toast: true });
}

/* ---------- 启动 / 停止 ---------- */
function startRainy() {
  /* 字号跟随「歌词大小」设置（--mfs，CSS 主行乘算） */
  if (typeof applyOverlayModeFontScale === "function") applyOverlayModeFontScale(document.getElementById("rainy-overlay"));
  ensureRainyCanvases();
  syncRainyCover(true);
  applyRainySceneSettings();
  initRainyGL();         /* WebGL2 雨滴层（不支持时优雅降级为纯背景） */
  rainyLastLineIdx = -99;
  rainyInterludeTimer = 0;
  rainyInterlude = 0;
  startRainyObserver();
  startRainyLoop();
}

function stopRainy() {
  stopRainyLoop();
  stopRainyObserver();
  rainyLastLineIdx = -99;
  rainyChars = [];
  destroyRainyGL();
  rainyGLAvail = null;   /* 下次启动重新探测 */
  rainyShakeX = rainyShakeY = rainyShakeVX = rainyShakeVY = 0;
  rainyChorus = 0;
  clearRainyLyrics();
}

/* ---------- 动效设置应用（fx.rainFog 雾气 / fx.rainCity 车流 / fx.rainSpeed 车速） ---------- */
function rainySettingVal(key, fallback) {
  var v = (typeof fx !== 'undefined' && fx) ? Number(fx[key]) : NaN;
  return isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

/* 雾气：玻璃 tint 层浓度 + 窗外模糊度（低频调用，改 CSS var） */
function applyRainySceneSettings() {
  var fog = rainySettingVal('rainFog', 0.5);
  var overlay = document.getElementById('rainy-overlay');
  if (overlay) {
    overlay.style.setProperty('--rc-fog-o', (0.18 + fog * 0.42).toFixed(3));
    overlay.style.setProperty('--rc-far-blur', (7 + fog * 9).toFixed(1) + 'px');
  }
}

/* 车流亮度倍率（光斑 alpha） */
function rainyCityFactor() {
  return 0.5 + rainySettingVal('rainCity', 0.6) * 0.9;
}

/* 车速倍率（横移视差） */
function rainyCarSpeedFactor() {
  return 0.55 + rainySettingVal('rainSpeed', 0.5) * 1.1;
}

var rainyLastSettingsKey = '';
/* 低频检测设置变化（1s 一次，避免每帧写 CSS var） */
function checkRainySettingsChange(now) {
  var key = rainySettingVal('rainFog', 0.5).toFixed(2);
  if (now - rainyLastSettingsTick < 1000) return;
  rainyLastSettingsTick = now;
  if (key !== rainyLastSettingsKey) {
    rainyLastSettingsKey = key;
    applyRainySceneSettings();
  }
}
var rainyLastSettingsTick = 0;

/* ---------- 状态同步 ---------- */
function startRainyObserver() {
  stopRainyObserver();
  rainyObserver = new MutationObserver(function () {
    syncRainyCover(false);
  });
  var cover = document.getElementById('control-cover');
  if (cover) rainyObserver.observe(cover, { attributes: true, attributeFilter: ['style'] });
}

function stopRainyObserver() {
  if (rainyObserver) {
    rainyObserver.disconnect();
    rainyObserver = null;
  }
}

/* ---------- 封面取色（与流光同思路，独立实现保持模块自包含） ---------- */
function syncRainyCover(force) {
  var src = document.getElementById('control-cover');
  if (!src) return;
  var bg = src.style.backgroundImage || '';
  if (!bg || bg === 'none') bg = getComputedStyle(src).backgroundImage || '';
  var url = '';
  var m = /url\((["']?)([^"')]+)\1\)/.exec(bg);
  if (m) url = m[2];
  if (!force && url === rainyCoverUrl) return;
  rainyCoverUrl = url;
  if (!url || typeof Image === 'undefined') return;
  var seq = ++rainyPaletteSeq;
  rainyLoadPaletteImage(url, 0, function (img) {
    if (seq !== rainyPaletteSeq) return;
    var palette = null;
    if (img) {
      try { palette = rainyExtractPalette(img); } catch (e) { palette = null; }
    }
    if (!palette) palette = rainyDefaultPalette();
    rainyPalette = palette;
    rainyApplyPalette();
  });
}

function rainyLoadPaletteImage(url, attempt, done) {
  var img = new Image();
  if (attempt === 0) img.crossOrigin = 'anonymous';
  img.onload = function () {
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
    if (attempt === 0) rainyLoadPaletteImage(url, 1, done);
    else done(null);
  };
  try { img.src = url; } catch (e) { done(null); }
}

function rainyExtractPalette(img) {
  var size = 32;
  var c = document.createElement('canvas');
  c.width = c.height = size;
  var ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  var data = ctx.getImageData(0, 0, size, size).data;
  var buckets = [];
  for (var i = 0; i < 24; i++) buckets.push({ r: 0, g: 0, b: 0, n: 0, s: 0 });
  var count = 0;
  var sumR = 0, sumG = 0, sumB = 0;
  for (var p = 0; p < data.length; p += 4) {
    if (data[p + 3] < 125) continue;
    var r = data[p], g = data[p + 1], b = data[p + 2];
    count++;
    sumR += r; sumG += g; sumB += b;
    var hsl = rainyRgbToHsl(r, g, b);
    var luma = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    if (hsl.s < 0.16 || luma < 0.06 || luma > 0.97) continue;
    var bi = Math.min(23, Math.max(0, Math.floor(hsl.h * 24))) % 24;
    var bk = buckets[bi];
    bk.r += r; bk.g += g; bk.b += b; bk.n++; bk.s += hsl.s;
  }
  var colors = [];
  var sorted = buckets.slice().sort(function (x, y) {
    return (y.n * (0.25 + y.s)) - (x.n * (0.25 + x.s));
  });
  for (var k = 0; k < sorted.length && colors.length < 3; k++) {
    if (sorted[k].n < 6) break;
    colors.push(rainyRgbCss(
      Math.round(sorted[k].r / sorted[k].n),
      Math.round(sorted[k].g / sorted[k].n),
      Math.round(sorted[k].b / sorted[k].n)));
  }
  if (!colors.length) {
    var mid = [70, 90, 130];
    colors = [rainyRgbCss(mid[0], mid[1], mid[2]), rainyRgbCss(120, 70, 110), rainyRgbCss(40, 55, 90)];
  } else if (colors.length === 1) {
    var c1 = rainyCssToRgb(colors[0]);
    colors.push(rainyRgbCss.apply(null, rainyMixRgb(c1, [255, 255, 255], 0.28)));
    colors.push(rainyRgbCss.apply(null, rainyMixRgb(c1, [12, 14, 26], 0.34)));
  } else if (colors.length === 2) {
    colors.push(rainyRgbCss.apply(null, rainyMixRgb(rainyCssToRgb(colors[0]), rainyCssToRgb(colors[1]), 0.5)));
  }
  var brightest = colors[0], bestLuma = -1;
  colors.forEach(function (cc) {
    var rgb = rainyCssToRgb(cc);
    var luma2 = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
    if (luma2 > bestLuma) { bestLuma = luma2; brightest = cc; }
  });
  /* 暗色/灰调封面补偿：雨夜的"城市霓虹"意象依赖可见的色彩。
     提亮暗主色 + 灰调时做色相扩展，输出 5 色板（供光斑多样化）与亮度增益 */
  var vivid = rainyVividPalette(colors, count, sumR, sumG, sumB);
  return { colors: vivid.colors, extended: vivid.extended, sung: brightest, luma: bestLuma, gain: vivid.gain };
}

/* ---------- 暗色/灰调封面补偿 ----------
   · 亮度补偿：封面平均亮度 <0.30 时逐级提亮主色（下限 0.16）；
   · 饱和补偿：主色平均饱和 <0.26 时以第一主色为基做 ±色相偏移；
   · extended：5 色板（3 主色 + 亮变体 + 暖白），远灯光斑取色更多样；
   · gain：渲染端 alpha 增益（上限 1.75）。 */
function rainyVividPalette(colors, count, sumR, sumG, sumB) {
  var coverLuma = count ? ((sumR / count) * 0.299 + (sumG / count) * 0.587 + (sumB / count) * 0.114) / 255 : 0;
  var out = colors.map(function (cc) { return rainyAdjustColor(cc, 0.16, 0.22); });
  var avgS = 0;
  out.forEach(function (cc) { avgS += rainyRgbToHsl.apply(null, rainyCssToRgb(cc)).s; });
  avgS /= Math.max(1, out.length);
  if (avgS < 0.34 && out.length) {   /* 阈值高于补偿下限 0.22：灰调（补偿后 s≈0.27）仍触发色相扩展 */
    var base = rainyCssToRgb(out[0]);
    var hsl = rainyRgbToHsl(base[0], base[1], base[2]);
    var sat = Math.max(0.32, hsl.s);
    if (out.length >= 2) out[1] = rainyHslCss(hsl.h + 0.09, sat, Math.max(hsl.l, 0.36));
    if (out.length >= 3) out[2] = rainyHslCss(hsl.h - 0.12, Math.max(0.28, sat - 0.06), Math.max(hsl.l * 0.85, 0.22));
  }
  var extended = out.slice();
  if (extended.length) {
    var e0 = rainyCssToRgb(extended[0]);
    extended.push(rainyRgbCss.apply(null, rainyMixRgb(e0, [255, 255, 255], 0.45)));   /* 亮变体 */
    extended.push('#ffd9a8');                                                          /* 暖白（路灯钠光记忆） */
    extended.push('#cfe4ff');                                                          /* 冷白（月光/日光灯记忆） */
  }
  var gain = Math.max(1, Math.min(1.75, 1 + (0.30 - coverLuma) * 2.0));
  return { colors: out, extended: extended, gain: gain };
}

/* 单色补偿：亮度/饱和低于下限时拉起（与流光同思路，独立实现） */
function rainyAdjustColor(css, lumaFloor, satFloor) {
  var rgb = rainyCssToRgb(css);
  var hsl = rainyRgbToHsl(rgb[0], rgb[1], rgb[2]);
  var luma = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
  if (luma < lumaFloor) hsl.l = Math.min(0.42, hsl.l + (lumaFloor - luma) * 0.9);
  if (hsl.s < satFloor) hsl.s = satFloor + (satFloor - hsl.s) * 0.4;
  return rainyHslCss(hsl.h, hsl.s, hsl.l);
}

function rainyHslCss(h, s, l) {
  h = ((h % 1) + 1) % 1;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  var r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = rainyHueToRgb(p, q, h + 1 / 3);
    g = rainyHueToRgb(p, q, h);
    b = rainyHueToRgb(p, q, h - 1 / 3);
  }
  return rainyRgbCss(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
}

function rainyHueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function rainyDefaultPalette() {
  return {
    colors: ['#3d5a8f', '#8f5a7d', '#22314f'],
    sung: '#7fa0d0',
    luma: 0.25
  };
}

function rainyApplyPalette() {
  var p = rainyPalette;
  if (!p) return;
  var overlay = document.getElementById('rainy-overlay');
  if (overlay) {
    overlay.style.setProperty('--rc-neon1', p.colors[0]);
    overlay.style.setProperty('--rc-neon2', p.colors[1]);
    overlay.style.setProperty('--rc-neon3', p.colors[2]);
    overlay.style.setProperty('--rc-sung', p.sung);
  }
  var extended = (p.extended && p.extended.length) ? p.extended : p.colors.concat(['#cfd8e8']);
  rainyNeonSprites = extended.map(function (cc) {
    return rainyBuildBokehSprite(cc);
  });
  /* 已有光斑群换色：重建 */
  if (rainyBokeh.length) buildRainyBokeh();
}

/* ---------- bokeh 精灵与光斑群（三层纵深：远灯 / 中斑 / 近晕） ----------
   远灯：大量小而亮的清晰点 = 城市远处的路灯车灯（色彩取全扩展板，含暖白冷白）；
   中斑：中等模糊光团 = 街道霓虹；
   近晕：少量大光晕 = 近处招牌泛光。
   三层速度差制造"车在走"的视差；色彩不足的封面由 vivid 补偿 + 暖白/冷白兜底。 */
function buildRainyBokeh() {
  rainyBokeh = [];
  var w = rainyFarW || window.innerWidth || 1280;
  var h = rainyFarH || window.innerHeight || 800;
  var spriteCount = Math.max(1, rainyNeonSprites.length);
  function push(layer, n, make) {
    for (var i = 0; i < n; i++) rainyBokeh.push(make(i));
  }
  /* L0 远灯（小/亮/多） */
  push(0, 80, function () {
    return {
      x: Math.random() * w,
      y: h * (0.10 + Math.random() * 0.55),
      r: 4 + Math.random() * 7,
      speed: 7 + Math.random() * 9,
      layer: 0,
      spriteIdx: Math.floor(Math.random() * spriteCount),
      alpha: 0.7 + Math.random() * 0.3,
      twPhase: Math.random() * Math.PI * 2,
      twSpeed: 0.5 + Math.random() * 1.6,
      jitter: 0.8,
      flare: 0
    };
  });
  /* L1 中斑（霓虹光团，更大更亮） */
  push(1, 34, function () {
    return {
      x: Math.random() * w,
      y: h * (0.06 + Math.random() * 0.60),
      r: 20 + Math.random() * 34,
      speed: 18 + Math.random() * 16,
      layer: 1,
      spriteIdx: Math.floor(Math.random() * Math.min(spriteCount, 3)),
      alpha: 0.34 + Math.random() * 0.22,
      twPhase: Math.random() * Math.PI * 2,
      twSpeed: 0.6 + Math.random() * 1.8,
      jitter: 1.6,
      flare: 0
    };
  });
  /* L2 近晕（大光晕，偶尔掠过） */
  push(2, 14, function () {
    return {
      x: Math.random() * w,
      y: h * (0.04 + Math.random() * 0.62),
      r: 56 + Math.random() * 80,
      speed: 40 + Math.random() * 32,
      layer: 2,
      spriteIdx: Math.floor(Math.random() * Math.min(spriteCount, 3)),
      alpha: 0.14 + Math.random() * 0.12,
      twPhase: Math.random() * Math.PI * 2,
      twSpeed: 0.4 + Math.random() * 1.0,
      jitter: 3,
      flare: 0
    };
  });
}

/* ---------- bokeh 精灵与光斑群 ---------- */
function rainyBuildBokehSprite(colorCss) {
  var size = 128;
  var c = document.createElement('canvas');
  c.width = c.height = size;
  var ctx = c.getContext('2d');
  var rgb = rainyCssToRgb(colorCss);
  var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',1)');
  g.addColorStop(0.45, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.7)');
  g.addColorStop(0.72, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.28)');
  g.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function ensureRainyCanvases() {
  var far = document.getElementById('rainy-far-canvas');
  var glass = document.getElementById('rainy-glass-canvas');
  if (far && !rainyFarCtx) rainyFarCtx = far.getContext('2d');
  /* 注意：玻璃 canvas 留给 WebGL2（雨滴折射层），此处不要拿 2d context——
     canvas 一旦绑定 2d 就永远无法切换为 webgl2。 */
  resizeRainyCanvases();
  if (!rainyPalette) rainyPalette = rainyDefaultPalette();
  if (!rainyNeonSprites.length) rainyApplyPalette();
  if (!rainyBokeh.length) buildRainyBokeh();
}

function resizeRainyCanvases() {
  var w = window.innerWidth || 1280;
  var h = window.innerHeight || 800;
  var far = document.getElementById('rainy-far-canvas');
  if (far && rainyFarCtx) {
    /* 0.6 分辨率：折射采样需要足够细节，CSS blur 后依然柔化 */
    far.width = Math.max(2, Math.floor(w * 0.6));
    far.height = Math.max(2, Math.floor(h * 0.6));
  }
  rainyFarW = w; rainyFarH = h;
  /* 玻璃 canvas 尺寸由 renderRainyGlass 按需自适应（WebGL 视口），此处不动它 */
  rainyGlassW = w; rainyGlassH = h;
  buildRainyBokeh();
}

/* ---------- 音频特征 ---------- */
function rainyBinAvg(from, to) {
  if (typeof frequencyData === 'undefined' || !frequencyData || !frequencyData.length) return 0;
  var sum = 0, n = 0;
  var hi = Math.min(to, frequencyData.length - 1);
  for (var i = from; i <= hi; i++) { sum += frequencyData[i]; n++; }
  return n ? (sum / n) / 255 : 0;
}

function tickRainyAudio(dtSec) {
  rainyBassRaw = rainyBinAvg(1, 8);
  var energyRaw = rainyBinAvg(2, 160) * 0.7 + rainyBinAvg(161, 300) * 0.3;
  rainyEnergy += (energyRaw - rainyEnergy) * Math.min(1, dtSec * 3.0);
  /* bass 突增 → 车身颤动冲量（幅度克制，≤2px） */
  if (rainyBassRaw - rainyPrevBassRaw > 0.12 && rainyBassRaw > 0.26) {
    rainyShakeVX += (Math.random() - 0.5) * 26;
    rainyShakeVY += (Math.random() - 0.5) * 18;
  }
  rainyPrevBassRaw = rainyBassRaw;
  /* 弹簧回中 */
  rainyShakeVX += -rainyShakeX * 60 * dtSec;
  rainyShakeVY += -rainyShakeY * 60 * dtSec;
  var damp = Math.pow(0.0025, dtSec);
  rainyShakeVX *= damp; rainyShakeVY *= damp;
  rainyShakeX += rainyShakeVX * dtSec;
  rainyShakeY += rainyShakeVY * dtSec;
  rainyShakeX = Math.max(-2.2, Math.min(2.2, rainyShakeX));
  rainyShakeY = Math.max(-2.2, Math.min(2.2, rainyShakeY));
  /* 副歌闸门 */
  var chorusTarget = Math.max(0, Math.min(1, (rainyEnergy - 0.34) / 0.30));
  var k = chorusTarget > rainyChorus ? 0.9 : 0.35;
  rainyChorus += (chorusTarget - rainyChorus) * Math.min(1, dtSec * k);
  /* 间奏检测：当前无歌词行持续 > 1.5s → 雨渐渐变大 */
  var noLine = rainyLastLineIdx < 0;
  rainyInterludeTimer = noLine ? rainyInterludeTimer + dtSec : 0;
  var interludeTarget = rainyInterludeTimer > 1.5 ? 1 : 0;
  rainyInterlude += (interludeTarget - rainyInterlude) * Math.min(1, dtSec * (interludeTarget ? 0.5 : 1.2));
}

/* ---------- 窗外光斑绘制 ---------- */
function tickRainyFar(dtSec, now) {
  if (!rainyFarCtx) return;
  var ctx = rainyFarCtx;
  var w = ctx.canvas.width, h = ctx.canvas.height;
  var scale = w / Math.max(1, rainyFarW);      /* 逻辑 → canvas 像素 */
  var t = now * 0.001;
  var carSpeed = (1 + rainyEnergy * 1.4) * rainyCarSpeedFactor();   /* 车速设置 × 音乐能量 */
  var cityBright = rainyCityFactor();
  var drift = scale * dtSec;
  ctx.clearRect(0, 0, w, h);
  /* 夜空基底渐变（随副歌泛暖 = 天际线渐亮）；副歌量量化 4 档缓存离线渐变，
     避免每帧铸造新 gradient 对象 + 字符串拼接 */
  var warm = rainyChorus * 0.34;
  var warmQ = Math.round(warm * 4);
  if (rainySkyGradQ !== warmQ || !rainySkyGrad || rainySkyGradH !== h) {
    rainySkyGradQ = warmQ;
    rainySkyGradH = h;
    var g = ctx.createLinearGradient(0, 0, 0, h);
    var warm2 = warmQ / 4;
    g.addColorStop(0, 'rgba(10,14,24,1)');
    g.addColorStop(0.72, 'rgba(' + Math.round(24 + warm2 * 100) + ',' + Math.round(28 + warm2 * 50) + ',' + Math.round(44 + warm2 * 26) + ',1)');
    g.addColorStop(1, 'rgba(' + Math.round(34 + warm2 * 120) + ',' + Math.round(30 + warm2 * 54) + ',' + Math.round(50 + warm2 * 22) + ',1)');
    rainySkyGrad = g;
  }
  ctx.fillStyle = rainySkyGrad;
  ctx.fillRect(0, 0, w, h);
  /* 车颤只作用于窗外景象（玻璃上的雨滴相对不动） */
  ctx.save();
  ctx.translate(rainyShakeX * scale, rainyShakeY * scale);
  ctx.globalCompositeOperation = 'lighter';
  var treble = rainyBinAvg(280, 420);
  var gain = rainyPalette ? (rainyPalette.gain || 1) : 1;
  for (var i = 0; i < rainyBokeh.length; i++) {
    var b = rainyBokeh[i];
    b.x -= b.speed * carSpeed * dtSec;
    if (b.x < -b.r * 2.4) {
      b.x = w / scale + b.r * 2;
      b.y = b.layer === 0
        ? rainyFarH * (0.10 + Math.random() * 0.55)
        : (b.layer === 1
          ? rainyFarH * (0.06 + Math.random() * 0.60)
          : rainyFarH * (0.04 + Math.random() * 0.62));
    }
    /* treble 高时光斑随机 flare（远处霓虹偶尔闪烁） */
    if (treble > 0.24 && Math.random() < 0.012) b.flare = 1;
    b.flare *= Math.pow(0.02, dtSec);
    var tw = 0.72 + 0.28 * Math.sin(t * b.twSpeed + b.twPhase);
    /* 路面颠簸：光斑轻微上下浮动（幅度按层次递增） */
    var yJitter = Math.sin(t * 0.7 + b.twPhase) * b.jitter;
    var sprite = rainyNeonSprites[b.spriteIdx % Math.max(1, rainyNeonSprites.length)];
    if (!sprite) continue;
    var r = b.r * scale;
    ctx.globalAlpha = Math.min(0.9, Math.min(1, b.alpha * tw + b.flare * 0.30) * gain * cityBright);
    ctx.drawImage(sprite, b.x * scale - r, (b.y + yJitter) * scale - r, r * 2, r * 2);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- 雨滴系统（WebGL2 shader 方案，照 rain-glass-demo 实现） ----------
   与 canvas 对象池完全不同的技术路线：
   · 雨滴位置/滑落/拖尾全部在 fragment shader 里用网格哈希 + 时间相位计算；
   · 折射 = 累积水珠遮罩 g0 的屏幕空间梯度（dFdx/dFdy）当法线，偏移 UV 采样背景；
   · mipmap LOD 做景深：背景模糊、水珠内部清晰（透过水滴看清窗外光斑）；
   · 边缘梯度压暗出轮廓 + specular 边缘高光 + 曝光/暗角/抖动去色带。
   背景纹理 = far canvas（canvas 2D 光斑层，保留封面取色/车颤/副歌暖光）。 */

var RAINY_GLSL_VERT = `#version 300 es
layout(location=0) in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

var RAINY_GLSL_MAIN = `#version 300 es
precision highp float;

uniform sampler2D uBg;
uniform vec2  uRes;
uniform float uTime;
uniform float uDensity;   // 雨量 0..1
uniform float uSpeed;     // 滑落速度倍率
uniform float uRefract;   // 折射强度
uniform float uBlur;      // 背景虚化 (mip lod)

out vec4 fragColor;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec4 hash42(vec2 p){
  vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

/* 一层滑动雨滴：grid=网格密度, 返回 (主水珠, 拖尾) */
vec2 RainLayer(vec2 uv, float t, vec2 grid, float seed, float sizeMul){
  float cellAspect = (uRes.x / grid.x) / (uRes.y / grid.y); // 单元格宽/高
  vec2 st = uv * grid;
  vec2 id = floor(st);
  vec2 gv = fract(st);
  // p: 单元格内的均匀度量空间（1 个单位 = 格高），消除格形畸变
  vec2 p = vec2(gv.x * cellAspect, gv.y);

  // 列级随机：同一列水珠共享横向位置与摆动
  float colRnd = hash12(vec2(id.x * 13.7, seed));
  vec4 rnd = hash42(id + vec2(seed, seed * 1.7));

  // 雨量控制：只有部分格子有水珠
  float ena = step(1.0 - uDensity, rnd.w);

  // —— 滑落时间线：先粘住(hold)，再加速滑出 ——
  float dur = mix(5.0, 11.0, rnd.y);
  float phase = fract(t / dur + rnd.z);          // 0..1 一个生命周期
  float holdT = 0.35;                            // 前 35% 时间静止蓄水
  float slide = smoothstep(holdT, 1.0, phase);
  slide = pow(slide, 1.35);                      // 重力加速

  // —— 横向蜿蜒：低频正弦叠加（stick-slip 抖动感的近似）——
  float dropXu = 0.5 + (colRnd - 0.5) * 0.45;
  float wob = sin(t * 0.9 + colRnd * 6.28 + sin(t * 1.3 + colRnd * 9.4) * 0.8) * 0.05;
  float px = (dropXu + wob) * cellAspect;
  float py = 1.25 - slide * 1.75;                // 从格外上方滑到格外下方

  // 蓄水期长大、收尾缩小
  float grow = mix(0.55, 1.0, smoothstep(0.0, holdT, phase));
  float shrink = 1.0 - smoothstep(0.85, 1.0, phase) * 0.3;
  float R = 0.16 * sizeMul * grow * shrink;

  // 主水珠（穹顶剖面，保证梯度遍布整颗水珠 -> 折射连续）
  vec2 dp = p - vec2(px, py);
  float stretch = 1.0 + slide * 0.18;            // 下落越快越扁长（克制）
  dp.y /= stretch;
  float drop = 1.0 - smoothstep(0.0, R, length(dp));

  // —— 拖尾：淡淡的水膜泪痕（粗细随机抖动）+ 零星随机残珠 ——
  float ry = p.y - py;                           // 距水珠的高度差
  float trail = 0.0;
  if (ry > 0.0 && ry < 1.0){
    /* 水膜泪痕：宽度沿路径随机抖动（真实水痕不直也不均匀） */
    float wobLine = sin(ry * 23.0 + rnd.x * 40.0) * 0.5 + sin(ry * 61.0 + rnd.z * 31.0) * 0.3;
    float lineW = mix(0.016, 0.004, ry) * sizeMul * (0.8 + 0.4 * wobLine);
    float lineX = p.x - px + wobLine * 0.008 * ry;
    float line = 1.0 - smoothstep(0.0, lineW, abs(lineX));
    float lineFade = max(0.0, 1.0 - ry * 0.9);
    float tearLine = line * lineFade * lineFade * 0.38;
    /* 零星残珠：hash 打散位置，不再等距成串 */
    float beadFreq = 6.0;
    float beadCell = floor(ry * beadFreq);
    vec4 br = hash42(vec2(id.x * 7.3 + beadCell * 13.1, seed + rnd.y * 91.0));
    float beadOn = step(0.55, br.w);             // 只有约 45% 的位置有残珠
    float by = fract(ry * beadFreq);
    vec2 tp = vec2(p.x - px + (br.x - 0.5) * 0.05 * sizeMul, (by - 0.5) / beadFreq);
    float tr = mix(0.030, 0.008, ry) * sizeMul * (0.5 + br.z);
    float bead = (1.0 - smoothstep(0.0, tr, length(tp))) * beadOn;
    float fade = max(0.0, 1.0 - ry * 1.2);       // 越老越淡
    trail = max(tearLine, bead * fade * fade * 0.8);
  }
  return vec2(drop, trail * 0.6) * ena;
}

/* 静态冷凝小水珠：缓慢凝结、闪现、蒸发 */
float StaticDrops(vec2 uv, float t){
  vec2 grid = vec2(28.0);
  float cellAspect = (uRes.x / grid.x) / (uRes.y / grid.y);
  vec2 st = uv * grid;
  vec2 id = floor(st);
  vec2 gv = fract(st);
  vec4 rnd = hash42(id * 1.37 + 3.1);
  vec2 center = 0.2 + 0.6 * rnd.xy;
  vec2 p = (gv - center) * vec2(cellAspect, 1.0);
  float r = 0.05 + 0.13 * rnd.z;
  float vis = smoothstep(-0.4, 0.4, sin(t * 0.35 + rnd.w * 6.28)); // 缓慢明灭
  return (1.0 - smoothstep(0.0, r, length(p))) * vis;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float t = uTime;

  // —— 累积水珠遮罩（不截断，保留梯度信息）——
  vec2 l1 = RainLayer(uv, t * uSpeed, vec2(9.0, 2.5), 1.0, 1.0);
  vec2 l2 = RainLayer(uv + 13.7, t * uSpeed * 0.85, vec2(17.0, 5.0), 7.0, 0.62);
  float g0 = l1.x + l1.y + (l2.x + l2.y) * 0.8;
  /* 汇聚：大水珠滑落路径上的静态微滴被吸收（经过处微滴减弱，滑珠更亮） */
  float staticD = StaticDrops(uv, t);
  float absorb = clamp((l1.y + l2.y) * 2.2, 0.0, 1.0);   // 拖尾区域 = 已滑落的路径
  g0 += staticD * (0.35 + 0.65 * uDensity) * (1.0 - absorb * 0.85);

  // —— 屏幕空间梯度当作水滴法线，偏移 UV 模拟透镜折射（画面颠倒感）——
  vec2 n = vec2(dFdx(g0), dFdy(g0));
  vec2 offset = n * uRefract;

  // —— mipmap LOD 做景深虚化；水珠内部清晰（透过水滴看清背景）——
  float m = clamp(g0, 0.0, 1.0);
  float lod = max(0.0, uBlur * (1.0 - m * 0.9));
  vec3 col = textureLod(uBg, uv + offset, lod).rgb;

  // 水滴聚光：内部提亮；边缘（梯度大处）压暗出轮廓
  col *= 1.0 + m * 0.35;
  col *= 1.0 - clamp(length(n) * 4.0, 0.0, 0.38);
  // 水珠表面微弱的环境反射（让暗背景前的水滴也可辨）
  col += m * vec3(0.030, 0.038, 0.052);

  // 水珠边缘高光
  vec3 nn = normalize(vec3(-n, 0.35) + 1e-5);
  float spec = pow(max(0.0, dot(nn, normalize(vec3(-0.4, 0.8, 0.6)))), 16.0);
  col += spec * m * vec3(0.9, 0.95, 1.0) * 0.9;

  // 整体曝光 + 暗角 + 冷调 + 抖动去色带
  col *= 1.12;
  vec2 q = uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.9;
  col = pow(col, vec3(0.96, 0.98, 1.0));
  col += (hash12(gl_FragCoord.xy * 0.7 + fract(t) * 100.0) - 0.5) * 0.015;

  fragColor = vec4(col, 1.0);
}
`;

/* ---------- GL 状态 ---------- */
var rainyGL = null;                    /* WebGL2 context（null = 不支持，优雅降级） */
var rainyGLProg = null;
var rainyGLTex = null;
var rainyGLVao = null;
var rainyGLVbo = null;                 /* 顶点缓冲必须持有引用：destroy 时 deleteBuffer */
var rainyGLVs = null;
var rainyGLFs = null;
var rainyGLUniforms = null;
var rainyGLSimTime = 0;
var rainyGLAvail = null;               /* null=未探测 true/false=探测结果 */

function rainyCompileShader(gl, type, src) {
  var s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    if (typeof console !== 'undefined') console.warn('[rainy] shader compile failed:', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

/* 半成品/成品 GL 对象统一删除（同一 context 常驻 DOM canvas，漏删即永久滞留） */
function rainyDeleteGLObjects(gl, prog, vs, fs, tex, vao, vbo) {
  if (!gl) return;
  try {
    if (vbo) gl.deleteBuffer(vbo);
    if (vao) gl.deleteVertexArray(vao);
    if (tex) gl.deleteTexture(tex);
    if (prog) gl.deleteProgram(prog);
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
  } catch (e) { }
}

/* 初始化 WebGL2（幂等）；失败返回 false（调用方降级为无雨滴） */
function initRainyGL() {
  if (rainyGLAvail !== null) return rainyGLAvail;
  var gl = null, vs = null, fs = null, prog = null, vao = null, vbo = null, tex = null;
  try {
    var canvas = document.getElementById('rainy-glass-canvas');
    if (!canvas) { rainyGLAvail = false; return false; }
    gl = canvas.getContext('webgl2', { antialias: false, alpha: true });
    if (!gl) { gl = null; rainyGLAvail = false; return false; }
    vs = rainyCompileShader(gl, gl.VERTEX_SHADER, RAINY_GLSL_VERT);
    fs = rainyCompileShader(gl, gl.FRAGMENT_SHADER, RAINY_GLSL_MAIN);
    if (!vs || !fs) { rainyGLAvail = false; return false; }
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (typeof console !== 'undefined') console.warn('[rainy] program link failed:', gl.getProgramInfoLog(prog));
      rainyGLAvail = false;
      return false;
    }
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    function ul(name) { return gl.getUniformLocation(prog, name); }
    rainyGLUniforms = {
      bg: ul('uBg'), res: ul('uRes'), time: ul('uTime'),
      density: ul('uDensity'), speed: ul('uSpeed'),
      refract: ul('uRefract'), blur: ul('uBlur')
    };
    rainyGL = gl;
    rainyGLProg = prog;
    rainyGLTex = tex;
    rainyGLVao = vao;
    rainyGLVbo = vbo;
    rainyGLVs = vs;
    rainyGLFs = fs;
    rainyGLAvail = true;
    return true;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[rainy] WebGL2 init failed:', e);
    rainyGLAvail = false;
    return false;
  } finally {
    /* 失败路径：半成品对象当场删除，不留滞留物在常驻 context 上 */
    if (!rainyGLAvail) rainyDeleteGLObjects(gl, prog, vs, fs, tex, vao, vbo);
  }
}

/* 每帧渲染：far canvas → 纹理 → 雨滴折射 shader */
function renderRainyGlass(dtSec) {
  if (!rainyGL) return;
  var gl = rainyGL;
  var far = document.getElementById('rainy-far-canvas');
  if (!far || !far.width) return;
  rainyGLSimTime += dtSec;
  var canvas = gl.canvas;
  /* 尺寸自适应（用窗口尺寸而非 clientWidth：隐藏/初始化期 clientWidth 不可靠） */
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var w = Math.max(2, Math.round((window.innerWidth || 1280) * dpr));
  var h = Math.max(2, Math.round((window.innerHeight || 800) * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  /* 背景纹理：far canvas 上传 + mip 链（景深 LOD 依赖） */
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, rainyGLTex);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, far);
    gl.generateMipmap(gl.TEXTURE_2D);
  } catch (e) { return; }
  var u = rainyGLUniforms;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(rainyGLProg);
  gl.bindVertexArray(rainyGLVao);
  gl.uniform1i(u.bg, 0);
  gl.uniform2f(u.res, canvas.width, canvas.height);
  gl.uniform1f(u.time, rainyGLSimTime);
  /* 设置面板映射：雨势 → 密度，车速 → 滑落速度，雾气 → 背景虚化 */
  var density = rainySettingVal('rainIntensity', 0.5);
  var speed = 0.6 + rainySettingVal('rainSpeed', 0.5) * 1.2;      /* 0.6~1.8 */
  var fog = rainySettingVal('rainFog', 0.5);
  var blur = 1.4 + fog * 3.4;                                     /* 1.4~4.8 */
  /* 音乐能量让雨量微微起伏（节制的律动） */
  density = Math.min(1, density + rainyEnergy * 0.12);
  gl.uniform1f(u.density, density);
  gl.uniform1f(u.speed, speed);
  gl.uniform1f(u.refract, 1.6);
  gl.uniform1f(u.blur, blur);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function destroyRainyGL() {
  if (!rainyGL) return;
  /* deleteProgram 只 detach 不删除 shader 对象，VBO 无引用则永远删不掉——
     每次进出雨夜模式在同一常驻 context 上净滞留 1 VBO + 2 shader。 */
  rainyDeleteGLObjects(rainyGL, rainyGLProg, rainyGLVs, rainyGLFs, rainyGLTex, rainyGLVao, rainyGLVbo);
  rainyGL = null;
  rainyGLProg = null;
  rainyGLTex = null;
  rainyGLVao = null;
  rainyGLVbo = null;
  rainyGLVs = null;
  rainyGLFs = null;
  rainyGLUniforms = null;
}

/* ---------- 歌词（雾玻璃逐字 + 水痕旧句） ---------- */
function clearRainyLyrics() {
  var lyric = document.getElementById('rainy-lyric');
  var ghost = document.getElementById('rainy-ghost-layer');
  if (lyric) {
    lyric.innerHTML = '';
    lyric.removeAttribute('role');
    lyric.removeAttribute('aria-label');
  }
  if (ghost) ghost.innerHTML = '';
  rainyChars = [];
}

function escapeRainyHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* 字体跟随用户歌词字体选择（fx.lyricFont），与涂鸦墙一致 */
function rainyFontStack() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  var stack = (fontKey && typeof lyricFontStackForKey === 'function')
    ? lyricFontStackForKey(fontKey)
    : '"LXGW WenKai","STKaiti","KaiTi","PingFang SC",serif';
  var overlay = document.getElementById('rainy-overlay');
  if (overlay) overlay.style.setProperty('--rc-font', stack);
  return stack;
}

function checkRainyFontChange() {
  var fontKey = (typeof fx !== 'undefined' && fx && fx.lyricFont) ? fx.lyricFont : '';
  if (rainyLastFontKey !== fontKey) {
    rainyLastFontKey = fontKey;
    rainyFontStack();
    rainyLastLineIdx = -99;      /* 字体变了强制重渲染 */
  }
}

/* 旧句 → 水痕字（DOM 移入 ghost 层，CSS 动画 7s 缓缓淡出被"冲淡"） */
function demoteRainyLineToGhost() {
  var lyric = document.getElementById('rainy-lyric');
  var ghost = document.getElementById('rainy-ghost-layer');
  if (!lyric || !ghost || !lyric.childElementCount) return;
  /* 同时最多一个水痕，旧的直接丢弃 */
  ghost.innerHTML = '';
  var prev = document.createElement('div');
  prev.className = 'rainy-ghost-line';
  prev.innerHTML = lyric.innerHTML;
  ghost.appendChild(prev);
  /* span 上的 is-shown 状态保留（水痕 = 已显现过的字），动画自动淡出 */
  setTimeout(function () {
    if (prev.parentNode === ghost) ghost.removeChild(prev);
  }, 7600);
}

function renderRainyLine(line, lineIdx) {
  demoteRainyLineToGhost();
  var container = document.getElementById('rainy-lyric');
  if (!container) return;
  var text = (line && line.text) || '';
  if (!text || !text.trim()) {
    container.innerHTML = '<span class="rainy-idle">· · ·</span>';
    rainyChars = [];
    rainyLineStartT = line ? line.t : 0;
    return;
  }
  var tokens = (typeof tokenizeGraffitiText === 'function') ? tokenizeGraffitiText(text) : Array.from(text).map(function (ch, i) {
    return /\s/.test(ch) ? { type: 'space' } : { type: 'char', chars: [{ c: ch, i: i }] };
  });
  var reveals = (typeof computeGraffitiReveals === 'function')
    ? computeGraffitiReveals(line, text, { lineIdx: lineIdx, tokens: tokens })
    : [];
  var html = '';
  for (var ti = 0; ti < tokens.length; ti++) {
    var tk = tokens[ti];
    if (tk.type === 'space') { html += '<span class="rainy-space" aria-hidden="true"></span>'; continue; }
    if (tk.type === 'word') html += '<span class="rainy-word">';
    for (var ci = 0; ci < tk.chars.length; ci++) {
      html += '<span class="rainy-char" data-i="' + tk.chars[ci].i + '" aria-hidden="true">' +
        escapeRainyHtml(tk.chars[ci].c) + '</span>';
    }
    if (tk.type === 'word') html += '</span>';
  }
  container.setAttribute('role', 'text');
  container.setAttribute('aria-label', text);
  container.innerHTML = html;
  container.classList.remove('entering');
  void container.offsetWidth;
  container.classList.add('entering');
  var spans = container.querySelectorAll('.rainy-char');
  rainyChars = [];
  for (var j = 0; j < spans.length; j++) {
    var dataI = parseInt(spans[j].getAttribute('data-i'), 10);
    rainyChars.push({ el: spans[j], reveal: reveals[dataI] != null ? reveals[dataI] : 0 });
  }
  rainyLineStartT = line.t || 0;
}

function tickRainyLyrics() {
  if (!rainyMode) return;
  var hasReal = lyricsLines && lyricsLines.length && lyricsLines.some(function (l) { return !l.fallback; });
  if (!hasReal) {
    if (rainyLastLineIdx !== -98) {
      rainyLastLineIdx = -98;
      demoteRainyLineToGhost();
      var lyric = document.getElementById('rainy-lyric');
      if (lyric) lyric.innerHTML = '<span class="rainy-idle">· · ·</span>';
      rainyChars = [];
    }
    return;
  }
  if (rainyLastLineIdx === -98) rainyLastLineIdx = -99;
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
  if (idx !== rainyLastLineIdx) {
    rainyLastLineIdx = idx;
    if (idx >= 0 && idx < lyricsLines.length) {
      renderRainyLine(lyricsLines[idx], idx);
    } else {
      demoteRainyLineToGhost();
      var lyric2 = document.getElementById('rainy-lyric');
      if (lyric2) lyric2.innerHTML = '';
      rainyChars = [];
    }
    return;
  }
  if (!rainyChars.length) return;
  var elapsed = nowTime - rainyLineStartT;
  for (var i = 0; i < rainyChars.length; i++) {
    var c = rainyChars[i];
    if (!c.el) continue;
    var shown = c.el.classList.contains('is-shown');
    if (!shown && elapsed >= c.reveal) c.el.classList.add('is-shown');
    else if (shown && elapsed < c.reveal - 0.5) c.el.classList.remove('is-shown');
  }
}

function watchRainyLyricsChange() {
  var token = ++rainyLyricsObserverToken;
  var lastLen = -1;
  function check() {
    if (token !== rainyLyricsObserverToken || !rainyMode) return;
    var len = (lyricsLines && lyricsLines.length) || 0;
    if (len !== lastLen) {
      lastLen = len;
      rainyLastLineIdx = -99;
    }
    setTimeout(check, 600);
  }
  check();
}

/* ---------- 主循环（雨滴 30fps 已足够顺滑，统一节流） ---------- */
function startRainyLoop() {
  stopRainyLoop();
  var lastTick = 0;
  rainyLastFrame = performance.now();
  function frame(now) {
    if (!rainyMode) return;
    var dt = Math.min(0.1, Math.max(0.001, (now - rainyLastFrame) / 1000));
    rainyLastFrame = now;
    if (now - lastTick > 33) {
      lastTick = now;
      tickRainyAudio(dt);
      tickRainyFar(dt, now);
      renderRainyGlass(dt);
      checkRainyFontChange();
      checkRainySettingsChange(now);
      tickRainyLyrics();
    }
    rainyRafId = requestAnimationFrame(frame);
  }
  rainyRafId = requestAnimationFrame(frame);
  watchRainyLyricsChange();
}

function stopRainyLoop() {
  if (rainyRafId) {
    cancelAnimationFrame(rainyRafId);
    rainyRafId = 0;
  }
  rainyLyricsObserverToken++;
}

/* ---------- 颜色小工具 ---------- */
function rainyCssToRgb(css) {
  var m = /^#?([0-9a-f]{6})$/i.exec(String(css || '').trim());
  if (!m) return [90, 110, 160];
  var n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rainyRgbCss(r, g, b) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function rainyMixRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

function rainyRgbToHsl(r, g, b) {
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
function onRainyResize() {
  if (!rainyMode) return;
  resizeRainyCanvases();
}

/* ---------- 启动绑定 ---------- */
function initRainy() {
  applyRainyMode(rainyMode, { save: false });
  window.addEventListener('resize', function () {
    clearTimeout(rainyResizeTimer);
    rainyResizeTimer = setTimeout(onRainyResize, 180);
  });
}

/* 延迟到 DOM 就绪后初始化（本模块在 index-loader 末尾加载，DOM 已就绪） */
scheduleUiWarmTask ? scheduleUiWarmTask(initRainy, 300) : setTimeout(initRainy, 300);
