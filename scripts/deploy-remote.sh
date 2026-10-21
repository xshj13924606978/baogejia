#!/bin/bash
# ============================================================
# 远程部署脚本 #20260825-OPEX-FIX
# 用途：一键部署到生产服务器（绕过 WSL SSH 引号剥离问题）
#
# 用法：
#   bash scripts/deploy-remote.sh                            # 自动取 release/ 最新包
#   bash scripts/deploy-remote.sh release/quote-standalone-xxx.tgz
#   bash scripts/deploy-remote.sh --dry-run [PKG]            # 演练：只生成并上传远程脚本，不执行部署
#
# 核心策略：不在命令行直接 ssh "多段命令"（WSL 会剥离双引号导致远程命令错乱），
#           而是「生成本地脚本 → scp 上传 → ssh bash /tmp/remote-deploy-<TS>.sh」。
#
# 服务器连接变量（可用环境变量覆盖，不硬编码）：
#   SSH_USER / SERVER_HOST / REMOTE_BASE_DIR / APP_NAME / APP_PORT
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

# --- 颜色 ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# 前置干净 PATH（规避 WSL 继承 Windows PATH 中空格/中文路径导致的解析错误）
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH}"

# --- 参数解析（支持 --dry-run）---
DRY_RUN=0
PKG=""
for ARG in "$@"; do
  case "$ARG" in
    --dry-run) DRY_RUN=1 ;;
    *) PKG="$ARG" ;;
  esac
done

# --- 服务器连接变量（环境变量可覆盖）---
SSH_USER="${SSH_USER:-ubuntu}"
SERVER_HOST="${SERVER_HOST:-193.112.123.218}"
SSH_DEST="${SSH_USER}@${SERVER_HOST}"
REMOTE_BASE_DIR="${REMOTE_BASE_DIR:-/home/ubuntu/apps/quote-project}"
APP_NAME="${APP_NAME:-quote-app}"
APP_PORT="${APP_PORT:-5000}"

# --- 部署包定位与校验 ---
if [ -z "$PKG" ]; then
  PKG=$(ls -t release/quote-standalone-*.tgz 2>/dev/null | head -1 || true)
  [ -n "$PKG" ] || err "未找到部署包，请先运行 bash scripts/build-production.sh"
  info "自动选择最新部署包: $PKG"
fi
[ -f "$PKG" ] || err "部署包不存在: $PKG"

echo "=== [0/4] 打包统一校验（tar 内 static/chunks 必须 > 0）==="
N=$(tar tzf "$PKG" | grep -c 'static/chunks' || true)
if [ "$N" -le 0 ]; then
  err "打包校验失败：包内 static/chunks=0（可能打包了源码而非 standalone），禁止部署"
fi
ok "打包校验通过: static/chunks=$N"

TS=$(date +%Y%m%d-%H%M%S)
PKG_NAME=$(basename "$PKG")
REMOTE_PKG="/tmp/${PKG_NAME}"
REMOTE_SCRIPT="/tmp/remote-deploy-${TS}.sh"
LOCAL_SCRIPT="/tmp/remote-deploy-${TS}.sh"

echo "=== [1/4] 上传部署包 → ${SSH_DEST}:${REMOTE_PKG} ==="
scp -o ConnectTimeout=15 "$PKG" "${SSH_DEST}:${REMOTE_PKG}"

# --- 生成远程部署脚本（本地变量在此展开，远程变量用 \${} 留待服务器解析）---
cat > "$LOCAL_SCRIPT" << EOF
#!/bin/bash
# 自动生成的远程部署脚本 ${TS}（由 scripts/deploy-remote.sh 生成，绕过 SSH 引号剥离）
set -euo pipefail
cd "${REMOTE_BASE_DIR}"
APP="${APP_NAME}"
PORT="${APP_PORT}"
TS="${TS}"

# --- 部署守卫（#20260902-1530 P0 防护）---
# 正常部署产物目录：含 server.js / .deploy-lock，不含 .git。
# 曾因 2026-09-02 15:17 在服务器直接 git clone 覆盖 quote-app（变为仅含 .gitignore 的空仓库）导致宕机。
if [ -d "\${APP}/.git" ]; then
  echo "❌ 部署守卫：\${APP} 是 Git 仓库（.git 存在），疑似被 git clone/init 污染，拒绝继续"
  echo "   处置：先在本地执行 bash scripts/prod-rollback.sh 回滚恢复"
  exit 1
fi
if [ ! -f "\${APP}/server.js" ]; then
  echo "❌ 部署守卫：\${APP} 缺少 server.js（目录状态异常），拒绝继续"
  echo "   处置：先在本地执行 bash scripts/prod-rollback.sh 回滚恢复"
  exit 1
fi
if [ ! -f "\${APP}/.deploy-lock" ]; then
  echo "⚠️ 部署守卫：\${APP}/.deploy-lock 缺失，自动补建保护标记"
  echo '# 生产部署目录保护标记（禁止 git clone/init/pull）' > "\${APP}/.deploy-lock"
  chmod 444 "\${APP}/.deploy-lock"
fi
echo "=== [0] 部署守卫通过：\${APP} 非 Git 仓库且含 .deploy-lock ==="

echo "=== [1] 备份 .env.production → /tmp/env.bak-\${TS} ==="
cp \${APP}/.env.production /tmp/env.bak-\${TS}

echo "=== [2] 解包到临时目录 \${APP}.new（旧服务无空窗，#20260828-2020） ==="
rm -rf \${APP}.new
mkdir \${APP}.new
tar xzf ${REMOTE_PKG} -C \${APP}.new

echo "=== [3] 恢复 .env.production（服务器唯一可信生产配置） ==="
cp /tmp/env.bak-\${TS} \${APP}.new/.env.production

echo "=== [4] 原子切换（毫秒级）旧版 → \${APP}.bak-\${TS} ==="
mv \${APP} \${APP}.bak-\${TS}
mv \${APP}.new \${APP}

echo "=== [5] 产物校验 ==="
echo "static/chunks: \$(ls \${APP}/.next-production/static/chunks | wc -l)"
echo "BUILD_ID: \$(cat \${APP}/.next-production/BUILD_ID)"

echo "=== [6] pm2 restart \${APP} --update-env ==="
pm2 restart \${APP} --update-env
pm2 status \${APP}

echo "=== [7] 本地健康检查 ==="
sleep 3
curl -s -o /dev/null -w "local /login: %{http_code}\\n" http://127.0.0.1:\${PORT}/login
curl -s -o /dev/null -w "local /register: %{http_code}\\n" http://127.0.0.1:\${PORT}/register
echo "=== REMOTE_DEPLOY_DONE ==="
EOF
chmod +x "$LOCAL_SCRIPT"
ok "远程脚本已生成: $LOCAL_SCRIPT"

echo "=== [2/4] 上传远程脚本 → ${SSH_DEST}:${REMOTE_SCRIPT} ==="
scp -o ConnectTimeout=15 "$LOCAL_SCRIPT" "${SSH_DEST}:${REMOTE_SCRIPT}"

if [ "$DRY_RUN" = "1" ]; then
  warn "--dry-run 模式：跳过执行，远程脚本已就绪"
  ok "可手动执行: ssh ${SSH_DEST} bash ${REMOTE_SCRIPT}"
else
  echo "=== [3/4] 执行远程部署（备份 → 解包 → 恢复 env → pm2 重启）==="
  ssh -o ConnectTimeout=20 "${SSH_DEST}" "bash ${REMOTE_SCRIPT}"
fi

echo "=== [4/4] 清理本地临时脚本 ==="
rm -f "$LOCAL_SCRIPT"
ok "本地临时脚本已清理"

echo
ok "✅ 部署完成！PM2 已重启。"
echo -e "  ${BLUE}下一步:${NC} bash scripts/verify-deployment.sh"
