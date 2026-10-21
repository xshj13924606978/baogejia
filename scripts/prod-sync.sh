#!/bin/bash
set -e
echo "========================================="
echo " 同步生产服务器到 Git main 分支"
echo "========================================="

cd /opt/quote-system

# 1. 测试 GitHub SSH 连接
echo "[1/5] 测试 GitHub SSH 连接..."
ssh -T git@github.com 2>&1 || true
echo ""

# 2. 拉取 main 分支
echo "[2/5] 拉取 main 分支..."
git fetch origin main
git checkout -B main origin/main
echo "  当前提交: $(git log --oneline -1)"

# 3. 对比本地修改
echo "[3/5] 检查服务器本地修改..."
git status --short | head -20

# 4. 恢复服务器特定配置
echo "[4/5] 恢复服务器配置..."
# 恢复 .env（服务器特定）
git checkout origin/main -- .env 2>/dev/null || echo "  .env 保持本地版本"

# 5. 显示最终状态
echo ""
echo "========================================="
echo " Git 同步完成"
echo " 分支: main"
echo " 最新提交:"
git log --oneline -3
echo ""
echo " Docker 状态:"
docker compose ps
echo "========================================="
