/* =========================================================================
   OrangeSea · 流光（Aurora Flow · 夜航极光）
   日常沉浸模式：封面取色谐和化的深空夜幕 + 三道极光绸带（垂帘结构：
   下沿亮边、向上消散、帘幕条纹）+ 星尘视差 + 地平线呼吸波形
   + 大字逐字卡拉OK，一道柔光扫带跟随演唱头滑过歌词（「流光」本体）。
   克制原则：无频闪、无高频运动、无主体物件，长注视不疲劳。
   照抄 film-radio / graffiti 范式：body.aurora + localStorage + 覆盖层互斥。

   分层：L0 极光 canvas（低分辨率绘制 + CSS blur 柔化：夜空渐变 + 绸带）/
         L1 星尘 canvas（全分辨率细点，不参与模糊）/ L2 暗角遮罩 /
         L3 角标 / L4 歌词舞台（逐字点亮 + 扫光）/ L5 地平线波形 /
         L6 胶片颗粒（防色带、统一质感）。
   色彩纪律：绸带色一律吸附到封面主色相 ±0.09 邻近色域——互补色在
   lighter 叠加下出泥浆（旧版色团浑浊的根源），谐和色域才有极光的通透。
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

/* 夜幕状态 */
var auroraBgCtx = null;
var auroraStarCtx = null;
var auroraWaveCtx = null;
var auroraBlobSprites = [];      /* 保留：径向渐变精灵构建器供测试/调试复用 */
var auroraPalette = null;        /* { colors:[c1,c2,c3], sung, luma, gain } */
var auroraHarmony = null;        /* { deepTop, deep, horizon, curtains:[3], accent } 谐和夜幕板 */
var auroraStars = [];            /* 星尘 { x, y, r, tw, ph, drift, a, tint } */
var auroraCoverUrl = '';         /* 当前已取色的封面 URL（去重） */
var auroraPaletteLoading = false;
var auroraPaletteSeq = 0;

/* 音频特征（自算，0~1） */
var auroraBass = 0;
var auroraEnergy = 0;
var auroraChorus = 0;            /* 副歌闸门：能量慢积分，驱动绸带浓度+亮边 */
var auroraBeat = 0;              /* 节拍脉冲：低频突增快衰减 */
var auroraPrevBassRaw = 0;

/* 呼吸线波形平滑缓存 */
var auroraWavePts = null;

/* 流光扫带状态 */
var auroraCharRects = [];        /* 逐字布局盒（渲染后测量一次，脏标记重建） */
var auroraHeadIdx = -1;          /* 演唱头字下标（elapsed >= reveal 的最后一字） */
var auroraSheenEl = null;
var auroraSheenX = -1;           /* <0 = 待吸附（切行后首字直接定位不滑行） */
var auroraSheenTargetX = 0;
var auroraMeasureDirty = false;

/* 减弱动态偏好（matchMedia 探一次 + 监听变化；绸带冻结、扫带瞬移） */
var auroraReduced = false;
try {
  auroraReduced = !!(typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
} catch (e) { }

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
    auroraMeasureDirty = true;   /* 字宽变了，扫带锚点重测 */
  }
}

function stopAurora() {
  stopAuroraLoop();
  stopAuroraObserver();
  auroraLastLineIdx = -99;
  auroraChars = [];
  auroraCharRects = [];
  auroraHeadIdx = -1;
  auroraSheenEl = null;
  auroraSheenX = -1;
  auroraChorus = 0;
  auroraBeat = 0;
  auroraWavePts = null;
  clearAuroraLyrics();
  var bg = document.getElementById('aurora-bg-canvas');
  if (bg && auroraBgCtx) auroraBgCtx.clearRect(0, 0, bg.width, bg.height);
  var stars = document.getElementById('aurora-stars-canvas');
  if (stars && auroraStarCtx) auroraStarCtx.clearRect(0, 0, stars.width, stars.height);
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
   · 封面过暗（平均亮度 <0.30）：主色逐级提亮，否则绸带沉入黑底；
   · 主色过灰（平均饱和 <0.26）：对主色做 ±色相偏移生成辅色，恢复层次；
   · gain 输出给渲染端上调绸带 alpha（上限 1.8，lighter 叠加防过曝）。 */
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

/* ---------- 色彩谐和（夜幕板的灵魂） ----------
   绸带色吸附到主色相 ±0.09 邻近色域：互补色在 lighter 叠加下出泥浆，
   邻近色域才有极光的通透层次。夜空基底/地平线由主色相染色，
    sung 字色向冷白回拉——暖黄白字在暗景上显脏（旧版教训）。 */
function auroraHarmonizePalette(p) {
  var colors = (p && p.colors && p.colors.length) ? p.colors : auroraDefaultPalette().colors;
  /* 主色相：饱和×中间亮度加权最高者（过暗过亮的色不作主） */
  var prim = auroraRgbToHsl.apply(null, auroraCssToRgb(colors[0]));
  var bestScore = -1;
  for (var i = 0; i < colors.length; i++) {
    var hsl = auroraRgbToHsl.apply(null, auroraCssToRgb(colors[i]));
    var score = hsl.s * (1 - Math.abs(hsl.l - 0.5)) * (i === 0 ? 1.15 : 1);  /* 同分偏好权重色 */
    if (score > bestScore) { bestScore = score; prim = hsl; }
  }
  /* 色相吸附：超出 ±0.09 的一律拉回色域边缘 */
  function snapHue(h) {
    var d = ((h - prim.h + 1.5) % 1) - 0.5;
    if (Math.abs(d) > 0.09) h = prim.h + (d > 0 ? 0.09 : -0.09);
    return ((h % 1) + 1) % 1;
  }
  var curtains = [];
  var lumaLadder = [0.44, 0.52, 0.58];           /* 远暗近亮 */
  for (var ci = 0; ci < 3; ci++) {
    var src = auroraRgbToHsl.apply(null, auroraCssToRgb(colors[Math.min(ci, colors.length - 1)]));
    curtains.push(auroraHslCss(
      snapHue(src.h),
      Math.max(0.52, Math.min(0.78, src.s * 1.08)),
      lumaLadder[ci]));
  }
  return {
    deepTop: auroraHslCss(prim.h, 0.42, 0.030),
    deep: auroraHslCss(prim.h, 0.40, 0.048),
    horizon: auroraHslCss(prim.h, 0.46, 0.105),
    curtains: curtains,
    accent: auroraHslCss(prim.h, 0.72, 0.66)
  };
}

/* 把取色结果写进 CSS 变量（字色/绸带色/夜幕色）并刷新谐和板 */
function auroraApplyPalette() {
  var p = auroraPalette;
  if (!p) return;
  auroraHarmony = auroraHarmonizePalette(p);
  /* sung 字色向冷白回拉 55%：暖黄白在暗景上显脏 */
  var sungCool = auroraRgbCss.apply(null, auroraMixRgb(auroraCssToRgb(p.sung), [232, 243, 255], 0.55));
  var overlay = document.getElementById('aurora-overlay');
  if (overlay) {
    overlay.style.setProperty('--af-c1', auroraHarmony.curtains[0]);
    overlay.style.setProperty('--af-c2', auroraHarmony.curtains[1]);
    overlay.style.setProperty('--af-c3', auroraHarmony.curtains[2]);
    overlay.style.setProperty('--af-deep', auroraHarmony.deep);
    overlay.style.setProperty('--af-accent', auroraHarmony.accent);
    overlay.style.setProperty('--af-sung', sungCool);
    overlay.style.setProperty('--af-ribbon', auroraHarmony.curtains[1]);
  }
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

/* ---------- canvas 尺寸（bg 低分辨率半清晰，星尘/波形线全分辨率） ---------- */
function ensureAuroraCanvases() {
  var bg = document.getElementById('aurora-bg-canvas');
  var stars = document.getElementById('aurora-stars-canvas');
  var wave = document.getElementById('aurora-wave-canvas');
  if (bg && !auroraBgCtx) auroraBgCtx = bg.getContext('2d');
  if (stars && !auroraStarCtx) auroraStarCtx = stars.getContext('2d');
  if (wave && !auroraWaveCtx) auroraWaveCtx = wave.getContext('2d');
  resizeAuroraCanvases();
  if (!auroraHarmony) {
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
  var stars = document.getElementById('aurora-stars-canvas');
  if (stars && auroraStarCtx) {
    var sdpr = Math.min(window.devicePixelRatio || 1, 2);
    stars.width = Math.max(2, Math.floor(w * sdpr));
    stars.height = Math.max(2, Math.floor(h * sdpr));
    auroraStarCtx.setTransform(sdpr, 0, 0, sdpr, 0, 0);
    auroraBuildStarField(w, h);
  }
  var wave = document.getElementById('aurora-wave-canvas');
  if (wave && auroraWaveCtx) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    wave.width = Math.max(2, Math.floor(w * dpr));
    wave.height = Math.max(2, Math.floor(120 * dpr));
    auroraWaveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  auroraMeasureDirty = true;
}

/* ---------- 星尘（两层深度：远小慢暗 / 近大快亮，横向视差漂移） ---------- */
function auroraBuildStarField(w, h) {
  var n = Math.max(36, Math.min(110, Math.round(w * h / 24000)));
  auroraStars = [];
  for (var i = 0; i < n; i++) {
    var depth = Math.random();
    auroraStars.push({
      x: Math.random() * w,
      y: Math.random() * h * 0.82,                 /* 地平线以上 */
      r: 0.5 + depth * 1.1,
      tw: 0.35 + Math.random() * 0.85,             /* 闪烁角速度 */
      ph: Math.random() * 6.2832,
      drift: 0.12 + depth * 0.45,                  /* px/s 视差 */
      a: 0.14 + depth * 0.42,
      tint: Math.random() < 0.22                   /* 少量星点着主题色 */
    });
  }
}

function tickAuroraStars(now) {
  if (!auroraStarCtx || !auroraStars.length) return;
  var ctx = auroraStarCtx;
  var dpr = 1;
  try { dpr = (ctx.getTransform && ctx.getTransform().a) || 1; } catch (e) { }
  var w = ctx.canvas.width / dpr, h = ctx.canvas.height / dpr;
  var t = now * 0.001;
  ctx.clearRect(0, 0, w, h);
  var accentRgb = auroraHarmony ? auroraCssToRgb(auroraHarmony.accent) : [150, 190, 255];
  for (var i = 0; i < auroraStars.length; i++) {
    var s = auroraStars[i];
    var x = s.x + t * s.drift;
    x = x - Math.floor(x / w) * w;                 /* 横向回绕 */
    var tw = auroraReduced ? 0.72 : (0.60 + 0.40 * Math.sin(t * s.tw + s.ph));
    var alpha = s.a * tw;
    if (alpha < 0.02) continue;
    ctx.fillStyle = s.tint
      ? 'rgba(' + accentRgb[0] + ',' + accentRgb[1] + ',' + accentRgb[2] + ',' + alpha.toFixed(3) + ')'
      : 'rgba(216,228,250,' + alpha.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(x, s.y, s.r, 0, 6.2832);
    ctx.fill();
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

/* ---------- 极光绸带（30fps 足够：慢速漂移无高频细节） ----------
   垂帘模型：横贯天际的帘幕，底边是蜿蜒亮线（极光签名式的下沿），
   向上经垂直渐隐消散；帘高用高频正弦调制出光柱条纹，blur 后成帘。
   三层远中近视差：远小慢暗、近大快亮。 */
function tickAuroraBg(now) {
  if (!auroraBgCtx) return;
  var ctx = auroraBgCtx;
  var w = ctx.canvas.width, h = ctx.canvas.height;
  var t = auroraReduced ? 18 : now * 0.001;
  var hz = auroraHarmony;
  if (!hz) return;

  /* 1) 夜空基底渐变（主色相染色的深空，顶部更暗） */
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  var g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hz.deepTop);
  g.addColorStop(0.55, hz.deep);
  g.addColorStop(1, hz.horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  /* 2) 三道绸带：远（高慢暗）/ 中 / 近（低快亮） */
  ctx.globalCompositeOperation = 'lighter';
  var breathe = 1 + auroraBass * 0.10 + auroraBeat * 0.05;
  var gain = Math.min(1.5, (auroraPalette && auroraPalette.gain) || 1);
  var chorusLift = 1 + auroraChorus * 0.5;
  var defs = [
    { baseY: 0.26, tall: 0.15, amp1: 0.020, f1: 1.9, spd1: 0.088, ph1: 0.0, amp2: 0.011, f2: 4.3, spd2: 0.052, ph2: 2.1, rayF: 9.0, rayS: 0.050, alpha: 0.24, edge: 0.16 },
    { baseY: 0.38, tall: 0.19, amp1: 0.027, f1: 1.4, spd1: 0.066, ph1: 2.4, amp2: 0.014, f2: 3.6, spd2: 0.044, ph2: 4.4, rayF: 7.0, rayS: 0.040, alpha: 0.32, edge: 0.30 },
    { baseY: 0.50, tall: 0.23, amp1: 0.033, f1: 1.1, spd1: 0.050, ph1: 4.8, amp2: 0.016, f2: 2.9, spd2: 0.036, ph2: 1.2, rayF: 5.4, rayS: 0.030, alpha: 0.40, edge: 0.44 }
  ];
  var N = 30;
  for (var i = 0; i < defs.length; i++) {
    var d = defs[i];
    var rgb = auroraCssToRgb(hz.curtains[i]);
    var alpha = Math.min(0.62, d.alpha * gain * chorusLift);
    if (i === 2) alpha *= 1 + auroraBeat * 0.10;   /* 节拍只推近景带 */
    var baseY = h * d.baseY;
    var tallBase = h * d.tall * breathe * (1 + auroraChorus * 0.28);
    var xs = [], yb = [], yt = [];
    for (var s = 0; s <= N; s++) {
      var x = (s / N) * (w * 1.24) - w * 0.12;     /* 溢出两侧防边缘断带 */
      var yBase = baseY
        + Math.sin(x / w * d.f1 * 6.2832 + t * d.spd1 + d.ph1) * h * d.amp1
        + Math.sin(x / w * d.f2 * 6.2832 - t * d.spd2 + d.ph2) * h * d.amp2;
      /* 帘高条纹：高频正弦让帘幕出现光柱感（blur 后成柔和竖纹） */
      var tall = tallBase * (1 + 0.30 * Math.sin(x / w * d.rayF * 6.2832 + t * d.rayS + d.ph1 * 2));
      if (tall < h * 0.04) tall = h * 0.04;
      xs[s] = x; yb[s] = yBase; yt[s] = yBase - tall;
    }
    /* 帘幕填充：底亮顶消 */
    ctx.beginPath();
    ctx.moveTo(xs[0], yb[0]);
    for (s = 1; s <= N; s++) ctx.lineTo(xs[s], yb[s]);
    for (s = N; s >= 0; s--) ctx.lineTo(xs[s], yt[s]);
    var gg = ctx.createLinearGradient(0, baseY - h * d.tall * 1.3, 0, baseY + h * 0.02);
    gg.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
    gg.addColorStop(0.55, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (alpha * 0.45).toFixed(3) + ')');
    gg.addColorStop(0.90, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha.toFixed(3) + ')');
    gg.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (alpha * 0.9).toFixed(3) + ')');
    ctx.fillStyle = gg;
    ctx.fill();
    /* 下沿亮边：极光帘幕的签名式亮线（近景常亮，中景随副歌浮出） */
    var edgeAlpha = Math.min(0.6, (d.edge * gain) * (i === 2 ? 1 : (0.35 + auroraChorus * 0.9)));
    if (edgeAlpha > 0.03) {
      var er = auroraMixRgb(rgb, [255, 255, 255], 0.42);
      ctx.beginPath();
      ctx.moveTo(xs[0], yb[0]);
      for (s = 1; s <= N; s++) ctx.lineTo(xs[s], yb[s]);
      ctx.strokeStyle = 'rgba(' + er[0] + ',' + er[1] + ',' + er[2] + ',' + edgeAlpha.toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, h * 0.005);
      ctx.stroke();
    }
  }

  /* 3) 节拍呼吸：主色相微光全屏脉冲（克制，≤4%） */
  if (auroraBeat > 0.02) {
    var ar = auroraCssToRgb(hz.accent);
    ctx.globalAlpha = Math.min(0.04, auroraBeat * 0.04);
    ctx.fillStyle = 'rgb(' + ar[0] + ',' + ar[1] + ',' + ar[2] + ')';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- 地平线呼吸波形（timeDomainData，锚定夜幕地平线） ---------- */
function tickAuroraWave() {
  if (!auroraWaveCtx) return;
  var ctx = auroraWaveCtx;
  var w = 0, h = 0;
  try { w = Math.floor(ctx.canvas.width / (ctx.getTransform ? ctx.getTransform().a || 1 : 1)); h = 120; } catch (e) { w = ctx.canvas.width; h = 120; }
  ctx.clearRect(0, 0, w, h);
  var td = (typeof timeDomainData !== 'undefined') ? timeDomainData : null;
  var horizonY = h * 0.58;
  var amp = h * 0.26 * (0.55 + auroraBass * 0.5);
  var sung = (auroraPalette && auroraPalette.sung) || '#dfe8ff';
  var rgb = auroraCssToRgb(sung);
  var glow = 0.16 + auroraEnergy * 0.22 + auroraBeat * 0.12;

  /* 地平线：一根极细的横向微光，中央最亮 */
  var hg = ctx.createLinearGradient(0, 0, w, 0);
  hg.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
  hg.addColorStop(0.5, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (0.20 + glow * 0.35).toFixed(3) + ')');
  hg.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(w, horizonY);
  ctx.strokeStyle = hg;
  ctx.lineWidth = 1;
  ctx.stroke();

  /* 波形点平滑 */
  var pts = 96;
  if (!auroraWavePts || auroraWavePts.length !== pts) {
    auroraWavePts = [];
    for (var i = 0; i < pts; i++) auroraWavePts.push(horizonY);
  }
  for (var p = 0; p < pts; p++) {
    var target = horizonY;
    if (td && td.length) {
      var v = td[Math.floor((p / (pts - 1)) * (td.length - 1))] - 128;
      target = horizonY + (v / 128) * amp * 0.9;
    }
    auroraWavePts[p] += (target - auroraWavePts[p]) * 0.35;   /* 平滑防锯齿抖动 */
  }
  /* 横向渐隐描边渐变（两端溶入夜色） */
  function waveStroke(alpha, width, mirror) {
    ctx.beginPath();
    for (var q = 0; q < pts; q++) {
      var x = (q / (pts - 1)) * w;
      var y = mirror ? horizonY + (horizonY - auroraWavePts[q]) * 0.38 : auroraWavePts[q];
      if (q === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    var wg = ctx.createLinearGradient(0, 0, w, 0);
    wg.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
    wg.addColorStop(0.18, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (alpha * 0.55).toFixed(3) + ')');
    wg.addColorStop(0.5, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha.toFixed(3) + ')');
    wg.addColorStop(0.82, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (alpha * 0.55).toFixed(3) + ')');
    wg.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
    ctx.strokeStyle = wg;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  /* 宽淡辉光 + 细亮主线 + 水下倒影 */
  waveStroke(glow * 0.4, 4.5, false);
  waveStroke(glow, 1.3, false);
  waveStroke(glow * 0.20, 3, true);
}

/* ---------- 歌词（三行布局：上淡出 / 当前行逐字点亮+流光 / 下预览） ---------- */
function clearAuroraLyrics() {
  ['aurora-line-prev', 'aurora-line-main', 'aurora-line-next'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.innerHTML = '';
      el.classList.add('empty');
      el.classList.remove('has-live');
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
    }
  });
  auroraChars = [];
  auroraCharRects = [];
  auroraHeadIdx = -1;
  auroraSheenEl = null;
  auroraSheenX = -1;
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
  auroraHeadIdx = -1;
  auroraSheenX = -1;                          /* 切行后扫带吸附新行首字，不滑行 */
  auroraSheenEl = null;
  container.classList.remove('has-live');
  if (!text || !text.trim()) {
    container.innerHTML = '<span class="aurora-idle">♪ · ♪</span>';
    container.classList.add('empty');
    auroraChars = [];
    auroraCharRects = [];
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
  /* 流光扫带节点（innerHTML 之后追加，绝对定位不参与排版） */
  var sheen = document.createElement('div');
  sheen.className = 'aurora-sheen';
  sheen.id = 'aurora-sheen';
  sheen.setAttribute('aria-hidden', 'true');
  container.appendChild(sheen);
  auroraSheenEl = sheen;
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
  auroraMeasureAuroraChars();
}

/* 逐字布局盒测量（每行一次；字体/字号/窗口变化后置脏重测） */
function auroraMeasureAuroraChars() {
  auroraCharRects = [];
  for (var i = 0; i < auroraChars.length; i++) {
    var el = auroraChars[i].el;
    if (!el) { auroraCharRects.push(null); continue; }
    auroraCharRects.push({
      cx: el.offsetLeft + el.offsetWidth / 2
    });
  }
  auroraMeasureDirty = false;
}

function setAuroraSideLine(id, line, cls) {
  var el = document.getElementById(id);
  if (!el) return;
  var text = (line && line.text) || '';
  if (text && text.trim()) {
    if (el.textContent !== text) {
      el.textContent = text;
      /* 换行微浮入（上一行远去 / 下一行靠近的方向感） */
      el.classList.remove('swap-in');
      void el.offsetWidth;
      el.classList.add('swap-in');
    }
    el.classList.remove('empty');
    if (cls) el.setAttribute('data-kind', cls);
  } else {
    el.textContent = '';
    el.classList.add('empty');
    el.classList.remove('swap-in');
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
        main.classList.remove('has-live');
      }
      auroraChars = [];
      auroraCharRects = [];
      auroraHeadIdx = -1;
      auroraSheenEl = null;
      auroraSheenX = -1;
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
  /* 逐字点亮推进 + 演唱头追踪（流光扫带锚点） */
  if (!auroraChars.length) return;
  var elapsed = nowTime - auroraLineStartT;
  var head = -1;
  for (var i = 0; i < auroraChars.length; i++) {
    var c = auroraChars[i];
    if (!c.el) continue;
    var sung = c.el.classList.contains('is-sung');
    if (!sung && elapsed >= c.reveal) c.el.classList.add('is-sung');
    else if (sung && elapsed < c.reveal - 0.5) c.el.classList.remove('is-sung');   /* seek 倒退回退点亮 */
    if (elapsed >= c.reveal - 0.06) head = i;      /* 演唱头：即将点亮也计入，扫带先行半步 */
  }
  if (head !== auroraHeadIdx) {
    var container = document.getElementById('aurora-line-main');
    if (auroraHeadIdx >= 0 && auroraChars[auroraHeadIdx] && auroraChars[auroraHeadIdx].el) {
      auroraChars[auroraHeadIdx].el.classList.remove('is-live');
    }
    auroraHeadIdx = head;
    if (head >= 0 && auroraChars[head] && auroraChars[head].el) {
      auroraChars[head].el.classList.add('is-live');
      if (auroraMeasureDirty) auroraMeasureAuroraChars();
      var rect = auroraCharRects[head];
      if (rect) auroraSheenTargetX = rect.cx;
      if (container) container.classList.add('has-live');
    } else if (container) {
      container.classList.remove('has-live');
    }
  }
}

/* 流光扫带：向演唱头匀速滑行（每帧推进，比 30fps 门控更细） */
function tickAuroraSheen(dt) {
  var sheen = auroraSheenEl;
  if (!sheen || !sheen.parentNode) { auroraSheenEl = null; return; }
  if (auroraSheenX < 0) {
    auroraSheenX = auroraSheenTargetX;             /* 吸附：切行/seek 不拖尾 */
  } else {
    var rate = auroraReduced ? 1000 : 5.2;
    auroraSheenX += (auroraSheenTargetX - auroraSheenX) * Math.min(1, dt * rate);
  }
  var halfW = sheen.offsetWidth / 2;
  sheen.style.transform = 'translateX(' + (auroraSheenX - halfW).toFixed(1) + 'px)';
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

/* ---------- 主循环（rAF 节流 ~30fps；扫带每帧滑行） ---------- */
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
      tickAuroraStars(now);
      tickAuroraWave();
      checkAuroraFontChange();
      tickAuroraLyrics();
    }
    tickAuroraSheen(dt);
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
  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      var onMq = function (e) { auroraReduced = !!(e && e.matches); };
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
    }
  } catch (e) { }
  applyAuroraMode(auroraMode, { save: false });
  window.addEventListener('resize', function () {
    clearTimeout(auroraResizeTimer);
    auroraResizeTimer = setTimeout(onAuroraResize, 180);
  });
}

/* 延迟到 DOM 就绪后初始化（本模块在 index-loader 末尾加载，DOM 已就绪） */
scheduleUiWarmTask ? scheduleUiWarmTask(initAurora, 300) : setTimeout(initAurora, 300);
