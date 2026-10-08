'use strict';
/* 莫奈（Monet）：水洗色彩数学 / 端点解析 / 亮度折线（monetBackgroundPipeline 移植） */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.join(__dirname, '..', 'public', 'js', 'modules', '10-shell', '24-monet.js');

const sandbox = {
  console,
  readBooleanPreference() { return false; },
  saveBooleanPreference() { },
  scheduleUiWarmTask() { return 0; },
  setTimeout() { return 0; },
  clearTimeout() { },
  document: {
    getElementById() { return null; },
    createElement() { return { getContext() { return null; }, style: {} }; },
    body: { classList: { toggle() { } } },
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), sandbox, { filename: modulePath });

const J = (v) => JSON.parse(JSON.stringify(v));
const {
  monetClamp, monetMix, monetLuminanceOf, monetParseChannels,
  monetResolveWashEndpoints, monetResolveWashColor, monetCssRgba,
} = sandbox;

/* ---------- 通道解析（hex 与 rgb() 双格式，主题三色可用） ---------- */
{
  const hex = monetParseChannels('#0a0b0c', null);
  assert.equal(hex.r + ',' + hex.g + ',' + hex.b, '10,11,12');
  const rgb = monetParseChannels('rgb(255,156,110)', null);
  assert.equal(rgb.r + ',' + rgb.g + ',' + rgb.b, '255,156,110');
  assert.deepEqual(J(monetParseChannels('garbage', { r: 1, g: 2, b: 3 })), { r: 1, g: 2, b: 3 });
}

/* ---------- 水洗端点：暗背景配亮文本 ---------- */
{
  const dark = { r: 10, g: 10, b: 12 };
  const light = { r: 245, g: 245, b: 245 };
  const ep = monetResolveWashEndpoints(dark, light);
  assert.deepEqual(J(ep), { shadow: { r: 10, g: 10, b: 12 }, highlight: { r: 245, g: 245, b: 245 } });
  assert.deepEqual(J(monetResolveWashEndpoints(light, dark).shadow), { r: 10, g: 10, b: 12 });   // 顺序无关

  // 暗端 → 全取 shadow
  const c0 = monetResolveWashColor(0, dark, { r: 255, g: 100, b: 0 }, light);
  assert.deepEqual(J(c0), { r: 10, g: 10, b: 12 });
  // 亮端 → 全取 highlight
  const c1 = monetResolveWashColor(1, dark, { r: 255, g: 100, b: 0 }, light);
  assert.ok(Math.abs(c1.r - 245) < 1e-6 && Math.abs(c1.g - 245) < 1e-6 && Math.abs(c1.b - 245) < 1e-6);
  // 中点 0.55 恰为 accent
  const cm = monetResolveWashColor(0.55, dark, { r: 200, g: 80, b: 40 }, light);
  assert.ok(Math.abs(cm.r - 200) < 1e-9 && Math.abs(cm.g - 80) < 1e-9);
  // 折线单调（亮度上升时输出亮度不下降）
  let prev = -1, mono = true;
  for (let i = 0; i <= 10; i++) {
    const c = monetResolveWashColor(i / 10, dark, { r: 255, g: 100, b: 0 }, light);
    const l = monetLuminanceOf(c.r, c.g, c.b);
    if (l < prev - 1e-6) mono = false;
    prev = l;
  }
  assert.ok(mono);
}

/* ---------- 工具 ---------- */
{
  assert.equal(monetClamp(5, 0, 1), 1);
  assert.equal(monetMix(0, 10, 0.5), 5);
  assert.ok(monetCssRgba({ r: 10, g: 11, b: 12 }, 0.5).startsWith('rgba(10,11,12,0.5)'));
}

console.log('monet.test.js: all assertions passed');
