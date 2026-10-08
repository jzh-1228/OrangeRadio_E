# OrangeSea Web 版部署

> 同一份代码三种宿主：Electron 桌面版（`npm start`）、**Web 版（本文件）**、Android APK 壳（见 `docs/ANDROID.md`）。
> Web 版能力边界：全部在线音源（网易/QQ/酷狗/汽水/Spotify 搜索播放、登录二维码、歌单、歌词、全部视觉模式与主题）可用；
> 桌面专属能力（本地音乐库拖放导入、Automix ONNX 推理/人声分离、桌面歌词/壁纸、全局快捷键、任务栏按钮）自动降级隐藏——
> 前端对 `window.electron` 桥做了全量护栏，纯浏览器零报错（启动 + 烟纸/队列拼贴/流光/雨夜四模式实测）。

## 一、本机快速体验

```bash
npm run web          # = node server.js，默认 http://localhost:3000
PORT=8080 npm run web  # 自定义端口
```

浏览器打开即用；设置/偏好存浏览器 localStorage。音源登录态写在项目根的加密 cookie 文件（`.cookie` 等，AES-256-GCM 机器密钥加密——**换机器部署需重新扫码登录**）。

## 二、Docker 部署（NAS / 服务器）

```bash
# 仓库根目录
docker compose -f deploy/web/docker-compose.yml up -d --build
# 访问 http://<主机IP>:3000
```

要点：

- 镜像见 `deploy/web/Dockerfile`（node:22-slim，无前端构建步骤——原生 JS 架构直接拷 `public/`）。
- 音源凭据经 `COOKIE_FILE`/`QQ_COOKIE_FILE`/`KUGOU_COOKIE_FILE`/`QISHUI_COOKIE_FILE` 环境变量统一写进 `/app/data`（命名卷 `orangesea-data` 持久化）。
- 局域网 HTTP 直连即可；如需公网请上 HTTPS 反代（nginx/caddy），并把 `ALLOWED_ORIGIN` 场景纳入评估（当前服务按同源模型工作）。

## 三、自己管理进程（PM2 / systemd）

```bash
npm ci --omit=dev
PORT=3000 pm2 start server.js --name orangesea-web
```

## 四、与桌面版的关系

| 能力 | 桌面版 | Web 版 |
| --- | --- | --- |
| 在线音源/歌词/视觉模式/主题 | ✅ | ✅ |
| 本地音乐导入 | ✅ | ❌（浏览器无文件系统常驻） |
| Automix ONNX 拍点/人声分离 | ✅（模型下载后） | ❌（自动回退纯 JS 估计器链路的兼容模式） |
| 桌面歌词/壁纸/迷你播放器 | ✅ | ❌（不渲染入口） |
| 数据位置 | Electron userData | 项目根 cookie 文件 + 浏览器 localStorage |
