#!/bin/bash
# 构建脚本：构建失败必须阻断发布，保留调用前的类型引用文件
#
# 构建结束后恢复调用前的 next-env.d.ts，包含未提交的修改。
set -eo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"

# Preserve the caller's exact file, including uncommitted changes.
NEXT_ENV_BACKUP=$(mktemp)
NEXT_ENV_EXISTED=0
if [ -f next-env.d.ts ]; then
  cp -p next-env.d.ts "$NEXT_ENV_BACKUP"
  NEXT_ENV_EXISTED=1
fi
restore_next_env() {
  local status=$?
  trap - EXIT
  if [ "$NEXT_ENV_EXISTED" -eq 1 ]; then
    cp -p "$NEXT_ENV_BACKUP" next-env.d.ts || status=1
  else
    rm -f next-env.d.ts || status=1
  fi
  rm -f "$NEXT_ENV_BACKUP"
  exit "$status"
}
trap restore_next_env EXIT

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --reporter=append-only

# Direct deployment scripts call this file without pnpm's prebuild lifecycle.
# Always enforce the type gate here, even if Next.js skips its internal check.
echo "Checking TypeScript..."
pnpm exec tsc --noEmit

echo "Building the project..."

# 捕获构建输出和退出码（临时禁用 set -e 以允许非零退出码）
set +e
BUILD_OUTPUT=$(NODE_ENV=production npx next build --webpack 2>&1)
BUILD_EXIT=$?
set -e

echo "$BUILD_OUTPUT"

if [ "${BUILD_EXIT}" -ne 0 ]; then
  echo "❌ 构建失败，禁止发布不完整产物。"
  exit "$BUILD_EXIT"
fi

echo "Build completed successfully!"
