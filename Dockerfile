# ============================================================
# quote-system 生产环境 Dockerfile
# Next.js 16.2.1 + pnpm 9 + standalone 输出
# ============================================================

# ---- 构建阶段 ----
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 pnpm 9（与项目 packageManager 一致）
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# 复制依赖清单（利用 Docker 缓存层）
COPY package.json pnpm-lock.yaml ./

# 复制 patches 目录（pnpm 安装时需要）
COPY patches ./patches

# 安装依赖（frozen lockfile 确保可重复构建）
# 跳过 puppeteer 自带的 Chromium 下载（几 MB/s 的海外网速会卡 1 小时+）
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN pnpm install --frozen-lockfile

# 复制全部源码
COPY . .

# 构建 Next.js（standalone 模式，跳过 prebuild type-check）
RUN NODE_ENV=production npx next build

# ---- 生产阶段 ----
FROM node:20-alpine AS runner

WORKDIR /app

# 环境变量
ENV NODE_ENV=production
ENV PORT=5000
ENV HOSTNAME="0.0.0.0"

# 安装 Chrome Headless Shell（仅 ~80MB，替代完整 chromium 的 185 个包 500MB+）
# chrome-headless-shell 专为 PDF 生成/截图设计，无需 gtk3/wayland/llvm21 等 GUI 依赖
RUN apk add --no-cache wget unzip \
    nss nspr dbus-libs at-spi2-core cups-libs \
    libdrm libxcomposite libxdamage libxrandr \
    mesa-gbm pango cairo alsa-lib \
    && CHROME_VERSION=$(wget -qO- https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json 2>/dev/null \
      | sed -n 's/.*"Stable"[^}]*"version"[[:space:]]*:[[:space:]]*"\([0-9.]*\)".*/\1/p' | head -1) \
    && echo "Downloading Chrome Headless Shell v${CHROME_VERSION}" \
    && wget -q "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-headless-shell-linux64.zip" -O /tmp/chrome.zip \
    && unzip -q /tmp/chrome.zip -d /opt/ \
    && rm /tmp/chrome.zip \
    && ln -s /opt/chrome-headless-shell-linux64/chrome-headless-shell /usr/bin/chromium-browser \
    && apk del wget unzip

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# 复制 standalone 构建产物
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 复制静态资源
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 复制 public 目录
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 切换到非 root 用户
USER nextjs

# 暴露端口
EXPOSE 5000

# 健康检查（使用 127.0.0.1 避免 Alpine 中 localhost 解析到 IPv6 ::1 导致连接失败）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/ || exit 1

# 启动
CMD ["node", "server.js"]
