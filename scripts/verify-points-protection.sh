#!/bin/bash

echo "🔍 验证积分系统文件完整性..."
echo ""

HASHES_FILE=".protection/points-hashes.txt"
FAILED=0
CHECKED=0

if [ ! -f "$HASHES_FILE" ]; then
  echo "❌ 错误：找不到哈希文件 $HASHES_FILE"
  exit 1
fi

while read line; do
  # 跳过注释行和空行
  if [[ "$line" == \#* ]] || [ -z "$line" ]; then
    continue
  fi

  expected_hash=$(echo "$line" | awk '{print $1}')
  file=$(echo "$line" | awk '{print $2}')

  # 跳过标记为不存在的文件
  if [ "$expected_hash" = "文件不存在:" ]; then
    continue
  fi

  if [ ! -f "$file" ]; then
    echo "❌ 文件不存在: $file"
    FAILED=1
    continue
  fi

  current_hash=$(sha256sum "$file" | awk '{print $1}')
  CHECKED=$((CHECKED + 1))

  if [ "$expected_hash" != "$current_hash" ]; then
    echo "❌ 文件被修改: $file"
    echo "   期望: $expected_hash"
    echo "   当前: $current_hash"
    FAILED=1
  else
    echo "✅ 文件正常: $file"
  fi
done < "$HASHES_FILE"

echo ""
echo "📊 检查统计: $CHECKED 个文件"

if [ $FAILED -eq 0 ]; then
  echo "🎉 所有积分系统文件完整！"
  exit 0
else
  echo "⚠️ 部分文件被修改，请检查是否影响了积分系统功能"
  exit 1
fi
