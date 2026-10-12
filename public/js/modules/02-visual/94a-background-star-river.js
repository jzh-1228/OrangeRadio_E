// ============================================================
// 94a-background-star-river.js — 正交背景四：星河粒子底（canvas2d）
//
// 把 03-lyrics-star-river.js（前景歌词星河 THREE.Points）的粒子形态学
// 移植进正交背景层：5 条水平河带（lane 分带）、沿 x 循环流动（flow）、
// 正弦蜿蜒（curve）、呼吸漂移（breath）、两端淡入淡出（edge）、
// 高频闪烁（twinkle）；颜色取封面派生主题（secondary→主星色、
// accent→亮星色），kick→粒径脉动、audioPower→辉度脉动。
// 前景版与歌词行世界宽高耦合（uWidth/uHeight 跟随当前行），背景版
// 按正交契约改挂视口：河带横贯屏幕、中心约 42% 高度，不读歌词行。
//
// 实现契约同 94-background-presets（92 注册表协议）：
//   mount/unmount/tickSlow/tick/onResize/needsRaf，context 只来自
//   visualizerBackgroundContext()；绘制帧零分配（粒子 scratch 表与
//   颜色字符串挂载/换色时一次建好，帧内仅数值与引用赋值）。
// 依赖：94-background-presets 的 vbgHexToRgb/vbgThemeColors/vbgMulberry32
// （同全局作用域顶层声明，index-loader 保证 94 → 94a → 95 顺序）。
// ============================================================

(function () {
  // 粒子规模：按视口面积伸缩（低端 220 / 满配 420，对齐前景 420 满编）
  var SR_PARTICLE_MIN = 220;
  var SR_PARTICLE_MAX = 420;
  var SR_DPR_MAX = 1.5; // 与 geometric 同档：背景垫底不需要超采样
  var state = {
    host: null,
    canvas: null,
    ctx2d: null,
    dpr: 1,
    vw: 0,
    vh: 0,
    count: 0,
    // 粒子 scratch 表（挂载/重生时一次建好；NaN 哨兵=未初始化）
    seed: null,      // Float32Array：0..1000（形态学哈希种子）
    lane: null,      // Float32Array：0..1（河带分带）
    depth: null,     // Float32Array：0..1（层次，近大远小+错峰）
    colBase: null,   // Array<string>：按 lane 混色的基础星色
    colSpark: null,  // Array<string>：亮星色（twinkle 高点切换用）
    colors: null,    // {a:[r,g,b], b:[r,g,b], bg:[r,g,b]}
    colorKey: '',
    baseGradKey: '', // 底色/星云渐变缓存键（尺寸+颜色）
    baseGrad: null,  // 线性底色渐变
    nebula1: null,   // 主题色星云 1
    nebula2: null,   // 主题色星云 2
    riverTime: 0,    // 自累加形态时钟（暂停时慢放，不受 nowMs 跳变影响）
    kick: 0,         // 平滑后的 kick（粒径脉动）
    glow: 0          // 平滑后的能量（辉度脉动）
  };

  function particleCount() {
    var w = window.innerWidth || 1280;
    var h = window.innerHeight || 800;
    return Math.max(SR_PARTICLE_MIN, Math.min(SR_PARTICLE_MAX, Math.round(w * h / 3800)));
  }

  /* 混色（fg fragmentShader 的 mix(colorA,colorB,t) 同式），t∈[0,1] */
  function mixRgb(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }

  /* 挂载/重生：按 mulberry32(seed) 生成确定性粒子表（同 seed 同构图），
     颜色字符串一次建好（帧内零分配的前提）。 */
  function regen(seed) {
    var rand = vbgMulberry32(seed ? String(seed).length * 2654435761 ^ (Number(seed) || 0) : 20261011);
    var n = state.count;
    state.seed = new Float32Array(n);
    state.lane = new Float32Array(n);
    state.depth = new Float32Array(n);
    state.colBase = new Array(n);
    state.colSpark = new Array(n);
    var cA = state.colors ? state.colors.a : [255, 122, 61];
    var cB = state.colors ? state.colors.b : [255, 247, 210];
    for (var i = 0; i < n; i++) {
      var sd = rand() * 1000;
      var ln = rand();
      var dp = rand();
      state.seed[i] = sd;
      state.lane[i] = ln;
      state.depth[i] = dp;
      // fg：mix 系数 = smoothstep(0.12,0.92,lane)*0.45 + tw*0.42 + glow*0.26
      // 背景版把 lane 分量烘进静态基色，tw 分量走 colSpark 切换
      var laneMix = Math.max(0, Math.min(1, (ln - 0.12) / 0.80)) * 0.45 + dp * 0.18;
      var rgb = mixRgb(cA, cB, laneMix);
      state.colBase[i] = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
      var spark = mixRgb(cA, cB, Math.min(1, laneMix + 0.34));
      state.colSpark[i] = 'rgb(' + spark[0] + ',' + spark[1] + ',' + spark[2] + ')';
    }
  }

  function resizeCanvas() {
    var canvas = state.canvas;
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, SR_DPR_MAX);
    state.dpr = dpr;
    state.vw = Math.max(2, window.innerWidth || 1280);
    state.vh = Math.max(2, window.innerHeight || 800);
    canvas.width = Math.floor(state.vw * dpr);
    canvas.height = Math.floor(state.vh * dpr);
    canvas.style.width = state.vw + 'px';
    canvas.style.height = state.vh + 'px';
    state.baseGradKey = ''; // 尺寸变化 → 渐变缓存失效重建
  }

  /* 底色 + 双星云渐变（颜色/尺寸变化才重建，帧内只复用对象） */
  function ensureGradients() {
    var c = state.ctx2d;
    if (!c) return;
    var key = state.vw + 'x' + state.vh + ':' + state.colorKey;
    if (key === state.baseGradKey && state.baseGrad) return;
    state.baseGradKey = key;
    var bg = state.colors ? state.colors.bg : [20, 16, 13];
    var c1 = state.colors ? state.colors.a : [255, 122, 61];
    var c3 = state.colors ? state.colors.b : [255, 208, 112];
    var g = c.createLinearGradient(0, 0, 0, state.vh);
    g.addColorStop(0, 'rgb(' + Math.round(bg[0] * 0.72) + ',' + Math.round(bg[1] * 0.72) + ',' + Math.round(bg[2] * 0.72) + ')');
    g.addColorStop(0.55, 'rgb(' + bg[0] + ',' + bg[1] + ',' + bg[2] + ')');
    g.addColorStop(1, 'rgb(' + Math.round(bg[0] * 0.55) + ',' + Math.round(bg[1] * 0.55) + ',' + Math.round(bg[2] * 0.55) + ')');
    state.baseGrad = g;
    var n1 = c.createRadialGradient(state.vw * 0.24, state.vh * 0.86, 0, state.vw * 0.24, state.vh * 0.86, state.vw * 0.62);
    n1.addColorStop(0, 'rgba(' + c1[0] + ',' + c1[1] + ',' + c1[2] + ',0.14)');
    n1.addColorStop(1, 'rgba(' + c1[0] + ',' + c1[1] + ',' + c1[2] + ',0)');
    state.nebula1 = n1;
    var n2 = c.createRadialGradient(state.vw * 0.80, state.vh * 0.12, 0, state.vw * 0.80, state.vh * 0.12, state.vw * 0.55);
    n2.addColorStop(0, 'rgba(' + c3[0] + ',' + c3[1] + ',' + c3[2] + ',0.10)');
    n2.addColorStop(1, 'rgba(' + c3[0] + ',' + c3[1] + ',' + c3[2] + ',0)');
    state.nebula2 = n2;
  }

  function hash1(n) { return (Math.sin(n) * 43758.5453123) % 1 * 0.5 + 0.5; } // fract(sin(n)*C) 同式，结果 0..1

  registerVisualizerBackgroundImpl('star-river', {
    needsRaf: true,
    mount: function (host, ctx) {
      state.host = host;
      state.canvas = null;
      state.ctx2d = null;
      state.colorKey = '';
      state.baseGradKey = '';
      state.riverTime = 0;
      state.kick = 0;
      state.glow = 0;
      host.classList.add('vbg-sr');
      host.innerHTML =
        '<canvas class="vbg-sr-canvas" aria-hidden="true"></canvas>' +
        '<div class="vbg-sr-vignette" aria-hidden="true"></div>';
      state.canvas = host.querySelector('.vbg-sr-canvas');
      state.ctx2d = state.canvas ? state.canvas.getContext('2d') : null;
      var t = vbgThemeColors(ctx && ctx.theme);
      state.colors = {
        a: vbgHexToRgb(t.c2, [255, 122, 61]),
        b: vbgHexToRgb(t.c3, [255, 247, 210]),
        bg: vbgHexToRgb(t.bg, [20, 16, 13])
      };
      state.colorKey = t.bg + t.c1 + t.c2 + t.c3;
      state.count = particleCount();
      regen(ctx ? ctx.seed : 0);
      resizeCanvas();
      ensureGradients();
      this.tick(ctx, 0, 0); // 首帧立即落一帧，避免挂载到首个 tick 间的空层
    },
    unmount: function () {
      state.host = null;
      state.canvas = null;
      state.ctx2d = null;
      state.baseGrad = null;
      state.nebula1 = null;
      state.nebula2 = null;
    },
    tickSlow: function (ctx) {
      if (!state.host) return;
      var t = vbgThemeColors(ctx && ctx.theme);
      var key = t.bg + t.c1 + t.c2 + t.c3;
      if (key !== state.colorKey) {
        state.colorKey = key;
        state.colors = {
          a: vbgHexToRgb(t.c2, [255, 122, 61]),
          b: vbgHexToRgb(t.c3, [255, 247, 210]),
          bg: vbgHexToRgb(t.bg, [20, 16, 13])
        };
        regen(ctx ? ctx.seed : 0); // 颜色字符串表随主题重建
      }
      var count = particleCount();
      if (count !== state.count) { // 窗口面积变化 → 粒子规模重定
        state.count = count;
        regen(ctx ? ctx.seed : 0);
      }
    },
    onResize: function () {
      if (state.host) resizeCanvas();
    },
    tick: function (ctx, dtSec, nowMs) {
      var c = state.ctx2d;
      if (!c || !state.seed || !state.seed.length) return;
      var w = state.vw;
      var h = state.vh;
      var dpr = state.dpr;
      var bands = ctx && ctx.bands;
      var power = (ctx && ctx.audioPower) || 0;
      var paused = !!(ctx && ctx.paused);
      var dt = Math.min(0.1, Math.max(0.005, dtSec || 1 / 30));
      // 暂停慢放（星河不完全停摆，漂停感），与覆盖层保温跳帧互不冲突
      state.riverTime += dt * (paused ? 0.12 : 1);
      var kickTarget = paused ? 0 : Math.max(0, Math.min(1, (bands && typeof bands.kick === 'number') ? bands.kick : power));
      var glowTarget = paused ? 0 : Math.max(0, Math.min(1, power || (bands && bands.rms) || 0));
      state.kick += (kickTarget - state.kick) * Math.min(1, dt * 6);
      state.glow += (glowTarget - state.glow) * Math.min(1, dt * 4);
      var kick = state.kick;
      var glowBoost = state.glow;

      var t = state.riverTime;
      // 河带几何：横贯视口，带宽=1.12×视宽，带高≈0.30×视高，中心 42% 高
      var riverW = w * 1.12;
      var riverH = h * 0.30;
      var cy = h * 0.42;
      var beat = kick; // fg 的 uBeat 近似：kick 短脉冲

      ensureGradients();
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      // 深空底 + 主题星云
      c.globalAlpha = 1;
      c.fillStyle = state.baseGrad;
      c.fillRect(0, 0, w, h);
      c.fillStyle = state.nebula1;
      c.fillRect(0, 0, w, h);
      c.fillStyle = state.nebula2;
      c.fillRect(0, 0, w, h);
      // 星河粒子：加色合成
      c.globalCompositeOperation = 'lighter';
      var n = state.count;
      var seeds = state.seed;
      var lanes = state.lane;
      var depths = state.depth;
      var colBase = state.colBase;
      var colSpark = state.colSpark;
      for (var i = 0; i < n; i++) {
        var sd = seeds[i];
        var ln = lanes[i];
        var laneBand = Math.floor(ln * 5);
        var laneLocal = ln * 5 - laneBand;
        var speed = 0.030 + hash1(sd * 1.71) * 0.055 + laneBand * 0.005;
        var flow = (hash1(sd * 2.13) + t * speed) % 1;
        if (flow < 0) flow += 1;
        var x = (flow - 0.5) * riverW * (1.08 + hash1(sd * 5.1) * 0.18) + w * 0.5;
        var curve = Math.sin(flow * 6.2831853 * (0.92 + hash1(sd * 4.0) * 0.46) + sd * 0.071 + t * 0.34);
        var breath = Math.sin(t * (0.42 + hash1(sd * 6.9) * 0.42) + sd * 0.093);
        var y = cy + (laneBand - 2) * riverH * 0.135
          + curve * riverH * (0.20 + hash1(sd * 9.0) * 0.18)
          + (laneLocal - 0.5) * riverH * 0.16
          + breath * riverH * 0.10
          + (depths[i] - 0.5) * riverH * 0.34;
        // 两端淡入淡出（fg smoothstep 边缘裁剪）
        var edgeIn = flow < 0.18 ? flow / 0.18 : 1;
        var edgeOut = flow > 0.82 ? (1 - flow) / 0.18 : 1;
        var edge = edgeIn * edgeOut;
        if (edge <= 0) continue;
        // twinkle：pow(0.5+0.5*sin(...),4) 高频闪烁
        var twRaw = 0.5 + 0.5 * Math.sin(t * (0.55 + (sd - Math.floor(sd)) * 0.35) + sd);
        var tw = twRaw * twRaw * twRaw * twRaw;
        var glow = edge * (0.62 + 0.38 * Math.sin(t * (0.9 + hash1(sd * 8.0) * 0.7) + sd));
        var alpha = (0.20 + glow * 0.78 + tw * 0.32 + beat * 0.10)
          * (0.35 + depths[i] * 0.65) * (1 + glowBoost * 0.45);
        if (alpha > 1) alpha = 1;
        if (alpha < 0.02) continue;
        var radius = (0.8 + hash1(sd * 12.0) * 1.6 + glow * 0.9 + kick * 0.6) * (0.6 + depths[i] * 0.7);
        if (radius > 4.6) radius = 4.6;
        c.fillStyle = (tw > 0.55) ? colSpark[i] : colBase[i];
        c.globalAlpha = alpha;
        c.beginPath();
        c.arc(x, y, radius, 0, 6.2831853);
        c.fill();
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
  });
})();

/* 星河背景接管注册表登记项（92 预登记 implReady:false 防御默认 → 就绪） */
registerVisualizerBackground({ id: 'star-river', label: '星河', kind: 'canvas-layer', order: 20, implReady: true });
