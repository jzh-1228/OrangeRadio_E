#!/usr/bin/env node
/**
 * 八个移植歌词模式的浏览器烟测（需要本地 server 在跑：npm start 或 node server.js）
 * 用法：node tests/manual/visualizer-modes-smoke.cjs
 * 逐模式 apply → 1.4s 渲染帧 → 收集 pageerror → 退出。任何模式首帧抛错
 *（如 fume 曾有的参数错位 addColorStop NaN）都会在此暴露。
 */
'use strict';
const path = require('node:path');
let chromium;
try { chromium = require('playwright').chromium; }
catch { chromium = require(path.join(process.env.npm_config_prefix || 'D:/nvm/nvm/node_global', 'node_modules/playwright')).chromium; }

const MODES = ['classic', 'fume', 'still', 'cadenza', 'partita', 'pendolo', 'tilt', 'claddagh', 'cappella', 'monet'];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    // Electron preload 桩（纯浏览器环境桌面桥缺失会让部分模块顶层抛错中断拼接 script）
    window.electron = {
      getAutomixModelsPresent: async () => ({}),
      getAutomixModelStatus: async () => ({ models: [], manual: null }),
      onAutomixModelProgress: () => () => {},
      diagMark: () => {},
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    window.lyricsLines = [];
    for (let i = 0; i < 30; i++) window.lyricsLines.push({
      t: i * 4.2, text: '测试歌词行 ' + i + ' 逐字验证文本', duration: 3.8,
      words: [{ text: '测试', t: i * 4.2, d: 1.8 }, { text: '歌词行' + i, t: i * 4.2 + 1.8, d: 2.0 }],
    });
    window.audio = { currentTime: 35, paused: false, duration: 200 };
  });
  let failed = 0;
  for (const mode of MODES) {
    const before = errors.length;
    const applied = await page.evaluate((m) => {
      const fn = window['apply' + m.charAt(0).toUpperCase() + m.slice(1) + 'Mode'];
      if (typeof fn !== 'function') return 'applyFn missing';
      try { fn(true, { save: false }); return 'OK'; } catch (e) { return 'throw: ' + e.message; }
    }, mode);
    await page.waitForTimeout(1400);
    const newErrs = errors.slice(before).filter((e) => !e.includes('net::') && !e.includes('Failed to load'));
    const line = mode + ': apply=' + applied + ' 异常=' + (newErrs.length ? newErrs[0] : '无');
    console.log(line);
    if (applied !== 'OK' || newErrs.length) failed += 1;
    await page.evaluate((m) => {
      const fn = window['apply' + m.charAt(0).toUpperCase() + m.slice(1) + 'Mode'];
      try { if (fn) fn(false, { save: false }); } catch (e) { /* 退出异常不阻断下一模式 */ }
    }, mode);
    await page.waitForTimeout(200);
  }
  await browser.close();
  if (failed) { console.error(failed + ' 个模式未通过'); process.exit(1); }
  console.log('ALL MODES PASS');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
