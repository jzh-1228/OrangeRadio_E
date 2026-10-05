'use strict';
/* Automix 引擎移植保真冒烟：vm 沙箱按加载顺序拼接 15-automix/，验证
   纯函数层的可加载性与核心行为（测速/规划/deckClock/交叉曲线）。
   Web Audio 层（crossfadeGraph/deckAnalyser）只验证可加载与工厂函数存在。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..', 'public', 'js', 'modules', '15-automix');
const loadOrder = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();

// 20-blob-url-ledger 依赖 document/audio DOM，单独桩掉再加载
const sandbox = {
  console: { log() {}, warn() {}, error() {}, info() {} },
  setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
  Promise, Map, Set, WeakMap, WeakSet, Math, JSON, String, Number, Boolean, Array, Object, Error, DOMException,
  Float32Array, Uint8Array, Uint8ClampedArray, ArrayBuffer, DataView,
  performance: { now: () => Date.now() },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { href: 'http://localhost/' },
  document: {
    readyState: 'complete',
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ style: {}, audio: null }),
    addEventListener() {},
  },
  navigator: { hardwareConcurrency: 8 },
  fetch: async () => { throw new Error('no network in sandbox'); },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of loadOrder) {
  vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), sandbox, { filename: file });
}
// vm 的全局词法声明（const/let）不挂到 sandbox 对象（浏览器多 <script> 共享词法环境，
// 线上无此问题）；沙箱内用 eval 取词法符号。
vm.runInContext('globalThis.__sym = (n) => eval(n);', sandbox);
const g = new Proxy({}, { get: (_, name) => sandbox.__sym(String(name)) });

/* ---------- 模块加载与关键符号存在性 ---------- */
{
  for (const name of [
    'YIELD_BUDGET_MS', 'estimateTempo', 'estimateDownbeat', 'fft', 'kWeight', 'buildCrossfadeCurves',
    'analyseTrack', 'measureEdges',
    'barGrid', 'quantiseToMusic', 'settledBpm',
    'chooseTransitionStyle', 'planTransition', 'planCrossfade', 'planForMode', 'hardCut', 'endsOf',
    'createDeckClock', 'createDeckAnalyser', 'applyTempoBend', 'resetTempoBend',
    'connectAutomixDeck', 'scheduleCrossfade', 'scheduleBandBlend',
    'createAutomixSession', 'ensureTrackProfile', 'setAnalysisScope', 'recordPlayedTail',
    'canSeparateStems', 'canRunBeatThis', 'retireBlobUrl',
    'STEM_NAMES', 'planStemHandover', 'planExpansion', 'renderExpansion',
  ]) {
    assert.ok(typeof g[name] !== 'undefined', `missing symbol: ${name}`);
  }
  assert.equal(g.YIELD_BUDGET_MS, 8);
  assert.equal(g.AUTOMIX_MAX_OVERLAP_SEC, 25);
  assert.equal(g.canRunBeatThis(), false, '2a 阶段无模型，走自研估计器');
  assert.equal(g.canSeparateStems(), false);
}

/* ---------- estimateTempo：合成 120 BPM 点击轨（谱通量包络输入） ---------- */
{
  const sr = 22050, bpm = 120, beat = (60 / bpm) * sr;
  const n = sr * 30;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const phase = i % beat;
    mono[i] = phase < sr * 0.01 ? Math.sin((phase / (sr * 0.01)) * Math.PI) * 0.8 : 0;
  }
  // 用整段 RMS 包络近似谱通量：每 hop 一帧，点击处能量陡升
  const hop = 512;
  const env = [];
  for (let off = 0; off + hop <= n; off += hop) {
    let sum = 0;
    for (let i = off; i < off + hop; i++) sum += mono[i] * mono[i];
    env.push(Math.sqrt(sum / hop));
  }
  const hopSec = hop / sr;
  const est = g.estimateTempo(env, hopSec);
  assert.ok(est && est.bpm, 'tempo estimate exists');
  assert.ok(Math.abs(est.bpm - bpm) < 3, `120 BPM click track → ${est.bpm.toFixed(1)} BPM`);
  assert.ok(est.confidence >= 0, 'confidence present');
}

/* ---------- analyseTrack：合成轨的段落与响度存在 ---------- */
{
  (async () => {
    const sr = 22050;
    const n = sr * 12;
    const mid = new Float32Array(n);
    for (let i = 0; i < n; i++) mid[i] = Math.sin(i / 20) * 0.3 * (0.5 + 0.5 * Math.sin(i / sr));
    const profile = await g.analyseTrack(mid, sr, { gridless: true });
    assert.ok(profile, 'profile produced');
    assert.ok(profile.loudness < 0 && profile.loudness > -40, `LUFS in range: ${profile.loudness.toFixed(1)}`);
    assert.ok(Number.isFinite(profile.leadIn));
    assert.equal(typeof profile.sections.length, 'number');
  })().catch((err) => { console.error(err); process.exit(1); });
}

/* ---------- planForMode：交叉淡化规划器（无证据路径） ---------- */
{
  const from = { duration: 200, lines: null, profile: null };
  const to = { duration: 180, lines: null, profile: null };
  const plan = g.planForMode({ mode: 'crossfade', crossfadeMaxSec: 4, performance: false }, from, to);
  assert.equal(plan.kind, 'fade');
  assert.ok(plan.overlap > 0 && plan.overlap <= 4.5, `crossfade overlap ${plan.overlap}`);
  // automix 模式无证据 → 回落 crossfade 并在 reason 说明
  const planAuto = g.planForMode({ mode: 'automix', crossfadeMaxSec: 4, performance: false }, from, to);
  assert.ok(/crossfade/i.test(planAuto.reason) || planAuto.style === 'plainBlend', `fallback reason: ${planAuto.reason}`);
}

/* ---------- planTransition：带证据的两曲决策 ---------- */
{
  const profileA = { partial: false, duration: 200, bpm: 128, outroBpm: 128, leadIn: 0.5, leadOut: 2, bodyOut: 3, startsHot: false, endsHot: false, loudness: -9, headDb: -9, tailDb: -10, introTone: [0.3, 0.4, 0.3], outroTone: [0.3, 0.4, 0.3], sections: [30], sectionStart: 30, vocalStart: 5, beatOffset: 0.1, downbeatOffset: 0.1, headDownbeatOffset: 0.1, beatsPerBar: 4, key: 0, major: true, keyConfidence: 0.8, introKey: null, outroKey: null, gridless: true, version: 9 };
  const profileB = JSON.parse(JSON.stringify(profileA));
  profileB.bpm = 130; profileB.outroBpm = 130; profileB.key = 7;
  const linesA = [];
  for (let i = 0; i < 40; i++) linesA.push({ startTime: i * 4.5, endTime: i * 4.5 + 4, fullText: 'la ' + i });
  const plan = g.planTransition(
    { duration: 200, lines: linesA, profile: profileA },
    { duration: 190, lines: null, profile: profileB },
    128, 180
  );
  assert.ok(plan, 'plan produced');
  assert.ok(plan.overlap > 0, `overlap ${plan.overlap}`);
  assert.ok(plan.outStart > 0 && plan.outStart < 200);
  assert.ok(['beatCut', 'bassSwap', 'tailRide', 'plainBlend'].includes(plan.style), `style ${plan.style}`);
  assert.ok(typeof plan.reason === 'string' && plan.reason.length > 0, 'reason is non-empty');
  assert.ok(plan.overlap <= g.AUTOMIX_MAX_OVERLAP_SEC);
}

/* ---------- deckClock：阶梯拟合成直线 ---------- */
{
  const clock = g.createDeckClock();
  let ctxTime = 100;
  let mediaTime = 0;
  for (let step = 0; step < 100; step++) {
    clock.sample(mediaTime, ctxTime);
    ctxTime += 0.25;
    mediaTime += 0.25;
  }
  const pos = clock.positionAt(ctxTime);
  assert.ok(Math.abs(pos - 25) < 0.1, `deckClock position ${pos} ≈ 25`);
  assert.ok(Math.abs(clock.rate() - 1) < 0.01, `deckClock rate ≈ 1`);
}

/* ---------- buildCrossfadeCurves：together 平台段功率守恒 ---------- */
{
  const curves = g.buildCrossfadeCurves(6, 0.5, 0.3);
  assert.equal(curves.out.length, curves.in.length);
  for (let i = 0; i < curves.out.length; i++) {
    const power = curves.out[i] * curves.out[i] + curves.in[i] * curves.in[i];
    assert.ok(power < 1.05, `equal-power at ${i}: ${power.toFixed(3)}`);
  }
}

/* ---------- retireBlobUrl 台账 ---------- */
{
  const elA = { src: 'blob:a', currentSrc: 'blob:a' };
  g.document.querySelectorAll = () => [elA];
  g.retireBlobUrl('blob:b'); // a 在播、b 交出 → a 保留 b 释放
  assert.equal(elA.src, 'blob:a');
  g.document.querySelectorAll = () => [];
}

console.log('OK automix-engine (loaded', loadOrder.length, 'modules)');
