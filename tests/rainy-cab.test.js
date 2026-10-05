'use strict';
/* 雨夜车窗（Rainy Cab）：颜色工具 + 取色 + 设置映射 + GL 降级
   雨滴本体已迁到 WebGL2 shader（RAINY_GLSL_MAIN），JS 侧只测纯函数与降级行为。
   被测模块是无模块的全局脚本，用 vm 沙箱加载（同 graffiti-lyrics.test.js 风格）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.join(__dirname, '..', 'public', 'js', 'modules', '10-shell', '10-rainy-cab.js');

function makeFakeCanvas(w, h) {
  return {
    width: w, height: h,
    clientWidth: w, clientHeight: h,
    getContext(kind) {
      if (kind === 'webgl2' || kind === 'webgl') return null;   // 沙箱无 WebGL：测降级
      return {
        canvas: this,
        fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        getImageDataData: null,
        drawImage() { }, fillRect() { }, clearRect() { },
        beginPath() { }, moveTo() { }, lineTo() { }, stroke() { }, fill() { }, arc() { },
        save() { }, restore() { }, translate() { }, scale() { }, clip() { },
        closePath() { }, setTransform() { },
        createRadialGradient() { return { addColorStop() { } }; },
        createLinearGradient() { return { addColorStop() { } }; },
        getImageData(x, y, w2, h2) {
          if (this.getImageDataData) return { data: this.getImageDataData };
          return { data: new Uint8ClampedArray(w2 * h2 * 4) };
        },
      };
    },
  };
}

const sandbox = {
  console,
  readBooleanPreference() { return false; },
  saveBooleanPreference() { },
  scheduleUiWarmTask() { return 0; },
  setTimeout() { return 0; },
  clearTimeout() { },
  document: {
    getElementById() { return null; },
    createElement(tag) {
      if (tag === 'canvas') return makeFakeCanvas(0, 0);
      return {};
    },
    body: { classList: { toggle() { } } },
  },
  window: { addEventListener() { }, innerHeight: 800, innerWidth: 1280 },
  getComputedStyle() { return { backgroundImage: '' }; },
  Image: function () { },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), sandbox, { filename: modulePath });

const {
  rainyRgbToHsl, rainyCssToRgb, rainyRgbCss, rainyMixRgb,
  rainyExtractPalette, rainyVividPalette, rainySettingVal,
  initRainyGL, destroyRainyGL,
  RAINY_GLSL_VERT, RAINY_GLSL_MAIN,
} = sandbox;

/* ---------- 颜色工具 ---------- */
{
  const blue = rainyRgbToHsl(0, 0, 255);
  assert.ok(Math.abs(blue.h - 2 / 3) < 1e-9);
  assert.equal(rainyCssToRgb('#0a0b0c').join(','), '10,11,12');
  assert.equal(rainyRgbCss(10, 11, 12), '#0a0b0c');
  assert.equal(rainyMixRgb([0, 10, 20], [40, 50, 60], 0.5).join(','), '20,30,40');
  assert.equal(rainyCssToRgb('garbage').join(','), '90,110,160');   // 兜底
}

/* ---------- 取色：合成封面产出主色 ---------- */
{
  sandbox.document.createElement = function (tag) {
    if (tag !== 'canvas') return {};
    const c = makeFakeCanvas(32, 32);
    const orig = c.getContext;
    c.getContext = function (...args) {
      const ctx = orig.apply(this, args);
      const size = 32;
      const data = new Uint8ClampedArray(size * size * 4);
      for (let p = 0; p < size * size; p++) {
        let r, g, b;
        if (p % 2 === 0) { r = 40; g = 70; b = 210; }       // 50% 蓝
        else { r = 210; g = 70; b = 90; }                   // 50% 暖红
        data[p * 4] = r; data[p * 4 + 1] = g; data[p * 4 + 2] = b; data[p * 4 + 3] = 255;
      }
      ctx.getImageDataData = data;
      return ctx;
    };
    return c;
  };
  const palette = rainyExtractPalette({ tag: 'img' });
  assert.ok(palette.colors.length >= 1, '应产出主色');
  const first = rainyCssToRgb(palette.colors[0]);
  assert.ok(first[2] > first[0] || first[0] > first[2], '主色为彩色（蓝或红系）');
  assert.match(palette.sung, /^#[0-9a-f]{6}$/i);
}

/* ---------- 暗色/灰调补偿：rainyVividPalette 提亮 + gain + 6 色扩展板 ---------- */
{
  const v = rainyVividPalette(['#20242e', '#262b36', '#1b1f28'], 1024, 40, 44, 56);
  assert.ok(v.gain > 1.2, `暗封面 gain 应大于 1，实际 ${v.gain}`);
  assert.equal(v.extended.length, 6, `扩展板 = 3 主色 + 亮变体 + 暖白 + 冷白，实际 ${v.extended.length}`);
  assert.equal(v.extended[4], '#ffd9a8');
  v.colors.forEach((cc) => {
    const rgb = rainyCssToRgb(cc);
    const luma = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
    assert.ok(luma > 0.08, `提亮后主色亮度应高于原始，实际 ${luma.toFixed(3)} (${cc})`);
  });
  /* 亮封面不补偿（sum = count × 通道均值，均值亮度约 0.51） */
  const v2 = rainyVividPalette(['#e0508a', '#4a8ac0', '#3a2f60'], 512, 512 * 150, 512 * 120, 512 * 140);
  assert.equal(v2.gain, 1);
}

/* ---------- 设置读取（fx.rain* 字段，clamp 0~1） ---------- */
{
  assert.equal(rainySettingVal('rainIntensity', 0.5), 0.5, '无 fx 时回退默认值');
  sandbox.fx = { rainIntensity: 2.5, rainFog: -1 };
  assert.equal(rainySettingVal('rainIntensity', 0.5), 1, '超上限 clamp 到 1');
  assert.equal(rainySettingVal('rainFog', 0.5), 0, '超下限 clamp 到 0');
  delete sandbox.fx;
}

/* ---------- GLSL 源码完整性（shader 方案核心守卫） ---------- */
{
  assert.ok(RAINY_GLSL_MAIN.includes('RainLayer'), '主 shader 应含 RainLayer 滑动雨滴');
  assert.ok(RAINY_GLSL_MAIN.includes('StaticDrops'), '主 shader 应含 StaticDrops 冷凝微滴');
  assert.ok(RAINY_GLSL_MAIN.includes('dFdx'), '折射依赖屏幕空间梯度');
  assert.ok(RAINY_GLSL_MAIN.includes('textureLod'), '景深依赖 mipmap LOD');
  assert.ok(RAINY_GLSL_MAIN.includes('uDensity') && RAINY_GLSL_MAIN.includes('uSpeed') && RAINY_GLSL_MAIN.includes('uBlur'),
    '设置 uniforms（雨势/车速/雾气）齐全');
  assert.ok(RAINY_GLSL_VERT.includes('#version 300 es'), '顶点 shader 为 GLSL 300 es');
}

/* ---------- WebGL2 不可用时的优雅降级 ---------- */
{
  /* 沙箱里 getContext('webgl2') 返回 null → initRainyGL 必须返回 false 且不抛错 */
  const ok = initRainyGL();
  assert.equal(ok, false, '无 WebGL2 应返回 false');
  assert.equal(sandbox.rainyGLAvail, false, '探测结果应缓存');
  destroyRainyGL();   // 幂等不抛错
}

console.log('OK rainy-cab');
