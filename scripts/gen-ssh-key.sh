#!/bin/bash
set -e
echo "=== 生成 SSH 密钥 ==="
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C "deploy@xs-bj.com"
echo ""
echo "=== 公钥（请添加到 GitHub Deploy Keys）==="
cat ~/.ssh/id_ed25519.pub
echo ""
echo "=== 完成 ==="
