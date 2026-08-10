#!/bin/bash
echo "=== Git 状态 ==="
cd /opt/quote-system
git branch
echo "---"
git log --oneline -1
echo ""
echo "=== Docker 状态 ==="
docker compose ps
echo ""
echo "=== 环境变量检查 ==="
docker exec quote-app env | grep SUPABASE
echo ""
echo "=== 完成 ==="
