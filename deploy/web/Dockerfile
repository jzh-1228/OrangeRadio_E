# OrangeSea Web 版容器（参照 folia-major deploy/docker 的后端镜像形态）
# 构建上下文必须是仓库根目录：
#   docker build -f deploy/web/Dockerfile -t orangesea-web .
# 运行：
#   docker run -d -p 3000:3000 -v orangesea-data:/app/data orangesea-web
# 音源凭据经 COOKIE_FILE* 环境变量统一写进 /app/data（卷挂载点），与代码隔离。

FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# 先装依赖（层缓存：package*.json 不变则跳过）
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund \
  || npm install --omit=dev --no-audit --no-fund

# 应用本体：服务端 + 前端静态资源（无构建步骤的原生 JS 架构）
COPY server.js ./
COPY server ./server
COPY public ./public

# 凭据与运行时数据独立目录（卷挂载点）；路径经 server/context 的既有环境变量指过去
RUN mkdir -p /app/data
ENV PORT=3000 \
    COOKIE_FILE=/app/data/.cookie \
    QQ_COOKIE_FILE=/app/data/.qq-cookie \
    KUGOU_COOKIE_FILE=/app/data/.kugou-cookie \
    QISHUI_COOKIE_FILE=/app/data/.qishui-cookie \
    MINERADIO_UPDATE_DIR=/app/data/updates

EXPOSE 3000
CMD ["node", "server.js"]
