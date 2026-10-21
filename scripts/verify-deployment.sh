#!/bin/bash
# ============================================================
# 部署验证脚本 #20260825-OPEX-FIX（标准化 7 项检查）
# 用途：部署后一键验证——公网访问立即生效，显示最新版本页面
# 用法：
#   bash scripts/verify-deployment.sh                 # 默认生产服务器
#   bash scripts/verify-deployment.sh ubuntu@IP       # 指定服务器
#
# 7 项检查：
#   1. 本机构建产物（BUILD_ID + static/chunks > 0）
#   2. 服务器 pm2 quote-app 在线
#   3. 服务器 BUILD_ID 与本机一致
#   4. 服务器本地 5000 可访问
#   5. 公网 register/login 200
#   6. 公网 /admin/points-rules 可访问
#   7. 静态资源为最新版本（register/login chunk 与本地一致）
#
# 依赖：本机已 build（.next-production/）、可 ssh 免密登录生产服务器
# ============================================================
# 注：本脚本刻意不启用 set -e —— 需跑完全部 7 项后统一汇总失败项，
#     单项失败用 FAIL 计数收集，最终按汇总结果退出。
set -uo pipefail

# 前置干净 PATH（规避 WSL 继承 Windows PATH 中空格/中文路径导致的解析错误）
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH}"
# 加载 nvm（若已安装），使 node 可用（解析 pm2 jlist 用）
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use --silent default 2>/dev/null || true
fi

# --- 颜色 ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

SERVER_HOST="${1:-ubuntu@193.112.123.218}"
PUBLIC_BASE="${PUBLIC_BASE:-https://xs-bj.com}"
PROJ_DIR="${PROJ_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
REMOTE_APP="${REMOTE_APP:-/home/ubuntu/apps/quote-project/quote-app}"
CHUNK_REGISTER_PREFIX="app/register/page-"
CHUNK_LOGIN_PREFIX="app/login/page-"

FAIL=0
TOTAL=7
pass() { echo -e "${GREEN}✅ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; FAIL=$((FAIL+1)); }

echo -e "${BLUE}🔍 部署验证开始 ($(date '+%F %T')) 服务器: $SERVER_HOST${NC}"

# ---------- 1. 本机构建产物（BUILD_ID + static/chunks > 0） ----------
if [ -f "$PROJ_DIR/.next-production/BUILD_ID" ]; then
  LOCAL_BUILD_ID=$(cat "$PROJ_DIR/.next-production/BUILD_ID")
  LOCAL_CHUNKS=$(ls "$PROJ_DIR/.next-production/static/chunks" 2>/dev/null | wc -l)
  if [ "$LOCAL_CHUNKS" -gt 0 ]; then
    pass "本机构建产物存在 (BUILD_ID=$LOCAL_BUILD_ID, static/chunks=$LOCAL_CHUNKS)"
  else
    fail "本机 static/chunks 为空，构建产物异常"
    exit 1
  fi
else
  fail "本机构建产物缺失 ($PROJ_DIR/.next-production/BUILD_ID)"
  echo -e "${YELLOW}⚠️  请先执行 bash scripts/build-production.sh${NC}"
  exit 1
fi

# ---------- 2. 服务器 pm2 进程 ----------
PM2_STATUS=$(ssh -o ConnectTimeout=10 "$SERVER_HOST" "pm2 jlist 2>/dev/null | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const a=JSON.parse(s);const q=a.find(x=>x.name===\"quote-app\");console.log(q?q.pm2_env.status:\"MISSING\")})'")
if [ "$PM2_STATUS" = "online" ]; then
  pass "服务器 pm2 quote-app 在线"
else
  fail "服务器 pm2 quote-app 状态异常: $PM2_STATUS"
fi

# ---------- 3. 服务器构建版本对比 ----------
REMOTE_BUILD_ID=$(ssh -o ConnectTimeout=10 "$SERVER_HOST" "cat $REMOTE_APP/.next-production/BUILD_ID 2>/dev/null")
if [ "$REMOTE_BUILD_ID" = "$LOCAL_BUILD_ID" ]; then
  pass "服务器构建版本与本机一致 (BUILD_ID=$LOCAL_BUILD_ID)"
else
  fail "服务器构建版本不一致 (server=$REMOTE_BUILD_ID, local=$LOCAL_BUILD_ID)"
fi

# ---------- 4. 服务器本地 5000 ----------
CODE=$(ssh -o ConnectTimeout=10 "$SERVER_HOST" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/register")
if [ "$CODE" = "200" ]; then
  pass "服务器本地端口 5000 可访问 (register=$CODE)"
else
  fail "服务器本地 5000 异常 (register=$CODE)"
fi

# ---------- 5. 公网可达性 ----------
PUB_REG=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$PUBLIC_BASE/register")
PUB_LOG=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$PUBLIC_BASE/login")
if [ "$PUB_REG" = "200" ] && [ "$PUB_LOG" = "200" ]; then
  pass "公网可访问 (register=$PUB_REG, login=$PUB_LOG)"
else
  fail "公网访问异常 (register=$PUB_REG, login=$PUB_LOG)"
fi

# ---------- 6. 公网积分规则管理页面可访问 ----------
ADMIN_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$PUBLIC_BASE/admin/points-rules")
case "$ADMIN_CODE" in
  200|301|302|307|308)
    pass "公网 /admin/points-rules 可访问 (http=$ADMIN_CODE)"
    ;;
  *)
    fail "公网 /admin/points-rules 异常 (http=$ADMIN_CODE)"
    ;;
esac

# ---------- 7. 静态资源为最新版本（register/login chunk 与本地比对） ----------
PUB_REG_CHUNK=$(curl -s --max-time 25 "$PUBLIC_BASE/register" | grep -oE "${CHUNK_REGISTER_PREFIX}[a-f0-9]+\.js" | head -1)
REG_CHUNK=$(basename "$PUB_REG_CHUNK")
LOCAL_REG_CHUNK=$(ls "$PROJ_DIR/.next-production/static/chunks/app/register/"page-*.js 2>/dev/null | xargs -n1 basename | head -1)
PUB_LOGIN_CHUNK=$(curl -s --max-time 25 "$PUBLIC_BASE/login" | grep -oE "${CHUNK_LOGIN_PREFIX}[a-f0-9]+\.js" | head -1)
LOGIN_CHUNK=$(basename "$PUB_LOGIN_CHUNK")
LOCAL_LOGIN_CHUNK=$(ls "$PROJ_DIR/.next-production/static/chunks/app/login/"page-*.js 2>/dev/null | xargs -n1 basename | head -1)
if [ -n "$REG_CHUNK" ] && [ "$REG_CHUNK" = "$LOCAL_REG_CHUNK" ] && [ -n "$LOGIN_CHUNK" ] && [ "$LOGIN_CHUNK" = "$LOCAL_LOGIN_CHUNK" ]; then
  pass "静态资源为最新版本 (register=$REG_CHUNK, login=$LOGIN_CHUNK)"
else
  fail "静态资源版本异常 (register: public=$REG_CHUNK local=$LOCAL_REG_CHUNK; login: public=$LOGIN_CHUNK local=$LOCAL_LOGIN_CHUNK)"
fi

# ---------- 结果汇总 ----------
echo
if [ "$FAIL" = "0" ]; then
  echo -e "${GREEN}🎉 全部通过！${TOTAL}/${TOTAL}${NC}"
  exit 0
else
  echo -e "${RED}❌ $((TOTAL-FAIL))/${TOTAL} 项检查失败，请查看上方 ❌ 标记。${NC}"
  exit 1
fi
