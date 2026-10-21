#!/bin/bash

# ============================================================================
# 部署脚本
# ============================================================================

set -e

echo "🚀 开始部署《报个价》应用..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查环境变量
echo "📋 检查环境变量..."
if [ ! -f .env.production ]; then
    echo -e "${RED}❌ .env.production 文件不存在${NC}"
    exit 1
fi

# 安装依赖
echo "📦 安装依赖..."
pnpm install --frozen-lockfile

# 构建应用
echo "🔨 构建应用..."
pnpm run build

# 检查构建结果
if [ ! -d ".next" ]; then
    echo -e "${RED}❌ 构建失败${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 构建成功${NC}"

# 选择部署方式
echo ""
echo "请选择部署方式:"
echo "1) 直接启动 (PM2)"
echo "2) Docker 部署"
echo "3) Vercel 部署"
read -p "选择 (1-3): " DEPLOY_MODE

case $DEPLOY_MODE in
    1)
        echo "🚀 使用 PM2 启动..."
        
        # 检查 PM2 是否安装
        if ! command -v pm2 &> /dev/null; then
            echo "安装 PM2..."
            npm install -g pm2
        fi
        
        # 创建日志目录
        mkdir -p logs/pm2
        
        # 启动应用
        pm2 start ecosystem.config.js
        
        # 保存 PM2 配置
        pm2 save
        
        # 设置开机自启
        pm2 startup
        
        echo -e "${GREEN}✅ PM2 启动完成${NC}"
        ;;
        
    2)
        echo "🐳 使用 Docker 部署..."
        
        # 检查 Docker 是否安装
        if ! command -v docker &> /dev/null; then
            echo -e "${RED}❌ Docker 未安装${NC}"
            exit 1
        fi
        
        # 构建镜像
        docker build -t quote-app:latest .
        
        # 停止旧容器
        docker stop quote-app || true
        docker rm quote-app || true
        
        # 启动新容器
        docker run -d \
            --name quote-app \
            --restart unless-stopped \
            -p 5000:5000 \
            --env-file .env.production \
            -v $(pwd)/tmp:/tmp \
            -v $(pwd)/logs:/app/logs \
            quote-app:latest
        
        echo -e "${GREEN}✅ Docker 部署完成${NC}"
        ;;
        
    3)
        echo "▲ 使用 Vercel 部署..."
        
        # 检查 Vercel CLI 是否安装
        if ! command -v vercel &> /dev/null; then
            echo "安装 Vercel CLI..."
            npm install -g vercel
        fi
        
        # 部署到 Vercel
        vercel --prod
        
        echo -e "${GREEN}✅ Vercel 部署完成${NC}"
        ;;
        
    *)
        echo -e "${RED}❌ 无效选择${NC}"
        exit 1
        ;;
esac

# 运行健康检查
echo "🏥 运行健康检查..."
./scripts/health-check.sh

echo ""
echo -e "${GREEN}✅ 部署完成！${NC}"
echo "📝 查看日志: tail -f logs/pm2/out.log"