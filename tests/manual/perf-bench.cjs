#!/usr/bin/env node
/**
 * 纯计算热点微基准（Node 24 直接运行：node tests/manual/perf-bench.cjs）
 *
 * 契约：
 *  - 用 vm 沙箱加载被测模块的真实源码（方式参考 tests/automix-engine.test.js）。
 *    工程细节（两层 vm 慢路径规避，均已实测验证）：
 *    a) contextify 全局对象属性在热循环内每次访问约 90ns（比词法访问慢两个数量级），
 *       而被测代码全是全局 var —— 因此每个分组把「桩 + 真实模块源码 + 计时循环」
 *       拼进一个 IIFE 脚本在沙箱内执行：模块顶层 var/function 成为该函数作用域的
 *       词法符号（浏览器多 <script> 共享全局词法环境的等价物）；
 *    b) Math/Object 等 ECMAScript 内置标识符同样走 contextify（Math.max 三连 ≈300ns）
 *       —— IIFE 顶部把全套内置一次性局部化为 var（实测回到 ≈0.2ns）。
 *    度量尺说明：沙箱行为已与宿主 Node 24 对照一致（如 47~52 属性的 sonic frame
 *    对象 Object.assign 在宿主与沙箱均约 7μs —— V8 对超出 fast-properties 上限
 *    对象的真实成本，非沙箱失真）；绝对值以本机 V8 为准，跨机器只比相对值。
 *  - 嵌套在大函数内部的热点按当前行号提取源码片段并带锚点断言——
 *    源码行号漂移时 fail fast，绝不悄悄测错东西。
 *  - 合成输入全部来自固定种子 PRNG（mulberry32）；performance.now 为受控时钟
 *    （每 op 前进一帧 16.667ms），保证 autoTrack 窗口 / reveal 时间比较等控制流稳定。
 *  - 预热 + 固定迭代 × 7 轮取中位数压噪声。
 *  - 输出每行一个 JSON：{"metric":"名字","nsPerOp":数字}，exit 0。
 *
 * 被测热点（where → metric）：
 *  01-scene/02-beat-camera-runtime.js:392      beatCameraRmsDup（复用主循环 rms，仅回退路径自查时域）
 *  03-beat/06-sonic-audio-monitor.js:191       sonicMonitorStep
 *  03-beat/06-sonic-audio-monitor.js:671       sonicFrameBuild（scratch 单例 + 显式拷贝）
 *  11-main-loop.js:377                         sonicSnapshotCopy
 *  11-main-loop.js:115                         adaptiveRenderSkip
 *  01-scene/00-renderer-quality.js:126         renderQualityProfileAlloc
 *  01-scene/00-renderer-quality.js:48          refreshHzMedian
 *  03-beat/01-audio-beat-analysis.js:434       beatAdaptiveThreshold / beatPercentileSort
 *  02-visual/12-lyrics-row-layers.js:1375      lyricRowLayerLoop
 *  02-visual/12-lyrics-row-layers.js:1135      qualityFinalizeFrame
 *  02-visual/12-lyrics-row-layers.js:1343      residentScrollMedian
 *  02-visual/14-stage-lyrics-rendering.js:2245 stageRowMapRebuild
 *  02-visual/14-stage-lyrics-rendering.js:2497 stageSparksDrift
 *  02-visual/14-stage-lyrics-rendering.js:2435 glowColorCloneLerp（真实 three.r128 Color）
 *  10-shell/09-aurora-flow.js:625              lyricsFallbackScan（10-rainy-cab.js:961 同款）
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const MODULES = path.join(ROOT, 'public', 'js', 'modules');
const FRAME_MS = 1000 / 60;

/* ============================ 源码读取与片段提取 ============================ */

const srcCache = new Map();
function moduleSrc(rel) {
  if (!srcCache.has(rel)) srcCache.set(rel, fs.readFileSync(path.join(MODULES, rel), 'utf8'));
  return srcCache.get(rel);
}
function vendorSrc(name) {
  return fs.readFileSync(path.join(ROOT, 'public', 'vendor', name), 'utf8');
}

/** 1-based 行号片段提取（含首尾行）。 */
function linesOf(rel, from, to) {
  const lines = moduleSrc(rel).split('\n');
  if (from < 1 || to > lines.length || from > to) {
    throw new Error(`bad line range ${from}-${to} for ${rel} (${lines.length} lines)`);
  }
  return lines.slice(from - 1, to).join('\n');
}

/** 提取顶层 `function name(...) {...}`（本仓库 ES5 风格，结束 `}` 顶格）。 */
function topLevelFunction(rel, name) {
  const lines = moduleSrc(rel).split('\n');
  const start = lines.findIndex((l) => l.startsWith('function ' + name + '('));
  if (start < 0) throw new Error(`top-level function not found: ${rel} :: ${name}`);
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('}')) { end = i; break; }
  }
  if (end < 0) throw new Error(`function end not found: ${rel} :: ${name}`);
  return lines.slice(start, end + 1).join('\n');
}

/** 锚点断言：片段必须包含特征代码，源码演进时 fail fast。 */
function anchor(label, snippet, needles) {
  for (const n of needles) {
    if (!snippet.includes(n)) {
      throw new Error(`anchor mismatch for ${label}: missing ${JSON.stringify(n)}`);
    }
  }
  return snippet;
}

/* ============================ 固定种子 PRNG ============================ */

const MULBERRY32_SRC = `
function __mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}`;

/* ============================ 沙箱与 bench harness ============================ */

const ALL_RESULTS = [];

/**
 * 单脚本拼接执行：prelude（桩+合成数据）→ modules（真实源码/片段）→ bench（计时循环）。
 * 两层 vm 慢路径规避（实测数据，见文件头）：
 *  a) contextify 全局属性访问 ~90ns/次 → 模块源码与桩在同一 IIFE 内成为词法符号；
 *  b) Math/Object 等 ECMAScript 内置标识符同样走 contextify → IIFE 顶部一次性
 *     局部化为 var（内置访问从 ~100ns/次 回到 ~0.2ns/次）。
 * __hrtime/__results 是仅有的两个宿主桥（每轮 2 次 / 每 metric 1 次调用，可忽略）。
 */
const BUILTIN_LOCALIZATION = [
  'var Math=G.Math,Object=G.Object,Number=G.Number,String=G.String,Boolean=G.Boolean,Array=G.Array,JSON=G.JSON,',
  'Symbol=G.Symbol,isFinite=G.isFinite,isNaN=G.isNaN,parseFloat=G.parseFloat,parseInt=G.parseInt,RegExp=G.RegExp,Date=G.Date,',
  'Error=G.Error,TypeError=G.TypeError,RangeError=G.RangeError,EvalError=G.EvalError,Promise=G.Promise,',
  'Map=G.Map,Set=G.Set,WeakMap=G.WeakMap,WeakSet=G.WeakSet,',
  'Float32Array=G.Float32Array,Float64Array=G.Float64Array,Uint8Array=G.Uint8Array,Uint8ClampedArray=G.Uint8ClampedArray,',
  'Int8Array=G.Int8Array,Int16Array=G.Int16Array,Int32Array=G.Int32Array,Uint16Array=G.Uint16Array,Uint32Array=G.Uint32Array,',
  'ArrayBuffer=G.ArrayBuffer,DataView=G.DataView,NaN=G.NaN,Infinity=G.Infinity;',
];function runGroup(groupName, { prelude, modules, bench }) {
  const sandbox = {
    console,
    __hrtime: () => Number(process.hrtime.bigint()),
    __results: ALL_RESULTS,
  };
  vm.createContext(sandbox);
  const code = [
    '(function (G) {',
    'var __hrtime = G.__hrtime, __results = G.__results;',
    BUILTIN_LOCALIZATION.join('\n'),
    MULBERRY32_SRC,
    'function __benchOne(metric, iters, rounds, tickFn, opFn) {',
    '  var warm = Math.min(iters, 5000);',
    '  for (var w = 0; w < warm; w++) { tickFn(); opFn(); }',
    '  var samples = [];',
    '  for (var r = 0; r < rounds; r++) {',
    '    var t0 = __hrtime();',
    '    for (var i = 0; i < iters; i++) { tickFn(); opFn(); }',
    '    var t1 = __hrtime();',
    '    samples.push((t1 - t0) / iters);',
    '  }',
    '  samples.sort(function (a, b) { return a - b; });',
    '  __results.push({ metric: metric, nsPerOp: Math.round(samples[Math.floor(samples.length / 2)] * 1000) / 1000 });',
    '}',
    prelude,
    ...modules,
    bench,
    '}).call(globalThis, globalThis);',
  ].join('\n');
  if (process.env.PERF_BENCH_DUMP) {
    fs.writeFileSync(process.env.PERF_BENCH_DUMP, code);
  }
  try {
    vm.runInContext(code, sandbox, { filename: `perf-bench-${groupName}.js` });
  } catch (err) {
    err.message = `[group ${groupName}] ${err.message}`;
    throw err;
  }
}

/* ============================ 组装各分组 ============================ */

/* ---- 组 A：音频链（beat 相机双 RMS / sonic 整链 / 帧构建 / 快照） ---- */

function buildAudioGroup() {
  const mainLoopRms = anchor('mainLoopRms', linesOf('11-main-loop.js', 424, 431),
    ['runtimeAnalysisStride', 'rmsCount', 'Math.sqrt(rms / Math.max(1, rmsCount))']);
  const sonicBuildA = linesOf('03-beat/06-sonic-audio-monitor.js', 670, 677);
  const sonicBuildB = linesOf('03-beat/06-sonic-audio-monitor.js', 681, 708);
  anchor('sonicFrameBuild', sonicBuildA + sonicBuildB,
    ['SONIC_AUDIO_VALUE_KEYS.length', 'sonicAudioFrameScratch', 'sonicAudioMonitorState.frame = frame']);

  const prelude = `
    var __clock = { t: 12345 };
    var performance = { now: function () { return __clock.t; } };
    var window = { addEventListener: function () {}, removeEventListener: function () {} };
    var document = { readyState: 'complete', querySelectorAll: function () { return []; },
      getElementById: function () { return null; }, createElement: function () { return { style: {} }; },
      addEventListener: function () {} };
    var navigator = { hardwareConcurrency: 8 };
    var fx = {
      sonicAudioMonitorEnabled: true, sonicAudioAutoTrack: true, sonicAudioSensitivity: 100,
      sonicAudioBandStart: 1, sonicAudioBandEnd: 4, sonicAudioThreshold: 32, sonicAudioPulseStrength: 62
    };
    var audioCtx = { sampleRate: 44100, state: 'running' };
    var audio = { currentTime: 0, paused: false };
    var FREQ_SRC = new Uint8Array(1024);
    var TIME_SRC = new Uint8Array(2048);
    (function () {
      var rand = __mulberry32(20260905);
      for (var i = 0; i < 1024; i++) {
        var slope = 210 / (1 + i * 0.055);
        var peak = 60 * Math.exp(-Math.pow((i - 40) / 26, 2)) + 34 * Math.exp(-Math.pow((i - 180) / 90, 2));
        FREQ_SRC[i] = Math.max(0, Math.min(255, Math.round(slope + peak + rand() * 26)));
      }
      var rand2 = __mulberry32(20260906);
      for (var j = 0; j < 2048; j++) {
        var v = 128 + 78 * Math.sin(j * 0.021) + 26 * Math.sin(j * 0.13 + 1.7) + (rand2() - 0.5) * 46;
        TIME_SRC[j] = Math.max(0, Math.min(255, Math.round(v)));
      }
    })();
    // 两个 AnalyserNode 同源（08-audio-graph-controls.js:185-186 都 connect(source)），fftSize 同 2048
    var analyser = {
      fftSize: 2048,
      getByteFrequencyData: function (buf) { buf.set(FREQ_SRC.subarray(0, buf.length)); },
      getByteTimeDomainData: function (buf) { buf.set(TIME_SRC.subarray(0, buf.length)); }
    };
    var beatAnalyser = analyser;
    var frequencyData = new Uint8Array(1024);
    var timeDomainData = new Uint8Array(2048);
    var beatFrequencyData = new Uint8Array(1024);
    var beatTimeDomainData = new Uint8Array(2048);
    var readSavedVolume = function () { return 0.8; }; // 00-state/02-preferences-ui-modes.js 的桩
  `;

  const modules = [
    topLevelFunction('02-visual/04-visual-settings-persistence.js', 'clamp01'),
    topLevelFunction('02-visual/04-visual-settings-persistence.js', 'clampRange'),
    moduleSrc('00-state/03-beat-dj-state.js'),      // beatCam / rtBeat / djMode / cinemaDynamics（真实全局状态）
    moduleSrc('01-scene/02-beat-camera-runtime.js'), // processRealtimeBeatEngine / beatBandRms（真实）
    moduleSrc('03-beat/06-sonic-audio-monitor.js'),  // stepSonicAudioMonitor / getSonicAudioMonitorSnapshot（真实）
    // 主循环侧 RMS 循环（11-main-loop.js:397-404 真实片段，包装成函数）
    `function __mainLoopRms(rms) {
${mainLoopRms}
  return rms;
}`,
    // sonic 帧构建链（06:670-677 + 681-708 真实片段；beatData/triggerData 由参数传入）
    `function __sonicFrameBuild(values, beatData, triggerData, dt, legacyTreble, legacyMid, energy, warmth, brightness, opts) {
${sonicBuildA}
${sonicBuildB}
  return frame;
}`,
  ];

  const bench = `
    // 热点 1：双 2048 RMS —— beat 引擎自己的 getByteTimeDomainData+RMS（真实函数）
    //         + 主循环对 timeDomainData 的同名调用 + 同名 RMS 循环（真实片段）。
    (function () {
      var frameIdx = 0;
      __benchOne('beatCameraRmsDup', 40000, 7, function () {
        __clock.t += ${FRAME_MS}; frameIdx += 1; audio.currentTime = frameIdx / 60;
      }, function () {
        analyser.getByteTimeDomainData(timeDomainData); // 11-main-loop.js:385
        var rms = __mainLoopRms(0);                     // 11-main-loop.js:399-404
        // 11-main-loop.js:436：fftSize 相同守卫下把主循环 rms 传给 beat 引擎复用
        processRealtimeBeatEngine(1 / 60, (beatAnalyser && beatAnalyser.fftSize === analyser.fftSize) ? rms : undefined);
      });
    })();
    // 热点 2：sonic 整链（27 频段区间遍历 + 每次调用重算 2 次 hz→bin）。
    (function () {
      var frameIdx = 100000;
      __benchOne('sonicMonitorStep', 40000, 7, function () {
        __clock.t += ${FRAME_MS}; frameIdx += 1; audio.currentTime = frameIdx / 60;
      }, function () {
        stepSonicAudioMonitor(frequencyData, 1 / 60, {
          fx: fx, playing: true, beat: 0.3, sampleRate: 44100, fftSize: 2048,
          currentTime: audio.currentTime
        });
      });
    })();
    // 热点 4：主循环每帧先取快照（Object.assign({},frame) 30+ 字段 + 9 字段外壳），播放路径随即丢弃。
    __benchOne('sonicSnapshotCopy', 150000, 7, function () { __clock.t += ${FRAME_MS}; },
      function () { getSonicAudioMonitorSnapshot().frame; });
    // 热点 3：帧构建链（keys.forEach + 三源 Object.assign），合成 30+ 字段输入。
    (function () {
      var values = {
        subBass: 0.31, bass: 0.42, lowMid: 0.28, mid: 0.22, highMid: 0.16, presence: 0.11,
        brilliance: 0.07, air: 0.04, kickSub: 0.38, kickCore: 0.44, kickPunch: 0.29, kickWide: 0.33,
        body: 0.20, vocal: 0.24, snap: 0.12, lowDrive: 0.46, lowDominance: 1.31, energy: 0.39
      };
      var beatData = {
        kickLevel: 0.42, kickFlux: 0.06, kickThreshold: 0.05, kickOnset: 1, kickEnvelope: 0.48,
        kickConfidence: 0.62, kickLowDominance: 0.7, kickWindowName: 'Club', kickWindowStart: 2,
        kickWindowEnd: 5, kickHzStart: 46, kickHzEnd: 118
      };
      var triggerData = {
        triggerBandStart: 2, triggerBandEnd: 5, triggerHzStart: 52, triggerHzEnd: 165,
        triggerEnergy: 0.33, triggerThreshold: 0.4, triggerPulse: 0.52, triggerOnset: 1
      };
      var opts = { beat: 0.3 };
      __benchOne('sonicFrameBuild', 40000, 7, function () { __clock.t += ${FRAME_MS}; },
        function () { __sonicFrameBuild(values, beatData, triggerData, 1 / 60, 0.14, 0.2, 0.39, 0.44, 0.33, opts); });
    })();
  `;
  return { prelude, modules, bench };
}

/* ---- 组 B：渲染节奏决策（renderer-quality + main-loop 决策链） ---- */

function buildRenderGroup() {
  const prelude = `
    var __clock = { t: 12345 };
    var performance = { now: function () { return __clock.t; } };
    var window = { devicePixelRatio: 1.25, addEventListener: function () {}, removeEventListener: function () {} };
    var document = { readyState: 'complete', hidden: false, querySelectorAll: function () { return []; },
      getElementById: function () { return { appendChild: function () {} }; },
      createElement: function () { return { style: {} }; }, addEventListener: function () {} };
    var navigator = { hardwareConcurrency: 8 };
    var innerWidth = 1920, innerHeight = 1080;
    var fx = { foregroundFpsMode: undefined, performanceQuality: 'high', preset: 0, shelf: 'off', particleLyrics: true };
    var fxDefaults = {
      performanceQuality: 'high', lyricTextureClarity: 1, lyricCustomLineCount: 3,
      lyricContextOpacity: 0.72, lyricContextSpread: 1.15, lyricTranslationGap: 0.9,
      lyricTranslationScale: 0.82, lyricTranslationOpacity: 0.66
    };
    var THREE = {
      Scene: function () { this.background = null; },
      PerspectiveCamera: function () { this.aspect = 1; },
      WebGLRenderer: function () {
        this.domElement = { style: {}, tabIndex: 0 };
        this.capabilities = { maxTextureSize: 4096, getMaxAnisotropy: function () { return 8; } };
        this.setClearColor = function () {};
        this.setPixelRatio = function () {};
        this.setSize = function () {};
      }
    };
    // 前台播放场景（00-state/08-desktop-render-power.js 真实函数在浏览器态的等价分支）
    var isDeepBackgroundMode = function () { return false; };
    var playing = false;
    var audio = { paused: true };
    var requestAnimationFrame = function () { return 0; };
    var cancelAnimationFrame = function () {};
  `;

  const modules = [
    topLevelFunction('02-visual/04-visual-settings-persistence.js', 'clamp01'),
    topLevelFunction('02-visual/04-visual-settings-persistence.js', 'clampRange'),
    topLevelFunction('02-visual/04-visual-settings-persistence.js', 'normalizePerformanceQuality'),
    topLevelFunction('00-state/10-frame-scheduler.js', 'createFrameGate'),
    moduleSrc('01-scene/00-renderer-quality.js'), // sampleDisplayRefreshHz / renderQualityProfile / tier 链（真实）
    moduleSrc('11-main-loop.js'),                 // shouldSkipAdaptiveRenderFrame（真实）
  ];

  const bench = `
    // 热点 5：RENDER_VISIBLE_VSYNC=true（00-renderer-quality.js:9 硬编码）下
    //         shouldSkipAdaptiveRenderFrame 每帧空转（sampleDisplayRefreshHz +
    //         2×resolveAdaptiveRenderCadence 早退 + fps=0 分支）。
    (function () {
      var now = 1e6;
      __benchOne('adaptiveRenderSkip', 80000, 7, function () { now += ${FRAME_MS}; },
        function () { shouldSkipAdaptiveRenderFrame(now); });
    })();
    // 热点 5 补充：currentRenderAdaptiveContext→getRenderLoadTier→getRenderPixelLoad→
    //         getRenderPixelRatio→renderQualityProfile 链（每次分配 {cap,min,budget} 新对象）。
    __benchOne('renderQualityProfileAlloc', 150000, 7, function () {},
      function () { getRenderLoadTier(); });
    // 热点 12：sampleDisplayRefreshHz —— 每帧 samples.slice() 新数组 + 36 元素 sort 取中位数。
    (function () {
      var now = 2e6;
      __benchOne('refreshHzMedian', 120000, 7, function () { now += ${FRAME_MS}; },
        function () { sampleDisplayRefreshHz(now); });
    })();
  `;
  return { prelude, modules, bench };
}

/* ---- 组 C：歌词行层（12 整文件 + 08 整文件 + 14/10 片段） ---- */

const LYRIC_LINE_COUNT = 300;

function buildLyricsGroup() {
  const prelude = `
    var __clock = { t: 12345 };
    var performance = { now: function () { return __clock.t; } };
    var window = { addEventListener: function () {}, removeEventListener: function () {} };
    var document = { readyState: 'complete', querySelectorAll: function () { return []; },
      getElementById: function () { return null; }, createElement: function () { return { style: {} }; },
      addEventListener: function () {} };
    var navigator = { hardwareConcurrency: 8 };
    var setTimeout = function () { return 0; }, clearTimeout = function () {};
    var requestAnimationFrame = function () { return 0; }, cancelAnimationFrame = function () {};
    var fx = {
      lyricDisplayMode: 'single', lyricTranslationMode: 'off', lyricTextureClarity: 2,
      lyricVerticalFloat: true, lyricContextOpacity: 0.72, lyricContextSpread: 1.15,
      lyricTranslationGap: 0.9, lyricTranslationScale: 0.82, lyricTranslationOpacity: 0.66,
      lyricCustomLineCount: 3, lyricGlowParticles: true
    };
    var fxDefaults = {
      lyricTextureClarity: 2, lyricCustomLineCount: 3, lyricContextOpacity: 0.72, lyricContextSpread: 1.15,
      lyricTranslationGap: 0.9, lyricTranslationScale: 0.82, lyricTranslationOpacity: 0.66, lyricGlowColor: '#008aff'
    };
    var renderer = null;
    var lyricsHasNativeKaraoke = false;
    // 合成 lyricsLines：300 行，1/3 带翻译
    var lyricsLines = [];
    var lyricsTranslationLines = [];
    for (var __li = 0; __li < ${LYRIC_LINE_COUNT}; __li++) {
      lyricsLines.push({
        text: '歌词行 ' + __li,
        translation: __li % 3 === 0 ? ('翻译行 ' + __li) : null,
        startTime: __li * 2, endTime: __li * 2 + 1.8
      });
    }
    // mesh 桩：position/scale 形状对齐 three r128 用法（set/setScalar）
    function __makeMeshStub() {
      return {
        visible: false, renderOrder: 0,
        position: { x: 0, y: 0, z: 0, set: function (x, y, z) { this.x = x; this.y = y; this.z = z; } },
        scale: { x: 1, setScalar: function (v) { this.x = v; } }
      };
    }
  `;

  const modules = [
    topLevelFunction('02-visual/04-visual-settings-persistence.js', 'clamp01'),
    topLevelFunction('02-visual/04-visual-settings-persistence.js', 'clampRange'),
    topLevelFunction('02-visual/09-lyrics-payloads.js', 'normalizeStageLyricText'),
    topLevelFunction('06-lyrics/00-lyrics-fetch-parse.js', 'isNoLyricText'),
    topLevelFunction('06-lyrics/00-lyrics-fetch-parse.js', 'normalizeLyricTranslationText'),
    moduleSrc('02-visual/08-lyrics-display-modes.js'), // 显示模式纯函数集（真实整文件）
    // 质量目标度量（10-lyrics-mask-textures.js 顶层函数）
    topLevelFunction('02-visual/10-lyrics-mask-textures.js', 'lyricTextureClarityScale'),
    topLevelFunction('02-visual/10-lyrics-mask-textures.js', 'lyricRowTextureWidthBudget'),
    topLevelFunction('02-visual/10-lyrics-mask-textures.js', 'lyricQualityPoolBudgetBytes'),
    topLevelFunction('02-visual/10-lyrics-mask-textures.js', 'lyricQualityMaxResidentRows'),
    topLevelFunction('02-visual/10-lyrics-mask-textures.js', 'lyricQualityTargetMetrics'),
    // stage 层真实函数（14-stage-lyrics-rendering.js）
    topLevelFunction('02-visual/14-stage-lyrics-rendering.js', 'lyricVerticalFloatEnabled'),
    topLevelFunction('02-visual/14-stage-lyrics-rendering.js', 'stageLyricResidentRowKey'),
    topLevelFunction('02-visual/14-stage-lyrics-rendering.js', 'stageLyricResidentDisplayedScrollOffset'),
    topLevelFunction('02-visual/14-stage-lyrics-rendering.js', 'stageLyricPersistentPrimaryMap'),
    topLevelFunction('02-visual/14-stage-lyrics-rendering.js', 'stageLyricPersistentResidentRowMap'),
    topLevelFunction('02-visual/14-stage-lyrics-rendering.js', 'stageLyricPersistentLineRowsResident'),
    topLevelFunction('02-visual/14-stage-lyrics-rendering.js', 'stageLyricPersistentLineEffectsResident'),
    topLevelFunction('02-visual/14-stage-lyrics-rendering.js', 'stageLyricPersistentTargetRowsReady'),
    topLevelFunction('02-visual/14-stage-lyrics-rendering.js', 'stageLyricPersistentTargetEffectsReady'),
    topLevelFunction('02-visual/14-stage-lyrics-rendering.js', 'lyricLineDisplayTextAt'),
    topLevelFunction('02-visual/14-stage-lyrics-rendering.js', 'lyricLineTranslationTextAt'),
    topLevelFunction('02-visual/14-stage-lyrics-rendering.js', 'makeStageLyricTranslationEntry'),
    topLevelFunction('02-visual/14-stage-lyrics-rendering.js', 'stageLyricTrackBaseEntry'),
    moduleSrc('02-visual/12-lyrics-row-layers.js'), // 被测主体（真实整文件）
    // 合成 persistent track 数据：600 行（300 主 + 300 译），字段形状取自 12/13/14 的读写集
    `
    var __randSeed = __mulberry32(20261005);
    function __makeRow(i) {
      var isTranslation = i % 2 === 1;
      var primary = Math.floor(i / 2);
      return {
        isPrimary: !isTranslation, isTranslation: isTranslation,
        lineIndex: isTranslation ? null : primary,
        parentIndex: isTranslation ? primary : null,
        parentRole: isTranslation ? 'context' : null,
        virtualIndex: primary + (isTranslation ? 0.92 : 0),
        targetAlpha: 0.9, fontScale: 0.92,
        baseY: NaN, baseZ: NaN, baseScale: NaN,
        delta: 0, isActive: false,
        renderLineUploaded: true, renderReadabilityUploaded: true, renderGlowUploaded: true,
        renderWindowActive: false, renderRevealAt: 0,
        qualityTexture: null, qualityPendingTexture: null, qualityQueuedKey: '',
        qualityWanted: false, qualityHotUntil: 0, qualityLastUsedAt: 0, qualityFallbackUntil: 0,
        qualityBytes: 0, qualityPendingBytes: 0, qualityTier: 0, qualityRasterKey: '',
        qualityPendingTier: 0, qualityPendingKey: '', qualityGeneration: 0,
        qualitySelectionFrame: 0, qualityProjectedPoolBytes: 0, qualityProjectedTier: 0,
        lineMask: {
          width: 1024, height: 128, logicalWidth: 512, logicalHeight: 64,
          stoneSeed: primary % 97, fontSize: 64, lineHeight: 64, lineY0: 96
        },
        mesh: __makeMeshStub(), readability: __makeMeshStub(), glow: __makeMeshStub(),
        mat: { uniforms: { uOpacity: { value: 0.4 }, uProgress: { value: 0 }, uActiveMix: { value: 0 }, uSolar: { value: 0 }, uMap: { value: null } } },
        readabilityMat: { opacity: 0.2 },
        glowMat: { opacity: 0.1 }
      };
    }
    var __data = {
      rowLayers: [],
      usesTrack: true, trackPersistent: true, trackScrollPrimed: true,
      trackScrollOffset: 119.7, trackTargetLineIndex: 120, trackTargetVirtualIndex: 120,
      trackVisibleRadius: 3, lineWorldStep: 0.38, translationLineStepWorld: 0.30,
      displayMode: 'single', trackPendingPayload: null,
      renderInitialTextReady: true, trackScrollSnapUntil: 0, trackTargetCommittedAt: 0
    };
    for (var __ri = 0; __ri < ${LYRIC_LINE_COUNT * 2}; __ri++) __data.rowLayers.push(__makeRow(__ri));
    var __mesh = { userData: { lyric: __data } };
    `,
  ];

  const bench = `
    // 热点 7：updateLyricRowLayers 对全部 600 行无早退执行（y/z/scale 目标计算 +
    //         mesh position lerp 写 + uOpacity/uProgress/uActiveMix/uSolar uniform 写；
    //         mesh 为形状桩，度量纯 JS 成本——three updateMatrixWorld 级联不在其中）。
    (function () {
      var t = 0;
      var opts = {
        opacity: 0.92, readability: 0.58, contextIntro: 1, shownProgress: 0.4, contextDrift: 0.06,
        style: 'float', seed: 1, renderBase: 43, jitterX: 0.012, jitterY: 0.009,
        motionBlend: 1, ease: 0.16, deltaTime: 1 / 60, targetLineIndex: 120, qualityRootPriority: 0
      };
      __benchOne('lyricRowLayerLoop', 800, 7, function () { __clock.t += ${FRAME_MS}; t += 1 / 60; opts.time = t; },
        function () { updateLyricRowLayers(__data, opts); });
    })();
    // 热点 10：finalizeLyricQualitySelectionFrame —— frameCandidates.slice().sort() +
    //         residents.filter().sort() 每帧新数组 + desiredRows.indexOf O(n²)
    //         （op 含候选登记以便每帧复灌，主体是 finalize；含 updateLyricQualityStats 两遍重建）。
    (function () {
      var candidates = [];
      for (var k = 0; k < 60; k++) {
        candidates.push({ row: __data.rowLayers[(k * 7) % __data.rowLayers.length], priority: 10 + (k % 40), hotMs: 1100 });
      }
      __benchOne('qualityFinalizeFrame', 8000, 7, function () { __clock.t += ${FRAME_MS}; }, function () {
        beginLyricQualitySelectionFrame(false);
        registerLyricQualityCandidates(__data, candidates, 2, 0, false);
        finalizeLyricQualitySelectionFrame();
      });
    })();
    // 热点 9：stageLyricResidentDisplayedScrollOffset —— 每帧新 samples 数组 +
    //         遍历 primary 行 push + sort 取中位数（结果仅 previewTrackCorridor 消费）。
    __benchOne('residentScrollMedian', 30000, 7, function () {},
      function () { stageLyricResidentDisplayedScrollOffset(__data, 119.7); });
    // 热点 8：pending 期间 tickMesh 就绪检查 + commit 路径 —— 同帧重建同一 rowMap 2 次
    //         （stageLyricPersistentTargetRowsReady 内部一次 + setLyricTrackTarget 侧再一次）。
    __benchOne('stageRowMapRebuild', 10000, 7, function () {}, function () {
      stageLyricPersistentTargetRowsReady(__mesh, 120);
      stageLyricPersistentResidentRowMap(__data);
    });
  `;
  return { prelude, modules, bench };
}

/* ---- 组 D：beat 离线分析 + sparks 漂移 + glow 颜色（真实 three.r128）+ 歌词全表扫描 ---- */

function buildMiscGroup() {
  const percentileBand = anchor('percentile+bandAt', linesOf('03-beat/01-audio-beat-analysis.js', 110, 127),
    ['Array.prototype.slice.call(arr).sort', 'percentileSortCache', 'bandAt']);
  // L437-476：循环体止于内层 if 闭合；L477-480 的 yieldToPaint 分支（循环内）被刻意截掉，
  // 包装时补上外层 for 的闭合括号。
  const adaptiveWin = anchor('adaptiveThreshold', linesOf('03-beat/01-audio-beat-analysis.js', 437, 476),
    ['var winN = 50', 'sqSum += onset[k] * onset[k]', 'minIntervalFrames', 'lastKickFrame = f;']);
  // L2492-2507：`if (data.sparks && data.basePositions) {` 到其闭合 `}`（L2507）完整截取
  const sparks = anchor('sparksDrift', linesOf('02-visual/14-stage-lyrics-rendering.js', 2492, 2507),
    ['pos.needsUpdate = true', 'si * 12.989']);
  const auroraScan = anchor('auroraSome', linesOf('10-shell/09-aurora-flow.js', 625, 625),
    ['lyricsLines.some(function (l) { return !l.fallback; })']);
  const rainyScan = anchor('rainySome', linesOf('10-shell/10-rainy-cab.js', 961, 961),
    ['lyricsLines.some(function (l) { return !l.fallback; })']);
  const glowLine2426 = anchor('glow2426', linesOf('02-visual/14-stage-lyrics-rendering.js', 2426, 2426),
    ['lyricStageGlowThreeColor']);
  const glowLine2435 = anchor('glow2435', linesOf('02-visual/14-stage-lyrics-rendering.js', 2435, 2435),
    ['lyricSunHotColor.clone().lerp']);

  const prelude = `
    var __clock = { t: 12345 };
    var performance = { now: function () { return __clock.t; } };
    var window = { addEventListener: function () {}, removeEventListener: function () {} };
    var document = { readyState: 'complete', querySelectorAll: function () { return []; },
      getElementById: function () { return null; }, createElement: function () { return { style: {} }; },
      addEventListener: function () {} };
  `;

  const modules = [
    // beat 离线分析嵌套函数（按行号提取真实片段；nFrames/四带能量/onset 为合成全局）
    `
    var nFrames = 24000; // 4 分钟歌 × 10ms 帧
${percentileBand}
    var __adaptiveThreshold = (function () {
${adaptiveWin}
    }
    return candidates.length;
    });
    var energy = new Float32Array(nFrames);
    var bodyEnergy = new Float32Array(nFrames);
    var vocalEnergy = new Float32Array(nFrames);
    var snapEnergy = new Float32Array(nFrames);
    var onset = new Float32Array(nFrames);
    var lowRef = 0.22, bodyRef = 0.16, vocalRef = 0.10, snapRef = 0.05;
    (function () {
      var rand = __mulberry32(20261006);
      for (var f = 0; f < nFrames; f++) {
        var beatPhase = f % 100; // 120 BPM @10ms
        var env = 0.30 + 0.12 * Math.sin(f * 0.0021) + 0.05 * Math.sin(f * 0.0007 + 2.1);
        energy[f] = env + rand() * 0.04;
        bodyEnergy[f] = env * 0.72 + rand() * 0.03;
        vocalEnergy[f] = 0.12 + 0.08 * Math.sin(f * 0.0013 + 0.7) + rand() * 0.02;
        snapEnergy[f] = 0.05 + rand() * 0.03;
        onset[f] = beatPhase === 0 ? 0.22 + rand() * 0.10 : Math.max(0, (rand() - 0.82) * 0.5);
      }
    })();
    // sparks 漂移片段（14:2492-2506）
    var __sparksDrift = (function (data, t, seed, dt, bass, mid, fx, stageLyrics) {
${sparks}
    });
    var __sparksData = (function () {
      var rand = __mulberry32(20261007);
      var basePositions = new Float32Array(132 * 3); // 13-lyrics-mesh-build.js:135 sparkCount=132
      var arr = new Float32Array(132 * 3);
      for (var i = 0; i < basePositions.length; i++) {
        basePositions[i] = (rand() - 0.5) * 3.2;
        arr[i] = basePositions[i];
      }
      return {
        basePositions: basePositions,
        sparks: {
          rotation: { x: 0, z: 0 },
          geometry: { attributes: { position: { array: arr, needsUpdate: false } } }
        }
      };
    })();
    var __sparksFx = { lyricGlowParticles: true };
    var __sparksStageLyrics = { beatGlow: 0.3 };
    // aurora/rainy 歌词全表扫描（09:625 / 10:961 同款）
    var __fallbackScanAurora = (function () {
${auroraScan}
      return hasReal;
    });
    var __fallbackScanRainy = (function () {
${rainyScan}
      return hasReal;
    });
    var __scanLines = [];
    for (var __sl = 0; __sl < 60; __sl++) __scanLines.push({ text: '占位 ' + __sl, fallback: true });
    var lyricsLines = __scanLines;
    `,
    // 真实 three.r128（UMD 全局分支，挂 globalThis.THREE）
    vendorSrc('three.r128.min.js'),
    // 包装作用域内建词法 THREE（后续片段每次 THREE.Color 访问走快路径）
    topLevelFunction('02-visual/04-visual-settings-persistence.js', 'normalizeHexColor'),
    topLevelFunction('02-visual/07-lyrics-palette-text-utils.js', 'cssColorToThreeColor'),
    topLevelFunction('02-visual/07-lyrics-palette-text-utils.js', 'lyricThreeColor'),
    topLevelFunction('02-visual/07-lyrics-palette-text-utils.js', 'lyricResolvedGlowColor'),
    topLevelFunction('02-visual/07-lyrics-palette-text-utils.js', 'lyricStageGlowThreeColor'),
    `
    var THREE = globalThis.THREE;
    var fx = { lyricGlowColor: '#ff9a4d' };
    var fxDefaults = { lyricGlowColor: '#008aff' };
    var stageLyrics = { palette: { primary: '#f4d9a0', secondary: '#e8b26a', highlight: '#fff0c8', glowColor: '#ff9a4d' } };
    var lyricSunColor = new THREE.Color(0xffe6a4);     // 02-lyrics-state-layout.js:36 初值
    var lyricSunHotColor = new THREE.Color(0xfff4cc);  // 02-lyrics-state-layout.js:37 初值
    var __glowData = { glowMat: { color: new THREE.Color() } };
    var __glowColor = (function (data, warmth, solar) {
${glowLine2426}
${glowLine2435}
      return sparkColor;
    });
    `,
  ];

  const bench = `
    // 热点 6a：自适应阈值对每个 10ms 帧重算 50 帧窗口 sum/sqSum —— O(winN×nFrames)，
    //         24000 帧 × 50 = 120 万内层迭代（一首 4 分钟歌的一次分析）。
    __benchOne('beatAdaptiveThreshold', 24, 7, function () {},
      function () { __adaptiveThreshold(); });
    // 热点 6b：percentile 每次全量 slice 拷贝 + sort（一次分析内被调 16+ 次）。
    __benchOne('beatPercentileSort', 60, 7, function () {},
      function () { percentile(energy, 0.86); });
    // 热点 11：当前行 sparks 132 粒子 JS 端漂移（132×6 三角 + position buffer 写 + needsUpdate）。
    (function () {
      var t = 0;
      __benchOne('stageSparksDrift', 30000, 7, function () { t += 1 / 60; },
        function () { __sparksDrift(__sparksData, t, 1, 1 / 60, 0.4, 0.3, __sparksFx, __sparksStageLyrics); });
    })();
    // 热点 13：每帧 glowMat.color.copy(lyricStageGlowThreeColor(...))（新 Color + hex 解析）
    //         + lyricSunHotColor.clone().lerp(...)（再一个新 Color）—— 真实 three.r128。
    __benchOne('glowColorCloneLerp', 120000, 7, function () {},
      function () { __glowColor(__glowData, 0.42, 0.35); });
    // 热点 14：tickAuroraLyrics / tickRainyLyrics 每 30fps tick 的
    //         lyricsLines.some 全表扫描 + 每帧新闭包（两处同款）。
    __benchOne('lyricsFallbackScan', 200000, 7, function () {}, function () {
      __fallbackScanAurora();
      __fallbackScanRainy();
    });
  `;
  return { prelude, modules, bench };
}

/* ============================ 主流程 ============================ */

function main() {
  const groups = [
    ['audio', buildAudioGroup()],
    ['render', buildRenderGroup()],
    ['lyrics', buildLyricsGroup()],
    ['misc', buildMiscGroup()],
  ];
  for (const [name, group] of groups) {
    const before = ALL_RESULTS.length;
    runGroup(name, group);
    process.stderr.write(`[perf-bench] group ${name}: ${ALL_RESULTS.length - before} metrics done\n`);
  }
  for (const r of ALL_RESULTS) console.log(JSON.stringify(r));
  process.stderr.write(`[perf-bench] ${ALL_RESULTS.length} metrics complete\n`);
}

main();
