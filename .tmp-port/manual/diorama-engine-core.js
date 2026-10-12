/* =========================================================================
   diorama（镜台）渲染核心 —— Folia diorama 的无构建 three.js 忠实落地
   Portions Copyright (c) 2025 chthollyphile and Folia contributors — adapted
   from folia-major (AGPL-3.0)：
     components/visualizer/diorama/VisualizerDiorama.tsx（序列机/过渡飞行门控/器乐曲飞越）
     components/visualizer/diorama/CameraRig.tsx（SmoothDamp 跟随 + 13 种运镜手法 + 阅读回正 + 过渡弧线）
     components/visualizer/diorama/DioramaScene.tsx（歌词走廊：canvas 栅格文本/逐字三态/
       心象辉光/灵魂出窍/渐变跟唱/关键字着色/尘埃窗/雾/颜色阻尼）
     components/visualizer/diorama/DioramaParticleField.tsx（点云双 pass：涟漪池/频段
       谷峰追踪/编队聚散/弹性脉冲）
     components/visualizer/VisualizerSubtitleOverlay.tsx + runtime.ts
       （底部字幕翻译行/下一句预览 + activeLine/recentCompleted/nextLines）
     utils/appPlaybackHelpers.ts:21（findLatestActiveLineIndex 权威行索引语义）
   纯逻辑闭包（cameraPath/sequencer/transition/geometry/moteField/corridor/
   particleModel/surfaces/shaders/materials/keywordColor/textRaster + graphemeTiming/
   renderHints/fontStacks/wordColoring/subtitleFontSizes/types 常量）由管线 tsc
   自动落地——本文件只是 R3F 声明树的命令式宿主（每函数标注源文件行号）。

   结构对应（R3F/React → 无构建）：
     <Canvas camera dpr gl>  → THREE.WebGLRenderer({alpha:true,antialias:true}) +
                               PerspectiveCamera(55, aspect, 0.1, 1000)（R3F 缺省 near/far）
     scene fog（:846-852）   → scene.fog = THREE.Fog(bg, 12, 30)，颜色随 useFrame 阻尼
     useFrame ×3             → 单 rAF 循环按组件挂载序驱动：CameraRig → DioramaScene →
                               DioramaParticleField（与 R3F 同序，CameraRig 读到上一帧行宽）
     useMemo/重渲染          → 输入 key 缓存 + 脏检重建（挂载窗/点云簇/走廊段/栅格缓存）
     VisualizerShell         → 覆盖层壳（本项目 #diorama-overlay 自持背景，canvas 透明）
   MineRadio 宿主差异（数据源在桥，均已在桥内注明）：
     - tuning 固定 DEFAULT_DIORAMA_TUNING（types.ts:883-903 原值，与原版面板默认一致）
     - theme.animationIntensity='normal'、wordColors=[]（无 AI 词色表，关键字 matcher 空
       表 → 场景原样回退纯主色着色）
     - 无 romanization/alternateTexts → 底部字幕单 translation 轨（同 classic 试点口径）
     - three.js 走独立 0.185 ES 模块（window.THREE185），不影响应用内置 r128 全局
   ========================================================================= */

/* ---------- 手工纯函数的稳定导出名（tests/diorama.test.js 经 env 直达） ---------- */
var DioramaBuildActiveUnits = dioramaBuildActiveUnits;
var DioramaFindLineIndexAtTime = dioramaFindLineIndexAtTime;
var DioramaResolveGradientEnergy = dioramaResolveGradientEnergy;
var DioramaResolveTextLife = dioramaResolveTextLife;
var DioramaBuildPhantomLines = dioramaBuildInstrumentalPhantomLines;

/* ---------- R3F <Canvas> 缺省相机（VisualizerDiorama:404）与帧循环 ---------- */

/* tuning 缺省（types.ts:883-903 DEFAULT_DIORAMA_TUNING 原值，闭包 types 段落地）。
   manual 段在 alias 注入之前求值——顶层不能直接读 DIO_* 别名，首次取用时再展开。 */
var DioramaDefaults = null;
function dioramaEnsureDefaults() {
  if (DioramaDefaults) return DioramaDefaults;
  DioramaDefaults = {
    tuning: DIO_DEFAULT_TUNING,
    geometryVisibility: DIO_DEFAULT_GEOMETRY_VISIBILITY,
    particleDensity: DIO_DEFAULT_TUNING.particleDensity,
    particleScale: DIO_DEFAULT_TUNING.particleScale,
    particleGlowEnabled: DIO_DEFAULT_TUNING.particleGlowEnabled,
    particleGlowIntensity: DIO_DEFAULT_TUNING.particleGlowIntensity,
    showParticles: DIO_DEFAULT_TUNING.showParticles,
    backgroundParticleCircumference: DIO_DEFAULT_TUNING.backgroundParticleCircumference,
    backgroundParticleRadial: DIO_DEFAULT_TUNING.backgroundParticleRadial,
    /* 有效强度（VisualizerDiorama:444-454：开关关闭归 0） */
    glowIntensity: DIO_DEFAULT_TUNING.glowEnabled ? DIO_DEFAULT_TUNING.glowIntensity : 0,
    soulIntensity: DIO_DEFAULT_TUNING.soulEnabled ? DIO_DEFAULT_TUNING.soulIntensity : 0,
    soulActiveEnabled: DIO_DEFAULT_TUNING.soulEnabled && DIO_DEFAULT_TUNING.soulActiveEnabled,
    gradientIntensity: DIO_DEFAULT_TUNING.gradientEnabled ? DIO_DEFAULT_TUNING.gradientIntensity : 0,
    keywordColoringEnabled: DIO_DEFAULT_TUNING.keywordColoringEnabled
  };
  /* env 导出在加载期做了值快照——惰性展开后回写，宿主/测试读到同一对象 */
  if (typeof env !== 'undefined' && env) { try { env.DioramaDefaults = DioramaDefaults; } catch (e) { } }
  return DioramaDefaults;
}

/* resolveDioramaMotionParams 包装（VisualizerDiorama:138-141）：tuning 固定缺省 + 主题强度 */
function DioramaResolveMotionParams(themeIntensity) {
  dioramaEnsureDefaults();
  return DIO_resolveDioramaMotionParams(DIO_DEFAULT_TUNING, themeIntensity || 'normal');
}

/* =========================================================================
   DioramaScene.tsx 纯函数段（:219-359 / CameraRig.tsx:143-162 / runtime 派生）
   ========================================================================= */

/* smoothstep01（:227） */
function dioramaSmoothstep01(t) {
  var c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/* stepEnvelope（:224-225）：快攻慢释包络 */
function dioramaStepEnvelope(current, target, attack, release, delta) {
  return current + (target - current) * (1 - Math.exp(-(target > current ? attack : release) * delta));
}

/* GRADIENT_HOLD/TRAIL（:231-232）+ resolveGradientEnergy（:250-262） */
var DIO_GRADIENT_HOLD_SECONDS = 0.35;
var DIO_GRADIENT_TRAIL_SECONDS = 1.8;
function dioramaResolveGradientEnergy(now, unit) {
  if (now <= unit.startTime) return 0;
  if (now < unit.endTime) {
    var span = Math.max(unit.endTime - unit.startTime, 0.001);
    return dioramaSmoothstep01(Math.min(1, Math.max(0, (now - unit.startTime) / span)));
  }
  var sinceSung = now - unit.endTime;
  if (sinceSung <= DIO_GRADIENT_HOLD_SECONDS) return 1;
  return 1 - dioramaSmoothstep01(Math.min(1, Math.max(0, (sinceSung - DIO_GRADIENT_HOLD_SECONDS) / DIO_GRADIENT_TRAIL_SECONDS)));
}

/* resolveDioramaUnitFill（:275-280）：写 out，零分配 */
function dioramaResolveUnitFill(out, primary, target, progress) {
  return out.copy(primary).lerp(target, Math.min(1, Math.max(0, progress)));
}

/* shouldResetDioramaUnitState（:298-303） */
function dioramaShouldResetUnitState(prevGlobal, globalIndex, unitStateLength, unitCount) {
  return prevGlobal !== globalIndex || unitStateLength !== unitCount;
}

/* 文本生命周期常量（:181-192）+ resolveTextLife（:309-313） */
var DIO_TEXT_DISSOLVE_START = 2.0;
var DIO_TEXT_DISSOLVE_END = 0.9;
var DIO_TEXT_FADE_IN_START = 32;
var DIO_TEXT_FADE_IN_END = 40;
function dioramaResolveTextLife(distanceToCamera) {
  var farT = Math.min(1, Math.max(0, (DIO_TEXT_FADE_IN_END - distanceToCamera) / (DIO_TEXT_FADE_IN_END - DIO_TEXT_FADE_IN_START)));
  var nearT = Math.min(1, Math.max(0, (distanceToCamera - DIO_TEXT_DISSOLVE_END) / (DIO_TEXT_DISSOLVE_START - DIO_TEXT_DISSOLVE_END)));
  return (farT * farT * (3 - 2 * farT)) * (nearT * nearT * (3 - 2 * nearT));
}

/* 邻行/离场行不透明度（:150-163） */
function dioramaResolveNeighborLineOpacity(offset) {
  if (offset === -1) return 0.3;
  if (offset === -2) return 0.1;
  if (offset === 1) return 0.34;
  if (offset === 2) return 0.16;
  if (offset === 3) return 0.06;
  return 0;
}
function dioramaResolveOutgoingLineOpacity(offsetFromOutgoing) {
  return offsetFromOutgoing === 0 ? 0.7 : (Math.abs(offsetFromOutgoing) <= 2 ? 0.45 : 0.25);
}

/* 行字号/取景常量（:167-178） */
var DIO_LINE_FONT_SIZE = 0.62;
var DIO_TARGET_FRAME_WIDTH_FRACTION = 0.72;
var DIO_MIN_FIT_SCALE = 0.28;
var DIO_DEG_TO_RAD = Math.PI / 180;
var DIO_FOG_NEAR = 12;
var DIO_FOG_FAR = 30;
var DIO_COLOR_DAMP_RATE = 1.2;
/* 逐字三态常量（:201-217） */
var DIO_ACTIVE_LINE_OPACITY = 0.92;
var DIO_UNSUNG_UNIT_OPACITY = 0.5;
var DIO_UNIT_GLOW_MAX_OPACITY = 0.9;
var DIO_SOUL_MAX_OPACITY = 0.6;
var DIO_SOUL_ACTIVE_LIFT_EM = 0.06;
var DIO_SOUL_DETACH_LIFT_EM = 0.5;
var DIO_SOUL_ACTIVE_SWELL = 0.1;
var DIO_SOUL_DETACH_SWELL = 0.3;
var DIO_SOUL_HANDOFF_SECONDS = 0.5;
/* 挂载窗/走廊窗/栅格预算（:126-146） */
var DIO_LINES_AHEAD = 3;
var DIO_LINES_BEHIND = 2;
var DIO_OUTGOING_LINES_BEHIND = 2;
var DIO_OUTGOING_LINES_AHEAD = 1;
var DIO_CORRIDOR_LINES_AHEAD = 7;
var DIO_CORRIDOR_LINES_BEHIND = 6;
var DIO_NEIGHBOR_RASTER_BUDGET = 2;

/* resolveFrameFitScale（:317-327）：固定 HERO 距离取景适配 */
function dioramaResolveFrameFitScale(renderedWidth, distance, verticalFovDeg, aspect) {
  if (renderedWidth <= 0 || distance <= 0) return 1;
  var frameWidth = 2 * distance * Math.tan((verticalFovDeg * DIO_DEG_TO_RAD) / 2) * aspect;
  var targetWidth = frameWidth * DIO_TARGET_FRAME_WIDTH_FRACTION;
  return Math.min(1, Math.max(DIO_MIN_FIT_SCALE, targetWidth / renderedWidth));
}

/* frameQuaternion（:350-359）：+X→right, +Y→up, +Z→-forward 基旋转 + yaw/roll 后乘 */
var _dioBasisRight = null, _dioBasisUp = null, _dioBasisFwd = null, _dioBasisMatrix = null,
    _dioBasisQuat = null, _dioTiltQuat = null, _dioAxisY = null, _dioAxisZ = null;
function dioramaFrameQuaternion(THREE, frame, roll, yaw) {
  if (!_dioBasisMatrix) {
    _dioBasisRight = new THREE.Vector3(); _dioBasisUp = new THREE.Vector3(); _dioBasisFwd = new THREE.Vector3();
    _dioBasisMatrix = new THREE.Matrix4(); _dioBasisQuat = new THREE.Quaternion(); _dioTiltQuat = new THREE.Quaternion();
    _dioAxisY = new THREE.Vector3(0, 1, 0); _dioAxisZ = new THREE.Vector3(0, 0, 1);
  }
  _dioBasisRight.set(frame.right.x, frame.right.y, frame.right.z);
  _dioBasisUp.set(frame.up.x, frame.up.y, frame.up.z);
  _dioBasisFwd.set(-frame.forward.x, -frame.forward.y, -frame.forward.z);
  _dioBasisMatrix.makeBasis(_dioBasisRight, _dioBasisUp, _dioBasisFwd);
  _dioBasisQuat.setFromRotationMatrix(_dioBasisMatrix);
  if (yaw) _dioBasisQuat.multiply(_dioTiltQuat.setFromAxisAngle(_dioAxisY, yaw));
  if (roll) _dioBasisQuat.multiply(_dioTiltQuat.setFromAxisAngle(_dioAxisZ, roll));
  return [_dioBasisQuat.x, _dioBasisQuat.y, _dioBasisQuat.z, _dioBasisQuat.w];
}

/* CJK_GRAPHEME_RE（:393）：按码点逐字拆分（含 CJK/假名/私用区/间隔号/几何图形） */
var DIO_CJK_GRAPHEME_RE = /[\u2E80-\u9FFF\u3040-\u30FF\uF000-\uFADF\uFF66-\uFF9F\u2022\u00B7\u25A0-\u25FF]/;

/* isInterludeLine（parserCore.ts:56,119） */
function dioramaIsInterludeLine(line) {
  return !!line && line.fullText === '......';
}

/* buildInstrumentalPhantomLines（VisualizerDiorama:70-88）：器乐曲幻影行 */
var DIO_INSTRUMENTAL_FRAMES = 96;
var DIO_INSTRUMENTAL_SECONDS_PER_FRAME = 5;
function dioramaBuildInstrumentalPhantomLines() {
  var result = [];
  for (var i = 0; i < DIO_INSTRUMENTAL_FRAMES; i += 1) {
    var block = Math.floor(i / 4);
    var isChorus = block % 3 === 2;
    result.push({
      words: [],
      startTime: i * DIO_INSTRUMENTAL_SECONDS_PER_FRAME,
      endTime: (i + 1) * DIO_INSTRUMENTAL_SECONDS_PER_FRAME,
      fullText: '',
      blockIndex: block,
      songPart: isChorus ? 'chorus' : 'verse',
      isChorus: isChorus
    });
  }
  return result;
}

/* findLatestActiveLineIndex（appPlaybackHelpers.ts:21-32）——权威行索引语义 */
function dioramaFindLineIndexAtTime(lines, time) {
  for (var index = (lines ? lines.length : 0) - 1; index >= 0; index--) {
    var line = lines[index];
    if (!line || time < line.startTime) continue;
    if (time <= ((line.renderHints && line.renderHints.renderEndTime != null) ? line.renderHints.renderEndTime : line.endTime)) {
      return index;
    }
  }
  return -1;
}

/* getRecentCompletedLine / getUpcomingLines（runtime.ts:35-52 / :76-86） */
function dioramaGetRecentCompletedLine(lines, currentLineIndex, now) {
  if (currentLineIndex !== -1 || !lines || lines.length === 0) return null;
  for (var i = lines.length - 1; i >= 0; i--) {
    if (now > CM_getLineRenderEndTime(lines[i])) return lines[i];
  }
  return null;
}
function dioramaGetUpcomingLines(lines, currentLineIndex, count) {
  if (currentLineIndex < 0 || !lines) return [];
  return lines.slice(currentLineIndex + 1, currentLineIndex + 1 + count);
}

/* hasReadableText（VisualizerSubtitleOverlay.tsx:20） */
function dioramaHasReadableText(text) {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

/* resolveWordProgress（CameraRig.tsx:143-162）：0..1 字素揭示比例（随活动字素内插） */
function dioramaResolveWordProgress(line, timeline, now) {
  if (timeline.length === 0) return 0;
  var renderEndTime = CM_getLineRenderEndTime(line);
  if (now >= renderEndTime) return 1;
  if (now <= line.startTime) return 0;
  var revealed = 0;
  for (var i = 0; i < timeline.length; i += 1) {
    var timing = timeline[i];
    if (now >= timing.endTime) {
      revealed = i + 1;
    } else if (now >= timing.startTime) {
      var span = Math.max(timing.endTime - timing.startTime, 0.001);
      revealed = i + Math.min(1, Math.max(0, (now - timing.startTime) / span));
      break;
    } else {
      break;
    }
  }
  return revealed / timeline.length;
}

/* 活动行拆字元（DioramaScene:381-401 LyricUnit + :658-701 activeLineUnits）：
   CJK 字素逐字一元，连续非 CJK 同词字素并作一元；空白只做间隔不进元。 */
function dioramaBuildActiveUnits(line, timeline) {
  if (!line || timeline.length === 0) return [];
  var graphemes = CM_splitLyricGraphemes(line.fullText);
  var charOffsets = [];
  var acc = 0;
  for (var g = 0; g < graphemes.length; g += 1) { charOffsets.push(acc); acc += graphemes[g].length; }
  var units = [];
  var pushUnit = function (from, to) {
    var text = graphemes.slice(from, to).join('');
    if (text.trim().length === 0) return;
    units.push({
      text: text,
      charStart: charOffsets[from] != null ? charOffsets[from] : 0,
      charEnd: (charOffsets[to - 1] != null ? charOffsets[to - 1] : 0) + (graphemes[to - 1] ? graphemes[to - 1].length : 1),
      startTime: timeline[from].startTime,
      endTime: timeline[to - 1].endTime
    });
  };
  var i = 0;
  while (i < timeline.length) {
    var g2 = graphemes[i] != null ? graphemes[i] : '';
    if (g2.trim().length === 0) { i += 1; continue; }
    if (DIO_CJK_GRAPHEME_RE.test(g2)) { pushUnit(i, i + 1); i += 1; continue; }
    var wordIndex = timeline[i].wordIndex;
    var j = i + 1;
    while (
      j < timeline.length
      && timeline[j].wordIndex === wordIndex
      && (graphemes[j] != null ? graphemes[j] : '').trim().length > 0
      && !DIO_CJK_GRAPHEME_RE.test(graphemes[j] != null ? graphemes[j] : '')
    ) {
      j += 1;
    }
    pushUnit(i, j);
    i = j;
  }
  return units;
}

/* =========================================================================
   CameraRig（CameraRig.tsx:164-436 命令式落地）
   ========================================================================= */
function DioramaCreateCameraRig(THREE) {
  /* refs（:175-197） */
  var flight = { flying: false, epoch: 0, start: 0, perp: new THREE.Vector3(), side: 1, flightLen: 1 };
  var posRef = new THREE.Vector3(0, 0.6, 9);
  var posVelRef = new THREE.Vector3(0, 0, 0);
  var lookRef = new THREE.Vector3(0, 0, -10);
  var lookVelRef = new THREE.Vector3(0, 0, 0);
  var alignRef = 0;
  var alignQuatRef = new THREE.Quaternion();
  var alignQuatInit = false;
  var orientRef = new THREE.Quaternion();
  var orientInit = false;

  /* 常量（:75-138） */
  var ALIGN_SHOT_CEILING = { hold: 0.9, pushIn: 0.85, track: 0.85, swell: 0.8, float: 0.78, glide: 0.72, crane: 0.7, pullBack: 0.7, arc: 0.62, pendulum: 0.6, orbit: 0.55, spiral: 0.5, flyby: 0.5 };
  var ALIGN_LEAD_IN = 0.6, ALIGN_SETTLE = 0.35, ALIGN_RELEASE = 1.0, ALIGN_RATE = 1.2, ALIGN_TURN_RATE = 2.6;
  var FRAME_KEEP_FRACTION = 0.7;
  var FLIGHT_SMOOTH_TIME = 1.1, FLIGHT_ARC_FRAC = 0.16;
  var ORIENT_FOLLOW_RATE = 4.2;
  var UP = new THREE.Vector3(0, 1, 0);

  /* memo 等价：resolved/timeline/shot/placement 随（globalIndex, linesEpoch, motion）重算（:202-215） */
  var cache = { key: null, resolved: null, line: null, timeline: [], shotKind: 'hold', placement: null };
  function resolveCtx(ctx) {
    var key = ctx.globalIndex + '|' + ctx.linesEpoch + '|' + ctx.weaveScale + '|' + ctx.subMode;
    if (key === cache.key) return cache;
    var resolved = DIO_resolveGlobal(ctx.sequencer, ctx.globalIndex);
    var line = resolved ? (resolved.line || null) : null;
    cache = {
      key: key,
      resolved: resolved,
      line: line,
      timeline: line ? CM_buildLineGraphemeTimeline(line) : [],
      shotKind: resolved ? DIO_getDioramaShot(resolved.localIndex, resolved.segment.lines, resolved.segment.seed, ctx.subMode) : 'hold',
      placement: DIO_getDioramaTextPlacement(resolved ? resolved.localIndex : 0, resolved ? resolved.segment.seed : undefined, ctx.weaveScale)
    };
    return cache;
  }

  /* 每帧临时对象（:111-131 等价，零分配） */
  var _alignRight = new THREE.Vector3(), _alignUp = new THREE.Vector3(), _alignFwd = new THREE.Vector3();
  var _alignMatrix = new THREE.Matrix4(), _alignQuat = new THREE.Quaternion(), _tiltQuat = new THREE.Quaternion();
  var _lookQuat = new THREE.Quaternion(), _AXIS_Y = new THREE.Vector3(0, 1, 0), _AXIS_Z = new THREE.Vector3(0, 0, 1);
  var _viewDir = new THREE.Vector3(), _camForward = new THREE.Vector3(), _targetQuat = new THREE.Quaternion();
  var _flightTo = new THREE.Vector3();

  function step(delta, elapsed, ctx) {
    var c = resolveCtx(ctx);
    var resolved = c.resolved, line = c.line, timeline = c.timeline, shotKind = c.shotKind, placement = c.placement;
    /* Frame-lock（:218-221）：解不出真帧时保持当前姿态 */
    if (!resolved) return;
    var now = ctx.now;
    var wordProgress = line ? dioramaResolveWordProgress(line, timeline, now) : 0;
    var progress = line ? 1 : 0;
    if (line) {
      var renderEndTime = CM_getLineRenderEndTime(line);
      var span = renderEndTime - line.startTime;
      progress = span > 0 ? Math.min(1, Math.max(0, (now - line.startTime) / span)) : (now >= line.startTime ? 1 : 0);
    }

    var camera = ctx.camera;
    var aspect = camera.isPerspectiveCamera ? camera.aspect : 1;
    var fov = camera.isPerspectiveCamera ? camera.fov : 55;
    var visibleHalf = DIO_frameHalfWidth(DIO_HERO_DISTANCE, fov, aspect) * 0.92; /* DIORAMA_SAFE_FRAME_FRACTION :50 */

    var frame = resolved.frame;
    var R = frame.right, U = frame.up, F = frame.forward;

    var settle = line ? DIO_resolveHoldSettle(now - CM_getLineRenderEndTime(line)) : 1;

    /* 读头 = 行真实文本位（路径锚 + 放置偏移）+ 逐词横移（:248-255） */
    var truck = DIO_resolveReadHeadTruck(wordProgress, ctx.activeLineWidth, visibleHalf) * settle;
    var headR = placement.offsetR + truck;
    var headU = placement.offsetU;
    var baseX = frame.position.x + R.x * headR + U.x * headU;
    var baseY = frame.position.y + R.y * headR + U.y * headU;
    var baseZ = frame.position.z + R.z * headR + U.z * headU;

    /* 运镜手法偏移 + 手持微漂（:257-276） */
    var shotSeed = resolved.segment.seed;
    var shot = DIO_resolveShotOffset(shotKind, {
      progress: progress,
      wordProgress: wordProgress,
      hero: DIO_HERO_DISTANCE,
      lift: DIO_CAMERA_LIFT,
      seed: shotSeed,
      lineIndex: resolved.localIndex,
      moveScale: ctx.moveScale * settle
    });
    var drift = DIO_resolveCameraDrift(now, shotSeed, ctx.driftScale);
    var offRight = shot.right + drift.swayX;
    var offUp = shot.up + drift.swayY + drift.lift;
    var offBack = shot.back + drift.dist;
    var poseX = baseX + R.x * offRight + U.x * offUp - F.x * offBack;
    var poseY = baseY + R.y * offRight + U.y * offUp - F.y * offBack;
    var poseZ = baseZ + R.z * offRight + U.z * offUp - F.z * offBack;

    /* 过渡飞行（:278-314）：抑制 seek-snap + 拉长 smooth-time + 衰减弧/侧倾/瞄准扫摆 */
    if (ctx.transitionEpoch !== flight.epoch && ctx.transitionEpoch > 0) {
      flight.epoch = ctx.transitionEpoch;
      flight.flying = true;
      flight.start = elapsed;
      _flightTo.set(poseX, poseY, poseZ);
      var perp = DIO_flightPerp({ x: posRef.x, y: posRef.y, z: posRef.z }, { x: _flightTo.x, y: _flightTo.y, z: _flightTo.z });
      flight.perp.set(perp.x, perp.y, perp.z);
      flight.side = DIO_flightSide(shotSeed, ctx.transitionEpoch);
      flight.flightLen = posRef.distanceTo(_flightTo);
    }
    var flying = false;
    var te = 1;
    if (flight.flying) {
      te = (elapsed - flight.start) / DIO_TRANSITION_DURATION;
      if (te >= 1) flight.flying = false;
      else flying = true;
    }
    var followSmooth = flying
      ? FLIGHT_SMOOTH_TIME + (ctx.smoothTime - FLIGHT_SMOOTH_TIME) * DIO_transitionEase(te)
      : ctx.smoothTime;
    var swayEnv = flying ? Math.sin(Math.PI * te) * Math.sin(Math.PI * te) : 0;
    var arcMag = swayEnv * flight.flightLen * FLIGHT_ARC_FRAC;
    var sweepMag = swayEnv * flight.flightLen * DIO_TRANSITION_AIM_SWEEP * flight.side;
    var bank = swayEnv * DIO_TRANSITION_BANK * flight.side;

    /* SmoothDamp 跟随（:316-330）：非飞行期大跳（seek）直接 snap */
    var posGap = Math.sqrt(
      (poseX - posRef.x) * (poseX - posRef.x) + (poseY - posRef.y) * (poseY - posRef.y) + (poseZ - posRef.z) * (poseZ - posRef.z)
    );
    var snapped = !flying && posGap > 24; /* DIORAMA_SNAP_DISTANCE :58 */
    if (snapped) {
      posRef.set(poseX, poseY, poseZ);
      posVelRef.set(0, 0, 0);
    } else {
      var sx = DIO_smoothDamp(posRef.x, poseX, posVelRef.x, followSmooth, delta);
      var sy = DIO_smoothDamp(posRef.y, poseY, posVelRef.y, followSmooth, delta);
      var sz = DIO_smoothDamp(posRef.z, poseZ, posVelRef.z, followSmooth, delta);
      posRef.set(sx.value, sy.value, sz.value);
      posVelRef.set(sx.velocity, sy.velocity, sz.velocity);
    }
    /* 弧线是衰减视觉偏移，不进 posRef（:331-337） */
    camera.position.set(
      posRef.x + flight.perp.x * arcMag,
      posRef.y + flight.perp.y * arcMag + arcMag * 0.5,
      posRef.z + flight.perp.z * arcMag
    );

    /* 瞄准点 = 读头 + 三分构图 look 偏移，同法 SmoothDamp；飞行期横扫（:339-356） */
    var lookOff = placement.lookR * settle;
    var lookX = baseX + R.x * lookOff + flight.perp.x * sweepMag;
    var lookY = baseY + R.y * lookOff + flight.perp.y * sweepMag;
    var lookZ = baseZ + R.z * lookOff + flight.perp.z * sweepMag;
    var lookGap = Math.sqrt(
      (lookX - lookRef.x) * (lookX - lookRef.x) + (lookY - lookRef.y) * (lookY - lookRef.y) + (lookZ - lookRef.z) * (lookZ - lookRef.z)
    );
    if (!flying && lookGap > 24) {
      lookRef.set(lookX, lookY, lookZ);
      lookVelRef.set(0, 0, 0);
    } else {
      var lx = DIO_smoothDamp(lookRef.x, lookX, lookVelRef.x, followSmooth, delta);
      var ly = DIO_smoothDamp(lookRef.y, lookY, lookVelRef.y, followSmooth, delta);
      var lz = DIO_smoothDamp(lookRef.z, lookZ, lookVelRef.z, followSmooth, delta);
      lookRef.set(lx.value, ly.value, lz.value);
      lookVelRef.set(lx.velocity, ly.velocity, lz.velocity);
    }

    /* lookAt 前复位 up（:358-361）：地平线保持水平 */
    camera.up.copy(UP);
    camera.lookAt(lookRef);

    /* 阅读回正（:363-385）：目标文本平面姿态跳变 → 相机追踪平滑四元数副本 */
    _alignRight.set(R.x, R.y, R.z);
    _alignUp.set(U.x, U.y, U.z);
    _alignFwd.set(-F.x, -F.y, -F.z);
    _alignMatrix.makeBasis(_alignRight, _alignUp, _alignFwd);
    _alignQuat.setFromRotationMatrix(_alignMatrix);
    if (placement.yaw !== 0) _alignQuat.multiply(_tiltQuat.setFromAxisAngle(_AXIS_Y, placement.yaw));
    if (placement.roll !== 0) _alignQuat.multiply(_tiltQuat.setFromAxisAngle(_AXIS_Z, placement.roll));
    if (snapped || !alignQuatInit) {
      alignQuatRef.copy(_alignQuat);
      alignQuatInit = true;
    } else {
      alignQuatRef.slerp(_alignQuat, 1 - Math.exp(-ALIGN_TURN_RATE * delta));
    }

    /* 连续阅读需求（:387-397）：唱窗两侧平滑斜坡 × 该运镜的对齐上限 */
    var readTarget = 0;
    if (line) {
      var renderEnd = CM_getLineRenderEndTime(line);
      var rampIn = dioramaSmoothstep01((now - (line.startTime - ALIGN_LEAD_IN)) / (ALIGN_LEAD_IN + ALIGN_SETTLE));
      var rampOut = 1 - dioramaSmoothstep01((now - renderEnd) / ALIGN_RELEASE);
      readTarget = Math.min(rampIn, rampOut) * (ALIGN_SHOT_CEILING[shotKind] != null ? ALIGN_SHOT_CEILING[shotKind] : 0.7);
    }
    alignRef += (readTarget - alignRef) * (1 - Math.exp(-ALIGN_RATE * delta));

    /* 姿态目标合成（:399-416）：lookAt 纯瞄准 → 回正混合 → 画框保持钳制 */
    _lookQuat.copy(camera.quaternion);
    _targetQuat.copy(_lookQuat).slerp(alignQuatRef, alignRef);

    _viewDir.subVectors(lookRef, camera.position).normalize();
    _camForward.set(0, 0, -1).applyQuaternion(_targetQuat);
    var offAxisAngle = _camForward.angleTo(_viewDir);
    var halfV = (fov * DIO_DEG_TO_RAD) / 2;
    var halfH = Math.atan(Math.tan(halfV) * aspect);
    var maxOffAxis = Math.min(halfV, halfH) * FRAME_KEEP_FRACTION;
    if (offAxisAngle > maxOffAxis) {
      _targetQuat.slerp(_lookQuat, 1 - maxOffAxis / offAxisAngle);
    }

    /* 姿态跟随器（:418-430）：唯一写 camera.quaternion 的地方 */
    if (snapped || !orientInit) {
      orientRef.copy(_targetQuat);
      orientInit = true;
    } else {
      orientRef.slerp(_targetQuat, 1 - Math.exp(-ORIENT_FOLLOW_RATE * delta));
    }
    camera.quaternion.copy(orientRef);
    if (bank !== 0) camera.rotateZ(bank);
    rigLast = {
      now: now, delta: delta, smoothTime: ctx.smoothTime, settle: settle,
      truck: truck, wordProgress: wordProgress, progress: progress,
      moveScale: ctx.moveScale, driftScale: ctx.driftScale,
      activeLineWidth: ctx.activeLineWidth,
      ctxKeys: Object.keys(ctx).join(','),
      pose: [poseX, poseY, poseZ],
      look: [lookX, lookY, lookZ],
      shotRight: shot.right, shotUp: shot.up, shotBack: shot.back
    };
  }

  var rigLast = null;
  return {
    step: step,
    __debug: function () {
      return {
        pos: posRef.toArray(),
        look: lookRef.toArray(),
        last: rigLast,
        alignRef: alignRef,
        flying: flight.flying,
        cacheShot: cache.shotKind,
        cacheLine: cache.line ? cache.line.startTime : null
      };
    }
  };
}

/* =========================================================================
   DioramaScene（DioramaScene.tsx:403-1267 命令式落地）
   ========================================================================= */
function DioramaCreateDioramaScene(THREE, opts) {
  var theme = opts.theme;
  var tuning = opts.tuning || dioramaEnsureDefaults();
  var motion = opts.motion;
  var host = opts.host;
  var scene = opts.scene;
  var self = {
    corridorSpans: [],
    particleClusters: [],
    activeLineWidth: 0
  };

  /* useMemo colors/colorTargets（:460-473） */
  var colorTargets = {
    primary: new THREE.Color(theme.primaryColor),
    accent: new THREE.Color(theme.accentColor || theme.primaryColor),
    secondary: new THREE.Color(theme.secondaryColor),
    bg: new THREE.Color(theme.backgroundColor)
  };
  var damped = null; /* 首帧从 targets 克隆（:857-864） */

  /* 场景雾（:845-852）：命令式挂 scene.fog */
  scene.fog = new THREE.Fog(colorTargets.bg.getHex(), DIO_FOG_NEAR, DIO_FOG_FAR);

  /* 字体（:477-492）：fontsEpoch = document.fonts.ready 一次性 +1 */
  var fontsEpoch = 0;
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { fontsEpoch += 1; fontDirty = true; }).catch(function () { });
  }
  var fontDirty = true;
  var fontStack = '';
  var fontWeight = CM_resolveThemeFontWeight(theme, 700);
  var fontSpec = '';
  function ensureFont() {
    if (!fontDirty) return;
    fontDirty = false;
    fontStack = CM_resolveThemeFontStack(theme);
    fontWeight = CM_resolveThemeFontWeight(theme, 700);
    fontSpec = DIO_buildFontSpec(fontStack, fontWeight);
    lineRasterFontRef = '';
    lineRasterEpochRef = -1;
    flushNeighborRasters();
  }

  /* refs（:432-458 等价） */
  var lineMeshes = new Map();          /* globalIndex -> {mesh, mat, geom} */
  var unitsGroup = null;               /* 活动行逐字元组 */
  var unitBaseMats = [];
  var unitGlowMats = [], unitGlowMeshes = [], unitSoulMats = [], unitSoulMeshes = [];
  var unitGeoms = [], unitKey = null;
  var unitLightVals = null, unitSoulVals = null, prevActiveGlobal = -1;
  var powerEnv = 0, trebleEnv = 0;
  var lineRasterCache = new Map();
  var lineRasterFontRef = '';
  var lineRasterEpochRef = -1;
  var activeUnitsRaster = null, activeUnitsRasterPrev = null;
  var activeUnitsUnits = [];
  var keywordMatchers = DIO_prepareKeywordMatchers(theme.wordColors, tuning.keywordColoringEnabled);
  var keywordUnitColors = new Map();

  /* 尘埃窗（:624-642 + :1121-1137 JSX → 命令式） */
  var moteCircumference = DIO_resolveMoteCircumference(tuning.backgroundParticleCircumference);
  var moteRadial = DIO_resolveMoteRadial(tuning.backgroundParticleRadial);
  var moteDensity = moteCircumference * moteRadial;
  var motePositions = new Float32Array(DIO_MOTE_WINDOW_LINES * moteDensity * 3);
  var moteWritten = [];
  var moteGeometry = new THREE.BufferGeometry();
  var moteAttr = new THREE.BufferAttribute(motePositions, 3);
  moteGeometry.setAttribute('position', moteAttr);
  var moteMat = new THREE.PointsMaterial({
    size: 0.03, sizeAttenuation: true, transparent: true, opacity: 0.2,
    depthWrite: false, color: new THREE.Color(theme.secondaryColor),
    blending: THREE.NormalBlending
  });
  var motePoints = new THREE.Points(moteGeometry, moteMat);
  motePoints.frustumCulled = false;
  if (tuning.showParticles) scene.add(motePoints);

  /* 挂载窗 memo（:508-546） */
  var winCache = { key: null, visibleLines: [] };
  function rebuildWindow(ctx) {
    var total = ctx.total;
    var seq = ctx.sequencer;
    var outgoing = ctx.transitionOutgoingIndex;
    var indices = new Set();
    var addWindow = function (center, behind, ahead) {
      var start = Math.max(center - behind, 0);
      var end = Math.min(center + ahead, total - 1);
      for (var i = start; i <= end; i += 1) indices.add(i);
    };
    addWindow(ctx.globalIndex, DIO_LINES_BEHIND, DIO_LINES_AHEAD);
    if (outgoing != null) addWindow(outgoing, DIO_OUTGOING_LINES_BEHIND, DIO_OUTGOING_LINES_AHEAD);
    var mountedIndices = Array.from(indices).sort(function (a, b) { return a - b; });

    var visibleLines = [];
    for (var v = 0; v < mountedIndices.length; v += 1) {
      var i2 = mountedIndices[v];
      var resolved = DIO_resolveGlobal(seq, i2);
      if (!resolved || !resolved.line) continue;
      var frame = resolved.frame;
      var placement = DIO_getDioramaTextPlacement(resolved.localIndex, resolved.segment.seed, ctx.weaveScale);
      var position = new THREE.Vector3(
        frame.position.x + frame.right.x * placement.offsetR + frame.up.x * placement.offsetU,
        frame.position.y + frame.right.y * placement.offsetR + frame.up.y * placement.offsetU,
        frame.position.z + frame.right.z * placement.offsetR + frame.up.z * placement.offsetU
      );
      visibleLines.push({
        index: i2,
        line: resolved.line,
        placement: placement,
        position: position,
        quaternion: dioramaFrameQuaternion(THREE, frame, placement.roll, placement.yaw),
        isOutgoing: outgoing != null && Math.abs(i2 - outgoing) <= Math.abs(i2 - ctx.globalIndex)
      });
    }
    winCache = { key: ctx.winKey, visibleLines: visibleLines };

    /* 离场行同步栅格（:829-835）：换场帧无缝由逐字元降为整行平面 */
    if (outgoing != null && !lineRasterCache.has(outgoing)) {
      for (var q = 0; q < visibleLines.length; q += 1) {
        if (visibleLines[q].index === outgoing && visibleLines[q].line.fullText) {
          lineRasterCache.set(outgoing, DIO_rasterLine(visibleLines[q].line.fullText, fontStack, fontWeight));
          break;
        }
      }
    }

    /* 走廊段（:558-577） */
    var geometryVisibility = DIO_DEFAULT_GEOMETRY_VISIBILITY;
    var geometryMode = geometryVisibility.mode || 'clouds';
    if (geometryVisibility.enabled && geometryMode === 'corridor') {
      var live = DIO_buildCorridorWindow(seq, ctx.globalIndex, DIO_CORRIDOR_LINES_BEHIND, DIO_CORRIDOR_LINES_AHEAD);
      if (outgoing == null) self.corridorSpans = live;
      else {
        var outSpans = DIO_buildCorridorWindow(seq, outgoing, DIO_CORRIDOR_LINES_BEHIND, DIO_CORRIDOR_LINES_AHEAD);
        self.corridorSpans = outSpans.concat(live);
      }
    } else {
      self.corridorSpans = [];
    }

    /* 云簇（:588-619）：升序 + 背后短边距参与碰撞投票，再按挂载窗过滤 */
    self.particleClusters = [];
    if (geometryMode === 'clouds') {
      var mounted = new Set(mountedIndices);
      var clusterIndices = new Set();
      for (var m = 0; m < mountedIndices.length; m += 1) {
        for (var back = 0; back <= DIO_CLUSTER_COLLISION_LINE_SPAN; back += 1) {
          if (mountedIndices[m] - back >= 0) clusterIndices.add(mountedIndices[m] - back);
        }
      }
      var sorted = Array.from(clusterIndices).sort(function (a, b) { return a - b; });
      var result = [];
      for (var c = 0; c < sorted.length; c += 1) {
        var res2 = DIO_resolveGlobal(seq, sorted[c]);
        if (!res2) continue;
        var placement2 = DIO_getDioramaTextPlacement(res2.localIndex, res2.segment.seed, ctx.weaveScale);
        var shot2 = DIO_getDioramaShot(res2.localIndex, res2.segment.lines, res2.segment.seed, ctx.subMode);
        var pieces = DIO_buildFormation(res2.localIndex, res2.segment.seed, shot2, res2.frame, placement2, tuning.particleScale);
        for (var p = 0; p < pieces.length; p += 1) {
          var piece = pieces[p];
          result.push({
            kind: piece.kind,
            position: new THREE.Vector3(piece.position.x, piece.position.y, piece.position.z),
            scale: piece.scale,
            stretchY: piece.stretchY,
            upright: piece.upright,
            spinSpeed: piece.spinSpeed,
            colorSlot: piece.colorSlot,
            layer: piece.layer,
            key: sorted[c] + '-' + p,
            sourceLine: sorted[c],
            particleSeed: (res2.segment.seed == null ? 'seed' : res2.segment.seed) + ':' + res2.localIndex + ':' + p + ':' + piece.kind,
            role: 'formation'
          });
        }
      }
      var visible = DIO_selectVisibleDioramaClusters(result, geometryVisibility);
      self.particleClusters = visible.filter(function (cluster) { return mounted.has(cluster.sourceLine); });
    }

    /* 邻行栅格缓存字体/epoch 失配清仓（:767-777 的等价：字体变化/歌词替换） */
    if (lineRasterFontRef !== fontSpec || lineRasterEpochRef !== ctx.linesEpoch) {
      flushNeighborRasters();
    }
  }

  function flushNeighborRasters() {
    lineRasterCache.forEach(function (raster) { raster.texture.dispose(); });
    lineRasterCache.clear();
    lineRasterFontRef = fontSpec;
    lineRasterEpochRef = -1;
  }

  /* 活动行逐字元栅格 + 布局（:729-745） */
  function rebuildActiveUnits(line, entry) {
    var units = activeUnitsUnits;
    var worldPerPx = DIO_LINE_FONT_SIZE / DIO_RASTER_FONT_PX;
    var full = line.fullText;
    var totalPx = DIO_measureText(full, fontSpec);
    var placed = [];
    for (var i = 0; i < units.length; i += 1) {
      var unit = units[i];
      var prefixPx = DIO_measureText(full.slice(0, unit.charStart), fontSpec);
      var raster = DIO_rasterUnit(full.slice(unit.charStart, unit.charEnd), fontSpec);
      placed.push({
        raster: raster,
        centerX: (-totalPx / 2 + prefixPx + raster.advancePx / 2) * worldPerPx,
        width: raster.canvasWidthPx * worldPerPx,
        height: raster.canvasHeightPx * worldPerPx
      });
    }
    /* 前一套纹理释放（:747-755 cleanup 语义） */
    if (activeUnitsRasterPrev) {
      for (var d = 0; d < activeUnitsRasterPrev.units.length; d += 1) {
        activeUnitsRasterPrev.units[d].raster.baseTexture.dispose();
        activeUnitsRasterPrev.units[d].raster.glowTexture.dispose();
      }
    }
    activeUnitsRasterPrev = activeUnitsRaster;
    activeUnitsRaster = { units: placed, lineWidth: totalPx * worldPerPx };
    buildUnitsGroup(entry);
  }

  /* 逐字元三平面组（:1200-1263 JSX → 命令式；key=globalIndex 换行全重建） */
  function buildUnitsGroup(entry) {
    disposeUnitsGroup();
    if (!activeUnitsRaster || !entry) { unitKey = null; return; }
    unitKey = entry.key;
    var group = new THREE.Group();
    group.position.copy(entry.position);
    group.quaternion.set(entry.quaternion[0], entry.quaternion[1], entry.quaternion[2], entry.quaternion[3]);
    var placed = activeUnitsRaster.units;
    for (var i = 0; i < placed.length; i += 1) {
      var p = placed[i];
      /* 辉光平面（:1210-1227）：additive 心象辉光栅格，renderOrder 17，z -0.01 */
      var glowGeom = new THREE.PlaneGeometry(p.width, p.height);
      var glowMat = new THREE.MeshBasicMaterial({
        map: p.raster.glowTexture, transparent: true, opacity: 0,
        depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
        color: new THREE.Color(theme.accentColor || theme.primaryColor)
      });
      var glowMesh = new THREE.Mesh(glowGeom, glowMat);
      glowMesh.position.set(p.centerX, 0, -0.01);
      glowMesh.renderOrder = 17;
      glowMesh.visible = false;
      group.add(glowMesh);
      /* 灵魂出窍幽影（:1228-1247）：crisp base 栅格 additive，renderOrder 18，z -0.005 */
      var soulGeom = new THREE.PlaneGeometry(p.width, p.height);
      var soulMat = new THREE.MeshBasicMaterial({
        map: p.raster.baseTexture, transparent: true, opacity: 0,
        depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
        color: new THREE.Color(theme.accentColor || theme.primaryColor)
      });
      var soulMesh = new THREE.Mesh(soulGeom, soulMat);
      soulMesh.position.set(p.centerX, 0, -0.005);
      soulMesh.renderOrder = 18;
      soulMesh.visible = false;
      group.add(soulMesh);
      /* 基底平面（:1248-1259）：renderOrder 19，z 0 */
      var baseGeom = new THREE.PlaneGeometry(p.width, p.height);
      var baseMat = new THREE.MeshBasicMaterial({
        map: p.raster.baseTexture, transparent: true, opacity: DIO_UNSUNG_UNIT_OPACITY,
        depthTest: false, depthWrite: false,
        color: new THREE.Color(theme.primaryColor)
      });
      var baseMesh = new THREE.Mesh(baseGeom, baseMat);
      baseMesh.position.set(p.centerX, 0, 0);
      baseMesh.renderOrder = 19;
      group.add(baseMesh);
      unitGlowMats.push(glowMat); unitGlowMeshes.push(glowMesh);
      unitSoulMats.push(soulMat); unitSoulMeshes.push(soulMesh);
      unitBaseMats.push(baseMat);
      unitGeoms.push(glowGeom, soulGeom, baseGeom);
    }
    scene.add(group);
    unitsGroup = group;
  }

  function disposeUnitsGroup() {
    if (unitsGroup) {
      scene.remove(unitsGroup);
      for (var i = 0; i < unitGeoms.length; i += 1) unitGeoms[i].dispose();
      for (var m = 0; m < unitBaseMats.length; m += 1) unitBaseMats[m].dispose();
      for (var g = 0; g < unitGlowMats.length; g += 1) unitGlowMats[g].dispose();
      for (var s = 0; s < unitSoulMats.length; s += 1) unitSoulMats[s].dispose();
    }
    unitsGroup = null;
    unitBaseMats = []; unitGlowMats = []; unitGlowMeshes = [];
    unitSoulMats = []; unitSoulMeshes = []; unitGeoms = [];
  }

  /* 渐变/ sung 色临时对象（:333-335） */
  var _sungTint = new THREE.Color(), _gradDeep = new THREE.Color(), _neutral = new THREE.Color();

  /* step（useFrame :854-1117 命令式） */
  function step(delta, elapsed, ctx) {
    ensureFont();
    /* 窗口/结构脏检（memo 依赖等价） */
    var winKey = ctx.globalIndex + '|' + ctx.transitionOutgoingIndex + '|' + ctx.total + '|' +
      ctx.linesEpoch + '|' + ctx.weaveScale;
    if (winKey !== winCache.key) rebuildWindow(ctx);
    var visibleLines = winCache.visibleLines;

    /* 颜色阻尼（:855-872） */
    if (!damped) {
      damped = {
        primary: colorTargets.primary.clone(), accent: colorTargets.accent.clone(),
        secondary: colorTargets.secondary.clone(), bg: colorTargets.bg.clone()
      };
    }
    var colorK = 1 - Math.exp(-DIO_COLOR_DAMP_RATE * delta);
    damped.primary.lerp(colorTargets.primary, colorK);
    damped.accent.lerp(colorTargets.accent, colorK);
    damped.secondary.lerp(colorTargets.secondary, colorK);
    damped.bg.lerp(colorTargets.bg, colorK);
    if (scene.fog) scene.fog.color.copy(damped.bg);

    /* 音频包络（:877-883）：音频只进几何/光，从不进相机 */
    var audioK = ctx.audioLevel;
    var treble01 = Math.min(1, ctx.treble / 255) * audioK;
    var power01 = Math.min(1, ctx.power / 255) * audioK;
    trebleEnv = dioramaStepEnvelope(trebleEnv, treble01, 14, 3.2, delta);
    powerEnv = dioramaStepEnvelope(powerEnv, power01, 18, 3.5, delta);
    var camPos = ctx.camera.position;

    /* 尘埃窗回收（:890-911） */
    if (tuning.showParticles) {
      var lastLine = Math.max(0, ctx.total - 1);
      var dirty = false;
      for (var line = ctx.globalIndex - DIO_MOTE_LINES_BEHIND; line <= ctx.globalIndex + DIO_MOTE_LINES_AHEAD; line += 1) {
        var slot = DIO_moteSlot(line);
        if (moteWritten[slot] === line) continue;
        var anchorLine = Math.min(Math.max(line, 0), lastLine);
        var resolved = DIO_resolveGlobal(ctx.sequencer, anchorLine);
        if (!resolved) continue;
        DIO_writeMoteLine(motePositions, DIO_extendDioramaFrame(resolved.frame, line - anchorLine), line,
          moteCircumference, moteRadial, ctx.activeSegSeed);
        moteWritten[slot] = line;
        dirty = true;
      }
      if (dirty) moteAttr.needsUpdate = true;
    }
    /* 尘埃漂移 + 材质（:914-924） */
    motePoints.position.set(
      Math.sin(elapsed * 0.17) * 0.12, Math.sin(elapsed * 0.11 + 1.7) * 0.09, Math.cos(elapsed * 0.13) * 0.12
    );
    moteMat.size = 0.03 * (1 + 0.42 * trebleEnv);
    moteMat.opacity = 0.16 + 0.18 * powerEnv;
    moteMat.color.copy(damped.secondary).lerp(damped.accent, 0.3);

    var aspect = ctx.camera.isPerspectiveCamera ? ctx.camera.aspect : 1;
    var fov = ctx.camera.isPerspectiveCamera ? ctx.camera.fov : 55;

    /* 邻行平面：栅格就绪的行补建 mesh（React bumpNeighborTick 等价），缺栅格按帧预算补栅（:763-812） */
    var wanted = new Set();
    for (var w = 0; w < visibleLines.length; w += 1) {
      if (visibleLines[w].line.fullText && visibleLines[w].index !== ctx.globalIndex) wanted.add(visibleLines[w].index);
    }
    lineRasterCache.forEach(function (raster, index) {
      if (!wanted.has(index)) {
        raster.texture.dispose();
        lineRasterCache.delete(index);
      }
    });
    var missing = [];
    wanted.forEach(function (index) { if (!lineRasterCache.has(index)) missing.push(index); });
    for (var mi = 0; mi < missing.length && mi < DIO_NEIGHBOR_RASTER_BUDGET; mi += 1) {
      for (var q2 = 0; q2 < visibleLines.length; q2 += 1) {
        if (visibleLines[q2].index === missing[mi] && visibleLines[q2].line.fullText && !lineRasterCache.has(missing[mi])) {
          lineRasterCache.set(missing[mi], DIO_rasterLine(visibleLines[q2].line.fullText, fontStack, fontWeight));
          break;
        }
      }
    }
    /* 邻行 fit/透明/着色（:929-954） */
    for (var v2 = 0; v2 < visibleLines.length; v2 += 1) {
      var entry = visibleLines[v2];
      if (entry.index === ctx.globalIndex) continue;
      var rec = lineMeshes.get(entry.index);
      var raster = lineRasterCache.get(entry.index);
      if (!entry.line.fullText) {
        if (rec) { removeLineMesh(entry.index); }
        continue;
      }
      if (!raster) { if (rec) removeLineMesh(entry.index); continue; }
      if (!rec) {
        var worldPerPx0 = DIO_LINE_FONT_SIZE / raster.fontPx;
        var geom = new THREE.PlaneGeometry(raster.canvasWidthPx * worldPerPx0, raster.canvasHeightPx * worldPerPx0);
        var mat = new THREE.MeshBasicMaterial({
          map: raster.texture, transparent: true, opacity: 0, depthWrite: false,
          color: new THREE.Color(theme.primaryColor)
        });
        var mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = 0;
        scene.add(mesh);
        rec = { mesh: mesh, mat: mat, geom: geom };
        lineMeshes.set(entry.index, rec);
      }
      rec.mesh.position.copy(entry.position);
      rec.mesh.quaternion.set(entry.quaternion[0], entry.quaternion[1], entry.quaternion[2], entry.quaternion[3]);
      var worldWidth = raster.advancePx * (DIO_LINE_FONT_SIZE / raster.fontPx);
      var fit = dioramaResolveFrameFitScale(worldWidth, DIO_HERO_DISTANCE, fov, aspect) * entry.placement.scale * ctx.lyricsFontScale;
      rec.mesh.scale.setScalar(fit);
      var life = dioramaResolveTextLife(rec.mesh.position.distanceTo(camPos));
      if (entry.isOutgoing) {
        rec.mat.opacity = dioramaResolveOutgoingLineOpacity(entry.index - (ctx.transitionOutgoingIndex != null ? ctx.transitionOutgoingIndex : entry.index)) * life;
        rec.mat.color.copy(damped.primary);
      } else {
        var offset = entry.index - ctx.globalIndex;
        rec.mat.opacity = dioramaResolveNeighborLineOpacity(offset) * life;
        rec.mat.color.copy(offset < 0 ? damped.primary : damped.secondary);
      }
    }
    lineMeshes.forEach(function (rec2, index2) {
      if (!wanted.has(index2)) removeLineMesh(index2);
    });

    /* 活动行逐字元（:956-1116） */
    var activeEntry = null;
    for (var a = 0; a < visibleLines.length; a += 1) {
      if (visibleLines[a].index === ctx.globalIndex) { activeEntry = visibleLines[a]; break; }
    }
    var activeLine = ctx.activeLine;
    var units = activeLine ? dioramaBuildActiveUnitsCached(activeLine) : [];
    activeUnitsUnits = units;

    if (dioramaShouldResetUnitState(prevActiveGlobal, ctx.globalIndex, unitLightVals ? unitLightVals.length : undefined, units.length)) {
      prevActiveGlobal = ctx.globalIndex;
      unitLightVals = new Float32Array(units.length);
      unitSoulVals = new Float32Array(units.length);
      unitBaseMats.length = units.length;
      unitGlowMats.length = units.length;
      unitGlowMeshes.length = units.length;
      unitSoulMats.length = units.length;
      unitSoulMeshes.length = units.length;
    }
    /* 逐字元组重建（key=globalIndex→group 重建；本行词替换→只重栅格 :298-303 注） */
    if (activeLine && activeEntry && activeLine.fullText) {
      var unitsRasterKey = ctx.globalIndex + '|' + ctx.linesEpoch + '|' + fontSpec;
      if (unitKey !== unitsRasterKey || !activeUnitsRaster) {
        rebuildActiveUnits(activeLine, { position: activeEntry.position, quaternion: activeEntry.quaternion, key: unitsRasterKey });
      }
    } else {
      disposeUnitsGroup();
      unitKey = null;
      activeUnitsRaster = null;
      self.activeLineWidth = 0;
    }

    if (unitsGroup && activeUnitsRaster && activeEntry && activeLine) {
      var fit2 = dioramaResolveFrameFitScale(activeUnitsRaster.lineWidth, DIO_HERO_DISTANCE, fov, aspect)
        * activeEntry.placement.scale * ctx.lyricsFontScale;
      unitsGroup.scale.setScalar(fit2);
      self.activeLineWidth = activeUnitsRaster.lineWidth * fit2;   /* CameraRig 词跟踪宽（:983） */
      var life2 = dioramaResolveTextLife(unitsGroup.position.distanceTo(camPos));
      var now = ctx.now;
      var breath = 0.9 + 0.1 * Math.sin(elapsed * 1.9);
      var lightVals = unitLightVals, soulVals = unitSoulVals;

      var gradientStrength = Math.min(1.5, tuning.gradientIntensity);
      /* 唱色轴（:998-1011）：退化 accent→中性灰值偏移 */
      var tintSeparation = Math.abs(damped.accent.r - damped.primary.r)
        + Math.abs(damped.accent.g - damped.primary.g)
        + Math.abs(damped.accent.b - damped.primary.b);
      _sungTint.copy(damped.accent);
      if (tintSeparation < 0.4) {
        var deficit = 1 - tintSeparation / 0.4;
        var primaryLum = (damped.primary.r + damped.primary.g + damped.primary.b) / 3;
        var accentLum = (damped.accent.r + damped.accent.g + damped.accent.b) / 3;
        var targetLum = primaryLum > 0.5 ? accentLum * (1 - 0.5 * deficit) : accentLum + (1 - accentLum) * 0.55 * deficit;
        _neutral.setRGB(targetLum, targetLum, targetLum);
        _sungTint.lerp(_neutral, deficit);
      }
      var gradHot01 = Math.min(1, Math.max(0, (gradientStrength - 0.1) / 1.4));
      _gradDeep.copy(_sungTint).multiplyScalar(0.8 - 0.18 * gradHot01);

      for (var u = 0; u < units.length; u += 1) {
        var baseMat = unitBaseMats[u];
        if (!baseMat || !lightVals || !soulVals) continue;
        var unit = units[u];
        var isCurrent = now >= unit.startTime && now < unit.endTime;
        var sung = now >= unit.endTime;
        var span2 = Math.max(unit.endTime - unit.startTime, 0.001);
        var sungMix = sung ? 1 : (isCurrent ? Math.min(1, Math.max(0, (now - unit.startTime) / span2)) : 0);

        lightVals[u] = dioramaStepEnvelope(lightVals[u], isCurrent ? 1 : 0, 14, 4.5, delta);
        var gradientEnergy = dioramaResolveGradientEnergy(now, unit) * gradientStrength;

        baseMat.opacity = Math.min(1,
          (DIO_UNSUNG_UNIT_OPACITY + (DIO_ACTIVE_LINE_OPACITY - DIO_UNSUNG_UNIT_OPACITY) * sungMix + 0.08 * Math.min(1, gradientEnergy)) * life2
        );

        /* 统一唱色（:1044-1062）：一底一标一插值；关键字只改目标色 */
        var unitTarget = keywordUnitColors.get(u) != null ? keywordUnitColors.get(u)
          : (tuning.gradientIntensity > 0 ? _gradDeep : _sungTint);
        var unitProgress = tuning.gradientIntensity > 0 ? gradientEnergy : lightVals[u] * 1.15;
        dioramaResolveUnitFill(baseMat.color, damped.primary, unitTarget, unitProgress);

        /* 普通辉光（:1064-1079）：只读统一色；辉光平面永不缩放/移动 */
        var glowStrength = Math.min(1.5, tuning.glowIntensity);
        var glowLevel = lightVals[u] * life2 * breath * (0.6 + 0.4 * powerEnv) * glowStrength;
        var glowMat = unitGlowMats[u], glowMesh = unitGlowMeshes[u];
        if (glowMat) {
          glowMat.opacity = Math.min(1, DIO_UNIT_GLOW_MAX_OPACITY * glowLevel);
          glowMat.color.copy(baseMat.color);
        }
        if (glowMesh) glowMesh.visible = glowLevel > 0.012;

        /* 灵魂出窍（:1081-1112）：播放相位切两段——唱中注册幽影/唱毕离体飞行 */
        soulVals[u] = dioramaStepEnvelope(soulVals[u], isCurrent ? 1 : 0, 12, 2.2, delta);
        var soulMat = unitSoulMats[u], soulMesh = unitSoulMeshes[u];
        if (soulMat && soulMesh) {
          var soulStrength = Math.min(1.5, tuning.soulIntensity);
          var flightMix = sung ? dioramaSmoothstep01(Math.min(1, Math.max(0, (now - unit.endTime) / DIO_SOUL_HANDOFF_SECONDS))) : 0;
          var activeReach = tuning.soulActiveEnabled ? soulStrength : 0;
          var onGlyph = (1 - flightMix) * activeReach;
          var flown = flightMix * soulStrength;
          soulMat.color.copy(baseMat.color);
          soulMat.opacity = Math.min(1, DIO_SOUL_MAX_OPACITY * life2 * soulVals[u] * (onGlyph + flown));
          soulMesh.position.y = DIO_LINE_FONT_SIZE * (DIO_SOUL_ACTIVE_LIFT_EM * onGlyph + DIO_SOUL_DETACH_LIFT_EM * flown);
          var soulSwell = 1 + DIO_SOUL_ACTIVE_SWELL * onGlyph + DIO_SOUL_DETACH_SWELL * flown;
          soulMesh.scale.set(soulSwell, soulSwell, 1);
          soulMesh.visible = soulMat.opacity > 0.015;
        }
      }
    } else {
      self.activeLineWidth = 0;
    }
  }

  /* 关键字着色目标（:710-724）：行变化时按字符区间重解析 */
  var activeUnitsLineRef = null;
  function dioramaBuildActiveUnitsCached(line) {
    if (activeUnitsLineRef !== line) {
      activeUnitsLineRef = line;
      var timeline = CM_buildLineGraphemeTimeline(line);
      activeUnitsCache = dioramaBuildActiveUnits(line, timeline);
      keywordUnitColors = DIO_resolveKeywordUnitColors(
        line.fullText || '', activeUnitsCache, keywordMatchers,
        colorTargets.primary, colorTargets.accent, colorTargets.bg
      );
    }
    return activeUnitsCache;
  }
  var activeUnitsCache = [];

  function removeLineMesh(index) {
    var rec = lineMeshes.get(index);
    if (!rec) return;
    scene.remove(rec.mesh);
    rec.geom.dispose();
    rec.mat.dispose();
    lineMeshes.delete(index);
  }

  function setTheme(nextTheme) {
    theme = nextTheme;
    colorTargets.primary.set(nextTheme.primaryColor);
    colorTargets.accent.set(nextTheme.accentColor || nextTheme.primaryColor);
    colorTargets.secondary.set(nextTheme.secondaryColor);
    colorTargets.bg.set(nextTheme.backgroundColor);
    keywordMatchers = DIO_prepareKeywordMatchers(nextTheme.wordColors, tuning.keywordColoringEnabled);
    activeUnitsLineRef = null;
    fontDirty = true;
    moteMat.color.set(nextTheme.secondaryColor);
  }

  function setFontScale() {
    /* 字号进 ctx.lyricsFontScale（每帧读），行栅格与布局自动随 fit */
    activeUnitsLineRef = null;
  }

  function dispose() {
    disposeUnitsGroup();
    lineMeshes.forEach(function (rec, index) { removeLineMesh(index); });
    lineRasterCache.forEach(function (raster) { raster.texture.dispose(); });
    lineRasterCache.clear();
    if (activeUnitsRaster) {
      for (var d = 0; d < activeUnitsRaster.units.length; d += 1) {
        activeUnitsRaster.units[d].raster.baseTexture.dispose();
        activeUnitsRaster.units[d].raster.glowTexture.dispose();
      }
      activeUnitsRaster = null;
    }
    if (activeUnitsRasterPrev) {
      for (var d2 = 0; d2 < activeUnitsRasterPrev.units.length; d2 += 1) {
        activeUnitsRasterPrev.units[d2].raster.baseTexture.dispose();
        activeUnitsRasterPrev.units[d2].raster.glowTexture.dispose();
      }
      activeUnitsRasterPrev = null;
    }
    if (motePoints.parent) scene.remove(motePoints);
    moteGeometry.dispose();
    moteMat.dispose();
    if (scene.fog) scene.fog = null;
  }

  /* 方法挂回 self（activeLineWidth 等可变字段必须与返回对象同一实例） */
  self.step = step;
  self.dispose = dispose;
  self.setTheme = setTheme;
  self.setFontScale = setFontScale;
  self.getGeometryInputs = function () {
    return {
      mode: (DIO_DEFAULT_GEOMETRY_VISIBILITY.mode || 'clouds'),
      clusters: self.particleClusters,
      corridorSpans: self.corridorSpans,
      density: tuning.particleDensity,
      particleGlowEnabled: tuning.particleGlowEnabled,
      particleGlowIntensity: tuning.particleGlowIntensity,
      backgroundColor: theme.backgroundColor,
      primaryColor: theme.primaryColor,
      accentColor: theme.accentColor || theme.primaryColor,
      secondaryColor: theme.secondaryColor
    };
  };
  return self;
}

/* =========================================================================
   DioramaParticleField（DioramaParticleField.tsx:88-382 命令式落地）
   ========================================================================= */
function DioramaCreateParticleField(THREE, scene, getInputs) {
  /* 常量（:96-167） */
  var CORRIDOR_UNITS_PER_LINE = DIO_STEP_DISTANCE / DIO_CORRIDOR_RADIUS;
  var FORMATION_SETTLE_SECONDS = 0.4;
  var CLOUD_SWELL = 0.34;
  var CORRIDOR_MAX_SWELL = 0.45;
  var CORRIDOR_QUIET_SWELL = 0.1;
  var MAX_WAVE = 0.85;
  var CLOUD_MAX_SWELL = MAX_WAVE * CLOUD_SWELL;
  var CORRIDOR_MAX_SWELL_REACH = MAX_WAVE * CORRIDOR_MAX_SWELL;

  /* RipplePool（:74-93） */
  function createRipplePool() {
    return {
      sources: new Float32Array(DIO_RIPPLE_COUNT * 4),
      shapes: new Float32Array(DIO_RIPPLE_COUNT * 4),
      cursor: DIO_RIPPLE_BANDS.map(function () { return 0; }),
      spawned: 0
    };
  }

  /* spawnRipple（:104-143）：确定性伪随机变参 */
  function spawnRipple(pool, bandIndex, strength, now, corridor, readHeadAlong) {
    var seed = DIO_hashSeed('diorama-ripple:' + pool.spawned);
    var preset = DIO_RIPPLE_BANDS[bandIndex];
    var height = DIO_seededUnit(seed + 1);
    var spread = DIO_seededUnit(seed + 2);
    var pace = DIO_seededUnit(seed + 3);
    var cursor = pool.cursor[bandIndex];
    var offset = (bandIndex * DIO_RIPPLE_SLOTS_PER_BAND + cursor) * 4;
    if (corridor) {
      pool.sources[offset] = readHeadAlong + 0.4 + DIO_seededUnit(seed + 4) * 2.2;
      pool.sources[offset + 1] = DIO_seededUnit(seed + 5) * Math.PI * 2;
      pool.sources[offset + 2] = 0;
    } else {
      var up = DIO_seededUnit(seed + 4) * 2 - 1;
      var around = DIO_seededUnit(seed + 5) * Math.PI * 2;
      var ring = Math.sqrt(Math.max(0, 1 - up * up));
      pool.sources[offset] = ring * Math.cos(around);
      pool.sources[offset + 1] = up;
      pool.sources[offset + 2] = ring * Math.sin(around);
    }
    pool.sources[offset + 3] = now;
    pool.shapes[offset] = preset.strength * strength * (0.7 + height * 0.6);
    pool.shapes[offset + 1] = preset.speed * (0.8 + pace * 0.45);
    pool.shapes[offset + 2] = preset.width * (0.78 + spread * 0.5);
    pool.shapes[offset + 3] = preset.wavenumber;
    pool.cursor[bandIndex] = (cursor + 1) % DIO_RIPPLE_SLOTS_PER_BAND;
    pool.spawned += 1;
  }

  /* 材质一次创建（:209-216 lazy ref 等价）；点云几何按 key 重建（:190-199） */
  var material = null, glowMaterial = null, targetColors = null;
  var built = { key: null, geometry: null, waveNumberMax: 8 };
  var trackers = DIO_RIPPLE_BANDS.map(function () { return DIO_createBandTracker(); });
  var ripples = createRipplePool();
  var flowTime = 0;
  var previousPlaybackTime = null;
  var drawingBufferSize = null;
  var elasticState = DIO_createElasticState();
  var formation = 1;
  var lockedSeconds = FORMATION_SETTLE_SECONDS;
  var resetKeyCache = null;

  function ensureMaterials(inputs) {
    if (material) return;
    if (!drawingBufferSize) drawingBufferSize = new THREE.Vector2();
    targetColors = DIO_resolveContrastColors({
      primary: new THREE.Color(inputs.primaryColor),
      accent: new THREE.Color(inputs.accentColor),
      secondary: new THREE.Color(inputs.secondaryColor)
    }, new THREE.Color(inputs.backgroundColor));
    material = DIO_createParticleMaterial(targetColors);
    glowMaterial = DIO_createParticleGlowMaterial(targetColors, inputs.particleGlowIntensity);
  }

  function rebuildGeometryIfNeeded(inputs) {
    var key = inputs.mode + '|' + (inputs.mode === 'corridor'
      ? inputs.corridorSpans.map(function (s) { return s.pathStart; }).join(',') + '|' + inputs.corridorSpans.length
      : inputs.clusters.map(function (c) { return c.key; }).join(',')) + '|' + inputs.density;
    if (key === built.key) return;
    var data = inputs.mode === 'corridor'
      ? DIO_buildCorridorGeometryData(inputs.corridorSpans, inputs.density)
      : DIO_buildCloudGeometryData(inputs.clusters, inputs.density);
    if (built.geometry) built.geometry.dispose();
    built = {
      key: key,
      geometry: DIO_createBufferGeometry(data),
      waveNumberMax: DIO_resolveWaveNumberMax(data.spacing)
    };
    if (glowPoints) { glowPoints.geometry = built.geometry; }
    if (basePoints) { basePoints.geometry = built.geometry; }
  }

  /* 双 pass Points（:364-381 JSX → 命令式）：glow（renderOrder 3）+ 对比层（renderOrder 4） */
  var glowPoints = null, basePoints = null;
  function ensurePoints(inputs) {
    ensureMaterials(inputs);
    if (!basePoints) {
      basePoints = new THREE.Points(built.geometry, material);
      basePoints.frustumCulled = false;
      basePoints.renderOrder = 4;
      scene.add(basePoints);
    }
    if (inputs.particleGlowEnabled && !glowPoints) {
      glowPoints = new THREE.Points(built.geometry, glowMaterial);
      glowPoints.frustumCulled = false;
      glowPoints.renderOrder = 3;
      scene.add(glowPoints);
    } else if (!inputs.particleGlowEnabled && glowPoints) {
      scene.remove(glowPoints);
      glowPoints = null;
    }
  }

  function step(rawDelta, ctx) {
    var delta = Math.min(rawDelta, 0.1);
    var inputs = getInputs();
    rebuildGeometryIfNeeded(inputs);   /* 先建几何——ensurePoints 以 built.geometry 构造 Points */
    ensurePoints(inputs);
    var inputsKey = ctx.resetKey;
    if (inputsKey !== resetKeyCache) {
      resetKeyCache = inputsKey;
      previousPlaybackTime = null;
      elasticState = DIO_createElasticState();
      ripples = createRipplePool();
      trackers = DIO_RIPPLE_BANDS.map(function () { return DIO_createBandTracker(); });
    }

    /* 共享 0..255 频带归一（:256-262）：检测故意不乘 audioLevel（响度不变性注） */
    /* DioramaParticleField.tsx:256-258：MotionValue 经 .get() 取值（桥传入 MV duck-type） */
    var bassTarget = Math.min(1, ctx.bands.bass.get() / 255);
    var midTarget = Math.min(1, (ctx.bands.lowMid.get() * 0.5 + ctx.bands.mid.get() * 0.5) / 255);
    var trebleTarget = Math.min(1, ctx.bands.treble.get() / 255);
    var bass = DIO_stepBandTracker(trackers[0], bassTarget, delta);
    var mid = DIO_stepBandTracker(trackers[1], midTarget, delta);
    var treble = DIO_stepBandTracker(trackers[2], trebleTarget, delta);
    var bands = [bass, mid, treble];
    var response = DIO_resolveAudioResponse(bass, mid);
    var gain = Math.max(0, ctx.audioLevel);

    /* flow 时钟随播放推进（:270-286）：暂停冻结、seek/loop 跳变重建涟漪池 */
    var playbackTime = Math.max(0, ctx.now);
    var playbackDelta = previousPlaybackTime == null ? 0 : playbackTime - previousPlaybackTime;
    var playbackDiscontinuity = previousPlaybackTime == null || playbackDelta < -0.05 || playbackDelta > 0.5;
    if (playbackDiscontinuity) {
      flowTime = playbackTime * 0.28;
      ripples = createRipplePool();
    } else if (playbackDelta > 0) {
      flowTime += playbackDelta * response.flowSpeed;
    }
    previousPlaybackTime = playbackTime;

    /* 音频→几何唯一入口（:288-299）：阈值上升沿每击一涟漪 */
    var isCorridor = inputs.mode === 'corridor';
    var readHeadAlong = ctx.readHeadLine * CORRIDOR_UNITS_PER_LINE;
    if (gain > 0.001) {
      for (var b = 0; b < bands.length; b += 1) {
        if (!bands[b].onset) continue;
        spawnRipple(ripples, b, bands[b].transient, flowTime, isCorridor, readHeadAlong);
      }
    }

    /* 弹性脉冲（:302-309） */
    var elasticPulse = DIO_stepElasticResponse(
      elasticState,
      DIO_resolvePulseTarget(response.clusterPulse, gain, isCorridor),
      delta
    );
    ctx.renderer.getDrawingBufferSize(drawingBufferSize);
    var colorAmount = 1 - Math.exp(-1.2 * delta);

    /* 编队聚散（:313-319） */
    lockedSeconds = ctx.transitionActive
      ? 0
      : Math.min(FORMATION_SETTLE_SECONDS, lockedSeconds + delta);
    var formationTarget = (!ctx.transitionActive && lockedSeconds >= FORMATION_SETTLE_SECONDS) ? 1 : 0;
    formation = DIO_stepEnvelope(formation, formationTarget, 1.5, 3.2, delta);

    /* 双模式动态（:321-337） */
    var amplitude = gain * (isCorridor
      ? Math.min(CORRIDOR_MAX_SWELL, CORRIDOR_QUIET_SWELL + bass.sustained * 0.18 + mid.sustained * 0.08)
      : CLOUD_SWELL);
    var flow = isCorridor ? 1 : 0;
    var scatterDistance = isCorridor ? 6 : 1.4;
    var sizeBase = isCorridor ? 0.072 : 0.05;
    var sizeGain = isCorridor ? 0.34 : 0.3;
    var centroid = Math.min(1, 0.2 + treble.sustained * 0.8);
    var viewportHeight = drawingBufferSize.y;

    var targets = [material, glowMaterial];
    for (var t = 0; t < targets.length; t += 1) {
      var u = targets[t].uniforms;
      u.uTime.value = flowTime;
      u.uCorridor.value = isCorridor ? 1 : 0;
      u.uAmplitude.value = amplitude;
      u.uMaxSwell.value = isCorridor ? CORRIDOR_MAX_SWELL_REACH : CLOUD_MAX_SWELL;
      u.uWaveNumberMax.value = built.waveNumberMax;
      u.uDetail.value = Math.min(1, treble.sustained * gain);
      u.uRippleSource.value = ripples.sources;
      u.uRippleShape.value = ripples.shapes;
      u.uOffsetGain.value = mid.sustained * gain;
      u.uFlow.value = flow;
      u.uFormation.value = formation;
      u.uScatter.value = scatterDistance;
      u.uSizeBase.value = sizeBase;
      u.uSizeGain.value = sizeGain;
      u.uPulse.value = elasticPulse;
      u.uSpectralCentroid.value = centroid;
      u.uViewportHeight.value = viewportHeight;
      DIO_lerpParticleMaterialColors(targets[t], targetColors, colorAmount);
    }
  }

  function setGlowIntensity(v) {
    if (glowMaterial) glowMaterial.uniforms.uGlow.value = v;
  }

  function __geometry() { return built.geometry; }

  function dispose() {
    if (glowPoints) { scene.remove(glowPoints); glowPoints = null; }
    if (basePoints) { scene.remove(basePoints); basePoints = null; }
    if (built.geometry) { built.geometry.dispose(); built.geometry = null; built.key = null; }
    if (material) { material.dispose(); material = null; }
    if (glowMaterial) { glowMaterial.dispose(); glowMaterial = null; }
  }

  return { step: step, dispose: dispose, setGlowIntensity: setGlowIntensity, __geometry: __geometry, __material: function () { return material; } };
}

/* =========================================================================
   VisualizerDiorama 宿主（VisualizerDiorama.tsx + Canvas + 字幕覆盖）
   ========================================================================= */
function DioramaDioramaEngine(options) {
  var host = options.host;
  var theme = options.theme;
  var pending = { seed: options.seed != null ? options.seed : 'diorama', lines: options.lines || [] };
  var committed = { seed: pending.seed, lines: pending.lines };
  var currentTime = options.currentTime;
  var audioPower = options.audioPower;
  var audioBands = options.audioBands;
  var lyricsFontScale = options.lyricsFontScale != null ? options.lyricsFontScale : 1;
  var showText = options.showText !== false;
  var destroyed = false;

  /* THREE 绑定（wrapper 形参在 ES module 异步加载期可能为 null——create 时补挂） */
  if (!THREE) THREE = (typeof window !== 'undefined' && window.THREE185) || null;
  if (!THREE) throw new Error('[DioramaEngine] three.js 0.185 未就绪（window.THREE185）');

  /* ---------- <Canvas>（VisualizerDiorama:402-457） ---------- */
  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;background:transparent;';
  host.appendChild(canvas);
  var hostW = Math.max(host.clientWidth || 0, window.innerWidth || 0) || 1280;
  var hostH = Math.max(host.clientHeight || 0, window.innerHeight || 0) || 720;
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1), 2));   /* dpr:[1,2] */
  renderer.setSize(hostW, hostH, false);
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(55, hostW / hostH, 0.1, 1000);
  camera.position.set(0, 0.6, 9);

  var motion = DioramaResolveMotionParams(theme.animationIntensity);

  /* ---------- 序列机 refs（:274-281） ---------- */
  var seq = DIO_createSequencerState();
  var lastLocalIndexRef = 0;
  var hasEverActive = false;
  var lastActiveKeyRef = null;
  var transitionEpoch = 0;
  var transition = null;               /* {epoch, outgoingIndex, startedAtMs} */
  var gateWatch = null;                /* 器乐曲/慢载提交闸（:179-192） */
  var instrumentalSeed = undefined;
  var activeLineWidth = 0;             /* DioramaScene 每帧写、CameraRig 读（:79-84） */

  /* ---------- 器乐曲幻影行缓存（按 seed 键控，:201-206） ---------- */
  var phantomCache = { seed: undefined, lines: null };
  function phantomLinesFor(seed) {
    if (phantomCache.seed !== seed) phantomCache = { seed: seed, lines: dioramaBuildInstrumentalPhantomLines() };
    return phantomCache.lines;
  }

  /* ---------- CameraRig / DioramaScene / DioramaParticleField ---------- */
  var cameraRig = DioramaCreateCameraRig(THREE);
  var dioramaScene = DioramaCreateDioramaScene(THREE, {
    theme: theme, tuning: dioramaEnsureDefaults(), motion: motion, host: host, scene: scene
  });
  var particleField = DioramaCreateParticleField(THREE, scene, function () {
    return dioramaScene.getGeometryInputs();
  });

  /* ---------- 等待占位（:388-392 + :460-473） ---------- */
  var waitingEl = document.createElement('div');
  waitingEl.style.cssText = 'position:absolute;left:0;right:0;bottom:18%;text-align:center;pointer-events:none;' +
    'opacity:0;transition:opacity .4s ease;font-weight:500;';
  waitingEl.style.color = theme.secondaryColor || theme.primaryColor;
  waitingEl.textContent = '等待音乐…';
  host.appendChild(waitingEl);

  /* ---------- 底部字幕（VisualizerSubtitleOverlay :48-215；MineRadio 单 translation 轨） ---------- */
  var subtitleSizes = CM_resolveSubtitleFontSizes(lyricsFontScale);
  var subWrap = document.createElement('div');
  subWrap.style.cssText = 'position:absolute;left:0;right:0;bottom:28px;text-align:center;pointer-events:none;z-index:20;' +
    'padding:0 16px;opacity:0;';
  host.appendChild(subWrap);
  var subContent = null;
  var subtitleKey = null;

  function renderSubtitle(activeLine, recentCompletedLine, nextLines) {
    var shouldRender = showText;
    var translation = null;
    if (shouldRender) {
      var candidates = [activeLine, recentCompletedLine];
      for (var i = 0; i < candidates.length; i += 1) {
        var line = candidates[i];
        var text = line && line.translation ? String(line.translation) : '';
        if (text && dioramaHasReadableText(text)) { translation = text; break; }
      }
    }
    var upcoming = [];
    if (shouldRender && !translation && activeLine) {
      upcoming = (nextLines || []).filter(function (l) { return dioramaHasReadableText(l.fullText); });
    }
    var key = translation ? 't:' + translation : (upcoming.length ? 'u:' + upcoming.map(function (l) { return l.startTime; }).join('|') : null);
    if (key === subtitleKey) return;

    /* AnimatePresence 容器（:134-146）：opacity/y 0.24s easeOut */
    if (!key) {
      subtitleKey = null;
      mmApplyVariant(subWrap, { exit: { opacity: 0, y: 20, transition: { duration: 0.24, ease: 'easeOut' } } }, 'exit', null);
      return;
    }
    subtitleKey = key;
    subWrap.innerHTML = '';
    subContent = document.createElement('div');
    subContent.style.cssText = 'position:relative;display:inline-block;padding:2px 6px;';
    /* subtitleOverlayBackground 辉光底（:122-129, :150-156） */
    var glowBg = document.createElement('div');
    glowBg.setAttribute('aria-hidden', 'true');
    glowBg.style.cssText = 'position:absolute;left:-40px;right:-40px;top:-24px;bottom:-24px;z-index:0;filter:blur(24px);' +
      'background:radial-gradient(ellipse 115% 130% at center, ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.96) + ' 0%, ' +
      CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.78) + ' 62%, transparent 100%);';
    subContent.appendChild(glowBg);
    var inner = document.createElement('div');
    inner.style.cssText = 'position:relative;z-index:10;max-width:56rem;margin:0 auto;';
    if (translation) {
      /* 翻译行（:157-186）：secondary 色 + 主题翻译字体栈 + 500 字重 + 文字阴影 */
      var transEl = document.createElement('div');
      transEl.style.cssText = 'color:' + (theme.secondaryColor || theme.primaryColor) +
        ';font-size:' + subtitleSizes.translationFontSize +
        ';font-family:' + CM_resolveThemeTranslationFontStack(theme) +
        ';font-weight:' + CM_resolveThemeFontWeight(theme, 500) +
        ';text-shadow:0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.24) + ';';
      transEl.textContent = translation;
      inner.appendChild(transEl);
    } else {
      /* 下一句预览（:188-213）：truncate + blur 1px + 500ms 过渡 */
      for (var u = 0; u < upcoming.length; u += 1) {
        var p = document.createElement('p');
        p.style.cssText = 'margin:6px 0 0;max-width:42rem;margin-left:auto;margin-right:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:all .5s ease;filter:blur(1px);' +
          'color:' + (theme.secondaryColor || theme.primaryColor) +
          ';font-size:' + subtitleSizes.upcomingFontSize +
          ';font-weight:' + CM_resolveThemeFontWeight(theme, 400) +
          ';text-shadow:0 1px 2px ' + CM_colorWithAlpha(theme.backgroundColor || '#0e0906', 0.24) + ';';
        p.textContent = upcoming[u].fullText;
        inner.appendChild(p);
      }
    }
    subContent.appendChild(inner);
    subWrap.appendChild(subContent);
    mmApplyVariant(subWrap, { enter: { opacity: 0.6, y: 0, transition: { opacity: { duration: 0.24, ease: 'easeOut' }, y: { duration: 0.24, ease: 'easeOut' } } } }, 'enter', null);
  }

  /* ---------- resize（R3F 自动等价） ---------- */
  function onResize() {
    if (destroyed) return;
    var w = Math.max(host.clientWidth || 0, 1);
    var h = Math.max(host.clientHeight || 0, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  /* ---------- 主循环（useFrame 序：CameraRig → Scene → Field） ---------- */
  var startWall = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  var lastFrameWall = startWall;
  var subtitleTick = 0;

  function tick() {
    if (destroyed) return;
    var nowWall = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var delta = Math.max(0, (nowWall - lastFrameWall) / 1000);
    lastFrameWall = nowWall;
    var elapsed = (nowWall - startWall) / 1000;   /* state.clock.elapsedTime 等价 */
    var now = currentTime.get();
    var dirty = machineTick(now, nowWall);
    var st = machineState;

    /* 主题色目标更新（setTheme 时已换；此处只需引擎各 step） */
    cameraRig.step(delta, elapsed, {
      sequencer: seq,
      globalIndex: st.globalIndex,
      linesEpoch: st.linesEpoch,
      now: now,
      camera: camera,
      activeLineWidth: activeLineWidth,
      moveScale: motion.moveScale,
      driftScale: motion.driftScale,
      smoothTime: motion.smoothTime,
      subMode: motion.subMode,
      weaveScale: motion.weaveScale,
      transitionEpoch: transitionEpoch
    });

    var trebleVal = audioBands.treble ? audioBands.treble.get() : 0;
    var powerVal = audioPower ? audioPower.get() : 0;
    dioramaScene.step(delta, elapsed, {
      sequencer: seq,
      globalIndex: st.globalIndex,
      transitionOutgoingIndex: st.transitionOutgoingIndex,
      total: st.total,
      linesEpoch: st.linesEpoch,
      activeSegKey: st.activeSegKey,
      activeSegSeed: st.activeSegSeed,
      activeLine: st.activeLine,
      now: now,
      camera: camera,
      treble: trebleVal,
      power: powerVal,
      audioLevel: motion.audioLevel,
      weaveScale: motion.weaveScale,
      subMode: motion.subMode,
      lyricsFontScale: lyricsFontScale
    });
    activeLineWidth = dioramaScene.activeLineWidth;

    particleField.step(delta, {
      renderer: renderer,
      now: now,
      bands: audioBands,
      audioLevel: motion.audioLevel,
      readHeadLine: st.globalIndex,
      resetKey: st.activeSegKey,
      transitionActive: st.transitionOutgoingIndex != null
    });

    /* 等待占位 + 底部字幕（React 渲染层等价，10Hz 轮询足够） */
    subtitleTick += delta;
    if (subtitleTick >= 0.1) {
      subtitleTick = 0;
      waitingEl.style.opacity = (showText && !st.activeLine && !hasEverActive) ? '0.5' : '0';
      var rawIdx = dioramaFindLineIndexAtTime(committed.lines, now);
      var activeLineRaw = rawIdx >= 0 ? committed.lines[rawIdx] : null;
      var recent = dioramaGetRecentCompletedLine(committed.lines, rawIdx, now);
      renderSubtitle(activeLineRaw, recent, dioramaGetUpcomingLines(committed.lines, rawIdx, 2));
    }

    renderer.render(scene, camera);   /* R3F 每帧自动 render 的等价 */
    rafId = requestAnimationFrame(tick);
  }
  var rafId = requestAnimationFrame(tick);

  /* ---------- 序列机（VisualizerDiorama:163-378 每帧等价） ---------- */
  var machineState = { globalIndex: 0, transitionOutgoingIndex: null, total: 0, linesEpoch: 0, activeSegKey: 'x', activeSegSeed: undefined, activeLine: null };

  function machineTick(now, nowWall) {
    /* 提交闸（:163-195）：新歌待词 / 器乐曲播放确认 / 8s 墙钟保底 */
    var pendingSig = pending.lines.length === 0 ? '' : pending.lines.length + '|' + (pending.lines[0].fullText || '');
    var committedSig = committed.lines.length === 0 ? '' : committed.lines.length + '|' + (committed.lines[0].fullText || '');
    if (pending.seed === committed.seed) {
      if (pendingSig !== committedSig) { committed = { seed: pending.seed, lines: pending.lines }; }
      gateWatch = null;
    } else if (pendingSig !== '') {
      committed = { seed: pending.seed, lines: pending.lines };
      gateWatch = null;
    } else {
      if (!gateWatch) gateWatch = { startWall: nowWall, sawReset: false };
      var t = now;
      var capped = nowWall - gateWatch.startWall >= 8000;
      if (!gateWatch.sawReset && t < 1) gateWatch.sawReset = true;
      if ((gateWatch.sawReset && t >= 2) || capped) {
        committed = { seed: pending.seed, lines: pending.lines };
        gateWatch = null;
      }
      if (pending.seed !== committed.seed) {
        /* 未提交：维持旧场景（闸保持）——机器其余部分继续跑旧段 */
        return updateMachineState(now);
      }
    }
    return updateMachineState(now);
  }

  function updateMachineState(now) {
    var gatedSeed = committed.seed;
    var gatedLines = committed.lines;
    var isInstrumental = gatedLines.length === 0;
    var effectiveLines = isInstrumental ? phantomLinesFor(gatedSeed) : gatedLines;

    /* 器乐曲读头按播放时间推进（:208-247） */
    var instrumentalReadHead = 0;
    if (isInstrumental) {
      if (instrumentalSeed !== gatedSeed) { instrumentalSeed = gatedSeed; }
      instrumentalReadHead = Math.min(
        Math.max(Math.floor(now / DIO_INSTRUMENTAL_SECONDS_PER_FRAME), 0),
        DIO_INSTRUMENTAL_FRAMES - 1
      );
    }

    var rawLineIndex = dioramaFindLineIndexAtTime(gatedLines, now);
    var onInterlude = !isInstrumental && rawLineIndex >= 0 && dioramaIsInterludeLine(gatedLines[rawLineIndex]);
    var effectiveLineIndex = isInstrumental ? instrumentalReadHead : (onInterlude ? -1 : rawLineIndex);

    /* 过渡状态机（:283-378） */
    var outgoingSeg = DIO_activeSegment(seq);
    var outgoingLocal = outgoingSeg ? Math.min(Math.max(lastLocalIndexRef, 0), outgoingSeg.span - 1) : 0;
    var outgoingGlobal = outgoingSeg ? outgoingSeg.globalStart + outgoingLocal : 0;

    var isNewSong = !outgoingSeg || outgoingSeg.seed !== gatedSeed;
    var lyricsChanged = !isNewSong && !!outgoingSeg && outgoingSeg.lines !== effectiveLines;
    var isLoopRestart = !!outgoingSeg && !isNewSong && effectiveLineIndex >= 0 && effectiveLineIndex <= 1
      && lastLocalIndexRef > effectiveLineIndex;

    if (isNewSong) {
      var placementOrigin = { x: 0, y: 0, z: 0 };
      if (outgoingSeg) {
        var anchor = DIO_getFrame(outgoingSeg.frames, outgoingLocal).position;
        var off = DIO_pickTransitionOffset(gatedSeed == null ? 'diorama' : gatedSeed, transitionEpoch + 1);
        placementOrigin = { x: anchor.x + off.x, y: anchor.y + off.y, z: anchor.z + off.z };
      }
      DIO_appendSegment(seq, {
        seed: gatedSeed == null ? 'diorama' : gatedSeed,
        lines: effectiveLines,
        round: 0,
        placementOrigin: placementOrigin
      });
    } else if (lyricsChanged) {
      DIO_updateActiveSegmentLines(seq, effectiveLines);
    }

    var activeSeg = DIO_activeSegment(seq);
    var keyChanged = activeSeg.key !== lastActiveKeyRef;
    var hadPrevious = lastActiveKeyRef !== null;
    if (keyChanged) {
      lastActiveKeyRef = activeSeg.key;
      lastLocalIndexRef = 0;
      hasEverActive = false;
    }
    if (isLoopRestart) {
      lastLocalIndexRef = 0;
      hasEverActive = false;
    }
    var startingTransition = (keyChanged && hadPrevious) || isLoopRestart;
    if (startingTransition) {
      transitionEpoch += 1;
      transition = { epoch: transitionEpoch, outgoingIndex: outgoingGlobal, startedAtMs: lastFrameWall };
    }
    if (effectiveLineIndex >= 0) {
      lastLocalIndexRef = effectiveLineIndex;
      hasEverActive = true;
    }
    var rawLocalIndex = effectiveLineIndex >= 0 ? effectiveLineIndex : lastLocalIndexRef;
    var localPositionIndex = Math.min(Math.max(rawLocalIndex, 0), Math.max(activeSeg.span - 1, 0));
    var globalIndex = activeSeg.globalStart + localPositionIndex;
    var activeOutgoingIndex = startingTransition ? outgoingGlobal : (transition ? transition.outgoingIndex : null);
    var pruneFrom = activeOutgoingIndex != null ? Math.min(globalIndex, activeOutgoingIndex) : globalIndex;
    DIO_pruneSegments(seq, pruneFrom - 4);   /* PRUNE_MARGIN_BEHIND :47 */

    if (transition && nowWall - transition.startedAtMs >= DIO_TRANSITION_DURATION * 1000) {
      transition = null;   /* 飞行结束（:382-386） */
    }

    /* useVisualizerRuntime（runtime.ts:124-157）：字幕层用 raw 行索引 */
    var activeLineRaw = rawLineIndex >= 0 ? gatedLines[rawLineIndex] : null;
    machineState = {
      globalIndex: globalIndex,
      transitionOutgoingIndex: transition ? transition.outgoingIndex : null,
      total: DIO_totalGlobalLines(seq),
      linesEpoch: activeSeg.linesEpoch,
      activeSegKey: activeSeg.key,
      activeSegSeed: activeSeg.seed,
      activeLine: activeLineRaw
    };
    return machineState;
  }

  /* ---------- 桥 API（数据形状换歌/主题/字号） ---------- */
  return {
    destroy: function () {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      particleField.dispose();
      dioramaScene.dispose();
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      if (waitingEl.parentNode) waitingEl.parentNode.removeChild(waitingEl);
      if (subWrap.parentNode) subWrap.parentNode.removeChild(subWrap);
    },
    setSong: function (seed, lines) {
      pending = { seed: seed != null ? seed : 'diorama', lines: lines || [] };
    },
    setTheme: function (nextTheme) {
      theme = nextTheme;
      motion = DioramaResolveMotionParams(theme.animationIntensity);
      dioramaScene.setTheme(theme);
      waitingEl.style.color = theme.secondaryColor || theme.primaryColor;
      subtitleKey = null;
    },
    setFontScale: function (n) {
      lyricsFontScale = n != null ? n : 1;
      subtitleSizes = CM_resolveSubtitleFontSizes(lyricsFontScale);
      dioramaScene.setFontScale(lyricsFontScale);
      subtitleKey = null;
    },
    /* 内省钩子（测试/探针用）：场景树与机器状态快照 */
    __debug: function () {
      var rigDbg = cameraRig.__debug ? cameraRig.__debug() : null;
      return {
        rig: rigDbg,
        sceneChildren: scene.children.length,
        childTypes: scene.children.map(function (c) {
          return {
            type: c.type, ro: c.renderOrder,
            visible: c.visible,
            geomPos: c.geometry && c.geometry.attributes && c.geometry.attributes.position ? c.geometry.attributes.position.count : -1,
            drawRange: c.geometry ? c.geometry.drawRange.count : -1,
            posSample: (function () {
              if (!c.geometry || !c.geometry.attributes || !c.geometry.attributes.position) return null;
              var a = c.geometry.attributes.position.array;
              return [a[0], a[1], a[2], a[3], a[4], a[5]];
            })()
          };
        }),
        cameraPos: camera.position.toArray().map(function (v) { return Math.round(v * 100) / 100; }),
        cameraFov: camera.fov,
        globalIndex: machineState.globalIndex,
        total: machineState.total,
        transition: machineState.transitionOutgoingIndex,
        clusters: dioramaScene.getGeometryInputs().clusters.length,
        corridorSpans: dioramaScene.getGeometryInputs().corridorSpans.length,
        mode: dioramaScene.getGeometryInputs().mode,
        activeLineWidth: dioramaScene.activeLineWidth,
        drawInfo: (function () { var i = renderer.info.render; return { calls: i.calls, points: i.points, triangles: i.triangles }; })(),
        uniformScan: (function () {
          var out = {};
          var m = particleField && particleField.__material ? particleField.__material() : null;
          if (m) {
            for (var k in m.uniforms) {
              var v = m.uniforms[k].value;
              if (typeof v === 'number') out[k] = (v === v && isFinite(v)) ? Math.round(v * 1000) / 1000 : 'NAN_OR_INF';
              else if (v && v.isColor) out[k] = 'color';
              else if (v && v.length !== undefined) out[k] = 'arr:' + v.length;
              else out[k] = typeof v;
            }
          }
          return out;
        })(),
        attrScan: (function () {
          var g = particleField && particleField.__geometry ? particleField.__geometry() : null;
          if (!g) return null;
          var out = {};
          ['position', 'aNormal', 'aAnchor', 'aScale', 'aPhase', 'aStyle', 'aWave'].forEach(function (name) {
            var a = g.attributes[name];
            if (!a) { out[name] = 'MISSING'; return; }
            var bad = 0;
            for (var i = 0; i < a.array.length; i += 1) { var v = a.array[i]; if (!(v === v) || !isFinite(v)) bad += 1; }
            out[name] = a.array.length + ' vals, bad=' + bad;
          });
          return out;
        })(),
        geomPoints: (function () { var g = particleField && particleField.__geometry ? particleField.__geometry() : null; return g ? g.attributes.position.count : -1; })()
      };
    }
  };
}
