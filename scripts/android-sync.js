#!/usr/bin/env node
/* =========================================================================
   OrangeSea · Android 打包前置同步（scripts/android-sync.js）
   -------------------------------------------------------------------------
   产线：Web 版（deploy/web）× Capacitor WebView 壳 = Android APK。
   本脚本做「npm run android:sync」的两件事：
     1) 生成 android-www/index.html —— 壳的本地启动页：
        首启让用户填 Web 服务地址（默认自动探测本机局域网 IP:3000），
        存 localStorage 后直跳服务端（此后同源，/api 不跨域）。
     2) 生成 capacitor.config.json —— appId/appName/webDir；
        传 --url 可把服务地址烧进壳里（server.url，免首启输入）。

   之后在装有 Android Studio（SDK 34+，JDK 17+）的机器上：
     npm i -D @capacitor/cli @capacitor/core @capacitor/android
     npx cap add android          # 首次生成 android/ 原生工程
     npx cap sync android
     cd android && gradlew.bat assembleDebug
     # 产物：android/app/build/outputs/apk/debug/app-debug.apk
   详见 docs/ANDROID.md。
   ========================================================================= */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function lanAddress() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

const args = process.argv.slice(2);
let serverUrl = '';
const urlIdx = args.indexOf('--url');
if (urlIdx >= 0 && args[urlIdx + 1]) serverUrl = args[urlIdx + 1];

if (!serverUrl && process.env.ORANGESEA_SERVER_URL) serverUrl = process.env.ORANGESEA_SERVER_URL;

const defaultUrl = 'http://' + lanAddress() + ':3000';
const target = (serverUrl || defaultUrl).replace(/\/+$/, '');

/* ---------- 1) 壳的本地启动页 ---------- */
const wwwDir = path.join(ROOT, 'android-www');
fs.mkdirSync(wwwDir, { recursive: true });

const loaderHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>OrangeSea</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 18px;
    background: linear-gradient(180deg, #191108, #0d0a08 60%, #090706);
    font-family: system-ui, sans-serif; color: #f2e6d4; padding: 24px;
  }
  .logo { font-size: 26px; font-weight: 700; letter-spacing: 0.06em; }
  .logo b { color: #ff9c6e; }
  .hint { font-size: 13px; color: rgba(242,230,212,0.6); text-align: center; line-height: 1.7; }
  input {
    width: min(360px, 80vw); padding: 12px 14px; font-size: 15px;
    border-radius: 12px; border: 1px solid rgba(255,156,110,0.35);
    background: rgba(24,17,12,0.9); color: #f2e6d4; outline: none; text-align: center;
  }
  button {
    padding: 12px 34px; font-size: 15px; border: none; border-radius: 999px;
    background: #ff9c6e; color: #221208; font-weight: 700; cursor: pointer;
  }
  code { color: #ff9c6e; font-size: 12px; user-select: all; }
</style>
</head>
<body>
  <div class="logo">Orange<b>Sea</b></div>
  <div class="hint">Web 版服务地址（电脑或 NAS 上运行 <code>npm run web</code> 或 Docker 部署）<br>需与手机在同一网络；地址只会在本机保存一次</div>
  <input id="url" placeholder="${target}" value="${target}" enterkeyhint="go">
  <button id="go">进入橘子海</button>
  <div class="hint" id="err" style="color:#ff8f6e"></div>
<script>
  (function () {
    var saved = null;
    try { saved = localStorage.getItem('orangesea-server'); } catch (e) {}
    function normalize(v) { v = String(v || '').trim().replace(/\\/+$/, ''); return /^https?:\\/\\//.test(v) ? v : ''; }
    function enter(v) {
      var url = normalize(v);
      if (!url) { document.getElementById('err').textContent = '地址要以 http:// 或 https:// 开头'; return; }
      try { localStorage.setItem('orangesea-server', url); } catch (e) {}
      location.replace(url + '/');
    }
    if (saved && normalize(saved)) { location.replace(normalize(saved) + '/'); return; }
    document.getElementById('go').addEventListener('click', function () { enter(document.getElementById('url').value); });
    document.getElementById('url').addEventListener('keydown', function (e) { if (e.key === 'Enter') enter(this.value); });
  })();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(wwwDir, 'index.html'), loaderHtml, 'utf8');

/* ---------- 2) capacitor.config.json ---------- */
const capConfig = {
  appId: 'com.orangesea.app',
  appName: 'OrangeSea',
  webDir: 'android-www',
  android: {
    allowMixedContent: false
  }
};
if (serverUrl) capConfig.server = { url: target, cleartext: /^http:\/\//.test(target) };
fs.writeFileSync(path.join(ROOT, 'capacitor.config.json'), JSON.stringify(capConfig, null, 2) + '\n', 'utf8');

console.log('[android-sync] 启动页 → android-www/index.html');
console.log('[android-sync] 配置 → capacitor.config.json' + (serverUrl ? '（server.url=' + target + '）' : '（首启由用户输入地址，默认探测 ' + defaultUrl + '）'));
console.log('[android-sync] 下一步（需 Android Studio / SDK 34+ / JDK 17+）：');
console.log('  npm i -D @capacitor/cli @capacitor/core @capacitor/android');
console.log('  npx cap add android && npx cap sync android');
console.log('  cd android && gradlew.bat assembleDebug   # 产物 app/build/outputs/apk/debug/app-debug.apk');
