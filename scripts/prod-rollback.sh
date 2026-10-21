#!/bin/bash
# ============================================================
# 生产一键回滚 #20260902-1530
# 用途：把生产 quote-app 切回任意一个历史备份，并重启 + 自检
#
# 用法（在 WSL 中执行）：
#   bash scripts/prod-rollback.sh                        # 回滚到最新备份
#   bash scripts/prod-rollback.sh quote-app.bak-20260902-135641   # 指定备份名
#   bash scripts/prod-rollback.sh --list                 # 只列出可用备份
#
# 策略：
#   - 用 cp -a 复制备份到 quote-app.rollback（不动原始备份，可反复回滚）
#   - 保留当前目录的 .git 与 .env.production（服务器唯一可信生产配置）
#   - 原子 mv 切换 + pm2 restart --update-env + 本地/公网自检
#
# 可用环境变量覆盖：SSH_USER / SERVER_HOST / REMOTE_BASE_DIR / APP_NAME / APP_PORT
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH}"

SSH_USER="${SSH_USER:-ubuntu}"
SERVER_HOST="${SERVER_HOST:-193.112.123.218}"
SSH_DEST="${SSH_USER}@${SERVER_HOST}"
REMOTE_BASE_DIR="${REMOTE_BASE_DIR:-/home/ubuntu/apps/quote-project}"
APP_NAME="${APP_NAME:-quote-app}"
APP_PORT="${APP_PORT:-5000}"

ARG="${1:-}"

if [ "$ARG" = "--list" ]; then
  info "可用备份（服务器 $SSH_DEST）："
  ssh -o ConnectTimeout=10 "$SSH_DEST" "ls -dt ${REMOTE_BASE_DIR}/${APP_NAME}.bak-* 2>/dev/null | head -10"
  exit 0
fi

if [ -n "$ARG" ]; then
  case "$ARG" in
    /*) REMOTE_BK="$ARG" ;;
    *)  REMOTE_BK="${REMOTE_BASE_DIR}/${ARG}" ;;
  esac
else
  REMOTE_BK=$(ssh -o ConnectTimeout=10 "$SSH_DEST" "ls -dt ${REMOTE_BASE_DIR}/${APP_NAME}.bak-* 2>/dev/null | head -1")
  [ -n "$REMOTE_BK" ] || err "服务器上未找到任何 ${APP_NAME}.bak-* 备份"
  info "自动选择最新备份：$REMOTE_BK"
fi

TS=$(date +%Y%m%d-%H%M%S)
LOCAL_SCRIPT="/tmp/remote-rollback-${TS}.sh"
REMOTE_SCRIPT="/tmp/remote-rollback-${TS}.sh"

cat > "$LOCAL_SCRIPT" <<EOF
#!/bin/bash
# 自动生成的远程回滚脚本 ${TS}（本地展开 + 远程解析，绕过 SSH 引号剥离）
set -euo pipefail
cd "${REMOTE_BASE_DIR}"
APP="${APP_NAME}"
PORT="${APP_PORT}"
TS="${TS}"
BK="${REMOTE_BK}"

echo "=== [1] 校验备份可用性 ==="
[ -d "\${BK}" ] || { echo "备份不存在: \${BK}"; exit 1; }
[ -f "\${BK}/server.js" ] || { echo "备份缺少 server.js，不可用于回滚"; exit 1; }
[ -d "\${BK}/.next-production" ] || { echo "备份缺少 .next-production，不可用于回滚"; exit 1; }
echo "BUILD_ID: \$(cat \${BK}/.next-production/BUILD_ID 2>/dev/null || echo N/A)"
echo "static/chunks: \$(ls \${BK}/.next-production/static/chunks 2>/dev/null | wc -l)"

echo "=== [2] 复制备份 → \${APP}.rollback（保留原始备份）==="
rm -rf \${APP}.rollback
cp -a "\${BK}" \${APP}.rollback

echo "=== [3] 继承 .env.production（#20260902-1530：不再继承 .git，防污染残留）==="
if [ -d \${APP}/.git ]; then
  echo "⚠️ 当前 \${APP} 含 .git（疑似 git 污染残留），回滚将不再携带 .git"
fi
if [ -f \${APP}/.env.production ]; then
  cp \${APP}/.env.production \${APP}.rollback/.env.production && echo ".env.production 已继承"
elif [ -f "${REMOTE_BASE_DIR}/.env.production" ]; then
  cp "${REMOTE_BASE_DIR}/.env.production" \${APP}.rollback/.env.production && echo ".env.production 已从上层恢复"
else
  echo "⚠️ 未找到任何 .env.production，服务可能无法启动配置相关功能"
fi

echo "=== [4] 回滚前自检 ==="
[ -f \${APP}.rollback/server.js ] || { echo "回滚目录缺少 server.js"; exit 1; }
[ -d \${APP}.rollback/node_modules ] || { echo "回滚目录缺少 node_modules"; exit 1; }

echo "=== [5] 原子切换：\${APP} → \${APP}.broken-\${TS} ==="
mv \${APP} \${APP}.broken-\${TS}
mv \${APP}.rollback \${APP}

echo "=== [6] pm2 restart \${APP} --update-env ==="
pm2 restart \${APP} --update-env
sleep 6
pm2 list | grep \${APP} || true

echo "=== [7] 健康检查 ==="
curl -s -o /dev/null -w "local /register: %{http_code}\n" --max-time 15 http://127.0.0.1:\${PORT}/register
curl -s -o /dev/null -w "local /api/health: %{http_code}\n" --max-time 15 http://127.0.0.1:\${PORT}/api/health

echo "=== [8] 补建 .deploy-lock 保护标记（#20260902-1530 P0 防护）==="
if [ ! -f \\${APP}/.deploy-lock ]; then
  echo '# 生产部署目录保护标记（禁止 git clone/init/pull）' > \\${APP}/.deploy-lock
fi
chmod 444 \\${APP}/.deploy-lock
echo ".deploy-lock: \\$(ls -la \\${APP}/.deploy-lock)"
echo "=== REMOTE_ROLLBACK_DONE ==="
EOF
chmod +x "$LOCAL_SCRIPT"

info "上传回滚脚本 → ${SSH_DEST}:${REMOTE_SCRIPT}"
scp -o ConnectTimeout=15 "$LOCAL_SCRIPT" "${SSH_DEST}:${REMOTE_SCRIPT}"

info "执行远程回滚 ..."
ssh -o ConnectTimeout=20 "$SSH_DEST" "bash ${REMOTE_SCRIPT}"

rm -f "$LOCAL_SCRIPT"

echo
ok "回滚执行完毕，请执行：bash scripts/verify-deployment.sh ${SSH_DEST}"
