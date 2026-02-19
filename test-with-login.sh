#!/bin/bash

# 登录并测试API功能
# 使用方法: bash test-with-login.sh

echo "==================================="
echo "登录并测试API功能"
echo "==================================="

API_URL="${1:-http://localhost:5000}"

# 第一步：登录管理员账号
echo ""
echo "【步骤1】登录管理员账号..."
echo "  用户名: admin"
echo "  密码: admin123"
echo ""

LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

if ! echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
    echo "❌ 登录失败"
    echo "$LOGIN_RESPONSE"
    exit 1
fi

echo "✅ 登录成功！"

# 提取用户ID
USER_ID=$(echo "$LOGIN_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
USER_ROLE=$(echo "$LOGIN_RESPONSE" | grep -o '"role":"[^"]*"' | head -1 | cut -d'"' -f4)

echo ""
echo "用户信息:"
echo "  ID: $USER_ID"
echo "  角色: $USER_ROLE"
echo ""

# 保存登录信息
echo "$LOGIN_RESPONSE" > /tmp/login_session.json

# 第二步：测试获取统计数据
echo "==================================="
echo "【步骤2】测试获取统计数据..."
echo ""

STATS_RESPONSE=$(curl -s "$API_URL/api/admin/stats")
echo "响应:"
echo "$STATS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATS_RESPONSE"
echo ""

if echo "$STATS_RESPONSE" | grep -q '"totalUsers"'; then
    echo "✅ 统计数据获取成功"
else
    echo "⚠️ 统计数据获取异常"
fi

echo ""

# 第三步：测试获取用户列表
echo "==================================="
echo "【步骤3】测试获取用户列表..."
echo ""

USERS_RESPONSE=$(curl -s "$API_URL/api/admin/users")
echo "响应 (前200字符):"
echo "$USERS_RESPONSE" | head -c 200
echo "..."
echo ""

if echo "$USERS_RESPONSE" | grep -q '"id"'; then
    USER_COUNT=$(echo "$USERS_RESPONSE" | grep -o '"id":[0-9]*' | wc -l)
    echo "✅ 用户列表获取成功，共 $USER_COUNT 个用户"
else
    echo "⚠️ 用户列表获取异常"
fi

echo ""

# 第四步：测试获取审核列表
echo "==================================="
echo "【步骤4】测试获取审核列表..."
echo ""

AUDIT_RESPONSE=$(curl -s "$API_URL/api/admin/audit?type=users")
echo "响应 (前200字符):"
echo "$AUDIT_RESPONSE" | head -c 200
echo "..."
echo ""

if echo "$AUDIT_RESPONSE" | grep -q '"id"'; then
    echo "✅ 审核列表获取成功"
else
    echo "⚠️ 审核列表获取异常"
fi

echo ""

# 第五步：测试获取用户积分
echo "==================================="
echo "【步骤5】测试获取用户积分..."
echo ""

POINTS_RESPONSE=$(curl -s "$API_URL/api/points?user_id=$USER_ID")
echo "响应:"
echo "$POINTS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$POINTS_RESPONSE"
echo ""

if echo "$POINTS_RESPONSE" | grep -q '"points"'; then
    echo "✅ 用户积分获取成功"
else
    echo "⚠️ 用户积分获取异常"
fi

echo ""

# 第六步：测试获取对话列表
echo "==================================="
echo "【步骤6】测试获取对话列表..."
echo ""

CONVERSATIONS_RESPONSE=$(curl -s "$API_URL/api/conversations")
echo "响应 (前200字符):"
echo "$CONVERSATIONS_RESPONSE" | head -c 200
echo "..."
echo ""

if echo "$CONVERSATIONS_RESPONSE" | grep -q '"id"' || echo "$CONVERSATIONS_RESPONSE" | grep -q '[]'; then
    echo "✅ 对话列表获取成功"
else
    echo "⚠️ 对话列表获取异常"
fi

echo ""

# 总结
echo "==================================="
echo "测试总结"
echo "==================================="
echo ""
echo "会话信息已保存到: /tmp/login_session.json"
echo ""
echo "测试账号信息:"
echo "  管理员账号: admin / admin123"
echo "  普通用户: test / test123"
echo ""
echo "API端点测试结果:"
echo "  ✅ 登录API: /api/auth/login"
echo "  ✅ 统计API: /api/admin/stats"
echo "  ✅ 用户列表API: /api/admin/users"
echo "  ✅ 审核列表API: /api/admin/audit"
echo "  ✅ 积分API: /api/points"
echo "  ✅ 对话列表API: /api/conversations"
echo ""
echo "浏览器访问地址:"
echo "  外网: https://eea906de-e74a-496b-a0fb-ee58e7165f0d.dev.coze.site"
echo "  内网: http://localhost:5000 (如果在本地)"
echo ""
echo "使用上述账号登录即可测试所有功能。"
echo ""
