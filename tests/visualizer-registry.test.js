'use strict';
/* 视觉模式注册表 + 背景注册表 + 信号对象：互斥收敛与信号协议的纯逻辑验证。
   覆盖层 apply 经 window 全局延迟解析（模块顶层 var 挂 window），沙箱模拟之。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const base = path.join(__dirname, '..', 'public', 'js', 'modules');
const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  setTimeout, clearTimeout, Promise, Map, Set, Math, JSON, Object, Array, Uint8Array,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['00-state/12-motion-signals.js', '02-visual/90-visualizer-registry.js', '02-visual/92-background-registry.js']) {
  vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), sandbox, { filename: file });
}

/* ---------- 前景注册表 ---------- */
{
  assert.equal(JSON.stringify(sandbox.listVisualizerOverlayModes().map((m) => m.id)),
    JSON.stringify(['film-radio', 'graffiti', 'aurora', 'rainy']));
  // window 全局布尔 → 激活判定
  sandbox.filmRadioMode = true;
  assert.equal(sandbox.activeVisualizerOverlay().id, 'film-radio');
  assert.equal(sandbox.overlayModeIsActive(sandbox.getVisualizerOverlayMode('film-radio')), true);
  assert.equal(sandbox.overlayModeIsActive(sandbox.getVisualizerOverlayMode('rainy')), false);
  sandbox.filmRadioMode = false;
  assert.equal(sandbox.activeVisualizerOverlay(), null);

  // exitAll：激活者被 apply(false, {save:true})，未激活者不动
  const calls = [];
  sandbox.graffitiMode = true;
  sandbox.rainyMode = false;
  sandbox.applyGraffitiMode = (on, opts) => calls.push(['graffiti', on, opts.save]);
  sandbox.applyRainyMode = (on, opts) => calls.push(['rainy', on, opts.save]);
  sandbox.exitAllVisualizerOverlays({ save: true });
  assert.equal(JSON.stringify(calls), JSON.stringify([['graffiti', false, true]]));

  // exitOther：跳过 selfId
  calls.length = 0;
  sandbox.filmRadioMode = true;
  sandbox.graffitiMode = true;
  sandbox.applyFilmRadioMode = (on, opts) => calls.push(['film-radio', on]);
  sandbox.exitOtherVisualizerOverlays('graffiti', { save: true });
  assert.equal(JSON.stringify(calls.map((c) => c[0])), JSON.stringify(['film-radio']));

  // 动态注册新覆盖层 = 清单一行
  sandbox.filmRadioMode = false;
  sandbox.graffitiMode = false;
  sandbox.registerVisualizerOverlayMode({ id: 'test-mode', label: '测试', stateVar: 'testMode', applyFn: 'applyTestMode', order: 99 });
  sandbox.testMode = true;
  assert.equal(sandbox.activeVisualizerOverlay().id, 'test-mode');
}

/* ---------- 背景注册表 ---------- */
{
  const modes = sandbox.listVisualizerBackgrounds();
  assert.ok(modes.length >= 3);
  assert.equal(JSON.stringify(modes.map((m) => m.id)), JSON.stringify(['ambient', 'star-river', 'album-blur']));
  const ctx = sandbox.visualizerBackgroundContext();
  // 正交契约：背景上下文不包含歌词行与前景 tuning
  for (const forbidden of ['lines', 'tuning', 'preset']) {
    assert.ok(!(forbidden in ctx), 'background context must not carry ' + forbidden);
  }
  assert.ok('coverUrl' in ctx && 'audioPower' in ctx && 'bands' in ctx);
}

/* ---------- 信号对象 ---------- */
{
  assert.equal(sandbox.motionSignalGet('currentTime'), 0);
  let observed = [];
  const unsub = sandbox.motionSignalSubscribe('audioPower', (v) => observed.push(v));
  sandbox.motionSignalSet('audioPower', 0.5);
  sandbox.motionSignalSet('audioPower', 0.9);
  sandbox.motionSignalSet('audioPower', 0.9); // 同值不重复唤醒
  assert.equal(JSON.stringify(observed), JSON.stringify([0.5, 0.9]));
  assert.equal(sandbox.motionSignalGet('audioPower'), 0.9);
  unsub();
  sandbox.motionSignalSet('audioPower', 0.1);
  assert.equal(JSON.stringify(observed), JSON.stringify([0.5, 0.9]));
  console.log('OK visualizer-registry');
}
