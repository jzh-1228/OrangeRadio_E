'use strict';
/* 镜台（diorama）· 原版渲染核心引擎的产物与接线验证
   ----------------------------------------------------------------------------
   覆盖：
   1) 引擎产物可加载：vm 沙箱执行 diorama-engine.js 的 IIFE，
      env.DioramaDioramaEngine 与全部 DIO_* / CM_* 闭包别名注入齐全；
   2) 关键算法（直接调用 env 注出的 Folia 闭包符号，数值级断言）：
      cameraPath（SmoothDamp / winding 路径确定性 / 运镜手法防重复 / 编队
      净空 / hold settle）、dioramaSequencer（全局索引 / 原地重建 / 剪枝），
      dioramaTransition（46 单位偏移 / smootherstep / Bezier 端点），
      dioramaParticleModel（频段谷峰追踪 / 涟漪槽 / 波数上限），
      dioramaGeometry（跨行碰撞剪枝），dioramaTextRaster（字体规格），
      手工宿主纯函数（CJK 逐字拆元 / 权威行索引 / 渐变跟唱能量 / 文本
      生命周期 / 器乐曲幻影行）；
   3) 桥契约：25-diorama.js 可编译、applyDioramaMode/dioramaMode 入口齐全、
      THREE185 等待轮询、歌词形状转换、旧简化实现（圆窗 DOM/canvas 尘埃）
      已删除；
   4) 注册接线：registry 行、index-loader 清单、index.html 引擎 script +
      THREE185 module + #diorama-engine-host、diorama.css 只持容器壳
      （不持旧圆窗动画类）。
   算法参照：folia-major src/components/visualizer/diorama/*（AGPL-3.0，
   见 NOTICE.md）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'public', 'js', 'modules', '10-shell-diorama-engine', 'diorama-engine.js');
const BRIDGE = path.join(ROOT, 'public', 'js', 'modules', '10-shell', '25-diorama.js');
const LOADER = path.join(ROOT, 'public', 'js', 'index-loader.js');
const INDEX = path.join(ROOT, 'public', 'index.html');
const REGISTRY = path.join(ROOT, 'public', 'js', 'modules', '02-visual', '90-visualizer-registry.js');
const CSS = path.join(ROOT, 'public', 'css', 'diorama.css');
const THREE_CORE = path.join(ROOT, 'public', 'vendor', 'three.core.min.js');
const THREE_MODULE = path.join(ROOT, 'public', 'vendor', 'three-0.185.module.min.js');

/* ---------- 1) 引擎产物可加载（vm 沙箱执行，env 注出面） ---------- */
const sandbox = { console, Math, JSON, Object, Array, Number, parseInt, parseFloat, isFinite, RegExp, Date, Intl, Map, Set, Float32Array, Float64Array, Uint8Array, Uint32Array, String, Boolean, Symbol, Promise, Error, TypeError, isNaN };
sandbox.window = sandbox;
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(ENGINE, 'utf8'), { filename: 'diorama-engine.js' }).runInContext(sandbox);
const env = sandbox.window;

assert.equal(typeof env.DioramaDioramaEngine, 'function', 'env.DioramaDioramaEngine 必须由引擎产物注出');
assert.equal(typeof env.DioramaResolveMotionParams, 'function', 'env.DioramaResolveMotionParams 必须注出');
for (const alias of [
  // cameraPath
  'DIO_buildDioramaPath', 'DIO_getFrame', 'DIO_seedUnit_placeholder_skip',
  'DIO_seededUnit', 'DIO_hashSeed', 'DIO_smoothDamp', 'DIO_frameHalfWidth',
  'DIO_resolveDioramaMotionParams', 'DIO_getDioramaTextPlacement', 'DIO_getDioramaShot',
  'DIO_resolveShotOffset', 'DIO_resolveHoldSettle', 'DIO_resolveCameraDrift',
  'DIO_resolveReadHeadTruck', 'DIO_buildFormation',
  // sequencer / transition
  'DIO_createSequencerState', 'DIO_activeSegment', 'DIO_appendSegment',
  'DIO_updateActiveSegmentLines', 'DIO_totalGlobalLines', 'DIO_resolveGlobal', 'DIO_pruneSegments',
  'DIO_pickTransitionOffset', 'DIO_transitionEase', 'DIO_bezierArc', 'DIO_TRANSITION_DURATION',
  // particle 模型与材质
  'DIO_resolveWaveNumberMax', 'DIO_buildCloudGeometryData', 'DIO_buildCorridorGeometryData',
  'DIO_createBandTracker', 'DIO_stepBandTracker', 'DIO_RIPPLE_BANDS', 'DIO_RIPPLE_COUNT',
  'DIO_resolveAudioResponse', 'DIO_resolvePulseTarget', 'DIO_createElasticState',
  'DIO_stepElasticResponse', 'DIO_buildStructuredSurface',
  'DIO_resolveContrastColors', 'DIO_getDisplayedContrastRatio', 'DIO_CORRIDOR_RADIUS',
  // 尘埃 / 关键字 / 栅格
  'DIO_MOTE_WINDOW_LINES', 'DIO_moteSlot', 'DIO_writeMoteLine', 'DIO_extendDioramaFrame',
  'DIO_prepareKeywordMatchers', 'DIO_resolveKeywordUnitColors', 'DIO_RASTER_FONT_PX',
  'DIO_buildFontSpec',
  // 共享歌词闭包
  'CM_buildLineRenderHints', 'CM_getLineRenderEndTime', 'CM_buildLineGraphemeTimeline',
  'CM_splitLyricGraphemes', 'CM_resolveThemeFontStack', 'CM_resolveThemeFontWeight',
  'CM_resolveSubtitleFontSizes', 'CM_prepareWordColorMatchers',
  // 手工宿主纯函数
  'DioramaBuildActiveUnits', 'DioramaFindLineIndexAtTime', 'DioramaResolveGradientEnergy',
  'DioramaResolveTextLife', 'DioramaBuildPhantomLines',
]) {
  if (alias === 'DIO_seedUnit_placeholder_skip') continue; // 占位哨兵，跳过
  assert.ok(env[alias] != null, alias + ' 必须由管线 aliasExports 注出');
}

/* ---------- 2) 关键算法（Folia 闭包原函数，数值级） ---------- */

/* types.ts:883-903 DEFAULT_DIORAMA_TUNING 原值（与原版面板默认一致） */
{
  env.DioramaResolveMotionParams('normal');
  const t = env.DioramaDefaults.tuning;
  assert.equal(t.cameraSpeed, 1);
  assert.equal(t.motionAmount, 1);
  assert.equal(t.audioReactivity, 1);
  assert.equal(t.particleDensity, 576);
  assert.equal(t.particleScale, 1);
  assert.equal(t.particleGlowEnabled, true);
  assert.equal(t.particleGlowIntensity, 0.65);
  assert.equal(t.showParticles, true);
  assert.equal(t.backgroundParticleCircumference, 28);
  assert.equal(t.backgroundParticleRadial, 2);
  assert.equal(t.glowEnabled, true);
  assert.equal(t.glowIntensity, 1);
  assert.equal(t.soulEnabled, true);
  assert.equal(t.soulActiveEnabled, false);
  assert.equal(t.gradientEnabled, false);
  assert.equal(t.keywordColoringEnabled, true);
  /* 有效强度：开关关闭归 0（VisualizerDiorama:444-454） */
  assert.equal(env.DioramaDefaults.glowIntensity, 1);
  assert.equal(env.DioramaDefaults.soulIntensity, 1);
  assert.equal(env.DioramaDefaults.soulActiveEnabled, false);
  assert.equal(env.DioramaDefaults.gradientIntensity, 0);
}

/* cameraPath.ts:164-168 DIORAMA_SUB_MODE_PRESETS（normal/calm 原值） */
{
  const normal = env.DioramaResolveMotionParams('normal');
  assert.deepEqual(
    { moveScale: normal.moveScale, driftScale: normal.driftScale, smoothTime: normal.smoothTime, audioLevel: normal.audioLevel, weaveScale: normal.weaveScale },
    { moveScale: 1, driftScale: 0.62, smoothTime: 0.42, audioLevel: 1, weaveScale: 1 });
  const calm = env.DioramaResolveMotionParams('calm');
  assert.equal(calm.moveScale, 0.6);
  assert.equal(calm.driftScale, 0.4);
  assert.equal(calm.smoothTime, 0.56);
  assert.equal(calm.audioLevel, 0.5);
  assert.equal(calm.weaveScale, 0.5);
}

/* cameraPath.ts:121-137 Unity SmoothDamp（阶跃目标 → 单值有限且向目标收敛） */
{
  const r = env.DIO_smoothDamp(0, 10, 0, 0.42, 1 / 60);
  assert.ok(Number.isFinite(r.value) && Number.isFinite(r.velocity));
  assert.ok(r.value > 0 && r.value < 10, '首帧必须向目标推进且不过冲出界');
  let cur = 0, vel = 0;
  for (let i = 0; i < 240; i += 1) {
    const s = env.DIO_smoothDamp(cur, 10, vel, 0.42, 1 / 60);
    cur = s.value; vel = s.velocity;
  }
  assert.ok(Math.abs(cur - 10) < 0.5, 'SmoothDamp 4s 内必须收敛到目标附近');
}

/* cameraPath.ts:223-254 winding 路径：确定性 + 帧数 + 前进性（forward.z 恒负） */
{
  const a = env.DIO_buildDioramaPath(12, 'song-a');
  const b = env.DIO_buildDioramaPath(12, 'song-a');
  assert.equal(a.length, 12);
  assert.deepEqual(a, b, '同 seed 路径必须逐帧一致（seek 不重随机）');
  for (const f of a) {
    assert.ok(f.forward.z < 0, '路径必须单调前进（forward.z < 0）');
    const len = Math.hypot(f.forward.x, f.forward.y, f.forward.z);
    assert.ok(Math.abs(len - 1) < 1e-6, 'forward 必须是单位向量');
  }
}

/* cameraPath.ts:531-547 运镜手法：确定性 + 相邻三行防重复 */
{
  const lines = [];
  for (let i = 0; i < 40; i += 1) lines.push({ words: [], startTime: i * 3, endTime: i * 3 + 3, fullText: 'l' + i });
  const picks = lines.map((_, i) => env.DIO_getDioramaShot(i, lines, 'seed-x', 'normal'));
  assert.deepEqual(picks, lines.map((_, i) => env.DIO_getDioramaShot(i, lines, 'seed-x', 'normal')), '运镜必须确定性');
  for (let i = 2; i < picks.length; i += 1) {
    assert.ok(picks[i] !== picks[i - 1] || picks[i] !== picks[i - 2], '相邻三行不得两两同运镜（防重复规则）');
  }
  const vocab = new Set(picks);
  assert.ok(vocab.size >= 6, '40 行应展开出充足的运镜词表，实际 ' + vocab.size);
}

/* cameraPath.ts:574-694 resolveShotOffset：pushIn 单调推近 / moveScale 缩放幅值 */
{
  const ctxBase = { progress: 0, wordProgress: 0, hero: 5.2, lift: 0.5, seed: 's', lineIndex: 0, moveScale: 1 };
  const start = env.DIO_resolveShotOffset('pushIn', { ...ctxBase, progress: 0 });
  const end = env.DIO_resolveShotOffset('pushIn', { ...ctxBase, progress: 1 });
  assert.ok(start.back > end.back, 'pushIn 的 back 必须随进行单调减小（推近）');
  assert.equal(end.back, 5.2 + (5.2 * 0.7 - 5.2) * 1, 'e=1 时 back = hero*(1.5-0.8) 的 moveScale 回投原值');
  const half = env.DIO_resolveShotOffset('pushIn', { ...ctxBase, moveScale: 0.5, progress: 1 });
  assert.equal(half.back, 5.2 + (5.2 * 0.7 - 5.2) * 0.5, 'moveScale 只缩放偏离中性位的幅值');
}

/* cameraPath.ts:703-724 resolveHoldSettle：3s 前不动、8s 后归零 */
{
  assert.equal(env.DIO_resolveHoldSettle(0), 1);
  assert.equal(env.DIO_resolveHoldSettle(3), 1);
  assert.ok(env.DIO_resolveHoldSettle(5.5) > 0.2 && env.DIO_resolveHoldSettle(5.5) < 0.8);
  assert.equal(env.DIO_resolveHoldSettle(8), 0);
}

/* cameraPath.ts:870-1022 buildFormation：shot↔编队对应 + 输出形状
   （深度 ≥1 / 轨道净空是 composeLocal 之前的 spec 内部保证，输出只暴露
   世界位 position 与 near/far 层） */
{
  const frame = env.DIO_buildDioramaPath(4, 'seed-f')[0];
  const placement = env.DIO_getDioramaTextPlacement(0, 'seed-f', 1);
  const expectCount = { orbit: 6, pushIn: 4, track: 6, crane: 5, spiral: 7, pendulum: 4, flyby: 6, swell: 6, pullBack: 6, arc: 5, float: 6, glide: 6, hold: 4 };
  for (const [shot, count] of Object.entries(expectCount)) {
    const pieces = env.DIO_buildFormation(0, 'seed-f', shot, frame, placement, 1);
    assert.equal(pieces.length, count, shot + ' 的编队件数必须与源码一致');
    for (const p of pieces) {
      assert.ok(Number.isFinite(p.position.x + p.position.y + p.position.z), '编队件世界位必须有限');
      assert.ok(p.scale > 0 && p.stretchY > 0);
      assert.ok(p.layer === 'near' || p.layer === 'far');
      assert.ok(p.colorSlot === 0 || p.colorSlot === 1);
      assert.ok(typeof p.upright === 'boolean');
    }
  }
}

/* dioramaGeometry.ts:68-86 跨行碰撞剪枝（同词距 span=2、异行碰撞剔除、同行全保） */
{
  const mk = (line, x, kind) => ({ kind, position: { x, y: 0, z: 0 }, scale: 1, stretchY: 1, upright: false, spinSpeed: 0, colorSlot: 0, layer: 'near', key: line + '-' + x + '-' + kind, sourceLine: line, particleSeed: 'p' + line, role: 'formation' });
  const vis = { enabled: true, mode: 'clouds', strands: true, blobs: true, ribbons: true, rings: true };
  const shapes = [mk(0, 0, 'sphere'), mk(1, 0.5, 'sphere'), mk(3, 1, 'sphere'), mk(3, 20, 'sphere')];
  const kept = env.DIO_selectVisibleDioramaClusters(shapes, vis);
  assert.equal(kept.length, 2, '跨 2 行内的异行碰撞须剔除（保留 0 号与远处 3 号）');
  assert.equal(kept[0].sourceLine, 0);
  assert.equal(kept[1].sourceLine, 3);
  assert.equal(env.DIO_selectVisibleDioramaClusters(shapes, { ...vis, enabled: false }).length, 0, '总开关关闭必须全清');
  assert.equal(env.DIO_selectVisibleDioramaClusters(shapes, { ...vis, mode: 'corridor' }).length, 0, 'corridor 模式无云簇');
}

/* dioramaSequencer.ts：全局索引 / 原地重建 / 剪枝 */
{
  const seq = env.DIO_createSequencerState();
  const l1 = [{ words: [], startTime: 0, endTime: 2, fullText: 'a' }, { words: [], startTime: 2, endTime: 4, fullText: 'b' }];
  const s1 = env.DIO_appendSegment(seq, { seed: 's1', lines: l1, round: 0, placementOrigin: { x: 0, y: 0, z: 0 } });
  assert.equal(s1.globalStart, 0);
  assert.equal(s1.span, 2);
  const l2 = [{ words: [], startTime: 0, endTime: 3, fullText: 'c' }];
  const off = env.DIO_pickTransitionOffset('s2', 1);
  assert.ok(Math.abs(Math.hypot(off.x, off.y, off.z) - 46) < 1e-6, '过渡偏移模长必须为 TRANSITION_DISTANCE=46');
  const s2 = env.DIO_appendSegment(seq, { seed: 's2', lines: l2, round: 0, placementOrigin: { x: off.x, y: off.y, z: off.z } });
  assert.equal(s2.globalStart, 2);
  assert.equal(env.DIO_totalGlobalLines(seq), 3);
  assert.equal(env.DIO_resolveGlobal(seq, 2).segment.seed, 's2');
  assert.equal(env.DIO_resolveGlobal(seq, 1).segment.seed, 's1');
  const epochBefore = s2.linesEpoch;
  assert.equal(epochBefore, 0);
  /* 原地重建只作用于活动段（dioramaSequencer.ts:112-122）：同 key 同 globalStart，
     行数变化时 nextGlobalStart 随 span 差调整，linesEpoch 自增 */
  const l2b = [{ words: [], startTime: 0, endTime: 3, fullText: 'c2' }, { words: [], startTime: 3, endTime: 5, fullText: 'c3' }];
  env.DIO_updateActiveSegmentLines(seq, l2b);
  const active = env.DIO_activeSegment(seq);
  assert.equal(active.seed, 's2', '活动段身份不变');
  assert.equal(active.key, 's2#0', 'key 保持 (seed,round)——原地重建不换走廊');
  assert.equal(active.linesEpoch, 1, '原地重建必须 linesEpoch+1');
  assert.equal(active.lines[0].fullText, 'c2');
  assert.equal(active.span, 2, 'span 随新行数更新');
  assert.equal(env.DIO_totalGlobalLines(seq), 4, 'nextGlobalStart 按 span 差推进（原 3 + 1）');
  assert.equal(env.DIO_resolveGlobal(seq, 1).segment.seed, 's1', '前段不受影响');
  env.DIO_pruneSegments(seq, 3); // 保底：全部落后于 3 的段剪掉
  assert.equal(env.DIO_activeSegment(seq).seed, 's2', '活动段永不被剪');
}

/* dioramaTransition.ts：smootherstep + Bezier 端点 */
{
  assert.equal(env.DIO_transitionEase(0), 0);
  assert.equal(env.DIO_transitionEase(1), 1);
  assert.ok(env.DIO_transitionEase(0.5) > 0.4 && env.DIO_transitionEase(0.5) < 0.6);
  const from = { x: 0, y: 0, z: 0 }, to = { x: 40, y: 0, z: 0 };
  const ctl = { x: 20, y: 10, z: 0 };
  const p0 = env.DIO_bezierArc(from, ctl, to, 0);
  const p1 = env.DIO_bezierArc(from, ctl, to, 1);
  assert.deepEqual([p0.x, p0.y], [0, 0]);
  assert.deepEqual([p1.x, p1.y], [40, 0]);
  const mid = env.DIO_bezierArc(from, ctl, to, 0.5);
  assert.ok(mid.y > 0, '弧线中段必须抬高');
}

/* dioramaParticleModel.ts：谷峰频段追踪（恒定节拍常数化 + onset 迟滞单发） */
{
  const tr = env.DIO_createBandTracker();
  let onsets = 0, last = null;
  for (let i = 0; i < 600; i += 1) {
    const level = (i % 30) < 6 ? 0.9 : 0.1; // 2Hz 节拍
    const sig = env.DIO_stepBandTracker(tr, level, 1 / 60);
    if (sig.onset) onsets += 1;
    last = sig;
  }
  assert.ok(onsets >= 15, '60s 内 2Hz 节拍至少触发 15 次 onset（不因 EMA 适应而失明），实际 ' + onsets);
  assert.ok(last.sustained >= 0 && last.sustained <= 1);
  const resp = env.DIO_resolveAudioResponse(
    { transient: 1, sustained: 1, onset: false },
    { transient: 1, sustained: 1, onset: false });
  assert.ok(resp.flowSpeed <= 1.55);
  assert.ok(resp.clusterPulse > 1 && resp.clusterPulse <= 1.44, 'beat 脉冲上限 DIORAMA_PARTICLE_AUDIO_SCALE_MAX=1.44');
  const corr = env.DIO_resolvePulseTarget(1.14, 1, true);
  assert.ok(Math.abs(corr - 1 - 0.14 * env.DIO_CORRIDOR_PULSE_SHARE) < 1e-9, '走廊只保留 12% 全身脉冲');
}

/* dioramaParticleModel.ts + Surfaces：云格点预算 / 焊接壳 / 波数上限 */
{
  const frame = env.DIO_buildDioramaPath(2, 'seed-g')[0];
  const placement = env.DIO_getDioramaTextPlacement(0, 'seed-g', 1);
  const pieces = env.DIO_buildFormation(0, 'seed-g', 'hold', frame, placement, 1)
    .map((p, slot) => ({ ...p, key: '0-' + slot, sourceLine: 0, particleSeed: 'g:0:' + slot + ':' + p.kind, role: 'formation' }));
  const data = env.DIO_buildCloudGeometryData(pieces, 96);
  assert.ok(data.pointCount > 0 && data.pointCount <= env.DIO_MAX_PARTICLE_POINTS, "云格点数必须在预算内");
  assert.ok(data.spacing > 0);
  assert.ok(env.DIO_resolveWaveNumberMax(data.spacing) > 0);
  // 焊接壳：box 表面点在 ±BOX_HALF 之外不出界
  const box = env.DIO_buildStructuredSurface('box', 96, 1);
  assert.ok(box.count > 0);
  for (let i = 0; i < box.count; i += 7) {
    const x = box.positions[i * 3], y = box.positions[i * 3 + 1], z = box.positions[i * 3 + 2];
    assert.ok(Math.abs(x) <= 0.551 && Math.abs(y) <= 0.551 && Math.abs(z) <= 0.551, 'box 壳点不得越出 BOX_HALF');
  }
  const torus = env.DIO_buildStructuredSurface('torus', 96, 1);
  assert.ok(torus.count > 0 && torus.radius > 0.5 && torus.radius < 0.9);
}

/* dioramaParticleCorridor.ts：走廊窗（跨段延展 + pathStart 绝对坐标） */
{
  const seq = env.DIO_createSequencerState();
  const lines = [];
  for (let i = 0; i < 6; i += 1) lines.push({ words: [], startTime: i, endTime: i + 1, fullText: 'l' + i });
  env.DIO_appendSegment(seq, { seed: 's', lines, round: 0, placementOrigin: { x: 0, y: 0, z: 0 } });
  const spans = env.DIO_buildCorridorWindow(seq, 1, 2, 2);
  assert.equal(spans.length, 5);
  assert.deepEqual(Array.from(spans, (s) => s.pathStart), [-1, 0, 1, 2, 3], '窗跨段端点按直线延展（frameAt 延拓）');
  spans.forEach((s) => assert.ok(s.enabled));
}

/* dioramaMoteField.ts：环形槽 + 写入确定性 */
{
  assert.equal(env.DIO_MOTE_WINDOW_LINES, 8);
  assert.equal(env.DIO_moteSlot(0), 0);
  assert.equal(env.DIO_moteSlot(8), 0);
  assert.equal(env.DIO_moteSlot(-1), 7);
  const frame = env.DIO_buildDioramaPath(2, 'seed-m')[0];
  const bufA = new Float32Array(env.DIO_MOTE_WINDOW_LINES * 4 * 2 * 3);
  const bufB = new Float32Array(bufA.length);
  env.DIO_writeMoteLine(bufA, frame, 3, 4, 2, 'seed-m');
  env.DIO_writeMoteLine(bufB, frame, 3, 4, 2, 'seed-m');
  assert.deepEqual(bufA, bufB, '同一 (seed,line) 的尘埃必须逐字节一致（循环重入不重排）');
  let nonzero = 0;
  for (const v of bufA) if (v !== 0) nonzero += 1;
  assert.ok(nonzero > 0, '尘埃写入必须落点');
}

/* dioramaTextRaster.ts：字体规格（量宽需 canvas，Node 沙箱只验字符串） */
{
  assert.equal(env.DIO_buildFontSpec('"A", "B", serif', 700), '700 128px "A", "B", serif');
  assert.equal(env.DIO_RASTER_FONT_PX, 128);
}

/* 手工宿主纯函数：DioramaScene.tsx:658-701 的 CJK 逐字拆元 */
{
  const line = {
    words: [
      { text: '橘色的', startTime: 10, endTime: 10.9 },
      { text: '光', startTime: 10.9, endTime: 11.4 },
      { text: 'of', startTime: 11.4, endTime: 11.7 },
      { text: 'course', startTime: 11.7, endTime: 12.3 },
    ],
    startTime: 10, endTime: 12.3, fullText: '橘色的光of course',
  };
  const timeline = env.CM_buildLineGraphemeTimeline(line);
  const units = Array.from(env.DioramaBuildActiveUnits(line, timeline));
  // CJK 逐字一元（橘/色/的/光），拉丁同词并一元（of / course）
  assert.deepEqual(units.map((u) => u.text), ['橘', '色', '的', '光', 'of', 'course']);
  assert.equal(units[0].charStart, 0);
  assert.equal(units[0].charEnd, 1);
  assert.equal(units[3].text, '光');
  assert.equal(units[3].startTime, 10.9);
  assert.equal(units[3].endTime, 11.4, '「光」的元结束时间来自字素时间线');
  /* 空白按源码语义永不进元（advance 经前缀测量保留）；拉丁元的码元区间必须精确
     fullText = '橘色的光of course'：橘(0)色(1)的(2)光(3)o(4)f(5)␣(6)c(7)...e(12) */
  assert.equal(units[4].text, 'of');
  assert.equal(units[4].charStart, 4);
  assert.equal(units[4].charEnd, 6);
  assert.equal(units[5].text, 'course');
  assert.equal(units[5].charStart, 7, '「course」跳过空格码元（空白不入元）');
  assert.equal(units[5].charEnd, 13);
}

/* 手工宿主纯函数：appPlaybackHelpers.ts:21 权威行索引语义 */
{
  const lines = [
    { startTime: 2, endTime: 4, renderHints: { renderEndTime: 4.3 }, words: [] },
    { startTime: 5, endTime: 7, words: [] },
  ];
  assert.equal(env.DioramaFindLineIndexAtTime(lines, 3), 0);
  assert.equal(env.DioramaFindLineIndexAtTime(lines, 4.2), 0, 'renderEndTime 内仍算当前行');
  assert.equal(env.DioramaFindLineIndexAtTime(lines, 4.4), -1, 'renderEndTime 后回落 -1（间隙粘住由宿主完成）');
  assert.equal(env.DioramaFindLineIndexAtTime(lines, 6), 1);
  assert.equal(env.DioramaFindLineIndexAtTime(lines, 1), -1, '首行开始前为 -1');
}

/* 手工宿主纯函数：resolveGradientEnergy（DioramaScene.tsx:250-262） */
{
  const unit = { startTime: 0, endTime: 1 };
  assert.equal(env.DioramaResolveGradientEnergy(-1, unit), 0, '唱前为 0');
  assert.equal(env.DioramaResolveGradientEnergy(0.5, unit), 0.5, '唱中线性推进的 smoothstep 中点');
  assert.equal(env.DioramaResolveGradientEnergy(1.1, unit), 1, '结束后 HOLD 0.35s 内保持 1');
  assert.equal(env.DioramaResolveGradientEnergy(3.15, unit), 0, 'HOLD+TRAIL(1.8s) 后归零');
}

/* 手工宿主纯函数：resolveTextLife（DioramaScene.tsx:309-313 两端生命周期） */
{
  assert.equal(env.DioramaResolveTextLife(10), 1, '中段全亮');
  assert.equal(env.DioramaResolveTextLife(0.5), 0, '贴镜头熔解');
  assert.equal(env.DioramaResolveTextLife(45), 0, '远霾之外为 0');
  assert.ok(env.DioramaResolveTextLife(2.5) > 0 && env.DioramaResolveTextLife(1.2) < 1, '近端平滑过渡');
}

/* 手工宿主纯函数：器乐曲幻影行（VisualizerDiorama:70-88） */
{
  const phantom = env.DioramaBuildPhantomLines();
  assert.equal(phantom.length, 96);
  assert.equal(phantom[0].startTime, 0);
  assert.equal(phantom[1].startTime, 5);
  assert.equal(phantom[0].fullText, '', '幻影行永不渲染文字');
  assert.equal(phantom[2].isChorus, false);
  assert.equal(phantom[10].isChorus, true, 'block%3===2 的行是副歌');
}

/* ---------- 3) 桥契约 ---------- */
{
  const src = fs.readFileSync(BRIDGE, 'utf8');
  new Function(src); // 语法可编译
  for (const token of [
    'applyDioramaMode', 'dioramaMode', 'DIORAMA_STORE_KEY', 'dioramaToLines',
    'dioramaBands', 'dioramaTimeMV', 'THREE185', 'diorama-engine-host',
    'getAdjustedLyricPlaybackTime', 'exitOtherVisualizerOverlays', 'setSong',
  ]) {
    assert.ok(src.includes(token), '桥必须包含 ' + token);
  }
  /* 数据形状：构建的行必须带 fullText/startTime/endTime/words[{startTime,endTime}] */
  assert.ok(/fullText:\s*String\(l\.text \|\| ''\)/.test(src), '行转换必须产出 Folia fullText 形状');
  assert.ok(/startTime:\s*wStart/.test(src), '词转换必须产出 startTime/endTime');
  /* 旧简化实现不得残留（圆窗/卡堆/柔光字 DOM 双主路径） */
  for (const gone of ['diorama-window-img', 'diorama-stack', 'diorama-line-main', 'dioramaBuildMotes', 'is-chorus-glow']) {
    assert.ok(!src.includes(gone), '旧简化实现符号必须已删除：' + gone);
  }
}

/* ---------- 4) 注册接线 ---------- */
{
  const registry = fs.readFileSync(REGISTRY, 'utf8');
  assert.ok(/id:\s*'diorama'.*stateVar:\s*'dioramaMode'.*applyFn:\s*'applyDioramaMode'/.test(registry.replace(/\n/g, ' ')),
    'registry 必须有 diorama 行（stateVar/applyFn 不变更）');
  const loader = fs.readFileSync(LOADER, 'utf8');
  assert.ok(loader.includes('10-shell/25-diorama.js'), 'index-loader 必须加载桥');
  const index = fs.readFileSync(INDEX, 'utf8');
  assert.ok(index.includes('js/modules/10-shell-diorama-engine/diorama-engine.js'), 'index.html 必须静态加载引擎产物');
  assert.ok(index.includes('three-0.185.module.min.js'), 'index.html 必须以 ES module 挂 THREE185');
  assert.ok(index.includes('id="diorama-engine-host"'), 'index.html 必须有引擎宿主');
  assert.ok(!index.includes('diorama-window-img'), '旧圆窗 DOM 必须已删除');
  assert.ok(fs.existsSync(THREE_CORE), 'three 0.185 主模块依赖 three.core.min.js，必须存在于 vendor');
  assert.ok(fs.existsSync(THREE_MODULE));
  const css = fs.readFileSync(CSS, 'utf8');
  for (const gone of ['dioramaBreath', 'diorama-window', 'diorama-stack', 'diorama-line', 'diorama-motes', 'is-chorus-glow']) {
    assert.ok(!css.includes(gone), 'css 不得再持旧圆窗动画类（引擎单主路径）：' + gone);
  }
  assert.ok(css.includes('#diorama-engine-host'), 'css 必须只持容器壳 + 宿主');
}

console.log('diorama.test.js: 全部断言通过');
