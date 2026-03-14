#!/bin/bash
FEATURE_NAME="protected_20260314_104519"
HASHES_FILE=".protection/${FEATURE_NAME}/hashes.txt"

echo "🔄 恢复保护文件..."
echo "================="

if [ ! -f "$HASHES_FILE" ]; then
  echo "❌ 错误：找不到哈希文件"
  exit 1
fi

RESTORED=0
FAILED=0

while read line; do
  if [[ "$line" == \#* ]] || [ -z "$line" ]; then continue; fi
  expected_hash=$(echo "$line" | awk '{print $1}')
  file=$(echo "$line" | awk '{print $2}')
  
  if [ ! -f "$file" ]; then
    echo "⚠️  文件不存在: $file"
    continue
  fi
  
  current_hash=$(sha256sum "$file" | awk '{print $1}')
  if [ "$expected_hash" != "$current_hash" ]; then
    echo "🔄 正在恢复: $file"
    git checkout "$file"
    if [ $? -eq 0 ]; then
      echo "✅ 已恢复: $file"
      RESTORED=$((RESTORED + 1))
    else
      echo "❌ 恢复失败: $file"
      FAILED=1
    fi
  fi
done < "$HASHES_FILE"

echo "================="
echo "共恢复 $RESTORED 个文件"
[ $FAILED -eq 0 ] && echo "🎉 恢复完成！" || exit 1
