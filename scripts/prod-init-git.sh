#!/bin/bash
set -e
echo "========================================="
echo " 生产服务器 Git 初始化（版本追踪）"
echo "========================================="

cd /opt/quote-system

# 1. 初始化 Git 并关联远程仓库
echo "[1/3] 初始化 Git 仓库..."
rm -rf .git
git init
git config user.email "deploy@xs-bj.com"
git config user.name "Production Deploy"
git remote add origin git@github.com:xshj13924606978/quote-system.git

# 2. 添加 GitHub 主机密钥（为后续 git pull 做准备）
echo "[2/3] 添加 GitHub SSH 主机密钥..."
mkdir -p ~/.ssh
ssh-keyscan -H github.com >> ~/.ssh/known_hosts 2>/dev/null

# 3. 添加 .gitignore（服务器特定文件）
echo "[3/3] 创建 .gitignore..."

echo "=============================="
echo " Git 仓库已初始化"
echo " 远程仓库: git@github.com:xshj13924606978/quote-system.git"
echo ""
echo " 下一步 - SSH 密钥设置："
echo " 1. 如有 GitHub 个人访问 token，可用 HTTPS"
echo " 2. 或将以下公钥添加到 GitHub Deploy Keys:"
echo "=============================="

# 如果没有 SSH 密钥则生成
if [ ! -f ~/.ssh/id_ed25519 ]; then
    ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C "deploy@xs-bj.com" 2>/dev/null
fi
echo ""
echo "=== 公钥（添加到 GitHub Settings > Deploy Keys）==="
cat ~/.ssh/id_ed25519.pub
echo ""
echo "=== 添加后验证：ssh -T git@github.com ==="
