#!/bin/bash

# 测试登录API的脚本
# 使用方法: bash test-login.sh

echo "==================================="
echo "测试登录功能"
echo "==================================="
echo ""

API_URL="${1:-http://localhost:5000}"

echo "测试管理员登录..."
echo "API地址: $API_URL"
echo ""

# 测试1: 管理员登录
echo "【测试1】管理员账号登录"
echo "  用户名: admin"
echo "  密码: admin123"
echo ""

ADMIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

echo "响应:"
echo "$ADMIN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$ADMIN_RESPONSE"
echo ""

# 检查登录是否成功
if echo "$ADMIN_RESPONSE" | grep -q '"success":true'; then
    echo "✅ 管理员登录成功！"

    # 提取用户信息并保存到文件
    USER_DATA=$(echo "$ADMIN_RESPONSE" | grep -o '"user":{[^}]*}')
    USER_ID=$(echo "$ADMIN_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)

    echo ""
    echo "用户ID: $USER_ID"
    echo ""

    # 保存登录信息到临时文件
    echo "$ADMIN_RESPONSE" > /tmp/login_admin_response.json
    echo "登录信息已保存到: /tmp/login_admin_response.json"
    echo ""
    echo "可以使用以下方式设置用户环境变量:"
    echo "  export USER_ID=$USER_ID"
    echo "  export USER_TOKEN=$(echo "$ADMIN_RESPONSE" | grep -o '"username":"[^"]*"' | head -1 | cut -d'"' -f4)"
else
    echo "❌ 管理员登录失败"
fi

echo ""
echo "==================================="
echo ""

# 测试2: 普通用户登录
echo "【测试2】普通用户账号登录"
echo "  用户名: test"
echo "  密码: test123"
echo ""

TEST_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}')

echo "响应:"
echo "$TEST_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$TEST_RESPONSE"
echo ""

if echo "$TEST_RESPONSE" | grep -q '"success":true'; then
    echo "✅ 普通用户登录成功！"

    TEST_USER_ID=$(echo "$TEST_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
    echo ""
    echo "用户ID: $TEST_USER_ID"
    echo ""

    # 保存登录信息到临时文件
    echo "$TEST_RESPONSE" > /tmp/login_test_response.json
    echo "登录信息已保存到: /tmp/login_test_response.json"
else
    echo "❌ 普通用户登录失败"
fi

echo ""
echo "==================================="
echo ""

# 测试3: 错误密码
echo "【测试3】错误密码测试"
echo "  用户名: admin"
echo "  密码: wrongpassword"
echo ""

ERROR_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrongpassword"}')

echo "响应:"
echo "$ERROR_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$ERROR_RESPONSE"
echo ""

if echo "$ERROR_RESPONSE" | grep -q '"error"'; then
    echo "✅ 错误密码测试通过 - 正确返回错误信息"
else
    echo "❌ 错误密码测试失败"
fi

echo ""
echo "==================================="
echo "测试完成"
echo "==================================="
echo ""
echo "测试账号信息:"
echo "  管理员账号: admin / admin123"
echo "  普通用户: test / test123"
echo ""
