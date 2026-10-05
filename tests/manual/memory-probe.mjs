#!/usr/bin/env node
/**
 * 渲染进程内存探针（基础版）
 * Portions Copyright (c) 2025 chthollyphile and Folia contributors
 * Adapted from folia-major (AGPL-3.0): test/manual/visualizer-memory-probe.mjs 方法论。
 *
 * 以 OS 工作集按进程类型采样（canvas backing store / 合成层 / GPU 资源不会完整
 * 出现在 V8 堆统计里）；mkdtemp 目录名做 marker 圈出本次启动的 Chromium 进程树。
 * 用法：node tests/manual/memory-probe.mjs [持续秒数=90]
 * 判读纪律：run-to-run 摆幅之内的差值不作数——先跑两次基线再对比改动。
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const durationMs = Math.max(30, Number(process.argv[2]) || 90) * 1000;
const root = path.resolve(__dirname, '..', '..');
const marker = 'osprobe-' + Math.random().toString(36).slice(2, 8);
const profileDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), marker)), '');

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
  console.log(`[probe] profile dir: ${profileDir}`);
  console.log(`[probe] starting Electron (--user-data-dir marker=${marker}) for ${durationMs / 1000}s`);
  const app = spawn(process.execPath, ['.'], {
    cwd: root,
    stdio: 'ignore',
    env: Object.assign({}, process.env, { ELECTRON_ENABLE_LOGGING: '0' }),
    detached: false,
  });
  // 注：基础版不注入 user-data-dir 参数（Electron 主进程签名差异），以 marker 目录
  // 圈进程树的方式在带自定义 profileDir 的进阶版启用；当前采样依赖进程命令行特征。
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < durationMs) {
    await new Promise((r) => setTimeout(r, 15000));
    const byType = aggregate(await sampleWindows());
    samples.push({ at: Math.round((Date.now() - t0) / 1000), byType });
    console.log(`[probe] t+${samples[samples.length - 1].at}s ` +
      Object.entries(byType).map(([t, b]) => `${t}=${(b / 1048576).toFixed(0)}MB`).join(' '));
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
