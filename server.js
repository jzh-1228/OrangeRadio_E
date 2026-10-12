/* =========================================================================
   OrangeSea · 粒子音乐可视化播放器 — 服务端装配入口
   -------------------------------------------------------------------------
   server.js 现在是「门面/装配层」：从 server/ 目录加载共享状态（context）、
   工具（utils）与各音源/功能路由模块（routes/*），按固定顺序分发给路由
   handler，最后兜底静态资源。对外契约保持不变：
   - module.exports = http.Server 实例（.listening / .once / .close()）
   - server.clearAllLoginCredentials = 全局登出（desktop/main.js 调用）
   - require 时即 listen(PORT, HOST)
   ========================================================================= */
'use strict';

const http = require('http');
const {
  PORT,
  HOST,
  refreshConfiguredCookieStores,
  clearAllRuntimeLoginCredentials,
} = require('./server/context');

// ---------- 路由模块（按分发顺序） ----------
const routeModules = [
  require('./server/routes/system'),
  require('./server/routes/local'),
  require('./server/routes/listen'),
  require('./server/routes/update'),
  require('./server/routes/feedback'),
  require('./server/routes/beatmap'),
  require('./server/routes/discover'),
  require('./server/routes/search'),
  require('./server/routes/spotify'),
  require('./server/routes/qishui'),
  require('./server/routes/kugou'),
  require('./server/routes/qq'),
  require('./server/routes/download'),
  require('./server/routes/podcast'),
  require('./server/routes/netease'),
  require('./server/routes/proxy'),
  require('./server/routes/static'),
];

const server = http.createServer(async (req, res) => {
  refreshConfiguredCookieStores(false);

  // ---- 入口防护（仅回环对端；LAN/远程部署不受影响）----
  // 威胁模型：用户浏览器里的恶意网页操控本机 127.0.0.1:PORT。
  // ① Host 校验切断 DNS rebinding（rebinding 页面的 Host 是攻击者域名）；
  // ② Sec-Fetch-Site 校验切断 no-cors CSRF（跨站 <img>/fetch 会带 cross-site，
  //    同源 fetch/导航是 same-origin/none；该头是浏览器禁改的 forbidden header）；
  // ③ Origin 显式存在且非本服务时拒绝（text/plain 简单请求注入登录态等）。
  // 三者对 curl/老客户端（无这些头）保持放行，向后兼容。
  try {
    const peer = req.socket.remoteAddress || '';
    const isLoopbackPeer = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
    const guardPath = req.url === '/' || req.url.indexOf('/api/') === 0 || req.url.indexOf('/?') === 0;
    if (isLoopbackPeer && guardPath) {
      const hostHeader = String(req.headers.host || '');
      const hostOk = hostHeader === '127.0.0.1:' + PORT || hostHeader === 'localhost:' + PORT;
      const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
      const origin = req.headers.origin ? String(req.headers.origin) : '';
      const originOk = !origin || origin === 'http://127.0.0.1:' + PORT || origin === 'http://localhost:' + PORT;
      if (!hostOk || (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') || !originOk) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'FORBIDDEN_ORIGIN' }));
        return;
      }
    }
  } catch (_) { }

  const url = new URL(req.url, 'http://localhost:' + PORT);
  const pn = url.pathname;

  // 按顺序尝试各路由模块；命中即 return true，全部未命中则落到 static 兜底。
  for (const mod of routeModules) {
    try {
      if (await mod.handle(req, res, url)) return;
    } catch (err) {
      console.error('[Route]', pn, err && (err.stack || err.message || err));
      try {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err && err.message || 'INTERNAL_ERROR' }));
        } else {
          res.end();
        }
      } catch (_) {}
      return;
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log('======================================================');
  console.log(' 粒子音乐可视化 v2  →  http://localhost:' + PORT);
  console.log(' 登录态: ' + (require('./server/context').getUserCookie() ? '已登录(cookie已加载)' : '未登录'));
  console.log('======================================================');
});

server.clearAllLoginCredentials = clearAllRuntimeLoginCredentials;

module.exports = server;
