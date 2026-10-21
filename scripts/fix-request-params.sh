#!/bin/bash

# 找到所有包含 "request.*is defined but never used" 警告的文件
FILES=$(npx eslint src/ 2>&1 | grep -B1 "request.*is defined but never used" | grep "src/" | sort -u)

echo "🔍 找到需要修复的文件:"
echo "$FILES"
echo ""

# 逐个修复文件
while IFS= read -r file; do
    if [ -f "$file" ]; then
        echo "🔧 修复: $file"
        
        # 备份文件
        cp "$file" "$file.backup"
        
        # 使用 sed 替换未使用的 request 参数
        # 只替换函数参数中的 request 为 _request
        # 格式：export async function POST(request: NextRequest)
        # 或：export async function POST(request: NextRequest, { params }
        sed -i 's/\(export async function [A-Z]* (\)request\(: NextRequest\)/\1_request\2/g' "$file"
        
        # 格式：export const POST = async (request: NextRequest
        sed -i 's/\(export const [A-Z]* = async (\)request\(: NextRequest\)/\1_request\2/g' "$file"
        
        echo "✅ 完成"
    fi
done <<< "$FILES"

echo ""
echo "🎉 所有文件修复完成！"

# 验证修复
echo ""
echo "🔍 验证修复结果..."
pnpm run type-check

# 统计警告数
echo ""
echo "📊 重新统计警告数..."
npx eslint src/ 2>&1 | grep "✖.*problems"
