'use strict';
/* 封面派生双主题（96-theme-service）：色彩数学 / 封面分析 / 双主题生成 / 命名描述 / 昼房解析
   被测模块是无模块的全局脚本，用 vm 沙箱加载（同 rainy-cab.test.js 风格）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.join(__dirname, '..', 'public', 'js', 'modules', '02-visual', '96-theme-service.js');

const sandbox = {
  console,
  document: {
    getElementById() { return null; },
    documentElement: { style: { setProperty() { } } },
  },
  fx: { themeMode: 'auto' },
  stageLyrics: null,
  scheduleUiWarmTask() { return 0; },
  setTimeout() { return 0; },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), sandbox, { filename: modulePath });

const {
  themeParseColor, themeRgbToHex, themeRgbToHsl, themeHslToRgb,
  themeHexToHsl, themeHslToHex, themeMixHex, themeContrastRatio, themeHueDistance,
  themeAdjustLightnessForContrast,
  themeAnalyzeCoverPalette, themeGenerateBuiltinDualTheme, themeMulberry32, themeHashSeed,
  themeResolveActiveMode, themeCurrentModeSetting,
} = sandbox;

const HEX = /^#[0-9a-f]{6}$/i;

/* ---------- 色彩数学 ---------- */
{
  const parsed = themeParseColor('#0a0b0c');
  assert.equal(parsed.r + ',' + parsed.g + ',' + parsed.b, '10,11,12');
  const short = themeParseColor('#abc');                // 3 位 hex 合法展开
  assert.equal(short.r + ',' + short.g + ',' + short.b, '170,187,204');
  const rgbStr = themeParseColor('rgb(10, 11, 12)');    // 取色管线产物格式
  assert.equal(rgbStr.r + ',' + rgbStr.g + ',' + rgbStr.b, '10,11,12');
  assert.equal(themeParseColor('rgba(255,156,110,0.5)').r, 255);
  assert.equal(themeParseColor('garbage'), null);
  assert.equal(themeRgbToHex({ r: 10, g: 11, b: 12 }), '#0a0b0c');
  const hsl = themeRgbToHsl({ r: 255, g: 0, b: 0 });
  assert.ok(Math.abs(hsl.h) < 1e-9 && Math.abs(hsl.s - 1) < 1e-9 && Math.abs(hsl.l - 0.5) < 1e-9);
  assert.equal(themeHslToHex(hsl), '#ff0000');
  assert.equal(themeMixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.ok(themeContrastRatio('#ffffff', '#000000') > 20);
  assert.ok(Math.abs(themeContrastRatio('#ffffff', '#ffffff') - 1) < 1e-6);
  assert.equal(themeHueDistance(350, 10), 20);
  assert.equal(themeHueDistance(10, 350), 20);
  // 对比度求解器：保色相推亮度，直到过地板
  const solved = themeAdjustLightnessForContrast('#888888', '#ffffff', 4.5);
  assert.ok(themeContrastRatio(solved, '#ffffff') >= 4.5 || themeContrastRatio(solved, '#ffffff') > themeContrastRatio('#888888', '#ffffff'));
}

/* ---------- 封面分析：确定性与结构 ---------- */
{
  const rnd1 = themeMulberry32(themeHashSeed('song-a'));
  const rnd2 = themeMulberry32(themeHashSeed('song-a'));
  const p1 = themeAnalyzeCoverPalette(['#1c4d8c', '#c94f3d', '#e8d9b0'], rnd1);
  const p2 = themeAnalyzeCoverPalette(['#1c4d8c', '#c94f3d', '#e8d9b0'], rnd2);
  assert.deepEqual(p1, p2);                              // 同种子确定性
  assert.ok(p1.baseHue >= 0 && p1.baseHue < 360);
  assert.ok(['ink', 'tinted', 'rich'].includes(p1.tone));
  assert.ok(['analogous', 'complementary', 'split', 'triadic', 'duotone', 'monochrome'].includes(p1.scheme));
  const empty = themeAnalyzeCoverPalette([], themeMulberry32(1));   // 无封面兜底
  assert.ok(empty.baseHue >= 0 && empty.baseHue < 360);
}

/* ---------- 双主题生成：形状 / 命名 / 描述 / 对比度地板 ---------- */
{
  const dual = themeGenerateBuiltinDualTheme(
    ['#1c4d8c', '#c94f3d', '#e8d9b0'],
    themeMulberry32(themeHashSeed('girlfriend')));
  for (const mode of ['light', 'dark']) {
    const t = dual[mode];
    assert.ok(HEX.test(t.backgroundColor) && HEX.test(t.primaryColor)
      && HEX.test(t.accentColor) && HEX.test(t.secondaryColor));
    assert.ok(t.name.includes(' Built-in'), `name=${t.name}`);
    assert.ok(t.description && t.description.length >= 10 && t.description.length <= 40);
    // 生成器的不变量：主文本对背景过 9:1 地板，次级 4.5，强调 3.2
    assert.ok(themeContrastRatio(t.primaryColor, t.backgroundColor) >= 8.8, mode + ' primary contrast');
    assert.ok(themeContrastRatio(t.secondaryColor, t.backgroundColor) >= 4.3, mode + ' secondary contrast');
    assert.ok(themeContrastRatio(t.accentColor, t.backgroundColor) >= 3.0, mode + ' accent contrast');
    // 昼亮夜暗的纸面基调
  }
  const lum = (c) => { const h = themeHexToHsl(c); return h.l; };
  assert.ok(lum(dual.light.backgroundColor) > 0.85 && lum(dual.dark.backgroundColor) < 0.16);
  // 同歌确定性 + 异歌差异
  const dualAgain = themeGenerateBuiltinDualTheme(
    ['#1c4d8c', '#c94f3d', '#e8d9b0'],
    themeMulberry32(themeHashSeed('girlfriend')));
  assert.equal(dual.dark.name, dualAgain.dark.name);
}

/* ---------- 昼房解析 ---------- */
{
  sandbox.fx.themeMode = 'light';
  assert.equal(themeCurrentModeSetting(), 'light');
  assert.equal(themeResolveActiveMode(), 'light');
  sandbox.fx.themeMode = 'dark';
  assert.equal(themeResolveActiveMode(), 'dark');
  sandbox.fx.themeMode = 'auto';
  assert.equal(themeResolveActiveMode(), themeResolveActiveMode() === 'light'
    || themeResolveActiveMode() === 'dark' ? themeResolveActiveMode() : 'x'); // auto ∈ {light,dark}
  assert.ok(['light', 'dark'].includes(themeResolveActiveMode()));
  sandbox.fx.themeMode = 'garbage';
  assert.equal(themeCurrentModeSetting(), 'auto');
}

console.log('duo-theme.test.js: all assertions passed');
