#!/bin/bash
# ============================================================
# 生产一键部署入口 #20260902-1530
# 用途：把「构建 → 打包 → 远程部署 → 验证」串成一条可重复执行的命令
#
# 用法（在 WSL 中执行）：
#   bash scripts/prod-start.sh                     # 完整流程：构建 + 部署 + 验证
#   bash scripts/prod-start.sh --skip-build        # 跳过构建，用 release/ 最新包部署
#   bash scripts/prod-start.sh --build-only        # 只构建打包，不部署
#   bash scripts/prod-start.sh release/xxx.tgz     # 指定包部署（自动跳过构建）
#   bash scripts/prod-start.sh --no-rollback       # 验证失败时不自动回滚
#   bash scripts/prod-start.sh --dry-run           # 演练：只构建，部署走 dry-run
#
# 设计原则：
#   1. 构建在【本地 WSL】完成，生产服务器只做「解包 + 原子切换 + 重启」
#      —— 服务器仅 7GB 内存，而构建需 6GB heap（峰值 RSS 12GB），服务器构建必 OOM
#   2. 任何一步失败立即中断，并打印可复制的补救命令
#   3. 部署后验证失败（且未显式关闭）自动回滚到上一个备份
#
# 可用环境变量覆盖：
#   SSH_USER / SERVER_HOST / REMOTE_BASE_DIR / APP_NAME / APP_PORT / PUBLIC_BASE
# ============================================================
set -uo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" >&2; }

# 前置干净 PATH（规避 WSL 继承 Windows PATH 中空格/中文路径导致的解析错误）
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH}"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use --silent default 2>/dev/null || true
fi

# ---------------- 参数 ----------------
PKG=""
DO_BUILD=1
DO_DEPLOY=1
DO_VERIFY=1
AUTO_ROLLBACK="${AUTO_ROLLBACK:-1}"
DRY_RUN=""
for ARG in "$@"; do
  case "$ARG" in
    --skip-build)   DO_BUILD=0 ;;
    --build-only)   DO_DEPLOY=0; DO_VERIFY=0; AUTO_ROLLBACK=0 ;;
    --no-verify)    DO_VERIFY=0; AUTO_ROLLBACK=0 ;;
    --no-rollback)  AUTO_ROLLBACK=0 ;;
    --dry-run)      DRY_RUN="--dry-run" ;;
    --help|-h)      sed -n '2,25p' "$0"; exit 0 ;;
    *)              PKG="$ARG"; DO_BUILD=0 ;;
  esac
done

SSH_USER="${SSH_USER:-ubuntu}"
SERVER_HOST="${SERVER_HOST:-193.112.123.218}"
SSH_DEST="${SSH_USER}@${SERVER_HOST}"
REMOTE_BASE_DIR="${REMOTE_BASE_DIR:-/home/ubuntu/apps/quote-project}"
APP_NAME="${APP_NAME:-quote-app}"
STEP="init"

on_error() {
  fail "步骤 [$STEP] 失败，部署中止。"
  echo
  echo -e "${YELLOW}补救建议：${NC}"
  echo "  1) 查看上方错误输出"
  echo "  2) 回滚到上一个备份： bash scripts/prod-rollback.sh"
  echo "  3) 仅重新部署（不重新构建）： bash scripts/prod-start.sh --skip-build"
  exit 1
}
trap on_error ERR

echo -e "${BLUE}================ 生产部署开始 $(date '+%F %T') ================${NC}"

# ---------------- [0/4] 环境预检 ----------------
STEP="环境预检"
info "[$STEP] 检查运行环境与服务器连通性 ..."
[ "$(uname -s)" = "Linux" ] || { fail "必须在 WSL/Linux 中执行（当前：$(uname -s)）"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { fail "未找到 pnpm，请先 nvm use 或安装 pnpm"; exit 1; }
command -v ssh  >/dev/null 2>&1 || { fail "未找到 ssh"; exit 1; }
command -v scp  >/dev/null 2>&1 || { fail "未找到 scp"; exit 1; }

if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH_DEST" "echo ok" >/dev/null 2>&1; then
  fail "SSH 免密登录失败：$SSH_DEST（请检查密钥/known_hosts）"
  exit 1
fi
ok "服务器可达：$SSH_DEST"

# --- P0 防护（#20260902-1530）：部署前检查远端部署目标目录状态 ---
# 正常部署产物目录：含 server.js / .deploy-lock，不含 .git。
# 曾因 2026-09-02 15:17 在服务器直接 git clone 覆盖 quote-app（变为仅含 .gitignore 的空仓库）导致宕机。
STEP="部署目标守卫检查"
REMOTE_GUARD=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH_DEST" "
  cd ${REMOTE_BASE_DIR} 2>/dev/null || { echo ERR_CD; exit 0; }
  [ -d ${APP_NAME}/.git ] && echo HAS_GIT || echo NO_GIT
  [ -f ${APP_NAME}/.deploy-lock ] && echo HAS_LOCK || echo NO_LOCK
  [ -f ${APP_NAME}/server.js ] && echo HAS_SERVER || echo NO_SERVER
" 2>&1)
if echo "$REMOTE_GUARD" | grep -q "HAS_GIT"; then
  fail "远端 ${APP_NAME} 含 .git（疑似被 git clone/init 污染），拒绝部署。"
  fail "处置：先执行 bash scripts/prod-rollback.sh 回滚恢复，禁止在运行目录直接 git 操作"
  exit 1
fi
if ! echo "$REMOTE_GUARD" | grep -q "HAS_SERVER"; then
  fail "远端 ${APP_NAME} 缺少 server.js（目录状态异常），拒绝部署。"
  fail "处置：先执行 bash scripts/prod-rollback.sh 回滚恢复"
  exit 1
fi
if echo "$REMOTE_GUARD" | grep -q "NO_LOCK"; then
  warn "远端 ${APP_NAME}/.deploy-lock 缺失，自动补建保护标记 ..."
  ssh -o ConnectTimeout=10 "$SSH_DEST" "echo '# 生产部署目录保护标记（禁止 git clone/init/pull）' > ${REMOTE_BASE_DIR}/${APP_NAME}/.deploy-lock && chmod 444 ${REMOTE_BASE_DIR}/${APP_NAME}/.deploy-lock"
fi
ok "远端部署目标状态正常（无 .git，含 .deploy-lock/server.js）"

# 磁盘空间（部署包约 60MB，本地构建需要更多）
AVAIL_KB=$(df -Pk . | awk 'NR==2{print $4}')
if [ "$AVAIL_KB" -lt $((3*1024*1024)) ]; then
  warn "本地可用磁盘不足 3GB（当前 $((AVAIL_KB/1024))MB），构建可能失败"
else
  ok "本地磁盘充足（$((AVAIL_KB/1024/1024))GB）"
fi

# 代码状态提示（构建打包的是【工作区当前内容】）
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  HEAD_SHA=$(git rev-parse --short HEAD)
  DIRTY=$(git status --porcelain | wc -l)
  info "代码状态：分支=$BRANCH  HEAD=$HEAD_SHA  未提交文件数=$DIRTY"
  [ "$DIRTY" -gt 0 ] && warn "工作区有未提交改动，这些改动【会被打进部署包】"
fi

# ---------------- [1/4] 构建 + 打包 ----------------
if [ "$DO_BUILD" = "1" ]; then
  STEP="本地构建"
  info "[$STEP] bash scripts/build-production.sh（NODE_OPTIONS=--max-old-space-size=6144）"
  warn "构建期内存占用高：若 WSL 被 OOM 杀死，先在 PowerShell 执行 wsl --shutdown 后重试"
  PKG_OUT=$(bash scripts/build-production.sh 2>&1) || { echo "$PKG_OUT"; false; }
  echo "$PKG_OUT"
  PKG=$(echo "$PKG_OUT" | grep -o 'PKG=[^ ]*' | head -1 | cut -d= -f2)
  [ -n "$PKG" ] && [ -f "$PKG" ] || { fail "未解析到部署包路径"; exit 1; }
fi

if [ -z "$PKG" ]; then
  PKG=$(ls -t release/quote-standalone-*.tgz 2>/dev/null | head -1 || true)
  [ -n "$PKG" ] || { fail "未找到部署包，请先执行 bash scripts/build-production.sh"; exit 1; }
  info "使用现有最新部署包：$PKG"
fi
ok "部署包：$PKG（$(du -h "$PKG" | cut -f1)）"

# ---------------- [2/4] 远程部署 ----------------
if [ "$DO_DEPLOY" = "1" ]; then
  STEP="远程部署"
  info "[$STEP] bash scripts/deploy-remote.sh $PKG $DRY_RUN"
  bash scripts/deploy-remote.sh "$PKG" $DRY_RUN
fi

if [ -n "$DRY_RUN" ]; then
  warn "--dry-run 模式：未执行远程部署，跳过验证"
  exit 0
fi

# ---------------- [3/4] 部署后验证 ----------------
VERIFY_RC=0
if [ "$DO_VERIFY" = "1" ]; then
  STEP="部署验证"
  info "[$STEP] bash scripts/verify-deployment.sh $SSH_DEST"
  bash scripts/verify-deployment.sh "$SSH_DEST" || VERIFY_RC=$?
fi

# ---------------- [4/4] 结果处理 ----------------
echo
if [ "$VERIFY_RC" -eq 0 ] && [ "$DO_VERIFY" = "1" ]; then
  ok "🎉 部署完成并通过全部验证（$(date '+%F %T')）"
  exit 0
fi

if [ "$DO_VERIFY" != "1" ]; then
  ok "部署流程执行完毕（已跳过验证）"
  exit 0
fi

fail "部署验证未通过（exit=$VERIFY_RC）"
if [ "$AUTO_ROLLBACK" = "1" ]; then
  warn "已开启自动回滚，正在回滚到上一个备份 ..."
  bash scripts/prod-rollback.sh "$SSH_DEST" || fail "回滚失败，请人工介入：ssh $SSH_DEST 'ls -dt /home/ubuntu/apps/quote-project/quote-app.bak-* | head'"
else
  echo -e "${YELLOW}手动回滚：${NC} bash scripts/prod-rollback.sh"
fi
exit 1
