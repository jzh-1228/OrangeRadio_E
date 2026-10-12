/* =========================================================================
   tilt 模式背景层 —— Folia VisualizerShell 默认背景（Latent）的无构建忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     src/components/visualizer/backgrounds/latent/LatentBackground.tsx
       （背景层结构与音频驱动循环全量，行号逐段标注）
     src/hooks/usePlaybackVisualizerBridge.ts:93-131（AudioBands 五频带
       21.5Hz/bin 分箱 + 每带幂次整形 + 暂停呼吸值，逐式同构）
     src/components/visualizer/backgrounds/VisualizerBackgroundRenderer.tsx
       （默认分支：mode 缺省 → DEFAULT_VISUALIZER_BACKGROUND_MODE）
     src/types/visualizerModes.ts:43（DEFAULT_VISUALIZER_BACKGROUND_MODE='latent'）
     src/types.ts:1045-1061（DEFAULT_LATENT_BACKGROUND_TUNING 原值）
     src/utils/colorExtractor.ts（封面取样 50×50 loadImagePixels）
     src/utils/colorPalette.ts（加权中位切取色 extractRepresentativeColorsFromPixels）

   渲染本体（WebGL shader）来自 Folia 的第三方依赖 @paper-design/shaders
   v0.0.80（Apache-2.0，Copyright Paper Design，见 NOTICE.md）：
     dist/shaders/mesh-gradient.js      （MeshGradient 片元，maxColorCount=10 展开）
     dist/shaders/dithering.js          （Dithering 片元；warp=2 / '4x4'=3 已按
       DitheringShapes/DitheringTypes 常量内联）
     dist/vertex-shader.js              （顶点着色器逐字）
     dist/shader-utils.js               （declarePI/rotation2/proceduralHash11/
       proceduralHash21/simplexNoise 内联展开）
     dist/shader-mount.js               （ShaderMount 驱动核心：program/quad/
       u_time=currentFrame*1e-3、currentFrame+=dt*speed、setSpeed 零速停 rAF、
       setUniforms 立即补帧；像素预算 clamp 语义保留）

   与原版的宿主差异（均不改变算法与常量）：
   1) React 组件树 → 显式工厂 TiltLatentBackground(opts)：Uniforms 直设、
     useEffect rAF → 自管 rAF、MotionValue.get() → 注入 getter；
   2) ShaderMount 的 ResizeObserver/IntersectionObserver/Safari 缩放簿记 →
     window resize + visibilitychange 等价（全屏覆盖层恒在视口内；
     handleResize 的 devicePixelContentBoxSize 缺省分支逐式保留：
     targetRenderScale=max(dpr,minPixelRatio)→像素预算 sqrt clamp）；
   3) tuning 固定 DEFAULT_LATENT_BACKGROUND_TUNING（colorSource 'cover-theme'、
     displayMode 'both'、enhancedBeatResponse true——原版缺省路径），
     本项目无调参面板（与歌词核心取 DEFAULT_TILT_TUNING 同约定）；
   4) staticMode 固定 false（宿主无背景冻结设置）。
   ========================================================================= */

/* ---------- tuning（types.ts:1045-1061 DEFAULT_LATENT_BACKGROUND_TUNING 原值） ---------- */
var tiltLatentDefaultTuning = {
  displayMode: 'both',
  colorSource: 'cover-theme',
  dynamicOnlyInPlayer: true,
  enhancedBeatResponse: true,
  ditheringSpeed: 0.1,
  ditheringAudioSpeed: 1.2,
  ditheringSize: 2.5,
  ditheringOpacity: 0.55,
  meshSpeed: 0.3,
  meshAudioSpeed: 2,
  meshDistortion: 0.8,
  meshSwirl: 0.1,
  overlayEnabled: true,
  overlayOpacity: 0.35
};

/* ---------- 纯驱动函数（LatentBackground.tsx:27-107 同构） ---------- */
var TILT_LATENT_MAX_SHADER_PIXELS = 1280 * 720;   /* LatentBackground.tsx:27 */
var TILT_LATENT_PAUSED_SPEED_SCALE = 0.12;        /* LatentBackground.tsx:28 */

/* normalizeAudio（:29） */
function tiltLatentNormalizeAudio(value) { return Math.min(1, Math.max(0, value / 255)); }
/* clampShaderSpeed（:30） */
function tiltLatentClampShaderSpeed(value) { return Math.min(2, Math.max(0, value)); }
/* clampAudioAmount（:31） */
function tiltLatentClampAudioAmount(value) { return Math.min(1, Math.max(0, value)); }
/* easeTowards（:32-34） */
function tiltLatentEaseTowards(current, target, amount) { return current + (target - current) * amount; }

/* resolveLatentBroadbandEnergy（:35-50）：五频带加权 → ^0.55（输入 0..255 语义） */
function tiltLatentBroadbandEnergy(bass, lowMid, mid, vocal, treble) {
  var broadbandEnergy = (
    tiltLatentNormalizeAudio(bass) * 0.22
    + tiltLatentNormalizeAudio(lowMid) * 0.18
    + tiltLatentNormalizeAudio(mid) * 0.22
    + tiltLatentNormalizeAudio(vocal) * 0.28
    + tiltLatentNormalizeAudio(treble) * 0.1
  );
  return Math.pow(broadbandEnergy, 0.55);
}

/* resolveLatentOnsetPulse（:52-59）：起始脉冲，0.84 衰减尾 + 7×能量差上冲 */
function tiltLatentOnsetPulse(currentEnergy, previousEnergy, previousPulse) {
  return Math.max(
    previousPulse * 0.84,
    tiltLatentClampAudioAmount((currentEnergy - previousEnergy) * 7)
  );
}

/* resolveLatentBeatSpeedTarget（:60-63） */
function tiltLatentBeatSpeedTarget(broadbandEnergy, onsetPulse) {
  return tiltLatentClampAudioAmount(broadbandEnergy * 0.42 + onsetPulse * 0.85);
}

/* resolveLatentAudioSpeedTarget（:64-70） */
function tiltLatentAudioSpeedTarget(broadbandEnergy, onsetPulse, enhancedBeatResponse) {
  return enhancedBeatResponse
    ? tiltLatentBeatSpeedTarget(broadbandEnergy, onsetPulse)
    : tiltLatentClampAudioAmount(broadbandEnergy);
}

/* resolveLatentShaderSpeed（:71-80）：暂停 → base*0.12；否则 base↛audio 按 amount 缓动 */
function tiltLatentShaderSpeed(baseSpeed, audioSpeed, audioAmount, paused) {
  return tiltLatentClampShaderSpeed(
    paused
      ? baseSpeed * TILT_LATENT_PAUSED_SPEED_SCALE
      : tiltLatentEaseTowards(baseSpeed, audioSpeed, audioAmount)
  );
}

/* resolveLatentShaderColors（:81-107）：封面色 + 主题兜底（'cover-theme' 分支为
   原版缺省；'cover-only' 分支按原样保留以维持函数同构） */
function tiltLatentShaderColors(coverColors, theme, colorSource) {
  var primary = coverColors[0] || theme.secondaryColor;
  if (colorSource === 'cover-only') {
    var secondaryC = coverColors[1] || primary;
    var tertiaryC = coverColors[2] || secondaryC;
    var quaternaryC = coverColors[3] || primary;
    var quinaryC = coverColors[4] || secondaryC;
    var senaryC = coverColors[5] || tertiaryC;
    return {
      ditheringBack: tertiaryC,
      ditheringFront: primary,
      mesh: [primary, secondaryC, tertiaryC, quaternaryC, quinaryC, senaryC]
    };
  }
  var secondary = coverColors[1] || theme.primaryColor;
  var tertiary = coverColors[2] || primary;
  var quaternary = coverColors[3] || secondary;
  return {
    ditheringBack: theme.backgroundColor,
    ditheringFront: primary,
    mesh: [primary, secondary, tertiary, quaternary, theme.backgroundColor, theme.accentColor]
  };
}

/* ---------- AudioBands 信号原值计算（usePlaybackVisualizerBridge.ts:93-131 逐式同构） ----------
   Folia 每帧从 analyser.getByteFrequencyData 的原始 FFT 字节（Uint8Array，0..255）
   按 21.5Hz/bin 分箱求均值，再做每带幂次整形；LatentBackground 消费的是这些
   MotionValue（0..255 语义）。MineRadio 保活的 frequencyData 同形状（FFT_SIZE=2048
   → 1024 bin，00-core-stores.js:8-9；覆盖层保温期主循环仍每帧采集
   11-main-loop.js:369-372），桥直供该数组。此前桥的 kick/vocal 复合带映射是
   文档化近似，本轮按原版精确计算替换（红线：逐式同构，禁近似）。 */

/* getEnergy（:93-102）：bin = floor(hz/21.5)，区间字节均值（folia 硬编码
   21.5 = 44100/2048，不读实际 sampleRate——宿主差异不引入） */
function tiltBandsGetEnergy(freqData, minHz, maxHz) {
  if (!freqData || !freqData.length) return 0;
  var start = Math.floor(minHz / 21.5);
  var end = Math.floor(maxHz / 21.5);
  var sum = 0;
  for (var index = start; index <= end; index += 1) {
    sum += freqData[index];
  }
  var count = end - start + 1;
  return count > 0 ? sum / count : 0;
}

/* process（:110-113）：pow(v/255, boost)*255 */
function tiltBandsProcess(value, boost) {
  var normalized = value / 255;
  return Math.pow(normalized, boost) * 255;
}

/* 五频带 + audioPower（:104-120）：bass 20-150/lowMid 150-400/mid 400-1200/
   vocal 1000-3500/treble 3500-12000Hz，boost 1.8/2/2/1.5/2；
   audioPower = process((bass+lowMid)/2, 3)——注意吃的是整形前的原始能量 */
function tiltBandsCompute(freqData) {
  var bass = tiltBandsGetEnergy(freqData, 20, 150);        /* :104 */
  var lowMid = tiltBandsGetEnergy(freqData, 150, 400);     /* :105 */
  var mid = tiltBandsGetEnergy(freqData, 400, 1200);       /* :106 */
  var vocal = tiltBandsGetEnergy(freqData, 1000, 3500);    /* :107 */
  var treble = tiltBandsGetEnergy(freqData, 3500, 12000);  /* :108 */
  return {
    audioPower: tiltBandsProcess((bass + lowMid) / 2, 3),  /* :115 */
    bass: tiltBandsProcess(bass, 1.8),                     /* :116 */
    lowMid: tiltBandsProcess(lowMid, 2),                   /* :117 */
    mid: tiltBandsProcess(mid, 2),                         /* :118 */
    vocal: tiltBandsProcess(vocal, 1.5),                   /* :119 */
    treble: tiltBandsProcess(treble, 2)                    /* :120 */
  };
}

/* 不可闻分支（:121-124）：正弦呼吸值 0..40（周期 ≈12.6s），五带与 audioPower
   同值——LatentBackground 暂停态目标归零（:176-189），该值仅保持信号活性 */
function tiltBandsBreath(nowMs) {
  var time = nowMs / 2000;
  return (Math.sin(time) + 1) * 20;
}

/* ---------- 封面取色（colorExtractor.ts + colorPalette.ts 同构） ---------- */

/* loadImagePixels（colorExtractor.ts:9-36）：50×50 下采样 */
function tiltLatentLoadImagePixels(imageUrl) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function () {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      var width = 50;
      var height = 50;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      try { resolve(ctx.getImageData(0, 0, width, height).data); }
      catch (e) { resolve(null); }
    };
    img.onerror = function () { resolve(null); };
    img.src = imageUrl;
  });
}

/* extractRepresentativeColorsFromPixels（colorPalette.ts 全量同构：
   4bit 量化直方图 → 加权中位切桶 → 按桶重降序输出 hex） */
var TILT_LATENT_QUANTIZATION_SHIFT = 4;   /* colorPalette.ts:12 */
var TILT_LATENT_MIN_ALPHA = 128;          /* colorPalette.ts:13 */

function tiltLatentGetChannelRange(colors, channel) {
  var min = 255;
  var max = 0;
  for (var i = 0; i < colors.length; i++) {
    var v = colors[i][channel];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

function tiltLatentSplitBucket(bucket) {
  if (bucket.colors.length < 2) return null;

  var ranges = {
    r: tiltLatentGetChannelRange(bucket.colors, 'r'),
    g: tiltLatentGetChannelRange(bucket.colors, 'g'),
    b: tiltLatentGetChannelRange(bucket.colors, 'b')
  };
  var channel = 'r';
  if (ranges.g > ranges[channel]) channel = 'g';
  if (ranges.b > ranges[channel]) channel = 'b';
  var sorted = bucket.colors.slice().sort(function (a, b) { return a[channel] - b[channel]; });
  var midpoint = bucket.weight / 2;
  var accumulatedWeight = 0;
  var splitIndex = 1;

  for (var index = 0; index < sorted.length - 1; index += 1) {
    accumulatedWeight += sorted[index].weight;
    splitIndex = index + 1;
    if (accumulatedWeight >= midpoint) break;
  }

  var left = sorted.slice(0, splitIndex);
  var right = sorted.slice(splitIndex);
  var lw = 0, rw = 0;
  for (var li = 0; li < left.length; li++) lw += left[li].weight;
  for (var ri = 0; ri < right.length; ri++) rw += right[ri].weight;
  return [
    { colors: left, weight: lw },
    { colors: right, weight: rw }
  ];
}

function tiltLatentAverageBucket(bucket) {
  var r = 0, g = 0, b = 0;
  for (var i = 0; i < bucket.colors.length; i++) {
    var c = bucket.colors[i];
    r += c.r * c.weight;
    g += c.g * c.weight;
    b += c.b * c.weight;
  }
  return {
    r: Math.round(r / bucket.weight),
    g: Math.round(g / bucket.weight),
    b: Math.round(b / bucket.weight),
    weight: bucket.weight
  };
}

function tiltLatentToHex(c) {
  function pad(n) { var s = n.toString(16); return s.length < 2 ? '0' + s : s; }
  return '#' + pad(c.r) + pad(c.g) + pad(c.b);
}

function tiltLatentExtractRepresentativeColorsFromPixels(pixels, count) {
  if (count <= 0) return [];

  var histogram = {};
  var keys = [];
  for (var index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < TILT_LATENT_MIN_ALPHA) continue;
    var r = pixels[index];
    var g = pixels[index + 1];
    var b = pixels[index + 2];
    var key = ((r >> TILT_LATENT_QUANTIZATION_SHIFT) << 8)
      | ((g >> TILT_LATENT_QUANTIZATION_SHIFT) << 4)
      | (b >> TILT_LATENT_QUANTIZATION_SHIFT);
    var existing = histogram[key];
    if (existing) {
      existing.r += r; existing.g += g; existing.b += b; existing.weight += 1;
    } else {
      histogram[key] = { r: r, g: g, b: b, weight: 1 };
      keys.push(key);
    }
  }

  var colors = [];
  for (var ki = 0; ki < keys.length; ki++) {
    var e = histogram[keys[ki]];
    colors.push({
      r: Math.round(e.r / e.weight),
      g: Math.round(e.g / e.weight),
      b: Math.round(e.b / e.weight),
      weight: e.weight
    });
  }
  if (colors.length === 0) return [];

  var totalWeight = 0;
  for (var ci = 0; ci < colors.length; ci++) totalWeight += colors[ci].weight;
  var buckets = [{ colors: colors, weight: totalWeight }];
  var target = Math.min(count, colors.length);
  while (buckets.length < target) {
    var bucketIndex = -1;
    var bestScore = -1;
    for (var bi = 0; bi < buckets.length; bi += 1) {
      var bucket = buckets[bi];
      if (bucket.colors.length < 2) continue;
      var widestRange = Math.max(
        tiltLatentGetChannelRange(bucket.colors, 'r'),
        tiltLatentGetChannelRange(bucket.colors, 'g'),
        tiltLatentGetChannelRange(bucket.colors, 'b')
      );
      var score = widestRange * Math.sqrt(bucket.weight);
      if (score > bestScore) { bestScore = score; bucketIndex = bi; }
    }
    if (bucketIndex < 0) break;
    var split = tiltLatentSplitBucket(buckets[bucketIndex]);
    if (!split) break;
    buckets.splice(bucketIndex, 1, split[0], split[1]);
  }

  var out = [];
  for (var oi = 0; oi < buckets.length; oi++) out.push(tiltLatentAverageBucket(buckets[oi]));
  out.sort(function (a, b) { return b.weight - a.weight; });
  var hexes = [];
  for (var hi = 0; hi < out.length; hi++) hexes.push(tiltLatentToHex(out[hi]));
  return hexes;
}

/* ---------- 颜色解析（@paper-design/shaders get-shader-color-from-string.js
   hex/rgb 分支同构；宿主只用 hex + rgb 两种来源） ---------- */
function tiltLatentShaderColorFromString(colorString) {
  if (Array.isArray(colorString)) {
    if (colorString.length === 4) return colorString;
    if (colorString.length === 3) return colorString.concat([1]);
    return [0.5, 0.5, 0.5, 1];
  }
  if (typeof colorString !== 'string') return [0.5, 0.5, 0.5, 1];
  var r, g, b, a = 1;
  if (colorString.charAt(0) === '#') {
    var hex = colorString.replace(/^#/, '');
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split('').map(function (ch) { return ch + ch; }).join('');
    }
    if (hex.length === 6) hex = hex + 'ff';
    if (!/^[0-9a-fA-F]{8}$/.test(hex)) return [0.5, 0.5, 0.5, 1];
    r = parseInt(hex.slice(0, 2), 16) / 255;
    g = parseInt(hex.slice(2, 4), 16) / 255;
    b = parseInt(hex.slice(4, 6), 16) / 255;
    a = parseInt(hex.slice(6, 8), 16) / 255;
  } else if (colorString.indexOf('rgb') === 0) {
    var m = /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+))?\s*\)$/i.exec(colorString);
    if (!m) return [0.5, 0.5, 0.5, 1];
    r = parseInt(m[1], 10) / 255;
    g = parseInt(m[2], 10) / 255;
    b = parseInt(m[3], 10) / 255;
    a = m[4] === undefined ? 1 : parseFloat(m[4]);
  } else {
    return [0.5, 0.5, 0.5, 1];
  }
  function clamp01(n) { return Math.min(Math.max(n, 0), 1); }
  return [clamp01(r), clamp01(g), clamp01(b), clamp01(a)];
}

/* ---------- GLSL（@paper-design/shaders v0.0.80，Apache-2.0；模板插值已
   按 shader-utils.js / meshGradientMeta 原文展开） ---------- */

var TILT_LATENT_VERTEX_SHADER = [
  '#version 300 es',
  'precision mediump float;',
  '',
  'layout(location = 0) in vec4 a_position;',
  '',
  'uniform vec2 u_resolution;',
  'uniform float u_pixelRatio;',
  'uniform float u_imageAspectRatio;',
  'uniform float u_originX;',
  'uniform float u_originY;',
  'uniform float u_worldWidth;',
  'uniform float u_worldHeight;',
  'uniform float u_fit;',
  'uniform float u_scale;',
  'uniform float u_rotation;',
  'uniform float u_offsetX;',
  'uniform float u_offsetY;',
  '',
  'out vec2 v_objectUV;',
  'out vec2 v_objectBoxSize;',
  'out vec2 v_responsiveUV;',
  'out vec2 v_responsiveBoxGivenSize;',
  'out vec2 v_patternUV;',
  'out vec2 v_patternBoxSize;',
  'out vec2 v_imageUV;',
  '',
  'vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {',
  '  vec2 box = vec2(0.);',
  '  // fit = none',
  '  box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);',
  '  float noFitBoxWidth = box.x;',
  '  if (u_fit == 1.) { // fit = contain',
  '    box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);',
  '  } else if (u_fit == 2.) { // fit = cover',
  '    box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);',
  '  }',
  '  box.y = box.x / boxRatio;',
  '  return vec3(box, noFitBoxWidth);',
  '}',
  '',
  'void main() {',
  '  gl_Position = a_position;',
  '',
  '  vec2 uv = gl_Position.xy * .5;',
  '  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);',
  '  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);',
  '  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;',
  '  float r = u_rotation * 3.14159265358979323846 / 180.;',
  '  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));',
  '  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);',
  '',
  '',
  '  // ===================================================',
  '',
  '  float fixedRatio = 1.;',
  '  vec2 fixedRatioBoxGivenSize = vec2(',
  '  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,',
  '  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y',
  '  );',
  '',
  '  v_objectBoxSize = getBoxSize(fixedRatio, fixedRatioBoxGivenSize).xy;',
  '  vec2 objectWorldScale = u_resolution.xy / v_objectBoxSize;',
  '',
  '  v_objectUV = uv;',
  '  v_objectUV *= objectWorldScale;',
  '  v_objectUV += boxOrigin * (objectWorldScale - 1.);',
  '  v_objectUV += graphicOffset;',
  '  v_objectUV /= u_scale;',
  '  v_objectUV = graphicRotation * v_objectUV;',
  '',
  '  // ===================================================',
  '',
  '  v_responsiveBoxGivenSize = vec2(',
  '  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,',
  '  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y',
  '  );',
  '  float responsiveRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;',
  '  vec2 responsiveBoxSize = getBoxSize(responsiveRatio, v_responsiveBoxGivenSize).xy;',
  '  vec2 responsiveBoxScale = u_resolution.xy / responsiveBoxSize;',
  '',
  '  v_responsiveUV = uv;',
  '  v_responsiveUV *= responsiveBoxScale;',
  '  v_responsiveUV += boxOrigin * (responsiveBoxScale - 1.);',
  '  v_responsiveUV += graphicOffset;',
  '  v_responsiveUV /= u_scale;',
  '  v_responsiveUV.x *= responsiveRatio;',
  '  v_responsiveUV = graphicRotation * v_responsiveUV;',
  '  v_responsiveUV.x /= responsiveRatio;',
  '',
  '  // ===================================================',
  '',
  '  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;',
  '  vec2 patternBoxGivenSize = vec2(',
  '  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,',
  '  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y',
  '  );',
  '  patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;',
  '',
  '  vec3 boxSizeData = getBoxSize(patternBoxRatio, patternBoxGivenSize);',
  '  v_patternBoxSize = boxSizeData.xy;',
  '  float patternBoxNoFitBoxWidth = boxSizeData.z;',
  '  vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;',
  '',
  '  v_patternUV = uv;',
  '  v_patternUV += graphicOffset / patternBoxScale;',
  '  v_patternUV += boxOrigin;',
  '  v_patternUV -= boxOrigin / patternBoxScale;',
  '  v_patternUV *= u_resolution.xy;',
  '  v_patternUV /= u_pixelRatio;',
  '  if (u_fit > 0.) {',
  '    v_patternUV *= (patternBoxNoFitBoxWidth / v_patternBoxSize.x);',
  '  }',
  '  v_patternUV /= u_scale;',
  '  v_patternUV = graphicRotation * v_patternUV;',
  '  v_patternUV += boxOrigin / patternBoxScale;',
  '  v_patternUV -= boxOrigin;',
  '  // x100 is a default multiplier between vertex and fragmant shaders',
  '  // we use it to avoid UV presision issues',
  '  v_patternUV *= .01;',
  '',
  '  // ===================================================',
  '',
  '  vec2 imageBoxSize;',
  '  if (u_fit == 1.) { // contain',
  '    imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;',
  '  } else if (u_fit == 2.) { // cover',
  '    imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;',
  '  } else {',
  '    imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);',
  '  }',
  '  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;',
  '  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;',
  '',
  '  v_imageUV = uv;',
  '  v_imageUV *= imageBoxScale;',
  '  v_imageUV += boxOrigin * (imageBoxScale - 1.);',
  '  v_imageUV += graphicOffset;',
  '  v_imageUV /= u_scale;',
  '  v_imageUV.x *= u_imageAspectRatio;',
  '  v_imageUV = graphicRotation * v_imageUV;',
  '  v_imageUV.x /= u_imageAspectRatio;',
  '',
  '  v_imageUV += .5;',
  '  v_imageUV.y = 1. - v_imageUV.y;',
  '}'
].join('\n');

/* mesh-gradient.js 片元（maxColorCount=10 展开；declarePI/rotation2/hash21 内联） */
var TILT_LATENT_MESH_FRAGMENT_SHADER = [
  '#version 300 es',
  'precision mediump float;',
  '',
  'uniform float u_time;',
  '',
  'uniform vec4 u_colors[10];',
  'uniform float u_colorsCount;',
  '',
  'uniform float u_distortion;',
  'uniform float u_swirl;',
  'uniform float u_grainMixer;',
  'uniform float u_grainOverlay;',
  '',
  'in vec2 v_objectUV;',
  'out vec4 fragColor;',
  '',
  '#define TWO_PI 6.28318530718',
  '#define PI 3.14159265358979323846',
  '',
  'vec2 rotate(vec2 uv, float th) {',
  '  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;',
  '}',
  '',
  'float hash21(vec2 p) {',
  '  p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;',
  '  p += dot(p, p + 19.19);',
  '  return fract(p.x * p.y);',
  '}',
  '',
  'float valueNoise(vec2 st) {',
  '  vec2 i = floor(st);',
  '  vec2 f = fract(st);',
  '  float a = hash21(i);',
  '  float b = hash21(i + vec2(1.0, 0.0));',
  '  float c = hash21(i + vec2(0.0, 1.0));',
  '  float d = hash21(i + vec2(1.0, 1.0));',
  '  vec2 u = f * f * (3.0 - 2.0 * f);',
  '  float x1 = mix(a, b, u.x);',
  '  float x2 = mix(c, d, u.x);',
  '  return mix(x1, x2, u.y);',
  '}',
  '',
  'float noise(vec2 n, vec2 seedOffset) {',
  '  return valueNoise(n + seedOffset);',
  '}',
  '',
  'vec2 getPosition(int i, float t) {',
  '  float a = float(i) * .37;',
  '  float b = .6 + fract(float(i) / 3.) * .9;',
  '  float c = .8 + fract(float(i + 1) / 4.);',
  '',
  '  float x = sin(t * b + a);',
  '  float y = cos(t * c + a * 1.5);',
  '',
  '  return .5 + .5 * vec2(x, y);',
  '}',
  '',
  'void main() {',
  '  vec2 uv = v_objectUV;',
  '  uv += .5;',
  '  vec2 grainUV = uv * 1000.;',
  '',
  '  float grain = noise(grainUV, vec2(0.));',
  '  float mixerGrain = .4 * u_grainMixer * (grain - .5);',
  '',
  '  const float firstFrameOffset = 41.5;',
  '  float t = .5 * (u_time + firstFrameOffset);',
  '',
  '  float radius = smoothstep(0., 1., length(uv - .5));',
  '  float center = 1. - radius;',
  '  for (float i = 1.; i <= 2.; i++) {',
  '    uv.x += u_distortion * center / i * sin(t + i * .4 * smoothstep(.0, 1., uv.y)) * cos(.2 * t + i * 2.4 * smoothstep(.0, 1., uv.y));',
  '    uv.y += u_distortion * center / i * cos(t + i * 2. * smoothstep(.0, 1., uv.x));',
  '  }',
  '',
  '  vec2 uvRotated = uv;',
  '  uvRotated -= vec2(.5);',
  '  float angle = 3. * u_swirl * radius;',
  '  uvRotated = rotate(uvRotated, -angle);',
  '  uvRotated += vec2(.5);',
  '',
  '  vec3 color = vec3(0.);',
  '  float opacity = 0.;',
  '  float totalWeight = 0.;',
  '',
  '  for (int i = 0; i < 10; i++) {',
  '    if (i >= int(u_colorsCount)) break;',
  '',
  '    vec2 pos = getPosition(i, t) + mixerGrain;',
  '    vec3 colorFraction = u_colors[i].rgb * u_colors[i].a;',
  '    float opacityFraction = u_colors[i].a;',
  '',
  '    float dist = length(uvRotated - pos);',
  '',
  '    dist = pow(dist, 3.5);',
  '    float weight = 1. / (dist + 1e-3);',
  '    color += colorFraction * weight;',
  '    opacity += opacityFraction * weight;',
  '    totalWeight += weight;',
  '  }',
  '',
  '  color /= max(1e-4, totalWeight);',
  '  opacity /= max(1e-4, totalWeight);',
  '',
  '  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));',
  '  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);',
  '  grainOverlay = pow(grainOverlay, 1.3);',
  '',
  '  float grainOverlayV = grainOverlay * 2. - 1.;',
  '  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));',
  '  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);',
  '  grainOverlayStrength = pow(grainOverlayStrength, .8);',
  '  color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);',
  '',
  '  opacity += .5 * grainOverlayStrength;',
  '  opacity = clamp(opacity, 0., 1.);',
  '',
  '  fragColor = vec4(color, opacity);',
  '}'
].join('\n');

/* dithering.js 片元（simplexNoise/declarePI/hash11/hash21 内联；
   u_shape/u_type 由 LatentBackground 传入的 shape='warp'(2)/type='4x4'(3) 消费） */
var TILT_LATENT_DITHER_FRAGMENT_SHADER = [
  '#version 300 es',
  'precision mediump float;',
  '',
  'uniform float u_time;',
  '',
  'uniform vec2 u_resolution;',
  'uniform float u_pixelRatio;',
  'uniform float u_originX;',
  'uniform float u_originY;',
  'uniform float u_worldWidth;',
  'uniform float u_worldHeight;',
  'uniform float u_fit;',
  'uniform float u_scale;',
  'uniform float u_rotation;',
  'uniform float u_offsetX;',
  'uniform float u_offsetY;',
  '',
  'uniform float u_pxSize;',
  'uniform vec4 u_colorBack;',
  'uniform vec4 u_colorFront;',
  'uniform float u_shape;',
  'uniform float u_type;',
  '',
  'out vec4 fragColor;',
  '',
  'vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }',
  'float snoise(vec2 v) {',
  '  const vec4 C = vec4(0.211324865405187, 0.366025403784439,',
  '    -0.577350269189626, 0.024390243902439);',
  '  vec2 i = floor(v + dot(v, C.yy));',
  '  vec2 x0 = v - i + dot(i, C.xx);',
  '  vec2 i1;',
  '  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
  '  vec4 x12 = x0.xyxy + C.xxzz;',
  '  x12.xy -= i1;',
  '  i = mod(i, 289.0);',
  '  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))',
  '    + i.x + vec3(0.0, i1.x, 1.0));',
  '  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),',
  '      dot(x12.zw, x12.zw)), 0.0);',
  '  m = m * m;',
  '  m = m * m;',
  '  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
  '  vec3 h = abs(x) - 0.5;',
  '  vec3 ox = floor(x + 0.5);',
  '  vec3 a0 = x - ox;',
  '  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);',
  '  vec3 g;',
  '  g.x = a0.x * x0.x + h.x * x0.y;',
  '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
  '  return 130.0 * dot(m, g);',
  '}',
  '#define TWO_PI 6.28318530718',
  '#define PI 3.14159265358979323846',
  '',
  'float hash11(float p) {',
  '  p = fract(p * 0.3183099) + 0.1;',
  '  p *= p + 19.19;',
  '  return fract(p * p);',
  '}',
  '',
  'float hash21(vec2 p) {',
  '  p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;',
  '  p += dot(p, p + 19.19);',
  '  return fract(p.x * p.y);',
  '}',
  '',
  'float getSimplexNoise(vec2 uv, float t) {',
  '  float noise = .5 * snoise(uv - vec2(0., .3 * t));',
  '  noise += .5 * snoise(2. * uv + vec2(0., .32 * t));',
  '',
  '  return noise;',
  '}',
  '',
  'const int bayer2x2[4] = int[4](0, 2, 3, 1);',
  'const int bayer4x4[16] = int[16](',
  '0, 8, 2, 10,',
  '12, 4, 14, 6,',
  '3, 11, 1, 9,',
  '15, 7, 13, 5',
  ');',
  '',
  'const int bayer8x8[64] = int[64](',
  '0, 32, 8, 40, 2, 34, 10, 42,',
  '48, 16, 56, 24, 50, 18, 58, 26,',
  '12, 44, 4, 36, 14, 46, 6, 38,',
  '60, 28, 52, 20, 62, 30, 54, 22,',
  '3, 35, 11, 43, 1, 33, 9, 41,',
  '51, 19, 59, 27, 49, 17, 57, 25,',
  '15, 47, 7, 39, 13, 45, 5, 37,',
  '63, 31, 55, 23, 61, 29, 53, 21',
  ');',
  '',
  'float getBayerValue(vec2 uv, int size) {',
  '  ivec2 pos = ivec2(fract(uv / float(size)) * float(size));',
  '  int index = pos.y * size + pos.x;',
  '',
  '  if (size == 2) {',
  '    return float(bayer2x2[index]) / 4.0;',
  '  } else if (size == 4) {',
  '    return float(bayer4x4[index]) / 16.0;',
  '  } else if (size == 8) {',
  '    return float(bayer8x8[index]) / 64.0;',
  '  }',
  '  return 0.0;',
  '}',
  '',
  '',
  'void main() {',
  '  float t = .5 * u_time;',
  '',
  '  float pxSize = u_pxSize * u_pixelRatio;',
  '  vec2 pxSizeUV = gl_FragCoord.xy - .5 * u_resolution;',
  '  pxSizeUV /= pxSize;',
  '  vec2 canvasPixelizedUV = (floor(pxSizeUV) + .5) * pxSize;',
  '  vec2 normalizedUV = canvasPixelizedUV / u_resolution;',
  '',
  '  vec2 ditheringNoiseUV = canvasPixelizedUV;',
  '  vec2 shapeUV = normalizedUV;',
  '',
  '  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);',
  '  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);',
  '  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;',
  '  float r = u_rotation * PI / 180.;',
  '  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));',
  '  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);',
  '',
  '  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;',
  '  vec2 boxSize = vec2(',
  '  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,',
  '  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y',
  '  );',
  '  ',
  '  if (u_shape > 3.5) {',
  '    vec2 objectBoxSize = vec2(0.);',
  '    // fit = none',
  '    objectBoxSize.x = min(boxSize.x, boxSize.y);',
  '    if (u_fit == 1.) { // fit = contain',
  '      objectBoxSize.x = min(u_resolution.x, u_resolution.y);',
  '    } else if (u_fit == 2.) { // fit = cover',
  '      objectBoxSize.x = max(u_resolution.x, u_resolution.y);',
  '    }',
  '    objectBoxSize.y = objectBoxSize.x;',
  '    vec2 objectWorldScale = u_resolution.xy / objectBoxSize;',
  '',
  '    shapeUV *= objectWorldScale;',
  '    shapeUV += boxOrigin * (objectWorldScale - 1.);',
  '    shapeUV += vec2(-u_offsetX, u_offsetY);',
  '    shapeUV /= u_scale;',
  '    shapeUV = graphicRotation * shapeUV;',
  '  } else {',
  '    vec2 patternBoxSize = vec2(0.);',
  '    // fit = none',
  '    patternBoxSize.x = patternBoxRatio * min(boxSize.x / patternBoxRatio, boxSize.y);',
  '    float patternWorldNoFitBoxWidth = patternBoxSize.x;',
  '    if (u_fit == 1.) { // fit = contain',
  '      patternBoxSize.x = patternBoxRatio * min(u_resolution.x / patternBoxRatio, u_resolution.y);',
  '    } else if (u_fit == 2.) { // fit = cover',
  '      patternBoxSize.x = patternBoxRatio * max(u_resolution.x / patternBoxRatio, u_resolution.y);',
  '    }',
  '    patternBoxSize.y = patternBoxSize.x / patternBoxRatio;',
  '    vec2 patternWorldScale = u_resolution.xy / patternBoxSize;',
  '',
  '    shapeUV += vec2(-u_offsetX, u_offsetY) / patternWorldScale;',
  '    shapeUV += boxOrigin;',
  '    shapeUV -= boxOrigin / patternWorldScale;',
  '    shapeUV *= u_resolution.xy;',
  '    shapeUV /= u_pixelRatio;',
  '    if (u_fit > 0.) {',
  '      shapeUV *= (patternWorldNoFitBoxWidth / patternBoxSize.x);',
  '    }',
  '    shapeUV /= u_scale;',
  '    shapeUV = graphicRotation * shapeUV;',
  '    shapeUV += boxOrigin / patternWorldScale;',
  '    shapeUV -= boxOrigin;',
  '    shapeUV += .5;',
  '  }',
  '',
  '  float shape = 0.;',
  '  if (u_shape < 1.5) {',
  '    // Simplex noise',
  '    shapeUV *= .001;',
  '',
  '    shape = 0.5 + 0.5 * getSimplexNoise(shapeUV, t);',
  '    shape = smoothstep(0.3, 0.9, shape);',
  '',
  '  } else if (u_shape < 2.5) {',
  '    // Warp',
  '    shapeUV *= .003;',
  '',
  '    for (float i = 1.0; i < 6.0; i++) {',
  '      shapeUV.x += 0.6 / i * cos(i * 2.5 * shapeUV.y + t);',
  '      shapeUV.y += 0.6 / i * cos(i * 1.5 * shapeUV.x + t);',
  '    }',
  '',
  '    shape = .15 / max(0.001, abs(sin(t - shapeUV.y - shapeUV.x)));',
  '    shape = smoothstep(0.02, 1., shape);',
  '',
  '  } else if (u_shape < 3.5) {',
  '    // Dots',
  '    shapeUV *= .05;',
  '',
  '    float stripeIdx = floor(2. * shapeUV.x / TWO_PI);',
  '    float rand = hash11(stripeIdx * 10.);',
  '    rand = sign(rand - .5) * pow(.1 + abs(rand), .4);',
  '    shape = sin(shapeUV.x) * cos(shapeUV.y - 5. * rand * t);',
  '    shape = pow(abs(shape), 6.);',
  '',
  '  } else if (u_shape < 4.5) {',
  '    // Sine wave',
  '    shapeUV *= 4.;',
  '',
  '    float wave = cos(.5 * shapeUV.x - 2. * t) * sin(1.5 * shapeUV.x + t) * (.75 + .25 * cos(3. * t));',
  '    shape = 1. - smoothstep(-1., 1., shapeUV.y + wave);',
  '',
  '  } else if (u_shape < 5.5) {',
  '    // Ripple',
  '',
  '    float dist = length(shapeUV);',
  '    float waves = sin(pow(dist, 1.7) * 7. - 3. * t) * .5 + .5;',
  '    shape = waves;',
  '',
  '  } else if (u_shape < 6.5) {',
  '    // Swirl',
  '',
  '    float l = length(shapeUV);',
  '    float angle = 6. * atan(shapeUV.y, shapeUV.x) + 4. * t;',
  '    float twist = 1.2;',
  '    float offset = 1. / pow(max(l, 1e-6), twist) + angle / TWO_PI;',
  '    float mid = smoothstep(0., 1., pow(l, twist));',
  '    shape = mix(0., fract(offset), mid);',
  '',
  '  } else {',
  '    // Sphere',
  '    shapeUV *= 2.;',
  '',
  '    float d = 1. - pow(length(shapeUV), 2.);',
  '    vec3 pos = vec3(shapeUV, sqrt(max(0., d)));',
  '    vec3 lightPos = normalize(vec3(cos(1.5 * t), .8, sin(1.25 * t)));',
  '    shape = .5 + .5 * dot(lightPos, pos);',
  '    shape *= step(0., d);',
  '  }',
  '',
  '',
  '  int type = int(floor(u_type));',
  '  float dithering = 0.0;',
  '',
  '  switch (type) {',
  '    case 1: {',
  '      dithering = step(hash21(ditheringNoiseUV), shape);',
  '    } break;',
  '    case 2:',
  '    dithering = getBayerValue(pxSizeUV, 2);',
  '    break;',
  '    case 3:',
  '    dithering = getBayerValue(pxSizeUV, 4);',
  '    break;',
  '    default :',
  '    dithering = getBayerValue(pxSizeUV, 8);',
  '    break;',
  '  }',
  '',
  '  dithering -= .5;',
  '  float res = step(.5, shape + dithering);',
  '',
  '  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;',
  '  float fgOpacity = u_colorFront.a;',
  '  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;',
  '  float bgOpacity = u_colorBack.a;',
  '',
  '  vec3 color = fgColor * res;',
  '  float opacity = fgOpacity * res;',
  '',
  '  color += bgColor * (1. - opacity);',
  '  opacity += bgOpacity * (1. - opacity);',
  '',
  '  fragColor = vec4(color, opacity);',
  '}'
].join('\n');

/* ---------- ShaderMount 驱动核心（shader-mount.js 同构：
   全屏 quad / currentFrame+=dt*speed / u_time=currentFrame*1e-3 /
   零速停 rAF / setUniforms 立即补帧 / 像素预算 sqrt clamp） ---------- */
function TiltLatentShaderMount(parentElement, fragmentShader, uniforms, speed) {
  var doc = parentElement.ownerDocument;
  var canvas = doc.createElement('canvas');
  canvas.style.cssText = 'display:block;position:absolute;inset:0;width:100%;height:100%;';
  parentElement.insertBefore(canvas, parentElement.firstChild);

  var gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) { canvas.parentNode.removeChild(canvas); return null; }

  var program = null;
  var uniformLocations = {};
  var uniformCache = {};
  var rafId = null;
  var lastRenderTime = 0;
  var currentFrame = 0;
  var speedValue = 0;
  var currentSpeed = 0;
  var resolutionChanged = true;
  var disposed = false;
  var minPixelRatio = 1;            /* LatentBackground.tsx:280 minPixelRatio={1} */
  var maxPixelCount = TILT_LATENT_MAX_SHADER_PIXELS;  /* LatentBackground.tsx:27 */

  function compileShader(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      if (typeof console !== 'undefined') console.error('TiltLatent shader compile:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
  (function initProgram() {
    var vs = compileShader(gl.VERTEX_SHADER, TILT_LATENT_VERTEX_SHADER);
    var fs = compileShader(gl.FRAGMENT_SHADER, fragmentShader);
    if (!vs || !fs) return;
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      if (typeof console !== 'undefined') console.error('TiltLatent program link:', gl.getProgramInfoLog(program));
      program = null;
      return;
    }
    gl.detachShader(program, vs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  })();
  if (!program) {
    var loseCtx = gl.getExtension('WEBGL_lose_context');
    if (loseCtx) loseCtx.loseContext();
    canvas.parentNode.removeChild(canvas);
    return null;
  }

  /* 全屏双三角（shader-mount.js:90 原值） */
  var positionLocation = gl.getAttribLocation(program, 'a_position');
  var positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  uniformLocations.u_time = gl.getUniformLocation(program, 'u_time');
  uniformLocations.u_pixelRatio = gl.getUniformLocation(program, 'u_pixelRatio');
  uniformLocations.u_resolution = gl.getUniformLocation(program, 'u_resolution');

  var renderScale = 1;

  /* handleResize（shader-mount.js:161-192；devicePixelContentBoxSize 缺省分支，
     Safari 缩放簿记为 Electron Chromium 宿主不需要） */
  function resize() {
    if (disposed || !parentElement.isConnected) return;
    var parentW = parentElement.clientWidth || 1;
    var parentH = parentElement.clientHeight || 1;
    var dpr = Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    var pinchZoom = 1;
    try { pinchZoom = (window.visualViewport && window.visualViewport.scale) || 1; } catch (e) { }
    var targetRenderScale = Math.max(dpr, minPixelRatio) * pinchZoom;
    var targetPixelWidth = Math.round(parentW) * targetRenderScale;
    var targetPixelHeight = Math.round(parentH) * targetRenderScale;
    var headroom = Math.sqrt(maxPixelCount) / Math.sqrt(targetPixelWidth * targetPixelHeight);
    var scaleToMeetMaxPixelCount = Math.min(1, headroom);
    var newWidth = Math.round(targetPixelWidth * scaleToMeetMaxPixelCount);
    var newHeight = Math.round(targetPixelHeight * scaleToMeetMaxPixelCount);
    var newRenderScale = newWidth / Math.round(parentW);
    if (canvas.width !== newWidth || canvas.height !== newHeight || renderScale !== newRenderScale) {
      renderScale = newRenderScale;
      canvas.width = newWidth;
      canvas.height = newHeight;
      resolutionChanged = true;
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      render(now());
    }
  }

  function render(currentTime) {
    if (disposed) return;
    var dt = currentTime - lastRenderTime;
    lastRenderTime = currentTime;
    if (currentSpeed !== 0) currentFrame += dt * currentSpeed;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform1f(uniformLocations.u_time, currentFrame * 1e-3);
    if (resolutionChanged) {
      gl.uniform2f(uniformLocations.u_resolution, gl.canvas.width, gl.canvas.height);
      gl.uniform1f(uniformLocations.u_pixelRatio, renderScale);
      resolutionChanged = false;
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (currentSpeed !== 0) {
      rafId = requestAnimationFrame(render);
    } else {
      rafId = null;
    }
  }

  function now() { return (typeof performance !== 'undefined') ? performance.now() : Date.now(); }

  function areUniformValuesEqual(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      for (var i = 0; i < a.length; i++) { if (!areUniformValuesEqual(a[i], b[i])) return false; }
      return true;
    }
    return false;
  }

  /* setUniformValues（shader-mount.js:276-335 同构：vec4 数组嵌套展平） */
  function setUniformValues(updatedUniforms) {
    if (disposed) return;
    gl.useProgram(program);
    for (var key in updatedUniforms) {
      if (!Object.prototype.hasOwnProperty.call(updatedUniforms, key)) continue;
      var value = updatedUniforms[key];
      if (areUniformValuesEqual(uniformCache[key], value)) continue;
      uniformCache[key] = Array.isArray(value) ? value.slice() : value;
      if (!uniformLocations[key]) uniformLocations[key] = gl.getUniformLocation(program, key);
      var location = uniformLocations[key];
      if (!location) continue;
      if (Array.isArray(value)) {
        var flat = (Array.isArray(value[0])) ? [].concat.apply([], value) : value;
        switch (flat.length) {
          case 2: gl.uniform2fv(location, flat); break;
          case 3: gl.uniform3fv(location, flat); break;
          case 4: gl.uniform4fv(location, flat); break;
          case 40: gl.uniform4fv(location, flat); break;   /* u_colors[10] */
          default: break;
        }
      } else if (typeof value === 'number') {
        gl.uniform1f(location, value);
      }
    }
  }

  function updateCurrentSpeed() {
    var hidden = false;
    try { hidden = document.hidden; } catch (e) { }
    setCurrentSpeed(hidden ? 0 : speedValue);
  }
  function setCurrentSpeed(newSpeed) {
    currentSpeed = newSpeed;
    if (rafId === null && newSpeed !== 0) {
      lastRenderTime = now();
      rafId = requestAnimationFrame(render);
    }
    if (rafId !== null && newSpeed === 0) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }
  function onVisibility() { updateCurrentSpeed(); }

  setUniformValues(uniforms);
  resize();
  setSpeed(speed);

  function setSpeed(newSpeed) {
    speedValue = (newSpeed == null) ? 1 : newSpeed;
    updateCurrentSpeed();
  }
  function setUniforms(newUniforms) {
    setUniformValues(newUniforms);
    for (var k in newUniforms) uniforms[k] = newUniforms[k];
    render(now());
  }
  function dispose() {
    disposed = true;
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    try {
      gl.deleteProgram(program);
      gl.deleteBuffer(positionBuffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.getError();
    } catch (e) { }
    try {
      var ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    } catch (e) { }
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  return {
    setSpeed: setSpeed,
    setUniforms: setUniforms,
    resize: resize,
    dispose: dispose,
    canvas: canvas
  };
}

/* ---------- 工厂（LatentBackground.tsx:109-326 的 DOM 落地 + 驱动循环同构） ---------- */
function TiltLatentBackground(opts) {
  var host = opts.host;
  if (!host || !host.appendChild || (typeof document === 'undefined')) return null;

  var theme = opts.theme;
  var tuning = opts.tuning || tiltLatentDefaultTuning;
  var staticMode = !!opts.staticMode;
  var pausedGet = opts.pausedGet || function () { return false; };
  var audioPowerGet = opts.audioPowerGet || function () { return 0; };
  var bandsGet = opts.bandsGet || function () { return null; };
  var coverUrlGet = opts.coverUrlGet || function () { return null; };

  var showMesh = tuning.displayMode !== 'dithering';      /* LatentBackground.tsx:126 */
  var showDithering = tuning.displayMode !== 'mesh';      /* LatentBackground.tsx:125 */

  /* 容器（:257-261 absolute inset-0 z-0，底色 theme.backgroundColor） */
  var container = document.createElement('div');
  container.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;background-color:' +
    (theme.backgroundColor || '#000000') + ';';

  /* mesh 层（:262-285 inset-0，scale(1.025) origin center） */
  var meshLayer = document.createElement('div');
  meshLayer.style.cssText = 'position:absolute;inset:0;transform:scale(1.025);transform-origin:center;';
  container.appendChild(meshLayer);

  /* dithering 层（:286-313 soft-light + opacity + scale(1.015)） */
  var ditherLayer = document.createElement('div');
  ditherLayer.style.cssText = 'position:absolute;inset:0;mix-blend-mode:' + (showMesh ? 'soft-light' : 'normal') +
    ';opacity:' + (showMesh ? tuning.ditheringOpacity : 1) + ';transform:scale(1.015);transform-origin:center;';
  container.appendChild(ditherLayer);

  /* 主题色压暗层（:315-323 overlayEnabled && overlayOpacity>0） */
  var overlay = null;
  if (tuning.overlayEnabled && tuning.overlayOpacity > 0) {
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background-color:' +
      (theme.backgroundColor || '#000000') + ';opacity:' + tuning.overlayOpacity + ';';
    container.appendChild(overlay);
  }
  host.appendChild(container);

  /* 两个 mount 的 sizing 默认（@paper-design/shaders-react 各组件缺省路径）：
     MeshGradient ← defaultObjectSizing{fit:contain(1),scale:1,origin:.5/.5,world:0/0}；
     Dithering ← defaultPatternSizing{fit:none(0),scale:.6(组件缺省覆盖),origin:.5/.5,world:0/0} */
  var MESH_SIZING = { u_fit: 1, u_scale: 1, u_rotation: 0, u_offsetX: 0, u_offsetY: 0, u_originX: 0.5, u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0 };
  var DITHER_SIZING = { u_fit: 0, u_scale: 0.6, u_rotation: 0, u_offsetX: 0, u_offsetY: 0, u_originX: 0.5, u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0 };

  var coverColors = [];
  var currentTheme = theme;

  function applyThemeColors() {
    var shaderColors = tiltLatentShaderColors(coverColors, currentTheme, tuning.colorSource);
    var meshUniforms = {
      u_colors: shaderColors.mesh.map(tiltLatentShaderColorFromString),
      u_colorsCount: shaderColors.mesh.length,
      u_distortion: tuning.meshDistortion,
      u_swirl: tuning.meshSwirl,
      u_grainMixer: 0,          /* LatentBackground.tsx:275 */
      u_grainOverlay: 0.01      /* LatentBackground.tsx:276 */
    };
    for (var k in MESH_SIZING) meshUniforms[k] = MESH_SIZING[k];
    if (meshMount) meshMount.setUniforms(meshUniforms);
    if (ditherMount) {
      var ditherUniforms = {
        u_colorBack: tiltLatentShaderColorFromString(shaderColors.ditheringBack),
        u_colorFront: tiltLatentShaderColorFromString(shaderColors.ditheringFront),
        u_shape: 2,               /* DitheringShapes.warp（LatentBackground.tsx:303 shape="warp"） */
        u_type: 3,                /* DitheringTypes['4x4']（LatentBackground.tsx:304 type="4x4"） */
        u_pxSize: tuning.ditheringSize
      };
      for (var k2 in DITHER_SIZING) ditherUniforms[k2] = DITHER_SIZING[k2];
      ditherMount.setUniforms(ditherUniforms);
    }
    container.style.backgroundColor = currentTheme.backgroundColor || '#000000';
    if (overlay) overlay.style.backgroundColor = currentTheme.backgroundColor || '#000000';
  }

  /* mount 创建（:268-282 / :297-311 的组件 props 同构：minPixelRatio 1、
     maxPixelCount 1280*720、初始 speed=resolveLatentShaderSpeed(base, audio, 0, paused)） */
  var paused0 = !!pausedGet();
  var meshMount = null;
  var ditherMount = null;
  try {
    meshMount = TiltLatentShaderMount(meshLayer, TILT_LATENT_MESH_FRAGMENT_SHADER, {}, staticMode ? 0 :
      tiltLatentShaderSpeed(tuning.meshSpeed, tuning.meshAudioSpeed, 0, paused0));
  } catch (e) { meshMount = null; }
  try {
    ditherMount = TiltLatentShaderMount(ditherLayer, TILT_LATENT_DITHER_FRAGMENT_SHADER, {}, staticMode ? 0 :
      tiltLatentShaderSpeed(tuning.ditheringSpeed, tuning.ditheringAudioSpeed, 0, paused0));
  } catch (e) { ditherMount = null; }

  if (!meshMount && !ditherMount) {
    if (container.parentNode) container.parentNode.removeChild(container);
    return null;   /* WebGL2 不可用 → 调用方回退宿主暖夜层 */
  }
  applyThemeColors();

  /* 封面取色（:129-148 useEffect 等价；coverUrl 变化重取） */
  var coverToken = 0;
  function refreshCoverColors() {
    var url = coverUrlGet();
    if (!url) { coverColors = []; applyThemeColors(); return; }
    var token = ++coverToken;
    tiltLatentLoadImagePixels(url).then(function (pixels) {
      if (token !== coverToken || disposed) return;
      coverColors = pixels ? tiltLatentExtractRepresentativeColorsFromPixels(pixels, 6) : [];
      applyThemeColors();
    });
  }
  refreshCoverColors();

  /* 驱动循环（:155-255 updateAudioResponse 同构——平滑常数/能量/脉冲/速度/
     uniforms/层样式全量；showMesh/showDithering 按 tuning 'both' 恒真） */
  var animationFrame = 0;
  var smoothedPower = 0;
  var smoothedBass = 0;
  var smoothedMid = 0;
  var smoothedBeatSpeed = 0;
  var previousBeatEnergy = 0;
  var latentOnsetPulse = 0;
  var disposed = false;

  function updateAudioResponse() {
    if (disposed) return;
    var isPaused = staticMode ? true : !!pausedGet();
    var bands = bandsGet() || {};
    var powerRaw = audioPowerGet();
    var bassRaw = (bands.bass != null) ? bands.bass : 0;
    var lowMidRaw = (bands.lowMid != null) ? bands.lowMid : 0;
    var midRaw = (bands.mid != null) ? bands.mid : 0;
    var vocalRaw = (bands.vocal != null) ? bands.vocal : 0;
    var trebleRaw = (bands.treble != null) ? bands.treble : 0;

    var targetPower = isPaused ? 0 : tiltLatentNormalizeAudio(powerRaw);                       /* :176 */
    var targetBass = isPaused ? 0 : tiltLatentNormalizeAudio(bassRaw);                         /* :177 */
    var targetBeatEnergy = isPaused ? 0 : tiltLatentBroadbandEnergy(                           /* :178-186 */
      bassRaw, lowMidRaw, midRaw, vocalRaw, trebleRaw);
    var targetMid = isPaused ? 0 : tiltLatentNormalizeAudio(Math.max(midRaw, vocalRaw));       /* :187-189 */

    smoothedPower = tiltLatentEaseTowards(smoothedPower, targetPower, 0.12);                   /* :190 */
    smoothedBass = tiltLatentEaseTowards(smoothedBass, targetBass, 0.16);                      /* :191 */
    smoothedMid = tiltLatentEaseTowards(smoothedMid, targetMid, 0.13);                         /* :192-196 */

    latentOnsetPulse = tuning.enhancedBeatResponse                                             /* :197-203 */
      ? tiltLatentOnsetPulse(targetBeatEnergy, previousBeatEnergy, latentOnsetPulse)
      : 0;
    previousBeatEnergy = targetBeatEnergy;                                                     /* :204 */

    var beatSpeedTarget = tiltLatentAudioSpeedTarget(                                          /* :205-209 */
      targetBeatEnergy, latentOnsetPulse, tuning.enhancedBeatResponse);
    smoothedBeatSpeed = tiltLatentEaseTowards(                                                 /* :210-214 */
      smoothedBeatSpeed, beatSpeedTarget, beatSpeedTarget > smoothedBeatSpeed ? 0.42 : 0.14);

    if (ditherMount) {
      ditherMount.setSpeed(tiltLatentShaderSpeed(                                              /* :219-224 */
        tuning.ditheringSpeed, tuning.ditheringAudioSpeed, smoothedBeatSpeed, isPaused));
      ditherMount.setUniforms({                                                                /* :225-227 */
        u_pxSize: Math.max(0.5, tuning.ditheringSize - smoothedBass * tuning.ditheringSize * 0.34)
      });
    }
    if (meshMount) {
      meshMount.setSpeed(tiltLatentShaderSpeed(                                                /* :228-233 */
        tuning.meshSpeed, tuning.meshAudioSpeed, smoothedBeatSpeed, isPaused));
      meshMount.setUniforms({                                                                  /* :234-237 */
        u_distortion: tuning.meshDistortion + smoothedPower * 0.62,
        u_swirl: tuning.meshSwirl + smoothedMid * 0.38
      });
    }

    if (ditherLayer) {
      ditherLayer.style.opacity = showMesh                                                     /* :239-244 */
        ? String(Math.min(1, tuning.ditheringOpacity + smoothedBass * 0.25))
        : '1';
      ditherLayer.style.transform = 'scale(' + (1.015 + smoothedBass * 0.025) + ')';
    }
    if (meshLayer) {
      meshLayer.style.filter = 'saturate(' + (1.04 + smoothedMid * 0.34) + ') brightness(' +   /* :245-248 */
        (0.94 + smoothedPower * 0.16) + ')';
      meshLayer.style.transform = 'scale(' + (1.025 + smoothedPower * 0.018) + ')';
    }

    animationFrame = requestAnimationFrame(updateAudioResponse);                                /* :250 */
  }
  animationFrame = requestAnimationFrame(updateAudioResponse);

  function onResize() { if (meshMount) meshMount.resize(); if (ditherMount) ditherMount.resize(); }
  window.addEventListener('resize', onResize);

  return {
    destroy: function () {
      disposed = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', onResize);
      if (meshMount) meshMount.dispose();
      if (ditherMount) ditherMount.dispose();
      if (container.parentNode) container.parentNode.removeChild(container);
    },
    setTheme: function (next) {
      currentTheme = next || currentTheme;
      applyThemeColors();
    },
    setCoverUrl: function () { refreshCoverColors(); },
    layer: container
  };
}
