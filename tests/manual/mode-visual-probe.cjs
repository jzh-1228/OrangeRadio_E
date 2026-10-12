#!/usr/bin/env node
/**
 * 真机放歌·模式视觉探针（加固版）
 * ---------------------------------------------------------------------------
 * 在 v0 基础上加固，保留原 CLI 与 JSON 输出风格：
 *   起独立端口 web 服务 → Playwright 打开应用（stub window.electron）→ 跳过
 *   启动页 → #file-input 导入合成 WAV 真实播放 → 关「本地节奏分析」模态 →
 *   #cover-input 注入合成封面（512×512 PNG，零依赖编码器生成，封面派生主题
 *   生效）→ 经 applyLyricsState 注入合成歌词（30 行逐字+翻译+副歌）→ 留基线
 *   截图 → applyXxxMode(true) → 等入场动画 → 固定两时刻全页截图 ×2 + 录屏 +
 *   采 FPS + 收 pageerror → 零依赖 PNG 解码统计画面变化占比 → JSON 摘要。
 *
 * 加固点（相对 v0）：
 *   1) 端口冲突预检：3311 被占立即给出清晰报错；服务进程早夭时把 stderr
 *      尾巴随报错输出（v0 的 stdio:'ignore' 会让启动崩溃变成 30s 静默超时）。
 *   2) 真播放判定加严：audio.currentTime 两次采样必须推进（v0 只查 !paused）。
 *   3) 封面派生主题：合成 512×512 PNG（正方形避免触发裁剪模态，
 *      见 03-beat/05-cover-loading-crop.js loadCoverFromFile 的 |iw-ih|<=1 分支）
 *      经 #cover-input 注入，断言 #album-bg 已点亮。
 *   4) 画面变化判定：基线截图 vs t0/t1 全页截图，零依赖 PNG 解码（zlib 内置）
 *      统计变化像素占比，低于自校准阈值判「画面空白/冻结」。
 *   5) 引擎模式（sonnet/tempera/lumiere）额外断言：Pixi 宿主可见
 *      （display!=none、rect 非 0）且画布尺寸≈视口（排除 0×0 与 320×240
 *      默认回退——引擎建画布用 Math.max(host.clientWidth,320) 兜底，
 *      宿主 display:none 时 clientWidth=0 就会停在 320×240）。
 *   6) 懒加载模式（tempera，见 90-visualizer-registry.js entry.lazy）先走
 *      ensureOverlayModeLoaded 再 apply，避免直调 applyFn miss。
 *
 * 用法：
 *   node tests/manual/mode-visual-probe.cjs <modeId>            # 单模式
 *   node tests/manual/mode-visual-probe.cjs --all               # folia 14 模式全集
 *   node tests/manual/mode-visual-probe.cjs still sonnet        # 指定多个
 * 环境：
 *   PROBE_PORT   探针服务端口（默认 3311，避开 3000 主开发口）
 *   PROBE_OUT    产物目录（默认 .tmp-audit/probe）
 *   PROBE_T0/T1  两个截图时刻（秒，默认 35 / 52，对应合成歌词歌词行）
 */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PROBE_PORT || 3311);
const OUT_DIR = path.resolve(ROOT, process.env.PROBE_OUT || '.tmp-audit/probe');
const T0 = Number(process.env.PROBE_T0 || 35);
const T1 = Number(process.env.PROBE_T1 || 52);
const VIEWPORT = { width: 1600, height: 900 };

/** 全部随探针出场的模式（folia 移植 14 模式全集） */
const ALL_MODES = [
  'still', 'tilt', 'classic', 'claddagh', 'partita', 'cadenza', 'cappella',
  'pendolo', 'fume', 'monet', 'diorama', 'sonnet', 'tempera', 'lumiere',
];
/** 引擎接管三模式：宿主/画布断言只对它们生效 */
const ENGINE_MODES = ['sonnet', 'tempera', 'lumiere'];

/* ------------------------------------------------------------------ */
/* 判定阈值（自校准，勿凭感觉改）                                       */
/* ------------------------------------------------------------------ */
// 单通道容差：>12/255 才算该像素「变化」。同帧重复截图逐字节一致，留此余量
// 只为吸收极少量光标/亚像素抖动；实测噪声接近 0，阈值主要由占比线兜底。
const PX_TOL = 12;
/*
 * VISUAL_DIFF_MIN_RATIO —— 「画面相对基线有实质变化」的占比线（自校准）：
 * 2026-10-10 本仓库实跑校准（fullPage 1600×900，基线≈播放 5s 处 vs 35s/52s，
 * PX_TOL=12）：
 *   classic（渲染正常）：t0 差异占比 99.70%、t1 99.70% —— 模式换肤+整屏重画
 *   sonnet（引擎宿主 display:none 的已知故障态）：t0 99.71%、t1 99.71% ——
 *     body.sonnet 换肤同样掀翻整页底色，像素占比对这类失败【无区分度】
 * 结论（校准得出的判定口径）：像素占比线防的是「apply 后完全冻结/全空、
 * 连换肤都没发生」的静默故障（真空白档 ≈ 0~2%，即仅进度条/滚动歌词微动）；
 * 引擎模式（sonnet/tempera/lumiere）的「宿主不可见/画布空白」必须靠
 * judgeEngineMode 的宿主+画布断言判定，占比线只是通用兜底。取 6%：
 * 高于换肤失败时的 UI 噪声上限（≈2%），低于一切真实渲染档（实测 ≈99%）。
 * 复跑若发现档位漂移，先看 visualDiff.ratio 原始值再动这条线。
 */
const VISUAL_DIFF_MIN_RATIO = 0.06;
// 引擎画布「≈视口」线：css 尺寸两维都 ≥ 视口的 60%（正常全屏接管 ≈100%，
// 320×240 默认回退在 1600×900 下只有 20%/27%，必然落榜）。
const ENGINE_MIN_VIEWPORT_RATIO = 0.6;
// 引擎建画布的默认回退：CSS 320×240（sonnet-engine.js:7880-7882 等
// Math.max(host.clientWidth,320) 兜底），backing = 该值 × 渲染分辨率取整——
// 本机实测回退形态为 480×360（320×240×1.5）。逐一对表，防止漏检缩放档。
const ENGINE_FALLBACK = { w: 320, h: 240 };
const ENGINE_FALLBACK_BACKINGS = [[320, 240], [400, 300], [480, 360], [640, 480]];

/* ------------------------------------------------------------------ */
/* 合成音频：120BPM 鼓组 + 和弦垫 + 五声音阶旋律，给节拍/频段真实信号   */
/* ------------------------------------------------------------------ */
function writeTestWav(file) {
  const RATE = 22050;
  const SECONDS = 90;
  const N = RATE * SECONDS;
  const pcm = new Int16Array(N);
  const chordRoots = [220.0, 174.61, 196.0, 246.94]; // A F G B
  for (let i = 0; i < N; i++) {
    const t = i / RATE;
    let v = 0;
    // kick：每 0.5s（120BPM）
    const kp = t % 0.5;
    if (kp < 0.12) v += Math.sin(2 * Math.PI * (55 - kp * 120) * t) * Math.exp(-kp * 26) * 0.9;
    // hat：每 0.25s 噪声
    const hp = t % 0.25;
    if (hp < 0.03) v += (Math.random() * 2 - 1) * Math.exp(-hp * 90) * 0.18;
    // 和弦垫：每 4s 换根音
    const root = chordRoots[Math.floor(t / 4) % chordRoots.length];
    v += (Math.sin(2 * Math.PI * root * t) + 0.6 * Math.sin(2 * Math.PI * root * 1.25 * t)
      + 0.5 * Math.sin(2 * Math.PI * root * 1.5 * t)) * 0.16;
    // 旋律：每 0.5s 一个五声音阶音
    const steps = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
    const note = steps[(Math.floor(t / 0.5) * 3) % steps.length];
    const mp = t % 0.5;
    v += Math.sin(2 * Math.PI * root * 2 * note * t) * Math.exp(-mp * 6) * 0.22;
    pcm[i] = Math.max(-1, Math.min(1, v)) * 32767;
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  fs.writeFileSync(file, Buffer.concat([header, Buffer.from(pcm.buffer)]));
}

/* ------------------------------------------------------------------ */
/* 零依赖 PNG：编码（合成封面）+ 解码（截图像素比对），zlib 为内置      */
/* ------------------------------------------------------------------ */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(0); // 占位，下面统一大端
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * 编解码器自检（--selftest）：封面 PNG 写出→解码必须逐字节还原；同图 diff=0；
 * 人为改动一块像素后 diff>0。像素比对是本探针判定的地基，先自证再上岗。
 */
function codecSelfTest(files) {
  writeTestCoverPng(files.cover);
  const dec = decodePng(files.cover);
  if (dec.width !== 512 || dec.height !== 512) throw new Error(`自检失败：封面尺寸 ${dec.width}x${dec.height} ≠ 512x512`);
  // 复算一份"理想"像素流（与 writeTestCoverPng 同公式），要求解码结果逐字节一致
  const W = 512, H = 512;
  const coverPixel = (x, y) => {
    const u = x / W, v = y / H;
    let r = 24 + u * 50 + v * 190;
    let g = 34 + (1 - v) * 80 + u * 30;
    let b = 110 + (1 - v) * 130;
    const dx = x - 256, dy = y - 256, d = Math.sqrt(dx * dx + dy * dy);
    const ring = Math.abs(Math.sin(d / 34)) * 46;
    const band = Math.sin((x + y) / 46) * 26;
    return [
      Math.max(0, Math.min(255, Math.round(r + ring * 0.9 + band))),
      Math.max(0, Math.min(255, Math.round(g + ring * 0.35 - band * 0.4))),
      Math.max(0, Math.min(255, Math.round(b + ring * 0.5 - band * 0.7))),
    ];
  };
  let mismatch = 0;
  for (let y = 0; y < H; y += 7) { // 抽样 1/7 行足够抓编码/解filter错误且保持自检轻量
    for (let x = 0; x < W; x += 5) {
      const [r, g, b] = coverPixel(x, y);
      const o = (y * W + x) * 4;
      if (dec.data[o] !== r || dec.data[o + 1] !== g || dec.data[o + 2] !== b) mismatch++;
    }
  }
  if (mismatch) throw new Error(`自检失败：封面解码抽样不一致 ${mismatch} 处（编码/解filter 有 bug）`);
  const same = pngChangeRatio(files.cover, files.cover);
  if (same.error || same.changed !== 0) throw new Error('自检失败：同图 diff 不为 0');
  // 人为造差异：同公式重写一份、左上 40×40 涂黑，diff 必须检出
  const mutated = files.cover + '.mut.png';
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    const rowStart = y * (1 + W * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < W; x++) {
      const [r, g, b] = (x < 40 && y < 40) ? [0, 0, 0] : coverPixel(x, y);
      const o = rowStart + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(mutated, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
  const diff = pngChangeRatio(files.cover, mutated);
  fs.unlinkSync(mutated);
  if (diff.error || !(diff.ratio > 0.001)) throw new Error(`自检失败：人为差异未检出（ratio=${diff.ratio}）`);
  console.log(`codec selftest OK：round-trip 一致、同图 diff=0、人为差异 ratio=${diff.ratio.toFixed(4)} 检出`);
}

/** 合成封面：512×512（正方形→loadCoverFromFile 直接走 commit 分支不弹裁剪） */
function writeTestCoverPng(file) {
  const W = 512, H = 512;
  const raw = Buffer.alloc(H * (1 + W * 4));
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  for (let y = 0; y < H; y++) {
    const rowStart = y * (1 + W * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      // 深蓝→日落橙垂直渐变 + 对角光带 + 同心圆环：给封面取色/派生主题稳定信号
      let r = 24 + u * 50 + v * 190;
      let g = 34 + (1 - v) * 80 + u * 30;
      let b = 110 + (1 - v) * 130;
      const dx = x - 256, dy = y - 256, d = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.abs(Math.sin(d / 34)) * 46;
      const band = Math.sin((x + y) / 46) * 26;
      r = clamp(r + ring * 0.9 + band);
      g = clamp(g + ring * 0.35 - band * 0.4);
      b = clamp(b + ring * 0.5 - band * 0.7);
      const o = rowStart + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // compression/filter/interlace
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

/**
 * 零依赖 PNG 解码（覆盖 Chromium 截图形态：8-bit、非隔行、灰度/RGB/RGBA/
 * 灰度+A/调色板，filter 0..4）。16-bit 与隔行显式报错（Chromium 不产出，
 * 真遇到说明截图管线变了，宁可失败不可假通过）。
 */
function decodePng(file) {
  const buf = fs.readFileSync(file);
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(sig)) throw new Error('不是 PNG: ' + file);
  let off = 8, ihdr = null, plte = null;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') plte = Buffer.from(data);
    off += 12 + len;
    if (type === 'IEND') break;
  }
  if (!ihdr) throw new Error('PNG 缺 IHDR: ' + file);
  if (ihdr.depth !== 8) throw new Error(`不支持的位深 ${ihdr.depth}（期望 8）: ` + file);
  if (ihdr.interlace !== 0) throw new Error('不支持的隔行 PNG: ' + file);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.color];
  if (!channels) throw new Error('不支持的色彩类型 ' + ihdr.color + ': ' + file);
  if (ihdr.color === 3 && !plte) throw new Error('调色板 PNG 缺 PLTE: ' + file);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { w, h } = ihdr;
  const stride = w * channels;
  if (raw.length < h * (stride + 1)) throw new Error('PNG 像素数据不足: ' + file);
  const out = new Uint8Array(w * h * 4);
  const cur = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  let pos = 0;
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
  };
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    for (let i = 0; i < stride; i++) {
      const x = raw[pos + i];
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v;
      if (ft === 0) v = x;
      else if (ft === 1) v = x + a;
      else if (ft === 2) v = x + b;
      else if (ft === 3) v = x + ((a + b) >> 1);
      else if (ft === 4) v = x + paeth(a, b, c);
      else throw new Error('未知 PNG filter ' + ft + ': ' + file);
      cur[i] = v & 0xFF;
    }
    pos += stride;
    for (let x = 0; x < w; x++) {
      const s = x * channels, o = (y * w + x) * 4;
      if (ihdr.color === 0) { const g0 = cur[s]; out[o] = out[o + 1] = out[o + 2] = g0; out[o + 3] = 255; }
      else if (ihdr.color === 4) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = cur[s + 1]; }
      else if (ihdr.color === 2) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = 255; }
      else if (ihdr.color === 6) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = cur[s + 3]; }
      else { const pi = cur[s] * 3; out[o] = plte[pi]; out[o + 1] = plte[pi + 1]; out[o + 2] = plte[pi + 2]; out[o + 3] = 255; }
    }
    cur.copy(prev);
  }
  return { width: w, height: h, data: out };
}

/** 变化像素占比：任一 RGB 通道差 > PX_TOL 记为变化（alpha 不参与）。尺寸不一致视为结构异常 */
function pngChangeRatio(fileA, fileB) {
  const A = decodePng(fileA), B = decodePng(fileB);
  if (A.width !== B.width || A.height !== B.height) {
    return { error: `尺寸不一致 ${A.width}x${A.height} vs ${B.width}x${B.height}` };
  }
  const total = A.width * A.height;
  let changed = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (Math.abs(A.data[o] - B.data[o]) > PX_TOL
      || Math.abs(A.data[o + 1] - B.data[o + 1]) > PX_TOL
      || Math.abs(A.data[o + 2] - B.data[o + 2]) > PX_TOL) changed++;
  }
  return { total, changed, ratio: changed / total };
}

/* ------------------------------------------------------------------ */
/* 服务起停：端口冲突预检 + 早夭感知                                    */
/* ------------------------------------------------------------------ */
function portBusy(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    sock.setTimeout(1500);
    const done = (busy) => { try { sock.destroy(); } catch (_) {} resolve(busy); };
    sock.on('connect', () => done(true));
    sock.on('timeout', () => done(false));
    sock.on('error', () => done(false));
  });
}

function waitHttp(url, timeoutMs, serverProc) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (serverProc && serverProc.exitCode !== null) {
        const tail = serverProc.__stderrTail || '(无 stderr)';
        return reject(new Error(`探针服务进程提前退出（code=${serverProc.exitCode}）。stderr 尾部：\n${tail}`));
      }
      http.get(url, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - started > timeoutMs) reject(new Error('server not ready: ' + url));
          else setTimeout(tick, 350);
        });
    };
    tick();
  });
}

/** 合成歌词：30 行、逐字时间轴、翻译、副歌标记 */
function lyricsFixture() {
  const lines = [];
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
  for (let i = 0; i < 30; i++) {
    const t = i * 4.2;
    const text = texts[i % texts.length];
    const chars = Array.from(text);
    const per = 3.8 / Math.max(1, chars.length);
    const words = chars.map((c, ci) => ({ text: c, t: t + ci * per, d: per }));
    lines.push({
      t, text, duration: 3.8, translation: trs[i % trs.length],
      isChorus: i % 8 === 6 || i % 8 === 7, words,
    });
  }
  return lines;
}

/** 注入歌词走应用真实管线（applyLyricsState → renderLyrics → 舞台渲染/桥接） */
const INJECT_LYRICS_FN = (lines) => {
  if (typeof applyLyricsState === 'function') {
    applyLyricsState(lines, false, 'probe', [], 'none', { reason: 'probe-inject' });
  } else {
    window.lyricsLines = lines;
  }
  if (typeof scheduleStageLyricRender === 'function') scheduleStageLyricRender();
};

/**
 * 应用模式（注册表感知）：懒加载 entry（tempera）先 ensureOverlayModeLoaded，
 * 再经 entry.applyFn 调 apply(true,{save:false})；非懒模式直调。
 */
async function applyMode(page, mode) {
  return page.evaluate((m) => new Promise((resolve) => {
    const capName = m.charAt(0).toUpperCase() + m.slice(1);
    const entry = (typeof getVisualizerOverlayMode === 'function') ? getVisualizerOverlayMode(m) : null;
    const fnName = (entry && entry.applyFn) || ('apply' + capName + 'Mode');
    const doApply = () => {
      const fn = window[fnName];
      if (typeof fn !== 'function') return 'applyFn missing: ' + fnName;
      try { fn(true, { save: false }); return 'OK'; } catch (e) { return 'throw: ' + e.message; }
    };
    if (entry && entry.lazy && typeof ensureOverlayModeLoaded === 'function'
      && window[entry.stateVar] === undefined) {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
      const timer = setTimeout(() => finish('lazy load timeout: ' + fnName), 15000);
      try {
        ensureOverlayModeLoaded(entry, () => { clearTimeout(timer); finish(doApply()); });
      } catch (e) { clearTimeout(timer); finish('ensure throw: ' + e.message); }
      return;
    }
    resolve(doApply());
  }), mode);
}

/** 引擎模式判定：宿主可见 + 画布尺寸≈视口（在 Node 侧对 state.hosts 出数） */
function judgeEngineMode(mode, hosts, viewport) {
  const id = mode + '-pixi-host';
  const h = hosts[mode]; // state.hosts 以模式短名为键（值才是 #<mode>-pixi-host 的观测）
  const reasons = [];
  if (!h || !h.present) {
    reasons.push(`引擎宿主 #${id} 不存在`);
  } else {
    if (h.display === 'none') {
      reasons.push(`引擎宿主 #${id} 不可见（display:none${h.pixiOn ? '，覆盖层已 pixi-on 但宿主仍被隐藏——宿主显示规则/时序问题' : '，覆盖层未进入 pixi-on——引擎未接管'}）`);
    }
    if (!(h.rect.w > 0 && h.rect.h > 0)) {
      reasons.push(`引擎宿主 #${id} rect 零尺寸 ${h.rect.w}x${h.rect.h}`);
    }
    if (!h.canvasCount) {
      reasons.push(`引擎宿主 #${id} 内没有 canvas（画面空白/引擎未创建）`);
    } else {
      const c = h.canvases[0];
      const cw = c.cssW || 0, ch = c.cssH || 0, bw = c.w || 0, bh = c.h || 0;
      if (bw === 0 && bh === 0) reasons.push(`引擎画布像素尺寸 0×0`);
      if (h.display !== 'none' && (cw === 0 || ch === 0)) {
        reasons.push(`引擎画布 css 尺寸 ${Math.round(cw)}x${Math.round(ch)}（宿主可见但画布零尺寸）`);
      }
      if ((cw === ENGINE_FALLBACK.w && ch === ENGINE_FALLBACK.h)
        || ENGINE_FALLBACK_BACKINGS.some(([fw, fh]) => bw === fw && bh === fh)) {
        reasons.push(`引擎画布停在 ${ENGINE_FALLBACK.w}×${ENGINE_FALLBACK.h} 设计回退尺寸（css ${Math.round(cw)}x${Math.round(ch)} / backing ${bw}x${bh}，建画布时宿主 clientWidth=0 的典型症状）`);
      }
      const minW = ENGINE_MIN_VIEWPORT_RATIO * viewport.width;
      const minH = ENGINE_MIN_VIEWPORT_RATIO * viewport.height;
      if (cw > 0 && ch > 0 && (cw < minW || ch < minH)) {
        reasons.push(`引擎画布 ${Math.round(cw)}x${Math.round(ch)} 不足视口 ${viewport.width}x${viewport.height} 的 ${Math.round(ENGINE_MIN_VIEWPORT_RATIO * 100)}%（要求 ≥${Math.round(minW)}x≥${Math.round(minH)}）`);
      }
    }
  }
  return { pass: reasons.length === 0, reasons, host: h || null };
}

async function probeOne(browser, mode, token, files) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
  });
  await ctx.addInitScript(() => {
    window.electron = {
      getAutomixModelsPresent: async () => ({}),
      getAutomixModelStatus: async () => ({ models: [], manual: null }),
      onAutomixModelProgress: () => () => {},
      diagMark: () => {},
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  const consoleErrors = [];
  let netErrorCount = 0;
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 240)));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      if (/net::|Failed to load resource/.test(m.text())) netErrorCount++;
      else consoleErrors.push(m.text().slice(0, 240));
    }
  });

  const url = `http://localhost:${PORT}/`;
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500); // 启动动画就绪
  // 启动页需显式进入（点击播放按钮 / Enter）——探针直接跳过，落到主界面
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.body.classList.contains('splash-active'), null, { timeout: 15000 })
    .catch(async () => { await page.keyboard.press('Enter'); });
  await page.waitForTimeout(800);

  // 真机放歌：导入合成 WAV
  await page.setInputFiles('#file-input', files.wav);
  await page.waitForFunction(
    () => window.audio && !window.audio.paused && window.audio.currentTime > 0.4,
    null, { timeout: 25000 },
  ).catch(() => {});
  // 本地文件会弹「本地节奏分析」模态——探针选择暂不分析
  await page.evaluate(() => { if (typeof closeLocalBeatModal === 'function') closeLocalBeatModal(); })
    .catch(() => {});
  await page.locator('#local-beat-later-btn').click({ timeout: 3000 }).catch(() => {});
  // 真播放判定加严：currentTime 两次采样必须推进（paused 位可能被 autoplay 策略糊弄，时间不会）
  const playProbe = await page.evaluate(() => new Promise((resolve) => {
    if (!window.audio) { resolve({ playing: false, delta: 0 }); return; }
    const a0 = window.audio.currentTime;
    setTimeout(() => resolve({ playing: !window.audio.paused, delta: window.audio.currentTime - a0 }), 900);
  }));
  const playing = !!(playProbe.playing && playProbe.delta > 0.05);

  // 封面派生主题：合成 512×512 PNG 经 #cover-input 注入（正方形不触发裁剪模态）
  // 注意：setAlbumBackground 是 #album-bg / #album-bg-next 双槽交叉淡化，
  // visible 类在两槽间交替——观测必须覆盖两槽，只盯主槽会漏报。
  await page.setInputFiles('#cover-input', files.cover);
  await page.waitForFunction(() => {
    return ['album-bg', 'album-bg-next'].some((id) => {
      const bg = document.getElementById(id);
      return !!(bg && bg.classList.contains('visible') && /data:image/.test(bg.style.backgroundImage || ''));
    });
  }, null, { timeout: 8000 }).catch(() => {});
  const cover = await page.evaluate(() => {
    const slot = ['album-bg', 'album-bg-next'].map((id) => document.getElementById(id)).find((bg) => {
      return !!(bg && bg.classList.contains('visible') && /data:image/.test(bg.style.backgroundImage || ''));
    });
    let customCover = false;
    try {
      customCover = typeof getCustomCoverForSong === 'function'
        && typeof currentCoverSong === 'function'
        && !!getCustomCoverForSong(currentCoverSong());
    } catch (_) { /* 歌对象未就绪不阻塞 */ }
    return {
      albumSlot: slot ? slot.id : null,
      albumBgVisible: !!slot,
      albumBgHasImage: !!slot,
      customCoverApplied: customCover,
    };
  });
  const coverApplied = cover.albumBgVisible && cover.albumBgHasImage;

  // 合成歌词：走应用真实歌词应用管线
  await page.evaluate(INJECT_LYRICS_FN, lyricsFixture());
  await page.waitForTimeout(600);
  const injected = await page.evaluate(() => (window.lyricsLines || []).length);
  const lyricShape = await page.evaluate(() => {
    const l = (window.lyricsLines || [])[0] || {};
    return {
      words: Array.isArray(l.words) ? l.words.length : 0,
      translation: typeof l.translation === 'string' && l.translation.length > 0,
      isChorus: 'isChorus' in l,
    };
  });

  // 应用模式前：基线截图（全页）
  const baseShot = path.join(OUT_DIR, `${mode}-base-${token}.png`);
  await page.screenshot({ path: baseShot, fullPage: true });

  // 应用模式（注册表/懒加载感知）→ 等入场动画落定
  const applied = await applyMode(page, mode);
  await page.waitForTimeout(2500);

  // FPS 采样 3s
  const fps = await page.evaluate(() => new Promise((resolve) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else resolve(Math.round(n / 3)); };
    requestAnimationFrame(tick);
  }));

  // 两个固定播放时刻截图（全页）
  const shots = [];
  for (const [label, at] of [['t0', T0], ['t1', T1]]) {
    await page.evaluate((sec) => { if (window.audio) window.audio.currentTime = sec; }, at);
    await page.evaluate(INJECT_LYRICS_FN, lyricsFixture());
    await page.waitForTimeout(1600);
    const shot = path.join(OUT_DIR, `${mode}-${label}-${token}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    shots.push(shot);
  }

  // 引擎/回退状态观测（宿主 display/rect/画布尺寸是引擎模式判定的证据源）
  const state = await page.evaluate((m) => {
    const capName = m.charAt(0).toUpperCase() + m.slice(1);
    const out = { hosts: {} };
    const hostInfo = (id) => {
      const host = document.getElementById(id);
      if (!host) return { present: false };
      const cs = getComputedStyle(host);
      const rect = host.getBoundingClientRect();
      const ov = host.closest('[id$="-overlay"]');
      return {
        present: true, display: cs.display, visibility: cs.visibility,
        rect: { w: Math.round(rect.width), h: Math.round(rect.height) },
        pixiOn: !!(ov && ov.classList.contains('pixi-on')),
        canvasCount: host.querySelectorAll('canvas').length,
        canvases: Array.from(host.querySelectorAll('canvas')).map((c) => ({
          id: c.id || null, w: c.width, h: c.height,
          cssW: Math.round(c.getBoundingClientRect().width),
          cssH: Math.round(c.getBoundingClientRect().height),
        })),
      };
    };
    for (const id of ['sonnet', 'tempera', 'lumiere']) out.hosts[id] = hostInfo(id + '-pixi-host');
    out.pixiRuntime = !!(window[capName.toLowerCase() + 'PixiRuntime']);
    const entry = (typeof getVisualizerOverlayMode === 'function') ? getVisualizerOverlayMode(m) : null;
    out.stateVarActive = !!(entry && window[entry.stateVar] === true);
    out.activeOverlay = typeof activeVisualizerOverlay === 'function' && activeVisualizerOverlay()
      ? activeVisualizerOverlay().id : null;
    out.canvasCount = document.querySelectorAll('canvas').length;
    out.webgl2 = !!document.createElement('canvas').getContext('webgl2');
    /* 覆盖层 DOM 证据：可见文本节点、关键样式（判断"模式是否真的画出来了"） */
    const ov = document.getElementById(m + '-overlay');
    if (ov) {
      const leaves = Array.from(ov.querySelectorAll('*')).filter((e) => e.children.length === 0 && (e.textContent || '').trim());
      const vis = leaves.filter((e) => {
        const s = getComputedStyle(e);
        return s.opacity !== '0' && s.display !== 'none' && s.visibility !== 'hidden';
      });
      out.overlay = {
        display: getComputedStyle(ov).display,
        opacity: getComputedStyle(ov).opacity,
        rect: ov.getBoundingClientRect().toJSON(),
        leafTexts: leaves.length, visibleLeafTexts: vis.length,
        sample: vis.slice(0, 6).map((e) => ({
          id: e.id || e.className, txt: (e.textContent || '').slice(0, 16),
          op: getComputedStyle(e).opacity, color: getComputedStyle(e).color, fs: getComputedStyle(e).fontSize,
        })),
      };
      out.overlayCanvases = Array.from(ov.querySelectorAll('canvas')).map((c) => ({
        id: c.id || c.className, w: c.width, h: c.height, rect: c.getBoundingClientRect().toJSON(),
      }));
    } else {
      out.overlay = null;
    }
    return out;
  }, mode);

  const video = page.video();
  await ctx.close();
  let videoPath = null;
  if (video) {
    try {
      const p = await video.path();
      videoPath = path.join(OUT_DIR, `${mode}-${token}.webm`);
      try { fs.renameSync(p, videoPath); } catch (_) { videoPath = p; } // 重名/占用则保留原名
    } catch (e) { videoPath = null; }
  }

  // 画面变化判定：基线 vs t0/t1（零依赖 PNG 解码）
  const diff0 = pngChangeRatio(baseShot, shots[0]);
  const diff1 = pngChangeRatio(baseShot, shots[1]);
  const visualDiff = {
    tol: PX_TOL, threshold: VISUAL_DIFF_MIN_RATIO,
    t0: diff0.error ? { error: diff0.error } : { ratio: Number(diff0.ratio.toFixed(5)), changed: diff0.changed, total: diff0.total },
    t1: diff1.error ? { error: diff1.error } : { ratio: Number(diff1.ratio.toFixed(5)), changed: diff1.changed, total: diff1.total },
  };
  const diffErr = diff0.error || diff1.error;
  const maxRatio = diffErr ? 0 : Math.max(diff0.ratio, diff1.ratio);
  visualDiff.maxRatio = Number(maxRatio.toFixed(5));
  visualDiff.pass = !diffErr && maxRatio >= VISUAL_DIFF_MIN_RATIO;
  if (diffErr) visualDiff.error = diffErr;

  // 引擎模式额外判定
  const isEngineMode = ENGINE_MODES.includes(mode);
  const engine = { isEngineMode };
  if (isEngineMode) Object.assign(engine, judgeEngineMode(mode, state.hosts, VIEWPORT));

  // 汇总判定与失败原因（顺序即排查顺序）
  const reasons = [];
  if (!playing) reasons.push(`真播放失败（paused=${!playProbe.playing}, 0.9s 内 currentTime 推进 ${playProbe.delta.toFixed(2)}s）`);
  if (injected !== 30) reasons.push(`歌词注入行数异常：${injected}（期望 30）`);
  if (applied !== 'OK') reasons.push(`模式 apply 失败：${applied}`);
  if (!coverApplied) reasons.push('封面注入失败（#album-bg 未点亮，封面派生主题未生效）');
  if (diffErr) reasons.push(`画面比对异常：${diffErr}`);
  else if (!visualDiff.pass) reasons.push(`画面变化不足：相对基线最大差异占比 ${(maxRatio * 100).toFixed(2)}% < 阈值 ${(VISUAL_DIFF_MIN_RATIO * 100).toFixed(0)}%（疑似空白/冻结/整层隐藏）`);
  if (errors.length) reasons.push('pageerror: ' + errors[0]);
  if (isEngineMode && !engine.pass) reasons.push(...engine.reasons);

  const freshErrors = errors.filter((e) => !/net::|Failed to load resource/.test(e));
  return {
    mode, playing, playDelta: Number(playProbe.delta.toFixed(3)),
    injected, lyricShape, applied, cover, coverApplied,
    fps, baseShot, shots, video: videoPath,
    visualDiff, engine, state,
    pageErrors: freshErrors, netErrorCount, consoleErrors: consoleErrors.slice(0, 6),
    reasons, ok: reasons.length === 0,
  };
}

(async () => {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const modes = process.argv.includes('--all') ? ALL_MODES : (argv.length ? argv : ['still']);
  if (process.argv.includes('--selftest')) {
    try {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      codecSelfTest({ cover: path.join(OUT_DIR, 'probe-cover.png') });
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  }
  for (const m of modes) {
    if (!ALL_MODES.includes(m)) {
      console.error(`未知模式：${m}（可用：${ALL_MODES.join(',')}）`);
      process.exit(1);
    }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 端口冲突预检：探针服务的地址被别人占着时，waitHttp 会对着别人的服务"就绪"，
  // 测的就是别人的页面了——所以先探后起，冲突立即给清晰报错。
  if (await portBusy(PORT)) {
    console.error(`[探针] 端口 ${PORT} 已被占用（可能有旧探针服务或开发服务在跑）。`
      + `请结束占用进程，或用 PROBE_PORT=<其它端口> 重跑，例如：`
      + ` PROBE_PORT=3312 node tests/manual/mode-visual-probe.cjs ${modes[0]}`);
    process.exit(1);
  }

  const files = {
    wav: path.join(OUT_DIR, 'probe-tone.wav'),
    cover: path.join(OUT_DIR, 'probe-cover.png'),
  };
  if (!fs.existsSync(files.wav)) { process.stdout.write('生成合成音频… '); writeTestWav(files.wav); console.log('OK'); }
  if (!fs.existsSync(files.cover)) { process.stdout.write('生成合成封面… '); writeTestCoverPng(files.cover); console.log('OK'); }

  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  server.stderr.on('data', (d) => {
    server.__stderrTail = ((server.__stderrTail || '') + d.toString()).split('\n').slice(-12).join('\n');
  });
  let browser = null;
  const results = [];
  try {
    await waitHttp(`http://localhost:${PORT}/`, 30000, server);
    const { chromium } = require('playwright');
    // PROBE_GPU=1：headless 走真 GPU（D3D11 ANGLE）。默认 SwiftShader 软件渲染下
    // rAF 仅 2-3fps（2026-10-11 实测 claddagh/tilt 同档），逐帧弹簧（framer spring
    // 的 dt 截断语义）在低帧下相位落后数秒，截图无法反映真机形态；GPU 模式
    // rAF≈60，截图与真机一致。默认关闭，不影响既有判定口径。
    const launchArgs = ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--enable-unsafe-swiftshader'];
    if (process.env.PROBE_GPU === '1') {
      launchArgs.push('--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist');
    }
    browser = await chromium.launch({
      args: launchArgs,
    });
    const token = Date.now().toString(36);
    for (const mode of modes) {
      const r = await probeOne(browser, mode, token, files).catch((e) => ({ mode, ok: false, fatal: String(e.message).slice(0, 300), reasons: ['fatal: ' + String(e.message).slice(0, 200)] }));
      results.push(r);
      console.log(JSON.stringify(r, null, 1));
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    try { server.kill(); } catch (_) {}
  }
  const failed = results.filter((r) => !r.ok);
  console.log('产物目录：' + OUT_DIR);
  console.log(`探针结果：${results.length - failed.length}/${results.length} 通过${failed.length ? '；失败：' + failed.map((f) => f.mode).join(',') : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
