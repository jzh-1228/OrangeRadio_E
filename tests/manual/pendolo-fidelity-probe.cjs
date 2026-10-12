#!/usr/bin/env node
/**
 * pendolo 保真度专项探针（真机放歌）
 * ---------------------------------------------------------------------------
 * 对照 Folia 原版逐项验证本轮修复的三个保真度点：
 *   A) Latent 背景（VisualizerShell 默认背景宿主化）：#pendolo-bg-layer 内
 *      canvas 挂载且非零尺寸（WebGL2 mesh/dithering 双 shader 运行）；
 *   B) 副歌光晕（VisualizerPendolo.tsx:539-552 同构）：seek 到合成歌词副歌行
 *      （t≈26.5s，行 6「你说的未来我都明白」isChorus），断言 halo DOM 存在且
 *      z-index:-10 / inset:-0.7em -1.1em / radial-gradient(circle at 42% 50%,
 *      …0.14×0.34…) / blur(10px) 逐值对照；
 *   C) 词色热更链（本轮修复：行内容 stamp 补主题色/词色键）：页面运行时写入
 *      词色表（orangesea-vis-word-colors-v1）→ 桥 700ms sync → setTheme →
 *      stamp 变化 → 行内容重建 → 焦点行逐字扫光填充层中「明白」token 变色；
 *      清表后回退混合填充色（热更双向）。
 * 产物：.tmp-audit/probe/pendolo-fidelity-*.png + JSON 摘要（exit 0 = 全过）。
 * 用法：PROBE_PORT=3312 node tests/manual/pendolo-fidelity-probe.cjs
 */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PROBE_PORT || 3312);
const OUT_DIR = path.resolve(ROOT, process.env.PROBE_OUT || '.tmp-audit/probe');
const CHORUS_T = 26.5;   // 合成歌词行 6（isChorus）25.2-29.0 中段
fs.mkdirSync(OUT_DIR, { recursive: true });

/* ---------- 合成 WAV（12s 正弦+节拍足够探针播放判定） ---------- */
function writeWav(file, seconds) {
  const RATE = 22050;
  const N = RATE * seconds;
  const pcm = new Int16Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / RATE;
    let v = Math.sin(2 * Math.PI * 220 * t) * 0.5 + Math.sin(2 * Math.PI * 277.18 * t) * 0.3;
    if (t % 0.5 < 0.1) v += Math.sin(2 * Math.PI * 55 * t) * Math.exp(-(t % 0.5) * 20) * 0.8;
    pcm[i] = Math.max(-1, Math.min(1, v)) * 32767;
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + N * 2, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(N * 2, 40);
  fs.writeFileSync(file, Buffer.concat([header, Buffer.from(pcm.buffer)]));
}

/* ---------- 合成封面 PNG（512×512 彩色渐变，驱动封面派生主题/背景取色） ---------- */
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (const b of body) crc = crcTable[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  crc = (crc ^ 0xFFFFFFFF) >>> 0;
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, body, crcBuf]);
}
function writeCover(file) {
  const W = 512, H = 512;
  const raw = Buffer.alloc(H * (1 + W * 4));
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  for (let y = 0; y < H; y++) {
    const rowStart = y * (1 + W * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const r = clamp(24 + u * 50 + v * 190);
      const g = clamp(34 + (1 - v) * 80 + u * 30);
      const b = clamp(110 + (1 - v) * 130);
      const o = rowStart + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

/* ---------- 歌词（与 mode-visual-probe 同款：行 6/7、14/15、22/23 为副歌） ---------- */
const LYRICS_FN = () => {
  const texts = [
    '晚风把云吹成了海', '橘色的光落在窗台', '我们唱到夜色发白', '这一刻不必再等待',
    '潮水漫过了旧站台', '灯影在玻璃上摇摆', '你说的未来我都明白', '把心事交给浪花打开',
  ];
  const trs = [
    'Evening wind blows clouds into a sea', 'Orange light falls on the windowsill',
    'We sing until the night turns white', 'This moment needs no more waiting',
    'The tide has covered the old platform', 'Lamp shadows sway upon the glass',
    'I understand the future you speak of', 'Hand the worries to the waves',
  ];
  const lines = [];
  for (let i = 0; i < 30; i++) {
    const t = i * 4.2;
    const text = texts[i % texts.length];
    const chars = Array.from(text);
    const per = 3.8 / Math.max(1, chars.length);
    const words = chars.map((c, ci) => ({ text: c, t: t + ci * per, d: per }));
    lines.push({ t, text, duration: 3.8, translation: trs[i % trs.length], isChorus: i % 8 === 6 || i % 8 === 7, words });
  }
  return lines;
};

/* ---------- 页面内检查脚本 ---------- */
/** A) Latent 背景层：canvas 挂载 + 尺寸 */
const CHECK_BG = () => {
  const layer = document.getElementById('pendolo-bg-layer');
  const canvas = layer ? layer.querySelector('canvas') : null;
  return {
    layerPresent: !!layer,
    canvasPresent: !!canvas,
    cssW: canvas ? canvas.clientWidth : 0,
    cssH: canvas ? canvas.clientHeight : 0,
    backingW: canvas ? canvas.width : 0,
    backingH: canvas ? canvas.height : 0
  };
};

/** B) 副歌光晕 DOM：焦点行 halo 逐值对照（VisualizerPendolo.tsx:539-552） */
const CHECK_HALO = () => {
  const spans = document.querySelectorAll('#pendolo-engine-host span[aria-hidden="true"] > span > span');
  let halo = null;
  document.querySelectorAll('#pendolo-engine-host div[aria-hidden="true"]').forEach((d) => {
    if (String(d.style.background || '').includes('radial-gradient(circle at 42% 50%')) halo = d;
  });
  if (!halo) return { present: false };
  const accentFill = /rgba\((\d+), (\d+), (\d+), 0\.0476\)/.exec(halo.style.background || '');
  return {
    present: true,
    zIndex: halo.style.zIndex,
    inset: halo.style.inset || halo.style.cssText.match(/inset:\s*([^;]+)/)?.[1] || '',
    borderRadius: halo.style.borderRadius,
    background: halo.style.background,
    blur: halo.style.filter,
    firstStop: accentFill ? (accentFill[1] + ',' + accentFill[2] + ',' + accentFill[3]) : null
  };
};

/** C) 词色热更：焦点行扫光填充层中「明白」token 的 color */
const CHECK_WORD_COLOR = () => {
  const host = document.getElementById('pendolo-engine-host');
  if (!host) return { found: false, reason: 'host missing' };
  let fillSpan = null;
  host.querySelectorAll('span').forEach((s) => {
    if (fillSpan) return;
    const mi = s.style.maskImage || s.style.webkitMaskImage || '';
    if (mi && s.textContent && s.textContent.includes('明白')) fillSpan = s;
  });
  if (!fillSpan) return { found: false, reason: 'no fill span containing 明白' };
  let tokenColor = null;
  fillSpan.querySelectorAll('span').forEach((c) => {
    if (c.textContent === '明白') tokenColor = c.style.color;
  });
  let otherColor = null;
  fillSpan.querySelectorAll('span').forEach((c) => {
    if (c.textContent && c.textContent.includes('未来')) otherColor = c.style.color;
  });
  return { found: true, tokenColor, otherColor, lineText: fillSpan.textContent };
};

/* ---------- 静态服务（照抄 mode-visual-probe 形态） ---------- */
function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = urlPath === '/' ? 'public/index.html' : path.join('public', urlPath.replace(/^\//, ''));
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(path.resolve(ROOT, 'public')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end('not found'); return;
    }
    const ext = path.extname(file);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.wav': 'audio/wav', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, () => resolve(server));
  });
}

(async () => {
  let server = null;
  let browser = null;
  const results = { bg: null, halo: null, wordColorSet: null, wordColorCleared: null, pageErrors: [] };
  const fails = [];
  try {
    const { chromium } = require('playwright');
    server = await startServer();
    const tmp = path.join(OUT_DIR, 'pendolo-fidelity-input');
    fs.mkdirSync(tmp, { recursive: true });
    const files = {
      wav: path.join(tmp, 'tone.wav'),
      cover: path.join(tmp, 'cover.png'),
    };
    writeWav(files.wav, 90);
    writeCover(files.cover);

    browser = await chromium.launch({
      args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--enable-unsafe-swiftshader'],
    });
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    await ctx.addInitScript(() => {
      window.electron = {
        getAutomixModelsPresent: async () => ({}),
        getAutomixModelStatus: async () => ({ models: [], manual: null }),
        onAutomixModelProgress: () => () => {},
        diagMark: () => {},
      };
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => results.pageErrors.push(String(e.message).slice(0, 240)));

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(3500);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.body.classList.contains('splash-active'), null, { timeout: 15000 })
      .catch(async () => { await page.keyboard.press('Enter'); });
    await page.waitForTimeout(800);

    await page.setInputFiles('#file-input', files.wav);
    await page.waitForFunction(() => window.audio && !window.audio.paused && window.audio.currentTime > 0.4, null, { timeout: 25000 }).catch(() => {});
    await page.evaluate(() => { if (typeof closeLocalBeatModal === 'function') closeLocalBeatModal(); }).catch(() => {});
    await page.locator('#local-beat-later-btn').click({ timeout: 3000 }).catch(() => {});
    await page.setInputFiles('#cover-input', files.cover);
    await page.waitForTimeout(600);

    // 注入歌词 + 开模式
    await page.evaluate((lines) => {
      if (typeof applyLyricsState === 'function') applyLyricsState(lines, false, 'probe', [], 'none', { reason: 'pendolo-fidelity' });
      else window.lyricsLines = lines;
      if (typeof scheduleStageLyricRender === 'function') scheduleStageLyricRender();
      if (typeof visWordColorsClear === 'function') visWordColorsClear();
      if (typeof applyPendoloMode === 'function') applyPendoloMode(true, { save: false });
      else if (typeof window.applyPendoloMode === 'function') window.applyPendoloMode(true, { save: false });
    }, LYRICS_FN());
    await page.waitForTimeout(2500);   // 引擎 + 背景创建、弹簧就位

    // 检查点 A：Latent 背景层
    results.bg = await page.evaluate(CHECK_BG);
    if (!results.bg.canvasPresent) fails.push('A 失败：#pendolo-bg-layer 内无 canvas（Latent 背景未挂载）');
    else if (results.bg.cssW < 800 || results.bg.cssH < 500) fails.push(`A 失败：背景 canvas css ${results.bg.cssW}x${results.bg.cssH} 不足视口`);

    // seek 到副歌行中段 → 等 halo enter（0.42s）+ 弹簧 settle
    await page.evaluate((t) => { window.audio.currentTime = t; }, CHORUS_T);
    await page.waitForTimeout(1600);
    // 检查点 B：halo 首色标 alpha = 0.14×0.34 = 0.0476（原版 colorWithAlpha 不舍入，
    // 浏览器 CSSOM 序列化为 ≈0.047——原版同浏览器同序列化，数值比较判等）
    results.halo = await page.evaluate(CHECK_HALO);
    if (!results.halo.present) {
      fails.push('B 失败：副歌行 halo DOM 不存在（chorusPresentation.isActive 未生效或光晕未挂载）');
    } else {
      if (results.halo.zIndex !== '-10') fails.push(`B 失败：halo z-index=${results.halo.zIndex} ≠ -10（原版 -z-10）`);
      if (!/^-0\.7em\s+-1\.1em/.test(results.halo.inset)) fails.push(`B 失败：halo inset="${results.halo.inset}" ≠ -0.7em -1.1em`);
      if (results.halo.borderRadius !== '16px') fails.push(`B 失败：halo borderRadius=${results.halo.borderRadius} ≠ 16px（rounded-2xl）`);
      if (!/blur\(10px\)/.test(results.halo.blur)) fails.push(`B 失败：halo filter="${results.halo.blur}" 无 blur(10px)（motionProfile normal chorusGlowMultiplier=1）`);
      const alphaMatch = /rgba\(\d+, \d+, \d+, ([\d.]+)\)/.exec(results.halo.background || '');
      const alpha = alphaMatch ? parseFloat(alphaMatch[1]) : -1;
      if (!(Math.abs(alpha - 0.14 * 0.34) < 0.001)) fails.push(`B 失败：halo 首色标 alpha=${alpha} ≠ 0.14×haloOpacity(0.34)=0.0476，got ${results.halo.background}`);
    }
    await page.screenshot({ path: path.join(OUT_DIR, 'pendolo-fidelity-chorus.png') });

    // 检查点 C1：写入词色表 → 桥 700ms sync → setTheme → 行内容 stamp 变化 →
    // 行内容重建 → 焦点行扫光填充层「明白」token 变色。seek 回副歌行中段防播放漂移
    // （halo 检查耗时 1.6s，行 6 于 29.0s 结束，后续检查可能落进行 7——其文本无「明白」）
    await page.evaluate(() => {
      if (typeof visWordColorsWrite === 'function') visWordColorsWrite([{ word: '明白', color: '#ff5252' }]);
      else localStorage.setItem('orangesea-vis-word-colors-v1', JSON.stringify([{ word: '明白', color: '#ff5252' }]));
    });
    await page.evaluate((t) => { window.audio.currentTime = t; }, CHORUS_T);
    await page.waitForTimeout(1900);   // ≥2 个 sync 周期
    results.wordColorSet = await page.evaluate(CHECK_WORD_COLOR);
    if (!results.wordColorSet.found) {
      fails.push('C1 失败：焦点行填充层无「明白」token（' + (results.wordColorSet.reason || '?') + '）');
    } else if (results.wordColorSet.tokenColor !== 'rgb(255, 82, 82)') {
      fails.push(`C1 失败：词色热更未生效——「明白」token color=${results.wordColorSet.tokenColor} ≠ rgb(255, 82, 82)`);
    }
    await page.screenshot({ path: path.join(OUT_DIR, 'pendolo-fidelity-wordcolor.png') });

    // 检查点 C2：清表 → 回退混合填充色（≠ 词色即可，附实际值）。同样 seek 防漂移
    await page.evaluate(() => {
      if (typeof visWordColorsClear === 'function') visWordColorsClear();
      else localStorage.setItem('orangesea-vis-word-colors-v1', '[]');
    });
    await page.evaluate((t) => { window.audio.currentTime = t; }, CHORUS_T);
    await page.waitForTimeout(1900);
    results.wordColorCleared = await page.evaluate(CHECK_WORD_COLOR);
    if (!results.wordColorCleared.found) {
      fails.push('C2 失败：清表后找不到填充层');
    } else if (results.wordColorCleared.tokenColor === 'rgb(255, 82, 82)') {
      fails.push('C2 失败：清表后「明白」token 仍为词色——热更反向断链');
    }

    await page.evaluate(() => { if (typeof applyPendoloMode === 'function') applyPendoloMode(false, { save: false }); });
  } catch (e) {
    fails.push('探针异常：' + String(e && e.message || e));
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (server) { try { server.close(); } catch (e) {} }
  }

  results.fails = fails;
  results.ok = fails.length === 0 && results.pageErrors.length === 0;
  console.log(JSON.stringify(results, null, 2));
  if (results.pageErrors.length) fails.forEach(() => {});
  process.exit(results.ok ? 0 : 1);
})();
