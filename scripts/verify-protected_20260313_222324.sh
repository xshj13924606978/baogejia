#!/bin/bash
FEATURE_NAME="protected_20260313_222324"
HASHES_FILE=".protection/protected_20260313_222324/hashes.txt"

echo "🔍 验证保护文件完整性..."
echo "========================="

if [ ! -f "$HASHES_FILE" ]; then
  echo "❌ 错误：找不到哈希文件: $HASHES_FILE"
  exit 1
fi

FAILED=0
TOTAL=0

while read line; do
  if [[ "$line" == \#* ]] || [ -z "$line" ]; then continue; fi
  TOTAL=$((TOTAL + 1))
  expected_hash=$(echo "$line" | awk '{print $1}')
  file=$(echo "$line" | awk '{print $2}')
  
  if [ ! -f "$file" ]; then
    echo "❌ 文件不存在: $file"
    FAILED=1
    continue
  fi
  
  current_hash=$(sha256sum "$file" | awk '{print $1}')
  if [ "$expected_hash" != "$current_hash" ]; then
    echo "❌ 文件被修改: $file"
    FAILED=1
  else
    echo "✅ 文件正常: $file"
  fi
done < "$HASHES_FILE"

echo "========================="
echo "共检查 $TOTAL 个文件"

if [ $FAILED -eq 0 ]; then
  echo "🎉 所有文件完整！"
  exit 0
else
  echo "⚠️  发现 $((TOTAL - FAILED)) 个文件异常"
  exit 1
fi
