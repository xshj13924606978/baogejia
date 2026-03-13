#!/bin/bash

echo "🔍 修复所有未使用的 request 参数..."

# 使用更全面的 sed 命令
FILES=$(npx eslint src/ 2>&1 | grep -B1 "request.*is defined but never used" | grep "src/" | sort -u)

while IFS= read -r file; do
    if [ -f "$file" ]; then
        echo "🔧 修复: $file"
        
        # 备份
        cp "$file" "$file.backup"
        
        # 修复所有格式的 request 参数
        # 1. export async function POST(request: NextRequest)
        sed -i 's/\(export async function [A-Z]* (\)request\(: NextRequest\)/\1_request\2/g' "$file"
        
        # 2. export const POST = async (request: NextRequest
        sed -i 's/\(export const [A-Z]* = async (\)request\(: NextRequest\)/\1_request\2/g' "$file"
        
        # 3. async (request: NextRequest, 在箭头函数中
        sed -i 's/async (request: NextRequest, /async (_request: NextRequest, /g' "$file"
        
        # 4. async (request: NextRequest, ... 在箭头函数中（可能更多参数）
        sed -i 's/async (request: NextRequest)/async (_request: NextRequest)/g' "$file"
        
        echo "✅ 完成"
    fi
done <<< "$FILES"

echo ""
echo "🎉 修复完成！"

# 验证
echo ""
echo "🔍 验证修复结果..."
pnpm run type-check 2>&1 | head -20

# 统计
echo ""
echo "📊 重新统计警告数..."
npx eslint src/ 2>&1 | grep "✖.*problems"
