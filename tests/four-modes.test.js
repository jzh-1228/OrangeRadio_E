'use strict';
/* 四新模式（镜台/商籁/凝彩/绘光）：覆盖层范式完整性与纯函数行为。
   vm 沙箱逐个加载模块，断言生命周期函数存在、序列/构图纯函数确定性与范围。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..', 'public', 'js', 'modules', '10-shell');

function loadSandbox(file) {
  const sandbox = {
    console,
    readBooleanPreference() { return false; },
    saveBooleanPreference() { },
    showToast() { },
    scheduleUiWarmTask() { return 0; },
    setTimeout() { return 0; },
    clearTimeout() { },
    cancelAnimationFrame() { },
    requestAnimationFrame() { return 0; },
    performance: { now: () => 0 },
    getAdjustedLyricPlaybackTime(t) { return t; },
    themeServiceActiveTheme() { return null; },
    themeOverlayDarkTheme() { return null; },
    document: {
      getElementById() { return null; },
      createElement() { return { style: {}, dataset: {}, classList: { toggle() { }, add() { }, remove() { } }, querySelectorAll() { return []; } }; },
      body: { classList: { toggle() { } } },
    },
    window: { innerWidth: 1280, innerHeight: 800, addEventListener() { } },
    lyricsLines: [],
  };
  sandbox.window = Object.assign(sandbox.window || {}, { currentIdx: -1 });
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), sandbox, { filename: file });
  return sandbox;
}

/* ---------- 镜台（Diorama） ---------- */
{
  const s = loadSandbox('25-diorama.js');
  assert.equal(typeof s.applyDioramaMode, 'function');
  assert.equal(typeof s.toggleDioramaMode, 'function');
  assert.equal(typeof s.dioramaSyncTheme, 'function');
  // 主题跟随：服务主题色写入
  s.themeServiceActiveTheme = () => ({ primaryColor: '#aabbcc', accentColor: '#ff9c6e', backgroundColor: '#101010' });
s.themeOverlayDarkTheme = s.themeServiceActiveTheme;
  assert.equal(s.dioramaSyncTheme(), true);
  assert.equal(s.dioramaTheme.primary, '#aabbcc');
  // 二次调用键相同 → false（零开销路径）
  assert.equal(s.dioramaSyncTheme(), false);
  // 尘埃粒子场构建
  s.dioramaBuildMotes(1280, 800);
  assert.equal(s.dioramaMotes.length, 46);
  for (const m of s.dioramaMotes) {
    assert.ok(m.r > 0 && m.r < 1);
    assert.ok(m.alpha > 0 && m.alpha <= 0.5);
  }
}

/* ---------- 商籁（Sonnet） ---------- */
{
  const s = loadSandbox('26-sonnet.js');
  assert.equal(typeof s.applySonnetMode, 'function');
  assert.equal(typeof s.toggleSonnetMode, 'function');
  // 手稿堆样式：当前行无位移满字号；距离越远越小越暗，blur 递增
  const active = s.sonnetRowStyle(0, 3);
  assert.ok(active.transform.includes('scale(1.000)'));
  assert.equal(active.opacity, '1.000');
  const d1 = s.sonnetRowStyle(1, 4);
  const d3 = s.sonnetRowStyle(3, 6);
  assert.ok(parseFloat(d1.opacity) > parseFloat(d3.opacity));
  assert.ok(parseFloat(d1.filter.match(/blur\(([\d.]+)px\)/)[1]) < parseFloat(d3.filter.match(/blur\(([\d.]+)px\)/)[1]));
  // 行索引种子确定性
  assert.deepEqual(s.sonnetRowStyle(2, 7), s.sonnetRowStyle(2, 7));
  // 栈深 7
  assert.equal(s.SONNET_STACK_DEPTH, 7);
}

/* ---------- 凝彩（Tempera） ---------- */
{
  const s = loadSandbox('27-tempera.js');
  assert.equal(typeof s.applyTemperaMode, 'function');
  assert.equal(typeof s.toggleTemperaMode, 'function');
  // 构图库：5 种构图，每种 5~7 块，形状合法
  assert.equal(s.TEMPERA_COMPOSITIONS.length, 5);
  const shapes = new Set();
  for (const comp of s.TEMPERA_COMPOSITIONS) {
    assert.ok(comp.length >= 5 && comp.length <= 7);
    for (const b of comp) {
      assert.ok(['circle', 'rect', 'band', 'ring'].includes(b.shape));
      assert.ok(b.size > 0 && b.size <= 160);
      assert.ok(b.dur > 0);
      shapes.add(b.shape);
    }
  }
  assert.ok(shapes.has('circle') && shapes.has('band'));
  // 色板：主题三色派生 6 色，颜色格式合法
  const palette = s.temperaPalette();
  assert.equal(palette.length, 6);
  for (const c of palette) assert.ok(/^(rgb\(|#)/.test(c), 'bad color ' + c);
  // 种子哈希稳定
  assert.equal(s.temperaHashString('song-a'), s.temperaHashString('song-a'));
}

/* ---------- 绘光（Lumiere） ---------- */
{
  const s = loadSandbox('28-lumiere.js');
  assert.equal(typeof s.applyLumiereMode, 'function');
  assert.equal(typeof s.toggleLumiereMode, 'function');
  // 光丝场构建：4 丝 + 42 尘
  s.lumiereBuildStrands();
  assert.equal(s.lumiereStrands.length, 4);
  assert.equal(s.lumiereMotes.length, 42);
  for (const st of s.lumiereStrands) {
    assert.ok(st.y0 > 0 && st.y0 < 1);
    assert.ok(st.amp > 0 && st.amp < 0.2);
    assert.ok(st.dots >= 6 && st.dots <= 10);
  }
  // 光丝 y 计算有界（屏幕比例内）
  for (let t = 0; t < 10; t += 0.7) {
    for (const st of s.lumiereStrands) {
      for (let x = 0; x <= 1.0001; x += 0.2) {
        const y = s.lumiereStrandY(st, x, t);
        assert.ok(isFinite(y) && y > -1 && y < 2, 'strand y out of range: ' + y);
      }
    }
  }
  // 主题跟随
  s.themeServiceActiveTheme = () => ({ primaryColor: '#112233', accentColor: '#ffc998', secondaryColor: '#8fb3d9' });
s.themeOverlayDarkTheme = s.themeServiceActiveTheme;
  s.lumiereSyncTheme();
  assert.equal(s.lumiereTheme.primary, '#112233');
}

/* ---------- DOM 接线存在性（index.html 与 registry 与卡片清单） ---------- */
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['diorama-overlay', 'sonnet-overlay', 'tempera-overlay', 'lumiere-overlay']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing overlay ' + id);
  }
  for (const css of ['diorama.css', 'sonnet.css', 'tempera.css', 'lumiere.css']) {
    assert.ok(html.includes(css), 'missing css link ' + css);
  }
  const registry = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '02-visual', '90-visualizer-registry.js'), 'utf8');
  const loader = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'index-loader.js'), 'utf8');
  for (const mod of ['25-diorama.js', '26-sonnet.js', '28-lumiere.js']) {
    assert.ok(loader.includes(mod), 'missing loader entry ' + mod);
  }
  // 凝彩为懒加载试点：不在启动 loader 中，由注册表 entry.lazy 协议按需注入
  assert.ok(!loader.includes('27-tempera.js'), 'tempera should be lazy (not in startup loader)');
  assert.ok(registry.includes("lazy: true, storeKey: 'orangesea-tempera-v1'"), 'tempera entry must be lazy');
  for (const id of ['diorama', 'sonnet', 'tempera', 'lumiere']) {
    assert.ok(registry.includes("id: '" + id + "'"), 'missing registry entry ' + id);
  }
  // 网格卡片已收敛为注册表驱动的通用 builder（per-mode builder 移除）
  const grid = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '07-fx', '04-preset-grid-uniforms.js'), 'utf8');
  assert.ok(grid.includes('buildOverlayPresetCard'), 'grid must use generic overlay card builder');
  assert.ok(!grid.includes('buildTemperaPresetCard'), 'per-mode builders should be gone');
}

console.log('four-modes.test.js: all assertions passed');
