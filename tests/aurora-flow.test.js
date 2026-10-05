'use strict';
/* 流光（Aurora Flow）：取色分桶 + 颜色工具 + 音频特征 + 色雾精灵（纯函数/无 DOM 深依赖）
   被测模块是无模块的全局脚本，用 vm 沙箱加载（同 graffiti-lyrics.test.js 风格）。
   文件末尾有启动绑定 scheduleUiWarmTask(initAurora)，沙箱里吞掉不执行。
   canvas 相关用可注入的 fake 2D context 桩（只记录必要行为）。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.join(__dirname, '..', 'public', 'js', 'modules', '10-shell', '09-aurora-flow.js');

/* fake canvas 2D context：方法全部吞掉，canvas 尺寸可控 */
function makeFakeCanvas(w, h) {
  return {
    width: w, height: h,
    contexts: [],
    getContext() {
      const ctx = {
        canvas: this,
        fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        getImageDataData: null,
        drawImage() { },
        fillRect() { },
        clearRect() { },
        beginPath() { }, moveTo() { }, lineTo() { }, stroke() { }, fill() { }, arc() { },
        createRadialGradient() {
          return { addColorStop() { } };
        },
        createLinearGradient() {
          return { addColorStop() { } };
        },
        setTransform() { },
        getTransform() { return { a: 1 }; },
        getImageData(x, y, w2, h2) {
          if (this.getImageDataData) return { data: this.getImageDataData };
          return { data: new Uint8ClampedArray(w2 * h2 * 4) };
        },
      };
      this.contexts.push(ctx);
      return ctx;
    },
  };
}

/* 合成一张 32×32 封面：40% 饱和蓝 + 20% 饱和暖红 + 40% 近黑（不入桶） */
function synthImageData() {
  const size = 32;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let p = 0; p < size * size; p++) {
    let r, g, b;
    if (p % 5 < 2) { r = 30; g = 60; b = 200; }         // 40% 蓝
    else if (p % 5 === 2) { r = 200; g = 60; b = 80; }  // 20% 暖红
    else { r = 5; g = 5; b = 6; }                       // 40% 近黑
    data[p * 4] = r; data[p * 4 + 1] = g; data[p * 4 + 2] = b; data[p * 4 + 3] = 255;
  }
  return data;
}

const fakeDoc = {
  getElementById() { return null; },
  createElement(tag) {
    if (tag === 'canvas') return makeFakeCanvas(0, 0);
    return {};
  },
  body: { classList: { toggle() { } } },
};

const sandbox = {
  console,
  readBooleanPreference() { return false; },
  saveBooleanPreference() { },
  scheduleUiWarmTask() { return 0; },
  setTimeout() { return 0; },
  clearTimeout() { },
  document: fakeDoc,
  window: { addEventListener() { }, innerHeight: 800, innerWidth: 1280 },
  getComputedStyle() { return { backgroundImage: '' }; },
  Image: function () { },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), sandbox, { filename: modulePath });

const {
  auroraRgbToHsl, auroraCssToRgb, auroraRgbCss, auroraMixRgb,
  auroraExtractPalette, auroraDefaultPalette, auroraBuildBlobSprite,
  auroraBinAvg, tickAuroraAudio,
} = sandbox;

/* ---------- 颜色工具 ---------- */

// rgb→hsl：纯红 h=0 s=1，纯绿 h=1/3，蓝 h=2/3，灰 s=0
{
  const red = auroraRgbToHsl(255, 0, 0);
  assert.equal(red.h, 0);
  assert.equal(red.s, 1);
  const green = auroraRgbToHsl(0, 255, 0);
  assert.ok(Math.abs(green.h - 1 / 3) < 1e-9);
  const blue = auroraRgbToHsl(0, 0, 255);
  assert.ok(Math.abs(blue.h - 2 / 3) < 1e-9);
  const gray = auroraRgbToHsl(128, 128, 128);
  assert.equal(gray.s, 0);
}

// 十六进制往返 + 非法输入兜底
{
  assert.equal(auroraCssToRgb('#1a2b3c').join(','), '26,43,60');
  assert.equal(auroraRgbCss(26, 43, 60), '#1a2b3c');
  assert.equal(auroraRgbCss(0, 0, 0), '#000000');
  assert.equal(auroraCssToRgb('not-a-color').join(','), '90,110,160');   // 兜底色
}

// mix：t=0 等于 a，t=1 等于 b，中间取线性插值
{
  const mixed = auroraMixRgb([0, 0, 0], [100, 200, 255], 0.5);
  assert.equal(mixed.join(','), '50,100,128');   // 跨 realm 数组用 join 比较
  assert.equal(auroraMixRgb([10, 20, 30], [40, 60, 80], 0).join(','), '10,20,30');
  assert.equal(auroraMixRgb([10, 20, 30], [40, 60, 80], 1).join(','), '40,60,80');
}

/* ---------- 取色分桶 ---------- */

// 合成封面：应产出 2 个彩色主色（蓝权重高于红），sung 是亮色字符串
{
  const fakeImg = { tag: 'fake-img' };
  const canvas = makeFakeCanvas(32, 32);
  sandbox.document.createElement = function (tag) {
    if (tag === 'canvas') {
      const c = makeFakeCanvas(32, 32);
      c.contextsOnCreate = true;
      return c;
    }
    return {};
  };
  /* auroraExtractPalette 内部 create 后立即 getContext —— 预注入合成像素 */
  const origGetContext = makeFakeCanvas.prototype && null;   // 无原型，占位不用
  sandbox.document.createElement = function (tag) {
    if (tag !== 'canvas') return {};
    const c = makeFakeCanvas(32, 32);
    const orig = c.getContext;
    c.getContext = function (...args) {
      const ctx = orig.apply(this, args);
      ctx.getImageDataData = synthImageData();
      return ctx;
    };
    return c;
  };
  const palette = auroraExtractPalette(fakeImg);
  assert.ok(palette, 'palette 产出');
  assert.ok(palette.colors.length >= 1 && palette.colors.length <= 3, `主色数量 1~3，实际 ${palette.colors.length}`);
  const first = auroraCssToRgb(palette.colors[0]);
  assert.ok(first[2] > first[0], '权重最高主色应为蓝色系（蓝>红）');
  assert.match(palette.sung, /^#[0-9a-f]{6}$/i, '点亮字色为 hex');
  /* 近黑像素不入彩色桶：没有任何主色接近 (5,5,5) */
  palette.colors.forEach((cc) => {
    const rgb = auroraCssToRgb(cc);
    assert.ok(rgb[0] + rgb[1] + rgb[2] > 40, '主色不是近黑');
  });
}

// 灰调封面（无彩色桶）→ 亮/暗变体补齐 3 色
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
        data[p * 4] = 120; data[p * 4 + 1] = 120; data[p * 4 + 2] = 125; data[p * 4 + 3] = 255;
      }
      ctx.getImageDataData = data;
      return ctx;
    };
    return c;
  };
  const palette = auroraExtractPalette({ tag: 'gray-img' });
  assert.equal(palette.colors.length, 3, '灰调封面应补齐 3 色');
}

// 默认夜色板字段完整
{
  const p = auroraDefaultPalette();
  assert.equal(p.colors.length, 3);
  assert.match(p.sung, /^#[0-9a-f]{6}$/i);
  assert.equal(typeof p.luma, 'number');
}

// 暗色/灰调封面补偿：auroraVividPalette
{
  /* 暗灰主色（#1a2030）在深色封面（luma≈0.08）下应被提亮且 gain > 1 */
  const v = sandbox.auroraVividPalette(['#1a2030', '#232a38', '#161c28'], 0.08);
  assert.equal(v.colors.length, 3);
  assert.ok(v.gain > 1.2, `暗封面 gain 应显著大于 1，实际 ${v.gain}`);
  v.colors.forEach((cc) => {
    const rgb = auroraCssToRgb(cc);
    const luma = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
    assert.ok(luma > 0.08, `提亮后主色亮度应高于原始 0.08，实际 ${luma.toFixed(3)} (${cc})`);
  });
  /* 亮饱和封面（luma 0.5）gain 恒为 1（不做补偿） */
  const v2 = sandbox.auroraVividPalette(['#e0508a', '#5a3b6e', '#2b3f6b'], 0.5);
  assert.equal(v2.gain, 1);
  /* 灰调补偿后应有色相层次（辅色与主色色相不同） */
  const h = (cc) => {
    const [r, g, b] = auroraCssToRgb(cc).map(x => x / 255);
    return sandbox.auroraRgbToHsl(r, g, b).h;
  };
  const v3 = sandbox.auroraVividPalette(['#2a2d33', '#303338', '#26292f'], 0.15);
  assert.notEqual(h(v3.colors[0]).toFixed(2), h(v3.colors[1]).toFixed(2), '灰调补偿应产生色相差异');
}

// 色雾精灵：256 径向渐变离屏（fake ctx 不抛错即通过）
{
  const sprite = auroraBuildBlobSprite('#2b3f6b');
  assert.equal(sprite.width, 256);
  assert.equal(sprite.height, 256);
}

/* ---------- 音频特征 ---------- */

// 频段均值：bin 区间读取与越界钳制
{
  const data = new Uint8Array(64);
  data.fill(0);
  data[3] = 255;
  sandbox.frequencyData = data;
  /* bin 4..63 全 0，bin 3 不在 [4,63] → 结果 0 */
  assert.equal(auroraBinAvg(4, 63), 0);
  assert.equal(auroraBinAvg(3, 3), 1);
  /* 越界钳制：区间 [1,999] 在 64 长度数组上取到 63 为止 */
  const all = new Uint8Array(8);
  all.fill(128);
  sandbox.frequencyData = all;
  assert.ok(Math.abs(auroraBinAvg(0, 999) - 128 / 255) < 1e-9);
}

// tickAuroraAudio：低频突增触发节拍脉冲并衰减；高能量推高副歌闸门
{
  sandbox.frequencyData = new Uint8Array(512);
  /* 冷启动复位内部状态 */
  sandbox.auroraBass = 0;
  sandbox.auroraEnergy = 0;
  sandbox.auroraChorus = 0;
  sandbox.auroraBeat = 0;
  sandbox.auroraPrevBassRaw = 0;
  sandbox.auroraWavePts = null;

  /* 全响：低频 bin 1-8 = 230，中低 bin 2-160 ≈ 高能量 */
  const fd = sandbox.frequencyData;
  fd.fill(0);
  for (let i = 1; i <= 8; i++) fd[i] = 230;
  for (let i = 2; i < 300; i++) fd[i] = 220;
  tickAuroraAudio(0.05);
  /* 一帧衰减 pow(0.045, 0.05)≈0.856，脉冲仍应明显存在 */
  assert.ok(sandbox.auroraBeat > 0.8, `突增应触发节拍脉冲，实际 ${sandbox.auroraBeat}`);
  /* 一帧平滑：0 + 0.902 * min(1, 0.05*9) ≈ 0.406 */
  assert.ok(sandbox.auroraBass > 0.35, `低频平滑值抬升，实际 ${sandbox.auroraBass}`);

  /* 持续同值：不再触发新脉冲，旧脉冲衰减 */
  const beatAfterRise = sandbox.auroraBeat;
  for (let i = 0; i < 30; i++) tickAuroraAudio(0.05);
  assert.ok(sandbox.auroraBeat < beatAfterRise, '脉冲应快衰减');
  assert.ok(sandbox.auroraChorus > 0.5, '持续高能量应推高副歌闸门');

  /* 静音：能量与副歌回落 */
  fd.fill(0);
  for (let i = 0; i < 200; i++) tickAuroraAudio(0.05);
  assert.ok(sandbox.auroraEnergy < 0.05, '静音后能量回落');
  assert.ok(sandbox.auroraChorus < 0.05, '静音后副歌闸门回落');
}

/* ---------- 启动安全性：沙箱加载无 DOM 时不抛错 ---------- */
/* （模块顶层只声明函数/变量 + scheduleUiWarmTask stub，已在加载时验证） */

console.log('OK aurora-flow');
