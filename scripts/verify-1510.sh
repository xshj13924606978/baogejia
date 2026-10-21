#!/bin/bash
# 验证生产 chunk 中 1510 修复已生效
ssh -o ConnectTimeout=15 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ubuntu@193.112.123.218 '
CHUNKS=/home/ubuntu/apps/quote-project/quote-app/.next-production/static/chunks
echo "===== 新文案「我已完成支付，点击查询」所在 chunk ====="
grep -rl "我已完成支付，点击查询" $CHUNKS/ 2>/dev/null | head -2
echo "===== 旧文案「我已支付完成」残留检查（应为空） ====="
grep -rl "我已支付完成" $CHUNKS/ 2>/dev/null | head -3
echo "===== 辅助说明文案「自动确认到账」 ====="
grep -rl "自动确认到账" $CHUNKS/ 2>/dev/null | head -2
'
