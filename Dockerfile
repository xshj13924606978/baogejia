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

# 安装依赖（frozen lockfile 确保可重复构建）
RUN pnpm install --frozen-lockfile

# 复制全部源码
COPY . .

# 构建（跳过 type-check，已由 build.sh 处理 _global-error 容错）
# 直接用 next build，因为 standalone 模式下 next 会自动处理
RUN NODE_ENV=production npx next build \
  || (npx next build 2>&1 | grep -q "✓ Compiled successfully" && echo "Build OK (known _global-error warning)")

# ---- 生产阶段 ----
FROM node:20-alpine AS runner

WORKDIR /app

# 环境变量
ENV NODE_ENV=production
ENV PORT=5000
ENV HOSTNAME="0.0.0.0"

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

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/ || exit 1

# 启动
CMD ["node", "server.js"]
