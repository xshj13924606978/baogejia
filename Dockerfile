# ============================================================================
# 《报个价》应用 Docker 部署配置
# ============================================================================

# 使用 Node.js 18 作为基础镜像
FROM node:18-alpine AS base

# 安装系统依赖（用于 OCR 和 PDF 处理）
RUN apk add --no-cache \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-data-chi-sim \
    tesseract-ocr-data-eng \
    fontconfig \
    freetype \
    && rm -rf /var/cache/apk/*

# ============================================================================
# 依赖安装阶段
# ============================================================================
FROM base AS deps

WORKDIR /app

# 复制包管理文件
COPY package.json pnpm-lock.yaml ./

# 安装 pnpm
RUN npm install -g pnpm@8

# 安装依赖
RUN pnpm install --frozen-lockfile

# ============================================================================
# 构建阶段
# ============================================================================
FROM base AS builder

WORKDIR /app

# 复制依赖
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 设置环境变量
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

# 构建应用
RUN pnpm run build

# ============================================================================
# 运行阶段
# ============================================================================
FROM base AS runner

WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制必要文件
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 创建临时文件目录
RUN mkdir -p /tmp && chown nextjs:nodejs /tmp

# 切换到非 root 用户
USER nextjs

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# 启动应用
CMD ["node", "server.js"]