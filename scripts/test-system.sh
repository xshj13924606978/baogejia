#!/bin/bash

# ============================================================================
# 系统测试脚本
# ============================================================================

set -e

echo "🔍 开始系统测试..."
echo "========================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 测试计数器
TESTS_TOTAL=0
TESTS_PASSED=0

# 测试函数
test_command() {
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    if command -v $1 &> /dev/null; then
        echo -e "  ${GREEN}✅ $1 已安装${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "  ${RED}❌ $1 未安装${NC}"
    fi
}

test_api() {
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    local url=$1
    local expected=$2
    local response=$(curl -s -o /dev/null -w "%{http_code}" $url)
    
    if [ "$response" == "$expected" ]; then
        echo -e "  ${GREEN}✅ $url (HTTP $response)${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "  ${RED}❌ $url (HTTP $response, 期望 $expected)${NC}"
    fi
}

test_file() {
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    if [ -f "$1" ]; then
        echo -e "  ${GREEN}✅ $1 存在${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "  ${RED}❌ $1 不存在${NC}"
    fi
}

echo ""
echo "📦 1. 检查系统工具"
echo "---------------------"
test_command pdftotext
test_command tesseract
test_command gs
test_command convert
test_command node
test_command npm
test_command pnpm

echo ""
echo "📁 2. 检查关键文件"
echo "---------------------"
test_file ".env.production"
test_file "next.config.js"
test_file "package.json"
test_file "src/lib/server-utils.ts"
test_file "src/utils/ocr-helper.ts"

echo ""
echo "🌐 3. 检查服务状态"
echo "---------------------"
if pgrep -f "next" > /dev/null; then
    echo -e "  ${GREEN}✅ Next.js 服务运行中${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "  ${YELLOW}⚠️  Next.js 服务未运行${NC}"
fi
TESTS_TOTAL=$((TESTS_TOTAL + 1))

if ss -tlnp | grep -q ":5000"; then
    echo -e "  ${GREEN}✅ 端口 5000 监听中${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "  ${RED}❌ 端口 5000 未监听${NC}"
fi
TESTS_TOTAL=$((TESTS_TOTAL + 1))

echo ""
echo "🔌 4. 测试 API 端点"
echo "---------------------"
test_api "http://localhost:5000/api/health" "200"
test_api "http://localhost:5000/api/products" "200"

echo ""
echo "📊 测试结果汇总"
echo "========================"
echo -e "通过: ${GREEN}$TESTS_PASSED${NC} / $TESTS_TOTAL"

if [ $TESTS_PASSED -eq $TESTS_TOTAL ]; then
    echo -e "${GREEN}✅ 所有测试通过！${NC}"
    exit 0
else
    echo -e "${RED}❌ 部分测试失败，请检查${NC}"
    exit 1
fi