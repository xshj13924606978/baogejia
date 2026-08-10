#!/bin/bash
set -e
echo "========================================="
echo " 部署 main 分支到生产环境"
echo "========================================="

cd /opt/quote-system

# 1. 备份服务器本地配置
echo "[1/5] 备份关键配置文件..."
cp next.config.js /tmp/quote-next-config.js
cp .env /tmp/quote-env
cp docker-compose.yml /tmp/quote-compose.yml 2>/dev/null || true
echo "  完成"

# 2. 拉取最新 main 分支
echo "[2/5] 拉取 origin/main..."
git fetch origin main
git checkout -f main
git reset --hard origin/main
echo "  当前提交: $(git log --oneline -1)"

# 3. 恢复服务器本地配置
echo "[3/5] 恢复本地配置文件..."
cp /tmp/quote-next-config.js next.config.js
cp /tmp/quote-env .env
cp /tmp/quote-compose.yml docker-compose.yml 2>/dev/null || true
echo "  完成"

# 4. 重新构建部署
echo "[4/5] 重新构建 Docker..."
docker compose build --no-cache app
docker compose up -d --no-deps app
docker compose restart nginx
echo "  完成"

# 5. 验证
echo "[5/5] 验证容器状态..."
sleep 5
docker compose ps
echo ""
echo "========================================="
echo " 部署完成"
echo " 当前版本: $(git log --oneline -1)"
echo "========================================="
