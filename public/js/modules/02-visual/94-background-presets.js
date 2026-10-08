// ============================================================
// 94-background-presets.js — 正交背景首批三实现
// Portions Copyright (c) 2025 chthollyphile and Folia contributors
// Adapted from folia-major (AGPL-3.0):
//   src/components/visualizer/backgrounds/common/FluidBackground.tsx（cover-fluid）
//   src/components/visualizer/backgrounds/common/GeometricBackground.tsx（geometric）
//
// 实现契约（与前景完全正交）：只消费 visualizerBackgroundContext()
// 的 {theme, coverUrl, audioPower, bands, seed, staticMode, paused}
// （92-background-registry.js，与 Folia definition.ts RenderProps 同形），
// 不读歌词行、不读前景模式 tuning、不进 VISUALIZER_OVERLAY_MODES。
//
// impl 接口（95-background-runtime 调用）：
//   mount(host, ctx)      挂载（host 为 #visualizer-bg-layer 内容根）
//   unmount()             卸载清理（清 rAF/计时器/DOM）
//   tickSlow(ctx)         ~700ms 低速上下文轮询（封面/取色/seed 变化）
//   tick(ctx, dtSec, now) ~30fps 绘制帧（仅 needsRaf 实现被调用）
//   onResize()            窗口尺寸变化
//   needsRaf              是否需要 rAF 绘制循环
// 性能纪律：绘制帧零分配（形状/粒子/弹簧 scratch 表挂载时一次建好）。
// ============================================================

var VISUALIZER_BG_IMPLS = {};

function registerVisualizerBackgroundImpl(id, impl) {
  if (!id || !impl) return;
  VISUALIZER_BG_IMPLS[id] = impl;
}

/* ---------- 小工具：CSS 颜色解析（不依赖前景模块） ---------- */
function vbgHexToRgb(css, fallback) {
  var s = String(css || '').trim();
  var m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) s = '#' + m[1].charAt(0) + m[1].charAt(0) + m[1].charAt(1) + m[1].charAt(1) + m[1].charAt(2) + m[1].charAt(2);
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) {
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (m) return [Number(m[1]) | 0, Number(m[2]) | 0, Number(m[3]) | 0];
  return fallback || [255, 122, 61];
}

function vbgThemeColors(theme) {
  // Folia Theme 形状：{backgroundColor, primaryColor, secondaryColor, accentColor}
  var t = theme || {};
  return {
    bg: t.backgroundColor || '#14100d',
    c1: t.primaryColor || '#ff7a3d',
    c2: t.secondaryColor || '#ffb38a',
    c3: t.accentColor || t.secondaryColor || '#ffd070'
  };
}

/* mulberry32 种子随机（geometric 布局可复现，同一 seed 同一构图） */
function vbgMulberry32(seed) {
  var a = (Number(seed) || 1) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================
   背景一：cover-fluid — 封面流体底（FluidBackground.tsx DOM 直移）
   封面 384px 降采样 + blur(40px) 烤死在 img 上 + wrapper 双层
   cross-fade（fade 只做在包装 div 上，绝不做在被 blur 的 img 上——
   对 blur 层动 opacity 会让浏览器每帧重栅格化导致瓦片闪烁）。
   零依赖：无 framer-motion / 无 iOS 分支（桌面环境）。
   ============================================================ */
(function () {
  // 40px blur 已抹平一切细于 ~40px 的细节，384px 长边源的模糊结果与
  // 原分辨率视觉一致，但纹理单瓦上传、大封面不闪烁（Folia 同款结论）。
  var COVER_BLUR_SOURCE_MAX = 384;
  var state = {
    host: null,
    sourceCover: '',
    buildSeq: 0,
    themeKey: '',
    topLayer: null
  };

  function buildDownscaledCover(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = function () {
        try {
          var nw = img.naturalWidth || img.width;
          var nh = img.naturalHeight || img.height;
          if (!nw || !nh) { resolve(null); return; }
          var scale = Math.min(1, COVER_BLUR_SOURCE_MAX / Math.max(nw, nh));
          var w = Math.max(1, Math.round(nw * scale));
          var h = Math.max(1, Math.round(nh * scale));
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          var ctx = c.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.82));
        } catch (e) {
          // 无 CORS 头的远程封面会 taint canvas：回退原 URL（重 blur 下可接受）
          resolve(null);
        }
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  function applyTheme(theme) {
    var host = state.host;
    if (!host) return;
    var t = vbgThemeColors(theme);
    var key = t.bg + t.c1 + t.c2 + t.c3;
    if (key === state.themeKey) return;
    state.themeKey = key;
    host.style.setProperty('--vbgf-bg', t.bg);
    host.style.setProperty('--vbgf-c1', t.c1);
    host.style.setProperty('--vbgf-c2', t.c2);
    host.style.setProperty('--vbgf-c3', t.c3);
  }

  /* 新封面层：wrapper(淡入) > img(烤死 blur+scale)。decode 完成一帧后才揭示。 */
  function pushCoverLayer(src) {
    var host = state.host;
    if (!host) return;
    var stage = host.querySelector('.vbg-fluid-stage');
    if (!stage) return;
    var layer = document.createElement('div');
    layer.className = 'vbg-fluid-layer';
    var img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.src = src;
    layer.appendChild(img);
    stage.appendChild(layer);
    var old = state.topLayer;
    state.topLayer = layer;
    var reveal = function () {
      if (layer.parentNode !== stage) return;
      layer.classList.add('in');
      // 新层淡入完成后丢弃底下的旧层（1.5s 过渡 + 余量）
      setTimeout(function () {
        if (old && old.parentNode === stage && state.topLayer === layer) stage.removeChild(old);
      }, 1750);
    };
    if (img.decode) {
      img.decode().then(function () { requestAnimationFrame(reveal); }).catch(reveal);
    } else {
      if (img.complete) reveal();
      else img.onload = reveal;
    }
  }

  registerVisualizerBackgroundImpl('cover-fluid', {
    needsRaf: false,
    mount: function (host, ctx) {
      state.host = host;
      state.sourceCover = '';
      state.themeKey = '';
      state.topLayer = null;
      host.classList.add('vbg-fluid');
      // 结构：stage(封面层) + idle(无封面底色) + tint(取色光斑) + blend(对角叠色)
      host.innerHTML =
        '<div class="vbg-fluid-idle" aria-hidden="true"></div>' +
        '<div class="vbg-fluid-stage" aria-hidden="true"></div>' +
        '<div class="vbg-fluid-tint" aria-hidden="true"></div>' +
        '<div class="vbg-fluid-blend" aria-hidden="true"></div>';
      this.tickSlow(ctx);
    },
    unmount: function () {
      state.buildSeq++;
      state.host = null;
      state.topLayer = null;
      state.sourceCover = '';
    },
    tickSlow: function (ctx) {
      var host = state.host;
      if (!host) return;
      applyTheme(ctx.theme);
      var url = ctx.coverUrl || '';
      if (url && url === state.sourceCover) return;
      state.sourceCover = url;
      var seq = ++state.buildSeq;
      if (!url) {
        var stage = host.querySelector('.vbg-fluid-stage');
        if (stage) stage.innerHTML = '';
        state.topLayer = null;
        return;
      }
      buildDownscaledCover(url).then(function (smallUrl) {
        if (seq !== state.buildSeq || !state.host) return; // 已切歌/已卸载，丢弃过期结果
        pushCoverLayer(smallUrl || url);
      });
    },
    onResize: function () { },
    tick: null
  });
})();

/* ============================================================
   背景二：solid-gradient — 主题取色纯色渐变（无 Folia 对应，本仓原创）
   静态层：theme 三色对角渐变 + 底部主色光斑。无 rAF，仅低速换色。
   ============================================================ */
(function () {
  var state = { host: null, themeKey: '' };

  registerVisualizerBackgroundImpl('solid-gradient', {
    needsRaf: false,
    mount: function (host, ctx) {
      state.host = host;
      state.themeKey = '';
      host.classList.add('vbg-gradient');
      host.innerHTML = '<div class="vbg-gradient-core" aria-hidden="true"></div>';
      this.tickSlow(ctx);
    },
    unmount: function () { state.host = null; },
    tickSlow: function (ctx) {
      var host = state.host;
      if (!host) return;
      var core = host.querySelector('.vbg-gradient-core');
      if (!core) return;
      var t = vbgThemeColors(ctx.theme);
      var key = t.bg + t.c1 + t.c2 + t.c3;
      if (key === state.themeKey) return;
      state.themeKey = key;
      var rgb1 = vbgHexToRgb(t.c1);
      var rgb2 = vbgHexToRgb(t.c2);
      var rgb3 = vbgHexToRgb(t.c3);
      var rgbBg = vbgHexToRgb(t.bg);
      core.style.background =
        'radial-gradient(120% 90% at 50% 108%, rgba(' + rgb3[0] + ',' + rgb3[1] + ',' + rgb3[2] + ',0.34) 0%, rgba(0,0,0,0) 58%),' +
        'linear-gradient(168deg, rgb(' + rgb1[0] + ',' + rgb1[1] + ',' + rgb1[2] + ') 0%,' +
        'rgb(' + rgbBg[0] + ',' + rgbBg[1] + ',' + rgbBg[2] + ') 52%,' +
        'rgb(' + rgb2[0] + ',' + rgb2[1] + ',' + rgb2[2] + ') 100%)';
    },
    onResize: function () { },
    tick: null
  });
})();

/* ============================================================
   背景三：geometric — 几何律动（GeometricBackground.tsx canvas2d 移植）
   15 个描边形状（圆/方/三角/十字）+ 20 个上浮微粒 + 暗角。
   bands 驱动形状缩放（弹簧平滑）：Folia 的 AudioBands 频段映射到
   MineRadio 信号——circle←bass→kick、square←lowMid→mid（近似）、
   triangle←mid→vocal（近似）、cross←treble→treble；Folia 的 icon 型
   （lucide 图标）不移植，全部用纯几何形状。
   Folia 的 useTransform[10,200]→[0.95,1.45] 在 0~1 归一 bands 上
   等价为 scale = 0.95 + band*0.5。
   ============================================================ */
(function () {
  // Folia cross 形状的 clip-path polygon 顶点（百分比，12 点）
  var CROSS_PTS = [20, 0, 0, 20, 30, 50, 0, 80, 20, 100, 50, 70, 80, 100, 100, 80, 70, 50, 100, 20, 80, 0, 50, 30];
  var SHAPE_TYPES = ['circle', 'square', 'triangle', 'cross'];
  var state = {
    host: null,
    canvas: null,
    ctx2d: null,
    dpr: 1,
    seed: null,
    shapes: null,      // [{type,xPct,yPct,size,dur,delay,op,rev,filled,rot,band}]
    particles: null,   // [{size,xPct,yPct,op,dur,delay}]
    springs: null,     // band → {x, v}（弹簧平滑 scratch）
    colors: null,      // {shapeRgb, particleRgb}
    colorKey: ''
  };

  function regen(seed) {
    var rand = vbgMulberry32(seed ? String(seed).length * 2654435761 ^ (Number(seed) || 0) : Date.now());
    var shapes = [];
    for (var i = 0; i < 15; i++) {
      shapes.push({
        type: SHAPE_TYPES[Math.floor(rand() * SHAPE_TYPES.length) % 4],
        xPct: rand() * 100,
        yPct: rand() * 100,
        size: 40 + rand() * 100,
        dur: 30 + rand() * 30,
        delay: rand() * 5,
        op: 0.11 + rand() * 0.08,
        rev: rand() > 0.5,
        filled: rand() < 0.3,
        rot: rand() * 360,
        band: ''
      });
    }
    for (var k = 0; k < shapes.length; k++) {
      var s = shapes[k];
      // Folia getShapeScaleKey：circle→bass、square→lowMid、triangle→mid、cross→treble
      s.band = s.type === 'circle' ? 'kick' : (s.type === 'square' ? 'mid' : (s.type === 'triangle' ? 'vocal' : 'treble'));
    }
    var particles = [];
    for (var p = 0; p < 20; p++) {
      particles.push({
        size: 1 + rand() * 4,
        xPct: rand() * 100,
        yPct: rand() * 100,
        op: rand() * 0.3,
        dur: 15 + rand() * 20,
        delay: rand() * 10
      });
    }
    state.shapes = shapes;
    state.particles = particles;
    state.springs = { kick: { x: 0, v: 0 }, mid: { x: 0, v: 0 }, vocal: { x: 0, v: 0 }, treble: { x: 0, v: 0 } };
    state.seed = seed;
  }

  function resizeCanvas() {
    var canvas = state.canvas;
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    state.dpr = dpr;
    canvas.width = Math.max(2, Math.floor((window.innerWidth || 1280) * dpr));
    canvas.height = Math.max(2, Math.floor((window.innerHeight || 800) * dpr));
  }

  /* 弹簧趋近（Folia useSpring stiffness 300 / damping 30 的半隐式欧拉） */
  function springStep(sp, target, dt) {
    sp.v += ((target - sp.x) * 300 - sp.v * 30) * dt;
    sp.x += sp.v * dt;
    return sp.x;
  }

  function bandValue(bands, key, audioPower) {
    var v = bands ? bands[key] : 0;
    if (typeof v !== 'number' || !isFinite(v)) v = audioPower || 0;
    return Math.max(0, Math.min(1, v));
  }

  function applyColors(theme) {
    var t = vbgThemeColors(theme);
    var key = t.c2 + t.c3;
    if (key === state.colorKey) return;
    state.colorKey = key;
    state.colors = {
      shapeRgb: vbgHexToRgb(t.c2, [255, 179, 138]),
      particleRgb: vbgHexToRgb(t.c3, [255, 208, 112])
    };
  }

  function drawShapePath(ctx, type, half) {
    if (type === 'circle') {
      ctx.arc(0, 0, half, 0, Math.PI * 2);
    } else if (type === 'square') {
      ctx.rect(-half, -half, half * 2, half * 2);
    } else if (type === 'triangle') {
      ctx.moveTo(0, -half);
      ctx.lineTo(-half, half);
      ctx.lineTo(half, half);
      ctx.closePath();
    } else {
      // cross：12 点多边形（百分比坐标缩放到 half）
      ctx.moveTo((CROSS_PTS[0] - 50) / 50 * half, (CROSS_PTS[1] - 50) / 50 * half);
      for (var i = 2; i < CROSS_PTS.length; i += 2) {
        ctx.lineTo((CROSS_PTS[i] - 50) / 50 * half, (CROSS_PTS[i + 1] - 50) / 50 * half);
      }
      ctx.closePath();
    }
  }

  registerVisualizerBackgroundImpl('geometric', {
    needsRaf: true,
    mount: function (host, ctx) {
      state.host = host;
      state.seed = null;
      state.colorKey = '';
      host.classList.add('vbg-geo');
      host.innerHTML =
        '<canvas class="vbg-geo-canvas" aria-hidden="true"></canvas>' +
        '<div class="vbg-geo-vignette" aria-hidden="true"></div>';
      state.canvas = host.querySelector('.vbg-geo-canvas');
      state.ctx2d = state.canvas ? state.canvas.getContext('2d') : null;
      resizeCanvas();
      this.tickSlow(ctx);
    },
    unmount: function () {
      state.host = null;
      state.canvas = null;
      state.ctx2d = null;
      state.shapes = null;
      state.particles = null;
    },
    tickSlow: function (ctx) {
      if (!state.host) return;
      applyColors(ctx.theme);
      // seed 变化（切歌）→ 重排构图（Folia layerKey=seed 重挂载语义）
      var seed = ctx && ctx.seed != null ? ctx.seed : '';
      if (seed !== state.seed || !state.shapes) regen(seed);
    },
    onResize: function () {
      if (state.host) resizeCanvas();
    },
    tick: function (ctx, dtSec, nowMs) {
      var c = state.ctx2d;
      if (!c || !state.shapes) return;
      var w = state.canvas.width;
      var h = state.canvas.height;
      var dpr = state.dpr;
      var tSec = nowMs * 0.001;
      var bands = ctx && ctx.bands;
      var power = (ctx && ctx.audioPower) || 0;
      var paused = !!(ctx && ctx.paused);
      var dt = Math.min(0.1, Math.max(0.005, dtSec || 1 / 30));
      var colors = state.colors || { shapeRgb: [255, 179, 138], particleRgb: [255, 208, 112] };

      // 频段弹簧平滑（暂停时收敛到 0 缩放输入）
      var sp, target;
      var springs = state.springs;
      var keys = ['kick', 'mid', 'vocal', 'treble'];
      for (var bi = 0; bi < 4; bi++) {
        sp = springs[keys[bi]];
        target = paused ? 0 : bandValue(bands, keys[bi], power);
        springStep(sp, target, dt);
      }

      c.clearRect(0, 0, w, h);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.lineJoin = 'round';
      c.lineWidth = 1;

      var shapes = state.shapes;
      var shapeCss = colors.shapeRgb[0] + ',' + colors.shapeRgb[1] + ',' + colors.shapeRgb[2];
      for (var i = 0; i < shapes.length; i++) {
        var s = shapes[i];
        var spx = springs[s.band];
        var scale = 0.95 + Math.max(-0.2, Math.min(0.5, spx.x)) * 0.5; // Folia [0.95,1.45]
        // 漂浮三角波：y [30,-30,30] / x [-15,15,-15] 线性往返（Folia keyframes repeat:Infinity）
        var phase = (((tSec + s.delay) / s.dur) % 1 + 1) % 1;
        var tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;      // 0→1→0
        var dy = (30 - tri * 60) * (s.rev ? -1 : 1);
        var dx = (tri * 30 - 15) * (s.rev ? -1 : 1);
        var rot = s.rot + (paused ? 0 : phase * 360);
        c.save();
        c.translate(s.xPct / 100 * (w / dpr) + dx, s.yPct / 100 * (h / dpr) + dy);
        c.rotate((paused ? s.rot : rot) * Math.PI / 180);
        c.scale(scale, scale);
        c.beginPath();
        drawShapePath(c, s.type, s.size / 2);
        if (s.filled && (s.type === 'circle' || s.type === 'square')) {
          c.fillStyle = 'rgba(' + shapeCss + ',' + s.op.toFixed(3) + ')';
          c.fill();
        } else {
          c.strokeStyle = 'rgba(' + shapeCss + ',' + s.op.toFixed(3) + ')';
          c.stroke();
        }
        c.restore();
      }

      // 微粒：上浮 + 三角波透明度
      var particles = state.particles;
      var pCss = colors.particleRgb[0] + ',' + colors.particleRgb[1] + ',' + colors.particleRgb[2];
      var vw = w / dpr, vh = h / dpr;
      for (var pi = 0; pi < particles.length; pi++) {
        var pt = particles[pi];
        var pPhase = (((tSec + pt.delay) / pt.dur) % 1 + 1) % 1;
        var pTri = pPhase < 0.5 ? pPhase * 2 : 2 - pPhase * 2;
        var py = pt.yPct / 100 * vh - pPhase * 100; // Folia y: [0,-100]
        var alpha = paused ? pt.op * 0.4 : pt.op * pTri;
        c.beginPath();
        c.arc(pt.xPct / 100 * vw, py, pt.size / 2, 0, Math.PI * 2);
        c.fillStyle = 'rgba(' + pCss + ',' + alpha.toFixed(3) + ')';
        c.fill();
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
  });
})();

/* 首批三背景登记进正交背景注册表（entry.implReady 供选择器 UI 判断） */
registerVisualizerBackground({ id: 'cover-fluid', label: '流体封面', kind: 'dom-layer', order: 40, implReady: true });
registerVisualizerBackground({ id: 'solid-gradient', label: '纯色渐变', kind: 'dom-layer', order: 41, implReady: true });
registerVisualizerBackground({ id: 'geometric', label: '几何律动', kind: 'canvas-layer', order: 42, implReady: true });
