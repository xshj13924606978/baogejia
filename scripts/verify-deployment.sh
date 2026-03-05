#!/bin/bash

# ============================================================================
# 部署验证脚本
# ============================================================================

echo "🔍 验证部署..."
echo "========================"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 1. 检查服务是否运行
echo "1️⃣  检查服务状态..."
if pgrep -f "next" > /dev/null; then
    echo -e "  ${GREEN}✅ Next.js 服务运行中${NC}"
else
    echo -e "  ${RED}❌ Next.js 服务未运行${NC}"
    exit 1
fi

# 2. 检查端口
echo "2️⃣  检查端口监听..."
if ss -tlnp | grep -q ":5000"; then
    echo -e "  ${GREEN}✅ 端口 5000 监听中${NC}"
else
    echo -e "  ${RED}❌ 端口 5000 未监听${NC}"
    exit 1
fi

# 3. 测试健康检查API
echo "3️⃣  测试健康检查API..."
HEALTH_RESPONSE=$(curl -s http://localhost:5000/api/health)
if [[ $HEALTH_RESPONSE == *"healthy"* ]]; then
    echo -e "  ${GREEN}✅ 健康检查通过${NC}"
else
    echo -e "  ${RED}❌ 健康检查失败${NC}"
    echo "响应: $HEALTH_RESPONSE"
fi

# 4. 测试首页访问
echo "4️⃣  测试首页访问..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000)
if [ $HTTP_CODE -eq 200 ]; then
    echo -e "  ${GREEN}✅ 首页可访问 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "  ${RED}❌ 首页访问失败 (HTTP $HTTP_CODE)${NC}"
fi

# 5. 检查环境变量
echo "5️⃣  检查环境变量..."
if [ -f .env.production ]; then
    echo -e "  ${GREEN}✅ .env.production 存在${NC}"
    
    # 检查关键变量（不显示值）
    if grep -q "NEXT_PUBLIC_SUPABASE_URL" .env.production; then
        echo -e "  ${GREEN}  ✅ NEXT_PUBLIC_SUPABASE_URL 已设置${NC}"
    else
        echo -e "  ${RED}  ❌ NEXT_PUBLIC_SUPABASE_URL 未设置${NC}"
    fi
else
    echo -e "  ${RED}❌ .env.production 不存在${NC}"
fi

# 6. 检查日志
echo "6️⃣  检查日志文件..."
if [ -d logs ]; then
    echo -e "  ${GREEN}✅ 日志目录存在${NC}"
    
    if [ -f logs/pm2/out.log ]; then
        echo -e "  ${GREEN}  ✅ 输出日志存在${NC}"
    fi
    
    if [ -f logs/pm2/err.log ]; then
        echo -e "  ${GREEN}  ✅ 错误日志存在${NC}"
        
        # 检查错误日志中是否有异常
        ERROR_COUNT=$(tail -n 50 logs/pm2/err.log | grep -c "Error" || true)
        if [ $ERROR_COUNT -gt 0 ]; then
            echo -e "  ${YELLOW}  ⚠️  发现 $ERROR_COUNT 条错误${NC}"
        fi
    fi
else
    echo -e "  ${YELLOW}  ⚠️  日志目录不存在${NC}"
fi

echo ""
echo "========================"
echo -e "${GREEN}✅ 验证完成${NC}"