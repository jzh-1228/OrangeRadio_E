#!/usr/bin/env node
/**
 * 渲染进程内存探针（Windows）
 * Portions Copyright (c) 2025 chthollyphile and Folia contributors
 * Adapted from folia-major (AGPL-3.0): test/manual/visualizer-memory-probe.mjs 方法论。
 *
 * 以 OS 工作集按进程类型采样（canvas backing store / 合成层 / GPU 资源不会完整
 * 出现在 V8 堆统计里）。启动真实 Electron（node_modules 里的 electron 可执行文件，
 * 绝非 process.execPath 的 node），以随机 marker 的 --user-data-dir 圈出本次启动的
 * Chromium 进程树（renderer/GPU/utility 的命令行都继承该参数）。
 *
 * 用法：node tests/manual/memory-probe.cjs [持续秒数=90]
 * 判读纪律：run-to-run 摆幅之内的差值不作数——先跑两次基线再对比改动。
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const durationMs = Math.max(30, Number(process.argv[2]) || 90) * 1000;

// require('electron') 在纯 Node 下返回可执行文件路径字符串（打包态 API 对象）。
const electronPath = require('electron');
if (typeof electronPath !== 'string') {
  console.error('[probe] require("electron") 返回了 API 对象——请在 Node（非 Electron 主进程）里运行本脚本');
  process.exit(1);
}

const marker = 'osprobe-' + Math.random().toString(36).slice(2, 8);
const profileDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), marker)), 'profile');

function sampleWindows() {
  return new Promise((resolve) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${marker}*' } | ForEach-Object { $type = if ($_.CommandLine -match '--type=([a-z-]+)') { $Matches[1] } else { 'browser' }; [PSCustomObject]@{ type = $type; rss = $_.WorkingSetSize } } | ConvertTo-Json`],
      { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    ps.stdout.on('data', (c) => (out += c));
    ps.on('close', () => {
      try { resolve(JSON.parse(out)); } catch (e) { resolve([]); }
    });
  });
}

function aggregate(entries) {
  if (!Array.isArray(entries)) entries = entries ? [entries] : [];
  const byType = {};
  for (const e of entries) {
    const t = e.type || 'unknown';
    byType[t] = (byType[t] || 0) + (Number(e.rss) || 0);
  }
  return byType;
}

(async () => {
  console.log(`[probe] marker=${marker}`);
  console.log(`[probe] electron: ${electronPath}`);
  console.log(`[probe] starting for ${durationMs / 1000}s (user-data-dir carries the marker)`);
  const app = spawn(electronPath, ['.', '--user-data-dir=' + profileDir], {
    cwd: root,
    stdio: 'ignore',
    env: Object.assign({}, process.env, { ELECTRON_ENABLE_LOGGING: '0' }),
  });
  const samples = [];
  const t0 = Date.now();
  // 前 8s 是窗口/着色器/字体预热，丢弃（与上游方法论一致）
  await new Promise((r) => setTimeout(r, 8000));
  while (Date.now() - t0 < durationMs) {
    const byType = aggregate(await sampleWindows());
    samples.push({ at: Math.round((Date.now() - t0) / 1000), byType });
    console.log(`[probe] t+${samples[samples.length - 1].at}s ` +
      Object.entries(byType).map(([t, b]) => `${t}=${(b / 1048576).toFixed(0)}MB`).join(' '));
    await new Promise((r) => setTimeout(r, 15000));
  }
  try { app.kill(); } catch (e) { }
  if (samples.length >= 2) {
    const first = samples[0].byType, last = samples[samples.length - 1].byType;
    console.log('[probe] delta (last - first):');
    for (const t of new Set([...Object.keys(first), ...Object.keys(last)])) {
      const d = ((last[t] || 0) - (first[t] || 0)) / 1048576;
      console.log(`  ${t}: ${d >= 0 ? '+' : ''}${d.toFixed(0)}MB`);
    }
  }
  try { fs.rmSync(path.dirname(profileDir), { recursive: true, force: true }); } catch (e) { }
})();
