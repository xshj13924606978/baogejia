#!/bin/bash
# ============================================================
# 生产构建脚本 #20260825-OPEX-FIX
# 用途：一键生产构建 + 自动打包（解决 Next.js 16 webpack 构建 OOM）
#
# 用法：bash scripts/build-production.sh
# 产物：release/quote-standalone-<TS>.tgz（含 static + public + worker-script，统一校验）
#
# 说明：
#   - 自动设置 NODE_OPTIONS="--max-old-space-size=6144"（默认 2GB 堆不足 → OOM）
#   - 复用 scripts/build.sh（含 pnpm install，构建失败阻断发布）
#   - 复用 scripts/pack-production.sh（public/static/worker-script 同步 + 打包 + 校验）
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

# 加载 nvm（若已安装），使 pnpm/node 可用
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use --silent default 2>/dev/null || true
fi
command -v pnpm >/dev/null 2>&1 || err "未找到 pnpm，请先安装（nvm 或 corepack）"
command -v node >/dev/null 2>&1 || err "未找到 node"

# --- [1/4] 自动设置构建内存（Next.js 16 webpack OOM 修复）---
info "构建内存: NODE_OPTIONS=--max-old-space-size=6144"
export NODE_OPTIONS="--max-old-space-size=6144"

# --- [2/4] 执行生产构建（复用 build.sh：pnpm install，构建失败阻断发布）---
info "执行 pnpm build ..."
bash scripts/build.sh

# --- [3/4] 验证构建产物 ---
info "验证构建产物 ..."
[ -d ".next-production/standalone" ] || err ".next-production/standalone 缺失，构建未生成 standalone"
[ -f ".next-production/BUILD_ID" ] || err ".next-production/BUILD_ID 缺失"
BUILD_ID=$(cat ".next-production/BUILD_ID")
CHUNKS=$(ls ".next-production/static/chunks" 2>/dev/null | wc -l)
[ "$CHUNKS" -gt 0 ] || err "static/chunks 为空，构建产物异常"
ok "构建产物正常 (BUILD_ID=$BUILD_ID, static/chunks=$CHUNKS)"

# --- [4/4] 打包（复用 pack-production.sh：public/static/worker-script 同步 + 统一校验）---
info "打包发布产物 ..."
PKG_OUT=$(bash scripts/pack-production.sh 2>&1)
echo "$PKG_OUT"
PKG=$(echo "$PKG_OUT" | grep -o 'PKG=[^ ]*' | head -1 | cut -d= -f2)
[ -n "$PKG" ] && [ -f "$PKG" ] || err "未解析到部署包路径"

echo
ok "✅ 生产构建完成！"
echo -e "  ${BLUE}BUILD_ID:${NC} $BUILD_ID"
echo -e "  ${BLUE}部署包:${NC} $PKG"
echo -e "  ${BLUE}下一步:${NC} bash scripts/deploy-remote.sh $PKG"
