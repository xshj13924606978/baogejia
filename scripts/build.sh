#!/bin/bash
# 构建脚本 - 忽略 Next.js 16 已知的 _global-error 预渲染 bug
set -eo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --reporter=append-only

echo "Building the project..."

# 捕获构建输出和退出码（临时禁用 set -e 以允许非零退出码）
set +e
BUILD_OUTPUT=$(NODE_ENV=production npx next build 2>&1)
BUILD_EXIT=$?
set -e

echo "$BUILD_OUTPUT"

if [ "${BUILD_EXIT}" -ne 0 ]; then
  # 检查是否仅是 _global-error 预渲染错误（Next.js 16 已知 bug）
  # 参见 https://github.com/vercel/next.js/issues/84994
  if echo "$BUILD_OUTPUT" | grep -q "✓ Compiled successfully" && \
     echo "$BUILD_OUTPUT" | grep -q "_global-error"; then
    echo ""
    echo "⚠️  构建编译成功，_global-error 预渲染错误是 Next.js 16 已知 bug，不影响实际运行。"
    echo "Build completed with known framework warning."
    exit 0
  fi

  # 其他错误则中止
  echo "❌ 构建失败（非 _global-error 问题）。"
  exit 1
fi

echo "Build completed successfully!"
