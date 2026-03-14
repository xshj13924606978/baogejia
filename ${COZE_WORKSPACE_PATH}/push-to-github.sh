#!/bin/bash

# GitHub 自动推送脚本
# 使用方法：bash push-to-github.sh <YOUR_TOKEN>

set -e

REPO="xshj13924606978/quote-system"

if [ -z "$1" ]; then
    echo "❌ 错误：请提供 GitHub Token"
    echo ""
    echo "使用方法："
    echo "  bash push-to-github.sh <YOUR_TOKEN>"
    echo ""
    echo "获取 Token："
    echo "  1. 访问 https://github.com/settings/tokens"
    echo "  2. 点击 'Generate new token (classic)'"
    echo "  3. 选择 'repo' 权限"
    echo "  4. 生成并复制 token"
    exit 1
fi

TOKEN="$1"
echo "🚀 正在推送到 GitHub..."
echo ""

# 获取当前分支
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# 推送到 GitHub
git push https://${TOKEN}@github.com/${REPO}.git ${BRANCH}

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 推送成功！"
else
    echo ""
    echo "❌ 推送失败，请检查 token 是否正确"
    exit 1
fi
