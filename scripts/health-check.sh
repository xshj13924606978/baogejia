#!/bin/bash

# 健康检查脚本
URL="http://localhost:3000"
MAX_RETRIES=30
RETRY_INTERVAL=2

echo "开始健康检查: $URL"

for i in $(seq 1 $MAX_RETRIES); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $URL)
  
  if [ $HTTP_CODE -eq 200 ]; then
    echo "✅ 服务正常 (HTTP $HTTP_CODE)"
    exit 0
  else
    echo "⏳ 等待服务启动... ($i/$MAX_RETRIES, HTTP $HTTP_CODE)"
    sleep $RETRY_INTERVAL
  fi
done

echo "❌ 服务启动超时"
exit 1