'use strict';
/* 视觉模式注册表 + 背景注册表 + 信号对象：互斥收敛与信号协议的纯逻辑验证。
   覆盖层 apply 经 window 全局延迟解析（模块顶层 var 挂 window），沙箱模拟之。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const base = path.join(__dirname, '..', 'public', 'js', 'modules');
const overlayEls = {};   /* fake DOM：data-leaving 状态 + 内联样式记录（协调器用例） */
function makeFakeOverlayEl() {
  const attrs = new Set();
  /* Proxy 拦截：协调器混用 el.style.x = v 直赋与 setProperty/removeProperty，
     统一落入同一存储供断言读取 */
  const camel = (n) => String(n).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const style = new Proxy({}, {
    get(t, k) {
      if (k === 'setProperty') return (n, v) => { t[camel(n)] = v; };
      if (k === 'removeProperty') return (n) => { delete t[camel(n)]; };
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return {
    style, props: style, attrs,
    hasAttribute(n) { return attrs.has(n); },
    setAttribute(n) { attrs.add(n); },
    removeAttribute(n) { attrs.delete(n); },
    offsetWidth: 0,
  };
}
const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  /* setTimeout 保留宿主实现（信号/恢复用例依赖）；setInterval 用 no-op，
     防 node --test 等待协调器的常驻轮询定时器 */
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  Promise, Map, Set, Math, JSON, Object, Array, Uint8Array,
  getComputedStyle: () => ({ zIndex: '5' }),
  document: {
    getElementById(id) {
      if (!/-overlay$/.test(id)) return null;
      if (!overlayEls[id]) overlayEls[id] = makeFakeOverlayEl();
      return overlayEls[id];
    },
    createElement: () => ({ text: '' }),
    head: { appendChild() {} },
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['00-state/12-motion-signals.js', '02-visual/90-visualizer-registry.js', '02-visual/91-overlay-transition.js', '02-visual/92-background-registry.js']) {
  vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), sandbox, { filename: file });
}

/* ---------- 注册表扩展协议（icon/desc/cardClass/lazy/trimCache） ---------- */
{
  const modes = sandbox.listVisualizerOverlayModes();
  // 全部模式带卡片元数据（通用 builder 依赖 icon/desc，缺失会渲染空卡片）
  for (const m of modes) {
    assert.ok(m.icon && m.icon.indexOf('<svg') === 0, m.id + ' entry must carry svg icon');
    assert.ok(m.desc, m.id + ' entry must carry desc');
  }
  // 容器 id 约定：<id>-overlay 必须静态预埋在 index.html
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const m of modes) {
    assert.ok(indexHtml.includes('id="' + m.id + '-overlay"'), 'index.html must embed #' + m.id + '-overlay');
  }
  // lazy 试点协议：storeKey/src 齐备且 src 文件存在
  for (const m of modes.filter((x) => x.lazy)) {
    assert.ok(m.storeKey, m.id + ' lazy entry must carry storeKey');
    assert.ok(Array.isArray(m.src) && m.src.length > 0, m.id + ' lazy entry must carry src');
    for (const src of m.src) {
      assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', src)), 'lazy src must exist: ' + src);
    }
  }
}

/* ---------- 前景注册表 ---------- */
{
  // 基础四模式顺序稳定（order 90~93）；后续移植模式（still/claddagh/tilt/fume/
  // classic/pendolo/partita/cadenza...）按 order 追加，不写死全等列表以免每加
  // 一个模式就打破本测试——只验证前缀顺序 + 已注册成员存在。
  const overlayIds = sandbox.listVisualizerOverlayModes().map((m) => m.id);
  assert.equal(JSON.stringify(overlayIds.slice(0, 4)),
    JSON.stringify(['film-radio', 'graffiti', 'aurora', 'rainy']));
  for (const known of ['partita', 'pendolo', 'classic']) {
    assert.ok(overlayIds.includes(known), 'overlay registry should include ' + known);
  }
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

/* ---------- toggleVisualizerOverlay 通用入口 ---------- */
{
  const toggled = [];
  sandbox.applyStillMode = (on, opts) => { sandbox.stillMode = !!on; toggled.push(['still', on, opts.save, opts.toast]); };
  sandbox.stillMode = false;
  sandbox.toggleVisualizerOverlay('still');
  assert.equal(JSON.stringify(toggled), JSON.stringify([['still', true, true, true]]));
  sandbox.toggleVisualizerOverlay('still');
  assert.equal(JSON.stringify(toggled[1]), JSON.stringify(['still', false, true, true]));
  // 未知 id 静默忽略
  sandbox.toggleVisualizerOverlay('no-such-mode');
  assert.equal(toggled.length, 2);
}

/* ---------- 转场协调器（91-overlay-transition） ---------- */
(async () => {
  // eco 边沿：进入压 eco（记原档），退出恢复——幂等
  sandbox.fx = { performanceQuality: 'ultra' };
  sandbox.applyOverlayEco(true);
  assert.equal(sandbox.fx.performanceQuality, 'eco');
  sandbox.applyOverlayEco(true);
  assert.equal(sandbox.fx.performanceQuality, 'eco');
  sandbox.applyOverlayEco(false);
  assert.equal(sandbox.fx.performanceQuality, 'ultra');
  sandbox.applyOverlayEco(false);
  assert.equal(sandbox.fx.performanceQuality, 'ultra');

  // 退场续命：data-leaving 标记 + display/zIndex/opacity 内联接管，
  // OVERLAY_EXIT_MS+40 后清理还原。fake 容器按 id 约定取。
  const el = sandbox.document.getElementById('still-overlay');
  sandbox.beginOverlayExitTransition(sandbox.getVisualizerOverlayMode('still'));
  assert.equal(el.hasAttribute('data-leaving'), true);
  assert.equal(el.props['display'], 'block');
  assert.equal(el.props['zIndex'], '4');   /* 协调器以 CSSOM 驼峰赋值 */
  assert.equal(el.props['opacity'], '0');
  assert.ok(/0\.32s/.test(el.props['transition']), 'exit transition should be 0.32s');
  await new Promise((r) => setTimeout(r, 420));
  assert.equal(el.hasAttribute('data-leaving'), false);
  assert.equal(el.props['display'], undefined);
  assert.equal(el.props['opacity'], undefined);

  // cancelOverlayExit：续命挂起期间重新进入，内联即刻清理（避免 opacity:0 压制入场动画结束态）
  sandbox.beginOverlayExitTransition(sandbox.getVisualizerOverlayMode('still'));
  assert.equal(el.hasAttribute('data-leaving'), true);
  sandbox.cancelOverlayExit(sandbox.getVisualizerOverlayMode('still'));
  assert.equal(el.hasAttribute('data-leaving'), false);
  assert.equal(el.props['zIndex'], undefined);
  await new Promise((r) => setTimeout(r, 420));   /* 等 40ms 偏移的旧定时器落空 */
  console.log('OK overlay-transition');
})().catch((err) => { console.error(err); process.exitCode = 1; });

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
